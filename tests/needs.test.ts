/** Needs & scarcity: hunger/eating, depletion, consumption, the drive loop. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb, availableVerbs } from '../src/server/world/verbs.ts';
import { perceive } from '../src/server/world/world.ts';
import type { WorldDB } from '../src/server/db.ts';
import type { Kin } from '../src/shared/types.ts';

const makeItem = (db: WorldDB, kin: Kin, name: string) =>
  db.createObject({ kind: 'gathered', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: kin.id });

describe('hunger & eating', () => {
  it('eat is innate; eating consumes the food and restores fullness', () => {
    expect(availableVerbs(0)).toContain('eat');
    const { db, cfg, ori } = testWorld();
    db.setFullness(ori.id, 30); ori.fullness = 30;
    const fish = makeItem(db, ori, 'fresh fish');
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'eat', params: {} });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true); // first meal in history
    expect(db.getObject(fish.id)).toBeNull(); // eaten
    expect(db.getKin(ori.id)!.fullness).toBeGreaterThan(60);
  });

  it('nothing to eat is a felt dead end that points at food sources', () => {
    const { db, cfg, ori } = testWorld();
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'eat', params: {} });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('berries');
  });

  it('hunger is felt in perception; a meal quiets it', () => {
    const { db, cfg, ori } = testWorld();
    db.setFullness(ori.id, 20); ori.fullness = 20;
    expect(perceive(db, cfg, ori, 5).text).toMatch(/Hunger gnaws/);
    db.setFullness(ori.id, 90); ori.fullness = 90;
    expect(perceive(db, cfg, ori, 6).text).not.toMatch(/Hunger gnaws|starving/i);
  });
});

describe('scarcity', () => {
  it('rooted things deplete: a tree gives only a few times, then is a spent stump', () => {
    const { db, cfg, ori } = testWorld();
    const tree = db.createObject({ kind: 'tree', name: 'tree', description: '', pos: { ...ori.pos }, creatorKinId: null, createdAtTick: 0, textContent: null, lore: 'x', loreDiscovered: false });
    for (let i = 0; i < 4; i++) {
      const r = executeVerb(db, cfg, ori, 2 + i, { thought: '', verb: 'gather', params: { targetId: tree.id, what: `branch ${i}` } });
      expect(r.ok).toBe(true);
      // hands fill up (limit 2) — set gathered pieces down to keep testing the tree
      for (const h of db.heldInHands(ori.id)) db.setCarried(h.id, null, ori.pos);
    }
    expect(db.getObject(tree.id)!.yieldLeft).toBe(0);
    const spent = executeVerb(db, cfg, ori, 9, { thought: '', verb: 'gather', params: { targetId: tree.id, what: 'one more' } });
    expect(spent.ok).toBe(false);
    expect(spent.detail).toContain('given all it had');
  });

  it('crafting consumes raw materials but never food', () => {
    const { db, cfg, ori } = testWorld();
    const { godUnlockEra } = require('../src/server/world/eras.ts') as typeof import('../src/server/world/eras.ts');
    godUnlockEra(db, 1, 1);
    const branch = makeItem(db, ori, 'dry branch');
    const fish = makeItem(db, ori, 'fresh fish');
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'walking staff', description: 'a branch smoothed by hand' } });
    expect(r.ok).toBe(true);
    expect(db.getObject(branch.id)).toBeNull(); // used up
    expect(db.getObject(fish.id)).not.toBeNull(); // food is never building material
  });
});
