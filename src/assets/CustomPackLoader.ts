/**
 * KRUNKEDBONK — Browser Custom Asset Pack Loader & IndexedDB Persistence
 *
 * Powers the Title Screen / Settings "LOAD CUSTOM PACK" flow with:
 * - Modern `window.showDirectoryPicker()` + automatic `<input type="file" webkitdirectory multiple>` fallback
 * - Compatible asset filtering (`.png`, `.webp`, `.json`, `.ogg`, `.wav`, `.mp3`) & strict `PackManifest` validation
 * - IndexedDB persistence (`DB_NAME = 'krunkedbonk_custom_pack_v1'`) with safe no-op fallbacks for headless Node / private browsing
 * - Unified startup probe (`loadCustomPackFromDevOrDb`) preferring persisted IndexedDB packs over the dev-only Vite middleware
 */

import {
  CUSTOM_PACK_DEV_PREFIX,
  type CustomPackFileEntry,
  type IAssetPack,
  type PackManifest,
} from '../contracts/index';

export const DB_NAME = 'krunkedbonk_custom_pack_v1' as const;
export const DB_VERSION = 1 as const;
export const FILES_STORE_NAME = 'pack_files' as const;
export const META_STORE_NAME = 'pack_meta' as const;

export const COMPATIBLE_PACK_EXTENSIONS = [
  '.png',
  '.webp',
  '.json',
  '.ogg',
  '.wav',
  '.mp3',
] as const;

const COMPATIBLE_EXT_SET: ReadonlySet<string> = new Set<string>(COMPATIBLE_PACK_EXTENSIONS);

const IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '__macosx',
]);

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export interface PackManifestValidationResult {
  valid: boolean;
  manifest: PackManifest | null;
  errors: string[];
}

export interface PickCustomPackOptions {
  /** Skip `window.showDirectoryPicker()` and force the `<input webkitdirectory>` fallback. */
  preferFallbackInput?: boolean;
  /** Automatically persist a valid picked pack to IndexedDB before returning. Defaults to false. */
  persistToDb?: boolean;
}

export interface PickCustomPackResult {
  cancelled: boolean;
  packName: string | null;
  manifest: PackManifest | null;
  files: CustomPackFileEntry[];
  errors: string[];
}

export interface StoredCustomPack {
  manifest: PackManifest;
  files: CustomPackFileEntry[];
  packName: string | null;
  savedAt: string | null;
}

export type CustomPackSource = 'indexeddb' | 'dev_endpoint' | 'none';

export interface CustomPackLoadResult {
  manifest: PackManifest | null;
  files: CustomPackFileEntry[];
  source: CustomPackSource;
  packName: string | null;
}

export interface LoadCustomPackOptions {
  devPrefix?: string;
  /** Override dev-mode detection (defaults to Vite `import.meta.env.DEV` or localhost check). */
  allowDevEndpoint?: boolean;
  /** Optional custom `fetch` implementation for testing. */
  fetchImpl?: typeof fetch;
}

// Local ambient interfaces for the File System Access API (avoids global DOM pollution)
interface FsFileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}

interface FsDirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterableIterator<FsFileHandleLike | FsDirectoryHandleLike>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<FsDirectoryHandleLike>;
}

interface StoredFileRecord {
  relativePath: string;
  bytes: Uint8Array;
  mimeType: string;
}

interface StoredMetaRecord {
  key: 'current';
  packName: string | null;
  savedAt: string;
  fileCount: number;
  totalBytes: number;
}

// ============================================================================
// 1. PATH, EXTENSION & MANIFEST VALIDATION HELPERS
// ============================================================================

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPathTraversal(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return true;
  return norm.split('/').some((seg) => seg === '..');
}

export function normalizePackPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function getLowerExtension(filePath: string): string {
  const norm = normalizePackPath(filePath);
  const slashIdx = norm.lastIndexOf('/');
  const base = slashIdx >= 0 ? norm.slice(slashIdx + 1) : norm;
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx <= 0) return '';
  return base.slice(dotIdx).toLowerCase();
}

export function isCompatiblePackFile(filePath: string): boolean {
  const norm = normalizePackPath(filePath);
  if (!norm) return false;
  const base = norm.slice(norm.lastIndexOf('/') + 1).toLowerCase();
  if (base === '.ds_store' || base === 'thumbs.db' || base === 'desktop.ini') {
    return false;
  }
  return COMPATIBLE_EXT_SET.has(getLowerExtension(norm));
}

export function inferPackMimeType(filePath: string, fallback?: string): string {
  const ext = getLowerExtension(filePath);
  if (ext && MIME_BY_EXTENSION[ext]) {
    return MIME_BY_EXTENSION[ext];
  }
  return fallback && fallback.trim().length > 0 ? fallback : 'application/octet-stream';
}

/**
 * Validates that an unknown JSON object conforms to the `PackManifest` contract.
 */
export function validatePackManifest(input: unknown): PackManifestValidationResult {
  const errors: string[] = [];

  if (!isPlainRecord(input)) {
    return { valid: false, manifest: null, errors: ['Manifest root must be a JSON object.'] };
  }

  if (typeof input.version !== 'string' || input.version.trim().length === 0) {
    errors.push('Manifest "version" must be a non-empty string.');
  }

  if (typeof input.generatedAt !== 'string' || input.generatedAt.trim().length === 0) {
    errors.push('Manifest "generatedAt" must be a non-empty ISO timestamp string.');
  }

  if (typeof input.sourceVerified !== 'boolean') {
    errors.push('Manifest "sourceVerified" must be a boolean.');
  }

  if (input.baseUrl !== undefined && typeof input.baseUrl !== 'string') {
    errors.push('Manifest "baseUrl", when provided, must be a string.');
  }

  // Validate textures map
  if (!isPlainRecord(input.textures)) {
    errors.push('Manifest "textures" must be an object map.');
  } else {
    let invalidTex = 0;
    for (const [key, entry] of Object.entries(input.textures)) {
      if (!isPlainRecord(entry) || typeof entry.id !== 'string' || typeof entry.path !== 'string' || entry.path.trim().length === 0) {
        invalidTex++;
        if (invalidTex <= 5) {
          errors.push(`Texture entry "${key}" must include string "id" and non-empty "path".`);
        }
      } else if (!entry.path.startsWith('procedural://') && hasPathTraversal(entry.path)) {
        invalidTex++;
        if (invalidTex <= 5) {
          errors.push(`Texture entry "${key}" contains disallowed path "${entry.path}".`);
        }
      }
    }
    if (invalidTex > 5) {
      errors.push(`...and ${invalidTex - 5} additional invalid texture entries.`);
    }
  }

  // Validate audio map
  if (!isPlainRecord(input.audio)) {
    errors.push('Manifest "audio" must be an object map.');
  } else {
    let invalidAudio = 0;
    for (const [key, entry] of Object.entries(input.audio)) {
      if (!isPlainRecord(entry) || typeof entry.id !== 'string' || typeof entry.path !== 'string' || entry.path.trim().length === 0) {
        invalidAudio++;
        if (invalidAudio <= 5) {
          errors.push(`Audio entry "${key}" must include string "id" and non-empty "path".`);
        }
      } else if (hasPathTraversal(entry.path)) {
        invalidAudio++;
        if (invalidAudio <= 5) {
          errors.push(`Audio entry "${key}" contains disallowed path "${entry.path}".`);
        }
      }
    }
    if (invalidAudio > 5) {
      errors.push(`...and ${invalidAudio - 5} additional invalid audio entries.`);
    }
  }

  // Validate localization map
  if (!isPlainRecord(input.localization)) {
    errors.push('Manifest "localization" must be an object map of key -> string.');
  } else {
    let invalidLoc = 0;
    for (const [key, val] of Object.entries(input.localization)) {
      if (typeof val !== 'string') {
        invalidLoc++;
        if (invalidLoc <= 5) {
          errors.push(`Localization entry "${key}" must be a string.`);
        }
      }
    }
    if (invalidLoc > 5) {
      errors.push(`...and ${invalidLoc - 5} additional invalid localization entries.`);
    }
  }

  // Validate palettes map
  if (!isPlainRecord(input.palettes)) {
    errors.push('Manifest "palettes" must be an object map.');
  } else {
    let invalidPal = 0;
    for (const [key, entry] of Object.entries(input.palettes)) {
      if (
        !isPlainRecord(entry) ||
        typeof entry.id !== 'string' ||
        !Array.isArray(entry.colors) ||
        !entry.colors.every((c) => typeof c === 'string')
      ) {
        invalidPal++;
        if (invalidPal <= 5) {
          errors.push(`Palette entry "${key}" must include string "id" and string[] "colors".`);
        }
      }
    }
    if (invalidPal > 5) {
      errors.push(`...and ${invalidPal - 5} additional invalid palette entries.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, manifest: null, errors };
  }

  return {
    valid: true,
    manifest: input as unknown as PackManifest,
    errors: [],
  };
}

/**
 * Finds the shallowest `manifest.json` entry in a list of custom pack files.
 */
export function findManifestFileEntry(
  files: readonly CustomPackFileEntry[],
): CustomPackFileEntry | null {
  let best: CustomPackFileEntry | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;

  for (let i = 0; i < files.length; i++) {
    const entry = files[i]!;
    const norm = normalizePackPath(entry.relativePath).toLowerCase();
    if (norm === 'manifest.json' || norm.endsWith('/manifest.json')) {
      const depth = norm.split('/').length;
      if (depth < bestDepth) {
        best = entry;
        bestDepth = depth;
      }
    }
  }
  return best;
}

/**
 * Locates, UTF-8 decodes, parses, and validates `manifest.json` from a set of pack files.
 */
export function parseManifestFromFiles(
  files: readonly CustomPackFileEntry[],
): PackManifestValidationResult {
  const manifestEntry = findManifestFileEntry(files);
  if (!manifestEntry) {
    return {
      valid: false,
      manifest: null,
      errors: ['No manifest.json file found in the selected custom pack directory.'],
    };
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder('utf-8').decode(manifestEntry.bytes);
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      manifest: null,
      errors: [`Failed to parse manifest.json: ${msg}`],
    };
  }

  return validatePackManifest(parsed);
}

/**
 * Filters raw directory file entries to compatible custom-pack extensions, normalizes
 * paths (stripping a common top-level folder prefix if `<root>/manifest.json` exists),
 * and extracts the pack's display name.
 */
export function normalizePickedEntries(
  rawEntries: readonly CustomPackFileEntry[],
  explicitPackName?: string | null,
): { packName: string | null; files: CustomPackFileEntry[] } {
  const compatible: CustomPackFileEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i]!;
    const norm = normalizePackPath(entry.relativePath);
    if (!norm || hasPathTraversal(norm) || !isCompatiblePackFile(norm)) {
      continue;
    }
    compatible.push({
      relativePath: norm,
      bytes: entry.bytes,
      mimeType: inferPackMimeType(norm, entry.mimeType),
    });
  }

  let packName = explicitPackName?.trim() || null;

  // Detect shared root directory prefix (typical of `<input webkitdirectory>`)
  let sharedRoot: string | null = null;
  if (compatible.length > 0) {
    const first = compatible[0]!.relativePath;
    const firstSlash = first.indexOf('/');
    if (firstSlash > 0) {
      const candidate = first.slice(0, firstSlash);
      const prefix = `${candidate}/`;
      if (compatible.every((e) => e.relativePath.startsWith(prefix))) {
        sharedRoot = candidate;
      }
    }
  }

  if (sharedRoot && !packName) {
    packName = sharedRoot;
  }

  const deduped = new Map<string, CustomPackFileEntry>();
  const stripPrefix = sharedRoot ? `${sharedRoot}/` : '';

  for (let i = 0; i < compatible.length; i++) {
    const entry = compatible[i]!;
    const rel = stripPrefix ? entry.relativePath.slice(stripPrefix.length) : entry.relativePath;
    if (!rel) continue;
    deduped.set(rel, {
      relativePath: rel,
      bytes: entry.bytes,
      mimeType: entry.mimeType,
    });
  }

  return {
    packName,
    files: Array.from(deduped.values()),
  };
}

// ============================================================================
// 2. DIRECTORY PICKER (showDirectoryPicker + <input webkitdirectory> FALLBACK)
// ============================================================================

async function collectEntriesFromDirectoryHandle(
  dirHandle: FsDirectoryHandleLike,
  prefix: string,
  out: CustomPackFileEntry[],
): Promise<void> {
  for await (const handle of dirHandle.values()) {
    const name = handle.name;
    if (!name) continue;

    if (handle.kind === 'directory') {
      if (IGNORED_DIRECTORY_NAMES.has(name.toLowerCase())) continue;
      const nextPrefix = prefix ? `${prefix}/${name}` : name;
      await collectEntriesFromDirectoryHandle(handle, nextPrefix, out);
    } else if (handle.kind === 'file') {
      const relPath = prefix ? `${prefix}/${name}` : name;
      if (!isCompatiblePackFile(relPath)) continue;
      try {
        const file = await handle.getFile();
        const buf = await file.arrayBuffer();
        out.push({
          relativePath: relPath,
          bytes: new Uint8Array(buf),
          mimeType: inferPackMimeType(relPath, file.type),
        });
      } catch {
        // Skip unreadable individual files gracefully
      }
    }
  }
}

async function pickViaFallbackInput(): Promise<{
  cancelled: boolean;
  packName: string | null;
  files: CustomPackFileEntry[];
}> {
  if (typeof document === 'undefined' || !document.body) {
    return { cancelled: true, packName: null, files: [] };
  }

  const fileList = await new Promise<FileList | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (focusTimer !== null) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
      }
      input.remove();
    };

    const finish = (files: FileList | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(files);
    };

    const onChange = (): void => {
      finish(input.files && input.files.length > 0 ? input.files : null);
    };

    const onCancel = (): void => {
      finish(null);
    };

    const onWindowFocus = (): void => {
      // Fallback for browsers that do not emit the HTMLInputElement `cancel` event
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 350);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onWindowFocus);
    }

    document.body.appendChild(input);
    input.click();
  });

  if (!fileList || fileList.length === 0) {
    return { cancelled: true, packName: null, files: [] };
  }

  const rawEntries: CustomPackFileEntry[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (!isCompatiblePackFile(rel)) continue;
    try {
      const buf = await file.arrayBuffer();
      rawEntries.push({
        relativePath: rel,
        bytes: new Uint8Array(buf),
        mimeType: inferPackMimeType(rel, file.type),
      });
    } catch {
      // Skip unreadable files gracefully
    }
  }

  const normalized = normalizePickedEntries(rawEntries);
  return {
    cancelled: false,
    packName: normalized.packName,
    files: normalized.files,
  };
}

/**
 * Opens a browser directory picker for selecting a user-owned Custom Asset Pack folder.
 * Uses `window.showDirectoryPicker()` when available with automatic fallback to
 * `<input type="file" webkitdirectory multiple>`, filters to compatible files
 * (`.png`, `.webp`, `.json`, `.ogg`, `.wav`, `.mp3`), and validates `manifest.json`.
 */
export async function pickCustomPackDirectory(
  options: PickCustomPackOptions = {},
): Promise<PickCustomPackResult> {
  if (typeof window === 'undefined') {
    return {
      cancelled: true,
      packName: null,
      manifest: null,
      files: [],
      errors: ['Directory picker is unavailable in a non-browser environment.'],
    };
  }

  let picked: { cancelled: boolean; packName: string | null; files: CustomPackFileEntry[] } | null =
    null;

  const pickerWin = window as WindowWithDirectoryPicker;
  if (!options.preferFallbackInput && typeof pickerWin.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await pickerWin.showDirectoryPicker({
        id: 'krunkedbonk-custom-pack',
        mode: 'read',
      });
      const rawEntries: CustomPackFileEntry[] = [];
      await collectEntriesFromDirectoryHandle(dirHandle, '', rawEntries);
      const normalized = normalizePickedEntries(rawEntries, dirHandle.name || null);
      picked = {
        cancelled: false,
        packName: normalized.packName,
        files: normalized.files,
      };
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'AbortError') {
        return {
          cancelled: true,
          packName: null,
          manifest: null,
          files: [],
          errors: [],
        };
      }
      // Fall back to <input webkitdirectory> if showDirectoryPicker is blocked or unsupported
      picked = null;
    }
  }

  if (!picked) {
    picked = await pickViaFallbackInput();
  }

  if (picked.cancelled) {
    return {
      cancelled: true,
      packName: null,
      manifest: null,
      files: [],
      errors: [],
    };
  }

  const validation = parseManifestFromFiles(picked.files);
  if (!validation.valid || !validation.manifest) {
    return {
      cancelled: false,
      packName: picked.packName,
      manifest: null,
      files: picked.files,
      errors: validation.errors,
    };
  }

  if (options.persistToDb) {
    await saveCustomPackToDb(picked.files, picked.packName);
  }

  return {
    cancelled: false,
    packName: picked.packName ?? 'Custom Pack',
    manifest: validation.manifest,
    files: picked.files,
    errors: [],
  };
}

// ============================================================================
// 3. INDEXEDDB PERSISTENCE (`krunkedbonk_custom_pack_v1`)
// ============================================================================

function getIndexedDbFactory(): IDBFactory | null {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB !== null) {
      return indexedDB;
    }
  } catch {
    // Accessing indexedDB can throw SecurityError in restricted iframes / private modes
  }
  return null;
}

function openCustomPackDb(): Promise<IDBDatabase | null> {
  const idb = getIndexedDbFactory();
  if (!idb) return Promise.resolve(null);

  return new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
        db.createObjectStore(FILES_STORE_NAME, { keyPath: 'relativePath' });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      resolve(null);
    };

    req.onblocked = () => {
      resolve(null);
    };
  });
}

function toUint8Array(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return null;
}

/**
 * Persists a custom pack's file entries into IndexedDB (`krunkedbonk_custom_pack_v1`),
 * replacing any previously saved pack atomically. Returns `false` safely in headless
 * Node or restricted/private browsing contexts without throwing.
 */
export async function saveCustomPackToDb(
  files: readonly CustomPackFileEntry[],
  packName?: string | null,
): Promise<boolean> {
  if (files.length === 0) return false;
  const db = await openCustomPackDb();
  if (!db) return false;

  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      try {
        const tx = db.transaction([FILES_STORE_NAME, META_STORE_NAME], 'readwrite');
        const filesStore = tx.objectStore(FILES_STORE_NAME);
        const metaStore = tx.objectStore(META_STORE_NAME);

        filesStore.clear();
        metaStore.clear();

        let totalBytes = 0;
        let storedCount = 0;

        for (let i = 0; i < files.length; i++) {
          const entry = files[i]!;
          const rel = normalizePackPath(entry.relativePath);
          if (!rel || hasPathTraversal(rel)) continue;
          const copy = new Uint8Array(entry.bytes.byteLength);
          copy.set(entry.bytes);
          totalBytes += copy.byteLength;
          storedCount++;

          const rec: StoredFileRecord = {
            relativePath: rel,
            bytes: copy,
            mimeType: inferPackMimeType(rel, entry.mimeType),
          };
          filesStore.put(rec);
        }

        const meta: StoredMetaRecord = {
          key: 'current',
          packName: packName?.trim() || null,
          savedAt: new Date().toISOString(),
          fileCount: storedCount,
          totalBytes,
        };
        metaStore.put(meta);

        tx.oncomplete = () => done(storedCount > 0);
        tx.onerror = () => done(false);
        tx.onabort = () => done(false);
      } catch {
        done(false);
      }
    });
  } finally {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Loads and validates the persisted Custom Asset Pack from IndexedDB.
 * Returns `null` safely if no pack is saved, schema is invalid, or IndexedDB is unavailable.
 */
export async function loadCustomPackFromDb(): Promise<StoredCustomPack | null> {
  const db = await openCustomPackDb();
  if (!db) return null;

  try {
    const raw = await new Promise<{
      records: StoredFileRecord[];
      meta: StoredMetaRecord | null;
    } | null>((resolve) => {
      let settled = false;
      const done = (
        value: { records: StoredFileRecord[]; meta: StoredMetaRecord | null } | null,
      ): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      try {
        const tx = db.transaction([FILES_STORE_NAME, META_STORE_NAME], 'readonly');
        const filesStore = tx.objectStore(FILES_STORE_NAME);
        const metaStore = tx.objectStore(META_STORE_NAME);

        const filesReq = filesStore.getAll();
        const metaReq = metaStore.get('current');

        let records: StoredFileRecord[] = [];
        let meta: StoredMetaRecord | null = null;

        filesReq.onsuccess = () => {
          records = Array.isArray(filesReq.result)
            ? (filesReq.result as StoredFileRecord[])
            : [];
        };
        metaReq.onsuccess = () => {
          meta = isPlainRecord(metaReq.result)
            ? (metaReq.result as unknown as StoredMetaRecord)
            : null;
        };

        tx.oncomplete = () => done({ records, meta });
        tx.onerror = () => done(null);
        tx.onabort = () => done(null);
      } catch {
        done(null);
      }
    });

    if (!raw || raw.records.length === 0) return null;

    const files: CustomPackFileEntry[] = [];
    for (let i = 0; i < raw.records.length; i++) {
      const rec = raw.records[i];
      if (!rec || typeof rec.relativePath !== 'string') continue;
      const bytes = toUint8Array(rec.bytes);
      if (!bytes) continue;
      files.push({
        relativePath: normalizePackPath(rec.relativePath),
        bytes,
        mimeType:
          typeof rec.mimeType === 'string'
            ? rec.mimeType
            : inferPackMimeType(rec.relativePath),
      });
    }

    const validation = parseManifestFromFiles(files);
    if (!validation.valid || !validation.manifest) {
      return null;
    }

    return {
      manifest: validation.manifest,
      files,
      packName: raw.meta?.packName ?? 'Saved Custom Pack',
      savedAt: raw.meta?.savedAt ?? null,
    };
  } finally {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Clears any persisted Custom Asset Pack from IndexedDB.
 * Safe no-op in headless Node / private browsing.
 */
export async function clearCustomPackFromDb(): Promise<boolean> {
  const db = await openCustomPackDb();
  if (!db) return false;

  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      try {
        const tx = db.transaction([FILES_STORE_NAME, META_STORE_NAME], 'readwrite');
        tx.objectStore(FILES_STORE_NAME).clear();
        tx.objectStore(META_STORE_NAME).clear();
        tx.oncomplete = () => done(true);
        tx.onerror = () => done(false);
        tx.onabort = () => done(false);
      } catch {
        done(false);
      }
    });
  } finally {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Fast check whether a Custom Asset Pack is currently persisted in IndexedDB.
 * Safe no-op (`false`) in headless Node / private browsing.
 */
export async function hasSavedCustomPack(): Promise<boolean> {
  const db = await openCustomPackDb();
  if (!db) return false;

  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (hasPack: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(hasPack);
      };

      try {
        const tx = db.transaction([FILES_STORE_NAME], 'readonly');
        const countReq = tx.objectStore(FILES_STORE_NAME).count();
        countReq.onsuccess = () => done(typeof countReq.result === 'number' && countReq.result > 0);
        countReq.onerror = () => done(false);
        tx.onerror = () => done(false);
        tx.onabort = () => done(false);
      } catch {
        done(false);
      }
    });
  } finally {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }
}

// ============================================================================
// 4. UNIFIED STARTUP PROBE (IndexedDB -> Dev Endpoint -> None)
// ============================================================================

function isDevEnvironment(): boolean {
  const meta = import.meta as unknown as { env?: { DEV?: boolean } };
  if (typeof meta?.env?.DEV === 'boolean') {
    return meta.env.DEV;
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }
  return false;
}

/**
 * Loads an available Custom Asset Pack in priority order:
 * 1. Persisted IndexedDB pack (`source: 'indexeddb'`)
 * 2. Dev-only Vite middleware at `/__custom_pack__/manifest.json` (`source: 'dev_endpoint'`)
 * 3. Clean fallback (`source: 'none'`) — never throws on 404 or network errors!
 */
export async function loadCustomPackFromDevOrDb(
  options: LoadCustomPackOptions = {},
): Promise<CustomPackLoadResult> {
  // 1. Prefer user-saved IndexedDB custom pack
  const fromDb = await loadCustomPackFromDb();
  if (fromDb) {
    return {
      manifest: fromDb.manifest,
      files: fromDb.files,
      source: 'indexeddb',
      packName: fromDb.packName,
    };
  }

  // 2. Fallback to Vite dev-only middleware when running in dev
  const allowDev = options.allowDevEndpoint ?? isDevEnvironment();
  const fetchFn = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);

  if (allowDev && fetchFn) {
    const cleanPrefix = (options.devPrefix ?? CUSTOM_PACK_DEV_PREFIX).replace(/\/+$/, '');
    try {
      const res = await fetchFn(`${cleanPrefix}/manifest.json`, { cache: 'no-store' });
      if (res && res.ok) {
        const json: unknown = await res.json();
        const validation = validatePackManifest(json);
        if (validation.valid && validation.manifest) {
          return {
            manifest: { ...validation.manifest, baseUrl: `${cleanPrefix}/` },
            files: [],
            source: 'dev_endpoint',
            packName: 'Local Dev Pack',
          };
        }
      }
    } catch {
      // 404, offline, or non-JSON responses fall through cleanly to source: 'none'
    }
  }

  // 3. No custom pack active; fall back to Built-In ProceduralLowPolyPack
  return {
    manifest: null,
    files: [],
    source: 'none',
    packName: null,
  };
}

/**
 * Convenience helper to apply a `CustomPackLoadResult` directly into an `IAssetPack`
 * instance (e.g., `CustomAssetPack`).
 */
export async function applyCustomPackLoadResult(
  targetPack: IAssetPack,
  loaded: CustomPackLoadResult,
  devPrefix: string = CUSTOM_PACK_DEV_PREFIX,
): Promise<boolean> {
  if (loaded.source === 'indexeddb' && loaded.files.length > 0) {
    return targetPack.loadFromFiles(loaded.files);
  }
  if (loaded.source === 'dev_endpoint') {
    const prefix = loaded.manifest?.baseUrl
      ? loaded.manifest.baseUrl.replace(/\/+$/, '')
      : devPrefix;
    return targetPack.loadFromDevEndpoint(prefix);
  }
  targetPack.clear();
  return false;
}
