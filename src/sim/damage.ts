import {
  BONKER_MULTIPLIER,
  MEGACRIT_GIANT_FORK_MULTIPLIER,
  type DamageInput,
  type DamageResult,
  type DebuffType,
  type ElementType,
  type EnemyState,
  type GameCatalog,
  type PlayerState,
  type SimEvent,
  type SimState,
  type StatBlock,
} from '../contracts/index';
import { resolveCanonicalItemId } from '../data/items';
import { dispatchItemTrigger, triggerHolyBookRadiance } from './items';

export interface ApplyDamageOptions {
  skipItemProcs?: boolean;
  depth?: number;
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void;
  recalcStats?: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function getItemStacks(player: Readonly<PlayerState>, itemId: string): number {
  const canonical = resolveCanonicalItemId(itemId);
  for (let i = 0; i < player.items.length; i++) {
    if (resolveCanonicalItemId(player.items[i].itemId) === canonical) {
      return player.items[i].stacks;
    }
  }
  return 0;
}

export function getElementDamageMultiplier(
  stats: Readonly<StatBlock>,
  element: ElementType,
): number {
  switch (element) {
    case 'Fire':
      return Math.max(0.05, stats.FireDamageMultiplier);
    case 'Ice':
      return Math.max(0.05, stats.IceDamageMultiplier);
    case 'Lightning':
      return Math.max(0.05, stats.LightningDamageMultiplier);
    case 'Poison':
      return Math.max(0.05, stats.PoisonDamageMultiplier);
    case 'Void':
      return Math.max(0.05, stats.VoidDamageMultiplier);
    case 'Holy':
      return Math.max(0.05, stats.HolyDamageMultiplier);
    case 'Physical':
    default:
      return 1.0;
  }
}

export function isBossLikeEnemy(target: Readonly<EnemyState>): boolean {
  return (
    target.isBoss ||
    target.role === 'miniboss' ||
    target.role === 'stage_boss' ||
    target.role === 'crypt_boss' ||
    target.role === 'final_boss'
  );
}

/**
 * Checks whether a boss currently has an active invulnerability shield:
 * - Big Bob (`GhostKing`) during Darkness Phase (`state.darknessActive === true`)
 * - Final Boss (`FinalBoss`) while any activated Boss Pylon remains uncleansed
 */
export function isTargetInvulnerable(
  state: Readonly<SimState>,
  target: Readonly<EnemyState>,
): boolean {
  if (target.enemyId === 'GhostKing' && state.darknessActive) {
    return true;
  }
  if (target.enemyId === 'FinalBoss' && target.phaseIndex > 0) {
    for (let i = 0; i < state.pylons.length; i++) {
      const py = state.pylons[i];
      if (py.active && !py.cleansed) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Applies a debuff to an enemy with StatusDuration scaling and CC diminishing returns.
 * Emits `debuff_applied` on success.
 */
export function applyDebuffToEnemy(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  target: EnemyState,
  debuff: DebuffType,
  durationSec: number,
  dps: number,
  rng: () => number,
  events: SimEvent[],
  sourceWeaponId?: string,
  stacksToAdd = 1,
  triggerHooks = true,
  depth = 0,
): boolean {
  if (target.hp <= 0) return false;

  const enemyDef = catalog.enemies.find((e) => e.id === target.enemyId);
  const ccResistance = enemyDef ? enemyDef.ccResistance : target.isBoss ? 0.7 : 0;
  const bossLike = isBossLikeEnemy(target);

  // Bosses and Spooky Steve cannot be charmed
  if (debuff === 'Charm' && (bossLike || target.enemyId === 'GhostInvincible')) {
    return false;
  }

  const isCrowdControl = debuff === 'Freeze' || debuff === 'Stun' || debuff === 'Charm';
  const statusDurationMult = Math.max(0.25, state.player.stats.StatusDuration);

  let effectiveDuration = Math.max(0.2, durationSec * statusDurationMult);
  if (isCrowdControl) {
    effectiveDuration *= clamp(1 - ccResistance, 0.12, 1.0);
  }

  const existing = target.debuffs.find((d) => d.type === debuff);
  if (existing) {
    if (isCrowdControl) {
      effectiveDuration *= 0.5;
    }
    const maxStacks = debuff === 'Bloodmark' ? 5 : debuff === 'Poison' || debuff === 'Burn' ? 25 : 5;
    existing.stacks = Math.min(maxStacks, existing.stacks + Math.max(1, Math.floor(stacksToAdd)));
    existing.remainingSec = Math.max(existing.remainingSec, effectiveDuration);
    if (dps > 0) {
      existing.dps = Math.max(existing.dps, dps);
    }
    if (sourceWeaponId) {
      existing.sourceWeaponId = sourceWeaponId;
    }
  } else {
    target.debuffs.push({
      type: debuff,
      stacks: Math.max(1, Math.floor(stacksToAdd)),
      remainingSec: effectiveDuration,
      tickTimerSec: debuff === 'Burn' ? 0.4 : 0.5,
      dps: Math.max(0, dps),
      storedEchoDamage: debuff === 'Echo' ? 0 : undefined,
      sourceWeaponId,
    });
  }

  if (debuff === 'Stun') {
    target.stunTimer = Math.max(target.stunTimer, effectiveDuration);
  } else if (debuff === 'Charm') {
    target.charmedTimer = Math.max(target.charmedTimer, effectiveDuration);
  }

  const finalStacks = existing ? existing.stacks : Math.max(1, Math.floor(stacksToAdd));
  events.push({
    type: 'debuff_applied',
    tick: state.tick,
    targetId: target.id,
    debuff,
    stacks: finalStacks,
    pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
  });

  if (triggerHooks && depth < 1) {
    dispatchItemTrigger(
      state,
      catalog,
      'OnDebuffApply',
      {
        target,
        weaponId: sourceWeaponId,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        depth: depth + 1,
      },
      rng,
      events,
    );
  }

  return true;
}

/**
 * Pure deterministic DamageContainer evaluation:
 * base -> DamageMultiplier/role/archetype/Bloodmark -> Element -> Crit/Megacrit (GiantFork 4x+) -> Bonker 20x -> Execute.
 */
export function resolveDamage(
  state: Readonly<SimState>,
  target: Readonly<EnemyState>,
  input: DamageInput,
  rng: () => number,
): DamageResult {
  const stats = state.player.stats;
  const baseDamage = Math.max(0, input.baseDamage);

  if (isTargetInvulnerable(state, target)) {
    return {
      baseDamage,
      afterStatMult: 0,
      afterElementMult: 0,
      critTier: 0,
      isCrit: false,
      isMegacrit: false,
      isBonker: false,
      isExecute: false,
      finalDamage: 0,
      procRollCount: 0,
      debuffsApplied: [],
    };
  }

  let statMult = Math.max(0.05, stats.DamageMultiplier);
  if (input.isMelee) {
    statMult *= Math.max(0.05, stats.MeleeDamageMultiplier);
  }
  if (input.isSummon) {
    statMult *= Math.max(0.05, stats.SummonDamageMultiplier);
  }
  if (target.isElite) {
    statMult *= Math.max(0.05, stats.EliteDamageMultiplier);
  }
  if (isBossLikeEnemy(target)) {
    statMult *= Math.max(0.05, stats.BossDamageMultiplier);
  }
  if (input.isDot) {
    statMult *= Math.max(0.05, stats.StatusDamageMultiplier);
  }

  // Bloodmark increases incoming damage taken by target (+15% per stack, up to +75%)
  const bloodmark = target.debuffs.find((d) => d.type === 'Bloodmark');
  if (bloodmark) {
    statMult *= 1 + 0.15 * Math.min(5, bloodmark.stacks);
  }

  // Frostwalker / shattered bonus vs frozen targets
  if (input.weaponId === 'WeaponFrostWalker' && target.debuffs.some((d) => d.type === 'Freeze')) {
    statMult *= 1.45;
  }

  const afterStatMult = baseDamage * statMult;
  const elemMult = getElementDamageMultiplier(stats, input.element);
  const afterElementMult = afterStatMult * elemMult;

  // Crit & Megacrit resolution
  let critTier = 0;
  let dmg = afterElementMult;
  const isBullseyeMarked = target.eliteTags.includes('Bullseye');

  if (!input.isDot) {
    const bullseyeBonus = isBullseyeMarked ? 1.0 : 0;
    const totalCritChance = Math.max(0, stats.CritChance + (input.bonusCritChance ?? 0) + bullseyeBonus);
    const guaranteedTiers = Math.floor(totalCritChance);
    const fracChance = totalCritChance - guaranteedTiers;
    critTier = guaranteedTiers + (fracChance > 0 && rng() < fracChance ? 1 : 0);

    // GiantFork upgrades crits into 4x+ Megacrits!
    const giantForkStacks = getItemStacks(state.player, 'GiantFork');
    if (giantForkStacks > 0 && critTier === 1) {
      critTier = 2;
    }

    if (critTier === 1) {
      dmg *= Math.max(1.5, stats.CritDamage);
    } else if (critTier >= 2) {
      const megaMult = Math.max(
        MEGACRIT_GIANT_FORK_MULTIPLIER,
        Math.max(1.5, stats.CritDamage) * (Math.max(2.0, stats.MegacritMultiplier) / 2.0) * (critTier - 1),
      );
      dmg *= megaMult;
    }
  }

  const isCrit = critTier >= 1;
  const isMegacrit = critTier >= 2;

  // Bonker 20x proc
  let isBonker = false;
  if (!input.isDot && !input.isProcDamage && stats.BonkerChance > 0) {
    if (rng() < clamp(stats.BonkerChance, 0, 1)) {
      isBonker = true;
      dmg *= BONKER_MULTIPLIER;
    }
  }

  // Execute threshold check (supports Dexecutioner innate execute chance + ExecuteThreshold stat)
  let isExecute = false;
  const isUnexecutable =
    target.enemyId === 'GhostInvincible' ||
    target.enemyId === 'GhostKing' ||
    target.enemyId === 'FinalBoss' ||
    target.enemyId === 'GhostRed' ||
    target.enemyId === 'GhostPurple';

  const dexecutionerChance =
    input.weaponId === 'WeaponDexecutioner' && !input.isDot && !input.isProcDamage ? 0.08 : 0;
  const execThreshold = clamp(stats.ExecuteThreshold, 0, 0.5);

  if (!input.isDot && target.maxHp > 0 && target.hp > 0 && !isUnexecutable) {
    const postHp = target.hp - dmg;
    const thresholdHit = execThreshold > 0 && postHp > 0 && postHp / target.maxHp <= execThreshold;
    const instantExecHit = dexecutionerChance > 0 && rng() < dexecutionerChance;
    if (thresholdHit || instantExecHit) {
      isExecute = true;
      if (isBossLikeEnemy(target)) {
        dmg += Math.min(target.maxHp * 0.12, Math.max(dmg * 2.0, 120));
      } else {
        dmg = target.hp;
      }
    }
  }

  const finalDamage = Math.max(0, Math.round(dmg * 100) / 100);
  const procRollCount =
    input.isDot || input.isProcDamage
      ? 0
      : 1 + Math.max(0, Math.floor(stats.ExtraProcRolls));

  return {
    baseDamage,
    afterStatMult,
    afterElementMult,
    critTier,
    isCrit,
    isMegacrit,
    isBonker,
    isExecute,
    finalDamage,
    procRollCount,
    debuffsApplied: [],
  };
}

/**
 * Full damage application: resolves DamageResult, enforces boss invulnerability shields,
 * applies Echo recording, Lifesteal (+Chonkplate Overheal, +BloodyCleaver Bloodmark, +HolyBook radiance),
 * Snek instant poison burst, Bush Bullseye burst, weapon debuffs, summary metrics, events,
 * OnHit/OnCrit/OnMegacrit/OnBonker procs, and invokes onEnemyKilled if target HP reaches 0.
 */
export function applyDamageToEnemy(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  target: EnemyState,
  input: DamageInput,
  rng: () => number,
  events: SimEvent[],
  options?: ApplyDamageOptions,
): { result: DamageResult; killed: boolean } {
  const result = resolveDamage(state, target, input, rng);
  if (target.hp <= 0 || result.finalDamage <= 0) {
    return { result, killed: false };
  }

  const depth = options?.depth ?? 0;

  // Record delayed Echo burst damage if Echo debuff is active
  if (!input.isDot && input.weaponId !== 'EchoDetonation') {
    const echo = target.debuffs.find((d) => d.type === 'Echo');
    if (echo) {
      echo.storedEchoDamage = (echo.storedEchoDamage ?? 0) + result.finalDamage * 0.35;
    }
  }

  target.hp = Math.max(0, target.hp - result.finalDamage);

  // Update run summary metrics
  state.summary.totalDamageDealt += result.finalDamage;
  if (result.finalDamage > state.summary.highestSingleHit) {
    state.summary.highestSingleHit = result.finalDamage;
  }
  if (result.isCrit) state.summary.critsLanded += 1;
  if (result.isMegacrit) state.summary.megacritsLanded += 1;
  if (result.isBonker) state.summary.bonkersLanded += 1;
  if (result.isExecute) state.summary.executesLanded += 1;

  // Track weapon damage contribution
  if (input.weaponId) {
    const slot = state.player.weapons.find((w) => w.weaponId === input.weaponId);
    if (slot) {
      slot.totalDamage += result.finalDamage;
    }
  }

  // Lifesteal on non-DoT hits (+Chonkplate Overheal, +BloodyCleaver Bloodmark, +HolyBook radiance)
  if (!input.isDot && state.player.stats.Lifesteal > 0 && !state.player.dead) {
    const stealAmt = Math.min(state.player.maxHp * 0.1, result.finalDamage * state.player.stats.Lifesteal);
    if (stealAmt >= 0.25) {
      const before = state.player.hp;
      const newHp = state.player.hp + stealAmt;
      if (newHp > state.player.maxHp) {
        state.player.hp = state.player.maxHp;
        if (state.player.stats.Overheal > 0) {
          const maxOverheal = state.player.maxHp * Math.min(1.5, state.player.stats.Overheal);
          state.player.overheal = Math.min(maxOverheal, state.player.overheal + (newHp - state.player.maxHp));
        }
      } else {
        state.player.hp = newHp;
      }
      const healed = state.player.hp - before;
      if (healed >= 1) {
        events.push({
          type: 'player_heal',
          tick: state.tick,
          pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
          amount: Math.round(healed * 10) / 10,
        });
        if (depth < 1) {
          triggerHolyBookRadiance(state, catalog, healed, rng, events, options?.onEnemyKilled, options?.recalcStats);
        }
      }
      // BloodyCleaver: Lifesteal procs immediately stack Bloodmark!
      const cleaverStacks = getItemStacks(state.player, 'BloodyCleaver');
      if (cleaverStacks > 0 && target.hp > 0 && depth < 1) {
        applyDebuffToEnemy(
          state,
          catalog,
          target,
          'Bloodmark',
          6.0,
          0,
          rng,
          events,
          'item:BloodyCleaver',
          1,
          false,
          depth + 1,
        );
      }
    }
  }

  events.push({
    type: 'damage_dealt',
    tick: state.tick,
    targetId: target.id,
    pos: { x: target.pos.x, y: target.pos.y + target.height * 0.6, z: target.pos.z },
    amount: result.finalDamage,
    element: input.element,
    critTier: result.critTier,
    isMegacrit: result.isMegacrit,
    isBonker: result.isBonker,
    isExecute: result.isExecute,
    weaponId: input.weaponId,
  });

  // Bush Bullseye consumption: pop mark & unleash explosive sniper burst around target
  const bullseyeIdx = target.eliteTags.indexOf('Bullseye');
  if (bullseyeIdx >= 0 && !input.isDot && !input.isProcDamage && depth < 1) {
    target.eliteTags.splice(bullseyeIdx, 1);
    const popDmg = Math.max(25, result.finalDamage * 0.65);
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'nova',
      weaponId: 'passive:Bullseye',
      ownerIsPlayer: true,
      pos: { x: target.pos.x, y: target.pos.y + 1.0, z: target.pos.z },
      radius: 5.5,
      height: 2.2,
      lifeSec: 0,
      maxLifeSec: 0.35,
      tickTimer: 99,
      tickIntervalSec: 99,
      damage: popDmg,
      element: 'Physical',
      procCoefficient: 0,
    });
    for (let i = 0; i < state.enemies.length; i++) {
      const other = state.enemies[i];
      if (other.hp <= 0 || other.id === target.id) continue;
      const dx = other.pos.x - target.pos.x;
      const dz = other.pos.z - target.pos.z;
      if (dx * dx + dz * dz <= (5.5 + other.radius) ** 2) {
        applyDamageToEnemy(
          state,
          catalog,
          other,
          {
            baseDamage: popDmg,
            element: 'Physical',
            procCoefficient: 0,
            weaponId: 'passive:Bullseye',
            isProcDamage: true,
          },
          rng,
          events,
          { skipItemProcs: true, depth: depth + 1, onEnemyKilled: options?.onEnemyKilled, recalcStats: options?.recalcStats },
        );
      }
    }
  }

  // Apply innate weapon debuff on hit
  if (!input.isDot && !input.isProcDamage && input.weaponId && target.hp > 0) {
    const weaponDef = catalog.weapons.find((w) => w.id === input.weaponId);
    if (weaponDef?.debuffOnHit) {
      const d = weaponDef.debuffOnHit;
      const procCoeff = clamp(
        input.procCoefficient + state.player.stats.ProcCoefficientBonus,
        0.05,
        2.0,
      );
      const effectiveChance = clamp(
        (d.chance + state.player.stats.StatusChance) * procCoeff,
        0,
        1,
      );
      let applied = false;
      const rolls = Math.max(1, result.procRollCount);
      for (let r = 0; r < rolls; r++) {
        if (rng() < effectiveChance) {
          applied = true;
          break;
        }
      }
      if (applied) {
        const dps = d.dpsScale ? Math.max(4, result.afterElementMult * d.dpsScale) : 0;
        if (
          applyDebuffToEnemy(
            state,
            catalog,
            target,
            d.type,
            d.durationSec,
            dps,
            rng,
            events,
            input.weaponId,
            1,
            true,
            depth,
          )
        ) {
          result.debuffsApplied.push(d.type);
        }
      }
    }
  }

  // Snek legendary: 22% (+8%/stack) chance on hit to instantly burst ALL poison damage on target!
  const snekStacks = getItemStacks(state.player, 'Snek');
  if (snekStacks > 0 && !input.isDot && !input.isProcDamage && target.hp > 0 && depth < 1) {
    const poisonIdx = target.debuffs.findIndex((d) => d.type === 'Poison');
    if (poisonIdx >= 0 && rng() < clamp(0.22 + 0.08 * (snekStacks - 1), 0, 0.85)) {
      const pDebuff = target.debuffs[poisonIdx];
      const burstDmg = Math.max(18, pDebuff.dps * pDebuff.stacks * Math.max(1.0, pDebuff.remainingSec));
      target.debuffs.splice(poisonIdx, 1);
      applyDamageToEnemy(
        state,
        catalog,
        target,
        {
          baseDamage: burstDmg,
          element: 'Poison',
          procCoefficient: 0,
          weaponId: 'item:SnekBurst',
          isProcDamage: true,
        },
        rng,
        events,
        { skipItemProcs: true, depth: depth + 1, onEnemyKilled: options?.onEnemyKilled, recalcStats: options?.recalcStats },
      );
    }
  }

  // Dispatch declarative item trigger hooks (guarded against infinite recursion)
  if (!options?.skipItemProcs && !input.isProcDamage && !input.isDot && depth < 2) {
    const triggerCtx = {
      target,
      damageDealt: result.finalDamage,
      weaponId: input.weaponId,
      procCoefficient: input.procCoefficient,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
      depth: depth + 1,
      onEnemyKilled: options?.onEnemyKilled,
      recalcStats: options?.recalcStats,
    };
    dispatchItemTrigger(state, catalog, 'OnHit', triggerCtx, rng, events);
    if (result.isCrit) {
      dispatchItemTrigger(state, catalog, 'OnCrit', triggerCtx, rng, events);
    }
    if (result.isMegacrit) {
      dispatchItemTrigger(state, catalog, 'OnMegacrit', triggerCtx, rng, events);
    }
    if (result.isBonker) {
      dispatchItemTrigger(state, catalog, 'OnBonker', triggerCtx, rng, events);
    }
  }

  const killed = target.hp <= 0;
  if (killed) {
    options?.onEnemyKilled?.(target, result.isExecute, input.weaponId);
  }

  return { result, killed };
}
