import { describe, expect, it } from 'vitest';
import type { PublicKinSnapshot } from '../src/shared/types.ts';
import { creationKindPhrase, eventMark, humanEventDetail, kinGlancePhrase, kinLifePhrase, skillPracticePhrase, worldTimePhrase } from '../src/web/presentation.ts';

const kin: PublicKinSnapshot = {
  id: 'kin-private-selector', name: 'Ori', gender: 'sol', parentSolId: null, parentLuneId: null,
  bornAtTick: 0, diedAtTick: null, immortal: true, pos: { x: 4, y: 8 }, status: 'alive',
  intention: 'find a sheltered place', plan: null, asleepUntil: null, coupleId: null,
  fullness: 81, health: 100, weariness: 9, sickUntil: null, lastFulfilledTick: 2,
  starRisesAt: null, starWithId: null,
  presentation: {
    mood: .8, vitality: 1, moodBand: 'glad', lifeStage: 'adult', lifeProgress: .5, lifePhrase: 'an enduring founder',
    fundedLife: null, fundedLifePhrase: 'an enduring light', personality: 'drawn toward the unknown', profession: null,
    renown: null, notoriety: null, wealthValue: 0, wealthBand: 'little', lineage: 'Ori', conditionLine: 'bright with gladness',
    identityLine: 'one of the first people', starPhrase: null, knownTo: 0, founder: true, adopted: false,
    flags: { asleep: false, fading: false, sick: false, hungry: false, weary: false, carryingStar: false,
      bonded: false, clothed: false, fulfilled: true, restless: false },
  },
};

describe('human-facing web presentation', () => {
  it('uses world language without telemetry', () => {
    const text = [
      kinGlancePhrase(kin), kinLifePhrase(kin), creationKindPhrase('structure'), skillPracticePhrase(4),
      worldTimePhrase({ calamity: null, dayPart: 'dusk', season: 'autumn' }),
    ].join(' ');
    expect(text).not.toMatch(/kin-private-selector|\(4,8\)|ticks?|endowment|gender|status|refined|version/i);
    expect(text).toContain('enduring founder');
    expect(text).toContain('autumn dusk');
  });

  it('turns mechanical event annotations back into world language', () => {
    const text = humanEventDetail('Ori moved to (23, 30) and ate well (fullness 100/100)');
    expect(text).toBe('Ori moved onward and ate well');
    expect(humanEventDetail('you would have to go to (38,22) first')).toBe('you would have to draw nearer first');
  });

  it('maps internal event kinds to human, non-telemetry marks', () => {
    expect(eventMark('god_answer')).toEqual({ icon: '✧', label: 'an answered prayer' });
    expect(eventMark('write').label).toBe('a record');
    expect(eventMark('future_verb').label).not.toContain('future_verb');
    expect(eventMark('stumble')).toEqual({ icon: '', label: '' });
  });
});
