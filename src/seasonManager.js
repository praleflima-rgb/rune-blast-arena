/**
 * @file seasonManager.js
 * @description Gerenciador de Temporadas, Eventos Semanais e Passe de Torneio (Rank Pass).
 * 
 * REGRAS DE NEGÓCIO:
 * 1. Modo História / Fases:
 *    - Estruturado por Temporadas (Season 1: Despertar dos Magos Rúnicos).
 *    - Fases com progressão por estrelas e recompensas de conclusão.
 * 2. Modos Sobrevivência e PVP:
 *    - Configurados como Eventos Semanais rotativos com fechamento aos domingos às 21h BRT.
 * 3. Passe de Torneio (hasTournamentPass):
 *    - Verifica se o jogador possui o Passe de Torneio ativo.
 *    - Apenas jogadores com hasTournamentPass têm permissão para competir e submeter pontuação
 *      nos rankings oficiais semanais de Sobrevivência e PVP.
 */

export const CURRENT_SEASON = {
  id: 1,
  number: 1,
  title: 'Season 1: Despertar dos Magos Rúnicos',
  theme: 'Arcane Rebirth',
  startDate: '2026-08-01T00:00:00-03:00',
  endDate: '2026-11-30T23:59:59-03:00',
  totalStages: 10,
  stages: [
    { number: 1, name: 'Bosque dos Slimes', monsterCount: 3, boss: null, targetScore: 500, firstClearGold: 300 },
    { number: 2, name: 'Ruínas Esquecidas', monsterCount: 4, boss: null, targetScore: 1000, firstClearGold: 450 },
    { number: 3, name: 'Caverna das Gárgulas', monsterCount: 5, boss: null, targetScore: 1600, firstClearGold: 600 },
    { number: 4, name: 'Catacumbas Sombrias', monsterCount: 6, boss: null, targetScore: 2300, firstClearGold: 800 },
    { number: 5, name: 'Cripta dos Espectros', monsterCount: 7, boss: null, targetScore: 3100, firstClearGold: 1000 },
    { number: 6, name: 'Muralha dos Orcs', monsterCount: 8, boss: null, targetScore: 4000, firstClearGold: 1250 },
    { number: 7, name: 'Covil dos Necromantes', monsterCount: 9, boss: null, targetScore: 5000, firstClearGold: 1500 },
    { number: 8, name: 'Câmara do Fogo Infernal', monsterCount: 10, boss: null, targetScore: 6200, firstClearGold: 1800 },
    { number: 9, name: 'Abismo dos Golens de Pedra', monsterCount: 12, boss: null, targetScore: 7500, firstClearGold: 2200 },
    { number: 10, name: 'O Trono do Soberano Malak', monsterCount: 14, boss: 'malak', targetScore: 10000, firstClearGold: 3500 }
  ]
};

export const WEEKLY_EVENT_CONFIG = {
  cycleDurationDays: 7,
  resetDayOfWeek: 0, // 0 = Domingo
  resetHourBRT: 21,  // 21:00 BRT
  modes: {
    survival: {
      name: 'Sobrevivência Semanal Ranqueada',
      description: 'Enfrente hordas infinitas de monstros e dispute o topo do ranking semanal.',
      requiresPass: true,
      rewardTierTop1: { gems: 100, gold: 5000, title: 'Lorde da Sobrevivência' },
      rewardTierTop10: { gems: 50, gold: 2500 }
    },
    pvp: {
      name: 'Arena PVP Semanal Ranqueada',
      description: 'Duelos táticos em tempo real. Cada vitória rende troféus para o ranking semanal.',
      requiresPass: true,
      rewardTierTop1: { gems: 150, gold: 8000, title: 'Campeão da Arena' },
      rewardTierTop10: { gems: 75, gold: 4000 }
    }
  }
};

const STORAGE_SEASON_KEY = 'rba_season_state_v2';

export class SeasonManager {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onSyncRequested] Callback para salvar no Supabase
   */
  constructor(options = {}) {
    this.onSyncRequested = options.onSyncRequested || null;

    // Estado do Passe de Torneio (Rank Pass)
    this.hasTournamentPass = false;
    this.tournamentPassExpiresAt = null;

    // Progresso do Modo História (Temporada)
    this.seasonProgress = {
      seasonId: CURRENT_SEASON.id,
      unlockedStage: 1,
      completedStages: {}, // { [stageNumber]: { stars: number, highScore: number, completedAt: string } }
      totalStars: 0
    };

    this._loadLocalState();
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  /**
   * Carrega estado do localStorage
   * @private
   */
  _loadLocalState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_SEASON_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.hasTournamentPass = !!parsed.hasTournamentPass;
          this.tournamentPassExpiresAt = parsed.tournamentPassExpiresAt || null;
          if (parsed.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              ...parsed.seasonProgress
            };
          }
          this.checkTournamentPassExpiration();
        }
      }
    } catch (e) {
      console.warn('[SeasonManager] Erro ao ler localStorage:', e);
    }
  }

  /**
   * Salva estado e dispara sincronização
   * @private
   */
  _saveState() {
    const payload = this.exportState();
    try {
      if (this._hasLocalStorage()) {
        localStorage.setItem(STORAGE_SEASON_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('[SeasonManager] Erro ao salvar localStorage:', e);
    }

    if (typeof this.onSyncRequested === 'function') {
      this.onSyncRequested(payload);
    }
  }

  /**
   * Exporta estado para persistência (localStorage / Supabase)
   */
  exportState() {
    return {
      hasTournamentPass: this.isTournamentPassActive(),
      tournamentPassExpiresAt: this.tournamentPassExpiresAt,
      seasonProgress: { ...this.seasonProgress }
    };
  }

  /**
   * Hidrata dados vindos do Supabase
   * @param {Object} remoteData 
   */
  hydrate(remoteData) {
    if (!remoteData) return;

    if (remoteData.has_tournament_pass !== undefined) {
      this.hasTournamentPass = !!remoteData.has_tournament_pass;
    } else if (remoteData.hasTournamentPass !== undefined) {
      this.hasTournamentPass = !!remoteData.hasTournamentPass;
    }

    if (remoteData.tournament_pass_expires_at !== undefined) {
      this.tournamentPassExpiresAt = remoteData.tournament_pass_expires_at;
    } else if (remoteData.tournamentPassExpiresAt !== undefined) {
      this.tournamentPassExpiresAt = remoteData.tournamentPassExpiresAt;
    }

    if (remoteData.season_progress) {
      this.seasonProgress = {
        ...this.seasonProgress,
        ...remoteData.season_progress
      };
    }

    this.checkTournamentPassExpiration();
    this._saveState();
  }

  // ==========================================
  // PASSE DE TORNEIO (RANK PASS)
  // ==========================================

  /**
   * Verifica se o Passe de Torneio expirou
   * @returns {boolean}
   */
  checkTournamentPassExpiration() {
    if (!this.hasTournamentPass) return false;

    if (!this.tournamentPassExpiresAt) {
      // Vitalício ou passe fixo da temporada
      return true;
    }

    const exp = new Date(this.tournamentPassExpiresAt).getTime();
    if (isNaN(exp) || Date.now() >= exp) {
      this.hasTournamentPass = false;
      this.tournamentPassExpiresAt = null;
      return false;
    }

    return true;
  }

  /**
   * Retorna se o jogador possui o Passe de Torneio ativo
   * @returns {boolean}
   */
  isTournamentPassActive() {
    return this.checkTournamentPassExpiration();
  }

  /**
   * Concede ou renova o Passe de Torneio por um período de dias (ex: 7 dias semanais ou 30 dias de temporada)
   * @param {number} [durationInDays=7] 
   */
  grantTournamentPass(durationInDays = 7) {
    const durationMs = durationInDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let newExp = now + durationMs;
    if (this.hasTournamentPass && this.tournamentPassExpiresAt) {
      const curr = new Date(this.tournamentPassExpiresAt).getTime();
      if (!isNaN(curr) && curr > now) {
        newExp = curr + durationMs;
      }
    }

    this.hasTournamentPass = true;
    this.tournamentPassExpiresAt = new Date(newExp).toISOString();
    this._saveState();

    return {
      success: true,
      hasTournamentPass: true,
      expiresAt: this.tournamentPassExpiresAt,
      message: `🎟️ Passe de Torneio ativado por ${durationInDays} dias!`
    };
  }

  /**
   * Compra o Passe de Torneio utilizando moedas ou gemas
   * @param {Object} playerProfile Perfil com { gems, gold, deductCurrency }
   * @param {number} [price=50]
   * @param {'gems'|'gold'} [currency='gems']
   */
  buyTournamentPass(playerProfile, price = 50, currency = 'gems') {
    const balance = playerProfile[currency] || 0;
    if (balance < price) {
      const curLabel = currency === 'gems' ? 'gemas' : 'ouro';
      return {
        success: false,
        message: `Saldo insuficiente! O Passe de Torneio custa ${price} ${curLabel} (Saldo: ${balance}).`
      };
    }

    if (typeof playerProfile.deductCurrency === 'function') {
      playerProfile.deductCurrency(currency, price);
    } else {
      playerProfile[currency] -= price;
    }

    return this.grantTournamentPass(7); // Passe de 7 dias para o ciclo semanal
  }

  /**
   * Validação de permissão de entrada nos rankings semanais de Sobrevivência e PVP
   * @param {'survival'|'pvp'} mode 
   * @returns {{ allowed: boolean, hasPass: boolean, reason?: string }}
   */
  canEnterWeeklyRanking(mode) {
    const modeConfig = WEEKLY_EVENT_CONFIG.modes[mode];
    if (!modeConfig) {
      return { allowed: true, hasPass: false };
    }

    const hasPass = this.isTournamentPassActive();

    if (modeConfig.requiresPass && !hasPass) {
      return {
        allowed: false,
        hasPass: false,
        reason: `Acesso Restrito: É necessário o Passe de Torneio (Rank Pass) para disputar o ranking oficial de ${modeConfig.name}. Adquira o passe na loja para participar!`
      };
    }

    return {
      allowed: true,
      hasPass: true
    };
  }

  // ==========================================
  // EVENTOS SEMANAIS
  // ==========================================

  /**
   * Retorna o identificador único do ciclo semanal atual (ex: "2026-W34")
   * @returns {string}
   */
  getWeeklyCycleId() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Retorna os detalhes do evento semanal ativo e tempo até o próximo fechamento
   */
  getWeeklyEventStatus() {
    const now = new Date();
    // Próximo domingo às 21h BRT (UTC-3 = 00h UTC de segunda)
    const nextSunday = new Date();
    const currentDay = now.getDay();
    const daysUntilSunday = (7 - currentDay) % 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(21, 0, 0, 0);

    if (nextSunday.getTime() <= now.getTime()) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }

    const msUntilReset = nextSunday.getTime() - now.getTime();
    const hours = Math.floor(msUntilReset / (1000 * 60 * 60));
    const minutes = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));

    return {
      cycleId: this.getWeeklyCycleId(),
      hasTournamentPass: this.isTournamentPassActive(),
      passExpiresAt: this.tournamentPassExpiresAt,
      timeUntilReset: `${hours}h ${minutes}m`,
      timeUntilResetMs: msUntilReset,
      modes: { ...WEEKLY_EVENT_CONFIG.modes }
    };
  }

  // ==========================================
  // MODO HISTÓRIA / FASES DA TEMPORADA
  // ==========================================

  /**
   * Obtém informações da temporada atual
   */
  getSeasonInfo() {
    return {
      ...CURRENT_SEASON,
      playerProgress: { ...this.seasonProgress }
    };
  }

  /**
   * Registra a conclusão de uma fase do Modo História
   * @param {number} stageNumber 
   * @param {number} stars (1 a 3)
   * @param {number} score 
   * @returns {{ success: boolean, firstClear: boolean, rewards: Object }}
   */
  completeStage(stageNumber, stars, score) {
    const stage = CURRENT_SEASON.stages.find((s) => s.number === stageNumber);
    if (!stage) return { success: false, message: 'Fase inválida' };

    const wasCompleted = !!this.seasonProgress.completedStages[stageNumber];
    const prevStars = wasCompleted ? this.seasonProgress.completedStages[stageNumber].stars : 0;
    const cleanStars = Math.min(3, Math.max(1, Math.floor(stars)));

    // Salva ou atualiza
    this.seasonProgress.completedStages[stageNumber] = {
      stars: Math.max(prevStars, cleanStars),
      highScore: Math.max(wasCompleted ? this.seasonProgress.completedStages[stageNumber].highScore : 0, score),
      completedAt: new Date().toISOString()
    };

    // Desbloqueia próxima fase
    if (stageNumber >= this.seasonProgress.unlockedStage && stageNumber < CURRENT_SEASON.totalStages) {
      this.seasonProgress.unlockedStage = stageNumber + 1;
    }

    // Recalcula total de estrelas
    this.seasonProgress.totalStars = Object.values(this.seasonProgress.completedStages)
      .reduce((sum, s) => sum + s.stars, 0);

    const firstClear = !wasCompleted;
    const rewards = {
      gold: firstClear ? stage.firstClearGold : Math.floor(stage.firstClearGold * 0.3),
      gems: firstClear ? 5 : 0
    };

    this._saveState();

    return {
      success: true,
      stageNumber,
      firstClear,
      rewards,
      totalStars: this.seasonProgress.totalStars,
      unlockedStage: this.seasonProgress.unlockedStage
    };
  }
}
