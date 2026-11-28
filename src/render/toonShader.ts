/**
 * KRUNKEDBONK — Valheim / PS1 Crunchy Pixel-Art Low-Poly Cel, Terrain, Lighting,
 * Weapon Slash, Cyclone Vortex, Runic Decal & Painterly Cel-Cloud Sky Shaders
 *
 * Art Direction:
 * - Crisp hand-painted pixel-art texture fidelity (NearestFilter) driven by warm/cool cel lighting
 * - 4-slot real-time dynamic point lights (weapons, shrines, lamps, boss cores, impact flashes)
 * - Clean subtle Fresnel rim separation and sharp thin black inverted-hull outlines
 * - Cohesive earthy biome terrain: chunky Valheim pixel moss + organic dirt clearings (Forest),
 *   soft sunlit golden dunes (Desert), moody slate flagstones (Graveyard), stepped volcanic stone (FinalBoss)
 * - Stylized multi-layer cel-cloud Sky Dome with atmospheric horizon mountain silhouettes
 */

import * as THREE from 'three';

export interface MkToonLightingState {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  skyTint: THREE.Color;
  groundTint: THREE.Color;
}

export const MAX_DYNAMIC_POINT_LIGHTS = 4;

/**
 * Shared global shader uniforms referenced by all MK-Toon, Terrain, and Outline materials.
 * Updating these mutates every active material in O(1) with ZERO allocations.
 */
export const SHARED_TOON_UNIFORMS = {
  uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.35).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.96, 0.84) },
  uAmbientColor: { value: new THREE.Color(0.75, 0.75, 0.75) },
  uShadowTint: { value: new THREE.Color(0.16, 0.22, 0.44) },
  uHighlightTint: { value: new THREE.Color(1.0, 0.96, 0.84) },
  uSkyTint: { value: new THREE.Color(0.24, 0.72, 0.88) },
  uGroundTint: { value: new THREE.Color(0.18, 0.38, 0.32) },
  uCelBands: { value: 3.0 },
  uTime: { value: 0.0 },
  uWindDir: { value: new THREE.Vector2(0.84, 0.54) },
  /** 4 real-time dynamic point lights: xyz = worldPos, w = range (0 = disabled) */
  uPointLightPos: {
    value: [
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
    ],
  },
  /** 4 real-time dynamic point light colors: rgb = linear color, w = intensity */
  uPointLightCol: {
    value: [
      new THREE.Vector4(1, 0.7, 0.3, 0),
      new THREE.Vector4(0.3, 0.85, 1, 0),
      new THREE.Vector4(1, 0.4, 0.2, 0),
      new THREE.Vector4(0.8, 0.4, 1, 0),
    ],
  },
};

export const SHARED_OUTLINE_UNIFORMS = {
  uGlobalThickness: { value: 1.0 },
  uOutlineEnabled: { value: 1.0 },
  uBiomeInkTint: { value: new THREE.Color(0x090814) },
};

/**
 * Update a single real-time dynamic point light slot [0..3] with ZERO allocations.
 */
export function setGlobalPointLight(
  index: number,
  x: number,
  y: number,
  z: number,
  range: number,
  r: number,
  g: number,
  b: number,
  intensity: number,
): void {
  if (index < 0 || index >= MAX_DYNAMIC_POINT_LIGHTS) return;
  SHARED_TOON_UNIFORMS.uPointLightPos.value[index]!.set(x, y, z, range);
  SHARED_TOON_UNIFORMS.uPointLightCol.value[index]!.set(r, g, b, intensity);
}

/**
 * Update global MK-Toon lighting uniforms in-place (zero allocations).
 */
export function setGlobalToonLighting(params: {
  sunDirX: number;
  sunDirY: number;
  sunDirZ: number;
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
  skyR?: number;
  skyG?: number;
  skyB?: number;
  groundR?: number;
  groundG?: number;
  groundB?: number;
  inkR?: number;
  inkG?: number;
  inkB?: number;
}): void {
  SHARED_TOON_UNIFORMS.uSunDir.value
    .set(params.sunDirX, params.sunDirY, params.sunDirZ)
    .normalize();
  SHARED_TOON_UNIFORMS.uSunColor.value.setRGB(params.sunR, params.sunG, params.sunB);
  SHARED_TOON_UNIFORMS.uAmbientColor.value.setRGB(
    params.ambientR,
    params.ambientG,
    params.ambientB,
  );
  SHARED_TOON_UNIFORMS.uShadowTint.value.setRGB(params.shadowR, params.shadowG, params.shadowB);
  SHARED_TOON_UNIFORMS.uHighlightTint.value.setRGB(
    params.highlightR,
    params.highlightG,
    params.highlightB,
  );
  if (params.skyR !== undefined && params.skyG !== undefined && params.skyB !== undefined) {
    SHARED_TOON_UNIFORMS.uSkyTint.value.setRGB(params.skyR, params.skyG, params.skyB);
  }
  if (
    params.groundR !== undefined &&
    params.groundG !== undefined &&
    params.groundB !== undefined
  ) {
    SHARED_TOON_UNIFORMS.uGroundTint.value.setRGB(params.groundR, params.groundG, params.groundB);
  }
  if (params.inkR !== undefined && params.inkG !== undefined && params.inkB !== undefined) {
    SHARED_OUTLINE_UNIFORMS.uBiomeInkTint.value.setRGB(params.inkR, params.inkG, params.inkB);
  }
}

export function setGlobalToonSettings(params: {
  celBands: 2 | 3;
  outlineEnabled: boolean;
  outlineThickness: number;
}): void {
  SHARED_TOON_UNIFORMS.uCelBands.value = params.celBands;
  SHARED_OUTLINE_UNIFORMS.uOutlineEnabled.value = params.outlineEnabled ? 1.0 : 0.0;
  SHARED_OUTLINE_UNIFORMS.uGlobalThickness.value = Math.max(0.25, params.outlineThickness);
}

export function setGlobalToonTime(timeSec: number): void {
  SHARED_TOON_UNIFORMS.uTime.value = timeSec;
}

export interface MkToonMaterialOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  uvScale?: [number, number];
  vertexColors?: boolean;
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  rimPower?: number;
  rimThreshold?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
  blending?: THREE.Blending;
  /** Enables GPU vertex wind sway weighted by uv.y^2 (for instanced grass/foliage). */
  windStrength?: number;
  /** Optional flat shading via screen-space derivatives (crisp low-poly planes). */
  flatShading?: boolean;
  /** Texture detail influence [0..1] when blended with vertex/base color. Default 1.0. */
  mapStrength?: number;
  /** Specular/gloss highlight band boost [0..1] for metallic/ice/slime surfaces. */
  gloss?: number;
  /** Comic pen-and-ink shadow hatching intensity [0..1]. Default 0.38. */
  hatchStrength?: number;
}

const POINT_LIGHTS_GLSL = /* glsl */ `
uniform vec4 uPointLightPos[4];
uniform vec4 uPointLightCol[4];

vec3 evalDynamicPointLights(vec3 worldPos, vec3 N, vec3 albedo) {
  vec3 accum = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float range = uPointLightPos[i].w;
    if (range > 0.01) {
      vec3 toLight = uPointLightPos[i].xyz - worldPos;
      float dist = length(toLight);
      if (dist < range) {
        vec3 lDir = toLight / max(dist, 0.001);
        float atten = 1.0 - smoothstep(0.0, range, dist);
        atten *= atten;
        float ndl = max(dot(N, lDir) * 0.65 + 0.35, 0.0);
        // Subtle cel step on point-light pools for cohesive comic look
        float stepNdl = mix(ndl, smoothstep(0.22, 0.68, ndl), 0.45);
        accum += albedo * uPointLightCol[i].rgb * uPointLightCol[i].w * atten * stepNdl;
      }
    }
  }
  return accum;
}
`;

const INK_HATCH_GLSL = /* glsl */ `
// Crisp world-triplanar pen-and-ink diagonal cross-hatching in deep shadows (Hades / Mignola aesthetic)
float evalComicHatch(vec3 worldPos, vec3 N, float shadowDepth) {
  if (shadowDepth < 0.05) return 1.0;
  vec3 an = abs(N);
  vec2 p = an.y > 0.65
    ? worldPos.xz
    : (an.x > an.z ? worldPos.zy : worldPos.xy);
  float d1 = sin((p.x + p.y) * 28.0);
  float d2 = sin((p.x - p.y) * 28.0);
  float line1 = smoothstep(-0.72, -0.32, d1);
  float line2 = smoothstep(-0.82, -0.45, d2);
  float hatch = mix(1.0, line1, smoothstep(0.15, 0.65, shadowDepth) * 0.42);
  hatch *= mix(1.0, line2, smoothstep(0.62, 0.96, shadowDepth) * 0.28);
  return hatch;
}
`;

const MK_TOON_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec2 uUvScale;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vTintColor;
varying float vLocalY;

void main() {
  vUv = uv * uUvScale;
  vLocalY = position.y;

  vec3 tint = vec3(1.0);
  #ifdef USE_COLOR
    tint *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    tint *= instanceColor.rgb;
  #endif
  vTintColor = tint;

  vec3 transformed = position;
  vec3 objectNormal = normal;

  #ifdef USE_INSTANCING
    mat4 instMat = instanceMatrix;
    vec4 worldPos4 = modelMatrix * instMat * vec4(transformed, 1.0);
    mat3 normalMat = mat3(modelMatrix) * mat3(instMat);
  #else
    vec4 worldPos4 = modelMatrix * vec4(transformed, 1.0);
    mat3 normalMat = mat3(modelMatrix);
  #endif

  if (uWindStrength > 0.0001) {
    float bend = clamp(uv.y, 0.0, 1.0);
    bend = bend * bend;
    float phase = uTime * 2.55 + worldPos4.x * 0.23 + worldPos4.z * 0.19;
    float gust = sin(uTime * 0.85 + worldPos4.x * 0.055 + worldPos4.z * 0.04) * 0.5 + 0.5;
    float wave = sin(phase) * 0.58 + sin(phase * 1.9 + 1.3) * 0.28 + gust * 0.34;
    float sway = wave * uWindStrength * bend;
    worldPos4.x += uWindDir.x * sway;
    worldPos4.z += uWindDir.y * sway;
    worldPos4.y -= abs(sway) * 0.18;
  }

  vWorldPos = worldPos4.xyz;
  vWorldNormal = normalize(normalMat * objectNormal);

  vec4 mvPosition = viewMatrix * worldPos4;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const MK_TOON_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uBaseColor;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uMapStrength;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform vec3 uSkyTint;
uniform vec3 uGroundTint;
uniform float uCelBands;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uRimThreshold;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;
uniform float uHitFlash;
uniform float uOpacity;
uniform float uGloss;
uniform float uFlatShading;
uniform float uWindStrength;
uniform float uHatchStrength;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vTintColor;
varying float vLocalY;

${POINT_LIGHTS_GLSL}
${INK_HATCH_GLSL}

void main() {
  vec3 N;
  if (uFlatShading > 0.5) {
    N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    if (!gl_FrontFacing) N = -N;
  } else {
    N = normalize(vWorldNormal);
    if (!gl_FrontFacing && uWindStrength < 0.0001) N = -N;
  }

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  vec3 albedo = uBaseColor * vTintColor;
  if (uHasMap > 0.5) {
    vec4 texel = texture2D(uMap, vUv);
    if (texel.a < 0.1) discard;
    albedo *= mix(vec3(1.0), texel.rgb, uMapStrength);
  }

  // Soft-stepped Valheim/PS1 directional cel shading that lets hand-painted pixel textures shine cleanly!
  float ndl = dot(N, L);
  float halfLambert = ndl * 0.5 + 0.5;
  float groundAo = mix(0.84, 1.03, smoothstep(-0.05, 1.15, vLocalY));

  float cel;
  if (uCelBands < 2.5) {
    cel = smoothstep(0.42, 0.54, halfLambert);
  } else {
    float band1 = smoothstep(0.28, 0.40, halfLambert) * 0.50;
    float band2 = smoothstep(0.60, 0.72, halfLambert) * 0.50;
    cel = band1 + band2;
  }

  // Cohesive earthy cool-shadow -> rich natural midtone -> warm sunlit highlight
  vec3 deepInkShadow = albedo * uShadowTint * (0.62 + 0.34 * uAmbientColor);
  vec3 midTone = albedo * mix(uAmbientColor, uSunColor, 0.48) * 1.06;
  vec3 warmLit = albedo * mix(uSunColor, uHighlightTint, 0.42) * 1.18;
  vec3 litColor = cel < 0.5
    ? mix(deepInkShadow, midTone, cel * 2.0)
    : mix(midTone, warmLit, (cel - 0.5) * 2.0);

  // Hatching kept optional (default 0.0) so crunchy PS1 pixel textures stay clean and legible
  if (uHatchStrength > 0.01 && uWindStrength < 0.001) {
    float shadowDepth = clamp(1.0 - cel * 1.85, 0.0, 1.0);
    float hatch = evalComicHatch(vWorldPos, N, shadowDepth);
    litColor *= mix(1.0, hatch, uHatchStrength);
  }

  litColor *= groundAo;

  // Hemisphere sky/ground bounce for grounded 3D readability
  float hemiFactor = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 hemiBounce = mix(uGroundTint, uSkyTint, hemiFactor) * albedo * 0.14;
  litColor += hemiBounce;

  // Real-time dynamic point lights (staves, fireballs, lamps, shrines, pylons!)
  litColor += evalDynamicPointLights(vWorldPos, N, albedo);

  // Crisp specular highlight band on armor, steel, sunglasses, ice & slime
  if (uGloss > 0.01) {
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float specMain = smoothstep(0.86, 0.91, ndh) * uGloss;
    float specBroad = smoothstep(0.68, 0.74, ndh) * uGloss * 0.20;
    litColor += uHighlightTint * (specMain * 0.85 + specBroad);
  }

  // Tasteful clean silhouette Fresnel rim (never milky white washout)
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, uRimPower);
  float sunGate = smoothstep(-0.20, 0.48, ndl);
  float keyRimStep = smoothstep(uRimThreshold, uRimThreshold + 0.10, fresnel * (0.24 + 0.76 * sunGate));
  vec3 keyRimTint = mix(uRimColor, uHighlightTint * 1.05, 0.35);
  litColor += keyRimTint * keyRimStep * (uRimStrength * 0.72);

  // Subtle dark-side atmospheric sky counter-rim so shadows keep form
  float backRimStep = smoothstep(0.62, 0.76, fresnel * (1.0 - sunGate));
  litColor += (uSkyTint * 0.72 + vec3(0.05, 0.06, 0.10)) * backRimStep * (uRimStrength * 0.24);

  // HDR Emissive accents (values > 1.0 trigger subtle selective bloom on eyes/runes/lasers)
  litColor += uEmissive * uEmissiveIntensity;

  // Crisp arcade hit-flash override
  if (uHitFlash > 0.001) {
    litColor = mix(litColor, vec3(1.18, 1.06, 0.92), clamp(uHitFlash * 0.62, 0.0, 0.62));
  }

  gl_FragColor = vec4(litColor, uOpacity);

  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Create a custom MK-Toon Hades Inked/Cel ShaderMaterial referencing global lighting uniforms.
 */
export function createMkToonMaterial(options: MkToonMaterialOptions = {}): THREE.ShaderMaterial {
  const baseColor = new THREE.Color(options.color ?? 0xffffff);
  const rimColor = new THREE.Color(options.rimColor ?? 0xe2f7ff);
  const emissive = new THREE.Color(options.emissive ?? 0x000000);
  const uvScale = options.uvScale ?? [1, 1];

  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uBaseColor: { value: baseColor },
    uMap: { value: options.map ?? null },
    uHasMap: { value: options.map ? 1.0 : 0.0 },
    uMapStrength: { value: options.mapStrength ?? 1.0 },
    uUvScale: { value: new THREE.Vector2(uvScale[0], uvScale[1]) },
    uSunDir: SHARED_TOON_UNIFORMS.uSunDir,
    uSunColor: SHARED_TOON_UNIFORMS.uSunColor,
    uAmbientColor: SHARED_TOON_UNIFORMS.uAmbientColor,
    uShadowTint: SHARED_TOON_UNIFORMS.uShadowTint,
    uHighlightTint: SHARED_TOON_UNIFORMS.uHighlightTint,
    uSkyTint: SHARED_TOON_UNIFORMS.uSkyTint,
    uGroundTint: SHARED_TOON_UNIFORMS.uGroundTint,
    uCelBands: SHARED_TOON_UNIFORMS.uCelBands,
    uTime: SHARED_TOON_UNIFORMS.uTime,
    uWindDir: SHARED_TOON_UNIFORMS.uWindDir,
    uPointLightPos: SHARED_TOON_UNIFORMS.uPointLightPos,
    uPointLightCol: SHARED_TOON_UNIFORMS.uPointLightCol,
    uWindStrength: { value: options.windStrength ?? 0.0 },
    uRimColor: { value: rimColor },
    uRimStrength: { value: options.rimStrength ?? 0.38 },
    uRimPower: { value: options.rimPower ?? 2.6 },
    uRimThreshold: { value: options.rimThreshold ?? 0.4 },
    uEmissive: { value: emissive },
    uEmissiveIntensity: { value: options.emissiveIntensity ?? 0.0 },
    uHitFlash: { value: 0.0 },
    uOpacity: { value: options.opacity ?? 1.0 },
    uGloss: { value: options.gloss ?? 0.0 },
    uFlatShading: { value: options.flatShading ? 1.0 : 0.0 },
    uHatchStrength: { value: options.hatchStrength ?? 0.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MK_TOON_VERTEX_SHADER,
    fragmentShader: MK_TOON_FRAGMENT_SHADER,
    fog: true,
    transparent: options.transparent ?? false,
    depthWrite: options.depthWrite ?? !(options.transparent ?? false),
    side: options.side ?? THREE.FrontSide,
    vertexColors: options.vertexColors ?? false,
    blending: options.blending ?? THREE.NormalBlending,
  });
}

// ============================================================================
// DEDICATED HADES PAINTERLY TRIPLANAR TERRAIN SHADER (ZERO TILING / ZERO JAGGIES)
// ============================================================================

export interface MkTerrainMaterialOptions {
  groundMap: THREE.Texture | null;
  cliffMap: THREE.Texture | null;
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  biomeMode?: 0 | 1 | 2 | 3; // 0=Forest, 1=Desert, 2=Graveyard, 3=FinalBossMap
  arenaRadius?: number;
}

const MK_TERRAIN_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vTintColor;

void main() {
  #ifdef USE_COLOR
    vTintColor = color.rgb;
  #else
    vTintColor = vec3(1.0);
  #endif

  vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos4.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 mvPosition = viewMatrix * worldPos4;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const MK_TERRAIN_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uBaseColor;
uniform sampler2D uMap;
uniform float uHasMap;
uniform sampler2D uCliffMap;
uniform float uHasCliffMap;
uniform float uBiomeMode;
uniform float uArenaRadius;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform vec3 uSkyTint;
uniform vec3 uGroundTint;
uniform float uCelBands;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vTintColor;

${POINT_LIGHTS_GLSL}
${INK_HATCH_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  v += valueNoise(p) * 0.55;
  v += valueNoise(p * 2.13 + vec2(11.7, 5.3)) * 0.30;
  v += valueNoise(p * 4.41 - vec2(4.1, 8.9)) * 0.15;
  return v;
}

void main() {
  // Smooth painterly terrain normal with light low-poly facet crispness (avoids harsh triangular checker artifacts)
  vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (!gl_FrontFacing) flatN = -flatN;
  vec3 smoothN = normalize(vWorldNormal);
  vec3 N = normalize(mix(smoothN, flatN, 0.38));

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  // Crisp Valheim/PS1 world-space pixel-art texel scale so chunky hand-painted ground tiles read clearly!
  vec2 groundUvA = vWorldPos.xz * (uBiomeMode > 0.5 && uBiomeMode < 1.5 ? 0.08 : 0.145);
  vec2 groundUvB = (vWorldPos.xz * 0.055) + vec2(0.37, 0.61);
  vec3 groundTex = uHasMap > 0.5
    ? mix(texture2D(uMap, groundUvA).rgb, texture2D(uMap, groundUvB).rgb, uBiomeMode > 0.5 && uBiomeMode < 1.5 ? 0.45 : 0.18)
    : vec3(1.0);

  // Triplanar cliff stone masonry so vertical ledges show weathered mossy stone/sandstone blocks!
  vec3 absN = abs(N);
  vec2 cliffUv = absN.x > absN.z
    ? vec2(vWorldPos.z * 0.14, vWorldPos.y * 0.15)
    : vec2(vWorldPos.x * 0.14, vWorldPos.y * 0.15);
  vec3 cliffTex = uHasCliffMap > 0.5 ? texture2D(uCliffMap, cliffUv).rgb : groundTex;

  // Slope mask: 0 = walkable floor, 1 = steep cliff/rock wall
  float slopeMask = smoothstep(0.30, 0.54, 1.0 - clamp(N.y, 0.0, 1.0));
  vec3 detailTex = mix(groundTex, cliffTex, slopeMask);

  // Subtle organic macro lighting patches across hills & valleys
  float macroA = fbm2(vWorldPos.xz * 0.036);
  float macroB = fbm2(vWorldPos.xz * 0.088 + vec2(17.3, 9.1));
  float macroShade = 0.90 + macroA * 0.18 + (macroB - 0.5) * 0.06;

  float texWeight = uBiomeMode > 0.5 && uBiomeMode < 1.5 ? 0.44 : uBiomeMode > 2.5 ? 0.72 : 0.84;
  vec3 albedo = uBaseColor * vTintColor * mix(vec3(1.0), detailTex, texWeight) * macroShade;
  vec3 extraEmissive = vec3(0.0);

  if (uBiomeMode > 2.5) {
    // FINAL BOSS ARENA: Weathered stepped carved desert-volcanic stone slabs + warm rim rings & molten chasm!
    float r = length(vWorldPos.xz);
    float ang = atan(vWorldPos.z, vWorldPos.x);

    // Carved radial stone block rings with dark recessed seams
    float radialTile = abs(fract(r / 6.5) - 0.5);
    float angularTile = abs(fract((ang / 6.2831853) * 36.0) - 0.5);
    float slabSeam = (1.0 - smoothstep(0.015, 0.04, radialTile)) +
                     (1.0 - smoothstep(0.015, 0.04, angularTile)) * step(8.0, r);
    float slabId = hash21(vec2(floor(r / 6.5), floor((ang / 6.2831853) * 36.0)));
    albedo *= (0.90 + slabId * 0.18) * (1.0 - clamp(slabSeam, 0.0, 1.0) * 0.36);

    // Subtle inlaid bronze battle-ring markings (clean tactical cues, not loud yellow glow!)
    float d1 = abs(r - 22.0);
    float d2 = abs(r - 48.0);
    float d3 = abs(r - (uArenaRadius - 3.6));
    float ringDist = min(d1, min(d2, d3));
    float bronzeBand = 1.0 - smoothstep(0.18, 0.34, ringDist);
    albedo = mix(albedo, vec3(0.76, 0.52, 0.24), bronzeBand * 0.55);

    // Glowing molten volcanic fissures strictly hugging the outer cliff abyss edge!
    float chasmMask = smoothstep(uArenaRadius - 2.4, uArenaRadius + 0.6, r);
    float crackNoise = fbm2(vWorldPos.xz * 0.24 + vec2(uTime * 0.05, -uTime * 0.04));
    float magmaVeins = smoothstep(0.46, 0.70, crackNoise) * chasmMask;
    extraEmissive += vec3(1.30, 0.28, 0.06) * (chasmMask * 0.24 + magmaVeins * 0.72);
  } else if (uBiomeMode > 0.5 && uBiomeMode < 1.5) {
    // DESERT: Clean warm sunlit smooth sand dunes with gentle organic wind-blown contours!
    float warp = fbm2(vWorldPos.xz * 0.048) * 5.2;
    float duneFlow = sin((vWorldPos.x * 0.17 + vWorldPos.z * 0.11) + warp) * 0.5 + 0.5;
    float fineRipple = sin((vWorldPos.x * 0.62 - vWorldPos.z * 0.38) + warp * 1.2) * 0.5 + 0.5;
    float sandSculpt = mix(0.90, 1.08, duneFlow * 0.72 + fineRipple * 0.28);
    albedo *= mix(sandSculpt, 1.0, slopeMask);
  } else if (uBiomeMode > 1.5 && uBiomeMode < 2.5) {
    // GRAVEYARD: Weathered dark gothic cemetery flagstones with inked mortar seams & twilight grass
    vec2 cell = abs(fract((vWorldPos.xz + 10.0) / 20.0) - 0.5) * 20.0;
    float isAvenue = 1.0 - smoothstep(2.05, 2.65, min(cell.x, cell.y));
    float curbEdge = (1.0 - smoothstep(0.08, 0.24, min(abs(cell.x - 2.35), abs(cell.y - 2.35)))) * (1.0 - slopeMask);

    vec2 pUv = vWorldPos.xz * 0.52;
    pUv.x += floor(pUv.y) * 0.5;
    vec2 paver = abs(fract(pUv) - 0.5);
    float mortarCrack = smoothstep(0.42, 0.48, max(paver.x, paver.y));
    float stoneTint = 0.88 + 0.20 * hash21(floor(pUv));
    vec3 gothicFlagstone = vec3(0.32, 0.33, 0.44) * stoneTint * (1.0 - mortarCrack * 0.48);

    albedo = mix(albedo, gothicFlagstone, isAvenue * (1.0 - slopeMask) * 0.80);
    albedo *= (1.0 - curbEdge * 0.30);
  } else {
    // FOREST: Authentic Valheim/PS1 earthy olive-moss grass with organic biome-tinted forest loam patches!
    float dirtNoise = fbm2(vWorldPos.xz * 0.068 + vec2(3.4, -2.1));
    float spawnClearing = 1.0 - smoothstep(2.4, 7.0, length(vWorldPos.xz) + (dirtNoise - 0.5) * 3.8);
    float dirtPatches = smoothstep(0.66, 0.82, dirtNoise) * 0.62;
    float dirtMask = clamp(max(spawnClearing * 0.42, dirtPatches), 0.0, 0.68) * (1.0 - slopeMask);

    // Rich dark earthy forest loam tinted by biome vertex palette (warm mud in T1, cool dark soil in T2 twilight!)
    vec3 biomeLoam = vec3(0.36, 0.25, 0.14) * mix(vec3(1.0), vTintColor * 1.55, 0.52) * (0.85 + 0.26 * detailTex.g);
    albedo = mix(albedo, biomeLoam, dirtMask * 0.72);

    // Crisp subtle mossy cliff overhang lip where vertical stone walls meet grass hills
    float cliffEdge = smoothstep(0.24, 0.42, 1.0 - clamp(N.y, 0.0, 1.0)) * (1.0 - slopeMask);
    float cliffCrease = smoothstep(0.34, 0.46, 1.0 - clamp(N.y, 0.0, 1.0)) * (1.0 - smoothstep(0.46, 0.62, 1.0 - clamp(N.y, 0.0, 1.0)));
    albedo = mix(albedo, albedo * 1.08, cliffEdge * 0.35);
    albedo *= (1.0 - cliffCrease * 0.24);
  }

  // Natural Valheim/PS1 stepped cel terrain lighting (crisp readable shadows, zero muddy artifacts)
  float ndl = dot(N, L);
  float halfLambert = ndl * 0.5 + 0.5;
  float cel;
  if (uCelBands < 2.5) {
    cel = smoothstep(0.42, 0.52, halfLambert);
  } else {
    float band1 = smoothstep(0.28, 0.40, halfLambert) * 0.50;
    float band2 = smoothstep(0.60, 0.72, halfLambert) * 0.50;
    cel = band1 + band2;
  }

  vec3 coolShadow = albedo * uShadowTint * (0.64 + 0.32 * uAmbientColor);
  vec3 midTone = albedo * mix(uAmbientColor, uSunColor, 0.46) * 1.05;
  vec3 warmLit = albedo * mix(uSunColor, uHighlightTint, 0.42) * 1.15;
  vec3 litColor = cel < 0.5
    ? mix(coolShadow, midTone, cel * 2.0)
    : mix(midTone, warmLit, (cel - 0.5) * 2.0);

  // Subtle hemisphere bounce
  float hemiFactor = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  litColor += mix(uGroundTint, uSkyTint, hemiFactor) * albedo * 0.12;

  // Real-time dynamic point-light pools (lamps, shrines, fireballs, boss cores!)
  litColor += evalDynamicPointLights(vWorldPos, N, albedo);

  // Subtle hillcrest ridge sheen (weighted off flat ground)
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 4.0);
  float ridgeGate = mix(0.10, 0.85, slopeMask);
  float rimStep = smoothstep(0.54, 0.68, fresnel * (smoothstep(-0.2, 0.5, ndl) * 0.7 + 0.3)) * ridgeGate;
  litColor += uRimColor * rimStep * (uRimStrength * 0.65);

  // Emissive (Floor-is-Lava, outer chasm magma)
  litColor += uEmissive * uEmissiveIntensity + extraEmissive;

  gl_FragColor = vec4(litColor, 1.0);

  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

export function createMkTerrainMaterial(options: MkTerrainMaterialOptions): THREE.ShaderMaterial {
  const rimColor = new THREE.Color(options.rimColor ?? 0xb8f2ff);
  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uBaseColor: { value: new THREE.Color(0xffffff) },
    uMap: { value: options.groundMap ?? null },
    uHasMap: { value: options.groundMap ? 1.0 : 0.0 },
    uCliffMap: { value: options.cliffMap ?? null },
    uHasCliffMap: { value: options.cliffMap ? 1.0 : 0.0 },
    uBiomeMode: { value: options.biomeMode ?? 0 },
    uArenaRadius: { value: options.arenaRadius ?? 110 },
    uSunDir: SHARED_TOON_UNIFORMS.uSunDir,
    uSunColor: SHARED_TOON_UNIFORMS.uSunColor,
    uAmbientColor: SHARED_TOON_UNIFORMS.uAmbientColor,
    uShadowTint: SHARED_TOON_UNIFORMS.uShadowTint,
    uHighlightTint: SHARED_TOON_UNIFORMS.uHighlightTint,
    uSkyTint: SHARED_TOON_UNIFORMS.uSkyTint,
    uGroundTint: SHARED_TOON_UNIFORMS.uGroundTint,
    uCelBands: SHARED_TOON_UNIFORMS.uCelBands,
    uTime: SHARED_TOON_UNIFORMS.uTime,
    uPointLightPos: SHARED_TOON_UNIFORMS.uPointLightPos,
    uPointLightCol: SHARED_TOON_UNIFORMS.uPointLightCol,
    uRimColor: { value: rimColor },
    uRimStrength: { value: options.rimStrength ?? 0.16 },
    uEmissive: { value: new THREE.Color(0x000000) },
    uEmissiveIntensity: { value: 0.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MK_TERRAIN_VERTEX_SHADER,
    fragmentShader: MK_TERRAIN_FRAGMENT_SHADER,
    fog: true,
    vertexColors: true,
  });
}

// ============================================================================
// HADES CALLIGRAPHIC ENERGY BEAM, SHOCKWAVE, SLASH ARC, RUNE & CYCLONE SHADERS
// ============================================================================

export function createEnergyBeamMaterial(
  color: THREE.ColorRepresentation = 0x5cf7ff,
  opacity = 0.72,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: SHARED_TOON_UNIFORMS.uTime,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstColor;
      void main() {
        vUv = uv;
        vec3 ic = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          ic = instanceColor.rgb;
        #endif
        vInstColor = ic;
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          mat3 nm = mat3(modelMatrix) * mat3(instanceMatrix);
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
          mat3 nm = mat3(modelMatrix);
        #endif
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(nm * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstColor;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float core = pow(abs(dot(N, V)), 1.45);
        float vFade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
        float helix = 0.78 + 0.22 * sin(vUv.y * 28.0 + vUv.x * 12.566 - uTime * 13.0);
        vec3 baseCol = uColor * vInstColor;
        // HDR hot center drives lush bloom!
        vec3 col = mix(baseCol * 1.25, vec3(1.85, 1.82, 1.65), pow(core, 2.2) * 0.65) * helix;
        float alpha = core * vFade * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

export function createShockwaveRingMaterial(
  color: THREE.ColorRepresentation = 0xffd84d,
  opacity = 0.9,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: SHARED_TOON_UNIFORMS.uTime,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vLocalXZ;
      varying vec3 vInstColor;
      void main() {
        vLocalXZ = position.xz;
        vec3 ic = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          ic = instanceColor.rgb;
        #endif
        vInstColor = ic;
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vLocalXZ;
      varying vec3 vInstColor;
      void main() {
        float r = length(vLocalXZ);
        float ang = atan(vLocalXZ.y, vLocalXZ.x);
        // Calligraphic starburst shockwave crest with radiant notched rune rays!
        float rays = 0.82 + 0.18 * sin(ang * 12.0 + uTime * 9.0);
        float outerEdge = 1.0 - smoothstep(0.92, 1.0, r);
        float innerTail = smoothstep(0.56, 0.92, r);
        float crest = smoothstep(0.84, 0.94, r) * outerEdge;
        float innerRune = (1.0 - smoothstep(0.015, 0.045, abs(r - 0.74))) * (0.45 + 0.55 * step(0.0, sin(ang * 16.0)));
        vec3 baseCol = uColor * vInstColor * 1.25;
        vec3 col = mix(baseCol, vec3(1.9, 1.82, 1.5), crest * 0.65) * rays;
        float alpha = clamp((innerTail * outerEdge + innerRune * 0.55) * uOpacity, 0.0, 1.0);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

/**
 * Hades-style calligraphic tapered weapon slash arc shader:
 * razor-sharp glowing blade crest, vibrant saturated smear body, dry-brush streaks & dark ink border.
 */
export function createSlashArcMaterial(
  color: THREE.ColorRepresentation = 0xff5a36,
  opacity = 0.95,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: SHARED_TOON_UNIFORMS.uTime,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vInstColor;
      void main() {
        vUv = uv;
        vec3 ic = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          ic = instanceColor.rgb;
        #endif
        vInstColor = ic;
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vInstColor;
      void main() {
        // vUv.x runs along arc [0..1], vUv.y runs inner [0] -> outer leading edge [1]
        float arcTaper = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
        float tipSharp = pow(arcTaper, 0.55);
        float dryBrush = 0.65 + 0.35 * sin(vUv.x * 26.0 + vUv.y * 8.0);
        float innerCut = smoothstep(0.18 + (1.0 - tipSharp) * 0.58, 0.68, vUv.y * dryBrush);
        float outerCut = 1.0 - smoothstep(0.91, 1.0, vUv.y);
        float alpha = innerCut * outerCut * tipSharp * uOpacity;
        if (alpha < 0.02) discard;

        // Crisp dark ink back-trail rim + incandescent white-hot leading blade crest!
        float hotEdge = smoothstep(0.76, 0.93, vUv.y) * outerCut;
        vec3 baseCol = uColor * vInstColor * 1.45;
        vec3 col = mix(baseCol, vec3(2.1, 2.0, 1.75), hotEdge * 0.78);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

/**
 * Engraved Runic Magic Circle ground decal shader for Auras, Shrines, Pylons & Lamps
 * (replaces generic flat translucent circles with ornate glowing rotating sigils!).
 */
export function createRuneDiscMaterial(
  color: THREE.ColorRepresentation = 0xffd84d,
  opacity = 0.82,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uBaseColor: { value: new THREE.Color(color) },
      uEmissive: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFillProgress: { value: 1.0 },
      uTime: SHARED_TOON_UNIFORMS.uTime,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vLocalXZ;
      void main() {
        vLocalXZ = position.xz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uBaseColor;
      uniform vec3 uEmissive;
      uniform float uOpacity;
      uniform float uFillProgress;
      uniform float uTime;
      varying vec2 vLocalXZ;
      void main() {
        float r = length(vLocalXZ);
        if (r > 1.0) discard;
        float ang = atan(vLocalXZ.y, vLocalXZ.x);

        // Double engraved outer ring + rotating geometric rune ticks + inner sacred polygon
        float outerRing = (1.0 - smoothstep(0.025, 0.055, abs(r - 0.94))) * 1.15;
        float innerRing = (1.0 - smoothstep(0.014, 0.032, abs(r - 0.80))) * 0.75;
        float rotAng = ang + uTime * 0.75;
        float ticks = step(0.25, sin(rotAng * 18.0)) * smoothstep(0.80, 0.84, r) * (1.0 - smoothstep(0.90, 0.94, r));

        // Subtle inscribed hexagonal star
        float starR = 0.56 + 0.14 * cos((ang - uTime * 0.45) * 6.0);
        float starLine = (1.0 - smoothstep(0.015, 0.035, abs(r - starR))) * 0.58;

        // Soft pulsing interior energy wash weighted by fillProgress
        float interior = (1.0 - smoothstep(0.0, 0.94, r)) * 0.22 * uFillProgress;
        float fillRing = (1.0 - smoothstep(0.015, 0.04, abs(r - max(0.05, uFillProgress * 0.92)))) * step(0.02, uFillProgress) * step(uFillProgress, 0.99);

        float pattern = clamp(outerRing + innerRing + ticks * 0.65 + starLine + interior + fillRing, 0.0, 1.35);
        vec3 col = mix(uBaseColor, uEmissive * 1.55, 0.55);
        col = mix(col, vec3(1.8, 1.75, 1.55), clamp(outerRing * 0.45 + fillRing * 0.6, 0.0, 0.75));
        float alpha = clamp(pattern * uOpacity, 0.0, 0.95);
        if (alpha < 0.015) discard;

        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

/**
 * Swirling translucent wind-carved cyclone shader for Desert Tornadoes & Tornado weapon funnels
 * (replaces opaque beige traffic cones!).
 */
export function createTornadoVortexMaterial(
  color: THREE.ColorRepresentation = 0xe8b86d,
  accent: THREE.ColorRepresentation = 0xfff0c2,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
      uAccent: { value: new THREE.Color(accent) },
      uTime: SHARED_TOON_UNIFORMS.uTime,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Organic whipping twist along funnel height
        float sway = uv.y * uv.y;
        p.x += sin(uTime * 2.8 + uv.y * 4.5) * 0.85 * sway;
        p.z += cos(uTime * 2.4 + uv.y * 4.0) * 0.85 * sway;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float edge = pow(1.0 - abs(dot(N, V)), 0.75);
        float spiralA = sin(vUv.x * 18.8495 - vUv.y * 16.0 - uTime * 9.5);
        float spiralB = sin(vUv.x * 31.4159 - vUv.y * 26.0 - uTime * 14.0 + 1.4);
        float ribbon = smoothstep(-0.15, 0.55, spiralA * 0.65 + spiralB * 0.35);
        float vFade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.76, 1.0, vUv.y));
        float alpha = (0.18 + ribbon * 0.52) * (0.42 + edge * 0.58) * vFade;
        if (alpha < 0.03) discard;
        vec3 col = mix(uColor * 0.72, uAccent * 1.15, ribbon * 0.7 + edge * 0.3);
        gl_FragColor = vec4(col, alpha * 0.82);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/**
 * Generates a rich soft radial-gradient ground contact shadow texture (zero external files).
 */
let cachedSoftShadowTex: THREE.DataTexture | null = null;
export function getSoftContactShadowTexture(): THREE.DataTexture {
  if (cachedSoftShadowTex) return cachedSoftShadowTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const t = Math.max(0, 1 - r);
      const alpha = Math.pow(t, 1.55) * 0.78 + (r < 0.55 ? 0.22 * (1 - r / 0.55) : 0);
      const idx = (y * size + x) * 4;
      data[idx] = 8;
      data[idx + 1] = 8;
      data[idx + 2] = 20;
      data[idx + 3] = Math.min(255, Math.round(alpha * 255));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cachedSoftShadowTex = tex;
  return tex;
}

/**
 * Helper to update texture on an MK-Toon material cleanly without reallocation.
 */
export function setMkToonTexture(mat: THREE.ShaderMaterial, tex: THREE.Texture | null): void {
  const uMap = mat.uniforms.uMap;
  const uHasMap = mat.uniforms.uHasMap;
  if (uMap) uMap.value = tex;
  if (uHasMap) uHasMap.value = tex ? 1.0 : 0.0;
}

/**
 * Helper to set hit-flash intensity [0..1] on an MK-Toon material.
 */
export function setMkToonHitFlash(mat: THREE.ShaderMaterial, amount: number): void {
  const u = mat.uniforms.uHitFlash;
  if (u) u.value = amount;
}

// ============================================================================
// BACKSIDE INVERTED-HULL BIOME-HARMONIZED INK OUTLINE SHADER
// ============================================================================

const OUTLINE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uThickness;
uniform float uGlobalThickness;
uniform float uOutlineEnabled;

void main() {
  #ifdef USE_INSTANCING
    mat4 worldMat = modelMatrix * instanceMatrix;
    mat3 normalMat = mat3(modelMatrix) * mat3(instanceMatrix);
  #else
    mat4 worldMat = modelMatrix;
    mat3 normalMat = mat3(modelMatrix);
  #endif

  vec4 worldPos = worldMat * vec4(position, 1.0);
  vec3 worldNormal = normalize(normalMat * normal);

  float camDist = length(cameraPosition - worldPos.xyz);

  // Crisp PS1/low-poly consistent black ink outline weight
  float distScale = clamp(0.42 + camDist * 0.032, 0.46, 1.55);
  float farFade = 1.0 - smoothstep(88.0, 156.0, camDist);
  float finalExtrude = uThickness * uGlobalThickness * distScale * farFade * uOutlineEnabled;

  worldPos.xyz += worldNormal * finalExtrude;

  vec4 mvPosition = viewMatrix * worldPos;
  mvPosition.z -= 0.004 * uOutlineEnabled;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uOutlineColor;
uniform vec3 uBiomeInkTint;
uniform float uOutlineEnabled;

void main() {
  if (uOutlineEnabled < 0.5) discard;
  // Crisp solid dark ink outline
  vec3 ink = mix(uOutlineColor, uBiomeInkTint, 0.25) * 0.55;
  gl_FragColor = vec4(ink, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Create a BackSide inverted-hull crisp ink outline ShaderMaterial.
 */
export function createOutlineMaterial(
  thickness = 0.042,
  color: THREE.ColorRepresentation = 0x080712,
): THREE.ShaderMaterial {
  const outlineColor = new THREE.Color(color);

  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uThickness: { value: thickness },
      uGlobalThickness: SHARED_OUTLINE_UNIFORMS.uGlobalThickness,
      uOutlineEnabled: SHARED_OUTLINE_UNIFORMS.uOutlineEnabled,
      uBiomeInkTint: SHARED_OUTLINE_UNIFORMS.uBiomeInkTint,
      uOutlineColor: { value: outlineColor },
    },
    vertexShader: OUTLINE_VERTEX_SHADER,
    fragmentShader: OUTLINE_FRAGMENT_SHADER,
    side: THREE.BackSide,
    fog: true,
    depthWrite: true,
  });
}

/**
 * Computes a cloned BufferGeometry with position-welded smooth averaged normals
 * specifically for seamless inverted-hull ink outlines around stylized meshes.
 */
export function createSmoothOutlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const posAttr = source.getAttribute('position');
  if (!posAttr) return geo;

  const posCopy = new Float32Array(posAttr.array.length);
  posCopy.set(posAttr.array as Float32Array);
  geo.setAttribute('position', new THREE.BufferAttribute(posCopy, 3));

  if (source.index) {
    geo.setIndex(source.index.clone());
  }

  geo.computeVertexNormals();
  const normAttr = geo.getAttribute('normal');
  const count = posAttr.count;

  const accum = new Map<string, [number, number, number]>();
  const keys = new Array<string>(count);

  for (let i = 0; i < count; i++) {
    const qx = Math.round(posAttr.getX(i) * 500);
    const qy = Math.round(posAttr.getY(i) * 500);
    const qz = Math.round(posAttr.getZ(i) * 500);
    const key = `${qx},${qy},${qz}`;
    keys[i] = key;

    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const cur = accum.get(key);
    if (cur) {
      cur[0] += nx;
      cur[1] += ny;
      cur[2] += nz;
    } else {
      accum.set(key, [nx, ny, nz]);
    }
  }

  const smoothNormals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const sum = accum.get(keys[i]!)!;
    const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    smoothNormals[i * 3] = sum[0] / len;
    smoothNormals[i * 3 + 1] = sum[1] / len;
    smoothNormals[i * 3 + 2] = sum[2] / len;
  }

  geo.setAttribute('normal', new THREE.BufferAttribute(smoothNormals, 3));
  geo.computeBoundingSphere();
  return geo;
}

// ============================================================================
// MYTHIC PAINTERLY HADES SKY DOME (DRAMATIC CLOUDS, GOD RAYS, CONSTELLATIONS, ECLIPSE)
// ============================================================================

export function createSkyDomeMaterial(
  topColor: THREE.ColorRepresentation = 0x104088,
  midColor: THREE.ColorRepresentation = 0x2692c8,
  horizonColor: THREE.ColorRepresentation = 0x8ce2e8,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color(topColor) },
      uMidColor: { value: new THREE.Color(midColor) },
      uHorizonColor: { value: new THREE.Color(horizonColor) },
      uSunDir: SHARED_TOON_UNIFORMS.uSunDir,
      uSunColor: SHARED_TOON_UNIFORMS.uSunColor,
      uTime: SHARED_TOON_UNIFORMS.uTime,
      uDarkness: { value: 0.0 },
      uNightAmount: { value: 0.0 },
      /** 0=Forest, 1=Desert, 2=Graveyard (giant harvest moon), 3=FinalBossMap (eclipsed obsidian sun!) */
      uBiomeMode: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uTime;
      uniform float uDarkness;
      uniform float uNightAmount;
      uniform float uBiomeMode;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        v += smoothNoise(p) * 0.50;
        v += smoothNoise(p * 2.07 + vec2(3.7, 1.9)) * 0.27;
        v += smoothNoise(p * 4.21 - vec2(2.1, 4.3)) * 0.14;
        v += smoothNoise(p * 8.17 + vec2(6.4, -1.7)) * 0.09;
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        float lightKeep = clamp(1.0 - uDarkness, 0.0, 1.0);
        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(d, sunDir), 0.0);

        // 1. Rich painterly 3-stop mythic sky gradient + sunward scattering warmth
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.28, h));
        col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));

        // Atmospheric horizon mist & golden-hour directional scattering
        float horizonBand = exp(-abs(d.y - 0.02) * 8.5) * lightKeep;
        vec3 scatterCol = mix(uHorizonColor, uSunColor, 0.42 + 0.35 * pow(sunDot, 2.0));
        col += scatterCol * horizonBand * 0.32;

        // 2. Subtle cosmic nebula / aurora veil & refined natural starfield on night/twilight stages (ZERO grid dots!)
        if (uNightAmount > 0.08 && d.y > 0.02 && lightKeep > 0.05) {
          vec2 skyPlane = d.xz / (d.y + 0.38);
          // Painterly cosmic nebula band
          float nebA = fbm(skyPlane * 1.15 + vec2(0.4, uTime * 0.004));
          float nebB = fbm(skyPlane * 2.4 - vec2(1.8, -0.7));
          float nebulaMask = smoothstep(0.46, 0.82, nebA * 0.65 + nebB * 0.35) * smoothstep(0.06, 0.38, d.y);
          vec3 nebCol = uBiomeMode > 2.5
            ? mix(vec3(0.55, 0.12, 0.34), vec3(0.95, 0.48, 0.18), nebB)
            : mix(vec3(0.28, 0.18, 0.58), vec3(0.45, 0.72, 0.95), nebB);
          col += nebCol * nebulaMask * uNightAmount * 0.36 * lightKeep;

          // Delicate varied-scale pinpoint constellations with jittered positions (NEVER uniform dots!)
          vec2 starGrid = skyPlane * 34.0;
          vec2 cell = floor(starGrid);
          vec2 local = fract(starGrid);
          float rnd = hash21(cell);
          if (rnd > 0.945) {
            vec2 jitter = vec2(hash21(cell + 13.7), hash21(cell + 47.2)) * 0.68 + 0.16;
            float dist = length(local - jitter);
            float mag = pow((rnd - 0.945) / 0.055, 1.5);
            float radius = mix(0.035, 0.095, mag);
            float starCore = 1.0 - smoothstep(radius * 0.25, radius, dist);
            float twinkle = 0.68 + 0.32 * sin(uTime * (1.8 + rnd * 4.5) + rnd * 55.0);
            float starFade = smoothstep(0.08, 0.34, d.y);
            vec3 starCol = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.92, 0.78), hash21(cell + 91.1));
            col += starCol * starCore * (0.35 + 0.75 * mag) * twinkle * starFade * uNightAmount * lightKeep;
          }
        }

        // 3. Stylized Celestial Centerpiece (clean warm desert sun, cratered harvest moon, crimson volcanic boss sky!)
        vec3 sunRight = normalize(cross(vec3(0.0, 1.0, 0.0), sunDir));
        vec3 sunUp = cross(sunDir, sunRight);
        vec2 sunLocal = vec2(dot(d, sunRight), dot(d, sunUp));

        if (uBiomeMode > 2.5) {
          // FINAL BOSS SKY: Blazing scarlet-crimson sky with swirling dark volcanic cloud bands!
          float corona = pow(sunDot, 10.0) * 0.42 + pow(sunDot, 36.0) * 0.62;
          float eclipseCore = smoothstep(0.985, 0.990, sunDot);
          col += vec3(1.25, 0.34, 0.12) * corona * lightKeep;
          col = mix(col, vec3(0.18, 0.02, 0.03), eclipseCore * 0.85 * lightKeep);
        } else if (uBiomeMode > 1.5 && uBiomeMode < 2.5) {
          // GRAVEYARD: Giant pale silver-violet Harvest Moon!
          float moonHalo = pow(sunDot, 12.0) * 0.28 + pow(sunDot, 38.0) * 0.36;
          float moonDisc = smoothstep(0.980, 0.984, sunDot) * lightKeep;
          float crater = fbm(sunLocal * 20.0 + vec2(2.4, -1.1));
          vec3 moonSurf = mix(vec3(0.78, 0.76, 0.92), vec3(1.06, 1.04, 1.12), smoothstep(0.36, 0.66, crater));
          col += vec3(0.68, 0.58, 0.95) * moonHalo * lightKeep;
          col = mix(col, moonSurf, moonDisc);
        } else if (uBiomeMode > 0.5 && uBiomeMode < 1.5) {
          // DESERT: Large warm pale sunlit desert disc glowing softly through golden haze!
          float wideGlow = pow(sunDot, 4.0) * 0.26 * lightKeep;
          float sunHalo = pow(sunDot, 18.0) * 0.44 * lightKeep;
          float sunDisc = smoothstep(0.986, 0.990, sunDot) * lightKeep;
          col += uSunColor * (wideGlow + sunHalo);
          col = mix(col, vec3(1.18, 1.14, 0.98), sunDisc);
        } else {
          // FOREST: Clean atmospheric sun glow
          float sunHalo = pow(sunDot, 18.0) * 0.30 * lightKeep;
          float sunDisc = smoothstep(0.992, 0.9945, sunDot) * lightKeep;
          col += uSunColor * sunHalo;
          col = mix(col, vec3(1.18, 1.14, 0.98), sunDisc);
        }

        // 4. Bold Stylized Painterly Flat-Cel Cloud Cutouts (crisp graphic sky silhouettes!)
        if (d.y > 0.025 && lightKeep > 0.05) {
          vec2 uvC = d.xz / (d.y + 0.32) * 0.72;
          uvC.x += uTime * 0.008;
          uvC.y += uTime * 0.0025;
          float cShape = fbm(uvC);
          float cDetail = fbm(uvC * 2.1 + vec2(4.2, -2.7));
          float cloudDensity = cShape * 0.74 + cDetail * 0.26;

          float elevFade = smoothstep(0.03, 0.16, d.y) * (1.0 - smoothstep(0.72, 0.96, d.y));
          // Crisp graphic cel-cutout cloud edges!
          float cloudBandA = smoothstep(0.48, 0.515, cloudDensity) * elevFade;
          float cloudBandB = smoothstep(0.57, 0.605, cloudDensity) * elevFade;

          vec3 cloudColA;
          vec3 cloudColB;
          if (uBiomeMode > 2.5) {
            // Blazing dark-crimson swirling storm clouds over red boss sky!
            cloudColA = vec3(0.46, 0.06, 0.06);
            cloudColB = vec3(0.28, 0.03, 0.04);
          } else if (uBiomeMode > 0.5 && uBiomeMode < 1.5) {
            // Warm cream-peach desert clouds
            cloudColA = mix(uMidColor, vec3(1.0, 0.95, 0.80), 0.45);
            cloudColB = mix(uHorizonColor, vec3(1.0, 0.98, 0.88), 0.62);
          } else {
            // Crisp cyan-teal / violet layered stylized sky clouds
            cloudColA = mix(uMidColor, uHorizonColor, 0.52);
            cloudColB = mix(uHorizonColor, vec3(0.86, 0.95, 0.98), 0.42 - uNightAmount * 0.28);
          }
          col = mix(col, cloudColA, cloudBandA * (uBiomeMode > 2.5 ? 0.72 : 0.62) * lightKeep);
          col = mix(col, cloudColB, cloudBandB * (uBiomeMode > 2.5 ? 0.76 : 0.68) * lightKeep);
        }

        // 5. Atmospheric Smooth Distant Mountain/Hill Horizon Silhouettes!
        if (d.y < 0.22) {
          float az = atan(d.z, d.x);
          float ridgeFar;
          float ridgeNear;
          if (uBiomeMode > 2.5) {
            ridgeFar = 0.062 + pow(abs(sin(az * 7.0 + 0.5)), 2.5) * 0.055 + sin(az * 17.0) * 0.012;
            ridgeNear = 0.034 + pow(abs(cos(az * 11.0 - 0.8)), 3.0) * 0.038;
          } else if (uBiomeMode > 0.5 && uBiomeMode < 1.5) {
            float mesa = floor((sin(az * 5.0 + 0.4) * 0.5 + 0.5) * 3.0) * 0.022;
            ridgeFar = 0.036 + mesa + sin(az * 9.0) * 0.012;
            ridgeNear = 0.022 + sin(az * 10.0 + 1.3) * 0.012;
          } else {
            // Sweeping atmospheric distant hills (matches iconic teal & violet forested horizons!)
            ridgeFar = 0.072 + sin(az * 4.0 + 0.7) * 0.036 + sin(az * 9.0 - 1.2) * 0.018;
            ridgeNear = 0.038 + cos(az * 7.0 + 2.1) * 0.022 + sin(az * 13.0 + 0.4) * 0.010;
          }

          float farMask = 1.0 - smoothstep(ridgeFar - 0.005, ridgeFar + 0.005, d.y);
          float nearMask = 1.0 - smoothstep(ridgeNear - 0.004, ridgeNear + 0.004, d.y);
          vec3 farCol = mix(uHorizonColor, uTopColor, 0.58) * 0.62;
          vec3 nearCol = mix(uHorizonColor, uTopColor, 0.74) * 0.42;
          col = mix(col, farCol, farMask * 0.72 * lightKeep);
          col = mix(col, nearCol, nearMask * 0.82 * lightKeep);
        }

        // Smooth darkness veil for Big Bob Darkness / Blind challenge
        col = mix(col, vec3(0.015, 0.011, 0.028), clamp(uDarkness * 0.94, 0.0, 0.96));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}
