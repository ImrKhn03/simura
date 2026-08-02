import type { Kin, WorldObject } from '../../shared/types.ts';
import type { WorldDB } from '../db.ts';
import { materialCategory, type MaterialCategory } from './construction.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface MaterialSelection {
  selected: WorldObject[];
  missing: Partial<Record<MaterialCategory, number>>;
}

function rankedMaterials(db: WorldDB, builder: Kin, reach: number): WorldObject[] {
  const objects = db.listObjects();
  const byId = new Map(objects.map((o) => [o.id, o]));
  const living = new Map(db.listKin(true).map((k) => [k.id, k]));
  return objects.flatMap((object): { object: WorldObject; rank: number }[] => {
    if (object.worn || !materialCategory(object)) return [];
    if (object.carriedBy === builder.id) return [{ object, rank: 0 }];
    if (object.carriedBy) {
      const holder = living.get(object.carriedBy);
      return holder && dist(holder.pos, builder.pos) <= reach ? [{ object, rank: 1 }] : [];
    }
    if (!object.storedIn) return dist(object.pos, builder.pos) <= reach ? [{ object, rank: 2 }] : [];
    const stash = byId.get(object.storedIn);
    if (!stash) return [];
    const holder = stash.carriedBy ? living.get(stash.carriedBy) : null;
    const reachable = stash.carriedBy === builder.id
      || (!!holder && dist(holder.pos, builder.pos) <= reach)
      || (!stash.carriedBy && dist(stash.pos, builder.pos) <= reach);
    return reachable ? [{ object, rank: 3 }] : [];
  }).sort((a, b) => a.rank - b.rank || a.object.id.localeCompare(b.object.id)).map((entry) => entry.object);
}

/** Stable order: builder's hands, companions' hands, ground, then nearby stashes. */
export function selectConstructionMaterials(
  db: WorldDB,
  builder: Kin,
  bill: Record<MaterialCategory, number>,
  reach: number,
): MaterialSelection {
  const ranked = rankedMaterials(db, builder, reach);

  const selected: WorldObject[] = [];
  const missing: Partial<Record<MaterialCategory, number>> = {};
  for (const category of ['timber', 'stone', 'clay', 'thatch'] as MaterialCategory[]) {
    const need = bill[category];
    if (!need) continue;
    const available = ranked.filter((object) => materialCategory(object) === category && !selected.includes(object));
    selected.push(...available.slice(0, need));
    if (available.length < need) missing[category] = need - available.length;
  }
  return { selected, missing };
}

export function selectAnyConstructionMaterials(db: WorldDB, builder: Kin, count: number, reach: number): WorldObject[] {
  return rankedMaterials(db, builder, reach).slice(0, count);
}

export function missingMaterialPhrase(missing: Partial<Record<MaterialCategory, number>>): string {
  const words: Record<MaterialCategory, string> = { timber: 'timber', stone: 'stone', clay: 'clay', thatch: 'reeds or dry fiber' };
  const names = (Object.keys(missing) as MaterialCategory[]).filter((k) => (missing[k] ?? 0) > 0).map((k) => words[k]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
