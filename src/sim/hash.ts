/**
 * KRUNKEDBONK — Deterministic FNV-1a 32-bit SimState Hash
 *
 * 100% pure TypeScript. Produces bit-for-bit identical 8-character lowercase hex digests
 * across Node 22 and all modern JS engines for determinism & replay verification.
 */

import type { SimState, Vec3 } from '../contracts/index';

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

const NAN_SENTINEL = 0x55aa55aa;
const POS_INF_SENTINEL = 0x7ffffffe;
const NEG_INF_SENTINEL = -0x7ffffffe;

function mixByte(h: number, b: number): number {
  return Math.imul((h ^ (b & 0xff)) >>> 0, FNV1A_PRIME) >>> 0;
}

function mixInt32(h: number, v: number): number {
  const n = v | 0;
  h = mixByte(h, n & 0xff);
  h = mixByte(h, (n >>> 8) & 0xff);
  h = mixByte(h, (n >>> 16) & 0xff);
  h = mixByte(h, (n >>> 24) & 0xff);
  return h;
}

function mixUint32(h: number, v: number): number {
  const n = v >>> 0;
  h = mixByte(h, n & 0xff);
  h = mixByte(h, (n >>> 8) & 0xff);
  h = mixByte(h, (n >>> 16) & 0xff);
  h = mixByte(h, (n >>> 24) & 0xff);
  return h;
}

function mixBool(h: number, b: boolean): number {
  return mixByte(h, b ? 1 : 0);
}

function mixQuantized(h: number, val: number, scale = 1000): number {
  if (Number.isNaN(val)) {
    return mixUint32(h, NAN_SENTINEL);
  }
  if (!Number.isFinite(val)) {
    return mixInt32(h, val > 0 ? POS_INF_SENTINEL : NEG_INF_SENTINEL);
  }
  // Normalize -0 to +0 before quantizing
  const quantized = Math.round(val * scale) + 0;
  return mixInt32(h, quantized | 0);
}

function mixString(h: number, str: string | null | undefined): number {
  if (str === null || str === undefined) {
    return mixInt32(h, -1);
  }
  h = mixInt32(h, str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h = mixByte(h, code & 0xff);
    if (code > 0xff) {
      h = mixByte(h, (code >>> 8) & 0xff);
    }
  }
  return h;
}

function mixVec3(h: number, v: Readonly<Vec3>, scale = 1000): number {
  h = mixQuantized(h, v.x, scale);
  h = mixQuantized(h, v.y, scale);
  h = mixQuantized(h, v.z, scale);
  return h;
}

/**
 * Compute a deterministic FNV-1a 32-bit hex digest over all gameplay-relevant
 * fields of `SimState`.
 */
export function computeSimStateHash(state: Readonly<SimState>): string {
  let h = FNV1A_OFFSET_BASIS;

  // Core simulation clock & metadata
  h = mixInt32(h, state.version);
  h = mixUint32(h, state.seed);
  h = mixUint32(h, state.rngState);
  h = mixInt32(h, state.tick);
  h = mixQuantized(h, state.simTimeSec, 1000);
  h = mixString(h, state.phase);
  h = mixString(h, state.mapId);
  h = mixInt32(h, state.mapTier);
  h = mixString(h, state.characterId);
  h = mixString(h, state.challengeId);
  h = mixInt32(h, state.nextEntityId);
  h = mixQuantized(h, state.difficultyMultiplier, 1000);

  // World stage flags
  h = mixInt32(h, state.stageBossId ?? -1);
  h = mixBool(h, state.stageBossDefeated);
  h = mixBool(h, state.bossPortalOpen);
  h = mixBool(h, state.cryptUnlocked);
  h = mixInt32(h, state.bigBobId ?? -1);
  h = mixBool(h, state.darknessActive);
  h = mixInt32(h, state.finalBossId ?? -1);
  h = mixBool(h, state.finalSwarmActive);
  h = mixInt32(h, state.spookySteveId ?? -1);
  h = mixInt32(h, state.rerollsLeft);
  h = mixInt32(h, state.banishesLeft);
  h = mixInt32(h, state.skipsLeft);

  // Player kinematic & survival state
  const p = state.player;
  h = mixVec3(h, p.pos, 1000);
  h = mixVec3(h, p.vel, 1000);
  h = mixQuantized(h, p.yaw, 1000);
  h = mixQuantized(h, p.pitch, 1000);
  h = mixString(h, p.movementState);
  h = mixBool(h, p.grounded);
  h = mixBool(h, p.isSliding);
  h = mixInt32(h, p.bhopStreak);
  h = mixInt32(h, p.airJumpsRemaining);
  h = mixInt32(h, p.wallClimbsUsed);
  h = mixInt32(h, p.railId ?? -1);
  h = mixQuantized(h, p.railT, 1000);
  h = mixInt32(h, p.railDir);
  h = mixQuantized(h, p.hp, 100);
  h = mixQuantized(h, p.maxHp, 100);
  h = mixQuantized(h, p.shield, 100);
  h = mixQuantized(h, p.overheal, 100);
  h = mixInt32(h, p.level);
  h = mixQuantized(h, p.xp, 100);
  h = mixQuantized(h, p.xpToNext, 100);
  h = mixInt32(h, Math.round(p.gold));
  h = mixInt32(h, Math.round(p.silverEarned));
  h = mixInt32(h, p.kills);
  h = mixInt32(h, p.revivesLeft);
  h = mixBool(h, p.hasCryptKey);
  h = mixBool(h, p.hasBossKey);
  h = mixBool(h, p.dead);
  if (p.passiveMeter !== undefined) {
    h = mixQuantized(h, p.passiveMeter, 1000);
  }

  // Player weapons
  h = mixInt32(h, p.weapons.length);
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    h = mixInt32(h, w.slotIndex);
    h = mixString(h, w.weaponId);
    h = mixInt32(h, w.level);
    h = mixQuantized(h, w.cooldownTimer, 1000);
    h = mixInt32(h, w.burstRemaining);
    h = mixInt32(h, w.stolenByPylonId ?? -1);
    h = mixQuantized(h, w.totalDamage, 10);
    h = mixInt32(h, w.kills);
  }

  // Player tomes
  h = mixInt32(h, p.tomes.length);
  for (let i = 0; i < p.tomes.length; i++) {
    const t = p.tomes[i];
    h = mixString(h, t.tomeId);
    h = mixInt32(h, t.level);
  }

  // Player items
  h = mixInt32(h, p.items.length);
  for (let i = 0; i < p.items.length; i++) {
    const it = p.items[i];
    h = mixString(h, it.itemId);
    h = mixInt32(h, it.stacks);
    h = mixInt32(h, it.triggerCounter);
    h = mixInt32(h, it.procCount);
  }

  // Enemies
  h = mixInt32(h, state.enemies.length);
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    h = mixInt32(h, e.id);
    h = mixString(h, e.enemyId);
    h = mixString(h, e.role);
    h = mixVec3(h, e.pos, 100);
    h = mixQuantized(h, e.hp, 100);
    h = mixQuantized(h, e.maxHp, 100);
    h = mixInt32(h, e.phaseIndex);
    h = mixInt32(h, e.debuffs.length);
    for (let d = 0; d < e.debuffs.length; d++) {
      const db = e.debuffs[d];
      h = mixString(h, db.type);
      h = mixInt32(h, db.stacks);
      h = mixQuantized(h, db.remainingSec, 100);
    }
  }

  // Projectiles
  h = mixInt32(h, state.projectiles.length);
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    h = mixInt32(h, pr.id);
    h = mixString(h, pr.weaponId);
    h = mixBool(h, pr.ownerIsPlayer);
    h = mixVec3(h, pr.pos, 100);
    h = mixVec3(h, pr.vel, 100);
    h = mixInt32(h, pr.bouncesLeft);
    h = mixInt32(h, pr.pierceLeft);
    h = mixQuantized(h, pr.lifeSec, 100);
  }

  // Area effects
  h = mixInt32(h, state.areaEffects.length);
  for (let i = 0; i < state.areaEffects.length; i++) {
    const ae = state.areaEffects[i];
    h = mixInt32(h, ae.id);
    h = mixString(h, ae.kind);
    h = mixVec3(h, ae.pos, 100);
    h = mixQuantized(h, ae.radius, 100);
    h = mixQuantized(h, ae.lifeSec, 100);
  }

  // Pickups
  h = mixInt32(h, state.pickups.length);
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i];
    h = mixInt32(h, pk.id);
    h = mixString(h, pk.kind);
    h = mixVec3(h, pk.pos, 100);
    h = mixQuantized(h, pk.value, 100);
    h = mixBool(h, pk.magnetized);
  }

  // Interactables
  h = mixInt32(h, state.interactables.length);
  for (let i = 0; i < state.interactables.length; i++) {
    const it = state.interactables[i];
    h = mixInt32(h, it.id);
    h = mixString(h, it.kind);
    h = mixString(h, it.variant);
    h = mixVec3(h, it.pos, 100);
    h = mixBool(h, it.used);
    h = mixBool(h, it.active);
    h = mixQuantized(h, it.chargeProgress, 1000);
    h = mixInt32(h, it.costGold);
  }

  // Boss Pylons
  h = mixInt32(h, state.pylons.length);
  for (let i = 0; i < state.pylons.length; i++) {
    const py = state.pylons[i];
    h = mixInt32(h, py.id);
    h = mixInt32(h, py.index);
    h = mixBool(h, py.active);
    h = mixBool(h, py.cleansed);
    h = mixQuantized(h, py.chargeProgress, 1000);
    h = mixInt32(h, py.stolenWeaponSlotIndex ?? -1);
    h = mixString(h, py.stolenWeaponId);
  }

  // Run Stats Summary
  const s = state.summary;
  h = mixQuantized(h, s.totalDamageDealt, 10);
  h = mixQuantized(h, s.highestSingleHit, 10);
  h = mixInt32(h, s.critsLanded);
  h = mixInt32(h, s.megacritsLanded);
  h = mixInt32(h, s.bonkersLanded);
  h = mixInt32(h, s.executesLanded);
  h = mixInt32(h, s.enemiesKilled);
  h = mixInt32(h, s.elitesKilled);
  h = mixInt32(h, s.bossesKilled);
  h = mixInt32(h, s.chestsOpened);
  h = mixInt32(h, s.shrinesCompleted);
  h = mixInt32(h, s.pylonsCleansed);
  h = mixQuantized(h, s.topSpeedReached, 100);
  h = mixInt32(h, s.longestBhopStreak);
  h = mixInt32(h, s.unstuckRecoveries);

  return (h >>> 0).toString(16).padStart(8, '0');
}
