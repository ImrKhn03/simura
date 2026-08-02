import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation } from '../src/server/sim.ts';
import { perceive } from '../src/server/world/world.ts';
import { systemPrompt } from '../src/server/mind/prompt.ts';
import { SOL_TEMPERAMENT } from '../src/shared/types.ts';

describe('mortality (M5.3/M5.4 core): mortal Kin know, fade, and die', () => {
  it('a mortal Kin fades one warning-window before death, then dies with a historic event', async () => {
    const { db, cfg, ori } = testWorld();
    cfg.lifespan.fadingWarningTicks = 5; // shrink the 24h window so the test runs in ticks, not minutes
    const lifespan = cfg.lifespan.fadingWarningTicks + 3;
    const child = db.createKin({
      name: 'Ash', gender: 'sol', parentSolId: ori.id, parentLuneId: null,
      bornAtTick: 0, diedAtTick: null, immortal: false, endowmentTicks: lifespan,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
      temperament: { ...SOL_TEMPERAMENT }, pos: { x: 16, y: 16 }, status: 'alive', intention: null, coupleId: null,
    });
    const sim = new Simulation(db, cfg, new MockMind());

    // ticks 1..3 burn down to the fading threshold
    await sim.tickWorld();
    expect(db.getKin(child.id)?.status).toBe('alive');
    await sim.tickWorld(); await sim.tickWorld();
    expect(db.getKin(child.id)?.status).toBe('fading');
    // the fading Kin received the mortality realization as a top-importance memory
    const memories = db.recentMemories(child.id, 50).map((m) => m.content);
    expect(memories.some((m) => m.includes('my light is thinning'))).toBe(true);

    // burn the remaining window → death
    for (let i = 0; i < cfg.lifespan.fadingWarningTicks; i++) await sim.tickWorld();
    const after = db.getKin(child.id)!;
    expect(after.status).toBe('dead');
    expect(after.diedAtTick).not.toBeNull();
    const death = db.recentEvents(400).find((e) => e.verb === 'death');
    expect(death?.historic).toBe(true);
    // survivors felt the loss
    const oriMems = db.recentMemories(ori.id, 500).map((m) => m.content);
    expect(oriMems.some((m) => m.includes('Ash is gone'))).toBe(true);
    // the dead do not think: no further events from Ash after death
    const deathId = death!.id;
    await sim.tickWorld();
    expect(db.eventsSince(deathId).every((e) => e.actorKinId !== child.id)).toBe(true);
  }, 30_000);

  it('mortal Kin know their finitude from birth; founders are never told they fade', () => {
    const { db, cfg, ori } = testWorld();
    const child = db.createKin({
      name: 'Ash', gender: 'sol', parentSolId: ori.id, parentLuneId: null,
      bornAtTick: 0, diedAtTick: null, immortal: false, endowmentTicks: 100,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
      temperament: { ...SOL_TEMPERAMENT }, pos: { x: 16, y: 16 }, status: 'alive', intention: null, coupleId: null,
    });
    expect(systemPrompt(child, ['move'])).toContain('your light is finite');
    expect(systemPrompt(ori, ['move'])).not.toContain('your light is finite');
    expect(perceive(db, cfg, child, 1).text).toContain('your light is not endless');
    expect(perceive(db, cfg, ori, 1).text).not.toContain('not endless');
  });

  it('a fading Kin is perceived as fading by others', () => {
    const { db, cfg, ori } = testWorld();
    const child = db.createKin({
      name: 'Ash', gender: 'lune', parentSolId: ori.id, parentLuneId: null,
      bornAtTick: 0, diedAtTick: null, immortal: false, endowmentTicks: 10,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY',
      temperament: { ...SOL_TEMPERAMENT }, pos: { x: ori.pos.x + 1, y: ori.pos.y }, status: 'alive', intention: null, coupleId: null,
    });
    db.setKinStatus(child.id, 'fading');
    expect(perceive(db, cfg, ori, 1).text).toContain('they are fading');
  });

  it('immortal founders never burn endowment', async () => {
    const { db, cfg, ori } = testWorld();
    const sim = new Simulation(db, cfg, new MockMind());
    for (let i = 0; i < 5; i++) await sim.tickWorld();
    expect(db.getKin(ori.id)?.status).toBe('alive');
    expect(db.getKin(ori.id)?.endowmentTicks).toBe(0); // untouched, irrelevant while immortal
  });
});
