import { WorldDB } from '../src/server/db.ts';
import { loadWorldConfig, type WorldConfig } from '../src/server/config.ts';
import { genesis, type FounderSpec } from '../src/server/sim.ts';
import type { Kin } from '../src/shared/types.ts';

export function testWorld(): { db: WorldDB; cfg: WorldConfig; ori: Kin; vey: Kin } {
  const db = new WorldDB(':memory:');
  const cfg = loadWorldConfig();
  // fixed ids → MockMind's seeded randomness is identical every run (no flaky tests)
  const founders: [FounderSpec, FounderSpec] = [
    { id: 'kin-ori-0000', name: 'Ori', gender: 'sol', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY' },
    { id: 'kin-vey-0000', name: 'Vey', gender: 'lune', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY' },
  ];
  const [ori, vey] = genesis(db, cfg, founders, 42) as [Kin, Kin];
  return { db, cfg, ori, vey };
}

/** Test fixture: birth a named child of a Sol+Lune. `adult` backdates its age so it
 *  is grown (past coming-of-age) — for tests about adult relationships, not infancy. */
export function makeChild(
  db: WorldDB, cfg: WorldConfig, sol: Kin, lune: Kin, tick: number, name = 'Sona', adult = false,
): Kin {
  const { birthChild } = require('../src/server/world/birth.ts') as typeof import('../src/server/world/birth.ts');
  const child = birthChild(db, cfg, lune, sol, tick, name).child;
  if (adult) {
    const born = tick - Math.floor(cfg.lifespan.childEndowmentTicks * 0.5);
    db.db.prepare('UPDATE kin SET born_at_tick=? WHERE id=?').run(born, child.id);
    return db.getKin(child.id)!;
  }
  return child;
}
