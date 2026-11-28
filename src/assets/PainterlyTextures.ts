/**
 * KRUNKEDBONK — Crunchy Valheim / PS1 Hand-Painted Pixel-Art Procedural DataTextures
 *
 * Authors crisp 64x64 low-poly pixel-art textures with cohesive earthy color harmony,
 * deliberate chunky texel clusters, mossy ruined castle stone bricks with pixel ivy,
 * dappled Valheim-style multi-tone leaf canopies, warm sunlit desert dunes & carved
 * sandstone, gnarled bark, pixel-shaded plate armor, dusty linen bandages, and clean
 * retro-fantasy cloth/fur shading.
 *
 * 100% deterministic, zero external files, strict THREE.NearestFilter + generateMipmaps=false
 * to satisfy every Gate A procedural contract.
 */

import * as THREE from 'three';

export type PainterlyTextureId =
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

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable smooth value noise on a period-N torus so pixel-art tiles repeat seamlessly. */
function tileNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const ix0 = ((x0 % period) + period) % period;
  const iy0 = ((y0 % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;

  const a = hash2(ix0, iy0, seed);
  const b = hash2(ix1, iy0, seed);
  const c = hash2(ix0, iy1, seed);
  const d = hash2(ix1, iy1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function tileFbm(u: number, v: number, basePeriod: number, seed: number): number {
  return (
    tileNoise(u, v, basePeriod, seed) * 0.56 +
    tileNoise(u, v, basePeriod * 2, seed + 19) * 0.29 +
    tileNoise(u, v, basePeriod * 4, seed + 47) * 0.15
  );
}

/** Quantizes a scalar value to crisp pixel-art shade ramps (authentic PS1/Valheim hand-painted feel). */
function quantize(t: number, steps: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return Math.round(c * (steps - 1)) / (steps - 1);
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function lerpHex(hexA: number, hexB: number, t: number): number {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const ar = (hexA >> 16) & 255;
  const ag = (hexA >> 8) & 255;
  const ab = hexA & 255;
  const br = (hexB >> 16) & 255;
  const bg = (hexB >> 8) & 255;
  const bb = hexB & 255;
  return (
    (clampByte(ar + (br - ar) * k) << 16) |
    (clampByte(ag + (bg - ag) * k) << 8) |
    clampByte(ab + (bb - ab) * k)
  );
}

function rampHex(palette: readonly number[], t: number): number {
  const k = t <= 0 ? 0 : t >= 1 ? 0.9999 : t;
  const idx = Math.min(palette.length - 1, Math.floor(k * palette.length));
  return palette[idx]!;
}

function makeDataTexture(
  width: number,
  height: number,
  painter: (x: number, y: number, u: number, v: number) => number,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const invW = 1 / width;
  const invH = 1 / height;
  for (let y = 0; y < height; y++) {
    const v = y * invH;
    for (let x = 0; x < width; x++) {
      const hex = painter(x, y, x * invW, v);
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

export function buildAllPainterlyTextures(): Record<PainterlyTextureId, THREE.DataTexture> {
  return {
    // 64x64 Crunchy Valheim-style earthy olive-moss grass turf (visible painterly pixel tiles!)
    terrain_grass: makeDataTexture(64, 64, (x, y, u, v) => {
      // Sample on coarse 2px texel grid for unmistakable chunky PS1/Valheim ground pixels
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const macro = tileFbm(qu, qv, 4, 11);
      const patch = tileNoise(qu, qv, 8, 23);
      const tuft = hash2(px, py, 37);
      const val = macro * 0.56 + patch * 0.28 + tuft * 0.16;

      // Neutralized luminance-rich earthy moss ramp so biome vertex colors drive Forest T1/T2/T3 cleanly!
      const grassRamp = [0x8c9e7a, 0xa2b58b, 0xb8cc9a, 0xcedda8, 0xe0eba8];
      let col = rampHex(grassRamp, (val - 0.16) / 0.72);
      // Occasional subtle dark grass blade shadow pixel or warm earth fleck
      if (tuft < 0.08 && patch < 0.45) {
        col = lerpHex(col, 0x6a785c, 0.55);
      } else if (tuft > 0.94 && macro > 0.56) {
        col = lerpHex(col, 0xeef2b8, 0.45);
      }
      return col;
    }),

    // 64x64 Weathered mossy grey slate/stone cliff strata with chunky PS1 pixel bevels
    terrain_cliff: makeDataTexture(64, 64, (x, y, u, v) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const warp = (tileNoise(qu, qv, 4, 41) - 0.5) * 0.12;
      const row = Math.floor((qv + warp) * 6);
      const rowFrac = ((qv + warp) * 6) % 1;
      const off = (row & 1) * 0.5;
      const colFrac = ((qu * 4 + off) % 1 + 1) % 1;
      const blockTone = hash2(Math.floor(qu * 4 + off), row, 53);
      const grain = tileNoise(qu, qv, 8, 67);

      if (rowFrac < 0.12 || colFrac < 0.09) {
        return grain > 0.65 ? 0x3b5c34 : 0x262c33;
      }
      const stoneRamp = [0x596269, 0x707a82, 0x8a949c, 0xa3adb5, 0xbcc4cc];
      let col = rampHex(stoneRamp, blockTone * 0.52 + grain * 0.48);
      if (rowFrac < 0.24) col = lerpHex(col, 0xd4dce3, 0.35);
      // Hanging moss cap along top edge of cliff strata
      if (qv > 0.78 && tileNoise(qu, qv, 6, 79) > 0.44) {
        col = lerpHex(0x3a6b31, 0x629642, quantize(grain, 3));
      }
      return col;
    }),

    // 64x64 Soft sun-baked golden-ochre desert sand with gentle wind-carved dune tones (zero noisy clutter!)
    terrain_desert: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const warp = tileFbm(qu, qv, 3, 83) * 0.22;
      const ripple = Math.sin((qv * 4 + qu * 1.5 + warp * 4) * Math.PI * 2) * 0.5 + 0.5;
      const macro = tileFbm(qu, qv, 4, 89);
      const val = quantize(ripple * 0.44 + macro * 0.56, 6);
      // Soft high-luminance sand tones (tinted by Desert T1/T2/T3 vertex palette!)
      return lerpHex(0xc4b08e, 0xf7ecd2, val);
    }),

    // 64x64 Weathered carved desert sandstone rock & adobe ruin blocks (warm layered pixel stone!)
    desert_sandstone: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const warp = (tileNoise(qu, qv, 4, 101) - 0.5) * 0.1;
      const strata = Math.sin((qv * 5 + warp * 4) * Math.PI * 2) * 0.5 + 0.5;
      const grain = tileFbm(qu, qv, 6, 107);
      const block = hash2(px >> 2, py >> 1, 109);
      const t = quantize(strata * 0.48 + grain * 0.36 + block * 0.16, 5);
      // Warm sandstone ramp from shaded umber-ochre to sunlit cream-sand
      const sandStoneRamp = [0x826040, 0xa37b52, 0xc4986a, 0xdcb484, 0xedd0a4];
      return rampHex(sandStoneRamp, t);
    }),

    // 64x64 Ribbed saguaro cactus skin with chunky vertical pixel flutes & subtle pale spines
    desert_cactus: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const flute = (px % 4) / 4;
      const n = tileNoise(px / 32, py / 32, 6, 113);
      if (px % 4 === 0) return 0x26421f;
      if (px % 4 === 2 && py % 5 === 0) return 0xc9cca0;
      return lerpHex(0x3e6b2e, 0x649144, quantize(flute * 0.65 + n * 0.35, 4));
    }),

    // 64x64 Atmospheric moody graveyard turf & weathered slate cobbles
    terrain_graveyard: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const macro = tileFbm(qu, qv, 4, 127);
      const speck = hash2(px, py, 131);
      const val = quantize(macro * 0.72 + speck * 0.28, 5);
      return lerpHex(0x7c7d99, 0xc4c6de, val);
    }),

    // 64x64 Weathered mossy grey-slate gothic masonry for gravestones, crypts & ruins
    graveyard_cobble: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const row = py >> 2;
      const off = (row & 1) * 4;
      const bx = (px + off) & 7;
      const by = py & 3;
      const tone = hash2((px + off) >> 3, row, 137);
      const grain = tileNoise(px / 32, py / 32, 8, 139);
      if (bx === 0 || by === 0) return 0x222633;
      const ramp = [0x50586e, 0x67708a, 0x808aa6, 0x9ba5c2];
      let c = rampHex(ramp, tone * 0.55 + grain * 0.45);
      if (by === 1) c = lerpHex(c, 0xcad3eb, 0.28);
      return c;
    }),

    // 64x64 Forged dark wrought-iron fence & gate metalwork
    graveyard_iron: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileNoise(px / 32, py / 32, 8, 149);
      if (px === 0 || px === 31 || py === 0 || py === 31) return 0x161b26;
      const band = Math.sin((px + py) * 0.45) * 0.5 + 0.5;
      return lerpHex(0x323b4f, 0x73829e, quantize(n * 0.6 + band * 0.4, 4));
    }),

    // 64x64 Weathered carved basalt/volcanic sandstone arena stone for FinalBossMap
    terrain_citadel: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const bx = px & 7;
      const by = py & 7;
      const tileH = hash2(px >> 3, py >> 3, 157);
      const n = tileNoise(px / 32, py / 32, 8, 163);
      if (bx === 0 || by === 0) return 0x382824;
      const ramp = [0x6e554a, 0x876a5c, 0xa38270, 0xbd9a84];
      let col = rampHex(ramp, tileH * 0.5 + n * 0.5);
      if (bx === 1 || by === 1) col = lerpHex(col, 0xd6b8a3, 0.28);
      return col;
    }),

    // 64x64 Dark carved boss-arena monolith & armor basalt with weathered bronze trim
    citadel_obsidian: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileNoise(px / 32, py / 32, 8, 167);
      if (py === 3 || py === 4 || py === 27 || py === 28) return lerpHex(0xc98c2c, 0xf2c95e, n);
      if (py === 5 || py === 26) return 0x1a141c;
      const ramp = [0x2d2433, 0x42354a, 0x5c4a66, 0x786285];
      return rampHex(ramp, n);
    }),

    // 64x64 Glowing molten volcanic lava crust
    citadel_magma: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const w = tileFbm(qu, qv, 4, 173);
      const flow = tileFbm(qu + w * 0.2, qv - w * 0.16, 6, 179);
      if (flow > 0.72) return 0xfff099;
      if (flow > 0.55) return 0xff7b1c;
      if (flow > 0.38) return 0xc4201c;
      return 0x3b0f14;
    }),

    // 64x64 Layered dusty grey-cream Mummy bandages (matches Desert mummy horde!)
    mummy_wraps: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const band = (py + ((px >> 2) & 1)) % 5;
      const n = tileNoise(px / 32, py / 32, 8, 181);
      if (band === 0) return 0x524f49;
      if (band === 1) return 0x858077;
      const ramp = [0xa8a399, 0xc4bfb4, 0xdcd7cb];
      return rampHex(ramp, n);
    }),

    // 64x64 Crunchy PS1 pixel-shaded steel plate armor with dark seams & crisp highlight band!
    metal_armor: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileNoise(px / 32, py / 32, 6, 191);
      const sheen = Math.sin((px / 32 + py / 32) * Math.PI * 2) * 0.5 + 0.5;
      if (py === 0 || py === 15 || py === 31) return 0x3c444f;
      if (px === 0 || px === 31) return 0x4d5766;
      const steelRamp = [0x828e9c, 0xa8b4c2, 0xcbd5e0, 0xebf2fa, 0xffffff];
      return rampHex(steelRamp, sheen * 0.62 + n * 0.38);
    }),

    // 64x64 Spectral ghostly ectoplasm pixel shading
    spectral_ectoplasm: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const w = tileFbm(qu, qv, 4, 197);
      const sw = Math.sin((qu * 3 + w * 2.5) * Math.PI * 2) * 0.5 + 0.5;
      const ramp = [0x6e59a8, 0x9180cc, 0x9ec9ed, 0xd4f7ff];
      return rampHex(ramp, sw * 0.6 + w * 0.4);
    }),

    // 64x64 Deeply grooved gnarled ancient tree bark + olive moss flecks (trees & Ent Boss!)
    bark_grain: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const warp = (tileNoise(qu, qv, 4, 211) - 0.5) * 0.14;
      const furrow = Math.sin((qu * 6 + warp * 5) * Math.PI * 2) * 0.5 + 0.5;
      const grain = tileFbm(qu * 2, qv * 0.5, 6, 223);
      const moss = tileNoise(qu, qv, 4, 229);
      if (furrow < 0.18) return 0x331f10;
      if (moss > 0.77 && grain > 0.46) return lerpHex(0x4b7029, 0x739c3c, quantize(grain, 3));
      const barkRamp = [0x5e3c20, 0x7d532d, 0x9c6b3b, 0xb8854d];
      return rampHex(barkRamp, furrow * 0.56 + grain * 0.44);
    }),

    // 64x64 SIGNATURE VALHEIM / PS1 DAPPLED PIXEL-LEAF PINE CANOPY (deep blue-teal shadow -> olive -> pale sunlit leaf dabs!)
    foliage_pine: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const clumpA = tileNoise(qu, qv, 6, 227);
      const clumpB = tileNoise(qu + 0.37, qv - 0.21, 10, 231);
      const dab = hash2(px, py, 235);
      const val = clumpA * 0.52 + clumpB * 0.34 + dab * 0.14;
      // High-contrast hand-painted Valheim leaf clumps: deep cool pine shadow -> sage -> sunlit top leaf
      const leafRamp = [0x243d3b, 0x355949, 0x4e7a52, 0x709e5e, 0xa0c778, 0xcce09b];
      return rampHex(leafRamp, (val - 0.12) / 0.78);
    }),

    // 64x64 SIGNATURE VALHEIM / PS1 DAPPLED PIXEL-LEAF OAK CANOPY (bold chunky leaf clusters!)
    foliage_oak: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      // Chunky overlapping pixel leaf clusters with dark shadowed crevices between clumps!
      const cx = ((px % 8) - 3.5) / 4;
      const cy = ((py % 8) - 3.5) / 4;
      const dist = Math.hypot(cx, cy);
      const cluster = tileFbm(qu, qv, 5, 233);
      const dither = hash2(px, py, 237) * 0.16;
      const val = (1 - Math.min(1, dist)) * 0.44 + cluster * 0.44 + dither;
      const leafRamp = [0x213b39, 0x335946, 0x4f7d4d, 0x73a159, 0xa4c975, 0xd4e69c];
      return rampHex(leafRamp, (val - 0.16) / 0.74);
    }),

    // 64x64 ICONIC MOSSY RUINED CASTLE STONE BRICK WITH HANGING GREEN PIXEL IVY!
    shrine_rune: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      // Staggered 8-row medieval stone brick courses
      const row = py >> 2; // 8 courses per tile
      const off = (row & 1) * 4;
      const bx = (px + off) & 7;
      const by = py & 3;
      const brickId = hash2((px + off) >> 3, row, 239);
      const wear = tileNoise(qu, qv, 8, 243);

      // Draped pixel-art emerald ivy hanging down from upper brick courses & organic tendrils!
      const ivyNoise = tileFbm(qu, qv * 0.7, 4, 247);
      const hangEdge = 0.54 + Math.sin(qu * Math.PI * 4) * 0.16 + (ivyNoise - 0.5) * 0.36;
      const isIvy =
        (qv > hangEdge && ivyNoise > 0.36) ||
        (ivyNoise > 0.74 && qv > 0.22);
      if (isIvy) {
        const ivyRamp = [0x153b1c, 0x225728, 0x337030, 0x4b8c3b];
        return rampHex(ivyRamp, quantize(wear * 0.65 + hash2(px, py, 251) * 0.35, 4));
      }

      // Crisp dark weathered mortar seams between bricks
      if (bx === 0 || by === 0) return 0x242a30;
      // Weathered medieval grey-warm stone bricks
      const brickRamp = [0x545b61, 0x6b737a, 0x828b91, 0x9aa2a8, 0xb2babf];
      let col = rampHex(brickRamp, brickId * 0.55 + wear * 0.45);
      // Warm mossy/tan stone weathering on selected bricks
      if (brickId > 0.78) col = lerpHex(col, 0x827d68, 0.36);
      if (by === 3) col = lerpHex(col, 0xd0d7de, 0.28); // sunlit top brick edge
      if (by === 1) col = lerpHex(col, 0x394047, 0.28); // lower shadow lip
      return col;
    }),

    // 64x64 Chunky retro treasure chest wooden planks with iron-steel banding & rivets
    chest_wood: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileNoise(px / 32, py / 32, 8, 241);
      const isBand = px < 4 || px > 27 || py < 3 || py > 28 || (py >= 14 && py <= 17);
      if (isBand) {
        if (px === 4 || px === 27 || py === 3 || py === 28) return 0x242933;
        if ((px === 2 || px === 29) && py % 6 === 2) return 0xf2f7ff;
        return lerpHex(0x8c98a8, 0xd4dfe8, quantize(n, 3));
      }
      if (py % 5 === 0) return 0x3b2010;
      const woodRamp = [0x6e3d1e, 0x8a5029, 0xa86738, 0xc27e48];
      return rampHex(woodRamp, tileNoise(px / 32, py / 16, 6, 251));
    }),

    // 64x64 Crisp kinetic energy rail chevrons
    rail_energy: makeDataTexture(64, 64, (_x, _y, u, v) => {
      const chevron = ((u * 4 + Math.abs(v - 0.5) * 2) % 1 + 1) % 1;
      if (chevron < 0.16) return 0xffffff;
      if (chevron < 0.48) return 0x4df5ff;
      if (chevron < 0.68) return 0x1e8ec9;
      return 0x26354d;
    }),

    // 64x64 Swirling dimensional boss portal vortex
    portal_swirl: makeDataTexture(64, 64, (x, y) => {
      const u = (x >> 1) / 32;
      const v = (y >> 1) / 32;
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.hypot(dx, dy) * 2.0;
      const ang = Math.atan2(dy, dx);
      const spiral = Math.sin(r * 10.0 - ang * 4.0) * 0.5 + 0.5;
      if (r < 0.24) return 0xffffff;
      const ramp = [0x241047, 0x6b28b8, 0x9b4dff, 0x62e8ff, 0xe8ffff];
      return rampHex(ramp, spiral);
    }),

    // 64x64 Crunchy PS1/Valheim hand-painted cloth/fur/skin shading (gives characters crisp pixel texels!)
    character_palette: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const brush = tileFbm(qu, qv, 5, 257);
      const grain = hash2(px, py, 261);
      const q = quantize(brush * 0.72 + grain * 0.28, 5);
      const lum = 0.80 + q * 0.24; // 0.80..1.04 crisp visible PS1 shading while preserving vivid vertex colors!
      const b = clampByte(Math.min(255, lum * 255));
      return (b << 16) | (b << 8) | b;
    }),

    // 64x64 Ancient moss-veined carved rock golem texture
    stone_golem: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const qu = px / 32;
      const qv = py / 32;
      const w = tileFbm(qu, qv, 4, 263);
      const crack = Math.abs(Math.sin((qu * 4 + qv * 3 + w * 2.2) * Math.PI));
      const n = tileNoise(qu, qv, 8, 269);
      if (crack < 0.06) return 0x45f5ff;
      if (crack < 0.11) return 0x222c38;
      if (n > 0.76) return 0x52823c;
      const ramp = [0x586470, 0x73808c, 0x8f9ca8, 0xb0bcc7];
      return rampHex(ramp, n);
    }),

    // 64x64 Crisp pixel-shaded ivory bone (Calcium & Skeletons!)
    bone_ivory: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileFbm(px / 32, py / 32, 6, 271);
      const ramp = [0xc9c2b2, 0xded8c8, 0xf2ede0, 0xffffff];
      return rampHex(ramp, n);
    }),

    // 64x64 Glossy pixel slime gel with crisp bubble highlights
    slime_gel: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const cx = ((px % 8) - 3.5) / 4;
      const cy = ((py % 8) - 3.5) / 4;
      const d = Math.hypot(cx, cy);
      if (d < 0.35 && hash2(px >> 3, py >> 3, 277) > 0.45) return 0xffffff;
      const n = tileNoise(px / 32, py / 32, 6, 281);
      return lerpHex(0xb8f2e8, 0xf0fffe, quantize(n, 4));
    }),

    // 64x64 Rustic clay pottery & barrels
    ceramic_pot: makeDataTexture(64, 64, (x, y) => {
      const px = x >> 1;
      const py = y >> 1;
      const n = tileNoise(px / 32, py / 32, 8, 283);
      if (py === 12 || py === 19) return 0x3b2112;
      if (py > 12 && py < 19) return ((px + py) & 2) ? 0xe6b86a : 0x784323;
      const ramp = [0xa85832, 0xc46d3f, 0xde8752, 0xf0a670];
      return rampHex(ramp, n);
    }),

    // 64x64 Crisp jump pad energy disc
    jump_pad: makeDataTexture(64, 64, (x, y) => {
      const u = (x >> 1) / 32;
      const v = (y >> 1) / 32;
      const r = Math.hypot(u - 0.5, v - 0.5) * 2.0;
      if (r < 0.25) return 0xffffff;
      if (Math.abs(r - 0.55) < 0.1 || Math.abs(r - 0.85) < 0.08) return 0x5cf7ff;
      return 0x26354d;
    }),
  };
}
