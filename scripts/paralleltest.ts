/** verify parallel think-phase: 8 slow minds must cost ~max(latency), not the sum */
import { WorldDB } from '../src/server/db.ts';
import { loadWorldConfig } from '../src/server/config.ts';
import { Simulation, genesis, type FounderSpec } from '../src/server/sim.ts';
import type { Mind } from '../src/server/llm.ts';
import { SOL_TEMPERAMENT } from '../src/shared/types.ts';

const db = new WorldDB(':memory:');
const cfg = loadWorldConfig();
const founders: [FounderSpec, FounderSpec] = [
  { id: 'a', name: 'Ori', gender: 'sol', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY' },
  { id: 'b', name: 'Vey', gender: 'lune', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY' },
];
genesis(db, cfg, founders, 42);
for (let i = 0; i < 6; i++) {
  db.createKin({
    name: `K${i}`, gender: i % 2 ? 'sol' : 'lune', parentSolId: null, parentLuneId: null,
    bornAtTick: 0, diedAtTick: null, immortal: true, endowmentTicks: 0,
    modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
    temperament: { ...SOL_TEMPERAMENT }, pos: { x: 20 + i, y: 20 }, status: 'alive',
    intention: null, coupleId: null,
  });
}
let n = 0;
const slowMind: Mind = {
  chooseAction: async (kin) => {
    await new Promise((r) => setTimeout(r, 300)); // every mind takes 300ms
    n += 1;
    return { choice: { thought: '', verb: 'reflect', params: { insight: `thought ${n} of ${kin.name}` } }, tokensIn: 0, tokensOut: 0 };
  },
  summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
};
const sim = new Simulation(db, cfg, slowMind);
const t0 = Date.now();
await sim.tickWorld();
const ms = Date.now() - t0;
console.log(`8 minds x 300ms each -> tick took ${ms}ms (${ms < 900 ? 'PARALLEL OK' : 'SEQUENTIAL BAD (~2400ms expected if serial)'})`);
db.close();
