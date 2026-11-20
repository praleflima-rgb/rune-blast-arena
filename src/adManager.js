/**
 * @file adManager.js
 * @description Gerenciador e abstração de anúncios para Google AdSense / H5 Games Ads (AdMob/AdSense H5),
 *              com fallback transparente para CrazyGames SDK e modo de desenvolvimento offline.
 *              Gerencia Interstitials, Anúncios Recompensados (Rewarded Ads) e Banners.
 */

export const AD_CONFIG = {
  // ID de publicador oficial do Google AdSense
  adClient: typeof window !== 'undefined' && window.GOOGLE_AD_CLIENT ? window.GOOGLE_AD_CLIENT : 'ca-pub-7288898515097751',
  testMode: false,
  frequencyHint: '30s',
  bannerContainerId: 'adBannerContainer'
};

export class AdManagerClass {
  constructor(config = {}) {
    this.config = { ...AD_CONFIG, ...config };
    this._initialized = false;
    this._isAdShowing = false;
  }

  /**
   * Configura o ID do cliente Google AdSense/AdMob
   * @param {string} clientId 
   */
  setClientId(clientId) {
    if (clientId) {
      this.config.adClient = clientId;
    }
  }

  /**
   * Retorna o ID de cliente atual
   * @returns {string}
   */
  getClientId() {
    return this.config.adClient;
  }

  /**
   * Verifica se o Google H5 Games Ads está disponível
   * @returns {boolean}
   */
  isGoogleH5Available() {
    return typeof window !== 'undefined' && typeof window.adBreak === 'function';
  }

  /**
   * Verifica se algum provedor de anúncios está disponível
   * @returns {boolean}
   */
  isAvailable() {
    return this.isGoogleH5Available() || (typeof window !== 'undefined' && !!window.CrazyGames);
  }

  /**
   * Pausa o jogo e o áudio durante a reprodução do anúncio
   * @private
   */
  _pauseGameAndAudio() {
    this._isAdShowing = true;
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.pauseGame === 'function') window.pauseGame();
        if (window.AudioEngine && typeof window.AudioEngine.suspend === 'function') {
          window.AudioEngine.suspend();
        }
        if (window.audioManager && typeof window.audioManager.pauseAll === 'function') {
          window.audioManager.pauseAll();
        }
      }
    } catch (e) {
      console.warn('[AdManager] Erro ao pausar áudio/jogo:', e);
    }
  }

  /**
   * Retoma o jogo e o áudio após o término ou descarte do anúncio
   * @private
   */
  _resumeGameAndAudio() {
    this._isAdShowing = false;
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.resumeGame === 'function') window.resumeGame();
        if (window.AudioEngine && typeof window.AudioEngine.resumeAudio === 'function') {
          window.AudioEngine.resumeAudio();
        }
        if (window.audioManager && typeof window.audioManager.resumeAll === 'function') {
          window.audioManager.resumeAll();
        }
      }
    } catch (e) {
      console.warn('[AdManager] Erro ao retomar áudio/jogo:', e);
    }
  }

  /**
   * Exibe um anúncio Interstitial (entre fases, pós-morte ou transições)
   * @param {string} placementName Nome do ponto de inserção (ex: 'level_complete', 'game_over')
   * @param {Function} [onComplete] Callback disparado quando o anúncio for concluído ou ignorado
   */
  showInterstitial(placementName = 'next_level', onComplete) {
    const handleComplete = (info) => {
      this._resumeGameAndAudio();
      if (typeof onComplete === 'function') onComplete(info);
    };

    // 1. Provedor Principal: Google H5 Games Ads (adBreak)
    if (this.isGoogleH5Available()) {
      try {
        this._pauseGameAndAudio();
        window.adBreak({
          type: 'next',
          name: placementName,
          beforeAd: () => {
            this._pauseGameAndAudio();
          },
          afterAd: () => {
            this._resumeGameAndAudio();
          },
          adBreakDone: (placementInfo) => {
            console.log(`[AdManager] Interstitial concluído (${placementName}):`, placementInfo);
            handleComplete(placementInfo);
          }
        });
        return;
      } catch (err) {
        console.warn('[AdManager] Falha ao invocar Google adBreak (next):', err);
        handleComplete({ error: err });
        return;
      }
    }

    // 2. Fallback Secundário: CrazyGames SDK
    if (typeof window !== 'undefined' && window.CrazySDK && typeof window.CrazySDK.isReady === 'function' && window.CrazySDK.isReady()) {
      try {
        this._pauseGameAndAudio();
        if (window.CrazyGames?.SDK?.ad) {
          window.CrazyGames.SDK.ad.requestAd('midgame', {
            adStarted: () => this._pauseGameAndAudio(),
            adFinished: () => handleComplete({ provider: 'crazygames' }),
            adError: (e) => {
              console.warn('[AdManager] Erro no CrazySDK midgame ad:', e);
              handleComplete({ error: e });
            }
          });
          return;
        }
      } catch (err) {
        console.warn('[AdManager] Erro no fallback CrazySDK:', err);
      }
    }

    // 3. Fallback Standalone / Desenvolvimento Local
    console.log(`[AdManager] Fallback dev: Simulando Interstitial (${placementName})`);
    handleComplete({ simulated: true });
  }

  /**
   * Exibe um Anúncio Recompensado (Rewarded Ad)
   * @param {string} rewardName Identificador da recompensa (ex: 'extra_attempt', 'double_coins', 'revive_match')
   * @param {Function} onRewarded Callback disparado quando a recompensa for conquistada (usuário assistiu até o fim)
   * @param {Function} [onDismissed] Callback disparado se o anúncio for cancelado/fechado antes do término
   */
  showRewarded(rewardName = 'rewarded_action', onRewarded, onDismissed) {
    let rewardGranted = false;

    const handleSuccess = () => {
      rewardGranted = true;
      this._resumeGameAndAudio();
      if (typeof onRewarded === 'function') onRewarded();
    };

    const handleDismissed = (reason) => {
      this._resumeGameAndAudio();
      if (!rewardGranted && typeof onDismissed === 'function') {
        onDismissed(reason);
      }
    };

    // 1. Provedor Principal: Google H5 Games Ads (adBreak com type: reward)
    if (this.isGoogleH5Available()) {
      try {
        this._pauseGameAndAudio();
        window.adBreak({
          type: 'reward',
          name: rewardName,
          beforeReward: (showAdFn) => {
            showAdFn();
          },
          beforeAd: () => {
            this._pauseGameAndAudio();
          },
          afterAd: () => {
            this._resumeGameAndAudio();
          },
          adDismissed: () => {
            console.log(`[AdManager] Anúncio recompensado descartado pelo jogador (${rewardName})`);
            handleDismissed('adDismissed');
          },
          adViewed: () => {
            console.log(`[AdManager] Recompensa conquistada com sucesso (${rewardName})`);
            handleSuccess();
          },
          adBreakDone: (placementInfo) => {
            if (!rewardGranted && placementInfo && placementInfo.breakStatus !== 'viewed') {
              handleDismissed(placementInfo.breakStatus);
            }
          }
        });
        return;
      } catch (err) {
        console.warn('[AdManager] Falha ao invocar Google adBreak (reward):', err);
        handleDismissed(err);
        return;
      }
    }

    // 2. Fallback Secundário: CrazyGames SDK showRewardedAd
    if (typeof window !== 'undefined' && window.CrazySDK && typeof window.CrazySDK.showRewardedAd === 'function') {
      try {
        this._pauseGameAndAudio();
        window.CrazySDK.showRewardedAd({
          adStarted: () => this._pauseGameAndAudio(),
          adFinished: () => handleSuccess(),
          adError: (err) => {
            console.warn('[AdManager] Erro CrazySDK Rewarded:', err);
            handleDismissed(err);
          }
        });
        return;
      } catch (err) {
        console.warn('[AdManager] Falha no fallback CrazySDK Rewarded:', err);
      }
    }

    // 3. Fallback Standalone / Desenvolvimento Local (concede automaticamente para testes locais)
    console.warn(`[AdManager] Fallback dev: Simulando Anúncio Recompensado (${rewardName})`);
    setTimeout(() => {
      handleSuccess();
    }, 200);
  }

  /**
   * Exibe e renderiza o banner do Google AdSense
   * @param {string} [containerId] ID do container DOM do banner
   */
  showBanner(containerId) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const targetId = containerId || this.config.bannerContainerId;
    const container = document.getElementById(targetId);
    if (!container) return;

    container.style.display = 'flex';
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      console.log(`[AdManager] Banner requisitado no container #${targetId}`);
    } catch (err) {
      console.warn('[AdManager] Erro ao renderizar banner AdSense:', err);
    }
  }

  /**
   * Oculta o banner de anúncio
   * @param {string} [containerId] ID do container DOM do banner
   */
  hideBanner(containerId) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const targetId = containerId || this.config.bannerContainerId;
    const container = document.getElementById(targetId);
    if (container) {
      container.style.display = 'none';
    }
  }
}

export const AdManager = new AdManagerClass();

// Exporta globalmente para compatibilidade com o monólito index.html
if (typeof window !== 'undefined') {
  window.AdManager = AdManager;
  window.adManager = AdManager;
}
