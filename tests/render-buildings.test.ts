import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gabledRoofGeometry, harmonizeLabColor, labBuilding } from '../src/web/render/style-recipes.ts';
import { makeObjectMesh } from '../src/web/render/world-things.ts';
import { generateBuildShape } from '../src/server/world/construction.ts';
import type { WorldObject } from '../src/shared/types.ts';

describe('the paint envelope', () => {
  it('keeps hue but pulls any invented colour into gouache range', () => {
    const neon = new THREE.Color(harmonizeLabColor('#00FF00'));
    const hsl = { h: 0, s: 0, l: 0 }; neon.getHSL(hsl);
    expect(hsl.s).toBeLessThanOrEqual(.59); // .58 clamp + hex round-trip drift
    expect(hsl.h).toBeCloseTo(1 / 3, 1);
    const black = new THREE.Color(harmonizeLabColor('#000000'));
    black.getHSL(hsl);
    expect(hsl.l).toBeGreaterThanOrEqual(.31); // .32 clamp − hex round-trip drift
  });
});

describe('completion templates', () => {
  it('builds one solid closed roof — no floating slabs', () => {
    const roof = gabledRoofGeometry(4, 3, 1.2);
    expect(roof.getAttribute('position').count).toBe(24); // 8 triangles, closed prism
  });

  it('gives every home archetype a roof, door, and windows', () => {
    for (const archetype of ['cottage', 'longhouse', 'hut', 'hall', 'granary'] as const) {
      const built = labBuilding({ archetype, width: 4, height: 2.2, depth: 3.2, palette: { plaster: '#F7EEDA', roof: '#C86A47', timber: '#9A6F49', accent: '#A9532F' } });
      expect(built.getObjectByName('labRoof')).toBeTruthy();
      expect(built.getObjectByName('windowGlass')).toBeTruthy();
      let roofParts = 0;
      built.traverse((part) => { if (part.userData.roofPart) roofParts++; });
      expect(roofParts).toBeGreaterThan(0);
    }
  });

  it('renders a COMPLETE structure as its earned final form, an incomplete one as work', () => {
    const spec = { version: 1 as const, archetype: 'cottage' as const, size: 'small' as const, material: 'wood' as const, stage: 4, stageCount: 4, complete: true, addition: null };
    const complete = {
      id: 's1', kind: 'structure', name: 'cottage', pos: { x: 0, y: 0 },
      designSpec: spec, shape: generateBuildShape(spec),
    } as unknown as WorldObject;
    const finished = makeObjectMesh(complete);
    expect(finished.name).toBe('completed-structure');
    expect(finished.getObjectByName('settlement-aura')).toBeTruthy();
    const half = { ...complete, designSpec: { ...spec, stage: 2, complete: false }, shape: generateBuildShape({ ...spec, stage: 2, complete: false }) } as unknown as WorldObject;
    expect(makeObjectMesh(half).name).not.toBe('completed-structure');
  });
});
