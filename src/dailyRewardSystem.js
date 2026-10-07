/**
 * @file dailyRewardSystem.js
 * @description Sistema de Recompensas Diárias do Rune Blast Arena.
 * 
 * REGRAS DE NEGÓCIO:
 * - Totalmente livre de anúncios (remoção completa de adManager / H5 Games Ads).
 * - Resgate direto com um clique diário.
 * - Ciclo de 7 dias com recompensas progressivas (ouro, gemas, vidas, itens).
 * - Integração VIP: Se o jogador for VIP (isVipActive), todas as recompensas diárias são DOBRADAS (2x).
 * - Persistência em localStorage e sincronização com Supabase.
 */

export const DAILY_REWARD_CYCLE = [
  {
    day: 1,
    title: 'Dia 1 - Boas-Vindas à Arena',
    rewards: { gold: 250, gems: 5, bonusLives: 0, reviveTokens: 0, invulnCapes: 0 },
    icon: '🪙',
    label: '250 Ouro + 5 Gemas'
  },
  {
    day: 2,
    title: 'Dia 2 - Vigor do Guerreiro',
    rewards: { gold: 500, gems: 10, bonusLives: 1, reviveTokens: 0, invulnCapes: 0 },
    icon: '❤️',
    label: '500 Ouro, 10 Gemas + 1 Vida Extra'
  },
  {
    day: 3,
    title: 'Dia 3 - Poder Rúnico',
    rewards: { gold: 750, gems: 15, bonusLives: 0, reviveTokens: 1, invulnCapes: 0 },
    icon: '🔮',
    label: '750 Ouro, 15 Gemas + 1 Token de Reviver'
  },
  {
    day: 4,
    title: 'Dia 4 - Proteção Arcana',
    rewards: { gold: 1000, gems: 20, bonusLives: 0, reviveTokens: 0, invulnCapes: 1 },
    icon: '🛡️',
    label: '1.000 Ouro, 20 Gemas + 1 Capa de Invulnerabilidade'
  },
  {
    day: 5,
    title: 'Dia 5 - Tesouro do Guardião',
    rewards: { gold: 1500, gems: 25, bonusLives: 2, reviveTokens: 0, invulnCapes: 0 },
    icon: '💎',
    label: '1.500 Ouro, 25 Gemas + 2 Vidas Extras'
  },
  {
    day: 6,
    title: 'Dia 6 - Arsenal Sagrado',
    rewards: { gold: 2000, gems: 35, bonusLives: 0, reviveTokens: 1, invulnCapes: 2 },
    icon: '⚡',
    label: '2.000 Ouro, 35 Gemas + 2 Capas & 1 Reviver'
  },
  {
    day: 7,
    title: 'Dia 7 - Grande Recompensa da Temporada',
    rewards: { gold: 3500, gems: 60, bonusLives: 3, reviveTokens: 2, invulnCapes: 3 },
    icon: '👑',
    label: '3.500 Ouro, 60 Gemas + Pacote Mítico Completo'
  }
];

const STORAGE_KEY = 'rba_daily_rewards_v2';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class DailyRewardSystem {
  /**
   * @param {Object} options
   * @param {Object} [options.vipSystem] Instância do VipSystem para checagem de bônus 2x
   * @param {Function} [options.onRewardClaimed] Callback disparado após resgate (reward, total)
   * @param {Function} [options.onSyncRequested] Callback para sincronização com Supabase
   */
  constructor(options = {}) {
    this.vipSystem = options.vipSystem || null;
    this.onRewardClaimed = options.onRewardClaimed || null;
    this.onSyncRequested = options.onSyncRequested || null;

    this.state = this._loadState();
  }

  /**
   * Associa o sistema VIP após inicialização
   * @param {Object} vipSystem 
   */
  setVipSystem(vipSystem) {
    this.vipSystem = vipSystem;
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  /**
   * Carrega o estado persistido localmente
   * @private
   */
  _loadState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            currentDay: parsed.currentDay || 1,
            lastClaimTimestamp: parsed.lastClaimTimestamp || null,
            totalClaims: parsed.totalClaims || 0,
            history: Array.isArray(parsed.history) ? parsed.history : []
          };
        }
      }
    } catch (e) {
      console.warn('[DailyRewardSystem] Erro ao carregar localStorage:', e);
    }

    return {
      currentDay: 1,
      lastClaimTimestamp: null,
      totalClaims: 0,
      history: []
    };
  }

  /**
   * Salva o estado atual no localStorage e requisita sincronização
   * @private
   */
  _saveState() {
    try {
      if (this._hasLocalStorage()) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('[DailyRewardSystem] Erro ao salvar localStorage:', e);
    }

    if (typeof this.onSyncRequested === 'function') {
      this.onSyncRequested(this.getState());
    }
  }

  /**
   * Retorna uma cópia do estado atual
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Carrega um estado vindo do Supabase ou de outra fonte
   * @param {Object} remoteState 
   */
  hydrate(remoteState) {
    if (!remoteState) return;
    this.state = {
      currentDay: remoteState.currentDay || this.state.currentDay,
      lastClaimTimestamp: remoteState.lastClaimTimestamp || this.state.lastClaimTimestamp,
      totalClaims: remoteState.totalClaims || this.state.totalClaims,
      history: remoteState.history || this.state.history
    };
    this._saveState();
  }

  /**
   * Verifica se o jogador pode resgatar a recompensa hoje
   * @returns {boolean}
   */
  canClaimToday() {
    if (!this.state.lastClaimTimestamp) {
      return true;
    }

    const lastClaim = new Date(this.state.lastClaimTimestamp);
    const now = new Date();

    // Permite resgate se for um dia de calendário diferente ou se passaram mais de 24h
    const isDifferentDay =
      lastClaim.getFullYear() !== now.getFullYear() ||
      lastClaim.getMonth() !== now.getMonth() ||
      lastClaim.getDate() !== now.getDate();

    return isDifferentDay;
  }

  /**
   * Retorna os milissegundos restantes até o próximo resgate (meia-noite do dia seguinte)
   * @returns {number}
   */
  getTimeUntilNextRewardMs() {
    if (this.canClaimToday()) {
      return 0;
    }

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return Math.max(0, nextMidnight.getTime() - now.getTime());
  }

  /**
   * Retorna tempo restante formatado (ex: "04h 32m 15s")
   * @returns {string}
   */
  getTimeUntilNextRewardFormatted() {
    const ms = this.getTimeUntilNextRewardMs();
    if (ms <= 0) return 'Disponível Agora!';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  /**
   * Verifica se o VIP está ativo no momento
   * @returns {boolean}
   */
  isVipActive() {
    return !!(this.vipSystem && typeof this.vipSystem.isVipActive === 'function' && this.vipSystem.isVipActive());
  }

  /**
   * Multiplicador ativo de recompensa (2x se VIP, 1x caso contrário)
   * @returns {number}
   */
  getMultiplier() {
    return this.isVipActive() ? 2 : 1;
  }

  /**
   * Obtém a definição do dia atual do ciclo
   * @returns {Object}
   */
  getCurrentDayDefinition() {
    const dayIndex = Math.min(Math.max(this.state.currentDay, 1), 7) - 1;
    return DAILY_REWARD_CYCLE[dayIndex];
  }

  /**
   * Retorna o status completo pronto para a interface (UI)
   */
  getStatus() {
    const currentDayDef = this.getCurrentDayDefinition();
    const isVip = this.isVipActive();
    const multiplier = this.getMultiplier();
    const canClaim = this.canClaimToday();

    return {
      currentDay: this.state.currentDay,
      canClaim,
      timeUntilNext: this.getTimeUntilNextRewardFormatted(),
      timeUntilNextMs: this.getTimeUntilNextRewardMs(),
      isVip,
      multiplier,
      totalClaims: this.state.totalClaims,
      cycle: DAILY_REWARD_CYCLE.map((item) => ({
        ...item,
        isCurrent: item.day === this.state.currentDay,
        isPast: item.day < this.state.currentDay || (item.day === this.state.currentDay && !canClaim),
        adjustedRewards: {
          gold: item.rewards.gold * multiplier,
          gems: item.rewards.gems * multiplier,
          bonusLives: item.rewards.bonusLives * multiplier,
          reviveTokens: item.rewards.reviveTokens * multiplier,
          invulnCapes: item.rewards.invulnCapes * multiplier
        }
      }))
    };
  }

  /**
   * Resgata a recompensa diária diretamente com 1 clique (SEM ANÚNCIOS!).
   * Aplica multiplicador 2x automaticamente caso o jogador seja VIP.
   * 
   * @returns {{ success: boolean, reward?: Object, message: string }}
   */
  claimDailyReward() {
    if (!this.canClaimToday()) {
      return {
        success: false,
        message: `Recompensa já resgatada hoje! Volte em ${this.getTimeUntilNextRewardFormatted()}.`
      };
    }

    // Calcula dia e ciclo
    const now = new Date();
    const dayDef = this.getCurrentDayDefinition();
    const multiplier = this.getMultiplier();
    const isVip = this.isVipActive();

    // Recompensas calculadas com multiplicador VIP
    const finalRewards = {
      gold: dayDef.rewards.gold * multiplier,
      gems: dayDef.rewards.gems * multiplier,
      bonusLives: dayDef.rewards.bonusLives * multiplier,
      reviveTokens: dayDef.rewards.reviveTokens * multiplier,
      invulnCapes: dayDef.rewards.invulnCapes * multiplier
    };

    // Atualiza histórico e estado
    this.state.lastClaimTimestamp = now.toISOString();
    this.state.totalClaims += 1;
    this.state.history.push({
      day: this.state.currentDay,
      claimedAt: this.state.lastClaimTimestamp,
      rewards: finalRewards,
      isVip
    });

    // Se completou o dia 7, reinicia o ciclo no dia 1, senão avança para o próximo dia
    const claimedDay = this.state.currentDay;
    if (this.state.currentDay >= 7) {
      this.state.currentDay = 1;
    } else {
      this.state.currentDay += 1;
    }

    this._saveState();

    const result = {
      success: true,
      day: claimedDay,
      rewards: finalRewards,
      isVip,
      multiplier,
      message: isVip
        ? `⭐ Recompensa VIP Dobrada do Dia ${claimedDay} resgatada com sucesso!`
        : `🎉 Recompensa do Dia ${claimedDay} resgatada com sucesso!`
    };

    if (typeof this.onRewardClaimed === 'function') {
      this.onRewardClaimed(result);
    }

    return result;
  }
}
