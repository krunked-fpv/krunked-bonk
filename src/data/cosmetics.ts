import type { HatDef, SkinDef } from '../contracts/index';

/**
 * Full Wave 2 Cosmetics Catalog — 42 Character Skins (2 per character across all 21 heroes)
 * plus all 8 wearable 3D Hats.
 */
export const SKINS: readonly SkinDef[] = Object.freeze([
  // Fox
  { id: 'skin_fox_ember', characterId: 'Fox', displayName: 'Ember Fox', primaryColorHex: '#f06a24', accentColorHex: '#fff0d6' },
  { id: 'skin_fox_frost', characterId: 'Fox', displayName: 'Arctic Fox', primaryColorHex: '#e0f2fe', accentColorHex: '#38bdf8', unlockQuestId: 'quest_kill_100' },
  // Calcium
  { id: 'skin_calcium_classic', characterId: 'Calcium', displayName: 'Classic Bones', primaryColorHex: '#ede6d3', accentColorHex: '#ff4d6d' },
  { id: 'skin_calcium_neon', characterId: 'Calcium', displayName: 'Kickflip Neon', primaryColorHex: '#d8b4fe', accentColorHex: '#22d3ee', unlockQuestId: 'quest_shrines_5' },
  // SirOofie
  { id: 'skin_siroofie_steel', characterId: 'SirOofie', displayName: 'Royal Steel', primaryColorHex: '#8d99ae', accentColorHex: '#d90429' },
  { id: 'skin_siroofie_gilded', characterId: 'SirOofie', displayName: 'Gilded Paladin', primaryColorHex: '#fbbf24', accentColorHex: '#fef08a', unlockQuestId: 'quest_defeat_lil_bark' },
  // Cl4nk
  { id: 'skin_cl4nk_cobalt', characterId: 'Cl4nk', displayName: 'Cobalt Bot', primaryColorHex: '#60a5fa', accentColorHex: '#fde047' },
  { id: 'skin_cl4nk_chrome', characterId: 'Cl4nk', displayName: 'Hyper Chrome', primaryColorHex: '#e2e8f0', accentColorHex: '#22d3ee', unlockQuestId: 'quest_unlock_cl4nk' },
  // Megachad
  { id: 'skin_megachad_gold', characterId: 'Megachad', displayName: 'Golden Flex', primaryColorHex: '#ffb703', accentColorHex: '#fb8500' },
  { id: 'skin_megachad_obsidian', characterId: 'Megachad', displayName: 'Obsidian Titan', primaryColorHex: '#334155', accentColorHex: '#c084fc', unlockQuestId: 'quest_megacrit_first' },
  // Ogre
  { id: 'skin_ogre_moss', characterId: 'Ogre', displayName: 'Swamp Moss', primaryColorHex: '#65a30d', accentColorHex: '#a16207' },
  { id: 'skin_ogre_magma', characterId: 'Ogre', displayName: 'Magma Bruiser', primaryColorHex: '#991b1b', accentColorHex: '#fb923c', unlockQuestId: 'quest_unlock_ogre' },
  // Robinette
  { id: 'skin_robinette_forest', characterId: 'Robinette', displayName: 'Sherwood Green', primaryColorHex: '#16a34a', accentColorHex: '#facc15' },
  { id: 'skin_robinette_royal', characterId: 'Robinette', displayName: 'Gilded Vault', primaryColorHex: '#f59e0b', accentColorHex: '#fef3c7', unlockQuestId: 'quest_unlock_robinette' },
  // Athena
  { id: 'skin_athena_bronze', characterId: 'Athena', displayName: 'Aegis Bronze', primaryColorHex: '#f59e0b', accentColorHex: '#fef3c7' },
  { id: 'skin_athena_valkyrie', characterId: 'Athena', displayName: 'Valkyrie Ivory', primaryColorHex: '#f8fafc', accentColorHex: '#38bdf8', unlockQuestId: 'quest_unlock_athena' },
  // Birdo
  { id: 'skin_birdo_sky', characterId: 'Birdo', displayName: 'Sky Glider', primaryColorHex: '#38bdf8', accentColorHex: '#fb923c' },
  { id: 'skin_birdo_sunset', characterId: 'Birdo', displayName: 'Sunset Wing', primaryColorHex: '#f43f5e', accentColorHex: '#fde047', unlockQuestId: 'quest_unlock_birdo' },
  // Bush
  { id: 'skin_bush_pine', characterId: 'Bush', displayName: 'Pine Ghillie', primaryColorHex: '#22c55e', accentColorHex: '#14532d' },
  { id: 'skin_bush_autumn', characterId: 'Bush', displayName: 'Autumn Hedge', primaryColorHex: '#ea580c', accentColorHex: '#facc15', unlockQuestId: 'quest_unlock_bush' },
  // Bandit
  { id: 'skin_bandit_slate', characterId: 'Bandit', displayName: 'Shadow Cloak', primaryColorHex: '#475569', accentColorHex: '#ef4444' },
  { id: 'skin_bandit_crimson', characterId: 'Bandit', displayName: 'Blood Hood', primaryColorHex: '#7f1d1d', accentColorHex: '#f8fafc', unlockQuestId: 'quest_unlock_bandit' },
  // Monke
  { id: 'skin_monke_jungle', characterId: 'Monke', displayName: 'Jungle Shades', primaryColorHex: '#92400e', accentColorHex: '#facc15' },
  { id: 'skin_monke_albino', characterId: 'Monke', displayName: 'Yeti Primate', primaryColorHex: '#f1f5f9', accentColorHex: '#38bdf8', unlockQuestId: 'quest_unlock_monke' },
  // Noelle
  { id: 'skin_noelle_glacier', characterId: 'Noelle', displayName: 'Glacier Robe', primaryColorHex: '#7dd3fc', accentColorHex: '#e0f2fe' },
  { id: 'skin_noelle_aurora', characterId: 'Noelle', displayName: 'Aurora Frost', primaryColorHex: '#818cf8', accentColorHex: '#34d399', unlockQuestId: 'quest_unlock_noelle' },
  // TonyMcZoom
  { id: 'skin_tony_cyber', characterId: 'TonyMcZoom', displayName: 'Cyber Hover', primaryColorHex: '#22d3ee', accentColorHex: '#f472b6' },
  { id: 'skin_tony_volt', characterId: 'TonyMcZoom', displayName: 'Volt Streak', primaryColorHex: '#facc15', accentColorHex: '#38bdf8', unlockQuestId: 'quest_unlock_tony' },
  // Amog
  { id: 'skin_amog_spore', characterId: 'Amog', displayName: 'Toxic Spore', primaryColorHex: '#84cc16', accentColorHex: '#a855f7' },
  { id: 'skin_amog_crimson', characterId: 'Amog', displayName: 'Toadstool Red', primaryColorHex: '#ef4444', accentColorHex: '#fef2f2', unlockQuestId: 'quest_unlock_amog' },
  // Spaceman
  { id: 'skin_spaceman_lunar', characterId: 'Spaceman', displayName: 'Lunar Suit', primaryColorHex: '#f8fafc', accentColorHex: '#818cf8' },
  { id: 'skin_spaceman_nebula', characterId: 'Spaceman', displayName: 'Nebula Void', primaryColorHex: '#312e81', accentColorHex: '#f472b6', unlockQuestId: 'quest_unlock_spaceman' },
  // Ninja
  { id: 'skin_ninja_midnight', characterId: 'Ninja', displayName: 'Midnight Shinobi', primaryColorHex: '#1e293b', accentColorHex: '#f43f5e' },
  { id: 'skin_ninja_ghost', characterId: 'Ninja', displayName: 'White Lotus', primaryColorHex: '#f1f5f9', accentColorHex: '#ef4444', unlockQuestId: 'quest_unlock_ninja' },
  // Vlad
  { id: 'skin_vlad_crimson', characterId: 'Vlad', displayName: 'Crimson Count', primaryColorHex: '#991b1b', accentColorHex: '#fca5a5' },
  { id: 'skin_vlad_midnight', characterId: 'Vlad', displayName: 'Nocturne Velvet', primaryColorHex: '#3b0764', accentColorHex: '#f43f5e', unlockQuestId: 'quest_unlock_vlad' },
  // Dicehead
  { id: 'skin_dicehead_ivory', characterId: 'Dicehead', displayName: 'Ivory Pips', primaryColorHex: '#f8fafc', accentColorHex: '#dc2626' },
  { id: 'skin_dicehead_casino', characterId: 'Dicehead', displayName: 'Casino Gold', primaryColorHex: '#15803d', accentColorHex: '#facc15', unlockQuestId: 'quest_unlock_dicehead' },
  // SirChadwell
  { id: 'skin_chadwell_cursed', characterId: 'SirChadwell', displayName: 'Cursed Iron', primaryColorHex: '#312e81', accentColorHex: '#c084fc' },
  { id: 'skin_chadwell_ashen', characterId: 'SirChadwell', displayName: 'Ashen Dread', primaryColorHex: '#1f2937', accentColorHex: '#ef4444', unlockQuestId: 'quest_unlock_sirchadwell' },
  // Roberto
  { id: 'skin_roberto_specter', characterId: 'Roberto', displayName: 'Spectral Hood', primaryColorHex: '#7c3aed', accentColorHex: '#34d399' },
  { id: 'skin_roberto_gilded', characterId: 'Roberto', displayName: 'Hoarder Gold', primaryColorHex: '#d97706', accentColorHex: '#fef08a', unlockQuestId: 'quest_unlock_roberto' },
]);

export const HATS: readonly HatDef[] = Object.freeze([
  { id: 'hat_beanie', displayName: 'Skater Beanie', meshStyle: 'beanie', colorHex: '#ef4444' },
  { id: 'hat_wizard', displayName: 'Pyro Wizard Hat', meshStyle: 'wizard', colorHex: '#6366f1' },
  { id: 'hat_crown', displayName: 'Bonk Crown', meshStyle: 'crown', colorHex: '#facc15', unlockQuestId: 'quest_defeat_lil_bark' },
  { id: 'hat_halo', displayName: 'Radiant Halo', meshStyle: 'halo', colorHex: '#fef08a', unlockQuestId: 'quest_shrines_5' },
  { id: 'hat_horns', displayName: 'Demon Horns', meshStyle: 'horns', colorHex: '#dc2626', unlockQuestId: 'quest_kill_500' },
  { id: 'hat_tophat', displayName: 'Dapper Tophat', meshStyle: 'tophat', colorHex: '#1e293b', unlockQuestId: 'quest_megacrit_first' },
  { id: 'hat_visor', displayName: 'Turbo Visor', meshStyle: 'visor', colorHex: '#22d3ee', unlockQuestId: 'quest_kill_100' },
  { id: 'hat_bucket', displayName: 'Iron Bucket', meshStyle: 'bucket', colorHex: '#94a3b8', unlockQuestId: 'quest_bonker_first' },
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
