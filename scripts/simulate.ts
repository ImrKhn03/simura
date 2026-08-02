/**
 * Fast-forward simulation with mock minds: validates the whole loop
 * (mind → verbs → physics → memory → eras) without spending a token.
 *
 *   npm run simulate -- 500        # run 500 ticks in memory
 *   npm run simulate -- 500 out.db # persist to a DB file
 */
import { WorldDB } from '../src/server/db.ts';
import { loadWorldConfig } from '../src/server/config.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation, genesis, type FounderSpec } from '../src/server/sim.ts';

const ticks = Number(process.argv[2] ?? 200);
const dbPath = process.argv[3] ?? ':memory:';

const cfg = loadWorldConfig();
const db = new WorldDB(dbPath);
const founders: [FounderSpec, FounderSpec] = [
  { name: 'Ori', gender: 'sol', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY' },
  { name: 'Vey', gender: 'lune', modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY' },
];
genesis(db, cfg, founders);
const sim = new Simulation(db, cfg, new MockMind());

const started = Date.now();
for (let i = 0; i < ticks; i++) {
  const { tick, events, eraUnlocked } = await sim.tickWorld();
  for (const e of events.filter((x) => x.historic)) console.log(`  ★ t${tick}: ${e.detail}`);
  if (eraUnlocked !== null) console.log(`━━ ERA ${eraUnlocked} UNLOCKED at tick ${tick} ━━`);
}

console.log(`\n${ticks} ticks in ${Date.now() - started}ms`);
console.log(`Era: ${db.currentEra()}`);
for (const s of sim.stats()) {
  const kin = db.getKin(s.kinId)!;
  console.log(`\n${kin.name} (${kin.gender}) — ${s.memoryCount} memories, ${s.skillfileCount} skills, repetition ${s.repetitionScore.toFixed(2)}`);
  console.log(`  verbs: ${Object.entries(s.verbCounts).map(([v, n]) => `${v}:${n}`).join(' ')}`);
}
console.log(`\nnamed things: ${db.namedThingCount()}, crafted: ${db.countObjectsOfKind('crafted')}, structures: ${db.countObjectsOfKind('structure')}, texts: ${db.countObjectsOfKind('text')}, teaches: ${db.successfulTeachCount()}`);
const sites = db.listObjects().filter((object) => object.kind === 'structure');
console.log(`construction: ${sites.filter((object) => object.designSpec).length} compact, ${sites.filter((object) => !object.designSpec).length} freeform, ${sites.filter((object) => object.designSpec && !object.designSpec.complete).length} still rising`);
db.close();
