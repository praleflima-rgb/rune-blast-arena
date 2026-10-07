/**
 * @file supabaseSync.js
 * @description Módulo de sincronização em tempo real e persistência com o Supabase.
 * 
 * TABELAS SINCRONIZADAS:
 * 1. inventory:
 *    - user_id (UUID PK)
 *    - items (JSONB / array com IDs de itens comprados)
 *    - equipped_weapon (TEXT / ID da arma equipada)
 *    - equipped_skin (TEXT / ID da skin equipada)
 * 2. user_profile:
 *    - id (UUID PK)
 *    - username (TEXT)
 *    - wallet_gold (INTEGER)
 *    - wallet_gems (INTEGER)
 *    - is_vip (BOOLEAN)
 *    - vip_expires_at (TIMESTAMPTZ)
 *    - has_tournament_pass (BOOLEAN)
 *    - tournament_pass_expires_at (TIMESTAMPTZ)
 *    - season_progress (JSONB)
 */

export class SupabaseSync {
  /**
   * @param {Object} [options]
   * @param {Object} [options.client] Cliente Supabase pré-inicializado
   * @param {string} [options.url] URL do projeto Supabase
   * @param {string} [options.key] Chave Anon/Public do Supabase
   */
  constructor(options = {}) {
    this.client = options.client || null;

    if (!this.client && options.url && options.key && typeof window !== 'undefined' && window.supabase) {
      this.client = window.supabase.createClient(options.url, options.key);
    }

    this.currentUserId = options.userId || null;
    this.isSyncing = false;
  }

  /**
   * Define ou atualiza a instância do cliente Supabase
   * @param {Object} client 
   */
  setClient(client) {
    this.client = client;
  }

  /**
   * Define o ID do usuário atualmente autenticado
   * @param {string} userId 
   */
  setUserId(userId) {
    this.currentUserId = userId;
  }

  /**
   * Verifica se o cliente está configurado e pronto para operações
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.client && this.currentUserId);
  }

  // ==========================================
  // SINCRONIZAÇÃO DA TABELA INVENTORY
  // ==========================================

  /**
   * Salva o estado do inventário e equipamentos do jogador na tabela `inventory`
   * 
   * @param {string} [userId] ID do usuário
   * @param {Object} inventoryData Dados do shopInventorySystem { purchasedItemIds, equippedWeapon, equippedSkin }
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async saveInventory(userId = this.currentUserId, inventoryData = {}) {
    if (!this.client || !userId) {
      return { success: false, error: 'Supabase não inicializado ou usuário anônimo.' };
    }

    try {
      const payload = {
        user_id: userId,
        items: inventoryData.purchasedItemIds || [],
        equipped_weapon: inventoryData.equippedWeapon || null,
        equipped_skin: inventoryData.equippedSkin || null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.client
        .from('inventory')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        console.warn('[SupabaseSync] Erro ao sincronizar inventory:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('[SupabaseSync] Falha na rede ao salvar inventory:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Carrega os itens e slots equipados da tabela `inventory`
   * 
   * @param {string} [userId]
   * @returns {Promise<{ success: boolean, data?: Object, error?: string }>}
   */
  async fetchInventory(userId = this.currentUserId) {
    if (!this.client || !userId) {
      return { success: false, error: 'Supabase não inicializado ou usuário anônimo.' };
    }

    try {
      const { data, error } = await this.client
        .from('inventory')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[SupabaseSync] Erro ao buscar inventory:', error.message);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: true, data: { items: [], equipped_weapon: null, equipped_skin: null } };
      }

      return {
        success: true,
        data: {
          purchasedItemIds: Array.isArray(data.items) ? data.items : [],
          equippedWeapon: data.equipped_weapon || null,
          equippedSkin: data.equipped_skin || null
        }
      };
    } catch (err) {
      console.error('[SupabaseSync] Falha na busca de inventory:', err);
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // SINCRONIZAÇÃO DA TABELA USER_PROFILE
  // ==========================================

  /**
   * Salva os dados de perfil (ouro, gemas, VIP, passe de torneio e temporada) na tabela `user_profile`
   * 
   * @param {string} [userId]
   * @param {Object} profileData
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async saveUserProfile(userId = this.currentUserId, profileData = {}) {
    if (!this.client || !userId) {
      return { success: false, error: 'Supabase não inicializado ou usuário anônimo.' };
    }

    try {
      const payload = {
        id: userId,
        updated_at: new Date().toISOString()
      };

      if (profileData.username !== undefined) payload.username = profileData.username;
      if (profileData.gold !== undefined) payload.wallet_gold = profileData.gold;
      if (profileData.gems !== undefined) payload.wallet_gems = profileData.gems;

      if (profileData.isVip !== undefined) payload.is_vip = profileData.isVip;
      if (profileData.vipExpiresAt !== undefined) payload.vip_expires_at = profileData.vipExpiresAt;

      if (profileData.hasTournamentPass !== undefined) payload.has_tournament_pass = profileData.hasTournamentPass;
      if (profileData.tournamentPassExpiresAt !== undefined) payload.tournament_pass_expires_at = profileData.tournamentPassExpiresAt;

      if (profileData.seasonProgress !== undefined) payload.season_progress = profileData.seasonProgress;

      const { data, error } = await this.client
        .from('user_profile')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.warn('[SupabaseSync] Erro ao sincronizar user_profile:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('[SupabaseSync] Falha na rede ao salvar user_profile:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Carrega os dados do jogador da tabela `user_profile`
   * 
   * @param {string} [userId]
   * @returns {Promise<{ success: boolean, data?: Object, error?: string }>}
   */
  async fetchUserProfile(userId = this.currentUserId) {
    if (!this.client || !userId) {
      return { success: false, error: 'Supabase não inicializado ou usuário anônimo.' };
    }

    try {
      const { data, error } = await this.client
        .from('user_profile')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[SupabaseSync] Erro ao buscar user_profile:', error.message);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: true, data: null };
      }

      return {
        success: true,
        data: {
          id: data.id,
          username: data.username,
          gold: data.wallet_gold || 0,
          gems: data.wallet_gems || 0,
          isVip: !!data.is_vip,
          vipExpiresAt: data.vip_expires_at || null,
          hasTournamentPass: !!data.has_tournament_pass,
          tournamentPassExpiresAt: data.tournament_pass_expires_at || null,
          seasonProgress: data.season_progress || null
        }
      };
    } catch (err) {
      console.error('[SupabaseSync] Falha na busca de user_profile:', err);
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // SINCRONIZAÇÃO COMPLETA
  // ==========================================

  /**
   * Sincroniza simultaneamente inventário e perfil do jogador
   * @param {string} userId
   * @param {Object} bundle { inventory: Object, profile: Object }
   */
  async syncAll(userId = this.currentUserId, bundle = {}) {
    if (!this.client || !userId) return { success: false };

    const [invResult, profResult] = await Promise.all([
      bundle.inventory ? this.saveInventory(userId, bundle.inventory) : Promise.resolve({ success: true }),
      bundle.profile ? this.saveUserProfile(userId, bundle.profile) : Promise.resolve({ success: true })
    ]);

    return {
      success: invResult.success && profResult.success,
      inventory: invResult,
      profile: profResult
    };
  }

  /**
   * Carrega todos os dados do jogador (perfil + inventário) em uma única operação
   * @param {string} userId 
   */
  async loadAll(userId = this.currentUserId) {
    if (!this.client || !userId) return { success: false };

    const [invResult, profResult] = await Promise.all([
      this.fetchInventory(userId),
      this.fetchUserProfile(userId)
    ]);

    return {
      success: invResult.success && profResult.success,
      inventory: invResult.data || null,
      profile: profResult.data || null
    };
  }
}
