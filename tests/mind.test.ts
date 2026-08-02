import { describe, it, expect } from 'vitest';
import { testWorld, makeChild } from './helpers.ts';
import { MockMind } from '../src/server/llm.ts';
import { runMindTick } from '../src/server/mind/tick.ts';
import { memoryDigest, repetitionScore } from '../src/server/mind/memory.ts';
import { userPrompt } from '../src/server/mind/prompt.ts';
import { Simulation } from '../src/server/sim.ts';
import { kinshipDigest, perceive } from '../src/server/world/world.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import type { Kin, Verb, ActionChoice } from '../src/shared/types.ts';
import type { Mind } from '../src/server/llm.ts';

describe('mind loop (M1.1–M1.4)', () => {
  it('a single mind tick produces an event and a memory', async () => {
    const { db, cfg, ori } = testWorld();
    const event = await runMindTick(db, cfg, new MockMind(), ori, 1);
    expect(event.actorKinId).toBe(ori.id);
    expect(event.tick).toBe(1);
    expect(db.memoryCount(ori.id)).toBeGreaterThanOrEqual(2); // genesis memory + tick memory
  });

  it('a crashing mind becomes a stumble event, never an exception', async () => {
    const { db, cfg, ori } = testWorld();
    const broken: Mind = {
      chooseAction: async () => { throw new Error('provider down'); },
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    const event = await runMindTick(db, cfg, broken, ori, 1);
    expect(event.verb).toBe('stumble');
    expect(event.detail).toContain('provider down');
  });

  it('speech is heard next tick within radius and becomes memory', async () => {
    const { db, cfg, ori, vey } = testWorld();
    db.moveKin(vey.id, { x: ori.pos.x + 2, y: ori.pos.y }); vey.pos = { x: ori.pos.x + 2, y: ori.pos.y };
    const say = (message: string): Mind => ({
      chooseAction: async () => ({ choice: { thought: '', verb: 'speak' as Verb, params: { message } } as ActionChoice, tokensIn: 0, tokensOut: 0 }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    });
    const speaker = say('Hello, other one.');
    const speaker2 = say('The rain is coming.');
    await runMindTick(db, cfg, speaker, ori, 1);
    // before their lives have touched, the voice belongs to a stranger
    expect(perceive(db, cfg, vey, 2).text).toContain('You heard a sol stranger say: Hello, other one.');
    // once acquainted, the voice has a name (a DIFFERENT line — repeating the exact words is now a felt dead-end)
    db.addAffection(ori.id, vey.id, 1);
    await runMindTick(db, cfg, speaker2, ori, 2);
    expect(perceive(db, cfg, vey, 3).text).toContain('You heard Ori say: The rain is coming.');
  });

  it('echo compression: repeated near-identical memories collapse to one line with a count', () => {
    const { db, cfg, vey } = testWorld();
    for (let i = 0; i < 9; i++) {
      db.addMemory(vey.id, 10 + i, 'speech', `You heard Ori say: Yes, let’s cut one small root now, carefully. (variant ${i})`, 5);
    }
    db.addMemory(vey.id, 20, 'action', 'I gathered a small root from the plant', 7);
    const digest = memoryDigest(db, cfg, vey);
    const echoes = digest.filter((m) => m.content.includes('cut one small root'));
    expect(echoes).toHaveLength(1);
    expect(echoes[0]!.content).toContain('has now happened 9 times');
    // distinct memories survive untouched
    expect(digest.some((m) => m.content === 'I gathered a small root from the plant')).toBe(true);
  });

  it('context budget: perception caps object lists; skills list caps with a count', () => {
    const { db, cfg, ori } = testWorld();
    // dump 30 crafted things at Ori's feet
    for (let i = 0; i < 30; i++) {
      db.createObject({ kind: 'crafted', name: `thing-${i}`, description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    }
    const noon = Math.floor(cfg.day.lengthTicks * 0.25);
    const text = perceive(db, cfg, ori, noon).text;
    const objLines = text.split('\n').filter((l) => l.startsWith('[obj:'));
    expect(objLines.length).toBeLessThanOrEqual(cfg.perceptionMaxObjects);
    expect(text).toContain('more familiar things lie about');
    // skills list caps with a "more rest in you" line
    for (let i = 0; i < 20; i++) {
      db.createSkillfile({ ownerKinId: ori.id, name: `skill-${i}`, content: 'x', version: 1, refinedCount: i, learnedFromKinId: null, createdAtTick: i });
    }
    const prompt = userPrompt('...', [], db.listSkillfiles(ori.id), 10, 0, null, cfg.memory.maxListedSkills);
    expect(prompt.split('\n').filter((l) => l.startsWith('[skill]'))).toHaveLength(cfg.memory.maxListedSkills);
    expect(prompt).toContain('more skills rest in you');
    expect(prompt).toContain('skill-19'); // most refined listed first
  });

  it('life chapters: many summaries consolidate into one and the originals fade', async () => {
    const { db, cfg, ori } = testWorld();
    for (let i = 0; i < cfg.memory.chapterEvery; i++) {
      db.addMemory(ori.id, i * 30, 'summary', `period summary ${i}`, 7);
    }
    const { maybeConsolidateChapter } = await import('../src/server/mind/memory.ts');
    await maybeConsolidateChapter(db, cfg, new MockMind(), ori, 300);
    const all = db.recentMemories(ori.id, 100);
    const chapter = all.find((m) => m.content.startsWith('[a chapter of my life]'));
    expect(chapter).toBeDefined();
    expect(chapter!.importance).toBe(8);
    // originals demoted below recall priority
    const demoted = all.filter((m) => m.content.startsWith('period summary'));
    expect(demoted.every((m) => m.importance === 4)).toBe(true);
  });

  it('rest: a sleeping Kin does not think and its light does not burn; dawn wakes it rested', async () => {
    const { db, cfg, ori } = testWorld();
    const mortal = db.createKin({
      name: 'Nap', gender: 'lune', parentSolId: ori.id, parentLuneId: null,
      bornAtTick: 0, diedAtTick: null, immortal: false, endowmentTicks: 1000,
      modelEndpoint: '', modelName: 'mock', apiKeyRef: 'LUNE_API_KEY',
      temperament: { ...ori.temperament }, pos: { x: 5, y: 5 }, status: 'alive',
      intention: null, coupleId: null,
    });
    // night: choose rest
    const nightTick = Math.floor(cfg.day.lengthTicks * 0.85);
    db.setTick(nightTick - 1);
    const r = executeVerb(db, cfg, db.getKin(mortal.id)!, nightTick, { thought: '', verb: 'rest', params: {} });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('dawn will wake you');
    const sleeper = db.getKin(mortal.id)!;
    expect(sleeper.asleepUntil).toBeGreaterThan(nightTick);
    // while asleep: no events, no endowment burn
    const sim = new Simulation(db, cfg, new MockMind());
    const before = db.getKin(mortal.id)!.endowmentTicks;
    const { events } = await sim.tickWorld();
    expect(events.every((e) => e.actorKinId !== mortal.id)).toBe(true);
    expect(db.getKin(mortal.id)!.endowmentTicks).toBe(before);
    // jump to dawn: wakes with a rested memory and thinks again
    db.setTick(sleeper.asleepUntil! - 1);
    await sim.tickWorld();
    expect(db.getKin(mortal.id)!.asleepUntil).toBeNull();
    expect(db.recentMemories(mortal.id, 5).some((m) => m.content.includes('Dawn woke me'))).toBe(true);
  });

  it('circling the same reflection becomes a felt dead end', () => {
    const { db, cfg, ori } = testWorld();
    const first = executeVerb(db, cfg, ori, 10, { thought: '', verb: 'reflect', params: { insight: 'The watch is kept by my being here.' } });
    expect(first.ok).toBe(true);
    db.addEvent({ tick: 10, actorKinId: ori.id, verb: 'reflect', targetId: null, detail: first.detail, thought: null, historic: false });
    const again = executeVerb(db, cfg, ori, 12, { thought: '', verb: 'reflect', params: { insight: 'The watch is kept by my being here.' } });
    expect(again.ok).toBe(false);
    expect(again.detail).toContain('settled nothing new');
    // a genuinely new thought still lands
    const fresh = executeVerb(db, cfg, ori, 13, { thought: '', verb: 'reflect', params: { insight: 'Perhaps the dark itself can be made to give way.' } });
    expect(fresh.ok).toBe(true);
  });

  it('kinship is constitutional: partner, children, and dear ones are in EVERY prompt, never recalled from memory', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
    executeVerb(db, cfg, ori, 1, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
    executeVerb(db, cfg, db.getKin(vey.id)!, 2, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
    makeChild(db, cfg, db.getKin(ori.id)!, db.getKin(vey.id)!, 4, 'Sona');
    // bury everything under thousands of ticks of noise — kinship must not care
    const o = db.getKin(ori.id)!;
    const digest = kinshipDigest(db, cfg, o);
    expect(digest).toContain('Vey is your bonded partner');
    expect(digest).toContain('Sona is your child');
    const prompt = userPrompt('...', [], [], 99999, 0, null, 12, digest, null);
    expect(prompt).toContain('Yours, always:');
    expect(prompt).toContain('Vey is your bonded partner');
    // the child knows its parents and, from the other side, Sona sees both
    const sona = db.listKin().find((k) => k.name === 'Sona')!;
    expect(kinshipDigest(db, cfg, sona)).toContain('child of Ori and Vey');
    // death does not erase belonging
    db.setKinStatus(sona.id, 'dead', 100);
    expect(kinshipDigest(db, cfg, db.getKin(ori.id)!)).toContain('Sona is your child (gone');
  });

  it('standing plans persist across ticks until the Kin rewrites them', async () => {
    const { db, cfg, ori } = testWorld();
    const planner: Mind = {
      chooseAction: async () => ({
        choice: {
          thought: '', verb: 'reflect' as Verb, params: { insight: 'a long road' },
          plan: ['find a hammerstone', 'strike flakes', 'cut one root and test it'],
        } as ActionChoice,
        tokensIn: 0, tokensOut: 0,
      }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    await runMindTick(db, cfg, planner, ori, 1);
    expect(db.getKin(ori.id)!.plan).toEqual(['find a hammerstone', 'strike flakes', 'cut one root and test it']);
    // a mind that says nothing about its plan keeps it
    const silent: Mind = {
      chooseAction: async () => ({ choice: { thought: '', verb: 'reflect' as Verb, params: {} } as ActionChoice, tokensIn: 0, tokensOut: 0 }),
      summarize: async () => ({ summary: '', tokensIn: 0, tokensOut: 0 }),
    };
    await runMindTick(db, cfg, silent, db.getKin(ori.id)!, 2);
    expect(db.getKin(ori.id)!.plan).toHaveLength(3);
    // and the plan appears in the prompt
    const prompt = userPrompt('...', [], [], 3, 0, null, 12, '', db.getKin(ori.id)!.plan);
    expect(prompt).toContain('Your standing plan');
    expect(prompt).toContain('2. strike flakes');
  });

  it('memory digest recalls important old memories beyond the short-term window', () => {
    const { db, cfg, vey } = testWorld();
    db.addMemory(vey.id, 1, 'reflection', 'THE-FIRST-DAWN', 10);
    for (let i = 2; i < 40; i++) db.addMemory(vey.id, i, 'action', `mundane ${i}`, 3);
    const digest = memoryDigest(db, cfg, vey);
    expect(digest.some((m) => m.content.includes('THE-FIRST-DAWN'))).toBe(true);
  });

  it('summarization compacts memories on schedule', async () => {
    const { db, cfg, ori } = testWorld();
    const mind = new MockMind();
    for (let i = 1; i <= cfg.memory.summarizeEveryTicks; i++) {
      await runMindTick(db, cfg, mind, ori, i);
    }
    const summaries = db.recentMemories(ori.id, 200).filter((m) => m.kind === 'summary');
    expect(summaries.length).toBeGreaterThanOrEqual(1);
  });

  it('Sol explores more; Lune refines/teaches more (M1.4 temperaments)', async () => {
    const { db, cfg, ori, vey } = testWorld();
    const sim = new Simulation(db, cfg, new MockMind());
    for (let i = 0; i < 120; i++) await sim.tickWorld();
    const stats = sim.stats();
    const oriStats = stats.find((s) => s.kinId === ori.id)!;
    const veyStats = stats.find((s) => s.kinId === vey.id)!;
    const moves = (s: typeof oriStats) => s.verbCounts['move'] ?? 0;
    expect(moves(oriStats)).toBeGreaterThan(moves(veyStats));
    expect(repetitionScore(db, ori)).toBeLessThan(0.9); // not fully rutted
  });
});
