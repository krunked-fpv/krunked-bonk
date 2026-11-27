/**
 * KRUNKEDBONK — Pure Math Camera Rig Solver (1st/3rd Orbit, Terrain Pull-In, Speed FOV & MilkShake)
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
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
}

export interface MilkShakeState {
  trauma: number;
  phaseSec: number;
  decayRate: number;
}

const MIN_TERRAIN_CLEARANCE = 0.65;
const MIN_3RD_PULL_DISTANCE = 1.8;
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
 * Solve interpolated 1st-person or 3rd-person orbit camera rig with:
 * - Classic 50 Hz snap support (`settings.classic50HzSnap` forces `alpha = 1.0`)
 * - 3rd-person spring-arm terrain collision pull-in (camera never clips underground)
 * - Dynamic speed FOV kick (`+0..12 deg` during high-speed slides, bhops, and rail grinds)
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
  // up = right x forward
  const up: Vec3 = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };

  // Dynamic speed FOV kick (+0..12 deg during high-speed slide/bhop/grind)
  const baseFov = clamp(settings.fov, FOV_MIN, FOV_MAX);
  const speedNorm = clamp((horizSpeed - SPEED_FOV_START) / (SPEED_FOV_FULL - SPEED_FOV_START), 0, 1);
  // Smooth ease-out curve for crisp kinetic sensation
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
    };
  }

  // 3rd-Person Orbit Camera (default z = 11.0, y = 3.2) with terrain pull-in
  const desiredDist = clamp(
    Number.isFinite(settings.cameraDistance) && settings.cameraDistance > 0
      ? settings.cameraDistance
      : CAMERA_3RD_OFFSET_Z,
    MIN_3RD_PULL_DISTANCE,
    24.0,
  );

  const pivotHeight = CAMERA_3RD_OFFSET_Y * Math.max(0.68, heightRatio);
  const pivotX = px;
  const pivotY = py + pivotHeight;
  const pivotZ = pz;

  // Ray from pivot backward along -forward
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
        // Pull camera inward to previous clear distance (clamped above minimum)
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
  };
}
