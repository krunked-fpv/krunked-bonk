/**
 * KRUNKEDBONK — MK-Toon Gooch/Cel Material & Inverted-Hull Ink Outline Shaders
 *
 * Implements the iconic stylized low-poly cel-shaded visual signature:
 * - 2- or 3-band crisp stepped cel lighting
 * - Gooch warm-highlight / cool-shadow color shift (cool indigo/teal shadows, never muddy black)
 * - Crisp Fresnel rim-light edge pop
 * - NearestFilter procedural pixel-palette texture sampling + vertex/instance color support
 * - Hit-flash white uniform + emissive glow + GPU vertex wind sway (for instanced grass/foliage)
 * - Full Three.js FogExp2 atmospheric distance fog
 * - Smooth distance-scaled BackSide inverted-hull black ink outlines (#0b0d14)
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
    float phase = uTime * 2.55 + worldPos4.x * 0.24 + worldPos4.z * 0.19;
    float gust = sin(phase) * 0.65 + sin(phase * 1.93 + 1.1) * 0.35;
    float sway = gust * uWindStrength * bend;
    worldPos4.x += uWindDir.x * sway;
    worldPos4.z += uWindDir.y * sway;
    worldPos4.y -= abs(sway) * 0.14;
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
    // Keep upward-biased vertex normals on both sides of wind-swayed foliage/grass
    if (!gl_FrontFacing && uWindStrength < 0.0001) N = -N;
  }

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  // Sample crisp NearestFilter pixel texture if bound
  vec3 albedo = uBaseColor * vTintColor;
  if (uHasMap > 0.5) {
    vec4 texel = texture2D(uMap, vUv);
    if (texel.a < 0.1) discard;
    albedo *= mix(vec3(1.0), texel.rgb, uMapStrength);
  }

  // Half-Lambert N dot L for vibrant stylized readability
  float ndl = dot(N, L);
  float halfLambert = ndl * 0.5 + 0.5;

  // Stepped 2-band or 3-band MK-Toon quantization with crisp micro-AA edge
  float cel;
  if (uCelBands < 2.5) {
    cel = smoothstep(0.47, 0.51, halfLambert);
  } else {
    float band1 = smoothstep(0.36, 0.40, halfLambert) * 0.52;
    float band2 = smoothstep(0.66, 0.70, halfLambert) * 0.48;
    cel = band1 + band2;
  }

  // Gooch cool-shadow -> rich midtone -> warm-highlight shift (zero muddy blacks!)
  vec3 coolShadow = albedo * uShadowTint * (0.68 + 0.32 * uAmbientColor);
  vec3 warmLit = albedo * mix(uSunColor, uHighlightTint, 0.45) * 1.12;
  vec3 litColor = mix(coolShadow, warmLit, cel);

  // Subtle hemisphere bounce keeps upward facets crisp and downward facets cool-teal
  float hemiFactor = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 hemiBounce = mix(uGroundTint, uSkyTint, hemiFactor) * albedo * 0.16;
  litColor += hemiBounce;

  // Stylized crisp cel-specular glint for metallic/ice/slime/weapon surfaces
  if (uGloss > 0.01) {
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float spec = smoothstep(0.86, 0.90, ndh) * uGloss;
    litColor += uHighlightTint * spec * 0.65;
  }

  // Crisp stylized Fresnel rim-light edge pop
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, uRimPower);
  float sunGate = smoothstep(-0.25, 0.45, ndl) * 0.72 + 0.28;
  float rimStep = smoothstep(uRimThreshold, uRimThreshold + 0.09, fresnel * sunGate);
  litColor += uRimColor * rimStep * uRimStrength;

  // Emissive accents (glowing runes, eyes, fireballs, portal energy)
  litColor += uEmissive * uEmissiveIntensity;

  // Crisp arcade white-yellow hit-flash override
  if (uHitFlash > 0.001) {
    litColor = mix(litColor, vec3(1.0, 0.98, 0.90), clamp(uHitFlash, 0.0, 1.0));
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

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MK_TOON_VERTEX_SHADER,
    fragmentShader: MK_TOON_FRAGMENT_SHADER,
    fog: true,
    transparent: options.transparent ?? false,
    depthWrite: options.depthWrite ?? !(options.transparent ?? false),
    side: options.side ?? THREE.FrontSide,
    vertexColors: options.vertexColors ?? false,
  });

  return mat;
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

  // Distance-compensated crisp ink thickness: razor-crisp close up, readable mid-range,
  // smoothly tapered far out so distant props never turn into black blobs.
  float distScale = clamp(0.45 + camDist * 0.048, 0.55, 2.25);
  float farFade = 1.0 - smoothstep(95.0, 165.0, camDist);
  float finalExtrude = uThickness * uGlobalThickness * distScale * farFade * uOutlineEnabled;

  worldPos.xyz += worldNormal * finalExtrude;

  vec4 mvPosition = viewMatrix * worldPos;
  // Tiny view-Z offset prevents corner z-fighting on sharp low-poly facets
  mvPosition.z -= 0.004 * uOutlineEnabled;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uOutlineColor;
uniform float uOutlineEnabled;

void main() {
  if (uOutlineEnabled < 0.5) discard;
  gl_FragColor = vec4(uOutlineColor, 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Create a BackSide inverted-hull crisp black ink outline ShaderMaterial.
 */
export function createOutlineMaterial(
  thickness = 0.048,
  color: THREE.ColorRepresentation = 0x0b0d14,
): THREE.ShaderMaterial {
  const outlineColor = new THREE.Color(color);

  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uThickness: { value: thickness },
      uGlobalThickness: SHARED_OUTLINE_UNIFORMS.uGlobalThickness,
      uOutlineEnabled: SHARED_OUTLINE_UNIFORMS.uOutlineEnabled,
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
 * Eliminates cracked corners completely while keeping the main mesh crisp & faceted!
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

  // First compute flat/face normals as baseline
  geo.computeVertexNormals();
  const normAttr = geo.getAttribute('normal');
  const count = posAttr.count;

  // Accumulate normals by quantized spatial vertex position so shared hard edges weld seamlessly
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

/**
 * Stylized Sky Dome gradient material with crisp sun disc and retro faceted cloud bands.
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
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);

        // Stylized multi-stop azure -> turquoise sky gradient
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.32, h));
        col = mix(col, uTopColor, smoothstep(0.28, 0.85, h));

        // Crisp pixelated cel cloud puffs drifting high in the sky
        if (d.y > 0.08) {
          vec2 cloudUv = d.xz / (d.y + 0.35);
          cloudUv.x += uTime * 0.012;
          // Quantize UVs slightly for subtle retro pixel feel
          vec2 qUv = floor(cloudUv * 18.0) / 18.0;
          float n1 = sin(qUv.x * 2.4 + cos(qUv.y * 2.1)) * cos(qUv.y * 1.9 - qUv.x * 0.7);
          float n2 = sin(qUv.x * 5.2 - qUv.y * 4.3) * 0.35;
          float cloudMask = smoothstep(0.46, 0.50, n1 + n2) * smoothstep(0.08, 0.28, d.y) * (1.0 - smoothstep(0.65, 0.92, d.y));
          col = mix(col, mix(vec3(0.95, 0.98, 1.0), uSunColor, 0.25), cloudMask * 0.55);
        }

        // Crisp stylized arcade sun disc + warm halo
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        float sunHalo = pow(sunDot, 16.0) * 0.32;
        float sunDisc = smoothstep(0.9945, 0.9965, sunDot);
        col += uSunColor * sunHalo;
        col = mix(col, vec3(1.0, 0.99, 0.92), sunDisc);

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
