/** The reproduction arc: love → intimacy (mutual mate) → carrying a star → it rises (birth) → naming. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { executeVerb } from '../src/server/world/verbs.ts';
import { birthChild } from '../src/server/world/birth.ts';
import { perceive } from '../src/server/world/world.ts';

function bond(db: ReturnType<typeof testWorld>['db'], cfg: ReturnType<typeof testWorld>['cfg'], ori: ReturnType<typeof testWorld>['ori'], vey: ReturnType<typeof testWorld>['vey']): void {
  db.addAffection(ori.id, vey.id, cfg.affection.love + 10);
  executeVerb(db, cfg, ori, 1, { thought: '', verb: 'propose_bond', params: { toKinName: 'Vey' } });
  executeVerb(db, cfg, db.getKin(vey.id)!, 2, { thought: '', verb: 'accept_bond', params: { fromKinName: 'Ori' } });
}

describe('mate → carrying a star', () => {
  it('one mate is only an advance; both mating kindles a star — the Lune carries', () => {
    const { db, cfg, ori, vey } = testWorld();
    cfg.flags.reproduction = true;
    bond(db, cfg, ori, vey);
    db.setFullness(ori.id, 90); db.setFullness(vey.id, 90);

    // Ori reaches first — an advance, no star yet
    const advance = executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'mate', params: {} });
    expect(advance.ok).toBe(true);
    expect(advance.detail).toMatch(/reached for Vey/);
    expect(db.getKin(vey.id)!.starRisesAt).toBeNull();

    // Vey reaches back → a star is kindled
    const conceive = executeVerb(db, cfg, db.getKin(vey.id)!, 4, { thought: '', verb: 'mate', params: {} });
    expect(conceive.ok).toBe(true);
    expect(conceive.detail).toMatch(/star kindles/);
    const lune = db.getKin(vey.id)!;
    expect(lune.starRisesAt).not.toBeNull();
    expect(lune.starWithId).toBe(ori.id);
    // carrying a star is felt
    expect(perceive(db, cfg, db.getKin(vey.id)!, 5).text).toMatch(/carry a star not yet risen/);
  });

  it('mate needs one Sol and one Lune', () => {
    const { db, cfg, ori } = testWorld();
    cfg.flags.reproduction = true;
    const kel = db.createKin({
      name: 'Kel', gender: 'sol', parentSolId: null, parentLuneId: null, bornAtTick: 0, diedAtTick: null,
      immortal: false, endowmentTicks: 5000, modelEndpoint: '', modelName: 'mock', apiKeyRef: 'SOL_API_KEY',
      temperament: { ...ori.temperament }, pos: { ...ori.pos }, status: 'alive', intention: null, coupleId: 'c1',
    });
    db.db.prepare(`UPDATE kin SET couple_id='c1' WHERE id=?`).run(ori.id);
    const r = executeVerb(db, cfg, db.getKin(ori.id)!, 3, { thought: '', verb: 'mate', params: {} });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/one Sol and one Lune/);
    void kel;
  });
});

describe('birth → naming', () => {
  it('a birthed child is unnamed until a parent names it (name_child, innate)', () => {
    const { db, cfg, ori, vey } = testWorld();
    const { child } = birthChild(db, cfg, db.getKin(vey.id)!, db.getKin(ori.id)!, 10); // unnamed
    expect(child.name).toBe('a newborn');
    expect(child.immortal).toBe(false);
    expect(child.parentSolId).toBe(ori.id);
    expect(child.parentLuneId).toBe(vey.id);
    // the parent feels the pull to name it
    expect(perceive(db, cfg, db.getKin(ori.id)!, 11).text).toMatch(/newborn child has no name/);
    // name_child is innate — a parent can name their newborn
    const named = executeVerb(db, cfg, db.getKin(ori.id)!, 12, { thought: '', verb: 'name_child', params: { toKinName: 'a newborn', name: 'Rowan' } });
    expect(named.ok).toBe(true);
    expect(db.getKin(child.id)!.name).toBe('Rowan');
  });

  it('a child inherits both parents\' skillfiles', () => {
    const { db, cfg, ori, vey } = testWorld();
    db.createSkillfile({ ownerKinId: ori.id, name: 'firemaking', content: 'x', version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: 1 });
    db.createSkillfile({ ownerKinId: vey.id, name: 'remembering', content: 'y', version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: 1 });
    const { child } = birthChild(db, cfg, db.getKin(vey.id)!, db.getKin(ori.id)!, 10, 'Sona');
    const skills = db.listSkillfiles(child.id).map((s) => s.name).sort();
    expect(skills).toEqual(['firemaking', 'remembering']);
  });
});
