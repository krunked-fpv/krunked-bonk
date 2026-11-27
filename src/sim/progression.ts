import {
  MAX_TOME_SLOTS,
  MAX_WEAPON_SLOTS,
  type ChallengeDef,
  type DraftOffer,
  type DraftOfferChoice,
  type EStat,
  type GameCatalog,
  type Rarity,
  type ShopUpgradeId,
  type SimEvent,
  type SimState,
} from '../contracts/index';
import { dispatchItemTrigger, grantPlayerItem } from './items';

const PERMANENT_BUFF_SEC = 999999;

interface BlessingTemplate {
  stat: EStat;
  mode: 'add' | 'mult' | 'flat';
  baseDelta: number;
  label: string;
  formatValue: (v: number) => string;
}

const SHRINE_BLESSINGS: readonly BlessingTemplate[] = [
  { stat: 'MaxHealth', mode: 'flat', baseDelta: 25, label: 'Max Health', formatValue: (v) => `+${Math.round(v)} Max HP` },
  { stat: 'DamageMultiplier', mode: 'mult', baseDelta: 0.12, label: 'Damage', formatValue: (v) => `+${Math.round(v * 100)}% Damage` },
  { stat: 'AttackSpeed', mode: 'add', baseDelta: 0.1, label: 'Attack Speed', formatValue: (v) => `+${Math.round(v * 100)}% Attack Speed` },
  { stat: 'MoveSpeed', mode: 'add', baseDelta: 0.1, label: 'Move Speed', formatValue: (v) => `+${Math.round(v * 100)}% Move Speed` },
  { stat: 'CritChance', mode: 'flat', baseDelta: 0.08, label: 'Crit Chance', formatValue: (v) => `+${Math.round(v * 100)}% Crit Chance` },
  { stat: 'Armor', mode: 'flat', baseDelta: 0.1, label: 'Armor', formatValue: (v) => `+${Math.round(v * 100)}% Armor` },
  { stat: 'AreaSize', mode: 'add', baseDelta: 0.12, label: 'Area Size', formatValue: (v) => `+${Math.round(v * 100)}% Area Size` },
  { stat: 'PickupRange', mode: 'flat', baseDelta: 2.0, label: 'Pickup Range', formatValue: (v) => `+${v.toFixed(1)}m Pickup Range` },
  { stat: 'Luck', mode: 'flat', baseDelta: 0.1, label: 'Luck', formatValue: (v) => `+${Math.round(v * 100)}% Luck` },
  { stat: 'Shield', mode: 'flat', baseDelta: 20, label: 'Shield', formatValue: (v) => `+${Math.round(v)} Max Shield` },
];

/**
 * Exact XP requirement curve for advancing from `level` to `level + 1`.
 */
export function xpRequired(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return Math.floor(10 * Math.pow(lvl, 1.38) + 8 * lvl);
}

export function getMaxWeaponSlots(
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): number {
  const shopBonus = Math.max(0, Math.floor(shopLevels?.Weapons ?? 0));
  let slots = Math.min(MAX_WEAPON_SLOTS, 2 + shopBonus);
  if (challenge?.rules.maxWeapons !== undefined) {
    slots = Math.min(slots, Math.max(1, challenge.rules.maxWeapons));
  }
  return slots;
}

export function getMaxTomeSlots(
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): number {
  if (challenge?.rules.disableTomes) return 0;
  const shopBonus = Math.max(0, Math.floor(shopLevels?.Tomes ?? 0));
  return Math.min(MAX_TOME_SLOTS, 2 + shopBonus);
}

/**
 * Rolls a rarity tier shifted upward smoothly by player Luck.
 */
export function rollRarity(luck: number, rng: () => number): Rarity {
  const l = Math.max(0, luck);
  const wCommon = Math.max(15, 62 - l * 28);
  const wRare = 26 + l * 14;
  const wEpic = 9 + l * 10;
  const wLegendary = 3 + l * 6;
  const total = wCommon + wRare + wEpic + wLegendary;
  let roll = rng() * total;
  if ((roll -= wLegendary) < 0) return 'Legendary';
  if ((roll -= wEpic) < 0) return 'Epic';
  if ((roll -= wRare) < 0) return 'Rare';
  return 'Common';
}

function rarityLevelBonus(rarity: Rarity): number {
  switch (rarity) {
    case 'Legendary':
      return 3;
    case 'Epic':
      return 2;
    case 'Rare':
    case 'Common':
    default:
      return 1;
  }
}

interface CandidateEntry {
  category: DraftOfferChoice['category'];
  refId: string;
  displayName: string;
  description: string;
  baseRarity?: Rarity;
  nextLevel?: number;
  weight: number;
}

function buildEligibleLevelUpCandidates(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
  excludeRefIds?: ReadonlySet<string>,
): CandidateEntry[] {
  const player = state.player;
  const banished = new Set(state.banishedIds);
  const maxWeapons = getMaxWeaponSlots(shopLevels, challenge);
  const maxTomes = getMaxTomeSlots(shopLevels, challenge);
  const candidates: CandidateEntry[] = [];

  // 1. Eligible Weapons (upgrade owned or equip new if slots remain)
  for (let i = 0; i < catalog.weapons.length; i++) {
    const w = catalog.weapons[i];
    if (banished.has(w.id) || excludeRefIds?.has(w.id)) continue;
    const owned = player.weapons.find((slot) => slot.weaponId === w.id);
    if (owned) {
      if (owned.level < w.maxLevel) {
        candidates.push({
          category: 'weapon',
          refId: w.id,
          displayName: w.displayName,
          description: `Upgrade ${w.displayName}: +${w.damagePerLevel} base damage & faster cooldown.`,
          nextLevel: owned.level + 1,
          weight: 14,
        });
      }
    } else if (player.weapons.length < maxWeapons) {
      candidates.push({
        category: 'weapon',
        refId: w.id,
        displayName: w.displayName,
        description: w.description,
        nextLevel: 1,
        weight: 10,
      });
    }
  }

  // 2. Eligible Tomes (upgrade owned or equip new if slots remain)
  for (let i = 0; i < catalog.tomes.length; i++) {
    const t = catalog.tomes[i];
    if (banished.has(t.id) || excludeRefIds?.has(t.id)) continue;
    const owned = player.tomes.find((slot) => slot.tomeId === t.id);
    if (owned) {
      if (owned.level < t.maxLevel) {
        candidates.push({
          category: 'tome',
          refId: t.id,
          displayName: t.displayName,
          description: t.description,
          nextLevel: owned.level + 1,
          weight: t.rarityWeight + 3,
        });
      }
    } else if (player.tomes.length < maxTomes) {
      candidates.push({
        category: 'tome',
        refId: t.id,
        displayName: t.displayName,
        description: t.description,
        nextLevel: 1,
        weight: t.rarityWeight,
      });
    }
  }

  // 3. Fallback pool items if fewer than 3 weapon/tome upgrades exist
  if (candidates.length < 3) {
    for (let i = 0; i < catalog.items.length; i++) {
      const it = catalog.items[i];
      if (it.isQuestItem) continue;
      if (banished.has(it.id) || excludeRefIds?.has(it.id)) continue;
      candidates.push({
        category: 'item',
        refId: it.id,
        displayName: it.displayName,
        description: it.description,
        baseRarity: it.rarity,
        weight: it.rarity === 'Legendary' ? 3 : it.rarity === 'Epic' ? 5 : it.rarity === 'Rare' ? 8 : 11,
      });
    }
  }

  return candidates;
}

function pickWeightedCandidate(
  pool: CandidateEntry[],
  rng: () => number,
): CandidateEntry | null {
  if (pool.length === 0) return null;
  let totalWeight = 0;
  for (let i = 0; i < pool.length; i++) {
    totalWeight += Math.max(0.1, pool[i].weight);
  }
  let roll = rng() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    roll -= Math.max(0.1, pool[i].weight);
    if (roll <= 0) {
      const [picked] = pool.splice(i, 1);
      return picked;
    }
  }
  return pool.pop() ?? null;
}

function materializeLevelUpChoice(
  candidate: CandidateEntry,
  index: number,
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
): DraftOfferChoice {
  const rarity = candidate.baseRarity ?? rollRarity(state.player.stats.Luck, rng);
  let nextLevel = candidate.nextLevel;
  let description = candidate.description;

  if (candidate.category === 'weapon' && nextLevel !== undefined) {
    const def = catalog.weapons.find((w) => w.id === candidate.refId);
    const owned = state.player.weapons.find((s) => s.weaponId === candidate.refId);
    if (def && owned) {
      const bonus = rarityLevelBonus(rarity);
      nextLevel = Math.min(def.maxLevel, owned.level + bonus);
      const gained = nextLevel - owned.level;
      if (gained > 1) {
        description = `${rarity} Surge! Upgrades ${def.displayName} by +${gained} levels (Lv.${nextLevel}).`;
      }
    }
  } else if (candidate.category === 'tome' && nextLevel !== undefined) {
    const def = catalog.tomes.find((t) => t.id === candidate.refId);
    const owned = state.player.tomes.find((s) => s.tomeId === candidate.refId);
    if (def && owned) {
      const bonus = rarityLevelBonus(rarity);
      nextLevel = Math.min(def.maxLevel, owned.level + bonus);
      const gained = nextLevel - owned.level;
      if (gained > 1) {
        description = `${rarity} Insight! Upgrades ${def.displayName} by +${gained} levels (Lv.${nextLevel}).`;
      }
    }
  }

  return {
    index,
    category: candidate.category,
    refId: candidate.refId,
    displayName: candidate.displayName,
    description,
    rarity,
    nextLevel,
  };
}

/**
 * Generates a 3-card Level-Up Draft Offer respecting weapon/tome slots, banished IDs, and Luck.
 */
export function generateLevelUpOffer(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): DraftOffer {
  const pool = buildEligibleLevelUpCandidates(state, catalog, shopLevels, challenge);
  const choices: DraftOfferChoice[] = [];

  for (let i = 0; i < 3; i++) {
    const picked = pickWeightedCandidate(pool, rng);
    if (picked) {
      choices.push(materializeLevelUpChoice(picked, i, state, catalog, rng));
    } else {
      // Ultimate fallback: permanent stat blessing so draft never stalls empty
      const b = SHRINE_BLESSINGS[Math.floor(rng() * SHRINE_BLESSINGS.length) % SHRINE_BLESSINGS.length];
      const delta = Math.round(b.baseDelta * 1000) / 1000;
      choices.push({
        index: i,
        category: 'stat_blessing',
        refId: `blessing:${b.stat}:${b.mode}:${delta}`,
        displayName: `${b.label} Boon`,
        description: `Permanently gain ${b.formatValue(delta)}.`,
        rarity: rollRarity(state.player.stats.Luck, rng),
      });
    }
  }

  return {
    source: 'level_up',
    title: `LEVEL ${state.player.level} — CHOOSE AN UPGRADE`,
    choices,
    canReroll: state.rerollsLeft > 0,
    canBanish: state.banishesLeft > 0,
    canSkip: state.skipsLeft > 0,
  };
}

/**
 * Generates a 3-card Charge Shrine / Moai stat blessing offer.
 * Golden shrines double magnitudes; Wrench stacks boost rewards by +25% each.
 */
export function generateShrineOffer(
  state: Readonly<SimState>,
  rng: () => number,
  isGolden: boolean,
  wrenchStacks: number,
  source: 'shrine' | 'moai' = 'shrine',
): DraftOffer {
  const mult = (isGolden ? 2.0 : 1.0) * (1 + 0.25 * Math.max(0, wrenchStacks));
  const pool = [...SHRINE_BLESSINGS];
  const choices: DraftOfferChoice[] = [];

  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    const [b] = pool.splice(idx, 1);
    const rarity: Rarity = isGolden ? 'Legendary' : rollRarity(state.player.stats.Luck + 0.15, rng);
    const rarityScale = rarity === 'Legendary' ? 1.5 : rarity === 'Epic' ? 1.3 : rarity === 'Rare' ? 1.15 : 1.0;
    const delta = Math.round(b.baseDelta * mult * rarityScale * 1000) / 1000;

    choices.push({
      index: i,
      category: 'stat_blessing',
      refId: `blessing:${b.stat}:${b.mode}:${delta}`,
      displayName: `${isGolden ? 'Golden ' : ''}${b.label} Blessing`,
      description: `Permanently gain ${b.formatValue(delta)}.`,
      rarity,
    });
  }

  return {
    source,
    title: isGolden ? 'GOLDEN SHRINE — CLAIM YOUR BLESSING' : 'SHRINE CHARGED — CHOOSE A BLESSING',
    choices,
    canReroll: state.rerollsLeft > 0,
    canBanish: false,
    canSkip: false,
  };
}

/**
 * Checks player XP against `xpToNext` and opens a Level-Up Draft Offer when threshold is reached.
 */
export function checkAndTriggerLevelUp(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): boolean {
  const player = state.player;
  if (player.dead || state.pendingOffer !== null || state.phase !== 'playing') {
    return false;
  }
  if (player.xp < player.xpToNext) {
    return false;
  }

  player.xp -= player.xpToNext;
  player.level += 1;
  player.xpToNext = xpRequired(player.level);

  recalcStats?.();

  events.push({
    type: 'player_level_up',
    tick: state.tick,
    level: player.level,
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
  });

  dispatchItemTrigger(
    state,
    catalog,
    'OnLevelUp',
    { pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z }, recalcStats },
    rng,
    events,
  );

  state.pendingOffer = generateLevelUpOffer(state, catalog, rng, shopLevels, challenge);
  const fromPhase = state.phase;
  state.phase = 'level_up';
  events.push({
    type: 'phase_changed',
    tick: state.tick,
    from: fromPhase,
    to: 'level_up',
  });

  return true;
}

function applyStatBlessingRef(state: SimState, refId: string): boolean {
  const parts = refId.split(':');
  if (parts.length < 4 || parts[0] !== 'blessing') return false;
  const stat = parts[1] as EStat;
  const mode = parts[2] as 'add' | 'mult' | 'flat';
  const delta = Number(parts[3]);
  if (!Number.isFinite(delta)) return false;

  const mod =
    mode === 'mult'
      ? { stat, mult: delta, sourceId: `blessing:${state.tick}` }
      : mode === 'add'
        ? { stat, add: delta, sourceId: `blessing:${state.tick}` }
        : { stat, flat: delta, sourceId: `blessing:${state.tick}` };

  state.player.buffs.push({
    id: `blessing:${state.tick}:${state.nextEntityId++}`,
    remainingSec: PERMANENT_BUFF_SEC,
    modifiers: [mod],
  });
  return true;
}

/**
 * Applies the selected card from `state.pendingOffer`, recalculates stats, returns to `'playing'`,
 * and chains immediately into the next level-up if surplus XP remains.
 */
export function applyDraftChoice(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  choiceIndex: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): boolean {
  const offer = state.pendingOffer;
  if (!offer) return false;
  const choice = offer.choices[choiceIndex];
  if (!choice) return false;

  const player = state.player;
  if (choice.goldCost && choice.goldCost > 0) {
    if (player.gold < choice.goldCost) return false;
    player.gold -= choice.goldCost;
  }

  switch (choice.category) {
    case 'weapon': {
      const def = catalog.weapons.find((w) => w.id === choice.refId);
      if (!def) return false;
      const existing = player.weapons.find((w) => w.weaponId === def.id);
      if (existing) {
        existing.level = Math.min(def.maxLevel, choice.nextLevel ?? existing.level + 1);
      } else {
        player.weapons.push({
          slotIndex: player.weapons.length,
          weaponId: def.id,
          level: 1,
          cooldownTimer: 0,
          burstRemaining: 0,
          burstTimer: 0,
          stolenByPylonId: null,
          totalDamage: 0,
          kills: 0,
        });
      }
      break;
    }

    case 'tome': {
      const def = catalog.tomes.find((t) => t.id === choice.refId);
      if (!def) return false;
      const existing = player.tomes.find((t) => t.tomeId === def.id);
      if (existing) {
        existing.level = Math.min(def.maxLevel, choice.nextLevel ?? existing.level + 1);
      } else {
        player.tomes.push({
          tomeId: def.id,
          level: 1,
        });
      }
      break;
    }

    case 'item':
    case 'duplicate_item': {
      grantPlayerItem(state, choice.refId, 1);
      break;
    }

    case 'stat_blessing': {
      applyStatBlessingRef(state, choice.refId);
      break;
    }
  }

  const prevMaxHp = player.maxHp;
  recalcStats?.();
  if (player.maxHp > prevMaxHp) {
    player.hp = Math.min(player.maxHp, player.hp + (player.maxHp - prevMaxHp));
  }

  state.pendingOffer = null;
  const fromPhase = state.phase;
  state.phase = 'playing';
  events.push({
    type: 'phase_changed',
    tick: state.tick,
    from: fromPhase,
    to: 'playing',
  });

  // Chain into another level-up if player banked surplus XP
  checkAndTriggerLevelUp(state, catalog, rng, events, recalcStats, shopLevels, challenge);
  return true;
}

/**
 * Consumes 1 reroll charge to regenerate the active draft offer.
 */
export function rerollDraft(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  _events: SimEvent[],
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): boolean {
  const offer = state.pendingOffer;
  if (!offer || !offer.canReroll || state.rerollsLeft <= 0) return false;

  state.rerollsLeft -= 1;
  if (offer.source === 'shrine' || offer.source === 'moai') {
    const isGolden = offer.title.includes('GOLDEN');
    const wrench = state.player.items.find((i) => i.itemId === 'Wrench')?.stacks ?? 0;
    state.pendingOffer = generateShrineOffer(state, rng, isGolden, wrench, offer.source);
  } else {
    state.pendingOffer = generateLevelUpOffer(state, catalog, rng, shopLevels, challenge);
  }
  return true;
}

/**
 * Permanently banishes `choiceIndex` for the remainder of the run and replaces that slot.
 */
export function banishDraftChoice(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  choiceIndex: number,
  rng: () => number,
  _events: SimEvent[],
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): boolean {
  const offer = state.pendingOffer;
  if (!offer || !offer.canBanish || state.banishesLeft <= 0) return false;
  const target = offer.choices[choiceIndex];
  if (!target) return false;

  if (!state.banishedIds.includes(target.refId)) {
    state.banishedIds.push(target.refId);
  }
  state.banishesLeft -= 1;

  const existingIds = new Set(offer.choices.map((c) => c.refId));
  const pool = buildEligibleLevelUpCandidates(state, catalog, shopLevels, challenge, existingIds);
  const replacement = pickWeightedCandidate(pool, rng);

  if (replacement) {
    offer.choices[choiceIndex] = materializeLevelUpChoice(replacement, choiceIndex, state, catalog, rng);
  } else {
    const b = SHRINE_BLESSINGS[Math.floor(rng() * SHRINE_BLESSINGS.length) % SHRINE_BLESSINGS.length];
    offer.choices[choiceIndex] = {
      index: choiceIndex,
      category: 'stat_blessing',
      refId: `blessing:${b.stat}:${b.mode}:${b.baseDelta}`,
      displayName: `${b.label} Boon`,
      description: `Permanently gain ${b.formatValue(b.baseDelta)}.`,
      rarity: 'Common',
    };
  }

  offer.canBanish = state.banishesLeft > 0;
  return true;
}

/**
 * Skips the current draft offer, refunding 25% of current level XP requirement.
 */
export function skipDraft(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): boolean {
  const offer = state.pendingOffer;
  if (!offer || !offer.canSkip || state.skipsLeft <= 0) return false;

  state.skipsLeft -= 1;
  state.player.xp += Math.floor(state.player.xpToNext * 0.25);
  state.pendingOffer = null;

  const fromPhase = state.phase;
  state.phase = 'playing';
  events.push({
    type: 'phase_changed',
    tick: state.tick,
    from: fromPhase,
    to: 'playing',
  });

  checkAndTriggerLevelUp(state, catalog, rng, events, recalcStats, shopLevels, challenge);
  return true;
}
