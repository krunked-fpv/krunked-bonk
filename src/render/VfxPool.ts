/**
 * KRUNKEDBONK — Zero-GC Pre-Allocated Arcade VFX Particle Pool (Wave 2 Full Expansion)
 *
 * Renders punchy retro-arcade 3D particles via pre-allocated InstancedMesh pools
 * (ZERO per-frame allocations) across all 30 weapons, 4 biomes, Big Bob Darkness Lamps,
 * and Final Boss 11 Pylons:
 * - Slide dust & golden sparks, rail grind spark showers
 * - Hit sparks, Crit starbursts, Megacrit shockwaves, BONK! super-bursts
 * - All 30 weapon VFX: Homing Rocket smoke streaks, Dragon's Breath flame cones,
 *   FlameWalker fire embers, FrostWalker ice shards, PoisonFlask toxic bubbles,
 *   BlackHole inward violet gravity motes, SpaceNoodle plasma sparks, Tornado debris,
 *   Aegis shield rings, Katana/Sword/Scythe slash sparks, Mine blasts, Lightning smite!
 * - Boss Pylon weapon-steal crimson siphon, weapon-reclaim pillar, & DarknessLamp fireflies!
 */

import * as THREE from 'three';
import type { ElementType, PlayerState, SimEvent, SimState } from '../contracts/index';
import { createMkToonMaterial } from './toonShader';

const CUBE_CAPACITY = 768;
const RING_CAPACITY = 112;
const BEAM_CAPACITY = 56;

const ELEMENT_HEX: Record<ElementType, number> = {
  Physical: 0xfff4d4,
  Fire: 0xff7b29,
  Ice: 0x6ef0ff,
  Lightning: 0xffe85c,
  Poison: 0x76f562,
  Void: 0xc56cf0,
  Holy: 0xfff59e,
};

export class VfxPool {
  public readonly rootGroup = new THREE.Group();

  // ---- Cube Spark Pool ----
  private readonly cubeMesh: THREE.InstancedMesh;
  private readonly cubeGeo: THREE.BufferGeometry;
  private readonly cubeMat: THREE.ShaderMaterial;
  private readonly cPos = new Float32Array(CUBE_CAPACITY * 3);
  private readonly cVel = new Float32Array(CUBE_CAPACITY * 3);
  private readonly cColor = new Float32Array(CUBE_CAPACITY * 3);
  private readonly cLife = new Float32Array(CUBE_CAPACITY);
  private readonly cMaxLife = new Float32Array(CUBE_CAPACITY);
  private readonly cScale = new Float32Array(CUBE_CAPACITY);
  private readonly cGrav = new Float32Array(CUBE_CAPACITY);
  private readonly cRot = new Float32Array(CUBE_CAPACITY * 3);
  private cubeCursor = 0;

  // ---- Expanding Ring Pool ----
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly ringMat: THREE.ShaderMaterial;
  private readonly rPos = new Float32Array(RING_CAPACITY * 3);
  private readonly rColor = new Float32Array(RING_CAPACITY * 3);
  private readonly rLife = new Float32Array(RING_CAPACITY);
  private readonly rMaxLife = new Float32Array(RING_CAPACITY);
  private readonly rStartScale = new Float32Array(RING_CAPACITY);
  private readonly rEndScale = new Float32Array(RING_CAPACITY);
  private ringCursor = 0;

  // ---- Sky Pillar / Lightning / Beam Pool ----
  private readonly beamMesh: THREE.InstancedMesh;
  private readonly beamGeo: THREE.BufferGeometry;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly bPos = new Float32Array(BEAM_CAPACITY * 3);
  private readonly bColor = new Float32Array(BEAM_CAPACITY * 3);
  private readonly bLife = new Float32Array(BEAM_CAPACITY);
  private readonly bMaxLife = new Float32Array(BEAM_CAPACITY);
  private readonly bRadius = new Float32Array(BEAM_CAPACITY);
  private readonly bHeight = new Float32Array(BEAM_CAPACITY);
  private beamCursor = 0;

  // Continuous emitters timers
  private slideEmitAccum = 0;
  private grindEmitAccum = 0;
  private shrineEmitAccum = 0;
  private weaponTrailAccum = 0;
  private rngState = 0x51a7b3d1;

  // Pre-allocated scratch math objects (ZERO per-frame allocations!)
  private readonly _mat = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler();
  private readonly _scale = new THREE.Vector3();
  private readonly _col = new THREE.Color();

  constructor() {
    this.rootGroup.name = 'VfxPoolRoot';

    this.cubeGeo = new THREE.OctahedronGeometry(0.24, 0);
    this.cubeMat = createMkToonMaterial({
      color: 0xffffff,
      emissive: 0x333333,
      emissiveIntensity: 0.45,
      rimStrength: 0.4,
      rimColor: 0xffffff,
    });
    this.cubeMesh = new THREE.InstancedMesh(this.cubeGeo, this.cubeMat, CUBE_CAPACITY);
    this.cubeMesh.count = 0;
    this.cubeMesh.frustumCulled = false;

    this.ringGeo = new THREE.RingGeometry(0.72, 1.0, 18);
    this.ringGeo.rotateX(-Math.PI * 0.5);
    this.ringMat = createMkToonMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ringMesh = new THREE.InstancedMesh(this.ringGeo, this.ringMat, RING_CAPACITY);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;

    this.beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 7, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.beamMat = createMkToonMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.15,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beamMesh = new THREE.InstancedMesh(this.beamGeo, this.beamMat, BEAM_CAPACITY);
    this.beamMesh.count = 0;
    this.beamMesh.frustumCulled = false;

    const white = new THREE.Color(0xffffff);
    this.cubeMesh.setColorAt(0, white);
    this.ringMesh.setColorAt(0, white);
    this.beamMesh.setColorAt(0, white);

    this.rootGroup.add(this.cubeMesh, this.ringMesh, this.beamMesh);
  }

  private fastRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 4294967296;
  }

  public clear(): void {
    this.cLife.fill(0);
    this.rLife.fill(0);
    this.bLife.fill(0);
    this.cubeMesh.count = 0;
    this.ringMesh.count = 0;
    this.beamMesh.count = 0;
  }

  public spawnCube(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    hex: number, scale: number, lifeSec: number, gravity = -16.0,
  ): void {
    const i = this.cubeCursor;
    this.cubeCursor = (this.cubeCursor + 1) % CUBE_CAPACITY;
    const i3 = i * 3;
    this.cPos[i3] = x;
    this.cPos[i3 + 1] = y;
    this.cPos[i3 + 2] = z;
    this.cVel[i3] = vx;
    this.cVel[i3 + 1] = vy;
    this.cVel[i3 + 2] = vz;
    this._col.setHex(hex);
    this.cColor[i3] = this._col.r;
    this.cColor[i3 + 1] = this._col.g;
    this.cColor[i3 + 2] = this._col.b;
    this.cLife[i] = lifeSec;
    this.cMaxLife[i] = lifeSec;
    this.cScale[i] = scale;
    this.cGrav[i] = gravity;
    this.cRot[i3] = this.fastRand() * 6.28;
    this.cRot[i3 + 1] = this.fastRand() * 6.28;
    this.cRot[i3 + 2] = this.fastRand() * 6.28;
  }

  public spawnBurst(
    x: number, y: number, z: number,
    count: number, hex: number,
    speedMin: number, speedMax: number,
    scaleMin: number, scaleMax: number,
    lifeSec: number, gravity = -16.0,
  ): void {
    for (let k = 0; k < count; k++) {
      const a = this.fastRand() * Math.PI * 2;
      const spd = speedMin + this.fastRand() * (speedMax - speedMin);
      const vy = (0.35 + this.fastRand() * 0.95) * spd;
      const sc = scaleMin + this.fastRand() * (scaleMax - scaleMin);
      this.spawnCube(
        x + (this.fastRand() - 0.5) * 0.35,
        y + (this.fastRand() - 0.5) * 0.35,
        z + (this.fastRand() - 0.5) * 0.35,
        Math.cos(a) * spd,
        vy,
        Math.sin(a) * spd,
        hex,
        sc,
        lifeSec * (0.7 + this.fastRand() * 0.5),
        gravity,
      );
    }
  }

  public spawnRing(
    x: number, y: number, z: number,
    hex: number, startScale: number, endScale: number, lifeSec: number,
  ): void {
    const i = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % RING_CAPACITY;
    const i3 = i * 3;
    this.rPos[i3] = x;
    this.rPos[i3 + 1] = y;
    this.rPos[i3 + 2] = z;
    this._col.setHex(hex);
    this.rColor[i3] = this._col.r;
    this.rColor[i3 + 1] = this._col.g;
    this.rColor[i3 + 2] = this._col.b;
    this.rLife[i] = lifeSec;
    this.rMaxLife[i] = lifeSec;
    this.rStartScale[i] = startScale;
    this.rEndScale[i] = endScale;
  }

  public spawnBeam(
    x: number, y: number, z: number,
    hex: number, radius: number, height: number, lifeSec: number,
  ): void {
    const i = this.beamCursor;
    this.beamCursor = (this.beamCursor + 1) % BEAM_CAPACITY;
    const i3 = i * 3;
    this.bPos[i3] = x;
    this.bPos[i3 + 1] = y;
    this.bPos[i3 + 2] = z;
    this._col.setHex(hex);
    this.bColor[i3] = this._col.r;
    this.bColor[i3 + 1] = this._col.g;
    this.bColor[i3 + 2] = this._col.b;
    this.bLife[i] = lifeSec;
    this.bMaxLife[i] = lifeSec;
    this.bRadius[i] = radius;
    this.bHeight[i] = height;
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      switch (ev.type) {
        case 'player_jump':
          this.spawnBurst(ev.pos.x, ev.pos.y + 0.1, ev.pos.z, ev.isBhop ? 10 : 5, ev.isBhop ? 0xffd84d : 0xd8f5e0, 2.5, 6.5, 0.55, 1.0, 0.34, -10);
          if (ev.isBhop) this.spawnRing(ev.pos.x, ev.pos.y + 0.14, ev.pos.z, 0xffd23f, 0.6, 2.8, 0.32);
          break;

        case 'player_land':
          if (ev.impactSpeed > 7) {
            this.spawnBurst(ev.pos.x, ev.pos.y + 0.1, ev.pos.z, 7, 0xc7e3c1, 2.0, 5.5, 0.5, 0.95, 0.3, -12);
            this.spawnRing(ev.pos.x, ev.pos.y + 0.12, ev.pos.z, 0xe8f5e4, 0.5, 2.0, 0.25);
          }
          break;

        case 'player_jump_pad':
          this.spawnRing(ev.pos.x, ev.pos.y + 0.25, ev.pos.z, 0x4df5ff, 0.8, 4.4, 0.42);
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0x5cf7ff, 1.15, 7.5, 0.34);
          this.spawnBurst(ev.pos.x, ev.pos.y + 0.3, ev.pos.z, 14, 0x62f5ff, 3.0, 9.0, 0.6, 1.15, 0.45, -4);
          break;

        case 'player_wall_climb':
          this.spawnBurst(ev.pos.x, ev.pos.y + 1.0, ev.pos.z, 8, 0xa8e0ff, 2.5, 6.0, 0.5, 0.95, 0.3, -10);
          break;

        case 'player_rail_attach':
          this.spawnRing(ev.pos.x, ev.pos.y + 0.2, ev.pos.z, 0x4df5ff, 0.4, 2.2, 0.28);
          this.spawnBurst(ev.pos.x, ev.pos.y + 0.2, ev.pos.z, 10, 0xffd23f, 3.0, 7.5, 0.45, 0.85, 0.32, -14);
          break;

        case 'weapon_fire': {
          const wid = ev.weaponId.toLowerCase();
          if (wid.includes('dragon')) {
            // Dragon's Breath fiery cel cone burst!
            for (let k = 0; k < 8; k++) {
              const spread = (this.fastRand() - 0.5) * 0.55;
              const spd = 10 + this.fastRand() * 10;
              const cosS = Math.cos(spread);
              const sinS = Math.sin(spread);
              const vx = (ev.dir.x * cosS - ev.dir.z * sinS) * spd;
              const vz = (ev.dir.x * sinS + ev.dir.z * cosS) * spd;
              this.spawnCube(ev.pos.x, ev.pos.y, ev.pos.z, vx, (this.fastRand() - 0.3) * 3.0, vz, k % 2 === 0 ? 0xff621f : 0xffe45e, 0.85, 0.28, -2);
            }
          } else if (wid.includes('shotgun')) {
            this.spawnBurst(ev.pos.x + ev.dir.x * 1.2, ev.pos.y, ev.pos.z + ev.dir.z * 1.2, 8, 0xffcf4d, 4.0, 10.0, 0.45, 0.8, 0.22, -8);
          } else if (wid.includes('frost')) {
            this.spawnRing(ev.pos.x, ev.pos.y + 0.2, ev.pos.z, 0x70f5ff, 0.8, 5.2, 0.38);
            this.spawnBurst(ev.pos.x, ev.pos.y + 0.6, ev.pos.z, 10, 0xa6f7ff, 3.0, 8.0, 0.5, 0.95, 0.35, -6);
          } else if (wid.includes('aegis')) {
            this.spawnRing(ev.pos.x, ev.pos.y + 0.5, ev.pos.z, 0xffe45e, 1.0, 4.8, 0.35);
          } else if (wid.includes('katana') || wid.includes('scythe')) {
            this.spawnBurst(ev.pos.x + ev.dir.x * 1.8, ev.pos.y, ev.pos.z + ev.dir.z * 1.8, 6, wid.includes('scythe') ? 0x4dff9e : 0x5cf7ff, 3.0, 7.5, 0.4, 0.75, 0.24, -6);
          }
          break;
        }

        case 'damage_dealt': {
          const baseHex = ELEMENT_HEX[ev.element] ?? 0xfff4d4;
          if (ev.isBonker) {
            this.spawnRing(ev.pos.x, ev.pos.y + 0.9, ev.pos.z, 0xff2ec4, 0.6, 5.8, 0.48);
            this.spawnRing(ev.pos.x, ev.pos.y + 0.95, ev.pos.z, 0xffd84d, 0.4, 4.2, 0.38);
            this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0xff2ec4, 1.4, 14.0, 0.32);
            this.spawnBurst(ev.pos.x, ev.pos.y + 1.1, ev.pos.z, 22, 0xffd84d, 5.0, 14.0, 0.9, 1.8, 0.58, -14);
          } else if (ev.isMegacrit) {
            this.spawnRing(ev.pos.x, ev.pos.y + 0.8, ev.pos.z, 0xff5722, 0.5, 3.8, 0.36);
            this.spawnBurst(ev.pos.x, ev.pos.y + 1.0, ev.pos.z, 12, 0xffb703, 4.0, 10.5, 0.75, 1.35, 0.44, -14);
          } else if (ev.critTier >= 1) {
            this.spawnBurst(ev.pos.x, ev.pos.y + 0.9, ev.pos.z, 6, 0xffd84d, 3.0, 7.5, 0.6, 1.1, 0.34, -14);
          } else {
            this.spawnBurst(ev.pos.x, ev.pos.y + 0.9, ev.pos.z, 3, baseHex, 2.2, 5.5, 0.45, 0.85, 0.26, -15);
          }
          if (ev.weaponId) {
            const wid = ev.weaponId.toLowerCase();
            if (wid.includes('lightning')) {
              this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0x6ef7ff, 0.48, 18.0, 0.22);
              this.spawnRing(ev.pos.x, ev.pos.y + 0.2, ev.pos.z, 0x80faff, 0.3, 2.4, 0.24);
            } else if (wid.includes('fire') || wid.includes('rocket') || wid.includes('mine')) {
              this.spawnRing(ev.pos.x, ev.pos.y + 0.4, ev.pos.z, 0xff621f, 0.5, 3.2, 0.3);
            } else if (wid.includes('poison')) {
              this.spawnRing(ev.pos.x, ev.pos.y + 0.25, ev.pos.z, 0x6eff57, 0.4, 2.5, 0.32);
            } else if (wid.includes('blood')) {
              this.spawnBurst(ev.pos.x, ev.pos.y + 1.0, ev.pos.z, 5, 0xff2644, 2.0, 6.0, 0.5, 0.85, 0.34, -4);
            } else if (wid.includes('noodle')) {
              this.spawnBurst(ev.pos.x, ev.pos.y + 1.0, ev.pos.z, 5, 0xff5cf4, 2.5, 7.0, 0.45, 0.8, 0.26, -6);
            }
          }
          break;
        }

        case 'enemy_kill': {
          const isBoss = ev.role === 'stage_boss' || ev.role === 'miniboss' || ev.role === 'final_boss' || ev.role === 'crypt_boss';
          const burstHex = ev.isExecute ? 0xff2e54 : isBoss ? 0xffd23f : 0xff9f43;
          this.spawnBurst(
            ev.pos.x, ev.pos.y + 1.0, ev.pos.z,
            isBoss ? 28 : 9, burstHex,
            isBoss ? 5.0 : 3.0, isBoss ? 14.0 : 8.0,
            isBoss ? 1.0 : 0.6, isBoss ? 2.0 : 1.25,
            isBoss ? 0.72 : 0.42, -16,
          );
          this.spawnRing(ev.pos.x, ev.pos.y + 0.3, ev.pos.z, burstHex, 0.5, isBoss ? 8.5 : 2.3, isBoss ? 0.65 : 0.3);
          break;
        }

        case 'player_level_up':
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0x38f2ff, 2.1, 28.0, 0.85);
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0xffe45e, 1.15, 32.0, 0.72);
          this.spawnRing(ev.pos.x, ev.pos.y + 0.2, ev.pos.z, 0x38f2ff, 0.8, 7.5, 0.65);
          this.spawnRing(ev.pos.x, ev.pos.y + 0.3, ev.pos.z, 0xffd84d, 0.5, 5.2, 0.52);
          this.spawnBurst(ev.pos.x, ev.pos.y + 1.2, ev.pos.z, 20, 0xffe45e, 3.5, 10.0, 0.65, 1.25, 0.68, -4);
          break;

        case 'pickup_collected': {
          const hex =
            ev.kind === 'gold' ? 0xffd23f : ev.kind === 'health' ? 0x4dff77 : ev.kind === 'nuke' ? 0xff4d2e : 0x52f2ff;
          this.spawnBurst(ev.pos.x, ev.pos.y + 0.8, ev.pos.z, 4, hex, 1.8, 4.5, 0.4, 0.75, 0.28, -4);
          if (ev.kind === 'nuke') {
            this.spawnRing(ev.pos.x, ev.pos.y + 0.4, ev.pos.z, 0xff621f, 1.0, 22.0, 0.75);
          }
          break;
        }

        case 'interactable_used':
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0xffd84d, 1.4, 16.0, 0.62);
          this.spawnRing(ev.pos.x, ev.pos.y + 0.25, ev.pos.z, 0x4df5ff, 0.8, 5.4, 0.52);
          this.spawnBurst(ev.pos.x, ev.pos.y + 1.4, ev.pos.z, 16, 0xffe45e, 3.5, 9.0, 0.65, 1.2, 0.56, -6);
          break;

        case 'pylon_charged':
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0x4dff9e, 1.85, 28.0, 0.82);
          this.spawnRing(ev.pos.x, ev.pos.y + 0.3, ev.pos.z, 0x4dff9e, 1.0, 8.5, 0.65);
          this.spawnBurst(ev.pos.x, ev.pos.y + 2.0, ev.pos.z, 22, 0xffe45e, 4.0, 12.0, 0.75, 1.4, 0.65, -5);
          break;

        case 'boss_spawn':
        case 'final_swarm_start':
          this.spawnBeam(ev.pos.x, ev.pos.y, ev.pos.z, 0xff2644, 3.2, 38.0, 1.15);
          this.spawnRing(ev.pos.x, ev.pos.y + 0.35, ev.pos.z, 0xff2644, 1.0, 14.0, 0.9);
          this.spawnBurst(ev.pos.x, ev.pos.y + 2.0, ev.pos.z, 26, 0xff385c, 5.0, 14.0, 1.0, 2.0, 0.8, -8);
          break;

        case 'player_hurt':
          this.spawnBurst(ev.pos.x, ev.pos.y + 1.2, ev.pos.z, 10, 0xff3b5c, 3.0, 8.0, 0.55, 1.05, 0.36, -12);
          break;

        default:
          break;
      }
    }
  }

  /**
   * Emits continuous kinetic trail VFX, weapon area/rocket trails, pylon motes & lamp fireflies!
   */
  public emitContinuous(state: Readonly<SimState>, dtSec: number): void {
    const p: PlayerState = state.player;
    const hSpeed = Math.hypot(p.vel.x, p.vel.z);

    // 1. Slide dust & golden speed spark trail
    if (p.isSliding && hSpeed > 5.0) {
      this.slideEmitAccum += dtSec * (hSpeed > 15 ? 48 : 26);
      while (this.slideEmitAccum >= 1) {
        this.slideEmitAccum -= 1;
        const isFast = hSpeed > 14;
        const dustCol = state.mapId === 'Desert' ? 0xffe09c : state.mapId === 'Graveyard' ? 0xb8a3e6 : 0xd8f0cf;
        this.spawnCube(
          p.pos.x + (this.fastRand() - 0.5) * 0.65,
          p.pos.y + 0.18,
          p.pos.z + (this.fastRand() - 0.5) * 0.65,
          -p.vel.x * 0.22 + (this.fastRand() - 0.5) * 2.4,
          1.4 + this.fastRand() * 2.2,
          -p.vel.z * 0.22 + (this.fastRand() - 0.5) * 2.4,
          isFast && this.fastRand() > 0.4 ? 0xffd84d : dustCol,
          isFast ? 0.68 : 0.55,
          0.34,
          -8.0,
        );
      }
    } else {
      this.slideEmitAccum = 0;
    }

    // 2. Rail grind spark shower
    if (p.railId !== null) {
      this.grindEmitAccum += dtSec * 65;
      while (this.grindEmitAccum >= 1) {
        this.grindEmitAccum -= 1;
        this.spawnCube(
          p.pos.x + (this.fastRand() - 0.5) * 0.3,
          p.pos.y + 0.12,
          p.pos.z + (this.fastRand() - 0.5) * 0.3,
          -p.vel.x * 0.35 + (this.fastRand() - 0.5) * 4.5,
          2.2 + this.fastRand() * 3.8,
          -p.vel.z * 0.35 + (this.fastRand() - 0.5) * 4.5,
          this.fastRand() > 0.45 ? 0xffe45e : 0x5cf7ff,
          0.52,
          0.3,
          -14.0,
        );
      }
    } else {
      this.grindEmitAccum = 0;
    }

    // 3. Weapon trails & active AreaEffect ambient particles (Rockets smoke, FlameWalker, PoisonFlask, BlackHole, Tornado)
    this.weaponTrailAccum += dtSec;
    if (this.weaponTrailAccum >= 0.045) {
      this.weaponTrailAccum = 0;

      // Homing Rocket smoky exhaust streaks!
      const projs = state.projectiles;
      for (let i = 0; i < projs.length; i++) {
        const pr = projs[i]!;
        if (pr.weaponId === 'WeaponSluttyRocket' || pr.weaponId === 'Rockets' || pr.weaponId.indexOf('Rocket') >= 0) {
          this.spawnCube(
            pr.pos.x + (this.fastRand() - 0.5) * 0.2,
            pr.pos.y + (this.fastRand() - 0.5) * 0.2,
            pr.pos.z + (this.fastRand() - 0.5) * 0.2,
            -pr.vel.x * 0.08 + (this.fastRand() - 0.5) * 1.2,
            0.8 + this.fastRand() * 1.2,
            -pr.vel.z * 0.08 + (this.fastRand() - 0.5) * 1.2,
            this.fastRand() > 0.35 ? 0xdbe4ee : 0xff8b1f,
            0.72,
            0.34,
            1.5,
          );
        }
      }

      // Active AreaEffect bubbling/swirling particles
      const areas = state.areaEffects;
      for (let i = 0; i < areas.length; i++) {
        const ae = areas[i]!;
        if (ae.kind === 'pool') {
          const a = this.fastRand() * Math.PI * 2;
          const r = this.fastRand() * ae.radius * 0.85;
          const isFire = ae.element === 'Fire';
          const isIce = ae.element === 'Ice';
          this.spawnCube(
            ae.pos.x + Math.cos(a) * r,
            ae.pos.y + 0.25,
            ae.pos.z + Math.sin(a) * r,
            (this.fastRand() - 0.5) * 0.8,
            isFire ? 3.5 + this.fastRand() * 2.5 : 1.8 + this.fastRand() * 1.5,
            (this.fastRand() - 0.5) * 0.8,
            isFire ? (this.fastRand() > 0.4 ? 0xff621f : 0xffe45e) : isIce ? 0x80faff : 0x6eff57,
            isFire ? 0.6 : 0.48,
            0.42,
            0,
          );
        } else if (ae.kind === 'blackhole') {
          const a = this.fastRand() * Math.PI * 2;
          const r = ae.radius * (0.55 + this.fastRand() * 0.45);
          const sx = ae.pos.x + Math.cos(a) * r;
          const sz = ae.pos.z + Math.sin(a) * r;
          this.spawnCube(
            sx,
            ae.pos.y + 0.6 + this.fastRand() * 2.0,
            sz,
            -Math.cos(a) * r * 2.4,
            (ae.pos.y + 1.4 - (ae.pos.y + 0.6)) * 1.5,
            -Math.sin(a) * r * 2.4,
            this.fastRand() > 0.4 ? 0xc05eff : 0x2e1065,
            0.55,
            0.35,
            0,
          );
        } else if (ae.kind === 'tornado') {
          const a = this.fastRand() * Math.PI * 2;
          const r = ae.radius * (0.35 + this.fastRand() * 0.55);
          this.spawnCube(
            ae.pos.x + Math.cos(a) * r,
            ae.pos.y + this.fastRand() * 4.5,
            ae.pos.z + Math.sin(a) * r,
            -Math.sin(a) * 6.0,
            4.0 + this.fastRand() * 3.0,
            Math.cos(a) * 6.0,
            0xcffafe,
            0.48,
            0.45,
            0,
          );
        }
      }
    }

    // 4. Charging Shrines, Active Boss Pylons & Lit Darkness Lamps motes!
    this.shrineEmitAccum += dtSec;
    if (this.shrineEmitAccum >= 0.08) {
      this.shrineEmitAccum = 0;

      const list = state.interactables;
      for (let i = 0; i < list.length; i++) {
        const it = list[i]!;
        if (it.kind === 'ChargeShrine' && !it.used && it.chargeProgress > 0.01) {
          const a = this.fastRand() * Math.PI * 2;
          const r = it.radius * (0.4 + this.fastRand() * 0.55);
          this.spawnCube(
            it.pos.x + Math.cos(a) * r, it.pos.y + 0.2, it.pos.z + Math.sin(a) * r,
            0, 3.2 + this.fastRand() * 2.5, 0,
            it.variant === 'golden' ? 0xffe45e : 0x4df5ff, 0.55, 0.65, 0,
          );
        }
      }

      const pylons = state.pylons;
      for (let i = 0; i < pylons.length; i++) {
        const py = pylons[i]!;
        if (py.active && !py.cleansed && (py.chargeProgress > 0.01 || py.stolenWeaponId !== null)) {
          const a = this.fastRand() * Math.PI * 2;
          const r = py.radius * (0.3 + this.fastRand() * 0.6);
          this.spawnCube(
            py.pos.x + Math.cos(a) * r, py.pos.y + 0.3, py.pos.z + Math.sin(a) * r,
            0, 4.2 + this.fastRand() * 2.5, 0,
            py.stolenWeaponId ? 0xffe45e : 0xff2ec4, 0.6, 0.62, 0,
          );
        }
      }

      const lamps = state.darknessLamps;
      for (let i = 0; i < lamps.length; i++) {
        const lamp = lamps[i]!;
        if (lamp.lit || lamp.chargeProgress > 0.01) {
          const a = this.fastRand() * Math.PI * 2;
          const r = lamp.radius * (0.2 + this.fastRand() * 0.65);
          this.spawnCube(
            lamp.pos.x + Math.cos(a) * r, lamp.pos.y + 0.6 + this.fastRand() * 2.0, lamp.pos.z + Math.sin(a) * r,
            (this.fastRand() - 0.5) * 1.2, 1.4 + this.fastRand() * 1.6, (this.fastRand() - 0.5) * 1.2,
            0xffe45e, 0.45, 0.72, 0,
          );
        }
      }
    }
  }

  public update(dtSec: number): void {
    const dt = Math.min(0.05, Math.max(0, dtSec));

    let activeCubes = 0;
    for (let i = 0; i < CUBE_CAPACITY; i++) {
      const life = this.cLife[i]!;
      if (life <= 0) continue;
      const nextLife = life - dt;
      this.cLife[i] = nextLife;
      if (nextLife <= 0) continue;

      const i3 = i * 3;
      this.cVel[i3 + 1] = this.cVel[i3 + 1]! + this.cGrav[i]! * dt;
      const px = (this.cPos[i3] = this.cPos[i3]! + this.cVel[i3]! * dt);
      const py = (this.cPos[i3 + 1] = this.cPos[i3 + 1]! + this.cVel[i3 + 1]! * dt);
      const pz = (this.cPos[i3 + 2] = this.cPos[i3 + 2]! + this.cVel[i3 + 2]! * dt);

      const rx = (this.cRot[i3] = this.cRot[i3]! + 6.5 * dt);
      const ry = (this.cRot[i3 + 1] = this.cRot[i3 + 1]! + 5.2 * dt);
      const rz = (this.cRot[i3 + 2] = this.cRot[i3 + 2]! + 4.1 * dt);

      const t = nextLife / Math.max(0.001, this.cMaxLife[i]!);
      const sc = this.cScale[i]! * Math.min(1, t * 2.2);

      this._pos.set(px, py, pz);
      this._euler.set(rx, ry, rz);
      this._quat.setFromEuler(this._euler);
      this._scale.setScalar(sc);
      this._mat.compose(this._pos, this._quat, this._scale);
      this.cubeMesh.setMatrixAt(activeCubes, this._mat);

      this._col.setRGB(this.cColor[i3]!, this.cColor[i3 + 1]!, this.cColor[i3 + 2]!);
      this.cubeMesh.setColorAt(activeCubes, this._col);
      activeCubes++;
    }
    this.cubeMesh.count = activeCubes;
    if (activeCubes > 0) {
      this.cubeMesh.instanceMatrix.needsUpdate = true;
      if (this.cubeMesh.instanceColor) this.cubeMesh.instanceColor.needsUpdate = true;
    }

    let activeRings = 0;
    this._quat.identity();
    for (let i = 0; i < RING_CAPACITY; i++) {
      const life = this.rLife[i]!;
      if (life <= 0) continue;
      const nextLife = life - dt;
      this.rLife[i] = nextLife;
      if (nextLife <= 0) continue;

      const i3 = i * 3;
      const frac = 1 - nextLife / Math.max(0.001, this.rMaxLife[i]!);
      const eased = 1 - (1 - frac) * (1 - frac);
      const sc = this.rStartScale[i]! + (this.rEndScale[i]! - this.rStartScale[i]!) * eased;

      this._pos.set(this.rPos[i3]!, this.rPos[i3 + 1]!, this.rPos[i3 + 2]!);
      this._scale.set(sc, 1, sc);
      this._mat.compose(this._pos, this._quat, this._scale);
      this.ringMesh.setMatrixAt(activeRings, this._mat);

      const fade = Math.max(0, 1 - frac);
      this._col.setRGB(this.rColor[i3]! * fade, this.rColor[i3 + 1]! * fade, this.rColor[i3 + 2]! * fade);
      this.ringMesh.setColorAt(activeRings, this._col);
      activeRings++;
    }
    this.ringMesh.count = activeRings;
    if (activeRings > 0) {
      this.ringMesh.instanceMatrix.needsUpdate = true;
      if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    }

    let activeBeams = 0;
    for (let i = 0; i < BEAM_CAPACITY; i++) {
      const life = this.bLife[i]!;
      if (life <= 0) continue;
      const nextLife = life - dt;
      this.bLife[i] = nextLife;
      if (nextLife <= 0) continue;

      const i3 = i * 3;
      const remain = nextLife / Math.max(0.001, this.bMaxLife[i]!);
      const rad = this.bRadius[i]! * remain;

      this._pos.set(this.bPos[i3]!, this.bPos[i3 + 1]!, this.bPos[i3 + 2]!);
      this._scale.set(rad, this.bHeight[i]!, rad);
      this._mat.compose(this._pos, this._quat, this._scale);
      this.beamMesh.setMatrixAt(activeBeams, this._mat);

      this._col.setRGB(this.bColor[i3]!, this.bColor[i3 + 1]!, this.bColor[i3 + 2]!);
      this.beamMesh.setColorAt(activeBeams, this._col);
      activeBeams++;
    }
    this.beamMesh.count = activeBeams;
    if (activeBeams > 0) {
      this.beamMesh.instanceMatrix.needsUpdate = true;
      if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.cubeGeo.dispose();
    this.cubeMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.beamGeo.dispose();
    this.beamMat.dispose();
  }
}
