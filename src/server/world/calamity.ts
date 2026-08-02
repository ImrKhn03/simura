/**
 * Natural disasters — the great shapers of history. Rare, seeded, FELT world states,
 * never a scripted timeline: a deterministic roll (from the world seed + tick) can
 * begin a calamity that then runs its course. Effects reuse the systems beneath —
 * hunger, health, sickness, fire, regrowth — so a drought or plague is *felt* in the
 * body, not announced by a banner.
 *
 *  drought   — the land dries: nothing regrows, plants wither, hunger bites harder
 *  coldsnap  — a killing cold: exposure wounds even without rain; food is scarce
 *  plague    — sickness spreads far more readily; the healers are tested
 *  wildfire  — fire runs wild in the dry: trees and homes burn near any flame
 */
import type { WorldDB } from '../db.ts';

export type CalamityKind = 'drought' | 'coldsnap' | 'plague' | 'wildfire' | 'flood';
export interface Calamity { kind: CalamityKind; until: number; began: number }

const KEY = 'calamity';

export function currentCalamity(db: WorldDB, tick: number): Calamity | null {
  const raw = db.getMeta(KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Calamity;
    return tick < c.until ? c : null;
  } catch { return null; }
}

export const CALAMITY_LINE: Record<CalamityKind, string> = {
  drought: 'A great drought grips the land — the earth is cracked and dry, streams shrink, and little will grow until it breaks. Stored food and water are worth more than gold now.',
  coldsnap: 'A killing cold has come — the air bites even without rain, and warmth means survival. The unsheltered and unclad suffer; food is scarce under the frost.',
  plague: 'A sickness moves through the world — it spreads from one to the next far more easily than before. Keep the well apart from the ailing; a healer\'s hands are needed as never before.',
  wildfire: 'Fire is loose in the dry land — it leaps from tree to tree and eats whatever burns. Stay clear of the flames, and pray for rain.',
  flood: 'The waters are rising — the low ground is drowning, and the streams have burst their banks. Get to higher ground; only the heights are safe now.',
};

const BEGIN: Record<CalamityKind, string> = {
  drought: 'A drought settles over the world — the rains have failed, and the land begins to dry.',
  coldsnap: 'A terrible cold descends — the world stiffens under a killing frost.',
  plague: 'A sickness begins to spread from Kin to Kin — the first sign of a plague.',
  wildfire: 'Fire has caught in the dry land and begins to spread — a wildfire.',
  flood: 'The waters are rising — a great flood begins to swallow the low ground.',
};
const END: Record<CalamityKind, string> = {
  drought: 'The drought has broken at last — rain returns, and the land begins to green again.',
  coldsnap: 'The killing cold has lifted; the world thaws and breathes again.',
  plague: 'The plague has run its course and passed; the air feels clean again.',
  wildfire: 'The last of the wildfire has burned out; only ash and green shoots remain.',
  flood: 'The floodwaters have drained away at last; the low ground reappears, changed and heavy with silt.',
};

/**
 * Advance the calamity clock. Called once per tick. Begins a rare disaster by a
 * deterministic roll, or ends one that has run its course. Returns a world event
 * to log (begin/end), or null. Effects themselves are applied by the sim/body/regrow.
 */
const LAST_KEY = 'calamity_last';

export function stepCalamity(db: WorldDB, tick: number, seed: number, scale: number, era: number, dayLength = 480): { verb: string; detail: string } | null {
  if (currentCalamity(db, tick)) return null; // one still raging — nothing to begin
  const rawExpired = db.getMeta(KEY);
  if (rawExpired) {
    // an expired calamity is lingering in meta — clear it, mark the calm, announce its passing
    try {
      const c = JSON.parse(rawExpired) as Calamity;
      db.setMeta(KEY, '');
      db.setMeta(LAST_KEY, String(tick));
      return { verb: 'calamity_ended', detail: END[c.kind] };
    } catch { db.setMeta(KEY, ''); }
  }
  // VERY RARE: a long forced calm after the last one, then a low per-tick chance on top.
  // Together this averages roughly one calamity per world-month — a real, memorable event,
  // not a regular hardship. (calm ~20 world-days; then ~0.00008/tick ≈ ~13 more days.)
  const last = Number(db.getMeta(LAST_KEY) ?? '0');
  const MIN_CALM = dayLength * 20;
  if (tick - last < MIN_CALM) return null;
  const roll = ((Math.imul((tick + 7) ^ (seed | 0), 2654435761) >>> 0) % 1_000_000) / 1_000_000;
  if (roll >= 0.00008 * scale) return null;
  // which calamity — seasonal & weather sense: cold in winter; flood needs the wet
  const pick = (Math.imul(tick ^ 0xbeef, 40503) >>> 0) % 100;
  const seasonPhase = era >= 7 ? ((tick % (dayLength * 240)) / (dayLength * 240)) : 0.4;
  const winter = seasonPhase >= 0.75;
  let kind: CalamityKind;
  if (winter) kind = pick < 60 ? 'coldsnap' : pick < 80 ? 'plague' : 'flood';
  else if (pick < 26) kind = 'drought';
  else if (pick < 48) kind = 'wildfire';
  else if (pick < 68) kind = 'plague';
  else if (pick < 86) kind = 'flood';
  else kind = 'coldsnap';
  const duration = Math.round((0.5 + (pick % 10) / 10) * dayLength); // ~0.5–1.4 world-days
  const c: Calamity = { kind, until: tick + duration, began: tick };
  db.setMeta(KEY, JSON.stringify(c));
  db.setMeta(LAST_KEY, String(tick));
  return { verb: 'calamity_began', detail: BEGIN[kind] };
}
