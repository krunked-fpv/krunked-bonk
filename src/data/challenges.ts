import type { ChallengeDef } from '../contracts/index';

export const CHALLENGES: readonly ChallengeDef[] = Object.freeze([
  {
    id: 'HyperSpeed',
    displayName: 'Hyper Speed',
    description: '+35% Move Speed and +30% Enemy Speed. Pure adrenaline kinetics.',
    silverMultiplier: 1.35,
    statModifiers: [
      { stat: 'MoveSpeed', add: 0.35, sourceId: 'challenge:HyperSpeed' },
      { stat: 'SlideSpeedMultiplier', add: 0.25, sourceId: 'challenge:HyperSpeed' },
    ],
    rules: {
      speedMultiplier: 1.3,
      enemyDamageMultiplier: 1.15,
    },
  },
  {
    id: 'GlassCannon',
    displayName: 'Glass Cannon',
    description: 'Deal +60% Damage, but enemies hit twice as hard.',
    silverMultiplier: 1.5,
    statModifiers: [
      { stat: 'DamageMultiplier', mult: 0.6, sourceId: 'challenge:GlassCannon' },
    ],
    rules: {
      enemyDamageMultiplier: 2.0,
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
  {
    id: 'OneWeapon',
    displayName: 'Signature Only',
    description: 'Restricted to your starting weapon slot only.',
    silverMultiplier: 1.45,
    rules: {
      maxWeapons: 1,
    },
  },
  {
    id: 'Speedrun',
    displayName: 'Blitz Timer',
    description: 'Stage countdown runs at 2x pace (5 minutes to Final Swarm).',
    silverMultiplier: 1.3,
    rules: {
      timerScale: 0.5,
    },
  },
  {
    id: 'CursedSwarm',
    displayName: 'Cursed Swarm',
    description: '+50% Difficulty and tougher monsters for hefty Silver payouts.',
    silverMultiplier: 1.65,
    statModifiers: [
      { stat: 'Difficulty', add: 0.5, sourceId: 'challenge:CursedSwarm' },
    ],
    rules: {
      enemyHpMultiplier: 1.45,
      enemyDamageMultiplier: 1.35,
    },
  },
]);

export const CHALLENGE_BY_ID: ReadonlyMap<string, ChallengeDef> = new Map(
  CHALLENGES.map((c) => [c.id, c]),
);

export function getChallengeById(id: string): ChallengeDef | undefined {
  return CHALLENGE_BY_ID.get(id);
}
