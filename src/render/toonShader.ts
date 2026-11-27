/**
 * KRUNKEDBONK — MK-Toon Gooch/Cel, Triplanar Terrain, Energy Glow, Sky Dome & Outline Shaders
 *
 * Delivers a cohesive stylized low-poly cel-shaded aesthetic:
 * - 2- or 3-band crisp stepped cel lighting with Gooch warm-highlight / cool-shadow color shift
 * - Hemisphere sky/ground bounce + upward-cavity AO + crisp stylized Fresnel rim-light pop
 * - Dedicated MK-Toon Terrain Shader with slope-blended triplanar cliff projection,
 *   anti-tiling world-space macro detail, contour edge highlights, and crisp FinalBossMap inlays
 * - Soft-fading Fresnel Energy Beam & Shockwave Ring shaders (zero harsh opaque cylinders)
 * - Stylized multi-layered Sky Dome with smooth cel-shaded clouds, atmospheric horizon haze,
 *   distant mountain/citadel horizon silhouette, twinkling stars, and stylized sun/moon halo
 * - Distance-scaled, biome-harmonized BackSide inverted-hull ink outlines
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

/**
 * Shared global shader uniforms referenced by all MK-Toon and Outline materials.
 * Updating these mutates every active material in O(1) with ZERO allocations.
 */
export const SHARED_TOON_UNIFORMS = {
  uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.35).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.96, 0.84) },
  uAmbientColor: { value: new THREE.Color(0.75, 0.75, 0.75) },
  uShadowTint: { value: new THREE.Color(0.22, 0.31, 0.56) },
  uHighlightTint: { value: new THREE.Color(1.0, 0.96, 0.84) },
  uSkyTint: { value: new THREE.Color(0.24, 0.72, 0.88) },
  uGroundTint: { value: new THREE.Color(0.18, 0.38, 0.32) },
  uCelBands: { value: 3.0 },
  uTime: { value: 0.0 },
  uWindDir: { value: new THREE.Vector2(0.84, 0.54) },
};

export const SHARED_OUTLINE_UNIFORMS = {
  uGlobalThickness: { value: 1.0 },
  uOutlineEnabled: { value: 1.0 },
  uBiomeInkTint: { value: new THREE.Color(0x0d1220) },
};

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
}

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

void main() {
  vUv = uv * uUvScale;

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
    float phase = uTime * 2.4 + worldPos4.x * 0.21 + worldPos4.z * 0.17;
    float wave = sin(phase) * 0.62 + sin(phase * 1.85 + 1.3) * 0.28 + cos(uTime * 0.8 + worldPos4.x * 0.06) * 0.18;
    float sway = wave * uWindStrength * bend;
    worldPos4.x += uWindDir.x * sway;
    worldPos4.z += uWindDir.y * sway;
    worldPos4.y -= abs(sway) * 0.16;
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

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vTintColor;

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

  // Half-Lambert N dot L for stylized cel readability
  float ndl = dot(N, L);
  float halfLambert = ndl * 0.5 + 0.5;

  // Stepped 2-band or 3-band MK-Toon quantization with crisp micro-AA edge
  float cel;
  if (uCelBands < 2.5) {
    cel = smoothstep(0.46, 0.51, halfLambert);
  } else {
    float band1 = smoothstep(0.34, 0.39, halfLambert) * 0.50;
    float band2 = smoothstep(0.65, 0.70, halfLambert) * 0.50;
    cel = band1 + band2;
  }

  // Rich Gooch cool-shadow -> vibrant midtone -> warm-highlight shift (never muddy black)
  vec3 coolShadow = albedo * uShadowTint * (0.72 + 0.28 * uAmbientColor);
  vec3 midTone = albedo * mix(uAmbientColor, uSunColor, 0.45) * 1.04;
  vec3 warmLit = albedo * mix(uSunColor, uHighlightTint, 0.48) * 1.16;
  vec3 litColor = cel < 0.5
    ? mix(coolShadow, midTone, cel * 2.0)
    : mix(midTone, warmLit, (cel - 0.5) * 2.0);

  // Subtle hemisphere sky/ground bounce for crisp 3D volume separation
  float hemiFactor = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 hemiBounce = mix(uGroundTint, uSkyTint, hemiFactor) * albedo * 0.18;
  litColor += hemiBounce;

  // Stylized cel-specular glint for armor, ice, slime, blades & gems
  if (uGloss > 0.01) {
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float spec = smoothstep(0.84, 0.89, ndh) * uGloss;
    litColor += uHighlightTint * spec * 0.72;
  }

  // Crisp Fresnel rim-light edge pop harmonizing with sun + sky
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, uRimPower);
  float sunGate = smoothstep(-0.28, 0.48, ndl) * 0.74 + 0.26;
  float rimStep = smoothstep(uRimThreshold, uRimThreshold + 0.09, fresnel * sunGate);
  vec3 rimTint = mix(uRimColor, uSkyTint * 1.35 + vec3(0.15), 0.25);
  litColor += rimTint * rimStep * uRimStrength;

  // Emissive accents
  litColor += uEmissive * uEmissiveIntensity;

  // Crisp arcade white-gold hit-flash override
  if (uHitFlash > 0.001) {
    litColor = mix(litColor, vec3(1.0, 0.98, 0.88), clamp(uHitFlash, 0.0, 1.0));
  }

  gl_FragColor = vec4(litColor, uOpacity);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Create a custom MK-Toon Gooch/Cel ShaderMaterial referencing global lighting uniforms.
 */
export function createMkToonMaterial(options: MkToonMaterialOptions = {}): THREE.ShaderMaterial {
  const baseColor = new THREE.Color(options.color ?? 0xffffff);
  const rimColor = new THREE.Color(options.rimColor ?? 0xd8f8ff);
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
    uWindStrength: { value: options.windStrength ?? 0.0 },
    uRimColor: { value: rimColor },
    uRimStrength: { value: options.rimStrength ?? 0.34 },
    uRimPower: { value: options.rimPower ?? 2.8 },
    uRimThreshold: { value: options.rimThreshold ?? 0.42 },
    uEmissive: { value: emissive },
    uEmissiveIntensity: { value: options.emissiveIntensity ?? 0.0 },
    uHitFlash: { value: 0.0 },
    uOpacity: { value: options.opacity ?? 1.0 },
    uGloss: { value: options.gloss ?? 0.0 },
    uFlatShading: { value: options.flatShading ? 1.0 : 0.0 },
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
// DEDICATED MK-TOON TERRAIN SHADER (SLOPE-BLENDED TRIPLANAR CLIFFS + MACRO NOISE)
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

// Smooth procedural macro-noise to eliminate repetitive texture tiling across wide arenas
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

void main() {
  // Crisp faceted low-poly face normal via derivatives blended lightly with vertex normal
  vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (!gl_FrontFacing) flatN = -flatN;
  vec3 N = normalize(mix(normalize(vWorldNormal), flatN, 0.78));

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  // World-space crisp ground UV (3.6m per 64x64 pixel tile -> fine detailed pixel art!)
  vec2 groundUv = vWorldPos.xz * 0.275;
  vec3 groundTex = uHasMap > 0.5 ? texture2D(uMap, groundUv).rgb : vec3(1.0);

  // Triplanar cliff projection so steep rock faces show horizontal geological strata, ZERO stretching!
  vec3 absN = abs(N);
  vec2 cliffUv = absN.x > absN.z
    ? vec2(vWorldPos.z * 0.22, vWorldPos.y * 0.22)
    : vec2(vWorldPos.x * 0.22, vWorldPos.y * 0.22);
  vec3 cliffTex = uHasCliffMap > 0.5 ? texture2D(uCliffMap, cliffUv).rgb : groundTex;

  // Slope mask: 0 = flat walkable plateau, 1 = steep cliff wall
  float slopeMask = smoothstep(0.72, 0.90, 1.0 - clamp(N.y, 0.0, 1.0));
  vec3 detailTex = mix(groundTex, cliffTex, slopeMask);

  // Subtle world-space macro biome patches (sunlit clearings / wind-swept dunes / moss patches)
  float macro1 = valueNoise(vWorldPos.xz * 0.045);
  float macro2 = valueNoise(vWorldPos.xz * 0.13 + vec2(17.3, 9.1));
  float macroShade = 0.91 + macro1 * 0.14 + (macro2 - 0.5) * 0.06;

  vec3 albedo = uBaseColor * vTintColor * mix(vec3(1.0), detailTex, 0.46) * macroShade;

  // Crisp analytical details per biome (zero jagged vertex-aliasing!)
  vec3 extraEmissive = vec3(0.0);
  if (uBiomeMode > 2.5) {
    // FinalBossMap: Razor-sharp glowing gold concentric rings + 11 radial rune spokes!
    float r = length(vWorldPos.xz);
    float ringDist = min(
      min(abs(r - 22.0), abs(r - 48.0)),
      min(abs(r - 76.0), abs(r - (uArenaRadius - 4.0)))
    );
    float goldRing = 1.0 - smoothstep(0.45, 0.85, ringDist);
    float innerTrim = 1.0 - smoothstep(0.12, 0.26, abs(ringDist - 1.15));
    float ang = atan(vWorldPos.z, vWorldPos.x);
    float spokeWave = abs(sin(ang * 11.0));
    float spokeMask = (1.0 - smoothstep(0.02, 0.055, spokeWave)) * step(18.0, r) * step(r, uArenaRadius - 5.0);
    float inlay = clamp(goldRing + innerTrim * 0.65 + spokeMask * 0.55, 0.0, 1.0);
    vec3 goldCol = vec3(0.98, 0.78, 0.24);
    albedo = mix(albedo, goldCol, inlay * 0.78);
    extraEmissive += goldCol * (goldRing * 0.22 + innerTrim * 0.12) * (0.85 + 0.15 * sin(uTime * 2.5 - r * 0.15));

    // Molten edge glow near arena chasm rim
    float edgeGlow = smoothstep(uArenaRadius - 5.5, uArenaRadius + 1.0, r);
    extraEmissive += vec3(1.0, 0.28, 0.12) * edgeGlow * (0.45 + 0.15 * sin(uTime * 3.5 + ang * 4.0));
  } else if (uBiomeMode > 0.5 && uBiomeMode < 1.5) {
    // Desert: Crisp wind-carved sand dune micro-ripples on flat slopes
    float ripple = sin(vWorldPos.x * 1.15 + vWorldPos.z * 0.65 + sin(vWorldPos.z * 0.18) * 3.5);
    float rippleBand = smoothstep(-0.15, 0.35, ripple) * (1.0 - slopeMask);
    albedo *= (0.955 + rippleBand * 0.085);
  } else if (uBiomeMode > 1.5 && uBiomeMode < 2.5) {
    // Graveyard: Subtle moonlit flagstone avenue border bevels
    vec2 cell = abs(fract((vWorldPos.xz + 10.0) / 20.0) - 0.5) * 20.0;
    float edgeDist = min(abs(cell.x - 2.3), abs(cell.y - 2.3));
    float curb = (1.0 - smoothstep(0.15, 0.38, edgeDist)) * (1.0 - slopeMask);
    albedo = mix(albedo, albedo * 1.28, curb * 0.45);
  } else {
    // Forest: Subtle sunlit cliff-lip highlight where grass overhangs cliff edges
    float cliffLip = smoothstep(0.28, 0.52, 1.0 - clamp(N.y, 0.0, 1.0)) * (1.0 - slopeMask);
    albedo = mix(albedo, albedo * 1.14, cliffLip * 0.55);
  }

  // MK-Toon Stepped Cel Lighting + Gooch warm/cool color ramp
  float ndl = dot(N, L);
  float halfLambert = ndl * 0.5 + 0.5;
  float cel;
  if (uCelBands < 2.5) {
    cel = smoothstep(0.45, 0.52, halfLambert);
  } else {
    float band1 = smoothstep(0.32, 0.39, halfLambert) * 0.50;
    float band2 = smoothstep(0.64, 0.71, halfLambert) * 0.50;
    cel = band1 + band2;
  }

  vec3 coolShadow = albedo * uShadowTint * (0.76 + 0.24 * uAmbientColor);
  vec3 midTone = albedo * mix(uAmbientColor, uSunColor, 0.42) * 1.03;
  vec3 warmLit = albedo * mix(uSunColor, uHighlightTint, 0.45) * 1.13;
  vec3 litColor = cel < 0.5
    ? mix(coolShadow, midTone, cel * 2.0)
    : mix(midTone, warmLit, (cel - 0.5) * 2.0);

  // Subtle hemisphere bounce
  float hemiFactor = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  litColor += mix(uGroundTint, uSkyTint, hemiFactor) * albedo * 0.14;

  // Grazing stylized terrain rim sheen on hillcrests
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 3.4);
  float rimStep = smoothstep(0.46, 0.58, fresnel * (smoothstep(-0.2, 0.5, ndl) * 0.7 + 0.3));
  litColor += uRimColor * rimStep * uRimStrength;

  // Emissive (Floor-is-Lava + Citadel runes)
  litColor += uEmissive * uEmissiveIntensity + extraEmissive;

  gl_FragColor = vec4(litColor, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
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
// SOFT-FADING FRESNEL ENERGY BEAM & SHOCKWAVE RING SHADERS (ADDITIVE ARCADE VFX)
// ============================================================================

export function createEnergyBeamMaterial(
  color: THREE.ColorRepresentation = 0x5cf7ff,
  opacity = 0.68,
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
        // Core-bright, edge-feathered radial falloff (eliminates hard PVC-pipe cylinder edges!)
        float core = pow(abs(dot(N, V)), 1.35);
        // Smooth vertical fade at bottom and far top of light pillar
        float vFade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.42, 1.0, vUv.y));
        // Subtle rising energy bands
        float band = 0.82 + 0.18 * sin(vUv.y * 22.0 - uTime * 11.0);
        vec3 col = mix(uColor * vInstColor, vec3(1.0), core * 0.45) * band;
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
  opacity = 0.85,
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
      varying vec2 vLocalXZ;
      varying vec3 vInstColor;
      void main() {
        float r = length(vLocalXZ);
        // Ring geometry spans ~[0.68..1.0]; bright razor outer crest fading inward
        float outerEdge = 1.0 - smoothstep(0.93, 1.0, r);
        float innerTail = smoothstep(0.68, 0.94, r);
        float crest = smoothstep(0.84, 0.95, r) * outerEdge;
        vec3 baseCol = uColor * vInstColor;
        vec3 col = mix(baseCol, vec3(1.0, 0.99, 0.94), crest * 0.55);
        float alpha = innerTail * outerEdge * uOpacity;
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
 * Generates a smooth radial-gradient ground contact shadow texture (zero external files).
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
      // Soft painterly cel-grounded disc (dense inner core + smooth feathered rim)
      const alpha = Math.pow(t, 1.65) * 0.72 + (r < 0.58 ? 0.18 * (1 - r / 0.58) : 0);
      const idx = (y * size + x) * 4;
      data[idx] = 10;
      data[idx + 1] = 15;
      data[idx + 2] = 28;
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

  // Crisp subtle ink close-up, clear silhouette mid-range, smoothly faded in distance
  float distScale = clamp(0.42 + camDist * 0.042, 0.50, 1.95);
  float farFade = 1.0 - smoothstep(82.0, 148.0, camDist);
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
  vec3 ink = mix(uOutlineColor, uBiomeInkTint, 0.52);
  gl_FragColor = vec4(ink, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Create a BackSide inverted-hull crisp ink outline ShaderMaterial.
 */
export function createOutlineMaterial(
  thickness = 0.044,
  color: THREE.ColorRepresentation = 0x0d1220,
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
 * specifically for seamless inverted-hull ink outlines around flat-shaded low-poly meshes.
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
// STYLIZED CEL SKY DOME (SMOOTH CEL CLOUDS, HORIZON SILHOUETTE, STARS & SUN/MOON)
// ============================================================================

/**
 * Stylized Sky Dome gradient material with smooth 2-tone cel-shaded drifting clouds,
 * atmospheric horizon haze, distant layered mountain silhouette, twinkling stars for
 * twilight/night stages, and crisp stylized sun/moon halo.
 */
export function createSkyDomeMaterial(
  topColor: THREE.ColorRepresentation = 0x1686e0,
  midColor: THREE.ColorRepresentation = 0x26b0db,
  horizonColor: THREE.ColorRepresentation = 0x007a9e,
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

      float cloudFbm(vec2 p) {
        float v = 0.0;
        v += smoothNoise(p) * 0.56;
        v += smoothNoise(p * 2.12 + vec2(3.7, 1.9)) * 0.28;
        v += smoothNoise(p * 4.35 - vec2(2.1, 4.3)) * 0.16;
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        float lightKeep = clamp(1.0 - uDarkness, 0.0, 1.0);

        // Rich atmospheric multi-stop sky gradient
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.30, h));
        col = mix(col, uTopColor, smoothstep(0.24, 0.84, h));

        // Subtle warm atmospheric horizon bloom band
        float horizonGlow = exp(-abs(d.y) * 9.5) * lightKeep;
        col += mix(uHorizonColor, uSunColor, 0.45) * horizonGlow * 0.24;

        // Crisp twinkling starfield on Twilight, Graveyard & FinalBoss stages!
        if (uNightAmount > 0.05 && d.y > 0.04 && lightKeep > 0.05) {
          vec2 starUv = d.xz / (d.y + 0.45) * 48.0;
          vec2 cell = floor(starUv);
          vec2 f = fract(starUv) - 0.5;
          float rnd = hash21(cell);
          if (rnd > 0.955) {
            float twinkle = 0.6 + 0.4 * sin(uTime * (2.5 + rnd * 6.0) + rnd * 40.0);
            float starDot = 1.0 - smoothstep(0.08, 0.24, length(f));
            float starFade = smoothstep(0.06, 0.30, d.y);
            col += vec3(0.95, 0.97, 1.0) * starDot * twinkle * starFade * uNightAmount * lightKeep * 0.9;
          }
        }

        // Smooth stylized 2-tone cel-shaded drifting clouds (ZERO jagged stair-step artifacts!)
        if (d.y > 0.05 && lightKeep > 0.05) {
          vec2 uv1 = d.xz / (d.y + 0.36) * 0.95;
          uv1.x += uTime * 0.011;
          uv1.y += uTime * 0.004;
          float c1 = cloudFbm(uv1);
          float cShadow = cloudFbm(uv1 + vec2(0.14, 0.09));

          float horizonFade = smoothstep(0.06, 0.26, d.y) * (1.0 - smoothstep(0.72, 0.96, d.y));
          float cloudAlpha = smoothstep(0.54, 0.60, c1) * horizonFade;
          float litBand = smoothstep(0.58, 0.65, c1 - (cShadow - c1) * 0.45);

          vec3 cloudShadowCol = mix(uMidColor, uHorizonColor, 0.5) * 0.86 + vec3(0.14, 0.16, 0.22);
          vec3 cloudLitCol = mix(vec3(0.96, 0.98, 1.0), uSunColor, 0.34);
          // Slightly moodier clouds at night/twilight
          cloudLitCol = mix(cloudLitCol, mix(uMidColor, uSunColor, 0.45) * 1.15, uNightAmount * 0.55);
          vec3 cloudCol = mix(cloudShadowCol, cloudLitCol, litBand);

          col = mix(col, cloudCol, cloudAlpha * (0.72 - uNightAmount * 0.25) * lightKeep);
        }

        // Stylized crisp sun/moon disc + multi-tier atmospheric halo
        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(d, sunDir), 0.0);
        float wideGlow = pow(sunDot, 5.0) * 0.18 * lightKeep;
        float sunHalo = pow(sunDot, 22.0) * 0.38 * lightKeep;
        float sunRing = smoothstep(0.986, 0.991, sunDot) * (1.0 - smoothstep(0.994, 0.997, sunDot)) * 0.28 * lightKeep;
        float sunDisc = smoothstep(0.9942, 0.9958, sunDot) * lightKeep;
        col += uSunColor * (wideGlow + sunHalo + sunRing);
        col = mix(col, vec3(1.0, 0.99, 0.93), sunDisc);

        // Distant layered horizon mountain / mesa / citadel ridge silhouette for world depth!
        if (d.y < 0.16) {
          float az = atan(d.z, d.x);
          float ridgeFar = 0.048 + sin(az * 5.0 + 0.7) * 0.022 + sin(az * 11.0 - 1.2) * 0.012 + cos(az * 19.0) * 0.006;
          float ridgeNear = 0.026 + cos(az * 7.0 + 2.1) * 0.015 + sin(az * 15.0 + 0.4) * 0.008;
          float farMask = 1.0 - smoothstep(ridgeFar - 0.004, ridgeFar + 0.004, d.y);
          float nearMask = 1.0 - smoothstep(ridgeNear - 0.003, ridgeNear + 0.003, d.y);
          vec3 farCol = mix(uHorizonColor, uTopColor, 0.28) * 0.78;
          vec3 nearCol = mix(uHorizonColor, uTopColor, 0.42) * 0.62;
          col = mix(col, farCol, farMask * 0.42 * lightKeep);
          col = mix(col, nearCol, nearMask * 0.56 * lightKeep);
        }

        // Smooth darkness veil for Big Bob Darkness / Blind challenge
        col = mix(col, vec3(0.018, 0.014, 0.032), clamp(uDarkness * 0.92, 0.0, 0.95));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}
