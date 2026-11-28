/**
 * KRUNKEDBONK — Hades-Inspired Stylized Post-Processing Pipeline
 *
 * Combines:
 * - Linear HalfFloat HDR RenderTarget for true selective bloom on emissive runes, fire, eyes & slashes
 * - UnrealBloomPass tuned for vibrant jewel-tone halos without washing out crisp ink outlines
 * - Custom HadesInkGradePass:
 *   * Subtle luma-gradient comic ink crease reinforcement (weighted off sky & emissive cores)
 *   * ACES Filmic tone mapping with deep velvety Mike-Mignola chiaroscuro blacks
 *   * Biome-harmonized warm-highlight / cool-shadow split-toning & jewel-tone vibrancy
 *   * Theatrical atmospheric vignette & whisper-subtle hand-painted paper/canvas grain
 * - Zero per-frame allocations in render() and automatic graceful fallback on unsupported GPUs
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface BiomeGradeConfig {
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  saturation: number;
  contrast: number;
  vignetteStrength: number;
  inkStrength: number;
  exposure: number;
}

const HADES_INK_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uShadowTint: { value: new THREE.Vector3(0.04, 0.05, 0.12) },
    uHighlightTint: { value: new THREE.Vector3(1.04, 0.99, 0.92) },
    uSaturation: { value: 1.18 },
    uContrast: { value: 1.09 },
    uExposure: { value: 1.06 },
    uVignette: { value: 0.34 },
    uInkStrength: { value: 0.28 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uExposure;
    uniform float uVignette;
    uniform float uInkStrength;
    uniform float uTime;
    varying vec2 vUv;

    // Fitted Narkowicz ACES Filmic curve (preserves jewel-tone saturation in bloomed highlights)
    vec3 acesFilm(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    float paperHash(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.5);
      return fract(p.x * p.y);
    }

    void main() {
      vec4 centerSample = texture2D(tDiffuse, vUv);
      vec3 hdr = centerSample.rgb;

      // Subtle calligraphic ink crease sharpening via 4-tap luma/color Sobel
      if (uInkStrength > 0.005) {
        vec2 px = 1.0 / max(uResolution, vec2(1.0));
        vec3 cL = texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb;
        vec3 cR = texture2D(tDiffuse, vUv + vec2( px.x, 0.0)).rgb;
        vec3 cU = texture2D(tDiffuse, vUv + vec2(0.0,  px.y)).rgb;
        vec3 cD = texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb;

        // Edge magnitude in compressed tone space so emissive magic does NOT get dark halos!
        vec3 tC = hdr / (1.0 + hdr);
        vec3 tL = cL / (1.0 + cL);
        vec3 tR = cR / (1.0 + cR);
        vec3 tU = cU / (1.0 + cU);
        vec3 tD = cD / (1.0 + cD);

        float grad = length(tR - tL) + length(tU - tD);
        // Protect bright glowing emissives & sky gradients from ink darkening
        float emissiveProtect = 1.0 - smoothstep(0.95, 1.85, max(hdr.r, max(hdr.g, hdr.b)));
        float edgeMask = smoothstep(0.24, 0.62, grad) * emissiveProtect * uInkStrength;
        hdr *= (1.0 - edgeMask * 0.62);
      }

      // Exposure + ACES Filmic tone mapping
      vec3 col = acesFilm(hdr * uExposure);

      // Mike Mignola / Hades Chiaroscuro contrast & rich shadow split-toning
      float lum = luma(col);
      vec3 shadowLift = mix(uShadowTint, vec3(0.0), smoothstep(0.0, 0.35, lum));
      col = max(vec3(0.0), col + shadowLift * 0.28);
      col *= mix(vec3(1.0), uHighlightTint, smoothstep(0.42, 0.95, lum));

      // S-curve chiaroscuro contrast (deep velvety blacks, crisp midtones)
      vec3 curved = col * col * (3.0 - 2.0 * col);
      col = mix(col, curved, clamp((uContrast - 1.0) * 1.65, 0.0, 0.42));

      // Jewel-tone saturation boost (stronger in midtones, restrained in extreme darks)
      float outLum = luma(col);
      float satFactor = mix(1.0, uSaturation, smoothstep(0.03, 0.22, outLum));
      col = mix(vec3(outLum), col, satFactor);

      // Light atmospheric corner vignette (keeps crunchy pixel-art world crisp & vivid!)
      vec2 centered = (vUv - 0.5) * vec2(1.15, 1.05);
      float vigDist = dot(centered, centered);
      float vig = 1.0 - smoothstep(0.36, 1.04, vigDist) * uVignette;
      col *= vig;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
    }
  `,
};

export class PostProcessPipeline {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private enabled = false;

  public init(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    dpr: number,
  ): boolean {
    this.dispose();
    try {
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      const effDpr = Math.min(2, Math.max(1, dpr));
      const rtW = Math.max(1, Math.floor(w * effDpr));
      const rtH = Math.max(1, Math.floor(h * effDpr));

      // HalfFloatType HDR render target preserves emissives > 1.0 for clean selective bloom
      const isWebGL2 = renderer.capabilities.isWebGL2;
      const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
        type: isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
        samples: isWebGL2 ? 4 : 0,
      });
      this.renderTarget = rt;

      const composer = new EffectComposer(renderer, rt);
      composer.setPixelRatio(effDpr);
      composer.setSize(w, h);

      const renderPass = new RenderPass(scene, camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.34, // strength
        0.52, // radius
        0.94, // threshold (only true emissive magic/fire/runes bloom!)
      );
      const gradePass = new ShaderPass(HADES_INK_GRADE_SHADER);
      gradePass.uniforms.uResolution!.value.set(rtW, rtH);
      gradePass.renderToScreen = true;

      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(gradePass);

      this.composer = composer;
      this.renderPass = renderPass;
      this.bloomPass = bloomPass;
      this.gradePass = gradePass;
      this.enabled = true;
      return true;
    } catch {
      this.dispose();
      return false;
    }
  }

  public isEnabled(): boolean {
    return this.enabled && this.composer !== null;
  }

  public resize(width: number, height: number, dpr: number): void {
    if (!this.composer) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const effDpr = Math.min(2, Math.max(1, dpr));
    this.composer.setPixelRatio(effDpr);
    this.composer.setSize(w, h);
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
    if (this.gradePass?.uniforms.uResolution) {
      (this.gradePass.uniforms.uResolution.value as THREE.Vector2).set(
        Math.max(1, Math.floor(w * effDpr)),
        Math.max(1, Math.floor(h * effDpr)),
      );
    }
  }

  public applyBiomeGrade(cfg: BiomeGradeConfig): void {
    if (this.bloomPass) {
      this.bloomPass.strength = cfg.bloomStrength;
      this.bloomPass.threshold = cfg.bloomThreshold;
      this.bloomPass.radius = cfg.bloomRadius;
    }
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      (u.uShadowTint!.value as THREE.Vector3).set(
        cfg.shadowTint[0],
        cfg.shadowTint[1],
        cfg.shadowTint[2],
      );
      (u.uHighlightTint!.value as THREE.Vector3).set(
        cfg.highlightTint[0],
        cfg.highlightTint[1],
        cfg.highlightTint[2],
      );
      u.uSaturation!.value = cfg.saturation;
      u.uContrast!.value = cfg.contrast;
      u.uVignette!.value = cfg.vignetteStrength;
      u.uInkStrength!.value = cfg.inkStrength;
      u.uExposure!.value = cfg.exposure;
    }
  }

  public setTime(timeSec: number): void {
    if (this.gradePass?.uniforms.uTime) {
      this.gradePass.uniforms.uTime.value = timeSec;
    }
  }

  public render(): boolean {
    if (!this.enabled || !this.composer) return false;
    this.composer.render();
    return true;
  }

  public dispose(): void {
    this.enabled = false;
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.gradePass) {
      this.gradePass.dispose();
      this.gradePass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.renderTarget) {
      this.renderTarget.dispose();
      this.renderTarget = null;
    }
    this.renderPass = null;
  }
}
