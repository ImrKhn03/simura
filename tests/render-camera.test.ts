import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PublicKinSnapshot, WorldSnapshot } from '../src/shared/types.ts';
import { CameraRig } from '../src/web/render/camera.ts';
import type { KinBody } from '../src/web/render/world-things.ts';

const kin = { id: 'ori', status: 'alive', pos: { x: 3, y: 4 } } as PublicKinSnapshot;
const snapshot = { kin: [kin], objects: [], recentEvents: [], tick: 1 } as unknown as WorldSnapshot;

function body(): KinBody {
  const group = new THREE.Group(); group.position.set(3, 0, 4);
  return { group, rig: { group } as KinBody['rig'], from: group.position.clone(), to: group.position.clone(), animStart: 0, animDur: 1, verb: 'reflect', asleep: false, kin, bodySig: 'adult' };
}

describe('explorer camera (the one view)', () => {
  it('is always in the single explorer mode, whatever older paths request', () => {
    const cinema = vi.fn(); const changed = vi.fn();
    const rig = new CameraRig(new THREE.PerspectiveCamera(), cinema, changed);
    const context = { bodies: new Map<string, KinBody>(), snapshot };
    rig.setMode('eye', context); rig.setMode('cinema', context); rig.setMode('fly', context);
    expect(rig.cameraMode).toBe('auto');
    expect(changed).toHaveBeenLastCalledWith('auto');
    expect(cinema).toHaveBeenCalledWith(false);
    expect(cinema).not.toHaveBeenCalledWith(true);
  });

  it('follows a Kin on focus and frames toward them', () => {
    const rig = new CameraRig(new THREE.PerspectiveCamera(), vi.fn(), vi.fn());
    const person = body();
    rig.focusKin('ori', new Map([['ori', person]]));
    expect(rig.followId).toBe('ori');
    const target = rig.frame(1000, .016, { bodies: new Map([['ori', person]]), snapshot });
    expect(target.x).toBeCloseTo(3, 1);
    expect(target.z).toBeCloseTo(4, 1);
  });

  it('glides with movement keys and breaks away from a follow', () => {
    const rig = new CameraRig(new THREE.PerspectiveCamera(), vi.fn(), vi.fn());
    const person = body();
    const context = { bodies: new Map([['ori', person]]), snapshot };
    (rig as unknown as { boundsFn: () => { minX: number; minY: number; width: number; height: number } }).boundsFn =
      () => ({ minX: 0, minY: 0, width: 48, height: 48 });
    rig.focusKin('ori', context.bodies);
    (rig as unknown as { held: Set<string> }).held.add('w');
    const before = rig.frame(1000, .05, context).clone();
    const after = rig.frame(1050, .05, context);
    expect(rig.followId).toBeNull();
    expect(after.distanceTo(before)).toBeGreaterThan(0);
  });

  it('keeps focusCreature panning toward the creature', () => {
    const rig = new CameraRig(new THREE.PerspectiveCamera(), vi.fn(), vi.fn());
    const creatureSnapshot = { ...snapshot, objects: [{ id: 'wolf', creature: {}, pos: { x: 9, y: 8 } }] } as unknown as WorldSnapshot;
    rig.focusCreature('wolf', creatureSnapshot);
    expect(rig.followId).toBeNull();
    expect(rig.pan.lengthSq()).toBeGreaterThan(0);
  });
});
