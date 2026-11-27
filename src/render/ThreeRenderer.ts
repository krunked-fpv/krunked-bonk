/**
 * KRUNKEDBONK — Main Three.js MK-Toon Stylized Low-Poly 3D Renderer (Implements IRenderer)
 *
 * Orchestrates the complete Wave 1 visual pipeline:
 * - Exact StageForest1 lighting: FogExp2 (0.00, 0.48, 0.62) @ 0.0070, turquoise-azure
 *   sky dome, warm directional sun (1.00, 0.96, 0.84), ambient (0.75, 0.75, 0.75)
 * - Smooth 3rd-person orbit camera (z=11.0, terrain spring-arm pull-in) + 1st-person toggle
 * - Dynamic speed FOV boost (+0..12 deg on slide/bhop/grind) & MilkShake impact recoil
 * - Full RenderSettings support (fov, cameraMode, classic50HzSnap, outlineEnabled, celBands,
 *   grassQuality, damageNumbersEnabled, screenShakeIntensity, minimapVisible, pixelScale)
 * - ZERO per-frame allocations in render() hot path!
 */

import * as THREE from 'three';
import {
  CAMERA_1ST_EYE_HEIGHT,
  CAMERA_3RD_OFFSET_Y,
  CAMERA_3RD_OFFSET_Z,
  DEFAULT_RENDER_SETTINGS,
  FOV_MAX,
  FOV_MIN,
  type DebugPerfMetrics,
  type IAssetPack,
  type IRenderer,
  type ITerrainSampler,
  type MapId,
  type MapTier,
  type RenderSettings,
  type SimEvent,
  type SimState,
} from '../contracts/index';
import { AssetRegistry } from '../assets/AssetRegistry';
import { disposePixelLabelCache } from '../assets/PixelBitmapFont';
import {
  createSkyDomeMaterial,
  setGlobalToonLighting,
  setGlobalToonSettings,
  setGlobalToonTime,
} from './toonShader';
import { TerrainMeshBuilder } from './TerrainMeshBuilder';
import { EntityInstancer } from './EntityInstancer';
import { VfxPool } from './VfxPool';
import { FloatingTextLayer } from './FloatingTextLayer';
import { MinimapRenderer } from './MinimapRenderer';

interface StageLightingPreset {
  fogR: number;
  fogG: number;
  fogB: number;
  fogDensity: number;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  sunDir: [number, number, number];
  sunR: number;
  sunG: number;
  sunB: number;
  ambientR: number;
  ambientG: number;
  ambientB: number;
  shadowR: number;
  shadowG: number;
  shadowB: number;
  highlightR: number;
  highlightG: number;
  highlightB: number;
}

function getStageLightingPreset(mapId: MapId, tier: MapTier): StageLightingPreset {
  if (mapId === 'Desert') {
    return {
      fogR: 0.86,
      fogG: 0.64,
      fogB: 0.42,
      fogDensity: 0.0058,
      skyTop: 0x2b82d9,
      skyMid: 0x70bde6,
      skyHorizon: 0xf0be78,
      sunDir: [0.55, 0.78, 0.28],
      sunR: 1.0,
      sunG: 0.94,
      sunB: 0.78,
      ambientR: 0.82,
      ambientG: 0.74,
      ambientB: 0.66,
      shadowR: 0.42,
      shadowG: 0.28,
      shadowB: 0.46,
      highlightR: 1.0,
      highlightG: 0.96,
      highlightB: 0.82,
    };
  }
  if (mapId === 'Graveyard') {
    return {
      fogR: 0.11,
      fogG: 0.16,
      fogB: 0.26,
      fogDensity: 0.0095,
      skyTop: 0x0b1021,
      skyMid: 0x1b2847,
      skyHorizon: 0x1d2e45,
      sunDir: [-0.35, 0.85, 0.4],
      sunR: 0.78,
      sunG: 0.88,
      sunB: 1.0,
      ambientR: 0.56,
      ambientG: 0.62,
      ambientB: 0.74,
      shadowR: 0.16,
      shadowG: 0.18,
      shadowB: 0.34,
      highlightR: 0.85,
      highlightG: 0.95,
      highlightB: 1.0,
    };
  }
  if (mapId === 'FinalBossMap') {
    return {
      fogR: 0.16,
      fogG: 0.07,
      fogB: 0.24,
      fogDensity: 0.0082,
      skyTop: 0x0e0617,
      skyMid: 0x2d1145,
      skyHorizon: 0x4a165e,
      sunDir: [0.25, 0.9, -0.35],
      sunR: 1.0,
      sunG: 0.78,
      sunB: 0.96,
      ambientR: 0.64,
      ambientG: 0.54,
      ambientB: 0.72,
      shadowR: 0.18,
      shadowG: 0.11,
      shadowB: 0.3,
      highlightR: 1.0,
      highlightG: 0.86,
      highlightB: 0.98,
    };
  }

  // Forest Tier 2 (golden sunset) & Tier 3 (mystic emerald twilight)
  if (tier === 2) {
    return {
      fogR: 0.76,
      fogG: 0.44,
      fogB: 0.34,
      fogDensity: 0.0066,
      skyTop: 0x24569e,
      skyMid: 0xd97d54,
      skyHorizon: 0xf2a95c,
      sunDir: [0.72, 0.48, 0.5],
      sunR: 1.0,
      sunG: 0.86,
      sunB: 0.68,
      ambientR: 0.78,
      ambientG: 0.7,
      ambientB: 0.68,
      shadowR: 0.28,
      shadowG: 0.24,
      shadowB: 0.48,
      highlightR: 1.0,
      highlightG: 0.92,
      highlightB: 0.76,
    };
  }
  if (tier === 3) {
    return {
      fogR: 0.05,
      fogG: 0.28,
      fogB: 0.46,
      fogDensity: 0.0078,
      skyTop: 0x0d224f,
      skyMid: 0x16527a,
      skyHorizon: 0x0f4d6e,
      sunDir: [-0.45, 0.78, 0.42],
      sunR: 0.85,
      sunG: 0.94,
      sunB: 1.0,
      ambientR: 0.65,
      ambientG: 0.72,
      ambientB: 0.8,
      shadowR: 0.16,
      shadowG: 0.22,
      shadowB: 0.44,
      highlightR: 0.9,
      highlightG: 0.98,
      highlightB: 1.0,
    };
  }

  // EXACT StageForest1 Lighting:
  // FogExp2 (0.00, 0.48, 0.62) @ 0.0070, Sun (1.00, 0.96, 0.84), Ambient (0.75, 0.75, 0.75)
  return {
    fogR: 0.0,
    fogG: 0.48,
    fogB: 0.62,
    fogDensity: 0.007,
    skyTop: 0x147ae0,
    skyMid: 0x24afd9,
    skyHorizon: 0x007a9e,
    sunDir: [0.46, 0.82, 0.34],
    sunR: 1.0,
    sunG: 0.96,
    sunB: 0.84,
    ambientR: 0.75,
    ambientG: 0.75,
    ambientB: 0.75,
    shadowR: 0.22,
    shadowG: 0.31,
    shadowB: 0.56,
    highlightR: 1.0,
    highlightG: 0.96,
    highlightB: 0.84,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class ThreeRenderer implements IRenderer {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly fog: THREE.FogExp2;

  private readonly skyDomeGeo: THREE.SphereGeometry;
  private readonly skyDomeMat: THREE.ShaderMaterial;
  private readonly skyDome: THREE.Mesh;

  private readonly assets: AssetRegistry;
  private readonly unsubscribeAssets: () => void;
  private readonly terrainBuilder: TerrainMeshBuilder;
  private readonly entityInstancer: EntityInstancer;
  private readonly vfxPool: VfxPool;
  private readonly floatingText: FloatingTextLayer;
  private readonly minimap: MinimapRenderer;

  private settings: RenderSettings = {
    ...DEFAULT_RENDER_SETTINGS,
    gamepad: { ...DEFAULT_RENDER_SETTINGS.gamepad },
  };
  private currentTerrain: ITerrainSampler | null = null;
  private baseFogDensity = 0.007;

  // Frame timing & camera state
  private lastRenderMs = 0;
  private elapsedTimeSec = 0;
  private smoothedFps = 60;
  private lastFrameMs = 16.67;
  private currentFov = DEFAULT_RENDER_SETTINGS.fov;
  private currentCamDist = CAMERA_3RD_OFFSET_Z;
  private shakeTrauma = 0;
  private lastInterpAlpha = 1;
  private lastEnemyCount = 0;
  private lastProjectileCount = 0;
  private lastViewportW = 1280;
  private lastViewportH = 720;
  private lastDpr = 1;

  // Pre-allocated scratch math objects (ZERO per-frame allocations in render()!)
  private readonly _targetPos = new THREE.Vector3();
  private readonly _camOffset = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.assets = new AssetRegistry();

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(new THREE.Color(0.0, 0.48, 0.62), 0.007);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0.0, 0.48, 0.62);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.15, 420);

    // Stylized gradient Sky Dome
    this.skyDomeGeo = new THREE.SphereGeometry(280, 24, 16);
    this.skyDomeMat = createSkyDomeMaterial(0x147ae0, 0x24afd9, 0x007a9e);
    this.skyDome = new THREE.Mesh(this.skyDomeGeo, this.skyDomeMat);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -100;
    this.scene.add(this.skyDome);

    // Subsystems
    this.terrainBuilder = new TerrainMeshBuilder(this.assets);
    this.entityInstancer = new EntityInstancer(this.assets);
    this.vfxPool = new VfxPool();
    this.floatingText = new FloatingTextLayer();
    this.minimap = new MinimapRenderer();

    this.scene.add(
      this.terrainBuilder.rootGroup,
      this.entityInstancer.rootGroup,
      this.vfxPool.rootGroup,
    );

    this.unsubscribeAssets = this.assets.onChange(() => {
      this.terrainBuilder.refreshTextures();
      this.entityInstancer.refreshTextures();
    });

    this.applyStageLighting('Forest', 1);
    this.applyToonSettings();
  }

  public getAssetRegistry(): AssetRegistry {
    return this.assets;
  }

  public toggleFullMap(): boolean {
    return this.minimap.toggleFullMap();
  }

  public setFullMapOpen(open: boolean): void {
    this.minimap.setFullMapOpen(open);
  }

  public isFullMapOpen(): boolean {
    return this.minimap.isFullMapOpen();
  }

  // ---- IRenderer Implementation ----

  public mount(container: unknown, settings: RenderSettings): void {
    this.setSettings(settings);
    if (typeof document === 'undefined' || !container || typeof (container as HTMLElement).appendChild !== 'function') {
      return;
    }

    const host = container as HTMLElement;
    this.container = host;
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    if (!this.renderer) {
      try {
        const gl = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        });
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
        gl.domElement.style.display = 'block';
        gl.domElement.style.width = '100%';
        gl.domElement.style.height = '100%';
        gl.domElement.style.position = 'absolute';
        gl.domElement.style.inset = '0';
        gl.domElement.style.zIndex = '1';
        this.renderer = gl;
      } catch {
        this.renderer = null;
      }
    }

    if (this.renderer && this.renderer.domElement.parentElement !== host) {
      host.appendChild(this.renderer.domElement);
    }

    this.floatingText.mount(host);
    this.minimap.mount(host);

    const rect = host.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = rect.height > 0 ? rect.height : typeof window !== 'undefined' ? window.innerHeight : 720;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.resize(w, h, dpr);
  }

  public unmount(): void {
    this.unsubscribeAssets();
    this.floatingText.unmount();
    this.minimap.unmount();
    if (this.renderer) {
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
    this.terrainBuilder.dispose();
    this.entityInstancer.dispose();
    this.vfxPool.dispose();
    this.assets.dispose();
    this.skyDomeGeo.dispose();
    this.skyDomeMat.dispose();
    disposePixelLabelCache();
    this.container = null;
  }

  public resize(width: number, height: number, devicePixelRatio = 1): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const dpr = Math.min(2, Math.max(1, devicePixelRatio));
    this.lastViewportW = w;
    this.lastViewportH = h;
    this.lastDpr = dpr;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      const pixelScale = Math.max(0.5, Math.min(1.5, this.settings.pixelScale || 1.0));
      this.renderer.setPixelRatio(Math.min(2, dpr * pixelScale));
      this.renderer.setSize(w, h, false);
    }

    this.floatingText.resize(w, h, dpr);
    this.minimap.resize(w, h, dpr);
  }

  public setSettings(settings: RenderSettings): void {
    const prevPixelScale = this.settings.pixelScale;
    const prevGrass = this.settings.grassQuality;

    this.settings = {
      ...settings,
      fov: Math.max(FOV_MIN, Math.min(FOV_MAX, settings.fov)),
      gamepad: { ...settings.gamepad },
    };

    this.applyToonSettings();
    this.floatingText.setEnabled(this.settings.damageNumbersEnabled);
    this.minimap.setVisible(this.settings.minimapVisible);

    if (prevGrass !== this.settings.grassQuality) {
      this.terrainBuilder.setGrassQuality(this.settings.grassQuality);
    }
    if (prevPixelScale !== this.settings.pixelScale && this.renderer) {
      this.resize(this.lastViewportW, this.lastViewportH, this.lastDpr);
    }
  }

  public getSettings(): RenderSettings {
    return {
      ...this.settings,
      gamepad: { ...this.settings.gamepad },
    };
  }

  public setAssetPack(pack: IAssetPack | null): void {
    this.assets.setCustomPack(pack);
  }

  public loadMapVisuals(
    mapId: MapId,
    mapTier: MapTier,
    seed: number,
    terrain: ITerrainSampler,
  ): void {
    this.currentTerrain = terrain;
    this.applyStageLighting(mapId, mapTier);
    this.terrainBuilder.buildMap(mapId, mapTier, seed, terrain, this.settings.grassQuality);
    this.minimap.bakeTerrain(mapId, terrain);
    this.vfxPool.clear();
    this.floatingText.clear();
    this.shakeTrauma = 0;
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;

    this.entityInstancer.consumeEvents(events);
    this.vfxPool.consumeEvents(events);
    this.floatingText.consumeEvents(events);

    // Trigger MilkShake trauma impulses on punchy arcade moments
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      switch (ev.type) {
        case 'damage_dealt':
          if (ev.isBonker) this.addShakeTrauma(0.88);
          else if (ev.isMegacrit) this.addShakeTrauma(0.45);
          else if (ev.critTier >= 1) this.addShakeTrauma(0.16);
          break;
        case 'player_hurt':
          this.addShakeTrauma(0.55);
          break;
        case 'player_land':
          if (ev.impactSpeed > 14) this.addShakeTrauma(0.28);
          break;
        case 'player_jump_pad':
          this.addShakeTrauma(0.32);
          break;
        case 'boss_spawn':
        case 'final_swarm_start':
          this.addShakeTrauma(0.75);
          break;
        case 'boss_defeated':
          this.addShakeTrauma(0.68);
          break;
        case 'player_level_up':
          this.addShakeTrauma(0.3);
          break;
        case 'pickup_collected':
          if (ev.kind === 'nuke') this.addShakeTrauma(0.85);
          break;
        default:
          break;
      }
    }
  }

  public render(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    interpAlpha: number,
  ): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : this.lastRenderMs + 16.67;
    const rawDtSec = this.lastRenderMs > 0 ? (nowMs - this.lastRenderMs) * 0.001 : 0.01667;
    this.lastRenderMs = nowMs;
    const dtSec = Math.min(0.05, Math.max(0.0001, rawDtSec));

    // Rolling FPS & frame time telemetry
    this.lastFrameMs = rawDtSec * 1000;
    const instFps = rawDtSec > 0.0001 ? 1 / rawDtSec : 60;
    this.smoothedFps = this.smoothedFps * 0.9 + Math.min(240, instFps) * 0.1;

    this.elapsedTimeSec += dtSec;
    setGlobalToonTime(this.elapsedTimeSec);

    // Classic 50Hz Snap toggle locks interpolation strictly to 1.0
    const alpha = this.settings.classic50HzSnap ? 1.0 : Math.max(0, Math.min(1, interpAlpha));
    this.lastInterpAlpha = alpha;
    this.lastEnemyCount = currState.enemies.length;
    this.lastProjectileCount = currState.projectiles.length;

    // Lazily build rails & jump pads once when SimState delivers them
    this.terrainBuilder.ensureWorldFeatures(currState.rails, currState.jumpPads);
    this.terrainBuilder.updateAnimatedProps(this.elapsedTimeSec);

    // Graveyard Big Bob Darkness dynamic fog modulation
    const targetDensity = currState.darknessActive ? 0.036 : this.baseFogDensity;
    this.fog.density += (targetDensity - this.fog.density) * Math.min(1, dtSec * 4.0);

    // Update camera (3rd person spring-arm OR 1st person eye + dynamic speed FOV + MilkShake)
    this.updateCamera(prevState, currState, alpha, dtSec);

    // Keep sky dome centered on camera
    this.skyDome.position.copy(this.camera.position);

    // Update player contact shadow
    const px = prevState.player.pos.x + (currState.player.pos.x - prevState.player.pos.x) * alpha;
    const py = prevState.player.pos.y + (currState.player.pos.y - prevState.player.pos.y) * alpha;
    const pz = prevState.player.pos.z + (currState.player.pos.z - prevState.player.pos.z) * alpha;
    this.terrainBuilder.updateContactShadow(px, py, pz, !currState.player.dead);

    // Sync entities & VFX (zero allocations!)
    this.entityInstancer.sync(
      prevState,
      currState,
      alpha,
      dtSec,
      this.elapsedTimeSec,
      this.settings.cameraMode,
    );
    if (currState.phase === 'playing') {
      this.vfxPool.emitContinuous(currState, dtSec);
    }
    this.vfxPool.update(dtSec);

    // Render 3D scene
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }

    // Render crisp 2D overlays (3D-projected floating damage numbers + retro minimap/fullmap)
    this.floatingText.render(this.camera, dtSec);
    this.minimap.render(currState);
  }

  public getPerfMetrics(): DebugPerfMetrics {
    const info = this.renderer?.info.render;
    return {
      fps: Math.round(this.smoothedFps),
      frameTimeMs: Math.round(this.lastFrameMs * 100) / 100,
      simStepMs: 0,
      drawCalls: info ? info.calls : 0,
      triangles: info ? info.triangles : 0,
      activeEnemies: this.lastEnemyCount,
      activeProjectiles: this.lastProjectileCount,
      interpAlpha: this.lastInterpAlpha,
    };
  }

  // ---- Internal Lighting & Camera Helpers ----

  private applyToonSettings(): void {
    setGlobalToonSettings({
      celBands: this.settings.celBands,
      outlineEnabled: this.settings.outlineEnabled,
      outlineThickness: this.settings.outlineThickness,
    });
  }

  private applyStageLighting(mapId: MapId, tier: MapTier): void {
    const p = getStageLightingPreset(mapId, tier);
    this.baseFogDensity = p.fogDensity;
    this.fog.color.setRGB(p.fogR, p.fogG, p.fogB);
    this.fog.density = p.fogDensity;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setRGB(p.fogR, p.fogG, p.fogB);
    }

    (this.skyDomeMat.uniforms.uTopColor!.value as THREE.Color).setHex(p.skyTop);
    (this.skyDomeMat.uniforms.uMidColor!.value as THREE.Color).setHex(p.skyMid);
    (this.skyDomeMat.uniforms.uHorizonColor!.value as THREE.Color).setHex(p.skyHorizon);

    setGlobalToonLighting({
      sunDirX: p.sunDir[0],
      sunDirY: p.sunDir[1],
      sunDirZ: p.sunDir[2],
      sunR: p.sunR,
      sunG: p.sunG,
      sunB: p.sunB,
      ambientR: p.ambientR,
      ambientG: p.ambientG,
      ambientB: p.ambientB,
      shadowR: p.shadowR,
      shadowG: p.shadowG,
      shadowB: p.shadowB,
      highlightR: p.highlightR,
      highlightG: p.highlightG,
      highlightB: p.highlightB,
      skyR: p.fogR * 0.4 + 0.25,
      skyG: p.fogG * 0.6 + 0.35,
      skyB: p.fogB * 0.6 + 0.38,
    });
  }

  private addShakeTrauma(amount: number): void {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  private updateCamera(
    prevState: Readonly<SimState>,
    currState: Readonly<SimState>,
    alpha: number,
    dtSec: number,
  ): void {
    const p0 = prevState.player;
    const p1 = currState.player;

    const px = p0.pos.x + (p1.pos.x - p0.pos.x) * alpha;
    const py = p0.pos.y + (p1.pos.y - p0.pos.y) * alpha;
    const pz = p0.pos.z + (p1.pos.z - p0.pos.z) * alpha;

    const yaw = lerpAngle(p0.yaw, p1.yaw, alpha);
    const pitch = Math.max(-1.35, Math.min(1.35, p0.pitch + (p1.pitch - p0.pitch) * alpha));

    // Title/menu scenic slow orbit camera around spawn clearing!
    if (
      currState.phase === 'title' ||
      currState.phase === 'character_select' ||
      currState.phase === 'map_select'
    ) {
      const orbitA = this.elapsedTimeSec * 0.22;
      const dist = 10.5;
      this._targetPos.set(px, py + 2.0, pz);
      this._camPos.set(px + Math.sin(orbitA) * dist, py + 4.4, pz + Math.cos(orbitA) * dist);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._targetPos);
      return;
    }

    // Dynamic Speed FOV boost (+0..12 deg during high-speed slide/bhop/grind!)
    const hSpeed = Math.hypot(p1.vel.x, p1.vel.z);
    const speedFactor = Math.max(0, Math.min(1, (hSpeed - 11.0) / 17.0));
    const slideBonus = p1.isSliding || p1.railId !== null ? 2.5 : 0;
    const targetFov = Math.min(132, this.settings.fov + speedFactor * 12.0 + slideBonus);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dtSec * 8.5);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Decay MilkShake trauma
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dtSec * 2.4);
    const shakeAmt = this.shakeTrauma * this.shakeTrauma * this.settings.screenShakeIntensity;
    const shakeX = shakeAmt > 0.001 ? Math.sin(this.elapsedTimeSec * 57.3) * shakeAmt * 0.65 : 0;
    const shakeY = shakeAmt > 0.001 ? Math.cos(this.elapsedTimeSec * 49.1) * shakeAmt * 0.55 : 0;
    const shakeRoll = shakeAmt > 0.001 ? Math.sin(this.elapsedTimeSec * 41.7) * shakeAmt * 0.045 : 0;

    // 3D aim forward vector aligned with simcore: yaw=0 looks along -Z, +X is right
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const fwdX = -Math.sin(yaw) * cosPitch;
    const fwdY = sinPitch;
    const fwdZ = -Math.cos(yaw) * cosPitch;

    if (this.settings.cameraMode === 'first') {
      const eyeHeight = p1.isSliding ? CAMERA_1ST_EYE_HEIGHT * 0.56 : CAMERA_1ST_EYE_HEIGHT;
      this._camPos.set(px + shakeX * 0.25, py + eyeHeight + shakeY * 0.25, pz);
      this._lookAt.set(
        this._camPos.x + fwdX * 12,
        this._camPos.y + fwdY * 12,
        this._camPos.z + fwdZ * 12,
      );
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._lookAt);
      if (Math.abs(shakeRoll) > 0.0005) {
        this.camera.rotation.z += shakeRoll;
      }
      return;
    }

    // 3rd-Person Orbit Camera (z = 11.0 default) with terrain collision spring-arm pull-in
    const desiredDist = Math.max(4.5, this.settings.cameraDistance || CAMERA_3RD_OFFSET_Z);
    const pivotY = p1.isSliding ? CAMERA_3RD_OFFSET_Y * 0.72 : CAMERA_3RD_OFFSET_Y;
    this._targetPos.set(px, py + pivotY, pz);

    // Camera sits behind player along -forward with subtle vertical elevation
    this._camOffset.set(-fwdX, -fwdY + 0.14, -fwdZ).normalize();

    let safeDist = desiredDist;
    if (this.currentTerrain) {
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const probeD = (desiredDist * s) / steps;
        const testX = this._targetPos.x + this._camOffset.x * probeD;
        const testY = this._targetPos.y + this._camOffset.y * probeD;
        const testZ = this._targetPos.z + this._camOffset.z * probeD;
        const floorY = this.currentTerrain.sample(testX, testZ).height + 1.15;
        if (testY < floorY) {
          safeDist = Math.min(safeDist, Math.max(2.6, probeD - 0.6));
          break;
        }
      }
    }

    // Fast pull-in on collision, smooth ease-out when unobstructed
    const distRate = safeDist < this.currentCamDist ? 18.0 : 7.5;
    this.currentCamDist += (safeDist - this.currentCamDist) * Math.min(1, dtSec * distRate);

    this._camPos.set(
      this._targetPos.x + this._camOffset.x * this.currentCamDist,
      this._targetPos.y + this._camOffset.y * this.currentCamDist,
      this._targetPos.z + this._camOffset.z * this.currentCamDist,
    );

    // Clamp final camera Y gently above local terrain surface
    if (this.currentTerrain) {
      const minY = this.currentTerrain.sample(this._camPos.x, this._camPos.z).height + 0.95;
      if (this._camPos.y < minY) {
        this._camPos.y = minY;
      }
    }

    // Apply MilkShake offset in camera right/up plane
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this._camPos.addScaledVector(this._right, shakeX);
    this._camPos.addScaledVector(this._up, shakeY);

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._targetPos);
    if (Math.abs(shakeRoll) > 0.0005) {
      this.camera.rotation.z += shakeRoll;
    }
  }
}
