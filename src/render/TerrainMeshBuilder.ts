/**
 * KRUNKEDBONK — Stylized Terrain, Props, Spline Rails, Jump Pads & Wind-Swayed Grass Builder
 *
 * Builds chunky faceted stepped-plateau terrain directly from ITerrainSampler:
 * - 300x300m low-poly grid with crisp grass tops vs steep rock cliff slope coloring
 * - Subtle baked cliff-base ambient occlusion for instant elevation readability
 * - Deterministic outlined low-poly Forest trees (Pine & Oak) and mossy boulders
 * - Spline grind Rail beams with glowing energy stripes & grounded support pylons
 * - Glowing cyan JumpPad spring discs with pulsing chevron rings
 * - GPU wind-swayed instanced grass scaled cleanly by GrassQuality (low/med/high)
 * - Terrain-aligned contact shadow disc under the player
 */

import * as THREE from 'three';
import type {
  GrassQuality,
  ITerrainSampler,
  JumpPadDef,
  MapId,
  MapTier,
  RailSplineDef,
} from '../contracts/index';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { ProceduralTextureId } from '../assets/ProceduralLowPolyPack';
import {
  createMkToonMaterial,
  createOutlineMaterial,
  createSmoothOutlineGeometry,
  setMkToonTexture,
} from './toonShader';

const GRASS_CAPACITY = 8500;
const GRASS_COUNTS: Record<GrassQuality, number> = {
  low: 1400,
  med: 4200,
  high: GRASS_CAPACITY,
};

function createLocalRng(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a stylized 3-blade crossed low-poly grass tuft BufferGeometry with
 * vertex colors (deep emerald root -> sunlit chartreuse tip) and uv.y = height [0..1]
 * so the GPU wind shader bends only the tips smoothly.
 */
function createGrassTuftGeometry(): THREE.BufferGeometry {
  const bladeCount = 3;
  const vertsPerBlade = 3; // single crisp stylized tapered triangle per blade
  const totalVerts = bladeCount * vertsPerBlade;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  const rootCol = new THREE.Color(0x2a7d3e);
  const tipCol = new THREE.Color(0xc4f55b);

  let vi = 0;
  for (let b = 0; b < bladeCount; b++) {
    const angle = (b / bladeCount) * Math.PI + (b === 1 ? 0.2 : 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = 0.22;
    const h = 0.72 + (b % 2) * 0.18;
    const lean = 0.14;

    const bx = cos * 0.08;
    const bz = sin * 0.08;

    // Left root
    positions[vi * 3] = bx - cos * halfW;
    positions[vi * 3 + 1] = 0;
    positions[vi * 3 + 2] = bz - sin * halfW;
    normals[vi * 3] = 0;
    normals[vi * 3 + 1] = 1;
    normals[vi * 3 + 2] = 0;
    uvs[vi * 2] = 0;
    uvs[vi * 2 + 1] = 0;
    colors[vi * 3] = rootCol.r;
    colors[vi * 3 + 1] = rootCol.g;
    colors[vi * 3 + 2] = rootCol.b;
    vi++;

    // Right root
    positions[vi * 3] = bx + cos * halfW;
    positions[vi * 3 + 1] = 0;
    positions[vi * 3 + 2] = bz + sin * halfW;
    normals[vi * 3] = 0;
    normals[vi * 3 + 1] = 1;
    normals[vi * 3 + 2] = 0;
    uvs[vi * 2] = 1;
    uvs[vi * 2 + 1] = 0;
    colors[vi * 3] = rootCol.r;
    colors[vi * 3 + 1] = rootCol.g;
    colors[vi * 3 + 2] = rootCol.b;
    vi++;

    // Sunlit tip
    positions[vi * 3] = bx - sin * lean;
    positions[vi * 3 + 1] = h;
    positions[vi * 3 + 2] = bz + cos * lean;
    normals[vi * 3] = 0;
    normals[vi * 3 + 1] = 1;
    normals[vi * 3 + 2] = 0;
    uvs[vi * 2] = 0.5;
    uvs[vi * 2 + 1] = 1;
    colors[vi * 3] = tipCol.r;
    colors[vi * 3 + 1] = tipCol.g;
    colors[vi * 3 + 2] = tipCol.b;
    vi++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

interface TerrainColorPalette {
  flatLow: number;
  flatMid: number;
  flatHigh: number;
  slopeRim: number;
  cliffLow: number;
  cliffHigh: number;
  aoTint: number;
  detailTexture: ProceduralTextureId;
  grassRoot: number;
  grassTip: number;
  showGrass: boolean;
}

function getTerrainPalette(mapId: MapId, tier: MapTier): TerrainColorPalette {
  if (mapId === 'Desert') {
    return {
      flatLow: 0xde9e48,
      flatMid: 0xf2c26b,
      flatHigh: 0xffe09c,
      slopeRim: 0xc97b38,
      cliffLow: 0x9c5533,
      cliffHigh: 0xb86b3e,
      aoTint: 0x5c3638,
      detailTexture: 'terrain_desert',
      grassRoot: 0x9c8233,
      grassTip: 0xd9c25b,
      showGrass: true,
    };
  }
  if (mapId === 'Graveyard') {
    return {
      flatLow: 0x3b4d4a,
      flatMid: 0x4c6158,
      flatHigh: 0x5e7569,
      slopeRim: 0x475266,
      cliffLow: 0x2f384a,
      cliffHigh: 0x445066,
      aoTint: 0x1a1e2e,
      detailTexture: 'terrain_graveyard',
      grassRoot: 0x2b4a42,
      grassTip: 0x5c8f72,
      showGrass: true,
    };
  }
  if (mapId === 'FinalBossMap') {
    return {
      flatLow: 0x2a203b,
      flatMid: 0x382a4f,
      flatHigh: 0x4a3869,
      slopeRim: 0x5e2878,
      cliffLow: 0x1b1429,
      cliffHigh: 0x2d2142,
      aoTint: 0x140a21,
      detailTexture: 'terrain_citadel',
      grassRoot: 0x421c5e,
      grassTip: 0xb938ff,
      showGrass: false,
    };
  }

  // Flagship Forest palette (StageForest1 vibrant emerald-lime, Tier 2 autumn-gold, Tier 3 emerald-teal twilight)
  if (tier === 2) {
    return {
      flatLow: 0x62ab3f,
      flatMid: 0x91c949,
      flatHigh: 0xc2d952,
      slopeRim: 0x6f8f52,
      cliffLow: 0x596e7a,
      cliffHigh: 0x7c8f99,
      aoTint: 0x2d3f54,
      detailTexture: 'terrain_grass',
      grassRoot: 0x497d32,
      grassTip: 0xe3e858,
      showGrass: true,
    };
  }
  if (tier === 3) {
    return {
      flatLow: 0x2d8a5a,
      flatMid: 0x43ad6c,
      flatHigh: 0x62cc7e,
      slopeRim: 0x3b7375,
      cliffLow: 0x3a4d66,
      cliffHigh: 0x546c85,
      aoTint: 0x1b2642,
      detailTexture: 'terrain_grass',
      grassRoot: 0x1f664b,
      grassTip: 0x7df5a8,
      showGrass: true,
    };
  }

  return {
    flatLow: 0x45ad46,
    flatMid: 0x6fd145,
    flatHigh: 0x9ce352,
    slopeRim: 0x5a9163,
    cliffLow: 0x526b7a,
    cliffHigh: 0x7993a3,
    aoTint: 0x243b57,
    detailTexture: 'terrain_grass',
    grassRoot: 0x2b823f,
    grassTip: 0xc5f759,
    showGrass: true,
  };
}

export class TerrainMeshBuilder {
  public readonly rootGroup = new THREE.Group();
  private readonly staticGroup = new THREE.Group();
  private readonly featuresGroup = new THREE.Group();

  private readonly assets: AssetRegistry;
  private terrainMat: THREE.ShaderMaterial | null = null;
  private grassMesh: THREE.InstancedMesh | null = null;
  private grassMat: THREE.ShaderMaterial | null = null;
  private railMat: THREE.ShaderMaterial | null = null;
  private jumpPadRings: THREE.Mesh[] = [];

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly featureGeometries: THREE.BufferGeometry[] = [];
  private readonly featureMaterials: THREE.Material[] = [];

  private currentTerrain: ITerrainSampler | null = null;
  private currentMapId: MapId = 'Forest';
  private currentMapTier: MapTier = 1;
  private currentGrassQuality: GrassQuality = 'high';
  private builtRailsLen = -1;
  private builtFirstRailId = -1;
  private builtPadsLen = -1;
  private builtFirstPadId = -1;

  // Contact shadow under player (pre-allocated)
  private readonly contactShadow: THREE.Mesh;
  private readonly contactShadowGeo: THREE.CircleGeometry;
  private readonly contactShadowMat: THREE.MeshBasicMaterial;

  // Scratch vectors/quaternions for zero-GC updates
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _normal = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();

  constructor(assets: AssetRegistry) {
    this.assets = assets;
    this.rootGroup.name = 'TerrainRoot';
    this.rootGroup.add(this.staticGroup, this.featuresGroup);

    // Pre-allocate crisp dark-teal contact shadow disc beneath player
    this.contactShadowGeo = new THREE.CircleGeometry(0.95, 16);
    this.contactShadowGeo.rotateX(-Math.PI * 0.5);
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      color: 0x0b1626,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.contactShadow = new THREE.Mesh(this.contactShadowGeo, this.contactShadowMat);
    this.contactShadow.renderOrder = 1;
    this.rootGroup.add(this.contactShadow);
  }

  public buildMap(
    mapId: MapId,
    mapTier: MapTier,
    seed: number,
    terrain: ITerrainSampler,
    grassQuality: GrassQuality,
  ): void {
    this.clearStatic();
    this.clearFeatures();

    this.currentMapId = mapId;
    this.currentMapTier = mapTier;
    this.currentTerrain = terrain;
    this.currentGrassQuality = grassQuality;
    this.builtRailsLen = -1;
    this.builtFirstRailId = -1;
    this.builtPadsLen = -1;
    this.builtFirstPadId = -1;

    const palette = getTerrainPalette(mapId, mapTier);
    const rng = createLocalRng(seed ^ (mapTier * 7919));

    this.buildTerrainSurface(terrain, palette, seed);
    this.buildBoundaryCliffs(terrain, palette, rng);
    this.buildProceduralProps(mapId, terrain, rng);
    this.buildWindGrass(terrain, palette, rng, grassQuality);
  }

  public setGrassQuality(quality: GrassQuality): void {
    this.currentGrassQuality = quality;
    if (this.grassMesh) {
      const palette = getTerrainPalette(this.currentMapId, this.currentMapTier);
      this.grassMesh.count = palette.showGrass ? GRASS_COUNTS[quality] : 0;
    }
  }

  public refreshTextures(): void {
    if (this.terrainMat) {
      const pal = getTerrainPalette(this.currentMapId, this.currentMapTier);
      setMkToonTexture(this.terrainMat, this.assets.getTexture(pal.detailTexture));
    }
    if (this.railMat) {
      setMkToonTexture(this.railMat, this.assets.getTexture('rail_energy'));
    }
  }

  /**
   * Lazily builds spline grind Rail meshes and JumpPad meshes once per map load
   * when SimState delivers rails & jumpPads (ZERO allocations on subsequent frames).
   */
  public ensureWorldFeatures(
    rails: readonly RailSplineDef[],
    jumpPads: readonly JumpPadDef[],
  ): void {
    const rLen = rails.length;
    const rFirst = rLen > 0 ? rails[0]!.id : -1;
    const pLen = jumpPads.length;
    const pFirst = pLen > 0 ? jumpPads[0]!.id : -1;
    if (
      rLen === this.builtRailsLen &&
      rFirst === this.builtFirstRailId &&
      pLen === this.builtPadsLen &&
      pFirst === this.builtFirstPadId
    ) {
      return;
    }
    this.builtRailsLen = rLen;
    this.builtFirstRailId = rFirst;
    this.builtPadsLen = pLen;
    this.builtFirstPadId = pFirst;
    this.clearFeatures();
    if (!this.currentTerrain) return;

    this.buildRailMeshes(rails, this.currentTerrain);
    this.buildJumpPadMeshes(jumpPads, this.currentTerrain);
  }

  /**
   * Updates animated world prop cues (jump pad pulsing chevrons) with zero allocations.
   */
  public updateAnimatedProps(timeSec: number): void {
    const count = this.jumpPadRings.length;
    for (let i = 0; i < count; i++) {
      const ring = this.jumpPadRings[i]!;
      const phase = (timeSec * 1.85 + i * 0.37) % 1.0;
      ring.position.y = 0.28 + phase * 1.45;
      const s = 0.82 + phase * 0.38;
      ring.scale.set(s, s, 1);
    }
  }

  /**
   * Updates contact shadow directly beneath player feet (zero allocations).
   */
  public updateContactShadow(
    playerX: number,
    playerY: number,
    playerZ: number,
    visible: boolean,
  ): void {
    if (!visible || !this.currentTerrain) {
      this.contactShadow.visible = false;
      return;
    }
    const sample = this.currentTerrain.sample(playerX, playerZ);
    const heightAboveGround = Math.max(0, playerY - sample.height);
    if (heightAboveGround > 16) {
      this.contactShadow.visible = false;
      return;
    }

    this.contactShadow.visible = true;
    this.contactShadow.position.set(playerX, sample.height + 0.06, playerZ);
    this._normal.set(sample.normal.x, sample.normal.y, sample.normal.z).normalize();
    this._quat.setFromUnitVectors(this._up, this._normal);
    this.contactShadow.quaternion.copy(this._quat);

    const t = Math.min(1, heightAboveGround / 12);
    const scale = 1.0 - t * 0.55;
    this.contactShadow.scale.setScalar(scale);
    this.contactShadowMat.opacity = 0.44 * (1.0 - t * 0.78);
  }

  // ---- Internal Builders ----

  private buildTerrainSurface(
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    seed: number,
  ): void {
    const gridCells = 120; // 300m / 120 = 2.5m crisp faceted low-poly tiles
    const span = Math.max(300, terrain.arenaRadius * 2 + 12);
    const halfSpan = span * 0.5;
    const step = span / gridCells;
    const vertsPerSide = gridCells + 1;

    // Sample heights & slopes once into flat typed buffers
    const heights = new Float32Array(vertsPerSide * vertsPerSide);
    const slopes = new Float32Array(vertsPerSide * vertsPerSide);

    let minH = Infinity;
    let maxH = -Infinity;
    for (let gz = 0; gz < vertsPerSide; gz++) {
      const wz = -halfSpan + gz * step;
      for (let gx = 0; gx < vertsPerSide; gx++) {
        const wx = -halfSpan + gx * step;
        const idx = gz * vertsPerSide + gx;
        const s = terrain.sample(wx, wz);
        const h = Number.isFinite(s.height) ? s.height : 0;
        heights[idx] = h;
        slopes[idx] = Number.isFinite(s.slopeAngleRad) ? s.slopeAngleRad : 0;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    const hRange = Math.max(1, maxH - minH);

    // Pre-compute subtle baked cliff-base AO per vertex
    const aoFactors = new Float32Array(vertsPerSide * vertsPerSide);
    for (let gz = 0; gz < vertsPerSide; gz++) {
      for (let gx = 0; gx < vertsPerSide; gx++) {
        const idx = gz * vertsPerSide + gx;
        const centerH = heights[idx]!;
        let maxNeighborDiff = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = gz + dz;
          if (nz < 0 || nz >= vertsPerSide) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= vertsPerSide) continue;
            const diff = heights[nz * vertsPerSide + nx]! - centerH;
            if (diff > maxNeighborDiff) maxNeighborDiff = diff;
          }
        }
        // Darken valley feet next to steep cliff rises
        aoFactors[idx] = Math.min(0.45, Math.max(0, (maxNeighborDiff - 0.85) * 0.14));
      }
    }

    // Build non-indexed flat-faceted triangles so every plateau & ramp gleams with crisp MK-Toon bands!
    const quadCount = gridCells * gridCells;
    const vertCount = quadCount * 6;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const colors = new Float32Array(vertCount * 3);

    const colFlatLow = new THREE.Color(palette.flatLow);
    const colFlatMid = new THREE.Color(palette.flatMid);
    const colFlatHigh = new THREE.Color(palette.flatHigh);
    const colSlopeRim = new THREE.Color(palette.slopeRim);
    const colCliffLow = new THREE.Color(palette.cliffLow);
    const colCliffHigh = new THREE.Color(palette.cliffHigh);
    const colAo = new THREE.Color(palette.aoTint);
    const tmpCol = new THREE.Color();

    const uvTileScale = 1 / 5.0; // 1 crisp 32x32 pixel tile per 5m
    let outIdx = 0;

    const writeTri = (
      ax: number,
      ay: number,
      az: number,
      aoA: number,
      bx: number,
      by: number,
      bz: number,
      aoB: number,
      cx: number,
      cy: number,
      cz: number,
      aoC: number,
      slopeAvg: number,
      cellHash: number,
    ) => {
      const avgY = (ay + by + cy) / 3;
      const normH = Math.min(1, Math.max(0, (avgY - minH) / hRange));

      // Compute face normal slope directly for razor-accurate cliff detection
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const faceUp = Math.abs(ny) / nLen;
      const effectiveSlope = Math.max(slopeAvg, Math.acos(Math.min(1, faceUp)));

      // Crisp grass tops vs mossy rim vs steep rock cliffs
      if (effectiveSlope >= 0.62) {
        tmpCol.copy(colCliffLow).lerp(colCliffHigh, (normH * 0.7 + cellHash * 0.3) % 1);
      } else if (effectiveSlope >= 0.38) {
        tmpCol.copy(colSlopeRim).lerp(colCliffHigh, (effectiveSlope - 0.38) / 0.24);
      } else {
        if (normH < 0.5) {
          tmpCol.copy(colFlatLow).lerp(colFlatMid, normH * 2);
        } else {
          tmpCol.copy(colFlatMid).lerp(colFlatHigh, (normH - 0.5) * 2);
        }
        // Subtle crisp low-poly checker luminance variation
        tmpCol.multiplyScalar(0.95 + cellHash * 0.1);
      }

      const verts: [number, number, number, number][] = [
        [ax, ay, az, aoA],
        [bx, by, bz, aoB],
        [cx, cy, cz, aoC],
      ];

      for (let i = 0; i < 3; i++) {
        const v = verts[i]!;
        const o3 = outIdx * 3;
        const o2 = outIdx * 2;
        positions[o3] = v[0];
        positions[o3 + 1] = v[1];
        positions[o3 + 2] = v[2];
        uvs[o2] = v[0] * uvTileScale;
        uvs[o2 + 1] = v[2] * uvTileScale;

        // Apply per-vertex baked cliff-base AO
        const ao = v[3];
        colors[o3] = tmpCol.r * (1 - ao) + colAo.r * ao;
        colors[o3 + 1] = tmpCol.g * (1 - ao) + colAo.g * ao;
        colors[o3 + 2] = tmpCol.b * (1 - ao) + colAo.b * ao;
        outIdx++;
      }
    };

    for (let gz = 0; gz < gridCells; gz++) {
      const z0 = -halfSpan + gz * step;
      const z1 = z0 + step;
      for (let gx = 0; gx < gridCells; gx++) {
        const x0 = -halfSpan + gx * step;
        const x1 = x0 + step;

        const i00 = gz * vertsPerSide + gx;
        const i10 = i00 + 1;
        const i01 = i00 + vertsPerSide;
        const i11 = i01 + 1;

        const h00 = heights[i00]!;
        const h10 = heights[i10]!;
        const h01 = heights[i01]!;
        const h11 = heights[i11]!;

        const s00 = slopes[i00]!;
        const s10 = slopes[i10]!;
        const s01 = slopes[i01]!;
        const s11 = slopes[i11]!;

        const ao00 = aoFactors[i00]!;
        const ao10 = aoFactors[i10]!;
        const ao01 = aoFactors[i01]!;
        const ao11 = aoFactors[i11]!;

        const hBits = Math.imul(gx * 73856093 ^ gz * 19349663 ^ seed, 2654435761) >>> 0;
        const cellHash = (hBits & 255) / 255;

        // Triangle 1 (CCW upward)
        writeTri(
          x0, h00, z0, ao00,
          x0, h01, z1, ao01,
          x1, h10, z0, ao10,
          (s00 + s01 + s10) / 3,
          cellHash,
        );
        // Triangle 2
        writeTri(
          x1, h10, z0, ao10,
          x0, h01, z1, ao01,
          x1, h11, z1, ao11,
          (s10 + s01 + s11) / 3,
          cellHash,
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = createMkToonMaterial({
      color: 0xffffff,
      map: this.assets.getTexture(palette.detailTexture),
      mapStrength: 0.42,
      vertexColors: true,
      rimStrength: 0.14,
      rimColor: 0xb8f2ff,
      flatShading: true,
    });
    this.terrainMat = mat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.staticGroup.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  private buildBoundaryCliffs(
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    rng: () => number,
  ): void {
    const count = 48;
    const radius = terrain.arenaRadius + 4.5;
    const geo = new THREE.DodecahedronGeometry(6.5, 0);
    const mat = createMkToonMaterial({
      color: palette.cliffHigh,
      map: this.assets.getTexture('terrain_cliff'),
      mapStrength: 0.55,
      rimStrength: 0.2,
      flatShading: true,
    });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.08;
      const r = radius + (rng() - 0.3) * 6;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const s = terrain.sample(Math.cos(angle) * (terrain.arenaRadius - 2), Math.sin(angle) * (terrain.arenaRadius - 2));
      dummy.position.set(x, s.height + 1.5 + rng() * 3.5, z);
      dummy.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      dummy.scale.set(1.2 + rng() * 1.1, 1.3 + rng() * 1.4, 1.2 + rng() * 0.9);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.staticGroup.add(inst);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  private buildProceduralProps(
    mapId: MapId,
    terrain: ITerrainSampler,
    rng: () => number,
  ): void {
    const spawn = terrain.getSpawnPoint();
    const maxR = Math.max(40, terrain.arenaRadius - 10);

    const placeInstancedProp = (
      propKind: 'pine' | 'oak' | 'boulder' | 'ruin_pillar' | 'cactus' | 'tombstone',
      targetCount: number,
      minClearanceFromSpawn: number,
      scaleMin: number,
      scaleMax: number,
    ) => {
      const pair = this.assets.builtIn.getPropGeometryPair(propKind);
      const transforms: THREE.Matrix4[] = [];
      const dummy = new THREE.Object3D();
      const maxAttempts = targetCount * 6;

      for (let attempt = 0; attempt < maxAttempts && transforms.length < targetCount; attempt++) {
        const angle = rng() * Math.PI * 2;
        const r = minClearanceFromSpawn + Math.sqrt(rng()) * (maxR - minClearanceFromSpawn);
        const x = spawn.x + Math.cos(angle) * r;
        const z = spawn.z + Math.sin(angle) * r;

        const sample = terrain.sample(x, z);
        if (!sample.inBounds || sample.slopeAngleRad > 0.34) continue;

        // Avoid blocking straight cardinal corridors near spawn
        if (Math.hypot(x - spawn.x, z - spawn.z) < minClearanceFromSpawn) continue;

        const sc = scaleMin + rng() * (scaleMax - scaleMin);
        dummy.position.set(x, sample.height - 0.15, z);
        dummy.rotation.set(
          (rng() - 0.5) * 0.08,
          rng() * Math.PI * 2,
          (rng() - 0.5) * 0.08,
        );
        dummy.scale.set(sc, sc * (0.9 + rng() * 0.28), sc);
        dummy.updateMatrix();
        transforms.push(dummy.matrix.clone());
      }

      if (transforms.length === 0) return;

      const mat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.48,
        vertexColors: true,
        rimStrength: 0.32,
      });
      const outMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);

      const mesh = new THREE.InstancedMesh(pair.geometry, mat, transforms.length);
      const outMesh = new THREE.InstancedMesh(pair.outlineGeometry, outMat, transforms.length);

      for (let i = 0; i < transforms.length; i++) {
        mesh.setMatrixAt(i, transforms[i]!);
        outMesh.setMatrixAt(i, transforms[i]!);
      }
      mesh.instanceMatrix.needsUpdate = true;
      outMesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      outMesh.frustumCulled = false;

      this.staticGroup.add(mesh, outMesh);
      this.disposableMaterials.push(mat, outMat);
    };

    if (mapId === 'Desert') {
      placeInstancedProp('cactus', 70, 20, 0.85, 1.45);
      placeInstancedProp('boulder', 60, 22, 0.9, 1.8);
      placeInstancedProp('ruin_pillar', 24, 28, 0.9, 1.4);
    } else if (mapId === 'Graveyard') {
      placeInstancedProp('tombstone', 95, 18, 0.85, 1.35);
      placeInstancedProp('pine', 48, 24, 0.95, 1.45);
      placeInstancedProp('ruin_pillar', 30, 22, 0.9, 1.35);
    } else if (mapId === 'FinalBossMap') {
      placeInstancedProp('ruin_pillar', 36, 26, 1.0, 1.6);
      placeInstancedProp('boulder', 45, 24, 1.0, 1.9);
    } else {
      // Flagship Forest: lush outlined pine & oak groves + mossy boulders + ancient ruin pillars
      placeInstancedProp('pine', 115, 22, 0.85, 1.48);
      placeInstancedProp('oak', 68, 24, 0.9, 1.42);
      placeInstancedProp('boulder', 64, 18, 0.75, 1.55);
      placeInstancedProp('ruin_pillar', 18, 32, 0.95, 1.35);
    }
  }

  private buildWindGrass(
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    rng: () => number,
    quality: GrassQuality,
  ): void {
    const geo = createGrassTuftGeometry();
    const mat = createMkToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      windStrength: 0.28,
      rimStrength: 0.22,
      rimColor: 0xe6ff99,
    });

    const inst = new THREE.InstancedMesh(geo, mat, GRASS_CAPACITY);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cA = new THREE.Color(palette.grassRoot);
    const cB = new THREE.Color(palette.grassTip);

    const maxR = Math.max(30, terrain.arenaRadius - 4);
    let placed = 0;
    let attempts = 0;

    while (placed < GRASS_CAPACITY && attempts < GRASS_CAPACITY * 4) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * maxR;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const sample = terrain.sample(x, z);
      if (!sample.inBounds || sample.slopeAngleRad > 0.36) continue;

      const scaleXZ = 0.72 + rng() * 0.75;
      const scaleY = 0.68 + rng() * 0.85;
      dummy.position.set(x, sample.height - 0.04, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      dummy.updateMatrix();

      inst.setMatrixAt(placed, dummy.matrix);
      color.copy(cA).lerp(cB, 0.45 + rng() * 0.55);
      inst.setColorAt(placed, color);
      placed++;
    }

    inst.count = palette.showGrass ? Math.min(placed, GRASS_COUNTS[quality]) : 0;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;

    this.grassMesh = inst;
    this.grassMat = mat;
    this.staticGroup.add(inst);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  private buildRailMeshes(rails: readonly RailSplineDef[], terrain: ITerrainSampler): void {
    if (rails.length === 0) return;

    const railMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.assets.getTexture('rail_energy'),
      uvScale: [1, 1],
      emissive: 0x26d8ff,
      emissiveIntensity: 0.55,
      rimStrength: 0.5,
      rimColor: 0xffffff,
      gloss: 0.6,
    });
    const postMat = createMkToonMaterial({
      color: 0x4b596b,
      map: this.assets.getTexture('terrain_cliff'),
      mapStrength: 0.45,
      rimStrength: 0.25,
    });
    const outMat = createOutlineMaterial(0.052, 0x0b0d14);

    this.railMat = railMat;
    this.featureMaterials.push(railMat, postMat, outMat);

    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);

    for (const rail of rails) {
      if (rail.points.length < 2) continue;

      for (let i = 0; i < rail.points.length - 1; i++) {
        const a = rail.points[i]!;
        const b = rail.points[i + 1]!;
        p0.set(a.x, a.y, a.z);
        p1.set(b.x, b.y, b.z);
        const segLen = p0.distanceTo(p1);
        if (segLen < 0.05) continue;

        mid.addVectors(p0, p1).multiplyScalar(0.5);
        dir.subVectors(p1, p0).normalize();
        quat.setFromUnitVectors(zAxis, dir);

        // Glowing beveled rail beam + seamless smooth-normal ink outline
        const beamGeo = new THREE.BoxGeometry(0.46, 0.24, segLen + 0.08);
        const beamOutGeo = createSmoothOutlineGeometry(beamGeo);
        const beamMesh = new THREE.Mesh(beamGeo, railMat);
        beamMesh.position.copy(mid);
        beamMesh.quaternion.copy(quat);

        const beamOut = new THREE.Mesh(beamOutGeo, outMat);
        beamMesh.add(beamOut);
        this.featuresGroup.add(beamMesh);
        this.featureGeometries.push(beamGeo, beamOutGeo);
      }

      // Grounded vertical support pylons along rail points
      for (let i = 0; i < rail.points.length; i++) {
        if (i !== 0 && i !== rail.points.length - 1 && i % 2 !== 0) continue;
        const pt = rail.points[i]!;
        const groundY = terrain.sample(pt.x, pt.z).height;
        const postHeight = Math.max(0.5, pt.y - groundY + 0.4);
        const postGeo = new THREE.CylinderGeometry(0.18, 0.26, postHeight, 6);
        const postMesh = new THREE.Mesh(postGeo, postMat);
        postMesh.position.set(pt.x, groundY + postHeight * 0.5 - 0.2, pt.z);
        const postOut = new THREE.Mesh(postGeo, outMat);
        postMesh.add(postOut);
        this.featuresGroup.add(postMesh);
        this.featureGeometries.push(postGeo);
      }
    }
  }

  private buildJumpPadMeshes(jumpPads: readonly JumpPadDef[], terrain: ITerrainSampler): void {
    if (jumpPads.length === 0) return;

    const baseMat = createMkToonMaterial({
      color: 0x354052,
      rimStrength: 0.35,
      gloss: 0.5,
    });
    const discMat = createMkToonMaterial({
      color: 0x5cf7ff,
      map: this.assets.getTexture('jump_pad'),
      emissive: 0x38e8ff,
      emissiveIntensity: 0.95,
      rimStrength: 0.65,
      rimColor: 0xffffff,
    });
    const ringMat = createMkToonMaterial({
      color: 0x80faff,
      emissive: 0x38f2ff,
      emissiveIntensity: 1.25,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const outMat = createOutlineMaterial(0.055, 0x0b0d14);
    this.featureMaterials.push(baseMat, discMat, ringMat, outMat);

    for (const pad of jumpPads) {
      const r = Math.max(1.2, pad.radius);
      const groundY = Math.max(pad.pos.y, terrain.sample(pad.pos.x, pad.pos.z).height);

      const group = new THREE.Group();
      group.position.set(pad.pos.x, groundY + 0.05, pad.pos.z);

      const baseGeo = new THREE.CylinderGeometry(r * 0.96, r * 1.12, 0.34, 8);
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.17;
      baseMesh.add(new THREE.Mesh(baseGeo, outMat));

      const discGeo = new THREE.CylinderGeometry(r * 0.78, r * 0.82, 0.22, 8);
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = 0.36;

      const chevGeo = new THREE.TorusGeometry(r * 0.66, 0.08, 4, 12);
      const chevMesh = new THREE.Mesh(chevGeo, ringMat);
      chevMesh.rotation.x = Math.PI * 0.5;
      chevMesh.position.y = 0.6;

      group.add(baseMesh, discMesh, chevMesh);
      this.featuresGroup.add(group);
      this.jumpPadRings.push(chevMesh);
      this.featureGeometries.push(baseGeo, discGeo, chevGeo);
    }
  }

  private clearStatic(): void {
    while (this.staticGroup.children.length > 0) {
      this.staticGroup.remove(this.staticGroup.children[0]!);
    }
    for (const g of this.disposableGeometries) g.dispose();
    for (const m of this.disposableMaterials) m.dispose();
    this.disposableGeometries.length = 0;
    this.disposableMaterials.length = 0;
    this.terrainMat = null;
    this.grassMesh = null;
    this.grassMat = null;
  }

  private clearFeatures(): void {
    while (this.featuresGroup.children.length > 0) {
      this.featuresGroup.remove(this.featuresGroup.children[0]!);
    }
    for (const g of this.featureGeometries) g.dispose();
    for (const m of this.featureMaterials) m.dispose();
    this.featureGeometries.length = 0;
    this.featureMaterials.length = 0;
    this.jumpPadRings.length = 0;
    this.railMat = null;
  }

  public dispose(): void {
    this.clearStatic();
    this.clearFeatures();
    this.contactShadowGeo.dispose();
    this.contactShadowMat.dispose();
  }
}
