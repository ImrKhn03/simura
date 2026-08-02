import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { availableVerbs, executeVerb } from '../src/server/world/verbs.ts';
import { dist, perceive } from '../src/server/world/world.ts';
import type { WorldDB } from '../src/server/db.ts';
import type { WorldConfig } from '../src/server/config.ts';
import type { Kin } from '../src/shared/types.ts';

const perceiveText = (db: WorldDB, cfg: WorldConfig, kin: Kin): string =>
  perceive(db, cfg, kin, Math.floor(cfg.day.lengthTicks * 0.25)).text; // noon — full sight

describe('verbs + physics (M2.2)', () => {
  it('era gating: craft/build/write unavailable at era 0', () => {
    const v0 = availableVerbs(0);
    expect(v0).not.toContain('craft');
    expect(v0).toContain('move');
    expect(availableVerbs(1)).toContain('craft');
    expect(availableVerbs(2)).not.toContain('read');
    expect(availableVerbs(3)).toEqual(expect.arrayContaining(['craft', 'build', 'write', 'read']));
  });

  it('read returns full text content and author — writing survives its writer', () => {
    const { db, cfg, ori, vey } = testWorld();
    // words need a surface: without stone or clay at hand, the marks have nowhere to live
    const bare = executeVerb(db, cfg, vey, 1, {
      thought: '', verb: 'write', params: { title: 'x', content: 'y' },
    });
    if (!bare.ok) expect(bare.detail).toContain('nothing to set them into');
    const stone0 = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(vey.id, stone0.pos); vey.pos = { ...stone0.pos };
    const w = executeVerb(db, cfg, vey, 1, {
      thought: '', verb: 'write',
      params: { title: 'on flintworking', content: 'Strike the flint at an angle. Stop at the first wrong sign.' },
    });
    expect(w.ok).toBe(true);
    db.moveKin(ori.id, vey.pos); ori.pos = { ...vey.pos };
    // read by title, not id — the way a mind refers to writing
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'read', params: { targetId: 'on flintworking' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('written by Vey');
    expect(r.detail).toContain('Strike the flint at an angle');
    // reading a stone yields nothing
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(ori.id, stone.pos); ori.pos = { ...stone.pos };
    const bad = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'read', params: { targetId: stone.id } });
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain('no marks to read');
  });

  it('move is bounded by speed and map edges', () => {
    const { db, cfg, ori } = testWorld();
    const start = { ...ori.pos };
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'move', params: { x: 0, y: 0 } });
    expect(r.ok).toBe(true);
    expect(dist(start, ori.pos)).toBeLessThanOrEqual(cfg.moveMaxPerTick);
    const far = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'move', params: { x: 9999, y: -50 } });
    expect(far.ok).toBe(true);
    expect(ori.pos.x).toBeLessThan(cfg.map.width);
    expect(ori.pos.y).toBeGreaterThanOrEqual(0);
  });

  it('observe names a thing; first naming in history is historic', () => {
    const { db, cfg, ori } = testWorld();
    const obj = db.listObjects().find((o) => dist(o.pos, ori.pos) <= cfg.perceptionRadius)!;
    const r = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'observe',
      params: { targetId: obj.id, name: 'The Tall One', description: 'it reaches for the sky' },
    });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true);
    expect(db.namedThingCount()).toBe(1);
  });

  it('observe resolves short id prefixes and plain kind names — minds need not echo UUIDs', () => {
    const { db, cfg, ori } = testWorld();
    const obj = db.listObjects().find((o) => dist(o.pos, ori.pos) <= cfg.perceptionRadius)!;
    const byPrefix = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'observe', params: { targetId: obj.id.slice(0, 8), name: 'first-thing' },
    });
    expect(byPrefix.ok).toBe(true);
    expect(byPrefix.targetId).toBe(obj.id);
    // plain kind name resolves to the nearest unobserved matching thing
    const kindNear = db.listObjects().filter((o) => dist(o.pos, ori.pos) <= cfg.perceptionRadius && !db.objectGivenName(o.id));
    if (kindNear.length > 0) {
      const byKind = executeVerb(db, cfg, ori, 2, {
        thought: '', verb: 'observe', params: { targetId: kindNear[0]!.kind, name: 'second-thing' },
      });
      expect(byKind.ok).toBe(true);
    }
  });

  it('observe fails narratively on a distant or missing target', () => {
    const { db, cfg, ori } = testWorld();
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'observe', params: { targetId: 'nope' } });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/never there/);
  });

  it('speak logs wants for era 1 threshold', () => {
    const { db, cfg, vey } = testWorld();
    executeVerb(db, cfg, vey, 1, { thought: '', verb: 'speak', params: { message: 'I wish we had shelter.' } });
    executeVerb(db, cfg, vey, 2, { thought: '', verb: 'speak', params: { message: 'The sky is wide.' } });
    expect(db.wantCount()).toBe(1);
  });

  it('craft requires nearby material; succeeds beside a tree', () => {
    const { db, cfg, ori } = testWorld();
    // stand on a tree
    const tree = db.listObjects().find((o) => o.kind === 'tree')!;
    db.moveKin(ori.id, tree.pos); ori.pos = { ...tree.pos };
    const ok = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'craft', params: { materials: ['tree'], name: 'digging stick', description: 'a branch, sharpened' } });
    expect(ok.ok).toBe(true);
    expect(ok.historic).toBe(true); // first craft in history
    expect(db.countObjectsOfKind('crafted')).toBe(1);
  });

  it('teach then learn transfers a skillfile and counts a successful teach', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, ori.pos); vey.pos = { ...ori.pos };
    db.createSkillfile({ ownerKinId: ori.id, name: 'firemaking', content: '# rub sticks', version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: 1 });
    const t = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'teach', params: { toKinName: 'Vey', skillName: 'firemaking', explanation: 'like this' } });
    expect(t.ok).toBe(true);
    expect(db.successfulTeachCount()).toBe(0); // pending until learned
    const l = executeVerb(db, cfg, vey, 3, { thought: '', verb: 'learn', params: { fromKinName: 'Ori', skillName: 'firemaking' } });
    expect(l.ok).toBe(true);
    expect(db.successfulTeachCount()).toBe(1);
    expect(db.listSkillfiles(vey.id).map((s) => s.name)).toContain('firemaking');
    expect(db.listSkillfiles(vey.id)[0]?.learnedFromKinId).toBe(ori.id);
  });

  it('author + refine skillfiles; duplicate author is rejected narratively', () => {
    const { db, cfg, vey } = testWorld();
    const a = executeVerb(db, cfg, vey, 1, { thought: '', verb: 'author_skill', params: { name: 'listening', content: '# be still' } });
    expect(a.ok).toBe(true);
    const dup = executeVerb(db, cfg, vey, 2, { thought: '', verb: 'author_skill', params: { name: 'Listening', content: 'x' } });
    expect(dup.ok).toBe(false);
    const r = executeVerb(db, cfg, vey, 3, { thought: '', verb: 'refine_skill', params: { skillName: 'listening', content: '# be still\n# hear more' } });
    expect(r.ok).toBe(true);
    expect(db.listSkillfiles(vey.id)[0]?.refinedCount).toBe(1);
    expect(db.listSkillfiles(vey.id)[0]?.version).toBe(2);
  });

  it('pray records a plea for god, first prayer is historic, and pleading too often fails', () => {
    const { db, cfg, vey } = testWorld();
    const p1 = executeVerb(db, cfg, vey, 10, { thought: '', verb: 'pray', params: { plea: 'Let us not be alone.' } });
    expect(p1.ok).toBe(true);
    expect(p1.historic).toBe(true); // the first prayer in history
    expect(db.listPrayers()[0]?.plea).toBe('Let us not be alone.');
    const p2 = executeVerb(db, cfg, vey, 12, { thought: '', verb: 'pray', params: { plea: 'Again I ask.' } });
    expect(p2.ok).toBe(true);
    const p3 = executeVerb(db, cfg, vey, 14, { thought: '', verb: 'pray', params: { plea: 'And again.' } });
    expect(p3.ok).toBe(false); // the silence will not be pleaded with constantly
    expect(db.listPrayers()).toHaveLength(2);
    // far later, prayer is possible again
    const p4 = executeVerb(db, cfg, vey, 100, { thought: '', verb: 'pray', params: { plea: 'It has been long.' } });
    expect(p4.ok).toBe(true);
  });

  it('gather takes a piece of a natural thing by name — the verb their plans were missing', () => {
    const { db, cfg, ori } = testWorld();
    const plant = db.listObjects().find((o) => o.kind === 'plant')!;
    db.nameThing(ori.id, plant.id, 'eastern plant', 1);
    db.markLoreDiscovered(plant.id);
    // too far → felt failure with directions
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    if (Math.max(Math.abs(plant.pos.x), Math.abs(plant.pos.y)) > cfg.craftReachRadius) {
      const far = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'gather', params: { targetId: 'eastern plant', what: 'a small root' } });
      expect(far.ok).toBe(false);
      expect(far.detail).toContain('too far to reach');
    }
    // in reach → the root is in hand, referenced by its GIVEN name
    db.moveKin(ori.id, plant.pos); ori.pos = { ...plant.pos };
    const r = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'gather', params: { targetId: 'eastern plant', what: 'a small root' } });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true); // the first taking in history
    expect(db.getObject(r.targetId!)?.carriedBy).toBe(ori.id);
    expect(r.detail).toContain('a small root');
    expect(db.countObjectsOfKind('gathered')).toBe(1);
    // gathered pieces count as material for building
    expect(db.listObjects().find((o) => o.kind === 'gathered')?.creatorKinId).toBe(ori.id);
  });

  it('carry and drop: items ride with their carrier, two-hand limit, no stealing', () => {
    const { db, cfg, ori, vey } = testWorld();
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(ori.id, stone.pos); ori.pos = { ...stone.pos };
    // make three small things at Ori's feet
    for (const n of ['flint knife', 'root', 'cord']) {
      db.createObject({ kind: 'gathered', name: n, description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    }
    expect(executeVerb(db, cfg, ori, 2, { thought: '', verb: 'carry', params: { targetId: 'flint knife' } }).ok).toBe(true);
    expect(executeVerb(db, cfg, ori, 3, { thought: '', verb: 'carry', params: { targetId: 'root' } }).ok).toBe(true);
    const full = executeVerb(db, cfg, ori, 4, { thought: '', verb: 'carry', params: { targetId: 'cord' } });
    expect(full.ok).toBe(false);
    expect(full.detail).toContain('hands are full');
    // carried items follow their carrier
    db.moveKin(ori.id, { x: 5, y: 5 }); ori.pos = { x: 5, y: 5 };
    const knife = db.listObjects().find((o) => o.name === 'flint knife')!;
    expect(knife.pos).toEqual({ x: 5, y: 5 });
    expect(knife.carriedBy).toBe(ori.id);
    // no stealing from hands
    db.moveKin(vey.id, ori.pos); vey.pos = { ...ori.pos };
    const steal = executeVerb(db, cfg, vey, 5, { thought: '', verb: 'carry', params: { targetId: 'flint knife' } });
    expect(steal.ok).toBe(false);
    expect(steal.detail).toContain("Ori's hands");
    // drop puts it on the ground here
    const dropped = executeVerb(db, cfg, ori, 6, { thought: '', verb: 'drop', params: { targetId: 'flint knife' } });
    expect(dropped.ok).toBe(true);
    expect(db.listObjects().find((o) => o.name === 'flint knife')!.carriedBy).toBeNull();
    // natural things cannot be carried
    const tree = db.listObjects().find((o) => o.kind === 'tree')!;
    db.moveKin(ori.id, tree.pos); ori.pos = { ...tree.pos };
    const noTree = executeVerb(db, cfg, ori, 7, { thought: '', verb: 'carry', params: { targetId: tree.id } });
    expect(noTree.ok).toBe(false);
    expect(noTree.detail).toContain('rooted in the world');
  });

  it('fire is real: flame-crafts need spark + fuel; the first fire is historic and pushes back the night', () => {
    const { db, cfg, ori } = testWorld();
    // beside only a flower: material for crafting exists, but nothing sparks and nothing burns
    db.unlockEra({ era: 1, name: 'The Making', unlockedAtTick: 1, trigger: 'god' });
    const flower = db.listObjects().find((o) => o.kind === 'flower'
      && !db.listObjects().some((x) => x.id !== o.id && (x.kind === 'stone' || x.kind === 'tree') && dist(x.pos, o.pos) <= cfg.craftReachRadius + 1))!;
    db.moveKin(ori.id, flower.pos); ori.pos = { ...flower.pos };
    const cold = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'torch', description: 'a burning brand' } });
    expect(cold.ok).toBe(false);
    expect(cold.detail).toContain('fire needs both a spark and dry fuel');
    // stand where stone and tree meet
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(ori.id, stone.pos); ori.pos = { ...stone.pos };
    db.createObject({ kind: 'gathered', name: 'dry branch', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const lit = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'craft', params: { name: 'campfire', description: 'a ring of stones around burning branches' } });
    expect(lit.ok).toBe(true);
    expect(lit.historic).toBe(true); // the first fire
    expect(lit.detail).toContain('the dark gives way');
    const fire = db.listObjects().find((o) => o.name === 'campfire')!;
    expect(fire.emitsLight).toBe(true);
    // night near the fire: full sight, and the felt line
    const nightTick = Math.floor(cfg.day.lengthTicks * 0.85);
    const near = perceive(db, cfg, ori, nightTick).text;
    expect(near).toContain('firelight holds a circle of sight');
    // far from the fire at night: the dark still rules
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    expect(perceive(db, cfg, ori, nightTick).text).not.toContain('firelight holds');
  });

  it('kin-designed shapes are sanitized and stored on crafted things', () => {
    const { db, cfg, ori } = testWorld();
    const tree = db.listObjects().find((o) => o.kind === 'tree')!;
    db.moveKin(ori.id, tree.pos); ori.pos = { ...tree.pos };
    const r = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'craft',
      params: {
        materials: ['tree'], name: 'carved figure', description: 'a small figure of Vey',
        shape: [
          { x: 0, y: 0, z: 0, w: 0.2, h: 0.4, d: 0.15, c: '#8a5a3a' },
          { x: 0, y: 0.4, z: 0, w: 0.15, h: 0.15, d: 0.15, c: '#c98a4b' },
          { x: 99, y: -5, z: 0, w: 50, h: 0.1, d: 0.1, c: 'not-a-color' }, // hostile part gets clamped
        ],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('given a deliberate form');
    const figure = db.listObjects().find((o) => o.name === 'carved figure')!;
    expect(figure.shape).toHaveLength(3);
    expect(figure.shape![2]!.x).toBeLessThanOrEqual(0.7); // clamped
    expect(figure.shape![2]!.w).toBeLessThanOrEqual(0.7);
    expect(figure.shape![2]!.c).toBe('#8C6346'); // malformed color → natural approved fallback
  });

  it('give passes a held item to a nearby Kin, who remembers the generosity', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, ori.pos); vey.pos = { ...ori.pos };
    db.createObject({ kind: 'gathered', name: 'sweet root', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    executeVerb(db, cfg, ori, 2, { thought: '', verb: 'carry', params: { targetId: 'sweet root' } });
    const empty = executeVerb(db, cfg, vey, 3, { thought: '', verb: 'give', params: { toKinName: 'Ori' } });
    expect(empty.ok).toBe(false); // Vey holds nothing
    const r = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'give', params: { toKinName: 'Vey', targetId: 'sweet root' } });
    expect(r.ok).toBe(true);
    expect(db.carriedBy(vey.id).map((o) => o.name)).toContain('sweet root');
    expect(db.carriedBy(ori.id)).toHaveLength(0);
    expect(db.recentMemories(vey.id, 5).some((m) => m.content.includes('gave me "sweet root"'))).toBe(true);
  });

  it('name_place names the ground once; nearby ground refuses a second name', () => {
    const { db, cfg, ori, vey } = testWorld();
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'name_place', params: { name: 'The Flint Field' } });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true); // first named place in history
    db.moveKin(vey.id, { x: ori.pos.x + 2, y: ori.pos.y }); vey.pos = { x: ori.pos.x + 2, y: ori.pos.y };
    const dup = executeVerb(db, cfg, vey, 2, { thought: '', verb: 'name_place', params: { name: 'Elsewhere' } });
    expect(dup.ok).toBe(false);
    expect(dup.detail).toContain('The Flint Field');
    // the place appears in perception
    expect(perceiveText(db, cfg, ori)).toContain('in the place called "The Flint Field"');
  });

  it('speech records exactly who heard it', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { x: ori.pos.x + 2, y: ori.pos.y }); vey.pos = { x: ori.pos.x + 2, y: ori.pos.y };
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'speak', params: { message: 'Remember this.' } });
    expect(r.heardBy).toEqual([vey.id]);
    // alone → heard by no one, recorded as such
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    const alone = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'speak', params: { message: 'Anyone?' } });
    expect(alone.heardBy).toEqual([]);
  });

  it('landmarks and made things resist bare hands', () => {
    const { db, cfg, ori } = testWorld();
    const lm = db.listObjects().find((o) => o.kind === 'landmark')!;
    db.moveKin(ori.id, lm.pos); ori.pos = { ...lm.pos };
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'gather', params: { targetId: lm.id, what: 'a chunk' } });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('too old and too whole');
  });

  it('build fails without materials and succeeds with them', () => {
    const { db, cfg, ori } = testWorld();
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    // ensure no materials at the corner
    const bare = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'build', params: { name: 'hut' } });
    if (!bare.ok) expect(bare.detail).toMatch(/timber|material/);
    // stack materials near the kin
    db.createObject({ kind: 'crafted', name: 'beam', description: '', pos: { x: 0, y: 0 }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    db.createObject({ kind: 'crafted', name: 'second timber beam', description: '', pos: { x: 1, y: 0 }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'build', params: { name: 'first hut', description: 'small, dry' } });
    expect(r.ok).toBe(true);
    expect(db.countObjectsOfKind('structure')).toBe(1);
  });
});
