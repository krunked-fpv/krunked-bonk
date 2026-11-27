import { afterEach, describe, expect, it } from 'vitest';
import {
  GAMEPAD_DEADZONE_DEFAULT,
  SAVE_STORAGE_KEY,
  SHOP_UPGRADE_IDS,
  type MapId,
  type MapTier,
  type SimEvent,
} from '../src/contracts/index';
import {
  GAME_CATALOG,
  getQuestById,
  getShopUpgradeById,
  getShopUpgradeCost,
  SHOP_UPGRADES,
} from '../src/data/index';
import {
  computeShopUpgradeCost,
  computeTotalShopUpgradeSpent,
  createSaveManager,
  type StorageLike,
} from '../src/app/SaveManager';
import { AudioEngine } from '../src/audio/AudioEngine';
import {
  AudioSpamFilter,
  BOOMBOX_TRACK_LIST,
  MUSIC_TRACK_MANIFEST,
  normalizeMusicTrackId,
  resolveMusicTrackForContext,
} from '../src/audio/soundManifest';
import { detectGamepadProfile, GamepadDriver } from '../src/input/GamepadDriver';
import { TouchOverlay } from '../src/input/TouchOverlay';

class MockStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

interface MockButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

function createMockGamepad(opts: {
  id: string;
  index?: number;
  axes?: [number, number, number, number];
  pressedButtons?: number[];
  buttonValues?: Record<number, number>;
}): Gamepad {
  const buttons: MockButton[] = Array.from({ length: 16 }, (_, idx) => {
    const val = opts.buttonValues?.[idx];
    const pressed = Boolean(opts.pressedButtons?.includes(idx)) || (val !== undefined && val >= 0.5);
    return {
      pressed,
      touched: pressed,
      value: val ?? (pressed ? 1 : 0),
    };
  });
  return {
    id: opts.id,
    index: opts.index ?? 0,
    connected: true,
    mapping: 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 1000,
    hapticActuators: [],
  } as unknown as Gamepad;
}

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function stubNavigatorGamepads(pads: Array<Gamepad | null>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0',
      getGamepads: () => pads,
    },
  });
}

afterEach(() => {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  }
});

describe('Meta Shop pricing & SaveManager persistence', () => {
  it('verifies all 8 Meta Shop upgrades exact retail pricing and SaveManager purchase/refund math', () => {
    expect(SHOP_UPGRADES).toHaveLength(8);
    expect(SHOP_UPGRADES.map((u) => u.id).sort()).toEqual([...SHOP_UPGRADE_IDS].sort());

    // Exact oracle retail pricing via getShopUpgradeCost
    const silverUpg = getShopUpgradeById('SilverMultiplier')!;
    expect(getShopUpgradeCost(silverUpg, 0)).toBe(5);
    expect(getShopUpgradeCost(silverUpg, 1)).toBe(Math.round((5 + 5) * 1.25)); // 13
    expect(getShopUpgradeCost(silverUpg, 2)).toBe(Math.round((5 + 10) * 1.25 * 1.25)); // 23

    for (const id of ['Refresh', 'Skip', 'Banish'] as const) {
      const def = getShopUpgradeById(id)!;
      expect(def.maxRank).toBe(6);
      expect(getShopUpgradeCost(def, 0)).toBe(8);
      expect(getShopUpgradeCost(def, 1)).toBe(Math.round((8 + 5) * 1.3)); // 17
    }

    const weaponsUpg = getShopUpgradeById('Weapons')!;
    expect(getShopUpgradeCost(weaponsUpg, 0)).toBe(25);
    expect(getShopUpgradeCost(weaponsUpg, 1)).toBe(125);

    const tomesUpg = getShopUpgradeById('Tomes')!;
    expect(getShopUpgradeCost(tomesUpg, 0)).toBe(35);
    expect(getShopUpgradeCost(tomesUpg, 1)).toBe(135);

    expect(getShopUpgradeCost(getShopUpgradeById('Boombox')!, 0)).toBe(5);
    expect(getShopUpgradeCost(getShopUpgradeById('Toggler')!, 0)).toBe(50);

    // SaveManager purchase, max_rank, insufficient_silver, single refund, and refundAll conservation
    const storage = new MockStorage();
    const mgr = createSaveManager({ storage });
    mgr.addSilver(500);

    const boombox = getShopUpgradeById('Boombox')!;
    const buyBoom1 = mgr.purchaseShopUpgrade(boombox);
    expect(buyBoom1.ok).toBe(true);
    expect(buyBoom1.newRank).toBe(1);
    const buyBoomMax = mgr.purchaseShopUpgrade(boombox);
    expect(buyBoomMax.ok).toBe(false);
    expect(buyBoomMax.reason).toBe('max_rank');

    // Buy 3 ranks of Refresh and verify single refund + refundAll returns exact silver spent
    const refresh = getShopUpgradeById('Refresh')!;
    const silverBeforeRefresh = mgr.getData().silver;
    const expectedCost3 = computeTotalShopUpgradeSpent(refresh, 3);
    for (let i = 0; i < 3; i++) {
      expect(mgr.purchaseShopUpgrade(refresh).ok).toBe(true);
    }
    expect(mgr.getData().silver).toBe(silverBeforeRefresh - expectedCost3);

    const refund1 = mgr.refundShopUpgrade(refresh);
    expect(refund1.ok).toBe(true);
    expect(refund1.newRank).toBe(2);
    expect(refund1.refundedSilver).toBe(computeShopUpgradeCost(refresh, 2));

    const refundAll = mgr.refundAllShopUpgrades(SHOP_UPGRADES);
    expect(refundAll.remainingSilver).toBe(500);
    for (const id of SHOP_UPGRADE_IDS) {
      expect(mgr.getData().shopLevels[id]).toBe(0);
    }

    // Insufficient silver rejection
    mgr.reset();
    expect(mgr.purchaseShopUpgrade(getShopUpgradeById('Toggler')!).reason).toBe('insufficient_silver');
  });

  it('persists under krunked_bonk_save_v1, claims quests, ranks bestRuns, and recovers corrupt JSON', () => {
    const storage = new MockStorage();
    const mgr = createSaveManager({ storage });
    expect(mgr.getStorageKey()).toBe(SAVE_STORAGE_KEY);
    expect(SAVE_STORAGE_KEY).toBe('krunked_bonk_save_v1');
    expect(storage.getItem('krunked_bonk_save_v1')).not.toBeNull();

    // Quest progress & claiming
    const qKill100 = getQuestById('quest_kill_100')!;
    expect(mgr.claimQuest(qKill100).reason).toBe('incomplete');
    mgr.recordQuestProgress('total_kills', 100, 'add');
    const claimOk = mgr.claimQuest(qKill100);
    expect(claimOk.ok).toBe(true);
    expect(claimOk.rewardSilver).toBe(qKill100.rewardSilver);
    expect(mgr.getData().unlockedSkins).toContain('skin_fox_frost');
    expect(mgr.getData().unlockedHats).toContain('hat_visor');
    expect(mgr.claimQuest(qKill100).reason).toBe('already_claimed');

    // Best-runs leaderboard sorting (victories > defeats, then higher kills)
    mgr.recordRun({
      timestamp: '2026-01-01T00:00:00.000Z',
      characterId: 'Fox',
      mapId: 'Forest',
      mapTier: 1,
      victory: false,
      durationSec: 300,
      level: 12,
      kills: 400,
      silverEarned: 20,
      highestHit: 500,
    });
    const vicRes = mgr.recordRun({
      timestamp: '2026-01-02T00:00:00.000Z',
      characterId: 'Calcium',
      mapId: 'Desert',
      mapTier: 3,
      victory: true,
      durationSec: 420,
      level: 25,
      kills: 350,
      silverEarned: 100,
      highestHit: 4000,
    });
    expect(vicRes.rank).toBe(1);
    expect(vicRes.isNewBest).toBe(true);
    expect(mgr.getBestRuns({ limit: 1 })[0]?.characterId).toBe('Calcium');

    // Reload from same storage key verifies persistence
    const reloaded = createSaveManager({ storage });
    expect(reloaded.getData().claimedQuests).toContain('quest_kill_100');
    expect(reloaded.getData().bestRuns).toHaveLength(2);
    expect(reloaded.getData().silver).toBe(mgr.getData().silver);

    // Corrupt JSON recovery backs up payload & restores valid defaults
    storage.setItem(SAVE_STORAGE_KEY, '{not-valid-json!!!');
    const recovered = createSaveManager({ storage });
    expect(recovered.getLastRecoveryIssues().length).toBeGreaterThan(0);
    expect(storage.getItem(`${SAVE_STORAGE_KEY}_corrupt_backup`)).toBe('{not-valid-json!!!');
    expect(recovered.getData().unlockedCharacters).toContain('Fox');
    expect(recovered.getData().unlockedMaps).toContain('Forest');
  });
});

describe('GamepadDriver profiles, calibration, deadzone, orbit & UI navigation', () => {
  it('detects all controller profiles (Xbox, PS, Switch, Steam Deck, Tesla, Generic)', () => {
    expect(detectGamepadProfile('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(detectGamepadProfile('DualSense Wireless Controller (Vendor: 054c)')).toBe('playstation');
    expect(detectGamepadProfile('Nintendo Switch Pro Controller (Vendor: 057e)')).toBe('switch');
    expect(detectGamepadProfile('Valve Steam Deck Controller (28de)')).toBe('steam_deck');
    expect(detectGamepadProfile('Tesla Gamepad 1')).toBe('tesla');
    expect(detectGamepadProfile('Generic USB Pad', 'Mozilla/5.0 Tesla/2026')).toBe('tesla');
    expect(detectGamepadProfile('Unknown HID Stick', 'Mozilla/5.0 Windows')).toBe('generic');
  });

  it('calibrates neutral stick drift, enforces 0.15 radial deadzone, exponential orbit, and UiNavActions', () => {
    const driver = new GamepadDriver();

    // 1. Neutral drift calibration eliminates resting +0.10 drift
    const driftingPad = createMockGamepad({
      id: 'Xbox Wireless Controller',
      axes: [0.1, -0.09, 0.08, -0.07],
    });
    stubNavigatorGamepads([driftingPad]);
    expect(driver.calibrateNeutral()).toBe(true);
    const afterCal = driver.poll(0.02, 'playing');
    expect(afterCal.moveX).toBe(0);
    expect(afterCal.moveZ).toBe(0);
    expect(afterCal.lookDeltaYaw).toBe(0);
    expect(afterCal.lookDeltaPitch).toBe(0);

    // Auto-calibration clamp guard: extreme +0.9 stick tilt clamps neutral offset to <= 0.25
    const tiltedPad = createMockGamepad({ id: 'Xbox Wireless Controller', axes: [0.9, 0, 0, 0] });
    stubNavigatorGamepads([tiltedPad]);
    driver.calibrateNeutral();
    expect(driver.getInfo().neutralOffset.lx).toBeCloseTo(0.25, 5);

    // 2. Radial 0.15 deadzone & exponential right-stick orbit
    const freshDriver = new GamepadDriver();
    const zeroPad = createMockGamepad({ id: 'DualSense Wireless Controller', axes: [0, 0, 0, 0] });
    stubNavigatorGamepads([zeroPad]);
    freshDriver.calibrateNeutral(); // zero offset
    expect(freshDriver.getProfile()).toBe('playstation');
    expect(freshDriver.getCalibration().deadzone).toBe(GAMEPAD_DEADZONE_DEFAULT);

    // Inside 0.15 radial deadzone => exact 0
    stubNavigatorGamepads([
      createMockGamepad({ id: 'DualSense Wireless Controller', axes: [0.1, 0.1, 0.1, 0.1] }),
    ]);
    const insideDz = freshDriver.poll(0.02, 'playing');
    expect(insideDz.moveX).toBe(0);
    expect(insideDz.moveZ).toBe(0);
    expect(insideDz.lookDeltaYaw).toBe(0);

    // Outside deadzone: verify exponential right-stick orbit (half deflection << half of full deflection)
    stubNavigatorGamepads([
      createMockGamepad({ id: 'DualSense Wireless Controller', axes: [0, -1, 0.575, 0] }),
    ]);
    const halfOrbit = freshDriver.poll(0.02, 'playing');
    expect(halfOrbit.moveZ).toBeCloseTo(1, 3);

    stubNavigatorGamepads([
      createMockGamepad({ id: 'DualSense Wireless Controller', axes: [0, 0, 1.0, 0] }),
    ]);
    const fullOrbit = freshDriver.poll(0.02, 'playing');
    expect(Math.abs(fullOrbit.lookDeltaYaw)).toBeGreaterThan(Math.abs(halfOrbit.lookDeltaYaw) * 2.5);

    // 3. UiNavAction generation in draft/menu phases (confirm, cancel, dpad, reroll, banish, skip)
    stubNavigatorGamepads([
      createMockGamepad({
        id: 'DualSense Wireless Controller',
        pressedButtons: [0, 2, 3, 4, 5, 8, 9, 12], // South, West(reroll), North(banish), LB, RB, Back(skip), Start, DpadUp
      }),
    ]);
    const navRes = freshDriver.poll(0.02, 'level_up');
    expect(navRes.uiActions).toContain('confirm');
    expect(navRes.uiActions).toContain('up');
    expect(navRes.uiActions).toContain('reroll');
    expect(navRes.uiActions).toContain('banish');
    expect(navRes.uiActions).toContain('skip');
    expect(navRes.uiActions).toContain('tab_prev');
    expect(navRes.uiActions).toContain('tab_next');
    expect(navRes.uiActions).toContain('pause');
    expect(navRes.rerollPressed).toBe(true);
    expect(navRes.banishPressed).toBe(true);
    expect(navRes.skipPressed).toBe(true);
  });
});

describe('TouchOverlay strict desktop-hidden lifecycle', () => {
  it('starts strictly hidden on desktop, activates on simulated touch, and auto-hides on non-touch input', () => {
    const overlay = new TouchOverlay();
    expect(overlay.isVisible()).toBe(false);

    const idleSnap = overlay.pollTouchInput();
    expect(idleSnap.active).toBe(false);
    expect(idleSnap.moveX).toBe(0);
    expect(idleSnap.moveZ).toBe(0);

    // Simulated touch enables overlay cleanly
    overlay.setSimulatedTouch(true);
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.pollTouchInput().active).toBe(true);

    // Non-playing phase zeros gameplay outputs while keeping touchActive state intact
    overlay.setPhase('paused');
    const pausedSnap = overlay.pollTouchInput();
    expect(pausedSnap.jump).toBe(false);
    expect(pausedSnap.fireHeld).toBe(false);

    // Non-touch input (keyboard/mouse/gamepad) immediately hides touch overlay
    overlay.hideOnNonTouchInput();
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.pollTouchInput().active).toBe(false);

    overlay.dispose();
  });
});

describe('AudioEngine & AudioSpamFilter burst throttling + 19-track OST routing', () => {
  it('throttles rapid SFX bursts, enforces per-cue & global polyphony with priority stealing, and escalates XP streaks', () => {
    const filter = new AudioSpamFilter(6, 1000);

    // 1. Per-cue cooldownMs blocks immediate duplicate trigger
    expect(filter.tryAcquire('hit', 100).allowed).toBe(true);
    expect(filter.tryAcquire('hit', 110).allowed).toBe(false); // hit cooldownMs = 34ms
    expect(filter.tryAcquire('hit', 140).allowed).toBe(true);

    // 2. Global polyphony cap (6) + high-priority ('bonk' priority 10) voice stealing
    const smallFilter = new AudioSpamFilter(4, 1000);
    expect(smallFilter.tryAcquire('debuff', 100).allowed).toBe(true); // prio 3
    expect(smallFilter.tryAcquire('hit', 100).allowed).toBe(true); // prio 4
    expect(smallFilter.tryAcquire('item_proc', 100).allowed).toBe(true); // prio 4
    expect(smallFilter.tryAcquire('kill', 100).allowed).toBe(true); // prio 5
    expect(smallFilter.getActiveVoiceCount(100)).toBe(4);

    // Another low-priority cue (priority 3) is rejected when cap is full
    expect(smallFilter.tryAcquire('debuff', 200).allowed).toBe(false);
    // High-priority 'bonk' (priority 10) steals a lower-priority voice!
    const bonkRes = smallFilter.tryAcquire('bonk', 100);
    expect(bonkRes.allowed).toBe(true);
    expect(bonkRes.densityGainScale).toBe(1.0);

    // 3. XP chime streak escalation & timeout reset
    expect(filter.advanceXpStreak(1000)).toBe(0);
    expect(filter.advanceXpStreak(1200)).toBe(1);
    expect(filter.advanceXpStreak(1400)).toBe(2);
    expect(filter.advanceXpStreak(3000)).toBe(0); // > 1000ms resets streak
  });

  it('routes all 19 OST tracks accurately and operates safely in headless Node', () => {
    // Exact 19 OST tracks (17 looping + 2 non-looping stingers) & 18 Boombox entries ('auto' + 17 looping)
    const allTrackIds = Object.keys(MUSIC_TRACK_MANIFEST);
    expect(allTrackIds).toHaveLength(19);
    expect(Object.values(MUSIC_TRACK_MANIFEST).filter((t) => t.looping)).toHaveLength(17);
    expect(BOOMBOX_TRACK_LIST).toHaveLength(18);

    // Verify adaptive biome/tier/state routing
    const routes: Array<[MapId, MapTier, Parameters<typeof resolveMusicTrackForContext>[2], string | null]> = [
      ['Forest', 1, 'title', 'title'],
      ['Forest', 1, 'explore', 'forest_1'],
      ['Forest', 2, 'explore', 'forest_2'],
      ['Forest', 3, 'explore', 'forest_3'],
      ['Forest', 1, 'boss', 'forest_boss'],
      ['Desert', 1, 'explore', 'desert_1'],
      ['Desert', 2, 'explore', 'desert_2'],
      ['Desert', 3, 'explore', 'desert_3'],
      ['Desert', 2, 'boss', 'desert_boss'],
      ['Graveyard', 1, 'explore', 'graveyard'],
      ['Graveyard', 1, 'boss', 'graveyard_boss'],
      ['FinalBossMap', 1, 'explore', 'final_boss'],
      ['FinalBossMap', 1, 'boss', 'final_boss'],
      ['Forest', 1, 'final_swarm', 'final_swarm'],
      ['Forest', 1, 'victory', 'victory'],
      ['Forest', 1, 'game_over', 'game_over'],
      ['Forest', 1, 'silent', null],
    ];
    for (const [mapId, tier, st, expected] of routes) {
      expect(resolveMusicTrackForContext(mapId, tier, st)).toBe(expected);
    }

    // Legacy track aliases normalize cleanly
    expect(normalizeMusicTrackId('forest_explore')).toBe('forest_1');
    expect(normalizeMusicTrackId('big_bob')).toBe('graveyard_boss');
    expect(normalizeMusicTrackId('dicehead')).toBe('dicy');

    // AudioEngine headless lifecycle, event-driven OST transitions & Boombox override
    const audio = new AudioEngine();
    audio.init();
    audio.unlock(); // graceful no-op in Node
    expect(audio.getAvailableBoomboxTracks()).toHaveLength(18);

    audio.setMusicContext('Desert', 2, 'explore');
    expect(audio.getActiveTrackId()).toBe('desert_2');
    expect(audio.getDesertWindIntensity()).toBeGreaterThan(0.4);

    // Boombox override locks track during explore, while victory/game_over still play stingers
    audio.setBoomboxTrack('calcium');
    expect(audio.getActiveTrackId()).toBe('calcium');
    audio.setMusicState('victory');
    expect(audio.getActiveTrackId()).toBe('victory');
    audio.setBoomboxTrack('auto');
    audio.setMusicContext('Graveyard', 1, 'explore');
    expect(audio.getActiveTrackId()).toBe('graveyard');

    // SimEvent stream drives music state transitions cleanly
    const evs: SimEvent[] = [
      { type: 'boss_spawn', tick: 10, entityId: 1, enemyId: 'GhostKing', displayName: 'Big Bob', pos: { x: 0, y: 0, z: 0 } },
    ];
    audio.consumeEvents(evs);
    expect(audio.getActiveTrackId()).toBe('graveyard_boss');
    audio.consumeEvents([
      { type: 'portal_activated', tick: 20, targetMapId: 'FinalBossMap', targetTier: 1 },
    ]);
    expect(audio.getActiveTrackId()).toBe('final_boss');

    audio.dispose();
  });
});
