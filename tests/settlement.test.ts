/** Settlement: villages emerge where homes cluster on named ground; roads & public structures felt. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { settlementAt, perceive } from '../src/server/world/world.ts';

function structure(db: ReturnType<typeof testWorld>['db'], name: string, pos: { x: number; y: number }, maker: string): void {
  db.createObject({ kind: 'structure', name, description: '', pos, creatorKinId: maker, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
}

describe('settlements', () => {
  it('homes on named ground become a hamlet, then a village', () => {
    const { db, ori } = testWorld();
    const p = { ...ori.pos };
    db.addPlace('Hearth-hold', p, ori.id, 1);
    expect(settlementAt(db, p)).toBeNull(); // named, but no homes yet
    structure(db, 'a home', { x: p.x, y: p.y }, ori.id);
    structure(db, 'a hut', { x: p.x + 1, y: p.y }, ori.id);
    expect(settlementAt(db, p)?.tier).toBe('hamlet');
    for (let i = 0; i < 3; i++) structure(db, `dwelling ${i}`, { x: p.x + 1, y: p.y + i }, ori.id);
    expect(settlementAt(db, p)?.tier).toBe('village');
  });

  it('being in a settlement is felt', () => {
    const { db, cfg, ori } = testWorld();
    const p = { ...ori.pos };
    db.addPlace('Riverbend', p, ori.id, 1);
    structure(db, 'home one', p, ori.id);
    structure(db, 'home two', { x: p.x + 1, y: p.y }, ori.id);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/Riverbend, a hamlet/);
  });

  it('a public structure is felt as shared', () => {
    const { db, cfg, ori } = testWorld();
    structure(db, 'the meeting hall', { ...ori.pos }, ori.id);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/built for all|the people share/);
  });

  it('well-worn ground is felt as a road', () => {
    const { db, cfg, ori } = testWorld();
    for (let i = 0; i < 45; i++) db.moveKin(ori.id, { ...ori.pos }); // wear the ground deep
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/well-worn road/);
  });
});
