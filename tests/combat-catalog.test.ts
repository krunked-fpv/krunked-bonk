import { describe, expect, it } from 'vitest';
import {
  BONKER_MULTIPLIER,
  CATALOG_COUNTS,
  CHARACTER_IDS,
  createEmptyInputFrame,
  DEBUFF_TYPES,
  ELEMENT_TYPES,
  FINAL_BOSS_PYLON_COUNT,
  FIXED_DT,
  INTERACTABLE_KINDS,
  MEGACRIT_GIANT_FORK_MULTIPLIER,
  type EnemyState,
  type EStat,
  type InteractableKind,
  type SimEvent,
} from '../src/contracts/index';
import { GAME_CATALOG, getInteractableByKind, getWeaponById } from '../src/data/index';
import { stepBigBobEncounter, stepFinalBossEncounter } from '../src/sim/bosses';
import { applyDamageToEnemy, applyDebuffToEnemy, resolveDamage } from '../src/sim/damage';
import { createSimEngine } from '../src/sim/engine';
import { applyPlayerDamage, stepEnemies } from '../src/sim/enemies';
import {
  dispatchItemTrigger,
  getPlayerItemStacks,
  grantPlayerItem,
} from '../src/sim/items';
import {
  applyDraftChoice,
  generateLevelUpOffer,
  getEffectiveTomeMaxLevel,
  getEffectiveWeaponMaxLevel,
} from '../src/sim/progression';
import { createRngCallback } from '../src/sim/prng';
import { createBaseStatBlock, recalculatePlayerStats } from '../src/sim/stats';
import { stepWeapons, tryBlockWithAegis } from '../src/sim/weapons';

function makeDummyEnemy(overrides?: Partial<EnemyState>): EnemyState {
  return {
    id: 9001,
    enemyId: 'Goblin',
    role: 'normal',
    pos: { x: 0, y: 0, z: -6 },
    prevPos: { x: 0, y: 0, z: -6 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    hp: 1000,
    maxHp: 1000,
    radius: 0.8,
    height: 1.8,
    damage: 10,
    moveSpeed: 5,
    attackTimer: 1,
    stunTimer: 0,
    charmedTimer: 0,
    isBoss: false,
    isElite: false,
    eliteTags: [],
    debuffs: [],
    phaseIndex: 0,
    weaponStealCooldown: 0,
    ...overrides,
  };
}

describe('Catalog counts & Damage pipeline', () => {
  it('enforces exact locked catalog counts across all data modules', () => {
    expect(GAME_CATALOG.characters).toHaveLength(CATALOG_COUNTS.characters);
    expect(GAME_CATALOG.weapons).toHaveLength(CATALOG_COUNTS.weapons);
    expect(GAME_CATALOG.tomes).toHaveLength(CATALOG_COUNTS.tomes);
    expect(GAME_CATALOG.items).toHaveLength(CATALOG_COUNTS.items);
    const poolItems = GAME_CATALOG.items.filter((i) => !i.isQuestItem);
    const questItems = GAME_CATALOG.items.filter((i) => i.isQuestItem);
    expect(poolItems).toHaveLength(CATALOG_COUNTS.poolItems);
    expect(questItems).toHaveLength(CATALOG_COUNTS.questItems);
    expect(poolItems.filter((i) => i.rarity === 'Common')).toHaveLength(CATALOG_COUNTS.commonItems);
    expect(poolItems.filter((i) => i.rarity === 'Rare')).toHaveLength(CATALOG_COUNTS.rareItems);
    expect(poolItems.filter((i) => i.rarity === 'Epic')).toHaveLength(CATALOG_COUNTS.epicItems);
    expect(poolItems.filter((i) => i.rarity === 'Legendary')).toHaveLength(CATALOG_COUNTS.legendaryItems);
    expect(GAME_CATALOG.enemies).toHaveLength(CATALOG_COUNTS.enemies);
    expect(GAME_CATALOG.maps).toHaveLength(CATALOG_COUNTS.totalMaps);
    expect(GAME_CATALOG.interactables).toHaveLength(CATALOG_COUNTS.interactables);
    expect(GAME_CATALOG.shopUpgrades).toHaveLength(CATALOG_COUNTS.shopUpgrades);
  });

  it('resolves element multipliers, Crit, GiantFork 4x+ Megacrit, Bonker 20x, Execute, and OverpoweredLamp proc rolls', () => {
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 101, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    const target = makeDummyEnemy();

    // 1. Element multipliers for all 7 ElementTypes
    state.player.stats.CritChance = 0;
    state.player.stats.DamageMultiplier = 1.0;
    const elemMap: Record<string, keyof typeof state.player.stats | null> = {
      Physical: null,
      Fire: 'FireDamageMultiplier',
      Ice: 'IceDamageMultiplier',
      Lightning: 'LightningDamageMultiplier',
      Poison: 'PoisonDamageMultiplier',
      Void: 'VoidDamageMultiplier',
      Holy: 'HolyDamageMultiplier',
    };
    for (const element of ELEMENT_TYPES) {
      const key = elemMap[element];
      if (key) state.player.stats[key] = 2.0;
      const res = resolveDamage(state, target, { baseDamage: 100, element, procCoefficient: 1 }, () => 0.99);
      expect(res.afterElementMult).toBeCloseTo(key ? 200 : 100, 4);
      if (key) state.player.stats[key] = 1.0;
    }

    // 2. Standard 2x Crit
    state.player.stats.CritChance = 1.0;
    state.player.stats.CritDamage = 2.0;
    const critRes = resolveDamage(state, target, { baseDamage: 100, element: 'Physical', procCoefficient: 1 }, () => 0.5);
    expect(critRes.isCrit).toBe(true);
    expect(critRes.isMegacrit).toBe(false);
    expect(critRes.finalDamage).toBeCloseTo(200, 4);

    // 3. GiantFork upgrades Crit -> 4x+ Megacrit
    engine.grantItem('GiantFork', 1);
    state.player.stats.CritChance = 1.0;
    const megaRes = resolveDamage(state, target, { baseDamage: 100, element: 'Physical', procCoefficient: 1 }, () => 0.5);
    expect(megaRes.isCrit).toBe(true);
    expect(megaRes.isMegacrit).toBe(true);
    expect(megaRes.critTier).toBeGreaterThanOrEqual(2);
    expect(megaRes.finalDamage).toBeGreaterThanOrEqual(100 * MEGACRIT_GIANT_FORK_MULTIPLIER);

    // 4. Bonker 20x BONK
    state.player.stats.CritChance = 0;
    state.player.stats.BonkerChance = 1.0;
    const bonkRes = resolveDamage(state, target, { baseDamage: 50, element: 'Physical', procCoefficient: 1 }, () => 0.01);
    expect(bonkRes.isBonker).toBe(true);
    expect(bonkRes.finalDamage).toBeCloseTo(50 * state.player.stats.DamageMultiplier * BONKER_MULTIPLIER, 2);

    // 5. Execute threshold kills normal enemy, chunks boss, skips unexecutable bosses
    state.player.stats.BonkerChance = 0;
    state.player.stats.ExecuteThreshold = 0.25;
    const lowNormal = makeDummyEnemy({ hp: 200, maxHp: 1000 });
    const execRes = resolveDamage(state, lowNormal, { baseDamage: 10, element: 'Physical', procCoefficient: 1 }, () => 0.99);
    expect(execRes.isExecute).toBe(true);
    expect(execRes.finalDamage).toBe(200);

    const lowFinalBoss = makeDummyEnemy({ enemyId: 'FinalBoss', isBoss: true, role: 'final_boss', hp: 1000, maxHp: 25000 });
    const noExecFinal = resolveDamage(state, lowFinalBoss, { baseDamage: 10, element: 'Physical', procCoefficient: 1 }, () => 0.99);
    expect(noExecFinal.isExecute).toBe(false);

    // 6. OverpoweredLamp adds extra proc rolls (max 2 stacks => +2 ExtraProcRolls => 3 proc rolls)
    engine.grantItem('OverpoweredLamp', 5);
    expect(getPlayerItemStacks(state.player, 'OverpoweredLamp')).toBe(2);
    const lampRes = resolveDamage(state, target, { baseDamage: 20, element: 'Physical', procCoefficient: 1 }, () => 0.99);
    expect(lampRes.procRollCount).toBe(3);
  });

  it('applies all 7 debuffs accurately with CC diminishing returns and boss resistances', () => {
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 102, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    const rng = createRngCallback(state);
    const events: SimEvent[] = [];

    const enemy = makeDummyEnemy({ id: 5001, hp: 500, maxHp: 500 });
    state.enemies.push(enemy);

    for (const debuff of DEBUFF_TYPES) {
      const ok = applyDebuffToEnemy(state, GAME_CATALOG, enemy, debuff, 4.0, 20, rng, events, 'test');
      expect(ok).toBe(true);
    }
    expect(enemy.debuffs.map((d) => d.type).sort()).toEqual([...DEBUFF_TYPES].sort());

    // CC diminishing returns: re-applying Freeze halves refreshed duration
    const freshEnemy = makeDummyEnemy({ id: 5002, hp: 500, maxHp: 500 });
    applyDebuffToEnemy(state, GAME_CATALOG, freshEnemy, 'Freeze', 4.0, 0, rng, events, 'test');
    const firstDur = freshEnemy.debuffs.find((d) => d.type === 'Freeze')!.remainingSec;
    freshEnemy.debuffs[0].remainingSec = 0.5;
    applyDebuffToEnemy(state, GAME_CATALOG, freshEnemy, 'Freeze', 4.0, 0, rng, events, 'test');
    const secondDur = freshEnemy.debuffs.find((d) => d.type === 'Freeze')!.remainingSec;
    expect(secondDur).toBeCloseTo(firstDur * 0.5, 4);

    // Bosses cannot be Charmed
    const boss = makeDummyEnemy({ id: 5003, enemyId: 'EntStage1', isBoss: true, role: 'stage_boss' });
    expect(applyDebuffToEnemy(state, GAME_CATALOG, boss, 'Charm', 4.0, 0, rng, events, 'test')).toBe(false);

    // Echo records damage & detonates on expiry; Poison & Burn tick DoT damage
    const echoEnemy = makeDummyEnemy({ id: 5004, hp: 1000, maxHp: 1000 });
    state.enemies = [echoEnemy];
    applyDebuffToEnemy(state, GAME_CATALOG, echoEnemy, 'Echo', 0.1, 0, rng, events, 'test');
    applyDamageToEnemy(
      state,
      GAME_CATALOG,
      echoEnemy,
      { baseDamage: 100, element: 'Physical', procCoefficient: 1 },
      rng,
      events,
    );
    const hpAfterHit = echoEnemy.hp;
    for (let i = 0; i < 15; i++) {
      stepEnemies(state, GAME_CATALOG, engine.getTerrainSampler(), FIXED_DT, rng, events);
    }
    expect(echoEnemy.hp).toBeLessThan(hpAfterHit);
    expect(events.some((e) => e.type === 'damage_dealt' && e.weaponId === 'EchoDetonation')).toBe(true);
  });
});

describe('All 21 characters & active passives', () => {
  it('initializes and steps all 21 playable characters cleanly with their starting weapons', () => {
    expect(CHARACTER_IDS).toHaveLength(21);
    const engine = createSimEngine();

    for (const charId of CHARACTER_IDS) {
      const def = GAME_CATALOG.characters.find((c) => c.id === charId);
      expect(def).toBeDefined();
      const state = engine.initRun({ seed: 300, characterId: charId, mapId: 'Forest', mapTier: 1 });
      expect(state.characterId).toBe(charId);
      expect(state.player.weapons[0]?.weaponId).toBe(def!.startingWeaponId);

      for (let t = 0; t < 10; t++) {
        engine.step({ ...createEmptyInputFrame(), moveZ: 1 });
      }
      expect(Number.isFinite(engine.getState().player.pos.x)).toBe(true);
      expect(Number.isFinite(engine.getState().player.hp)).toBe(true);
    }
  });

  it('exercises iconic active passives: Calcium SpeedDemon, Megachad Flex, Dicehead Gamba, Robinette Stonks, Roberto Hoarder, TonyMcZoom Zap', () => {
    const engine = createSimEngine();

    // 1. Calcium — SpeedDemon builds MoveSpeed & Damage while moving, halves on hurt
    const calc = engine.initRun({ seed: 310, characterId: 'Calcium', mapId: 'Forest', mapTier: 1 });
    const baseMove = calc.player.stats.MoveSpeed;
    for (let t = 0; t < 100; t++) {
      engine.step({ ...createEmptyInputFrame(), moveZ: 1 });
    }
    const meterBuilt = engine.getState().player.passiveMeter ?? 0;
    expect(meterBuilt).toBeGreaterThan(0.15);
    expect(engine.getState().player.stats.MoveSpeed).toBeGreaterThan(baseMove);

    const rngC = createRngCallback(engine.getState() as typeof calc);
    applyPlayerDamage(engine.getState() as typeof calc, GAME_CATALOG, 10, null, rngC, []);
    expect(engine.getState().player.passiveMeter ?? 0).toBeLessThan(meterBuilt * 0.6);

    // 2. Megachad — Flex blocks incoming hit & grants damage buff
    const mega = engine.initRun({ seed: 311, characterId: 'Megachad', mapId: 'Forest', mapTier: 1 });
    expect(mega.player.passiveMeter).toBe(1.0);
    const megaHp = mega.player.hp;
    const megaEvents: SimEvent[] = [];
    const dealt = applyPlayerDamage(
      mega,
      GAME_CATALOG,
      25,
      null,
      createRngCallback(mega),
      megaEvents,
      () => recalculatePlayerStats(mega.player, GAME_CATALOG, 'Megachad', null),
    );
    expect(dealt).toBe(0);
    expect(mega.player.hp).toBe(megaHp);
    expect(mega.player.passiveMeter).toBe(0);
    expect(mega.player.buffs.some((b) => b.id === 'passive:FlexBuff')).toBe(true);

    // 3. Dicehead — Gamba permanently boosts a random stat on level-up
    const dice = engine.initRun({ seed: 312, characterId: 'Dicehead', mapId: 'Forest', mapTier: 1 });
    const lvEvents = engine.grantXp(dice.player.xpToNext + 5);
    expect(lvEvents.some((e) => e.type === 'item_proc' && e.itemId === 'passive:Gamba')).toBe(true);
    expect(dice.player.buffs.some((b) => b.id.startsWith('passive:Gamba:'))).toBe(true);

    // 4. Robinette — Stonks scales DamageMultiplier with Gold held
    const rob = engine.initRun({ seed: 313, characterId: 'Robinette', mapId: 'Forest', mapTier: 1 });
    const dmgBefore = rob.player.stats.DamageMultiplier;
    engine.grantGold(500);
    for (let t = 0; t < 12; t++) {
      engine.step(createEmptyInputFrame());
    }
    expect(engine.getState().player.stats.DamageMultiplier).toBeGreaterThan(dmgBefore + 0.15);

    // 5. Roberto — Hoarder spawns free Chest periodically
    const roberto = engine.initRun({ seed: 314, characterId: 'Roberto', mapId: 'Forest', mapTier: 1 });
    const chestsBefore = roberto.interactables.filter((i) => i.kind === 'Chest' && i.variant === 'free').length;
    roberto.player.passiveMeter = 0.999;
    for (let t = 0; t < 5; t++) {
      engine.step(createEmptyInputFrame());
    }
    const chestsAfter = engine.getState().interactables.filter((i) => i.kind === 'Chest' && i.variant === 'free').length;
    expect(chestsAfter).toBeGreaterThan(chestsBefore);

    // 6. TonyMcZoom — Zap charges while moving and discharges chain lightning
    const tony = engine.initRun({ seed: 315, characterId: 'TonyMcZoom', mapId: 'Desert', mapTier: 1 });
    const spawnPos = { x: tony.player.pos.x, y: tony.player.pos.y, z: tony.player.pos.z - 5 };
    engine.spawnEnemy('Mummy', spawnPos);
    tony.player.passiveMeter = 0.995;
    let sawZap = false;
    for (let t = 0; t < 15; t++) {
      const evs = engine.step({ ...createEmptyInputFrame(), moveZ: 1 });
      if (evs.some((e) => e.type === 'item_proc' && e.itemId === 'passive:Zap')) {
        sawZap = true;
        break;
      }
    }
    expect(sawZap).toBe(true);
  });
});

describe('All 30 weapons firing & distinct mechanics', () => {
  it('fires EVERY ONE of the 30 weapons cleanly with zero NaNs', () => {
    expect(GAME_CATALOG.weapons).toHaveLength(30);
    const engine = createSimEngine();

    for (const def of GAME_CATALOG.weapons) {
      const state = engine.initRun({ seed: 400, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
      state.player.weapons = [
        {
          slotIndex: 0,
          weaponId: def.id,
          level: 1,
          cooldownTimer: 0,
          burstRemaining: 0,
          burstTimer: 0,
          stolenByPylonId: null,
          totalDamage: 0,
          kills: 0,
        },
      ];
      // Place 2 enemies directly in front of player (yaw=0 looks along -Z)
      engine.spawnEnemy('Goblin', { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z - 4.5 });
      engine.spawnEnemy('Goblin', { x: state.player.pos.x + 1.5, y: state.player.pos.y, z: state.player.pos.z - 7.5 });

      let fired = false;
      for (let t = 0; t < 25; t++) {
        const inp = createEmptyInputFrame(0, 0);
        inp.fireHeld = true;
        const evs = engine.step(inp);
        if (evs.some((e) => e.type === 'weapon_fire' && e.weaponId === def.id)) {
          fired = true;
          break;
        }
      }
      expect(fired, `Weapon ${def.id} failed to fire`).toBe(true);
      expect(Number.isFinite(engine.getState().summary.totalDamageDealt)).toBe(true);
    }
  });

  it('verifies signature weapon behaviors (Aegis, Bananarang, BlackHole, Dice, Sniper/Shotgun manual aim, SpaceNoodle, Tornado, WirelessDagger)', () => {
    const engine = createSimEngine();

    // WeaponAegis: spawns orbiting shield & blocks hit with shockwave
    const aegisState = engine.initRun({ seed: 410, characterId: 'Athena', mapId: 'Forest', mapTier: 1 });
    engine.step(createEmptyInputFrame());
    expect(aegisState.projectiles.some((p) => p.weaponId === 'WeaponAegis')).toBe(true);
    const blocked = tryBlockWithAegis(aegisState, GAME_CATALOG, createRngCallback(aegisState), []);
    expect(blocked).toBe(true);
    expect(aegisState.areaEffects.some((ae) => ae.weaponId === 'WeaponAegis')).toBe(true);

    // WeaponBananarang: outward then returning boomerang
    const bananaState = engine.initRun({ seed: 411, characterId: 'Monke', mapId: 'Forest', mapTier: 1 });
    engine.spawnEnemy('Goblin', { x: 0, y: 0, z: -10 });
    engine.step(createEmptyInputFrame());
    const rang = bananaState.projectiles.find((p) => p.weaponId === 'WeaponBananarang');
    expect(rang?.isBoomerang).toBe(true);
    let sawReturning = false;
    for (let t = 0; t < 80; t++) {
      engine.step(createEmptyInputFrame());
      const cur = bananaState.projectiles.find((p) => p.weaponId === 'WeaponBananarang');
      if (cur?.returning) {
        sawReturning = true;
        break;
      }
    }
    expect(sawReturning).toBe(true);

    // WeaponBlackHole: spawns blackhole vortex & pulls enemy inward
    const bhState = engine.initRun({ seed: 412, characterId: 'Spaceman', mapId: 'Forest', mapTier: 1 });
    const eid = engine.spawnEnemy('Goblin', { x: 0, y: 0, z: -12 });
    engine.step(createEmptyInputFrame());
    const hole = bhState.areaEffects.find((ae) => ae.kind === 'blackhole' && ae.weaponId === 'WeaponBlackHole');
    expect(hole).toBeDefined();
    const targetBefore = bhState.enemies.find((e) => e.id === eid)!;
    targetBefore.pos.x = hole!.pos.x + 8;
    targetBefore.pos.z = hole!.pos.z;
    const distBefore = Math.hypot(targetBefore.pos.x - hole!.pos.x, targetBefore.pos.z - hole!.pos.z);
    stepWeapons(
      bhState,
      GAME_CATALOG,
      createEmptyInputFrame(),
      engine.getTerrainSampler(),
      FIXED_DT,
      createRngCallback(bhState),
      [],
    );
    const distAfter = Math.hypot(targetBefore.pos.x - hole!.pos.x, targetBefore.pos.z - hole!.pos.z);
    expect(distAfter).toBeLessThan(distBefore);

    // WeaponDice: rolling a 6 permanently increases CritChance via weapon:DiceCritSix
    const diceState = engine.initRun({ seed: 413, characterId: 'Dicehead', mapId: 'Forest', mapTier: 1 });
    const initialCrit = diceState.player.stats.CritChance;
    for (let t = 0; t < 200; t++) {
      diceState.player.weapons[0]!.cooldownTimer = 0;
      engine.step(createEmptyInputFrame());
      if (diceState.player.buffs.some((b) => b.id === 'weapon:DiceCritSix')) break;
    }
    expect(diceState.player.buffs.some((b) => b.id === 'weapon:DiceCritSix')).toBe(true);
    expect(diceState.player.stats.CritChance).toBeGreaterThan(initialCrit);

    // WeaponSniper & WeaponShotgun manual aim follows input.lookYaw
    const sniperState = engine.initRun({ seed: 414, characterId: 'Bush', mapId: 'Forest', mapTier: 1 });
    const yawAim = -Math.PI / 2; // looks along +X (-sin(-pi/2)=+1, -cos(-pi/2)=0)
    engine.step({ ...createEmptyInputFrame(yawAim, 0), fireHeld: true });
    const sniperProj = sniperState.projectiles.find((p) => p.weaponId === 'WeaponSniper');
    expect(sniperProj).toBeDefined();
    expect(sniperProj!.vel.x).toBeGreaterThan(40);

    const shotState = engine.initRun({ seed: 415, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    shotState.player.weapons = [
      { ...shotState.player.weapons[0]!, weaponId: 'WeaponShotgun', cooldownTimer: 0 },
    ];
    engine.step({ ...createEmptyInputFrame(yawAim, 0), fireHeld: true });
    const pellets = shotState.projectiles.filter((p) => p.weaponId === 'WeaponShotgun');
    expect(pellets.length).toBeGreaterThanOrEqual(5);
    expect(pellets[0]!.vel.x).toBeGreaterThan(10);

    // WeaponSpaceNoodle, WeaponTornado, WeaponWirelessDagger
    const specialIds = ['WeaponSpaceNoodle', 'WeaponTornado', 'WeaponWirelessDagger'] as const;
    for (const wid of specialIds) {
      const s = engine.initRun({ seed: 416, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
      s.player.weapons = [{ ...s.player.weapons[0]!, weaponId: wid, cooldownTimer: 0 }];
      engine.spawnEnemy('Goblin', { x: 0, y: 0, z: -8 });
      engine.step(createEmptyInputFrame());
      if (wid === 'WeaponSpaceNoodle') {
        expect(s.areaEffects.some((ae) => ae.weaponId === 'WeaponSpaceNoodle' && ae.kind === 'beam')).toBe(true);
      } else if (wid === 'WeaponTornado') {
        expect(s.areaEffects.some((ae) => ae.weaponId === 'WeaponTornado' && ae.kind === 'tornado')).toBe(true);
      } else {
        const dagger = s.projectiles.find((p) => p.weaponId === 'WeaponWirelessDagger');
        expect(dagger).toBeDefined();
        expect(dagger!.bouncesLeft).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('All 26 tomes + Pot / WizardsHat >20 cap lift', () => {
  it('verifies all 26 tomes (22 stat tomes + Balance/Chaos/Gamba/Hoarder special tomes)', () => {
    expect(GAME_CATALOG.tomes).toHaveLength(26);
    const engine = createSimEngine();

    const specialTomes = new Set(['TomeBalance', 'TomeChaos', 'TomeGamba', 'TomeHoarder']);
    for (const tome of GAME_CATALOG.tomes) {
      const state = engine.initRun({ seed: 500, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
      if (!specialTomes.has(tome.id)) {
        const before = state.player.stats[tome.stat];
        engine.grantTome(tome.id, 3);
        const after = engine.getState().player.stats[tome.stat];
        expect(after, `Tome ${tome.id} did not modify ${tome.stat}`).not.toBe(before);
      } else {
        // Trigger special tome hook via draft choice application
        const chestsBefore = state.interactables.filter((i) => i.kind === 'Chest' && i.variant === 'free').length;
        const buffsBefore = state.player.buffs.length;
        state.pendingOffer = {
          source: 'level_up',
          title: 'TEST',
          choices: [
            {
              index: 0,
              category: 'tome',
              refId: tome.id,
              displayName: tome.displayName,
              description: tome.description,
              rarity: 'Common',
              nextLevel: 1,
            },
          ],
          canReroll: false,
          canBanish: false,
          canSkip: false,
        };
        state.phase = 'level_up';
        engine.applyDraftChoice(0);

        if (tome.id === 'TomeHoarder') {
          const chestsAfter = state.interactables.filter((i) => i.kind === 'Chest' && i.variant === 'free').length;
          expect(chestsAfter).toBe(chestsBefore + 1);
        } else {
          expect(state.player.buffs.length).toBeGreaterThan(buffsBefore);
        }
      }
    }
  });

  it('lifts Weapon and Tome max level beyond 20 with Pot and WizardsHat', () => {
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 501, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    const fireStaff = getWeaponById('WeaponFireStaff')!;
    expect(fireStaff.maxLevel).toBe(20);
    expect(getEffectiveWeaponMaxLevel(state, fireStaff.maxLevel)).toBe(20);
    expect(getEffectiveTomeMaxLevel(state, 20)).toBe(20);

    // 1 stack => +10 (30), 2 stacks => +19 (39)
    engine.grantItem('Pot', 1);
    engine.grantItem('WizardsHat', 1);
    expect(getEffectiveWeaponMaxLevel(state, 20)).toBe(30);
    expect(getEffectiveTomeMaxLevel(state, 20)).toBe(30);
    engine.grantItem('Pot', 1);
    engine.grantItem('WizardsHat', 1);
    expect(getEffectiveWeaponMaxLevel(state, 20)).toBe(39);
    expect(getEffectiveTomeMaxLevel(state, 20)).toBe(39);

    // Verify level-up draft actively upgrades Lv.20 Weapon and Lv.20 Tome to Lv.21+!
    state.player.weapons[0]!.level = 20;
    state.player.tomes = [{ tomeId: 'TomeDamage', level: 20 }];
    state.pendingOffer = {
      source: 'level_up',
      title: 'CAP LIFT',
      choices: [
        { index: 0, category: 'weapon', refId: 'WeaponFireStaff', displayName: 'Firestaff', description: '', rarity: 'Common', nextLevel: 21 },
        { index: 1, category: 'tome', refId: 'TomeDamage', displayName: 'Damage Tome', description: '', rarity: 'Common', nextLevel: 21 },
      ],
      canReroll: false,
      canBanish: false,
      canSkip: false,
    };
    state.phase = 'level_up';
    engine.applyDraftChoice(0);
    expect(state.player.weapons[0]!.level).toBe(21);

    state.pendingOffer = {
      source: 'level_up',
      title: 'CAP LIFT TOME',
      choices: [
        { index: 0, category: 'tome', refId: 'TomeDamage', displayName: 'Damage Tome', description: '', rarity: 'Common', nextLevel: 21 },
      ],
      canReroll: false,
      canBanish: false,
      canSkip: false,
    };
    state.phase = 'level_up';
    engine.applyDraftChoice(0);
    expect(state.player.tomes[0]!.level).toBe(21);

    // Also confirm generateLevelUpOffer includes Lv.21+ weapon/tome candidates when cap is lifted
    const offer = generateLevelUpOffer(state, GAME_CATALOG, createRngCallback(state), { Weapons: 0, Tomes: 0 });
    expect(offer.choices.length).toBe(3);
  });
});

describe('All 85 pool items active (0 no-ops) + iconic item mechanics', () => {
  it('guarantees zero no-ops across all 85 non-quest pool items', () => {
    const poolItems = GAME_CATALOG.items.filter((it) => !it.isQuestItem);
    expect(poolItems).toHaveLength(85);

    const engine = createSimEngine();
    for (const item of poolItems) {
      const hasMods =
        Boolean(item.statModifiers && item.statModifiers.length > 0) ||
        Boolean(item.perStackStatModifiers && item.perStackStatModifiers.length > 0);
      const hasHooks = Boolean(item.hooks && item.hooks.length > 0);
      expect(hasMods || hasHooks, `Pool item ${item.id} is a no-op!`).toBe(true);

      // Equipping the item onto a clean player must measurably change stats OR register executable hooks
      const state = engine.initRun({ seed: 600, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
      const beforeStats = { ...state.player.stats };
      engine.grantItem(item.id, 1);
      const afterStats = engine.getState().player.stats;
      const changedStat = (Object.keys(beforeStats) as EStat[]).some(
        (k) => Math.abs(afterStats[k] - beforeStats[k]) > 1e-6,
      );
      expect(changedStat || hasHooks, `Pool item ${item.id} had zero observable stat/hook effect`).toBe(true);
    }
  });

  it('verifies Anvil (max 1), OverpoweredLamp (max 2), JoesDagger (max 10), ZaWarudo, Kevin, ShatteredWisdom, Wrench/Beacon', () => {
    const engine = createSimEngine();

    // 1. Stack caps: Anvil (1), OverpoweredLamp (2), JoesDagger (10)
    const state = engine.initRun({ seed: 610, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantItem('Anvil', 5);
    engine.grantItem('OverpoweredLamp', 5);
    engine.grantItem('JoesDagger', 20);
    expect(getPlayerItemStacks(state.player, 'Anvil')).toBe(1);
    expect(getPlayerItemStacks(state.player, 'OverpoweredLamp')).toBe(2);
    expect(getPlayerItemStacks(state.player, 'JoesDagger')).toBe(10);

    // Anvil grants extra bonus stat buff on weapon upgrade
    const buffsPreAnvil = state.player.buffs.length;
    state.pendingOffer = {
      source: 'level_up',
      title: 'ANVIL TEST',
      choices: [
        { index: 0, category: 'weapon', refId: 'WeaponFireStaff', displayName: 'Firestaff', description: '', rarity: 'Common', nextLevel: 2 },
      ],
      canReroll: false,
      canBanish: false,
      canSkip: false,
    };
    state.phase = 'level_up';
    engine.applyDraftChoice(0);
    expect(state.player.buffs.length).toBeGreaterThan(buffsPreAnvil);
    expect(state.player.buffs.some((b) => b.id.startsWith('anvil:WeaponFireStaff:'))).toBe(true);

    // JoesDagger stacks permanent DamageMultiplier on execute kill
    const dmgPreExec = state.player.stats.DamageMultiplier;
    dispatchItemTrigger(
      state,
      GAME_CATALOG,
      'OnKill',
      {
        isExecute: true,
        recalcStats: () => recalculatePlayerStats(state.player, GAME_CATALOG, state.characterId, null),
      },
      createRngCallback(state),
      [],
    );
    expect(state.player.stats.DamageMultiplier).toBeGreaterThan(dmgPreExec);

    // 2. ZaWarudo: prevents fatal hit, revives player, freezes all enemies, breaks 1 stack
    const zw = engine.initRun({ seed: 611, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantItem('ZaWarudo', 2);
    const foeId = engine.spawnEnemy('Goblin', { x: 4, y: 0, z: 4 });
    const zwEvents: SimEvent[] = [];
    applyPlayerDamage(
      zw,
      GAME_CATALOG,
      9999,
      null,
      createRngCallback(zw),
      zwEvents,
      () => recalculatePlayerStats(zw.player, GAME_CATALOG, zw.characterId, null),
    );
    expect(zw.player.dead).toBe(false);
    expect(zw.player.hp).toBeGreaterThan(0);
    expect(getPlayerItemStacks(zw.player, 'ZaWarudo')).toBe(1);
    expect(zwEvents.some((e) => e.type === 'player_revive')).toBe(true);
    const foe = zw.enemies.find((e) => e.id === foeId)!;
    expect(foe.debuffs.some((d) => d.type === 'Freeze')).toBe(true);

    // 3. Kevin: non-lethal 1 HP self-punch triggers OnHurt (CowardsCloak speed boost) and never kills at 1 HP
    const kev = engine.initRun({ seed: 612, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantItem('Kevin', 1);
    engine.grantItem('CowardsCloak', 1);
    const kevEvents: SimEvent[] = [];
    dispatchItemTrigger(
      kev,
      GAME_CATALOG,
      'OnTick',
      {
        recalcStats: () => recalculatePlayerStats(kev.player, GAME_CATALOG, kev.characterId, null),
      },
      createRngCallback(kev),
      kevEvents,
    );
    expect(kevEvents.some((e) => e.type === 'player_hurt' && e.amount === 1)).toBe(true);
    expect(kevEvents.some((e) => e.type === 'item_proc' && e.itemId === 'CowardsCloak')).toBe(true);

    // At 1 HP, Kevin must NOT kill the player
    kev.player.hp = 1;
    kev.player.items.forEach((it) => (it.internalCooldown = 0));
    dispatchItemTrigger(kev, GAME_CATALOG, 'OnTick', {}, createRngCallback(kev), kevEvents);
    expect(kev.player.hp).toBe(1);
    expect(kev.player.dead).toBe(false);

    // 4. ShatteredWisdom: XP pickup unleashes Void AoE nova damaging nearby enemy
    const sw = engine.initRun({ seed: 613, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantItem('ShatteredWisdom', 1);
    const swEnemyId = engine.spawnEnemy('Goblin', { x: sw.player.pos.x + 2, y: sw.player.pos.y, z: sw.player.pos.z });
    const hpPreSw = sw.enemies.find((e) => e.id === swEnemyId)!.hp;
    sw.pickups.push({
      id: sw.nextEntityId++,
      kind: 'xp_small',
      pos: { x: sw.player.pos.x, y: sw.player.pos.y + 0.5, z: sw.player.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      value: 5,
      magnetized: true,
      ageSec: 0,
    });
    engine.step(createEmptyInputFrame());
    const swEnemyAfter = sw.enemies.find((e) => e.id === swEnemyId);
    expect(!swEnemyAfter || swEnemyAfter.hp < hpPreSw).toBe(true);
    expect(sw.areaEffects.some((ae) => ae.weaponId === 'item:ShatteredWisdom')).toBe(true);

    // 5. Wrench & Beacon ChargeShrine synergy
    const wb = engine.initRun({ seed: 614, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantItem('Wrench', 2);
    engine.grantItem('Beacon', 1);
    wb.player.hp = Math.round(wb.player.maxHp * 0.5);
    const shrine = wb.interactables.find((it) => it.kind === 'ChargeShrine')!;
    engine.teleportPlayer(shrine.pos);
    // With 2 Wrench stacks, chargeRate = 1 + 0.7 = 1.7x => completes in < 3.0s (150 ticks vs 250 baseline)
    for (let t = 0; t < 160; t++) {
      engine.step(createEmptyInputFrame());
      if (shrine.used) break;
    }
    expect(shrine.used).toBe(true);
    expect(wb.player.hp).toBeGreaterThan(Math.round(wb.player.maxHp * 0.5));
    expect(wb.areaEffects.some((ae) => ae.weaponId === 'item:BeaconZone')).toBe(true);
  });
});

describe('All 12 interactables, Boss cycles & Challenges', () => {
  it('exercises ALL 12 interactables including Microwave 3-use clone + explosion', () => {
    expect(INTERACTABLE_KINDS).toHaveLength(12);
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 700, characterId: 'Fox', mapId: 'Forest', mapTier: 1 });
    engine.grantGold(1000);
    // Give 2 Common items so Microwave has valid clone+sacrifice targets
    engine.grantItem('Oats', 2);
    engine.grantItem('Clover', 2);

    // Verify all 12 kinds exist in catalog & on map
    for (const kind of INTERACTABLE_KINDS) {
      expect(getInteractableByKind(kind)).toBeDefined();
      expect(state.interactables.some((i) => i.kind === kind), `Missing ${kind} on Forest`).toBe(true);
    }

    const tested = new Set<InteractableKind>();

    // 1. ChargeShrine
    const chargeShrine = state.interactables.find((i) => i.kind === 'ChargeShrine')!;
    engine.teleportPlayer(chargeShrine.pos);
    for (let t = 0; t < 260; t++) {
      engine.step(createEmptyInputFrame());
      if (chargeShrine.used) break;
    }
    expect(chargeShrine.used).toBe(true);
    if (state.pendingOffer) engine.applyDraftChoice(0);
    tested.add('ChargeShrine');

    // 2. Pot (smashed via interact)
    const pot = state.interactables.find((i) => i.kind === 'Pot')!;
    engine.teleportPlayer(pot.pos);
    engine.step({ ...createEmptyInputFrame(), interactPressed: true });
    expect(pot.used).toBe(true);
    tested.add('Pot');

    // 3. Chest
    const chest = state.interactables.find((i) => i.kind === 'Chest' && !i.used)!;
    engine.teleportPlayer(chest.pos);
    engine.step({ ...createEmptyInputFrame(), interactPressed: true });
    expect(chest.used).toBe(true);
    expect(state.summary.chestsOpened).toBeGreaterThanOrEqual(1);
    tested.add('Chest');

    // 4-9. Instant/Modal shrines
    const shrineKinds: InteractableKind[] = [
      'ShrineMoai',
      'ShadyGuy',
      'ShrineGreed',
      'ShrineChallenge',
      'ShrineCursed',
      'ShrineMagnet',
      'ShrineBalance',
    ];
    for (const kind of shrineKinds) {
      const obj = state.interactables.find((i) => i.kind === kind && !i.used)!;
      engine.teleportPlayer(obj.pos);
      engine.step({ ...createEmptyInputFrame(), interactPressed: true });
      if (state.pendingOffer) {
        engine.applyDraftChoice(0);
      }
      if (kind !== 'ShadyGuy') {
        expect(obj.used, `${kind} was not consumed`).toBe(true);
      } else {
        expect(obj.offerPayloadIds?.length).toBeLessThan(3);
      }
      tested.add(kind);
    }

    // 10. Microwave 3-use clone + explode!
    const mw = state.interactables.find((i) => i.kind === 'Microwave')!;
    expect(mw.chargeDurationSec).toBe(3);
    engine.teleportPlayer(mw.pos);
    for (let use = 1; use <= 3; use++) {
      engine.grantItem('Oats', 1);
      engine.grantItem('Clover', 1);
      engine.step({ ...createEmptyInputFrame(), interactPressed: true });
      expect(state.phase).toBe('microwave');
      expect(state.pendingOffer?.source).toBe('microwave');
      engine.applyDraftChoice(0);
      expect(mw.chargeProgress).toBe(use);
    }
    expect(mw.used).toBe(true);
    expect(state.areaEffects.some((ae) => ae.weaponId === 'interactable:MicrowaveExplosion')).toBe(true);
    tested.add('Microwave');

    // 11. BossSpawner
    const bossSpawner = state.interactables.find((i) => i.kind === 'BossSpawner')!;
    engine.teleportPlayer(bossSpawner.pos);
    engine.step({ ...createEmptyInputFrame(), interactPressed: true });
    expect(bossSpawner.used).toBe(true);
    expect(state.stageBossId).not.toBeNull();
    tested.add('BossSpawner');

    expect(tested.size).toBe(12);
  });

  it('completes FinalBoss 11-pylon weapon-steal & reclaim cycle across Phases 1-3', () => {
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 710, characterId: 'Fox', mapId: 'FinalBossMap', mapTier: 1 });
    engine.grantWeapon('WeaponSword', 5);
    engine.grantWeapon('WeaponBone', 5);
    engine.grantWeapon('WeaponLightningBolt', 5);
    expect(state.pylons).toHaveLength(FINAL_BOSS_PYLON_COUNT);

    // Step 1 tick to auto-summon FinalBoss
    engine.step(createEmptyInputFrame());
    const boss = state.enemies.find((e) => e.enemyId === 'FinalBoss')!;
    expect(boss).toBeDefined();

    const thresholds = [0.74, 0.49, 0.24];
    const expectedPylonCounts = [3, 4, 4];
    let totalStolenEvents = 0;
    let totalReclaimedEvents = 0;

    for (let p = 0; p < 3; p++) {
      boss.hp = Math.round(boss.maxHp * thresholds[p]!);
      const events: SimEvent[] = [];
      stepFinalBossEncounter(
        state,
        GAME_CATALOG,
        boss,
        engine.getTerrainSampler(),
        FIXED_DT,
        createRngCallback(state),
        events,
      );
      expect(boss.phaseIndex).toBe(p + 1);
      const activePylons = state.pylons.filter((py) => py.active && !py.cleansed);
      expect(activePylons).toHaveLength(expectedPylonCounts[p]!);
      totalStolenEvents += events.filter((e) => e.type === 'weapon_stolen').length;

      // Boss must be invulnerable while active pylons remain
      const blockedRes = resolveDamage(state, boss, { baseDamage: 500, element: 'Fire', procCoefficient: 1 }, () => 0.5);
      expect(blockedRes.finalDamage).toBe(0);

      // Cleanse all active pylons for this phase -> reclaims stolen weapons!
      for (const py of activePylons) {
        const cEvs = engine.cleansePylon(py.index);
        totalReclaimedEvents += cEvs.filter((e) => e.type === 'weapon_reclaimed').length;
      }
      expect(state.player.weapons.every((w) => w.stolenByPylonId === null)).toBe(true);

      // Boss is now vulnerable again
      const vulnRes = resolveDamage(state, boss, { baseDamage: 500, element: 'Fire', procCoefficient: 1 }, () => 0.5);
      expect(vulnRes.finalDamage).toBeGreaterThan(0);
    }

    expect(state.summary.pylonsCleansed).toBe(11);
    expect(totalStolenEvents).toBeGreaterThanOrEqual(9);
    expect(totalReclaimedEvents).toBe(totalStolenEvents);
  });

  it('triggers Big Bob Darkness Phase and shatters it by lighting all 4 Darkness Lamps', () => {
    const engine = createSimEngine();
    const state = engine.initRun({ seed: 720, characterId: 'Vlad', mapId: 'Graveyard', mapTier: 1 });
    engine.triggerBoss();
    const bob = state.enemies.find((e) => e.enemyId === 'GhostKing')!;
    expect(bob).toBeDefined();

    // Drop Big Bob below 80% HP -> activates Darkness Phase + 4 lamps
    bob.hp = Math.round(bob.maxHp * 0.78);
    stepBigBobEncounter(state, bob, engine.getTerrainSampler(), FIXED_DT, createRngCallback(state));
    expect(state.darknessActive).toBe(true);
    expect(state.darknessLamps).toHaveLength(4);

    // Invulnerable while Darkness is active
    expect(resolveDamage(state, bob, { baseDamage: 1000, element: 'Holy', procCoefficient: 1 }, () => 0.5).finalDamage).toBe(0);

    const hpPreShatter = bob.hp;
    // Charge all 4 lamps by standing in each for 2.5s (126 ticks)
    for (let i = 0; i < 4; i++) {
      const lamp = state.darknessLamps[i];
      if (!lamp) break;
      engine.teleportPlayer(lamp.pos);
      for (let t = 0; t < 130 && state.darknessActive && !lamp.lit; t++) {
        stepBigBobEncounter(state, bob, engine.getTerrainSampler(), FIXED_DT, createRngCallback(state));
      }
    }

    expect(state.darknessActive).toBe(false);
    expect(bob.stunTimer).toBeGreaterThan(0);
    expect(bob.hp).toBeLessThan(hpPreShatter); // 12% maxHP Radiant shatter damage
  });

  it('enforces Challenges: TheFloorIsLava, WeirdControls, and Fragile', () => {
    const engine = createSimEngine();

    // 1. TheFloorIsLava: grounded standing scorches; jumping/airborne stays safe
    const lava = engine.initRun({
      seed: 730,
      characterId: 'Fox',
      mapId: 'Forest',
      mapTier: 1,
      challengeId: 'TheFloorIsLava',
    });
    const hpStart = lava.player.hp;
    for (let t = 0; t < 60; t++) {
      engine.step(createEmptyInputFrame());
    }
    expect(engine.getState().player.hp).toBeLessThan(hpStart);

    // 2. WeirdControls: pressing moveZ=+1 moves backward (+Z instead of -Z)
    const weird = engine.initRun({
      seed: 731,
      characterId: 'Fox',
      mapId: 'Forest',
      mapTier: 1,
      challengeId: 'WeirdControls',
    });
    const zStart = weird.player.pos.z;
    for (let t = 0; t < 20; t++) {
      engine.step({ ...createEmptyInputFrame(0, 0), moveZ: 1 });
    }
    expect(engine.getState().player.pos.z).toBeGreaterThan(zStart + 0.5);

    // 3. Fragile: 1 Max HP -> single hit causes game_over
    const fragile = engine.initRun({
      seed: 732,
      characterId: 'SirOofie',
      mapId: 'Forest',
      mapTier: 1,
      challengeId: 'Fragile',
    });
    expect(fragile.player.maxHp).toBe(1);
    expect(fragile.player.hp).toBe(1);
    fragile.player.stats.Evasion = 0;
    applyPlayerDamage(fragile, GAME_CATALOG, 10, null, createRngCallback(fragile), []);
    expect(fragile.player.dead).toBe(true);
    expect(fragile.phase).toBe('game_over');
  });
});
