/**
 * KRUNKEDBONK — Main Three.js Hades-Inspired Stylized 3D Renderer
 *
 * Implements IRenderer with exact extracted oracle.json RGB stage palettes enhanced by:
 * - PostProcessPipeline (HalfFloat HDR + UnrealBloomPass + HadesInkGradePass ACES chiaroscuro)
 * - 4-slot real-time dynamic point lighting (hero weapon/aura glow, shrines/lamps/pylons,
 *   active fireballs/boss cores & decaying combat impact light flashes)
 * - Mythic biome-specific Sky Dome (alpine sunlit god-rays, desert mesas & pyramids,
 *   giant cratered Graveyard Harvest Moon, shattered eclipsed Obsidian Sun in FinalBossMap)
 * - Smooth Big Bob Darkness / Blind fog squeeze, Floor-is-Lava molten floor, dynamic speed FOV,
 *   MilkShake recoil, and ZERO per-frame allocations in render()!
 */

import * as THREE from 'three';
import {
  CAMERA_1ST_EYE_HEIGHT,
  CAMERA_3RD_OFFSET_Y,
  CAMERA_3RD_OFFSET_Z,
  DEFAULT_RENDER_SETTINGS,
  FOV_MAX,
  FOV_MIN,
  type CharacterId,
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
  setGlobalPointLight,
  setGlobalToonLighting,
  setGlobalToonSettings,
  setGlobalToonTime,
} from './toonShader';
import { PostProcessPipeline, type BiomeGradeConfig } from './PostProcessPipeline';
import { TerrainMeshBuilder } from './TerrainMeshBuilder';
import { EntityInstancer } from './EntityInstancer';
import { VfxPool } from './VfxPool';
import { FloatingTextLayer } from './FloatingTextLayer';
import { MinimapRenderer } from './MinimapRenderer';

export interface StageLightingPreset {
  fogR: number;
  fogG: number;
  fogB: number;
  fogDensity: number;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  nightAmount: number;
  biomeMode: 0 | 1 | 2 | 3;
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
  inkR: number;
  inkG: number;
  inkB: number;
  grade: BiomeGradeConfig;
}

const HERO_LIGHT_COLOR: Partial<Record<CharacterId, [number, number, number]>> = {
  Fox: [1.0, 0.56, 0.18],
  Calcium: [0.35, 0.88, 1.0],
  SirOofie: [0.68, 0.92, 1.0],
  Vlad: [1.0, 0.22, 0.36],
  SirChadwell: [0.82, 0.32, 1.0],
  TonyMcZoom: [0.28, 0.92, 1.0],
  Noelle: [0.46, 0.90, 1.0],
  Spaceman: [0.76, 0.42, 1.0],
  Roberto: [0.32, 1.0, 0.68],
  Athena: [1.0, 0.86, 0.42],
  Megachad: [1.0, 0.82, 0.28],
};

export function getStageLightingPreset(mapId: MapId, tier: MapTier): StageLightingPreset {
  if (mapId === 'Desert') {
    if (tier === 2) {
      return {
        fogR: 0.44,
        fogG: 0.62,
        fogB: 0.90,
        fogDensity: 0.0052,
        skyTop: 0x162b63,
        skyMid: 0x3b67b5,
        skyHorizon: 0x82b1ed,
        nightAmount: 0.52,
        biomeMode: 1,
        sunDir: [-0.45, 0.74, 0.50],
        sunR: 0.72,
        sunG: 0.86,
        sunB: 1.0,
        ambientR: 0.60,
        ambientG: 0.68,
        ambientB: 0.94,
        shadowR: 0.24,
        shadowG: 0.30,
        shadowB: 0.54,
        highlightR: 0.84,
        highlightG: 0.94,
        highlightB: 1.0,
        inkR: 0.05,
        inkG: 0.07,
        inkB: 0.14,
        grade: {
          bloomStrength: 0.20,
          bloomThreshold: 1.04,
          bloomRadius: 0.42,
          shadowTint: [0.02, 0.04, 0.10],
          highlightTint: [0.98, 1.0, 1.04],
          saturation: 1.09,
          contrast: 1.06,
          vignetteStrength: 0.20,
          inkStrength: 0.06,
          exposure: 1.08,
        },
      };
    }
    if (tier === 3) {
      // Scorched Crimson Desert (blazing scarlet boss sky!)
      return {
        fogR: 0.74,
        fogG: 0.22,
        fogB: 0.16,
        fogDensity: 0.0052,
        skyTop: 0x7d1010,
        skyMid: 0xc91e14,
        skyHorizon: 0xe6401c,
        nightAmount: 0.15,
        biomeMode: 3,
        sunDir: [0.58, 0.66, 0.46],
        sunR: 1.0,
        sunG: 0.86,
        sunB: 0.74,
        ambientR: 0.84,
        ambientG: 0.68,
        ambientB: 0.62,
        shadowR: 0.36,
        shadowG: 0.18,
        shadowB: 0.20,
        highlightR: 1.06,
        highlightG: 0.88,
        highlightB: 0.72,
        inkR: 0.10,
        inkG: 0.03,
        inkB: 0.04,
        grade: {
          bloomStrength: 0.24,
          bloomThreshold: 1.02,
          bloomRadius: 0.46,
          shadowTint: [0.08, 0.02, 0.03],
          highlightTint: [1.05, 0.96, 0.88],
          saturation: 1.12,
          contrast: 1.08,
          vignetteStrength: 0.22,
          inkStrength: 0.08,
          exposure: 1.08,
        },
      };
    }
    // Desert T1: Sun-bleached dusty warm cream-gold dunes & hazy horizon!
    return {
      fogR: 0.89,
      fogG: 0.77,
      fogB: 0.54,
      fogDensity: 0.0046,
      skyTop: 0xc4954f,
      skyMid: 0xe6be75,
      skyHorizon: 0xfae4b0,
      nightAmount: 0.0,
      biomeMode: 1,
      sunDir: [0.46, 0.74, 0.48],
      sunR: 1.0,
      sunG: 0.96,
      sunB: 0.84,
      ambientR: 0.84,
      ambientG: 0.80,
      ambientB: 0.74,
      shadowR: 0.44,
      shadowG: 0.32,
      shadowB: 0.28,
      highlightR: 1.04,
      highlightG: 0.96,
      highlightB: 0.82,
      inkR: 0.09,
      inkG: 0.06,
      inkB: 0.04,
      grade: {
        bloomStrength: 0.18,
        bloomThreshold: 1.06,
        bloomRadius: 0.40,
        shadowTint: [0.04, 0.02, 0.02],
        highlightTint: [1.03, 0.99, 0.92],
        saturation: 1.08,
        contrast: 1.05,
        vignetteStrength: 0.16,
        inkStrength: 0.06,
        exposure: 1.06,
      },
    };
  }

  if (mapId === 'Graveyard') {
    return {
      fogR: 0.39,
      fogG: 0.34,
      fogB: 0.54,
      fogDensity: 0.0062,
      skyTop: 0x161133,
      skyMid: 0x3b2b66,
      skyHorizon: 0x6b5896,
      nightAmount: 0.88,
      biomeMode: 2,
      sunDir: [-0.32, 0.64, -0.70],
      sunR: 0.92,
      sunG: 0.86,
      sunB: 1.0,
      ambientR: 0.74,
      ambientG: 0.74,
      ambientB: 0.82,
      shadowR: 0.20,
      shadowG: 0.18,
      shadowB: 0.38,
      highlightR: 0.96,
      highlightG: 0.90,
      highlightB: 1.05,
      inkR: 0.04,
      inkG: 0.03,
      inkB: 0.10,
      grade: {
        bloomStrength: 0.22,
        bloomThreshold: 1.02,
        bloomRadius: 0.44,
        shadowTint: [0.03, 0.02, 0.09],
        highlightTint: [1.0, 0.98, 1.04],
        saturation: 1.10,
        contrast: 1.08,
        vignetteStrength: 0.24,
        inkStrength: 0.08,
        exposure: 1.08,
      },
    };
  }

  if (mapId === 'FinalBossMap') {
    // Dramatic Apocalyptic Scarlet-Crimson Boss Arena Sky!
    return {
      fogR: 0.66,
      fogG: 0.16,
      fogB: 0.14,
      fogDensity: 0.0042,
      skyTop: 0x730c0c,
      skyMid: 0xc21914,
      skyHorizon: 0xe63c1c,
      nightAmount: 0.22,
      biomeMode: 3,
      sunDir: [0.22, 0.58, -0.78],
      sunR: 1.0,
      sunG: 0.88,
      sunB: 0.72,
      ambientR: 0.82,
      ambientG: 0.66,
      ambientB: 0.64,
      shadowR: 0.30,
      shadowG: 0.14,
      shadowB: 0.18,
      highlightR: 1.06,
      highlightG: 0.90,
      highlightB: 0.74,
      inkR: 0.08,
      inkG: 0.02,
      inkB: 0.04,
      grade: {
        bloomStrength: 0.26,
        bloomThreshold: 1.00,
        bloomRadius: 0.46,
        shadowTint: [0.07, 0.01, 0.03],
        highlightTint: [1.05, 0.96, 0.86],
        saturation: 1.14,
        contrast: 1.09,
        vignetteStrength: 0.24,
        inkStrength: 0.08,
        exposure: 1.08,
      },
    };
  }

  if (tier === 2) {
    // Forest T2: Atmospheric Misty Royal-Violet Twilight Woods!
    return {
      fogR: 0.41,
      fogG: 0.33,
      fogB: 0.64,
      fogDensity: 0.0056,
      skyTop: 0x241c52,
      skyMid: 0x4c3a85,
      skyHorizon: 0x735ca8,
      nightAmount: 0.68,
      biomeMode: 0,
      sunDir: [-0.48, 0.72, 0.50],
      sunR: 0.94,
      sunG: 0.92,
      sunB: 1.0,
      ambientR: 0.74,
      ambientG: 0.72,
      ambientB: 0.90,
      shadowR: 0.22,
      shadowG: 0.20,
      shadowB: 0.44,
      highlightR: 0.98,
      highlightG: 0.95,
      highlightB: 1.04,
      inkR: 0.04,
      inkG: 0.04,
      inkB: 0.12,
      grade: {
        bloomStrength: 0.20,
        bloomThreshold: 1.04,
        bloomRadius: 0.42,
        shadowTint: [0.03, 0.02, 0.09],
        highlightTint: [1.01, 0.99, 1.03],
        saturation: 1.10,
        contrast: 1.06,
        vignetteStrength: 0.20,
        inkStrength: 0.06,
        exposure: 1.08,
      },
    };
  }

  if (tier === 3) {
    return {
      fogR: 0.44,
      fogG: 0.14,
      fogB: 0.12,
      fogDensity: 0.0056,
      skyTop: 0x3b0b0e,
      skyMid: 0x821c1a,
      skyHorizon: 0xb83522,
      nightAmount: 0.35,
      biomeMode: 3,
      sunDir: [0.42, 0.72, -0.52],
      sunR: 1.0,
      sunG: 0.90,
      sunB: 0.78,
      ambientR: 0.82,
      ambientG: 0.68,
      ambientB: 0.66,
      shadowR: 0.28,
      shadowG: 0.12,
      shadowB: 0.16,
      highlightR: 1.05,
      highlightG: 0.88,
      highlightB: 0.76,
      inkR: 0.08,
      inkG: 0.02,
      inkB: 0.04,
      grade: {
        bloomStrength: 0.24,
        bloomThreshold: 1.02,
        bloomRadius: 0.44,
        shadowTint: [0.06, 0.01, 0.03],
        highlightTint: [1.05, 0.96, 0.88],
        saturation: 1.12,
        contrast: 1.08,
        vignetteStrength: 0.22,
        inkStrength: 0.08,
        exposure: 1.08,
      },
    };
  }

  // Flagship Forest T1: Crisp Atmospheric Teal-Cerulean Sky + Warm Sunlit Earthy Mossy Woods!
  return {
    fogR: 0.06,
    fogG: 0.45,
    fogB: 0.58,
    fogDensity: 0.0046,
    skyTop: 0x0a5680,
    skyMid: 0x137ca6,
    skyHorizon: 0x42b0c7,
    nightAmount: 0.0,
    biomeMode: 0,
    sunDir: [0.46, 0.78, 0.44],
    sunR: 1.0,
    sunG: 0.96,
    sunB: 0.85,
    ambientR: 0.80,
    ambientG: 0.82,
    ambientB: 0.80,
    shadowR: 0.22,
    shadowG: 0.32,
    shadowB: 0.44,
    highlightR: 1.04,
    highlightG: 0.98,
    highlightB: 0.84,
    inkR: 0.04,
    inkG: 0.06,
    inkB: 0.09,
    grade: {
      bloomStrength: 0.18,
      bloomThreshold: 1.05,
      bloomRadius: 0.40,
      shadowTint: [0.02, 0.04, 0.08],
      highlightTint: [1.03, 1.0, 0.93],
      saturation: 1.08,
      contrast: 1.06,
      vignetteStrength: 0.18,
      inkStrength: 0.06,
      exposure: 1.08,
    },
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
  private readonly postProcess = new PostProcessPipeline();
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
  private currentMapId: MapId = 'Forest';
  private currentMapTier: MapTier = 1;
  private baseFogDensity = 0.0056;
  private darknessBlend = 0;

  // Dynamic Combat Impact Flash Light (Slot 3)
  private flashLightX = 0;
  private flashLightY = 0;
  private flashLightZ = 0;
  private flashLightR = 1;
  private flashLightG = 0.85;
  private flashLightB = 0.4;
  private flashLightEnergy = 0;

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

  // Pre-allocated scratch math & atmosphere color objects (ZERO per-frame allocations!)
  private readonly _targetPos = new THREE.Vector3();
  private readonly _camOffset = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _baseFogColor = new THREE.Color(0.0, 0.4824, 0.6157);
  private readonly _darkFogColor = new THREE.Color(0.024, 0.016, 0.052);
  private readonly _blindFogColor = new THREE.Color(0.012, 0.012, 0.020);

  constructor() {
    this.assets = new AssetRegistry();

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(new THREE.Color(0.0, 0.4824, 0.6157), 0.0056);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0.0, 0.4824, 0.6157);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.15, 440);

    this.skyDomeGeo = new THREE.SphereGeometry(290, 28, 18);
    this.skyDomeMat = createSkyDomeMaterial(0x104c9c, 0x2ca2d4, 0x80dce6);
    this.skyDome = new THREE.Mesh(this.skyDomeGeo, this.skyDomeMat);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -100;
    this.scene.add(this.skyDome);

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

  public getAssetRegistry(): AssetRegistry { return this.assets; }
  public toggleFullMap(): boolean { return this.minimap.toggleFullMap(); }
  public setFullMapOpen(open: boolean): void { this.minimap.setFullMapOpen(open); }
  public isFullMapOpen(): boolean { return this.minimap.isFullMapOpen(); }

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

    if (this.renderer && !this.postProcess.isEnabled()) {
      const pixelScale = Math.max(0.5, Math.min(1.5, this.settings.pixelScale || 1.0));
      this.postProcess.init(this.renderer, this.scene, this.camera, w, h, Math.min(2, dpr * pixelScale));
      this.postProcess.applyBiomeGrade(getStageLightingPreset(this.currentMapId, this.currentMapTier).grade);
    }

    this.resize(w, h, dpr);
  }

  public unmount(): void {
    this.unsubscribeAssets();
    this.floatingText.unmount();
    this.minimap.unmount();
    this.postProcess.dispose();
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
      const effDpr = Math.min(2, dpr * pixelScale);
      this.renderer.setPixelRatio(effDpr);
      this.renderer.setSize(w, h, false);
      this.postProcess.resize(w, h, effDpr);
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
    this.currentMapId = mapId;
    this.currentMapTier = mapTier;
    this.darknessBlend = 0;
    this.flashLightEnergy = 0;
    this.applyStageLighting(mapId, mapTier);
    this.terrainBuilder.buildMap(mapId, mapTier, seed, terrain, this.settings.grassQuality);
    this.entityInstancer.setTerrain(terrain);
    this.minimap.bakeTerrain(mapId, terrain);
    this.vfxPool.clear();
    this.floatingText.clear();
    this.shakeTrauma = 0;
  }

  private triggerFlashLight(x: number, y: number, z: number, r: number, g: number, b: number, energy: number): void {
    if (energy < this.flashLightEnergy * 0.7) return;
    this.flashLightX = x;
    this.flashLightY = y + 1.2;
    this.flashLightZ = z;
    this.flashLightR = r;
    this.flashLightG = g;
    this.flashLightB = b;
    this.flashLightEnergy = Math.min(2.4, energy);
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;

    this.entityInstancer.consumeEvents(events);
    this.vfxPool.consumeEvents(events);
    this.floatingText.consumeEvents(events);

    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      switch (ev.type) {
        case 'damage_dealt':
          if (ev.isBonker) {
            this.addShakeTrauma(0.88);
            this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.28, 0.85, 2.2);
          } else if (ev.isMegacrit) {
            this.addShakeTrauma(0.45);
            this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.62, 0.16, 1.5);
          } else if (ev.critTier >= 1) {
            this.addShakeTrauma(0.16);
            this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.86, 0.34, 0.9);
          }
          break;
        case 'player_hurt':
          this.addShakeTrauma(0.55);
          this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.18, 0.28, 1.3);
          break;
        case 'player_land':
          if (ev.impactSpeed > 14) this.addShakeTrauma(0.28);
          break;
        case 'player_jump_pad':
          this.addShakeTrauma(0.32);
          this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 0.32, 0.94, 1.0, 1.4);
          break;
        case 'boss_spawn':
        case 'final_swarm_start':
          this.addShakeTrauma(0.75);
          this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.16, 0.28, 2.3);
          break;
        case 'boss_defeated':
        case 'pylon_charged':
          this.addShakeTrauma(0.58);
          this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 0.35, 1.0, 0.68, 2.0);
          break;
        case 'weapon_stolen':
          this.addShakeTrauma(0.52);
          break;
        case 'weapon_reclaimed':
          this.addShakeTrauma(0.32);
          break;
        case 'player_level_up':
          this.addShakeTrauma(0.3);
          this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 0.42, 0.92, 1.0, 1.85);
          break;
        case 'pickup_collected':
          if (ev.kind === 'nuke') {
            this.addShakeTrauma(0.85);
            this.triggerFlashLight(ev.pos.x, ev.pos.y, ev.pos.z, 1.0, 0.42, 0.12, 2.4);
          }
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

    this.lastFrameMs = rawDtSec * 1000;
    const instFps = rawDtSec > 0.0001 ? 1 / rawDtSec : 60;
    this.smoothedFps = this.smoothedFps * 0.9 + Math.min(240, instFps) * 0.1;

    this.elapsedTimeSec += dtSec;
    setGlobalToonTime(this.elapsedTimeSec);
    this.postProcess.setTime(this.elapsedTimeSec);

    const alpha = this.settings.classic50HzSnap ? 1.0 : Math.max(0, Math.min(1, interpAlpha));
    this.lastInterpAlpha = alpha;
    this.lastEnemyCount = currState.enemies.length;
    this.lastProjectileCount = currState.projectiles.length;

    const px = prevState.player.pos.x + (currState.player.pos.x - prevState.player.pos.x) * alpha;
    const py = prevState.player.pos.y + (currState.player.pos.y - prevState.player.pos.y) * alpha;
    const pz = prevState.player.pos.z + (currState.player.pos.z - prevState.player.pos.z) * alpha;

    // Lazily build rails & jump pads once per map, then animate weather/braziers/props (ZERO allocations!)
    this.terrainBuilder.ensureWorldFeatures(currState.rails, currState.jumpPads);
    this.terrainBuilder.updateAnimatedProps(this.elapsedTimeSec, px, pz);

    // Update 4-slot real-time dynamic point lights (ZERO allocations!)
    this.updateDynamicPointLights(currState, px, py, pz, dtSec);

    // Dynamic atmosphere modulation: Big Bob Darkness, Blind challenge, Desert sandstorm & Floor-is-Lava!
    const chId = currState.challengeId;
    const isBlind = chId !== null && (chId === 'Blind' || chId === 'blind' || chId.indexOf('Blind') >= 0 || chId.indexOf('blind') >= 0);
    const isLava = chId !== null && (chId.indexOf('Lava') >= 0 || chId.indexOf('lava') >= 0);

    this.terrainBuilder.setFloorIsLava(isLava, this.elapsedTimeSec);

    const targetDark = isBlind ? 1.0 : currState.darknessActive ? 0.88 : 0.0;
    this.darknessBlend += (targetDark - this.darknessBlend) * Math.min(1, dtSec * 3.5);

    const sandstormGust =
      this.currentMapId === 'Desert' ? 0.0012 * (Math.sin(this.elapsedTimeSec * 0.35) * 0.5 + 0.5) : 0;
    const targetDensity = isBlind
      ? 0.056
      : currState.darknessActive
        ? 0.042
        : this.baseFogDensity + sandstormGust;
    this.fog.density += (targetDensity - this.fog.density) * Math.min(1, dtSec * 4.0);

    const darkTargetCol = isBlind ? this._blindFogColor : this._darkFogColor;
    this.fog.color.copy(this._baseFogColor).lerp(darkTargetCol, this.darknessBlend);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.fog.color);
    }
    const uSkyDark = this.skyDomeMat.uniforms.uDarkness;
    if (uSkyDark) uSkyDark.value = this.darknessBlend;

    // Update camera
    this.updateCamera(prevState, currState, alpha, dtSec);
    this.skyDome.position.copy(this.camera.position);

    // Update player contact shadow
    this.terrainBuilder.updateContactShadow(px, py, pz, !currState.player.dead);

    // Sync entities & VFX (ZERO allocations!)
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

    if (this.renderer) {
      if (!this.postProcess.render()) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    this.floatingText.render(this.camera, dtSec, currState);
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

  // ---- Real-Time Dynamic Point Light Orchestrator (4 Slots, ZERO Allocations) ----

  private updateDynamicPointLights(
    currState: Readonly<SimState>,
    px: number,
    py: number,
    pz: number,
    dtSec: number,
  ): void {
    const flicker = 0.90 + 0.10 * Math.sin(this.elapsedTimeSec * 11.5) * Math.cos(this.elapsedTimeSec * 7.3);

    // Slot 0: Hero weapon / aura warm pool light (subtle tasteful key fill so heroes stay sculpted, never blown out!)
    const hc = HERO_LIGHT_COLOR[currState.characterId] ?? [1.0, 0.72, 0.34];
    const heroLightIntensity =
      currState.phase === 'title' || currState.phase === 'character_select' || currState.phase === 'map_select'
        ? 0.52 * flicker
        : (this.currentMapId === 'Graveyard' || this.currentMapId === 'FinalBossMap' ? 0.48 : 0.32) * flicker;
    setGlobalPointLight(0, px, py + 1.85, pz, 10.5, hc[0], hc[1], hc[2], heroLightIntensity);

    // Slot 1: Nearest glowing world brazier, Darkness Lamp, Pylon or Shrine!
    let foundWorldLight = false;
    let bestDistSq = 36 * 36;
    let l1x = 0;
    let l1y = 0;
    let l1z = 0;
    let l1r = 1.0;
    let l1g = 0.62;
    let l1b = 0.22;
    let l1Range = 16.0;
    let l1Int = 0.95;

    // Prioritize lit Darkness Lamps during Graveyard darkness
    for (let i = 0; i < currState.darknessLamps.length; i++) {
      const lamp = currState.darknessLamps[i]!;
      const dx = lamp.pos.x - px;
      const dz = lamp.pos.z - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        foundWorldLight = true;
        l1x = lamp.pos.x;
        l1y = lamp.pos.y + 3.0;
        l1z = lamp.pos.z;
        l1r = 1.0;
        l1g = 0.76;
        l1b = 0.26;
        l1Range = lamp.lit ? 22.0 : 12.0;
        l1Int = (lamp.lit ? 1.35 : 0.45) * flicker;
      }
    }

    // Check Boss Pylons in FinalBossMap
    if (!foundWorldLight) {
      for (let i = 0; i < currState.pylons.length; i++) {
        const pyObj = currState.pylons[i]!;
        if (!pyObj.active) continue;
        const dx = pyObj.pos.x - px;
        const dz = pyObj.pos.z - pz;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          foundWorldLight = true;
          l1x = pyObj.pos.x;
          l1y = pyObj.pos.y + 5.2;
          l1z = pyObj.pos.z;
          if (pyObj.cleansed) {
            l1r = 0.28; l1g = 1.0; l1b = 0.65;
          } else {
            l1r = 1.0; l1g = 0.22; l1b = 0.72;
          }
          l1Range = 22.0;
          l1Int = 1.15 * flicker;
        }
      }
    }

    // Otherwise nearest sanctuary brazier built by TerrainMeshBuilder!
    if (!foundWorldLight) {
      const brazier = this.terrainBuilder.getNearestBrazier(px, pz);
      if (brazier) {
        foundWorldLight = true;
        l1x = brazier.x;
        l1y = brazier.y + 2.4;
        l1z = brazier.z;
        l1r = brazier.r;
        l1g = brazier.g;
        l1b = brazier.b;
        l1Range = 18.0;
        l1Int = 1.05 * flicker;
      }
    }

    if (foundWorldLight) {
      setGlobalPointLight(1, l1x, l1y, l1z, l1Range, l1r, l1g, l1b, l1Int);
    } else {
      setGlobalPointLight(1, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    // Slot 2: Nearest Boss Core or Blazing Projectile / AreaEffect
    let foundCombatLight = false;
    for (let i = 0; i < currState.enemies.length; i++) {
      const e = currState.enemies[i]!;
      if (e.isBoss || e.role === 'miniboss') {
        const dx = e.pos.x - px;
        const dz = e.pos.z - pz;
        if (dx * dx + dz * dz < 42 * 42) {
          foundCombatLight = true;
          const isFinal = this.currentMapId === 'FinalBossMap';
          setGlobalPointLight(
            2,
            e.pos.x,
            e.pos.y + 2.6,
            e.pos.z,
            20.0,
            isFinal ? 1.0 : 0.35,
            isFinal ? 0.28 : 0.88,
            isFinal ? 0.35 : 1.0,
            1.1 * flicker,
          );
          break;
        }
      }
    }
    if (!foundCombatLight && currState.projectiles.length > 0) {
      const pr = currState.projectiles[0]!;
      foundCombatLight = true;
      setGlobalPointLight(2, pr.pos.x, pr.pos.y + 0.5, pr.pos.z, 10.5, 1.0, 0.68, 0.26, 0.85);
    }
    if (!foundCombatLight) {
      setGlobalPointLight(2, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    // Slot 3: Decaying HDR Combat Impact Flash Light!
    if (this.flashLightEnergy > 0.02) {
      this.flashLightEnergy = Math.max(0, this.flashLightEnergy - dtSec * 4.8);
      setGlobalPointLight(
        3,
        this.flashLightX,
        this.flashLightY,
        this.flashLightZ,
        16.0,
        this.flashLightR,
        this.flashLightG,
        this.flashLightB,
        this.flashLightEnergy,
      );
    } else {
      setGlobalPointLight(3, 0, 0, 0, 0, 0, 0, 0, 0);
    }
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
    this._baseFogColor.setRGB(p.fogR, p.fogG, p.fogB);
    this.fog.color.copy(this._baseFogColor);
    this.fog.density = p.fogDensity;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this._baseFogColor);
    }

    (this.skyDomeMat.uniforms.uTopColor!.value as THREE.Color).setHex(p.skyTop);
    (this.skyDomeMat.uniforms.uMidColor!.value as THREE.Color).setHex(p.skyMid);
    (this.skyDomeMat.uniforms.uHorizonColor!.value as THREE.Color).setHex(p.skyHorizon);
    if (this.skyDomeMat.uniforms.uDarkness) {
      this.skyDomeMat.uniforms.uDarkness.value = 0;
    }
    if (this.skyDomeMat.uniforms.uNightAmount) {
      this.skyDomeMat.uniforms.uNightAmount.value = p.nightAmount;
    }
    if (this.skyDomeMat.uniforms.uBiomeMode) {
      this.skyDomeMat.uniforms.uBiomeMode.value = p.biomeMode;
    }

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
      inkR: p.inkR,
      inkG: p.inkG,
      inkB: p.inkB,
    });

    this.postProcess.applyBiomeGrade(p.grade);
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

    if (
      currState.phase === 'title' ||
      currState.phase === 'character_select' ||
      currState.phase === 'map_select'
    ) {
      // Hero Showcase Telephoto Lens (48° dramatic portrait lens framing the sculpted hero!)
      const showcaseFov = 48;
      if (Math.abs(this.camera.fov - showcaseFov) > 0.05) {
        this.camera.fov = showcaseFov;
        this.camera.updateProjectionMatrix();
      }
      const isPortrait = this.lastViewportH > this.lastViewportW;
      const orbitA = yaw + Math.PI + 0.42 + Math.sin(this.elapsedTimeSec * 0.24) * 0.14;
      const dist = isPortrait ? 6.1 : 4.95;
      const camX = px + Math.sin(orbitA) * dist;
      const camZ = pz + Math.cos(orbitA) * dist;
      const camFloor = this.currentTerrain
        ? this.currentTerrain.sample(camX, camZ).height + 1.25
        : py + 1.65;
      const camY = Math.max(camFloor, py + (isPortrait ? 2.0 : 1.85));

      this._camPos.set(camX, camY, camZ);
      this._camOffset.set(px - camX, 0, pz - camZ).normalize();
      this._right.crossVectors(this._camOffset, this._up).normalize();

      if (currState.phase === 'title') {
        if (isPortrait) {
          this._targetPos.set(px, py + 0.35, pz);
        } else {
          const shiftLeft = -1.28;
          this._targetPos.set(
            px + this._right.x * shiftLeft,
            py + 1.38,
            pz + this._right.z * shiftLeft,
          );
        }
      } else {
        this._targetPos.set(px, py + 1.38, pz);
      }

      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._targetPos);
      return;
    }

    const hSpeed = Math.hypot(p1.vel.x, p1.vel.z);
    const speedFactor = Math.max(0, Math.min(1, (hSpeed - 11.0) / 17.0));
    const slideBonus = p1.isSliding || p1.railId !== null ? 2.5 : 0;
    const targetFov = Math.min(132, this.settings.fov + speedFactor * 12.0 + slideBonus);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dtSec * 8.5);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.shakeTrauma = Math.max(0, this.shakeTrauma - dtSec * 2.4);
    const shakeAmt = this.shakeTrauma * this.shakeTrauma * this.settings.screenShakeIntensity;
    const shakeX = shakeAmt > 0.001 ? Math.sin(this.elapsedTimeSec * 57.3) * shakeAmt * 0.65 : 0;
    const shakeY = shakeAmt > 0.001 ? Math.cos(this.elapsedTimeSec * 49.1) * shakeAmt * 0.55 : 0;
    const shakeRoll = shakeAmt > 0.001 ? Math.sin(this.elapsedTimeSec * 41.7) * shakeAmt * 0.045 : 0;

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

    const desiredDist = Math.max(4.5, this.settings.cameraDistance || CAMERA_3RD_OFFSET_Z);
    const pivotY = p1.isSliding ? CAMERA_3RD_OFFSET_Y * 0.72 : CAMERA_3RD_OFFSET_Y;
    this._targetPos.set(px, py + pivotY, pz);
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

    const distRate = safeDist < this.currentCamDist ? 18.0 : 7.5;
    this.currentCamDist += (safeDist - this.currentCamDist) * Math.min(1, dtSec * distRate);

    this._camPos.set(
      this._targetPos.x + this._camOffset.x * this.currentCamDist,
      this._targetPos.y + this._camOffset.y * this.currentCamDist,
      this._targetPos.z + this._camOffset.z * this.currentCamDist,
    );

    if (this.currentTerrain) {
      const minY = this.currentTerrain.sample(this._camPos.x, this._camPos.z).height + 0.95;
      if (this._camPos.y < minY) {
        this._camPos.y = minY;
      }
    }

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
