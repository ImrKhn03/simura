import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { createEmbedder, embedLocal, cosine } from '../src/server/embeddings.ts';
import { memoryDigestSemantic } from '../src/server/mind/memory.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation } from '../src/server/sim.ts';

describe('semantic memory (vector recall)', () => {
  it('local embeddings put related texts closer than unrelated ones', () => {
    const cave1 = embedLocal('the cave mouth breathes cold air from deep in the earth');
    const cave2 = embedLocal('standing at the dark cave opening, air moving out of the earth');
    const flower = embedLocal('a delicate pink flower blooms near the water');
    expect(cosine(cave1, cave2)).toBeGreaterThan(cosine(cave1, flower));
  });

  it('recall is situational: at the cave, the cave memory beats higher-importance noise', async () => {
    const { db, cfg, ori } = testWorld();
    const embedder = createEmbedder(); // local (no EMBED_API_BASE in tests)

    // an old, low-importance cave memory…
    db.addMemory(ori.id, 1, 'observation', 'I found the cave mouth: air moves out of it like breath, it goes deeper than sight.', 4);
    // …buried under many high-importance unrelated memories
    for (let i = 0; i < 20; i++) {
      db.addMemory(ori.id, 2 + i, 'action', `I refined the weaving skill with Vey near the flowers (${i})`, 9);
    }
    // and a fresh short-term window on top
    for (let i = 0; i < cfg.memory.shortTermWindow; i++) {
      db.addMemory(ori.id, 30 + i, 'action', `I walked and spoke of ordinary things (${i})`, 3);
    }
    // embed everything
    const sim = new Simulation(db, cfg, new MockMind(), embedder);
    await sim.tickWorld();

    const digest = await memoryDigestSemantic(db, cfg, ori, embedder,
      'You stand before the cave mouth. Cold air breathes out of the dark opening in the earth.');
    const contents = digest.map((m) => m.content);
    expect(contents.some((c) => c.includes('cave mouth: air moves out'))).toBe(true);
  });

  it('falls back gracefully when nothing is embedded yet', async () => {
    const { db, cfg, vey } = testWorld();
    const embedder = createEmbedder();
    db.addMemory(vey.id, 1, 'reflection', 'THE-FIRST-DAWN', 10);
    for (let i = 0; i < 30; i++) db.addMemory(vey.id, 2 + i, 'action', `mundane ${i}`, 3);
    // no embedPending ran — importance recall must still work
    const digest = await memoryDigestSemantic(db, cfg, vey, embedder, 'anything at all');
    expect(digest.some((m) => m.content.includes('THE-FIRST-DAWN'))).toBe(true);
  });

  it('the embedding pipeline back-fills old memories batch by batch', async () => {
    const { db, cfg, ori } = testWorld();
    for (let i = 0; i < 10; i++) db.addMemory(ori.id, i, 'action', `memory ${i}`, 3);
    expect(db.unembeddedMemories(100).length).toBeGreaterThanOrEqual(10);
    const sim = new Simulation(db, cfg, new MockMind(), createEmbedder());
    await sim.tickWorld();
    // one tick embedded a whole batch
    expect(db.unembeddedMemories(100).length).toBeLessThanOrEqual(2); // just this tick's newest
  });
});
