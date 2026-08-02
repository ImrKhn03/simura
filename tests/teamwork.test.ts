/** Teamwork physics: full hands never dead-end a gift; making uses companions' hands. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { perceive } from '../src/server/world/world.ts';
import type { WorldDB } from '../src/server/db.ts';
import type { Kin } from '../src/shared/types.ts';

const makeItem = (db: WorldDB, kin: Kin, name: string) =>
  db.createObject({ kind: 'gathered', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: kin.id });

describe('teamwork', () => {
  it('give with full hands lays the thing at their feet instead of failing', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    // fill Vey's hands (carry limit 2 before The Sack)
    makeItem(db, vey, 'stone chip');
    makeItem(db, vey, 'reed stalk');
    // Ori holds a branch and gives it anyway
    const branch = makeItem(db, ori, 'dead branch');
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'give', params: { toKinName: 'Vey', targetId: 'dead branch' } });
    expect(r.ok).toBe(true); // no dead end
    expect(r.detail).toContain('at Vey\'s feet');
    const obj = db.getObject(branch.id)!;
    expect(obj.carriedBy).toBeNull(); // on the ground…
    expect(obj.pos).toEqual(vey.pos); // …right beside Vey
  });

  it('co-craft: a companion\'s held materials are within reach — made together, both feel it', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 1, 1);
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    // Vey holds the edge and the fiber; Ori holds only the haft — no single pair
    // of hands has everything, but together they do
    makeItem(db, vey, 'sharp stone chip');
    makeItem(db, vey, 'reed stalk');
    makeItem(db, ori, 'dead branch');
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'cutting knife', description: 'a chip bound to a branch with reed' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('made together');
    expect(r.detail).toContain('Vey');
    expect(r.historic).toBe(true); // the first shared making is history
    // the helper remembers it as theirs too
    expect(db.recentMemories(vey.id, 3).some((m) => m.content.includes('together'))).toBe(true);
  });

  it('progressive building: a structure grows part by part, by anyone\'s hands', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 1, 1);
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    makeItem(db, ori, 'log'); makeItem(db, vey, 'stone slab'); // materials in reach
    // day one: Ori lays floor + posts
    const start = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'build', params: {
      name: 'the long house', description: 'a home begun',
      shape: [{ x: 0, y: 0, z: 0, w: 5, h: 0.2, d: 4, c: '#6e5a41' }, { x: -2, y: 0.2, z: -1.5, w: 0.3, h: 2.4, d: 0.3, c: '#8a5a3a' }],
    } });
    expect(start.ok).toBe(true);
    const houseId = start.targetId!;
    expect((db.getObject(houseId)!.shape as unknown[]).length).toBe(2);
    // day two: VEY (not the founder of the work) raises a wall on the same structure
    // (the first stage consumed the materials — building always costs; bring more)
    makeItem(db, vey, 'fresh timber');
    const grow = executeVerb(db, cfg, vey, 3, { thought: '', verb: 'build', params: {
      targetId: 'the long house',
      shape: [{ x: 0, y: 0.2, z: -2, w: 5, h: 2.4, d: 0.25, c: '#8a6a4a' }],
    } });
    expect(grow.ok).toBe(true);
    expect(grow.detail).toContain('raised more');
    expect((db.getObject(houseId)!.shape as unknown[]).length).toBe(3); // it grew
    // the one who began it feels other hands joining the work
    expect(db.recentMemories(ori.id, 3).some((m) => m.content.includes('growing by other hands'))).toBe(true);
  });

  it('storage: drop into a container keeps a thing; carry takes it back out', () => {
    const { db, cfg, ori } = testWorld();
    // a chest on the ground beside Ori, a stone in hand
    const chest = db.createObject({ kind: 'crafted', name: 'wooden chest', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const stone = makeItem(db, ori, 'flint stone');
    // store it
    const put = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'drop', params: { targetId: 'flint stone', into: 'chest' } });
    expect(put.ok).toBe(true);
    expect(put.detail).toContain('into the wooden chest');
    const kept = db.getObject(stone.id)!;
    expect(kept.storedIn).toBe(chest.id);
    expect(kept.carriedBy).toBeNull();
    expect(db.heldInHands(ori.id)).toHaveLength(0); // hands free
    expect(db.storedInContainer(chest.id)).toHaveLength(1);
    // perception shows the contents, not ground clutter
    const view = perceive(db, cfg, ori, 3).text;
    expect(view).toContain('wooden chest');
    expect(view).toContain('holds: "flint stone"');
    // take it back out
    const out = executeVerb(db, cfg, ori, 4, { thought: '', verb: 'carry', params: { targetId: stone.id } });
    expect(out.ok).toBe(true);
    expect(out.detail).toContain('out of the wooden chest');
    expect(db.getObject(stone.id)!.storedIn).toBeNull();
    expect(db.heldInHands(ori.id)).toHaveLength(1);
  });
});
