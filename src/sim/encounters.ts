import type {
  ChallengeDef,
  GameCatalog,
  InputFrame,
  InteractableKind,
  InteractableState,
  InteractableVariant,
  ITerrainSampler,
  MapId,
  MapTier,
  PickupKind,
  PickupState,
  ShopUpgradeId,
  SimEvent,
  SimState,
  Vec3,
} from '../contracts/index';
import { STAGE_DURATIONS_BY_TIER } from '../data/maps';
import { ensureFinalBossPylonsInitialized } from './bosses';
import { applyDamageToEnemy, applyDebuffToEnemy } from './damage';
import { dispatchItemTrigger, getPlayerItemStacks, grantPlayerItem } from './items';
import {
  checkAndTriggerLevelUp,
  generateBalanceShrineOffer,
  generateMicrowaveOffer,
  generateMoaiItemOffer,
  generateShadyGuyOffer,
  generateShrineOffer,
  rollRarity,
} from './progression';
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

function getBiomePotVariant(mapId: MapId): InteractableVariant {
  if (mapId === 'Desert') return 'tumbleweed';
  if (mapId === 'Graveyard') return 'pumpkin';
  return 'normal';
}

function getChallengeWaveEnemyId(mapId: MapId): string {
  if (mapId === 'Desert') return 'ScorpionMedium';
  if (mapId === 'Graveyard') return 'GreaterGhost';
  return 'GoblinStrong';
}

/**
 * Populates ALL 12 world interactable kinds across terrain spots:
 * ChargeShrine (15% Golden + Beacon extras), Chest (normal/free/evil/ghost),
 * ShrineMoai, ShadyGuy, Microwave, ShrineGreed, ShrineChallenge, ShrineCursed,
 * ShrineMagnet, ShrineBalance, Pot/Pumpkin/Tumbleweed (+Pumpkin item extras), and BossSpawner (+CryptAltar in Graveyard).
 */
export function populateInitialInteractables(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  spots: readonly Vec3[],
  bossArenaCenter: Vec3,
  terrain: ITerrainSampler,
  rng: () => number,
): void {
  if (state.mapId === 'FinalBossMap') {
    // FinalBossMap focuses cleanly on the 11 Boss Pylons & Final Boss fight
    return;
  }

  const defByKind = new Map(catalog.interactables.map((d) => [d.kind, d]));
  const potVariant = getBiomePotVariant(state.mapId);

  // Always place BossSpawner at bossArenaCenter
  const bossDef = defByKind.get('BossSpawner');
  const clampedBoss = terrain.clampToArena(bossArenaCenter, 6);
  const bossSample = terrain.sample(clampedBoss.x, clampedBoss.z);
  state.interactables.push({
    id: state.nextEntityId++,
    kind: 'BossSpawner',
    variant: state.mapId === 'Graveyard' ? 'crypt_altar' : 'normal',
    pos: { x: clampedBoss.x, y: bossSample.height, z: clampedBoss.z },
    radius: bossDef?.interactRadius ?? 4.5,
    used: false,
    active: true,
    chargeProgress: 0,
    chargeDurationSec: 0,
    costGold: 0,
  });

  // Guarantee ALL special encounter types appear across every map!
  const specialRotation: readonly InteractableKind[] = [
    'ShrineMoai',
    'ShadyGuy',
    'Microwave',
    'ShrineGreed',
    'ShrineChallenge',
    'ShrineCursed',
    'ShrineMagnet',
    'ShrineBalance',
  ];
  let specialCursor = 0;

  for (let i = 0; i < spots.length; i++) {
    const raw = spots[i];
    if (distSqXZ(raw.x, raw.z, clampedBoss.x, clampedBoss.z) < 100) continue;
    const clamped = terrain.clampToArena(raw, 6);
    const sample = terrain.sample(clamped.x, clamped.z);
    const pos: Vec3 = { x: clamped.x, y: sample.height, z: clamped.z };

    const mod = i % 5;
    if (mod === 0) {
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
      const r = rng();
      const variant: InteractableVariant =
        r < 0.16 ? 'free' : r < 0.28 ? 'evil' : r < 0.4 ? 'ghost' : 'normal';
      state.interactables.push({
        id: state.nextEntityId++,
        kind: 'Chest',
        variant,
        pos,
        radius: def?.interactRadius ?? 3.4,
        used: false,
        active: true,
        chargeProgress: 0,
        chargeDurationSec: 0,
        costGold: variant === 'free' ? 0 : def?.baseGoldCost ?? 25,
      });
    } else if (mod === 2) {
      // Cycle through all 8 unique special shrines/merchants/microwave!
      const kind = specialRotation[specialCursor % specialRotation.length];
      specialCursor += 1;
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
        chargeDurationSec: kind === 'Microwave' ? 3 : 0, // 3 max uses before exploding!
        costGold: def?.baseGoldCost ?? 0,
      });
    } else if (mod === 3) {
      const def = defByKind.get('Pot');
      for (let p = 0; p < 2; p++) {
        const offsetX = p === 0 ? -1.4 : 1.4;
        const potSample = terrain.sample(pos.x + offsetX, pos.z);
        state.interactables.push({
          id: state.nextEntityId++,
          kind: 'Pot',
          variant: potVariant,
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
    }
  }

  // Guarantee EVERY ONE of the 8 unique special shrines/merchants/microwave spawns on every map!
  while (specialCursor < specialRotation.length) {
    const kind = specialRotation[specialCursor];
    specialCursor += 1;
    const def = defByKind.get(kind);
    const angle = (specialCursor / specialRotation.length) * Math.PI * 2 + 0.35;
    const dist = 34 + (specialCursor % 3) * 18;
    const clamped = terrain.clampToArena(
      { x: Math.cos(angle) * dist, y: 0, z: Math.sin(angle) * dist },
      8,
    );
    const sample = terrain.sample(clamped.x, clamped.z);
    state.interactables.push({
      id: state.nextEntityId++,
      kind,
      variant: 'normal',
      pos: { x: clamped.x, y: sample.height, z: clamped.z },
      radius: def?.interactRadius ?? 4.0,
      used: false,
      active: true,
      chargeProgress: 0,
      chargeDurationSec: kind === 'Microwave' ? 3 : 0,
      costGold: def?.baseGoldCost ?? 0,
    });
  }

  // Beacon spawns extra ChargeShrines for future stages
  const beaconStacks = getPlayerItemStacks(state.player, 'Beacon');
  for (let b = 0; b < beaconStacks; b++) {
    const ang = rng() * Math.PI * 2;
    const dist = 22 + rng() * 30;
    const c = terrain.clampToArena({ x: Math.cos(ang) * dist, y: 0, z: Math.sin(ang) * dist }, 6);
    const s = terrain.sample(c.x, c.z);
    state.interactables.push({
      id: state.nextEntityId++,
      kind: 'ChargeShrine',
      variant: rng() < 0.2 ? 'golden' : 'normal',
      pos: { x: c.x, y: s.height, z: c.z },
      radius: 5.5,
      used: false,
      active: true,
      chargeProgress: 0,
      chargeDurationSec: 5.0,
      costGold: 0,
    });
  }

  // Pumpkin spawns extra Pots/Pumpkins
  const pumpkinStacks = getPlayerItemStacks(state.player, 'Pumpkin');
  for (let p = 0; p < pumpkinStacks * 3; p++) {
    const ang = rng() * Math.PI * 2;
    const dist = 16 + rng() * 45;
    const c = terrain.clampToArena({ x: Math.cos(ang) * dist, y: 0, z: Math.sin(ang) * dist }, 6);
    const s = terrain.sample(c.x, c.z);
    state.interactables.push({
      id: state.nextEntityId++,
      kind: 'Pot',
      variant: 'pumpkin',
      pos: { x: c.x, y: s.height, z: c.z },
      radius: 2.2,
      used: false,
      active: true,
      chargeProgress: 0,
      chargeDurationSec: 0,
      costGold: 0,
    });
  }
}

function rollChestItem(
  state: Readonly<SimState>,
  catalog: Readonly<GameCatalog>,
  rng: () => number,
  minLuckBonus = 0,
): string | null {
  const pool = catalog.items.filter(
    (it) => !it.isQuestItem && !state.banishedIds.includes(it.id),
  );
  if (pool.length === 0) return null;

  const targetRarity = rollRarity(state.player.stats.Luck + minLuckBonus, rng);
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

  // Beacon turns completed ChargeShrine into a persistent healing zone + instant heal!
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
    state.areaEffects.push({
      id: state.nextEntityId++,
      kind: 'aura',
      weaponId: 'item:BeaconZone',
      ownerIsPlayer: true,
      pos: { x: shrine.pos.x, y: shrine.pos.y + 0.3, z: shrine.pos.z },
      radius: 6.5,
      height: 2.5,
      lifeSec: 0,
      maxLifeSec: 45.0,
      tickTimer: 0.5,
      tickIntervalSec: 0.75,
      damage: 8 * beaconStacks,
      element: 'Holy',
      procCoefficient: 0,
    });
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
 * Transitions the run cleanly through multi-tier Boss Portals:
 * - Forest / Desert: T1 -> T2 (540s) -> T3 (480s) -> FinalBossMap (11 Boss Pylons + FinalBoss)
 * - Graveyard / FinalBossMap: Victory!
 */
function activateBossPortalTransition(
  state: SimState,
  catalog: Readonly<GameCatalog>,
  terrain: ITerrainSampler,
  rng: () => number,
  events: SimEvent[],
  challenge?: ChallengeDef | null,
): void {
  const player = state.player;
  const stageSilver = Math.round(
    25 * state.mapTier * Math.max(1, player.stats.SilverMultiplier) * (challenge?.silverMultiplier ?? 1),
  );
  player.silverEarned += stageSilver;

  // Forest & Desert advance T1 -> T2 -> T3 -> FinalBossMap!
  if (state.mapId === 'Forest' || state.mapId === 'Desert') {
    const targetMapId: MapId = state.mapTier < 3 ? state.mapId : 'FinalBossMap';
    const targetTier: MapTier = state.mapTier < 3 ? ((state.mapTier + 1) as MapTier) : 1;

    events.push({
      type: 'portal_activated',
      tick: state.tick,
      targetMapId,
      targetTier,
    });

    const spawnPt = terrain.getSpawnPoint();
    const spawnSample = terrain.sample(spawnPt.x, spawnPt.z);
    player.pos = { x: spawnPt.x, y: spawnSample.height, z: spawnPt.z };
    player.prevPos = { ...player.pos };
    player.vel = { x: 0, y: 0, z: 0 };
    player.safePos = { ...player.pos };
    player.hp = player.maxHp;
    player.shield = player.maxShield;
    for (let i = 0; i < player.weapons.length; i++) {
      player.weapons[i].stolenByPylonId = null;
    }

    state.mapId = targetMapId;
    state.mapTier = targetTier;
    const baseDur = STAGE_DURATIONS_BY_TIER[targetMapId][targetTier];
    state.stageDurationSec = Math.max(30, Math.round(baseDur * (challenge?.rules.timerScale ?? 1)));
    state.enemies = [];
    state.projectiles = [];
    state.areaEffects = [];
    state.pickups = [];
    state.interactables = [];
    state.pylons = [];
    state.stageBossId = null;
    state.stageBossDefeated = false;
    state.bossPortalOpen = false;
    state.bossPortalPos = null;
    state.finalBossId = null;
    state.finalSwarmActive = false;
    state.spookySteveId = null;
    state.stageEventsFired = [];

    if (targetMapId === 'FinalBossMap') {
      ensureFinalBossPylonsInitialized(state, terrain);
      state.activeBannerText = 'OBSIDIAN CITADEL — FACE THE FINAL BOSS!';
    } else {
      // Repopulate interactables around the stage ring for next tier
      const spots: Vec3[] = [];
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const r = 28 + (i % 3) * 26;
        spots.push({ x: Math.cos(ang) * r, y: 0, z: Math.sin(ang) * r });
      }
      populateInitialInteractables(state, catalog, spots, { x: 0, y: 0, z: -72 }, terrain, rng);
      state.activeBannerText = `${targetMapId.toUpperCase()} — TIER ${targetTier}!`;
    }
    return;
  }

  // Graveyard / FinalBossMap portal => Victory
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
}

/**
 * Steps ALL 12 world interactable kinds (ChargeShrine, Chest, ShrineMoai, ShadyGuy,
 * Microwave, ShrineGreed, ShrineChallenge, ShrineCursed, ShrineMagnet, ShrineBalance,
 * Pot/Pumpkin/Tumbleweed, BossSpawner) and BossPortal extraction.
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
  const keyStacks = getPlayerItemStacks(player, 'Key');
  const pumpkinStacks = getPlayerItemStacks(player, 'Pumpkin');
  const defByKind = new Map(catalog.interactables.map((d) => [d.kind, d]));

  // 1. Check BossPortal extraction
  if (state.bossPortalOpen && state.bossPortalPos) {
    const portalDistSq = distSqXZ(
      player.pos.x,
      player.pos.z,
      state.bossPortalPos.x,
      state.bossPortalPos.z,
    );
    if (portalDistSq <= 2.4 * 2.4 || (portalDistSq <= 4.2 * 4.2 && input.interactPressed)) {
      activateBossPortalTransition(state, catalog, terrain, rng, events, challenge);
      return;
    }
  }

  // 2. Step all world interactables
  for (let i = 0; i < state.interactables.length; i++) {
    const obj = state.interactables[i];
    if (obj.used || !obj.active) continue;

    // Keep paid Chest gold cost dynamically scaled with run time
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

    // Pot / Pumpkin / Tumbleweed smash on interact OR kinetic contact/slide pass-through!
    if (obj.kind === 'Pot') {
      const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
      const smashedByContact = dSq <= 1.8 * 1.8 && (player.isSliding || horizSpeed >= 6.5);
      if (smashedByContact || (inRadius && input.interactPressed)) {
        obj.used = true;
        obj.active = false;
        const rewardMult = 1 + 0.5 * pumpkinStacks;
        const roll = rng();
        if (roll < 0.45) {
          spawnPickup(state, 'gold', obj.pos, Math.round((10 + minutes * 4) * rewardMult), rng);
        } else if (roll < 0.8) {
          spawnPickup(state, 'xp_medium', obj.pos, Math.round((14 + minutes * 5) * rewardMult), rng);
        } else {
          spawnPickup(state, 'health', obj.pos, Math.round(25 * rewardMult), rng);
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

    switch (obj.kind) {
      case 'Chest': {
        const freeByKey =
          obj.costGold > 0 && keyStacks > 0 && rng() < Math.min(0.85, 0.12 * keyStacks);
        const actualCost = freeByKey ? 0 : obj.costGold;
        if (player.gold < actualCost) break;
        player.gold -= actualCost;
        obj.used = true;
        obj.active = false;
        state.summary.chestsOpened += 1;

        // Evil & Ghost chest variants spawn guardians and grant higher rarity luck!
        let luckBonus = 0;
        if (obj.variant === 'evil') {
          luckBonus = 1.2;
          for (let k = 0; k < 2; k++) {
            spawnEnemyEntity(state, catalog, getChallengeWaveEnemyId(state.mapId), terrain, rng, events, {
              isElite: true,
              challenge,
            });
          }
        } else if (obj.variant === 'ghost') {
          luckBonus = 0.6;
          for (let k = 0; k < 2; k++) {
            spawnEnemyEntity(state, catalog, 'Ghost', terrain, rng, events, { challenge });
          }
        }

        const itemId = rollChestItem(state, catalog, rng, luckBonus);
        if (itemId) {
          grantPlayerItem(state, itemId, 1, recalcStats);
          const itemDef = catalog.items.find((it) => it.id === itemId);
          state.activeBannerText = `${freeByKey ? 'FREE KEY ' : ''}CHEST OPENED: ${itemDef?.displayName ?? itemId}!`;
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
        if (state.mapId === 'Graveyard') {
          state.cryptUnlocked = true;
        }
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
        state.activeBannerText = 'SHRINE OF SUCC: VACUUMING ALL LOOT!';
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
        const instantGold = Math.round((35 + minutes * 12) * Math.max(1, player.stats.GoldMultiplier));
        player.gold += instantGold;
        player.buffs.push({
          id: `greed_shrine:${obj.id}`,
          remainingSec: 999999,
          modifiers: [
            { stat: 'GoldMultiplier', add: 0.25, sourceId: 'ShrineGreed' },
            { stat: 'XpMultiplier', add: 0.2, sourceId: 'ShrineGreed' },
            { stat: 'Difficulty', flat: 0.1, sourceId: 'ShrineGreed' },
          ],
        });
        recalcStats?.();
        state.activeBannerText = `GREED SHRINE: +${instantGold} GOLD & +DIFFICULTY!`;
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
          state.pendingOffer = generateMoaiItemOffer(state, catalog, rng);
          const fromPhase = state.phase;
          state.phase = 'chest_open';
          events.push({
            type: 'phase_changed',
            tick: state.tick,
            from: fromPhase,
            to: 'chest_open',
          });
        }
        break;
      }

      case 'ShrineChallenge': {
        obj.used = true;
        obj.active = false;
        const waveEnemy = getChallengeWaveEnemyId(state.mapId);
        for (let k = 0; k < 4; k++) {
          spawnEnemyEntity(state, catalog, waveEnemy, terrain, rng, events, {
            isElite: true,
            challenge,
          });
        }
        // Spawn bonus free reward Loot Chest right next to the Challenge Shrine!
        const chestPos = terrain.clampToArena({ x: obj.pos.x + 3.5, y: obj.pos.y, z: obj.pos.z }, 4);
        const chestSample = terrain.sample(chestPos.x, chestPos.z);
        state.interactables.push({
          id: state.nextEntityId++,
          kind: 'Chest',
          variant: 'free',
          pos: { x: chestPos.x, y: chestSample.height, z: chestPos.z },
          radius: 3.4,
          used: false,
          active: true,
          chargeProgress: 0,
          chargeDurationSec: 0,
          costGold: 0,
        });
        state.activeBannerText = 'CHALLENGE SHRINE: ELITE AMBUSH + BONUS FREE CHEST!';
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
        // Boss Curse: adds an extra Stage Boss on BossSpawner + grants immediate Damage & Loot boost!
        player.buffs.push({
          id: `cursed_shrine:${obj.id}`,
          remainingSec: 999999,
          modifiers: [
            { stat: 'DamageMultiplier', mult: 0.25, sourceId: 'ShrineCursed' },
            { stat: 'Luck', flat: 0.2, sourceId: 'ShrineCursed' },
          ],
        });
        recalcStats?.();
        const bonusItem = rollChestItem(state, catalog, rng, 0.4);
        if (bonusItem) {
          grantPlayerItem(state, bonusItem, 1, recalcStats);
        }
        state.activeBannerText = 'BOSS CURSE INVOKED: EXTRA BOSS & FORBIDDEN LOOT!';
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
          state.pendingOffer = generateBalanceShrineOffer(state, rng);
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

      case 'ShadyGuy': {
        if (state.pendingOffer !== null) break;
        state.pendingOffer = generateShadyGuyOffer(state, catalog, rng, obj);
        const fromPhase = state.phase;
        state.phase = 'merchant';
        events.push({
          type: 'phase_changed',
          tick: state.tick,
          from: fromPhase,
          to: 'merchant',
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }

      case 'Microwave': {
        if (state.pendingOffer !== null) break;
        const mwOffer = generateMicrowaveOffer(state, catalog, obj);
        if (mwOffer.choices.length === 0) {
          state.activeBannerText = 'MICROWAVE NEEDS AT LEAST 2 SAME-RARITY ITEMS!';
          break;
        }
        state.pendingOffer = mwOffer;
        const fromPhase = state.phase;
        state.phase = 'microwave';
        events.push({
          type: 'phase_changed',
          tick: state.tick,
          from: fromPhase,
          to: 'microwave',
        });
        dispatchItemTrigger(state, catalog, 'OnInteract', { pos: { ...obj.pos }, recalcStats }, rng, events);
        break;
      }
    }
  }
}

/**
 * Steps all pickups: bounce physics, magnet pull within PickupRange, collection of XP/Gold/Silver/
 * Health/Magnet/Nuke/FreezeClock/Rage/Haste/Stonks/Shield/Keys, ShatteredWisdom XP AoE slice,
 * and level-up trigger checks.
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
        const newHp = player.hp + healAmt;
        if (newHp > player.maxHp) {
          player.hp = player.maxHp;
          if (player.stats.Overheal > 0) {
            const cap = player.maxHp * Math.min(1.5, player.stats.Overheal);
            player.overheal = Math.min(cap, player.overheal + (newHp - player.maxHp));
          }
        } else {
          player.hp = newHp;
        }
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
          const nukeDmg = enemy.isBoss ? enemy.maxHp * 0.12 : 500 + 80 * player.level;
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
        state.cryptUnlocked = true;
        grantPlayerItem(state, 'CryptKey', 1, recalcStats);
        state.activeBannerText = 'CRYPT KEY OBTAINED — SEEK THE CRYPT ALTAR!';
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
      {
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        onEnemyKilled: onKill,
        recalcStats,
      },
      rng,
      events,
    );
  }

  checkAndTriggerLevelUp(state, catalog, rng, events, recalcStats, shopLevels, challenge);
}
