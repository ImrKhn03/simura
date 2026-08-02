/**
 * Memory embeddings. Default is a local hashed embedding — zero cost, offline,
 * deterministic. If EMBED_API_BASE + EMBED_MODEL are set, a real embedding API
 * (any OpenAI-compatible /embeddings endpoint) is used instead; the recall
 * code never knows the difference.
 */

export interface Embedder {
  readonly dim: number;
  readonly label: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

const LOCAL_DIM = 1024;

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'was', 'were', 'are', 'has', 'have', 'had', 'not', 'but', 'for',
  'with', 'that', 'this', 'from', 'they', 'them', 'their', 'its', 'him', 'her', 'his', 'she',
  'can', 'will', 'would', 'could', 'should', 'now', 'then', 'than', 'when', 'what', 'who',
  'out', 'into', 'onto', 'upon', 'about', 'here', 'there', 'one', 'all', 'some', 'more',
]);

/** crude stemmer: breathes/breathed/breathing → breath — enough for recall overlap */
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/i, (m, _g, off) => (w.length - m.length >= 3 ? '' : m));
}

/** signed feature hashing over stemmed words + bigrams, stopword-filtered, L2-normalized */
export function embedLocal(text: string): Float32Array {
  const v = new Float32Array(LOCAL_DIM);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 2);
  const bump = (token: string, weight: number) => {
    const h = fnv(token);
    v[h % LOCAL_DIM] = (v[h % LOCAL_DIM] ?? 0) + (h & 1 ? 1 : -1) * weight;
  };
  for (let i = 0; i < words.length; i++) {
    bump(words[i]!, 1);
    if (i + 1 < words.length) bump(`${words[i]}_${words[i + 1]}`, 0.5);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < LOCAL_DIM; i++) v[i]! /= norm;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // both are L2-normalized
}

class LocalEmbedder implements Embedder {
  readonly dim = LOCAL_DIM;
  readonly label = 'local-hash-1024';
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map(embedLocal);
  }
}

class ApiEmbedder implements Embedder {
  readonly dim: number;
  readonly label: string;
  constructor(private base: string, private apiKey: string, private model: string, dim = 1536) {
    this.dim = dim;
    this.label = `${base}/${model}`;
  }
  async embed(texts: string[]): Promise<Float32Array[]> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        'api-key': this.apiKey, // azure-style, harmless elsewhere
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as { data: { index: number; embedding: number[] }[] };
    return data.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  }
}

export function createEmbedder(): Embedder {
  const base = process.env.EMBED_API_BASE;
  const model = process.env.EMBED_MODEL;
  if (base && model) {
    return new ApiEmbedder(base, process.env.EMBED_API_KEY ?? process.env.LLM_API_KEY ?? '', model,
      Number(process.env.EMBED_DIM ?? 1536));
  }
  return new LocalEmbedder();
}
