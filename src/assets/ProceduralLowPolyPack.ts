/**
 * KRUNKEDBONK — Built-In Procedural Low-Poly Asset Pack (Wave 2 Full Expansion)
 *
 * Implements IAssetPack with:
 * - Razor-sharp NearestFilter procedural pixel-palette DataTextures for all 4 biomes & materials
 * - Chunky faceted articulated low-poly 3D rigs with seamless inverted-hull ink outlines
 *   for ALL 21 playable characters, dynamic skinId palette overrides, and all 8 wearable hatId meshes
 * - 4 dedicated articulated Boss Rigs (EntStage1/2/3, Pharaoh1/2/3, Big Bob GhostKing, FinalBoss)
 * - Distinct iconic low-poly silhouettes for all Forest, Desert, Graveyard & FinalSwarm enemies
 * - Distinct outlined meshes for all 12 Interactables + CryptAltar, BossPortal, BossPylon & DarknessLamp
 * - Distinct low-poly biome props and all 30 weapon projectile/pickup visual archetypes
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
  | 'desert_sandstone'
  | 'desert_cactus'
  | 'graveyard_cobble'
  | 'graveyard_iron'
  | 'citadel_obsidian'
  | 'citadel_magma'
  | 'mummy_wraps'
  | 'metal_armor'
  | 'spectral_ectoplasm'
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
    // Lush vibrant dithered Forest grass tile with micro blades and sunlit flecks
    terrain_grass: makePixelDataTexture(32, 32, (x, y) => {
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const n = hash2D(x >> 1, y >> 1, 11);
      const tuft = hash2D(x, y, 29);
      if (tuft > 0.965) return 0xf2f79c;
      if (tuft > 0.88 && (y & 3) === 0) return 0xb7eb62;
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

    // Warm wind-rippled Desert dunes with crisp pixelated crest ridges
    terrain_desert: makePixelDataTexture(32, 32, (x, y) => {
      const ripple = Math.sin((y + Math.sin(x * 0.28) * 2.4) * 0.82);
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const grain = hash2D(x, y, 83);
      const n = grain * 0.22 + ripple * 0.52 + 0.5;
      if (grain > 0.965) return 0xfff1bf; // sparkling quartz grain
      if (n + bayer * 0.18 > 0.92) return 0xffe4a3;
      if (n > 0.56) return 0xf2c26b;
      if (n > 0.28) return 0xdba14d;
      return 0xc28538;
    }),

    // Banded Desert sandstone blocks for ruins, obelisks & Sand Golem
    desert_sandstone: makePixelDataTexture(32, 32, (x, y) => {
      const row = y >> 3;
      const bx = (x + (row & 1) * 8) & 15;
      const by = y & 7;
      if (bx === 0 || by === 0) return 0x6e4226;
      const strata = (y + Math.floor(Math.sin(x * 0.4) * 1.2)) % 5;
      const n = hash2D(x >> 1, y >> 1, 89);
      if (strata === 0) return 0xc77d42;
      return n > 0.6 ? 0xf0be74 : n > 0.28 ? 0xde9f52 : 0xc9863c;
    }),

    // Ribbed emerald-sage Desert saguaro cactus pixel pleats with tiny pale spines
    desert_cactus: makePixelDataTexture(32, 32, (x, y) => {
      const rib = x & 3;
      if (rib === 0) return 0x266130;
      if (rib === 2 && (y & 3) === 1) return 0xf7f2c8; // tiny pixel spine dot
      const n = hash2D(x >> 1, y >> 1, 97);
      return rib === 2 ? (n > 0.4 ? 0x73cf57 : 0x5ab846) : 0x3e913d;
    }),

    // Weathered haunted Graveyard flagstone pavers with violet moss cracks
    terrain_graveyard: makePixelDataTexture(32, 32, (x, y) => {
      const row = y >> 3;
      const ox = (x + (row & 1) * 4) & 7;
      const oy = y & 7;
      if (ox === 0 || oy === 0) return hash2D(x, y, 107) > 0.72 ? 0x5e3d85 : 0x211e33;
      const n = hash2D(x >> 2, y >> 2, 109);
      if (n > 0.82) return 0x5d4c82; // haunted violet moss tuft
      if (n > 0.55) return 0x646e87;
      if (n > 0.28) return 0x505970;
      return 0x3f475c;
    }),

    // Detailed moonlit Graveyard cobblestone for tombstones & crypt arches
    graveyard_cobble: makePixelDataTexture(32, 32, (x, y) => {
      const row = y >> 2;
      const ox = (x + (row & 1) * 3) % 6;
      const oy = y & 3;
      if (ox === 0 || oy === 0) return 0x1b1a29;
      const n = hash2D(x >> 1, y >> 1, 113);
      if (n > 0.85) return 0x7a59a8;
      return n > 0.5 ? 0x76829c : n > 0.22 ? 0x5a647a : 0x454d61;
    }),

    // Gothic wrought-iron rivets & subtle blue-violet metal sheen
    graveyard_iron: makePixelDataTexture(16, 16, (x, y) => {
      if ((x === 3 || x === 12) && (y === 3 || y === 12)) return 0x8e9eb8;
      if (x === 0 || y === 0) return 0x161924;
      const n = hash2D(x, y, 127);
      return n > 0.65 ? 0x454f63 : n > 0.3 ? 0x32394a : 0x242938;
    }),

    // Obsidian FinalBossMap colosseum tiles with gilded gold & violet hairline seams
    terrain_citadel: makePixelDataTexture(32, 32, (x, y) => {
      const bx = x & 7;
      const by = y & 7;
      if (bx === 0 || by === 0) {
        const g = hash2D(x, y, 131);
        return g > 0.75 ? 0xffc83b : g > 0.5 ? 0xa832d9 : 0x181124;
      }
      const n = hash2D(x >> 1, y >> 1, 137);
      return n > 0.65 ? 0x3c304f : n > 0.3 ? 0x2d233d : 0x21192e;
    }),

    // Chiseled Obsidian-Gold Citadel pillar & FinalBoss armor weave
    citadel_obsidian: makePixelDataTexture(32, 32, (x, y) => {
      if (y === 3 || y === 28 || x === 15 || x === 16) return 0xffc83b;
      if (y === 4 || y === 27) return 0x996b1f;
      const n = hash2D(x >> 1, y >> 1, 149);
      return n > 0.7 ? 0x43335c : n > 0.35 ? 0x2b203d : 0x1a1326;
    }),

    // Glowing molten magma & void veins for FinalBossMap rim / Floor-is-Lava
    citadel_magma: makePixelDataTexture(32, 32, (x, y) => {
      const wave = Math.sin(x * 0.45 + Math.cos(y * 0.35) * 1.8) + Math.cos(y * 0.4 - x * 0.25);
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const v = wave * 0.3 + 0.5 + bayer * 0.16;
      if (v > 0.92) return 0xfff08a;
      if (v > 0.74) return 0xff7b1f;
      if (v > 0.54) return 0xd92638;
      if (v > 0.32) return 0x4f1224;
      return 0x1d0c1c;
    }),

    // Crisscrossed parchment linen Mummy wraps
    mummy_wraps: makePixelDataTexture(32, 32, (x, y) => {
      const seam = ((y + (x >> 2)) % 5) === 0 || ((y - (x >> 3)) & 7) === 0;
      if (seam) return 0x8a7554;
      const n = hash2D(x >> 1, y, 163);
      return n > 0.65 ? 0xf2e6c9 : n > 0.3 ? 0xdecda8 : 0xc7b289;
    }),

    // Brushed metallic plate armor with crisp diagonal glint
    metal_armor: makePixelDataTexture(16, 16, (x, y) => {
      const diag = (x + y) & 15;
      if (diag === 3 || diag === 4) return 0xffffff;
      const n = hash2D(x, y, 173);
      return n > 0.55 ? 0xe0e8f5 : 0xc5d0e0;
    }),

    // Ethereal wispy ectoplasm swirl for Big Bob & spectral ghosts
    spectral_ectoplasm: makePixelDataTexture(32, 32, (x, y) => {
      const sw = Math.sin(x * 0.38 + Math.sin(y * 0.32) * 2.0);
      const bayer = BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16;
      const v = sw * 0.4 + 0.5 + bayer * 0.2;
      if (v > 0.85) return 0xd4fffc;
      if (v > 0.55) return 0x9ef0ff;
      if (v > 0.28) return 0xc299ff;
      return 0x7b5cb8;
    }),

    // Vertical gnarled bark grain
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

    // Ancient carved stone with glowing cyan pixel runes
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
      if (y % 7 === 0) return 0x5c361e;
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
      if (n > 0.78) return 0x7ab86b;
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
// FACETED VERTEX-COLORED LOW-POLY GEOMETRY MERGER + COMPACT PART SHORTHANDS
// ============================================================================

type V3 = [number, number, number];

export interface ColoredPartSpec {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: V3;
  rot?: V3;
  scale?: V3;
}

const box = (w: number, h: number, d: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.BoxGeometry(w, h, d), color, pos, rot, scale });
const cyl = (rt: number, rb: number, h: number, seg: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot, scale });
const cone = (r: number, h: number, seg: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.ConeGeometry(r, h, seg), color, pos, rot, scale });
const dodec = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.DodecahedronGeometry(r, 0), color, pos, rot, scale });
const octa = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.OctahedronGeometry(r, 0), color, pos, rot, scale });
const ico = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.IcosahedronGeometry(r, 0), color, pos, rot, scale });
const torus = (r: number, t: number, rs: number, ts: number, color: number, pos?: V3, rot?: V3, scale?: V3, arc?: number): ColoredPartSpec =>
  ({ geo: new THREE.TorusGeometry(r, t, rs, ts, arc), color, pos, rot, scale });

const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();

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
// ARTICULATED PLAYABLE CHARACTER RIGS — ALL 21 CHARACTERS + SKINS + 8 HATS
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
  leftWingPivot: THREE.Group | null;
  rightWingPivot: THREE.Group | null;
  auraRing: THREE.Mesh | null;
  baseScale: number;
  hoverMode: 'none' | 'skateboard' | 'hoverboard' | 'float';
  isDiceHead: boolean;
  toonMaterials: THREE.ShaderMaterial[];
  outlineMeshes: THREE.Mesh[];
  dispose: () => void;
}

export interface ArticulatedBossRig {
  kind: 'Ent' | 'Pharaoh' | 'BigBob' | 'FinalBoss';
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  crownGroup: THREE.Group;
  shieldDome: THREE.Mesh | null;
  toonMaterials: THREE.ShaderMaterial[];
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
  Fox: { primary: 0xf27127, secondary: 0x2e8555, accent: 0xfff1d6, skin: 0xf58438, boots: 0x452d24, weapon: 0x7d4c2a, weaponGlow: 0xff8b1f, scale: 1.0 },
  Calcium: { primary: 0xf5f0de, secondary: 0x232a3b, accent: 0xff3b5c, skin: 0xf7f2e1, boots: 0x3ad5ff, weapon: 0xfcf9ed, weaponGlow: 0xffe89e, scale: 1.0 },
  SirOofie: { primary: 0x9aa8ba, secondary: 0xd62839, accent: 0xffcb3b, skin: 0x6c7a8f, boots: 0x4a5568, weapon: 0xdbe6f2, weaponGlow: 0x7df9ff, scale: 1.06 },
  Megachad: { primary: 0xe6a67c, secondary: 0x1d2333, accent: 0xffd23f, skin: 0xebae86, boots: 0x252c40, weapon: 0xffd23f, weaponGlow: 0xffd84d, scale: 1.32 },
  Amog: { primary: 0xd93838, secondary: 0x3b2a54, accent: 0x8cff3b, skin: 0x73e069, boots: 0x2a2438, weapon: 0x8cff3b, weaponGlow: 0xaaff00, scale: 1.0 },
  Athena: { primary: 0xf4f1e6, secondary: 0x2a7de0, accent: 0xffd24c, skin: 0xf5cba7, boots: 0xd4a437, weapon: 0xffdf6b, weaponGlow: 0x70e4ff, scale: 1.02 },
  Bandit: { primary: 0x342c42, secondary: 0xa8243a, accent: 0xffc43d, skin: 0xe8ba95, boots: 0x211a2b, weapon: 0xd8dee9, weaponGlow: 0xff4d6d, scale: 0.98 },
  Birdo: { primary: 0x3ebeff, secondary: 0xf5f9ff, accent: 0xffb703, skin: 0x4fc8ff, boots: 0xf29f29, weapon: 0xa6f7ff, weaponGlow: 0x5ef2ff, scale: 0.96 },
  Bush: { primary: 0x45a336, secondary: 0x6b4d32, accent: 0xbef25c, skin: 0x38802c, boots: 0x473322, weapon: 0x4b5866, weaponGlow: 0x70ff98, scale: 1.0 },
  SirChadwell: { primary: 0x432763, secondary: 0x1d132b, accent: 0xd938ff, skin: 0x675080, boots: 0x191124, weapon: 0xc138ff, weaponGlow: 0xe66bff, scale: 1.08 },
  Cl4nk: { primary: 0xd19c3b, secondary: 0x425263, accent: 0x52f2ff, skin: 0xd9a84c, boots: 0x2d3845, weapon: 0xa6b8cc, weaponGlow: 0x52f2ff, scale: 0.98 },
  Dicehead: { primary: 0xc92a3e, secondary: 0x1e2436, accent: 0xffd23f, skin: 0xf7f8fc, boots: 0x181d2b, weapon: 0xf7f8fc, weaponGlow: 0xffd23f, scale: 1.0 },
  Monke: { primary: 0x8f5633, secondary: 0x2d7a47, accent: 0xffe03b, skin: 0xdba06b, boots: 0x59341e, weapon: 0xffe03b, weaponGlow: 0xfff078, scale: 1.0 },
  Ninja: { primary: 0x1f2638, secondary: 0x33415e, accent: 0xff3355, skin: 0xe6ba95, boots: 0x141824, weapon: 0xe6eef7, weaponGlow: 0x5cf2ff, scale: 0.98 },
  Noelle: { primary: 0x64d6ff, secondary: 0xf0f9ff, accent: 0x3b82f6, skin: 0xf7d6c3, boots: 0x2b5eb0, weapon: 0xb8f3ff, weaponGlow: 0x7ae5ff, scale: 0.98 },
  Ogre: { primary: 0x69a842, secondary: 0x734b30, accent: 0xe8d5a8, skin: 0x77b84f, boots: 0x4a301e, weapon: 0xa3b1c2, weaponGlow: 0xff9f43, scale: 1.25 },
  Roberto: { primary: 0x28233b, secondary: 0x622f7d, accent: 0x4dff9e, skin: 0x12101c, boots: 0x181526, weapon: 0xc4d0e0, weaponGlow: 0x4dff9e, scale: 1.02 },
  Robinette: { primary: 0x2b9952, secondary: 0x8a522b, accent: 0xffd242, skin: 0xf5c8a4, boots: 0x5c361d, weapon: 0xb5763a, weaponGlow: 0xffe066, scale: 0.96 },
  Spaceman: { primary: 0xedf2f7, secondary: 0x2e78e6, accent: 0xffa62b, skin: 0x1b2438, boots: 0x4a5568, weapon: 0x7b3fe4, weaponGlow: 0xc05eff, scale: 1.02 },
  TonyMcZoom: { primary: 0xff3d77, secondary: 0x1a2236, accent: 0x38f2ff, skin: 0xf2c29b, boots: 0x38f2ff, weapon: 0x52f2ff, weaponGlow: 0x38f2ff, scale: 0.98 },
  Vlad: { primary: 0x211626, secondary: 0xb81a35, accent: 0xff4567, skin: 0xe2dce6, boots: 0x150e1a, weapon: 0xff2e54, weaponGlow: 0xff3b5c, scale: 1.04 },
};

const KNOWN_SKIN_OVERRIDES: Record<string, Partial<CharacterStylePalette>> = {
  skin_fox_ember: { primary: 0xf06a24, accent: 0xfff0d6, weaponGlow: 0xff8b1f },
  skin_fox_frost: { primary: 0xe0f2fe, secondary: 0x1e5c8a, accent: 0x38bdf8, skin: 0xeef8ff, weaponGlow: 0x5cf7ff },
  skin_calcium_classic: { primary: 0xede6d3, accent: 0xff4d6d },
  skin_calcium_neon: { primary: 0xd8b4fe, secondary: 0x181633, accent: 0x22d3ee, skin: 0xe9d5ff, boots: 0xff2ec4, weaponGlow: 0x22d3ee },
  skin_siroofie_steel: { primary: 0x8d99ae, secondary: 0xd90429, accent: 0xffcb3b },
  skin_siroofie_gilded: { primary: 0xfbbf24, secondary: 0x7c2d12, accent: 0xfef08a, boots: 0xb45309, weapon: 0xfff4c2, weaponGlow: 0xffe45e },
  skin_megachad_gold: { primary: 0xffb703, secondary: 0x78350f, accent: 0xfb8500, skin: 0xffc940, weaponGlow: 0xffe45e },
  skin_megachad_obsidian: { primary: 0x334155, secondary: 0x1e1b4b, accent: 0xc084fc, skin: 0x475569, boots: 0x0f172a, weaponGlow: 0xd946ef },
};

function resolveCharacterPalette(characterId: CharacterId, skinId?: string | null): CharacterStylePalette {
  const base = { ...(CHARACTER_PALETTES[characterId] ?? CHARACTER_PALETTES.Fox) };
  if (!skinId) return base;

  const exact = KNOWN_SKIN_OVERRIDES[skinId];
  if (exact) return { ...base, ...exact };

  const s = skinId.toLowerCase();
  if (s.includes('default') || s.includes('classic') || s.includes('base')) return base;
  if (s.includes('frost') || s.includes('arctic') || s.includes('ice') || s.includes('snow')) {
    return { ...base, primary: 0xdbf4ff, secondary: 0x1e5a8c, accent: 0x38f2ff, weaponGlow: 0x6ef7ff };
  }
  if (s.includes('gold') || s.includes('gilded') || s.includes('royal') || s.includes('solar')) {
    return { ...base, primary: 0xf5c542, secondary: 0x6b2f12, accent: 0xfff4a3, weaponGlow: 0xffe45e };
  }
  if (s.includes('obsidian') || s.includes('shadow') || s.includes('void') || s.includes('dark') || s.includes('eclipse')) {
    return { ...base, primary: 0x2d2640, secondary: 0x141021, accent: 0xc05eff, weaponGlow: 0xd946ef };
  }
  if (s.includes('neon') || s.includes('cyber') || s.includes('synth') || s.includes('plasma')) {
    return { ...base, primary: 0xff2ec4, secondary: 0x161b33, accent: 0x38f2ff, weaponGlow: 0x38f2ff };
  }
  if (s.includes('crimson') || s.includes('blood') || s.includes('inferno') || s.includes('ruby') || s.includes('lava')) {
    return { ...base, primary: 0xd92638, secondary: 0x2b1018, accent: 0xff9f43, weaponGlow: 0xff4d2e };
  }
  if (s.includes('emerald') || s.includes('toxic') || s.includes('jade') || s.includes('plague') || s.includes('forest')) {
    return { ...base, primary: 0x34d364, secondary: 0x1a382c, accent: 0xb8ff3b, weaponGlow: 0x76f562 };
  }
  if (s.includes('ghost') || s.includes('spectral') || s.includes('phantom') || s.includes('spirit')) {
    return { ...base, primary: 0xb8f3ff, secondary: 0x392b66, accent: 0x70ffcf, weaponGlow: 0x5cf7ff };
  }
  if (s.includes('sand') || s.includes('desert') || s.includes('pharaoh') || s.includes('dune')) {
    return { ...base, primary: 0xe6b566, secondary: 0x7d4524, accent: 0x38f2ff, weaponGlow: 0xffd23f };
  }
  if (s.includes('sakura') || s.includes('pink') || s.includes('rose') || s.includes('pastel')) {
    return { ...base, primary: 0xff8fab, secondary: 0x592647, accent: 0xffe5ec, weaponGlow: 0xff66b3 };
  }

  // Deterministic vibrant hue shift for any other custom Wave 2 skinId
  let hash = 2166136261;
  for (let i = 0; i < skinId.length; i++) {
    hash ^= skinId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const shift = ((hash >>> 0) % 360) / 360;
  const c1 = new THREE.Color(base.primary).offsetHSL(shift, 0.08, 0.02);
  const c2 = new THREE.Color(base.accent).offsetHSL(shift * 0.7, 0.06, 0.02);
  return { ...base, primary: c1.getHex(), accent: c2.getHex(), weaponGlow: c2.getHex() };
}

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

/** All 8 wearable hatId meshes matching HatDef['meshStyle'] */
function addHatParts(parts: ColoredPartSpec[], hatId: string | null | undefined, headTopY: number): void {
  if (!hatId) return;
  const h = hatId.toLowerCase();
  if (h.includes('crown')) {
    parts.push(
      cyl(0.3, 0.25, 0.22, 6, 0xffd23f, [0, headTopY + 0.11, 0]),
      cone(0.08, 0.16, 4, 0xffe45e, [-0.18, headTopY + 0.26, 0.12]),
      cone(0.08, 0.16, 4, 0xffe45e, [0.18, headTopY + 0.26, 0.12]),
      cone(0.09, 0.2, 4, 0xffe45e, [0, headTopY + 0.28, 0.22]),
      octa(0.08, 0xff385c, [0, headTopY + 0.13, 0.26]),
    );
  } else if (h.includes('wizard')) {
    parts.push(
      cyl(0.48, 0.48, 0.06, 8, 0x4b339e, [0, headTopY + 0.03, 0]),
      cyl(0.3, 0.31, 0.09, 8, 0xffd23f, [0, headTopY + 0.1, 0]),
      cone(0.28, 0.66, 7, 0x6345cc, [0, headTopY + 0.4, -0.05], [-0.18, 0, 0]),
      octa(0.08, 0xffe45e, [0, headTopY + 0.72, -0.16]),
    );
  } else if (h.includes('halo')) {
    parts.push(
      torus(0.3, 0.05, 5, 10, 0xffe875, [0, headTopY + 0.26, 0], [Math.PI * 0.5, 0, 0]),
      octa(0.06, 0xffffff, [0, headTopY + 0.26, 0.3]),
    );
  } else if (h.includes('horn')) {
    parts.push(
      cone(0.09, 0.34, 5, 0xd62839, [-0.22, headTopY + 0.14, 0.04], [0.18, 0, 0.45]),
      cone(0.06, 0.22, 5, 0xff4d6d, [-0.34, headTopY + 0.32, 0.08], [0.05, 0, 0.15]),
      cone(0.09, 0.34, 5, 0xd62839, [0.22, headTopY + 0.14, 0.04], [0.18, 0, -0.45]),
      cone(0.06, 0.22, 5, 0xff4d6d, [0.34, headTopY + 0.32, 0.08], [0.05, 0, -0.15]),
    );
  } else if (h.includes('tophat')) {
    parts.push(
      cyl(0.44, 0.44, 0.06, 8, 0x1d2330, [0, headTopY + 0.03, 0]),
      cyl(0.29, 0.25, 0.48, 8, 0x262d3d, [0, headTopY + 0.28, 0]),
      cyl(0.27, 0.26, 0.1, 8, 0xe63946, [0, headTopY + 0.11, 0]),
      box(0.11, 0.11, 0.08, 0xffd23f, [0, headTopY + 0.11, 0.26]),
    );
  } else if (h.includes('visor')) {
    parts.push(
      cyl(0.39, 0.4, 0.11, 8, 0x1e293b, [0, headTopY - 0.02, 0]),
      box(0.56, 0.11, 0.34, 0x22d3ee, [0, headTopY - 0.03, 0.28], [0.16, 0, 0]),
      box(0.48, 0.04, 0.36, 0xccf8ff, [0, headTopY + 0.01, 0.29], [0.16, 0, 0]),
    );
  } else if (h.includes('bucket')) {
    parts.push(
      cyl(0.35, 0.42, 0.44, 8, 0x94a3b8, [0, headTopY + 0.16, 0], [0, 0, 0.1]),
      cyl(0.44, 0.44, 0.06, 8, 0x64748b, [0, headTopY - 0.02, 0], [0, 0, 0.1]),
      torus(0.38, 0.035, 4, 10, 0x475569, [0, headTopY + 0.14, 0], [0.55, 0, 0.1], undefined, Math.PI),
    );
  } else {
    // Skater Beanie (hat_beanie or fallback)
    parts.push(
      cyl(0.36, 0.39, 0.12, 8, 0xb91c1c, [0, headTopY + 0.02, 0]),
      dodec(0.32, 0xef4444, [0, headTopY + 0.14, -0.02], undefined, [1.05, 0.78, 1.05]),
      octa(0.11, 0xfff4c2, [0, headTopY + 0.38, -0.04]),
    );
  }
}

function addDicePipCluster(parts: ColoredPartSpec[], face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom', pipCount: number, half: number, centerY: number): void {
  const coords: Array<[number, number]> =
    pipCount === 1
      ? [[0, 0]]
      : pipCount === 2
        ? [[-0.17, -0.17], [0.17, 0.17]]
        : pipCount === 3
          ? [[-0.18, -0.18], [0, 0], [0.18, 0.18]]
          : pipCount === 4
            ? [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]
            : pipCount === 5
              ? [[-0.18, -0.18], [0.18, -0.18], [0, 0], [-0.18, 0.18], [0.18, 0.18]]
              : [[-0.18, -0.19], [0.18, -0.19], [-0.18, 0], [0.18, 0], [-0.18, 0.19], [0.18, 0.19]];
  const col = pipCount === 1 ? 0xe63946 : 0x161a26;
  for (let i = 0; i < coords.length; i++) {
    const [u, v] = coords[i]!;
    if (face === 'front') parts.push(box(0.095, 0.095, 0.04, col, [u, centerY + v, half + 0.015]));
    else if (face === 'back') parts.push(box(0.095, 0.095, 0.04, col, [u, centerY + v, -half - 0.015]));
    else if (face === 'right') parts.push(box(0.04, 0.095, 0.095, col, [half + 0.015, centerY + v, u]));
    else if (face === 'left') parts.push(box(0.04, 0.095, 0.095, col, [-half - 0.015, centerY + v, u]));
    else if (face === 'top') parts.push(box(0.095, 0.04, 0.095, col, [u, centerY + half + 0.015, v]));
    else parts.push(box(0.095, 0.04, 0.095, col, [u, centerY - half - 0.015, v]));
  }
}

export type PropKind =
  | 'pine'
  | 'oak'
  | 'boulder'
  | 'ruin_pillar'
  | 'cactus'
  | 'tombstone'
  | 'desert_boulder'
  | 'sandstone_obelisk'
  | 'dead_tree'
  | 'iron_fence'
  | 'crypt_arch'
  | 'citadel_pillar';

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
  private readonly enemyArchetypeNameCache = new Map<string, string>();
  private readonly projArchetypeNameCache = new Map<string, string>();

  constructor() {
    this.textures = buildAllProceduralTextures();
    this.palettes = {
      forest_stage1: ['#7fd145', '#59b048', '#007a9e', '#fff4d4', '#26345e', '#f5c542'],
      forest_stage2: ['#4b7a78', '#2f525c', '#62489f', '#fff4d4', '#231b45', '#c084fc'],
      forest_stage3: ['#854836', '#5e2c26', '#4d1414', '#ffe0b8', '#290f14', '#ff4d2e'],
      desert_stage1: ['#f2c26b', '#dba14d', '#ecd097', '#fff4d4', '#5c3638', '#4df3ff'],
      desert_stage2: ['#7ea4d9', '#4f72ad', '#6c9ef0', '#99c4ff', '#1f2c5c', '#38f2ff'],
      desert_stage3: ['#b84b39', '#8a2b24', '#933030', '#e0bdb7', '#3b1218', '#ff621f'],
      graveyard_stage1: ['#566275', '#5d4c82', '#7e6a9f', '#f1d7ff', '#1c1730', '#a855f7'],
      citadel_final: ['#3c304f', '#21192e', '#7a3826', '#ffea94', '#160d24', '#ffc83b'],
      fox: ['#f27127', '#fff1d6', '#2e8555', '#ff8b1f'],
      calcium: ['#f5f0de', '#ff3b5c', '#3ad5ff', '#232a3b'],
      siroofie: ['#9aa8ba', '#d62839', '#ffcb3b', '#dbe6f2'],
      megachad: ['#e6a67c', '#ffd23f', '#1d2333', '#52f2ff'],
      amog: ['#d93838', '#8cff3b', '#3b2a54', '#aaff00'],
      athena: ['#f4f1e6', '#2a7de0', '#ffd24c', '#70e4ff'],
      bandit: ['#342c42', '#a8243a', '#ffc43d', '#ff4d6d'],
      birdo: ['#3ebeff', '#f5f9ff', '#ffb703', '#5ef2ff'],
      bush: ['#45a336', '#6b4d32', '#bef25c', '#70ff98'],
      sirchadwell: ['#432763', '#1d132b', '#d938ff', '#e66bff'],
      cl4nk: ['#d19c3b', '#425263', '#52f2ff', '#a6b8cc'],
      dicehead: ['#c92a3e', '#f7f8fc', '#ffd23f', '#1e2436'],
      monke: ['#8f5633', '#2d7a47', '#ffe03b', '#dba06b'],
      ninja: ['#1f2638', '#ff3355', '#e6eef7', '#5cf2ff'],
      noelle: ['#64d6ff', '#f0f9ff', '#3b82f6', '#b8f3ff'],
      ogre: ['#69a842', '#734b30', '#e8d5a8', '#ff9f43'],
      roberto: ['#28233b', '#622f7d', '#4dff9e', '#c4d0e0'],
      robinette: ['#2b9952', '#8a522b', '#ffd242', '#ffe066'],
      spaceman: ['#edf2f7', '#2e78e6', '#ffa62b', '#c05eff'],
      tonymczoom: ['#ff3d77', '#1a2236', '#38f2ff', '#52f2ff'],
      vlad: ['#211626', '#b81a35', '#ff4567', '#e2dce6'],
    };
    this.localization = {
      'game.title': 'KRUNKEDBONK',
      'prompt.interact': '[E] INTERACT',
      'prompt.shrine': 'HOLD RING TO CHARGE',
      'prompt.boss': '[E] SUMMON BOSS',
      'prompt.portal': '[E] ENTER PORTAL',
      'prompt.lamp': 'CHARGE LAMP TO BANISH DARKNESS',
      'prompt.pylon': 'STAND IN RING TO CLEANSE PYLON',
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
      version: '2.0.0-procedural',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVerified: true,
      textures: textureEntries,
      audio: {},
      localization: { ...this.localization },
      palettes: paletteEntries,
    };
  }

  // ---- IAssetPack interface ----

  public isLoaded(): boolean { return true; }
  public getManifest(): PackManifest | null { return this.manifest; }
  public async loadFromDevEndpoint(_prefix?: string): Promise<boolean> { return true; }
  public async loadFromFiles(_files: readonly CustomPackFileEntry[]): Promise<boolean> { return true; }
  public clear(): void { /* built-in pack stays loaded */ }
  public getTextureUrl(_id: string): string | null { return null; }
  public getAudioUrl(_id: string): string | null { return null; }
  public getLocalizedString(key: string, fallback = key): string { return this.localization[key] ?? fallback; }
  public getPalette(id: string): readonly string[] | null { return this.palettes[id] ?? null; }
  public getProceduralTexture(id: ProceduralTextureId): THREE.DataTexture { return this.textures[id]; }

  // ---- Articulated Character Rig Builder (ALL 21 CHARACTERS!) ----

  public buildCharacterRig(
    characterId: CharacterId,
    skinId?: string | null,
    hatId?: string | null,
  ): CharacterRig {
    const pal = resolveCharacterPalette(characterId, skinId);
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
    let leftWingPivot: THREE.Group | null = null;
    let rightWingPivot: THREE.Group | null = null;
    const wheelPivots: THREE.Object3D[] = [];
    let auraRing: THREE.Mesh | null = null;
    let hoverMode: CharacterRig['hoverMode'] = 'none';
    const isDiceHead = characterId === 'Dicehead';

    const toonMaterials: THREE.ShaderMaterial[] = [];
    const outlineMeshes: THREE.Mesh[] = [];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const extraMaterials: THREE.Material[] = [];

    const bodyTex =
      characterId === 'Calcium'
        ? this.textures.bone_ivory
        : characterId === 'SirOofie' || characterId === 'SirChadwell' || characterId === 'Cl4nk' || characterId === 'Athena'
          ? this.textures.metal_armor
          : characterId === 'Bush'
            ? this.textures.foliage_oak
            : characterId === 'Roberto'
              ? this.textures.spectral_ectoplasm
              : this.textures.character_palette;

    const mainMat = createMkToonMaterial({
      color: 0xffffff,
      map: bodyTex,
      mapStrength: 0.45,
      vertexColors: true,
      rimStrength: 0.42,
      rimColor: 0xe6fbff,
      gloss: characterId === 'SirOofie' || characterId === 'Cl4nk' || characterId === 'Spaceman' || characterId === 'Athena' ? 0.55 : 0.18,
    });
    toonMaterials.push(mainMat);

    const glowMat = createMkToonMaterial({
      color: pal.weaponGlow,
      emissive: pal.weaponGlow,
      emissiveIntensity: 0.9,
      rimStrength: 0.6,
      rimColor: 0xffffff,
      vertexColors: false,
    });
    toonMaterials.push(glowMat);

    const outlineMat = createOutlineMaterial(0.052, 0x0b0d14);
    extraMaterials.push(outlineMat);

    const add = (parent: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(parent, parts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

    const addGlowOrb = (parent: THREE.Object3D, geo: THREE.BufferGeometry, pos: V3) => {
      const outGeo = createSmoothOutlineGeometry(geo);
      geometriesToDispose.push(geo, outGeo);
      const m = new THREE.Mesh(geo, glowMat);
      m.position.set(pos[0], pos[1], pos[2]);
      const o = new THREE.Mesh(outGeo, outlineMat);
      m.add(o);
      parent.add(m);
      outlineMeshes.push(o);
      return m;
    };

    const attachStdLimbs = (armCol: number, handCol: number, legCol: number, bootCol: number, armX = 0.44, legX = 0.19, hipY = 0.64, shoulderY = 1.34) => {
      leftArm.position.set(-armX, shoulderY, 0);
      rightArm.position.set(armX, shoulderY, 0);
      leftLeg.position.set(-legX, hipY, 0);
      rightLeg.position.set(legX, hipY, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
      add(leftArm, [cyl(0.105, 0.095, 0.5, 6, armCol, [0, -0.24, 0]), box(0.16, 0.15, 0.16, handCol, [0, -0.52, 0.02])]);
      add(rightArm, [cyl(0.105, 0.095, 0.5, 6, armCol, [0, -0.24, 0]), box(0.16, 0.15, 0.16, handCol, [0, -0.52, 0.02])]);
      add(leftLeg, [cyl(0.12, 0.105, 0.46, 6, legCol, [0, -0.22, 0]), box(0.22, 0.18, 0.32, bootCol, [0, -0.52, 0.06])]);
      add(rightLeg, [cyl(0.12, 0.105, 0.46, 6, legCol, [0, -0.22, 0]), box(0.22, 0.18, 0.32, bootCol, [0, -0.52, 0.06])]);
    };

    root.add(bodyPivot);
    bodyPivot.scale.setScalar(pal.scale);

    switch (characterId) {
      case 'Fox': {
        add(bodyPivot, [
          cyl(0.32, 0.42, 0.82, 7, pal.secondary, [0, 1.05, 0]),
          cyl(0.38, 0.39, 0.16, 7, 0x5c3721, [0, 0.82, 0]),
          box(0.18, 0.14, 0.12, 0xffd23f, [0, 0.82, 0.36]),
          cone(0.34, 0.28, 7, pal.accent, [0, 1.46, 0.05], [Math.PI, 0, 0]),
        ]);
        headPivot.position.set(0, 1.56, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.38, pal.primary, [0, 0.24, 0], undefined, [1.05, 0.92, 1.02]),
          cone(0.16, 0.26, 5, pal.accent, [-0.3, 0.16, 0.1], [0, 0, 1.15]),
          cone(0.16, 0.26, 5, pal.accent, [0.3, 0.16, 0.1], [0, 0, -1.15]),
          cone(0.18, 0.42, 5, pal.primary, [0, 0.17, 0.38], [Math.PI * 0.52, 0, 0]),
          box(0.2, 0.09, 0.24, pal.accent, [0, 0.1, 0.34]),
          octa(0.065, 0x161822, [0, 0.18, 0.58]),
          cone(0.14, 0.42, 4, pal.primary, [-0.22, 0.62, -0.02], [0.1, 0, 0.22]),
          cone(0.07, 0.18, 4, 0x1b1e29, [-0.26, 0.77, -0.01], [0.1, 0, 0.22]),
          cone(0.14, 0.42, 4, pal.primary, [0.22, 0.62, -0.02], [0.1, 0, -0.22]),
          cone(0.07, 0.18, 4, 0x1b1e29, [0.26, 0.77, -0.01], [0.1, 0, -0.22]),
          box(0.1, 0.11, 0.06, 0x12151f, [-0.15, 0.29, 0.32]),
          box(0.04, 0.04, 0.07, 0xffffff, [-0.13, 0.32, 0.33]),
          box(0.1, 0.11, 0.06, 0x12151f, [0.15, 0.29, 0.32]),
          box(0.04, 0.04, 0.07, 0xffffff, [0.17, 0.32, 0.33]),
        ];
        addHatParts(head, hatId, 0.58);
        add(headPivot, head);

        tailPivot = new THREE.Group();
        tailPivot.position.set(0, 0.8, -0.34);
        bodyPivot.add(tailPivot);
        add(tailPivot, [
          cone(0.24, 0.58, 6, pal.primary, [0, 0.12, -0.26], [-1.15, 0, 0]),
          dodec(0.26, pal.primary, [0, 0.24, -0.52], undefined, [0.95, 0.9, 1.35]),
          cone(0.22, 0.42, 6, pal.accent, [0, 0.32, -0.86], [-1.35, 0, 0]),
        ]);
        attachStdLimbs(pal.primary, pal.boots, pal.primary, pal.boots, 0.42, 0.18, 0.66, 1.34);
        weaponPivot.position.set(0.04, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.055, 0.065, 1.95, 6, pal.weapon, [0, 0.36, 0.15], [0.22, 0, 0]),
          torus(0.18, 0.045, 5, 8, 0xffc83b, [0, 1.38, 0.38]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.19, 0), [0, 1.38, 0.38]);
        break;
      }

      case 'Calcium': {
        hoverMode = 'skateboard';
        const deckH = 0.32;
        boardPivot = new THREE.Group();
        boardPivot.position.set(0, 0.14, 0);
        bodyPivot.add(boardPivot);
        add(boardPivot, [
          box(0.68, 0.08, 1.48, 0x262d40, [0, 0.14, 0]),
          box(0.56, 0.09, 1.38, pal.accent, [0, 0.145, 0]),
          box(0.24, 0.095, 1.36, 0x3ad5ff, [0, 0.15, 0]),
          box(0.62, 0.07, 0.28, pal.accent, [0, 0.2, 0.82], [-0.36, 0, 0]),
          box(0.62, 0.07, 0.28, pal.accent, [0, 0.2, -0.82], [0.36, 0, 0]),
          box(0.64, 0.08, 0.12, 0xb8c5d6, [0, 0.05, 0.48]),
          box(0.64, 0.08, 0.12, 0xb8c5d6, [0, 0.05, -0.48]),
        ]);
        const wheelCoords: V3[] = [[-0.36, 0.04, 0.48], [0.36, 0.04, 0.48], [-0.36, 0.04, -0.48], [0.36, 0.04, -0.48]];
        for (const wc of wheelCoords) {
          const wG = new THREE.Group();
          wG.position.set(wc[0], wc[1], wc[2]);
          boardPivot.add(wG);
          add(wG, [
            cyl(0.11, 0.11, 0.12, 8, 0xffe042, undefined, [0, 0, Math.PI * 0.5]),
            cyl(0.05, 0.05, 0.135, 6, 0x222836, undefined, [0, 0, Math.PI * 0.5]),
          ]);
          wheelPivots.push(wG);
        }
        add(bodyPivot, [
          cyl(0.08, 0.09, 0.72, 6, pal.primary, [0, deckH + 0.98, -0.04]),
          box(0.54, 0.1, 0.34, pal.primary, [0, deckH + 1.24, 0.02]),
          box(0.48, 0.09, 0.3, pal.primary, [0, deckH + 1.08, 0.02]),
          box(0.4, 0.09, 0.26, pal.primary, [0, deckH + 0.92, 0.02]),
          box(0.32, 0.42, 0.22, 0x1b202e, [0, deckH + 1.08, 0.01]),
          box(0.44, 0.2, 0.3, pal.secondary, [0, deckH + 0.7, 0]),
          box(0.48, 0.07, 0.33, pal.accent, [0, deckH + 0.78, 0]),
        ]);
        headPivot.position.set(0, deckH + 1.44, 0.02);
        bodyPivot.add(headPivot);
        const skull: ColoredPartSpec[] = [
          dodec(0.36, pal.primary, [0, 0.28, 0], undefined, [1.05, 1.0, 1.0]),
          box(0.34, 0.16, 0.24, pal.primary, [0, 0.05, 0.16]),
          box(0.28, 0.05, 0.06, 0x12151f, [0, 0.04, 0.28]),
          box(0.14, 0.14, 0.08, 0x12151f, [-0.13, 0.27, 0.31]),
          box(0.14, 0.14, 0.08, 0x12151f, [0.13, 0.27, 0.31]),
          box(0.05, 0.05, 0.09, 0x52f2ff, [-0.13, 0.28, 0.32]),
          box(0.05, 0.05, 0.09, 0x52f2ff, [0.13, 0.28, 0.32]),
          cone(0.05, 0.09, 3, 0x12151f, [0, 0.16, 0.34]),
          cyl(0.37, 0.37, 0.1, 8, pal.accent, [0, 0.42, 0]),
          box(0.1, 0.28, 0.06, pal.accent, [-0.12, 0.34, -0.38], [0.45, 0, 0.25]),
          box(0.1, 0.24, 0.06, pal.accent, [0.1, 0.36, -0.38], [0.55, 0, -0.2]),
        ];
        addHatParts(skull, hatId, 0.62);
        add(headPivot, skull);

        leftArm.position.set(-0.36, deckH + 1.28, 0);
        rightArm.position.set(0.36, deckH + 1.28, 0);
        leftLeg.position.set(-0.18, deckH + 0.6, 0.22);
        rightLeg.position.set(0.18, deckH + 0.6, -0.22);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.065, 0.06, 0.48, 6, pal.primary, [0, -0.24, 0]), octa(0.095, pal.primary, [0, -0.5, 0])]);
        add(rightArm, [cyl(0.065, 0.06, 0.48, 6, pal.primary, [0, -0.24, 0]), octa(0.095, pal.primary, [0, -0.5, 0])]);
        add(leftLeg, [cyl(0.075, 0.07, 0.46, 6, pal.primary, [0, -0.22, 0]), box(0.22, 0.14, 0.32, pal.boots, [0, -0.52, 0.04])]);
        add(rightLeg, [cyl(0.075, 0.07, 0.46, 6, pal.primary, [0, -0.22, 0]), box(0.22, 0.14, 0.32, pal.boots, [0, -0.52, 0.04])]);

        weaponPivot.position.set(0.06, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.07, 0.07, 0.72, 6, pal.weapon, [0, 0.25, 0.1], [0.4, 0, 0]),
          octa(0.11, pal.weapon, [-0.07, 0.56, 0.24]),
          octa(0.11, pal.weapon, [0.07, 0.56, 0.24]),
        ]);
        break;
      }

      case 'SirOofie': {
        add(bodyPivot, [
          box(0.84, 0.84, 0.54, pal.primary, [0, 1.08, 0]),
          box(0.14, 0.44, 0.08, pal.accent, [0, 1.12, 0.28]),
          box(0.38, 0.12, 0.08, pal.accent, [0, 1.18, 0.28]),
          box(0.88, 0.14, 0.58, 0x3b4454, [0, 0.72, 0]),
          box(0.22, 0.16, 0.12, pal.accent, [0, 0.72, 0.3]),
          dodec(0.28, 0xb8c5d6, [-0.52, 1.4, 0]),
          dodec(0.28, 0xb8c5d6, [0.52, 1.4, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.36, 0.38, 0.64, 8, 0xb8c5d6, [0, 0.32, 0]),
          cyl(0.37, 0.37, 0.1, 8, pal.accent, [0, 0.58, 0]),
          box(0.46, 0.1, 0.1, 0x0f121a, [0, 0.36, 0.34]),
          box(0.11, 0.32, 0.1, 0x0f121a, [0, 0.22, 0.34]),
          box(0.14, 0.3, 0.56, pal.secondary, [0, 0.76, -0.06], [-0.25, 0, 0]),
          cone(0.14, 0.38, 5, 0xff4d5e, [0, 0.68, -0.44], [-1.15, 0, 0]),
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.28);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.84, 1.12, 0.08, pal.secondary, [0, -0.54, -0.08], [0.16, 0, 0]),
          box(0.88, 0.12, 0.09, pal.accent, [0, -1.06, -0.16], [0.16, 0, 0]),
        ]);
        leftArm.position.set(-0.56, 1.32, 0);
        rightArm.position.set(0.56, 1.32, 0);
        leftLeg.position.set(-0.22, 0.66, 0);
        rightLeg.position.set(0.22, 0.66, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [box(0.24, 0.54, 0.24, pal.primary, [0, -0.26, 0]), box(0.26, 0.2, 0.26, 0x4f5d70, [0, -0.54, 0])]);
        add(rightArm, [box(0.24, 0.54, 0.24, pal.primary, [0, -0.26, 0]), box(0.26, 0.2, 0.26, 0x4f5d70, [0, -0.54, 0])]);
        add(leftLeg, [box(0.26, 0.46, 0.26, pal.primary, [0, -0.23, 0]), box(0.3, 0.22, 0.38, pal.boots, [0, -0.54, 0.06])]);
        add(rightLeg, [box(0.26, 0.46, 0.26, pal.primary, [0, -0.23, 0]), box(0.3, 0.22, 0.38, pal.boots, [0, -0.54, 0.06])]);

        weaponPivot.position.set(0.06, -0.48, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.055, 0.055, 0.42, 6, pal.secondary, [0, -0.05, 0.08], [0.35, 0, 0]),
          octa(0.11, pal.accent, [0, -0.24, 0.01]),
          box(0.64, 0.12, 0.16, pal.accent, [0, 0.18, 0.16], [0.35, 0, 0]),
          box(0.28, 1.56, 0.09, pal.weapon, [0, 0.96, 0.44], [0.35, 0, 0]),
          box(0.1, 1.44, 0.12, 0xffffff, [0, 0.96, 0.44], [0.35, 0, 0]),
          cone(0.2, 0.42, 4, pal.weapon, [0, 1.84, 0.76], [0.35, Math.PI * 0.25, 0]),
        ]);
        break;
      }

      case 'Megachad': {
        add(bodyPivot, [
          cyl(0.66, 0.36, 0.96, 6, pal.primary, [0, 1.18, 0]),
          box(0.88, 0.44, 0.56, pal.primary, [0, 1.4, 0.08]),
          cyl(0.4, 0.42, 0.34, 6, pal.secondary, [0, 0.68, 0]),
          cyl(0.42, 0.42, 0.14, 8, pal.accent, [0, 0.84, 0]),
          octa(0.16, 0xfff49e, [0, 0.84, 0.4]),
        ]);
        headPivot.position.set(0, 1.72, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          box(0.44, 0.48, 0.44, pal.skin, [0, 0.28, 0]),
          box(0.36, 0.18, 0.22, pal.skin, [0, 0.08, 0.18]),
          box(0.48, 0.24, 0.58, 0x1a1e2b, [0, 0.58, 0.08], [-0.14, 0, 0]),
          box(0.5, 0.15, 0.12, 0x0d1018, [0, 0.34, 0.24]),
          box(0.14, 0.05, 0.13, 0x52f2ff, [-0.12, 0.37, 0.245]),
          box(0.14, 0.05, 0.13, 0x52f2ff, [0.12, 0.37, 0.245]),
          box(0.22, 0.06, 0.05, 0xffffff, [0, 0.16, 0.24]),
        ];
        addHatParts(head, hatId, 0.72);
        add(headPivot, head);

        leftArm.position.set(-0.74, 1.48, 0);
        rightArm.position.set(0.74, 1.48, 0);
        leftLeg.position.set(-0.24, 0.56, 0);
        rightLeg.position.set(0.24, 0.56, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [
          dodec(0.26, pal.primary, [0, 0, 0]),
          cyl(0.19, 0.16, 0.52, 6, pal.primary, [-0.04, -0.32, 0.06], [-0.35, 0, 0.12]),
          box(0.24, 0.22, 0.24, pal.accent, [-0.05, -0.58, 0.18]),
        ]);
        add(rightArm, [
          dodec(0.26, pal.primary, [0, 0, 0]),
          cyl(0.19, 0.16, 0.52, 6, pal.primary, [0.04, -0.32, 0.06], [-0.35, 0, -0.12]),
          box(0.24, 0.22, 0.24, pal.accent, [0.05, -0.58, 0.18]),
        ]);
        add(leftLeg, [cyl(0.18, 0.14, 0.42, 6, pal.primary, [0, -0.2, 0]), box(0.28, 0.2, 0.36, pal.boots, [0, -0.46, 0.06])]);
        add(rightLeg, [cyl(0.18, 0.14, 0.42, 6, pal.primary, [0, -0.2, 0]), box(0.28, 0.2, 0.36, pal.boots, [0, -0.46, 0.06])]);
        rightArm.add(weaponPivot);

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
        break;
      }

      case 'Amog': {
        // Mushroom Plague Cap alchemist with spore pack, potion bandolier & Poison Flask!
        add(bodyPivot, [
          cone(0.48, 0.96, 7, pal.secondary, [0, 1.0, 0]),
          box(0.68, 0.1, 0.48, 0x5c3c24, [0, 1.12, 0.08], [0, 0, 0.35]),
          cyl(0.07, 0.07, 0.2, 6, pal.accent, [-0.14, 1.18, 0.32]),
          cyl(0.07, 0.07, 0.2, 6, 0x4dff77, [0.14, 1.06, 0.32]),
          // Spore canister backpack
          cyl(0.2, 0.22, 0.58, 7, 0x45355e, [0, 1.18, -0.38]),
          dodec(0.18, pal.accent, [0, 1.5, -0.38]),
        ]);
        headPivot.position.set(0, 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Shadowed plague-mask head under overhanging cap
          cyl(0.24, 0.28, 0.36, 7, 0x1a1524, [0, 0.18, 0]),
          box(0.11, 0.09, 0.07, 0xd8ff3b, [-0.11, 0.22, 0.24]),
          box(0.11, 0.09, 0.07, 0xd8ff3b, [0.11, 0.22, 0.24]),
          // Iconic huge spotted mushroom plague cap!
          cyl(0.66, 0.62, 0.1, 8, 0xe8e0c5, [0, 0.36, 0]),
          cone(0.76, 0.58, 8, pal.primary, [0, 0.66, 0]),
          dodec(0.14, pal.accent, [-0.36, 0.58, 0.34], undefined, [1.0, 0.65, 1.0]),
          dodec(0.15, pal.accent, [0.34, 0.62, 0.28], undefined, [1.0, 0.65, 1.0]),
          dodec(0.13, pal.accent, [0.02, 0.72, -0.34], undefined, [1.0, 0.65, 1.0]),
          dodec(0.12, 0xf2ebd9, [-0.28, 0.7, -0.18], undefined, [1.0, 0.65, 1.0]),
        ];
        addHatParts(head, hatId, 0.94);
        add(headPivot, head);
        attachStdLimbs(pal.secondary, pal.skin, pal.secondary, pal.boots, 0.44, 0.18, 0.56, 1.28);
        weaponPivot.position.set(0.06, -0.44, 0.2);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.08, 0.09, 0.22, 6, 0x5c3c24, [0, 0.22, 0.1]),
          dodec(0.24, pal.weapon, [0, 0.02, 0.1]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.12, 0), [0, 0.36, 0.1]);
        break;
      }

      case 'Athena': {
        // Crested Greek Hoplite Helm + Golden-Cyan Aegis Shield on left arm + Spear!
        add(bodyPivot, [
          cyl(0.35, 0.44, 0.88, 7, pal.primary, [0, 1.04, 0]),
          box(0.68, 0.48, 0.44, pal.accent, [0, 1.22, 0.04]),
          box(0.24, 0.34, 0.08, pal.secondary, [0, 1.22, 0.28]),
          cyl(0.42, 0.44, 0.14, 8, pal.accent, [0, 0.76, 0]),
          dodec(0.22, pal.accent, [-0.46, 1.38, 0]),
          dodec(0.22, pal.accent, [0.46, 1.38, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.26, 0]),
          // Corinthian crested gold helm
          cyl(0.36, 0.38, 0.42, 8, pal.accent, [0, 0.38, -0.02]),
          box(0.1, 0.24, 0.1, pal.accent, [0, 0.26, 0.35]), // noseguard
          box(0.09, 0.09, 0.06, 0x162038, [-0.12, 0.28, 0.32]),
          box(0.09, 0.09, 0.06, 0x162038, [0.12, 0.28, 0.32]),
          // Dramatic sweeping azure horsehair crest!
          box(0.12, 0.36, 0.64, pal.secondary, [0, 0.74, -0.04], [-0.15, 0, 0]),
          cone(0.14, 0.42, 5, 0x62c4ff, [0, 0.62, -0.46], [-1.1, 0, 0]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.26);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.76, 1.05, 0.07, pal.secondary, [0, -0.5, -0.06], [0.14, 0, 0]),
          box(0.78, 0.11, 0.08, pal.accent, [0, -0.98, -0.14], [0.14, 0, 0]),
        ]);
        attachStdLimbs(pal.skin, pal.accent, pal.primary, pal.boots, 0.48, 0.19, 0.64, 1.34);
        // Iconic Aegis round buckler shield on leftArm!
        add(leftArm, [
          cyl(0.56, 0.56, 0.1, 8, pal.accent, [-0.18, -0.34, 0.18], [0, 0, Math.PI * 0.5]),
          cyl(0.42, 0.42, 0.13, 8, pal.secondary, [-0.2, -0.34, 0.18], [0, 0, Math.PI * 0.5]),
          octa(0.16, 0x70e4ff, [-0.27, -0.34, 0.18]),
        ]);
        weaponPivot.position.set(0.06, -0.44, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.045, 0.05, 2.05, 6, 0x8f562e, [0, 0.55, 0.18], [0.25, 0, 0]),
          cone(0.14, 0.48, 4, pal.weapon, [0, 1.65, 0.45], [0.25, 0, 0]),
        ]);
        break;
      }

      case 'Bandit': {
        // Deep hood + crimson bandana + twin curved daggers!
        add(bodyPivot, [
          cyl(0.32, 0.4, 0.84, 7, pal.primary, [0, 1.04, 0]),
          box(0.68, 0.12, 0.46, 0x5c361d, [0, 1.1, 0.02], [0, 0, -0.45]),
          box(0.44, 0.14, 0.44, pal.secondary, [0, 0.72, 0]),
          dodec(0.22, pal.primary, [-0.46, 1.36, 0]),
        ]);
        headPivot.position.set(0, 1.52, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.37, pal.primary, [0, 0.28, -0.02]),
          cone(0.34, 0.52, 5, pal.primary, [0, 0.44, -0.28], [-0.7, 0, 0]),
          box(0.36, 0.34, 0.24, 0x14121f, [0, 0.24, 0.2]),
          box(0.38, 0.18, 0.2, pal.secondary, [0, 0.14, 0.26]), // crimson rogue mask
          box(0.11, 0.07, 0.07, pal.accent, [-0.11, 0.3, 0.34]),
          box(0.11, 0.07, 0.07, pal.accent, [0.11, 0.3, 0.34]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.4, -0.24);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.7, 0.86, 0.06, pal.secondary, [0, -0.42, -0.06], [0.2, 0, 0]),
          cone(0.18, 0.34, 4, pal.secondary, [-0.22, -0.92, -0.14], [Math.PI, 0, 0.1]),
          cone(0.18, 0.38, 4, pal.secondary, [0.22, -0.94, -0.14], [Math.PI, 0, -0.1]),
        ]);
        attachStdLimbs(pal.primary, 0x262030, pal.primary, pal.boots, 0.42, 0.18, 0.62, 1.32);
        // Twin curved daggers (left hand + right hand weaponPivot!)
        add(leftArm, [
          box(0.08, 0.62, 0.12, pal.weapon, [0, -0.52, 0.34], [1.25, 0, 0.15]),
          box(0.24, 0.07, 0.08, pal.accent, [0, -0.52, 0.12]),
        ]);
        weaponPivot.position.set(0.04, -0.48, 0.12);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.08, 0.66, 0.12, pal.weapon, [0, 0.02, 0.28], [1.25, 0, -0.15]),
          box(0.24, 0.07, 0.08, pal.accent, [0, 0, 0.04]),
        ]);
        break;
      }

      case 'Birdo': {
        // Winged azure avian hero with golden beak, aviator scarf & articulated gliding wings!
        add(bodyPivot, [
          dodec(0.46, pal.primary, [0, 1.02, 0], undefined, [0.95, 1.15, 0.95]),
          dodec(0.36, pal.secondary, [0, 1.0, 0.18], undefined, [0.82, 0.95, 0.6]),
          cyl(0.36, 0.38, 0.14, 7, 0xff4d5e, [0, 1.44, 0.02]), // aviator scarf
        ]);
        headPivot.position.set(0, 1.54, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.36, pal.primary, [0, 0.24, 0]),
          // Bright golden curved beak!
          cone(0.16, 0.46, 5, pal.accent, [0, 0.18, 0.44], [Math.PI * 0.56, 0, 0]),
          cone(0.11, 0.26, 4, 0xe09018, [0, 0.1, 0.36], [Math.PI * 0.58, 0, 0]),
          // Head feather crest plumes
          cone(0.1, 0.36, 4, pal.primary, [0, 0.62, -0.08], [-0.45, 0, 0]),
          cone(0.08, 0.28, 4, pal.secondary, [0, 0.56, -0.22], [-0.75, 0, 0]),
          // Bright bird eyes
          box(0.11, 0.11, 0.07, 0x121622, [-0.18, 0.3, 0.28]),
          box(0.05, 0.05, 0.08, 0xffffff, [-0.16, 0.33, 0.29]),
          box(0.11, 0.11, 0.07, 0x121622, [0.18, 0.3, 0.28]),
          box(0.05, 0.05, 0.08, 0xffffff, [0.2, 0.33, 0.29]),
        ];
        addHatParts(head, hatId, 0.58);
        add(headPivot, head);

        // Articulated feathered wings on back/shoulders (flare wide when gliding!)
        leftWingPivot = new THREE.Group();
        leftWingPivot.position.set(-0.34, 1.24, -0.14);
        rightWingPivot = new THREE.Group();
        rightWingPivot.position.set(0.34, 1.24, -0.14);
        bodyPivot.add(leftWingPivot, rightWingPivot);
        add(leftWingPivot, [
          box(0.86, 0.44, 0.1, pal.primary, [-0.45, 0.05, -0.05], [0, 0.15, 0.18]),
          cone(0.16, 0.48, 4, pal.secondary, [-0.95, 0.16, -0.08], [0, 0, 1.35]),
          cone(0.14, 0.42, 4, pal.secondary, [-0.84, -0.1, -0.08], [0, 0, 1.7]),
        ]);
        add(rightWingPivot, [
          box(0.86, 0.44, 0.1, pal.primary, [0.45, 0.05, -0.05], [0, -0.15, -0.18]),
          cone(0.16, 0.48, 4, pal.secondary, [0.95, 0.16, -0.08], [0, 0, -1.35]),
          cone(0.14, 0.42, 4, pal.secondary, [0.84, -0.1, -0.08], [0, 0, -1.7]),
        ]);

        // Tail feathers
        tailPivot = new THREE.Group();
        tailPivot.position.set(0, 0.78, -0.34);
        bodyPivot.add(tailPivot);
        add(tailPivot, [
          box(0.36, 0.1, 0.54, pal.primary, [0, 0.05, -0.25], [0.2, 0, 0]),
          box(0.24, 0.08, 0.48, pal.secondary, [0, 0.1, -0.32], [0.25, 0, 0]),
        ]);

        leftArm.position.set(-0.42, 1.26, 0.06);
        rightArm.position.set(0.42, 1.26, 0.06);
        leftLeg.position.set(-0.18, 0.58, 0);
        rightLeg.position.set(0.18, 0.58, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.09, 0.07, 0.44, 6, pal.primary, [0, -0.2, 0])]);
        add(rightArm, [cyl(0.09, 0.07, 0.44, 6, pal.primary, [0, -0.2, 0])]);
        add(leftLeg, [cyl(0.07, 0.06, 0.44, 5, pal.boots, [0, -0.2, 0]), box(0.24, 0.08, 0.34, pal.boots, [0, -0.46, 0.08])]);
        add(rightLeg, [cyl(0.07, 0.06, 0.44, 5, pal.boots, [0, -0.2, 0]), box(0.24, 0.08, 0.34, pal.boots, [0, -0.46, 0.08])]);

        weaponPivot.position.set(0.04, -0.38, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [cyl(0.045, 0.05, 1.25, 6, pal.secondary, [0, 0.25, 0.14], [0.3, 0, 0])]);
        addGlowOrb(weaponPivot, new THREE.ConeGeometry(0.18, 0.42, 6), [0, 0.92, 0.32]);
        break;
      }

      case 'Bush': {
        // Leafy low-poly Ghillie Sniper with tactical scope goggles & long Sniper Rifle!
        add(bodyPivot, [
          dodec(0.56, pal.primary, [0, 1.02, 0], undefined, [1.08, 1.05, 1.0]),
          dodec(0.38, 0x5cc443, [-0.36, 1.22, 0.16]),
          dodec(0.38, 0x38852b, [0.36, 1.18, -0.14]),
          dodec(0.36, pal.accent, [0.05, 0.86, 0.32], undefined, [1.1, 0.7, 0.7]),
          dodec(0.34, 0x357d29, [0, 1.12, -0.36]),
        ]);
        headPivot.position.set(0, 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.46, pal.primary, [0, 0.28, 0], undefined, [1.1, 0.95, 1.08]),
          dodec(0.28, 0x6cd44a, [-0.26, 0.46, 0.12]),
          dodec(0.26, 0x35822a, [0.28, 0.44, -0.08]),
          dodec(0.22, pal.accent, [0, 0.58, 0.05]),
          // Peeking dark visor + bright yellow tactical sniper goggles!
          box(0.36, 0.16, 0.12, 0x151a24, [0, 0.26, 0.38]),
          cyl(0.08, 0.08, 0.14, 6, 0xffd23f, [-0.11, 0.26, 0.44], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.08, 0.14, 6, 0x70ff98, [0.11, 0.26, 0.44], [Math.PI * 0.5, 0, 0]),
        ];
        addHatParts(head, hatId, 0.7);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.secondary, pal.secondary, pal.boots, 0.48, 0.2, 0.58, 1.28);
        weaponPivot.position.set(0.06, -0.4, 0.28);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.13, 0.18, 0.92, pal.secondary, [0, 0, 0.15]),
          cyl(0.05, 0.05, 1.55, 6, pal.weapon, [0, 0.04, 0.95], [Math.PI * 0.5, 0, 0]),
          cyl(0.06, 0.06, 0.42, 6, 0x262f3b, [0, 0.18, 0.48], [Math.PI * 0.5, 0, 0]),
        ]);
        addGlowOrb(weaponPivot, new THREE.BoxGeometry(0.07, 0.07, 0.16), [0, 0.18, 0.72]);
        break;
      }

      case 'SirChadwell': {
        // Dark Horned Cursed Knight w/ sweeping obsidian horns, purple cape & Corrupted Greatsword!
        add(bodyPivot, [
          box(0.86, 0.88, 0.56, pal.primary, [0, 1.08, 0]),
          box(0.24, 0.5, 0.1, pal.accent, [0, 1.12, 0.29]),
          dodec(0.32, pal.secondary, [-0.54, 1.42, 0]),
          cone(0.12, 0.38, 4, pal.accent, [-0.66, 1.66, 0], [0, 0, 0.45]),
          dodec(0.32, pal.secondary, [0.54, 1.42, 0]),
          cone(0.12, 0.38, 4, pal.accent, [0.66, 1.66, 0], [0, 0, -0.45]),
        ]);
        headPivot.position.set(0, 1.56, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.34, 0.38, 0.6, 7, pal.secondary, [0, 0.3, 0]),
          box(0.46, 0.1, 0.1, 0x0c0814, [0, 0.32, 0.33]),
          box(0.12, 0.07, 0.08, pal.accent, [-0.12, 0.32, 0.36]),
          box(0.12, 0.07, 0.08, pal.accent, [0.12, 0.32, 0.36]),
          // Huge sweeping cursed obsidian horns!
          cone(0.13, 0.54, 5, 0x160f24, [-0.36, 0.62, 0.04], [0.22, 0, 0.78]),
          cone(0.09, 0.42, 5, pal.accent, [-0.58, 0.88, 0.12], [0.12, 0, 0.22]),
          cone(0.13, 0.54, 5, 0x160f24, [0.36, 0.62, 0.04], [0.22, 0, -0.78]),
          cone(0.09, 0.42, 5, pal.accent, [0.58, 0.88, 0.12], [0.12, 0, -0.22]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.3);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.86, 1.15, 0.08, pal.secondary, [0, -0.55, -0.06], [0.18, 0, 0]),
          box(0.88, 0.12, 0.09, pal.accent, [0, -1.08, -0.16], [0.18, 0, 0]),
        ]);
        attachStdLimbs(pal.primary, pal.secondary, pal.primary, pal.boots, 0.56, 0.22, 0.64, 1.34);
        weaponPivot.position.set(0.06, -0.46, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.06, 0.06, 0.44, 6, pal.secondary, [0, -0.04, 0.08], [0.35, 0, 0]),
          box(0.68, 0.14, 0.18, pal.secondary, [0, 0.18, 0.16], [0.35, 0, 0]),
          box(0.32, 1.62, 0.1, 0x2a1842, [0, 1.0, 0.46], [0.35, 0, 0]),
          box(0.12, 1.5, 0.13, pal.weapon, [0, 1.0, 0.46], [0.35, 0, 0]),
          cone(0.22, 0.46, 4, pal.weapon, [0, 1.9, 0.78], [0.35, Math.PI * 0.25, 0]),
        ]);
        break;
      }

      case 'Cl4nk': {
        // Chunky boxy retro robot w/ glowing cyan CRT visor, antenna & Revolver!
        add(bodyPivot, [
          box(0.76, 0.78, 0.54, pal.primary, [0, 1.06, 0]),
          box(0.54, 0.42, 0.08, pal.secondary, [0, 1.12, 0.28]),
          box(0.14, 0.14, 0.1, pal.accent, [-0.14, 1.14, 0.32]),
          box(0.22, 0.08, 0.1, 0xff4d5e, [0.1, 1.14, 0.32]),
          box(0.62, 0.2, 0.42, pal.secondary, [0, 0.64, 0]),
          // Back battery pack
          box(0.46, 0.52, 0.24, pal.secondary, [0, 1.1, -0.36]),
        ]);
        headPivot.position.set(0, 1.5, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.14, 0.16, 0.16, 6, pal.secondary, [0, 0.08, 0]),
          box(0.66, 0.52, 0.52, pal.primary, [0, 0.38, 0]),
          // Glowing retro cyan CRT visor screen!
          box(0.54, 0.26, 0.08, 0x0f172a, [0, 0.4, 0.26]),
          box(0.46, 0.18, 0.09, pal.accent, [0, 0.4, 0.27]),
          // Side bolt ears + top antenna
          cyl(0.11, 0.11, 0.12, 6, pal.secondary, [-0.38, 0.38, 0], [0, 0, Math.PI * 0.5]),
          cyl(0.11, 0.11, 0.12, 6, pal.secondary, [0.38, 0.38, 0], [0, 0, Math.PI * 0.5]),
          cyl(0.035, 0.04, 0.36, 5, pal.secondary, [0, 0.8, 0]),
          octa(0.09, pal.accent, [0, 1.0, 0]),
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        leftArm.position.set(-0.5, 1.32, 0);
        rightArm.position.set(0.5, 1.32, 0);
        leftLeg.position.set(-0.22, 0.58, 0);
        rightLeg.position.set(0.22, 0.58, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [box(0.2, 0.52, 0.2, pal.secondary, [0, -0.26, 0]), box(0.22, 0.18, 0.22, pal.primary, [0, -0.54, 0])]);
        add(rightArm, [box(0.2, 0.52, 0.2, pal.secondary, [0, -0.26, 0]), box(0.22, 0.18, 0.22, pal.primary, [0, -0.54, 0])]);
        add(leftLeg, [box(0.2, 0.44, 0.22, pal.secondary, [0, -0.2, 0]), box(0.28, 0.18, 0.38, pal.boots, [0, -0.48, 0.06])]);
        add(rightLeg, [box(0.2, 0.44, 0.22, pal.secondary, [0, -0.2, 0]), box(0.28, 0.18, 0.38, pal.boots, [0, -0.48, 0.06])]);

        weaponPivot.position.set(0.04, -0.44, 0.22);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.12, 0.24, 0.14, 0x6e4326, [0, -0.06, 0]),
          cyl(0.11, 0.11, 0.24, 6, pal.weapon, [0, 0.12, 0.18], [Math.PI * 0.5, 0, 0]),
          box(0.1, 0.12, 0.56, pal.weapon, [0, 0.16, 0.48]),
        ]);
        break;
      }

      case 'Dicehead': {
        // Dapper gambler suit + GIANT tumbling D6 CUBE HEAD with real 3D pips on ALL 6 faces!
        add(bodyPivot, [
          box(0.7, 0.84, 0.44, pal.primary, [0, 1.04, 0]),
          box(0.24, 0.54, 0.08, 0xffffff, [0, 1.18, 0.22]),
          cone(0.09, 0.42, 4, pal.accent, [0, 1.08, 0.26], [Math.PI, 0, 0]), // golden tie
          box(0.74, 0.12, 0.48, pal.secondary, [0, 0.68, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const half = 0.34;
        const cy = 0.38;
        const head: ColoredPartSpec[] = [
          box(half * 2, half * 2, half * 2, pal.skin, [0, cy, 0]),
        ];
        // All 6 faces with genuine D6 pips (opposite faces sum to 7!)
        addDicePipCluster(head, 'front', 6, half, cy);
        addDicePipCluster(head, 'back', 1, half, cy);
        addDicePipCluster(head, 'top', 5, half, cy);
        addDicePipCluster(head, 'bottom', 2, half, cy);
        addDicePipCluster(head, 'right', 3, half, cy);
        addDicePipCluster(head, 'left', 4, half, cy);
        addHatParts(head, hatId, cy + half + 0.02);
        add(headPivot, head);

        attachStdLimbs(pal.primary, 0xffffff, pal.secondary, pal.boots, 0.46, 0.19, 0.62, 1.34);
        weaponPivot.position.set(0.05, -0.44, 0.24);
        rightArm.add(weaponPivot);
        addGlowOrb(weaponPivot, new THREE.BoxGeometry(0.32, 0.32, 0.32), [0, 0.1, 0.12]);
        break;
      }

      case 'Monke': {
        // Chunky primate with rounded ears, tan muzzle, jungle vest, curled monkey tail & Bananarang!
        add(bodyPivot, [
          dodec(0.46, pal.primary, [0, 1.02, 0], undefined, [1.05, 1.1, 0.92]),
          box(0.68, 0.56, 0.48, pal.secondary, [0, 1.08, 0.04]),
          box(0.34, 0.46, 0.1, pal.skin, [0, 1.04, 0.28]),
        ]);
        headPivot.position.set(0, 1.52, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.38, pal.primary, [0, 0.26, 0]),
          // Rounded monkey ears
          cyl(0.15, 0.15, 0.08, 7, pal.primary, [-0.38, 0.28, 0], [Math.PI * 0.5, 0, 0]),
          cyl(0.09, 0.09, 0.1, 7, pal.skin, [-0.38, 0.28, 0.01], [Math.PI * 0.5, 0, 0]),
          cyl(0.15, 0.15, 0.08, 7, pal.primary, [0.38, 0.28, 0], [Math.PI * 0.5, 0, 0]),
          cyl(0.09, 0.09, 0.1, 7, pal.skin, [0.38, 0.28, 0.01], [Math.PI * 0.5, 0, 0]),
          // Expressive tan primate face & muzzle
          dodec(0.24, pal.skin, [0, 0.18, 0.24], undefined, [1.15, 0.85, 0.85]),
          box(0.1, 0.1, 0.06, 0x14161f, [-0.13, 0.31, 0.33]),
          box(0.1, 0.1, 0.06, 0x14161f, [0.13, 0.31, 0.33]),
          box(0.2, 0.05, 0.05, 0x3b2214, [0, 0.12, 0.44]),
        ];
        addHatParts(head, hatId, 0.62);
        add(headPivot, head);

        // Articulated curled monkey tail!
        tailPivot = new THREE.Group();
        tailPivot.position.set(0, 0.78, -0.34);
        bodyPivot.add(tailPivot);
        add(tailPivot, [
          cyl(0.075, 0.085, 0.58, 6, pal.primary, [0, 0.05, -0.26], [1.4, 0, 0]),
          cyl(0.065, 0.075, 0.52, 6, pal.primary, [0, 0.26, -0.64], [0.55, 0, 0]),
          dodec(0.12, pal.primary, [0, 0.54, -0.74]),
        ]);
        attachStdLimbs(pal.primary, pal.skin, pal.primary, pal.boots, 0.46, 0.2, 0.6, 1.32);
        weaponPivot.position.set(0.06, -0.44, 0.2);
        rightArm.add(weaponPivot);
        // Oversized golden Bananarang!
        add(weaponPivot, [
          torus(0.42, 0.1, 5, 10, pal.weapon, [0, 0.2, 0.2], [0.2, 0.4, 0.6], undefined, Math.PI * 0.85),
          box(0.1, 0.1, 0.1, 0x4f3018, [0.36, 0.4, 0.26]),
        ]);
        break;
      }

      case 'Ninja': {
        // Sleek shinobi armor + flowing crimson scarf + razor curved Katana!
        add(bodyPivot, [
          cyl(0.32, 0.38, 0.86, 7, pal.primary, [0, 1.04, 0]),
          box(0.56, 0.44, 0.42, pal.secondary, [0, 1.14, 0]),
          cyl(0.38, 0.39, 0.14, 7, pal.accent, [0, 0.74, 0]),
          cyl(0.38, 0.38, 0.16, 8, pal.accent, [0, 1.44, 0.02]), // crimson neck scarf
        ]);
        headPivot.position.set(0, 1.52, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.36, pal.primary, [0, 0.26, 0]),
          box(0.36, 0.14, 0.1, pal.skin, [0, 0.29, 0.3]),
          box(0.1, 0.07, 0.07, 0x111521, [-0.11, 0.29, 0.35]),
          box(0.1, 0.07, 0.07, 0x111521, [0.11, 0.29, 0.35]),
          // Headband + metallic shinobi forehead plate
          cyl(0.37, 0.37, 0.1, 8, pal.accent, [0, 0.41, 0]),
          box(0.28, 0.12, 0.07, 0xcbd5e1, [0, 0.41, 0.35]),
        ];
        addHatParts(head, hatId, 0.62);
        add(headPivot, head);
        // Dramatic flowing crimson ninja scarf tail!
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.42, -0.26);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.28, 1.08, 0.06, pal.accent, [-0.08, -0.5, -0.14], [0.32, 0, 0.12]),
          box(0.22, 0.88, 0.06, 0xff5c77, [0.12, -0.44, -0.1], [0.24, 0, -0.14]),
        ]);
        attachStdLimbs(pal.primary, 0x141824, pal.primary, pal.boots, 0.42, 0.18, 0.62, 1.32);
        weaponPivot.position.set(0.05, -0.46, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.045, 0.045, 0.42, 6, pal.accent, [0, -0.04, 0.06], [0.42, 0, 0]),
          cyl(0.14, 0.14, 0.05, 8, 0xffd23f, [0, 0.16, 0.15], [0.42, 0, 0]),
          box(0.08, 1.62, 0.12, pal.weapon, [0, 0.94, 0.5], [0.42, 0, 0]),
          box(0.05, 1.56, 0.05, pal.weaponGlow, [0, 0.94, 0.56], [0.42, 0, 0]),
        ]);
        break;
      }

      case 'Noelle': {
        // Cozy frost-mage parka + pointed frost hood + glowing Crystal Staff!
        add(bodyPivot, [
          cone(0.54, 1.02, 8, pal.primary, [0, 0.96, 0]),
          cyl(0.56, 0.58, 0.14, 8, pal.secondary, [0, 0.52, 0]), // fluffy snow hem
          cyl(0.36, 0.4, 0.18, 8, pal.secondary, [0, 1.44, 0.02]), // fluffy snow collar
          box(0.14, 0.72, 0.1, pal.secondary, [0, 1.0, 0.34]),
        ]);
        headPivot.position.set(0, 1.5, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.33, pal.skin, [0, 0.24, 0.06]),
          // Pointed winter frost hood + snow trim
          dodec(0.42, pal.primary, [0, 0.3, -0.06]),
          cone(0.32, 0.48, 6, pal.primary, [0, 0.54, -0.26], [-0.65, 0, 0]),
          torus(0.34, 0.075, 5, 10, pal.secondary, [0, 0.28, 0.18]),
          // Rosy frost cheeks & ice-blue eyes
          box(0.09, 0.1, 0.06, 0x1d4ed8, [-0.12, 0.28, 0.35]),
          box(0.09, 0.1, 0.06, 0x1d4ed8, [0.12, 0.28, 0.35]),
          octa(0.1, 0xb8f3ff, [0, 0.56, 0.28]), // crystal snowflake hairpin
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.38, -0.28);
        bodyPivot.add(capePivot);
        add(capePivot, [box(0.64, 0.92, 0.06, pal.accent, [0, -0.44, -0.06], [0.16, 0, 0])]);
        attachStdLimbs(pal.primary, pal.secondary, pal.secondary, pal.boots, 0.44, 0.18, 0.54, 1.3);
        weaponPivot.position.set(0.05, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.05, 0.06, 1.92, 6, 0xe0f2fe, [0, 0.38, 0.14], [0.22, 0, 0]),
          octa(0.16, pal.accent, [0, 1.24, 0.34]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.24, 0), [0, 1.46, 0.38]);
        break;
      }

      case 'Ogre': {
        // Colossal bulky emerald tusker brute w/ protruding ivory tusks & giant Battle Axe!
        add(bodyPivot, [
          dodec(0.68, pal.primary, [0, 1.12, 0], undefined, [1.18, 1.05, 1.04]),
          box(0.92, 0.34, 0.72, pal.secondary, [0, 0.66, 0]),
          box(0.88, 0.14, 0.72, 0x4a301e, [0, 1.18, 0.04], [0, 0, 0.42]),
          dodec(0.32, 0xe8d5a8, [-0.66, 1.48, 0]), // skull/bone pauldron
        ]);
        headPivot.position.set(0, 1.66, 0.08);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.42, pal.skin, [0, 0.26, 0], undefined, [1.12, 0.95, 1.05]),
          box(0.6, 0.16, 0.24, pal.primary, [0, 0.42, 0.28]), // heavy brow ridge
          // Protruding curved ivory tusks!
          cone(0.08, 0.36, 5, 0xfff8e6, [-0.2, 0.14, 0.42], [0.35, 0, 0.22]),
          cone(0.08, 0.36, 5, 0xfff8e6, [0.2, 0.14, 0.42], [0.35, 0, -0.22]),
          box(0.11, 0.08, 0.06, 0xffd23f, [-0.15, 0.32, 0.38]),
          box(0.11, 0.08, 0.06, 0xffd23f, [0.15, 0.32, 0.38]),
          cone(0.1, 0.26, 4, pal.skin, [-0.46, 0.28, 0], [0, 0, 1.2]),
          cone(0.1, 0.26, 4, pal.skin, [0.46, 0.28, 0], [0, 0, -1.2]),
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        leftArm.position.set(-0.74, 1.42, 0);
        rightArm.position.set(0.74, 1.42, 0);
        leftLeg.position.set(-0.28, 0.56, 0);
        rightLeg.position.set(0.28, 0.56, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.2, 0.17, 0.58, 6, pal.primary, [0, -0.26, 0]), dodec(0.2, pal.skin, [0, -0.58, 0.04])]);
        add(rightArm, [cyl(0.2, 0.17, 0.58, 6, pal.primary, [0, -0.26, 0]), dodec(0.2, pal.skin, [0, -0.58, 0.04])]);
        add(leftLeg, [cyl(0.22, 0.18, 0.44, 6, pal.primary, [0, -0.2, 0]), box(0.32, 0.2, 0.42, pal.boots, [0, -0.48, 0.08])]);
        add(rightLeg, [cyl(0.22, 0.18, 0.44, 6, pal.primary, [0, -0.2, 0]), box(0.32, 0.2, 0.42, pal.boots, [0, -0.48, 0.08])]);

        weaponPivot.position.set(0.06, -0.5, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.07, 0.075, 1.75, 6, pal.secondary, [0, 0.42, 0.18], [0.35, 0, 0]),
          box(0.72, 0.52, 0.12, pal.weapon, [0, 1.15, 0.45], [0.35, 0, 0]),
          box(0.8, 0.44, 0.08, 0xe2e8f0, [0, 1.15, 0.45], [0.35, 0, 0]),
        ]);
        break;
      }

      case 'Roberto': {
        // Floating hooded spectral reaper w/ glowing mint eyes & curved Grim Scythe!
        hoverMode = 'float';
        add(bodyPivot, [
          cone(0.56, 1.38, 7, pal.primary, [0, 0.98, 0]),
          cone(0.2, 0.46, 4, pal.secondary, [-0.34, 0.3, 0.16], [Math.PI, 0, 0.16]),
          cone(0.2, 0.5, 4, pal.secondary, [0.34, 0.28, 0.16], [Math.PI, 0, -0.16]),
          cone(0.22, 0.52, 4, pal.secondary, [0, 0.26, -0.34], [Math.PI, 0, 0]),
          cyl(0.42, 0.46, 0.14, 7, pal.secondary, [0, 1.44, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.4, pal.primary, [0, 0.28, 0]),
          cone(0.32, 0.52, 5, pal.primary, [0, 0.54, -0.22], [-0.6, 0, 0]),
          box(0.38, 0.34, 0.24, 0x090812, [0, 0.24, 0.24]),
          box(0.11, 0.08, 0.08, pal.accent, [-0.11, 0.28, 0.37]),
          box(0.11, 0.08, 0.08, pal.accent, [0.11, 0.28, 0.37]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        leftArm.position.set(-0.44, 1.34, 0.04);
        rightArm.position.set(0.44, 1.34, 0.04);
        leftLeg.position.set(-0.16, 0.4, 0);
        rightLeg.position.set(0.16, 0.4, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cone(0.18, 0.56, 5, pal.secondary, [0, -0.26, 0.08], [0.25, 0, 0.15])]);
        add(rightArm, [cone(0.18, 0.56, 5, pal.secondary, [0, -0.26, 0.08], [0.25, 0, -0.15])]);
        weaponPivot.position.set(0.06, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.05, 0.055, 2.2, 6, 0x3b2d4d, [0, 0.5, 0.18], [0.26, 0, 0]),
          // Iconic curved Grim Scythe crescent blade!
          torus(0.56, 0.09, 4, 10, pal.weapon, [-0.46, 1.48, 0.48], [0.26, 0, -0.35], undefined, Math.PI * 0.72),
          torus(0.62, 0.04, 4, 10, pal.accent, [-0.48, 1.48, 0.48], [0.26, 0, -0.35], undefined, Math.PI * 0.68),
        ]);
        break;
      }

      case 'Robinette': {
        // Feathered emerald archer cap + quiver + strung Longbow!
        add(bodyPivot, [
          cyl(0.32, 0.44, 0.88, 7, pal.primary, [0, 1.02, 0]),
          cyl(0.4, 0.42, 0.14, 7, pal.secondary, [0, 0.8, 0]),
          box(0.16, 0.14, 0.1, pal.accent, [0, 0.8, 0.39]),
          // Leather quiver packed with feathered arrows on back!
          cyl(0.16, 0.14, 0.72, 6, pal.secondary, [0.16, 1.18, -0.34], [0.15, 0, -0.35]),
          cone(0.07, 0.18, 4, 0xff4d5e, [0.28, 1.56, -0.38]),
          cone(0.07, 0.18, 4, pal.accent, [0.18, 1.58, -0.3]),
        ]);
        headPivot.position.set(0, 1.52, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.24, 0]),
          box(0.09, 0.1, 0.06, 0x161b26, [-0.12, 0.27, 0.3]),
          box(0.09, 0.1, 0.06, 0x161b26, [0.12, 0.27, 0.3]),
          // Iconic jaunty Robin Hood feathered cap!
          cone(0.4, 0.44, 6, pal.primary, [0, 0.56, -0.04], [-0.35, 0, 0]),
          cyl(0.38, 0.36, 0.1, 7, 0x1c6e38, [0, 0.4, 0]),
          cone(0.08, 0.48, 4, 0xff3b5c, [0.26, 0.68, -0.06], [-0.2, 0, -0.52]), // crimson feather!
        ];
        addHatParts(head, hatId, 0.72);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.skin, pal.secondary, pal.boots, 0.42, 0.18, 0.62, 1.32);
        weaponPivot.position.set(0.06, -0.4, 0.24);
        rightArm.add(weaponPivot);
        // Strung Longbow + nocked glowing arrow!
        add(weaponPivot, [
          torus(0.62, 0.055, 5, 10, pal.weapon, [0, 0.12, 0.16], [0, Math.PI * 0.5, -Math.PI * 0.45], undefined, Math.PI * 0.9),
          cyl(0.02, 0.02, 1.15, 4, 0xfff4d6, [0, 0.12, -0.02]),
          cyl(0.03, 0.03, 1.05, 5, pal.accent, [0, 0.12, 0.34], [Math.PI * 0.5, 0, 0]),
          cone(0.09, 0.22, 4, 0xffffff, [0, 0.12, 0.88], [Math.PI * 0.5, 0, 0]),
        ]);
        break;
      }

      case 'Spaceman': {
        // Chunky astronaut suit + bubble helmet + twin-thruster Jetpack!
        hoverMode = 'float';
        add(bodyPivot, [
          box(0.76, 0.84, 0.54, pal.primary, [0, 1.06, 0]),
          box(0.46, 0.32, 0.12, pal.secondary, [0, 1.16, 0.28]),
          box(0.14, 0.12, 0.14, pal.accent, [-0.1, 1.16, 0.3]),
          box(0.12, 0.12, 0.14, 0x52f2ff, [0.12, 1.16, 0.3]),
          cyl(0.42, 0.44, 0.14, 8, pal.accent, [0, 0.72, 0]),
          // Twin-thruster Jetpack on back!
          box(0.58, 0.66, 0.26, 0xcbd5e1, [0, 1.14, -0.38]),
          cyl(0.14, 0.16, 0.56, 7, pal.secondary, [-0.22, 1.1, -0.44]),
          cyl(0.14, 0.16, 0.56, 7, pal.secondary, [0.22, 1.1, -0.44]),
          cone(0.13, 0.32, 6, 0xff9f1c, [-0.22, 0.66, -0.44], [Math.PI, 0, 0]),
          cone(0.13, 0.32, 6, 0xff9f1c, [0.22, 0.66, -0.44], [Math.PI, 0, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.38, 0.42, 0.12, 8, pal.accent, [0, 0.04, 0]),
          // Oversized Bubble Helmet + dark reflective faceplate visor!
          ico(0.44, 0x9ee8ff, [0, 0.38, 0]),
          dodec(0.34, 0x162038, [0, 0.38, 0.12], undefined, [1.02, 0.86, 0.9]),
          box(0.16, 0.08, 0.06, 0xffffff, [0.16, 0.5, 0.42], [0, 0.2, -0.3]),
        ];
        addHatParts(head, hatId, 0.82);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.accent, pal.primary, pal.boots, 0.5, 0.21, 0.62, 1.34);
        weaponPivot.position.set(0.06, -0.44, 0.2);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.12, 0.1, 0.65, 7, pal.secondary, [0, 0.1, 0.24], [Math.PI * 0.5, 0, 0]),
          torus(0.22, 0.045, 5, 10, pal.accent, [0, 0.1, 0.62]),
        ]);
        addGlowOrb(weaponPivot, new THREE.IcosahedronGeometry(0.17, 0), [0, 0.1, 0.68]);
        break;
      }

      case 'TonyMcZoom': {
        // Neon Cyber-Skater riding a GLOWING NEON HOVERBOARD!
        hoverMode = 'hoverboard';
        const deckH = 0.42;
        boardPivot = new THREE.Group();
        boardPivot.position.set(0, 0.24, 0);
        bodyPivot.add(boardPivot);
        add(boardPivot, [
          box(0.76, 0.09, 1.62, pal.secondary, [0, 0.12, 0]),
          box(0.62, 0.1, 1.48, pal.primary, [0, 0.13, 0]),
          box(0.28, 0.11, 1.54, pal.accent, [0, 0.14, 0]),
          cone(0.38, 0.38, 4, pal.primary, [0, 0.14, 0.96], [Math.PI * 0.5, Math.PI * 0.25, 0]),
        ]);
        // Glowing plasma hover-thruster discs underneath hoverboard!
        addGlowOrb(boardPivot, new THREE.CylinderGeometry(0.24, 0.28, 0.08, 8), [0, 0.02, 0.48]);
        addGlowOrb(boardPivot, new THREE.CylinderGeometry(0.24, 0.28, 0.08, 8), [0, 0.02, -0.48]);

        add(bodyPivot, [
          box(0.68, 0.8, 0.44, pal.primary, [0, deckH + 1.02, 0]),
          box(0.24, 0.78, 0.46, pal.secondary, [0, deckH + 1.02, 0]),
          box(0.72, 0.12, 0.48, pal.accent, [0, deckH + 0.68, 0]),
        ]);
        headPivot.position.set(0, deckH + 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.24, 0]),
          // Spiky anime hair!
          cone(0.18, 0.42, 4, pal.primary, [0, 0.56, -0.06], [-0.4, 0, 0]),
          cone(0.14, 0.34, 4, pal.primary, [-0.22, 0.5, -0.08], [-0.3, 0, 0.45]),
          cone(0.14, 0.34, 4, pal.primary, [0.22, 0.5, -0.08], [-0.3, 0, -0.45]),
          // Glowing neon cyber-visor shades!
          box(0.48, 0.15, 0.12, pal.accent, [0, 0.28, 0.3]),
          box(0.42, 0.05, 0.13, 0xffffff, [0, 0.31, 0.31]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        leftArm.position.set(-0.44, deckH + 1.32, 0);
        rightArm.position.set(0.44, deckH + 1.32, 0);
        leftLeg.position.set(-0.18, deckH + 0.58, 0.2);
        rightLeg.position.set(0.18, deckH + 0.58, -0.2);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.1, 0.09, 0.48, 6, pal.primary, [0, -0.22, 0]), box(0.15, 0.15, 0.15, pal.accent, [0, -0.48, 0])]);
        add(rightArm, [cyl(0.1, 0.09, 0.48, 6, pal.primary, [0, -0.22, 0]), box(0.15, 0.15, 0.15, pal.accent, [0, -0.48, 0])]);
        add(leftLeg, [cyl(0.11, 0.1, 0.44, 6, pal.secondary, [0, -0.2, 0]), box(0.24, 0.14, 0.34, pal.boots, [0, -0.48, 0.04])]);
        add(rightLeg, [cyl(0.11, 0.1, 0.44, 6, pal.secondary, [0, -0.2, 0]), box(0.24, 0.14, 0.34, pal.boots, [0, -0.48, 0.04])]);
        weaponPivot.position.set(0.05, -0.42, 0.22);
        rightArm.add(weaponPivot);
        addGlowOrb(weaponPivot, new THREE.ConeGeometry(0.11, 0.68, 4), [0, 0.18, 0.2]);
        break;
      }

      case 'Vlad': {
        // High-collar crimson Vampire Lord w/ fangs, velvet cape & Blood Magic chalice staff!
        hoverMode = 'float';
        add(bodyPivot, [
          cyl(0.34, 0.44, 0.9, 7, pal.primary, [0, 1.04, 0]),
          box(0.32, 0.62, 0.1, pal.secondary, [0, 1.1, 0.26]),
          box(0.14, 0.22, 0.12, 0xffffff, [0, 1.38, 0.28]),
          octa(0.09, pal.accent, [0, 1.34, 0.34]),
          // Dramatic tall flared high vampire collar!
          box(0.76, 0.48, 0.1, pal.primary, [0, 1.62, -0.24], [-0.28, 0, 0]),
          box(0.64, 0.42, 0.08, pal.secondary, [0, 1.62, -0.2], [-0.28, 0, 0]),
          box(0.12, 0.44, 0.34, pal.primary, [-0.38, 1.6, -0.08], [0, 0.22, 0.24]),
          box(0.12, 0.44, 0.34, pal.primary, [0.38, 1.6, -0.08], [0, -0.22, -0.24]),
        ]);
        headPivot.position.set(0, 1.54, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.26, 0]),
          // Slick black widow's-peak vampire hair
          dodec(0.36, 0x120d17, [0, 0.36, -0.06], undefined, [1.05, 0.85, 1.0]),
          cone(0.12, 0.2, 3, 0x120d17, [0, 0.46, 0.28], [Math.PI, 0, 0]),
          // Glowing crimson vampire eyes & sharp white fangs!
          box(0.11, 0.08, 0.06, pal.accent, [-0.12, 0.28, 0.31]),
          box(0.11, 0.08, 0.06, pal.accent, [0.12, 0.28, 0.31]),
          cone(0.035, 0.11, 3, 0xffffff, [-0.07, 0.12, 0.32], [Math.PI, 0, 0]),
          cone(0.035, 0.11, 3, 0xffffff, [0.07, 0.12, 0.32], [Math.PI, 0, 0]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.28);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.92, 1.24, 0.07, pal.primary, [0, -0.6, -0.08], [0.16, 0, 0]),
          box(0.78, 1.14, 0.06, pal.secondary, [0, -0.58, -0.04], [0.16, 0, 0]),
        ]);
        attachStdLimbs(pal.primary, pal.skin, pal.primary, pal.boots, 0.46, 0.19, 0.62, 1.34);
        weaponPivot.position.set(0.05, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.045, 0.055, 1.75, 6, 0x2a1426, [0, 0.34, 0.14], [0.22, 0, 0]),
          torus(0.2, 0.045, 5, 8, pal.secondary, [0, 1.26, 0.34]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.2, 0), [0, 1.26, 0.34]);
        break;
      }
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
      leftWingPivot,
      rightWingPivot,
      auraRing,
      baseScale: pal.scale,
      hoverMode,
      isDiceHead,
      toonMaterials,
      outlineMeshes,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- 4 DEDICATED ARTICULATED BOSS RIGS ----

  public buildEntBossRig(tier = 1): ArticulatedBossRig {
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const isT2 = tier === 2;
    const isT3 = tier >= 3;
    const trunkCol = isT3 ? 0x3b2220 : isT2 ? 0x453559 : 0x734a2e;
    const trunkDark = isT3 ? 0x261414 : isT2 ? 0x302342 : 0x5c3822;
    const leafCol = isT3 ? 0xc9302c : isT2 ? 0x6f42c1 : 0x4ca63d;
    const leafBright = isT3 ? 0xff621f : isT2 ? 0xa855f7 : 0x76cf4a;
    const eyeHex = isT3 ? 0xff2644 : isT2 ? 0xd946ef : 0xffb703;

    const barkMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.bark_grain,
      mapStrength: 0.65,
      vertexColors: true,
      rimStrength: 0.36,
      rimColor: eyeHex,
    });
    const eyeMat = createMkToonMaterial({
      color: eyeHex,
      emissive: eyeHex,
      emissiveIntensity: 1.4,
      rimStrength: 0.5,
      rimColor: 0xfff4c2,
    });
    const outlineMat = createOutlineMaterial(0.085, 0x0b0d14);
    toonMaterials.push(barkMat, eyeMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, barkMat, outlineMat, outlines, geometriesToDispose);

    add(root, [
      cyl(1.15, 1.55, 3.6, 8, trunkCol, [0, 2.2, 0]),
      cyl(1.45, 1.25, 1.35, 8, trunkDark, [0, 3.85, 0.1]),
      cone(0.65, 1.8, 6, trunkDark, [-0.95, 0.72, 0.65], [0.45, 0, 0.42]),
      cone(0.65, 1.8, 6, trunkDark, [0.95, 0.72, 0.65], [0.45, 0, -0.42]),
      cone(0.62, 1.75, 6, trunkDark, [-0.85, 0.72, -0.75], [-0.45, 0, 0.38]),
      cone(0.62, 1.75, 6, trunkDark, [0.85, 0.72, -0.75], [-0.45, 0, -0.38]),
      box(1.65, 0.42, 0.62, trunkDark, [0, 3.55, 1.15]),
      box(1.05, 0.68, 0.45, 0x160e0d, [0, 2.55, 1.12]),
      dodec(0.75, leafCol, [-1.25, 4.1, 0.15]),
      dodec(0.75, leafCol, [1.25, 4.1, 0.15]),
    ]);

    const eyeGeo = new THREE.BoxGeometry(0.36, 0.24, 0.22);
    geometriesToDispose.push(eyeGeo);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.46, 3.22, 1.3);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.46, 3.22, 1.3);
    root.add(leftEye, rightEye);

    crownGroup.position.set(0, 4.45, 0);
    root.add(crownGroup);
    add(crownGroup, [
      dodec(1.85, leafCol, [0, 0.7, 0], undefined, [1.25, 0.82, 1.15]),
      dodec(1.35, leafBright, [-1.1, 0.55, 0.4]),
      dodec(1.35, leafBright, [1.1, 0.6, -0.3]),
      dodec(1.2, leafBright, [0, 1.45, 0.2]),
      cone(0.42, 0.32, 6, eyeHex, [-0.8, 1.45, 0.85]),
      cone(0.36, 0.28, 6, eyeHex, [0.95, 1.25, 0.7]),
    ]);

    leftArm.position.set(-1.55, 3.65, 0.15);
    rightArm.position.set(1.55, 3.65, 0.15);
    root.add(leftArm, rightArm);
    add(leftArm, [
      cyl(0.38, 0.48, 2.2, 6, trunkCol, [-0.4, -0.9, 0.3], [-0.35, 0, -0.28]),
      dodec(0.62, trunkDark, [-0.75, -1.95, 0.75]),
      cone(0.22, 0.85, 5, trunkCol, [-0.9, -2.35, 1.05], [0.55, 0, -0.2]),
      dodec(0.55, leafBright, [-0.55, -0.5, 0.2]),
    ]);
    add(rightArm, [
      cyl(0.38, 0.48, 2.2, 6, trunkCol, [0.4, -0.9, 0.3], [-0.35, 0, 0.28]),
      dodec(0.62, trunkDark, [0.75, -1.95, 0.75]),
      cone(0.22, 0.85, 5, trunkCol, [0.9, -2.35, 1.05], [0.55, 0, 0.2]),
      dodec(0.55, leafBright, [0.55, -0.5, 0.2]),
    ]);

    return {
      kind: 'Ent',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildPharaohBossRig(tier = 1): ArticulatedBossRig {
    // Golden-crowned Anubis Jackal Pharaoh Boss (Pharaoh1/2/3)!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const gemHex = tier >= 3 ? 0xff2e54 : tier === 2 ? 0x38f2ff : 0xffd23f;
    const trimHex = tier >= 3 ? 0xd92638 : tier === 2 ? 0x2563eb : 0x1d4ed8;
    const mat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.desert_sandstone,
      mapStrength: 0.4,
      vertexColors: true,
      rimStrength: 0.45,
      rimColor: 0xffe48f,
      gloss: 0.55,
    });
    const glowMat = createMkToonMaterial({
      color: gemHex,
      emissive: gemHex,
      emissiveIntensity: 1.35,
      rimStrength: 0.55,
    });
    const outlineMat = createOutlineMaterial(0.082, 0x0b0d14);
    toonMaterials.push(mat, glowMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, mat, outlineMat, outlines, geometriesToDispose);

    // Tall obsidian-and-gold jackal pharaoh body + broad gilded pectoral collar + kilt
    add(root, [
      cyl(0.88, 1.35, 2.2, 8, 0xf2e6c9, [0, 1.2, 0]),
      box(0.56, 1.9, 0.24, trimHex, [0, 1.15, 0.96]),
      box(0.32, 1.85, 0.28, 0xffd23f, [0, 1.15, 0.98]),
      cyl(1.18, 0.78, 1.85, 7, 0x1c1a29, [0, 3.05, 0]),
      cyl(1.38, 1.05, 0.48, 8, 0xffc83b, [0, 3.82, 0]), // broad golden pharaoh collar
      cyl(1.22, 1.1, 0.16, 8, trimHex, [0, 3.9, 0.04]),
      // Jackal head + elongated black canine snout + tall vertical Anubis ears!
      dodec(0.76, 0x191724, [0, 4.65, 0.1]),
      cone(0.34, 1.15, 5, 0x191724, [0, 4.5, 0.88], [Math.PI * 0.52, 0, 0]),
      cone(0.22, 1.25, 4, 0x191724, [-0.42, 5.65, -0.05], [0.05, 0, 0.12]),
      cone(0.22, 1.25, 4, 0x191724, [0.42, 5.65, -0.05], [0.05, 0, -0.12]),
      cone(0.12, 0.95, 4, 0xffc83b, [-0.42, 5.58, 0.04], [0.05, 0, 0.12]),
      cone(0.12, 0.95, 4, 0xffc83b, [0.42, 5.58, 0.04], [0.05, 0, -0.12]),
      // Striped Gold-and-Lapis Nemes Headdress flaps
      box(1.92, 1.12, 0.56, 0xffc83b, [0, 4.45, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.78, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.42, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.08, -0.18]),
    ]);

    const eyeGeo = new THREE.BoxGeometry(0.24, 0.14, 0.16);
    geometriesToDispose.push(eyeGeo);
    const lEye = new THREE.Mesh(eyeGeo, glowMat);
    lEye.position.set(-0.34, 4.76, 0.72);
    const rEye = new THREE.Mesh(eyeGeo, glowMat);
    rEye.position.set(0.34, 4.76, 0.72);
    root.add(lEye, rEye);

    // Floating Golden Sun-Disc Crown!
    crownGroup.position.set(0, 5.95, 0.05);
    root.add(crownGroup);
    add(crownGroup, [
      torus(0.74, 0.12, 6, 12, 0xffd23f, [0, 0.2, 0]),
      octa(0.42, gemHex, [0, 0.2, 0]),
    ]);

    leftArm.position.set(-1.35, 3.75, 0.1);
    rightArm.position.set(1.35, 3.75, 0.1);
    root.add(leftArm, rightArm);
    add(leftArm, [
      dodec(0.45, 0xffc83b, [0, 0, 0]),
      cyl(0.26, 0.22, 1.75, 6, 0x1c1a29, [-0.12, -0.9, 0.22], [-0.35, 0, -0.1]),
      cyl(0.28, 0.28, 0.26, 7, 0xffc83b, [-0.15, -1.52, 0.45], [-0.35, 0, 0]),
    ]);
    add(rightArm, [
      dodec(0.45, 0xffc83b, [0, 0, 0]),
      cyl(0.26, 0.22, 1.75, 6, 0x1c1a29, [0.12, -0.9, 0.22], [-0.35, 0, 0.1]),
      // Towering Golden Ankh-Scepter Staff!
      cyl(0.11, 0.12, 4.8, 6, 0xffc83b, [0.22, 0.2, 0.82], [0.24, 0, 0]),
      torus(0.52, 0.1, 6, 10, 0xffd23f, [0.22, 2.75, 1.42]),
      box(0.88, 0.18, 0.18, 0xffd23f, [0.22, 2.05, 1.25]),
    ]);

    return {
      kind: 'Pharaoh',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildBigBobRig(): ArticulatedBossRig {
    // BIG BOB (GhostKing) — Colossal Crowned Spectral King of the Graveyard!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const ghostMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.spectral_ectoplasm,
      mapStrength: 0.5,
      vertexColors: true,
      emissive: 0x3b186e,
      emissiveIntensity: 0.42,
      rimStrength: 0.65,
      rimColor: 0x80faff,
    });
    const eyeMat = createMkToonMaterial({
      color: 0xff2ec4,
      emissive: 0xff2ec4,
      emissiveIntensity: 1.6,
      rimStrength: 0.6,
    });
    const outlineMat = createOutlineMaterial(0.095, 0x090714);
    toonMaterials.push(ghostMat, eyeMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, ghostMat, outlineMat, outlines, geometriesToDispose);

    // Colossal hovering tattered royal spectral body & giant horned skull head
    add(root, [
      cone(2.25, 5.2, 8, 0x2a1d4a, [0, 3.8, 0]),
      cone(1.65, 3.6, 8, 0x4b2f85, [0, 4.4, 0.25]),
      // Floating jagged ectoplasm robe tails
      cone(0.7, 2.2, 5, 0x5c3aa6, [-1.45, 1.35, 0.6], [Math.PI, 0, 0.16]),
      cone(0.7, 2.4, 5, 0x5c3aa6, [1.45, 1.35, 0.6], [Math.PI, 0, -0.16]),
      cone(0.75, 2.6, 5, 0x3f2475, [0, 1.2, -1.4], [Math.PI, 0, 0]),
      cone(0.65, 2.0, 5, 0x62f5ff, [0, 1.45, 1.4], [Math.PI, 0, 0]),
      // Royal spectral shoulder mantle
      cyl(1.85, 2.15, 0.68, 8, 0x6f32a8, [0, 5.75, 0]),
      // Colossal ghostly skull visage!
      dodec(1.58, 0xd8f3ff, [0, 7.1, 0.2], undefined, [1.08, 1.04, 1.0]),
      box(1.45, 0.72, 1.05, 0xc9e8f5, [0, 5.85, 0.72]),
      box(1.15, 0.24, 0.3, 0x0b0817, [0, 5.8, 1.24]), // gaping spectral maw
      box(0.55, 0.55, 0.36, 0x0b0817, [-0.54, 7.15, 1.44]),
      box(0.55, 0.55, 0.36, 0x0b0817, [0.54, 7.15, 1.44]),
    ]);

    const eyeGeo = new THREE.OctahedronGeometry(0.28, 0);
    geometriesToDispose.push(eyeGeo);
    const lEye = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.position.set(-0.54, 7.18, 1.62);
    const rEye = new THREE.Mesh(eyeGeo, eyeMat);
    rEye.position.set(0.54, 7.18, 1.62);
    root.add(lEye, rEye);

    // Gigantic floating Golden Royal Crown with glowing amethyst jewels!
    crownGroup.position.set(0, 8.85, 0.15);
    root.add(crownGroup);
    add(crownGroup, [
      cyl(1.55, 1.25, 0.95, 8, 0xffd23f, [0, 0.45, 0]),
      cone(0.32, 0.85, 4, 0xffe45e, [0, 1.25, 1.25]),
      cone(0.32, 0.85, 4, 0xffe45e, [-1.1, 1.2, 0.6]),
      cone(0.32, 0.85, 4, 0xffe45e, [1.1, 1.2, 0.6]),
      cone(0.32, 0.85, 4, 0xffe45e, [-0.9, 1.2, -0.9]),
      cone(0.32, 0.85, 4, 0xffe45e, [0.9, 1.2, -0.9]),
      octa(0.38, 0xff2ec4, [0, 0.5, 1.45]),
      torus(2.2, 0.12, 5, 14, 0x70f5ff, [0, 0.2, 0], [Math.PI * 0.5, 0, 0]),
    ]);

    leftArm.position.set(-2.15, 5.45, 0.25);
    rightArm.position.set(2.15, 5.45, 0.25);
    root.add(leftArm, rightArm);
    add(leftArm, [
      cone(0.75, 2.8, 6, 0x3b246e, [-0.5, -1.0, 0.55], [0.7, 0, 0.3]),
      dodec(0.68, 0xd8f3ff, [-0.95, -2.05, 1.45]),
      cone(0.18, 0.95, 4, 0x70f5ff, [-1.15, -2.35, 1.95], [1.1, 0, 0.15]),
      cone(0.18, 0.95, 4, 0x70f5ff, [-0.75, -2.35, 1.95], [1.1, 0, -0.15]),
    ]);
    add(rightArm, [
      cone(0.75, 2.8, 6, 0x3b246e, [0.5, -1.0, 0.55], [0.7, 0, -0.3]),
      dodec(0.68, 0xd8f3ff, [0.95, -2.05, 1.45]),
      cone(0.18, 0.95, 4, 0x70f5ff, [1.15, -2.35, 1.95], [1.1, 0, -0.15]),
      cone(0.18, 0.95, 4, 0x70f5ff, [0.75, -2.35, 1.95], [1.1, 0, 0.15]),
    ]);

    return {
      kind: 'BigBob',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildFinalBossRig(): ArticulatedBossRig {
    // FINAL BOSS — Imposing Dark-Gold Obsidian Citadel Overlord + Toggleable Pylon Shield Dome!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const armorMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.citadel_obsidian,
      mapStrength: 0.55,
      vertexColors: true,
      emissive: 0x360c28,
      emissiveIntensity: 0.35,
      rimStrength: 0.58,
      rimColor: 0xffd24c,
      gloss: 0.7,
    });
    const coreMat = createMkToonMaterial({
      color: 0xff3b5c,
      emissive: 0xff2644,
      emissiveIntensity: 1.6,
      rimStrength: 0.7,
      rimColor: 0xffe45e,
    });
    const shieldMat = createMkToonMaterial({
      color: 0xff2ec4,
      emissive: 0xff2644,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outlineMat = createOutlineMaterial(0.09, 0x08060e);
    toonMaterials.push(armorMat, coreMat, shieldMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, armorMat, outlineMat, outlines, geometriesToDispose);

    // Towering Obsidian-Gold Citadel Plate Torso, Cathedral Pauldrons & Horned Sovereign Helm
    add(root, [
      // Armored pillar legs & armored tassets
      box(0.88, 1.9, 0.92, 0x1c1429, [-0.82, 0.95, 0]),
      box(0.88, 1.9, 0.92, 0x1c1429, [0.82, 0.95, 0]),
      box(0.96, 0.35, 1.05, 0xffc83b, [-0.82, 0.25, 0.08]),
      box(0.96, 0.35, 1.05, 0xffc83b, [0.82, 0.25, 0.08]),
      // Imperial crimson-gold waist tabard
      box(2.15, 0.75, 1.45, 0x261a38, [0, 2.05, 0]),
      box(0.86, 1.55, 0.18, 0xb81d38, [0, 1.32, 0.78]),
      box(0.92, 0.2, 0.22, 0xffc83b, [0, 0.6, 0.78]),
      // Massive Obsidian Chestplate with gold cathedral ribs
      box(2.45, 2.25, 1.58, 0x20172e, [0, 3.42, 0]),
      box(2.58, 0.24, 1.66, 0xffc83b, [0, 4.32, 0]),
      box(2.52, 0.2, 1.62, 0xffc83b, [0, 2.48, 0]),
      // Towering spiked cathedral pauldrons!
      dodec(0.96, 0x2a1d40, [-1.72, 4.35, 0]),
      cone(0.32, 1.25, 4, 0xffc83b, [-2.05, 5.25, 0], [0, 0, 0.42]),
      dodec(0.96, 0x2a1d40, [1.72, 4.35, 0]),
      cone(0.32, 1.25, 4, 0xffc83b, [2.05, 5.25, 0], [0, 0, -0.42]),
      // Flowing Sovereign Cape
      box(2.35, 3.45, 0.16, 0x8f152d, [0, 2.75, -0.98], [0.16, 0, 0]),
      box(2.44, 0.26, 0.18, 0xffc83b, [0, 1.05, -1.26], [0.16, 0, 0]),
      // Horned Obsidian Sovereign Helm
      cyl(0.68, 0.76, 1.25, 8, 0x1b1326, [0, 5.25, 0.08]),
      cyl(0.74, 0.74, 0.18, 8, 0xffc83b, [0, 5.75, 0.08]),
      cone(0.24, 1.15, 5, 0xffc83b, [-0.66, 6.0, 0.14], [0.22, 0, 0.65]),
      cone(0.24, 1.15, 5, 0xffc83b, [0.66, 6.0, 0.14], [0.22, 0, -0.65]),
    ]);

    // Glowing Crimson Chest Furnace Core & Visor Eyes
    const coreGeo = new THREE.OctahedronGeometry(0.58, 0);
    const eyeGeo = new THREE.BoxGeometry(0.92, 0.2, 0.18);
    geometriesToDispose.push(coreGeo, eyeGeo);
    const chestCore = new THREE.Mesh(coreGeo, coreMat);
    chestCore.position.set(0, 3.48, 0.88);
    const visorEye = new THREE.Mesh(eyeGeo, coreMat);
    visorEye.position.set(0, 5.26, 0.78);
    root.add(chestCore, visorEye);

    // Floating Rotating Gilded Sovereign Halo Ring behind the head!
    crownGroup.position.set(0, 5.85, -0.32);
    root.add(crownGroup);
    add(crownGroup, [
      torus(1.45, 0.14, 6, 16, 0xffc83b, [0, 0, 0]),
      octa(0.32, 0xff2644, [0, 1.45, 0]),
      octa(0.28, 0xff2644, [-1.45, 0, 0]),
      octa(0.28, 0xff2644, [1.45, 0, 0]),
      octa(0.28, 0xff2644, [0, -1.45, 0]),
    ]);

    leftArm.position.set(-1.95, 4.05, 0.15);
    rightArm.position.set(1.95, 4.05, 0.15);
    root.add(leftArm, rightArm);
    add(leftArm, [
      box(0.68, 1.95, 0.68, 0x261b38, [-0.15, -0.95, 0.15]),
      dodec(0.55, 0xffc83b, [-0.2, -2.05, 0.28]),
      // Pylon Siphon Orb held in left gauntlet
      torus(0.54, 0.08, 5, 10, 0xffc83b, [-0.2, -2.25, 0.85]),
      octa(0.36, 0xff2ec4, [-0.2, -2.25, 0.85]),
    ]);
    add(rightArm, [
      box(0.68, 1.95, 0.68, 0x261b38, [0.15, -0.95, 0.15]),
      dodec(0.55, 0xffc83b, [0.2, -2.05, 0.28]),
      // Colossal Citadel Obsidian-Gold Greatsword!
      box(1.25, 0.28, 0.34, 0xffc83b, [0.25, -1.7, 0.95], [0.55, 0, 0]),
      box(0.54, 4.4, 0.18, 0x1a1226, [0.25, 0.35, 2.2], [0.55, 0, 0]),
      box(0.2, 4.1, 0.24, 0xff3b5c, [0.25, 0.35, 2.2], [0.55, 0, 0]),
      cone(0.38, 0.95, 4, 0xffc83b, [0.25, 2.55, 3.55], [0.55, Math.PI * 0.25, 0]),
    ]);

    // Toggleable Invulnerable Pylon Energy Shield Dome!
    const shieldGeo = new THREE.IcosahedronGeometry(3.85, 1);
    geometriesToDispose.push(shieldGeo);
    const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
    shieldDome.position.set(0, 3.2, 0);
    shieldDome.visible = false;
    root.add(shieldDome);

    return {
      kind: 'FinalBoss',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- Enemy Archetype Low-Poly Geometry Pairs (ALL 52 ENEMIES COVERED!) ----

  public normalizeEnemyArchetype(enemyId: string): string {
    const cached = this.enemyArchetypeNameCache.get(enemyId);
    if (cached !== undefined) return cached;
    const resolved = this.resolveEnemyArchetype(enemyId);
    this.enemyArchetypeNameCache.set(enemyId, resolved);
    return resolved;
  }

  private resolveEnemyArchetype(enemyId: string): string {
    const id = enemyId.toLowerCase();
    if (id === 'finalboss' || id === 'final_boss' || id === 'b_finalboss') return 'FinalBoss';
    if (id === 'ghostking' || id === 'ghostkingdata' || id.includes('bigbob') || id.includes('big_bob')) return 'GhostKing';
    if (id.includes('ghostham')) return 'Ghostham';
    if (id.includes('calciumdad') || id.includes('skeletonking')) return 'CalciumDad';
    if (id.includes('pharaoh3') || id.includes('juge')) return 'Pharaoh3';
    if (id.includes('pharaoh2') || id.includes('anubruh')) return 'Pharaoh2';
    if (id.includes('pharaoh') || id.includes('anubis')) return 'Pharaoh1';
    if (id === 'ent3' || id === 'entstage3' || id.includes('vader')) return 'EntStage3';
    if (id === 'ent2' || id === 'entstage2' || id.includes('chadbark')) return 'EntStage2';
    if (id === 'ent1' || id === 'entstage1' || id.includes('ent') || id.includes('bark')) return 'EntStage1';
    if (id.includes('golemsand') || id.includes('sandgolem') || id.includes('desert_golem')) return 'MinibossGolemSand';
    if (id.includes('golem')) return 'MinibossGolem';
    if (id.includes('minibossscorpion') || id.includes('scorpionussy')) return 'MinibossScorpion';
    if (id.includes('scorpion')) return 'Scorpion';
    if (id.includes('minibosspig') || id.includes('pig') || id.includes('boar') || id.includes('chunkham')) return 'MinibossPig';
    if (id.includes('mummytank') || id.includes('mummyancient')) return 'MummyTank';
    if (id.includes('mummy')) return 'Mummy';
    if (id.includes('cactus') || id === 'bush') return 'CactusShooter';
    if (id.includes('tumblebone')) return 'Tumblebone';
    if (id.includes('wisp')) return 'Wisp';
    if (id.includes('boomer') || id.includes('spider')) return 'BoomerSpider';
    if (id.includes('bee')) return 'Bee';
    if (id.includes('frog')) return 'Frog';
    if (id.includes('zombie')) return 'Zombie';
    if (id.includes('ghoul')) return 'Ghoul';
    if (id === 'head') return 'Head';
    if (id.includes('goblintank')) return 'GoblinTank';
    if (id.includes('goblinstrong') || id.includes('strong') || id.includes('brute') || id.includes('orc') || id === 'bandit') return 'GoblinStrong';
    if (id.includes('goblin')) return 'Goblin';
    if (id.includes('goldenskeleton') || id.includes('skeletongold')) return 'GoldenSkeleton';
    if (id.includes('xpskeleton') || id.includes('skeletonxp')) return 'XpSkeleton';
    if (id.includes('armoredskeleton') || id.includes('skeletonarmored')) return 'ArmoredSkeleton';
    if (id.includes('skeletondusty')) return 'SkeletonDusty';
    if (id.includes('skeleton') || id.includes('bone')) return 'Skeleton';
    if (id.includes('slime') || id.includes('blob')) return 'Slime';
    if (id === 'ghostinvincible' || id.includes('steve') || id.includes('invincible')) return 'GhostInvincible';
    if (id.includes('ghostgrave')) return 'GhostGrave';
    if (id.includes('greaterghost') || id.includes('ghostgreater')) return 'GreaterGhost';
    if (id === 'ghostred' || id.includes('redghost')) return 'GhostRed';
    if (id === 'ghostpurple' || id.includes('purple') || id.includes('wraith')) return 'GhostPurple';
    if (id.includes('ghost') || id.includes('specter')) return 'Ghost';
    return 'Goblin';
  }

  public getEnemyGeometryPair(archetypeKey: string): LowPolyGeometryPair {
    const key = this.normalizeEnemyArchetype(archetypeKey);
    const cached = this.enemyCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'Goblin':
        pair = makePair([
          cyl(0.28, 0.34, 0.65, 6, 0x45b849, [0, 0.72, 0.05], [0.22, 0, 0]),
          cyl(0.34, 0.36, 0.24, 6, 0x73492b, [0, 0.45, 0]),
          cyl(0.1, 0.09, 0.42, 5, 0x389c3d, [-0.16, 0.22, 0]),
          cyl(0.1, 0.09, 0.42, 5, 0x389c3d, [0.16, 0.22, 0]),
          dodec(0.32, 0x54cf57, [0, 1.18, 0.14]),
          cone(0.1, 0.26, 4, 0x62db65, [0, 1.15, 0.46], [Math.PI * 0.5, 0, 0]),
          cone(0.11, 0.48, 4, 0x45b849, [-0.46, 1.24, 0.1], [0, 0, 1.22]),
          cone(0.11, 0.48, 4, 0x45b849, [0.46, 1.24, 0.1], [0, 0, -1.22]),
          box(0.1, 0.08, 0.06, 0xffe03b, [-0.12, 1.24, 0.4]),
          box(0.1, 0.08, 0.06, 0xffe03b, [0.12, 1.24, 0.4]),
          cyl(0.08, 0.07, 0.42, 5, 0x45b849, [0.38, 0.92, 0.18], [-0.8, 0, -0.3]),
          cyl(0.14, 0.06, 0.78, 6, 0x8a5632, [0.48, 1.26, 0.44], [0.45, 0, -0.15]),
        ], 'character_palette', 0.052);
        break;

      case 'GoblinStrong':
      case 'GoblinTank': {
        const isTank = key === 'GoblinTank';
        const parts: ColoredPartSpec[] = [
          cyl(0.46, 0.42, 0.96, 6, 0x2c8a43, [0, 1.0, 0]),
          box(0.92, 0.46, 0.56, isTank ? 0x364152 : 0x4d596b, [0, 1.18, 0]),
          dodec(0.28, 0x627085, [-0.56, 1.38, 0]),
          dodec(0.28, 0x627085, [0.56, 1.38, 0]),
          box(0.24, 0.54, 0.26, 0x247337, [-0.22, 0.28, 0]),
          box(0.24, 0.54, 0.26, 0x247337, [0.22, 0.28, 0]),
          dodec(0.36, 0x39a350, [0, 1.66, 0.1]),
          cyl(0.38, 0.4, 0.28, 7, 0x4d596b, [0, 1.84, 0.08]),
          cone(0.1, 0.45, 5, 0xf2ebd9, [-0.36, 2.02, 0.12], [0.2, 0, 0.55]),
          cone(0.1, 0.45, 5, 0xf2ebd9, [0.36, 2.02, 0.12], [0.2, 0, -0.55]),
          box(0.12, 0.08, 0.06, 0xff4d4d, [-0.14, 1.68, 0.42]),
          box(0.12, 0.08, 0.06, 0xff4d4d, [0.14, 1.68, 0.42]),
          cyl(0.06, 0.06, 1.35, 6, 0x6e4326, [0.64, 1.25, 0.42], [0.5, 0, -0.2]),
          box(0.42, 0.36, 0.12, 0xc2d0e0, [0.74, 1.72, 0.72], [0.5, 0, -0.2]),
        ];
        if (isTank) {
          parts.push(box(0.86, 1.15, 0.16, 0x4b5563, [-0.62, 1.05, 0.48], [0, 0.35, 0]), box(0.24, 0.24, 0.2, 0xffc83b, [-0.66, 1.05, 0.56]));
        }
        pair = makePair(parts, 'metal_armor', 0.058, { gloss: 0.35 });
        break;
      }

      case 'Skeleton':
      case 'GoldenSkeleton':
      case 'XpSkeleton':
      case 'ArmoredSkeleton':
      case 'SkeletonDusty': {
        const boneCol =
          key === 'GoldenSkeleton' ? 0xffd23f : key === 'XpSkeleton' ? 0x6ef7ff : key === 'SkeletonDusty' ? 0xd9c298 : 0xf2ebd9;
        const sashCol =
          key === 'GoldenSkeleton' ? 0xd97706 : key === 'XpSkeleton' ? 0x2563eb : key === 'SkeletonDusty' ? 0x9c5a2d : 0x5c377d;
        const parts: ColoredPartSpec[] = [
          cyl(0.07, 0.08, 0.72, 6, boneCol, [0, 1.0, 0]),
          box(0.5, 0.09, 0.3, boneCol, [0, 1.24, 0]),
          box(0.44, 0.08, 0.26, boneCol, [0, 1.08, 0]),
          box(0.36, 0.08, 0.22, boneCol, [0, 0.92, 0]),
          box(0.42, 0.28, 0.3, sashCol, [0, 0.66, 0]),
          cyl(0.065, 0.06, 0.56, 5, boneCol, [-0.16, 0.28, 0]),
          cyl(0.065, 0.06, 0.56, 5, boneCol, [0.16, 0.28, 0]),
          dodec(0.32, boneCol, [0, 1.62, 0.04]),
          box(0.26, 0.14, 0.2, boneCol, [0, 1.4, 0.14]),
          box(0.11, 0.11, 0.08, 0x141724, [-0.11, 1.62, 0.31]),
          box(0.11, 0.11, 0.08, 0x141724, [0.11, 1.62, 0.31]),
          cyl(0.055, 0.055, 0.48, 5, boneCol, [0.38, 1.06, 0.16], [-0.7, 0, -0.2]),
          box(0.14, 0.92, 0.08, 0xb8c5d6, [0.46, 1.44, 0.5], [0.55, 0, 0]),
        ];
        if (key === 'ArmoredSkeleton') {
          parts.push(
            box(0.62, 0.52, 0.38, 0x5c6b7a, [0, 1.1, 0]),
            cyl(0.36, 0.38, 0.26, 7, 0x64748b, [0, 1.78, 0.04]),
          );
        }
        pair = makePair(parts, 'bone_ivory', 0.048, {
          emissiveHex: key === 'GoldenSkeleton' ? 0xb45309 : key === 'XpSkeleton' ? 0x0ea5e9 : 0x000000,
          emissiveIntensity: key === 'GoldenSkeleton' || key === 'XpSkeleton' ? 0.35 : 0,
        });
        break;
      }

      case 'Slime':
        pair = makePair([
          dodec(0.68, 0x3ce8c6, [0, 0.52, 0], undefined, [1.18, 0.85, 1.15]),
          dodec(0.28, 0x2ad1b0, [-0.52, 0.2, 0.3]),
          dodec(0.26, 0x2ad1b0, [0.52, 0.18, -0.22]),
          dodec(0.24, 0x2ad1b0, [0.1, 0.18, -0.58]),
          box(0.14, 0.16, 0.1, 0x121824, [-0.22, 0.58, 0.68]),
          box(0.14, 0.16, 0.1, 0x121824, [0.22, 0.58, 0.68]),
          box(0.06, 0.06, 0.11, 0xffffff, [-0.19, 0.62, 0.69]),
          box(0.06, 0.06, 0.11, 0xffffff, [0.25, 0.62, 0.69]),
          cyl(0.24, 0.18, 0.2, 6, 0xffd23f, [0, 1.12, 0]),
          octa(0.07, 0xff3b5c, [0, 1.16, 0.2]),
        ], 'slime_gel', 0.052, { gloss: 0.72 });
        break;

      case 'Ghoul':
      case 'Zombie': {
        const isZ = key === 'Zombie';
        const skin = isZ ? 0x6ba854 : 0x7a9c86;
        const coat = isZ ? 0x3f475c : 0x2e3342;
        pair = makePair([
          cyl(0.3, 0.36, 0.78, 6, coat, [0, 0.88, 0.06], [0.25, 0, 0]),
          cyl(0.11, 0.1, 0.5, 5, 0x2d3445, [-0.16, 0.26, 0]),
          cyl(0.11, 0.1, 0.5, 5, 0x2d3445, [0.16, 0.26, 0]),
          dodec(0.34, skin, [0, 1.44, 0.18]),
          box(0.11, 0.08, 0.06, isZ ? 0xff4d5e : 0xb8ff3b, [-0.12, 1.48, 0.48]),
          box(0.11, 0.08, 0.06, isZ ? 0xff4d5e : 0xb8ff3b, [0.12, 1.48, 0.48]),
          // Outstretched shambling arms!
          cyl(0.09, 0.08, 0.68, 5, skin, [-0.36, 1.18, 0.42], [1.28, 0, 0]),
          cyl(0.09, 0.08, 0.68, 5, skin, [0.36, 1.18, 0.42], [1.28, 0, 0]),
        ], 'character_palette', 0.05);
        break;
      }

      case 'BoomerSpider':
        // 6-legged explosive spider with glowing volatile amber-crimson abdomen!
        pair = makePair([
          dodec(0.42, 0x262030, [0, 0.58, 0.38]),
          ico(0.66, 0xff4d2e, [0, 0.84, -0.44], undefined, [1.05, 0.92, 1.2]),
          octa(0.24, 0xffe45e, [0, 1.18, -0.48]),
          box(0.12, 0.1, 0.08, 0xffe45e, [-0.16, 0.66, 0.74]),
          box(0.12, 0.1, 0.08, 0xffe45e, [0.16, 0.66, 0.74]),
          // 6 jointed spider legs
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [-0.62, 0.42, 0.35], [0.2, 0, 0.85]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [0.62, 0.42, 0.35], [0.2, 0, -0.85]),
          cyl(0.07, 0.05, 0.98, 5, 0x1e1926, [-0.72, 0.42, -0.05], [0, 0, 0.9]),
          cyl(0.07, 0.05, 0.98, 5, 0x1e1926, [0.72, 0.42, -0.05], [0, 0, -0.9]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [-0.64, 0.42, -0.48], [-0.25, 0, 0.85]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [0.64, 0.42, -0.48], [-0.25, 0, -0.85]),
        ], 'character_palette', 0.052, { emissiveHex: 0xcc2818, emissiveIntensity: 0.3 });
        break;

      case 'Bee':
        pair = makePair([
          dodec(0.45, 0xffd23f, [0, 1.0, 0.1], undefined, [0.9, 0.88, 1.35]),
          cyl(0.44, 0.44, 0.18, 7, 0x1a1c26, [0, 1.0, 0.2], [Math.PI * 0.5, 0, 0]),
          cyl(0.42, 0.42, 0.18, 7, 0x1a1c26, [0, 1.0, -0.18], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.42, 5, 0x1a1c26, [0, 0.96, -0.78], [-Math.PI * 0.5, 0, 0]),
          box(0.58, 0.06, 0.34, 0xe0f7ff, [-0.46, 1.38, 0.04], [0, 0.15, 0.42]),
          box(0.58, 0.06, 0.34, 0xe0f7ff, [0.46, 1.38, 0.04], [0, -0.15, -0.42]),
          box(0.12, 0.12, 0.08, 0x12151f, [-0.16, 1.08, 0.64]),
          box(0.12, 0.12, 0.08, 0x12151f, [0.16, 1.08, 0.64]),
        ], 'character_palette', 0.046);
        break;

      case 'Frog':
        pair = makePair([
          dodec(0.54, 0x62d952, [0, 0.46, 0], undefined, [1.15, 0.82, 1.1]),
          dodec(0.22, 0xfff5c2, [-0.26, 0.84, 0.24]),
          dodec(0.22, 0xfff5c2, [0.26, 0.84, 0.24]),
          box(0.1, 0.1, 0.08, 0x121622, [-0.26, 0.86, 0.42]),
          box(0.1, 0.1, 0.08, 0x121622, [0.26, 0.86, 0.42]),
          box(0.26, 0.14, 0.42, 0x4cb83e, [-0.48, 0.14, -0.14]),
          box(0.26, 0.14, 0.42, 0x4cb83e, [0.48, 0.14, -0.14]),
        ], 'character_palette', 0.048);
        break;

      case 'Mummy':
      case 'MummyTank': {
        const isTank = key === 'MummyTank';
        const sx = isTank ? 1.35 : 1.0;
        const parts: ColoredPartSpec[] = [
          cyl(0.36 * sx, 0.4 * sx, 0.96, 7, 0xdecda8, [0, 1.02, 0]),
          cyl(0.42 * sx, 0.42 * sx, 0.16, 7, 0xc7a354, [0, 1.38, 0]), // bronze scarab collar
          cyl(0.13 * sx, 0.11 * sx, 0.56, 6, 0xd6c39c, [-0.18 * sx, 0.28, 0]),
          cyl(0.13 * sx, 0.11 * sx, 0.56, 6, 0xd6c39c, [0.18 * sx, 0.28, 0]),
          dodec(0.36, 0xe8d9b7, [0, 1.66, 0.04]),
          box(0.32, 0.12, 0.1, 0x1c1412, [0, 1.68, 0.34]),
          box(0.1, 0.08, 0.08, 0xffb703, [-0.11, 1.68, 0.38]),
          box(0.1, 0.08, 0.08, 0xffb703, [0.11, 1.68, 0.38]),
          // Outstretched wrapped mummy arms + trailing linen strips!
          cyl(0.1 * sx, 0.09 * sx, 0.72, 6, 0xdecda8, [-0.42 * sx, 1.24, 0.42], [1.35, 0, 0]),
          cyl(0.1 * sx, 0.09 * sx, 0.72, 6, 0xdecda8, [0.42 * sx, 1.24, 0.42], [1.35, 0, 0]),
          box(0.08, 0.46, 0.04, 0xf2e6c9, [-0.42 * sx, 0.96, 0.64]),
          box(0.08, 0.42, 0.04, 0xf2e6c9, [0.42 * sx, 0.98, 0.6]),
        ];
        if (isTank) {
          parts.push(box(1.12, 0.74, 0.66, 0xd4a437, [0, 1.12, 0]), box(0.4, 0.4, 0.16, 0x38f2ff, [0, 1.16, 0.36]));
        }
        pair = makePair(parts, 'mummy_wraps', isTank ? 0.062 : 0.05);
        break;
      }

      case 'Scorpion':
      case 'MinibossScorpion': {
        const isMb = key === 'MinibossScorpion';
        const shell = isMb ? 0x7a1e2e : 0xa64b2a;
        const accent = isMb ? 0xffc83b : 0xd97a38;
        const venom = 0x76ff3b;
        const parts: ColoredPartSpec[] = [
          // Segmented armored arachnid thorax
          dodec(0.76, shell, [0, 0.56, 0], undefined, [1.18, 0.62, 1.48]),
          box(1.1, 0.24, 0.92, accent, [0, 0.78, -0.05]),
          // Twin snapping scorpion pincers extending forward!
          box(0.28, 0.22, 0.78, shell, [-0.72, 0.56, 0.88], [0, -0.35, 0]),
          cone(0.22, 0.48, 5, accent, [-0.88, 0.58, 1.38], [Math.PI * 0.5, 0.25, 0]),
          box(0.28, 0.22, 0.78, shell, [0.72, 0.56, 0.88], [0, 0.35, 0]),
          cone(0.22, 0.48, 5, accent, [0.88, 0.58, 1.38], [Math.PI * 0.5, -0.25, 0]),
          // Towering curved segmented overhead tail + glowing venom stinger!
          box(0.34, 0.56, 0.34, shell, [0, 1.02, -0.88], [-0.45, 0, 0]),
          box(0.28, 0.64, 0.28, accent, [0, 1.56, -0.96], [0.22, 0, 0]),
          box(0.24, 0.58, 0.24, shell, [0, 2.02, -0.52], [1.1, 0, 0]),
          cone(0.18, 0.62, 5, venom, [0, 2.02, 0.08], [Math.PI * 0.62, 0, 0]),
          // Eyes
          box(0.12, 0.1, 0.08, venom, [-0.22, 0.74, 0.94]),
          box(0.12, 0.1, 0.08, venom, [0.22, 0.74, 0.94]),
          // 6 jointed legs
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.92, 0.32, 0.38], [0, 0, 0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.92, 0.32, 0.38], [0, 0, -0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.98, 0.32, -0.05], [0, 0, 0.95]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.98, 0.32, -0.05], [0, 0, -0.95]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.9, 0.32, -0.48], [0, 0, 0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.9, 0.32, -0.48], [0, 0, -0.9]),
        ];
        if (isMb) {
          parts.push(cyl(0.45, 0.35, 0.3, 6, 0xffd23f, [0, 1.05, 0.3]));
        }
        pair = makePair(parts, 'character_palette', isMb ? 0.072 : 0.054, {
          emissiveHex: isMb ? 0x2b6e16 : 0x164a0a,
          emissiveIntensity: 0.25,
          gloss: 0.45,
        });
        break;
      }

      case 'CactusShooter':
        pair = makePair([
          cyl(0.4, 0.46, 1.9, 7, 0x4ca642, [0, 0.95, 0]),
          cyl(0.2, 0.22, 0.78, 6, 0x45993b, [-0.56, 1.15, 0], [0, 0, 0.7]),
          cyl(0.2, 0.22, 0.72, 6, 0x45993b, [0.56, 0.95, 0], [0, 0, -0.7]),
          box(0.14, 0.14, 0.08, 0x141724, [-0.16, 1.32, 0.42]),
          box(0.14, 0.14, 0.08, 0x141724, [0.16, 1.32, 0.42]),
          octa(0.28, 0xff4d88, [0, 2.02, 0]), // cactus blossom cannon!
        ], 'desert_cactus', 0.054);
        break;

      case 'Wisp':
        pair = makePair([
          octa(0.48, 0xffe45e, [0, 1.05, 0], undefined, [1.0, 1.35, 1.0]),
          torus(0.68, 0.07, 5, 10, 0xff8b1f, [0, 1.05, 0], [0.6, 0.4, 0]),
          octa(0.16, 0xffffff, [-0.56, 1.25, 0.3]),
          octa(0.16, 0xffffff, [0.56, 0.85, -0.3]),
        ], 'character_palette', 0.044, { emissiveHex: 0xff8b1f, emissiveIntensity: 0.75 });
        break;

      case 'Tumblebone':
        pair = makePair([
          ico(0.62, 0xd6c39c, [0, 0.65, 0]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [0.55, 0.8, 0.2], [0, 0, -1.2]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [-0.55, 0.75, -0.2], [0, 0, 1.2]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [0, 1.18, 0.2]),
          box(0.14, 0.14, 0.08, 0x141724, [-0.14, 0.72, 0.56]),
          box(0.14, 0.14, 0.08, 0x141724, [0.14, 0.72, 0.56]),
        ], 'bone_ivory', 0.048);
        break;

      case 'Head':
        // Floating cackling graveyard skull-head!
        pair = makePair([
          dodec(0.56, 0xe8e2d5, [0, 1.05, 0]),
          box(0.48, 0.26, 0.36, 0xdcd4c4, [0, 0.62, 0.18]),
          box(0.18, 0.18, 0.12, 0x100c1a, [-0.19, 1.08, 0.48]),
          box(0.18, 0.18, 0.12, 0x100c1a, [0.19, 1.08, 0.48]),
          box(0.08, 0.08, 0.14, 0xc05eff, [-0.19, 1.08, 0.5]),
          box(0.08, 0.08, 0.14, 0xc05eff, [0.19, 1.08, 0.5]),
        ], 'bone_ivory', 0.052, { emissiveHex: 0x6b21a8, emissiveIntensity: 0.22 });
        break;

      case 'MinibossGolem':
      case 'MinibossGolemSand': {
        const isSand = key === 'MinibossGolemSand';
        const rockA = isSand ? 0xd9a152 : 0x788794;
        const rockB = isSand ? 0xb57636 : 0x6c7c8a;
        const rockC = isSand ? 0x995d2b : 0x5c6b78;
        const capCol = isSand ? 0xffd23f : 0x5ab846;
        const coreCol = isSand ? 0xffae19 : 0x4df7ff;
        pair = makePair([
          dodec(1.12, rockA, [0, 1.85, 0], undefined, [1.18, 1.05, 0.9]),
          octa(0.42, coreCol, [0, 1.95, 0.85]),
          box(0.95, 0.12, 0.16, coreCol, [0, 1.55, 0.88]),
          dodec(0.74, rockB, [-1.25, 2.38, 0.05]),
          dodec(0.48, capCol, [-1.25, 2.9, 0.05]),
          dodec(0.78, rockB, [1.28, 2.42, -0.05]),
          dodec(0.5, capCol, [1.28, 2.94, -0.05]),
          box(0.55, 1.35, 0.55, rockB, [-1.36, 1.35, 0.2]),
          dodec(0.52, rockC, [-1.4, 0.62, 0.35]),
          box(0.55, 1.35, 0.55, rockB, [1.36, 1.35, 0.2]),
          dodec(0.52, rockC, [1.4, 0.62, 0.35]),
          box(0.58, 1.05, 0.62, rockC, [-0.52, 0.52, 0]),
          box(0.58, 1.05, 0.62, rockC, [0.52, 0.52, 0]),
          box(0.86, 0.72, 0.8, rockA, [0, 3.02, 0.14]),
          box(0.58, 0.16, 0.12, coreCol, [0, 3.04, 0.54]),
        ], isSand ? 'desert_sandstone' : 'stone_golem', 0.072, {
          emissiveHex: isSand ? 0x994a10 : 0x168099,
          emissiveIntensity: 0.26,
        });
        break;
      }

      case 'MinibossPig':
      case 'Ghostham': {
        const isGhost = key === 'Ghostham';
        const body = isGhost ? 0x80d8ff : 0xc97b70;
        const armor = isGhost ? 0x4b2a85 : 0x4b5563;
        const trim = isGhost ? 0x70f5ff : 0xffc83b;
        const crest = isGhost ? 0xc05eff : 0xd62839;
        pair = makePair([
          dodec(0.95, body, [0, 1.08, 0], undefined, [1.05, 0.92, 1.38]),
          box(1.56, 0.82, 1.15, armor, [0, 1.24, 0.05]),
          box(1.66, 0.16, 1.24, trim, [0, 1.24, 0.05]),
          cone(0.22, 0.52, 4, crest, [0, 1.88, 0.45]),
          cone(0.22, 0.56, 4, crest, [0, 1.9, 0.0]),
          cone(0.2, 0.48, 4, crest, [0, 1.84, -0.45]),
          cyl(0.36, 0.46, 0.52, 7, isGhost ? 0xa6ecff : 0xe6978c, [0, 1.0, 1.34], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.72, 5, isGhost ? 0x70f5ff : 0xfff8e6, [-0.46, 1.18, 1.44], [0.75, 0, 0.35]),
          cone(0.14, 0.72, 5, isGhost ? 0x70f5ff : 0xfff8e6, [0.46, 1.18, 1.44], [0.75, 0, -0.35]),
          box(0.18, 0.12, 0.1, isGhost ? 0xff2ec4 : 0xffd23f, [-0.42, 1.38, 1.06]),
          box(0.18, 0.12, 0.1, isGhost ? 0xff2ec4 : 0xffd23f, [0.42, 1.38, 1.06]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [-0.54, 0.31, 0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [0.54, 0.31, 0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [-0.54, 0.31, -0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [0.54, 0.31, -0.62]),
        ], isGhost ? 'spectral_ectoplasm' : 'character_palette', 0.068, {
          emissiveHex: isGhost ? 0x5c2d91 : 0x000000,
          emissiveIntensity: isGhost ? 0.35 : 0,
        });
        break;
      }

      case 'CalciumDad':
        // Crowned Skeleton King Miniboss w/ royal purple cloak & giant bone greatsword!
        pair = makePair([
          cyl(0.18, 0.2, 1.25, 6, 0xf5f0de, [0, 1.65, 0]),
          box(1.12, 0.18, 0.64, 0xf5f0de, [0, 2.05, 0.04]),
          box(0.96, 0.16, 0.56, 0xf5f0de, [0, 1.72, 0.04]),
          box(0.8, 0.16, 0.48, 0xf5f0de, [0, 1.4, 0.04]),
          octa(0.32, 0x5cf7ff, [0, 1.82, 0.12]), // soul-fire ribcage heart
          box(1.22, 2.15, 0.16, 0x592680, [0, 1.25, -0.45], [0.15, 0, 0]),
          cyl(0.16, 0.14, 1.05, 6, 0xf2ebd9, [-0.36, 0.52, 0]),
          cyl(0.16, 0.14, 1.05, 6, 0xf2ebd9, [0.36, 0.52, 0]),
          // Giant crowned skull
          dodec(0.68, 0xfaf5e6, [0, 2.75, 0.06]),
          box(0.54, 0.26, 0.42, 0xf2ebd9, [0, 2.28, 0.26]),
          box(0.22, 0.2, 0.14, 0x100c1a, [-0.22, 2.78, 0.64]),
          box(0.22, 0.2, 0.14, 0x100c1a, [0.22, 2.78, 0.64]),
          box(0.1, 0.1, 0.16, 0x5cf7ff, [-0.22, 2.78, 0.66]),
          box(0.1, 0.1, 0.16, 0x5cf7ff, [0.22, 2.78, 0.66]),
          cyl(0.66, 0.52, 0.42, 6, 0xffd23f, [0, 3.45, 0.06]),
          octa(0.18, 0xff2ec4, [0, 3.48, 0.64]),
          // Giant two-handed bone greatsword
          box(0.34, 2.4, 0.14, 0xfaf5e6, [0.95, 2.1, 0.72], [0.45, 0, -0.15]),
          box(0.86, 0.18, 0.2, 0xffd23f, [0.88, 1.15, 0.28], [0.45, 0, -0.15]),
        ], 'bone_ivory', 0.072, { emissiveHex: 0x3b186e, emissiveIntensity: 0.25 });
        break;

      case 'Ghost':
      case 'GreaterGhost':
      case 'GhostPurple':
      case 'GhostRed':
      case 'GhostGrave':
      case 'GhostInvincible': {
        const isSteve = key === 'GhostInvincible';
        const isRed = key === 'GhostRed';
        const isPurple = key === 'GhostPurple';
        const isGreater = key === 'GreaterGhost';
        const isGrave = key === 'GhostGrave';
        const cloakColor = isSteve
          ? 0xff2e54
          : isRed
            ? 0xe63946
            : isPurple
              ? 0x9b5de5
              : isGreater
                ? 0x221b33
                : isGrave
                  ? 0x4dffbe
                  : 0xbde8ff;
        const eyeColor = isSteve
          ? 0xffe45e
          : isRed
            ? 0xfff0a3
            : isPurple
              ? 0xff66f5
              : isGreater
                ? 0xff3b5c
                : 0xffffff;
        const parts: ColoredPartSpec[] = [
          cone(0.56, 1.45, 7, cloakColor, [0, 1.05, 0]),
          cone(0.2, 0.48, 4, cloakColor, [-0.36, 0.34, 0.16], [Math.PI, 0, 0.15]),
          cone(0.2, 0.54, 4, cloakColor, [0.36, 0.32, 0.16], [Math.PI, 0, -0.15]),
          cone(0.22, 0.56, 4, cloakColor, [0, 0.3, -0.36], [Math.PI, 0, 0]),
          dodec(0.42, cloakColor, [0, 1.72, 0.02]),
          cone(0.32, 0.52, 5, cloakColor, [0, 2.04, -0.18], [-0.55, 0, 0]),
          box(0.42, 0.38, 0.24, 0x0b0c14, [0, 1.66, 0.26]),
          box(0.12, 0.09, 0.08, eyeColor, [-0.12, 1.7, 0.39]),
          box(0.12, 0.09, 0.08, eyeColor, [0.12, 1.7, 0.39]),
          cone(0.18, 0.65, 5, cloakColor, [-0.54, 1.18, 0.24], [1.1, 0, 0.35]),
          cone(0.18, 0.65, 5, cloakColor, [0.54, 1.18, 0.24], [1.1, 0, -0.35]),
        ];
        if (isSteve) {
          parts.push(
            cyl(0.4, 0.32, 0.28, 6, 0xffd23f, [0, 2.18, 0.02]),
            octa(0.14, 0xff2ec4, [0, 2.24, 0.32]),
          );
        } else if (isGreater) {
          parts.push(
            cone(0.1, 0.4, 4, 0xff3b5c, [-0.32, 2.08, 0.04], [0.15, 0, 0.45]),
            cone(0.1, 0.4, 4, 0xff3b5c, [0.32, 2.08, 0.04], [0.15, 0, -0.45]),
          );
        } else if (isGrave) {
          // Tombstone shoulder shackles!
          parts.push(
            box(0.42, 0.62, 0.14, 0x5c647a, [-0.56, 1.56, -0.12], [0, 0.2, 0.25]),
            box(0.42, 0.62, 0.14, 0x5c647a, [0.56, 1.56, -0.12], [0, -0.2, -0.25]),
          );
        }
        pair = makePair(parts, 'spectral_ectoplasm', isSteve ? 0.072 : 0.052, {
          emissiveHex: isSteve ? 0x6b0f32 : cloakColor,
          emissiveIntensity: isSteve ? 0.48 : 0.24,
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

  // ---- Stylized Biome Props (ALL 4 BIOMES!) ----

  public getPropGeometryPair(kind: PropKind): LowPolyGeometryPair {
    const cached = this.propCache.get(kind);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'pine':
        pair = makePair([
          cyl(0.28, 0.48, 2.4, 6, 0x7d4f32, [0, 1.2, 0]),
          cone(2.15, 2.4, 7, 0x3b9e47, [0, 2.85, 0]),
          cone(1.7, 2.25, 7, 0x52bd4c, [0, 4.35, 0], [0, 0.45, 0]),
          cone(1.18, 1.95, 7, 0x7ee058, [0, 5.75, 0], [0, 0.9, 0]),
        ], 'foliage_pine', 0.075);
        break;

      case 'oak':
        pair = makePair([
          cyl(0.38, 0.62, 2.8, 7, 0x855436, [0, 1.4, 0]),
          cyl(0.2, 0.32, 1.4, 6, 0x7d4d31, [-0.65, 2.6, 0.25], [0.15, 0, 0.58]),
          cyl(0.2, 0.32, 1.4, 6, 0x7d4d31, [0.65, 2.65, -0.2], [-0.15, 0, -0.55]),
          dodec(1.65, 0x4eb043, [0, 3.85, 0]),
          dodec(1.28, 0x6ecc4b, [-1.15, 3.45, 0.5]),
          dodec(1.25, 0x6ecc4b, [1.15, 3.55, -0.45]),
          dodec(1.1, 0x9ce354, [0.15, 4.75, 0.25]),
        ], 'foliage_oak', 0.08);
        break;

      case 'boulder':
        pair = makePair([
          dodec(1.15, 0x798f9e, [0, 0.65, 0], undefined, [1.22, 0.78, 1.05]),
          dodec(0.75, 0x627887, [0.75, 0.42, 0.45], undefined, [1.0, 0.72, 1.1]),
          dodec(0.72, 0x6bc949, [-0.1, 1.18, -0.05], undefined, [1.25, 0.36, 1.15]),
        ], 'terrain_cliff', 0.072);
        break;

      case 'desert_boulder':
        // Stratified wind-sculpted sandstone rock mesa outcrop!
        pair = makePair([
          dodec(1.25, 0xd6934a, [0, 0.7, 0], undefined, [1.3, 0.85, 1.1]),
          dodec(0.85, 0xc27a38, [0.85, 0.52, 0.4], undefined, [1.1, 0.7, 1.05]),
          box(1.5, 0.36, 1.3, 0xebba6d, [-0.1, 1.38, -0.08], [0.05, 0.3, -0.04]),
        ], 'desert_sandstone', 0.072);
        break;

      case 'sandstone_obelisk':
        // Weathered Egyptian sandstone obelisk & carved pyramidion cap!
        pair = makePair([
          box(2.15, 0.58, 2.15, 0xb57038, [0, 0.29, 0]),
          box(1.62, 0.48, 1.62, 0xcf8946, [0, 0.82, 0]),
          cyl(0.56, 0.88, 5.2, 4, 0xe3a85b, [0, 3.65, 0], [0, Math.PI * 0.25, 0]),
          cone(0.58, 1.15, 4, 0xffd23f, [0, 6.8, 0], [0, Math.PI * 0.25, 0]),
          box(1.26, 0.16, 1.26, 0x38bdf8, [0, 4.95, 0]),
        ], 'desert_sandstone', 0.078, { emissiveHex: 0x165e7a, emissiveIntensity: 0.18 });
        break;

      case 'ruin_pillar':
        pair = makePair([
          box(1.45, 0.42, 1.45, 0x6e7d8f, [0, 0.21, 0]),
          cyl(0.48, 0.56, 3.4, 8, 0x8d9dad, [0, 2.05, 0]),
          box(1.3, 0.35, 1.3, 0x768596, [0, 3.85, 0], [0.08, 0.2, 0.06]),
          dodec(0.55, 0x64c246, [0.35, 4.08, 0.2], undefined, [1.2, 0.45, 1.1]),
        ], 'shrine_rune', 0.07);
        break;

      case 'cactus':
        // Tall ribbed outlined Desert Saguaro Cactus w/ twin bent arms & pink desert blossom!
        pair = makePair([
          cyl(0.38, 0.46, 3.9, 7, 0x4ca642, [0, 1.95, 0]),
          dodec(0.39, 0x5ab84c, [0, 3.95, 0]),
          cyl(0.24, 0.28, 1.15, 6, 0x45993b, [-0.62, 2.15, 0], [0, 0, 1.25]),
          cyl(0.23, 0.25, 1.35, 6, 0x4ca642, [-1.1, 2.95, 0]),
          cyl(0.24, 0.28, 1.05, 6, 0x45993b, [0.58, 1.72, 0], [0, 0, -1.25]),
          cyl(0.22, 0.24, 1.22, 6, 0x4ca642, [1.02, 2.42, 0]),
          octa(0.24, 0xff5c8a, [0, 4.35, 0]),
        ], 'desert_cactus', 0.068);
        break;

      case 'tombstone':
        pair = makePair([
          box(1.42, 0.34, 0.86, 0x424a5e, [0, 0.17, 0]),
          box(1.08, 1.82, 0.4, 0x68738a, [0, 1.16, 0], [0, 0, 0.05]),
          cyl(0.54, 0.54, 0.4, 8, 0x68738a, [0, 2.04, 0], [Math.PI * 0.5, 0, 0]),
          // Carved gothic cross relief
          box(0.14, 0.72, 0.08, 0x495166, [0, 1.48, 0.22]),
          box(0.46, 0.14, 0.08, 0x495166, [0, 1.64, 0.22]),
        ], 'graveyard_cobble', 0.066);
        break;

      case 'dead_tree':
        // Crooked gnarled dead Graveyard tree with twisted branches!
        pair = makePair([
          cyl(0.32, 0.64, 2.9, 6, 0x3b3042, [0, 1.42, 0], [0.06, 0, 0.08]),
          cyl(0.2, 0.32, 2.3, 6, 0x322838, [0.22, 3.6, 0.1], [-0.12, 0, -0.18]),
          cyl(0.12, 0.22, 2.0, 5, 0x2a2130, [-0.88, 3.35, 0.25], [0.2, 0, 0.78]),
          cyl(0.1, 0.2, 1.9, 5, 0x2a2130, [1.05, 4.15, -0.25], [-0.25, 0, -0.72]),
          cone(0.14, 1.1, 4, 0x261d2b, [-1.72, 4.15, 0.42], [0.25, 0, 0.55]),
          cone(0.12, 1.1, 4, 0x261d2b, [1.82, 4.88, -0.45], [-0.22, 0, -0.48]),
        ], 'bark_grain', 0.072);
        break;

      case 'iron_fence':
        // Gothic Graveyard wrought-iron fence pillar & spiked bars!
        pair = makePair([
          box(0.86, 2.75, 0.86, 0x4b5369, [0, 1.38, 0]),
          box(1.04, 0.34, 1.04, 0x5c6680, [0, 2.86, 0]),
          octa(0.34, 0x7c6a99, [0, 3.3, 0]),
          // Adjacent wrought-iron spiked fence span
          box(2.6, 0.14, 0.14, 0x262c3b, [1.65, 2.05, 0]),
          box(2.6, 0.14, 0.14, 0x262c3b, [1.65, 0.65, 0]),
          cyl(0.06, 0.06, 2.1, 5, 0x262c3b, [0.95, 1.35, 0]),
          cyl(0.06, 0.06, 2.1, 5, 0x262c3b, [1.65, 1.35, 0]),
          cyl(0.06, 0.06, 2.1, 5, 0x262c3b, [2.35, 1.35, 0]),
          cone(0.11, 0.32, 4, 0x475269, [0.95, 2.52, 0]),
          cone(0.11, 0.32, 4, 0x475269, [1.65, 2.52, 0]),
          cone(0.11, 0.32, 4, 0x475269, [2.35, 2.52, 0]),
        ], 'graveyard_iron', 0.064);
        break;

      case 'crypt_arch':
        // Imposing Haunted Graveyard Crypt Archway Landmark!
        pair = makePair([
          box(1.25, 5.2, 1.25, 0x454d63, [-2.35, 2.6, 0]),
          box(1.25, 5.2, 1.25, 0x454d63, [2.35, 2.6, 0]),
          box(6.4, 1.15, 1.45, 0x555e78, [0, 5.65, 0]),
          cone(1.85, 1.75, 4, 0x3b4154, [0, 7.05, 0], [0, Math.PI * 0.25, 0]),
          octa(0.55, 0xa855f7, [0, 6.25, 0.72]),
          box(0.5, 0.5, 0.5, 0x70f5ff, [-2.35, 5.45, 0.68]),
          box(0.5, 0.5, 0.5, 0x70f5ff, [2.35, 5.45, 0.68]),
        ], 'graveyard_cobble', 0.085, { emissiveHex: 0x6b21a8, emissiveIntensity: 0.3 });
        break;

      case 'citadel_pillar':
        // Towering Obsidian & Gilded-Gold FinalBossMap Colosseum Perimeter Obelisk!
        pair = makePair([
          cyl(1.45, 1.75, 0.9, 6, 0x1d162b, [0, 0.45, 0]),
          cyl(1.2, 1.35, 0.35, 6, 0xffc83b, [0, 1.05, 0]),
          cyl(0.82, 1.05, 7.4, 6, 0x291e3d, [0, 4.9, 0]),
          cyl(1.15, 0.9, 0.45, 6, 0xffc83b, [0, 8.75, 0]),
          octa(0.75, 0xff4d2e, [0, 9.75, 0], undefined, [0.9, 1.45, 0.9]),
        ], 'citadel_obsidian', 0.088, { emissiveHex: 0xa82438, emissiveIntensity: 0.38, gloss: 0.6 });
        break;
    }

    this.propCache.set(kind, pair);
    return pair;
  }

  // ---- ALL 12 Interactables + World Structures + Darkness Lamps ----

  public getInteractableGeometryPair(
    kind: InteractableKind | 'BossPortal' | 'BossPylon' | 'CryptAltar' | 'DarknessLamp',
    variant: InteractableVariant = 'normal',
    used = false,
  ): LowPolyGeometryPair {
    const cacheKey = `${kind}:${variant}:${used ? '1' : '0'}`;
    const cached = this.interactableCache.get(cacheKey);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    const effectiveKind = kind === 'BossSpawner' && variant === 'crypt_altar' ? 'CryptAltar' : kind;

    switch (effectiveKind) {
      case 'ChargeShrine': {
        const isGold = variant === 'golden';
        const stone = isGold ? 0xd9a73b : 0x768699;
        const crystal = used ? 0x4e6173 : isGold ? 0xffe45e : 0x4df5ff;
        pair = makePair([
          cyl(1.25, 1.48, 0.45, 8, isGold ? 0xb58326 : 0x566475, [0, 0.22, 0]),
          cyl(0.88, 1.05, 0.36, 8, stone, [0, 0.62, 0]),
          cyl(0.42, 0.68, 2.85, 6, stone, [0, 2.2, 0]),
          octa(0.52, crystal, [0, 4.15, 0], undefined, [0.85, 1.38, 0.85]),
          torus(0.74, 0.075, 5, 8, isGold ? 0xffe45e : 0x62f5ff, [0, 4.15, 0], [Math.PI * 0.5, 0, 0]),
        ], 'shrine_rune', 0.068, {
          emissiveHex: used ? 0x000000 : isGold ? 0xffb703 : 0x1fc7e8,
          emissiveIntensity: used ? 0 : 0.35,
        });
        break;
      }

      case 'Chest': {
        const wood =
          variant === 'evil' ? 0x4a1e3d : variant === 'ghost' ? 0x2a6c85 : variant === 'free' ? 0x2d7a47 : variant === 'golden' ? 0xe8b22c : 0x9c5c2d;
        const trim =
          variant === 'evil' ? 0xff3864 : variant === 'ghost' ? 0x70f5ff : variant === 'free' ? 0x7df76d : 0xffd23f;
        const lidRotX = used ? -1.15 : 0;
        const lidY = used ? 1.18 : 0.92;
        const lidZ = used ? -0.34 : 0;
        pair = makePair([
          box(1.36, 0.72, 0.92, wood, [0, 0.36, 0]),
          box(1.42, 0.14, 0.98, trim, [0, 0.68, 0]),
          box(0.24, 0.28, 0.12, trim, [0, 0.66, 0.48]),
          cyl(0.46, 0.46, 1.38, 7, wood, [0, lidY, lidZ], [lidRotX, 0, Math.PI * 0.5]),
          box(0.16, 0.5, 0.96, trim, [-0.46, lidY, lidZ], [lidRotX, 0, 0]),
          box(0.16, 0.5, 0.96, trim, [0.46, lidY, lidZ], [lidRotX, 0, 0]),
        ], 'chest_wood', 0.056, { emissiveHex: used ? 0x000000 : trim, emissiveIntensity: used ? 0 : 0.16, gloss: 0.4 });
        break;
      }

      case 'Pot': {
        if (variant === 'pumpkin') {
          // Carved glowing Jack-O-Lantern Pumpkin!
          pair = makePair([
            dodec(0.64, 0xf27127, [0, 0.55, 0], undefined, [1.14, 0.88, 1.14]),
            cyl(0.08, 0.13, 0.34, 5, 0x3b8532, [0, 1.12, 0], [0.15, 0, 0.22]),
            box(0.16, 0.14, 0.08, 0xffe45e, [-0.22, 0.66, 0.64]),
            box(0.16, 0.14, 0.08, 0xffe45e, [0.22, 0.66, 0.64]),
            box(0.42, 0.12, 0.08, 0xffae19, [0, 0.4, 0.66]),
          ], 'character_palette', 0.05, { emissiveHex: 0xd95814, emissiveIntensity: 0.24 });
        } else if (variant === 'tumbleweed') {
          pair = makePair([
            ico(0.64, 0xc29353, [0, 0.64, 0]),
            cone(0.14, 0.46, 4, 0x9e7138, [0.5, 0.72, 0.2], [0, 0, -1.1]),
            cone(0.14, 0.46, 4, 0x9e7138, [-0.5, 0.68, -0.2], [0, 0, 1.1]),
            cone(0.14, 0.46, 4, 0xa87c42, [0.1, 1.15, 0]),
          ], 'bark_grain', 0.048);
        } else {
          pair = makePair([
            cyl(0.32, 0.42, 0.32, 8, 0xd97a48, [0, 0.16, 0]),
            dodec(0.56, 0xe68a55, [0, 0.62, 0], undefined, [1.0, 1.05, 1.0]),
            cyl(0.36, 0.26, 0.26, 8, 0xc96b3a, [0, 1.12, 0]),
            torus(0.34, 0.07, 5, 8, 0xf2c97e, [0, 1.24, 0], [Math.PI * 0.5, 0, 0]),
          ], 'ceramic_pot', 0.048);
        }
        break;
      }

      case 'ShrineMoai':
        // Iconic Easter Island Carved Moai Head w/ deep brow, long angular nose, glowing eyes & mossy crown!
        pair = makePair([
          box(2.1, 0.42, 1.6, 0x5c6875, [0, 0.21, 0]),
          box(1.55, 2.85, 1.22, 0x808f9e, [0, 1.82, 0]),
          box(1.66, 0.42, 0.64, 0x677585, [0, 2.75, 0.56]), // heavy overhanging brow
          box(0.42, 1.15, 0.58, 0x9aaaba, [0, 2.02, 0.68]), // long angular moai nose
          box(0.95, 0.18, 0.26, 0x4a5568, [0, 1.18, 0.62]), // stoic mouth
          box(0.26, 0.2, 0.16, used ? 0x3b4454 : 0x5cf7ff, [-0.42, 2.42, 0.62]),
          box(0.26, 0.2, 0.16, used ? 0x3b4454 : 0x5cf7ff, [0.42, 2.42, 0.62]),
          box(0.28, 0.92, 0.34, 0x738291, [-0.88, 2.1, 0.08]), // carved side ears
          box(0.28, 0.92, 0.34, 0x738291, [0.88, 2.1, 0.08]),
          dodec(0.75, 0x59b842, [0, 3.32, -0.05], undefined, [1.3, 0.35, 1.1]),
        ], 'terrain_cliff', 0.072, { emissiveHex: used ? 0x000000 : 0x1fc7e8, emissiveIntensity: used ? 0 : 0.2 });
        break;

      case 'ShadyGuy': {
        // Cloaked enigmatic merchant stall w/ wooden cart, striped awning & glowing rarity lantern!
        const lanternHex = variant === 'golden' ? 0xffd23f : variant === 'evil' ? 0xd946ef : 0x52f2ff;
        pair = makePair([
          // Cloaked Shady Guy behind stall
          cone(0.68, 1.85, 7, 0x26203b, [-0.25, 0.92, -0.35]),
          dodec(0.45, 0x362d54, [-0.25, 1.98, -0.35]),
          box(0.12, 0.08, 0.08, 0xffd23f, [-0.39, 2.0, 0.03]),
          box(0.12, 0.08, 0.08, 0xffd23f, [-0.11, 2.0, 0.03]),
          // Timber merchant table + wares crates
          box(2.25, 0.82, 0.95, 0x7d4c2a, [0, 0.41, 0.55]),
          box(2.4, 0.14, 1.08, 0x9c6138, [0, 0.86, 0.55]),
          box(0.46, 0.42, 0.46, 0x5c361d, [-0.62, 1.12, 0.55]),
          octa(0.2, 0xffd23f, [0.05, 1.14, 0.55]),
          // Canopy corner poles & striped awning roof
          cyl(0.08, 0.09, 2.75, 6, 0x5c361d, [-1.05, 1.38, 0.9]),
          cyl(0.08, 0.09, 2.75, 6, 0x5c361d, [1.05, 1.38, 0.9]),
          box(2.45, 0.18, 1.45, 0x4c286b, [0, 2.8, 0.35], [0.22, 0, 0]),
          box(0.8, 0.2, 1.47, 0xffc83b, [0, 2.82, 0.35], [0.22, 0, 0]),
          // Hanging glowing rarity lantern!
          cyl(0.04, 0.04, 0.4, 5, 0x262c3b, [0.95, 2.45, 0.95]),
          octa(0.28, used ? 0x4b5563 : lanternHex, [0.95, 2.1, 0.95]),
        ], 'chest_wood', 0.06, { emissiveHex: used ? 0x000000 : lanternHex, emissiveIntensity: used ? 0 : 0.32 });
        break;
      }

      case 'Microwave':
        // Chunky retro pixel Microwave on crate w/ glowing cyan glass door & keypad!
        pair = makePair([
          box(1.5, 0.72, 1.18, 0x546070, [0, 0.36, 0]),
          box(1.66, 1.04, 1.06, used ? 0x4a4540 : 0xebe4d1, [0, 1.24, 0]),
          // Glowing glass door + inner silhouette
          box(0.96, 0.68, 0.1, used ? 0x1e242e : 0x38f2ff, [-0.22, 1.24, 0.52]),
          box(0.82, 0.54, 0.12, used ? 0x11151c : 0x99faff, [-0.22, 1.24, 0.53]),
          // Control panel + chunky retro buttons & twist dial
          box(0.38, 0.74, 0.1, 0x2a3342, [0.52, 1.24, 0.52]),
          box(0.24, 0.16, 0.12, used ? 0x52525b : 0x4dff77, [0.52, 1.46, 0.54]),
          cyl(0.1, 0.1, 0.12, 6, 0xff4d5e, [0.52, 1.06, 0.56], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.058, { emissiveHex: used ? 0x000000 : 0x1fc7e8, emissiveIntensity: used ? 0 : 0.32 });
        break;

      case 'ShrineGreed':
        // Opulent Golden Altar of Greed w/ overflowing chalice & coin mounds!
        pair = makePair([
          cyl(1.18, 1.42, 0.46, 8, 0x6b4c1e, [0, 0.23, 0]),
          cyl(0.68, 0.85, 1.75, 6, 0xc79528, [0, 1.32, 0]),
          cyl(0.98, 0.55, 0.82, 8, 0xffd23f, [0, 2.6, 0]),
          dodec(0.45, 0xffe45e, [-0.85, 0.45, 0.65], undefined, [1.1, 0.65, 1.1]),
          dodec(0.4, 0xffd23f, [0.85, 0.42, -0.5], undefined, [1.1, 0.6, 1.1]),
          octa(0.46, used ? 0x5c5346 : 0xffe45e, [0, 3.45, 0]),
        ], 'chest_wood', 0.064, { emissiveHex: used ? 0x000000 : 0xffb703, emissiveIntensity: used ? 0 : 0.35, gloss: 0.75 });
        break;

      case 'ShrineChallenge':
        // Fierce Crimson War-Challenge Shrine w/ crossed blades & glowing battle crystal!
        pair = makePair([
          box(1.9, 0.52, 1.4, 0x3b2c36, [0, 0.26, 0]),
          box(1.15, 1.75, 0.92, 0x4f3542, [0, 1.38, 0]),
          box(0.24, 2.35, 0.12, 0xcbd5e1, [0, 2.3, 0.48], [0, 0, 0.58]),
          box(0.24, 2.35, 0.12, 0xcbd5e1, [0, 2.3, 0.48], [0, 0, -0.58]),
          octa(0.56, used ? 0x4b5563 : 0xff2e54, [0, 3.35, 0]),
        ], 'metal_armor', 0.066, { emissiveHex: used ? 0x000000 : 0xff2644, emissiveIntensity: used ? 0 : 0.42 });
        break;

      case 'ShrineCursed':
        // Twisted Dark-Violet Cursed Altar w/ horned obsidian crown & floating skulls!
        pair = makePair([
          cyl(1.18, 1.45, 0.48, 7, 0x211430, [0, 0.24, 0]),
          cyl(0.48, 0.78, 2.45, 6, 0x361e52, [0, 1.65, 0]),
          cone(0.2, 0.9, 5, 0x1c1029, [-0.62, 2.75, 0], [0, 0, 0.55]),
          cone(0.2, 0.9, 5, 0x1c1029, [0.62, 2.75, 0], [0, 0, -0.55]),
          octa(0.58, used ? 0x3f374d : 0xd946ef, [0, 3.4, 0]),
          torus(0.86, 0.07, 5, 10, used ? 0x3f374d : 0xb938ff, [0, 3.4, 0], [0.55, 0.35, 0]),
        ], 'citadel_obsidian', 0.068, { emissiveHex: used ? 0x000000 : 0xa855f7, emissiveIntensity: used ? 0 : 0.45 });
        break;

      case 'ShrineMagnet':
        // Shrine of Succ — Iconic Chunky Red-and-Silver U-Shaped Horseshoe Magnet Monument!
        pair = makePair([
          cyl(1.15, 1.35, 0.5, 8, 0x4b596b, [0, 0.25, 0]),
          cyl(0.65, 0.82, 1.25, 8, 0x627387, [0, 1.1, 0]),
          // Iconic Horseshoe Magnet arch
          torus(0.74, 0.22, 6, 12, 0xe63946, [0, 2.55, 0], [0, 0, Math.PI], undefined, Math.PI),
          box(0.42, 0.62, 0.42, 0xe63946, [-0.74, 2.86, 0]),
          box(0.42, 0.62, 0.42, 0xe63946, [0.74, 2.86, 0]),
          box(0.44, 0.38, 0.44, 0xdbe6f2, [-0.74, 3.35, 0]),
          box(0.44, 0.38, 0.44, 0xdbe6f2, [0.74, 3.35, 0]),
          octa(0.26, used ? 0x4b5563 : 0x38f2ff, [0, 3.25, 0]),
        ], 'metal_armor', 0.064, { emissiveHex: used ? 0x000000 : 0x38f2ff, emissiveIntensity: used ? 0 : 0.35 });
        break;

      case 'ShrineBalance':
        // Shrine of Balance — Ancient Pillar topped with Twin Hanging Golden Scales!
        pair = makePair([
          cyl(1.1, 1.32, 0.45, 8, 0x5c6878, [0, 0.22, 0]),
          cyl(0.38, 0.52, 2.65, 8, 0x94a3b8, [0, 1.75, 0]),
          box(2.45, 0.18, 0.18, 0xffd23f, [0, 3.05, 0]),
          cyl(0.04, 0.04, 0.85, 4, 0xffd23f, [-1.1, 2.58, 0]),
          cyl(0.04, 0.04, 0.85, 4, 0xffd23f, [1.1, 2.58, 0]),
          cyl(0.48, 0.26, 0.18, 8, used ? 0x4b5563 : 0xffd23f, [-1.1, 2.1, 0]),
          cyl(0.48, 0.26, 0.18, 8, used ? 0x4b5563 : 0x5cf7ff, [1.1, 2.1, 0]),
          octa(0.32, used ? 0x4b5563 : 0x62f58d, [0, 3.48, 0]),
        ], 'shrine_rune', 0.062, { emissiveHex: used ? 0x000000 : 0x38e88c, emissiveIntensity: used ? 0 : 0.3 });
        break;

      case 'BossSpawner':
        pair = makePair([
          cyl(1.75, 2.05, 0.45, 8, 0x262033, [0, 0.22, 0]),
          cyl(1.25, 1.55, 0.55, 8, 0x382d4a, [0, 0.72, 0]),
          cyl(0.75, 0.92, 1.35, 8, 0x2d243b, [0, 1.62, 0]),
          dodec(0.84, 0xf2ebd9, [0, 2.75, 0.1]),
          box(0.62, 0.34, 0.48, 0xe6dec8, [0, 2.25, 0.32]),
          box(0.24, 0.22, 0.16, 0xff2644, [-0.28, 2.78, 0.78]),
          box(0.24, 0.22, 0.16, 0xff2644, [0.28, 2.78, 0.78]),
          cone(0.2, 0.95, 5, 0x3b2c40, [-0.72, 3.32, 0], [0.1, 0, 0.58]),
          cone(0.2, 0.95, 5, 0x3b2c40, [0.72, 3.32, 0], [0.1, 0, -0.58]),
        ], 'terrain_citadel', 0.075, { emissiveHex: used ? 0x241630 : 0xcc1838, emissiveIntensity: used ? 0.05 : 0.38 });
        break;

      case 'CryptAltar':
        // Haunted Gothic Crypt Altar w/ sarcophagus plinth, twin amethyst braziers & rune arch!
        pair = makePair([
          box(3.4, 0.55, 2.4, 0x343a4d, [0, 0.28, 0]),
          box(2.2, 1.05, 1.2, 0x4b536b, [0, 1.05, 0]),
          box(0.65, 3.6, 0.65, 0x434b63, [-1.45, 2.05, -0.4]),
          box(0.65, 3.6, 0.65, 0x434b63, [1.45, 2.05, -0.4]),
          box(3.8, 0.72, 0.85, 0x555f7a, [0, 4.15, -0.4]),
          octa(0.45, used ? 0x4b5563 : 0xa855f7, [-1.45, 4.25, 0.1]),
          octa(0.45, used ? 0x4b5563 : 0xa855f7, [1.45, 4.25, 0.1]),
          octa(0.62, used ? 0x4b5563 : 0x70f5ff, [0, 2.4, 0]),
        ], 'graveyard_cobble', 0.076, { emissiveHex: used ? 0x000000 : 0x7b2cbf, emissiveIntensity: used ? 0 : 0.4 });
        break;

      case 'BossPortal':
        pair = makePair([
          box(5.6, 0.55, 1.8, 0x2d2642, [0, 0.28, 0]),
          box(0.95, 5.2, 1.05, 0x3f365c, [-2.15, 3.0, 0]),
          box(0.95, 5.2, 1.05, 0x3f365c, [2.15, 3.0, 0]),
          box(5.6, 1.0, 1.2, 0x4c4170, [0, 5.75, 0]),
          octa(0.65, 0x5cf7ff, [0, 6.75, 0]),
          octa(0.36, 0xd946ef, [-2.15, 5.95, 0.55]),
          octa(0.36, 0xd946ef, [2.15, 5.95, 0.55]),
        ], 'shrine_rune', 0.085, { emissiveHex: 0x7b2cbf, emissiveIntensity: 0.4 });
        break;

      case 'BossPylon':
        // Hexagonal Obsidian-Gold FinalBossMap Pylon Pillar w/ glowing energy conduit crystal!
        pair = makePair([
          cyl(1.25, 1.55, 0.65, 6, 0x1e162e, [0, 0.32, 0]),
          cyl(1.02, 1.15, 0.28, 6, 0xffc83b, [0, 0.78, 0]),
          cyl(0.56, 0.86, 4.15, 6, 0x2d2042, [0, 2.95, 0]),
          cyl(0.92, 0.72, 0.32, 6, 0xffc83b, [0, 5.1, 0]),
          octa(0.72, used ? 0x4dff9e : 0xff2ec4, [0, 6.05, 0], undefined, [0.85, 1.45, 0.85]),
          torus(0.92, 0.08, 5, 12, used ? 0x4dff9e : 0xffc83b, [0, 6.05, 0], [Math.PI * 0.5, 0, 0]),
        ], 'citadel_obsidian', 0.075, { emissiveHex: used ? 0x1fc77e : 0xc91e94, emissiveIntensity: 0.45 });
        break;

      case 'DarknessLamp':
        // Ornate Wrought-Iron Gothic Graveyard Lamp Post (Big Bob Darkness Phase!)
        pair = makePair([
          cyl(0.48, 0.64, 0.42, 6, 0x3b4254, [0, 0.21, 0]),
          cyl(0.14, 0.22, 3.8, 6, 0x222736, [0, 2.2, 0]),
          // Curved forged iron hanging crook arm
          box(0.18, 0.18, 1.05, 0x222736, [0, 4.15, 0.44]),
          box(0.16, 0.42, 0.16, 0x222736, [0, 3.92, 0.92]),
          // Ornate hexagonal lantern hood & wrought-iron cage
          cone(0.52, 0.46, 6, 0x1e2230, [0, 3.68, 0.92]),
          cyl(0.38, 0.32, 0.68, 6, used ? 0xffe45e : 0x3d485c, [0, 3.12, 0.92]),
          cone(0.32, 0.28, 6, 0x1e2230, [0, 2.66, 0.92], [Math.PI, 0, 0]),
        ], 'graveyard_iron', 0.058, {
          emissiveHex: used ? 0xffae19 : 0x181c2b,
          emissiveIntensity: used ? 0.65 : 0.08,
        });
        break;
    }

    this.interactableCache.set(cacheKey, pair);
    return pair;
  }

  // ---- Distinct Projectile & Pickup Meshes (ALL 30 WEAPONS!) ----

  public normalizeProjectileArchetype(weaponId: string): string {
    const cached = this.projArchetypeNameCache.get(weaponId);
    if (cached !== undefined) return cached;
    const resolved = this.resolveProjectileArchetype(weaponId);
    this.projArchetypeNameCache.set(weaponId, resolved);
    return resolved;
  }

  private resolveProjectileArchetype(weaponId: string): string {
    const id = weaponId.toLowerCase();
    if (id.includes('dragon')) return 'fire_cone';
    if (id.includes('fire') || id.includes('flame')) return 'fireball';
    if (id.includes('bone')) return 'bone';
    if (id.includes('katana')) return 'katana_arc';
    if (id.includes('herosword') || id.includes('hero_sword')) return 'hero_arc';
    if (id.includes('corrupt') || id.includes('dexecutioner')) return 'corrupt_arc';
    if (id.includes('scythe')) return 'scythe';
    if (id.includes('sword')) return 'sword_arc';
    if (id.includes('axe')) return 'axe';
    if (id.includes('banana')) return 'banana';
    if (id.includes('rocket')) return 'rocket';
    if (id.includes('dagger') || id.includes('bluetooth') || id.includes('wireless')) return 'dagger';
    if (id.includes('dice')) return 'dice';
    if (id.includes('poison') || id.includes('flask')) return 'flask';
    if (id.includes('aegis')) return 'aegis_shield';
    if (id.includes('blood')) return 'blood_orb';
    if (id.includes('frost') || id.includes('ice')) return 'frost_shard';
    if (id.includes('bow') || id.includes('arrow')) return 'arrow';
    if (id.includes('sniper') || id.includes('rail')) return 'sniper';
    if (id.includes('noodle')) return 'noodle';
    if (id.includes('tornado')) return 'tornado_proj';
    if (id.includes('blackhole') || id.includes('black_hole')) return 'blackhole_orb';
    if (id.includes('mine')) return 'mine';
    if (id.includes('revolver') || id.includes('shotgun')) return 'bullet';
    if (id.includes('chunker') || id.includes('rock') || id.includes('boulder')) return 'boulder';
    if (id.includes('lightning') || id.includes('bolt')) return 'lightning';
    return 'orb';
  }

  public getProjectileGeometryPair(kind: string): LowPolyGeometryPair {
    const key = this.normalizeProjectileArchetype(kind);
    const cached = this.projectileCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'fireball':
        pair = makePair([
          ico(0.42, 0xffe45e),
          cone(0.44, 0.95, 6, 0xff621f, [0, 0, -0.45], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.036, { emissiveHex: 0xff621f, emissiveIntensity: 0.95 });
        break;

      case 'fire_cone':
        // Dragon's Breath blazing cel flame jet!
        pair = makePair([
          cone(0.62, 1.65, 7, 0xff5a1f, [0, 0, 0.25], [-Math.PI * 0.5, 0, 0]),
          cone(0.38, 1.15, 6, 0xffe45e, [0, 0, 0.05], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.034, { emissiveHex: 0xff621f, emissiveIntensity: 1.1 });
        break;

      case 'bone':
        pair = makePair([
          cyl(0.11, 0.11, 0.85, 6, 0xfaf5e6, undefined, [0, 0, Math.PI * 0.5]),
          octa(0.17, 0xfaf5e6, [-0.44, 0.1, 0]),
          octa(0.17, 0xfaf5e6, [-0.44, -0.1, 0]),
          octa(0.17, 0xfaf5e6, [0.44, 0.1, 0]),
          octa(0.17, 0xfaf5e6, [0.44, -0.1, 0]),
        ], 'bone_ivory', 0.038);
        break;

      case 'sword_arc':
        pair = makePair([
          torus(1.15, 0.16, 4, 10, 0xdbf8ff, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.46], undefined, Math.PI * 0.92),
          torus(1.26, 0.08, 4, 10, 0xffffff, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.42], undefined, Math.PI * 0.85),
        ], 'character_palette', 0.03, { emissiveHex: 0x7df9ff, emissiveIntensity: 0.9 });
        break;

      case 'katana_arc':
        pair = makePair([
          torus(1.32, 0.1, 4, 12, 0x5cf2ff, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.55], undefined, Math.PI * 1.1),
          torus(1.42, 0.05, 4, 12, 0xffffff, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.52], undefined, Math.PI * 1.04),
        ], 'character_palette', 0.024, { emissiveHex: 0x38f2ff, emissiveIntensity: 1.15 });
        break;

      case 'hero_arc':
        pair = makePair([
          torus(1.28, 0.18, 4, 10, 0xffd84d, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.46], undefined, Math.PI * 0.92),
          torus(1.4, 0.09, 4, 10, 0x70f5ff, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.42], undefined, Math.PI * 0.84),
        ], 'character_palette', 0.03, { emissiveHex: 0xffc83b, emissiveIntensity: 1.0 });
        break;

      case 'corrupt_arc':
        pair = makePair([
          torus(1.26, 0.18, 4, 10, 0x9b22d9, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.48], undefined, Math.PI * 0.96),
          torus(1.38, 0.09, 4, 10, 0xff2e54, undefined, [Math.PI * 0.5, 0, -Math.PI * 0.44], undefined, Math.PI * 0.88),
        ], 'character_palette', 0.032, { emissiveHex: 0xb938ff, emissiveIntensity: 1.05 });
        break;

      case 'scythe':
        pair = makePair([
          cyl(0.06, 0.06, 1.35, 5, 0x3b2d4d, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          torus(0.75, 0.11, 4, 10, 0xcbd5e1, [0, 0, 0.45], [Math.PI * 0.5, 0, -0.4], undefined, Math.PI * 0.85),
          torus(0.84, 0.05, 4, 10, 0x4dff9e, [0, 0, 0.45], [Math.PI * 0.5, 0, -0.4], undefined, Math.PI * 0.8),
        ], 'character_palette', 0.034, { emissiveHex: 0x2ecc71, emissiveIntensity: 0.75 });
        break;

      case 'axe':
        pair = makePair([
          cyl(0.07, 0.07, 1.15, 5, 0x7d4c2a),
          box(0.74, 0.48, 0.1, 0xd8e2ee, [0, 0.35, 0]),
          box(0.82, 0.38, 0.06, 0xffffff, [0, 0.35, 0]),
        ], 'metal_armor', 0.036, { gloss: 0.7 });
        break;

      case 'banana':
        // Spinning bright golden Bananarang crescent!
        pair = makePair([
          torus(0.56, 0.14, 5, 10, 0xffe03b, [0, 0, 0], [Math.PI * 0.5, 0, 0], undefined, Math.PI * 0.88),
          box(0.14, 0.12, 0.14, 0x5c371d, [0.56, 0, 0.04]),
          box(0.12, 0.12, 0.12, 0x5c371d, [-0.52, 0, 0.18]),
        ], 'character_palette', 0.036, { emissiveHex: 0xd9a816, emissiveIntensity: 0.35 });
        break;

      case 'rocket':
        // Chunky Homing Rocket missile with red nosecone, white body, fins & blazing exhaust!
        pair = makePair([
          cyl(0.2, 0.2, 0.92, 7, 0xf8fafc, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cone(0.21, 0.45, 7, 0xff3b5c, [0, 0, 0.68], [Math.PI * 0.5, 0, 0]),
          box(0.66, 0.06, 0.28, 0xff3b5c, [0, 0, -0.36]),
          box(0.06, 0.66, 0.28, 0xff3b5c, [0, 0, -0.36]),
          cone(0.16, 0.42, 6, 0xffb703, [0, 0, -0.66], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xff621f, emissiveIntensity: 0.55 });
        break;

      case 'arrow':
        pair = makePair([
          cyl(0.05, 0.05, 1.35, 5, 0x9c6138, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.36, 4, 0xe2e8f0, [0, 0, 0.82], [Math.PI * 0.5, 0, 0]),
          box(0.28, 0.04, 0.32, 0x4dff77, [0, 0, -0.58]),
          box(0.04, 0.28, 0.32, 0x4dff77, [0, 0, -0.58]),
        ], 'character_palette', 0.025, { emissiveHex: 0xffe45e, emissiveIntensity: 0.35 });
        break;

      case 'dagger':
        // Sleek glowing cyan Wireless Dagger!
        pair = makePair([
          cone(0.14, 0.86, 4, 0x5cf7ff, [0, 0, 0.32], [Math.PI * 0.5, 0, 0]),
          box(0.34, 0.08, 0.1, 0xffd23f, [0, 0, -0.1]),
          cyl(0.06, 0.06, 0.32, 5, 0x262f42, [0, 0, -0.28], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.028, { emissiveHex: 0x38f2ff, emissiveIntensity: 0.95 });
        break;

      case 'dice': {
        // Giant tumbling white D6 cube projectile with crisp dark pips!
        const h = 0.38;
        const parts: ColoredPartSpec[] = [box(h * 2, h * 2, h * 2, 0xf7f8fc)];
        addDicePipCluster(parts, 'front', 6, h, 0);
        addDicePipCluster(parts, 'back', 1, h, 0);
        addDicePipCluster(parts, 'top', 5, h, 0);
        addDicePipCluster(parts, 'bottom', 2, h, 0);
        addDicePipCluster(parts, 'right', 3, h, 0);
        addDicePipCluster(parts, 'left', 4, h, 0);
        pair = makePair(parts, 'character_palette', 0.036, { emissiveHex: 0xffd23f, emissiveIntensity: 0.25 });
        break;
      }

      case 'flask':
        // Lobbed glowing emerald glass Poison Flask!
        pair = makePair([
          dodec(0.38, 0x52f55a, [0, -0.05, 0]),
          cyl(0.12, 0.14, 0.28, 6, 0x8cff85, [0, 0.38, 0]),
          cyl(0.1, 0.1, 0.12, 6, 0x8f562e, [0, 0.54, 0]),
        ], 'slime_gel', 0.034, { emissiveHex: 0x4dff57, emissiveIntensity: 0.7, gloss: 0.7 });
        break;

      case 'aegis_shield':
        // Orbiting glowing golden-cyan hexagonal Aegis Shield Plate!
        pair = makePair([
          cyl(0.68, 0.68, 0.12, 6, 0xffd23f, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cyl(0.5, 0.5, 0.16, 6, 0x38bdf8, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          octa(0.22, 0xffffff, [0, 0, 0.12]),
        ], 'metal_armor', 0.038, { emissiveHex: 0x38f2ff, emissiveIntensity: 0.75, gloss: 0.75 });
        break;

      case 'blood_orb':
        pair = makePair([
          ico(0.38, 0xff2644),
          torus(0.54, 0.06, 4, 8, 0xff6b81, [0, 0, 0], [0.7, 0.4, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xe61c3a, emissiveIntensity: 0.95 });
        break;

      case 'frost_shard':
        pair = makePair([
          octa(0.38, 0x80f7ff, [0, 0, 0], undefined, [0.7, 0.7, 1.85]),
          octa(0.22, 0xffffff, [0, 0, 0.25]),
        ], 'character_palette', 0.03, { emissiveHex: 0x38e8ff, emissiveIntensity: 0.95, gloss: 0.85 });
        break;

      case 'noodle':
        // Space Noodle neon plasma segment!
        pair = makePair([
          cyl(0.14, 0.14, 2.2, 6, 0xff66f5, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          torus(0.26, 0.06, 4, 8, 0x5cf7ff, [0, 0, 0]),
        ], 'character_palette', 0.026, { emissiveHex: 0xff38d9, emissiveIntensity: 1.2 });
        break;

      case 'tornado_proj':
        pair = makePair([
          cone(0.72, 1.85, 8, 0xa6f7ff, [0, 0.5, 0], [Math.PI, 0, 0]),
          torus(0.58, 0.08, 4, 10, 0xffffff, [0, 0.9, 0], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0x5cf7ff, emissiveIntensity: 0.7 });
        break;

      case 'blackhole_orb':
        pair = makePair([
          ico(0.45, 0x12081f),
          torus(0.78, 0.1, 5, 12, 0xc05eff, [0, 0, 0], [Math.PI * 0.45, 0.2, 0]),
        ], 'character_palette', 0.034, { emissiveHex: 0x8b2ce6, emissiveIntensity: 0.95 });
        break;

      case 'mine':
        pair = makePair([
          cyl(0.54, 0.62, 0.24, 8, 0x334155, [0, 0.12, 0]),
          cyl(0.22, 0.26, 0.16, 6, 0xff2644, [0, 0.28, 0]),
        ], 'metal_armor', 0.036, { emissiveHex: 0xff2644, emissiveIntensity: 0.75 });
        break;

      case 'bullet':
        pair = makePair([
          cone(0.13, 0.45, 5, 0xfff4c2, [0, 0, 0.25], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.03, 1.15, 5, 0xffb703, [0, 0, -0.45], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.025, { emissiveHex: 0xffbe0b, emissiveIntensity: 0.95 });
        break;

      case 'boulder':
        pair = makePair([
          dodec(0.56, 0x7e8f9e),
          dodec(0.32, 0x69c748, [0.16, 0.34, 0.08]),
        ], 'terrain_cliff', 0.048);
        break;

      case 'lightning':
        pair = makePair([
          box(0.18, 1.1, 0.18, 0x80f7ff, [0.12, 0.45, 0], [0, 0, -0.32]),
          box(0.18, 1.1, 0.18, 0xffffff, [-0.12, -0.35, 0], [0, 0, 0.36]),
        ], 'character_palette', 0.03, { emissiveHex: 0x5cf7ff, emissiveIntensity: 1.2 });
        break;

      case 'sniper':
        pair = makePair([
          cyl(0.09, 0.09, 3.2, 6, 0xffffff, undefined, [Math.PI * 0.5, 0, 0]),
          torus(0.32, 0.05, 5, 8, 0x38f2ff, [0, 0, -0.6]),
        ], 'character_palette', 0.025, { emissiveHex: 0x38f2ff, emissiveIntensity: 1.2 });
        break;

      default:
        pair = makePair([octa(0.34, 0xc56cf0)], 'character_palette', 0.032, { emissiveHex: 0xa855f7, emissiveIntensity: 0.85 });
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
        pair = makePair([octa(0.32, 0xffffff, undefined, undefined, [0.85, 1.38, 0.85])], 'character_palette', 0.035, {
          emissiveHex: 0x38f2ff,
          emissiveIntensity: 0.35,
          gloss: 0.7,
        });
        break;
      case 'coin':
        pair = makePair([cyl(0.32, 0.32, 0.12, 8, 0xffffff, undefined, [Math.PI * 0.5, 0, 0])], 'character_palette', 0.032, {
          emissiveHex: 0xffb703,
          emissiveIntensity: 0.3,
          gloss: 0.8,
        });
        break;
      case 'heart':
        pair = makePair([
          octa(0.28, 0xff3b5c, [-0.14, 0.14, 0]),
          octa(0.28, 0xff3b5c, [0.14, 0.14, 0]),
          cone(0.34, 0.44, 4, 0xff3b5c, [0, -0.14, 0], [Math.PI, Math.PI * 0.25, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xff2e54, emissiveIntensity: 0.45 });
        break;
      case 'orb':
        pair = makePair([
          ico(0.36, 0xffffff),
          torus(0.5, 0.05, 4, 8, 0xffe45e, undefined, [Math.PI * 0.35, 0, 0]),
        ], 'character_palette', 0.035, { emissiveHex: 0xffffff, emissiveIntensity: 0.4 });
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
