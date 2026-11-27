import type {
  EnemyState,
  EStat,
  GameCatalog,
  SimEvent,
  SimState,
} from '../contracts/index';
import { applyDamageToEnemy, applyDebuffToEnemy, isBossLikeEnemy } from './damage';
import { triggerHolyBookRadiance } from './items';

const PERMANENT_BUFF_THRESHOLD_SEC = 900000;
const PERMANENT_BUFF_SEC = 999999;

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function upsertDynamicBuff(
  state: SimState,
  buffId: string,
  remainingSec: number,
  modifiers: SimState['player']['buffs'][number]['modifiers'],
): boolean {
  const player = state.player;
  const existing = player.buffs.find((b) => b.id === buffId);
  if (!existing) {
    player.buffs.push({ id: buffId, remainingSec, modifiers });
    return true;
  }
  existing.remainingSec = remainingSec;
  let changed = existing.modifiers.length !== modifiers.length;
  if (!changed) {
    for (let i = 0; i < modifiers.length; i++) {
      const a = existing.modifiers[i];
      const b = modifiers[i];
      if (a.stat !== b.stat || a.add !== b.add || a.mult !== b.mult || a.flat !== b.flat) {
        changed = true;
        break;
      }
    }
  }
  if (changed) {
    existing.modifiers = modifiers;
  }
  return changed;
}

function removeDynamicBuff(state: SimState, buffId: string): boolean {
  const idx = state.player.buffs.findIndex((b) => b.id === buffId);
  if (idx >= 0) {
    state.player.buffs.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Triggers Megachad's Flex wave when ready (auto-triggered near threats or on incoming hit).
 * Blocks incoming damage, unleashes a massive knockback shockwave, and grants a damage buff.
 */
export function tryTriggerMegachadFlex(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
): boolean {
  if (state.characterId !== 'Megachad') return false;
  const player = state.player;
  if (player.dead) return false;
  if ((player.passiveMeter ?? 0) < 1.0) return false;

  player.passiveMeter = 0;
  player.invulnTimer = Math.max(player.invulnTimer, 0.85);

  const buffId = 'passive:FlexBuff';
  upsertDynamicBuff(state, buffId, 4.0, [
    { stat: 'DamageMultiplier', mult: 0.35, sourceId: buffId },
    { stat: 'Knockback', add: 0.5, sourceId: buffId },
  ]);
  recalcStats?.();

  const radius = 8.5 * Math.max(0.5, player.stats.AreaSize);
  const flexDamage = 18 + 4 * player.level;

  state.areaEffects.push({
    id: state.nextEntityId++,
    kind: 'nova',
    weaponId: 'passive:Flex',
    ownerIsPlayer: true,
    pos: { x: player.pos.x, y: player.pos.y + 0.8, z: player.pos.z },
    radius,
    height: 3.0,
    lifeSec: 0,
    maxLifeSec: 0.45,
    tickTimer: 99,
    tickIntervalSec: 99,
    damage: flexDamage,
    element: 'Physical',
    procCoefficient: 0.6,
  });

  events.push({
    type: 'item_proc',
    tick: state.tick,
    itemId: 'passive:Flex',
    trigger: 'OnBlock',
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
  });

  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.hp <= 0) continue;
    const dSq = distSqXZ(player.pos.x, player.pos.z, enemy.pos.x, enemy.pos.z);
    if (dSq <= (radius + enemy.radius) ** 2) {
      const dx = enemy.pos.x - player.pos.x;
      const dz = enemy.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const kbForce = (enemy.isBoss ? 5.5 : 15.0) * Math.max(0.5, player.stats.Knockback);
      enemy.vel.x += (dx / dist) * kbForce;
      enemy.vel.z += (dz / dist) * kbForce;

      applyDamageToEnemy(
        state,
        catalog,
        enemy,
        {
          baseDamage: flexDamage,
          element: 'Physical',
          procCoefficient: 0.6,
          weaponId: 'passive:Flex',
          isMelee: true,
        },
        rng,
        events,
        { onEnemyKilled, recalcStats },
      );
    }
  }

  return true;
}

/**
 * Called whenever the player takes HP/Shield damage (after evasion, Aegis, & Flex checks).
 * - Calcium: halves SpeedDemon momentum meter immediately.
 * - Athena: updates LockIn missing-HP damage buff immediately.
 */
export function onPlayerHurtPassive(state: SimState, recalcStats?: () => void): void {
  const player = state.player;
  if (state.characterId === 'Calcium') {
    const halved = Math.max(0, (player.passiveMeter ?? 0) * 0.5);
    player.passiveMeter = halved;
    const q = Math.round(halved * 50) / 50;
    upsertDynamicBuff(state, 'passive:SpeedDemon', 1.0, [
      { stat: 'MoveSpeed', add: 0.5 * q, sourceId: 'passive:SpeedDemon' },
      { stat: 'DamageMultiplier', mult: 0.4 * q, sourceId: 'passive:SpeedDemon' },
    ]);
    recalcStats?.();
  } else if (state.characterId === 'Athena') {
    const missingPct = player.maxHp > 0 ? Math.max(0, Math.min(1, 1 - player.hp / player.maxHp)) : 0;
    const bonus = Math.round(missingPct * 0.6 * 100) / 100;
    player.passiveMeter = missingPct;
    if (bonus > 0) {
      upsertDynamicBuff(state, 'passive:LockIn', 2.0, [
        { stat: 'DamageMultiplier', mult: bonus, sourceId: 'passive:LockIn' },
      ]);
      recalcStats?.();
    }
  }
}

/**
 * Called whenever the player dodges an attack via Evasion.
 * - Ninja (`Shadowstep`): instantly executes the attacker (or deals a massive 15% maxHP strike to bosses)!
 */
export function onPlayerDodgePassive(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  attacker: EnemyState | null,
  rng: () => number,
  events: SimEvent[],
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
  recalcStats?: () => void,
): void {
  if (state.characterId !== 'Ninja') return;
  if (!attacker || attacker.hp <= 0) return;

  const unexecutable =
    attacker.enemyId === 'GhostInvincible' ||
    attacker.enemyId === 'GhostKing' ||
    attacker.enemyId === 'FinalBoss';
  const strikeDmg = unexecutable
    ? Math.max(45, state.player.level * 15)
    : isBossLikeEnemy(attacker)
      ? Math.max(80, attacker.maxHp * 0.15)
      : attacker.hp;

  events.push({
    type: 'item_proc',
    tick: state.tick,
    itemId: 'passive:Shadowstep',
    trigger: 'OnDodge',
    pos: { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z },
  });

  applyDamageToEnemy(
    state,
    catalog,
    attacker,
    {
      baseDamage: strikeDmg,
      element: 'Void',
      procCoefficient: 0,
      weaponId: 'passive:Shadowstep',
      isProcDamage: true,
    },
    rng,
    events,
    {
      skipItemProcs: true,
      onEnemyKilled: (killed, _ex, wid) => onEnemyKilled?.(killed, !unexecutable && !isBossLikeEnemy(killed), wid),
      recalcStats,
    },
  );
}

/**
 * Called whenever an enemy is killed by the player.
 * - Amog (`Plague`): poisoned enemies explode on death, poisoning all nearby enemies!
 * - Bandit (`Flowstate`): builds AttackSpeed & MoveSpeed momentum on rapid kills!
 * - Vlad (`Vampire`): siphons HP & builds Overheal on every kill!
 */
export function onEnemyKilledPassive(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  enemy: EnemyState,
  rng: () => number,
  events: SimEvent[],
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
  recalcStats?: () => void,
): void {
  const player = state.player;
  if (player.dead) return;

  if (state.characterId === 'Amog') {
    const poison = enemy.debuffs.find((d) => d.type === 'Poison');
    if (poison) {
      const radius = 6.5 * Math.max(0.5, player.stats.AreaSize);
      const blastDmg = Math.max(18, poison.dps * Math.max(1, poison.stacks) * 1.4);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: 'passive:Plague',
        ownerIsPlayer: true,
        pos: { x: enemy.pos.x, y: enemy.pos.y + 0.6, z: enemy.pos.z },
        radius,
        height: 2.0,
        lifeSec: 0,
        maxLifeSec: 0.4,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: blastDmg,
        element: 'Poison',
        procCoefficient: 0,
      });
      events.push({
        type: 'item_proc',
        tick: state.tick,
        itemId: 'passive:Plague',
        trigger: 'OnKill',
        pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
      });

      for (let i = 0; i < state.enemies.length; i++) {
        const other = state.enemies[i];
        if (other.hp <= 0 || other.id === enemy.id) continue;
        if (distSqXZ(enemy.pos.x, enemy.pos.z, other.pos.x, other.pos.z) <= (radius + other.radius) ** 2) {
          applyDebuffToEnemy(
            state,
            catalog,
            other,
            'Poison',
            4.5,
            Math.max(8, poison.dps),
            rng,
            events,
            'passive:Plague',
            Math.max(1, Math.min(3, poison.stacks)),
            false,
            1,
          );
          applyDamageToEnemy(
            state,
            catalog,
            other,
            {
              baseDamage: blastDmg,
              element: 'Poison',
              procCoefficient: 0,
              weaponId: 'passive:Plague',
              isProcDamage: true,
            },
            rng,
            events,
            { skipItemProcs: true, depth: 1, onEnemyKilled, recalcStats },
          );
        }
      }
    }
  } else if (state.characterId === 'Bandit') {
    const nextMeter = Math.min(1.0, (player.passiveMeter ?? 0) + 0.14);
    player.passiveMeter = nextMeter;
    const q = Math.round(nextMeter * 20) / 20;
    if (
      upsertDynamicBuff(state, 'passive:Flowstate', 4.0, [
        { stat: 'AttackSpeed', add: 0.35 * q, sourceId: 'passive:Flowstate' },
        { stat: 'MoveSpeed', add: 0.15 * q, sourceId: 'passive:Flowstate' },
      ])
    ) {
      recalcStats?.();
    }
  } else if (state.characterId === 'Vlad') {
    const healAmt = 2 + 0.4 * player.level;
    const before = player.hp;
    const nextHp = player.hp + healAmt;
    if (nextHp > player.maxHp) {
      player.hp = player.maxHp;
      const cap = player.maxHp * Math.max(0.25, player.stats.Overheal);
      player.overheal = Math.min(cap, player.overheal + (nextHp - player.maxHp));
    } else {
      player.hp = nextHp;
    }
    const actual = player.hp - before;
    if (actual >= 1) {
      events.push({
        type: 'player_heal',
        tick: state.tick,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        amount: Math.round(actual * 10) / 10,
      });
      triggerHolyBookRadiance(state, catalog, actual, rng, events, onEnemyKilled, recalcStats);
    }
  }
}

const GAMBA_STAT_POOL: ReadonlyArray<{ stat: EStat; mode: 'add' | 'mult' | 'flat'; step: number; label: string }> = [
  { stat: 'DamageMultiplier', mode: 'mult', step: 0.04, label: 'Damage' },
  { stat: 'AttackSpeed', mode: 'add', step: 0.04, label: 'Attack Speed' },
  { stat: 'CritChance', mode: 'flat', step: 0.03, label: 'Crit Chance' },
  { stat: 'CritDamage', mode: 'add', step: 0.08, label: 'Crit Damage' },
  { stat: 'MaxHealth', mode: 'flat', step: 10, label: 'Max HP' },
  { stat: 'MoveSpeed', mode: 'add', step: 0.04, label: 'Move Speed' },
  { stat: 'Armor', mode: 'flat', step: 0.04, label: 'Armor' },
  { stat: 'AreaSize', mode: 'add', step: 0.04, label: 'Area Size' },
  { stat: 'Luck', mode: 'flat', step: 0.04, label: 'Luck' },
  { stat: 'GoldMultiplier', mode: 'add', step: 0.06, label: 'Gold Gain' },
];

/**
 * Called whenever the player levels up.
 * - Dicehead (`Gamba`): rolls a D6 and permanently boosts a random stat!
 */
export function onPlayerLevelUpPassive(
  state: SimState,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  if (state.characterId !== 'Dicehead') return;
  const roll = 1 + (Math.floor(rng() * 6) % 6);
  const pick = GAMBA_STAT_POOL[Math.floor(rng() * GAMBA_STAT_POOL.length) % GAMBA_STAT_POOL.length];
  const mult = roll === 6 ? 2.5 : 0.4 + roll * 0.25;
  const delta = Math.round(pick.step * mult * 1000) / 1000;

  const mod =
    pick.mode === 'mult'
      ? { stat: pick.stat, mult: delta, sourceId: 'passive:Gamba' }
      : pick.mode === 'add'
        ? { stat: pick.stat, add: delta, sourceId: 'passive:Gamba' }
        : { stat: pick.stat, flat: delta, sourceId: 'passive:Gamba' };

  state.player.buffs.push({
    id: `passive:Gamba:${state.player.level}:${state.nextEntityId++}`,
    remainingSec: PERMANENT_BUFF_SEC,
    modifiers: [mod],
  });
  state.player.passiveMeter = roll / 6;
  state.activeBannerText = roll === 6
    ? `GAMBA JACKPOT (6)! BIG ${pick.label.toUpperCase()} BOOST!`
    : `GAMBA ROLL (${roll}): +${pick.label.toUpperCase()}`;

  events.push({
    type: 'item_proc',
    tick: state.tick,
    itemId: 'passive:Gamba',
    trigger: 'OnLevelUp',
    pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
  });
  recalcStats?.();
}

/**
 * Steps ALL 21 active character passives & timed player buffs every fixed tick.
 */
export function stepCharacterPassives(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
): void {
  const player = state.player;
  if (player.dead) return;

  let statsDirty = false;

  // Tick and expire temporary buffs (preserve permanent shrine/blessing/stacking buffs >= 900000s)
  for (let i = player.buffs.length - 1; i >= 0; i--) {
    const buff = player.buffs[i];
    if (buff.remainingSec >= PERMANENT_BUFF_THRESHOLD_SEC) continue;
    buff.remainingSec -= dt;
    if (buff.remainingSec <= 0) {
      player.buffs.splice(i, 1);
      statsDirty = true;
    }
  }

  // Dynamic Gasmask scaling (per poisoned enemy)
  const gasmaskStack = player.items.find((it) => it.itemId === 'Gasmask');
  if (gasmaskStack && gasmaskStack.stacks > 0 && state.tick % 15 === 0) {
    let poisonedCount = 0;
    for (let i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].hp > 0 && state.enemies[i].debuffs.some((d) => d.type === 'Poison')) {
        poisonedCount += 1;
      }
    }
    const capped = Math.min(20, poisonedCount);
    if (capped > 0) {
      if (
        upsertDynamicBuff(state, 'item_dyn:Gasmask', 1.2, [
          { stat: 'Armor', flat: 0.025 * capped * gasmaskStack.stacks, sourceId: 'item:Gasmask' },
          { stat: 'DamageMultiplier', mult: 0.02 * capped * gasmaskStack.stacks, sourceId: 'item:Gasmask' },
        ])
      ) {
        statsDirty = true;
      }
    } else if (removeDynamicBuff(state, 'item_dyn:Gasmask')) {
      statsDirty = true;
    }
  }

  switch (state.characterId) {
    case 'Fox': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.02) * 1000) / 1000;
      break;
    }

    case 'SirOofie': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.03) * 1000) / 1000;
      break;
    }

    case 'Cl4nk': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.02) * 1000) / 1000;
      break;
    }

    case 'Ogre': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.03) * 1000) / 1000;
      break;
    }

    case 'Monke': {
      player.passiveMeter = Math.round(((player.level - 1) * 6) * 100) / 100;
      break;
    }

    case 'Spaceman': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.03) * 1000) / 1000;
      break;
    }

    case 'SirChadwell': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.02) * 1000) / 1000;
      break;
    }

    case 'Ninja': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.02) * 1000) / 1000;
      break;
    }

    case 'Vlad': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.015) * 1000) / 1000;
      break;
    }

    case 'Amog': {
      player.passiveMeter = Math.round(((player.level - 1) * 0.03) * 1000) / 1000;
      break;
    }

    case 'Dicehead': {
      // Gamba passive triggers on level-up; meter shows last roll ratio
      break;
    }

    case 'Calcium': {
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      const prevMeter = player.passiveMeter ?? 0;
      const nextMeter =
        horizSpeed > 1.5
          ? Math.min(1.0, prevMeter + dt * 0.1)
          : Math.max(0.0, prevMeter - dt * 0.08);
      player.passiveMeter = nextMeter;

      const nextQ = Math.round(nextMeter * 50) / 50;
      const buffId = 'passive:SpeedDemon';
      if (nextQ > 0) {
        if (
          upsertDynamicBuff(state, buffId, 1.0, [
            { stat: 'MoveSpeed', add: 0.5 * nextQ, sourceId: buffId },
            { stat: 'DamageMultiplier', mult: 0.4 * nextQ, sourceId: buffId },
          ])
        ) {
          statsDirty = true;
        }
      } else if (removeDynamicBuff(state, buffId)) {
        statsDirty = true;
      }
      break;
    }

    case 'Megachad': {
      const flexCd = Math.max(4.0, 12.0 - (player.level - 1) * 0.45);
      const current = player.passiveMeter ?? 1.0;
      const next = Math.min(1.0, current + dt / flexCd);
      player.passiveMeter = next;

      if (next >= 1.0) {
        const triggerRadiusSq = 6.5 * 6.5;
        let threatNearby = false;
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp <= 0) continue;
          if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= triggerRadiusSq) {
            threatNearby = true;
            break;
          }
        }
        if (threatNearby) {
          tryTriggerMegachadFlex(state, catalog, rng, events, recalcStats, onEnemyKilled);
          statsDirty = false;
        }
      }
      break;
    }

    case 'Athena': {
      // LockIn: up to +60% DamageMultiplier based on missing HP
      const missingPct = player.maxHp > 0 ? Math.max(0, Math.min(1, 1 - player.hp / player.maxHp)) : 0;
      player.passiveMeter = Math.round(missingPct * 100) / 100;
      const bonus = Math.round(missingPct * 0.6 * 20) / 20;
      if (bonus > 0) {
        if (
          upsertDynamicBuff(state, 'passive:LockIn', 1.0, [
            { stat: 'DamageMultiplier', mult: bonus, sourceId: 'passive:LockIn' },
          ])
        ) {
          statsDirty = true;
        }
      } else if (removeDynamicBuff(state, 'passive:LockIn')) {
        statsDirty = true;
      }
      break;
    }

    case 'Bandit': {
      // Flowstate decays gently when not chaining kills
      const prev = player.passiveMeter ?? 0;
      if (prev > 0) {
        const next = Math.max(0, prev - dt * 0.08);
        player.passiveMeter = next;
        const q = Math.round(next * 20) / 20;
        if (q > 0) {
          if (
            upsertDynamicBuff(state, 'passive:Flowstate', 1.0, [
              { stat: 'AttackSpeed', add: 0.35 * q, sourceId: 'passive:Flowstate' },
              { stat: 'MoveSpeed', add: 0.15 * q, sourceId: 'passive:Flowstate' },
            ])
          ) {
            statsDirty = true;
          }
        } else if (removeDynamicBuff(state, 'passive:Flowstate')) {
          statsDirty = true;
        }
      }
      break;
    }

    case 'Birdo': {
      // Float: +4% Airborne Damage per level while airborne
      const airborneBonus = Math.round(0.04 * player.level * 100) / 100;
      player.passiveMeter = !player.grounded ? 1.0 : 0.0;
      if (!player.grounded) {
        if (
          upsertDynamicBuff(state, 'passive:FloatAirborne', 0.5, [
            { stat: 'DamageMultiplier', mult: airborneBonus, sourceId: 'passive:FloatAirborne' },
          ])
        ) {
          statsDirty = true;
        }
      } else if (removeDynamicBuff(state, 'passive:FloatAirborne')) {
        statsDirty = true;
      }
      break;
    }

    case 'Bush': {
      // Bullseye: every 3.5s marks a random nearby living enemy for guaranteed explosive Crit!
      const next = (player.passiveMeter ?? 0) + dt / 3.5;
      if (next >= 1.0) {
        const eligible: EnemyState[] = [];
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp > 0 && !e.eliteTags.includes('Bullseye')) {
            if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= 55 * 55) {
              eligible.push(e);
            }
          }
        }
        if (eligible.length > 0) {
          const picked = eligible[Math.floor(rng() * eligible.length) % eligible.length];
          picked.eliteTags.push('Bullseye');
          player.passiveMeter = 0;
          events.push({
            type: 'item_proc',
            tick: state.tick,
            itemId: 'passive:Bullseye',
            trigger: 'OnTick',
            pos: { x: picked.pos.x, y: picked.pos.y, z: picked.pos.z },
          });
        } else {
          player.passiveMeter = 1.0;
        }
      } else {
        player.passiveMeter = next;
      }
      break;
    }

    case 'Noelle': {
      // Enduring: +4% DamageMultiplier per currently frozen enemy (up to +120%)
      if (state.tick % 5 === 0) {
        let frozenCount = 0;
        for (let i = 0; i < state.enemies.length; i++) {
          if (state.enemies[i].hp > 0 && state.enemies[i].debuffs.some((d) => d.type === 'Freeze')) {
            frozenCount += 1;
          }
        }
        const bonus = Math.min(1.2, frozenCount * 0.04);
        player.passiveMeter = Math.min(1.0, frozenCount / 15);
        if (bonus > 0) {
          if (
            upsertDynamicBuff(state, 'passive:Enduring', 1.0, [
              { stat: 'DamageMultiplier', mult: bonus, sourceId: 'passive:Enduring' },
            ])
          ) {
            statsDirty = true;
          }
        } else if (removeDynamicBuff(state, 'passive:Enduring')) {
          statsDirty = true;
        }
      }
      break;
    }

    case 'Robinette': {
      // Stonks: +1% DamageMultiplier per 25 Gold in inventory (up to +120%)
      if (state.tick % 10 === 0) {
        const steps = Math.floor(player.gold / 25);
        const bonus = Math.min(1.2, Math.round(steps * 0.01 * 100) / 100);
        player.passiveMeter = Math.min(1.0, bonus / 1.2);
        if (bonus > 0) {
          if (
            upsertDynamicBuff(state, 'passive:Stonks', 1.5, [
              { stat: 'DamageMultiplier', mult: bonus, sourceId: 'passive:Stonks' },
            ])
          ) {
            statsDirty = true;
          }
        } else if (removeDynamicBuff(state, 'passive:Stonks')) {
          statsDirty = true;
        }
      }
      break;
    }

    case 'TonyMcZoom': {
      // Zap: moving charges electric ZapBar; at 100%, discharges high-voltage chain lightning!
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      const chargeGain = horizSpeed > 1.0 ? (horizSpeed * dt) / 28 : 0;
      const next = Math.min(1.0, (player.passiveMeter ?? 0) + chargeGain);
      player.passiveMeter = next;

      if (next >= 1.0) {
        const zapRangeSq = 18 * 18;
        const targets: EnemyState[] = [];
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp > 0 && distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= zapRangeSq) {
            targets.push(e);
            if (targets.length >= 5) break;
          }
        }
        if (targets.length > 0) {
          player.passiveMeter = 0;
          const zapDmg = 24 + 5 * player.level;
          events.push({
            type: 'item_proc',
            tick: state.tick,
            itemId: 'passive:Zap',
            trigger: 'OnTick',
            pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
          });
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            state.areaEffects.push({
              id: state.nextEntityId++,
              kind: 'beam',
              weaponId: 'WeaponLightningBolt',
              ownerIsPlayer: true,
              pos: { x: t.pos.x, y: t.pos.y + t.height * 0.5, z: t.pos.z },
              radius: 1.8,
              height: 8.0,
              lifeSec: 0,
              maxLifeSec: 0.25,
              tickTimer: 99,
              tickIntervalSec: 99,
              damage: zapDmg,
              element: 'Lightning',
              procCoefficient: 0.5,
            });
            applyDamageToEnemy(
              state,
              catalog,
              t,
              {
                baseDamage: zapDmg,
                element: 'Lightning',
                procCoefficient: 0.5,
                weaponId: 'passive:Zap',
                isProcDamage: true,
              },
              rng,
              events,
              { onEnemyKilled, recalcStats },
            );
          }
        }
      }
      break;
    }

    case 'Roberto': {
      // Hoarder: spawns a free loot chest on the map periodically (45s scaling down to 20s)
      const chestCd = Math.max(20.0, 45.0 - (player.level - 1) * 1.2);
      const next = (player.passiveMeter ?? 0) + dt / chestCd;
      if (next >= 1.0) {
        player.passiveMeter = 0;
        const angle = rng() * Math.PI * 2;
        const dist = 6 + rng() * 6;
        const cx = player.pos.x + Math.cos(angle) * dist;
        const cz = player.pos.z + Math.sin(angle) * dist;
        state.interactables.push({
          id: state.nextEntityId++,
          kind: 'Chest',
          variant: 'free',
          pos: { x: cx, y: player.pos.y, z: cz },
          radius: 3.4,
          used: false,
          active: true,
          chargeProgress: 0,
          chargeDurationSec: 0,
          costGold: 0,
        });
        state.activeBannerText = 'HOARDER: FREE CHEST SPAWNED NEARBY!';
        events.push({
          type: 'item_proc',
          tick: state.tick,
          itemId: 'passive:Hoarder',
          trigger: 'OnTick',
          pos: { x: cx, y: player.pos.y, z: cz },
        });
      } else {
        player.passiveMeter = next;
      }
      break;
    }

    default:
      break;
  }

  if (statsDirty) {
    recalcStats?.();
  }
}
