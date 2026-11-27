/**
 * KRUNKEDBONK — Built-In Procedural Low-Poly Asset Pack
 *
 * Implements IAssetPack with:
 * - Razor-sharp NearestFilter procedural pixel-palette DataTextures (works in browser & Node!)
 * - Chunky faceted articulated low-poly 3D rigs with seamless inverted-hull ink outlines
 *   for all 4 Wave 1 Flagship characters (Fox, Calcium, SirOofie, Megachad) + all 21 fallbacks
 * - Distinct iconic low-poly silhouettes for Forest enemies, Minibosses, Lil Bark (EntStage1),
 *   and Ghosts / Spooky Steve
 * - Stylized Forest trees, rocks, shrines, chests, pots, BossSpawner, BossPortal, rails, jump pads
 * - Distinct weapon projectile & pickup low-poly meshes
 */

import * as THREE from 'three';
import type {
  CharacterId,
  CustomPackFileEntry,
  IAssetPack,
  InteractableKind,
  InteractableVariant,
  PackManifest,
} from '../contracts/index';
import {
  createMkToonMaterial,
  createOutlineMaterial,
  createSmoothOutlineGeometry,
} from '../render/toonShader';

// ============================================================================
// DETERMINISTIC PIXEL TEXTURE GENERATOR (THREE.NearestFilter, ZERO BLUR)
// ============================================================================

function hash2D(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function makePixelDataTexture(
  width: number,
  height: number,
  painter: (x: number, y: number, w: number, h: number) => number,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hex = painter(x, y, width, height);
      const idx = (y * width + x) * 4;
      data[idx] = (hex >> 16) & 255;
      data[idx + 1] = (hex >> 8) & 255;
      data[idx + 2] = hex & 255;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export type ProceduralTextureId =
  | 'terrain_grass'
  | 'terrain_cliff'
  | 'terrain_desert'
  | 'terrain_graveyard'
  | 'terrain_citadel'
  | 'bark_grain'
  | 'foliage_pine'
  | 'foliage_oak'
  | 'shrine_rune'
  | 'chest_wood'
  | 'rail_energy'
  | 'portal_swirl'
  | 'character_palette'
  | 'stone_golem'
  | 'bone_ivory'
  | 'slime_gel'
  | 'ceramic_pot'
  | 'jump_pad';

function buildAllProceduralTextures(): Record<ProceduralTextureId, THREE.DataTexture> {
  return {
    // Lush vibrant dithered Forest grass tile with micro blades and subtle clover flecks
    terrain_grass: makePixelDataTexture(32, 32, (x, y) => {
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const n = hash2D(x >> 1, y >> 1, 11);
      const tuft = hash2D(x, y, 29);
      if (tuft > 0.965) return 0xf2f79c; // sunlit wildflower fleck
      if (tuft > 0.88 && (y & 3) === 0) return 0xb7eb62; // bright grass blade tip
      const v = n * 0.72 + bayer * 0.28;
      if (v > 0.72) return 0x9ce354;
      if (v > 0.42) return 0x7fd145;
      if (v > 0.18) return 0x67b83c;
      return 0x529c3a;
    }),

    // Stratified chiseled rock cliff bands with crisp pixel seams
    terrain_cliff: makePixelDataTexture(32, 32, (x, y) => {
      const strata = Math.floor((y + Math.sin(x * 0.35) * 1.6) / 6);
      const seam = (y + Math.floor(Math.sin(x * 0.35) * 1.6)) % 6 === 0;
      const n = hash2D(x >> 1, y >> 1, 47);
      if (seam) return 0x455869;
      if (strata % 3 === 0) return n > 0.5 ? 0x8ea3b0 : 0x7a909e;
      if (strata % 3 === 1) return n > 0.45 ? 0x6f8494 : 0x5c7282;
      return n > 0.5 ? 0x9ab0bd : 0x8398a6;
    }),

    // Warm wind-rippled Desert sandstone dunes
    terrain_desert: makePixelDataTexture(32, 32, (x, y) => {
      const ripple = Math.sin((y + Math.sin(x * 0.28) * 2.2) * 0.78);
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const n = hash2D(x, y, 83) * 0.25 + ripple * 0.5 + 0.5;
      if (n + bayer * 0.2 > 0.92) return 0xffe09c;
      if (n > 0.56) return 0xf2c26b;
      if (n > 0.28) return 0xdba14d;
      return 0xc28538;
    }),

    // Weathered mossy Graveyard pavers
    terrain_graveyard: makePixelDataTexture(32, 32, (x, y) => {
      const row = y >> 3;
      const ox = (x + (row & 1) * 4) & 7;
      const oy = y & 7;
      if (ox === 0 || oy === 0) return 0x262e3d;
      const n = hash2D(x >> 2, y >> 2, 109);
      if (n > 0.82) return 0x486e5c; // moss tuft
      if (n > 0.45) return 0x566275;
      return 0x434e61;
    }),

    // Obsidian FinalBossMap citadel tiles with glowing violet hairline seams
    terrain_citadel: makePixelDataTexture(32, 32, (x, y) => {
      const bx = x & 7;
      const by = y & 7;
      if (bx === 0 || by === 0) {
        return hash2D(x, y, 131) > 0.72 ? 0xa832d9 : 0x1d162b;
      }
      const n = hash2D(x >> 1, y >> 1, 137);
      return n > 0.6 ? 0x3b2f4d : n > 0.25 ? 0x2f2540 : 0x241c33;
    }),

    // Vertical gnarled bark grain with warm wood highlights & cool crevices
    bark_grain: makePixelDataTexture(32, 32, (x, y) => {
      const streak = hash2D(x >> 1, y >> 3, 211);
      const groove = (x + Math.floor(Math.sin(y * 0.25) * 1.4)) % 5 === 0;
      if (groove) return 0x593a28;
      if (streak > 0.74) return 0xb8845c;
      if (streak > 0.35) return 0x946443;
      return 0x784e34;
    }),

    // Crisp Bayer-dithered pine needle clusters
    foliage_pine: makePixelDataTexture(32, 32, (x, y) => {
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const n = hash2D(x >> 1, y >> 1, 307);
      const v = n * 0.68 + bayer * 0.32;
      if (v > 0.76) return 0xb2ed6d;
      if (v > 0.45) return 0x7fd455;
      if (v > 0.2) return 0x59b048;
      return 0x3d8a42;
    }),

    // Sunlit clustered oak canopy texture
    foliage_oak: makePixelDataTexture(32, 32, (x, y) => {
      const cx = (x & 7) - 3.5;
      const cy = (y & 7) - 3.5;
      const dist = Math.hypot(cx, cy);
      const n = hash2D(x >> 3, y >> 3, 353);
      if (dist < 2.2) return n > 0.5 ? 0xd9fa75 : 0xb4eb5b;
      if (dist < 3.6) return 0x86d448;
      return 0x58a83e;
    }),

    // Ancient carved stone with glowing cyan/gold pixel runes
    shrine_rune: makePixelDataTexture(32, 32, (x, y) => {
      const cx = Math.abs(x - 15.5);
      const cy = Math.abs(y - 15.5);
      const diamond = Math.abs(cx + cy - 9) < 1.3;
      const spine = cx < 1.5 && cy < 11;
      const bar = cy < 1.5 && cx < 6;
      if (diamond || spine || bar) return 0x6bf7ff;
      if (x === 0 || x === 31 || y === 0 || y === 31) return 0x4c586b;
      const n = hash2D(x >> 1, y >> 1, 401);
      return n > 0.6 ? 0x9aa8ba : n > 0.3 ? 0x808fa3 : 0x6c7a8f;
    }),

    // Planked treasure chest wood with bright metal/gold rivet bands
    chest_wood: makePixelDataTexture(32, 32, (x, y) => {
      const trim = x < 4 || x > 27 || y < 4 || y > 27 || (y >= 14 && y <= 17);
      if (trim) {
        const rivet = ((x === 2 || x === 29) && (y % 6 === 2)) || (y === 15 && x % 6 === 2);
        return rivet ? 0xfff3b0 : 0xf5c542;
      }
      const plankSeam = y % 7 === 0;
      if (plankSeam) return 0x5c361e;
      const grain = hash2D(x >> 2, y, 457);
      return grain > 0.55 ? 0xb5723c : 0x96592c;
    }),

    // Diagonal glowing cyan-gold rail grind energy stripes
    rail_energy: makePixelDataTexture(32, 32, (x, y) => {
      const diag = (x + y) & 15;
      if (diag < 4) return 0xffffff;
      if (diag < 8) return 0x4df3ff;
      if (diag < 11) return 0x1ba6d6;
      return 0xffd24d;
    }),

    // Concentric pixelated violet-cyan portal vortex
    portal_swirl: makePixelDataTexture(32, 32, (x, y) => {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const spiral = Math.sin(r * 0.85 - angle * 3.0);
      if (r < 4.0) return 0xffffff;
      if (spiral > 0.45) return 0x5ef2ff;
      if (spiral > -0.1) return 0xbd5bff;
      return 0x4f1d96;
    }),

    // Subtle crisp pixel weave for characters & enemies (preserves vertex colors cleanly!)
    character_palette: makePixelDataTexture(16, 16, (x, y) => {
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const n = hash2D(x, y, 521);
      const lum = n * 0.55 + bayer * 0.45;
      if (lum > 0.72) return 0xffffff;
      if (lum > 0.32) return 0xf0f2f7;
      return 0xdfe4ee;
    }),

    // Chiseled golem stone with glowing cyan fissures
    stone_golem: makePixelDataTexture(32, 32, (x, y) => {
      const crack = Math.abs((x * 3 + y * 2) % 29 - 14) <= 0 && hash2D(x >> 1, y >> 1, 601) > 0.35;
      if (crack) return 0x5cf7ff;
      const n = hash2D(x >> 1, y >> 1, 607);
      if (n > 0.78) return 0x7ab86b; // mossy flecks
      if (n > 0.45) return 0xb4bec7;
      return 0x8f9ba6;
    }),

    // Crisp subtle bone pixel texture
    bone_ivory: makePixelDataTexture(16, 16, (x, y) => {
      const n = hash2D(x, y >> 1, 643);
      return n > 0.65 ? 0xfffef5 : n > 0.25 ? 0xf2ebd9 : 0xded5be;
    }),

    // Bubbly cel-shaded slime gel pattern
    slime_gel: makePixelDataTexture(32, 32, (x, y) => {
      const bx = (x & 7) - 3.5;
      const by = (y & 7) - 3.5;
      const d = Math.hypot(bx, by);
      if (d < 1.6 && hash2D(x >> 3, y >> 3, 701) > 0.45) return 0xffffff;
      if (d < 2.6 && hash2D(x >> 3, y >> 3, 701) > 0.45) return 0xd4fff7;
      return 0xe6f9f5;
    }),

    // Painted ceramic terracotta pot bands
    ceramic_pot: makePixelDataTexture(32, 32, (x, y) => {
      if (y >= 10 && y <= 14) {
        return ((x >> 1) + (y & 1)) % 2 === 0 ? 0xffe49e : 0x5c2b1e;
      }
      if (y === 9 || y === 15) return 0x3b1c14;
      const n = hash2D(x >> 1, y >> 1, 757);
      return n > 0.55 ? 0xeb9b6a : 0xd9804c;
    }),

    // Jump pad spring chevron pattern
    jump_pad: makePixelDataTexture(32, 32, (x, y) => {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const r = Math.hypot(dx, dy);
      if (r < 4.5) return 0xffffff;
      if (r < 9.5) return 0x4df5ff;
      if (r < 12.5) return 0x1aa3d9;
      return 0x2c3647;
    }),
  };
}

// ============================================================================
// FACETED VERTEX-COLORED LOW-POLY GEOMETRY MERGER
// ============================================================================

export interface ColoredPartSpec {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();

/**
 * Merges multiple primitive BufferGeometries into a single crisp flat-faceted
 * non-indexed BufferGeometry with baked linear vertex colors and clean UVs.
 * Disposes all input part geometries automatically.
 */
export function mergeColoredParts(parts: readonly ColoredPartSpec[]): THREE.BufferGeometry {
  const nonIndexedParts: Array<{ geo: THREE.BufferGeometry; color: number }> = [];
  let totalVerts = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const raw = part.geo;
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    raw.dispose();

    _tmpPos.set(part.pos?.[0] ?? 0, part.pos?.[1] ?? 0, part.pos?.[2] ?? 0);
    _tmpEuler.set(part.rot?.[0] ?? 0, part.rot?.[1] ?? 0, part.rot?.[2] ?? 0);
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpScale.set(part.scale?.[0] ?? 1, part.scale?.[1] ?? 1, part.scale?.[2] ?? 1);
    _tmpMat.compose(_tmpPos, _tmpQuat, _tmpScale);
    g.applyMatrix4(_tmpMat);
    g.computeVertexNormals();

    const posAttr = g.getAttribute('position');
    totalVerts += posAttr.count;
    nonIndexedParts.push({ geo: g, color: part.color });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (let i = 0; i < nonIndexedParts.length; i++) {
    const entry = nonIndexedParts[i]!;
    const g = entry.geo;
    const posAttr = g.getAttribute('position');
    const normAttr = g.getAttribute('normal');
    const uvAttr = g.getAttribute('uv');
    const count = posAttr.count;

    _tmpColor.setHex(entry.color);
    const cr = _tmpColor.r;
    const cg = _tmpColor.g;
    const cb = _tmpColor.b;

    for (let v = 0; v < count; v++) {
      const o3 = (offset + v) * 3;
      const o2 = (offset + v) * 2;
      positions[o3] = posAttr.getX(v);
      positions[o3 + 1] = posAttr.getY(v);
      positions[o3 + 2] = posAttr.getZ(v);

      normals[o3] = normAttr.getX(v);
      normals[o3 + 1] = normAttr.getY(v);
      normals[o3 + 2] = normAttr.getZ(v);

      if (uvAttr) {
        uvs[o2] = uvAttr.getX(v);
        uvs[o2 + 1] = uvAttr.getY(v);
      } else {
        uvs[o2] = (positions[o3]! + positions[o3 + 2]!) * 0.5;
        uvs[o2 + 1] = positions[o3 + 1]! * 0.5;
      }

      colors[o3] = cr;
      colors[o3 + 1] = cg;
      colors[o3 + 2] = cb;
    }

    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

export interface LowPolyGeometryPair {
  geometry: THREE.BufferGeometry;
  outlineGeometry: THREE.BufferGeometry;
  textureKey: ProceduralTextureId;
  outlineThickness: number;
  emissiveHex?: number;
  emissiveIntensity?: number;
  gloss?: number;
}

function makePair(
  parts: readonly ColoredPartSpec[],
  textureKey: ProceduralTextureId,
  outlineThickness = 0.048,
  extra?: { emissiveHex?: number; emissiveIntensity?: number; gloss?: number },
): LowPolyGeometryPair {
  const geometry = mergeColoredParts(parts);
  const outlineGeometry = createSmoothOutlineGeometry(geometry);
  return {
    geometry,
    outlineGeometry,
    textureKey,
    outlineThickness,
    ...extra,
  };
}

// ============================================================================
// ARTICULATED PLAYABLE CHARACTER RIGS (4 WAVE 1 FLAGSHIPS + ALL 21 FALLBACKS)
// ============================================================================

export interface CharacterRig {
  characterId: CharacterId;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  tailPivot: THREE.Group | null;
  capePivot: THREE.Group | null;
  weaponPivot: THREE.Group;
  boardPivot: THREE.Group | null;
  wheelPivots: THREE.Object3D[];
  auraRing: THREE.Mesh | null;
  toonMaterials: THREE.ShaderMaterial[];
  outlineMeshes: THREE.Mesh[];
  dispose: () => void;
}

interface CharacterStylePalette {
  primary: number;
  secondary: number;
  accent: number;
  skin: number;
  boots: number;
  weapon: number;
  weaponGlow: number;
  scale: number;
}

const CHARACTER_PALETTES: Record<CharacterId, CharacterStylePalette> = {
  Fox: {
    primary: 0xf27127,
    secondary: 0x2e8555,
    accent: 0xfff1d6,
    skin: 0xf58438,
    boots: 0x452d24,
    weapon: 0x7d4c2a,
    weaponGlow: 0xff8b1f,
    scale: 1.0,
  },
  Calcium: {
    primary: 0xf5f0de,
    secondary: 0x232a3b,
    accent: 0xff3b5c,
    skin: 0xf7f2e1,
    boots: 0x3ad5ff,
    weapon: 0xfcf9ed,
    weaponGlow: 0xffe89e,
    scale: 1.0,
  },
  SirOofie: {
    primary: 0x9aa8ba,
    secondary: 0xd62839,
    accent: 0xffcb3b,
    skin: 0x6c7a8f,
    boots: 0x4a5568,
    weapon: 0xdbe6f2,
    weaponGlow: 0x7df9ff,
    scale: 1.06,
  },
  Megachad: {
    primary: 0xe6a67c,
    secondary: 0x1d2333,
    accent: 0xffd23f,
    skin: 0xebae86,
    boots: 0x252c40,
    weapon: 0xffd23f,
    weaponGlow: 0xffd84d,
    scale: 1.32,
  },
  Amog: { primary: 0x57cc52, secondary: 0x3b2a54, accent: 0xb8ff3b, skin: 0x73e069, boots: 0x2a2438, weapon: 0x9ef01a, weaponGlow: 0xaaff00, scale: 1.0 },
  Athena: { primary: 0xf4f1e6, secondary: 0x3694e0, accent: 0xffd24c, skin: 0xf5cba7, boots: 0xd4a437, weapon: 0xffdf6b, weaponGlow: 0x70e4ff, scale: 1.02 },
  Bandit: { primary: 0x3b3347, secondary: 0x9e2a3b, accent: 0xffb703, skin: 0xe8ba95, boots: 0x231d29, weapon: 0xd8dee9, weaponGlow: 0xff4d6d, scale: 0.98 },
  Birdo: { primary: 0x47c4ff, secondary: 0xf2f7ff, accent: 0xffbe3b, skin: 0x59ccff, boots: 0xf29f29, weapon: 0xa6f7ff, weaponGlow: 0x5ef2ff, scale: 0.96 },
  Bush: { primary: 0x4fa83b, secondary: 0x6e4f34, accent: 0xc2f261, skin: 0x478c36, boots: 0x473322, weapon: 0x4f5d6b, weaponGlow: 0x70ff98, scale: 1.0 },
  SirChadwell: { primary: 0x4b2e6b, secondary: 0x221730, accent: 0xd938ff, skin: 0x6e5985, boots: 0x1c1426, weapon: 0xc138ff, weaponGlow: 0xe66bff, scale: 1.08 },
  Cl4nk: { primary: 0xc99638, secondary: 0x425263, accent: 0x52f2ff, skin: 0xd9a84c, boots: 0x2d3845, weapon: 0x9fb1c4, weaponGlow: 0x52f2ff, scale: 0.98 },
  Dicehead: { primary: 0xf7f8fc, secondary: 0xe63946, accent: 0x1d2330, skin: 0xffffff, boots: 0x252d3d, weapon: 0xf7f8fc, weaponGlow: 0xffd23f, scale: 1.0 },
  Monke: { primary: 0x8f5633, secondary: 0xd99e62, accent: 0xffe03b, skin: 0xc98d59, boots: 0x59341e, weapon: 0xffe03b, weaponGlow: 0xfff078, scale: 1.0 },
  Ninja: { primary: 0x23293a, secondary: 0x3d4b6b, accent: 0xff385c, skin: 0xe6ba95, boots: 0x161a26, weapon: 0xe6eef7, weaponGlow: 0x5cf2ff, scale: 0.98 },
  Noelle: { primary: 0x7ae5ff, secondary: 0xf0f9ff, accent: 0x3b82f6, skin: 0xf7d6c3, boots: 0x2e64b8, weapon: 0xb8f3ff, weaponGlow: 0x7ae5ff, scale: 0.98 },
  Ogre: { primary: 0x6ea847, secondary: 0x734b30, accent: 0xd9c598, skin: 0x7cb853, boots: 0x4a301e, weapon: 0x9ca8b8, weaponGlow: 0xff9f43, scale: 1.25 },
  Roberto: { primary: 0x2e2a40, secondary: 0x6e3585, accent: 0x4dff9e, skin: 0xded9cf, boots: 0x1b1929, weapon: 0xb8c5d6, weaponGlow: 0x4dff9e, scale: 1.02 },
  Robinette: { primary: 0x2d9954, secondary: 0x8f562e, accent: 0xffd242, skin: 0xf5c8a4, boots: 0x5c361d, weapon: 0xb5763a, weaponGlow: 0xffe066, scale: 0.96 },
  Spaceman: { primary: 0xedf2f7, secondary: 0x3b82f6, accent: 0xffa62b, skin: 0x1b2438, boots: 0x4a5568, weapon: 0x7b3fe4, weaponGlow: 0xc05eff, scale: 1.02 },
  TonyMcZoom: { primary: 0xff477e, secondary: 0x1e2538, accent: 0x38f2ff, skin: 0xf2c29b, boots: 0x38f2ff, weapon: 0x52f2ff, weaponGlow: 0x38f2ff, scale: 0.98 },
  Vlad: { primary: 0x241926, secondary: 0xb81d38, accent: 0xff4d6d, skin: 0xd9d2db, boots: 0x171019, weapon: 0xff2e54, weaponGlow: 0xff3b5c, scale: 1.04 },
};

function attachOutlinedParts(
  parent: THREE.Object3D,
  parts: readonly ColoredPartSpec[],
  toonMat: THREE.ShaderMaterial,
  outlineMat: THREE.ShaderMaterial,
  outlines: THREE.Mesh[],
  geometriesToDispose: THREE.BufferGeometry[],
): THREE.Mesh {
  const geo = mergeColoredParts(parts);
  const outGeo = createSmoothOutlineGeometry(geo);
  geometriesToDispose.push(geo, outGeo);

  const mesh = new THREE.Mesh(geo, toonMat);
  const outline = new THREE.Mesh(outGeo, outlineMat);
  mesh.add(outline);
  parent.add(mesh);
  outlines.push(outline);
  return mesh;
}

function addHatParts(parts: ColoredPartSpec[], hatId: string | null | undefined, headTopY: number): void {
  if (!hatId) return;
  const h = hatId.toLowerCase();
  if (h.includes('crown')) {
    parts.push({ geo: new THREE.CylinderGeometry(0.28, 0.24, 0.2, 6), color: 0xffd23f, pos: [0, headTopY + 0.1, 0] });
    parts.push({ geo: new THREE.OctahedronGeometry(0.08, 0), color: 0xff385c, pos: [0, headTopY + 0.12, 0.24] });
  } else if (h.includes('wizard')) {
    parts.push({ geo: new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8), color: 0x4f359b, pos: [0, headTopY + 0.03, 0] });
    parts.push({ geo: new THREE.ConeGeometry(0.28, 0.62, 7), color: 0x6242bd, pos: [0, headTopY + 0.34, -0.04], rot: [-0.15, 0, 0] });
  } else if (h.includes('halo')) {
    parts.push({ geo: new THREE.TorusGeometry(0.28, 0.045, 5, 10), color: 0xffe875, pos: [0, headTopY + 0.24, 0], rot: [Math.PI * 0.5, 0, 0] });
  } else if (h.includes('horn')) {
    parts.push({ geo: new THREE.ConeGeometry(0.08, 0.32, 5), color: 0xd62839, pos: [-0.22, headTopY + 0.14, 0.04], rot: [0.15, 0, 0.4] });
    parts.push({ geo: new THREE.ConeGeometry(0.08, 0.32, 5), color: 0xd62839, pos: [0.22, headTopY + 0.14, 0.04], rot: [0.15, 0, -0.4] });
  } else if (h.includes('tophat')) {
    parts.push({ geo: new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8), color: 0x1f2430, pos: [0, headTopY + 0.03, 0] });
    parts.push({ geo: new THREE.CylinderGeometry(0.28, 0.24, 0.44, 8), color: 0x262c3b, pos: [0, headTopY + 0.26, 0] });
    parts.push({ geo: new THREE.CylinderGeometry(0.26, 0.25, 0.09, 8), color: 0xe63946, pos: [0, headTopY + 0.1, 0] });
  } else {
    // Stylized adventurer cap / beanie
    parts.push({ geo: new THREE.CylinderGeometry(0.26, 0.32, 0.2, 7), color: 0x38bdf8, pos: [0, headTopY + 0.08, 0] });
    parts.push({ geo: new THREE.OctahedronGeometry(0.09, 0), color: 0xfff4c2, pos: [0, headTopY + 0.22, 0] });
  }
}

// ============================================================================
// MAIN PROCEDURAL PACK CLASS (IMPLEMENTS IAssetPack)
// ============================================================================

export class ProceduralLowPolyPack implements IAssetPack {
  private readonly textures: Record<ProceduralTextureId, THREE.DataTexture>;
  private readonly manifest: PackManifest;
  private readonly palettes: Record<string, readonly string[]>;
  private readonly localization: Record<string, string>;

  private readonly enemyCache = new Map<string, LowPolyGeometryPair>();
  private readonly propCache = new Map<string, LowPolyGeometryPair>();
  private readonly interactableCache = new Map<string, LowPolyGeometryPair>();
  private readonly projectileCache = new Map<string, LowPolyGeometryPair>();
  private readonly pickupCache = new Map<string, LowPolyGeometryPair>();

  constructor() {
    this.textures = buildAllProceduralTextures();
    this.palettes = {
      forest_stage1: ['#7fd145', '#59b048', '#007a9e', '#fff4d4', '#26345e', '#f5c542'],
      desert_stage1: ['#f2c26b', '#dba14d', '#d97a38', '#ffe9b8', '#4f3142', '#4df3ff'],
      graveyard_stage1: ['#566275', '#486e5c', '#20263b', '#c9e8ff', '#161829', '#a855f7'],
      citadel_final: ['#3b2f4d', '#241c33', '#1a0c26', '#ffd4f4', '#180c24', '#ff2ec4'],
      fox: ['#f27127', '#fff1d6', '#2e8555', '#ff8b1f'],
      calcium: ['#f5f0de', '#ff3b5c', '#3ad5ff', '#232a3b'],
      siroofie: ['#9aa8ba', '#d62839', '#ffcb3b', '#dbe6f2'],
      megachad: ['#e6a67c', '#ffd23f', '#1d2333', '#52f2ff'],
    };
    this.localization = {
      'game.title': 'KRUNKEDBONK',
      'prompt.interact': '[E] INTERACT',
      'prompt.shrine': 'HOLD RING TO CHARGE',
      'prompt.boss': '[E] SUMMON BOSS',
      'prompt.portal': '[E] ENTER PORTAL',
    };

    const textureEntries: PackManifest['textures'] = {};
    for (const key of Object.keys(this.textures) as ProceduralTextureId[]) {
      textureEntries[key] = {
        id: key,
        path: `procedural://${key}`,
        width: this.textures[key].image.width,
        height: this.textures[key].image.height,
        format: 'rgba-procedural-nearest',
        category: key.startsWith('terrain_') ? 'world' : 'palette',
      };
    }

    const paletteEntries: PackManifest['palettes'] = {};
    for (const [id, colors] of Object.entries(this.palettes)) {
      paletteEntries[id] = { id, colors: [...colors] };
    }

    this.manifest = {
      version: '1.0.0-procedural',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVerified: true,
      textures: textureEntries,
      audio: {},
      localization: { ...this.localization },
      palettes: paletteEntries,
    };
  }

  // ---- IAssetPack interface ----

  public isLoaded(): boolean {
    return true;
  }

  public getManifest(): PackManifest | null {
    return this.manifest;
  }

  public async loadFromDevEndpoint(_prefix?: string): Promise<boolean> {
    return true;
  }

  public async loadFromFiles(_files: readonly CustomPackFileEntry[]): Promise<boolean> {
    return true;
  }

  public clear(): void {
    // Built-in procedural pack remains always available
  }

  public getTextureUrl(_id: string): string | null {
    return null;
  }

  public getAudioUrl(_id: string): string | null {
    return null;
  }

  public getLocalizedString(key: string, fallback = key): string {
    return this.localization[key] ?? fallback;
  }

  public getPalette(id: string): readonly string[] | null {
    return this.palettes[id] ?? null;
  }

  // ---- Procedural Texture Access ----

  public getProceduralTexture(id: ProceduralTextureId): THREE.DataTexture {
    return this.textures[id];
  }

  // ---- Articulated Character Rig Builder ----

  public buildCharacterRig(
    characterId: CharacterId,
    _skinId?: string | null,
    hatId?: string | null,
  ): CharacterRig {
    const pal = CHARACTER_PALETTES[characterId] ?? CHARACTER_PALETTES.Fox;
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    const headPivot = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const weaponPivot = new THREE.Group();
    let tailPivot: THREE.Group | null = null;
    let capePivot: THREE.Group | null = null;
    let boardPivot: THREE.Group | null = null;
    const wheelPivots: THREE.Object3D[] = [];
    let auraRing: THREE.Mesh | null = null;

    const toonMaterials: THREE.ShaderMaterial[] = [];
    const outlineMeshes: THREE.Mesh[] = [];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const extraMaterials: THREE.Material[] = [];

    const bodyTex =
      characterId === 'Calcium' ? this.textures.bone_ivory : this.textures.character_palette;
    const mainMat = createMkToonMaterial({
      color: 0xffffff,
      map: bodyTex,
      mapStrength: 0.45,
      vertexColors: true,
      rimStrength: 0.42,
      rimColor: 0xe6fbff,
      gloss: characterId === 'SirOofie' ? 0.55 : 0.15,
    });
    toonMaterials.push(mainMat);

    const glowMat = createMkToonMaterial({
      color: pal.weaponGlow,
      emissive: pal.weaponGlow,
      emissiveIntensity: 0.85,
      rimStrength: 0.6,
      rimColor: 0xffffff,
      vertexColors: false,
    });
    toonMaterials.push(glowMat);

    const outlineMat = createOutlineMaterial(0.052, 0x0b0d14);
    extraMaterials.push(outlineMat);

    root.add(bodyPivot);
    bodyPivot.scale.setScalar(pal.scale);

    if (characterId === 'Fox') {
      // --- FOX: pointed ears, snout, bushy orange-white tail, adventurer tunic, glowing Firestaff ---
      bodyPivot.position.y = 0.0;

      // Torso + emerald tunic + golden belt sash
      attachOutlinedParts(
        bodyPivot,
        [
          { geo: new THREE.CylinderGeometry(0.32, 0.42, 0.82, 7), color: pal.secondary, pos: [0, 1.05, 0] },
          { geo: new THREE.CylinderGeometry(0.38, 0.39, 0.16, 7), color: 0x5c3721, pos: [0, 0.82, 0] },
          { geo: new THREE.BoxGeometry(0.18, 0.14, 0.12), color: 0xffd23f, pos: [0, 0.82, 0.36] },
          { geo: new THREE.ConeGeometry(0.34, 0.28, 7), color: pal.accent, pos: [0, 1.46, 0.05], rot: [Math.PI, 0, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Fox Head with pointed black-tipped ears & triangular snout
      headPivot.position.set(0, 1.56, 0.02);
      bodyPivot.add(headPivot);
      const foxHeadParts: ColoredPartSpec[] = [
        { geo: new THREE.DodecahedronGeometry(0.38, 0), color: pal.primary, pos: [0, 0.24, 0], scale: [1.05, 0.92, 1.02] },
        // Cream cheek tufts
        { geo: new THREE.ConeGeometry(0.16, 0.26, 5), color: pal.accent, pos: [-0.3, 0.16, 0.1], rot: [0, 0, 1.15] },
        { geo: new THREE.ConeGeometry(0.16, 0.26, 5), color: pal.accent, pos: [0.3, 0.16, 0.1], rot: [0, 0, -1.15] },
        // Snout + dark nose button
        { geo: new THREE.ConeGeometry(0.18, 0.42, 5), color: pal.primary, pos: [0, 0.17, 0.38], rot: [Math.PI * 0.52, 0, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.09, 0.24), color: pal.accent, pos: [0, 0.1, 0.34] },
        { geo: new THREE.OctahedronGeometry(0.065, 0), color: 0x161822, pos: [0, 0.18, 0.58] },
        // Pointed fox ears + dark tips
        { geo: new THREE.ConeGeometry(0.14, 0.42, 4), color: pal.primary, pos: [-0.22, 0.62, -0.02], rot: [0.1, 0, 0.22] },
        { geo: new THREE.ConeGeometry(0.07, 0.18, 4), color: 0x1b1e29, pos: [-0.26, 0.77, -0.01], rot: [0.1, 0, 0.22] },
        { geo: new THREE.ConeGeometry(0.14, 0.42, 4), color: pal.primary, pos: [0.22, 0.62, -0.02], rot: [0.1, 0, -0.22] },
        { geo: new THREE.ConeGeometry(0.07, 0.18, 4), color: 0x1b1e29, pos: [0.26, 0.77, -0.01], rot: [0.1, 0, -0.22] },
        // Expressive bright eyes
        { geo: new THREE.BoxGeometry(0.1, 0.11, 0.06), color: 0x12151f, pos: [-0.15, 0.29, 0.32] },
        { geo: new THREE.BoxGeometry(0.04, 0.04, 0.07), color: 0xffffff, pos: [-0.13, 0.32, 0.33] },
        { geo: new THREE.BoxGeometry(0.1, 0.11, 0.06), color: 0x12151f, pos: [0.15, 0.29, 0.32] },
        { geo: new THREE.BoxGeometry(0.04, 0.04, 0.07), color: 0xffffff, pos: [0.17, 0.32, 0.33] },
      ];
      addHatParts(foxHeadParts, hatId, 0.58);
      attachOutlinedParts(headPivot, foxHeadParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Bushy multi-segment orange-and-white tail
      tailPivot = new THREE.Group();
      tailPivot.position.set(0, 0.8, -0.34);
      bodyPivot.add(tailPivot);
      attachOutlinedParts(
        tailPivot,
        [
          { geo: new THREE.ConeGeometry(0.24, 0.58, 6), color: pal.primary, pos: [0, 0.12, -0.26], rot: [-1.15, 0, 0] },
          { geo: new THREE.DodecahedronGeometry(0.26, 0), color: pal.primary, pos: [0, 0.24, -0.52], scale: [0.95, 0.9, 1.35] },
          { geo: new THREE.ConeGeometry(0.22, 0.42, 6), color: pal.accent, pos: [0, 0.32, -0.86], rot: [-1.35, 0, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Limbs
      leftArm.position.set(-0.42, 1.34, 0);
      rightArm.position.set(0.42, 1.34, 0);
      leftLeg.position.set(-0.18, 0.66, 0);
      rightLeg.position.set(0.18, 0.66, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

      attachOutlinedParts(leftArm, [
        { geo: new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6), color: pal.primary, pos: [0, -0.24, 0] },
        { geo: new THREE.BoxGeometry(0.15, 0.14, 0.16), color: pal.boots, pos: [0, -0.52, 0.02] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightArm, [
        { geo: new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6), color: pal.primary, pos: [0, -0.24, 0] },
        { geo: new THREE.BoxGeometry(0.15, 0.14, 0.16), color: pal.boots, pos: [0, -0.52, 0.02] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(leftLeg, [
        { geo: new THREE.CylinderGeometry(0.11, 0.1, 0.48, 6), color: pal.primary, pos: [0, -0.24, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.18, 0.3), color: pal.boots, pos: [0, -0.56, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightLeg, [
        { geo: new THREE.CylinderGeometry(0.11, 0.1, 0.48, 6), color: pal.primary, pos: [0, -0.24, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.18, 0.3), color: pal.boots, pos: [0, -0.56, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Glowing Firestaff attached to right hand
      weaponPivot.position.set(0.04, -0.44, 0.18);
      rightArm.add(weaponPivot);
      attachOutlinedParts(
        weaponPivot,
        [
          { geo: new THREE.CylinderGeometry(0.055, 0.065, 1.95, 6), color: pal.weapon, pos: [0, 0.36, 0.15], rot: [0.22, 0, 0] },
          { geo: new THREE.TorusGeometry(0.18, 0.045, 5, 8), color: 0xffc83b, pos: [0, 1.38, 0.38] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );
      const staffOrbGeo = new THREE.OctahedronGeometry(0.19, 0);
      const staffOrbOutGeo = createSmoothOutlineGeometry(staffOrbGeo);
      geometriesToDispose.push(staffOrbGeo, staffOrbOutGeo);
      const staffOrb = new THREE.Mesh(staffOrbGeo, glowMat);
      staffOrb.position.set(0, 1.38, 0.38);
      const staffOrbOut = new THREE.Mesh(staffOrbOutGeo, outlineMat);
      staffOrb.add(staffOrbOut);
      weaponPivot.add(staffOrb);
      outlineMeshes.push(staffOrbOut);
    } else if (characterId === 'Calcium') {
      // --- CALCIUM: cartoon skull, ribcage, limbs riding a tilted chunky low-poly skateboard! ---
      const deckHeight = 0.32;

      // Chunky tilted low-poly skateboard with kicktails, trucks, and 4 outlined wheels
      boardPivot = new THREE.Group();
      boardPivot.position.set(0, 0.14, 0);
      bodyPivot.add(boardPivot);
      attachOutlinedParts(
        boardPivot,
        [
          { geo: new THREE.BoxGeometry(0.68, 0.08, 1.48), color: 0x262d40, pos: [0, 0.14, 0] },
          { geo: new THREE.BoxGeometry(0.56, 0.09, 1.38), color: pal.accent, pos: [0, 0.145, 0] },
          { geo: new THREE.BoxGeometry(0.24, 0.095, 1.36), color: 0x3ad5ff, pos: [0, 0.15, 0] },
          // Front & rear upturned kicktails
          { geo: new THREE.BoxGeometry(0.62, 0.07, 0.28), color: pal.accent, pos: [0, 0.2, 0.82], rot: [-0.36, 0, 0] },
          { geo: new THREE.BoxGeometry(0.62, 0.07, 0.28), color: pal.accent, pos: [0, 0.2, -0.82], rot: [0.36, 0, 0] },
          // Metallic trucks
          { geo: new THREE.BoxGeometry(0.64, 0.08, 0.12), color: 0xb8c5d6, pos: [0, 0.05, 0.48] },
          { geo: new THREE.BoxGeometry(0.64, 0.08, 0.12), color: 0xb8c5d6, pos: [0, 0.05, -0.48] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // 4 spinning skateboard wheels
      const wheelCoords: [number, number, number][] = [
        [-0.36, 0.04, 0.48],
        [0.36, 0.04, 0.48],
        [-0.36, 0.04, -0.48],
        [0.36, 0.04, -0.48],
      ];
      for (const wc of wheelCoords) {
        const wGroup = new THREE.Group();
        wGroup.position.set(wc[0], wc[1], wc[2]);
        boardPivot.add(wGroup);
        attachOutlinedParts(
          wGroup,
          [
            { geo: new THREE.CylinderGeometry(0.11, 0.11, 0.12, 8), color: 0xffe042, rot: [0, 0, Math.PI * 0.5] },
            { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.135, 6), color: 0x222836, rot: [0, 0, Math.PI * 0.5] },
          ],
          mainMat,
          outlineMat,
          outlineMeshes,
          geometriesToDispose,
        );
        wheelPivots.push(wGroup);
      }

      // Skeleton Ribcage + Spine + Pelvis standing atop skateboard
      attachOutlinedParts(
        bodyPivot,
        [
          { geo: new THREE.CylinderGeometry(0.08, 0.09, 0.72, 6), color: pal.primary, pos: [0, deckHeight + 0.98, -0.04] },
          // Stacked ribs
          { geo: new THREE.BoxGeometry(0.54, 0.1, 0.34), color: pal.primary, pos: [0, deckHeight + 1.24, 0.02] },
          { geo: new THREE.BoxGeometry(0.48, 0.09, 0.3), color: pal.primary, pos: [0, deckHeight + 1.08, 0.02] },
          { geo: new THREE.BoxGeometry(0.4, 0.09, 0.26), color: pal.primary, pos: [0, deckHeight + 0.92, 0.02] },
          // Dark ribcage core for crisp silhouette contrast
          { geo: new THREE.BoxGeometry(0.32, 0.42, 0.22), color: 0x1b202e, pos: [0, deckHeight + 1.08, 0.01] },
          // Pelvis + red skate shorts/belt accent
          { geo: new THREE.BoxGeometry(0.44, 0.2, 0.3), color: pal.secondary, pos: [0, deckHeight + 0.7, 0] },
          { geo: new THREE.BoxGeometry(0.48, 0.07, 0.33), color: pal.accent, pos: [0, deckHeight + 0.78, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Stylized Cartoon Skull with headband & grin
      headPivot.position.set(0, deckHeight + 1.44, 0.02);
      bodyPivot.add(headPivot);
      const skullParts: ColoredPartSpec[] = [
        { geo: new THREE.DodecahedronGeometry(0.36, 0), color: pal.primary, pos: [0, 0.28, 0], scale: [1.05, 1.0, 1.0] },
        // Cheekbones & grinning jaw
        { geo: new THREE.BoxGeometry(0.34, 0.16, 0.24), color: pal.primary, pos: [0, 0.05, 0.16] },
        { geo: new THREE.BoxGeometry(0.28, 0.05, 0.06), color: 0x12151f, pos: [0, 0.04, 0.28] },
        // Sunken dark comic eye sockets + electric cyan glints
        { geo: new THREE.BoxGeometry(0.14, 0.14, 0.08), color: 0x12151f, pos: [-0.13, 0.27, 0.31] },
        { geo: new THREE.BoxGeometry(0.14, 0.14, 0.08), color: 0x12151f, pos: [0.13, 0.27, 0.31] },
        { geo: new THREE.BoxGeometry(0.05, 0.05, 0.09), color: 0x52f2ff, pos: [-0.13, 0.28, 0.32] },
        { geo: new THREE.BoxGeometry(0.05, 0.05, 0.09), color: 0x52f2ff, pos: [0.13, 0.28, 0.32] },
        // Nose triangle
        { geo: new THREE.ConeGeometry(0.05, 0.09, 3), color: 0x12151f, pos: [0, 0.16, 0.34] },
        // Crimson skater headband
        { geo: new THREE.CylinderGeometry(0.37, 0.37, 0.1, 8), color: pal.accent, pos: [0, 0.42, 0] },
        { geo: new THREE.BoxGeometry(0.1, 0.28, 0.06), color: pal.accent, pos: [-0.12, 0.34, -0.38], rot: [0.45, 0, 0.25] },
        { geo: new THREE.BoxGeometry(0.1, 0.24, 0.06), color: pal.accent, pos: [0.1, 0.36, -0.38], rot: [0.55, 0, -0.2] },
      ];
      addHatParts(skullParts, hatId, 0.62);
      attachOutlinedParts(headPivot, skullParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Bony skater limbs
      leftArm.position.set(-0.36, deckHeight + 1.28, 0);
      rightArm.position.set(0.36, deckHeight + 1.28, 0);
      leftLeg.position.set(-0.18, deckHeight + 0.6, 0.22);
      rightLeg.position.set(0.18, deckHeight + 0.6, -0.22);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

      const boneLimbParts: ColoredPartSpec[] = [
        { geo: new THREE.CylinderGeometry(0.065, 0.06, 0.48, 6), color: pal.primary, pos: [0, -0.24, 0] },
        { geo: new THREE.OctahedronGeometry(0.095, 0), color: pal.primary, pos: [0, -0.5, 0] },
      ];
      attachOutlinedParts(leftArm, boneLimbParts.map((p) => ({ ...p, geo: p.geo.clone() })), mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightArm, boneLimbParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(leftLeg, [
        { geo: new THREE.CylinderGeometry(0.075, 0.07, 0.46, 6), color: pal.primary, pos: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.22, 0.14, 0.32), color: pal.boots, pos: [0, -0.52, 0.04] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightLeg, [
        { geo: new THREE.CylinderGeometry(0.075, 0.07, 0.46, 6), color: pal.primary, pos: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.22, 0.14, 0.32), color: pal.boots, pos: [0, -0.52, 0.04] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Chunky Bone Weapon in right hand
      weaponPivot.position.set(0.06, -0.44, 0.18);
      rightArm.add(weaponPivot);
      attachOutlinedParts(
        weaponPivot,
        [
          { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.72, 6), color: pal.weapon, pos: [0, 0.25, 0.1], rot: [0.4, 0, 0] },
          { geo: new THREE.OctahedronGeometry(0.11, 0), color: pal.weapon, pos: [-0.07, 0.56, 0.24] },
          { geo: new THREE.OctahedronGeometry(0.11, 0), color: pal.weapon, pos: [0.07, 0.56, 0.24] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );
    } else if (characterId === 'SirOofie') {
      // --- SIR OOFIE: chunky knight helm with visor slit, crimson cape, oversized broadsword ---
      attachOutlinedParts(
        bodyPivot,
        [
          // Armored chestplate
          { geo: new THREE.BoxGeometry(0.84, 0.84, 0.54), color: pal.primary, pos: [0, 1.08, 0] },
          // Gold breastplate emblem & belt
          { geo: new THREE.BoxGeometry(0.14, 0.44, 0.08), color: pal.accent, pos: [0, 1.12, 0.28] },
          { geo: new THREE.BoxGeometry(0.38, 0.12, 0.08), color: pal.accent, pos: [0, 1.18, 0.28] },
          { geo: new THREE.BoxGeometry(0.88, 0.14, 0.58), color: 0x3b4454, pos: [0, 0.72, 0] },
          { geo: new THREE.BoxGeometry(0.22, 0.16, 0.12), color: pal.accent, pos: [0, 0.72, 0.3] },
          // Broad steel pauldrons
          { geo: new THREE.DodecahedronGeometry(0.28, 0), color: 0xb8c5d6, pos: [-0.52, 1.4, 0] },
          { geo: new THREE.DodecahedronGeometry(0.28, 0), color: 0xb8c5d6, pos: [0.52, 1.4, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Chunky bucket knight helm with dark T-visor slit & crimson plume
      headPivot.position.set(0, 1.54, 0);
      bodyPivot.add(headPivot);
      const knightHeadParts: ColoredPartSpec[] = [
        { geo: new THREE.CylinderGeometry(0.36, 0.38, 0.64, 8), color: 0xb8c5d6, pos: [0, 0.32, 0] },
        { geo: new THREE.CylinderGeometry(0.37, 0.37, 0.1, 8), color: pal.accent, pos: [0, 0.58, 0] },
        // Visor T-slit
        { geo: new THREE.BoxGeometry(0.46, 0.1, 0.1), color: 0x0f121a, pos: [0, 0.36, 0.34] },
        { geo: new THREE.BoxGeometry(0.11, 0.32, 0.1), color: 0x0f121a, pos: [0, 0.22, 0.34] },
        // Sweeping crimson feather plume
        { geo: new THREE.BoxGeometry(0.14, 0.3, 0.56), color: pal.secondary, pos: [0, 0.76, -0.06], rot: [-0.25, 0, 0] },
        { geo: new THREE.ConeGeometry(0.14, 0.38, 5), color: 0xff4d5e, pos: [0, 0.68, -0.44], rot: [-1.15, 0, 0] },
      ];
      addHatParts(knightHeadParts, hatId, 0.66);
      attachOutlinedParts(headPivot, knightHeadParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Flowing crimson cape
      capePivot = new THREE.Group();
      capePivot.position.set(0, 1.44, -0.28);
      bodyPivot.add(capePivot);
      attachOutlinedParts(
        capePivot,
        [
          { geo: new THREE.BoxGeometry(0.84, 1.12, 0.08), color: pal.secondary, pos: [0, -0.54, -0.08], rot: [0.16, 0, 0] },
          { geo: new THREE.BoxGeometry(0.88, 0.12, 0.09), color: pal.accent, pos: [0, -1.06, -0.16], rot: [0.16, 0, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Armored limbs
      leftArm.position.set(-0.56, 1.32, 0);
      rightArm.position.set(0.56, 1.32, 0);
      leftLeg.position.set(-0.22, 0.66, 0);
      rightLeg.position.set(0.22, 0.66, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

      attachOutlinedParts(leftArm, [
        { geo: new THREE.BoxGeometry(0.24, 0.54, 0.24), color: pal.primary, pos: [0, -0.26, 0] },
        { geo: new THREE.BoxGeometry(0.26, 0.2, 0.26), color: 0x4f5d70, pos: [0, -0.54, 0] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightArm, [
        { geo: new THREE.BoxGeometry(0.24, 0.54, 0.24), color: pal.primary, pos: [0, -0.26, 0] },
        { geo: new THREE.BoxGeometry(0.26, 0.2, 0.26), color: 0x4f5d70, pos: [0, -0.54, 0] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(leftLeg, [
        { geo: new THREE.BoxGeometry(0.26, 0.46, 0.26), color: pal.primary, pos: [0, -0.23, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.22, 0.38), color: pal.boots, pos: [0, -0.54, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightLeg, [
        { geo: new THREE.BoxGeometry(0.26, 0.46, 0.26), color: pal.primary, pos: [0, -0.23, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.22, 0.38), color: pal.boots, pos: [0, -0.54, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Oversized Chunky Low-Poly Broadsword
      weaponPivot.position.set(0.06, -0.48, 0.16);
      rightArm.add(weaponPivot);
      attachOutlinedParts(
        weaponPivot,
        [
          { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.42, 6), color: pal.secondary, pos: [0, -0.05, 0.08], rot: [0.35, 0, 0] },
          { geo: new THREE.OctahedronGeometry(0.11, 0), color: pal.accent, pos: [0, -0.24, 0.01] },
          // Broad gold crossguard
          { geo: new THREE.BoxGeometry(0.64, 0.12, 0.16), color: pal.accent, pos: [0, 0.18, 0.16], rot: [0.35, 0, 0] },
          // Oversized chunky broadsword blade
          { geo: new THREE.BoxGeometry(0.28, 1.56, 0.09), color: pal.weapon, pos: [0, 0.96, 0.44], rot: [0.35, 0, 0] },
          { geo: new THREE.BoxGeometry(0.1, 1.44, 0.12), color: 0xffffff, pos: [0, 0.96, 0.44], rot: [0.35, 0, 0] },
          { geo: new THREE.ConeGeometry(0.2, 0.42, 4), color: pal.weapon, pos: [0, 1.84, 0.76], rot: [0.35, Math.PI * 0.25, 0] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );
    } else if (characterId === 'Megachad') {
      // --- MEGACHAD: massive muscular low-poly torso, sunglasses/jawline, glowing golden Aura ring! ---
      attachOutlinedParts(
        bodyPivot,
        [
          // Massive V-taper muscular chest & abs
          { geo: new THREE.CylinderGeometry(0.66, 0.36, 0.96, 6), color: pal.primary, pos: [0, 1.18, 0] },
          { geo: new THREE.BoxGeometry(0.88, 0.44, 0.56), color: pal.primary, pos: [0, 1.4, 0.08] },
          // Athletic dark tank/shorts + golden championship belt
          { geo: new THREE.CylinderGeometry(0.4, 0.42, 0.34, 6), color: pal.secondary, pos: [0, 0.68, 0] },
          { geo: new THREE.CylinderGeometry(0.42, 0.42, 0.14, 8), color: pal.accent, pos: [0, 0.84, 0] },
          { geo: new THREE.OctahedronGeometry(0.16, 0), color: 0xfff49e, pos: [0, 0.84, 0.4] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      // Iconic chiseled square jawline, pompadour hair crest & sleek sunglasses!
      headPivot.position.set(0, 1.72, 0.04);
      bodyPivot.add(headPivot);
      const chadHeadParts: ColoredPartSpec[] = [
        // Chiseled square jaw & head
        { geo: new THREE.BoxGeometry(0.44, 0.48, 0.44), color: pal.skin, pos: [0, 0.28, 0] },
        { geo: new THREE.BoxGeometry(0.36, 0.18, 0.22), color: pal.skin, pos: [0, 0.08, 0.18] },
        // Heroic dark pompadour hair crest
        { geo: new THREE.BoxGeometry(0.48, 0.24, 0.58), color: 0x1a1e2b, pos: [0, 0.58, 0.08], rot: [-0.14, 0, 0] },
        // Sleek dark sunglasses + cyan reflection glint
        { geo: new THREE.BoxGeometry(0.5, 0.15, 0.12), color: 0x0d1018, pos: [0, 0.34, 0.24] },
        { geo: new THREE.BoxGeometry(0.14, 0.05, 0.13), color: 0x52f2ff, pos: [-0.12, 0.37, 0.245] },
        { geo: new THREE.BoxGeometry(0.14, 0.05, 0.13), color: 0x52f2ff, pos: [0.12, 0.37, 0.245] },
        // Confident gleaming grin
        { geo: new THREE.BoxGeometry(0.22, 0.06, 0.05), color: 0xffffff, pos: [0, 0.16, 0.24] },
      ];
      addHatParts(chadHeadParts, hatId, 0.72);
      attachOutlinedParts(headPivot, chadHeadParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      // Massive flexed muscular arms & stout legs
      leftArm.position.set(-0.74, 1.48, 0);
      rightArm.position.set(0.74, 1.48, 0);
      leftLeg.position.set(-0.24, 0.56, 0);
      rightLeg.position.set(0.24, 0.56, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

      attachOutlinedParts(leftArm, [
        { geo: new THREE.DodecahedronGeometry(0.26, 0), color: pal.primary, pos: [0, 0, 0] },
        { geo: new THREE.CylinderGeometry(0.19, 0.16, 0.52, 6), color: pal.primary, pos: [-0.04, -0.32, 0.06], rot: [-0.35, 0, 0.12] },
        { geo: new THREE.BoxGeometry(0.24, 0.22, 0.24), color: pal.accent, pos: [-0.05, -0.58, 0.18] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightArm, [
        { geo: new THREE.DodecahedronGeometry(0.26, 0), color: pal.primary, pos: [0, 0, 0] },
        { geo: new THREE.CylinderGeometry(0.19, 0.16, 0.52, 6), color: pal.primary, pos: [0.04, -0.32, 0.06], rot: [-0.35, 0, -0.12] },
        { geo: new THREE.BoxGeometry(0.24, 0.22, 0.24), color: pal.accent, pos: [0.05, -0.58, 0.18] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(leftLeg, [
        { geo: new THREE.CylinderGeometry(0.18, 0.14, 0.42, 6), color: pal.primary, pos: [0, -0.2, 0] },
        { geo: new THREE.BoxGeometry(0.28, 0.2, 0.36), color: pal.boots, pos: [0, -0.46, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightLeg, [
        { geo: new THREE.CylinderGeometry(0.18, 0.14, 0.42, 6), color: pal.primary, pos: [0, -0.2, 0] },
        { geo: new THREE.BoxGeometry(0.28, 0.2, 0.36), color: pal.boots, pos: [0, -0.46, 0.06] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      rightArm.add(weaponPivot);

      // Glowing golden Aura Ring orbiting Megachad!
      const auraGeo = new THREE.TorusGeometry(1.42, 0.085, 6, 18);
      geometriesToDispose.push(auraGeo);
      const auraMat = createMkToonMaterial({
        color: 0xffd84d,
        emissive: 0xffb703,
        emissiveIntensity: 1.15,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      toonMaterials.push(auraMat);
      auraRing = new THREE.Mesh(auraGeo, auraMat);
      auraRing.rotation.x = Math.PI * 0.5;
      auraRing.position.y = 0.26;
      root.add(auraRing);
    } else {
      // --- Stylized Hero Rig for all other 17 CharacterIds ---
      attachOutlinedParts(
        bodyPivot,
        [
          { geo: new THREE.CylinderGeometry(0.34, 0.42, 0.84, 7), color: pal.primary, pos: [0, 1.06, 0] },
          { geo: new THREE.CylinderGeometry(0.4, 0.4, 0.15, 7), color: pal.secondary, pos: [0, 0.8, 0] },
          { geo: new THREE.BoxGeometry(0.2, 0.16, 0.14), color: pal.accent, pos: [0, 0.8, 0.36] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );

      headPivot.position.set(0, 1.54, 0);
      bodyPivot.add(headPivot);
      const heroHeadParts: ColoredPartSpec[] = [
        { geo: new THREE.DodecahedronGeometry(0.36, 0), color: pal.skin, pos: [0, 0.26, 0] },
        { geo: new THREE.BoxGeometry(0.1, 0.1, 0.08), color: 0x12151f, pos: [-0.13, 0.28, 0.31] },
        { geo: new THREE.BoxGeometry(0.1, 0.1, 0.08), color: 0x12151f, pos: [0.13, 0.28, 0.31] },
        { geo: new THREE.CylinderGeometry(0.34, 0.38, 0.16, 7), color: pal.accent, pos: [0, 0.48, 0] },
      ];
      addHatParts(heroHeadParts, hatId, 0.6);
      attachOutlinedParts(headPivot, heroHeadParts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      leftArm.position.set(-0.44, 1.34, 0);
      rightArm.position.set(0.44, 1.34, 0);
      leftLeg.position.set(-0.19, 0.64, 0);
      rightLeg.position.set(0.19, 0.64, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

      attachOutlinedParts(leftArm, [{ geo: new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6), color: pal.primary, pos: [0, -0.25, 0] }], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightArm, [{ geo: new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6), color: pal.primary, pos: [0, -0.25, 0] }], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(leftLeg, [
        { geo: new THREE.CylinderGeometry(0.12, 0.1, 0.44, 6), color: pal.secondary, pos: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.22, 0.18, 0.3), color: pal.boots, pos: [0, -0.52, 0.05] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);
      attachOutlinedParts(rightLeg, [
        { geo: new THREE.CylinderGeometry(0.12, 0.1, 0.44, 6), color: pal.secondary, pos: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.22, 0.18, 0.3), color: pal.boots, pos: [0, -0.52, 0.05] },
      ], mainMat, outlineMat, outlineMeshes, geometriesToDispose);

      weaponPivot.position.set(0.05, -0.44, 0.18);
      rightArm.add(weaponPivot);
      attachOutlinedParts(
        weaponPivot,
        [
          { geo: new THREE.BoxGeometry(0.16, 1.05, 0.12), color: pal.weapon, pos: [0, 0.45, 0.18], rot: [0.35, 0, 0] },
          { geo: new THREE.OctahedronGeometry(0.14, 0), color: pal.weaponGlow, pos: [0, 0.98, 0.38] },
        ],
        mainMat,
        outlineMat,
        outlineMeshes,
        geometriesToDispose,
      );
    }

    return {
      characterId,
      root,
      bodyPivot,
      headPivot,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      tailPivot,
      capePivot,
      weaponPivot,
      boardPivot,
      wheelPivots,
      auraRing,
      toonMaterials,
      outlineMeshes,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- Articulated Boss Rig for EntStage1 (Lil Bark) ----

  public buildEntBossRig(): {
    root: THREE.Group;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    crownGroup: THREE.Group;
    toonMaterials: THREE.ShaderMaterial[];
    dispose: () => void;
  } {
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const barkMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.bark_grain,
      mapStrength: 0.65,
      vertexColors: true,
      rimStrength: 0.35,
      rimColor: 0xffd27d,
    });
    const eyeMat = createMkToonMaterial({
      color: 0xffb703,
      emissive: 0xff9500,
      emissiveIntensity: 1.4,
      rimStrength: 0.5,
      rimColor: 0xfff4c2,
    });
    const outlineMat = createOutlineMaterial(0.085, 0x0b0d14);
    toonMaterials.push(barkMat, eyeMat);
    extraMaterials.push(outlineMat);

    // Massive gnarled treant trunk + splayed root legs + cavernous face
    attachOutlinedParts(
      root,
      [
        // Main gnarled trunk
        { geo: new THREE.CylinderGeometry(1.15, 1.55, 3.6, 8), color: 0x734a2e, pos: [0, 2.2, 0] },
        { geo: new THREE.CylinderGeometry(1.45, 1.25, 1.35, 8), color: 0x664027, pos: [0, 3.85, 0.1] },
        // Splayed thick root legs
        { geo: new THREE.ConeGeometry(0.65, 1.8, 6), color: 0x5c3822, pos: [-0.95, 0.72, 0.65], rot: [0.45, 0, 0.42] },
        { geo: new THREE.ConeGeometry(0.65, 1.8, 6), color: 0x5c3822, pos: [0.95, 0.72, 0.65], rot: [0.45, 0, -0.42] },
        { geo: new THREE.ConeGeometry(0.62, 1.75, 6), color: 0x5c3822, pos: [-0.85, 0.72, -0.75], rot: [-0.45, 0, 0.38] },
        { geo: new THREE.ConeGeometry(0.62, 1.75, 6), color: 0x5c3822, pos: [0.85, 0.72, -0.75], rot: [-0.45, 0, -0.38] },
        // Heavy bark brow ridge & roaring mouth cavity
        { geo: new THREE.BoxGeometry(1.65, 0.42, 0.62), color: 0x4f301d, pos: [0, 3.55, 1.15] },
        { geo: new THREE.BoxGeometry(1.05, 0.68, 0.45), color: 0x1c120d, pos: [0, 2.55, 1.12] },
        // Mossy shoulder tufts
        { geo: new THREE.DodecahedronGeometry(0.75, 0), color: 0x59b842, pos: [-1.25, 4.1, 0.15] },
        { geo: new THREE.DodecahedronGeometry(0.75, 0), color: 0x59b842, pos: [1.25, 4.1, 0.15] },
      ],
      barkMat,
      outlineMat,
      outlines,
      geometriesToDispose,
    );

    // Glowing amber treant eyes!
    const eyeGeo = new THREE.BoxGeometry(0.36, 0.24, 0.22);
    geometriesToDispose.push(eyeGeo);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.46, 3.22, 1.3);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.46, 3.22, 1.3);
    root.add(leftEye, rightEye);

    // Massive mossy leafy crown with glowing amber mushrooms
    crownGroup.position.set(0, 4.45, 0);
    root.add(crownGroup);
    attachOutlinedParts(
      crownGroup,
      [
        { geo: new THREE.DodecahedronGeometry(1.85, 0), color: 0x4ca63d, pos: [0, 0.7, 0], scale: [1.25, 0.82, 1.15] },
        { geo: new THREE.DodecahedronGeometry(1.35, 0), color: 0x76cf4a, pos: [-1.1, 0.55, 0.4] },
        { geo: new THREE.DodecahedronGeometry(1.35, 0), color: 0x76cf4a, pos: [1.1, 0.6, -0.3] },
        { geo: new THREE.DodecahedronGeometry(1.2, 0), color: 0x9ce354, pos: [0, 1.45, 0.2] },
        // Glowing golden-amber crown mushrooms
        { geo: new THREE.ConeGeometry(0.42, 0.32, 6), color: 0xffb703, pos: [-0.8, 1.45, 0.85] },
        { geo: new THREE.ConeGeometry(0.36, 0.28, 6), color: 0xff9500, pos: [0.95, 1.25, 0.7] },
      ],
      barkMat,
      outlineMat,
      outlines,
      geometriesToDispose,
    );

    // Giant gnarled swinging branch arms
    leftArm.position.set(-1.55, 3.65, 0.15);
    rightArm.position.set(1.55, 3.65, 0.15);
    root.add(leftArm, rightArm);

    attachOutlinedParts(
      leftArm,
      [
        { geo: new THREE.CylinderGeometry(0.38, 0.48, 2.2, 6), color: 0x6e462b, pos: [-0.4, -0.9, 0.3], rot: [-0.35, 0, -0.28] },
        { geo: new THREE.DodecahedronGeometry(0.62, 0), color: 0x5c3822, pos: [-0.75, -1.95, 0.75] },
        { geo: new THREE.ConeGeometry(0.22, 0.85, 5), color: 0x8a5b3b, pos: [-0.9, -2.35, 1.05], rot: [0.55, 0, -0.2] },
        { geo: new THREE.DodecahedronGeometry(0.55, 0), color: 0x69c445, pos: [-0.55, -0.5, 0.2] },
      ],
      barkMat,
      outlineMat,
      outlines,
      geometriesToDispose,
    );
    attachOutlinedParts(
      rightArm,
      [
        { geo: new THREE.CylinderGeometry(0.38, 0.48, 2.2, 6), color: 0x6e462b, pos: [0.4, -0.9, 0.3], rot: [-0.35, 0, 0.28] },
        { geo: new THREE.DodecahedronGeometry(0.62, 0), color: 0x5c3822, pos: [0.75, -1.95, 0.75] },
        { geo: new THREE.ConeGeometry(0.22, 0.85, 5), color: 0x8a5b3b, pos: [0.9, -2.35, 1.05], rot: [0.55, 0, 0.2] },
        { geo: new THREE.DodecahedronGeometry(0.55, 0), color: 0x69c445, pos: [0.55, -0.5, 0.2] },
      ],
      barkMat,
      outlineMat,
      outlines,
      geometriesToDispose,
    );

    return {
      root,
      leftArm,
      rightArm,
      crownGroup,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- Enemy Archetype Low-Poly Geometry Pairs (For Zero-GC InstancedMesh Pools) ----

  public normalizeEnemyArchetype(enemyId: string): string {
    const id = enemyId.toLowerCase();
    if (id === 'entstage1' || id.includes('ent') || id.includes('bark')) return 'EntStage1';
    if (id === 'minibossgolem' || id.includes('golem')) return 'MinibossGolem';
    if (id === 'minibosspig' || id.includes('pig') || id.includes('boar')) return 'MinibossPig';
    if (id === 'goblinstrong' || id.includes('strong') || id.includes('brute') || id.includes('orc')) return 'GoblinStrong';
    if (id.includes('goblin')) return 'Goblin';
    if (id.includes('skeleton') || id.includes('bone') || id.includes('mummy')) return 'Skeleton';
    if (id.includes('slime') || id.includes('blob')) return 'Slime';
    if (id === 'ghostinvincible' || id.includes('steve') || id.includes('invincible')) return 'GhostInvincible';
    if (id === 'ghostred' || id.includes('redghost')) return 'GhostRed';
    if (id === 'ghostpurple' || id.includes('purple') || id.includes('wraith')) return 'GhostPurple';
    if (id.includes('ghost') || id.includes('specter') || id.includes('bob')) return 'Ghost';
    return 'Goblin';
  }

  public getEnemyGeometryPair(archetypeKey: string): LowPolyGeometryPair {
    const key = this.normalizeEnemyArchetype(archetypeKey);
    const cached = this.enemyCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'Goblin':
        // Hunched emerald goblin with big lateral pointed ears, bulbous nose, yellow eyes & raised club
        pair = makePair(
          [
            // Hunched torso + leather loincloth
            { geo: new THREE.CylinderGeometry(0.28, 0.34, 0.65, 6), color: 0x45b849, pos: [0, 0.72, 0.05], rot: [0.22, 0, 0] },
            { geo: new THREE.CylinderGeometry(0.34, 0.36, 0.24, 6), color: 0x73492b, pos: [0, 0.45, 0] },
            // Legs
            { geo: new THREE.CylinderGeometry(0.1, 0.09, 0.42, 5), color: 0x389c3d, pos: [-0.16, 0.22, 0] },
            { geo: new THREE.CylinderGeometry(0.1, 0.09, 0.42, 5), color: 0x389c3d, pos: [0.16, 0.22, 0] },
            // Head + bulbous snout
            { geo: new THREE.DodecahedronGeometry(0.32, 0), color: 0x54cf57, pos: [0, 1.18, 0.14] },
            { geo: new THREE.ConeGeometry(0.1, 0.26, 4), color: 0x62db65, pos: [0, 1.15, 0.46], rot: [Math.PI * 0.5, 0, 0] },
            // Iconic huge lateral pointed goblin ears
            { geo: new THREE.ConeGeometry(0.11, 0.48, 4), color: 0x45b849, pos: [-0.46, 1.24, 0.1], rot: [0, 0, 1.22] },
            { geo: new THREE.ConeGeometry(0.11, 0.48, 4), color: 0x45b849, pos: [0.46, 1.24, 0.1], rot: [0, 0, -1.22] },
            // Fierce glowing yellow eyes
            { geo: new THREE.BoxGeometry(0.1, 0.08, 0.06), color: 0xffe03b, pos: [-0.12, 1.24, 0.4] },
            { geo: new THREE.BoxGeometry(0.1, 0.08, 0.06), color: 0xffe03b, pos: [0.12, 1.24, 0.4] },
            // Raised wooden spiked club in right hand
            { geo: new THREE.CylinderGeometry(0.08, 0.07, 0.42, 5), color: 0x45b849, pos: [0.38, 0.92, 0.18], rot: [-0.8, 0, -0.3] },
            { geo: new THREE.CylinderGeometry(0.14, 0.06, 0.78, 6), color: 0x8a5632, pos: [0.48, 1.26, 0.44], rot: [0.45, 0, -0.15] },
          ],
          'character_palette',
          0.052,
        );
        break;

      case 'GoblinStrong':
        // Armored horned brute with iron pauldrons, crimson crest & heavy axe
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.46, 0.42, 0.96, 6), color: 0x2c8a43, pos: [0, 1.0, 0] },
            { geo: new THREE.BoxGeometry(0.92, 0.42, 0.54), color: 0x4d596b, pos: [0, 1.18, 0] },
            { geo: new THREE.DodecahedronGeometry(0.28, 0), color: 0x627085, pos: [-0.56, 1.38, 0] },
            { geo: new THREE.DodecahedronGeometry(0.28, 0), color: 0x627085, pos: [0.56, 1.38, 0] },
            // Stout legs
            { geo: new THREE.BoxGeometry(0.24, 0.54, 0.26), color: 0x247337, pos: [-0.22, 0.28, 0] },
            { geo: new THREE.BoxGeometry(0.24, 0.54, 0.26), color: 0x247337, pos: [0.22, 0.28, 0] },
            // Horned brute head + iron helm
            { geo: new THREE.DodecahedronGeometry(0.36, 0), color: 0x39a350, pos: [0, 1.66, 0.1] },
            { geo: new THREE.CylinderGeometry(0.38, 0.4, 0.26, 7), color: 0x4d596b, pos: [0, 1.84, 0.08] },
            { geo: new THREE.ConeGeometry(0.1, 0.45, 5), color: 0xf2ebd9, pos: [-0.36, 2.02, 0.12], rot: [0.2, 0, 0.55] },
            { geo: new THREE.ConeGeometry(0.1, 0.45, 5), color: 0xf2ebd9, pos: [0.36, 2.02, 0.12], rot: [0.2, 0, -0.55] },
            { geo: new THREE.BoxGeometry(0.12, 0.08, 0.06), color: 0xff4d4d, pos: [-0.14, 1.68, 0.42] },
            { geo: new THREE.BoxGeometry(0.12, 0.08, 0.06), color: 0xff4d4d, pos: [0.14, 1.68, 0.42] },
            // Heavy battleaxe
            { geo: new THREE.CylinderGeometry(0.06, 0.06, 1.35, 6), color: 0x6e4326, pos: [0.64, 1.25, 0.42], rot: [0.5, 0, -0.2] },
            { geo: new THREE.BoxGeometry(0.42, 0.36, 0.12), color: 0xc2d0e0, pos: [0.74, 1.72, 0.72], rot: [0.5, 0, -0.2] },
          ],
          'character_palette',
          0.058,
          { gloss: 0.35 },
        );
        break;

      case 'Skeleton':
        // Ivory bone warrior with skull, exposed ribs, tattered purple sash & curved blade
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.07, 0.08, 0.72, 6), color: 0xf2ebd9, pos: [0, 1.0, 0] },
            { geo: new THREE.BoxGeometry(0.5, 0.09, 0.3), color: 0xf2ebd9, pos: [0, 1.24, 0] },
            { geo: new THREE.BoxGeometry(0.44, 0.08, 0.26), color: 0xf2ebd9, pos: [0, 1.08, 0] },
            { geo: new THREE.BoxGeometry(0.36, 0.08, 0.22), color: 0xf2ebd9, pos: [0, 0.92, 0] },
            { geo: new THREE.BoxGeometry(0.42, 0.28, 0.3), color: 0x5c377d, pos: [0, 0.66, 0] },
            // Legs
            { geo: new THREE.CylinderGeometry(0.065, 0.06, 0.56, 5), color: 0xede4ce, pos: [-0.16, 0.28, 0] },
            { geo: new THREE.CylinderGeometry(0.065, 0.06, 0.56, 5), color: 0xede4ce, pos: [0.16, 0.28, 0] },
            // Skull + sunken glowing sockets
            { geo: new THREE.DodecahedronGeometry(0.32, 0), color: 0xfaf5e6, pos: [0, 1.62, 0.04] },
            { geo: new THREE.BoxGeometry(0.26, 0.14, 0.2), color: 0xfaf5e6, pos: [0, 1.4, 0.14] },
            { geo: new THREE.BoxGeometry(0.11, 0.11, 0.08), color: 0x141724, pos: [-0.11, 1.62, 0.31] },
            { geo: new THREE.BoxGeometry(0.11, 0.11, 0.08), color: 0x141724, pos: [0.11, 1.62, 0.31] },
            // Curved notched bone-warrior sword
            { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.48, 5), color: 0xf2ebd9, pos: [0.38, 1.06, 0.16], rot: [-0.7, 0, -0.2] },
            { geo: new THREE.BoxGeometry(0.14, 0.92, 0.08), color: 0xb8c5d6, pos: [0.46, 1.44, 0.5], rot: [0.55, 0, 0] },
          ],
          'bone_ivory',
          0.048,
        );
        break;

      case 'Slime':
        // Chunky cel-shaded gelatinous blob with inner dark core, fierce eyes & golden crown!
        pair = makePair(
          [
            // Main faceted gelatinous body
            { geo: new THREE.DodecahedronGeometry(0.68, 0), color: 0x3ce8c6, pos: [0, 0.52, 0], scale: [1.18, 0.85, 1.15] },
            // Beveled skirt droplets
            { geo: new THREE.DodecahedronGeometry(0.28, 0), color: 0x2ad1b0, pos: [-0.52, 0.2, 0.3] },
            { geo: new THREE.DodecahedronGeometry(0.26, 0), color: 0x2ad1b0, pos: [0.52, 0.18, -0.22] },
            { geo: new THREE.DodecahedronGeometry(0.24, 0), color: 0x2ad1b0, pos: [0.1, 0.18, -0.58] },
            // Cute angry eyes
            { geo: new THREE.BoxGeometry(0.14, 0.16, 0.1), color: 0x121824, pos: [-0.22, 0.58, 0.68] },
            { geo: new THREE.BoxGeometry(0.14, 0.16, 0.1), color: 0x121824, pos: [0.22, 0.58, 0.68] },
            { geo: new THREE.BoxGeometry(0.06, 0.06, 0.11), color: 0xffffff, pos: [-0.19, 0.62, 0.69] },
            { geo: new THREE.BoxGeometry(0.06, 0.06, 0.11), color: 0xffffff, pos: [0.25, 0.62, 0.69] },
            // Tiny golden slime crown on top!
            { geo: new THREE.CylinderGeometry(0.24, 0.18, 0.2, 6), color: 0xffd23f, pos: [0, 1.12, 0] },
            { geo: new THREE.OctahedronGeometry(0.07, 0), color: 0xff3b5c, pos: [0, 1.16, 0.2] },
          ],
          'slime_gel',
          0.052,
          { gloss: 0.72 },
        );
        break;

      case 'MinibossGolem':
        // Towering mossy stone colossus with huge asymmetrical boulder shoulders & glowing cyan cracks!
        pair = makePair(
          [
            // Huge blocky stone torso
            { geo: new THREE.DodecahedronGeometry(1.12, 0), color: 0x788794, pos: [0, 1.85, 0], scale: [1.18, 1.05, 0.9] },
            // Glowing cyan core & fissure ribs
            { geo: new THREE.OctahedronGeometry(0.42, 0), color: 0x4df7ff, pos: [0, 1.95, 0.85] },
            { geo: new THREE.BoxGeometry(0.95, 0.12, 0.16), color: 0x4df7ff, pos: [0, 1.55, 0.88] },
            // Huge mossy boulder shoulders
            { geo: new THREE.DodecahedronGeometry(0.74, 0), color: 0x6c7c8a, pos: [-1.25, 2.38, 0.05] },
            { geo: new THREE.DodecahedronGeometry(0.48, 0), color: 0x5ab846, pos: [-1.25, 2.9, 0.05] },
            { geo: new THREE.DodecahedronGeometry(0.78, 0), color: 0x6c7c8a, pos: [1.28, 2.42, -0.05] },
            { geo: new THREE.DodecahedronGeometry(0.5, 0), color: 0x5ab846, pos: [1.28, 2.94, -0.05] },
            // Heavy stone arms & crushing fists
            { geo: new THREE.BoxGeometry(0.55, 1.35, 0.55), color: 0x70808f, pos: [-1.36, 1.35, 0.2] },
            { geo: new THREE.DodecahedronGeometry(0.52, 0), color: 0x5c6b78, pos: [-1.4, 0.62, 0.35] },
            { geo: new THREE.BoxGeometry(0.55, 1.35, 0.55), color: 0x70808f, pos: [1.36, 1.35, 0.2] },
            { geo: new THREE.DodecahedronGeometry(0.52, 0), color: 0x5c6b78, pos: [1.4, 0.62, 0.35] },
            // Pillar legs
            { geo: new THREE.BoxGeometry(0.58, 1.05, 0.62), color: 0x5c6b78, pos: [-0.52, 0.52, 0] },
            { geo: new THREE.BoxGeometry(0.58, 1.05, 0.62), color: 0x5c6b78, pos: [0.52, 0.52, 0] },
            // Stone head block + glowing cyan visor eye
            { geo: new THREE.BoxGeometry(0.86, 0.72, 0.8), color: 0x8595a3, pos: [0, 3.02, 0.14] },
            { geo: new THREE.BoxGeometry(0.58, 0.16, 0.12), color: 0x5cf7ff, pos: [0, 3.04, 0.54] },
          ],
          'stone_golem',
          0.072,
          { emissiveHex: 0x168099, emissiveIntensity: 0.22 },
        );
        break;

      case 'MinibossPig':
        // Chunky armored war-boar / tusker with curved ivory tusks & crimson mohawk bristles!
        pair = makePair(
          [
            // Barrel boar body + iron armor harness
            { geo: new THREE.DodecahedronGeometry(0.95, 0), color: 0xc97b70, pos: [0, 1.08, 0], scale: [1.05, 0.92, 1.38] },
            { geo: new THREE.BoxGeometry(1.56, 0.82, 1.15), color: 0x4b5563, pos: [0, 1.24, 0.05] },
            { geo: new THREE.BoxGeometry(1.66, 0.16, 1.24), color: 0xffc83b, pos: [0, 1.24, 0.05] },
            // Crimson dorsal mohawk bristles
            { geo: new THREE.ConeGeometry(0.22, 0.52, 4), color: 0xd62839, pos: [0, 1.88, 0.45] },
            { geo: new THREE.ConeGeometry(0.22, 0.56, 4), color: 0xd62839, pos: [0, 1.9, 0.0] },
            { geo: new THREE.ConeGeometry(0.2, 0.48, 4), color: 0xd62839, pos: [0, 1.84, -0.45] },
            // Snout + huge curved ivory tusks!
            { geo: new THREE.CylinderGeometry(0.36, 0.46, 0.52, 7), color: 0xe6978c, pos: [0, 1.0, 1.34], rot: [Math.PI * 0.5, 0, 0] },
            { geo: new THREE.ConeGeometry(0.14, 0.72, 5), color: 0xfff8e6, pos: [-0.46, 1.18, 1.44], rot: [0.75, 0, 0.35] },
            { geo: new THREE.ConeGeometry(0.14, 0.72, 5), color: 0xfff8e6, pos: [0.46, 1.18, 1.44], rot: [0.75, 0, -0.35] },
            // Angry glowing eyes
            { geo: new THREE.BoxGeometry(0.18, 0.12, 0.1), color: 0xffd23f, pos: [-0.42, 1.38, 1.06] },
            { geo: new THREE.BoxGeometry(0.18, 0.12, 0.1), color: 0xffd23f, pos: [0.42, 1.38, 1.06] },
            // 4 stout armored hooves
            { geo: new THREE.CylinderGeometry(0.2, 0.18, 0.62, 6), color: 0x3b3033, pos: [-0.54, 0.31, 0.62] },
            { geo: new THREE.CylinderGeometry(0.2, 0.18, 0.62, 6), color: 0x3b3033, pos: [0.54, 0.31, 0.62] },
            { geo: new THREE.CylinderGeometry(0.2, 0.18, 0.62, 6), color: 0x3b3033, pos: [-0.54, 0.31, -0.62] },
            { geo: new THREE.CylinderGeometry(0.2, 0.18, 0.62, 6), color: 0x3b3033, pos: [0.54, 0.31, -0.62] },
          ],
          'character_palette',
          0.068,
        );
        break;

      case 'EntStage1':
        // Compact fallback instanced treant (live boss uses articulated buildEntBossRig())
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.85, 1.2, 2.8, 7), color: 0x734a2e, pos: [0, 1.4, 0] },
            { geo: new THREE.DodecahedronGeometry(1.5, 0), color: 0x54b543, pos: [0, 3.2, 0] },
            { geo: new THREE.BoxGeometry(0.28, 0.2, 0.2), color: 0xffb703, pos: [-0.36, 2.0, 0.92] },
            { geo: new THREE.BoxGeometry(0.28, 0.2, 0.2), color: 0xffb703, pos: [0.36, 2.0, 0.92] },
          ],
          'bark_grain',
          0.075,
        );
        break;

      case 'Ghost':
      case 'GhostPurple':
      case 'GhostRed':
      case 'GhostInvincible': {
        const isSteve = key === 'GhostInvincible';
        const cloakColor =
          key === 'GhostInvincible'
            ? 0x1a0c26
            : key === 'GhostRed'
              ? 0xb8253b
              : key === 'GhostPurple'
                ? 0x7332b8
                : 0x62d9f2;
        const eyeColor =
          key === 'GhostInvincible'
            ? 0xff2e54
            : key === 'GhostRed'
              ? 0xffe042
              : key === 'GhostPurple'
                ? 0xff66f5
                : 0xffffff;
        const parts: ColoredPartSpec[] = [
          // Flowing hooded cloak body
          { geo: new THREE.ConeGeometry(0.56, 1.45, 7), color: cloakColor, pos: [0, 1.05, 0] },
          // Tattered jagged floating hem spikes
          { geo: new THREE.ConeGeometry(0.2, 0.48, 4), color: cloakColor, pos: [-0.36, 0.34, 0.16], rot: [Math.PI, 0, 0.15] },
          { geo: new THREE.ConeGeometry(0.2, 0.54, 4), color: cloakColor, pos: [0.36, 0.32, 0.16], rot: [Math.PI, 0, -0.15] },
          { geo: new THREE.ConeGeometry(0.22, 0.56, 4), color: cloakColor, pos: [0, 0.3, -0.36], rot: [Math.PI, 0, 0] },
          // Deep pointed cowl hood + void face interior
          { geo: new THREE.DodecahedronGeometry(0.42, 0), color: cloakColor, pos: [0, 1.72, 0.02] },
          { geo: new THREE.ConeGeometry(0.32, 0.52, 5), color: cloakColor, pos: [0, 2.04, -0.18], rot: [-0.55, 0, 0] },
          { geo: new THREE.BoxGeometry(0.42, 0.38, 0.24), color: 0x0b0c14, pos: [0, 1.66, 0.26] },
          // Glowing menacing eyes
          { geo: new THREE.BoxGeometry(0.12, 0.09, 0.08), color: eyeColor, pos: [-0.12, 1.7, 0.39] },
          { geo: new THREE.BoxGeometry(0.12, 0.09, 0.08), color: eyeColor, pos: [0.12, 1.7, 0.39] },
          // Spectral reaching sleeves
          { geo: new THREE.ConeGeometry(0.18, 0.65, 5), color: cloakColor, pos: [-0.54, 1.18, 0.24], rot: [1.1, 0, 0.35] },
          { geo: new THREE.ConeGeometry(0.18, 0.65, 5), color: cloakColor, pos: [0.54, 1.18, 0.24], rot: [1.1, 0, -0.35] },
        ];
        if (isSteve) {
          // Spooky Steve blazing golden-crimson crown!
          parts.push({ geo: new THREE.CylinderGeometry(0.4, 0.32, 0.28, 6), color: 0xffd23f, pos: [0, 2.18, 0.02] });
          parts.push({ geo: new THREE.OctahedronGeometry(0.14, 0), color: 0xff2ec4, pos: [0, 2.24, 0.32] });
        }
        pair = makePair(parts, 'character_palette', isSteve ? 0.072 : 0.052, {
          emissiveHex: isSteve ? 0x6b0f32 : cloakColor,
          emissiveIntensity: isSteve ? 0.45 : 0.22,
        });
        break;
      }

      default:
        pair = this.getEnemyGeometryPair('Goblin');
        break;
    }

    this.enemyCache.set(key, pair);
    return pair;
  }

  // ---- Stylized Forest Props (Trees, Rocks, Ruins) ----

  public getPropGeometryPair(kind: 'pine' | 'oak' | 'boulder' | 'ruin_pillar' | 'cactus' | 'tombstone'): LowPolyGeometryPair {
    const cached = this.propCache.get(kind);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'pine':
        // Stepped faceted low-poly pine tree with 3 lush tiered hexagonal canopies!
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.28, 0.48, 2.4, 6), color: 0x7d4f32, pos: [0, 1.2, 0] },
            { geo: new THREE.ConeGeometry(2.15, 2.4, 7), color: 0x3b9e47, pos: [0, 2.85, 0] },
            { geo: new THREE.ConeGeometry(1.7, 2.25, 7), color: 0x52bd4c, pos: [0, 4.35, 0], rot: [0, 0.45, 0] },
            { geo: new THREE.ConeGeometry(1.18, 1.95, 7), color: 0x7ee058, pos: [0, 5.75, 0], rot: [0, 0.9, 0] },
          ],
          'foliage_pine',
          0.075,
        );
        break;

      case 'oak':
        // Stylized chunky oak tree with forked trunk & clustered faceted foliage blobs!
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.38, 0.62, 2.8, 7), color: 0x855436, pos: [0, 1.4, 0] },
            { geo: new THREE.CylinderGeometry(0.2, 0.32, 1.4, 6), color: 0x7d4d31, pos: [-0.65, 2.6, 0.25], rot: [0.15, 0, 0.58] },
            { geo: new THREE.CylinderGeometry(0.2, 0.32, 1.4, 6), color: 0x7d4d31, pos: [0.65, 2.65, -0.2], rot: [-0.15, 0, -0.55] },
            // Clustered lush leafy canopy tiers
            { geo: new THREE.DodecahedronGeometry(1.65, 0), color: 0x4eb043, pos: [0, 3.85, 0] },
            { geo: new THREE.DodecahedronGeometry(1.28, 0), color: 0x6ecc4b, pos: [-1.15, 3.45, 0.5] },
            { geo: new THREE.DodecahedronGeometry(1.25, 0), color: 0x6ecc4b, pos: [1.15, 3.55, -0.45] },
            { geo: new THREE.DodecahedronGeometry(1.1, 0), color: 0x9ce354, pos: [0.15, 4.75, 0.25] },
          ],
          'foliage_oak',
          0.08,
        );
        break;

      case 'boulder':
        // Chiseled low-poly cliff rock with bright moss cap
        pair = makePair(
          [
            { geo: new THREE.DodecahedronGeometry(1.15, 0), color: 0x798f9e, pos: [0, 0.65, 0], scale: [1.22, 0.78, 1.05] },
            { geo: new THREE.DodecahedronGeometry(0.75, 0), color: 0x627887, pos: [0.75, 0.42, 0.45], scale: [1.0, 0.72, 1.1] },
            { geo: new THREE.DodecahedronGeometry(0.72, 0), color: 0x6bc949, pos: [-0.1, 1.18, -0.05], scale: [1.25, 0.36, 1.15] },
          ],
          'terrain_cliff',
          0.072,
        );
        break;

      case 'ruin_pillar':
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(1.45, 0.42, 1.45), color: 0x6e7d8f, pos: [0, 0.21, 0] },
            { geo: new THREE.CylinderGeometry(0.48, 0.56, 3.4, 8), color: 0x8d9dad, pos: [0, 2.05, 0] },
            { geo: new THREE.BoxGeometry(1.3, 0.35, 1.3), color: 0x768596, pos: [0, 3.85, 0], rot: [0.08, 0.2, 0.06] },
            { geo: new THREE.DodecahedronGeometry(0.55, 0), color: 0x64c246, pos: [0.35, 4.08, 0.2], scale: [1.2, 0.45, 1.1] },
          ],
          'shrine_rune',
          0.07,
        );
        break;

      case 'cactus':
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.35, 0.42, 3.4, 7), color: 0x4ca642, pos: [0, 1.7, 0] },
            { geo: new THREE.CylinderGeometry(0.24, 0.26, 1.2, 6), color: 0x45993b, pos: [-0.65, 2.2, 0], rot: [0, 0, 0.65] },
            { geo: new THREE.CylinderGeometry(0.24, 0.26, 1.1, 6), color: 0x45993b, pos: [0.62, 1.75, 0], rot: [0, 0, -0.65] },
            { geo: new THREE.OctahedronGeometry(0.22, 0), color: 0xff5c8a, pos: [0, 3.48, 0] },
          ],
          'foliage_pine',
          0.068,
        );
        break;

      case 'tombstone':
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(1.35, 0.32, 0.8), color: 0x4a5568, pos: [0, 0.16, 0] },
            { geo: new THREE.BoxGeometry(1.05, 1.75, 0.38), color: 0x6e7b8f, pos: [0, 1.12, 0], rot: [0, 0, 0.05] },
            { geo: new THREE.CylinderGeometry(0.52, 0.52, 0.38, 8), color: 0x6e7b8f, pos: [0, 1.98, 0], rot: [Math.PI * 0.5, 0, 0] },
          ],
          'terrain_graveyard',
          0.065,
        );
        break;
    }

    this.propCache.set(kind, pair);
    return pair;
  }

  // ---- Interactables & World Structures ----

  public getInteractableGeometryPair(
    kind: InteractableKind | 'BossPortal' | 'BossPylon',
    variant: InteractableVariant = 'normal',
    used = false,
  ): LowPolyGeometryPair {
    const cacheKey = `${kind}:${variant}:${used ? '1' : '0'}`;
    const cached = this.interactableCache.get(cacheKey);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'ChargeShrine': {
        const isGold = variant === 'golden';
        const stone = isGold ? 0xd9a73b : 0x768699;
        const crystal = used ? 0x4e6173 : isGold ? 0xffe45e : 0x4df5ff;
        pair = makePair(
          [
            // Stepped stone plinth
            { geo: new THREE.CylinderGeometry(1.25, 1.48, 0.45, 8), color: isGold ? 0xb58326 : 0x566475, pos: [0, 0.22, 0] },
            { geo: new THREE.CylinderGeometry(0.88, 1.05, 0.36, 8), color: stone, pos: [0, 0.62, 0] },
            // Tapered carved obelisk shaft
            { geo: new THREE.CylinderGeometry(0.42, 0.68, 2.85, 6), color: stone, pos: [0, 2.2, 0] },
            // Floating glowing rune crystal crown
            { geo: new THREE.OctahedronGeometry(0.52, 0), color: crystal, pos: [0, 4.15, 0], scale: [0.85, 1.38, 0.85] },
            { geo: new THREE.TorusGeometry(0.74, 0.075, 5, 8), color: isGold ? 0xffe45e : 0x62f5ff, pos: [0, 4.15, 0], rot: [Math.PI * 0.5, 0, 0] },
          ],
          'shrine_rune',
          0.068,
          {
            emissiveHex: used ? 0x000000 : isGold ? 0xffb703 : 0x1fc7e8,
            emissiveIntensity: used ? 0 : 0.35,
          },
        );
        break;
      }

      case 'Chest': {
        const wood =
          variant === 'evil'
            ? 0x4a1e3d
            : variant === 'ghost'
              ? 0x2a6c85
              : variant === 'free'
                ? 0x2d7a47
                : variant === 'golden'
                  ? 0xe8b22c
                  : 0x9c5c2d;
        const trim =
          variant === 'evil'
            ? 0xff3864
            : variant === 'ghost'
              ? 0x70f5ff
              : variant === 'free'
                ? 0x7df76d
                : 0xffd23f;
        const lidRotX = used ? -1.15 : 0;
        const lidY = used ? 1.18 : 0.92;
        const lidZ = used ? -0.34 : 0;
        pair = makePair(
          [
            // Lower chest box
            { geo: new THREE.BoxGeometry(1.36, 0.72, 0.92), color: wood, pos: [0, 0.36, 0] },
            // Gold corner & lock trim
            { geo: new THREE.BoxGeometry(1.42, 0.14, 0.98), color: trim, pos: [0, 0.68, 0] },
            { geo: new THREE.BoxGeometry(0.24, 0.28, 0.12), color: trim, pos: [0, 0.66, 0.48] },
            // Domed lid (pops open when used!)
            { geo: new THREE.CylinderGeometry(0.46, 0.46, 1.38, 7), color: wood, pos: [0, lidY, lidZ], rot: [lidRotX, 0, Math.PI * 0.5] },
            { geo: new THREE.BoxGeometry(0.16, 0.5, 0.96), color: trim, pos: [-0.46, lidY, lidZ], rot: [lidRotX, 0, 0] },
            { geo: new THREE.BoxGeometry(0.16, 0.5, 0.96), color: trim, pos: [0.46, lidY, lidZ], rot: [lidRotX, 0, 0] },
          ],
          'chest_wood',
          0.056,
          { emissiveHex: used ? 0x000000 : trim, emissiveIntensity: used ? 0 : 0.16, gloss: 0.4 },
        );
        break;
      }

      case 'Pot': {
        if (variant === 'pumpkin') {
          pair = makePair(
            [
              { geo: new THREE.DodecahedronGeometry(0.62, 0), color: 0xf27127, pos: [0, 0.55, 0], scale: [1.12, 0.88, 1.12] },
              { geo: new THREE.CylinderGeometry(0.08, 0.12, 0.3, 5), color: 0x3b8532, pos: [0, 1.1, 0], rot: [0.15, 0, 0.2] },
            ],
            'character_palette',
            0.05,
          );
        } else if (variant === 'tumbleweed') {
          pair = makePair(
            [
              { geo: new THREE.IcosahedronGeometry(0.64, 0), color: 0xc29353, pos: [0, 0.64, 0] },
            ],
            'bark_grain',
            0.048,
          );
        } else {
          pair = makePair(
            [
              { geo: new THREE.CylinderGeometry(0.32, 0.42, 0.32, 8), color: 0xd97a48, pos: [0, 0.16, 0] },
              { geo: new THREE.DodecahedronGeometry(0.56, 0), color: 0xe68a55, pos: [0, 0.62, 0], scale: [1.0, 1.05, 1.0] },
              { geo: new THREE.CylinderGeometry(0.36, 0.26, 0.26, 8), color: 0xc96b3a, pos: [0, 1.12, 0] },
              { geo: new THREE.TorusGeometry(0.34, 0.07, 5, 8), color: 0xf2c97e, pos: [0, 1.24, 0], rot: [Math.PI * 0.5, 0, 0] },
            ],
            'ceramic_pot',
            0.048,
          );
        }
        break;
      }

      case 'BossSpawner':
        // Ominous horned skull altar with crimson glowing runes!
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(1.75, 2.05, 0.45, 8), color: 0x262033, pos: [0, 0.22, 0] },
            { geo: new THREE.CylinderGeometry(1.25, 1.55, 0.55, 8), color: 0x382d4a, pos: [0, 0.72, 0] },
            { geo: new THREE.CylinderGeometry(0.75, 0.92, 1.35, 8), color: 0x2d243b, pos: [0, 1.62, 0] },
            // Giant ominous horned skull on top
            { geo: new THREE.DodecahedronGeometry(0.84, 0), color: 0xf2ebd9, pos: [0, 2.75, 0.1] },
            { geo: new THREE.BoxGeometry(0.62, 0.34, 0.48), color: 0xe6dec8, pos: [0, 2.25, 0.32] },
            { geo: new THREE.BoxGeometry(0.24, 0.22, 0.16), color: 0xff2644, pos: [-0.28, 2.78, 0.78] },
            { geo: new THREE.BoxGeometry(0.24, 0.22, 0.16), color: 0xff2644, pos: [0.28, 2.78, 0.78] },
            { geo: new THREE.ConeGeometry(0.2, 0.95, 5), color: 0x3b2c40, pos: [-0.72, 3.32, 0], rot: [0.1, 0, 0.58] },
            { geo: new THREE.ConeGeometry(0.2, 0.95, 5), color: 0x3b2c40, pos: [0.72, 3.32, 0], rot: [0.1, 0, -0.58] },
          ],
          'terrain_citadel',
          0.075,
          { emissiveHex: used ? 0x241630 : 0xcc1838, emissiveIntensity: used ? 0.05 : 0.38 },
        );
        break;

      case 'BossPortal':
        // Massive carved obsidian-and-rune archway framing the swirling portal vortex!
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(5.6, 0.55, 1.8), color: 0x2d2642, pos: [0, 0.28, 0] },
            { geo: new THREE.BoxGeometry(0.95, 5.2, 1.05), color: 0x3f365c, pos: [-2.15, 3.0, 0] },
            { geo: new THREE.BoxGeometry(0.95, 5.2, 1.05), color: 0x3f365c, pos: [2.15, 3.0, 0] },
            { geo: new THREE.BoxGeometry(5.6, 1.0, 1.2), color: 0x4c4170, pos: [0, 5.75, 0] },
            { geo: new THREE.OctahedronGeometry(0.65, 0), color: 0x5cf7ff, pos: [0, 6.75, 0] },
            { geo: new THREE.OctahedronGeometry(0.36, 0), color: 0xd946ef, pos: [-2.15, 5.95, 0.55] },
            { geo: new THREE.OctahedronGeometry(0.36, 0), color: 0xd946ef, pos: [2.15, 5.95, 0.55] },
          ],
          'shrine_rune',
          0.085,
          { emissiveHex: 0x7b2cbf, emissiveIntensity: 0.4 },
        );
        break;

      case 'BossPylon':
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(1.1, 1.35, 0.6, 6), color: 0x2a1f3d, pos: [0, 0.3, 0] },
            { geo: new THREE.CylinderGeometry(0.5, 0.78, 3.8, 6), color: 0x3d2c59, pos: [0, 2.4, 0] },
            { geo: new THREE.OctahedronGeometry(0.68, 0), color: used ? 0x4dff9e : 0xff2ec4, pos: [0, 4.95, 0], scale: [0.85, 1.4, 0.85] },
          ],
          'terrain_citadel',
          0.075,
          { emissiveHex: used ? 0x1fc77e : 0xc91e94, emissiveIntensity: 0.45 },
        );
        break;

      case 'ShrineMoai':
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(1.55, 2.75, 1.15), color: 0x808f9e, pos: [0, 1.38, 0] },
            { geo: new THREE.BoxGeometry(1.62, 0.38, 0.55), color: 0x6c7a89, pos: [0, 2.22, 0.55] },
            { geo: new THREE.BoxGeometry(0.38, 1.02, 0.52), color: 0x95a5b5, pos: [0, 1.55, 0.65] },
            { geo: new THREE.BoxGeometry(0.86, 0.16, 0.2), color: 0x4a5568, pos: [0, 0.78, 0.58] },
          ],
          'terrain_cliff',
          0.072,
        );
        break;

      case 'ShadyGuy':
        pair = makePair(
          [
            { geo: new THREE.ConeGeometry(0.68, 1.85, 7), color: 0x2b2540, pos: [0, 0.92, 0] },
            { geo: new THREE.DodecahedronGeometry(0.45, 0), color: 0x3b3159, pos: [0, 1.98, 0] },
            { geo: new THREE.BoxGeometry(0.12, 0.08, 0.08), color: 0xffd23f, pos: [-0.14, 2.0, 0.38] },
            { geo: new THREE.BoxGeometry(0.12, 0.08, 0.08), color: 0xffd23f, pos: [0.14, 2.0, 0.38] },
            { geo: new THREE.BoxGeometry(0.72, 0.65, 0.72), color: 0x8f562e, pos: [0.95, 0.32, 0.25] },
            { geo: new THREE.OctahedronGeometry(0.24, 0), color: 0x52f2ff, pos: [0.95, 0.88, 0.25] },
          ],
          'character_palette',
          0.058,
        );
        break;

      case 'Microwave':
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(1.4, 0.7, 1.1), color: 0x5e6b7a, pos: [0, 0.35, 0] },
            { geo: new THREE.BoxGeometry(1.5, 0.95, 0.95), color: 0xebe4d1, pos: [0, 1.18, 0] },
            { geo: new THREE.BoxGeometry(0.88, 0.62, 0.1), color: 0x38f2ff, pos: [-0.18, 1.18, 0.48] },
            { geo: new THREE.BoxGeometry(0.28, 0.62, 0.1), color: 0x2b3445, pos: [0.48, 1.18, 0.48] },
          ],
          'character_palette',
          0.058,
          { emissiveHex: 0x1fc7e8, emissiveIntensity: 0.25 },
        );
        break;

      default: {
        // Distinct color-coded monolith shrine for Greed / Challenge / Cursed / Magnet / Balance
        const accentMap: Record<string, number> = {
          ShrineGreed: 0xffd23f,
          ShrineChallenge: 0xff3b5c,
          ShrineCursed: 0xb938ff,
          ShrineMagnet: 0x38f2ff,
          ShrineBalance: 0x62f58d,
        };
        const accent = accentMap[kind] ?? 0x52f2ff;
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(1.05, 1.25, 0.45, 7), color: 0x526070, pos: [0, 0.22, 0] },
            { geo: new THREE.CylinderGeometry(0.46, 0.62, 2.35, 6), color: 0x768699, pos: [0, 1.58, 0] },
            { geo: new THREE.OctahedronGeometry(0.55, 0), color: used ? 0x4f5d6b : accent, pos: [0, 3.25, 0] },
          ],
          'shrine_rune',
          0.064,
          { emissiveHex: used ? 0x000000 : accent, emissiveIntensity: used ? 0 : 0.35 },
        );
        break;
      }
    }

    this.interactableCache.set(cacheKey, pair);
    return pair;
  }

  // ---- Distinct Projectile & Pickup Meshes ----

  public normalizeProjectileArchetype(weaponId: string): string {
    const id = weaponId.toLowerCase();
    if (id.includes('fire') || id.includes('flame') || id.includes('dragon')) return 'fireball';
    if (id.includes('bone')) return 'bone';
    if (id.includes('sword') || id.includes('katana') || id.includes('axe') || id.includes('scythe')) return 'sword_arc';
    if (id.includes('revolver') || id.includes('shotgun') || id.includes('bow')) return 'bullet';
    if (id.includes('chunker') || id.includes('rock') || id.includes('boulder')) return 'boulder';
    if (id.includes('lightning') || id.includes('bolt')) return 'lightning';
    if (id.includes('sniper') || id.includes('rail')) return 'sniper';
    return 'orb';
  }

  public getProjectileGeometryPair(kind: string): LowPolyGeometryPair {
    const key = this.normalizeProjectileArchetype(kind);
    const cached = this.projectileCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'fireball':
        pair = makePair(
          [
            { geo: new THREE.IcosahedronGeometry(0.42, 0), color: 0xffe45e },
            { geo: new THREE.ConeGeometry(0.44, 0.95, 6), color: 0xff621f, pos: [0, 0, -0.45], rot: [-Math.PI * 0.5, 0, 0] },
          ],
          'character_palette',
          0.036,
          { emissiveHex: 0xff621f, emissiveIntensity: 0.95 },
        );
        break;
      case 'bone':
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.11, 0.11, 0.85, 6), color: 0xfaf5e6, rot: [0, 0, Math.PI * 0.5] },
            { geo: new THREE.OctahedronGeometry(0.17, 0), color: 0xfaf5e6, pos: [-0.44, 0.1, 0] },
            { geo: new THREE.OctahedronGeometry(0.17, 0), color: 0xfaf5e6, pos: [-0.44, -0.1, 0] },
            { geo: new THREE.OctahedronGeometry(0.17, 0), color: 0xfaf5e6, pos: [0.44, 0.1, 0] },
            { geo: new THREE.OctahedronGeometry(0.17, 0), color: 0xfaf5e6, pos: [0.44, -0.1, 0] },
          ],
          'bone_ivory',
          0.038,
        );
        break;
      case 'sword_arc':
        pair = makePair(
          [
            { geo: new THREE.TorusGeometry(1.15, 0.16, 4, 10, Math.PI * 0.92), color: 0xdbf8ff, rot: [Math.PI * 0.5, 0, -Math.PI * 0.46] },
            { geo: new THREE.TorusGeometry(1.26, 0.08, 4, 10, Math.PI * 0.85), color: 0xffffff, rot: [Math.PI * 0.5, 0, -Math.PI * 0.42] },
          ],
          'character_palette',
          0.03,
          { emissiveHex: 0x7df9ff, emissiveIntensity: 0.9 },
        );
        break;
      case 'bullet':
        pair = makePair(
          [
            { geo: new THREE.ConeGeometry(0.13, 0.45, 5), color: 0xfff4c2, pos: [0, 0, 0.25], rot: [Math.PI * 0.5, 0, 0] },
            { geo: new THREE.CylinderGeometry(0.08, 0.03, 1.15, 5), color: 0xffb703, pos: [0, 0, -0.45], rot: [Math.PI * 0.5, 0, 0] },
          ],
          'character_palette',
          0.025,
          { emissiveHex: 0xffbe0b, emissiveIntensity: 0.95 },
        );
        break;
      case 'boulder':
        pair = makePair(
          [
            { geo: new THREE.DodecahedronGeometry(0.56, 0), color: 0x7e8f9e },
            { geo: new THREE.DodecahedronGeometry(0.32, 0), color: 0x69c748, pos: [0.16, 0.34, 0.08] },
          ],
          'terrain_cliff',
          0.048,
        );
        break;
      case 'lightning':
        pair = makePair(
          [
            { geo: new THREE.BoxGeometry(0.18, 1.1, 0.18), color: 0x80f7ff, pos: [0.12, 0.45, 0], rot: [0, 0, -0.32] },
            { geo: new THREE.BoxGeometry(0.18, 1.1, 0.18), color: 0xffffff, pos: [-0.12, -0.35, 0], rot: [0, 0, 0.36] },
          ],
          'character_palette',
          0.03,
          { emissiveHex: 0x5cf7ff, emissiveIntensity: 1.2 },
        );
        break;
      case 'sniper':
        pair = makePair(
          [
            { geo: new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6), color: 0xffffff, rot: [Math.PI * 0.5, 0, 0] },
            { geo: new THREE.TorusGeometry(0.32, 0.05, 5, 8), color: 0x38f2ff, pos: [0, 0, -0.6] },
          ],
          'character_palette',
          0.025,
          { emissiveHex: 0x38f2ff, emissiveIntensity: 1.2 },
        );
        break;
      default:
        pair = makePair(
          [{ geo: new THREE.OctahedronGeometry(0.34, 0), color: 0xc56cf0 }],
          'character_palette',
          0.032,
          { emissiveHex: 0xa855f7, emissiveIntensity: 0.85 },
        );
        break;
    }

    this.projectileCache.set(key, pair);
    return pair;
  }

  public getPickupGeometryPair(kind: 'gem' | 'coin' | 'heart' | 'orb'): LowPolyGeometryPair {
    const cached = this.pickupCache.get(kind);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'gem':
        pair = makePair(
          [{ geo: new THREE.OctahedronGeometry(0.32, 0), color: 0xffffff, scale: [0.85, 1.38, 0.85] }],
          'character_palette',
          0.035,
          { emissiveHex: 0x38f2ff, emissiveIntensity: 0.35, gloss: 0.7 },
        );
        break;
      case 'coin':
        pair = makePair(
          [{ geo: new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), color: 0xffffff, rot: [Math.PI * 0.5, 0, 0] }],
          'character_palette',
          0.032,
          { emissiveHex: 0xffb703, emissiveIntensity: 0.3, gloss: 0.8 },
        );
        break;
      case 'heart':
        pair = makePair(
          [
            { geo: new THREE.OctahedronGeometry(0.28, 0), color: 0xff3b5c, pos: [-0.14, 0.14, 0] },
            { geo: new THREE.OctahedronGeometry(0.28, 0), color: 0xff3b5c, pos: [0.14, 0.14, 0] },
            { geo: new THREE.ConeGeometry(0.34, 0.44, 4), color: 0xff3b5c, pos: [0, -0.14, 0], rot: [Math.PI, Math.PI * 0.25, 0] },
          ],
          'character_palette',
          0.032,
          { emissiveHex: 0xff2e54, emissiveIntensity: 0.45 },
        );
        break;
      case 'orb':
        pair = makePair(
          [
            { geo: new THREE.IcosahedronGeometry(0.36, 0), color: 0xffffff },
            { geo: new THREE.TorusGeometry(0.5, 0.05, 4, 8), color: 0xffe45e, rot: [Math.PI * 0.35, 0, 0] },
          ],
          'character_palette',
          0.035,
          { emissiveHex: 0xffffff, emissiveIntensity: 0.4 },
        );
        break;
    }

    this.pickupCache.set(kind, pair);
    return pair;
  }

  public dispose(): void {
    for (const tex of Object.values(this.textures)) {
      tex.dispose();
    }
    for (const map of [
      this.enemyCache,
      this.propCache,
      this.interactableCache,
      this.projectileCache,
      this.pickupCache,
    ]) {
      for (const pair of map.values()) {
        pair.geometry.dispose();
        pair.outlineGeometry.dispose();
      }
      map.clear();
    }
  }
}

export { hexToRgb };
