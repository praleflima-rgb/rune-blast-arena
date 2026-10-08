/**
 * @file rankedSystem.js
 * @description Sistema de Ranking e Partidas do Rune Blast Arena.
 *
 * REGRAS DE NEGOCIO:
 *
 * -- TEMPORADA PRINCIPAL (Ranked) --------------------------------
 * . Duracao: 40 dias a partir de SEASON_START_DATE.
 * . Premio base: R$ 100,00 (exibido dinamicamente via campo prize_pool no Supabase).
 * . Jogador FREE: 3 tentativas por hora (recarga de 3600 s). Maximo acumulavel: 3.
 *   - Tentativas EXTRA (de indicacoes) ficam em extraTries e nao sao limitadas pelo teto normal.
 * . Jogador VIP: partidas ilimitadas + +50% de Ouro ao final de cada partida.
 *
 * -- TORNEIOS SEMANAIS (PvP e Sobrevivencia) ---------------------
 * . Rankings independentes com reset a cada 7 dias (domingo 21h BRT).
 * . Requer Passe de Torneio (R$ 10,00) para acesso a ambos os modos na semana.
 */

export const SEASON_CONFIG = {
  id: 1,
  title: 'Temporada 1 - Despertar dos Magos Runicos',
  durationDays: 40,
  startDate: '2026-08-01T00:00:00-03:00',
  basePrizePoolBRL: 100.00,
};

export const FREE_PLAYER_CONFIG = {
  maxTries: 3,
  rechargeSeconds: 3600,
};

export const VIP_PLAYER_CONFIG = {
  unlimitedTries: true,
  goldBonusPercent: 50,
};

export const TOURNAMENT_CONFIG = {
  cycleDurationDays: 7,
  resetDayOfWeek: 0,
  resetHourBRT: 21,
  priceBRL: 10.00,
  modes: ['pvp', 'survival'],
};

const STORAGE_KEY = 'rba_ranked_state_v3';

export class RankedSystem {
  constructor(options = {}) {
    this.onSyncRequested = options.onSyncRequested || null;
    this.rankedTries = FREE_PLAYER_CONFIG.maxTries;
    this.extraTries = 0;
    this.lastTriesUpdate = Date.now();
    this.seasonEndDate = this._calcSeasonEndDate();
    this.prizePoolBRL = SEASON_CONFIG.basePrizePoolBRL;
    this.tournamentPassActive = false;
    this.tournamentPassExpiresAt = null;
    this.weeklyRank = { pvp: null, survival: null };
    this._loadLocalState();
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  _calcSeasonEndDate() {
    const start = new Date(SEASON_CONFIG.startDate).getTime();
    return new Date(start + SEASON_CONFIG.durationDays * 24 * 60 * 60 * 1000).toISOString();
  }

  isSeasonActive() {
    return Date.now() < new Date(this.seasonEndDate).getTime();
  }

  getDaysRemaining() {
    const msLeft = new Date(this.seasonEndDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  _rechargeNormalTries() {
    const elapsed = Date.now() - this.lastTriesUpdate;
    const gained = Math.floor(elapsed / (FREE_PLAYER_CONFIG.rechargeSeconds * 1000));
    if (gained > 0) {
      const before = this.rankedTries;
      this.rankedTries = Math.min(FREE_PLAYER_CONFIG.maxTries, this.rankedTries + gained);
      if (this.rankedTries > before) {
        this.lastTriesUpdate += gained * FREE_PLAYER_CONFIG.rechargeSeconds * 1000;
      }
    }
  }

  getNormalTries() {
    this._rechargeNormalTries();
    return this.rankedTries;
  }

  getTotalTries() {
    return this.getNormalTries() + this.extraTries;
  }

  getSecondsToNextTry() {
    this._rechargeNormalTries();
    if (this.rankedTries >= FREE_PLAYER_CONFIG.maxTries) return 0;
    const elapsed = Date.now() - this.lastTriesUpdate;
    const remaining = FREE_PLAYER_CONFIG.rechargeSeconds * 1000 - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  addExtraTries(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.extraTries += Math.floor(amount);
    this._saveState();
  }

  consumeTry(isVip = false) {
    if (!this.isSeasonActive()) {
      return { success: false, message: 'A Temporada Principal encerrou.', triesLeft: 0, extraTriesLeft: 0, secsToNextTry: 0 };
    }
    if (isVip) {
      return { success: true, message: 'VIP: partida ilimitada iniciada!', triesLeft: Infinity, extraTriesLeft: this.extraTries, secsToNextTry: 0 };
    }
    this._rechargeNormalTries();
    if (this.extraTries > 0) {
      this.extraTries -= 1;
      this._saveState();
      return { success: true, message: 'Tentativa extra usada! Extras restantes: ' + this.extraTries, triesLeft: this.rankedTries, extraTriesLeft: this.extraTries, secsToNextTry: this.getSecondsToNextTry() };
    }
    if (this.rankedTries > 0) {
      if (this.rankedTries === FREE_PLAYER_CONFIG.maxTries) this.lastTriesUpdate = Date.now();
      this.rankedTries -= 1;
      this._saveState();
      return { success: true, message: 'Partida iniciada! Tentativas restantes: ' + this.rankedTries, triesLeft: this.rankedTries, extraTriesLeft: 0, secsToNextTry: this.getSecondsToNextTry() };
    }
    const secs = this.getSecondsToNextTry();
    return { success: false, message: 'Sem tentativas! Proxima recarga em ' + Math.ceil(secs / 60) + ' min.', triesLeft: 0, extraTriesLeft: 0, secsToNextTry: secs };
  }

  checkTournamentPassExpiration() {
    if (!this.tournamentPassActive) return false;
    if (!this.tournamentPassExpiresAt) return true;
    const exp = new Date(this.tournamentPassExpiresAt).getTime();
    if (isNaN(exp) || Date.now() >= exp) {
      this.tournamentPassActive = false;
      this.tournamentPassExpiresAt = null;
      return false;
    }
    return true;
  }

  isTournamentPassActive() {
    return this.checkTournamentPassExpiration();
  }

  grantTournamentPass() {
    const durationMs = TOURNAMENT_CONFIG.cycleDurationDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let newExp = now + durationMs;
    if (this.tournamentPassActive && this.tournamentPassExpiresAt) {
      const curr = new Date(this.tournamentPassExpiresAt).getTime();
      if (!isNaN(curr) && curr > now) newExp = curr + durationMs;
    }
    this.tournamentPassActive = true;
    this.tournamentPassExpiresAt = new Date(newExp).toISOString();
    this._saveState();
    return { success: true, expiresAt: this.tournamentPassExpiresAt, message: 'Passe de Torneio ativado por ' + TOURNAMENT_CONFIG.cycleDurationDays + ' dias!' };
  }

  canEnterWeeklyRanking(mode) {
    if (!TOURNAMENT_CONFIG.modes.includes(mode)) return { allowed: false, reason: 'Modo ' + mode + ' invalido.' };
    if (!this.isTournamentPassActive()) {
      return { allowed: false, reason: 'E necessario um Passe de Torneio (R$ ' + TOURNAMENT_CONFIG.priceBRL.toFixed(2) + ') para participar do ranking semanal de ' + mode.toUpperCase() + '.' };
    }
    return { allowed: true };
  }

  getWeeklyCycleId() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + weekNo.toString().padStart(2, '0');
  }

  getSecondsToWeeklyReset() {
    const now = new Date();
    const nextSunday = new Date(now);
    const diff = (7 - now.getDay()) % 7;
    nextSunday.setDate(now.getDate() + (diff === 0 ? 7 : diff));
    nextSunday.setHours(21, 0, 0, 0);
    if (nextSunday <= now) nextSunday.setDate(nextSunday.getDate() + 7);
    return Math.max(0, Math.ceil((nextSunday.getTime() - now.getTime()) / 1000));
  }

  calculateMatchGold(baseGold, isVip = false) {
    const base = Math.max(0, Math.floor(Number(baseGold) || 0));
    if (!isVip) return { baseGold: base, bonusGold: 0, totalGold: base };
    const bonus = Math.floor(base * (VIP_PLAYER_CONFIG.goldBonusPercent / 100));
    return { baseGold: base, bonusGold: bonus, totalGold: base + bonus };
  }

  updatePrizePool(amountBRL) {
    if (Number.isFinite(amountBRL) && amountBRL >= 0) this.prizePoolBRL = amountBRL;
  }

  _loadLocalState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          this.rankedTries = s.rankedTries ?? FREE_PLAYER_CONFIG.maxTries;
          this.extraTries = s.extraTries ?? 0;
          this.lastTriesUpdate = s.lastTriesUpdate ?? Date.now();
          this.tournamentPassActive = !!s.tournamentPassActive;
          this.tournamentPassExpiresAt = s.tournamentPassExpiresAt || null;
          this.prizePoolBRL = s.prizePoolBRL ?? SEASON_CONFIG.basePrizePoolBRL;
          this.weeklyRank = s.weeklyRank || { pvp: null, survival: null };
          this.checkTournamentPassExpiration();
        }
      }
    } catch (e) { console.warn('[RankedSystem] localStorage error:', e); }
  }

  _saveState() {
    const payload = this.exportState();
    try { if (this._hasLocalStorage()) localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    if (typeof this.onSyncRequested === 'function') this.onSyncRequested(payload);
  }

  exportState() {
    return {
      rankedTries: this.rankedTries,
      extraTries: this.extraTries,
      lastTriesUpdate: this.lastTriesUpdate,
      tournamentPassActive: this.isTournamentPassActive(),
      tournamentPassExpiresAt: this.tournamentPassExpiresAt,
      prizePoolBRL: this.prizePoolBRL,
      weeklyRank: this.weeklyRank
    };
  }

  hydrate(remoteData) {
    if (!remoteData) return;
    if (remoteData.ranked_tries !== undefined) this.rankedTries = Number(remoteData.ranked_tries) || 0;
    if (remoteData.extra_tries !== undefined) this.extraTries = Number(remoteData.extra_tries) || 0;
    if (remoteData.last_tries_update !== undefined) this.lastTriesUpdate = new Date(remoteData.last_tries_update).getTime() || Date.now();
    if (remoteData.tournament_pass_active !== undefined) this.tournamentPassActive = !!remoteData.tournament_pass_active;
    if (remoteData.tournament_pass_expires_at !== undefined) this.tournamentPassExpiresAt = remoteData.tournament_pass_expires_at;
    if (remoteData.prize_pool_brl !== undefined) this.updatePrizePool(Number(remoteData.prize_pool_brl));
    this.checkTournamentPassExpiration();
    this._saveState();
  }

  getStatus(isVip = false) {
    this._rechargeNormalTries();
    return {
      seasonActive: this.isSeasonActive(),
      daysRemaining: this.getDaysRemaining(),
      seasonEndDate: this.seasonEndDate,
      prizePoolBRL: this.prizePoolBRL.toFixed(2),
      isVip,
      rankedTries: isVip ? 'ilimitado' : this.rankedTries,
      extraTries: this.extraTries,
      totalTries: isVip ? 'ilimitado' : this.getTotalTries(),
      secsToNextTry: isVip ? 0 : this.getSecondsToNextTry(),
      tournamentPassActive: this.isTournamentPassActive(),
      tournamentPassExpiresAt: this.tournamentPassExpiresAt,
      weeklyCycleId: this.getWeeklyCycleId(),
      secsToWeeklyReset: this.getSecondsToWeeklyReset()
    };
  }
}
