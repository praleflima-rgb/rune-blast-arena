/**
 * @file supabaseSync.js
 * @description Modulo de sincronizacao com o Supabase — versao v3.
 *
 * TABELAS SINCRONIZADAS:
 *
 * inventory:
 *   user_id, items, equipped_weapon, equipped_skin, updated_at
 *
 * user_profile:
 *   id, username
 *   wallet_gold, wallet_gems
 *   is_vip, vip_expires_at
 *   ranked_tries, extra_tries, last_tries_update
 *   tournament_pass_active, tournament_pass_expires_at
 *   referral_code, referrals_count_today, referral_date_brt,
 *   referrals_total_count, referral_discount_percent
 *   prize_pool_brl
 *   season_progress
 *   updated_at
 *
 * MUDANCAS em relacao a v2:
 *   - Removidos: daily_reward_* (sistema de recompensas diarias descontinuado)
 *   - Adicionados: ranked_tries, extra_tries, last_tries_update
 *   - Adicionados: tournament_pass_active (renomeado de has_tournament_pass)
 *   - Adicionados: referral_code, referrals_count_today, referral_date_brt,
 *                  referrals_total_count, referral_discount_percent
 *   - Adicionado: prize_pool_brl (pool dinamico da temporada)
 */

export class SupabaseSync {
  /**
   * @param {Object} [options]
   * @param {Object} [options.client] Cliente Supabase pre-inicializado
   * @param {string} [options.url] URL do projeto Supabase
   * @param {string} [options.key] Chave Anon/Public do Supabase
   * @param {string} [options.userId] ID do usuario autenticado
   */
  constructor(options = {}) {
    this.client = options.client || null;

    if (!this.client && options.url && options.key && typeof window !== 'undefined' && window.supabase) {
      this.client = window.supabase.createClient(options.url, options.key);
    }

    this.currentUserId = options.userId || null;
    this.isSyncing = false;
  }

  setClient(client) { this.client = client; }
  setUserId(userId) { this.currentUserId = userId; }
  isConfigured() { return !!(this.client && this.currentUserId); }

  // ================================================================
  // TABELA: inventory
  // ================================================================

  /**
   * Salva inventario e equipamentos na tabela inventory.
   * @param {string} [userId]
   * @param {Object} inventoryData { purchasedItemIds, equippedWeapon, equippedSkin }
   */
  async saveInventory(userId = this.currentUserId, inventoryData = {}) {
    if (!this.client || !userId) return { success: false, error: 'Supabase nao inicializado ou usuario anonimo.' };
    try {
      const payload = {
        user_id: userId,
        items: inventoryData.purchasedItemIds || [],
        equipped_weapon: inventoryData.equippedWeapon || null,
        equipped_skin: inventoryData.equippedSkin || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await this.client.from('inventory').upsert(payload, { onConflict: 'user_id' });
      if (error) { console.warn('[SupabaseSync] Erro inventory:', error.message); return { success: false, error: error.message }; }
      return { success: true, data };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Carrega inventario da tabela inventory.
   * @param {string} [userId]
   */
  async fetchInventory(userId = this.currentUserId) {
    if (!this.client || !userId) return { success: false, error: 'Supabase nao inicializado.' };
    try {
      const { data, error } = await this.client.from('inventory').select('*').eq('user_id', userId).maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!data) return { success: true, data: { items: [], equipped_weapon: null, equipped_skin: null } };
      return { success: true, data: { purchasedItemIds: Array.isArray(data.items) ? data.items : [], equippedWeapon: data.equipped_weapon || null, equippedSkin: data.equipped_skin || null } };
    } catch (err) { return { success: false, error: err.message }; }
  }

  // ================================================================
  // TABELA: user_profile (v3 — com ranked, referral, prize pool)
  // ================================================================

  /**
   * Salva o perfil completo do jogador (v3).
   * Aceita qualquer subconjunto dos campos — apenas os presentes serao atualizados.
   *
   * @param {string} [userId]
   * @param {Object} profileData
   *   gold, gems,
   *   isVip, vipExpiresAt,
   *   rankedTries, extraTries, lastTriesUpdate,
   *   tournamentPassActive, tournamentPassExpiresAt,
   *   referralCode, referralsCountToday, referralDateBRT,
   *   referralsTotalCount, referralDiscountPercent,
   *   prizePoolBRL,
   *   seasonProgress, username
   */
  async saveUserProfile(userId = this.currentUserId, profileData = {}) {
    if (!this.client || !userId) return { success: false, error: 'Supabase nao inicializado.' };
    try {
      const payload = { id: userId, updated_at: new Date().toISOString() };

      // Identidade
      if (profileData.username !== undefined) payload.username = profileData.username;

      // Carteira
      if (profileData.gold !== undefined) payload.wallet_gold = profileData.gold;
      if (profileData.gems !== undefined) payload.wallet_gems = profileData.gems;

      // VIP
      if (profileData.isVip !== undefined) payload.is_vip = profileData.isVip;
      if (profileData.vipExpiresAt !== undefined) payload.vip_expires_at = profileData.vipExpiresAt;

      // Tentativas (Ranked)
      if (profileData.rankedTries !== undefined) payload.ranked_tries = profileData.rankedTries;
      if (profileData.extraTries !== undefined) payload.extra_tries = profileData.extraTries;
      if (profileData.lastTriesUpdate !== undefined) {
        payload.last_tries_update = new Date(profileData.lastTriesUpdate).toISOString();
      }

      // Passe de Torneio
      if (profileData.tournamentPassActive !== undefined) payload.tournament_pass_active = profileData.tournamentPassActive;
      if (profileData.tournamentPassExpiresAt !== undefined) payload.tournament_pass_expires_at = profileData.tournamentPassExpiresAt;

      // Indicacoes
      if (profileData.referralCode !== undefined) payload.referral_code = profileData.referralCode;
      if (profileData.referralsCountToday !== undefined) payload.referrals_count_today = profileData.referralsCountToday;
      if (profileData.referralDateBRT !== undefined) payload.referral_date_brt = profileData.referralDateBRT;
      if (profileData.referralsTotalCount !== undefined) payload.referrals_total_count = profileData.referralsTotalCount;
      if (profileData.referralDiscountPercent !== undefined) payload.referral_discount_percent = profileData.referralDiscountPercent;

      // Premio da Temporada
      if (profileData.prizePoolBRL !== undefined) payload.prize_pool_brl = profileData.prizePoolBRL;

      // Progresso da Temporada
      if (profileData.seasonProgress !== undefined) payload.season_progress = profileData.seasonProgress;

      const { data, error } = await this.client.from('user_profile').upsert(payload, { onConflict: 'id' });
      if (error) { console.warn('[SupabaseSync] Erro user_profile:', error.message); return { success: false, error: error.message }; }
      return { success: true, data };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Carrega perfil completo do jogador (v3).
   * @param {string} [userId]
   */
  async fetchUserProfile(userId = this.currentUserId) {
    if (!this.client || !userId) return { success: false, error: 'Supabase nao inicializado.' };
    try {
      const { data, error } = await this.client.from('user_profile').select('*').eq('id', userId).maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!data) return { success: true, data: null };

      return {
        success: true,
        data: {
          id: data.id,
          username: data.username,

          // Carteira
          gold: data.wallet_gold || 0,
          gems: data.wallet_gems || 0,

          // VIP
          isVip: !!data.is_vip,
          vipExpiresAt: data.vip_expires_at || null,

          // Ranked
          rankedTries: data.ranked_tries ?? 3,
          extraTries: data.extra_tries ?? 0,
          lastTriesUpdate: data.last_tries_update || null,

          // Torneio
          tournamentPassActive: !!data.tournament_pass_active,
          tournamentPassExpiresAt: data.tournament_pass_expires_at || null,

          // Indicacoes
          referralCode: data.referral_code || null,
          referralsCountToday: data.referrals_count_today || 0,
          referralDateBRT: data.referral_date_brt || null,
          referralsTotalCount: data.referrals_total_count || 0,
          referralDiscountPercent: data.referral_discount_percent || 0,

          // Premio
          prizePoolBRL: data.prize_pool_brl || 100.00,

          // Temporada
          seasonProgress: data.season_progress || null,
        }
      };
    } catch (err) { return { success: false, error: err.message }; }
  }

  // ================================================================
  // SINCRONIZACAO COMBINADA
  // ================================================================

  async syncAll(userId = this.currentUserId, bundle = {}) {
    if (!this.client || !userId) return { success: false };
    const [invResult, profResult] = await Promise.all([
      bundle.inventory ? this.saveInventory(userId, bundle.inventory) : Promise.resolve({ success: true }),
      bundle.profile ? this.saveUserProfile(userId, bundle.profile) : Promise.resolve({ success: true })
    ]);
    return { success: invResult.success && profResult.success, inventory: invResult, profile: profResult };
  }

  async loadAll(userId = this.currentUserId) {
    if (!this.client || !userId) return { success: false };
    const [invResult, profResult] = await Promise.all([
      this.fetchInventory(userId),
      this.fetchUserProfile(userId)
    ]);
    return { success: invResult.success && profResult.success, inventory: invResult.data || null, profile: profResult.data || null };
  }
}
