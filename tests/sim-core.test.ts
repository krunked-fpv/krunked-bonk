import { describe, expect, it } from 'vitest';
import {
  ALL_ESTATS,
  ARMOR_DR_CAP,
  BHOP_WINDOW_SEC,
  COYOTE_TIME_SEC,
  createEmptyInputFrame,
  EVASION_CAP,
  FALL_DAMAGE_SPEED_THRESHOLD,
  FINAL_BOSS_PYLON_COUNT,
  FIXED_DT,
  GRAVEYARD_GRID_SIZE,
  GRAVITY,
  JUMP_BUFFER_SEC,
  JUMP_PAD_VY,
  MIN_COOLDOWN_SEC,
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CROUCH_SCALE,
  RAIL_GRIND_SPEED,
  WALL_CLIMB_COOLDOWN_SEC,
  type ITerrainSampler,
  type MapId,
  type MapTier,
  type SimEvent,
  type SimState,
  type TerrainSample,
  type Vec3,
  type WallHit,
} from '../src/contracts/index';
import { GAME_CATALOG, getChallengeById } from '../src/data/index';
import { createSimEngine } from '../src/sim/engine';
import { computeSimStateHash } from '../src/sim/hash';
import {
  applyWindField,
  getHoverboardDistance,
  GRAVITY_LOW,
  GRAVITY_SLIGHT_FLOAT,
  GLIDE_MAX_FALL_SPEED,
  resolveCharacterPhysicsFlags,
  stepPlayerPhysics,
  verifyPosition,
} from '../src/sim/physics';
import {
  chance,
  createSeededRng,
  deriveSeed,
  nextFloat,
  nextInt,
  nextRange,
  nextUint32,
  normalizeSeed,
  pick,
  shuffleInPlace,
  weightedPick,
} from '../src/sim/prng';
import {
  computeArmorDamageReduction,
  computeEffectiveCooldown,
  computeStatBlock,
  createBaseStatBlock,
  recalculatePlayerStats,
} from '../src/sim/stats';
import {
  createTerrainSampler,
  DESERT_STAGE_PARAMS,
  FOREST_STAGE_PARAMS,
  sampleDesertTornadoes,
} from '../src/sim/terrain';

function createFlatTestTerrain(
  opts?: {
    arenaRadius?: number;
    heightFn?: (x: number, z: number) => number;
    wallAtX?: number;
  },
): ITerrainSampler {
  const arenaRadius = opts?.arenaRadius ?? 150;
  const heightFn = opts?.heightFn ?? (() => 0);
  const eps = 0.25;

  const sample = (x: number, z: number): TerrainSample => {
    const h = heightFn(x, z);
    const dhdx = (heightFn(x + eps, z) - heightFn(x - eps, z)) / (2 * eps);
    const dhdz = (heightFn(x, z + eps) - heightFn(x, z - eps)) / (2 * eps);
    const len = Math.hypot(dhdx, 1, dhdz);
    const nx = -dhdx / len;
    const ny = 1 / len;
    const nz = -dhdz / len;
    const inBounds = Math.hypot(x, z) <= arenaRadius;
    return {
      height: h,
      normal: { x: nx, y: ny, z: nz },
      slopeAngleRad: Math.acos(Math.max(-1, Math.min(1, ny))),
      inBounds,
      surfaceTag: inBounds ? 'ground' : 'void',
    };
  };

  const checkWallCollision = (pos: Vec3, radius: number): WallHit => {
    if (opts?.wallAtX !== undefined && pos.x + radius >= opts.wallAtX) {
      return {
        hit: true,
        normal: { x: -1, y: 0, z: 0 },
        penetration: Math.max(0.05, pos.x + radius - opts.wallAtX),
        point: { x: opts.wallAtX, y: pos.y + 1, z: pos.z },
      };
    }
    const dist = Math.hypot(pos.x, pos.z);
    if (dist > arenaRadius - radius) {
      const inv = 1 / Math.max(1e-6, dist);
      return {
        hit: true,
        normal: { x: -pos.x * inv, y: 0, z: -pos.z * inv },
        penetration: dist - (arenaRadius - radius),
        point: { x: pos.x * inv * arenaRadius, y: pos.y + 1, z: pos.z * inv * arenaRadius },
      };
    }
    return {
      hit: false,
      normal: { x: 0, y: 0, z: 0 },
      penetration: 0,
      point: { x: pos.x, y: pos.y, z: pos.z },
    };
  };

  return {
    mapId: 'Forest',
    seed: 1,
    arenaRadius,
    sample,
    checkWallCollision,
    clampToArena: (pos: Vec3, margin = 2) => {
      const maxR = Math.max(1, arenaRadius - margin);
      const d = Math.hypot(pos.x, pos.z);
      if (d <= maxR || d < 1e-6) return { ...pos };
      return { x: (pos.x / d) * maxR, y: pos.y, z: (pos.z / d) * maxR };
    },
    getSpawnPoint: () => ({ x: 0, y: heightFn(0, 0), z: 0 }),
  };
}

function assertAllFiniteNumbers(value: unknown, path = 'root'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `Non-finite number at ${path}: ${value}`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertAllFiniteNumbers(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertAllFiniteNumbers(v, `${path}.${k}`);
    }
  }
}

describe('PRNG determinism, distribution & FNV-1a state hashing', () => {
  it('produces bit-for-bit identical sequences from identical seeds and diverges on consecutive seeds', () => {
    const a = createSeededRng(424242);
    const b = createSeededRng(424242);
    const c = createSeededRng(424243);

    const seqA = Array.from({ length: 64 }, () => nextUint32(a));
    const seqB = Array.from({ length: 64 }, () => nextUint32(b));
    const seqC = Array.from({ length: 64 }, () => nextUint32(c));

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    expect(normalizeSeed(1)).not.toBe(normalizeSeed(2));
    expect(deriveSeed(100, 'forest')).toBe(deriveSeed(100, 'forest'));
    expect(deriveSeed(100, 'forest')).not.toBe(deriveSeed(100, 'desert'));
    expect(Number.isFinite(normalizeSeed(Number.NaN))).toBe(true);
  });

  it('maintains uniform float/int/weighted/shuffle distribution', () => {
    const rng = createSeededRng(999111);
    const N = 10_000;
    let sum = 0;
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < N; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
      buckets[Math.floor(f * 10)] += 1;
    }

    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }

    expect(nextRange(rng, 10, 20)).toBeGreaterThanOrEqual(10);
    expect(nextRange(rng, 10, 20)).toBeLessThan(20);
    for (let i = 0; i < 100; i++) {
      const n = nextInt(rng, -3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
    expect(chance(rng, 0)).toBe(false);
    expect(chance(rng, 1)).toBe(true);
    expect(pick(rng, ['a', 'b', 'c'])).toBeDefined();
    expect(pick(rng, [])).toBeUndefined();

    const heavy = weightedPick(rng, ['low', 'high'], (x) => (x === 'high' ? 1000 : 1));
    expect(heavy).toBe('high');

    const arrA = [1, 2, 3, 4, 5, 6, 7, 8];
    const arrB = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffleInPlace(createSeededRng(77), arrA);
    shuffleInPlace(createSeededRng(77), arrB);
    expect(arrA).toEqual(arrB);
    expect([...arrA].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('computes deterministic 8-char FNV-1a hashes sensitive to state mutations', () => {
    const engineA = createSimEngine();
    const engineB = createSimEngine();
    engineA.initRun({ seed: 202601, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engineB.initRun({ seed: 202601, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });

    for (let t = 0; t < 120; t++) {
      const inp = createEmptyInputFrame(t * 0.03, 0);
      inp.moveZ = 1;
      inp.jumpPressed = t % 35 === 5;
      inp.jump = t % 35 >= 5 && t % 35 <= 12;
      engineA.step(inp);
      engineB.step(inp);
    }

    const hashA = engineA.computeStateHash();
    const hashB = engineB.computeStateHash();
    expect(hashA).toMatch(/^[0-9a-f]{8}$/);
    expect(hashA).toBe(hashB);

    // Mutating a single gameplay field must alter the hash
    const mutated: SimState = structuredClone(engineA.getState() as SimState);
    mutated.player.gold += 1;
    expect(computeSimStateHash(mutated)).not.toBe(hashA);

    // NaN/Infinity sentinel hashing does not throw
    const nanState: SimState = structuredClone(engineA.getState() as SimState);
    nanState.player.pos.x = Number.NaN;
    nanState.player.vel.y = Number.POSITIVE_INFINITY;
    expect(computeSimStateHash(nanState)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('57-stat EStat engine', () => {
  it('initializes all 57 EStat keys cleanly and enforces (base + add) * mult + flat', () => {
    expect(ALL_ESTATS).toHaveLength(57);
    const base = createBaseStatBlock();
    expect(Object.keys(base)).toHaveLength(57);
    for (const stat of ALL_ESTATS) {
      expect(Number.isFinite(base[stat])).toBe(true);
    }

    const { stats, breakdown } = computeStatBlock(base, [
      { stat: 'MaxHealth', add: 50 },
      { stat: 'MaxHealth', mult: 0.2 },
      { stat: 'MaxHealth', mult: 0.3 },
      { stat: 'MaxHealth', flat: 25 },
      // Floor multiplier guard (1 + (-5) => clamped to 0.05)
      { stat: 'DamageMultiplier', mult: -5.0 },
    ]);

    // (100 + 50) * (1 + 0.5) + 25 = 250
    expect(stats.MaxHealth).toBeCloseTo(250, 5);
    expect(breakdown.MaxHealth.base).toBe(100);
    expect(breakdown.MaxHealth.add).toBe(50);
    expect(breakdown.MaxHealth.mult).toBeCloseTo(1.5, 5);
    expect(breakdown.MaxHealth.flat).toBe(25);
    // (1 + 0) * 0.05 = 0.05, then clamped to DamageMultiplier min 0.1
    expect(breakdown.DamageMultiplier.mult).toBeCloseTo(0.05, 5);
    expect(stats.DamageMultiplier).toBeCloseTo(0.1, 5);
  });

  it('enforces Armor hyperbolic DR cap 0.85, Evasion cap 0.75, and min cooldown 0.06s', () => {
    expect(computeArmorDamageReduction(0)).toBe(0);
    expect(computeArmorDamageReduction(-5)).toBe(0);
    expect(computeArmorDamageReduction(Number.NaN)).toBe(0);
    expect(computeArmorDamageReduction(1)).toBeCloseTo(0.5, 6);
    expect(computeArmorDamageReduction(4)).toBeCloseTo(0.8, 6);
    expect(computeArmorDamageReduction(10)).toBeCloseTo(ARMOR_DR_CAP, 6);
    expect(computeArmorDamageReduction(1000)).toBe(ARMOR_DR_CAP);

    const { stats } = computeStatBlock(createBaseStatBlock(), [
      { stat: 'Evasion', flat: 2.5 },
      { stat: 'DamageReduction', flat: 2.0 },
    ]);
    expect(stats.Evasion).toBe(EVASION_CAP);
    expect(stats.DamageReduction).toBe(ARMOR_DR_CAP);

    expect(computeEffectiveCooldown(1.0, 1.0, 0)).toBeCloseTo(1.0, 6);
    expect(computeEffectiveCooldown(1.0, 2.0, 0.5)).toBeCloseTo(0.25, 6);
    expect(computeEffectiveCooldown(0.1, 50.0, 0.99)).toBe(MIN_COOLDOWN_SEC);
  });

  it('applies character additive baseStats, per-level passives, ConvertStat, and oneHpMode', () => {
    const engine = createSimEngine();

    // Verify SirOofie baseStats & Reinforced per-level passive
    const oofie = engine.initRun({ seed: 10, characterId: 'SirOofie', mapId: 'Forest', mapTier: 1 });
    expect(oofie.player.stats.MaxHealth).toBeCloseTo(150, 5);
    expect(oofie.player.stats.Armor).toBeCloseTo(0.15, 5);
    oofie.player.level = 6; // +5 levels => +0.15 Armor
    recalculatePlayerStats(oofie.player, GAME_CATALOG, 'SirOofie', null);
    expect(oofie.player.stats.Armor).toBeCloseTo(0.30, 5);

    // Verify Cl4nk negative MaxHealth delta + Shield + CritHappens per-level passive
    const cl4nk = engine.initRun({ seed: 11, characterId: 'Cl4nk', mapId: 'Forest', mapTier: 1 });
    expect(cl4nk.player.stats.MaxHealth).toBeCloseTo(40, 5);
    expect(cl4nk.player.stats.Shield).toBeCloseTo(50, 5);
    cl4nk.player.level = 11; // +10 levels => +0.20 CritChance
    recalculatePlayerStats(cl4nk.player, GAME_CATALOG, 'Cl4nk', null);
    expect(cl4nk.player.stats.CritChance).toBeCloseTo(0.25, 5);

    // Verify PassiveStat ConvertStat second-pass (SpikyShield converts Armor -> Thorns)
    engine.grantItem('SpikyShield', 1);
    expect(engine.getState().player.stats.Armor).toBeGreaterThanOrEqual(0.15);
    expect(engine.getState().player.stats.Thorns).toBeGreaterThan(0);

    // Verify Fragile challenge enforces MaxHealth === 1
    const fragileChallenge = getChallengeById('Fragile') ?? null;
    expect(fragileChallenge?.rules.oneHpMode).toBe(true);
    recalculatePlayerStats(oofie.player, GAME_CATALOG, 'SirOofie', fragileChallenge);
    expect(oofie.player.stats.MaxHealth).toBe(1);
    expect(oofie.player.maxHp).toBe(1);
  });
});

describe('Kinetic 50 Hz movement physics', () => {
  it('gains >18 m/s on downhill slope crouch-slide with 0.55x crouch height', () => {
    // 22-degree downhill ramp along -Z (facing yaw=0 moves along -Z)
    const slope = Math.tan((22 * Math.PI) / 180);
    const rampTerrain = createFlatTestTerrain({
      arenaRadius: 300,
      heightFn: (_x, z) => z * slope,
    });

    const engine = createSimEngine();
    const state = engine.initRun({ seed: 7, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    state.player.pos = { x: 0, y: 0, z: 0 };
    state.player.vel = { x: 0, y: 0, z: -10 };
    state.player.grounded = true;

    const events: SimEvent[] = [];
    let peakSpeed = 0;
    let sawSlideStart = false;

    for (let t = 0; t < 110; t++) {
      state.tick += 1;
      const inp = createEmptyInputFrame(0, 0);
      inp.moveZ = 1;
      inp.crouchSlide = true;
      stepPlayerPhysics(state, inp, rampTerrain, events);
      const spd = Math.hypot(state.player.vel.x, state.player.vel.z);
      if (spd > peakSpeed) peakSpeed = spd;
      if (state.player.isSliding) {
        expect(state.player.capsuleHeight).toBeCloseTo(PLAYER_CAPSULE_HEIGHT * PLAYER_CROUCH_SCALE, 3);
      }
      if (events.some((e) => e.type === 'player_slide_start')) {
        sawSlideStart = true;
      }
    }

    expect(sawSlideStart).toBe(true);
    expect(peakSpeed).toBeGreaterThan(18.0);
    expect(state.summary.topSpeedReached).toBeGreaterThan(18.0);
  });

  it('supports Quake AirAccelerate, bunny-hop 0.14s window & streak, coyote 0.12s, and jump buffer 0.12s', () => {
    const flatTerrain = createFlatTestTerrain({ arenaRadius: 240 });
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 8, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    state.player.pos = { x: 0, y: 0, z: 0 };
    state.player.vel = { x: 0, y: 0, z: -11 };
    state.player.grounded = true;
    const events: SimEvent[] = [];

    // 1. Quake AirAccelerate: launch airborne and strafe perpendicularly to gain speed
    const jumpInp = createEmptyInputFrame(0, 0);
    jumpInp.moveZ = 1;
    jumpInp.jump = true;
    jumpInp.jumpPressed = true;
    state.tick += 1;
    stepPlayerPhysics(state, jumpInp, flatTerrain, events);
    expect(state.player.grounded).toBe(false);
    const initialAirSpeed = Math.hypot(state.player.vel.x, state.player.vel.z);

    for (let t = 0; t < 20; t++) {
      state.tick += 1;
      const strafeInp = createEmptyInputFrame(0.08 * t, 0);
      strafeInp.moveX = 1;
      stepPlayerPhysics(state, strafeInp, flatTerrain, events);
    }
    const postAirSpeed = Math.hypot(state.player.vel.x, state.player.vel.z);
    expect(postAirSpeed).toBeGreaterThan(initialAirSpeed);

    // 2. Jump buffer (0.12s) + Bunny-hop (0.14s window) streak
    let landedOnce = false;
    let bhopsTriggered = 0;
    for (let t = 0; t < 220; t++) {
      state.tick += 1;
      const inp = createEmptyInputFrame(0, 0);
      inp.moveZ = 1;
      // Press jump 2 ticks before landing (within JUMP_BUFFER_SEC = 0.12s) to chain bhops
      const aboutToLand = !state.player.grounded && state.player.vel.y < 0 && state.player.pos.y < 0.75;
      if (aboutToLand || (state.player.grounded && state.player.bhopTimer > 0)) {
        inp.jumpPressed = true;
        inp.jump = true;
      }
      const prevLen = events.length;
      stepPlayerPhysics(state, inp, flatTerrain, events);
      for (let i = prevLen; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'player_land') landedOnce = true;
        if (ev.type === 'player_jump' && ev.isBhop) bhopsTriggered += 1;
      }
      if (bhopsTriggered >= 2) break;
    }

    expect(landedOnce).toBe(true);
    expect(BHOP_WINDOW_SEC).toBe(0.14);
    expect(JUMP_BUFFER_SEC).toBe(0.12);
    expect(bhopsTriggered).toBeGreaterThanOrEqual(2);
    expect(state.summary.longestBhopStreak).toBeGreaterThanOrEqual(2);

    // 3. Coyote Time (0.12s = 6 ticks): step off ledge and jump 4 ticks later (0.08s <= 0.12s)
    const ledgeTerrain = createFlatTestTerrain({
      heightFn: (_x, z) => (z > -2 ? 10 : 0),
    });
    const coyoteState = engine.initRun({ seed: 9, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    coyoteState.player.pos = { x: 0, y: 10, z: -1.9 };
    coyoteState.player.vel = { x: 0, y: 0, z: -10 };
    coyoteState.player.grounded = true;
    const coyoteEvents: SimEvent[] = [];

    // Step off ledge -> becomes airborne with coyoteTimer = COYOTE_TIME_SEC
    coyoteState.tick += 1;
    stepPlayerPhysics(coyoteState, { ...createEmptyInputFrame(0, 0), moveZ: 1 }, ledgeTerrain, coyoteEvents);
    expect(coyoteState.player.grounded).toBe(false);
    expect(coyoteState.player.coyoteTimer).toBeCloseTo(COYOTE_TIME_SEC, 4);

    // Wait 3 ticks (0.06s), then press jump -> must execute a coyote ground jump!
    for (let i = 0; i < 3; i++) {
      coyoteState.tick += 1;
      stepPlayerPhysics(coyoteState, createEmptyInputFrame(0, 0), ledgeTerrain, coyoteEvents);
    }
    coyoteState.tick += 1;
    stepPlayerPhysics(
      coyoteState,
      { ...createEmptyInputFrame(0, 0), jump: true, jumpPressed: true },
      ledgeTerrain,
      coyoteEvents,
    );
    expect(coyoteEvents.some((e) => e.type === 'player_jump' && !e.isAirJump)).toBe(true);
    expect(coyoteState.player.vel.y).toBeGreaterThan(10);
  });

  it('enforces wall-climb 0.25s cooldown for normal characters and unlimited climbs for Monke', () => {
    const wallTerrain = createFlatTestTerrain({ wallAtX: 5.0 });
    const engine = createSimEngine();

    // Standard character (Fox): 1 wall climb then cooldown = 0.25s and limit reached
    const foxState = engine.initRun({ seed: 12, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    foxState.player.pos = { x: 4.3, y: 3.0, z: 0 };
    foxState.player.vel = { x: 2, y: -1, z: 0 };
    foxState.player.grounded = false;
    const foxEvents: SimEvent[] = [];

    foxState.tick += 1;
    stepPlayerPhysics(
      foxState,
      { ...createEmptyInputFrame(0, 0), moveX: 1, jump: true, jumpPressed: true },
      wallTerrain,
      foxEvents,
      resolveCharacterPhysicsFlags('Fox'),
    );
    expect(foxEvents.filter((e) => e.type === 'player_wall_climb')).toHaveLength(1);
    expect(foxState.player.wallClimbCooldown).toBeCloseTo(WALL_CLIMB_COOLDOWN_SEC, 4);

    // Monke: unlimited wall climbs with 0s cooldown
    const monkeState = engine.initRun({ seed: 13, characterId: 'Monke', mapId: 'Forest', mapTier: 1 });
    const monkeFlags = resolveCharacterPhysicsFlags('Monke');
    expect(monkeFlags.infiniteWallClimb).toBe(true);
    monkeState.player.pos = { x: 4.3, y: 3.0, z: 0 };
    monkeState.player.vel = { x: 0, y: -1, z: 0 };
    monkeState.player.grounded = false;
    const monkeEvents: SimEvent[] = [];

    for (let i = 0; i < 4; i++) {
      monkeState.player.pos.x = 4.35;
      monkeState.tick += 1;
      stepPlayerPhysics(
        monkeState,
        { ...createEmptyInputFrame(0, 0), moveX: 1, jump: true, jumpPressed: true },
        wallTerrain,
        monkeEvents,
        monkeFlags,
      );
      expect(monkeState.player.wallClimbCooldown).toBe(0);
    }
    expect(monkeEvents.filter((e) => e.type === 'player_wall_climb').length).toBeGreaterThanOrEqual(4);
  });

  it('handles spline rail grinding (>=20 m/s), jump pads (vy=24), fall damage & slide/rail immunity, and verifyPosition()', () => {
    const flatTerrain = createFlatTestTerrain({ arenaRadius: 150 });
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 14, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    state.rails = [
      {
        id: 101,
        points: [
          { x: 0, y: 3, z: 0 },
          { x: 0, y: 3, z: -60 },
        ],
        totalLength: 60,
      },
    ];
    state.jumpPads = [
      {
        id: 201,
        pos: { x: 30, y: 0, z: 0 },
        radius: 3.0,
        launchVy: JUMP_PAD_VY,
      },
    ];

    const events: SimEvent[] = [];

    // 1. Rail attach & grind >= 20 m/s (with fall-damage immunity reset)
    state.player.pos = { x: 0, y: 3.2, z: -10 };
    state.player.vel = { x: 0, y: -28, z: -8 };
    state.player.peakFallSpeed = 28;
    state.player.grounded = false;
    state.tick += 1;
    stepPlayerPhysics(state, createEmptyInputFrame(0, 0), flatTerrain, events);

    expect(state.player.railId).toBe(101);
    expect(state.player.movementState).toBe('Grinding');
    expect(state.player.peakFallSpeed).toBe(0);
    expect(Math.hypot(state.player.vel.x, state.player.vel.z)).toBeGreaterThanOrEqual(RAIL_GRIND_SPEED - 0.01);
    expect(events.some((e) => e.type === 'player_rail_attach')).toBe(true);

    // Jump off rail
    state.tick += 1;
    stepPlayerPhysics(
      state,
      { ...createEmptyInputFrame(0, 0), jump: true, jumpPressed: true },
      flatTerrain,
      events,
    );
    expect(state.player.railId).toBeNull();
    expect(events.some((e) => e.type === 'player_rail_detach' && e.jumped)).toBe(true);

    // 2. Jump pad launch (vy = 24)
    state.player.pos = { x: 30, y: 0.2, z: 0 };
    state.player.vel = { x: 0, y: 0, z: 0 };
    state.player.grounded = true;
    state.tick += 1;
    stepPlayerPhysics(state, createEmptyInputFrame(0, 0), flatTerrain, events);
    expect(state.player.vel.y).toBeCloseTo(JUMP_PAD_VY, 4);
    expect(events.some((e) => e.type === 'player_jump_pad' && e.padId === 201)).toBe(true);

    // 3. Fall damage (> 22 m/s) without slide vs 100% immune when holding crouchSlide
    const hpBefore = state.player.hp;
    state.player.pos = { x: 0, y: 0.4, z: 0 };
    state.player.vel = { x: 0, y: -(FALL_DAMAGE_SPEED_THRESHOLD + 8), z: 0 };
    state.player.peakFallSpeed = FALL_DAMAGE_SPEED_THRESHOLD + 8;
    state.player.grounded = false;
    state.tick += 1;
    stepPlayerPhysics(state, { ...createEmptyInputFrame(0, 0), crouchSlide: true }, flatTerrain, events);
    expect(state.player.hp).toBe(hpBefore); // 100% slide immunity!

    // Now without crouchSlide -> takes fall damage!
    state.player.pos = { x: 0, y: 0.4, z: 0 };
    state.player.vel = { x: 0, y: -(FALL_DAMAGE_SPEED_THRESHOLD + 10), z: 0 };
    state.player.peakFallSpeed = FALL_DAMAGE_SPEED_THRESHOLD + 10;
    state.player.grounded = false;
    state.tick += 1;
    stepPlayerPhysics(state, createEmptyInputFrame(0, 0), flatTerrain, events);
    expect(state.player.hp).toBeLessThan(hpBefore);
    expect(events.some((e) => e.type === 'player_fall_damage')).toBe(true);

    // 4. verifyPosition() NaN and OOB recovery
    const prevRecoveries = state.summary.unstuckRecoveries;
    state.player.pos = { x: Number.NaN, y: 5, z: 0 };
    expect(verifyPosition(state, flatTerrain, events)).toBe(true);
    expect(Number.isFinite(state.player.pos.x)).toBe(true);
    expect(state.summary.unstuckRecoveries).toBe(prevRecoveries + 1);

    state.player.pos = { x: 999, y: 0, z: 999 };
    expect(verifyPosition(state, flatTerrain, events)).toBe(true);
    expect(Math.hypot(state.player.pos.x, state.player.pos.z)).toBeLessThanOrEqual(flatTerrain.arenaRadius);
    expect(state.summary.unstuckRecoveries).toBe(prevRecoveries + 2);
  });

  it('implements character gravity modes (Birdo glide, Spaceman lowG, Vlad float, TonyMcZoom hoverboard)', () => {
    const flatTerrain = createFlatTestTerrain();
    const engine = createSimEngine();

    // Birdo glide caps fall speed at -3.6 m/s
    const birdo = engine.initRun({ seed: 21, characterId: 'Birdo', mapId: 'Forest', mapTier: 1 });
    birdo.player.pos = { x: 0, y: 30, z: 0 };
    birdo.player.vel = { x: 0, y: -10, z: 0 };
    birdo.player.grounded = false;
    const birdoFlags = resolveCharacterPhysicsFlags('Birdo');
    let glideRes = stepPlayerPhysics(birdo, { ...createEmptyInputFrame(), jump: true }, flatTerrain, [], birdoFlags);
    for (let t = 0; t < 40; t++) {
      birdo.tick += 1;
      glideRes = stepPlayerPhysics(birdo, { ...createEmptyInputFrame(), jump: true }, flatTerrain, [], birdoFlags);
    }
    expect(glideRes.isGliding).toBe(true);
    expect(birdo.player.vel.y).toBeCloseTo(-GLIDE_MAX_FALL_SPEED, 1);

    // Spaceman low gravity vs Vlad slight float vs standard GRAVITY
    const space = engine.initRun({ seed: 22, characterId: 'Spaceman', mapId: 'Forest', mapTier: 1 });
    space.player.pos = { x: 0, y: 20, z: 0 };
    space.player.grounded = false;
    const spaceRes = stepPlayerPhysics(
      space,
      createEmptyInputFrame(),
      flatTerrain,
      [],
      resolveCharacterPhysicsFlags('Spaceman'),
    );
    expect(spaceRes.effectiveGravity).toBe(GRAVITY_LOW);
    expect(space.player.vel.y).toBeCloseTo(GRAVITY_LOW * FIXED_DT, 4);

    const vlad = engine.initRun({ seed: 23, characterId: 'Vlad', mapId: 'Forest', mapTier: 1 });
    vlad.player.pos = { x: 0, y: 20, z: 0 };
    vlad.player.grounded = false;
    const vladRes = stepPlayerPhysics(
      vlad,
      createEmptyInputFrame(),
      flatTerrain,
      [],
      resolveCharacterPhysicsFlags('Vlad'),
    );
    expect(vladRes.effectiveGravity).toBe(GRAVITY_SLIGHT_FLOAT);
    expect(GRAVITY).toBe(-19.62);

    // TonyMcZoom hoverboard tracks distance moved
    const tony = engine.initRun({ seed: 24, characterId: 'TonyMcZoom', mapId: 'Desert', mapTier: 1 });
    tony.player.pos = { x: 0, y: 0, z: 0 };
    tony.player.grounded = true;
    const tonyFlags = resolveCharacterPhysicsFlags('TonyMcZoom');
    for (let t = 0; t < 25; t++) {
      tony.tick += 1;
      stepPlayerPhysics(tony, { ...createEmptyInputFrame(), moveZ: 1 }, flatTerrain, [], tonyFlags);
    }
    expect(getHoverboardDistance(tony.player)).toBeGreaterThan(3);
  });
});

describe('All 4 biome terrains & zero-NaN guarantees', () => {
  it('validates Forest T1-3, Desert T1-3 + tornadoes, Graveyard 19x19 + 6 lamps + crypt, and FinalBossMap 11 pylons', () => {
    // 1. Forest T1-3
    for (const tier of [1, 2, 3] as MapTier[]) {
      const forest = createTerrainSampler('Forest', tier, 100 + tier);
      const cfg = FOREST_STAGE_PARAMS[tier];
      expect(forest.sampler.arenaRadius).toBe(cfg.arenaRadius);
      expect(forest.rails).toHaveLength(cfg.railCount);
      expect(forest.jumpPads).toHaveLength(cfg.jumpPadCount);
      expect(forest.worldBounds?.gridSize).toBe(cfg.gridSize);
      expect(forest.worldBounds?.cellScale).toBe(cfg.cellScale);
    }

    // 2. Desert T1-3 Perlin dunes + sampleDesertTornadoes + applyWindField
    for (const tier of [1, 2, 3] as MapTier[]) {
      const desert = createTerrainSampler('Desert', tier, 200 + tier);
      const params = DESERT_STAGE_PARAMS[tier];
      expect(desert.sampler.arenaRadius).toBe(params.arenaRadius);
      expect(desert.oasisSpots?.length).toBe(3);

      // Verify analytical normal agrees closely with finite-difference gradient
      const x = 42;
      const z = -28;
      const s = desert.sampler.sample(x, z);
      const eps = 0.05;
      const dhdx = (desert.sampler.sample(x + eps, z).height - desert.sampler.sample(x - eps, z).height) / (2 * eps);
      const dhdz = (desert.sampler.sample(x, z + eps).height - desert.sampler.sample(x, z - eps).height) / (2 * eps);
      const len = Math.hypot(dhdx, 1, dhdz);
      expect(s.normal.x).toBeCloseTo(-dhdx / len, 2);
      expect(s.normal.y).toBeCloseTo(1 / len, 2);
      expect(s.normal.z).toBeCloseTo(-dhdz / len, 2);
    }

    const desertT1 = createTerrainSampler('Desert', 1, 777);
    const windA = sampleDesertTornadoes(12.5, 777, desertT1.sampler.arenaRadius, desertT1.sampler);
    const windB = sampleDesertTornadoes(12.5, 777, desertT1.sampler.arenaRadius, desertT1.sampler);
    expect(windA).toEqual(windB);
    expect(windA.tornadoes.length).toBeGreaterThanOrEqual(3);

    // Place player inside first tornado vortex and confirm updraft + swirl impulse
    const eng = createSimEngine();
    const dState = eng.initRun({ seed: 777, characterId: 'TonyMcZoom', mapId: 'Desert', mapTier: 1 });
    const vortex = windA.tornadoes[0]!;
    dState.player.pos = { x: vortex.pos.x + 2, y: vortex.pos.y + 1, z: vortex.pos.z };
    dState.player.vel = { x: 0, y: 0, z: 0 };
    const wRes = applyWindField(dState.player, windA, FIXED_DT);
    expect(wRes.affected).toBe(true);
    expect(wRes.inVortex).toBe(true);
    expect(wRes.updraftDeltaVy).toBeGreaterThan(0);
    expect(dState.player.vel.y).toBeGreaterThan(0);

    // 3. Graveyard 19x19 + 6 darknessLampSpots + cryptEscapeZone pressure plates
    const graveyard = createTerrainSampler('Graveyard', 1, 303);
    expect(graveyard.worldBounds?.gridSize).toBe(GRAVEYARD_GRID_SIZE);
    expect(graveyard.worldBounds?.worldSpan).toBe(380);
    expect(graveyard.sampler.arenaRadius).toBe(185);
    expect(graveyard.darknessLampSpots).toHaveLength(6);
    expect(graveyard.cryptEscapeZone?.pressurePlates).toHaveLength(4);
    expect(graveyard.sampler.sample(0, 100).surfaceTag).toBe('crypt');
    expect(graveyard.sampler.sample(0, 0).surfaceTag).toBe('stone');

    // 4. FinalBossMap 11 pylonPositions
    const citadel = createTerrainSampler('FinalBossMap', 1, 404);
    expect(citadel.sampler.arenaRadius).toBe(115);
    expect(citadel.pylonPositions).toHaveLength(FINAL_BOSS_PYLON_COUNT);
    expect(citadel.rails).toHaveLength(4);
    expect(citadel.jumpPads).toHaveLength(6);

    // 5. Exhaustive zero-NaN sweep across all 4 biomes including NaN/Infinity edge queries
    const allMaps: MapId[] = ['Forest', 'Desert', 'Graveyard', 'FinalBossMap'];
    for (const mapId of allMaps) {
      const bundle = createTerrainSampler(mapId, 1, 555);
      assertAllFiniteNumbers(bundle.rails, `${mapId}.rails`);
      assertAllFiniteNumbers(bundle.jumpPads, `${mapId}.jumpPads`);
      assertAllFiniteNumbers(bundle.interactableSpots, `${mapId}.interactableSpots`);
      assertAllFiniteNumbers(bundle.bossArenaCenter, `${mapId}.bossArenaCenter`);

      for (let gx = -180; gx <= 180; gx += 30) {
        for (let gz = -180; gz <= 180; gz += 30) {
          const sample = bundle.sampler.sample(gx, gz);
          assertAllFiniteNumbers(sample, `${mapId}.sample(${gx},${gz})`);
        }
      }
      // NaN / Infinity safety
      const nanSample = bundle.sampler.sample(Number.NaN, Number.POSITIVE_INFINITY);
      assertAllFiniteNumbers(nanSample, `${mapId}.nanSample`);
      expect(nanSample.inBounds).toBe(false);
      expect(nanSample.surfaceTag).toBe('void');
    }
  });
});
