/**
 * Birth — a child comes into the world. Shared by the sim (when a carried life
 * gestates to term) and by tests. A newborn is UNNAMED by default; its parents
 * name it (name_child). It inherits both parents' skillfiles and a blend of
 * their temperament and mind (lineage).
 */
import type { WorldDB } from '../db.ts';
import type { WorldConfig } from '../config.ts';
import type { Gender, Kin, WorldEvent } from '../../shared/types.ts';
import { clampPos } from './world.ts';

export function birthChild(db: WorldDB, cfg: WorldConfig, lune: Kin, sol: Kin, tick: number, name = 'a newborn'): { child: Kin; event: WorldEvent } {
  const seed = tick * 31 + lune.id.charCodeAt(4) * 7 + name.length;
  const gender: Gender = seed % 2 === 0 ? 'sol' : 'lune';
  const jitter = ((seed % 11) - 5) / 100;
  const clamp01 = (v: number): number => Math.max(0.05, Math.min(0.95, v));
  const child = db.createKin({
    name, gender,
    parentSolId: sol.id, parentLuneId: lune.id,
    bornAtTick: tick, diedAtTick: null, immortal: false,
    endowmentTicks: cfg.lifespan.childEndowmentTicks,
    modelEndpoint: '', modelName: sol.modelName, apiKeyRef: 'LLM_API_KEY',
    temperament: {
      explorationDrive: clamp01(sol.temperament.explorationDrive + jitter),
      authorAffinity: clamp01(sol.temperament.authorAffinity + jitter),
      memoryDepth: clamp01(lune.temperament.memoryDepth - jitter),
      refineAffinity: clamp01(lune.temperament.refineAffinity - jitter),
    },
    // a newborn arrives BESIDE the mother, never inside her
    pos: clampPos(cfg, { x: lune.pos.x + (sol.pos.x >= lune.pos.x ? -1 : 1), y: lune.pos.y + 1 }),
    status: 'alive', intention: null, coupleId: null,
  });
  // inheritance: the child receives both parents' skillfiles
  const seen = new Set<string>();
  for (const parent of [sol, lune]) {
    for (const s of db.listSkillfiles(parent.id)) {
      if (seen.has(s.name.toLowerCase())) continue;
      seen.add(s.name.toLowerCase());
      db.createSkillfile({ ownerKinId: child.id, name: s.name, content: s.content, version: 1, refinedCount: 0, learnedFromKinId: parent.id, createdAtTick: tick });
    }
  }
  const named = name !== 'a newborn';
  db.addMemory(child.id, tick, 'reflection',
    `I rose into the world${named ? '' : ', newly risen'}, a star born of ${sol.name} and ${lune.name}.${named ? '' : ' I have no name yet — they will give me one.'}`, 10);
  db.addMemory(lune.id, tick, 'reflection',
    `The star I carried has risen — ${sol.name}'s and mine, a new ${gender} light.${named ? '' : ' It has no name yet; I should give it one.'}`, 10);
  if (sol.id !== lune.id && sol.status !== 'dead') {
    db.addMemory(sol.id, tick, 'reflection', `Our star has risen — ${lune.name}'s and mine, a new ${gender} light.${named ? '' : ' We must give it a name.'}`, 10);
  }
  const firstBirth = (db.db.prepare(`SELECT COUNT(*) c FROM events WHERE verb='birth'`).get() as { c: number }).c === 0;
  const event = db.addEvent({
    tick, actorKinId: child.id, verb: 'birth', targetId: null,
    detail: `A star rises — a child born to ${sol.name} and ${lune.name}, a new ${gender} Kin${named ? ` named ${name}` : ', still unnamed'}, a mortal light begun.`,
    thought: null, historic: firstBirth,
  });
  return { child, event };
}
