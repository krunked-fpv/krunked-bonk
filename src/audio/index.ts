/**
 * KRUNKEDBONK — Audio Module Public Exports
 */

export {
  AudioEngine,
  createAudioEngine,
  type AudioSettingsPatch,
} from './AudioEngine';

export {
  ProceduralSynth,
  type SynthPlayParams,
} from './ProceduralSynth';

export {
  AudioSpamFilter,
  CONTINUOUS_LOOP_MANIFEST,
  getCustomPackClipCandidates,
  isMusicTrackId,
  mapSimEventToSfxRequests,
  MUSIC_STATE_TO_TRACK,
  MUSIC_TRACK_MANIFEST,
  resolveWeaponAudioFamily,
  resolveWeaponFireCue,
  SFX_MANIFEST,
  WEAPON_FAMILY_TO_CUE,
  type ContinuousLoopDef,
  type ContinuousLoopId,
  type MusicState,
  type MusicTrackId,
  type MusicTrackManifestEntry,
  type SfxCategory,
  type SfxCueDef,
  type SfxCueId,
  type SfxTriggerRequest,
  type SpamFilterAcquireResult,
  type WeaponAudioFamily,
} from './soundManifest';

export {
  MusicSequencer,
  noteToFreq,
  PROCEDURAL_TRACKS,
  type DrumHit,
  type ProceduralTrackDef,
  type StepNote,
  type TrackSection,
  type TrackVoiceConfig,
} from './tracks';
