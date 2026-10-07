/**
 * @file vipSystem.js
 * @description Sistema VIP do Rune Blast Arena.
 * 
 * REGRAS DE NEGÓCIO:
 * - Propriedade isVip (boolean) e data de expiração (expiresAt).
 * - Bónus ativos ao ser VIP:
 *   1. +50% de moedas/ouro ao terminar qualquer partida (Campanha, Sobrevivência ou PvP).
 *   2. Recompensas diárias DOBRADAS (2x multiplicador em dailyRewardSystem.js).
 *   3. Acesso prioritário e selo VIP exclusivo no perfil.
 * - Sincronização automática com Supabase (tabela user_profile) e cache no localStorage.
 */

const STORAGE_VIP_KEY = 'rba_vip_state_v2';

export class VipSystem {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.isVip=false]
   * @param {string|number|null} [options.expiresAt=null]
   * @param {Function} [options.onSyncRequested] Disparado para sincronizar com Supabase
   */
  constructor(options = {}) {
    this.onSyncRequested = options.onSyncRequested || null;

    this.isVip = false;
    this.expiresAt = null; // ISO string ou timestamp

    this.listeners = {
      vipStatusChange: []
    };

    this._loadLocalState();

    if (options.isVip !== undefined) {
      this.isVip = !!options.isVip;
      this.expiresAt = options.expiresAt || null;
    }
  }

  /**
   * Registra ouvinte para alterações no status VIP
   * @param {'vipStatusChange'} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try { cb(data); } catch (e) { console.error(`[VipSystem] Erro no listener ${event}:`, e); }
      });
    }
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  /**
   * Carrega estado local salvo
   * @private
   */
  _loadLocalState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_VIP_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.isVip = !!parsed.isVip;
          this.expiresAt = parsed.expiresAt || null;
          this.checkExpiration();
        }
      }
    } catch (e) {
      console.warn('[VipSystem] Falha ao carregar estado local do VIP:', e);
    }
  }

  /**
   * Salva estado no localStorage e notifica persistência
   * @private
   */
  _saveState() {
    const payload = this.exportState();
    try {
      if (this._hasLocalStorage()) {
        localStorage.setItem(STORAGE_VIP_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('[VipSystem] Falha ao salvar estado local do VIP:', e);
    }

    if (typeof this.onSyncRequested === 'function') {
      this.onSyncRequested(payload);
    }

    this._emit('vipStatusChange', this.getStatus());
  }

  /**
   * Exporta estado para persistência local ou remota (Supabase user_profile)
   * @returns {{ isVip: boolean, expiresAt: string|null }}
   */
  exportState() {
    return {
      isVip: this.isVipActive(),
      expiresAt: this.expiresAt
    };
  }

  /**
   * Hidrata o estado a partir do Supabase
   * @param {{ is_vip?: boolean, isVip?: boolean, vip_expires_at?: string|null, expiresAt?: string|null }} data 
   */
  hydrate(data) {
    if (!data) return;

    this.isVip = data.is_vip !== undefined ? !!data.is_vip : (data.isVip !== undefined ? !!data.isVip : false);
    this.expiresAt = data.vip_expires_at !== undefined ? data.vip_expires_at : (data.expiresAt || null);

    this.checkExpiration();
    this._saveState();
  }

  /**
   * Verifica se o prazo do VIP expirou e atualiza status
   * @returns {boolean} Status ativo
   */
  checkExpiration() {
    if (!this.isVip) return false;

    if (!this.expiresAt) {
      // Se não tem data de expiração definida, considera VIP vitalício/ativo
      return true;
    }

    const expTime = new Date(this.expiresAt).getTime();
    if (isNaN(expTime) || Date.now() >= expTime) {
      this.isVip = false;
      this.expiresAt = null;
      return false;
    }

    return true;
  }

  /**
   * Retorna se o VIP está atualmente ativo
   * @returns {boolean}
   */
  isVipActive() {
    return this.checkExpiration();
  }

  /**
   * Ativa ou estende a assinatura VIP por um número de dias (padrão 30 dias)
   * @param {number} [durationInDays=30] 
   * @returns {{ success: boolean, expiresAt: string, isVip: boolean }}
   */
  activateVip(durationInDays = 30) {
    const durationMs = durationInDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let newExpTime = now + durationMs;

    // Se já era VIP e ainda restava tempo, acumula
    if (this.isVip && this.expiresAt) {
      const currentExpTime = new Date(this.expiresAt).getTime();
      if (!isNaN(currentExpTime) && currentExpTime > now) {
        newExpTime = currentExpTime + durationMs;
      }
    }

    this.isVip = true;
    this.expiresAt = new Date(newExpTime).toISOString();
    this._saveState();

    return {
      success: true,
      isVip: true,
      expiresAt: this.expiresAt,
      message: `⭐ Assinatura VIP ativada com sucesso por ${durationInDays} dias!`
    };
  }

  /**
   * Cancela ou desativa o status VIP
   */
  deactivateVip() {
    this.isVip = false;
    this.expiresAt = null;
    this._saveState();
  }

  /**
   * Calcula a recompensa em moedas/ouro de fim de partida aplicando +50% para VIP
   * @param {number} baseGold Quantidade base de ouro obtida na partida
   * @returns {{ baseGold: number, bonusGold: number, totalGold: number, isVip: boolean }}
   */
  calculateMatchReward(baseGold) {
    const validBase = Math.max(0, Math.floor(Number(baseGold) || 0));
    const active = this.isVipActive();

    if (!active) {
      return {
        baseGold: validBase,
        bonusGold: 0,
        totalGold: validBase,
        isVip: false
      };
    }

    // +50% de moedas de ouro para VIP
    const bonusGold = Math.floor(validBase * 0.5);
    const totalGold = validBase + bonusGold;

    return {
      baseGold: validBase,
      bonusGold,
      totalGold,
      isVip: true
    };
  }

  /**
   * Retorna o multiplicador de recompensas diárias (2x se VIP, 1x normal)
   * @returns {number}
   */
  getDailyRewardMultiplier() {
    return this.isVipActive() ? 2 : 1;
  }

  /**
   * Retorna os milissegundos restantes da assinatura VIP
   * @returns {number}
   */
  getRemainingTimeMs() {
    if (!this.isVipActive() || !this.expiresAt) return 0;
    const expTime = new Date(this.expiresAt).getTime();
    return Math.max(0, expTime - Date.now());
  }

  /**
   * Retorna o tempo restante formatado em dias, horas e minutos
   * @returns {string}
   */
  getRemainingTimeFormatted() {
    const ms = this.getRemainingTimeMs();
    if (ms <= 0) return 'Inativo';

    const totalMinutes = Math.floor(ms / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h restantes`;
    }
    return `${hours}h ${minutes}m restantes`;
  }

  /**
   * Retorna o status completo do VIP formatado para UI
   */
  getStatus() {
    const active = this.isVipActive();
    return {
      isVip: active,
      expiresAt: this.expiresAt,
      remainingTimeFormatted: this.getRemainingTimeFormatted(),
      remainingTimeMs: this.getRemainingTimeMs(),
      matchGoldBonusMultiplier: active ? 1.5 : 1.0,
      dailyRewardMultiplier: active ? 2 : 1,
      badgeLabel: active ? 'VIP ATIVO ⭐' : 'MEMBRO PADRÃO'
    };
  }
}
