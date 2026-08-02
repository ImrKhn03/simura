/** Natural disasters: seeded, felt world calamities that reuse hunger/health/fire/regrow. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { currentCalamity, stepCalamity, CALAMITY_LINE } from '../src/server/world/calamity.ts';
import { perceive } from '../src/server/world/world.ts';

describe('calamities', () => {
  it('an active calamity is readable and expires on its own', () => {
    const { db } = testWorld();
    db.setMeta('calamity', JSON.stringify({ kind: 'drought', until: 1000, began: 100 }));
    expect(currentCalamity(db, 500)?.kind).toBe('drought');
    expect(currentCalamity(db, 1000)).toBeNull(); // past `until`
    expect(currentCalamity(db, 2000)).toBeNull();
  });

  it('a calamity is FELT in perception, above the ordinary', () => {
    const { db, cfg, ori } = testWorld();
    db.setMeta('calamity', JSON.stringify({ kind: 'plague', until: 9999, began: 1 }));
    expect(perceive(db, cfg, db.getKin(ori.id)!, 50).text).toContain(CALAMITY_LINE.plague.slice(0, 30));
  });

  it('an expired calamity is cleared and its passing announced', () => {
    const { db } = testWorld();
    db.setMeta('calamity', JSON.stringify({ kind: 'drought', until: 100, began: 1 }));
    // at a tick past `until`, stepCalamity clears it and reports the end
    const news = stepCalamity(db, 200, 42, 1, 1);
    expect(news?.verb).toBe('calamity_ended');
    expect(news?.detail).toMatch(/drought has broken/);
    expect(db.getMeta('calamity')).toBe(''); // cleared
  });

  it('calamities are rare — a calm tick begins nothing', () => {
    const { db } = testWorld();
    // most ticks roll no calamity (chance is ~0.0009); assert the mechanism returns null commonly
    let began = 0;
    for (let t = 1; t < 300; t++) { if (stepCalamity(db, t, 42, 1, 1)?.verb === 'calamity_began') { began++; db.setMeta('calamity', ''); } }
    expect(began).toBeLessThan(5); // genuinely rare over 300 ticks
  });
});
