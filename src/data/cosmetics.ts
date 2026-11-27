import type { HatDef, SkinDef } from '../contracts/index';

export const SKINS: readonly SkinDef[] = Object.freeze([
  {
    id: 'skin_fox_ember',
    characterId: 'Fox',
    displayName: 'Ember Fox',
    primaryColorHex: '#f06a24',
    accentColorHex: '#fff0d6',
  },
  {
    id: 'skin_fox_frost',
    characterId: 'Fox',
    displayName: 'Arctic Fox',
    primaryColorHex: '#e0f2fe',
    accentColorHex: '#38bdf8',
    unlockQuestId: 'quest_kill_100',
  },
  {
    id: 'skin_calcium_classic',
    characterId: 'Calcium',
    displayName: 'Classic Bones',
    primaryColorHex: '#ede6d3',
    accentColorHex: '#ff4d6d',
  },
  {
    id: 'skin_calcium_neon',
    characterId: 'Calcium',
    displayName: 'Kickflip Neon',
    primaryColorHex: '#d8b4fe',
    accentColorHex: '#22d3ee',
    unlockQuestId: 'quest_shrines_5',
  },
  {
    id: 'skin_siroofie_steel',
    characterId: 'SirOofie',
    displayName: 'Royal Steel',
    primaryColorHex: '#8d99ae',
    accentColorHex: '#d90429',
  },
  {
    id: 'skin_siroofie_gilded',
    characterId: 'SirOofie',
    displayName: 'Gilded Paladin',
    primaryColorHex: '#fbbf24',
    accentColorHex: '#fef08a',
    unlockQuestId: 'quest_defeat_lil_bark',
  },
  {
    id: 'skin_megachad_gold',
    characterId: 'Megachad',
    displayName: 'Golden Flex',
    primaryColorHex: '#ffb703',
    accentColorHex: '#fb8500',
  },
  {
    id: 'skin_megachad_obsidian',
    characterId: 'Megachad',
    displayName: 'Obsidian Titan',
    primaryColorHex: '#334155',
    accentColorHex: '#c084fc',
    unlockQuestId: 'quest_megacrit_first',
  },
]);

export const HATS: readonly HatDef[] = Object.freeze([
  {
    id: 'hat_beanie',
    displayName: 'Skater Beanie',
    meshStyle: 'beanie',
    colorHex: '#ef4444',
  },
  {
    id: 'hat_wizard',
    displayName: 'Pyro Wizard Hat',
    meshStyle: 'wizard',
    colorHex: '#6366f1',
  },
  {
    id: 'hat_crown',
    displayName: 'Bonk Crown',
    meshStyle: 'crown',
    colorHex: '#facc15',
    unlockQuestId: 'quest_defeat_lil_bark',
  },
  {
    id: 'hat_halo',
    displayName: 'Radiant Halo',
    meshStyle: 'halo',
    colorHex: '#fef08a',
    unlockQuestId: 'quest_shrines_5',
  },
  {
    id: 'hat_horns',
    displayName: 'Demon Horns',
    meshStyle: 'horns',
    colorHex: '#dc2626',
    unlockQuestId: 'quest_kill_500',
  },
  {
    id: 'hat_tophat',
    displayName: 'Dapper Tophat',
    meshStyle: 'tophat',
    colorHex: '#1e293b',
    unlockQuestId: 'quest_megacrit_first',
  },
  {
    id: 'hat_visor',
    displayName: 'Turbo Visor',
    meshStyle: 'visor',
    colorHex: '#22d3ee',
    unlockQuestId: 'quest_kill_100',
  },
  {
    id: 'hat_bucket',
    displayName: 'Iron Bucket',
    meshStyle: 'bucket',
    colorHex: '#94a3b8',
    unlockQuestId: 'quest_bonker_first',
  },
]);

export const SKIN_BY_ID: ReadonlyMap<string, SkinDef> = new Map(
  SKINS.map((s) => [s.id, s]),
);

export const HAT_BY_ID: ReadonlyMap<string, HatDef> = new Map(
  HATS.map((h) => [h.id, h]),
);

export function getSkinById(id: string): SkinDef | undefined {
  return SKIN_BY_ID.get(id);
}

export function getHatById(id: string): HatDef | undefined {
  return HAT_BY_ID.get(id);
}
