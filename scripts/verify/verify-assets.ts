#!/usr/bin/env node
/**
 * KRUNKEDBONK — Gate A Empirical Asset, Oracle, Taste & IP Firewall Verifier
 *
 * Run via: `npm run verify:assets` (or `npx tsx scripts/verify/verify-assets.ts`)
 *
 * Sections:
 *   1. Built-In Asset & Full-Catalog Completeness (+ local `.krunkedbonk-assets/manifest.json` if present)
 *   2. Mechanic Oracle Parity (against `.krunkedbonk-assets/oracle.json` when present locally; CI-safe skip)
 *   3. TASTE_NOTES Enforcement (zero brand leaks, TouchOverlay touch-only start, GamepadDriver calibration/deadzone/UI nav)
 *   4. IP Firewall (`git ls-files` & `dist/` containment audit)
 *
 * Exits `0` ONLY when ALL executed checks pass.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  ALL_ESTATS,
  CAMERA_3RD_OFFSET_Z,
  CATALOG_COUNTS,
  CHARACTER_IDS,
  DEFAULT_RENDER_SETTINGS,
  FINAL_BOSS_PYLON_COUNT,
  FIXED_DT,
  FOV_DEFAULT,
  GAMEPAD_DEADZONE_DEFAULT,
  GRAVEYARD_GRID_SIZE,
  GRAVITY,
  INTERACTABLE_KINDS,
  MAP_IDS,
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_MASS,
  RARITIES,
  SHOP_UPGRADE_IDS,
  SIM_HZ,
  type ColorRGB,
  type EStat,
  type MapTier,
} from '../../src/contracts/index';
import { validatePackManifest } from '../../src/assets/CustomPackLoader';
import {
  ProceduralLowPolyPack,
  type ProceduralTextureId,
} from '../../src/assets/ProceduralLowPolyPack';
import { MUSIC_TRACK_MANIFEST, SFX_MANIFEST } from '../../src/audio/soundManifest';
import { PROCEDURAL_TRACKS } from '../../src/audio/tracks';
import { GAME_CATALOG } from '../../src/data/index';
import { GamepadDriver } from '../../src/input/GamepadDriver';
import { TouchOverlay } from '../../src/input/TouchOverlay';

// ============================================================================
// TYPES & HELPERS
// ============================================================================

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  id: string;
  section: string;
  name: string;
  status: CheckStatus;
  detail: string;
  errors: string[];
}

interface OracleStatValue<T> {
  value: T;
  provenance?: string;
}

interface OracleWeapon {
  id: string;
  assetName: string;
  damage: number;
  endCooldown: number;
  projectiles: number;
  isAura: boolean;
}

interface OracleTome {
  id: string;
  assetName: string;
  stat: string;
  modifyType: string;
  perLevelDelta: number;
}

interface OracleItem {
  id: string;
  assetName: string;
  rarity: string;
  inItemPool: boolean;
}

interface OracleEnemy {
  id: string;
  assetName: string;
  role: string;
}

interface OracleStage {
  assetName: string;
  stageTimeSec: number;
  lighting: {
    fogColor: [number, number, number, number];
    ambienceColor: [number, number, number, number];
    lightColor: [number, number, number, number];
    lightIntensity?: number;
  };
  mapParameters?: { size?: number } | null;
}

interface OracleActiveMap {
  id: string;
  defaultStageDurationSec: number;
  stages: OracleStage[];
}

interface OracleShopItem {
  id: string;
  enumName: string;
  basePrice: number;
  maxLevel: number;
}

interface OracleDocument {
  schemaVersion: string;
  engineAndPhysics: {
    simHz: OracleStatValue<number>;
    fixedDeltaTime: OracleStatValue<number>;
    gravity: OracleStatValue<[number, number, number]>;
    playerMass: OracleStatValue<number>;
    capsuleRadius: OracleStatValue<number>;
    capsuleHeight: OracleStatValue<number>;
    fovDefault: OracleStatValue<number>;
    offset3rdPersonZ: OracleStatValue<number>;
  };
  counts: {
    stats: number;
    characters: number;
    weapons: number;
    tomes: number;
    items: number;
    itemsByRarity: Record<string, number>;
    liveEnemies: number;
    activeMaps: number;
    hasFinalBossMap: boolean;
    interactables: number;
    shopItems: number;
  };
  characters: Array<{ id: string; assetName: string; weaponId: string; weaponAsset: string }>;
  weapons: OracleWeapon[];
  tomes: OracleTome[];
  items: OracleItem[];
  enemies: { live: OracleEnemy[] };
  maps: {
    active: OracleActiveMap[];
    finalBossMap: {
      id: string;
      pylonCount: number;
      hasFinalBoss: boolean;
    };
  };
  shopItems: OracleShopItem[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const results: CheckResult[] = [];

function recordCheck(
  id: string,
  section: string,
  name: string,
  status: CheckStatus,
  detail: string,
  errors: string[] = [],
): void {
  results.push({ id, section, name, status, detail, errors });
}

function normId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidRgb(c: ColorRGB | undefined): boolean {
  if (!c) return false;
  return (
    Number.isFinite(c.r) &&
    Number.isFinite(c.g) &&
    Number.isFinite(c.b) &&
    c.r >= 0 &&
    c.r <= 1.05 &&
    c.g >= 0 &&
    c.g <= 1.05 &&
    c.b >= 0 &&
    c.b <= 1.05
  );
}

function maxRgbDelta(actual: ColorRGB, expected: readonly [number, number, number, number]): number {
  return Math.max(
    Math.abs(actual.r - expected[0]),
    Math.abs(actual.g - expected[1]),
    Math.abs(actual.b - expected[2]),
  );
}

/**
 * Resolves the local `.krunkedbonk-assets` directory when available.
 * Checks env override -> repo root -> (if inside a git worktree) primary repo root.
 * Returns `null` on CI or machines without local extracted assets.
 */
function resolveLocalAssetsDir(): string | null {
  const envOverride = process.env.KRUNKEDBONK_ASSETS_DIR;
  if (envOverride !== undefined) {
    const trimmed = envOverride.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none' || trimmed === '0') {
      return null;
    }
    const resolved = path.resolve(trimmed);
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : null;
  }

  const candidates: string[] = [path.join(REPO_ROOT, '.krunkedbonk-assets')];

  // Support git worktrees whose primary checkout holds gitignored `.krunkedbonk-assets/`
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (commonDir) {
      const resolvedCommon = path.resolve(REPO_ROOT, commonDir);
      const primaryRepoRoot = path.dirname(resolvedCommon);
      if (primaryRepoRoot !== REPO_ROOT) {
        candidates.push(path.join(primaryRepoRoot, '.krunkedbonk-assets'));
      }
    }
  } catch {
    // Ignore if git is unavailable
  }

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return null;
}

function walkFiles(dirPath: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dirPath)) return out;
  const stack: string[] = [dirPath];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return Array.from(dups);
}

// Oracle EStat enum -> Contract EStat mapping
const ORACLE_STAT_TO_CONTRACT: Readonly<Record<string, EStat>> = {
  MaxHealth: 'MaxHealth',
  HealthRegen: 'HealthRegen',
  Overheal: 'Overheal',
  Shield: 'Shield',
  Armor: 'Armor',
  Evasion: 'Evasion',
  Lifesteal: 'Lifesteal',
  Thorns: 'Thorns',
  DamageReductionMultiplier: 'DamageReduction',
  FallDamageReduction: 'FallDamageReduction',
  DamageMultiplier: 'DamageMultiplier',
  AttackSpeed: 'AttackSpeed',
  CritChance: 'CritChance',
  CritDamage: 'CritDamage',
  EliteDamageMultiplier: 'EliteDamageMultiplier',
  KnockbackMultiplier: 'Knockback',
  Projectiles: 'ProjectileCount',
  ProjectileSpeedMultiplier: 'ProjectileSpeed',
  ProjectileBounces: 'ProjectileBounces',
  SizeMultiplier: 'AreaSize',
  DurationMultiplier: 'Duration',
  FireDamage: 'FireDamageMultiplier',
  IceDamage: 'IceDamageMultiplier',
  LightningDamage: 'LightningDamageMultiplier',
  PoisonDamageMultiplier: 'PoisonDamageMultiplier',
  MoveSpeedMultiplier: 'MoveSpeed',
  JumpHeight: 'JumpHeight',
  ExtraJumps: 'ExtraJumps',
  PickupRange: 'PickupRange',
  XpIncreaseMultiplier: 'XpMultiplier',
  GoldIncreaseMultiplier: 'GoldMultiplier',
  SilverIncreaseMultiplier: 'SilverMultiplier',
  Luck: 'Luck',
  Difficulty: 'Difficulty',
};

const ORACLE_MOD_TO_CONTRACT: Readonly<Record<string, 'add' | 'mult' | 'flat'>> = {
  Addition: 'add',
  Multiplication: 'mult',
  Flat: 'flat',
};

// ============================================================================
// CHECK 1: BUILT-IN ASSET & CATALOG COMPLETENESS
// ============================================================================

function runCheck1BuiltInAndCatalog(localAssetsDir: string | null): void {
  const section = '1. Built-In Asset & Catalog Completeness';
  const statSet = new Set<string>(ALL_ESTATS);
  const raritySet = new Set<string>(RARITIES);

  // 1.1 Exact Full-Catalog Counts
  {
    const errors: string[] = [];
    const itemRarityCounts: Record<string, number> = {
      Common: 0,
      Rare: 0,
      Epic: 0,
      Legendary: 0,
      Quest: 0,
    };
    for (const item of GAME_CATALOG.items) {
      itemRarityCounts[item.rarity] = (itemRarityCounts[item.rarity] ?? 0) + 1;
    }

    const activeMaps = GAME_CATALOG.maps.filter((m) => !m.isFinalBossMap);
    const hasFinalBossMap = GAME_CATALOG.maps.some((m) => m.id === 'FinalBossMap' && m.isFinalBossMap);
    const trackCount = Object.keys(PROCEDURAL_TRACKS).length;
    const manifestTrackCount = Object.keys(MUSIC_TRACK_MANIFEST).length;
    const sfxCount = Object.keys(SFX_MANIFEST).length;

    const assertExact = (label: string, actual: number, expected: number): void => {
      if (actual !== expected) {
        errors.push(`${label}: expected ${expected}, got ${actual}`);
      }
    };

    assertExact('EStats', ALL_ESTATS.length, CATALOG_COUNTS.stats);
    assertExact('Characters', GAME_CATALOG.characters.length, CATALOG_COUNTS.characters);
    assertExact('Weapons', GAME_CATALOG.weapons.length, CATALOG_COUNTS.weapons);
    assertExact('Tomes', GAME_CATALOG.tomes.length, CATALOG_COUNTS.tomes);
    assertExact('Items (total)', GAME_CATALOG.items.length, CATALOG_COUNTS.items);
    assertExact('Items (Common)', itemRarityCounts.Common ?? 0, CATALOG_COUNTS.commonItems);
    assertExact('Items (Rare)', itemRarityCounts.Rare ?? 0, CATALOG_COUNTS.rareItems);
    assertExact('Items (Epic)', itemRarityCounts.Epic ?? 0, CATALOG_COUNTS.epicItems);
    assertExact('Items (Legendary)', itemRarityCounts.Legendary ?? 0, CATALOG_COUNTS.legendaryItems);
    assertExact('Items (Quest)', itemRarityCounts.Quest ?? 0, CATALOG_COUNTS.questItems);
    assertExact('Live Enemies', GAME_CATALOG.enemies.length, CATALOG_COUNTS.enemies);
    assertExact('Active Maps', activeMaps.length, CATALOG_COUNTS.activeMaps);
    if (!hasFinalBossMap) {
      errors.push('Maps: missing FinalBossMap (isFinalBossMap === true)');
    }
    assertExact('Total Maps', GAME_CATALOG.maps.length, CATALOG_COUNTS.totalMaps);
    assertExact('Interactables', GAME_CATALOG.interactables.length, CATALOG_COUNTS.interactables);
    assertExact('Shop Upgrades', GAME_CATALOG.shopUpgrades.length, CATALOG_COUNTS.shopUpgrades);

    if (GAME_CATALOG.challenges.length < 17) {
      errors.push(`Challenges: expected >= 17, got ${GAME_CATALOG.challenges.length}`);
    }
    if (trackCount < 16) {
      errors.push(`Music Tracks (PROCEDURAL_TRACKS): expected >= 16, got ${trackCount}`);
    }
    if (manifestTrackCount < 16) {
      errors.push(`Music Tracks (MUSIC_TRACK_MANIFEST): expected >= 16, got ${manifestTrackCount}`);
    }
    if (sfxCount < 30) {
      errors.push(`SFX Cues (SFX_MANIFEST): expected >= 30, got ${sfxCount}`);
    }

    // Duplicate ID guards
    const dupChecks: Array<[string, readonly string[]]> = [
      ['EStats', ALL_ESTATS],
      ['Characters', GAME_CATALOG.characters.map((c) => c.id)],
      ['Weapons', GAME_CATALOG.weapons.map((w) => w.id)],
      ['Tomes', GAME_CATALOG.tomes.map((t) => t.id)],
      ['Items', GAME_CATALOG.items.map((i) => i.id)],
      ['Enemies', GAME_CATALOG.enemies.map((e) => e.id)],
      ['Maps', GAME_CATALOG.maps.map((m) => m.id)],
      ['Interactables', GAME_CATALOG.interactables.map((x) => x.kind)],
      ['ShopUpgrades', GAME_CATALOG.shopUpgrades.map((s) => s.id)],
      ['Challenges', GAME_CATALOG.challenges.map((c) => c.id)],
    ];
    for (const [label, ids] of dupChecks) {
      const dups = findDuplicates(ids);
      if (dups.length > 0) {
        errors.push(`Duplicate IDs in ${label}: ${dups.join(', ')}`);
      }
    }

    const summary = `${ALL_ESTATS.length} stats, ${GAME_CATALOG.characters.length} chars, ${GAME_CATALOG.weapons.length} wpns, ${GAME_CATALOG.tomes.length} tomes, ${GAME_CATALOG.items.length} items, ${GAME_CATALOG.enemies.length} enemies, ${activeMaps.length}+1 maps, ${GAME_CATALOG.interactables.length} int, ${GAME_CATALOG.shopUpgrades.length} shop, ${GAME_CATALOG.challenges.length} chal, ${trackCount} tracks`;
    recordCheck(
      '1.1',
      section,
      'Exact Full-Catalog Counts',
      errors.length === 0 ? 'PASS' : 'FAIL',
      summary,
      errors,
    );
  }

  // 1.2 Entry Metadata Completeness & ZERO No-Op Pool Items
  {
    const errors: string[] = [];
    const weaponIdSet = new Set(GAME_CATALOG.weapons.map((w) => w.id));

    for (const c of GAME_CATALOG.characters) {
      if (!isNonEmptyString(c.displayName)) errors.push(`Character ${c.id}: empty displayName`);
      if (!isNonEmptyString(c.description)) errors.push(`Character ${c.id}: empty description`);
      if (!isNonEmptyString(c.paletteKey)) errors.push(`Character ${c.id}: empty paletteKey`);
      if (!isNonEmptyString(c.primaryColorHex) || !isNonEmptyString(c.accentColorHex)) {
        errors.push(`Character ${c.id}: missing primary/accent colorHex`);
      }
      if (!weaponIdSet.has(c.startingWeaponId)) {
        errors.push(`Character ${c.id}: startingWeaponId "${c.startingWeaponId}" not in WEAPONS`);
      }
      if (!c.passive || !isNonEmptyString(c.passive.id) || !isNonEmptyString(c.passive.name)) {
        errors.push(`Character ${c.id}: incomplete passive definition`);
      }
    }

    for (const w of GAME_CATALOG.weapons) {
      if (!isNonEmptyString(w.displayName)) errors.push(`Weapon ${w.id}: empty displayName`);
      if (!isNonEmptyString(w.description)) errors.push(`Weapon ${w.id}: empty description`);
      if (!isNonEmptyString(w.paletteKey)) errors.push(`Weapon ${w.id}: empty paletteKey`);
      if (!Number.isFinite(w.baseDamage) || w.baseDamage < 0) {
        errors.push(`Weapon ${w.id}: invalid baseDamage (${w.baseDamage})`);
      }
      if (!Number.isFinite(w.cooldownSec) || w.cooldownSec < 0) {
        errors.push(`Weapon ${w.id}: invalid cooldownSec (${w.cooldownSec})`);
      }
    }

    for (const t of GAME_CATALOG.tomes) {
      if (!isNonEmptyString(t.displayName)) errors.push(`Tome ${t.id}: empty displayName`);
      if (!isNonEmptyString(t.description)) errors.push(`Tome ${t.id}: empty description`);
      if (!isNonEmptyString(t.colorHex)) errors.push(`Tome ${t.id}: empty colorHex`);
      if (!statSet.has(t.stat)) errors.push(`Tome ${t.id}: unknown EStat "${t.stat}"`);
    }

    let poolItemCount = 0;
    let noOpPoolItems = 0;
    for (const item of GAME_CATALOG.items) {
      if (!isNonEmptyString(item.displayName)) errors.push(`Item ${item.id}: empty displayName`);
      if (!isNonEmptyString(item.description)) errors.push(`Item ${item.id}: empty description`);
      if (!isNonEmptyString(item.colorHex)) errors.push(`Item ${item.id}: empty colorHex`);
      if (!raritySet.has(item.rarity)) errors.push(`Item ${item.id}: invalid rarity "${item.rarity}"`);

      const isQuest = item.rarity === 'Quest' || item.isQuestItem === true;
      if (!isQuest) {
        poolItemCount++;
        const hasStatMods = Array.isArray(item.statModifiers) && item.statModifiers.length > 0;
        const hasPerStackMods =
          Array.isArray(item.perStackStatModifiers) && item.perStackStatModifiers.length > 0;
        const hasHooks = Array.isArray(item.hooks) && item.hooks.length > 0;
        if (!hasStatMods && !hasPerStackMods && !hasHooks) {
          noOpPoolItems++;
          errors.push(`Pool Item ${item.id} (${item.rarity}): NO-OP (missing statModifiers, perStackStatModifiers, and hooks)`);
        }
      }
    }

    for (const enemy of GAME_CATALOG.enemies) {
      if (!isNonEmptyString(enemy.displayName)) errors.push(`Enemy ${enemy.id}: empty displayName`);
      if (!isNonEmptyString(enemy.paletteKey)) errors.push(`Enemy ${enemy.id}: empty paletteKey`);
      if (!isNonEmptyString(enemy.colorHex)) errors.push(`Enemy ${enemy.id}: empty colorHex`);
      if (!Number.isFinite(enemy.maxHp) || enemy.maxHp <= 0) {
        errors.push(`Enemy ${enemy.id}: invalid maxHp (${enemy.maxHp})`);
      }
    }

    for (const map of GAME_CATALOG.maps) {
      if (!isNonEmptyString(map.displayName)) errors.push(`Map ${map.id}: empty displayName`);
      if (!isNonEmptyString(map.description)) errors.push(`Map ${map.id}: empty description`);
      if (!Number.isFinite(map.stageDurationSec) || map.stageDurationSec <= 0) {
        errors.push(`Map ${map.id}: invalid stageDurationSec (${map.stageDurationSec})`);
      }
      if (
        !isValidRgb(map.defaultLighting.fogColor) ||
        !isValidRgb(map.defaultLighting.ambientColor) ||
        !isValidRgb(map.defaultLighting.sunColor)
      ) {
        errors.push(`Map ${map.id}: defaultLighting RGB channels out of range [0..1]`);
      }
    }

    for (const inter of GAME_CATALOG.interactables) {
      if (!isNonEmptyString(inter.displayName)) errors.push(`Interactable ${inter.kind}: empty displayName`);
      if (!isNonEmptyString(inter.description)) errors.push(`Interactable ${inter.kind}: empty description`);
      if (!isNonEmptyString(inter.colorHex)) errors.push(`Interactable ${inter.kind}: empty colorHex`);
      if (!INTERACTABLE_KINDS.includes(inter.kind)) {
        errors.push(`Interactable ${inter.kind}: not in INTERACTABLE_KINDS`);
      }
    }

    for (const shop of GAME_CATALOG.shopUpgrades) {
      if (!isNonEmptyString(shop.displayName)) errors.push(`ShopUpgrade ${shop.id}: empty displayName`);
      if (!isNonEmptyString(shop.description)) errors.push(`ShopUpgrade ${shop.id}: empty description`);
      if (!SHOP_UPGRADE_IDS.includes(shop.id)) {
        errors.push(`ShopUpgrade ${shop.id}: not in SHOP_UPGRADE_IDS`);
      }
    }

    for (const [trackId, track] of Object.entries(PROCEDURAL_TRACKS)) {
      if (!Number.isFinite(track.bpm) || track.bpm <= 0) {
        errors.push(`Track ${trackId}: invalid bpm (${track.bpm})`);
      }
      if (!track.loop || track.loop.steps <= 0) {
        errors.push(`Track ${trackId}: empty loop section`);
      }
    }

    const detail = `${poolItemCount} pool items checked (${noOpPoolItems} no-ops), all entity metadata & palettes validated`;
    recordCheck(
      '1.2',
      section,
      'Metadata & Zero No-Op Pool Items',
      errors.length === 0 ? 'PASS' : 'FAIL',
      detail,
      errors,
    );
  }

  // 1.3 Built-In ProceduralLowPolyPack Integrity
  {
    const errors: string[] = [];
    let texCount = 0;
    let palCount = 0;

    const pack = new ProceduralLowPolyPack();
    try {
      if (!pack.isLoaded()) {
        errors.push('ProceduralLowPolyPack.isLoaded() returned false');
      }
      const manifest = pack.getManifest();
      if (!manifest) {
        errors.push('ProceduralLowPolyPack.getManifest() returned null');
      } else {
        const schema = validatePackManifest(manifest);
        if (!schema.valid) {
          errors.push(...schema.errors.map((e) => `Built-in manifest schema: ${e}`));
        }

        const textureIds = Object.keys(manifest.textures) as ProceduralTextureId[];
        texCount = textureIds.length;
        if (texCount === 0) {
          errors.push('ProceduralLowPolyPack exposes 0 textures');
        }
        for (const id of textureIds) {
          const tex = pack.getProceduralTexture(id);
          if (!(tex instanceof THREE.DataTexture)) {
            errors.push(`Texture "${id}" did not resolve to a THREE.DataTexture`);
            continue;
          }
          if (!tex.image || tex.image.width <= 0 || tex.image.height <= 0) {
            errors.push(`Texture "${id}" has invalid dimensions`);
          }
          if (tex.magFilter !== THREE.NearestFilter || tex.minFilter !== THREE.NearestFilter) {
            errors.push(`Texture "${id}" must use THREE.NearestFilter (no blurry filtering)`);
          }
          if (tex.generateMipmaps !== false) {
            errors.push(`Texture "${id}" must have generateMipmaps === false`);
          }
        }

        const paletteIds = Object.keys(manifest.palettes);
        palCount = paletteIds.length;
        if (palCount === 0) {
          errors.push('ProceduralLowPolyPack exposes 0 palettes');
        }
        for (const palId of paletteIds) {
          const colors = pack.getPalette(palId);
          if (!colors || colors.length === 0) {
            errors.push(`Palette "${palId}" resolved empty or null`);
          }
        }
      }
    } finally {
      pack.dispose();
    }

    recordCheck(
      '1.3',
      section,
      'Built-In ProceduralLowPolyPack',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${texCount} NearestFilter textures, ${palCount} palettes resolved cleanly`,
      errors,
    );
  }

  // 1.4 Local Custom Pack Manifest (.krunkedbonk-assets/manifest.json)
  {
    const manifestPath = localAssetsDir ? path.join(localAssetsDir, 'manifest.json') : null;
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      recordCheck(
        '1.4',
        section,
        'Local Custom Pack Manifest',
        'SKIP',
        '.krunkedbonk-assets/manifest.json not present locally (CI-safe skip)',
      );
    } else {
      const errors: string[] = [];
      let texRefs = 0;
      let audioRefs = 0;
      let palRefs = 0;

      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const validation = validatePackManifest(parsed);
        if (!validation.valid || !validation.manifest) {
          errors.push(...validation.errors);
        } else {
          const m = validation.manifest;
          const assetsRoot = path.resolve(localAssetsDir!);
          const assetsRootPrefix = assetsRoot.endsWith(path.sep)
            ? assetsRoot
            : `${assetsRoot}${path.sep}`;

          const verifyRef = (kind: string, id: string, relPath: string): void => {
            const full = path.resolve(assetsRoot, relPath);
            if (!full.startsWith(assetsRootPrefix)) {
              errors.push(`${kind} "${id}": path escapes pack root (${relPath})`);
              return;
            }
            if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
              errors.push(`${kind} "${id}": missing referenced file "${relPath}"`);
            }
          };

          for (const [id, entry] of Object.entries(m.textures)) {
            texRefs++;
            verifyRef('texture', id, entry.path);
          }
          for (const [id, entry] of Object.entries(m.audio)) {
            audioRefs++;
            verifyRef('audio', id, entry.path);
          }
          for (const [id, entry] of Object.entries(m.palettes)) {
            palRefs++;
            if (entry.colors.length === 0) {
              errors.push(`palette "${id}": empty colors array`);
            }
            if (entry.sourcePath) {
              verifyRef('palette', id, entry.sourcePath);
            }
          }
        }
      } catch (err) {
        errors.push(`Failed reading manifest.json: ${err instanceof Error ? err.message : String(err)}`);
      }

      const relManifest = path.relative(REPO_ROOT, manifestPath).replace(/\\/g, '/');
      const displayManifest = relManifest.startsWith('..')
        ? '.krunkedbonk-assets/manifest.json'
        : relManifest;

      recordCheck(
        '1.4',
        section,
        'Local Custom Pack Manifest',
        errors.length === 0 ? 'PASS' : 'FAIL',
        `Validated ${texRefs} textures, ${audioRefs} audio, ${palRefs} palettes in ${displayManifest}`,
        errors,
      );
    }
  }
}

// ============================================================================
// CHECK 2: MECHANIC ORACLE PARITY
// ============================================================================

function runCheck2OracleParity(localAssetsDir: string | null): void {
  const section = '2. Mechanic Oracle Parity';
  const oraclePath = localAssetsDir ? path.join(localAssetsDir, 'oracle.json') : null;
  const hasOracle = Boolean(oraclePath && fs.existsSync(oraclePath));

  let oracle: OracleDocument | null = null;
  if (hasOracle && oraclePath) {
    try {
      oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8')) as OracleDocument;
    } catch (err) {
      recordCheck(
        '2.0',
        section,
        'Oracle JSON Load',
        'FAIL',
        `Failed to parse ${oraclePath}`,
        [err instanceof Error ? err.message : String(err)],
      );
      return;
    }
  }

  // 2.1 Core Engine, Physics & Render Constants (checked always + cross-checked against oracle when present)
  {
    const errors: string[] = [];
    const checkEq = (name: string, actual: number, expected: number, eps = 1e-4): void => {
      if (Math.abs(actual - expected) > eps) {
        errors.push(`${name}: expected ${expected}, got ${actual}`);
      }
    };

    checkEq('SIM_HZ', SIM_HZ, oracle?.engineAndPhysics.simHz.value ?? 50);
    checkEq('FIXED_DT', FIXED_DT, oracle?.engineAndPhysics.fixedDeltaTime.value ?? 0.02);
    checkEq('GRAVITY', GRAVITY, oracle?.engineAndPhysics.gravity.value[1] ?? -19.62);
    checkEq('PLAYER_MASS', PLAYER_MASS, oracle?.engineAndPhysics.playerMass.value ?? 60);
    checkEq(
      'PLAYER_CAPSULE_RADIUS',
      PLAYER_CAPSULE_RADIUS,
      oracle?.engineAndPhysics.capsuleRadius.value ?? 0.6,
    );
    checkEq(
      'PLAYER_CAPSULE_HEIGHT',
      PLAYER_CAPSULE_HEIGHT,
      oracle?.engineAndPhysics.capsuleHeight.value ?? 3.0,
    );
    checkEq('FOV_DEFAULT', FOV_DEFAULT, oracle?.engineAndPhysics.fovDefault.value ?? 110);
    checkEq(
      'CAMERA_3RD_OFFSET_Z',
      CAMERA_3RD_OFFSET_Z,
      oracle?.engineAndPhysics.offset3rdPersonZ.value ?? 11.0,
    );
    checkEq('DEFAULT_RENDER_SETTINGS.fpsCap', DEFAULT_RENDER_SETTINGS.fpsCap, 120);
    checkEq('GAMEPAD_DEADZONE_DEFAULT', GAMEPAD_DEADZONE_DEFAULT, 0.15);
    checkEq('GRAVEYARD_GRID_SIZE', GRAVEYARD_GRID_SIZE, 19);
    checkEq(
      'FINAL_BOSS_PYLON_COUNT',
      FINAL_BOSS_PYLON_COUNT,
      oracle?.maps.finalBossMap.pylonCount ?? 11,
    );

    recordCheck(
      '2.1',
      section,
      'Engine, Physics & Render Constants',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `50Hz, g=${GRAVITY}, mass=${PLAYER_MASS}, FOV=${FOV_DEFAULT}, 3rdZ=${CAMERA_3RD_OFFSET_Z}, fpsCap=${DEFAULT_RENDER_SETTINGS.fpsCap}${oracle ? ' (oracle-verified)' : ' (contract-verified)'}`,
      errors,
    );
  }

  if (!oracle) {
    recordCheck(
      '2.2',
      section,
      'Retail Oracle Deep Parity',
      'SKIP',
      '.krunkedbonk-assets/oracle.json not present locally (CI-safe skip)',
    );
    return;
  }

  // 2.2 Characters (21 IDs)
  {
    const errors: string[] = [];
    const catalogCharIds = new Set<string>(GAME_CATALOG.characters.map((c) => c.id));
    const contractCharIds = new Set<string>(CHARACTER_IDS);

    for (const oc of oracle.characters) {
      if (!contractCharIds.has(oc.id)) {
        errors.push(`Contract CHARACTER_IDS missing oracle character "${oc.id}"`);
      }
      if (!catalogCharIds.has(oc.id)) {
        errors.push(`GAME_CATALOG.characters missing oracle character "${oc.id}"`);
      }
    }

    recordCheck(
      '2.2',
      section,
      'Oracle Characters Parity (21)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${GAME_CATALOG.characters.length}/${oracle.characters.length} oracle character IDs matched`,
      errors,
    );
  }

  // 2.3 Weapons (30 IDs + baseDamage / cooldownSec / projectiles tolerance)
  {
    const errors: string[] = [];
    let matched = 0;

    for (const ow of oracle.weapons) {
      const targetNorms = new Set([
        normId(ow.assetName),
        normId(ow.id),
        normId(`Weapon${ow.id}`),
      ]);
      const found = GAME_CATALOG.weapons.find((w) => targetNorms.has(normId(w.id)));
      if (!found) {
        errors.push(`Missing oracle weapon "${ow.assetName}" (enum "${ow.id}")`);
        continue;
      }
      matched++;

      // baseDamage tolerance
      if (ow.damage === 0) {
        // WeaponDice rolls 1-6 dynamically
        if (found.baseDamage < 0 || found.baseDamage > 6) {
          errors.push(`Weapon ${found.id}: baseDamage=${found.baseDamage} outside expected [0..6] for dynamic-roll weapon`);
        }
      } else {
        const dmgTol = Math.max(0.5, ow.damage * 0.15);
        if (Math.abs(found.baseDamage - ow.damage) > dmgTol) {
          errors.push(`Weapon ${found.id}: baseDamage=${found.baseDamage} vs oracle ${ow.damage} (tol ±${dmgTol.toFixed(2)})`);
        }
      }

      // cooldownSec tolerance
      if (ow.endCooldown === 0) {
        // Movement-driven weapons like Flamewalker have endCooldown=0 in Unity
        if (found.cooldownSec < 0 || found.cooldownSec > 1.0) {
          errors.push(`Weapon ${found.id}: cooldownSec=${found.cooldownSec} outside expected [0..1.0] for continuous weapon`);
        }
      } else {
        const cdTol = Math.max(0.15, ow.endCooldown * 0.25);
        if (Math.abs(found.cooldownSec - ow.endCooldown) > cdTol) {
          errors.push(`Weapon ${found.id}: cooldownSec=${found.cooldownSec} vs oracle ${ow.endCooldown} (tol ±${cdTol.toFixed(2)})`);
        }
      }

      // projectiles parity (accounts for burstCount, aura=0/1, and Shotgun multi-pellet)
      const effectiveShots = found.projectiles * (found.burstCount ?? 1);
      if (ow.isAura && ow.projectiles === 0) {
        if (found.projectiles !== 0 && found.projectiles !== 1) {
          errors.push(`Weapon ${found.id}: aura projectiles=${found.projectiles}, expected 0 or 1`);
        }
      } else if (ow.id === 'Shotgun') {
        if (found.projectiles < 1 || found.projectiles > 8) {
          errors.push(`Weapon ${found.id}: shotgun projectiles=${found.projectiles}, expected 1..8`);
        }
      } else if (found.projectiles !== ow.projectiles && effectiveShots !== ow.projectiles) {
        errors.push(
          `Weapon ${found.id}: projectiles=${found.projectiles} (effective=${effectiveShots}) vs oracle ${ow.projectiles}`,
        );
      }
    }

    recordCheck(
      '2.3',
      section,
      'Oracle Weapons Parity (30)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${matched}/${oracle.weapons.length} weapons matched (damage/cooldown/projectiles verified)`,
      errors,
    );
  }

  // 2.4 Tomes (26 IDs + stat / modifierMode / deltaPerLevel parity)
  {
    const errors: string[] = [];
    let matched = 0;

    for (const ot of oracle.tomes) {
      const targetNorms = new Set([
        normId(ot.assetName),
        normId(ot.id),
        normId(`Tome${ot.id}`),
      ]);
      const found = GAME_CATALOG.tomes.find((t) => targetNorms.has(normId(t.id)));
      if (!found) {
        errors.push(`Missing oracle tome "${ot.assetName}" (enum "${ot.id}")`);
        continue;
      }
      matched++;

      if (ot.perLevelDelta === 0) {
        // Special dynamic tomes: Balance, Chaos, Gamba, Hoarder
        if (!ALL_ESTATS.includes(found.stat)) {
          errors.push(`Tome ${found.id}: invalid stat "${found.stat}"`);
        }
        continue;
      }

      const expectedStat = ORACLE_STAT_TO_CONTRACT[ot.stat];
      if (expectedStat && found.stat !== expectedStat) {
        errors.push(`Tome ${found.id}: stat="${found.stat}" vs oracle mapped "${expectedStat}" (raw "${ot.stat}")`);
      }

      const expectedMode = ORACLE_MOD_TO_CONTRACT[ot.modifyType];
      // Allow flat/add flexibility on unit-converted Regen/Attraction tomes
      const flexibleMode = ot.id === 'Regeneration' || ot.id === 'Attraction';
      if (expectedMode && found.modifierMode !== expectedMode && !flexibleMode) {
        errors.push(`Tome ${found.id}: modifierMode="${found.modifierMode}" vs oracle "${expectedMode}"`);
      }

      if (ot.id === 'Regeneration') {
        // Retail stores 40 HP/min (~0.67 HP/s); sim may use HP/s or raw 40
        if (!Number.isFinite(found.deltaPerLevel) || found.deltaPerLevel <= 0) {
          errors.push(`Tome ${found.id}: deltaPerLevel must be > 0, got ${found.deltaPerLevel}`);
        }
      } else if (ot.id === 'Attraction') {
        if (!Number.isFinite(found.deltaPerLevel) || found.deltaPerLevel <= 0) {
          errors.push(`Tome ${found.id}: deltaPerLevel must be > 0, got ${found.deltaPerLevel}`);
        }
      } else {
        const tol = Math.max(0.015, Math.abs(ot.perLevelDelta) * 0.25);
        if (Math.abs(found.deltaPerLevel - ot.perLevelDelta) > tol) {
          errors.push(
            `Tome ${found.id}: deltaPerLevel=${found.deltaPerLevel} vs oracle ${ot.perLevelDelta} (tol ±${tol.toFixed(4)})`,
          );
        }
      }
    }

    recordCheck(
      '2.4',
      section,
      'Oracle Tomes Parity (26)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${matched}/${oracle.tomes.length} tomes matched (stat/mode/delta verified)`,
      errors,
    );
  }

  // 2.5 Items (87 IDs + exact rarity parity)
  {
    const errors: string[] = [];
    let matched = 0;
    const itemByNorm = new Map(GAME_CATALOG.items.map((item) => [normId(item.id), item]));

    for (const oi of oracle.items) {
      const found = itemByNorm.get(normId(oi.id)) ?? itemByNorm.get(normId(oi.assetName));
      if (!found) {
        errors.push(`Missing oracle item "${oi.id}" (asset "${oi.assetName}", ${oi.rarity})`);
        continue;
      }
      matched++;
      if (found.rarity !== oi.rarity) {
        errors.push(`Item ${found.id}: rarity="${found.rarity}" vs oracle "${oi.rarity}"`);
      }
    }

    recordCheck(
      '2.5',
      section,
      'Oracle Items Parity (87 + Rarities)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${matched}/${oracle.items.length} oracle items matched with rarity verification`,
      errors,
    );
  }

  // 2.6 Enemies (52 Live Enemy IDs)
  {
    const errors: string[] = [];
    let matched = 0;
    const enemyByNorm = new Map(GAME_CATALOG.enemies.map((e) => [normId(e.id), e]));

    for (const oe of oracle.enemies.live) {
      const found = enemyByNorm.get(normId(oe.id)) ?? enemyByNorm.get(normId(oe.assetName));
      if (!found) {
        errors.push(`Missing oracle enemy "${oe.id}" (asset "${oe.assetName}", role=${oe.role})`);
        continue;
      }
      matched++;
    }

    recordCheck(
      '2.6',
      section,
      'Oracle Live Enemies Parity (52)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${matched}/${oracle.enemies.live.length} oracle live enemy IDs matched`,
      errors,
    );
  }

  // 2.7 Shop Items (8 Meta Upgrades)
  {
    const errors: string[] = [];
    let matched = 0;

    for (const os of oracle.shopItems) {
      const found = GAME_CATALOG.shopUpgrades.find(
        (s) => normId(s.id) === normId(os.id) || normId(s.id) === normId(os.enumName),
      );
      if (!found) {
        errors.push(`Missing oracle shop item "${os.id}" (${os.enumName})`);
        continue;
      }
      matched++;
      if (found.maxRank !== os.maxLevel) {
        errors.push(`Shop ${found.id}: maxRank=${found.maxRank} vs oracle maxLevel=${os.maxLevel}`);
      }
      if (found.baseSilverCost !== os.basePrice) {
        errors.push(
          `Shop ${found.id}: baseSilverCost=${found.baseSilverCost} vs oracle basePrice=${os.basePrice}`,
        );
      }
    }

    recordCheck(
      '2.7',
      section,
      'Oracle Meta Shop Parity (8)',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `${matched}/${oracle.shopItems.length} shop upgrades matched (maxRank & basePrice verified)`,
      errors,
    );
  }

  // 2.8 Maps, Stage Durations & Lighting RGB Parity
  {
    const errors: string[] = [];
    const mapById = new Map(GAME_CATALOG.maps.map((m) => [m.id, m]));
    let stagesChecked = 0;

    for (const mapId of MAP_IDS) {
      if (!mapById.has(mapId)) {
        errors.push(`GAME_CATALOG.maps missing contract map "${mapId}"`);
      }
    }

    for (const om of oracle.maps.active) {
      const found = mapById.get(om.id as (typeof MAP_IDS)[number]);
      if (!found) {
        errors.push(`Missing oracle active map "${om.id}"`);
        continue;
      }

      const validDurations = new Set<number>([om.defaultStageDurationSec]);
      if (om.stages[0]?.stageTimeSec) validDurations.add(om.stages[0].stageTimeSec);
      if (!validDurations.has(found.stageDurationSec)) {
        errors.push(
          `Map ${found.id}: stageDurationSec=${found.stageDurationSec} vs oracle ${Array.from(validDurations).join('/')}`,
        );
      }

      if (om.id === 'Graveyard') {
        const expectedGrid = om.stages[0]?.mapParameters?.size ?? GRAVEYARD_GRID_SIZE;
        if (found.generation.gridSize !== expectedGrid) {
          errors.push(`Map Graveyard: gridSize=${found.generation.gridSize} vs oracle ${expectedGrid}`);
        }
      }

      const rgbTol = 0.15;
      for (let idx = 0; idx < om.stages.length; idx++) {
        const stage = om.stages[idx]!;
        const tier = (idx + 1) as MapTier;
        const lighting = found.lightingByTier[tier];
        if (!lighting) {
          errors.push(`Map ${found.id}: missing lightingByTier[${tier}] (${stage.assetName})`);
          continue;
        }
        stagesChecked++;

        const fogDelta = maxRgbDelta(lighting.fogColor, stage.lighting.fogColor);
        if (fogDelta > rgbTol) {
          errors.push(
            `Map ${found.id} T${tier} fogColor (${lighting.fogColor.r.toFixed(2)},${lighting.fogColor.g.toFixed(2)},${lighting.fogColor.b.toFixed(2)}) diverges from oracle (${stage.lighting.fogColor.slice(0, 3).map((n) => n.toFixed(2)).join(',')}) by ${fogDelta.toFixed(3)}`,
          );
        }

        const ambDelta = maxRgbDelta(lighting.ambientColor, stage.lighting.ambienceColor);
        if (ambDelta > rgbTol) {
          errors.push(
            `Map ${found.id} T${tier} ambientColor diverges from oracle by ${ambDelta.toFixed(3)}`,
          );
        }

        const sunDelta = maxRgbDelta(lighting.sunColor, stage.lighting.lightColor);
        if (sunDelta > rgbTol) {
          errors.push(
            `Map ${found.id} T${tier} sunColor diverges from oracle by ${sunDelta.toFixed(3)}`,
          );
        }
      }
    }

    const finalMap = mapById.get('FinalBossMap');
    if (!finalMap || !finalMap.isFinalBossMap) {
      errors.push('Missing FinalBossMap in GAME_CATALOG.maps');
    } else if (finalMap.generation.pylonCount !== oracle.maps.finalBossMap.pylonCount) {
      errors.push(
        `FinalBossMap: pylonCount=${finalMap.generation.pylonCount} vs oracle ${oracle.maps.finalBossMap.pylonCount}`,
      );
    }

    recordCheck(
      '2.8',
      section,
      'Oracle Maps, Durations & Lighting RGB',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `Checked ${oracle.maps.active.length} active maps (${stagesChecked} stage tiers) + FinalBossMap (${oracle.maps.finalBossMap.pylonCount} pylons)`,
      errors,
    );
  }
}

// ============================================================================
// CHECK 3: TASTE_NOTES ENFORCEMENT
// ============================================================================

function runCheck3TasteNotes(): void {
  const section = '3. TASTE_NOTES Enforcement';

  // 3.1 Brand Leak Scan (ZERO "Megabonk" or "Ved" in UI / Input / Data / index.html / README.md)
  {
    const scanDirs = ['src/ui', 'src/input', 'src/data'];
    const scanFiles = ['index.html', 'README.md'];
    const targets: string[] = [];

    for (const relDir of scanDirs) {
      targets.push(...walkFiles(path.join(REPO_ROOT, relDir)));
    }
    for (const relFile of scanFiles) {
      const full = path.join(REPO_ROOT, relFile);
      if (fs.existsSync(full)) targets.push(full);
    }

    const brandPatterns: Array<{ label: string; regex: RegExp }> = [
      { label: 'Megabonk', regex: /megabonk/i },
      { label: 'Ved', regex: /\bved(?:inad)?\b/i },
    ];

    const errors: string[] = [];
    for (const filePath of targets) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const { label, regex } of brandPatterns) {
          if (regex.test(line)) {
            errors.push(`${rel}:${i + 1} leaks "${label}": ${line.trim().slice(0, 90)}`);
          }
        }
      }
    }

    recordCheck(
      '3.1',
      section,
      'Zero Brand Leaks ("Megabonk" / "Ved")',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `Scanned ${targets.length} files across src/{ui,input,data}, index.html, README.md`,
      errors,
    );
  }

  // 3.2 TouchOverlay starts strictly hidden and activates only on touch / simulated touch
  {
    const errors: string[] = [];
    const touchPath = path.join(REPO_ROOT, 'src', 'input', 'TouchOverlay.ts');
    if (!fs.existsSync(touchPath)) {
      errors.push('src/input/TouchOverlay.ts is missing');
    } else {
      const src = fs.readFileSync(touchPath, 'utf8');
      if (!/touchActive\s*=\s*false/.test(src)) {
        errors.push('TouchOverlay.ts must initialize touchActive = false');
      }
      if (!/display\s*=\s*['"]none['"]/.test(src)) {
        errors.push("TouchOverlay.ts must set display = 'none' while inactive");
      }
      if (!/pointerEvents\s*=\s*['"]none['"]/.test(src)) {
        errors.push("TouchOverlay.ts must set pointerEvents = 'none' while inactive");
      }
      if (!/addEventListener\s*\(\s*['"]touchstart['"]/.test(src) || !/pointerType\s*===\s*['"]touch['"]/.test(src)) {
        errors.push("TouchOverlay.ts must gate activation on touchstart / pointerType === 'touch'");
      }
      if (!/setSimulatedTouch\s*\(/.test(src)) {
        errors.push('TouchOverlay.ts must expose setSimulatedTouch(active) for debug/test bridge');
      }

      // Live headless behavioral check
      const overlay = new TouchOverlay();
      if (overlay.isVisible() !== false) {
        errors.push('Runtime TouchOverlay.isVisible() must start false');
      }
      if (overlay.pollTouchInput().active !== false) {
        errors.push('Runtime TouchOverlay.pollTouchInput().active must start false');
      }
      overlay.setSimulatedTouch(true);
      if (overlay.isVisible() !== true) {
        errors.push('Runtime TouchOverlay.setSimulatedTouch(true) failed to activate overlay');
      }
      overlay.hideOnNonTouchInput();
      if (overlay.isVisible() !== false) {
        errors.push('Runtime TouchOverlay.hideOnNonTouchInput() failed to hide overlay');
      }
    }

    recordCheck(
      '3.2',
      section,
      'TouchOverlay Strictly Touch-Activated',
      errors.length === 0 ? 'PASS' : 'FAIL',
      'Starts hidden (touchActive=false, display:none, pointer-events:none); activates only on touch/simulated touch',
      errors,
    );
  }

  // 3.3 GamepadDriver baseline stick calibration, 0.15 radial deadzone, and UiNavAction navigation
  {
    const errors: string[] = [];
    const gpPath = path.join(REPO_ROOT, 'src', 'input', 'GamepadDriver.ts');
    if (!fs.existsSync(gpPath)) {
      errors.push('src/input/GamepadDriver.ts is missing');
    } else {
      const src = fs.readFileSync(gpPath, 'utf8');
      if (!/calibrateNeutral\s*\(/.test(src)) {
        errors.push('GamepadDriver.ts must implement calibrateNeutral() baseline stick calibration');
      }
      if (!/applyRadialDeadzone/.test(src) || !/Math\.hypot/.test(src)) {
        errors.push('GamepadDriver.ts must implement radial deadzone using Math.hypot');
      }
      if (!/GAMEPAD_DEADZONE_DEFAULT/.test(src)) {
        errors.push('GamepadDriver.ts must use GAMEPAD_DEADZONE_DEFAULT (0.15)');
      }
      if (!/\bUiNavAction\b/.test(src) || !/\buiActions\b/.test(src)) {
        errors.push('GamepadDriver.ts must emit UiNavAction[] uiActions for full UI navigation');
      }

      // Live headless behavioral check
      const driver = new GamepadDriver();
      const cal = driver.getCalibration();
      if (Math.abs(cal.deadzone - 0.15) > 1e-6) {
        errors.push(`Runtime GamepadDriver default deadzone=${cal.deadzone}, expected 0.15`);
      }
      if (typeof driver.calibrateNeutral !== 'function') {
        errors.push('Runtime GamepadDriver.calibrateNeutral is not a function');
      }
      const pollRes = driver.poll(0.02, 'title');
      if (!Array.isArray(pollRes.uiActions)) {
        errors.push('Runtime GamepadDriver.poll() did not return uiActions array');
      }
    }

    recordCheck(
      '3.3',
      section,
      'GamepadDriver Calibration, Deadzone & UI Nav',
      errors.length === 0 ? 'PASS' : 'FAIL',
      'calibrateNeutral(), 0.15 radial deadzone, and UiNavAction[] UI navigation verified',
      errors,
    );
  }
}

// ============================================================================
// CHECK 4: IP FIREWALL
// ============================================================================

const FORBIDDEN_BINARY_EXTENSIONS = new Set([
  '.assets',
  '.ress',
  '.resource',
  '.bundle',
  '.unity',
  '.unity3d',
  '.dat',
  '.dll',
  '.exe',
  '.bank',
  '.fsb',
  '.fbx',
  '.obj',
  '.glb',
  '.gltf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tga',
  '.dds',
  '.ogg',
  '.wav',
  '.mp3',
  '.m4a',
  '.flac',
]);

const FORBIDDEN_RETAIL_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /\.krunkedbonk-assets/i,
  /globalgamemanagers/i,
  /sharedassets\d/i,
  /il2cpp_data/i,
  /megabonk_data/i,
];

function runCheck4IpFirewall(): void {
  const section = '4. IP Firewall';

  // 4.1 Git Tracked Files Audit (`git ls-files`)
  {
    const errors: string[] = [];
    let trackedCount = 0;

    try {
      const stdout = execFileSync('git', ['ls-files'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const files = stdout
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\\/g, '/'))
        .filter(Boolean);
      trackedCount = files.length;

      for (const rel of files) {
        const lower = rel.toLowerCase();
        const ext = path.extname(lower);

        for (const pat of FORBIDDEN_RETAIL_PATH_PATTERNS) {
          if (pat.test(rel)) {
            errors.push(`Tracked forbidden retail/pack path: ${rel}`);
            break;
          }
        }

        if (FORBIDDEN_BINARY_EXTENSIONS.has(ext)) {
          errors.push(`Tracked forbidden binary/texture/audio/mesh file: ${rel}`);
        }

        // Gitignored rules enforcement
        if (lower.startsWith('dna/') || lower.includes('/dna/')) {
          errors.push(`Tracked gitignored DNA artifact: ${rel}`);
        }
        if (lower === 'export-dna.ts' || lower.endsWith('/export-dna.ts')) {
          errors.push(`Tracked gitignored export-dna.ts: ${rel}`);
        }
        if (lower === 'scripts/verify/playtest-100.ts' || lower === 'scripts/verify/verify-all.ts') {
          errors.push(`Tracked gitignored local verify script: ${rel}`);
        }
        if (lower.endsWith('.md') && rel !== 'README.md') {
          errors.push(`Tracked local markdown file (only README.md allowed): ${rel}`);
        }
        if (
          lower.startsWith('node_modules/') ||
          lower.startsWith('dist/') ||
          lower.startsWith('.venv/') ||
          lower.endsWith('.bak')
        ) {
          errors.push(`Tracked build/temp artifact: ${rel}`);
        }
      }
    } catch (err) {
      errors.push(
        `Failed to run git ls-files: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    recordCheck(
      '4.1',
      section,
      'Git Tracked Files IP & Gitignore Audit',
      errors.length === 0 ? 'PASS' : 'FAIL',
      `Audited ${trackedCount} tracked files via git ls-files (0 retail/pack/gitignored leaks)`,
      errors,
    );
  }

  // 4.2 Build Output Audit (`dist/`)
  {
    const distDir = path.join(REPO_ROOT, 'dist');
    if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
      recordCheck(
        '4.2',
        section,
        'Built dist/ Containment Audit',
        'SKIP',
        'dist/ directory not present (run npm run build to audit production bundle)',
      );
    } else {
      const errors: string[] = [];
      const distFiles = walkFiles(distDir);

      for (const full of distFiles) {
        const rel = path.relative(distDir, full).replace(/\\/g, '/');
        const lower = rel.toLowerCase();
        const ext = path.extname(lower);

        if (
          lower.includes('.krunkedbonk-assets') ||
          lower.includes('__custom_pack__') ||
          lower.endsWith('oracle.json') ||
          lower.endsWith('manifest.json')
        ) {
          errors.push(`dist/ contains disallowed custom-pack/oracle file: dist/${rel}`);
        }

        if (FORBIDDEN_BINARY_EXTENSIONS.has(ext)) {
          errors.push(`dist/ contains disallowed binary/asset file: dist/${rel}`);
        }

        if (ext === '.js' || ext === '.html' || ext === '.css') {
          const text = fs.readFileSync(full, 'utf8');
          if (/megabonk_data|steamapps[\\/]+common[\\/]+megabonk/i.test(text)) {
            errors.push(`dist/${rel} references retail Steam install path`);
          }
        }
      }

      recordCheck(
        '4.2',
        section,
        'Built dist/ Containment Audit',
        errors.length === 0 ? 'PASS' : 'FAIL',
        `Audited ${distFiles.length} files in dist/ (0 custom-pack/retail files bundled)`,
        errors,
      );
    }
  }
}

// ============================================================================
// REPORT RENDERER & ENTRYPOINT
// ============================================================================

function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

function printReport(localAssetsDir: string | null): void {
  const divider = '='.repeat(98);
  const subDivider = '-'.repeat(98);

  console.log('');
  console.log(divider);
  console.log(' KRUNKEDBONK — GATE A VERIFIER (Assets / Oracle Parity / TASTE_NOTES / IP Firewall)');
  console.log(
    ` Repo: ${REPO_ROOT} | Local Pack: ${localAssetsDir ?? 'none (CI / clean standalone mode)'}`,
  );
  console.log(divider);

  let currentSection = '';
  for (const item of results) {
    if (item.section !== currentSection) {
      currentSection = item.section;
      console.log('');
      console.log(` ${currentSection}`);
      console.log(subDivider);
    }
    const badge =
      item.status === 'PASS' ? '[PASS]' : item.status === 'SKIP' ? '[SKIP]' : '[FAIL]';
    console.log(` ${badge} ${padRight(item.id, 4)} ${padRight(item.name, 46)} ${item.detail}`);
    if (item.errors.length > 0) {
      const maxShown = 12;
      for (let i = 0; i < Math.min(maxShown, item.errors.length); i++) {
        console.log(`        - ${item.errors[i]}`);
      }
      if (item.errors.length > maxShown) {
        console.log(`        ... (+${item.errors.length - maxShown} more issues)`);
      }
    }
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log('');
  console.log(divider);
  console.log(
    ` GATE A SUMMARY: ${passed} PASS | ${skipped} SKIP | ${failed} FAIL  =>  ${failed === 0 ? 'ALL CHECKS PASSED' : 'FAILED'}`,
  );
  console.log(divider);
  console.log('');
}

function main(): void {
  const localAssetsDir = resolveLocalAssetsDir();

  runCheck1BuiltInAndCatalog(localAssetsDir);
  runCheck2OracleParity(localAssetsDir);
  runCheck3TasteNotes();
  runCheck4IpFirewall();

  printReport(localAssetsDir);

  const hasFailures = results.some((r) => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

main();
