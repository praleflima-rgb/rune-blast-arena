/**
 * @file paymentSystem.js
 * @description Sistema de Pagamentos em Polygon (POL) para o Rune Blast Arena.
 *
 * REGRAS DE NEGOCIO:
 * - VIP: R$ 30,00 / mes em POL (conversao dinamica via CoinGecko).
 * - Passe de Torneio: R$ 10,00 em POL (conversao dinamica).
 * - Todas as transacoes ocorrem na rede Polygon.
 * - Cotacao do POL e buscada em tempo real antes de cada transacao.
 * - Cache de cotacao: validade de 5 minutos para evitar requisicoes desnecessarias.
 */

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=brl';
const BACKUP_ORACLE = 'https://min-api.cryptocompare.com/data/price?fsym=POL&tsyms=BRL';

export const PAYMENT_PRODUCTS = {
  VIP_MONTHLY: { id: 'vip_monthly', label: 'VIP Mensal', priceInBRL: 30.00, durationDays: 30 },
  TOURNAMENT_PASS: { id: 'tournament_pass', label: 'Passe de Torneio', priceInBRL: 10.00, durationDays: 7 },
};

const RATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export class PaymentSystem {
  constructor(options = {}) {
    this._cachedRate = null;      // BRL por 1 POL
    this._cacheTimestamp = 0;
    this._networkId = options.networkId || '137';  // Polygon Mainnet
    this._walletAddress = options.walletAddress || null;
    this.onTransactionRequested = options.onTransactionRequested || null;
  }

  /**
   * Define o endereco da carteira do jogador.
   * @param {string} address
   */
  setWallet(address) {
    this._walletAddress = address;
  }

  /**
   * Busca a cotacao atual do POL em BRL via CoinGecko.
   * Em caso de falha, tenta a API de backup (CryptoCompare).
   * Usa cache de 5 minutos para evitar abusos de rate limit.
   * @returns {Promise<number>} Valor em BRL de 1 POL
   */
  async fetchPOLRateBRL() {
    const now = Date.now();
    if (this._cachedRate && (now - this._cacheTimestamp) < RATE_CACHE_TTL_MS) {
      return this._cachedRate;
    }

    // Tentativa 1: CoinGecko
    try {
      const res = await fetch(COINGECKO_API);
      if (res.ok) {
        const json = await res.json();
        const rate = json?.['matic-network']?.brl;
        if (rate && rate > 0) {
          this._cachedRate = rate;
          this._cacheTimestamp = now;
          console.log('[PaymentSystem] CoinGecko: 1 POL = R$ ' + rate);
          return rate;
        }
      }
    } catch (e) {
      console.warn('[PaymentSystem] CoinGecko falhou, tentando backup...', e.message);
    }

    // Tentativa 2: CryptoCompare (backup)
    try {
      const res = await fetch(BACKUP_ORACLE);
      if (res.ok) {
        const json = await res.json();
        const rate = json?.BRL;
        if (rate && rate > 0) {
          this._cachedRate = rate;
          this._cacheTimestamp = now;
          console.log('[PaymentSystem] CryptoCompare: 1 POL = R$ ' + rate);
          return rate;
        }
      }
    } catch (e) {
      console.warn('[PaymentSystem] Backup oracle falhou:', e.message);
    }

    // Fallback: usa cache expirado se existir
    if (this._cachedRate) {
      console.warn('[PaymentSystem] Usando cotacao expirada em cache como fallback.');
      return this._cachedRate;
    }

    throw new Error('Nao foi possivel obter a cotacao do POL/BRL. Tente novamente.');
  }

  /**
   * Converte um valor em BRL para POL com base na cotacao atual.
   * @param {number} amountBRL
   * @returns {Promise<{ polAmount: number, rateBRL: number, timestamp: string }>}
   */
  async convertBRLtoPOL(amountBRL) {
    const rateBRL = await this.fetchPOLRateBRL();
    const polAmount = amountBRL / rateBRL;
    return {
      polAmount: parseFloat(polAmount.toFixed(6)),
      rateBRL: parseFloat(rateBRL.toFixed(4)),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Prepara o payload de pagamento para um produto.
   * Retorna o valor exato em POL calculado no momento da chamada.
   *
   * @param {'VIP_MONTHLY'|'TOURNAMENT_PASS'} productKey
   * @returns {Promise<{ product: Object, polAmount: number, rateBRL: number, walletAddress: string, networkId: string, timestamp: string }>}
   */
  async preparePayment(productKey) {
    const product = PAYMENT_PRODUCTS[productKey];
    if (!product) throw new Error('Produto desconhecido: ' + productKey);

    const { polAmount, rateBRL, timestamp } = await this.convertBRLtoPOL(product.priceInBRL);

    const payload = {
      product,
      polAmount,
      rateBRL,
      walletAddress: this._walletAddress,
      networkId: this._networkId,
      timestamp
    };

    console.log('[PaymentSystem] Pagamento preparado: ' + product.id + ' = ' + polAmount + ' POL (1 POL = R$ ' + rateBRL + ')');

    if (typeof this.onTransactionRequested === 'function') {
      await this.onTransactionRequested(payload);
    }

    return payload;
  }

  /**
   * Retorna um resumo legivel das opcoes de pagamento com cotacoes atuais.
   * @returns {Promise<Array<{ productId: string, label: string, priceBRL: number, pricePOL: number, rateBRL: number }>>}
   */
  async getPricingSummary() {
    const rateBRL = await this.fetchPOLRateBRL();
    return Object.values(PAYMENT_PRODUCTS).map((p) => ({
      productId: p.id,
      label: p.label,
      priceBRL: p.priceInBRL,
      pricePOL: parseFloat((p.priceInBRL / rateBRL).toFixed(6)),
      rateBRL: parseFloat(rateBRL.toFixed(4)),
    }));
  }

  /**
   * Invalida o cache de cotacao manualmente (util em testes ou reloads forcados).
   */
  invalidateCache() {
    this._cachedRate = null;
    this._cacheTimestamp = 0;
  }
}
