import type { MetaShopUpgradeDef, ShopUpgradeId } from '../contracts/index';

/**
 * Exact 8 Meta Shop Upgrades calibrated 1:1 to oracle.json costs & formulas:
 * `cost(rank) = Math.round((basePrice + rank * linearIncrease) * Math.pow(exponentialMultiplier, rank))`
 */
const LINEAR_INCREASE_BY_ID: Readonly<Record<ShopUpgradeId, number>> = Object.freeze({
  SilverMultiplier: 5,
  Refresh: 5,
  Skip: 5,
  Banish: 5,
  Weapons: 100,
  Tomes: 100,
  Boombox: 0,
  Toggler: 0,
});

export const SHOP_UPGRADES: readonly MetaShopUpgradeDef[] = Object.freeze([
  {
    id: 'SilverMultiplier',
    displayName: 'Silver Multiplier',
    description: 'Permanently increases Silver earned across all runs (+5% per rank).',
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
    id: 'Refresh',
    displayName: 'Refresh',
    description: 'Grants +1 Level-Up Draft Reroll charge per rank.',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'refresh',
  },
  {
    id: 'Skip',
    displayName: 'Skip',
    description: 'Grants +1 Level-Up Draft Skip charge per rank (refunds 25% XP).',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'skip',
  },
  {
    id: 'Banish',
    displayName: 'Banish',
    description: 'Grants +1 Draft Banish charge per rank to exclude unwanted upgrades for the run.',
    maxRank: 6,
    baseSilverCost: 8,
    costGrowthMult: 1.3,
    specialEffect: 'banish',
  },
  {
    id: 'Weapons',
    displayName: 'Weapon Slots',
    description: 'Carry more Weapons per run (base 2 slots, up to 4).',
    maxRank: 2,
    baseSilverCost: 25,
    costGrowthMult: 1.0,
    specialEffect: 'weapon_slot',
  },
  {
    id: 'Tomes',
    displayName: 'Tome Slots',
    description: 'Carry more Tomes per run (base 2 slots, up to 4).',
    maxRank: 2,
    baseSilverCost: 35,
    costGrowthMult: 1.0,
    specialEffect: 'tome_slot',
  },
  {
    id: 'Boombox',
    displayName: 'Boombox',
    description: 'Manually select any soundtrack track in Options and Pause.',
    maxRank: 1,
    baseSilverCost: 5,
    costGrowthMult: 1.0,
    specialEffect: 'boombox',
  },
  {
    id: 'Toggler',
    displayName: 'Toggler',
    description: 'Toggle unlocked weapons, tomes, and items on or off in the run draft pool.',
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

/** Exact oracle.json pricing formula matching every rank cost 1:1. */
export function getShopUpgradeCost(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.floor(currentRank));
  const linearIncrease = LINEAR_INCREASE_BY_ID[def.id] ?? 0;
  return Math.round((def.baseSilverCost + rank * linearIncrease) * Math.pow(def.costGrowthMult, rank));
}
