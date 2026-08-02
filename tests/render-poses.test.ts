import { describe, expect, it } from 'vitest';
import { labPoseForVerb, labVerbPose, makeLabCharacter } from '../src/web/render/style-recipes.ts';

describe('verbs made visible', () => {
  it('maps every deed family to a distinct pose, movement to the walk', () => {
    expect(labPoseForVerb('build', false)).toBe('work');
    expect(labPoseForVerb('gather', false)).toBe('gather');
    expect(labPoseForVerb('pray', false)).toBe('pray');
    expect(labPoseForVerb('dance', false)).toBe('dance');
    expect(labPoseForVerb('speak', false)).toBe('speak');
    expect(labPoseForVerb('flee_predator', false)).toBe('fear');
    expect(labPoseForVerb('build', true)).toBe('idle');
  });

  it('actually bends the rig — a praying body is not an idle body', () => {
    const rig = makeLabCharacter('#F2EAD3', '#79A659', false);
    labVerbPose(rig, 'pray', 2);
    const prayArms = rig.armL.rotation.x;
    const prayBow = rig.body.rotation.x;
    labVerbPose(rig, 'idle', 2);
    expect(prayArms).toBeLessThan(-1);
    expect(prayBow).toBeGreaterThan(.2);
    expect(rig.body.rotation.x).toBe(0);
  });
});
