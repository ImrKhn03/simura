import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation } from '../src/server/sim.ts';
import { presentKin, toPublicKin, worldPresentation } from '../src/server/world/presentation.ts';

const FORBIDDEN = new Set([
  'modelEndpoint', 'modelName', 'apiKeyRef', 'model_endpoint', 'model_name', 'api_key_ref',
  'temperament', 'mateToward',
]);

function forbiddenKeys(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.has(key)) found.push(key);
    forbiddenKeys(child, found);
  }
  return found;
}

describe('public presentation contracts', () => {
  it('copies only browser-safe Kin state', () => {
    const { db, cfg, ori } = testWorld();
    const view = toPublicKin(ori, presentKin(db, cfg, ori, db.getTick()));
    expect(view.name).toBe('Ori');
    expect(view.pos).toEqual(ori.pos);
    expect(view.pos).not.toBe(ori.pos);
    expect(forbiddenKeys(view)).toEqual([]);
    expect(Object.keys(view)).not.toContain('endowmentTicks');
  });

  it('keeps secrets out of the authoritative world snapshot', () => {
    const { db, cfg } = testWorld();
    const snap = new Simulation(db, cfg, new MockMind()).snapshot();
    expect(forbiddenKeys(snap)).toEqual([]);
    expect(snap.presentation.calamity).toBeNull();
    expect(['dawn', 'day', 'dusk', 'night']).toContain(snap.presentation.dayPart);
  });

  it('presents calamity progress and world language without raw tick fields', () => {
    const { db, cfg } = testWorld();
    db.setMeta('calamity', JSON.stringify({ kind: 'drought', began: 100, until: 580 }));
    const view = worldPresentation(db, cfg, 340, 7, 0.25);
    expect(view.calamity?.kind).toBe('drought');
    expect(view.calamity?.remaining).toBeCloseTo(0.5);
    expect(view.calamity?.line).toContain('drought');
    expect(view.calamity).not.toHaveProperty('began');
    expect(view.calamity).not.toHaveProperty('until');
    expect(view.worldHealth?.calamityPhrase).toContain('drought');
    expect(view.worldHealth?.populationPhrase).not.toContain('living');
    expect(view.worldHealth?.predatorPhrase).toContain('predator');
  });
});
