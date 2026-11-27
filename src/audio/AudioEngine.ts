/**
 * KRUNKEDBONK — Web Audio Engine, Spam-Filtered Mixer & Dual-Mode Custom Pack Player
 *
 * Implements IAudioEngine (src/contracts/index.ts):
 * - Safe browser autoplay unlock on first user gesture; graceful no-op in headless Node.
 * - Dual-mode playback: plays decoded clips from IAssetPack when available, seamlessly
 *   falling back to ProceduralSynth & procedural step-sequencer tracks with zero latency.
 * - AudioSpamFilter micro-cooldowns & polyphony caps + master DynamicsCompressorNode limiter
 *   + separate Master / Music / SFX / Mute gain nodes.
 * - Continuous movement loop modulation via setContinuousMovement(speed, isSliding, isGrinding).
 * - Wave 2 Boombox track override hook via setBoomboxTrack(trackId).
 */

import {
  DEFAULT_RENDER_SETTINGS,
  type IAssetPack,
  type IAudioEngine,
  type RenderSettings,
  type SimEvent,
} from '../contracts/index';
import { ProceduralSynth } from './ProceduralSynth';
import {
  AudioSpamFilter,
  getCustomPackClipCandidates,
  isMusicTrackId,
  mapSimEventToSfxRequests,
  MUSIC_STATE_TO_TRACK,
  MUSIC_TRACK_MANIFEST,
  SFX_MANIFEST,
  type MusicState,
  type MusicTrackId,
  type MusicTrackManifestEntry,
  type SfxCueId,
  type SfxTriggerRequest,
} from './soundManifest';
import { MusicSequencer } from './tracks';

export type AudioSettingsPatch = Pick<
  RenderSettings,
  'audioMaster' | 'audioSfx' | 'audioMusic' | 'audioMuted'
> & {
  boomboxTrack?: string;
};

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContextCtor(): AudioContextConstructor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class AudioEngine implements IAudioEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private muteGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicDuckGain: GainNode | null = null;

  private synth: ProceduralSynth | null = null;
  private sequencer: MusicSequencer | null = null;
  private readonly spamFilter = new AudioSpamFilter(24, 1150);

  private assetPack: IAssetPack | null = null;
  private assetPackGeneration = 0;
  private readonly decodedCache = new Map<string, AudioBuffer | null>();
  private readonly decodeInFlight = new Map<string, Promise<AudioBuffer | null>>();

  private customMusicSource: AudioBufferSourceNode | null = null;
  private customMusicGain: GainNode | null = null;
  private activeCustomTrackId: MusicTrackId | null = null;

  private settings: {
    audioMaster: number;
    audioSfx: number;
    audioMusic: number;
    audioMuted: boolean;
  } = {
    audioMaster: DEFAULT_RENDER_SETTINGS.audioMaster,
    audioSfx: DEFAULT_RENDER_SETTINGS.audioSfx,
    audioMusic: DEFAULT_RENDER_SETTINGS.audioMusic,
    audioMuted: DEFAULT_RENDER_SETTINGS.audioMuted,
  };

  private musicState: MusicState = 'silent';
  private boomboxTrack = 'auto';
  private musicDuckFactor = 1.0;
  private activeTrackId: MusicTrackId | null = null;
  private finalSwarmActive = false;

  private initialized = false;
  private unlocked = false;
  private disposed = false;
  private gestureCleanup: (() => void) | null = null;

  // Tracked continuous movement state so pre-unlock calls apply cleanly on unlock
  private moveSpeed = 0;
  private moveSliding = false;
  private moveGrinding = false;

  // Shrine continuous charge ramp throttle
  private lastShrineStep = -1;

  // ==========================================================================
  // LIFECYCLE (IAudioEngine)
  // ==========================================================================

  public init(): void {
    if (this.disposed || this.initialized) return;
    this.initialized = true;

    // Attach safe one-time browser unlock gesture listeners if DOM event target exists
    this.attachGestureUnlockListeners();
  }

  public unlock(): void {
    if (this.disposed) return;
    if (!this.initialized) {
      this.init();
    }

    const ctx = this.ensureAudioGraph();
    if (!ctx) {
      // Headless Node or unsupported runtime: remain in graceful no-op mode
      return;
    }

    const finalizeUnlock = (): void => {
      if (this.disposed) return;
      this.unlocked = true;
      this.detachGestureUnlockListeners();
      this.applyMixGains(false);
      this.syncActiveMusicTrack(true);
      this.synth?.setContinuousMovement(this.moveSpeed, this.moveSliding, this.moveGrinding);
    };

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx
        .resume()
        .then(() => {
          finalizeUnlock();
        })
        .catch(() => {
          // Autoplay gesture not yet granted; listeners remain armed for next gesture
        });
    } else if (ctx.state === 'running') {
      finalizeUnlock();
    }
  }

  public isUnlocked(): boolean {
    return this.unlocked && this.ctx !== null && this.ctx.state === 'running';
  }

  public setSettings(settings: AudioSettingsPatch): void {
    this.settings.audioMaster = clamp01(settings.audioMaster);
    this.settings.audioSfx = clamp01(settings.audioSfx);
    this.settings.audioMusic = clamp01(settings.audioMusic);
    this.settings.audioMuted = Boolean(settings.audioMuted);

    if (typeof settings.boomboxTrack === 'string') {
      this.setBoomboxTrack(settings.boomboxTrack);
    }

    this.applyMixGains(true);
  }

  public setAssetPack(pack: IAssetPack | null): void {
    if (this.assetPack === pack) return;
    this.assetPack = pack;
    this.assetPackGeneration++;
    this.decodedCache.clear();
    this.decodeInFlight.clear();

    // Refresh active music track so custom pack BGM can take over if present
    if (this.activeTrackId && this.ctx) {
      this.syncActiveMusicTrack(true);
    }
  }

  // ==========================================================================
  // EVENT CONSUMPTION & SFX PLAYBACK
  // ==========================================================================

  public consumeEvents(events: readonly SimEvent[]): void {
    if (this.disposed || events.length === 0) return;

    const ts = nowMs();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Sync lightweight movement/music hints before emitting one-shot cues
      this.handleEventStateSideEffects(event);

      const requests = mapSimEventToSfxRequests(event);
      for (let j = 0; j < requests.length; j++) {
        this.triggerSfxRequest(requests[j], ts);
      }
    }
  }

  /** Play an explicit SFX cue (e.g., UI navigation, menus, shrine charge tick). */
  public playSfx(
    cueId: SfxCueId,
    options?: Omit<SfxTriggerRequest, 'cueId'>,
  ): void {
    if (this.disposed) return;
    this.triggerSfxRequest({ cueId, ...options }, nowMs());
  }

  /**
   * Modulate continuous slide and rail-grind procedural loops smoothly with speed.
   * Safe to invoke every frame from the main simulation/render loop.
   */
  public setContinuousMovement(
    speed: number,
    isSliding: boolean,
    isGrinding: boolean,
  ): void {
    this.moveSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    this.moveSliding = isSliding;
    this.moveGrinding = isGrinding;

    if (this.disposed || !this.synth || !this.ctx || this.ctx.state !== 'running') {
      return;
    }
    this.synth.setContinuousMovement(this.moveSpeed, this.moveSliding, this.moveGrinding);
  }

  /**
   * Optional helper for smooth ChargeShrine ramp audio when standing inside a shrine ring.
   * Pass `null` when not charging a shrine.
   */
  public setShrineChargeProgress(progress: number | null): void {
    if (progress === null || !Number.isFinite(progress) || progress <= 0 || progress >= 1) {
      this.lastShrineStep = -1;
      return;
    }
    const step = Math.min(10, Math.floor(progress * 10));
    if (step !== this.lastShrineStep) {
      this.lastShrineStep = step;
      this.playSfx('shrine_charge', { streak: step, intensity: 0.8 + step * 0.03 });
    }
  }

  // ==========================================================================
  // ADAPTIVE MUSIC & BOOMBOX HOOK
  // ==========================================================================

  public setMusicState(state: MusicState): void {
    if (this.disposed) return;
    if (state === 'title' || state === 'explore') {
      this.finalSwarmActive = false;
    } else if (state === 'final_swarm') {
      this.finalSwarmActive = true;
    }

    if (this.musicState === state && this.activeTrackId === this.resolveDesiredTrackId()) {
      return;
    }
    this.musicState = state;
    this.syncActiveMusicTrack(false);
  }

  /**
   * Wave 2 Boombox hook:
   * - `'auto'` restores adaptive state-driven soundtrack selection.
   * - Any valid `MusicTrackId` (`title`, `forest_explore`, `forest_boss`, `final_swarm`,
   *   `victory`, `game_over`) locks gameplay/menu music to that track until reset to `'auto'`.
   */
  public setBoomboxTrack(trackId: string): void {
    if (this.disposed) return;
    const normalized = trackId.trim().toLowerCase();
    if (normalized === '' || normalized === 'auto' || normalized === 'default') {
      if (this.boomboxTrack === 'auto') return;
      this.boomboxTrack = 'auto';
      this.syncActiveMusicTrack(false);
      return;
    }

    if (isMusicTrackId(normalized)) {
      if (this.boomboxTrack === normalized) return;
      this.boomboxTrack = normalized;
      this.syncActiveMusicTrack(true);
    }
  }

  public getBoomboxTrack(): string {
    return this.boomboxTrack;
  }

  public getAvailableBoomboxTracks(): readonly MusicTrackManifestEntry[] {
    return Object.values(MUSIC_TRACK_MANIFEST).filter((t) => t.boomboxSelectable);
  }

  public getActiveTrackId(): MusicTrackId | null {
    return this.activeTrackId;
  }

  public getMusicState(): MusicState {
    return this.musicState;
  }

  // ==========================================================================
  // PER-FRAME UPDATE & DISPOSE
  // ==========================================================================

  public update(_dtSec: number): void {
    if (this.disposed) return;
    if (this.ctx && this.ctx.state === 'running' && this.sequencer && !this.customMusicSource) {
      this.sequencer.tick();
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.assetPackGeneration++;
    this.detachGestureUnlockListeners();

    this.stopCustomMusic(0.02);
    this.sequencer?.dispose();
    this.sequencer = null;

    this.synth?.dispose();
    this.synth = null;

    this.spamFilter.reset();
    this.decodedCache.clear();
    this.decodeInFlight.clear();

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
        void ctx.close().catch(() => {
          // Ignore close errors
        });
      }
    }

    this.compressor = null;
    this.masterGain = null;
    this.muteGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicDuckGain = null;
    this.unlocked = false;
  }

  // ==========================================================================
  // INTERNAL AUDIO GRAPH & MIXER
  // ==========================================================================

  private ensureAudioGraph(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return null;

    try {
      const ctx = new Ctor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.14;

      const masterGain = ctx.createGain();
      const muteGain = ctx.createGain();
      const sfxGain = ctx.createGain();
      const musicGain = ctx.createGain();
      const musicDuckGain = ctx.createGain();

      sfxGain.connect(compressor);
      musicDuckGain.connect(musicGain);
      musicGain.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(muteGain);
      muteGain.connect(ctx.destination);

      this.ctx = ctx;
      this.compressor = compressor;
      this.masterGain = masterGain;
      this.muteGain = muteGain;
      this.sfxGain = sfxGain;
      this.musicGain = musicGain;
      this.musicDuckGain = musicDuckGain;

      this.synth = new ProceduralSynth(ctx, sfxGain);
      this.sequencer = new MusicSequencer(ctx, musicDuckGain);

      this.applyMixGains(false);
      return ctx;
    } catch {
      return null;
    }
  }

  private applyMixGains(smooth: boolean): void {
    if (!this.ctx || !this.masterGain || !this.muteGain || !this.sfxGain || !this.musicGain || !this.musicDuckGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const setParam = (param: AudioParam, value: number): void => {
      if (smooth && typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(value, now, 0.025);
      } else {
        param.setValueAtTime(value, now);
      }
    };

    setParam(this.masterGain.gain, this.settings.audioMaster);
    setParam(this.sfxGain.gain, this.settings.audioSfx);
    setParam(this.musicGain.gain, this.settings.audioMusic);
    setParam(this.musicDuckGain.gain, this.musicDuckFactor);
    setParam(this.muteGain.gain, this.settings.audioMuted ? 0 : 1);
  }

  private setMusicDuck(factor: number): void {
    this.musicDuckFactor = Math.max(0.15, Math.min(1.0, factor));
    if (this.ctx && this.musicDuckGain) {
      this.musicDuckGain.gain.setTargetAtTime(this.musicDuckFactor, this.ctx.currentTime, 0.08);
    }
  }

  // ==========================================================================
  // INTERNAL EVENT SIDE-EFFECTS & DUAL-MODE PLAYBACK
  // ==========================================================================

  private handleEventStateSideEffects(event: SimEvent): void {
    switch (event.type) {
      case 'player_slide_start':
        this.setContinuousMovement(Math.max(event.speed, 10), true, this.moveGrinding);
        break;
      case 'player_slide_end':
        this.setContinuousMovement(this.moveSpeed, false, this.moveGrinding);
        break;
      case 'player_rail_attach':
        this.setContinuousMovement(Math.max(this.moveSpeed, 20), false, true);
        break;
      case 'player_rail_detach':
        this.setContinuousMovement(this.moveSpeed, this.moveSliding, false);
        break;
      case 'boss_spawn':
        this.setMusicState('boss');
        break;
      case 'boss_defeated':
        if (this.musicState === 'boss') {
          this.setMusicState(this.finalSwarmActive ? 'final_swarm' : 'explore');
        }
        break;
      case 'final_swarm_start':
        this.finalSwarmActive = true;
        this.setMusicState('final_swarm');
        break;
      case 'phase_changed': {
        const to = event.to;
        if (to === 'paused') {
          this.setMusicDuck(0.45);
          this.synth?.stopContinuousLoops();
        } else if (to === 'level_up' || to === 'chest_open' || to === 'merchant' || to === 'microwave') {
          this.setMusicDuck(0.65);
          this.synth?.stopContinuousLoops();
        } else if (to === 'playing') {
          this.setMusicDuck(1.0);
          if (this.musicState === 'title' || this.musicState === 'silent') {
            this.setMusicState('explore');
          }
        } else if (to === 'title' || to === 'character_select' || to === 'map_select' || to === 'shop' || to === 'quests' || to === 'settings') {
          this.setMusicDuck(1.0);
          this.synth?.stopContinuousLoops();
          this.setMusicState('title');
        } else if (to === 'victory') {
          this.setMusicDuck(1.0);
          this.synth?.stopContinuousLoops();
          this.setMusicState('victory');
        } else if (to === 'game_over') {
          this.setMusicDuck(1.0);
          this.synth?.stopContinuousLoops();
          this.setMusicState('game_over');
        }
        break;
      }
      default:
        break;
    }
  }

  private triggerSfxRequest(req: SfxTriggerRequest, tsMs: number): void {
    const acquired = this.spamFilter.tryAcquire(req.cueId, tsMs);
    if (!acquired.allowed) return;

    const streak =
      req.cueId === 'xp'
        ? this.spamFilter.advanceXpStreak(tsMs)
        : req.streak ?? 0;

    if (!this.ctx || !this.sfxGain || !this.synth || this.ctx.state !== 'running') {
      return;
    }
    if (this.settings.audioMuted || this.settings.audioMaster <= 0.001 || this.settings.audioSfx <= 0.001) {
      return;
    }

    const def = SFX_MANIFEST[req.cueId];
    const intensity = req.intensity ?? 1.0;
    const finalGain = def.gain * acquired.densityGainScale * intensity;

    // Dual-mode: attempt Custom Pack clip first, falling back instantly to ProceduralSynth
    const customUrl = this.findCustomPackClipUrl(getCustomPackClipCandidates(req.cueId, req.weaponId));
    if (customUrl) {
      const cached = this.decodedCache.get(customUrl);
      if (cached) {
        const jitter =
          def.pitchJitter > 0 ? 1 + (Math.random() * 2 - 1) * def.pitchJitter : 1;
        const xpScale = req.cueId === 'xp' ? Math.pow(1.045, Math.min(14, streak)) : 1;
        const rate = (req.pitchScale ?? 1.0) * jitter * xpScale;
        this.playCustomBufferOneShot(cached, finalGain, rate);
        return;
      }
      // Kick off non-blocking decode for future triggers; fall through to synth immediately!
      if (!this.decodedCache.has(customUrl)) {
        void this.loadCustomAudioBuffer(customUrl);
      }
    }

    this.synth.playCue(req.cueId, {
      gain: finalGain,
      pitchScale: req.pitchScale,
      streak,
      debuff: req.debuff,
      intensity,
    });
  }

  private resolveDesiredTrackId(): MusicTrackId | null {
    if (this.musicState === 'silent') return null;
    if (this.musicState === 'victory' || this.musicState === 'game_over') {
      return MUSIC_STATE_TO_TRACK[this.musicState];
    }
    if (this.boomboxTrack !== 'auto' && isMusicTrackId(this.boomboxTrack)) {
      return this.boomboxTrack;
    }
    return MUSIC_STATE_TO_TRACK[this.musicState];
  }

  private syncActiveMusicTrack(forceRestart: boolean): void {
    const desired = this.resolveDesiredTrackId();
    if (!forceRestart && desired === this.activeTrackId) {
      return;
    }
    this.activeTrackId = desired;

    if (!this.ctx || !this.musicDuckGain || !this.sequencer) {
      return;
    }

    if (!desired) {
      this.stopCustomMusic(0.2);
      this.sequencer.stop(0.2);
      return;
    }

    if (this.ctx.state !== 'running') {
      // Will resume automatically once unlock() resolves
      return;
    }

    const manifest = MUSIC_TRACK_MANIFEST[desired];
    const customUrl = this.findCustomPackClipUrl(manifest.customPackClipIds);
    if (customUrl) {
      const cached = this.decodedCache.get(customUrl);
      if (cached) {
        this.sequencer.stop(0.18);
        this.playCustomMusicBuffer(desired, cached, manifest.looping, manifest.gain);
        return;
      }
      // Start procedural soundtrack immediately so there is zero silence while decoding custom BGM
      this.stopCustomMusic(0.15);
      this.sequencer.playTrack(desired, forceRestart);

      if (!this.decodedCache.has(customUrl)) {
        const gen = this.assetPackGeneration;
        void this.loadCustomAudioBuffer(customUrl).then((buffer) => {
          if (
            this.disposed ||
            !buffer ||
            gen !== this.assetPackGeneration ||
            this.activeTrackId !== desired ||
            !this.ctx ||
            this.ctx.state !== 'running'
          ) {
            return;
          }
          this.sequencer?.stop(0.22);
          this.playCustomMusicBuffer(desired, buffer, manifest.looping, manifest.gain);
        });
      }
      return;
    }

    // Default built-in procedural Web Audio track
    this.stopCustomMusic(0.18);
    this.sequencer.playTrack(desired, forceRestart);
  }

  // ==========================================================================
  // CUSTOM PACK AUDIO LOADING & PLAYBACK
  // ==========================================================================

  private findCustomPackClipUrl(candidates: readonly string[]): string | null {
    if (!this.assetPack || !this.assetPack.isLoaded()) return null;
    for (let i = 0; i < candidates.length; i++) {
      const url = this.assetPack.getAudioUrl(candidates[i]);
      if (url) return url;
    }
    return null;
  }

  private async loadCustomAudioBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.decodedCache.has(url)) {
      return this.decodedCache.get(url) ?? null;
    }
    const existing = this.decodeInFlight.get(url);
    if (existing) return existing;

    const ctx = this.ctx;
    if (!ctx || typeof fetch !== 'function') {
      this.decodedCache.set(url, null);
      return null;
    }

    const gen = this.assetPackGeneration;
    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (gen === this.assetPackGeneration) this.decodedCache.set(url, null);
          return null;
        }
        const raw = await res.arrayBuffer();
        if (this.disposed || gen !== this.assetPackGeneration || ctx.state === 'closed') {
          return null;
        }
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        if (!this.disposed && gen === this.assetPackGeneration) {
          this.decodedCache.set(url, decoded);
        }
        return decoded;
      } catch {
        if (!this.disposed && gen === this.assetPackGeneration) {
          this.decodedCache.set(url, null);
        }
        return null;
      } finally {
        this.decodeInFlight.delete(url);
      }
    })();

    this.decodeInFlight.set(url, promise);
    return promise;
  }

  private playCustomBufferOneShot(buffer: AudioBuffer, gain: number, playbackRate: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(Math.max(0.5, Math.min(2.2, playbackRate)), now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.001, Math.min(1.5, gain)), now);

    src.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
  }

  private playCustomMusicBuffer(
    trackId: MusicTrackId,
    buffer: AudioBuffer,
    looping: boolean,
    gain: number,
  ): void {
    if (!this.ctx || !this.musicDuckGain) return;
    if (this.activeCustomTrackId === trackId && this.customMusicSource) return;

    this.stopCustomMusic(0.18);

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = looping;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.16);

    src.connect(gainNode);
    gainNode.connect(this.musicDuckGain);
    src.start(now);

    this.customMusicSource = src;
    this.customMusicGain = gainNode;
    this.activeCustomTrackId = trackId;
  }

  private stopCustomMusic(fadeSec: number): void {
    const src = this.customMusicSource;
    const gainNode = this.customMusicGain;
    this.customMusicSource = null;
    this.customMusicGain = null;
    this.activeCustomTrackId = null;

    if (!src || !gainNode || !this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    const dur = Math.max(0.02, fadeSec);
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + dur);
      src.stop(now + dur + 0.02);
    } catch {
      // Ignore already-stopped source
    }
  }

  // ==========================================================================
  // AUTOPLAY GESTURE LISTENERS (BROWSER-ONLY, NO-OP IN HEADLESS NODE)
  // ==========================================================================

  private attachGestureUnlockListeners(): void {
    if (this.gestureCleanup) return;
    if (typeof globalThis === 'undefined') return;
    const target = globalThis as unknown as {
      addEventListener?: (
        type: string,
        listener: () => void,
        options?: { passive?: boolean; capture?: boolean },
      ) => void;
      removeEventListener?: (
        type: string,
        listener: () => void,
        options?: { capture?: boolean },
      ) => void;
    };
    if (typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
      return;
    }

    const onGesture = (): void => {
      this.unlock();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    for (const evt of events) {
      target.addEventListener(evt, onGesture, { passive: true, capture: true });
    }
    this.gestureCleanup = () => {
      for (const evt of events) {
        target.removeEventListener?.(evt, onGesture, { capture: true });
      }
      this.gestureCleanup = null;
    };
  }

  private detachGestureUnlockListeners(): void {
    this.gestureCleanup?.();
  }
}

export function createAudioEngine(): AudioEngine {
  return new AudioEngine();
}
