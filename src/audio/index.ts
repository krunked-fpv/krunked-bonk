/**
 * KRUNKEDBONK — Audio Module Public Exports (Wave 2)
 */

export {
  AudioEngine,
  createAudioEngine,
  type AudioSettingsPatch,
  type MusicContextSnapshot,
} from './AudioEngine';

export {
  ProceduralSynth,
  type SynthPlayParams,
} from './ProceduralSynth';

export {
  ALL_WEAPON_IDS,
  AudioSpamFilter,
  BOOMBOX_TRACK_LIST,
  CONTINUOUS_LOOP_MANIFEST,
  getCustomPackClipCandidates,
  isMusicTrackId,
  mapSimEventToSfxRequests,
  MUSIC_STATE_TO_TRACK,
  MUSIC_TRACK_MANIFEST,
  normalizeMusicTrackId,
  resolveMusicTrackForContext,
  resolveWeaponAudioFamily,
  resolveWeaponFireCue,
  SFX_MANIFEST,
  SOUND_MANIFEST,
  WEAPON_FAMILY_TO_CUE,
  type BoomboxTrackDescriptor,
  type BoomboxTrackId,
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
