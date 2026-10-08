/**
 * @file index.js
 * @description Fachada principal da economia do Rune Blast Arena (v3).
 *
 * Integra todos os modulos:
 *   - VipSystem          — assinatura VIP (R$ 30/mes em POL)
 *   - RankedSystem       — tentativas, torneios semanais, temporada 40 dias
 *   - PaymentSystem      — conversao BRL -> POL (CoinGecko/CryptoCompare)
 *   - ReferralSystem     — Indique e Ganhe com anti-fraude
 *   - ShopInventorySystem — loja e inventario de itens
 *   - SeasonManager      — modo historia por temporadas
 *   - SupabaseSync       — persistencia remota (v3)
 *
 * Modulos REMOVIDOS nesta versao:
 *   - adManager.js            (anuncios Google H5 — descontinuado)
 *   - dailyRewardSystem.js    (recompensas diarias — descontinuado)
 */

export { VipSystem } from './vipSystem.js';
export { RankedSystem, SEASON_CONFIG, FREE_PLAYER_CONFIG, VIP_PLAYER_CONFIG, TOURNAMENT_CONFIG } from './rankedSystem.js';
export { PaymentSystem, PAYMENT_PRODUCTS } from './paymentSystem.js';
export { ReferralSystem, REFERRAL_CONFIG } from './referralSystem.js';
export { ShopInventorySystem, SHOP_CATALOG } from './shopInventorySystem.js';
export { SeasonManager, CURRENT_SEASON, WEEKLY_EVENT_CONFIG } from './seasonManager.js';
export { SupabaseSync } from './supabaseSync.js';
export { HeroController } from './heroController.js';

// ================================================================
// RuneBlastEconomy — Fachada de alto nivel
// ================================================================

import { VipSystem } from './vipSystem.js';
import { RankedSystem } from './rankedSystem.js';
import { PaymentSystem } from './paymentSystem.js';
import { ReferralSystem } from './referralSystem.js';
import { ShopInventorySystem } from './shopInventorySystem.js';
import { SeasonManager } from './seasonManager.js';
import { SupabaseSync } from './supabaseSync.js';
import { HeroController } from './heroController.js';

export class RuneBlastEconomy {
  /**
   * @param {Object} [options]
   * @param {Object} [options.supabase]        Cliente Supabase pre-inicializado
   * @param {string} [options.supabaseUrl]     URL do Supabase
   * @param {string} [options.supabaseKey]     Chave anon do Supabase
   * @param {string} [options.userId]          ID do jogador autenticado
   * @param {string} [options.walletAddress]   Endereco Polygon do jogador
   * @param {number} [options.initialGold]     Ouro inicial
   * @param {number} [options.initialGems]     Gemas iniciais
   */
  constructor(options = {}) {
    const userId = options.userId || null;

    // Sincronizacao Supabase
    this.sync = new SupabaseSync({
      client: options.supabase || null,
      url: options.supabaseUrl,
      key: options.supabaseKey,
      userId,
    });

    // VIP
    this.vip = new VipSystem({
      onSyncRequested: (state) => {
        if (userId) this.sync.saveUserProfile(userId, { isVip: state.isVip, vipExpiresAt: state.expiresAt });
      }
    });

    // Ranked + Torneios
    this.ranked = new RankedSystem({
      onSyncRequested: (state) => {
        if (userId) this.sync.saveUserProfile(userId, {
          rankedTries: state.rankedTries,
          extraTries: state.extraTries,
          lastTriesUpdate: state.lastTriesUpdate,
          tournamentPassActive: state.tournamentPassActive,
          tournamentPassExpiresAt: state.tournamentPassExpiresAt,
        });
      }
    });

    // Pagamentos Polygon
    this.payment = new PaymentSystem({ walletAddress: options.walletAddress });

    // Indicacoes
    this.referral = new ReferralSystem({
      onSyncRequested: (state) => {
        if (userId) this.sync.saveUserProfile(userId, {
          referralCode: state.referralCode,
          referralsCountToday: state.referralsCountToday,
          referralDateBRT: state.referralDateBRT,
          referralsTotalCount: state.referralsTotalCount,
          referralDiscountPercent: state.referralDiscountPercent,
        });
      },
      onGrantExtraTry: (amount) => this.ranked.addExtraTries(amount),
      onGrantTournamentPass: () => this.ranked.grantTournamentPass(),
      onGrantVipDiscount: (pct) => console.log([Economy] Desconto VIP de % pendente para proximo pagamento.),
    });

    // Loja / Inventario
    this.shop = new ShopInventorySystem({
      initialGold: options.initialGold || 1000,
      initialGems: options.initialGems || 0,
    });

    // Modo Historia / Temporadas
    this.season = new SeasonManager();

    // Controlador do Heroi
    this.hero = new HeroController();

    // Codigo de indicacao
    if (userId) this.referral.generateCode(userId);
  }

  /**
   * Carrega todos os dados do jogador do Supabase e hidrata os modulos.
   * @param {string} [userId]
   */
  async loadFromSupabase(userId) {
    if (userId) this.sync.setUserId(userId);
    const result = await this.sync.loadAll();
    if (!result.success) return result;

    const profile = result.profile;
    if (profile) {
      this.vip.hydrate({ is_vip: profile.isVip, vip_expires_at: profile.vipExpiresAt });
      this.ranked.hydrate({
        ranked_tries: profile.rankedTries,
        extra_tries: profile.extraTries,
        last_tries_update: profile.lastTriesUpdate,
        tournament_pass_active: profile.tournamentPassActive,
        tournament_pass_expires_at: profile.tournamentPassExpiresAt,
        prize_pool_brl: profile.prizePoolBRL,
      });
      this.referral.hydrate({
        referral_code: profile.referralCode,
        referrals_count_today: profile.referralsCountToday,
        referral_date_brt: profile.referralDateBRT,
        referrals_total_count: profile.referralsTotalCount,
        referral_discount_percent: profile.referralDiscountPercent,
      });
      if (profile.gold !== undefined) this.shop.wallet.gold = profile.gold;
      if (profile.gems !== undefined) this.shop.wallet.gems = profile.gems;
      if (profile.seasonProgress) this.season.hydrate({ season_progress: profile.seasonProgress });
    }

    if (result.inventory) {
      this.shop.hydrate(result.inventory);
    }

    return result;
  }

  /**
   * Retorna snapshot completo do estado atual para a UI.
   */
  getFullStatus() {
    const isVip = this.vip.isVipActive();
    return {
      vip: this.vip.getStatus(),
      ranked: this.ranked.getStatus(isVip),
      referral: this.referral.getStatus(),
      wallet: { gold: this.shop.wallet.gold, gems: this.shop.wallet.gems },
      hero: this.hero.getStats(),
    };
  }
}
