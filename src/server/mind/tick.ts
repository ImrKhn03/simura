import type { WorldDB } from '../db.ts';
import type { WorldConfig } from '../config.ts';
import type { Kin, WorldEvent } from '../../shared/types.ts';
import type { Mind } from '../llm.ts';
import { kinshipDigest, perceive, type WorldView } from '../world/world.ts';
import { availableVerbs, executeVerb } from '../world/verbs.ts';
import { systemPrompt, userPrompt } from './prompt.ts';
import { memoryDigest, memoryDigestSemantic, maybeSummarize } from './memory.ts';
import type { Embedder } from '../embeddings.ts';

/**
 * THINK phase: perceive the world as it stood at the start of the tick, recall,
 * and choose. Runs for every Kin IN PARALLEL — perception is captured
 * synchronously before any mind resolves, so no Kin sees another's same-tick
 * action first (no turn-order bias), and tick latency is the slowest mind,
 * not the sum of all minds.
 */
export async function thinkPhase(
  db: WorldDB, cfg: WorldConfig, mind: Mind, kin: Kin, tick: number, embedder?: Embedder, view?: WorldView,
): Promise<{ kin: Kin; choice: import('../../shared/types.ts').ActionChoice | null; error?: string }> {
  const era = db.currentEra();
  const verbs = availableVerbs(era, cfg.flags);

  // synchronous: all perceptions snapshot the pre-action world
  const perception = perceive(db, cfg, kin, tick, view);
  const skills = db.listSkillfiles(kin.id);
  const kinship = kinshipDigest(db, cfg, kin);

  for (const line of perception.text.split('\n')) {
    if (line.startsWith('You heard ')) db.addMemory(kin.id, tick, 'speech', line, 5);
    if (line.startsWith('⟪ ')) db.addMemory(kin.id, tick, 'speech', `a visitor said: ${line.replace(/[⟪⟫]/g, '').trim()}`, 8);
    if (line.startsWith('From the silence ')) db.addMemory(kin.id, tick, 'reflection', line, 10);
  }
  const parentNames = kin.parentSolId && kin.parentLuneId
    ? {
        sol: db.getKin(kin.parentSolId)?.name ?? 'someone lost',
        lune: db.getKin(kin.parentLuneId)?.name ?? 'someone lost',
      }
    : undefined;

  // the oracle: sight and memory a mind may consult before it acts
  const oracle = async (kind: 'where' | 'recall', query: string): Promise<string> => {
    const q = `%${query.toLowerCase().replace(/[%_]/g, '')}%`;
    if (kind === 'where') {
      const rows = db.db.prepare(
        `SELECT COALESCE(n.given_name, o.name) label, o.x, o.y, o.kind FROM world_objects o
         LEFT JOIN named_things n ON n.object_id = o.id
         WHERE o.carried_by IS NULL AND o.stored_in IS NULL
           AND (LOWER(COALESCE(n.given_name,'')) LIKE ? OR LOWER(o.name) LIKE ?)
           AND (n.object_id IS NOT NULL OR o.creator_kin_id = ? OR o.kind IN ('landmark','structure','water'))
         ORDER BY (o.x-?)*(o.x-?)+(o.y-?)*(o.y-?) ASC LIMIT 3`)
        .all(q, q, kin.id, kin.pos.x, kin.pos.x, kin.pos.y, kin.pos.y) as unknown as { label: string; x: number; y: number; kind: string }[];
      if (rows.length === 0) return `nothing called "${query}" is known to you — only what has been named, made, or stands as a landmark can be found this way.`;
      return rows.map((r) => `"${r.label}" (${r.kind}) lies at (${r.x},${r.y})`).join('; ') + `. You stand at (${kin.pos.x},${kin.pos.y}).`;
    }
    if (embedder) {
      try {
        const recalled = await memoryDigestSemantic(db, cfg, kin, embedder, query);
        return recalled.slice(-4).map((m) => m.content).join(' | ').slice(0, 600) || 'nothing surfaces.';
      } catch { /* fall through to plain recall */ }
    }
    const plain = db.db.prepare(
      `SELECT content FROM memories WHERE kin_id=? AND LOWER(content) LIKE ? ORDER BY id DESC LIMIT 4`)
      .all(kin.id, q) as unknown as { content: string }[];
    return plain.map((m) => m.content).join(' | ').slice(0, 600) || 'nothing surfaces.';
  };

  try {
    const memories = embedder
      ? await memoryDigestSemantic(db, cfg, kin, embedder, perception.text)
      : memoryDigest(db, cfg, kin);
    const res = await mind.chooseAction(
      kin,
      systemPrompt(kin, verbs, parentNames),
      userPrompt(perception.text, memories, skills, tick, kin.bornAtTick, kin.intention,
        cfg.memory.maxListedSkills, kinship, kin.plan),
      verbs,
      oracle,
    );
    db.logUsage(tick, kin.id, res.tokensIn, res.tokensOut);
    return { kin, choice: res.choice };
  } catch (err) {
    return { kin, choice: null, error: err instanceof Error ? err.message.slice(0, 120) : 'unknown' };
  }
}

/** acts that genuinely change the world or another Kin — these feed the spirit */
const FULFILLING_VERBS = new Set<string>([
  'craft', 'build', 'gather', 'give', 'teach', 'plant', 'write', 'author_skill', 'refine_skill',
  'sing', 'trade', 'eat', 'name_place', 'signal', 'reach_beyond',
]);

/**
 * ACT phase: apply one Kin's chosen action to the world, atomically.
 * Runs sequentially in an order shuffled deterministically per tick.
 */
export async function actPhase(
  db: WorldDB, cfg: WorldConfig, mind: Mind, kin: Kin, tick: number,
  choice: import('../../shared/types.ts').ActionChoice | null, error?: string,
): Promise<WorldEvent> {
  if (!choice) {
    const detail = `felt dizzy for a moment (${error ?? 'unknown'})`;
    const event = db.addEvent({ tick, actorKinId: kin.id, verb: 'stumble', targetId: null, detail, thought: null, historic: false });
    db.addMemory(kin.id, tick, 'reflection', 'A strange dizziness took me; the moment passed.', 2);
    return event;
  }

  // Act (physics validates; failure is information) — atomically
  const { result, event } = db.transaction(() => {
    const r = executeVerb(db, cfg, kin, tick, choice);
    db.logActionMetric(tick, kin.id, choice.verb, choice.params, r.ok, r.detail);
    const e = db.addEvent({
      tick, actorKinId: kin.id, verb: choice.verb, targetId: r.targetId,
      detail: r.detail, thought: choice.thought || null, historic: r.historic ?? false,
      heardBy: r.heardBy ?? null,
    });
    // words for the visitor ride alongside the deed — never instead of it
    if (choice.say) {
      const said = choice.say.replace(/[⟪⟫]/g, '').trim().slice(0, 300);
      if (said) {
        db.addEvent({ tick, actorKinId: kin.id, verb: 'speak', targetId: null, detail: said, thought: null, historic: false });
        db.addMemory(kin.id, tick, 'speech', `I answered the voice from beyond: ${said}`, 6);
      }
    }
    return { result: r, event: e };
  });

  // The Kin's own plans, carried to the next tick — theirs to keep, change, or drop
  if (typeof choice.intention === 'string') {
    const intention = choice.intention.trim();
    db.setIntention(kin.id, intention || null);
    kin.intention = intention || null;
  }
  if (Array.isArray(choice.plan)) {
    const plan = choice.plan
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 140))
      .slice(0, 6);
    db.setPlan(kin.id, plan.length ? plan : null);
    kin.plan = plan.length ? plan : null;
  }

  // Drive: real accomplishment feeds the spirit — the glow after, the restlessness without
  if (result.ok && FULFILLING_VERBS.has(choice.verb)) {
    db.setLastFulfilled(kin.id, tick);
    kin.lastFulfilledTick = tick;
  }

  // Reflect: outcome becomes memory (felt notes are private truths, not public events)
  const importance = result.historic ? 9 : result.important ? 7 : result.ok ? (choice.verb === 'reflect' ? 3 : 4) : 5;
  const memoryText = result.ok ? `I ${result.detail}` : `I tried to ${choice.verb}, but: ${result.detail}`;
  db.addMemory(kin.id, tick, choice.verb === 'reflect' ? 'reflection' : 'action',
    result.feltNote ? `${memoryText} ${result.feltNote}` : memoryText, importance);

  // Periodic memory consolidation
  await maybeSummarize(db, cfg, mind, kin, tick);

  return event;
}

/** convenience: think + act for a single Kin (tests, tools) */
export async function runMindTick(
  db: WorldDB, cfg: WorldConfig, mind: Mind, kin: Kin, tick: number, embedder?: Embedder,
): Promise<WorldEvent> {
  const t = await thinkPhase(db, cfg, mind, kin, tick, embedder);
  return actPhase(db, cfg, mind, kin, tick, t.choice, t.error);
}
