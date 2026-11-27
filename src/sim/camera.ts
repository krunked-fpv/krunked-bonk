/**
 * KRUNKEDBONK — Pure Math Camera Rig Solver (1st/3rd Orbit, Terrain Pull-In, Speed FOV & MilkShake)
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 *
 * Wave 2 additions (100% backward-compatible):
 * - Optional `blindChallenge` fog/visibility & claustrophobic FOV squeeze hint
 * - Optional `darknessActive` visibility hint (Graveyard Big Bob Darkness phase)
 * - Smooth boss-arena 3rd-person camera pull-back (`bossArenaActive` / `stepBossCameraPullback`)
 */

import {
  CAMERA_1ST_EYE_HEIGHT,
  CAMERA_3RD_OFFSET_Y,
  CAMERA_3RD_OFFSET_Z,
  FOV_MAX,
  FOV_MIN,
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CROUCH_SCALE,
  type CameraMode,
  type ITerrainSampler,
  type PlayerState,
  type RenderSettings,
  type Vec3,
} from '../contracts/index';

export interface CameraRigOptions {
  /** Blind challenge mode: applies claustrophobic FOV squeeze (-8 deg) & dense fog hint */
  blindChallenge?: boolean;
  /** Graveyard Big Bob Darkness phase visibility squeeze hint */
  darknessActive?: boolean;
  /** Boss arena active (Stage Boss / Big Bob / Final Boss): pulls 3rd-person camera smoothly back */
  bossArenaActive?: boolean;
  /** Optional explicit normalized blend [0..1] for boss pull-back */
  bossPullbackFactor?: number;
  /** Maximum extra pull-back distance in meters for boss arenas (default 4.5m) */
  bossPullbackDistance?: number;
  /** Previous smoothed pull-back offset in meters (used with `dtSec` for continuous damping) */
  prevBossPullbackOffset?: number;
  /** Elapsed frame delta in seconds for smooth pull-back damping */
  dtSec?: number;
}

export interface CameraRig {
  position: Vec3;
  lookTarget: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fovDeg: number;
  mode: CameraMode;
  actualDistance: number;
  shakeOffset: Vec3;
  shakeRollRad: number;
  /** Fog density multiplier hint for the renderer (1.0 normal, ~4.2 Blind challenge, ~2.8 Darkness) */
  fogDensityMultiplier?: number;
  /** Suggested maximum visibility radius in meters when Blind or Darkness is active */
  visibilityRadiusHint?: number;
  /** True when Blind challenge camera/fog hint is active */
  blindChallengeActive?: boolean;
  /** Smooth pull-back distance applied for boss arenas in meters */
  bossPullbackOffset?: number;
}

export interface MilkShakeState {
  trauma: number;
  phaseSec: number;
  decayRate: number;
}

const MIN_TERRAIN_CLEARANCE = 0.65;
const MIN_3RD_PULL_DISTANCE = 1.8;
const MAX_3RD_BASE_DISTANCE = 24.0;
const MAX_3RD_BOSS_DISTANCE = 28.5;
const DEFAULT_BOSS_PULLBACK_DIST = 4.5;
const BOSS_PULLBACK_SMOOTH_RATE = 3.5;
const BLIND_CHALLENGE_FOV_DELTA_DEG = -8.0;
const BLIND_CHALLENGE_FOG_MULT = 4.2;
const BLIND_CHALLENGE_VISIBILITY_RADIUS = 16.0;
const DARKNESS_FOG_MULT = 2.8;
const DARKNESS_VISIBILITY_RADIUS = 28.0;
const RAYMARCH_STEPS = 12;
const SPEED_FOV_START = 11.5;
const SPEED_FOV_FULL = 28.0;
const SPEED_FOV_MAX_KICK_DEG = 12.0;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Shortest-arc angular interpolation in radians. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) {
    diff -= Math.PI * 2;
  } else if (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return a + diff * t;
}

/**
 * Create a spring-damped `MilkShake` trauma tracker.
 */
export function createMilkShakeState(decayRate = 2.4): MilkShakeState {
  return { trauma: 0, phaseSec: 0, decayRate };
}

/**
 * Add impact trauma in `[0..1]` (additive, clamped to 1).
 */
export function addShakeTrauma(shake: MilkShakeState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  shake.trauma = clamp(shake.trauma + amount, 0, 1);
}

/**
 * Advance `MilkShake` decay deterministically by `dtSec`.
 */
export function stepMilkShake(shake: MilkShakeState, dtSec: number): void {
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return;
  }
  shake.phaseSec += dtSec;
  shake.trauma = Math.max(0, shake.trauma - shake.decayRate * dtSec);
}

/**
 * Deterministically smooth 3rd-person boss-arena camera pull-back distance in meters.
 */
export function stepBossCameraPullback(
  currentOffset: number,
  bossArenaActive: boolean,
  dtSec: number,
  maxPullback = DEFAULT_BOSS_PULLBACK_DIST,
): number {
  const safeCurrent = Number.isFinite(currentOffset) ? Math.max(0, currentOffset) : 0;
  const safeMax = Number.isFinite(maxPullback) ? clamp(maxPullback, 0, 10.0) : DEFAULT_BOSS_PULLBACK_DIST;
  const target = bossArenaActive ? safeMax : 0;
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return safeCurrent;
  }
  const alpha = 1 - Math.exp(-BOSS_PULLBACK_SMOOTH_RATE * dtSec);
  const next = lerp(safeCurrent, target, alpha);
  return Math.abs(next - target) < 0.005 ? target : next;
}

/**
 * Solve interpolated 1st-person or 3rd-person orbit camera rig with:
 * - Classic 50 Hz snap support (`settings.classic50HzSnap` forces `alpha = 1.0`)
 * - 3rd-person spring-arm terrain collision pull-in (camera never clips underground)
 * - Smooth boss-arena pull-back support (`options.bossArenaActive`)
 * - Dynamic speed FOV kick (`+0..12 deg` during high-speed slides, bhops, and rail grinds)
 * - Optional `blindChallenge` / `darknessActive` fog & FOV hints
 * - Deterministic spring-damped `MilkShake` translational & roll trauma offset
 */
export function computeCameraRig(
  prevPlayer: Readonly<PlayerState>,
  currPlayer: Readonly<PlayerState>,
  interpAlpha: number,
  settings: Readonly<RenderSettings>,
  terrain: ITerrainSampler | null,
  shakeTrauma: number,
  shakePhaseSec?: number,
  options?: CameraRigOptions,
): CameraRig {
  const alpha = settings.classic50HzSnap ? 1.0 : clamp(Number.isFinite(interpAlpha) ? interpAlpha : 1.0, 0, 1);

  // Interpolate player transform
  const px = lerp(prevPlayer.pos.x, currPlayer.pos.x, alpha);
  const py = lerp(prevPlayer.pos.y, currPlayer.pos.y, alpha);
  const pz = lerp(prevPlayer.pos.z, currPlayer.pos.z, alpha);
  const yaw = lerpAngle(prevPlayer.yaw, currPlayer.yaw, alpha);
  const pitch = clamp(lerp(prevPlayer.pitch, currPlayer.pitch, alpha), -1.45, 1.45);

  const vx = lerp(prevPlayer.vel.x, currPlayer.vel.x, alpha);
  const vz = lerp(prevPlayer.vel.z, currPlayer.vel.z, alpha);
  const horizSpeed = Math.hypot(vx, vz);

  const capHeight = lerp(prevPlayer.capsuleHeight, currPlayer.capsuleHeight, alpha);
  const heightRatio = clamp(capHeight / PLAYER_CAPSULE_HEIGHT, PLAYER_CROUCH_SCALE, 2.0);

  // Right-handed Y-up camera basis (yaw=0 looks along -Z, right is +X)
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);

  const forward: Vec3 = {
    x: -sinY * cosP,
    y: sinP,
    z: -cosY * cosP,
  };
  const right: Vec3 = {
    x: cosY,
    y: 0,
    z: -sinY,
  };
  const up: Vec3 = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };

  // Visibility & Blind challenge hints
  const blindChallengeActive = Boolean(options?.blindChallenge);
  const darknessActive = Boolean(options?.darknessActive);
  let fogDensityMultiplier = 1.0;
  let visibilityRadiusHint: number | undefined;
  if (blindChallengeActive) {
    fogDensityMultiplier = BLIND_CHALLENGE_FOG_MULT;
    visibilityRadiusHint = BLIND_CHALLENGE_VISIBILITY_RADIUS;
  } else if (darknessActive) {
    fogDensityMultiplier = DARKNESS_FOG_MULT;
    visibilityRadiusHint = DARKNESS_VISIBILITY_RADIUS;
  }

  // Smooth boss-arena pull-back calculation
  let bossPullbackOffset = 0;
  if (options) {
    const maxPullback = clamp(
      Number.isFinite(options.bossPullbackDistance)
        ? (options.bossPullbackDistance as number)
        : DEFAULT_BOSS_PULLBACK_DIST,
      0,
      10.0,
    );
    if (options.prevBossPullbackOffset !== undefined && options.dtSec !== undefined) {
      bossPullbackOffset = stepBossCameraPullback(
        options.prevBossPullbackOffset,
        Boolean(options.bossArenaActive),
        options.dtSec,
        maxPullback,
      );
    } else if (options.bossPullbackFactor !== undefined && Number.isFinite(options.bossPullbackFactor)) {
      bossPullbackOffset = maxPullback * smoothstep01(options.bossPullbackFactor);
    } else if (options.bossArenaActive) {
      bossPullbackOffset = maxPullback;
    }
  }

  // Dynamic speed FOV kick (+0..12 deg during high-speed slide/bhop/grind), with optional Blind squeeze
  const baseFov = clamp(
    settings.fov + (blindChallengeActive ? BLIND_CHALLENGE_FOV_DELTA_DEG : 0),
    FOV_MIN,
    FOV_MAX,
  );
  const speedNorm = clamp((horizSpeed - SPEED_FOV_START) / (SPEED_FOV_FULL - SPEED_FOV_START), 0, 1);
  const kineticBonus =
    currPlayer.movementState === 'Sliding' || currPlayer.movementState === 'Grinding' ? 1.5 : 0;
  const fovKick = Math.min(
    SPEED_FOV_MAX_KICK_DEG,
    speedNorm * (2 - speedNorm) * SPEED_FOV_MAX_KICK_DEG + kineticBonus * speedNorm,
  );
  const fovDeg = baseFov + fovKick;

  // Spring-damped MilkShake offset (quadratic trauma curve, deterministic harmonic oscillators)
  const clampedTrauma = clamp(Number.isFinite(shakeTrauma) ? shakeTrauma : 0, 0, 1);
  const shakeIntensity = clamp(settings.screenShakeIntensity, 0, 2);
  const amp = clampedTrauma * clampedTrauma * shakeIntensity;
  const phase =
    shakePhaseSec !== undefined && Number.isFinite(shakePhaseSec)
      ? shakePhaseSec
      : px * 0.63 + pz * 0.71 + clampedTrauma * 19.0;

  const localShakeX = (Math.sin(phase * 47.0) * 0.6 + Math.sin(phase * 83.0 + 1.3) * 0.4) * 0.42 * amp;
  const localShakeY = (Math.cos(phase * 53.0 + 0.7) * 0.6 + Math.sin(phase * 97.0 + 2.1) * 0.4) * 0.36 * amp;
  const localShakeZ = Math.sin(phase * 39.0 + 2.7) * 0.16 * amp;
  const shakeRollRad = Math.sin(phase * 43.0 + 0.4) * 0.045 * amp;

  const shakeOffset: Vec3 = {
    x: right.x * localShakeX + up.x * localShakeY + forward.x * localShakeZ,
    y: right.y * localShakeX + up.y * localShakeY + forward.y * localShakeZ,
    z: right.z * localShakeX + up.z * localShakeY + forward.z * localShakeZ,
  };

  // 1st-Person Camera
  if (settings.cameraMode === 'first') {
    const eyeY = py + CAMERA_1ST_EYE_HEIGHT * heightRatio;
    const position: Vec3 = {
      x: px + shakeOffset.x,
      y: eyeY + shakeOffset.y,
      z: pz + shakeOffset.z,
    };
    const lookTarget: Vec3 = {
      x: position.x + forward.x * 24.0,
      y: position.y + forward.y * 24.0,
      z: position.z + forward.z * 24.0,
    };

    return {
      position,
      lookTarget,
      forward,
      right,
      up,
      fovDeg,
      mode: 'first',
      actualDistance: 0,
      shakeOffset,
      shakeRollRad,
      fogDensityMultiplier,
      visibilityRadiusHint,
      blindChallengeActive,
      bossPullbackOffset: 0,
    };
  }

  // 3rd-Person Orbit Camera (default z = 11.0, y = 3.2) with boss pull-back & terrain pull-in
  const baseDesiredDist = clamp(
    Number.isFinite(settings.cameraDistance) && settings.cameraDistance > 0
      ? settings.cameraDistance
      : CAMERA_3RD_OFFSET_Z,
    MIN_3RD_PULL_DISTANCE,
    MAX_3RD_BASE_DISTANCE,
  );
  const desiredDist = clamp(
    baseDesiredDist + bossPullbackOffset,
    MIN_3RD_PULL_DISTANCE,
    MAX_3RD_BOSS_DISTANCE,
  );

  const pivotHeight = CAMERA_3RD_OFFSET_Y * Math.max(0.68, heightRatio) + bossPullbackOffset * 0.18;
  const pivotX = px;
  const pivotY = py + pivotHeight;
  const pivotZ = pz;

  const backX = -forward.x;
  const backY = -forward.y;
  const backZ = -forward.z;

  let actualDistance = desiredDist;
  if (terrain !== null) {
    for (let step = 1; step <= RAYMARCH_STEPS; step++) {
      const dist = (desiredDist * step) / RAYMARCH_STEPS;
      const sx = pivotX + backX * dist;
      const sy = pivotY + backY * dist;
      const sz = pivotZ + backZ * dist;
      const sample = terrain.sample(sx, sz);

      if (sy < sample.height + MIN_TERRAIN_CLEARANCE) {
        const prevClear = (desiredDist * (step - 1)) / RAYMARCH_STEPS;
        actualDistance = Math.max(MIN_3RD_PULL_DISTANCE, prevClear);
        break;
      }
    }
  }

  let camX = pivotX + backX * actualDistance + shakeOffset.x;
  let camY = pivotY + backY * actualDistance + shakeOffset.y;
  let camZ = pivotZ + backZ * actualDistance + shakeOffset.z;

  // Hard floor guarantee: camera NEVER clips underground even after shake or steep cliff lookup
  if (terrain !== null) {
    const finalGround = terrain.sample(camX, camZ);
    const minY = finalGround.height + MIN_TERRAIN_CLEARANCE;
    if (camY < minY) {
      camY = minY;
    }
  }

  const lookTarget: Vec3 = {
    x: px + forward.x * 4.0,
    y: py + 1.95 * heightRatio + forward.y * 4.0,
    z: pz + forward.z * 4.0,
  };

  return {
    position: { x: camX, y: camY, z: camZ },
    lookTarget,
    forward,
    right,
    up,
    fovDeg,
    mode: 'third',
    actualDistance,
    shakeOffset,
    shakeRollRad,
    fogDensityMultiplier,
    visibilityRadiusHint,
    blindChallengeActive,
    bossPullbackOffset,
  };
}
