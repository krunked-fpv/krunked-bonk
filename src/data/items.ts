import type { ItemDef } from '../contracts/index';

/**
 * Wave 1 Core Items (17) — declarative stats + Trigger-Hook Graph definitions (zero no-ops).
 * Structured cleanly for Wave 2 expansion to all 87 items (85 pool + 2 quest keys).
 */
export const ITEMS: readonly ItemDef[] = Object.freeze([
  {
    id: 'Battery',
    displayName: 'Battery',
    description: '+12% Attack Speed per stack. Overclock your arsenal.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'AttackSpeed', add: 0.12, sourceId: 'item:Battery' },
    ],
    unlockedByDefault: true,
    colorHex: '#facc15',
  },
  {
    id: 'Borgar',
    displayName: 'Borgar',
    description: '+0.6 HP/s regen. Kills have a chance to heal you and drop a tasty health orb.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'HealthRegen', flat: 0.6, sourceId: 'item:Borgar' },
    ],
    hooks: [
      {
        id: 'borgar_on_kill_heal',
        trigger: 'OnKill',
        chance: 0.14,
        chancePerStack: 0.05,
        cooldownSec: 0.5,
        effects: [
          { type: 'Heal', baseValue: 8, perStackValue: 4 },
        ],
      },
      {
        id: 'borgar_on_kill_drop',
        trigger: 'OnKill',
        chance: 0.04,
        chancePerStack: 0.02,
        cooldownSec: 4.0,
        effects: [
          { type: 'DropPickup', baseValue: 18, perStackValue: 6, pickupKind: 'health' },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#d97706',
  },
  {
    id: 'BossBuster',
    displayName: 'Boss Buster',
    description: '+22% Boss Damage and +12% Elite Damage per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'BossDamageMultiplier', add: 0.22, sourceId: 'item:BossBuster' },
      { stat: 'EliteDamageMultiplier', add: 0.12, sourceId: 'item:BossBuster' },
    ],
    unlockedByDefault: true,
    colorHex: '#dc2626',
  },
  {
    id: 'Clover',
    displayName: 'Clover',
    description: '+12% Luck per stack, improving rarity rolls, procs, and drops.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'Luck', flat: 0.12, sourceId: 'item:Clover' },
    ],
    unlockedByDefault: true,
    colorHex: '#22c55e',
  },
  {
    id: 'ForbiddenJuice',
    displayName: 'Forbidden Juice',
    description: '+10% Crit Chance per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'CritChance', flat: 0.1, sourceId: 'item:ForbiddenJuice' },
    ],
    unlockedByDefault: true,
    colorHex: '#e11d48',
  },
  {
    id: 'GymSauce',
    displayName: 'Gym Sauce',
    description: '+12% Damage Multiplier per stack. Pure liquid gains.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'DamageMultiplier', mult: 0.12, sourceId: 'item:GymSauce' },
    ],
    unlockedByDefault: true,
    colorHex: '#f97316',
  },
  {
    id: 'IceCrystal',
    displayName: 'Ice Crystal',
    description: '+8% Ice Damage. Hits have a chance to Freeze enemies solid and deal bonus Ice damage.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'IceDamageMultiplier', add: 0.08, sourceId: 'item:IceCrystal' },
    ],
    hooks: [
      {
        id: 'ice_crystal_on_hit',
        trigger: 'OnHit',
        chance: 0.18,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.15,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Freeze', baseValue: 1, durationSec: 2.0, perStackValue: 0.4 },
          { type: 'DealDamage', element: 'Ice', baseValue: 8, perStackValue: 5, damageScale: 0.35 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#38bdf8',
  },
  {
    id: 'MoldyCheese',
    displayName: 'Moldy Cheese',
    description: '+8% Poison Damage. Hits inflict stacking Poison DoT.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'PoisonDamageMultiplier', add: 0.08, sourceId: 'item:MoldyCheese' },
    ],
    hooks: [
      {
        id: 'moldy_cheese_on_hit',
        trigger: 'OnHit',
        chance: 0.28,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Poison', baseValue: 4.5, perStackValue: 2.5, durationSec: 4.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#84cc16',
  },
  {
    id: 'Oats',
    displayName: 'Oats',
    description: '+30 Max Health per stack. Hearty fuel for long runs.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 30, sourceId: 'item:Oats' },
    ],
    unlockedByDefault: true,
    colorHex: '#eab308',
  },
  {
    id: 'TurboSocks',
    displayName: 'Turbo Socks',
    description: '+12% Move Speed and +8% Slide Speed. Sliding bursts extra momentum.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'MoveSpeed', add: 0.12, sourceId: 'item:TurboSocks' },
      { stat: 'SlideSpeedMultiplier', add: 0.08, sourceId: 'item:TurboSocks' },
    ],
    hooks: [
      {
        id: 'turbo_socks_on_slide',
        trigger: 'OnSlide',
        chance: 1.0,
        cooldownSec: 2.0,
        effects: [
          { type: 'SpeedBoost', baseValue: 0.14, perStackValue: 0.05, durationSec: 2.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#06b6d4',
  },
  {
    id: 'Wrench',
    displayName: 'Wrench',
    description: 'Charge Shrines charge 35% faster and grant +25% stronger rewards per stack, plus bonus XP & Gold on interaction.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'GoldMultiplier', add: 0.08, sourceId: 'item:Wrench' },
    ],
    hooks: [
      {
        id: 'wrench_on_interact',
        trigger: 'OnInteract',
        chance: 1.0,
        effects: [
          { type: 'GrantXp', baseValue: 20, perStackValue: 14 },
          { type: 'GrantGold', baseValue: 12, perStackValue: 8 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#64748b',
  },
  {
    id: 'Beacon',
    displayName: 'Beacon',
    description: '+2 Shield Regen. Completing Shrines or opening Chests restores Health and Shield.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'ShieldRegen', flat: 2.0, sourceId: 'item:Beacon' },
    ],
    hooks: [
      {
        id: 'beacon_on_interact',
        trigger: 'OnInteract',
        chance: 1.0,
        effects: [
          { type: 'Heal', baseValue: 28, perStackValue: 16 },
          { type: 'AddShield', baseValue: 18, perStackValue: 10 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fef08a',
  },
  {
    id: 'DemonBlade',
    displayName: 'Demon Blade',
    description: '+5% Crit Chance & +2% Lifesteal. Critical hits siphon Health and inflict Bloodmark.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'CritChance', flat: 0.05, sourceId: 'item:DemonBlade' },
      { stat: 'Lifesteal', flat: 0.02, sourceId: 'item:DemonBlade' },
    ],
    hooks: [
      {
        id: 'demon_blade_on_crit',
        trigger: 'OnCrit',
        chance: 0.5,
        chancePerStack: 0.15,
        usesProcCoefficient: true,
        cooldownSec: 0.16,
        effects: [
          { type: 'Heal', baseValue: 4, perStackValue: 2.5 },
          { type: 'ApplyDebuff', debuff: 'Bloodmark', baseValue: 1, durationSec: 5.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#be123c',
  },
  {
    id: 'GloveLightning',
    displayName: 'Lightning Glove',
    description: '+12% Lightning Damage. Hits have a chance to arc Chain Lightning across nearby enemies.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'LightningDamageMultiplier', add: 0.12, sourceId: 'item:GloveLightning' },
    ],
    hooks: [
      {
        id: 'glove_lightning_on_hit',
        trigger: 'OnHit',
        chance: 0.22,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.2,
        effects: [
          {
            type: 'ChainLightning',
            element: 'Lightning',
            baseValue: 14,
            perStackValue: 8,
            damageScale: 0.65,
            chains: 3,
            radius: 11,
          },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#3b82f6',
  },
  {
    id: 'GiantFork',
    displayName: 'Giant Fork',
    description: 'Upgrades Critical Hits into devastating 4x+ MEGACRITS! Megacrits erupt in a shockwave nova.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'CritChance', flat: 0.12, sourceId: 'item:GiantFork' },
      { stat: 'CritDamage', add: 0.35, sourceId: 'item:GiantFork' },
      { stat: 'MegacritMultiplier', add: 0.5, sourceId: 'item:GiantFork' },
    ],
    hooks: [
      {
        id: 'giant_fork_on_megacrit',
        trigger: 'OnMegacrit',
        chance: 1.0,
        cooldownSec: 0.25,
        effects: [
          {
            type: 'SpawnNova',
            element: 'Physical',
            baseValue: 24,
            perStackValue: 14,
            damageScale: 0.45,
            radius: 6.5,
          },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fb923c',
  },
  {
    id: 'Bonker',
    displayName: 'Bonker',
    description: '+4% chance per stack on hit to unleash a colossal 20x BONK! detonation that stuns nearby foes.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'BonkerChance', flat: 0.04, sourceId: 'item:Bonker' },
    ],
    hooks: [
      {
        id: 'bonker_on_bonk',
        trigger: 'OnBonker',
        chance: 1.0,
        effects: [
          {
            type: 'SpawnNova',
            element: 'Holy',
            baseValue: 40,
            perStackValue: 25,
            damageScale: 0.5,
            radius: 8.5,
          },
          {
            type: 'ApplyDebuff',
            debuff: 'Stun',
            baseValue: 1,
            durationSec: 1.2,
          },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#e879f9',
  },
  {
    id: 'OverpoweredLamp',
    displayName: 'Overpowered Lamp',
    description: '+1 Extra Proc Roll and +15% Proc Coefficient per stack. On-hit effects trigger repeatedly!',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'ExtraProcRolls', flat: 1, sourceId: 'item:OverpoweredLamp' },
      { stat: 'ProcCoefficientBonus', flat: 0.15, sourceId: 'item:OverpoweredLamp' },
    ],
    hooks: [
      {
        id: 'overpowered_lamp_echo_spark',
        trigger: 'OnHit',
        chance: 0.16,
        chancePerStack: 0.06,
        usesProcCoefficient: true,
        cooldownSec: 0.25,
        effects: [
          {
            type: 'ExtraProcRoll',
            element: 'Holy',
            baseValue: 10,
            perStackValue: 6,
            damageScale: 0.35,
          },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fde047',
  },
]);

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((i) => [i.id, i]),
);

export function getItemById(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}
