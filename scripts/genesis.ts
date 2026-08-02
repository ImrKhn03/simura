/** Create the real world DB and wake the founders (idempotent). Run once before `npm run server`. */
import { join } from 'node:path';
import { WorldDB } from '../src/server/db.ts';
import { loadWorldConfig, env } from '../src/server/config.ts';
import { genesis, type FounderSpec } from '../src/server/sim.ts';

try { process.loadEnvFile(join(env.projectRoot, '.env')); } catch { /* mock mode */ }

const cfg = loadWorldConfig();
const db = new WorldDB(env.dbPath());
const founders: [FounderSpec, FounderSpec] = [
  { name: 'Ori', gender: 'sol', modelEndpoint: process.env.SOL_API_BASE ?? process.env.API_BASE ?? '', modelName: process.env.SOL_MODEL ?? process.env.MODEL ?? 'mock', apiKeyRef: 'SOL_API_KEY' },
  { name: 'Vey', gender: 'lune', modelEndpoint: process.env.LUNE_API_BASE ?? process.env.API_BASE ?? '', modelName: process.env.LUNE_MODEL ?? process.env.MODEL ?? 'mock', apiKeyRef: 'LUNE_API_KEY' },
];
const kin = genesis(db, cfg, founders);
console.log(`World at ${env.dbPath()} — tick ${db.getTick()}, era ${db.currentEra()}`);
for (const k of kin) console.log(`  ${k.name} (${k.gender}) at (${k.pos.x},${k.pos.y}) — model: ${k.modelName || 'mock'}`);
db.close();
