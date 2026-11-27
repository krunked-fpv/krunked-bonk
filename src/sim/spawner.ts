import type {
  ChallengeDef,
  EnemyDef,
  EnemyRole,
  EnemyState,
  GameCatalog,
  ITerrainSampler,
  SimEvent,
  SimState,
  Vec3,
} from '../contracts/index';
import { getEnemyById } from '../data/enemies';
import { STAGE_TIMELINES } from '../data/maps';
import { ensureFinalBossPylonsInitialized } from './bosses';
import { dispatchItemTrigger } from './items';

const MAX_NORMAL_ENEMIES = 180;
const MAX_SWARM_ENEMIES = 240;

export interface MinuteScaling {
  hpScale: number;
  dmgScale: number;
  spdScale: number;
}

/**
 * Exact minute-based enemy pacing: +22% HP/min, +12% Dmg/min, +4% Spd/min,
 * scaled by map tier, player Difficulty stat, and active challenge modifiers.
 */
export function computeMinuteScaling(
  state: Readonly<SimState>,
  challenge?: ChallengeDef | null,
): MinuteScaling {
  const minutes = Math.max(0, state.simTimeSec / 60);
  const tierHpMult = 1 + (state.mapTier - 1) * 0.65;
  const tierDmgMult = 1 + (state.mapTier - 1) * 0.35;
  const diffStat = Math.max(0, state.player.stats.Difficulty);
  const diffMult = Math.max(0.5, state.difficultyMultiplier * (1 + diffStat));

  const chalHp = challenge?.rules.enemyHpMultiplier ?? 1;
  const chalDmg = challenge?.rules.enemyDamageMultiplier ?? 1;
  const chalSpd = challenge?.rules.speedMultiplier ?? 1;

  return {
    hpScale: (1 + 0.22 * minutes) * tierHpMult * diffMult * chalHp,
    dmgScale: (1 + 0.12 * minutes) * tierDmgMult * (1 + diffStat * 0.5) * chalDmg,
    spdScale: Math.min(2.2, (1 + 0.04 * minutes) * chalSpd),
  };
}

function chooseSpawnRingPosition(
  state: Readonly<SimState>,
  terrain: ITerrainSampler,
  rng: () => number,
  minDist: number,
  maxDist: number,
): Vec3 {
  const angle = rng() * Math.PI * 2;
  const dist = minDist + rng() * Math.max(1, maxDist - minDist);
  const raw: Vec3 = {
    x: state.player.pos.x + Math.cos(angle) * dist,
    y: state.player.pos.y,
    z: state.player.pos.z + Math.sin(angle) * dist,
  };
  const clamped = terrain.clampToArena(raw, 4);
  const sample = terrain.sample(clamped.x, clamped.z);
  return { x: clamped.x, y: sample.height, z: clamped.z };
}

export interface SpawnEnemyOptions {
  pos?: Vec3;
  roleOverride?: EnemyRole;
  isElite?: boolean;
  challenge?: ChallengeDef | null;
}

/**
 * Spawns a single enemy entity from catalog with minute/tier/elite scaling and emits `enemy_spawn`.
 */
export function spawnEnemyEntity(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  enemyId: string,
  terrain: ITerrainSampler,
  rng: () => number,
  events: SimEvent[],
  opts?: SpawnEnemyOptions,
): EnemyState | null {
  const def: EnemyDef | undefined =
    catalog.enemies.find((e) => e.id === enemyId) ?? getEnemyById(enemyId);
  if (!def) return null;

  const scaling = computeMinuteScaling(state, opts?.challenge);
  const role: EnemyRole = opts?.roleOverride ?? def.role;
  const isBoss =
    role === 'stage_boss' || role === 'crypt_boss' || role === 'final_boss';
  const isElite = Boolean(opts?.isElite && role === 'normal');

  const eliteHpMult = isElite ? 2.6 : 1.0;
  const eliteDmgMult = isElite ? 1.4 : 1.0;
  const eliteSizeMult = isElite ? 1.25 : 1.0;

  // Big Bob (500k HP), Final Boss (25k HP), and Spooky Steve preserve iconic exact HP curves
  const hpMultiplier =
    def.id === 'GhostInvincible' || def.id === 'GhostKing' || def.id === 'FinalBoss'
      ? (opts?.challenge?.rules.enemyHpMultiplier ?? 1)
      : isBoss
        ? (1 + (state.mapTier - 1) * 0.75) *
          Math.max(1, state.difficultyMultiplier) *
          (opts?.challenge?.rules.enemyHpMultiplier ?? 1)
        : scaling.hpScale * eliteHpMult;

  const maxHp = Math.max(1, Math.round(def.maxHp * hpMultiplier));
  const damage = Math.max(
    1,
    Math.round(
      def.damage *
        (isBoss ? 1 + (state.mapTier - 1) * 0.35 : scaling.dmgScale * eliteDmgMult),
    ),
  );
  const moveSpeed = def.moveSpeed * (isBoss ? 1.0 : scaling.spdScale);

  let pos: Vec3;
  if (opts?.pos) {
    const clamped = terrain.clampToArena(opts.pos, 3);
    const sample = terrain.sample(clamped.x, clamped.z);
    pos = { x: clamped.x, y: def.isFlying ? sample.height + 1.6 : sample.height, z: clamped.z };
  } else {
    const ringPos = chooseSpawnRingPosition(state, terrain, rng, isBoss ? 18 : 24, isBoss ? 26 : 42);
    pos = { x: ringPos.x, y: def.isFlying ? ringPos.y + 1.6 : ringPos.y, z: ringPos.z };
  }

  const dx = state.player.pos.x - pos.x;
  const dz = state.player.pos.z - pos.z;

  const entity: EnemyState = {
    id: state.nextEntityId++,
    enemyId: def.id,
    role: isElite ? 'elite' : role,
    pos: { ...pos },
    prevPos: { ...pos },
    vel: { x: 0, y: 0, z: 0 },
    yaw: Math.atan2(dx, dz),
    hp: maxHp,
    maxHp,
    radius: def.radius * eliteSizeMult,
    height: def.height * eliteSizeMult,
    damage,
    moveSpeed,
    attackTimer: isBoss ? 1.8 : 0.6,
    stunTimer: 0,
    charmedTimer: 0,
    isBoss,
    isElite,
    eliteTags: isElite ? ['Empowered'] : [],
    debuffs: [],
    phaseIndex: 0,
    weaponStealCooldown: def.id === 'GhostKing' ? 18.0 : 0,
  };

  state.enemies.push(entity);
  events.push({
    type: 'enemy_spawn',
    tick: state.tick,
    entityId: entity.id,
    enemyId: entity.enemyId,
    role: entity.role,
    pos: { ...entity.pos },
  });

  return entity;
}

/**
 * Summons the current stage's Boss (Forest EntStage1/2/3, Desert Pharaoh1/2/3,
 * Graveyard Big Bob `GhostKing`, FinalBossMap `FinalBoss`), honoring any Boss Curse stacks!
 */
export function triggerStageBoss(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  rng: () => number,
  events: SimEvent[],
  opts?: { pos?: Vec3; challenge?: ChallengeDef | null },
): EnemyState | null {
  if (state.stageBossId !== null) {
    const alive = state.enemies.find((e) => e.id === state.stageBossId && e.hp > 0);
    if (alive) return alive;
  }

  const mapDef = catalog.maps.find((m) => m.id === state.mapId);
  const bossId =
    state.mapId === 'FinalBossMap'
      ? 'FinalBoss'
      : state.mapId === 'Graveyard'
        ? 'GhostKing'
        : mapDef?.stageBossIds[state.mapTier] ?? mapDef?.stageBossIds[1] ?? 'EntStage1';

  const bossDef = catalog.enemies.find((e) => e.id === bossId) ?? getEnemyById(bossId);
  const roleOverride: EnemyRole =
    bossId === 'FinalBoss' ? 'final_boss' : bossId === 'GhostKing' ? 'crypt_boss' : 'stage_boss';

  const entity = spawnEnemyEntity(state, catalog, bossId, terrain, rng, events, {
    pos: opts?.pos,
    roleOverride,
    challenge: opts?.challenge,
  });

  if (!entity) return null;

  state.stageBossId = entity.id;
  if (bossId === 'FinalBoss') {
    state.finalBossId = entity.id;
    ensureFinalBossPylonsInitialized(state, terrain);
  } else if (bossId === 'GhostKing') {
    state.bigBobId = entity.id;
  }

  state.activeBannerText =
    bossId === 'GhostKing'
      ? 'BIG BOB AWAKENS — PREPARE FOR DARKNESS!'
      : bossId === 'FinalBoss'
        ? 'CITADEL OVERLORD DESCENDS — 11 PYLONS AWAIT!'
        : `STAGE BOSS: ${(bossDef?.displayName ?? bossId).toUpperCase()} AWAKENS!`;

  events.push({
    type: 'boss_spawn',
    tick: state.tick,
    entityId: entity.id,
    enemyId: entity.enemyId,
    displayName: bossDef?.displayName ?? entity.enemyId,
    pos: { ...entity.pos },
  });

  dispatchItemTrigger(
    state,
    catalog,
    'OnBossSpawn',
    { target: entity, pos: { ...entity.pos } },
    rng,
    events,
  );

  // ShrineCursed Boss Curse: spawn extra Stage Bosses for each Boss Curse invoked!
  if (roleOverride === 'stage_boss') {
    const curseBuffs = state.player.buffs.filter((b) => b.id.startsWith('cursed_shrine:'));
    for (let c = 0; c < curseBuffs.length; c++) {
      const ang = (c + 1) * 2.1;
      const extra = spawnEnemyEntity(state, catalog, bossId, terrain, rng, events, {
        pos: {
          x: entity.pos.x + Math.cos(ang) * 10,
          y: entity.pos.y,
          z: entity.pos.z + Math.sin(ang) * 10,
        },
        roleOverride: 'stage_boss',
        challenge: opts?.challenge,
      });
      if (extra) {
        events.push({
          type: 'boss_spawn',
          tick: state.tick,
          entityId: extra.id,
          enemyId: extra.enemyId,
          displayName: `Cursed ${bossDef?.displayName ?? bossId}`,
          pos: { ...extra.pos },
        });
      }
    }
  }

  return entity;
}

/**
 * Activates Final Swarm (`0:00` countdown expiration) and spawns Spooky Steve (`GhostInvincible`).
 */
export function triggerFinalSwarm(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  rng: () => number,
  events: SimEvent[],
  challenge?: ChallengeDef | null,
): EnemyState | null {
  state.finalSwarmActive = true;

  let steve: EnemyState | null = null;
  if (state.spookySteveId !== null) {
    steve = state.enemies.find((e) => e.id === state.spookySteveId && e.hp > 0) ?? null;
  }

  if (!steve) {
    const mapDef = catalog.maps.find((m) => m.id === state.mapId);
    const swarmBossId = mapDef?.finalSwarmBossId ?? 'GhostInvincible';
    steve = spawnEnemyEntity(state, catalog, swarmBossId, terrain, rng, events, {
      roleOverride: 'final_swarm',
      challenge,
    });
    if (steve) {
      state.spookySteveId = steve.id;
      state.activeBannerText = 'FINAL SWARM — SPOOKY STEVE HUNTS YOU!';
      events.push({
        type: 'final_swarm_start',
        tick: state.tick,
        spookySteveId: steve.id,
        pos: { ...steve.pos },
      });
    }
  }

  return steve;
}

function getContinuousPoolForTime(state: Readonly<SimState>): readonly string[] {
  const minutes = state.simTimeSec / 60;
  if (state.finalSwarmActive) {
    const overtime = Math.max(0, state.simTimeSec - state.stageDurationSec);
    if (overtime >= 60) return ['GhostRed', 'GhostPurple', 'GhostRed'];
    if (overtime >= 30) return ['GhostPurple', 'Ghost', 'GhostPurple'];
    return ['Ghost', 'Ghost', 'GhostPurple'];
  }

  if (state.mapId === 'Desert') {
    if (minutes < 1.5) return ['Mummy', 'SkeletonDusty', 'Tumblebone', 'Wisp'];
    if (minutes < 3.5) return ['Mummy', 'Scorpion', 'CactusShooter', 'ArmoredSkeletonDusty', 'Tumblebone'];
    if (minutes < 6.0) return ['ScorpionMedium', 'MummyTank', 'CactusShooter', 'Scorpion', 'GoldenSkeleton'];
    return ['MummyAncient', 'MummyTank', 'ScorpionMedium', 'CactusShooter', 'XpSkeleton'];
  }

  if (state.mapId === 'Graveyard') {
    if (minutes < 2.0) return ['Ghost', 'Zombie', 'Head', 'Skeleton'];
    if (minutes < 5.0) return ['Ghost', 'Ghoul', 'Zombie', 'GreaterGhost', 'ArmoredSkeleton'];
    if (minutes < 10.0) return ['GreaterGhost', 'GhostPurple', 'Zombie', 'Head', 'GoldenSkeleton'];
    return ['GhostPurple', 'GhostRed', 'GreaterGhost', 'ArmoredSkeleton', 'XpSkeleton'];
  }

  // Forest default
  if (minutes < 1.5) return ['Goblin', 'Slime', 'Bee'];
  if (minutes < 3.5) return ['Goblin', 'Skeleton', 'Slime', 'Ghoul', 'BoomerSpider'];
  if (minutes < 6.0) return ['GoblinStrong', 'ArmoredSkeleton', 'Golem', 'BoomerSpider', 'FrogGreen'];
  return ['GoblinTank', 'GoblinStrong', 'ArmoredSkeleton', 'Golem', 'GoldenSkeleton', 'XpSkeleton'];
}

/**
 * Deterministic per-tick stage timeline, continuous biome pacing, FinalBossMap auto-summon,
 * and Final Swarm escalation.
 */
export function stepSpawner(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  _dt: number,
  rng: () => number,
  events: SimEvent[],
  challenge?: ChallengeDef | null,
): void {
  if (state.phase !== 'playing' || state.player.dead) return;

  // FinalBossMap: auto-spawn FinalBoss immediately & park the 11 pylons until shield phases
  if (state.mapId === 'FinalBossMap') {
    ensureFinalBossPylonsInitialized(state, terrain);
    if (state.finalBossId === null && !state.stageBossDefeated) {
      triggerStageBoss(state, catalog, terrain, rng, events, {
        pos: { x: 0, y: 0, z: -32 },
        challenge,
      });
    }
    return;
  }

  // 1. Trigger Final Swarm when countdown hits 0:00
  if (!state.finalSwarmActive && state.simTimeSec >= state.stageDurationSec) {
    triggerFinalSwarm(state, catalog, terrain, rng, events, challenge);
  }

  // 2. Scripted biome stage timeline milestones
  const timeline = STAGE_TIMELINES[state.mapId] ?? [];
  for (let i = 0; i < timeline.length; i++) {
    const ev = timeline[i];
    if (state.simTimeSec >= ev.timeSec && !state.stageEventsFired.includes(ev.id)) {
      state.stageEventsFired.push(ev.id);
      state.activeBannerText = ev.bannerText;

      for (let k = 0; k < ev.count; k++) {
        const enemyId = ev.enemyIds[k % ev.enemyIds.length];
        const isElite = ev.eliteChance ? rng() < ev.eliteChance : false;
        spawnEnemyEntity(state, catalog, enemyId, terrain, rng, events, {
          isElite,
          challenge,
        });
      }
    }
  }

  // 3. Continuous enemy pacing (purely deterministic from state.tick)
  const cap = state.finalSwarmActive ? MAX_SWARM_ENEMIES : MAX_NORMAL_ENEMIES;
  if (state.enemies.length >= cap) return;

  const minutes = state.simTimeSec / 60;
  const swarmSpeedup = state.challengeId === 'Swarm' ? 0.72 : 1.0;
  const spawnIntervalTicks = state.finalSwarmActive
    ? 18
    : Math.max(20, Math.round((85 - minutes * 6) * swarmSpeedup));

  if (state.tick <= 0 || state.tick % spawnIntervalTicks !== 0) return;

  const pool = getContinuousPoolForTime(state);
  const packSize = state.finalSwarmActive
    ? 4
    : Math.min(6, 1 + Math.floor(minutes / 2.2) + (state.mapTier - 1) + (state.challengeId === 'Swarm' ? 1 : 0));
  const eliteChance = state.finalSwarmActive ? 0 : Math.min(0.35, 0.06 + minutes * 0.018);

  const anchor = chooseSpawnRingPosition(state, terrain, rng, 25, 40);
  for (let i = 0; i < packSize; i++) {
    if (state.enemies.length >= cap) break;
    const enemyId = pool[Math.floor(rng() * pool.length) % pool.length];
    const jitterAngle = rng() * Math.PI * 2;
    const jitterDist = rng() * 4.5;
    spawnEnemyEntity(state, catalog, enemyId, terrain, rng, events, {
      pos: {
        x: anchor.x + Math.cos(jitterAngle) * jitterDist,
        y: anchor.y,
        z: anchor.z + Math.sin(jitterAngle) * jitterDist,
      },
      isElite: rng() < eliteChance,
      challenge,
    });
  }
}
