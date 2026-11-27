/**
 * KRUNKEDBONK — Stylized 4-Biome Terrain, Props, Weather, Rails, Jump Pads & Wind-Swayed Grass Builder
 *
 * Renders ALL 4 biomes cleanly from ITerrainSampler with crisp MK-Toon vertex coloring,
 * biome-specific outlined props, instanced wind-swayed foliage, and animated environmental weather:
 * - Forest (T1 emerald, T2 deep indigo-purple twilight, T3 cursed crimson-ash): pine/oak groves,
 *   mossy boulders, ruin pillars, bright 4-blade wind-swayed grass
 * - Desert (T1 golden dunes, T2 twilight blue dunes, T3 scorched crimson dunes): banded sandstone
 *   dunes, outlined saguaro cacti, sandstone obelisks, desert scrub tufts, Sandstorm dust motes,
 *   and towering spinning Tornado cyclone funnels!
 * - Graveyard (haunted violet 19x19 maze): stone flagstone lanes, crypt courtyard tinting, outlined
 *   tombstones, crooked dead trees, iron fence pillars, crypt archways, purple-tinted mist grass!
 * - FinalBossMap: circular obsidian & gold-trimmed colosseum floor, symmetrical perimeter pillars,
 *   and glowing molten magma/void rim outside the arena!
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
import type { ProceduralTextureId, PropKind } from '../assets/ProceduralLowPolyPack';
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
const SANDSTORM_MOTE_COUNT = 180;
const DESERT_TORNADO_COUNT = 3;

function createLocalRng(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createGrassTuftGeometry(): THREE.BufferGeometry {
  const bladeCount = 4;
  const vertsPerBlade = 3;
  const totalVerts = bladeCount * vertsPerBlade;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  const rootCol = new THREE.Color(0x888888);
  const tipCol = new THREE.Color(0xffffff);

  let vi = 0;
  for (let b = 0; b < bladeCount; b++) {
    const angle = (b / bladeCount) * Math.PI + (b % 2 === 1 ? 0.18 : 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = 0.2;
    const h = 0.68 + (b % 2) * 0.22 + (b === 3 ? 0.08 : 0);
    const lean = 0.16;

    const bx = cos * 0.1;
    const bz = sin * 0.1;

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
  cliffTexture: ProceduralTextureId;
  grassRoot: number;
  grassTip: number;
  grassDensityScale: number;
  showGrass: boolean;
  dustColor: number;
  tornadoColor: number;
}

function getTerrainPalette(mapId: MapId, tier: MapTier): TerrainColorPalette {
  if (mapId === 'Desert') {
    if (tier === 2) {
      // StageDesert2: Twilight Desert (cool blue twilight dunes!)
      return {
        flatLow: 0x5c7db5,
        flatMid: 0x7ba0d9,
        flatHigh: 0xa6c8f5,
        slopeRim: 0x4c689e,
        cliffLow: 0x354773,
        cliffHigh: 0x50699c,
        aoTint: 0x222d52,
        detailTexture: 'terrain_desert',
        cliffTexture: 'desert_sandstone',
        grassRoot: 0x4b6e78,
        grassTip: 0x8cc8d9,
        grassDensityScale: 0.28,
        showGrass: true,
        dustColor: 0x99c4ff,
        tornadoColor: 0x7aa8e8,
      };
    }
    if (tier === 3) {
      // StageDesert3: Scorched Desert (crimson-rust dunes!)
      return {
        flatLow: 0x993a2b,
        flatMid: 0xc25238,
        flatHigh: 0xe3764d,
        slopeRim: 0x802b24,
        cliffLow: 0x591b1a,
        cliffHigh: 0x7a2824,
        aoTint: 0x331014,
        detailTexture: 'terrain_desert',
        cliffTexture: 'desert_sandstone',
        grassRoot: 0x6b2f24,
        grassTip: 0xd96b38,
        grassDensityScale: 0.24,
        showGrass: true,
        dustColor: 0xe68866,
        tornadoColor: 0xc94a36,
      };
    }
    // StageDesert1: Crusty Desert (warm golden dunes!)
    return {
      flatLow: 0xd99642,
      flatMid: 0xf2c26b,
      flatHigh: 0xffe49e,
      slopeRim: 0xc47735,
      cliffLow: 0x99522e,
      cliffHigh: 0xb86d3b,
      aoTint: 0x5e342f,
      detailTexture: 'terrain_desert',
      cliffTexture: 'desert_sandstone',
      grassRoot: 0x8c7b32,
      grassTip: 0xd6c058,
      grassDensityScale: 0.3,
      showGrass: true,
      dustColor: 0xffe09c,
      tornadoColor: 0xe6b566,
    };
  }

  if (mapId === 'Graveyard') {
    // StageGraveyard: Haunted violet 19x19 flagstone & mist grass!
    return {
      flatLow: 0x3a3754,
      flatMid: 0x4c486b,
      flatHigh: 0x625d82,
      slopeRim: 0x4e4369,
      cliffLow: 0x29263d,
      cliffHigh: 0x433e5e,
      aoTint: 0x191529,
      detailTexture: 'terrain_graveyard',
      cliffTexture: 'graveyard_cobble',
      grassRoot: 0x3f2e66,
      grassTip: 0x8b70bf,
      grassDensityScale: 0.65,
      showGrass: true,
      dustColor: 0xb299e6,
      tornadoColor: 0x8b6ec4,
    };
  }

  if (mapId === 'FinalBossMap') {
    // FinalBossMap: Circular Obsidian & Gold-Trimmed Colosseum!
    return {
      flatLow: 0x221a30,
      flatMid: 0x312645,
      flatHigh: 0x42335c,
      slopeRim: 0x6b2852,
      cliffLow: 0x161021,
      cliffHigh: 0x291e3d,
      aoTint: 0x10081a,
      detailTexture: 'terrain_citadel',
      cliffTexture: 'citadel_obsidian',
      grassRoot: 0x421c5e,
      grassTip: 0xb938ff,
      grassDensityScale: 0,
      showGrass: false,
      dustColor: 0xffb703,
      tornadoColor: 0xff4d2e,
    };
  }

  // Forest T2 (Deep Forest — indigo-purple twilight) & T3 (Cursed Forest — crimson-ash)
  if (tier === 2) {
    return {
      flatLow: 0x2e5766,
      flatMid: 0x447a80,
      flatHigh: 0x629994,
      slopeRim: 0x4d467a,
      cliffLow: 0x2e2854,
      cliffHigh: 0x494078,
      aoTint: 0x1d173d,
      detailTexture: 'terrain_grass',
      cliffTexture: 'terrain_cliff',
      grassRoot: 0x344a75,
      grassTip: 0x8a82e0,
      grassDensityScale: 0.9,
      showGrass: true,
      dustColor: 0x9c82e0,
      tornadoColor: 0x6b56b3,
    };
  }
  if (tier === 3) {
    return {
      flatLow: 0x5c2b26,
      flatMid: 0x803e30,
      flatHigh: 0xa65338,
      slopeRim: 0x522629,
      cliffLow: 0x2e171a,
      cliffHigh: 0x4d2629,
      aoTint: 0x1c0b0e,
      detailTexture: 'terrain_grass',
      cliffTexture: 'terrain_cliff',
      grassRoot: 0x5e2320,
      grassTip: 0xd95838,
      grassDensityScale: 0.78,
      showGrass: true,
      dustColor: 0xff6b3d,
      tornadoColor: 0xb83226,
    };
  }

  // Flagship StageForest1: Lush sunlit emerald-lime plateaus & slate cliffs!
  return {
    flatLow: 0x45ad46,
    flatMid: 0x6fd145,
    flatHigh: 0x9ce352,
    slopeRim: 0x5a9163,
    cliffLow: 0x526b7a,
    cliffHigh: 0x7993a3,
    aoTint: 0x243b57,
    detailTexture: 'terrain_grass',
    cliffTexture: 'terrain_cliff',
    grassRoot: 0x2b823f,
    grassTip: 0xc5f759,
    grassDensityScale: 1.0,
    showGrass: true,
    dustColor: 0xd8ff99,
    tornadoColor: 0x88e882,
  };
}

interface DesertTornadoRig {
  group: THREE.Group;
  tiers: THREE.Mesh[];
  orbitOrbitRadius: number;
  orbitSpeed: number;
  phaseOffset: number;
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
  private magmaRimMat: THREE.ShaderMaterial | null = null;
  private jumpPadRings: THREE.Mesh[] = [];

  // Desert animated Sandstorm dust motes + towering Tornado cyclone funnels (ZERO per-frame allocs!)
  private sandstormMesh: THREE.InstancedMesh | null = null;
  private readonly sandMoteSeed = new Float32Array(SANDSTORM_MOTE_COUNT * 4);
  private readonly desertTornadoes: DesertTornadoRig[] = [];
  private currentSeed = 1;
  private currentGrassMaxPlaced = 0;

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

  // Scratch math objects for ZERO-GC updates
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _normal = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _mat = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _euler = new THREE.Euler();
  private readonly _scale = new THREE.Vector3();
  private readonly _lavaColor = new THREE.Color(0xff4214);
  private readonly _lavaBase = new THREE.Color(1.0, 0.72, 0.56);
  private readonly _white = new THREE.Color(0xffffff);
  private readonly _black = new THREE.Color(0x000000);
  private floorIsLavaActive = false;

  constructor(assets: AssetRegistry) {
    this.assets = assets;
    this.rootGroup.name = 'TerrainRoot';
    this.rootGroup.add(this.staticGroup, this.featuresGroup);

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
    this.currentSeed = seed;
    this.currentTerrain = terrain;
    this.currentGrassQuality = grassQuality;
    this.builtRailsLen = -1;
    this.builtFirstRailId = -1;
    this.builtPadsLen = -1;
    this.builtFirstPadId = -1;

    const palette = getTerrainPalette(mapId, mapTier);
    const rng = createLocalRng(seed ^ (mapTier * 7919));

    this.buildTerrainSurface(mapId, terrain, palette, seed);
    this.buildBoundaryEnvironment(mapId, terrain, palette, rng);
    this.buildProceduralProps(mapId, mapTier, terrain, rng);
    this.buildWindGrass(terrain, palette, rng, grassQuality);

    if (mapId === 'Desert') {
      this.buildDesertWeather(terrain, palette, rng);
    }
  }

  public setGrassQuality(quality: GrassQuality): void {
    this.currentGrassQuality = quality;
    if (this.grassMesh) {
      const palette = getTerrainPalette(this.currentMapId, this.currentMapTier);
      const scaledTarget = Math.floor(GRASS_COUNTS[quality] * palette.grassDensityScale);
      this.grassMesh.count = palette.showGrass ? Math.min(this.currentGrassMaxPlaced, scaledTarget) : 0;
    }
  }

  /**
   * Toggles glowing molten lava floor tint for "The Floor is Lava" challenge (ZERO allocations!).
   */
  public setFloorIsLava(active: boolean, timeSec: number): void {
    if (!this.terrainMat) return;
    if (!active && !this.floorIsLavaActive) return;
    this.floorIsLavaActive = active;

    const uBase = this.terrainMat.uniforms.uBaseColor?.value as THREE.Color | undefined;
    const uEmissive = this.terrainMat.uniforms.uEmissive?.value as THREE.Color | undefined;
    const uEmissiveInt = this.terrainMat.uniforms.uEmissiveIntensity;

    if (active) {
      const pulse = 0.26 + Math.sin(timeSec * 4.5) * 0.08;
      if (uBase) uBase.copy(this._lavaBase);
      if (uEmissive) uEmissive.copy(this._lavaColor);
      if (uEmissiveInt) uEmissiveInt.value = pulse;
    } else {
      if (uBase) uBase.copy(this._white);
      if (uEmissive) uEmissive.copy(this._black);
      if (uEmissiveInt) uEmissiveInt.value = 0;
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
    if (this.magmaRimMat) {
      setMkToonTexture(this.magmaRimMat, this.assets.getTexture('citadel_magma'));
    }
  }

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
   * Updates animated world prop cues (jump pad rings, Desert sandstorm motes, Desert tornadoes,
   * FinalBossMap magma rim pulse) with ZERO per-frame allocations!
   */
  public updateAnimatedProps(timeSec: number, playerX = 0, playerZ = 0): void {
    // 1. Pulsing Jump Pad chevrons
    const padCount = this.jumpPadRings.length;
    for (let i = 0; i < padCount; i++) {
      const ring = this.jumpPadRings[i]!;
      const phase = (timeSec * 1.85 + i * 0.37) % 1.0;
      ring.position.y = 0.28 + phase * 1.45;
      const s = 0.82 + phase * 0.38;
      ring.scale.set(s, s, 1);
    }

    // 2. FinalBossMap glowing magma/void chasm rim pulse
    if (this.magmaRimMat) {
      const uInt = this.magmaRimMat.uniforms.uEmissiveIntensity;
      if (uInt) uInt.value = 0.88 + Math.sin(timeSec * 2.6) * 0.18;
    }

    // 3. Desert Sandstorm drifting dust motes (localized around player for rich density!)
    if (this.sandstormMesh) {
      const span = 120;
      const half = span * 0.5;
      const windX = timeSec * 16.5;
      const windZ = timeSec * 7.2;
      for (let i = 0; i < SANDSTORM_MOTE_COUNT; i++) {
        const b = i * 4;
        const ox = this.sandMoteSeed[b]!;
        const oy = this.sandMoteSeed[b + 1]!;
        const oz = this.sandMoteSeed[b + 2]!;
        const sc = this.sandMoteSeed[b + 3]!;

        // Wrap deterministically in [player - half, player + half]
        let wx = ((ox + windX - playerX + half) % span + span) % span - half + playerX;
        let wz = ((oz + windZ - playerZ + half) % span + span) % span - half + playerZ;
        const groundY = this.currentTerrain ? this.currentTerrain.sample(wx, wz).height : 0;
        const wy = groundY + 0.8 + ((oy + Math.sin(timeSec * 2.2 + i) * 1.4 + 14) % 14);

        this._pos.set(wx, wy, wz);
        this._euler.set(timeSec * 3.1 + i, timeSec * 4.2 + i, 0);
        this._quat.setFromEuler(this._euler);
        this._scale.set(sc * 1.6, sc * 0.7, sc * 0.7);
        this._mat.compose(this._pos, this._quat, this._scale);
        this.sandstormMesh.setMatrixAt(i, this._mat);
      }
      this.sandstormMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Towering spinning Desert Tornado cyclone funnels roaming across the dunes!
    if (this.desertTornadoes.length > 0 && this.currentTerrain) {
      for (let i = 0; i < this.desertTornadoes.length; i++) {
        const tRig = this.desertTornadoes[i]!;
        const a = timeSec * tRig.orbitSpeed + tRig.phaseOffset;
        const r = tRig.orbitOrbitRadius * (0.78 + Math.sin(timeSec * 0.14 + i * 2.1) * 0.22);
        const tx = Math.cos(a) * r;
        const tz = Math.sin(a * 1.25 + this.currentSeed * 0.01) * r;
        const ty = this.currentTerrain.sample(tx, tz).height;

        tRig.group.position.set(tx, ty - 0.4, tz);
        // Subtle leaning sway of towering funnel
        tRig.group.rotation.set(
          Math.sin(timeSec * 1.8 + i) * 0.07,
          0,
          Math.cos(timeSec * 1.5 + i) * 0.07,
        );
        for (let k = 0; k < tRig.tiers.length; k++) {
          const tierMesh = tRig.tiers[k]!;
          tierMesh.rotation.y = timeSec * (5.5 + k * 1.4) * (k % 2 === 0 ? 1 : -0.85);
        }
      }
    }
  }

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
    mapId: MapId,
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    seed: number,
  ): void {
    const gridCells = mapId === 'Graveyard' ? 128 : 120;
    const span = Math.max(300, terrain.arenaRadius * 2 + 12);
    const halfSpan = span * 0.5;
    const step = span / gridCells;
    const vertsPerSide = gridCells + 1;

    const heights = new Float32Array(vertsPerSide * vertsPerSide);
    const slopes = new Float32Array(vertsPerSide * vertsPerSide);
    const tags = new Uint8Array(vertsPerSide * vertsPerSide); // 0=normal, 1=crypt, 2=void

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
        tags[idx] = !s.inBounds || s.surfaceTag === 'void' ? 2 : s.surfaceTag === 'crypt' ? 1 : 0;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    const hRange = Math.max(1, maxH - minH);

    // Subtle baked cliff-base AO per vertex
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
        aoFactors[idx] = Math.min(0.45, Math.max(0, (maxNeighborDiff - 0.85) * 0.14));
      }
    }

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
    const colGoldTrim = new THREE.Color(0xf5c542);
    const colCrypt = new THREE.Color(0x523b7a);
    const colGraveLane = new THREE.Color(0x636c82);
    const colMagmaEdge = new THREE.Color(0xd93826);
    const tmpCol = new THREE.Color();

    const uvTileScale = 1 / 5.0;
    const arenaR = terrain.arenaRadius;
    let outIdx = 0;

    const writeTri = (
      ax: number, ay: number, az: number, aoA: number,
      bx: number, by: number, bz: number, aoB: number,
      cx: number, cy: number, cz: number, aoC: number,
      slopeAvg: number,
      cellHash: number,
      tagCode: number,
    ) => {
      const avgX = (ax + bx + cx) / 3;
      const avgY = (ay + by + cy) / 3;
      const avgZ = (az + bz + cz) / 3;
      const normH = Math.min(1, Math.max(0, (avgY - minH) / hRange));

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

        // Biome-specific stylized surface details!
        if (mapId === 'Desert') {
          // Crisp sandstone dune contour bands!
          const band = Math.sin(avgY * 1.45 + avgX * 0.04) * 0.5 + 0.5;
          tmpCol.multiplyScalar(0.92 + band * 0.14);
        } else if (mapId === 'Graveyard') {
          if (tagCode === 1) {
            tmpCol.lerp(colCrypt, 0.55);
          } else {
            // Crisp flagstone graveyard avenue lanes every 20m matching 19x19 grid!
            const lx = Math.abs(((avgX + 10) % 20 + 20) % 20 - 10);
            const lz = Math.abs(((avgZ + 10) % 20 + 20) % 20 - 10);
            if (lx < 2.4 || lz < 2.4) {
              tmpCol.lerp(colGraveLane, 0.45);
            }
          }
          tmpCol.multiplyScalar(0.95 + cellHash * 0.09);
        } else if (mapId === 'FinalBossMap') {
          // Dramatic circular Obsidian & Gold-Trimmed Colosseum inlay rings + glowing rim!
          const r = Math.hypot(avgX, avgZ);
          const goldRing =
            Math.abs(r - 22) < 1.8 ||
            Math.abs(r - 48) < 1.6 ||
            Math.abs(r - 76) < 1.8 ||
            Math.abs(r - (arenaR - 4)) < 2.2;
          if (goldRing) {
            tmpCol.lerp(colGoldTrim, 0.78);
          } else if (r > arenaR - 1) {
            tmpCol.lerp(colMagmaEdge, 0.75);
          } else {
            // Radial colosseum obsidian spoke mosaic
            const ang = Math.atan2(avgZ, avgX);
            const spoke = Math.abs(Math.sin(ang * 11)) < 0.08 && r > 18 && r < arenaR - 6;
            if (spoke) tmpCol.lerp(colGoldTrim, 0.32);
            tmpCol.multiplyScalar(0.94 + cellHash * 0.1);
          }
        } else {
          tmpCol.multiplyScalar(0.95 + cellHash * 0.1);
        }
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

        const tag = tags[i00]!;
        const hBits = Math.imul(gx * 73856093 ^ gz * 19349663 ^ seed, 2654435761) >>> 0;
        const cellHash = (hBits & 255) / 255;

        writeTri(x0, h00, z0, ao00, x0, h01, z1, ao01, x1, h10, z0, ao10, (s00 + s01 + s10) / 3, cellHash, tag);
        writeTri(x1, h10, z0, ao10, x0, h01, z1, ao01, x1, h11, z1, ao11, (s10 + s01 + s11) / 3, cellHash, tag);
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
      mapStrength: mapId === 'FinalBossMap' ? 0.52 : 0.42,
      vertexColors: true,
      rimStrength: mapId === 'FinalBossMap' ? 0.22 : 0.14,
      rimColor: mapId === 'FinalBossMap' ? 0xffc83b : 0xb8f2ff,
      flatShading: true,
    });
    this.terrainMat = mat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.staticGroup.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  private buildBoundaryEnvironment(
    mapId: MapId,
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    rng: () => number,
  ): void {
    if (mapId === 'FinalBossMap') {
      // Glowing molten Magma / Void Chasm Ring encircling the circular Obsidian Colosseum!
      const innerR = Math.max(60, terrain.arenaRadius - 2);
      const outerR = innerR + 64;
      const rimGeo = new THREE.RingGeometry(innerR, outerR, 44, 3);
      rimGeo.rotateX(-Math.PI * 0.5);
      const rimMat = createMkToonMaterial({
        color: 0xff5a1f,
        map: this.assets.getTexture('citadel_magma'),
        uvScale: [12, 12],
        emissive: 0xff3b1f,
        emissiveIntensity: 0.92,
        side: THREE.DoubleSide,
      });
      this.magmaRimMat = rimMat;
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = 0.8;
      this.staticGroup.add(rimMesh);
      this.disposableGeometries.push(rimGeo);
      this.disposableMaterials.push(rimMat);

      // Symmetrical Colosseum Perimeter Obsidian-Gold Obelisks (22 around rim!)
      const pillarPair = this.assets.builtIn.getPropGeometryPair('citadel_pillar');
      const pillarMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pillarPair.textureKey),
        mapStrength: 0.52,
        vertexColors: true,
        emissive: pillarPair.emissiveHex ?? 0x000000,
        emissiveIntensity: pillarPair.emissiveIntensity ?? 0.35,
        rimStrength: 0.42,
        rimColor: 0xffd23f,
      });
      const pillarOutMat = createOutlineMaterial(pillarPair.outlineThickness, 0x08060e);
      const pCount = 22;
      const pInst = new THREE.InstancedMesh(pillarPair.geometry, pillarMat, pCount);
      const pOut = new THREE.InstancedMesh(pillarPair.outlineGeometry, pillarOutMat, pCount);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < pCount; i++) {
        const angle = (i / pCount) * Math.PI * 2;
        const r = terrain.arenaRadius - 2.5;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const h = terrain.sample(x, z).height;
        dummy.position.set(x, h - 0.3, z);
        dummy.rotation.set(0, -angle, 0);
        const sc = i % 2 === 0 ? 1.45 : 1.1;
        dummy.scale.set(sc, sc * 1.15, sc);
        dummy.updateMatrix();
        pInst.setMatrixAt(i, dummy.matrix);
        pOut.setMatrixAt(i, dummy.matrix);
      }
      pInst.instanceMatrix.needsUpdate = true;
      pOut.instanceMatrix.needsUpdate = true;
      pInst.frustumCulled = false;
      pOut.frustumCulled = false;
      this.staticGroup.add(pInst, pOut);
      this.disposableMaterials.push(pillarMat, pillarOutMat);
      return;
    }

    // Perimeter cliffs / sandstone mesas / graveyard wall crags
    const count = 48;
    const radius = terrain.arenaRadius + 4.5;
    const geo = new THREE.DodecahedronGeometry(6.5, 0);
    const mat = createMkToonMaterial({
      color: palette.cliffHigh,
      map: this.assets.getTexture(palette.cliffTexture),
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
      const s = terrain.sample(
        Math.cos(angle) * (terrain.arenaRadius - 2),
        Math.sin(angle) * (terrain.arenaRadius - 2),
      );
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
    mapTier: MapTier,
    terrain: ITerrainSampler,
    rng: () => number,
  ): void {
    const spawn = terrain.getSpawnPoint();
    const maxR = Math.max(40, terrain.arenaRadius - 10);

    const placeInstancedProp = (
      propKind: PropKind,
      targetCount: number,
      minClearanceFromSpawn: number,
      scaleMin: number,
      scaleMax: number,
      tintHex = 0xffffff,
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
        if (!sample.inBounds || sample.slopeAngleRad > 0.36) continue;
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
        color: tintHex,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.48,
        vertexColors: true,
        rimStrength: 0.32,
        emissive: pair.emissiveHex ?? 0x000000,
        emissiveIntensity: pair.emissiveIntensity ?? 0,
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
      const rockTint = mapTier === 2 ? 0x99bdf5 : mapTier === 3 ? 0xe08270 : 0xffffff;
      const cactusTint = mapTier === 2 ? 0x8cc8f5 : mapTier === 3 ? 0xd98f70 : 0xffffff;
      placeInstancedProp('cactus', 84, 20, 0.85, 1.5, cactusTint);
      placeInstancedProp('sandstone_obelisk', 28, 26, 0.9, 1.45, rockTint);
      placeInstancedProp('desert_boulder', 66, 20, 0.85, 1.85, rockTint);
    } else if (mapId === 'Graveyard') {
      placeInstancedProp('tombstone', 110, 16, 0.85, 1.38);
      placeInstancedProp('dead_tree', 56, 22, 0.9, 1.45);
      placeInstancedProp('iron_fence', 44, 22, 0.95, 1.25);
      placeInstancedProp('crypt_arch', 10, 34, 1.0, 1.3);
    } else if (mapId === 'FinalBossMap') {
      placeInstancedProp('citadel_pillar', 12, 34, 0.72, 0.95);
    } else {
      // Forest T1 (emerald), T2 (twilight indigo-teal), T3 (cursed crimson-ash)
      const treeTint = mapTier === 2 ? 0x9fa8f5 : mapTier === 3 ? 0xe68875 : 0xffffff;
      placeInstancedProp('pine', 115, 22, 0.85, 1.48, treeTint);
      placeInstancedProp('oak', 68, 24, 0.9, 1.42, treeTint);
      if (mapTier === 3) {
        placeInstancedProp('dead_tree', 32, 24, 0.9, 1.35, 0xbfa39e);
      }
      placeInstancedProp('boulder', 64, 18, 0.75, 1.55, treeTint);
      placeInstancedProp('ruin_pillar', 18, 32, 0.95, 1.35, treeTint);
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
      windStrength: this.currentMapId === 'Desert' ? 0.36 : 0.28,
      rimStrength: 0.22,
      rimColor: palette.grassTip,
    });

    const inst = new THREE.InstancedMesh(geo, mat, GRASS_CAPACITY);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cA = new THREE.Color(palette.grassRoot);
    const cB = new THREE.Color(palette.grassTip);

    const maxR = Math.max(30, terrain.arenaRadius - 4);
    const maxCap = Math.min(GRASS_CAPACITY, Math.ceil(GRASS_CAPACITY * Math.max(0.1, palette.grassDensityScale)));
    let placed = 0;
    let attempts = 0;

    while (placed < maxCap && attempts < maxCap * 4) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * maxR;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const sample = terrain.sample(x, z);
      if (!sample.inBounds || sample.slopeAngleRad > 0.36) continue;

      const scaleXZ = 0.72 + rng() * 0.75;
      const scaleY = (this.currentMapId === 'Desert' ? 0.55 : 0.68) + rng() * 0.85;
      dummy.position.set(x, sample.height - 0.04, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      dummy.updateMatrix();

      inst.setMatrixAt(placed, dummy.matrix);
      color.copy(cA).lerp(cB, 0.4 + rng() * 0.6);
      inst.setColorAt(placed, color);
      placed++;
    }

    this.currentGrassMaxPlaced = placed;
    const targetCount = Math.floor(GRASS_COUNTS[quality] * palette.grassDensityScale);
    inst.count = palette.showGrass ? Math.min(placed, targetCount) : 0;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;

    this.grassMesh = inst;
    this.grassMat = mat;
    this.staticGroup.add(inst);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  /**
   * Builds Desert Sandstorm floating dust motes & towering spinning Tornado cyclone funnels!
   */
  private buildDesertWeather(
    terrain: ITerrainSampler,
    palette: TerrainColorPalette,
    rng: () => number,
  ): void {
    // 1. Floating Sandstorm dust particles
    const moteGeo = new THREE.OctahedronGeometry(0.16, 0);
    const moteMat = createMkToonMaterial({
      color: palette.dustColor,
      emissive: palette.dustColor,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.72,
    });
    const moteInst = new THREE.InstancedMesh(moteGeo, moteMat, SANDSTORM_MOTE_COUNT);
    moteInst.frustumCulled = false;
    for (let i = 0; i < SANDSTORM_MOTE_COUNT; i++) {
      const b = i * 4;
      this.sandMoteSeed[b] = (rng() - 0.5) * 120;
      this.sandMoteSeed[b + 1] = rng() * 14;
      this.sandMoteSeed[b + 2] = (rng() - 0.5) * 120;
      this.sandMoteSeed[b + 3] = 0.55 + rng() * 0.95;
    }
    this.sandstormMesh = moteInst;
    this.staticGroup.add(moteInst);
    this.disposableGeometries.push(moteGeo);
    this.disposableMaterials.push(moteMat);

    // 2. Towering Spinning Desert Tornado Funnels!
    const funnelMat = createMkToonMaterial({
      color: palette.tornadoColor,
      emissive: palette.dustColor,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
      flatShading: true,
    });
    const ringMat = createMkToonMaterial({
      color: palette.dustColor,
      emissive: palette.dustColor,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposableMaterials.push(funnelMat, ringMat);

    const tierGeos = [
      new THREE.CylinderGeometry(2.8, 1.1, 6.0, 9, 1, true),
      new THREE.CylinderGeometry(4.8, 2.5, 7.5, 9, 1, true),
      new THREE.CylinderGeometry(7.6, 4.4, 8.5, 10, 1, true),
      new THREE.TorusGeometry(4.2, 0.35, 5, 14),
    ];
    this.disposableGeometries.push(...tierGeos);

    const maxOrbit = Math.max(45, terrain.arenaRadius * 0.62);
    for (let i = 0; i < DESERT_TORNADO_COUNT; i++) {
      const g = new THREE.Group();
      const tiers: THREE.Mesh[] = [];

      const t0 = new THREE.Mesh(tierGeos[0]!, funnelMat);
      t0.position.y = 3.0;
      const t1 = new THREE.Mesh(tierGeos[1]!, funnelMat);
      t1.position.y = 9.2;
      const t2 = new THREE.Mesh(tierGeos[2]!, funnelMat);
      t2.position.y = 16.5;
      const t3 = new THREE.Mesh(tierGeos[3]!, ringMat);
      t3.rotation.x = Math.PI * 0.5;
      t3.position.y = 1.6;

      g.add(t0, t1, t2, t3);
      tiers.push(t0, t1, t2, t3);
      this.staticGroup.add(g);

      this.desertTornadoes.push({
        group: g,
        tiers,
        orbitOrbitRadius: maxOrbit * (0.42 + i * 0.24),
        orbitSpeed: (0.09 + i * 0.03) * (i % 2 === 0 ? 1 : -1),
        phaseOffset: (i / DESERT_TORNADO_COUNT) * Math.PI * 2,
      });
    }
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

    const baseMat = createMkToonMaterial({ color: 0x354052, rimStrength: 0.35, gloss: 0.5 });
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
    this.magmaRimMat = null;
    this.sandstormMesh = null;
    this.desertTornadoes.length = 0;
    this.floorIsLavaActive = false;
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
