import type { MapDef, MapId, MapLightingConfig } from '../contracts/index';

export interface StageTimelineEventDef {
  id: string;
  timeSec: number;
  kind: 'miniboss' | 'swarm';
  enemyIds: readonly string[];
  count: number;
  bannerText: string;
  eliteChance?: number;
}

const FOREST_TIER_1_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.06, g: 0.44, b: 0.72 },
  skyBottom: { r: 0.34, g: 0.78, b: 0.86 },
  fogColor: { r: 0.0, g: 0.48, b: 0.62 },
  fogNear: 35,
  fogFar: 220,
  ambientColor: { r: 0.75, g: 0.75, b: 0.75 },
  ambientIntensity: 0.85,
  sunColor: { r: 1.0, g: 0.96, b: 0.84 },
  sunIntensity: 1.25,
  sunDirection: { x: 0.45, y: 0.82, z: 0.35 },
  toonShadowTint: { r: 0.24, g: 0.28, b: 0.48 },
  toonHighlightTint: { r: 1.0, g: 0.96, b: 0.84 },
};

const FOREST_TIER_2_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.25, g: 0.22, b: 0.52 },
  skyBottom: { r: 0.92, g: 0.52, b: 0.32 },
  fogColor: { r: 0.45, g: 0.28, b: 0.36 },
  fogNear: 30,
  fogFar: 210,
  ambientColor: { r: 0.78, g: 0.66, b: 0.62 },
  ambientIntensity: 0.8,
  sunColor: { r: 1.0, g: 0.72, b: 0.45 },
  sunIntensity: 1.3,
  sunDirection: { x: -0.65, y: 0.48, z: 0.58 },
  toonShadowTint: { r: 0.28, g: 0.18, b: 0.38 },
  toonHighlightTint: { r: 1.0, g: 0.82, b: 0.56 },
};

const FOREST_TIER_3_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.06, g: 0.08, b: 0.22 },
  skyBottom: { r: 0.18, g: 0.26, b: 0.44 },
  fogColor: { r: 0.1, g: 0.18, b: 0.32 },
  fogNear: 26,
  fogFar: 195,
  ambientColor: { r: 0.55, g: 0.62, b: 0.78 },
  ambientIntensity: 0.75,
  sunColor: { r: 0.75, g: 0.86, b: 1.0 },
  sunIntensity: 1.15,
  sunDirection: { x: 0.35, y: 0.76, z: -0.54 },
  toonShadowTint: { r: 0.14, g: 0.16, b: 0.34 },
  toonHighlightTint: { r: 0.82, g: 0.92, b: 1.0 },
};

const DESERT_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.18, g: 0.52, b: 0.82 },
  skyBottom: { r: 0.96, g: 0.76, b: 0.48 },
  fogColor: { r: 0.86, g: 0.64, b: 0.38 },
  fogNear: 40,
  fogFar: 240,
  ambientColor: { r: 0.82, g: 0.74, b: 0.64 },
  ambientIntensity: 0.88,
  sunColor: { r: 1.0, g: 0.92, b: 0.74 },
  sunIntensity: 1.35,
  sunDirection: { x: 0.52, y: 0.78, z: 0.34 },
  toonShadowTint: { r: 0.36, g: 0.24, b: 0.42 },
  toonHighlightTint: { r: 1.0, g: 0.92, b: 0.72 },
};

const GRAVEYARD_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.05, g: 0.06, b: 0.14 },
  skyBottom: { r: 0.14, g: 0.24, b: 0.28 },
  fogColor: { r: 0.09, g: 0.16, b: 0.22 },
  fogNear: 24,
  fogFar: 175,
  ambientColor: { r: 0.5, g: 0.58, b: 0.66 },
  ambientIntensity: 0.72,
  sunColor: { r: 0.74, g: 0.9, b: 0.98 },
  sunIntensity: 1.05,
  sunDirection: { x: -0.35, y: 0.85, z: -0.38 },
  toonShadowTint: { r: 0.12, g: 0.14, b: 0.28 },
  toonHighlightTint: { r: 0.78, g: 0.95, b: 0.92 },
};

const FINAL_BOSS_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.1, g: 0.02, b: 0.16 },
  skyBottom: { r: 0.38, g: 0.08, b: 0.22 },
  fogColor: { r: 0.2, g: 0.06, b: 0.18 },
  fogNear: 30,
  fogFar: 210,
  ambientColor: { r: 0.64, g: 0.48, b: 0.66 },
  ambientIntensity: 0.78,
  sunColor: { r: 1.0, g: 0.65, b: 0.78 },
  sunIntensity: 1.2,
  sunDirection: { x: 0.2, y: 0.92, z: 0.32 },
  toonShadowTint: { r: 0.18, g: 0.06, b: 0.26 },
  toonHighlightTint: { r: 1.0, g: 0.74, b: 0.82 },
};

export const MAPS: readonly MapDef[] = Object.freeze([
  {
    id: 'Forest',
    displayName: 'Green Forest',
    description: 'Stepped emerald plateaus, pine groves, grind rails, and ancient shrines guarded by Lil Bark.',
    isFinalBossMap: false,
    tiers: [1, 2, 3],
    stageDurationSec: 600,
    stageBossIds: {
      1: 'EntStage1',
      2: 'EntStage1',
      3: 'EntStage1',
    },
    finalSwarmBossId: 'GhostInvincible',
    generation: {
      kind: 'hills',
      arenaRadius: 148,
      heightAmplitude: 15,
      noiseFrequency: 0.025,
      noiseOctaves: 3,
      gridSize: 15,
      railCount: 8,
      jumpPadCount: 8,
    },
    lightingByTier: {
      1: FOREST_TIER_1_LIGHTING,
      2: FOREST_TIER_2_LIGHTING,
      3: FOREST_TIER_3_LIGHTING,
    },
    defaultLighting: FOREST_TIER_1_LIGHTING,
    unlockedByDefault: true,
  },
  {
    id: 'Desert',
    displayName: 'Sunscorch Dunes',
    description: 'Sweeping multi-octave sand dunes built for breakneck downhill crouch-slides.',
    isFinalBossMap: false,
    tiers: [1, 2, 3],
    stageDurationSec: 600,
    stageBossIds: {
      1: 'EntStage1',
      2: 'EntStage1',
      3: 'EntStage1',
    },
    finalSwarmBossId: 'GhostInvincible',
    generation: {
      kind: 'perlin_dunes',
      arenaRadius: 165,
      heightAmplitude: 22,
      noiseFrequency: 0.018,
      noiseOctaves: 4,
      railCount: 6,
      jumpPadCount: 8,
    },
    lightingByTier: {
      1: DESERT_LIGHTING,
    },
    defaultLighting: DESERT_LIGHTING,
    unlockedByDefault: false,
    unlockQuestId: 'quest_defeat_lil_bark',
  },
  {
    id: 'Graveyard',
    displayName: 'Hollow Graveyard',
    description: 'A misty 19x19 mausoleum grid hiding an ancient Crypt beneath the stones.',
    isFinalBossMap: false,
    tiers: [1, 2, 3],
    stageDurationSec: 600,
    stageBossIds: {
      1: 'EntStage1',
      2: 'EntStage1',
      3: 'EntStage1',
    },
    cryptBossId: 'EntStage1',
    finalSwarmBossId: 'GhostInvincible',
    generation: {
      kind: 'grid_graveyard',
      arenaRadius: 152,
      heightAmplitude: 8,
      noiseFrequency: 0.03,
      noiseOctaves: 2,
      gridSize: 19,
      hasCrypt: true,
      railCount: 6,
      jumpPadCount: 6,
    },
    lightingByTier: {
      1: GRAVEYARD_LIGHTING,
    },
    defaultLighting: GRAVEYARD_LIGHTING,
    unlockedByDefault: false,
    unlockQuestId: 'quest_kill_500',
  },
  {
    id: 'FinalBossMap',
    displayName: 'Obsidian Citadel',
    description: 'Skyborne obsidian arena ringed by 11 Boss Pylons where legends are forged.',
    isFinalBossMap: true,
    tiers: [1],
    stageDurationSec: 900,
    stageBossIds: {
      1: 'EntStage1',
    },
    finalSwarmBossId: 'GhostInvincible',
    generation: {
      kind: 'boss_citadel',
      arenaRadius: 110,
      heightAmplitude: 6,
      noiseFrequency: 0.02,
      noiseOctaves: 2,
      railCount: 4,
      jumpPadCount: 6,
      pylonCount: 11,
    },
    lightingByTier: {
      1: FINAL_BOSS_LIGHTING,
    },
    defaultLighting: FINAL_BOSS_LIGHTING,
    unlockedByDefault: false,
    unlockQuestId: 'quest_defeat_lil_bark',
  },
]);

/** Scripted stage timeline milestones consumed deterministically by src/sim/spawner.ts */
export const STAGE_TIMELINES: Readonly<Record<MapId, readonly StageTimelineEventDef[]>> = Object.freeze({
  Forest: Object.freeze<StageTimelineEventDef[]>([
    {
      id: 'forest_mb_180',
      timeSec: 180,
      kind: 'miniboss',
      enemyIds: ['MinibossGolem'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: MOSS GOLEM!',
    },
    {
      id: 'forest_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Goblin', 'Skeleton', 'Slime'],
      count: 18,
      bannerText: 'SWARM INCOMING!',
      eliteChance: 0.12,
    },
    {
      id: 'forest_swarm_420',
      timeSec: 420,
      kind: 'swarm',
      enemyIds: ['GoblinStrong', 'Skeleton', 'Slime', 'Goblin'],
      count: 24,
      bannerText: 'MASSIVE HORDE SWARM!',
      eliteChance: 0.2,
    },
    {
      id: 'forest_mb_480',
      timeSec: 480,
      kind: 'miniboss',
      enemyIds: ['MinibossPig'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: IRON TUSKER!',
    },
  ]),
  Desert: Object.freeze<StageTimelineEventDef[]>([
    {
      id: 'desert_mb_180',
      timeSec: 180,
      kind: 'miniboss',
      enemyIds: ['MinibossGolem'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: DUNE COLOSSUS!',
    },
    {
      id: 'desert_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Skeleton', 'GoblinStrong'],
      count: 18,
      bannerText: 'DESERT SWARM INCOMING!',
      eliteChance: 0.15,
    },
    {
      id: 'desert_swarm_420',
      timeSec: 420,
      kind: 'swarm',
      enemyIds: ['GoblinStrong', 'Skeleton', 'Slime'],
      count: 24,
      bannerText: 'SANDSTORM HORDE!',
      eliteChance: 0.22,
    },
    {
      id: 'desert_mb_480',
      timeSec: 480,
      kind: 'miniboss',
      enemyIds: ['MinibossPig'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: SAND TUSKER!',
    },
  ]),
  Graveyard: Object.freeze<StageTimelineEventDef[]>([
    {
      id: 'graveyard_mb_180',
      timeSec: 180,
      kind: 'miniboss',
      enemyIds: ['MinibossGolem'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: TOMB GUARDIAN!',
    },
    {
      id: 'graveyard_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Skeleton', 'Ghost'],
      count: 18,
      bannerText: 'UNDEAD SWARM RISING!',
      eliteChance: 0.15,
    },
    {
      id: 'graveyard_swarm_420',
      timeSec: 420,
      kind: 'swarm',
      enemyIds: ['Skeleton', 'Ghost', 'GoblinStrong'],
      count: 24,
      bannerText: 'CRYPT HORDE UNLEASHED!',
      eliteChance: 0.22,
    },
    {
      id: 'graveyard_mb_480',
      timeSec: 480,
      kind: 'miniboss',
      enemyIds: ['MinibossPig'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: GRAVE STALKER!',
    },
  ]),
  FinalBossMap: Object.freeze<StageTimelineEventDef[]>([]),
});

export const MAP_BY_ID: ReadonlyMap<MapId, MapDef> = new Map(
  MAPS.map((m) => [m.id, m]),
);

export function getMapById(id: MapId): MapDef | undefined {
  return MAP_BY_ID.get(id);
}
