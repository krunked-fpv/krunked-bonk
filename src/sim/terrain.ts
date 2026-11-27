/**
 * KRUNKEDBONK — Pure Deterministic Terrain Sampler & Arena Generator
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 *
 * Wave 1 flagship `Forest` features a 15x15 stepped plateau grid (20m cells => 300x300m,
 * arenaRadius = 148m) with elevation tiers 0m / 5m / 10m / 15m, smooth traversable ramps
 * built for 2.4x downhill crouch-slide chains, steep climbable cliff walls, 8 elevated
 * spline grind rails, 8 plateau jump pads (vy = 24), a clean central spawn clearing,
 * and well-spaced interactable & enemy spawn zones.
 *
 * Also provides clean deterministic playable samplers for Desert, Graveyard, and FinalBossMap.
 */

import {
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

export interface TerrainCreationResult {
  sampler: ITerrainSampler;
  rails: RailSplineDef[];
  jumpPads: JumpPadDef[];
  spawnZones: Vec3[];
  interactableSpots: Vec3[];
  bossArenaCenter: Vec3;
}

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

/** Deterministic 2D integer hash returning [0, 1) */
function hash2D(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

function computeSplineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

/**
 * Shared sampler factory wrapping an analytical height function and surface tag classifier
 * with finite-difference normals, arena clamping, and smooth cliff-vs-ramp wall collision.
 */
function buildSamplerFromHeightFn(
  mapId: MapId,
  seed: number,
  arenaRadius: number,
  evalHeight: (x: number, z: number) => number,
  classifyTag: (x: number, z: number, height: number, slopeRad: number, inBounds: boolean) => TerrainSample['surfaceTag'],
  spawnXZ: { x: number; z: number },
): ITerrainSampler {
  const EPS = 0.28;
  const RING_ANGLES = 8;

  const safeHeight = (x: number, z: number): number => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return 0;
    }
    const h = evalHeight(x, z);
    return Number.isFinite(h) ? h : 0;
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

    const height = safeHeight(x, z);
    const hL = safeHeight(x - EPS, z);
    const hR = safeHeight(x + EPS, z);
    const hD = safeHeight(x, z - EPS);
    const hU = safeHeight(x, z + EPS);

    const dhdx = (hR - hL) / (2 * EPS);
    const dhdz = (hU - hD) / (2 * EPS);
    const invLen = 1 / Math.hypot(dhdx, 1, dhdz);

    const nx = -dhdx * invLen;
    const ny = invLen;
    const nz = -dhdz * invLen;
    const slopeAngleRad = Math.acos(clamp(ny, -1, 1));
    const distSq = x * x + z * z;
    const inBounds = distSq <= arenaRadius * arenaRadius;

    return {
      height,
      normal: { x: nx, y: ny, z: nz },
      slopeAngleRad,
      inBounds,
      surfaceTag: classifyTag(x, z, height, slopeAngleRad, inBounds),
    };
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
    // Smooth ramps (~12-22 deg, rise < 0.4m over probeDist) are never treated as walls.
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

      // Only trigger if the terrain rises significantly above feet AND is genuinely steep
      if (rise > stepClearance && (s.slopeAngleRad > minWallSlopeRad || rise / probeDist > 1.15)) {
        // Refine wall contact distance along the ray using midpoint check
        const midX = pos.x + dirX * (radius * 0.75);
        const midZ = pos.z + dirZ * (radius * 0.75);
        const midRise = safeHeight(midX, midZ) - pos.y;
        const pen =
          midRise > stepClearance
            ? clamp(radius * 0.45, 0.04, radius)
            : clamp((rise - stepClearance) * 0.14, 0.02, radius * 0.35);

        // Prefer horizontal projection of true terrain normal pointing out of the cliff
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
    const maxR = Math.max(1, arenaRadius - Math.max(0, margin));
    const d = Math.hypot(pos.x, pos.z);
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
    const h = safeHeight(spawnXZ.x, spawnXZ.z);
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
      // Sweeping curved arc rail bridging mid-arena plateaus & valleys
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
      // Radial downhill/uphill rail connecting outer high terraces toward mid-ring
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

    // Sample a few nearby offsets to seat each jump pad on clean flat ground
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

    // Subtle horizontal nudge toward center or adjacent plateau
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
// FLAGSHIP FOREST TERRAIN (15x15 Stepped Plateau Grid, 20m cells => 300x300m)
// ============================================================================

function createForestTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const GRID = 15;
  const CELL = 20;
  const HALF_WORLD = (GRID * CELL) * 0.5; // 150m
  const ARENA_RADIUS = 148;
  const TIER_HEIGHTS = [0, 5, 10, 15] as const;

  const rng = createSeededRng(deriveSeed(seed, `forest_t${mapTier}`));
  const noiseSeed = deriveSeed(seed, 'forest_noise');

  // 1. Build 15x15 elevation tier grid (values 0, 5, 10, 15)
  const grid: number[] = new Array<number>(GRID * GRID).fill(5);
  const idx = (gx: number, gz: number): number => gz * GRID + gx;

  for (let gz = 0; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cx = (gx + 0.5) * CELL - HALF_WORLD;
      const cz = (gz + 0.5) * CELL - HALF_WORLD;
      const distCenter = Math.hypot(cx, cz);

      // Outer perimeter forms dramatic stepped forest rim cliffs
      if (gx === 0 || gx === GRID - 1 || gz === 0 || gz === GRID - 1) {
        const nRim = fbm2D(gx * 0.35, gz * 0.35, noiseSeed + 77, 2);
        grid[idx(gx, gz)] = nRim > 0.45 ? 15 : 10;
        continue;
      }

      // Structured terraced hills using seeded fbm + directional gradient so downhill chains feel awesome
      const n = fbm2D(gx * 0.24 + mapTier * 1.7, gz * 0.24 - mapTier * 0.9, noiseSeed, 3);
      const radialBias = clamp((distCenter - 35) / 115, 0, 1) * 0.25;
      const val = clamp(n + radialBias + nextRange(rng, -0.06, 0.06), 0, 0.999);

      let tierIndex: number;
      if (val < 0.28) {
        tierIndex = 0; // 0m valley
      } else if (val < 0.56) {
        tierIndex = 1; // 5m mid-meadow
      } else if (val < 0.82) {
        tierIndex = 2; // 10m upper plateau
      } else {
        tierIndex = 3; // 15m high ridge
      }
      grid[idx(gx, gz)] = TIER_HEIGHTS[tierIndex];
    }
  }

  // 2. Carve clean central spawn clearing around (7, 7) => (0, 0) at 5m
  // Flanked immediately by 0m downhill meadows to the south/west and 10m terrace to the north/east
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      grid[idx(7 + dx, 7 + dz)] = 5;
    }
  }
  // Guarantee downhill valley adjacent to spawn for immediate crouch-slide chains
  grid[idx(7, 9)] = 0;
  grid[idx(6, 9)] = 0;
  grid[idx(8, 9)] = 0;
  grid[idx(5, 7)] = 0;
  grid[idx(5, 8)] = 0;
  // Guarantee elevated upper plateau adjacent on opposite side for climbing & ramps
  grid[idx(7, 5)] = 10;
  grid[idx(8, 5)] = 10;
  grid[idx(9, 7)] = 10;
  grid[idx(9, 6)] = 10;
  grid[idx(10, 5)] = 15;

  // Boss arena clearing: flat 3x3 plateau centered at cell (7, 3) => world (0, -80)
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      grid[idx(7 + dx, 3 + dz)] = 5;
    }
  }

  // 3. Build smooth traversable RampOverlays across 1-tier (5m) edges
  const cellRamps: RampOverlay[][] = Array.from({ length: GRID * GRID }, () => []);
  const addRamp = (gxA: number, gzA: number, gxB: number, gzB: number): void => {
    const hA = grid[idx(gxA, gzA)];
    const hB = grid[idx(gxB, gzB)];
    if (Math.abs(hA - hB) !== 5) {
      return;
    }
    const axisX = gxB - gxA;
    const axisZ = gzB - gzA;
    const cx = ((gxA + gxB + 1) * 0.5) * CELL - HALF_WORLD;
    const cz = ((gzA + gzB + 1) * 0.5) * CELL - HALF_WORLD;

    const ramp: RampOverlay = {
      cx,
      cz,
      axisX,
      axisZ,
      hA,
      hB,
      halfLength: 13.5, // 27m run for 5m drop => ~10.5 deg silky slide slope!
      halfWidth: 5.8,   // 11.6m wide highway ramp
    };

    // Register ramp into both connected cells (and immediate lateral neighbors for smooth side feathering)
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
    // Lateral blend zone (halfWidth + 2.5 = 8.3m < 10m cell half-width, still register adjacent if near corner)
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
  addRamp(7, 8, 7, 9); // South downhill slide ramp right from spawn!
  addRamp(6, 7, 5, 7); // West downhill slide ramp!
  addRamp(7, 6, 7, 5); // North uphill ramp to 10m terrace
  addRamp(8, 7, 9, 7); // East uphill ramp to 10m terrace
  addRamp(7, 5, 7, 4); // Downhill ramp from 10m ridge directly into Boss Arena!

  // Deterministic procedural ramps across ~38% of remaining interior 1-tier step edges,
  // leaving ~62% of step edges as crisp climbable steep cliffs!
  const rampRng = createSeededRng(deriveSeed(seed, 'forest_ramps'));
  for (let gz = 1; gz < GRID - 1; gz++) {
    for (let gx = 1; gx < GRID - 1; gx++) {
      // Avoid cluttering spawn clearing borders with extra ramps that overwrite cliff contrast
      const nearSpawn = Math.abs(gx - 7) <= 1 && Math.abs(gz - 7) <= 1;
      if (gx + 1 < GRID - 1 && Math.abs(grid[idx(gx, gz)] - grid[idx(gx + 1, gz)]) === 5) {
        if (!nearSpawn && nextFloat(rampRng) < 0.38) {
          addRamp(gx, gz, gx + 1, gz);
        }
      }
      if (gz + 1 < GRID - 1 && Math.abs(grid[idx(gx, gz)] - grid[idx(gx, gz + 1)]) === 5) {
        if (!nearSpawn && nextFloat(rampRng) < 0.38) {
          addRamp(gx, gz, gx, gz + 1);
        }
      }
    }
  }

  // Steep bevel step shaping: flat on 84% of plateau, crisp ~65° cliff over 3.2m boundary
  const BEVEL_HALF = 0.08;
  const steepStep = (t: number): number => smoothstep(0.5 - BEVEL_HALF, 0.5 + BEVEL_HALF, t);

  const sampleGridHeight = (gx: number, gz: number): number => {
    const cx = clamp(gx, 0, GRID - 1);
    const cz = clamp(gz, 0, GRID - 1);
    return grid[idx(cx, cz)];
  };

  const bossCenterX = 0;
  const bossCenterZ = (3 + 0.5) * CELL - HALF_WORLD; // -80m

  const evalHeight = (x: number, z: number): number => {
    const fx = clamp((x + HALF_WORLD) / CELL, 0, GRID - 1e-4);
    const fz = clamp((z + HALF_WORLD) / CELL, 0, GRID - 1e-4);

    // Dual-grid coordinates centered on cell centers so t=0.5 aligns with cell border
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

    // Apply local smooth ramp overlays in O(1)
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
        if (perp > r.halfWidth + 2.6) {
          continue;
        }
        const wPerp = 1 - smoothstep(r.halfWidth - 1.4, r.halfWidth + 2.6, perp);
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

    // Subtle organic meadow rolling undulation (±0.38m), faded near spawn & boss arena
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

  const rails = generateElevatedRails(sampler, deriveSeed(seed, 'forest_rails'), 8, 36, 122);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, 'forest_pads'), 8, 26, 118, spawnPoint);
  const spawnZones = scatterFlatSpots(
    sampler,
    deriveSeed(seed, 'forest_spawns'),
    24,
    28,
    132,
    18,
    0.45,
    [spawnPoint],
    22,
  );
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, 'forest_interactables'),
    32,
    20,
    128,
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
  };
}

// ============================================================================
// BASELINE PLAYABLE SAMPLERS FOR DESERT, GRAVEYARD & FINALBOSSMAP (Wave 1)
// ============================================================================

function createDesertTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const ARENA_RADIUS = 170;
  const noiseSeed = deriveSeed(seed, `desert_t${mapTier}`);

  const evalHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const oasisFlat = smoothstep(14, 34, r);
    const dunes =
      (fbm2D(x * 0.014, z * 0.014, noiseSeed, 4) - 0.45) * 18.0 +
      Math.sin(x * 0.032 + z * 0.018 + (noiseSeed & 0xff)) * 2.8;
    const rim = smoothstep(ARENA_RADIUS - 28, ARENA_RADIUS + 4, r) * 14.0;
    return Math.max(0, 2.0 + dunes * oasisFlat + rim);
  };

  const sampler = buildSamplerFromHeightFn(
    'Desert',
    seed,
    ARENA_RADIUS,
    evalHeight,
    (_x, _z, _h, slopeRad, inBounds) => {
      if (!inBounds) {
        return 'void';
      }
      return slopeRad > 0.72 ? 'stone' : 'dune';
    },
    { x: 0, z: 0 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = { x: 0, y: sampler.sample(0, -85).height, z: -85 };
  const rails = generateElevatedRails(sampler, deriveSeed(seed, 'desert_rails'), 8, 42, 138);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, 'desert_pads'), 8, 30, 134, spawnPoint);
  const spawnZones = scatterFlatSpots(sampler, deriveSeed(seed, 'desert_spawns'), 24, 30, 148, 20, 0.5, [spawnPoint], 24);
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, 'desert_interactables'),
    32,
    22,
    144,
    18,
    0.42,
    [spawnPoint, bossArenaCenter],
    12,
  );

  return { sampler, rails, jumpPads, spawnZones, interactableSpots, bossArenaCenter };
}

function createGraveyardTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const GRID = GRAVEYARD_GRID_SIZE; // 19x19
  const CELL = 16;
  const HALF_WORLD = (GRID * CELL) * 0.5; // 152m
  const ARENA_RADIUS = 150;
  const noiseSeed = deriveSeed(seed, `graveyard_t${mapTier}`);

  const evalHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const centerFlat = smoothstep(16, 30, r);
    const fx = clamp((x + HALF_WORLD) / CELL, 0, GRID - 1e-4);
    const fz = clamp((z + HALF_WORLD) / CELL, 0, GRID - 1e-4);
    const terrace = Math.floor(fbm2D(fx * 0.22, fz * 0.22, noiseSeed, 2) * 3.0) * 3.0;
    const smoothTerrace = lerp(terrace, fbm2D(fx * 0.22, fz * 0.22, noiseSeed, 3) * 7.5, 0.55);
    const rim = smoothstep(ARENA_RADIUS - 18, ARENA_RADIUS + 4, r) * 10.0;
    return smoothTerrace * centerFlat + rim;
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
      return Math.hypot(x, z + 75) < 28 ? 'crypt' : 'stone';
    },
    { x: 0, z: 0 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = { x: 0, y: sampler.sample(0, -75).height, z: -75 };
  const rails = generateElevatedRails(sampler, deriveSeed(seed, 'grave_rails'), 6, 38, 118);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, 'grave_pads'), 6, 26, 115, spawnPoint);
  const spawnZones = scatterFlatSpots(sampler, deriveSeed(seed, 'grave_spawns'), 24, 28, 130, 16, 0.45, [spawnPoint], 20);
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, 'grave_interactables'),
    28,
    20,
    126,
    16,
    0.38,
    [spawnPoint, bossArenaCenter],
    12,
  );

  return { sampler, rails, jumpPads, spawnZones, interactableSpots, bossArenaCenter };
}

function createFinalBossTerrain(mapTier: MapTier, seed: number): TerrainCreationResult {
  const ARENA_RADIUS = 110;
  const phaseOffset = mapTier * 0.5;

  const evalHeight = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    // Raised central boss dais + flat pylon ring + obsidian outer parapet
    const centerDais = (1 - smoothstep(22, 32, r)) * 2.5;
    const outerStep = smoothstep(68, 80, r) * 3.5;
    const subtleWave = Math.sin(r * 0.08 + phaseOffset) * 0.25 * smoothstep(28, 50, r);
    const rim = smoothstep(ARENA_RADIUS - 10, ARENA_RADIUS + 2, r) * 9.0;
    return centerDais + outerStep + subtleWave + rim;
  };

  const sampler = buildSamplerFromHeightFn(
    'FinalBossMap',
    seed,
    ARENA_RADIUS,
    evalHeight,
    (_x, _z, _h, _slopeRad, inBounds) => (inBounds ? 'stone' : 'void'),
    { x: 0, z: 42 },
  );

  const spawnPoint = sampler.getSpawnPoint();
  const bossArenaCenter: Vec3 = { x: 0, y: sampler.sample(0, 0).height, z: 0 };
  const rails = generateElevatedRails(sampler, deriveSeed(seed, 'boss_rails'), 6, 36, 86);
  const jumpPads = generateJumpPads(sampler, deriveSeed(seed, 'boss_pads'), 6, 32, 84, spawnPoint);
  const spawnZones = scatterFlatSpots(sampler, deriveSeed(seed, 'boss_spawns'), 16, 26, 92, 16, 0.45, [spawnPoint], 16);
  const interactableSpots = scatterFlatSpots(
    sampler,
    deriveSeed(seed, 'boss_interactables'),
    16,
    28,
    88,
    16,
    0.4,
    [spawnPoint, bossArenaCenter],
    14,
  );

  return { sampler, rails, jumpPads, spawnZones, interactableSpots, bossArenaCenter };
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
