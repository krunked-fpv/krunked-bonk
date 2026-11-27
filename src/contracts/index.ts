/**
 * KRUNKEDBONK — Single Source of Truth Contracts
 *
 * INVARIANT: This file MUST remain 100% DOM-free and Three.js-free so pure Node
 * simulation, Vitest suites, CLI verifiers, and browser bundles import it cleanly.
 */

// ============================================================================
// 1. CORE CONSTANTS
// ============================================================================

export const GAME_TITLE = 'KRUNKEDBONK' as const;
export const SAVE_STORAGE_KEY = 'krunked_bonk_save_v1' as const;
export const SAVE_VERSION = 1 as const;
export const CUSTOM_PACK_DEV_PREFIX = '/__custom_pack__' as const;
export const DEBUG_BRIDGE_GLOBAL_KEY = '__KRUNKED_DEBUG__' as const;

/** Fixed simulation cadence (50 Hz) */
export const SIM_HZ = 50 as const;
export const FIXED_DT = 0.02 as const;
export const MAX_ALLOWED_TIMESTEP = 0.2 as const;
export const MAX_SUBSTEPS_PER_FRAME = 10 as const;

/** Physics & player body constants */
export const GRAVITY = -19.62 as const;
export const PLAYER_MASS = 60 as const;
export const PLAYER_CAPSULE_RADIUS = 0.6 as const;
export const PLAYER_CAPSULE_HEIGHT = 3.0 as const;
export const PLAYER_CROUCH_SCALE = 0.55 as const;

/** Camera & map projection constants */
export const FOV_DEFAULT = 110 as const;
export const FOV_MIN = 70 as const;
export const FOV_MAX = 120 as const;
export const CAMERA_3RD_OFFSET_Z = 11.0 as const;
export const CAMERA_3RD_OFFSET_Y = 3.2 as const;
export const CAMERA_1ST_EYE_HEIGHT = 2.45 as const;
export const MINIMAP_ORTHO_SIZE = 110 as const;
export const FULLMAP_ORTHO_SIZE = 400 as const;

/** Kinetic movement constants */
export const SLIDE_SPEED_THRESHOLD = 7.0 as const;
export const SLIDE_DOWNHILL_MAX_MULT = 2.4 as const;
export const BHOP_WINDOW_SEC = 0.14 as const;
export const COYOTE_TIME_SEC = 0.12 as const;
export const JUMP_BUFFER_SEC = 0.12 as const;
export const WALL_CLIMB_COOLDOWN_SEC = 0.25 as const;
export const RAIL_GRIND_SPEED = 20.0 as const;
export const JUMP_PAD_VY = 24.0 as const;
export const FALL_DAMAGE_SPEED_THRESHOLD = 22.0 as const;

/** Combat & stat caps */
export const ARMOR_DR_CAP = 0.85 as const;
export const EVASION_CAP = 0.75 as const;
export const MIN_COOLDOWN_SEC = 0.06 as const;
export const BASE_CRIT_MULTIPLIER = 2.0 as const;
export const MEGACRIT_GIANT_FORK_MULTIPLIER = 4.0 as const;
export const BONKER_MULTIPLIER = 20.0 as const;

/** World & input constants */
export const GAMEPAD_DEADZONE_DEFAULT = 0.15 as const;
export const GRAVEYARD_GRID_SIZE = 19 as const;
export const FINAL_BOSS_PYLON_COUNT = 11 as const;
export const MAX_WEAPON_SLOTS = 4 as const;
export const MAX_TOME_SLOTS = 4 as const;

/** Locked catalog counts verified across data & tests */
export const CATALOG_COUNTS = {
  stats: 57,
  characters: 21,
  weapons: 30,
  tomes: 26,
  items: 87,
  poolItems: 85,
  questItems: 2,
  commonItems: 22,
  rareItems: 21,
  epicItems: 20,
  legendaryItems: 22,
  enemies: 52,
  activeMaps: 3,
  totalMaps: 4,
  interactables: 12,
  shopUpgrades: 8,
  finalBossPylons: 11,
} as const;

// ============================================================================
// 2. PURE MATH PRIMITIVES (Three.js-free)
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ColorRGB {
  /** 0..1 linear or sRGB channel */
  r: number;
  g: number;
  b: number;
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export const GRAVITY_VEC: Readonly<Vec3> = Object.freeze({ x: 0, y: GRAVITY, z: 0 });

// ============================================================================
// 3. ENUMS & DISCRIMINATED UNIONS
// ============================================================================

/** Exact 57-stat EStat registry */
export const ALL_ESTATS = [
  // Survival & Defense (11)
  'MaxHealth',
  'HealthRegen',
  'Overheal',
  'Shield',
  'ShieldRegen',
  'Armor',
  'Evasion',
  'Lifesteal',
  'Thorns',
  'DamageReduction',
  'FallDamageReduction',
  // Offense & Crits (14)
  'DamageMultiplier',
  'AttackSpeed',
  'CooldownReduction',
  'CritChance',
  'CritDamage',
  'MegacritMultiplier',
  'BonkerChance',
  'ExecuteThreshold',
  'EliteDamageMultiplier',
  'BossDamageMultiplier',
  'Knockback',
  'ProcCoefficientBonus',
  'ExtraProcRolls',
  'MeleeDamageMultiplier',
  // Weapon & Projectile Scaling (10)
  'ProjectileCount',
  'ProjectileSpeed',
  'ProjectileBounces',
  'ProjectilePierce',
  'AreaSize',
  'Duration',
  'AttackRange',
  'ChainCount',
  'SummonLimit',
  'SummonDamageMultiplier',
  // Elements & Debuffs (9)
  'FireDamageMultiplier',
  'IceDamageMultiplier',
  'LightningDamageMultiplier',
  'PoisonDamageMultiplier',
  'VoidDamageMultiplier',
  'HolyDamageMultiplier',
  'StatusChance',
  'StatusDuration',
  'StatusDamageMultiplier',
  // Movement & Mobility (7)
  'MoveSpeed',
  'JumpHeight',
  'ExtraJumps',
  'AirControl',
  'SlideSpeedMultiplier',
  'SlideAcceleration',
  'WallClimbLimit',
  // Economy, Utility & Meta (6)
  'PickupRange',
  'XpMultiplier',
  'GoldMultiplier',
  'SilverMultiplier',
  'Luck',
  'Difficulty',
] as const;

export type EStat = (typeof ALL_ESTATS)[number];

/** Enum-style lookup object for EStat */
export const EStatMap = {
  MaxHealth: 'MaxHealth',
  HealthRegen: 'HealthRegen',
  Overheal: 'Overheal',
  Shield: 'Shield',
  ShieldRegen: 'ShieldRegen',
  Armor: 'Armor',
  Evasion: 'Evasion',
  Lifesteal: 'Lifesteal',
  Thorns: 'Thorns',
  DamageReduction: 'DamageReduction',
  FallDamageReduction: 'FallDamageReduction',
  DamageMultiplier: 'DamageMultiplier',
  AttackSpeed: 'AttackSpeed',
  CooldownReduction: 'CooldownReduction',
  CritChance: 'CritChance',
  CritDamage: 'CritDamage',
  MegacritMultiplier: 'MegacritMultiplier',
  BonkerChance: 'BonkerChance',
  ExecuteThreshold: 'ExecuteThreshold',
  EliteDamageMultiplier: 'EliteDamageMultiplier',
  BossDamageMultiplier: 'BossDamageMultiplier',
  Knockback: 'Knockback',
  ProcCoefficientBonus: 'ProcCoefficientBonus',
  ExtraProcRolls: 'ExtraProcRolls',
  MeleeDamageMultiplier: 'MeleeDamageMultiplier',
  ProjectileCount: 'ProjectileCount',
  ProjectileSpeed: 'ProjectileSpeed',
  ProjectileBounces: 'ProjectileBounces',
  ProjectilePierce: 'ProjectilePierce',
  AreaSize: 'AreaSize',
  Duration: 'Duration',
  AttackRange: 'AttackRange',
  ChainCount: 'ChainCount',
  SummonLimit: 'SummonLimit',
  SummonDamageMultiplier: 'SummonDamageMultiplier',
  FireDamageMultiplier: 'FireDamageMultiplier',
  IceDamageMultiplier: 'IceDamageMultiplier',
  LightningDamageMultiplier: 'LightningDamageMultiplier',
  PoisonDamageMultiplier: 'PoisonDamageMultiplier',
  VoidDamageMultiplier: 'VoidDamageMultiplier',
  HolyDamageMultiplier: 'HolyDamageMultiplier',
  StatusChance: 'StatusChance',
  StatusDuration: 'StatusDuration',
  StatusDamageMultiplier: 'StatusDamageMultiplier',
  MoveSpeed: 'MoveSpeed',
  JumpHeight: 'JumpHeight',
  ExtraJumps: 'ExtraJumps',
  AirControl: 'AirControl',
  SlideSpeedMultiplier: 'SlideSpeedMultiplier',
  SlideAcceleration: 'SlideAcceleration',
  WallClimbLimit: 'WallClimbLimit',
  PickupRange: 'PickupRange',
  XpMultiplier: 'XpMultiplier',
  GoldMultiplier: 'GoldMultiplier',
  SilverMultiplier: 'SilverMultiplier',
  Luck: 'Luck',
  Difficulty: 'Difficulty',
} as const satisfies Record<EStat, EStat>;

export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Quest'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ELEMENT_TYPES = [
  'Physical',
  'Fire',
  'Ice',
  'Lightning',
  'Poison',
  'Void',
  'Holy',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const DEBUFF_TYPES = [
  'Poison',
  'Freeze',
  'Burn',
  'Stun',
  'Echo',
  'Charm',
  'Bloodmark',
] as const;
export type DebuffType = (typeof DEBUFF_TYPES)[number];

/** Exact 21 playable characters */
export const CHARACTER_IDS = [
  'Fox',
  'Calcium',
  'SirOofie',
  'Megachad',
  'Amog',
  'Athena',
  'Bandit',
  'Birdo',
  'Bush',
  'SirChadwell',
  'Cl4nk',
  'Dicehead',
  'Monke',
  'Ninja',
  'Noelle',
  'Ogre',
  'Roberto',
  'Robinette',
  'Spaceman',
  'TonyMcZoom',
  'Vlad',
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const MAP_IDS = ['Forest', 'Desert', 'Graveyard', 'FinalBossMap'] as const;
export type MapId = (typeof MAP_IDS)[number];
export type MapTier = 1 | 2 | 3;

export type WeaponArchetype =
  | 'melee'
  | 'projectile'
  | 'beam'
  | 'orbital'
  | 'boomerang'
  | 'aura'
  | 'summon'
  | 'chain'
  | 'explosive'
  | 'lobbed';

export type WeaponTargetingMode =
  | 'nearest'
  | 'aim'
  | 'random'
  | 'highest_hp'
  | 'around_player'
  | 'movement_dir';

/** Declarative Trigger-Hook Graph event triggers for all 87 items */
export type ItemTrigger =
  | 'PassiveStat'
  | 'OnHit'
  | 'OnCrit'
  | 'OnMegacrit'
  | 'OnBonker'
  | 'OnKill'
  | 'OnHurt'
  | 'OnDodge'
  | 'OnBlock'
  | 'OnJump'
  | 'OnSlide'
  | 'OnWallClimb'
  | 'OnRailGrind'
  | 'OnLevelUp'
  | 'OnPickup'
  | 'OnTick'
  | 'OnBossSpawn'
  | 'OnWeaponFire'
  | 'OnDebuffApply'
  | 'OnDeathPrevent'
  | 'OnInteract'
  | 'OnChestOpen';

export type ItemConditionKind =
  | 'TargetHpBelowPct'
  | 'TargetHpAbovePct'
  | 'TargetHasDebuff'
  | 'TargetIsEliteOrBoss'
  | 'PlayerHpBelowPct'
  | 'PlayerIsAirborne'
  | 'PlayerIsSliding'
  | 'PlayerSpeedAbove'
  | 'PlayerHasShield'
  | 'DistanceBelow'
  | 'DistanceAbove'
  | 'EveryNthTrigger';

export type ItemEffectType =
  | 'ModifyStat'
  | 'DealDamage'
  | 'SpawnProjectile'
  | 'SpawnNova'
  | 'ChainLightning'
  | 'ApplyDebuff'
  | 'Heal'
  | 'AddShield'
  | 'GrantGold'
  | 'GrantXp'
  | 'MultiplyDamage'
  | 'ExtraProcRoll'
  | 'Execute'
  | 'Revive'
  | 'SpawnMinion'
  | 'ModifyCooldown'
  | 'ConvertStat'
  | 'SpeedBoost'
  | 'DropPickup'
  | 'MagnetPulse';

export type EnemyRole =
  | 'normal'
  | 'elite'
  | 'miniboss'
  | 'stage_boss'
  | 'crypt_boss'
  | 'final_boss'
  | 'final_swarm';

/** Exact 12 interactable / encounter kinds */
export const INTERACTABLE_KINDS = [
  'Chest',
  'FreeChest',
  'ChargeShrine',
  'ChallengeShrine',
  'GreedShrine',
  'MagnetShrine',
  'HealingShrine',
  'MoaiStatue',
  'ShadyMerchant',
  'Microwave',
  'BossPortal',
  'CryptAltar',
] as const;
export type InteractableKind = (typeof INTERACTABLE_KINDS)[number];

export type PickupKind =
  | 'xp_small'
  | 'xp_medium'
  | 'xp_large'
  | 'gold'
  | 'silver'
  | 'health'
  | 'magnet'
  | 'nuke'
  | 'freeze_clock'
  | 'crypt_key'
  | 'boss_key';

/** Exact 8 meta shop upgrades */
export const SHOP_UPGRADE_IDS = [
  'MaxHealth',
  'Damage',
  'MoveSpeed',
  'Luck',
  'XpGain',
  'SilverGain',
  'Revival',
  'DraftControl',
] as const;
export type ShopUpgradeId = (typeof SHOP_UPGRADE_IDS)[number];

export type GamePhase =
  | 'boot'
  | 'title'
  | 'character_select'
  | 'map_select'
  | 'shop'
  | 'quests'
  | 'settings'
  | 'playing'
  | 'paused'
  | 'level_up'
  | 'chest_open'
  | 'merchant'
  | 'microwave'
  | 'victory'
  | 'game_over';

export type CameraMode = 'third' | 'first';
export type FpsCap = 30 | 60 | 120 | 0;
export type InputDeviceKind = 'keyboard_mouse' | 'gamepad' | 'touch';
export type GamepadProfile =
  | 'xbox'
  | 'playstation'
  | 'switch'
  | 'steam_deck'
  | 'tesla'
  | 'generic';

export type UiNavAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'cancel'
  | 'tab_prev'
  | 'tab_next'
  | 'reroll'
  | 'banish'
  | 'skip'
  | 'pause';

// Compile-time exact count guards
type AssertExactLength<T extends readonly unknown[], N extends number> = T['length'] extends N
  ? N extends T['length']
    ? true
    : never
  : never;

export type _AssertStatCount = AssertExactLength<typeof ALL_ESTATS, 57>;
export type _AssertCharacterCount = AssertExactLength<typeof CHARACTER_IDS, 21>;
export type _AssertInteractableCount = AssertExactLength<typeof INTERACTABLE_KINDS, 12>;
export type _AssertShopUpgradeCount = AssertExactLength<typeof SHOP_UPGRADE_IDS, 8>;

const _verifyContractCounts: [
  _AssertStatCount,
  _AssertCharacterCount,
  _AssertInteractableCount,
  _AssertShopUpgradeCount,
] = [true, true, true, true];
void _verifyContractCounts;

// ============================================================================
// 4. STAT & CATALOG DATA INTERFACES
// ============================================================================

/**
 * Stat modifier adhering to: final = (base + add) * mult + flat
 * `mult` is an additive multiplier delta (e.g. +0.15 => +15%, combined as max(0.05, 1 + sum(mult))).
 */
export interface StatModifier {
  stat: EStat;
  add?: number;
  mult?: number;
  flat?: number;
  sourceId?: string;
}

export interface StatBreakdown {
  base: number;
  add: number;
  mult: number;
  flat: number;
  final: number;
}

export type StatBlock = Record<EStat, number>;

export interface CharacterPassiveDef {
  id: string;
  name: string;
  description: string;
  perLevelMods?: StatModifier[];
  specialFlags?: string[];
  hooks?: ItemHookNode[];
}

export interface CharacterDef {
  id: CharacterId;
  displayName: string;
  title: string;
  description: string;
  startingWeaponId: string;
  colliderScale: number;
  paletteKey: string;
  primaryColorHex: string;
  accentColorHex: string;
  unlockedByDefault: boolean;
  unlockQuestId?: string;
  baseStats: Partial<StatBlock>;
  passive: CharacterPassiveDef;
}

export interface WeaponDef {
  id: string;
  displayName: string;
  description: string;
  archetype: WeaponArchetype;
  targeting: WeaponTargetingMode;
  element: ElementType;
  baseDamage: number;
  damagePerLevel: number;
  cooldownSec: number;
  cooldownScalePerLevel: number;
  knockback: number;
  critChance: number;
  projectiles: number;
  bounces: number;
  pierce: number;
  durationSec: number;
  speed: number;
  range: number;
  areaRadius: number;
  procCoefficient: number;
  burstCount?: number;
  burstIntervalSec?: number;
  debuffOnHit?: {
    type: DebuffType;
    chance: number;
    durationSec: number;
    dpsScale?: number;
  };
  maxLevel: number;
  unlockedByDefault: boolean;
  unlockQuestId?: string;
  paletteKey: string;
}

export interface TomeDef {
  id: string;
  displayName: string;
  description: string;
  stat: EStat;
  modifierMode: 'add' | 'mult' | 'flat';
  deltaPerLevel: number;
  secondaryStat?: {
    stat: EStat;
    modifierMode: 'add' | 'mult' | 'flat';
    deltaPerLevel: number;
  };
  maxLevel: number;
  rarityWeight: number;
  unlockedByDefault: boolean;
  unlockQuestId?: string;
  colorHex: string;
}

export interface ItemHookCondition {
  kind: ItemConditionKind;
  value?: number;
  debuff?: DebuffType;
}

export interface ItemHookEffect {
  type: ItemEffectType;
  /** Scaling per stack: base + perStack * (stacks - 1) */
  baseValue: number;
  perStackValue?: number;
  stat?: EStat;
  sourceStat?: EStat;
  element?: ElementType;
  debuff?: DebuffType;
  radius?: number;
  durationSec?: number;
  bounces?: number;
  chains?: number;
  pickupKind?: PickupKind;
  damageScale?: number;
}

export interface ItemHookNode {
  id: string;
  trigger: ItemTrigger;
  /** Base chance 0..1; scaled per stack via chancePerStack if set */
  chance: number;
  chancePerStack?: number;
  usesProcCoefficient?: boolean;
  cooldownSec?: number;
  conditions?: ItemHookCondition[];
  effects: ItemHookEffect[];
}

export interface ItemDef {
  id: string;
  displayName: string;
  description: string;
  rarity: Rarity;
  isQuestItem?: boolean;
  maxStacks?: number;
  statModifiers?: StatModifier[];
  perStackStatModifiers?: StatModifier[];
  hooks?: ItemHookNode[];
  unlockedByDefault: boolean;
  unlockQuestId?: string;
  colorHex: string;
}

export interface EnemyDef {
  id: string;
  displayName: string;
  role: EnemyRole;
  maps: MapId[];
  minTier?: MapTier;
  maxHp: number;
  hpPerMinuteScale: number;
  damage: number;
  moveSpeed: number;
  radius: number;
  height: number;
  mass: number;
  xpValue: number;
  goldValue: number;
  silverValue: number;
  attackRange: number;
  attackCooldownSec: number;
  projectileSpeed?: number;
  element: ElementType;
  ccResistance: number;
  isFlying?: boolean;
  canStealWeapon?: boolean;
  paletteKey: string;
  colorHex: string;
}

export interface MapLightingConfig {
  skyTop: ColorRGB;
  skyBottom: ColorRGB;
  fogColor: ColorRGB;
  fogNear: number;
  fogFar: number;
  ambientColor: ColorRGB;
  ambientIntensity: number;
  sunColor: ColorRGB;
  sunIntensity: number;
  sunDirection: Vec3;
  toonShadowTint: ColorRGB;
  toonHighlightTint: ColorRGB;
}

export interface MapGenerationConfig {
  kind: 'hills' | 'perlin_dunes' | 'grid_graveyard' | 'boss_citadel';
  arenaRadius: number;
  heightAmplitude: number;
  noiseFrequency: number;
  noiseOctaves: number;
  gridSize?: number;
  hasCrypt?: boolean;
  railCount: number;
  jumpPadCount: number;
  pylonCount?: number;
}

export interface MapDef {
  id: MapId;
  displayName: string;
  description: string;
  isFinalBossMap: boolean;
  tiers: MapTier[];
  stageDurationSec: number;
  stageBossIds: Partial<Record<MapTier, string>>;
  cryptBossId?: string;
  finalSwarmBossId: string;
  generation: MapGenerationConfig;
  lightingByTier: Partial<Record<MapTier, MapLightingConfig>>;
  defaultLighting: MapLightingConfig;
  unlockedByDefault: boolean;
  unlockQuestId?: string;
}

export interface InteractableDef {
  kind: InteractableKind;
  displayName: string;
  description: string;
  interactRadius: number;
  baseGoldCost: number;
  goldScalePerMinute: number;
  chargeDurationSec?: number;
  colorHex: string;
}

export interface MetaShopUpgradeDef {
  id: ShopUpgradeId;
  displayName: string;
  description: string;
  maxRank: number;
  baseSilverCost: number;
  costGrowthMult: number;
  statModifierPerRank?: StatModifier;
  specialEffect?: 'revival' | 'draft_control';
}

export interface ChallengeDef {
  id: string;
  displayName: string;
  description: string;
  mapId?: MapId;
  silverMultiplier: number;
  statModifiers?: StatModifier[];
  rules: {
    maxWeapons?: number;
    disableTomes?: boolean;
    speedMultiplier?: number;
    enemyDamageMultiplier?: number;
    enemyHpMultiplier?: number;
    timerScale?: number;
    oneHpMode?: boolean;
  };
}

export interface SkinDef {
  id: string;
  characterId: CharacterId;
  displayName: string;
  primaryColorHex: string;
  accentColorHex: string;
  unlockQuestId?: string;
}

export interface HatDef {
  id: string;
  displayName: string;
  meshStyle: 'crown' | 'wizard' | 'beanie' | 'halo' | 'horns' | 'tophat' | 'visor' | 'bucket';
  colorHex: string;
  unlockQuestId?: string;
}

export interface QuestDef {
  id: string;
  displayName: string;
  description: string;
  metricKey: string;
  targetValue: number;
  rewardSilver: number;
  unlocks?: {
    characterId?: CharacterId;
    weaponId?: string;
    tomeId?: string;
    itemId?: string;
    mapId?: MapId;
    skinId?: string;
    hatId?: string;
  };
}

export interface GameCatalog {
  characters: readonly CharacterDef[];
  weapons: readonly WeaponDef[];
  tomes: readonly TomeDef[];
  items: readonly ItemDef[];
  enemies: readonly EnemyDef[];
  maps: readonly MapDef[];
  interactables: readonly InteractableDef[];
  shopUpgrades: readonly MetaShopUpgradeDef[];
  challenges: readonly ChallengeDef[];
  skins: readonly SkinDef[];
  hats: readonly HatDef[];
  quests: readonly QuestDef[];
}

// ============================================================================
// 5. INPUT FRAME & SIMULATION STATE
// ============================================================================

/** Deterministic per-tick input frame consumed by ISimEngine.step() */
export interface InputFrame {
  /** Strafe axis [-1..1] (+1 right) */
  moveX: number;
  /** Forward axis [-1..1] (+1 forward) */
  moveZ: number;
  /** Absolute player yaw in radians */
  lookYaw: number;
  /** Absolute camera pitch in radians [-1.45..1.45] */
  lookPitch: number;
  /** Jump held */
  jump: boolean;
  /** Jump edge-triggered this tick */
  jumpPressed: boolean;
  /** Crouch / slide held */
  crouchSlide: boolean;
  /** Interact button edge-triggered */
  interactPressed: boolean;
  /** Camera 1st/3rd toggle edge-triggered */
  cameraTogglePressed: boolean;
  /** Pause toggle edge-triggered */
  pausePressed: boolean;
  /** Full map toggle edge-triggered */
  mapTogglePressed: boolean;
  /** Optional draft choice index (0..2) submitted deterministically */
  draftChoiceIndex: number | null;
  rerollPressed: boolean;
  banishPressed: boolean;
  skipPressed: boolean;
  activeSkillPressed: boolean;
}

export function createEmptyInputFrame(lookYaw = 0, lookPitch = 0): InputFrame {
  return {
    moveX: 0,
    moveZ: 0,
    lookYaw,
    lookPitch,
    jump: false,
    jumpPressed: false,
    crouchSlide: false,
    interactPressed: false,
    cameraTogglePressed: false,
    pausePressed: false,
    mapTogglePressed: false,
    draftChoiceIndex: null,
    rerollPressed: false,
    banishPressed: false,
    skipPressed: false,
    activeSkillPressed: false,
  };
}

export interface DebuffInstance {
  type: DebuffType;
  stacks: number;
  remainingSec: number;
  tickTimerSec: number;
  dps: number;
  storedEchoDamage?: number;
  sourceWeaponId?: string;
}

export interface PlayerWeaponSlot {
  slotIndex: number;
  weaponId: string;
  level: number;
  cooldownTimer: number;
  burstRemaining: number;
  burstTimer: number;
  /** Non-null when Final Boss has stolen this weapon onto a Boss Pylon */
  stolenByPylonId: number | null;
  totalDamage: number;
  kills: number;
}

export interface PlayerTomeSlot {
  tomeId: string;
  level: number;
}

export interface PlayerItemStack {
  itemId: string;
  stacks: number;
  internalCooldown: number;
  triggerCounter: number;
  procCount: number;
}

export interface PlayerBuffInstance {
  id: string;
  remainingSec: number;
  modifiers: StatModifier[];
}

export interface PlayerState {
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  capsuleRadius: number;
  capsuleHeight: number;
  grounded: boolean;
  groundNormal: Vec3;
  coyoteTimer: number;
  jumpBufferTimer: number;
  bhopTimer: number;
  bhopStreak: number;
  airJumpsRemaining: number;
  isSliding: boolean;
  slideTimer: number;
  wallClimbCooldown: number;
  wallClimbsUsed: number;
  railId: number | null;
  railT: number;
  railDir: 1 | -1;
  peakFallSpeed: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldRegenDelay: number;
  overheal: number;
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  silverEarned: number;
  kills: number;
  revivesLeft: number;
  invulnTimer: number;
  /** Last known valid grounded position for VerifyPosition() unstuck recovery */
  safePos: Vec3;
  stats: StatBlock;
  weapons: PlayerWeaponSlot[];
  tomes: PlayerTomeSlot[];
  items: PlayerItemStack[];
  debuffs: DebuffInstance[];
  buffs: PlayerBuffInstance[];
  hasCryptKey: boolean;
  hasBossKey: boolean;
  dead: boolean;
}

export interface EnemyState {
  id: number;
  enemyId: string;
  role: EnemyRole;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  damage: number;
  moveSpeed: number;
  attackTimer: number;
  stunTimer: number;
  charmedTimer: number;
  isBoss: boolean;
  isElite: boolean;
  eliteTags: string[];
  debuffs: DebuffInstance[];
  phaseIndex: number;
  weaponStealCooldown: number;
}

export interface ProjectileState {
  id: number;
  weaponId: string;
  ownerIsPlayer: boolean;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  radius: number;
  damage: number;
  element: ElementType;
  knockback: number;
  critBonus: number;
  bouncesLeft: number;
  pierceLeft: number;
  lifeSec: number;
  maxLifeSec: number;
  procCoefficient: number;
  isBoomerang?: boolean;
  returning?: boolean;
  homingTargetId: number | null;
  hitEntityIds: number[];
}

export interface AreaEffectState {
  id: number;
  kind: 'aura' | 'nova' | 'pool' | 'beam' | 'tornado' | 'blackhole' | 'mine';
  weaponId: string;
  ownerIsPlayer: boolean;
  pos: Vec3;
  radius: number;
  height: number;
  lifeSec: number;
  maxLifeSec: number;
  tickTimer: number;
  tickIntervalSec: number;
  damage: number;
  element: ElementType;
  procCoefficient: number;
  pullStrength?: number;
}

export interface PickupState {
  id: number;
  kind: PickupKind;
  pos: Vec3;
  vel: Vec3;
  value: number;
  magnetized: boolean;
  ageSec: number;
}

export interface InteractableState {
  id: number;
  kind: InteractableKind;
  pos: Vec3;
  radius: number;
  used: boolean;
  active: boolean;
  chargeProgress: number;
  chargeDurationSec: number;
  costGold: number;
  offerPayloadIds?: string[];
}

/** FinalBossMap 11-Pylon & weapon-stealing state */
export interface BossPylonState {
  id: number;
  index: number;
  pos: Vec3;
  radius: number;
  active: boolean;
  cleansed: boolean;
  chargeProgress: number;
  chargeDurationSec: number;
  /** Weapon slot index currently locked inside this pylon, or null */
  stolenWeaponSlotIndex: number | null;
  stolenWeaponId: string | null;
}

export interface RailSplineDef {
  id: number;
  points: Vec3[];
  totalLength: number;
}

export interface JumpPadDef {
  id: number;
  pos: Vec3;
  radius: number;
  launchVy: number;
  launchForwardBoost?: Vec3;
}

export interface DraftOfferChoice {
  index: number;
  category: 'weapon' | 'tome' | 'item' | 'stat_blessing' | 'duplicate_item';
  refId: string;
  displayName: string;
  description: string;
  rarity: Rarity;
  nextLevel?: number;
  goldCost?: number;
}

export interface DraftOffer {
  source: 'level_up' | 'chest' | 'shrine' | 'merchant' | 'microwave' | 'moai';
  title: string;
  choices: DraftOfferChoice[];
  canReroll: boolean;
  canBanish: boolean;
  canSkip: boolean;
}

export interface DamageInput {
  baseDamage: number;
  element: ElementType;
  procCoefficient: number;
  weaponId?: string;
  bonusCritChance?: number;
  isMelee?: boolean;
  isSummon?: boolean;
  isDot?: boolean;
  isProcDamage?: boolean;
  knockback?: number;
}

export interface DamageResult {
  baseDamage: number;
  afterStatMult: number;
  afterElementMult: number;
  critTier: number;
  isCrit: boolean;
  isMegacrit: boolean;
  isBonker: boolean;
  isExecute: boolean;
  finalDamage: number;
  procRollCount: number;
  debuffsApplied: DebuffType[];
}

export interface RunStatsSummary {
  totalDamageDealt: number;
  highestSingleHit: number;
  critsLanded: number;
  megacritsLanded: number;
  bonkersLanded: number;
  executesLanded: number;
  enemiesKilled: number;
  elitesKilled: number;
  bossesKilled: number;
  chestsOpened: number;
  shrinesCompleted: number;
  pylonsCleansed: number;
  topSpeedReached: number;
  longestBhopStreak: number;
  unstuckRecoveries: number;
}

export interface SimConfig {
  seed: number;
  characterId: CharacterId;
  mapId: MapId;
  mapTier: MapTier;
  challengeId?: string | null;
  skinId?: string | null;
  hatId?: string | null;
  shopLevels?: Partial<Record<ShopUpgradeId, number>>;
}

export interface SimState {
  version: number;
  seed: number;
  rngState: number;
  tick: number;
  simTimeSec: number;
  stageDurationSec: number;
  phase: GamePhase;
  mapId: MapId;
  mapTier: MapTier;
  challengeId: string | null;
  characterId: CharacterId;
  skinId: string | null;
  hatId: string | null;
  nextEntityId: number;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  areaEffects: AreaEffectState[];
  pickups: PickupState[];
  interactables: InteractableState[];
  pylons: BossPylonState[];
  rails: RailSplineDef[];
  jumpPads: JumpPadDef[];
  pendingOffer: DraftOffer | null;
  stageBossId: number | null;
  stageBossDefeated: boolean;
  cryptUnlocked: boolean;
  bigBobId: number | null;
  finalBossId: number | null;
  finalSwarmActive: boolean;
  spookySteveId: number | null;
  rerollsLeft: number;
  banishesLeft: number;
  skipsLeft: number;
  banishedIds: string[];
  difficultyMultiplier: number;
  summary: RunStatsSummary;
}

// ============================================================================
// 6. SIM EVENT DISCRIMINATED UNION
// ============================================================================

export type SimEvent =
  | { type: 'player_jump'; tick: number; pos: Vec3; isBhop: boolean; streak: number; isAirJump: boolean }
  | { type: 'player_land'; tick: number; pos: Vec3; impactSpeed: number }
  | { type: 'player_slide_start'; tick: number; pos: Vec3; speed: number }
  | { type: 'player_slide_end'; tick: number; pos: Vec3 }
  | { type: 'player_wall_climb'; tick: number; pos: Vec3; normal: Vec3 }
  | { type: 'player_rail_attach'; tick: number; pos: Vec3; railId: number }
  | { type: 'player_rail_detach'; tick: number; pos: Vec3; railId: number; jumped: boolean }
  | { type: 'player_jump_pad'; tick: number; pos: Vec3; padId: number }
  | { type: 'player_fall_damage'; tick: number; pos: Vec3; amount: number; impactSpeed: number }
  | { type: 'player_hurt'; tick: number; pos: Vec3; amount: number; blockedByShield: number; remainingHp: number }
  | { type: 'player_dodge'; tick: number; pos: Vec3 }
  | { type: 'player_heal'; tick: number; pos: Vec3; amount: number }
  | { type: 'player_level_up'; tick: number; level: number; pos: Vec3 }
  | { type: 'player_death'; tick: number; pos: Vec3 }
  | { type: 'player_revive'; tick: number; pos: Vec3; revivesLeft: number }
  | { type: 'player_unstuck'; tick: number; fromPos: Vec3; toPos: Vec3; reason: string }
  | { type: 'weapon_fire'; tick: number; weaponId: string; pos: Vec3; dir: Vec3 }
  | { type: 'weapon_stolen'; tick: number; weaponId: string; slotIndex: number; pylonId: number }
  | { type: 'weapon_reclaimed'; tick: number; weaponId: string; slotIndex: number; pylonId: number }
  | {
      type: 'damage_dealt';
      tick: number;
      targetId: number;
      pos: Vec3;
      amount: number;
      element: ElementType;
      critTier: number;
      isMegacrit: boolean;
      isBonker: boolean;
      isExecute: boolean;
      weaponId?: string;
    }
  | { type: 'debuff_applied'; tick: number; targetId: number; debuff: DebuffType; stacks: number; pos: Vec3 }
  | { type: 'enemy_spawn'; tick: number; entityId: number; enemyId: string; role: EnemyRole; pos: Vec3 }
  | { type: 'enemy_kill'; tick: number; entityId: number; enemyId: string; role: EnemyRole; pos: Vec3; isExecute: boolean }
  | { type: 'boss_spawn'; tick: number; entityId: number; enemyId: string; displayName: string; pos: Vec3 }
  | { type: 'boss_defeated'; tick: number; entityId: number; enemyId: string; pos: Vec3 }
  | { type: 'final_swarm_start'; tick: number; spookySteveId: number; pos: Vec3 }
  | { type: 'pickup_collected'; tick: number; kind: PickupKind; value: number; pos: Vec3 }
  | { type: 'interactable_used'; tick: number; interactableId: number; kind: InteractableKind; pos: Vec3 }
  | { type: 'pylon_charged'; tick: number; pylonId: number; index: number; cleansedCount: number; totalPylons: number; pos: Vec3 }
  | { type: 'item_proc'; tick: number; itemId: string; trigger: ItemTrigger; pos: Vec3 }
  | { type: 'portal_activated'; tick: number; targetMapId: MapId; targetTier: MapTier }
  | { type: 'phase_changed'; tick: number; from: GamePhase; to: GamePhase };

// ============================================================================
// 7. RENDER SETTINGS, SAVE DATA & PACK MANIFEST
// ============================================================================

export interface GamepadCalibration {
  profile: GamepadProfile;
  deadzone: number;
  sensitivityX: number;
  sensitivityY: number;
  invertY: boolean;
  vibration: boolean;
  swapConfirmCancel: boolean;
}

export interface RenderSettings {
  /** Camera field of view in degrees [70..120], default 110 */
  fov: number;
  cameraMode: CameraMode;
  cameraDistance: number;
  fpsCap: FpsCap;
  /** When true, locks render interpolation alpha to 1.0 (discrete 50 Hz visual cadence) */
  classic50HzSnap: boolean;
  pixelScale: number;
  outlineEnabled: boolean;
  outlineThickness: number;
  celBands: 2 | 3;
  shadowsEnabled: boolean;
  damageNumbersEnabled: boolean;
  screenShakeIntensity: number;
  minimapVisible: boolean;
  showFpsCounter: boolean;
  audioMaster: number;
  audioSfx: number;
  audioMusic: number;
  audioMuted: boolean;
  mouseSensitivity: number;
  invertMouseY: boolean;
  gamepad: GamepadCalibration;
}

export const DEFAULT_RENDER_SETTINGS: Readonly<RenderSettings> = Object.freeze({
  fov: FOV_DEFAULT,
  cameraMode: 'third',
  cameraDistance: CAMERA_3RD_OFFSET_Z,
  fpsCap: 60,
  classic50HzSnap: false,
  pixelScale: 1.0,
  outlineEnabled: true,
  outlineThickness: 1.0,
  celBands: 3,
  shadowsEnabled: true,
  damageNumbersEnabled: true,
  screenShakeIntensity: 0.75,
  minimapVisible: true,
  showFpsCounter: false,
  audioMaster: 0.8,
  audioSfx: 0.85,
  audioMusic: 0.65,
  audioMuted: false,
  mouseSensitivity: 1.0,
  invertMouseY: false,
  gamepad: Object.freeze({
    profile: 'xbox',
    deadzone: GAMEPAD_DEADZONE_DEFAULT,
    sensitivityX: 1.0,
    sensitivityY: 1.0,
    invertY: false,
    vibration: true,
    swapConfirmCancel: false,
  }),
});

export interface RunRecord {
  timestamp: string;
  characterId: CharacterId;
  mapId: MapId;
  mapTier: MapTier;
  victory: boolean;
  durationSec: number;
  level: number;
  kills: number;
  silverEarned: number;
  highestHit: number;
}

export interface SaveData {
  version: number;
  updatedAt: string;
  silver: number;
  totalRuns: number;
  totalKills: number;
  totalPlayTimeSec: number;
  unlockedCharacters: CharacterId[];
  unlockedWeapons: string[];
  unlockedTomes: string[];
  unlockedItems: string[];
  unlockedMaps: MapId[];
  unlockedSkins: string[];
  unlockedHats: string[];
  completedChallenges: string[];
  questProgress: Record<string, number>;
  claimedQuests: string[];
  shopLevels: Record<ShopUpgradeId, number>;
  selectedCharacter: CharacterId;
  selectedSkin: string | null;
  selectedHat: string | null;
  selectedMap: MapId;
  selectedMapTier: MapTier;
  selectedChallenge: string | null;
  settings: RenderSettings;
  bestRuns: RunRecord[];
  customPackEnabled: boolean;
}

export function createDefaultSaveData(): SaveData {
  return {
    version: SAVE_VERSION,
    updatedAt: new Date(0).toISOString(),
    silver: 0,
    totalRuns: 0,
    totalKills: 0,
    totalPlayTimeSec: 0,
    unlockedCharacters: ['Fox', 'Calcium', 'SirOofie', 'Megachad'],
    unlockedWeapons: ['Firestaff', 'Bone', 'Sword', 'Aura', 'Bow', 'Revolver'],
    unlockedTomes: [
      'DamageTome',
      'AttackSpeedTome',
      'MaxHealthTome',
      'MoveSpeedTome',
      'CritChanceTome',
      'XpTome',
    ],
    unlockedItems: [],
    unlockedMaps: ['Forest'],
    unlockedSkins: [],
    unlockedHats: [],
    completedChallenges: [],
    questProgress: {},
    claimedQuests: [],
    shopLevels: {
      MaxHealth: 0,
      Damage: 0,
      MoveSpeed: 0,
      Luck: 0,
      XpGain: 0,
      SilverGain: 0,
      Revival: 0,
      DraftControl: 0,
    },
    selectedCharacter: 'Fox',
    selectedSkin: null,
    selectedHat: null,
    selectedMap: 'Forest',
    selectedMapTier: 1,
    selectedChallenge: null,
    settings: {
      ...DEFAULT_RENDER_SETTINGS,
      gamepad: { ...DEFAULT_RENDER_SETTINGS.gamepad },
    },
    bestRuns: [],
    customPackEnabled: false,
  };
}

/**
 * Custom Asset Pack manifest produced by `tools/extract-assets.ts`
 * and consumed by `IAssetPack` in dev (`/__custom_pack__/manifest.json`) or user upload.
 */
export interface PackTextureEntry {
  id: string;
  path: string;
  width?: number;
  height?: number;
  format?: string;
  category?: 'palette' | 'icon' | 'ui' | 'character' | 'world' | 'vfx';
}

export interface PackAudioEntry {
  id: string;
  path: string;
  category?: 'sfx' | 'music' | 'ui';
  durationSec?: number;
  format?: string;
}

export interface PackPaletteEntry {
  id: string;
  colors: string[];
  sourcePath?: string;
}

export interface PackManifest {
  version: string;
  generatedAt: string;
  sourceVerified: boolean;
  baseUrl?: string;
  textures: Record<string, PackTextureEntry>;
  audio: Record<string, PackAudioEntry>;
  localization: Record<string, string>;
  palettes: Record<string, PackPaletteEntry>;
  skippedCodecs?: Record<string, number>;
  oracleSummary?: Record<string, unknown>;
}

export interface CustomPackFileEntry {
  relativePath: string;
  bytes: Uint8Array;
  mimeType?: string;
}

// ============================================================================
// 8. DEBUG BRIDGE (window.__KRUNKED_DEBUG__)
// ============================================================================

export interface DebugPerfMetrics {
  fps: number;
  frameTimeMs: number;
  simStepMs: number;
  drawCalls: number;
  triangles: number;
  activeEnemies: number;
  activeProjectiles: number;
  interpAlpha: number;
}

/**
 * Exposed at `window.__KRUNKED_DEBUG__` by `src/main.ts` for automated playtesting,
 * verification harnesses, and deterministic inspection.
 */
export interface DebugBridge {
  readonly version: string;
  getState(): SimState;
  getSettings(): RenderSettings;
  setSettings(patch: Partial<RenderSettings>): void;
  getPerfMetrics(): DebugPerfMetrics;
  getActiveInputDevice(): InputDeviceKind;
  isTouchOverlayVisible(): boolean;
  getStateHash(): string;
  stepTicks(count: number, input?: Partial<InputFrame>): SimEvent[];
  startRun(config: SimConfig): void;
  setPhase(phase: GamePhase): void;
  teleportPlayer(pos: Vec3): void;
  grantXp(amount: number): void;
  grantGold(amount: number): void;
  grantWeapon(weaponId: string, level?: number): void;
  grantTome(tomeId: string, level?: number): void;
  grantItem(itemId: string, stacks?: number): void;
  spawnEnemy(enemyId: string, pos?: Vec3, role?: EnemyRole): number;
  triggerBoss(): void;
  triggerFinalSwarm(): void;
  cleansePylon(pylonIndex: number): void;
  applyDraftChoice(choiceIndex: number): void;
}

// ============================================================================
// 9. DECOUPLED MODULE INTERFACES
// ============================================================================

export interface TerrainSample {
  height: number;
  normal: Vec3;
  slopeAngleRad: number;
  inBounds: boolean;
  surfaceTag: 'ground' | 'dune' | 'stone' | 'crypt' | 'void';
}

export interface WallHit {
  hit: boolean;
  normal: Vec3;
  penetration: number;
  point: Vec3;
}

export interface ITerrainSampler {
  readonly mapId: MapId;
  readonly seed: number;
  readonly arenaRadius: number;
  sample(x: number, z: number): TerrainSample;
  checkWallCollision(pos: Vec3, radius: number, height: number): WallHit;
  clampToArena(pos: Vec3, margin?: number): Vec3;
  getSpawnPoint(): Vec3;
}

export interface ISimEngine {
  initRun(config: SimConfig): SimState;
  step(input: InputFrame): SimEvent[];
  getState(): Readonly<SimState>;
  getPrevState(): Readonly<SimState>;
  getTerrainSampler(): ITerrainSampler;
  getCatalog(): Readonly<GameCatalog>;
  applyDraftChoice(choiceIndex: number): SimEvent[];
  rerollDraft(): SimEvent[];
  banishDraftChoice(choiceIndex: number): SimEvent[];
  skipDraft(): SimEvent[];
  setPhase(phase: GamePhase): SimEvent[];
  computeStateHash(): string;
}

export interface IRenderer {
  /** Opaque host container (e.g. HTMLElement in browser) to keep contracts DOM-free */
  mount(container: unknown, settings: RenderSettings): void;
  unmount(): void;
  resize(width: number, height: number, devicePixelRatio?: number): void;
  setSettings(settings: RenderSettings): void;
  getSettings(): RenderSettings;
  setAssetPack(pack: IAssetPack | null): void;
  loadMapVisuals(mapId: MapId, mapTier: MapTier, seed: number, terrain: ITerrainSampler): void;
  consumeEvents(events: readonly SimEvent[]): void;
  render(prevState: Readonly<SimState>, currState: Readonly<SimState>, interpAlpha: number): void;
  getPerfMetrics(): DebugPerfMetrics;
}

export interface IAudioEngine {
  init(): void;
  unlock(): void;
  setSettings(settings: Pick<RenderSettings, 'audioMaster' | 'audioSfx' | 'audioMusic' | 'audioMuted'>): void;
  setAssetPack(pack: IAssetPack | null): void;
  consumeEvents(events: readonly SimEvent[]): void;
  setMusicState(state: 'title' | 'explore' | 'boss' | 'final_swarm' | 'victory' | 'game_over' | 'silent'): void;
  update(dtSec: number): void;
  dispose(): void;
}

export interface IInputManager {
  /** Opaque host container (e.g. Window/HTMLElement in browser) to keep contracts DOM-free */
  attach(target: unknown): void;
  detach(): void;
  pollFrame(dtSec: number, phase: GamePhase): InputFrame;
  consumeUiActions(): UiNavAction[];
  getActiveDevice(): InputDeviceKind;
  /** Strictly true ONLY when touch input has activated the transparent TouchOverlay */
  isTouchOverlayVisible(): boolean;
  isGamepadConnected(): boolean;
  getGamepadProfile(): GamepadProfile;
  setCalibration(calibration: GamepadCalibration): void;
  getCalibration(): GamepadCalibration;
  setMouseSettings(sensitivity: number, invertY: boolean): void;
  setPointerLockAllowed(allowed: boolean): void;
  requestPointerLock(): void;
  exitPointerLock(): void;
  isPointerLocked(): boolean;
}

export interface IAssetPack {
  isLoaded(): boolean;
  getManifest(): PackManifest | null;
  loadFromDevEndpoint(prefix?: string): Promise<boolean>;
  loadFromFiles(files: readonly CustomPackFileEntry[]): Promise<boolean>;
  clear(): void;
  getTextureUrl(id: string): string | null;
  getAudioUrl(id: string): string | null;
  getLocalizedString(key: string, fallback?: string): string;
  getPalette(id: string): readonly string[] | null;
}
