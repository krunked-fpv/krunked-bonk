#!/usr/bin/env node
/**
 * KRUNKEDBONK Wave 0 — Read-Only Retail Asset Extractor (`tools/extract-assets.ts`)
 *
 * Pure TypeScript using ONLY Node 22 built-in modules (`node:fs`, `node:path`, `node:zlib`, `node:crypto`).
 * Includes a pure-TS LZ4 block decompressor, UnityFS v8 bundle reader, Unity SerializedFile v22 parser,
 * pure-TS Texture2D decoders (RGBA32, RGB24, ARGB32, Alpha8, R8, DXT1/BC1, DXT5/BC3), pure-TS PNG encoder,
 * palette extractor, and AudioClip/FSB5 metadata inspector.
 *
 * STRICT SAFETY:
 * - Retail install directory is opened STRICTLY READ-ONLY. Never writes, modifies, renames, or creates any file inside it.
 * - Gracefully supports `KRUNKEDBONK_RETAIL_DIR` env override or `--retail <dir>`, and exits 0 cleanly if absent on CI.
 * - Output defaults to `<cwd>/.krunkedbonk-assets/` (overridable via `--out <dir>`), writing `manifest.json`.
 * - Never crashes on unsupported codecs: logs skipped codecs cleanly and always writes a complete valid `manifest.json`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';

const DEFAULT_RETAIL_ROOT = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Megabonk';
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), '.krunkedbonk-assets');

interface CliOptions {
  retailDir: string;
  outDir: string;
}

// Mirrors PackManifest contract in src/contracts/index.ts (zero external imports)
type TextureCategory = 'palette' | 'icon' | 'ui' | 'character' | 'world' | 'vfx';
type AudioCategory = 'sfx' | 'music' | 'ui';

interface PackTextureEntry {
  id: string;
  path: string;
  width?: number;
  height?: number;
  format?: string;
  category?: TextureCategory;
}

interface PackAudioEntry {
  id: string;
  path: string;
  category?: AudioCategory;
  durationSec?: number;
  format?: string;
}

interface PackPaletteEntry {
  id: string;
  colors: string[];
  sourcePath?: string;
}

interface PackManifest {
  version: string;
  generatedAt: string;
  sourceVerified: boolean;
  baseUrl?: string;
  textures: Record<string, PackTextureEntry>;
  audio: Record<string, PackAudioEntry>;
  localization: Record<string, string>;
  palettes: Record<string, PackPaletteEntry>;
  skippedCodecs?: Record<string, number>;
  oracleSummary?: Record<string, unknown>;
}

interface AudioCatalogEntry {
  id: string;
  name: string;
  category: AudioCategory;
  channels: number;
  frequency: number;
  bitsPerSample: number;
  durationSec: number;
  compressionFormat: number;
  fsb5Codec: string;
  sourceResource: string;
  byteOffset: number;
  byteSize: number;
  extractedWavPath?: string;
}

// ============================================================================
// CLI & Strictly Read-Only I/O
// ============================================================================

function parseCliArgs(argv: readonly string[]): CliOptions {
  let retailArg = process.env.KRUNKEDBONK_RETAIL_DIR || DEFAULT_RETAIL_ROOT;
  let outDir = DEFAULT_OUT_DIR;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--out' || arg === '-o') && i + 1 < argv.length) {
      outDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--out=')) {
      outDir = path.resolve(arg.slice('--out='.length));
    } else if ((arg === '--retail' || arg === '-r') && i + 1 < argv.length) {
      retailArg = argv[++i];
    } else if (arg.startsWith('--retail=')) {
      retailArg = arg.slice('--retail='.length);
    }
  }

  return { retailDir: retailArg, outDir };
}

function resolveRetailDataDir(retailInput: string): string | null {
  const candidates = [retailInput, path.join(retailInput, 'Megabonk_Data')];
  for (const dir of candidates) {
    try {
      const ggm = path.join(dir, 'globalgamemanagers');
      if (fs.existsSync(ggm) && fs.statSync(ggm).isFile()) return dir;
    } catch {
      // ignore access errors
    }
  }
  return null;
}

function readFileReadOnly(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const st = fs.fstatSync(fd);
    const buf = Buffer.allocUnsafe(st.size);
    let read = 0;
    while (read < st.size) {
      const n = fs.readSync(fd, buf, read, st.size - read, read);
      if (n <= 0) break;
      read += n;
    }
    return read === st.size ? buf : buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function readSliceReadOnly(fd: number, offset: number, size: number): Buffer {
  const buf = Buffer.allocUnsafe(size);
  let read = 0;
  while (read < size) {
    const n = fs.readSync(fd, buf, read, size - read, offset + read);
    if (n <= 0) break;
    read += n;
  }
  return read === size ? buf : buf.subarray(0, read);
}

// ============================================================================
// Pure-TS LZ4 Block Decompressor & UnityFS v8 Bundle Reader
// ============================================================================

function lz4DecompressBlock(src: Buffer, uncompressedSize: number): Buffer {
  const dst = Buffer.allocUnsafe(uncompressedSize);
  let sp = 0;
  let dp = 0;
  while (sp < src.length) {
    const token = src[sp++];
    let litLen = token >>> 4;
    if (litLen === 15) {
      let b = 255;
      while (b === 255 && sp < src.length) {
        b = src[sp++];
        litLen += b;
      }
    }
    if (litLen > 0) {
      src.copy(dst, dp, sp, sp + litLen);
      sp += litLen;
      dp += litLen;
    }
    if (sp >= src.length) break;
    const offset = src[sp] | (src[sp + 1] << 8);
    sp += 2;
    if (offset === 0) throw new Error('Invalid LZ4 match offset 0');
    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let b = 255;
      while (b === 255 && sp < src.length) {
        b = src[sp++];
        matchLen += b;
      }
    }
    let mp = dp - offset;
    for (let i = 0; i < matchLen; i++) {
      dst[dp++] = dst[mp++];
    }
  }
  return dp === uncompressedSize ? dst : dst.subarray(0, dp);
}

interface UnityFSNode {
  name: string;
  buf: Buffer;
}

function parseUnityFSBundle(buf: Buffer): UnityFSNode[] {
  let p = 0;
  const readCStr = (): string => {
    let e = p;
    while (e < buf.length && buf[e] !== 0) e++;
    const s = buf.subarray(p, e).toString('utf8');
    p = e + 1;
    return s;
  };
  const sig = readCStr();
  if (sig !== 'UnityFS') throw new Error(`Unsupported bundle signature: ${sig}`);
  const version = buf.readUInt32BE(p); p += 4;
  readCStr(); // unityPlayerVer
  readCStr(); // unityRev
  p += 8; // file size
  const compBlocksInfoSize = buf.readUInt32BE(p); p += 4;
  const uncompBlocksInfoSize = buf.readUInt32BE(p); p += 4;
  const flags = buf.readUInt32BE(p); p += 4;
  if (version >= 7) p = (p + 15) & ~15;

  const compType = flags & 0x3f;
  const atEnd = (flags & 0x80) !== 0;
  const blocksInfoBytes = atEnd
    ? buf.subarray(buf.length - compBlocksInfoSize)
    : buf.subarray(p, p + compBlocksInfoSize);
  if (!atEnd) p += compBlocksInfoSize;
  if ((flags & 0x200) !== 0) p = (p + 15) & ~15;

  const blocksInfo = compType === 0
    ? blocksInfoBytes
    : compType === 2 || compType === 3
      ? lz4DecompressBlock(blocksInfoBytes, uncompBlocksInfoSize)
      : (() => { throw new Error(`Unsupported UnityFS header compression: ${compType}`); })();

  let bp = 16;
  const blockCount = blocksInfo.readInt32BE(bp); bp += 4;
  const blocks: Array<{ uncomp: number; comp: number; flags: number }> = [];
  for (let i = 0; i < blockCount; i++) {
    const uncomp = blocksInfo.readUInt32BE(bp); bp += 4;
    const comp = blocksInfo.readUInt32BE(bp); bp += 4;
    const bf = blocksInfo.readUInt16BE(bp); bp += 2;
    blocks.push({ uncomp, comp, flags: bf });
  }
  const nodeCount = blocksInfo.readInt32BE(bp); bp += 4;
  const rawNodes: Array<{ offset: number; size: number; name: string }> = [];
  for (let i = 0; i < nodeCount; i++) {
    const offset = Number(blocksInfo.readBigInt64BE(bp)); bp += 8;
    const size = Number(blocksInfo.readBigInt64BE(bp)); bp += 8;
    bp += 4; // flags
    let e = bp;
    while (e < blocksInfo.length && blocksInfo[e] !== 0) e++;
    const name = blocksInfo.subarray(bp, e).toString('utf8');
    bp = e + 1;
    rawNodes.push({ offset, size, name });
  }

  const chunks: Buffer[] = [];
  for (const bl of blocks) {
    const raw = buf.subarray(p, p + bl.comp);
    p += bl.comp;
    const ct = bl.flags & 0x3f;
    if (ct === 0) chunks.push(raw);
    else if (ct === 2 || ct === 3) chunks.push(lz4DecompressBlock(raw, bl.uncomp));
    else throw new Error(`Unsupported UnityFS block compression: ${ct}`);
  }
  const data = Buffer.concat(chunks);
  return rawNodes.map((n) => ({ name: n.name, buf: data.subarray(n.offset, n.offset + n.size) }));
}

// ============================================================================
// Unity SerializedFile v22 Parser
// ============================================================================

interface SerializedObject {
  pathId: bigint;
  offset: number;
  size: number;
  classId: number;
}

function parseSerializedFile(buf: Buffer): { unityVersion: string; objects: SerializedObject[] } {
  const version = buf.readUInt32BE(8);
  const le = buf[16] === 0;
  const dataOffset = version >= 22 ? Number(buf.readBigInt64BE(32)) : buf.readUInt32BE(12);
  let pos = version >= 22 ? 48 : 20;

  const rI32 = (): number => { const v = le ? buf.readInt32LE(pos) : buf.readInt32BE(pos); pos += 4; return v; };
  const rU32 = (): number => { const v = le ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos); pos += 4; return v; };
  const rI16 = (): number => { const v = le ? buf.readInt16LE(pos) : buf.readInt16BE(pos); pos += 2; return v; };
  const rI64 = (): bigint => { const v = le ? buf.readBigInt64LE(pos) : buf.readBigInt64BE(pos); pos += 8; return v; };
  const rCStr = (): string => {
    let e = pos;
    while (e < buf.length && buf[e] !== 0) e++;
    const s = buf.subarray(pos, e).toString('utf8');
    pos = e + 1;
    return s;
  };
  const align4 = (): void => { pos = (pos + 3) & ~3; };

  const unityVersion = rCStr();
  rI32(); // targetPlatform
  const enableTypeTree = buf[pos++] !== 0;

  const typeCount = rI32();
  const classIds: number[] = [];
  for (let i = 0; i < typeCount; i++) {
    const classId = rI32();
    pos++; // isStripped
    rI16(); // scriptTypeIndex
    if (classId === 114) pos += 16;
    pos += 16;
    if (enableTypeTree) {
      const nc = rI32();
      const ss = rI32();
      pos += nc * 32 + ss;
      const dc = rI32();
      pos += dc * 4;
    }
    classIds.push(classId);
  }

  const objectCount = rI32();
  const objects: SerializedObject[] = [];
  for (let i = 0; i < objectCount; i++) {
    align4();
    const pathId = rI64();
    const byteStart = version >= 22 ? Number(rI64()) : rU32();
    const byteSize = rU32();
    const typeId = rI32();
    objects.push({
      pathId,
      offset: dataOffset + byteStart,
      size: byteSize,
      classId: classIds[typeId] ?? -1,
    });
  }

  return { unityVersion, objects };
}

function readUnityString(buf: Buffer, offset: number, limit: number): { str: string; next: number } {
  if (offset + 4 > limit) return { str: '', next: offset };
  const len = buf.readInt32LE(offset);
  if (len < 0 || offset + 4 + len > limit) return { str: '', next: offset + 4 };
  const str = buf.subarray(offset + 4, offset + 4 + len).toString('utf8');
  return { str, next: offset + 4 + ((len + 3) & ~3) };
}

// ============================================================================
// Pure-TS PNG Encoder (with CRC32 + node:zlib.deflateSync)
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePngRgba(width: number, height: number, rgbaTopDown: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowStride = width * 4;
  const raw = Buffer.allocUnsafe(height * (rowStride + 1));
  for (let y = 0; y < height; y++) {
    const dstOff = y * (rowStride + 1);
    raw[dstOff] = 0; // filter type None
    const srcOff = y * rowStride;
    raw.set(rgbaTopDown.subarray(srcOff, srcOff + rowStride), dstOff + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============================================================================
// Pure-TS Texture2D Decoders (RGBA32, RGB24, ARGB32, Alpha8, R8, DXT1, DXT5)
// ============================================================================

const TEXTURE_FORMAT_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Alpha8',
  3: 'RGB24',
  4: 'RGBA32',
  5: 'ARGB32',
  10: 'DXT1',
  12: 'DXT5',
  25: 'BC7',
  26: 'BC6H',
  63: 'R8',
};

function decodeRgb565(c: number): [number, number, number] {
  const r = (((c >>> 11) & 31) * 527 + 23) >> 6;
  const g = (((c >>> 5) & 63) * 259 + 33) >> 6;
  const b = ((c & 31) * 527 + 23) >> 6;
  return [r, g, b];
}

function flipRgbaVertical(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowBytes;
    out.set(src.subarray(srcRow, srcRow + rowBytes), y * rowBytes);
  }
  return out;
}

function decodeDxt1(raw: Buffer, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const bxCount = Math.max(1, Math.ceil(width / 4));
  const byCount = Math.max(1, Math.ceil(height / 4));
  let ptr = 0;

  const palette = new Uint8Array(16);

  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      if (ptr + 8 > raw.length) break;
      const c0 = raw.readUInt16LE(ptr);
      const c1 = raw.readUInt16LE(ptr + 2);
      const bits = raw.readUInt32LE(ptr + 4);
      ptr += 8;

      const [r0, g0, b0] = decodeRgb565(c0);
      const [r1, g1, b1] = decodeRgb565(c1);

      palette[0] = r0; palette[1] = g0; palette[2] = b0; palette[3] = 255;
      palette[4] = r1; palette[5] = g1; palette[6] = b1; palette[7] = 255;

      if (c0 > c1) {
        palette[8] = ((2 * r0 + r1) / 3) | 0;
        palette[9] = ((2 * g0 + g1) / 3) | 0;
        palette[10] = ((2 * b0 + b1) / 3) | 0;
        palette[11] = 255;
        palette[12] = ((r0 + 2 * r1) / 3) | 0;
        palette[13] = ((g0 + 2 * g1) / 3) | 0;
        palette[14] = ((b0 + 2 * b1) / 3) | 0;
        palette[15] = 255;
      } else {
        palette[8] = (r0 + r1) >> 1;
        palette[9] = (g0 + g1) >> 1;
        palette[10] = (b0 + b1) >> 1;
        palette[11] = 255;
        palette[12] = 0; palette[13] = 0; palette[14] = 0; palette[15] = 0;
      }

      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) continue;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) continue;
          const idx = ((bits >>> ((py * 4 + px) * 2)) & 3) * 4;
          const dst = (y * width + x) * 4;
          rgba[dst] = palette[idx];
          rgba[dst + 1] = palette[idx + 1];
          rgba[dst + 2] = palette[idx + 2];
          rgba[dst + 3] = palette[idx + 3];
        }
      }
    }
  }
  return flipRgbaVertical(rgba, width, height);
}

function decodeDxt5(raw: Buffer, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const bxCount = Math.max(1, Math.ceil(width / 4));
  const byCount = Math.max(1, Math.ceil(height / 4));
  let ptr = 0;

  const alphaPal = new Uint8Array(8);
  const colorPal = new Uint8Array(12);

  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      if (ptr + 16 > raw.length) break;
      const a0 = raw[ptr];
      const a1 = raw[ptr + 1];
      // 48-bit alpha lookup indices stored little-endian in bytes ptr+2..ptr+7
      const aLo = raw.readUInt32LE(ptr + 2);
      const aHi = raw.readUInt16LE(ptr + 6);

      alphaPal[0] = a0;
      alphaPal[1] = a1;
      if (a0 > a1) {
        alphaPal[2] = ((6 * a0 + 1 * a1) / 7) | 0;
        alphaPal[3] = ((5 * a0 + 2 * a1) / 7) | 0;
        alphaPal[4] = ((4 * a0 + 3 * a1) / 7) | 0;
        alphaPal[5] = ((3 * a0 + 4 * a1) / 7) | 0;
        alphaPal[6] = ((2 * a0 + 5 * a1) / 7) | 0;
        alphaPal[7] = ((1 * a0 + 6 * a1) / 7) | 0;
      } else {
        alphaPal[2] = ((4 * a0 + 1 * a1) / 5) | 0;
        alphaPal[3] = ((3 * a0 + 2 * a1) / 5) | 0;
        alphaPal[4] = ((2 * a0 + 3 * a1) / 5) | 0;
        alphaPal[5] = ((1 * a0 + 4 * a1) / 5) | 0;
        alphaPal[6] = 0;
        alphaPal[7] = 255;
      }

      const c0 = raw.readUInt16LE(ptr + 8);
      const c1 = raw.readUInt16LE(ptr + 10);
      const cBits = raw.readUInt32LE(ptr + 12);
      ptr += 16;

      const [r0, g0, b0] = decodeRgb565(c0);
      const [r1, g1, b1] = decodeRgb565(c1);
      colorPal[0] = r0; colorPal[1] = g0; colorPal[2] = b0;
      colorPal[3] = r1; colorPal[4] = g1; colorPal[5] = b1;
      colorPal[6] = ((2 * r0 + r1) / 3) | 0;
      colorPal[7] = ((2 * g0 + g1) / 3) | 0;
      colorPal[8] = ((2 * b0 + b1) / 3) | 0;
      colorPal[9] = ((r0 + 2 * r1) / 3) | 0;
      colorPal[10] = ((g0 + 2 * g1) / 3) | 0;
      colorPal[11] = ((b0 + 2 * b1) / 3) | 0;

      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) continue;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) continue;
          const pIdx = py * 4 + px;
          const bitPos = pIdx * 3;
          let aIdx: number;
          if (bitPos < 30) {
            aIdx = (aLo >>> bitPos) & 7;
          } else if (bitPos === 30) {
            aIdx = ((aLo >>> 30) | ((aHi & 1) << 2)) & 7;
          } else {
            aIdx = (aHi >>> (bitPos - 32)) & 7;
          }
          const cIdx = ((cBits >>> (pIdx * 2)) & 3) * 3;
          const dst = (y * width + x) * 4;
          rgba[dst] = colorPal[cIdx];
          rgba[dst + 1] = colorPal[cIdx + 1];
          rgba[dst + 2] = colorPal[cIdx + 2];
          rgba[dst + 3] = alphaPal[aIdx];
        }
      }
    }
  }
  return flipRgbaVertical(rgba, width, height);
}

function decodeTextureToRgba(format: number, raw: Buffer, width: number, height: number): Uint8Array | null {
  const pixelCount = width * height;
  if (format === 4) {
    // RGBA32
    if (raw.length < pixelCount * 4) return null;
    return flipRgbaVertical(raw.subarray(0, pixelCount * 4), width, height);
  }
  if (format === 5) {
    // ARGB32
    if (raw.length < pixelCount * 4) return null;
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const o = i * 4;
      rgba[o] = raw[o + 1];
      rgba[o + 1] = raw[o + 2];
      rgba[o + 2] = raw[o + 3];
      rgba[o + 3] = raw[o];
    }
    return flipRgbaVertical(rgba, width, height);
  }
  if (format === 3) {
    // RGB24
    if (raw.length < pixelCount * 3) return null;
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const s = i * 3;
      const d = i * 4;
      rgba[d] = raw[s];
      rgba[d + 1] = raw[s + 1];
      rgba[d + 2] = raw[s + 2];
      rgba[d + 3] = 255;
    }
    return flipRgbaVertical(rgba, width, height);
  }
  if (format === 1) {
    // Alpha8
    if (raw.length < pixelCount) return null;
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const d = i * 4;
      rgba[d] = 255;
      rgba[d + 1] = 255;
      rgba[d + 2] = 255;
      rgba[d + 3] = raw[i];
    }
    return flipRgbaVertical(rgba, width, height);
  }
  if (format === 63) {
    // R8
    if (raw.length < pixelCount) return null;
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const d = i * 4;
      const v = raw[i];
      rgba[d] = v;
      rgba[d + 1] = v;
      rgba[d + 2] = v;
      rgba[d + 3] = 255;
    }
    return flipRgbaVertical(rgba, width, height);
  }
  if (format === 10) {
    // DXT1 / BC1
    return decodeDxt1(raw, width, height);
  }
  if (format === 12) {
    // DXT5 / BC3
    return decodeDxt5(raw, width, height);
  }
  return null;
}

// ============================================================================
// Categorization, Safe Naming, Palette Extraction & WAV Writer
// ============================================================================

function sanitizeFileStem(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'unnamed';
}

function classifyTexture(name: string, width: number, height: number): TextureCategory {
  const lower = name.toLowerCase();
  if (/palette|lut|gradient|ramp|color/.test(lower) || (width <= 16 && height <= 16 && !/ui|btn|font/.test(lower))) {
    return 'palette';
  }
  if (/sdf|atlas|font|ui|button|panel|frame|crosshair|hud|cursor|glyph|badge|input|arrow|bar/.test(lower)) {
    return 'ui';
  }
  if (/particle|smoke|spark|flame|fire|glow|trail|ring|vfx|fx_|beam|slash|explosion|hit|shockwave/.test(lower)) {
    return 'vfx';
  }
  if (/fox|calcium|oofie|cl4nk|megachad|ogre|robinette|athena|birdo|bush|bandit|monke|noelle|tony|amog|spaceman|astro|ninja|vlad|dicehead|chadwell|roberto|skeleton|goblin|mummy|ghost|zombie|pharaoh|scorpion|slime|frog|hat/.test(lower)) {
    return width <= 64 && height <= 64 ? 'character' : 'character';
  }
  if (/terrain|grass|sand|rock|stone|bark|tree|leaf|water|lava|crypt|grave|floor|wall|tile|sky|cloud|wood|brick/.test(lower)) {
    return 'world';
  }
  if (width <= 64 && height <= 64) return 'icon';
  return 'world';
}

function extractHexPalette(rgba: Uint8Array, width: number, height: number, maxColors = 16): string[] {
  const counts = new Map<number, number>();
  const step = Math.max(1, Math.floor((width * height) / 4096));
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    const key = (rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([rgb]) => `#${rgb.toString(16).padStart(6, '0')}`);
  return sorted;
}

function classifyAudio(name: string, durationSec: number): AudioCategory {
  const lower = name.toLowerCase();
  if (durationSec >= 20 || /_loop|_intro|forest\d|desert\d|graveyard|boss.*theme|music|track|ambience/.test(lower)) {
    return 'music';
  }
  if (/click|hover|button|menu|ui|levelup|unlock|purchase|buy|chest|open|select|cancel|error/.test(lower)) {
    return 'ui';
  }
  return 'sfx';
}

const FSB5_MODES: Record<number, string> = {
  0: 'NONE',
  1: 'PCM8',
  2: 'PCM16',
  3: 'PCM24',
  4: 'PCM32',
  5: 'PCMFLOAT',
  6: 'GCADPCM',
  7: 'IMAADPCM',
  8: 'VAG',
  9: 'HEVAG',
  10: 'XMA',
  11: 'MPEG',
  12: 'CELT',
  13: 'AT9',
  14: 'XWMA',
  15: 'VORBIS',
  16: 'FADPCM',
};

function encodeWavPcm16(pcmData: Buffer, channels: number, sampleRate: number, bitsPerSample: number): Buffer {
  const blockAlign = channels * (bitsPerSample >> 3);
  const byteRate = sampleRate * blockAlign;
  const hdr = Buffer.allocUnsafe(44);
  hdr.write('RIFF', 0, 4, 'ascii');
  hdr.writeUInt32LE(36 + pcmData.length, 4);
  hdr.write('WAVE', 8, 4, 'ascii');
  hdr.write('fmt ', 12, 4, 'ascii');
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(bitsPerSample === 32 ? 3 : 1, 20); // 1=PCM, 3=IEEE Float
  hdr.writeUInt16LE(channels, 22);
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(byteRate, 28);
  hdr.writeUInt16LE(blockAlign, 32);
  hdr.writeUInt16LE(bitsPerSample, 34);
  hdr.write('data', 36, 4, 'ascii');
  hdr.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([hdr, pcmData]);
}

// ============================================================================
// Localization Extraction from UnityFS LZ4 Bundles
// ============================================================================

function extractLocalization(dataDir: string, outDir: string, skippedCodecs: Record<string, number>): {
  localization: Record<string, string>;
  localeBundlesFound: string[];
  tablesExtracted: number;
} {
  const localization: Record<string, string> = {};
  const localeBundlesFound: string[] = [];
  let tablesExtracted = 0;

  const aaDir = path.join(dataDir, 'StreamingAssets', 'aa', 'StandaloneWindows64');
  if (!fs.existsSync(aaDir)) {
    return { localization, localeBundlesFound, tablesExtracted };
  }

  for (const f of fs.readdirSync(aaDir)) {
    if (f.endsWith('.bundle')) localeBundlesFound.push(f);
  }

  const sharedPath = path.join(aaDir, 'localization-assets-shared_assets_all.bundle');
  const enPath = path.join(aaDir, 'localization-string-tables-english(en)_assets_all.bundle');
  if (!fs.existsSync(sharedPath) || !fs.existsSync(enPath)) {
    return { localization, localeBundlesFound, tablesExtracted };
  }

  try {
    const sharedNodes = parseUnityFSBundle(readFileReadOnly(sharedPath));
    const sharedByPathId = new Map<bigint, { tableName: string; idToKey: Map<bigint, string> }>();

    for (const node of sharedNodes) {
      const sf = parseSerializedFile(node.buf);
      for (const obj of sf.objects) {
        if (obj.classId !== 114) continue;
        try {
          let p = obj.offset + 28;
          const end = obj.offset + obj.size;
          const mName = readUnityString(node.buf, p, end); p = mName.next;
          const tableNameR = readUnityString(node.buf, p, end); p = tableNameR.next;
          const guidR = readUnityString(node.buf, p, end); p = guidR.next;
          if (p + 4 > end) continue;
          const cnt = node.buf.readInt32LE(p); p += 4;
          const idToKey = new Map<bigint, string>();
          for (let i = 0; i < cnt && p + 12 <= end; i++) {
            const id = node.buf.readBigInt64LE(p); p += 8;
            const keyR = readUnityString(node.buf, p, end); p = keyR.next;
            if (p + 4 > end) break;
            const mCnt = node.buf.readInt32LE(p); p += 4 + mCnt * 8;
            idToKey.set(id, keyR.str);
          }
          sharedByPathId.set(obj.pathId, { tableName: tableNameR.str, idToKey });
        } catch {
          // ignore non-table objects
        }
      }
    }

    const enNodes = parseUnityFSBundle(readFileReadOnly(enPath));
    const tablesDump: Record<string, Record<string, string>> = {};

    for (const node of enNodes) {
      const sf = parseSerializedFile(node.buf);
      for (const obj of sf.objects) {
        if (obj.classId !== 114) continue;
        try {
          let p = obj.offset + 28;
          const end = obj.offset + obj.size;
          const mName = readUnityString(node.buf, p, end); p = mName.next;
          const localeR = readUnityString(node.buf, p, end); p = localeR.next;
          if (localeR.str !== 'en') continue;
          p += 4; // sharedData fileID
          const sharedPathId = node.buf.readBigInt64LE(p); p += 8;
          const shared = sharedByPathId.get(sharedPathId);
          const tblMetaCnt = node.buf.readInt32LE(p); p += 4 + tblMetaCnt * 8;
          const entryCount = node.buf.readInt32LE(p); p += 4;
          const tableName = shared?.tableName ?? mName.str.replace(/_en$/, '');
          const tableEntries: Record<string, string> = {};
          for (let i = 0; i < entryCount && p + 12 <= end; i++) {
            const keyId = node.buf.readBigInt64LE(p); p += 8;
            const valR = readUnityString(node.buf, p, end); p = valR.next;
            if (p + 4 > end) break;
            const eMetaCnt = node.buf.readInt32LE(p); p += 4 + eMetaCnt * 8;
            const keyName = shared?.idToKey.get(keyId) ?? keyId.toString();
            tableEntries[keyName] = valR.str;
            localization[`${tableName}.${keyName}`] = valR.str;
          }
          tablesDump[tableName] = tableEntries;
          tablesExtracted++;
        } catch {
          // ignore non-StringTable MonoBehaviours
        }
      }
    }

    const locDir = path.join(outDir, 'localization');
    fs.mkdirSync(locDir, { recursive: true });
    fs.writeFileSync(path.join(locDir, 'en.json'), JSON.stringify(tablesDump, null, 2) + '\n', 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[extract-assets] Skipped localization bundle due to error: ${msg}`);
    skippedCodecs['UnityFS-Localization'] = (skippedCodecs['UnityFS-Localization'] ?? 0) + 1;
  }

  return { localization, localeBundlesFound, tablesExtracted };
}

// ============================================================================
// Main Asset Extraction Pipeline
// ============================================================================

function main(): void {
  const opts = parseCliArgs(process.argv.slice(2));
  const dataDir = resolveRetailDataDir(opts.retailDir);

  if (!dataDir) {
    console.log(
      `[extract-assets] Retail directory not found at "${opts.retailDir}". Skipping cleanly (set KRUNKEDBONK_RETAIL_DIR or --retail to run against local retail install).`
    );
    process.exit(0);
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  const skippedCodecs: Record<string, number> = {};
  const textures: Record<string, PackTextureEntry> = {};
  const audio: Record<string, PackAudioEntry> = {};
  const palettes: Record<string, PackPaletteEntry> = {};
  const audioCatalog: AudioCatalogEntry[] = [];

  // 1. Extract localization from UnityFS LZ4 bundles
  const locResult = extractLocalization(dataDir, opts.outDir, skippedCodecs);

  // 2. Open streamed .resS / .resource file descriptors lazily & strictly read-only
  const openFds = new Map<string, { fd: number; size: number }>();
  const getStreamFd = (relName: string): { fd: number; size: number } | null => {
    const base = path.basename(relName);
    if (openFds.has(base)) return openFds.get(base) ?? null;
    const full = path.join(dataDir, base);
    if (!fs.existsSync(full)) return null;
    const fd = fs.openSync(full, 'r');
    const st = fs.fstatSync(fd);
    const rec = { fd, size: st.size };
    openFds.set(base, rec);
    return rec;
  };

  const assetFiles = [
    'globalgamemanagers.assets',
    'resources.assets',
    'sharedassets0.assets',
    'sharedassets1.assets',
    'sharedassets2.assets',
    'sharedassets4.assets',
  ];

  let texturesScanned = 0;
  let texturesExtracted = 0;
  let audioScanned = 0;
  let audioWavExtracted = 0;
  let unityVersion = 'unknown';

  const usedTexturePaths = new Set<string>();
  const usedTextureIds = new Set<string>();
  const usedAudioIds = new Set<string>();

  try {
    for (const assetFile of assetFiles) {
      const fullPath = path.join(dataDir, assetFile);
      if (!fs.existsSync(fullPath)) continue;

      const buf = readFileReadOnly(fullPath);
      const sf = parseSerializedFile(buf);
      if (unityVersion === 'unknown' && sf.unityVersion) unityVersion = sf.unityVersion;

      for (const obj of sf.objects) {
        // ---- Texture2D (classID 28) ----
        if (obj.classId === 28) {
          texturesScanned++;
          try {
            const end = obj.offset + obj.size;
            const nameR = readUnityString(buf, obj.offset, end);
            const base = nameR.next;
            if (base + 0x6c > end) {
              skippedCodecs['Texture2D-TruncatedHeader'] = (skippedCodecs['Texture2D-TruncatedHeader'] ?? 0) + 1;
              continue;
            }

            const width = buf.readInt32LE(base + 0x04);
            const height = buf.readInt32LE(base + 0x08);
            const completeImageSize = buf.readInt32LE(base + 0x0c);
            const texFormat = buf.readInt32LE(base + 0x14);
            const inlineImageSize = buf.readInt32LE(base + 0x54);

            const fmtName = TEXTURE_FORMAT_NAMES[texFormat] ?? `Format_${texFormat}`;

            if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
              skippedCodecs[`Texture2D-${fmtName}-EmptyOrOversized`] =
                (skippedCodecs[`Texture2D-${fmtName}-EmptyOrOversized`] ?? 0) + 1;
              continue;
            }

            let rawPixels: Buffer | null = null;
            if (inlineImageSize > 0 && base + 0x58 + inlineImageSize <= end) {
              rawPixels = buf.subarray(base + 0x58, base + 0x58 + inlineImageSize);
            } else {
              // StreamedInfo follows inline byte array (aligned to 4 bytes after empty inline array)
              const streamOffPos = base + 0x58 + ((inlineImageSize + 3) & ~3);
              // Note: verify offset alignment: in Unity 2023.2, after image_data (len=0 at +0x54), m_StreamData starts at +0x5c?
              // Checked in hex dump: +0x54=00000000 (image_data len=0), +0x58=00000000 (pad/offset?), +0x5c=uint64 offset, +0x64=uint32 size, +0x68=string path!
              // Let's handle both +0x58 and +0x5c cleanly by checking streamPath string length sanity.
              let sOff = 0;
              let sSize = 0;
              let sPath = '';
              if (streamOffPos + 20 <= end) {
                // Standard Unity 2023.2 StreamingInfo (uint64 offset at +0x5c, uint32 size at +0x64, string path at +0x68)
                const candPathAt68 = readUnityString(buf, base + 0x68, end);
                if (candPathAt68.str.includes('.resS')) {
                  sOff = Number(buf.readBigUInt64LE(base + 0x5c));
                  sSize = buf.readUInt32LE(base + 0x64);
                  sPath = candPathAt68.str;
                } else {
                  const candPathAt64 = readUnityString(buf, streamOffPos + 12, end);
                  if (candPathAt64.str.includes('.resS')) {
                    sOff = Number(buf.readBigUInt64LE(streamOffPos));
                    sSize = buf.readUInt32LE(streamOffPos + 8);
                    sPath = candPathAt64.str;
                  }
                }
              }

              if (sPath && sSize > 0) {
                const streamFd = getStreamFd(sPath);
                if (streamFd && sOff + sSize <= streamFd.size) {
                  // Only need top mip level bytes for decoding
                  const topMipNeed =
                    texFormat === 4 || texFormat === 5
                      ? width * height * 4
                      : texFormat === 3
                        ? width * height * 3
                        : texFormat === 1 || texFormat === 63
                          ? width * height
                          : texFormat === 10
                            ? Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 8
                            : texFormat === 12
                              ? Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 16
                              : sSize;
                  rawPixels = readSliceReadOnly(streamFd.fd, sOff, Math.min(sSize, Math.max(topMipNeed, 16)));
                }
              }
            }

            if (!rawPixels || rawPixels.length === 0) {
              skippedCodecs[`Texture2D-${fmtName}-NoPixelData`] =
                (skippedCodecs[`Texture2D-${fmtName}-NoPixelData`] ?? 0) + 1;
              continue;
            }

            // Skip giant SDF font atlases (>512px Alpha8) cleanly to keep extraction fast & focused
            if (texFormat === 1 && (width > 512 || height > 512) && /sdf|atlas|noto|roboto|liberation/i.test(nameR.str)) {
              skippedCodecs['Texture2D-Alpha8-FontAtlasSkipped'] =
                (skippedCodecs['Texture2D-Alpha8-FontAtlasSkipped'] ?? 0) + 1;
              continue;
            }

            const rgba = decodeTextureToRgba(texFormat, rawPixels, width, height);
            if (!rgba) {
              skippedCodecs[`Texture2D-${fmtName}`] = (skippedCodecs[`Texture2D-${fmtName}`] ?? 0) + 1;
              continue;
            }

            const category = classifyTexture(nameR.str, width, height);
            const stem = sanitizeFileStem(nameR.str);
            let relPngPath = `textures/${category}/${stem}.png`;
            if (usedTexturePaths.has(relPngPath.toLowerCase())) {
              const suffix = crypto.createHash('sha1').update(`${assetFile}#${obj.pathId.toString()}`).digest('hex').slice(0, 6);
              relPngPath = `textures/${category}/${stem}_${suffix}.png`;
            }
            usedTexturePaths.add(relPngPath.toLowerCase());

            const absPngPath = path.join(opts.outDir, relPngPath);
            fs.mkdirSync(path.dirname(absPngPath), { recursive: true });
            const pngBytes = encodePngRgba(width, height, rgba);
            fs.writeFileSync(absPngPath, pngBytes);

            let texId = stem;
            if (usedTextureIds.has(texId)) {
              texId = `${stem}_${obj.pathId.toString().slice(-4)}`;
            }
            usedTextureIds.add(texId);

            textures[texId] = {
              id: texId,
              path: relPngPath,
              width,
              height,
              format: fmtName,
              category,
            };
            texturesExtracted++;

            // Extract color palette for palette/character/icon textures (small crisp pixel art!)
            if (
              (category === 'palette' || (category === 'character' && width <= 64 && height <= 64)) &&
              texFormat !== 1
            ) {
              const colors = extractHexPalette(rgba, width, height, 16);
              if (colors.length >= 2) {
                palettes[texId] = {
                  id: texId,
                  colors,
                  sourcePath: relPngPath,
                };
              }
            }
            void completeImageSize;
          } catch {
            skippedCodecs['Texture2D-ParseError'] = (skippedCodecs['Texture2D-ParseError'] ?? 0) + 1;
          }
        }

        // ---- AudioClip (classID 83) ----
        if (obj.classId === 83) {
          audioScanned++;
          try {
            const end = obj.offset + obj.size;
            let p = obj.offset;
            const nameR = readUnityString(buf, p, end); p = nameR.next;
            if (p + 36 > end) continue;
            p += 4; // m_LoadType
            const channels = buf.readInt32LE(p); p += 4;
            const frequency = buf.readInt32LE(p); p += 4;
            const bitsPerSample = buf.readInt32LE(p); p += 4;
            const durationSec = Math.round(buf.readFloatLE(p) * 1000) / 1000; p += 4;
            p += 4; // m_IsTrackerFormat + align
            p += 4; // m_SubsoundIndex
            p += 4; // m_PreloadAudioData, m_LoadInBackground, m_Legacy3D + align
            const srcR = readUnityString(buf, p, end); p = srcR.next;
            if (p + 20 > end) continue;
            const resOffset = Number(buf.readBigUInt64LE(p)); p += 8;
            const resSize = Number(buf.readBigUInt64LE(p)); p += 8;
            const compressionFormat = buf.readInt32LE(p);

            let fsb5Codec = 'UNKNOWN';
            let extractedWavPath: string | undefined;
            const category = classifyAudio(nameR.str, durationSec);

            const resFd = srcR.str ? getStreamFd(srcR.str) : null;
            if (resFd && resSize >= 60 && resOffset + resSize <= resFd.size) {
              const hdr = readSliceReadOnly(resFd.fd, resOffset, 60);
              const sig = hdr.subarray(0, 4).toString('ascii');
              if (sig === 'FSB5') {
                const mode = hdr.readUInt32LE(24);
                fsb5Codec = `FSB5-${FSB5_MODES[mode] ?? `Mode${mode}`}`;
                const sampleHeadersSize = hdr.readUInt32LE(12);
                const nameTableSize = hdr.readUInt32LE(16);
                const dataSize = hdr.readUInt32LE(20);
                const dataStart = resOffset + 60 + sampleHeadersSize + nameTableSize;

                // If uncompressed PCM16 / PCMFLOAT, wrap cleanly as playable .wav!
                if ((mode === 2 || mode === 5) && dataSize > 0 && dataStart + dataSize <= resFd.size) {
                  const pcm = readSliceReadOnly(resFd.fd, dataStart, dataSize);
                  const wav = encodeWavPcm16(pcm, Math.max(1, channels), Math.max(8000, frequency), mode === 5 ? 32 : 16);
                  const stem = sanitizeFileStem(nameR.str);
                  const relWav = `audio/${category}/${stem}.wav`;
                  const absWav = path.join(opts.outDir, relWav);
                  fs.mkdirSync(path.dirname(absWav), { recursive: true });
                  fs.writeFileSync(absWav, wav);
                  extractedWavPath = relWav;
                  audioWavExtracted++;
                } else {
                  skippedCodecs[fsb5Codec] = (skippedCodecs[fsb5Codec] ?? 0) + 1;
                }
              } else {
                fsb5Codec = `NonFSB5-${sig.replace(/[^a-zA-Z0-9]/g, '') || 'Raw'}`;
                skippedCodecs[fsb5Codec] = (skippedCodecs[fsb5Codec] ?? 0) + 1;
              }
            } else {
              skippedCodecs['AudioClip-NoStream'] = (skippedCodecs['AudioClip-NoStream'] ?? 0) + 1;
            }

            let audioId = sanitizeFileStem(nameR.str);
            if (usedAudioIds.has(audioId)) {
              audioId = `${audioId}_${obj.pathId.toString().slice(-4)}`;
            }
            usedAudioIds.add(audioId);

            audioCatalog.push({
              id: audioId,
              name: nameR.str,
              category,
              channels,
              frequency,
              bitsPerSample,
              durationSec,
              compressionFormat,
              fsb5Codec,
              sourceResource: path.basename(srcR.str),
              byteOffset: resOffset,
              byteSize: resSize,
              extractedWavPath,
            });

            if (extractedWavPath) {
              audio[audioId] = {
                id: audioId,
                path: extractedWavPath,
                category,
                durationSec,
                format: 'wav',
              };
            }
          } catch {
            skippedCodecs['AudioClip-ParseError'] = (skippedCodecs['AudioClip-ParseError'] ?? 0) + 1;
          }
        }
      }
    }
  } finally {
    for (const { fd } of openFds.values()) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }

  // 3. Write audio metadata catalog
  const audioDir = path.join(opts.outDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(
    path.join(audioDir, 'catalog.json'),
    JSON.stringify({ totalClips: audioCatalog.length, extractedWavCount: audioWavExtracted, clips: audioCatalog }, null, 2) + '\n',
    'utf8'
  );

  // 4. Write valid PackManifest (`manifest.json`)
  const manifest: PackManifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceVerified: true,
    baseUrl: '/__custom_pack__/',
    textures,
    audio,
    localization: locResult.localization,
    palettes,
    skippedCodecs,
    oracleSummary: {
      unityVersion,
      texturesScanned,
      texturesExtracted,
      palettesExtracted: Object.keys(palettes).length,
      localizationTablesExtracted: locResult.tablesExtracted,
      localizationStringsExtracted: Object.keys(locResult.localization).length,
      localeBundlesAvailable: locResult.localeBundlesFound.length,
      audioClipsIndexed: audioCatalog.length,
      audioWavExtracted,
      audioCatalogPath: 'audio/catalog.json',
    },
  };

  const manifestPath = path.join(opts.outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`[extract-assets] Wrote PackManifest -> ${manifestPath}`);
  console.log(
    `[extract-assets] Extracted ${texturesExtracted}/${texturesScanned} textures (PNG), ` +
      `${Object.keys(palettes).length} palettes, ${Object.keys(locResult.localization).length} localization strings (${locResult.tablesExtracted} tables), ` +
      `${audioWavExtracted} WAV clips + ${audioCatalog.length} audio metadata entries.`
  );
  if (Object.keys(skippedCodecs).length > 0) {
    console.log(`[extract-assets] Skipped unsupported/filtered codecs cleanly: ${JSON.stringify(skippedCodecs)}`);
  }
}

main();
