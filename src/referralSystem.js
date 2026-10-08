/**
 * @file referralSystem.js
 * @description Sistema Indique e Ganhe do Rune Blast Arena.
 *
 * REGRAS DE NEGOCIO:
 *
 * Jogador FREE:
 * - 1 amigo indicado que completou 1a partida => +1 extraTry no rankedSystem.
 * - 10 amigos indicados no mesmo dia (UTC-3) => 1 Passe de Torneio gratis.
 *
 * Indicador VIP / Conversao:
 * - Se o amigo indicado assinar o VIP => indicador recebe 5% de desconto na proxima mensalidade.
 *
 * Anti-Fraude:
 * - Recompensa so e creditada apos o amigo convidado concluir a 1a partida.
 * - Codigo de indicacao unico por jogador (gerado no cadastro).
 * - Indicacoes do mesmo dia rastreadas por eferralsCountToday e eferralDateBRT.
 */

const STORAGE_KEY = 'rba_referral_state_v1';

export const REFERRAL_CONFIG = {
  extraTryPerReferral: 1,                    // tentativas extras por indicacao validada
  dailyReferralsForFreeTournamentPass: 10,   // indicacoes no mesmo dia para passe gratis
  vipConversionDiscountPercent: 5,           // desconto em % na proxima mensalidade VIP
};

export class ReferralSystem {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onSyncRequested] Callback Supabase
   * @param {Function} [options.onGrantExtraTry] Callback para creditar extraTry no RankedSystem
   * @param {Function} [options.onGrantTournamentPass] Callback para conceder Passe de Torneio gratis
   * @param {Function} [options.onGrantVipDiscount] Callback para aplicar desconto VIP ao indicador
   */
  constructor(options = {}) {
    this.onSyncRequested = options.onSyncRequested || null;
    this.onGrantExtraTry = options.onGrantExtraTry || null;
    this.onGrantTournamentPass = options.onGrantTournamentPass || null;
    this.onGrantVipDiscount = options.onGrantVipDiscount || null;

    // Codigo de indicacao do jogador
    this.referralCode = null;

    // Contagem de indicacoes validadas hoje (dia BRT)
    this.referralsCountToday = 0;
    this.referralDateBRT = null;   // 'YYYY-MM-DD' (fuso BRT = UTC-3)

    // Total acumulado de indicacoes validas
    this.referralsTotalCount = 0;

    // Desconto VIP pendente (em %)
    this.referralDiscountPercent = 0;

    // Set de user_ids de amigos que ja validaram (anti-fraude)
    this._validatedFriendIds = new Set();

    this._loadLocalState();
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  // ---- Codigo de indicacao ----

  /**
   * Gera (ou recupera) o codigo de indicacao unico do jogador.
   * Formato: "RBA-" + 8 chars hex aleatorios.
   * @param {string} [userId] Prefixo baseado no userId para maior unicidade
   */
  generateCode(userId) {
    if (this.referralCode) return this.referralCode;
    const prefix = userId ? userId.substring(0, 4).toUpperCase() : 'USER';
    const rand = Math.random().toString(16).substring(2, 10).toUpperCase();
    this.referralCode = 'RBA-' + prefix + '-' + rand;
    this._saveState();
    return this.referralCode;
  }

  // ---- Data BRT ----

  /**
   * Retorna a data atual no fuso BRT (UTC-3) no formato 'YYYY-MM-DD'.
   * @private
   */
  _getTodayBRT() {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return brt.toISOString().split('T')[0];
  }

  /**
   * Garante que o contador diario esteja correto para o dia de hoje.
   * @private
   */
  _ensureDayReset() {
    const today = this._getTodayBRT();
    if (this.referralDateBRT !== today) {
      this.referralsCountToday = 0;
      this.referralDateBRT = today;
    }
  }

  // ---- Validacao de indicacao ----

  /**
   * Chamado quando um amigo convidado conclui a PRIMEIRA partida.
   * Valida a indicacao e distribui as recompensas correspondentes.
   *
   * @param {string} friendUserId ID do amigo que acabou de completar a 1a partida
   * @param {boolean} [friendSignedVip=false] Se o amigo assinou o VIP
   * @returns {{ rewards: string[], alreadyValidated: boolean }}
   */
  async validateReferral(friendUserId, friendSignedVip = false) {
    if (!friendUserId) return { rewards: [], alreadyValidated: false };

    // Anti-fraude: impede dupla contagem
    if (this._validatedFriendIds.has(friendUserId)) {
      console.warn('[ReferralSystem] Amigo ja foi validado anteriormente.');
      return { rewards: [], alreadyValidated: true };
    }

    this._validatedFriendIds.add(friendUserId);
    this._ensureDayReset();

    const rewards = [];

    // 1. +1 tentativa extra no Ranked
    this.referralsCountToday += 1;
    this.referralsTotalCount += 1;

    if (typeof this.onGrantExtraTry === 'function') {
      await this.onGrantExtraTry(REFERRAL_CONFIG.extraTryPerReferral);
    }
    rewards.push('+' + REFERRAL_CONFIG.extraTryPerReferral + ' tentativa extra no Ranked');

    // 2. Se atingiu 10 indicacoes no mesmo dia => Passe de Torneio gratis
    if (this.referralsCountToday >= REFERRAL_CONFIG.dailyReferralsForFreeTournamentPass) {
      const milestone = REFERRAL_CONFIG.dailyReferralsForFreeTournamentPass;
      // Concede apenas 1 passe por dia (na primeira vez que atinge o marco)
      if (this.referralsCountToday === milestone) {
        if (typeof this.onGrantTournamentPass === 'function') {
          await this.onGrantTournamentPass();
        }
        rewards.push('Passe de Torneio GRATIS (' + milestone + ' indicacoes no dia!)');
      }
    }

    // 3. Se o amigo assinou VIP => desconto de 5% na proxima mensalidade
    if (friendSignedVip) {
      this.referralDiscountPercent = Math.min(
        100,
        this.referralDiscountPercent + REFERRAL_CONFIG.vipConversionDiscountPercent
      );
      if (typeof this.onGrantVipDiscount === 'function') {
        await this.onGrantVipDiscount(this.referralDiscountPercent);
      }
      rewards.push('+' + REFERRAL_CONFIG.vipConversionDiscountPercent + '% de desconto VIP acumulado (total: ' + this.referralDiscountPercent + '%)');
    }

    this._saveState();
    console.log('[ReferralSystem] Recompensas concedidas:', rewards);
    return { rewards, alreadyValidated: false };
  }

  /**
   * Aplica e zera o desconto VIP acumulado ao processar um pagamento VIP.
   * @returns {{ discountApplied: number, finalPriceBRL: number }}
   */
  applyVipDiscount(originalPriceBRL) {
    if (this.referralDiscountPercent <= 0) {
      return { discountApplied: 0, finalPriceBRL: originalPriceBRL };
    }
    const discount = parseFloat((originalPriceBRL * (this.referralDiscountPercent / 100)).toFixed(2));
    const finalPrice = parseFloat((originalPriceBRL - discount).toFixed(2));
    this.referralDiscountPercent = 0; // zera apos uso
    this._saveState();
    return { discountApplied: discount, finalPriceBRL: finalPrice };
  }

  // ---- Persistencia ----

  _loadLocalState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          this.referralCode = s.referralCode || null;
          this.referralsCountToday = s.referralsCountToday || 0;
          this.referralDateBRT = s.referralDateBRT || null;
          this.referralsTotalCount = s.referralsTotalCount || 0;
          this.referralDiscountPercent = s.referralDiscountPercent || 0;
          this._validatedFriendIds = new Set(s.validatedFriendIds || []);
          this._ensureDayReset();
        }
      }
    } catch (e) { console.warn('[ReferralSystem] Erro ao ler localStorage:', e); }
  }

  _saveState() {
    const payload = this.exportState();
    try {
      if (this._hasLocalStorage()) localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
    if (typeof this.onSyncRequested === 'function') this.onSyncRequested(payload);
  }

  exportState() {
    return {
      referralCode: this.referralCode,
      referralsCountToday: this.referralsCountToday,
      referralDateBRT: this.referralDateBRT,
      referralsTotalCount: this.referralsTotalCount,
      referralDiscountPercent: this.referralDiscountPercent,
      validatedFriendIds: [...this._validatedFriendIds]
    };
  }

  /**
   * Hidrata estado vindo do Supabase.
   * @param {Object} remoteData
   */
  hydrate(remoteData) {
    if (!remoteData) return;
    if (remoteData.referral_code) this.referralCode = remoteData.referral_code;
    if (remoteData.referrals_count_today !== undefined) this.referralsCountToday = Number(remoteData.referrals_count_today) || 0;
    if (remoteData.referral_date_brt) this.referralDateBRT = remoteData.referral_date_brt;
    if (remoteData.referrals_total_count !== undefined) this.referralsTotalCount = Number(remoteData.referrals_total_count) || 0;
    if (remoteData.referral_discount_percent !== undefined) this.referralDiscountPercent = Number(remoteData.referral_discount_percent) || 0;
    this._ensureDayReset();
    this._saveState();
  }

  getStatus() {
    this._ensureDayReset();
    const needed = REFERRAL_CONFIG.dailyReferralsForFreeTournamentPass;
    return {
      referralCode: this.referralCode,
      referralsCountToday: this.referralsCountToday,
      referralDateBRT: this.referralDateBRT,
      referralsTotalCount: this.referralsTotalCount,
      referralDiscountPercent: this.referralDiscountPercent,
      todayProgressToFreePass: this.referralsCountToday + '/' + needed,
      freePassUnlockedToday: this.referralsCountToday >= needed,
    };
  }
}
