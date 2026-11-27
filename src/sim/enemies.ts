import {
  ARMOR_DR_CAP,
  EVASION_CAP,
  type EnemyState,
  type GameCatalog,
  type ITerrainSampler,
  type SimEvent,
  type SimState,
} from '../contracts/index';
import { applyDamageToEnemy, isBossLikeEnemy } from './damage';
import { dispatchItemTrigger } from './items';
import { onPlayerHurtPassive, tryTriggerMegachadFlex } from './passives';
import { handleEnemyDeath } from './weapons';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function computeArmorDR(armor: number): number {
  const a = Math.max(0, armor);
  return Math.min(ARMOR_DR_CAP, a / (a + 1.0));
}

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Lightweight spatial hash grid for fast O(N) horde separation and proximity queries (200+ enemies < 1ms).
 */
export class SpatialEnemyGrid {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly buckets = new Map<number, EnemyState[]>();

  constructor(cellSize = 6.0) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
  }

  private hashCell(cx: number, cz: number): number {
    return ((cx + 4096) << 13) | ((cz + 4096) & 0x1fff);
  }

  insert(enemy: EnemyState): void {
    const cx = Math.floor(enemy.pos.x * this.invCellSize);
    const cz = Math.floor(enemy.pos.z * this.invCellSize);
    const key = this.hashCell(cx, cz);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(enemy);
  }

  forEachNear(x: number, z: number, radius: number, cb: (enemy: EnemyState) => void): void {
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCz = Math.floor((z - radius) * this.invCellSize);
    const maxCz = Math.floor((z + radius) * this.invCellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.buckets.get(this.hashCell(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          cb(bucket[i]);
        }
      }
    }
  }

  getCellSize(): number {
    return this.cellSize;
  }
}

export function buildSpatialEnemyGrid(
  enemies: readonly EnemyState[],
  cellSize = 6.0,
): SpatialEnemyGrid {
  const grid = new SpatialEnemyGrid(cellSize);
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].hp > 0) {
      grid.insert(enemies[i]);
    }
  }
  return grid;
}

/**
 * Resolves incoming damage to the player: Flex block -> Evasion -> Armor/DR ->
 * Overheal/Shield/HP -> Thorns -> Passives -> OnHurt -> Revive / Game Over.
 */
export function applyPlayerDamage(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rawDamage: number,
  attacker: EnemyState | null,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): number {
  const player = state.player;
  if (player.dead || state.invincible || player.invulnTimer > 0 || rawDamage <= 0) {
    return 0;
  }

  const onKill = (e: EnemyState, exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  // 1. Megachad automatic Flex block before taking damage
  if (tryTriggerMegachadFlex(state, catalog, rng, events, recalcStats, onKill)) {
    return 0;
  }

  // 2. Evasion check (capped at 75%)
  const evasionChance = clamp(player.stats.Evasion, 0, EVASION_CAP);
  if (evasionChance > 0 && rng() < evasionChance) {
    player.invulnTimer = Math.max(player.invulnTimer, 0.25);
    events.push({
      type: 'player_dodge',
      tick: state.tick,
      pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    });
    dispatchItemTrigger(
      state,
      catalog,
      'OnDodge',
      { target: attacker ?? undefined, pos: { ...player.pos }, onEnemyKilled: onKill, recalcStats },
      rng,
      events,
    );
    return 0;
  }

  // 3. Armor DR + flat DamageReduction
  const armorDR = computeArmorDR(player.stats.Armor);
  const flatDR = clamp(player.stats.DamageReduction, 0, 0.6);
  let remaining = Math.max(1, rawDamage * (1 - armorDR) * (1 - flatDR));
  const totalIncoming = remaining;

  // 4. Overheal -> Shield -> HP absorption
  let blockedByShield = 0;
  if (player.overheal > 0) {
    const absorbed = Math.min(player.overheal, remaining);
    player.overheal -= absorbed;
    remaining -= absorbed;
    blockedByShield += absorbed;
  }
  if (remaining > 0 && player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining);
    player.shield -= absorbed;
    remaining -= absorbed;
    blockedByShield += absorbed;
  }
  player.shieldRegenDelay = 4.0;

  if (remaining > 0) {
    player.hp = Math.max(0, player.hp - remaining);
  }

  player.invulnTimer = Math.max(player.invulnTimer, 0.35);

  events.push({
    type: 'player_hurt',
    tick: state.tick,
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    amount: Math.round(totalIncoming * 10) / 10,
    blockedByShield: Math.round(blockedByShield * 10) / 10,
    remainingHp: Math.round(player.hp * 10) / 10,
  });

  // 5. Thorns reflection damage
  if (attacker && attacker.hp > 0 && player.stats.Thorns > 0) {
    applyDamageToEnemy(
      state,
      catalog,
      attacker,
      {
        baseDamage: player.stats.Thorns,
        element: 'Physical',
        procCoefficient: 0.25,
        weaponId: 'stat:Thorns',
        isProcDamage: true,
      },
      rng,
      events,
      { onEnemyKilled: onKill, recalcStats },
    );
  }

  // 6. Character passives (e.g. halve Calcium SpeedDemon meter) & OnHurt items
  onPlayerHurtPassive(state, recalcStats);
  dispatchItemTrigger(
    state,
    catalog,
    'OnHurt',
    {
      target: attacker ?? undefined,
      damageDealt: totalIncoming,
      pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      onEnemyKilled: onKill,
      recalcStats,
    },
    rng,
    events,
  );

  // 7. Death & Revive handling
  if (player.hp <= 0) {
    dispatchItemTrigger(
      state,
      catalog,
      'OnDeathPrevent',
      { pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z }, recalcStats },
      rng,
      events,
    );

    if (player.revivesLeft > 0) {
      player.revivesLeft -= 1;
      player.hp = Math.max(1, Math.round(player.maxHp * 0.5));
      player.shield = player.maxShield;
      player.invulnTimer = 2.5;
      // Push enemies back on revive
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        const dx = e.pos.x - player.pos.x;
        const dz = e.pos.z - player.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 12 && dist > 0.01) {
          e.vel.x += (dx / dist) * 18;
          e.vel.z += (dz / dist) * 18;
        }
      }
      events.push({
        type: 'player_revive',
        tick: state.tick,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        revivesLeft: player.revivesLeft,
      });
    } else {
      player.hp = 0;
      player.dead = true;
      events.push({
        type: 'player_death',
        tick: state.tick,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      });
      const fromPhase = state.phase;
      state.phase = 'game_over';
      events.push({
        type: 'phase_changed',
        tick: state.tick,
        from: fromPhase,
        to: 'game_over',
      });
    }
  }

  return totalIncoming;
}

function stepEnemyDebuffs(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  enemy: EnemyState,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): { frozenHard: boolean; speedFactor: number } {
  let frozenHard = false;
  let speedFactor = 1.0;
  const bossLike = isBossLikeEnemy(enemy);
  const onKill = (e: EnemyState, exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  if (enemy.stunTimer > 0) {
    enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
  }
  if (enemy.charmedTimer > 0) {
    enemy.charmedTimer = Math.max(0, enemy.charmedTimer - dt);
  }

  for (let i = enemy.debuffs.length - 1; i >= 0; i--) {
    const d = enemy.debuffs[i];
    d.remainingSec -= dt;

    if (d.type === 'Freeze') {
      if (bossLike || enemy.enemyId === 'GhostInvincible') {
        speedFactor = Math.min(speedFactor, 0.45);
      } else {
        frozenHard = true;
        speedFactor = 0;
      }
    } else if (d.type === 'Poison' || d.type === 'Burn') {
      d.tickTimerSec -= dt;
      if (d.tickTimerSec <= 0) {
        const interval = d.type === 'Burn' ? 0.4 : 0.5;
        d.tickTimerSec += interval;
        const tickDmg = Math.max(1, d.dps * d.stacks * interval);
        applyDamageToEnemy(
          state,
          catalog,
          enemy,
          {
            baseDamage: tickDmg,
            element: d.type === 'Burn' ? 'Fire' : 'Poison',
            procCoefficient: 0,
            weaponId: d.sourceWeaponId,
            isDot: true,
          },
          rng,
          events,
          { skipItemProcs: true, onEnemyKilled: onKill, recalcStats },
        );
        if (enemy.hp <= 0) break;
      }
    } else if (d.type === 'Bloodmark' && d.stacks >= 5) {
      // Detonate max-stack Bloodmark burst
      const burstDmg = Math.max(20, enemy.maxHp * (bossLike ? 0.03 : 0.14));
      enemy.debuffs.splice(i, 1);
      applyDamageToEnemy(
        state,
        catalog,
        enemy,
        {
          baseDamage: burstDmg,
          element: 'Physical',
          procCoefficient: 0,
          weaponId: 'BloodmarkBurst',
          isProcDamage: true,
        },
        rng,
        events,
        { skipItemProcs: true, onEnemyKilled: onKill, recalcStats },
      );
      if (enemy.hp <= 0) break;
      continue;
    }

    if (d.remainingSec <= 0) {
      enemy.debuffs.splice(i, 1);
      if (d.type === 'Echo' && (d.storedEchoDamage ?? 0) > 1 && enemy.hp > 0) {
        applyDamageToEnemy(
          state,
          catalog,
          enemy,
          {
            baseDamage: d.storedEchoDamage ?? 0,
            element: 'Void',
            procCoefficient: 0,
            weaponId: 'EchoDetonation',
            isProcDamage: true,
          },
          rng,
          events,
          { skipItemProcs: true, onEnemyKilled: onKill, recalcStats },
        );
      }
    }
  }

  return { frozenHard, speedFactor };
}

function spawnEntRootSpikes(
  state: SimState,
  boss: EnemyState,
  terrain: ITerrainSampler,
  rng: () => number,
): void {
  const player = state.player;
  const spikeCount = 4;
  for (let k = 0; k < spikeCount; k++) {
    const leadTime = 0.25 + k * 0.28;
    const jitterX = (rng() - 0.5) * 3.0;
    const jitterZ = (rng() - 0.5) * 3.0;
    const rawPos = {
      x: player.pos.x + player.vel.x * leadTime + jitterX,
      y: player.pos.y,
      z: player.pos.z + player.vel.z * leadTime + jitterZ,
    };
    const clamped = terrain.clampToArena(rawPos, 2);
    const sample = terrain.sample(clamped.x, clamped.z);
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'pool',
      weaponId: 'EnemyRootSpikes',
      ownerIsPlayer: false,
      pos: { x: clamped.x, y: sample.height + 0.1, z: clamped.z },
      radius: 2.9,
      height: 3.5,
      lifeSec: 0,
      maxLifeSec: 1.45,
      tickTimer: 0.85, // Clear telegraph warning before erupting
      tickIntervalSec: 1.0,
      damage: boss.damage,
      element: 'Physical',
      procCoefficient: 0,
    });
  }
}

/**
 * Steps all enemies: debuffs, fast spatial-grid horde steering & separation,
 * terrain grounding, melee/miniboss/Lil Bark RootSpikes attacks, enemy hazard pools,
 * and player health/shield regen.
 */
export function stepEnemies(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  if (state.phase !== 'playing' || state.player.dead) return;

  const player = state.player;

  // 1. Player invuln, passive HP regen, and Shield regen
  if (player.invulnTimer > 0) {
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  }
  if (player.stats.HealthRegen > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.stats.HealthRegen * dt);
  }
  if (player.shieldRegenDelay > 0) {
    player.shieldRegenDelay = Math.max(0, player.shieldRegenDelay - dt);
  } else if (player.maxShield > 0 && player.shield < player.maxShield) {
    player.shield = Math.min(
      player.maxShield,
      player.shield + Math.max(0, player.stats.ShieldRegen) * dt,
    );
  }

  // 2. Build spatial grid for O(N) separation
  const grid = buildSpatialEnemyGrid(state.enemies, 6.0);

  // Build quick EnemyDef lookup
  const defById = new Map<string, (typeof catalog.enemies)[number]>();
  for (let i = 0; i < catalog.enemies.length; i++) {
    defById.set(catalog.enemies[i].id, catalog.enemies[i]);
  }

  // 3. Step each living enemy
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.hp <= 0) continue;

    enemy.prevPos.x = enemy.pos.x;
    enemy.prevPos.y = enemy.pos.y;
    enemy.prevPos.z = enemy.pos.z;

    const { frozenHard, speedFactor } = stepEnemyDebuffs(
      state,
      catalog,
      enemy,
      dt,
      rng,
      events,
      recalcStats,
    );
    if (enemy.hp <= 0) continue;

    const def = defById.get(enemy.enemyId);
    const immobilized = frozenHard || enemy.stunTimer > 0;
    const effectiveSpeed = immobilized ? 0 : enemy.moveSpeed * speedFactor;

    // Determine steering target (player normally, or nearest enemy when Charmed)
    let targetX = player.pos.x;
    let targetZ = player.pos.z;
    let charmedTarget: EnemyState | null = null;

    if (enemy.charmedTimer > 0) {
      let bestSq = 25 * 25;
      grid.forEachNear(enemy.pos.x, enemy.pos.z, 20, (other) => {
        if (other.id === enemy.id || other.hp <= 0) return;
        const dSq = distSqXZ(enemy.pos.x, enemy.pos.z, other.pos.x, other.pos.z);
        if (dSq < bestSq) {
          bestSq = dSq;
          charmedTarget = other;
        }
      });
      if (charmedTarget) {
        targetX = (charmedTarget as EnemyState).pos.x;
        targetZ = (charmedTarget as EnemyState).pos.z;
      }
    }

    const toX = targetX - enemy.pos.x;
    const toZ = targetZ - enemy.pos.z;
    const distToTarget = Math.hypot(toX, toZ) || 0.001;

    let steerX = (toX / distToTarget) * effectiveSpeed;
    let steerZ = (toZ / distToTarget) * effectiveSpeed;

    // Spatial-grid separation force so hordes fan cleanly around the player instead of stacking on 1 pixel
    let sepX = 0;
    let sepZ = 0;
    const sepQueryR = enemy.radius * 2.4 + 1.0;
    grid.forEachNear(enemy.pos.x, enemy.pos.z, sepQueryR, (other) => {
      if (other.id === enemy.id || other.hp <= 0) return;
      const dx = enemy.pos.x - other.pos.x;
      const dz = enemy.pos.z - other.pos.z;
      const minSep = enemy.radius + other.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq > 0.0001 && dSq < minSep * minSep) {
        const d = Math.sqrt(dSq);
        const push = (minSep - d) / minSep;
        sepX += (dx / d) * push * 5.0;
        sepZ += (dz / d) * push * 5.0;
      }
    });

    if (immobilized) {
      steerX = 0;
      steerZ = 0;
    } else {
      enemy.yaw = Math.atan2(toX, toZ);
    }

    // Smooth knockback decay
    const kbDecay = Math.exp(-8.0 * dt);
    enemy.vel.x *= kbDecay;
    enemy.vel.z *= kbDecay;

    const nextX = enemy.pos.x + (steerX + sepX + enemy.vel.x) * dt;
    const nextZ = enemy.pos.z + (steerZ + sepZ + enemy.vel.z) * dt;
    const clamped = terrain.clampToArena({ x: nextX, y: enemy.pos.y, z: nextZ }, enemy.radius + 1);
    const ground = terrain.sample(clamped.x, clamped.z);

    enemy.pos.x = clamped.x;
    enemy.pos.z = clamped.z;
    if (def?.isFlying) {
      const hoverY = ground.height + 1.65 + Math.sin(state.simTimeSec * 3.2 + enemy.id) * 0.35;
      enemy.pos.y = hoverY;
    } else {
      enemy.pos.y = ground.height;
    }

    // Attack cadence
    enemy.attackTimer -= dt * (immobilized ? 0 : speedFactor);
    if (enemy.attackTimer > 0 || immobilized) continue;

    // Charmed enemy strikes other enemy
    if (charmedTarget && enemy.charmedTimer > 0) {
      const ct = charmedTarget as EnemyState;
      const reach = (def?.attackRange ?? 1.8) + ct.radius;
      if (distToTarget <= reach) {
        ct.hp = Math.max(0, ct.hp - enemy.damage);
        if (ct.hp <= 0) {
          handleEnemyDeath(state, catalog, ct, false, 'Charm', rng, events, recalcStats);
        }
        enemy.attackTimer = def?.attackCooldownSec ?? 1.0;
      }
      continue;
    }

    const attackRange = (def?.attackRange ?? 1.6) + player.capsuleRadius;

    // EntStage1 (Lil Bark) RootSpikes special attack at medium/close range
    if (enemy.enemyId === 'EntStage1' && distToTarget <= 28) {
      spawnEntRootSpikes(state, enemy, terrain, rng);
      if (distToTarget <= attackRange) {
        applyPlayerDamage(state, catalog, enemy.damage, enemy, rng, events, recalcStats);
      }
      enemy.attackTimer = def?.attackCooldownSec ?? 2.0;
      continue;
    }

    // Miniboss ground slam telegraph when closing in
    if (enemy.role === 'miniboss' && distToTarget <= attackRange + 3.0) {
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: `EnemySlam:${enemy.enemyId}`,
        ownerIsPlayer: false,
        pos: { x: enemy.pos.x, y: enemy.pos.y + 0.15, z: enemy.pos.z },
        radius: 4.5,
        height: 2.0,
        lifeSec: 0,
        maxLifeSec: 0.9,
        tickTimer: 0.55,
        tickIntervalSec: 1.0,
        damage: enemy.damage * 1.15,
        element: 'Physical',
        procCoefficient: 0,
      });
      if (distToTarget <= attackRange) {
        applyPlayerDamage(state, catalog, enemy.damage, enemy, rng, events, recalcStats);
      }
      enemy.attackTimer = def?.attackCooldownSec ?? 1.6;
      continue;
    }

    // Standard melee contact attack
    if (distToTarget <= attackRange && Math.abs(enemy.pos.y - player.pos.y) <= enemy.height + 2.0) {
      applyPlayerDamage(state, catalog, enemy.damage, enemy, rng, events, recalcStats);
      enemy.attackTimer = def?.attackCooldownSec ?? 0.9;
    }
  }

  // 4. Step enemy-owned AreaEffects (Lil Bark RootSpikes, Miniboss Slams)
  for (let i = state.areaEffects.length - 1; i >= 0; i--) {
    const ae = state.areaEffects[i];
    if (ae.ownerIsPlayer) continue;
    ae.lifeSec += dt;
    ae.tickTimer -= dt;

    if (ae.tickTimer <= 0) {
      ae.tickTimer += ae.tickIntervalSec;
      const reach = ae.radius + player.capsuleRadius;
      if (
        distSqXZ(ae.pos.x, ae.pos.z, player.pos.x, player.pos.z) <= reach * reach &&
        Math.abs(ae.pos.y - player.pos.y) <= ae.height + 1.2
      ) {
        applyPlayerDamage(state, catalog, ae.damage, null, rng, events, recalcStats);
      }
    }

    if (ae.lifeSec >= ae.maxLifeSec) {
      state.areaEffects.splice(i, 1);
    }
  }

  // 5. Compact dead enemies cleanly
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (state.enemies[i].hp <= 0) {
      state.enemies.splice(i, 1);
    }
  }
}
