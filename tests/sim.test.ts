import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation } from '../src/server/sim.ts';

describe('simulation end to end (M2.5 / Genesis dry-run)', () => {
  it('two Kin live 300 ticks: world advances, events accrue, era 1 unlocks organically', async () => {
    const { db, cfg } = testWorld();
    const sim = new Simulation(db, cfg, new MockMind());
    let eraUnlockedAt: number | null = null;
    for (let i = 0; i < 300; i++) {
      const { tick, eraUnlocked } = await sim.tickWorld();
      if (eraUnlocked === 1) eraUnlockedAt = tick;
    }
    expect(db.getTick()).toBe(300);
    const snap = sim.snapshot();
    expect(snap.kin.length).toBeGreaterThanOrEqual(2); // founders — plus any children born along the way
    expect(snap.recentEvents.length).toBeGreaterThan(0);
    // The mock minds name things and express wants — The Making should dawn.
    expect(db.currentEra()).toBeGreaterThanOrEqual(1);
    expect(eraUnlockedAt).not.toBeNull();
    // both minds formed memories and at least one authored a skill
    const stats = sim.stats();
    for (const s of stats) expect(s.memoryCount).toBeGreaterThanOrEqual(50); // echo-compression trims dupes; ~50+ = a full inner life
    expect(stats.some((s) => s.skillfileCount > 0)).toBe(true);
  }, 30_000);

  it('snapshot shape is complete for the UI', async () => {
    const { db, cfg } = testWorld();
    const sim = new Simulation(db, cfg, new MockMind());
    await sim.tickWorld();
    const snap = sim.snapshot();
    expect(snap).toHaveProperty('tick', 1);
    expect(snap).toHaveProperty('era');
    expect(snap.objects.length).toBeGreaterThan(0);
    expect(snap.kin[0]).toHaveProperty('pos');
    expect(snap.kin[0]).not.toHaveProperty('temperament');
    expect(snap.kin[0]).not.toHaveProperty('apiKeyRef');
    expect(snap).toHaveProperty('presentation');
    void db;
  });
});
