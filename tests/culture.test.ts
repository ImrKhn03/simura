/** Culture & meaning: play, dance, festivals, temples, and beliefs/myths — all emergent. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb, availableVerbs } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { perceive } from '../src/server/world/world.ts';

describe('expressive culture', () => {
  it('play is innate and warms bonds; dance waits for The Song (era 9)', () => {
    expect(availableVerbs(0)).toContain('play');
    expect(availableVerbs(8)).not.toContain('dance');
    expect(availableVerbs(9)).toContain('dance');
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    const before = db.affection(ori.id, vey.id);
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'play', params: { what: 'a chasing game' } });
    expect(r.ok).toBe(true);
    expect(db.affection(ori.id, vey.id)).toBeGreaterThan(before);
  });

  it('a rite at a named place with a crowd becomes a FESTIVAL', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 9, 1);
    // gather three at a named place
    db.addPlace('the Gathering-ground', { ...ori.pos }, ori.id, 1);
    const kel = db.createKin({ name: 'Kel', gender: 'sol', parentSolId: null, parentLuneId: null, bornAtTick: -9000, diedAtTick: null, immortal: false, endowmentTicks: 9000, modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY', temperament: { ...ori.temperament }, pos: { ...ori.pos }, status: 'alive', intention: null, coupleId: null });
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    void kel;
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'ritual', params: { meaning: 'thanks for the harvest' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/festival/);
    expect(db.recentMemories(vey.id, 3).some((m) => /festival/i.test(m.content))).toBe(true);
  });
});

describe('sacred & belief', () => {
  it('a temple makes prayer feel lifted and is felt as sacred ground', () => {
    const { db, cfg, ori } = testWorld();
    db.createObject({ kind: 'structure', name: 'the stone shrine', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/sacred/);
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 6, { thought: '', verb: 'pray', params: { plea: 'watch over us' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/shrine|lifted/);
  });

  it('a writing about origins & death is recognized as a belief/myth', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 3, 1);
    db.createObject({ kind: 'gathered', name: 'clay tablet', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'write', params: { title: 'The First Dawn', content: 'Something made us, before we woke. When the light goes out, where does it go?' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/belief of the people/);
  });
});
