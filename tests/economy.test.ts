/** Economy: precious things as emergent money/wealth, and markets at named places. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { wealthOf, perceive } from '../src/server/world/world.ts';

const give = (db: ReturnType<typeof testWorld>['db'], kin: { id: string; pos: { x: number; y: number } }, name: string) =>
  db.createObject({ kind: 'gathered', name, description: '', pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, carriedBy: kin.id });

describe('wealth as emergent money', () => {
  it('precious things count as wealth and are felt as money', () => {
    const { db, cfg, ori } = testWorld();
    expect(wealthOf(db, db.getKin(ori.id)!)).toBe(0);
    give(db, ori, 'gold nugget');
    expect(wealthOf(db, db.getKin(ori.id)!)).toBe(1);
    const t = perceive(db, cfg, db.getKin(ori.id)!, 5).text;
    expect(t).toMatch(/precious|store of worth/);
  });

  it('the wealthy are known as such to others', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    for (let i = 0; i < 5; i++) give(db, vey, `gold piece ${i}`);
    expect(wealthOf(db, db.getKin(vey.id)!)).toBeGreaterThanOrEqual(5);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/known to be wealthy/);
  });
});

describe('minted currency', () => {
  it('a coin struck from metal is recognized as money and counts as wealth', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 12, 1);
    // gold + coal + fire on hand to mint a coin
    give(db, ori, 'gold ore');
    give(db, ori, 'coal');
    db.createObject({ kind: 'crafted', name: 'campfire', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false, emitsLight: true });
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'craft', params: { name: 'gold coin', description: 'a struck coin of gold' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/minting|coin/);
    // the minted coin exists and, once picked up, counts as money/wealth
    const coin = db.listObjects().find((o) => o.name === 'gold coin')!;
    expect(coin).toBeDefined();
    executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'carry', params: { targetId: coin.id } });
    expect(wealthOf(db, db.getKin(ori.id)!)).toBeGreaterThanOrEqual(1);
  });
});

describe('compassion', () => {
  it('seeing another in real need, when you have plenty, is felt', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    db.setFullness(ori.id, 90); ori.fullness = 90; give(db, ori, 'cooked fish');
    db.setFullness(vey.id, 12); // Vey is starving
    // Ori must know Vey's name — bump affection so they're acquainted
    db.addAffection(ori.id, vey.id, 30);
    expect(perceive(db, cfg, db.getKin(ori.id)!, 5).text).toMatch(/in real need|aches at the sight/);
  });
});

describe('markets', () => {
  it('a trade at a named place becomes a market', () => {
    const { db, cfg, ori, vey } = testWorld();
    godUnlockEra(db, 10, 1);
    db.moveKin(vey.id, { ...ori.pos }); vey.pos = { ...ori.pos };
    db.addPlace('the Crossing', { ...ori.pos }, ori.id, 1);
    const a = give(db, ori, 'a gold bead');
    const b = give(db, vey, 'a fine cloak');
    executeVerb(db, cfg, db.getKin(ori.id)!, 2, { thought: '', verb: 'trade', params: { withKinName: 'Vey', give: a.name, want: b.name } });
    const r = executeVerb(db, cfg, db.getKin(vey.id)!, 3, { thought: '', verb: 'accept_trade', params: { fromKinName: 'Ori' } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/market/);
    // goods actually swapped
    expect(db.getObject(a.id)!.carriedBy).toBe(vey.id);
    expect(db.getObject(b.id)!.carriedBy).toBe(ori.id);
  });
});
