/**
 * KRUNKEDBONK — 50 Hz Deterministic Kinetic Movement & Physics Engine (Wave 2 Full Roster)
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 *
 * Implements:
 * - Quake-style AirAccelerate (tangential speed building without hard air bleed)
 * - Slope Crouch-Sliding (7.0 m/s threshold, 0.55x height, downhill gravity boost up to 2.4x+)
 * - Bunny-Hopping (0.14s landing window, momentum preservation, streak boost)
 * - Coyote Time (0.12s), Jump Input Buffer (0.12s), Extra Aerial Jumps
 * - Wall-Climbing (0.25s cooldown; unlimited 0s CD for Monke via infiniteWallClimb)
 * - Character Physics Modes:
 *   * Birdo (`canGlide`): hold jump while falling smoothly caps descent at -3.6 m/s
 *   * Roberto / Vlad (`slightFloat`): gentler gravity -15.5 m/s^2
 *   * Spaceman (`lowGravity`): low moon gravity -12.8 m/s^2
 *   * TonyMcZoom (`hoverboard`): smooth low-friction carving + distance-moved accumulator
 *   * Weird Controls challenge (`weirdControls`): flips moveX / moveZ input axes
 *   * AFK / Idle tracking (`afkStanding`): continuous stand-still duration for IdleJuice / Campfire / AFK Gaming
 * - Desert Wind & Tornado Vortex updraft/knockback helper (`applyWindField`)
 * - Spline Rail-Grinding (>= 20.0 m/s tangent lock, jump-off forward+vertical launch)
 * - Jump Pads (vy = 24.0 m/s)
 * - Fall Damage (> 22.0 m/s downward impact; 100% immune while sliding, grinding, or on jump pad)
 * - VerifyPosition() Unstuck Failsafe (NaN, floor penetration, out-of-arena recovery to safePos)
 */

import {
  BHOP_WINDOW_SEC,
  COYOTE_TIME_SEC,
  FALL_DAMAGE_SPEED_THRESHOLD,
  FIXED_DT,
  GRAVITY,
  JUMP_BUFFER_SEC,
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_CROUCH_SCALE,
  RAIL_GRIND_SPEED,
  SLIDE_DOWNHILL_MAX_MULT,
  SLIDE_SPEED_THRESHOLD,
  WALL_CLIMB_COOLDOWN_SEC,
  type CharacterId,
  type InputFrame,
  type ITerrainSampler,
  type PlayerState,
  type RailSplineDef,
  type SimEvent,
  type SimState,
  type Vec3,
} from '../contracts/index';
import type { DesertTornadoField, DesertTornadoVortex } from './terrain';

export interface CharacterPhysicsFlags {
  /** Monke: unlimited wall climbs with 0s cooldown */
  infiniteWallClimb?: boolean;
  /** Birdo: hold jump while falling smoothly caps descent speed at -3.6 m/s */
  canGlide?: boolean;
  /** Roberto / Vlad: gentler gravity (-15.5 m/s^2) */
  slightFloat?: boolean;
  /** Spaceman: low moon gravity (-12.8 m/s^2) */
  lowGravity?: boolean;
  /** TonyMcZoom: smooth low-friction hoverboard carving + distance-moved accumulator */
  hoverboard?: boolean;
  /** Weird Controls challenge: flips moveX and moveZ axes */
  weirdControls?: boolean;
  /** Tracks continuous stand-still duration for IdleJuice / Campfire / AFK Gaming */
  afkStanding?: boolean;
}

export interface PhysicsStepResult {
  /** Horizontal distance moved on this tick in meters (0 on unstuck teleport) */
  distanceMoved: number;
  /** Cumulative hoverboard distance moved in meters (tracked when `hoverboard` flag is set) */
  hoverboardDistanceTotal: number;
  /** Continuous stand-still duration in seconds */
  afkStandDurationSec: number;
  /** True if player stood still this tick */
  isStandingStill: boolean;
  /** True if Birdo glide actively capped vertical descent this tick */
  isGliding: boolean;
  /** Effective vertical gravity used this tick (m/s^2) */
  effectiveGravity: number;
}

export interface WindFieldResult {
  affected: boolean;
  inVortex: boolean;
  vortexId: number | null;
  updraftDeltaVy: number;
  knockbackSpeed: number;
}

export interface RailSample {
  pos: Vec3;
  tangent: Vec3;
}

interface KineticTelemetry {
  lastTick: number;
  hoverboardDistance: number;
  afkStandTicks: number;
}

export const GRAVITY_SLIGHT_FLOAT = -15.5 as const;
export const GRAVITY_LOW = -12.8 as const;
export const GLIDE_MAX_FALL_SPEED = 3.6 as const;

const BASE_RUN_SPEED = 11.0;
const BASE_JUMP_VY = 12.6;
const GROUND_FRICTION = 9.0;
const GROUND_ACCEL = 14.0;
const HOVERBOARD_MOVE_FRICTION = 3.2;
const HOVERBOARD_COAST_FRICTION = 4.6;
const HOVERBOARD_CARVE_ACCEL = 11.5;
const AIR_ACCEL = 8.5;
const SLIDE_FLAT_FRICTION = 1.15;
const SLIDE_DOWNHILL_FRICTION = 0.25;
const SLIDE_STEER_ACCEL = 14.0;
const SLIDE_MIN_END_SPEED = 2.8;
const MAX_WALKABLE_SLOPE_RAD = 0.88; // ~50.4 degrees
const RAIL_ATTACH_RADIUS = 1.75;
const GLIDE_SMOOTH_RATE = 14.0;

const kineticTelemetryMap = new WeakMap<PlayerState, KineticTelemetry>();

function getOrCreateTelemetry(player: PlayerState, tick: number): KineticTelemetry {
  let entry = kineticTelemetryMap.get(player);
  if (!entry || tick <= 1 || tick < entry.lastTick) {
    entry = { lastTick: tick, hoverboardDistance: 0, afkStandTicks: 0 };
    kineticTelemetryMap.set(player, entry);
  }
  return entry;
}

/** Read cumulative hoverboard distance moved (meters) for a PlayerState (e.g. TonyMcZoom Zap charge). */
export function getHoverboardDistance(player: PlayerState): number {
  return kineticTelemetryMap.get(player)?.hoverboardDistance ?? 0;
}

/** Read continuous stand-still duration (seconds) for a PlayerState (IdleJuice / Campfire / AFK Gaming). */
export function getAfkStandDuration(player: PlayerState): number {
  const ticks = kineticTelemetryMap.get(player)?.afkStandTicks ?? 0;
  return ticks * FIXED_DT;
}

/** Reset tracked hoverboard distance & AFK duration (e.g. after TonyMcZoom Zap discharge or run reset). */
export function resetKineticTelemetry(
  player: PlayerState,
  options?: { hoverboardOnly?: boolean; afkOnly?: boolean },
): void {
  const entry = kineticTelemetryMap.get(player);
  if (!entry) {
    return;
  }
  if (!options?.afkOnly) {
    entry.hoverboardDistance = 0;
  }
  if (!options?.hoverboardOnly) {
    entry.afkStandTicks = 0;
  }
}

/**
 * Resolve full Wave 2 `CharacterPhysicsFlags` from character ID, passive specialFlags, and challenge ID.
 */
export function resolveCharacterPhysicsFlags(
  characterId: CharacterId,
  specialFlags?: readonly string[],
  challengeId?: string | null,
): CharacterPhysicsFlags {
  const flags = specialFlags ?? [];
  const normChallenge = (challengeId ?? '').toLowerCase();
  return {
    infiniteWallClimb:
      characterId === 'Monke' ||
      flags.includes('infinite_wall_climb') ||
      flags.includes('unlimited_wall_climb'),
    canGlide: characterId === 'Birdo' || flags.includes('glide') || flags.includes('can_glide'),
    slightFloat:
      characterId === 'Roberto' ||
      characterId === 'Vlad' ||
      flags.includes('slight_float') ||
      flags.includes('float'),
    lowGravity:
      characterId === 'Spaceman' || flags.includes('low_gravity') || flags.includes('zero_g'),
    hoverboard:
      characterId === 'TonyMcZoom' || flags.includes('hoverboard') || flags.includes('zap_hoverboard'),
    weirdControls: normChallenge === 'weird_controls' || normChallenge === 'weirdcontrols' || flags.includes('weird_controls'),
    afkStanding:
      normChallenge === 'afk_gaming' ||
      normChallenge === 'afkgaming' ||
      flags.includes('afk_standing') ||
      true,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function cloneVec3(v: Readonly<Vec3>): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function isFiniteVec3(v: Readonly<Vec3>): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function safeVec3ForEvent(v: Readonly<Vec3>): Vec3 {
  return {
    x: Number.isFinite(v.x) ? v.x : 0,
    y: Number.isFinite(v.y) ? v.y : 0,
    z: Number.isFinite(v.z) ? v.z : 0,
  };
}

function resolveEffectiveGravity(flags?: CharacterPhysicsFlags): number {
  if (flags?.lowGravity) {
    return GRAVITY_LOW; // -12.8 m/s^2 (Spaceman)
  }
  if (flags?.slightFloat) {
    return GRAVITY_SLIGHT_FLOAT; // -15.5 m/s^2 (Roberto / Vlad)
  }
  return GRAVITY; // -19.62 m/s^2
}

/**
 * Sample position and unit tangent along a polyline `RailSplineDef` at normalized `t` in `[0, 1]`.
 */
export function evaluateRailSpline(rail: Readonly<RailSplineDef>, t: number): RailSample {
  const pts = rail.points;
  if (pts.length === 0) {
    return { pos: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: -1 } };
  }
  if (pts.length === 1) {
    return { pos: cloneVec3(pts[0]), tangent: { x: 0, y: 0, z: -1 } };
  }

  const clampedT = clamp(t, 0, 1);
  const totalLen = rail.totalLength > 1e-5 ? rail.totalLength : 1;
  const targetDist = clampedT * totalLen;

  let accum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dy, dz);
    if (segLen <= 1e-6) {
      continue;
    }

    if (accum + segLen >= targetDist || i === pts.length - 1) {
      const localT = clamp((targetDist - accum) / segLen, 0, 1);
      const invLen = 1 / segLen;
      return {
        pos: {
          x: a.x + dx * localT,
          y: a.y + dy * localT,
          z: a.z + dz * localT,
        },
        tangent: {
          x: dx * invLen,
          y: dy * invLen,
          z: dz * invLen,
        },
      };
    }
    accum += segLen;
  }

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const dz = last.z - prev.z;
  const invLen = 1 / Math.max(1e-6, Math.hypot(dx, dy, dz));
  return {
    pos: cloneVec3(last),
    tangent: { x: dx * invLen, y: dy * invLen, z: dz * invLen },
  };
}

/**
 * Find the closest point and normalized parameter `t` on a rail spline to `pos`.
 */
function findClosestPointOnRail(
  rail: Readonly<RailSplineDef>,
  pos: Readonly<Vec3>,
): { distSq: number; t: number; point: Vec3; tangent: Vec3 } {
  const pts = rail.points;
  const totalLen = Math.max(1e-5, rail.totalLength);
  let bestDistSq = Infinity;
  let bestT = 0;
  let bestPoint: Vec3 = pts[0] ? cloneVec3(pts[0]) : { x: 0, y: 0, z: 0 };
  let bestTangent: Vec3 = { x: 0, y: 0, z: -1 };

  let accum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const segLenSq = abx * abx + aby * aby + abz * abz;
    if (segLenSq <= 1e-8) {
      continue;
    }
    const segLen = Math.sqrt(segLenSq);
    const apx = pos.x - a.x;
    const apy = pos.y - a.y;
    const apz = pos.z - a.z;
    const segU = clamp((apx * abx + apy * aby + apz * abz) / segLenSq, 0, 1);

    const cx = a.x + abx * segU;
    const cy = a.y + aby * segU;
    const cz = a.z + abz * segU;
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const dz = pos.z - cz;
    const dSq = dx * dx + dy * dy + dz * dz;

    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestT = clamp((accum + segU * segLen) / totalLen, 0, 1);
      bestPoint = { x: cx, y: cy, z: cz };
      const invLen = 1 / segLen;
      bestTangent = { x: abx * invLen, y: aby * invLen, z: abz * invLen };
    }
    accum += segLen;
  }

  return { distSq: bestDistSq, t: bestT, point: bestPoint, tangent: bestTangent };
}

/**
 * Desert tornado updraft, swirl, and ambient sandstorm knockback helper.
 * Cleanly callable from `engine.ts` right after `stepPlayerPhysics` on Desert stages.
 */
export function applyWindField(
  player: PlayerState,
  tornadoes: Readonly<DesertTornadoField> | readonly DesertTornadoVortex[],
  dt: number = FIXED_DT,
): WindFieldResult {
  if (player.dead || !Number.isFinite(dt) || dt <= 0 || player.railId !== null) {
    return { affected: false, inVortex: false, vortexId: null, updraftDeltaVy: 0, knockbackSpeed: 0 };
  }
  if (!isFiniteVec3(player.pos) || !isFiniteVec3(player.vel)) {
    return { affected: false, inVortex: false, vortexId: null, updraftDeltaVy: 0, knockbackSpeed: 0 };
  }

  const isField = !Array.isArray(tornadoes);
  const vortexList: readonly DesertTornadoVortex[] = isField
    ? (tornadoes as Readonly<DesertTornadoField>).tornadoes
    : (tornadoes as readonly DesertTornadoVortex[]);

  let affected = false;
  let inVortex = false;
  let vortexId: number | null = null;
  let updraftDeltaVy = 0;

  // 1. Ambient sandstorm crosswind gust (gentle push during intense storms)
  if (isField) {
    const field = tornadoes as Readonly<DesertTornadoField>;
    if (field.sandstormIntensity > 0.35 && isFiniteVec3(field.windDir)) {
      const gustScale = (field.sandstormIntensity - 0.35) * (player.grounded ? 1.4 : 2.8);
      player.vel.x += field.windDir.x * gustScale * dt;
      player.vel.z += field.windDir.z * gustScale * dt;
      affected = true;
    }
  }

  // 2. Active roaming tornado vortex updraft + swirl/knockback
  let dvxTotal = 0;
  let dvzTotal = 0;

  for (let i = 0; i < vortexList.length; i++) {
    const v = vortexList[i];
    if (!v || v.radius <= 0 || v.intensity <= 0 || !isFiniteVec3(v.pos)) {
      continue;
    }
    const dx = player.pos.x - v.pos.x;
    const dz = player.pos.z - v.pos.z;
    const distSq = dx * dx + dz * dz;
    const radiusSq = v.radius * v.radius;
    if (distSq >= radiusSq) {
      continue;
    }

    const relY = player.pos.y - v.pos.y;
    if (relY < -10.0 || relY > v.height) {
      continue;
    }

    const dist = Math.sqrt(distSq);
    const normDist = dist / v.radius; // 0 at eye, 1 at rim
    const falloff = 1 - normDist * normDist;
    const strength = clamp(falloff * v.intensity, 0, 1.25);

    // Upward suction & aerial launch
    const dvY = v.updraftStrength * strength * dt;
    if (player.grounded && strength > 0.22) {
      player.grounded = false;
      player.coyoteTimer = 0;
      player.vel.y = Math.max(player.vel.y, 4.8 * strength);
    }
    const nextVy = Math.min(26.0, player.vel.y + dvY);
    updraftDeltaVy += Math.max(0, nextVy - player.vel.y);
    player.vel.y = nextVy;
    // Cushion fall speed while caught in funnel updraft
    player.peakFallSpeed = Math.min(player.peakFallSpeed, 8.0);

    // Tangential swirl + core outward knockback fling
    const rx = dist > 1e-4 ? dx / dist : 1;
    const rz = dist > 1e-4 ? dz / dist : 0;
    const tx = -rz * v.spinDir;
    const tz = rx * v.spinDir;
    const radialFactor = normDist < 0.38 ? 0.9 : -0.22;

    const impulseX = (tx * 0.88 + rx * radialFactor) * v.swirlStrength * strength * dt;
    const impulseZ = (tz * 0.88 + rz * radialFactor) * v.swirlStrength * strength * dt;
    player.vel.x += impulseX;
    player.vel.z += impulseZ;
    dvxTotal += impulseX;
    dvzTotal += impulseZ;

    affected = true;
    inVortex = true;
    if (vortexId === null) {
      vortexId = v.id;
    }
  }

  // Clamp runaway horizontal wind velocity safely
  const hSpd = Math.hypot(player.vel.x, player.vel.z);
  const maxWindHorizSpeed = 42.0;
  if (hSpd > maxWindHorizSpeed) {
    const s = maxWindHorizSpeed / hSpd;
    player.vel.x *= s;
    player.vel.z *= s;
  }

  return {
    affected,
    inVortex,
    vortexId,
    updraftDeltaVy,
    knockbackSpeed: Math.hypot(dvxTotal, dvzTotal),
  };
}

/**
 * Unstuck Failsafe: Detects NaN/Infinity, out-of-arena bounds, or deep floor/void penetration,
 * snapping the player safely back to `safePos` (or spawn), zeroing velocity, emitting
 * `player_unstuck`, and incrementing `summary.unstuckRecoveries`.
 */
export function verifyPosition(
  state: SimState,
  terrain: ITerrainSampler,
  events: SimEvent[],
): boolean {
  const player = state.player;
  let reason: string | null = null;

  if (!isFiniteVec3(player.vel)) {
    player.vel = { x: 0, y: 0, z: 0 };
  }

  if (!isFiniteVec3(player.pos)) {
    reason = 'nan_position';
  } else {
    const dist2D = Math.hypot(player.pos.x, player.pos.z);
    if (!Number.isFinite(dist2D) || dist2D > terrain.arenaRadius + 4.0) {
      reason = 'out_of_bounds';
    } else {
      const floor = terrain.sample(player.pos.x, player.pos.z);
      if (player.pos.y < floor.height - 25.0) {
        reason = 'void_fall';
      } else if (player.pos.y < floor.height - 2.0) {
        reason = 'floor_penetration';
      }
    }
  }

  if (reason === null) {
    return false;
  }

  const fromPos = safeVec3ForEvent(player.pos);

  // Validate safePos before teleporting; fall back to map spawn if needed
  let targetBase: Vec3 = player.safePos;
  if (
    !isFiniteVec3(targetBase) ||
    Math.hypot(targetBase.x, targetBase.z) > terrain.arenaRadius - 2.0
  ) {
    targetBase = terrain.getSpawnPoint();
  }
  const safeSample = terrain.sample(targetBase.x, targetBase.z);
  const toPos: Vec3 = {
    x: targetBase.x,
    y: safeSample.height + 0.5,
    z: targetBase.z,
  };

  player.pos = cloneVec3(toPos);
  player.vel = { x: 0, y: 0, z: 0 };
  player.grounded = false;
  player.isSliding = false;
  player.railId = null;
  player.peakFallSpeed = 0;
  player.coyoteTimer = 0;
  player.safePos = { x: toPos.x, y: safeSample.height, z: toPos.z };

  state.summary.unstuckRecoveries += 1;
  events.push({
    type: 'player_unstuck',
    tick: state.tick,
    fromPos,
    toPos: cloneVec3(toPos),
    reason,
  });

  return true;
}

/**
 * Step player kinetic physics by exactly one 50 Hz fixed tick (`FIXED_DT = 0.02s`).
 */
export function stepPlayerPhysics(
  state: SimState,
  input: InputFrame,
  terrain: ITerrainSampler,
  events: SimEvent[],
  characterFlags?: CharacterPhysicsFlags,
): PhysicsStepResult {
  const player = state.player;
  const dt = FIXED_DT;
  const gravity = resolveEffectiveGravity(characterFlags);
  const telemetry = getOrCreateTelemetry(player, state.tick);

  // Snapshot previous position for smooth render interpolation & distance tracking
  player.prevPos = cloneVec3(player.pos);
  const startX = Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const startZ = Number.isFinite(player.pos.z) ? player.pos.z : 0;

  if (player.dead) {
    player.vel.x = 0;
    player.vel.y = 0;
    player.vel.z = 0;
    player.movementState = 'Idle';
    telemetry.lastTick = state.tick;
    telemetry.afkStandTicks = 0;
    return {
      distanceMoved: 0,
      hoverboardDistanceTotal: telemetry.hoverboardDistance,
      afkStandDurationSec: 0,
      isStandingStill: false,
      isGliding: false,
      effectiveGravity: gravity,
    };
  }

  // Guard against pre-existing corrupt state before stepping
  let unstuckTriggered = false;
  if (!isFiniteVec3(player.pos) || !isFiniteVec3(player.vel)) {
    unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;
  }

  // Update look orientation safely
  if (Number.isFinite(input.lookYaw)) {
    player.yaw = input.lookYaw;
  }
  if (Number.isFinite(input.lookPitch)) {
    player.pitch = clamp(input.lookPitch, -1.45, 1.45);
  }

  // Sanitize movement axes & apply Weird Controls inversion when enabled
  let moveX = Number.isFinite(input.moveX) ? clamp(input.moveX, -1, 1) : 0;
  let moveZ = Number.isFinite(input.moveZ) ? clamp(input.moveZ, -1, 1) : 0;
  if (characterFlags?.weirdControls) {
    moveX = -moveX;
    moveZ = -moveZ;
  }

  // Right-handed Y-up basis (yaw=0 looks along -Z, right is +X)
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);
  const fwdX = -sinYaw;
  const fwdZ = -cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;

  let wishX = rightX * moveX + fwdX * moveZ;
  let wishZ = rightZ * moveX + fwdZ * moveZ;
  const rawWishMag = Math.hypot(wishX, wishZ);
  const hasMoveInput = rawWishMag > 0.01;
  const wishInputScale = Math.min(1, rawWishMag);
  if (rawWishMag > 1e-6) {
    wishX /= rawWishMag;
    wishZ /= rawWishMag;
  } else {
    wishX = 0;
    wishZ = 0;
  }

  // Derived movement constants from player stats
  const moveSpeedStat = Math.max(0.25, player.stats.MoveSpeed);
  const runSpeed = BASE_RUN_SPEED * moveSpeedStat;
  const jumpVy = BASE_JUMP_VY * Math.sqrt(Math.max(0.4, player.stats.JumpHeight));
  const slideSpeedMult = Math.max(0.25, player.stats.SlideSpeedMultiplier);
  const slideAccelMult = Math.max(0.25, player.stats.SlideAcceleration);
  const slideMaxSpeed = runSpeed * SLIDE_DOWNHILL_MAX_MULT * slideSpeedMult;
  const airControl = Math.max(0.1, player.stats.AirControl);
  const extraJumpsMax = Math.max(0, Math.floor(player.stats.ExtraJumps));
  const capsuleScale =
    player.capsuleRadius > 0 ? player.capsuleRadius / PLAYER_CAPSULE_RADIUS : 1.0;
  const standingHeight = PLAYER_CAPSULE_HEIGHT * capsuleScale;

  // Update kinetic timers
  player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  player.jumpBufferTimer = input.jumpPressed
    ? JUMP_BUFFER_SEC
    : Math.max(0, player.jumpBufferTimer - dt);
  player.bhopTimer = Math.max(0, player.bhopTimer - dt);
  player.wallClimbCooldown = Math.max(0, player.wallClimbCooldown - dt);

  let isGliding = false;

  const finalizeTelemetry = (
    didUnstuck: boolean,
    finalHorizSpeed: number,
  ): PhysicsStepResult => {
    const stepDist =
      didUnstuck || !isFiniteVec3(player.pos)
        ? 0
        : Math.hypot(player.pos.x - startX, player.pos.z - startZ);

    if (characterFlags?.hoverboard && stepDist > 0) {
      telemetry.hoverboardDistance += stepDist;
    }

    const standingStill =
      player.grounded &&
      !player.isSliding &&
      player.railId === null &&
      !hasMoveInput &&
      !input.jump &&
      !input.jumpPressed &&
      finalHorizSpeed <= 0.25 &&
      stepDist <= 0.015;

    if (standingStill) {
      telemetry.afkStandTicks += 1;
    } else {
      telemetry.afkStandTicks = 0;
    }
    telemetry.lastTick = state.tick;

    return {
      distanceMoved: stepDist,
      hoverboardDistanceTotal: telemetry.hoverboardDistance,
      afkStandDurationSec: telemetry.afkStandTicks * dt,
      isStandingStill: standingStill,
      isGliding,
      effectiveGravity: gravity,
    };
  };

  // ==========================================================================
  // 1. SPLINE RAIL-GRINDING MODE
  // ==========================================================================
  if (player.railId !== null) {
    const rail = state.rails.find((r) => r.id === player.railId);
    if (!rail || rail.points.length < 2 || rail.totalLength <= 0.01) {
      player.railId = null;
    } else {
      player.peakFallSpeed = 0;
      player.grounded = false;
      player.airJumpsRemaining = extraJumpsMax;
      player.wallClimbsUsed = 0;
      player.capsuleHeight = standingHeight;

      const currentSpeed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
      const grindSpeed = Math.max(RAIL_GRIND_SPEED, currentSpeed);
      player.railT += (player.railDir * grindSpeed * dt) / rail.totalLength;

      // Jump off rail with vertical + forward boost
      if (player.jumpBufferTimer > 0) {
        const sample = evaluateRailSpline(rail, player.railT);
        const dirX = sample.tangent.x * player.railDir;
        const dirY = sample.tangent.y * player.railDir;
        const dirZ = sample.tangent.z * player.railDir;
        const launchSpeed = Math.max(grindSpeed * 1.06, RAIL_GRIND_SPEED * 1.05);

        player.vel.x = dirX * launchSpeed;
        player.vel.z = dirZ * launchSpeed;
        player.vel.y = Math.max(jumpVy * 1.05, dirY * launchSpeed + jumpVy * 0.85);
        player.pos.x = sample.pos.x + player.vel.x * dt * 0.5;
        player.pos.y = sample.pos.y + 0.35;
        player.pos.z = sample.pos.z + player.vel.z * dt * 0.5;

        const detachedId = rail.id;
        player.railId = null;
        player.jumpBufferTimer = 0;
        player.coyoteTimer = 0;

        events.push({
          type: 'player_rail_detach',
          tick: state.tick,
          pos: cloneVec3(player.pos),
          railId: detachedId,
          jumped: true,
        });

        unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;
        const hSpd = Math.hypot(player.vel.x, player.vel.z);
        if (hSpd > state.summary.topSpeedReached) {
          state.summary.topSpeedReached = hSpd;
        }
        player.movementState = 'Airborne';
        return finalizeTelemetry(unstuckTriggered, hSpd);
      }

      // Reached end of rail -> detach preserving momentum
      if (player.railT >= 1 || player.railT <= 0) {
        const clampedT = clamp(player.railT, 0, 1);
        const sample = evaluateRailSpline(rail, clampedT);
        const dirX = sample.tangent.x * player.railDir;
        const dirY = sample.tangent.y * player.railDir;
        const dirZ = sample.tangent.z * player.railDir;

        player.pos = { x: sample.pos.x, y: sample.pos.y + 0.2, z: sample.pos.z };
        player.vel = {
          x: dirX * grindSpeed,
          y: Math.max(4.0, dirY * grindSpeed + 3.0),
          z: dirZ * grindSpeed,
        };
        const detachedId = rail.id;
        player.railId = null;

        events.push({
          type: 'player_rail_detach',
          tick: state.tick,
          pos: cloneVec3(player.pos),
          railId: detachedId,
          jumped: false,
        });

        unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;
        const hSpd = Math.hypot(player.vel.x, player.vel.z);
        if (hSpd > state.summary.topSpeedReached) {
          state.summary.topSpeedReached = hSpd;
        }
        player.movementState = 'Airborne';
        return finalizeTelemetry(unstuckTriggered, hSpd);
      }

      // Continue grinding smoothly along spline
      const sample = evaluateRailSpline(rail, player.railT);
      player.pos = cloneVec3(sample.pos);
      player.vel = {
        x: sample.tangent.x * player.railDir * grindSpeed,
        y: sample.tangent.y * player.railDir * grindSpeed,
        z: sample.tangent.z * player.railDir * grindSpeed,
      };
      player.movementState = 'Grinding';

      unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;
      const hSpd = Math.hypot(player.vel.x, player.vel.z);
      if (hSpd > state.summary.topSpeedReached) {
        state.summary.topSpeedReached = hSpd;
      }
      return finalizeTelemetry(unstuckTriggered, hSpd);
    }
  }

  // ==========================================================================
  // 2. CROUCH-SLIDE STATE TRANSITIONS
  // ==========================================================================
  const groundSample = terrain.sample(player.pos.x, player.pos.z);
  const preHorizSpeed = Math.hypot(player.vel.x, player.vel.z);

  if (player.grounded) {
    const steepDownhill = groundSample.slopeAngleRad >= 0.16;
    const canEnterSlide =
      input.crouchSlide &&
      (preHorizSpeed >= SLIDE_SPEED_THRESHOLD || (steepDownhill && preHorizSpeed >= 3.0));

    if (!player.isSliding && canEnterSlide) {
      player.isSliding = true;
      player.slideTimer = 0;

      // Crisp slide initiation kick along travel/wish direction
      let dirX = preHorizSpeed > 0.5 ? player.vel.x / preHorizSpeed : wishX;
      let dirZ = preHorizSpeed > 0.5 ? player.vel.z / preHorizSpeed : wishZ;
      const dLen = Math.hypot(dirX, dirZ);
      if (dLen > 1e-4) {
        dirX /= dLen;
        dirZ /= dLen;
        const boostTarget = Math.min(slideMaxSpeed, Math.max(preHorizSpeed * 1.12, runSpeed * 1.15));
        if (boostTarget > preHorizSpeed) {
          player.vel.x = dirX * boostTarget;
          player.vel.z = dirZ * boostTarget;
        }
      }

      events.push({
        type: 'player_slide_start',
        tick: state.tick,
        pos: cloneVec3(player.pos),
        speed: Math.hypot(player.vel.x, player.vel.z),
      });
    } else if (player.isSliding) {
      player.slideTimer += dt;
      if (!input.crouchSlide || (preHorizSpeed < SLIDE_MIN_END_SPEED && !steepDownhill)) {
        player.isSliding = false;
        events.push({
          type: 'player_slide_end',
          tick: state.tick,
          pos: cloneVec3(player.pos),
        });
      }
    }
  } else if (player.isSliding && !input.crouchSlide) {
    player.isSliding = false;
    events.push({
      type: 'player_slide_end',
      tick: state.tick,
      pos: cloneVec3(player.pos),
    });
  }

  player.capsuleHeight =
    input.crouchSlide || player.isSliding
      ? standingHeight * PLAYER_CROUCH_SCALE
      : standingHeight;

  // ==========================================================================
  // 3. JUMP, BUNNY-HOP, WALL-CLIMB & EXTRA AIR JUMPS
  // ==========================================================================
  let justWallClimbed = false;
  let justJumped = false;

  // 3A. Ground / Coyote Jump & Bunny-Hop
  if (player.jumpBufferTimer > 0 && (player.grounded || player.coyoteTimer > 0)) {
    const hSpeed = Math.hypot(player.vel.x, player.vel.z);
    const isBhop = player.bhopTimer > 0 && hSpeed >= runSpeed * 0.7;

    if (isBhop) {
      player.bhopStreak += 1;
      if (player.bhopStreak > state.summary.longestBhopStreak) {
        state.summary.longestBhopStreak = player.bhopStreak;
      }

      const maxBhopSpeed = Math.max(slideMaxSpeed * 1.15, runSpeed * 2.8);
      const boostFactor = 1.0 + Math.min(0.08, 0.045 + player.bhopStreak * 0.006);
      const newSpeed = Math.min(maxBhopSpeed, hSpeed * boostFactor);

      if (hSpeed > 1e-4) {
        let dirX = player.vel.x / hSpeed;
        let dirZ = player.vel.z / hSpeed;
        if (hasMoveInput) {
          dirX = dirX * 0.78 + wishX * 0.22;
          dirZ = dirZ * 0.78 + wishZ * 0.22;
          const len = Math.hypot(dirX, dirZ);
          if (len > 1e-5) {
            dirX /= len;
            dirZ /= len;
          }
        }
        player.vel.x = dirX * newSpeed;
        player.vel.z = dirZ * newSpeed;
      }
    } else {
      if (player.isSliding && hSpeed > 1e-4) {
        const launchSpeed = Math.min(slideMaxSpeed * 1.1, hSpeed * 1.06);
        player.vel.x = (player.vel.x / hSpeed) * launchSpeed;
        player.vel.z = (player.vel.z / hSpeed) * launchSpeed;
      }
      player.bhopStreak = 0;
    }

    if (player.isSliding) {
      player.isSliding = false;
      events.push({
        type: 'player_slide_end',
        tick: state.tick,
        pos: cloneVec3(player.pos),
      });
    }

    player.vel.y = jumpVy;
    player.grounded = false;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.bhopTimer = 0;
    player.peakFallSpeed = 0;
    justJumped = true;

    events.push({
      type: 'player_jump',
      tick: state.tick,
      pos: cloneVec3(player.pos),
      isBhop,
      streak: player.bhopStreak,
      isAirJump: false,
    });
  }

  // 3B. Wall-Climb (Airborne pressing forward/into wall + jump against a steep cliff wall)
  if (!player.grounded && !justJumped) {
    const infiniteClimb = Boolean(characterFlags?.infiniteWallClimb);
    const maxClimbs = infiniteClimb
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(player.stats.WallClimbLimit));
    const wantsClimb =
      (input.jump || player.jumpBufferTimer > 0) &&
      (moveZ > 0.2 || hasMoveInput) &&
      player.wallClimbCooldown <= 0 &&
      player.wallClimbsUsed < maxClimbs;

    const climbReady = !infiniteClimb || input.jumpPressed || player.vel.y < jumpVy * 0.65;

    if (wantsClimb && climbReady) {
      const wallHit = terrain.checkWallCollision(
        player.pos,
        player.capsuleRadius + 0.25,
        player.capsuleHeight,
      );
      if (wallHit.hit) {
        const pushingIntoWall =
          moveZ > 0.2 || wishX * wallHit.normal.x + wishZ * wallHit.normal.z < -0.15;
        if (pushingIntoWall) {
          player.vel.y = Math.max(player.vel.y, jumpVy * 1.05);
          player.vel.x = player.vel.x * 0.5 + wallHit.normal.x * 1.2 + wishX * 2.5;
          player.vel.z = player.vel.z * 0.5 + wallHit.normal.z * 1.2 + wishZ * 2.5;
          player.wallClimbsUsed += 1;
          player.wallClimbCooldown = infiniteClimb ? 0 : WALL_CLIMB_COOLDOWN_SEC;
          player.jumpBufferTimer = 0;
          player.peakFallSpeed = 0;
          justWallClimbed = true;

          events.push({
            type: 'player_wall_climb',
            tick: state.tick,
            pos: cloneVec3(player.pos),
            normal: cloneVec3(wallHit.normal),
          });
        }
      }
    }
  }

  // 3C. Extra Aerial Jumps
  if (
    !player.grounded &&
    !justJumped &&
    !justWallClimbed &&
    player.jumpBufferTimer > 0 &&
    player.airJumpsRemaining > 0
  ) {
    player.airJumpsRemaining -= 1;
    player.vel.y = jumpVy * 0.96;
    player.jumpBufferTimer = 0;
    player.peakFallSpeed = 0;

    if (hasMoveInput) {
      const hSpd = Math.hypot(player.vel.x, player.vel.z);
      const targetSpd = Math.max(hSpd, runSpeed * wishInputScale);
      player.vel.x = player.vel.x * 0.4 + wishX * targetSpd * 0.6;
      player.vel.z = player.vel.z * 0.4 + wishZ * targetSpd * 0.6;
    }

    events.push({
      type: 'player_jump',
      tick: state.tick,
      pos: cloneVec3(player.pos),
      isBhop: false,
      streak: player.bhopStreak,
      isAirJump: true,
    });
  }

  // ==========================================================================
  // 4. HORIZONTAL MOVEMENT (GROUND / HOVERBOARD / SLOPE SLIDE / AIR-ACCELERATE)
  // ==========================================================================
  if (player.grounded) {
    if (player.isSliding) {
      // Slope Crouch-Sliding: project gravity along downhill direction & drop friction
      const n = groundSample.normal;
      const nHorizLen = Math.hypot(n.x, n.z);
      const sinSlope = Math.sin(groundSample.slopeAngleRad);

      let goingDownhill = false;
      if (nHorizLen > 1e-4 && sinSlope > 0.03) {
        const downX = n.x / nHorizLen;
        const downZ = n.z / nHorizLen;
        const slopeAccel = -gravity * sinSlope * slideAccelMult * 1.65;
        player.vel.x += downX * slopeAccel * dt;
        player.vel.z += downZ * slopeAccel * dt;

        const dotDown = player.vel.x * downX + player.vel.z * downZ;
        goingDownhill = dotDown > 0.5;
      }

      if (hasMoveInput) {
        player.vel.x += wishX * SLIDE_STEER_ACCEL * slideAccelMult * wishInputScale * dt;
        player.vel.z += wishZ * SLIDE_STEER_ACCEL * slideAccelMult * wishInputScale * dt;
      }

      const flatDrag = characterFlags?.hoverboard ? SLIDE_FLAT_FRICTION * 0.78 : SLIDE_FLAT_FRICTION;
      const drag = goingDownhill ? SLIDE_DOWNHILL_FRICTION : flatDrag;
      const damping = Math.max(0, 1 - drag * dt);
      player.vel.x *= damping;
      player.vel.z *= damping;

      const newSpd = Math.hypot(player.vel.x, player.vel.z);
      if (newSpd > slideMaxSpeed) {
        const capped = Math.max(slideMaxSpeed, newSpd - (newSpd - slideMaxSpeed) * Math.min(1, 6.0 * dt));
        const scale = Math.min(capped, slideMaxSpeed * 1.08) / newSpd;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }
    } else if (characterFlags?.hoverboard) {
      // TonyMcZoom Hoverboard: smooth low-friction carving with momentum-preserving turns
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const baseHoverFriction = hasMoveInput ? HOVERBOARD_MOVE_FRICTION : HOVERBOARD_COAST_FRICTION;
      const friction = player.bhopTimer > 0 ? baseHoverFriction * 0.45 : baseHoverFriction;
      if (speed > 1e-4) {
        const control = Math.max(speed, 2.5);
        const drop = control * friction * dt;
        const scale = Math.max(0, speed - drop) / speed;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }

      if (hasMoveInput) {
        const wishSpeed = (input.crouchSlide ? runSpeed * 0.65 : runSpeed * 1.06) * wishInputScale;
        const currentProj = player.vel.x * wishX + player.vel.z * wishZ;
        const addSpeed = wishSpeed - currentProj;
        if (addSpeed > 0) {
          const accelSpeed = Math.min(addSpeed, HOVERBOARD_CARVE_ACCEL * wishSpeed * dt);
          player.vel.x += accelSpeed * wishX;
          player.vel.z += accelSpeed * wishZ;
        }
        // Subtle lateral carving alignment so tight hoverboard curves feel fluid and arc cleanly
        const curSpd = Math.hypot(player.vel.x, player.vel.z);
        if (curSpd > 1.0) {
          const blend = Math.min(1, 3.8 * dt);
          const dirX = player.vel.x / curSpd;
          const dirZ = player.vel.z / curSpd;
          const nx = dirX + (wishX - dirX) * blend;
          const nz = dirZ + (wishZ - dirZ) * blend;
          const nLen = Math.hypot(nx, nz);
          if (nLen > 1e-5) {
            player.vel.x = (nx / nLen) * curSpd;
            player.vel.z = (nz / nLen) * curSpd;
          }
        }
      }
    } else {
      // Standard ground movement with snappy friction & acceleration
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const friction = player.bhopTimer > 0 ? GROUND_FRICTION * 0.35 : GROUND_FRICTION;
      if (speed > 1e-4) {
        const control = Math.max(speed, 4.0);
        const drop = control * friction * dt;
        const scale = Math.max(0, speed - drop) / speed;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }

      if (hasMoveInput) {
        const wishSpeed = (input.crouchSlide ? runSpeed * 0.55 : runSpeed) * wishInputScale;
        const currentSpeed = player.vel.x * wishX + player.vel.z * wishZ;
        const addSpeed = wishSpeed - currentSpeed;
        if (addSpeed > 0) {
          const accelSpeed = Math.min(addSpeed, GROUND_ACCEL * wishSpeed * dt);
          player.vel.x += accelSpeed * wishX;
          player.vel.z += accelSpeed * wishZ;
        }
      }
    }
  } else {
    // Airborne: Quake-style AirAccelerate + gravity
    if (hasMoveInput) {
      const airWishSpeed = runSpeed * wishInputScale;
      const airCap = Math.min(airWishSpeed, runSpeed * 0.45 * airControl);
      const currentSpeed = player.vel.x * wishX + player.vel.z * wishZ;
      const addSpeed = airCap - currentSpeed;
      if (addSpeed > 0) {
        const accelSpeed = Math.min(addSpeed, AIR_ACCEL * airControl * airWishSpeed * dt);
        player.vel.x += accelSpeed * wishX;
        player.vel.z += accelSpeed * wishZ;
      }

      const hSpd = Math.hypot(player.vel.x, player.vel.z);
      if (hSpd < runSpeed * 0.85) {
        const lowAdd = Math.max(0, airWishSpeed - currentSpeed);
        const lowAccel = Math.min(lowAdd, 5.0 * airControl * runSpeed * dt);
        player.vel.x += lowAccel * wishX;
        player.vel.z += lowAccel * wishZ;
      }

      const maxAirSpeed = Math.max(46.0, slideMaxSpeed * 1.5);
      const postSpd = Math.hypot(player.vel.x, player.vel.z);
      if (postSpd > maxAirSpeed) {
        const scale = maxAirSpeed / postSpd;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }
    }

    // Apply character-specific gravity (Spaceman -12.8, Roberto/Vlad -15.5, default -19.62)
    // Birdo Glide: holding jump while falling smoothly caps descent speed at -3.6 m/s
    if (characterFlags?.canGlide && input.jump && player.vel.y <= 0) {
      if (player.vel.y >= -GLIDE_MAX_FALL_SPEED) {
        const nextVy = player.vel.y + gravity * dt;
        if (nextVy <= -GLIDE_MAX_FALL_SPEED) {
          player.vel.y = -GLIDE_MAX_FALL_SPEED;
          isGliding = true;
        } else {
          player.vel.y = nextVy;
        }
      } else {
        // Braking smoothly from a faster dive up to the -3.6 m/s glide terminal velocity
        const excess = -player.vel.y - GLIDE_MAX_FALL_SPEED;
        const dampedExcess = excess * Math.max(0, 1 - GLIDE_SMOOTH_RATE * dt);
        player.vel.y =
          dampedExcess < 0.03 ? -GLIDE_MAX_FALL_SPEED : -(GLIDE_MAX_FALL_SPEED + dampedExcess);
        isGliding = true;
      }
      if (isGliding) {
        player.peakFallSpeed = Math.min(player.peakFallSpeed, -player.vel.y);
      }
    } else {
      player.vel.y += gravity * dt;
    }

    if (player.vel.y < 0) {
      player.peakFallSpeed = Math.max(player.peakFallSpeed, -player.vel.y);
    }
  }

  // ==========================================================================
  // 5. INTEGRATE POSITION & RESOLVE CLIFF / ARENA WALL COLLISIONS
  // ==========================================================================
  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  for (let iter = 0; iter < 2; iter++) {
    const wallHit = terrain.checkWallCollision(
      player.pos,
      player.capsuleRadius,
      player.capsuleHeight,
    );
    if (!wallHit.hit) {
      break;
    }
    player.pos.x += wallHit.normal.x * wallHit.penetration;
    player.pos.z += wallHit.normal.z * wallHit.penetration;

    const vDotN = player.vel.x * wallHit.normal.x + player.vel.z * wallHit.normal.z;
    if (vDotN < 0) {
      player.vel.x -= wallHit.normal.x * vDotN;
      player.vel.z -= wallHit.normal.z * vDotN;
    }
  }

  // ==========================================================================
  // 6. JUMP PADS CHECK
  // ==========================================================================
  let justHitJumpPad = false;
  for (let i = 0; i < state.jumpPads.length; i++) {
    const pad = state.jumpPads[i];
    const dx = player.pos.x - pad.pos.x;
    const dz = player.pos.z - pad.pos.z;
    const dy = player.pos.y - pad.pos.y;
    const triggerR = pad.radius + player.capsuleRadius;

    if (
      dx * dx + dz * dz <= triggerR * triggerR &&
      dy >= -1.2 &&
      dy <= 2.4 &&
      player.vel.y < pad.launchVy * 0.7
    ) {
      if (player.isSliding) {
        player.isSliding = false;
        events.push({
          type: 'player_slide_end',
          tick: state.tick,
          pos: cloneVec3(player.pos),
        });
      }

      player.vel.y = pad.launchVy;
      if (pad.launchForwardBoost) {
        player.vel.x += pad.launchForwardBoost.x;
        player.vel.z += pad.launchForwardBoost.z;
      }
      player.grounded = false;
      player.coyoteTimer = 0;
      player.peakFallSpeed = 0;
      player.airJumpsRemaining = extraJumpsMax;
      player.wallClimbsUsed = 0;
      justHitJumpPad = true;

      events.push({
        type: 'player_jump_pad',
        tick: state.tick,
        pos: cloneVec3(player.pos),
        padId: pad.id,
      });
      break;
    }
  }

  // ==========================================================================
  // 7. SPLINE RAIL PROXIMITY ATTACH CHECK
  // ==========================================================================
  if (!justHitJumpPad && !player.grounded && player.vel.y <= 3.5 && state.rails.length > 0) {
    const attachRadiusSq = RAIL_ATTACH_RADIUS * RAIL_ATTACH_RADIUS;
    let bestRail: RailSplineDef | null = null;
    let bestDistSq = attachRadiusSq;
    let bestT = 0;
    let bestPoint: Vec3 | null = null;
    let bestTangent: Vec3 | null = null;

    for (let i = 0; i < state.rails.length; i++) {
      const rail = state.rails[i];
      if (rail.points.length < 2 || rail.totalLength <= 0.01) {
        continue;
      }
      const hit = findClosestPointOnRail(rail, player.pos);
      if (hit.distSq < bestDistSq && hit.t > 0.02 && hit.t < 0.98) {
        bestDistSq = hit.distSq;
        bestRail = rail;
        bestT = hit.t;
        bestPoint = hit.point;
        bestTangent = hit.tangent;
      }
    }

    if (bestRail !== null && bestPoint !== null && bestTangent !== null) {
      if (player.isSliding) {
        player.isSliding = false;
        events.push({
          type: 'player_slide_end',
          tick: state.tick,
          pos: cloneVec3(player.pos),
        });
      }

      const velDot = player.vel.x * bestTangent.x + player.vel.z * bestTangent.z;
      const fwdDot = fwdX * bestTangent.x + fwdZ * bestTangent.z;
      const railDir: 1 | -1 = Math.abs(velDot) > 0.5 ? (velDot >= 0 ? 1 : -1) : fwdDot >= 0 ? 1 : -1;
      const incomingSpeed = Math.hypot(player.vel.x, player.vel.z);
      const grindSpeed = Math.max(RAIL_GRIND_SPEED, incomingSpeed);

      player.railId = bestRail.id;
      player.railT = bestT;
      player.railDir = railDir;
      player.pos = cloneVec3(bestPoint);
      player.vel = {
        x: bestTangent.x * railDir * grindSpeed,
        y: bestTangent.y * railDir * grindSpeed,
        z: bestTangent.z * railDir * grindSpeed,
      };
      player.grounded = false;
      player.peakFallSpeed = 0;
      player.airJumpsRemaining = extraJumpsMax;
      player.wallClimbsUsed = 0;
      player.movementState = 'Grinding';

      events.push({
        type: 'player_rail_attach',
        tick: state.tick,
        pos: cloneVec3(player.pos),
        railId: bestRail.id,
      });

      unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;
      const hSpd = Math.hypot(player.vel.x, player.vel.z);
      if (hSpd > state.summary.topSpeedReached) {
        state.summary.topSpeedReached = hSpd;
      }
      return finalizeTelemetry(unstuckTriggered, hSpd);
    }
  }

  // ==========================================================================
  // 8. GROUND SNAP, LANDING & FALL DAMAGE
  // ==========================================================================
  if (!justHitJumpPad) {
    const postSample = terrain.sample(player.pos.x, player.pos.z);
    const walkable = postSample.inBounds && postSample.slopeAngleRad <= MAX_WALKABLE_SLOPE_RAD;

    if (player.grounded) {
      // Stick smoothly to downhill slopes, dunes & ramps unless launched off a steep cliff drop
      const maxSnapDrop = player.isSliding ? 0.95 : characterFlags?.hoverboard ? 0.72 : 0.55;
      if (walkable && player.pos.y <= postSample.height + maxSnapDrop && player.vel.y <= 1.0) {
        player.pos.y = postSample.height;
        player.vel.y = 0;
        player.groundNormal = cloneVec3(postSample.normal);
        player.coyoteTimer = COYOTE_TIME_SEC;
        player.airJumpsRemaining = extraJumpsMax;
        player.wallClimbsUsed = 0;
        if (postSample.slopeAngleRad < 0.45) {
          player.safePos = { x: player.pos.x, y: postSample.height, z: player.pos.z };
        }
      } else {
        player.grounded = false;
        player.coyoteTimer = COYOTE_TIME_SEC;
      }
    } else if (player.vel.y <= 0 && player.pos.y <= postSample.height + 0.08) {
      if (walkable) {
        const impactSpeed = Math.max(player.peakFallSpeed, -player.vel.y);
        player.pos.y = postSample.height;
        player.vel.y = 0;
        player.grounded = true;
        player.groundNormal = cloneVec3(postSample.normal);
        player.coyoteTimer = COYOTE_TIME_SEC;
        player.bhopTimer = BHOP_WINDOW_SEC;
        player.airJumpsRemaining = extraJumpsMax;
        player.wallClimbsUsed = 0;
        player.peakFallSpeed = 0;

        if (postSample.slopeAngleRad < 0.45) {
          player.safePos = { x: player.pos.x, y: postSample.height, z: player.pos.z };
        }

        events.push({
          type: 'player_land',
          tick: state.tick,
          pos: cloneVec3(player.pos),
          impactSpeed,
        });

        // Fall Damage (100% IMMUNE if crouchSlide is held or already sliding!)
        const fallImmune = input.crouchSlide || player.isSliding || Boolean(state.invincible);
        if (!fallImmune && impactSpeed > FALL_DAMAGE_SPEED_THRESHOLD) {
          const excess = impactSpeed - FALL_DAMAGE_SPEED_THRESHOLD;
          const rawDmg = excess * 2.5;
          const fallRed = clamp(player.stats.FallDamageReduction, 0, 1);
          const dmgRed = clamp(player.stats.DamageReduction, 0, 0.85);
          const finalDmg = Math.max(0, rawDmg * (1 - fallRed) * (1 - dmgRed));

          if (finalDmg > 0.05) {
            let remaining = finalDmg;
            if (player.shield > 0) {
              const absorbed = Math.min(player.shield, remaining);
              player.shield -= absorbed;
              remaining -= absorbed;
              player.shieldRegenDelay = Math.max(player.shieldRegenDelay, 3.0);
            }
            if (remaining > 0) {
              player.hp = Math.max(0, player.hp - remaining);
            }

            events.push({
              type: 'player_fall_damage',
              tick: state.tick,
              pos: cloneVec3(player.pos),
              amount: finalDmg,
              impactSpeed,
            });

            if (player.hp <= 0) {
              if (player.revivesLeft > 0) {
                player.revivesLeft -= 1;
                player.hp = Math.max(1, player.maxHp * 0.5);
                player.invulnTimer = Math.max(player.invulnTimer, 2.0);
                events.push({
                  type: 'player_revive',
                  tick: state.tick,
                  pos: cloneVec3(player.pos),
                  revivesLeft: player.revivesLeft,
                });
              } else {
                player.dead = true;
                events.push({
                  type: 'player_death',
                  tick: state.tick,
                  pos: cloneVec3(player.pos),
                });
              }
            }
          }
        }
      } else {
        // Steep unwalkable cliff face: prevent underground clipping and slide out along normal
        if (player.pos.y < postSample.height) {
          player.pos.y = postSample.height;
        }
        const n = postSample.normal;
        const vDotN = player.vel.x * n.x + player.vel.y * n.y + player.vel.z * n.z;
        if (vDotN < 0) {
          player.vel.x -= n.x * vDotN;
          player.vel.y -= n.y * vDotN;
          player.vel.z -= n.z * vDotN;
        }
        player.vel.x += n.x * 2.5 * dt;
        player.vel.z += n.z * 2.5 * dt;
      }
    }
  }

  // ==========================================================================
  // 9. VERIFY POSITION FAILSAFE & FINAL MOVEMENT STATE / TELEMETRY
  // ==========================================================================
  unstuckTriggered = verifyPosition(state, terrain, events) || unstuckTriggered;

  const finalHorizSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (finalHorizSpeed > state.summary.topSpeedReached) {
    state.summary.topSpeedReached = finalHorizSpeed;
  }

  if (player.railId !== null) {
    player.movementState = 'Grinding';
  } else if (justWallClimbed) {
    player.movementState = 'Wallrunning';
  } else if (!player.grounded) {
    player.movementState = 'Airborne';
  } else if (player.isSliding) {
    player.movementState = 'Sliding';
  } else if (input.crouchSlide) {
    player.movementState = 'Crouching';
  } else if (finalHorizSpeed > 0.35) {
    player.movementState = 'Walking';
  } else {
    player.movementState = 'Idle';
  }

  return finalizeTelemetry(unstuckTriggered, finalHorizSpeed);
}
