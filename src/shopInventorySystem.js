/**
 * @file shopInventorySystem.js
 * @description Módulo de Loja, Inventário e Sistema de Equipamento do Rune Blast Arena.
 * 
 * REGRAS DE NEGÓCIO:
 * 1. Loja (Shop):
 *    - Catálogo dividido por categorias:
 *      * Roupas/Skins
 *      * Armas: Cajados (Staffs), Espadas (Swords), Machados (Axes)
 *    - Cada item possui:
 *      { id, name, type ('skin'|'weapon'), category, price, currency ('gold'|'gems'), stats, spriteUrl, color, purchased }
 * 2. Inventário & Equipamento:
 *    - Slots equipáveis: equippedWeapon e equippedSkin.
 *    - Métodos para comprar, equipar e desequipar.
 * 3. Integração com heroController.js:
 *    - Ao equipar/desequipar, calcula os bónus somados de atributos { damage, speed, health }
 *      e aplica imediatamente às estatísticas do herói no jogo.
 */

export const SHOP_CATALOG = [
  // ==================== ROUPAS / SKINS ====================
  {
    id: 'skin_vesper_void',
    name: 'Manto do Vazio - Vesper',
    type: 'skin',
    category: 'skin',
    price: 1200,
    currency: 'gold',
    stats: { damage: 5, speed: 0.1, health: 25 },
    spriteUrl: 'assets/vesper.png',
    color: '#5a2a9c',
    description: 'Vestimenta cerimonial tecida com energia do Vazio primordial.'
  },
  {
    id: 'skin_kael_storm',
    name: 'Traje da Tempestade - Kael',
    type: 'skin',
    category: 'skin',
    price: 1800,
    currency: 'gold',
    stats: { damage: 10, speed: 0.2, health: 20 },
    spriteUrl: 'assets/kael.png',
    color: '#1f9d5c',
    description: 'Armadura leve imbuída de ventos cortantes e agilidade extrema.'
  },
  {
    id: 'skin_kendra_golden',
    name: 'Armadura da Valquíria - Kendra',
    type: 'skin',
    category: 'skin',
    price: 2500,
    currency: 'gold',
    stats: { damage: 8, speed: 0.05, health: 40 },
    spriteUrl: 'assets/kendra.png',
    color: '#f0d060',
    description: 'Placas douradas polidas que oferecem proteção heróica inigualável.'
  },
  {
    id: 'skin_lyra_crimson',
    name: 'Manto Carmesim - Lyra',
    type: 'skin',
    category: 'skin',
    price: 150,
    currency: 'gems',
    stats: { damage: 15, speed: 0.15, health: 20 },
    spriteUrl: 'assets/lyra.png',
    color: '#8a0d3a',
    description: 'Tecido místico forjado no fogo de pesadelo, potencializando feitiços destrutivos.'
  },

  // ==================== ARMAS: CAJADOS (STAFFS) ====================
  {
    id: 'staff_arcane_pulse',
    name: 'Cajado do Pulso Arcano',
    type: 'weapon',
    category: 'staff',
    price: 900,
    currency: 'gold',
    stats: { damage: 15, speed: 0.05, health: 10 },
    spriteUrl: 'assets/gear_cajado.png',
    color: '#a06bff',
    description: 'Canaliza explosões rúnicas concentradas com rapidez e precisão.'
  },
  {
    id: 'staff_elder_void',
    name: 'Cajado Ancestral do Caos',
    type: 'weapon',
    category: 'staff',
    price: 80,
    currency: 'gems',
    stats: { damage: 28, speed: 0.08, health: 15 },
    spriteUrl: 'assets/gear_cajado.png',
    color: '#7a32d1',
    description: 'Cajado de poder supremo que estilhaça defesas e amplia alcance místico.'
  },

  // ==================== ARMAS: ESPADAS (SWORDS) ====================
  {
    id: 'sword_rune_blade',
    name: 'Lâmina Rúnica de Prata',
    type: 'weapon',
    category: 'sword',
    price: 1500,
    currency: 'gold',
    stats: { damage: 20, speed: 0.1, health: 20 },
    spriteUrl: 'assets/gear_espada.png',
    color: '#5ee6ff',
    description: 'Espada de aço estelar esculpida com glifos de corte veloz.'
  },
  {
    id: 'sword_sun_fang',
    name: 'Espada Presa Solar',
    type: 'weapon',
    category: 'sword',
    price: 120,
    currency: 'gems',
    stats: { damage: 32, speed: 0.12, health: 25 },
    spriteUrl: 'assets/gear_espada.png',
    color: '#ffd76b',
    description: 'Lâmina flamejante que incinera inimigos com calor solar contínuo.'
  },

  // ==================== ARMAS: MACHADOS (AXES) ====================
  {
    id: 'axe_berserker',
    name: 'Machado do Berserker',
    type: 'weapon',
    category: 'axe',
    price: 2200,
    currency: 'gold',
    stats: { damage: 35, speed: -0.05, health: 35 },
    spriteUrl: 'assets/gear_machado.png',
    color: '#ff7a3d',
    description: 'Pesado machado de guerra com impacto devastador e resistência bruta.'
  },
  {
    id: 'axe_frost_shatter',
    name: 'Machado do Gelo Eterno',
    type: 'weapon',
    category: 'axe',
    price: 140,
    currency: 'gems',
    stats: { damage: 30, speed: 0.05, health: 30 },
    spriteUrl: 'assets/gear_machado.png',
    color: '#a5f3fc',
    description: 'Forjado no cume congelado de Niflheim, esmaga armaduras com impacto gélido.'
  }
];

const STORAGE_INVENTORY_KEY = 'rba_inventory_state_v2';

export class ShopInventorySystem {
  /**
   * @param {Object} [options]
   * @param {Object} [options.heroController] Controlador do herói para injeção de stats
   * @param {Function} [options.onSyncRequested] Disparado para sincronizar com Supabase
   */
  constructor(options = {}) {
    this.heroController = options.heroController || null;
    this.onSyncRequested = options.onSyncRequested || null;

    // Catálogo inicial com tracking de posse
    this.catalog = SHOP_CATALOG.map((item) => ({
      ...item,
      stats: { ...item.stats },
      purchased: false
    }));

    // Slots equipados
    this.equippedWeapon = null; // ID do item ou null
    this.equippedSkin = null;   // ID do item ou null

    this._loadLocalState();
  }

  /**
   * Vincula ou atualiza o HeroController
   * @param {Object} heroController 
   */
  setHeroController(heroController) {
    this.heroController = heroController;
    this.updateHeroStats();
  }

  _hasLocalStorage() {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  }

  /**
   * Carrega estado salvo do localStorage
   * @private
   */
  _loadLocalState() {
    try {
      if (this._hasLocalStorage()) {
        const raw = localStorage.getItem(STORAGE_INVENTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const ownedIds = new Set(Array.isArray(parsed.purchasedItemIds) ? parsed.purchasedItemIds : []);

          // Atualiza flags no catálogo
          this.catalog.forEach((item) => {
            if (ownedIds.has(item.id)) {
              item.purchased = true;
            }
          });

          // Restaura slots equipados
          if (parsed.equippedWeapon && this.ownsItem(parsed.equippedWeapon)) {
            this.equippedWeapon = parsed.equippedWeapon;
          }
          if (parsed.equippedSkin && this.ownsItem(parsed.equippedSkin)) {
            this.equippedSkin = parsed.equippedSkin;
          }
        }
      }
    } catch (e) {
      console.warn('[ShopInventorySystem] Falha ao carregar estado local:', e);
    }
  }

  /**
   * Salva estado no localStorage e notifica sincronização remota
   * @private
   */
  _saveState() {
    const payload = this.exportState();
    try {
      if (this._hasLocalStorage()) {
        localStorage.setItem(STORAGE_INVENTORY_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('[ShopInventorySystem] Falha ao salvar estado local:', e);
    }

    if (typeof this.onSyncRequested === 'function') {
      this.onSyncRequested(payload);
    }
  }

  /**
   * Exporta estado no formato adequado para armazenamento e banco
   * @returns {{ purchasedItemIds: string[], equippedWeapon: string|null, equippedSkin: string|null }}
   */
  exportState() {
    return {
      purchasedItemIds: this.catalog.filter((i) => i.purchased).map((i) => i.id),
      equippedWeapon: this.equippedWeapon,
      equippedSkin: this.equippedSkin
    };
  }

  /**
   * Hidrata estado a partir do banco de dados Supabase
   * @param {Object} remoteData 
   */
  hydrate(remoteData) {
    if (!remoteData) return;

    const ownedIds = new Set(
      Array.isArray(remoteData.purchasedItemIds)
        ? remoteData.purchasedItemIds
        : (Array.isArray(remoteData.items) ? remoteData.items : [])
    );

    this.catalog.forEach((item) => {
      if (ownedIds.has(item.id)) {
        item.purchased = true;
      }
    });

    const equippedWeapon = remoteData.equippedWeapon || remoteData.equipped_weapon || null;
    const equippedSkin = remoteData.equippedSkin || remoteData.equipped_skin || null;

    if (equippedWeapon && this.ownsItem(equippedWeapon)) {
      this.equippedWeapon = equippedWeapon;
    }
    if (equippedSkin && this.ownsItem(equippedSkin)) {
      this.equippedSkin = equippedSkin;
    }

    this._saveState();
    this.updateHeroStats();
  }

  // ==========================================
  // LOJA (SHOP)
  // ==========================================

  /**
   * Retorna os itens do catálogo com filtros opcionais
   * @param {Object} [filters]
   * @param {'skin'|'weapon'} [filters.type]
   * @param {'skin'|'staff'|'sword'|'axe'} [filters.category]
   * @param {'gold'|'gems'} [filters.currency]
   * @returns {Array<Object>}
   */
  getShopCatalog(filters = {}) {
    return this.catalog.filter((item) => {
      if (filters.type && item.type !== filters.type) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (filters.currency && item.currency !== filters.currency) return false;
      return true;
    }).map((item) => ({ ...item }));
  }

  /**
   * Obtém item pelo ID
   * @param {string} itemId 
   * @returns {Object|null}
   */
  getItemById(itemId) {
    const item = this.catalog.find((i) => i.id === itemId);
    return item ? { ...item } : null;
  }

  /**
   * Verifica se o jogador já comprou o item
   * @param {string} itemId 
   * @returns {boolean}
   */
  ownsItem(itemId) {
    const item = this.catalog.find((i) => i.id === itemId);
    return !!(item && item.purchased);
  }

  /**
   * Realiza a compra de um item da loja
   * @param {string} itemId 
   * @param {Object} playerProfile Objeto de perfil com { gold, gems, deductCurrency: fn }
   * @returns {{ success: boolean, message: string, item?: Object }}
   */
  buyItem(itemId, playerProfile) {
    return {
      success: false,
      message: 'Loja de Equipamentos em Manutenção / Brevemente Disponível'
    };
  }

  // ==========================================
  // INVENTÁRIO & EQUIPAMENTO
  // ==========================================

  /**
   * Retorna todos os itens adquiridos pelo jogador
   * @param {'skin'|'weapon'} [typeFilter]
   * @returns {Array<Object>}
   */
  getInventory(typeFilter) {
    return this.catalog
      .filter((i) => i.purchased && (!typeFilter || i.type === typeFilter))
      .map((i) => ({
        ...i,
        isEquipped: i.id === this.equippedWeapon || i.id === this.equippedSkin
      }));
  }

  /**
   * Retorna os itens atualmente equipados
   * @returns {{ equippedWeapon: Object|null, equippedSkin: Object|null }}
   */
  getEquippedItems() {
    return {
      equippedWeapon: this.equippedWeapon ? this.getItemById(this.equippedWeapon) : null,
      equippedSkin: this.equippedSkin ? this.getItemById(this.equippedSkin) : null
    };
  }

  /**
   * Equipa um item no slot correspondente ('weapon' ou 'skin')
   * @param {string} itemId 
   * @returns {{ success: boolean, message: string, slot?: string }}
   */
  equipItem(itemId) {
    const item = this.catalog.find((i) => i.id === itemId);

    if (!item) {
      return { success: false, message: 'Item inválido.' };
    }

    if (!item.purchased) {
      return { success: false, message: 'Você precisa comprar este item antes de equipá-lo.' };
    }

    let slot = '';
    if (item.type === 'weapon') {
      this.equippedWeapon = item.id;
      slot = 'equippedWeapon';
    } else if (item.type === 'skin') {
      this.equippedSkin = item.id;
      slot = 'equippedSkin';
    } else {
      return { success: false, message: 'Tipo de item desconhecido para equipamento.' };
    }

    this._saveState();
    this.updateHeroStats();

    return {
      success: true,
      message: `⚔️ ${item.name} equipado com sucesso!`,
      slot,
      item: { ...item }
    };
  }

  /**
   * Desequipa um item de um slot específico
   * @param {'weapon'|'skin'} slotType 
   * @returns {{ success: boolean, message: string }}
   */
  unequipItem(slotType) {
    if (slotType === 'weapon' || slotType === 'equippedWeapon') {
      if (!this.equippedWeapon) return { success: false, message: 'Nenhuma arma equipada.' };
      this.equippedWeapon = null;
    } else if (slotType === 'skin' || slotType === 'equippedSkin') {
      if (!this.equippedSkin) return { success: false, message: 'Nenhuma skin equipada.' };
      this.equippedSkin = null;
    } else {
      return { success: false, message: 'Slot de equipamento inválido.' };
    }

    this._saveState();
    this.updateHeroStats();

    return {
      success: true,
      message: `Item desequipado com sucesso.`
    };
  }

  /**
   * Calcula a soma total de bônus de atributos concedidos pelos itens equipados
   * @returns {{ damage: number, speed: number, health: number }}
   */
  getTotalEquipmentBonuses() {
    const bonuses = { damage: 0, speed: 0, health: 0 };

    const weapon = this.equippedWeapon ? this.catalog.find((i) => i.id === this.equippedWeapon) : null;
    const skin = this.equippedSkin ? this.catalog.find((i) => i.id === this.equippedSkin) : null;

    if (weapon && weapon.stats) {
      bonuses.damage += weapon.stats.damage || 0;
      bonuses.speed += weapon.stats.speed || 0;
      bonuses.health += weapon.stats.health || 0;
    }

    if (skin && skin.stats) {
      bonuses.damage += skin.stats.damage || 0;
      bonuses.speed += skin.stats.speed || 0;
      bonuses.health += skin.stats.health || 0;
    }

    // Ajusta arredondamento de velocidade
    bonuses.speed = Number(bonuses.speed.toFixed(2));

    return bonuses;
  }

  /**
   * Integração com heroController: envia os bônus e atualiza os visuais do herói
   */
  updateHeroStats() {
    if (!this.heroController) return;

    const bonuses = this.getTotalEquipmentBonuses();
    const equipped = this.getEquippedItems();

    if (typeof this.heroController.applyEquipmentBonuses === 'function') {
      this.heroController.applyEquipmentBonuses(bonuses);
    }

    if (typeof this.heroController.setVisualEquipment === 'function') {
      this.heroController.setVisualEquipment({
        weapon: equipped.equippedWeapon,
        skin: equipped.equippedSkin
      });
    }
  }
}
