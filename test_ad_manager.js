/**
 * @file test_ad_manager.js
 * @description Testes automatizados da integracao do AdManager (Google AdSense / H5 Games Ads).
 */

import { AdManager, AdManagerClass, AD_CONFIG } from './src/adManager.js';
import { RuneBlastEconomy } from './src/index.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  OK - ${message}`);
    passed++;
  } else {
    console.error(`  FALHA - ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- [1] Teste da Estrutura e Configuracao do AdManager ---');
  assert(typeof AdManager === 'object', 'AdManager exportado como singleton');
  assert(typeof AdManagerClass === 'function', 'AdManagerClass exportada como classe');
  assert(AD_CONFIG.frequencyHint === '30s', 'Frequencia padrao e 30s');
  assert(typeof AdManager.setClientId === 'function', 'setClientId disponivel');
  assert(typeof AdManager.getClientId === 'function', 'getClientId disponivel');
  
  AdManager.setClientId('ca-pub-9999999999999999');
  assert(AdManager.getClientId() === 'ca-pub-9999999999999999', 'setClientId atualiza corretamente o ID de publicador');

  console.log('\n--- [2] Teste: Fallback em Ambiente sem Google SDK (Modo Dev/Local) ---');
  let interstitialCalled = false;
  AdManager.showInterstitial('test_level_complete', (info) => {
    interstitialCalled = true;
    assert(info.simulated === true, 'Interstitial simula conclusao no fallback');
  });
  assert(interstitialCalled, 'Callback de Interstitial executado no fallback');

  let rewardedCalled = false;
  await new Promise((resolve) => {
    AdManager.showRewarded('test_extra_attempt', () => {
      rewardedCalled = true;
      resolve();
    });
  });
  assert(rewardedCalled, 'Callback de Rewarded executado com sucesso no fallback');

  console.log('\n--- [3] Teste: Mock do Google H5 Games Ads SDK (adBreak) ---');
  let adBreakCalls = [];
  globalThis.window = globalThis;
  globalThis.window.adBreak = function(options) {
    adBreakCalls.push(options);
    if (options.type === 'next') {
      if (options.beforeAd) options.beforeAd();
      if (options.afterAd) options.afterAd();
      if (options.adBreakDone) options.adBreakDone({ breakStatus: 'viewed' });
    } else if (options.type === 'reward') {
      if (options.beforeReward) options.beforeReward(() => {});
      if (options.beforeAd) options.beforeAd();
      if (options.afterAd) options.afterAd();
      if (options.adViewed) options.adViewed();
      if (options.adBreakDone) options.adBreakDone({ breakStatus: 'viewed' });
    }
  };

  assert(AdManager.isGoogleH5Available() === true, 'isGoogleH5Available detecta window.adBreak');

  let mockInterstitialFinished = false;
  AdManager.showInterstitial('next_stage_boss', (info) => {
    mockInterstitialFinished = true;
    assert(info.breakStatus === 'viewed', 'Google adBreak next executado com sucesso');
  });
  assert(mockInterstitialFinished, 'Callback do Interstitial executado via adBreak');

  let mockRewardGranted = false;
  AdManager.showRewarded('boss_double_reward', () => {
    mockRewardGranted = true;
  });
  assert(mockRewardGranted, 'Google adBreak reward concede recompensa ao jogador');

  console.log('\n--- [4] Teste: Integracao com a Fachada RuneBlastEconomy ---');
  const economy = new RuneBlastEconomy();
  assert(economy.ads !== undefined, 'economy.ads esta presente');
  assert(typeof economy.ads.showRewarded === 'function', 'economy.ads.showRewarded disponivel na Fachada');
  assert(typeof economy.ads.showInterstitial === 'function', 'economy.ads.showInterstitial disponivel na Fachada');

  console.log('\n========================================================');
  console.log(`Resultado: ${passed} testes passaram, ${failed} falharam.`);
  if (failed === 0) {
    console.log('TODOS OS TESTES DE ANÚNCIOS PASSARAM COM SUCESSO!');
  } else {
    console.error('ALGUNS TESTES FALHARAM!');
    process.exit(1);
  }
  console.log('========================================================\n');
}

runTests();
