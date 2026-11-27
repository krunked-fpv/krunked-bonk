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
import { applyDamageToEnemy, applyDebuffToEnemy } from './damage';
import { dispatchItemTrigger } from './items';
import { onEnemyKilledPassive } from './passives';

const PERMANENT_BUFF_SEC = 999999;

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
  const safeBase = baseCooldown > 0 ? baseCooldown : 0.24;
  const atk = Math.max(0.2, attackSpeed);
  const cdrFactor = Math.max(0.2, 1 - Math.min(0.8, Math.max(0, cdr)));
  return Math.max(MIN_COOLDOWN_SEC, (safeBase / atk) * cdrFactor);
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

function addPermanentBuffDelta(
  state: SimState,
  buffId: string,
  stat: 'MaxHealth' | 'CritChance',
  flatDelta: number,
  recalcStats?: () => void,
): void {
  const existing = state.player.buffs.find((b) => b.id === buffId);
  if (existing && existing.modifiers[0]) {
    existing.modifiers[0].flat = (existing.modifiers[0].flat ?? 0) + flatDelta;
  } else {
    state.player.buffs.push({
      id: buffId,
      remainingSec: PERMANENT_BUFF_SEC,
      modifiers: [{ stat, flat: flatDelta, sourceId: buffId }],
    });
  }
  recalcStats?.();
}

/**
 * WeaponAegis active shield block: if the player has an active orbiting Aegis shield,
 * consumes 1 shield stack, negates incoming damage, and releases a Holy knockback shockwave!
 */
export function tryBlockWithAegis(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  onEnemyKilled?: (enemy: EnemyState, isExecute: boolean, weaponId?: string) => void,
): boolean {
  const idx = state.projectiles.findIndex(
    (p) => p.ownerIsPlayer && p.weaponId === 'WeaponAegis',
  );
  if (idx < 0) return false;

  const orb = state.projectiles[idx];
  state.projectiles.splice(idx, 1);

  const player = state.player;
  player.invulnTimer = Math.max(player.invulnTimer, 0.55);
  const waveRadius = 7.5 * Math.max(0.5, player.stats.AreaSize);
  const waveDmg = orb.damage * 1.8;

  state.areaEffects.push({
    id: state.nextEntityId++,
    kind: 'nova',
    weaponId: 'WeaponAegis',
    ownerIsPlayer: true,
    pos: { x: player.pos.x, y: player.pos.y + 0.8, z: player.pos.z },
    radius: waveRadius,
    height: 2.5,
    lifeSec: 0,
    maxLifeSec: 0.4,
    tickTimer: 99,
    tickIntervalSec: 99,
    damage: waveDmg,
    element: 'Holy',
    procCoefficient: 1.0,
  });

  events.push({
    type: 'item_proc',
    tick: state.tick,
    itemId: 'WeaponAegis',
    trigger: 'OnBlock',
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
  });

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= (waveRadius + e.radius) ** 2) {
      applyKnockback(e, player.pos, orb.knockback * 2.2, player.stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        {
          baseDamage: waveDmg,
          element: 'Holy',
          procCoefficient: 1.0,
          weaponId: 'WeaponAegis',
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
 * Canonical enemy death handler: updates kill stats, weapon kill procs (BloodMagic MaxHP,
 * Scythe Elite Mega-Reap charge), character passives (Amog Plague, Bandit Flowstate, Vlad Vampire),
 * CryptKey drop, Big Bob & FinalBoss Victory transitions, Stage Boss Portal opening, and `OnKill`.
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

  // WeaponBloodMagic: 5% (+Luck) chance on kill to permanently gain +1 MaxHP!
  if (weaponId === 'WeaponBloodMagic' || state.player.weapons.some((w) => w.weaponId === 'WeaponBloodMagic')) {
    const bloodChance = weaponId === 'WeaponBloodMagic' ? 0.05 : 0.025;
    if (rng() < Math.min(0.25, bloodChance * (1 + Math.max(0, state.player.stats.Luck) * 0.2))) {
      addPermanentBuffDelta(state, 'weapon:BloodMagicHp', 'MaxHealth', 1, recalcStats);
    }
  }

  // WeaponScythe: slaying an Elite/Miniboss charges Mega-Reap!
  if (
    (enemy.isElite || enemy.role === 'miniboss') &&
    state.player.weapons.some((w) => w.weaponId === 'WeaponScythe')
  ) {
    const existing = state.player.buffs.find((b) => b.id === 'weapon:ScytheMegaCharge');
    if (existing) {
      existing.remainingSec = 15.0;
    } else {
      state.player.buffs.push({
        id: 'weapon:ScytheMegaCharge',
        remainingSec: 15.0,
        modifiers: [{ stat: 'AreaSize', add: 0.1, sourceId: 'weapon:Scythe' }],
      });
      recalcStats?.();
    }
  }

  // BoomerSpider explodes in an enemy Fire hazard nova on death!
  if (enemy.enemyId === 'BoomerSpider') {
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'nova',
      weaponId: 'EnemyBoomerBlast',
      ownerIsPlayer: false,
      pos: { x: enemy.pos.x, y: enemy.pos.y + 0.5, z: enemy.pos.z },
      radius: 4.0,
      height: 2.2,
      lifeSec: 0,
      maxLifeSec: 0.45,
      tickTimer: 0.15,
      tickIntervalSec: 1.0,
      damage: enemy.damage * 1.25,
      element: 'Fire',
      procCoefficient: 0,
    });
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

  // Graveyard Gary (GhostGrave4) drops the Crypt Key!
  if (enemy.enemyId === 'GhostGrave4' && !state.player.hasCryptKey) {
    spawnLootPickup(state, 'crypt_key', enemy.pos, 1, rng);
    state.activeBannerText = 'CRYPT KEY DROPPED! UNLOCK THE CRYPT TO FACE BIG BOB!';
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

  // Big Bob (GhostKing) or Final Boss (FinalBoss) defeat => VICTORY!
  if (enemy.enemyId === 'GhostKing' || state.bigBobId === enemy.id) {
    state.darknessActive = false;
    state.darknessLamps.length = 0;
    state.stageBossDefeated = true;
    const victorySilver = Math.round(60 * Math.max(1, state.player.stats.SilverMultiplier));
    state.player.silverEarned += victorySilver;
    state.activeBannerText = 'BIG BOB DEFEATED — GRAVEYARD CONQUERED!';
    events.push({
      type: 'boss_defeated',
      tick: state.tick,
      entityId: enemy.id,
      enemyId: enemy.enemyId,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
    });
    const from = state.phase;
    if (from !== 'victory') {
      state.phase = 'victory';
      events.push({ type: 'phase_changed', tick: state.tick, from, to: 'victory' });
    }
  } else if (enemy.enemyId === 'FinalBoss' || state.finalBossId === enemy.id) {
    state.stageBossDefeated = true;
    // Reclaim any remaining weapons just in case
    for (let i = 0; i < state.player.weapons.length; i++) {
      state.player.weapons[i].stolenByPylonId = null;
    }
    const victorySilver = Math.round(100 * Math.max(1, state.player.stats.SilverMultiplier));
    state.player.silverEarned += victorySilver;
    state.activeBannerText = 'CITADEL OVERLORD VANQUISHED — TOTAL VICTORY!';
    events.push({
      type: 'boss_defeated',
      tick: state.tick,
      entityId: enemy.id,
      enemyId: enemy.enemyId,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
    });
    const from = state.phase;
    if (from !== 'victory') {
      state.phase = 'victory';
      events.push({ type: 'phase_changed', tick: state.tick, from, to: 'victory' });
    }
  } else if (state.stageBossId === enemy.id || enemy.role === 'stage_boss') {
    // Wait until all cursed extra stage bosses are dead before opening BossPortal
    const otherStageBossAlive = state.enemies.some(
      (e) => e.id !== enemy.id && e.hp > 0 && e.role === 'stage_boss',
    );
    events.push({
      type: 'boss_defeated',
      tick: state.tick,
      entityId: enemy.id,
      enemyId: enemy.enemyId,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
    });
    if (!otherStageBossAlive) {
      state.stageBossDefeated = true;
      state.bossPortalOpen = true;
      state.bossPortalPos = { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z };
      const nextLabel =
        state.mapId === 'Forest' || state.mapId === 'Desert'
          ? state.mapTier < 3
            ? `TIER ${state.mapTier + 1}`
            : 'OBSIDIAN CITADEL'
          : 'VICTORY';
      state.activeBannerText = `BOSS DEFEATED — ENTER BOSS PORTAL TO ${nextLabel}!`;
    }
  }

  const onKillChain = (e: EnemyState, exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  // Character kill passives (Amog Plague, Bandit Flowstate, Vlad Vampire)
  onEnemyKilledPassive(state, catalog, enemy, rng, events, onKillChain, recalcStats);

  dispatchItemTrigger(
    state,
    catalog,
    'OnKill',
    {
      target: enemy,
      weaponId,
      isExecute,
      pos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
      onEnemyKilled: onKillChain,
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

function detonateExplosiveProjectile(
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

function spawnPoisonFlaskPool(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  proj: ProjectileState,
  terrain: ITerrainSampler,
): void {
  const def = catalog.weapons.find((w) => w.id === 'WeaponPoisonFlask');
  const radius = (def?.areaRadius ?? 4.4) * Math.max(0.4, state.player.stats.AreaSize);
  const dur = (def?.durationSec ?? 3.0) * Math.max(0.4, state.player.stats.Duration);
  const ground = terrain.sample(proj.pos.x, proj.pos.z);

  state.areaEffects.push({
    id: state.nextEntityId++,
    kind: 'pool',
    weaponId: 'WeaponPoisonFlask',
    ownerIsPlayer: true,
    pos: { x: proj.pos.x, y: ground.height + 0.15, z: proj.pos.z },
    radius,
    height: 1.8,
    lifeSec: 0,
    maxLifeSec: dur,
    tickTimer: 0.05,
    tickIntervalSec: 0.4,
    damage: Math.max(5, proj.damage * 4.5),
    element: 'Poison',
    procCoefficient: proj.procCoefficient * 0.7,
  });
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

function pointToSegmentDistSqXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return distSqXZ(px, pz, ax, az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return distSqXZ(px, pz, cx, cz);
}

/**
 * Distinct combat execution for ALL 30 weapons in the full retail catalog.
 */
function fireWeaponById(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  def: WeaponDef,
  slot: SimState['player']['weapons'][number],
  input: Readonly<InputFrame>,
  terrain: ITerrainSampler,
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

  // 1. Burst weapon (WeaponRevolver)
  if (def.id === 'WeaponRevolver' || (def.burstCount && def.burstCount > 1)) {
    const totalShots = Math.max(def.burstCount ?? 6, def.projectiles) + Math.max(0, Math.floor(stats.ProjectileCount));
    fireSingleRevolverShot(state, def, scaledDamage, rng, events);
    slot.burstRemaining = Math.max(0, totalShots - 1);
    slot.burstTimer = def.burstIntervalSec ?? 0.07;
    return true;
  }

  // 2. WeaponAegis — Orbiting Shield Stacks + Block Shockwave
  if (def.id === 'WeaponAegis') {
    const maxOrbs = Math.max(2, projCount);
    const activeAegis = state.projectiles.filter(
      (p) => p.ownerIsPlayer && p.weaponId === 'WeaponAegis',
    );
    if (activeAegis.length < maxOrbs) {
      const orbitRadius = def.range * areaMult;
      const angle = (activeAegis.length / maxOrbs) * Math.PI * 2 + state.simTimeSec;
      const px = player.pos.x + Math.cos(angle) * orbitRadius;
      const py = player.pos.y + 1.3;
      const pz = player.pos.z + Math.sin(angle) * orbitRadius;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponAegis',
        ownerIsPlayer: true,
        pos: { x: px, y: py, z: pz },
        prevPos: { x: px, y: py, z: pz },
        vel: { x: angle, y: def.speed * spdMult, z: orbitRadius },
        radius: 1.0 * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 999,
        lifeSec: 0,
        maxLifeSec: 999,
        procCoefficient: def.procCoefficient,
        homingTargetId: null,
        hitEntityIds: [],
      });
    } else {
      // Refresh & pulse shockwave damage when at full stacks
      const waveR = def.areaRadius * areaMult * 0.7;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= (waveR + e.radius) ** 2) {
          applyKnockback(e, player.pos, def.knockback, stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            e,
            { baseDamage: scaledDamage, element: def.element, procCoefficient: def.procCoefficient, weaponId: def.id },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: { x: 0, y: 1, z: 0 } });
    return true;
  }

  // 3. WeaponAxe — High parabolic spinning lobbed axes with AoE cleave
  if (def.id === 'WeaponAxe') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.28 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponAxe',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd * 0.72, y: 13.5, z: dz * spd * 0.72 },
        radius: 1.45 * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 99,
        lifeSec: 0,
        maxLifeSec: 1.9 * durMult,
        procCoefficient: def.procCoefficient,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 4. WeaponBananarang — Returning Boomerang piercing both ways!
  if (def.id === 'WeaponBananarang') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.22 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponBananarang',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: 0, z: dz * spd },
        radius: def.areaRadius * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 999,
        lifeSec: 0,
        maxLifeSec: def.durationSec * durMult,
        procCoefficient: def.procCoefficient,
        isBoomerang: true,
        returning: false,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 5. WeaponBlackHole — Gravity Pull Singularity Vortex!
  if (def.id === 'WeaponBlackHole') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const dir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    for (let i = 0; i < projCount; i++) {
      const offsetDist = target ? Math.min(18, Math.hypot(target.pos.x - origin.x, target.pos.z - origin.z)) : 12;
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.4 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = dir.x * c - dir.z * s;
      const dz = dir.x * s + dir.z * c;
      const rawPos = { x: player.pos.x + dx * offsetDist, y: player.pos.y, z: player.pos.z + dz * offsetDist };
      const clamped = terrain.clampToArena(rawPos, 3);
      const sample = terrain.sample(clamped.x, clamped.z);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'blackhole',
        weaponId: 'WeaponBlackHole',
        ownerIsPlayer: true,
        pos: { x: clamped.x, y: sample.height + 1.2, z: clamped.z },
        radius: def.areaRadius * areaMult,
        height: 4.0,
        lifeSec: 0,
        maxLifeSec: def.durationSec * durMult,
        tickTimer: 0.05,
        tickIntervalSec: 0.3,
        damage: scaledDamage,
        element: def.element,
        procCoefficient: def.procCoefficient,
        pullStrength: 18 * Math.max(0.6, stats.Knockback),
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir });
    return true;
  }

  // 6. WeaponBloodMagic — Erupts crimson runes under enemies (+1 MaxHP kill proc!)
  if (def.id === 'WeaponBloodMagic') {
    const strikeRange = def.range * rangeMult;
    const rSq = strikeRange * strikeRange;
    const eligible: EnemyState[] = [];
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp > 0 && distSq3(player.pos, e.pos) <= rSq) eligible.push(e);
    }
    const radius = def.areaRadius * areaMult;
    const casts = projCount;
    for (let c = 0; c < casts; c++) {
      const anchor =
        eligible.length > 0
          ? eligible[Math.floor(rng() * eligible.length) % eligible.length].pos
          : {
              x: player.pos.x + (rng() - 0.5) * 14,
              y: player.pos.y,
              z: player.pos.z + (rng() - 0.5) * 14,
            };
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: 'WeaponBloodMagic',
        ownerIsPlayer: true,
        pos: { x: anchor.x, y: anchor.y + 0.3, z: anchor.z },
        radius,
        height: 2.5,
        lifeSec: 0,
        maxLifeSec: def.durationSec,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: scaledDamage,
        element: def.element,
        procCoefficient: def.procCoefficient,
      });
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        if (distSqXZ(anchor.x, anchor.z, e.pos.x, e.pos.z) <= (radius + e.radius) ** 2) {
          applyDamageToEnemy(
            state,
            catalog,
            e,
            { baseDamage: scaledDamage, element: def.element, procCoefficient: def.procCoefficient, weaponId: 'WeaponBloodMagic' },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: { x: 0, y: 1, z: 0 } });
    return true;
  }

  // 7. WeaponBow — High-velocity piercing arrow volley
  if (def.id === 'WeaponBow') {
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
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.12 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponBow',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: baseDir.y * spd, z: dz * spd },
        radius: def.areaRadius * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: Math.max(0, Math.floor(stats.ProjectileBounces)),
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

  // 8. WeaponCorruptedSword — Front + Back dual slash scaling sharply with missing HP!
  if (def.id === 'WeaponCorruptedSword') {
    const missingHpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, 1 - player.hp / player.maxHp)) : 0;
    const corruptedDmg = scaledDamage * (1 + missingHpRatio * 1.25);
    const cleaveRange = 6.2 * areaMult;
    const target = findNearestLivingEnemy(state, player.pos, cleaveRange + 8);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - player.pos.x;
          const dz = target.pos.z - player.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    const cosHalfCone = Math.cos((65 * Math.PI) / 180);
    // Always slashes BOTH forward AND backward (+ extra fans with ProjectileCount)
    const dirs = [
      { x: baseDir.x, z: baseDir.z },
      { x: -baseDir.x, z: -baseDir.z },
    ];
    for (let extra = 1; extra < projCount; extra++) {
      const a = (extra * Math.PI) / (projCount + 1);
      dirs.push({
        x: baseDir.x * Math.cos(a) - baseDir.z * Math.sin(a),
        z: baseDir.x * Math.sin(a) + baseDir.z * Math.cos(a),
      });
    }

    for (let d = 0; d < dirs.length; d++) {
      const sd = dirs[d];
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'aura',
        weaponId: 'WeaponCorruptedSword',
        ownerIsPlayer: true,
        pos: {
          x: player.pos.x + sd.x * (cleaveRange * 0.45),
          y: player.pos.y + 1.1,
          z: player.pos.z + sd.z * (cleaveRange * 0.45),
        },
        radius: def.areaRadius * areaMult,
        height: 1.8,
        lifeSec: 0,
        maxLifeSec: 0.32,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: corruptedDmg,
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
        const dot = dist > 0.01 ? (dx * sd.x + dz * sd.z) / dist : 1;
        if (dot < cosHalfCone && dist > 1.8) continue;
        applyKnockback(e, player.pos, def.knockback, stats.Knockback);
        applyDamageToEnemy(
          state,
          catalog,
          e,
          { baseDamage: corruptedDmg, element: def.element, procCoefficient: def.procCoefficient, weaponId: def.id, isMelee: true },
          rng,
          events,
          { onEnemyKilled: onKill, recalcStats },
        );
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 9. WeaponDice — Rolls 1..6 base damage, rolling a 6 permanently boosts Crit Chance!
  if (def.id === 'WeaponDice') {
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
      const roll = 1 + (Math.floor(rng() * 6) % 6);
      const dieDamage = roll * 2.5 + Math.max(0, slot.level - 1) * def.damagePerLevel;
      if (roll === 6) {
        addPermanentBuffDelta(state, 'weapon:DiceCritSix', 'CritChance', 0.005, recalcStats);
      }
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.18 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponDice',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: baseDir.y * spd, z: dz * spd },
        radius: def.areaRadius * areaMult,
        damage: dieDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance + (roll === 6 ? 0.5 : 0),
        bouncesLeft: Math.max(0, Math.floor(stats.ProjectileBounces)),
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

  // 10. WeaponDragonsBreath — Roaring directional flamethrower cone
  if (def.id === 'WeaponDragonsBreath') {
    const coneRange = def.range * areaMult * Math.max(0.7, rangeMult);
    const target = findNearestLivingEnemy(state, player.pos, coneRange + 12);
    const dir = target
      ? (() => {
          const dx = target.pos.x - player.pos.x;
          const dz = target.pos.z - player.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    const cosHalf = Math.cos((34 * Math.PI) / 180);
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'aura',
      weaponId: 'WeaponDragonsBreath',
      ownerIsPlayer: true,
      pos: {
        x: player.pos.x + dir.x * (coneRange * 0.5),
        y: player.pos.y + 1.2,
        z: player.pos.z + dir.z * (coneRange * 0.5),
      },
      radius: coneRange * 0.55,
      height: 2.2,
      lifeSec: 0,
      maxLifeSec: Math.min(1.2, def.durationSec * durMult),
      tickTimer: 99,
      tickIntervalSec: 99,
      damage: scaledDamage,
      element: 'Fire',
      procCoefficient: def.procCoefficient,
    });

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > coneRange + e.radius) continue;
      const dot = dist > 0.01 ? (dx * dir.x + dz * dir.z) / dist : 1;
      if (dot < cosHalf && dist > 2.0) continue;
      applyKnockback(e, player.pos, def.knockback, stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        { baseDamage: scaledDamage, element: 'Fire', procCoefficient: def.procCoefficient, weaponId: 'WeaponDragonsBreath' },
        rng,
        events,
        { onEnemyKilled: onKill, recalcStats },
      );
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir });
    return true;
  }

  // 11. WeaponFlameWalker — Fire trail patches behind player
  if (def.id === 'WeaponFlameWalker') {
    const sample = terrain.sample(player.pos.x, player.pos.z);
    const radius = def.areaRadius * areaMult;
    const dur = def.durationSec * durMult;
    const patches = Math.min(4, projCount);
    for (let i = 0; i < patches; i++) {
      const ox = i === 0 ? 0 : (rng() - 0.5) * 3.0;
      const oz = i === 0 ? 0 : (rng() - 0.5) * 3.0;
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'pool',
        weaponId: 'WeaponFlameWalker',
        ownerIsPlayer: true,
        pos: { x: player.pos.x + ox, y: sample.height + 0.15, z: player.pos.z + oz },
        radius,
        height: 1.5,
        lifeSec: 0,
        maxLifeSec: dur,
        tickTimer: 0.05,
        tickIntervalSec: 0.35,
        damage: scaledDamage,
        element: 'Fire',
        procCoefficient: def.procCoefficient,
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: player.pos, dir: { x: 0, y: 1, z: 0 } });
    return true;
  }

  // 12. WeaponFrostWalker — Expanding Freeze + Shatter glacial nova!
  if (def.id === 'WeaponFrostWalker') {
    const novaR = def.areaRadius * areaMult;
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'nova',
      weaponId: 'WeaponFrostWalker',
      ownerIsPlayer: true,
      pos: { x: player.pos.x, y: player.pos.y + 0.4, z: player.pos.z },
      radius: novaR,
      height: 2.0,
      lifeSec: 0,
      maxLifeSec: Math.min(0.85, def.durationSec * durMult * 0.5),
      tickTimer: 99,
      tickIntervalSec: 99,
      damage: scaledDamage,
      element: 'Ice',
      procCoefficient: def.procCoefficient,
    });

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;
      if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= (novaR + e.radius) ** 2) {
        applyDamageToEnemy(
          state,
          catalog,
          e,
          { baseDamage: scaledDamage, element: 'Ice', procCoefficient: def.procCoefficient, weaponId: 'WeaponFrostWalker' },
          rng,
          events,
          { onEnemyKilled: onKill, recalcStats },
        );
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: player.pos, dir: { x: 0, y: 1, z: 0 } });
    return true;
  }

  // 13. WeaponHeroSword — Melee cleave + radiant piercing energy wave projectile!
  if (def.id === 'WeaponHeroSword') {
    const cleaveRange = 5.8 * areaMult;
    const target = findNearestLivingEnemy(state, player.pos, def.range * rangeMult);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - player.pos.x;
          const dz = target.pos.z - player.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    // Close cleave
    const cosHalf = Math.cos((65 * Math.PI) / 180);
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > cleaveRange + e.radius) continue;
      const dot = dist > 0.01 ? (dx * baseDir.x + dz * baseDir.z) / dist : 1;
      if (dot < cosHalf && dist > 1.8) continue;
      applyKnockback(e, player.pos, def.knockback, stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        { baseDamage: scaledDamage, element: 'Holy', procCoefficient: def.procCoefficient, weaponId: 'WeaponHeroSword', isMelee: true },
        rng,
        events,
        { onEnemyKilled: onKill, recalcStats },
      );
    }

    // Piercing sword-beam energy wave(s)
    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.2 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponHeroSword',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: 0, z: dz * spd },
        radius: 1.5 * areaMult,
        damage: scaledDamage * 0.9,
        element: 'Holy',
        knockback: def.knockback * 0.8,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 99,
        lifeSec: 0,
        maxLifeSec: 1.15 * durMult,
        procCoefficient: def.procCoefficient,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 14. WeaponKatana — Rapid iaijutsu precision slashes directly across closest enemy!
  if (def.id === 'WeaponKatana') {
    const reach = def.range * Math.max(0.7, rangeMult) * areaMult;
    const slashRadius = def.areaRadius * areaMult;
    const strikes = Math.max(1, projCount);
    const visited: number[] = [];

    for (let s = 0; s < strikes; s++) {
      const target = findNearestLivingEnemy(state, player.pos, reach, visited) ?? findNearestLivingEnemy(state, player.pos, reach);
      const slashPos: Vec3 = target
        ? { x: target.pos.x, y: target.pos.y + 1.0, z: target.pos.z }
        : {
            x: player.pos.x - Math.sin(player.yaw) * 4.5,
            y: player.pos.y + 1.1,
            z: player.pos.z - Math.cos(player.yaw) * 4.5,
          };
      if (target) visited.push(target.id);

      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'aura',
        weaponId: 'WeaponKatana',
        ownerIsPlayer: true,
        pos: slashPos,
        radius: slashRadius,
        height: 2.0,
        lifeSec: 0,
        maxLifeSec: 0.24,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: scaledDamage,
        element: 'Physical',
        procCoefficient: def.procCoefficient,
      });

      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        if (distSqXZ(slashPos.x, slashPos.z, e.pos.x, e.pos.z) <= (slashRadius + e.radius) ** 2) {
          applyKnockback(e, player.pos, def.knockback, stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            e,
            { baseDamage: scaledDamage, element: 'Physical', procCoefficient: def.procCoefficient, weaponId: 'WeaponKatana', isMelee: true },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: computeForwardFromLook(player.yaw, 0) });
    return true;
  }

  // 15. WeaponMines — Proximity landmines armed on terrain
  if (def.id === 'WeaponMines') {
    for (let i = 0; i < projCount; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = 2.0 + rng() * 4.5;
      const mx = player.pos.x + Math.cos(ang) * dist;
      const mz = player.pos.z + Math.sin(ang) * dist;
      const clamped = terrain.clampToArena({ x: mx, y: player.pos.y, z: mz }, 2);
      const sample = terrain.sample(clamped.x, clamped.z);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'mine',
        weaponId: 'WeaponMines',
        ownerIsPlayer: true,
        pos: { x: clamped.x, y: sample.height + 0.25, z: clamped.z },
        radius: def.areaRadius * areaMult,
        height: 2.0,
        lifeSec: 0,
        maxLifeSec: Math.max(4.0, def.durationSec * durMult * 2.0),
        tickTimer: 0.25, // brief arming delay
        tickIntervalSec: 0.1,
        damage: scaledDamage,
        element: 'Fire',
        procCoefficient: def.procCoefficient,
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: player.pos, dir: { x: 0, y: -1, z: 0 } });
    return true;
  }

  // 16. WeaponPoisonFlask — Lobbed flask shattering into toxic Poison pool!
  if (def.id === 'WeaponPoisonFlask') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.24 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponPoisonFlask',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: 9.5, z: dz * spd },
        radius: 0.85 * areaMult,
        damage: scaledDamage,
        element: 'Poison',
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 0,
        lifeSec: 0,
        maxLifeSec: 2.2,
        procCoefficient: def.procCoefficient,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 17. WeaponScythe — 360-degree Reap + Elite-charged Mega-Reap!
  if (def.id === 'WeaponScythe') {
    const chargeIdx = player.buffs.findIndex((b) => b.id === 'weapon:ScytheMegaCharge');
    const isMegaReap = chargeIdx >= 0;
    if (isMegaReap) {
      player.buffs.splice(chargeIdx, 1);
      recalcStats?.();
    }
    const reapR = def.areaRadius * areaMult * (isMegaReap ? 1.85 : 1.0);
    const reapDmg = scaledDamage * (isMegaReap ? 2.5 : 1.0);
    const sweeps = Math.min(3, projCount);

    for (let sw = 0; sw < sweeps; sw++) {
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: isMegaReap ? 'nova' : 'aura',
        weaponId: 'WeaponScythe',
        ownerIsPlayer: true,
        pos: { x: player.pos.x, y: player.pos.y + 1.0, z: player.pos.z },
        radius: reapR,
        height: 2.2,
        lifeSec: 0,
        maxLifeSec: isMegaReap ? 0.45 : 0.32,
        tickTimer: 99,
        tickIntervalSec: 99,
        damage: reapDmg,
        element: def.element,
        procCoefficient: def.procCoefficient,
      });

      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        if (distSqXZ(player.pos.x, player.pos.z, e.pos.x, e.pos.z) <= (reapR + e.radius) ** 2) {
          applyKnockback(e, player.pos, def.knockback * (isMegaReap ? 2.0 : 1.0), stats.Knockback);
          applyDamageToEnemy(
            state,
            catalog,
            e,
            { baseDamage: reapDmg, element: def.element, procCoefficient: def.procCoefficient, weaponId: 'WeaponScythe', isMelee: true },
            rng,
            events,
            { onEnemyKilled: onKill, recalcStats },
          );
        }
      }
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: { x: 0, y: 1, z: 0 } });
    return true;
  }

  // 18. WeaponShotgun — 5-pellet manual crosshair close-range blast!
  if (def.id === 'WeaponShotgun') {
    const aimDir = computeForwardFromLook(input.lookYaw, input.lookPitch);
    const eyePos: Vec3 = { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z };
    const pellets = 5 + Math.max(0, Math.floor(stats.ProjectileCount));
    const spd = def.speed * spdMult;

    for (let i = 0; i < pellets; i++) {
      const spreadYaw = ((i - (pellets - 1) / 2) / Math.max(1, pellets - 1)) * 0.34 + (rng() - 0.5) * 0.04;
      const spreadPitch = (rng() - 0.5) * 0.08;
      const c = Math.cos(spreadYaw);
      const s = Math.sin(spreadYaw);
      const dx = aimDir.x * c - aimDir.z * s;
      const dz = aimDir.x * s + aimDir.z * c;
      const dy = aimDir.y + spreadPitch;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponShotgun',
        ownerIsPlayer: true,
        pos: { ...eyePos },
        prevPos: { ...eyePos },
        vel: { x: dx * spd, y: dy * spd, z: dz * spd },
        radius: def.areaRadius * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: Math.max(0, Math.floor(stats.ProjectileBounces)),
        pierceLeft: def.pierce + Math.max(0, Math.floor(stats.ProjectilePierce)),
        lifeSec: 0,
        maxLifeSec: 0.45 * durMult,
        procCoefficient: def.procCoefficient * 0.5,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: eyePos, dir: aimDir });
    return true;
  }

  // 19. WeaponSluttyRocket ("Homing Rockets") — Guided homing explosive missiles!
  if (def.id === 'WeaponSluttyRocket') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const baseDir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dy = target.pos.y + target.height * 0.5 - origin.y;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          return { x: dx / len, y: dy / len, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0.1);

    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.35 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponSluttyRocket',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: Math.max(0.15, baseDir.y) * spd, z: dz * spd },
        radius: 0.7 * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: 0,
        pierceLeft: 0,
        lifeSec: 0,
        maxLifeSec: def.durationSec * durMult,
        procCoefficient: def.procCoefficient,
        homingTargetId: target ? target.id : null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // 20. WeaponSpaceNoodle — Tether beam damaging anchor target & ALL enemies in-between!
  if (def.id === 'WeaponSpaceNoodle') {
    const tetherRange = def.range * rangeMult;
    const anchor = findNearestLivingEnemy(state, origin, tetherRange);
    const endPos: Vec3 = anchor
      ? { x: anchor.pos.x, y: anchor.pos.y + anchor.height * 0.5, z: anchor.pos.z }
      : {
          x: player.pos.x - Math.sin(player.yaw) * 16,
          y: player.pos.y + 1.2,
          z: player.pos.z - Math.cos(player.yaw) * 16,
        };

    const beamHalfWidth = def.areaRadius * areaMult;
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'beam',
      weaponId: 'WeaponSpaceNoodle',
      ownerIsPlayer: true,
      pos: {
        x: (player.pos.x + endPos.x) * 0.5,
        y: (player.pos.y + endPos.y) * 0.5 + 0.6,
        z: (player.pos.z + endPos.z) * 0.5,
      },
      radius: beamHalfWidth,
      height: Math.max(2, Math.hypot(endPos.x - player.pos.x, endPos.z - player.pos.z)),
      lifeSec: 0,
      maxLifeSec: 0.45,
      tickTimer: 99,
      tickIntervalSec: 99,
      damage: scaledDamage,
      element: 'Void',
      procCoefficient: def.procCoefficient,
    });

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;
      const dSq = pointToSegmentDistSqXZ(e.pos.x, e.pos.z, player.pos.x, player.pos.z, endPos.x, endPos.z);
      if (dSq <= (beamHalfWidth + e.radius) ** 2) {
        applyDamageToEnemy(
          state,
          catalog,
          e,
          { baseDamage: scaledDamage, element: 'Void', procCoefficient: def.procCoefficient, weaponId: 'WeaponSpaceNoodle' },
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
      pos: origin,
      dir: { x: endPos.x - origin.x, y: 0, z: endPos.z - origin.z },
    });
    return true;
  }

  // 21. WeaponTornado — Roaming knockback cyclone vortex!
  if (def.id === 'WeaponTornado') {
    const target = findNearestLivingEnemy(state, origin, def.range * rangeMult);
    const dir = target
      ? (() => {
          const dx = target.pos.x - origin.x;
          const dz = target.pos.z - origin.z;
          const len = Math.hypot(dx, dz) || 1;
          return { x: dx / len, y: 0, z: dz / len };
        })()
      : computeForwardFromLook(player.yaw, 0);

    for (let i = 0; i < projCount; i++) {
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.3 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = dir.x * c - dir.z * s;
      const dz = dir.x * s + dir.z * c;
      const spawnPos = { x: player.pos.x + dx * 3.5, y: player.pos.y, z: player.pos.z + dz * 3.5 };
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'tornado',
        weaponId: 'WeaponTornado',
        ownerIsPlayer: true,
        pos: spawnPos,
        radius: def.areaRadius * areaMult,
        height: 5.0,
        lifeSec: 0,
        maxLifeSec: def.durationSec * durMult,
        tickTimer: 0.05,
        tickIntervalSec: 0.25,
        damage: scaledDamage,
        element: def.element,
        procCoefficient: def.procCoefficient,
        pullStrength: def.speed * spdMult,
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir });
    return true;
  }

  // 22. WeaponWirelessDagger — Smart homing & bouncing cyber-daggers!
  if (def.id === 'WeaponWirelessDagger') {
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
      const fan = projCount > 1 ? (i - (projCount - 1) / 2) * 0.25 : 0;
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const dx = baseDir.x * c - baseDir.z * s;
      const dz = baseDir.x * s + baseDir.z * c;
      const spd = def.speed * spdMult;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'WeaponWirelessDagger',
        ownerIsPlayer: true,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: dx * spd, y: baseDir.y * spd, z: dz * spd },
        radius: def.areaRadius * areaMult,
        damage: scaledDamage,
        element: def.element,
        knockback: def.knockback,
        critBonus: def.critChance,
        bouncesLeft: def.bounces + 1 + Math.max(0, Math.floor(stats.ProjectileBounces)),
        pierceLeft: Math.max(0, Math.floor(stats.ProjectilePierce)),
        lifeSec: 0,
        maxLifeSec: def.durationSec * durMult,
        procCoefficient: def.procCoefficient,
        homingTargetId: target ? target.id : null,
        hitEntityIds: [],
      });
    }
    events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: baseDir });
    return true;
  }

  // Archetype fallbacks covering WeaponFireStaff, WeaponBone, WeaponSword, WeaponDexecutioner,
  // WeaponAura, WeaponChunkers, WeaponLightningBolt, WeaponSniper:
  switch (def.archetype) {
    case 'explosive': {
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
      // WeaponSword & WeaponDexecutioner
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
      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: { ...player.pos }, dir: { x: 0, y: 1, z: 0 } });
      return true;
    }

    case 'orbital': {
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
      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: { x: 1, y: 0, z: 0 } });
      return true;
    }

    case 'chain': {
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

      const chains = Math.max(3, def.bounces) + Math.max(0, Math.floor(stats.ChainCount));
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
      events.push({ type: 'weapon_fire', tick: state.tick, weaponId: def.id, pos: origin, dir: { x: 0, y: -1, z: 0 } });
      return true;
    }

    case 'beam':
    default: {
      const aimDir = computeForwardFromLook(input.lookYaw, input.lookPitch);
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
 * Fires equipped player weapons (all 30 distinct mechanics), updates all active projectiles
 * (linear, lobbed gravity arcs, boomerangs, bouncing, piercing, homing, orbitals),
 * and advances player AreaEffects (pools, black holes, tornadoes, proximity mines, auras).
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
      const fired = fireWeaponById(state, catalog, def, slot, input, terrain, rng, events, recalcStats);
      if (fired) {
        const baseCd = def.cooldownSec > 0 ? def.cooldownSec : 0.24;
        const lvlCd = baseCd * Math.pow(Math.max(0.5, 1 - def.cooldownScalePerLevel), Math.max(0, slot.level - 1));
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

  // 2. Step player & enemy projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    proj.prevPos.x = proj.pos.x;
    proj.prevPos.y = proj.pos.y;
    proj.prevPos.z = proj.pos.z;
    proj.lifeSec += dt;

    if (proj.lifeSec >= proj.maxLifeSec) {
      if (proj.ownerIsPlayer && (proj.weaponId === 'WeaponFireStaff' || proj.weaponId === 'WeaponSluttyRocket')) {
        detonateExplosiveProjectile(state, catalog, proj, rng, events, recalcStats);
      } else if (proj.ownerIsPlayer && proj.weaponId === 'WeaponPoisonFlask') {
        spawnPoisonFlaskPool(state, catalog, proj, terrain);
      }
      state.projectiles.splice(i, 1);
      continue;
    }

    const isOrbital =
      proj.ownerIsPlayer && (proj.weaponId === 'WeaponChunkers' || proj.weaponId === 'WeaponAegis');
    const isLobbed =
      proj.ownerIsPlayer && (proj.weaponId === 'WeaponAxe' || proj.weaponId === 'WeaponPoisonFlask');

    if (isOrbital) {
      proj.vel.x += proj.vel.y * dt;
      const angle = proj.vel.x;
      const orbitR = proj.vel.z;
      proj.pos.x = player.pos.x + Math.cos(angle) * orbitR;
      proj.pos.y = player.pos.y + 1.25;
      proj.pos.z = player.pos.z + Math.sin(angle) * orbitR;

      if (Math.floor((proj.lifeSec - dt) / 0.45) !== Math.floor(proj.lifeSec / 0.45)) {
        proj.hitEntityIds.length = 0;
      }
    } else if (proj.isBoomerang && proj.ownerIsPlayer) {
      // WeaponBananarang: outward half, then return smoothly to player
      if (!proj.returning && proj.lifeSec >= proj.maxLifeSec * 0.42) {
        proj.returning = true;
        proj.hitEntityIds.length = 0; // Can re-hit enemies on return path!
      }
      if (proj.returning) {
        const dx = player.pos.x - proj.pos.x;
        const dy = player.pos.y + 1.2 - proj.pos.y;
        const dz = player.pos.z - proj.pos.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        if (dist < 1.8) {
          state.projectiles.splice(i, 1);
          continue;
        }
        const spd = Math.max(22, Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z));
        proj.vel.x = (dx / dist) * spd;
        proj.vel.y = (dy / dist) * spd;
        proj.vel.z = (dz / dist) * spd;
      }
      proj.pos.x += proj.vel.x * dt;
      proj.pos.y += proj.vel.y * dt;
      proj.pos.z += proj.vel.z * dt;
    } else {
      if (isLobbed) {
        proj.vel.y -= 26.0 * dt;
      }

      // Homing steering (WeaponSluttyRocket, WeaponWirelessDagger, minions, enemy homing orbs)
      if (proj.ownerIsPlayer && (proj.homingTargetId !== null || proj.weaponId === 'WeaponSluttyRocket' || proj.weaponId === 'WeaponWirelessDagger')) {
        let target =
          proj.homingTargetId !== null
            ? state.enemies.find((e) => e.id === proj.homingTargetId && e.hp > 0)
            : undefined;
        if (!target) {
          target = findNearestLivingEnemy(state, proj.pos, 32, proj.hitEntityIds) ?? undefined;
          proj.homingTargetId = target ? target.id : null;
        }
        if (target) {
          const curSpeed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 24;
          const dx = target.pos.x - proj.pos.x;
          const dy = target.pos.y + target.height * 0.5 - proj.pos.y;
          const dz = target.pos.z - proj.pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          const turnRate = proj.weaponId === 'WeaponSluttyRocket' || proj.weaponId === 'WeaponWirelessDagger' ? 11.0 : 8.0;
          const turn = Math.min(1, dt * turnRate);
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

      const ground = terrain.sample(proj.pos.x, proj.pos.z);
      if (!ground.inBounds) {
        state.projectiles.splice(i, 1);
        continue;
      }
      if (proj.pos.y < ground.height + 0.25) {
        if (proj.ownerIsPlayer && (proj.weaponId === 'WeaponFireStaff' || proj.weaponId === 'WeaponSluttyRocket' || proj.weaponId === 'WeaponAxe')) {
          proj.pos.y = ground.height + 0.25;
          detonateExplosiveProjectile(state, catalog, proj, rng, events, recalcStats);
          state.projectiles.splice(i, 1);
          continue;
        } else if (proj.ownerIsPlayer && proj.weaponId === 'WeaponPoisonFlask') {
          proj.pos.y = ground.height + 0.25;
          spawnPoisonFlaskPool(state, catalog, proj, terrain);
          state.projectiles.splice(i, 1);
          continue;
        } else if (proj.bouncesLeft > 0) {
          proj.pos.y = ground.height + 0.35;
          proj.vel.y = Math.abs(proj.vel.y) * 0.75 + 2.5;
          proj.bouncesLeft -= 1;
        } else if (proj.weaponId !== 'WeaponSniper' && proj.weaponId !== 'WeaponHeroSword' && proj.weaponId !== 'WeaponBow') {
          state.projectiles.splice(i, 1);
          continue;
        } else {
          proj.pos.y = ground.height + 0.5;
        }
      }
    }

    if (!proj.ownerIsPlayer) continue;

    // Player projectile vs enemies collision (swept midpoint + endpoint)
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

      if (proj.weaponId === 'WeaponFireStaff' || proj.weaponId === 'WeaponSluttyRocket') {
        detonateExplosiveProjectile(state, catalog, proj, rng, events, recalcStats);
        consumed = true;
        break;
      }

      if (proj.weaponId === 'WeaponPoisonFlask') {
        spawnPoisonFlaskPool(state, catalog, proj, terrain);
        consumed = true;
        break;
      }

      // Shotgun close-range bonus damage (up to 1.8x within 6m!)
      let hitDmg = proj.damage;
      if (proj.weaponId === 'WeaponShotgun') {
        const distPlayer = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        const closeFactor = Math.max(0.75, Math.min(1.8, 1.8 - distPlayer * 0.065));
        hitDmg *= closeFactor;
      }

      applyKnockback(e, proj.pos, proj.knockback, stats.Knockback);
      applyDamageToEnemy(
        state,
        catalog,
        e,
        {
          baseDamage: hitDmg,
          element: proj.element,
          procCoefficient: proj.procCoefficient,
          weaponId: proj.weaponId,
          bonusCritChance: proj.critBonus,
          isSummon: proj.weaponId.startsWith('minion:'),
        },
        rng,
        events,
        { onEnemyKilled: onKill, recalcStats },
      );

      if (!isOrbital && !proj.isBoomerang && proj.bouncesLeft > 0) {
        proj.bouncesLeft -= 1;
        const nextTarget = findNearestLivingEnemy(state, e.pos, 22, [e.id]);
        const spd = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 24;
        if (nextTarget) {
          const dx = nextTarget.pos.x - proj.pos.x;
          const dy = nextTarget.pos.y + nextTarget.height * 0.5 - proj.pos.y;
          const dz = nextTarget.pos.z - proj.pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          proj.vel.x = (dx / len) * spd;
          proj.vel.y = (dy / len) * spd;
          proj.vel.z = (dz / len) * spd;
          proj.homingTargetId = nextTarget.id;
          proj.hitEntityIds = [e.id];
        } else {
          proj.vel.x = -proj.vel.x;
          proj.vel.z = -proj.vel.z;
        }
        break;
      }

      if (!isOrbital && !proj.isBoomerang) {
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

  // 3. Advance player-owned AreaEffects (Aura, BlackHole pull, Tornado roaming, Pools, Mines, Beacon heal)
  for (let i = state.areaEffects.length - 1; i >= 0; i--) {
    const ae = state.areaEffects[i];
    if (!ae.ownerIsPlayer) continue;
    ae.lifeSec += dt;

    if (ae.weaponId === 'WeaponAura') {
      ae.pos.x = player.pos.x;
      ae.pos.y = player.pos.y + 0.5;
      ae.pos.z = player.pos.z;
    }

    // Beacon healing zone heals player while standing inside!
    if (ae.weaponId === 'item:BeaconZone') {
      ae.tickTimer -= dt;
      if (ae.tickTimer <= 0) {
        ae.tickTimer += ae.tickIntervalSec;
        if (distSqXZ(ae.pos.x, ae.pos.z, player.pos.x, player.pos.z) <= ae.radius * ae.radius) {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + ae.damage);
          const actual = player.hp - before;
          if (actual >= 1) {
            events.push({
              type: 'player_heal',
              tick: state.tick,
              pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
              amount: Math.round(actual * 10) / 10,
            });
          }
        }
      }
    } else if (ae.kind === 'blackhole') {
      // Continuously pulls non-boss enemies inward & deals periodic Void damage
      const pullR = ae.radius * 1.45;
      const pullStr = ae.pullStrength ?? 16;
      for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
        const e = state.enemies[eIdx];
        if (e.hp <= 0 || e.enemyId === 'GhostInvincible') continue;
        const dx = ae.pos.x - e.pos.x;
        const dz = ae.pos.z - e.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4 && dist <= pullR) {
          const factor = (e.isBoss ? 0.15 : 1.0) * pullStr * dt;
          e.pos.x += (dx / dist) * factor;
          e.pos.z += (dz / dist) * factor;
        }
      }
      ae.tickTimer -= dt;
      if (ae.tickTimer <= 0) {
        ae.tickTimer += ae.tickIntervalSec;
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const e = state.enemies[eIdx];
          if (e.hp <= 0) continue;
          if (distSqXZ(ae.pos.x, ae.pos.z, e.pos.x, e.pos.z) <= (ae.radius + e.radius) ** 2) {
            applyDamageToEnemy(
              state,
              catalog,
              e,
              { baseDamage: ae.damage, element: ae.element, procCoefficient: ae.procCoefficient, weaponId: ae.weaponId },
              rng,
              events,
              { onEnemyKilled: onKill, recalcStats },
            );
          }
        }
      }
    } else if (ae.kind === 'tornado') {
      // Roams toward nearest enemy, damaging & hurling enemies away!
      const nearest = findNearestLivingEnemy(state, ae.pos, 32);
      const speed = ae.pullStrength ?? 12;
      if (nearest) {
        const dx = nearest.pos.x - ae.pos.x;
        const dz = nearest.pos.z - ae.pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        ae.pos.x += (dx / dist) * speed * dt;
        ae.pos.z += (dz / dist) * speed * dt;
      } else {
        ae.pos.x += Math.cos(ae.id + ae.lifeSec * 2) * speed * 0.5 * dt;
        ae.pos.z += Math.sin(ae.id + ae.lifeSec * 2) * speed * 0.5 * dt;
      }
      const g = terrain.sample(ae.pos.x, ae.pos.z);
      ae.pos.y = g.height + 0.5;

      ae.tickTimer -= dt;
      if (ae.tickTimer <= 0) {
        ae.tickTimer += ae.tickIntervalSec;
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const e = state.enemies[eIdx];
          if (e.hp <= 0) continue;
          if (distSqXZ(ae.pos.x, ae.pos.z, e.pos.x, e.pos.z) <= (ae.radius + e.radius) ** 2) {
            applyKnockback(e, ae.pos, 3.0, stats.Knockback);
            applyDamageToEnemy(
              state,
              catalog,
              e,
              { baseDamage: ae.damage, element: ae.element, procCoefficient: ae.procCoefficient, weaponId: ae.weaponId },
              rng,
              events,
              { onEnemyKilled: onKill, recalcStats },
            );
          }
        }
      }
    } else if (ae.kind === 'mine') {
      // Proximity mine detonation when an enemy enters trigger radius
      ae.tickTimer -= dt;
      if (ae.tickTimer <= 0) {
        ae.tickTimer += ae.tickIntervalSec;
        const triggerR = Math.max(2.6, ae.radius * 0.6);
        let triggered = false;
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const e = state.enemies[eIdx];
          if (e.hp <= 0) continue;
          if (distSqXZ(ae.pos.x, ae.pos.z, e.pos.x, e.pos.z) <= (triggerR + e.radius) ** 2) {
            triggered = true;
            break;
          }
        }
        if (triggered) {
          // Detonate mine!
          state.areaEffects.push({
            id: state.nextEntityId++,
            kind: 'nova',
            weaponId: 'WeaponMines',
            ownerIsPlayer: true,
            pos: { ...ae.pos },
            radius: ae.radius,
            height: 3.0,
            lifeSec: 0,
            maxLifeSec: 0.35,
            tickTimer: 99,
            tickIntervalSec: 99,
            damage: ae.damage,
            element: 'Fire',
            procCoefficient: ae.procCoefficient,
          });
          for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
            const e = state.enemies[eIdx];
            if (e.hp <= 0) continue;
            if (distSqXZ(ae.pos.x, ae.pos.z, e.pos.x, e.pos.z) <= (ae.radius + e.radius) ** 2) {
              applyKnockback(e, ae.pos, 4.0, stats.Knockback);
              applyDamageToEnemy(
                state,
                catalog,
                e,
                { baseDamage: ae.damage * 1.4, element: 'Fire', procCoefficient: ae.procCoefficient, weaponId: 'WeaponMines' },
                rng,
                events,
                { onEnemyKilled: onKill, recalcStats },
              );
            }
          }
          state.areaEffects.splice(i, 1);
          continue;
        }
      }
    } else if (ae.kind === 'pool') {
      // FlameWalker fire trail & PoisonFlask toxic pool periodic ticks
      ae.tickTimer -= dt;
      if (ae.tickTimer <= 0) {
        ae.tickTimer += ae.tickIntervalSec;
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const e = state.enemies[eIdx];
          if (e.hp <= 0) continue;
          if (distSqXZ(ae.pos.x, ae.pos.z, e.pos.x, e.pos.z) <= (ae.radius + e.radius) ** 2) {
            if (ae.weaponId === 'WeaponPoisonFlask') {
              applyDebuffToEnemy(state, catalog, e, 'Poison', 4.5, Math.max(6, ae.damage * 0.8), rng, events, 'WeaponPoisonFlask', 1, false, 1);
            }
            applyDamageToEnemy(
              state,
              catalog,
              e,
              { baseDamage: ae.damage, element: ae.element, procCoefficient: ae.procCoefficient, weaponId: ae.weaponId },
              rng,
              events,
              { onEnemyKilled: onKill, recalcStats },
            );
          }
        }
      }
    }

    if (ae.lifeSec >= ae.maxLifeSec) {
      state.areaEffects.splice(i, 1);
    }
  }
}
