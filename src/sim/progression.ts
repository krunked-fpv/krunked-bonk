import {
  MAX_TOME_SLOTS,
  MAX_WEAPON_SLOTS,
  type ChallengeDef,
  type DraftOffer,
  type DraftOfferChoice,
  type EStat,
  type GameCatalog,
  type InteractableState,
  type Rarity,
  type ShopUpgradeId,
  type SimEvent,
  type SimState,
} from '../contracts/index';
import { getItemById, resolveCanonicalItemId } from '../data/items';
import { WEAPON_UPGRADE_POOLS } from '../data/weapons';
import {
  dispatchItemTrigger,
  getTomeMaxLevelBonus,
  getWeaponMaxLevelBonus,
  grantPlayerItem,
  hasAnvil,
  removePlayerItemStack,
} from './items';
import { onPlayerLevelUpPassive } from './passives';

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
  { stat: 'CritDamage', mode: 'add', baseDelta: 0.2, label: 'Crit Damage', formatValue: (v) => `+${Math.round(v * 100)}% Crit Damage` },
  { stat: 'XpMultiplier', mode: 'add', baseDelta: 0.12, label: 'XP Gain', formatValue: (v) => `+${Math.round(v * 100)}% XP Gain` },
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

export function getEffectiveWeaponMaxLevel(state: Readonly<SimState>, baseMaxLevel: number): number {
  return baseMaxLevel + getWeaponMaxLevelBonus(state.player);
}

export function getEffectiveTomeMaxLevel(state: Readonly<SimState>, baseMaxLevel: number): number {
  return baseMaxLevel + getTomeMaxLevelBonus(state.player);
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
  const anvilActive = hasAnvil(player);
  const candidates: CandidateEntry[] = [];

  // 1. Eligible Weapons (honoring Pot max-level cap lift >20!)
  for (let i = 0; i < catalog.weapons.length; i++) {
    const w = catalog.weapons[i];
    if (banished.has(w.id) || excludeRefIds?.has(w.id)) continue;
    const effMax = getEffectiveWeaponMaxLevel(state, w.maxLevel);
    const owned = player.weapons.find((slot) => slot.weaponId === w.id);
    if (owned) {
      if (owned.level < effMax) {
        candidates.push({
          category: 'weapon',
          refId: w.id,
          displayName: w.displayName,
          description: anvilActive
            ? `Upgrade ${w.displayName}: +${w.damagePerLevel} dmg, faster cooldown + ANVIL BONUS STAT!`
            : `Upgrade ${w.displayName}: +${w.damagePerLevel} base damage & faster cooldown.`,
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

  // 2. Eligible Tomes (honoring WizardsHat max-level cap lift >20!)
  for (let i = 0; i < catalog.tomes.length; i++) {
    const t = catalog.tomes[i];
    if (banished.has(t.id) || excludeRefIds?.has(t.id)) continue;
    const effMax = getEffectiveTomeMaxLevel(state, t.maxLevel);
    const owned = player.tomes.find((slot) => slot.tomeId === t.id);
    if (owned) {
      if (owned.level < effMax) {
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
      const effMax = getEffectiveWeaponMaxLevel(state, def.maxLevel);
      const bonus = rarityLevelBonus(rarity);
      nextLevel = Math.min(effMax, owned.level + bonus);
      const gained = nextLevel - owned.level;
      if (gained > 1) {
        description = `${rarity} Surge! Upgrades ${def.displayName} by +${gained} levels (Lv.${nextLevel})${hasAnvil(state.player) ? ' + Anvil Stat!' : '.'}`;
      }
    }
  } else if (candidate.category === 'tome' && nextLevel !== undefined) {
    const def = catalog.tomes.find((t) => t.id === candidate.refId);
    const owned = state.player.tomes.find((s) => s.tomeId === candidate.refId);
    if (def && owned) {
      const effMax = getEffectiveTomeMaxLevel(state, def.maxLevel);
      const bonus = rarityLevelBonus(rarity);
      nextLevel = Math.min(effMax, owned.level + bonus);
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
 * Generates a 3-card Level-Up Draft Offer respecting weapon/tome slots, cap lifts, banished IDs, and Luck.
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
 * Generates a 3-card Charge Shrine stat blessing offer.
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
 * Generates a 3-item free pick modal for `ShrineMoai`.
 */
export function generateMoaiItemOffer(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
): DraftOffer {
  const pool = catalog.items.filter(
    (it) => !it.isQuestItem && !state.banishedIds.includes(it.id),
  );
  const chosenIds = new Set<string>();
  const choices: DraftOfferChoice[] = [];

  for (let i = 0; i < 3; i++) {
    const targetRarity = rollRarity(state.player.stats.Luck + 0.25, rng);
    const tierPool = pool.filter((it) => it.rarity === targetRarity && !chosenIds.has(it.id));
    const fallbackPool = pool.filter((it) => !chosenIds.has(it.id));
    const src = tierPool.length > 0 ? tierPool : fallbackPool;
    if (src.length === 0) break;
    const picked = src[Math.floor(rng() * src.length) % src.length];
    chosenIds.add(picked.id);
    choices.push({
      index: i,
      category: 'item',
      refId: picked.id,
      displayName: picked.displayName,
      description: picked.description,
      rarity: picked.rarity,
    });
  }

  return {
    source: 'moai',
    title: 'MOAI SHRINE — CHOOSE A FREE ITEM',
    choices,
    canReroll: state.rerollsLeft > 0,
    canBanish: false,
    canSkip: false,
  };
}

const RARITY_GOLD_COST: Readonly<Record<Rarity, number>> = Object.freeze({
  Common: 30,
  Rare: 55,
  Epic: 95,
  Legendary: 160,
  Quest: 0,
});

/**
 * Generates a 3-item Gold shop modal for `ShadyGuy` with rarity-tiered pricing.
 */
export function generateShadyGuyOffer(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  shady?: InteractableState,
): DraftOffer {
  const minutes = state.simTimeSec / 60;
  const priceScale = 1 + 0.22 * minutes;
  const pool = catalog.items.filter(
    (it) => !it.isQuestItem && !state.banishedIds.includes(it.id),
  );

  // Reuse cached offerPayloadIds on the interactable if player stepped away & returned
  const itemIds: string[] = [];
  if (shady?.offerPayloadIds && shady.offerPayloadIds.length > 0) {
    for (let i = 0; i < shady.offerPayloadIds.length; i++) {
      itemIds.push(shady.offerPayloadIds[i]);
    }
  } else {
    const rarities: Rarity[] = ['Common', 'Rare', rollRarity(state.player.stats.Luck + 0.35, rng)];
    const chosen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const target = rarities[i];
      const matching = pool.filter((it) => it.rarity === target && !chosen.has(it.id));
      const fallback = pool.filter((it) => !chosen.has(it.id));
      const src = matching.length > 0 ? matching : fallback;
      if (src.length === 0) break;
      const picked = src[Math.floor(rng() * src.length) % src.length];
      chosen.add(picked.id);
      itemIds.push(picked.id);
    }
    if (shady) {
      shady.offerPayloadIds = [...itemIds];
    }
  }

  const choices: DraftOfferChoice[] = [];
  for (let i = 0; i < itemIds.length; i++) {
    const def = catalog.items.find((it) => it.id === itemIds[i]);
    if (!def) continue;
    const goldCost = Math.round((RARITY_GOLD_COST[def.rarity] ?? 40) * priceScale);
    choices.push({
      index: i,
      category: 'item',
      refId: def.id,
      displayName: def.displayName,
      description: def.description,
      rarity: def.rarity,
      goldCost,
    });
  }

  return {
    source: 'merchant',
    title: 'SHADY GUY — BLACK MARKET GOODS',
    choices,
    canReroll: false,
    canBanish: false,
    canSkip: true,
  };
}

/**
 * Generates an item-cloning modal for `Microwave`.
 * Clones an owned item by sacrificing 1 random same-tier owned item + Gold; explodes after max uses!
 */
export function generateMicrowaveOffer(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  microwave: InteractableState,
): DraftOffer {
  const minutes = state.simTimeSec / 60;
  const baseGold = Math.round((microwave.costGold || 20) * (1 + 0.2 * minutes));

  // Count owned items per rarity to determine cloneable items (need >= 2 total items of that rarity to sacrifice 1 & clone 1)
  const rarityCounts = new Map<Rarity, number>();
  for (let i = 0; i < state.player.items.length; i++) {
    const st = state.player.items[i];
    if (st.stacks <= 0) continue;
    const def = catalog.items.find((it) => it.id === resolveCanonicalItemId(st.itemId));
    if (!def || def.isQuestItem) continue;
    rarityCounts.set(def.rarity, (rarityCounts.get(def.rarity) ?? 0) + st.stacks);
  }

  const choices: DraftOfferChoice[] = [];
  for (let i = 0; i < state.player.items.length && choices.length < 3; i++) {
    const st = state.player.items[i];
    if (st.stacks <= 0) continue;
    const def = catalog.items.find((it) => it.id === resolveCanonicalItemId(st.itemId));
    if (!def || def.isQuestItem) continue;
    if (def.maxStacks && st.stacks >= def.maxStacks) continue;
    if ((rarityCounts.get(def.rarity) ?? 0) < 2) continue;

    const tierMult = def.rarity === 'Legendary' ? 3 : def.rarity === 'Epic' ? 2 : def.rarity === 'Rare' ? 1.5 : 1;
    const goldCost = Math.round(baseGold * tierMult);
    choices.push({
      index: choices.length,
      category: 'duplicate_item',
      refId: `microwave:${microwave.id}:${def.id}`,
      displayName: `Clone ${def.displayName}`,
      description: `Sacrifice 1 random ${def.rarity} item + ${goldCost}g to gain +1 ${def.displayName} (${Math.max(1, Math.round(microwave.chargeDurationSec - microwave.chargeProgress))} uses left).`,
      rarity: def.rarity,
      goldCost,
    });
  }

  return {
    source: 'microwave',
    title: 'ITEM MICROWAVE — CLONE AN ITEM',
    choices,
    canReroll: false,
    canBanish: false,
    canSkip: true,
  };
}

/**
 * Generates 3 asymmetric trade cards for `ShrineBalance` (trade 1 stat down for a big boost to another).
 */
export function generateBalanceShrineOffer(
  state: Readonly<SimState>,
  rng: () => number,
): DraftOffer {
  const pool = [...SHRINE_BLESSINGS];
  const choices: DraftOfferChoice[] = [];

  for (let i = 0; i < 3; i++) {
    const upIdx = Math.floor(rng() * pool.length) % pool.length;
    const [up] = pool.splice(upIdx, 1);
    const downIdx = Math.floor(rng() * pool.length) % pool.length;
    const down = pool[downIdx];
    const upDelta = Math.round(up.baseDelta * 2.4 * 1000) / 1000;
    const downDelta = Math.round(down.baseDelta * -0.75 * 1000) / 1000;

    choices.push({
      index: i,
      category: 'stat_blessing',
      refId: `trade:${up.stat}:${up.mode}:${upDelta}:${down.stat}:${down.mode}:${downDelta}`,
      displayName: `Balance: +${up.label} / -${down.label}`,
      description: `Gain ${up.formatValue(upDelta)}, lose ${down.formatValue(Math.abs(downDelta)).replace('+', '')}.`,
      rarity: rollRarity(state.player.stats.Luck + 0.2, rng),
    });
  }

  return {
    source: 'shrine',
    title: 'SHRINE OF BALANCE — SEAL A BARGAIN',
    choices,
    canReroll: false,
    canBanish: false,
    canSkip: true,
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

  // Dicehead Gamba level-up passive!
  onPlayerLevelUpPassive(state, rng, events, recalcStats);

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
  if (parts[0] === 'blessing' && parts.length >= 4) {
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

  if (parts[0] === 'trade' && parts.length >= 7) {
    const upStat = parts[1] as EStat;
    const upMode = parts[2] as 'add' | 'mult' | 'flat';
    const upDelta = Number(parts[3]);
    const downStat = parts[4] as EStat;
    const downMode = parts[5] as 'add' | 'mult' | 'flat';
    const downDelta = Number(parts[6]);
    if (!Number.isFinite(upDelta) || !Number.isFinite(downDelta)) return false;

    const mkMod = (stat: EStat, mode: 'add' | 'mult' | 'flat', delta: number) =>
      mode === 'mult'
        ? { stat, mult: delta, sourceId: 'ShrineBalance' }
        : mode === 'add'
          ? { stat, add: delta, sourceId: 'ShrineBalance' }
          : { stat, flat: delta, sourceId: 'ShrineBalance' };

    state.player.buffs.push({
      id: `balance_trade:${state.tick}:${state.nextEntityId++}`,
      remainingSec: PERMANENT_BUFF_SEC,
      modifiers: [mkMod(upStat, upMode, upDelta), mkMod(downStat, downMode, downDelta)],
    });
    return true;
  }

  return false;
}

function applySpecialTomeEffect(
  state: SimState,
  tomeId: string,
  levelsGained: number,
  rng: () => number,
): void {
  const count = Math.max(1, levelsGained);
  if (tomeId === 'TomeBalance') {
    const pct = 0.02 * count;
    state.player.buffs.push({
      id: `tome:Balance:${state.tick}:${state.nextEntityId++}`,
      remainingSec: PERMANENT_BUFF_SEC,
      modifiers: [
        { stat: 'MaxHealth', mult: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'DamageMultiplier', mult: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'AttackSpeed', add: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'MoveSpeed', add: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'Armor', flat: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'CritChance', flat: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'AreaSize', add: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'Luck', flat: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'XpMultiplier', add: pct, sourceId: 'tome:TomeBalance' },
        { stat: 'GoldMultiplier', add: pct, sourceId: 'tome:TomeBalance' },
      ],
    });
  } else if (tomeId === 'TomeChaos' || tomeId === 'TomeGamba') {
    for (let k = 0; k < count; k++) {
      const pick = SHRINE_BLESSINGS[Math.floor(rng() * SHRINE_BLESSINGS.length) % SHRINE_BLESSINGS.length];
      let scale = 1.0;
      if (tomeId === 'TomeGamba') {
        const gRoll = rng();
        scale = gRoll < 0.25 ? 2.8 : gRoll < 0.75 ? 1.25 : 0.45;
      } else {
        scale = 0.8 + rng() * 1.0;
      }
      const delta = Math.round(pick.baseDelta * scale * 1000) / 1000;
      const mod =
        pick.mode === 'mult'
          ? { stat: pick.stat, mult: delta, sourceId: `tome:${tomeId}` }
          : pick.mode === 'add'
            ? { stat: pick.stat, add: delta, sourceId: `tome:${tomeId}` }
            : { stat: pick.stat, flat: delta, sourceId: `tome:${tomeId}` };
      state.player.buffs.push({
        id: `tome:${tomeId}:${state.tick}:${state.nextEntityId++}`,
        remainingSec: PERMANENT_BUFF_SEC,
        modifiers: [mod],
      });
    }
  } else if (tomeId === 'TomeHoarder') {
    for (let k = 0; k < count; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = 5 + rng() * 6;
      state.interactables.push({
        id: state.nextEntityId++,
        kind: 'Chest',
        variant: 'free',
        pos: {
          x: state.player.pos.x + Math.cos(ang) * dist,
          y: state.player.pos.y,
          z: state.player.pos.z + Math.sin(ang) * dist,
        },
        radius: 3.4,
        used: false,
        active: true,
        chargeProgress: 0,
        chargeDurationSec: 0,
        costGold: 0,
      });
    }
    state.activeBannerText = 'HOARDER TOME: FREE LOOT CHEST SPAWNED!';
  }
}

function executeMicrowaveClone(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  refId: string,
  rng: () => number,
  events: SimEvent[],
): boolean {
  let microwaveId = -1;
  let targetItemId = refId;
  if (refId.startsWith('microwave:')) {
    const parts = refId.split(':');
    microwaveId = Number(parts[1]);
    targetItemId = parts[2] ?? '';
  }

  const canonicalTarget = resolveCanonicalItemId(targetItemId);
  const targetDef = getItemById(canonicalTarget) ?? catalog.items.find((it) => it.id === canonicalTarget);
  if (!targetDef) return false;

  // Build list of candidate same-rarity items to sacrifice (preferring a DIFFERENT item of same rarity)
  const otherSameTier: string[] = [];
  const allSameTier: string[] = [];
  for (let i = 0; i < state.player.items.length; i++) {
    const st = state.player.items[i];
    if (st.stacks <= 0) continue;
    const cid = resolveCanonicalItemId(st.itemId);
    const def = catalog.items.find((it) => it.id === cid);
    if (!def || def.rarity !== targetDef.rarity || def.isQuestItem) continue;
    allSameTier.push(cid);
    if (cid !== canonicalTarget) {
      otherSameTier.push(cid);
    }
  }

  const sacrificePool = otherSameTier.length > 0 ? otherSameTier : allSameTier;
  if (sacrificePool.length === 0) return false;

  const sacrificedId = sacrificePool[Math.floor(rng() * sacrificePool.length) % sacrificePool.length];
  removePlayerItemStack(state, sacrificedId, 1);
  grantPlayerItem(state, canonicalTarget, 1);

  const mw = state.interactables.find((it) => it.id === microwaveId && it.kind === 'Microwave');
  if (mw) {
    mw.chargeProgress += 1;
    events.push({
      type: 'interactable_used',
      tick: state.tick,
      interactableId: mw.id,
      kind: 'Microwave',
      variant: mw.variant,
      pos: { ...mw.pos },
    });

    if (mw.chargeProgress >= Math.max(1, mw.chargeDurationSec)) {
      mw.used = true;
      mw.active = false;
      state.activeBannerText = `MICROWAVE CLONED ${targetDef.displayName.toUpperCase()} — AND EXPLODED!`;
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: 'interactable:MicrowaveExplosion',
        ownerIsPlayer: true,
        pos: { x: mw.pos.x, y: mw.pos.y + 1.0, z: mw.pos.z },
        radius: 9.0,
        height: 3.0,
        lifeSec: 0,
        maxLifeSec: 0.5,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: 0,
        element: 'Fire',
        procCoefficient: 0,
      });
    } else {
      state.activeBannerText = `MICROWAVE CLONED ${targetDef.displayName.toUpperCase()}!`;
    }
  }

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
      const effMax = getEffectiveWeaponMaxLevel(state, def.maxLevel);
      const existing = player.weapons.find((w) => w.weaponId === def.id);
      if (existing) {
        existing.level = Math.min(effMax, choice.nextLevel ?? existing.level + 1);
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
      // Anvil (+1 bonus stat from weapon's upgrade pool!)
      if (hasAnvil(player)) {
        const upgPool = WEAPON_UPGRADE_POOLS[def.id];
        if (upgPool && upgPool.length > 0) {
          const picked = upgPool[Math.floor(rng() * upgPool.length) % upgPool.length];
          const mod =
            picked.mode === 'add'
              ? { stat: picked.stat, add: picked.delta * 0.5, sourceId: 'item:Anvil' }
              : { stat: picked.stat, flat: picked.delta * 0.25, sourceId: 'item:Anvil' };
          player.buffs.push({
            id: `anvil:${def.id}:${state.tick}:${state.nextEntityId++}`,
            remainingSec: PERMANENT_BUFF_SEC,
            modifiers: [mod],
          });
        }
      }
      break;
    }

    case 'tome': {
      const def = catalog.tomes.find((t) => t.id === choice.refId);
      if (!def) return false;
      const effMax = getEffectiveTomeMaxLevel(state, def.maxLevel);
      const existing = player.tomes.find((t) => t.tomeId === def.id);
      let gained = 1;
      if (existing) {
        const next = Math.min(effMax, choice.nextLevel ?? existing.level + 1);
        gained = Math.max(1, next - existing.level);
        existing.level = next;
      } else {
        player.tomes.push({
          tomeId: def.id,
          level: 1,
        });
      }
      applySpecialTomeEffect(state, def.id, gained, rng);
      break;
    }

    case 'item': {
      grantPlayerItem(state, choice.refId, 1);
      if (offer.source === 'merchant') {
        // Remove purchased item from ShadyGuy's stock
        const shady = state.interactables.find(
          (it) => it.kind === 'ShadyGuy' && it.offerPayloadIds?.includes(choice.refId),
        );
        if (shady?.offerPayloadIds) {
          shady.offerPayloadIds = shady.offerPayloadIds.filter((id) => id !== choice.refId);
          if (shady.offerPayloadIds.length === 0) {
            shady.used = true;
            shady.active = false;
          }
          events.push({
            type: 'interactable_used',
            tick: state.tick,
            interactableId: shady.id,
            kind: 'ShadyGuy',
            variant: shady.variant,
            pos: { ...shady.pos },
          });
        }
        state.activeBannerText = `PURCHASED ${choice.displayName.toUpperCase()}!`;
      }
      break;
    }

    case 'duplicate_item': {
      if (!executeMicrowaveClone(state, catalog, choice.refId, rng, events)) {
        return false;
      }
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
  if (offer.source === 'moai') {
    state.pendingOffer = generateMoaiItemOffer(state, catalog, rng);
  } else if (offer.source === 'shrine') {
    const isGolden = offer.title.includes('GOLDEN');
    const wrench = state.player.items.find((i) => i.itemId === 'Wrench')?.stacks ?? 0;
    state.pendingOffer = generateShrineOffer(state, rng, isGolden, wrench, 'shrine');
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
 * Skips/closes the current draft offer (refunds 25% XP on level-up; simply closes merchant/microwave/balance without consuming skip charges).
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
  if (!offer || !offer.canSkip) return false;

  if (offer.source === 'level_up') {
    if (state.skipsLeft <= 0) return false;
    state.skipsLeft -= 1;
    state.player.xp += Math.floor(state.player.xpToNext * 0.25);
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

  checkAndTriggerLevelUp(state, catalog, rng, events, recalcStats, shopLevels, challenge);
  return true;
}
