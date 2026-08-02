import { describe, expect, it } from 'vitest';
import { presentCreature } from '../src/server/world/ecosystem.ts';
import { testWorld } from './helpers.ts';
import type { WorldObject } from '../src/shared/types.ts';

describe('server creature presentation', () => {
  it('matches flee, hunt, fire, young, kept, threat, and lore truth', () => {
    const { db, ori, vey } = testWorld();
    db.moveKin(ori.id, { x: 10, y: 10 }); db.moveKin(vey.id, { x: 30, y: 30 });
    const base = { description: '', creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false,
      carriedBy: null, storedIn: null, yieldLeft: null, shape: null, designSpec: null, emitsLight: false, worn: false } as const;
    const predator = { ...base, id: 'pred', kind: 'predator', name: 'a grey wolf', pos: { x: 10, y: 10 } } as WorldObject;
    const prey = { ...base, id: 'prey', kind: 'deer', name: 'a young red deer', pos: { x: 11, y: 10 }, lore: 'turns its ears to sound', loreDiscovered: true } as WorldObject;
    let all = [predator, prey]; const kin = db.listKin(true);
    expect(presentCreature(prey, all, kin, () => [])).toMatchObject({ young: true, kept: false, activity: 'fleeing', lore: 'turns its ears to sound' });
    expect(presentCreature(predator, all, kin, () => [])).toMatchObject({ activity: 'lunging', threatenedKinIds: [ori.id] });
    const fire = { ...base, id: 'fire', kind: 'crafted', name: 'a fire', pos: { x: 10, y: 11 }, emitsLight: true } as WorldObject;
    all = [predator, prey, fire];
    expect(presentCreature(predator, all, kin, () => [])).toMatchObject({ activity: 'fleeing-fire', threatenedKinIds: [] });
    const keptFish = { ...prey, id: 'fish', kind: 'fish', name: 'a kept fish', loreDiscovered: false } as WorldObject;
    expect(presentCreature(keptFish, [keptFish], kin, () => [])).toMatchObject({ kept: false, lore: null });
  });

  it('does not threaten accompanied or armed Kin', () => {
    const { db, ori, vey } = testWorld(); db.moveKin(ori.id, { x: 4, y: 4 }); db.moveKin(vey.id, { x: 5, y: 4 });
    const predator = db.createObject({ kind: 'predator', name: 'a mountain lion', description: '', pos: { x: 4, y: 4 }, creatorKinId: null, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    expect(presentCreature(predator, [predator], db.listKin(true), () => [])?.threatenedKinIds).toEqual([]);
  });
});
