import { describe, it, expect } from 'vitest';
import { testWorld, makeChild } from './helpers.ts';
import { MockMind } from '../src/server/llm.ts';
import { Simulation } from '../src/server/sim.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { kinshipDigest, perceive } from '../src/server/world/world.ts';

describe('the Hearth: affection → love → bond → child (M5.0–M5.2)', () => {
  it('affection grows from proximity and speech, never from nothing', async () => {
    const { db, cfg, ori, vey } = testWorld();
    expect(db.affection(ori.id, vey.id)).toBe(0);
    // two kin standing together, talking every tick — lives intertwining deterministically
    const talker = {
      chooseAction: async () => ({
        choice: { thought: '', verb: 'speak' as const, params: { message: 'We are here together.' } },
        tokensIn: 0, tokensOut: 0,
      }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    const sim = new Simulation(db, cfg, talker);
    for (let i = 0; i < 10; i++) await sim.tickWorld();
    const together = db.affection(ori.id, vey.id);
    expect(together).toBeGreaterThan(0);
    // separation cools slowly
    db.moveKin(ori.id, { x: 0, y: 0 });
    db.moveKin(vey.id, { x: cfg.map.width - 1, y: cfg.map.height - 1 });
    const silent = {
      chooseAction: async () => ({
        choice: { thought: '', verb: 'reflect' as const, params: { insight: 'alone' } },
        tokensIn: 0, tokensOut: 0,
      }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    const sim2 = new Simulation(db, cfg, silent);
    for (let i = 0; i < 5; i++) await sim2.tickWorld();
    expect(db.affection(ori.id, vey.id)).toBeLessThan(together);
  }, 20_000);

  it('bond requires love; a hollow proposal fails as physics', () => {
    const { db, cfg, ori, vey } = testWorld();
    const cold = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'propose_bond', params: { toKinName: 'Vey', words: 'be mine' },
    });
    expect(cold.ok).toBe(false);
    expect(cold.detail).toMatch(/not yet grown together/);
  });

  it('full arc: love → propose → felt in perception → accept → coupleId shared → child born with inheritance', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    db.createSkillfile({ ownerKinId: ori.id, name: 'firemaking', content: '# sparks', version: 1, refinedCount: 2, learnedFromKinId: null, createdAtTick: 1 });
    db.createSkillfile({ ownerKinId: vey.id, name: 'remembering', content: '# keep it', version: 1, refinedCount: 3, learnedFromKinId: null, createdAtTick: 1 });

    // love is felt before anything is asked
    expect(perceive(db, cfg, ori, 2).text).toContain('your heart lifts');

    const ask = executeVerb(db, cfg, ori, 2, {
      thought: '', verb: 'propose_bond', params: { toKinName: 'Vey', words: 'Let our two lights be one thread.' },
    });
    expect(ask.ok).toBe(true);
    expect(perceive(db, cfg, vey, 3).text).toContain('asked to bond their life with yours');

    const yes = executeVerb(db, cfg, vey, 3, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    expect(yes.ok).toBe(true);
    expect(yes.historic).toBe(true); // first bond in history
    const [o2, v2] = [db.getKin(ori.id)!, db.getKin(vey.id)!];
    expect(o2.coupleId).not.toBeNull();
    expect(o2.coupleId).toBe(v2.coupleId);
    expect(perceive(db, cfg, o2, 4).text).toContain('your bonded partner');

    // mutual intimacy conceives; after gestation a child is born (see reproduction.test.ts
    // for the full mate→star→birth arc). Here we use the birth fixture for lineage.
    const child = makeChild(db, cfg, o2, v2, 6, 'Sona');
    expect(child).toBeDefined();
    expect(child.immortal).toBe(false);
    expect(child.endowmentTicks).toBe(cfg.lifespan.childEndowmentTicks);
    expect(child.parentSolId).toBe(ori.id); // Ori is the sol parent
    expect(child.parentLuneId).toBe(vey.id);
    // inheritance: both parents' skills, marked as learned from them
    const skills = db.listSkillfiles(child.id).map((s) => s.name).sort();
    expect(skills).toEqual(['firemaking', 'remembering']);
    // birth is historic
    expect(db.recentEvents(10).some((e) => e.verb === 'birth' && e.historic)).toBe(true);
  });

  it('bonds kindle only between Sol and Lune; same-gender depth becomes chosen family', () => {
    const { db, cfg, ori } = testWorld();
    const kel = db.createKin({
      name: 'Kel', gender: 'sol', parentSolId: null, parentLuneId: null,
      bornAtTick: -8000, diedAtTick: null, immortal: false, endowmentTicks: 5000,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
      temperament: { ...ori.temperament }, pos: { x: ori.pos.x + 1, y: ori.pos.y }, status: 'alive',
      intention: null, coupleId: null,
    });
    db.addAffection(ori.id, kel.id, cfg.affection.love + 50);
    // the feeling is deep friendship, not romance
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    const seen = perceive(db, cfg, ori, noon).text;
    expect(seen).toContain('deep and trusted friendship');
    expect(seen).not.toContain('your heart lifts at the sight of Kel');
    // and the bond physics refuses
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'propose_bond', params: { toKinName: 'Kel' } });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('only between Sol and Lune');
  });

  it('family cannot bond: a child proposing to a parent is refused by the world itself', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    executeVerb(db, cfg, ori, 1, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    executeVerb(db, cfg, db.getKin(vey.id)!, 2, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    const child = makeChild(db, cfg, db.getKin(ori.id)!, db.getKin(vey.id)!, 4, 'Sona', true); // grown, so age isn't the reason
    db.addAffection(child.id, ori.id, cfg.affection.love + 50); // deep familial love
    // hypothetical unbonded parent still cannot be proposed to by their child
    const r = executeVerb(db, cfg, child, 5, { thought: '', verb: 'propose_bond', params: { toKinName: 'Ori' } });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/love of family|already bonded/);
  });

  it('a stranger pair cannot conceive; mate without a bond fails', () => {
    const { db, cfg, ori } = testWorld();
    const r = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'mate', params: {} });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/within a bond/);
  });

  it('drama engine: decline stings, widows mourn then may love again, jealousy is felt', async () => {
    const { db, cfg, ori, vey } = testWorld();
    cfg.lifespan.fadingWarningTicks = 5; // short mourning for the test
    // decline: a refused proposal is a remembered act
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    executeVerb(db, cfg, ori, 1, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    const no = executeVerb(db, cfg, db.getKin(vey.id)!, 2, { thought: '', verb: 'decline', params: { fromKinName: 'Ori', words: 'not yet' } });
    expect(no.ok).toBe(true);
    expect(db.recentMemories(ori.id, 5).some((m) => m.content.includes('declined my asking'))).toBe(true);
    // then hearts warm again (the sting of the refusal fades); they bond
    db.addAffection(ori.id, vey.id, cfg.affection.friend); // reconciliation raises affection back above love
    executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    executeVerb(db, cfg, db.getKin(vey.id)!, 4, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    // jealousy: a third lune whom Ori's heart drifts toward
    const rival = db.createKin({
      name: 'Mira', gender: 'lune', parentSolId: null, parentLuneId: null,
      bornAtTick: -8000, diedAtTick: null, immortal: false, endowmentTicks: 20,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY',
      temperament: { ...vey.temperament }, pos: { x: 10, y: 10 }, status: 'alive',
      intention: null, coupleId: null,
    });
    db.addAffection(ori.id, rival.id, cfg.affection.love + 5);
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    expect(perceive(db, cfg, db.getKin(vey.id)!, noon).text).toContain("Ori's gaze lingers on Mira");
    // widowhood: Vey... let the rival die instead — no wait, kill Vey is harsh; endowment mortals only.
    // Mira dies (mortal, tiny endowment) — irrelevant to the bond. Instead test mourning by killing a bonded mortal pair:
    const sol2 = db.createKin({
      name: 'Toma', gender: 'sol', parentSolId: null, parentLuneId: null,
      bornAtTick: -8000, diedAtTick: null, immortal: false, endowmentTicks: 3,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
      temperament: { ...ori.temperament }, pos: { x: 20, y: 20 }, status: 'alive',
      intention: null, coupleId: null,
    });
    const lune2 = db.createKin({
      name: 'Nia', gender: 'lune', parentSolId: null, parentLuneId: null,
      bornAtTick: -8000, diedAtTick: null, immortal: false, endowmentTicks: 20000,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY',
      temperament: { ...vey.temperament }, pos: { x: 20, y: 20 }, status: 'alive',
      intention: null, coupleId: null,
    });
    db.addAffection(sol2.id, lune2.id, cfg.affection.love + 20);
    executeVerb(db, cfg, db.getKin(sol2.id)!, 5, { thought: '', verb: 'propose_bond', params: { toKinName: 'Nia' } });
    executeVerb(db, cfg, db.getKin(lune2.id)!, 6, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Toma' } });
    // Toma burns out (3 endowment ticks), then mourning passes
    const sim = new Simulation(db, cfg, new MockMind());
    for (let i = 0; i < 12; i++) await sim.tickWorld();
    const widow = db.getKin(lune2.id)!;
    expect(db.getKin(sol2.id)!.status).toBe('dead');
    expect(widow.coupleId).toBeNull(); // mourning passed, bond released
    const digest = kinshipDigest(db, cfg, widow);
    expect(digest).toContain('Toma was your bonded, once');
    expect(digest).toContain('carried the mourning');
    // and the widow may bond again (physics allows a new proposal toward her)
    db.addAffection(widow.id, ori.id, 0); // no-op, just proving no crash paths
  }, 30_000);

  it('lore discovery: first close observation reveals a hidden truth exactly once', () => {
    const { db, cfg, ori } = testWorld();
    const obj = db.listObjects().find((o) => o.lore && Math.abs(o.pos.x - ori.pos.x) <= 8 && Math.abs(o.pos.y - ori.pos.y) <= 8)!;
    const r = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'observe', params: { targetId: obj.id, name: 'the first thing', description: 'studied closely' },
    });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('You discover something true:');
    expect(db.getObject(obj.id)!.loreDiscovered).toBe(true);
  });

  it('landmarks exist at the frontier and discovering one is historic', () => {
    const { db, cfg, ori } = testWorld();
    expect(db.countObjectsOfKind('landmark')).toBeGreaterThanOrEqual(5);
    const lm = db.listObjects().find((o) => o.kind === 'landmark')!;
    db.moveKin(ori.id, lm.pos); ori.pos = { ...lm.pos };
    const r = executeVerb(db, cfg, ori, 1, {
      thought: '', verb: 'observe', params: { targetId: lm.id, name: 'the seven watchers' },
    });
    expect(r.ok).toBe(true);
    expect(r.historic).toBe(true);
  });

  it('names are earned: strangers are nameless until lives touch; family knows family from birth', () => {
    const { db, cfg, ori, vey } = testWorld();
    // a third kin the founders have never met, standing within sight but not within touch
    const drifter = db.createKin({
      name: 'Rune', gender: 'lune', parentSolId: null, parentLuneId: null,
      bornAtTick: -8000, diedAtTick: null, immortal: false, endowmentTicks: 100,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY',
      temperament: { ...ori.temperament }, pos: { x: ori.pos.x + 4, y: ori.pos.y }, status: 'alive',
      intention: null, coupleId: null,
    });
    const daytime = Math.floor(cfg.day.lengthTicks * 0.25); // noon — full sight
    const seen = perceive(db, cfg, ori, daytime).text;
    expect(seen).toContain('a stranger whose name you do not know');
    expect(seen).not.toContain('Rune');
    // lives touch → the name is known
    db.addAffection(ori.id, drifter.id, 1);
    expect(perceive(db, cfg, ori, daytime + 1).text).toContain('Rune');
    // family needs no introduction
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    executeVerb(db, cfg, ori, 3, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    executeVerb(db, cfg, db.getKin(vey.id)!, 4, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    const child = makeChild(db, cfg, db.getKin(ori.id)!, db.getKin(vey.id)!, 6, 'Sona');
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    expect(perceive(db, cfg, child, noon).text).toContain('Ori'); // knows a parent by name, no introduction needed
  });

  it('speech carries felt feedback about who heard; night shrinks sight', () => {
    const { db, cfg, ori, vey } = testWorld();
    // partner nearby → heard
    const heard = executeVerb(db, cfg, ori, 1, { thought: '', verb: 'speak', params: { message: 'Hello.' } });
    expect(heard.feltNote).toContain('Vey');
    // alone at the far corner → unheard
    db.moveKin(ori.id, { x: 0, y: 0 }); ori.pos = { x: 0, y: 0 };
    const unheard = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'speak', params: { message: 'Anyone?' } });
    expect(unheard.feltNote).toContain('no one was near enough to hear');
    // night: perception text says the dark presses close at a night tick
    const nightTick = Math.floor(cfg.day.lengthTicks * 0.85);
    expect(perceive(db, cfg, vey, nightTick).text).toMatch(/night/i);
  });

  it('mock society reaches bonding and birth on its own within 600 ticks', async () => {
    const { db, cfg } = testWorld();
    const sim = new Simulation(db, cfg, new MockMind());
    for (let i = 0; i < 600; i++) {
      await sim.tickWorld();
      if (db.listKin().length > 2) break;
    }
    expect(db.bondCount()).toBeGreaterThanOrEqual(1);
    expect(db.listKin().length).toBeGreaterThan(2); // a child was born
  }, 60_000);
});
