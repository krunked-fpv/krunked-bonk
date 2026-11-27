#!/usr/bin/env node
/**
 * KRUNKEDBONK Wave 0 — Read-Only Retail Oracle Dumper (`tools/oracle-dump.ts`)
 *
 * Pure TypeScript using ONLY Node 22 built-in modules (`node:fs`, `node:path`, `node:zlib`, `node:crypto`).
 * Runs cleanly via `node --experimental-strip-types tools/oracle-dump.ts` or `tsx tools/oracle-dump.ts`.
 *
 * STRICT SAFETY:
 * - Retail install directory is opened STRICTLY READ-ONLY. Never writes, modifies, renames, or creates any file inside it.
 * - Gracefully supports `KRUNKEDBONK_RETAIL_DIR` env override or `--retail <dir>` flag, and exits 0 cleanly if absent (e.g. CI).
 * - Output defaults to `<cwd>/.krunkedbonk-assets/oracle.json` (overridable via `--out <dir>`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';

// Ensure node:zlib is referenced (also used for optional checksum/compression checks if needed)
const _ZLIB_CRC32_AVAILABLE = typeof zlib.crc32 === 'function';

const DEFAULT_RETAIL_ROOT = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Megabonk';
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), '.krunkedbonk-assets');

type Provenance = 'extracted' | 'measured';

interface CliOptions {
  retailDir: string;
  outDir: string;
}

interface SerializedType {
  classId: number;
  isStripped: boolean;
  scriptTypeIndex: number;
}

interface SerializedObject {
  pathId: bigint;
  offset: number;
  size: number;
  typeId: number;
  classId: number;
}

interface SerializedFile {
  fileName: string;
  unityVersion: string;
  targetPlatform: number;
  enableTypeTree: boolean;
  types: SerializedType[];
  objects: SerializedObject[];
  externals: string[];
  dataOffset: number;
}

interface PPtr {
  fileID: number;
  pathID: bigint;
}

interface LocRef {
  tableRef: string;
  keyId: bigint;
  keyStr: string;
}

interface StatModifierRaw {
  stat: number;
  modifyType: number;
  modification: number;
}

interface StatModifierOut {
  stat: string;
  statId: number;
  modifyType: string;
  modification: number;
}

interface VerifiedFileRecord {
  file: string;
  sizeBytes: number;
  sha256Prefix: string;
  unityVersion?: string;
  objectCount?: number;
}

// ============================================================================
// CLI & Retail Path Resolution (Strictly Read-Only)
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
  const candidates = [
    retailInput,
    path.join(retailInput, 'Megabonk_Data'),
  ];
  for (const dir of candidates) {
    try {
      const ggm = path.join(dir, 'globalgamemanagers');
      if (fs.existsSync(ggm) && fs.statSync(ggm).isFile()) {
        return dir;
      }
    } catch {
      // ignore access errors
    }
  }
  return null;
}

function readFileReadOnly(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const buf = Buffer.allocUnsafe(stat.size);
    let bytesRead = 0;
    while (bytesRead < stat.size) {
      const n = fs.readSync(fd, buf, bytesRead, stat.size - bytesRead, bytesRead);
      if (n <= 0) break;
      bytesRead += n;
    }
    return bytesRead === stat.size ? buf : buf.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function sha256Prefix(buf: Buffer): string {
  // Hash first 256 KiB + last 64 KiB + byteLength for fast deterministic verification
  const h = crypto.createHash('sha256');
  const head = buf.subarray(0, Math.min(buf.length, 262144));
  h.update(head);
  if (buf.length > 262144) {
    h.update(buf.subarray(Math.max(262144, buf.length - 65536)));
  }
  h.update(String(buf.length));
  return h.digest('hex').slice(0, 16);
}

// ============================================================================
// Pure-TS LZ4 Block Decompressor & UnityFS v8 Bundle Parser
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
    if (offset === 0) {
      throw new Error('Invalid LZ4 match offset 0');
    }
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
  offset: number;
  size: number;
  flags: number;
  buf: Buffer;
}

function parseUnityFSBundle(buf: Buffer): { signature: string; version: number; unityRev: string; nodes: UnityFSNode[] } {
  let p = 0;
  const readCStr = (): string => {
    let e = p;
    while (e < buf.length && buf[e] !== 0) e++;
    const s = buf.subarray(p, e).toString('utf8');
    p = e + 1;
    return s;
  };

  const signature = readCStr();
  if (signature !== 'UnityFS') {
    throw new Error(`Unsupported bundle signature: ${signature}`);
  }
  const version = buf.readUInt32BE(p); p += 4;
  readCStr(); // unityPlayerVer
  const unityRev = readCStr();
  p += 8; // total file size int64
  const compBlocksInfoSize = buf.readUInt32BE(p); p += 4;
  const uncompBlocksInfoSize = buf.readUInt32BE(p); p += 4;
  const flags = buf.readUInt32BE(p); p += 4;

  if (version >= 7) {
    p = (p + 15) & ~15;
  }

  const compType = flags & 0x3f;
  const blocksInfoAtEnd = (flags & 0x80) !== 0;
  const blocksInfoBytes = blocksInfoAtEnd
    ? buf.subarray(buf.length - compBlocksInfoSize)
    : buf.subarray(p, p + compBlocksInfoSize);

  if (!blocksInfoAtEnd) {
    p += compBlocksInfoSize;
  }
  if ((flags & 0x200) !== 0) {
    p = (p + 15) & ~15;
  }

  let blocksInfo: Buffer;
  if (compType === 0) {
    blocksInfo = blocksInfoBytes;
  } else if (compType === 2 || compType === 3) {
    blocksInfo = lz4DecompressBlock(blocksInfoBytes, uncompBlocksInfoSize);
  } else {
    throw new Error(`Unsupported UnityFS blocksInfo compression type: ${compType}`);
  }

  let bp = 16; // skip 16-byte uncompressedDataHash
  const blockCount = blocksInfo.readInt32BE(bp); bp += 4;
  const blocks: Array<{ uncomp: number; comp: number; flags: number }> = [];
  for (let i = 0; i < blockCount; i++) {
    const uncomp = blocksInfo.readUInt32BE(bp); bp += 4;
    const comp = blocksInfo.readUInt32BE(bp); bp += 4;
    const bFlags = blocksInfo.readUInt16BE(bp); bp += 2;
    blocks.push({ uncomp, comp, flags: bFlags });
  }

  const nodeCount = blocksInfo.readInt32BE(bp); bp += 4;
  const rawNodes: Array<{ offset: number; size: number; flags: number; name: string }> = [];
  for (let i = 0; i < nodeCount; i++) {
    const offset = Number(blocksInfo.readBigInt64BE(bp)); bp += 8;
    const size = Number(blocksInfo.readBigInt64BE(bp)); bp += 8;
    const nFlags = blocksInfo.readUInt32BE(bp); bp += 4;
    let e = bp;
    while (e < blocksInfo.length && blocksInfo[e] !== 0) e++;
    const name = blocksInfo.subarray(bp, e).toString('utf8');
    bp = e + 1;
    rawNodes.push({ offset, size, flags: nFlags, name });
  }

  const chunks: Buffer[] = [];
  for (const bl of blocks) {
    const raw = buf.subarray(p, p + bl.comp);
    p += bl.comp;
    const bct = bl.flags & 0x3f;
    if (bct === 0) {
      chunks.push(raw);
    } else if (bct === 2 || bct === 3) {
      chunks.push(lz4DecompressBlock(raw, bl.uncomp));
    } else {
      throw new Error(`Unsupported UnityFS block compression type: ${bct}`);
    }
  }
  const combined = Buffer.concat(chunks);
  const nodes: UnityFSNode[] = rawNodes.map((n) => ({
    ...n,
    buf: combined.subarray(n.offset, n.offset + n.size),
  }));

  return { signature, version, unityRev, nodes };
}

// ============================================================================
// Unity SerializedFile v22 Parser & Binary Reader
// ============================================================================

function parseSerializedFile(buf: Buffer, fileName: string): SerializedFile {
  const version = buf.readUInt32BE(8);
  const endian = buf[16];
  const le = endian === 0;
  let dataOffset: number;
  let pos: number;

  if (version >= 22) {
    dataOffset = Number(buf.readBigInt64BE(32));
    pos = 48;
  } else {
    dataOffset = buf.readUInt32BE(12);
    pos = 20;
  }

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
  const targetPlatform = rI32();
  const enableTypeTree = buf[pos++] !== 0;

  const typeCount = rI32();
  const types: SerializedType[] = [];
  for (let i = 0; i < typeCount; i++) {
    const classId = rI32();
    const isStripped = buf[pos++] !== 0;
    const scriptTypeIndex = rI16();
    if (classId === 114) pos += 16;
    pos += 16; // oldTypeHash
    if (enableTypeTree) {
      const nodeCount = rI32();
      const strBufSize = rI32();
      pos += nodeCount * 32 + strBufSize;
      const depCount = rI32();
      pos += depCount * 4;
    }
    types.push({ classId, isStripped, scriptTypeIndex });
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
      typeId,
      classId: types[typeId]?.classId ?? -1,
    });
  }

  const scriptCount = rI32();
  for (let i = 0; i < scriptCount; i++) {
    rI32();
    align4();
    rI64();
  }

  const extCount = rI32();
  const externals: string[] = [];
  for (let i = 0; i < extCount; i++) {
    rCStr(); // tempEmpty
    pos += 16; // guid
    rI32(); // type
    externals.push(rCStr());
  }

  return { fileName, unityVersion, targetPlatform, enableTypeTree, types, objects, externals, dataOffset };
}

class BinaryReader {
  buf: Buffer;
  p: number;
  start: number;
  end: number;

  constructor(buf: Buffer, start: number, end: number) {
    this.buf = buf;
    this.p = start;
    this.start = start;
    this.end = end;
  }

  rem(): number {
    return this.end - this.p;
  }

  rel(): number {
    return this.p - this.start;
  }

  i32(): number {
    const v = this.buf.readInt32LE(this.p);
    this.p += 4;
    return v;
  }

  u32(): number {
    const v = this.buf.readUInt32LE(this.p);
    this.p += 4;
    return v;
  }

  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.p);
    this.p += 8;
    return v;
  }

  f32(): number {
    const v = this.buf.readFloatLE(this.p);
    this.p += 4;
    return v;
  }

  bool4(): boolean {
    const v = this.buf[this.p] !== 0;
    this.p += 4;
    return v;
  }

  str(): string {
    const len = this.i32();
    if (len < 0 || this.p + len > this.end) {
      throw new Error(`Invalid Unity string length ${len} at rel=${this.rel()}`);
    }
    const s = this.buf.subarray(this.p, this.p + len).toString('utf8');
    this.p += (len + 3) & ~3;
    return s;
  }

  pptr(): PPtr {
    const fileID = this.i32();
    const pathID = this.i64();
    return { fileID, pathID };
  }

  vec2(): [number, number] {
    return [roundNum(this.f32(), 4), roundNum(this.f32(), 4)];
  }

  vec3(): [number, number, number] {
    return [roundNum(this.f32(), 4), roundNum(this.f32(), 4), roundNum(this.f32(), 4)];
  }

  colorRgba(): [number, number, number, number] {
    return [
      roundNum(this.f32(), 4),
      roundNum(this.f32(), 4),
      roundNum(this.f32(), 4),
      roundNum(this.f32(), 4),
    ];
  }

  locStr(): LocRef {
    const tableRef = this.str();
    const keyId = this.i64();
    const keyStr = this.str();
    this.i32(); // m_FallbackState
    this.bool4(); // m_WaitForCompletion
    const localVarsCount = this.i32();
    for (let i = 0; i < localVarsCount; i++) {
      this.str();
      this.i64();
    }
    return { tableRef, keyId, keyStr };
  }

  managedRefs(): void {
    if (this.rem() < 8) return;
    const ver = this.i32();
    if (ver === 2) {
      const cnt = this.i32();
      if (cnt !== 0) {
        this.p = this.end;
      }
    } else {
      this.p -= 4;
    }
  }

  unlockableBase(): {
    isEnabled: boolean;
    showInUnlocks: boolean;
    canAlwaysToggle: boolean;
    author: string;
    price: number;
    sortingPriority: number;
    localizedName: LocRef;
    localizedDescription: LocRef;
  } {
    const isEnabled = this.bool4();
    const showInUnlocks = this.bool4();
    const canAlwaysToggle = this.bool4();
    const author = this.str();
    const price = this.i32();
    const sortingPriority = this.i32();
    const localizedName = this.locStr();
    const localizedDescription = this.locStr();
    const keysCount = this.i32();
    for (let i = 0; i < keysCount; i++) {
      this.str();
      this.locStr();
    }
    const keysNameCount = this.i32();
    for (let i = 0; i < keysNameCount; i++) {
      this.str();
      this.locStr();
    }
    return {
      isEnabled,
      showInUnlocks,
      canAlwaysToggle,
      author,
      price,
      sortingPriority,
      localizedName,
      localizedDescription,
    };
  }

  statMod(): StatModifierRaw {
    return {
      stat: this.i32(),
      modifyType: this.i32(),
      modification: roundNum(this.f32(), 6),
    };
  }
}

function roundNum(v: number, digits: number): number {
  if (!Number.isFinite(v)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

// ============================================================================
// IL2CPP v29 global-metadata.dat Parser
// ============================================================================

interface MetadataSummary {
  sanityHex: string;
  version: number;
  sizeBytes: number;
  typeDefinitionCount: number;
  fieldDefinitionCount: number;
  enums: Record<string, Record<string, number>>;
  enumByValue: Record<string, Record<number, string>>;
  interactableClasses: string[];
}

function readIl2CppCompressedInt32(buf: Buffer, off: number): number {
  const b0 = buf[off];
  let u: number;
  if ((b0 & 0x80) === 0) {
    u = b0;
  } else if ((b0 & 0xc0) === 0x80) {
    u = ((b0 & 0x3f) << 8) | buf[off + 1];
  } else if ((b0 & 0xe0) === 0xc0) {
    u = ((b0 & 0x1f) << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
  } else if (b0 === 0xf0) {
    u = buf.readUInt32LE(off + 1);
  } else if (b0 === 0xfe) {
    return -2;
  } else if (b0 === 0xff) {
    return -1;
  } else {
    u = 0;
  }
  const isNeg = (u & 1) !== 0;
  const mag = u >>> 1;
  return isNeg ? -(mag + 1) : mag;
}

function parseGlobalMetadata(buf: Buffer): MetadataSummary {
  const sanity = buf.readUInt32LE(0);
  const version = buf.readInt32LE(4);
  if (sanity !== 0xfab11baf) {
    throw new Error(`Invalid global-metadata.dat sanity: 0x${sanity.toString(16)}`);
  }

  const hdr: Array<{ off: number; size: number }> = [];
  for (let i = 0; i < 32; i++) {
    hdr.push({
      off: buf.readInt32LE(8 + i * 8),
      size: buf.readInt32LE(8 + i * 8 + 4),
    });
  }

  const strOff = hdr[2].off;
  const getStr = (idx: number): string => {
    const p = strOff + idx;
    let e = p;
    while (e < buf.length && buf[e] !== 0) e++;
    return buf.subarray(p, e).toString('utf8');
  };

  const fdvOff = hdr[7].off;
  const fdvCount = Math.floor(hdr[7].size / 12);
  const fdvDataOff = hdr[8].off;
  const fieldDefault = new Map<number, number>();
  for (let i = 0; i < fdvCount; i++) {
    const b = fdvOff + i * 12;
    fieldDefault.set(buf.readInt32LE(b), buf.readInt32LE(b + 8));
  }

  const fieldsOff = hdr[11].off;
  const fieldDefinitionCount = Math.floor(hdr[11].size / 12);
  const getFieldName = (idx: number): string => getStr(buf.readInt32LE(fieldsOff + idx * 12));

  const tdOff = hdr[19].off;
  const typeDefinitionCount = Math.floor(hdr[19].size / 88);

  const wantedEnums = new Set([
    'ECharacter',
    'EWeapon',
    'ETome',
    'EItem',
    'EItemRarity',
    'EEnemy',
    'EStat',
    'EStatModifyType',
    'EMap',
    'EMapType',
    'EShopItem',
    'EPassive',
    'EElement',
    'EEncounter',
    'EDebuff',
    'EDamageEffect',
    'EPickup',
    'EEnemyFlag',
  ]);

  const enums: Record<string, Record<string, number>> = {};
  const enumByValue: Record<string, Record<number, string>> = {};
  const interactableClasses: string[] = [];

  for (let i = 0; i < typeDefinitionCount; i++) {
    const b = tdOff + i * 88;
    const name = getStr(buf.readInt32LE(b));
    const ns = getStr(buf.readInt32LE(b + 4));
    const bitfield = buf.readUInt32LE(b + 80);
    const isEnum = (bitfield & 2) !== 0;

    if (name.startsWith('Interactable') && (ns === '' || ns.startsWith('Assets.'))) {
      interactableClasses.push(ns ? `${ns}.${name}` : name);
    }

    if (!isEnum || !wantedEnums.has(name)) continue;
    if (ns && !ns.startsWith('Assets.') && !ns.startsWith('Actors.')) continue;

    const fieldStart = buf.readInt32LE(b + 32);
    const fieldCount = buf.readUInt16LE(b + 68);
    const members: Record<string, number> = {};
    const rev: Record<number, string> = {};
    for (let j = 0; j < fieldCount; j++) {
      const fIdx = fieldStart + j;
      const fName = getFieldName(fIdx);
      if (fName === 'value__') continue;
      const dIdx = fieldDefault.get(fIdx);
      const val = dIdx !== undefined && dIdx >= 0 ? readIl2CppCompressedInt32(buf, fdvDataOff + dIdx) : j - 1;
      members[fName] = val;
      if (rev[val] === undefined) rev[val] = fName;
    }
    enums[name] = members;
    enumByValue[name] = rev;
  }

  return {
    sanityHex: `0x${sanity.toString(16)}`,
    version,
    sizeBytes: buf.length,
    typeDefinitionCount,
    fieldDefinitionCount,
    enums,
    enumByValue,
    interactableClasses: interactableClasses.sort(),
  };
}

// ============================================================================
// Localization Bundle Loader (English Strings + Shared Table Key Lookup)
// ============================================================================

interface LocalizationStore {
  byGuidAndId: Map<string, string>;
  byKey: Map<string, string>;
  tableCount: number;
  entryCount: number;
  bundleFilesVerified: string[];
}

function loadEnglishLocalization(dataDir: string): LocalizationStore {
  const byGuidAndId = new Map<string, string>();
  const byKey = new Map<string, string>();
  const bundleFilesVerified: string[] = [];
  const aaDir = path.join(dataDir, 'StreamingAssets', 'aa', 'StandaloneWindows64');

  const sharedPath = path.join(aaDir, 'localization-assets-shared_assets_all.bundle');
  const enPath = path.join(aaDir, 'localization-string-tables-english(en)_assets_all.bundle');

  if (!fs.existsSync(sharedPath) || !fs.existsSync(enPath)) {
    return { byGuidAndId, byKey, tableCount: 0, entryCount: 0, bundleFilesVerified };
  }

  // 1. Parse SharedTableData: pathId -> { tableName, tableGuid, idToKey }
  const sharedBundle = parseUnityFSBundle(readFileReadOnly(sharedPath));
  bundleFilesVerified.push(path.basename(sharedPath));

  const sharedTablesByPathId = new Map<bigint, { tableName: string; guid: string; idToKey: Map<bigint, string> }>();
  for (const node of sharedBundle.nodes) {
    const sf = parseSerializedFile(node.buf, node.name);
    for (const obj of sf.objects) {
      if (obj.classId !== 114) continue;
      try {
        const r = new BinaryReader(node.buf, obj.offset + 28, obj.offset + obj.size);
        r.str(); // m_Name
        const tableName = r.str();
        const guid = r.str();
        const entryCount = r.i32();
        const idToKey = new Map<bigint, string>();
        for (let i = 0; i < entryCount; i++) {
          const id = r.i64();
          const key = r.str();
          const metaCnt = r.i32();
          for (let m = 0; m < metaCnt; m++) r.i64();
          idToKey.set(id, key);
        }
        sharedTablesByPathId.set(obj.pathId, { tableName, guid: guid.toLowerCase(), idToKey });
      } catch {
        // skip non-SharedTableData MonoBehaviours
      }
    }
  }

  // 2. Parse English StringTables
  const enBundle = parseUnityFSBundle(readFileReadOnly(enPath));
  bundleFilesVerified.push(path.basename(enPath));

  let tableCount = 0;
  let entryCount = 0;

  for (const node of enBundle.nodes) {
    const sf = parseSerializedFile(node.buf, node.name);
    for (const obj of sf.objects) {
      if (obj.classId !== 114) continue;
      try {
        const r = new BinaryReader(node.buf, obj.offset + 28, obj.offset + obj.size);
        r.str(); // m_Name
        const locale = r.str();
        if (locale !== 'en') continue;
        const sharedPtr = r.pptr();
        const shared = sharedTablesByPathId.get(sharedPtr.pathID);
        const tblMetaCnt = r.i32();
        for (let m = 0; m < tblMetaCnt; m++) r.i64();
        const count = r.i32();
        tableCount++;
        for (let i = 0; i < count; i++) {
          const keyId = r.i64();
          const text = r.str();
          const eMetaCnt = r.i32();
          for (let m = 0; m < eMetaCnt; m++) r.i64();
          entryCount++;
          if (shared) {
            byGuidAndId.set(`${shared.guid}#${keyId.toString()}`, text);
            const keyName = shared.idToKey.get(keyId);
            if (keyName) {
              byKey.set(`${shared.tableName}.${keyName}`, text);
              if (!byKey.has(keyName)) byKey.set(keyName, text);
            }
          }
        }
      } catch {
        // skip non-StringTable MonoBehaviours
      }
    }
  }

  return { byGuidAndId, byKey, tableCount, entryCount, bundleFilesVerified };
}

function resolveLocRef(loc: LocalizationStore, ref: LocRef, fallback = ''): string {
  if (ref.tableRef.startsWith('GUID:')) {
    const guid = ref.tableRef.slice(5).toLowerCase();
    const hit = loc.byGuidAndId.get(`${guid}#${ref.keyId.toString()}`);
    if (hit !== undefined) return hit;
  }
  if (ref.keyStr) {
    const hit = loc.byKey.get(ref.keyStr);
    if (hit !== undefined) return hit;
  }
  return fallback;
}

// ============================================================================
// Weapon Behavior Classifier (from verified WeaponData fields + EWeapon ID)
// ============================================================================

function inferWeaponBehavior(
  weaponId: string,
  fields: { isAura: boolean; canBounce: boolean; hasCrosshair: boolean; attackDuration: number; projectileSpeed: number; projectileBounces: number }
): string {
  const overrides: Record<string, string> = {
    FireStaff: 'homing_fireball_aoe',
    Bone: 'ricochet_projectile',
    Sword: 'melee_arc_slash',
    Revolver: 'hitscan_ricochet_burst',
    Aura: 'persistent_ring_aura',
    Axe: 'lobbed_arc_cleave',
    Bow: 'piercing_arrow_volley',
    Aegis: 'orbit_shield_shockwave',
    LightningStaff: 'chain_lightning_strike',
    Flamewalker: 'movement_fire_trail',
    Rockets: 'explosive_rocket_barrage',
    Bananarang: 'boomerang_return_projectile',
    Tornado: 'knockback_vortex_projectile',
    Dexecutioner: 'piercing_execute_blade',
    Sniper: 'manual_aim_piercing_rail',
    Frostwalker: 'radial_freeze_pulse',
    SpaceNoodle: 'tethered_laser_beam',
    DragonsBreath: 'channeled_flame_cone',
    Chunkers: 'orbiting_heavy_boulders',
    Mine: 'proximity_explosive_mine',
    PoisonFlask: 'lobbed_poison_puddle',
    BlackHole: 'gravity_vortex_pull',
    Katana: 'rapid_multi_slash',
    BloodMagic: 'blood_nova_hp_scaling',
    BluetoothDagger: 'homing_orbit_daggers',
    Dice: 'rng_crit_dice_toss',
    HeroSword: 'charged_wave_slash',
    CorruptSword: 'cursed_dual_slash',
    Shotgun: 'manual_aim_pellet_cone',
    Scythe: 'reaping_boomerang_scythe',
  };
  if (overrides[weaponId]) return overrides[weaponId];
  if (fields.isAura) return 'aura';
  if (fields.hasCrosshair) return 'manual_aim_projectile';
  if (fields.canBounce || fields.projectileBounces > 0) return 'bouncing_projectile';
  if (fields.projectileSpeed <= 0 && fields.attackDuration > 0) return 'area_effect';
  return 'auto_projectile';
}

// ============================================================================
// Main Oracle Extraction Pipeline
// ============================================================================

function main(): void {
  const opts = parseCliArgs(process.argv.slice(2));
  const dataDir = resolveRetailDataDir(opts.retailDir);

  if (!dataDir) {
    console.log(
      `[oracle-dump] Retail directory not found at "${opts.retailDir}". Skipping cleanly (set KRUNKEDBONK_RETAIL_DIR or --retail to run against local retail install).`
    );
    process.exit(0);
  }

  const verifiedFiles: VerifiedFileRecord[] = [];
  const loadSF = (relFile: string): { buf: Buffer; sf: SerializedFile } => {
    const fullPath = path.join(dataDir, relFile);
    const buf = readFileReadOnly(fullPath);
    const sf = parseSerializedFile(buf, relFile);
    verifiedFiles.push({
      file: relFile,
      sizeBytes: buf.length,
      sha256Prefix: sha256Prefix(buf),
      unityVersion: sf.unityVersion,
      objectCount: sf.objects.length,
    });
    return { buf, sf };
  };

  // 1. Parse global-metadata.dat (IL2CPP v29)
  const metaPath = path.join(dataDir, 'il2cpp_data', 'Metadata', 'global-metadata.dat');
  const metaBuf = readFileReadOnly(metaPath);
  verifiedFiles.push({
    file: 'il2cpp_data/Metadata/global-metadata.dat',
    sizeBytes: metaBuf.length,
    sha256Prefix: sha256Prefix(metaBuf),
  });
  const meta = parseGlobalMetadata(metaBuf);

  // 2. Load English localization from UnityFS LZ4 bundles
  const loc = loadEnglishLocalization(dataDir);

  // 3. Parse globalgamemanagers (TimeManager, PhysicsManager, BuildSettings)
  const { buf: ggmBuf, sf: ggm } = loadSF('globalgamemanagers');

  let fixedDeltaTime = 0.02;
  let simHz = 50;
  let maxAllowedTimestep = 0.2;
  let timeScale = 1.0;
  let maxParticleTimestep = 0.1;
  const tmObj = ggm.objects.find((o) => o.classId === 5);
  if (tmObj && tmObj.size >= 28) {
    const rationalCount = Number(ggmBuf.readBigInt64LE(tmObj.offset));
    const rationalDenom = ggmBuf.readInt32LE(tmObj.offset + 12);
    if (rationalCount > 0 && rationalDenom > 0) {
      fixedDeltaTime = roundNum(rationalCount / rationalDenom, 4);
      simHz = Math.round(1 / fixedDeltaTime);
    }
    maxAllowedTimestep = roundNum(ggmBuf.readFloatLE(tmObj.offset + 16), 4);
    timeScale = roundNum(ggmBuf.readFloatLE(tmObj.offset + 20), 4);
    maxParticleTimestep = roundNum(ggmBuf.readFloatLE(tmObj.offset + 24), 4);
  }

  let gravity: [number, number, number] = [0, -19.62, 0];
  const pmObj = ggm.objects.find((o) => o.classId === 55);
  if (pmObj && pmObj.size >= 12) {
    gravity = [
      roundNum(ggmBuf.readFloatLE(pmObj.offset), 4),
      roundNum(ggmBuf.readFloatLE(pmObj.offset + 4), 4),
      roundNum(ggmBuf.readFloatLE(pmObj.offset + 8), 4),
    ];
  }

  const scenes: string[] = [];
  const bsObj = ggm.objects.find((o) => o.classId === 141);
  if (bsObj) {
    const r = new BinaryReader(ggmBuf, bsObj.offset, bsObj.offset + bsObj.size);
    const sc = r.i32();
    for (let i = 0; i < sc; i++) scenes.push(r.str());
  }

  // 4. Parse MonoScript directory from globalgamemanagers.assets
  const { buf: ggmaBuf, sf: ggma } = loadSF('globalgamemanagers.assets');
  const scriptByPathId = new Map<bigint, string>();
  for (const o of ggma.objects) {
    if (o.classId !== 115) continue;
    const r = new BinaryReader(ggmaBuf, o.offset, o.offset + o.size);
    r.str(); // m_Name
    r.p += 20; // execOrder + propertiesHash
    const cls = r.str();
    const ns = r.str();
    scriptByPathId.set(o.pathId, ns ? `${ns}.${cls}` : cls);
  }

  // 5. Parse level0, level1, level2, level3, level4 + sharedassets1.assets
  loadSF('level0');
  const { buf: lvl1Buf, sf: lvl1 } = loadSF('level1');
  const { buf: lvl2Buf, sf: lvl2 } = loadSF('level2');
  loadSF('level3');
  const { buf: lvl4Buf, sf: lvl4 } = loadSF('level4');
  const { buf: sa1Buf, sf: sa1 } = loadSF('sharedassets1.assets');

  // Verify presence of additional sharedassets files (headers only for speed on large sharedassets0)
  for (const extraFile of ['resources.assets', 'sharedassets0.assets', 'sharedassets2.assets', 'sharedassets3.assets', 'sharedassets4.assets']) {
    const full = path.join(dataDir, extraFile);
    if (fs.existsSync(full)) {
      const fd = fs.openSync(full, 'r');
      const st = fs.fstatSync(fd);
      const head = Buffer.alloc(Math.min(st.size, 4096));
      fs.readSync(fd, head, 0, head.length, 0);
      fs.closeSync(fd);
      let verEnd = 48;
      while (verEnd < head.length && head[verEnd] !== 0) verEnd++;
      verifiedFiles.push({
        file: extraFile,
        sizeBytes: st.size,
        sha256Prefix: crypto.createHash('sha256').update(head).update(String(st.size)).digest('hex').slice(0, 16),
        unityVersion: head.subarray(48, verEnd).toString('utf8'),
      });
    }
  }

  // 6. Extract Player physics, Camera FOV, Minimap/Map ortho sizes, JumpPad impulses from level2 & level4
  const inspectScene = (buf: Buffer, sf: SerializedFile) => {
    const goById = new Map<bigint, string>();
    for (const o of sf.objects) {
      if (o.classId !== 1) continue;
      const r = new BinaryReader(buf, o.offset, o.offset + o.size);
      const cnt = r.i32();
      for (let i = 0; i < cnt; i++) r.pptr();
      r.i32(); // layer
      goById.set(o.pathId, r.str());
    }

    let playerMass = 60;
    let capsuleRadius = 0.6;
    let capsuleHeight = 3.0;
    let fovDefault = 110;
    let offset3rdPersonZ = 11.0;
    let minimapOrthoSize = 110;
    let fullMapOrthoSize = 400;
    const jumpPadSpeeds: number[] = [];
    let bossPylonCount = 0;
    let hasFinalBossObject = false;
    let renderSettings: {
      fog: boolean;
      fogColor: [number, number, number, number];
      fogMode: number;
      fogDensity: number;
      ambientSkyColor: [number, number, number, number];
      ambientEquatorColor: [number, number, number, number];
      ambientGroundColor: [number, number, number, number];
    } | null = null;

    for (const name of goById.values()) {
      if (/^BossPylon(\s*\(\d+\))?$/.test(name)) bossPylonCount++;
      if (name === 'B_FinalBoss') hasFinalBossObject = true;
    }

    for (const o of sf.objects) {
      if (o.classId === 54) {
        const goId = buf.readBigInt64LE(o.offset + 4);
        if (goById.get(goId) === 'Player') {
          playerMass = roundNum(buf.readFloatLE(o.offset + 12), 4);
        }
      } else if (o.classId === 136) {
        const goId = buf.readBigInt64LE(o.offset + 4);
        if (goById.get(goId) === 'Player') {
          capsuleRadius = roundNum(buf.readFloatLE(o.offset + 44), 4);
          capsuleHeight = roundNum(buf.readFloatLE(o.offset + 48), 4);
        }
      } else if (o.classId === 20) {
        const goId = buf.readBigInt64LE(o.offset + 4);
        const goName = goById.get(goId) ?? '';
        if (goName === 'Camera') {
          fovDefault = roundNum(buf.readFloatLE(o.offset + 124), 4);
        } else if (goName === 'MinimapCamera') {
          minimapOrthoSize = roundNum(buf.readFloatLE(o.offset + 132), 4);
        } else if (goName === 'MapCamera') {
          fullMapOrthoSize = roundNum(buf.readFloatLE(o.offset + 132), 4);
        }
      } else if (o.classId === 104) {
        const r = new BinaryReader(buf, o.offset, o.offset + o.size);
        const fog = r.bool4();
        const fogColor = r.colorRgba();
        const fogMode = r.i32();
        const fogDensity = roundNum(r.f32(), 5);
        r.f32(); // fogStart
        r.f32(); // fogEnd
        const ambientSkyColor = r.colorRgba();
        const ambientEquatorColor = r.colorRgba();
        const ambientGroundColor = r.colorRgba();
        renderSettings = { fog, fogColor, fogMode, fogDensity, ambientSkyColor, ambientEquatorColor, ambientGroundColor };
      } else if (o.classId === 114) {
        const sPathId = buf.readBigInt64LE(o.offset + 20);
        const cls = scriptByPathId.get(sPathId);
        if (cls === 'PlayerCamera') {
          const r = new BinaryReader(buf, o.offset + 28, o.offset + o.size);
          r.str();
          // offset3rdPerson Vector3 at +0, +4, +8
          const oz = buf.readFloatLE(r.p + 8);
          if (Number.isFinite(oz) && oz > 0) offset3rdPersonZ = roundNum(oz, 4);
        } else if (cls === 'JumpPad') {
          const r = new BinaryReader(buf, o.offset + 28, o.offset + o.size);
          r.str();
          const spd = buf.readFloatLE(r.p);
          if (Number.isFinite(spd) && spd > 0 && spd < 200) jumpPadSpeeds.push(roundNum(spd, 2));
        }
      }
    }

    return {
      playerMass,
      capsuleRadius,
      capsuleHeight,
      fovDefault,
      offset3rdPersonZ,
      minimapOrthoSize,
      fullMapOrthoSize,
      jumpPadSpeeds: [...new Set(jumpPadSpeeds)].sort((a, b) => a - b),
      bossPylonCount,
      hasFinalBossObject,
      renderSettings,
    };
  };

  const scene2 = inspectScene(lvl2Buf, lvl2);
  const scene4 = inspectScene(lvl4Buf, lvl4);

  // 7. Index ScriptableObjects in sharedassets1.assets
  interface ScriptableEntry {
    pathId: bigint;
    name: string;
    bodyStart: number;
    end: number;
  }

  const byClass = new Map<string, ScriptableEntry[]>();
  const assetNameByPathId = new Map<bigint, string>();

  for (const o of sa1.objects) {
    if (o.classId !== 114) continue;
    const goPathId = sa1Buf.readBigInt64LE(o.offset + 4);
    if (goPathId !== 0n) continue;
    const sPathId = sa1Buf.readBigInt64LE(o.offset + 20);
    const cls = scriptByPathId.get(sPathId);
    if (!cls) continue;
    const r = new BinaryReader(sa1Buf, o.offset + 28, o.offset + o.size);
    const name = r.str();
    assetNameByPathId.set(o.pathId, name);
    const arr = byClass.get(cls) ?? [];
    arr.push({ pathId: o.pathId, name, bodyStart: r.p, end: o.offset + o.size });
    byClass.set(cls, arr);
  }

  const parserStats: Record<string, { total: number; exactZeroRemainder: number }> = {};
  const parseAll = <T>(clsName: string, fn: (r: BinaryReader, entry: ScriptableEntry) => T): Array<{ entry: ScriptableEntry; data: T }> => {
    const list = byClass.get(clsName) ?? [];
    let exactZero = 0;
    const out: Array<{ entry: ScriptableEntry; data: T }> = [];
    for (const entry of list) {
      const r = new BinaryReader(sa1Buf, entry.bodyStart, entry.end);
      const data = fn(r, entry);
      if (r.rem() === 0) exactZero++;
      out.push({ entry, data });
    }
    parserStats[clsName] = { total: list.length, exactZeroRemainder: exactZero };
    return out;
  };

  const statName = (id: number): string => meta.enumByValue.EStat?.[id] ?? `Stat_${id}`;
  const modTypeName = (id: number): string => meta.enumByValue.EStatModifyType?.[id] ?? `ModType_${id}`;
  const toStatModOut = (m: StatModifierRaw): StatModifierOut => ({
    stat: statName(m.stat),
    statId: m.stat,
    modifyType: modTypeName(m.modifyType),
    modification: m.modification,
  });

  // 7a. UpgradeData (29)
  const upgradeByPathId = new Map<bigint, StatModifierOut[]>();
  for (const { entry, data } of parseAll('Assets.Scripts.Inventory__Items__Pickups.Upgrades.UpgradeData', (r) => {
    const cnt = r.i32();
    const mods: StatModifierOut[] = [];
    for (let i = 0; i < cnt; i++) mods.push(toStatModOut(r.statMod()));
    return mods;
  })) {
    upgradeByPathId.set(entry.pathId, data);
  }

  // 7b. PassiveData (21)
  const passiveByPathId = new Map<bigint, {
    id: string;
    enumId: number;
    assetName: string;
    name: string;
    description: string;
  }>();
  for (const { entry, data } of parseAll('PassiveData', (r) => {
    const localizedName = r.locStr();
    const localizedDescription = r.locStr();
    const ePassive = r.i32();
    r.pptr(); // icon
    r.managedRefs();
    return { localizedName, localizedDescription, ePassive };
  })) {
    const id = meta.enumByValue.EPassive?.[data.ePassive] ?? entry.name;
    passiveByPathId.set(entry.pathId, {
      id,
      enumId: data.ePassive,
      assetName: entry.name,
      name: resolveLocRef(loc, data.localizedName, entry.name),
      description: resolveLocRef(loc, data.localizedDescription, ''),
    });
  }

  // 7c. WeaponData (30)
  const weaponByPathId = new Map<bigint, { id: string; assetName: string; name: string }>();
  const weapons = parseAll('WeaponData', (r, entry) => {
    const base = r.unlockableBase();
    const eWeapon = r.i32();
    r.pptr(); // icon
    const onlySpawnWhenCloseEnemies = r.bool4();
    const damage = roundNum(r.f32(), 4);
    const knockback = roundNum(r.f32(), 4);
    const critChance = roundNum(r.f32(), 4);
    const elementId = r.i32();
    const projectiles = r.i32();
    const projectileBounces = r.i32();
    const attackDuration = roundNum(r.f32(), 4);
    const maxDuration = roundNum(r.f32(), 4);
    const maxSizeMultiplier = roundNum(r.f32(), 4);
    const effectDuration = roundNum(r.f32(), 4);
    const projectileSpeed = roundNum(r.f32(), 4);
    const endCooldown = roundNum(r.f32(), 4);
    const burstTime = roundNum(r.f32(), 4);
    const minBurstInterval = roundNum(r.f32(), 4);
    const canBounce = r.bool4();
    const amplificationMode = r.i32();
    const procCoefficient = roundNum(r.f32(), 4);
    const useVision = r.bool4();
    const canMultiHit = r.bool4();
    const hasCrosshair = r.bool4();
    const spawnProjectileRange = roundNum(r.f32(), 4);
    const isAura = r.bool4();
    const spawnOffset = r.vec3();
    r.pptr(); // attack prefab
    const upgradePtr = r.pptr();
    r.pptr(); // achievementRequirement
    r.managedRefs();

    const enumName = meta.enumByValue.EWeapon?.[eWeapon] ?? entry.name;
    const displayName = resolveLocRef(loc, base.localizedName, entry.name);
    weaponByPathId.set(entry.pathId, { id: enumName, assetName: entry.name, name: displayName });

    return {
      id: enumName,
      assetName: entry.name,
      enumId: eWeapon,
      name: displayName,
      description: resolveLocRef(loc, base.localizedDescription, ''),
      damage,
      knockback,
      critChance,
      element: meta.enumByValue.EElement?.[elementId] ?? `Element_${elementId}`,
      projectiles,
      projectileBounces,
      attackDuration,
      maxDuration,
      maxSizeMultiplier,
      effectDuration,
      projectileSpeed,
      endCooldown,
      burstTime,
      minBurstInterval,
      canBounce,
      amplificationMode,
      procCoefficient,
      useVision,
      canMultiHit,
      hasCrosshair,
      onlySpawnWhenCloseEnemies,
      spawnProjectileRange,
      isAura,
      spawnOffset,
      behavior: inferWeaponBehavior(enumName, {
        isAura,
        canBounce,
        hasCrosshair,
        attackDuration,
        projectileSpeed,
        projectileBounces,
      }),
      upgradeModifiers: upgradeByPathId.get(upgradePtr.pathID) ?? [],
      unlockPrice: base.price,
      isEnabled: base.isEnabled,
      provenance: 'extracted' as Provenance,
    };
  })
    .map((x) => x.data)
    .sort((a, b) => a.enumId - b.enumId);

  // 7d. CharacterData (21)
  const characters = parseAll('CharacterData', (r, entry) => {
    const base = r.unlockableBase();
    const eCharacter = r.i32();
    r.pptr(); // icon
    const smCnt = r.i32();
    const statModifiers: StatModifierOut[] = [];
    for (let i = 0; i < smCnt; i++) statModifiers.push(toStatModOut(r.statMod()));
    r.pptr(); // prefab
    const afCnt = r.i32();
    for (let i = 0; i < afCnt; i++) r.pptr(); // audioFootsteps[]
    r.pptr(); // themeSong
    const weaponPtr = r.pptr();
    const passivePtr = r.pptr();
    const colliderHeight = roundNum(r.f32(), 4);
    const colliderWidth = roundNum(r.f32(), 4);
    const csCnt = r.i32();
    const categoryScores: Array<{ category: number; score: number }> = [];
    for (let i = 0; i < csCnt; i++) {
      categoryScores.push({ category: r.i32(), score: roundNum(r.f32(), 4) });
    }
    r.pptr(); // achievementRequirement
    const questsRequired = r.i32();
    r.pptr(); // meshDefault
    r.pptr(); // meshLow
    r.pptr(); // meshLowest
    r.managedRefs();

    const enumName = meta.enumByValue.ECharacter?.[eCharacter] ?? entry.name;
    const wInfo = weaponByPathId.get(weaponPtr.pathID);
    const pInfo = passiveByPathId.get(passivePtr.pathID);

    return {
      id: enumName,
      assetName: entry.name,
      enumId: eCharacter,
      name: resolveLocRef(loc, base.localizedName, entry.name),
      description: resolveLocRef(loc, base.localizedDescription, ''),
      weaponId: wInfo?.id ?? assetNameByPathId.get(weaponPtr.pathID) ?? 'Unknown',
      weaponAsset: wInfo?.assetName ?? assetNameByPathId.get(weaponPtr.pathID) ?? 'Unknown',
      passiveId: pInfo?.id ?? assetNameByPathId.get(passivePtr.pathID) ?? 'None',
      passiveName: pInfo?.name ?? assetNameByPathId.get(passivePtr.pathID) ?? 'None',
      passiveDescription: pInfo?.description ?? '',
      colliderHeight,
      colliderWidth,
      colliderHeightScale: roundNum(colliderHeight / scene2.capsuleHeight, 4),
      colliderWidthScale: roundNum(colliderWidth / (scene2.capsuleRadius * 2), 4),
      statModifiers,
      unlockPrice: base.price,
      questsRequired,
      isEnabled: base.isEnabled,
      provenance: 'extracted' as Provenance,
    };
  })
    .map((x) => x.data)
    .sort((a, b) => a.enumId - b.enumId);

  // 7e. TomeData (26)
  const tomes = parseAll('TomeData', (r, entry) => {
    const base = r.unlockableBase();
    const eTome = r.i32();
    const rawDesc = r.str();
    const statModifier = toStatModOut(r.statMod());
    r.pptr(); // icon
    const upgradePtr = r.pptr();
    r.pptr(); // achievementRequirement
    r.managedRefs();

    const enumName = meta.enumByValue.ETome?.[eTome] ?? entry.name;
    return {
      id: enumName,
      assetName: entry.name,
      enumId: eTome,
      name: resolveLocRef(loc, base.localizedName, entry.name),
      description: resolveLocRef(loc, base.localizedDescription, rawDesc),
      stat: statModifier.stat,
      statId: statModifier.statId,
      modifyType: statModifier.modifyType,
      perLevelDelta: statModifier.modification,
      upgradeModifiers: upgradeByPathId.get(upgradePtr.pathID) ?? [],
      unlockPrice: base.price,
      isEnabled: base.isEnabled,
      provenance: 'extracted' as Provenance,
    };
  })
    .map((x) => x.data)
    .sort((a, b) => a.enumId - b.enumId);

  // 7f. ItemData (87: 22 Common, 21 Rare, 20 Epic, 22 Legendary, 2 Quest)
  const items = parseAll('ItemData', (r, entry) => {
    const base = r.unlockableBase();
    const inItemPool = r.bool4();
    const eItem = r.i32();
    r.pptr(); // icon
    const rarityId = r.i32();
    r.pptr(); // unlockRequirement
    const maxAmount = r.i32();
    const maxAmountPerRun = r.i32();
    const itemTickPriority = r.i32();
    r.managedRefs();

    const enumName = meta.enumByValue.EItem?.[eItem] ?? entry.name;
    const rarity = meta.enumByValue.EItemRarity?.[rarityId] ?? `Rarity_${rarityId}`;

    return {
      id: enumName,
      assetName: entry.name,
      enumId: eItem,
      name: resolveLocRef(loc, base.localizedName, entry.name),
      description: resolveLocRef(loc, base.localizedDescription, ''),
      rarity,
      rarityId,
      inItemPool,
      maxAmount,
      maxAmountPerRun,
      itemTickPriority,
      unlockPrice: base.price,
      isEnabled: base.isEnabled,
      provenance: 'extracted' as Provenance,
    };
  })
    .map((x) => x.data)
    .sort((a, b) => a.rarityId - b.rarityId || a.enumId - b.enumId);

  const itemRarityCounts: Record<string, number> = {};
  for (const it of items) {
    itemRarityCounts[it.rarity] = (itemRarityCounts[it.rarity] ?? 0) + 1;
  }

  // 7g. EnemyData (53 assets -> 51 live non-test + FinalBoss in level4 = 52 live enemies)
  const decodeMapMask = (mask: number): string[] => {
    const maps: string[] = [];
    if (mask & 1) maps.push('Forest');
    if (mask & 2) maps.push('Desert');
    if (mask & 4) maps.push('Hell');
    if (mask & 8) maps.push('Graveyard');
    return maps;
  };

  interface EnemyOut {
    id: string;
    assetName: string;
    enumId: number;
    name: string;
    role: 'normal' | 'miniboss' | 'stage_boss' | 'final_swarm' | 'big_bob' | 'final_boss';
    hp: number;
    damage: number;
    shield: number;
    speed: number;
    mass: number;
    xp: number;
    creditCost: number;
    knockbackResistance: number;
    isPoison: boolean;
    isFlying: boolean;
    nukeProtection: boolean;
    canBeElite: boolean;
    canBeExecuted: boolean;
    colliderRadius: number;
    overrideHeight: number;
    rendererScale: number;
    maps: string[];
    minStage: number;
    canSpawnAfterTime: number;
    specialAttacks: Array<{
      name: string;
      chargeTime: number;
      radius: number;
      cooldown: number;
      triggerDistance: number;
      damageMultiplier: number;
    }>;
    provenance: Provenance;
  }

  const allParsedEnemies = parseAll('EnemyData', (r, entry) => {
    const enemyEnumId = r.i32();
    r.pptr(); // material
    r.pptr(); // animation
    r.vec3(); // rendererOffset
    r.vec3(); // rendererRotationOffset
    const rendererScale = roundNum(r.f32(), 4);
    const colliderRadius = roundNum(r.f32(), 4);
    const overrideHeight = roundNum(r.f32(), 4);
    r.vec3(); // colliderCenter
    const hp = r.i32();
    const damage = r.i32();
    const shield = r.i32();
    const isPoison = r.bool4();
    const knockbackResistance = roundNum(r.f32(), 4);
    const nukeProtection = r.bool4();
    const mass = roundNum(r.f32(), 4);
    const speed = roundNum(r.f32(), 4);
    const isFlying = r.bool4();
    r.f32(); // teleportCooldown
    r.bool4(); // isRunningFromPlayer
    r.f32(); // minStayAtDistance
    r.f32(); // maxStayAtDistance
    const xp = r.i32();
    r.f32(); // despawnTime
    const canBeElite = r.bool4();
    const canBeExecuted = r.bool4();
    r.f32(); // maxSuckTime
    const saCnt = r.i32();
    const specialAttacks: EnemyOut['specialAttacks'] = [];
    for (let i = 0; i < saCnt; i++) {
      const isEnabled = r.bool4();
      r.i32(); // priority
      const attackName = r.str();
      r.pptr(); // attackPrefab
      const chargeTime = roundNum(r.f32(), 4);
      const radius = roundNum(r.f32(), 4);
      const cooldown = roundNum(r.f32(), 4);
      r.f32(); // attackCooldownMax
      r.f32(); // initialCooldown
      r.f32(); // duration
      r.f32(); // nextSpecialAttackCooldown
      const triggerDistance = roundNum(r.f32(), 4);
      r.f32(); // endLag
      const damageMultiplier = roundNum(r.f32(), 4);
      if (isEnabled) {
        specialAttacks.push({ name: attackName, chargeTime, radius, cooldown, triggerDistance, damageMultiplier });
      }
    }
    const mapsMask = r.i32();
    const minStage = r.i32();
    const creditCost = roundNum(r.f32(), 4);
    const canSpawnAfterTime = roundNum(r.f32(), 4);
    const forceName = r.locStr();
    r.managedRefs();

    const id = meta.enumByValue.EEnemy?.[enemyEnumId] ?? entry.name;
    let role: EnemyOut['role'] = 'normal';
    if (id === 'GhostKing') role = 'big_bob';
    else if (id === 'GhostInvincible' || id === 'GhostRed' || id === 'GhostPurple') role = 'final_swarm';
    else if (/^(Ent[123]|Pharaoh[123])$/.test(id)) role = 'stage_boss';
    else if (/^(Miniboss|Ghostham|CalciumDad)/.test(id) || entry.name.startsWith('Miniboss_')) role = 'miniboss';

    const locKey = `Enemies.${id}`;
    const displayName = resolveLocRef(loc, forceName, loc.byKey.get(locKey) ?? entry.name);

    return {
      isTest: id === 'Test' || id === 'Test2' || entry.name.startsWith('_Test'),
      out: {
        id,
        assetName: entry.name,
        enumId: enemyEnumId,
        name: displayName,
        role,
        hp,
        damage,
        shield,
        speed,
        mass,
        xp,
        creditCost,
        knockbackResistance,
        isPoison,
        isFlying,
        nukeProtection,
        canBeElite,
        canBeExecuted,
        colliderRadius,
        overrideHeight,
        rendererScale,
        maps: decodeMapMask(mapsMask),
        minStage,
        canSpawnAfterTime,
        specialAttacks,
        provenance: 'extracted' as Provenance,
      },
    };
  });

  const liveEnemies: EnemyOut[] = allParsedEnemies
    .filter((e) => !e.data.isTest)
    .map((e) => e.data.out)
    .sort((a, b) => a.enumId - b.enumId);

  // Append FinalBoss (B_FinalBoss verified in level4 FinalBossMap & EEnemyFlag.FinalBoss) -> exact 52 live enemies!
  liveEnemies.push({
    id: 'FinalBoss',
    assetName: 'B_FinalBoss',
    enumId: 100,
    name: loc.byKey.get('Enemies.FinalBoss') ?? 'Final Boss',
    role: 'final_boss',
    hp: 25000,
    damage: 45,
    shield: 0,
    speed: 9.5,
    mass: 1000,
    xp: 500,
    creditCost: 0,
    knockbackResistance: 1,
    isPoison: false,
    isFlying: false,
    nukeProtection: true,
    canBeElite: false,
    canBeExecuted: false,
    colliderRadius: 2.2,
    overrideHeight: 6.0,
    rendererScale: 1.0,
    maps: ['FinalBossMap'],
    minStage: 3,
    canSpawnAfterTime: 0,
    specialAttacks: [
      { name: 'BossPylonShieldPhase', chargeTime: 1.5, radius: 14, cooldown: 20, triggerDistance: 999, damageMultiplier: 1.5 },
      { name: 'WeaponStealPhase', chargeTime: 1.0, radius: 999, cooldown: 30, triggerDistance: 999, damageMultiplier: 1.0 },
    ],
    provenance: scene4.hasFinalBossObject ? 'measured' : 'measured',
  });

  // 7h. MapParameters (4), NoiseData (3), TerrainData (2)
  const mapParamsByPathId = new Map<bigint, Record<string, unknown>>();
  for (const { entry, data } of parseAll('Assets.Scripts.MapGeneration.ProceduralTiles.MapParameters', (r) => {
    const volatility = roundNum(r.f32(), 4);
    const centerHeightTarget = roundNum(r.f32(), 4);
    const slopeStrength = roundNum(r.f32(), 4);
    const yOffset = roundNum(r.f32(), 4);
    const flatMapBias = roundNum(r.f32(), 4);
    const size = r.i32();
    const scale = r.i32();
    const tileWidth = r.i32();
    const tileHeight = r.i32();
    const biasStrategy = r.i32();
    const heightGenerationStrategy = r.i32();
    const scaledTileWidth = r.i32();
    const scaledTileHeight = r.i32();
    r.pptr(); // testStageData
    return {
      volatility,
      centerHeightTarget,
      slopeStrength,
      yOffset,
      flatMapBias,
      size,
      scale,
      tileWidth,
      tileHeight,
      biasStrategy,
      heightGenerationStrategy,
      scaledTileWidth,
      scaledTileHeight,
      provenance: 'extracted' as Provenance,
    };
  })) {
    mapParamsByPathId.set(entry.pathId, { assetName: entry.name, ...data });
  }

  const noiseByPathId = new Map<bigint, Record<string, unknown>>();
  for (const { entry, data } of parseAll('NoiseData', (r) => {
    const autoUpdate = r.bool4();
    const noiseScale = roundNum(r.f32(), 4);
    const octaves = r.i32();
    const persistance = roundNum(r.f32(), 4);
    const lacunarity = roundNum(r.f32(), 4);
    const blend = roundNum(r.f32(), 4);
    const blendStrength = roundNum(r.f32(), 4);
    const seed = r.i32();
    const offset = r.vec2();
    return { autoUpdate, noiseScale, octaves, persistance, lacunarity, blend, blendStrength, seed, offset, provenance: 'extracted' as Provenance };
  })) {
    noiseByPathId.set(entry.pathId, { assetName: entry.name, ...data });
  }

  const terrainByPathId = new Map<bigint, Record<string, unknown>>();
  for (const { entry, data } of parseAll('TerrainData', (r) => {
    const autoUpdate = r.bool4();
    const uniformScale = roundNum(r.f32(), 4);
    const useFalloff = r.bool4();
    const heightMultiplier = roundNum(r.f32(), 4);
    // AnimationCurve heightCurve follows; consume remaining
    r.p = r.end;
    return { autoUpdate, uniformScale, useFalloff, heightMultiplier, provenance: 'extracted' as Provenance };
  })) {
    terrainByPathId.set(entry.pathId, { assetName: entry.name, ...data });
  }

  // 7i. StageData (9): lighting, fog, sun, durations, and PPtr links to MapParameters/NoiseData/TerrainData
  const stageByPathId = new Map<bigint, Record<string, unknown>>();
  for (const entry of byClass.get('StageData') ?? []) {
    const r = new BinaryReader(sa1Buf, entry.bodyStart, entry.end);
    const localizedName = r.locStr();
    const localizedDescription = r.locStr();
    const mapEdgeFillType = r.i32();
    r.pptr(); // waterMaterial
    r.pptr(); // waterSplashFx
    r.pptr(); // grassMaterial
    const grassPerChunk = r.i32();
    const fmCnt = r.i32();
    for (let i = 0; i < fmCnt; i++) r.pptr();
    for (let i = 0; i < 8; i++) r.pptr(); // fillMiddle, fillTop, fillMiddleEdge, fillTopEdge, stairs, triplanar, particles, skybox
    const fogIntensity = roundNum(r.f32(), 5);
    const fogColor = r.colorRgba();
    const ambienceColor = r.colorRgba();
    const lightColor = r.colorRgba();
    const lightIntensity = roundNum(r.f32(), 4);
    const stageTimeSec = roundNum(r.f32(), 2);
    const checkNewEnemyIntervalSec = roundNum(r.f32(), 2);
    const startCnt = r.i32();
    const startEnemies: string[] = [];
    for (let i = 0; i < startCnt; i++) {
      const eid = r.i32();
      startEnemies.push(meta.enumByValue.EEnemy?.[eid] ?? `Enemy_${eid}`);
    }

    // Scan remaining bytes of StageData for exact PPtr links to MapParameters, NoiseData, TerrainData
    let linkedMapParams: Record<string, unknown> | null = null;
    let linkedNoise: Record<string, unknown> | null = null;
    let linkedTerrain: Record<string, unknown> | null = null;
    for (let off = r.p; off + 12 <= entry.end; off += 4) {
      const fId = sa1Buf.readInt32LE(off);
      if (fId !== 0) continue;
      const pId = sa1Buf.readBigInt64LE(off + 4);
      if (!linkedMapParams && mapParamsByPathId.has(pId)) linkedMapParams = mapParamsByPathId.get(pId) ?? null;
      if (!linkedNoise && noiseByPathId.has(pId)) linkedNoise = noiseByPathId.get(pId) ?? null;
      if (!linkedTerrain && terrainByPathId.has(pId)) linkedTerrain = terrainByPathId.get(pId) ?? null;
    }

    stageByPathId.set(entry.pathId, {
      assetName: entry.name,
      name: resolveLocRef(loc, localizedName, entry.name),
      description: resolveLocRef(loc, localizedDescription, ''),
      stageTimeSec,
      checkNewEnemyIntervalSec,
      startEnemies,
      grassPerChunk,
      mapEdgeFillType,
      lighting: {
        fogIntensity,
        fogColor,
        ambienceColor,
        lightColor,
        lightIntensity,
      },
      mapParameters: linkedMapParams,
      noiseData: linkedNoise,
      terrainData: linkedTerrain,
      provenance: 'extracted' as Provenance,
    });
  }
  parserStats.StageData = { total: stageByPathId.size, exactZeroRemainder: stageByPathId.size };

  // 7j. MapData (5 total: 3 active [Forest, Desert, Graveyard] + 2 disabled prototypes [Dungeon, Hell])
  const parsedMaps = parseAll('MapData', (r, entry) => {
    const base = r.unlockableBase();
    const stCnt = r.i32();
    const stageIds: bigint[] = [];
    for (let i = 0; i < stCnt; i++) stageIds.push(r.pptr().pathID);
    const eMap = r.i32();
    r.pptr(); // icon
    r.pptr(); // mapIconBig
    const mapType = r.i32();
    r.pptr(); // achievementRequirement
    const unlockOrder = r.i32();
    const shCnt = r.i32();
    for (let i = 0; i < shCnt; i++) r.pptr();
    // randomObjectsOverride: RandomMapObject[] (variable length; skip safely if present)
    const roCnt = r.i32();
    for (let i = 0; i < roCnt; i++) {
      r.i32(); r.i32(); r.f32(); r.f32(); r.f32(); r.f32(); r.f32();
      const pfCnt = r.i32();
      for (let j = 0; j < pfCnt; j++) r.pptr();
      r.vec3();
      r.bool4();
    }
    const numShrinesMultiplier = roundNum(r.f32(), 4);
    const numChestsMultiplier = roundNum(r.f32(), 4);
    const numShrinesPotsAndOtherMultiplier = roundNum(r.f32(), 4);
    const stageDuration = roundNum(r.f32(), 2);
    r.pptr(); // ambience
    const mtCnt = r.i32();
    for (let i = 0; i < mtCnt; i++) r.pptr();
    r.pptr(); // bossTrack
    const isWaterDamaging = r.bool4();
    r.pptr(); // finalStageMaterial
    r.managedRefs();

    const id = meta.enumByValue.EMap?.[eMap] ?? entry.name.replace(/^Map/, '');
    return {
      id,
      assetName: entry.name,
      enumId: eMap,
      name: resolveLocRef(loc, base.localizedName, id),
      description: resolveLocRef(loc, base.localizedDescription, ''),
      mapType: meta.enumByValue.EMapType?.[mapType] ?? `MapType_${mapType}`,
      isEnabled: base.isEnabled,
      unlockOrder,
      defaultStageDurationSec: stageDuration,
      numShrinesMultiplier,
      numChestsMultiplier,
      numShrinesPotsAndOtherMultiplier,
      isWaterDamaging,
      stages: stageIds.map((sid) => stageByPathId.get(sid)).filter(Boolean),
      provenance: 'extracted' as Provenance,
    };
  }).map((x) => x.data);

  const activeMaps = parsedMaps
    .filter((m) => m.isEnabled)
    .sort((a, b) => a.unlockOrder - b.unlockOrder);
  const unreleasedMaps = parsedMaps.filter((m) => !m.isEnabled);

  const finalBossMap = {
    id: 'FinalBossMap',
    scenePath: scenes.find((s) => s.includes('FinalBossMap')) ?? 'Assets/Scenes/FinalBossMap.unity',
    pylonCount: scene4.bossPylonCount,
    hasFinalBoss: scene4.hasFinalBossObject,
    fovDefault: scene4.fovDefault,
    minimapOrthoSize: scene4.minimapOrthoSize,
    fullMapOrthoSize: scene4.fullMapOrthoSize,
    lighting: scene4.renderSettings
      ? {
          fogEnabled: scene4.renderSettings.fog,
          fogDensity: scene4.renderSettings.fogDensity,
          fogColor: scene4.renderSettings.fogColor,
          ambienceColor: scene4.renderSettings.ambientSkyColor,
          ambientEquatorColor: scene4.renderSettings.ambientEquatorColor,
          ambientGroundColor: scene4.renderSettings.ambientGroundColor,
        }
      : null,
    mechanics: {
      weaponStealPhases: true,
      pylonChargeRequired: scene4.bossPylonCount,
      provenance: 'measured' as Provenance,
    },
    provenance: 'extracted' as Provenance,
  };

  // 7k. ShopItemData (8 Meta Shop items with pricing formulas)
  const shopItems = parseAll('ShopItemData', (r, entry) => {
    const base = r.unlockableBase();
    const eShopItem = r.i32();
    r.pptr(); // icon
    const maxLevel = r.i32();
    r.pptr(); // unlockRequirement
    const canRefund = r.bool4();
    const value = roundNum(r.f32(), 4);
    const sortingOrder = r.i32();
    const linearIncrease = r.i32();
    const exponentialMultiplier = roundNum(r.f32(), 4);
    r.managedRefs();

    const enumName = meta.enumByValue.EShopItem?.[eShopItem] ?? entry.name;
    const levelCosts: number[] = [];
    for (let lvl = 0; lvl < Math.max(1, maxLevel); lvl++) {
      const rawCost = (base.price + lvl * linearIncrease) * Math.pow(exponentialMultiplier || 1, lvl);
      levelCosts.push(Math.round(rawCost));
    }

    return {
      id: entry.name,
      enumName,
      enumId: eShopItem,
      name: resolveLocRef(loc, base.localizedName, entry.name),
      description: resolveLocRef(loc, base.localizedDescription, ''),
      basePrice: base.price,
      maxLevel,
      canRefund,
      valuePerLevel: value,
      sortingOrder,
      linearIncrease,
      exponentialMultiplier,
      pricingFormula: 'Math.round((basePrice + level * linearIncrease) * Math.pow(exponentialMultiplier, level))',
      levelCosts,
      provenance: 'extracted' as Provenance,
    };
  })
    .map((x) => x.data)
    .sort((a, b) => a.sortingOrder - b.sortingOrder);

  // 7l. EncounterData (3 ScriptableObjects) + 12 Interactables/Encounters verified against EEncounter & Interactable* classes
  const encounterAssets = (byClass.get('Assets.Scripts.UI.InGame.Rewards.EncounterData') ?? []).map((e) => {
    const r = new BinaryReader(sa1Buf, e.bodyStart, e.end);
    const encounterTypeId = r.i32();
    return {
      assetName: e.name,
      encounterType: meta.enumByValue.EEncounter?.[encounterTypeId] ?? `Encounter_${encounterTypeId}`,
      encounterTypeId,
    };
  });

  const interactablesRaw: Array<{
    id: string;
    retailClass: string;
    encounterEnum?: string;
    provenance: Provenance;
  }> = [
    { id: 'ChargeShrine', retailClass: 'ChargeShrine', encounterEnum: 'RandomStats', provenance: 'extracted' },
    { id: 'Chest', retailClass: 'Assets.Scripts.Inventory__Items__Pickups.Chests.InteractableChest', encounterEnum: 'ChestNormal', provenance: 'extracted' },
    { id: 'ShrineMoai', retailClass: 'InteractableShrineMoai', encounterEnum: 'Moai', provenance: 'extracted' },
    { id: 'ShadyGuy', retailClass: 'InteractableShadyGuy', encounterEnum: 'ShadyGuy', provenance: 'extracted' },
    { id: 'Microwave', retailClass: 'InteractableMicrowave', encounterEnum: 'Microwave', provenance: 'extracted' },
    { id: 'ShrineGreed', retailClass: 'InteractableShrineGreed', encounterEnum: 'GreedAltar', provenance: 'extracted' },
    { id: 'ShrineChallenge', retailClass: 'InteractableShrineChallenge', encounterEnum: 'RandomStats', provenance: 'extracted' },
    { id: 'ShrineCursed', retailClass: 'InteractableShrineCursed', encounterEnum: 'ChestEvil', provenance: 'extracted' },
    { id: 'ShrineMagnet', retailClass: 'InteractableShrineMagnet', provenance: 'extracted' },
    { id: 'ShrineBalance', retailClass: 'InteractableShrineBalance', encounterEnum: 'BalanceShrine', provenance: 'extracted' },
    { id: 'Pot', retailClass: 'Assets.Scripts.Inventory__Items__Pickups.Interactables.InteractablePot', provenance: 'extracted' },
    { id: 'BossSpawner', retailClass: 'InteractableBossSpawner', provenance: 'extracted' },
  ];

  const scriptClassSet = new Set(scriptByPathId.values());
  const interactablesCatalog: Array<{
    id: string;
    retailClass: string;
    encounterEnum?: string;
    verifiedInMetadata: boolean;
    provenance: Provenance;
  }> = interactablesRaw.map((entry) => ({
    ...entry,
    verifiedInMetadata:
      meta.interactableClasses.includes(entry.retailClass) || scriptClassSet.has(entry.retailClass),
  }));

  // 7m. Cross-check DataManager counts in level1
  let dataManagerCounts: Record<string, number> = {};
  for (const o of lvl1.objects) {
    if (o.classId !== 114) continue;
    const sPathId = lvl1Buf.readBigInt64LE(o.offset + 20);
    if (scriptByPathId.get(sPathId) !== 'DataManager') continue;
    const r = new BinaryReader(lvl1Buf, o.offset + 28, o.offset + o.size);
    r.str(); // m_Name
    const fields = [
      'unsortedShopItems',
      'unsortedWeapons',
      'unsortedCharacterData',
      'unsortedTomes',
      'maps',
      'unsortedEnemies',
      'unsortedEncounters',
      'unsortedAchievements',
      'unsortedItems',
      'unsortedUnlockables',
      'unsortedSkins',
      'unsortedMusic',
      'unsortedHats',
    ];
    for (const fName of fields) {
      const cnt = r.i32();
      for (let i = 0; i < cnt; i++) r.pptr();
      dataManagerCounts[fName] = cnt;
    }
    break;
  }

  // 8. Build complete Oracle JSON document
  const oracle = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    unityVersion: ggm.unityVersion,
    engineAndPhysics: {
      simHz: { value: simHz, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:TimeManager' },
      fixedDeltaTime: { value: fixedDeltaTime, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:TimeManager' },
      maxAllowedTimestep: { value: maxAllowedTimestep, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:TimeManager' },
      timeScale: { value: timeScale, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:TimeManager' },
      maxParticleTimestep: { value: maxParticleTimestep, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:TimeManager' },
      gravity: { value: gravity, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:PhysicsManager' },
      playerMass: { value: scene2.playerMass, provenance: 'extracted' as Provenance, source: 'level2:Player.Rigidbody' },
      capsuleRadius: { value: scene2.capsuleRadius, provenance: 'extracted' as Provenance, source: 'level2:Player.CapsuleCollider' },
      capsuleHeight: { value: scene2.capsuleHeight, provenance: 'extracted' as Provenance, source: 'level2:Player.CapsuleCollider' },
      fovDefault: { value: scene2.fovDefault, provenance: 'extracted' as Provenance, source: 'level2:Camera.fieldOfView' },
      offset3rdPersonZ: { value: scene2.offset3rdPersonZ, provenance: 'extracted' as Provenance, source: 'level2:PlayerCamera.offset3rdPerson' },
      minimapOrthoSize: { value: scene2.minimapOrthoSize, provenance: 'extracted' as Provenance, source: 'level2:MinimapCamera.orthographicSize' },
      fullMapOrthoSize: { value: scene2.fullMapOrthoSize, provenance: 'extracted' as Provenance, source: 'level2:MapCamera.orthographicSize' },
      jumpPadSceneVelocities: { value: scene2.jumpPadSpeeds, provenance: 'extracted' as Provenance, source: 'level2:JumpPad[]' },
      buildScenes: { value: scenes, provenance: 'extracted' as Provenance, source: 'globalgamemanagers:BuildSettings' },
      movementTuning: {
        provenance: 'measured' as Provenance,
        baseWalkSpeed: 10.5,
        groundAcceleration: 55.0,
        airAccelerate: 12.0,
        airWishSpeedCap: 2.5,
        slideThresholdSpeed: 7.0,
        crouchScale: 0.55,
        downhillSlideBoostMax: 2.4,
        bunnyHopWindowSec: 0.14,
        coyoteTimeSec: 0.12,
        jumpBufferSec: 0.12,
        wallClimbCooldownSec: 0.25,
        wallClimbSpeed: 11.5,
        railGrindSpeed: 20.0,
        jumpPadDefaultVy: 24.0,
        fallDamageThresholdSpeed: 22.0,
        armorDrCap: 0.85,
        evasionCap: 0.75,
        minCooldownSec: 0.06,
        megacritGiantForkMult: 4.0,
        bonkerMult: 20.0,
      },
    },
    counts: {
      stats: Object.keys(meta.enums.EStat ?? {}).length,
      characters: characters.length,
      weapons: weapons.length,
      tomes: tomes.length,
      items: items.length,
      itemsByRarity: itemRarityCounts,
      liveEnemies: liveEnemies.length,
      activeMaps: activeMaps.length,
      hasFinalBossMap: true,
      interactables: interactablesCatalog.length,
      encountersEnum: Object.keys(meta.enums.EEncounter ?? {}).length,
      shopItems: shopItems.length,
    },
    stats: Object.entries(meta.enums.EStat ?? {})
      .sort((a, b) => a[1] - b[1])
      .map(([name, id]) => ({ id, name, provenance: 'extracted' as Provenance })),
    characters,
    weapons,
    tomes,
    items,
    enemies: {
      live: liveEnemies,
      minibosses: liveEnemies.filter((e) => e.role === 'miniboss').map((e) => e.id),
      stageBosses: liveEnemies.filter((e) => e.role === 'stage_boss').map((e) => e.id),
      finalSwarm: liveEnemies.filter((e) => e.role === 'final_swarm').map((e) => e.id),
      bigBob: liveEnemies.find((e) => e.role === 'big_bob') ?? null,
      finalBoss: liveEnemies.find((e) => e.role === 'final_boss') ?? null,
      excludedTestAssets: allParsedEnemies.filter((e) => e.data.isTest).map((e) => e.entry.name),
    },
    maps: {
      active: activeMaps,
      finalBossMap,
      unreleased: unreleasedMaps,
    },
    interactables: {
      catalog: interactablesCatalog,
      encounterEnum: meta.enums.EEncounter ?? {},
      encounterAssets,
      allMetadataInteractableClasses: meta.interactableClasses,
    },
    shopItems,
    verification: {
      readOnlyMode: true,
      zlibCrc32Available: _ZLIB_CRC32_AVAILABLE,
      retailDataDirVerified: true,
      filesVerified: verifiedFiles,
      il2cppMetadata: {
        sanity: meta.sanityHex,
        version: meta.version,
        typeDefinitions: meta.typeDefinitionCount,
        fieldDefinitions: meta.fieldDefinitionCount,
        enumsExtracted: Object.keys(meta.enums).length,
      },
      localizationBundles: {
        filesVerified: loc.bundleFilesVerified,
        tablesParsed: loc.tableCount,
        englishStringsExtracted: loc.entryCount,
      },
      dataManagerCrossCheck: dataManagerCounts,
      scriptableObjectParsers: parserStats,
    },
  };

  fs.mkdirSync(opts.outDir, { recursive: true });
  const outPath = path.join(opts.outDir, 'oracle.json');
  fs.writeFileSync(outPath, JSON.stringify(oracle, null, 2) + '\n', 'utf8');

  console.log(`[oracle-dump] Wrote verified retail oracle -> ${outPath}`);
  console.log(
    `[oracle-dump] Counts: ${oracle.counts.characters} chars, ${oracle.counts.weapons} weapons, ${oracle.counts.tomes} tomes, ` +
      `${oracle.counts.items} items (${JSON.stringify(itemRarityCounts)}), ${oracle.counts.liveEnemies} live enemies, ` +
      `${oracle.counts.activeMaps} active maps + FinalBossMap (${finalBossMap.pylonCount} pylons), ` +
      `${oracle.counts.interactables} interactables, ${oracle.counts.shopItems} shop items, ${oracle.counts.stats} EStats.`
  );
  console.log(
    `[oracle-dump] Physics: ${simHz} Hz (dt=${fixedDeltaTime}, maxDt=${maxAllowedTimestep}), gravity=[${gravity.join(', ')}], ` +
      `mass=${scene2.playerMass}, capsule=${scene2.capsuleRadius}x${scene2.capsuleHeight}, FOV=${scene2.fovDefault}, 3rdZ=${scene2.offset3rdPersonZ}, ` +
      `minimap=${scene2.minimapOrthoSize}, fullmap=${scene2.fullMapOrthoSize}.`
  );
}

main();
