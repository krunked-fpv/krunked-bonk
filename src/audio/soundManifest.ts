/**
 * KRUNKEDBONK — Declarative Audio Cue & Music Manifest + AudioSpamFilter (Wave 2)
 *
 * Maps every SimEvent variant, all 30 weapon IDs across distinct evocative synth
 * families, movement & ambient loops, pickup combos, Wave 2 encounter fanfares,
 * and the full 19-track (17 looping + 2 stingers) adaptive OST & Boombox manifest.
 */

import type {
  DebuffType,
  GamePhase,
  InteractableKind,
  MapId,
  MapTier,
  PickupKind,
  SimEvent,
} from '../contracts/index';

// ============================================================================
// 1. CUE, WEAPON FAMILY & MUSIC TRACK IDS
// ============================================================================

export type SfxCategory = 'combat' | 'weapon' | 'movement' | 'pickup' | 'world' | 'ui';

export type WeaponAudioFamily =
  | 'fire'
  | 'bone'
  | 'sword'
  | 'aura'
  | 'revolver'
  | 'rock'
  | 'lightning'
  | 'sniper'
  | 'bow'
  | 'aegis_clang'
  | 'axe_whoosh'
  | 'boomerang_whir'
  | 'blackhole_hum'
  | 'blood_pulse'
  | 'bow_twang'
  | 'scythe_reap'
  | 'shotgun_boom'
  | 'rocket_launch'
  | 'noodle_beam'
  | 'tornado_whoosh'
  | 'katana_shing'
  | 'mine_beep'
  | 'flask_shatter'
  | 'dice_rattle'
  | 'dragon_flame'
  | 'frost_crack'
  | 'dagger_zip'
  | 'flame_trail'
  | 'corrupted_slash'
  | 'execution_blade'
  | 'hero_wave';

export type SfxCueId =
  // Combat & hits
  | 'bonk'
  | 'megacrit'
  | 'crit'
  | 'hit'
  | 'execute'
  | 'kill'
  | 'kill_elite'
  | 'debuff'
  | 'item_proc'
  | 'player_hurt'
  | 'player_hurt_shield'
  | 'player_dodge'
  | 'player_death'
  | 'player_revive'
  // Weapons (all 30 distinct families + legacy bow alias)
  | 'weapon_fire_fire'
  | 'weapon_fire_bone'
  | 'weapon_fire_sword'
  | 'weapon_fire_aura'
  | 'weapon_fire_revolver'
  | 'weapon_fire_rock'
  | 'weapon_fire_lightning'
  | 'weapon_fire_sniper'
  | 'weapon_fire_bow'
  | 'weapon_fire_aegis_clang'
  | 'weapon_fire_axe_whoosh'
  | 'weapon_fire_boomerang_whir'
  | 'weapon_fire_blackhole_hum'
  | 'weapon_fire_blood_pulse'
  | 'weapon_fire_bow_twang'
  | 'weapon_fire_scythe_reap'
  | 'weapon_fire_shotgun_boom'
  | 'weapon_fire_rocket_launch'
  | 'weapon_fire_noodle_beam'
  | 'weapon_fire_tornado_whoosh'
  | 'weapon_fire_katana_shing'
  | 'weapon_fire_mine_beep'
  | 'weapon_fire_flask_shatter'
  | 'weapon_fire_dice_rattle'
  | 'weapon_fire_dragon_flame'
  | 'weapon_fire_frost_crack'
  | 'weapon_fire_dagger_zip'
  | 'weapon_fire_flame_trail'
  | 'weapon_fire_corrupted_slash'
  | 'weapon_fire_execution_blade'
  | 'weapon_fire_hero_wave'
  | 'weapon_stolen'
  | 'weapon_reclaimed'
  // Movement
  | 'jump'
  | 'bhop'
  | 'air_jump'
  | 'land'
  | 'fall_damage'
  | 'slide_start'
  | 'slide_end'
  | 'wall_climb'
  | 'rail_attach'
  | 'rail_detach'
  | 'jump_pad'
  | 'unstuck'
  // Pickups & progression
  | 'xp'
  | 'gold'
  | 'silver'
  | 'heal'
  | 'powerup'
  | 'level_up'
  // World, shrines, encounters, chests & bosses
  | 'shrine_charge'
  | 'shrine_complete'
  | 'chest_open'
  | 'pot_break'
  | 'pylon_charged'
  | 'shady_buy'
  | 'microwave_clone'
  | 'moai_blessing'
  | 'lamp_lit'
  | 'portal_activated'
  | 'elite_spawn'
  | 'boss_spawn'
  | 'boss_defeated'
  | 'final_swarm'
  // UI feedback
  | 'ui_move'
  | 'ui_confirm'
  | 'ui_cancel'
  | 'ui_reroll'
  | 'ui_banish';

export type ContinuousLoopId = 'slide_loop' | 'rail_grind_loop' | 'desert_wind';

export type MusicState =
  | 'title'
  | 'explore'
  | 'boss'
  | 'final_swarm'
  | 'victory'
  | 'game_over'
  | 'silent';

export type MusicTrackId =
  | 'title'
  | 'forest_1'
  | 'forest_2'
  | 'forest_3'
  | 'forest_boss'
  | 'desert_1'
  | 'desert_2'
  | 'desert_3'
  | 'desert_boss'
  | 'graveyard'
  | 'graveyard_boss'
  | 'final_boss'
  | 'final_swarm'
  | 'calcium'
  | 'megachad'
  | 'dicy'
  | 'space'
  | 'victory'
  | 'game_over';

export type BoomboxTrackId = 'auto' | MusicTrackId;

/** Canonical 30 weapon IDs across the full catalog. */
export const ALL_WEAPON_IDS = [
  'WeaponFireStaff',
  'WeaponBone',
  'WeaponSword',
  'WeaponAura',
  'WeaponRevolver',
  'WeaponChunkers',
  'WeaponLightningBolt',
  'WeaponSniper',
  'WeaponAegis',
  'WeaponAxe',
  'WeaponBananarang',
  'WeaponBlackHole',
  'WeaponBloodMagic',
  'WeaponBow',
  'WeaponCorruptedSword',
  'WeaponDexecutioner',
  'WeaponDice',
  'WeaponDragonsBreath',
  'WeaponFlameWalker',
  'WeaponFrostWalker',
  'WeaponHeroSword',
  'WeaponKatana',
  'WeaponMines',
  'WeaponPoisonFlask',
  'WeaponScythe',
  'WeaponShotgun',
  'WeaponSluttyRocket',
  'WeaponSpaceNoodle',
  'WeaponTornado',
  'WeaponWirelessDagger',
] as const;

// ============================================================================
// 2. MANIFEST DEFINITIONS
// ============================================================================

export interface SfxCueDef {
  readonly id: SfxCueId;
  readonly category: SfxCategory;
  /** Default relative gain (0..1+) before category & master buses */
  readonly gain: number;
  /** Minimum ms between consecutive triggers of this cue (AudioSpamFilter) */
  readonly cooldownMs: number;
  /** Maximum simultaneous active voices for this cue */
  readonly maxPolyphony: number;
  /** Higher priority cues bypass global soft voice cap (1 = low, 10 = critical) */
  readonly priority: number;
  /** Micro pitch jitter ratio (0.06 => ±6%); 0 for exact-pitch melodic cues */
  readonly pitchJitter: number;
  /** Estimated voice duration in ms for polyphony window tracking */
  readonly estimatedDurationMs: number;
  /** Ordered candidate clip IDs queried on IAssetPack.getAudioUrl() */
  readonly customPackClipIds: readonly string[];
}

export interface ContinuousLoopDef {
  readonly id: ContinuousLoopId;
  readonly gain: number;
  readonly customPackClipIds: readonly string[];
}

export interface MusicTrackManifestEntry {
  readonly id: MusicTrackId;
  readonly label: string;
  readonly displayName: string;
  readonly bpm: number;
  readonly looping: boolean;
  readonly gain: number;
  readonly boomboxSelectable: boolean;
  readonly customPackClipIds: readonly string[];
}

export interface BoomboxTrackDescriptor {
  readonly id: BoomboxTrackId;
  readonly label: string;
  readonly displayName: string;
  readonly bpm: number;
  readonly looping: boolean;
  readonly gain: number;
  readonly boomboxSelectable: boolean;
  readonly customPackClipIds: readonly string[];
}

export interface SfxTriggerRequest {
  readonly cueId: SfxCueId;
  /** Normalized intensity multiplier (0.2..1.5), defaults to 1.0 */
  readonly intensity?: number;
  /** Optional explicit pitch scale multiplier (stacks with jitter) */
  readonly pitchScale?: number;
  /** Optional streak / progression index (xp combo, bhop streak, shrine ramp, pylon index) */
  readonly streak?: number;
  /** Optional debuff flavor for debuff cues */
  readonly debuff?: DebuffType;
  /** Optional raw weaponId for finer Custom Pack clip lookup */
  readonly weaponId?: string;
}

export const SFX_MANIFEST: Readonly<Record<SfxCueId, SfxCueDef>> = Object.freeze({
  // --- Combat & Hits ---
  bonk: {
    id: 'bonk',
    category: 'combat',
    gain: 1.0,
    cooldownMs: 85,
    maxPolyphony: 3,
    priority: 10,
    pitchJitter: 0.04,
    estimatedDurationMs: 420,
    customPackClipIds: ['sfx_bonk', 'bonk', 'bonker_proc', 'bonk_hit'],
  },
  megacrit: {
    id: 'megacrit',
    category: 'combat',
    gain: 0.9,
    cooldownMs: 65,
    maxPolyphony: 3,
    priority: 9,
    pitchJitter: 0.05,
    estimatedDurationMs: 320,
    customPackClipIds: ['sfx_megacrit', 'megacrit', 'crit_mega'],
  },
  crit: {
    id: 'crit',
    category: 'combat',
    gain: 0.72,
    cooldownMs: 42,
    maxPolyphony: 4,
    priority: 7,
    pitchJitter: 0.06,
    estimatedDurationMs: 160,
    customPackClipIds: ['sfx_crit', 'crit', 'hit_crit'],
  },
  hit: {
    id: 'hit',
    category: 'combat',
    gain: 0.56,
    cooldownMs: 34,
    maxPolyphony: 5,
    priority: 4,
    pitchJitter: 0.06,
    estimatedDurationMs: 110,
    customPackClipIds: ['sfx_hit', 'hit', 'enemy_hit'],
  },
  execute: {
    id: 'execute',
    category: 'combat',
    gain: 0.92,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 9,
    pitchJitter: 0.04,
    estimatedDurationMs: 280,
    customPackClipIds: ['sfx_execute', 'execute'],
  },
  kill: {
    id: 'kill',
    category: 'combat',
    gain: 0.62,
    cooldownMs: 38,
    maxPolyphony: 5,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 140,
    customPackClipIds: ['sfx_kill', 'enemy_kill', 'enemy_death'],
  },
  kill_elite: {
    id: 'kill_elite',
    category: 'combat',
    gain: 0.85,
    cooldownMs: 90,
    maxPolyphony: 2,
    priority: 8,
    pitchJitter: 0.05,
    estimatedDurationMs: 320,
    customPackClipIds: ['sfx_kill_elite', 'elite_kill', 'miniboss_kill'],
  },
  debuff: {
    id: 'debuff',
    category: 'combat',
    gain: 0.42,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 3,
    pitchJitter: 0.06,
    estimatedDurationMs: 140,
    customPackClipIds: ['sfx_debuff', 'debuff_apply'],
  },
  item_proc: {
    id: 'item_proc',
    category: 'combat',
    gain: 0.44,
    cooldownMs: 85,
    maxPolyphony: 3,
    priority: 4,
    pitchJitter: 0.06,
    estimatedDurationMs: 150,
    customPackClipIds: ['sfx_item_proc', 'item_proc'],
  },
  player_hurt: {
    id: 'player_hurt',
    category: 'combat',
    gain: 0.9,
    cooldownMs: 110,
    maxPolyphony: 2,
    priority: 10,
    pitchJitter: 0.05,
    estimatedDurationMs: 260,
    customPackClipIds: ['sfx_player_hurt', 'player_hurt', 'hurt'],
  },
  player_hurt_shield: {
    id: 'player_hurt_shield',
    category: 'combat',
    gain: 0.78,
    cooldownMs: 95,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0.06,
    estimatedDurationMs: 210,
    customPackClipIds: ['sfx_shield_hit', 'shield_block', 'player_hurt'],
  },
  player_dodge: {
    id: 'player_dodge',
    category: 'combat',
    gain: 0.65,
    cooldownMs: 80,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.06,
    estimatedDurationMs: 180,
    customPackClipIds: ['sfx_dodge', 'player_dodge', 'evade'],
  },
  player_death: {
    id: 'player_death',
    category: 'combat',
    gain: 0.95,
    cooldownMs: 400,
    maxPolyphony: 1,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 900,
    customPackClipIds: ['sfx_player_death', 'player_death', 'death'],
  },
  player_revive: {
    id: 'player_revive',
    category: 'combat',
    gain: 0.92,
    cooldownMs: 350,
    maxPolyphony: 1,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 700,
    customPackClipIds: ['sfx_player_revive', 'revive', 'phoenix'],
  },

  // --- Weapons (All 30 Families) ---
  weapon_fire_fire: {
    id: 'weapon_fire_fire',
    category: 'weapon',
    gain: 0.56,
    cooldownMs: 55,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 200,
    customPackClipIds: ['sfx_weapon_fire', 'weapon_firestaff', 'fireball'],
  },
  weapon_fire_bone: {
    id: 'weapon_fire_bone',
    category: 'weapon',
    gain: 0.58,
    cooldownMs: 48,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 140,
    customPackClipIds: ['sfx_weapon_bone', 'weapon_bone', 'bone_throw'],
  },
  weapon_fire_sword: {
    id: 'weapon_fire_sword',
    category: 'weapon',
    gain: 0.6,
    cooldownMs: 52,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 190,
    customPackClipIds: ['sfx_weapon_sword', 'weapon_sword', 'sword_slash'],
  },
  weapon_fire_aura: {
    id: 'weapon_fire_aura',
    category: 'weapon',
    gain: 0.44,
    cooldownMs: 120,
    maxPolyphony: 2,
    priority: 4,
    pitchJitter: 0.04,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_weapon_aura', 'weapon_aura', 'aura_pulse'],
  },
  weapon_fire_revolver: {
    id: 'weapon_fire_revolver',
    category: 'weapon',
    gain: 0.58,
    cooldownMs: 36,
    maxPolyphony: 5,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 130,
    customPackClipIds: ['sfx_weapon_revolver', 'weapon_revolver', 'gunshot'],
  },
  weapon_fire_rock: {
    id: 'weapon_fire_rock',
    category: 'weapon',
    gain: 0.62,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_weapon_rock', 'weapon_chunkers', 'rock_throw'],
  },
  weapon_fire_lightning: {
    id: 'weapon_fire_lightning',
    category: 'weapon',
    gain: 0.64,
    cooldownMs: 60,
    maxPolyphony: 4,
    priority: 6,
    pitchJitter: 0.06,
    estimatedDurationMs: 220,
    customPackClipIds: ['sfx_weapon_lightning', 'weapon_lightning', 'lightning_zap'],
  },
  weapon_fire_sniper: {
    id: 'weapon_fire_sniper',
    category: 'weapon',
    gain: 0.84,
    cooldownMs: 90,
    maxPolyphony: 3,
    priority: 8,
    pitchJitter: 0.04,
    estimatedDurationMs: 340,
    customPackClipIds: ['sfx_weapon_sniper', 'weapon_sniper', 'sniper_shot'],
  },
  weapon_fire_bow: {
    id: 'weapon_fire_bow',
    category: 'weapon',
    gain: 0.56,
    cooldownMs: 48,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 160,
    customPackClipIds: ['sfx_weapon_bow', 'weapon_bow', 'bow_release'],
  },
  weapon_fire_aegis_clang: {
    id: 'weapon_fire_aegis_clang',
    category: 'weapon',
    gain: 0.72,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 280,
    customPackClipIds: ['sfx_weapon_aegis', 'weapon_aegis', 'shield_clang'],
  },
  weapon_fire_axe_whoosh: {
    id: 'weapon_fire_axe_whoosh',
    category: 'weapon',
    gain: 0.66,
    cooldownMs: 62,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 230,
    customPackClipIds: ['sfx_weapon_axe', 'weapon_axe', 'axe_throw'],
  },
  weapon_fire_boomerang_whir: {
    id: 'weapon_fire_boomerang_whir',
    category: 'weapon',
    gain: 0.58,
    cooldownMs: 65,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_weapon_bananarang', 'weapon_bananarang', 'boomerang'],
  },
  weapon_fire_blackhole_hum: {
    id: 'weapon_fire_blackhole_hum',
    category: 'weapon',
    gain: 0.72,
    cooldownMs: 120,
    maxPolyphony: 2,
    priority: 6,
    pitchJitter: 0.04,
    estimatedDurationMs: 420,
    customPackClipIds: ['sfx_weapon_blackhole', 'weapon_blackhole', 'void_vortex'],
  },
  weapon_fire_blood_pulse: {
    id: 'weapon_fire_blood_pulse',
    category: 'weapon',
    gain: 0.62,
    cooldownMs: 85,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.05,
    estimatedDurationMs: 260,
    customPackClipIds: ['sfx_weapon_bloodmagic', 'weapon_bloodmagic', 'blood_pulse'],
  },
  weapon_fire_bow_twang: {
    id: 'weapon_fire_bow_twang',
    category: 'weapon',
    gain: 0.58,
    cooldownMs: 48,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 170,
    customPackClipIds: ['sfx_weapon_bow', 'weapon_bow', 'bow_twang', 'bow_release'],
  },
  weapon_fire_scythe_reap: {
    id: 'weapon_fire_scythe_reap',
    category: 'weapon',
    gain: 0.7,
    cooldownMs: 68,
    maxPolyphony: 3,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 280,
    customPackClipIds: ['sfx_weapon_scythe', 'weapon_scythe', 'scythe_reap'],
  },
  weapon_fire_shotgun_boom: {
    id: 'weapon_fire_shotgun_boom',
    category: 'weapon',
    gain: 0.82,
    cooldownMs: 85,
    maxPolyphony: 3,
    priority: 7,
    pitchJitter: 0.05,
    estimatedDurationMs: 290,
    customPackClipIds: ['sfx_weapon_shotgun', 'weapon_shotgun', 'shotgun_blast'],
  },
  weapon_fire_rocket_launch: {
    id: 'weapon_fire_rocket_launch',
    category: 'weapon',
    gain: 0.72,
    cooldownMs: 75,
    maxPolyphony: 4,
    priority: 6,
    pitchJitter: 0.06,
    estimatedDurationMs: 310,
    customPackClipIds: ['sfx_weapon_rocket', 'weapon_sluttyrocket', 'rocket_launch'],
  },
  weapon_fire_noodle_beam: {
    id: 'weapon_fire_noodle_beam',
    category: 'weapon',
    gain: 0.56,
    cooldownMs: 80,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.05,
    estimatedDurationMs: 280,
    customPackClipIds: ['sfx_weapon_spacenoodle', 'weapon_spacenoodle', 'laser_beam'],
  },
  weapon_fire_tornado_whoosh: {
    id: 'weapon_fire_tornado_whoosh',
    category: 'weapon',
    gain: 0.64,
    cooldownMs: 95,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.05,
    estimatedDurationMs: 340,
    customPackClipIds: ['sfx_weapon_tornado', 'weapon_tornado', 'wind_vortex'],
  },
  weapon_fire_katana_shing: {
    id: 'weapon_fire_katana_shing',
    category: 'weapon',
    gain: 0.64,
    cooldownMs: 42,
    maxPolyphony: 5,
    priority: 6,
    pitchJitter: 0.06,
    estimatedDurationMs: 185,
    customPackClipIds: ['sfx_weapon_katana', 'weapon_katana', 'katana_shing'],
  },
  weapon_fire_mine_beep: {
    id: 'weapon_fire_mine_beep',
    category: 'weapon',
    gain: 0.6,
    cooldownMs: 65,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.04,
    estimatedDurationMs: 200,
    customPackClipIds: ['sfx_weapon_mines', 'weapon_mines', 'mine_arm'],
  },
  weapon_fire_flask_shatter: {
    id: 'weapon_fire_flask_shatter',
    category: 'weapon',
    gain: 0.64,
    cooldownMs: 65,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_weapon_poisonflask', 'weapon_poisonflask', 'glass_shatter'],
  },
  weapon_fire_dice_rattle: {
    id: 'weapon_fire_dice_rattle',
    category: 'weapon',
    gain: 0.62,
    cooldownMs: 55,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 195,
    customPackClipIds: ['sfx_weapon_dice', 'weapon_dice', 'dice_rattle'],
  },
  weapon_fire_dragon_flame: {
    id: 'weapon_fire_dragon_flame',
    category: 'weapon',
    gain: 0.68,
    cooldownMs: 70,
    maxPolyphony: 3,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 310,
    customPackClipIds: ['sfx_weapon_dragonsbreath', 'weapon_dragonsbreath', 'dragon_flame'],
  },
  weapon_fire_frost_crack: {
    id: 'weapon_fire_frost_crack',
    category: 'weapon',
    gain: 0.64,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.05,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_weapon_frostwalker', 'weapon_frostwalker', 'ice_shatter'],
  },
  weapon_fire_dagger_zip: {
    id: 'weapon_fire_dagger_zip',
    category: 'weapon',
    gain: 0.56,
    cooldownMs: 40,
    maxPolyphony: 5,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 145,
    customPackClipIds: ['sfx_weapon_wirelessdagger', 'weapon_wirelessdagger', 'dagger_throw'],
  },
  weapon_fire_flame_trail: {
    id: 'weapon_fire_flame_trail',
    category: 'weapon',
    gain: 0.54,
    cooldownMs: 75,
    maxPolyphony: 3,
    priority: 4,
    pitchJitter: 0.06,
    estimatedDurationMs: 210,
    customPackClipIds: ['sfx_weapon_flamewalker', 'weapon_flamewalker', 'fire_trail'],
  },
  weapon_fire_corrupted_slash: {
    id: 'weapon_fire_corrupted_slash',
    category: 'weapon',
    gain: 0.68,
    cooldownMs: 58,
    maxPolyphony: 4,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 235,
    customPackClipIds: ['sfx_weapon_corruptedsword', 'weapon_corruptedsword', 'dark_slash'],
  },
  weapon_fire_execution_blade: {
    id: 'weapon_fire_execution_blade',
    category: 'weapon',
    gain: 0.72,
    cooldownMs: 64,
    maxPolyphony: 3,
    priority: 6,
    pitchJitter: 0.04,
    estimatedDurationMs: 260,
    customPackClipIds: ['sfx_weapon_dexecutioner', 'weapon_dexecutioner', 'guillotine_slash'],
  },
  weapon_fire_hero_wave: {
    id: 'weapon_fire_hero_wave',
    category: 'weapon',
    gain: 0.66,
    cooldownMs: 58,
    maxPolyphony: 4,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 245,
    customPackClipIds: ['sfx_weapon_herosword', 'weapon_herosword', 'sword_wave'],
  },
  weapon_stolen: {
    id: 'weapon_stolen',
    category: 'world',
    gain: 0.92,
    cooldownMs: 200,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 580,
    customPackClipIds: ['sfx_weapon_stolen', 'weapon_stolen', 'power_drain'],
  },
  weapon_reclaimed: {
    id: 'weapon_reclaimed',
    category: 'world',
    gain: 0.92,
    cooldownMs: 200,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 600,
    customPackClipIds: ['sfx_weapon_reclaimed', 'weapon_reclaimed', 'power_restore'],
  },

  // --- Movement ---
  jump: {
    id: 'jump',
    category: 'movement',
    gain: 0.62,
    cooldownMs: 65,
    maxPolyphony: 2,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 160,
    customPackClipIds: ['sfx_jump', 'jump', 'player_jump'],
  },
  bhop: {
    id: 'bhop',
    category: 'movement',
    gain: 0.72,
    cooldownMs: 65,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.03,
    estimatedDurationMs: 190,
    customPackClipIds: ['sfx_bhop', 'bhop', 'jump_boost'],
  },
  air_jump: {
    id: 'air_jump',
    category: 'movement',
    gain: 0.64,
    cooldownMs: 65,
    maxPolyphony: 2,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 170,
    customPackClipIds: ['sfx_air_jump', 'double_jump', 'jump'],
  },
  land: {
    id: 'land',
    category: 'movement',
    gain: 0.52,
    cooldownMs: 85,
    maxPolyphony: 2,
    priority: 4,
    pitchJitter: 0.06,
    estimatedDurationMs: 140,
    customPackClipIds: ['sfx_land', 'land', 'footstep_land'],
  },
  fall_damage: {
    id: 'fall_damage',
    category: 'movement',
    gain: 0.88,
    cooldownMs: 160,
    maxPolyphony: 1,
    priority: 9,
    pitchJitter: 0.04,
    estimatedDurationMs: 260,
    customPackClipIds: ['sfx_fall_damage', 'fall_damage', 'land_heavy'],
  },
  slide_start: {
    id: 'slide_start',
    category: 'movement',
    gain: 0.52,
    cooldownMs: 110,
    maxPolyphony: 2,
    priority: 6,
    pitchJitter: 0.05,
    estimatedDurationMs: 180,
    customPackClipIds: ['sfx_slide_start', 'slide_start'],
  },
  slide_end: {
    id: 'slide_end',
    category: 'movement',
    gain: 0.34,
    cooldownMs: 100,
    maxPolyphony: 2,
    priority: 3,
    pitchJitter: 0.06,
    estimatedDurationMs: 110,
    customPackClipIds: ['sfx_slide_end', 'slide_end'],
  },
  wall_climb: {
    id: 'wall_climb',
    category: 'movement',
    gain: 0.6,
    cooldownMs: 80,
    maxPolyphony: 2,
    priority: 6,
    pitchJitter: 0.06,
    estimatedDurationMs: 160,
    customPackClipIds: ['sfx_wall_climb', 'wall_climb', 'wall_kick'],
  },
  rail_attach: {
    id: 'rail_attach',
    category: 'movement',
    gain: 0.72,
    cooldownMs: 90,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.05,
    estimatedDurationMs: 190,
    customPackClipIds: ['sfx_rail_attach', 'rail_attach', 'grind_start'],
  },
  rail_detach: {
    id: 'rail_detach',
    category: 'movement',
    gain: 0.56,
    cooldownMs: 90,
    maxPolyphony: 2,
    priority: 5,
    pitchJitter: 0.05,
    estimatedDurationMs: 170,
    customPackClipIds: ['sfx_rail_detach', 'rail_detach', 'grind_jump'],
  },
  jump_pad: {
    id: 'jump_pad',
    category: 'movement',
    gain: 0.84,
    cooldownMs: 110,
    maxPolyphony: 2,
    priority: 8,
    pitchJitter: 0.04,
    estimatedDurationMs: 320,
    customPackClipIds: ['sfx_jump_pad', 'jump_pad', 'boing'],
  },
  unstuck: {
    id: 'unstuck',
    category: 'movement',
    gain: 0.6,
    cooldownMs: 250,
    maxPolyphony: 1,
    priority: 6,
    pitchJitter: 0,
    estimatedDurationMs: 240,
    customPackClipIds: ['sfx_unstuck', 'teleport'],
  },

  // --- Pickups & Progression ---
  xp: {
    id: 'xp',
    category: 'pickup',
    gain: 0.52,
    cooldownMs: 28,
    maxPolyphony: 6,
    priority: 6,
    pitchJitter: 0.015,
    estimatedDurationMs: 140,
    customPackClipIds: ['sfx_xp', 'xp_pickup', 'gem_pickup'],
  },
  gold: {
    id: 'gold',
    category: 'pickup',
    gain: 0.62,
    cooldownMs: 40,
    maxPolyphony: 4,
    priority: 6,
    pitchJitter: 0.04,
    estimatedDurationMs: 180,
    customPackClipIds: ['sfx_gold', 'coin', 'gold_pickup'],
  },
  silver: {
    id: 'silver',
    category: 'pickup',
    gain: 0.72,
    cooldownMs: 55,
    maxPolyphony: 3,
    priority: 7,
    pitchJitter: 0.03,
    estimatedDurationMs: 230,
    customPackClipIds: ['sfx_silver', 'silver_pickup'],
  },
  heal: {
    id: 'heal',
    category: 'pickup',
    gain: 0.7,
    cooldownMs: 90,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.02,
    estimatedDurationMs: 320,
    customPackClipIds: ['sfx_heal', 'heal', 'health_pickup'],
  },
  powerup: {
    id: 'powerup',
    category: 'pickup',
    gain: 0.84,
    cooldownMs: 110,
    maxPolyphony: 2,
    priority: 8,
    pitchJitter: 0.02,
    estimatedDurationMs: 420,
    customPackClipIds: ['sfx_powerup', 'powerup', 'pickup_special'],
  },
  level_up: {
    id: 'level_up',
    category: 'pickup',
    gain: 0.92,
    cooldownMs: 220,
    maxPolyphony: 2,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 780,
    customPackClipIds: ['sfx_level_up', 'level_up', 'levelup'],
  },

  // --- World, Shrines, Encounters, Chests & Bosses ---
  shrine_charge: {
    id: 'shrine_charge',
    category: 'world',
    gain: 0.45,
    cooldownMs: 140,
    maxPolyphony: 2,
    priority: 5,
    pitchJitter: 0.01,
    estimatedDurationMs: 170,
    customPackClipIds: ['sfx_shrine_charge', 'shrine_tick'],
  },
  shrine_complete: {
    id: 'shrine_complete',
    category: 'world',
    gain: 0.9,
    cooldownMs: 240,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 720,
    customPackClipIds: ['sfx_shrine_complete', 'shrine_complete', 'shrine_finish'],
  },
  chest_open: {
    id: 'chest_open',
    category: 'world',
    gain: 0.92,
    cooldownMs: 240,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 760,
    customPackClipIds: ['sfx_chest_open', 'chest_open', 'treasure'],
  },
  pot_break: {
    id: 'pot_break',
    category: 'world',
    gain: 0.65,
    cooldownMs: 55,
    maxPolyphony: 4,
    priority: 5,
    pitchJitter: 0.06,
    estimatedDurationMs: 190,
    customPackClipIds: ['sfx_pot_break', 'pot_break', 'ceramic_smash'],
  },
  pylon_charged: {
    id: 'pylon_charged',
    category: 'world',
    gain: 0.94,
    cooldownMs: 180,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 740,
    customPackClipIds: ['sfx_pylon_charged', 'pylon_cleanse', 'crystal_chord'],
  },
  shady_buy: {
    id: 'shady_buy',
    category: 'world',
    gain: 0.84,
    cooldownMs: 90,
    maxPolyphony: 3,
    priority: 8,
    pitchJitter: 0.03,
    estimatedDurationMs: 320,
    customPackClipIds: ['sfx_shady_buy', 'shady_buy', 'merchant_buy', 'coin'],
  },
  microwave_clone: {
    id: 'microwave_clone',
    category: 'world',
    gain: 0.9,
    cooldownMs: 220,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 820,
    customPackClipIds: ['sfx_microwave_clone', 'microwave_clone', 'microwave_ding'],
  },
  moai_blessing: {
    id: 'moai_blessing',
    category: 'world',
    gain: 0.92,
    cooldownMs: 240,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 880,
    customPackClipIds: ['sfx_moai_blessing', 'moai_blessing', 'stone_gong'],
  },
  lamp_lit: {
    id: 'lamp_lit',
    category: 'world',
    gain: 0.88,
    cooldownMs: 140,
    maxPolyphony: 3,
    priority: 9,
    pitchJitter: 0.02,
    estimatedDurationMs: 540,
    customPackClipIds: ['sfx_lamp_lit', 'lamp_lit', 'lantern_ignite'],
  },
  portal_activated: {
    id: 'portal_activated',
    category: 'world',
    gain: 0.92,
    cooldownMs: 300,
    maxPolyphony: 1,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 860,
    customPackClipIds: ['sfx_portal', 'portal_activated', 'warp'],
  },
  elite_spawn: {
    id: 'elite_spawn',
    category: 'world',
    gain: 0.72,
    cooldownMs: 450,
    maxPolyphony: 1,
    priority: 7,
    pitchJitter: 0.03,
    estimatedDurationMs: 480,
    customPackClipIds: ['sfx_elite_spawn', 'miniboss_spawn'],
  },
  boss_spawn: {
    id: 'boss_spawn',
    category: 'world',
    gain: 1.0,
    cooldownMs: 600,
    maxPolyphony: 1,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 1450,
    customPackClipIds: ['sfx_boss_spawn', 'boss_spawn', 'boss_horn'],
  },
  boss_defeated: {
    id: 'boss_defeated',
    category: 'world',
    gain: 0.98,
    cooldownMs: 400,
    maxPolyphony: 1,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 1100,
    customPackClipIds: ['sfx_boss_defeated', 'boss_defeated', 'boss_kill'],
  },
  final_swarm: {
    id: 'final_swarm',
    category: 'world',
    gain: 0.98,
    cooldownMs: 700,
    maxPolyphony: 1,
    priority: 10,
    pitchJitter: 0,
    estimatedDurationMs: 1350,
    customPackClipIds: ['sfx_final_swarm', 'final_swarm', 'swarm_horn'],
  },

  // --- UI Feedback ---
  ui_move: {
    id: 'ui_move',
    category: 'ui',
    gain: 0.36,
    cooldownMs: 32,
    maxPolyphony: 3,
    priority: 5,
    pitchJitter: 0.02,
    estimatedDurationMs: 70,
    customPackClipIds: ['ui_move', 'ui_hover', 'sfx_ui_move'],
  },
  ui_confirm: {
    id: 'ui_confirm',
    category: 'ui',
    gain: 0.56,
    cooldownMs: 50,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0,
    estimatedDurationMs: 140,
    customPackClipIds: ['ui_confirm', 'ui_click', 'sfx_ui_confirm'],
  },
  ui_cancel: {
    id: 'ui_cancel',
    category: 'ui',
    gain: 0.5,
    cooldownMs: 50,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0,
    estimatedDurationMs: 140,
    customPackClipIds: ['ui_cancel', 'ui_back', 'sfx_ui_cancel'],
  },
  ui_reroll: {
    id: 'ui_reroll',
    category: 'ui',
    gain: 0.62,
    cooldownMs: 80,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.03,
    estimatedDurationMs: 240,
    customPackClipIds: ['ui_reroll', 'dice_roll'],
  },
  ui_banish: {
    id: 'ui_banish',
    category: 'ui',
    gain: 0.66,
    cooldownMs: 80,
    maxPolyphony: 2,
    priority: 7,
    pitchJitter: 0.02,
    estimatedDurationMs: 260,
    customPackClipIds: ['ui_banish', 'banish'],
  },
});

/** Convenience alias consumed by asset/manifest verifiers. */
export const SOUND_MANIFEST = SFX_MANIFEST;

export const CONTINUOUS_LOOP_MANIFEST: Readonly<Record<ContinuousLoopId, ContinuousLoopDef>> =
  Object.freeze({
    slide_loop: {
      id: 'slide_loop',
      gain: 0.38,
      customPackClipIds: ['loop_slide', 'slide_loop', 'sfx_slide_loop'],
    },
    rail_grind_loop: {
      id: 'rail_grind_loop',
      gain: 0.42,
      customPackClipIds: ['loop_rail_grind', 'rail_grind_loop', 'grind_loop'],
    },
    desert_wind: {
      id: 'desert_wind',
      gain: 0.28,
      customPackClipIds: ['loop_desert_wind', 'desert_wind', 'ambient_desert_wind'],
    },
  });

export const MUSIC_TRACK_MANIFEST: Readonly<Record<MusicTrackId, MusicTrackManifestEntry>> =
  Object.freeze({
    title: {
      id: 'title',
      label: 'Crypt Gate Overture (Title)',
      displayName: 'Crypt Gate Overture',
      bpm: 104,
      looping: true,
      gain: 0.72,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_title', 'music_title', 'menu_theme', 'title'],
    },
    forest_1: {
      id: 'forest_1',
      label: 'Green Forest (Tier 1)',
      displayName: 'Green Forest — Emerald Sprint',
      bpm: 138,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_1', 'bgm_forest_explore', 'music_forest', 'forest_1'],
    },
    forest_2: {
      id: 'forest_2',
      label: 'Deep Forest (Tier 2)',
      displayName: 'Deep Forest — Twilight Canopy',
      bpm: 142,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_2', 'music_forest_2', 'forest_2'],
    },
    forest_3: {
      id: 'forest_3',
      label: 'Cursed Forest (Tier 3)',
      displayName: 'Cursed Forest — Crimson Drive',
      bpm: 150,
      looping: true,
      gain: 0.81,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_3', 'music_forest_3', 'forest_3'],
    },
    forest_boss: {
      id: 'forest_boss',
      label: 'Wrath of Lil Bark (Forest Boss)',
      displayName: 'Wrath of Lil Bark',
      bpm: 156,
      looping: true,
      gain: 0.84,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_boss', 'music_boss', 'boss_theme', 'forest_boss'],
    },
    desert_1: {
      id: 'desert_1',
      label: 'Crusty Desert (Tier 1)',
      displayName: 'Crusty Desert — Phrygian Dunes',
      bpm: 134,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_desert_1', 'music_desert', 'desert_1'],
    },
    desert_2: {
      id: 'desert_2',
      label: 'Twilight Desert (Tier 2)',
      displayName: 'Twilight Desert — Nocturnal Oasis',
      bpm: 140,
      looping: true,
      gain: 0.79,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_desert_2', 'music_desert_2', 'desert_2'],
    },
    desert_3: {
      id: 'desert_3',
      label: 'Scorched Desert (Tier 3)',
      displayName: 'Scorched Desert — Blazing Dunes',
      bpm: 152,
      looping: true,
      gain: 0.82,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_desert_3', 'music_desert_3', 'desert_3'],
    },
    desert_boss: {
      id: 'desert_boss',
      label: 'Pharaoh Anubis (Desert Boss)',
      displayName: 'Judgment of Pharaoh Anubis',
      bpm: 158,
      looping: true,
      gain: 0.85,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_desert_boss', 'music_desert_boss', 'desert_boss'],
    },
    graveyard: {
      id: 'graveyard',
      label: 'Haunted Maze (Graveyard)',
      displayName: 'Haunted Maze — Crypt Organ',
      bpm: 128,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_graveyard', 'music_graveyard', 'graveyard'],
    },
    graveyard_boss: {
      id: 'graveyard_boss',
      label: "Big Bob's Cathedral (Graveyard Boss)",
      displayName: "Big Bob's Spectral Frenzy",
      bpm: 162,
      looping: true,
      gain: 0.86,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_graveyard_boss', 'music_big_bob', 'graveyard_boss'],
    },
    final_boss: {
      id: 'final_boss',
      label: 'Obsidian Colosseum (Final Boss)',
      displayName: 'Obsidian Colosseum Anthem',
      bpm: 168,
      looping: true,
      gain: 0.88,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_final_boss', 'music_final_boss', 'final_boss'],
    },
    final_swarm: {
      id: 'final_swarm',
      label: 'Spooky Steve Overdrive (Final Swarm)',
      displayName: 'Spooky Steve Panic Overdrive',
      bpm: 174,
      looping: true,
      gain: 0.87,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_final_swarm', 'music_final_swarm', 'final_swarm'],
    },
    calcium: {
      id: 'calcium',
      label: 'Calcium — Skate-Punk Shredder',
      displayName: 'Calcium — Bone Skate-Punk',
      bpm: 164,
      looping: true,
      gain: 0.82,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_calcium', 'music_calcium', 'calcium'],
    },
    megachad: {
      id: 'megachad',
      label: 'Megachad — Heroic Synth-Brawn',
      displayName: 'Megachad — Absolute Flex',
      bpm: 132,
      looping: true,
      gain: 0.82,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_megachad', 'music_megachad', 'megachad'],
    },
    dicy: {
      id: 'dicy',
      label: 'Dicehead — Funky Jazz-Chip',
      displayName: 'Dicehead — High Roller Groove',
      bpm: 146,
      looping: true,
      gain: 0.8,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_dicy', 'music_dicy', 'music_dicehead', 'dicy'],
    },
    space: {
      id: 'space',
      label: 'Spaceman — Cosmic Arpeggios',
      displayName: 'Spaceman — Zero-G Drift',
      bpm: 126,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_space', 'music_space', 'music_spaceman', 'space'],
    },
    victory: {
      id: 'victory',
      label: 'Bonk Triumph (Victory)',
      displayName: 'Bonk Triumph',
      bpm: 136,
      looping: false,
      gain: 0.82,
      boomboxSelectable: false,
      customPackClipIds: ['bgm_victory', 'music_victory', 'victory_stinger'],
    },
    game_over: {
      id: 'game_over',
      label: 'Shattered Crown (Game Over)',
      displayName: 'Shattered Crown',
      bpm: 96,
      looping: false,
      gain: 0.78,
      boomboxSelectable: false,
      customPackClipIds: ['bgm_game_over', 'music_game_over', 'game_over_stinger'],
    },
  });

/**
 * All 18 Boombox selector descriptors (`auto` + all 17 looping OST tracks)
 * formatted with `{ id, label }` and full manifest metadata for the UI selector.
 */
export const BOOMBOX_TRACK_LIST: readonly BoomboxTrackDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'auto' as const,
    label: 'Auto (Adaptive Biome)',
    displayName: 'Auto (Adaptive Biome)',
    bpm: 0,
    looping: true,
    gain: 1.0,
    boomboxSelectable: true,
    customPackClipIds: [],
  }),
  ...Object.values(MUSIC_TRACK_MANIFEST).filter((t) => t.boomboxSelectable),
]);

export const MUSIC_STATE_TO_TRACK: Readonly<Record<MusicState, MusicTrackId | null>> =
  Object.freeze({
    title: 'title',
    explore: 'forest_1',
    boss: 'forest_boss',
    final_swarm: 'final_swarm',
    victory: 'victory',
    game_over: 'game_over',
    silent: null,
  });

const LEGACY_TRACK_ALIASES: Readonly<Record<string, MusicTrackId>> = Object.freeze({
  forest_explore: 'forest_1',
  forest: 'forest_1',
  desert_explore: 'desert_1',
  desert: 'desert_1',
  graveyard_explore: 'graveyard',
  big_bob: 'graveyard_boss',
  anubis: 'desert_boss',
  lil_bark: 'forest_boss',
  dicehead: 'dicy',
  spaceman: 'space',
});

export function isMusicTrackId(value: string): value is MusicTrackId {
  return Object.prototype.hasOwnProperty.call(MUSIC_TRACK_MANIFEST, value);
}

/** Normalizes canonical track IDs and legacy Wave 1 aliases (e.g. `forest_explore` -> `forest_1`). */
export function normalizeMusicTrackId(value: string): MusicTrackId | null {
  const key = value.trim().toLowerCase();
  if (isMusicTrackId(key)) return key;
  return LEGACY_TRACK_ALIASES[key] ?? null;
}

/** Resolves the adaptive OST track for a biome map, stage tier, and combat state. */
export function resolveMusicTrackForContext(
  mapId: MapId,
  tier: MapTier,
  state: MusicState,
): MusicTrackId | null {
  switch (state) {
    case 'silent':
      return null;
    case 'title':
      return 'title';
    case 'victory':
      return 'victory';
    case 'game_over':
      return 'game_over';
    case 'final_swarm':
      return 'final_swarm';
    case 'boss':
      switch (mapId) {
        case 'Forest':
          return 'forest_boss';
        case 'Desert':
          return 'desert_boss';
        case 'Graveyard':
          return 'graveyard_boss';
        case 'FinalBossMap':
          return 'final_boss';
      }
      break;
    case 'explore':
      switch (mapId) {
        case 'Forest':
          return tier === 3 ? 'forest_3' : tier === 2 ? 'forest_2' : 'forest_1';
        case 'Desert':
          return tier === 3 ? 'desert_3' : tier === 2 ? 'desert_2' : 'desert_1';
        case 'Graveyard':
          return 'graveyard';
        case 'FinalBossMap':
          return 'final_boss';
      }
      break;
  }
  return MUSIC_STATE_TO_TRACK[state];
}

// ============================================================================
// 3. WEAPON ID -> WEAPON AUDIO FAMILY RESOLUTION (ALL 30 WEAPONS)
// ============================================================================

const WEAPON_FAMILY_EXACT_MAP: Readonly<Record<string, WeaponAudioFamily>> = Object.freeze({
  // 1-8: Wave 1 core weapons
  weaponfirestaff: 'fire',
  firestaff: 'fire',
  weaponbone: 'bone',
  bone: 'bone',
  weaponsword: 'sword',
  sword: 'sword',
  weaponaura: 'aura',
  aura: 'aura',
  weaponrevolver: 'revolver',
  revolver: 'revolver',
  weaponchunkers: 'rock',
  chunkers: 'rock',
  weaponlightningbolt: 'lightning',
  lightningbolt: 'lightning',
  weaponlightningstaff: 'lightning',
  lightningstaff: 'lightning',
  weaponsniper: 'sniper',
  sniper: 'sniper',
  weaponsniperrifle: 'sniper',
  sniperrifle: 'sniper',

  // 9-30: Wave 2 full 30-weapon roster (1-to-1 distinct synth families)
  weaponaegis: 'aegis_clang',
  aegis: 'aegis_clang',
  weaponaxe: 'axe_whoosh',
  axe: 'axe_whoosh',
  weaponbananarang: 'boomerang_whir',
  bananarang: 'boomerang_whir',
  weaponblackhole: 'blackhole_hum',
  blackhole: 'blackhole_hum',
  weaponbloodmagic: 'blood_pulse',
  bloodmagic: 'blood_pulse',
  weaponbow: 'bow_twang',
  bow: 'bow_twang',
  weaponcorruptedsword: 'corrupted_slash',
  corruptedsword: 'corrupted_slash',
  weapondexecutioner: 'execution_blade',
  dexecutioner: 'execution_blade',
  weapondice: 'dice_rattle',
  dice: 'dice_rattle',
  weapondragonsbreath: 'dragon_flame',
  dragonsbreath: 'dragon_flame',
  weaponflamewalker: 'flame_trail',
  flamewalker: 'flame_trail',
  weaponfrostwalker: 'frost_crack',
  frostwalker: 'frost_crack',
  weaponherosword: 'hero_wave',
  herosword: 'hero_wave',
  weaponkatana: 'katana_shing',
  katana: 'katana_shing',
  weaponmines: 'mine_beep',
  mines: 'mine_beep',
  weaponpoisonflask: 'flask_shatter',
  poisonflask: 'flask_shatter',
  weaponscythe: 'scythe_reap',
  scythe: 'scythe_reap',
  weaponshotgun: 'shotgun_boom',
  shotgun: 'shotgun_boom',
  weaponsluttyrocket: 'rocket_launch',
  sluttyrocket: 'rocket_launch',
  weaponhomingrockets: 'rocket_launch',
  homingrockets: 'rocket_launch',
  weaponspacenoodle: 'noodle_beam',
  spacenoodle: 'noodle_beam',
  weapontornado: 'tornado_whoosh',
  tornado: 'tornado_whoosh',
  weaponwirelessdagger: 'dagger_zip',
  wirelessdagger: 'dagger_zip',
});

export const WEAPON_FAMILY_TO_CUE: Readonly<Record<WeaponAudioFamily, SfxCueId>> = Object.freeze({
  fire: 'weapon_fire_fire',
  bone: 'weapon_fire_bone',
  sword: 'weapon_fire_sword',
  aura: 'weapon_fire_aura',
  revolver: 'weapon_fire_revolver',
  rock: 'weapon_fire_rock',
  lightning: 'weapon_fire_lightning',
  sniper: 'weapon_fire_sniper',
  bow: 'weapon_fire_bow',
  aegis_clang: 'weapon_fire_aegis_clang',
  axe_whoosh: 'weapon_fire_axe_whoosh',
  boomerang_whir: 'weapon_fire_boomerang_whir',
  blackhole_hum: 'weapon_fire_blackhole_hum',
  blood_pulse: 'weapon_fire_blood_pulse',
  bow_twang: 'weapon_fire_bow_twang',
  scythe_reap: 'weapon_fire_scythe_reap',
  shotgun_boom: 'weapon_fire_shotgun_boom',
  rocket_launch: 'weapon_fire_rocket_launch',
  noodle_beam: 'weapon_fire_noodle_beam',
  tornado_whoosh: 'weapon_fire_tornado_whoosh',
  katana_shing: 'weapon_fire_katana_shing',
  mine_beep: 'weapon_fire_mine_beep',
  flask_shatter: 'weapon_fire_flask_shatter',
  dice_rattle: 'weapon_fire_dice_rattle',
  dragon_flame: 'weapon_fire_dragon_flame',
  frost_crack: 'weapon_fire_frost_crack',
  dagger_zip: 'weapon_fire_dagger_zip',
  flame_trail: 'weapon_fire_flame_trail',
  corrupted_slash: 'weapon_fire_corrupted_slash',
  execution_blade: 'weapon_fire_execution_blade',
  hero_wave: 'weapon_fire_hero_wave',
});

export function resolveWeaponAudioFamily(weaponId: string): WeaponAudioFamily {
  const normalized = weaponId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = WEAPON_FAMILY_EXACT_MAP[normalized];
  if (exact) return exact;

  if (normalized.includes('aegis') || normalized.includes('shield')) return 'aegis_clang';
  if (normalized.includes('axe')) return 'axe_whoosh';
  if (normalized.includes('banana') || normalized.includes('boomerang')) return 'boomerang_whir';
  if (normalized.includes('blackhole') || normalized.includes('vortex')) return 'blackhole_hum';
  if (normalized.includes('blood')) return 'blood_pulse';
  if (normalized.includes('scythe')) return 'scythe_reap';
  if (normalized.includes('shotgun')) return 'shotgun_boom';
  if (normalized.includes('rocket') || normalized.includes('missile')) return 'rocket_launch';
  if (normalized.includes('noodle') || normalized.includes('beam')) return 'noodle_beam';
  if (normalized.includes('tornado') || normalized.includes('cyclone')) return 'tornado_whoosh';
  if (normalized.includes('katana')) return 'katana_shing';
  if (normalized.includes('mine')) return 'mine_beep';
  if (normalized.includes('flask') || normalized.includes('poison')) return 'flask_shatter';
  if (normalized.includes('dice')) return 'dice_rattle';
  if (normalized.includes('dragon')) return 'dragon_flame';
  if (normalized.includes('frost') || normalized.includes('ice')) return 'frost_crack';
  if (normalized.includes('dagger') || normalized.includes('knife')) return 'dagger_zip';
  if (normalized.includes('flame')) return 'flame_trail';
  if (normalized.includes('corrupt')) return 'corrupted_slash';
  if (normalized.includes('dexec') || normalized.includes('exec')) return 'execution_blade';
  if (normalized.includes('hero')) return 'hero_wave';
  if (normalized.includes('sniper') || normalized.includes('rail')) return 'sniper';
  if (normalized.includes('light') || normalized.includes('bolt') || normalized.includes('zap')) {
    return 'lightning';
  }
  if (normalized.includes('fire')) return 'fire';
  if (normalized.includes('revolver') || normalized.includes('gun')) return 'revolver';
  if (normalized.includes('chunk') || normalized.includes('rock')) return 'rock';
  if (normalized.includes('bone')) return 'bone';
  if (normalized.includes('bow')) return 'bow_twang';
  if (normalized.includes('sword')) return 'sword';
  return 'aura';
}

export function resolveWeaponFireCue(weaponId: string): SfxCueId {
  return WEAPON_FAMILY_TO_CUE[resolveWeaponAudioFamily(weaponId)];
}

/** Builds ordered candidate Custom Pack clip IDs for a trigger (weapon-specific first). */
export function getCustomPackClipCandidates(
  cueId: SfxCueId,
  weaponId?: string,
): readonly string[] {
  const base = SFX_MANIFEST[cueId].customPackClipIds;
  if (!weaponId) return base;
  const clean = weaponId.trim();
  const lower = clean.toLowerCase();
  return [`sfx_${lower}`, lower, clean, ...base];
}

// ============================================================================
// 4. SIM EVENT -> SFX CUE DECLARATIVE MAPPING (EXHAUSTIVE OVER ALL SimEvents)
// ============================================================================

function mapPickupKindToCue(kind: PickupKind): SfxCueId {
  switch (kind) {
    case 'xp_small':
    case 'xp_medium':
    case 'xp_large':
      return 'xp';
    case 'gold':
      return 'gold';
    case 'silver':
      return 'silver';
    case 'health':
      return 'heal';
    case 'magnet':
    case 'nuke':
    case 'freeze_clock':
    case 'rage':
    case 'haste':
    case 'stonks':
    case 'shield':
    case 'crypt_key':
    case 'boss_key':
      return 'powerup';
  }
}

function mapInteractableKindToCue(kind: InteractableKind): SfxCueId {
  switch (kind) {
    case 'Chest':
      return 'chest_open';
    case 'Pot':
      return 'pot_break';
    case 'BossSpawner':
      return 'boss_spawn';
    case 'ShrineMoai':
      return 'moai_blessing';
    case 'ShadyGuy':
      return 'shady_buy';
    case 'Microwave':
      return 'microwave_clone';
    case 'ChargeShrine':
    case 'ShrineGreed':
    case 'ShrineChallenge':
    case 'ShrineCursed':
    case 'ShrineMagnet':
    case 'ShrineBalance':
      return 'shrine_complete';
  }
}

function mapPhaseChangeToCue(from: GamePhase, to: GamePhase): SfxTriggerRequest | null {
  if (from === to) return null;
  if (to === 'paused') return { cueId: 'ui_cancel', intensity: 0.85 };
  if (from === 'paused' && to === 'playing') return { cueId: 'ui_confirm', intensity: 0.85 };
  if (to === 'chest_open') return { cueId: 'chest_open', intensity: 1.0 };
  if (to === 'merchant') return { cueId: 'shady_buy', intensity: 0.9 };
  if (to === 'microwave') return { cueId: 'microwave_clone', intensity: 0.9 };
  return null;
}

/**
 * Pure declarative mapper turning any SimEvent into zero or more SfxTriggerRequests.
 * Exhaustively checked against all SimEvent discriminated union variants.
 */
export function mapSimEventToSfxRequests(event: SimEvent): SfxTriggerRequest[] {
  switch (event.type) {
    case 'player_jump': {
      if (event.isBhop) {
        return [{ cueId: 'bhop', streak: event.streak, intensity: 1.0 }];
      }
      if (event.isAirJump) {
        return [{ cueId: 'air_jump', intensity: 0.95 }];
      }
      return [{ cueId: 'jump', intensity: 1.0 }];
    }

    case 'player_land': {
      const impact = Math.max(0, Math.abs(event.impactSpeed));
      if (impact < 3.0) return [];
      const intensity = Math.min(1.25, Math.max(0.35, impact / 18.0));
      return [{ cueId: 'land', intensity }];
    }

    case 'player_slide_start': {
      const intensity = Math.min(1.2, Math.max(0.55, event.speed / 16.0));
      return [{ cueId: 'slide_start', intensity }];
    }

    case 'player_slide_end':
      return [{ cueId: 'slide_end', intensity: 0.8 }];

    case 'player_wall_climb':
      return [{ cueId: 'wall_climb', intensity: 1.0 }];

    case 'player_rail_attach':
      return [{ cueId: 'rail_attach', intensity: 1.0 }];

    case 'player_rail_detach':
      return [
        {
          cueId: 'rail_detach',
          intensity: event.jumped ? 1.05 : 0.75,
          pitchScale: event.jumped ? 1.15 : 0.95,
        },
      ];

    case 'player_jump_pad':
      return [{ cueId: 'jump_pad', intensity: 1.0 }];

    case 'player_fall_damage': {
      const intensity = Math.min(1.3, Math.max(0.75, event.impactSpeed / 26.0));
      return [{ cueId: 'fall_damage', intensity }];
    }

    case 'player_hurt': {
      if (event.blockedByShield > 0 && event.amount <= 0) {
        return [{ cueId: 'player_hurt_shield', intensity: 1.0 }];
      }
      const out: SfxTriggerRequest[] = [{ cueId: 'player_hurt', intensity: 1.0 }];
      if (event.blockedByShield > 0) {
        out.push({ cueId: 'player_hurt_shield', intensity: 0.75 });
      }
      return out;
    }

    case 'player_dodge':
      return [{ cueId: 'player_dodge', intensity: 1.0 }];

    case 'player_heal':
      return event.amount >= 2
        ? [{ cueId: 'heal', intensity: Math.min(1.15, 0.7 + event.amount / 60) }]
        : [];

    case 'player_level_up':
      return [{ cueId: 'level_up', streak: event.level, intensity: 1.0 }];

    case 'player_death':
      return [{ cueId: 'player_death', intensity: 1.0 }];

    case 'player_revive':
      return [{ cueId: 'player_revive', intensity: 1.0 }];

    case 'player_unstuck':
      return [{ cueId: 'unstuck', intensity: 0.85 }];

    case 'weapon_fire':
      return [
        {
          cueId: resolveWeaponFireCue(event.weaponId),
          weaponId: event.weaponId,
          intensity: 1.0,
        },
      ];

    case 'weapon_stolen':
      return [{ cueId: 'weapon_stolen', weaponId: event.weaponId, intensity: 1.05 }];

    case 'weapon_reclaimed':
      return [{ cueId: 'weapon_reclaimed', weaponId: event.weaponId, intensity: 1.05 }];

    case 'damage_dealt': {
      if (event.isBonker) {
        return [{ cueId: 'bonk', intensity: 1.15 }];
      }
      if (event.isExecute) {
        return [{ cueId: 'execute', intensity: 1.05 }];
      }
      if (event.isMegacrit) {
        return [{ cueId: 'megacrit', intensity: 1.05 }];
      }
      if (event.critTier >= 1) {
        return [{ cueId: 'crit', intensity: 1.0 }];
      }
      return [{ cueId: 'hit', intensity: 0.95 }];
    }

    case 'debuff_applied':
      return [
        {
          cueId: 'debuff',
          debuff: event.debuff,
          intensity: Math.min(1.1, 0.75 + event.stacks * 0.08),
        },
      ];

    case 'enemy_spawn': {
      if (event.role === 'elite' || event.role === 'miniboss') {
        return [{ cueId: 'elite_spawn', intensity: event.role === 'miniboss' ? 1.1 : 0.85 }];
      }
      return [];
    }

    case 'enemy_kill': {
      if (
        event.role === 'elite' ||
        event.role === 'miniboss' ||
        event.role === 'stage_boss' ||
        event.role === 'crypt_boss' ||
        event.role === 'final_boss'
      ) {
        return [{ cueId: 'kill_elite', intensity: 1.05 }];
      }
      return [{ cueId: 'kill', intensity: event.isExecute ? 1.1 : 0.95 }];
    }

    case 'boss_spawn':
      return [{ cueId: 'boss_spawn', intensity: 1.1 }];

    case 'boss_defeated':
      return [{ cueId: 'boss_defeated', intensity: 1.1 }];

    case 'final_swarm_start':
      return [{ cueId: 'final_swarm', intensity: 1.1 }];

    case 'pickup_collected': {
      const cueId = mapPickupKindToCue(event.kind);
      const intensity =
        event.kind === 'xp_large' ? 1.12 : event.kind === 'xp_medium' ? 1.0 : 0.9;
      return [{ cueId, intensity }];
    }

    case 'interactable_used': {
      const cueId = mapInteractableKindToCue(event.kind);
      const intensity = event.variant === 'golden' ? 1.15 : 1.0;
      const pitchScale = event.kind === 'ShrineCursed' ? 0.84 : undefined;
      return [{ cueId, intensity, pitchScale }];
    }

    case 'pylon_charged':
      return [
        {
          cueId: 'pylon_charged',
          streak: event.cleansedCount,
          pitchScale: 0.92 + (event.cleansedCount / Math.max(1, event.totalPylons)) * 0.45,
          intensity: 1.05,
        },
      ];

    case 'item_proc':
      return [{ cueId: 'item_proc', intensity: 0.85 }];

    case 'portal_activated':
      return [{ cueId: 'portal_activated', intensity: 1.05 }];

    case 'phase_changed': {
      const req = mapPhaseChangeToCue(event.from, event.to);
      return req ? [req] : [];
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return [];
    }
  }
}

// ============================================================================
// 5. AUDIO SPAM FILTER & VOICE POLYPHONY MANAGER
// ============================================================================

interface ActiveVoiceRecord {
  cueId: SfxCueId;
  priority: number;
  expiresAtMs: number;
}

export interface SpamFilterAcquireResult {
  readonly allowed: boolean;
  /** Gentle density-based gain scaling (0.7..1.0) to prevent horde muddiness */
  readonly densityGainScale: number;
}

export class AudioSpamFilter {
  private readonly maxGlobalPolyphony: number;
  private readonly lastPlayedMs = new Map<SfxCueId, number>();
  private readonly activeVoices: ActiveVoiceRecord[] = [];
  private xpStreakCount = 0;
  private lastXpPickupMs = -Infinity;
  private readonly xpStreakResetMs: number;

  constructor(maxGlobalPolyphony = 24, xpStreakResetMs = 1150) {
    this.maxGlobalPolyphony = Math.max(4, maxGlobalPolyphony);
    this.xpStreakResetMs = xpStreakResetMs;
  }

  /** Prune expired voices and attempt to acquire a slot for `cueId` at `nowMs`. */
  public tryAcquire(
    cueId: SfxCueId,
    nowMs: number,
    overrideCooldownMs?: number,
  ): SpamFilterAcquireResult {
    this.pruneExpired(nowMs);
    const def = SFX_MANIFEST[cueId];
    const cooldownMs = overrideCooldownMs ?? def.cooldownMs;

    const lastMs = this.lastPlayedMs.get(cueId);
    if (lastMs !== undefined && nowMs - lastMs < cooldownMs) {
      return { allowed: false, densityGainScale: 1.0 };
    }

    let cueActiveCount = 0;
    for (let i = 0; i < this.activeVoices.length; i++) {
      if (this.activeVoices[i].cueId === cueId) {
        cueActiveCount++;
      }
    }

    if (cueActiveCount >= def.maxPolyphony) {
      return { allowed: false, densityGainScale: 1.0 };
    }

    if (this.activeVoices.length >= this.maxGlobalPolyphony) {
      // Allow high-priority cues to steal the lowest-priority active voice.
      let lowestIndex = -1;
      let lowestPriority = def.priority;
      for (let i = 0; i < this.activeVoices.length; i++) {
        if (this.activeVoices[i].priority < lowestPriority) {
          lowestPriority = this.activeVoices[i].priority;
          lowestIndex = i;
        }
      }
      if (lowestIndex === -1) {
        return { allowed: false, densityGainScale: 1.0 };
      }
      this.activeVoices.splice(lowestIndex, 1);
    }

    this.lastPlayedMs.set(cueId, nowMs);
    this.activeVoices.push({
      cueId,
      priority: def.priority,
      expiresAtMs: nowMs + def.estimatedDurationMs,
    });

    // Subtle attenuation when many voices are active concurrently
    const loadRatio = this.activeVoices.length / this.maxGlobalPolyphony;
    const densityGainScale =
      def.priority >= 9 ? 1.0 : Math.max(0.68, 1.0 - Math.max(0, loadRatio - 0.35) * 0.48);

    return { allowed: true, densityGainScale };
  }

  /** Advance and return the current XP chime pitch-escalation streak (0..15). */
  public advanceXpStreak(nowMs: number): number {
    if (nowMs - this.lastXpPickupMs > this.xpStreakResetMs) {
      this.xpStreakCount = 0;
    } else {
      this.xpStreakCount = Math.min(15, this.xpStreakCount + 1);
    }
    this.lastXpPickupMs = nowMs;
    return this.xpStreakCount;
  }

  public getActiveVoiceCount(nowMs?: number): number {
    if (nowMs !== undefined) {
      this.pruneExpired(nowMs);
    }
    return this.activeVoices.length;
  }

  public reset(): void {
    this.lastPlayedMs.clear();
    this.activeVoices.length = 0;
    this.xpStreakCount = 0;
    this.lastXpPickupMs = -Infinity;
  }

  private pruneExpired(nowMs: number): void {
    let writeIdx = 0;
    for (let i = 0; i < this.activeVoices.length; i++) {
      const voice = this.activeVoices[i];
      if (voice.expiresAtMs > nowMs) {
        this.activeVoices[writeIdx++] = voice;
      }
    }
    this.activeVoices.length = writeIdx;
  }
}
