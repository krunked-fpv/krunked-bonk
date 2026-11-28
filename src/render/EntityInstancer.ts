/**
 * KRUNKEDBONK — Zero-GC Pooled & Instanced Entity Renderer (Wave 2 Full Expansion)
 *
 * Syncs prevState -> currState with interpAlpha (or 1.0 when classic50HzSnap is enabled):
 * - ALL 21 Articulated Playable Character Rigs w/ signature animations (Birdo glide wings,
 *   TonyMcZoom neon hoverboard, Calcium skateboard, Dicehead tumbling D6 head, Megachad flex, etc.)
 * - 4 Dedicated Articulated Boss Rigs (EntStage1/2/3, Pharaoh1/2/3, Big Bob GhostKing, FinalBoss)
 * - Per-archetype InstancedMesh Enemy Pools covering all 52 Forest/Desert/Graveyard/Swarm enemies
 * - ALL 30 Weapon Projectile & AreaEffect visuals (Bananarang, BlackHole, Dragon's Breath,
 *   FlameWalker, FrostWalker, SpaceNoodle tether, Tornado funnel, Katana arcs, Mines,
 *   PoisonFlask pools, Aegis plates, Homing Rockets, tumbling Dice, etc.)
 * - FinalBossMap 11 Boss Pylons: rising hexagonal pillars, radial ground charge ring filling,
 *   pulsing crimson energy beams linked to FinalBoss, and spinning stolen-weapon holograms!
 * - Graveyard Big Bob Darkness Lamps: wrought-iron lamp posts, warm golden light pools & beams!
 */

import * as THREE from 'three';
import type {
  CameraMode,
  CharacterId,
  EnemyState,
  ITerrainSampler,
  InteractableKind,
  InteractableVariant,
  SimEvent,
  SimState,
} from '../contracts/index';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { ArticulatedBossRig, CharacterRig } from '../assets/ProceduralLowPolyPack';
import {
  createEnergyBeamMaterial,
  createMkToonMaterial,
  createOutlineMaterial,
  createRuneDiscMaterial,
  createSlashArcMaterial,
  getSoftContactShadowTexture,
  setMkToonHitFlash,
  setMkToonTexture,
} from './toonShader';
import { createCalligraphicSlashGeometry } from '../assets/SculptedMeshes';

const ENEMY_ARCHETYPES = [
  'Goblin',
  'GoblinStrong',
  'GoblinTank',
  'Skeleton',
  'GoldenSkeleton',
  'XpSkeleton',
  'ArmoredSkeleton',
  'SkeletonDusty',
  'Slime',
  'Ghoul',
  'Zombie',
  'BoomerSpider',
  'Bee',
  'Frog',
  'Mummy',
  'MummyTank',
  'Scorpion',
  'MinibossScorpion',
  'CactusShooter',
  'Wisp',
  'Tumblebone',
  'Head',
  'MinibossGolem',
  'MinibossGolemSand',
  'MinibossPig',
  'Ghostham',
  'CalciumDad',
  'Ghost',
  'GreaterGhost',
  'GhostPurple',
  'GhostRed',
  'GhostGrave',
  'GhostInvincible',
] as const;

const PROJECTILE_ARCHETYPES = [
  'fireball',
  'fire_cone',
  'bone',
  'sword_arc',
  'katana_arc',
  'hero_arc',
  'corrupt_arc',
  'scythe',
  'axe',
  'banana',
  'rocket',
  'arrow',
  'dagger',
  'dice',
  'flask',
  'aegis_shield',
  'blood_orb',
  'frost_shard',
  'noodle',
  'tornado_proj',
  'blackhole_orb',
  'mine',
  'bullet',
  'boulder',
  'lightning',
  'sniper',
  'orb',
] as const;

const PICKUP_POOLS = ['gem', 'coin', 'heart', 'orb'] as const;

const ENEMY_POOL_CAPACITY = 260;
const PROJECTILE_POOL_CAPACITY = 220;
const PICKUP_POOL_CAPACITY = 360;
const AREA_EFFECT_POOL_CAPACITY = 72;
const SHRINE_RING_POOL_CAPACITY = 24;
const PYLON_POOL_CAPACITY = 16;
const LAMP_POOL_CAPACITY = 12;
const ENTITY_SHADOW_CAPACITY = 360;

interface OutlinedInstancedPool {
  main: THREE.InstancedMesh;
  outline: THREE.InstancedMesh;
  mainMat: THREE.ShaderMaterial;
  outlineMat: THREE.ShaderMaterial;
  count: number;
  capacity: number;
}

interface AreaEffectVisualSlot {
  group: THREE.Group;
  ring: THREE.Mesh;
  disc: THREE.Mesh;
  column: THREE.Mesh;
  coreMesh: THREE.Mesh;
  accretionRing: THREE.Mesh;
  spikes: THREE.Group;
  slashMesh: THREE.Mesh;
  ringMat: THREE.ShaderMaterial;
  discMat: THREE.ShaderMaterial;
  colMat: THREE.ShaderMaterial;
  coreMat: THREE.ShaderMaterial;
  accretionMat: THREE.ShaderMaterial;
  spikeMat: THREE.ShaderMaterial;
  slashMat: THREE.ShaderMaterial;
}

interface InteractableSlot {
  id: number;
  kind: InteractableKind;
  variant: InteractableVariant;
  used: boolean;
  mesh: THREE.Mesh;
  outline: THREE.Mesh;
  mainMat: THREE.ShaderMaterial;
  outlineMat: THREE.ShaderMaterial;
}

interface ShrineRingSlot {
  group: THREE.Group;
  outerRing: THREE.Mesh;
  fillDisc: THREE.Mesh;
  outerMat: THREE.ShaderMaterial;
  fillMat: THREE.ShaderMaterial;
}

interface PylonVisualSlot {
  group: THREE.Group;
  pillarMesh: THREE.Mesh;
  pillarMat: THREE.ShaderMaterial;
  outerRing: THREE.Mesh;
  fillDisc: THREE.Mesh;
  outerMat: THREE.ShaderMaterial;
  fillMat: THREE.ShaderMaterial;
  beamMesh: THREE.Mesh;
  beamMat: THREE.ShaderMaterial;
  holoGroup: THREE.Group;
  holoMat: THREE.ShaderMaterial;
  riseOffset: number;
}

interface DarknessLampVisualSlot {
  group: THREE.Group;
  postMat: THREE.ShaderMaterial;
  flameMesh: THREE.Mesh;
  flameMat: THREE.ShaderMaterial;
  outerRing: THREE.Mesh;
  fillDisc: THREE.Mesh;
  outerMat: THREE.ShaderMaterial;
  fillMat: THREE.ShaderMaterial;
  lightCone: THREE.Mesh;
  coneMat: THREE.ShaderMaterial;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class EntityInstancer {
  public readonly rootGroup = new THREE.Group();
  private readonly assets: AssetRegistry;

  // Articulated Player Rig
  private playerRig: CharacterRig | null = null;
  private playerRigChar: CharacterId | null = null;
  private playerRigSkin: string | null = null;
  private playerRigHat: string | null = null;
  private playerHitFlash = 0;
  private playerAttackSwing = 0;
  private wheelAngle = 0;
  private diceSpinBoost = 0;

  // 4 Dedicated Articulated Boss Rigs
  private entBossRig: ArticulatedBossRig | null = null;
  private entBossTier = 0;
  private pharaohBossRig: ArticulatedBossRig | null = null;
  private pharaohBossTier = 0;
  private bigBobRig: ArticulatedBossRig | null = null;
  private finalBossRig: ArticulatedBossRig | null = null;

  // Instanced Pools + flat iteration arrays (ZERO iterator allocations in hot loops!)
  private readonly enemyPools = new Map<string, OutlinedInstancedPool>();
  private readonly enemyPoolList: OutlinedInstancedPool[] = [];
  private readonly projectilePools = new Map<string, OutlinedInstancedPool>();
  private readonly projectilePoolList: OutlinedInstancedPool[] = [];
  private readonly pickupPools = new Map<string, OutlinedInstancedPool>();
  private readonly pickupPoolList: OutlinedInstancedPool[] = [];
  private readonly lowerCache = new Map<string, string>();

  // Pooled Area Effects
  private readonly areaSlots: AreaEffectVisualSlot[] = [];
  private readonly areaGeometries: THREE.BufferGeometry[] = [];

  // Interactable slots (Map for O(1) lookup + flat array for ZERO-alloc iteration!)
  private readonly interactableSlots = new Map<number, InteractableSlot>();
  private readonly interactableSlotList: InteractableSlot[] = [];
  private readonly shrineRings: ShrineRingSlot[] = [];
  private readonly shrineRingGeometries: THREE.BufferGeometry[] = [];

  // Boss Portal archway + swirling vortex
  private readonly bossPortalGroup = new THREE.Group();
  private portalVortexMesh: THREE.Mesh | null = null;
  private portalVortexMat: THREE.ShaderMaterial | null = null;
  private readonly portalGeometries: THREE.BufferGeometry[] = [];
  private readonly portalMaterials: THREE.Material[] = [];

  // FinalBossMap 11 Boss Pylons (rising pillars + charge rings + crimson beams + stolen-weapon holos!)
  private readonly pylonSlots: PylonVisualSlot[] = [];
  private readonly pylonGeometries: THREE.BufferGeometry[] = [];
  private readonly pylonExtraMaterials: THREE.Material[] = [];

  // Graveyard Big Bob Darkness Lamps (wrought-iron lanterns + warm golden light pools!)
  private readonly lampSlots: DarknessLampVisualSlot[] = [];
  private readonly lampGeometries: THREE.BufferGeometry[] = [];
  private readonly lampExtraMaterials: THREE.Material[] = [];

  // Hit-flash & interpolation maps (reused in place, ZERO allocations!)
  private readonly hitFlashTimers = new Map<number, number>();
  private readonly hitFlashIds: number[] = [];
  private readonly prevEnemyById = new Map<number, EnemyState>();
  private readonly prevProjById = new Map<number, { x: number; y: number; z: number }>();
  private readonly activeInteractableIds = new Set<number>();

  // Cached FinalBoss world position for pylon beam linking (ZERO allocations!)
  private finalBossWorldPos = new THREE.Vector3(0, 3.5, 0);
  private finalBossActive = false;

  // Dynamic soft radial contact shadow pool for enemies, bosses & interactables (ZERO allocs!)
  private currentTerrain: ITerrainSampler | null = null;
  private readonly entityShadowGeo: THREE.PlaneGeometry;
  private readonly entityShadowMat: THREE.MeshBasicMaterial;
  private readonly entityShadowMesh: THREE.InstancedMesh;
  private entityShadowCount = 0;

  // Pre-allocated scratch math objects (ZERO per-frame allocations!)
  private readonly _mat = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _vel = new THREE.Vector3();
  private readonly _vecA = new THREE.Vector3();
  private readonly _vecB = new THREE.Vector3();
  private readonly _mid = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler();
  private readonly _scale = new THREE.Vector3();
  private readonly _col = new THREE.Color();
  private readonly _zAxis = new THREE.Vector3(0, 0, 1);
  private readonly _yAxis = new THREE.Vector3(0, 1, 0);

  constructor(assets: AssetRegistry) {
    this.assets = assets;
    this.rootGroup.name = 'EntityInstancerRoot';

    this.entityShadowGeo = new THREE.PlaneGeometry(2.0, 2.0);
    this.entityShadowGeo.rotateX(-Math.PI * 0.5);
    this.entityShadowMat = new THREE.MeshBasicMaterial({
      map: getSoftContactShadowTexture(),
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.entityShadowMesh = new THREE.InstancedMesh(
      this.entityShadowGeo,
      this.entityShadowMat,
      ENTITY_SHADOW_CAPACITY,
    );
    this.entityShadowMesh.count = 0;
    this.entityShadowMesh.visible = false;
    this.entityShadowMesh.frustumCulled = false;
    this.entityShadowMesh.renderOrder = 1;
    this.rootGroup.add(this.entityShadowMesh);

    this.initEnemyPools();
    this.initProjectilePools();
    this.initPickupPools();
    this.initAreaEffectPool();
    this.initShrineRingPool();
    this.initBossPortal();
    this.initPylonPool();
    this.initDarknessLampPool();
  }

  public setTerrain(terrain: ITerrainSampler | null): void {
    this.currentTerrain = terrain;
  }

  private pushContactShadow(x: number, y: number, z: number, radius: number): void {
    if (this.entityShadowCount >= ENTITY_SHADOW_CAPACITY) return;
    let gy = y;
    if (this.currentTerrain) {
      const s = this.currentTerrain.sample(x, z);
      gy = s.height;
      const heightAbove = Math.max(0, y - gy);
      if (heightAbove > 14) return;
      this._vecA.set(s.normal.x, s.normal.y, s.normal.z).normalize();
      this._quat.setFromUnitVectors(this._yAxis, this._vecA);
      const shrink = Math.max(0.45, 1.0 - heightAbove * 0.045);
      this._scale.set(radius * shrink, 1, radius * shrink);
    } else {
      this._quat.identity();
      this._scale.set(radius, 1, radius);
    }
    this._pos.set(x, gy + 0.055, z);
    this._mat.compose(this._pos, this._quat, this._scale);
    this.entityShadowMesh.setMatrixAt(this.entityShadowCount++, this._mat);
  }

  private initEnemyPools(): void {
    const white = new THREE.Color(0xffffff);
    for (const arch of ENEMY_ARCHETYPES) {
      const pair = this.assets.builtIn.getEnemyGeometryPair(arch);
      const mainMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.78,
        vertexColors: true,
        rimStrength: 0.28,
        emissive: pair.emissiveHex ?? 0x000000,
        emissiveIntensity: pair.emissiveIntensity ?? 0,
        gloss: pair.gloss ?? 0.12,
      });
      const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
      const isHeavy =
        arch.startsWith('Miniboss') ||
        arch === 'GhostInvincible' ||
        arch === 'CalciumDad' ||
        arch === 'Ghostham';
      const cap = isHeavy ? 28 : ENEMY_POOL_CAPACITY;

      const main = new THREE.InstancedMesh(pair.geometry, mainMat, cap);
      const outline = new THREE.InstancedMesh(pair.outlineGeometry, outlineMat, cap);
      main.count = 0;
      outline.count = 0;
      main.visible = false;
      outline.visible = false;
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      const pool: OutlinedInstancedPool = { main, outline, mainMat, outlineMat, count: 0, capacity: cap };
      this.enemyPools.set(arch, pool);
      this.enemyPoolList.push(pool);
    }
  }

  private initProjectilePools(): void {
    const white = new THREE.Color(0xffffff);
    for (const arch of PROJECTILE_ARCHETYPES) {
      const pair = this.assets.builtIn.getProjectileGeometryPair(arch);
      const mainMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.35,
        vertexColors: true,
        rimStrength: 0.5,
        emissive: pair.emissiveHex ?? 0x000000,
        emissiveIntensity: pair.emissiveIntensity ?? 0.5,
        gloss: pair.gloss ?? 0.25,
      });
      const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
      const cap =
        arch === 'bullet' || arch === 'fireball' || arch === 'bone' || arch === 'arrow' || arch === 'dagger'
          ? PROJECTILE_POOL_CAPACITY
          : 96;

      const main = new THREE.InstancedMesh(pair.geometry, mainMat, cap);
      const outline = new THREE.InstancedMesh(pair.outlineGeometry, outlineMat, cap);
      main.count = 0;
      outline.count = 0;
      main.visible = false;
      outline.visible = false;
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      const pool: OutlinedInstancedPool = { main, outline, mainMat, outlineMat, count: 0, capacity: cap };
      this.projectilePools.set(arch, pool);
      this.projectilePoolList.push(pool);
    }
  }

  private initPickupPools(): void {
    const white = new THREE.Color(0xffffff);
    for (const kind of PICKUP_POOLS) {
      const pair = this.assets.builtIn.getPickupGeometryPair(kind);
      const mainMat = createMkToonMaterial({
        color: 0xffffff,
        vertexColors: true,
        rimStrength: 0.55,
        emissive: pair.emissiveHex ?? 0x222222,
        emissiveIntensity: pair.emissiveIntensity ?? 0.35,
        gloss: pair.gloss ?? 0.5,
      });
      const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
      const cap = kind === 'gem' ? PICKUP_POOL_CAPACITY : 120;

      const main = new THREE.InstancedMesh(pair.geometry, mainMat, cap);
      const outline = new THREE.InstancedMesh(pair.outlineGeometry, outlineMat, cap);
      main.count = 0;
      outline.count = 0;
      main.visible = false;
      outline.visible = false;
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      const pool: OutlinedInstancedPool = { main, outline, mainMat, outlineMat, count: 0, capacity: cap };
      this.pickupPools.set(kind, pool);
      this.pickupPoolList.push(pool);
    }
  }

  private initAreaEffectPool(): void {
    const ringGeo = new THREE.RingGeometry(0.84, 1.0, 28);
    ringGeo.rotateX(-Math.PI * 0.5);
    const discGeo = new THREE.CircleGeometry(1.0, 24);
    discGeo.rotateX(-Math.PI * 0.5);
    const colGeo = new THREE.CylinderGeometry(0.55, 0.28, 1.0, 10, 1, true);
    colGeo.translate(0, 0.5, 0);
    const coreGeo = new THREE.IcosahedronGeometry(0.45, 0);
    const accretionGeo = new THREE.TorusGeometry(0.85, 0.12, 5, 16);
    accretionGeo.rotateX(Math.PI * 0.5);
    const spikeGeo = new THREE.ConeGeometry(0.24, 1.7, 5);
    spikeGeo.translate(0, 0.85, 0);
    const slashGeo = createCalligraphicSlashGeometry(0.42, 1.05, Math.PI * 1.18, 20);
    this.areaGeometries.push(ringGeo, discGeo, colGeo, coreGeo, accretionGeo, spikeGeo, slashGeo);

    for (let i = 0; i < AREA_EFFECT_POOL_CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ringMat = createMkToonMaterial({
        color: 0xffd84d,
        emissive: 0xffb703,
        emissiveIntensity: 1.35,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const discMat = createRuneDiscMaterial(0xffd84d, 0.78);
      const colMat = createMkToonMaterial({
        color: 0x5cf7ff,
        emissive: 0x38f2ff,
        emissiveIntensity: 1.35,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const coreMat = createMkToonMaterial({
        color: 0x10051f,
        emissive: 0x7b2cbf,
        emissiveIntensity: 1.05,
        rimStrength: 0.85,
        rimColor: 0xe66bff,
      });
      const accretionMat = createMkToonMaterial({
        color: 0xc05eff,
        emissive: 0xb938ff,
        emissiveIntensity: 1.45,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const spikeMat = createMkToonMaterial({
        color: 0x7a482b,
        emissive: 0xff3b5c,
        emissiveIntensity: 0.55,
      });
      const slashMat = createSlashArcMaterial(0x7df9ff, 0.96);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.14;
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = 0.1;
      const column = new THREE.Mesh(colGeo, colMat);
      column.visible = false;
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.visible = false;
      const accretionRing = new THREE.Mesh(accretionGeo, accretionMat);
      accretionRing.visible = false;
      const slashMesh = new THREE.Mesh(slashGeo, slashMat);
      slashMesh.position.y = 0.65;
      slashMesh.visible = false;

      const spikes = new THREE.Group();
      spikes.visible = false;
      for (let s = 0; s < 5; s++) {
        const sp = new THREE.Mesh(spikeGeo, spikeMat);
        const a = (s / 5) * Math.PI * 2;
        const rad = s === 0 ? 0 : 0.48;
        sp.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        sp.rotation.set(s % 2 === 0 ? 0.18 : -0.18, a, 0.15);
        spikes.add(sp);
      }

      group.add(ring, disc, column, coreMesh, accretionRing, spikes, slashMesh);
      this.rootGroup.add(group);
      this.areaSlots.push({
        group,
        ring,
        disc,
        column,
        coreMesh,
        accretionRing,
        spikes,
        slashMesh,
        ringMat,
        discMat,
        colMat,
        coreMat,
        accretionMat,
        spikeMat,
        slashMat,
      });
    }
  }

  private initShrineRingPool(): void {
    const outerGeo = new THREE.RingGeometry(0.92, 1.0, 32);
    outerGeo.rotateX(-Math.PI * 0.5);
    const fillGeo = new THREE.CircleGeometry(0.94, 32);
    fillGeo.rotateX(-Math.PI * 0.5);
    this.shrineRingGeometries.push(outerGeo, fillGeo);

    for (let i = 0; i < SHRINE_RING_POOL_CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerMat = createMkToonMaterial({
        color: 0x4df5ff,
        emissive: 0x38e8ff,
        emissiveIntensity: 1.05,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMat = createRuneDiscMaterial(0x4df5ff, 0.72);

      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.position.y = 0.14;
      const fillDisc = new THREE.Mesh(fillGeo, fillMat);
      fillDisc.position.y = 0.1;

      group.add(outerRing, fillDisc);
      this.rootGroup.add(group);
      this.shrineRings.push({ group, outerRing, fillDisc, outerMat, fillMat });
    }
  }

  private initBossPortal(): void {
    this.bossPortalGroup.visible = false;
    const archPair = this.assets.builtIn.getInteractableGeometryPair('BossPortal', 'portal', false);
    const archMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.assets.getTexture(archPair.textureKey),
      mapStrength: 0.5,
      vertexColors: true,
      emissive: 0x7b2cbf,
      emissiveIntensity: 0.45,
      rimStrength: 0.45,
    });
    const outMat = createOutlineMaterial(archPair.outlineThickness, 0x0b0d14);

    const archMesh = new THREE.Mesh(archPair.geometry, archMat);
    archMesh.add(new THREE.Mesh(archPair.outlineGeometry, outMat));

    const vortexGeo = new THREE.CircleGeometry(2.1, 18);
    const vortexMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.assets.getTexture('portal_swirl'),
      emissive: 0xa855f7,
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    vortexMesh.position.set(0, 3.05, 0);

    const beaconGeo = new THREE.CylinderGeometry(0.95, 1.55, 28, 12, 1, true);
    beaconGeo.translate(0, 14, 0);
    const beaconMat = createEnergyBeamMaterial(0xc05eff, 0.55);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);

    this.portalVortexMesh = vortexMesh;
    this.portalVortexMat = vortexMat;
    this.portalGeometries.push(vortexGeo, beaconGeo);
    this.portalMaterials.push(archMat, outMat, vortexMat, beaconMat);

    this.bossPortalGroup.add(archMesh, vortexMesh, beacon);
    this.rootGroup.add(this.bossPortalGroup);
  }

  /**
   * Pre-allocates all FinalBossMap 11-Pylon assemblies:
   * - Outlined hexagonal pillar rising smoothly from floor
   * - Radial ground charge ring + progress fill disc
   * - World-space pulsing crimson energy beam connecting active pylon -> Final Boss!
   * - Spinning stolen-weapon hologram hovering above pylons holding a stolen weapon!
   */
  private initPylonPool(): void {
    const pair = this.assets.builtIn.getInteractableGeometryPair('BossPylon', 'normal', false);
    const outerGeo = new THREE.RingGeometry(0.9, 1.0, 32);
    outerGeo.rotateX(-Math.PI * 0.5);
    const fillGeo = new THREE.CircleGeometry(0.92, 32);
    fillGeo.rotateX(-Math.PI * 0.5);
    const beamGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.0, 7, 1, true);
    const holoBladeGeo = new THREE.OctahedronGeometry(0.55, 0);
    holoBladeGeo.scale(0.55, 1.85, 0.55);
    const holoRingGeo = new THREE.TorusGeometry(0.92, 0.08, 5, 12);
    const holoGuardGeo = new THREE.BoxGeometry(1.15, 0.16, 0.16);
    this.pylonGeometries.push(outerGeo, fillGeo, beamGeo, holoBladeGeo, holoRingGeo, holoGuardGeo);

    const sharedOutMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
    this.pylonExtraMaterials.push(sharedOutMat);

    for (let i = 0; i < PYLON_POOL_CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const pillarMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.5,
        vertexColors: true,
        emissive: 0xc91e94,
        emissiveIntensity: 0.45,
        rimStrength: 0.48,
        rimColor: 0xffc83b,
      });
      const pillarMesh = new THREE.Mesh(pair.geometry, pillarMat);
      pillarMesh.add(new THREE.Mesh(pair.outlineGeometry, sharedOutMat));

      const outerMat = createMkToonMaterial({
        color: 0xff2ec4,
        emissive: 0xff2644,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMat = createMkToonMaterial({
        color: 0xffd23f,
        emissive: 0xffae19,
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.position.y = 0.16;
      const fillDisc = new THREE.Mesh(fillGeo, fillMat);
      fillDisc.position.y = 0.12;

      // Spinning stolen-weapon hologram assembly above pylon crystal!
      const holoMat = createMkToonMaterial({
        color: 0xffe45e,
        emissive: 0xffd23f,
        emissiveIntensity: 1.35,
        transparent: true,
        opacity: 0.88,
        rimStrength: 0.7,
        rimColor: 0xffffff,
      });
      const holoGroup = new THREE.Group();
      holoGroup.position.set(0, 7.6, 0);
      holoGroup.visible = false;
      const holoBlade = new THREE.Mesh(holoBladeGeo, holoMat);
      const holoGuard = new THREE.Mesh(holoGuardGeo, holoMat);
      holoGuard.position.y = -0.35;
      const holoRing = new THREE.Mesh(holoRingGeo, holoMat);
      holoRing.rotation.x = Math.PI * 0.35;
      holoGroup.add(holoBlade, holoGuard, holoRing);

      group.add(pillarMesh, outerRing, fillDisc, holoGroup);
      this.rootGroup.add(group);

      // Pulsing crimson energy tether beam in world space (pylon top -> FinalBoss core!)
      const beamMat = createEnergyBeamMaterial(0xff2644, 0.85);
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.visible = false;
      beamMesh.frustumCulled = false;
      this.rootGroup.add(beamMesh);

      this.pylonSlots.push({
        group,
        pillarMesh,
        pillarMat,
        outerRing,
        fillDisc,
        outerMat,
        fillMat,
        beamMesh,
        beamMat,
        holoGroup,
        holoMat,
        riseOffset: -5.2,
      });
    }
  }

  /**
   * Pre-allocates Graveyard Big Bob Darkness Lamp assemblies:
   * - Outlined wrought-iron Gothic lamp post
   * - Glowing golden flame lantern core
   * - Warm golden ground safe-zone light pool + charge progress ring + lantern light cone!
   */
  private initDarknessLampPool(): void {
    const pair = this.assets.builtIn.getInteractableGeometryPair('DarknessLamp', 'normal', false);
    const outerGeo = new THREE.RingGeometry(0.9, 1.0, 28);
    outerGeo.rotateX(-Math.PI * 0.5);
    const fillGeo = new THREE.CircleGeometry(0.96, 28);
    fillGeo.rotateX(-Math.PI * 0.5);
    const flameGeo = new THREE.OctahedronGeometry(0.32, 0);
    const coneGeo = new THREE.CylinderGeometry(0.45, 2.8, 3.6, 10, 1, true);
    coneGeo.translate(0, 1.8, 0);
    this.lampGeometries.push(outerGeo, fillGeo, flameGeo, coneGeo);

    const sharedOutMat = createOutlineMaterial(pair.outlineThickness, 0x090714);
    this.lampExtraMaterials.push(sharedOutMat);

    for (let i = 0; i < LAMP_POOL_CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const postMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.55,
        vertexColors: true,
        emissive: 0x181c2b,
        emissiveIntensity: 0.1,
        rimStrength: 0.38,
        rimColor: 0xffe08a,
      });
      const postMesh = new THREE.Mesh(pair.geometry, postMat);
      postMesh.add(new THREE.Mesh(pair.outlineGeometry, sharedOutMat));

      const flameMat = createMkToonMaterial({
        color: 0xffe45e,
        emissive: 0xffb703,
        emissiveIntensity: 1.5,
        rimStrength: 0.7,
        rimColor: 0xffffff,
      });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(0, 3.12, 0.92);

      const outerMat = createMkToonMaterial({
        color: 0x7c6a99,
        emissive: 0x6b4ea8,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMat = createMkToonMaterial({
        color: 0xffd23f,
        emissive: 0xffae19,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const coneMat = createEnergyBeamMaterial(0xffe066, 0.36);

      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.position.y = 0.14;
      const fillDisc = new THREE.Mesh(fillGeo, fillMat);
      fillDisc.position.y = 0.1;
      const lightCone = new THREE.Mesh(coneGeo, coneMat);
      lightCone.position.set(0, 0.05, 0.45);
      lightCone.visible = false;

      group.add(postMesh, flameMesh, outerRing, fillDisc, lightCone);
      this.rootGroup.add(group);

      this.lampSlots.push({
        group,
        postMat,
        flameMesh,
        flameMat,
        outerRing,
        fillDisc,
        outerMat,
        fillMat,
        lightCone,
        coneMat,
      });
    }
  }

  public refreshTextures(): void {
    for (const [arch, pool] of this.enemyPools) {
      const pair = this.assets.builtIn.getEnemyGeometryPair(arch);
      setMkToonTexture(pool.mainMat, this.assets.getTexture(pair.textureKey));
    }
    if (this.portalVortexMat) {
      setMkToonTexture(this.portalVortexMat, this.assets.getTexture('portal_swirl'));
    }
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'damage_dealt') {
        if (!this.hitFlashTimers.has(ev.targetId)) {
          this.hitFlashIds.push(ev.targetId);
        }
        this.hitFlashTimers.set(ev.targetId, 0.12);
      } else if (ev.type === 'player_hurt') {
        this.playerHitFlash = 0.22;
      } else if (ev.type === 'weapon_fire') {
        this.playerAttackSwing = 1.0;
        this.diceSpinBoost = Math.min(1.0, this.diceSpinBoost + 0.55);
      } else if (ev.type === 'player_level_up' || ev.type === 'player_jump') {
        this.diceSpinBoost = 1.0;
      }
    }
  }

  public sync(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    interpAlpha: number,
    dtSec: number,
    timeSec: number,
    cameraMode: CameraMode,
  ): void {
    const dt = Math.min(0.05, Math.max(0, dtSec));

    for (let i = this.hitFlashIds.length - 1; i >= 0; i--) {
      const id = this.hitFlashIds[i]!;
      const rem = this.hitFlashTimers.get(id);
      if (rem === undefined || rem - dt <= 0) {
        this.hitFlashTimers.delete(id);
        const last = this.hitFlashIds.pop()!;
        if (i < this.hitFlashIds.length) this.hitFlashIds[i] = last;
      } else {
        this.hitFlashTimers.set(id, rem - dt);
      }
    }
    if (this.playerHitFlash > 0) this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
    if (this.playerAttackSwing > 0) this.playerAttackSwing = Math.max(0, this.playerAttackSwing - dt * 5.5);
    if (this.diceSpinBoost > 0) this.diceSpinBoost = Math.max(0, this.diceSpinBoost - dt * 2.2);

    this.entityShadowCount = 0;

    this.syncPlayer(prevState, currState, interpAlpha, dt, timeSec, cameraMode);
    this.syncEnemies(prevState, currState, interpAlpha, timeSec);
    this.syncPickups(currState, timeSec);
    this.syncProjectiles(prevState, currState, interpAlpha, timeSec);
    this.syncAreaEffects(currState, timeSec);
    this.syncInteractables(currState, timeSec);
    this.syncBossPortalPylonsAndLamps(currState, dt, timeSec);

    this.entityShadowMesh.count = this.entityShadowCount;
    this.entityShadowMesh.visible = this.entityShadowCount > 0;
    if (this.entityShadowCount > 0) {
      this.entityShadowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private lowerCached(s: string): string {
    let out = this.lowerCache.get(s);
    if (out === undefined) {
      out = s.toLowerCase();
      this.lowerCache.set(s, out);
    }
    return out;
  }

  private ensurePlayerRig(characterId: CharacterId, skinId: string | null, hatId: string | null): CharacterRig {
    if (
      this.playerRig &&
      this.playerRigChar === characterId &&
      this.playerRigSkin === skinId &&
      this.playerRigHat === hatId
    ) {
      return this.playerRig;
    }
    if (this.playerRig) {
      this.rootGroup.remove(this.playerRig.root);
      this.playerRig.dispose();
    }
    this.playerRig = this.assets.builtIn.buildCharacterRig(characterId, skinId, hatId);
    this.playerRigChar = characterId;
    this.playerRigSkin = skinId;
    this.playerRigHat = hatId;
    this.rootGroup.add(this.playerRig.root);
    return this.playerRig;
  }

  private syncPlayer(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    alpha: number,
    dt: number,
    timeSec: number,
    cameraMode: CameraMode,
  ): void {
    const rig = this.ensurePlayerRig(currState.characterId, currState.skinId, currState.hatId);
    const p0 = prevState.player;
    const p1 = currState.player;

    rig.root.visible = cameraMode !== 'first' && !p1.dead;
    if (!rig.root.visible) return;

    const px = p0.pos.x + (p1.pos.x - p0.pos.x) * alpha;
    const py = p0.pos.y + (p1.pos.y - p0.pos.y) * alpha;
    const pz = p0.pos.z + (p1.pos.z - p0.pos.z) * alpha;
    const yaw = lerpAngle(p0.yaw, p1.yaw, alpha);

    rig.root.position.set(px, py, pz);
    rig.root.rotation.set(0, yaw + Math.PI, 0);

    const hSpeed = Math.hypot(p1.vel.x, p1.vel.z);
    const moving = hSpeed > 0.6;
    const walkFreq = Math.min(18, 6.5 + hSpeed * 0.72);
    const walkPhase = timeSec * walkFreq;
    const floatOffset =
      rig.hoverMode === 'float'
        ? 0.22 + Math.sin(timeSec * 3.4) * 0.08
        : rig.hoverMode === 'hoverboard'
          ? 0.14 + Math.sin(timeSec * 5.2) * 0.06
          : 0;

    if (p1.railId !== null) {
      rig.bodyPivot.position.y = 0.08 + floatOffset + Math.sin(timeSec * 14) * 0.04;
      rig.bodyPivot.rotation.set(-0.08, Math.PI * 0.35, Math.sin(timeSec * 9) * 0.14);
      rig.bodyPivot.scale.set(1.0, 0.94, 1.0);
      rig.leftArm.rotation.set(0, 0, 0.95 + Math.sin(timeSec * 9) * 0.18);
      rig.rightArm.rotation.set(0, 0, -0.95 - Math.sin(timeSec * 9) * 0.18);
      rig.leftLeg.rotation.set(0.15, 0, 0.12);
      rig.rightLeg.rotation.set(-0.15, 0, -0.12);
    } else if (p1.isSliding) {
      rig.bodyPivot.position.y = -0.12 + floatOffset * 0.4;
      rig.bodyPivot.rotation.set(-0.46, 0.22, -0.14);
      rig.bodyPivot.scale.set(1.08, 0.64, 1.08);
      rig.leftArm.rotation.set(-0.5, 0, 0.65);
      rig.rightArm.rotation.set(-0.4, 0, -0.55);
      rig.leftLeg.rotation.set(-0.7, 0, 0);
      rig.rightLeg.rotation.set(0.4, 0, 0);
    } else if (!p1.grounded) {
      const stretch = 1.0 + Math.min(0.12, Math.abs(p1.vel.y) * 0.008);
      rig.bodyPivot.position.y = 0.05 + floatOffset * 0.5;
      rig.bodyPivot.rotation.set(Math.max(-0.28, Math.min(0.28, -p1.vel.y * 0.015)), 0, 0);
      rig.bodyPivot.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      rig.leftArm.rotation.set(-0.65, 0, 0.45);
      rig.rightArm.rotation.set(-0.45, 0, -0.45);
      rig.leftLeg.rotation.set(0.35, 0, 0);
      rig.rightLeg.rotation.set(-0.25, 0, 0);
    } else if (moving) {
      const bob = rig.hoverMode !== 'none' ? floatOffset : Math.abs(Math.sin(walkPhase)) * 0.14;
      const swing = rig.hoverMode === 'hoverboard' ? 0.18 : Math.sin(walkPhase) * Math.min(0.85, 0.35 + hSpeed * 0.045);
      rig.bodyPivot.position.y = bob;
      rig.bodyPivot.rotation.set(Math.min(0.22, hSpeed * 0.012), 0, Math.cos(walkPhase) * 0.06);
      rig.bodyPivot.scale.set(1, 1, 1);
      rig.leftArm.rotation.set(swing, 0, 0.14);
      rig.rightArm.rotation.set(-swing, 0, -0.14);
      rig.leftLeg.rotation.set(-swing * 1.05, 0, 0);
      rig.rightLeg.rotation.set(swing * 1.05, 0, 0);
    } else {
      const breathe = Math.sin(timeSec * 2.8);
      rig.bodyPivot.position.y = floatOffset + breathe * 0.03;
      rig.bodyPivot.rotation.set(0, 0, 0);
      rig.bodyPivot.scale.set(1, 1 + breathe * 0.02, 1);
      rig.leftArm.rotation.set(0, 0, 0.12 + breathe * 0.04);
      rig.rightArm.rotation.set(0, 0, -0.12 - breathe * 0.04);
      rig.leftLeg.rotation.set(0, 0, 0);
      rig.rightLeg.rotation.set(0, 0, 0);
    }

    rig.bodyPivot.scale.multiplyScalar(rig.baseScale);

    if (this.playerAttackSwing > 0) {
      rig.rightArm.rotation.x -= Math.sin(this.playerAttackSwing * Math.PI) * 1.15;
    }

    // Character-specific signature animations across all 21 fighters!
    if (rig.tailPivot) {
      rig.tailPivot.rotation.y = Math.sin(timeSec * (moving ? 11.5 : 4.2)) * (moving ? 0.42 : 0.22);
      rig.tailPivot.rotation.x = p1.isSliding ? -0.35 : 0.1;
    }
    if (rig.capePivot) {
      const speedBillow = Math.min(0.85, hSpeed * 0.048);
      rig.capePivot.rotation.x = 0.12 + speedBillow + Math.sin(timeSec * 9.0) * (0.06 + speedBillow * 0.18);
    }
    if (rig.boardPivot) {
      if (rig.hoverMode === 'hoverboard') {
        // TonyMcZoom glowing neon hoverboard carving!
        rig.boardPivot.rotation.set(
          p1.isSliding ? -0.22 : Math.sin(timeSec * 5.2) * 0.06,
          p1.railId !== null ? 0.42 : 0.14,
          Math.sin(timeSec * 6.5) * Math.min(0.24, 0.05 + hSpeed * 0.015),
        );
      } else {
        // Calcium tilted chunky skateboard + spinning wheels!
        this.wheelAngle += hSpeed * dt * 4.5;
        rig.boardPivot.rotation.set(
          p1.isSliding ? -0.18 : Math.sin(timeSec * 4) * 0.04,
          p1.railId !== null ? 0.35 : 0.08,
          Math.sin(timeSec * 6) * Math.min(0.18, hSpeed * 0.012),
        );
        for (let w = 0; w < rig.wheelPivots.length; w++) {
          rig.wheelPivots[w]!.rotation.x = this.wheelAngle;
        }
      }
    }
    if (rig.leftWingPivot && rig.rightWingPivot) {
      // Birdo gliding pose when airborne + lively wing flap!
      const isGliding = !p1.grounded && p1.vel.y < -0.5;
      const flap = isGliding ? 0.08 + Math.sin(timeSec * 6.0) * 0.08 : Math.sin(timeSec * (moving ? 12 : 4)) * (moving ? 0.35 : 0.14);
      const flare = isGliding ? 0.35 : 0;
      rig.leftWingPivot.rotation.set(0, -flare, flap);
      rig.rightWingPivot.rotation.set(0, flare, -flap);
    }
    if (rig.isDiceHead) {
      // Dicehead giant tumbling D6 head!
      const spin = this.diceSpinBoost > 0.01 ? timeSec * 14.0 : Math.sin(timeSec * 2.2) * 0.12;
      rig.headPivot.rotation.set(
        this.diceSpinBoost * Math.sin(timeSec * 11.0) * 0.65,
        spin,
        this.diceSpinBoost * Math.cos(timeSec * 9.0) * 0.45,
      );
    } else {
      rig.headPivot.rotation.set(0, 0, 0);
    }
    if (rig.auraRing) {
      const flexing = p1.invulnTimer > 0;
      rig.auraRing.rotation.z = timeSec * (flexing ? 5.2 : 1.8);
      const auraScale = flexing ? 1.35 + Math.sin(timeSec * 22) * 0.12 : 1.0 + Math.sin(timeSec * 3.5) * 0.06;
      rig.auraRing.scale.setScalar(auraScale);
      if (flexing) {
        rig.leftArm.rotation.set(-0.6, 0, 1.15);
        rig.rightArm.rotation.set(-0.6, 0, -1.15);
      }
    }

    const flashAmt = this.playerHitFlash > 0 ? Math.min(1, this.playerHitFlash * 5) : 0;
    for (let m = 0; m < rig.toonMaterials.length; m++) {
      setMkToonHitFlash(rig.toonMaterials[m]!, flashAmt);
    }
  }

  private animateBossRig(
    rig: ArticulatedBossRig,
    x: number,
    y: number,
    z: number,
    yaw: number,
    scale: number,
    timeSec: number,
    entityId: number,
    flashRem: number,
    hover: boolean,
    shieldActive = false,
  ): void {
    rig.root.visible = true;
    const stomp = hover
      ? 0.8 + Math.sin(timeSec * 2.6 + entityId) * 0.45
      : Math.abs(Math.sin(timeSec * 4.5 + entityId)) * 0.22;
    rig.root.position.set(x, y + stomp, z);
    rig.root.rotation.set(0, yaw, Math.sin(timeSec * 3.6) * 0.04);
    rig.root.scale.setScalar(scale);
    rig.leftArm.rotation.x = Math.sin(timeSec * 4.2 + entityId) * 0.52;
    rig.rightArm.rotation.x = -Math.sin(timeSec * 4.2 + entityId) * 0.52;
    if (rig.kind === 'FinalBoss') {
      rig.crownGroup.rotation.z = timeSec * 1.4;
      if (rig.shieldDome) {
        rig.shieldDome.visible = shieldActive;
        if (shieldActive) {
          rig.shieldDome.rotation.y = timeSec * 0.85;
          const s = 1.0 + Math.sin(timeSec * 6.0) * 0.04;
          rig.shieldDome.scale.setScalar(s);
        }
      }
    } else if (rig.kind === 'BigBob' || rig.kind === 'Pharaoh') {
      rig.crownGroup.rotation.y = timeSec * 1.6;
      rig.crownGroup.position.y = (rig.kind === 'BigBob' ? 8.85 : 5.95) + Math.sin(timeSec * 3.2) * 0.22;
    } else {
      rig.crownGroup.rotation.y = Math.sin(timeSec * 1.8) * 0.08;
    }

    const flash = flashRem > 0 ? Math.min(1, flashRem * 10) : 0;
    for (let m = 0; m < rig.toonMaterials.length; m++) {
      setMkToonHitFlash(rig.toonMaterials[m]!, flash);
    }
  }

  private syncEnemies(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    alpha: number,
    timeSec: number,
  ): void {
    for (let i = 0; i < this.enemyPoolList.length; i++) {
      this.enemyPoolList[i]!.count = 0;
    }

    this.prevEnemyById.clear();
    const prevList = prevState.enemies;
    for (let i = 0; i < prevList.length; i++) {
      const e = prevList[i]!;
      this.prevEnemyById.set(e.id, e);
    }

    let sawEntBoss = false;
    let sawPharaohBoss = false;
    let sawBigBob = false;
    let sawFinalBoss = false;
    this.finalBossActive = false;

    // Check if FinalBoss has any active un-cleansed pylons (drives Boss Pylon Shield Dome!)
    let hasActivePylon = false;
    for (let i = 0; i < currState.pylons.length; i++) {
      const py = currState.pylons[i]!;
      if (py.active && !py.cleansed) {
        hasActivePylon = true;
        break;
      }
    }

    const currList = currState.enemies;
    for (let i = 0; i < currList.length; i++) {
      const e = currList[i]!;
      const prev = this.prevEnemyById.get(e.id);
      const x = prev ? prev.pos.x + (e.pos.x - prev.pos.x) * alpha : e.pos.x;
      const y = prev ? prev.pos.y + (e.pos.y - prev.pos.y) * alpha : e.pos.y;
      const z = prev ? prev.pos.z + (e.pos.z - prev.pos.z) * alpha : e.pos.z;

      const velSq = e.vel.x * e.vel.x + e.vel.z * e.vel.z;
      const yaw =
        velSq > 0.09
          ? Math.atan2(e.vel.x, e.vel.z)
          : prev
            ? lerpAngle(prev.yaw, e.yaw, alpha)
            : e.yaw;

      const arch = this.assets.builtIn.normalizeEnemyArchetype(e.enemyId);
      const flashRem = this.hitFlashTimers.get(e.id) ?? 0;

      // 1. Forest Ent Stage Bosses (EntStage1/2/3)
      if ((arch === 'EntStage1' || arch === 'EntStage2' || arch === 'EntStage3') && !sawEntBoss) {
        sawEntBoss = true;
        const tier = arch === 'EntStage3' ? 3 : arch === 'EntStage2' ? 2 : 1;
        if (!this.entBossRig || this.entBossTier !== tier) {
          if (this.entBossRig) {
            this.rootGroup.remove(this.entBossRig.root);
            this.entBossRig.dispose();
          }
          this.entBossRig = this.assets.builtIn.buildEntBossRig(tier);
          this.entBossTier = tier;
          this.rootGroup.add(this.entBossRig.root);
        }
        const entSc = Math.max(0.85, e.radius / 2.2);
        this.animateBossRig(this.entBossRig, x, y, z, yaw, entSc, timeSec, e.id, flashRem, false);
        this.pushContactShadow(x, y, z, entSc * 3.1);
        continue;
      }

      // 2. Desert Anubis Pharaoh Bosses (Pharaoh1/2/3)
      if ((arch === 'Pharaoh1' || arch === 'Pharaoh2' || arch === 'Pharaoh3') && !sawPharaohBoss) {
        sawPharaohBoss = true;
        const tier = arch === 'Pharaoh3' ? 3 : arch === 'Pharaoh2' ? 2 : 1;
        if (!this.pharaohBossRig || this.pharaohBossTier !== tier) {
          if (this.pharaohBossRig) {
            this.rootGroup.remove(this.pharaohBossRig.root);
            this.pharaohBossRig.dispose();
          }
          this.pharaohBossRig = this.assets.builtIn.buildPharaohBossRig(tier);
          this.pharaohBossTier = tier;
          this.rootGroup.add(this.pharaohBossRig.root);
        }
        const phSc = Math.max(0.9, e.radius / 1.8);
        this.animateBossRig(this.pharaohBossRig, x, y, z, yaw, phSc, timeSec, e.id, flashRem, false);
        this.pushContactShadow(x, y, z, phSc * 2.6);
        continue;
      }

      // 3. Graveyard Big Bob (GhostKing)
      if (arch === 'GhostKing' && !sawBigBob) {
        sawBigBob = true;
        if (!this.bigBobRig) {
          this.bigBobRig = this.assets.builtIn.buildBigBobRig();
          this.rootGroup.add(this.bigBobRig.root);
        }
        const bobSc = Math.max(0.95, e.radius / 2.6);
        this.animateBossRig(this.bigBobRig, x, y, z, yaw, bobSc, timeSec, e.id, flashRem, true);
        this.pushContactShadow(x, y, z, bobSc * 3.2);
        continue;
      }

      // 4. Obsidian Citadel Final Boss
      if (arch === 'FinalBoss' && !sawFinalBoss) {
        sawFinalBoss = true;
        this.finalBossActive = true;
        const bossScale = Math.max(1.0, e.radius / 2.0);
        this.finalBossWorldPos.set(x, y + 3.5 * bossScale, z);
        if (!this.finalBossRig) {
          this.finalBossRig = this.assets.builtIn.buildFinalBossRig();
          this.rootGroup.add(this.finalBossRig.root);
        }
        this.animateBossRig(this.finalBossRig, x, y, z, yaw, bossScale, timeSec, e.id, flashRem, false, hasActivePylon);
        this.pushContactShadow(x, y, z, bossScale * 3.2);
        continue;
      }

      const pool = this.enemyPools.get(arch) ?? this.enemyPools.get('Goblin');
      if (!pool || pool.count >= pool.capacity) continue;

      const phase = timeSec * (e.isBoss ? 5.2 : 8.5) + e.id * 1.37;
      const isSlime = arch === 'Slime' || arch === 'Frog';
      const isFlying =
        arch.startsWith('Ghost') ||
        arch === 'GreaterGhost' ||
        arch === 'Bee' ||
        arch === 'Wisp' ||
        arch === 'Head';
      const isRolling = arch === 'Tumblebone';
      const hopY = isFlying ? 0.55 + Math.sin(phase * 0.65) * 0.28 : Math.abs(Math.sin(phase)) * 0.16;
      const rollZ = isFlying ? Math.sin(phase * 0.5) * 0.08 : Math.sin(phase) * 0.1;

      const baseScale = e.isBoss
        ? Math.max(1.25, e.radius / 1.1)
        : e.isElite
          ? Math.max(1.25, e.radius / 0.72)
          : Math.max(0.75, e.radius / 0.72);
      const squashY = isSlime ? 1.0 + Math.sin(phase * 1.4) * 0.18 : 1.0;
      const squashXZ = isSlime ? 1.0 / Math.sqrt(squashY) : 1.0;
      const hitPunch = flashRem > 0 ? 1.12 : 1.0;

      this._pos.set(x, y + hopY, z);
      if (isRolling) {
        this._euler.set(timeSec * 8.0 + e.id, yaw, 0);
      } else {
        this._euler.set(0, yaw, rollZ);
      }
      this._quat.setFromEuler(this._euler);
      this._scale.set(
        baseScale * squashXZ * hitPunch,
        baseScale * squashY * hitPunch,
        baseScale * squashXZ * hitPunch,
      );
      this._mat.compose(this._pos, this._quat, this._scale);

      const idx = pool.count++;
      pool.main.setMatrixAt(idx, this._mat);
      pool.outline.setMatrixAt(idx, this._mat);
      this.pushContactShadow(x, y, z, Math.max(0.85, e.radius * 1.45));

      if (flashRem > 0) {
        this._col.setRGB(3.2, 3.1, 2.9);
      } else if (e.debuffs.length > 0) {
        const d = e.debuffs[0]!.type;
        if (d === 'Freeze') this._col.setHex(0x80f5ff);
        else if (d === 'Poison') this._col.setHex(0x88ff66);
        else if (d === 'Burn') this._col.setHex(0xff8a47);
        else if (d === 'Charm') this._col.setHex(0xff80ec);
        else if (d === 'Bloodmark') this._col.setHex(0xff6b81);
        else this._col.setHex(0xffffff);
      } else if (arch === 'Frog') {
        const lid = this.lowerCached(e.enemyId);
        this._col.setHex(lid.includes('red') ? 0xff6b6b : lid.includes('blue') ? 0x60a5fa : 0xffffff);
      } else if (arch === 'GhostGrave') {
        const lid = this.lowerCached(e.enemyId);
        this._col.setHex(lid.includes('4') ? 0xff70a6 : lid.includes('3') ? 0xc084fc : lid.includes('2') ? 0x70f5ff : 0xffffff);
      } else if (e.isElite) {
        this._col.setHex(0xffe699);
      } else {
        this._col.setHex(0xffffff);
      }
      pool.main.setColorAt(idx, this._col);
    }

    if (this.entBossRig && !sawEntBoss) this.entBossRig.root.visible = false;
    if (this.pharaohBossRig && !sawPharaohBoss) this.pharaohBossRig.root.visible = false;
    if (this.bigBobRig && !sawBigBob) this.bigBobRig.root.visible = false;
    if (this.finalBossRig && !sawFinalBoss) this.finalBossRig.root.visible = false;

    for (let i = 0; i < this.enemyPoolList.length; i++) {
      const pool = this.enemyPoolList[i]!;
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
      pool.main.visible = pool.count > 0;
      pool.outline.visible = pool.count > 0;
      if (pool.count > 0) {
        pool.main.instanceMatrix.needsUpdate = true;
        pool.outline.instanceMatrix.needsUpdate = true;
        if (pool.main.instanceColor) pool.main.instanceColor.needsUpdate = true;
      }
    }
  }

  private syncPickups(currState: Readonly<SimState>, timeSec: number): void {
    for (let i = 0; i < this.pickupPoolList.length; i++) {
      this.pickupPoolList[i]!.count = 0;
    }

    const list = currState.pickups;
    for (let i = 0; i < list.length; i++) {
      const pk = list[i]!;
      let poolKey: (typeof PICKUP_POOLS)[number] = 'orb';
      let hex = 0x52f2ff;
      let sc = 1.0;

      switch (pk.kind) {
        case 'xp_small': poolKey = 'gem'; hex = 0x4df5ff; sc = 0.85; break;
        case 'xp_medium': poolKey = 'gem'; hex = 0x52ff8a; sc = 1.1; break;
        case 'xp_large': poolKey = 'gem'; hex = 0xff5cf4; sc = 1.42; break;
        case 'gold': poolKey = 'coin'; hex = 0xffd23f; sc = 1.0; break;
        case 'silver': poolKey = 'coin'; hex = 0xdbe6f2; sc = 1.12; break;
        case 'health': poolKey = 'heart'; hex = 0xff3b5c; sc = 1.15; break;
        case 'magnet': poolKey = 'orb'; hex = 0x38bdf8; sc = 1.25; break;
        case 'nuke': poolKey = 'orb'; hex = 0xff4d2e; sc = 1.35; break;
        case 'freeze_clock': poolKey = 'orb'; hex = 0x80faff; sc = 1.25; break;
        case 'rage': poolKey = 'orb'; hex = 0xff2e54; sc = 1.25; break;
        case 'haste': poolKey = 'orb'; hex = 0xffe45e; sc = 1.25; break;
        case 'stonks': poolKey = 'coin'; hex = 0x52ff8a; sc = 1.3; break;
        case 'shield': poolKey = 'orb'; hex = 0x5cf7ff; sc = 1.25; break;
        default: poolKey = 'orb'; hex = 0xffd84d; sc = 1.3; break;
      }

      const pool = this.pickupPools.get(poolKey);
      if (!pool || pool.count >= pool.capacity) continue;

      const bob = 0.55 + Math.sin(timeSec * 4.2 + pk.id * 0.9) * 0.18;
      if (pk.magnetized) sc *= 1.18;

      this._pos.set(pk.pos.x, pk.pos.y + bob, pk.pos.z);
      this._euler.set(0, timeSec * 2.8 + pk.id, 0);
      this._quat.setFromEuler(this._euler);
      this._scale.setScalar(sc);
      this._mat.compose(this._pos, this._quat, this._scale);

      const idx = pool.count++;
      pool.main.setMatrixAt(idx, this._mat);
      pool.outline.setMatrixAt(idx, this._mat);
      this._col.setHex(hex);
      pool.main.setColorAt(idx, this._col);
    }

    for (let i = 0; i < this.pickupPoolList.length; i++) {
      const pool = this.pickupPoolList[i]!;
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
      pool.main.visible = pool.count > 0;
      pool.outline.visible = pool.count > 0;
      if (pool.count > 0) {
        pool.main.instanceMatrix.needsUpdate = true;
        pool.outline.instanceMatrix.needsUpdate = true;
        if (pool.main.instanceColor) pool.main.instanceColor.needsUpdate = true;
      }
    }
  }

  private syncProjectiles(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    alpha: number,
    timeSec: number,
  ): void {
    for (let i = 0; i < this.projectilePoolList.length; i++) {
      this.projectilePoolList[i]!.count = 0;
    }

    this.prevProjById.clear();
    const prevList = prevState.projectiles;
    for (let i = 0; i < prevList.length; i++) {
      const pr = prevList[i]!;
      this.prevProjById.set(pr.id, pr.pos);
    }

    const currList = currState.projectiles;
    const pPos = currState.player.pos;
    for (let i = 0; i < currList.length; i++) {
      const pr = currList[i]!;
      const prevPos = this.prevProjById.get(pr.id);
      const x = prevPos ? prevPos.x + (pr.pos.x - prevPos.x) * alpha : pr.pos.x;
      const y = prevPos ? prevPos.y + (pr.pos.y - prevPos.y) * alpha : pr.pos.y;
      const z = prevPos ? prevPos.z + (pr.pos.z - prevPos.z) * alpha : pr.pos.z;

      const arch = this.assets.builtIn.normalizeProjectileArchetype(pr.weaponId);
      const pool = this.projectilePools.get(arch) ?? this.projectilePools.get('orb');
      if (!pool || pool.count >= pool.capacity) continue;

      this._pos.set(x, y, z);

      if (arch === 'banana') {
        // Iconic horizontal spinning Bananarang crescent!
        this._euler.set(0.15, timeSec * 16.0 + pr.id, 0);
        this._quat.setFromEuler(this._euler);
      } else if (arch === 'bone' || arch === 'boulder' || arch === 'dice' || arch === 'flask') {
        // Expressive 3D tumbling dice / bone / boulder / flask!
        this._euler.set(timeSec * 10.0 + pr.id, timeSec * 13.0 + pr.id, timeSec * 7.5);
        this._quat.setFromEuler(this._euler);
      } else if (arch === 'axe' || arch === 'scythe') {
        // Cartwheeling battle axe / reaping scythe!
        const heading = Math.atan2(pr.vel.x, pr.vel.z);
        this._euler.set(timeSec * 15.0 + pr.id, heading, 0);
        this._quat.setFromEuler(this._euler);
      } else if (arch === 'aegis_shield') {
        // Orbiting Aegis shield plates facing radially outward around player!
        const outAngle = Math.atan2(x - pPos.x, z - pPos.z);
        this._euler.set(0, outAngle, Math.sin(timeSec * 6.0 + pr.id) * 0.12);
        this._quat.setFromEuler(this._euler);
      } else if (arch === 'tornado_proj' || arch === 'blackhole_orb') {
        this._euler.set(0, timeSec * 11.0 + pr.id, 0);
        this._quat.setFromEuler(this._euler);
      } else if (arch === 'mine') {
        this._euler.set(0, timeSec * 1.5, 0);
        this._quat.setFromEuler(this._euler);
      } else {
        this._vel.set(pr.vel.x, pr.vel.y, pr.vel.z);
        if (this._vel.lengthSq() > 0.001) {
          this._vel.normalize();
          this._quat.setFromUnitVectors(this._zAxis, this._vel);
        } else {
          this._quat.identity();
        }
      }

      const sc = Math.max(0.65, pr.radius * 1.45);
      this._scale.setScalar(sc);
      this._mat.compose(this._pos, this._quat, this._scale);

      const idx = pool.count++;
      pool.main.setMatrixAt(idx, this._mat);
      pool.outline.setMatrixAt(idx, this._mat);
      this._col.setHex(pr.ownerIsPlayer ? 0xffffff : 0xff4d6d);
      pool.main.setColorAt(idx, this._col);
    }

    for (let i = 0; i < this.projectilePoolList.length; i++) {
      const pool = this.projectilePoolList[i]!;
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
      pool.main.visible = pool.count > 0;
      pool.outline.visible = pool.count > 0;
      if (pool.count > 0) {
        pool.main.instanceMatrix.needsUpdate = true;
        pool.outline.instanceMatrix.needsUpdate = true;
        if (pool.main.instanceColor) pool.main.instanceColor.needsUpdate = true;
      }
    }
  }

  private syncAreaEffects(currState: Readonly<SimState>, timeSec: number): void {
    const list = currState.areaEffects;
    const count = Math.min(list.length, AREA_EFFECT_POOL_CAPACITY);
    const pPos = currState.player.pos;

    for (let i = 0; i < AREA_EFFECT_POOL_CAPACITY; i++) {
      const slot = this.areaSlots[i]!;
      if (i >= count) {
        slot.group.visible = false;
        continue;
      }

      const ae = list[i]!;
      slot.group.visible = true;
      slot.group.position.set(ae.pos.x, ae.pos.y, ae.pos.z);

      const r = Math.max(0.5, ae.radius);
      const frac = 1.0 - Math.max(0, Math.min(1, ae.lifeSec / Math.max(0.01, ae.maxLifeSec)));
      const isEnemyHazard = !ae.ownerIsPlayer;
      const wid = this.lowerCached(ae.weaponId);

      // Determine vibrant weapon/element palette
      let hex = 0xffd84d;
      if (isEnemyHazard) {
        hex = 0xff2e4c;
      } else if (wid.includes('noodle')) {
        hex = 0xff5cf4;
      } else if (wid.includes('dragon')) {
        hex = 0xff621f;
      } else if (wid.includes('frost') || ae.element === 'Ice') {
        hex = 0x70f5ff;
      } else if (wid.includes('poison') || ae.element === 'Poison') {
        hex = 0x6eff57;
      } else if (wid.includes('flame') || wid.includes('fire') || ae.element === 'Fire') {
        hex = 0xff6b24;
      } else if (ae.kind === 'blackhole' || wid.includes('blackhole')) {
        hex = 0xb938ff;
      } else if (ae.kind === 'tornado' || wid.includes('tornado')) {
        hex = 0x99f6ff;
      } else if (ae.kind === 'mine' || wid.includes('mine')) {
        hex = 0xff2644;
      } else if (ae.kind === 'beam') {
        hex = 0x5cf7ff;
      } else if (ae.kind === 'nova') {
        hex = 0xff9f43;
      } else if (wid.includes('katana')) {
        hex = 0x5cf7ff;
      } else if (wid.includes('corrupt')) {
        hex = 0xc05eff;
      } else if (wid.includes('scythe')) {
        hex = 0x4dff9e;
      }

      (slot.ringMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
      (slot.ringMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);
      (slot.discMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
      (slot.discMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);

      const pulse = 1.0 + Math.sin(timeSec * (isEnemyHazard ? 18 : 7)) * 0.05;
      const ringScale = ae.kind === 'nova' ? r * (0.25 + frac * 0.85) : r * pulse;
      slot.ring.scale.set(ringScale, 1, ringScale);
      const discScale = r * (isEnemyHazard ? 0.3 + frac * 0.7 : ae.kind === 'pool' ? 0.94 + Math.sin(timeSec * 8 + ae.id) * 0.05 : 0.96);
      slot.disc.scale.set(discScale, 1, discScale);
      slot.discMat.uniforms.uOpacity!.value = ae.kind === 'pool' ? 0.42 : isEnemyHazard ? 0.32 : 0.24;

      // Reset optional sub-meshes cleanly
      slot.column.visible = false;
      slot.column.position.set(0, 0, 0);
      slot.column.quaternion.identity();
      slot.coreMesh.visible = false;
      slot.accretionRing.visible = false;
      slot.spikes.visible = false;
      slot.slashMesh.visible = false;

      // 1. SpaceNoodle Tether Beam (connects player <-> target position cleanly!)
      if (wid.includes('noodle')) {
        slot.column.visible = true;
        this._vecA.set(pPos.x - ae.pos.x, pPos.y + 1.3 - ae.pos.y, pPos.z - ae.pos.z);
        const len = Math.max(0.8, this._vecA.length());
        this._vecB.copy(this._vecA).normalize();
        slot.column.position.set(this._vecA.x * 0.5, this._vecA.y * 0.5, this._vecA.z * 0.5);
        this._quat.setFromUnitVectors(this._yAxis, this._vecB);
        slot.column.quaternion.copy(this._quat);
        slot.column.position.addScaledVector(this._vecB, -len * 0.5);
        const thickness = 0.35 + Math.sin(timeSec * 24 + ae.id) * 0.09;
        slot.column.scale.set(thickness, len, thickness);
        (slot.colMat.uniforms.uBaseColor!.value as THREE.Color).setHex(0xff66f5);
        (slot.colMat.uniforms.uEmissive!.value as THREE.Color).setHex(0x5cf7ff);
      } else if (ae.kind === 'beam' || ae.kind === 'tornado') {
        // Sky-smite lightning / Sniper beam / Tornado cyclone funnel!
        slot.column.visible = true;
        const h = Math.max(4, ae.height || (ae.kind === 'tornado' ? 11 : 14));
        slot.column.scale.set(r * (ae.kind === 'tornado' ? 0.85 : 0.55), h, r * (ae.kind === 'tornado' ? 0.85 : 0.55));
        slot.column.rotation.set(0, timeSec * (ae.kind === 'tornado' ? 12.0 : 8.0), 0);
        (slot.colMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
        (slot.colMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);
        if (ae.kind === 'tornado') {
          slot.accretionRing.visible = true;
          slot.accretionRing.position.set(0, 1.4, 0);
          slot.accretionRing.rotation.set(0, timeSec * 10.0, 0);
          slot.accretionRing.scale.setScalar(r * 0.9);
          (slot.accretionMat.uniforms.uBaseColor!.value as THREE.Color).setHex(0xd8faff);
          (slot.accretionMat.uniforms.uEmissive!.value as THREE.Color).setHex(0x5cf7ff);
        }
      }

      // 2. Black Hole Gravity Vortex (dark obsidian event-horizon + swirling amethyst accretion torus!)
      if (ae.kind === 'blackhole' || wid.includes('blackhole')) {
        slot.coreMesh.visible = true;
        slot.coreMesh.position.set(0, 1.45, 0);
        slot.coreMesh.rotation.set(timeSec * 2.5, timeSec * 4.0, 0);
        const coreSc = Math.max(0.9, r * 0.42) * (1.0 + Math.sin(timeSec * 12) * 0.08);
        slot.coreMesh.scale.setScalar(coreSc);
        (slot.coreMat.uniforms.uBaseColor!.value as THREE.Color).setHex(0x0b0414);
        (slot.coreMat.uniforms.uEmissive!.value as THREE.Color).setHex(0x5b189a);

        slot.accretionRing.visible = true;
        slot.accretionRing.position.set(0, 1.45, 0);
        slot.accretionRing.rotation.set(0.32, timeSec * 7.5, 0.25);
        slot.accretionRing.scale.setScalar(Math.max(1.1, r * 0.72));
        (slot.accretionMat.uniforms.uBaseColor!.value as THREE.Color).setHex(0xd946ef);
        (slot.accretionMat.uniforms.uEmissive!.value as THREE.Color).setHex(0xb938ff);
      }

      // 3. Mines Blinking Trap (metallic base + pulsing blinking red LED core!)
      if (ae.kind === 'mine' || wid.includes('mine')) {
        slot.coreMesh.visible = true;
        slot.coreMesh.position.set(0, 0.28, 0);
        slot.coreMesh.rotation.set(0, timeSec * 2.0, 0);
        slot.coreMesh.scale.set(0.95, 0.45, 0.95);
        const blink = Math.sin(timeSec * 14 + ae.id) > 0;
        (slot.coreMat.uniforms.uBaseColor!.value as THREE.Color).setHex(blink ? 0xff2644 : 0x334155);
        (slot.coreMat.uniforms.uEmissive!.value as THREE.Color).setHex(blink ? 0xff2644 : 0x450a0a);
      }

      // 4. FrostWalker Expanding Ice Nova Crystal Spikes!
      if (!isEnemyHazard && (wid.includes('frost') || (ae.kind === 'nova' && ae.element === 'Ice'))) {
        slot.spikes.visible = true;
        slot.spikes.scale.set(r * 0.65, (1.0 - frac * 0.45) * 1.1, r * 0.65);
        (slot.spikeMat.uniforms.uBaseColor!.value as THREE.Color).setHex(0xa6f7ff);
        (slot.spikeMat.uniforms.uEmissive!.value as THREE.Color).setHex(0x38e8ff);
      }

      // 5. Hades Calligraphic Melee Slash Arc (Sword, Katana, HeroSword, CorruptedSword, Scythe, DragonsBreath)
      if (
        !isEnemyHazard &&
        (wid.includes('sword') || wid.includes('katana') || wid.includes('scythe') || wid.includes('dragon'))
      ) {
        slot.slashMesh.visible = true;
        slot.slashMesh.scale.setScalar(r * (0.78 + frac * 0.48));
        slot.slashMesh.rotation.y = timeSec * 11.5 + ae.id;
        (slot.slashMat.uniforms.uColor!.value as THREE.Color).setHex(hex);
        slot.slashMat.uniforms.uOpacity!.value = Math.max(0.15, (1 - frac) * 0.96);
      }

      // 6. Enemy Hazard Spikes / SandPillars / GhostSpikes erupting after warning telegraph fills!
      if (isEnemyHazard && frac > 0.55) {
        slot.spikes.visible = true;
        const erupt = Math.min(1, (frac - 0.55) / 0.25);
        slot.spikes.scale.set(r * 0.48, erupt * 1.55, r * 0.48);
        const hazardCol =
          currState.mapId === 'Desert' ? 0xd99642 : currState.mapId === 'Graveyard' ? 0x9b5de5 : 0x7a482b;
        (slot.spikeMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hazardCol);
        (slot.spikeMat.uniforms.uEmissive!.value as THREE.Color).setHex(0xff3b5c);
      }
    }
  }

  private syncInteractables(currState: Readonly<SimState>, timeSec: number): void {
    this.activeInteractableIds.clear();
    let shrineRingIdx = 0;

    const list = currState.interactables;
    for (let i = 0; i < list.length; i++) {
      const it = list[i]!;
      this.activeInteractableIds.add(it.id);

      const variant: InteractableVariant = it.variant ?? 'normal';
      let slot = this.interactableSlots.get(it.id);

      if (!slot || slot.kind !== it.kind || slot.variant !== variant || slot.used !== it.used) {
        const hadSlot = slot !== undefined;
        if (slot) {
          this.rootGroup.remove(slot.mesh);
          slot.mainMat.dispose();
          slot.outlineMat.dispose();
        }
        const pair = this.assets.builtIn.getInteractableGeometryPair(
          it.kind as InteractableKind,
          variant,
          it.used,
        );
        const mainMat = createMkToonMaterial({
          color: 0xffffff,
          map: this.assets.getTexture(pair.textureKey),
          mapStrength: 0.48,
          vertexColors: true,
          rimStrength: 0.4,
          emissive: pair.emissiveHex ?? 0x000000,
          emissiveIntensity: pair.emissiveIntensity ?? 0,
          gloss: pair.gloss ?? 0.2,
        });
        const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
        const mesh = new THREE.Mesh(pair.geometry, mainMat);
        const outline = new THREE.Mesh(pair.outlineGeometry, outlineMat);
        mesh.add(outline);
        this.rootGroup.add(mesh);

        const nextSlot: InteractableSlot = { id: it.id, kind: it.kind, variant, used: it.used, mesh, outline, mainMat, outlineMat };
        this.interactableSlots.set(it.id, nextSlot);
        if (hadSlot) {
          const idx = this.interactableSlotList.indexOf(slot!);
          if (idx >= 0) this.interactableSlotList[idx] = nextSlot;
          else this.interactableSlotList.push(nextSlot);
        } else {
          this.interactableSlotList.push(nextSlot);
        }
        slot = nextSlot;
      }

      slot.mesh.visible = !(it.kind === 'Pot' && it.used);
      slot.mesh.position.set(it.pos.x, it.pos.y, it.pos.z);
      if (slot.mesh.visible) {
        const shR = it.kind === 'Pot' ? 0.85 : it.kind === 'BossSpawner' ? 2.6 : 1.75;
        this.pushContactShadow(it.pos.x, it.pos.y, it.pos.z, shR);
      }

      if (it.kind === 'ChargeShrine' && !it.used) {
        slot.mesh.rotation.y = Math.sin(timeSec * 0.8 + it.id) * 0.12;
      }

      if (it.kind === 'ChargeShrine' && !it.used && shrineRingIdx < SHRINE_RING_POOL_CAPACITY) {
        const ringSlot = this.shrineRings[shrineRingIdx++]!;
        ringSlot.group.visible = true;
        ringSlot.group.position.set(it.pos.x, it.pos.y + 0.04, it.pos.z);

        const isGold = variant === 'golden';
        const ringHex = isGold ? 0xffe45e : 0x4df5ff;
        (ringSlot.outerMat.uniforms.uBaseColor!.value as THREE.Color).setHex(ringHex);
        (ringSlot.outerMat.uniforms.uEmissive!.value as THREE.Color).setHex(ringHex);
        (ringSlot.fillMat.uniforms.uBaseColor!.value as THREE.Color).setHex(ringHex);
        (ringSlot.fillMat.uniforms.uEmissive!.value as THREE.Color).setHex(ringHex);

        const r = Math.max(2.5, it.radius);
        const pulse = 1.0 + Math.sin(timeSec * 4.2 + it.id) * 0.03;
        ringSlot.outerRing.scale.set(r * pulse, 1, r * pulse);

        const prog = Math.max(0.05, Math.min(1, it.chargeProgress));
        ringSlot.fillDisc.scale.set(r * prog, 1, r * prog);
        ringSlot.fillMat.uniforms.uOpacity!.value = it.chargeProgress > 0.01 ? 0.36 : 0.12;
      }
    }

    for (let i = this.interactableSlotList.length - 1; i >= 0; i--) {
      const slot = this.interactableSlotList[i]!;
      if (!this.activeInteractableIds.has(slot.id)) {
        this.rootGroup.remove(slot.mesh);
        slot.mainMat.dispose();
        slot.outlineMat.dispose();
        this.interactableSlots.delete(slot.id);
        const last = this.interactableSlotList.pop()!;
        if (i < this.interactableSlotList.length) this.interactableSlotList[i] = last;
      }
    }

    for (let i = shrineRingIdx; i < SHRINE_RING_POOL_CAPACITY; i++) {
      this.shrineRings[i]!.group.visible = false;
    }
  }

  private syncBossPortalPylonsAndLamps(currState: Readonly<SimState>, dt: number, timeSec: number): void {
    // 1. Swirling BossPortal archway
    if (currState.bossPortalOpen && currState.bossPortalPos) {
      this.bossPortalGroup.visible = true;
      this.bossPortalGroup.position.set(
        currState.bossPortalPos.x,
        currState.bossPortalPos.y,
        currState.bossPortalPos.z,
      );
      if (this.portalVortexMesh) {
        this.portalVortexMesh.rotation.z = timeSec * 2.4;
        const pulse = 1.0 + Math.sin(timeSec * 5.0) * 0.06;
        this.portalVortexMesh.scale.setScalar(pulse);
      }
    } else {
      this.bossPortalGroup.visible = false;
    }

    // 2. FinalBossMap 11 Boss Pylons (rising pillar + radial charge ring + crimson beam + stolen-weapon holo!)
    const pylons = currState.pylons;
    const pylonCount = Math.min(pylons.length, PYLON_POOL_CAPACITY);
    for (let i = 0; i < PYLON_POOL_CAPACITY; i++) {
      const slot = this.pylonSlots[i]!;
      if (i >= pylonCount) {
        slot.group.visible = false;
        slot.beamMesh.visible = false;
        slot.riseOffset = -5.2;
        continue;
      }

      const py = pylons[i]!;
      slot.group.visible = true;
      slot.group.position.set(py.pos.x, py.pos.y, py.pos.z);

      // Smooth rise animation from floor when active or cleansed!
      const targetRise = py.active || py.cleansed ? 0.0 : -4.6;
      slot.riseOffset += (targetRise - slot.riseOffset) * Math.min(1, dt * 5.5);
      slot.pillarMesh.position.y = slot.riseOffset;

      const isCleansed = py.cleansed;
      const isActive = py.active && !py.cleansed;
      const hasStolen = py.stolenWeaponId !== null && !isCleansed;

      // Color coding: Emerald when cleansed, pulsing crimson-magenta when active, dim violet when dormant
      const pillarEmissive = isCleansed ? 0x1fc77e : isActive ? 0xff2644 : 0x3b186e;
      (slot.pillarMat.uniforms.uEmissive!.value as THREE.Color).setHex(pillarEmissive);
      slot.pillarMat.uniforms.uEmissiveIntensity!.value = isActive
        ? 0.55 + Math.sin(timeSec * 8 + i) * 0.18
        : isCleansed
          ? 0.42
          : 0.15;

      // Ground radial charge ring filling smoothly with py.chargeProgress!
      const r = Math.max(2.6, py.radius);
      const ringPulse = isActive ? 1.0 + Math.sin(timeSec * 6.0 + i) * 0.04 : 1.0;
      slot.outerRing.visible = isActive || isCleansed;
      slot.outerRing.scale.set(r * ringPulse, 1, r * ringPulse);
      const ringCol = isCleansed ? 0x4dff9e : hasStolen ? 0xffe45e : 0xff2ec4;
      (slot.outerMat.uniforms.uBaseColor!.value as THREE.Color).setHex(ringCol);
      (slot.outerMat.uniforms.uEmissive!.value as THREE.Color).setHex(ringCol);

      const prog = isCleansed ? 1.0 : Math.max(0.06, Math.min(1, py.chargeProgress));
      slot.fillDisc.visible = isActive || isCleansed;
      slot.fillDisc.scale.set(r * prog, 1, r * prog);
      const fillCol = isCleansed ? 0x4dff9e : 0xffd23f;
      (slot.fillMat.uniforms.uBaseColor!.value as THREE.Color).setHex(fillCol);
      (slot.fillMat.uniforms.uEmissive!.value as THREE.Color).setHex(fillCol);
      slot.fillMat.uniforms.uOpacity!.value = isCleansed ? 0.22 : py.chargeProgress > 0.01 ? 0.44 : 0.16;

      // Spinning stolen-weapon hologram above pylons holding a stolen weapon!
      if (hasStolen) {
        slot.holoGroup.visible = true;
        slot.holoGroup.position.y = 7.4 + slot.riseOffset + Math.sin(timeSec * 4.5 + i) * 0.35;
        slot.holoGroup.rotation.set(0, timeSec * 3.8 + i, Math.sin(timeSec * 3.0) * 0.15);
        const hs = 1.0 + Math.sin(timeSec * 9.0 + i) * 0.1;
        slot.holoGroup.scale.setScalar(hs);
      } else {
        slot.holoGroup.visible = false;
      }

      // Pulsing crimson energy beam linking active pylon crystal -> Final Boss!
      if (isActive && this.finalBossActive && slot.riseOffset > -2.5) {
        slot.beamMesh.visible = true;
        this._vecA.set(py.pos.x, py.pos.y + 6.05 + slot.riseOffset, py.pos.z);
        this._vecB.subVectors(this.finalBossWorldPos, this._vecA);
        const beamLen = Math.max(0.5, this._vecB.length());
        this._mid.addVectors(this._vecA, this.finalBossWorldPos).multiplyScalar(0.5);
        this._vecB.normalize();
        this._quat.setFromUnitVectors(this._yAxis, this._vecB);

        slot.beamMesh.position.copy(this._mid);
        slot.beamMesh.quaternion.copy(this._quat);
        const pulseW = 0.85 + Math.sin(timeSec * 16.0 + i * 1.1) * 0.25;
        slot.beamMesh.scale.set(pulseW, beamLen, pulseW);
      } else {
        slot.beamMesh.visible = false;
      }
    }

    // 3. Graveyard Big Bob Darkness Lamps (wrought-iron lanterns + warm golden light pools!)
    const lamps = currState.darknessLamps;
    const lampCount = Math.min(lamps.length, LAMP_POOL_CAPACITY);
    const darkOn = currState.darknessActive;
    for (let i = 0; i < LAMP_POOL_CAPACITY; i++) {
      const slot = this.lampSlots[i]!;
      if (i >= lampCount) {
        slot.group.visible = false;
        continue;
      }

      const lamp = lamps[i]!;
      slot.group.visible = true;
      slot.group.position.set(lamp.pos.x, lamp.pos.y, lamp.pos.z);

      const lit = lamp.lit;
      const r = Math.max(2.6, lamp.radius);
      const prog = lit ? 1.0 : Math.max(0.05, Math.min(1, lamp.chargeProgress));

      // Lantern flame & iron rim glow vividly when lit (especially during Big Bob's Darkness!)
      const flamePulse = 1.0 + Math.sin(timeSec * 9.0 + i) * 0.14;
      slot.flameMesh.scale.setScalar(lit ? 1.25 * flamePulse : 0.45);
      slot.flameMesh.rotation.y = timeSec * 2.5 + i;
      (slot.flameMat.uniforms.uBaseColor!.value as THREE.Color).setHex(lit ? 0xfff08a : 0x3b4254);
      (slot.flameMat.uniforms.uEmissive!.value as THREE.Color).setHex(lit ? 0xffae19 : 0x1e2230);
      slot.flameMat.uniforms.uEmissiveIntensity!.value = lit ? (darkOn ? 2.4 : 1.5) : 0.15;

      (slot.postMat.uniforms.uEmissive!.value as THREE.Color).setHex(lit ? 0xffae19 : 0x2a1f45);
      slot.postMat.uniforms.uEmissiveIntensity!.value = lit ? (darkOn ? 0.55 : 0.3) : 0.08;

      // Ground light pool + charging ring
      const ringCol = lit ? 0xffe45e : darkOn ? 0xb938ff : 0x6b5b95;
      (slot.outerMat.uniforms.uBaseColor!.value as THREE.Color).setHex(ringCol);
      (slot.outerMat.uniforms.uEmissive!.value as THREE.Color).setHex(ringCol);
      slot.outerRing.scale.set(r, 1, r);

      (slot.fillMat.uniforms.uBaseColor!.value as THREE.Color).setHex(lit ? 0xffe066 : 0xffb703);
      (slot.fillMat.uniforms.uEmissive!.value as THREE.Color).setHex(lit ? 0xffae19 : 0xd97706);
      slot.fillDisc.scale.set(r * prog, 1, r * prog);
      slot.fillMat.uniforms.uOpacity!.value = lit ? (darkOn ? 0.52 : 0.34) : lamp.chargeProgress > 0.01 ? 0.32 : 0.08;

      // Warm golden light cone beam shining down when lit!
      slot.lightCone.visible = lit;
      if (lit) {
        const coneScale = (r / 2.8) * (0.95 + Math.sin(timeSec * 5.0 + i) * 0.05);
        slot.lightCone.scale.set(coneScale, 1.0, coneScale);
        slot.coneMat.uniforms.uOpacity!.value = darkOn ? 0.34 : 0.18;
      }
    }
  }

  public dispose(): void {
    if (this.playerRig) { this.playerRig.dispose(); this.playerRig = null; }
    if (this.entBossRig) { this.entBossRig.dispose(); this.entBossRig = null; }
    if (this.pharaohBossRig) { this.pharaohBossRig.dispose(); this.pharaohBossRig = null; }
    if (this.bigBobRig) { this.bigBobRig.dispose(); this.bigBobRig = null; }
    if (this.finalBossRig) { this.finalBossRig.dispose(); this.finalBossRig = null; }
    this.entityShadowGeo.dispose();
    this.entityShadowMat.dispose();

    for (const pool of [
      ...this.enemyPools.values(),
      ...this.projectilePools.values(),
      ...this.pickupPools.values(),
    ]) {
      pool.mainMat.dispose();
      pool.outlineMat.dispose();
    }
    for (const slot of this.areaSlots) {
      slot.ringMat.dispose();
      slot.discMat.dispose();
      slot.colMat.dispose();
      slot.coreMat.dispose();
      slot.accretionMat.dispose();
      slot.spikeMat.dispose();
      slot.slashMat.dispose();
    }
    for (const g of this.areaGeometries) g.dispose();
    for (const slot of this.interactableSlotList) {
      slot.mainMat.dispose();
      slot.outlineMat.dispose();
    }
    this.interactableSlots.clear();
    this.interactableSlotList.length = 0;
    for (const sr of this.shrineRings) {
      sr.outerMat.dispose();
      sr.fillMat.dispose();
    }
    for (const g of this.shrineRingGeometries) g.dispose();
    for (const g of this.portalGeometries) g.dispose();
    for (const m of this.portalMaterials) m.dispose();

    for (const p of this.pylonSlots) {
      p.pillarMat.dispose();
      p.outerMat.dispose();
      p.fillMat.dispose();
      p.beamMat.dispose();
      p.holoMat.dispose();
    }
    for (const g of this.pylonGeometries) g.dispose();
    for (const m of this.pylonExtraMaterials) m.dispose();

    for (const l of this.lampSlots) {
      l.postMat.dispose();
      l.flameMat.dispose();
      l.outerMat.dispose();
      l.fillMat.dispose();
      l.coneMat.dispose();
    }
    for (const g of this.lampGeometries) g.dispose();
    for (const m of this.lampExtraMaterials) m.dispose();
  }
}
