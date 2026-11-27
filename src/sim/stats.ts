/**
 * KRUNKEDBONK — Exact 57-Stat EStat Engine
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 *
 * Implements:
 * - `createBaseStatBlock()` with exact defaults across all 57 `EStat` entries
 * - `computeStatBlock(base, modifiers)` adhering strictly to:
 *     `final = (base + add) * Math.max(0.05, 1 + multSum) + flat`
 *   with safe clamps (`Evasion <= 0.75`, `MaxHealth >= 1`, `MoveSpeed >= 0.25`,
 *   `AttackSpeed >= 0.2`, `AreaSize >= 0.3`, `PickupRange >= 1.0`, etc.)
 * - `computeArmorDamageReduction(armor)` => `min(0.85, max(0, armor / (armor + 1)))`
 * - `computeEffectiveCooldown(baseCooldown, attackSpeed, cdr)` => `max(0.06, ...)`
 * - `recalculatePlayerStats(...)` combining character, level passives, meta shop,
 *   tomes, items, active buffs, and challenge rules.
 */

import {
  ALL_ESTATS,
  ARMOR_DR_CAP,
  BASE_CRIT_MULTIPLIER,
  EVASION_CAP,
  MEGACRIT_GIANT_FORK_MULTIPLIER,
  MIN_COOLDOWN_SEC,
  type ChallengeDef,
  type CharacterId,
  type EStat,
  type GameCatalog,
  type PlayerState,
  type ShopUpgradeId,
  type StatBlock,
  type StatBreakdown,
  type StatModifier,
} from '../contracts/index';

export interface StatComputationResult {
  stats: StatBlock;
  breakdown: Record<EStat, StatBreakdown>;
}

/**
 * Create a fresh base `StatBlock` containing all 57 `EStat` keys initialized
 * to their exact baseline defaults.
 */
export function createBaseStatBlock(): StatBlock {
  return {
    // Survival & Defense (11)
    MaxHealth: 100,
    HealthRegen: 0,
    Overheal: 0,
    Shield: 0,
    ShieldRegen: 8,
    Armor: 0,
    Evasion: 0,
    Lifesteal: 0,
    Thorns: 0,
    DamageReduction: 0,
    FallDamageReduction: 0,

    // Offense & Crits (14)
    DamageMultiplier: 1,
    AttackSpeed: 1,
    CooldownReduction: 0,
    CritChance: 0.05,
    CritDamage: BASE_CRIT_MULTIPLIER,
    MegacritMultiplier: MEGACRIT_GIANT_FORK_MULTIPLIER,
    BonkerChance: 0,
    ExecuteThreshold: 0,
    EliteDamageMultiplier: 1,
    BossDamageMultiplier: 1,
    Knockback: 1,
    ProcCoefficientBonus: 0,
    ExtraProcRolls: 0,
    MeleeDamageMultiplier: 1,

    // Weapon & Projectile Scaling (10)
    ProjectileCount: 0,
    ProjectileSpeed: 1,
    ProjectileBounces: 0,
    ProjectilePierce: 0,
    AreaSize: 1,
    Duration: 1,
    AttackRange: 1,
    ChainCount: 0,
    SummonLimit: 1,
    SummonDamageMultiplier: 1,

    // Elements & Debuffs (9)
    FireDamageMultiplier: 1,
    IceDamageMultiplier: 1,
    LightningDamageMultiplier: 1,
    PoisonDamageMultiplier: 1,
    VoidDamageMultiplier: 1,
    HolyDamageMultiplier: 1,
    StatusChance: 0,
    StatusDuration: 1,
    StatusDamageMultiplier: 1,

    // Movement & Mobility (7)
    MoveSpeed: 1,
    JumpHeight: 1,
    ExtraJumps: 0,
    AirControl: 1,
    SlideSpeedMultiplier: 1,
    SlideAcceleration: 1,
    WallClimbLimit: 1,

    // Economy, Utility & Meta (6)
    PickupRange: 4.0,
    XpMultiplier: 1,
    GoldMultiplier: 1,
    SilverMultiplier: 1,
    Luck: 0,
    Difficulty: 0,
  };
}

function clampStatValue(stat: EStat, raw: number): number {
  const val = Number.isFinite(raw) ? raw : 0;
  switch (stat) {
    case 'MaxHealth':
      return Math.max(1, val);
    case 'Overheal':
    case 'Shield':
    case 'ShieldRegen':
    case 'Lifesteal':
    case 'Thorns':
    case 'CritChance':
    case 'BonkerChance':
    case 'ExtraProcRolls':
    case 'ProjectileCount':
    case 'ProjectileBounces':
    case 'ProjectilePierce':
    case 'ChainCount':
    case 'SummonLimit':
    case 'StatusChance':
    case 'ExtraJumps':
    case 'WallClimbLimit':
    case 'Difficulty':
      return Math.max(0, val);
    case 'Evasion':
      return Math.min(EVASION_CAP, Math.max(0, val));
    case 'DamageReduction':
      return Math.min(ARMOR_DR_CAP, Math.max(0, val));
    case 'FallDamageReduction':
      return Math.min(1, Math.max(0, val));
    case 'ExecuteThreshold':
      return Math.min(0.9, Math.max(0, val));
    case 'CooldownReduction':
      return Math.min(0.8, Math.max(-0.5, val));
    case 'MoveSpeed':
      return Math.max(0.25, val);
    case 'AttackSpeed':
      return Math.max(0.2, val);
    case 'AreaSize':
      return Math.max(0.3, val);
    case 'PickupRange':
      return Math.max(1.0, val);
    case 'JumpHeight':
    case 'SlideSpeedMultiplier':
    case 'SlideAcceleration':
      return Math.max(0.25, val);
    case 'AirControl':
    case 'DamageMultiplier':
    case 'EliteDamageMultiplier':
    case 'BossDamageMultiplier':
    case 'MeleeDamageMultiplier':
    case 'SummonDamageMultiplier':
    case 'FireDamageMultiplier':
    case 'IceDamageMultiplier':
    case 'LightningDamageMultiplier':
    case 'PoisonDamageMultiplier':
    case 'VoidDamageMultiplier':
    case 'HolyDamageMultiplier':
    case 'StatusDamageMultiplier':
    case 'XpMultiplier':
    case 'GoldMultiplier':
    case 'SilverMultiplier':
      return Math.max(0.1, val);
    case 'ProjectileSpeed':
    case 'Duration':
    case 'AttackRange':
    case 'StatusDuration':
      return Math.max(0.2, val);
    case 'CritDamage':
      return Math.max(1.0, val);
    case 'MegacritMultiplier':
      return Math.max(2.0, val);
    case 'Knockback':
      return Math.max(0, val);
    case 'Armor':
    case 'HealthRegen':
    case 'ProcCoefficientBonus':
    case 'Luck':
    default:
      return val;
  }
}

/**
 * Evaluate all 57 stats from a base block and modifier stack using exact formula:
 * `final = (base + add) * Math.max(0.05, 1 + multSum) + flat` with safe clamps.
 */
export function computeStatBlock(
  base: Readonly<StatBlock>,
  modifiers: readonly StatModifier[],
): StatComputationResult {
  const addMap = {} as Record<EStat, number>;
  const multMap = {} as Record<EStat, number>;
  const flatMap = {} as Record<EStat, number>;

  for (let i = 0; i < ALL_ESTATS.length; i++) {
    const stat = ALL_ESTATS[i];
    addMap[stat] = 0;
    multMap[stat] = 0;
    flatMap[stat] = 0;
  }

  for (let i = 0; i < modifiers.length; i++) {
    const mod = modifiers[i];
    if (mod.add !== undefined && Number.isFinite(mod.add)) {
      addMap[mod.stat] += mod.add;
    }
    if (mod.mult !== undefined && Number.isFinite(mod.mult)) {
      multMap[mod.stat] += mod.mult;
    }
    if (mod.flat !== undefined && Number.isFinite(mod.flat)) {
      flatMap[mod.stat] += mod.flat;
    }
  }

  const stats = {} as StatBlock;
  const breakdown = {} as Record<EStat, StatBreakdown>;

  for (let i = 0; i < ALL_ESTATS.length; i++) {
    const stat = ALL_ESTATS[i];
    const baseVal = Number.isFinite(base[stat]) ? base[stat] : 0;
    const add = addMap[stat];
    const mult = Math.max(0.05, 1 + multMap[stat]);
    const flat = flatMap[stat];
    const rawFinal = (baseVal + add) * mult + flat;
    const final = clampStatValue(stat, rawFinal);

    stats[stat] = final;
    breakdown[stat] = {
      base: baseVal,
      add,
      mult,
      flat,
      final,
    };
  }

  return { stats, breakdown };
}

/**
 * Compute armor damage reduction fraction in `[0, 0.85]`:
 * `Math.min(0.85, Math.max(0, armor / (armor + 1.0)))`.
 */
export function computeArmorDamageReduction(armor: number): number {
  if (!Number.isFinite(armor) || armor <= 0) {
    return 0;
  }
  return Math.min(ARMOR_DR_CAP, Math.max(0, armor / (armor + 1.0)));
}

/**
 * Compute effective weapon/skill cooldown clamped to `MIN_COOLDOWN_SEC` (`0.06s`):
 * `Math.max(0.06, (baseCooldown / Math.max(0.2, attackSpeed)) * Math.max(0.2, 1 - Math.min(0.8, cdr)))`.
 */
export function computeEffectiveCooldown(
  baseCooldown: number,
  attackSpeed: number,
  cdr: number,
): number {
  const safeBase = Number.isFinite(baseCooldown) && baseCooldown > 0 ? baseCooldown : MIN_COOLDOWN_SEC;
  const safeAtkSpd = Number.isFinite(attackSpeed) ? Math.max(0.2, attackSpeed) : 1;
  const safeCdr = Number.isFinite(cdr) ? Math.min(0.8, cdr) : 0;
  return Math.max(MIN_COOLDOWN_SEC, (safeBase / safeAtkSpd) * Math.max(0.2, 1 - safeCdr));
}

function pushScaledModifier(
  out: StatModifier[],
  mod: Readonly<StatModifier>,
  scale: number,
  sourceId: string,
): void {
  if (scale === 0) {
    return;
  }
  out.push({
    stat: mod.stat,
    add: mod.add !== undefined ? mod.add * scale : undefined,
    mult: mod.mult !== undefined ? mod.mult * scale : undefined,
    flat: mod.flat !== undefined ? mod.flat * scale : undefined,
    sourceId: mod.sourceId ?? sourceId,
  });
}

function pushModeModifier(
  out: StatModifier[],
  stat: EStat,
  mode: 'add' | 'mult' | 'flat',
  value: number,
  sourceId: string,
): void {
  if (!Number.isFinite(value) || value === 0) {
    return;
  }
  if (mode === 'add') {
    out.push({ stat, add: value, sourceId });
  } else if (mode === 'mult') {
    out.push({ stat, mult: value, sourceId });
  } else {
    out.push({ stat, flat: value, sourceId });
  }
}

/**
 * Recompute `player.stats`, `player.maxHp`, and `player.maxShield` deterministically
 * from character base deltas, level-up passives, meta shop upgrades, tomes, items,
 * active buffs, and challenge modifiers.
 */
export function recalculatePlayerStats(
  player: PlayerState,
  catalog: Readonly<GameCatalog>,
  characterId: CharacterId,
  challenge: ChallengeDef | null,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
): void {
  const base = createBaseStatBlock();
  const modifiers: StatModifier[] = [];

  // 1. Character base stat deltas + per-level passive mods
  const charDef = catalog.characters.find((c) => c.id === characterId);
  if (charDef) {
    for (let i = 0; i < ALL_ESTATS.length; i++) {
      const stat = ALL_ESTATS[i];
      const delta = charDef.baseStats[stat];
      if (delta !== undefined && Number.isFinite(delta)) {
        base[stat] += delta;
      }
    }

    const levelsGained = Math.max(0, player.level - 1);
    if (charDef.passive.perLevelMods && levelsGained > 0) {
      for (let i = 0; i < charDef.passive.perLevelMods.length; i++) {
        pushScaledModifier(
          modifiers,
          charDef.passive.perLevelMods[i],
          levelsGained,
          `passive:${charDef.passive.id}`,
        );
      }
    }
  }

  // 2. Meta Shop Upgrades
  if (shopLevels) {
    for (let i = 0; i < catalog.shopUpgrades.length; i++) {
      const upg = catalog.shopUpgrades[i];
      const rawRank = shopLevels[upg.id] ?? 0;
      const rank = Math.max(0, Math.min(upg.maxRank, Math.floor(rawRank)));
      if (rank <= 0) {
        continue;
      }
      if (upg.statModifierPerRank) {
        pushScaledModifier(modifiers, upg.statModifierPerRank, rank, `shop:${upg.id}`);
      } else if (upg.specialEffect === 'silver_multiplier') {
        modifiers.push({
          stat: 'SilverMultiplier',
          add: 0.1 * rank,
          sourceId: `shop:${upg.id}`,
        });
      }
    }
  }

  // 3. Equipped Tomes
  for (let i = 0; i < player.tomes.length; i++) {
    const slot = player.tomes[i];
    if (slot.level <= 0) {
      continue;
    }
    const tomeDef = catalog.tomes.find((t) => t.id === slot.tomeId);
    if (!tomeDef) {
      continue;
    }
    pushModeModifier(
      modifiers,
      tomeDef.stat,
      tomeDef.modifierMode,
      tomeDef.deltaPerLevel * slot.level,
      `tome:${tomeDef.id}`,
    );
    if (tomeDef.secondaryStat) {
      pushModeModifier(
        modifiers,
        tomeDef.secondaryStat.stat,
        tomeDef.secondaryStat.modifierMode,
        tomeDef.secondaryStat.deltaPerLevel * slot.level,
        `tome:${tomeDef.id}:secondary`,
      );
    }
  }

  // 4. Owned Items (statModifiers, perStackStatModifiers, and PassiveStat hooks)
  const convertEffects: Array<{ sourceStat: EStat; targetStat: EStat; ratio: number; sourceId: string }> = [];

  for (let i = 0; i < player.items.length; i++) {
    const stack = player.items[i];
    if (stack.stacks <= 0) {
      continue;
    }
    const itemDef = catalog.items.find((it) => it.id === stack.itemId);
    if (!itemDef) {
      continue;
    }

    const hasBaseMods = Boolean(itemDef.statModifiers && itemDef.statModifiers.length > 0);
    const hasPerStackMods = Boolean(
      itemDef.perStackStatModifiers && itemDef.perStackStatModifiers.length > 0,
    );

    if (hasBaseMods && hasPerStackMods) {
      // Base mods apply for stack 1, per-stack mods apply for stacks 2..N
      for (let m = 0; m < itemDef.statModifiers!.length; m++) {
        pushScaledModifier(modifiers, itemDef.statModifiers![m], 1, `item:${itemDef.id}`);
      }
      const extraStacks = Math.max(0, stack.stacks - 1);
      if (extraStacks > 0) {
        for (let m = 0; m < itemDef.perStackStatModifiers!.length; m++) {
          pushScaledModifier(
            modifiers,
            itemDef.perStackStatModifiers![m],
            extraStacks,
            `item:${itemDef.id}:stack`,
          );
        }
      }
    } else if (hasBaseMods) {
      for (let m = 0; m < itemDef.statModifiers!.length; m++) {
        pushScaledModifier(modifiers, itemDef.statModifiers![m], stack.stacks, `item:${itemDef.id}`);
      }
    } else if (hasPerStackMods) {
      for (let m = 0; m < itemDef.perStackStatModifiers!.length; m++) {
        pushScaledModifier(
          modifiers,
          itemDef.perStackStatModifiers![m],
          stack.stacks,
          `item:${itemDef.id}:stack`,
        );
      }
    }

    // Declarative PassiveStat hooks (ModifyStat / ConvertStat)
    if (itemDef.hooks) {
      for (let h = 0; h < itemDef.hooks.length; h++) {
        const hook = itemDef.hooks[h];
        if (hook.trigger !== 'PassiveStat') {
          continue;
        }
        for (let e = 0; e < hook.effects.length; e++) {
          const eff = hook.effects[e];
          const val = eff.baseValue + (eff.perStackValue ?? 0) * Math.max(0, stack.stacks - 1);
          if (eff.type === 'ModifyStat' && eff.stat) {
            modifiers.push({ stat: eff.stat, add: val, sourceId: `item_hook:${itemDef.id}` });
          } else if (eff.type === 'ConvertStat' && eff.sourceStat && eff.stat) {
            convertEffects.push({
              sourceStat: eff.sourceStat,
              targetStat: eff.stat,
              ratio: val,
              sourceId: `item_convert:${itemDef.id}`,
            });
          }
        }
      }
    }
  }

  // 5. Active Temporary Player Buffs
  for (let i = 0; i < player.buffs.length; i++) {
    const buff = player.buffs[i];
    if (buff.remainingSec <= 0) {
      continue;
    }
    for (let m = 0; m < buff.modifiers.length; m++) {
      modifiers.push(buff.modifiers[m]);
    }
  }

  // 6. Active Challenge Modifiers & Rules
  if (challenge) {
    if (challenge.statModifiers) {
      for (let i = 0; i < challenge.statModifiers.length; i++) {
        modifiers.push(challenge.statModifiers[i]);
      }
    }
    if (
      challenge.rules.speedMultiplier !== undefined &&
      Number.isFinite(challenge.rules.speedMultiplier)
    ) {
      modifiers.push({
        stat: 'MoveSpeed',
        mult: challenge.rules.speedMultiplier - 1,
        sourceId: `challenge:${challenge.id}:speed`,
      });
    }
  }

  // First pass evaluation
  let { stats } = computeStatBlock(base, modifiers);

  // Second pass if any PassiveStat ConvertStat effects exist
  if (convertEffects.length > 0) {
    for (let i = 0; i < convertEffects.length; i++) {
      const conv = convertEffects[i];
      const delta = stats[conv.sourceStat] * conv.ratio;
      if (Number.isFinite(delta) && delta !== 0) {
        modifiers.push({
          stat: conv.targetStat,
          flat: delta,
          sourceId: conv.sourceId,
        });
      }
    }
    stats = computeStatBlock(base, modifiers).stats;
  }

  // Enforce oneHpMode challenge rule
  if (challenge?.rules.oneHpMode) {
    stats.MaxHealth = 1;
  }

  // Sync player pools cleanly without losing health ratio on maxHp growth
  const prevMaxHp = player.maxHp > 0 ? player.maxHp : stats.MaxHealth;
  player.stats = stats;
  player.maxHp = stats.MaxHealth;

  if (!player.dead) {
    if (player.maxHp > prevMaxHp) {
      player.hp = Math.min(player.maxHp, player.hp + (player.maxHp - prevMaxHp));
    } else if (player.hp > player.maxHp) {
      player.hp = player.maxHp;
    }
  }

  player.maxShield = Math.max(0, stats.Shield);
  if (player.shield > player.maxShield) {
    player.shield = player.maxShield;
  }

  if (player.grounded) {
    player.airJumpsRemaining = Math.max(0, Math.floor(stats.ExtraJumps));
  }
}
