/** Society & life-stages: age gates adult acts, professions emerge, theft is a felt wrong. */
import { describe, expect, it } from 'vitest';
import { testWorld, makeChild } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { lifeStage, professionOf, perceive } from '../src/server/world/world.ts';

describe('life stages', () => {
  it('a mortal grows infant → child → adult → elder; founders are eternal adults', () => {
    const { db, cfg, ori, vey } = testWorld();
    const child = makeChild(db, cfg, ori, vey, 1000, 'Sona');
    const life = cfg.lifespan.childEndowmentTicks;
    expect(lifeStage(child, 1000, cfg)).toBe('infant');
    expect(lifeStage(child, 1000 + Math.floor(life * 0.1), cfg)).toBe('child');
    expect(lifeStage(child, 1000 + Math.floor(life * 0.5), cfg)).toBe('adult');
    expect(lifeStage(child, 1000 + Math.floor(life * 0.9), cfg)).toBe('elder');
    expect(lifeStage(db.getKin(ori.id)!, 999999, cfg)).toBe('adult'); // founder, immortal
  });

  it('a child is too young to bond; grown Kin may', () => {
    const { db, cfg, ori, vey } = testWorld();
    const child = makeChild(db, cfg, ori, vey, 5, 'Sona');
    // another young child to propose to
    const child2 = makeChild(db, cfg, ori, vey, 6, 'Ilo');
    db.moveKin(child2.id, { ...child.pos });
    db.addAffection(child.id, child2.id, cfg.affection.love + 10);
    const r = executeVerb(db, cfg, db.getKin(child.id)!, 10, { thought: '', verb: 'propose_bond', params: { toKinName: 'Ilo' } });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not yet grown|still a child/);
  });
});

describe('professions & crime', () => {
  it('a healer emerges from tending and heals better', () => {
    const { db, ori } = testWorld();
    expect(professionOf(db, db.getKin(ori.id)!)).toBeNull();
    for (let i = 0; i < 5; i++) db.addEvent({ tick: i, actorKinId: ori.id, verb: 'heal', targetId: null, detail: 'tended someone', thought: null, historic: false });
    expect(professionOf(db, db.getKin(ori.id)!)).toBe('healer');
  });

  it('taking another living Kin\'s made work is a felt wrong that sours affection', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { x: 30, y: 30 }); vey.pos = { x: 30, y: 30 }; // Vey is a stranger, elsewhere
    // Vey made something; Ori finds it and takes it
    const made = db.createObject({ kind: 'crafted', name: 'a carved bowl', description: '', pos: { ...ori.pos }, creatorKinId: vey.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const before = db.affection(vey.id, ori.id);
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'carry', params: { targetId: made.id } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/made by another|not given/);
    expect(db.affection(vey.id, ori.id)).toBeLessThan(before); // bad blood begins
    expect(db.recentMemories(vey.id, 3).some((m) => m.content.includes('took'))).toBe(true);
  });
});
