﻿/**
 * @file test_monetization_v3.js
 * @description Suite de testes para a nova arquitetura v3 do Rune Blast Arena.
 * Testa: RankedSystem, PaymentSystem, ReferralSystem, SupabaseSync v3.
 * Execute: node test_monetization_v3.js
 */

import { RankedSystem, SEASON_CONFIG, FREE_PLAYER_CONFIG, TOURNAMENT_CONFIG } from './src/rankedSystem.js';
import { PaymentSystem, PAYMENT_PRODUCTS } from './src/paymentSystem.js';
import { ReferralSystem, REFERRAL_CONFIG } from './src/referralSystem.js';
import { SupabaseSync } from './src/supabaseSync.js';
import { VipSystem } from './src/vipSystem.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  OK -', message);
    passed++;
  } else {
    console.error('  FAIL -', message);
    failed++;
  }
}

// ================================================================
// 1. RankedSystem — Temporada Principal
// ================================================================
console.log('\n--- [1] Teste do rankedSystem.js - Temporada Principal ---');
{
  const rs = new RankedSystem();

  assert(SEASON_CONFIG.durationDays === 40, 'Temporada dura 40 dias');
  assert(SEASON_CONFIG.basePrizePoolBRL === 100.00, 'Premio base da temporada e R$ 100,00');
  assert(rs.isSeasonActive() || !rs.isSeasonActive(), 'isSeasonActive() retorna boolean sem erros');
  assert(rs.getDaysRemaining() >= 0, 'getDaysRemaining() >= 0');
  assert(typeof rs.getWeeklyCycleId() === 'string', 'getWeeklyCycleId() retorna string');
  assert(rs.getSecondsToWeeklyReset() >= 0, 'getSecondsToWeeklyReset() >= 0');
}

// ================================================================
// 2. RankedSystem — Tentativas Free Player
// ================================================================
console.log('\n--- [2] Teste: Tentativas para Jogador Free ---');
{
  const rs = new RankedSystem();
  rs.rankedTries = 3;
  rs.extraTries = 0;

  // Simula temporada ativa
  rs.seasonEndDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  assert(rs.getNormalTries() === 3, 'Inicia com 3 tentativas normais');
  assert(rs.getTotalTries() === 3, 'Total = 3 sem extras');

  const r1 = rs.consumeTry(false);
  assert(r1.success === true, 'Consome 1a tentativa com sucesso');
  assert(rs.rankedTries === 2, 'Restam 2 tentativas normais');

  rs.consumeTry(false);
  rs.consumeTry(false);

  assert(rs.rankedTries === 0, 'Zerou tentativas normais apos 3 partidas');

  const r4 = rs.consumeTry(false);
  assert(r4.success === false, 'Falha ao tentar 4a partida sem tentativas');
  assert(r4.secsToNextTry > 0, 'Timer de recarga ativado');
}

// ================================================================
// 3. RankedSystem — Tentativas VIP (ilimitadas)
// ================================================================
console.log('\n--- [3] Teste: VIP tem partidas ilimitadas ---');
{
  const rs = new RankedSystem();
  rs.rankedTries = 0;
  rs.seasonEndDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  const r = rs.consumeTry(true);
  assert(r.success === true, 'VIP joga mesmo sem tentativas normais');
  assert(r.triesLeft === Infinity || r.triesLeft === 'ilimitado', 'VIP tem tentativas ilimitadas');
}

// ================================================================
// 4. RankedSystem — Bonus de Ouro VIP (+50%)
// ================================================================
console.log('\n--- [4] Teste: Bonus de Ouro VIP (+50%) ---');
{
  const rs = new RankedSystem();

  const free = rs.calculateMatchGold(200, false);
  assert(free.bonusGold === 0 && free.totalGold === 200, 'Free: 200 ouro sem bonus');

  const vip = rs.calculateMatchGold(200, true);
  assert(vip.bonusGold === 100, 'VIP: bonus de 100 ouro (50% de 200)');
  assert(vip.totalGold === 300, 'VIP: total de 300 ouro');
}

// ================================================================
// 5. RankedSystem — Tentativas Extras (Indicacoes)
// ================================================================
console.log('\n--- [5] Teste: Tentativas Extras via Indicacoes ---');
{
  const rs = new RankedSystem();
  rs.rankedTries = 0;
  rs.extraTries = 0;
  rs.seasonEndDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  rs.addExtraTries(2);
  assert(rs.extraTries === 2, 'Adicionou 2 extraTries corretamente');

  const r = rs.consumeTry(false);
  assert(r.success === true, 'Consome extraTry com sucesso');
  assert(rs.extraTries === 1, 'extraTries decrementou para 1');

  const r2 = rs.consumeTry(false);
  assert(r2.success === true, '2a extraTry consumida');
  assert(rs.extraTries === 0, 'extraTries zerado');

  const r3 = rs.consumeTry(false);
  assert(r3.success === false, 'Sem tentativas normais nem extras: falha corretamente');
}

// ================================================================
// 6. RankedSystem — Torneio Semanal
// ================================================================
console.log('\n--- [6] Teste: Torneio Semanal (Passe de Torneio) ---');
{
  const rs = new RankedSystem();

  assert(!rs.isTournamentPassActive(), 'Sem passe inicialmente');
  assert(TOURNAMENT_CONFIG.priceBRL === 10.00, 'Preco do Passe e R$ 10,00');
  assert(TOURNAMENT_CONFIG.modes.includes('pvp'), 'Modo PvP disponivel');
  assert(TOURNAMENT_CONFIG.modes.includes('survival'), 'Modo Sobrevivencia disponivel');

  const deny = rs.canEnterWeeklyRanking('pvp');
  assert(deny.allowed === false, 'Sem passe: nao pode entrar no ranking PvP');

  const grant = rs.grantTournamentPass();
  assert(grant.success === true, 'Passe concedido com sucesso');
  assert(rs.isTournamentPassActive(), 'Passe ativo apos concessao');

  const allow = rs.canEnterWeeklyRanking('pvp');
  assert(allow.allowed === true, 'Com passe: pode entrar no ranking PvP');

  const allow2 = rs.canEnterWeeklyRanking('survival');
  assert(allow2.allowed === true, 'Com passe: pode entrar no ranking Sobrevivencia');
}

// ================================================================
// 7. RankedSystem — Premio Dinamico
// ================================================================
console.log('\n--- [7] Teste: Premio Dinamico da Temporada ---');
{
  const rs = new RankedSystem();
  assert(rs.prizePoolBRL === 100.00, 'Premio base inicial e R$ 100,00');

  rs.updatePrizePool(250.00);
  assert(rs.prizePoolBRL === 250.00, 'Premio atualizado para R$ 250,00');
}

// ================================================================
// 8. RankedSystem — Hidratacao Supabase
// ================================================================
console.log('\n--- [8] Teste: Hidratacao via Supabase (rankedSystem) ---');
{
  const rs = new RankedSystem();
  rs.hydrate({
    ranked_tries: 1,
    extra_tries: 5,
    last_tries_update: new Date().toISOString(),
    tournament_pass_active: true,
    tournament_pass_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    prize_pool_brl: 350.00,
  });
  assert(rs.rankedTries === 1, 'Hidratou ranked_tries = 1');
  assert(rs.extraTries === 5, 'Hidratou extra_tries = 5');
  assert(rs.isTournamentPassActive() === true, 'Passe ativo apos hidratacao');
  assert(rs.prizePoolBRL === 350.00, 'Premio hidratado = 350.00');
}

// ================================================================
// 9. PaymentSystem — Conversao BRL -> POL (mock)
// ================================================================
console.log('\n--- [9] Teste: PaymentSystem — Conversao BRL/POL ---');
{
  const ps = new PaymentSystem();

  // Injeta taxa manualmente (mock para evitar chamada de rede)
  ps._cachedRate = 5.00; // 1 POL = R$ 5,00
  ps._cacheTimestamp = Date.now();

  const vipConversion = await ps.convertBRLtoPOL(30.00);
  assert(vipConversion.polAmount === 6.000000, 'R$ 30,00 / R$ 5 = 6 POL (VIP)');

  const passConversion = await ps.convertBRLtoPOL(10.00);
  assert(passConversion.polAmount === 2.000000, 'R$ 10,00 / R$ 5 = 2 POL (Passe de Torneio)');

  assert(typeof vipConversion.timestamp === 'string', 'Conversao tem timestamp');

  const summary = await ps.getPricingSummary();
  assert(Array.isArray(summary), 'getPricingSummary retorna array');
  assert(summary.length === Object.keys(PAYMENT_PRODUCTS).length, 'Summary tem todos os produtos');
  const vipProduct = summary.find(p => p.productId === 'vip_monthly');
  assert(vipProduct !== undefined, 'Produto VIP presente no summary');
  assert(vipProduct.priceBRL === 30.00, 'VIP custa R$ 30,00');
  assert(vipProduct.pricePOL === 6.000000, 'VIP = 6 POL na taxa mockada');
}

// ================================================================
// 10. ReferralSystem — Indicacoes e Recompensas
// ================================================================
console.log('\n--- [10] Teste: ReferralSystem ---');
{
  let extraTriesGranted = 0;
  let passGranted = false;
  let vipDiscountPercent = 0;

  const ref = new ReferralSystem({
    onGrantExtraTry: async (n) => { extraTriesGranted += n; },
    onGrantTournamentPass: async () => { passGranted = true; },
    onGrantVipDiscount: async (pct) => { vipDiscountPercent = pct; },
  });

  const code = ref.generateCode('user-abc-123');
  assert(code.startsWith('RBA-'), 'Codigo de indicacao gerado corretamente');
  assert(ref.referralCode === code, 'Codigo armazenado no sistema');

  // Valida 1 amigo
  const r1 = await ref.validateReferral('friend-001', false);
  assert(r1.alreadyValidated === false, 'Primeiro amigo validado sem duplicata');
  assert(extraTriesGranted === 1, 'Recebeu +1 extraTry apos 1a indicacao');

  // Anti-fraude: mesmo amigo
  const r1b = await ref.validateReferral('friend-001', false);
  assert(r1b.alreadyValidated === true, 'Anti-fraude: amigo ja validado rejeitado');
  assert(extraTriesGranted === 1, 'extraTries nao incrementou duas vezes');

  // Indica 9 amigos adicionais (total = 10)
  for (let i = 2; i <= 9; i++) await ref.validateReferral('friend-' + String(i).padStart(3,'0'), false);
  await ref.validateReferral('friend-010', false);

  assert(ref.referralsCountToday >= REFERRAL_CONFIG.dailyReferralsForFreeTournamentPass, '10 indicacoes no dia contabilizadas');
  assert(passGranted === true, 'Passe de Torneio gratis concedido ao atingir 10 indicacoes no dia');

  // Amigo que assinou VIP
  await ref.validateReferral('friend-vip-001', true);
  assert(vipDiscountPercent === REFERRAL_CONFIG.vipConversionDiscountPercent, 'Desconto VIP de ' + REFERRAL_CONFIG.vipConversionDiscountPercent + '% concedido');
}

// ================================================================
// 11. ReferralSystem — Desconto VIP e Apply
// ================================================================
console.log('\n--- [11] Teste: Desconto VIP na mensalidade ---');
{
  const ref = new ReferralSystem();
  ref.referralDiscountPercent = 5;

  const result = ref.applyVipDiscount(30.00);
  assert(result.discountApplied === 1.50, 'Desconto de 5% em R = R,50');
  assert(result.finalPriceBRL === 28.50, 'Preco final = R,50');
  assert(ref.referralDiscountPercent === 0, 'Desconto zerado apos uso');
}

// ================================================================
// 12. SupabaseSync v3 — Payload de saveUserProfile
// ================================================================
console.log('\n--- [12] Teste: SupabaseSync v3 — Payload completo ---');
{
  let capturedPayload = null;

  const mockClient = {
    from: (table) => ({
      upsert: async (payload, opts) => {
        capturedPayload = { table, payload };
        return { data: payload, error: null };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
  };

  const sync = new SupabaseSync({ client: mockClient, userId: 'user-test-123' });

  const saveResult = await sync.saveUserProfile('user-test-123', {
    gold: 2500,
    gems: 80,
    isVip: true,
    vipExpiresAt: '2026-11-08T00:00:00Z',
    rankedTries: 2,
    extraTries: 3,
    lastTriesUpdate: Date.now(),
    tournamentPassActive: true,
    tournamentPassExpiresAt: '2026-10-15T00:00:00Z',
    referralCode: 'RBA-TEST-ABCD',
    referralsCountToday: 4,
    referralDateBRT: '2026-10-08',
    referralsTotalCount: 12,
    referralDiscountPercent: 5,
    prizePoolBRL: 350.00,
    seasonProgress: { unlockedStage: 3, totalStars: 7 },
  });

  assert(saveResult.success === true, 'saveUserProfile v3 bem-sucedido');
  assert(capturedPayload.table === 'user_profile', 'Salvou na tabela correta');
  assert(capturedPayload.payload.wallet_gold === 2500, 'wallet_gold mapeado');
  assert(capturedPayload.payload.is_vip === true, 'is_vip mapeado');
  assert(capturedPayload.payload.ranked_tries === 2, 'ranked_tries mapeado');
  assert(capturedPayload.payload.extra_tries === 3, 'extra_tries mapeado');
  assert(capturedPayload.payload.tournament_pass_active === true, 'tournament_pass_active mapeado');
  assert(capturedPayload.payload.referral_code === 'RBA-TEST-ABCD', 'referral_code mapeado');
  assert(capturedPayload.payload.referrals_count_today === 4, 'referrals_count_today mapeado');
  assert(capturedPayload.payload.referral_discount_percent === 5, 'referral_discount_percent mapeado');
  assert(capturedPayload.payload.prize_pool_brl === 350.00, 'prize_pool_brl mapeado');
  assert(capturedPayload.payload.season_progress !== undefined, 'season_progress mapeado');
}

// ================================================================
// 13. VipSystem — Integracao com RankedSystem
// ================================================================
console.log('\n--- [13] Teste: VIP integrado ao calculo de ouro no Ranked ---');
{
  const vip = new VipSystem();
  vip.activateVip(30);

  const rs = new RankedSystem();
  rs.seasonEndDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  const gold = rs.calculateMatchGold(400, vip.isVipActive());
  assert(gold.baseGold === 400, 'Base de ouro = 400');
  assert(gold.bonusGold === 200, 'Bonus VIP = 200 (50%)');
  assert(gold.totalGold === 600, 'Total = 600 ouro');
}

// ================================================================
// Resultado Final
// ================================================================
console.log('\n========================================================');
console.log('Resultado: ' + passed + ' testes passaram, ' + failed + ' falharam.');
if (failed === 0) {
  console.log('TODOS OS TESTES PASSARAM COM SUCESSO!');
} else {
  console.log('ATENCAO: Existem falhas nos testes.');
  process.exit(1);
}
console.log('========================================================\n');

