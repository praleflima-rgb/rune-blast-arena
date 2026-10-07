/**
 * @file test_monetization.js
 * @description Suite de testes automatizados para validar a reestruturação
 *              da economia, monetização, VIP, Loja e Supabase no Rune Blast Arena.
 */

import {
  DailyRewardSystem,
  ShopInventorySystem,
  HeroController,
  VipSystem,
  SeasonManager,
  SupabaseSync,
  RuneBlastEconomy,
  SHOP_CATALOG,
  CURRENT_SEASON
} from './src/index.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ SUCESSO: ${message}`);
  passed++;
}

console.log('========================================================');
console.log('🎮 INICIANDO TESTES DO RUNE BLAST ARENA - NOVA ECONOMIA');
console.log('========================================================\n');

// ----------------------------------------------------
// TESTE 1: REMOÇÃO DE ANÚNCIOS & RECOMPENSAS DIÁRIAS COM 1 CLIQUE
// ----------------------------------------------------
console.log('--- [1] Teste do dailyRewardSystem.js (Sem Anúncios) ---');
const dailySystem = new DailyRewardSystem();
const initialStatus = dailySystem.getStatus();
assert(initialStatus.canClaim === true, 'Recompensa do Dia 1 deve estar disponível para resgate inicial.');
assert(initialStatus.currentDay === 1, 'Inicia no Dia 1 do ciclo de 7 dias.');

// Resgate direto com 1 clique (SEM ANÚNCIO)
const claimResult = dailySystem.claimDailyReward();
assert(claimResult.success === true, 'Resgate direto com 1 clique realizado com sucesso.');
assert(claimResult.rewards.gold === 250, 'Dia 1 concede 250 moedas de ouro.');
assert(claimResult.rewards.gems === 5, 'Dia 1 concede 5 gemas.');
assert(claimResult.multiplier === 1, 'Multiplicador padrão sem VIP é 1x.');

// Tentativa de resgate duplo no mesmo dia deve ser bloqueada
const secondClaim = dailySystem.claimDailyReward();
assert(secondClaim.success === false, 'Bloqueia múltiplos resgates no mesmo dia.');

// ----------------------------------------------------
// TESTE 2: SISTEMA VIP (+50% OURO E 2X RECOMPENSAS DIÁRIAS)
// ----------------------------------------------------
console.log('\n--- [2] Teste do vipSystem.js ---');
const vipSystem = new VipSystem();
assert(vipSystem.isVipActive() === false, 'VIP inicialmente inativo.');

// Verifica bónus de ouro de fim de partida sem VIP
const matchNoVip = vipSystem.calculateMatchReward(100);
assert(matchNoVip.totalGold === 100 && matchNoVip.bonusGold === 0, 'Sem VIP: 100 ouro base = 100 ouro total.');

// Ativa VIP por 30 dias
const vipActivation = vipSystem.activateVip(30);
assert(vipActivation.success === true && vipSystem.isVipActive() === true, 'VIP ativado com sucesso.');
assert(vipSystem.expiresAt !== null, 'Data de expiração do VIP definida.');

// Bónus de +50% de ouro ativo ao terminar partidas
const matchWithVip = vipSystem.calculateMatchReward(100);
assert(matchWithVip.totalGold === 150, 'Com VIP: 100 ouro base + 50% bónus = 150 ouro total.');
assert(matchWithVip.bonusGold === 50, 'Bónus de ouro calculado exatamente em 50.');

// Teste de Recompensas Diárias DOBRADAS (2x) com VIP
console.log('\n--- [2.1] Teste de Recompensa Diária com VIP Ativo ---');
const dailyWithVip = new DailyRewardSystem({ vipSystem });
assert(dailyWithVip.getMultiplier() === 2, 'Multiplicador diário deve ser 2x quando VIP está ativo.');

// Força disponibilidade para testar o resgate dobrado
dailyWithVip.state.lastClaimTimestamp = null;
const claimVipResult = dailyWithVip.claimDailyReward();
assert(claimVipResult.success === true, 'Resgate com VIP efetuado.');
assert(claimVipResult.rewards.gold === 500, 'Ouro dobrado: 250 * 2 = 500 ouro.');
assert(claimVipResult.rewards.gems === 10, 'Gemas dobradas: 5 * 2 = 10 gemas.');
assert(claimVipResult.multiplier === 2, 'Multiplicador reportado é 2x.');

// ----------------------------------------------------
// TESTE 3: LOJA (SHOP) & CATÁLOGO POR CATEGORIAS
// ----------------------------------------------------
console.log('\n--- [3] Teste do shopInventorySystem.js (Loja) ---');
const shopSystem = new ShopInventorySystem();

// Valida catálogo por categorias
const skins = shopSystem.getShopCatalog({ type: 'skin' });
assert(skins.length >= 4, 'Catálogo de Roupas/Skins contém ao menos 4 skins.');

const staffs = shopSystem.getShopCatalog({ category: 'staff' });
const swords = shopSystem.getShopCatalog({ category: 'sword' });
const axes = shopSystem.getShopCatalog({ category: 'axe' });
assert(staffs.length >= 2, 'Catálogo de Cajados contém itens configurados.');
assert(swords.length >= 2, 'Catálogo de Espadas contém itens configurados.');
assert(axes.length >= 2, 'Catálogo de Machados contém itens configurados.');

// Valida propriedades obrigatórias de cada item
const sampleItem = SHOP_CATALOG[0];
assert(
  sampleItem.id &&
  sampleItem.name &&
  sampleItem.type &&
  sampleItem.price &&
  sampleItem.currency &&
  sampleItem.stats &&
  sampleItem.stats.damage !== undefined &&
  sampleItem.stats.speed !== undefined &&
  sampleItem.stats.health !== undefined &&
  (sampleItem.spriteUrl || sampleItem.color),
  'Item do catálogo contém todos os campos obrigatórios (id, name, type, price, currency, stats, spriteUrl/color).'
);

// ----------------------------------------------------
// TESTE 4: INVENTÁRIO, EQUIPAMENTOS & INTEGRAÇÃO COM HEROCONTROLLER
// ----------------------------------------------------
console.log('\n--- [4] Teste de Inventário, Equipamentos e HeroController ---');
const hero = new HeroController({ characterKey: 'vesper' });
shopSystem.setHeroController(hero);

const initialHeroStats = hero.getEffectiveStats();
assert(initialHeroStats.damage === 20, 'Dano base inicial do herói é 20.');
assert(initialHeroStats.health === 100, 'Vida máxima base inicial do herói é 100.');
assert(initialHeroStats.speed === 1.0, 'Velocidade base inicial do herói é 1.0.');

// Tentativa de equipar item sem possuir deve falhar
const equipUnowned = shopSystem.equipItem('sword_rune_blade');
assert(equipUnowned.success === false, 'Não é permitido equipar item não comprado.');

// Perfil de teste com moedas
const playerProfile = {
  gold: 5000,
  gems: 200,
  deductCurrency(curr, amt) {
    if (curr === 'gems') this.gems -= amt;
    else this.gold -= amt;
  }
};

// Compra Espada Rúnica (arma: dano +20, speed +0.1, health +20, price: 1500 ouro)
const buySword = shopSystem.buyItem('sword_rune_blade', playerProfile);
assert(buySword.success === true, 'Compra da Lâmina Rúnica realizada com sucesso.');
assert(playerProfile.gold === 3500, 'Saldo de ouro deduzido corretamente (5000 - 1500 = 3500).');
assert(shopSystem.ownsItem('sword_rune_blade') === true, 'Item registrado no inventário como purchased: true.');

// Compra Manto do Vazio (skin: dano +5, speed +0.1, health +25, price: 1200 ouro)
const buySkin = shopSystem.buyItem('skin_vesper_void', playerProfile);
assert(buySkin.success === true, 'Compra do Manto do Vazio realizada com sucesso.');
assert(playerProfile.gold === 2300, 'Saldo de ouro atualizado após compra de skin (3500 - 1200 = 2300).');

// Equipa a Espada no slot equippedWeapon
const equipWeaponResult = shopSystem.equipItem('sword_rune_blade');
assert(equipWeaponResult.success === true, 'Espada equipada no slot equippedWeapon.');
assert(shopSystem.equippedWeapon === 'sword_rune_blade', 'Slot equippedWeapon atualizado.');

// Validação dos bónus da arma aplicados no HeroController:
// Dano: 20 base + 20 arma = 40
// Vida: 100 base + 20 arma = 120
// Velocidade: 1.0 base + 0.1 arma = 1.1
let heroWithWeapon = hero.getEffectiveStats();
assert(heroWithWeapon.damage === 40, `Bónus de arma aplicado no herói: Dano esperado 40, obtido ${heroWithWeapon.damage}.`);
assert(heroWithWeapon.maxHealth === 120, `Bónus de arma aplicado no herói: Vida esperada 120, obtido ${heroWithWeapon.maxHealth}.`);
assert(heroWithWeapon.speed === 1.1, `Bónus de arma aplicado no herói: Velocidade esperada 1.1, obtido ${heroWithWeapon.speed}.`);

// Equipa a Skin no slot equippedSkin
const equipSkinResult = shopSystem.equipItem('skin_vesper_void');
assert(equipSkinResult.success === true, 'Skin equipada no slot equippedSkin.');
assert(shopSystem.equippedSkin === 'skin_vesper_void', 'Slot equippedSkin atualizado.');

// Validação dos bónus somados (Arma + Skin) no HeroController:
// Dano: 20 base + 20 arma + 5 skin = 45
// Vida: 100 base + 20 arma + 25 skin = 145
// Velocidade: 1.0 base + 0.1 arma + 0.1 skin = 1.2
let heroFullyEquipped = hero.getEffectiveStats();
assert(heroFullyEquipped.damage === 45, `Bónus combinado aplicado: Dano esperado 45, obtido ${heroFullyEquipped.damage}.`);
assert(heroFullyEquipped.maxHealth === 145, `Bónus combinado aplicado: Vida esperada 145, obtido ${heroFullyEquipped.maxHealth}.`);
assert(heroFullyEquipped.speed === 1.2, `Bónus combinado aplicado: Velocidade esperada 1.2, obtido ${heroFullyEquipped.speed}.`);

// Teste de desequipar arma
shopSystem.unequipItem('weapon');
assert(shopSystem.equippedWeapon === null, 'Arma desequipada com sucesso.');
const heroAfterUnequip = hero.getEffectiveStats();
assert(heroAfterUnequip.damage === 25, `Dano recalculado após desequipar: Esperado 25, obtido ${heroAfterUnequip.damage}.`);
assert(heroAfterUnequip.maxHealth === 125, `Vida recalculada após desequipar: Esperada 125, obtida ${heroAfterUnequip.maxHealth}.`);

// ----------------------------------------------------
// TESTE 5: TEMPORADAS, EVENTOS SEMANAIS & PASSE DE TORNEIO
// ----------------------------------------------------
console.log('\n--- [5] Teste do seasonManager.js ---');
const seasonManager = new SeasonManager();

// Temporada 1
const seasonInfo = seasonManager.getSeasonInfo();
assert(seasonInfo.id === 1, 'Temporada atual identificada como Season 1.');
assert(seasonInfo.stages.length === 10, 'Season 1 possui 10 fases da história configuradas.');

// Conclusão de fase no Modo História
const stage1Clear = seasonManager.completeStage(1, 3, 1200);
assert(stage1Clear.success === true, 'Fase 1 completada com sucesso.');
assert(stage1Clear.unlockedStage === 2, 'Fase 2 desbloqueada automaticamente.');
assert(seasonManager.seasonProgress.totalStars === 3, '3 estrelas computadas no progresso da temporada.');

// Validação de entrada nos rankings semanais de Sobrevivência e PVP
assert(seasonManager.isTournamentPassActive() === false, 'Jogador inicialmente sem Passe de Torneio.');

const survivalEntryNoPass = seasonManager.canEnterWeeklyRanking('survival');
assert(survivalEntryNoPass.allowed === false, 'Bloqueia entrada no ranking semanal de Sobrevivência sem Passe.');
assert(survivalEntryNoPass.reason.includes('Passe de Torneio'), 'Retorna motivo claro solicitando o Passe de Torneio.');

const pvpEntryNoPass = seasonManager.canEnterWeeklyRanking('pvp');
assert(pvpEntryNoPass.allowed === false, 'Bloqueia entrada no ranking semanal de PVP sem Passe.');

// Aquisição do Passe de Torneio
const passPurchase = seasonManager.buyTournamentPass(playerProfile, 50, 'gems');
assert(passPurchase.success === true, 'Passe de Torneio adquirido com sucesso.');
assert(seasonManager.isTournamentPassActive() === true, 'Passe de Torneio ativo após compra.');
assert(playerProfile.gems === 150, '50 gemas deduzidas do perfil (200 - 50 = 150).');

// Validação após possuir o Passe
const survivalEntryWithPass = seasonManager.canEnterWeeklyRanking('survival');
assert(survivalEntryWithPass.allowed === true, 'Permite entrada no ranking semanal de Sobrevivência com Passe ativo.');

const pvpEntryWithPass = seasonManager.canEnterWeeklyRanking('pvp');
assert(pvpEntryWithPass.allowed === true, 'Permite entrada no ranking semanal de PVP com Passe ativo.');

// ----------------------------------------------------
// TESTE 6: PERSISTÊNCIA NO SUPABASE (MOCK SYNC)
// ----------------------------------------------------
console.log('\n--- [6] Teste do supabaseSync.js ---');

const mockDatabase = {
  inventory: {},
  user_profile: {}
};

const mockSupabaseClient = {
  from(tableName) {
    return {
      upsert(payload) {
        const idKey = tableName === 'inventory' ? payload.user_id : payload.id;
        mockDatabase[tableName][idKey] = { ...payload };
        return Promise.resolve({ data: payload, error: null });
      },
      select() {
        return {
          eq(column, value) {
            return {
              maybeSingle() {
                const found = mockDatabase[tableName][value] || null;
                return Promise.resolve({ data: found, error: null });
              }
            };
          }
        };
      }
    };
  }
};

const supabaseSync = new SupabaseSync({
  client: mockSupabaseClient,
  userId: 'usr-uuid-test-123'
});

// Salva inventário
const invSyncResult = await supabaseSync.saveInventory('usr-uuid-test-123', {
  purchasedItemIds: ['sword_rune_blade', 'skin_vesper_void'],
  equippedWeapon: 'sword_rune_blade',
  equippedSkin: 'skin_vesper_void'
});
assert(invSyncResult.success === true, 'Sincronização de inventory com Supabase bem-sucedida.');
assert(mockDatabase.inventory['usr-uuid-test-123'].items.length === 2, 'Tabela inventory salvou os itens comprados.');
assert(mockDatabase.inventory['usr-uuid-test-123'].equipped_weapon === 'sword_rune_blade', 'Tabela inventory salvou equipped_weapon.');

// Salva perfil
const profileSyncResult = await supabaseSync.saveUserProfile('usr-uuid-test-123', {
  username: 'ArchmageRune',
  gold: 2300,
  gems: 150,
  isVip: true,
  vipExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  hasTournamentPass: true,
  seasonProgress: { unlockedStage: 2, totalStars: 3 }
});
assert(profileSyncResult.success === true, 'Sincronização de user_profile com Supabase bem-sucedida.');
assert(mockDatabase.user_profile['usr-uuid-test-123'].wallet_gold === 2300, 'Tabela user_profile salvou wallet_gold.');
assert(mockDatabase.user_profile['usr-uuid-test-123'].is_vip === true, 'Tabela user_profile salvou is_vip.');
assert(mockDatabase.user_profile['usr-uuid-test-123'].has_tournament_pass === true, 'Tabela user_profile salvou has_tournament_pass.');

// Recupera dados do Supabase
const loadedData = await supabaseSync.loadAll('usr-uuid-test-123');
assert(loadedData.success === true, 'Carregamento completo do Supabase executado com sucesso.');
assert(loadedData.inventory.purchasedItemIds.includes('sword_rune_blade'), 'Inventário recuperado corretamente.');
assert(loadedData.profile.gold === 2300, 'Saldo de ouro recuperado corretamente.');
assert(loadedData.profile.isVip === true, 'Status VIP recuperado corretamente.');
assert(loadedData.profile.hasTournamentPass === true, 'Passe de Torneio recuperado corretamente.');

// ----------------------------------------------------
// TESTE 7: GERENCIADOR INTEGRADO (RuneBlastEconomy)
// ----------------------------------------------------
console.log('\n--- [7] Teste da Fachada Integrada RuneBlastEconomy ---');
const economy = new RuneBlastEconomy({
  userId: 'usr-uuid-test-123',
  supabaseClient: mockSupabaseClient,
  initialGold: 1000,
  initialGems: 100
});

// Crédito de partida com VIP (VIP inativo inicialmente na nova instância)
const matchReward = economy.creditMatchRewards(200);
assert(matchReward.totalGold === 200, 'Recompensa creditada: 200 ouro.');
assert(economy.getGold() === 1200, 'Carteira atualizada para 1200 ouro.');

// Ativa VIP e credita nova partida
economy.vipSystem.activateVip(30);
const matchRewardVip = economy.creditMatchRewards(200);
assert(matchRewardVip.totalGold === 300, 'Recompensa com VIP (+50%): 200 + 100 = 300 ouro.');
assert(economy.getGold() === 1500, 'Carteira atualizada para 1500 ouro.');

console.log('\n========================================================');
console.log(`🎉 TODOS OS ${passed}/${total} TESTES FORAM CONCLUÍDOS COM SUCESSO!`);
console.log('========================================================');
