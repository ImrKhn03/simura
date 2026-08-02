/** The body & inner life: health, sickness, weariness, mood, healing; and social depth: rivalry, renown. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb, availableVerbs } from '../src/server/world/verbs.ts';
import { perceive, renownOf } from '../src/server/world/world.ts';
import type { WorldDB } from '../src/server/db.ts';
import type { Kin } from '../src/shared/types.ts';

const held = (db: WorldDB, kin: Kin, name: string) =>
  db.createObject({ kind: 'gathered', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: kin.id });

describe('the body is felt', () => {
  it('heal is innate; sickness and hurt and weariness surface in perception', () => {
    expect(availableVerbs(0)).toContain('heal');
    const { db, cfg, ori } = testWorld();
    db.setSickUntil(ori.id, 500); ori.sickUntil = 500;
    db.setHealth(ori.id, 20); ori.health = 20;
    db.setWeariness(ori.id, 90); ori.weariness = 90;
    const t = perceive(db, cfg, db.getKin(ori.id)!, 5).text;
    expect(t).toMatch(/sickness burns in you/);
    expect(t).toMatch(/body is failing/);
    expect(t).toMatch(/deep weariness/);
  });

  it('mood reads high when whole & fed, low when broken', () => {
    const { db, cfg, ori } = testWorld();
    db.setHealth(ori.id, 100); db.setFullness(ori.id, 100); db.setWeariness(ori.id, 0);
    db.setLastFulfilled(ori.id, 5);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 6).text).toMatch(/lightness is in you|feel well/);
    db.setHealth(ori.id, 10); db.setFullness(ori.id, 10); db.setWeariness(ori.id, 95);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 7).text).toMatch(/grey heaviness/);
  });

  it('tending mends the hurt; a herb makes it stronger and is consumed', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    db.setHealth(vey.id, 30); vey.health = 30;
    db.setSickUntil(vey.id, 800);
    const herb = held(db, ori, 'healing herb');
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'heal', params: { toKinName: 'Vey' } });
    expect(r.ok).toBe(true);
    expect(db.getKin(vey.id)!.health).toBeGreaterThan(30);
    expect(db.getObject(herb.id)).toBeNull(); // herb consumed
    expect(db.getKin(vey.id)!.sickUntil!).toBeLessThan(800); // illness shortened
  });
});

describe('social depth', () => {
  it('renown is earned from real deeds, and perceived by others', () => {
    const { db, ori } = testWorld();
    expect(renownOf(db, db.getKin(ori.id)!)).toBe(''); // unknown at first
    // do renowned things: make, write, teach
    for (let i = 0; i < 6; i++) db.createObject({ kind: 'crafted', name: `thing${i}`, description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    expect(renownOf(db, db.getKin(ori.id)!)).toMatch(/great maker/);
  });

  it('affection can sour into a felt rivalry', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    db.addAffection(ori.id, vey.id, -(cfg.affection.friend + 5), -100); // a deliberate wrong
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/bad blood between you/);
  });
});
