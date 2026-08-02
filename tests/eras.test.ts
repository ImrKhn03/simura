import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { evaluateEras, godUnlockEra } from '../src/server/world/eras.ts';

describe('era engine (M2.4)', () => {
  it('era 1 needs BOTH named things and an expressed want', () => {
    const { db, cfg, ori } = testWorld();
    const objects = db.listObjects().slice(0, cfg.eras.making.namedThings);
    for (const [i, o] of objects.entries()) db.nameThing(ori.id, o.id, `thing-${i}`, 1);
    expect(evaluateEras(db, cfg, 10)).toBeNull(); // named, but no want yet
    db.logWant(ori.id, 11, 'I wish we had shelter.');
    expect(evaluateEras(db, cfg, 11)).toBe(1);
    expect(db.currentEra()).toBe(1);
    // unlock fires exactly once and is historic
    expect(evaluateEras(db, cfg, 12)).toBeNull();
    const unlock = db.recentEvents(5).find((e) => e.verb === 'era_unlocked');
    expect(unlock?.historic).toBe(true);
  });

  it('eras unlock sequentially through 4; era 5 never unlocks by achievement', () => {
    const { db, cfg, ori, vey } = testWorld();
    // brute-force satisfy everything
    const objects = db.listObjects();
    for (const [i, o] of objects.entries()) db.nameThing(ori.id, o.id, `n${i}`, 1);
    db.logWant(ori.id, 1, 'we need things');
    for (let i = 0; i < cfg.eras.building.craftedObjects; i++) {
      db.createObject({ kind: 'crafted', name: `c${i}`, description: '', pos: { x: 1, y: 1 }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    }
    const sk = db.createSkillfile({ ownerKinId: ori.id, name: 'making', content: 'x', version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: 1 });
    for (let i = 0; i < cfg.eras.building.skillfileRefinedCount; i++) db.refineSkillfile(sk.id, `v${i}`);
    for (let i = 0; i < cfg.eras.letters.successfulTeaches; i++) db.logTeach(1, ori.id, vey.id, sk.id, true);
    // Era 3 (repaired): writing arises when spoken memory FAILS — 6+ repetition walls
    for (let i = 0; i < 6; i++) {
      db.addEvent({ tick: 1, actorKinId: ori.id, verb: 'speak', targetId: null, detail: 'you began to say it again — the words are already spoken and already heard.', thought: null, historic: false });
    }
    for (let i = 0; i < cfg.eras.hearth.writtenTexts; i++) {
      db.createObject({ kind: 'text', name: `t${i}`, description: '', pos: { x: 1, y: 1 }, creatorKinId: vey.id, createdAtTick: 1, textContent: 'history', lore: null, loreDiscovered: false });
    }
    for (let i = 0; i < cfg.eras.hearth.structures; i++) {
      db.createObject({ kind: 'structure', name: `s${i}`, description: '', pos: { x: 1, y: 1 }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    }
    // eras unlock sequentially — but an epoch must be LIVED (cooldown), so we space
    // the evaluations far apart in time; no cascading many eras in a few ticks
    expect(evaluateEras(db, cfg, 2)).toBe(1);
    expect(evaluateEras(db, cfg, 3)).toBeNull();           // cooldown: era 2 can't dawn seconds after era 1
    expect(evaluateEras(db, cfg, 400)).toBe(2);
    expect(evaluateEras(db, cfg, 800)).toBe(3);
    expect(evaluateEras(db, cfg, 1200)).toBe(4);
    expect(db.currentEra()).toBe(4);
  });

  it('The Net (era 16) never unlocks by achievement, only by god', () => {
    const { db, cfg } = testWorld();
    for (let e = 1; e <= 15; e++) godUnlockEra(db, e, e * 400); // stand at Era 15 by god's hand
    expect(db.currentEra()).toBe(15);
    expect(evaluateEras(db, cfg, 100000)).toBeNull(); // no threshold opens The Net
    expect(db.currentEra()).toBe(15);
  });

  it('god override unlocks with trigger god', () => {
    const { db, cfg } = testWorld();
    godUnlockEra(db, 5, 100);
    expect(db.listEras().find((e) => e.era === 5)?.trigger).toBe('god');
    void cfg;
  });
});
