/**
 * KRUNKEDBONK — Procedural Step-Sequencer Soundtrack Engine (Wave 2 — Full 19-Track OST)
 *
 * Intro -> Seamless Loop retro-arcade & gothic-synth Web Audio tracks
 * (strict 16th-note grid: every bar has exact 16 tokens across all voices):
 * - title:          104 BPM moody gothic synthwave title theme
 * - forest_1:       138 BPM Green Forest upbeat arcade groove
 * - forest_2:       142 BPM Deep Forest twilight synth
 * - forest_3:       150 BPM Cursed Forest crimson drive
 * - forest_boss:    156 BPM Ent Boss (Lil Bark) gothic battle anthem
 * - desert_1:       134 BPM Crusty Desert Phrygian dune groove
 * - desert_2:       140 BPM Twilight Desert nocturnal oasis synth
 * - desert_3:       152 BPM Scorched Desert blazing dunes
 * - desert_boss:    158 BPM Pharaoh Anubis battle
 * - graveyard:      128 BPM Haunted Maze gothic organ + chiptune bass
 * - graveyard_boss: 162 BPM Big Bob spectral cathedral frenzy
 * - final_boss:     168 BPM Final Boss Arena dramatic multi-layer colosseum anthem
 * - final_swarm:    174 BPM Spooky Steve panic overdrive
 * - calcium:        164 BPM Calcium skate-punk chiptune (Boombox bonus)
 * - megachad:       132 BPM Megachad heroic synth-brawn (Boombox bonus)
 * - dicy:           146 BPM Dicehead funky jazz-chip (Boombox bonus)
 * - space:          126 BPM Spaceman cosmic sci-fi arpeggios (Boombox bonus)
 * - victory:        136 BPM triumphant non-looping stinger
 * - game_over:       96 BPM gothic descending non-looping stinger
 */

import { MUSIC_TRACK_MANIFEST, type MusicTrackId } from './soundManifest';

// ============================================================================
// 1. NOTE PARSER & TRACK DATA STRUCTURES
// ============================================================================

export interface StepNote {
  /** Frequency in Hz */
  readonly freq: number;
  /** Duration in 16th-note steps */
  readonly lengthSteps: number;
  /** Velocity multiplier (0..1) */
  readonly velocity: number;
}

/**
 * Drum hits:
 * - K: kick, S: snare, H: closed hat, O: open hat, T: tom
 * - X: kick + hat, B: kick + snare
 * - C: crash cymbal + kick, R: rimshot / hand-perc, G: gothic bell / gong
 */
export type DrumHit = 'K' | 'S' | 'H' | 'O' | 'T' | 'X' | 'B' | 'C' | 'R' | 'G' | null;

export interface TrackSection {
  readonly steps: number;
  readonly lead: readonly (StepNote | null)[];
  readonly harmony: readonly (StepNote | null)[];
  readonly bass: readonly (StepNote | null)[];
  readonly drums: readonly DrumHit[];
  /** Optional 4th melodic/chordal counter-layer (gothic organ, colosseum brass, space pads) */
  readonly counter?: readonly (StepNote | null)[];
}

export interface TrackVoiceConfig {
  readonly leadWave: OscillatorType;
  readonly leadGain: number;
  readonly leadCutoffHz: number;
  readonly harmonyWave: OscillatorType;
  readonly harmonyGain: number;
  readonly harmonyCutoffHz: number;
  readonly bassWave: OscillatorType;
  readonly bassGain: number;
  readonly bassCutoffHz: number;
  readonly drumGain: number;
  readonly counterWave?: OscillatorType;
  readonly counterGain?: number;
  readonly counterCutoffHz?: number;
  /** Optional detune spread in cents for lush synth/organ/brass unison thickness */
  readonly leadDetuneCents?: number;
  /** Optional 16th-note swing factor (0..0.28) applied on odd 16th subdivisions */
  readonly swing?: number;
}

export interface ProceduralTrackDef {
  readonly id: MusicTrackId;
  readonly bpm: number;
  readonly looping: boolean;
  readonly gain: number;
  readonly voices: TrackVoiceConfig;
  readonly intro: TrackSection | null;
  readonly loop: TrackSection;
}

const NOTE_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

export function noteToFreq(noteName: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(noteName);
  if (!match) return 440;
  const semi = NOTE_SEMITONES[match[1]];
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parses whitespace-separated 16th-note tokens (1 token per 16th-note step):
 *  - `-` or `.` => rest / sustain continuation
 *  - `D4`       => 1-step note at default velocity
 *  - `D4:2`     => 2-step sustained note
 *  - `D4:2!0.7` => 2-step note at 0.7 velocity
 */
function parseNotes(pattern: string, expectedSteps: number): (StepNote | null)[] {
  const tokens = pattern.trim().split(/\s+/).filter(Boolean);
  const out: (StepNote | null)[] = new Array<StepNote | null>(expectedSteps).fill(null);
  const count = Math.min(tokens.length, expectedSteps);
  for (let i = 0; i < count; i++) {
    const raw = tokens[i];
    if (raw === '-' || raw === '.') continue;
    const [noteAndLen, velStr] = raw.split('!');
    const [noteName, lenStr] = noteAndLen.split(':');
    const lengthSteps = lenStr ? Math.max(1, Number(lenStr) || 1) : 1;
    const velocity = velStr ? Math.max(0.1, Math.min(1.0, Number(velStr) || 1)) : 1.0;
    out[i] = {
      freq: noteToFreq(noteName),
      lengthSteps,
      velocity,
    };
  }
  return out;
}

function parseDrums(pattern: string, expectedSteps: number): DrumHit[] {
  const tokens = pattern.trim().split(/\s+/).filter(Boolean);
  const out: DrumHit[] = new Array<DrumHit>(expectedSteps).fill(null);
  const count = Math.min(tokens.length, expectedSteps);
  for (let i = 0; i < count; i++) {
    const ch = tokens[i];
    if (
      ch === 'K' ||
      ch === 'S' ||
      ch === 'H' ||
      ch === 'O' ||
      ch === 'T' ||
      ch === 'X' ||
      ch === 'B' ||
      ch === 'C' ||
      ch === 'R' ||
      ch === 'G'
    ) {
      out[i] = ch;
    }
  }
  return out;
}

function buildSection(
  steps: number,
  lead: string,
  harmony: string,
  bass: string,
  drums: string,
  counter?: string,
): TrackSection {
  return {
    steps,
    lead: parseNotes(lead, steps),
    harmony: parseNotes(harmony, steps),
    bass: parseNotes(bass, steps),
    drums: parseDrums(drums, steps),
    counter: counter ? parseNotes(counter, steps) : undefined,
  };
}

// ============================================================================
// 2. FULL 19-TRACK OST DEFINITIONS (INTRO -> SEAMLESS LOOP)
// ============================================================================

// --- 1. TITLE (104 BPM Gothic Synthwave) ---
const TRACK_TITLE: ProceduralTrackDef = {
  id: 'title',
  bpm: MUSIC_TRACK_MANIFEST.title.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.title.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 2100,
    leadDetuneCents: 7,
    harmonyWave: 'triangle',
    harmonyGain: 0.13,
    harmonyCutoffHz: 1700,
    bassWave: 'sawtooth',
    bassGain: 0.24,
    bassCutoffHz: 620,
    drumGain: 0.26,
  },
  intro: buildSection(
    32,
    `D5:4 - - - F5:4 - - - E5:4 - - - A4:4 - - -
     Bb4:4 - - - A4:4 - - - C#5:6 - - - - - - -`,
    `D4:2 - A4:2 - F4:2 - A4:2 - D4:2 - A4:2 - F4:2 - A4:2 -
     C#4:2 - A4:2 - E4:2 - A4:2 - C#4:2 - E4:2 - A4:2 - C#5:2 -`,
    `D2:4 - - - D2:2 - D2:2 - D2:4 - - - D2:2 - C2:2 -
     A1:4 - - - A1:2 - A1:2 - A1:4 - - - C#2:4 - - -`,
    `G . H . . . H . K . H . T . T .
     K . H . . . H . K . S . T . S S`,
  ),
  loop: buildSection(
    128,
    `D5:4 - - - A4:2 - F5:2 - E5:4 - - - D5:2 - C5:2 -
     D5:6 - - - - - Bb4:2 - F5:4 - - - D5:4 - - -
     G5:4 - - - F5:2 - E5:2 - D5:4 - - - Bb4:2 - G4:2 -
     A4:6 - - - - - C#5:2 - E5:4 - - - A4:4 - - -
     F5:4 - - - E5:2 - D5:2 - A5:4 - - - F5:2 - D5:2 -
     G5:4 - - - E5:2 - C5:2 - G5:4 - - - E5:4 - - -
     F5:4 - - - D5:2 - Bb4:2 - D5:4 - - - F5:2 - G5:2 -
     E5:6 - - - - - C#5:2 - A4:6 - - - - - - -`,
    `D4 F4 A4 D5 D4 F4 A4 D5 D4 F4 A4 D5 A4 F4 D4 A3
     Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 F4 D4 Bb3 F3
     G3 Bb3 D4 G4 G3 Bb3 D4 G4 G3 Bb3 D4 G4 D4 Bb3 G3 D3
     A3 C#4 E4 A4 A3 C#4 E4 A4 A3 C#4 E4 A4 E4 C#4 A3 E3
     D4 F4 A4 D5 D4 F4 A4 D5 D4 F4 A4 D5 A4 F4 D4 A3
     C4 E4 G4 C5 C4 E4 G4 C5 C4 E4 G4 C5 G4 E4 C4 G3
     Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 F4 D4 Bb3 F3
     A3 C#4 E4 A4 A3 C#4 E4 A4 A3 C#4 E4 A4 G4 E4 C#4 A3`,
    `D2 - D2 - D2 - D3 - D2 - D2 - C2 - D2 -
     Bb1 - Bb1 - Bb1 - Bb2 - Bb1 - Bb1 - A1 - Bb1 -
     G1 - G1 - G1 - G2 - G1 - G1 - F1 - G1 -
     A1 - A1 - A1 - A2 - A1 - C#2 - E2 - A1 -
     D2 - D2 - D2 - D3 - D2 - D2 - C2 - D2 -
     C2 - C2 - C2 - C3 - C2 - C2 - Bb1 - C2 -
     Bb1 - Bb1 - Bb1 - Bb2 - Bb1 - Bb1 - A1 - Bb1 -
     A1 - A1 - A1 - A2 - A1 - A1 - C#2 - E2 -`,
    `X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . H .
     X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S T T S
     C . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . H .
     X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . S S`,
  ),
};

// --- 2. FOREST_1 (138 BPM Green Forest Upbeat Arcade) ---
const TRACK_FOREST_1: ProceduralTrackDef = {
  id: 'forest_1',
  bpm: MUSIC_TRACK_MANIFEST.forest_1.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_1.gain,
  voices: {
    leadWave: 'square',
    leadGain: 0.14,
    leadCutoffHz: 2800,
    harmonyWave: 'square',
    harmonyGain: 0.085,
    harmonyCutoffHz: 2000,
    bassWave: 'triangle',
    bassGain: 0.28,
    bassCutoffHz: 950,
    drumGain: 0.28,
  },
  intro: buildSection(
    32,
    `D5:2 - F5:2 - G5:2 - A5:2 - G5:2 - F5:2 - D5:2 - F5:2 -
     C5:2 - E5:2 - G5:2 - A5:6 - - - - - A4:2 - C5:2 -`,
    `D4:2 - F4:2 - G4:2 - A4:2 - G4:2 - F4:2 - D4:2 - F4:2 -
     C4:2 - E4:2 - G4:2 - E4:6 - - - - - E4:2 - G4:2 -`,
    `D2 - D3 - D2 - D3 - D2 - F2 - G2 - A2 -
     C2 - C3 - C2 - C3 - A1 - A2 - C2 - C#2 -`,
    `X . H . S . H . X . H . S . H O
     X . H . S . H . S . S . T S S S`,
  ),
  loop: buildSection(
    128,
    `D5:2 - F5:2 - A5:2 - G5:2 - F5:2 - D5:2 - C5:2 - D5:2 -
     E5:2 - G5:2 - C6:2 - B5:2 - G5:2 - E5:2 - D5:2 - C5:2 -
     D5:2 - F5:2 - Bb5:2 - A5:2 - G5:2 - F5:2 - D5:2 - F5:2 -
     G5:4 - - - E5:2 - G5:2 - A5:4 - - - G5:2 - E5:2 -
     D5:2 - A5:2 - G5:2 - F5:2 - D5:2 - F5:2 - G5:2 - A5:2 -
     C6:2 - A5:2 - F5:2 - A5:2 - C6:2 - D6:2 - C6:2 - A5:2 -
     B5:2 - G5:2 - D5:2 - G5:2 - B5:2 - D6:2 - B5:2 - G5:2 -
     A5:4 - - - G5:2 - E5:2 - C#5:2 - E5:2 - A5:4 - - -`,
    `A4 - D4 F4 A4 - F4 D4 A4 - D4 F4 A4 F4 D4 F4
     G4 - C4 E4 G4 - E4 C4 G4 - C4 E4 G4 E4 C4 E4
     F4 - Bb3 D4 F4 - D4 Bb3 F4 - Bb3 D4 F4 D4 Bb3 D4
     G4 - C4 E4 G4 - E4 C4 E4 - G4 C5 E4 G4 C5 G4
     A4 - D4 F4 A4 - F4 D4 A4 - D4 F4 A4 F4 D4 F4
     A4 - C4 F4 A4 - F4 C4 A4 - C4 F4 A4 F4 C4 F4
     G4 - B3 D4 G4 - D4 B3 G4 - B3 D4 G4 D4 B3 D4
     E4 - A3 C#4 E4 - C#4 A3 E4 - A3 C#4 E4 A4 C#5 A4`,
    `D2 - D3 D2 F2 - G2 - A2 - D3 D2 C2 - A1 -
     C2 - C3 C2 E2 - G2 - C3 - G2 E2 C2 - G1 -
     Bb1 - Bb2 Bb1 D2 - F2 - Bb2 - F2 D2 Bb1 - F1 -
     C2 - C3 C2 E2 - G2 - C3 - G2 E2 C2 - C#2 -
     D2 - D3 D2 F2 - G2 - A2 - D3 A2 F2 - D2 -
     F2 - F3 F2 A2 - C3 - F3 - C3 A2 F2 - C2 -
     G2 - G3 G2 B2 - D3 - G3 - D3 B2 G2 - D2 -
     A1 - A2 A1 C#2 - E2 - A2 - E2 C#2 A1 - C#2 -`,
    `C H H H S H H H X H K H S H H O
     X H H H S H H H X H K H S H K H
     X H H H S H H H X H K H S H H O
     X H H H S H H K X H K H S T S S
     C H H H S H H H X H K H S H H O
     X H H H S H H H X H K H S H K H
     X H H H S H H H X H K H S H H O
     X H K H S H K H X K S K S T S S`,
  ),
};

// --- 3. FOREST_2 (142 BPM Deep Forest Twilight Synth) ---
const TRACK_FOREST_2: ProceduralTrackDef = {
  id: 'forest_2',
  bpm: MUSIC_TRACK_MANIFEST.forest_2.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_2.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.15,
    leadCutoffHz: 2300,
    leadDetuneCents: 9,
    harmonyWave: 'triangle',
    harmonyGain: 0.12,
    harmonyCutoffHz: 1950,
    bassWave: 'sawtooth',
    bassGain: 0.24,
    bassCutoffHz: 720,
    drumGain: 0.27,
    counterWave: 'sine',
    counterGain: 0.09,
    counterCutoffHz: 2600,
  },
  intro: buildSection(
    32,
    `G5:4 - - - Bb5:2 - A5:2 - G5:4 - - - D5:4 - - -
     Eb5:4 - - - F5:2 - G5:2 - F#5:4 - - - D5:4 - - -`,
    `G4 Bb4 D5 G5 G4 Bb4 D5 G5 F4 A4 C5 F5 F4 A4 C5 F5
     Eb4 G4 Bb4 Eb5 Eb4 G4 Bb4 Eb5 D4 F#4 A4 D5 D4 F#4 A4 D5`,
    `G1 - G2 - G1 - G2 - F1 - F2 - F1 - F2 -
     Eb1 - Eb2 - Eb1 - Eb2 - D1 - D2 - D1 - F#1 -`,
    `X . H . S . H . X . H . S . H O
     X . H . S . H . T . T . S T S S`,
  ),
  loop: buildSection(
    64,
    `G5:2 - Bb5:2 - D6:2 - C6:2 - Bb5:2 - A5:2 - G5:2 - F5:2 -
     Eb5:2 - G5:2 - Bb5:2 - A5:2 - G5:2 - F5:2 - Eb5:2 - D5:2 -
     C5:2 - Eb5:2 - G5:2 - Bb5:2 - A5:2 - G5:2 - F5:2 - Eb5:2 -
     D5:4 - - - F#5:2 - A5:2 - D6:4 - - - C6:2 - A5:2 -`,
    `G3 Bb3 D4 G4 Bb4 G4 D4 Bb3 G3 Bb3 D4 G4 Bb4 A4 G4 D4
     Eb3 G3 Bb3 Eb4 G4 Eb4 Bb3 G3 Eb3 G3 Bb3 Eb4 F4 Eb4 Bb3 G3
     C3 Eb3 G3 C4 Eb4 C4 G3 Eb3 C3 Eb3 G3 C4 F4 Eb4 C4 G3
     D3 F#3 A3 D4 F#4 D4 A3 F#3 D3 F#3 A3 D4 A4 F#4 D4 A3`,
    `G1 G2 - G1 Bb1 - D2 - G1 G2 - G1 F1 - G1 -
     Eb1 Eb2 - Eb1 G1 - Bb1 - Eb1 Eb2 - Eb1 D1 - Eb1 -
     C1 C2 - C1 Eb1 - G1 - C1 C2 - C1 Bb1 - A1 -
     D1 D2 - D1 F#1 - A1 - D1 D2 - D1 C2 - A1 -`,
    `C H H H S H H O X H K H S H H H
     X H H H S H H O X H K H S H K H
     X H H H S H H O X H K H S H H H
     X H K H S H K H X K T T S T S S`,
    `D5:8 - - - - - - - F5:8 - - - - - - -
     Bb4:8 - - - - - - - G4:8 - - - - - - -
     G4:8 - - - - - - - C5:8 - - - - - - -
     A4:8 - - - - - - - F#4:8 - - - - - - -`,
  ),
};

// --- 4. FOREST_3 (150 BPM Cursed Forest Crimson Drive) ---
const TRACK_FOREST_3: ProceduralTrackDef = {
  id: 'forest_3',
  bpm: MUSIC_TRACK_MANIFEST.forest_3.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_3.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3100,
    leadDetuneCents: 6,
    harmonyWave: 'square',
    harmonyGain: 0.095,
    harmonyCutoffHz: 2400,
    bassWave: 'sawtooth',
    bassGain: 0.26,
    bassCutoffHz: 860,
    drumGain: 0.3,
  },
  intro: buildSection(
    32,
    `C5:2 - Eb5:2 - G5:2 - F#5:2 - G5:2 - Eb5:2 - C5:2 - B4:2 -
     C5:2 - G5:2 - Ab5:2 - G5:2 - F5:2 - Eb5:2 - D5:2 - B4:2 -`,
    `C4 G4 Eb4 G4 C4 G4 F#4 G4 C4 G4 Eb4 G4 B3 G4 D4 G4
     C4 G4 Ab4 G4 F4 G4 Eb4 G4 D4 G4 B3 G4 D4 G4 B4 G4`,
    `C2 C2 C3 C2 C2 C2 C3 C2 C2 C2 Eb2 C2 B1 B1 G1 B1
     C2 C2 C3 C2 Ab1 Ab1 Ab2 Ab1 F1 F1 F2 F1 G1 G1 G2 G1`,
    `X K H K S H K H X K H K S H K O
     X K H K S K S K T T T T S S S S`,
  ),
  loop: buildSection(
    64,
    `C5:2 - C5 D5 Eb5:2 - G5:2 - F#5:2 - G5:2 - C6:2 - Bb5:2 -
     Ab5:2 - Ab5 G5 F5:2 - Eb5:2 - D5:2 - F5:2 - Ab5:2 - G5:2 -
     Eb5:2 - G5:2 - C6:2 - Bb5:2 - Ab5:2 - G5:2 - F5:2 - Eb5:2 -
     D5:2 - F5:2 - B5:2 - G5:2 - F5:2 - D5:2 - B4:2 - G4:2 -`,
    `C4 G4 Eb4 G4 C4 G4 Eb4 G4 C4 G4 F#4 G4 Eb4 G4 C4 G4
     Ab3 Eb4 C4 Eb4 Ab3 Eb4 C4 Eb4 F3 C4 Ab3 C4 F3 C4 Ab3 C4
     Eb3 Bb3 G3 Bb3 Eb3 Bb3 G3 Bb3 C4 G4 Eb4 G4 C4 G4 Eb4 G4
     G3 D4 B3 D4 G3 D4 B3 D4 G3 D4 F4 D4 B3 D4 G3 D4`,
    `C2 C3 C2 C2 C3 C2 Eb2 C2 C2 C3 C2 C2 Bb1 C2 G1 Bb1
     Ab1 Ab2 Ab1 Ab1 Ab2 Ab1 C2 Ab1 F1 F2 F1 F1 F2 F1 G1 Ab1
     Eb1 Eb2 Eb1 Eb1 Eb2 Eb1 G1 Eb1 C2 C3 C2 C2 Bb1 C2 G1 F1
     G1 G2 G1 G1 G2 G1 B1 G1 G1 G2 F2 D2 B1 G1 B1 D2`,
    `C K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     X K K K S K K K B K S K T S S S`,
  ),
};

// --- 5. FOREST_BOSS (156 BPM Ent Boss — Lil Bark) ---
const TRACK_FOREST_BOSS: ProceduralTrackDef = {
  id: 'forest_boss',
  bpm: MUSIC_TRACK_MANIFEST.forest_boss.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_boss.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3200,
    leadDetuneCents: 6,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2200,
    bassWave: 'sawtooth',
    bassGain: 0.27,
    bassCutoffHz: 850,
    drumGain: 0.31,
  },
  intro: buildSection(
    32,
    `E5:4 - - - F5:2 - E5:2 - D#5:4 - - - B4:4 - - -
     E5:2 - G5:2 - B5:2 - A5:2 - G5:2 - F5:2 - E5:2 - D#5:2 -`,
    `E4:4 - - - F4:2 - E4:2 - B3:4 - - - F#4:4 - - -
     E4:2 - G4:2 - B4:2 - A4:2 - G4:2 - F4:2 - D#4:2 - B3:2 -`,
    `E2 E2 - E2 F2 F2 - F2 D#2 D#2 - D#2 B1 B1 - B1
     E2 E2 G2 G2 B2 B2 A2 A2 G2 G2 F2 F2 B1 B1 B1 B1`,
    `G . K . B . K . X . K . B . K .
     X K X K S K S K T T S S B K S S`,
  ),
  loop: buildSection(
    128,
    `E5:2 - E5 F5 G5:2 - E5:2 - B5:2 - A5:2 - G5:2 - F5:2 -
     F5:2 - F5 G5 A5:2 - F5:2 - C6:2 - B5:2 - A5:2 - G5:2 -
     D5:2 - F5:2 - A5:2 - G5:2 - F5:2 - E5:2 - D5:2 - C5:2 -
     B4:2 - D#5:2 - F#5:2 - B5:4 - - - A5:2 - F#5:2 - D#5:2 -
     E5:2 - B5:2 - A5:2 - G5:2 - E5:2 - G5:2 - A5:2 - B5:2 -
     G5:2 - D6:2 - C6:2 - B5:2 - G5:2 - B5:2 - C6:2 - D6:2 -
     F5:2 - C6:2 - B5:2 - A5:2 - F5:2 - A5:2 - G5:2 - F5:2 -
     D#5:2 - F#5:2 - B5:2 - D#6:4 - - - B5:2 - F#5:2 - D#5:2 -`,
    `E4 B4 E4 B4 F4 C5 E4 B4 E4 B4 G4 B4 E4 B4 F4 B4
     F4 C5 F4 C5 G4 C5 F4 C5 F4 C5 A4 C5 F4 C5 G4 C5
     D4 A4 D4 A4 F4 A4 D4 A4 D4 A4 E4 A4 D4 A4 C4 A4
     B3 F#4 D#4 F#4 B3 F#4 D#4 F#4 B3 F#4 A4 F#4 D#4 F#4 B3 F#4
     E4 B4 G4 B4 E4 B4 G4 B4 E4 B4 A4 B4 G4 B4 E4 B4
     G4 D5 B4 D5 G4 D5 B4 D5 G4 D5 C5 D5 B4 D5 G4 D5
     F4 C5 A4 C5 F4 C5 A4 C5 F4 C5 G4 C5 A4 C5 F4 C5
     B3 F#4 D#4 F#4 B3 F#4 D#4 F#4 B3 D#4 F#4 B4 A4 F#4 D#4 B3`,
    `E2 E2 - E2 E3 E2 - E2 E2 E2 G2 E2 F2 - E2 -
     F2 F2 - F2 F3 F2 - F2 F2 F2 A2 F2 G2 - F2 -
     D2 D2 - D2 D3 D2 - D2 D2 D2 F2 D2 C2 - D2 -
     B1 B1 - B1 B2 B1 - B1 B1 B1 D#2 F#2 B2 - F#2 -
     E2 E2 - E2 E3 E2 - E2 E2 E2 G2 E2 B2 - G2 -
     G2 G2 - G2 G3 G2 - G2 G2 G2 B2 G2 D3 - B2 -
     F2 F2 - F2 F3 F2 - F2 F2 F2 A2 F2 C3 - A2 -
     B1 B1 - B1 B2 B1 - B1 B1 D#2 F#2 B2 A2 F#2 D#2 B1`,
    `C K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     X K H K S H K K X K S K T T S S
     C K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     X K K K S K K K B K S K T S S S`,
  ),
};

// --- 6. DESERT_1 (134 BPM Crusty Desert Phrygian Dune Groove) ---
const TRACK_DESERT_1: ProceduralTrackDef = {
  id: 'desert_1',
  bpm: MUSIC_TRACK_MANIFEST.desert_1.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.desert_1.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.15,
    leadCutoffHz: 2600,
    harmonyWave: 'triangle',
    harmonyGain: 0.12,
    harmonyCutoffHz: 2200,
    bassWave: 'triangle',
    bassGain: 0.28,
    bassCutoffHz: 820,
    drumGain: 0.28,
    swing: 0.11,
  },
  intro: buildSection(
    32,
    `D5:3 - - Eb5 F#5:2 - G5:2 - A5:4 - - - F#5:2 - Eb5:2 -
     D5:2 - F#5:2 - A5:2 - Bb5:2 - A5:4 - - - G5:2 - F#5:2 -`,
    `D4 A4 D4 A4 Eb4 Bb4 Eb4 Bb4 D4 A4 F#4 A4 D4 A4 F#4 A4
     D4 A4 D4 A4 G4 Bb4 G4 Bb4 A4 F#4 Eb4 F#4 D4 F#4 A4 F#4`,
    `D2 - A2 - D2 - Eb2 - D2 - A2 - D2 - C2 -
     D2 - A2 - G2 - F#2 - Eb2 - D2 - A1 - D2 -`,
    `K . R . T . R H K . R . T R H O
     K . R . S . R H K R T R S T S R`,
  ),
  loop: buildSection(
    64,
    `D5:2 - Eb5:2 - F#5:2 - G5:2 - A5:3 - - Bb5 A5:2 - G5:2 -
     F#5:2 - G5:2 - A5:2 - Bb5:2 - C6:2 - Bb5:2 - A5:2 - G5:2 -
     F#5:2 - Eb5:2 - D5:2 - F#5:2 - G5:2 - A5:2 - Bb5:2 - A5:2 -
     G5:2 - F#5:2 - Eb5:2 - D5:2 - C5:2 - Eb5:2 - D5:4 - - -`,
    `D4 F#4 A4 D5 D4 F#4 A4 D5 Eb4 G4 Bb4 Eb5 D4 F#4 A4 D5
     D4 F#4 A4 D5 G4 Bb4 D5 G5 C4 Eb4 G4 C5 D4 F#4 A4 D5
     Eb4 G4 Bb4 Eb5 D4 F#4 A4 D5 G4 Bb4 D5 G5 A4 C5 Eb5 A5
     G4 Bb4 D5 G5 F#4 A4 D5 F#5 Eb4 G4 Bb4 Eb5 D4 F#4 A4 D5`,
    `D2 - D3 D2 A2 - D2 - Eb2 - Eb3 Eb2 Bb2 - Eb2 -
     D2 - D3 D2 F#2 - A2 - G2 - G3 G2 D2 - G2 -
     Eb2 - Eb3 Eb2 G2 - Bb2 - D2 - D3 D2 A2 - F#2 -
     G2 - F#2 - Eb2 - D2 - C2 - A1 - D2 - A1 -`,
    `C H R H S H R O K H R K S R T H
     X H R H S H R O K H R K S H R R
     X H R H S H R O K H R K S R T H
     X H R K S R T K B R S R T S R S`,
  ),
};

// --- 7. DESERT_2 (140 BPM Twilight Desert Nocturnal Oasis Synth) ---
const TRACK_DESERT_2: ProceduralTrackDef = {
  id: 'desert_2',
  bpm: MUSIC_TRACK_MANIFEST.desert_2.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.desert_2.gain,
  voices: {
    leadWave: 'triangle',
    leadGain: 0.17,
    leadCutoffHz: 2500,
    leadDetuneCents: 10,
    harmonyWave: 'square',
    harmonyGain: 0.08,
    harmonyCutoffHz: 2100,
    bassWave: 'sawtooth',
    bassGain: 0.24,
    bassCutoffHz: 680,
    drumGain: 0.27,
    counterWave: 'sine',
    counterGain: 0.1,
    counterCutoffHz: 3000,
  },
  intro: buildSection(
    32,
    `A5:4 - - - Bb5:2 - A5:2 - G5:4 - - - F5:4 - - -
     E5:4 - - - G5:2 - F5:2 - E5:6 - - - - - - -`,
    `A4 E5 C5 E5 Bb4 F5 D5 F5 G4 D5 Bb4 D5 F4 C5 A4 C5
     E4 B4 G#4 B4 E4 B4 G#4 B4 E4 B4 D5 B4 G#4 B4 E4 B4`,
    `A1 - A2 - Bb1 - Bb2 - G1 - G2 - F1 - F2 -
     E1 - E2 - E1 - E2 - E1 - G#1 - B1 - E2 -`,
    `X . H R S . H . X . H R S . H O
     X . H R S . H . T . R . S T S R`,
  ),
  loop: buildSection(
    64,
    `A5:2 - Bb5:2 - C6:2 - Bb5:2 - A5:2 - G5:2 - F5:2 - E5:2 -
     F5:2 - G5:2 - A5:2 - Bb5:2 - A5:2 - G5:2 - F5:2 - D5:2 -
     E5:2 - G#5:2 - B5:2 - C6:2 - B5:2 - A5:2 - G#5:2 - E5:2 -
     A5:4 - - - G5:2 - F5:2 - E5:4 - - - D5:2 - C5:2 -`,
    `A3 E4 A4 C5 E5 C5 A4 E4 Bb3 F4 Bb4 D5 F5 D5 Bb4 F4
     F3 C4 F4 A4 C5 A4 F4 C4 G3 D4 G4 Bb4 D5 Bb4 G4 D4
     E3 B3 E4 G#4 B4 G#4 E4 B3 E3 B3 E4 G#4 D5 B4 G#4 E4
     A3 E4 A4 C5 E5 C5 A4 E4 G3 D4 G4 B4 E4 B4 G#4 E4`,
    `A1 - A2 A1 E2 - A1 - Bb1 - Bb2 Bb1 F2 - Bb1 -
     F1 - F2 F1 C2 - F1 - G1 - G2 G1 D2 - G1 -
     E1 - E2 E1 G#1 - B1 - E1 - E2 E1 D2 - B1 -
     A1 - A2 A1 G1 - F1 - E1 - E2 E1 G#1 - B1 -`,
    `C H R H S H H O X H R K S H H H
     X H R H S H H O X H R K S H R H
     X H R H S H H O X H R K S H H H
     X H K H S H R K X K T R S T S S`,
    `E5:8 - - - - - - - F5:8 - - - - - - -
     C5:8 - - - - - - - D5:8 - - - - - - -
     B4:8 - - - - - - - G#4:8 - - - - - - -
     C5:8 - - - - - - - B4:8 - - - - - - -`,
  ),
};

// --- 8. DESERT_3 (152 BPM Scorched Desert Blazing Dunes) ---
const TRACK_DESERT_3: ProceduralTrackDef = {
  id: 'desert_3',
  bpm: MUSIC_TRACK_MANIFEST.desert_3.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.desert_3.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3300,
    leadDetuneCents: 6,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2500,
    bassWave: 'sawtooth',
    bassGain: 0.27,
    bassCutoffHz: 880,
    drumGain: 0.3,
  },
  intro: buildSection(
    32,
    `E5:2 - F5:2 - G#5:2 - A5:2 - B5:2 - A5:2 - G#5:2 - F5:2 -
     E5:2 - G#5:2 - B5:2 - C6:2 - B5:4 - - - G#5:2 - F5:2 -`,
    `E4 B4 F4 B4 G#4 B4 A4 B4 E4 B4 A4 B4 G#4 B4 F4 B4
     E4 B4 G#4 B4 B4 E5 C5 E5 B4 E5 G#4 E5 F4 B4 E4 B4`,
    `E2 E2 E3 E2 F2 F2 F3 F2 E2 E2 G#2 E2 F2 F2 E2 D2
     E2 E2 E3 E2 C2 C2 C3 C2 B1 B1 B2 B1 B1 B1 B1 B1`,
    `X K R K S H K K X K R K S H K O
     X K R K S K S K T T S S B K S S`,
  ),
  loop: buildSection(
    64,
    `E5:2 - E5 F5 G#5:2 - B5:2 - C6:2 - B5:2 - A5:2 - G#5:2 -
     F5:2 - F5 G#5 A5:2 - C6:2 - D6:2 - C6:2 - B5:2 - A5:2 -
     G#5:2 - B5:2 - E6:2 - D6:2 - C6:2 - B5:2 - A5:2 - G#5:2 -
     F5:2 - G#5:2 - B5:2 - A5:2 - G#5:2 - F5:2 - E5:4 - - -`,
    `E4 B4 G#4 B4 F4 C5 A4 C5 E4 B4 G#4 B4 E4 B4 F4 B4
     F4 C5 A4 C5 G#4 D5 B4 D5 A4 E5 C5 E5 F4 C5 A4 C5
     E4 B4 G#4 B4 E4 B4 G#4 B4 C4 G4 E4 G4 B3 F#4 D#4 F#4
     F4 C5 A4 C5 E4 B4 G#4 B4 F4 C5 A4 C5 E4 B4 G#4 B4`,
    `E2 E3 E2 E2 F2 F3 F2 F2 E2 E3 E2 E2 G#2 E2 F2 E2
     F2 F3 F2 F2 G#2 F2 A2 F2 C3 C2 A2 F2 D2 F2 C2 A1
     E2 E3 E2 E2 G#2 E2 B2 E2 C2 C3 C2 C2 B1 B2 B1 B1
     F2 F3 F2 F2 E2 E3 E2 E2 F2 F2 G#2 F2 E2 E2 B1 E2`,
    `C K R K S H K K X K R K S H K O
     X K R K S H K K X K R K S K S H
     X K R K S H K K X K R K S H K O
     X K K K S K K K B K S K T S S S`,
  ),
};

// --- 9. DESERT_BOSS (158 BPM Pharaoh Anubis Battle) ---
const TRACK_DESERT_BOSS: ProceduralTrackDef = {
  id: 'desert_boss',
  bpm: MUSIC_TRACK_MANIFEST.desert_boss.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.desert_boss.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3400,
    leadDetuneCents: 9,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2400,
    bassWave: 'sawtooth',
    bassGain: 0.28,
    bassCutoffHz: 880,
    drumGain: 0.32,
    counterWave: 'sawtooth',
    counterGain: 0.09,
    counterCutoffHz: 1800,
  },
  intro: buildSection(
    32,
    `F#5:4 - - - G5:2 - F#5:2 - A#5:4 - - - C#6:4 - - -
     D6:2 - C#6:2 - B5:2 - A#5:2 - G5:2 - F#5:2 - G5:2 - C#6:2 -`,
    `F#4:4 - - - G4:2 - F#4:2 - C#4:4 - - - F#4:4 - - -
     G4:2 - F#4:2 - E4:2 - D4:2 - C#4:2 - D4:2 - E4:2 - F#4:2 -`,
    `F#1 F#1 - F#1 G1 G1 - G1 F#1 F#1 - F#1 C#2 C#2 - C#2
     D2 D2 C#2 C#2 B1 B1 A#1 A#1 G1 G1 F#1 F#1 C#2 C#2 C#2 C#2`,
    `G . K . B . K . G . K . B . K .
     X K X K S K S K T T S S B K S S`,
  ),
  loop: buildSection(
    64,
    `F#5:2 - F#5 G5 A#5:2 - C#6:2 - D6:2 - C#6:2 - B5:2 - A#5:2 -
     G5:2 - G5 A#5 B5:2 - D6:2 - E6:2 - D6:2 - C#6:2 - B5:2 -
     A#5:2 - C#6:2 - F#6:2 - E6:2 - D6:2 - C#6:2 - B5:2 - A#5:2 -
     G5:2 - A#5:2 - C#6:2 - G5:2 - F#5:2 - E5:2 - F#5:4 - - -`,
    `F#4 C#5 A#4 C#5 G4 D5 B4 D5 F#4 C#5 A#4 C#5 F#4 C#5 G4 C#5
     G4 D5 B4 D5 A#4 E5 C#5 E5 B4 F#5 D5 F#5 G4 D5 B4 D5
     F#4 C#5 A#4 C#5 F#4 C#5 A#4 C#5 D4 A4 F#4 A4 C#4 G#4 F4 G#4
     G4 D5 B4 D5 F#4 C#5 A#4 C#5 G4 D5 B4 D5 C#4 G#4 F#4 C#5`,
    `F#1 F#1 F#2 F#1 G1 G1 G2 G1 F#1 F#1 A#1 F#1 C#2 F#1 G1 F#1
     G1 G1 G2 G1 B1 G1 D2 G1 E2 D2 C#2 B1 G1 G1 F#1 G1
     F#1 F#1 F#2 F#1 A#1 F#1 C#2 F#1 D2 D2 D1 D2 C#2 C#2 C#1 C#2
     G1 G1 G2 G1 F#1 F#1 F#2 F#1 G1 G1 A#1 G1 F#1 F#1 C#2 F#1`,
    `C K R K S H K K X K R K S H K O
     X K R K S H K K X K R K S K S H
     G K R K S H K K X K R K S H K O
     X K K K S K K K B K S K T S S S`,
    `F#4:4 - - - G4:4 - - - F#4:4 - - - A#4:4 - - -
     G4:4 - - - B4:4 - - - D5:4 - - - C#5:4 - - -
     A#4:4 - - - C#5:4 - - - D5:4 - - - C#5:4 - - -
     G4:4 - - - F#4:4 - - - G4:4 - - - F#4:4 - - -`,
  ),
};

// --- 10. GRAVEYARD (128 BPM Haunted Maze Gothic Organ + Chiptune Bass) ---
const TRACK_GRAVEYARD: ProceduralTrackDef = {
  id: 'graveyard',
  bpm: MUSIC_TRACK_MANIFEST.graveyard.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.graveyard.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.15,
    leadCutoffHz: 2400,
    leadDetuneCents: 11,
    harmonyWave: 'square',
    harmonyGain: 0.085,
    harmonyCutoffHz: 2200,
    bassWave: 'square',
    bassGain: 0.22,
    bassCutoffHz: 740,
    drumGain: 0.25,
    counterWave: 'triangle',
    counterGain: 0.13,
    counterCutoffHz: 1600,
  },
  intro: buildSection(
    32,
    `C5:2 - B4:2 - C5:2 - G4:2 - Ab4:2 - G4:2 - F4:2 - Eb4:2 -
     D4:2 - F4:2 - Ab4:2 - B4:2 - C5:4 - - - G4:4 - - -`,
    `C4:4 - - - G3:4 - - - Ab3:4 - - - Eb3:4 - - -
     F3:4 - - - Ab3:4 - - - G3:4 - - - B3:4 - - -`,
    `C2 - C3 - G1 - G2 - Ab1 - Ab2 - Eb1 - Eb2 -
     F1 - F2 - Ab1 - F1 - G1 - G2 - B1 - G1 -`,
    `G . H . . . H . K . H . T . H .
     G . H . S . H . T . T . S T S .`,
  ),
  loop: buildSection(
    64,
    `C5:2 - Eb5:2 - G5:2 - F#5:2 - G5:2 - C6:2 - B5:2 - G5:2 -
     Ab5:2 - G5:2 - F5:2 - Eb5:2 - D5:2 - F5:2 - Ab5:2 - G5:2 -
     F5:2 - Eb5:2 - D5:2 - C5:2 - B4:2 - D5:2 - G5:2 - F5:2 -
     Eb5:2 - D5:2 - C5:2 - B4:2 - C5:4 - - - G4:2 - B4:2 -`,
    `C4 Eb4 G4 C5 G4 Eb4 C4 G3 C4 Eb4 G4 C5 B4 G4 Eb4 C4
     Ab3 C4 Eb4 Ab4 Eb4 C4 Ab3 Eb3 F3 Ab3 C4 F4 C4 Ab3 F3 C3
     F3 Ab3 D4 F4 D4 Ab3 F3 D3 G3 B3 D4 G4 D4 B3 G3 D3
     C4 Eb4 G4 C5 G4 Eb4 C4 G3 G3 B3 D4 G4 B4 G4 D4 B3`,
    `C2 - C3 C2 Eb2 - G2 - C2 - C3 C2 B1 - G1 -
     Ab1 - Ab2 Ab1 C2 - Eb2 - F1 - F2 F1 Ab1 - C2 -
     D2 - D3 D2 F2 - Ab2 - G1 - G2 G1 B1 - D2 -
     C2 - G1 - Ab1 - F1 - G1 - G2 G1 B1 - D2 -`,
    `G H H H S H H O X H K H S H H H
     X H H H S H H O X H K H S H T H
     G H H H S H H O X H K H S H H H
     X H K H S H K H X K T T S . S S`,
    `C4:8 - - - - - - - Eb4:8 - - - - - - -
     Ab3:8 - - - - - - - F3:8 - - - - - - -
     D4:8 - - - - - - - B3:8 - - - - - - -
     C4:8 - - - - - - - B3:8 - - - - - - -`,
  ),
};

// --- 11. GRAVEYARD_BOSS (162 BPM Big Bob Spectral Cathedral Frenzy) ---
const TRACK_GRAVEYARD_BOSS: ProceduralTrackDef = {
  id: 'graveyard_boss',
  bpm: MUSIC_TRACK_MANIFEST.graveyard_boss.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.graveyard_boss.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3500,
    leadDetuneCents: 11,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2600,
    bassWave: 'sawtooth',
    bassGain: 0.28,
    bassCutoffHz: 900,
    drumGain: 0.32,
    counterWave: 'triangle',
    counterGain: 0.13,
    counterCutoffHz: 2000,
  },
  intro: buildSection(
    32,
    `B5:2 - A#5:2 - B5:2 - F#5:2 - G5:2 - F#5:2 - E5:2 - D5:2 -
     C#5:2 - E5:2 - G5:2 - A#5:2 - B5:2 - C#6:2 - D6:2 - A#5:2 -`,
    `B4 F#5 D5 F#5 B4 F#5 D5 F#5 G4 D5 B4 D5 E4 B4 G4 B4
     F#4 C#5 A#4 C#5 F#4 C#5 A#4 C#5 F#4 A#4 C#5 F#5 E5 C#5 A#4 F#4`,
    `B1 B1 B2 B1 B1 B1 A#1 B1 G1 G1 G2 G1 E1 E1 E2 E1
     F#1 F#1 F#2 F#1 F#1 F#1 A#1 F#1 F#1 F#1 C#2 F#1 F#1 F#1 F#1 F#1`,
    `G K H K B H K K G K H K B H K O
     X K X K S K S K T T T T B K S S`,
  ),
  loop: buildSection(
    64,
    `B5 C#6 D6:2 - F#6:2 - E6:2 - D6:2 - C#6:2 - B5:2 - A#5:2 -
     G5 A5 B5:2 - D6:2 - C#6:2 - B5:2 - A5:2 - G5:2 - F#5:2 -
     E5:2 - G5:2 - B5:2 - D6:2 - C#6:2 - B5:2 - A#5:2 - G5:2 -
     F#5:2 - A#5:2 - C#6:2 - F#6:2 - E6:2 - C#6:2 - A#5:2 - F#5:2 -`,
    `B4 F#5 D5 F#5 B4 F#5 D5 F#5 B4 F#5 E5 F#5 D5 F#5 B4 F#5
     G4 D5 B4 D5 G4 D5 B4 D5 G4 D5 C#5 D5 B4 D5 G4 D5
     E4 B4 G4 B4 E4 B4 G4 B4 C#4 G4 E4 G4 C#4 G4 E4 G4
     F#4 C#5 A#4 C#5 F#4 C#5 A#4 C#5 F#4 C#5 E5 C#5 A#4 C#5 F#4 C#5`,
    `B1 B2 B1 B1 B2 B1 D2 B1 B1 B2 B1 B1 A#1 B1 F#1 A#1
     G1 G2 G1 G1 G2 G1 B1 G1 G1 G2 G1 G1 F#1 G1 D1 F#1
     E1 E2 E1 E1 E2 E1 G1 E1 C#2 C#3 C#2 C#2 B1 C#2 G1 E1
     F#1 F#2 F#1 F#1 F#2 F#1 A#1 F#1 F#1 F#2 E2 C#2 A#1 F#1 A#1 C#2`,
    `C K H K S H K K X K H K S H K O
     G K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     G K K K S K K K B K S K T S S S`,
    `B4:4 - - - D5:4 - - - F#5:4 - - - D5:4 - - -
     G4:4 - - - B4:4 - - - D5:4 - - - B4:4 - - -
     E4:4 - - - G4:4 - - - C#5:4 - - - A#4:4 - - -
     F#4:4 - - - A#4:4 - - - C#5:4 - - - A#4:4 - - -`,
  ),
};

// --- 12. FINAL_BOSS (168 BPM Final Boss Arena Multi-Layer Colosseum Anthem) ---
const TRACK_FINAL_BOSS: ProceduralTrackDef = {
  id: 'final_boss',
  bpm: MUSIC_TRACK_MANIFEST.final_boss.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.final_boss.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3600,
    leadDetuneCents: 10,
    harmonyWave: 'square',
    harmonyGain: 0.095,
    harmonyCutoffHz: 2600,
    bassWave: 'sawtooth',
    bassGain: 0.28,
    bassCutoffHz: 920,
    drumGain: 0.33,
    counterWave: 'sawtooth',
    counterGain: 0.11,
    counterCutoffHz: 1900,
  },
  intro: buildSection(
    32,
    `D5:4 - - - F5:2 - G5:2 - A5:4 - - - Bb5:4 - - -
     A5:2 - G5:2 - F5:2 - E5:2 - D5:2 - F5:2 - A5:2 - C#6:2 -`,
    `D4 A4 F4 A4 D4 A4 F4 A4 Bb3 F4 D4 F4 Bb3 F4 D4 F4
     G3 D4 Bb3 D4 G3 D4 Bb3 D4 A3 E4 C#4 E4 A3 C#4 E4 A4`,
    `D2 D2 D3 D2 D2 D2 C2 D2 Bb1 Bb1 Bb2 Bb1 Bb1 Bb1 A1 Bb1
     G1 G1 G2 G1 G1 G1 F1 G1 A1 A1 A2 A1 A1 C#2 E2 A2`,
    `G K H K B H K K G K H K B H K O
     C K X K S K S K T T S S B K S S`,
    `D4:8 - - - - - - - Bb3:8 - - - - - - -
     G3:8 - - - - - - - A3:8 - - - - - - -`,
  ),
  loop: buildSection(
    128,
    `D6:2 - D6 C6 Bb5:2 - A5:2 - G5:2 - A5:2 - F5:2 - D5:2 -
     Bb5:2 - Bb5 A5 G5:2 - F5:2 - E5:2 - F5:2 - D5:2 - Bb4:2 -
     G5:2 - Bb5:2 - D6:2 - C6:2 - Bb5:2 - A5:2 - G5:2 - F5:2 -
     E5:2 - A5:2 - C#6:2 - E6:4 - - - C#6:2 - A5:2 - G5:2 -
     F5:2 - A5:2 - D6:2 - E6:2 - F6:2 - E6:2 - D6:2 - C6:2 -
     Bb5:2 - D6:2 - F6:2 - E6:2 - D6:2 - C6:2 - Bb5:2 - A5:2 -
     G5:2 - Bb5:2 - D6:2 - F6:2 - E6:2 - D6:2 - C#6:2 - Bb5:2 -
     A5:2 - C#6:2 - E6:2 - A6:4 - - - E6:2 - C#6:2 - A5:2 -`,
    `D4 A4 F4 A4 D4 A4 F4 A4 D4 A4 G4 A4 F4 A4 D4 A4
     Bb3 F4 D4 F4 Bb3 F4 D4 F4 Bb3 F4 E4 F4 D4 F4 Bb3 F4
     G3 D4 Bb3 D4 G3 D4 Bb3 D4 G3 D4 C4 D4 Bb3 D4 G3 D4
     A3 E4 C#4 E4 A3 E4 C#4 E4 A3 E4 G4 E4 C#4 E4 A3 E4
     D4 A4 F4 A4 D4 A4 F4 A4 F4 C5 A4 C5 F4 C5 A4 C5
     Bb3 F4 D4 F4 Bb3 F4 D4 F4 C4 G4 E4 G4 C4 G4 E4 G4
     G3 D4 Bb3 D4 G3 D4 Bb3 D4 Bb3 F4 D4 F4 G3 D4 Bb3 D4
     A3 E4 C#4 E4 A3 E4 C#4 E4 A3 C#4 E4 A4 G4 E4 C#4 A3`,
    `D2 D2 D3 D2 D2 D2 F2 D2 D2 D2 A2 D2 C2 D2 A1 C2
     Bb1 Bb1 Bb2 Bb1 Bb1 Bb1 D2 Bb1 Bb1 Bb1 F2 Bb1 A1 Bb1 F1 A1
     G1 G1 G2 G1 G1 G1 Bb1 G1 G1 G1 D2 G1 F1 G1 D1 F1
     A1 A1 A2 A1 A1 A1 C#2 A1 A1 A1 E2 A1 G1 A1 E1 C#2
     D2 D2 D3 D2 D2 D2 F2 D2 F2 F2 F3 F2 F2 F2 C2 F2
     Bb1 Bb1 Bb2 Bb1 Bb1 Bb1 D2 Bb1 C2 C2 C3 C2 C2 C2 G1 C2
     G1 G1 G2 G1 G1 G1 Bb1 G1 Bb1 Bb1 Bb2 Bb1 G1 G1 D2 G1
     A1 A1 A2 A1 A1 C#2 E2 A2 G2 E2 C#2 A1 A1 C#2 E2 A1`,
    `C K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     G K H K S H K K X K H K S H K O
     X K H K S H K K X K S K T T S S
     C K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     G K H K S H K K X K H K S H K O
     X K K K S K K K B K S K T S S S`,
    `D5:4 - - - F5:4 - - - A5:4 - - - F5:4 - - -
     Bb4:4 - - - D5:4 - - - F5:4 - - - D5:4 - - -
     G4:4 - - - Bb4:4 - - - D5:4 - - - Bb4:4 - - -
     A4:4 - - - C#5:4 - - - E5:4 - - - C#5:4 - - -
     F5:4 - - - A5:4 - - - C6:4 - - - A5:4 - - -
     Bb4:4 - - - D5:4 - - - G5:4 - - - E5:4 - - -
     G4:4 - - - Bb4:4 - - - D5:4 - - - Bb4:4 - - -
     A4:4 - - - C#5:4 - - - E5:4 - - - C#5:4 - - -`,
  ),
};

// --- 13. FINAL_SWARM (174 BPM Spooky Steve Panic Overdrive) ---
const TRACK_FINAL_SWARM: ProceduralTrackDef = {
  id: 'final_swarm',
  bpm: MUSIC_TRACK_MANIFEST.final_swarm.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.final_swarm.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3600,
    leadDetuneCents: 8,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2600,
    bassWave: 'sawtooth',
    bassGain: 0.28,
    bassCutoffHz: 920,
    drumGain: 0.33,
    counterWave: 'square',
    counterGain: 0.08,
    counterCutoffHz: 2900,
  },
  intro: buildSection(
    16,
    `C#6:2 - G5:2 - C#6:2 - G5:2 - C#6:2 - G5:2 - F#5:2 - G5:2 -`,
    `C#5:2 - G4:2 - C#5:2 - G4:2 - C#5:2 - G4:2 - F#4:2 - G4:2 -`,
    `C#2 C#2 G1 G1 C#2 C#2 G1 G1 C#2 C#2 D2 D2 G#1 G#1 G#1 G#1`,
    `G K S K X K S K T T T T S S S S`,
  ),
  loop: buildSection(
    64,
    `C#6:2 - B5 A5 G#5:2 - E5:2 - C#5:2 - G#5:2 - G5:2 - F#5:2 -
     D6:2 - C6 A5 F5:2 - D5:2 - A5:2 - G#5:2 - G5:2 - F5:2 -
     G#5:2 - C6:2 - D#6:2 - C6:2 - G#5:2 - F#5:2 - E5:2 - D#5:2 -
     C#5:2 - G5:2 - C#6:2 - G5:2 - B5:2 - G#5:2 - F#5:2 - E5:2 -`,
    `C#5 G#4 E4 G#4 C#5 G#4 G4 G#4 C#5 G#4 E4 G#4 C#5 G#4 E4 G#4
     D5 A4 F4 A4 D5 A4 G#4 A4 D5 A4 F4 A4 D5 A4 F4 A4
     G#4 D#5 C5 D#5 G#4 D#5 C5 D#5 G#4 D#5 C5 D#5 G#4 D#5 C5 D#5
     C#5 G4 E4 G4 C#5 G4 E4 G4 B4 G#4 E4 G#4 G#4 D#4 C4 D#4`,
    `C#2 C#3 C#2 C#3 C#2 C#3 G1 G2 C#2 C#3 C#2 C#3 B1 B2 G#1 G#2
     D2 D3 D2 D3 D2 D3 A1 A2 D2 D3 D2 D3 C2 C3 A1 A2
     G#1 G#2 G#1 G#2 G#1 G#2 D#2 D#3 G#1 G#2 G#1 G#2 F#1 F#2 D#1 D#2
     C#2 C#3 G1 G2 C#2 C#3 G1 G2 B1 B2 G#1 G#2 G#1 G#2 G#1 G#2`,
    `C K S K X K S O X K S K X K S K
     X K S K X K S O X K S K T S S K
     G K S K X K S O X K S K X K S K
     X K S K X K S K B K S K T S S S`,
    `G5 - C#6 - G5 - C#6 - G5 - C#6 - G5 - C#6 -
     G#5 - D6 - G#5 - D6 - G#5 - D6 - G#5 - D6 -
     D#5 - C6 - D#5 - C6 - D#5 - C6 - D#5 - C6 -
     G5 - C#6 - G5 - C#6 - B5 - G#5 - F#5 - E5 -`,
  ),
};

// --- 14. CALCIUM (164 BPM Skate-Punk Chiptune — Boombox Bonus) ---
const TRACK_CALCIUM: ProceduralTrackDef = {
  id: 'calcium',
  bpm: MUSIC_TRACK_MANIFEST.calcium.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.calcium.gain,
  voices: {
    leadWave: 'square',
    leadGain: 0.15,
    leadCutoffHz: 3400,
    leadDetuneCents: 5,
    harmonyWave: 'sawtooth',
    harmonyGain: 0.095,
    harmonyCutoffHz: 2400,
    bassWave: 'triangle',
    bassGain: 0.29,
    bassCutoffHz: 1050,
    drumGain: 0.31,
  },
  intro: buildSection(
    16,
    `A5:2 - A5 B5 C#6:2 - A5:2 - E5:2 - F#5:2 - G#5:2 - B5:2 -`,
    `A4:2 - A4:2 - E4:2 - A4:2 - E4:2 - B4:2 - G#4:2 - E4:2 -`,
    `A2 A2 A2 A2 A2 A2 E2 E2 E2 E2 E2 E2 E2 F#2 G#2 B2`,
    `R . R . R . R . X K S K T S S S`,
  ),
  loop: buildSection(
    64,
    `A5:2 - C#6:2 - E6:2 - C#6:2 - B5:2 - A5:2 - G#5:2 - A5:2 -
     B5:2 - G#5:2 - E5:2 - G#5:2 - B5:2 - C#6:2 - B5:2 - G#5:2 -
     F#5:2 - A5:2 - C#6:2 - A5:2 - B5:2 - A5:2 - F#5:2 - E5:2 -
     D5:2 - F#5:2 - A5:2 - B5:2 - C#6:2 - B5:2 - A5:2 - G#5:2 -`,
    `A4 E4 A4 E4 A4 E4 A4 E4 A4 E4 C#5 E4 A4 E4 A4 E4
     E4 B3 E4 B3 E4 B3 E4 B3 E4 B3 G#4 B3 E4 B3 E4 B3
     F#4 C#4 F#4 C#4 F#4 C#4 F#4 C#4 F#4 C#4 A4 C#4 F#4 C#4 F#4 C#4
     D4 A3 D4 A3 D4 A3 D4 A3 E4 B3 E4 B3 G#4 B3 E4 B3`,
    `A2 A2 A2 A2 A2 A2 E2 A2 A2 A2 C#3 A2 A2 A2 G#2 F#2
     E2 E2 E2 E2 E2 E2 B1 E2 E2 E2 G#2 E2 E2 E2 F#2 G#2
     F#2 F#2 F#2 F#2 F#2 F#2 C#2 F#2 F#2 F#2 A2 F#2 F#2 F#2 E2 D2
     D2 D2 D2 D2 D2 D2 A1 D2 E2 E2 E2 E2 E2 F#2 G#2 B2`,
    `C H S K K H S H X H S K K H S O
     X H S K K H S H X H S K K H S H
     C H S K K H S H X H S K K H S O
     X H S K K H S K B K S K T S S S`,
  ),
};

// --- 15. MEGACHAD (132 BPM Heroic Synth-Brawn — Boombox Bonus) ---
const TRACK_MEGACHAD: ProceduralTrackDef = {
  id: 'megachad',
  bpm: MUSIC_TRACK_MANIFEST.megachad.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.megachad.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 2700,
    leadDetuneCents: 12,
    harmonyWave: 'sawtooth',
    harmonyGain: 0.1,
    harmonyCutoffHz: 1850,
    bassWave: 'sawtooth',
    bassGain: 0.27,
    bassCutoffHz: 700,
    drumGain: 0.3,
    counterWave: 'triangle',
    counterGain: 0.13,
    counterCutoffHz: 2200,
  },
  intro: buildSection(
    32,
    `F5:4 - - - G5:2 - A5:2 - C6:6 - - - - - A5:2 -
     Bb5:4 - - - A5:2 - G5:2 - C6:8 - - - - - - -`,
    `F4:4 - - - C4:4 - - - F4:4 - - - A4:4 - - -
     Bb4:4 - - - D4:4 - - - C4:8 - - - - - - -`,
    `F2 - F2 - F2 - F3 - F2 - F2 - E2 - F2 -
     Bb1 - Bb1 - Bb1 - Bb2 - C2 - C2 - C3 - C2 -`,
    `C . H . S . H . X . K . S . H O
     X . H . S . H . T . T . S T S S`,
  ),
  loop: buildSection(
    64,
    `F5:3 - - G5 A5:2 - C6:2 - D6:4 - - - C6:2 - A5:2 -
     G5:3 - - A5 G5:2 - E5:2 - C5:4 - - - E5:2 - G5:2 -
     A5:3 - - Bb5 A5:2 - F5:2 - D5:4 - - - F5:2 - A5:2 -
     Bb5:2 - A5:2 - G5:2 - F5:2 - G5:4 - - - C6:4 - - -`,
    `F4 A4 C5 F5 F4 A4 C5 F5 F4 A4 C5 F5 C5 A4 F4 C4
     C4 E4 G4 C5 C4 E4 G4 C5 C4 E4 G4 C5 G4 E4 C4 G3
     D4 F4 A4 D5 D4 F4 A4 D5 D4 F4 A4 D5 A4 F4 D4 A3
     Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 C4 E4 G4 C5 G4 E4 C4 G3`,
    `F2 F2 F3 F2 F2 F2 E2 F2 F2 F2 F3 F2 E2 F2 C2 E2
     C2 C2 C3 C2 C2 C2 G1 C2 C2 C2 C3 C2 G1 C2 D2 E2
     D2 D2 D3 D2 D2 D2 A1 D2 D2 D2 D3 D2 C2 D2 A1 C2
     Bb1 Bb1 Bb2 Bb1 Bb1 Bb1 A1 Bb1 C2 C2 C3 C2 C2 D2 E2 G2`,
    `C . H . S . H . X . K . S . H O
     X . H . S . H . X . K . S . H .
     X . H . S . H . X . K . S . H O
     X . H . S . H . B . T . S T S S`,
    `A4:8 - - - - - - - C5:8 - - - - - - -
     G4:8 - - - - - - - E4:8 - - - - - - -
     F4:8 - - - - - - - A4:8 - - - - - - -
     D5:8 - - - - - - - C5:8 - - - - - - -`,
  ),
};

// --- 16. DICY (146 BPM Funky Jazz-Chip — Boombox Bonus) ---
const TRACK_DICY: ProceduralTrackDef = {
  id: 'dicy',
  bpm: MUSIC_TRACK_MANIFEST.dicy.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.dicy.gain,
  voices: {
    leadWave: 'square',
    leadGain: 0.14,
    leadCutoffHz: 2900,
    harmonyWave: 'triangle',
    harmonyGain: 0.12,
    harmonyCutoffHz: 2400,
    bassWave: 'triangle',
    bassGain: 0.29,
    bassCutoffHz: 1100,
    drumGain: 0.28,
    counterWave: 'square',
    counterGain: 0.08,
    counterCutoffHz: 2200,
    swing: 0.18,
  },
  intro: buildSection(
    16,
    `G5 Bb5 C6 C#6 D6:2 - Bb5:2 - G5:2 - F5:2 - D5:2 - F5:2 -`,
    `F4:2 - - - Bb4:2 - - - C5:2 - - - E5:2 - - -`,
    `G2 - Bb2 - C3 - C#3 - D3 - C3 - Bb2 - A2 -`,
    `X . H R S . H O K R H K S R T S`,
  ),
  loop: buildSection(
    64,
    `G5:2 - Bb5 C6 D6:2 - C#6 C6 Bb5:2 - G5:2 - F5:2 - D5:2 -
     E5:2 - G5 Bb5 C6:2 - B5 Bb5 A5:2 - G5:2 - E5:2 - G5:2 -
     F5:2 - A5 C6 D6:2 - C6:2 - Bb5:2 - A5:2 - G5:2 - F5:2 -
     D5:2 - F5 G5 Bb5:2 - C#6:2 - D6:2 - C6:2 - Bb5:2 - A5:2 -`,
    `- F4 Bb4 - - F4 Bb4 - - F4 A4 - - F4 A4 -
     - E4 Bb4 - - E4 Bb4 - - E4 G4 - - E4 Bb4 -
     - F4 A4 - - F4 C5 - - F4 Bb4 - - F4 A4 -
     - D4 G4 - - D4 Bb4 - - F4 A4 - - E4 A4 -`,
    `G2 - - G2 G3 - F2 - G2 - Bb2 - C3 - D3 -
     C2 - - C2 C3 - Bb1 - C2 - E2 - G2 - Bb2 -
     F2 - - F2 F3 - Eb2 - F2 - A2 - C3 - D3 -
     D2 - - D2 F2 - G2 - A2 - C3 - D3 - F2 -`,
    `C H R H S H H O K H R K S H R H
     X H R H S H H O K R H K S H O H
     X H R H S H H O K H R K S H R H
     X H R K S H R K B R S K T S R S`,
    `D5 - - F5 - - A5:2 - D5 - - C5 - - Bb4:2 -
     E5 - - G5 - - Bb5:2 - E5 - - D5 - - C5:2 -
     C5 - - E5 - - G5:2 - F5 - - E5 - - D5:2 -
     A4 - - C5 - - F5:2 - E5 - - G5 - - C#5:2 -`,
  ),
};

// --- 17. SPACE (126 BPM Cosmic Sci-Fi Arpeggios — Boombox Bonus) ---
const TRACK_SPACE: ProceduralTrackDef = {
  id: 'space',
  bpm: MUSIC_TRACK_MANIFEST.space.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.space.gain,
  voices: {
    leadWave: 'triangle',
    leadGain: 0.16,
    leadCutoffHz: 2900,
    leadDetuneCents: 10,
    harmonyWave: 'square',
    harmonyGain: 0.085,
    harmonyCutoffHz: 2700,
    bassWave: 'sine',
    bassGain: 0.28,
    bassCutoffHz: 600,
    drumGain: 0.24,
    counterWave: 'sine',
    counterGain: 0.11,
    counterCutoffHz: 3400,
  },
  intro: buildSection(
    32,
    `B5:4 - - - C#6:4 - - - D#6:4 - - - F#6:4 - - -
     E6:4 - - - D#6:4 - - - B5:8 - - - - - - -`,
    `E4 G#4 B4 D#5 E5 D#5 B4 G#4 C#4 E4 G#4 B4 D#5 B4 G#4 E4
     A3 C#4 E4 G#4 B4 G#4 E4 C#4 B3 D#4 F#4 A#4 B4 A#4 F#4 D#4`,
    `E2:4 - - - E2:4 - - - C#2:4 - - - C#2:4 - - -
     A1:4 - - - A1:4 - - - B1:4 - - - B1:4 - - -`,
    `K . H . . . H . K . H . S . H O
     K . H . . . H . K . S . H R H O`,
  ),
  loop: buildSection(
    64,
    `E6:4 - - - D#6:2 - B5:2 - C#6:4 - - - G#5:4 - - -
     A5:4 - - - B5:2 - C#6:2 - D#6:4 - - - B5:4 - - -
     G#5:4 - - - B5:2 - E6:2 - F#6:4 - - - D#6:4 - - -
     C#6:4 - - - B5:2 - G#5:2 - A#5:4 - - - B5:4 - - -`,
    `E4 G#4 B4 D#5 F#5 D#5 B4 G#4 C#4 E4 G#4 B4 E5 B4 G#4 E4
     A3 C#4 E4 G#4 C#5 G#4 E4 C#4 B3 D#4 F#4 B4 D#5 B4 F#4 D#4
     E4 G#4 B4 E5 G#5 E5 B4 G#4 F#4 A#4 C#5 F#5 A#5 F#5 C#5 A#4
     C#4 E4 G#4 C#5 E5 C#5 G#4 E4 B3 D#4 F#4 A#4 B4 F#4 D#4 B3`,
    `E2 - E3 - E2 - B2 - C#2 - C#3 - C#2 - G#2 -
     A1 - A2 - A1 - E2 - B1 - B2 - B1 - F#2 -
     E2 - E3 - E2 - G#2 - F#2 - F#3 - F#2 - C#3 -
     C#2 - C#3 - C#2 - G#2 - B1 - B2 - F#2 - B1 -`,
    `X . H H S . H . X . H H S . H O
     X . H H S . H . X . K H S . R H
     X . H H S . H . X . H H S . H O
     X . H H S . H . X . K . S R H O`,
    `G#5:8 - - - - - - - E5:8 - - - - - - -
     C#5:8 - - - - - - - F#5:8 - - - - - - -
     B5:8 - - - - - - - A#5:8 - - - - - - -
     G#5:8 - - - - - - - F#5:8 - - - - - - -`,
  ),
};

// --- 18. VICTORY (136 BPM Triumphant Stinger) ---
const TRACK_VICTORY: ProceduralTrackDef = {
  id: 'victory',
  bpm: MUSIC_TRACK_MANIFEST.victory.bpm,
  looping: false,
  gain: MUSIC_TRACK_MANIFEST.victory.gain,
  voices: {
    leadWave: 'square',
    leadGain: 0.16,
    leadCutoffHz: 3200,
    leadDetuneCents: 6,
    harmonyWave: 'triangle',
    harmonyGain: 0.14,
    harmonyCutoffHz: 2400,
    bassWave: 'triangle',
    bassGain: 0.25,
    bassCutoffHz: 900,
    drumGain: 0.26,
  },
  intro: null,
  loop: buildSection(
    32,
    `D5:2 - F#5:2 - A5:2 - D6:4 - - - - - B5:2 - C#6:2 -
     D6:8 - - - - - - - - - - - - - - -`,
    `F#4:2 - A4:2 - D5:2 - F#5:4 - - - - - G5:2 - E5:2 -
     F#5:8 - - - - - - - - - - - - - - -`,
    `D2:2 - D3:2 - F#2:2 - A2:4 - - - - - G2:2 - A2:2 -
     D2:8 - - - - - - - - - - - - - - -`,
    `X . H . S . X . S . S . T . S S
     C . O . . . . . . . . . . . . .`,
  ),
};

// --- 19. GAME_OVER (96 BPM Gothic Descending Stinger) ---
const TRACK_GAME_OVER: ProceduralTrackDef = {
  id: 'game_over',
  bpm: MUSIC_TRACK_MANIFEST.game_over.bpm,
  looping: false,
  gain: MUSIC_TRACK_MANIFEST.game_over.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.15,
    leadCutoffHz: 1500,
    leadDetuneCents: 8,
    harmonyWave: 'triangle',
    harmonyGain: 0.13,
    harmonyCutoffHz: 1200,
    bassWave: 'triangle',
    bassGain: 0.26,
    bassCutoffHz: 550,
    drumGain: 0.22,
  },
  intro: null,
  loop: buildSection(
    32,
    `A4:3 - - G4 F4:3 - - E4 D4:4 - - - C#4:4 - - -
     D4:8 - - - - - - - - - - - - - - -`,
    `F4:4 - - - D4:4 - - - Bb3:4 - - - A3:4 - - -
     A3:8 - - - - - - - - - - - - - - -`,
    `D2:4 - - - C2:4 - - - Bb1:4 - - - A1:4 - - -
     D2:8 - - - - - - - - - - - - - - -`,
    `G . . . T . . . K . . . S . . .
     G . . . . . . . . . . . . . . .`,
  ),
};

export const PROCEDURAL_TRACKS: Readonly<Record<MusicTrackId, ProceduralTrackDef>> = Object.freeze({
  title: TRACK_TITLE,
  forest_1: TRACK_FOREST_1,
  forest_2: TRACK_FOREST_2,
  forest_3: TRACK_FOREST_3,
  forest_boss: TRACK_FOREST_BOSS,
  desert_1: TRACK_DESERT_1,
  desert_2: TRACK_DESERT_2,
  desert_3: TRACK_DESERT_3,
  desert_boss: TRACK_DESERT_BOSS,
  graveyard: TRACK_GRAVEYARD,
  graveyard_boss: TRACK_GRAVEYARD_BOSS,
  final_boss: TRACK_FINAL_BOSS,
  final_swarm: TRACK_FINAL_SWARM,
  calcium: TRACK_CALCIUM,
  megachad: TRACK_MEGACHAD,
  dicy: TRACK_DICY,
  space: TRACK_SPACE,
  victory: TRACK_VICTORY,
  game_over: TRACK_GAME_OVER,
});

// ============================================================================
// 3. LOOKAHEAD WEB AUDIO STEP SEQUENCER (INTRO -> SEAMLESS LOOP)
// ============================================================================

export class MusicSequencer {
  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly noiseBuffer: AudioBuffer;
  private trackGain: GainNode | null = null;
  private currentTrack: ProceduralTrackDef | null = null;
  private inIntro = false;
  private stepIndex = 0;
  private nextStepTime = 0;
  private finishedStinger = false;
  private running = false;
  private disposed = false;

  private readonly lookaheadSec = 0.14;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.output = output;
    this.noiseBuffer = this.createDrumNoiseBuffer(0.7);
  }

  public getCurrentTrackId(): MusicTrackId | null {
    return this.currentTrack ? this.currentTrack.id : null;
  }

  public isRunning(): boolean {
    return this.running && !this.finishedStinger;
  }

  public isInIntro(): boolean {
    return this.inIntro;
  }

  public getStepIndex(): number {
    return this.stepIndex;
  }

  /** Start or crossfade to a procedural track (no-op if already playing that track). */
  public playTrack(trackId: MusicTrackId, forceRestart = false): void {
    if (this.disposed || this.ctx.state === 'closed') return;
    if (!forceRestart && this.running && this.currentTrack?.id === trackId) {
      return;
    }

    const track = PROCEDURAL_TRACKS[trackId];
    const now = this.ctx.currentTime;

    // Fade out previous track bus smoothly so transitions never pop
    if (this.trackGain) {
      const oldGain = this.trackGain;
      try {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(oldGain.gain.value, now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      } catch {
        // Ignore ramp errors on closing context
      }
      this.trackGain = null;
    }

    const newBus = this.ctx.createGain();
    newBus.gain.setValueAtTime(0.0001, now);
    newBus.gain.linearRampToValueAtTime(track.gain, now + 0.08);
    newBus.connect(this.output);

    this.trackGain = newBus;
    this.currentTrack = track;
    this.inIntro = track.intro !== null;
    this.stepIndex = 0;
    this.nextStepTime = now + 0.03;
    this.finishedStinger = false;
    this.running = true;

    this.tick();
  }

  /** Smoothly fade out and halt the sequencer. */
  public stop(fadeSec = 0.18): void {
    this.running = false;
    this.currentTrack = null;
    this.finishedStinger = false;

    if (this.trackGain && this.ctx.state !== 'closed') {
      const now = this.ctx.currentTime;
      const oldGain = this.trackGain;
      try {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(oldGain.gain.value, now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.02, fadeSec));
      } catch {
        // Ignore
      }
    }
    this.trackGain = null;
  }

  /**
   * Call periodically (from AudioEngine.update) to schedule upcoming 16th-note steps
   * within the lookahead window with sample-accurate Web Audio timestamps.
   */
  public tick(): void {
    if (
      this.disposed ||
      !this.running ||
      this.finishedStinger ||
      !this.currentTrack ||
      !this.trackGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const track = this.currentTrack;
    const stepDur = 60 / track.bpm / 4;
    const swing = track.voices.swing ?? 0;

    // Guard against tab-background catchup storms
    if (now - this.nextStepTime > 0.5) {
      this.nextStepTime = now + 0.025;
    }

    const horizon = now + this.lookaheadSec;
    let safetyCounter = 0;

    while (this.nextStepTime < horizon && safetyCounter < 32) {
      safetyCounter++;
      const section = this.inIntro && track.intro ? track.intro : track.loop;
      const swingOffset = this.stepIndex % 2 === 1 ? stepDur * swing : 0;
      this.scheduleStep(
        track,
        section,
        this.stepIndex,
        this.nextStepTime + swingOffset,
        stepDur,
        this.trackGain,
      );

      this.nextStepTime += stepDur;
      this.stepIndex++;

      if (this.stepIndex >= section.steps) {
        if (this.inIntro) {
          // Seamless handoff from Intro -> Loop on exact next 16th boundary
          this.inIntro = false;
          this.stepIndex = 0;
        } else if (track.looping) {
          this.stepIndex = 0;
        } else {
          this.finishedStinger = true;
          this.running = false;
          break;
        }
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.stop(0.02);
  }

  // ==========================================================================
  // STEP VOICE SCHEDULERS
  // ==========================================================================

  private scheduleStep(
    track: ProceduralTrackDef,
    section: TrackSection,
    idx: number,
    time: number,
    stepDur: number,
    bus: GainNode,
  ): void {
    const v = track.voices;
    const leadNote = section.lead[idx];
    if (leadNote) {
      this.playMelodicVoice(
        time,
        leadNote.freq,
        leadNote.lengthSteps * stepDur * 0.92,
        v.leadWave,
        v.leadGain * leadNote.velocity,
        v.leadCutoffHz,
        bus,
        v.leadDetuneCents ?? 0,
      );
    }

    const harmNote = section.harmony[idx];
    if (harmNote) {
      this.playMelodicVoice(
        time,
        harmNote.freq,
        harmNote.lengthSteps * stepDur * 0.82,
        v.harmonyWave,
        v.harmonyGain * harmNote.velocity,
        v.harmonyCutoffHz,
        bus,
        0,
      );
    }

    const counterNote = section.counter?.[idx];
    if (counterNote) {
      this.playMelodicVoice(
        time,
        counterNote.freq,
        counterNote.lengthSteps * stepDur * 0.9,
        v.counterWave ?? 'triangle',
        (v.counterGain ?? 0.1) * counterNote.velocity,
        v.counterCutoffHz ?? 1800,
        bus,
        0,
      );
    }

    const bassNote = section.bass[idx];
    if (bassNote) {
      this.playBassVoice(
        time,
        bassNote.freq,
        bassNote.lengthSteps * stepDur * 0.88,
        v.bassWave,
        v.bassGain * bassNote.velocity,
        v.bassCutoffHz,
        bus,
      );
    }

    const drum = section.drums[idx];
    if (drum) {
      this.playDrumHit(time, drum, v.drumGain, bus);
    }
  }

  private playMelodicVoice(
    t: number,
    freq: number,
    dur: number,
    wave: OscillatorType,
    gain: number,
    cutoffHz: number,
    bus: GainNode,
    detuneCents: number,
  ): void {
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    filter.type = 'lowpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(Math.min(12000, cutoffHz * 1.35), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(250, cutoffHz * 0.65), t + dur);

    const safeDur = Math.max(0.04, dur);
    const attackDur = Math.min(0.008, safeDur * 0.3);
    const attackEnd = t + attackDur;
    const decayEnd = t + Math.max(attackDur + 0.005, Math.min(safeDur * 0.65, safeDur - 0.012));
    env.gain.setValueAtTime(0.0008, t);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gain), attackEnd);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gain * 0.72), decayEnd);
    env.gain.exponentialRampToValueAtTime(0.0008, t + safeDur);

    filter.connect(env);
    env.connect(bus);

    if (detuneCents > 0) {
      const detuneRatio = Math.pow(2, detuneCents / 1200);
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = wave;
      oscB.type = wave;
      oscA.frequency.setValueAtTime(freq * detuneRatio, t);
      oscB.frequency.setValueAtTime(freq / detuneRatio, t);
      oscA.connect(filter);
      oscB.connect(filter);
      oscA.start(t);
      oscB.start(t);
      oscA.stop(t + safeDur + 0.02);
      oscB.stop(t + safeDur + 0.02);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + safeDur + 0.02);
    }
  }

  private playBassVoice(
    t: number,
    freq: number,
    dur: number,
    wave: OscillatorType,
    gain: number,
    cutoffHz: number,
    bus: GainNode,
  ): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(cutoffHz * 1.6, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(140, cutoffHz * 0.45),
      t + Math.max(0.05, dur),
    );

    const safeDur = Math.max(0.045, dur);
    env.gain.setValueAtTime(0.0008, t);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gain), t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0008, t + safeDur);

    osc.connect(filter);
    filter.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + safeDur + 0.02);
  }

  private playDrumHit(t: number, hit: DrumHit, gain: number, bus: GainNode): void {
    switch (hit) {
      case 'K':
        this.playKick(t, gain, bus);
        break;
      case 'S':
        this.playSnare(t, gain, bus);
        break;
      case 'H':
        this.playHat(t, gain * 0.45, 0.045, bus);
        break;
      case 'O':
        this.playHat(t, gain * 0.55, 0.16, bus);
        break;
      case 'T':
        this.playTom(t, gain * 0.85, bus);
        break;
      case 'X':
        this.playKick(t, gain, bus);
        this.playHat(t, gain * 0.4, 0.045, bus);
        break;
      case 'B':
        this.playKick(t, gain, bus);
        this.playSnare(t, gain * 0.9, bus);
        break;
      case 'C':
        this.playKick(t, gain, bus);
        this.playCrash(t, gain * 0.65, bus);
        break;
      case 'R':
        this.playRimshot(t, gain * 0.65, bus);
        break;
      case 'G':
        this.playKick(t, gain * 0.85, bus);
        this.playBellGong(t, gain * 0.52, bus);
        break;
      default:
        break;
    }
  }

  private playKick(t: number, gain: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.085);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.9, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.125);

    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private playSnare(t: number, gain: number, bus: GainNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1450, t);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.62, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t, 0, 0.13);

    const body = this.ctx.createOscillator();
    const bodyEnv = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, t);
    body.frequency.exponentialRampToValueAtTime(115, t + 0.06);
    bodyEnv.gain.setValueAtTime(0.001, t);
    bodyEnv.gain.linearRampToValueAtTime(gain * 0.34, t + 0.003);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0008, t + 0.075);

    body.connect(bodyEnv);
    bodyEnv.connect(bus);
    body.start(t);
    body.stop(t + 0.09);
  }

  private playHat(t: number, gain: number, dur: number, bus: GainNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6200, t);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0008, t);
    env.gain.linearRampToValueAtTime(gain * 0.52, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t, 0, dur + 0.02);
  }

  private playCrash(t: number, gain: number, bus: GainNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4800, t);
    filter.Q.value = 0.7;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.65, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t, 0, 0.46);
  }

  private playRimshot(t: number, gain: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.025);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.6, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.036);

    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  private playBellGong(t: number, gain: number, bus: GainNode): void {
    const partials: Array<[number, number, number]> = [
      [220, 0.42, 0.46],
      [330, 0.24, 0.38],
      [587.33, 0.18, 0.32],
    ];
    for (const [freq, amp, dur] of partials) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      env.gain.setValueAtTime(0.0008, t);
      env.gain.linearRampToValueAtTime(gain * amp, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(env);
      env.connect(bus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  private playTom(t: number, gain: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, t);
    osc.frequency.exponentialRampToValueAtTime(86, t + 0.11);

    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(gain * 0.72, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);

    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private createDrumNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1024, Math.floor(sampleRate * durationSec));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
