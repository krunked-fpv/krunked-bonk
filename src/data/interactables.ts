import type { InteractableDef, InteractableKind } from '../contracts/index';

/**
 * Exact 12 world interactables / encounters matching INTERACTABLE_KINDS.
 */
export const INTERACTABLES: readonly InteractableDef[] = Object.freeze([
  {
    kind: 'ChargeShrine',
    displayName: 'Charge Shrine',
    description: 'Stand inside the glowing ring to charge the obelisk and claim a permanent stat blessing. 15% chance to be Golden!',
    interactRadius: 5.5,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    chargeDurationSec: 5.0,
    colorHex: '#22d3ee',
  },
  {
    kind: 'Chest',
    displayName: 'Loot Chest',
    description: 'Spend Gold to crack open a chest containing a powerful item.',
    interactRadius: 3.4,
    baseGoldCost: 25,
    goldScalePerMinute: 0.35,
    colorHex: '#f59e0b',
  },
  {
    kind: 'ShrineMoai',
    displayName: 'Moai Shrine',
    description: 'An ancient stone head offering a choice of three rare blessings.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#94a3b8',
  },
  {
    kind: 'ShadyGuy',
    displayName: 'Shady Merchant',
    description: 'A hooded peddler trading rare goods for shiny Gold.',
    interactRadius: 4.0,
    baseGoldCost: 35,
    goldScalePerMinute: 0.3,
    colorHex: '#8b5cf6',
  },
  {
    kind: 'Microwave',
    displayName: 'Item Microwave',
    description: 'Sacrifice one owned item to duplicate another item of matching rarity.',
    interactRadius: 3.8,
    baseGoldCost: 20,
    goldScalePerMinute: 0.25,
    colorHex: '#e2e8f0',
  },
  {
    kind: 'ShrineGreed',
    displayName: 'Greed Shrine',
    description: 'Raises run Difficulty in exchange for surging Gold and XP multipliers.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#eab308',
  },
  {
    kind: 'ShrineChallenge',
    displayName: 'Challenge Shrine',
    description: 'Summons an elite ambush pack that drops high-rarity loot on defeat.',
    interactRadius: 4.2,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#ef4444',
  },
  {
    kind: 'ShrineCursed',
    displayName: 'Cursed Shrine',
    description: 'Trade maximum vitality for forbidden offensive power.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#7e22ce',
  },
  {
    kind: 'ShrineMagnet',
    displayName: 'Magnet Shrine',
    description: 'Emits a massive pulse that vacuums every XP gem and coin across the stage.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#38bdf8',
  },
  {
    kind: 'ShrineBalance',
    displayName: 'Balance Shrine',
    description: 'Harmonizes offense and defense into a balanced permanent blessing.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#10b981',
  },
  {
    kind: 'Pot',
    displayName: 'Loot Pot',
    description: 'Smash or slide right through to spill Gold, XP, or healing orbs.',
    interactRadius: 2.2,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#b45309',
  },
  {
    kind: 'BossSpawner',
    displayName: 'Boss Altar',
    description: 'Activate the skull altar to awaken the Stage Boss and open the path forward.',
    interactRadius: 4.5,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#dc2626',
  },
]);

export const INTERACTABLE_BY_KIND: ReadonlyMap<InteractableKind, InteractableDef> = new Map(
  INTERACTABLES.map((i) => [i.kind, i]),
);

export function getInteractableByKind(kind: InteractableKind): InteractableDef | undefined {
  return INTERACTABLE_BY_KIND.get(kind);
}
