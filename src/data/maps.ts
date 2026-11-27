import type { MapDef, MapId, MapLightingConfig, MapTier } from '../contracts/index';

export interface StageTimelineEventDef {
  id: string;
  timeSec: number;
  kind: 'miniboss' | 'swarm';
  enemyIds: readonly string[];
  count: number;
  bannerText: string;
  eliteChance?: number;
}

/** Exact per-tier stage countdown durations matching oracle.json */
export const STAGE_DURATIONS_BY_TIER: Readonly<Record<MapId, Readonly<Record<MapTier, number>>>> = Object.freeze({
  Forest: Object.freeze({ 1: 600, 2: 540, 3: 480 }),
  Desert: Object.freeze({ 1: 600, 2: 540, 3: 480 }),
  Graveyard: Object.freeze({ 1: 960, 2: 960, 3: 960 }),
  FinalBossMap: Object.freeze({ 1: 900, 2: 900, 3: 900 }),
});

// ============================================================================
// EXACT ORACLE.JSON STAGE RGB LIGHTING CONFIGURATIONS (ALL 8 STAGES)
// ============================================================================

const FOREST_TIER_1_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.06, g: 0.44, b: 0.72 },
  skyBottom: { r: 0.34, g: 0.78, b: 0.86 },
  fogColor: { r: 0.0, g: 0.4824, b: 0.6157 },
  fogNear: 35,
  fogFar: 220,
  ambientColor: { r: 0.7453, g: 0.7453, b: 0.7453 },
  ambientIntensity: 0.85,
  sunColor: { r: 1.0, g: 0.9569, b: 0.8392 },
  sunIntensity: 1.15,
  sunDirection: { x: 0.45, y: 0.82, z: 0.35 },
  toonShadowTint: { r: 0.24, g: 0.28, b: 0.48 },
  toonHighlightTint: { r: 1.0, g: 0.9569, b: 0.8392 },
};

const FOREST_TIER_2_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.24, g: 0.18, b: 0.52 },
  skyBottom: { r: 0.48, g: 0.36, b: 0.72 },
  fogColor: { r: 0.3843, g: 0.2824, b: 0.6235 },
  fogNear: 32,
  fogFar: 210,
  ambientColor: { r: 0.7, g: 0.66, b: 0.89 },
  ambientIntensity: 0.82,
  sunColor: { r: 1.0, g: 0.9569, b: 0.8392 },
  sunIntensity: 1.05,
  sunDirection: { x: -0.55, y: 0.62, z: 0.52 },
  toonShadowTint: { r: 0.26, g: 0.18, b: 0.44 },
  toonHighlightTint: { r: 0.95, g: 0.88, b: 1.0 },
};

const FOREST_TIER_3_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.16, g: 0.04, b: 0.06 },
  skyBottom: { r: 0.42, g: 0.12, b: 0.12 },
  fogColor: { r: 0.302, g: 0.0784, b: 0.0784 },
  fogNear: 28,
  fogFar: 195,
  ambientColor: { r: 0.85, g: 0.65, b: 0.65 },
  ambientIntensity: 0.8,
  sunColor: { r: 1.0, g: 0.9569, b: 0.8392 },
  sunIntensity: 1.0,
  sunDirection: { x: 0.35, y: 0.76, z: -0.54 },
  toonShadowTint: { r: 0.28, g: 0.08, b: 0.12 },
  toonHighlightTint: { r: 1.0, g: 0.76, b: 0.68 },
};

const DESERT_TIER_1_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.24, g: 0.58, b: 0.86 },
  skyBottom: { r: 0.95, g: 0.84, b: 0.62 },
  fogColor: { r: 0.9255, g: 0.8157, b: 0.5922 },
  fogNear: 40,
  fogFar: 245,
  ambientColor: { r: 0.7453, g: 0.7453, b: 0.7453 },
  ambientIntensity: 0.88,
  sunColor: { r: 1.0, g: 0.9569, b: 0.8392 },
  sunIntensity: 1.25,
  sunDirection: { x: 0.52, y: 0.78, z: 0.34 },
  toonShadowTint: { r: 0.36, g: 0.26, b: 0.42 },
  toonHighlightTint: { r: 1.0, g: 0.94, b: 0.76 },
};

const DESERT_TIER_2_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.18, g: 0.34, b: 0.68 },
  skyBottom: { r: 0.52, g: 0.7, b: 0.96 },
  fogColor: { r: 0.4227, g: 0.6211, b: 0.9434 },
  fogNear: 38,
  fogFar: 235,
  ambientColor: { r: 0.4655, g: 0.5624, b: 0.95 },
  ambientIntensity: 0.84,
  sunColor: { r: 0.3647, g: 0.6353, b: 1.0 },
  sunIntensity: 1.0,
  sunDirection: { x: -0.45, y: 0.64, z: 0.58 },
  toonShadowTint: { r: 0.16, g: 0.22, b: 0.46 },
  toonHighlightTint: { r: 0.74, g: 0.88, b: 1.0 },
};

const DESERT_TIER_3_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.32, g: 0.08, b: 0.08 },
  skyBottom: { r: 0.68, g: 0.26, b: 0.22 },
  fogColor: { r: 0.5765, g: 0.1882, b: 0.1882 },
  fogNear: 34,
  fogFar: 220,
  ambientColor: { r: 0.82, g: 0.63, b: 0.62 },
  ambientIntensity: 0.82,
  sunColor: { r: 0.8784, g: 0.7412, b: 0.7176 },
  sunIntensity: 0.75,
  sunDirection: { x: 0.48, y: 0.54, z: -0.68 },
  toonShadowTint: { r: 0.32, g: 0.12, b: 0.14 },
  toonHighlightTint: { r: 0.95, g: 0.74, b: 0.68 },
};

const GRAVEYARD_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.16, g: 0.12, b: 0.28 },
  skyBottom: { r: 0.48, g: 0.4, b: 0.64 },
  fogColor: { r: 0.4941, g: 0.4157, b: 0.6235 },
  fogNear: 24,
  fogFar: 180,
  ambientColor: { r: 0.7453, g: 0.7453, b: 0.7453 },
  ambientIntensity: 0.76,
  sunColor: { r: 0.9451, g: 0.8431, b: 1.0 },
  sunIntensity: 1.0,
  sunDirection: { x: -0.35, y: 0.85, z: -0.38 },
  toonShadowTint: { r: 0.18, g: 0.14, b: 0.32 },
  toonHighlightTint: { r: 0.92, g: 0.84, b: 1.0 },
};

const FINAL_BOSS_LIGHTING: MapLightingConfig = {
  skyTop: { r: 0.14, g: 0.08, b: 0.18 },
  skyBottom: { r: 0.58, g: 0.46, b: 0.32 },
  fogColor: { r: 1.0, g: 0.9269, b: 0.5802 },
  fogNear: 34,
  fogFar: 220,
  ambientColor: { r: 0.7453, g: 0.7453, b: 0.7453 },
  ambientIntensity: 0.82,
  sunColor: { r: 1.0, g: 0.88, b: 0.62 },
  sunIntensity: 1.2,
  sunDirection: { x: 0.2, y: 0.92, z: 0.32 },
  toonShadowTint: { r: 0.22, g: 0.1, b: 0.26 },
  toonHighlightTint: { r: 1.0, g: 0.92, b: 0.65 },
};

export const MAPS: readonly MapDef[] = Object.freeze([
  {
    id: 'Forest',
    displayName: 'Green Forest',
    description: 'Stepped emerald plateaus, twilight groves, and cursed ridges guarded by Lil Bark, Chadbark, and Bark Lord.',
    isFinalBossMap: false,
    tiers: [1, 2, 3],
    stageDurationSec: 600,
    stageBossIds: {
      1: 'EntStage1',
      2: 'EntStage2',
      3: 'EntStage3',
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
    displayName: 'Crusty Desert',
    description: 'Sweeping multi-octave sand dunes built for blisteringly fast downhill crouch-slides, guarded by the Pharaoh Anubis trio.',
    isFinalBossMap: false,
    tiers: [1, 2, 3],
    stageDurationSec: 600,
    stageBossIds: {
      1: 'Pharaoh1',
      2: 'Pharaoh2',
      3: 'Pharaoh3',
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
      1: DESERT_TIER_1_LIGHTING,
      2: DESERT_TIER_2_LIGHTING,
      3: DESERT_TIER_3_LIGHTING,
    },
    defaultLighting: DESERT_TIER_1_LIGHTING,
    unlockedByDefault: false,
    unlockQuestId: 'quest_defeat_lil_bark',
  },
  {
    id: 'Graveyard',
    displayName: 'Hollow Graveyard',
    description: 'A haunted 19x19 violet mausoleum maze hiding the Crypt Escape and Big Bob, spectral king of Darkness.',
    isFinalBossMap: false,
    tiers: [1],
    stageDurationSec: 960,
    stageBossIds: {
      1: 'GhostKing',
      2: 'GhostKing',
      3: 'GhostKing',
    },
    cryptBossId: 'GhostKing',
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
    description: 'Skyborne obsidian colosseum ringed by 11 Boss Pylons where the Citadel Overlord steals weapons and tests legends.',
    isFinalBossMap: true,
    tiers: [1],
    stageDurationSec: 900,
    stageBossIds: {
      1: 'FinalBoss',
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
      bannerText: 'MINIBOSS APPROACHING: STONE GOLEM!',
    },
    {
      id: 'forest_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Goblin', 'Skeleton', 'Slime', 'Bee', 'Ghoul'],
      count: 18,
      bannerText: 'FOREST SWARM INCOMING!',
      eliteChance: 0.14,
    },
    {
      id: 'forest_swarm_360',
      timeSec: 360,
      kind: 'swarm',
      enemyIds: ['GoblinStrong', 'ArmoredSkeleton', 'BoomerSpider', 'Golem'],
      count: 22,
      bannerText: 'DEEP WOODS AMBUSH!',
      eliteChance: 0.2,
    },
    {
      id: 'forest_mb_450',
      timeSec: 450,
      kind: 'miniboss',
      enemyIds: ['MinibossPig'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: CHUNKHAM THE TERRIBLE!',
    },
  ]),
  Desert: Object.freeze<StageTimelineEventDef[]>([
    {
      id: 'desert_mb_180',
      timeSec: 180,
      kind: 'miniboss',
      enemyIds: ['MinibossGolemSand'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: SAND GOLEM!',
    },
    {
      id: 'desert_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Mummy', 'SkeletonDusty', 'Scorpion', 'Tumblebone', 'Wisp'],
      count: 18,
      bannerText: 'DESERT SWARM INCOMING!',
      eliteChance: 0.15,
    },
    {
      id: 'desert_swarm_360',
      timeSec: 360,
      kind: 'swarm',
      enemyIds: ['ScorpionMedium', 'MummyTank', 'CactusShooter', 'ArmoredSkeletonDusty'],
      count: 24,
      bannerText: 'SANDSTORM HORDE!',
      eliteChance: 0.22,
    },
    {
      id: 'desert_mb_450',
      timeSec: 450,
      kind: 'miniboss',
      enemyIds: ['MinibossScorpion'],
      count: 1,
      bannerText: 'MINIBOSS APPROACHING: DUNE EMPRESS!',
    },
  ]),
  Graveyard: Object.freeze<StageTimelineEventDef[]>([
    {
      id: 'graveyard_grave1_120',
      timeSec: 120,
      kind: 'miniboss',
      enemyIds: ['GhostGrave1'],
      count: 1,
      bannerText: 'GRAVE WARDEN AWAKENS: JEFF!',
    },
    {
      id: 'graveyard_swarm_240',
      timeSec: 240,
      kind: 'swarm',
      enemyIds: ['Ghost', 'Zombie', 'Head', 'Skeleton', 'Ghoul'],
      count: 20,
      bannerText: 'UNDEAD SWARM RISING!',
      eliteChance: 0.16,
    },
    {
      id: 'graveyard_mb_330',
      timeSec: 330,
      kind: 'miniboss',
      enemyIds: ['Ghostham', 'GhostGrave2'],
      count: 2,
      bannerText: 'MINIBOSS: GHOSTHAM THE DEAD & MIKE!',
    },
    {
      id: 'graveyard_swarm_480',
      timeSec: 480,
      kind: 'swarm',
      enemyIds: ['GreaterGhost', 'ArmoredSkeleton', 'Zombie', 'GhostPurple'],
      count: 24,
      bannerText: 'CRYPT HORDE UNLEASHED!',
      eliteChance: 0.22,
    },
    {
      id: 'graveyard_mb_600',
      timeSec: 600,
      kind: 'miniboss',
      enemyIds: ['CalciumDad', 'GhostGrave3'],
      count: 2,
      bannerText: "MINIBOSS: CALCIUM'S DAD & TED!",
    },
    {
      id: 'graveyard_grave4_780',
      timeSec: 780,
      kind: 'miniboss',
      enemyIds: ['GhostGrave4'],
      count: 1,
      bannerText: 'CRYPT KEEPER GARY DROPS THE CRYPT KEY!',
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
