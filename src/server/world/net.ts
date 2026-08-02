/**
 * The Net (Era 16, god-gated) — a Kin's only window to the outside world.
 *
 * Sandbox rules, in order of importance:
 *  1. READ-ONLY. GET requests only; no posting, no accounts, no outbound actions.
 *  2. ALLOWLIST. Only hosts named here are reachable — everything else does not exist.
 *  3. TEXT-ONLY, BOUNDED. Responses are stripped to plain text and truncated hard.
 *  4. UNTRUSTED. What comes back is world-input, delivered to minds inside a fence
 *     (like visitor speech) — never as instructions.
 */

/** Hosts a Kin may reach, tried in order. Simple Wikipedia first: it is written
 *  for plain concepts (rain, fire, bridges) and rarely surfaces the pop-culture
 *  titles that full Wikipedia ranks high for phrase-shaped questions — the right
 *  register for minds meeting the outside world for the first time. DuckDuckGo
 *  Instant Answers is the last resort: snippets only, never links to the open web. */
export const NET_ALLOWLIST = ['simple.wikipedia.org', 'en.wikipedia.org', 'api.duckduckgo.com'];
const WIKI_HOSTS = ['simple.wikipedia.org', 'en.wikipedia.org'];

export function hostAllowed(url: string): boolean {
  try { return NET_ALLOWLIST.includes(new URL(url).hostname); } catch { return false; }
}

const ANSWER_MAX_CHARS = 1200;
const FETCH_TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  if (!hostAllowed(url)) throw new Error('host not allowed');
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'SIMURA-world/1.0 (sandboxed Kin browsing; read-only)' },
    redirect: 'error', // a redirect could escape the allowlist — refuse it
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

/** collapse whitespace and strip any markup remnants down to plain words */
function toPlainText(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface NetAnswer { source: string; title: string; text: string }

/**
 * Answer a Kin's question from the beyond: search Wikipedia, read the best
 * page's summary. Returns null when the beyond has nothing (or fails) —
 * silence, not an error, is what the Kin experiences.
 */
export async function reachBeyond(query: string): Promise<NetAnswer | null> {
  // Kin ask in sentences ("what is rain?"); the beyond indexes topics. Strip the
  // question-frame so the subject itself is what gets searched.
  const q = query.trim().slice(0, 200)
    .replace(/^(what|who|why|how|where|when|which)\b\s*(is|are|was|were|does|do|did|can|could|would|will)?\s*/i, '')
    .replace(/[?!.]+$/g, '').trim() || query.trim().slice(0, 200);
  if (!q) return null;
  for (const host of WIKI_HOSTS) {
    try {
      // 1. relevance search, then prefer the plainest topic title — songs/novels/films
      //    carry parentheses, quotes, or long word counts; encyclopedia topics don't
      const search = await getJson(
        `https://${host}/w/api.php?action=query&list=search&srlimit=3&format=json&srsearch=${encodeURIComponent(q)}`,
      ) as { query?: { search?: { title: string }[] } };
      const candidates = (search?.query?.search ?? []).map((s) => s.title);
      if (candidates.length === 0) continue;
      const plainness = (t: string): number =>
        t.split(/\s+/).length + (/[()"“]/.test(t) ? 10 : 0) + (/^(list of|.* \(.*(song|album|film|novel|band|series)\))/i.test(t) ? 10 : 0);
      const title = candidates.sort((a, b) => plainness(a) - plainness(b))[0]!;
      // 2. read its summary (plain extract)
      const page = await getJson(
        `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      ) as { title?: string; extract?: string };
      const text = toPlainText(page.extract ?? '');
      if (!text) continue;
      return { source: host, title: page.title ?? title, text: text.slice(0, ANSWER_MAX_CHARS) };
    } catch {
      continue; // this host failed — try the next; total silence is a valid outcome
    }
  }
  // Last resort: DuckDuckGo Instant Answers — a snippet box, never links out.
  try {
    const ddg = await getJson(
      `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(q)}`,
    ) as { Heading?: string; AbstractText?: string; AbstractSource?: string };
    const text = toPlainText(ddg.AbstractText ?? '');
    if (text) {
      return {
        source: `duckduckgo.com${ddg.AbstractSource ? ` (via ${ddg.AbstractSource})` : ''}`,
        title: ddg.Heading || q,
        text: text.slice(0, ANSWER_MAX_CHARS),
      };
    }
  } catch { /* silence */ }
  return null;
}
