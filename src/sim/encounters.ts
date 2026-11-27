import type {
  ChallengeDef,
  GameCatalog,
  InputFrame,
  InteractableState,
  ITerrainSampler,
  PickupKind,
  PickupState,
  ShopUpgradeId,
  SimEvent,
  SimState,
  Vec3,
} from '../contracts/index';
import { applyDamageToEnemy, applyDebuffToEnemy } from './damage';
import { dispatchItemTrigger, getPlayerItemStacks, grantPlayerItem } from './items';
import { checkAndTriggerLevelUp, generateShrineOffer, rollRarity } from './progression';
import { spawnEnemyEntity, triggerStageBoss } from './spawner';
import { handleEnemyDeath } from './weapons';

function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function spawnPickup(
  state: SimState,
  kind: PickupKind,
  pos: Vec3,
  value: number,
  rng?: () => number,
): PickupState {
  const angle = rng ? rng() * Math.PI * 2 : 0;
  const speed = rng ? 1.5 + rng() * 2.5 : 0;
  const p: PickupState = {
    id: state.nextEntityId++,
    kind,
    pos: { x: pos.x, y: pos.y + 0.5, z: pos.z },
    vel: { x: Math.cos(angle) * speed, y: rng ? 4.2 : 0, z: Math.sin(angle) * speed },
    value,
    magnetized: false,
    ageSec: 0,
  };
  state.pickups.push(p);
  return p;
}

/**
 * Populates initial world interactables across terrain spots:
 * ChargeShrines (15% Golden), Chests (normal + occasional free), Pots, utility Shrines, and 1 BossSpawner.
 */
export function populateInitialInteractables(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  spots: readonly Vec3[],
  bossArenaCenter: Vec3,
  terrain: ITerrainSampler,
  rng: () => number,
): void {
  const defByKind = new Map(catalog.interactables.map((d) => [d.kind, d]));

  // Always place BossSpawner at bossArenaCenter
  const bossDef = defByKind.get('BossSpawner');
  const clampedBoss = terrain.clampToArena(bossArenaCenter, 6);
  const bossSample = terrain.sample(clampedBoss.x, clampedBoss.z);
  state.interactables.push({
    id: state.nextEntityId++,
    kind: 'BossSpawner',
    variant: 'normal',
    pos: { x: clampedBoss.x, y: bossSample.height, z: clampedBoss.z },
    radius: bossDef?.interactRadius ?? 4.5,
    used: false,
    active: true,
    chargeProgress: 0,
    chargeDurationSec: 0,
    costGold: 0,
  });

  for (let i = 0; i < spots.length; i++) {
    const raw = spots[i];
    // Avoid overlapping BossSpawner
    if (distSqXZ(raw.x, raw.z, clampedBoss.x, clampedBoss.z) < 100) continue;
    const clamped = terrain.clampToArena(raw, 6);
    const sample = terrain.sample(clamped.x, clamped.z);
    const pos: Vec3 = { x: clamped.x, y: sample.height, z: clamped.z };

    const mod = i % 5;
    if (mod === 0 || mod === 2) {
      const def = defByKind.get('ChargeShrine');
      const isGolden = rng() < 0.15;
      state.interactables.push({
        id: state.nextEntityId++,
        kind: 'ChargeShrine',
        variant: isGolden ? 'golden' : 'normal',
        pos,
        radius: def?.interactRadius ?? 5.5,
        used: false,
        active: true,
        chargeProgress: 0,
        chargeDurationSec: def?.chargeDurationSec ?? 5.0,
        costGold: 0,
      });
    } else if (mod === 1) {
      const def = defByKind.get('Chest');
      const isFree = rng() < 0.18;
      state.interactables.push({
        id: state.nextEntityId++,
        kind: 'Chest',
        variant: isFree ? 'free' : 'normal',
        pos,
        radius: def?.interactRadius ?? 3.4,
        used: false,
        active: true,
        chargeProgress: 0,
        chargeDurationSec: 0,
        costGold: isFree ? 0 : def?.baseGoldCost ?? 25,
      });
    } else if (mod === 3) {
      // Cluster of 2 breakable Pots
      const def = defByKind.get('Pot');
      for (let p = 0; p < 2; p++) {
        const offsetX = (p === 0 ? -1.4 : 1.4);
        const potSample = terrain.sample(pos.x + offsetX, pos.z);
        state.interactables.push({
          id: state.nextEntityId++,
          kind: 'Pot',
          variant: 'normal',
          pos: { x: pos.x + offsetX, y: potSample.height, z: pos.z },
          radius: def?.interactRadius ?? 2.2,
          used: false,
          active: true,
          chargeProgress: 0,
          chargeDurationSec: 0,
          costGold: 0,
        });
      }
    } else {
      // Utility shrine variety (ShrineMagnet / ShrineGreed / ShrineMoai)
      const kinds = ['ShrineMagnet', 'ShrineGreed', 'ShrineMoai'] as const;
      const kind = kinds[Math.floor(i / 5) % kinds.length];
      const def = defByKind.get(kind);
      state.interactables.push({
        id: state.nextEntityId++,
        kind,
        variant: 'normal',
        pos,
        radius: def?.interactRadius ?? 4.0,
        used: false,
        active: true,
        chargeProgress: 0,
        chargeDurationSec: 0,
        costGold: 0,
      });
    }
  }
}

function rollChestItem(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
): string | null {
  const pool = catalog.items.filter(
    (it) => !it.isQuestItem && !state.banishedIds.includes(it.id),
  );
  if (pool.length === 0) return null;

  const targetRarity = rollRarity(state.player.stats.Luck, rng);
  const matching = pool.filter((it) => it.rarity === targetRarity);
  const chosenPool = matching.length > 0 ? matching : pool;
  const picked = chosenPool[Math.floor(rng() * chosenPool.length) % chosenPool.length];
  return picked.id;
}

function completeChargeShrine(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  shrine: InteractableState,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
): void {
  shrine.used = true;
  shrine.active = false;
  state.summary.shrinesCompleted += 1;

  const isGolden = shrine.variant === 'golden';
  const wrenchStacks = getPlayerItemStacks(state.player, 'Wrench');
  const beaconStacks = getPlayerItemStacks(state.player, 'Beacon');

  // Beacon heals player cleanly upon shrine completion (in addition to its OnInteract hook)
  if (beaconStacks > 0 && !state.player.dead) {
    const healAmt = Math.round(state.player.maxHp * Math.min(0.75, 0.2 * beaconStacks));
    const before = state.player.hp;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmt);
    const actual = state.player.hp - before;
    if (actual > 0) {
      events.push({
        type: 'player_heal',
        tick: state.tick,
        pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
        amount: actual,
      });
    }
  }

  events.push({
    type: 'interactable_used',
    tick: state.tick,
    interactableId: shrine.id,
    kind: shrine.kind,
    variant: shrine.variant,
    pos: { ...shrine.pos },
  });

  dispatchItemTrigger(
    state,
    catalog,
    'OnInteract',
    { pos: { ...shrine.pos }, recalcStats },
    rng,
    events,
  );

  // Present 3-card stat blessing offer
  if (state.pendingOffer === null) {
    state.pendingOffer = generateShrineOffer(state, rng, isGolden, wrenchStacks, 'shrine');
    const fromPhase = state.phase;
    state.phase = 'level_up';
    events.push({
      type: 'phase_changed',
      tick: state.tick,
      from: fromPhase,
      to: 'level_up',
    });
  }
}

/**
 * Steps all world interactables (ChargeShrines, Chests, Pots, BossSpawner, BossPortal, utility shrines).
 */
export function stepEncounters(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  input: Readonly<InputFrame>,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  _shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): void {
  if (state.phase !== 'playing' || state.player.dead) return;

  const player = state.player;
  const minutes = state.simTimeSec / 60;
  const wrenchStacks = getPlayerItemStacks(player, 'Wrench');
  const defByKind = new Map(catalog.interactables.map((d) => [d.kind, d]));

  // 1. Check BossPortal extraction
  if (state.bossPortalOpen && state.bossPortalPos) {
    const portalDistSq = distSqXZ(
      player.pos.x,
      player.pos.z,
      state.bossPortalPos.x,
      state.bossPortalPos.z,
    );
    if (portalDistSq <= 2.4 * 2.4 || (portalDistSq <= 4.0 * 4.0 && input.interactPressed)) {
      const victorySilver = Math.round(
        25 * state.mapTier * Math.max(1, player.stats.SilverMultiplier) * (challenge?.silverMultiplier ?? 1),
      );
      player.silverEarned += victorySilver;
      events.push({
        type: 'portal_activated',
        tick: state.tick,
        targetMapId: state.mapId,
        targetTier: state.mapTier,
      });
      const fromPhase = state.phase;
      state.phase = 'victory';
      events.push({
        type: 'phase_changed',
        tick: state.tick,
        from: fromPhase,
        to: 'victory',
      });
      return;
    }
  }

  // 2. Step world interactables
  for (let i = 0; i < state.interactables.length; i++) {
    const obj = state.interactables[i];
    if (obj.used || !obj.active) continue;

    // Keep chest gold cost dynamically scaled with run time
    if (obj.kind === 'Chest' && obj.variant !== 'free') {
      const chestDef = defByKind.get('Chest');
      const base = chestDef?.baseGoldCost ?? 25;
      const scale = chestDef?.goldScalePerMinute ?? 0.35;
      obj.costGold = Math.round(base * (1 + scale * minutes));
    }

    const dSq = distSqXZ(player.pos.x, player.pos.z, obj.pos.x, obj.pos.z);
    const inRadius = dSq <= obj.radius * obj.radius;

    // ChargeShrine charges automatically while player stands inside the ring
    if (obj.kind === 'ChargeShrine') {
      if (inRadius) {
        const chargeRate = 1 + 0.35 * wrenchStacks;
        obj.chargeProgress = Math.min(obj.chargeDurationSec, obj.chargeProgress + dt * chargeRate);
        if (obj.chargeProgress >= obj.chargeDurationSec) {
          completeChargeShrine(state, catalog, obj, rng, events, recalcStats);
          break;
        }
      }
      continue;
    }

    // Pots smash on interact OR kinetic slide/contact pass-through!
    if (obj.kind === 'Pot') {
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      const smashedByContact = dSq <= 1.8 * 1.8 && (player.isSliding || horizSpeed >= 6.5);
      if (smashedByContact || (inRadius && input.interactPressed)) {
        obj.used = true;
        obj.active = false;
        const roll = rng();
        if (roll < 0.45) {
          spawnPickup(state, 'gold', obj.pos, Math.round(10 + minutes * 4), rng);
        } else if (roll < 0.8) {
          spawnPickup(state, 'xp_medium', obj.pos, Math.round(14 + minutes * 5), rng);
        } else {
          spawnPickup(state, 'health', obj.pos, 25, rng);
        }
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
      }
      continue;
    }

    if (!inRadius || !input.interactPressed) continue;

    // Interactive encounters activated by interactPressed
    switch (obj.kind) {
      case 'Chest': {
        if (player.gold < obj.costGold) break;
        player.gold -= obj.costGold;
        obj.used = true;
        obj.active = false;
        state.summary.chestsOpened += 1;

        const itemId = rollChestItem(state, catalog, rng);
        if (itemId) {
          grantPlayerItem(state, itemId, 1, recalcStats);
          const itemDef = catalog.items.find((it) => it.id === itemId);
          state.activeBannerText = `CHEST OPENED: ${itemDef?.displayName ?? itemId}!`;
        }

        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnChestOpen', { pos: { ...obj.pos }, recalcStats }, rng, events);
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'BossSpawner': {
        if (state.stageBossId !== null || state.stageBossDefeated) break;
        obj.used = true;
        obj.active = false;
        triggerStageBoss(state, catalog, terrain, rng, events, {
          pos: { x: obj.pos.x + 6, y: obj.pos.y, z: obj.pos.z + 6 },
          challenge,
        });
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        break;
      }

      case 'ShrineMagnet': {
        obj.used = true;
        obj.active = false;
        for (let p = 0; p < state.pickups.length; p++) {
          state.pickups[p].magnetized = true;
        }
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'ShrineGreed': {
        obj.used = true;
        obj.active = false;
        state.difficultyMultiplier += 0.15;
        player.buffs.push({
          id: `greed_shrine:${obj.id}`,
          remainingSec: 999999,
          modifiers: [
            { stat: 'GoldMultiplier', add: 0.25, sourceId: 'ShrineGreed' },
            { stat: 'XpMultiplier', add: 0.2, sourceId: 'ShrineGreed' },
          ],
        });
        recalcStats?.();
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'ShrineMoai': {
        obj.used = true;
        obj.active = false;
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        if (state.pendingOffer === null) {
          state.pendingOffer = generateShrineOffer(state, rng, false, wrenchStacks, 'moai');
          const fromPhase = state.phase;
          state.phase = 'level_up';
          events.push({
            type: 'phase_changed',
            tick: state.tick,
            from: fromPhase,
            to: 'level_up',
          });
        }
        break;
      }

      case 'ShrineChallenge': {
        obj.used = true;
        obj.active = false;
        for (let k = 0; k < 4; k++) {
          spawnEnemyEntity(state, catalog, 'GoblinStrong', terrain, rng, events, {
            isElite: true,
            challenge,
          });
        }
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'ShrineCursed': {
        obj.used = true;
        obj.active = false;
        player.buffs.push({
          id: `cursed_shrine:${obj.id}`,
          remainingSec: 999999,
          modifiers: [
            { stat: 'DamageMultiplier', mult: 0.25, sourceId: 'ShrineCursed' },
            { stat: 'MaxHealth', flat: -20, sourceId: 'ShrineCursed' },
          ],
        });
        recalcStats?.();
        player.hp = Math.min(player.hp, player.maxHp);
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'ShrineBalance': {
        obj.used = true;
        obj.active = false;
        player.buffs.push({
          id: `balance_shrine:${obj.id}`,
          remainingSec: 999999,
          modifiers: [
            { stat: 'DamageMultiplier', mult: 0.1, sourceId: 'ShrineBalance' },
            { stat: 'Armor', flat: 0.1, sourceId: 'ShrineBalance' },
          ],
        });
        recalcStats?.();
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'ShadyGuy':
      case 'Microwave': {
        if (player.gold < obj.costGold) break;
        player.gold -= obj.costGold;
        obj.used = true;
        obj.active = false;
        const itemId = rollChestItem(state, catalog, rng);
        if (itemId) {
          grantPlayerItem(state, itemId, 1, recalcStats);
        }
        events.push({
          type: 'interactable_used',
          tick: state.tick,
          interactableId: obj.id,
          kind: obj.kind,
          variant: obj.variant,
          pos: { ...obj.pos },
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }
    }
  }
}

/**
 * Steps all pickups: bounce physics, magnet pull within PickupRange, collection of XP/Gold/Silver/
 * Health/Magnet/Nuke/FreezeClock/Rage/Haste/Stonks/Shield/Keys, and level-up trigger checks.
 */
export function stepPickups(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  dt: number,
  rng: () => number,
  events: SimEvent[],
  recalcStats?: () => void,
  shopLevels?: Partial<Record<ShopUpgradeId, number>>,
  challenge?: ChallengeDef | null,
): void {
  if (state.phase !== 'playing' || state.player.dead) return;

  const player = state.player;
  const pickupRange = Math.max(1.0, player.stats.PickupRange);
  const pickupRangeSq = pickupRange * pickupRange;
  const collectRadiusSq = 1.65 * 1.65;
  const onKill = (e: SimState['enemies'][number], exec: boolean, wid?: string) =>
    handleEnemyDeath(state, catalog, e, exec, wid, rng, events, recalcStats);

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    p.ageSec += dt;

    // Despawn very old uncollected basic XP/gold orbs to protect perf
    if (p.ageSec > 90 && !p.magnetized && p.kind !== 'crypt_key' && p.kind !== 'boss_key') {
      state.pickups.splice(i, 1);
      continue;
    }

    const dSq = distSqXZ(player.pos.x, player.pos.z, p.pos.x, p.pos.z);
    if (!p.magnetized && dSq <= pickupRangeSq) {
      p.magnetized = true;
    }

    if (p.magnetized) {
      const dx = player.pos.x - p.pos.x;
      const dy = player.pos.y + 1.0 - p.pos.y;
      const dz = player.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      const pullSpeed = Math.min(48, 22 + p.ageSec * 4);
      p.pos.x += (dx / dist) * pullSpeed * dt;
      p.pos.y += (dy / dist) * pullSpeed * dt;
      p.pos.z += (dz / dist) * pullSpeed * dt;
    } else {
      p.vel.y -= 18 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      const ground = terrain.sample(p.pos.x, p.pos.z);
      if (p.pos.y < ground.height + 0.35) {
        p.pos.y = ground.height + 0.35;
        p.vel.x *= 0.65;
        p.vel.z *= 0.65;
        p.vel.y = 0;
      }
    }

    const collectDistSq =
      (player.pos.x - p.pos.x) ** 2 +
      (player.pos.y + 1.0 - p.pos.y) ** 2 +
      (player.pos.z - p.pos.z) ** 2;

    if (collectDistSq > collectRadiusSq) continue;

    state.pickups.splice(i, 1);

    switch (p.kind) {
      case 'xp_small':
      case 'xp_medium':
      case 'xp_large': {
        const gained = Math.max(1, Math.round(p.value * Math.max(0.1, player.stats.XpMultiplier)));
        player.xp += gained;
        break;
      }

      case 'gold': {
        const gained = Math.max(1, Math.round(p.value * Math.max(0.1, player.stats.GoldMultiplier)));
        player.gold += gained;
        break;
      }

      case 'silver': {
        const gained = Math.max(
          1,
          Math.round(p.value * Math.max(0.1, player.stats.SilverMultiplier) * (challenge?.silverMultiplier ?? 1)),
        );
        player.silverEarned += gained;
        break;
      }

      case 'health': {
        const healAmt = Math.max(p.value, Math.round(player.maxHp * 0.25));
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + healAmt);
        const actual = player.hp - before;
        if (actual > 0) {
          events.push({
            type: 'player_heal',
            tick: state.tick,
            pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
            amount: actual,
          });
        }
        break;
      }

      case 'magnet': {
        for (let k = 0; k < state.pickups.length; k++) {
          const other = state.pickups[k];
          if (
            other.kind === 'xp_small' ||
            other.kind === 'xp_medium' ||
            other.kind === 'xp_large' ||
            other.kind === 'gold' ||
            other.kind === 'silver'
          ) {
            other.magnetized = true;
          }
        }
        break;
      }

      case 'nuke': {
        state.areaEffects.push({
          id: state.nextEntityId++,
          kind: 'nova',
          weaponId: 'pickup:nuke',
          ownerIsPlayer: true,
          pos: { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z },
          radius: 50,
          height: 12,
          lifeSec: 0,
          maxLifeSec: 0.6,
          tickTimer: 99,
          tickIntervalSec: 99,
          damage: 500 + 80 * player.level,
          element: 'Holy',
          procCoefficient: 0,
        });
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const enemy = state.enemies[eIdx];
          if (enemy.hp <= 0 || enemy.enemyId === 'GhostInvincible') continue;
          const nukeDmg = enemy.isBoss ? enemy.maxHp * 0.15 : 500 + 80 * player.level;
          applyDamageToEnemy(
            state,
            catalog,
            enemy,
            {
              baseDamage: nukeDmg,
              element: 'Holy',
              procCoefficient: 0,
              weaponId: 'pickup:nuke',
              isProcDamage: true,
            },
            rng,
            events,
            { skipItemProcs: true, onEnemyKilled: onKill, recalcStats },
          );
        }
        break;
      }

      case 'freeze_clock': {
        for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
          const enemy = state.enemies[eIdx];
          if (enemy.hp <= 0) continue;
          applyDebuffToEnemy(state, catalog, enemy, 'Freeze', 6.0, 0, rng, events, 'pickup:freeze_clock', 1, false);
        }
        break;
      }

      case 'rage': {
        const buffId = 'pickup:rage';
        const existing = player.buffs.find((b) => b.id === buffId);
        const mods = [
          { stat: 'DamageMultiplier' as const, mult: 0.5, sourceId: buffId },
          { stat: 'AttackSpeed' as const, add: 0.35, sourceId: buffId },
        ];
        if (existing) {
          existing.remainingSec = 10.0;
          existing.modifiers = mods;
        } else {
          player.buffs.push({ id: buffId, remainingSec: 10.0, modifiers: mods });
        }
        recalcStats?.();
        break;
      }

      case 'haste': {
        const buffId = 'pickup:haste';
        const existing = player.buffs.find((b) => b.id === buffId);
        const mods = [{ stat: 'MoveSpeed' as const, add: 0.45, sourceId: buffId }];
        if (existing) {
          existing.remainingSec = 10.0;
          existing.modifiers = mods;
        } else {
          player.buffs.push({ id: buffId, remainingSec: 10.0, modifiers: mods });
        }
        recalcStats?.();
        break;
      }

      case 'stonks': {
        const buffId = 'pickup:stonks';
        const existing = player.buffs.find((b) => b.id === buffId);
        const mods = [
          { stat: 'GoldMultiplier' as const, add: 1.0, sourceId: buffId },
          { stat: 'XpMultiplier' as const, add: 0.5, sourceId: buffId },
        ];
        if (existing) {
          existing.remainingSec = 12.0;
          existing.modifiers = mods;
        } else {
          player.buffs.push({ id: buffId, remainingSec: 12.0, modifiers: mods });
        }
        recalcStats?.();
        break;
      }

      case 'shield': {
        player.shield = Math.max(player.shield + 50, player.maxShield + 50);
        player.invulnTimer = Math.max(player.invulnTimer, 2.0);
        break;
      }

      case 'crypt_key': {
        player.hasCryptKey = true;
        break;
      }

      case 'boss_key': {
        player.hasBossKey = true;
        break;
      }
    }

    events.push({
      type: 'pickup_collected',
      tick: state.tick,
      kind: p.kind,
      value: p.value,
      pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    });

    dispatchItemTrigger(
      state,
      catalog,
      'OnPickup',
      { pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z }, recalcStats },
      rng,
      events,
    );
  }

  // Check if collected XP triggered a level up
  checkAndTriggerLevelUp(state, catalog, rng, events, recalcStats, shopLevels, challenge);
}
