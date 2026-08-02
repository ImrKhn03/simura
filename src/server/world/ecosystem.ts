import type { Kin, WorldObject } from '../../shared/types.ts';
import { dist } from './world.ts';

export const ECOSYSTEM_RADIUS = Object.freeze({ preyFear: 4, predatorFire: 4, predatorHunt: 12, strike: 1, companion: 3 });
export const WEAPON_WORD = /spear|bow|arrow|axe|blade|knife|club|sling/i;

export type CreatureFamily = 'fish' | 'hoofed' | 'small-game' | 'fowl' | 'wolf' | 'great-cat';
export type CreatureActivity = 'swimming' | 'fleeing' | 'grazing' | 'foraging' | 'kept' | 'prowling' | 'hunting' | 'lunging' | 'fleeing-fire';

export interface CreaturePresentation {
  species: string;
  family: CreatureFamily;
  young: boolean;
  kept: boolean;
  activity: CreatureActivity;
  activityPhrase: string;
  threatenedKinIds: string[];
  lore: string | null;
}

const creatureKind = (object: WorldObject): boolean => object.kind === 'fish' || object.kind === 'deer' || object.kind === 'fowl' || object.kind === 'predator';

export function creatureFamily(object: WorldObject): CreatureFamily {
  if (object.kind === 'fish') return 'fish';
  if (object.kind === 'fowl') return 'fowl';
  if (object.kind === 'predator') return /lion|cat|cougar|puma/i.test(object.name) ? 'great-cat' : 'wolf';
  return /hare|rabbit/i.test(object.name) ? 'small-game' : 'hoofed';
}

function threatenedByPredator(
  predator: WorldObject,
  kin: Kin[],
  fires: WorldObject[],
  heldByKin: (kinId: string) => WorldObject[],
): string[] {
  return kin.filter((person) => {
    if (person.status === 'dead' || dist(person.pos, predator.pos) > ECOSYSTEM_RADIUS.strike) return false;
    const accompanied = kin.some((other) => other.id !== person.id && other.status !== 'dead' && dist(other.pos, person.pos) <= ECOSYSTEM_RADIUS.companion);
    const armed = heldByKin(person.id).some((held) => WEAPON_WORD.test(held.name));
    const protectedByFire = fires.some((fire) => dist(fire.pos, person.pos) <= ECOSYSTEM_RADIUS.predatorFire);
    return !accompanied && !armed && !protectedByFire;
  }).map((person) => person.id);
}

export function presentCreature(
  object: WorldObject,
  all: WorldObject[],
  kin: Kin[],
  heldByKin: (kinId: string) => WorldObject[],
): CreaturePresentation | null {
  if (!creatureKind(object)) return null;
  const fires = all.filter((candidate) => candidate.emitsLight);
  const predators = all.filter((candidate) => candidate.kind === 'predator');
  const landPrey = all.filter((candidate) => candidate.kind === 'deer' || candidate.kind === 'fowl');
  const young = /\byoung\b/i.test(object.name);
  const kept = object.kind !== 'fish' && /\bkept\b/i.test(object.name);
  let activity: CreatureActivity;
  if (object.kind === 'predator') {
    const nearFire = fires.some((fire) => dist(fire.pos, object.pos) <= ECOSYSTEM_RADIUS.predatorFire);
    const quarry = landPrey.slice().sort((a, b) => dist(a.pos, object.pos) - dist(b.pos, object.pos))[0];
    activity = nearFire ? 'fleeing-fire' : quarry && dist(quarry.pos, object.pos) <= ECOSYSTEM_RADIUS.strike ? 'lunging'
      : quarry && dist(quarry.pos, object.pos) <= ECOSYSTEM_RADIUS.predatorHunt ? 'hunting' : 'prowling';
  } else {
    const afraid = [...kin.filter((person) => person.status !== 'dead'), ...predators]
      .some((threat) => dist(threat.pos, object.pos) <= ECOSYSTEM_RADIUS.preyFear);
    activity = afraid ? 'fleeing' : kept ? 'kept' : object.kind === 'fish' ? 'swimming' : object.kind === 'deer' ? 'grazing' : 'foraging';
  }
  const phrases: Record<CreatureActivity, string> = {
    swimming: 'moving through the water', fleeing: 'fleeing from danger', grazing: 'grazing warily', foraging: 'pecking and foraging',
    kept: 'staying close to its keepers', prowling: 'prowling at the wild edge', hunting: 'following nearby prey', lunging: 'striking at its quarry',
    'fleeing-fire': 'drawing back from fire',
  };
  return {
    species: object.name.replace(/^an?\s+/, ''), family: creatureFamily(object), young, kept, activity,
    activityPhrase: phrases[activity],
    threatenedKinIds: object.kind === 'predator' ? threatenedByPredator(object, kin, fires, heldByKin) : [],
    lore: object.loreDiscovered ? object.lore : null,
  };
}

export function presentCreatures(objects: WorldObject[], kin: Kin[], heldByKin: (kinId: string) => WorldObject[]): WorldObject[] {
  return objects.map((object) => {
    const creature = presentCreature(object, objects, kin, heldByKin);
    return creature ? { ...object, creature } : object;
  });
}
