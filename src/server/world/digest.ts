/**
 * The story so far — a template-woven daily digest of the world's history.
 * No LLM cost: it reads the event log and tells each day as a short chapter.
 */
import type { WorldDB } from '../db.ts';

export interface DayDigest {
  day: number;
  fromTick: number;
  toTick: number;
  headline: string;
  historic: string[];
  numbers: string;
}

export function buildDigest(db: WorldDB, dayLengthTicks: number): DayDigest[] {
  const rows = db.db.prepare(
    `SELECT tick, verb, detail, historic, actor_kin_id as actor FROM events ORDER BY tick ASC`)
    .all() as unknown as { tick: number; verb: string; detail: string; historic: number; actor: string | null }[];
  if (rows.length === 0) return [];
  const nameOf = new Map(db.listKin().map((k) => [k.id, k.name]));
  const lastTick = rows[rows.length - 1]!.tick;
  const days: DayDigest[] = [];
  for (let day = 0; day * dayLengthTicks <= lastTick; day++) {
    const from = day * dayLengthTicks; const to = from + dayLengthTicks - 1;
    const evs = rows.filter((r) => r.tick >= from && r.tick <= to);
    if (evs.length === 0) continue;
    const historic = evs.filter((r) => r.historic).map((r) => r.detail.slice(0, 160));
    const count = (v: string): number => evs.filter((r) => r.verb === v && !/^you |^You |but:|cannot|nothing/i.test(r.detail)).length;
    const made = count('craft') + count('build');
    const words = count('speak');
    const meals = count('eat');
    const births = evs.filter((r) => r.verb === 'birth').length;
    const deaths = evs.filter((r) => r.verb === 'death').length;
    const speakers = [...new Set(evs.map((r) => r.actor).filter(Boolean))]
      .map((id) => nameOf.get(id!) ?? '?').slice(0, 6);
    const headline = historic[0]
      ?? (made > 3 ? 'A day of busy hands.'
        : words > made ? 'A day of many words.'
          : 'A quiet day; the world turned on.');
    days.push({
      day: day + 1, fromTick: from, toTick: Math.min(to, lastTick),
      headline,
      historic,
      numbers: `${speakers.join(', ')} — ${made} things made, ${words} things said${meals ? `, ${meals} meals` : ''}${births ? `, ${births} born` : ''}${deaths ? `, ${deaths} lost` : ''}.`,
    });
  }
  return days.reverse(); // newest day first
}
