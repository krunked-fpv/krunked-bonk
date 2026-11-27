/**
 * KRUNKEDBONK — Unified Asset Registry (Built-In Procedural Pack + Optional Custom Pack)
 *
 * Supports instant runtime switching between the built-in ProceduralLowPolyPack
 * and an optional user-loaded or dev-served CustomPack (IAssetPack), with seamless
 * per-asset fallback to the Built-In pack whenever an asset is missing or still loading.
 */

import * as THREE from 'three';
import {
  CUSTOM_PACK_DEV_PREFIX,
  type CustomPackFileEntry,
  type IAssetPack,
  type PackManifest,
} from '../contracts/index';
import {
  ProceduralLowPolyPack,
  type ProceduralTextureId,
} from './ProceduralLowPolyPack';

/**
 * Runtime Custom Asset Pack loader implementing IAssetPack.
 * Supports both dev middleware (`/___custom_pack___/manifest.json`) and browser
 * local folder upload (`loadFromFiles`).
 */
export class CustomAssetPack implements IAssetPack {
  private manifest: PackManifest | null = null;
  private loaded = false;
  private baseUrl: string = CUSTOM_PACK_DEV_PREFIX;
  private readonly blobUrls = new Map<string, string>();

  public isLoaded(): boolean {
    return this.loaded && this.manifest !== null;
  }

  public getManifest(): PackManifest | null {
    return this.manifest;
  }

  public async loadFromDevEndpoint(prefix: string = CUSTOM_PACK_DEV_PREFIX): Promise<boolean> {
    this.clear();
    const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    this.baseUrl = cleanPrefix;
    if (typeof fetch !== 'function') return false;

    try {
      const res = await fetch(`${cleanPrefix}/manifest.json`, { cache: 'no-store' });
      if (!res.ok) return false;
      const json = (await res.json()) as PackManifest;
      if (!json || typeof json !== 'object' || !json.textures || !json.palettes) {
        return false;
      }
      this.manifest = { ...json, baseUrl: cleanPrefix };
      this.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  public async loadFromFiles(files: readonly CustomPackFileEntry[]): Promise<boolean> {
    this.clear();
    if (files.length === 0) return false;

    const manifestEntry = files.find(
      (f) => f.relativePath.replace(/\\/g, '/').toLowerCase().endsWith('manifest.json'),
    );
    if (!manifestEntry) return false;

    try {
      const text = new TextDecoder('utf-8').decode(manifestEntry.bytes);
      const parsed = JSON.parse(text) as PackManifest;
      if (!parsed || typeof parsed !== 'object') return false;

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        for (const entry of files) {
          const norm = entry.relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
          const copy = new Uint8Array(entry.bytes.byteLength);
          copy.set(entry.bytes);
          const blob = new Blob([copy.buffer], {
            type: entry.mimeType ?? 'application/octet-stream',
          });
          const url = URL.createObjectURL(blob);
          this.blobUrls.set(norm, url);
          // Also index basename after first folder segment if user dropped a parent directory
          const slashIdx = norm.indexOf('/');
          if (slashIdx >= 0) {
            const sub = norm.slice(slashIdx + 1);
            if (!this.blobUrls.has(sub)) {
              this.blobUrls.set(sub, url);
            }
          }
        }
      }

      this.manifest = parsed;
      this.loaded = true;
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  public clear(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      const revoked = new Set<string>();
      for (const url of this.blobUrls.values()) {
        if (!revoked.has(url)) {
          URL.revokeObjectURL(url);
          revoked.add(url);
        }
      }
    }
    this.blobUrls.clear();
    this.manifest = null;
    this.loaded = false;
  }

  public getTextureUrl(id: string): string | null {
    if (!this.loaded || !this.manifest) return null;
    const entry = this.manifest.textures[id];
    if (!entry) return null;
    return this.resolvePath(entry.path);
  }

  public getAudioUrl(id: string): string | null {
    if (!this.loaded || !this.manifest) return null;
    const entry = this.manifest.audio[id];
    if (!entry) return null;
    return this.resolvePath(entry.path);
  }

  public getLocalizedString(key: string, fallback = key): string {
    if (!this.loaded || !this.manifest) return fallback;
    return this.manifest.localization[key] ?? fallback;
  }

  public getPalette(id: string): readonly string[] | null {
    if (!this.loaded || !this.manifest) return null;
    const entry = this.manifest.palettes[id];
    return entry ? entry.colors : null;
  }

  private resolvePath(relPath: string): string {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const blob = this.blobUrls.get(clean);
    if (blob) return blob;
    return `${this.baseUrl}/${clean}`;
  }
}

export type AssetRegistryChangeListener = () => void;

/**
 * Unified AssetRegistry bridging ProceduralLowPolyPack and optional CustomPack.
 * Always returns crisp NearestFilter THREE.Texture instances immediately (falling back
 * to built-in procedural textures while/if custom overrides are unavailable).
 */
export class AssetRegistry {
  public readonly builtIn: ProceduralLowPolyPack;
  private customPack: IAssetPack | null = null;
  private customPackEnabled = true;
  private readonly customTextureCache = new Map<string, THREE.Texture>();
  private readonly pendingLoads = new Set<string>();
  private readonly listeners = new Set<AssetRegistryChangeListener>();
  private readonly textureLoader: THREE.TextureLoader | null;

  constructor(builtIn?: ProceduralLowPolyPack) {
    this.builtIn = builtIn ?? new ProceduralLowPolyPack();
    this.textureLoader = typeof Image !== 'undefined' ? new THREE.TextureLoader() : null;
  }

  public setCustomPack(pack: IAssetPack | null): void {
    if (this.customPack === pack) return;
    this.disposeCustomTextures();
    this.customPack = pack;
    this.notifyChanged();
  }

  public getCustomPack(): IAssetPack | null {
    return this.customPack;
  }

  public setCustomPackEnabled(enabled: boolean): void {
    if (this.customPackEnabled === enabled) return;
    this.customPackEnabled = enabled;
    this.notifyChanged();
  }

  public isCustomPackActive(): boolean {
    return this.customPackEnabled && this.customPack !== null && this.customPack.isLoaded();
  }

  public onChange(listener: AssetRegistryChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns a crisp NearestFilter texture for `id`.
   * If CustomPack is active and has an override texture, initiates async load once
   * and returns the loaded custom texture as soon as ready; otherwise immediately
   * returns the built-in procedural pixel texture.
   */
  public getTexture(id: ProceduralTextureId): THREE.Texture {
    if (this.isCustomPackActive() && this.customPack) {
      const cached = this.customTextureCache.get(id);
      if (cached) return cached;

      const url = this.customPack.getTextureUrl(id);
      if (url && this.textureLoader && !this.pendingLoads.has(id)) {
        this.pendingLoads.add(id);
        this.textureLoader.load(
          url,
          (loadedTex) => {
            this.pendingLoads.delete(id);
            loadedTex.magFilter = THREE.NearestFilter;
            loadedTex.minFilter = THREE.NearestFilter;
            loadedTex.generateMipmaps = false;
            loadedTex.wrapS = THREE.RepeatWrapping;
            loadedTex.wrapT = THREE.RepeatWrapping;
            loadedTex.colorSpace = THREE.SRGBColorSpace;
            loadedTex.needsUpdate = true;
            this.customTextureCache.set(id, loadedTex);
            this.notifyChanged();
          },
          undefined,
          () => {
            this.pendingLoads.delete(id);
          },
        );
      }
    }
    return this.builtIn.getProceduralTexture(id);
  }

  public getPalette(id: string): readonly string[] | null {
    if (this.isCustomPackActive() && this.customPack) {
      const custom = this.customPack.getPalette(id);
      if (custom && custom.length > 0) return custom;
    }
    return this.builtIn.getPalette(id);
  }

  public getLocalizedString(key: string, fallback = key): string {
    if (this.isCustomPackActive() && this.customPack) {
      const custom = this.customPack.getLocalizedString(key, '');
      if (custom) return custom;
    }
    return this.builtIn.getLocalizedString(key, fallback);
  }

  public getAudioUrl(id: string): string | null {
    if (this.isCustomPackActive() && this.customPack) {
      return this.customPack.getAudioUrl(id);
    }
    return this.builtIn.getAudioUrl(id);
  }

  private disposeCustomTextures(): void {
    for (const tex of this.customTextureCache.values()) {
      tex.dispose();
    }
    this.customTextureCache.clear();
    this.pendingLoads.clear();
  }

  private notifyChanged(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public dispose(): void {
    this.disposeCustomTextures();
    this.listeners.clear();
    this.builtIn.dispose();
  }
}
