import {
  FINAL_BOSS_PYLON_COUNT,
  type BossPylonState,
  type EnemyState,
  type GameCatalog,
  type ITerrainSampler,
  type SimEvent,
  type SimState,
  type Vec3,
} from '../contracts/index';

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Ensures the 11 Boss Pylons exist on FinalBossMap. Initially inactive until 75% HP shield phase.
 */
export function ensureFinalBossPylonsInitialized(
  state: SimState,
  terrain: ITerrainSampler,
): void {
  if (state.mapId !== 'FinalBossMap') return;
  if (state.pylons.length === 0) {
    const ringRadius = 52;
    for (let i = 0; i < FINAL_BOSS_PYLON_COUNT; i++) {
      const angle = (i / FINAL_BOSS_PYLON_COUNT) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;
      const sample = terrain.sample(x, z);
      state.pylons.push({
        id: state.nextEntityId++,
        index: i,
        pos: { x, y: sample.height, z },
        radius: 4.5,
        active: false,
        cleansed: false,
        chargeProgress: 0,
        chargeDurationSec: 4.0,
        stolenWeaponSlotIndex: null,
        stolenWeaponId: null,
      });
    }
  } else {
    // Engine initializes all 11 pylons active; park them inactive until FinalBoss hits 75%/50%/25% HP phases
    const boss = state.enemies.find((e) => e.enemyId === 'FinalBoss' && e.hp > 0);
    if (!boss || boss.phaseIndex === 0) {
      for (let i = 0; i < state.pylons.length; i++) {
        if (!state.pylons[i].cleansed) {
          state.pylons[i].active = false;
        }
      }
    }
  }
}

function getPhasePylonRange(phaseIndex: number): [number, number] {
  // 3 + 4 + 4 = 11 total Boss Pylons across 75% / 50% / 25% HP phases!
  if (phaseIndex === 1) return [0, 3];
  if (phaseIndex === 2) return [3, 7];
  return [7, FINAL_BOSS_PYLON_COUNT];
}

function stealWeaponsOntoPylons(
  state: SimState,
  pylons: readonly BossPylonState[],
  events: SimEvent[],
): void {
  const player = state.player;
  const stealableSlots = player.weapons.filter((w) => w.stolenByPylonId === null);
  if (stealableSlots.length === 0) return;

  let slotCursor = 0;
  for (let i = 0; i < pylons.length && slotCursor < stealableSlots.length; i++) {
    const py = pylons[i];
    if (!py.active || py.cleansed || py.stolenWeaponSlotIndex !== null) continue;
    const slot = stealableSlots[slotCursor++];
    slot.stolenByPylonId = py.id;
    py.stolenWeaponSlotIndex = slot.slotIndex;
    py.stolenWeaponId = slot.weaponId;
    events.push({
      type: 'weapon_stolen',
      tick: state.tick,
      weaponId: slot.weaponId,
      slotIndex: slot.slotIndex,
      pylonId: py.id,
    });
  }
}

function launchFinalBossOrbs(
  state: SimState,
  boss: EnemyState,
  rng: () => number,
  mode: 'homing' | 'shooty' | 'bleed',
): void {
  const player = state.player;
  const origin: Vec3 = { x: boss.pos.x, y: boss.pos.y + boss.height * 0.65, z: boss.pos.z };
  const dx = player.pos.x - origin.x;
  const dy = player.pos.y + 1.1 - origin.y;
  const dz = player.pos.z - origin.z;
  const baseAngle = Math.atan2(dz, dx);

  if (mode === 'homing') {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + (i - 1) * 0.42;
      const spd = 16;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'FinalBossHomingOrb',
        ownerIsPlayer: false,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: Math.cos(ang) * spd, y: 0, z: Math.sin(ang) * spd },
        radius: 1.0,
        damage: boss.damage * 0.85,
        element: 'Void',
        knockback: 2.0,
        critBonus: 0,
        bouncesLeft: 0,
        pierceLeft: 0,
        lifeSec: 0,
        maxLifeSec: 4.5,
        procCoefficient: 0,
        homingTargetId: -1, // marks enemy homing toward player
        hitEntityIds: [],
      });
    }
  } else if (mode === 'shooty') {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + (i / count) * Math.PI * 2;
      const spd = 22;
      state.projectiles.push({
        id: state.nextEntityId++,
        weaponId: 'FinalBossShootyOrb',
        ownerIsPlayer: false,
        pos: { ...origin },
        prevPos: { ...origin },
        vel: { x: Math.cos(ang) * spd, y: (dy / (Math.hypot(dx, dz) || 1)) * 4, z: Math.sin(ang) * spd },
        radius: 0.85,
        damage: boss.damage * 0.7,
        element: 'Fire',
        knockback: 1.5,
        critBonus: 0,
        bouncesLeft: 0,
        pierceLeft: 0,
        lifeSec: 0,
        maxLifeSec: 3.5,
        procCoefficient: 0,
        homingTargetId: null,
        hitEntityIds: [],
      });
    }
  } else {
    // Bleed orb + meteor strikes around player!
    const count = 4;
    for (let k = 0; k < count; k++) {
      const a = rng() * Math.PI * 2;
      const r = 2 + rng() * 10;
      const mx = player.pos.x + Math.cos(a) * r;
      const mz = player.pos.z + Math.sin(a) * r;
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'nova',
        weaponId: 'FinalBossMeteor',
        ownerIsPlayer: false,
        pos: { x: mx, y: player.pos.y + 0.15, z: mz },
        radius: 4.2,
        height: 4.5,
        lifeSec: 0,
        maxLifeSec: 1.5,
        tickTimer: 0.95,
        tickIntervalSec: 1.5,
        damage: boss.damage * 1.15,
        element: 'Fire',
        procCoefficient: 0,
      });
    }
  }
}

/**
 * Steps the Final Boss multi-phase 11-Pylon encounter:
 * - At 75% / 50% / 25% HP: enters shielded pylon phase, activates phase pylons (3/4/4 = 11 total),
 *   steals player weapons onto active pylons (`weapon_stolen`), heals via pylon beam links,
 *   and launches homing/shooty/bleed orbs, meteors, and citadel goons!
 * - Cleansing all active pylons breaks invulnerability and restores stolen weapons (`weapon_reclaimed`).
 */
export function stepFinalBossEncounter(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  boss: EnemyState,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
  events: SimEvent[],
): void {
  state.finalBossId = boss.id;
  ensureFinalBossPylonsInitialized(state, terrain);

  const hpPct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;

  // Check phase transitions: 75% (Phase 1), 50% (Phase 2), 25% (Phase 3)
  let nextPhase = boss.phaseIndex;
  if (boss.phaseIndex === 0 && hpPct <= 0.75) {
    nextPhase = 1;
    boss.hp = Math.max(boss.hp, Math.round(boss.maxHp * 0.75));
  } else if (boss.phaseIndex === 1 && hpPct <= 0.5) {
    nextPhase = 2;
    boss.hp = Math.max(boss.hp, Math.round(boss.maxHp * 0.5));
  } else if (boss.phaseIndex === 2 && hpPct <= 0.25) {
    nextPhase = 3;
    boss.hp = Math.max(boss.hp, Math.round(boss.maxHp * 0.25));
  }

  if (nextPhase !== boss.phaseIndex) {
    boss.phaseIndex = nextPhase;
    const [startIdx, endIdx] = getPhasePylonRange(nextPhase);
    const phasePylons: BossPylonState[] = [];
    for (let i = startIdx; i < endIdx && i < state.pylons.length; i++) {
      const py = state.pylons[i];
      if (!py.cleansed) {
        py.active = true;
        py.chargeProgress = 0;
        phasePylons.push(py);
      }
    }
    stealWeaponsOntoPylons(state, phasePylons, events);
    boss.weaponStealCooldown = 12.0;
    state.activeBannerText = `PHASE ${nextPhase} SHIELD! CHARGE ${phasePylons.length} BOSS PYLONS TO RECLAIM WEAPONS!`;

    // Summon citadel goons during phase transition
    const goonIds = ['Skeleton', 'Ghost'];
    for (let g = 0; g < 4; g++) {
      const gid = goonIds[g % goonIds.length];
      const def = catalog.enemies.find((e) => e.id === gid);
      if (!def) continue;
      const ang = (g / 4) * Math.PI * 2 + rng();
      const gx = boss.pos.x + Math.cos(ang) * 14;
      const gz = boss.pos.z + Math.sin(ang) * 14;
      const clamped = terrain.clampToArena({ x: gx, y: boss.pos.y, z: gz }, 4);
      const sample = terrain.sample(clamped.x, clamped.z);
      state.enemies.push({
        id: state.nextEntityId++,
        enemyId: def.id,
        role: 'normal',
        pos: { x: clamped.x, y: def.isFlying ? sample.height + 1.6 : sample.height, z: clamped.z },
        prevPos: { x: clamped.x, y: sample.height, z: clamped.z },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        hp: Math.round(def.maxHp * 3),
        maxHp: Math.round(def.maxHp * 3),
        radius: def.radius,
        height: def.height,
        damage: Math.round(def.damage * 1.4),
        moveSpeed: def.moveSpeed * 1.1,
        attackTimer: 0.8,
        stunTimer: 0,
        charmedTimer: 0,
        isBoss: false,
        isElite: false,
        eliteTags: [],
        debuffs: [],
        phaseIndex: 0,
        weaponStealCooldown: 0,
      });
    }
  }

  // Count active uncleansed pylons
  const activeUncleansed = state.pylons.filter((py) => py.active && !py.cleansed);
  if (activeUncleansed.length > 0) {
    // Heal FinalBoss via pylon beam links (capped near current phase ceiling so shield phases don't re-trigger)
    const phaseCeiling =
      boss.phaseIndex === 1
        ? boss.maxHp * 0.82
        : boss.phaseIndex === 2
          ? boss.maxHp * 0.58
          : boss.maxHp * 0.35;
    const healPerSec = boss.maxHp * 0.0035 * activeUncleansed.length;
    boss.hp = Math.min(phaseCeiling, boss.hp + healPerSec * dt);

    // Periodic weapon-steal pressure if player still holds unstolen weapons while pylons are up
    boss.weaponStealCooldown -= dt;
    if (boss.weaponStealCooldown <= 0) {
      stealWeaponsOntoPylons(state, activeUncleansed, events);
      boss.weaponStealCooldown = 14.0;
    }
  }

  // Boss orb / meteor attack rotation
  if (boss.attackTimer <= 0) {
    const roll = rng();
    if (roll < 0.34) {
      launchFinalBossOrbs(state, boss, rng, 'homing');
    } else if (roll < 0.67) {
      launchFinalBossOrbs(state, boss, rng, 'shooty');
    } else {
      launchFinalBossOrbs(state, boss, rng, 'bleed');
    }
    boss.attackTimer = activeUncleansed.length > 0 ? 2.4 : 2.9;
  }
}

/**
 * Spawns 4 Darkness Lamps around the player/arena for Big Bob (`GhostKing`) Darkness Phase.
 */
export function triggerBigBobDarknessPhase(
  state: SimState,
  boss: EnemyState,
  terrain: ITerrainSampler,
): void {
  state.darknessActive = true;
  state.darknessLamps.length = 0;

  const lampCount = 4;
  const ringR = 24;
  for (let i = 0; i < lampCount; i++) {
    const angle = (i / lampCount) * Math.PI * 2 + 0.4;
    const raw: Vec3 = {
      x: state.player.pos.x + Math.cos(angle) * ringR,
      y: state.player.pos.y,
      z: state.player.pos.z + Math.sin(angle) * ringR,
    };
    const clamped = terrain.clampToArena(raw, 6);
    const sample = terrain.sample(clamped.x, clamped.z);
    state.darknessLamps.push({
      id: state.nextEntityId++,
      pos: { x: clamped.x, y: sample.height, z: clamped.z },
      radius: 4.8,
      lit: false,
      chargeProgress: 0,
    });
  }

  boss.weaponStealCooldown = 30.0;
  state.activeBannerText = 'BIG BOB INVOKES DARKNESS — CHARGE ALL 4 LAMPS TO BREAK SHIELD!';
}

/**
 * Steps Graveyard Big Bob (`GhostKing`, 500k HP) Darkness Phase & Lamp charging:
 * - Triggers Darkness at 75% / 50% / 25% HP OR every 30s cooldown.
 * - Standing in `DarknessLamp` rings charges & lights them (`2.5s` each).
 * - Lighting ALL 4 lamps shatters Darkness, stuns Big Bob, and deals 12% maxHP Radiant shatter damage!
 */
export function stepBigBobEncounter(
  state: SimState,
  boss: EnemyState,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
): void {
  state.bigBobId = boss.id;
  const hpPct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;

  // Trigger Darkness on HP phase thresholds or 30s timer
  if (!state.darknessActive) {
    boss.weaponStealCooldown -= dt;
    const phaseTrigger =
      (boss.phaseIndex === 0 && hpPct <= 0.8) ||
      (boss.phaseIndex === 1 && hpPct <= 0.55) ||
      (boss.phaseIndex === 2 && hpPct <= 0.3);

    if (phaseTrigger || (boss.weaponStealCooldown <= 0 && state.simTimeSec > 5)) {
      if (phaseTrigger) boss.phaseIndex += 1;
      triggerBigBobDarknessPhase(state, boss, terrain);
    }
  } else {
    // Step Darkness Lamp proximity charging
    const p = state.player;
    const chargeDuration = 2.5;
    let litCount = 0;

    for (let i = 0; i < state.darknessLamps.length; i++) {
      const lamp = state.darknessLamps[i];
      if (lamp.lit) {
        litCount += 1;
        continue;
      }
      if (distSqXZ(p.pos.x, p.pos.z, lamp.pos.x, lamp.pos.z) <= lamp.radius * lamp.radius) {
        lamp.chargeProgress = Math.min(chargeDuration, lamp.chargeProgress + dt);
        if (lamp.chargeProgress >= chargeDuration) {
          lamp.lit = true;
          litCount += 1;
        }
      }
    }

    if (state.darknessLamps.length > 0 && litCount >= state.darknessLamps.length) {
      // Darkness shattered!
      state.darknessActive = false;
      state.darknessLamps.length = 0;
      boss.stunTimer = Math.max(boss.stunTimer, 3.0);
      boss.weaponStealCooldown = 32.0;
      // Radiant lamp explosion chunks Big Bob so the 500k HP boss fight has thrilling counterplay!
      const shatterDmg = Math.min(boss.hp - 1, Math.round(boss.maxHp * 0.12));
      if (shatterDmg > 0) {
        boss.hp = Math.max(1, boss.hp - shatterDmg);
      }
      state.activeBannerText = 'ALL LAMPS LIT — DARKNESS SHATTERED! BIG BOB IS VULNERABLE!';
    }
  }

  // Big Bob spectral spike waves (GhostRootAttackContinous / GhostSpikesMultiple)
  if (boss.attackTimer <= 0 && boss.stunTimer <= 0) {
    const spikeCount = state.darknessActive ? 5 : 4;
    for (let k = 0; k < spikeCount; k++) {
      const lead = 0.25 + k * 0.3;
      const raw: Vec3 = {
        x: state.player.pos.x + state.player.vel.x * lead + (rng() - 0.5) * 4.5,
        y: state.player.pos.y,
        z: state.player.pos.z + state.player.vel.z * lead + (rng() - 0.5) * 4.5,
      };
      const clamped = terrain.clampToArena(raw, 2);
      const sample = terrain.sample(clamped.x, clamped.z);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'pool',
        weaponId: 'EnemyGhostSpikes',
        ownerIsPlayer: false,
        pos: { x: clamped.x, y: sample.height + 0.15, z: clamped.z },
        radius: 4.2,
        height: 4.5,
        lifeSec: 0,
        maxLifeSec: 1.5,
        tickTimer: 0.85,
        tickIntervalSec: 1.0,
        damage: boss.damage * 0.85,
        element: 'Void',
        procCoefficient: 0,
      });
    }
    boss.attackTimer = 3.2;
  }
}

/**
 * Executes biome boss & miniboss signature attacks (Forest Ent1..3 RootSpikes,
 * Desert Pharaoh1..3 SandPillars & Solar Lasers, Graveyard CalciumDad/Ghostham,
 * Desert Scorpion/SandGolem, and ranged enemies CactusShooter/Bush).
 */
export function executeSpecialEnemyAttack(
  state: SimState,
  enemy: EnemyState,
  distToTarget: number,
  terrain: ITerrainSampler,
  rng: () => number,
): boolean {
  const player = state.player;

  // Forest Ent Stage Bosses (EntStage1 / EntStage2 / EntStage3)
  if (
    (enemy.enemyId === 'EntStage1' || enemy.enemyId === 'EntStage2' || enemy.enemyId === 'EntStage3') &&
    distToTarget <= 34
  ) {
    const tier = enemy.enemyId === 'EntStage3' ? 3 : enemy.enemyId === 'EntStage2' ? 2 : 1;
    const spikeCount = 3 + tier;
    for (let k = 0; k < spikeCount; k++) {
      const leadTime = 0.22 + k * 0.26;
      const rawPos = {
        x: player.pos.x + player.vel.x * leadTime + (rng() - 0.5) * 3.0,
        y: player.pos.y,
        z: player.pos.z + player.vel.z * leadTime + (rng() - 0.5) * 3.0,
      };
      const clamped = terrain.clampToArena(rawPos, 2);
      const sample = terrain.sample(clamped.x, clamped.z);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'pool',
        weaponId: 'EnemyRootSpikes',
        ownerIsPlayer: false,
        pos: { x: clamped.x, y: sample.height + 0.1, z: clamped.z },
        radius: 2.8 + tier * 0.45,
        height: 3.8,
        lifeSec: 0,
        maxLifeSec: 1.45,
        tickTimer: 0.82,
        tickIntervalSec: 1.0,
        damage: enemy.damage,
        element: tier === 3 ? 'Fire' : 'Physical',
        procCoefficient: 0,
      });
    }
    return true;
  }

  // Desert Pharaoh Stage Bosses (Pharaoh1 / Pharaoh2 / Pharaoh3) — SandPillars + Solar Laser!
  if (
    (enemy.enemyId === 'Pharaoh1' || enemy.enemyId === 'Pharaoh2' || enemy.enemyId === 'Pharaoh3') &&
    distToTarget <= 45
  ) {
    const roll = rng();
    if (roll < 0.65) {
      // DesertPillarsPredictiveMultiple / Circles
      const pillarCount = 5;
      for (let k = 0; k < pillarCount; k++) {
        const ang = (k / pillarCount) * Math.PI * 2 + rng() * 0.4;
        const r = k === 0 ? 0 : 5.5;
        const rawPos = {
          x: player.pos.x + player.vel.x * 0.4 + Math.cos(ang) * r,
          y: player.pos.y,
          z: player.pos.z + player.vel.z * 0.4 + Math.sin(ang) * r,
        };
        const clamped = terrain.clampToArena(rawPos, 2);
        const sample = terrain.sample(clamped.x, clamped.z);
        state.areaEffects.push({
          id: state.nextEntityId++,
          kind: 'nova',
          weaponId: 'EnemySandPillar',
          ownerIsPlayer: false,
          pos: { x: clamped.x, y: sample.height + 0.1, z: clamped.z },
          radius: 3.8,
          height: 6.0,
          lifeSec: 0,
          maxLifeSec: 1.5,
          tickTimer: 0.9,
          tickIntervalSec: 1.5,
          damage: enemy.damage * 0.85,
          element: 'Holy',
          procCoefficient: 0,
        });
      }
    } else {
      // LaserDisco / Solar Beam volley
      const count = 6;
      const baseAng = Math.atan2(player.pos.z - enemy.pos.z, player.pos.x - enemy.pos.x);
      for (let k = 0; k < count; k++) {
        const ang = baseAng + (k / count) * Math.PI * 2;
        state.projectiles.push({
          id: state.nextEntityId++,
          weaponId: 'EnemyPharaohLaser',
          ownerIsPlayer: false,
          pos: { x: enemy.pos.x, y: enemy.pos.y + 3.2, z: enemy.pos.z },
          prevPos: { x: enemy.pos.x, y: enemy.pos.y + 3.2, z: enemy.pos.z },
          vel: { x: Math.cos(ang) * 24, y: 0, z: Math.sin(ang) * 24 },
          radius: 0.85,
          damage: enemy.damage * 0.7,
          element: 'Holy',
          knockback: 1.5,
          critBonus: 0,
          bouncesLeft: 0,
          pierceLeft: 0,
          lifeSec: 0,
          maxLifeSec: 2.6,
          procCoefficient: 0,
          homingTargetId: null,
          hitEntityIds: [],
        });
      }
    }
    return true;
  }

  // Calcium's Dad & Dune Empress predictive bone/poison pillar spikes
  if ((enemy.enemyId === 'CalciumDad' || enemy.enemyId === 'MinibossScorpion') && distToTarget <= 32) {
    for (let k = 0; k < 3; k++) {
      const lead = 0.25 + k * 0.3;
      const clamped = terrain.clampToArena(
        {
          x: player.pos.x + player.vel.x * lead + (rng() - 0.5) * 3.5,
          y: player.pos.y,
          z: player.pos.z + player.vel.z * lead + (rng() - 0.5) * 3.5,
        },
        2,
      );
      const sample = terrain.sample(clamped.x, clamped.z);
      state.areaEffects.push({
        id: state.nextEntityId++,
        kind: 'pool',
        weaponId: enemy.enemyId === 'CalciumDad' ? 'EnemyBonePillars' : 'EnemyScorpionSpikes',
        ownerIsPlayer: false,
        pos: { x: clamped.x, y: sample.height + 0.1, z: clamped.z },
        radius: 3.6,
        height: 4.0,
        lifeSec: 0,
        maxLifeSec: 1.4,
        tickTimer: 0.85,
        tickIntervalSec: 1.0,
        damage: enemy.damage * 0.85,
        element: enemy.enemyId === 'MinibossScorpion' ? 'Poison' : 'Physical',
        procCoefficient: 0,
      });
    }
    return true;
  }

  // Ranged Enemies (CactusShooter, Bush)
  if ((enemy.enemyId === 'CactusShooter' || enemy.enemyId === 'Bush') && distToTarget <= 30) {
    const origin: Vec3 = { x: enemy.pos.x, y: enemy.pos.y + enemy.height * 0.65, z: enemy.pos.z };
    const dx = player.pos.x - origin.x;
    const dy = player.pos.y + 1.1 - origin.y;
    const dz = player.pos.z - origin.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const spd = enemy.enemyId === 'Bush' ? 32 : 20;
    state.projectiles.push({
      id: state.nextEntityId++,
      weaponId: `EnemyShot:${enemy.enemyId}`,
      ownerIsPlayer: false,
      pos: { ...origin },
      prevPos: { ...origin },
      vel: { x: (dx / len) * spd, y: (dy / len) * spd, z: (dz / len) * spd },
      radius: 0.55,
      damage: enemy.damage,
      element: 'Physical',
      knockback: 1.0,
      critBonus: 0,
      bouncesLeft: 0,
      pierceLeft: 0,
      lifeSec: 0,
      maxLifeSec: 2.5,
      procCoefficient: 0,
      homingTargetId: null,
      hitEntityIds: [],
    });
    return true;
  }

  return false;
}
