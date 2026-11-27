import type { GameCatalog } from '../contracts/index';
import { CHALLENGES, CHALLENGE_BY_ID, getChallengeById } from './challenges';
import { CHARACTERS, CHARACTER_BY_ID, getCharacterById } from './characters';
import { HATS, HAT_BY_ID, SKINS, SKIN_BY_ID, getHatById, getSkinById } from './cosmetics';
import { ENEMIES, ENEMY_BY_ID, getEnemyById } from './enemies';
import { INTERACTABLES, INTERACTABLE_BY_KIND, getInteractableByKind } from './interactables';
import { ITEMS, ITEM_BY_ID, getItemById } from './items';
import { MAPS, MAP_BY_ID, STAGE_TIMELINES, getMapById, type StageTimelineEventDef } from './maps';
import { QUESTS, QUEST_BY_ID, getQuestById } from './quests';
import { SHOP_UPGRADES, SHOP_UPGRADE_BY_ID, getShopUpgradeById, getShopUpgradeCost } from './shop';
import { TOMES, TOME_BY_ID, getTomeById } from './tomes';
import { WEAPONS, WEAPON_BY_ID, getWeaponById } from './weapons';

/**
 * Unified read-only KRUNKEDBONK Wave 1 GameCatalog & fast O(1) ID lookup maps.
 */
export const GAME_CATALOG: Readonly<GameCatalog> = Object.freeze({
  characters: CHARACTERS,
  weapons: WEAPONS,
  tomes: TOMES,
  items: ITEMS,
  enemies: ENEMIES,
  maps: MAPS,
  interactables: INTERACTABLES,
  shopUpgrades: SHOP_UPGRADES,
  challenges: CHALLENGES,
  skins: SKINS,
  hats: HATS,
  quests: QUESTS,
});

export {
  CHARACTERS,
  CHARACTER_BY_ID,
  getCharacterById,
  WEAPONS,
  WEAPON_BY_ID,
  getWeaponById,
  TOMES,
  TOME_BY_ID,
  getTomeById,
  ITEMS,
  ITEM_BY_ID,
  getItemById,
  ENEMIES,
  ENEMY_BY_ID,
  getEnemyById,
  MAPS,
  MAP_BY_ID,
  STAGE_TIMELINES,
  getMapById,
  INTERACTABLES,
  INTERACTABLE_BY_KIND,
  getInteractableByKind,
  SHOP_UPGRADES,
  SHOP_UPGRADE_BY_ID,
  getShopUpgradeById,
  getShopUpgradeCost,
  CHALLENGES,
  CHALLENGE_BY_ID,
  getChallengeById,
  SKINS,
  SKIN_BY_ID,
  getSkinById,
  HATS,
  HAT_BY_ID,
  getHatById,
  QUESTS,
  QUEST_BY_ID,
  getQuestById,
};

export type { StageTimelineEventDef };
