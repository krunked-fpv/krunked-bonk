import type { MetaShopUpgradeDef, ShopUpgradeId } from '../contracts/index';

/**
 * Exact 8 Meta Shop Upgrades with retail-calibrated Silver pricing.
 */
export const SHOP_UPGRADES: readonly MetaShopUpgradeDef[] = Object.freeze([
  {
    id: 'Weapons',
    displayName: 'Weapon Slots',
    description: 'Permanently increases maximum equipped Weapon slots per run (base 2, up to 4).',
    maxRank: 2,
    baseSilverCost: 25,
    costGrowthMult: 1.8,
    specialEffect: 'weapon_slot',
  },
  {
    id: 'Tomes',
    displayName: 'Tome Slots',
    description: 'Permanently increases maximum equipped Tome slots per run (base 2, up to 4).',
    maxRank: 2,
    baseSilverCost: 35,
    costGrowthMult: 1.8,
    specialEffect: 'tome_slot',
  },
  {
    id: 'Refresh',
    displayName: 'Draft Rerolls',
    description: 'Grants +1 Level-Up Draft Reroll charge per rank.',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'refresh',
  },
  {
    id: 'Skip',
    displayName: 'Draft Skips',
    description: 'Grants +1 Level-Up Draft Skip charge per rank (refunds 25% XP).',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'skip',
  },
  {
    id: 'Banish',
    displayName: 'Draft Banishes',
    description: 'Grants +1 Draft Banish charge per rank to remove unwanted choices for the run.',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'banish',
  },
  {
    id: 'SilverMultiplier',
    displayName: 'Silver Multiplier',
    description: 'Permanently increases Silver earned from all runs by +5% per rank.',
    maxRank: 20,
    baseSilverCost: 5,
    costGrowthMult: 1.25,
    statModifierPerRank: {
      stat: 'SilverMultiplier',
      add: 0.05,
      sourceId: 'shop:SilverMultiplier',
    },
    specialEffect: 'silver_multiplier',
  },
  {
    id: 'Boombox',
    displayName: 'Boombox',
    description: 'Unlocks custom soundtrack track selection in Settings.',
    maxRank: 1,
    baseSilverCost: 5,
    costGrowthMult: 1.0,
    specialEffect: 'boombox',
  },
  {
    id: 'Toggler',
    displayName: 'Catalog Toggler',
    description: 'Unlocks toggling individual unlocked weapons, tomes, and items in the run pool.',
    maxRank: 1,
    baseSilverCost: 50,
    costGrowthMult: 1.0,
    specialEffect: 'toggler',
  },
]);

export const SHOP_UPGRADE_BY_ID: ReadonlyMap<ShopUpgradeId, MetaShopUpgradeDef> = new Map(
  SHOP_UPGRADES.map((u) => [u.id, u]),
);

export function getShopUpgradeById(id: ShopUpgradeId): MetaShopUpgradeDef | undefined {
  return SHOP_UPGRADE_BY_ID.get(id);
}

export function getShopUpgradeCost(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.floor(currentRank));
  return Math.round(def.baseSilverCost * Math.pow(def.costGrowthMult, rank));
}
