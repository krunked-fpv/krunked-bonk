/**
 * KRUNKEDBONK — Procedural Retro-Arcade + Gothic-Synth Web Audio Synthesizer
 *
 * Zero external audio files required; works offline immediately.
 * Features ±6% micro pitch jitter, pre-allocated noise & saturation buffers,
 * iconic hollow-anvil BONK synthesis, distinct weapon family timbres,
 * pentatonic XP combo chimes, and click-free continuous slide & rail-grind loops.
 */

import type { DebuffType } from '../contracts/index';
import {
  CONTINUOUS_LOOP_MANIFEST,
  SFX_MANIFEST,
  type SfxCueId,
} from './soundManifest';

export interface SynthPlayParams {
  /** Combined gain multiplier (cue gain * density scale * intensity) */
  gain: number;
  /** Optional explicit pitch scale (multiplied with cue micro pitch jitter) */
  pitchScale?: number;
  /** Optional streak / progression index (xp combo, bhop streak, shrine ramp, etc.) */
  streak?: number;
  /** Optional debuff flavor */
  debuff?: DebuffType;
  /** Optional normalized intensity (0.2..1.5) */
  intensity?: number;
}

/** Musical D-minor / F-major pentatonic frequencies for escalating XP streaks */
const XP_PENTATONIC_HZ: readonly number[] = [
  587.33, // D5
  698.46, // F5
  783.99, // G5
  880.0, // A5
  1046.5, // C6
  1174.66, // D6
  1396.91, // F6
  1567.98, // G6
  1760.0, // A6
  2093.0, // C7
  2349.32, // D7
  2489.02, // Eb7 tension sparkle
  2637.02, // E7
  2793.83, // F7
  3135.96, // G7
  3520.0, // A7
];

interface SlideLoopNodes {
  source: AudioBufferSourceNode;
  gravelFilter: BiquadFilterNode;
  windFilter: BiquadFilterNode;
  gravelGain: GainNode;
  windGain: GainNode;
  masterGain: GainNode;
}

interface RailGrindLoopNodes {
  sparkSource: AudioBufferSourceNode;
  sparkFilter: BiquadFilterNode;
  sparkGain: GainNode;
  humOscA: OscillatorNode;
  humOscB: OscillatorNode;
  humFilter: BiquadFilterNode;
  humGain: GainNode;
  sputterLfo: OscillatorNode;
  sputterDepth: GainNode;
  masterGain: GainNode;
}

export class ProceduralSynth {
  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly whiteNoiseBuffer: AudioBuffer;
  private readonly pinkNoiseBuffer: AudioBuffer;
  private readonly crackleNoiseBuffer: AudioBuffer;
  private readonly softClipCurve: Float32Array<ArrayBuffer>;
  private slideLoop: SlideLoopNodes | null = null;
  private railGrindLoop: RailGrindLoopNodes | null = null;
  private disposed = false;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.output = output;
    this.whiteNoiseBuffer = this.createWhiteNoiseBuffer(1.5);
    this.pinkNoiseBuffer = this.createPinkNoiseBuffer(1.8);
    this.crackleNoiseBuffer = this.createCrackleNoiseBuffer(1.2);
    this.softClipCurve = this.createSoftClipCurve(256, 3.2);
  }

  /** Trigger a synthesized procedural SFX cue with micro pitch jitter. */
  public playCue(cueId: SfxCueId, params: SynthPlayParams): void {
    if (this.disposed || this.ctx.state === 'closed') return;

    const def = SFX_MANIFEST[cueId];
    const now = this.ctx.currentTime + 0.002;
    const baseGain = Math.max(0.001, Math.min(1.6, params.gain));
    const jitter = def.pitchJitter > 0 ? this.computePitchJitter(def.pitchJitter) : 1.0;
    const pitch = (params.pitchScale ?? 1.0) * jitter;
    const streak = params.streak ?? 0;
    const intensity = params.intensity ?? 1.0;

    switch (cueId) {
      case 'bonk':
        this.synthBonk(now, baseGain, pitch);
        break;
      case 'megacrit':
        this.synthMegacrit(now, baseGain, pitch);
        break;
      case 'crit':
        this.synthCrit(now, baseGain, pitch);
        break;
      case 'hit':
        this.synthHit(now, baseGain, pitch);
        break;
      case 'execute':
        this.synthExecute(now, baseGain, pitch);
        break;
      case 'kill':
        this.synthKill(now, baseGain, pitch, false);
        break;
      case 'kill_elite':
        this.synthKill(now, baseGain, pitch, true);
        break;
      case 'debuff':
        this.synthDebuff(now, baseGain, pitch, params.debuff);
        break;
      case 'item_proc':
        this.synthItemProc(now, baseGain, pitch);
        break;
      case 'player_hurt':
        this.synthPlayerHurt(now, baseGain, pitch);
        break;
      case 'player_hurt_shield':
        this.synthShieldBlock(now, baseGain, pitch);
        break;
      case 'player_dodge':
        this.synthDodge(now, baseGain, pitch);
        break;
      case 'player_death':
        this.synthPlayerDeath(now, baseGain);
        break;
      case 'player_revive':
        this.synthPlayerRevive(now, baseGain);
        break;

      // Weapon families
      case 'weapon_fire_fire':
        this.synthWeaponFire(now, baseGain, pitch);
        break;
      case 'weapon_fire_bone':
        this.synthWeaponBone(now, baseGain, pitch);
        break;
      case 'weapon_fire_sword':
        this.synthWeaponSword(now, baseGain, pitch);
        break;
      case 'weapon_fire_aura':
        this.synthWeaponAura(now, baseGain, pitch);
        break;
      case 'weapon_fire_revolver':
        this.synthWeaponRevolver(now, baseGain, pitch);
        break;
      case 'weapon_fire_rock':
        this.synthWeaponRock(now, baseGain, pitch);
        break;
      case 'weapon_fire_lightning':
        this.synthWeaponLightning(now, baseGain, pitch);
        break;
      case 'weapon_fire_sniper':
        this.synthWeaponSniper(now, baseGain, pitch);
        break;
      case 'weapon_fire_bow':
        this.synthWeaponBow(now, baseGain, pitch);
        break;
      case 'weapon_stolen':
        this.synthWeaponStolen(now, baseGain);
        break;
      case 'weapon_reclaimed':
        this.synthWeaponReclaimed(now, baseGain);
        break;

      // Movement
      case 'jump':
        this.synthJump(now, baseGain, pitch, 0, false);
        break;
      case 'bhop':
        this.synthJump(now, baseGain, pitch, streak, false);
        break;
      case 'air_jump':
        this.synthJump(now, baseGain, pitch, 0, true);
        break;
      case 'land':
        this.synthLand(now, baseGain, pitch, intensity);
        break;
      case 'fall_damage':
        this.synthFallDamage(now, baseGain, pitch);
        break;
      case 'slide_start':
        this.synthSlideStart(now, baseGain, pitch);
        break;
      case 'slide_end':
        this.synthSlideEnd(now, baseGain, pitch);
        break;
      case 'wall_climb':
        this.synthWallClimb(now, baseGain, pitch);
        break;
      case 'rail_attach':
        this.synthRailAttach(now, baseGain, pitch);
        break;
      case 'rail_detach':
        this.synthRailDetach(now, baseGain, pitch);
        break;
      case 'jump_pad':
        this.synthJumpPad(now, baseGain, pitch);
        break;
      case 'unstuck':
        this.synthUnstuck(now, baseGain);
        break;

      // Pickups & progression
      case 'xp':
        this.synthXp(now, baseGain, pitch, streak);
        break;
      case 'gold':
        this.synthGold(now, baseGain, pitch);
        break;
      case 'silver':
        this.synthSilver(now, baseGain, pitch);
        break;
      case 'heal':
        this.synthHeal(now, baseGain, pitch);
        break;
      case 'powerup':
        this.synthPowerup(now, baseGain, pitch);
        break;
      case 'level_up':
        this.synthLevelUp(now, baseGain);
        break;

      // World & bosses
      case 'shrine_charge':
        this.synthShrineCharge(now, baseGain, pitch, streak);
        break;
      case 'shrine_complete':
        this.synthShrineComplete(now, baseGain);
        break;
      case 'chest_open':
        this.synthChestOpen(now, baseGain);
        break;
      case 'pot_break':
        this.synthPotBreak(now, baseGain, pitch);
        break;
      case 'pylon_charged':
        this.synthPylonCharged(now, baseGain, pitch);
        break;
      case 'portal_activated':
        this.synthPortalActivated(now, baseGain);
        break;
      case 'elite_spawn':
        this.synthEliteSpawn(now, baseGain, pitch);
        break;
      case 'boss_spawn':
        this.synthBossSpawn(now, baseGain);
        break;
      case 'boss_defeated':
        this.synthBossDefeated(now, baseGain);
        break;
      case 'final_swarm':
        this.synthFinalSwarm(now, baseGain);
        break;

      // UI
      case 'ui_move':
        this.synthUiMove(now, baseGain, pitch);
        break;
      case 'ui_confirm':
        this.synthUiConfirm(now, baseGain);
        break;
      case 'ui_cancel':
        this.synthUiCancel(now, baseGain);
        break;
      case 'ui_reroll':
        this.synthUiReroll(now, baseGain, pitch);
        break;
      case 'ui_banish':
        this.synthUiBanish(now, baseGain, pitch);
        break;
    }
  }

  /**
   * Smoothly modulate continuous crouch-slide & spline rail-grind loops.
   * Safe to call every render/sim frame with zero allocations once active.
   */
  public setContinuousMovement(
    speed: number,
    isSliding: boolean,
    isGrinding: boolean,
  ): void {
    if (this.disposed || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;

    // --- Slide Loop (wind + gravel filter sweep proportional to speed) ---
    if (isSliding && safeSpeed > 2.0) {
      const loop = this.ensureSlideLoop();
      const norm = Math.min(1, Math.max(0, (safeSpeed - 4) / 24));
      const baseGain = CONTINUOUS_LOOP_MANIFEST.slide_loop.gain;
      loop.gravelFilter.frequency.setTargetAtTime(280 + norm * 1150, now, 0.04);
      loop.windFilter.frequency.setTargetAtTime(700 + norm * 2400, now, 0.045);
      loop.gravelGain.gain.setTargetAtTime(0.65 + norm * 0.35, now, 0.04);
      loop.windGain.gain.setTargetAtTime(0.25 + norm * 0.75, now, 0.05);
      loop.masterGain.gain.setTargetAtTime(baseGain * (0.38 + norm * 0.62), now, 0.045);
    } else if (this.slideLoop) {
      this.slideLoop.masterGain.gain.setTargetAtTime(0.0, now, 0.055);
    }

    // --- Rail Grind Loop (metallic spark hiss + resonant hum) ---
    if (isGrinding && safeSpeed > 1.0) {
      const loop = this.ensureRailGrindLoop();
      const norm = Math.min(1, Math.max(0, safeSpeed / 28));
      const baseGain = CONTINUOUS_LOOP_MANIFEST.rail_grind_loop.gain;
      loop.sparkFilter.frequency.setTargetAtTime(2200 + norm * 2300, now, 0.035);
      loop.humFilter.frequency.setTargetAtTime(580 + norm * 920, now, 0.04);
      loop.humOscA.frequency.setTargetAtTime(175 + norm * 65, now, 0.04);
      loop.humOscB.frequency.setTargetAtTime(262 + norm * 98, now, 0.04);
      loop.sputterLfo.frequency.setTargetAtTime(11 + norm * 14, now, 0.05);
      loop.masterGain.gain.setTargetAtTime(baseGain * (0.45 + norm * 0.55), now, 0.04);
    } else if (this.railGrindLoop) {
      this.railGrindLoop.masterGain.gain.setTargetAtTime(0.0, now, 0.05);
    }
  }

  /** Fade continuous movement loops silently to zero (e.g. pause / menu). */
  public stopContinuousLoops(): void {
    if (this.disposed || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    if (this.slideLoop) {
      this.slideLoop.masterGain.gain.setTargetAtTime(0, now, 0.035);
    }
    if (this.railGrindLoop) {
      this.railGrindLoop.masterGain.gain.setTargetAtTime(0, now, 0.035);
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.slideLoop) {
      try {
        this.slideLoop.source.stop();
        this.slideLoop.source.disconnect();
        this.slideLoop.masterGain.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
      this.slideLoop = null;
    }
    if (this.railGrindLoop) {
      try {
        this.railGrindLoop.sparkSource.stop();
        this.railGrindLoop.humOscA.stop();
        this.railGrindLoop.humOscB.stop();
        this.railGrindLoop.sputterLfo.stop();
        this.railGrindLoop.masterGain.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
      this.railGrindLoop = null;
    }
  }

  // ==========================================================================
  // CONTINUOUS LOOP INITIALIZERS
  // ==========================================================================

  private ensureSlideLoop(): SlideLoopNodes {
    if (this.slideLoop) return this.slideLoop;

    const source = this.ctx.createBufferSource();
    source.buffer = this.pinkNoiseBuffer;
    source.loop = true;

    const gravelFilter = this.ctx.createBiquadFilter();
    gravelFilter.type = 'bandpass';
    gravelFilter.frequency.value = 520;
    gravelFilter.Q.value = 1.6;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 1350;
    windFilter.Q.value = 0.85;

    const gravelGain = this.ctx.createGain();
    gravelGain.gain.value = 0.75;

    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.45;

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.0;

    source.connect(gravelFilter);
    gravelFilter.connect(gravelGain);
    gravelGain.connect(masterGain);

    source.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    masterGain.connect(this.output);
    source.start();

    this.slideLoop = {
      source,
      gravelFilter,
      windFilter,
      gravelGain,
      windGain,
      masterGain,
    };
    return this.slideLoop;
  }

  private ensureRailGrindLoop(): RailGrindLoopNodes {
    if (this.railGrindLoop) return this.railGrindLoop;

    const sparkSource = this.ctx.createBufferSource();
    sparkSource.buffer = this.crackleNoiseBuffer;
    sparkSource.loop = true;

    const sparkFilter = this.ctx.createBiquadFilter();
    sparkFilter.type = 'bandpass';
    sparkFilter.frequency.value = 3200;
    sparkFilter.Q.value = 1.9;

    const sparkGain = this.ctx.createGain();
    sparkGain.gain.value = 0.65;

    // LFO modulates spark gain for crisp intermittent electric rail sparks
    const sputterLfo = this.ctx.createOscillator();
    sputterLfo.type = 'triangle';
    sputterLfo.frequency.value = 16;

    const sputterDepth = this.ctx.createGain();
    sputterDepth.gain.value = 0.25;
    sputterLfo.connect(sputterDepth);
    sputterDepth.connect(sparkGain.gain);

    // Resonant metallic hum oscillators (power fifth)
    const humOscA = this.ctx.createOscillator();
    humOscA.type = 'sawtooth';
    humOscA.frequency.value = 210;

    const humOscB = this.ctx.createOscillator();
    humOscB.type = 'triangle';
    humOscB.frequency.value = 315;

    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'bandpass';
    humFilter.frequency.value = 920;
    humFilter.Q.value = 4.2;

    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.34;

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.0;

    sparkSource.connect(sparkFilter);
    sparkFilter.connect(sparkGain);
    sparkGain.connect(masterGain);

    humOscA.connect(humFilter);
    humOscB.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(masterGain);

    masterGain.connect(this.output);
    sparkSource.start();
    humOscA.start();
    humOscB.start();
    sputterLfo.start();

    this.railGrindLoop = {
      sparkSource,
      sparkFilter,
      sparkGain,
      humOscA,
      humOscB,
      humFilter,
      humGain,
      sputterLfo,
      sputterDepth,
      masterGain,
    };
    return this.railGrindLoop;
  }

  // ==========================================================================
  // COMBAT & IMPACT SYNTHS
  // ==========================================================================

  /** Iconic hollow wooden-anvil resonant THWACK + chime! (20x Bonker proc) */
  private synthBonk(t: number, gain: number, pitch: number): void {
    // 1. Hollow wooden-anvil modal body (inharmonic resonant modes)
    const modes: Array<[number, number, number, OscillatorType]> = [
      [340 * pitch, 0.52, 0.21, 'triangle'],
      [536 * pitch, 0.34, 0.17, 'sine'],
      [888 * pitch, 0.22, 0.14, 'triangle'],
    ];
    for (const [freq, amp, dur, type] of modes) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * 1.38, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.022);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + dur);

      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(gain * amp, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

      osc.connect(env);
      env.connect(this.output);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    // 2. Saturated sub-thwack punch
    const sub = this.ctx.createOscillator();
    const shaper = this.createShaper();
    const subEnv = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(175 * pitch, t);
    sub.frequency.exponentialRampToValueAtTime(48, t + 0.095);

    subEnv.gain.setValueAtTime(0.001, t);
    subEnv.gain.linearRampToValueAtTime(gain * 0.62, t + 0.004);
    subEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    sub.connect(shaper);
    shaper.connect(subEnv);
    subEnv.connect(this.output);
    sub.start(t);
    sub.stop(t + 0.14);

    // 3. Sparkling anvil chime ring
    this.playTone(t + 0.008, 'sine', 1318.5 * pitch, 1318.5 * pitch, 0.34, gain * 0.26, 0.004);
    this.playTone(t + 0.014, 'sine', 1975.5 * pitch, 1995 * pitch, 0.3, gain * 0.18, 0.004);

    // 4. Crisp wooden mallet transient click
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 1800 * pitch, 2.5, 0.026, gain * 0.36);
  }

  /** Explosive stacked harmonic zing (4x+ GiantFork Megacrit) */
  private synthMegacrit(t: number, gain: number, pitch: number): void {
    const chord = [587.33, 880.0, 1174.66, 1760.0];
    for (let i = 0; i < chord.length; i++) {
      const f = chord[i] * pitch;
      const start = t + i * 0.012;
      const type: OscillatorType = i % 2 === 0 ? 'sawtooth' : 'square';
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f * 0.85, start);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, start + 0.07);
      osc.frequency.exponentialRampToValueAtTime(f, start + 0.24);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4200, start);
      filter.frequency.exponentialRampToValueAtTime(1400, start + 0.24);

      env.gain.setValueAtTime(0.001, start);
      env.gain.linearRampToValueAtTime(gain * (0.24 - i * 0.03), start + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0008, start + 0.26);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.output);
      osc.start(start);
      osc.stop(start + 0.28);
    }

    // Explosive low punch + bright noise flash
    this.playTone(t, 'sine', 145 * pitch, 44, 0.13, gain * 0.48, 0.003);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'highpass', 2200, 1.0, 0.07, gain * 0.28);
  }

  /** Crisp high-octave snap */
  private synthCrit(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'square', 820 * pitch, 1340 * pitch, 0.085, gain * 0.24, 0.003);
    this.playTone(t, 'triangle', 1640 * pitch, 1960 * pitch, 0.11, gain * 0.22, 0.003);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'highpass', 2600, 1.2, 0.028, gain * 0.22);
  }

  /** Punchy low-mid thud */
  private synthHit(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 215 * pitch, 68 * pitch, 0.072, gain * 0.5, 0.002);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'bandpass', 1200 * pitch, 1.6, 0.032, gain * 0.24);
  }

  /** Lethal guillotine execute slash + sub drop */
  private synthExecute(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'sawtooth', 1480 * pitch, 260 * pitch, 0.14, gain * 0.3, 0.003);
    this.playTone(t + 0.015, 'sine', 180 * pitch, 36, 0.22, gain * 0.56, 0.004);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 3000 * pitch, 2.2, 0.09, gain * 0.32);
  }

  /** Satisfying retro pop (beefier for elites/minibosses) */
  private synthKill(t: number, gain: number, pitch: number, isElite: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = isElite ? 'sawtooth' : 'triangle';
    const base = (isElite ? 220 : 300) * pitch;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 2.15, t + 0.045);
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + (isElite ? 0.19 : 0.1));

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * (isElite ? 0.44 : 0.38), t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0008, t + (isElite ? 0.22 : 0.11));

    osc.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + (isElite ? 0.24 : 0.13));

    if (isElite) {
      this.playTone(t + 0.02, 'sine', 135 * pitch, 42, 0.22, gain * 0.45, 0.004);
      this.playTone(t + 0.05, 'triangle', 880 * pitch, 1320 * pitch, 0.18, gain * 0.22, 0.006);
    } else {
      this.playNoiseBurst(t + 0.01, this.whiteNoiseBuffer, 'bandpass', 2400 * pitch, 2.0, 0.032, gain * 0.16);
    }
  }

  private synthDebuff(t: number, gain: number, pitch: number, debuff?: DebuffType): void {
    switch (debuff) {
      case 'Freeze':
        this.playTone(t, 'sine', 1760 * pitch, 2349 * pitch, 0.11, gain * 0.28, 0.003);
        this.playNoiseBurst(t, this.whiteNoiseBuffer, 'highpass', 4200, 1.4, 0.055, gain * 0.16);
        break;
      case 'Burn':
        this.playNoiseBurst(t, this.pinkNoiseBuffer, 'bandpass', 1500 * pitch, 1.3, 0.11, gain * 0.3);
        break;
      case 'Poison':
        this.playTone(t, 'sine', 320 * pitch, 510 * pitch, 0.09, gain * 0.26, 0.006);
        break;
      case 'Stun':
        this.playTone(t, 'square', 660 * pitch, 440 * pitch, 0.1, gain * 0.22, 0.003);
        break;
      case 'Echo':
        this.playTone(t, 'triangle', 987 * pitch, 1480 * pitch, 0.14, gain * 0.24, 0.005);
        break;
      case 'Charm':
        this.playTone(t, 'sine', 880 * pitch, 1320 * pitch, 0.13, gain * 0.24, 0.008);
        break;
      case 'Bloodmark':
      default:
        this.playTone(t, 'sawtooth', 240 * pitch, 150 * pitch, 0.1, gain * 0.24, 0.004);
        break;
    }
  }

  private synthItemProc(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 920 * pitch, 1380 * pitch, 0.09, gain * 0.22, 0.004);
    this.playTone(t + 0.035, 'sine', 1380 * pitch, 1840 * pitch, 0.09, gain * 0.16, 0.004);
  }

  /** Crunchy alarm thud on player damage */
  private synthPlayerHurt(t: number, gain: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const shaper = this.createShaper();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(235 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(88 * pitch, t + 0.18);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.42, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.21);

    osc.connect(shaper);
    shaper.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.23);

    // Dissonant short warning pulse + heavy sub thud
    this.playTone(t, 'square', 310 * pitch, 170 * pitch, 0.09, gain * 0.24, 0.003);
    this.playTone(t, 'sine', 140 * pitch, 42, 0.16, gain * 0.5, 0.003);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 1400, 0.9, 0.09, gain * 0.3);
  }

  private synthShieldBlock(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 740 * pitch, 1180 * pitch, 0.14, gain * 0.3, 0.003);
    this.playTone(t + 0.018, 'sine', 1480 * pitch, 1660 * pitch, 0.17, gain * 0.22, 0.004);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'highpass', 3200, 1.5, 0.04, gain * 0.2);
  }

  private synthDodge(t: number, gain: number, pitch: number): void {
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 1900 * pitch, 1.4, 0.11, gain * 0.28);
    this.playTone(t, 'sine', 520 * pitch, 980 * pitch, 0.11, gain * 0.24, 0.004);
  }

  private synthPlayerDeath(t: number, gain: number): void {
    const notes = [392.0, 349.23, 311.13, 261.63, 196.0];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.12, 'sawtooth', notes[i], notes[i] * 0.94, 0.22, gain * 0.28, 0.006);
    }
    this.playTone(t, 'sine', 120, 34, 0.65, gain * 0.55, 0.01);
  }

  private synthPlayerRevive(t: number, gain: number): void {
    const notes = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.06, 'triangle', notes[i], notes[i] * 1.01, 0.32, gain * 0.28, 0.006);
    }
  }

  // ==========================================================================
  // DISTINCT WEAPON FAMILY TIMBRES
  // ==========================================================================

  /** Fire whoosh (Firestaff, Flamewalker, DragonsBreath) */
  private synthWeaponFire(t: number, gain: number, pitch: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.3;
    filter.frequency.setValueAtTime(1100 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.16);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.48, t + 0.014);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.output);
    src.start(t);
    src.stop(t + 0.19);

    this.playTone(t, 'sawtooth', 260 * pitch, 105 * pitch, 0.12, gain * 0.2, 0.006);
  }

  /** Hollow dry bone clack (Bone, Bananarang, Dice) */
  private synthWeaponBone(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 680 * pitch, 380 * pitch, 0.055, gain * 0.36, 0.002);
    this.playTone(t + 0.016, 'sine', 1120 * pitch, 860 * pitch, 0.06, gain * 0.24, 0.002);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 2100 * pitch, 4.5, 0.025, gain * 0.28);
  }

  /** Crisp sweeping blade swish (Sword, Katana, Axe, Scythe, etc.) */
  private synthWeaponSword(t: number, gain: number, pitch: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.4;
    filter.frequency.setValueAtTime(2800 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.14);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.45, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.output);
    src.start(t);
    src.stop(t + 0.17);

    this.playTone(t, 'triangle', 1420 * pitch, 720 * pitch, 0.08, gain * 0.16, 0.004);
  }

  /** Warm gothic-synth aura hum pulse (Aura, Aegis, Frostwalker, BlackHole) */
  private synthWeaponAura(t: number, gain: number, pitch: number): void {
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    oscA.type = 'sawtooth';
    oscB.type = 'triangle';
    oscA.frequency.setValueAtTime(110 * pitch, t);
    oscB.frequency.setValueAtTime(220.5 * pitch, t);

    filter.type = 'lowpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(240, t);
    filter.frequency.exponentialRampToValueAtTime(860 * pitch, t + 0.07);
    filter.frequency.exponentialRampToValueAtTime(210, t + 0.21);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.36, t + 0.028);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(env);
    env.connect(this.output);

    oscA.start(t);
    oscB.start(t);
    oscA.stop(t + 0.24);
    oscB.stop(t + 0.24);
  }

  /** Punchy revolver crack (Revolver, Shotgun) */
  private synthWeaponRevolver(t: number, gain: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const shaper = this.createShaper();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.06);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.45, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

    osc.connect(shaper);
    shaper.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.09);

    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 2400 * pitch, 1.1, 0.042, gain * 0.48);
  }

  /** Heavy rock rumble (Chunkers, Mines, Rockets) */
  private synthWeaponRock(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 135 * pitch, 46 * pitch, 0.18, gain * 0.5, 0.006);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 420 * pitch, 1.4, 0.19, gain * 0.46);
  }

  /** Electric lightning zap (LightningBolt, LightningStaff, SpaceNoodle) */
  private synthWeaponLightning(t: number, gain: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2400 * pitch, t);
    osc.frequency.setValueAtTime(980 * pitch, t + 0.018);
    osc.frequency.setValueAtTime(1880 * pitch, t + 0.036);
    osc.frequency.exponentialRampToValueAtTime(340 * pitch, t + 0.15);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.28, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);

    osc.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.19);

    this.playNoiseBurst(t, this.crackleNoiseBuffer, 'highpass', 2600, 1.4, 0.13, gain * 0.34);
  }

  /** Thunderous sniper rail boom (WeaponSniper) */
  private synthWeaponSniper(t: number, gain: number, pitch: number): void {
    const sub = this.ctx.createOscillator();
    const shaper = this.createShaper();
    const env = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(185 * pitch, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.24);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.65, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    sub.connect(shaper);
    shaper.connect(env);
    env.connect(this.output);
    sub.start(t);
    sub.stop(t + 0.3);

    // Electromagnetic rail zing + crack
    this.playTone(t, 'sawtooth', 1950 * pitch, 540 * pitch, 0.22, gain * 0.24, 0.003);
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 1850 * pitch, 0.9, 0.085, gain * 0.5);
  }

  /** Crisp taut bow twang */
  private synthWeaponBow(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'sawtooth', 310 * pitch, 195 * pitch, 0.11, gain * 0.26, 0.003);
    this.playNoiseBurst(t + 0.01, this.whiteNoiseBuffer, 'bandpass', 2600 * pitch, 2.2, 0.075, gain * 0.24);
  }

  private synthWeaponStolen(t: number, gain: number): void {
    this.playTone(t, 'sawtooth', 520, 175, 0.36, gain * 0.34, 0.008);
    this.playTone(t + 0.05, 'square', 370, 130, 0.34, gain * 0.22, 0.008);
  }

  private synthWeaponReclaimed(t: number, gain: number): void {
    const notes = [440, 554.37, 659.25, 880];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.05, 'triangle', notes[i], notes[i] * 1.02, 0.24, gain * 0.28, 0.005);
    }
  }

  // ==========================================================================
  // MOVEMENT SYNTHS
  // ==========================================================================

  /** Rising whoosh-blip scaled cleanly by bunny-hop streak */
  private synthJump(
    t: number,
    gain: number,
    pitch: number,
    bhopStreak: number,
    isAirJump: boolean,
  ): void {
    const streakBoost = bhopStreak > 0 ? Math.pow(1.06, Math.min(10, bhopStreak)) : 1.0;
    const baseFreq = (isAirJump ? 290 : 195) * pitch * streakBoost;
    const endFreq = (isAirJump ? 640 : 450) * pitch * streakBoost;

    this.playTone(t, 'triangle', baseFreq, endFreq, 0.11, gain * 0.38, 0.004);
    if (bhopStreak > 0) {
      // Extra kinetic sparkle chirp on bunny-hop momentum chain
      this.playTone(t + 0.018, 'square', endFreq * 1.15, endFreq * 1.5, 0.085, gain * 0.16, 0.004);
    }
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 1400 * streakBoost, 1.5, 0.075, gain * 0.18);
  }

  private synthLand(t: number, gain: number, pitch: number, intensity: number): void {
    this.playTone(t, 'sine', 120 * pitch, 46, 0.095, gain * 0.42 * intensity, 0.003);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 620, 1.1, 0.07, gain * 0.28 * intensity);
  }

  private synthFallDamage(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'sine', 150 * pitch, 36, 0.2, gain * 0.62, 0.003);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 950, 1.0, 0.15, gain * 0.42);
    this.playTone(t + 0.01, 'sawtooth', 190 * pitch, 75, 0.16, gain * 0.24, 0.004);
  }

  private synthSlideStart(t: number, gain: number, pitch: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(1600 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(480 * pitch, t + 0.14);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.38, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.output);
    src.start(t);
    src.stop(t + 0.18);
  }

  private synthSlideEnd(t: number, gain: number, pitch: number): void {
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'bandpass', 640 * pitch, 1.4, 0.08, gain * 0.24);
  }

  private synthWallClimb(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 195 * pitch, 390 * pitch, 0.095, gain * 0.34, 0.003);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'bandpass', 1100 * pitch, 1.8, 0.075, gain * 0.28);
  }

  private synthRailAttach(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 820 * pitch, 1180 * pitch, 0.08, gain * 0.26, 0.002);
    this.playTone(t, 'square', 410 * pitch, 620 * pitch, 0.065, gain * 0.2, 0.002);
    this.playNoiseBurst(t, this.crackleNoiseBuffer, 'highpass', 2400, 1.5, 0.065, gain * 0.32);
  }

  private synthRailDetach(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 640 * pitch, 1080 * pitch, 0.1, gain * 0.24, 0.003);
    this.playNoiseBurst(t, this.crackleNoiseBuffer, 'highpass', 3000, 1.4, 0.055, gain * 0.22);
  }

  /** Bouncy synth launch */
  private synthJumpPad(t: number, gain: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(590 * pitch, t + 0.085);
    osc.frequency.exponentialRampToValueAtTime(430 * pitch, t + 0.13);
    osc.frequency.exponentialRampToValueAtTime(920 * pitch, t + 0.25);

    filter.type = 'lowpass';
    filter.Q.value = 3.2;
    filter.frequency.setValueAtTime(480, t);
    filter.frequency.exponentialRampToValueAtTime(3600, t + 0.22);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.42, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.3);

    this.playTone(t, 'sine', 160 * pitch, 640 * pitch, 0.22, gain * 0.32, 0.005);
  }

  private synthUnstuck(t: number, gain: number): void {
    this.playTone(t, 'sine', 330, 880, 0.12, gain * 0.28, 0.005);
    this.playTone(t + 0.06, 'triangle', 660, 1320, 0.12, gain * 0.22, 0.005);
  }

  // ==========================================================================
  // PICKUP & PROGRESSION SYNTHS
  // ==========================================================================

  /** Rapidly rising pentatonic chime streak */
  private synthXp(t: number, gain: number, pitch: number, streak: number): void {
    const idx = Math.max(0, Math.min(XP_PENTATONIC_HZ.length - 1, Math.floor(streak)));
    const freq = XP_PENTATONIC_HZ[idx] * pitch;
    this.playTone(t, 'triangle', freq, freq * 1.015, 0.115, gain * 0.36, 0.003);
    this.playTone(t + 0.006, 'sine', freq * 2.0, freq * 2.01, 0.075, gain * 0.14, 0.003);
  }

  private synthGold(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'square', 987.77 * pitch, 987.77 * pitch, 0.06, gain * 0.22, 0.003);
    this.playTone(t + 0.052, 'triangle', 1318.51 * pitch, 1318.51 * pitch, 0.14, gain * 0.32, 0.003);
  }

  private synthSilver(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 1174.66 * pitch, 1174.66 * pitch, 0.075, gain * 0.26, 0.003);
    this.playTone(t + 0.055, 'sine', 1760.0 * pitch, 1760.0 * pitch, 0.18, gain * 0.3, 0.003);
  }

  private synthHeal(t: number, gain: number, pitch: number): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.048, 'sine', notes[i] * pitch, notes[i] * pitch, 0.19, gain * 0.24, 0.006);
    }
  }

  private synthPowerup(t: number, gain: number, pitch: number): void {
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.042, 'square', notes[i] * pitch, notes[i] * pitch * 1.02, 0.16, gain * 0.19, 0.004);
    }
  }

  /** Heroic chiptune arpeggio + sustained triumphant chord */
  private synthLevelUp(t: number, gain: number): void {
    const arp = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66];
    for (let i = 0; i < arp.length; i++) {
      const start = t + i * 0.052;
      this.playTone(start, 'square', arp[i], arp[i], 0.14, gain * 0.2, 0.004);
      this.playTone(start, 'triangle', arp[i] * 0.5, arp[i] * 0.5, 0.16, gain * 0.16, 0.004);
    }
    const chordStart = t + arp.length * 0.052;
    const chord = [587.33, 739.99, 880.0, 1174.66];
    for (const f of chord) {
      this.playTone(chordStart, 'triangle', f, f * 1.005, 0.42, gain * 0.18, 0.01);
    }
  }

  // ==========================================================================
  // WORLD, SHRINES, CHESTS & BOSS SYNTHS
  // ==========================================================================

  private synthShrineCharge(t: number, gain: number, pitch: number, step: number): void {
    const progress = Math.max(0, Math.min(1, step / 10));
    const freq = (260 + progress * 520) * pitch;
    this.playTone(t, 'triangle', freq, freq * 1.08, 0.12, gain * 0.26, 0.006);
    this.playTone(t, 'sine', freq * 1.5, freq * 1.56, 0.1, gain * 0.14, 0.006);
  }

  /** Sparkling major fanfare for shrine completion */
  private synthShrineComplete(t: number, gain: number): void {
    const notes = [349.23, 440.0, 523.25, 659.25, 698.46, 880.0, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      const start = t + i * 0.058;
      this.playTone(start, 'triangle', notes[i], notes[i], 0.26, gain * 0.24, 0.005);
      this.playTone(start + 0.01, 'sine', notes[i] * 2.0, notes[i] * 2.0, 0.2, gain * 0.11, 0.005);
    }
  }

  /** Sparkling major chest-open fanfare with latch pop */
  private synthChestOpen(t: number, gain: number): void {
    // Latch click
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 2200, 2.2, 0.03, gain * 0.3);
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98];
    for (let i = 0; i < notes.length; i++) {
      const start = t + 0.03 + i * 0.055;
      this.playTone(start, 'square', notes[i], notes[i], 0.18, gain * 0.16, 0.004);
      this.playTone(start, 'triangle', notes[i] * 0.5, notes[i] * 0.5, 0.26, gain * 0.18, 0.006);
    }
  }

  private synthPotBreak(t: number, gain: number, pitch: number): void {
    this.playNoiseBurst(t, this.whiteNoiseBuffer, 'bandpass', 2500 * pitch, 1.3, 0.095, gain * 0.38);
    this.playTone(t, 'triangle', 940 * pitch, 420 * pitch, 0.06, gain * 0.25, 0.002);
    this.playTone(t + 0.024, 'triangle', 1320 * pitch, 780 * pitch, 0.055, gain * 0.18, 0.002);
  }

  private synthPylonCharged(t: number, gain: number, pitch: number): void {
    const notes = [440, 659.25, 880, 1318.51];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.065, 'triangle', notes[i] * pitch, notes[i] * pitch, 0.32, gain * 0.26, 0.006);
    }
  }

  private synthPortalActivated(t: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(740, t + 0.48);

    filter.type = 'bandpass';
    filter.Q.value = 3.0;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2800, t + 0.45);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.36, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.62);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.65);

    this.playTone(t + 0.12, 'sine', 587.33, 1174.66, 0.48, gain * 0.24, 0.04);
  }

  private synthEliteSpawn(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'sawtooth', 146.83 * pitch, 110 * pitch, 0.34, gain * 0.28, 0.02);
    this.playTone(t + 0.04, 'triangle', 220 * pitch, 164.81 * pitch, 0.32, gain * 0.24, 0.02);
  }

  /** Ominous gothic brass & sub-bass swell (Stage Boss / Lil Bark horn) */
  private synthBossSpawn(t: number, gain: number): void {
    const brassFreqs = [73.42, 110.0, 146.83, 155.56]; // D2, A2, D3, Eb3 gothic tension
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.6;
    filter.frequency.setValueAtTime(150, t);
    filter.frequency.exponentialRampToValueAtTime(1250, t + 0.42);
    filter.frequency.exponentialRampToValueAtTime(280, t + 1.32);

    const shaper = this.createShaper();
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.46, t + 0.22);
    env.gain.setValueAtTime(gain * 0.42, t + 0.72);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 1.38);

    filter.connect(shaper);
    shaper.connect(env);
    env.connect(this.output);

    for (let i = 0; i < brassFreqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(brassFreqs[i] * (i === 3 ? 1.003 : 0.997), t);
      osc.frequency.linearRampToValueAtTime(brassFreqs[i], t + 0.35);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 1.42);
    }

    // Deep sub-bass quake
    this.playTone(t, 'sine', 55, 36.71, 1.3, gain * 0.52, 0.08);
    // Breath/war-horn air roar
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'bandpass', 420, 1.2, 0.9, gain * 0.26);
  }

  private synthBossDefeated(t: number, gain: number): void {
    this.playTone(t, 'sine', 160, 34, 0.45, gain * 0.58, 0.004);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 900, 1.0, 0.38, gain * 0.4);
    const cadence = [293.66, 369.99, 440.0, 587.33, 880.0];
    for (let i = 0; i < cadence.length; i++) {
      this.playTone(t + 0.16 + i * 0.08, 'triangle', cadence[i], cadence[i], 0.48, gain * 0.24, 0.01);
    }
  }

  private synthFinalSwarm(t: number, gain: number): void {
    // Tritone gothic dread horn (D2 + Ab2 + D3)
    const freqs = [73.42, 103.83, 146.83, 207.65];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3.0;
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.32);
    filter.frequency.exponentialRampToValueAtTime(360, t + 1.25);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.46, t + 0.14);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);

    filter.connect(env);
    env.connect(this.output);

    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 1.34);
    }
    this.playTone(t, 'sine', 65, 36.71, 1.2, gain * 0.5, 0.04);
  }

  // ==========================================================================
  // UI SYNTHS
  // ==========================================================================

  private synthUiMove(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'triangle', 540 * pitch, 680 * pitch, 0.045, gain * 0.34, 0.002);
  }

  private synthUiConfirm(t: number, gain: number): void {
    this.playTone(t, 'square', 587.33, 587.33, 0.055, gain * 0.2, 0.003);
    this.playTone(t + 0.045, 'triangle', 880.0, 880.0, 0.095, gain * 0.3, 0.003);
  }

  private synthUiCancel(t: number, gain: number): void {
    this.playTone(t, 'triangle', 440, 293.66, 0.095, gain * 0.28, 0.003);
  }

  private synthUiReroll(t: number, gain: number, pitch: number): void {
    const notes = [440, 587.33, 523.25, 783.99];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(t + i * 0.042, 'triangle', notes[i] * pitch, notes[i] * pitch, 0.075, gain * 0.26, 0.003);
    }
  }

  private synthUiBanish(t: number, gain: number, pitch: number): void {
    this.playTone(t, 'sawtooth', 420 * pitch, 140 * pitch, 0.18, gain * 0.28, 0.004);
    this.playNoiseBurst(t, this.pinkNoiseBuffer, 'lowpass', 900, 1.2, 0.14, gain * 0.24);
  }

  // ==========================================================================
  // LOW-LEVEL PRIMITIVES & BUFFER GENERATORS
  // ==========================================================================

  private playTone(
    startTime: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    durationSec: number,
    peakGain: number,
    attackSec: number,
  ): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const safeStart = Math.max(20, Math.min(18000, startFreq));
    const safeEnd = Math.max(20, Math.min(18000, endFreq));

    osc.type = type;
    osc.frequency.setValueAtTime(safeStart, startTime);
    if (Math.abs(safeEnd - safeStart) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(safeEnd, startTime + durationSec);
    }

    const safeDur = Math.max(0.015, durationSec);
    const safeAttack = Math.min(attackSec, safeDur * 0.45);
    env.gain.setValueAtTime(0.0008, startTime);
    env.gain.linearRampToValueAtTime(Math.max(0.001, peakGain), startTime + safeAttack);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + safeDur);

    osc.connect(env);
    env.connect(this.output);
    osc.start(startTime);
    osc.stop(startTime + safeDur + 0.015);
  }

  private playNoiseBurst(
    startTime: number,
    buffer: AudioBuffer,
    filterType: BiquadFilterType,
    frequency: number,
    q: number,
    durationSec: number,
    peakGain: number,
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(40, Math.min(16000, frequency)), startTime);
    filter.Q.setValueAtTime(q, startTime);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0008, startTime);
    env.gain.linearRampToValueAtTime(Math.max(0.001, peakGain), startTime + Math.min(0.006, durationSec * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + durationSec);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.output);

    const maxOffset = Math.max(0, buffer.duration - durationSec - 0.05);
    const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;
    src.start(startTime, offset, durationSec + 0.02);
  }

  private createShaper(): WaveShaperNode {
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.softClipCurve;
    shaper.oversample = 'none';
    return shaper;
  }

  private computePitchJitter(ratio: number): number {
    return 1.0 + (Math.random() * 2.0 - 1.0) * ratio;
  }

  private createWhiteNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1024, Math.floor(sampleRate * durationSec));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createPinkNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1024, Math.floor(sampleRate * durationSec));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private createCrackleNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1024, Math.floor(sampleRate * durationSec));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const r = Math.random();
      // Sparse sharp metallic spark impulses over light hiss bed
      const hiss = (Math.random() * 2 - 1) * 0.28;
      const spark = r > 0.988 ? (Math.random() * 2 - 1) * 0.95 : 0;
      data[i] = Math.max(-1, Math.min(1, hiss + spark));
    }
    return buffer;
  }

  private createSoftClipCurve(samples: number, drive: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }
}
