import type { QuestDef } from '../contracts/index';

export const QUESTS: readonly QuestDef[] = Object.freeze([
  {
    id: 'quest_kill_100',
    displayName: 'First Blood',
    description: 'Defeat 100 monsters across runs.',
    metricKey: 'totalKills',
    targetValue: 100,
    rewardSilver: 15,
    unlocks: {
      skinId: 'skin_fox_frost',
      hatId: 'hat_visor',
    },
  },
  {
    id: 'quest_kill_500',
    displayName: 'Horde Breaker',
    description: 'Defeat 500 monsters across runs.',
    metricKey: 'totalKills',
    targetValue: 500,
    rewardSilver: 35,
    unlocks: {
      mapId: 'Graveyard',
      hatId: 'hat_horns',
    },
  },
  {
    id: 'quest_shrines_5',
    displayName: 'Shrine Seeker',
    description: 'Complete 5 Charge Shrines across runs.',
    metricKey: 'shrinesCompleted',
    targetValue: 5,
    rewardSilver: 20,
    unlocks: {
      skinId: 'skin_calcium_neon',
      hatId: 'hat_halo',
    },
  },
  {
    id: 'quest_defeat_lil_bark',
    displayName: 'Timber!',
    description: 'Defeat Lil Bark in the Green Forest.',
    metricKey: 'bossesKilled',
    targetValue: 1,
    rewardSilver: 50,
    unlocks: {
      mapId: 'Desert',
      skinId: 'skin_siroofie_gilded',
      hatId: 'hat_crown',
    },
  },
  {
    id: 'quest_megacrit_first',
    displayName: 'Forked Fury',
    description: 'Land a 4x+ Megacrit hit.',
    metricKey: 'megacritsLanded',
    targetValue: 1,
    rewardSilver: 25,
    unlocks: {
      skinId: 'skin_megachad_obsidian',
      hatId: 'hat_tophat',
    },
  },
  {
    id: 'quest_bonker_first',
    displayName: 'MEGA BONK!',
    description: 'Trigger a colossal 20x Bonker proc.',
    metricKey: 'bonkersLanded',
    targetValue: 1,
    rewardSilver: 30,
    unlocks: {
      hatId: 'hat_bucket',
    },
  },
]);

export const QUEST_BY_ID: ReadonlyMap<string, QuestDef> = new Map(
  QUESTS.map((q) => [q.id, q]),
);

export function getQuestById(id: string): QuestDef | undefined {
  return QUEST_BY_ID.get(id);
}
