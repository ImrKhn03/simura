/** One real mind-tick against the configured live provider — verifies .env + AI SDK wiring without starting the world. */
import { join } from 'node:path';
import { WorldDB } from '../src/server/db.ts';
import { loadWorldConfig, env } from '../src/server/config.ts';
import { genesis, type FounderSpec } from '../src/server/sim.ts';
import { AiSdkMind, resolveModel } from '../src/server/llm.ts';
import { runMindTick } from '../src/server/mind/tick.ts';

process.loadEnvFile(join(env.projectRoot, '.env'));

const db = new WorldDB(':memory:');
const cfg = loadWorldConfig();
const founders: [FounderSpec, FounderSpec] = [
  { name: 'Ori', gender: 'sol', modelEndpoint: '', modelName: process.env.MODEL ?? '', apiKeyRef: 'SOL_API_KEY' },
  { name: 'Vey', gender: 'lune', modelEndpoint: '', modelName: process.env.MODEL ?? '', apiKeyRef: 'LUNE_API_KEY' },
];
const [ori] = genesis(db, cfg, founders);
console.log('model:', resolveModel(ori!).label);
const ev = await runMindTick(db, cfg, new AiSdkMind(), ori!, 1);
console.log('verb:', ev.verb);
console.log('thought:', ev.thought);
console.log('detail:', ev.detail);
console.log('tokens:', JSON.stringify(db.usageTotals(ori!.id)));
db.close();
