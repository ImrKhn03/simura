import type { WorldConfig } from '../config.ts';
import type { WorldDB } from '../db.ts';
import type { Kin, KinPresentation, PublicKinSnapshot, WorldPresentation } from '../../shared/types.ts';
import { CALAMITY_LINE, currentCalamity } from './calamity.ts';
import { dist, lifeStage, moodOf } from './world.ts';

interface KinFacts {
  profession: KinPresentation['profession']; renown: string | null; notoriety: string | null;
  wealth: number; lineage: string; knownTo: number; clothed: boolean;
}

function batchFacts(db: WorldDB, kin: Kin[]): Map<string, KinFacts> {
  const objects = db.listObjects(); const byId = new Map(kin.map((person) => [person.id, person]));
  const eventRows = db.db.prepare(`SELECT actor_kin_id id,
    SUM(verb='heal' AND detail LIKE '%tended%') healed,
    SUM(verb='gather' AND detail LIKE '%caught%') hunted,
    SUM(verb='theft') thefts, SUM(historic=1) historic
    FROM events WHERE actor_kin_id IS NOT NULL GROUP BY actor_kin_id`).all() as unknown as
    { id: string; healed: number; hunted: number; thefts: number; historic: number }[];
  const objectRows = db.db.prepare(`SELECT creator_kin_id id,
    SUM(kind IN ('crafted','structure')) made, SUM(kind='text') wrote
    FROM world_objects WHERE creator_kin_id IS NOT NULL GROUP BY creator_kin_id`).all() as unknown as
    { id: string; made: number; wrote: number }[];
  const teachRows = db.db.prepare(`SELECT teacher_kin_id id, SUM(success=1) taught FROM teach_log GROUP BY teacher_kin_id`).all() as unknown as { id: string; taught: number }[];
  const skillRows = db.db.prepare(`SELECT owner_kin_id id, COUNT(*) skills FROM skillfiles GROUP BY owner_kin_id`).all() as unknown as { id: string; skills: number }[];
  const events = new Map(eventRows.map((row) => [row.id, row])); const made = new Map(objectRows.map((row) => [row.id, row]));
  const taught = new Map(teachRows.map((row) => [row.id, row.taught])); const skills = new Map(skillRows.map((row) => [row.id, row.skills]));
  const affection = db.listAffection();
  const lineage = (person: Kin): string => {
    let current: Kin | undefined = person; const seen = new Set<string>();
    while (current && (current.parentSolId || current.parentLuneId) && !seen.has(current.id)) {
      seen.add(current.id); current = (current.parentSolId ? byId.get(current.parentSolId) : undefined) ?? (current.parentLuneId ? byId.get(current.parentLuneId) : undefined);
    }
    return current?.name ?? person.name;
  };
  return new Map(kin.map((person): [string, KinFacts] => {
    const event = events.get(person.id); const work = made.get(person.id);
    const madeCount = work?.made ?? 0; const wrote = work?.wrote ?? 0; const taughtCount = taught.get(person.id) ?? 0; const skillCount = skills.get(person.id) ?? 0;
    const strengths: [number, NonNullable<KinPresentation['profession']>][] = [[event?.healed ?? 0, 'healer'], [madeCount, 'maker'], [taughtCount * 2, 'teacher'], [wrote * 2, 'historian'], [event?.hunted ?? 0, 'hunter']];
    strengths.sort((a, b) => b[0] - a[0]); const profession = strengths[0]![0] >= 4 ? strengths[0]![1] : null;
    const historic = event?.historic ?? 0; const total = madeCount + wrote * 2 + taughtCount * 2 + skillCount + historic;
    const renownStrengths: [number, string][] = [[wrote * 2 + skillCount, 'a keeper of knowledge and histories'], [taughtCount * 2, 'a teacher whose craft lives in others'], [madeCount, 'a great maker, whose hands shaped much of this world'], [historic, "a doer of firsts, whose name marks the world's history"]];
    renownStrengths.sort((a, b) => b[0] - a[0]); const renown = total < 6 ? null : `known across the world as ${renownStrengths[0]![1]}`;
    const thefts = event?.thefts ?? 0; const notoriety = thefts >= 3 ? 'a known thief, watched warily; their word and name carry a stain' : thefts >= 1 ? 'remembered for once taking what was not given' : null;
    const containers = new Set(objects.filter((object) => object.carriedBy === person.id).map((object) => object.id));
    const wealth = objects.filter((object) => /\b(gold|golden|silver|gem|gems|gemstone|jewel|jewell?ed|gilded|coin|coins|token|tokens|currency|mint|minted|shilling|bead-money)\b/i.test(object.name)
      && (object.carriedBy === person.id || (object.storedIn !== null && containers.has(object.storedIn)))).length;
    const known = new Set<string>();
    for (const bond of affection) if (bond.score > 0) { if (bond.kinA === person.id) known.add(bond.kinB); if (bond.kinB === person.id) known.add(bond.kinA); }
    for (const other of kin) if (other.id !== person.id && (other.parentSolId === person.id || other.parentLuneId === person.id || person.parentSolId === other.id || person.parentLuneId === other.id)) known.add(other.id);
    return [person.id, { profession, renown, notoriety, wealth, lineage: lineage(person), knownTo: known.size,
      clothed: objects.some((object) => object.carriedBy === person.id && object.worn) }];
  }));
}

function personalityOf(kin: Kin): string {
  const t = kin.temperament;
  const first = t.explorationDrive >= 0.62 ? 'drawn toward the unknown' : 'drawn toward what can be tended and understood';
  const second = t.memoryDepth >= 0.62 ? 'holds experience deeply' : 'meets each moment with a quick, searching mind';
  const craft = t.authorAffinity >= t.refineAffinity ? 'often begins new ways' : 'often deepens what others have begun';
  return `${first}, ${second}, and ${craft}`;
}

function presentKinFromFacts(db: WorldDB, cfg: WorldConfig, kin: Kin, tick: number, allKin: Kin[], facts: KinFacts): KinPresentation {
  const partner = kin.coupleId ? allKin.find((other) => other.id !== kin.id && other.coupleId === kin.coupleId) : null;
  const partnerNear = !!partner && dist(partner.pos, kin.pos) <= 3;
  const mood = moodOf(kin, tick, partnerNear);
  const stage = lifeStage(kin, tick, cfg);
  const age = Math.max(0, tick - kin.bornAtTick);
  const span = Math.max(1, cfg.lifespan.childEndowmentTicks);
  const lifeProgress = kin.immortal ? 0.5 : Math.min(1, age / span);
  const sick = kin.sickUntil !== null && kin.sickUntil > tick;
  const asleep = kin.asleepUntil !== null && kin.asleepUntil > tick;
  const fulfilled = kin.lastFulfilledTick > 0 && tick - kin.lastFulfilledTick <= 20;
  const restless = tick - kin.lastFulfilledTick > 120;
  const worn = facts.clothed;
  const wealth = facts.wealth;
  const profession = facts.profession;
  const renown = facts.renown;
  const notoriety = facts.notoriety;
  const stagePhrase = kin.immortal ? 'an enduring founder' : stage === 'infant' ? 'newly come into the world'
    : stage === 'child' ? 'young and still growing' : stage === 'elder' ? 'an elder of the people' : 'grown into their full years';
  const conditionLine = kin.status === 'fading' ? 'their light is thinning'
    : sick ? 'pale with sickness' : kin.health <= 30 ? 'badly hurt and moving carefully'
      : kin.fullness <= 20 ? 'gaunt with hunger' : kin.weariness >= 82 ? 'spent with weariness'
        : asleep ? 'sleeping deeply' : mood >= 78 ? 'bright with gladness' : mood <= 30 ? 'held low by despair'
          : mood <= 45 ? 'quiet and heavy-hearted' : 'steady in body and spirit';
  const identity = [profession ? `a practiced ${profession}` : null, renown, notoriety].filter(Boolean).join('; ')
    || (kin.immortal ? 'one of the first people' : `of ${facts.lineage}’s line`);
  const gestation = Math.max(1, cfg.lifespan.gestationTicks ?? Math.round(cfg.day.lengthTicks * 1.5));
  const starRemaining = kin.starRisesAt === null ? null : Math.max(0, kin.starRisesAt - tick) / gestation;
  return {
    mood: mood / 100, vitality: Math.max(0, Math.min(1, kin.health / 100)),
    moodBand: mood >= 78 ? 'glad' : mood <= 30 ? 'despair' : mood <= 45 ? 'low' : 'steady',
    lifeStage: stage, lifeProgress, lifePhrase: stagePhrase,
    fundedLife: kin.immortal ? null : Math.max(0, Math.min(1, kin.endowmentTicks / span)),
    fundedLifePhrase: kin.immortal ? 'an enduring light' : kin.status === 'fading' ? 'their remaining light burns very low'
      : kin.endowmentTicks / span < 0.25 ? 'their funded years are drawing short' : 'their life still holds time',
    personality: personalityOf(kin), profession, renown, notoriety, wealthValue: wealth,
    wealthBand: wealth >= 5 ? 'wealthy' : wealth >= 1 ? 'comfortable' : 'little',
    lineage: facts.lineage, conditionLine, identityLine: identity,
    starPhrase: starRemaining === null ? null : starRemaining > 0.66 ? 'a new light has only just kindled within'
      : starRemaining > 0.33 ? 'the carried star is growing' : 'the carried star will rise before long',
    knownTo: facts.knownTo, founder: kin.immortal, adopted: !!kin.modelEndpoint,
    flags: { asleep, fading: kin.status === 'fading', sick, hungry: kin.fullness <= 35, weary: kin.weariness >= 70,
      carryingStar: kin.starRisesAt !== null, bonded: !!kin.coupleId, clothed: worn, fulfilled, restless },
  };
}

const presentationCache = new WeakMap<WorldDB, { tick: number; map: Map<string, KinPresentation> }>();
export function buildKinPresentations(db: WorldDB, cfg: WorldConfig, tick: number): Map<string, KinPresentation> {
  const cached = presentationCache.get(db); if (cached?.tick === tick) return cached.map;
  const kin = db.listKin(); const facts = batchFacts(db, kin);
  const map = new Map(kin.map((person) => [person.id, presentKinFromFacts(db, cfg, person, tick, kin, facts.get(person.id)!)]));
  presentationCache.set(db, { tick, map }); return map;
}

export function presentKin(db: WorldDB, cfg: WorldConfig, kin: Kin, tick: number): KinPresentation {
  return buildKinPresentations(db, cfg, tick).get(kin.id)!;
}

/** Explicit copy: adding a persisted Kin field never publishes it by accident. */
export function toPublicKin(kin: Kin, presentation: KinPresentation): PublicKinSnapshot {
  return {
    id: kin.id,
    name: kin.name,
    gender: kin.gender,
    parentSolId: kin.parentSolId,
    parentLuneId: kin.parentLuneId,
    bornAtTick: kin.bornAtTick,
    diedAtTick: kin.diedAtTick,
    immortal: kin.immortal,
    pos: { ...kin.pos },
    status: kin.status,
    intention: kin.intention,
    plan: kin.plan ? [...kin.plan] : null,
    asleepUntil: kin.asleepUntil,
    coupleId: kin.coupleId,
    fullness: kin.fullness,
    health: kin.health,
    weariness: kin.weariness,
    sickUntil: kin.sickUntil,
    lastFulfilledTick: kin.lastFulfilledTick,
    starRisesAt: kin.starRisesAt,
    starWithId: kin.starWithId,
    presentation,
  };
}

function dayPart(phase: number): WorldPresentation['dayPart'] {
  if (phase < 0.09 || phase >= 0.94) return 'dawn';
  if (phase < 0.43) return 'day';
  if (phase < 0.58) return 'dusk';
  return 'night';
}

function seasonAt(cfg: WorldConfig, tick: number, era: number): WorldPresentation['season'] {
  if (era < 7) return null;
  const phase = (((tick + (cfg.day.offsetTicks ?? 0)) % (cfg.day.lengthTicks * 240))
    + cfg.day.lengthTicks * 240) % (cfg.day.lengthTicks * 240) / (cfg.day.lengthTicks * 240);
  return phase < 0.25 ? 'spring' : phase < 0.5 ? 'summer' : phase < 0.75 ? 'autumn' : 'winter';
}

export function worldPresentation(
  db: WorldDB,
  cfg: WorldConfig,
  tick: number,
  era: number,
  phase: number,
): WorldPresentation {
  const calamity = currentCalamity(db, tick);
  const duration = calamity ? Math.max(1, calamity.until - calamity.began) : 1;
  const remaining = calamity ? Math.max(0, Math.min(1, (calamity.until - tick) / duration)) : 0;
  const remainingTicks = calamity ? calamity.until - tick : 0;
  const remainingPhrase = remainingTicks > cfg.day.lengthTicks
    ? 'more than a day may yet pass'
    : remainingTicks > cfg.day.lengthTicks * 0.45
      ? 'about a day may yet pass'
      : 'its passing draws near';
  const precious = /\b(gold|golden|silver|gem|gems|gemstone|jewel|jewell?ed|gilded|coin|coins|token|tokens|currency|mint|minted|shilling|bead-money)\b/i;
  const objects = db.listObjects();
  const kin = db.listKin(true);
  const physicalCurrency = objects.filter((object) => precious.test(object.name)).length;
  const views = buildKinPresentations(db, cfg, tick);
  const holders = kin.map((person) => {
    const amount = views.get(person.id)?.wealthValue ?? 0;
    return {
      name: person.name,
      amount,
      standing: amount >= 5 ? 'holds a deep store of prized things' : amount >= 1 ? 'keeps something others prize' : 'holds little counted as wealth',
    };
  }).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const recentTrades = db.recentEvents(160)
    .filter((event) => event.verb === 'trade' || event.verb === 'accept_trade')
    .slice(0, 8).map((event) => event.detail);
  const living = kin.filter((person) => person.status !== 'dead').length;
  const foodWord = /\b(fish|venison|meat|berr\w*|fruit|root|bread|stew|mushroom|egg|nut|grain|honey|meal|food)\b/i;
  const foodCount = objects.filter((object) => foodWord.test(object.name)
    && (object.kind === 'gathered' || object.kind === 'crafted' || object.yieldLeft === null || object.yieldLeft > 0)).length;
  const predators = objects.filter((object) => object.kind === 'predator').length;
  return {
    calamity: calamity ? {
      kind: calamity.kind,
      line: CALAMITY_LINE[calamity.kind],
      remaining,
      remainingPhrase,
    } : null,
    dayPart: dayPart(phase),
    season: seasonAt(cfg, tick, era),
    economy: {
      physicalCurrency,
      currencyPhrase: physicalCurrency === 0 ? 'no minted or precious exchange pieces yet exist'
        : physicalCurrency === 1 ? 'one physical piece of lasting value exists'
          : `${physicalCurrency} physical pieces of lasting value exist`,
      holders,
      recentTrades,
    },
    worldHealth: {
      living,
      populationPhrase: living === 0 ? 'no Kin remain alive' : living === 1 ? 'one life carries the world' : `${living} lives carry the world`,
      foodCount,
      foodPhrase: foodCount === 0 ? 'little ready food can be found'
        : foodCount <= Math.max(1, living) ? 'food stores are thin'
          : foodCount <= Math.max(2, living * 3) ? 'food is holding steady' : 'food is plentiful for now',
      predators,
      predatorPhrase: predators === 0 ? 'no predators are roaming' : predators === 1 ? 'one predator is roaming' : `${predators} predators are roaming`,
      calamityPhrase: calamity ? CALAMITY_LINE[calamity.kind] : 'no great calamity grips the land',
      eraPhrase: `the world is living through Era ${era}`,
    },
  };
}
