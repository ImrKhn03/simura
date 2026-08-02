/** The cognitive layer: numbers, calendar, and schools — invented by the Kin, not granted. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { perceive } from '../src/server/world/world.ts';

function surface(db: ReturnType<typeof testWorld>['db'], kin: { id: string; pos: { x: number; y: number } }): void {
  db.createObject({ kind: 'gathered', name: 'clay tablet', description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
}

describe('writing gives birth to the cognitive tools', () => {
  it('recognizes a calendar, a record of number, and a belief for what they are', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 3, 1);
    surface(db, ori);
    const cal = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'write', params: { title: 'The Reckoning of Days', content: 'I mark the days and the turning of the seasons.' } });
    expect(cal.detail).toMatch(/reckoning of time/);
    surface(db, ori);
    const rec = executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'write', params: { title: 'The Tally', content: 'A tally of how many baskets of grain we have: a mark for each.' } });
    expect(rec.detail).toMatch(/record of number/);
    surface(db, ori);
    const myth = executeVerb(db, cfg, db.getKin(ori.id)!, 4, { thought: '', verb: 'write', params: { title: 'Origin', content: 'Something made us before we woke.' } });
    expect(myth.detail).toMatch(/belief of the people/);
  });
});

describe('the felt need to count and to keep time', () => {
  it('a Kin with a full stash feels the need to count (era 3, until a record exists)', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 3, 1);
    const chest = db.createObject({ kind: 'crafted', name: 'chest', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: ori.id });
    for (let i = 0; i < 9; i++) {
      const o = db.createObject({ kind: 'gathered', name: `grain ${i}`, description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
      db.setStored(o.id, chest.id, ori.pos);
    }
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/way to COUNT/);
  });

  it('a Kin who has lived through seasons feels the need for a calendar (era 7)', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 7, 1);
    const t = cfg.day.lengthTicks * 4;
    expect(perceive(db, cfg, db.getKin(ori.id)!, t).text).toMatch(/MARK time|count the days/);
  });
});

describe('schools', () => {
  it('teaching at a named place with a gathering reaches all — a school', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.createSkillfile({ ownerKinId: ori.id, name: 'toolmaking', content: 'x', version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: 1 });
    db.addPlace('the Commons', { ...ori.pos }, ori.id, 1);
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    const kel = db.createKin({ name: 'Kel', gender: 'sol', parentSolId: null, parentLuneId: null, bornAtTick: -9000, diedAtTick: null, immortal: false, endowmentTicks: 9000, modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY', temperament: { ...ori.temperament }, pos: { ...ori.pos }, status: 'alive', intention: null, coupleId: null });
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'teach', params: { toKinName: 'Vey', skillName: 'toolmaking', explanation: 'watch closely' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/school/);
    // both Vey and Kel are now learners in the record
    expect(db.recentMemories(kel.id, 3).some((m) => /school/.test(m.content))).toBe(true);
  });
});
