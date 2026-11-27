/**
 * KRUNKEDBONK — Declarative Audio Cue & Music Manifest + AudioSpamFilter
 *
 * Maps every SimEvent variant, weapon fire ID, movement state, pickup combo,
 * interactable fanfare, and adaptive music track to mix metadata, cooldown
 * spam-filter windows, polyphony caps, and optional Custom Pack clip lookups.
 */

import type {
  DebuffType,
  GamePhase,
  InteractableKind,
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
  | 'bow';

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
  // Weapons
  | 'weapon_fire_fire'
  | 'weapon_fire_bone'
  | 'weapon_fire_sword'
  | 'weapon_fire_aura'
  | 'weapon_fire_revolver'
  | 'weapon_fire_rock'
  | 'weapon_fire_lightning'
  | 'weapon_fire_sniper'
  | 'weapon_fire_bow'
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
  // World, shrines, chests & bosses
  | 'shrine_charge'
  | 'shrine_complete'
  | 'chest_open'
  | 'pot_break'
  | 'pylon_charged'
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

export type ContinuousLoopId = 'slide_loop' | 'rail_grind_loop';

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
  | 'forest_explore'
  | 'forest_boss'
  | 'final_swarm'
  | 'victory'
  | 'game_over';

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

  // --- Weapons ---
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
  weapon_stolen: {
    id: 'weapon_stolen',
    category: 'world',
    gain: 0.88,
    cooldownMs: 200,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 460,
    customPackClipIds: ['sfx_weapon_stolen', 'weapon_stolen'],
  },
  weapon_reclaimed: {
    id: 'weapon_reclaimed',
    category: 'world',
    gain: 0.9,
    cooldownMs: 200,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 480,
    customPackClipIds: ['sfx_weapon_reclaimed', 'weapon_reclaimed'],
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

  // --- World, Shrines, Chests & Bosses ---
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
    gain: 0.92,
    cooldownMs: 180,
    maxPolyphony: 2,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 650,
    customPackClipIds: ['sfx_pylon_charged', 'pylon_cleanse'],
  },
  portal_activated: {
    id: 'portal_activated',
    category: 'world',
    gain: 0.9,
    cooldownMs: 300,
    maxPolyphony: 1,
    priority: 9,
    pitchJitter: 0,
    estimatedDurationMs: 750,
    customPackClipIds: ['sfx_portal', 'portal_activated'],
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
  });

export const MUSIC_TRACK_MANIFEST: Readonly<Record<MusicTrackId, MusicTrackManifestEntry>> =
  Object.freeze({
    title: {
      id: 'title',
      displayName: 'Crypt Gate Overture',
      bpm: 104,
      looping: true,
      gain: 0.72,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_title', 'music_title', 'menu_theme', 'title'],
    },
    forest_explore: {
      id: 'forest_explore',
      displayName: 'Emerald Sprint (Forest)',
      bpm: 138,
      looping: true,
      gain: 0.78,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_explore', 'music_forest', 'forest_theme', 'forest_explore'],
    },
    forest_boss: {
      id: 'forest_boss',
      displayName: 'Wrath of Lil Bark',
      bpm: 156,
      looping: true,
      gain: 0.84,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_forest_boss', 'music_boss', 'boss_theme', 'forest_boss'],
    },
    final_swarm: {
      id: 'final_swarm',
      displayName: 'Spooky Steve Approaches',
      bpm: 172,
      looping: true,
      gain: 0.86,
      boomboxSelectable: true,
      customPackClipIds: ['bgm_final_swarm', 'music_final_swarm', 'final_swarm'],
    },
    victory: {
      id: 'victory',
      displayName: 'Bonk Triumph',
      bpm: 136,
      looping: false,
      gain: 0.82,
      boomboxSelectable: false,
      customPackClipIds: ['bgm_victory', 'music_victory', 'victory_stinger'],
    },
    game_over: {
      id: 'game_over',
      displayName: 'Shattered Crown',
      bpm: 96,
      looping: false,
      gain: 0.78,
      boomboxSelectable: false,
      customPackClipIds: ['bgm_game_over', 'music_game_over', 'game_over_stinger'],
    },
  });

export const MUSIC_STATE_TO_TRACK: Readonly<Record<MusicState, MusicTrackId | null>> =
  Object.freeze({
    title: 'title',
    explore: 'forest_explore',
    boss: 'forest_boss',
    final_swarm: 'final_swarm',
    victory: 'victory',
    game_over: 'game_over',
    silent: null,
  });

export function isMusicTrackId(value: string): value is MusicTrackId {
  return Object.prototype.hasOwnProperty.call(MUSIC_TRACK_MANIFEST, value);
}

// ============================================================================
// 3. WEAPON ID -> WEAPON AUDIO FAMILY RESOLUTION
// ============================================================================

const WEAPON_FAMILY_EXACT_MAP: Readonly<Record<string, WeaponAudioFamily>> = Object.freeze({
  // Wave 1 canonical retail IDs
  weaponfirestaff: 'fire',
  weaponbone: 'bone',
  weaponsword: 'sword',
  weaponaura: 'aura',
  weaponrevolver: 'revolver',
  weaponchunkers: 'rock',
  weaponlightningbolt: 'lightning',
  weaponsniper: 'sniper',
  weaponbow: 'bow',
  // Full 30-weapon catalog (both prefixed and unprefixed normalized forms)
  firestaff: 'fire',
  flamewalker: 'fire',
  weaponflamewalker: 'fire',
  dragonsbreath: 'fire',
  weapondragonsbreath: 'fire',
  bone: 'bone',
  bananarang: 'bone',
  weaponbananarang: 'bone',
  dice: 'bone',
  weapondice: 'bone',
  sword: 'sword',
  katana: 'sword',
  weaponkatana: 'sword',
  axe: 'sword',
  weaponaxe: 'sword',
  scythe: 'sword',
  weaponscythe: 'sword',
  corruptedsword: 'sword',
  weaponcorruptedsword: 'sword',
  dexecutioner: 'sword',
  weapondexecutioner: 'sword',
  herosword: 'sword',
  weaponherosword: 'sword',
  wirelessdagger: 'sword',
  weaponwirelessdagger: 'sword',
  aura: 'aura',
  aegis: 'aura',
  weaponaegis: 'aura',
  frostwalker: 'aura',
  weaponfrostwalker: 'aura',
  blackhole: 'aura',
  weaponblackhole: 'aura',
  bloodmagic: 'aura',
  weaponbloodmagic: 'aura',
  tornado: 'aura',
  weapontornado: 'aura',
  poisonflask: 'aura',
  weaponpoisonflask: 'aura',
  revolver: 'revolver',
  shotgun: 'revolver',
  weaponshotgun: 'revolver',
  chunkers: 'rock',
  mines: 'rock',
  weaponmines: 'rock',
  sluttyrocket: 'rock',
  weaponsluttyrocket: 'rock',
  lightningstaff: 'lightning',
  weaponlightningstaff: 'lightning',
  spacenoodle: 'lightning',
  weaponspacenoodle: 'lightning',
  sniperrifle: 'sniper',
  weaponsniperrifle: 'sniper',
  bow: 'bow',
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
});

export function resolveWeaponAudioFamily(weaponId: string): WeaponAudioFamily {
  const normalized = weaponId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = WEAPON_FAMILY_EXACT_MAP[normalized];
  if (exact) return exact;

  if (normalized.includes('sniper') || normalized.includes('rail')) return 'sniper';
  if (normalized.includes('light') || normalized.includes('bolt') || normalized.includes('zap')) {
    return 'lightning';
  }
  if (normalized.includes('fire') || normalized.includes('flame') || normalized.includes('dragon')) {
    return 'fire';
  }
  if (normalized.includes('revolver') || normalized.includes('shotgun') || normalized.includes('gun')) {
    return 'revolver';
  }
  if (normalized.includes('chunk') || normalized.includes('rock') || normalized.includes('mine') || normalized.includes('rocket')) {
    return 'rock';
  }
  if (normalized.includes('bone') || normalized.includes('dice') || normalized.includes('banana')) {
    return 'bone';
  }
  if (normalized.includes('bow')) return 'bow';
  if (
    normalized.includes('sword') ||
    normalized.includes('katana') ||
    normalized.includes('axe') ||
    normalized.includes('scythe') ||
    normalized.includes('dagger') ||
    normalized.includes('dexec')
  ) {
    return 'sword';
  }
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
    case 'ChargeShrine':
    case 'ShrineMoai':
    case 'ShadyGuy':
    case 'Microwave':
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
  if (to === 'merchant' || to === 'microwave') return { cueId: 'ui_confirm', intensity: 0.9 };
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
      return [{ cueId: 'rail_detach', intensity: event.jumped ? 1.05 : 0.75, pitchScale: event.jumped ? 1.15 : 0.95 }];

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
      return event.amount >= 2 ? [{ cueId: 'heal', intensity: Math.min(1.15, 0.7 + event.amount / 60) }] : [];

    case 'player_level_up':
      return [{ cueId: 'level_up', streak: event.level, intensity: 1.0 }];

    case 'player_death':
      return [{ cueId: 'player_death', intensity: 1.0 }];

    case 'player_revive':
      return [{ cueId: 'player_revive', intensity: 1.0 }];

    case 'player_unstuck':
      return [{ cueId: 'unstuck', intensity: 0.85 }];

    case 'weapon_fire':
      return [{ cueId: resolveWeaponFireCue(event.weaponId), weaponId: event.weaponId, intensity: 1.0 }];

    case 'weapon_stolen':
      return [{ cueId: 'weapon_stolen', intensity: 1.0 }];

    case 'weapon_reclaimed':
      return [{ cueId: 'weapon_reclaimed', intensity: 1.0 }];

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
      return [{ cueId: 'debuff', debuff: event.debuff, intensity: Math.min(1.1, 0.75 + event.stacks * 0.08) }];

    case 'enemy_spawn': {
      if (event.role === 'elite' || event.role === 'miniboss') {
        return [{ cueId: 'elite_spawn', intensity: event.role === 'miniboss' ? 1.1 : 0.85 }];
      }
      return [];
    }

    case 'enemy_kill': {
      if (event.role === 'elite' || event.role === 'miniboss' || event.role === 'stage_boss' || event.role === 'crypt_boss' || event.role === 'final_boss') {
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
      return [{ cueId, intensity }];
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
