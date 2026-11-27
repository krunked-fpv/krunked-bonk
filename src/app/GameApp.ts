/**
 * KRUNKEDBONK — Main Application Orchestrator (`GameApp`)
 *
 * Coordinates:
 * - Decoupled 50 Hz fixed-timestep simulation accumulator (`FIXED_DT = 0.02`,
 *   `MAX_ALLOWED_TIMESTEP = 0.20`, `MAX_SUBSTEPS_PER_FRAME = 10`)
 * - Configurable render pacing (`fpsCap: 30 | 60 | 120 | 0`) & `classic50HzSnap`
 * - `SimEngine`, `ThreeRenderer`, `AudioEngine`, `InputManager`, `UiController`,
 *   `SaveManager`, and `CustomAssetPack` / `AssetRegistry` live switching
 * - Live 3D orbiting MK-Toon Forest scenic backdrop behind Title & Menus
 * - Full `DebugBridge` implementation (`window.__KRUNKED_DEBUG__`)
 */

import {
  CUSTOM_PACK_DEV_PREFIX,
  FIXED_DT,
  MAX_ALLOWED_TIMESTEP,
  MAX_SUBSTEPS_PER_FRAME,
  createEmptyInputFrame,
  type CharacterId,
  type CustomPackFileEntry,
  type DebugBridge,
  type DebugPerfMetrics,
  type EnemyRole,
  type GamePhase,
  type InputDeviceKind,
  type InputFrame,
  type MapId,
  type MapTier,
  type RenderSettings,
  type ShopUpgradeId,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Vec3,
} from '../contracts/index';
import { CustomAssetPack } from '../assets/AssetRegistry';
import { createAudioEngine, type AudioEngine } from '../audio/AudioEngine';
import { getShopUpgradeById } from '../data/index';
import { InputManager } from '../input/InputManager';
import { ThreeRenderer } from '../render/ThreeRenderer';
import { createSimEngine, type SimEngine } from '../sim/engine';
import { getMaxTomeSlots, getMaxWeaponSlots } from '../sim/progression';
import { UiController, type UiCallbacks } from '../ui/UiController';
import { createSaveManager, type SaveManager } from './SaveManager';

const DEBUG_BRIDGE_VERSION = '0.1.0';

function clearEdgeTriggers(frame: InputFrame): InputFrame {
  return {
    ...frame,
    jumpPressed: false,
    interactPressed: false,
    cameraTogglePressed: false,
    pausePressed: false,
    mapTogglePressed: false,
    draftChoiceIndex: null,
    rerollPressed: false,
    banishPressed: false,
    skipPressed: false,
    activeSkillPressed: false,
  };
}

export class GameApp {
  private readonly sim: SimEngine;
  private readonly renderer: ThreeRenderer;
  private readonly audio: AudioEngine;
  private readonly input: InputManager;
  private readonly saveManager: SaveManager;
  private readonly ui: UiController;
  private readonly customPack: CustomAssetPack;

  private container: HTMLElement | null = null;
  private folderPickerInput: HTMLInputElement | null = null;
  private rafId: number | null = null;
  private running = false;
  private disposed = false;

  // Timing & pacing
  private lastRafMs = 0;
  private lastRenderMs = 0;
  private accumulatorSec = 0;
  private lastSimStepMs = 0;
  private lastInterpAlpha = 1;
  private lastFireHeld = false;

  // Run & menu lifecycle tracking
  private runCounter = 0;
  private recordedRunId = -1;
  private returnPhaseFromOptions: GamePhase = 'title';
  private activeLoadedMapKey = '';
  private customPackName: string | null = null;

  constructor() {
    this.saveManager = createSaveManager();
    this.sim = createSimEngine();
    this.renderer = new ThreeRenderer();
    this.audio = createAudioEngine();
    this.input = new InputManager();
    this.customPack = new CustomAssetPack();

    const callbacks: UiCallbacks = {
      onPlay: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_confirm');
        this.startNewRun();
      },
      onOpenCharacters: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_move');
        this.enterMenuPhase('character_select');
      },
      onOpenShop: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_move');
        this.enterMenuPhase('shop');
      },
      onOpenOptions: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_move');
        const curr = this.sim.getState().phase;
        this.returnPhaseFromOptions = curr === 'paused' ? 'paused' : 'title';
        this.sim.setPhase('settings');
        this.syncInputAndAudioForPhase();
      },
      onCloseOptions: () => {
        this.audio.playSfx('ui_cancel');
        this.sim.setPhase(this.returnPhaseFromOptions);
        this.syncInputAndAudioForPhase();
      },
      onBackToTitle: () => {
        this.audio.playSfx('ui_cancel');
        this.returnToTitleScene();
      },
      onSelectCharacter: (characterId: CharacterId) => {
        this.audio.playSfx('ui_move');
        this.saveManager.setSelection({ selectedCharacter: characterId });
        this.refreshPreviewBackdrop();
      },
      onSelectMap: (mapId: MapId) => {
        this.audio.playSfx('ui_move');
        this.saveManager.setSelection({ selectedMap: mapId });
        this.refreshPreviewBackdrop();
      },
      onSelectMapTier: (tier: MapTier) => {
        this.audio.playSfx('ui_move');
        this.saveManager.setSelection({ selectedMapTier: tier });
        this.refreshPreviewBackdrop();
      },
      onSelectChallenge: (challengeId: string | null) => {
        this.audio.playSfx('ui_move');
        this.saveManager.setSelection({ selectedChallenge: challengeId });
      },
      onStartRun: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_confirm');
        this.startNewRun();
      },
      onResume: () => {
        this.audio.playSfx('ui_confirm');
        if (this.sim.getState().phase === 'paused') {
          this.sim.setPhase('playing');
          this.syncInputAndAudioForPhase();
        }
      },
      onRestartRun: () => {
        this.audio.unlock();
        this.audio.playSfx('ui_confirm');
        this.startNewRun();
      },
      onAbandonRun: () => {
        this.audio.playSfx('ui_cancel');
        this.recordRunOutcomeIfNeeded(false);
        this.returnToTitleScene();
      },
      onSelectDraftChoice: (choiceIndex: number) => {
        this.audio.playSfx('ui_confirm');
        const evs = this.sim.applyDraftChoice(choiceIndex);
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      },
      onRerollDraft: () => {
        this.audio.playSfx('ui_reroll');
        const evs = this.sim.rerollDraft();
        this.dispatchSimEvents(evs);
      },
      onBanishDraftChoice: (choiceIndex: number) => {
        this.audio.playSfx('ui_banish');
        const evs = this.sim.banishDraftChoice(choiceIndex);
        this.dispatchSimEvents(evs);
      },
      onSkipDraft: () => {
        this.audio.playSfx('ui_cancel');
        const evs = this.sim.skipDraft();
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      },
      onBuyShopUpgrade: (upgradeId: ShopUpgradeId) => {
        const def = getShopUpgradeById(upgradeId);
        if (!def) return;
        const result = this.saveManager.purchaseShopUpgrade(def);
        if (result.ok) {
          this.audio.playSfx('gold');
        } else {
          this.audio.playSfx('ui_cancel');
        }
      },
      onUpdateSettings: (patch: Partial<RenderSettings>) => {
        this.applySettingsPatch(patch);
      },
      onRecalibrateGamepad: () => {
        const ok = this.input.calibrateGamepadNeutral();
        this.audio.playSfx(ok ? 'ui_confirm' : 'ui_cancel');
        return ok;
      },
      onLoadCustomPack: () => {
        this.openCustomPackFolderPicker();
      },
      onToggleCustomPack: (enabled: boolean) => {
        this.audio.playSfx('ui_move');
        this.setCustomPackEnabled(enabled);
      },
    };

    this.ui = new UiController(callbacks);
  }

  public mount(container: HTMLElement): void {
    if (this.running || this.disposed) return;
    this.container = container;

    const save = this.saveManager.getData();
    const settings = save.settings;

    // 1. Mount 3D renderer, UI, input, and Web Audio
    this.renderer.mount(container, settings);
    this.ui.mount(container);
    this.input.attach(container);
    this.input.setCalibration(settings.gamepad);
    this.input.setMouseSettings(settings.mouseSensitivity, settings.invertMouseY);
    this.input.setPointerLockAllowed(false);

    this.audio.init();
    this.audio.setSettings(settings);
    this.audio.setBoomboxTrack(settings.boomboxTrack);

    // 2. Build live 3D orbiting Forest title backdrop immediately from frame 1
    this.setupBackdropScene('title');

    // 3. Silently probe dev-only `/__custom_pack__/manifest.json` (never errors in prod)
    void this.probeDevCustomPack();

    // 4. Bind window resize & click-to-pointerlock during active KBM gameplay
    window.addEventListener('resize', this.handleWindowResize);
    container.addEventListener('pointerdown', this.handleContainerPointerDown);

    // 5. Kick off main render + 50 Hz fixed-step loop
    this.running = true;
    this.lastRafMs = performance.now();
    this.lastRenderMs = this.lastRafMs;
    this.accumulatorSec = 0;
    this.rafId = requestAnimationFrame(this.frameLoop);
  }

  public unmount(): void {
    this.running = false;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleWindowResize);
    this.container?.removeEventListener('pointerdown', this.handleContainerPointerDown);
    if (this.folderPickerInput) {
      this.folderPickerInput.remove();
      this.folderPickerInput = null;
    }
    this.input.detach();
    this.ui.dispose();
    this.audio.dispose();
    this.renderer.unmount();
    this.customPack.clear();
    this.container = null;
  }

  public getPerfMetrics(): DebugPerfMetrics {
    const r = this.renderer.getPerfMetrics();
    return {
      ...r,
      simStepMs: Math.round(this.lastSimStepMs * 1000) / 1000,
      interpAlpha: this.lastInterpAlpha,
    };
  }

  public getDebugBridge(): DebugBridge {
    return {
      version: DEBUG_BRIDGE_VERSION,
      getState: () => this.sim.getState() as SimState,
      getSettings: () => this.saveManager.getData().settings,
      setSettings: (patch: Partial<RenderSettings>) => {
        this.applySettingsPatch(patch);
      },
      getPerfMetrics: () => this.getPerfMetrics(),
      getActiveInputDevice: (): InputDeviceKind => this.input.getActiveDevice(),
      isTouchOverlayVisible: (): boolean => this.input.isTouchOverlayVisible(),
      getStateHash: (): string => this.sim.computeStateHash(),
      stepTicks: (count: number, inputPatch?: Partial<InputFrame>): SimEvent[] => {
        const n = Math.max(0, Math.min(10000, Math.floor(count)));
        const allEvents: SimEvent[] = [];
        const baseLook = this.input.getLookAngles();
        const frame: InputFrame = {
          ...createEmptyInputFrame(baseLook.yaw, baseLook.pitch),
          ...inputPatch,
        };
        for (let i = 0; i < n; i++) {
          const stepInput = i === 0 ? frame : clearEdgeTriggers(frame);
          const evs = this.sim.step(stepInput);
          if (evs.length > 0) {
            allEvents.push(...evs);
            this.dispatchSimEvents(evs);
          }
        }
        this.syncInputAndAudioForPhase();
        return allEvents;
      },
      startRun: (config: SimConfig) => {
        this.startRunWithConfig(config);
      },
      setPhase: (phase: GamePhase) => {
        const evs = this.sim.setPhase(phase);
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      },
      teleportPlayer: (pos: Vec3) => {
        this.sim.teleportPlayer(pos);
      },
      grantXp: (amount: number) => {
        const evs = this.sim.grantXp(amount);
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      },
      grantGold: (amount: number) => {
        this.sim.grantGold(amount);
      },
      grantWeapon: (weaponId: string, level = 1) => {
        this.sim.grantWeapon(weaponId, level);
      },
      grantTome: (tomeId: string, level = 1) => {
        this.sim.grantTome(tomeId, level);
      },
      grantItem: (itemId: string, stacks = 1) => {
        this.sim.grantItem(itemId, stacks);
      },
      spawnEnemy: (enemyId: string, pos?: Vec3, role?: EnemyRole) => {
        return this.sim.spawnEnemy(enemyId, pos, role);
      },
      triggerBoss: () => {
        const evs = this.sim.triggerBoss();
        this.dispatchSimEvents(evs);
        this.syncMusicForCurrentState();
      },
      triggerFinalSwarm: () => {
        const evs = this.sim.triggerFinalSwarm();
        this.dispatchSimEvents(evs);
        this.syncMusicForCurrentState();
      },
      cleansePylon: (pylonIndex: number) => {
        const evs = this.sim.cleansePylon(pylonIndex);
        this.dispatchSimEvents(evs);
      },
      applyDraftChoice: (choiceIndex: number) => {
        const evs = this.sim.applyDraftChoice(choiceIndex);
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      },
      simulateTouch: (active: boolean) => {
        this.input.setSimulatedTouch(Boolean(active));
      },
      setInvincible: (enabled: boolean) => {
        this.sim.setInvincible(Boolean(enabled));
      },
      warpStage: (mapId: MapId, tier: MapTier) => {
        const st = this.sim.warpStage(mapId, tier);
        this.ensureMapVisualsLoaded(st.mapId, st.mapTier, st.seed, true);
        this.syncInputAndAudioForPhase();
      },
    };
  }

  // ==========================================================================
  // CORE LOOP: 50 HZ FIXED SIM + DECOUPLED RENDER PACING
  // ==========================================================================

  private readonly frameLoop = (nowMs: number): void => {
    if (!this.running || this.disposed) return;
    this.rafId = requestAnimationFrame(this.frameLoop);

    const rawDeltaSec = Math.max(0, (nowMs - this.lastRafMs) * 0.001);
    this.lastRafMs = nowMs;

    const settings = this.saveManager.getData().settings;
    const clampedDeltaSec = Math.min(MAX_ALLOWED_TIMESTEP, rawDeltaSec);

    // 1. Poll input & forward UI navigation actions
    const currentPhase = this.sim.getState().phase;
    const inputFrame = this.input.pollFrame(clampedDeltaSec, currentPhase);
    this.lastFireHeld = inputFrame.fireHeld;

    const uiActions = this.input.consumeUiActions();
    if (uiActions.length > 0) {
      if (currentPhase !== 'playing') {
        this.audio.playSfx('ui_move');
      }
      this.ui.handleNavActions(uiActions);
    }

    // 2. Non-simulation quick toggles (1st/3rd camera & full map)
    if (inputFrame.cameraTogglePressed && currentPhase === 'playing') {
      const nextCam = settings.cameraMode === 'third' ? 'first' : 'third';
      this.applySettingsPatch({ cameraMode: nextCam });
      this.audio.playSfx('ui_move');
    }
    if (inputFrame.mapTogglePressed && currentPhase === 'playing') {
      this.renderer.toggleFullMap();
      this.audio.playSfx('ui_move');
    }

    // 3. Fixed 50 Hz simulation accumulator (max 10 substeps/frame)
    this.accumulatorSec += clampedDeltaSec;
    const simStartMs = performance.now();
    let substeps = 0;

    // Also allow pause/draft edge inputs to register immediately on first tick
    if (this.accumulatorSec < FIXED_DT && (inputFrame.pausePressed || inputFrame.draftChoiceIndex !== null)) {
      const evs = this.sim.step(inputFrame);
      if (evs.length > 0) {
        this.dispatchSimEvents(evs);
        this.syncInputAndAudioForPhase();
      }
    } else {
      while (this.accumulatorSec >= FIXED_DT && substeps < MAX_SUBSTEPS_PER_FRAME) {
        const stepInput = substeps === 0 ? inputFrame : clearEdgeTriggers(inputFrame);
        const evs = this.sim.step(stepInput);
        if (evs.length > 0) {
          this.dispatchSimEvents(evs);
          this.syncInputAndAudioForPhase();
        }
        this.accumulatorSec -= FIXED_DT;
        substeps += 1;
      }
      if (substeps === MAX_SUBSTEPS_PER_FRAME && this.accumulatorSec > FIXED_DT) {
        // Prevent spiral-of-death lag carry-over after tab switch
        this.accumulatorSec = 0;
      }
    }

    if (substeps > 0) {
      this.lastSimStepMs = performance.now() - simStartMs;
    }

    // 4. Sync continuous audio loops (slide, rail grind, ChargeShrine ramp, BGM lookahead)
    const state = this.sim.getState();
    this.syncContinuousAudio(state, clampedDeltaSec);

    // 5. Render pacing according to fpsCap (30 | 60 | 120 | 0 uncapped)
    const fpsCap = settings.fpsCap;
    if (fpsCap > 0) {
      const minIntervalMs = 1000 / fpsCap - 0.5;
      if (nowMs - this.lastRenderMs < minIntervalMs) {
        return;
      }
    }
    this.lastRenderMs = nowMs;

    // 6. Render 3D scene with smooth interpAlpha (or 1.0 when Classic 50Hz Snap is enabled)
    const interpAlpha = settings.classic50HzSnap
      ? 1.0
      : Math.max(0, Math.min(1, this.accumulatorSec / FIXED_DT));
    this.lastInterpAlpha = interpAlpha;

    this.renderer.render(this.sim.getPrevState(), state, interpAlpha);

    // 7. Update retro pixel-gothic HUD & Menus + contextual interact prompt for TouchOverlay
    const save = this.saveManager.getData();
    const challenge = state.challengeId
      ? this.sim.getCatalog().challenges.find((c) => c.id === state.challengeId) ?? null
      : null;

    const interactPrompt = this.ui.update({
      phase: state.phase,
      state,
      catalog: this.sim.getCatalog(),
      save,
      settings: save.settings,
      activeDevice: this.input.getActiveDevice(),
      gamepadProfile: this.input.getGamepadProfile(),
      gamepadConnected: this.input.isGamepadConnected(),
      customPackLoaded: this.customPack.isLoaded(),
      customPackName: this.customPackName,
      perf: this.getPerfMetrics(),
      fireHeld: this.lastFireHeld,
      maxWeaponSlots: getMaxWeaponSlots(save.shopLevels, challenge),
      maxTomeSlots: getMaxTomeSlots(save.shopLevels, challenge),
    });
    this.input.setInteractPrompt(interactPrompt);
  };

  // ==========================================================================
  // RUN & SCENE LIFECYCLE HELPERS
  // ==========================================================================

  private setupBackdropScene(targetPhase: GamePhase): void {
    const save = this.saveManager.getData();
    const previewConfig: SimConfig = {
      seed: 1337,
      characterId: save.selectedCharacter,
      mapId: save.selectedMap,
      mapTier: save.selectedMapTier,
      skinId: save.selectedSkin,
      hatId: save.selectedHat,
      challengeId: save.selectedChallenge,
      shopLevels: save.shopLevels,
    };
    const st = this.sim.initRun(previewConfig);
    this.sim.setPhase(targetPhase);
    this.ensureMapVisualsLoaded(st.mapId, st.mapTier, st.seed, false);
    this.renderer.setFullMapOpen(false);
    this.syncInputAndAudioForPhase();
  }

  private refreshPreviewBackdrop(): void {
    const phase = this.sim.getState().phase;
    if (phase === 'title' || phase === 'character_select' || phase === 'map_select') {
      this.setupBackdropScene(phase);
    }
  }

  private enterMenuPhase(phase: GamePhase): void {
    this.sim.setPhase(phase);
    this.renderer.setFullMapOpen(false);
    this.syncInputAndAudioForPhase();
  }

  private returnToTitleScene(): void {
    this.setupBackdropScene('title');
  }

  private startNewRun(): void {
    const save = this.saveManager.getData();
    const seed = (Date.now() ^ (this.runCounter * 2654435761)) >>> 0 || 1;
    this.startRunWithConfig({
      seed,
      characterId: save.selectedCharacter,
      mapId: save.selectedMap,
      mapTier: save.selectedMapTier,
      skinId: save.selectedSkin,
      hatId: save.selectedHat,
      challengeId: save.selectedChallenge,
      shopLevels: save.shopLevels,
    });
  }

  private startRunWithConfig(config: SimConfig): void {
    this.runCounter += 1;
    this.accumulatorSec = 0;
    const st = this.sim.initRun(config);
    this.input.setLookAngles(0, 0);
    this.renderer.setFullMapOpen(false);
    this.ensureMapVisualsLoaded(st.mapId, st.mapTier, st.seed, true);
    this.syncInputAndAudioForPhase();
  }

  private ensureMapVisualsLoaded(
    mapId: MapId,
    mapTier: MapTier,
    seed: number,
    forceReload: boolean,
  ): void {
    const key = `${mapId}:${mapTier}:${seed}`;
    if (!forceReload && this.activeLoadedMapKey === key) return;
    this.activeLoadedMapKey = key;
    this.renderer.loadMapVisuals(mapId, mapTier, seed, this.sim.getTerrainSampler());
  }

  private applySettingsPatch(patch: Partial<RenderSettings>): void {
    const updated = this.saveManager.updateSettings(patch);
    this.renderer.setSettings(updated);
    this.audio.setSettings(updated);
    this.audio.setBoomboxTrack(updated.boomboxTrack);
    this.input.setCalibration(updated.gamepad);
    this.input.setMouseSettings(updated.mouseSensitivity, updated.invertMouseY);
  }

  private dispatchSimEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;

    this.renderer.consumeEvents(events);
    this.audio.consumeEvents(events);

    const vibrationEnabled = this.saveManager.getData().settings.gamepad.vibration;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;

      if (ev.type === 'phase_changed') {
        if (ev.to === 'victory') {
          this.recordRunOutcomeIfNeeded(true);
        } else if (ev.to === 'game_over') {
          this.recordRunOutcomeIfNeeded(false);
        }
      }

      if (!vibrationEnabled) continue;

      switch (ev.type) {
        case 'damage_dealt':
          if (ev.isBonker) this.input.pulseHaptic(1.0, 260);
          else if (ev.isMegacrit) this.input.pulseHaptic(0.65, 130);
          else if (ev.isExecute) this.input.pulseHaptic(0.55, 110);
          break;
        case 'player_hurt':
          this.input.pulseHaptic(0.75, 160);
          break;
        case 'player_jump_pad':
          this.input.pulseHaptic(0.45, 95);
          break;
        case 'player_jump':
          if (ev.isBhop && ev.streak >= 2) this.input.pulseHaptic(0.25, 45);
          break;
        case 'boss_spawn':
        case 'final_swarm_start':
          this.input.pulseHaptic(0.85, 320);
          break;
        case 'player_level_up':
          this.input.pulseHaptic(0.5, 140);
          break;
        case 'pickup_collected':
          if (ev.kind === 'nuke') this.input.pulseHaptic(0.95, 280);
          break;
        default:
          break;
      }
    }
  }

  private recordRunOutcomeIfNeeded(victory: boolean): void {
    if (this.runCounter <= 0 || this.recordedRunId === this.runCounter) return;
    this.recordedRunId = this.runCounter;

    const st = this.sim.getState();
    const p = st.player;
    const sum = st.summary;

    this.saveManager.recordRun({
      timestamp: new Date().toISOString(),
      characterId: st.characterId,
      mapId: st.mapId,
      mapTier: st.mapTier,
      victory,
      durationSec: st.simTimeSec,
      level: p.level,
      kills: p.kills,
      silverEarned: p.silverEarned,
      highestHit: sum.highestSingleHit,
    });

    if (victory && st.challengeId) {
      this.saveManager.markChallengeCompleted(st.challengeId);
    }

    // Update persistent quest progress metrics & auto-claim completed milestones
    this.saveManager.recordQuestProgress('total_kills', p.kills, 'add');
    this.saveManager.recordQuestProgress('bosses_killed', sum.bossesKilled, 'add');
    this.saveManager.recordQuestProgress('megacrits', sum.megacritsLanded, 'add');
    this.saveManager.recordQuestProgress('bonkers', sum.bonkersLanded, 'add');
    this.saveManager.recordQuestProgress('shrines_completed', sum.shrinesCompleted, 'add');
    this.saveManager.recordQuestProgress('chests_opened', sum.chestsOpened, 'add');
    this.saveManager.recordQuestProgress('pylons_cleansed', sum.pylonsCleansed, 'add');
    this.saveManager.recordQuestProgress('top_speed', sum.topSpeedReached, 'max');
    if (victory) {
      this.saveManager.recordQuestProgress('victories', 1, 'add');
    }

    for (const quest of this.sim.getCatalog().quests) {
      this.saveManager.claimQuest(quest);
    }
  }

  private syncInputAndAudioForPhase(): void {
    const phase = this.sim.getState().phase;
    const isPlaying = phase === 'playing';
    this.input.setPointerLockAllowed(isPlaying);
    if (!isPlaying && this.input.isPointerLocked()) {
      this.input.exitPointerLock();
    }
    this.syncMusicForCurrentState();
  }

  private syncMusicForCurrentState(): void {
    const st = this.sim.getState();
    switch (st.phase) {
      case 'boot':
      case 'title':
      case 'character_select':
      case 'map_select':
      case 'shop':
      case 'quests':
      case 'settings':
        this.audio.setMusicState('title');
        break;
      case 'victory':
        this.audio.setMusicState('victory');
        break;
      case 'game_over':
        this.audio.setMusicState('game_over');
        break;
      default: {
        if (st.finalSwarmActive) {
          this.audio.setMusicState('final_swarm');
        } else {
          const bossAlive = st.enemies.some((e) => e.isBoss && e.hp > 0);
          this.audio.setMusicState(bossAlive ? 'boss' : 'explore');
        }
        break;
      }
    }
  }

  private syncContinuousAudio(state: Readonly<SimState>, dtSec: number): void {
    if (state.phase === 'playing' && !state.player.dead) {
      const p = state.player;
      const horizSpeed = Math.hypot(p.vel.x, p.vel.z);
      this.audio.setContinuousMovement(horizSpeed, p.isSliding, p.railId !== null);

      // Find any active ChargeShrine currently being charged by player
      let shrineRatio: number | null = null;
      for (let i = 0; i < state.interactables.length; i++) {
        const it = state.interactables[i]!;
        if (
          it.kind === 'ChargeShrine' &&
          !it.used &&
          it.active &&
          it.chargeProgress > 0 &&
          it.chargeDurationSec > 0
        ) {
          const dx = p.pos.x - it.pos.x;
          const dz = p.pos.z - it.pos.z;
          if (dx * dx + dz * dz <= it.radius * it.radius) {
            shrineRatio = it.chargeProgress / it.chargeDurationSec;
            break;
          }
        }
      }
      this.audio.setShrineChargeProgress(shrineRatio);
    } else {
      this.audio.setContinuousMovement(0, false, false);
      this.audio.setShrineChargeProgress(null);
    }

    this.audio.update(dtSec);
  }

  // ==========================================================================
  // CUSTOM ASSET PACK LOADER & LIVE SWITCHING
  // ==========================================================================

  private async probeDevCustomPack(): Promise<void> {
    const ok = await this.customPack.loadFromDevEndpoint(CUSTOM_PACK_DEV_PREFIX);
    if (!ok || this.disposed) return;

    this.customPackName = 'Local Dev Pack';
    const enabled = this.saveManager.getData().customPackEnabled;
    const registry = this.renderer.getAssetRegistry();
    registry.setCustomPack(this.customPack);
    registry.setCustomPackEnabled(enabled);
    this.audio.setAssetPack(enabled ? this.customPack : null);
  }

  private setCustomPackEnabled(enabled: boolean): void {
    this.saveManager.setCustomPackEnabled(enabled);
    const registry = this.renderer.getAssetRegistry();
    registry.setCustomPackEnabled(enabled);
    this.audio.setAssetPack(enabled && this.customPack.isLoaded() ? this.customPack : null);
  }

  private openCustomPackFolderPicker(): void {
    if (typeof document === 'undefined') return;
    if (!this.folderPickerInput) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.style.display = 'none';
      input.addEventListener('change', () => {
        void this.handleCustomPackFilesSelected(input.files);
        input.value = '';
      });
      document.body.appendChild(input);
      this.folderPickerInput = input;
    }
    this.folderPickerInput.click();
  }

  private async handleCustomPackFilesSelected(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    const entries: CustomPackFileEntry[] = [];
    let rootFolderName = 'Custom Pack';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (i === 0 && rel.includes('/')) {
        rootFolderName = rel.split('/')[0] || rootFolderName;
      }
      try {
        const buf = await file.arrayBuffer();
        entries.push({
          relativePath: rel,
          bytes: new Uint8Array(buf),
          mimeType: file.type || undefined,
        });
      } catch {
        // Skip unreadable individual files gracefully
      }
    }

    const ok = await this.customPack.loadFromFiles(entries);
    if (ok) {
      this.customPackName = rootFolderName;
      const registry = this.renderer.getAssetRegistry();
      registry.setCustomPack(this.customPack);
      this.setCustomPackEnabled(true);
      this.audio.playSfx('ui_confirm');
    } else {
      this.audio.playSfx('ui_cancel');
    }
  }

  // ==========================================================================
  // WINDOW & POINTER EVENTS
  // ==========================================================================

  private readonly handleWindowResize = (): void => {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : window.innerWidth;
    const h = rect.height > 0 ? rect.height : window.innerHeight;
    this.renderer.resize(w, h, window.devicePixelRatio || 1);
  };

  private readonly handleContainerPointerDown = (ev: PointerEvent): void => {
    this.audio.unlock();
    if (ev.pointerType !== 'mouse') return;
    if (this.sim.getState().phase !== 'playing') return;

    // Only request pointer lock when clicking the 3D canvas (not HUD/DebugDrawer buttons)
    const target = ev.target;
    if (target instanceof HTMLElement && target.closest('[data-kb-debug-drawer], [data-kb-menus]')) {
      return;
    }
    if (!this.input.isPointerLocked()) {
      this.input.requestPointerLock();
    }
  };
}

export function createGameApp(): GameApp {
  return new GameApp();
}
