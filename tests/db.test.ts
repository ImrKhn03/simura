import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';

describe('WorldDB + genesis (M0.2)', () => {
  it('creates two immortal founders with null parents and correct temperaments', () => {
    const { db, ori, vey } = testWorld();
    expect(ori.immortal).toBe(true);
    expect(ori.parentSolId).toBeNull();
    expect(ori.temperament.explorationDrive).toBeGreaterThan(vey.temperament.explorationDrive);
    expect(vey.temperament.memoryDepth).toBeGreaterThan(ori.temperament.memoryDepth);
    const back = db.getKin(ori.id);
    expect(back?.name).toBe('Ori');
    expect(back?.temperament).toEqual(ori.temperament);
  });

  it('genesis logs historic awakening events and seeds the village', () => {
    const { db } = testWorld();
    expect(db.listKin()).toHaveLength(2);
    const events = db.recentEvents(10);
    expect(events.filter((e) => e.verb === 'awaken' && e.historic)).toHaveLength(2);
    expect(db.currentEra()).toBe(0);
    expect(db.listObjects().length).toBeGreaterThan(20); // seeded nature
  });

  it('persists and advances the tick counter', () => {
    const { db } = testWorld();
    expect(db.getTick()).toBe(0);
    db.setTick(41);
    db.setTick(42);
    expect(db.getTick()).toBe(42);
  });

  it('event log is append-only and queryable by cursor', () => {
    const { db, ori } = testWorld();
    const e1 = db.addEvent({ tick: 1, actorKinId: ori.id, verb: 'speak', targetId: null, detail: 'hello', thought: 't', historic: false });
    db.addEvent({ tick: 2, actorKinId: ori.id, verb: 'move', targetId: null, detail: 'moved', thought: null, historic: false });
    const since = db.eventsSince(e1.id);
    expect(since).toHaveLength(1);
    expect(since[0]?.verb).toBe('move');
  });

  it('memories store and recall by importance', () => {
    const { db, vey } = testWorld();
    db.addMemory(vey.id, 1, 'observation', 'a tree', 2);
    db.addMemory(vey.id, 2, 'reflection', 'the big one', 9);
    for (let i = 3; i < 30; i++) db.addMemory(vey.id, i, 'action', `step ${i}`, 3);
    const important = db.importantMemories(vey.id, 3, 20);
    // genesis awakening memory (importance 10) ranks first; 'the big one' (9) next
    expect(important.map((m) => m.content)).toContain('the big one');
    expect(important.map((m) => m.content)).not.toContain('step 5');
  });
});
