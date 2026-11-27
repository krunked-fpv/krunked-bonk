/**
 * KRUNKEDBONK — Zero-GC Pooled & Instanced Entity Renderer
 *
 * Syncs prevState -> currState with interpAlpha (or 1.0 when classic50HzSnap is enabled):
 * - Articulated Player Rig (Fox, Calcium skateboard, SirOofie cape/sword, Megachad flex/aura)
 * - Per-archetype InstancedMesh Enemy Pools with smooth Inverted-Hull Outlines, walk wobble,
 *   debuff tints, and crisp white hit-flash + dedicated articulated Lil Bark (EntStage1) boss rig
 * - Spinning faceted XP gems & powerup pickups
 * - Distinct weapon projectiles (fireball, bone, sword crescent, bullet, boulder, lightning, sniper)
 * - Pooled Area Effects (Aura ring, Nova, Pools, Beams, Tornado, BlackHole, RootSpikes telegraphs)
 * - Outlined Interactables (including ChargeShrine ground ring + radial fill progress arc),
 *   swirling BossPortal archway, BossPylons, and DarknessLamps
 */

import * as THREE from 'three';
import type {
  CameraMode,
  CharacterId,
  EnemyState,
  InteractableKind,
  InteractableVariant,
  SimEvent,
  SimState,
} from '../contracts/index';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { CharacterRig } from '../assets/ProceduralLowPolyPack';
import {
  createMkToonMaterial,
  createOutlineMaterial,
  setMkToonHitFlash,
  setMkToonTexture,
} from './toonShader';

const ENEMY_ARCHETYPES = [
  'Goblin',
  'GoblinStrong',
  'Skeleton',
  'Slime',
  'MinibossGolem',
  'MinibossPig',
  'Ghost',
  'GhostPurple',
  'GhostRed',
  'GhostInvincible',
] as const;

const PROJECTILE_ARCHETYPES = [
  'fireball',
  'bone',
  'sword_arc',
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
const AREA_EFFECT_POOL_CAPACITY = 64;
const SHRINE_RING_POOL_CAPACITY = 24;
const PYLON_POOL_CAPACITY = 16;

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
  spikes: THREE.Group;
  ringMat: THREE.ShaderMaterial;
  discMat: THREE.ShaderMaterial;
  colMat: THREE.ShaderMaterial;
  spikeMat: THREE.ShaderMaterial;
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
  private playerRigKey = '';
  private playerHitFlash = 0;
  private playerAttackSwing = 0;
  private wheelAngle = 0;

  // Articulated Boss Rig for EntStage1 (Lil Bark)
  private entBossRig: ReturnType<AssetRegistry['builtIn']['buildEntBossRig']> | null = null;
  private entBossHitFlash = 0;

  // Instanced Pools
  private readonly enemyPools = new Map<string, OutlinedInstancedPool>();
  private readonly projectilePools = new Map<string, OutlinedInstancedPool>();
  private readonly pickupPools = new Map<string, OutlinedInstancedPool>();

  // Pooled Area Effects
  private readonly areaSlots: AreaEffectVisualSlot[] = [];
  private readonly areaGeometries: THREE.BufferGeometry[] = [];

  // Interactable slots (reused by entity id; zero per-frame allocations once world spawns!)
  private readonly interactableSlots = new Map<number, InteractableSlot>();
  private readonly shrineRings: ShrineRingSlot[] = [];
  private readonly shrineRingGeometries: THREE.BufferGeometry[] = [];

  // Boss Portal archway + animated swirling vortex
  private readonly bossPortalGroup = new THREE.Group();
  private portalVortexMesh: THREE.Mesh | null = null;
  private portalVortexMat: THREE.ShaderMaterial | null = null;
  private readonly portalGeometries: THREE.BufferGeometry[] = [];
  private readonly portalMaterials: THREE.Material[] = [];

  // FinalBossMap Boss Pylons + Graveyard Darkness Lamps
  private readonly pylonMeshes: THREE.Group[] = [];
  private readonly pylonMaterials: THREE.ShaderMaterial[] = [];
  private readonly pylonGeometries: THREE.BufferGeometry[] = [];

  // Hit-flash timers by enemy entityId (reused Map)
  private readonly hitFlashTimers = new Map<number, number>();
  private readonly prevEnemyById = new Map<number, EnemyState>();
  private readonly prevProjById = new Map<number, { x: number; y: number; z: number }>();
  private readonly activeInteractableIds = new Set<number>();

  // Pre-allocated scratch math objects (ZERO per-frame allocations!)
  private readonly _mat = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _vel = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler();
  private readonly _scale = new THREE.Vector3();
  private readonly _col = new THREE.Color();
  private readonly _zAxis = new THREE.Vector3(0, 0, 1);

  constructor(assets: AssetRegistry) {
    this.assets = assets;
    this.rootGroup.name = 'EntityInstancerRoot';

    this.initEnemyPools();
    this.initProjectilePools();
    this.initPickupPools();
    this.initAreaEffectPool();
    this.initShrineRingPool();
    this.initBossPortal();
    this.initPylonPool();
  }

  private initEnemyPools(): void {
    const white = new THREE.Color(0xffffff);
    for (const arch of ENEMY_ARCHETYPES) {
      const pair = this.assets.builtIn.getEnemyGeometryPair(arch);
      const mainMat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        mapStrength: 0.42,
        vertexColors: true,
        rimStrength: 0.38,
        emissive: pair.emissiveHex ?? 0x000000,
        emissiveIntensity: pair.emissiveIntensity ?? 0,
        gloss: pair.gloss ?? 0.12,
      });
      const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
      const cap = arch.startsWith('Miniboss') || arch === 'GhostInvincible' ? 24 : ENEMY_POOL_CAPACITY;

      const main = new THREE.InstancedMesh(pair.geometry, mainMat, cap);
      const outline = new THREE.InstancedMesh(pair.outlineGeometry, outlineMat, cap);
      main.count = 0;
      outline.count = 0;
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      this.enemyPools.set(arch, { main, outline, mainMat, outlineMat, count: 0, capacity: cap });
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
      });
      const outlineMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);

      const main = new THREE.InstancedMesh(pair.geometry, mainMat, PROJECTILE_POOL_CAPACITY);
      const outline = new THREE.InstancedMesh(pair.outlineGeometry, outlineMat, PROJECTILE_POOL_CAPACITY);
      main.count = 0;
      outline.count = 0;
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      this.projectilePools.set(arch, {
        main,
        outline,
        mainMat,
        outlineMat,
        count: 0,
        capacity: PROJECTILE_POOL_CAPACITY,
      });
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
      main.frustumCulled = false;
      outline.frustumCulled = false;
      main.setColorAt(0, white);

      this.rootGroup.add(main, outline);
      this.pickupPools.set(kind, { main, outline, mainMat, outlineMat, count: 0, capacity: cap });
    }
  }

  private initAreaEffectPool(): void {
    const ringGeo = new THREE.RingGeometry(0.84, 1.0, 28);
    ringGeo.rotateX(-Math.PI * 0.5);
    const discGeo = new THREE.CircleGeometry(1.0, 24);
    discGeo.rotateX(-Math.PI * 0.5);
    const colGeo = new THREE.CylinderGeometry(0.45, 0.72, 1.0, 10, 1, true);
    colGeo.translate(0, 0.5, 0);
    const spikeGeo = new THREE.ConeGeometry(0.24, 1.7, 5);
    spikeGeo.translate(0, 0.85, 0);
    this.areaGeometries.push(ringGeo, discGeo, colGeo, spikeGeo);

    for (let i = 0; i < AREA_EFFECT_POOL_CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ringMat = createMkToonMaterial({
        color: 0xffd84d,
        emissive: 0xffb703,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const discMat = createMkToonMaterial({
        color: 0xffd84d,
        emissive: 0xffb703,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const colMat = createMkToonMaterial({
        color: 0x5cf7ff,
        emissive: 0x38f2ff,
        emissiveIntensity: 1.15,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const spikeMat = createMkToonMaterial({
        color: 0x7a482b,
        emissive: 0xff3b5c,
        emissiveIntensity: 0.35,
      });

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.14;
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = 0.1;
      const column = new THREE.Mesh(colGeo, colMat);
      column.visible = false;

      // Cluster of thorny wooden RootSpikes for boss hazard telegraphs
      const spikes = new THREE.Group();
      spikes.visible = false;
      for (let s = 0; s < 5; s++) {
        const sp = new THREE.Mesh(spikeGeo, spikeMat);
        const a = (s / 5) * Math.PI * 2;
        const rad = s === 0 ? 0 : 0.42;
        sp.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        sp.rotation.set((s % 2 === 0 ? 0.18 : -0.18), a, 0.15);
        spikes.add(sp);
      }

      group.add(ring, disc, column, spikes);
      this.rootGroup.add(group);
      this.areaSlots.push({ group, ring, disc, column, spikes, ringMat, discMat, colMat, spikeMat });
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
      const fillMat = createMkToonMaterial({
        color: 0x4df5ff,
        emissive: 0x38e8ff,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

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

    // Swirling pixelated portal vortex plane inside the archway
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

    // Tall translucent purple-cyan sky beacon
    const beaconGeo = new THREE.CylinderGeometry(0.75, 1.35, 32, 8, 1, true);
    beaconGeo.translate(0, 16, 0);
    const beaconMat = createMkToonMaterial({
      color: 0xb938ff,
      emissive: 0x7b2cbf,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);

    this.portalVortexMesh = vortexMesh;
    this.portalVortexMat = vortexMat;
    this.portalGeometries.push(vortexGeo, beaconGeo);
    this.portalMaterials.push(archMat, outMat, vortexMat, beaconMat);

    this.bossPortalGroup.add(archMesh, vortexMesh, beacon);
    this.rootGroup.add(this.bossPortalGroup);
  }

  private initPylonPool(): void {
    const pair = this.assets.builtIn.getInteractableGeometryPair('BossPylon', 'normal', false);
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 24);
    ringGeo.rotateX(-Math.PI * 0.5);
    this.pylonGeometries.push(ringGeo);

    for (let i = 0; i < PYLON_POOL_CAPACITY; i++) {
      const g = new THREE.Group();
      g.visible = false;
      const mat = createMkToonMaterial({
        color: 0xffffff,
        map: this.assets.getTexture(pair.textureKey),
        vertexColors: true,
        emissive: 0xc91e94,
        emissiveIntensity: 0.45,
      });
      const outMat = createOutlineMaterial(pair.outlineThickness, 0x0b0d14);
      const mesh = new THREE.Mesh(pair.geometry, mat);
      mesh.add(new THREE.Mesh(pair.outlineGeometry, outMat));
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 0.14;
      g.add(mesh, ring);
      this.rootGroup.add(g);
      this.pylonMeshes.push(g);
      this.pylonMaterials.push(mat, outMat);
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
        this.hitFlashTimers.set(ev.targetId, 0.12);
      } else if (ev.type === 'player_hurt') {
        this.playerHitFlash = 0.22;
      } else if (ev.type === 'weapon_fire') {
        this.playerAttackSwing = 1.0;
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

    // Decay hit-flash timers in place (zero allocations)
    for (const [id, rem] of this.hitFlashTimers) {
      const next = rem - dt;
      if (next <= 0) {
        this.hitFlashTimers.delete(id);
      } else {
        this.hitFlashTimers.set(id, next);
      }
    }
    if (this.playerHitFlash > 0) this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
    if (this.playerAttackSwing > 0) this.playerAttackSwing = Math.max(0, this.playerAttackSwing - dt * 5.5);

    this.syncPlayer(prevState, currState, interpAlpha, dt, timeSec, cameraMode);
    this.syncEnemies(prevState, currState, interpAlpha, timeSec);
    this.syncPickups(currState, timeSec);
    this.syncProjectiles(prevState, currState, interpAlpha, timeSec);
    this.syncAreaEffects(currState, timeSec);
    this.syncInteractables(currState, timeSec);
    this.syncBossPortalAndPylons(currState, timeSec);
  }

  private ensurePlayerRig(characterId: CharacterId, skinId: string | null, hatId: string | null): CharacterRig {
    const key = `${characterId}|${skinId ?? ''}|${hatId ?? ''}`;
    if (this.playerRig && this.playerRigKey === key) {
      return this.playerRig;
    }
    if (this.playerRig) {
      this.rootGroup.remove(this.playerRig.root);
      this.playerRig.dispose();
    }
    this.playerRig = this.assets.builtIn.buildCharacterRig(characterId, skinId, hatId);
    this.playerRigKey = key;
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

    // Hide body in 1st-person mode so camera isn't obstructed
    rig.root.visible = cameraMode !== 'first' && !p1.dead;
    if (!rig.root.visible) return;

    const px = p0.pos.x + (p1.pos.x - p0.pos.x) * alpha;
    const py = p0.pos.y + (p1.pos.y - p0.pos.y) * alpha;
    const pz = p0.pos.z + (p1.pos.z - p0.pos.z) * alpha;
    const yaw = lerpAngle(p0.yaw, p1.yaw, alpha);

    rig.root.position.set(px, py, pz);
    // Character rigs face local +Z; simcore yaw=0 faces -Z ((-sin(yaw), 0, -cos(yaw)))
    rig.root.rotation.set(0, yaw + Math.PI, 0);

    const hSpeed = Math.hypot(p1.vel.x, p1.vel.z);
    const moving = hSpeed > 0.6;
    const walkFreq = Math.min(18, 6.5 + hSpeed * 0.72);
    const walkPhase = timeSec * walkFreq;

    // Expressive kinetic movement animation (slide lean, rail carve, walk bob, jump stretch!)
    if (p1.railId !== null) {
      // Carving sideways on grind rail!
      rig.bodyPivot.position.y = 0.08 + Math.sin(timeSec * 14) * 0.04;
      rig.bodyPivot.rotation.set(-0.08, Math.PI * 0.35, Math.sin(timeSec * 9) * 0.14);
      rig.bodyPivot.scale.set(1.0, 0.94, 1.0);
      rig.leftArm.rotation.set(0, 0, 0.95 + Math.sin(timeSec * 9) * 0.18);
      rig.rightArm.rotation.set(0, 0, -0.95 - Math.sin(timeSec * 9) * 0.18);
      rig.leftLeg.rotation.set(0.15, 0, 0.12);
      rig.rightLeg.rotation.set(-0.15, 0, -0.12);
    } else if (p1.isSliding) {
      // Low crouched high-speed slope slide!
      rig.bodyPivot.position.y = -0.12;
      rig.bodyPivot.rotation.set(-0.46, 0.22, -0.14);
      rig.bodyPivot.scale.set(1.08, 0.64, 1.08);
      rig.leftArm.rotation.set(-0.5, 0, 0.65);
      rig.rightArm.rotation.set(-0.4, 0, -0.55);
      rig.leftLeg.rotation.set(-0.7, 0, 0);
      rig.rightLeg.rotation.set(0.4, 0, 0);
    } else if (!p1.grounded) {
      // Dynamic airborne pitch & stretch
      const stretch = 1.0 + Math.min(0.12, Math.abs(p1.vel.y) * 0.008);
      rig.bodyPivot.position.y = 0.05;
      rig.bodyPivot.rotation.set(Math.max(-0.28, Math.min(0.28, -p1.vel.y * 0.015)), 0, 0);
      rig.bodyPivot.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      rig.leftArm.rotation.set(-0.65, 0, 0.45);
      rig.rightArm.rotation.set(-0.45, 0, -0.45);
      rig.leftLeg.rotation.set(0.35, 0, 0);
      rig.rightLeg.rotation.set(-0.25, 0, 0);
    } else if (moving) {
      // Lively bouncy low-poly walk/run cycle
      const bob = Math.abs(Math.sin(walkPhase)) * 0.14;
      const swing = Math.sin(walkPhase) * Math.min(0.85, 0.35 + hSpeed * 0.045);
      rig.bodyPivot.position.y = bob;
      rig.bodyPivot.rotation.set(Math.min(0.2, hSpeed * 0.012), 0, Math.cos(walkPhase) * 0.06);
      rig.bodyPivot.scale.set(1, 1, 1);
      rig.leftArm.rotation.set(swing, 0, 0.14);
      rig.rightArm.rotation.set(-swing, 0, -0.14);
      rig.leftLeg.rotation.set(-swing * 1.05, 0, 0);
      rig.rightLeg.rotation.set(swing * 1.05, 0, 0);
    } else {
      // Idle heroic breathing
      const breathe = Math.sin(timeSec * 2.8);
      rig.bodyPivot.position.y = breathe * 0.03;
      rig.bodyPivot.rotation.set(0, 0, 0);
      rig.bodyPivot.scale.set(1, 1 + breathe * 0.02, 1);
      rig.leftArm.rotation.set(0, 0, 0.12 + breathe * 0.04);
      rig.rightArm.rotation.set(0, 0, -0.12 - breathe * 0.04);
      rig.leftLeg.rotation.set(0, 0, 0);
      rig.rightLeg.rotation.set(0, 0, 0);
    }

    // Apply character scale baseline from palette on top of squash/stretch
    const baseScale = currState.characterId === 'Megachad' ? 1.32 : currState.characterId === 'SirOofie' ? 1.06 : 1.0;
    rig.bodyPivot.scale.multiplyScalar(baseScale);

    // Weapon attack recoil swing
    if (this.playerAttackSwing > 0) {
      rig.rightArm.rotation.x -= Math.sin(this.playerAttackSwing * Math.PI) * 1.15;
    }

    // Character-specific signature animations:
    if (rig.tailPivot) {
      // Fox bushy tail lively wag!
      rig.tailPivot.rotation.y = Math.sin(timeSec * (moving ? 11.5 : 4.2)) * (moving ? 0.42 : 0.22);
      rig.tailPivot.rotation.x = p1.isSliding ? -0.35 : 0.1;
    }
    if (rig.capePivot) {
      // SirOofie crimson cape billows dynamically with speed!
      const speedBillow = Math.min(0.85, hSpeed * 0.048);
      rig.capePivot.rotation.x = 0.12 + speedBillow + Math.sin(timeSec * 9.0) * (0.06 + speedBillow * 0.18);
    }
    if (rig.boardPivot) {
      // Calcium tilted chunky skateboard carve & spinning wheels!
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
    if (rig.auraRing) {
      // Megachad glowing golden Aura Ring + Flex flare!
      const flexing = p1.invulnTimer > 0;
      rig.auraRing.rotation.z = timeSec * (flexing ? 5.2 : 1.8);
      const auraScale = flexing ? 1.35 + Math.sin(timeSec * 22) * 0.12 : 1.0 + Math.sin(timeSec * 3.5) * 0.06;
      rig.auraRing.scale.setScalar(auraScale);
      if (flexing) {
        // Heroic bicep flex pose!
        rig.leftArm.rotation.set(-0.6, 0, 1.15);
        rig.rightArm.rotation.set(-0.6, 0, -1.15);
      }
    }

    // Player hit-flash
    const flashAmt = this.playerHitFlash > 0 ? Math.min(1, this.playerHitFlash * 5) : 0;
    for (let m = 0; m < rig.toonMaterials.length; m++) {
      setMkToonHitFlash(rig.toonMaterials[m]!, flashAmt);
    }
  }

  private syncEnemies(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    alpha: number,
    timeSec: number,
  ): void {
    // Reset all pool counts
    for (const pool of this.enemyPools.values()) {
      pool.count = 0;
    }

    // Map previous enemies by id in-place (reusing existing object refs, zero allocations)
    this.prevEnemyById.clear();
    const prevList = prevState.enemies;
    for (let i = 0; i < prevList.length; i++) {
      const e = prevList[i]!;
      this.prevEnemyById.set(e.id, e);
    }

    let sawEntBoss = false;
    const currList = currState.enemies;

    for (let i = 0; i < currList.length; i++) {
      const e = currList[i]!;
      const prev = this.prevEnemyById.get(e.id);
      const x = prev ? prev.pos.x + (e.pos.x - prev.pos.x) * alpha : e.pos.x;
      const y = prev ? prev.pos.y + (e.pos.y - prev.pos.y) * alpha : e.pos.y;
      const z = prev ? prev.pos.z + (e.pos.z - prev.pos.z) * alpha : e.pos.z;
      // Prefer velocity heading when moving so enemies always face travel direction cleanly
      const velSq = e.vel.x * e.vel.x + e.vel.z * e.vel.z;
      const yaw =
        velSq > 0.09
          ? Math.atan2(e.vel.x, e.vel.z)
          : prev
            ? lerpAngle(prev.yaw, e.yaw, alpha)
            : e.yaw;

      const arch = this.assets.builtIn.normalizeEnemyArchetype(e.enemyId);
      const flashRem = this.hitFlashTimers.get(e.id) ?? 0;

      // Special articulated rig for Forest Stage Boss: EntStage1 (Lil Bark)
      if (arch === 'EntStage1' && !sawEntBoss) {
        sawEntBoss = true;
        if (!this.entBossRig) {
          this.entBossRig = this.assets.builtIn.buildEntBossRig();
          this.rootGroup.add(this.entBossRig.root);
        }
        this.entBossRig.root.visible = true;
        const bossScale = Math.max(0.85, e.radius / 2.2);
        const stomp = Math.abs(Math.sin(timeSec * 4.5 + e.id));
        this.entBossRig.root.position.set(x, y + stomp * 0.22, z);
        this.entBossRig.root.rotation.set(0, yaw, Math.sin(timeSec * 4.5) * 0.05);
        this.entBossRig.root.scale.setScalar(bossScale);
        this.entBossRig.leftArm.rotation.x = Math.sin(timeSec * 4.5) * 0.52;
        this.entBossRig.rightArm.rotation.x = -Math.sin(timeSec * 4.5) * 0.52;
        this.entBossRig.crownGroup.rotation.y = Math.sin(timeSec * 1.8) * 0.08;
        this.entBossHitFlash = flashRem > 0 ? Math.min(1, flashRem * 10) : 0;
        for (let m = 0; m < this.entBossRig.toonMaterials.length; m++) {
          setMkToonHitFlash(this.entBossRig.toonMaterials[m]!, this.entBossHitFlash);
        }
        continue;
      }

      const pool = this.enemyPools.get(arch) ?? this.enemyPools.get('Goblin');
      if (!pool || pool.count >= pool.capacity) continue;

      // Expressive low-poly walk wobble / slime bounce / ghost hover!
      const phase = timeSec * (e.isBoss ? 5.2 : 8.5) + e.id * 1.37;
      const isSlime = arch === 'Slime';
      const isGhost = arch.startsWith('Ghost');
      const hopY = isGhost ? 0.38 + Math.sin(phase * 0.65) * 0.22 : Math.abs(Math.sin(phase)) * 0.16;
      const rollZ = isGhost ? Math.sin(phase * 0.5) * 0.08 : Math.sin(phase) * 0.1;

      const baseScale = e.isBoss
        ? Math.max(1.25, e.radius / 1.1)
        : e.isElite
          ? Math.max(1.25, e.radius / 0.72)
          : Math.max(0.75, e.radius / 0.72);
      const squashY = isSlime ? 1.0 + Math.sin(phase * 1.4) * 0.18 : 1.0;
      const squashXZ = isSlime ? 1.0 / Math.sqrt(squashY) : 1.0;

      // Hit squash punch
      const hitPunch = flashRem > 0 ? 1.12 : 1.0;

      this._pos.set(x, y + hopY, z);
      this._euler.set(0, yaw, rollZ);
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

      // Per-instance tint: white hit-flash boost > debuff color > elite glow > clean neutral
      if (flashRem > 0) {
        this._col.setRGB(3.2, 3.1, 2.9); // bright arcade white hit-flash!
      } else if (e.debuffs.length > 0) {
        const d = e.debuffs[0]!.type;
        if (d === 'Freeze') this._col.setHex(0x80f5ff);
        else if (d === 'Poison') this._col.setHex(0x88ff66);
        else if (d === 'Burn') this._col.setHex(0xff8a47);
        else if (d === 'Charm') this._col.setHex(0xff80ec);
        else if (d === 'Bloodmark') this._col.setHex(0xff6b81);
        else this._col.setHex(0xffffff);
      } else if (e.isElite) {
        this._col.setHex(0xffe699);
      } else {
        this._col.setHex(0xffffff);
      }
      pool.main.setColorAt(idx, this._col);
    }

    if (this.entBossRig && !sawEntBoss) {
      this.entBossRig.root.visible = false;
    }

    // Flush updated counts & buffers
    for (const pool of this.enemyPools.values()) {
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
      if (pool.count > 0) {
        pool.main.instanceMatrix.needsUpdate = true;
        pool.outline.instanceMatrix.needsUpdate = true;
        if (pool.main.instanceColor) pool.main.instanceColor.needsUpdate = true;
      }
    }
  }

  private syncPickups(currState: Readonly<SimState>, timeSec: number): void {
    for (const pool of this.pickupPools.values()) {
      pool.count = 0;
    }

    const list = currState.pickups;
    for (let i = 0; i < list.length; i++) {
      const pk = list[i]!;
      let poolKey: (typeof PICKUP_POOLS)[number] = 'orb';
      let hex = 0x52f2ff;
      let sc = 1.0;

      switch (pk.kind) {
        case 'xp_small':
          poolKey = 'gem';
          hex = 0x4df5ff;
          sc = 0.85;
          break;
        case 'xp_medium':
          poolKey = 'gem';
          hex = 0x52ff8a;
          sc = 1.1;
          break;
        case 'xp_large':
          poolKey = 'gem';
          hex = 0xff5cf4;
          sc = 1.42;
          break;
        case 'gold':
          poolKey = 'coin';
          hex = 0xffd23f;
          sc = 1.0;
          break;
        case 'silver':
          poolKey = 'coin';
          hex = 0xdbe6f2;
          sc = 1.12;
          break;
        case 'health':
          poolKey = 'heart';
          hex = 0xff3b5c;
          sc = 1.15;
          break;
        case 'magnet':
          poolKey = 'orb';
          hex = 0x38bdf8;
          sc = 1.25;
          break;
        case 'nuke':
          poolKey = 'orb';
          hex = 0xff4d2e;
          sc = 1.35;
          break;
        case 'freeze_clock':
          poolKey = 'orb';
          hex = 0x80faff;
          sc = 1.25;
          break;
        case 'rage':
          poolKey = 'orb';
          hex = 0xff2e54;
          sc = 1.25;
          break;
        case 'haste':
          poolKey = 'orb';
          hex = 0xffe45e;
          sc = 1.25;
          break;
        case 'stonks':
          poolKey = 'coin';
          hex = 0x52ff8a;
          sc = 1.3;
          break;
        case 'shield':
          poolKey = 'orb';
          hex = 0x5cf7ff;
          sc = 1.25;
          break;
        default:
          poolKey = 'orb';
          hex = 0xffd84d;
          sc = 1.3;
          break;
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

    for (const pool of this.pickupPools.values()) {
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
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
    for (const pool of this.projectilePools.values()) {
      pool.count = 0;
    }

    this.prevProjById.clear();
    const prevList = prevState.projectiles;
    for (let i = 0; i < prevList.length; i++) {
      const pr = prevList[i]!;
      this.prevProjById.set(pr.id, pr.pos);
    }

    const currList = currState.projectiles;
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

      if (arch === 'bone' || arch === 'boulder') {
        this._euler.set(timeSec * 9.0 + pr.id, timeSec * 12.0 + pr.id, timeSec * 6.0);
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

    for (const pool of this.projectilePools.values()) {
      pool.main.count = pool.count;
      pool.outline.count = pool.count;
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

      // Color by kind & ownership
      let hex = 0xffd84d;
      if (isEnemyHazard) {
        hex = 0xff2e4c; // Pulsing crimson boss telegraph (e.g. Lil Bark RootSpikes!)
      } else if (ae.kind === 'aura') {
        hex = 0xffd84d;
      } else if (ae.kind === 'beam') {
        hex = 0x5cf7ff;
      } else if (ae.kind === 'pool') {
        hex = ae.element === 'Fire' ? 0xff621f : ae.element === 'Ice' ? 0x70f5ff : 0x76f562;
      } else if (ae.kind === 'blackhole') {
        hex = 0xb938ff;
      } else if (ae.kind === 'tornado') {
        hex = 0x99f6ff;
      } else if (ae.kind === 'nova') {
        hex = 0xff9f43;
      }

      (slot.ringMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
      (slot.ringMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);
      (slot.discMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
      (slot.discMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);

      const pulse = 1.0 + Math.sin(timeSec * (isEnemyHazard ? 18 : 7)) * 0.05;
      const ringScale = ae.kind === 'nova' ? r * (0.25 + frac * 0.85) : r * pulse;
      slot.ring.scale.set(ringScale, 1, ringScale);
      slot.disc.scale.set(r * (isEnemyHazard ? 0.3 + frac * 0.7 : 0.96), 1, r * (isEnemyHazard ? 0.3 + frac * 0.7 : 0.96));

      // Beam / Tornado sky column
      if (ae.kind === 'beam' || ae.kind === 'tornado') {
        slot.column.visible = true;
        slot.column.scale.set(r * 0.65, Math.max(4, ae.height || 14), r * 0.65);
        slot.column.rotation.y = timeSec * 8.0;
        (slot.colMat.uniforms.uBaseColor!.value as THREE.Color).setHex(hex);
        (slot.colMat.uniforms.uEmissive!.value as THREE.Color).setHex(hex);
      } else {
        slot.column.visible = false;
      }

      // Enemy hazard RootSpikes erupting after warning telegraph fills!
      if (isEnemyHazard && frac > 0.55) {
        slot.spikes.visible = true;
        const erupt = Math.min(1, (frac - 0.55) / 0.25);
        slot.spikes.scale.set(r * 0.48, erupt * 1.4, r * 0.48);
      } else {
        slot.spikes.visible = false;
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

        slot = {
          id: it.id,
          kind: it.kind,
          variant,
          used: it.used,
          mesh,
          outline,
          mainMat,
          outlineMat,
        };
        this.interactableSlots.set(it.id, slot);
      }

      // Hide broken pots cleanly
      slot.mesh.visible = !(it.kind === 'Pot' && it.used);
      slot.mesh.position.set(it.pos.x, it.pos.y, it.pos.z);

      // Gentle idle hover/spin on floating rune shrines
      if (it.kind === 'ChargeShrine' && !it.used) {
        slot.mesh.rotation.y = Math.sin(timeSec * 0.8 + it.id) * 0.12;
      }

      // ChargeShrine pulsing translucent ground ring + live radial charge progress fill!
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

    // Remove despawned interactables
    for (const [id, slot] of this.interactableSlots) {
      if (!this.activeInteractableIds.has(id)) {
        this.rootGroup.remove(slot.mesh);
        slot.mainMat.dispose();
        slot.outlineMat.dispose();
        this.interactableSlots.delete(id);
      }
    }

    // Hide unused shrine rings
    for (let i = shrineRingIdx; i < SHRINE_RING_POOL_CAPACITY; i++) {
      this.shrineRings[i]!.group.visible = false;
    }
  }

  private syncBossPortalAndPylons(currState: Readonly<SimState>, timeSec: number): void {
    // Swirling BossPortal archway
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

    // Boss Pylons (FinalBossMap)
    const pylons = currState.pylons;
    for (let i = 0; i < PYLON_POOL_CAPACITY; i++) {
      const g = this.pylonMeshes[i]!;
      if (i < pylons.length) {
        const py = pylons[i]!;
        g.visible = true;
        g.position.set(py.pos.x, py.pos.y, py.pos.z);
        const ring = g.children[1];
        if (ring) {
          ring.scale.set(py.radius, 1, py.radius);
        }
      } else {
        g.visible = false;
      }
    }
  }

  public dispose(): void {
    if (this.playerRig) {
      this.playerRig.dispose();
      this.playerRig = null;
    }
    if (this.entBossRig) {
      this.entBossRig.dispose();
      this.entBossRig = null;
    }
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
      slot.spikeMat.dispose();
    }
    for (const g of this.areaGeometries) g.dispose();
    for (const slot of this.interactableSlots.values()) {
      slot.mainMat.dispose();
      slot.outlineMat.dispose();
    }
    this.interactableSlots.clear();
    for (const sr of this.shrineRings) {
      sr.outerMat.dispose();
      sr.fillMat.dispose();
    }
    for (const g of this.shrineRingGeometries) g.dispose();
    for (const g of this.portalGeometries) g.dispose();
    for (const m of this.portalMaterials) m.dispose();
    for (const g of this.pylonGeometries) g.dispose();
    for (const m of this.pylonMaterials) m.dispose();
  }
}
