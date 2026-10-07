/**
 * @file heroController.js
 * @description Controlador e Entidade do Herói no Rune Blast Arena.
 * 
 * RESPONSABILIDADES:
 * - Mantém as estatísticas base do herói (vida, velocidade, dano, alcance das runas).
 * - Recebe e aplica dinamicamente bónus de atributos oriundos de armas e skins equipadas
 *   (calculados pelo shopInventorySystem.js).
 * - Controla o estado de combate, dano recebido, cura, invencibilidade temporária e movimentação.
 * - Suporta troca visual de sprites e tinturas com base nos equipamentos.
 */

export const DEFAULT_HERO_BASE_STATS = {
  maxHealth: 100,
  health: 100,
  damage: 20,
  speed: 1.0,           // Multiplicador de velocidade no grid
  blastRange: 2,        // Alcance da explosão das bombas/runas
  maxRunes: 1           // Quantidade de bombas simultâneas
};

export class HeroController {
  /**
   * @param {Object} [options]
   * @param {string} [options.characterKey='vesper'] Nome do personagem base ('vesper', 'kael', 'kendra', 'lyra')
   * @param {Object} [options.baseStats] Estatísticas base customizadas
   */
  constructor(options = {}) {
    this.characterKey = options.characterKey || 'vesper';
    this.baseStats = { ...DEFAULT_HERO_BASE_STATS, ...(options.baseStats || {}) };

    // Bónus vindos de equipamentos ativos (shopInventorySystem)
    this.equipmentBonuses = {
      damage: 0,
      speed: 0,
      health: 0
    };

    // Estatísticas efetivas calculadas (base + bónus)
    this.stats = {
      maxHealth: this.baseStats.maxHealth,
      health: this.baseStats.health,
      damage: this.baseStats.damage,
      speed: this.baseStats.speed,
      blastRange: this.baseStats.blastRange,
      maxRunes: this.baseStats.maxRunes
    };

    // Referências visuais dos equipamentos ativos
    this.equippedVisuals = {
      weapon: null,
      skin: null
    };

    // Estados em tempo de jogo
    this.isAlive = true;
    this.invulnerableUntil = 0;
    this.position = { x: 1.5, y: 1.5 };
    this.direction = 'down';
    this.isMoving = false;

    // Callbacks para eventos do jogo
    this.listeners = {
      statsChange: [],
      healthChange: [],
      death: []
    };
  }

  /**
   * Registra ouvintes para eventos do herói
   * @param {'statsChange'|'healthChange'|'death'} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Notifica ouvintes de um evento
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try { cb(data); } catch (e) { console.error(`[HeroController] Erro no listener ${event}:`, e); }
      });
    }
  }

  /**
   * Aplica diretamente os bónus de atributos provenientes das armas e skins equipadas
   * Chamado automaticamente pelo shopInventorySystem.js ao equipar/desequipar
   * 
   * @param {{ damage?: number, speed?: number, health?: number }} bonuses
   */
  applyEquipmentBonuses(bonuses = {}) {
    const prevMaxHealth = this.stats.maxHealth;

    this.equipmentBonuses = {
      damage: Number(bonuses.damage || 0),
      speed: Number(bonuses.speed || 0),
      health: Number(bonuses.health || 0)
    };

    // Recalcula atributos efetivos somando base + equipamento
    this.stats.damage = Math.max(1, this.baseStats.damage + this.equipmentBonuses.damage);
    this.stats.speed = Math.max(0.2, Number((this.baseStats.speed + this.equipmentBonuses.speed).toFixed(2)));
    this.stats.maxHealth = Math.max(10, this.baseStats.maxHealth + this.equipmentBonuses.health);

    // Ajusta vida atual proporcionalmente ao aumento/diminuição de vida máxima
    const healthDiff = this.stats.maxHealth - prevMaxHealth;
    if (healthDiff > 0) {
      this.stats.health += healthDiff;
    } else {
      this.stats.health = Math.min(this.stats.health, this.stats.maxHealth);
    }

    this._emit('statsChange', this.getEffectiveStats());
  }

  /**
   * Define os metadados visuais das peças equipadas (para renderização no Canvas/DOM)
   * @param {{ weapon?: Object|null, skin?: Object|null }} visuals
   */
  setVisualEquipment(visuals = {}) {
    this.equippedVisuals.weapon = visuals.weapon || null;
    this.equippedVisuals.skin = visuals.skin || null;
  }

  /**
   * Retorna os atributos efetivos atuais para combate
   * @returns {{ health: number, maxHealth: number, damage: number, speed: number, blastRange: number, maxRunes: number, baseStats: Object, equipmentBonuses: Object }}
   */
  getEffectiveStats() {
    return {
      health: this.stats.health,
      maxHealth: this.stats.maxHealth,
      damage: this.stats.damage,
      speed: this.stats.speed,
      blastRange: this.stats.blastRange,
      maxRunes: this.stats.maxRunes,
      baseStats: { ...this.baseStats },
      equipmentBonuses: { ...this.equipmentBonuses },
      equippedVisuals: { ...this.equippedVisuals }
    };
  }

  /**
   * Aplica dano ao herói (considerando invencibilidade)
   * @param {number} amount 
   * @returns {{ taken: boolean, currentHealth: number, isDead: boolean }}
   */
  takeDamage(amount) {
    if (!this.isAlive) {
      return { taken: false, currentHealth: 0, isDead: true };
    }

    if (Date.now() < this.invulnerableUntil) {
      return { taken: false, currentHealth: this.stats.health, isDead: false };
    }

    const damageToApply = Math.max(0, amount);
    this.stats.health = Math.max(0, this.stats.health - damageToApply);

    this._emit('healthChange', {
      current: this.stats.health,
      max: this.stats.maxHealth,
      damage: damageToApply
    });

    if (this.stats.health <= 0) {
      this.isAlive = false;
      this._emit('death', { characterKey: this.characterKey });
      return { taken: true, currentHealth: 0, isDead: true };
    }

    return { taken: true, currentHealth: this.stats.health, isDead: false };
  }

  /**
   * Restaura vida do herói
   * @param {number} amount 
   */
  heal(amount) {
    if (!this.isAlive) return;

    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + Math.max(0, amount));
    this._emit('healthChange', {
      current: this.stats.health,
      max: this.stats.maxHealth,
      healed: amount
    });
  }

  /**
   * Concede invencibilidade temporária em milissegundos
   * @param {number} durationMs 
   */
  grantInvulnerability(durationMs) {
    this.invulnerableUntil = Math.max(this.invulnerableUntil, Date.now() + durationMs);
  }

  /**
   * Reseta o herói para iniciar uma nova partida
   * @param {Object} [spawnPosition={ x: 1.5, y: 1.5 }]
   */
  resetForMatch(spawnPosition = { x: 1.5, y: 1.5 }) {
    this.isAlive = true;
    this.stats.health = this.stats.maxHealth;
    this.position = { ...spawnPosition };
    this.direction = 'down';
    this.isMoving = false;
    this.grantInvulnerability(2000); // 2 segundos de graça no spawn
    this._emit('statsChange', this.getEffectiveStats());
  }
}
