/**
 * KRUNKEDBONK — Procedural Step-Sequencer Soundtrack Engine (Wave 1)
 *
 * Intro -> Seamless Loop chiptune & gothic-synth Web Audio tracks:
 * - title:          104 BPM moody retro-gothic synthwave title theme
 * - forest_explore: 138 BPM driving energetic chiptune-arcade action groove
 * - forest_boss:    156 BPM intense boss battle anthem (Lil Bark encounter)
 * - final_swarm:    172 BPM urgent dark high-tempo panic loop
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

export type DrumHit = 'K' | 'S' | 'H' | 'O' | 'T' | 'X' | 'B' | null;

export interface TrackSection {
  readonly steps: number;
  readonly lead: readonly (StepNote | null)[];
  readonly harmony: readonly (StepNote | null)[];
  readonly bass: readonly (StepNote | null)[];
  readonly drums: readonly DrumHit[];
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
 * Parses whitespace-separated 16th-note tokens:
 *  - `-` or `.` => rest
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
    if (ch === 'K' || ch === 'S' || ch === 'H' || ch === 'O' || ch === 'T' || ch === 'X' || ch === 'B') {
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
): TrackSection {
  return {
    steps,
    lead: parseNotes(lead, steps),
    harmony: parseNotes(harmony, steps),
    bass: parseNotes(bass, steps),
    drums: parseDrums(drums, steps),
  };
}

// ============================================================================
// 2. WAVE 1 SOUNDTRACK DEFINITIONS (INTRO -> SEAMLESS LOOP)
// ============================================================================

const TRACK_TITLE: ProceduralTrackDef = {
  id: 'title',
  bpm: MUSIC_TRACK_MANIFEST.title.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.title.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 2100,
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
    // Moody cathedral synthwave intro bell swell
    `D5:4 - - - F5:4 - - - E5:4 - - - A4:4 - - -
     Bb4:4 - - - A4:4 - - - C#5:6 - - - - - - -`,
    `D4:2 A4:2 F4:2 A4:2 D4:2 A4:2 F4:2 A4:2
     C#4:2 A4:2 E4:2 A4:2 C#4:2 E4:2 A4:2 C#5:2`,
    `D2:4 - D2:2 - D2:4 - D2:2 -
     A1:4 - A1:2 - A1:4 - C#2:4 -`,
    `K . H . . . H . K . H . T . T .
     K . H . . . H . K . S . T . S S`,
  ),
  loop: buildSection(
    128,
    // 8 bars moody gothic synthwave melody (Dm - Bb - Gm - A7 - Dm - C - Bb - A7)
    `D5:4 - - - A4:2 F5:2 E5:4 - - - D5:2 C5:2
     D5:6 - - - - - Bb4:2 F5:4 - - - D5:4 - - -
     G5:4 - - - F5:2 E5:2 D5:4 - - - Bb4:2 G4:2
     A4:6 - - - - - C#5:2 E5:4 - - - A4:4 - - -
     F5:4 - - - E5:2 D5:2 A5:4 - - - F5:2 D5:2
     G5:4 - - - E5:2 C5:2 G5:4 - - - E5:4 - - -
     F5:4 - - - D5:2 Bb4:2 D5:4 - - - F5:2 G5:2
     E5:6 - - - - - C#5:2 A4:6 - - - - - - -`,
    // Gothic synth arpeggios
    `D4 F4 A4 D5 D4 F4 A4 D5 D4 F4 A4 D5 A4 F4 D4 A3
     Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 F4 D4 Bb3 F3
     G3 Bb3 D4 G4 G3 Bb3 D4 G4 G3 Bb3 D4 G4 D4 Bb3 G3 D3
     A3 C#4 E4 A4 A3 C#4 E4 A4 A3 C#4 E4 A4 E4 C#4 A3 E3
     D4 F4 A4 D5 D4 F4 A4 D5 D4 F4 A4 D5 A4 F4 D4 A3
     C4 E4 G4 C5 C4 E4 G4 C5 C4 E4 G4 C5 G4 E4 C4 G3
     Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 Bb3 D4 F4 Bb4 F4 D4 Bb3 F3
     A3 C#4 E4 A4 A3 C#4 E4 A4 A3 C#4 E4 A4 G4 E4 C#4 A3`,
    // Pulsing synthwave 8th bass
    `D2 - D2 - D2 - D3 - D2 - D2 - C2 - D2 -
     Bb1 - Bb1 - Bb1 - Bb2 - Bb1 - Bb1 - A1 - Bb1 -
     G1 - G1 - G1 - G2 - G1 - G1 - F1 - G1 -
     A1 - A1 - A1 - A2 - A1 - C#2 - E2 - A1 -
     D2 - D2 - D2 - D3 - D2 - D2 - C2 - D2 -
     C2 - C2 - C2 - C3 - C2 - C2 - Bb1 - C2 -
     Bb1 - Bb1 - Bb1 - Bb2 - Bb1 - Bb1 - A1 - Bb1 -
     A1 - A1 - A1 - A2 - A1 - A1 - C#2 - E2 -`,
    // Retro synthwave drums
    `X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . H .
     X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S T T S
     X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . H .
     X . H . S . H . X . H . S . H O
     X . H . S . H . X . K . S . S S`,
  ),
};

const TRACK_FOREST_EXPLORE: ProceduralTrackDef = {
  id: 'forest_explore',
  bpm: MUSIC_TRACK_MANIFEST.forest_explore.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_explore.gain,
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
    // Snappy arcade 2-bar pickup riff into Forest groove
    `D5:2 - F5:2 G5:2 A5:2 - G5:2 F5:2 D5:2
     C5:2 - E5:2 G5:2 A5:4 - - - A4:2 C5:2`,
    `D4:2 - F4:2 G4:2 A4:2 - G4:2 F4:2 D4:2
     C4:2 - E4:2 G4:2 E4:4 - - - E4:2 G4:2`,
    `D2 - D3 - D2 - D3 - D2 - F2 - G2 - A2 -
     C2 - C3 - C2 - C3 - A1 - A2 - C2 - C#2 -`,
    `X . H . S . H . X . H . S . H O
     X . H . S . H . S . S . T S S S`,
  ),
  loop: buildSection(
    128,
    // 8-bar energetic 138 BPM chiptune-arcade action melody (Dm - C - Bb - C - Dm - F - G - A)
    `D5:2 - F5:2 A5:2 G5:2 F5:2 D5:2 C5:2 D5:2
     E5:2 - G5:2 C6:2 B5:2 G5:2 E5:2 D5:2 C5:2
     D5:2 - F5:2 Bb5:2 A5:2 G5:2 F5:2 D5:2 F5:2
     G5:4 - - - E5:2 G5:2 A5:4 - - - G5:2 E5:2
     D5:2 - A5:2 G5:2 F5:2 D5:2 F5:2 G5:2 A5:2
     C6:2 - A5:2 F5:2 A5:2 C6:2 D6:2 C6:2 A5:2
     B5:2 - G5:2 D5:2 G5:2 B5:2 D6:2 B5:2 G5:2
     A5:4 - - - G5:2 E5:2 C#5:2 E5:2 A5:4 - - -`,
    // Square harmony & energetic arcade arps
    `A4 - D4 F4 A4 - F4 D4 A4 - D4 F4 A4 F4 D4 F4
     G4 - C4 E4 G4 - E4 C4 G4 - C4 E4 G4 E4 C4 E4
     F4 - Bb3 D4 F4 - D4 Bb3 F4 - Bb3 D4 F4 D4 Bb3 D4
     G4 - C4 E4 G4 - E4 C4 E4 - G4 C5 E4 G4 C5 G4
     A4 - D4 F4 A4 - F4 D4 A4 - D4 F4 A4 F4 D4 F4
     A4 - C4 F4 A4 - F4 C4 A4 - C4 F4 A4 F4 C4 F4
     G4 - B3 D4 G4 - D4 B3 G4 - B3 D4 G4 D4 B3 D4
     E4 - A3 C#4 E4 - C#4 A3 E4 - A3 C#4 E4 A4 C#5 A4`,
    // Punchy octave bounce bassline
    `D2 - D3 D2 F2 - G2 - A2 - D3 D2 C2 - A1 -
     C2 - C3 C2 E2 - G2 - C3 - G2 E2 C2 - G1 -
     Bb1 - Bb2 Bb1 D2 - F2 - Bb2 - F2 D2 Bb1 - F1 -
     C2 - C3 C2 E2 - G2 - C3 - G2 E2 C2 - C#2 -
     D2 - D3 D2 F2 - G2 - A2 - D3 A2 F2 - D2 -
     F2 - F3 F2 A2 - C3 - F3 - C3 A2 F2 - C2 -
     G2 - G3 G2 B2 - D3 - G3 - D3 B2 G2 - D2 -
     A1 - A2 A1 C#2 - E2 - A2 - E2 C#2 A1 - C#2 -`,
    // Driving 138 BPM arcade kit
    `X H H H S H H H X H K H S H H O
     X H H H S H H H X H K H S H K H
     X H H H S H H H X H K H S H H O
     X H H H S H H K X H K H S T S S
     X H H H S H H H X H K H S H H O
     X H H H S H H H X H K H S H K H
     X H H H S H H H X H K H S H H O
     X H K H S H K H X K S K S T S S`,
  ),
};

const TRACK_FOREST_BOSS: ProceduralTrackDef = {
  id: 'forest_boss',
  bpm: MUSIC_TRACK_MANIFEST.forest_boss.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.forest_boss.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3200,
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
    // Intense Lil Bark gothic boss fanfare
    `E5:4 - - - F5:2 E5:2 D#5:4 - - - B4:4 - - -
     E5:2 G5:2 B5:2 A5:2 G5:2 F5:2 E5:2 D#5:2`,
    `E4:4 - - - F4:2 E4:2 B3:4 - - - F#4:4 - - -
     E4:2 G4:2 B4:2 A4:2 G4:2 F4:2 D#4:2 B3:2`,
    `E2 E2 - E2 F2 F2 - F2 D#2 D#2 - D#2 B1 B1 - B1
     E2 E2 G2 G2 B2 B2 A2 A2 G2 G2 F2 F2 B1 B1 B1 B1`,
    `X . K . B . K . X . K . B . K .
     X K X K S K S K T T S S B K S S`,
  ),
  loop: buildSection(
    128,
    // 8-bar 156 BPM E-Phrygian gothic boss anthem
    `E5:2 E5:1 F5:1 G5:2 E5:2 B5:2 - A5:2 G5:2 F5:2
     F5:2 F5:1 G5:1 A5:2 F5:2 C6:2 - B5:2 A5:2 G5:2
     D5:2 F5:2 A5:2 G5:2 F5:2 E5:2 D5:2 C5:2
     B4:2 D#5:2 F#5:2 B5:2 - A5:2 F#5:2 D#5:2
     E5:2 B5:2 A5:2 G5:2 E5:2 G5:2 A5:2 B5:2
     G5:2 D6:2 C6:2 B5:2 G5:2 B5:2 C6:2 D6:2
     F5:2 C6:2 B5:2 A5:2 F5:2 A5:2 G5:2 F5:2
     D#5:2 F#5:2 B5:2 D#6:2 - B5:2 F#5:2 D#5:2`,
    // Relentless gothic boss arps & power chords
    `E4 B4 E4 B4 F4 C5 E4 B4 E4 B4 G4 B4 E4 B4 F4 B4
     F4 C5 F4 C5 G4 C5 F4 C5 F4 C5 A4 C5 F4 C5 G4 C5
     D4 A4 D4 A4 F4 A4 D4 A4 D4 A4 E4 A4 D4 A4 C4 A4
     B3 F#4 D#4 F#4 B3 F#4 D#4 F#4 B3 F#4 A4 F#4 D#4 F#4 B3 F#4
     E4 B4 G4 B4 E4 B4 G4 B4 E4 B4 A4 B4 G4 B4 E4 B4
     G4 D5 B4 D5 G4 D5 B4 D5 G4 D5 C5 D5 B4 D5 G4 D5
     F4 C5 A4 C5 F4 C5 A4 C5 F4 C5 G4 C5 A4 C5 F4 C5
     B3 F#4 D#4 F#4 B3 F#4 D#4 F#4 B3 D#4 F#4 B4 A4 F#4 D#4 B3`,
    // Galloping boss metal bass
    `E2 E2 - E2 E3 E2 - E2 E2 E2 G2 E2 F2 - E2 -
     F2 F2 - F2 F3 F2 - F2 F2 F2 A2 F2 G2 - F2 -
     D2 D2 - D2 D3 D2 - D2 D2 D2 F2 D2 C2 - D2 -
     B1 B1 - B1 B2 B1 - B1 B1 B1 D#2 F#2 B2 - F#2 -
     E2 E2 - E2 E3 E2 - E2 E2 E2 G2 E2 B2 - G2 -
     G2 G2 - G2 G3 G2 - G2 G2 G2 B2 G2 D3 - B2 -
     F2 F2 - F2 F3 F2 - F2 F2 F2 A2 F2 C3 - A2 -
     B1 B1 - B1 B2 B1 - B1 B1 D#2 F#2 B2 A2 F#2 D#2 B1`,
    // Heavy double-kick boss battle percussion
    `X K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     X K H K S H K K X K S K T T S S
     X K H K S H K K X K H K S H K O
     X K H K S H K K X K H K S K S H
     X K H K S H K K X K H K S H K O
     X K K K S K K K B K S K T S S S`,
  ),
};

const TRACK_FINAL_SWARM: ProceduralTrackDef = {
  id: 'final_swarm',
  bpm: MUSIC_TRACK_MANIFEST.final_swarm.bpm,
  looping: true,
  gain: MUSIC_TRACK_MANIFEST.final_swarm.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.16,
    leadCutoffHz: 3500,
    harmonyWave: 'square',
    harmonyGain: 0.1,
    harmonyCutoffHz: 2500,
    bassWave: 'sawtooth',
    bassGain: 0.28,
    bassCutoffHz: 900,
    drumGain: 0.32,
  },
  intro: buildSection(
    16,
    `C#6:2 G5:2 C#6:2 G5:2 C#6:2 G5:2 F#5:2 G5:2`,
    `C#5:2 G4:2 C#5:2 G4:2 C#5:2 G4:2 F#4:2 G4:2`,
    `C#2 C#2 G1 G1 C#2 C#2 G1 G1 C#2 C#2 D2 D2 G#1 G#1 G#1 G#1`,
    `X K S K X K S K T T T T S S S S`,
  ),
  loop: buildSection(
    64,
    // Urgent dark 172 BPM frantic panic loop
    `C#6:2 B5:1 A5:1 G#5:2 E5:2 C#5:2 G#5:2 G5:2 F#5:2
     D6:2 C6:1 A5:1 F5:2 D5:2 A5:2 G#5:2 G5:2 F5:2
     G#5:2 C6:2 D#6:2 C6:2 G#5:2 F#5:2 E5:2 D#5:2
     C#5:2 G5:2 C#6:2 G5:2 B5:2 G#5:2 F#5:2 E5:2`,
    `C#5 G#4 E4 G#4 C#5 G#4 G4 G#4 C#5 G#4 E4 G#4 C#5 G#4 E4 G#4
     D5 A4 F4 A4 D5 A4 G#4 A4 D5 A4 F4 A4 D5 A4 F4 A4
     G#4 D#5 C5 D#5 G#4 D#5 C5 D#5 G#4 D#5 C5 D#5 G#4 D#5 C5 D#5
     C#5 G4 E4 G4 C#5 G4 E4 G4 B4 G#4 E4 G#4 G#4 D#4 C4 D#4`,
    `C#2 C#3 C#2 C#3 C#2 C#3 G1 G2 C#2 C#3 C#2 C#3 B1 B2 G#1 G#2
     D2 D3 D2 D3 D2 D3 A1 A2 D2 D3 D2 D3 C2 C3 A1 A2
     G#1 G#2 G#1 G#2 G#1 G#2 D#2 D#3 G#1 G#2 G#1 G#2 F#1 F#2 D#1 D#2
     C#2 C#3 G1 G2 C#2 C#3 G1 G2 B1 B2 G#1 G#2 G#1 G#2 G#1 G#2`,
    `X K S K X K S O X K S K X K S K
     X K S K X K S O X K S K T S S K
     X K S K X K S O X K S K X K S K
     X K S K X K S K B K S K T S S S`,
  ),
};

const TRACK_VICTORY: ProceduralTrackDef = {
  id: 'victory',
  bpm: MUSIC_TRACK_MANIFEST.victory.bpm,
  looping: false,
  gain: MUSIC_TRACK_MANIFEST.victory.gain,
  voices: {
    leadWave: 'square',
    leadGain: 0.16,
    leadCutoffHz: 3200,
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
    `D5:2 F#5:2 A5:2 D6:4 - - - B5:2 C#6:2
     D6:8 - - - - - - - - - - - - - - -`,
    `F#4:2 A4:2 D5:2 F#5:4 - - - G5:2 E5:2
     F#5:8 - - - - - - - - - - - - - - -`,
    `D2:2 D3:2 F#2:2 A2:4 - - - G2:2 A2:2
     D2:8 - - - - - - - - - - - - - - -`,
    `X . H . S . X . S . S . T . S S
     B . O . . . . . . . . . . . . .`,
  ),
};

const TRACK_GAME_OVER: ProceduralTrackDef = {
  id: 'game_over',
  bpm: MUSIC_TRACK_MANIFEST.game_over.bpm,
  looping: false,
  gain: MUSIC_TRACK_MANIFEST.game_over.gain,
  voices: {
    leadWave: 'sawtooth',
    leadGain: 0.15,
    leadCutoffHz: 1500,
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
    `A4:3 - - G4:1 F4:3 - - E4:1 D4:4 - - - C#4:4 - - -
     D4:8 - - - - - - - - - - - - - - -`,
    `F4:4 - - - D4:4 - - - Bb3:4 - - - A3:4 - - -
     A3:8 - - - - - - - - - - - - - - -`,
    `D2:4 - - - C2:4 - - - Bb1:4 - - - A1:4 - - -
     D2:8 - - - - - - - - - - - - - - -`,
    `K . . . T . . . K . . . S . . .
     K . . . . . . . . . . . . . . .`,
  ),
};

export const PROCEDURAL_TRACKS: Readonly<Record<MusicTrackId, ProceduralTrackDef>> = Object.freeze({
  title: TRACK_TITLE,
  forest_explore: TRACK_FOREST_EXPLORE,
  forest_boss: TRACK_FOREST_BOSS,
  final_swarm: TRACK_FINAL_SWARM,
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
    this.noiseBuffer = this.createDrumNoiseBuffer(0.6);
  }

  public getCurrentTrackId(): MusicTrackId | null {
    return this.currentTrack ? this.currentTrack.id : null;
  }

  public isRunning(): boolean {
    return this.running && !this.finishedStinger;
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

    // Guard against tab-background catchup storms
    if (now - this.nextStepTime > 0.5) {
      this.nextStepTime = now + 0.025;
    }

    const horizon = now + this.lookaheadSec;
    let safetyCounter = 0;

    while (this.nextStepTime < horizon && safetyCounter < 32) {
      safetyCounter++;
      const section = this.inIntro && track.intro ? track.intro : track.loop;
      this.scheduleStep(track, section, this.stepIndex, this.nextStepTime, stepDur, this.trackGain);

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
  ): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);

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

    osc.connect(filter);
    filter.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + safeDur + 0.02);
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
    filter.frequency.exponentialRampToValueAtTime(Math.max(140, cutoffHz * 0.45), t + Math.max(0.05, dur));

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
    // Noise snap
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

    // Snare tonal body
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
