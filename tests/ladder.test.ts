import { describe, it, expect } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb, availableVerbs, carryCapacity } from '../src/server/world/verbs.ts';
import { perceive } from '../src/server/world/world.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { dist, weatherAt, worldSeed } from '../src/server/world/world.ts';
import { Simulation } from '../src/server/sim.ts';
import { MockMind } from '../src/server/llm.ts';
import type { WorldDB } from '../src/server/db.ts';
import type { Kin } from '../src/shared/types.ts';

const makeItem = (db: WorldDB, kin: Kin, name: string, carried = true) =>
  db.createObject({ kind: 'gathered', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: carried ? kin.id : null });

describe('the civilization ladder (eras 5–15)', () => {
  it('era gating: ladder verbs arrive with their eras; Net (16) never by achievement', () => {
    expect(availableVerbs(5)).not.toContain('wear');
    expect(availableVerbs(6)).toContain('wear');
    expect(availableVerbs(9)).toContain('sing');
    expect(availableVerbs(10)).toContain('trade');
    expect(availableVerbs(11)).toEqual(expect.arrayContaining(['assemble', 'propose_law', 'assent', 'leave_bond']));
    expect(availableVerbs(15)).toContain('signal');
  });

  it('The Sack: a carried bag extends what hands can hold from the day it is made', () => {
    const { db, cfg, ori } = testWorld();
    void cfg;
    expect(carryCapacity(db, ori, 0)).toBe(2); // bare hands
    makeItem(db, ori, 'woven basket');
    expect(carryCapacity(db, ori, 0)).toBe(5); // the maker's reward is immediate
    expect(carryCapacity(db, ori, 5)).toBe(5); // and steady across the eras
  });

  it('The Loom: garments are worn, warm, and do not occupy hands', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 6, 1);
    const cloak = makeItem(db, ori, 'reed cloak');
    const w = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'wear', params: { targetId: 'reed cloak' } });
    expect(w.ok).toBe(true);
    expect(w.historic).toBe(true); // first garment ever worn
    expect(db.getObject(cloak.id)!.worn).toBe(true);
    expect(db.heldInHands(ori.id)).toHaveLength(0); // hands free
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    expect(perceive(db, cfg, ori, noon).text).toContain('You wear "reed cloak"');
    // a stone is not clothing
    const rock = makeItem(db, ori, 'round stone');
    const no = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'wear', params: { targetId: rock.id } });
    expect(no.ok).toBe(false);
  });

  it('The Sky: era 7 brings moon and seasons into perception', () => {
    const { db, cfg, ori } = testWorld();
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    expect(perceive(db, cfg, ori, noon).text).not.toMatch(/spring|summer|autumn|winter/);
    godUnlockEra(db, 7, 1);
    expect(perceive(db, cfg, ori, noon).text).toMatch(/spring|summer|autumn|winter/);
    // the moon shows only on clear nights (clouds hide it) — find one
    const seed = worldSeed(db);
    let clearNight = -1;
    for (let d = 0; d < 400; d++) {
      const t = d * cfg.day.lengthTicks + Math.floor(cfg.day.lengthTicks * 0.85);
      if (weatherAt(cfg, t, 7, seed).kind === 'clear') { clearNight = t; break; }
    }
    expect(clearNight).toBeGreaterThan(0);
    expect(perceive(db, cfg, ori, clearNight).text).toMatch(/moon/i);
  });

  it('The Sowing: a held root can be planted and takes to the earth', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 8, 1);
    makeItem(db, ori, 'one small root');
    const r = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'plant', params: {} });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true); // first planting
    const planted = db.listObjects().find((o) => o.name === 'planted one small root')!;
    expect(planted.kind).toBe('plant');
    expect(planted.carriedBy).toBeNull();
  });

  it('The Song: singing carries farther than speech and stays with listeners', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 9, 1);
    db.moveKin(vey.id, { x: ori.pos.x + cfg.speechRadius + 2, y: ori.pos.y }); // beyond speech, within song
    vey.pos = { x: ori.pos.x + cfg.speechRadius + 2, y: ori.pos.y };
    const s = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'sing', params: { song: 'The dark gives way, the dark gives way…' } });
    expect(s.ok).toBe(true);
    expect(s.historic).toBe(true); // the first song
    expect(s.heardBy).toContain(vey.id);
    expect(db.recentMemories(vey.id, 5).some((m) => m.content.includes('sang'))).toBe(true);
  });

  it('The Market: trade proposes an exchange; acceptance swaps the goods', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 10, 1);
    db.moveKin(vey.id, ori.pos); vey.pos = { ...ori.pos };
    makeItem(db, ori, 'flint knife');
    makeItem(db, vey, 'sweet root');
    const offer = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'trade', params: { withKinName: 'Vey', give: 'flint knife', want: 'sweet root' } });
    expect(offer.ok).toBe(true);
    expect(perceive(db, cfg, vey, 20).text).toContain('offers you a trade');
    const done = executeVerb(db, cfg, db.getKin(vey.id)!, 3, { thought: '', verb: 'accept_trade', params: { fromKinName: 'Ori' } });
    expect(done.ok).toBe(true);
    expect(done.historic).toBe(true); // the first trade
    expect(db.heldInHands(vey.id).map((o) => o.name)).toContain('flint knife');
    expect(db.heldInHands(ori.id).map((o) => o.name)).toContain('sweet root');
  });

  it('The Law: assembly reaches everyone; laws are written and gather assent', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 11, 1);
    const call = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'assemble', params: { words: 'Come — we must speak of what is taken.' } });
    expect(call.ok).toBe(true);
    expect(call.historic).toBe(true); // the first assembly
    expect(db.recentMemories(vey.id, 5).some((m) => m.content.includes('calls the Kin to gather'))).toBe(true);
    const law = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'propose_law', params: { title: 'Of Made Things', text: 'What a Kin makes is theirs to keep or give. Taking unasked is a wrong.' } });
    expect(law.ok).toBe(true);
    expect(law.historic).toBe(true); // the first law
    const yes = executeVerb(db, cfg, vey, 4, { thought: '', verb: 'assent', params: { lawTitle: 'Of Made Things' } });
    expect(yes.ok).toBe(true);
    expect(yes.detail).toContain('2 now stand behind it'); // proposer + Vey
    const dup = executeVerb(db, cfg, vey, 5, { thought: '', verb: 'assent', params: { lawTitle: 'Of Made Things' } });
    expect(dup.ok).toBe(false);
  });

  it('The Forge and The Current: metal needs ore+fire; powered light burns without flame', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 12, 1);
    // metal without ore fails
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(ori.id, stone.pos); ori.pos = { ...stone.pos };
    makeItem(db, ori, 'dry branch');
    executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'campfire', description: 'stones and burning branches' } });
    const noOre = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'craft', params: { name: 'iron blade', description: 'a metal edge' } });
    expect(noOre.ok).toBe(false);
    expect(noOre.detail).toContain('needs ore');
    // with ore and fire, metal yields — but IRON is a hard metal: it needs coal burning hot
    makeItem(db, ori, 'iron ore', false);
    const noCoal = executeVerb(db, cfg, ori, 4, { thought: '', verb: 'craft', params: { name: 'iron blade', description: 'a metal edge' } });
    expect(noCoal.ok).toBe(false);
    expect(noCoal.detail).toMatch(/coal/i);
    makeItem(db, ori, 'coal', false);
    const blade = executeVerb(db, cfg, ori, 5, { thought: '', verb: 'craft', params: { name: 'iron blade', description: 'a metal edge' } });
    expect(blade.ok).toBe(true);
    // The Current: generator needs era 14 + metal
    const early = executeVerb(db, cfg, ori, 5, { thought: '', verb: 'craft', params: { name: 'hand generator', description: 'a crank of coiled metal' } });
    expect(early.ok).toBe(false);
    godUnlockEra(db, 13, 6); godUnlockEra(db, 14, 6);
    const gen = executeVerb(db, cfg, ori, 7, { thought: '', verb: 'craft', params: { name: 'hand generator', description: 'a crank of coiled metal' } });
    expect(gen.ok).toBe(true);
    const light = executeVerb(db, cfg, ori, 8, { thought: '', verb: 'craft', params: { name: 'electric lamp', description: 'light without flame' } });
    expect(light.ok).toBe(true);
    expect(db.listObjects().find((o) => o.name === 'electric lamp')!.emitsLight).toBe(true);
  });

  it('The Signal: a voice through a device reaches every Kin, however far', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 15, 1);
    db.moveKin(vey.id, { x: 0, y: 0 }); vey.pos = { x: 0, y: 0 }; // far across the world
    const mute = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'signal', params: { message: 'Vey, can you hear me?' } });
    expect(mute.ok).toBe(false); // no device
    db.createObject({ kind: 'crafted', name: 'signal tower', description: 'metal mast', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    // a dead tower carries nothing — it needs current beside it
    const dead = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'signal', params: { message: 'Hello?' } });
    expect(dead.ok).toBe(false);
    expect(dead.detail).toContain('needs a source of current');
    db.createObject({ kind: 'crafted', name: 'hand-crank generator', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const call = executeVerb(db, cfg, ori, 4, { thought: '', verb: 'signal', params: { message: 'Vey, can you hear me?' } });
    expect(call.ok).toBe(true);
    expect(call.historic).toBe(true); // the first signal
    expect(db.recentMemories(vey.id, 5).some((m) => m.content.includes('A voice arrives through the air'))).toBe(true);
  });

  it('tools are made of things, not wishes: edge + haft required to craft one', () => {
    const { db, cfg, ori } = testWorld();
    db.unlockEra({ era: 1, name: 'The Making', unlockedAtTick: 1, trigger: 'god' });
    // beside only a flower: no edge, no haft → no axe
    const flower = db.listObjects().find((o) => o.kind === 'flower'
      && !db.listObjects().some((x) => x.id !== o.id && (x.kind === 'stone' || x.kind === 'tree') && dist(x.pos, o.pos) <= cfg.craftReachRadius + 1))!;
    db.moveKin(ori.id, flower.pos); ori.pos = { ...flower.pos };
    const wish = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'stone axe', description: 'for felling' } });
    expect(wish.ok).toBe(false);
    expect(wish.detail).toMatch(/edge|haft/);
    // with a gathered flake and a branch at hand, the axe is real
    makeItem(db, ori, 'sharp flint flake', false);
    makeItem(db, ori, 'sturdy branch', false);
    const made = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'craft', params: { name: 'stone axe', description: 'flake lashed to branch' } });
    expect(made.ok).toBe(true);
  });

  it('tools change hands: an axe fells trees, a pick breaks stone, a shovel digs clay', () => {
    const { db, cfg, ori } = testWorld();
    // axe: the tree comes down and becomes logs + branches
    const tree = db.listObjects().find((o) => o.kind === 'tree')!;
    db.moveKin(ori.id, tree.pos); ori.pos = { ...tree.pos };
    makeItem(db, ori, 'stone axe');
    const fell = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'gather', params: { targetId: tree.id } });
    expect(fell.ok).toBe(true);
    expect(fell.detail).toContain('felled the tree');
    expect(db.getObject(tree.id)).toBeNull(); // the tree is GONE
    expect(db.listObjects().some((o) => o.name === 'felled logs')).toBe(true);
    expect(db.listObjects().some((o) => o.name === 'dry branches')).toBe(true);
    // pick: stone breaks into pieces
    executeVerb(db, cfg, ori, 3, { thought: '', verb: 'drop', params: { targetId: 'stone axe' } });
    makeItem(db, ori, 'flint pickaxe');
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.moveKin(ori.id, stone.pos); ori.pos = { ...stone.pos };
    const brk = executeVerb(db, cfg, ori, 4, { thought: '', verb: 'gather', params: { targetId: stone.id } });
    expect(brk.ok).toBe(true);
    expect(db.getObject(stone.id)).toBeNull();
    expect(db.listObjects().filter((o) => o.name === 'broken stone')).toHaveLength(2);
    // shovel: clay from the water's edge
    executeVerb(db, cfg, ori, 5, { thought: '', verb: 'drop', params: { targetId: 'flint pickaxe' } });
    makeItem(db, ori, 'wooden shovel');
    const water = db.listObjects().find((o) => o.kind === 'water')!;
    db.moveKin(ori.id, water.pos); ori.pos = { ...water.pos };
    const dig = executeVerb(db, cfg, ori, 6, { thought: '', verb: 'gather', params: { targetId: water.id } });
    expect(dig.ok).toBe(true);
    expect(db.listObjects().some((o) => o.name === 'clay lump')).toBe(true);
  });

  it('trails: the ground remembers footsteps; expansion seeds fresh wilderness', async () => {
    const { db, cfg, ori } = testWorld();
    for (let i = 0; i < 5; i++) db.moveKin(ori.id, { x: 10, y: 10 });
    expect(db.getTrails(3).some((t) => t.x === 10 && t.y === 10 && t.c >= 5)).toBe(true);
    // expansion: new land, new nature in the outer band only
    const before = db.listObjects().length;
    cfg.map.width += 16; cfg.map.height += 16;
    const { seedRing } = await import('../src/server/world/world.ts');
    seedRing(db, cfg, 16);
    const fresh = db.listObjects().slice(before);
    expect(fresh.length).toBeGreaterThan(5);
    expect(fresh.every((o) => o.pos.x >= cfg.map.width - 16 || o.pos.y >= cfg.map.height - 16)).toBe(true);
    expect(fresh.every((o) => o.lore !== null)).toBe(true); // the frontier holds new truths
  });

  it('weather: deterministic spells, fog blinds, the wet is felt, shelter answers it', () => {
    const { db, cfg, ori } = testWorld();
    const seed = worldSeed(db);
    expect(weatherAt(cfg, 500, 0, seed).kind).toBe(weatherAt(cfg, 500, 0, seed).kind); // deterministic
    // fog exists somewhere and blinds
    let fogTick = -1;
    for (let t = 0; t < 400000; t += 60) { if (weatherAt(cfg, t, 0, seed).kind === 'fog') { fogTick = t; break; } }
    expect(fogTick).toBeGreaterThanOrEqual(0);
    expect(weatherAt(cfg, fogTick, 0, seed).sightFactor).toBeLessThan(0.5);
    // find a DAYLIGHT rain tick (same seed as perceive) and confirm the wet is felt + shelter answers it
    let wetDay = -1;
    for (let t = 5; t < 400000; t += 5) {
      const phase = (t % cfg.day.lengthTicks) / cfg.day.lengthTicks;
      if (phase > 0.1 && phase < 0.4 && weatherAt(cfg, t, 0, seed).wet) { wetDay = t; break; }
    }
    expect(wetDay).toBeGreaterThan(0);
    expect(perceive(db, cfg, ori, wetDay).text).toMatch(/wet and cold|damp but warm|shelter/i);
    db.createObject({ kind: 'structure', name: 'hut', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    expect(perceive(db, cfg, ori, wetDay).text).toContain('beats on stone or roof');
  });

  it('fauna: creatures are caught only with the right tool; bare hands fail', () => {
    const { db, cfg, ori } = testWorld();
    // a fish beside Ori
    const fish = db.createObject({ kind: 'fish', name: 'a fish', description: '', pos: { ...ori.pos }, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const bare = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'gather', params: { targetId: fish.id } });
    expect(bare.ok).toBe(false);
    expect(bare.detail).toMatch(/bolts before your hands|spear, net, hook/);
    // with a net in hand, the fish is caught → food
    makeItem(db, ori, 'woven net');
    const caught = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'gather', params: { targetId: fish.id } });
    expect(caught.ok).toBe(true);
    expect(db.getObject(fish.id)).toBeNull(); // the fish is taken
    expect(db.listObjects().some((o) => o.name === 'fresh fish')).toBe(true);
  });

  it('infinite world: nearing the edge pre-generates fresh seeded land ahead', async () => {
    const { db, cfg, ori, vey } = testWorld();
    // a stationary mind so positions are controlled (mock minds wander)
    const still = {
      chooseAction: async () => ({ choice: { thought: '', verb: 'reflect' as const, params: { insight: `still ${Math.random()}` } }, tokensIn: 0, tokensOut: 0 }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    const sim = new Simulation(db, cfg, still);
    // centre-dwelling does NOT grow the world
    const w0 = cfg.map.width;
    await sim.tickWorld();
    expect(cfg.map.width).toBe(w0);
    // walked to the FAR edge → the world grows outward there with fresh seeded land
    db.moveKin(ori.id, { x: cfg.map.width - 2, y: cfg.map.height - 2 }); ori.pos = { x: cfg.map.width - 2, y: cfg.map.height - 2 };
    const before = db.listObjects().length;
    await sim.tickWorld();
    expect(cfg.map.width).toBeGreaterThan(w0);
    expect(db.listObjects().length).toBeGreaterThan(before);
    // walked to the WEST edge → the world grows into NEGATIVE coords (Minecraft-style, all directions)
    db.moveKin(vey.id, { x: cfg.map.minX + 2, y: 24 }); vey.pos = { x: cfg.map.minX + 2, y: 24 };
    const min0 = cfg.map.minX;
    await sim.tickWorld();
    expect(cfg.map.minX).toBeLessThan(min0);
    expect(db.listObjects().some((o) => o.pos.x < min0)).toBe(true); // fresh land seeded beyond the old west edge
  }, 20_000);

  it('leave_bond: heartbreak is real, remembered, and frees both', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 11, 1);
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    executeVerb(db, cfg, ori, 2, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    executeVerb(db, cfg, db.getKin(vey.id)!, 3, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    const before = db.affection(ori.id, vey.id);
    const cut = executeVerb(db, cfg, db.getKin(ori.id)!, 4, { thought: '', verb: 'leave_bond', params: { words: 'I am sorry.' } });
    expect(cut.ok).toBe(true);
    expect(cut.historic).toBe(true); // the first heartbreak
    expect(db.getKin(ori.id)!.coupleId).toBeNull();
    expect(db.getKin(vey.id)!.coupleId).toBeNull();
    expect(db.affection(ori.id, vey.id)).toBeLessThan(before);
    expect(db.recentMemories(vey.id, 5).some((m) => m.content.includes('ended our bond'))).toBe(true);
  });
});
