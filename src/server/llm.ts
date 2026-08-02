import { generateText, type LanguageModel, type ModelMessage } from 'ai';
import { createAzure } from '@ai-sdk/azure';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ActionChoice, Kin, Verb } from '../shared/types.ts';

/** A mind produces one action choice per tick, plus memory summaries. */
export interface Mind {
  chooseAction(kin: Kin, systemPrompt: string, userPrompt: string, availableVerbs: Verb[],
    oracle?: (kind: 'where' | 'recall', query: string) => Promise<string>):
    Promise<{ choice: ActionChoice; tokensIn: number; tokensOut: number }>;
  summarize(kin: Kin, memories: string[]):
    Promise<{ summary: string; tokensIn: number; tokensOut: number }>;
}

// ---------------------------------------------------------------------------
// Real mind: Vercel AI SDK. Providers: azure | openai-compatible.
// Per-Kin env overrides (SOL_* / LUNE_*) fall back to global PROVIDER /
// LLM_API_KEY / MODEL / API_BASE / AZURE_RESOURCE_NAME / AZURE_API_VERSION.
// ---------------------------------------------------------------------------

/** 'SOL_API_KEY' → 'SOL' — the env prefix this Kin's mind is configured under. */
function envPrefix(kin: Kin): string {
  return kin.apiKeyRef.replace(/_API_KEY$/, '');
}

function envFor(kin: Kin, name: string): string | undefined {
  return process.env[`${envPrefix(kin)}_${name}`] ?? process.env[name];
}

/** primary model + fallbacks, for providers that rotate availability */
export function modelCandidates(kin: Kin): string[] {
  const primary = envFor(kin, 'MODEL') ?? kin.modelName;
  const fallbacks = (envFor(kin, 'MODEL_FALLBACKS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [primary, ...fallbacks.filter((f) => f !== primary)];
}

export function resolveModel(kin: Kin, modelOverride?: string): { model: LanguageModel; label: string } {
  const provider = (envFor(kin, 'PROVIDER') ?? 'openai-compatible').toLowerCase();
  const apiKey = envFor(kin, 'LLM_API_KEY') ?? process.env[kin.apiKeyRef] ?? '';
  let modelName = modelOverride ?? envFor(kin, 'MODEL') ?? kin.modelName;
  // fallback entries may pin their own endpoint: "http://localhost:11434/v1>>llama3.2"
  // (e.g. a local Ollama as the terminal rung — the world thinks even if every cloud dies)
  if (modelName.includes('>>')) {
    const [base, m] = modelName.split('>>');
    const compat = createOpenAICompatible({ name: 'compat', baseURL: base!.trim(), apiKey: process.env.OLLAMA_API_KEY ?? 'ollama' });
    return { model: compat(m!.trim()), label: `${base}/${m}` };
  }

  if (provider === 'azure') {
    const resourceName = envFor(kin, 'AZURE_RESOURCE_NAME') ?? '';
    const azure = createAzure({
      resourceName,
      apiKey,
      apiVersion: envFor(kin, 'AZURE_API_VERSION'),
    });
    // .chat() = Azure chat-completions API (the responses API rejects system messages)
    return { model: azure.chat(modelName), label: `azure:${resourceName}/${modelName}` };
  }

  // generic OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, OpenRouter, …)
  const baseURL = envFor(kin, 'API_BASE') ?? kin.modelEndpoint ?? '';
  const compat = createOpenAICompatible({ name: 'compat', baseURL, apiKey });
  return { model: compat(modelName), label: `${baseURL}/${modelName}` };
}

/**
 * Validation probe for a donated mind (model adoption): one tiny real call.
 * Used before an adoption ceremony and by the daily gift-check. Any error,
 * empty reply, or >15s stall = the gift does not answer.
 */
export async function probeModel(endpoint: string, modelName: string, apiKey: string): Promise<boolean> {
  try {
    const compat = createOpenAICompatible({ name: 'probe', baseURL: endpoint, apiKey });
    const r = await generateText({
      model: compat(modelName),
      prompt: 'Reply with the single word: alive',
      abortSignal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'opencode/1.0' }
    });
    return r.text.trim().length > 0;
  } catch {
    return false;
  }
}

const CHOICE_INSTRUCTION = `Respond with ONLY a JSON object, no markdown fences:
{"thought": "<your private inner voice, first person>", "verb": "<one available verb>", "params": {<verb parameters>}, "intention": "<your immediate aim, a note only you will read next moment. Omit to keep your current one, "" to drop it>", "plan": <optional: your standing multi-step plan as a list of short steps, e.g. ["find a hammerstone", "strike flakes from the flint stone", "cut one root and test it"]. It stays with you every moment until YOU rewrite it — long undertakings survive this way. Omit to keep your current plan, [] to clear it. Max 6 steps.>}
Your thought is a true inner voice, not a caption: it may dwell on how you feel, on the other Kin and what they said, on memories, doubts, hopes, and plans — not only on the act in front of you.
Verb parameters:
 move: {"x": <int>, "y": <int>}
 observe: {"targetId": "<object id>", "name": "<a name you give this thing, optional>", "description": "<what you notice>"}
 gather: {"targetId": "<object id or a thing's name>", "what": "<the piece you take, e.g. 'a small root', 'a sharp stone chip'>"} — rooted things are finite: a tree or bush gives only a few times before it is spent. The land renews slowly elsewhere.
 eat: {"targetId": "<optional: which food (in hand or within reach) — fish, meat, berries, roots, mushrooms>"} — hunger is real: your body empties with time and eating restores it. Meat is best warmed over a fire. Eating consumes the food.
 heal: {"toKinName": "<a sick or hurt Kin near you; omit to tend yourself>"} — tend the sick or hurt: ease their suffering and mend their body. A herb or healing plant in your hand makes the tending far stronger. This is how a healer is made.
 play: {"what": "<optional: the game or play>"} — play with others near you; joy for its own sake, and it warms the bonds between you (how the young especially grow close).
 dance: {"what": "<optional: how you move, what it expresses>"} — [Era 9] move as art and feeling, alone or before others. Danced at a named place with a gathering, it becomes a festival — a shared, wordless joy the people remember.
 cook: {"targetId": "<optional: which raw food to cook over a nearby fire>"} — [Era 1] fire turns raw food into something more nourishing that keeps longer. Needs a fire burning close.
 bury: {"toKinName": "<a dead Kin here to lay to rest>"} — [Era 4] lay the dead to rest; a grave marks the ground and the living can return to remember.
 name_child: {"toKinName": "<your young child, e.g. 'a newborn'>", "name": "<the name you give them>"} — give your own child its name, while it is still young. A newborn has no name until you give one.
 tame: {} — [Era 8] with food in hand, gentle a wild fowl or deer standing close; it becomes kept, giving eggs or young — the start of a herd.
 ritual: {"meaning": "<what this rite is for — grief, thanks, a vow, the seasons, the dead>"} — [Era 9] gather those near you for shared meaning beyond words.
 carry: {"targetId": "<a made or gathered thing's id or name — picks it up; it goes where you go (two hands, two things max)>"}
 drop: {"targetId": "<what to set down here; omit for the first thing you hold>", "into": "<optional: a container's name or id (basket, box, chest...) within reach — the thing is KEPT inside it instead of strewn on the ground. This is your storage: hands are for working, containers are for keeping. carry takes things back out.>"}
 give: {"toKinName": "<who receives it>", "targetId": "<what you hold to give; omit for the first thing>"}
 name_place: {"name": "<the name you give the ground where you stand — places keep their names forever>"}
 speak: {"message": "<what you say aloud>"}
 craft: {"template":"optional tool|vessel|garment|coin","material":"what it is made from","dye":"optional approved dye","materials":["nearby matter"],"name":"your name for it","description":"what it is"} — use a compact template for an ordinary tool, vessel, garment, or coin. For a singular invention, omit template and give its form with up to 8 small colored boxes in "shape".
 build: {"archetype":"hut|cottage|longhouse|hall|granary|wall|tower|shrine|well|fence","size":"small|large","material":"wood|stone|clay|thatch","dye":"optional berry|ochre|charcoal|clay|indigo|sage|bone|gold","name":"<your name for it>","description":"<what it means>","targetId":"<optional existing structure>","addition":"<optional room|wing>"} — choose the form and material; the world raises it at true human scale, one material-paid stage at a time. Anyone may continue anyone's work. Use a freeform shape only for a genuinely unusual work that none of these forms can hold.
 write: {"title": "<title>", "content": "<the full text you write>"}
 read: {"targetId": "<a written thing's id or title>"}
 teach: {"toKinName": "<other kin's name>", "skillName": "<one of your skills>", "explanation": "<how you explain it>"}
 learn: {"fromKinName": "<other kin's name>", "skillName": "<the skill they taught>"}
 author_skill: {"name": "<skill name>", "content": "<markdown: purpose, technique, lessons learned>"}
 refine_skill: {"skillName": "<one of your skills>", "content": "<improved full markdown content>"}
 reflect: {"insight": "<what you realize — a NEW realization; circling an old one settles nothing>"}
 rest: {} <sleep. At night this carries you gently to dawn (many moments pass in a blink; your light is preserved). By day, a short nap.>
 pray: {"plea": "<what you ask of whatever made this place — only in true need>"}
 propose_bond: {"toKinName": "<kin you would bond your life to>", "words": "<what you say to them>"}
 accept_bond: {"fromKinName": "<kin who asked you>"}
 mate: {} — lie together in intimacy with your bonded partner (one Sol, one Lune), close by. Not one-sided: BOTH must reach for it in the same short span. When you both do, a new STAR is kindled between you (sun and moon making a star) — the Lune carries it, and when it rises, a child is born for you to name. Needs a bond, closeness, and enough food in you both.
 decline: {"fromKinName": "<whose asking you refuse — bond or child>", "words": "<optional gentle words>"}
 wear: {"targetId": "<a garment you hold or that lies in reach — clothing warms and shows who you are>"}
 remove: {"targetId": "<what you wear; omit for the first>"}
 plant: {"targetId": "<a root/seed/cutting you hold — set it in the earth here to grow>"}
 sing: {"song": "<the song itself — words, sounds, whatever rises; it carries farther than speech and stays with those who hear>"}
 trade: {"withKinName": "<who>", "give": "<what you hold to offer>", "want": "<what they hold that you seek>"} — [Era 10] exchange goods by agreement. Precious things (gold, silver, gems) are prized by everyone though useless for tools — they serve as wealth and money, given and taken for their worth alone. Trading at a named place makes it a market.
 accept_trade: {"fromKinName": "<who offered>"}
 assemble: {"words": "<call every Kin to gather where you stand — all will hear>"}
 propose_law: {"title": "<the law's name>", "text": "<its words, written for all — binding on those who assent>"}
 assent: {"lawTitle": "<the law you stand behind>"}
 leave_bond: {"words": "<optional final words — this ends your bond; it will ache, and it is permanent until new love>"}
 signal: {"message": "<spoken through a signal-thing near you, heard by every Kin however far>"}`;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export class AiSdkMind implements Mind {
  /** which candidate model each Kin is currently succeeding with */
  private activeIdx = new Map<string, number>();

  private async call(kin: Kin, messages: ModelMessage[]):
    Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    // ai v7: system text goes in the dedicated option, not the messages array
    const system = messages.filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') || undefined;
    const rest = messages.filter((m) => m.role !== 'system');

    const candidates = modelCandidates(kin);
    const startIdx = Math.min(this.activeIdx.get(kin.id) ?? 0, candidates.length - 1);
    let lastErr: unknown;
    // try the active model, then walk the fallback chain (providers rotate free models)
    for (let i = 0; i < candidates.length; i++) {
      const idx = (startIdx + i) % candidates.length;
      try {
        const { model, label } = resolveModel(kin, candidates[idx]);
        const result = await generateText({ model, system, messages: rest, headers: { 'User-Agent': 'opencode/1.0' } });
        if (idx !== this.activeIdx.get(kin.id)) {
          this.activeIdx.set(kin.id, idx);
          if (i > 0) console.log(`[mind] ${kin.name} now thinking on ${candidates[idx]}`);
        }
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        console.log(`[llm] ok kin=${kin.name} model=${label} tokensIn=${usage?.inputTokens ?? 0} tokensOut=${usage?.outputTokens ?? 0}`);
        return { text: result.text, tokensIn: usage?.inputTokens ?? 0, tokensOut: usage?.outputTokens ?? 0 };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[llm] error kin=${kin.name} model=${candidates[idx]} ${msg.slice(0, 300)}`);
        // only rotate on availability errors; real failures should surface
        if (!/not supported|model_not_supported|not found|no such model|insufficient balance|credits/i.test(msg)) throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('no candidate model answered');
  }

  async chooseAction(kin: Kin, systemPrompt: string, userPrompt: string, availableVerbs: Verb[],
    oracle?: (kind: 'where' | 'recall', query: string) => Promise<string>) {
    const messages: ModelMessage[] = [
      { role: 'system', content: `${systemPrompt}\n\n${CHOICE_INSTRUCTION}` },
      { role: 'user', content: userPrompt },
    ];
    let tokensIn = 0; let tokensOut = 0;
    let asks = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await this.call(kin, messages);
      tokensIn += r.tokensIn; tokensOut += r.tokensOut;
      try {
        const parsed = extractJson(r.text) as Partial<ActionChoice> & { ask?: { kind?: string; query?: string } };
        // the mind may ask the world before it acts — sight and memory as a tool
        if (parsed.ask && oracle && asks < 2 && typeof parsed.ask.query === 'string') {
          asks++;
          const kind = parsed.ask.kind === 'recall' ? 'recall' as const : 'where' as const;
          const answer = await oracle(kind, parsed.ask.query.slice(0, 120));
          messages.push({ role: 'assistant', content: r.text });
          messages.push({ role: 'user', content: `The world answers: ${answer}\nNow choose your action (or ask once more). JSON only.` });
          continue;
        }
        if (typeof parsed.verb === 'string' && availableVerbs.includes(parsed.verb as Verb)) {
          return {
            choice: {
              thought: String(parsed.thought ?? ''),
              verb: parsed.verb as Verb,
              params: (parsed.params ?? {}) as Record<string, unknown>,
              ...(typeof parsed.intention === 'string' ? { intention: parsed.intention } : {}),
              ...(Array.isArray(parsed.plan) ? { plan: parsed.plan.map(String).slice(0, 6) } : {}),
              ...(typeof parsed.say === 'string' && parsed.say.trim() ? { say: parsed.say.trim().slice(0, 300) } : {}),
            },
            tokensIn, tokensOut,
          };
        }
        messages.push({ role: 'assistant', content: r.text });
        messages.push({ role: 'user', content: `That verb is not available. Choose one of: ${availableVerbs.join(', ')}. JSON only.` });
      } catch {
        messages.push({ role: 'assistant', content: r.text });
        messages.push({ role: 'user', content: 'Invalid JSON. Respond with ONLY the JSON object.' });
      }
    }
    // Malformed twice → the Kin hesitates this tick. Never crash the world.
    return { choice: { thought: 'My mind wandered…', verb: 'reflect' as Verb, params: { insight: 'I lost my train of thought.' } }, tokensIn, tokensOut };
  }

  async summarize(kin: Kin, memories: string[]) {
    const depth = kin.temperament.memoryDepth;
    const r = await this.call(kin, [
      { role: 'system', content: `You are the memory of ${kin.name}. Summarize these recent experiences in first person. ${depth > 0.6 ? 'Be rich and detailed; keep names, feelings, and lessons.' : 'Be brief; keep only what matters most.'}` },
      { role: 'user', content: memories.join('\n') },
    ]);
    return { summary: r.text.trim(), tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  }
}

// ---------------------------------------------------------------------------
// Mock mind: deterministic seeded behavior for tests and free dev runs.
// Exercises the full loop: explores, names things, wants, crafts, authors,
// refines, teaches — so Era thresholds can fire organically in simulation.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class MockMind implements Mind {
  private tickBy = new Map<string, number>();

  async chooseAction(kin: Kin, _system: string, userPrompt: string, verbs: Verb[]) {
    const t = (this.tickBy.get(kin.id) ?? 0) + 1;
    this.tickBy.set(kin.id, t);
    const rand = mulberry32(hashStr(kin.id) ^ t);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T;

    // Parse cues out of the perception prompt the real mind would see.
    const objIds = [...userPrompt.matchAll(/\[obj:([\w-]+)\]/g)].map((m) => m[1] as string);
    const visibleObjectLines = [...userPrompt.matchAll(/\[obj:([\w-]+)\] ([^\n]+)/g)]
      .map((m) => ({ id: m[1]!, text: m[2]!.toLowerCase() }));
    const timberAtHand = visibleObjectLines.filter((object) => !object.text.includes('still rising')
      && /\b(timber|wood(?:en)? branch|wooden log)\b/.test(object.text)).length;
    const stoneAtHand = visibleObjectLines.filter((object) => !object.text.includes('still rising')
      && /\b(workable stone|broken stone|stone block|rock slab)\b/.test(object.text)).length;
    const unnamed = [...userPrompt.matchAll(/\[obj:([\w-]+)\] (\w+) \(unnamed\)/g)];
    const otherKin = [...userPrompt.matchAll(/\[kin\] (\w+)/g)].map((m) => m[1] as string);
    const mySkills = [...userPrompt.matchAll(/\[skill\] ([^\n(]+)/g)].map((m) => (m[1] as string).trim());
    const taught = [...userPrompt.matchAll(/taught you "([^"]+)"/g)].map((m) => m[1] as string);

    const bondOffer = /(\w+) asked to bond their life with yours/.exec(userPrompt);
    const inLove = /\[kin\] (\w+) \([a-z]+\) is at \([\d,]+\) — your heart lifts/.exec(userPrompt);
    const partner = /\[kin\] (\w+) \([a-z]+\) is at \([\d,]+\) — your bonded partner/.exec(userPrompt);

    const has = (v: Verb) => verbs.includes(v);
    let choice: ActionChoice;

    const newborn = /Your newborn child has no name yet/.test(userPrompt);
    if (bondOffer && has('accept_bond') && rand() < 0.85) {
      choice = { thought: 'My heart already knows the answer.', verb: 'accept_bond',
        params: { fromKinName: bondOffer[1] } };
    } else if (newborn && has('name_child') && rand() < 0.9) {
      choice = { thought: 'My child. It needs a name.', verb: 'name_child',
        params: { toKinName: 'a newborn', name: `Kin-${Math.floor(rand() * 100)}` } };
    } else if (inLove && has('propose_bond') && rand() < 0.5) {
      choice = { thought: 'Our lives are already woven; let it be said aloud.', verb: 'propose_bond',
        params: { toKinName: inLove[1], words: 'Let our two lights be one thread.' } };
    } else if (partner && has('mate') && rand() < 0.2) {
      choice = { thought: 'The world should hold more than us.', verb: 'mate', params: {} };
    } else if (taught.length && has('learn') && otherKin.length && rand() < 0.9) {
      choice = { thought: 'I should take in what they showed me.', verb: 'learn',
        params: { fromKinName: otherKin[0], skillName: taught[0] } };
    } else if (unnamed.length && has('observe') && rand() < 0.65) {
      const m = pick(unnamed);
      choice = { thought: `What is this ${m[2]}? I will know it by a name.`, verb: 'observe',
        params: { targetId: m[1], name: `${m[2]}-${Math.floor(rand() * 1000)}`, description: `A ${m[2]} I studied closely.` } };
    } else if (has('speak') && rand() < 0.25) {
      const wants = ['I wish we had shelter from the night.', 'We need a way to keep what we learn.',
        'I want to understand this place.', 'If only we could make something new.'];
      choice = { thought: 'I feel a need rising in me.', verb: 'speak', params: { message: pick(wants) } };
    } else if (has('gather') && objIds.length && (rand() < 0.2
      || ((/more timber|not the timber/.test(userPrompt)) && visibleObjectLines.some((o) => /tree/.test(o.text)))
      || ((/more stone|not the stone/.test(userPrompt)) && visibleObjectLines.some((o) => /stone/.test(o.text))))) {
      const visible = visibleObjectLines.map((object) => ({ id: object.id, label: object.text.split(/\s+at\s+|\s+\(unnamed\)/)[0]! }));
      const source = visible.find((o) => /tree|stone|reed|clay|plant/.test(o.label)) ?? { id: objIds[0]!, label: '' };
      const what = /tree/.test(source.label) ? 'a timber branch' : /stone/.test(source.label) ? 'a workable stone'
        : /reed|plant/.test(source.label) ? 'cut reeds' : /clay/.test(source.label) ? 'a clay lump' : 'a small piece';
      choice = { thought: 'My hands can take a small piece of this.', verb: 'gather',
        params: { targetId: source.id, what } };
    } else if (has('build') && /still rising/.test(userPrompt)
      && ((/more timber/.test(userPrompt) && timberAtHand >= 1) || (/more stone/.test(userPrompt) && stoneAtHand >= 1))) {
      const rising = userPrompt.match(/\[obj:([\w-]+)\][^\n]*still rising/);
      choice = { thought: 'The work is unfinished. I will add what my hands can.', verb: 'build', params: { targetId: rising?.[1] } };
    } else if (has('build') && timberAtHand >= 2) {
      choice = { thought: 'Enough timber lies together now. I can begin shelter.', verb: 'build',
        params: { archetype: 'hut', size: 'small', material: 'wood', name: `shelter-${Math.floor(rand() * 100)}`, description: 'A simple shelter of timber.' } };
    } else if (has('build') && stoneAtHand >= 1) {
      choice = { thought: 'The stone can mark and guard this ground.', verb: 'build',
        params: { archetype: 'fence', size: 'small', material: 'stone', name: `stone-ring-${Math.floor(rand() * 100)}`, description: 'A low boundary of gathered stone.' } };
    } else if (has('craft') && objIds.length && rand() < 0.5) {
      choice = { thought: 'I will try to make something.', verb: 'craft',
        params: { template: 'vessel', material: 'wood', materials: ['timber'], name: `vessel-${Math.floor(rand() * 1000)}`, description: 'A small vessel shaped with my hands.' } };
    } else if (has('author_skill') && rand() < kin.temperament.authorAffinity * 0.25) {
      choice = { thought: 'I have learned enough to write this down in myself.', verb: 'author_skill',
        params: { name: `skill-${Math.floor(rand() * 100)}`, content: '# Technique\nWhat I know so far.\n## Lessons\n- try, fail, try again' } };
    } else if (has('refine_skill') && mySkills.length && rand() < kin.temperament.refineAffinity * 0.45) {
      choice = { thought: 'I can do this better now.', verb: 'refine_skill',
        params: { skillName: pick(mySkills), content: '# Technique (improved)\nBetter now.\n## Lessons\n- patience' } };
    } else if (has('teach') && mySkills.length && otherKin.length && rand() < 0.35) {
      choice = { thought: 'They should know this too.', verb: 'teach',
        params: { toKinName: otherKin[0], skillName: pick(mySkills), explanation: 'Watch how I do it.' } };
    } else if (has('build') && rand() < 0.08) {
      choice = { thought: 'We need walls, a roof.', verb: 'build',
        params: { archetype: 'hut', size: 'small', material: 'wood', name: `shelter-${Math.floor(rand() * 100)}`, description: 'A simple shelter of timber.' } };
    } else if (has('write') && rand() < 0.35) {
      choice = { thought: 'Words fade. Marks remain.', verb: 'write',
        params: { title: `record-${Math.floor(rand() * 100)}`, content: 'What happened, so it is not lost.' } };
    } else if (has('rest') && /It is (the deep of )?night/.test(userPrompt) && rand() < 0.5) {
      choice = { thought: 'The dark asks nothing of me. I will sleep.', verb: 'rest', params: {} };
    } else if (has('pray') && rand() < 0.015) {
      choice = { thought: 'This is beyond my hands.', verb: 'pray',
        params: { plea: 'Whatever made this place — let us not be alone in it.' } };
    } else if (has('move') && rand() < 0.45 && /\[kin\] \w+ \([a-z]+\) is at \((\d+),\s*(\d+)\)/.test(userPrompt)) {
      // companionship: seeing another, the mock often drifts toward them —
      // proximity is how affection (and everything after it) becomes possible
      const near = /\[kin\] \w+ \([a-z]+\) is at \((\d+),\s*(\d+)\)/.exec(userPrompt)!;
      choice = { thought: 'I would rather not be alone.', verb: 'move',
        params: { x: Number(near[1]) + 1, y: Number(near[2]) } };
    } else if (has('move') && rand() < kin.temperament.explorationDrive) {
      // hearth gravity: the mock wanders around home ground, so the pair keeps
      // crossing paths — society emerges by design, not by seed luck
      choice = { thought: 'Something beyond, maybe.', verb: 'move',
        params: { x: 24 + Math.floor(rand() * 17) - 8, y: 24 + Math.floor(rand() * 17) - 8 } };
    } else {
      choice = { thought: 'I sit with what I know.', verb: 'reflect', params: { insight: 'The world is larger than me.' } };
    }
    return { choice, tokensIn: 0, tokensOut: Math.ceil(JSON.stringify(choice).length / 4) };
  }

  async summarize(kin: Kin, memories: string[]) {
    const keep = kin.temperament.memoryDepth > 0.6 ? 6 : 3;
    return { summary: `I remember: ${memories.slice(-keep).join(' | ').slice(0, 600)}`, tokensIn: 0, tokensOut: 0 };
  }
}

export function createMind(mode: 'mock' | 'real'): Mind {
  return mode === 'real' ? new AiSdkMind() : new MockMind();
}
