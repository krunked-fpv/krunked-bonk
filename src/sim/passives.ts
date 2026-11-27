import type {
  EnemyState,
  GameCatalog,
  SimEvent,
  SimState,
} from '../contracts/index';
import { applyDamageToEnemy } from './damage';

const PERMANENT_BUFF_THRESHOLD_SEC = 900000;

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
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
  const existing = player.buffs.find((b) => b.id === buffId);
  const mods = [
    { stat: 'DamageMultiplier' as const, mult: 0.35, sourceId: buffId },
    { stat: 'Knockback' as const, add: 0.5, sourceId: buffId },
  ];
  if (existing) {
    existing.remainingSec = 4.0;
    existing.modifiers = mods;
  } else {
    player.buffs.push({ id: buffId, remainingSec: 4.0, modifiers: mods });
  }
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

  const rSq = radius * radius;
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.hp <= 0) continue;
    const dSq = distSqXZ(player.pos.x, player.pos.z, enemy.pos.x, enemy.pos.z);
    if (dSq <= (radius + enemy.radius) * (radius + enemy.radius) && dSq <= rSq + 25) {
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
 * Called whenever the player takes HP/Shield damage (after evasion & Flex block checks).
 * Halves Calcium's SpeedDemon momentum meter immediately.
 */
export function onPlayerHurtPassive(state: SimState, recalcStats?: () => void): void {
  const player = state.player;
  if (state.characterId === 'Calcium') {
    const halved = Math.max(0, (player.passiveMeter ?? 0) * 0.5);
    player.passiveMeter = halved;
    const q = Math.round(halved * 50) / 50;
    const buff = player.buffs.find((b) => b.id === 'passive:SpeedDemon');
    if (buff) {
      buff.modifiers = [
        { stat: 'MoveSpeed', add: 0.5 * q, sourceId: 'passive:SpeedDemon' },
        { stat: 'DamageMultiplier', mult: 0.4 * q, sourceId: 'passive:SpeedDemon' },
      ];
      buff.remainingSec = 1.0;
    }
    recalcStats?.();
  }
}

/**
 * Steps active character passives & timed player buffs every fixed tick.
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

  // Tick and expire temporary buffs (preserve permanent shrine/blessing buffs >= 900000s)
  for (let i = player.buffs.length - 1; i >= 0; i--) {
    const buff = player.buffs[i];
    if (buff.remainingSec >= PERMANENT_BUFF_THRESHOLD_SEC) continue;
    buff.remainingSec -= dt;
    if (buff.remainingSec <= 0) {
      player.buffs.splice(i, 1);
      statsDirty = true;
    }
  }

  switch (state.characterId) {
    case 'Fox': {
      // RngBlessing (+0.02 Luck/lvl handled in recalculatePlayerStats via perLevelMods)
      player.passiveMeter = Math.round(((player.level - 1) * 0.02) * 1000) / 1000;
      break;
    }

    case 'SirOofie': {
      // Reinforced (+0.03 Armor/lvl handled in recalculatePlayerStats via perLevelMods)
      player.passiveMeter = Math.round(((player.level - 1) * 0.03) * 1000) / 1000;
      break;
    }

    case 'Calcium': {
      // SpeedDemon: ramps up while moving up to +0.50 MoveSpeed & +40% bonus damage; halved on hurt
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      const prevMeter = player.passiveMeter ?? 0;
      const nextMeter =
        horizSpeed > 1.5
          ? Math.min(1.0, prevMeter + dt * 0.1)
          : Math.max(0.0, prevMeter - dt * 0.08);
      player.passiveMeter = nextMeter;

      const prevQ = Math.round(prevMeter * 50) / 50;
      const nextQ = Math.round(nextMeter * 50) / 50;
      const buffId = 'passive:SpeedDemon';
      const existing = player.buffs.find((b) => b.id === buffId);

      if (nextQ > 0) {
        if (!existing) {
          player.buffs.push({
            id: buffId,
            remainingSec: 1.0,
            modifiers: [
              { stat: 'MoveSpeed', add: 0.5 * nextQ, sourceId: buffId },
              { stat: 'DamageMultiplier', mult: 0.4 * nextQ, sourceId: buffId },
            ],
          });
          statsDirty = true;
        } else {
          existing.remainingSec = 1.0;
          if (nextQ !== prevQ) {
            existing.modifiers = [
              { stat: 'MoveSpeed', add: 0.5 * nextQ, sourceId: buffId },
              { stat: 'DamageMultiplier', mult: 0.4 * nextQ, sourceId: buffId },
            ];
            statsDirty = true;
          }
        }
      } else if (existing) {
        const idx = player.buffs.indexOf(existing);
        if (idx >= 0) player.buffs.splice(idx, 1);
        statsDirty = true;
      }
      break;
    }

    case 'Megachad': {
      // Flex: cooldown decreases with level; fires automatically when an enemy enters close range
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
          statsDirty = false; // already recalculated inside tryTriggerMegachadFlex
        }
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
