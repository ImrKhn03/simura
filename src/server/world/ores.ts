/**
 * Mining, the Minecraft way — but woven into SIMURA's era ladder instead of a
 * tech-tree menu. The core theory, borrowed and adapted:
 *
 *  1. ORE VARIETY  — not "ore", but copper, tin, coal, iron, silver, gold, gems.
 *  2. DEPTH        — richer ores live deeper: caves and high stony ground hold the
 *                    hard metals; common ground holds copper and coal.
 *  3. TOOL TIERS   — a soft pick can't crack a hard vein. stone→copper→bronze→iron,
 *                    each tier unlocking the next ore, which forges the next pick.
 *  4. SMELTING     — ore + fire → metal; the hard metals need COAL to burn hot enough.
 *
 * This makes the whole metal age a real climb: stone pick → copper → bronze pick →
 * iron → iron pick → gold & gems — each step earned with the tools of the last.
 */

export type PickTier = 0 | 1 | 2 | 3 | 4; // hands · stone · copper · bronze · iron

export interface Ore {
  key: string;            // the gathered thing's name, e.g. 'copper ore'
  tier: PickTier;         // minimum pick tier to break the vein
  smeltsTo: string | null; // metal it becomes in the forge (null = not a metal, e.g. coal, gems)
  isFuel?: boolean;       // coal: burns hot, enabling iron+ smelting
  precious?: boolean;     // gold, silver, gems — value & beauty, not tools
  hotSmelt?: boolean;     // needs a coal-hot fire to smelt (iron and up)
  lore: string;
}

/** the ores of the world, roughly softest/shallowest → hardest/deepest */
export const ORES: Record<string, Ore> = {
  coal: { key: 'coal', tier: 1, smeltsTo: null, isFuel: true, lore: 'A black, brittle stone that catches fire and burns long and hot — the fuel that melts metal.' },
  copper: { key: 'copper ore', tier: 1, smeltsTo: 'copper', lore: 'Green-streaked stone; the first metal, soft enough to work at a plain fire.' },
  tin: { key: 'tin ore', tier: 1, smeltsTo: 'tin', lore: 'Dull grey ore; alone it is weak, but melted with copper it makes hard bronze.' },
  iron: { key: 'iron ore', tier: 3, smeltsTo: 'iron', hotSmelt: true, lore: 'Rust-red, stubborn stone. Only a bronze pick cracks it, and only a coal-hot fire melts it — but it is the strongest metal.' },
  silver: { key: 'silver ore', tier: 4, smeltsTo: 'silver', precious: true, hotSmelt: true, lore: 'Pale bright veins — soft, precious, prized for ornament and trade.' },
  gold: { key: 'gold ore', tier: 4, smeltsTo: 'gold', precious: true, hotSmelt: true, lore: 'Heavy and yellow and untarnishing; too soft for tools, but treasured above all metals.' },
  gem: { key: 'raw gemstone', tier: 4, smeltsTo: null, precious: true, lore: 'A hard, clear crystal that catches the light — beauty locked in stone, valued for itself.' },
};

/** what pick tier a tool is, from its name/material */
export function pickTier(toolName: string): PickTier {
  const n = toolName.toLowerCase();
  if (/\biron\b/.test(n)) return 4;
  if (/\bbronze\b/.test(n)) return 3;
  if (/\bcopper\b/.test(n)) return 2;
  if (/\bstone|flint\b/.test(n)) return 1;
  return 1; // any crafted pick is at least stone-grade
}

const TIER_NAME: Record<PickTier, string> = { 0: 'bare hands', 1: 'a stone', 2: 'a copper', 3: 'a bronze', 4: 'an iron' };
export const tierName = (t: PickTier): string => TIER_NAME[t];

/**
 * What a given stone contains. Named ore stones always yield their ore. Plain
 * stone has a location-seeded chance of a common ore (copper/coal), richer near
 * caves and high ground — the "you never know what a rock holds" of mining.
 * Returns the Ore, or null for plain rock.
 */
export function oreInStone(stone: { name: string; lore: string | null; pos: { x: number; y: number } }, opts: { nearCave: boolean; elevation: number; seed: number }): Ore | null {
  const n = stone.name.toLowerCase();
  // an explicitly named ore stone yields exactly that
  for (const ore of Object.values(ORES)) {
    if (n.includes(ore.smeltsTo ?? ore.key.split(' ')[0]!) || n.includes(ore.key.split(' ')[0]!)) return ore;
  }
  // "ore-veined" or "ore-bearing" generic stone → biased by where it sits
  const veined = /ore-veined|ore-bearing|\bore\b|metal/i.test(`${stone.name} ${stone.lore ?? ''}`);
  const h = ((Math.imul(stone.pos.x * 73856093 ^ stone.pos.y * 19349663 ^ (opts.seed | 0), 2654435761)) >>> 0) / 4294967296;
  if (!veined && h > 0.22) return null; // most plain stone is just stone
  // richer table near caves / high ground
  const rich = opts.nearCave || opts.elevation > 1.4;
  if (rich) {
    if (h < 0.30) return ORES.iron!;
    if (h < 0.42) return ORES.coal!;
    if (h < 0.52) return ORES.copper!;
    if (h < 0.58) return ORES.silver!;
    if (h < 0.63) return ORES.gold!;
    if (h < 0.66) return ORES.gem!;
    return ORES.iron!;
  }
  // common ground: mostly copper, coal, tin
  if (h < 0.09) return ORES.copper!;
  if (h < 0.15) return ORES.coal!;
  if (h < 0.20) return ORES.tin!;
  return ORES.copper!;
}
