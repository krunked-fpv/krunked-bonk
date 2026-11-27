import type { ItemDef } from '../contracts/index';

/**
 * Full Retail Item Catalog — All 87 Items matching oracle.json IDs & rarities 1:1:
 * - 22 Common
 * - 21 Rare
 * - 20 Epic
 * - 22 Legendary
 * - 2 Quest Keys (CageKey, CryptKey)
 *
 * INVARIANT: ZERO no-op pool items! Every single one of the 85 non-quest items defines
 * authentic functional statModifiers, perStackStatModifiers, and/or declarative Trigger-Hook nodes.
 */
export const ITEMS: readonly ItemDef[] = Object.freeze([
  // ==========================================================================
  // COMMON (22)
  // ==========================================================================
  {
    id: 'Key',
    displayName: 'Key',
    description: '12% chance per stack to open Loot Chests for free, plus +5% Gold Multiplier.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'GoldMultiplier', add: 0.05, sourceId: 'item:Key' },
    ],
    hooks: [
      {
        id: 'key_on_chest',
        trigger: 'OnChestOpen',
        chance: 1.0,
        effects: [{ type: 'GrantGold', baseValue: 10, perStackValue: 6 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#eab308',
  },
  {
    id: 'SlipperyRing',
    displayName: 'Slippery Ring',
    description: '+10% Evasion per stack. Slip right past deadly blows.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'Evasion', flat: 0.1, sourceId: 'item:SlipperyRing' },
    ],
    unlockedByDefault: true,
    colorHex: '#67e8f9',
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
    id: 'MoldyCheese',
    displayName: 'Moldy Cheese',
    description: '+8% Poison Damage. Hits have a 28% (+10%/stack) chance to poison enemies.',
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
          { type: 'ApplyDebuff', debuff: 'Poison', baseValue: 5, perStackValue: 3, durationSec: 4.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#84cc16',
  },
  {
    id: 'GoldenGlove',
    displayName: 'Golden Glove',
    description: '+15% Gold Multiplier per stack and extra Gold coins on kills.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'GoldMultiplier', add: 0.15, sourceId: 'item:GoldenGlove' },
    ],
    hooks: [
      {
        id: 'golden_glove_on_kill',
        trigger: 'OnKill',
        chance: 0.25,
        chancePerStack: 0.08,
        cooldownSec: 0.3,
        effects: [{ type: 'GrantGold', baseValue: 3, perStackValue: 2 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fbbf24',
  },
  {
    id: 'Ghost',
    displayName: 'Ghost',
    description: '+6% Void Damage. Using any interactable summons homing spectral ghosts.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'VoidDamageMultiplier', add: 0.06, sourceId: 'item:Ghost' },
    ],
    hooks: [
      {
        id: 'ghost_on_interact',
        trigger: 'OnInteract',
        chance: 1.0,
        effects: [
          { type: 'SpawnMinion', element: 'Void', baseValue: 22, perStackValue: 12, durationSec: 6.0 },
          { type: 'SpawnMinion', element: 'Void', baseValue: 22, perStackValue: 12, durationSec: 6.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#cbd5e1',
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
        effects: [{ type: 'SpeedBoost', baseValue: 0.14, perStackValue: 0.05, durationSec: 2.5 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#06b6d4',
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
    id: 'Skuleg',
    displayName: 'Skuleg',
    description: '+10% Difficulty and +15% XP Multiplier per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'Difficulty', flat: 0.1, sourceId: 'item:Skuleg' },
      { stat: 'XpMultiplier', add: 0.15, sourceId: 'item:Skuleg' },
    ],
    unlockedByDefault: true,
    colorHex: '#d6d3d1',
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
    id: 'CursedDoll',
    displayName: 'Cursed Doll',
    description: '+8% Void Damage. Periodically curses a nearby enemy for % Max HP damage every second.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'VoidDamageMultiplier', add: 0.08, sourceId: 'item:CursedDoll' },
    ],
    hooks: [
      {
        id: 'cursed_doll_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 1.0,
        effects: [
          { type: 'DealDamage', element: 'Void', baseValue: 18, perStackValue: 12 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#9333ea',
  },
  {
    id: 'Borgar',
    displayName: 'Borgar',
    description: '+12 HP/min regen. Kills have a chance to heal you and drop a tasty Borgar.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'HealthRegen', flat: 12, sourceId: 'item:Borgar' },
    ],
    hooks: [
      {
        id: 'borgar_on_kill_heal',
        trigger: 'OnKill',
        chance: 0.14,
        chancePerStack: 0.05,
        cooldownSec: 0.5,
        effects: [{ type: 'Heal', baseValue: 8, perStackValue: 4 }],
      },
      {
        id: 'borgar_on_kill_drop',
        trigger: 'OnKill',
        chance: 0.05,
        chancePerStack: 0.02,
        cooldownSec: 3.5,
        effects: [{ type: 'DropPickup', baseValue: 20, perStackValue: 6, pickupKind: 'health' }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#d97706',
  },
  {
    id: 'Medkit',
    displayName: 'Medkit',
    description: '+35 HP/min Health Regeneration and +15 Max Health per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'HealthRegen', flat: 35, sourceId: 'item:Medkit' },
      { stat: 'MaxHealth', flat: 15, sourceId: 'item:Medkit' },
    ],
    unlockedByDefault: true,
    colorHex: '#ef4444',
  },
  {
    id: 'BossBuster',
    displayName: 'Boss Buster',
    description: '+22% Boss Damage and +15% Elite Damage per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'BossDamageMultiplier', add: 0.22, sourceId: 'item:BossBuster' },
      { stat: 'EliteDamageMultiplier', add: 0.15, sourceId: 'item:BossBuster' },
    ],
    unlockedByDefault: true,
    colorHex: '#dc2626',
  },
  {
    id: 'TacticalGlasses',
    displayName: 'Tactical Glasses',
    description: '+5% Crit Chance. Deal +25% (+15%/stack) bonus damage to enemies above 90% HP.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'CritChance', flat: 0.05, sourceId: 'item:TacticalGlasses' },
    ],
    hooks: [
      {
        id: 'tactical_glasses_on_hit',
        trigger: 'OnHit',
        chance: 1.0,
        conditions: [{ kind: 'TargetHpAbovePct', value: 0.9 }],
        effects: [{ type: 'MultiplyDamage', baseValue: 0.25, perStackValue: 0.15 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#0ea5e9',
  },
  {
    id: 'Cactus',
    displayName: 'Cactus',
    description: '+15 Thorns. Fires a burst of spines around you upon taking damage, scaling with Thorns.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'Thorns', flat: 15, sourceId: 'item:Cactus' },
    ],
    hooks: [
      {
        id: 'cactus_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 0.25,
        effects: [
          { type: 'SpawnNova', element: 'Physical', baseValue: 24, perStackValue: 16, radius: 7.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#16a34a',
  },
  {
    id: 'IceCrystal',
    displayName: 'Ice Crystal',
    description: '+8% Ice Damage. Hits have an 18% chance to Freeze enemies solid and deal Ice damage.',
    rarity: 'Common',
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
    id: 'TimeBracelet',
    displayName: 'Time Bracelet',
    description: '+10% XP Multiplier and +5% Cooldown Reduction per stack. Definitely not a normal watch.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'XpMultiplier', add: 0.1, sourceId: 'item:TimeBracelet' },
      { stat: 'CooldownReduction', flat: 0.05, sourceId: 'item:TimeBracelet' },
    ],
    unlockedByDefault: true,
    colorHex: '#2dd4bf',
  },
  {
    id: 'Wrench',
    displayName: 'Wrench',
    description: 'Charge Shrines charge 35% faster and grant +25% stronger rewards per stack, plus bonus XP & Gold.',
    rarity: 'Common',
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
    id: 'OldMask',
    displayName: 'Old Mask',
    description: '+12% Armor and +5% Damage Reduction per stack.',
    rarity: 'Common',
    perStackStatModifiers: [
      { stat: 'Armor', flat: 0.12, sourceId: 'item:OldMask' },
      { stat: 'DamageReduction', flat: 0.05, sourceId: 'item:OldMask' },
    ],
    unlockedByDefault: true,
    colorHex: '#a8a29e',
  },

  // ==========================================================================
  // RARE (21)
  // ==========================================================================
  {
    id: 'Beer',
    displayName: 'Beer',
    description: '+25% Damage Multiplier at the cost of -15 Max Health per stack.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'DamageMultiplier', mult: 0.25, sourceId: 'item:Beer' },
      { stat: 'MaxHealth', flat: -15, sourceId: 'item:Beer' },
    ],
    unlockedByDefault: true,
    colorHex: '#f59e0b',
  },
  {
    id: 'CowardsCloak',
    displayName: "Coward's Cloak",
    description: '+10% Move Speed. Taking damage bursts +35% Move Speed for 3.5 seconds.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'MoveSpeed', add: 0.1, sourceId: 'item:CowardsCloak' },
    ],
    hooks: [
      {
        id: 'cowards_cloak_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        effects: [
          { type: 'SpeedBoost', baseValue: 0.35, perStackValue: 0.15, durationSec: 3.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#c084fc',
  },
  {
    id: 'PhantomShroud',
    displayName: 'Phantom Shroud',
    description: '+8% Evasion. After evading, surge Damage & Attack Speed and blast the attacker.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'Evasion', flat: 0.08, sourceId: 'item:PhantomShroud' },
    ],
    hooks: [
      {
        id: 'phantom_shroud_on_dodge',
        trigger: 'OnDodge',
        chance: 1.0,
        effects: [
          { type: 'ModifyStat', stat: 'DamageMultiplier', baseValue: 0.35, perStackValue: 0.2, durationSec: 4.0 },
          { type: 'ModifyStat', stat: 'AttackSpeed', baseValue: 0.25, perStackValue: 0.12, durationSec: 4.0 },
          { type: 'DealDamage', element: 'Void', baseValue: 35, perStackValue: 25 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#6366f1',
  },
  {
    id: 'DemonBlade',
    displayName: 'Demonic Blade',
    description: '+5% Crit Chance & +2% Lifesteal. Critical hits have a 50% chance to heal you and Bloodmark foes.',
    rarity: 'Rare',
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
          { type: 'Heal', baseValue: 5, perStackValue: 3 },
          { type: 'ApplyDebuff', debuff: 'Bloodmark', baseValue: 1, durationSec: 5.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#be123c',
  },
  {
    id: 'GoldenSneakers',
    displayName: 'Golden Sneakers',
    description: '+10% Move Speed. Moving rapidly and sliding continuously generates Gold.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'MoveSpeed', add: 0.1, sourceId: 'item:GoldenSneakers' },
    ],
    hooks: [
      {
        id: 'golden_sneakers_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 1.2,
        conditions: [{ kind: 'PlayerSpeedAbove', value: 4.5 }],
        effects: [{ type: 'GrantGold', baseValue: 4, perStackValue: 3 }],
      },
      {
        id: 'golden_sneakers_slide',
        trigger: 'OnSlide',
        chance: 1.0,
        cooldownSec: 1.5,
        effects: [{ type: 'GrantGold', baseValue: 6, perStackValue: 4 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#facc15',
  },
  {
    id: 'DemonicBlood',
    displayName: 'Demonic Blood',
    description: '+15 Max Health. Each kill permanently grants +2 Max Health (up to 100 stacks per copy).',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 15, sourceId: 'item:DemonicBlood' },
    ],
    hooks: [
      {
        id: 'demonic_blood_on_kill',
        trigger: 'OnKill',
        chance: 1.0,
        effects: [{ type: 'Heal', baseValue: 2, perStackValue: 1 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#991b1b',
  },
  {
    id: 'GoldenShield',
    displayName: 'Golden Shield',
    description: '+25 Max Shield. Taking damage drops a shower of bonus Gold.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'Shield', flat: 25, sourceId: 'item:GoldenShield' },
    ],
    hooks: [
      {
        id: 'golden_shield_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 0.4,
        effects: [{ type: 'GrantGold', baseValue: 18, perStackValue: 12 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#eab308',
  },
  {
    id: 'Feathers',
    displayName: 'Feathers',
    description: '+1 Extra Jump, +0.25 Jump Height, and +15% Air Control per stack.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'ExtraJumps', flat: 1, sourceId: 'item:Feathers' },
      { stat: 'JumpHeight', add: 0.25, sourceId: 'item:Feathers' },
      { stat: 'AirControl', add: 0.15, sourceId: 'item:Feathers' },
    ],
    unlockedByDefault: true,
    colorHex: '#f8fafc',
  },
  {
    id: 'EchoShard',
    displayName: 'Echo Shard',
    description: '+8% XP Multiplier. Kills have a 22% (+10%/stack) chance to drop an extra XP shard.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'XpMultiplier', add: 0.08, sourceId: 'item:EchoShard' },
    ],
    hooks: [
      {
        id: 'echo_shard_on_kill',
        trigger: 'OnKill',
        chance: 0.22,
        chancePerStack: 0.1,
        effects: [{ type: 'DropPickup', baseValue: 8, perStackValue: 4, pickupKind: 'xp_small' }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#38bdf8',
  },
  {
    id: 'Backpack',
    displayName: 'Backpack',
    description: '+1 Projectile Count for all weapons per stack.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'ProjectileCount', flat: 1, sourceId: 'item:Backpack' },
    ],
    unlockedByDefault: true,
    colorHex: '#b45309',
  },
  {
    id: 'Campfire',
    displayName: 'Campfire',
    description: '+15 HP/min Regen. Standing still kindles a warm hearth that rapidly heals you.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'HealthRegen', flat: 15, sourceId: 'item:Campfire' },
    ],
    hooks: [
      {
        id: 'campfire_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 0.5,
        effects: [{ type: 'Heal', baseValue: 6, perStackValue: 4 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fb923c',
  },
  {
    id: 'ElectricPlug',
    displayName: 'Electric Plug',
    description: '+10% Lightning Damage. Taking damage blasts an electric shock through nearby enemies.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'LightningDamageMultiplier', add: 0.1, sourceId: 'item:ElectricPlug' },
    ],
    hooks: [
      {
        id: 'electric_plug_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 0.3,
        effects: [
          { type: 'ChainLightning', element: 'Lightning', baseValue: 25, perStackValue: 18, chains: 4, radius: 12 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#3b82f6',
  },
  {
    id: 'BrassKnuckles',
    displayName: 'Brass Knuckles',
    description: '+15% Melee Damage. Deal +22% (+14%/stack) more damage to nearby enemies.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'MeleeDamageMultiplier', add: 0.15, sourceId: 'item:BrassKnuckles' },
    ],
    hooks: [
      {
        id: 'brass_knuckles_on_hit',
        trigger: 'OnHit',
        chance: 1.0,
        conditions: [{ kind: 'DistanceBelow', value: 8.0 }],
        effects: [{ type: 'MultiplyDamage', baseValue: 0.22, perStackValue: 0.14 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#d97706',
  },
  {
    id: 'IdleJuice',
    displayName: 'Idle Juice',
    description: '+8% Damage. Standing still charges up to +60% (+30%/stack) bonus Damage Multiplier.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'DamageMultiplier', mult: 0.08, sourceId: 'item:IdleJuice' },
    ],
    hooks: [
      {
        id: 'idle_juice_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 0.4,
        effects: [
          { type: 'ModifyStat', stat: 'DamageMultiplier', baseValue: 0.12, perStackValue: 0.08, durationSec: 1.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#a3e635',
  },
  {
    id: 'UnstableTransfusion',
    displayName: 'Unstable Transfusion',
    description: '+6% Status Chance. Hits have a 25% (+10%/stack) chance to inflict Bloodmark.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'StatusChance', flat: 0.06, sourceId: 'item:UnstableTransfusion' },
    ],
    hooks: [
      {
        id: 'unstable_transfusion_on_hit',
        trigger: 'OnHit',
        chance: 0.25,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Bloodmark', baseValue: 1, durationSec: 6.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#dc2626',
  },
  {
    id: 'CreditCardRed',
    displayName: 'Credit Card (Red)',
    description: '+6% Crit Damage. Permanently gain +8% (+5%/stack) Damage Multiplier whenever you open a chest.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'CritDamage', add: 0.06, sourceId: 'item:CreditCardRed' },
    ],
    hooks: [
      {
        id: 'credit_card_red_chest',
        trigger: 'OnChestOpen',
        chance: 1.0,
        effects: [
          { type: 'ModifyStat', stat: 'DamageMultiplier', baseValue: 0.08, perStackValue: 0.05, durationSec: 999999 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#ef4444',
  },
  {
    id: 'LeechingCrystal',
    displayName: 'Leeching Crystal',
    description: '+45 Max Health and +6% Lifesteal at the cost of -20 HP/min Health Regeneration.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 45, sourceId: 'item:LeechingCrystal' },
      { stat: 'Lifesteal', flat: 0.06, sourceId: 'item:LeechingCrystal' },
      { stat: 'HealthRegen', flat: -20, sourceId: 'item:LeechingCrystal' },
    ],
    unlockedByDefault: true,
    colorHex: '#e11d48',
  },
  {
    id: 'GloveLightning',
    displayName: 'Thunder Mitts',
    description: '+12% Lightning Damage. Hits call down crackling Chain Lightning across nearby enemies.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'LightningDamageMultiplier', add: 0.12, sourceId: 'item:GloveLightning' },
    ],
    hooks: [
      {
        id: 'glove_lightning_on_hit',
        trigger: 'OnHit',
        chance: 0.24,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.25,
        effects: [
          {
            type: 'ChainLightning',
            element: 'Lightning',
            baseValue: 16,
            perStackValue: 10,
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
    id: 'GlovePoison',
    displayName: 'Moldy Gloves',
    description: '+12% Poison Damage. Hits unleash a lingering toxic cloud that poisons nearby enemies.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'PoisonDamageMultiplier', add: 0.12, sourceId: 'item:GlovePoison' },
    ],
    hooks: [
      {
        id: 'glove_poison_on_hit',
        trigger: 'OnHit',
        chance: 0.25,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.35,
        effects: [
          { type: 'SpawnNova', element: 'Poison', baseValue: 12, perStackValue: 8, radius: 5.0 },
          { type: 'ApplyDebuff', debuff: 'Poison', baseValue: 6, perStackValue: 4, durationSec: 4.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#65a30d',
  },
  {
    id: 'Beacon',
    displayName: 'Beacon',
    description: '+2 Shield Regen. Completing Charge Shrines turns them into healing zones and spawns extra shrines.',
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
    id: 'Pumpkin',
    displayName: 'Pumpkin',
    description: '+10% Luck & +10% Gold. Spawns extra breakable Pots/Pumpkins and boosts their rewards by +50% per stack.',
    rarity: 'Rare',
    perStackStatModifiers: [
      { stat: 'Luck', flat: 0.1, sourceId: 'item:Pumpkin' },
      { stat: 'GoldMultiplier', add: 0.1, sourceId: 'item:Pumpkin' },
    ],
    unlockedByDefault: true,
    colorHex: '#f97316',
  },

  // ==========================================================================
  // EPIC (20)
  // ==========================================================================
  {
    id: 'SpikyShield',
    displayName: 'Spiky Shield',
    description: '+15% Armor and converts your Armor directly into massive bonus Thorns.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Armor', flat: 0.15, sourceId: 'item:SpikyShield' },
    ],
    hooks: [
      {
        id: 'spiky_shield_convert',
        trigger: 'PassiveStat',
        chance: 1.0,
        effects: [
          { type: 'ConvertStat', sourceStat: 'Armor', stat: 'Thorns', baseValue: 40, perStackValue: 25 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#94a3b8',
  },
  {
    id: 'GrandmasSecretTonic',
    displayName: "Grandma's Secret Tonic",
    description: '+6% Crit Chance. Critical hits have a 35% chance to explode for heavy AoE damage.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'CritChance', flat: 0.06, sourceId: 'item:GrandmasSecretTonic' },
    ],
    hooks: [
      {
        id: 'grandma_tonic_on_crit',
        trigger: 'OnCrit',
        chance: 0.35,
        chancePerStack: 0.12,
        usesProcCoefficient: true,
        cooldownSec: 0.2,
        effects: [
          { type: 'SpawnNova', element: 'Fire', baseValue: 20, perStackValue: 12, damageScale: 0.6, radius: 6.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#ec4899',
  },
  {
    id: 'DemonicSoul',
    displayName: 'Demonic Soul',
    description: '+8% Damage Multiplier. Every kill permanently stacks +0.5% Damage (up to 100 kills per copy).',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'DamageMultiplier', mult: 0.08, sourceId: 'item:DemonicSoul' },
    ],
    hooks: [
      {
        id: 'demonic_soul_on_kill',
        trigger: 'OnKill',
        chance: 1.0,
        effects: [{ type: 'GrantXp', baseValue: 2, perStackValue: 1 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#a21caf',
  },
  {
    id: 'BeefyRing',
    displayName: 'Beefy Ring',
    description: '+25 Max Health. Grants +20% Damage Multiplier for every 100 Max Health.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 25, sourceId: 'item:BeefyRing' },
    ],
    hooks: [
      {
        id: 'beefy_ring_convert',
        trigger: 'PassiveStat',
        chance: 1.0,
        effects: [
          { type: 'ConvertStat', sourceStat: 'MaxHealth', stat: 'DamageMultiplier', baseValue: 0.002, perStackValue: 0.0012 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#ea580c',
  },
  {
    id: 'SluttyCannon',
    displayName: 'Homing Cannon',
    description: '+10% Fire Damage. Killing enemies has a 38% chance to launch homing missiles.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'FireDamageMultiplier', add: 0.1, sourceId: 'item:SluttyCannon' },
    ],
    hooks: [
      {
        id: 'homing_cannon_on_kill',
        trigger: 'OnKill',
        chance: 0.38,
        chancePerStack: 0.14,
        cooldownSec: 0.15,
        effects: [
          { type: 'SpawnProjectile', element: 'Fire', baseValue: 26, perStackValue: 16, durationSec: 3.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#f43f5e',
  },
  {
    id: 'ShatteredWisdom',
    displayName: 'Shattered Knowledge',
    description: '+12% XP Multiplier. Picking up XP shards slices nearby enemies for AoE Arcane damage.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'XpMultiplier', add: 0.12, sourceId: 'item:ShatteredWisdom' },
    ],
    hooks: [
      {
        id: 'shattered_wisdom_pickup',
        trigger: 'OnPickup',
        chance: 1.0,
        cooldownSec: 0.1,
        effects: [
          { type: 'SpawnNova', element: 'Void', baseValue: 16, perStackValue: 12, radius: 6.8 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#38bdf8',
  },
  {
    id: 'Rollerblades',
    displayName: 'Turbo Skates',
    description: '+12% Move Speed. Converts Move Speed into surging Attack Speed.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'MoveSpeed', add: 0.12, sourceId: 'item:Rollerblades' },
    ],
    hooks: [
      {
        id: 'rollerblades_convert',
        trigger: 'PassiveStat',
        chance: 1.0,
        effects: [
          { type: 'ConvertStat', sourceStat: 'MoveSpeed', stat: 'AttackSpeed', baseValue: 0.2, perStackValue: 0.12 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#22d3ee',
  },
  {
    id: 'EagleClaw',
    displayName: 'Eagle Claw',
    description: '+15% Knockback. Hits have a 25% chance to launch enemies upward and deal +35% bonus damage to airborne foes.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Knockback', add: 0.15, sourceId: 'item:EagleClaw' },
    ],
    hooks: [
      {
        id: 'eagle_claw_on_hit',
        trigger: 'OnHit',
        chance: 0.25,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Stun', baseValue: 1, durationSec: 0.7 },
          { type: 'MultiplyDamage', baseValue: 0.35, perStackValue: 0.2 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#d97706',
  },
  {
    id: 'Scarf',
    displayName: 'Scarf',
    description: '+15% Air Control. Deal +35% (+20%/stack) more Damage while airborne.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'AirControl', add: 0.15, sourceId: 'item:Scarf' },
    ],
    hooks: [
      {
        id: 'scarf_airborne_hit',
        trigger: 'OnHit',
        chance: 1.0,
        conditions: [{ kind: 'PlayerIsAirborne' }],
        effects: [{ type: 'MultiplyDamage', baseValue: 0.35, perStackValue: 0.2 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#ef4444',
  },
  {
    id: 'BobDead',
    displayName: 'Bob (Dead)',
    description: '+1 Summon Limit. Moving around periodically summons spectral Bob minions to hunt enemies.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'SummonLimit', flat: 1, sourceId: 'item:BobDead' },
    ],
    hooks: [
      {
        id: 'bob_dead_move_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 2.8,
        conditions: [{ kind: 'PlayerSpeedAbove', value: 4.0 }],
        effects: [
          { type: 'SpawnMinion', element: 'Void', baseValue: 32, perStackValue: 18, durationSec: 6.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#94a3b8',
  },
  {
    id: 'Mirror',
    displayName: 'Mirror',
    description: '+10% Armor. Reflects incoming damage back onto the attacker and grants brief invulnerability.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Armor', flat: 0.1, sourceId: 'item:Mirror' },
    ],
    hooks: [
      {
        id: 'mirror_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 1.5,
        effects: [
          { type: 'DealDamage', element: 'Holy', baseValue: 40, perStackValue: 25, damageScale: 2.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#e2e8f0',
  },
  {
    id: 'Gasmask',
    displayName: 'Gas Mask',
    description: '+15% Poison Damage. Gain bonus Armor and Overheal for every currently poisoned enemy.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'PoisonDamageMultiplier', add: 0.15, sourceId: 'item:Gasmask' },
      { stat: 'Armor', flat: 0.06, sourceId: 'item:Gasmask' },
    ],
    hooks: [
      {
        id: 'gasmask_on_debuff',
        trigger: 'OnDebuffApply',
        chance: 1.0,
        cooldownSec: 0.4,
        effects: [
          { type: 'ModifyStat', stat: 'Armor', baseValue: 0.06, perStackValue: 0.03, durationSec: 4.0 },
          { type: 'Heal', baseValue: 2, perStackValue: 1 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#4d7c0f',
  },
  {
    id: 'ToxicBarrel',
    displayName: 'Toxic Barrel',
    description: '+12% Poison Damage. Taking damage ruptures toxic waste, poisoning all nearby enemies.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'PoisonDamageMultiplier', add: 0.12, sourceId: 'item:ToxicBarrel' },
    ],
    hooks: [
      {
        id: 'toxic_barrel_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 0.4,
        effects: [
          { type: 'SpawnNova', element: 'Poison', baseValue: 22, perStackValue: 14, radius: 9.0 },
          { type: 'ApplyDebuff', debuff: 'Poison', baseValue: 10, perStackValue: 6, durationSec: 5.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#84cc16',
  },
  {
    id: 'Kevin',
    displayName: 'Kevin',
    description: '+15% Attack Speed & +10% Luck. Hits have a 22% chance that Kevin punches you for 1 non-lethal damage, triggering OnHurt/Thorns/LockIn!',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'AttackSpeed', add: 0.15, sourceId: 'item:Kevin' },
      { stat: 'Luck', flat: 0.1, sourceId: 'item:Kevin' },
    ],
    hooks: [
      {
        id: 'kevin_on_hit',
        trigger: 'OnHit',
        chance: 0.22,
        chancePerStack: 0.06,
        cooldownSec: 0.45,
        effects: [
          { type: 'ModifyStat', stat: 'DamageMultiplier', baseValue: 0.1, perStackValue: 0.05, durationSec: 2.5 },
        ],
      },
      {
        id: 'kevin_periodic_punch',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 2.5,
        effects: [
          { type: 'ModifyStat', stat: 'AttackSpeed', baseValue: 0.08, perStackValue: 0.04, durationSec: 2.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fbbf24',
  },
  {
    id: 'GamerGoggles',
    displayName: 'Gamer Goggles',
    description: '+12% Crit Damage. Deal massively increased damage the lower your HP drops.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'CritDamage', add: 0.12, sourceId: 'item:GamerGoggles' },
    ],
    hooks: [
      {
        id: 'gamer_goggles_low_hp',
        trigger: 'OnHit',
        chance: 1.0,
        conditions: [{ kind: 'PlayerHpBelowPct', value: 0.65 }],
        effects: [{ type: 'MultiplyDamage', baseValue: 0.4, perStackValue: 0.25 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#ec4899',
  },
  {
    id: 'CreditCardGreen',
    displayName: 'Credit Card (Green)',
    description: '+10% Luck. Permanently gain +6% (+4%/stack) Luck whenever you open a chest.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Luck', flat: 0.1, sourceId: 'item:CreditCardGreen' },
    ],
    hooks: [
      {
        id: 'credit_card_green_chest',
        trigger: 'OnChestOpen',
        chance: 1.0,
        effects: [
          { type: 'ModifyStat', stat: 'Luck', baseValue: 0.06, perStackValue: 0.04, durationSec: 999999 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#22c55e',
  },
  {
    id: 'GloveBlood',
    displayName: 'Slurp Gloves',
    description: '+4% Lifesteal. Hits periodically cast Blood Magic, blasting nearby foes and healing you.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Lifesteal', flat: 0.04, sourceId: 'item:GloveBlood' },
    ],
    hooks: [
      {
        id: 'glove_blood_on_hit',
        trigger: 'OnHit',
        chance: 0.28,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.6,
        effects: [
          { type: 'SpawnNova', element: 'Void', baseValue: 18, perStackValue: 12, radius: 5.5 },
          { type: 'Heal', baseValue: 8, perStackValue: 5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#b91c1c',
  },
  {
    id: 'GloveCurse',
    displayName: 'Cursed Grabbies',
    description: '+12% Difficulty and +15% Damage. Hits have a 25% chance to unleash cursed Void magic.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Difficulty', flat: 0.12, sourceId: 'item:GloveCurse' },
      { stat: 'DamageMultiplier', mult: 0.15, sourceId: 'item:GloveCurse' },
    ],
    hooks: [
      {
        id: 'glove_curse_on_hit',
        trigger: 'OnHit',
        chance: 0.25,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.3,
        effects: [
          { type: 'SpawnNova', element: 'Void', baseValue: 22, perStackValue: 14, damageScale: 0.55, radius: 6.2 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#6b21a8',
  },
  {
    id: 'QuinsMask',
    displayName: "Quin's Mask",
    description: '+25 Thorns. Thorns procs have a 50% chance to erupt in a fiery shockwave around you.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'Thorns', flat: 25, sourceId: 'item:QuinsMask' },
    ],
    hooks: [
      {
        id: 'quins_mask_on_hurt',
        trigger: 'OnHurt',
        chance: 0.5,
        chancePerStack: 0.15,
        cooldownSec: 0.25,
        effects: [
          { type: 'SpawnNova', element: 'Fire', baseValue: 30, perStackValue: 20, radius: 7.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#f43f5e',
  },
  {
    id: 'BobsLantern',
    displayName: "Bob's Light",
    description: '+12% Holy Damage. Periodically erupts a blinding sphere of light, incinerating nearby foes.',
    rarity: 'Epic',
    perStackStatModifiers: [
      { stat: 'HolyDamageMultiplier', add: 0.12, sourceId: 'item:BobsLantern' },
    ],
    hooks: [
      {
        id: 'bobs_lantern_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 5.5,
        effects: [
          { type: 'SpawnNova', element: 'Holy', baseValue: 65, perStackValue: 45, radius: 9.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fef08a',
  },

  // ==========================================================================
  // LEGENDARY (22)
  // ==========================================================================
  {
    id: 'Bonker',
    displayName: 'Big Bonk',
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
          { type: 'SpawnNova', element: 'Holy', baseValue: 40, perStackValue: 25, damageScale: 0.5, radius: 8.5 },
          { type: 'ApplyDebuff', debuff: 'Stun', baseValue: 1, durationSec: 1.2 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#e879f9',
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
          { type: 'SpawnNova', element: 'Physical', baseValue: 24, perStackValue: 14, damageScale: 0.45, radius: 6.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fb923c',
  },
  {
    id: 'SpicyMeatball',
    displayName: 'Spicy Meatball',
    description: '+18% Fire Damage. Attacks have a 25% (+10%/stack) chance to explode in a fiery blast.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'FireDamageMultiplier', add: 0.18, sourceId: 'item:SpicyMeatball' },
    ],
    hooks: [
      {
        id: 'spicy_meatball_on_hit',
        trigger: 'OnHit',
        chance: 0.25,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        cooldownSec: 0.18,
        effects: [
          { type: 'SpawnNova', element: 'Fire', baseValue: 24, perStackValue: 16, damageScale: 0.65, radius: 6.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#dc2626',
  },
  {
    id: 'Chonkplate',
    displayName: 'Chonkplate',
    description: '+40 Max Health, +50% Overheal capacity, and +4% Lifesteal. Excess healing builds Overheal.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 40, sourceId: 'item:Chonkplate' },
      { stat: 'Overheal', flat: 0.5, sourceId: 'item:Chonkplate' },
      { stat: 'Lifesteal', flat: 0.04, sourceId: 'item:Chonkplate' },
    ],
    unlockedByDefault: true,
    colorHex: '#4ade80',
  },
  {
    id: 'LightningOrb',
    displayName: 'Lightning Orb',
    description: '+20% Lightning Damage. Hits have a 30% chance to summon Chain Lightning that stuns enemies.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'LightningDamageMultiplier', add: 0.2, sourceId: 'item:LightningOrb' },
    ],
    hooks: [
      {
        id: 'lightning_orb_on_hit',
        trigger: 'OnHit',
        chance: 0.3,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        cooldownSec: 0.2,
        effects: [
          { type: 'ChainLightning', element: 'Lightning', baseValue: 22, perStackValue: 14, damageScale: 0.7, chains: 4, radius: 13 },
          { type: 'ApplyDebuff', debuff: 'Stun', baseValue: 1, durationSec: 1.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#60a5fa',
  },
  {
    id: 'IceCube',
    displayName: 'Ice Cube',
    description: '+20% Ice Damage. Hits have a 30% chance to blast Ice damage and Freeze enemies solid.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'IceDamageMultiplier', add: 0.2, sourceId: 'item:IceCube' },
    ],
    hooks: [
      {
        id: 'ice_cube_on_hit',
        trigger: 'OnHit',
        chance: 0.3,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        cooldownSec: 0.18,
        effects: [
          { type: 'DealDamage', element: 'Ice', baseValue: 20, perStackValue: 14, damageScale: 0.55 },
          { type: 'ApplyDebuff', debuff: 'Freeze', baseValue: 1, durationSec: 2.5, perStackValue: 0.5 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#7dd3fc',
  },
  {
    id: 'Dragonfire',
    displayName: 'Dragonfire',
    description: '+20% Fire Damage. Hits have a 30% chance to summon scorching Dragonfire that applies Burn.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'FireDamageMultiplier', add: 0.2, sourceId: 'item:Dragonfire' },
    ],
    hooks: [
      {
        id: 'dragonfire_on_hit',
        trigger: 'OnHit',
        chance: 0.3,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        cooldownSec: 0.2,
        effects: [
          { type: 'SpawnNova', element: 'Fire', baseValue: 24, perStackValue: 16, damageScale: 0.6, radius: 6.2 },
          { type: 'ApplyDebuff', debuff: 'Burn', baseValue: 12, perStackValue: 8, durationSec: 4.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#f97316',
  },
  {
    id: 'ZaWarudo',
    displayName: 'Za Warudo',
    description: 'Upon taking fatal damage, freeze time across the entire arena and revive! Breaks 1 stack on use.',
    rarity: 'Legendary',
    maxStacks: 25,
    perStackStatModifiers: [
      { stat: 'CooldownReduction', flat: 0.04, sourceId: 'item:ZaWarudo' },
    ],
    hooks: [
      {
        id: 'za_warudo_prevent_death',
        trigger: 'OnDeathPrevent',
        chance: 1.0,
        effects: [{ type: 'Revive', baseValue: 1 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#facc15',
  },
  {
    id: 'OverpoweredLamp',
    displayName: 'Overpowered Lamp',
    description: '+1 Extra Proc Roll and +15% Proc Coefficient per stack (max 2). On-hit effects trigger repeatedly!',
    rarity: 'Legendary',
    maxStacks: 2,
    perStackStatModifiers: [
      { stat: 'ExtraProcRolls', flat: 1, sourceId: 'item:OverpoweredLamp' },
      { stat: 'ProcCoefficientBonus', flat: 0.15, sourceId: 'item:OverpoweredLamp' },
    ],
    hooks: [
      {
        id: 'overpowered_lamp_echo_spark',
        trigger: 'OnHit',
        chance: 0.18,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.22,
        effects: [
          { type: 'ExtraProcRoll', element: 'Holy', baseValue: 12, perStackValue: 8, damageScale: 0.35 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fde047',
  },
  {
    id: 'SuckyMagnet',
    displayName: 'Sucky Magnet',
    description: '+3.5m Pickup Range. Periodically pulls every XP orb on the map straight to you.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'PickupRange', flat: 3.5, sourceId: 'item:SuckyMagnet' },
    ],
    hooks: [
      {
        id: 'sucky_magnet_pulse',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 8.0,
        effects: [{ type: 'MagnetPulse', baseValue: 1, radius: 9999 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#38bdf8',
  },
  {
    id: 'Anvil',
    displayName: 'Anvil',
    description: '+12% Damage Multiplier. Weapon upgrades gain an extra bonus stat tier (max 1).',
    rarity: 'Legendary',
    maxStacks: 1,
    perStackStatModifiers: [
      { stat: 'DamageMultiplier', mult: 0.12, sourceId: 'item:Anvil' },
    ],
    unlockedByDefault: true,
    colorHex: '#64748b',
  },
  {
    id: 'EnergyCore',
    displayName: 'Energy Core',
    description: '+15% Attack Speed. Continuously launches homing plasma energy orbs at nearby foes.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'AttackSpeed', add: 0.15, sourceId: 'item:EnergyCore' },
    ],
    hooks: [
      {
        id: 'energy_core_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 1.2,
        effects: [
          { type: 'SpawnProjectile', element: 'Lightning', baseValue: 26, perStackValue: 16, bounces: 1, durationSec: 2.8 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#06b6d4',
  },
  {
    id: 'SoulHarvester',
    displayName: 'Soul Harvester',
    description: '+15% Void Damage. Slaying any enemy unleashes 2 homing souls to seek new targets.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'VoidDamageMultiplier', add: 0.15, sourceId: 'item:SoulHarvester' },
    ],
    hooks: [
      {
        id: 'soul_harvester_on_kill',
        trigger: 'OnKill',
        chance: 1.0,
        cooldownSec: 0.15,
        effects: [
          { type: 'SpawnProjectile', element: 'Void', baseValue: 22, perStackValue: 14, durationSec: 3.0 },
          { type: 'SpawnProjectile', element: 'Void', baseValue: 22, perStackValue: 14, durationSec: 3.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#a855f7',
  },
  {
    id: 'JoesDagger',
    displayName: "Joe's Dagger",
    description: '+5% Execute Threshold per stack (max 10). Executing enemies permanently stacks +2% Damage.',
    rarity: 'Legendary',
    maxStacks: 10,
    perStackStatModifiers: [
      { stat: 'ExecuteThreshold', flat: 0.05, sourceId: 'item:JoesDagger' },
    ],
    hooks: [
      {
        id: 'joes_dagger_execute',
        trigger: 'OnHit',
        chance: 0.1,
        chancePerStack: 0.04,
        usesProcCoefficient: true,
        effects: [{ type: 'Execute', baseValue: 0.18, perStackValue: 0.03 }],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#dc2626',
  },
  {
    id: 'SpeedBoi',
    displayName: 'Speed Boi',
    description: '+12% Move Speed. Taking damage below 50% HP slows time around you and blasts nearby enemies.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'MoveSpeed', add: 0.12, sourceId: 'item:SpeedBoi' },
    ],
    hooks: [
      {
        id: 'speed_boi_on_hurt',
        trigger: 'OnHurt',
        chance: 1.0,
        cooldownSec: 6.0,
        conditions: [{ kind: 'PlayerHpBelowPct', value: 0.5 }],
        effects: [
          { type: 'SpawnNova', element: 'Lightning', baseValue: 65, perStackValue: 40, radius: 14.0 },
          { type: 'SpeedBoost', baseValue: 0.45, perStackValue: 0.15, durationSec: 4.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#38bdf8',
  },
  {
    id: 'HolyBook',
    displayName: 'Holy Book',
    description: '+35 Max Health, +25 HP/min Regen, +20% Holy Damage. Healing radiates a searing Holy nova around you.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'MaxHealth', flat: 35, sourceId: 'item:HolyBook' },
      { stat: 'HealthRegen', flat: 25, sourceId: 'item:HolyBook' },
      { stat: 'HolyDamageMultiplier', add: 0.2, sourceId: 'item:HolyBook' },
    ],
    hooks: [
      {
        id: 'holy_book_tick',
        trigger: 'OnTick',
        chance: 1.0,
        cooldownSec: 1.5,
        effects: [
          { type: 'SpawnNova', element: 'Holy', baseValue: 28, perStackValue: 18, radius: 8.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#fef08a',
  },
  {
    id: 'BloodyCleaver',
    displayName: 'Bloody Cleaver',
    description: '+6% Lifesteal. Hits have a 30% chance to apply Bloodmark, and Lifesteal procs trigger Bloodmark bursts.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'Lifesteal', flat: 0.06, sourceId: 'item:BloodyCleaver' },
    ],
    hooks: [
      {
        id: 'bloody_cleaver_on_hit',
        trigger: 'OnHit',
        chance: 0.3,
        chancePerStack: 0.1,
        usesProcCoefficient: true,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Bloodmark', baseValue: 1, durationSec: 6.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#991b1b',
  },
  {
    id: 'GlovePower',
    displayName: 'Power Gloves',
    description: '+20% Knockback & +15% Melee Damage. Hits have a 22% chance to trigger a giant concussive blast.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'Knockback', add: 0.2, sourceId: 'item:GlovePower' },
      { stat: 'MeleeDamageMultiplier', add: 0.15, sourceId: 'item:GlovePower' },
    ],
    hooks: [
      {
        id: 'glove_power_on_hit',
        trigger: 'OnHit',
        chance: 0.22,
        chancePerStack: 0.08,
        usesProcCoefficient: true,
        cooldownSec: 0.35,
        effects: [
          { type: 'SpawnNova', element: 'Physical', baseValue: 35, perStackValue: 22, damageScale: 0.8, radius: 9.0 },
          { type: 'ApplyDebuff', debuff: 'Stun', baseValue: 1, durationSec: 0.9 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#f59e0b',
  },
  {
    id: 'GoldenRing',
    displayName: 'Golden Ring',
    description: 'A mysteriously radiant golden band granting +15% Luck, +25% Gold, and +10% Damage.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'Luck', flat: 0.15, sourceId: 'item:GoldenRing' },
      { stat: 'GoldMultiplier', add: 0.25, sourceId: 'item:GoldenRing' },
      { stat: 'DamageMultiplier', mult: 0.1, sourceId: 'item:GoldenRing' },
    ],
    unlockedByDefault: true,
    colorHex: '#facc15',
  },
  {
    id: 'Snek',
    displayName: 'Snek',
    description: '+20% Poison Damage. Hits apply 2 Poison stacks with a 22% chance to instantly burst all Poison damage.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'PoisonDamageMultiplier', add: 0.2, sourceId: 'item:Snek' },
    ],
    hooks: [
      {
        id: 'snek_on_hit',
        trigger: 'OnHit',
        chance: 0.45,
        chancePerStack: 0.12,
        usesProcCoefficient: true,
        effects: [
          { type: 'ApplyDebuff', debuff: 'Poison', baseValue: 10, perStackValue: 6, durationSec: 5.0 },
        ],
      },
    ],
    unlockedByDefault: true,
    colorHex: '#22c55e',
  },
  {
    id: 'Pot',
    displayName: 'Pot (Stainless Steel)',
    description: 'More room to cook. Lifts maximum Weapon level cap beyond 20 (+10 cap on first stack) and grants +10% Attack Speed.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'AttackSpeed', add: 0.1, sourceId: 'item:Pot' },
    ],
    unlockedByDefault: true,
    colorHex: '#cbd5e1',
  },
  {
    id: 'WizardsHat',
    displayName: "Wizard's Hat",
    description: 'Expand arcane knowledge. Lifts maximum Tome level cap beyond 20 (+10 cap on first stack) and grants +10% XP.',
    rarity: 'Legendary',
    perStackStatModifiers: [
      { stat: 'XpMultiplier', add: 0.1, sourceId: 'item:WizardsHat' },
    ],
    unlockedByDefault: true,
    colorHex: '#6366f1',
  },

  // ==========================================================================
  // QUEST KEYS (2)
  // ==========================================================================
  {
    id: 'CageKey',
    displayName: 'Golden Key',
    description: 'An ornate forest cage key. Unlocks Monke when carried to the forest cage.',
    rarity: 'Quest',
    isQuestItem: true,
    unlockedByDefault: true,
    colorHex: '#facc15',
  },
  {
    id: 'CryptKey',
    displayName: 'Crypt Key',
    description: 'A cold wrought-iron key. Unlocks the Graveyard Crypt leading to Big Bob.',
    rarity: 'Quest',
    isQuestItem: true,
    unlockedByDefault: true,
    colorHex: '#94a3b8',
  },
]);

const ITEM_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  PotSteel: 'Pot',
  CageKeyMonke: 'CageKey',
  ShatteredKnowledge: 'ShatteredWisdom',
  TurboSkates: 'Rollerblades',
  FlappyFeathers: 'Feathers',
});

export function resolveCanonicalItemId(id: string): string {
  return ITEM_ID_ALIASES[id] ?? id;
}

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((i) => [i.id, i]),
);

export function getItemById(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id) ?? ITEM_BY_ID.get(resolveCanonicalItemId(id));
}
