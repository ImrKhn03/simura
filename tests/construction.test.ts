import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildArchetype, BuildDesignSpec, BuildMaterial, BuildSize } from '../src/shared/types.ts';
import { WorldDB } from '../src/server/db.ts';
import { MockMind } from '../src/server/llm.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { perceive, settlementAt } from '../src/server/world/world.ts';
import {
  ARCHETYPES, BUILD_RULES, buildStageParts, generateBuildShape, isFunctionalStructure,
  extensionMaterialBills, generateCraftTemplate, materialBill, normalizeFreeformStructure,
  parseBuildSpec, snapDye, stagedMaterialBills, totalMaterialUnits,
} from '../src/server/world/construction.ts';
import { testWorld } from './helpers.ts';
import { selectConstructionMaterials } from '../src/server/world/construction-materials.ts';

const tempDirs: string[] = [];
afterEach(() => { while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true }); });

function design(archetype: BuildArchetype, size: BuildSize = 'small', material: BuildMaterial = 'wood'): BuildDesignSpec {
  const rule = BUILD_RULES[archetype];
  return { version: 1, archetype, size, material, stage: rule.stages, stageCount: rule.stages, complete: true, addition: null };
}

describe('server-owned construction design', () => {
  it('validates compact choices and normalizes defaults', () => {
    expect(parseBuildSpec({ archetype: 'hut', material: 'stone' }, '')).toMatchObject({ archetype: 'hut', material: 'wood', size: 'small' });
    expect(parseBuildSpec({}, 'the long house')).toMatchObject({ archetype: 'longhouse' });
    expect(parseBuildSpec({ archetype: 'spaceship' }, 'oddity')).toBeNull();
  });

  it.each(ARCHETYPES)('%s has deterministic staged, bounded, human-scale geometry', (archetype) => {
    const spec = design(archetype);
    const a = buildStageParts(spec); const b = buildStageParts(spec);
    expect(a).toEqual(b);
    expect(a).toHaveLength(BUILD_RULES[archetype].stages);
    const finished = generateBuildShape(spec);
    expect(finished).toEqual(a.flat());
    expect(finished.length).toBeLessThanOrEqual(48);
    expect(Math.max(...finished.map((p) => p.y + p.h))).toBeGreaterThanOrEqual(archetype === 'fence' ? 1.2 : 2);
    expect(Math.max(...finished.flatMap((p) => [Math.abs(p.x) + p.w / 2, Math.abs(p.z) + p.d / 2]))).toBeLessThanOrEqual(8);
  });

  it('uses the exact canonical bills and deterministic per-stage allocation', () => {
    for (const archetype of ARCHETYPES) {
      expect(totalMaterialUnits(archetype, 'small')).toBe(BUILD_RULES[archetype].small);
      expect(totalMaterialUnits(archetype, 'large')).toBe(Math.ceil(BUILD_RULES[archetype].small * 1.5));
      for (const material of BUILD_RULES[archetype].valid) {
        const bill = materialBill(archetype, 'small', material);
        expect(Object.values(bill).reduce((a, b) => a + b, 0)).toBe(BUILD_RULES[archetype].small);
        const stages = stagedMaterialBills(design(archetype, 'small', material));
        expect(stages.every((s) => Object.values(s).reduce((a, b) => a + b, 0) >= 1)).toBe(true);
        expect(stages.reduce((sum, s) => sum + Object.values(s).reduce((a, b) => a + b, 0), 0)).toBe(BUILD_RULES[archetype].small);
      }
    }
    expect(materialBill('cottage', 'small', 'stone')).toEqual({ timber: 1, stone: 6, clay: 0, thatch: 0 });
    const extension = extensionMaterialBills(design('hall', 'small', 'stone'));
    expect(extension).toHaveLength(3);
    expect(extension.every((stage) => Object.values(stage).reduce((a, b) => a + b, 0) >= 1)).toBe(true);
    expect(extension.flatMap((stage) => Object.entries(stage).filter(([, count]) => count > 0).map(([kind]) => kind))).toContain('timber');
  });

  it('snaps model color agency to the approved dye palette', () => {
    expect(snapDye('berry')).toEqual({ name: 'berry', hex: '#A94F61' });
    expect(snapDye('#aa5060')?.name).toBe('berry');
    expect(snapDye('laser-neon')).toBeNull();
  });

  it('generates bounded compact craft forms and leaves singular work freeform', () => {
    for (const template of ['tool', 'vessel', 'garment', 'coin'] as const) {
      const shape = generateCraftTemplate(template, 'wood', 'indigo')!;
      expect(shape.length).toBeGreaterThan(0);
      expect(shape.length).toBeLessThanOrEqual(8);
      expect(shape.every((part) => Math.max(part.w, part.h, part.d) <= 0.7)).toBe(true);
    }
    expect(generateCraftTemplate('throne-of-clouds', 'mist', 'neon')).toBeNull();
  });

  it('raises tiny freeform architecture uniformly but keeps it bounded', () => {
    const tiny = [{ x: 0, y: 0, z: 0, w: 0.2, h: 0.2, d: 0.2, c: '#8C6346' }];
    const normalized = normalizeFreeformStructure(tiny);
    expect(normalized[0]!.w).toBeCloseTo(normalized[0]!.h);
    expect(normalized[0]!.h).toBeGreaterThanOrEqual(2);
    expect(normalizeFreeformStructure([])).toEqual([]);
  });

  it('cuts representative routine build parameters by at least 70 percent', () => {
    const compact = JSON.stringify({ archetype: 'cottage', size: 'small', material: 'wood', dye: 'ochre', name: 'Dawn Home', description: 'a home facing sunrise' });
    for (const count of [8, 20, 40]) {
      const legacy = JSON.stringify({ name: 'Dawn Home', description: 'a home facing sunrise', shape: Array.from({ length: count }, (_, i) => ({ x: i / 10, y: 0.2, z: i / 20, w: 1.25, h: 2.4, d: 0.25, c: '#8a5a3a' })) });
      expect(compact.length / legacy.length).toBeLessThan(0.3);
    }
  });

  it('backs up a persistent old world before the additive design migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'simura-design-')); tempDirs.push(dir);
    const path = join(dir, 'world.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE world_objects (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      x INTEGER NOT NULL, y INTEGER NOT NULL, creator_kin_id TEXT, created_at_tick INTEGER NOT NULL,
      text_content TEXT, lore TEXT, lore_discovered INTEGER NOT NULL DEFAULT 0, carried_by TEXT, shape TEXT,
      emits_light INTEGER NOT NULL DEFAULT 0, worn INTEGER NOT NULL DEFAULT 0, stored_in TEXT, yield_left INTEGER
    )`);
    old.exec(`INSERT INTO world_objects(id,kind,name,x,y,created_at_tick) VALUES ('legacy','structure','old home',1,1,1)`);
    old.close();
    const migrated = new WorldDB(path);
    expect(migrated.getObject('legacy')?.designSpec).toBeNull();
    migrated.close();
    const backup = readdirSync(dir).find((name) => name.includes('.pre-design-v1.'));
    expect(backup).toBeTruthy();
    const verify = new DatabaseSync(join(dir, backup!), { readOnly: true });
    expect((verify.prepare(`SELECT COUNT(*) c FROM world_objects`).get() as { c: number }).c).toBe(1);
    verify.close();
    const reopened = new WorldDB(path); reopened.close();
    expect(readdirSync(dir).filter((name) => name.includes('.pre-design-v1.'))).toHaveLength(1);
  });

  it('preserves malformed design rows as functional legacy shapes', () => {
    const { db } = testWorld();
    const object = db.createObject({ kind: 'structure', name: 'Old Work', description: '', pos: { x: 1, y: 1 }, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, shape: [{ x: 0, y: 0, z: 0, w: 3, h: 2, d: 3, c: '#8C6346' }] });
    db.db.prepare(`UPDATE world_objects SET design_spec=? WHERE id=?`).run('{not-json', object.id);
    const loaded = db.getObject(object.id)!;
    expect(loaded.designSpec).toBeNull();
    expect(loaded.shape).toHaveLength(1);
    expect(isFunctionalStructure(loaded)).toBe(true);
  });

  it('can disable new compact sites while stored compact work remains usable', () => {
    const { db, cfg, ori } = testWorld();
    cfg.flags.buildArchetypes = false;
    const rejected = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'build', params: { archetype: 'hut', name: 'Quiet Hut' } });
    expect(rejected.ok).toBe(false);
    expect(rejected.detail).not.toMatch(/archetype|parameter|json|verb|targetId/i);
    const complete = design('hut');
    const stored = db.createObject({ kind: 'structure', name: 'Stored Hut', description: '', pos: ori.pos, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, designSpec: complete, shape: generateBuildShape(complete) });
    expect(isFunctionalStructure(db.getObject(stored.id)!)).toBe(true);
  });
});

describe('construction material physics', () => {
  const add = (db: WorldDB, name: string, pos: { x: number; y: number }, carriedBy: string | null = null) => db.createObject({
    kind: 'gathered', name, description: '', pos, creatorKinId: carriedBy, createdAtTick: 1,
    textContent: null, lore: null, loreDiscovered: false, carriedBy,
  });

  it('requires real material atomically and completes a hut stage by stage', () => {
    const { db, cfg, ori } = testWorld();
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    db.createObject({ kind: 'tree', name: 'tree', description: '', pos: ori.pos, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    add(db, 'fresh berries', ori.pos);
    const short = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'build', params: { archetype: 'hut', size: 'small', material: 'wood', name: 'Quiet Hut' } });
    expect(short.ok).toBe(false);
    expect(short.detail).toContain('timber');
    expect(db.listObjects().some((o) => o.name === 'fresh berries')).toBe(true);
    add(db, 'timber beam one', ori.pos); add(db, 'timber beam two', ori.pos);
    const begun = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'build', params: { archetype: 'hut', size: 'small', material: 'wood', name: 'Quiet Hut' } });
    expect(begun.ok).toBe(true);
    const site = db.getObject(begun.targetId!)!;
    expect(site.designSpec?.stage).toBe(1);
    expect(isFunctionalStructure(site)).toBe(false);
    for (let stage = 2; stage <= 4; stage++) {
      add(db, `timber log ${stage}`, ori.pos);
      const result = executeVerb(db, cfg, ori, stage + 1, { thought: '', verb: 'build', params: { targetId: site.id } });
      expect(result.ok).toBe(true);
    }
    const complete = db.getObject(site.id)!;
    expect(complete.designSpec?.complete).toBe(true);
    expect(isFunctionalStructure(complete)).toBe(true);
  });

  it('draws deterministically from builder, companion, ground, then a reachable stash', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, ori.pos); vey.pos = { ...ori.pos };
    const own = add(db, 'own timber beam', ori.pos, ori.id);
    const companion = add(db, 'companion timber beam', ori.pos, vey.id);
    const ground = add(db, 'ground timber beam', ori.pos);
    const stash = db.createObject({ kind: 'crafted', name: 'storage chest', description: '', pos: ori.pos, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const kept = add(db, 'stored timber beam', ori.pos); db.setStored(kept.id, stash.id, stash.pos);
    const picked = selectConstructionMaterials(db, ori, { timber: 4, stone: 0, clay: 0, thatch: 0 }, cfg.craftReachRadius + 1);
    expect(picked.missing).toEqual({});
    expect(picked.selected.map((o) => o.id)).toEqual([own.id, companion.id, ground.id, kept.id]);
  });

  it('keeps partial civic and sacred sites from becoming shelter or settlements', () => {
    const { db, cfg, ori } = testWorld();
    const p = { ...ori.pos }; db.addPlace('Unfinished Ground', p, ori.id, 1);
    db.createObject({ kind: 'structure', name: 'old home', description: '', pos: p, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const partial = { ...design('hall'), stage: 1, complete: false };
    db.createObject({ kind: 'structure', name: 'meeting hall shrine', description: '', pos: p, creatorKinId: ori.id, createdAtTick: 2, textContent: null, lore: null, loreDiscovered: false, designSpec: partial, shape: generateBuildShape(partial) });
    expect(settlementAt(db, p)).toBeNull();
    const sensed = perceive(db, cfg, db.getKin(ori.id)!, 5).text;
    expect(sensed).not.toMatch(/built for all|the people share|place set apart, sacred/);
  });

  it('keeps a completed base functional while an addition rises', () => {
    const { db, cfg, ori } = testWorld();
    const complete = design('hut');
    const hut = db.createObject({ kind: 'structure', name: 'Quiet Hut', description: '', pos: ori.pos, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, designSpec: complete, shape: generateBuildShape(complete) });
    add(db, 'timber beam a', ori.pos); add(db, 'timber beam b', ori.pos); add(db, 'timber beam c', ori.pos);
    const result = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'build', params: { targetId: hut.id, addition: 'room' } });
    expect(result.ok).toBe(true);
    const growing = db.getObject(hut.id)!;
    expect(growing.designSpec?.addition).toMatchObject({ kind: 'room', stage: 1, complete: false });
    expect(isFunctionalStructure(growing)).toBe(true);
  });

  it('lets the autonomous mock contract finish a compact build without hints or retries', async () => {
    const { db, cfg, ori } = testWorld();
    const mind = new MockMind();
    const firstStone = add(db, 'a workable stone', ori.pos);
    const first = await mind.chooseAction(ori, '', `[obj:${firstStone.id.slice(0, 8)}] a workable stone (unnamed) at (0,0)`, ['build']);
    expect(first.choice.verb).toBe('build');
    const legacyOutput = { thought: 'The stone can mark this ground.', verb: 'build', params: { name: 'stone ring', shape: Array.from({ length: 20 }, (_, i) => ({ x: i / 10, y: 0.2, z: 0, w: 0.4, h: 1.2, d: 0.2, c: '#777777' })) } };
    expect(first.tokensOut / Math.ceil(JSON.stringify(legacyOutput).length / 4)).toBeLessThan(0.3);
    const begun = executeVerb(db, cfg, ori, 1, first.choice);
    expect(begun.ok).toBe(true);
    const secondStone = add(db, 'a workable stone', ori.pos);
    const second = await mind.chooseAction(ori, '', `[obj:${begun.targetId!.slice(0, 8)}] stone ring (unnamed) — foundations and frame are still rising; more stone is needed\n[obj:${secondStone.id.slice(0, 8)}] a workable stone (unnamed) at (0,0)`, ['build']);
    expect(second.choice).toMatchObject({ verb: 'build', params: { targetId: begun.targetId!.slice(0, 8) } });
    const finished = executeVerb(db, cfg, ori, 2, second.choice);
    expect(finished.ok).toBe(true);
    expect(db.getObject(begun.targetId!)?.designSpec?.complete).toBe(true);
  });
});
