import {
  MIN_COOLDOWN_SEC,
  type EnemyState,
  type GameCatalog,
  type InputFrame,
  type ITerrainSampler,
  type ProjectileState,
  type SimEvent,
  type SimState,
  type Vec3,
  type WeaponDef,
} from '../contracts/index';
import { applyDamageToEnemy } from './damage';
import { dispatchItemTrigger } from './items';

function distSq3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function computeEffectiveCooldown(
  baseCooldown: number,
  attackSpeed: number,
  cdr: number,
): number {
  const atk = Math.max(0.2, attackSpeed);
  const cdrFactor = Math.max(0.2, 1 - Math.min(0.8, Math.max(0, cdr)));
  return Math.max(MIN_COOLDOWN_SEC, (baseCooldown / atk) * cdrFactor);
}

/**
 * Forward aim direction unit vector from player yaw & pitch.
 * Aligned to standard right-handed Three.js camera forward (-sin(yaw), sin(pitch), -cos(yaw)).
 */
export function computeForwardFromLook(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

function spawnLootPickup(
  state: SimState,
  kind: SimState['pickups'][number]['kind'],
  pos: Vec3,
  value: number,
  rng: () => number,
): void {
  const angle = rng() * Math.PI * 2;
  const speed = 1.6 + rng() * 2.2;
  state.pickups.push({
    id: state.nextEntityId++,
    kind,
    pos: { x: pos.x, y: pos.y + 0.5, z: pos.z },
    vel: { x: Math.cos(angle) * speed, y: 3.8 + rng() * 1.5, z: Math.sin(angle) * speed },
    value,
    magnetized: false,
    ageSec: 0,
  });
}

/**
 * Canonical enemy death handler: updates kill stats, spawns XP/Gold/Silver/powerup drops,
 * opens BossPortal on Stage Boss defeat, emits `enemy_kill` / `boss_defeated`, and triggers `OnKill`.
 */
export function handleEnemyDeath(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  enemy: EnemyState,
  isExecute: boolean,
  weaponId: string | undefined,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  // Prevent double-processing the same corpse in one tick
  if (enemy.hp < -9000) return;
  enemy.hp = -9999;

  const def = catalog.enemies.find((e) => e.id === enemy.enemyId);
  state.player.kills += 1;
  state.summary.enemiesKilled += 1;
  if (enemy.isElite) state.summary.elitesKilled += 1;
  if (enemy.isBoss || enemy.role === 'miniboss') state.summary.bossesKilled += 1;

  if (weaponId) {
    const slot = state.player.weapons.find((w) => w.weaponId === weaponId);
    if (slot) slot.kills += 1;
  }

  events.push({
    type: 'enemy_kill',
    tick: state.tick,
    entityId: enemy.id,
    enemyId: enemy.enemyId,
    role: enemy.role,
    pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
    isExecute,
  });

  // Drop rewards
  const mult = enemy.isElite ? 3 : 1;
  const xpVal = (def?.xpValue ?? 4) * mult;
  const xpKind = xpVal >= 40 ? 'xp_large' : xpVal >= 12 ? 'xp_medium' : 'xp_small';
  spawnLootPickup(state, xpKind, enemy.pos, xpVal, rng);

  const goldVal = (def?.goldValue ?? 2) * mult;
  if (goldVal > 0 && (enemy.isElite || enemy.isBoss || enemy.role === 'miniboss' || rng() < 0.45)) {
    spawnLootPickup(state, 'gold', enemy.pos, goldVal, rng);
  }

  const silverVal = (def?.silverValue ?? 0) + (enemy.isElite ? 1 : 0);
  if (silverVal > 0) {
    spawnLootPickup(state, 'silver', enemy.pos, silverVal, rng);
  }

  // Rare powerup / health drops boosted slightly by Luck
  const dropRoll = rng();
  const luckBonus = Math.min(0.04, Math.max(0, state.player.stats.Luck) * 0.015);
  if (dropRoll < 0.018 + luckBonus) {
    spawnLootPickup(state, 'health', enemy.pos, 25, rng);
  } else if (dropRoll < 0.023 + luckBonus * 1.3) {
    const powerups: SimState['pickups'][number]['kind'][] = [
      'magnet',
      'rage',
      'haste',
      'stonks',
      'shield',
      'freeze_clock',
      'nuke',
    ];
    const kind = powerups[Math.floor(rng() * powerups.length) % powerups.length];
    spawnLootPickup(state, kind, enemy.pos, 1, rng);
  }

  // Stage boss defeat opens Boss Portal!
  if (state.stageBossId === enemy.id) {
    state.stageBossDefeated = true;
    state.bossPortalOpen = true;
    state.bossPortalPos = { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z };
    state.activeBannerText = 'BOSS DEFEATED — ENTER THE BOSS PORTAL!';
    events.push({
      type: 'boss_defeated',
      tick: state.tick,
      entityId: enemy.id,
      enemyId: enemy.enemyId,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
    });
  }

  dispatchItemTrigger(
    state,
    catalog,
    'OnKill',
    {
      target: enemy,
      weaponId,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
      onEnemyKilled: (e, exec, wid) =>
        handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats),
      recalcStats,
    },
    rng,
    events,
  );
}

function findNearestLivingEnemy(
  state: Readonly<SimState>,
  origin: Vec3,
  maxRange: number,
  excludeIds?: readonly number[],
): EnemyState | null {
  const maxSq = maxRange * maxRange;
  let best: EnemyState | null = null;
  let bestSq = maxSq;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    if (excludeIds && excludeIds.includes(e.id)) continue;
    const dSq = distSq3(origin, e.pos);
    if (dSq <= bestSq) {
      bestSq = dSq;
      best = e;
    }
  }
  return best;
}

function applyKnockback(
  enemy: EnemyState,
  fromPos: Vec3,
  knockback: number,
  playerKnockbackStat: number,
): void {
  if (knockback <= 0 || enemy.hp <= 0) return;
  const dx = enemy.pos.x - fromPos.x;
  const dz = enemy.pos.z - fromPos.z;
  const len = Math.hypot(dx, dz) || 1;
  const resistance = enemy.isBoss ? 0.15 : enemy.role === 'miniboss' ? 0.35 : 1.0;
  const impulse = knockback * 4.2 * Math.max(0.25, playerKnockbackStat) * resistance;
  enemy.vel.x += (dx / len) * impulse;
  enemy.vel.z += (dz / len) * impulse;
}

function detonateFireball(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  proj: ProjectileState,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  const def = catalog.weapons.find((w) => w.id === proj.weaponId);
  const blastRadius = (def?.areaRadius ?? 3.8) * Math.max(0.4, state.player.stats.AreaSize);

  state.areaEffects.push({
    id: state.nextEntityId++,
    kind: 'nova',
    weaponId: proj.weaponId,
    ownerIsPlayer: true,
    pos: { x: proj.pos.x, y: proj.pos.y, z: proj.pos.z },
    radius: blastRadius,
    height: 2.5,
    lifeSec: 0,
    maxLifeSec: 0.35,
    tickTimer: 99,
    tickIntervalSec: 99,
    damage: proj.damage,
    element: proj.element,
    procCoefficient: proj.procCoefficient * 0.75,
  });

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    const reach = blastRadius + e.radius;
    if (distSq3(proj.pos, e.pos) <= reach * reach) {
      applyKnockback(e, proj.pos, proj.knockback, state.player.stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        {
          baseDamage: proj.damage,
          element: proj.element,
          procCoefficient: proj.procCoefficient * 0.75,
          weaponId: proj.weaponId,
          bonusCritChance: proj.critBonus,
        },
        rng,
        events,
        {
          onEnemyKilled: (killed, exec, wid) =>
            handleEnemyDeath(state, catalog, killed, exec, wid, rng, events, recalcStats),
          recalcStats,
        },
      );
    }
  }
}

function fireSingleRevolverShot(
  state: SimState,
  def: WeaponDef,
  scaledDamage: number,
  rng: () => number,
  events: SimEvent[],
): void {
  const player = state.player;
  const origin: Vec3 = { x: player.pos.x, y: player.pos.y + 1.45, z: player.pos.z };
  const effectiveRange = def.range * Math.max(0.5, player.stats.AttackRange);
  const target = findNearestLivingEnemy(state, origin, effectiveRange);
  let dir = computeForwardFromLook(player.yaw, player.pitch * 0.4);
  if (target) {
    const dx = target.pos.x - origin.x;
    const dy = target.pos.y + target.height * 0.55 - origin.y;
    const dz = target.pos.z - origin.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dir = { x: dx / len, y: dy / len, z: dz / len };
  }

  // Slight crisp arcade spread
  const spread = (rng() - 0.5) * 0.05;
  const cosS = Math.cos(spread);
  const sinS = Math.sin(spread);
  const rx = dir.x * cosS - dir.z * sinS;
  const rz = dir.x * sinS + dir.z * cosS;
  const spd = def.speed * Math.max(0.4, player.stats.ProjectileSpeed);

  state.projectiles.push({
    id: state.nextEntityId++,
    weaponId: def.id,
    ownerIsPlayer: true,
    pos: { ...origin },
    prevPos: { ...origin },
    vel: { x: rx * spd, y: dir.y * spd, z: rz * spd },
    radius: def.areaRadius * Math.max(0.5, player.stats.AreaSize),
    damage: scaledDamage,
    element: def.element,
    knockback: def.knockback,
    critBonus: def.critChance,
    bouncesLeft: def.bounces + Math.max(0, Math.floor(player.stats.ProjectileBounces)),
    pierceLeft: def.pierce + Math.max(0, Math.floor(player.stats.ProjectilePierce)),
    lifeSec: 0,
    maxLifeSec: def.durationSec * Math.max(0.4, player.stats.Duration),
    procCoefficient: def.procCoefficient,
    homingTargetId: null,
    hitEntityIds: [],
  });

  events.push({
    type: 'weapon_fire',
    tick: state.tick,
    weaponId: def.id,
    pos: origin,
    dir: { x: rx, y: dir.y, z: rz },
  });
}

function fireWeaponArchetype(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  def: WeaponDef,
  slot: SimState['player']['weapons'][number],
  input: Readonly<InputFrame>,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): boolean {
  const player = state.player;
  const stats = player.stats;
  const scaledDamage = def.baseDamage + def.damagePerLevel * Math.max(0, slot.level - 1);
  const projCount = Math.max(1, def.projectiles + Math.max(0, Math.floor(stats.ProjectileCount)));
  const areaMult = Math.max(0.4, stats.AreaSize);
  const durMult = Math.max(0.4, stats.Duration);
  const rangeMult = Math.max(0.5, stats.AttackRange);
  const spdMult = Math.max(0.4, stats.ProjectileSpeed);
  const origin: Vec3 = { x: player.pos.x, y: player.pos.y + 1.4, z: player.pos.z };
  const onKill = (e: EnemyState, exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  // Burst weapon (WeaponRevolver)
  if (def.burstCount && def.burstCount > 1) {
    const totalShots = def.burstCount + Math.max(0, Math.floor(stats.ProjectileCount));
    fireSingleRevolverShot(state, def, scaledDamage, rng, events);
    slot.burstRemaining = Math.max(0, totalShots - 1);
    slot.burstTimer = def.burstIntervalSec ?? 0.07;
    return true;
  }

  switch (def.archetype) {
    case 'explosive': {
      // WeaponFireStaff: glowing explosive fireballs
      const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
      const baseDir = target
        ? (() => {
            const dx = target.pos.x - origin.x;
            const dy = target.pos.y + target.height * 0.5 - origin.y;
            const dz = target.pos.z - origin.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            return { x: dx / len, y: dy / len, z: dz / len };
          })()
        : computeForwardFromLook(player.yaw, 0);

      for (let i = 0; i < projCount; i++) {
        const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.16 : 0;
        const c = Math.cos(fan);
        const s = Math.sin(fan);
        const dx = baseDir.x * c - baseDir.z * s;
        const dz = baseDir.x * s + baseDir.z * c;
        const speed = def.speed * spdMult;
        state.projectiles.push({
          id: state.nextEntityId++,
          weaponId: def.id,
          ownerIsPlayer: true,
          pos: { ...origin },
          prevPos: { ...origin },
          vel: { x: dx * speed, y: baseDir.y * speed, z: dz * speed },
          radius: 0.7 * areaMult,
          damage: scaledDamage,
          element: def.element,
          knockback: def.knockback,
          critBonus: def.critChance,
          bouncesLeft: def.bounces + Math.max(0, Math.floor(stats.ProjectileBounces)),
          pierceLeft: def.pierce + Math.max(0, Math.floor(stats.ProjectilePierce)),
          lifeSec: 0,
          maxLifeSec: def.durationSec * durMult,
          procCoefficient: def.procCoefficient,
          homingTargetId: null,
          hitEntityIds: [],
        });
      }

      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
      return true;
    }

    case 'projectile': {
      // WeaponBone: ricochet bouncing bone
      const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
      const baseDir = target
        ? (() => {
            const dx = target.pos.x - origin.x;
            const dy = target.pos.y + target.height * 0.5 - origin.y;
            const dz = target.pos.z - origin.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            return { x: dx / len, y: dy / len, z: dz / len };
          })()
        : computeForwardFromLook(player.yaw, 0);

      for (let i = 0; i < projCount; i++) {
        const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.2 : 0;
        const c = Math.cos(fan);
        const s = Math.sin(fan);
        const dx = baseDir.x * c - baseDir.z * s;
        const dz = baseDir.x * s + baseDir.z * c;
        const speed = def.speed * spdMult;
        state.projectiles.push({
          id: state.nextEntityId++,
          weaponId: def.id,
          ownerIsPlayer: true,
          pos: { ...origin },
          prevPos: { ...origin },
          vel: { x: dx * speed, y: baseDir.y * speed, z: dz * speed },
          radius: def.areaRadius * areaMult,
          damage: scaledDamage,
          element: def.element,
          knockback: def.knockback,
          critBonus: def.critChance,
          bouncesLeft: def.bounces + Math.max(0, Math.floor(stats.ProjectileBounces)),
          pierceLeft: def.pierce + Math.max(0, Math.floor(stats.ProjectilePierce)),
          lifeSec: 0,
          maxLifeSec: def.durationSec * durMult,
          procCoefficient: def.procCoefficient,
          homingTargetId: null,
          hitEntityIds: [],
        });
      }

      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
      return true;
    }

    case 'melee': {
      // WeaponSword: wide 135-degree melee cleave arc
      const cleaveRange = def.range * areaMult * Math.max(0.75, rangeMult);
      const target = findNearestLivingEnemy(state, player.pos, cleaveRange + 4);
      const baseDir = target
        ? (() => {
            const dx = target.pos.x - player.pos.x;
            const dz = target.pos.z - player.pos.z;
            const len = Math.hypot(dx, dz) || 1;
            return { x: dx / len, y: 0, z: dz / len };
          })()
        : computeForwardFromLook(player.yaw, 0);

      const cosHalfCone = Math.cos((68 * Math.PI) / 180);
      for (let s = 0; s < projCount; s++) {
        const angleOffset = s === 0 ? 0 : s % 2 === 1 ? Math.PI : (s * Math.PI) / projCount;
        const ca = Math.cos(angleOffset);
        const sa = Math.sin(angleOffset);
        const sx = baseDir.x * ca - baseDir.z * sa;
        const sz = baseDir.x * sa + baseDir.z * ca;

        state.areaEffects.push({
          id: state.nextEntityId++,
          kind: 'aura',
          weaponId: def.id,
          ownerIsPlayer: true,
          pos: {
            x: player.pos.x + sx * (cleaveRange * 0.45),
            y: player.pos.y + 1.1,
            z: player.pos.z + sz * (cleaveRange * 0.45),
          },
          radius: def.areaRadius * areaMult,
          height: 1.8,
          lifeSec: 0,
          maxLifeSec: Math.min(0.35, def.durationSec),
          tickTimer: 99,
          tickIntervalSec: 99,
          damage: scaledDamage,
          element: def.element,
          procCoefficient: def.procCoefficient,
        });

        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp <= 0) continue;
          const dx = e.pos.x - player.pos.x;
          const dz = e.pos.z - player.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > cleaveRange + e.radius) continue;
          const dot = dist > 0.01 ? (dx * sx + dz * sz) / dist : 1;
          if (dot < cosHalfCone && dist > 1.8) continue;

          applyKnockback(e, player.pos, def.knockback, stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            e,
            {
              baseDamage: scaledDamage,
              element: def.element,
              procCoefficient: def.procCoefficient,
              weaponId: def.id,
              bonusCritChance: def.critChance,
              isMelee: true,
            },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }

      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
      return true;
    }

    case 'aura': {
      // WeaponAura: pulsing area ring around player
      const auraRadius = def.areaRadius * areaMult;
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'aura',
        weaponId: def.id,
        ownerIsPlayer: true,
        pos: { x: player.pos.x, y: player.pos.y + 0.5, z: player.pos.z },
        radius: auraRadius,
        height: 1.4,
        lifeSec: 0,
        maxLifeSec: Math.max(0.22, def.durationSec),
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: scaledDamage,
        element: def.element,
        procCoefficient: def.procCoefficient,
      });

      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        const reach = auraRadius + e.radius;
        if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= reach * reach) {
          applyKnockback(e, player.pos, def.knockback, stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            e,
            {
              baseDamage: scaledDamage,
              element: def.element,
              procCoefficient: def.procCoefficient,
              weaponId: def.id,
              bonusCritChance: def.critChance,
            },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }

      events.push({
        type: 'weapon_fire',
        tick: state.tick,
        weaponId: def.id,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        dir: { x: 0, y: 1, z: 0 },
      });
      return true;
    }

    case 'orbital': {
      // WeaponChunkers: orbiting rocks around player
      // Remove stale orbitals of this weapon before spawning fresh orbit set
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        if (state.projectiles[i].weaponId === def.id && state.projectiles[i].ownerIsPlayer) {
          state.projectiles.splice(i, 1);
        }
      }
      const orbitRadius = def.range * areaMult;
      const angularSpeed = def.speed * spdMult;
      const maxLife = def.durationSec * durMult;

      for (let i = 0; i < projCount; i++) {
        const angle = (i / projCount) * Math.PI * 2;
        const px = player.pos.x + Math.cos(angle) * orbitRadius;
        const py = player.pos.y + 1.25;
        const pz = player.pos.z + Math.sin(angle) * orbitRadius;
        // Encode initial angle in vel.x, angularSpeed in vel.y, orbitRadius in vel.z for orbital projectiles
        state.projectiles.push({
          id: state.nextEntityId++,
          weaponId: def.id,
          ownerIsPlayer: true,
          pos: { x: px, y: py, z: pz },
          prevPos: { x: px, y: py, z: pz },
          vel: { x: angle, y: angularSpeed, z: orbitRadius },
          radius: def.areaRadius * areaMult,
          damage: scaledDamage,
          element: def.element,
          knockback: def.knockback,
          critBonus: def.critChance,
          bouncesLeft: 0,
          pierceLeft: 999,
          lifeSec: 0,
          maxLifeSec: maxLife,
          procCoefficient: def.procCoefficient,
          homingTargetId: null,
          hitEntityIds: [],
        });
      }

      events.push({
        type: 'weapon_fire',
        tick: state.tick,
        weaponId: def.id,
        pos: origin,
        dir: { x: 1, y: 0, z: 0 },
      });
      return true;
    }

    case 'chain': {
      // WeaponLightningBolt: sky-smite + chain lightning
      const strikeRange = def.range * rangeMult;
      const eligible: EnemyState[] = [];
      const rSq = strikeRange * strikeRange;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp > 0 && distSq3(player.pos, e.pos) <= rSq) {
          eligible.push(e);
        }
      }
      if (eligible.length === 0) return false;

      const chains = def.bounces + Math.max(0, Math.floor(stats.ChainCount));
      const chainRadius = 11 * rangeMult;

      for (let strike = 0; strike < projCount; strike++) {
        if (eligible.length === 0) break;
        const pickIdx = Math.floor(rng() * eligible.length) % eligible.length;
        const primary = eligible[pickIdx];
        const visited: number[] = [primary.id];
        let curr: EnemyState | null = primary;

        for (let hop = 0; hop <= chains && curr; hop++) {
          const hopDmg = scaledDamage * Math.pow(0.86, hop);
          state.areaEffects.push({
            id: state.nextEntityId++,
            kind: 'beam',
            weaponId: def.id,
            ownerIsPlayer: true,
            pos: { x: curr.pos.x, y: curr.pos.y + curr.height * 0.5, z: curr.pos.z },
            radius: def.areaRadius * areaMult * (hop === 0 ? 1.0 : 0.65),
            height: 12.0,
            lifeSec: 0,
            maxLifeSec: 0.28,
            tickTimer: 99,
            tickIntervalSec: 99,
            damage: hopDmg,
            element: def.element,
            procCoefficient: def.procCoefficient,
          });

          applyKnockback(curr, player.pos, def.knockback * (hop === 0 ? 1 : 0.4), stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            curr,
            {
              baseDamage: hopDmg,
              element: def.element,
              procCoefficient: def.procCoefficient,
              weaponId: def.id,
              bonusCritChance: def.critChance,
            },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );

          curr = findNearestLivingEnemy(state, curr.pos, chainRadius, visited);
          if (curr) visited.push(curr.id);
        }
      }

      events.push({
        type: 'weapon_fire',
        tick: state.tick,
        weaponId: def.id,
        pos: origin,
        dir: { x: 0, y: -1, z: 0 },
      });
      return true;
    }

    case 'beam':
    default: {
      // WeaponSniper: manual crosshair aim along player lookYaw / lookPitch
      const aimDir = computeForwardFromLook(input.lookYaw, input.lookPitch);
      // Fires immediately when manual fireHeld is pressed, or auto-fires along crosshair when enemies exist
      if (!input.fireHeld && state.enemies.length === 0) return false;

      const eyePos: Vec3 = { x: player.pos.x, y: player.pos.y + 1.8, z: player.pos.z };
      const speed = Math.max(60, def.speed) * spdMult;
      const pierceTotal = def.pierce + Math.max(0, Math.floor(stats.ProjectilePierce));

      for (let i = 0; i < projCount; i++) {
        const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.04 : 0;
        const c = Math.cos(fan);
        const s = Math.sin(fan);
        const dx = aimDir.x * c - aimDir.z * s;
        const dz = aimDir.x * s + aimDir.z * c;

        state.projectiles.push({
          id: state.nextEntityId++,
          weaponId: def.id,
          ownerIsPlayer: true,
          pos: { ...eyePos },
          prevPos: { ...eyePos },
          vel: { x: dx * speed, y: aimDir.y * speed, z: dz * speed },
          radius: def.areaRadius * areaMult,
          damage: scaledDamage,
          element: def.element,
          knockback: def.knockback,
          critBonus: def.critChance,
          bouncesLeft: def.bounces + Math.max(0, Math.floor(stats.ProjectileBounces)),
          pierceLeft: pierceTotal,
          lifeSec: 0,
          maxLifeSec: def.durationSec * durMult,
          procCoefficient: def.procCoefficient,
          homingTargetId: null,
          hitEntityIds: [],
        });
      }

      // Brief rail tracer visual effect
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'beam',
        weaponId: def.id,
        ownerIsPlayer: true,
        pos: {
          x: eyePos.x + aimDir.x * 8,
          y: eyePos.y + aimDir.y * 8,
          z: eyePos.z + aimDir.z * 8,
        },
        radius: 0.45,
        height: 16,
        lifeSec: 0,
        maxLifeSec: 0.16,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: 0,
        element: def.element,
        procCoefficient: 0,
      });

      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: eyePos, dir: aimDir });
      return true;
    }
  }
}

/**
 * Fires equipped player weapons, updates all active projectiles (linear, bouncing, piercing,
 * homing, orbital Chunkers, exploding Fireballs), and advances player AreaEffects.
 */
export function stepWeapons(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  input: Readonly<InputFrame>,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  if (state.phase !== 'playing' || state.player.dead) return;

  const player = state.player;
  const stats = player.stats;
  const onKill = (e: EnemyState, exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  // 1. Step weapon cooldowns & bursts
  for (let i = 0; i < player.weapons.length; i++) {
    const slot = player.weapons[i];
    if (slot.stolenByPylonId !== null) continue;
    const def = catalog.weapons.find((w) => w.id === slot.weaponId);
    if (!def) continue;

    // Handle active burst (WeaponRevolver)
    if (slot.burstRemaining > 0) {
      slot.burstTimer -= dt;
      if (slot.burstTimer <= 0) {
        const scaledDmg = def.baseDamage + def.damagePerLevel * Math.max(0, slot.level - 1);
        fireSingleRevolverShot(state, def, scaledDmg, rng, events);
        slot.burstRemaining -= 1;
        slot.burstTimer = def.burstIntervalSec ?? 0.07;
      }
    }

    slot.cooldownTimer -= dt;
    if (slot.cooldownTimer <= 0) {
      const fired = fireWeaponArchetype(state, catalog, def, slot, input, rng, events, recalcStats);
      if (fired) {
        const lvlCd = def.cooldownSec * Math.pow(Math.max(0.5, 1 - def.cooldownScalePerLevel), Math.max(0, slot.level - 1));
        slot.cooldownTimer = computeEffectiveCooldown(lvlCd, stats.AttackSpeed, stats.CooldownReduction);

        dispatchItemTrigger(
          state,
          catalog,
          'OnWeaponFire',
          {
            weaponId: def.id,
            procCoefficient: def.procCoefficient,
            pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
            onEnemyKilled: onKill,
            recalcStats,
          },
          rng,
          events,
        );
      } else {
        slot.cooldownTimer = 0.08;
      }
    }
  }

  // 2. Step projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    proj.prevPos.x = proj.pos.x;
    proj.prevPos.y = proj.pos.y;
    proj.prevPos.z = proj.pos.z;
    proj.lifeSec += dt;

    if (proj.lifeSec >= proj.maxLifeSec) {
      if (proj.ownerIsPlayer && proj.weaponId === 'WeaponFireStaff') {
        detonateFireball(state, catalog, proj, rng, events, recalcStats);
      }
      state.projectiles.splice(i, 1);
      continue;
    }

    const isOrbital = proj.ownerIsPlayer && proj.weaponId === 'WeaponChunkers';
    if (isOrbital) {
      // vel = { x: angle, y: angularSpeed, z: orbitRadius }
      proj.vel.x += proj.vel.y * dt;
      const angle = proj.vel.x;
      const orbitR = proj.vel.z;
      proj.pos.x = player.pos.x + Math.cos(angle) * orbitR;
      proj.pos.y = player.pos.y + 1.25;
      proj.pos.z = player.pos.z + Math.sin(angle) * orbitR;

      // Periodically clear hit list every ~0.45s so orbiting rocks re-hit on next pass
      if (Math.floor((proj.lifeSec - dt) / 0.45) !== Math.floor(proj.lifeSec / 0.45)) {
        proj.hitEntityIds.length = 0;
      }
    } else {
      // Optional homing steering
      if (proj.ownerIsPlayer && proj.homingTargetId !== null) {
        const target = state.enemies.find((e) => e.id === proj.homingTargetId && e.hp > 0);
        if (target) {
          const curSpeed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 24;
          const dx = target.pos.x - proj.pos.x;
          const dy = target.pos.y + target.height * 0.5 - proj.pos.y;
          const dz = target.pos.z - proj.pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          const turn = Math.min(1, dt * 8.0);
          const nx = proj.vel.x / curSpeed + ((dx / len) - proj.vel.x / curSpeed) * turn;
          const ny = proj.vel.y / curSpeed + ((dy / len) - proj.vel.y / curSpeed) * turn;
          const nz = proj.vel.z / curSpeed + ((dz / len) - proj.vel.z / curSpeed) * turn;
          const nLen = Math.hypot(nx, ny, nz) || 1;
          proj.vel.x = (nx / nLen) * curSpeed;
          proj.vel.y = (ny / nLen) * curSpeed;
          proj.vel.z = (nz / nLen) * curSpeed;
        }
      }

      proj.pos.x += proj.vel.x * dt;
      proj.pos.y += proj.vel.y * dt;
      proj.pos.z += proj.vel.z * dt;

      // Ground terrain collision
      const ground = terrain.sample(proj.pos.x, proj.pos.z);
      if (!ground.inBounds) {
        state.projectiles.splice(i, 1);
        continue;
      }
      if (proj.pos.y < ground.height + 0.25) {
        if (proj.ownerIsPlayer && proj.weaponId === 'WeaponFireStaff') {
          proj.pos.y = ground.height + 0.25;
          detonateFireball(state, catalog, proj, rng, events, recalcStats);
          state.projectiles.splice(i, 1);
          continue;
        } else if (proj.bouncesLeft > 0) {
          proj.pos.y = ground.height + 0.35;
          proj.vel.y = Math.abs(proj.vel.y) * 0.75 + 2.5;
          proj.bouncesLeft -= 1;
        } else if (proj.weaponId !== 'WeaponSniper') {
          state.projectiles.splice(i, 1);
          continue;
        } else {
          // Sniper rail skims above terrain
          proj.pos.y = ground.height + 0.5;
        }
      }
    }

    if (!proj.ownerIsPlayer) continue;

    // Player projectile vs enemies collision (swept midpoint + endpoint check for fast sniper/revolver)
    let consumed = false;
    const midX = (proj.prevPos.x + proj.pos.x) * 0.5;
    const midY = (proj.prevPos.y + proj.pos.y) * 0.5;
    const midZ = (proj.prevPos.z + proj.pos.z) * 0.5;

    for (let j = 0; j < state.enemies.length; j++) {
      const e = state.enemies[j];
      if (e.hp <= 0) continue;
      if (proj.hitEntityIds.includes(e.id)) continue;

      const hitR = proj.radius + e.radius + 0.2;
      const hitRSq = hitR * hitR;
      const enemyCenterY = e.pos.y + e.height * 0.5;

      const dEndSq =
        (proj.pos.x - e.pos.x) ** 2 +
        (proj.pos.y - enemyCenterY) ** 2 +
        (proj.pos.z - e.pos.z) ** 2;
      const dMidSq =
        (midX - e.pos.x) ** 2 +
        (midY - enemyCenterY) ** 2 +
        (midZ - e.pos.z) ** 2;

      if (dEndSq > hitRSq && dMidSq > hitRSq) continue;

      proj.hitEntityIds.push(e.id);

      // Fireball explodes on impact
      if (proj.weaponId === 'WeaponFireStaff') {
        detonateFireball(state, catalog, proj, rng, events, recalcStats);
        consumed = true;
        break;
      }

      applyKnockback(e, proj.pos, proj.knockback, stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        {
          baseDamage: proj.damage,
          element: proj.element,
          procCoefficient: proj.procCoefficient,
          weaponId: proj.weaponId,
          bonusCritChance: proj.critBonus,
        },
        rng,
        events,
        { onEnemyKilled: onKill, recalcStats },
      );

      // Ricochet bounce toward next nearest enemy (WeaponBone)
      if (!isOrbital && proj.bouncesLeft > 0) {
        proj.bouncesLeft -= 1;
        const nextTarget = findNearestLivingEnemy(state, e.pos, 18, [e.id]);
        const spd = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 22;
        if (nextTarget) {
          const dx = nextTarget.pos.x - proj.pos.x;
          const dy = nextTarget.pos.y + nextTarget.height * 0.5 - proj.pos.y;
          const dz = nextTarget.pos.z - proj.pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          proj.vel.x = (dx / len) * spd;
          proj.vel.y = (dy / len) * spd;
          proj.vel.z = (dz / len) * spd;
          // Allow bouncing back to earlier enemies later in the chain
          proj.hitEntityIds = [e.id];
        } else {
          // Reflect horizontally if no bounce target nearby
          proj.vel.x = -proj.vel.x;
          proj.vel.z = -proj.vel.z;
        }
        break;
      }

      if (!isOrbital) {
        if (proj.pierceLeft > 0) {
          proj.pierceLeft -= 1;
        } else {
          consumed = true;
          break;
        }
      }
    }

    if (consumed) {
      state.projectiles.splice(i, 1);
    }
  }

  // 3. Advance player-owned AreaEffects (expire finished VFX / periodic pools)
  for (let i = state.areaEffects.length - 1; i >= 0; i--) {
    const ae = state.areaEffects[i];
    if (!ae.ownerIsPlayer) continue;
    ae.lifeSec += dt;
    if (ae.weaponId === 'WeaponAura') {
      ae.pos.x = player.pos.x;
      ae.pos.y = player.pos.y + 0.5;
      ae.pos.z = player.pos.z;
    }
    if (ae.lifeSec >= ae.maxLifeSec) {
      state.areaEffects.splice(i, 1);
    }
  }
}
