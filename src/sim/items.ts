import type {
  EnemyState,
  GameCatalog,
  ItemDef,
  ItemHookCondition,
  ItemHookEffect,
  ItemHookNode,
  ItemTrigger,
  PlayerItemStack,
  PlayerState,
  SimEvent,
  SimState,
  Vec3,
} from '../contracts/index';
import { getItemById, resolveCanonicalItemId } from '../data/items';
import { applyDamageToEnemy, applyDebuffToEnemy, isBossLikeEnemy } from './damage';

export interface ItemTriggerContext {
  target?: EnemyState;
  damageDealt?: number;
  weaponId?: string;
  procCoefficient?: number;
  pos?: Vec3;
  depth?: number;
  isExecute?: boolean;
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void;
  recalcStats?: () => void;
}

const PERMANENT_BUFF_SEC = 999999;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function distSq3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function getPlayerItemStacks(player: Readonly<PlayerState>, itemId: string): number {
  const canonical = resolveCanonicalItemId(itemId);
  for (let i = 0; i < player.items.length; i++) {
    if (resolveCanonicalItemId(player.items[i].itemId) === canonical) {
      return player.items[i].stacks;
    }
  }
  return 0;
}

/**
 * Computes max-level cap lift from `Pot` (weapons) or `WizardsHat` (tomes):
 * 1st stack = +10 max levels, each additional stack gives 1 less, min +1 per stack.
 */
export function computeCapLiftFromItemStacks(stacks: number): number {
  const n = Math.max(0, Math.floor(stacks));
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.max(1, 10 - i);
  }
  return total;
}

export function getWeaponMaxLevelBonus(player: Readonly<PlayerState>): number {
  return computeCapLiftFromItemStacks(getPlayerItemStacks(player, 'Pot'));
}

export function getTomeMaxLevelBonus(player: Readonly<PlayerState>): number {
  return computeCapLiftFromItemStacks(getPlayerItemStacks(player, 'WizardsHat'));
}

export function hasAnvil(player: Readonly<PlayerState>): boolean {
  return getPlayerItemStacks(player, 'Anvil') > 0;
}

export function grantPlayerItem(
  state: SimState,
  itemId: string,
  stacks = 1,
  recalcStats?: () => void,
): PlayerItemStack {
  const canonical = resolveCanonicalItemId(itemId);
  const def = getItemById(canonical);
  const maxStacks = def?.maxStacks && def.maxStacks > 0 ? def.maxStacks : Infinity;
  const count = Math.max(1, Math.floor(stacks));

  let existing = state.player.items.find((it) => resolveCanonicalItemId(it.itemId) === canonical);
  if (existing) {
    existing.stacks = Math.min(maxStacks, existing.stacks + count);
  } else {
    existing = {
      itemId: canonical,
      stacks: Math.min(maxStacks, count),
      internalCooldown: 0,
      triggerCounter: 0,
      procCount: 0,
    };
    state.player.items.push(existing);
  }

  // Quest keys immediately update player key flags
  if (canonical === 'CryptKey') {
    state.player.hasCryptKey = true;
    state.cryptUnlocked = true;
  }

  recalcStats?.();
  return existing;
}

export function removePlayerItemStack(
  state: SimState,
  itemId: string,
  count = 1,
  recalcStats?: () => void,
): boolean {
  const canonical = resolveCanonicalItemId(itemId);
  const idx = state.player.items.findIndex((it) => resolveCanonicalItemId(it.itemId) === canonical);
  if (idx < 0) return false;
  state.player.items[idx].stacks -= Math.max(1, Math.floor(count));
  if (state.player.items[idx].stacks <= 0) {
    state.player.items.splice(idx, 1);
  }
  recalcStats?.();
  return true;
}

export function stepItemCooldowns(state: SimState, dt: number): void {
  const items = state.player.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].internalCooldown > 0) {
      items[i].internalCooldown = Math.max(0, items[i].internalCooldown - dt);
    }
  }
}

/**
 * HolyBook special: any player heal radiates a Holy damage pulse to nearby enemies.
 */
export function triggerHolyBookRadiance(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  healedAmount: number,
  rng: () => number,
  events: SimEvent[],
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
  recalcStats?: () => void,
): void {
  const stacks = getPlayerItemStacks(state.player, 'HolyBook');
  if (stacks <= 0 || healedAmount <= 0) return;

  const radius = (7.5 + stacks * 1.2) * Math.max(0.5, state.player.stats.AreaSize);
  const dmg = Math.max(12 * stacks, healedAmount * (2.5 + stacks));
  const origin = state.player.pos;

  state.areaEffects.push({
    id: state.nextEntityId++,
    kind: 'nova',
    weaponId: 'item:HolyBook',
    ownerIsPlayer: true,
    pos: { x: origin.x, y: origin.y + 0.8, z: origin.z },
    radius,
    height: 2.2,
    lifeSec: 0,
    maxLifeSec: 0.35,
    tickTimer: 99,
    tickIntervalSec: 99,
    damage: dmg,
    element: 'Holy',
    procCoefficient: 0,
  });

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    if (distSq3(origin, e.pos) <= (radius + e.radius) ** 2) {
      applyDamageToEnemy(
        state,
        catalog,
        e,
        {
          baseDamage: dmg,
          element: 'Holy',
          procCoefficient: 0,
          weaponId: 'item:HolyBook',
          isProcDamage: true,
        },
        rng,
        events,
        { skipItemProcs: true, depth: 2, onEnemyKilled, recalcStats },
      );
    }
  }
}

function evaluateCondition(
  state: Readonly<SimState>,
  cond: ItemHookCondition,
  ctx: ItemTriggerContext,
  triggerCounter: number,
): boolean {
  const player = state.player;
  const target = ctx.target;
  const threshold = cond.value ?? 0;

  switch (cond.kind) {
    case 'TargetHpBelowPct':
      return !!target && target.maxHp > 0 && target.hp / target.maxHp <= threshold;
    case 'TargetHpAbovePct':
      return !!target && target.maxHp > 0 && target.hp / target.maxHp >= threshold;
    case 'TargetHasDebuff':
      return !!target && !!cond.debuff && target.debuffs.some((d) => d.type === cond.debuff);
    case 'TargetIsEliteOrBoss':
      return !!target && (target.isElite || isBossLikeEnemy(target));
    case 'PlayerHpBelowPct':
      return player.maxHp > 0 && player.hp / player.maxHp <= threshold;
    case 'PlayerIsAirborne':
      return !player.grounded;
    case 'PlayerIsSliding':
      return player.isSliding;
    case 'PlayerSpeedAbove': {
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      return horizSpeed >= threshold;
    }
    case 'PlayerHasShield':
      return player.shield > 0;
    case 'DistanceBelow': {
      const refPos = target ? target.pos : ctx.pos;
      return !!refPos && distSq3(player.pos, refPos) <= threshold * threshold;
    }
    case 'DistanceAbove': {
      const refPos = target ? target.pos : ctx.pos;
      return !!refPos && distSq3(player.pos, refPos) >= threshold * threshold;
    }
    case 'EveryNthTrigger': {
      const n = Math.max(1, Math.floor(threshold || 1));
      return triggerCounter > 0 && triggerCounter % n === 0;
    }
    default:
      return true;
  }
}

function computeEffectValue(effect: ItemHookEffect, stacks: number): number {
  return effect.baseValue + (effect.perStackValue ?? 0) * Math.max(0, stacks - 1);
}

function findNearestEnemy(
  state: Readonly<SimState>,
  origin: Vec3,
  maxRadius: number,
  excludeIds?: ReadonlySet<number>,
): EnemyState | null {
  const maxSq = maxRadius * maxRadius;
  let best: EnemyState | null = null;
  let bestSq = maxSq;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    if (excludeIds && excludeIds.has(e.id)) continue;
    const dSq = distSq3(origin, e.pos);
    if (dSq <= bestSq) {
      bestSq = dSq;
      best = e;
    }
  }
  return best;
}

function upsertPlayerBuff(
  player: PlayerState,
  id: string,
  remainingSec: number,
  modifiers: PlayerState['buffs'][number]['modifiers'],
  recalcStats?: () => void,
  stackAdditive = false,
  maxCapValue?: number,
): void {
  const existing = player.buffs.find((b) => b.id === id);
  if (existing) {
    existing.remainingSec = Math.max(existing.remainingSec, remainingSec);
    if (stackAdditive && existing.modifiers.length === modifiers.length) {
      for (let i = 0; i < existing.modifiers.length; i++) {
        const cur = existing.modifiers[i];
        const inc = modifiers[i];
        if (inc.add !== undefined) {
          const next = (cur.add ?? 0) + inc.add;
          cur.add = maxCapValue !== undefined ? Math.min(maxCapValue, next) : next;
        }
        if (inc.mult !== undefined) {
          const next = (cur.mult ?? 0) + inc.mult;
          cur.mult = maxCapValue !== undefined ? Math.min(maxCapValue, next) : next;
        }
        if (inc.flat !== undefined) {
          const next = (cur.flat ?? 0) + inc.flat;
          cur.flat = maxCapValue !== undefined ? Math.min(maxCapValue, next) : next;
        }
      }
    } else {
      existing.modifiers = modifiers;
    }
  } else {
    player.buffs.push({ id, remainingSec, modifiers });
  }
  recalcStats?.();
}

function executeItemEffect(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  itemId: string,
  stacks: number,
  effect: ItemHookEffect,
  ctx: ItemTriggerContext,
  rng: () => number,
  events: SimEvent[],
): void {
  const player = state.player;
  const val = computeEffectValue(effect, stacks);
  const origin: Vec3 = ctx.pos
    ? { x: ctx.pos.x, y: ctx.pos.y, z: ctx.pos.z }
    : ctx.target
      ? { x: ctx.target.pos.x, y: ctx.target.pos.y, z: ctx.target.pos.z }
      : { x: player.pos.x, y: player.pos.y, z: player.pos.z };
  const depth = ctx.depth ?? 1;

  switch (effect.type) {
    case 'ModifyStat': {
      if (!effect.stat) break;
      const isPermanent = (effect.durationSec ?? 0) >= 900000;
      const isIdleJuice = itemId === 'IdleJuice';
      upsertPlayerBuff(
        player,
        `item_mod:${itemId}:${effect.stat}`,
        effect.durationSec ?? 4.0,
        [{ stat: effect.stat, add: val, sourceId: `item:${itemId}` }],
        ctx.recalcStats,
        isPermanent || isIdleJuice,
        isIdleJuice ? 0.6 * stacks : undefined,
      );
      break;
    }

    case 'DealDamage': {
      const target = ctx.target && ctx.target.hp > 0 ? ctx.target : findNearestEnemy(state, origin, 18);
      if (!target) break;
      let dmgAmount =
        effect.damageScale && ctx.damageDealt
          ? Math.max(val, ctx.damageDealt * effect.damageScale)
          : val;
      // CursedDoll scales with enemy Max HP (capped vs bosses)
      if (itemId === 'CursedDoll') {
        const pctDmg = target.maxHp * Math.min(0.25, 0.05 * stacks);
        dmgAmount = isBossLikeEnemy(target) ? Math.min(pctDmg, 180 * stacks) : Math.max(val, pctDmg);
      }
      applyDamageToEnemy(
        state,
        catalog,
        target,
        {
          baseDamage: dmgAmount,
          element: effect.element ?? 'Physical',
          procCoefficient: 0,
          weaponId: `item:${itemId}`,
          isProcDamage: true,
        },
        rng,
        events,
        {
          skipItemProcs: true,
          depth: depth + 1,
          onEnemyKilled: ctx.onEnemyKilled,
          recalcStats: ctx.recalcStats,
        },
      );
      break;
    }

    case 'SpawnProjectile': {
      const target = findNearestEnemy(state, player.pos, 42);
      const dirX = target ? target.pos.x - player.pos.x : -Math.sin(player.yaw);
      const dirY = target ? target.pos.y + target.height * 0.5 - (player.pos.y + 1.2) : 0;
      const dirZ = target ? target.pos.z - player.pos.z : -Math.cos(player.yaw);
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      const speed = 28 * Math.max(0.4, player.stats.ProjectileSpeed);
      const spawnPos: Vec3 = { x: player.pos.x, y: player.pos.y + 1.3, z: player.pos.z };
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: `item:${itemId}`,
        ownerIsPlayer: true,
        pos: { ...spawnPos },
        prevPos: { ...spawnPos },
        vel: { x: (dirX / len) * speed, y: (dirY / len) * speed, z: (dirZ / len) * speed },
        radius: 0.55 * Math.max(0.5, player.stats.AreaSize),
        damage: effect.damageScale && ctx.damageDealt ? Math.max(val, ctx.damageDealt * effect.damageScale) : val,
        element: effect.element ?? 'Physical',
        knockback: 1.0,
        critBonus: 0,
        bouncesLeft: effect.bounces ?? 0,
        pierceLeft: 0,
        lifeSec: 0,
        maxLifeSec: effect.durationSec ?? 2.5,
        procCoefficient: 0,
        homingTargetId: target ? target.id : null,
        hitEntityIds: [],
      });
      break;
    }

    case 'SpawnNova': {
      const extraRad = itemId === 'BobsLantern' ? (stacks - 1) * 1.5 : 0;
      const radius = ((effect.radius ?? 6.5) + extraRad) * Math.max(0.4, player.stats.AreaSize);
      let dmgAmount =
        effect.damageScale && ctx.damageDealt
          ? Math.max(val, ctx.damageDealt * effect.damageScale)
          : val;
      if (itemId === 'Cactus' || itemId === 'QuinsMask') {
        dmgAmount += player.stats.Thorns * (1.2 + 0.4 * stacks);
      }

      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: `item:${itemId}`,
        ownerIsPlayer: true,
        pos: { ...origin },
        radius,
        height: 2.2,
        lifeSec: 0,
        maxLifeSec: 0.4,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: dmgAmount,
        element: effect.element ?? 'Physical',
        procCoefficient: 0,
      });

      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        const reach = radius + e.radius;
        if (distSq3(origin, e.pos) <= reach * reach) {
          // SpeedBoi slows/freezes enemies inside blast
          if (itemId === 'SpeedBoi') {
            applyDebuffToEnemy(state, catalog, e, 'Freeze', 3.5, 0, rng, events, 'item:SpeedBoi', 1, false, depth + 1);
          }
          // ToxicBarrel poisons every enemy caught in the blast
          if (itemId === 'ToxicBarrel') {
            applyDebuffToEnemy(state, catalog, e, 'Poison', 5.0, 10 + 6 * stacks, rng, events, 'item:ToxicBarrel', 2, false, depth + 1);
          }
          // Power Gloves knocks enemies back violently
          if (itemId === 'GlovePower') {
            const dx = e.pos.x - origin.x;
            const dz = e.pos.z - origin.z;
            const d = Math.hypot(dx, dz) || 1;
            const kb = (e.isBoss ? 3.5 : 14) * Math.max(0.5, player.stats.Knockback);
            e.vel.x += (dx / d) * kb;
            e.vel.z += (dz / d) * kb;
          }
          applyDamageToEnemy(
            state,
            catalog,
            e,
            {
              baseDamage: dmgAmount,
              element: effect.element ?? 'Physical',
              procCoefficient: 0,
              weaponId: `item:${itemId}`,
              isProcDamage: true,
            },
            rng,
            events,
            {
              skipItemProcs: true,
              depth: depth + 1,
              onEnemyKilled: ctx.onEnemyKilled,
              recalcStats: ctx.recalcStats,
            },
          );
        }
      }
      break;
    }

    case 'ChainLightning': {
      const maxChains = Math.max(1, (effect.chains ?? 3) + Math.floor(player.stats.ChainCount));
      const jumpRadius = (effect.radius ?? 10) * Math.max(0.5, player.stats.AttackRange);
      const baseChainDmg =
        effect.damageScale && ctx.damageDealt
          ? Math.max(val, ctx.damageDealt * effect.damageScale)
          : val;

      const visited = new Set<number>();
      let currentPos = origin;
      if (ctx.target) {
        visited.add(ctx.target.id);
      }

      for (let hop = 0; hop < maxChains; hop++) {
        const next = findNearestEnemy(state, currentPos, jumpRadius, visited);
        if (!next) break;
        visited.add(next.id);
        const hopDmg = baseChainDmg * Math.pow(0.88, hop);
        state.areaEffects.push({
          id: state.nextEntityId++,
          kind: 'beam',
          weaponId: 'WeaponLightningBolt',
          ownerIsPlayer: true,
          pos: { x: next.pos.x, y: next.pos.y + next.height * 0.5, z: next.pos.z },
          radius: 1.4,
          height: 6.0,
          lifeSec: 0,
          maxLifeSec: 0.22,
          tickTimer: 99,
          tickIntervalSec: 99,
          damage: hopDmg,
          element: 'Lightning',
          procCoefficient: 0,
        });
        applyDamageToEnemy(
          state,
          catalog,
          next,
          {
            baseDamage: hopDmg,
            element: 'Lightning',
            procCoefficient: 0,
            weaponId: `item:${itemId}`,
            isProcDamage: true,
          },
          rng,
          events,
          {
            skipItemProcs: true,
            depth: depth + 1,
            onEnemyKilled: ctx.onEnemyKilled,
            recalcStats: ctx.recalcStats,
          },
        );
        currentPos = next.pos;
      }
      break;
    }

    case 'ApplyDebuff': {
      if (!effect.debuff) break;
      const target = ctx.target && ctx.target.hp > 0 ? ctx.target : findNearestEnemy(state, origin, 14);
      if (!target) break;
      const dur = effect.durationSec ?? 3.0;
      const dps = effect.debuff === 'Poison' || effect.debuff === 'Burn' ? val : 0;
      const addStacks = itemId === 'Snek' ? 2 : 1;
      applyDebuffToEnemy(
        state,
        catalog,
        target,
        effect.debuff,
        effect.debuff === 'Freeze' ? dur + (effect.perStackValue ?? 0) * Math.max(0, stacks - 1) : dur,
        dps,
        rng,
        events,
        `item:${itemId}`,
        addStacks,
        false,
        depth + 1,
      );
      break;
    }

    case 'Heal': {
      if (player.dead || val <= 0) break;
      const before = player.hp;
      const newHp = player.hp + val;
      if (newHp > player.maxHp) {
        player.hp = player.maxHp;
        if (player.stats.Overheal > 0) {
          const maxOverheal = player.maxHp * Math.min(1.5, player.stats.Overheal);
          player.overheal = Math.min(maxOverheal, player.overheal + (newHp - player.maxHp));
        }
      } else {
        player.hp = newHp;
      }
      const healed = player.hp - before;
      if (healed > 0) {
        events.push({
          type: 'player_heal',
          tick: state.tick,
          pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
          amount: Math.round(healed * 10) / 10,
        });
        if (depth < 1) {
          triggerHolyBookRadiance(state, catalog, healed, rng, events, ctx.onEnemyKilled, ctx.recalcStats);
        }
      }
      break;
    }

    case 'AddShield': {
      if (player.dead || val <= 0) break;
      const shieldCap = Math.max(player.maxShield, player.shield + val, 25 * stacks);
      player.shield = Math.min(shieldCap, player.shield + val);
      break;
    }

    case 'GrantGold': {
      const gained = Math.max(1, Math.round(val * Math.max(0.1, player.stats.GoldMultiplier)));
      player.gold += gained;
      break;
    }

    case 'GrantXp': {
      const gained = Math.max(1, Math.round(val * Math.max(0.1, player.stats.XpMultiplier)));
      player.xp += gained;
      break;
    }

    case 'MultiplyDamage': {
      const target = ctx.target;
      if (!target || target.hp <= 0 || !ctx.damageDealt) break;
      const bonusDmg = ctx.damageDealt * Math.max(0.05, val);
      applyDamageToEnemy(
        state,
        catalog,
        target,
        {
          baseDamage: bonusDmg,
          element: effect.element ?? 'Physical',
          procCoefficient: 0,
          weaponId: `item:${itemId}`,
          isProcDamage: true,
        },
        rng,
        events,
        {
          skipItemProcs: true,
          depth: depth + 1,
          onEnemyKilled: ctx.onEnemyKilled,
          recalcStats: ctx.recalcStats,
        },
      );
      break;
    }

    case 'ExtraProcRoll': {
      const target = ctx.target;
      if (!target || target.hp <= 0) break;
      const echoDmg =
        effect.damageScale && ctx.damageDealt
          ? Math.max(val, ctx.damageDealt * effect.damageScale)
          : val;
      applyDamageToEnemy(
        state,
        catalog,
        target,
        {
          baseDamage: echoDmg,
          element: effect.element ?? 'Holy',
          procCoefficient: 0,
          weaponId: `item:${itemId}`,
          isProcDamage: true,
        },
        rng,
        events,
        {
          skipItemProcs: true,
          depth: depth + 1,
          onEnemyKilled: ctx.onEnemyKilled,
          recalcStats: ctx.recalcStats,
        },
      );
      break;
    }

    case 'Execute': {
      const target = ctx.target;
      if (
        !target ||
        target.hp <= 0 ||
        target.enemyId === 'GhostInvincible' ||
        target.enemyId === 'GhostKing' ||
        target.enemyId === 'FinalBoss'
      ) {
        break;
      }
      const pct = target.maxHp > 0 ? target.hp / target.maxHp : 1;
      if (pct <= clamp(val, 0.05, 0.5)) {
        const execDmg = isBossLikeEnemy(target) ? target.maxHp * 0.1 : target.hp;
        applyDamageToEnemy(
          state,
          catalog,
          target,
          {
            baseDamage: execDmg,
            element: effect.element ?? 'Physical',
            procCoefficient: 0,
            weaponId: `item:${itemId}`,
            isProcDamage: true,
          },
          rng,
          events,
          {
            skipItemProcs: true,
            depth: depth + 1,
            onEnemyKilled: (killed, _ex, wid) => ctx.onEnemyKilled?.(killed, true, wid),
            recalcStats: ctx.recalcStats,
          },
        );
      }
      break;
    }

    case 'Revive': {
      // ZaWarudo: freeze every living enemy across the arena in time and break 1 stack!
      if (itemId === 'ZaWarudo') {
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp <= 0) continue;
          applyDebuffToEnemy(state, catalog, e, 'Freeze', 6.0, 0, rng, events, 'item:ZaWarudo', 1, false, depth + 1);
          e.stunTimer = Math.max(e.stunTimer, 4.0);
        }
        state.activeBannerText = 'ZA WARUDO! TIME STOPPED!';
        removePlayerItemStack(state, 'ZaWarudo', 1, ctx.recalcStats);
      }
      player.revivesLeft += Math.max(1, Math.floor(val));
      break;
    }

    case 'SpawnMinion': {
      const target = findNearestEnemy(state, player.pos, 38);
      const spawnPos: Vec3 = {
        x: player.pos.x + (rng() - 0.5) * 3,
        y: player.pos.y + 1.5,
        z: player.pos.z + (rng() - 0.5) * 3,
      };
      const dirX = target ? target.pos.x - spawnPos.x : -Math.sin(player.yaw);
      const dirZ = target ? target.pos.z - spawnPos.z : -Math.cos(player.yaw);
      const d = Math.hypot(dirX, dirZ) || 1;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: `minion:${itemId}`,
        ownerIsPlayer: true,
        pos: { ...spawnPos },
        prevPos: { ...spawnPos },
        vel: { x: (dirX / d) * 18, y: 0, z: (dirZ / d) * 18 },
        radius: 0.75,
        damage: val,
        element: effect.element ?? 'Void',
        knockback: 0.8,
        critBonus: 0,
        bouncesLeft: 1,
        pierceLeft: 2,
        lifeSec: 0,
        maxLifeSec: effect.durationSec ?? 5.5,
        procCoefficient: 0.4,
        homingTargetId: target ? target.id : null,
        hitEntityIds: [],
      });
      break;
    }

    case 'ModifyCooldown': {
      for (let i = 0; i < player.weapons.length; i++) {
        player.weapons[i].cooldownTimer = Math.max(0, player.weapons[i].cooldownTimer - val);
      }
      break;
    }

    case 'ConvertStat': {
      if (!effect.stat || !effect.sourceStat) break;
      const srcValue = player.stats[effect.sourceStat];
      const delta = srcValue * val;
      upsertPlayerBuff(
        player,
        `item_conv:${itemId}:${effect.stat}`,
        effect.durationSec ?? 5.0,
        [{ stat: effect.stat, flat: delta, sourceId: `item:${itemId}` }],
        ctx.recalcStats,
      );
      break;
    }

    case 'SpeedBoost': {
      upsertPlayerBuff(
        player,
        `item_speed:${itemId}`,
        effect.durationSec ?? 2.5,
        [{ stat: 'MoveSpeed', add: val, sourceId: `item:${itemId}` }],
        ctx.recalcStats,
      );
      break;
    }

    case 'DropPickup': {
      const angle = rng() * Math.PI * 2;
      const dist = 1.2 + rng() * 1.4;
      state.pickups.push({
        id: state.nextEntityId++,
        kind: effect.pickupKind ?? 'health',
        pos: {
          x: origin.x + Math.cos(angle) * dist,
          y: origin.y + 0.5,
          z: origin.z + Math.sin(angle) * dist,
        },
        vel: { x: Math.cos(angle) * 2.5, y: 4.5, z: Math.sin(angle) * 2.5 },
        value: Math.max(1, Math.round(val)),
        magnetized: false,
        ageSec: 0,
      });
      break;
    }

    case 'MagnetPulse': {
      const rSq = (effect.radius ?? 9999) * (effect.radius ?? 9999);
      for (let i = 0; i < state.pickups.length; i++) {
        const p = state.pickups[i];
        if (distSq3(player.pos, p.pos) <= rSq) {
          p.magnetized = true;
        }
      }
      break;
    }
  }
}

function evaluateHook(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  itemId: string,
  stacks: number,
  stackRef: PlayerItemStack | null,
  hook: ItemHookNode,
  trigger: ItemTrigger,
  ctx: ItemTriggerContext,
  rng: () => number,
  events: SimEvent[],
): boolean {
  if (hook.trigger !== trigger) return false;
  if (stackRef && hook.cooldownSec && stackRef.internalCooldown > 0) return false;

  // Campfire & IdleJuice only activate while standing still!
  if ((itemId === 'Campfire' || itemId === 'IdleJuice') && trigger === 'OnTick') {
    const horizSpd = Math.hypot(state.player.vel.x, state.player.vel.z);
    if (horizSpd > 1.2) {
      if (itemId === 'IdleJuice') {
        const idx = state.player.buffs.findIndex((b) => b.id === 'item_mod:IdleJuice:DamageMultiplier');
        if (idx >= 0) {
          state.player.buffs.splice(idx, 1);
          ctx.recalcStats?.();
        }
      }
      return false;
    }
  }

  const counter = stackRef ? stackRef.triggerCounter + 1 : 1;
  if (stackRef) {
    stackRef.triggerCounter = counter;
  }

  if (hook.conditions) {
    for (let c = 0; c < hook.conditions.length; c++) {
      if (!evaluateCondition(state, hook.conditions[c], ctx, counter)) {
        return false;
      }
    }
  }

  let chance = clamp(
    hook.chance + (hook.chancePerStack ?? 0) * Math.max(0, stacks - 1),
    0,
    1,
  );
  if (hook.usesProcCoefficient) {
    const procCoeff = clamp(
      (ctx.procCoefficient ?? 1.0) + state.player.stats.ProcCoefficientBonus,
      0.05,
      2.0,
    );
    chance = clamp(chance * procCoeff, 0, 1);
  }
  if (chance > 0 && chance < 1 && state.player.stats.Luck > 0) {
    chance = 1 - Math.pow(1 - chance, 1 + state.player.stats.Luck * 0.25);
  }

  const extraRolls =
    hook.usesProcCoefficient
      ? Math.max(0, Math.floor(state.player.stats.ExtraProcRolls))
      : 0;
  const totalRolls = 1 + extraRolls;

  let procced = false;
  for (let r = 0; r < totalRolls; r++) {
    if (chance >= 1 || rng() < chance) {
      procced = true;
      break;
    }
  }

  if (!procced) return false;

  if (stackRef) {
    stackRef.procCount += 1;
    if (hook.cooldownSec && hook.cooldownSec > 0) {
      // Bob's Light reduces cooldown per stack (min 1.5s)
      const effectiveCd =
        itemId === 'BobsLantern'
          ? Math.max(1.5, hook.cooldownSec - (stacks - 1) * 0.5)
          : hook.cooldownSec;
      stackRef.internalCooldown = effectiveCd;
    }
  }

  const eventPos = ctx.pos
    ? { x: ctx.pos.x, y: ctx.pos.y, z: ctx.pos.z }
    : ctx.target
      ? { x: ctx.target.pos.x, y: ctx.target.pos.y, z: ctx.target.pos.z }
      : { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z };

  events.push({
    type: 'item_proc',
    tick: state.tick,
    itemId,
    trigger,
    pos: eventPos,
  });

  // Special item stateful hooks
  if (itemId === 'DemonicBlood' && trigger === 'OnKill') {
    upsertPlayerBuff(
      state.player,
      'item_stack:DemonicBlood',
      PERMANENT_BUFF_SEC,
      [{ stat: 'MaxHealth', flat: 2 * stacks, sourceId: 'item:DemonicBlood' }],
      ctx.recalcStats,
      true,
      200 * stacks,
    );
  } else if (itemId === 'DemonicSoul' && trigger === 'OnKill') {
    upsertPlayerBuff(
      state.player,
      'item_stack:DemonicSoul',
      PERMANENT_BUFF_SEC,
      [{ stat: 'DamageMultiplier', mult: 0.005 * stacks, sourceId: 'item:DemonicSoul' }],
      ctx.recalcStats,
      true,
      0.5 * stacks,
    );
  } else if (itemId === 'Mirror' && trigger === 'OnHurt') {
    state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.2);
  } else if (
    itemId === 'Kevin' &&
    (trigger === 'OnHit' || trigger === 'OnTick') &&
    (ctx.depth ?? 0) <= 1 &&
    !state.player.dead
  ) {
    // Kevin punches you for 1 non-lethal damage, triggering OnHurt/Thorns/CowardsCloak/LockIn!
    if (state.player.hp > 1) {
      state.player.hp = Math.max(1, state.player.hp - 1);
      events.push({
        type: 'player_hurt',
        tick: state.tick,
        pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
        amount: 1,
        blockedByShield: 0,
        remainingHp: state.player.hp,
      });
      dispatchItemTrigger(
        state,
        catalog,
        'OnHurt',
        {
          target: ctx.target,
          damageDealt: 1,
          pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
          depth: (ctx.depth ?? 0) + 1,
          onEnemyKilled: ctx.onEnemyKilled,
          recalcStats: ctx.recalcStats,
        },
        rng,
        events,
      );
    }
  }

  for (let e = 0; e < hook.effects.length; e++) {
    executeItemEffect(state, catalog, itemId, stacks, hook.effects[e], ctx, rng, events);
  }
  return true;
}

/**
 * Evaluates all declarative item & passive Trigger-Hook nodes matching `trigger`.
 * Also handles Joe's Dagger execute kill permanent damage stacking.
 */
export function dispatchItemTrigger(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  trigger: ItemTrigger,
  ctx: ItemTriggerContext,
  rng: () => number,
  events: SimEvent[],
): number {
  const depth = ctx.depth ?? 0;
  if (depth > 2) return 0;

  // Joe's Dagger: executing an enemy permanently stacks +2% DamageMultiplier per stack
  if (trigger === 'OnKill' && ctx.isExecute) {
    const joeStacks = getPlayerItemStacks(state.player, 'JoesDagger');
    if (joeStacks > 0) {
      upsertPlayerBuff(
        state.player,
        'item_stack:JoesDagger',
        PERMANENT_BUFF_SEC,
        [{ stat: 'DamageMultiplier', mult: 0.02 * joeStacks, sourceId: 'item:JoesDagger' }],
        ctx.recalcStats,
        true,
        3.0,
      );
    }
  }

  let triggeredCount = 0;

  const itemDefById = new Map<string, ItemDef>();
  for (let i = 0; i < catalog.items.length; i++) {
    itemDefById.set(catalog.items[i].id, catalog.items[i]);
  }

  for (let i = 0; i < state.player.items.length; i++) {
    const stack = state.player.items[i];
    if (stack.stacks <= 0) continue;
    const canonical = resolveCanonicalItemId(stack.itemId);
    const def = itemDefById.get(canonical);
    if (!def?.hooks || def.hooks.length === 0) continue;

    for (let h = 0; h < def.hooks.length; h++) {
      if (
        evaluateHook(
          state,
          catalog,
          def.id,
          stack.stacks,
          stack,
          def.hooks[h],
          trigger,
          ctx,
          rng,
          events,
        )
      ) {
        triggeredCount += 1;
      }
    }
  }

  const charDef = catalog.characters.find((c) => c.id === state.characterId);
  if (charDef?.passive.hooks && charDef.passive.hooks.length > 0) {
    for (let h = 0; h < charDef.passive.hooks.length; h++) {
      if (
        evaluateHook(
          state,
          catalog,
          `passive:${charDef.passive.id}`,
          state.player.level,
          null,
          charDef.passive.hooks[h],
          trigger,
          ctx,
          rng,
          events,
        )
      ) {
        triggeredCount += 1;
      }
    }
  }

  return triggeredCount;
}
