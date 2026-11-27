import type { CharacterDef, CharacterId } from '../contracts/index';

/**
 * Wave 1 Flagship Playable Characters (4) — exact retail-calibrated base stat deltas & passives.
 * `baseStats` holds additive deltas applied onto `createBaseStatBlock()` in `recalculatePlayerStats`.
 * Structured cleanly for Wave 2 expansion to all 21 playable characters.
 */
export const CHARACTERS: readonly CharacterDef[] = Object.freeze([
  {
    id: 'Fox',
    displayName: 'Fox',
    title: 'Lucky Pyromancer',
    description: 'Nimble fire-wielding trickster blessed with soaring Luck and wide pickup magnetism.',
    startingWeaponId: 'WeaponFireStaff',
    colliderScale: 1.0,
    paletteKey: 'char_fox',
    primaryColorHex: '#f06a24',
    accentColorHex: '#fff0d6',
    unlockedByDefault: true,
    baseStats: {
      JumpHeight: 1,
      Evasion: 0.05,
      Luck: 0.15,
      PickupRange: 4,
      MoveSpeed: 0.04,
    },
    passive: {
      id: 'RngBlessing',
      name: 'RNG Blessing',
      description: 'Gain +2% Luck every level, bending rarities, crits, and drops in your favor.',
      perLevelMods: [
        { stat: 'Luck', flat: 0.02, sourceId: 'passive:RngBlessing' },
      ],
      specialFlags: ['rng_blessing'],
    },
  },
  {
    id: 'Calcium',
    displayName: 'Calcium',
    title: 'Skater Skeleton',
    description: 'High-velocity shredder who builds blistering speed and kinetic bonus damage while on the move.',
    startingWeaponId: 'WeaponBone',
    colliderScale: 1.0,
    paletteKey: 'char_calcium',
    primaryColorHex: '#ede6d3',
    accentColorHex: '#ff4d6d',
    unlockedByDefault: true,
    baseStats: {
      MoveSpeed: 0.15,
      JumpHeight: 1.5,
      PickupRange: 3,
    },
    passive: {
      id: 'SpeedDemon',
      name: 'Speed Demon',
      description: 'Builds momentum over time up to +50% Move Speed and +40% bonus damage; taking a hit halves your speed meter.',
      specialFlags: ['speed_demon'],
    },
  },
  {
    id: 'SirOofie',
    displayName: 'Sir Oofie',
    title: 'Ironclad Knight',
    description: 'Stalwart armored frontline bruiser who shrugs off swarms with ever-growing steel plating.',
    startingWeaponId: 'WeaponSword',
    colliderScale: 1.05,
    paletteKey: 'char_siroofie',
    primaryColorHex: '#8d99ae',
    accentColorHex: '#d90429',
    unlockedByDefault: true,
    baseStats: {
      MoveSpeed: -0.02,
      MaxHealth: 50,
      Armor: 0.15,
    },
    passive: {
      id: 'Reinforced',
      name: 'Reinforced',
      description: 'Gain +3% Armor every level, hardening your defenses as hordes intensify.',
      perLevelMods: [
        { stat: 'Armor', flat: 0.03, sourceId: 'passive:Reinforced' },
      ],
      specialFlags: ['reinforced'],
    },
  },
  {
    id: 'Megachad',
    displayName: 'Megachad',
    title: 'Absolute Unit',
    description: 'Towering powerhouse whose periodic Flex blocks incoming damage, blasts enemies back, and surges damage.',
    startingWeaponId: 'WeaponAura',
    colliderScale: 1.45,
    paletteKey: 'char_megachad',
    primaryColorHex: '#ffb703',
    accentColorHex: '#fb8500',
    unlockedByDefault: true,
    baseStats: {
      MoveSpeed: -0.05,
      JumpHeight: 1,
      MaxHealth: 20,
    },
    passive: {
      id: 'Flex',
      name: 'Flex',
      description: 'Periodically flexes to block incoming hits, unleash a huge knockback shockwave, and gain +35% damage. Cooldown scales down per level.',
      specialFlags: ['flex'],
    },
  },
]);

export const CHARACTER_BY_ID: ReadonlyMap<CharacterId, CharacterDef> = new Map(
  CHARACTERS.map((c) => [c.id, c]),
);

export function getCharacterById(id: CharacterId): CharacterDef | undefined {
  return CHARACTER_BY_ID.get(id);
}
