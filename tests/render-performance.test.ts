import { describe, expect, it } from 'vitest';
import { boundedFrameDelta, budgetBreaches, RENDER_BUDGETS, serializedBytes } from '../src/web/render/performance.ts';
import { Simulation } from '../src/server/sim.ts';
import { MockMind } from '../src/server/llm.ts';
import { testWorld } from './helpers.ts';

describe('integrated render budgets', () => {
  it('keeps quality ceilings monotonic and reports exact breaches', () => {
    expect(RENDER_BUDGETS.low.calls).toBeLessThan(RENDER_BUDGETS.medium.calls); expect(RENDER_BUDGETS.high.triangles).toBeLessThan(RENDER_BUDGETS.ultra.triangles);
    expect(budgetBreaches('low', { frameMs: 10, calls: 181, triangles: 1, snapshotApplyMs: 1, chunkWorkMs: 1 })).toEqual(['calls']);
  });
  it('pauses hidden work and clamps resume deltas', () => {
    expect(boundedFrameDelta(0, 10_000, false)).toBe(0); expect(boundedFrameDelta(0, 10_000, true)).toBe(.1);
  });
  it('keeps the representative global snapshot below the chunk-transport threshold', () => {
    const { db, cfg } = testWorld(); const bytes = serializedBytes(new Simulation(db, cfg, new MockMind()).snapshot());
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
