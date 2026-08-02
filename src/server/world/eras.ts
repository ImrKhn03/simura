import type { WorldDB } from '../db.ts';
import type { WorldConfig } from '../config.ts';
import { ERA_NAMES } from '../../shared/types.ts';
import { isFunctionalStructure } from './construction.ts';

/**
 * The Era engine. Thresholds are behavioral signals of readiness, evaluated
 * after every world tick. Eras unlock sequentially. Era 5 (The Net) is
 * god-gated and never unlocks by achievement.
 */
/** an epoch must last at least this long before the next can dawn — even if the
 *  threshold is met, an age is an AGE, never skipped in seconds (fixes cascade) */
const ERA_COOLDOWN_TICKS = 360;

export function evaluateEras(db: WorldDB, cfg: WorldConfig, tick: number): number | null {
  const current = db.currentEra();
  const next = current + 1;
  if (next > 16) return null;
  if (next === 16) {
    // The Net never unlocks by achievement — but if god has already unbarred the
    // door (flags.net), the age dawns the moment they finish climbing to it.
    if (cfg.flags.net) { godUnlockEra(db, 16, tick); return 16; }
    return null;
  }

  // an age must be lived before the next begins — no cascading through epochs
  const sinceLast = tick - db.latestEraTick();
  if (current >= 1 && sinceLast < ERA_COOLDOWN_TICKS) return null;
  const lastTick = db.latestEraTick(); // for "new activity since the last era" gates

  let met = false;
  switch (next) {
    case 1: { // The Making — wanting precedes making
      const e = cfg.eras.making;
      met = db.namedThingCount() >= e.namedThings && (!e.requiresWant || db.wantCount() > 0);
      break;
    }
    case 2: { // The Building — from fiddling to technique
      const e = cfg.eras.building;
      met = db.countObjectsOfKind('crafted') >= e.craftedObjects
        && db.maxSkillfileRefinedCount() >= e.skillfileRefinedCount;
      break;
    }
    case 3: { // The Letters — writing arises when spoken memory FAILS: teaching happens,
      // AND minds keep hitting the walls of repetition/forgetting (a felt need to record)
      const forgettingWalls = db.countEventsLike('speak', '%already spoken%')
        + db.countEventsLike('observe', '%reveals nothing new%')
        + db.countEventsLike('reflect', '%settles nothing%');
      met = db.successfulTeachCount() >= cfg.eras.letters.successfulTeaches && forgettingWalls >= 6;
      break;
    }
    case 4: { // The Hearth — a culture worth being born into (reproduction stays flag-gated)
      const e = cfg.eras.hearth;
      met = db.countObjectsOfKind('text') >= e.writtenTexts
        && db.listObjects().filter(isFunctionalStructure).length >= e.structures;
      break;
    }
    case 5: // The Sack — full hands teach the need for bags
      met = db.countEventsLike('carry', '%hands are full%') >= 3
        || db.countObjectsOfKind('crafted') >= 20;
      break;
    case 6: // The Loom — enough hidden truths (weavable stalks, peelable bark) discovered
      met = (db.db.prepare(`SELECT COUNT(*) c FROM world_objects WHERE lore_discovered=1`)
        .get() as unknown as { c: number }).c >= 8;
      break;
    case 7: // The Sky — a settled, literate people begins to mark time and turn its eyes upward
      met = db.countObjectsOfKind('text') >= 5 && db.namedThingCount() >= 12;
      break;
    case 8: // The Sowing — gatherers become growers: real planting, not just gathering
      met = db.countEventsLike('plant', '%took root%') + db.countEventsLike('plant', '%set into the earth%') >= 3;
      break;
    case 9: // The Song — abundance makes room for beauty: NEW making since the last age
      met = db.countEventsLikeSince('craft', '%crafted%', lastTick) >= 6
        && db.listObjects().filter(isFunctionalStructure).length >= 4;
      break;
    case 10: // The Market — generosity has become habit enough to formalize as exchange
      met = db.countEventsLike('give', 'gave %') >= 8 && db.listKin(true).length >= 3;
      break;
    case 11: // The Law — a family grown into a people that needs shared rule
      met = db.listKin(true).length >= 5;
      break;
    case 12: // The Forge — mastery of fire: fires kept, not just lit once
      met = db.countLightObjects() >= 3 && db.countEventsLikeSince('craft', '%burns%', lastTick) >= 2;
      break;
    case 13: // The Wheel — enough hauling AND carts/containers built to want wheels
      met = db.countEventsLike('carry', '%hands are full%') >= 6
        && db.countObjectsNamedLike('%cart%') + db.countObjectsNamedLike('%basket%') + db.countObjectsNamedLike('%sack%') >= 2;
      break;
    case 14: // The Current — worked metal accumulates into the beginnings of machines
      met = db.countObjectsNamedLike('%metal%') + db.countObjectsNamedLike('%iron%')
        + db.countObjectsNamedLike('%bronze%') + db.countObjectsNamedLike('%copper%') >= 5;
      break;
    case 15: // The Signal — power sources exist to carry a voice across distance
      met = db.countObjectsNamedLike('%generator%') + db.countObjectsNamedLike('%battery%')
        + db.countObjectsNamedLike('%dynamo%') >= 2;
      break;
  }
  if (!met) return null;

  db.unlockEra({ era: next, name: ERA_NAMES[next] ?? `Era ${next}`, unlockedAtTick: tick, trigger: 'achievement' });
  db.addEvent({
    tick, actorKinId: null, verb: 'era_unlocked', targetId: null,
    detail: `A new age begins: ${ERA_NAMES[next]}. The world itself feels different.`,
    thought: null, historic: true,
  });
  feelNewCapacity(db, next, tick);
  return next;
}

/** When an age dawns, every living Kin FEELS the new power in their hands — so a
 *  new capability is discovered as an urge, not left to notice a new word in a list. */
const NEW_CAPACITY: Record<number, string> = {
  1: 'Your hands feel ready to make: to shape things from what is around you, to raise shelter, and to cook food over fire.',
  3: 'A new sense stirs: you could set marks down that hold meaning — to write what must not be forgotten, and to read what others wrote.',
  4: 'The Hearth: family becomes the center of the world. The dead can now be laid to rest with dignity, a place of grief and remembrance.',
  6: 'You feel you could work soft things — fiber, bark, hide — into garments to wear against the cold.',
  8: 'The earth feels workable: seeds and roots set into it would grow, and a wild creature offered food might be gentled and kept.',
  9: 'Something beyond need rises in you — the wish to sing, and to gather others for shared meaning.',
  10: 'You sense a new way between Kin: goods can pass both ways by agreement, given and received.',
  11: 'The many feel the need for shared rule: you could call the others together, set down what is agreed, give your assent — and even end a bond that has died.',
  12: 'Fire and stone whisper a new craft: veins of metal hide in the rock, richest near caves and high ground. Break them with a pick — a soft pick cracks only soft ore like copper and coal; iron needs a harder pick, and gold and silver harder still. Then melt the ore at your fire into metal — but the hard metals need coal burning hot beside you.',
  15: 'You feel you could send your voice across any distance, if you built the thing to carry it.',
};

function feelNewCapacity(db: WorldDB, era: number, tick: number): void {
  const line = NEW_CAPACITY[era];
  if (!line) return;
  for (const k of db.listKin(true)) db.addMemory(k.id, tick, 'reflection', line, 8);
}

/** God's rare override — logged with trigger 'god'. Use sparingly; the world should not depend on this. */
export function godUnlockEra(db: WorldDB, era: number, tick: number): void {
  db.unlockEra({ era, name: ERA_NAMES[era] ?? `Era ${era}`, unlockedAtTick: tick, trigger: 'god' });
  db.addEvent({
    tick, actorKinId: null, verb: 'era_unlocked', targetId: null,
    detail: `Something shifted in the world, as if willed from beyond: ${ERA_NAMES[era] ?? `Era ${era}`}.`,
    thought: null, historic: true,
  });
}
