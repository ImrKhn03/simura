import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { moodOf } from '../src/server/world/world.ts';
import { buildKinPresentations, presentKin, worldPresentation } from '../src/server/world/presentation.ts';

describe('server-authored Kin presentation', () => {
  it('uses the mechanics mood formula and exact human bands', () => {
    const { db, cfg, ori } = testWorld();
    ori.fullness = 100; ori.health = 100; ori.weariness = 0; ori.lastFulfilledTick = 5;
    db.setFullness(ori.id, 100); db.setHealth(ori.id, 100); db.setWeariness(ori.id, 0); db.setLastFulfilled(ori.id, 5);
    expect(moodOf(ori, 10, true)).toBe(94);
    expect(presentKin(db, cfg, ori, 10).moodBand).toBe('glad');
    ori.fullness = 0; ori.health = 10; ori.weariness = 100; ori.sickUntil = 50; ori.lastFulfilledTick = 0;
    db.setFullness(ori.id, 0); db.setHealth(ori.id, 10); db.setWeariness(ori.id, 100); db.setSickUntil(ori.id, 50); db.setLastFulfilled(ori.id, 0);
    expect(moodOf(ori, 20, false)).toBe(0);
    expect(presentKin(db, cfg, ori, 20).moodBand).toBe('despair');
  });

  it('speaks body, identity, personality, mortality, and social facts without developer vocabulary', () => {
    const { db, cfg, ori } = testWorld();
    const view = presentKin(db, cfg, ori, 20);
    const text = [view.lifePhrase, view.fundedLifePhrase, view.personality, view.conditionLine, view.identityLine, view.starPhrase].join(' ');
    expect(text).not.toMatch(/fullness|sickUntil|lifeStage|endowmentTicks|explorationDrive|authorAffinity|modelName|apiKey|\(-?\d+,/i);
    expect(view.fundedLife).toBeNull();
    expect(view.fundedLifePhrase).toContain('enduring');
    expect(view.personality).toMatch(/drawn|holds|begins|deepens/);
  });

  it('batches an expanded population within the presenter budget', () => {
    const { db, cfg, ori } = testWorld();
    for (let i = 0; i < 80; i++) db.createKin({ ...ori, id: undefined, name: `Kin ${i}`, immortal: false, bornAtTick: 0, modelEndpoint: '', modelName: '', apiKeyRef: 'TEST_KEY' });
    const began = performance.now(); const views = buildKinPresentations(db, cfg, 101); const elapsed = performance.now() - began;
    expect(views.size).toBe(82);
    // Standalone reference is ~3.2 ms; leave headroom for Vitest's fully parallel CPU load.
    expect(elapsed).toBeLessThan(100);
  });

  it('authors disclosed economy depth from physical objects and real exchanges', () => {
    const { db, cfg, ori } = testWorld();
    db.createObject({ kind: 'crafted', name: 'a minted silver coin', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: ori.id });
    db.addEvent({ tick: 4, actorKinId: ori.id, verb: 'trade', targetId: null, detail: 'Ori offered a silver coin for a woven basket.', thought: null, historic: false });
    const economy = worldPresentation(db, cfg, 5, 10, .2).economy!;
    expect(economy.physicalCurrency).toBe(1);
    expect(economy.holders[0]).toMatchObject({ name: 'Ori', amount: 1 });
    expect(economy.recentTrades[0]).toContain('offered');
    expect(JSON.stringify(economy)).not.toMatch(/kin-ori|actor_kin_id|storedIn|carriedBy/);
  });
});
