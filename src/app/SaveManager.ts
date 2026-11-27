import {
  CAMERA_3RD_OFFSET_Z,
  CHARACTER_IDS,
  DEFAULT_RENDER_SETTINGS,
  FOV_MAX,
  FOV_MIN,
  GAMEPAD_DEADZONE_DEFAULT,
  MAP_IDS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  SHOP_UPGRADE_IDS,
  createDefaultSaveData,
} from '../contracts/index';
import type {
  CameraMode,
  CharacterId,
  FpsCap,
  GamepadCalibration,
  GamepadProfile,
  GrassQuality,
  MapId,
  MapTier,
  MetaShopUpgradeDef,
  QuestDef,
  RenderSettings,
  RunRecord,
  SaveData,
  ShopUpgradeId,
} from '../contracts/index';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SanitizeSaveResult {
  data: SaveData;
  recovered: boolean;
  issues: string[];
}

export interface ShopPurchaseResult {
  ok: boolean;
  reason?: 'max_rank' | 'insufficient_silver' | 'invalid_upgrade';
  cost: number;
  newRank: number;
  remainingSilver: number;
}

export interface ShopRefundResult {
  ok: boolean;
  refundedSilver: number;
  newRank: number;
  remainingSilver: number;
}

export interface QuestClaimResult {
  ok: boolean;
  reason?: 'already_claimed' | 'incomplete';
  rewardSilver: number;
}

export interface RecordRunOptions {
  maxLeaderboardEntries?: number;
  awardSilver?: boolean;
}

export interface RecordRunResult {
  rank: number | null;
  isNewBest: boolean;
}

export interface SaveManagerOptions {
  storageKey?: string;
  storage?: StorageLike | null;
  maxLeaderboardEntries?: number;
  autoLoad?: boolean;
}

const VALID_CHARACTERS = new Set<string>(CHARACTER_IDS);
const VALID_MAPS = new Set<string>(MAP_IDS);
const VALID_FPS_CAPS = new Set<number>([30, 60, 120, 0]);
const VALID_CAMERA_MODES = new Set<string>(['third', 'first']);
const VALID_GRASS_QUALITY = new Set<string>(['low', 'med', 'high']);
const VALID_GAMEPAD_PROFILES = new Set<string>([
  'xbox',
  'playstation',
  'switch',
  'steam_deck',
  'tesla',
  'generic',
]);

const DEFAULT_MAX_LEADERBOARD = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function nonNegInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function nonNegNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableStringOr(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function uniqueStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function uniqueEnumArray<T extends string>(
  value: unknown,
  validSet: ReadonlySet<string>,
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of value) {
    if (typeof item === 'string' && validSet.has(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item as T);
    }
  }
  return out.length > 0 ? out : [...fallback];
}

function cloneSaveData(data: SaveData): SaveData {
  return {
    ...data,
    unlockedCharacters: [...data.unlockedCharacters],
    unlockedWeapons: [...data.unlockedWeapons],
    unlockedTomes: [...data.unlockedTomes],
    unlockedItems: [...data.unlockedItems],
    unlockedMaps: [...data.unlockedMaps],
    unlockedSkins: [...data.unlockedSkins],
    unlockedHats: [...data.unlockedHats],
    completedChallenges: [...data.completedChallenges],
    questProgress: { ...data.questProgress },
    claimedQuests: [...data.claimedQuests],
    shopLevels: { ...data.shopLevels },
    settings: {
      ...data.settings,
      gamepad: { ...data.settings.gamepad },
    },
    bestRuns: data.bestRuns.map((r) => ({ ...r })),
  };
}

/**
 * Pure geometric cost formula for Meta Shop upgrades:
 * `round(baseSilverCost * costGrowthMult ^ currentRank)`
 */
export function computeShopUpgradeCost(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.floor(currentRank));
  const raw = def.baseSilverCost * Math.pow(def.costGrowthMult, rank);
  return Math.max(1, Math.round(raw));
}

/** Total silver spent to reach `currentRank` from rank 0. */
export function computeTotalShopUpgradeSpent(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.min(def.maxRank, Math.floor(currentRank)));
  let total = 0;
  for (let r = 0; r < rank; r++) {
    total += computeShopUpgradeCost(def, r);
  }
  return total;
}

export function sanitizeGamepadCalibration(raw: unknown): GamepadCalibration {
  const d = DEFAULT_RENDER_SETTINGS.gamepad;
  if (!isRecord(raw)) {
    return { ...d };
  }
  const profile: GamepadProfile =
    typeof raw.profile === 'string' && VALID_GAMEPAD_PROFILES.has(raw.profile)
      ? (raw.profile as GamepadProfile)
      : d.profile;
  return {
    profile,
    deadzone: clampFinite(raw.deadzone, 0.02, 0.5, GAMEPAD_DEADZONE_DEFAULT),
    sensitivityX: clampFinite(raw.sensitivityX, 0.2, 4.0, d.sensitivityX),
    sensitivityY: clampFinite(raw.sensitivityY, 0.2, 4.0, d.sensitivityY),
    invertY: boolOr(raw.invertY, d.invertY),
    vibration: boolOr(raw.vibration, d.vibration),
    swapConfirmCancel: boolOr(raw.swapConfirmCancel, d.swapConfirmCancel),
  };
}

export function sanitizeRenderSettings(raw: unknown): RenderSettings {
  const d = DEFAULT_RENDER_SETTINGS;
  if (!isRecord(raw)) {
    return { ...d, gamepad: { ...d.gamepad } };
  }
  const cameraMode: CameraMode =
    typeof raw.cameraMode === 'string' && VALID_CAMERA_MODES.has(raw.cameraMode)
      ? (raw.cameraMode as CameraMode)
      : d.cameraMode;
  const fpsCap: FpsCap =
    typeof raw.fpsCap === 'number' && VALID_FPS_CAPS.has(raw.fpsCap)
      ? (raw.fpsCap as FpsCap)
      : d.fpsCap;
  const grassQuality: GrassQuality =
    typeof raw.grassQuality === 'string' && VALID_GRASS_QUALITY.has(raw.grassQuality)
      ? (raw.grassQuality as GrassQuality)
      : d.grassQuality;
  const celBands: 2 | 3 = raw.celBands === 2 || raw.celBands === 3 ? raw.celBands : d.celBands;

  return {
    fov: clampFinite(raw.fov, FOV_MIN, FOV_MAX, d.fov),
    cameraMode,
    cameraDistance: clampFinite(raw.cameraDistance, 4.0, 22.0, CAMERA_3RD_OFFSET_Z),
    fpsCap,
    classic50HzSnap: boolOr(raw.classic50HzSnap, d.classic50HzSnap),
    grassQuality,
    boomboxTrack: stringOr(raw.boomboxTrack, d.boomboxTrack),
    unlockAll: boolOr(raw.unlockAll, d.unlockAll),
    pixelScale: clampFinite(raw.pixelScale, 0.25, 1.5, d.pixelScale),
    outlineEnabled: boolOr(raw.outlineEnabled, d.outlineEnabled),
    outlineThickness: clampFinite(raw.outlineThickness, 0.25, 3.0, d.outlineThickness),
    celBands,
    shadowsEnabled: boolOr(raw.shadowsEnabled, d.shadowsEnabled),
    damageNumbersEnabled: boolOr(raw.damageNumbersEnabled, d.damageNumbersEnabled),
    screenShakeIntensity: clampFinite(raw.screenShakeIntensity, 0, 1.5, d.screenShakeIntensity),
    minimapVisible: boolOr(raw.minimapVisible, d.minimapVisible),
    showFpsCounter: boolOr(raw.showFpsCounter, d.showFpsCounter),
    audioMaster: clampFinite(raw.audioMaster, 0, 1, d.audioMaster),
    audioSfx: clampFinite(raw.audioSfx, 0, 1, d.audioSfx),
    audioMusic: clampFinite(raw.audioMusic, 0, 1, d.audioMusic),
    audioMuted: boolOr(raw.audioMuted, d.audioMuted),
    mouseSensitivity: clampFinite(raw.mouseSensitivity, 0.1, 5.0, d.mouseSensitivity),
    invertMouseY: boolOr(raw.invertMouseY, d.invertMouseY),
    gamepad: sanitizeGamepadCalibration(raw.gamepad),
  };
}

function sanitizeRunRecord(raw: unknown): RunRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (
    typeof raw.characterId !== 'string' ||
    !VALID_CHARACTERS.has(raw.characterId) ||
    typeof raw.mapId !== 'string' ||
    !VALID_MAPS.has(raw.mapId)
  ) {
    return null;
  }
  const mapTier: MapTier = raw.mapTier === 1 || raw.mapTier === 2 || raw.mapTier === 3 ? raw.mapTier : 1;
  return {
    timestamp: stringOr(raw.timestamp, new Date(0).toISOString()),
    characterId: raw.characterId as CharacterId,
    mapId: raw.mapId as MapId,
    mapTier,
    victory: boolOr(raw.victory, false),
    durationSec: nonNegNumber(raw.durationSec, 0),
    level: Math.max(1, nonNegInt(raw.level, 1)),
    kills: nonNegInt(raw.kills, 0),
    silverEarned: nonNegInt(raw.silverEarned, 0),
    highestHit: nonNegNumber(raw.highestHit, 0),
  };
}

function compareRunRecords(a: RunRecord, b: RunRecord): number {
  if (a.victory !== b.victory) {
    return a.victory ? -1 : 1;
  }
  if (b.kills !== a.kills) {
    return b.kills - a.kills;
  }
  if (b.level !== a.level) {
    return b.level - a.level;
  }
  if (b.highestHit !== a.highestHit) {
    return b.highestHit - a.highestHit;
  }
  return b.durationSec - a.durationSec;
}

/**
 * Schema-validates and recovers arbitrary parsed JSON into a complete valid `SaveData`.
 */
export function sanitizeSaveData(raw: unknown): SanitizeSaveResult {
  const defaults = createDefaultSaveData();
  const issues: string[] = [];

  if (!isRecord(raw)) {
    issues.push('Root payload is not a JSON object; reset to defaults');
    return { data: defaults, recovered: true, issues };
  }

  let recovered = false;
  if (typeof raw.version !== 'number' || raw.version !== SAVE_VERSION) {
    issues.push(`Save version mismatch (${String(raw.version)} != ${SAVE_VERSION}); normalized`);
    recovered = true;
  }

  const unlockedCharacters = uniqueEnumArray<CharacterId>(
    raw.unlockedCharacters,
    VALID_CHARACTERS,
    defaults.unlockedCharacters,
  );
  // Guarantee starter quartet is always unlocked
  for (const starter of defaults.unlockedCharacters) {
    if (!unlockedCharacters.includes(starter)) {
      unlockedCharacters.push(starter);
    }
  }

  const unlockedMaps = uniqueEnumArray<MapId>(raw.unlockedMaps, VALID_MAPS, defaults.unlockedMaps);
  if (!unlockedMaps.includes('Forest')) {
    unlockedMaps.unshift('Forest');
  }

  const shopLevels = { ...defaults.shopLevels };
  if (isRecord(raw.shopLevels)) {
    for (const id of SHOP_UPGRADE_IDS) {
      shopLevels[id] = nonNegInt(raw.shopLevels[id], 0);
    }
  } else if (raw.shopLevels !== undefined) {
    issues.push('Invalid shopLevels object; reset to zeros');
    recovered = true;
  }

  const questProgress: Record<string, number> = {};
  if (isRecord(raw.questProgress)) {
    for (const [k, v] of Object.entries(raw.questProgress)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        questProgress[k] = v;
      }
    }
  } else if (raw.questProgress !== undefined) {
    issues.push('Invalid questProgress object; cleared');
    recovered = true;
  }

  const bestRuns: RunRecord[] = [];
  if (Array.isArray(raw.bestRuns)) {
    for (const entry of raw.bestRuns) {
      const clean = sanitizeRunRecord(entry);
      if (clean) {
        bestRuns.push(clean);
      } else {
        recovered = true;
      }
    }
    bestRuns.sort(compareRunRecords);
  } else if (raw.bestRuns !== undefined) {
    issues.push('Invalid bestRuns array; cleared');
    recovered = true;
  }

  const selectedCharacter: CharacterId =
    typeof raw.selectedCharacter === 'string' && VALID_CHARACTERS.has(raw.selectedCharacter)
      ? (raw.selectedCharacter as CharacterId)
      : defaults.selectedCharacter;

  const selectedMap: MapId =
    typeof raw.selectedMap === 'string' && VALID_MAPS.has(raw.selectedMap)
      ? (raw.selectedMap as MapId)
      : defaults.selectedMap;

  const selectedMapTier: MapTier =
    raw.selectedMapTier === 1 || raw.selectedMapTier === 2 || raw.selectedMapTier === 3
      ? raw.selectedMapTier
      : defaults.selectedMapTier;

  const data: SaveData = {
    version: SAVE_VERSION,
    updatedAt: stringOr(raw.updatedAt, defaults.updatedAt),
    silver: nonNegInt(raw.silver, defaults.silver),
    totalRuns: nonNegInt(raw.totalRuns, defaults.totalRuns),
    totalKills: nonNegInt(raw.totalKills, defaults.totalKills),
    totalPlayTimeSec: nonNegNumber(raw.totalPlayTimeSec, defaults.totalPlayTimeSec),
    unlockedCharacters,
    unlockedWeapons: uniqueStringArray(raw.unlockedWeapons, defaults.unlockedWeapons),
    unlockedTomes: uniqueStringArray(raw.unlockedTomes, defaults.unlockedTomes),
    unlockedItems: uniqueStringArray(raw.unlockedItems, defaults.unlockedItems),
    unlockedMaps,
    unlockedSkins: uniqueStringArray(raw.unlockedSkins, defaults.unlockedSkins),
    unlockedHats: uniqueStringArray(raw.unlockedHats, defaults.unlockedHats),
    completedChallenges: uniqueStringArray(raw.completedChallenges, defaults.completedChallenges),
    questProgress,
    claimedQuests: uniqueStringArray(raw.claimedQuests, defaults.claimedQuests),
    shopLevels,
    selectedCharacter,
    selectedSkin: nullableStringOr(raw.selectedSkin, defaults.selectedSkin),
    selectedHat: nullableStringOr(raw.selectedHat, defaults.selectedHat),
    selectedMap,
    selectedMapTier,
    selectedChallenge: nullableStringOr(raw.selectedChallenge, defaults.selectedChallenge),
    settings: sanitizeRenderSettings(raw.settings),
    bestRuns: bestRuns.slice(0, DEFAULT_MAX_LEADERBOARD),
    customPackEnabled: boolOr(raw.customPackEnabled, defaults.customPackEnabled),
  };

  return { data, recovered, issues };
}

class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/**
 * Safely discovers browser `localStorage` without referencing DOM types,
 * falling back cleanly to an in-memory store in headless Node / private modes.
 */
function resolveDefaultStorage(): StorageLike {
  try {
    const g = globalThis as { localStorage?: unknown };
    const candidate = g.localStorage;
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as StorageLike).getItem === 'function' &&
      typeof (candidate as StorageLike).setItem === 'function' &&
      typeof (candidate as StorageLike).removeItem === 'function'
    ) {
      const storage = candidate as StorageLike;
      const probeKey = '__krunkedbonk_storage_probe__';
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return storage;
    }
  } catch {
    // Restricted storage environment or headless Node
  }
  return new MemoryStorage();
}

export class SaveManager {
  private readonly storageKey: string;
  private readonly storage: StorageLike;
  private readonly maxLeaderboardEntries: number;
  private data: SaveData;
  private lastRecoveryIssues: string[] = [];
  private readonly listeners = new Set<(data: Readonly<SaveData>) => void>();

  constructor(options: SaveManagerOptions = {}) {
    this.storageKey = options.storageKey ?? SAVE_STORAGE_KEY;
    this.storage = options.storage === undefined ? resolveDefaultStorage() : (options.storage ?? new MemoryStorage());
    this.maxLeaderboardEntries = Math.max(1, options.maxLeaderboardEntries ?? DEFAULT_MAX_LEADERBOARD);
    this.data = createDefaultSaveData();

    if (options.autoLoad !== false) {
      this.load();
    }
  }

  getStorageKey(): string {
    return this.storageKey;
  }

  getLastRecoveryIssues(): readonly string[] {
    return this.lastRecoveryIssues;
  }

  getData(): Readonly<SaveData> {
    return this.data;
  }

  getSnapshot(): SaveData {
    return cloneSaveData(this.data);
  }

  subscribe(listener: (data: Readonly<SaveData>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }

  load(): SaveData {
    this.lastRecoveryIssues = [];
    let rawText: string | null = null;
    try {
      rawText = this.storage.getItem(this.storageKey);
    } catch {
      this.data = createDefaultSaveData();
      this.lastRecoveryIssues = ['Storage read failed; initialized default save'];
      return this.getSnapshot();
    }

    if (rawText === null || rawText.trim().length === 0) {
      this.data = createDefaultSaveData();
      this.save();
      return this.getSnapshot();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.backupCorruptPayload(rawText);
      this.data = createDefaultSaveData();
      this.lastRecoveryIssues = ['Corrupted JSON save payload; backed up and reset to defaults'];
      this.save();
      this.emit();
      return this.getSnapshot();
    }

    const result = sanitizeSaveData(parsed);
    this.data = result.data;
    this.lastRecoveryIssues = result.issues;
    if (result.recovered) {
      this.backupCorruptPayload(rawText);
      this.save();
    }
    this.emit();
    return this.getSnapshot();
  }

  save(): boolean {
    this.data.updatedAt = new Date().toISOString();
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  reset(): SaveData {
    this.data = createDefaultSaveData();
    this.lastRecoveryIssues = [];
    try {
      this.storage.removeItem(this.storageKey);
    } catch {
      // ignore storage errors
    }
    this.save();
    this.emit();
    return this.getSnapshot();
  }

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importJson(json: string): { ok: boolean; data: SaveData; issues: string[] } {
    try {
      const parsed: unknown = JSON.parse(json);
      const result = sanitizeSaveData(parsed);
      this.data = result.data;
      this.lastRecoveryIssues = result.issues;
      this.save();
      this.emit();
      return { ok: true, data: this.getSnapshot(), issues: result.issues };
    } catch {
      return {
        ok: false,
        data: this.getSnapshot(),
        issues: ['Invalid JSON string'],
      };
    }
  }

  addSilver(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) {
      return this.data.silver;
    }
    this.data.silver += Math.floor(amount);
    this.save();
    this.emit();
    return this.data.silver;
  }

  purchaseShopUpgrade(def: MetaShopUpgradeDef): ShopPurchaseResult {
    const currentRank = this.data.shopLevels[def.id] ?? 0;
    if (currentRank >= def.maxRank) {
      return {
        ok: false,
        reason: 'max_rank',
        cost: 0,
        newRank: currentRank,
        remainingSilver: this.data.silver,
      };
    }

    const cost = computeShopUpgradeCost(def, currentRank);
    if (this.data.silver < cost) {
      return {
        ok: false,
        reason: 'insufficient_silver',
        cost,
        newRank: currentRank,
        remainingSilver: this.data.silver,
      };
    }

    this.data.silver -= cost;
    const newRank = currentRank + 1;
    this.data.shopLevels[def.id] = newRank;
    this.save();
    this.emit();
    return {
      ok: true,
      cost,
      newRank,
      remainingSilver: this.data.silver,
    };
  }

  refundShopUpgrade(def: MetaShopUpgradeDef): ShopRefundResult {
    const currentRank = this.data.shopLevels[def.id] ?? 0;
    if (currentRank <= 0) {
      return {
        ok: false,
        refundedSilver: 0,
        newRank: 0,
        remainingSilver: this.data.silver,
      };
    }
    const newRank = currentRank - 1;
    const refundedSilver = computeShopUpgradeCost(def, newRank);
    this.data.shopLevels[def.id] = newRank;
    this.data.silver += refundedSilver;
    this.save();
    this.emit();
    return {
      ok: true,
      refundedSilver,
      newRank,
      remainingSilver: this.data.silver,
    };
  }

  refundAllShopUpgrades(defs: readonly MetaShopUpgradeDef[]): {
    refundedSilver: number;
    remainingSilver: number;
  } {
    let refundedSilver = 0;
    for (const def of defs) {
      const rank = this.data.shopLevels[def.id] ?? 0;
      if (rank > 0) {
        refundedSilver += computeTotalShopUpgradeSpent(def, rank);
        this.data.shopLevels[def.id] = 0;
      }
    }
    if (refundedSilver > 0) {
      this.data.silver += refundedSilver;
      this.save();
      this.emit();
    }
    return {
      refundedSilver,
      remainingSilver: this.data.silver,
    };
  }

  updateSettings(patch: Partial<RenderSettings>): RenderSettings {
    const merged = {
      ...this.data.settings,
      ...patch,
      gamepad: patch.gamepad
        ? { ...this.data.settings.gamepad, ...patch.gamepad }
        : { ...this.data.settings.gamepad },
    };
    this.data.settings = sanitizeRenderSettings(merged);
    this.save();
    this.emit();
    return {
      ...this.data.settings,
      gamepad: { ...this.data.settings.gamepad },
    };
  }

  updateGamepadCalibration(patch: Partial<GamepadCalibration>): GamepadCalibration {
    const updated = this.updateSettings({
      gamepad: { ...this.data.settings.gamepad, ...patch },
    });
    return { ...updated.gamepad };
  }

  setSelection(patch: {
    selectedCharacter?: CharacterId;
    selectedSkin?: string | null;
    selectedHat?: string | null;
    selectedMap?: MapId;
    selectedMapTier?: MapTier;
    selectedChallenge?: string | null;
  }): void {
    if (patch.selectedCharacter && VALID_CHARACTERS.has(patch.selectedCharacter)) {
      this.data.selectedCharacter = patch.selectedCharacter;
    }
    if (patch.selectedSkin !== undefined) {
      this.data.selectedSkin = patch.selectedSkin;
    }
    if (patch.selectedHat !== undefined) {
      this.data.selectedHat = patch.selectedHat;
    }
    if (patch.selectedMap && VALID_MAPS.has(patch.selectedMap)) {
      this.data.selectedMap = patch.selectedMap;
    }
    if (patch.selectedMapTier === 1 || patch.selectedMapTier === 2 || patch.selectedMapTier === 3) {
      this.data.selectedMapTier = patch.selectedMapTier;
    }
    if (patch.selectedChallenge !== undefined) {
      this.data.selectedChallenge = patch.selectedChallenge;
    }
    this.save();
    this.emit();
  }

  setCustomPackEnabled(enabled: boolean): void {
    this.data.customPackEnabled = Boolean(enabled);
    this.save();
    this.emit();
  }

  recordQuestProgress(metricKey: string, value: number, mode: 'add' | 'max' = 'add'): number {
    if (!metricKey || !Number.isFinite(value) || value < 0) {
      return this.data.questProgress[metricKey] ?? 0;
    }
    const prev = this.data.questProgress[metricKey] ?? 0;
    const next = mode === 'max' ? Math.max(prev, value) : prev + value;
    this.data.questProgress[metricKey] = next;
    this.save();
    this.emit();
    return next;
  }

  claimQuest(quest: QuestDef): QuestClaimResult {
    if (this.data.claimedQuests.includes(quest.id)) {
      return { ok: false, reason: 'already_claimed', rewardSilver: 0 };
    }
    const progress = this.data.questProgress[quest.metricKey] ?? 0;
    if (progress < quest.targetValue) {
      return { ok: false, reason: 'incomplete', rewardSilver: 0 };
    }

    this.data.claimedQuests.push(quest.id);
    const rewardSilver = Math.max(0, Math.floor(quest.rewardSilver));
    this.data.silver += rewardSilver;
    if (quest.unlocks) {
      this.applyUnlocks(quest.unlocks);
    }
    this.save();
    this.emit();
    return { ok: true, rewardSilver };
  }

  unlockContent(unlocks: NonNullable<QuestDef['unlocks']>): void {
    this.applyUnlocks(unlocks);
    this.save();
    this.emit();
  }

  markChallengeCompleted(challengeId: string): void {
    if (challengeId && !this.data.completedChallenges.includes(challengeId)) {
      this.data.completedChallenges.push(challengeId);
      this.save();
      this.emit();
    }
  }

  recordRun(record: RunRecord, options: RecordRunOptions = {}): RecordRunResult {
    const clean = sanitizeRunRecord(record);
    if (!clean) {
      return { rank: null, isNewBest: false };
    }

    this.data.totalRuns += 1;
    this.data.totalKills += clean.kills;
    this.data.totalPlayTimeSec += clean.durationSec;
    if (options.awardSilver !== false && clean.silverEarned > 0) {
      this.data.silver += clean.silverEarned;
    }

    const maxEntries = Math.max(1, options.maxLeaderboardEntries ?? this.maxLeaderboardEntries);
    const prevTop = this.data.bestRuns[0] ?? null;
    const nextBoard = [...this.data.bestRuns, clean].sort(compareRunRecords).slice(0, maxEntries);
    this.data.bestRuns = nextBoard;

    const rankIdx = nextBoard.indexOf(clean);
    const rank = rankIdx >= 0 ? rankIdx + 1 : null;
    const isNewBest = rank === 1 && (prevTop === null || compareRunRecords(clean, prevTop) < 0);

    this.save();
    this.emit();
    return { rank, isNewBest };
  }

  getBestRuns(filter?: {
    mapId?: MapId;
    characterId?: CharacterId;
    limit?: number;
  }): RunRecord[] {
    let list = this.data.bestRuns;
    if (filter?.mapId) {
      list = list.filter((r) => r.mapId === filter.mapId);
    }
    if (filter?.characterId) {
      list = list.filter((r) => r.characterId === filter.characterId);
    }
    if (filter?.limit !== undefined) {
      list = list.slice(0, Math.max(0, filter.limit));
    }
    return list.map((r) => ({ ...r }));
  }

  private applyUnlocks(unlocks: NonNullable<QuestDef['unlocks']>): void {
    if (
      unlocks.characterId &&
      VALID_CHARACTERS.has(unlocks.characterId) &&
      !this.data.unlockedCharacters.includes(unlocks.characterId)
    ) {
      this.data.unlockedCharacters.push(unlocks.characterId);
    }
    if (unlocks.weaponId && !this.data.unlockedWeapons.includes(unlocks.weaponId)) {
      this.data.unlockedWeapons.push(unlocks.weaponId);
    }
    if (unlocks.tomeId && !this.data.unlockedTomes.includes(unlocks.tomeId)) {
      this.data.unlockedTomes.push(unlocks.tomeId);
    }
    if (unlocks.itemId && !this.data.unlockedItems.includes(unlocks.itemId)) {
      this.data.unlockedItems.push(unlocks.itemId);
    }
    if (unlocks.mapId && VALID_MAPS.has(unlocks.mapId) && !this.data.unlockedMaps.includes(unlocks.mapId)) {
      this.data.unlockedMaps.push(unlocks.mapId);
    }
    if (unlocks.skinId && !this.data.unlockedSkins.includes(unlocks.skinId)) {
      this.data.unlockedSkins.push(unlocks.skinId);
    }
    if (unlocks.hatId && !this.data.unlockedHats.includes(unlocks.hatId)) {
      this.data.unlockedHats.push(unlocks.hatId);
    }
  }

  private backupCorruptPayload(rawText: string): void {
    try {
      this.storage.setItem(`${this.storageKey}_corrupt_backup`, rawText);
    } catch {
      // Ignore quota/storage errors on backup
    }
  }
}

export function createSaveManager(options?: SaveManagerOptions): SaveManager {
  return new SaveManager(options);
}
