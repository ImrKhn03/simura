/**
 * Genesis run report (M4.2) — turns a long unattended run into a 1-minute review.
 * Read-only over the world DB. Usage: npx tsx scripts/run-report.ts [path/to.db]
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { env } from '../src/server/config.ts';

const dbPath = process.argv[2] ?? process.env.DB_PATH ?? join(env.projectRoot, 'data', 'simura.db');
const db = new DatabaseSync(dbPath, { readOnly: true });
const one = <T>(sql: string): T => db.prepare(sql).get() as unknown as T;
const all = <T>(sql: string): T[] => db.prepare(sql).all() as unknown as T[];

const span = one<{ min: number; max: number; n: number }>(`SELECT MIN(tick) min, MAX(tick) max, COUNT(*) n FROM events`);
console.log(`\n=== SIMURA run report — ${dbPath} ===`);
console.log(`ticks ${span.min}–${span.max} · ${span.n} events`);

// verb distribution: is the world varied or rutted?
console.log(`\n-- verb distribution --`);
for (const r of all<{ verb: string; n: number }>(`SELECT verb, COUNT(*) n FROM events GROUP BY verb ORDER BY n DESC`))
  console.log(`  ${r.verb.padEnd(14)} ${String(r.n).padStart(5)}  ${'█'.repeat(Math.min(40, Math.ceil(r.n / Math.max(1, span.n) * 120)))}`);

// dead-end hits: how often each Kin ran into a repetition wall (lower over time = learning)
console.log(`\n-- dead-end hits per Kin (repetition walls) --`);
for (const r of all<{ name: string; n: number }>(
  `SELECT k.name, COUNT(*) n FROM events e JOIN kin k ON k.id=e.actor_kin_id
   WHERE e.detail LIKE '%already spoken%' OR e.detail LIKE '%paced this same patch%'
      OR e.detail LIKE '%reveals nothing new%' OR e.detail LIKE '%settles nothing%'
   GROUP BY k.name ORDER BY n DESC`)) console.log(`  ${r.name.padEnd(10)} ${r.n}`);

// model health: dizzy spells = provider failures after all fallbacks
const dizzy = one<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE detail LIKE '%felt dizzy%'`);
console.log(`\n-- model health --\n  dizzy spells (all fallbacks failed): ${dizzy.n}`);

// tokens: total spend for cost-per-day math
const tok = one<{ i: number; o: number }>(`SELECT COALESCE(SUM(tokens_in),0) i, COALESCE(SUM(tokens_out),0) o FROM usage_log`);
console.log(`  tokens: ${tok.i.toLocaleString()} in / ${tok.o.toLocaleString()} out`);

// construction rollout: operational evidence without leaking telemetry into the world UI
const hasDesign = all<{ name: string }>(`PRAGMA table_info(world_objects)`).some((column) => column.name === 'design_spec');
if (hasDesign) {
  const construction = one<{ compact: number; freeform: number; partial: number }>(`
    SELECT COALESCE(SUM(design_spec IS NOT NULL),0) compact,
           COALESCE(SUM(design_spec IS NULL),0) freeform,
           COALESCE(SUM(design_spec IS NOT NULL AND json_extract(design_spec,'$.complete')=0),0) partial
    FROM world_objects WHERE kind='structure'`);
  const stages = one<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE verb='build' AND detail LIKE 'raised more of%'`);
  const shortages = one<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE verb='build' AND (detail LIKE '%have not the%' OR detail LIKE '%waits%material%')`);
  const total = construction.compact + construction.freeform;
  console.log(`\n-- construction rollout --`);
  console.log(`  compact: ${construction.compact}/${total} · freeform: ${construction.freeform}/${total} · waiting sites: ${construction.partial}`);
  console.log(`  recorded stage advances: ${stages.n} · material shortages: ${shortages.n}`);
  const hasMetrics = all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name='action_metrics'`).length > 0;
  if (hasMetrics) {
    const samples = all<{ chars: number; tokens: number; success: number; failure: string | null }>(`
      SELECT parameter_chars chars, tokens_out tokens, success, failure_kind failure FROM action_metrics WHERE verb='build' ORDER BY parameter_chars`);
    const median = (values: number[]) => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)]! : 0;
    const invalid = samples.filter((sample) => !sample.success && sample.failure === 'validation').length;
    const failed = samples.filter((sample) => !sample.success).length;
    console.log(`  build payload median: ${median(samples.map((sample) => sample.chars))} chars · output median: ${median(samples.map((sample) => sample.tokens))} tokens`);
    console.log(`  validation failures: ${invalid} · retries/failures: ${failed}/${samples.length}`);
  } else console.log(`  per-build output tokens/retries: unavailable in this pre-metrics world`);
}

// the story so far: eras + historic beats
console.log(`\n-- eras reached --`);
for (const r of all<{ era: number; tick: number }>(`SELECT era, unlocked_at_tick tick FROM eras ORDER BY era`))
  console.log(`  era ${r.era} at t${r.tick}`);
console.log(`\n-- historic beats --`);
for (const r of all<{ tick: number; detail: string }>(`SELECT tick, detail FROM events WHERE historic=1 ORDER BY tick LIMIT 40`))
  console.log(`  t${String(r.tick).padStart(5)}  ${r.detail.slice(0, 110)}`);

// population + creations snapshot
const pop = one<{ alive: number; dead: number }>(`SELECT SUM(died_at_tick IS NULL) alive, SUM(died_at_tick IS NOT NULL) dead FROM kin`);
const made = one<{ n: number; shaped: number }>(`SELECT COUNT(*) n, SUM(shape IS NOT NULL) shaped FROM world_objects WHERE creator_kin_id IS NOT NULL`);
console.log(`\n-- world --\n  kin: ${pop.alive} alive, ${pop.dead ?? 0} dead · made: ${made.n} things (${made.shaped ?? 0} own designs)\n`);
