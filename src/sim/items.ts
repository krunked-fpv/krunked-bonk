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
import { applyDamageToEnemy, applyDebuffToEnemy, isBossLikeEnemy } from './damage';

export interface ItemTriggerContext {
  target?: EnemyState;
  damageDealt?: number;
  weaponId?: string;
  procCoefficient?: number;
  pos?: Vec3;
  depth?: number;
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void;
  recalcStats?: () => void;
}

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
  for (let i = 0; i < player.items.length; i++) {
    if (player.items[i].itemId === itemId) {
      return player.items[i].stacks;
    }
  }
  return 0;
}

export function grantPlayerItem(
  state: SimState,
  itemId: string,
  stacks = 1,
  recalcStats?: () => void,
): PlayerItemStack {
  const count = Math.max(1, Math.floor(stacks));
  let existing = state.player.items.find((it) => it.itemId === itemId);
  if (existing) {
    existing.stacks += count;
  } else {
    existing = {
      itemId,
      stacks: count,
      internalCooldown: 0,
      triggerCounter: 0,
      procCount: 0,
    };
    state.player.items.push(existing);
  }
  recalcStats?.();
  return existing;
}

export function stepItemCooldowns(state: SimState, dt: number): void {
  const items = state.player.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].internalCooldown > 0) {
      items[i].internalCooldown = Math.max(0, items[i].internalCooldown - dt);
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
): void {
  const existing = player.buffs.find((b) => b.id === id);
  if (existing) {
    existing.remainingSec = Math.max(existing.remainingSec, remainingSec);
    existing.modifiers = modifiers;
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
      upsertPlayerBuff(
        player,
        `item_mod:${itemId}:${effect.stat}`,
        effect.durationSec ?? 4.0,
        [{ stat: effect.stat, add: val, sourceId: `item:${itemId}` }],
        ctx.recalcStats,
      );
      break;
    }

    case 'DealDamage': {
      const target = ctx.target && ctx.target.hp > 0 ? ctx.target : findNearestEnemy(state, origin, 14);
      if (!target) break;
      const dmgAmount = effect.damageScale && ctx.damageDealt
        ? Math.max(val, ctx.damageDealt * effect.damageScale)
        : val;
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
      const target = findNearestEnemy(state, player.pos, 38);
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
        maxLifeSec: effect.durationSec ?? 2.2,
        procCoefficient: 0,
        homingTargetId: target ? target.id : null,
        hitEntityIds: [],
      });
      break;
    }

    case 'SpawnNova': {
      const radius = (effect.radius ?? 6.5) * Math.max(0.4, player.stats.AreaSize);
      const dmgAmount = effect.damageScale && ctx.damageDealt
        ? Math.max(val, ctx.damageDealt * effect.damageScale)
        : val;
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

      const rSq = radius * radius;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        if (distSq3(origin, e.pos) <= (radius + e.radius) * (radius + e.radius) && distSq3(origin, e.pos) <= rSq + e.radius * e.radius * 4 + 2 * radius * e.radius) {
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
      const baseChainDmg = effect.damageScale && ctx.damageDealt
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
      const target = ctx.target && ctx.target.hp > 0 ? ctx.target : findNearestEnemy(state, origin, 12);
      if (!target) break;
      const dur = effect.durationSec ?? 3.0;
      const dps = effect.debuff === 'Poison' || effect.debuff === 'Burn' ? val : 0;
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
        1,
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
          const maxOverheal = player.maxHp * Math.min(1.0, player.stats.Overheal);
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
      const echoDmg = effect.damageScale && ctx.damageDealt
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
      if (!target || target.hp <= 0 || target.enemyId === 'GhostInvincible') break;
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
            onEnemyKilled: ctx.onEnemyKilled,
            recalcStats: ctx.recalcStats,
          },
        );
      }
      break;
    }

    case 'Revive': {
      player.revivesLeft += Math.max(1, Math.floor(val));
      break;
    }

    case 'SpawnMinion': {
      const target = findNearestEnemy(state, player.pos, 32);
      const spawnPos: Vec3 = {
        x: player.pos.x + (rng() - 0.5) * 3,
        y: player.pos.y + 1.5,
        z: player.pos.z + (rng() - 0.5) * 3,
      };
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: `minion:${itemId}`,
        ownerIsPlayer: true,
        pos: { ...spawnPos },
        prevPos: { ...spawnPos },
        vel: { x: 0, y: 0, z: 0 },
        radius: 0.7,
        damage: val,
        element: effect.element ?? 'Holy',
        knockback: 0.8,
        critBonus: 0,
        bouncesLeft: 1,
        pierceLeft: 2,
        lifeSec: 0,
        maxLifeSec: effect.durationSec ?? 5.0,
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

  // Chance scaled by stack, procCoefficient, Luck, and ExtraProcRolls
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
    // Luck smoothly improves failed odds without overflowing 1.0
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
      stackRef.internalCooldown = hook.cooldownSec;
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

  for (let e = 0; e < hook.effects.length; e++) {
    executeItemEffect(state, catalog, itemId, stacks, hook.effects[e], ctx, rng, events);
  }
  return true;
}

/**
 * Evaluates all declarative item & passive Trigger-Hook nodes matching `trigger`.
 * Returns the number of hooks that successfully triggered.
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

  let triggeredCount = 0;

  // Build quick lookup from catalog.items (small array, fast linear or map)
  const itemDefById = new Map<string, ItemDef>();
  for (let i = 0; i < catalog.items.length; i++) {
    itemDefById.set(catalog.items[i].id, catalog.items[i]);
  }

  // Evaluate owned item hooks
  for (let i = 0; i < state.player.items.length; i++) {
    const stack = state.player.items[i];
    if (stack.stacks <= 0) continue;
    const def = itemDefById.get(stack.itemId);
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

  // Evaluate character passive declarative hooks if any
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
