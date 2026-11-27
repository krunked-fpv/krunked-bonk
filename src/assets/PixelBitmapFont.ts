/**
 * KRUNKEDBONK — Retro Pixel-Arcade Bitmap Font & Icon Sprite Helper
 *
 * Renders razor-sharp outlined chunky arcade lettering and crisp retro icons
 * directly onto 2D canvases (floating damage numbers, minimap markers, world prompts)
 * and nearest-neighbor CanvasTextures with zero external font dependencies.
 */

import * as THREE from 'three';

/**
 * 5x7 crisp retro pixel-arcade glyph bitmaps (each row is a 5-bit mask, MSB on left).
 */
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

const GLYPHS: Record<string, readonly number[]> = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],

  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],

  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  '?': [0b01110, 0b10001, 0b00010, 0b00100, 0b00100, 0b00000, 0b00100],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '*': [0b00000, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00000],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
};

/** 7x7 crisp pixel icon sprites for minimap markers and world prompts */
export type PixelIconKind =
  | 'skull'
  | 'shrine'
  | 'chest'
  | 'portal'
  | 'crown'
  | 'star'
  | 'heart'
  | 'bolt'
  | 'flame'
  | 'key';

const PIXEL_ICONS: Record<PixelIconKind, readonly number[]> = {
  skull: [
    0b0111110,
    0b1111111,
    0b1011101,
    0b1110111,
    0b0111110,
    0b0101010,
    0b0011100,
  ],
  shrine: [
    0b0001000,
    0b0011100,
    0b0111110,
    0b0011100,
    0b0011100,
    0b0111110,
    0b1111111,
  ],
  chest: [
    0b0111110,
    0b1111111,
    0b1110111,
    0b1001001,
    0b1111111,
    0b1111111,
    0b0111110,
  ],
  portal: [
    0b0111110,
    0b1100011,
    0b1001101,
    0b1011001,
    0b1010011,
    0b1100110,
    0b0111110,
  ],
  crown: [
    0b0000000,
    0b1001001,
    0b1101011,
    0b1111111,
    0b1111111,
    0b0111110,
    0b0000000,
  ],
  star: [
    0b0001000,
    0b0011100,
    0b1111111,
    0b0111110,
    0b0011100,
    0b0110110,
    0b1100011,
  ],
  heart: [
    0b0000000,
    0b0110110,
    0b1111111,
    0b1111111,
    0b0111110,
    0b0011100,
    0b0001000,
  ],
  bolt: [
    0b0001110,
    0b0011100,
    0b0111000,
    0b1111110,
    0b0001100,
    0b0011000,
    0b0110000,
  ],
  flame: [
    0b0001000,
    0b0011000,
    0b0111100,
    0b1110110,
    0b1100011,
    0b0110110,
    0b0011100,
  ],
  key: [
    0b0111000,
    0b1000100,
    0b0111000,
    0b0010000,
    0b0011100,
    0b0010000,
    0b0011000,
  ],
};

export interface PixelTextDrawOptions {
  /** Pixel block size in canvas pixels (e.g. 2..6). Defaults to 3. */
  pixelSize?: number;
  /** Primary fill color (top or solid). Defaults to '#ffffff'. */
  color?: string;
  /** Optional bottom gradient color for bold retro arcade contrast. */
  colorBottom?: string;
  /** Outline stroke color. Defaults to '#080a10'. */
  outlineColor?: string;
  /** Outline thickness in pixel blocks (0, 1, or 2). Defaults to 1. */
  outlinePx?: number;
  /** Horizontal alignment around `x`. Defaults to 'center'. */
  align?: 'left' | 'center' | 'right';
  /** Vertical baseline alignment around `y`. Defaults to 'middle'. */
  baseline?: 'top' | 'middle' | 'bottom';
  /** Extra drop shadow offset in pixel blocks. Defaults to 1. */
  shadowOffsetPx?: number;
  /** Letter spacing in pixel blocks. Defaults to 1. */
  letterSpacing?: number;
}

/** Measure rendered pixel-text dimensions in canvas pixels. */
export function measurePixelText(
  text: string,
  pixelSize = 3,
  letterSpacing = 1,
): { width: number; height: number } {
  const len = text.length;
  if (len === 0) {
    return { width: 0, height: GLYPH_HEIGHT * pixelSize };
  }
  const cols = len * GLYPH_WIDTH + (len - 1) * letterSpacing;
  return {
    width: cols * pixelSize,
    height: GLYPH_HEIGHT * pixelSize,
  };
}

/**
 * Draw bold outlined pixel-arcade text directly onto a 2D canvas context.
 * Zero allocations in the hot loop (only integer fillRect calls).
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: PixelTextDrawOptions = {},
): void {
  const len = text.length;
  if (len === 0) return;

  const px = Math.max(1, Math.round((options.pixelSize ?? 3) * 2) / 2);
  const spacing = options.letterSpacing ?? 1;
  const outlineBlocks = options.outlinePx ?? 1;
  const shadowBlocks = options.shadowOffsetPx ?? 1;
  const color = options.color ?? '#ffffff';
  const colorBottom = options.colorBottom;
  const outlineColor = options.outlineColor ?? '#080a10';
  const align = options.align ?? 'center';
  const baseline = options.baseline ?? 'middle';

  const totalWidth = (len * GLYPH_WIDTH + (len - 1) * spacing) * px;
  const totalHeight = GLYPH_HEIGHT * px;

  let startX = x;
  if (align === 'center') startX -= totalWidth * 0.5;
  else if (align === 'right') startX -= totalWidth;

  let startY = y;
  if (baseline === 'middle') startY -= totalHeight * 0.5;
  else if (baseline === 'bottom') startY -= totalHeight;

  const baseX = Math.round(startX);
  const baseY = Math.round(startY);
  const advance = (GLYPH_WIDTH + spacing) * px;

  // Pass 1: Thick chunky black outline + crisp drop shadow
  if (outlineBlocks > 0 || shadowBlocks > 0) {
    ctx.fillStyle = outlineColor;
    const oPad = outlineBlocks * px;
    const oSpan = px + oPad * 2;
    const shY = shadowBlocks * px;

    for (let i = 0; i < len; i++) {
      const ch = text.charAt(i).toUpperCase();
      const rows = GLYPHS[ch];
      if (!rows) continue;
      const gx = baseX + i * advance;
      for (let r = 0; r < GLYPH_HEIGHT; r++) {
        const mask = rows[r]!;
        if (mask === 0) continue;
        const py = baseY + r * px;
        for (let c = 0; c < GLYPH_WIDTH; c++) {
          if ((mask & (1 << (GLYPH_WIDTH - 1 - c))) !== 0) {
            const cx = gx + c * px;
            if (outlineBlocks > 0) {
              ctx.fillRect(cx - oPad, py - oPad, oSpan, oSpan);
            }
            if (shadowBlocks > 0) {
              ctx.fillRect(cx - oPad, py + shY, oSpan, px + oPad);
            }
          }
        }
      }
    }
  }

  // Pass 2: Crisp bright arcade fill (solid or 2-tone top/bottom pixel split)
  if (!colorBottom) {
    ctx.fillStyle = color;
    for (let i = 0; i < len; i++) {
      const ch = text.charAt(i).toUpperCase();
      const rows = GLYPHS[ch];
      if (!rows) continue;
      const gx = baseX + i * advance;
      for (let r = 0; r < GLYPH_HEIGHT; r++) {
        const mask = rows[r]!;
        if (mask === 0) continue;
        const py = baseY + r * px;
        for (let c = 0; c < GLYPH_WIDTH; c++) {
          if ((mask & (1 << (GLYPH_WIDTH - 1 - c))) !== 0) {
            ctx.fillRect(gx + c * px, py, px, px);
          }
        }
      }
    }
  } else {
    // Classic retro arcade 2-tone top-highlight / bottom-accent pixel split
    for (let i = 0; i < len; i++) {
      const ch = text.charAt(i).toUpperCase();
      const rows = GLYPHS[ch];
      if (!rows) continue;
      const gx = baseX + i * advance;
      for (let r = 0; r < GLYPH_HEIGHT; r++) {
        const mask = rows[r]!;
        if (mask === 0) continue;
        ctx.fillStyle = r < 4 ? color : colorBottom;
        const py = baseY + r * px;
        for (let c = 0; c < GLYPH_WIDTH; c++) {
          if ((mask & (1 << (GLYPH_WIDTH - 1 - c))) !== 0) {
            ctx.fillRect(gx + c * px, py, px, px);
          }
        }
      }
    }
  }
}

/**
 * Draw a crisp 7x7 outlined retro pixel icon centered at `(x, y)`.
 */
export function drawPixelIcon(
  ctx: CanvasRenderingContext2D,
  kind: PixelIconKind,
  x: number,
  y: number,
  pixelSize = 2,
  color = '#ffffff',
  outlineColor = '#080a10',
): void {
  const rows = PIXEL_ICONS[kind];
  const px = Math.max(1, Math.round(pixelSize));
  const half = (7 * px) * 0.5;
  const baseX = Math.round(x - half);
  const baseY = Math.round(y - half);

  // Outline pass
  ctx.fillStyle = outlineColor;
  for (let r = 0; r < 7; r++) {
    const mask = rows[r]!;
    if (mask === 0) continue;
    const py = baseY + r * px;
    for (let c = 0; c < 7; c++) {
      if ((mask & (1 << (6 - c))) !== 0) {
        ctx.fillRect(baseX + c * px - px, py - px, px * 3, px * 3);
      }
    }
  }

  // Fill pass
  ctx.fillStyle = color;
  for (let r = 0; r < 7; r++) {
    const mask = rows[r]!;
    if (mask === 0) continue;
    const py = baseY + r * px;
    for (let c = 0; c < 7; c++) {
      if ((mask & (1 << (6 - c))) !== 0) {
        ctx.fillRect(baseX + c * px, py, px, px);
      }
    }
  }
}

/**
 * Cached nearest-neighbor sprite label textures for world-space prompts.
 */
const labelTextureCache = new Map<string, THREE.CanvasTexture>();

export function getPixelLabelTexture(
  text: string,
  color = '#fff4c2',
  colorBottom = '#f59e0b',
  pixelSize = 4,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const key = `${text}|${color}|${colorBottom}|${pixelSize}`;
  const cached = labelTextureCache.get(key);
  if (cached) return cached;

  const { width, height } = measurePixelText(text, pixelSize, 1);
  const pad = pixelSize * 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, width + pad * 2);
  canvas.height = Math.max(16, height + pad * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  drawPixelText(ctx, text, canvas.width * 0.5, canvas.height * 0.5, {
    pixelSize,
    color,
    colorBottom,
    outlineColor: '#080a10',
    outlinePx: 1,
    shadowOffsetPx: 1,
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  labelTextureCache.set(key, tex);
  return tex;
}

export function disposePixelLabelCache(): void {
  for (const tex of labelTextureCache.values()) {
    tex.dispose();
  }
  labelTextureCache.clear();
}
