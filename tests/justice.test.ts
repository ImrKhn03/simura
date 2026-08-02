/** Justice & polity: witnessed theft stains a name, amends heal rifts, lineage seeds clans. */
import { describe, expect, it } from 'vitest';
import { testWorld, makeChild } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { notorietyOf, lineageRootName, perceive } from '../src/server/world/world.ts';

describe('justice', () => {
  it('theft witnessed by others stains the thief\'s name (notoriety)', () => {
    const { db, cfg, ori, vey } = testWorld();
    // a third Kin to witness
    const wit = db.createKin({ name: 'Wit', gender: 'sol', parentSolId: null, parentLuneId: null, bornAtTick: -9000, diedAtTick: null, immortal: false, endowmentTicks: 9000, modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY', temperament: { ...ori.temperament }, pos: { ...ori.pos }, status: 'alive', intention: null, coupleId: null });
    db.moveKin(vey.id, { x: 40, y: 40 }); vey.pos = { x: 40, y: 40 }; // Vey (the maker) is a stranger elsewhere
    const made = db.createObject({ kind: 'crafted', name: 'a bone flute', description: '', pos: { ...ori.pos }, creatorKinId: vey.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    expect(notorietyOf(db, db.getKin(ori.id)!)).toBe('');
    executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'carry', params: { targetId: made.id } });
    // the theft is recorded and the witness remembers
    expect(notorietyOf(db, db.getKin(ori.id)!)).toMatch(/remembered/);
    expect(db.recentMemories(wit.id, 3).some((m) => m.content.includes('take'))).toBe(true);
    expect(db.affection(wit.id, ori.id)).toBeLessThan(0); // the witness's regard sours
  });

  it('a gift to one you wronged is felt as amends and heals the rift', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    db.addAffection(ori.id, vey.id, -50, -100); // bad blood
    const gift = db.createObject({ kind: 'gathered', name: 'a warm hide', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: ori.id });
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'give', params: { toKinName: 'Vey', targetId: gift.id } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/peace offering|rift begins to heal/);
    expect(db.affection(ori.id, vey.id)).toBeGreaterThan(-50); // the rift eases
  });
});

describe('clans / lineage', () => {
  it('descent traces to a founding line', () => {
    const { db, cfg, ori, vey } = testWorld();
    const child = makeChild(db, cfg, ori, vey, 100, 'Sona');
    // the child's line roots at a founder (Ori or Vey)
    expect([ori.name, vey.name]).toContain(lineageRootName(db, child));
    void cfg;
  });
});
