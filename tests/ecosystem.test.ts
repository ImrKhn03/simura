/** Living ecosystem: predators hunt prey & threaten Kin; the armed can hunt back; live creatures aren't carried. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { perceive } from '../src/server/world/world.ts';

const predator = (db: ReturnType<typeof testWorld>['db'], pos: { x: number; y: number }) =>
  db.createObject({ kind: 'predator', name: 'a grey wolf', description: '', pos, creatorKinId: null, createdAtTick: 1, textContent: null, lore: 'It fears fire.', loreDiscovered: false });

describe('predators', () => {
  it('a predator reads as danger, not a catch', () => {
    const { db, cfg, ori } = testWorld();
    predator(db, { ...ori.pos });
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/DANGER|prowls/);
  });

  it('a predator cannot be picked up like an object', () => {
    const { db, cfg, ori } = testWorld();
    const w = predator(db, { ...ori.pos });
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'carry', params: { targetId: w.id } });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/living creature/);
  });

  it('hunting a predator bare-handed hurts you; with a weapon, you bring it down', () => {
    const { db, cfg, ori } = testWorld();
    const w1 = predator(db, { ...ori.pos });
    const before = db.getKin(ori.id)!.health;
    const bare = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'gather', params: { targetId: w1.id } });
    expect(bare.ok).toBe(false);
    expect(db.getKin(ori.id)!.health).toBeLessThan(before); // mauled
    expect(db.getObject(w1.id)).not.toBeNull(); // wolf survives

    // now armed
    db.createObject({ kind: 'crafted', name: 'a stone spear', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: ori.id });
    const w2 = predator(db, { ...ori.pos });
    const kill = executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'gather', params: { targetId: w2.id } });
    expect(kill.ok).toBe(true);
    expect(kill.detail).toMatch(/brought down/);
    expect(db.getObject(w2.id)).toBeNull(); // slain
    expect(db.listObjects().some((o) => /pelt/.test(o.name))).toBe(true);
  });
});
