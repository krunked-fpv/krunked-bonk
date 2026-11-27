import type { ChallengeDef } from '../contracts/index';

/**
 * Full Wave 2 Challenge Roster (18 challenges covering all 17 iconic retail modifiers + Illiterate).
 */
export const CHALLENGES: readonly ChallengeDef[] = Object.freeze([
  {
    id: 'Hyper',
    displayName: 'Hyper',
    description: '+35% Player Speed, +35% Attack Speed, and +30% Enemy Speed for breakneck kinetic action.',
    silverMultiplier: 1.35,
    statModifiers: [
      { stat: 'MoveSpeed', add: 0.35, sourceId: 'challenge:Hyper' },
      { stat: 'AttackSpeed', add: 0.35, sourceId: 'challenge:Hyper' },
      { stat: 'SlideSpeedMultiplier', add: 0.25, sourceId: 'challenge:Hyper' },
    ],
    rules: {
      speedMultiplier: 1.3,
      enemyDamageMultiplier: 1.15,
    },
  },
  {
    id: 'ChonkMode',
    displayName: 'Chonk Mode',
    description: 'Enemies become massive, tanky bruisers with +80% HP and +30% Damage.',
    silverMultiplier: 1.45,
    statModifiers: [
      { stat: 'MaxHealth', flat: 50, sourceId: 'challenge:ChonkMode' },
      { stat: 'Knockback', add: -0.25, sourceId: 'challenge:ChonkMode' },
    ],
    rules: {
      enemyHpMultiplier: 1.8,
      enemyDamageMultiplier: 1.3,
    },
  },
  {
    id: 'Swarm',
    displayName: 'Swarm',
    description: 'Relentless monster density (+60% Difficulty) for non-stop horde-clearing mayhem.',
    silverMultiplier: 1.5,
    statModifiers: [
      { stat: 'Difficulty', flat: 0.6, sourceId: 'challenge:Swarm' },
    ],
    rules: {
      enemyHpMultiplier: 1.15,
      enemyDamageMultiplier: 1.15,
    },
  },
  {
    id: 'TheFloorIsLava',
    displayName: 'The Floor is Lava',
    description: 'Staying grounded scorches you! Chain jumps, slides, rails, and jump pads to stay airborne.',
    silverMultiplier: 1.6,
    statModifiers: [
      { stat: 'ExtraJumps', flat: 1, sourceId: 'challenge:TheFloorIsLava' },
      { stat: 'JumpHeight', add: 0.25, sourceId: 'challenge:TheFloorIsLava' },
    ],
    rules: {
      enemyDamageMultiplier: 1.15,
    },
  },
  {
    id: 'Blind',
    displayName: 'Blind',
    description: 'Dense oppressive fog shrouds the arena in near-darkness. Listen closely for threats.',
    silverMultiplier: 1.55,
    statModifiers: [
      { stat: 'Luck', flat: 0.2, sourceId: 'challenge:Blind' },
    ],
    rules: {
      enemyDamageMultiplier: 1.2,
    },
  },
  {
    id: 'Fragile',
    displayName: 'Fragile',
    description: '1 Max HP! Every hit is fatal unless dodged, blocked by Aegis/Flex, or prevented by Za Warudo.',
    silverMultiplier: 2.0,
    statModifiers: [
      { stat: 'DamageMultiplier', mult: 0.4, sourceId: 'challenge:Fragile' },
      { stat: 'Evasion', flat: 0.1, sourceId: 'challenge:Fragile' },
    ],
    rules: {
      oneHpMode: true,
      enemyDamageMultiplier: 1.5,
    },
  },
  {
    id: 'AfkGaming',
    displayName: 'AFK Gaming',
    description: 'Drastically slowed movement (-45% Move Speed) with +35% Area Size and +30% Pickup Range.',
    silverMultiplier: 1.45,
    statModifiers: [
      { stat: 'MoveSpeed', add: -0.45, sourceId: 'challenge:AfkGaming' },
      { stat: 'AreaSize', add: 0.35, sourceId: 'challenge:AfkGaming' },
      { stat: 'PickupRange', flat: 3.0, sourceId: 'challenge:AfkGaming' },
    ],
    rules: {
      enemyHpMultiplier: 1.2,
    },
  },
  {
    id: 'Minimalist',
    displayName: 'Minimalist',
    description: 'Restricted to 1 Weapon slot and zero Tomes. Pure signature weapon mastery.',
    silverMultiplier: 1.75,
    rules: {
      maxWeapons: 1,
      disableTomes: true,
      enemyHpMultiplier: 1.15,
    },
  },
  {
    id: 'SticksAndStones',
    displayName: 'Sticks and Stones',
    description: 'Restricted to 1 Weapon slot with heavy +40% Knockback and +35% Melee Damage.',
    silverMultiplier: 1.4,
    statModifiers: [
      { stat: 'Knockback', add: 0.4, sourceId: 'challenge:SticksAndStones' },
      { stat: 'MeleeDamageMultiplier', add: 0.35, sourceId: 'challenge:SticksAndStones' },
    ],
    rules: {
      maxWeapons: 1,
    },
  },
  {
    id: 'Pacifist',
    displayName: 'Pacifist',
    description: '-40% Weapon Damage, +60 Thorns, +25% Armor, and +40 Max HP. Let foes break themselves on you.',
    silverMultiplier: 1.65,
    statModifiers: [
      { stat: 'DamageMultiplier', mult: -0.4, sourceId: 'challenge:Pacifist' },
      { stat: 'Thorns', flat: 60, sourceId: 'challenge:Pacifist' },
      { stat: 'Armor', flat: 0.25, sourceId: 'challenge:Pacifist' },
      { stat: 'MaxHealth', flat: 40, sourceId: 'challenge:Pacifist' },
    ],
    rules: {
      enemyHpMultiplier: 1.1,
    },
  },
  {
    id: 'SmolBoi',
    displayName: 'Smol Boi',
    description: 'Tiny attacks (-35% Area Size) paired with +30% Evasion and +25% Move Speed.',
    silverMultiplier: 1.4,
    statModifiers: [
      { stat: 'AreaSize', add: -0.35, sourceId: 'challenge:SmolBoi' },
      { stat: 'Evasion', flat: 0.3, sourceId: 'challenge:SmolBoi' },
      { stat: 'MoveSpeed', add: 0.25, sourceId: 'challenge:SmolBoi' },
    ],
    rules: {
      enemyDamageMultiplier: 1.2,
    },
  },
  {
    id: 'WeirdControls',
    displayName: 'Weird Controls',
    description: 'Slippery high-momentum slides (+50% Slide Speed) and soaring jumps (+40% Jump Height) with wild chaos.',
    silverMultiplier: 1.5,
    statModifiers: [
      { stat: 'SlideSpeedMultiplier', add: 0.5, sourceId: 'challenge:WeirdControls' },
      { stat: 'JumpHeight', add: 0.4, sourceId: 'challenge:WeirdControls' },
      { stat: 'AirControl', add: -0.35, sourceId: 'challenge:WeirdControls' },
    ],
    rules: {
      speedMultiplier: 1.2,
    },
  },
  {
    id: 'Speedrunner',
    displayName: 'Speedrunner',
    description: 'Stage timer runs at 2x speed (5 minutes to Final Swarm) with +35% XP gain.',
    silverMultiplier: 1.4,
    statModifiers: [
      { stat: 'XpMultiplier', add: 0.35, sourceId: 'challenge:Speedrunner' },
      { stat: 'MoveSpeed', add: 0.15, sourceId: 'challenge:Speedrunner' },
    ],
    rules: {
      timerScale: 0.5,
    },
  },
  {
    id: 'Turbo',
    displayName: 'Turbo',
    description: 'Everything runs in overdrive: +50% Move & Enemy Speed, +45% Attack Speed, and compressed stage timer.',
    silverMultiplier: 1.55,
    statModifiers: [
      { stat: 'MoveSpeed', add: 0.45, sourceId: 'challenge:Turbo' },
      { stat: 'AttackSpeed', add: 0.45, sourceId: 'challenge:Turbo' },
    ],
    rules: {
      speedMultiplier: 1.5,
      timerScale: 0.7,
      enemyDamageMultiplier: 1.25,
    },
  },
  {
    id: 'Hard',
    displayName: 'Hard',
    description: 'Stepped-up combat challenge: +35% Enemy HP, +35% Enemy Damage, +25% Difficulty.',
    silverMultiplier: 1.4,
    statModifiers: [
      { stat: 'Difficulty', flat: 0.25, sourceId: 'challenge:Hard' },
    ],
    rules: {
      enemyHpMultiplier: 1.35,
      enemyDamageMultiplier: 1.35,
    },
  },
  {
    id: 'Harder',
    displayName: 'Harder',
    description: 'Brutal swarm escalation: +75% Enemy HP, +65% Enemy Damage, +50% Difficulty.',
    silverMultiplier: 1.75,
    statModifiers: [
      { stat: 'Difficulty', flat: 0.5, sourceId: 'challenge:Harder' },
    ],
    rules: {
      enemyHpMultiplier: 1.75,
      enemyDamageMultiplier: 1.65,
      speedMultiplier: 1.15,
    },
  },
  {
    id: 'Hardest',
    displayName: 'Hardest',
    description: 'Nightmare crucible: +140% Enemy HP, +110% Enemy Damage, +80% Difficulty, +25% Enemy Speed.',
    silverMultiplier: 2.25,
    statModifiers: [
      { stat: 'Difficulty', flat: 0.8, sourceId: 'challenge:Hardest' },
    ],
    rules: {
      enemyHpMultiplier: 2.4,
      enemyDamageMultiplier: 2.1,
      speedMultiplier: 1.25,
    },
  },
  {
    id: 'NoTomes',
    displayName: 'Illiterate',
    description: 'Tomes are disabled for the entire run. Rely purely on weapons, items, and shrines.',
    silverMultiplier: 1.4,
    rules: {
      disableTomes: true,
    },
  },
]);

export const CHALLENGE_BY_ID: ReadonlyMap<string, ChallengeDef> = new Map(
  CHALLENGES.map((c) => [c.id, c]),
);

export function getChallengeById(id: string): ChallengeDef | undefined {
  return CHALLENGE_BY_ID.get(id);
}
