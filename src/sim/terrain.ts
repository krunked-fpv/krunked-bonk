/**
 * KRUNKEDBONK — Pure Deterministic Terrain Sampler & Arena Generator (Wave 2 Full Biomes)
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 *
 * Supports all 4 biomes & all tiers at 1:1 retail parity:
 * - Forest: Stepped plateau maze with smooth downhill slide ramps & climbable cliffs
 *   * StageForest1: 15x15 @ 20m = 300m (arenaRadius 148, 8 rails, 8 jump pads)
 *   * StageForest2: 15x15 @ 22m = 330m (arenaRadius 162, 9 rails, 9 jump pads)
 *   * StageForest3: 16x16 @ 24m = 384m (arenaRadius 188, 10 rails, 10 jump pads)
 * - Desert: ProceduralMesh gradient Perlin FBM dunes with exact analytical normals
 *   * StageDesert1 & 2: scale=100, octaves=2, persistence=0.4, lacunarity=3, heightMult=11
 *   * StageDesert3:     scale=40,  octaves=2, persistence=0.5, lacunarity=3, heightMult=11
 *   * arenaRadius=160, oasis flat spots, canyon rails, dune jump pads, deterministic tornadoes
 * - Graveyard: 19x19 grid @ 20m = 380x380m (arenaRadius 185, surfaceTag: 'stone' | 'crypt')
 *   * Haunted cathedral & tombstone lanes, elevated crypt walls, dedicated Crypt Escape zone
 *     with pressure-plate waypoints, 8 rails, 8 jump pads, 6 darknessLampSpots for Big Bob
 * - FinalBossMap: Circular Colosseum (arenaRadius 115)
 *   * Flat central battle floor, stepped ring walkways, outer escape ramps,
 *     4 perimeter grind rails, 6 jump pads, exact 11 pylonPositions
 */

import {
  FINAL_BOSS_PYLON_COUNT,
  GRAVEYARD_GRID_SIZE,
  JUMP_PAD_VY,
  type ITerrainSampler,
  type JumpPadDef,
  type MapId,
  type MapTier,
  type RailSplineDef,
  type TerrainSample,
  type Vec3,
  type WallHit,
} from '../contracts/index';
import { createSeededRng, deriveSeed, nextFloat, nextRange } from './prng';

export interface CryptEscapeZoneDef {
  entryPos: Vec3;
  centerPos: Vec3;
  exitPos: Vec3;
  radius: number;
  pressurePlates: Vec3[];
}

export interface TerrainWorldBounds {
  gridSize?: number;
  cellScale?: number;
  worldSpan: number;
  arenaRadius: number;
}

export interface TerrainCreationResult {
  sampler: ITerrainSampler;
  rails: RailSplineDef[];
  jumpPads: JumpPadDef[];
  spawnZones: Vec3[];
  interactableSpots: Vec3[];
  bossArenaCenter: Vec3;
  /** Graveyard Big Bob Darkness phase lamp spots (6 well-spaced spots around boss arena) */
  darknessLampSpots?: Vec3[];
  /** Graveyard dedicated Crypt Escape zone with pressure-plate waypoints */
  cryptEscapeZone?: CryptEscapeZoneDef;
  /** FinalBossMap exact 11 circular colosseum pylon pad positions */
  pylonPositions?: Vec3[];
  /** Desert oasis flat spots */
  oasisSpots?: Vec3[];
  /** Dimensional metadata for minimap / renderer / verifiers */
  worldBounds?: TerrainWorldBounds;
}

export interface DesertNoiseParams {
  readonly scale: number;
  readonly octaves: number;
  readonly persistence: number;
  readonly lacunarity: number;
  readonly heightMult: number;
  readonly baseSeed: number;
  readonly arenaRadius: number;
}

export interface DesertTornadoVortex {
  id: number;
  pos: Vec3;
  radius: number;
  height: number;
  updraftStrength: number;
  swirlStrength: number;
  spinDir: 1 | -1;
  intensity: number;
}

export interface DesertTornadoField {
  simTimeSec: number;
  sandstormIntensity: number;
  windDir: Vec3;
  tornadoes: DesertTornadoVortex[];
}

export const FOREST_STAGE_PARAMS: Readonly<
  Record<MapTier, { gridSize: number; cellScale: number; arenaRadius: number; stepHeight: number; railCount: number; jumpPadCount: number }>
> = Object.freeze({
  1: Object.freeze({ gridSize: 15, cellScale: 20, arenaRadius: 148, stepHeight: 5.0, railCount: 8, jumpPadCount: 8 }),
  2: Object.freeze({ gridSize: 15, cellScale: 22, arenaRadius: 162, stepHeight: 5.5, railCount: 9, jumpPadCount: 9 }),
  3: Object.freeze({ gridSize: 16, cellScale: 24, arenaRadius: 188, stepHeight: 6.0, railCount: 10, jumpPadCount: 10 }),
});

export const DESERT_STAGE_PARAMS: Readonly<Record<MapTier, DesertNoiseParams>> = Object.freeze({
  1: Object.freeze({ scale: 100, octaves: 2, persistence: 0.4, lacunarity: 3, heightMult: 11, baseSeed: 257, arenaRadius: 160 }),
  2: Object.freeze({ scale: 100, octaves: 2, persistence: 0.4, lacunarity: 3, heightMult: 11, baseSeed: 257, arenaRadius: 160 }),
  3: Object.freeze({ scale: 40, octaves: 2, persistence: 0.5, lacunarity: 3, heightMult: 11, baseSeed: 257, arenaRadius: 160 }),
});

interface RampOverlay {
  /** Center on the shared edge between cell A and cell B */
  cx: number;
  cz: number;
  /** Unit vector from cell A -> cell B (either (1,0) or (0,1)) */
  axisX: number;
  axisZ: number;
  hA: number;
  hB: number;
  halfLength: number;
  halfWidth: number;
}

interface AnalyticalHeightSample {
  height: number;
  dhdx: number;
  dhdz: number;
}

const MAX_SAFE_COORD = 1e6;

// 16 unit-circle gradient vectors for 2D gradient Perlin noise (zero per-call allocation)
const PERLIN_GRAD_X: readonly number[] = Array.from({ length: 16 }, (_, i) => Math.cos((i * Math.PI * 2) / 16));
const PERLIN_GRAD_Z: readonly number[] = Array.from({ length: 16 }, (_, i) => Math.sin((i * Math.PI * 2) / 16));
const SQRT2 = Math.SQRT2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-8) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Smoothstep value and exact derivative w.r.t. x */
function smoothstepWithDeriv(edge0: number, edge1: number, x: number): { value: number; deriv: number } {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-8) {
    return { value: x < edge0 ? 0 : 1, deriv: 0 };
  }
  if (x <= edge0) {
    return { value: 0, deriv: 0 };
  }
  if (x >= edge1) {
    return { value: 1, deriv: 0 };
  }
  const t = (x - edge0) / span;
  return {
    value: t * t * (3 - 2 * t),
    deriv: (6 * t * (1 - t)) / span,
  };
}

/** Deterministic 2D integer hash returning unsigned 32-bit int */
function hash2DUint(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 2D integer hash returning [0, 1) */
function hash2D(ix: number, iz: number, seed: number): number {
  return hash2DUint(ix, iz, seed) / 4294967296;
}

/** Smooth 2D value noise in [0, 1] */
function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const n00 = hash2D(ix, iz, seed);
  const n10 = hash2D(ix + 1, iz, seed);
  const n01 = hash2D(ix, iz + 1, seed);
  const n11 = hash2D(ix + 1, iz + 1, seed);
  return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uz);
}

function fbm2D(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Deterministic 2D Gradient Perlin Noise with exact C2-continuous quintic fade
 * and exact analytical partial derivatives `(dhdx, dhdz)`.
 * Value normalized cleanly to approx `[-1, 1]`.
 */
function perlinGradient2DWithDeriv(x: number, z: number, seed: number): AnalyticalHeightSample {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Quintic fade: 6t^5 - 15t^4 + 10t^3, deriv: 30t^2(t-1)^2
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const du = 30 * fx * fx * (fx * (fx - 2) + 1);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dv = 30 * fz * fz * (fz * (fz - 2) + 1);

  const h00 = hash2DUint(ix, iz, seed) & 15;
  const h10 = hash2DUint(ix + 1, iz, seed) & 15;
  const h01 = hash2DUint(ix, iz + 1, seed) & 15;
  const h11 = hash2DUint(ix + 1, iz + 1, seed) & 15;

  const g00x = PERLIN_GRAD_X[h00];
  const g00z = PERLIN_GRAD_Z[h00];
  const g10x = PERLIN_GRAD_X[h10];
  const g10z = PERLIN_GRAD_Z[h10];
  const g01x = PERLIN_GRAD_X[h01];
  const g01z = PERLIN_GRAD_Z[h01];
  const g11x = PERLIN_GRAD_X[h11];
  const g11z = PERLIN_GRAD_Z[h11];

  const a = g00x * fx + g00z * fz;
  const b = g10x * (fx - 1) + g10z * fz;
  const c = g01x * fx + g01z * (fz - 1);
  const d = g11x * (fx - 1) + g11z * (fz - 1);

  const k0 = a;
  const k1 = b - a;
  const k2 = c - a;
  const k3 = a - b - c + d;

  const rawVal = k0 + k1 * u + k2 * v + k3 * u * v;
  const rawDx =
    g00x + u * (g10x - g00x) + v * (g01x - g00x) + u * v * (g00x - g10x - g01x + g11x) + du * (k1 + k3 * v);
  const rawDz =
    g00z + u * (g10z - g00z) + v * (g01z - g00z) + u * v * (g00z - g10z - g01z + g11z) + dv * (k2 + k3 * u);

  return {
    height: rawVal * SQRT2,
    dhdx: rawDx * SQRT2,
    dhdz: rawDz * SQRT2,
  };
}

/**
 * Multi-octave deterministic gradient Perlin FBM matching extracted retail `NoiseData`
 * (`scale`, `octaves`, `persistence`, `lacunarity`), returning value in `[-1, 1]` and
 * exact analytical world-space partial derivatives `(dhdx, dhdz)`.
 */
function perlinFbm2DWithDeriv(
  x: number,
  z: number,
  seed: number,
  scale: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): AnalyticalHeightSample {
  const safeScale = Math.max(1e-3, scale);
  let sumH = 0;
  let sumDx = 0;
  let sumDz = 0;
  let amp = 1.0;
  let freq = 1.0 / safeScale;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const octSeed = deriveSeed(seed, `perlin_oct_${i}`);
    // Small deterministic per-octave domain offset so octaves never symmetrically align at origin
    const offX = ((octSeed & 0xffff) / 65535 - 0.5) * 31.7;
    const offZ = (((octSeed >>> 16) & 0xffff) / 65535 - 0.5) * 31.7;
    const p = perlinGradient2DWithDeriv(x * freq + offX, z * freq + offZ, octSeed);
    sumH += p.height * amp;
    sumDx += p.dhdx * amp * freq;
    sumDz += p.dhdz * amp * freq;
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }

  const invNorm = norm > 1e-6 ? 1 / norm : 1;
  return {
    height: sumH * invNorm,
    dhdx: sumDx * invNorm,
    dhdz: sumDz * invNorm,
  };
}

function computeSplineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

function sanitizeSample(
  height: number,
  dhdx: number,
  dhdz: number,
  inBounds: boolean,
  tag: TerrainSample['surfaceTag'],
): TerrainSample {
  const safeH = Number.isFinite(height) ? height : 0;
  const safeDx = Number.isFinite(dhdx) ? dhdx : 0;
  const safeDz = Number.isFinite(dhdz) ? dhdz : 0;
  const len = Math.hypot(safeDx, 1, safeDz);
  const invLen = Number.isFinite(len) && len > 1e-8 ? 1 / len : 1;
  const nx = -safeDx * invLen;
  const ny = clamp(invLen, -1, 1);
  const nz = -safeDz * invLen;
  const slopeAngleRad = Number.isFinite(ny) ? Math.acos(clamp(ny, -1, 1)) : 0;

  return {
    height: safeH,
    normal: {
      x: Number.isFinite(nx) ? nx : 0,
      y: Number.isFinite(ny) ? ny : 1,
      z: Number.isFinite(nz) ? nz : 0,
    },
    slopeAngleRad: Number.isFinite(slopeAngleRad) ? slopeAngleRad : 0,
    inBounds,
    surfaceTag: tag,
  };
}

function isWithinArena(x: number, z: number, arenaRadius: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return false;
  }
  if (Math.abs(x) > arenaRadius || Math.abs(z) > arenaRadius) {
    return false;
  }
  return x * x + z * z <= arenaRadius * arenaRadius;
}

/**
 * Shared sampler factory wrapping either an analytical height+gradient evaluator
 * or a height function with finite-difference normals, strict NaN-immunity,
 * arena clamping, and smooth cliff-vs-ramp wall collision.
 */
function buildSamplerFromEvaluator(
  mapId: MapId,
  seed: number,
  arenaRadius: number,
  evalField: (x: number, z: number) => AnalyticalHeightSample,
  classifyTag: (x: number, z: number, height: number, slopeRad: number, inBounds: boolean) => TerrainSample['surfaceTag'],
  spawnXZ: { x: number; z: number },
): ITerrainSampler {
  const RING_ANGLES = 8;

  const safeEval = (x: number, z: number): AnalyticalHeightSample => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return { height: 0, dhdx: 0, dhdz: 0 };
    }
    const cx = clamp(x, -MAX_SAFE_COORD, MAX_SAFE_COORD);
    const cz = clamp(z, -MAX_SAFE_COORD, MAX_SAFE_COORD);
    const res = evalField(cx, cz);
    return {
      height: Number.isFinite(res.height) ? res.height : 0,
      dhdx: Number.isFinite(res.dhdx) ? res.dhdx : 0,
      dhdz: Number.isFinite(res.dhdz) ? res.dhdz : 0,
    };
  };

  const sample = (x: number, z: number): TerrainSample => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return {
        height: 0,
        normal: { x: 0, y: 1, z: 0 },
        slopeAngleRad: 0,
        inBounds: false,
        surfaceTag: 'void',
      };
    }

    const cx = clamp(x, -MAX_SAFE_COORD, MAX_SAFE_COORD);
    const cz = clamp(z, -MAX_SAFE_COORD, MAX_SAFE_COORD);
    const inBounds = isWithinArena(x, z, arenaRadius);
    const res = safeEval(cx, cz);
    const len = Math.hypot(res.dhdx, 1, res.dhdz);
    const ny = len > 1e-8 ? clamp(1 / len, -1, 1) : 1;
    const slopeAngleRad = Math.acos(ny);
    const tag = classifyTag(cx, cz, res.height, slopeAngleRad, inBounds);
    return sanitizeSample(res.height, res.dhdx, res.dhdz, inBounds, tag);
  };

  const checkWallCollision = (pos: Vec3, radius: number, height: number): WallHit => {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      return {
        hit: false,
        normal: { x: 0, y: 0, z: 0 },
        penetration: 0,
        point: { x: 0, y: 0, z: 0 },
      };
    }

    // 1. Arena circular perimeter wall
    const maxR = Math.max(2, arenaRadius - radius);
    const dist2D = Math.hypot(pos.x, pos.z);
    if (dist2D > maxR && dist2D > 1e-6) {
      const invD = 1 / dist2D;
      const nx = -pos.x * invD;
      const nz = -pos.z * invD;
      return {
        hit: true,
        normal: { x: nx, y: 0, z: nz },
        penetration: dist2D - maxR,
        point: {
          x: pos.x * invD * arenaRadius,
          y: pos.y + height * 0.5,
          z: pos.z * invD * arenaRadius,
        },
      };
    }

    // 2. Steep cliff step-wall detection around capsule perimeter.
    // Smooth ramps (~10-24 deg) & rolling dunes are never treated as vertical walls.
    const probeDist = radius + 0.35;
    const stepClearance = 0.92;
    const minWallSlopeRad = 0.78; // ~44.7 degrees

    let bestPen = 0;
    let sumNx = 0;
    let sumNz = 0;
    let hitCount = 0;
    let hitPointX = pos.x;
    let hitPointY = pos.y + height * 0.4;
    let hitPointZ = pos.z;

    for (let i = 0; i < RING_ANGLES; i++) {
      const ang = (i * Math.PI * 2) / RING_ANGLES;
      const dirX = Math.cos(ang);
      const dirZ = Math.sin(ang);
      const px = pos.x + dirX * probeDist;
      const pz = pos.z + dirZ * probeDist;
      const s = sample(px, pz);
      const rise = s.height - pos.y;

      if (rise > stepClearance && (s.slopeAngleRad > minWallSlopeRad || rise / probeDist > 1.15)) {
        const midX = pos.x + dirX * (radius * 0.75);
        const midZ = pos.z + dirZ * (radius * 0.75);
        const midRise = safeEval(midX, midZ).height - pos.y;
        const pen =
          midRise > stepClearance
            ? clamp(radius * 0.45, 0.04, radius)
            : clamp((rise - stepClearance) * 0.14, 0.02, radius * 0.35);

        const horizNLen = Math.hypot(s.normal.x, s.normal.z);
        let wnx: number;
        let wnz: number;
        if (horizNLen > 0.25 && s.normal.x * dirX + s.normal.z * dirZ < -0.1) {
          wnx = s.normal.x / horizNLen;
          wnz = s.normal.z / horizNLen;
        } else {
          wnx = -dirX;
          wnz = -dirZ;
        }

        sumNx += wnx * pen;
        sumNz += wnz * pen;
        hitCount += 1;

        if (pen > bestPen) {
          bestPen = pen;
          hitPointX = px;
          hitPointY = Math.min(s.height, pos.y + height * 0.5);
          hitPointZ = pz;
        }
      }
    }

    if (hitCount === 0) {
      return {
        hit: false,
        normal: { x: 0, y: 0, z: 0 },
        penetration: 0,
        point: { x: pos.x, y: pos.y, z: pos.z },
      };
    }

    const normLen = Math.hypot(sumNx, sumNz);
    const nx = normLen > 1e-6 ? sumNx / normLen : 1;
    const nz = normLen > 1e-6 ? sumNz / normLen : 0;

    return {
      hit: true,
      normal: { x: nx, y: 0, z: nz },
      penetration: bestPen,
      point: { x: hitPointX, y: hitPointY, z: hitPointZ },
    };
  };

  const clampToArena = (pos: Vec3, margin = 2.0): Vec3 => {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
      return getSpawnPoint();
    }
    const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : 2.0;
    const maxR = Math.max(1, arenaRadius - safeMargin);
    const d = Math.hypot(pos.x, pos.z);
    if (!Number.isFinite(d)) {
      return getSpawnPoint();
    }
    if (d <= maxR || d <= 1e-6) {
      return { x: pos.x, y: pos.y, z: pos.z };
    }
    const scale = maxR / d;
    return {
      x: pos.x * scale,
      y: pos.y,
      z: pos.z * scale,
    };
  };

  const getSpawnPoint = (): Vec3 => {
    const h = safeEval(spawnXZ.x, spawnXZ.z).height;
    return { x: spawnXZ.x, y: h, z: spawnXZ.z };
  };

  return {
    mapId,
    seed,
    arenaRadius,
    sample,
    checkWallCollision,
    clampToArena,
    getSpawnPoint,
  };
}

function buildSamplerFromHeightFn(
  mapId: MapId,
  seed: number,
  arenaRadius: number,
  evalHeight: (x: number, z: number) => number,
  classifyTag: (x: number, z: number, height: number, slopeRad: number, inBounds: boolean) => TerrainSample['surfaceTag'],
  spawnXZ: { x: number; z: number },
): ITerrainSampler {
  const EPS = 0.28;
  const safeH = (x: number, z: number): number => {
    const h = evalHeight(x, z);
    return Number.isFinite(h) ? h : 0;
  };
  return buildSamplerFromEvaluator(
    mapId,
    seed,
    arenaRadius,
    (x, z) => {
      const height = safeH(x, z);
      const hL = safeH(x - EPS, z);
      const hR = safeH(x + EPS, z);
      const hD = safeH(x, z - EPS);
      const hU = safeH(x, z + EPS);
      return {
        height,
        dhdx: (hR - hL) / (2 * EPS),
        dhdz: (hU - hD) / (2 * EPS),
      };
    },
    classifyTag,
    spawnXZ,
  );
}

/**
 * Distribute grounded low-slope points across radial rings deterministically.
 */
function scatterFlatSpots(
  sampler: ITerrainSampler,
  seed: number,
  count: number,
  minRadius: number,
  maxRadius: number,
  minSpacing: number,
  maxSlopeRad: number,
  avoidPoints: readonly Vec3[] = [],
  avoidRadius = 10,
): Vec3[] {
  const rng = createSeededRng(seed);
  const spots: Vec3[] = [];
  const maxAttempts = count * 45;
  const minSpacingSq = minSpacing * minSpacing;
  const avoidSq = avoidRadius * avoidRadius;

  for (let attempt = 0; attempt < maxAttempts && spots.length < count; attempt++) {
    const angle = nextFloat(rng) * Math.PI * 2;
    const u = nextFloat(rng);
    const r = Math.sqrt(lerp(minRadius * minRadius, maxRadius * maxRadius, u));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const s = sampler.sample(x, z);
    if (!s.inBounds || s.slopeAngleRad > maxSlopeRad) {
      continue;
    }

    let ok = true;
    for (let i = 0; i < avoidPoints.length; i++) {
      const a = avoidPoints[i];
      const dx = x - a.x;
      const dz = z - a.z;
      if (dx * dx + dz * dz < avoidSq) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }

    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const dx = x - sp.x;
      const dz = z - sp.z;
      if (dx * dx + dz * dz < minSpacingSq) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }

    spots.push({ x, y: s.height, z });
  }

  // Deterministic fallback ring if terrain was unusually steep
  let fallbackAngle = 0;
  while (spots.length < Math.min(count, 8)) {
    const r = lerp(minRadius, maxRadius, 0.45);
    const x = Math.cos(fallbackAngle) * r;
    const z = Math.sin(fallbackAngle) * r;
    const s = sampler.sample(x, z);
    spots.push({ x, y: s.height, z });
    fallbackAngle += (Math.PI * 2) / 8;
  }

  return spots;
}

/**
 * Build curved elevated grind rails that cleanly clear terrain and land near plateau lips.
 */
function generateElevatedRails(
  sampler: ITerrainSampler,
  seed: number,
  railCount: number,
  innerRadius: number,
  outerRadius: number,
): RailSplineDef[] {
  const rng = createSeededRng(seed);
  const rails: RailSplineDef[] = [];
  const half = Math.floor(railCount / 2);

  for (let i = 0; i < railCount; i++) {
    const isRingArc = i < half;
    const baseAngle = ((i % Math.max(1, half)) / Math.max(1, half)) * Math.PI * 2 + nextRange(rng, -0.22, 0.22);
    const segCount = 8;
    const points: Vec3[] = [];

    if (isRingArc) {
      const rStart = nextRange(rng, innerRadius, innerRadius + (outerRadius - innerRadius) * 0.45);
      const rEnd = clamp(rStart + nextRange(rng, -16, 16), innerRadius, outerRadius - 8);
      const arcSpan = nextRange(rng, 0.55, 0.85) * (i % 2 === 0 ? 1 : -1);

      const x0 = Math.cos(baseAngle) * rStart;
      const z0 = Math.sin(baseAngle) * rStart;
      const x1 = Math.cos(baseAngle + arcSpan) * rEnd;
      const z1 = Math.sin(baseAngle + arcSpan) * rEnd;
      const y0 = sampler.sample(x0, z0).height + 1.35;
      const y1 = sampler.sample(x1, z1).height + 1.35;

      for (let k = 0; k <= segCount; k++) {
        const t = k / segCount;
        const ang = baseAngle + arcSpan * t;
        const r = lerp(rStart, rEnd, t) + Math.sin(t * Math.PI) * 5.0;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        const terrainY = sampler.sample(x, z).height;
        const archLift = Math.sin(t * Math.PI) * 2.2;
        const y = Math.max(lerp(y0, y1, t) + archLift, terrainY + 1.4);
        points.push({ x, y, z });
      }
    } else {
      const rOuter = nextRange(rng, outerRadius * 0.72, outerRadius * 0.92);
      const rInner = nextRange(rng, innerRadius * 0.55, innerRadius * 0.95);
      const curveAngle = nextRange(rng, -0.28, 0.28);

      const x0 = Math.cos(baseAngle) * rOuter;
      const z0 = Math.sin(baseAngle) * rOuter;
      const x1 = Math.cos(baseAngle + curveAngle) * rInner;
      const z1 = Math.sin(baseAngle + curveAngle) * rInner;
      const y0 = sampler.sample(x0, z0).height + 1.35;
      const y1 = sampler.sample(x1, z1).height + 1.35;

      for (let k = 0; k <= segCount; k++) {
        const t = k / segCount;
        const ang = baseAngle + curveAngle * t + Math.sin(t * Math.PI) * 0.08;
        const r = lerp(rOuter, rInner, t);
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        const terrainY = sampler.sample(x, z).height;
        const archLift = Math.sin(t * Math.PI) * 2.4;
        const y = Math.max(lerp(y0, y1, t) + archLift, terrainY + 1.4);
        points.push({ x, y, z });
      }
    }

    rails.push({
      id: i + 1,
      points,
      totalLength: computeSplineLength(points),
    });
  }

  return rails;
}

/**
 * Place plateau/valley Jump Pads (`vy = 24`) evenly around the arena.
 */
function generateJumpPads(
  sampler: ITerrainSampler,
  seed: number,
  padCount: number,
  innerRadius: number,
  outerRadius: number,
  spawnPos: Vec3,
): JumpPadDef[] {
  const rng = createSeededRng(seed);
  const pads: JumpPadDef[] = [];

  for (let i = 0; i < padCount; i++) {
    const baseAngle = (i / Math.max(1, padCount)) * Math.PI * 2 + nextRange(rng, -0.2, 0.2);
    const preferredR = i < 2 ? innerRadius : lerp(innerRadius + 16, outerRadius, (i % 3) / 2.2);

    let chosenX = Math.cos(baseAngle) * preferredR;
    let chosenZ = Math.sin(baseAngle) * preferredR;
    let chosenY = sampler.sample(chosenX, chosenZ).height;
    let bestSlope = Infinity;

    for (let probe = 0; probe < 12; probe++) {
      const r = clamp(preferredR + nextRange(rng, -10, 10), 18, outerRadius);
      const a = baseAngle + nextRange(rng, -0.22, 0.22);
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      const s = sampler.sample(px, pz);
      const distSpawn = Math.hypot(px - spawnPos.x, pz - spawnPos.z);
      if (s.inBounds && distSpawn > 14 && s.slopeAngleRad < bestSlope) {
        bestSlope = s.slopeAngleRad;
        chosenX = px;
        chosenZ = pz;
        chosenY = s.height;
        if (s.slopeAngleRad < 0.12) {
          break;
        }
      }
    }

    const invD = 1 / Math.max(1, Math.hypot(chosenX, chosenZ));
    const dirSign = i % 2 === 0 ? -1 : 1;
    pads.push({
      id: i + 1,
      pos: { x: chosenX, y: chosenY, z: chosenZ },
      radius: 2.6,
      launchVy: JUMP_PAD_VY,
      launchForwardBoost: {
        x: chosenX * invD * dirSign * 4.5,
        y: 0,
        z: chosenZ * invD * dirSign * 4.5,
      },
    });
  }

  return pads;
}

// ============================================================================
// 1. FOREST TERRAIN (StageForest1 15x15@20m, StageForest2 15x15@22m, StageForest3 16x16@24m)
// ============================================================================

function createForestTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const cfg = FOREST_STAGE_PARAMS[mapTier] ?? FOREST_STAGE_PARAMS[1];
  const GRID = cfg.gridSize;
  const CELL = cfg.cellScale;
  const STEP = cfg.stepHeight;
  const WORLD_SPAN = GRID * CELL;
  const HALF_WORLD = WORLD_SPAN * 0.5;
  const ARENA_RADIUS = cfg.arenaRadius;
  const TIER_HEIGHTS = [0, STEP, STEP * 2, STEP * 3] as const;

  const rng = createSeededRng(deriveSeed(seed, `forest_t${mapTier}`));
  const noiseSeed = deriveSeed(seed, `forest_noise_t${mapTier}`);

  const grid: number[] = new Array<number>(GRID * GRID).fill(STEP);
  const idx = (gx: number, gz: number): number => gz * GRID + gx;

  for (let gz = 0; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cx = (gx + 0.5) * CELL - HALF_WORLD;
      const cz = (gz + 0.5) * CELL - HALF_WORLD;
      const distCenter = Math.hypot(cx, cz);

      if (gx === 0 || gx === GRID - 1 || gz === 0 || gz === GRID - 1) {
        const nRim = fbm2D(gx * 0.35, gz * 0.35, noiseSeed + 77, 2);
        grid[idx(gx, gz)] = nRim > 0.45 ? TIER_HEIGHTS[3] : TIER_HEIGHTS[2];
        continue;
      }

      const n = fbm2D(gx * 0.24 + mapTier * 1.7, gz * 0.24 - mapTier * 0.9, noiseSeed, 3);
      const radialBias = clamp((distCenter - 35) / (ARENA_RADIUS - 35), 0, 1) * 0.25;
      const val = clamp(n + radialBias + nextRange(rng, -0.06, 0.06), 0, 0.999);

      let tierIndex: number;
      if (val < 0.28) {
        tierIndex = 0;
      } else if (val < 0.56) {
        tierIndex = 1;
      } else if (val < 0.82) {
        tierIndex = 2;
      } else {
        tierIndex = 3;
      }
      grid[idx(gx, gz)] = TIER_HEIGHTS[tierIndex];
    }
  }

  // Center coordinates for odd (15 -> 7) vs even (16 -> 7..8) grid
  const isEvenGrid = GRID % 2 === 0;
  const cLo = isEvenGrid ? GRID / 2 - 1 : Math.floor(GRID / 2); // 7 for both 15 and 16
  const cHi = isEvenGrid ? GRID / 2 : cLo; // 7 for 15, 8 for 16

  // Carve clean central spawn clearing at STEP height (5m / 5.5m / 6m)
  for (let gz = cLo - 1; gz <= cHi + 1; gz++) {
    for (let gx = cLo - 1; gx <= cHi + 1; gx++) {
      grid[idx(gx, gz)] = TIER_HEIGHTS[1];
    }
  }

  // Guarantee downhill valley adjacent to spawn (South & West) for immediate crouch-slide chains
  const southValleyZ = cHi + 2;
  const westValleyX = cLo - 2;
  for (let gx = cLo - 1; gx <= cHi + 1; gx++) {
    grid[idx(gx, southValleyZ)] = TIER_HEIGHTS[0];
  }
  grid[idx(westValleyX, cLo)] = TIER_HEIGHTS[0];
  grid[idx(westValleyX, cHi + 1)] = TIER_HEIGHTS[0];

  // Guarantee elevated upper plateau adjacent on opposite side (North & East) for climbing & ramps
  const northTerraceZ = cLo - 2;
  const eastTerraceX = cHi + 2;
  grid[idx(cLo, northTerraceZ)] = TIER_HEIGHTS[2];
  grid[idx(cHi + 1, northTerraceZ)] = TIER_HEIGHTS[2];
  grid[idx(eastTerraceX, cLo)] = TIER_HEIGHTS[2];
  grid[idx(eastTerraceX, cLo - 1)] = TIER_HEIGHTS[2];
  if (eastTerraceX + 1 < GRID - 1) {
    grid[idx(eastTerraceX + 1, northTerraceZ)] = TIER_HEIGHTS[3];
  }

  // Boss arena clearing: flat plateau north of spawn
  const bossCellZ = 3;
  for (let gz = bossCellZ - 1; gz <= bossCellZ + 1; gz++) {
    for (let gx = cLo - 1; gx <= cHi + 1; gx++) {
      grid[idx(gx, gz)] = TIER_HEIGHTS[1];
    }
  }
  const bossCenterX = isEvenGrid ? 0 : (cLo + 0.5) * CELL - HALF_WORLD;
  const bossCenterZ = (bossCellZ + 0.5) * CELL - HALF_WORLD;

  // Build smooth traversable RampOverlays across 1-tier step edges
  const cellRamps: RampOverlay[][] = Array.from({ length: GRID * GRID }, () => []);
  const rampHalfLength = CELL * 0.675; // ~10.5 deg silky slide slope across all tiers
  const rampHalfWidth = CELL * 0.29;
  const featherMargin = Math.max(2.6, CELL * 0.13);

  const addRamp = (gxA: number, gzA: number, gxB: number, gzB: number): void => {
    if (gxA < 0 || gxA >= GRID || gzA < 0 || gzA >= GRID || gxB < 0 || gxB >= GRID || gzB < 0 || gzB >= GRID) {
      return;
    }
    const hA = grid[idx(gxA, gzA)];
    const hB = grid[idx(gxB, gzB)];
    if (Math.abs(Math.abs(hA - hB) - STEP) > 0.05) {
      return;
    }
    const axisX = gxB - gxA;
    const axisZ = gzB - gzA;
    const cx = (gxA + gxB + 1) * 0.5 * CELL - HALF_WORLD;
    const cz = (gzA + gzB + 1) * 0.5 * CELL - HALF_WORLD;

    const ramp: RampOverlay = {
      cx,
      cz,
      axisX,
      axisZ,
      hA,
      hB,
      halfLength: rampHalfLength,
      halfWidth: rampHalfWidth,
    };

    const registerCell = (cgx: number, cgz: number): void => {
      if (cgx < 0 || cgx >= GRID || cgz < 0 || cgz >= GRID) {
        return;
      }
      const list = cellRamps[idx(cgx, cgz)];
      if (!list.includes(ramp)) {
        list.push(ramp);
      }
    };
    registerCell(gxA, gzA);
    registerCell(gxB, gzB);
    if (axisX !== 0) {
      registerCell(gxA, gzA - 1);
      registerCell(gxA, gzA + 1);
      registerCell(gxB, gzB - 1);
      registerCell(gxB, gzB + 1);
    } else {
      registerCell(gxA - 1, gzA);
      registerCell(gxA + 1, gzA);
      registerCell(gxB - 1, gzB);
      registerCell(gxB + 1, gzB);
    }
  };

  // Guaranteed ramps radiating out of central spawn & boss arena clearing
  addRamp(cLo, cHi + 1, cLo, southValleyZ); // South downhill slide ramp right from spawn!
  if (isEvenGrid) {
    addRamp(cHi, cHi + 1, cHi, southValleyZ);
  }
  addRamp(cLo - 1, cLo, westValleyX, cLo); // West downhill slide ramp!
  addRamp(cLo, cLo - 1, cLo, northTerraceZ); // North uphill ramp to upper terrace
  addRamp(cHi + 1, cLo, eastTerraceX, cLo); // East uphill ramp to upper terrace
  addRamp(cLo, northTerraceZ, cLo, bossCellZ + 1); // Downhill ramp from ridge into Boss Arena!

  // Deterministic procedural ramps across ~38% of remaining interior 1-tier step edges
  const rampRng = createSeededRng(deriveSeed(seed, `forest_ramps_t${mapTier}`));
  for (let gz = 1; gz < GRID - 1; gz++) {
    for (let gx = 1; gx < GRID - 1; gx++) {
      const nearSpawn = gx >= cLo - 1 && gx <= cHi + 1 && gz >= cLo - 1 && gz <= cHi + 1;
      if (gx + 1 < GRID - 1 && Math.abs(Math.abs(grid[idx(gx, gz)] - grid[idx(gx + 1, gz)]) - STEP) < 0.05) {
        if (!nearSpawn && nextFloat(rampRng) < 0.38) {
          addRamp(gx, gz, gx + 1, gz);
        }
      }
      if (gz + 1 < GRID - 1 && Math.abs(Math.abs(grid[idx(gx, gz)] - grid[idx(gx, gz + 1)]) - STEP) < 0.05) {
        if (!nearSpawn && nextFloat(rampRng) < 0.38) {
          addRamp(gx, gz, gx, gz + 1);
        }
      }
    }
  }

  const BEVEL_HALF = 0.08;
  const steepStep = (t: number): number => smoothstep(0.5 - BEVEL_HALF, 0.5 + BEVEL_HALF, t);
  const sampleGridHeight = (gx: number, gz: number): number => {
    const cx = clamp(gx, 0, GRID - 1);
    const cz = clamp(gz, 0, GRID - 1);
    return grid[idx(cx, cz)];
  };

  const evalHeight = (x: number, z: number): number => {
    const fx = clamp((x + HALF_WORLD) / CELL, 0, GRID - 1e-4);
    const fz = clamp((z + HALF_WORLD) / CELL, 0, GRID - 1e-4);

    const gx0 = Math.floor(fx - 0.5);
    const gz0 = Math.floor(fz - 0.5);
    const tx = fx - 0.5 - gx0;
    const tz = fz - 0.5 - gz0;

    const wx = steepStep(tx);
    const wz = steepStep(tz);

    const h00 = sampleGridHeight(gx0, gz0);
    const h10 = sampleGridHeight(gx0 + 1, gz0);
    const h01 = sampleGridHeight(gx0, gz0 + 1);
    const h11 = sampleGridHeight(gx0 + 1, gz0 + 1);

    let h = lerp(lerp(h00, h10, wx), lerp(h01, h11, wx), wz);

    const cgx = clamp(Math.floor(fx), 0, GRID - 1);
    const cgz = clamp(Math.floor(fz), 0, GRID - 1);
    const ramps = cellRamps[idx(cgx, cgz)];
    if (ramps.length > 0) {
      let bestWeight = 0;
      let bestRampHeight = h;
      for (let i = 0; i < ramps.length; i++) {
        const r = ramps[i];
        const dx = x - r.cx;
        const dz = z - r.cz;
        const along = dx * r.axisX + dz * r.axisZ;
        const absAlong = Math.abs(along);
        if (absAlong > r.halfLength) {
          continue;
        }
        const perp = Math.abs(-dx * r.axisZ + dz * r.axisX);
        if (perp > r.halfWidth + featherMargin) {
          continue;
        }
        const wPerp = 1 - smoothstep(r.halfWidth - 1.4, r.halfWidth + featherMargin, perp);
        const wAlong = 1 - smoothstep(r.halfLength - 2.2, r.halfLength, absAlong);
        const w = wPerp * wAlong;
        if (w > bestWeight) {
          bestWeight = w;
          const tRamp = smoothstep(-r.halfLength, r.halfLength, along);
          bestRampHeight = lerp(r.hA, r.hB, tRamp);
        }
      }
      if (bestWeight > 0) {
        h = lerp(h, bestRampHeight, bestWeight);
      }
    }

    const distSpawn = Math.hypot(x, z);
    const distBoss = Math.hypot(x - bossCenterX, z - bossCenterZ);
    const flatFade = smoothstep(14, 28, distSpawn) * smoothstep(14, 26, distBoss);
    const undulation =
      (Math.sin(x * 0.045 + seed * 0.01) * Math.cos(z * 0.042 - seed * 0.013) * 0.28 +
        Math.sin((x + z) * 0.075) * 0.12) *
      flatFade;

    return h + undulation;
  };

  const sampler = buildSamplerFromHeightFn(
    'Forest',
    seed,
    ARENA_RADIUS,
    evalHeight,
    (_x, _z, _h, slopeRad, inBounds) => {
      if (!inBounds) {
        return 'void';
      }
      return slopeRad > 0.62 ? 'stone' : 'ground';
    },
    { x: 0, z: 0 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = {
    x: bossCenterX,
    y: sampler.sample(bossCenterX, bossCenterZ).height,
    z: bossCenterZ,
  };

  const scaleRatio = ARENA_RADIUS / 148;
  const rails = generateElevatedRails(
    sampler,
    deriveSeed(seed, `forest_rails_t${mapTier}`),
    cfg.railCount,
    36 * scaleRatio,
    122 * scaleRatio,
  );
  const jumpPads = generateJumpPads(
    sampler,
    deriveSeed(seed, `forest_pads_t${mapTier}`),
    cfg.jumpPadCount,
    26 * scaleRatio,
    118 * scaleRatio,
    spawnPoint,
  );
  const spawnZones = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `forest_spawns_t${mapTier}`),
    24 + (mapTier - 1) * 4,
    28 * scaleRatio,
    132 * scaleRatio,
    18,
    0.45,
    [spawnPoint],
    22,
  );
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `forest_interactables_t${mapTier}`),
    32 + (mapTier - 1) * 4,
    20 * scaleRatio,
    128 * scaleRatio,
    16,
    0.34,
    [spawnPoint, bossArenaCenter, ...jumpPads.map((p) => p.pos)],
    10,
  );

  return {
    sampler,
    rails,
    jumpPads,
    spawnZones,
    interactableSpots,
    bossArenaCenter,
    worldBounds: {
      gridSize: GRID,
      cellScale: CELL,
      worldSpan: WORLD_SPAN,
      arenaRadius: ARENA_RADIUS,
    },
  };
}

// ============================================================================
// 2. DESERT TERRAIN (ProceduralMesh Perlin Dunes + Exact Analytical Normals + Tornadoes)
// ============================================================================

interface FlatZoneSpec {
  cx: number;
  cz: number;
  innerR: number;
  outerR: number;
  targetHeight: number;
}

/**
 * Sample deterministic roaming Desert tornado vortices and ambient sandstorm intensity.
 * Pure stateless function of `(simTimeSec, seed, arenaRadius)` — zero `Math.random()`.
 */
export function sampleDesertTornadoes(
  simTimeSec: number,
  seed: number,
  arenaRadius = 160,
  sampler?: ITerrainSampler,
): DesertTornadoField {
  const t = Number.isFinite(simTimeSec) ? Math.max(0, simTimeSec) : 0;
  const safeR = Number.isFinite(arenaRadius) && arenaRadius > 20 ? arenaRadius : 160;
  const rng = createSeededRng(deriveSeed(seed, 'desert_tornadoes_v2'));

  // Cyclical desert sandstorm wave (calm breeze ~0.22 surging periodically to 0.92-1.0)
  const stormPhase = nextRange(rng, 0, Math.PI * 2);
  const stormCycle = 0.5 + 0.5 * Math.sin(t * ((Math.PI * 2) / 72.0) + stormPhase);
  const gustWave = 0.5 + 0.5 * Math.sin(t * 0.27 + stormPhase * 1.7);
  const sandstormIntensity = clamp(0.18 + Math.pow(stormCycle, 1.8) * 0.72 + gustWave * 0.1, 0, 1);

  // Slowly rotating prevailing desert wind direction
  const windAngle = stormPhase + t * 0.045 + Math.sin(t * 0.13) * 0.25;
  const windDir: Vec3 = {
    x: Math.cos(windAngle),
    y: 0,
    z: Math.sin(windAngle),
  };

  // 3 persistent roaming tornado vortices (4th spins up during high sandstorm intensity)
  const vortexCount = sandstormIntensity > 0.62 ? 4 : 3;
  const tornadoes: DesertTornadoVortex[] = [];
  const minOrbitR = Math.min(34, safeR * 0.25);
  const maxOrbitR = Math.max(minOrbitR + 12, safeR * 0.78);

  for (let i = 0; i < 4; i++) {
    const baseAngle = (i / 4) * Math.PI * 2 + nextRange(rng, -0.35, 0.35);
    const orbitSpeed = nextRange(rng, 0.065, 0.115) * (i % 2 === 0 ? 1 : -1);
    const radialFreq = nextRange(rng, 0.08, 0.15);
    const radialPhase = nextRange(rng, 0, Math.PI * 2);
    const epicycleAmp = nextRange(rng, 8, 16);
    const epicycleFreq = nextRange(rng, 0.18, 0.29);
    const baseRadius = nextRange(rng, 10.5, 14.5);
    const spinDir: 1 | -1 = i % 2 === 0 ? 1 : -1;

    if (i >= vortexCount) {
      continue;
    }

    const rNorm = 0.5 + 0.5 * Math.sin(t * radialFreq + radialPhase);
    const orbitR = lerp(minOrbitR, maxOrbitR, rNorm);
    const ang = baseAngle + t * orbitSpeed;
    let x = Math.cos(ang) * orbitR + Math.cos(t * epicycleFreq + radialPhase) * epicycleAmp;
    let z = Math.sin(ang) * orbitR + Math.sin(t * epicycleFreq * 1.13 + baseAngle) * epicycleAmp;

    // Keep safely inside playable arena perimeter
    const dist = Math.hypot(x, z);
    const capR = safeR * 0.84;
    if (dist > capR && dist > 1e-6) {
      const s = capR / dist;
      x *= s;
      z *= s;
    }

    const baseY = sampler ? sampler.sample(x, z).height : 0;
    const vortexIntensity =
      i === 3
        ? clamp((sandstormIntensity - 0.62) / 0.38, 0.15, 1.0)
        : clamp(0.55 + sandstormIntensity * 0.45, 0.5, 1.0);

    tornadoes.push({
      id: i + 1,
      pos: { x, y: baseY, z },
      radius: baseRadius * (0.9 + vortexIntensity * 0.2),
      height: 52.0,
      updraftStrength: 34.0 + vortexIntensity * 14.0,
      swirlStrength: 24.0 + vortexIntensity * 12.0,
      spinDir,
      intensity: vortexIntensity,
    });
  }

  return {
    simTimeSec: t,
    sandstormIntensity,
    windDir,
    tornadoes,
  };
}

function createDesertTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const params = DESERT_STAGE_PARAMS[mapTier] ?? DESERT_STAGE_PARAMS[1];
  const ARENA_RADIUS = params.arenaRadius; // 160m
  const noiseSeed = deriveSeed(seed ^ params.baseSeed, `desert_perlin_t${mapTier}`);
  const layoutRng = createSeededRng(deriveSeed(seed, `desert_layout_t${mapTier}`));

  // Sculpted Oasis flat spots (3 mid-ring oases + elevated spawn ridge + boss sanctuary)
  const oasisSpecs: FlatZoneSpec[] = [];
  const oasisCount = 3;
  const oasisBaseAngle = nextRange(layoutRng, 0.35, 0.85);
  for (let i = 0; i < oasisCount; i++) {
    // Place oases away from the boss arena at (0, -82)
    const ang = oasisBaseAngle + (i / oasisCount) * Math.PI * 1.45 + 0.15;
    const r = nextRange(layoutRng, 74, 108);
    oasisSpecs.push({
      cx: Math.cos(ang) * r,
      cz: Math.sin(ang) * r,
      innerR: 11.5,
      outerR: 26.0,
      targetHeight: 3.0, // Lush sunken oasis floor
    });
  }

  const bossCenterX = 0;
  const bossCenterZ = -82;

  // All flat zones blended with exact analytical product/chain-rule derivatives
  const flatZones: FlatZoneSpec[] = [
    // Elevated central spawn dune crest so players can immediately drop into silky downhill dune slides!
    { cx: 0, cz: 0, innerR: 12.0, outerR: 32.0, targetHeight: 15.5 },
    // Boss sanctuary plateau
    { cx: bossCenterX, cz: bossCenterZ, innerR: 16.0, outerR: 32.0, targetHeight: 6.5 },
    ...oasisSpecs,
  ];

  // Soft dune crest shaping parameter (keeps StageDesert3 steep dunes smoothly walkable <= 42 deg)
  const crestCap = mapTier === 3 ? 0.92 : 1.25;
  const baseElevation = 12.5;

  // Gentle wind-carved dune ridge wave (adds rhythmic long sand-surfing lanes on top of Perlin FBM)
  const ridgeAngle = nextRange(layoutRng, -0.5, 0.5);
  const ridgeCos = Math.cos(ridgeAngle);
  const ridgeSin = Math.sin(ridgeAngle);
  const ridgeFreq = mapTier === 3 ? 0.052 : 0.036;
  const ridgeAmp = mapTier === 3 ? 2.4 : 3.2;

  const evalField = (x: number, z: number): AnalyticalHeightSample => {
    // 1. Exact retail gradient Perlin FBM with analytical derivatives
    const fbm = perlinFbm2DWithDeriv(
      x,
      z,
      noiseSeed,
      params.scale,
      params.octaves,
      params.persistence,
      params.lacunarity,
    );

    // Smooth hyperbolic tangent dune crest rounding (C-infinity analytical derivative)
    const u = fbm.height / crestCap;
    const th = Math.tanh(u);
    const sech2 = 1 - th * th;
    const shapedH = crestCap * th * params.heightMult;
    const shapedDx = sech2 * fbm.dhdx * params.heightMult;
    const shapedDz = sech2 * fbm.dhdz * params.heightMult;

    // Rhythmic wind-sculpted dune swell
    const proj = x * ridgeCos + z * ridgeSin;
    const swellPhase = proj * ridgeFreq;
    const swellH = Math.sin(swellPhase) * ridgeAmp;
    const swellDeriv = Math.cos(swellPhase) * ridgeFreq * ridgeAmp;

    let h = baseElevation + shapedH + swellH;
    let dhdx = shapedDx + swellDeriv * ridgeCos;
    let dhdz = shapedDz + swellDeriv * ridgeSin;

    // 2. Smoothly blend flat zones (Spawn Ridge, Boss Arena, Oases) with exact chain/product rule
    for (let i = 0; i < flatZones.length; i++) {
      const zone = flatZones[i];
      const dx = x - zone.cx;
      const dz = z - zone.cz;
      const dist = Math.hypot(dx, dz);
      if (dist >= zone.outerR) {
        continue;
      }
      const sm = smoothstepWithDeriv(zone.innerR, zone.outerR, dist);
      const m = sm.value;
      const dmDr = sm.deriv;
      const dmDx = dist > 1e-6 ? dmDr * (dx / dist) : 0;
      const dmDz = dist > 1e-6 ? dmDr * (dz / dist) : 0;

      // h_new = target + m * (h - target)
      const diff = h - zone.targetHeight;
      dhdx = dmDx * diff + m * dhdx;
      dhdz = dmDz * diff + m * dhdz;
      h = zone.targetHeight + m * diff;
    }

    // 3. Sweeping sandstone canyon rim around outer perimeter (exact radial derivative)
    const r = Math.hypot(x, z);
    const rimStart = ARENA_RADIUS - 24.0;
    const rimEnd = ARENA_RADIUS + 4.0;
    if (r > rimStart) {
      const rimSm = smoothstepWithDeriv(rimStart, rimEnd, r);
      const rimAmp = 16.0;
      h += rimSm.value * rimAmp;
      if (r > 1e-6) {
        const dRimDr = rimSm.deriv * rimAmp;
        dhdx += dRimDr * (x / r);
        dhdz += dRimDr * (z / r);
      }
    }

    return { height: h, dhdx, dhdz };
  };

  const sampler = buildSamplerFromEvaluator(
    'Desert',
    seed,
    ARENA_RADIUS,
    evalField,
    (x, z, _h, slopeRad, inBounds) => {
      if (!inBounds) {
        return 'void';
      }
      for (let i = 0; i < oasisSpecs.length; i++) {
        const o = oasisSpecs[i];
        const dx = x - o.cx;
        const dz = z - o.cz;
        if (dx * dx + dz * dz <= (o.innerR + 2.5) * (o.innerR + 2.5)) {
          return 'ground';
        }
      }
      const r = Math.hypot(x, z);
      if (slopeRad > 0.72 || r > ARENA_RADIUS - 14) {
        return 'stone';
      }
      return 'dune';
    },
    { x: 0, z: 0 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = {
    x: bossCenterX,
    y: sampler.sample(bossCenterX, bossCenterZ).height,
    z: bossCenterZ,
  };
  const oasisSpots: Vec3[] = oasisSpecs.map((o) => ({
    x: o.cx,
    y: sampler.sample(o.cx, o.cz).height,
    z: o.cz,
  }));

  const rails = generateElevatedRails(sampler, deriveSeed(seed, `desert_rails_t${mapTier}`), 8, 40, 134);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, `desert_pads_t${mapTier}`), 8, 28, 128, spawnPoint);
  const spawnZones = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `desert_spawns_t${mapTier}`),
    26,
    28,
    142,
    18,
    0.55,
    [spawnPoint],
    22,
  );
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `desert_interactables_t${mapTier}`),
    34,
    20,
    138,
    16,
    0.48,
    [spawnPoint, bossArenaCenter, ...jumpPads.map((p) => p.pos)],
    11,
  );

  return {
    sampler,
    rails,
    jumpPads,
    spawnZones,
    interactableSpots,
    bossArenaCenter,
    oasisSpots,
    worldBounds: {
      worldSpan: ARENA_RADIUS * 2,
      arenaRadius: ARENA_RADIUS,
    },
  };
}

// ============================================================================
// 3. GRAVEYARD TERRAIN (19x19 Grid @ 20m = 380x380m, Crypt Escape, 6 Big Bob Lamps)
// ============================================================================

function createGraveyardTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const GRID = GRAVEYARD_GRID_SIZE; // 19x19
  const CELL = 20;
  const WORLD_SPAN = GRID * CELL; // 380m
  const HALF_WORLD = WORLD_SPAN * 0.5; // 190m
  const ARENA_RADIUS = 185;
  const STEP = 4.5;
  const TIER_HEIGHTS = [0, STEP, STEP * 2, STEP * 3] as const;

  const rng = createSeededRng(deriveSeed(seed, `graveyard_t${mapTier}`));
  const noiseSeed = deriveSeed(seed, `graveyard_noise_t${mapTier}`);

  const grid: number[] = new Array<number>(GRID * GRID).fill(0);
  const idx = (gx: number, gz: number): number => gz * GRID + gx;
  const cellCenterWorld = (g: number): number => (g + 0.5) * CELL - HALF_WORLD;

  // 1. Build haunted cathedral & tombstone lane 19x19 height maze
  for (let gz = 0; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      // Gothic cathedral fortress perimeter walls
      if (gx === 0 || gx === GRID - 1 || gz === 0 || gz === GRID - 1) {
        grid[idx(gx, gz)] = (gx + gz) % 2 === 0 ? TIER_HEIGHTS[3] : TIER_HEIGHTS[2];
        continue;
      }

      // Main cardinal gothic avenues along gx=9 and gz=9 stay low/navigable tombstone lanes
      if (gx === 9 || gz === 9) {
        grid[idx(gx, gz)] = TIER_HEIGHTS[0];
        continue;
      }

      // Structured tombstone lanes interleaved with raised terraces & climbable crypt walls
      const lanePattern = (gx % 3 === 0 || gz % 3 === 0);
      const n = fbm2D(gx * 0.28 + mapTier * 1.1, gz * 0.28 - mapTier * 0.7, noiseSeed, 3);
      const val = clamp(n + nextRange(rng, -0.07, 0.07), 0, 0.999);

      if (lanePattern && val < 0.65) {
        grid[idx(gx, gz)] = TIER_HEIGHTS[0]; // Cobblestone tombstone lane
      } else if (val < 0.42) {
        grid[idx(gx, gz)] = TIER_HEIGHTS[0];
      } else if (val < 0.76) {
        grid[idx(gx, gz)] = TIER_HEIGHTS[1]; // Elevated graveyard terrace (4.5m)
      } else {
        grid[idx(gx, gz)] = TIER_HEIGHTS[2]; // High crypt wall / mausoleum roof (9.0m)
      }
    }
  }

  // 2. Central Spawn Nave around (9, 9) => world (0, 0) at 4.5m terrace
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      grid[idx(9 + dx, 9 + dz)] = TIER_HEIGHTS[1];
    }
  }
  // Ensure immediate low cobblestone avenues bordering spawn in all 4 cardinal directions
  grid[idx(9, 11)] = TIER_HEIGHTS[0];
  grid[idx(9, 7)] = TIER_HEIGHTS[0];
  grid[idx(7, 9)] = TIER_HEIGHTS[0];
  grid[idx(11, 9)] = TIER_HEIGHTS[0];

  // 3. Haunted Cathedral Boss Arena (Big Bob's Sanctum) centered at (9, 4) => world (0, -100)
  const bossGridX = 9;
  const bossGridZ = 4;
  for (let gz = bossGridZ - 2; gz <= bossGridZ + 2; gz++) {
    for (let gx = bossGridX - 2; gx <= bossGridX + 2; gx++) {
      const onRim = Math.abs(gx - bossGridX) === 2 || Math.abs(gz - bossGridZ) === 2;
      grid[idx(gx, gz)] = onRim ? TIER_HEIGHTS[1] : TIER_HEIGHTS[0];
    }
  }
  // Open grand cathedral entrance corridor from the south (gx=9, gz=6)
  grid[idx(9, 6)] = TIER_HEIGHTS[0];
  grid[idx(8, 6)] = TIER_HEIGHTS[0];
  grid[idx(10, 6)] = TIER_HEIGHTS[0];

  // 4. Dedicated Crypt Escape Zone centered at (9, 14) => world (0, +100)
  const cryptGridX = 9;
  const cryptGridZ = 14;
  for (let gz = cryptGridZ - 2; gz <= cryptGridZ + 2; gz++) {
    for (let gx = cryptGridX - 2; gx <= cryptGridX + 2; gx++) {
      const onWall = Math.abs(gx - cryptGridX) === 2 || Math.abs(gz - cryptGridZ) === 2;
      // Tall crypt walls (9m) enclosing a flat vaulted 0m escape chamber
      grid[idx(gx, gz)] = onWall ? TIER_HEIGHTS[2] : TIER_HEIGHTS[0];
    }
  }
  // Crypt northern entrance gate + east/west stepped escape passages
  grid[idx(9, 12)] = TIER_HEIGHTS[0];
  grid[idx(9, 11)] = TIER_HEIGHTS[0];
  grid[idx(7, 14)] = TIER_HEIGHTS[1];
  grid[idx(11, 14)] = TIER_HEIGHTS[1];

  // 5. Smooth traversable ramps across 1-step (4.5m) transitions
  const cellRamps: RampOverlay[][] = Array.from({ length: GRID * GRID }, () => []);
  const addRamp = (gxA: number, gzA: number, gxB: number, gzB: number): void => {
    if (gxA < 0 || gxA >= GRID || gzA < 0 || gzA >= GRID || gxB < 0 || gxB >= GRID || gzB < 0 || gzB >= GRID) {
      return;
    }
    const hA = grid[idx(gxA, gzA)];
    const hB = grid[idx(gxB, gzB)];
    if (Math.abs(Math.abs(hA - hB) - STEP) > 0.05) {
      return;
    }
    const axisX = gxB - gxA;
    const axisZ = gzB - gzA;
    const cx = (gxA + gxB + 1) * 0.5 * CELL - HALF_WORLD;
    const cz = (gzA + gzB + 1) * 0.5 * CELL - HALF_WORLD;

    const ramp: RampOverlay = {
      cx,
      cz,
      axisX,
      axisZ,
      hA,
      hB,
      halfLength: 13.0,
      halfWidth: 5.6,
    };

    const registerCell = (cgx: number, cgz: number): void => {
      if (cgx < 0 || cgx >= GRID || cgz < 0 || cgz >= GRID) {
        return;
      }
      const list = cellRamps[idx(cgx, cgz)];
      if (!list.includes(ramp)) {
        list.push(ramp);
      }
    };
    registerCell(gxA, gzA);
    registerCell(gxB, gzB);
    if (axisX !== 0) {
      registerCell(gxA, gzA - 1);
      registerCell(gxA, gzA + 1);
      registerCell(gxB, gzB - 1);
      registerCell(gxB, gzB + 1);
    } else {
      registerCell(gxA - 1, gzA);
      registerCell(gxA + 1, gzA);
      registerCell(gxB - 1, gzB);
      registerCell(gxB + 1, gzB);
    }
  };

  // Guaranteed ramps from spawn nave onto all 4 tombstone avenues
  addRamp(9, 10, 9, 11);
  addRamp(9, 8, 9, 7);
  addRamp(8, 9, 7, 9);
  addRamp(10, 9, 11, 9);
  // Boss cathedral side gallery ramps
  addRamp(7, 4, 8, 4);
  addRamp(11, 4, 10, 4);
  // Crypt escape side passage ramps
  addRamp(7, 14, 8, 14);
  addRamp(11, 14, 10, 14);

  const rampRng = createSeededRng(deriveSeed(seed, `graveyard_ramps_t${mapTier}`));
  for (let gz = 1; gz < GRID - 1; gz++) {
    for (let gx = 1; gx < GRID - 1; gx++) {
      const inCrypt = Math.abs(gx - cryptGridX) <= 2 && Math.abs(gz - cryptGridZ) <= 2;
      const nearSpawn = Math.abs(gx - 9) <= 1 && Math.abs(gz - 9) <= 1;
      if (inCrypt || nearSpawn) {
        continue;
      }
      if (gx + 1 < GRID - 1 && Math.abs(Math.abs(grid[idx(gx, gz)] - grid[idx(gx + 1, gz)]) - STEP) < 0.05) {
        if (nextFloat(rampRng) < 0.42) {
          addRamp(gx, gz, gx + 1, gz);
        }
      }
      if (gz + 1 < GRID - 1 && Math.abs(Math.abs(grid[idx(gx, gz)] - grid[idx(gx, gz + 1)]) - STEP) < 0.05) {
        if (nextFloat(rampRng) < 0.42) {
          addRamp(gx, gz, gx, gz + 1);
        }
      }
    }
  }

  const BEVEL_HALF = 0.075;
  const steepStep = (t: number): number => smoothstep(0.5 - BEVEL_HALF, 0.5 + BEVEL_HALF, t);
  const sampleGridHeight = (gx: number, gz: number): number => {
    const cx = clamp(gx, 0, GRID - 1);
    const cz = clamp(gz, 0, GRID - 1);
    return grid[idx(cx, cz)];
  };

  const bossCenterX = cellCenterWorld(bossGridX); // 0
  const bossCenterZ = cellCenterWorld(bossGridZ); // -100
  const cryptCenterX = cellCenterWorld(cryptGridX); // 0
  const cryptCenterZ = cellCenterWorld(cryptGridZ); // +100

  const evalHeight = (x: number, z: number): number => {
    const fx = clamp((x + HALF_WORLD) / CELL, 0, GRID - 1e-4);
    const fz = clamp((z + HALF_WORLD) / CELL, 0, GRID - 1e-4);

    const gx0 = Math.floor(fx - 0.5);
    const gz0 = Math.floor(fz - 0.5);
    const tx = fx - 0.5 - gx0;
    const tz = fz - 0.5 - gz0;

    const wx = steepStep(tx);
    const wz = steepStep(tz);

    const h00 = sampleGridHeight(gx0, gz0);
    const h10 = sampleGridHeight(gx0 + 1, gz0);
    const h01 = sampleGridHeight(gx0, gz0 + 1);
    const h11 = sampleGridHeight(gx0 + 1, gz0 + 1);

    let h = lerp(lerp(h00, h10, wx), lerp(h01, h11, wx), wz);

    const cgx = clamp(Math.floor(fx), 0, GRID - 1);
    const cgz = clamp(Math.floor(fz), 0, GRID - 1);
    const ramps = cellRamps[idx(cgx, cgz)];
    if (ramps.length > 0) {
      let bestWeight = 0;
      let bestRampHeight = h;
      for (let i = 0; i < ramps.length; i++) {
        const r = ramps[i];
        const dx = x - r.cx;
        const dz = z - r.cz;
        const along = dx * r.axisX + dz * r.axisZ;
        const absAlong = Math.abs(along);
        if (absAlong > r.halfLength) {
          continue;
        }
        const perp = Math.abs(-dx * r.axisZ + dz * r.axisX);
        if (perp > r.halfWidth + 2.5) {
          continue;
        }
        const wPerp = 1 - smoothstep(r.halfWidth - 1.3, r.halfWidth + 2.5, perp);
        const wAlong = 1 - smoothstep(r.halfLength - 2.0, r.halfLength, absAlong);
        const w = wPerp * wAlong;
        if (w > bestWeight) {
          bestWeight = w;
          const tRamp = smoothstep(-r.halfLength, r.halfLength, along);
          bestRampHeight = lerp(r.hA, r.hB, tRamp);
        }
      }
      if (bestWeight > 0) {
        h = lerp(h, bestRampHeight, bestWeight);
      }
    }

    // Subtle weathered stone unevenness outside flat sanctums
    const distSpawn = Math.hypot(x, z);
    const distBoss = Math.hypot(x - bossCenterX, z - bossCenterZ);
    const distCrypt = Math.hypot(x - cryptCenterX, z - cryptCenterZ);
    const flatFade = smoothstep(14, 26, distSpawn) * smoothstep(26, 36, distBoss) * smoothstep(26, 36, distCrypt);
    const stoneRipple = Math.sin(x * 0.055 + seed * 0.02) * Math.cos(z * 0.055) * 0.16 * flatFade;
    return h + stoneRipple;
  };

  const sampler = buildSamplerFromHeightFn(
    'Graveyard',
    seed,
    ARENA_RADIUS,
    evalHeight,
    (x, z, _h, _slopeRad, inBounds) => {
      if (!inBounds) {
        return 'void';
      }
      // Dedicated Crypt Escape zone + cathedral inner crypt floor => 'crypt', rest => 'stone'
      const inCryptZone = Math.abs(x - cryptCenterX) <= 46 && Math.abs(z - cryptCenterZ) <= 46;
      const inBossSanctum = Math.hypot(x - bossCenterX, z - bossCenterZ) <= 22;
      return inCryptZone || inBossSanctum ? 'crypt' : 'stone';
    },
    { x: 0, z: 0 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = {
    x: bossCenterX,
    y: sampler.sample(bossCenterX, bossCenterZ).height,
    z: bossCenterZ,
  };

  // Exact 6 well-spaced Darkness Lamp positions around Big Bob's Graveyard boss arena
  const darknessLampSpots: Vec3[] = [];
  const lampRingRadius = 24.0;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const lx = bossCenterX + Math.cos(ang) * lampRingRadius;
    const lz = bossCenterZ + Math.sin(ang) * lampRingRadius;
    darknessLampSpots.push({
      x: lx,
      y: sampler.sample(lx, lz).height,
      z: lz,
    });
  }

  // Dedicated Crypt Escape zone with 4 grounded pressure-plate waypoints
  const plateOffsets: readonly [number, number][] = [
    [-16, -14],
    [16, -14],
    [-16, 14],
    [16, 14],
  ];
  const pressurePlates: Vec3[] = plateOffsets.map(([ox, oz]) => {
    const px = cryptCenterX + ox;
    const pz = cryptCenterZ + oz;
    return { x: px, y: sampler.sample(px, pz).height, z: pz };
  });
  const cryptEscapeZone: CryptEscapeZoneDef = {
    entryPos: { x: cryptCenterX, y: sampler.sample(cryptCenterX, cryptCenterZ - 36).height, z: cryptCenterZ - 36 },
    centerPos: { x: cryptCenterX, y: sampler.sample(cryptCenterX, cryptCenterZ).height, z: cryptCenterZ },
    exitPos: { x: cryptCenterX, y: sampler.sample(cryptCenterX, cryptCenterZ + 24).height, z: cryptCenterZ + 24 },
    radius: 38,
    pressurePlates,
  };

  const rails = generateElevatedRails(sampler, deriveSeed(seed, `grave_rails_t${mapTier}`), 8, 42, 152);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, `grave_pads_t${mapTier}`), 8, 32, 150, spawnPoint);
  const spawnZones = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `grave_spawns_t${mapTier}`),
    30,
    30,
    164,
    18,
    0.45,
    [spawnPoint],
    22,
  );
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `grave_interactables_t${mapTier}`),
    38,
    22,
    160,
    16,
    0.36,
    [spawnPoint, bossArenaCenter, cryptEscapeZone.centerPos, ...jumpPads.map((p) => p.pos)],
    11,
  );

  return {
    sampler,
    rails,
    jumpPads,
    spawnZones,
    interactableSpots,
    bossArenaCenter,
    darknessLampSpots,
    cryptEscapeZone,
    worldBounds: {
      gridSize: GRID,
      cellScale: CELL,
      worldSpan: WORLD_SPAN,
      arenaRadius: ARENA_RADIUS,
    },
  };
}

// ============================================================================
// 4. FINAL BOSS MAP (Circular Colosseum, arenaRadius=115, 11 Pylons, 4 Rails, 6 Jump Pads)
// ============================================================================

function angularDistance(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function createFinalBossTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const ARENA_RADIUS = 115;
  const PYLON_RING_RADIUS = 52;
  const RAMP_COUNT = 6;
  const tierRipple = (mapTier - 1) * 0.15;

  // Architectural circular colosseum:
  // - Flat central battle floor (r <= 62m) with subtle raised boss dais at r < 11m
  // - 11 flat pylon pads arranged cleanly at r = 52m
  // - Stepped Tier 1 ring walkway (r = 66..84m, h = 4.0m) with 6 smooth escape ramps
  // - Stepped Tier 2 outer ring walkway (r = 88..105m, h = 8.0m) with 6 staggered escape ramps
  // - High obsidian parapet rim (r = 107..115m -> 18.0m)
  const evalHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);

    // Subtle central boss dais (flat top inside r <= 8m, smooth drop by r = 13m)
    const centerDais = (1 - smoothstep(8.0, 13.5, r)) * 0.85;

    // Tier 1 ring walkway at +4.0m (stepped cliff at r=64..67 except at 6 wide escape ramps)
    let ramp1Mask = 0;
    for (let i = 0; i < RAMP_COUNT; i++) {
      const rampAngle = (i / RAMP_COUNT) * Math.PI * 2;
      const dAng = angularDistance(theta, rampAngle);
      if (dAng < 0.24) {
        const w = 1 - smoothstep(0.11, 0.24, dAng);
        if (w > ramp1Mask) {
          ramp1Mask = w;
        }
      }
    }
    const tier1Steep = smoothstep(63.5, 66.5, r);
    const tier1Ramp = smoothstep(56.5, 70.5, r);
    const tier1 = lerp(tier1Steep, tier1Ramp, ramp1Mask) * 4.0;

    // Tier 2 outer ring walkway at +4.0m above Tier 1 (total 8.0m), staggered ramps by 30 deg
    let ramp2Mask = 0;
    for (let i = 0; i < RAMP_COUNT; i++) {
      const rampAngle = (i / RAMP_COUNT) * Math.PI * 2 + Math.PI / RAMP_COUNT;
      const dAng = angularDistance(theta, rampAngle);
      if (dAng < 0.2) {
        const w = 1 - smoothstep(0.09, 0.2, dAng);
        if (w > ramp2Mask) {
          ramp2Mask = w;
        }
      }
    }
    const tier2Steep = smoothstep(84.5, 87.5, r);
    const tier2Ramp = smoothstep(78.5, 92.5, r);
    const tier2 = lerp(tier2Steep, tier2Ramp, ramp2Mask) * 4.0;

    // Outer colosseum obsidian parapet wall
    const rim = smoothstep(ARENA_RADIUS - 9.0, ARENA_RADIUS + 2.0, r) * 11.0;

    // Subtle concentric stonework relief away from pylon pads
    const relief =
      tierRipple > 0 ? Math.sin(r * 0.14) * tierRipple * smoothstep(20, 34, r) * (1 - smoothstep(42, 48, r)) : 0;

    return centerDais + tier1 + tier2 + rim + relief;
  };

  const sampler = buildSamplerFromHeightFn(
    'FinalBossMap',
    seed,
    ARENA_RADIUS,
    evalHeight,
    (_x, _z, _h, _slopeRad, inBounds) => (inBounds ? 'stone' : 'void'),
    { x: 0, z: 36 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = { x: 0, y: sampler.sample(0, 0).height, z: 0 };

  // Exact 11 circular colosseum pylon pad positions (matches FINAL_BOSS_PYLON_COUNT === 11)
  const pylonPositions: Vec3[] = [];
  for (let i = 0; i < FINAL_BOSS_PYLON_COUNT; i++) {
    const angle = (i / FINAL_BOSS_PYLON_COUNT) * Math.PI * 2;
    const px = Math.cos(angle) * PYLON_RING_RADIUS;
    const pz = Math.sin(angle) * PYLON_RING_RADIUS;
    pylonPositions.push({
      x: px,
      y: sampler.sample(px, pz).height,
      z: pz,
    });
  }

  // Exact 4 sweeping perimeter grind rails encircling the stepped colosseum walkways
  const rails: RailSplineDef[] = [];
  const segCount = 10;
  for (let i = 0; i < 4; i++) {
    const startAng = (i / 4) * Math.PI * 2 + 0.14;
    const arcSpan = Math.PI * 0.5 - 0.28;
    const railR = i % 2 === 0 ? 74.0 : 94.0;
    const points: Vec3[] = [];
    for (let k = 0; k <= segCount; k++) {
      const t = k / segCount;
      const ang = startAng + arcSpan * t;
      const r = railR + Math.sin(t * Math.PI) * 3.5;
      const rx = Math.cos(ang) * r;
      const rz = Math.sin(ang) * r;
      const terrainY = sampler.sample(rx, rz).height;
      const archLift = Math.sin(t * Math.PI) * 1.8;
      points.push({ x: rx, y: terrainY + 1.55 + archLift, z: rz });
    }
    rails.push({
      id: i + 1,
      points,
      totalLength: computeSplineLength(points),
    });
  }

  // Exact 6 colosseum jump pads seated cleanly outside the pylon ring to launch onto walkways
  const jumpPads: JumpPadDef[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 60.0;
    const jx = Math.cos(ang) * r;
    const jz = Math.sin(ang) * r;
    const jy = sampler.sample(jx, jz).height;
    const invR = 1 / r;
    jumpPads.push({
      id: i + 1,
      pos: { x: jx, y: jy, z: jz },
      radius: 2.7,
      launchVy: JUMP_PAD_VY,
      launchForwardBoost: {
        x: jx * invR * 5.0,
        y: 0,
        z: jz * invR * 5.0,
      },
    });
  }

  const spawnZones = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `boss_spawns_t${mapTier}`),
    18,
    24,
    98,
    16,
    0.45,
    [spawnPoint, bossArenaCenter],
    16,
  );
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, `boss_interactables_t${mapTier}`),
    16,
    26,
    94,
    16,
    0.4,
    [spawnPoint, bossArenaCenter, ...pylonPositions, ...jumpPads.map((p) => p.pos)],
    10,
  );

  return {
    sampler,
    rails,
    jumpPads,
    spawnZones,
    interactableSpots,
    bossArenaCenter,
    pylonPositions,
    worldBounds: {
      worldSpan: ARENA_RADIUS * 2,
      arenaRadius: ARENA_RADIUS,
    },
  };
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export function createTerrainSampler(
  mapId: MapId,
  mapTier: MapTier,
  seed: number,
): TerrainCreationResult {
  switch (mapId) {
    case 'Forest':
      return createForestTerrain(mapTier, seed);
    case 'Desert':
      return createDesertTerrain(mapTier, seed);
    case 'Graveyard':
      return createGraveyardTerrain(mapTier, seed);
    case 'FinalBossMap':
      return createFinalBossTerrain(mapTier, seed);
  }
}
