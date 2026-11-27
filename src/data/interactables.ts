import type { InteractableDef, InteractableKind } from '../contracts/index';

/**
 * Exact 12 world interactables / encounters matching oracle.json & INTERACTABLE_KINDS.
 */
export const INTERACTABLES: readonly InteractableDef[] = Object.freeze([
  {
    kind: 'ChargeShrine',
    displayName: 'Charge Shrine',
    description: 'Stand inside the ring to charge the obelisk for a permanent stat blessing. 15% chance to be Golden! Boosted by Wrench & Beacon.',
    interactRadius: 5.5,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    chargeDurationSec: 5.0,
    colorHex: '#22d3ee',
  },
  {
    kind: 'Chest',
    displayName: 'Loot Chest',
    description: 'Open normal, free, evil, or ghost chests to claim powerful items (Key grants free-open chance).',
    interactRadius: 3.4,
    baseGoldCost: 25,
    goldScalePerMinute: 0.35,
    colorHex: '#f59e0b',
  },
  {
    kind: 'ShrineMoai',
    displayName: 'Moai Shrine',
    description: 'An ancient carved monolith offering a free pick from three curated items.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#94a3b8',
  },
  {
    kind: 'ShadyGuy',
    displayName: 'Shady Guy',
    description: 'A hooded black-market merchant selling three rarity-tiered items for Gold.',
    interactRadius: 4.0,
    baseGoldCost: 35,
    goldScalePerMinute: 0.3,
    colorHex: '#8b5cf6',
  },
  {
    kind: 'Microwave',
    displayName: 'Item Microwave',
    description: 'Clone an owned item by sacrificing a random same-tier item plus Gold — explodes after max uses!',
    interactRadius: 3.8,
    baseGoldCost: 20,
    goldScalePerMinute: 0.25,
    colorHex: '#e2e8f0',
  },
  {
    kind: 'ShrineGreed',
    displayName: 'Greed Shrine',
    description: 'Permanently escalates Difficulty in exchange for surging Gold and XP multipliers plus an instant Gold payout.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#eab308',
  },
  {
    kind: 'ShrineChallenge',
    displayName: 'Challenge Shrine',
    description: 'Summons an elite ambush wave and manifests a bonus free Loot Chest as your reward.',
    interactRadius: 4.2,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#ef4444',
  },
  {
    kind: 'ShrineCursed',
    displayName: 'Boss Curse Shrine',
    description: 'Invokes a Boss Curse: adds an extra Stage Boss encounter in exchange for surging power and bonus loot.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#7e22ce',
  },
  {
    kind: 'ShrineMagnet',
    displayName: 'Shrine of Succ',
    description: 'Emits a map-wide vacuum pulse that pulls every XP shard, Gold coin, and Silver drop directly to you.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#38bdf8',
  },
  {
    kind: 'ShrineBalance',
    displayName: 'Balance Shrine',
    description: 'Offers three potent asymmetric bargains: trade one stat slightly down for a massive boost to another.',
    interactRadius: 4.0,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#10b981',
  },
  {
    kind: 'Pot',
    displayName: 'Breakable Pot',
    description: 'Smash pots, pumpkins, or desert tumbleweeds by sliding through them for Gold, XP, or healing orbs.',
    interactRadius: 2.2,
    baseGoldCost: 0,
    goldScalePerMinute: 0,
    colorHex: '#b45309',
  },
  {
    kind: 'BossSpawner',
    displayName: 'Boss Altar',
    description: 'Awaken the Stage Boss (or unlock the Crypt Boss) to open the exit Boss Portal.',
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
