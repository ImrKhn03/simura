/**
 * The land itself — one seeded procedural definition shared by the server (so
 * Kin perceive their terrain) and the client (so it renders identically).
 * Rolling hills, water hollows, rock, snow, and moisture-driven biomes.
 * Grid coords are world (x,y); scene coords are centered — height is the same
 * either way because it's a pure function of position + seed.
 */

function h32(a: number, b: number, seed: number): number {
  let h = Math.imul((a + seed) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x); const zi = Math.floor(z);
  const xf = x - xi; const zf = z - zi;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const u = sm(xf); const v = sm(zf);
  const a = h32(xi, zi, seed); const b = h32(xi + 1, zi, seed);
  const c = h32(xi, zi + 1, seed); const d = h32(xi + 1, zi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x: number, z: number, seed: number): number {
  let h = 0; let amp = 1; let freq = 0.045; let norm = 0;
  for (let o = 0; o < 4; o++) { h += vnoise(x * freq, z * freq, seed) * amp; norm += amp; amp *= 0.5; freq *= 2.1; }
  return h / norm;
}

/** height at scene coords (~ -2 .. +3; below ~ -0.55 is under water).
 *  The base world is a gentle rolling meadow — mostly walkable land —
 *  with ponds and lakes carved as soft hollows and rare stony rises.
 *  Pure function of position + seed: infinite, and identical on server and client. */
export function heightAt(sx: number, sz: number, seed: number): number {
  const rolling = (fbm(sx, sz, seed) - 0.5) * 2;
  let h = 0.55 + rolling * 0.9;
  // ponds and lakes: a slow field occasionally dips the meadow under water
  const pond = fbm(sx * 0.6 + 500, sz * 0.6 + 500, seed ^ 0x77);
  if (pond > 0.58) {
    const t = Math.min(1, (pond - 0.58) / 0.26);
    h -= t * t * (3 - 2 * t) * 2.6;
  }
  // stony rises toward highland, rarely a peak
  const ridge = fbm(sx * 0.5 - 800, sz * 0.5 - 800, seed ^ 0x3b1);
  if (ridge > 0.6) h += Math.pow((ridge - 0.6) / 0.24, 1.7) * 2.9;
  // rivers: narrow meandering channels along the folds of a slow field,
  // carved shallower over high ground so they read as mountain streams
  const flow = fbm(sx * 0.42 + 1500, sz * 0.42 - 700, seed ^ 0x5ad);
  const channel = Math.abs(flow - 0.5);
  if (channel < 0.028) {
    const t = 1 - channel / 0.028;
    h -= t * t * (1.7 - Math.max(0, h) * 0.35);
  }
  return h;
}
/** 0..1 moisture field (offset seed) — drives biome */
export function moistureAt(sx: number, sz: number, seed: number): number {
  return fbm(sx + 1000, sz - 1000, seed ^ 0x1234);
}

export type Biome = 'water' | 'shore' | 'meadow' | 'forest' | 'highland' | 'peak';

export function biomeAt(sx: number, sz: number, seed: number): Biome {
  const h = heightAt(sx, sz, seed);
  if (h < -0.55) return 'water';
  if (h < -0.1) return 'shore';
  if (h > 2.4) return 'peak';
  if (h > 1.6) return 'highland';
  return moistureAt(sx, sz, seed) > 0.55 ? 'forest' : 'meadow';
}

const BIOME_WORDS: Record<Biome, string> = {
  water: 'in shallow water',
  shore: 'on a low, damp bank',
  meadow: 'on open grassland',
  forest: 'among denser green growth',
  highland: 'on high, stony ground',
  peak: 'on a cold, bare height',
};

/** a Kin's felt sense of the land where they stand, which way it rises, and nearby water.
 *  Terrain is a pure function of ABSOLUTE grid coords + seed — never of map size —
 *  so the land under anyone's feet is eternal no matter how far the world expands. */
export function terrainSense(gx: number, gy: number, seed: number): string {
  const sx = gx; const sz = gy;
  const here = heightAt(sx, sz, seed);
  const biome = biomeAt(sx, sz, seed);
  const dirs: [string, number, number][] = [['east', 3, 0], ['west', -3, 0], ['south', 0, 3], ['north', 0, -3]];
  // steepest uphill of the four neighbours
  let best = ''; let bestRise = 0.25;
  for (const [name, dx, dz] of dirs) {
    const rise = heightAt(sx + dx, sz + dz, seed) - here;
    if (rise > bestRise) { bestRise = rise; best = name; }
  }
  const slope = best ? ` The land rises toward the ${best}.` : ' The ground here is level.';
  // scan outward for water (a pond/lake is low ground, not an object) so they can see it
  let water = '';
  if (biome !== 'water') {
    let wd = ''; let wdist = 99;
    for (const [name, ux, uz] of dirs) {
      for (let step = 2; step <= 10; step += 2) {
        if (biomeAt(sx + ux / 3 * step, sz + uz / 3 * step, seed) === 'water') {
          if (step < wdist) { wdist = step; wd = name; }
          break;
        }
      }
    }
    if (wd) water = ` Water — a pond or shore — lies ${wdist <= 4 ? 'close' : 'a little way'} to the ${wd}.`;
  }
  return `You stand ${BIOME_WORDS[biome]}.${slope}${water}`;
}
