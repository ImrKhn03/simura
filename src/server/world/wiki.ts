/**
 * The Simura Wiki — the world's history as its own inhabitants tell it.
 *
 * We author NOTHING. Pages come from:
 *  - every Kin `write` document (their real histories, myths, records)
 *  - one auto-page per Kin, woven ONLY from facts already in the world
 *    (their deeds, bonds, lineage, and the writings that name them)
 *  - one page per named place
 *
 * Cross-links are computed by scanning text for names the world already knows,
 * so the wiki becomes a web the Kin themselves wove by naming and writing.
 */
import type { WorldDB } from '../db.ts';

export interface WikiPage {
  slug: string;
  title: string;
  kind: 'writing' | 'kin' | 'place';
  subtitle: string;
  body: string;             // may contain [[slug|label]] cross-links
  writtenAtTick: number;
}
export interface WikiIndex {
  writings: { slug: string; title: string; author: string | null; tick: number }[];
  kin: { slug: string; title: string; alive: boolean }[];
  places: { slug: string; title: string }[];
}

const slugify = (s: string): string => 'w-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export function buildWiki(db: WorldDB): { index: WikiIndex; pages: Record<string, WikiPage> } {
  const kin = db.listKin();
  const nameOf = new Map(kin.map((k) => [k.id, k.name]));
  const places = db.listPlaces();
  const writings = db.listObjects().filter((o) => o.kind === 'text');

  // slug tables so cross-linking can resolve a name → its page
  const kinSlug = new Map(kin.map((k) => [k.name, `kin-${k.id.slice(0, 8)}`]));
  const placeSlug = new Map(places.map((p) => [p.name, slugify(`place ${p.name}`)]));
  const writingSlug = new Map(writings.map((w) => [w.id, slugify(`text ${w.name} ${w.id.slice(0, 4)}`)]));

  // turn bare mentions of known names into [[slug|label]] links (longest names first)
  const linkTargets: { name: string; slug: string }[] = [
    ...[...kinSlug].map(([name, slug]) => ({ name, slug })),
    ...[...placeSlug].map(([name, slug]) => ({ name, slug })),
  ].filter((t) => t.name.length >= 3).sort((a, b) => b.name.length - a.name.length);
  const crossLink = (text: string, selfSlug?: string): string => {
    let out = text;
    for (const { name, slug } of linkTargets) {
      if (slug === selfSlug) continue;
      const re = new RegExp(`\\b(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'g');
      out = out.replace(re, `[[${slug}|$1]]`);
    }
    return out;
  };

  const pages: Record<string, WikiPage> = {};

  // 1. every writing is a page, verbatim, its mentions linked
  for (const w of writings) {
    const slug = writingSlug.get(w.id)!;
    pages[slug] = {
      slug, title: w.name, kind: 'writing',
      subtitle: `written by ${w.creatorKinId ? nameOf.get(w.creatorKinId) ?? 'someone lost' : 'an unknown hand'}, t${w.createdAtTick}`,
      body: crossLink(w.textContent ?? '(the marks have faded)', slug),
      writtenAtTick: w.createdAtTick,
    };
  }

  // 2. one page per Kin — woven only from world facts, never invented
  for (const k of kin) {
    const slug = `kin-${k.id.slice(0, 8)}`;
    const sol = k.parentSolId ? nameOf.get(k.parentSolId) : null;
    const lune = k.parentLuneId ? nameOf.get(k.parentLuneId) : null;
    const partner = k.coupleId ? kin.find((o) => o.id !== k.id && o.coupleId === k.coupleId)?.name ?? null : null;
    const children = kin.filter((c) => c.parentSolId === k.id || c.parentLuneId === k.id).map((c) => c.name);
    const deeds = (db.db.prepare(
      `SELECT tick, detail FROM events WHERE actor_kin_id=? AND historic=1 ORDER BY id ASC`)
      .all(k.id) as unknown as { tick: number; detail: string }[]);
    const theirWritings = writings.filter((w) => w.creatorKinId === k.id);
    const mentionedIn = writings.filter((w) => w.creatorKinId !== k.id && (w.textContent ?? '').includes(k.name));

    const lines: string[] = [];
    lines.push(sol && lune ? `Child of ${sol} and ${lune}.` : 'One of the founders, who woke at the first dawn knowing only a name.');
    if (partner) lines.push(`Bonded with ${partner}.`);
    if (children.length) lines.push(`Their children: ${children.join(', ')}.`);
    lines.push(k.status === 'dead' ? `Their light has gone out.` : `Still living.`);
    if (deeds.length) {
      lines.push('', 'Deeds remembered by the world:');
      for (const d of deeds.slice(0, 30)) lines.push(`• (t${d.tick}) ${d.detail}`);
    }
    if (theirWritings.length) {
      lines.push('', 'What they wrote:');
      for (const w of theirWritings) lines.push(`• [[${writingSlug.get(w.id)}|${w.name}]]`);
    }
    if (mentionedIn.length) {
      lines.push('', 'Named in the writings of others:');
      for (const w of mentionedIn) lines.push(`• [[${writingSlug.get(w.id)}|${w.name}]]`);
    }
    pages[slug] = {
      slug, title: k.name, kind: 'kin',
      subtitle: `${k.gender} · ${k.immortal ? 'founder' : 'born of the world'} · ${k.status}`,
      body: crossLink(lines.join('\n'), slug),
      writtenAtTick: k.bornAtTick,
    };
  }

  // 3. one page per named place
  for (const p of places) {
    const slug = placeSlug.get(p.name)!;
    pages[slug] = {
      slug, title: p.name, kind: 'place',
      subtitle: `named by ${nameOf.get(p.namedByKinId) ?? 'someone'} at t${p.tick} · (${p.pos.x}, ${p.pos.y})`,
      body: crossLink(`A place the Kin named and so made real. It lies at (${p.pos.x}, ${p.pos.y}).`, slug),
      writtenAtTick: p.tick,
    };
  }

  const index: WikiIndex = {
    writings: writings.map((w) => ({ slug: writingSlug.get(w.id)!, title: w.name, author: w.creatorKinId ? nameOf.get(w.creatorKinId) ?? null : null, tick: w.createdAtTick })),
    kin: kin.map((k) => ({ slug: `kin-${k.id.slice(0, 8)}`, title: k.name, alive: k.status !== 'dead' })),
    places: places.map((p) => ({ slug: placeSlug.get(p.name)!, title: p.name })),
  };
  return { index, pages };
}
