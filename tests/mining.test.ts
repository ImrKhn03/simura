/** Minecraft-style mining: ore variety, tool tiers, coal-gated smelting. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { pickTier, oreInStone, ORES } from '../src/server/world/ores.ts';

describe('ore & pick tiers', () => {
  it('pick tiers read from material', () => {
    expect(pickTier('stone pick')).toBe(1);
    expect(pickTier('copper pickaxe')).toBe(2);
    expect(pickTier('bronze pick')).toBe(3);
    expect(pickTier('iron pickaxe')).toBe(4);
  });

  it('named ore stones yield their ore; iron needs cave/high ground', () => {
    const iron = oreInStone({ name: 'iron ore vein', lore: null, pos: { x: 5, y: 5 } }, { nearCave: false, elevation: 0, seed: 42 });
    expect(iron?.smeltsTo).toBe('iron');
    // a generic ore-veined stone near a cave can hold the hard metals
    let sawHard = false;
    for (let x = 0; x < 40; x++) {
      const o = oreInStone({ name: 'ore-veined stone', lore: null, pos: { x, y: 7 } }, { nearCave: true, elevation: 2, seed: 42 });
      if (o && (o.smeltsTo === 'iron' || o.precious)) sawHard = true;
    }
    expect(sawHard).toBe(true);
  });
});

describe('mining physics', () => {
  const oreStone = (db: ReturnType<typeof testWorld>['db'], pos: { x: number; y: number }, name = 'iron ore') =>
    db.createObject({ kind: 'stone', name, description: '', pos, creatorKinId: null, createdAtTick: 1, textContent: null, lore: 'metal', loreDiscovered: false });
  const makePick = (db: ReturnType<typeof testWorld>['db'], kin: { id: string; pos: { x: number; y: number } }, name: string) =>
    db.createObject({ kind: 'crafted', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: kin.id });

  it('a soft pick cannot crack a hard vein; a hard pick can', () => {
    const { db, cfg, ori } = testWorld();
    const iron = oreStone(db, { ...ori.pos });
    makePick(db, ori, 'stone pick');
    const fail = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'gather', params: { targetId: iron.id } });
    expect(fail.ok).toBe(false);
    expect(fail.detail).toMatch(/needs a bronze pick|needs an? bronze|harder tool|only sparks/i);
    expect(db.getObject(iron.id)).not.toBeNull(); // vein survives

    // give a bronze pick — now it breaks and yields iron ore
    for (const h of db.heldInHands(ori.id)) db.setCarried(h.id, null, ori.pos);
    makePick(db, ori, 'bronze pickaxe');
    const ok = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'gather', params: { targetId: iron.id } });
    expect(ok.ok).toBe(true);
    expect(db.listObjects().some((o) => /iron ore/i.test(o.name))).toBe(true);
  });

  it('hard metal will not smelt without coal burning near', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 12, 1);
    // iron ore + fire, but no coal
    makePick(db, ori, 'iron ore chunk'); // in hand as material
    db.createObject({ kind: 'crafted', name: 'campfire', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, emitsLight: true });
    db.createObject({ kind: 'gathered', name: 'iron ore', description: '', pos: { ...ori.pos }, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const noCoal = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'craft', params: { name: 'iron blade', description: 'an iron edge' } });
    expect(noCoal.ok).toBe(false);
    expect(noCoal.detail).toMatch(/coal/i);
    // add coal → it smelts
    db.createObject({ kind: 'gathered', name: 'coal', description: '', pos: { ...ori.pos }, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const ok = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'craft', params: { name: 'iron blade', description: 'an iron edge' } });
    expect(ok.ok).toBe(true);
  });

  it('every ore has coherent tier/smelt data', () => {
    for (const ore of Object.values(ORES)) {
      expect(ore.tier).toBeGreaterThanOrEqual(1);
      if (ore.hotSmelt) expect(ore.tier).toBeGreaterThanOrEqual(3); // hard metals need hard picks
    }
  });
});
