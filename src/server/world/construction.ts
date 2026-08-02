import type {
  BuildArchetype, BuildDesignSpec, BuildMaterial, BuildSize, CraftTemplate, DyeName, ShapePart, WorldObject,
} from '../../shared/types.ts';

export type MaterialCategory = 'timber' | 'stone' | 'clay' | 'thatch';

export const ARCHETYPES: readonly BuildArchetype[] = ['cottage', 'longhouse', 'hut', 'hall', 'granary', 'wall', 'tower', 'shrine', 'well', 'fence'];
export const BUILD_SIZES: readonly BuildSize[] = ['small', 'large'];
export const BUILD_MATERIALS: readonly BuildMaterial[] = ['wood', 'stone', 'clay', 'thatch'];

export const BUILD_RULES: Record<BuildArchetype, { small: number; stages: number; valid: readonly BuildMaterial[] }> = {
  fence: { small: 2, stages: 2, valid: ['wood', 'stone'] },
  wall: { small: 3, stages: 2, valid: ['wood', 'stone', 'clay'] },
  well: { small: 4, stages: 3, valid: ['stone', 'clay', 'wood'] },
  hut: { small: 5, stages: 4, valid: ['wood', 'clay', 'thatch'] },
  shrine: { small: 5, stages: 4, valid: ['wood', 'stone', 'clay', 'thatch'] },
  cottage: { small: 7, stages: 5, valid: ['wood', 'stone', 'clay', 'thatch'] },
  granary: { small: 8, stages: 5, valid: ['wood', 'stone', 'clay', 'thatch'] },
  tower: { small: 9, stages: 5, valid: ['wood', 'stone', 'clay'] },
  longhouse: { small: 11, stages: 5, valid: ['wood', 'stone', 'clay', 'thatch'] },
  hall: { small: 13, stages: 5, valid: ['wood', 'stone', 'clay', 'thatch'] },
};

export const DYES: Record<DyeName, string> = {
  berry: '#A94F61', ochre: '#B87936', charcoal: '#3E4146', clay: '#A96248',
  indigo: '#4F5F8F', sage: '#6F865C', bone: '#D2C6AA', gold: '#C99B3D',
};

const NATURAL: Record<BuildMaterial, string> = {
  wood: '#8C6346', stone: '#7C7D79', clay: '#A96248', thatch: '#A4AA6A',
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value.toLowerCase());
}

export function parseBuildSpec(raw: Record<string, unknown>, fallbackName = ''): Omit<BuildDesignSpec, 'stage' | 'complete'> | null {
  let archetype: BuildArchetype | null = isOneOf(raw.archetype, ARCHETYPES) ? raw.archetype.toLowerCase() as BuildArchetype : null;
  if (!archetype) {
    const name = fallbackName.toLowerCase().replace(/[\s_-]+/g, ' ');
    archetype = ARCHETYPES.find((a) => name.includes(a === 'longhouse' ? 'long house' : a)) ?? null;
  }
  if (!archetype) return null;
  const size: BuildSize = isOneOf(raw.size, BUILD_SIZES) ? raw.size.toLowerCase() as BuildSize : 'small';
  let material: BuildMaterial = isOneOf(raw.material, BUILD_MATERIALS) ? raw.material.toLowerCase() as BuildMaterial : 'wood';
  const rule = BUILD_RULES[archetype];
  if (!rule.valid.includes(material)) material = rule.valid[0]!;
  const dye = snapDye(raw.dye ?? raw.color)?.name;
  return { version: 1, archetype, size, material, ...(dye ? { dye } : {}), stageCount: rule.stages, addition: null };
}

export function totalMaterialUnits(archetype: BuildArchetype, size: BuildSize): number {
  const small = BUILD_RULES[archetype].small;
  return size === 'large' ? Math.ceil(small * 1.5) : small;
}

export function materialBill(archetype: BuildArchetype, size: BuildSize, material: BuildMaterial): Record<MaterialCategory, number> {
  const total = totalMaterialUnits(archetype, size);
  const out: Record<MaterialCategory, number> = { timber: 0, stone: 0, clay: 0, thatch: 0 };
  if (material === 'wood') out.timber = total;
  else if (material === 'stone') { out.stone = Math.ceil(total * 0.75); out.timber = total - out.stone; }
  else if (material === 'clay') { out.clay = Math.ceil(total * 0.65); out.timber = total - out.clay; }
  else { out.thatch = Math.ceil(total * 0.6); out.timber = total - out.thatch; }
  return out;
}

export function stagedMaterialBills(spec: Pick<BuildDesignSpec, 'archetype' | 'size' | 'material' | 'stageCount'>): Record<MaterialCategory, number>[] {
  const remaining = materialBill(spec.archetype, spec.size, spec.material);
  const stages = Array.from({ length: spec.stageCount }, () => ({ timber: 0, stone: 0, clay: 0, thatch: 0 }));
  const stagePreference: MaterialCategory[][] = [
    ['stone', 'clay', 'timber', 'thatch'], ['timber', 'stone', 'clay', 'thatch'],
    ['clay', 'stone', 'timber', 'thatch'], ['thatch', 'timber', 'clay', 'stone'],
    ['timber', 'clay', 'stone', 'thatch'],
  ];
  for (let i = 0; i < stages.length; i++) {
    const category = stagePreference[i % stagePreference.length]!.find((c) => remaining[c] > 0)!;
    stages[i]![category]++; remaining[category]--;
  }
  let cursor = 0;
  for (const category of ['stone', 'clay', 'timber', 'thatch'] as MaterialCategory[]) {
    while (remaining[category] > 0) {
      stages[cursor % stages.length]![category]++;
      remaining[category]--;
      cursor++;
    }
  }
  return stages;
}

export function extensionMaterialBills(spec: Pick<BuildDesignSpec, 'archetype' | 'size' | 'material'>): Record<MaterialCategory, number>[] {
  const base = materialBill(spec.archetype, spec.size, spec.material);
  const total = Math.max(3, Math.ceil(Object.values(base).reduce((a, b) => a + b, 0) * 0.4));
  const categories = (['stone', 'clay', 'timber', 'thatch'] as MaterialCategory[])
    .flatMap((category) => Array.from({ length: base[category] }, () => category));
  const chosen = Array.from({ length: total }, (_, i) => categories[Math.floor(i * categories.length / total)]!);
  const stages = Array.from({ length: 3 }, () => ({ timber: 0, stone: 0, clay: 0, thatch: 0 }));
  chosen.forEach((category, i) => { stages[i % 3]![category]++; });
  return stages;
}

const CRAFT_TEMPLATES: readonly CraftTemplate[] = ['tool', 'vessel', 'garment', 'coin'];

/** Compact, server-owned forms for routine handheld work; unusual inventions keep freeform shapes. */
export function generateCraftTemplate(template: unknown, material: unknown, dye: unknown): ShapePart[] | null {
  if (!isOneOf(template, CRAFT_TEMPLATES)) return null;
  const tone = snapDye(dye)?.hex ?? (typeof material === 'string' && /stone|metal|ore/i.test(material) ? '#7C7D79' : '#8C6346');
  switch (template) {
    case 'tool': return [box(0, 0, 0, 0.09, 0.5, 0.09, '#8C6346'), box(0, 0.48, 0, 0.34, 0.11, 0.12, tone)];
    case 'vessel': return [box(0, 0, 0, 0.34, 0.08, 0.34, tone), box(-0.15, 0.08, 0, 0.06, 0.3, 0.34, tone), box(0.15, 0.08, 0, 0.06, 0.3, 0.34, tone), box(0, 0.08, -0.15, 0.24, 0.3, 0.06, tone)];
    case 'garment': return [box(0, 0, 0, 0.42, 0.46, 0.08, tone), box(-0.3, 0.08, 0, 0.18, 0.32, 0.07, tone), box(0.3, 0.08, 0, 0.18, 0.32, 0.07, tone)];
    case 'coin': return [box(0, 0, 0, 0.24, 0.035, 0.24, snapDye(dye)?.hex ?? '#C99B3D')];
  }
}

const DIMS: Record<BuildArchetype, [number, number, number]> = {
  cottage: [3.4, 2.2, 3], longhouse: [5.4, 2.3, 3.4], hut: [3, 2.05, 2.7], hall: [5.8, 2.8, 4.2],
  granary: [3.5, 2.6, 3.2], wall: [4, 2.1, 0.38], tower: [3.1, 4.2, 3.1], shrine: [3.1, 2.5, 2.8],
  well: [2, 1.8, 2], fence: [4, 1.25, 0.22],
};

function box(x: number, y: number, z: number, w: number, h: number, d: number, c: string): ShapePart {
  return { x, y, z, w, h, d, c };
}

export function buildStageParts(spec: Pick<BuildDesignSpec, 'archetype' | 'size' | 'material' | 'dye' | 'stageCount'>): ShapePart[][] {
  const scale = spec.size === 'large' ? 1.28 : 1;
  const [rawW, rawH, rawD] = DIMS[spec.archetype];
  const w = rawW * scale; const h = rawH * scale; const d = rawD * scale;
  const natural = NATURAL[spec.material]; const accent = spec.dye ? DYES[spec.dye] : '#B18863';
  if (spec.archetype === 'fence') return [
    [-w / 2, 0, w / 2].map((x) => box(x, 0, 0, 0.16, h, 0.18, natural)),
    [box(0, h * 0.25, 0, w, 0.14, 0.14, accent), box(0, h * 0.7, 0, w, 0.14, 0.14, natural)],
  ];
  if (spec.archetype === 'wall') return [[box(0, 0, 0, w, 0.18, d, '#594739')], [box(0, 0.18, 0, w, h, d, natural)]];
  if (spec.archetype === 'well') return [
    [box(0, 0, 0, w, 0.45, d, natural)],
    [box(-w * 0.38, 0.45, 0, 0.16, h, 0.16, accent), box(w * 0.38, 0.45, 0, 0.16, h, 0.16, accent)],
    [box(0, h, 0, w * 1.05, 0.18, d * 0.72, spec.dye ? accent : '#A4AA6A')],
  ];
  const floor = [box(0, 0, 0, w, 0.16, d, '#594739')];
  const posts = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => box(sx! * (w / 2 - 0.12), 0.16, sz! * (d / 2 - 0.12), 0.2, h, 0.2, '#8C6346'));
  const door = Math.min(0.82, w * 0.28); const frontPiece = (w - door) / 2;
  const walls = [
    box(0, 0.16, -d / 2, w, h, 0.18, natural),
    box(-w / 2, 0.16, 0, 0.18, h, d, natural), box(w / 2, 0.16, 0, 0.18, h, d, natural),
    box(-(door + frontPiece) / 2, 0.16, d / 2, frontPiece, h, 0.18, natural),
    box((door + frontPiece) / 2, 0.16, d / 2, frontPiece, h, 0.18, natural),
    box(0, 1.41, d / 2, door, Math.max(0.2, h - 1.25), 0.18, natural),
  ];
  const roof = [
    box(-w * 0.23, h + 0.16, 0, w * 0.58, 0.2, d + 0.35, spec.material === 'thatch' ? NATURAL.thatch : natural),
    box(w * 0.23, h + 0.16, 0, w * 0.58, 0.2, d + 0.35, spec.material === 'thatch' ? NATURAL.thatch : natural),
  ];
  const finish = [box(0, 0.2, d / 2 + 0.1, door * 0.82, 1.12, 0.08, accent)];
  const canonical = [floor, posts, walls, roof, finish];
  if (spec.stageCount === 4) return [floor, posts, walls, [...roof, ...finish]];
  return canonical.slice(0, spec.stageCount);
}

export function generateBuildShape(spec: BuildDesignSpec): ShapePart[] {
  const stages = buildStageParts(spec).slice(0, Math.max(0, Math.min(spec.stage, spec.stageCount)));
  const base = stages.flat();
  if (!spec.addition || spec.addition.stage <= 0) return base;
  const [w, , d] = DIMS[spec.archetype];
  const additionStages: ShapePart[][] = [
    [box(w * 0.62, 0, 0, w * 0.55, 0.14, d * 0.75, '#594739')],
    [box(w * 0.88, 0.14, 0, 0.18, 1.8, d * 0.75, NATURAL[spec.material])],
    [box(w * 0.62, 1.94, 0, w * 0.62, 0.18, d * 0.9, spec.dye ? DYES[spec.dye] : NATURAL[spec.material])],
  ];
  return [...base, ...additionStages.slice(0, spec.addition.stage).flat()].slice(0, 48);
}

export function isFunctionalStructure(object: Pick<WorldObject, 'kind' | 'designSpec'>): boolean {
  if (object.kind !== 'structure') return false;
  return object.designSpec === null || object.designSpec.complete;
}

export function parseStoredDesign(value: unknown): BuildDesignSpec | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !isOneOf(v.archetype, ARCHETYPES) || !isOneOf(v.size, BUILD_SIZES) || !isOneOf(v.material, BUILD_MATERIALS)) return null;
  const rule = BUILD_RULES[v.archetype as BuildArchetype];
  const stage = Math.max(0, Math.min(rule.stages, Math.floor(Number(v.stage) || 0)));
  const rawAddition = v.addition && typeof v.addition === 'object' ? v.addition as Record<string, unknown> : null;
  const additionStage = rawAddition && (rawAddition.kind === 'room' || rawAddition.kind === 'wing')
    ? Math.max(0, Math.min(3, Math.floor(Number(rawAddition.stage) || 0))) : null;
  return {
    version: 1, archetype: v.archetype as BuildArchetype, size: v.size as BuildSize, material: v.material as BuildMaterial,
    ...(isOneOf(v.dye, Object.keys(DYES) as DyeName[]) ? { dye: v.dye as DyeName } : {}),
    stage, stageCount: rule.stages, complete: stage >= rule.stages,
    addition: additionStage === null ? null : {
      kind: rawAddition!.kind as 'room' | 'wing', stage: additionStage, stageCount: 3, complete: additionStage >= 3,
    },
  };
}

export function snapDye(value: unknown): { name: DyeName; hex: string } | null {
  if (typeof value !== 'string') return null;
  const named = value.toLowerCase() as DyeName;
  if (named in DYES) return { name: named, hex: DYES[named] };
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const input = rgb(value);
  const nearest = (Object.entries(DYES) as [DyeName, string][]).map(([name, hex]) => ({ name, hex, d: rgb(hex).reduce((sum, x, i) => sum + (x - input[i]!) ** 2, 0) }))
    .sort((a, b) => a.d - b.d)[0]!;
  return { name: nearest.name, hex: nearest.hex };
}

export function snapShapeColor(value: unknown): string {
  return snapDye(value)?.hex ?? '#8C6346';
}

export function normalizeFreeformStructure(shape: ShapePart[]): ShapePart[] {
  if (shape.length === 0) return [];
  const minX = Math.min(...shape.map((p) => p.x - p.w / 2)); const maxX = Math.max(...shape.map((p) => p.x + p.w / 2));
  const minZ = Math.min(...shape.map((p) => p.z - p.d / 2)); const maxZ = Math.max(...shape.map((p) => p.z + p.d / 2));
  const maxY = Math.max(...shape.map((p) => p.y + p.h));
  const required = Math.max(1, 3 / Math.max(0.01, maxX - minX), 2.6 / Math.max(0.01, maxZ - minZ), 2 / Math.max(0.01, maxY));
  const currentExtent = Math.max(...shape.flatMap((p) => [Math.abs(p.x) + p.w / 2, Math.abs(p.z) + p.d / 2, p.y + p.h]));
  const scale = Math.min(required, 8 / Math.max(0.01, currentExtent));
  return shape.map((p) => ({ ...p, x: p.x * scale, y: p.y * scale, z: p.z * scale, w: p.w * scale, h: p.h * scale, d: p.d * scale }));
}

export function materialCategory(object: Pick<WorldObject, 'kind' | 'name' | 'description'>): MaterialCategory | null {
  if (object.kind !== 'gathered' && object.kind !== 'crafted') return null;
  const name = object.name.toLowerCase();
  if (/\b(fish|venison|meat|berr\w*|fruit|bread|stew|mushroom|egg|honey|meal|heirloom|jewel|coin|text)\b/.test(name)) return null;
  let category: MaterialCategory | null = null;
  if (/\b(clay|adobe|mud brick)\b/.test(name)) category = 'clay';
  else if (/\b(reed|reeds|grass|straw|fiber|fibre|thatch)\b/.test(name)) category = 'thatch';
  else if (/\b(stone|rock|slab|block|cobble)\b/.test(name)) category = 'stone';
  else if (/\b(log|timber|wood|branch|board|beam|plank|bark)\b/.test(name)) category = 'timber';
  if (!category || object.kind === 'crafted' || !object.description.startsWith('taken from the ')) return category;
  const source = object.description.toLowerCase();
  if (/taken from the (tree|old grove)/.test(source)) return category === 'timber' ? category : null;
  if (/taken from the (stone|rock|ore)/.test(source)) return category === 'stone' ? category : null;
  if (/taken from the (reed|plant|grass|flower)/.test(source)) return category === 'thatch' ? category : null;
  if (/taken from the (water|clay bank)/.test(source)) return category === 'clay' ? category : null;
  return null;
}
