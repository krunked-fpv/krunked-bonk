/**
 * KRUNKEDBONK — Deterministic 50 Hz Simulation Engine (`SimEngine implements ISimEngine`)
 *
 * 100% pure TypeScript. Zero DOM, zero Three.js, zero Math.random().
 * Wires `prng`, `hash`, `stats`, `terrain`, `physics`, `damage`, `items`, `passives`,
 * `weapons`, `enemies`, `spawner`, `encounters`, `progression`, and `GAME_CATALOG`.
 */

import {
  FINAL_BOSS_PYLON_COUNT,
  FIXED_DT,
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  SAVE_VERSION,
  type BossPylonState,
  type ChallengeDef,
  type CharacterId,
  type EnemyRole,
  type EnemyState,
  type GameCatalog,
  type GamePhase,
  type InputFrame,
  type ISimEngine,
  type ITerrainSampler,
  type MapId,
  type MapTier,
  type PlayerState,
  type ShopUpgradeId,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Vec3,
} from '../contracts/index';
import {
  GAME_CATALOG,
  getChallengeById,
  getCharacterById,
  getMapById,
  getTomeById,
  getWeaponById,
} from '../data/index';
import { populateInitialInteractables, stepEncounters, stepPickups } from './encounters';
import { applyPlayerDamage, stepEnemies } from './enemies';
import { computeSimStateHash } from './hash';
import { dispatchItemTrigger, grantPlayerItem, stepItemCooldowns } from './items';
import { stepCharacterPassives } from './passives';
import {
  applyWindField,
  resolveCharacterPhysicsFlags,
  stepPlayerPhysics,
  verifyPosition,
  type CharacterPhysicsFlags,
} from './physics';
import { createRngCallback, deriveSeed, normalizeSeed } from './prng';
import {
  applyDraftChoice as applyDraftChoiceImpl,
  banishDraftChoice as banishDraftChoiceImpl,
  checkAndTriggerLevelUp,
  rerollDraft as rerollDraftImpl,
  skipDraft as skipDraftImpl,
  xpRequired,
} from './progression';
import { spawnEnemyEntity, stepSpawner, triggerFinalSwarm, triggerStageBoss } from './spawner';
import { createBaseStatBlock, recalculatePlayerStats } from './stats';
import {
  createTerrainSampler,
  sampleDesertTornadoes,
  type TerrainCreationResult,
} from './terrain';
import { handleEnemyDeath, stepWeapons } from './weapons';

function cloneVec3(v: Readonly<Vec3>): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Deterministic deep snapshot of `SimState` stored into `prevState` before every tick
 * so `IRenderer.render(prevState, currState, interpAlpha)` interpolates cleanly with zero aliasing.
 */
export function cloneSimState(s: Readonly<SimState>): SimState {
  const p = s.player;
  return {
    version: s.version,
    seed: s.seed,
    rngState: s.rngState,
    tick: s.tick,
    simTimeSec: s.simTimeSec,
    stageDurationSec: s.stageDurationSec,
    phase: s.phase,
    mapId: s.mapId,
    mapTier: s.mapTier,
    challengeId: s.challengeId,
    characterId: s.characterId,
    skinId: s.skinId,
    hatId: s.hatId,
    nextEntityId: s.nextEntityId,
    player: {
      pos: cloneVec3(p.pos),
      prevPos: cloneVec3(p.prevPos),
      vel: cloneVec3(p.vel),
      yaw: p.yaw,
      pitch: p.pitch,
      capsuleRadius: p.capsuleRadius,
      capsuleHeight: p.capsuleHeight,
      movementState: p.movementState,
      passiveMeter: p.passiveMeter,
      grounded: p.grounded,
      groundNormal: cloneVec3(p.groundNormal),
      coyoteTimer: p.coyoteTimer,
      jumpBufferTimer: p.jumpBufferTimer,
      bhopTimer: p.bhopTimer,
      bhopStreak: p.bhopStreak,
      airJumpsRemaining: p.airJumpsRemaining,
      isSliding: p.isSliding,
      slideTimer: p.slideTimer,
      wallClimbCooldown: p.wallClimbCooldown,
      wallClimbsUsed: p.wallClimbsUsed,
      railId: p.railId,
      railT: p.railT,
      railDir: p.railDir,
      peakFallSpeed: p.peakFallSpeed,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      maxShield: p.maxShield,
      shieldRegenDelay: p.shieldRegenDelay,
      overheal: p.overheal,
      level: p.level,
      xp: p.xp,
      xpToNext: p.xpToNext,
      gold: p.gold,
      silverEarned: p.silverEarned,
      kills: p.kills,
      revivesLeft: p.revivesLeft,
      invulnTimer: p.invulnTimer,
      safePos: cloneVec3(p.safePos),
      stats: { ...p.stats },
      weapons: p.weapons.map((w) => ({ ...w })),
      tomes: p.tomes.map((t) => ({ ...t })),
      items: p.items.map((it) => ({ ...it })),
      debuffs: p.debuffs.map((d) => ({ ...d })),
      buffs: p.buffs.map((b) => ({
        id: b.id,
        remainingSec: b.remainingSec,
        modifiers: b.modifiers.map((m) => ({ ...m })),
      })),
      hasCryptKey: p.hasCryptKey,
      hasBossKey: p.hasBossKey,
      dead: p.dead,
    },
    enemies: s.enemies.map((e) => ({
      id: e.id,
      enemyId: e.enemyId,
      role: e.role,
      pos: cloneVec3(e.pos),
      prevPos: cloneVec3(e.prevPos),
      vel: cloneVec3(e.vel),
      yaw: e.yaw,
      hp: e.hp,
      maxHp: e.maxHp,
      radius: e.radius,
      height: e.height,
      damage: e.damage,
      moveSpeed: e.moveSpeed,
      attackTimer: e.attackTimer,
      stunTimer: e.stunTimer,
      charmedTimer: e.charmedTimer,
      isBoss: e.isBoss,
      isElite: e.isElite,
      eliteTags: [...e.eliteTags],
      debuffs: e.debuffs.map((d) => ({ ...d })),
      phaseIndex: e.phaseIndex,
      weaponStealCooldown: e.weaponStealCooldown,
    })),
    projectiles: s.projectiles.map((pr) => ({
      id: pr.id,
      weaponId: pr.weaponId,
      ownerIsPlayer: pr.ownerIsPlayer,
      pos: cloneVec3(pr.pos),
      prevPos: cloneVec3(pr.prevPos),
      vel: cloneVec3(pr.vel),
      radius: pr.radius,
      damage: pr.damage,
      element: pr.element,
      knockback: pr.knockback,
      critBonus: pr.critBonus,
      bouncesLeft: pr.bouncesLeft,
      pierceLeft: pr.pierceLeft,
      lifeSec: pr.lifeSec,
      maxLifeSec: pr.maxLifeSec,
      procCoefficient: pr.procCoefficient,
      isBoomerang: pr.isBoomerang,
      returning: pr.returning,
      homingTargetId: pr.homingTargetId,
      hitEntityIds: [...pr.hitEntityIds],
    })),
    areaEffects: s.areaEffects.map((ae) => ({
      ...ae,
      pos: cloneVec3(ae.pos),
    })),
    pickups: s.pickups.map((pk) => ({
      ...pk,
      pos: cloneVec3(pk.pos),
      vel: cloneVec3(pk.vel),
    })),
    interactables: s.interactables.map((it) => ({
      ...it,
      pos: cloneVec3(it.pos),
      offerPayloadIds: it.offerPayloadIds ? [...it.offerPayloadIds] : undefined,
    })),
    pylons: s.pylons.map((py) => ({
      ...py,
      pos: cloneVec3(py.pos),
    })),
    rails: s.rails.map((r) => ({
      id: r.id,
      totalLength: r.totalLength,
      points: r.points.map(cloneVec3),
    })),
    jumpPads: s.jumpPads.map((jp) => ({
      id: jp.id,
      pos: cloneVec3(jp.pos),
      radius: jp.radius,
      launchVy: jp.launchVy,
      launchForwardBoost: jp.launchForwardBoost ? cloneVec3(jp.launchForwardBoost) : undefined,
    })),
    pendingOffer: s.pendingOffer
      ? {
          ...s.pendingOffer,
          choices: s.pendingOffer.choices.map((c) => ({ ...c })),
        }
      : null,
    stageBossId: s.stageBossId,
    stageBossDefeated: s.stageBossDefeated,
    bossPortalOpen: s.bossPortalOpen,
    bossPortalPos: s.bossPortalPos ? cloneVec3(s.bossPortalPos) : null,
    cryptUnlocked: s.cryptUnlocked,
    bigBobId: s.bigBobId,
    darknessActive: s.darknessActive,
    darknessLamps: s.darknessLamps.map((l) => ({
      ...l,
      pos: cloneVec3(l.pos),
    })),
    finalBossId: s.finalBossId,
    finalSwarmActive: s.finalSwarmActive,
    spookySteveId: s.spookySteveId,
    activeBannerText: s.activeBannerText,
    stageEventsFired: [...s.stageEventsFired],
    invincible: s.invincible,
    rerollsLeft: s.rerollsLeft,
    banishesLeft: s.banishesLeft,
    skipsLeft: s.skipsLeft,
    banishedIds: [...s.banishedIds],
    difficultyMultiplier: s.difficultyMultiplier,
    summary: { ...s.summary },
  };
}

function resolveStageDurationSec(
  mapId: MapId,
  mapTier: MapTier,
  baseDurationSec: number,
  challenge: ChallengeDef | null,
): number {
  let duration = baseDurationSec;
  if ((mapId === 'Forest' || mapId === 'Desert') && baseDurationSec === 600) {
    duration = mapTier === 1 ? 600 : mapTier === 2 ? 540 : 480;
  }
  const timerScale = challenge?.rules.timerScale ?? 1.0;
  return Math.max(30, Math.round(duration * timerScale));
}

function buildFinalBossPylons(
  terrain: ITerrainSampler,
  nextId: () => number,
  pylonPositions?: readonly Vec3[],
): BossPylonState[] {
  const pylons: BossPylonState[] = [];
  if (pylonPositions && pylonPositions.length >= FINAL_BOSS_PYLON_COUNT) {
    for (let i = 0; i < FINAL_BOSS_PYLON_COUNT; i++) {
      const p = pylonPositions[i]!;
      const sample = terrain.sample(p.x, p.z);
      pylons.push({
        id: nextId(),
        index: i,
        pos: { x: p.x, y: sample.height, z: p.z },
        radius: 4.5,
        active: false,
        cleansed: false,
        chargeProgress: 0,
        chargeDurationSec: 4.0,
        stolenWeaponSlotIndex: null,
        stolenWeaponId: null,
      });
    }
    return pylons;
  }

  const ringRadius = 52;
  for (let i = 0; i < FINAL_BOSS_PYLON_COUNT; i++) {
    const angle = (i / FINAL_BOSS_PYLON_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * ringRadius;
    const z = Math.sin(angle) * ringRadius;
    const sample = terrain.sample(x, z);
    pylons.push({
      id: nextId(),
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
  return pylons;
}

export class SimEngine implements ISimEngine {
  private readonly catalog: Readonly<GameCatalog>;
  private state: SimState;
  private prevState: SimState;
  private terrain: ITerrainSampler;
  private terrainBundle: TerrainCreationResult;
  private challenge: ChallengeDef | null = null;
  private shopLevels: Partial<Record<ShopUpgradeId, number>> = {};
  private characterFlags: CharacterPhysicsFlags = {};
  private lavaGroundTicks = 0;

  constructor(catalog: Readonly<GameCatalog> = GAME_CATALOG) {
    this.catalog = catalog;
    // Initialize a valid idle title state so getters are always safe prior to `initRun()`
    this.terrainBundle = createTerrainSampler('Forest', 1, 1);
    this.terrain = this.terrainBundle.sampler;
    this.state = this.createInitialState(
      { seed: 1, characterId: 'Fox', mapId: 'Forest', mapTier: 1 },
      'title',
    );
    this.prevState = cloneSimState(this.state);
  }

  getCatalog(): Readonly<GameCatalog> {
    return this.catalog;
  }

  getState(): Readonly<SimState> {
    return this.state;
  }

  getPrevState(): Readonly<SimState> {
    return this.prevState;
  }

  getTerrainSampler(): ITerrainSampler {
    return this.terrain;
  }

  computeStateHash(): string {
    return computeSimStateHash(this.state);
  }

  private getRng(): () => number {
    return createRngCallback(this.state);
  }

  private recalcStats = (): void => {
    recalculatePlayerStats(
      this.state.player,
      this.catalog,
      this.state.characterId,
      this.challenge,
      this.shopLevels,
    );
  };

  private createInitialState(config: SimConfig, initialPhase: GamePhase): SimState {
    const seed = normalizeSeed(config.seed);
    this.challenge = config.challengeId ? (getChallengeById(config.challengeId) ?? null) : null;
    this.shopLevels = config.shopLevels ? { ...config.shopLevels } : {};

    const terrainBundle = createTerrainSampler(config.mapId, config.mapTier, seed);
    this.terrainBundle = terrainBundle;
    this.terrain = terrainBundle.sampler;
    this.lavaGroundTicks = 0;

    const charDef = getCharacterById(config.characterId) ?? this.catalog.characters[0];
    const mapDef = getMapById(config.mapId) ?? this.catalog.maps[0];
    const colliderScale = charDef?.colliderScale ?? 1.0;

    this.characterFlags = resolveCharacterPhysicsFlags(
      config.characterId,
      charDef?.passive.specialFlags,
      config.challengeId,
    );

    const spawnPoint = this.terrain.getSpawnPoint();
    const spawnSample = this.terrain.sample(spawnPoint.x, spawnPoint.z);
    const startPos: Vec3 = { x: spawnPoint.x, y: spawnSample.height, z: spawnPoint.z };

    const baseStats = createBaseStatBlock();
    const startWeaponId =
      charDef?.startingWeaponId ?? this.catalog.weapons[0]?.id ?? 'WeaponFireStaff';

    const player: PlayerState = {
      pos: cloneVec3(startPos),
      prevPos: cloneVec3(startPos),
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      capsuleRadius: PLAYER_CAPSULE_RADIUS * colliderScale,
      capsuleHeight: PLAYER_CAPSULE_HEIGHT * colliderScale,
      movementState: 'Idle',
      passiveMeter: config.characterId === 'Megachad' ? 1.0 : 0,
      grounded: true,
      groundNormal: cloneVec3(spawnSample.normal),
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      bhopTimer: 0,
      bhopStreak: 0,
      airJumpsRemaining: 0,
      isSliding: false,
      slideTimer: 0,
      wallClimbCooldown: 0,
      wallClimbsUsed: 0,
      railId: null,
      railT: 0,
      railDir: 1,
      peakFallSpeed: 0,
      hp: baseStats.MaxHealth,
      maxHp: baseStats.MaxHealth,
      shield: 0,
      maxShield: 0,
      shieldRegenDelay: 0,
      overheal: 0,
      level: 1,
      xp: 0,
      xpToNext: xpRequired(1),
      gold: 0,
      silverEarned: 0,
      kills: 0,
      revivesLeft: 0,
      invulnTimer: 0,
      safePos: cloneVec3(startPos),
      stats: baseStats,
      weapons: [
        {
          slotIndex: 0,
          weaponId: startWeaponId,
          level: 1,
          cooldownTimer: 0,
          burstRemaining: 0,
          burstTimer: 0,
          stolenByPylonId: null,
          totalDamage: 0,
          kills: 0,
        },
      ],
      tomes: [],
      items: [],
      debuffs: [],
      buffs: [],
      hasCryptKey: false,
      hasBossKey: false,
      dead: false,
    };

    const stageDurationSec = resolveStageDurationSec(
      config.mapId,
      config.mapTier,
      mapDef?.stageDurationSec ?? 600,
      this.challenge,
    );

    const state: SimState = {
      version: SAVE_VERSION,
      seed,
      rngState: deriveSeed(seed, 'sim_rng'),
      tick: 0,
      simTimeSec: 0,
      stageDurationSec,
      phase: initialPhase,
      mapId: config.mapId,
      mapTier: config.mapTier,
      challengeId: config.challengeId ?? null,
      characterId: config.characterId,
      skinId: config.skinId ?? null,
      hatId: config.hatId ?? null,
      nextEntityId: 1,
      player,
      enemies: [],
      projectiles: [],
      areaEffects: [],
      pickups: [],
      interactables: [],
      pylons: [],
      rails: terrainBundle.rails,
      jumpPads: terrainBundle.jumpPads,
      pendingOffer: null,
      stageBossId: null,
      stageBossDefeated: false,
      bossPortalOpen: false,
      bossPortalPos: null,
      cryptUnlocked: false,
      bigBobId: null,
      darknessActive: false,
      darknessLamps: [],
      finalBossId: null,
      finalSwarmActive: false,
      spookySteveId: null,
      activeBannerText: null,
      stageEventsFired: [],
      invincible: false,
      rerollsLeft: 1 + Math.max(0, Math.floor(this.shopLevels.Refresh ?? 0)),
      banishesLeft: 1 + Math.max(0, Math.floor(this.shopLevels.Banish ?? 0)),
      skipsLeft: 1 + Math.max(0, Math.floor(this.shopLevels.Skip ?? 0)),
      banishedIds: [],
      difficultyMultiplier: 1.0,
      summary: {
        totalDamageDealt: 0,
        highestSingleHit: 0,
        critsLanded: 0,
        megacritsLanded: 0,
        bonkersLanded: 0,
        executesLanded: 0,
        enemiesKilled: 0,
        elitesKilled: 0,
        bossesKilled: 0,
        chestsOpened: 0,
        shrinesCompleted: 0,
        pylonsCleansed: 0,
        topSpeedReached: 0,
        longestBhopStreak: 0,
        unstuckRecoveries: 0,
      },
    };

    recalculatePlayerStats(
      state.player,
      this.catalog,
      state.characterId,
      this.challenge,
      this.shopLevels,
    );
    state.player.hp = state.player.maxHp;
    state.player.shield = state.player.maxShield;

    const rng = createRngCallback(state);
    populateInitialInteractables(
      state,
      this.catalog,
      terrainBundle.interactableSpots,
      terrainBundle.bossArenaCenter,
      this.terrain,
      rng,
    );

    if (config.mapId === 'FinalBossMap') {
      state.pylons = buildFinalBossPylons(
        this.terrain,
        () => state.nextEntityId++,
        terrainBundle.pylonPositions,
      );
    }

    return state;
  }

  initRun(config: SimConfig): SimState {
    this.state = this.createInitialState(config, 'playing');
    this.prevState = cloneSimState(this.state);
    return this.state;
  }

  setPhase(phase: GamePhase): SimEvent[] {
    const events: SimEvent[] = [];
    const from = this.state.phase;
    if (from === phase) {
      return events;
    }
    this.state.phase = phase;
    events.push({
      type: 'phase_changed',
      tick: this.state.tick,
      from,
      to: phase,
    });
    return events;
  }

  applyDraftChoice(choiceIndex: number): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    applyDraftChoiceImpl(
      this.state,
      this.catalog,
      choiceIndex,
      rng,
      events,
      this.recalcStats,
      this.shopLevels,
      this.challenge,
    );
    return events;
  }

  rerollDraft(): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    rerollDraftImpl(
      this.state,
      this.catalog,
      rng,
      events,
      this.shopLevels,
      this.challenge,
    );
    return events;
  }

  banishDraftChoice(choiceIndex: number): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    banishDraftChoiceImpl(
      this.state,
      this.catalog,
      choiceIndex,
      rng,
      events,
      this.shopLevels,
      this.challenge,
    );
    return events;
  }

  skipDraft(): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    skipDraftImpl(
      this.state,
      this.catalog,
      rng,
      events,
      this.recalcStats,
      this.shopLevels,
      this.challenge,
    );
    return events;
  }

  step(input: InputFrame): SimEvent[] {
    const events: SimEvent[] = [];

    // Deep-snapshot previous state BEFORE any mutations for smooth renderer interpolation
    this.prevState = cloneSimState(this.state);

    // Pause toggle handling
    if (input.pausePressed) {
      if (this.state.phase === 'playing') {
        events.push(...this.setPhase('paused'));
        return events;
      }
      if (this.state.phase === 'paused') {
        events.push(...this.setPhase('playing'));
        return events;
      }
    }

    // Deterministic draft modal controls when an offer is active
    if (
      this.state.pendingOffer !== null &&
      (this.state.phase === 'level_up' ||
        this.state.phase === 'chest_open' ||
        this.state.phase === 'merchant' ||
        this.state.phase === 'microwave')
    ) {
      if (input.draftChoiceIndex !== null && Number.isInteger(input.draftChoiceIndex)) {
        events.push(...this.applyDraftChoice(input.draftChoiceIndex));
      } else if (input.rerollPressed) {
        events.push(...this.rerollDraft());
      } else if (input.skipPressed) {
        events.push(...this.skipDraft());
      } else if (input.banishPressed) {
        events.push(...this.banishDraftChoice(0));
      }
      return events;
    }

    if (this.state.phase !== 'playing') {
      return events;
    }

    // Advance exact fixed simulation clock (50 Hz => 0.02s/tick, zero cumulative float drift)
    this.state.tick += 1;
    this.state.simTimeSec = this.state.tick * FIXED_DT;

    const rng = this.getRng();
    const onKill = (enemy: EnemyState, isExecute: boolean, weaponId?: string): void => {
      handleEnemyDeath(
        this.state,
        this.catalog,
        enemy,
        isExecute,
        weaponId,
        rng,
        events,
        this.recalcStats,
      );
    };

    // 1. Item internal cooldowns
    stepItemCooldowns(this.state, FIXED_DT);

    // 2. Kinetic player movement & physics (+ Desert roaming tornado wind field)
    const prePhysicsEventIdx = events.length;
    stepPlayerPhysics(this.state, input, this.terrain, events, this.characterFlags);

    if (this.state.mapId === 'Desert' && !this.state.player.dead) {
      const windField = sampleDesertTornadoes(
        this.state.simTimeSec,
        this.state.seed,
        this.terrain.arenaRadius,
        this.terrain,
      );
      applyWindField(this.state.player, windField, FIXED_DT);
    }

    // Challenge: The Floor is Lava (staying grounded scorches player; jumping/sliding/grinding is safe)
    if (this.state.challengeId === 'TheFloorIsLava' && !this.state.player.dead) {
      const p = this.state.player;
      const touchingLava = p.grounded && !p.isSliding && p.railId === null;
      if (touchingLava) {
        this.lavaGroundTicks += 1;
        if (this.lavaGroundTicks >= 22 && (this.lavaGroundTicks - 22) % 25 === 0) {
          const scorchDmg = Math.max(4, Math.round(p.maxHp * 0.06));
          applyPlayerDamage(this.state, this.catalog, scorchDmg, null, rng, events, this.recalcStats);
        }
      } else {
        this.lavaGroundTicks = 0;
      }
    }

    // Graveyard Crypt Escape zone proximity unlock when holding CryptKey
    if (
      this.state.mapId === 'Graveyard' &&
      !this.state.cryptUnlocked &&
      this.state.player.hasCryptKey &&
      this.terrainBundle.cryptEscapeZone
    ) {
      const ez = this.terrainBundle.cryptEscapeZone;
      const dx = this.state.player.pos.x - ez.entryPos.x;
      const dz = this.state.player.pos.z - ez.entryPos.z;
      if (dx * dx + dz * dz <= ez.radius * ez.radius) {
        this.state.cryptUnlocked = true;
        this.state.activeBannerText = 'CRYPT UNLOCKED — ENTER TO FACE BIG BOB!';
      }
    }

    // Dispatch declarative movement item hooks from newly emitted physics events
    for (let i = prePhysicsEventIdx; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'player_jump') {
        dispatchItemTrigger(
          this.state,
          this.catalog,
          'OnJump',
          { pos: cloneVec3(ev.pos), onEnemyKilled: onKill, recalcStats: this.recalcStats },
          rng,
          events,
        );
      } else if (ev.type === 'player_slide_start') {
        dispatchItemTrigger(
          this.state,
          this.catalog,
          'OnSlide',
          { pos: cloneVec3(ev.pos), onEnemyKilled: onKill, recalcStats: this.recalcStats },
          rng,
          events,
        );
      } else if (ev.type === 'player_wall_climb') {
        dispatchItemTrigger(
          this.state,
          this.catalog,
          'OnWallClimb',
          { pos: cloneVec3(ev.pos), onEnemyKilled: onKill, recalcStats: this.recalcStats },
          rng,
          events,
        );
      } else if (ev.type === 'player_rail_attach') {
        dispatchItemTrigger(
          this.state,
          this.catalog,
          'OnRailGrind',
          { pos: cloneVec3(ev.pos), onEnemyKilled: onKill, recalcStats: this.recalcStats },
          rng,
          events,
        );
      }
    }

    // Check if fall damage killed player
    if (this.state.player.dead && this.state.phase === 'playing') {
      events.push(...this.setPhase('game_over'));
      return events;
    }

    // 3. Character passives & timed player buffs
    stepCharacterPassives(
      this.state,
      this.catalog,
      FIXED_DT,
      rng,
      events,
      this.recalcStats,
      onKill,
    );

    // 4. Periodic OnTick item trigger hooks (5 Hz cadence)
    if (this.state.tick % 10 === 0) {
      dispatchItemTrigger(
        this.state,
        this.catalog,
        'OnTick',
        {
          pos: cloneVec3(this.state.player.pos),
          onEnemyKilled: onKill,
          recalcStats: this.recalcStats,
        },
        rng,
        events,
      );
    }

    // 5. Stage timeline, continuous spawner, and Final Swarm escalation
    stepSpawner(
      this.state,
      this.catalog,
      this.terrain,
      FIXED_DT,
      rng,
      events,
      this.challenge,
    );

    // 6. Player weapons, projectiles, and player area effects
    stepWeapons(
      this.state,
      this.catalog,
      input,
      this.terrain,
      FIXED_DT,
      rng,
      events,
      this.recalcStats,
    );

    // 7. Enemy AI, debuffs, spatial separation, attacks, and player regen
    stepEnemies(
      this.state,
      this.catalog,
      this.terrain,
      FIXED_DT,
      rng,
      events,
      this.recalcStats,
    );

    // 8. World interactables, shrines, chests, pots, BossSpawner, BossPortal
    const preEncounterEventIdx = events.length;
    stepEncounters(
      this.state,
      this.catalog,
      input,
      this.terrain,
      FIXED_DT,
      rng,
      events,
      this.recalcStats,
      this.shopLevels,
      this.challenge,
    );

    // If a multi-tier BossPortal transitioned us to a new Map/Tier (T1->T2->T3->FinalBossMap),
    // rebuild the deterministic terrain sampler, rails, jump pads, interactables, and pylons cleanly!
    for (let i = preEncounterEventIdx; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'portal_activated' && this.state.phase === 'playing') {
        this.rebuildTerrainAfterPortalTransition(ev.targetMapId, ev.targetTier, rng);
        break;
      }
    }

    // 9. Pickups magnetism, collection, powerups, and XP level-up checks
    stepPickups(
      this.state,
      this.catalog,
      this.terrain,
      FIXED_DT,
      rng,
      events,
      this.recalcStats,
      this.shopLevels,
      this.challenge,
    );

    // 10. FinalBossMap 11-Pylon proximity charging & stolen weapon reclamation
    this.stepBossPylons(events);

    // Final safety phase sync if combat killed the player
    if (this.state.player.dead && this.state.phase === 'playing') {
      events.push(...this.setPhase('game_over'));
    }

    return events;
  }

  private stepBossPylons(events: SimEvent[]): void {
    if (this.state.phase !== 'playing' || this.state.player.dead || this.state.pylons.length === 0) {
      return;
    }
    const p = this.state.player;
    for (let i = 0; i < this.state.pylons.length; i++) {
      const pylon = this.state.pylons[i];
      if (!pylon.active || pylon.cleansed) continue;
      const dx = p.pos.x - pylon.pos.x;
      const dz = p.pos.z - pylon.pos.z;
      if (dx * dx + dz * dz <= pylon.radius * pylon.radius) {
        pylon.chargeProgress = Math.min(
          pylon.chargeDurationSec,
          pylon.chargeProgress + FIXED_DT,
        );
        if (pylon.chargeProgress >= pylon.chargeDurationSec) {
          this.completePylonCleanse(pylon, events);
        }
      }
    }
  }

  private completePylonCleanse(pylon: BossPylonState, events: SimEvent[]): void {
    if (pylon.cleansed) return;
    pylon.cleansed = true;
    pylon.active = false;
    pylon.chargeProgress = pylon.chargeDurationSec;
    this.state.summary.pylonsCleansed += 1;

    // Reclaim any stolen weapon locked inside this pylon
    if (pylon.stolenWeaponSlotIndex !== null) {
      const slot = this.state.player.weapons.find(
        (w) => w.slotIndex === pylon.stolenWeaponSlotIndex || w.stolenByPylonId === pylon.id,
      );
      if (slot) {
        slot.stolenByPylonId = null;
        events.push({
          type: 'weapon_reclaimed',
          tick: this.state.tick,
          weaponId: slot.weaponId,
          slotIndex: slot.slotIndex,
          pylonId: pylon.id,
        });
      }
      pylon.stolenWeaponSlotIndex = null;
      pylon.stolenWeaponId = null;
    }

    const cleansedCount = this.state.pylons.filter((py) => py.cleansed).length;
    events.push({
      type: 'pylon_charged',
      tick: this.state.tick,
      pylonId: pylon.id,
      index: pylon.index,
      cleansedCount,
      totalPylons: this.state.pylons.length,
      pos: cloneVec3(pylon.pos),
    });

    const stillActive = this.state.pylons.some((py) => py.active && !py.cleansed);
    if (!stillActive && this.state.finalBossId !== null) {
      this.state.activeBannerText = 'PYLON SHIELD BROKEN — STRIKE THE FINAL BOSS!';
    }
  }

  private rebuildTerrainAfterPortalTransition(
    mapId: MapId,
    tier: MapTier,
    rng: () => number,
  ): void {
    const nextSeed = deriveSeed(this.state.seed, `${mapId}:${tier}`);
    const terrainBundle = createTerrainSampler(mapId, tier, nextSeed);
    this.terrainBundle = terrainBundle;
    this.terrain = terrainBundle.sampler;
    this.lavaGroundTicks = 0;

    const spawnPt = this.terrain.getSpawnPoint();
    const spawnSample = this.terrain.sample(spawnPt.x, spawnPt.z);
    const p = this.state.player;
    p.pos = { x: spawnPt.x, y: spawnSample.height, z: spawnPt.z };
    p.prevPos = cloneVec3(p.pos);
    p.vel = { x: 0, y: 0, z: 0 };
    p.grounded = true;
    p.groundNormal = cloneVec3(spawnSample.normal);
    p.isSliding = false;
    p.railId = null;
    p.peakFallSpeed = 0;
    p.safePos = cloneVec3(p.pos);

    this.state.rails = terrainBundle.rails;
    this.state.jumpPads = terrainBundle.jumpPads;
    this.state.interactables = [];
    this.state.pylons = [];

    if (mapId === 'FinalBossMap') {
      this.state.pylons = buildFinalBossPylons(
        this.terrain,
        () => this.state.nextEntityId++,
        terrainBundle.pylonPositions,
      );
      // Place BossSpawner on central dais so player can trigger FinalBoss immediately (or auto-trigger)
      populateInitialInteractables(
        this.state,
        this.catalog,
        terrainBundle.interactableSpots.slice(0, 6),
        terrainBundle.bossArenaCenter,
        this.terrain,
        rng,
      );
    } else {
      populateInitialInteractables(
        this.state,
        this.catalog,
        terrainBundle.interactableSpots,
        terrainBundle.bossArenaCenter,
        this.terrain,
        rng,
      );
    }
  }

  // ==========================================================================
  // DEBUG BRIDGE & QA HELPERS
  // ==========================================================================

  teleportPlayer(pos: Vec3): void {
    const clamped = this.terrain.clampToArena(pos, 2);
    const sample = this.terrain.sample(clamped.x, clamped.z);
    const targetY = Number.isFinite(pos.y) ? Math.max(sample.height, pos.y) : sample.height;
    const p = this.state.player;
    p.pos = { x: clamped.x, y: targetY, z: clamped.z };
    p.prevPos = cloneVec3(p.pos);
    p.vel = { x: 0, y: 0, z: 0 };
    p.railId = null;
    p.isSliding = false;
    p.peakFallSpeed = 0;
    p.grounded = targetY <= sample.height + 0.1;
    p.safePos = { x: clamped.x, y: sample.height, z: clamped.z };
    verifyPosition(this.state, this.terrain, []);
  }

  grantXp(amount: number): SimEvent[] {
    const events: SimEvent[] = [];
    if (!Number.isFinite(amount) || amount <= 0) return events;
    this.state.player.xp += amount;
    const rng = this.getRng();
    checkAndTriggerLevelUp(
      this.state,
      this.catalog,
      rng,
      events,
      this.recalcStats,
      this.shopLevels,
      this.challenge,
    );
    return events;
  }

  grantGold(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.state.player.gold += Math.floor(amount);
  }

  grantWeapon(weaponId: string, level = 1): boolean {
    const def = getWeaponById(weaponId);
    if (!def) return false;
    const clampedLevel = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
    const existing = this.state.player.weapons.find((w) => w.weaponId === def.id);
    if (existing) {
      existing.level = clampedLevel;
    } else {
      this.state.player.weapons.push({
        slotIndex: this.state.player.weapons.length,
        weaponId: def.id,
        level: clampedLevel,
        cooldownTimer: 0,
        burstRemaining: 0,
        burstTimer: 0,
        stolenByPylonId: null,
        totalDamage: 0,
        kills: 0,
      });
    }
    this.recalcStats();
    return true;
  }

  grantTome(tomeId: string, level = 1): boolean {
    const def = getTomeById(tomeId);
    if (!def) return false;
    const clampedLevel = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
    const existing = this.state.player.tomes.find((t) => t.tomeId === def.id);
    if (existing) {
      existing.level = clampedLevel;
    } else {
      this.state.player.tomes.push({
        tomeId: def.id,
        level: clampedLevel,
      });
    }
    this.recalcStats();
    return true;
  }

  grantItem(itemId: string, stacks = 1): boolean {
    const exists = this.catalog.items.some((it) => it.id === itemId);
    if (!exists) return false;
    grantPlayerItem(this.state, itemId, Math.max(1, Math.floor(stacks)), this.recalcStats);
    return true;
  }

  spawnEnemy(enemyId: string, pos?: Vec3, role?: EnemyRole): number {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    const spawned = spawnEnemyEntity(
      this.state,
      this.catalog,
      enemyId,
      this.terrain,
      rng,
      events,
      {
        pos,
        roleOverride: role,
        isElite: role === 'elite',
        challenge: this.challenge,
      },
    );
    return spawned ? spawned.id : -1;
  }

  triggerBoss(): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    triggerStageBoss(this.state, this.catalog, this.terrain, rng, events, {
      challenge: this.challenge,
    });
    return events;
  }

  triggerFinalSwarm(): SimEvent[] {
    const events: SimEvent[] = [];
    const rng = this.getRng();
    triggerFinalSwarm(
      this.state,
      this.catalog,
      this.terrain,
      rng,
      events,
      this.challenge,
    );
    return events;
  }

  cleansePylon(pylonIndex: number): SimEvent[] {
    const events: SimEvent[] = [];
    const pylon = this.state.pylons.find((py) => py.index === pylonIndex);
    if (pylon) {
      this.completePylonCleanse(pylon, events);
    }
    return events;
  }

  setInvincible(enabled: boolean): void {
    this.state.invincible = Boolean(enabled);
  }

  warpStage(mapId: MapId, tier: MapTier): SimState {
    const prev = this.state;
    const nextSeed = deriveSeed(prev.seed, `${mapId}:${tier}`);
    const terrainBundle = createTerrainSampler(mapId, tier, nextSeed);
    this.terrainBundle = terrainBundle;
    this.terrain = terrainBundle.sampler;
    this.lavaGroundTicks = 0;

    const mapDef = getMapById(mapId) ?? this.catalog.maps[0];
    const spawnPoint = this.terrain.getSpawnPoint();
    const spawnSample = this.terrain.sample(spawnPoint.x, spawnPoint.z);
    const startPos: Vec3 = { x: spawnPoint.x, y: spawnSample.height, z: spawnPoint.z };

    // Preserve player progression while resetting per-stage arena entities
    const p = this.state.player;
    p.pos = cloneVec3(startPos);
    p.prevPos = cloneVec3(startPos);
    p.vel = { x: 0, y: 0, z: 0 };
    p.grounded = true;
    p.groundNormal = cloneVec3(spawnSample.normal);
    p.isSliding = false;
    p.railId = null;
    p.peakFallSpeed = 0;
    p.safePos = cloneVec3(startPos);
    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.dead = false;
    for (let i = 0; i < p.weapons.length; i++) {
      p.weapons[i].stolenByPylonId = null;
    }

    this.state.mapId = mapId;
    this.state.mapTier = tier;
    this.state.stageDurationSec = resolveStageDurationSec(
      mapId,
      tier,
      mapDef?.stageDurationSec ?? 600,
      this.challenge,
    );
    this.state.phase = 'playing';
    this.state.enemies = [];
    this.state.projectiles = [];
    this.state.areaEffects = [];
    this.state.pickups = [];
    this.state.interactables = [];
    this.state.pylons = [];
    this.state.rails = terrainBundle.rails;
    this.state.jumpPads = terrainBundle.jumpPads;
    this.state.pendingOffer = null;
    this.state.stageBossId = null;
    this.state.stageBossDefeated = false;
    this.state.bossPortalOpen = false;
    this.state.bossPortalPos = null;
    this.state.darknessActive = false;
    this.state.darknessLamps = [];
    this.state.finalBossId = null;
    this.state.finalSwarmActive = false;
    this.state.spookySteveId = null;
    this.state.activeBannerText = `${(mapDef?.displayName ?? mapId).toUpperCase()} — TIER ${tier}`;
    this.state.stageEventsFired = [];

    const rng = this.getRng();
    populateInitialInteractables(
      this.state,
      this.catalog,
      terrainBundle.interactableSpots,
      terrainBundle.bossArenaCenter,
      this.terrain,
      rng,
    );

    if (mapId === 'FinalBossMap') {
      this.state.pylons = buildFinalBossPylons(
        this.terrain,
        () => this.state.nextEntityId++,
        terrainBundle.pylonPositions,
      );
    }

    this.prevState = cloneSimState(this.state);
    return this.state;
  }
}

export function createSimEngine(catalog?: Readonly<GameCatalog>): SimEngine {
  return new SimEngine(catalog);
}
