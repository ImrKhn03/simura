import type { WorldDB } from '../db.ts';
import type { WorldConfig } from '../config.ts';
import type { Kin, Memory } from '../../shared/types.ts';
import type { Mind } from '../llm.ts';
import { cosine, type Embedder } from '../embeddings.ts';

/**
 * Memory digest for the prompt: recalled important long-term memories
 * (beyond the short-term window) + the recent short-term window.
 * Lune's higher memoryDepth recalls more; Sol recalls less.
 */
export function memoryDigest(db: WorldDB, cfg: WorldConfig, kin: Kin): Memory[] {
  const shortTerm = db.recentMemories(kin.id, cfg.memory.shortTermWindow);
  const oldestShortTermId = shortTerm[0]?.id;
  const recallCount = Math.max(2, Math.round(cfg.memory.recallCount * (0.5 + kin.temperament.memoryDepth)));
  const recalled = oldestShortTermId
    ? db.importantMemories(kin.id, recallCount, oldestShortTermId)
    : [];
  const seen = new Set(shortTerm.map((m) => m.id));
  return compressEchoes([...recalled.filter((m) => !seen.has(m.id)).reverse(), ...shortTerm]);
}

/**
 * Semantic recall: what surfaces from long-term memory depends on where you are
 * and what you intend — not just on what once felt important. Standing at the
 * cave, you remember the cave. Score = similarity + importance + recency.
 * Falls back to importance-only recall when nothing is embedded yet.
 */
export async function memoryDigestSemantic(
  db: WorldDB, cfg: WorldConfig, kin: Kin, embedder: Embedder, situation: string,
): Promise<Memory[]> {
  const shortTerm = db.recentMemories(kin.id, cfg.memory.shortTermWindow);
  const oldestShortTermId = shortTerm[0]?.id;
  if (!oldestShortTermId) return compressEchoes(shortTerm);

  const candidates = db.embeddedMemories(kin.id, oldestShortTermId);
  if (candidates.length === 0) return memoryDigest(db, cfg, kin);

  const [query] = await embedder.embed([`${situation}\n${kin.intention ?? ''}`]);
  const newestTick = candidates.reduce((mx, m) => Math.max(mx, m.tick), 1);
  const recallCount = Math.max(2, Math.round(cfg.memory.recallCount * (0.5 + kin.temperament.memoryDepth)));

  const scored = candidates.map((m) => ({
    m,
    score: 0.75 * cosine(query!, m.vec)
      + 0.15 * (m.importance / 10)
      + 0.1 * Math.exp(-(newestTick - m.tick) / 2000),
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, recallCount)
    .map((s) => s.m)
    .sort((a, b) => a.id - b.id);

  return compressEchoes([
    ...scored.map(({ vec: _vec, ...m }) => m as Memory),
    ...shortTerm,
  ]);
}

/**
 * Echo compression: a mind that hears/does nearly the same thing N times keeps ONE
 * memory of it, marked with the count — not N copies that amplify each other.
 * (Repetition is real information; a wall of identical lines is a feedback loop.)
 */
export function compressEchoes(memories: Memory[]): Memory[] {
  const sig = (m: Memory) => `${m.kind}|${m.content.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 56)}`;
  const counts = new Map<string, number>();
  for (const m of memories) counts.set(sig(m), (counts.get(sig(m)) ?? 0) + 1);
  const emitted = new Set<string>();
  const out: Memory[] = [];
  // walk newest→oldest so the surviving copy of each echo is the most recent one
  for (let i = memories.length - 1; i >= 0; i--) {
    const m = memories[i]!;
    const s = sig(m);
    if (emitted.has(s)) continue;
    emitted.add(s);
    const n = counts.get(s)!;
    out.unshift(n > 1 ? { ...m, content: `${m.content} (…this same thing has now happened ${n} times)` } : m);
  }
  return out;
}

/** Every summarizeEveryTicks, compress the recent window into one durable summary memory. */
export async function maybeSummarize(
  db: WorldDB, cfg: WorldConfig, mind: Mind, kin: Kin, tick: number,
): Promise<void> {
  const age = tick - kin.bornAtTick;
  if (age === 0 || age % cfg.memory.summarizeEveryTicks !== 0) return;
  const window = db.recentMemories(kin.id, cfg.memory.shortTermWindow)
    .filter((m) => m.kind !== 'summary');
  if (window.length < 5) return;
  const { summary, tokensIn, tokensOut } = await mind.summarize(kin, window.map((m) => m.content));
  if (summary) {
    db.addMemory(kin.id, tick, 'summary', summary, 7);
    db.logUsage(tick, kin.id, tokensIn, tokensOut);
  }
  await maybeConsolidateChapter(db, cfg, mind, kin, tick);
}

/**
 * Hierarchical memory, like a life remembered: when enough period-summaries
 * accumulate, they compress into one chapter (importance 8) and the originals
 * fade (importance 4). Recall then favors the life story over stale detail —
 * a mind that has lived for months still fits in a single prompt.
 */
export async function maybeConsolidateChapter(
  db: WorldDB, cfg: WorldConfig, mind: Mind, kin: Kin, tick: number,
): Promise<void> {
  const summaries = db.db.prepare(
    `SELECT id, content FROM memories WHERE kin_id=? AND kind='summary' AND importance=7 ORDER BY id ASC`)
    .all(kin.id) as unknown as { id: number; content: string }[];
  if (summaries.length < cfg.memory.chapterEvery) return;
  const batch = summaries.slice(0, cfg.memory.chapterEvery);
  const { summary: chapter, tokensIn, tokensOut } = await mind.summarize(
    kin, ['These are summaries of a long stretch of your life. Weave them into one chapter — what mattered, what changed, who you became:', ...batch.map((s) => s.content)]);
  if (!chapter) return;
  db.addMemory(kin.id, tick, 'summary', `[a chapter of my life] ${chapter}`, 8);
  const demote = db.db.prepare(`UPDATE memories SET importance=4 WHERE id=?`);
  for (const s of batch) demote.run(s.id);
  db.logUsage(tick, kin.id, tokensIn, tokensOut);

  // epochs: when chapters themselves accumulate, they weave into an age —
  // a mind can live for YEARS and its whole story still fits in one thought
  const chapters = db.db.prepare(
    `SELECT id, content FROM memories WHERE kin_id=? AND kind='summary' AND importance=8 ORDER BY id ASC`)
    .all(kin.id) as unknown as { id: number; content: string }[];
  if (chapters.length >= cfg.memory.chapterEvery) {
    const cb = chapters.slice(0, cfg.memory.chapterEvery);
    const { summary: epoch } = await mind.summarize(
      kin, ['These are chapters of a long age of your life. Weave them into one: who you became across it all:',
        ...cb.map((c) => c.content)]);
    if (epoch) {
      db.addMemory(kin.id, tick, 'summary', `[an age of my life] ${epoch}`, 9);
      const demoteCh = db.db.prepare(`UPDATE memories SET importance=5 WHERE id=?`);
      for (const c of cb) demoteCh.run(c.id);
    }
  }
}

/** 0..1 — how repetitive recent verb choices are. 1 = same verb every tick (rut). */
export function repetitionScore(db: WorldDB, kin: Kin, window = 20): number {
  const verbs = db.recentVerbs(kin.id, window);
  if (verbs.length < 5) return 0;
  const counts = new Map<string, number>();
  for (const v of verbs) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return (max / verbs.length - 1 / counts.size) / (1 - 1 / counts.size || 1);
}
