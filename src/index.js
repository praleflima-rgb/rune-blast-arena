/**
 * @file index.js
 * @description Ponto de entrada modular e Fachada (Facade) dos sistemas de Economia,
 *              Inventário, VIP, Temporadas e Herói do Rune Blast Arena.
 */

import { DailyRewardSystem, DAILY_REWARD_CYCLE } from './dailyRewardSystem.js';
import { ShopInventorySystem, SHOP_CATALOG } from './shopInventorySystem.js';
import { HeroController, DEFAULT_HERO_BASE_STATS } from './heroController.js';
import { VipSystem } from './vipSystem.js';
import { SeasonManager, CURRENT_SEASON, WEEKLY_EVENT_CONFIG } from './seasonManager.js';
import { SupabaseSync } from './supabaseSync.js';

export {
  DailyRewardSystem,
  DAILY_REWARD_CYCLE,
  ShopInventorySystem,
  SHOP_CATALOG,
  HeroController,
  DEFAULT_HERO_BASE_STATS,
  VipSystem,
  SeasonManager,
  CURRENT_SEASON,
  WEEKLY_EVENT_CONFIG,
  SupabaseSync
};

/**
 * Gerenciador Central Integrado da Economia do Rune Blast Arena
 */
export class RuneBlastEconomy {
  /**
   * @param {Object} [options]
   * @param {string} [options.userId] ID do jogador logado
   * @param {Object} [options.supabaseClient] Cliente Supabase
   * @param {number} [options.initialGold=0]
   * @param {number} [options.initialGems=0]
   * @param {string} [options.characterKey='vesper']
   */
  constructor(options = {}) {
    this.userId = options.userId || null;

    // Carteira do jogador
    this.wallet = {
      gold: options.initialGold || 0,
      gems: options.initialGems || 0
    };

    // 1. Inicializa o Controlador do Herói
    this.heroController = new HeroController({
      characterKey: options.characterKey || 'vesper'
    });

    // 2. Inicializa o Sistema VIP
    this.vipSystem = new VipSystem({
      onSyncRequested: () => this.syncToSupabase()
    });

    // 3. Inicializa o Sistema de Recompensas Diárias (com VIP integrado)
    this.dailyRewardSystem = new DailyRewardSystem({
      vipSystem: this.vipSystem,
      onRewardClaimed: (result) => this._handleDailyRewardClaimed(result),
      onSyncRequested: () => this.syncToSupabase()
    });

    // 4. Inicializa Loja & Inventário (com HeroController integrado)
    this.shopInventorySystem = new ShopInventorySystem({
      heroController: this.heroController,
      onSyncRequested: () => this.syncToSupabase()
    });

    // 5. Inicializa Temporadas & Eventos Semanais
    this.seasonManager = new SeasonManager({
      onSyncRequested: () => this.syncToSupabase()
    });

    // 6. Sincronizador Supabase
    this.supabaseSync = new SupabaseSync({
      client: options.supabaseClient || null,
      userId: this.userId
    });

    this._loadLocalWallet();
  }

  /**
   * Vincula ou atualiza a conta de usuário autenticada
   * @param {string} userId 
   * @param {Object} [supabaseClient]
   */
  async setAuthenticatedUser(userId, supabaseClient) {
    this.userId = userId;
    this.supabaseSync.setUserId(userId);
    if (supabaseClient) {
      this.supabaseSync.setClient(supabaseClient);
    }

    await this.loadFromSupabase();
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  /**
   * Carrega saldo salvo no localStorage
   * @private
   */
  _loadLocalWallet() {
    try {
      if (this._hasLocalStorage()) {
        const savedGold = localStorage.getItem('rba_wallet_gold');
        const savedGems = localStorage.getItem('rba_wallet_gems');
        if (savedGold !== null) this.wallet.gold = parseInt(savedGold, 10) || 0;
        if (savedGems !== null) this.wallet.gems = parseInt(savedGems, 10) || 0;
      }
    } catch (e) {
      console.warn('[RuneBlastEconomy] Erro ao carregar carteira local:', e);
    }
  }

  /**
   * Salva saldo no localStorage
   * @private
   */
  _saveLocalWallet() {
    try {
      if (this._hasLocalStorage()) {
        localStorage.setItem('rba_wallet_gold', String(this.wallet.gold));
        localStorage.setItem('rba_wallet_gems', String(this.wallet.gems));
      }
    } catch (e) {
      console.warn('[RuneBlastEconomy] Erro ao salvar carteira local:', e);
    }
  }

  /**
   * Callback interno chamado quando uma recompensa diária é resgatada
   * @private
   */
  _handleDailyRewardClaimed(result) {
    if (result && result.rewards) {
      if (result.rewards.gold) this.addGold(result.rewards.gold);
      if (result.rewards.gems) this.addGems(result.rewards.gems);
    }
  }

  // ==========================================
  // CARTEIRA & MOEDAS
  // ==========================================

  getGold() {
    return this.wallet.gold;
  }

  getGems() {
    return this.wallet.gems;
  }

  addGold(amount) {
    const val = Math.max(0, Math.floor(amount || 0));
    this.wallet.gold += val;
    this._saveLocalWallet();
    this.syncToSupabase();
    return this.wallet.gold;
  }

  addGems(amount) {
    const val = Math.max(0, Math.floor(amount || 0));
    this.wallet.gems += val;
    this._saveLocalWallet();
    this.syncToSupabase();
    return this.wallet.gems;
  }

  deductCurrency(currency, amount) {
    const val = Math.max(0, Math.floor(amount || 0));
    if (currency === 'gems') {
      if (this.wallet.gems < val) return false;
      this.wallet.gems -= val;
    } else {
      if (this.wallet.gold < val) return false;
      this.wallet.gold -= val;
    }
    this._saveLocalWallet();
    this.syncToSupabase();
    return true;
  }

  /**
   * Concede moedas ao terminar partidas (aplica +50% de bónus para membros VIP)
   * @param {number} baseGold Ouro ganho na partida
   * @returns {{ baseGold: number, bonusGold: number, totalGold: number, isVip: boolean, newBalance: number }}
   */
  creditMatchRewards(baseGold) {
    const matchBonus = this.vipSystem.calculateMatchReward(baseGold);
    this.addGold(matchBonus.totalGold);
    return {
      ...matchBonus,
      newBalance: this.wallet.gold
    };
  }

  // ==========================================
  // ATALHOS DE LOJA E EQUIPAMENTO
  // ==========================================

  /**
   * Compra um item da loja usando a carteira integrada
   * @param {string} itemId 
   */
  buyShopItem(itemId) {
    const profileBridge = {
      gold: this.wallet.gold,
      gems: this.wallet.gems,
      deductCurrency: (curr, amt) => this.deductCurrency(curr, amt)
    };
    return this.shopInventorySystem.buyItem(itemId, profileBridge);
  }

  /**
   * Equipa um item e aplica bónus de atributos ao herói
   * @param {string} itemId 
   */
  equipItem(itemId) {
    return this.shopInventorySystem.equipItem(itemId);
  }

  /**
   * Desequipa arma ou skin e recalcula atributos
   * @param {'weapon'|'skin'} slot 
   */
  unequipItem(slot) {
    return this.shopInventorySystem.unequipItem(slot);
  }

  // ==========================================
  // ATALHOS DE TORNEIO E TEMPORADA
  // ==========================================

  /**
   * Valida se o jogador pode disputar o ranking semanal
   * @param {'survival'|'pvp'} mode 
   */
  canEnterWeeklyRanking(mode) {
    return this.seasonManager.canEnterWeeklyRanking(mode);
  }

  /**
   * Compra o Passe de Torneio (Rank Pass)
   * @param {number} [price=50] 
   * @param {'gems'|'gold'} [currency='gems'] 
   */
  buyTournamentPass(price = 50, currency = 'gems') {
    const profileBridge = {
      gold: this.wallet.gold,
      gems: this.wallet.gems,
      deductCurrency: (curr, amt) => this.deductCurrency(curr, amt)
    };
    return this.seasonManager.buyTournamentPass(profileBridge, price, currency);
  }

  // ==========================================
  // SINCRONIZAÇÃO COM SUPABASE
  // ==========================================

  /**
   * Envia os dados atuais do utilizador para o Supabase
   */
  async syncToSupabase() {
    if (!this.userId || !this.supabaseSync.isConfigured()) return;

    const inventoryPayload = this.shopInventorySystem.exportState();
    const vipPayload = this.vipSystem.exportState();
    const seasonPayload = this.seasonManager.exportState();

    const profilePayload = {
      gold: this.wallet.gold,
      gems: this.wallet.gems,
      isVip: vipPayload.isVip,
      vipExpiresAt: vipPayload.expiresAt,
      hasTournamentPass: seasonPayload.hasTournamentPass,
      tournamentPassExpiresAt: seasonPayload.tournamentPassExpiresAt,
      seasonProgress: seasonPayload.seasonProgress
    };

    return await this.supabaseSync.syncAll(this.userId, {
      inventory: inventoryPayload,
      profile: profilePayload
    });
  }

  /**
   * Carrega os dados persistidos no Supabase e hidrata os módulos
   */
  async loadFromSupabase() {
    if (!this.userId || !this.supabaseSync.isConfigured()) return;

    const result = await this.supabaseSync.loadAll(this.userId);
    if (!result.success) return;

    if (result.profile) {
      if (result.profile.gold !== undefined) this.wallet.gold = result.profile.gold;
      if (result.profile.gems !== undefined) this.wallet.gems = result.profile.gems;
      this._saveLocalWallet();

      this.vipSystem.hydrate(result.profile);
      this.seasonManager.hydrate(result.profile);
    }

    if (result.inventory) {
      this.shopInventorySystem.hydrate(result.inventory);
    }
  }
}
