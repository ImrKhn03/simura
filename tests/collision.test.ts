import { describe, expect, it } from 'vitest';
import type { WorldObject } from '../src/shared/types.ts';
import { resolveKinMove } from '../src/server/world/collision.ts';
import { generateBuildShape } from '../src/server/world/construction.ts';

const object = (overrides: Partial<WorldObject>): WorldObject => ({
  id: 'obstacle', kind: 'tree', name: 'tree', description: '', pos: { x: 1, y: 0 }, creatorKinId: null,
  createdAtTick: 0, textContent: null, lore: null, loreDiscovered: false, carriedBy: null, storedIn: null,
  yieldLeft: null, shape: null, designSpec: null, emitsLight: false, worn: false, ...overrides,
});

describe('Kin body collision', () => {
  it.each(['tree', 'stone'] as const)('cannot tunnel through a rooted %s', (kind) => {
    const result = resolveKinMove({ x: 0, y: 0 }, { x: 3, y: 0 }, [object({ kind, name: kind })]);
    expect(result.blocked).toBe(true);
    expect(result.pos.x).toBeLessThan(1);
  });

  it('blocks walls but permits a generated doorway', () => {
    const spec = { version: 1 as const, archetype: 'hut' as const, size: 'small' as const, material: 'wood' as const,
      stage: 4, stageCount: 4, complete: true, addition: null };
    const hut = object({ kind: 'structure', name: 'hut', pos: { x: 0, y: 0 }, designSpec: spec, shape: generateBuildShape(spec) });
    const wall = resolveKinMove({ x: -3, y: 0 }, { x: 0, y: 0 }, [hut]);
    expect(wall.blocked).toBe(true);
    const doorway = resolveKinMove({ x: 0, y: 3 }, { x: 0, y: 0 }, [hut]);
    expect(doorway.pos.y).toBeLessThan(1.2);
  });

  it('ignores grass, held things, wearables, and small ground clutter', () => {
    const clutter = [
      object({ kind: 'plant', name: 'grass' }),
      object({ kind: 'crafted', name: 'hat', carriedBy: 'kin', worn: true, shape: [{ x: 0, y: 0, z: 0, w: .5, h: .3, d: .5, c: '#fff' }] }),
      object({ kind: 'gathered', name: 'timber', pos: { x: 2, y: 0 } }),
    ];
    expect(resolveKinMove({ x: 0, y: 0 }, { x: 3, y: 0 }, clutter)).toMatchObject({ pos: { x: 3, y: 0 }, blocked: false });
  });

  it('never lets two Kin share the same ground', () => {
    const other = { x: 2, y: 0 };
    const walk = resolveKinMove({ x: 0, y: 0 }, { x: 2, y: 0 }, [], [other]);
    expect(walk.blocked).toBe(true);
    expect(walk.obstacle).toBe('kin');
    expect(Math.hypot(walk.pos.x - other.x, walk.pos.y - other.y)).toBeGreaterThanOrEqual(0.42);
    const passBy = resolveKinMove({ x: 0, y: 0 }, { x: 4, y: 2 }, [], [{ x: 2, y: 0 }]);
    expect(Math.hypot(passBy.pos.x - 4, passBy.pos.y - 2)).toBeLessThan(1.6);
  });
});
