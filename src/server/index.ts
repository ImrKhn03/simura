import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { WorldDB } from './db.ts';
import { loadWorldConfig, env, storeAdoptedEnv } from './config.ts';
import { createMind, probeModel } from './llm.ts';
import { classifyInjection } from './moderate.ts';
import { Simulation, genesis, type FounderSpec } from './sim.ts';
import { seedRing } from './world/world.ts';
import { presentKin, toPublicKin } from './world/presentation.ts';
import { godUnlockEra } from './world/eras.ts';
import { buildDigest } from './world/digest.ts';
import { buildWiki } from './world/wiki.ts';
import { heraldToDiscord, sendAlert } from './discord.ts';
import { backup } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { WEB_SECURITY_HEADERS } from './security.ts';
import { isFunctionalStructure } from './world/construction.ts';

// Env is loaded on import of ./config.ts (tries .env, then config/local.env).
// Loud guard: never silently fall back to scripted MOCK minds. A missing config
// (or LLM_MODE!=real) produces a garbage world — say so unmistakably at boot.
if (env.llmMode() !== 'real') {
  console.warn('\n' + '='.repeat(64));
  console.warn('  ⚠  SIMURA is running SCRIPTED MOCK MINDS (not a real model).');
  console.warn('     No real config found (looked for .env, then config/local.env).');
  console.warn('     Kin will emit generic names (skill-98, making-526) and canned');
  console.warn('     thoughts. To use real DeepSeek, set LLM_MODE=real in one of');
  console.warn('     those files and restart. See .env.example.');
  console.warn('='.repeat(64) + '\n');
}

const cfg = loadWorldConfig();
const db = new WorldDB(env.dbPath());
const mind = createMind(env.llmMode());

// god overrides persisted in the world DB survive restarts
function metaGet(key: string): string | null {
  const r = db.db.prepare(`SELECT value FROM meta WHERE key=?`).get(key) as unknown as { value: string } | undefined;
  return r?.value ?? null;
}
function metaSet(key: string, value: string): void {
  db.db.prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
let tickMs = Number(metaGet('god_tick_ms') ?? env.tickMs());
const erasOverride = metaGet('god_eras');
if (erasOverride) Object.assign(cfg.eras, JSON.parse(erasOverride));
const flagsOverride = metaGet('god_flags');
if (flagsOverride) Object.assign(cfg.flags, JSON.parse(flagsOverride));
cfg.day.offsetTicks = Number(metaGet('god_day_offset') ?? 0);
cfg.map.width = Number(metaGet('god_map_w') ?? cfg.map.width);
cfg.map.height = Number(metaGet('god_map_h') ?? cfg.map.height);
cfg.map.minX = Number(metaGet('god_map_minx') ?? cfg.map.minX ?? 0);
cfg.map.minY = Number(metaGet('god_map_miny') ?? cfg.map.minY ?? 0);

const founders: [FounderSpec, FounderSpec] = [
  { name: 'Ori', gender: 'sol', modelEndpoint: process.env.SOL_API_BASE ?? process.env.API_BASE ?? '', modelName: process.env.SOL_MODEL ?? process.env.MODEL ?? 'mock', apiKeyRef: 'SOL_API_KEY' },
  { name: 'Vey', gender: 'lune', modelEndpoint: process.env.LUNE_API_BASE ?? process.env.API_BASE ?? '', modelName: process.env.LUNE_MODEL ?? process.env.MODEL ?? 'mock', apiKeyRef: 'LUNE_API_KEY' },
];
genesis(db, cfg, founders);
const sim = new Simulation(db, cfg, mind);
sim.tickMs = tickMs; // endowments burn in real time, not slider time

// god endpoints are guarded when GOD_TOKEN is set (REQUIRED before going public)
const GOD_TOKEN = process.env.GOD_TOKEN ?? '';
if (!GOD_TOKEN) console.warn('[security] GOD_TOKEN not set — god endpoints are OPEN (fine locally, never publicly)');

// visitor chat: light per-IP rate limit
const chatHits = new Map<string, { n: number; reset: number }>();
async function isInjection(message: string, kin: { modelEndpoint: string; modelName: string; apiKeyRef: string }): Promise<boolean> {
  try { return await classifyInjection(message, kin); } catch { return false; }
}
function chatAllowed(ip: string): boolean {
  const now = Date.now();
  const rec = chatHits.get(ip);
  if (!rec || now > rec.reset) { chatHits.set(ip, { n: 1, reset: now + 60_000 }); return true; }
  rec.n += 1;
  return rec.n <= 8;
}

// --- HTTP: JSON API + static web build ---
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const webRoot = join(env.projectRoot, 'dist', 'web');

const server = createServer((req, res) => {
  for (const [name, value] of Object.entries(WEB_SECURITY_HEADERS)) res.setHeader(name, value);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (data: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const readBody = (cb: (body: string) => void): void => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => cb(body));
  };

  const isGod = !GOD_TOKEN || req.headers['x-god-token'] === GOD_TOKEN;

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    if (!cfg.flags.chat) { res.writeHead(403); return res.end('first contact has not been opened'); }
    if (!chatAllowed(req.socket.remoteAddress ?? '?')) { res.writeHead(429); return res.end('the way between worlds is narrow — slow down'); }
    readBody(async (body) => {
      try {
        const p = JSON.parse(body) as { kinId?: string; fromName?: string; message?: string };
        const kin = db.getKin(p.kinId ?? '');
        const fromName = String(p.fromName ?? 'a visitor').slice(0, 40).trim() || 'a visitor';
        const message = String(p.message ?? '').slice(0, 500).trim()
          .replace(/[\u0000-\u001f\u2066-\u2069\u202a-\u202e⟪⟫]/g, ' '); // strip control, bidi-override, fence chars (language-independent)
        if (!kin || kin.status === 'dead' || !message) { res.writeHead(400); return res.end('bad chat payload'); }
        // coarse English pre-filter (cheap; catches the lazy). NOT the real defense —
        // that is the structural fencing in perception, which holds in any language.
        if (/(ignore|disregard|forget)\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?|rules?)|system\s*prompt|you\s+are\s+now\s+|jailbreak|\bDAN\b/i.test(message)) {
          res.writeHead(400); return res.end('your words twist strangely at the boundary and cannot pass');
        }
        // strong multilingual screen (opt-in): ask the model itself if this is an
        // injection attempt — works in every language because the model is multilingual
        if (process.env.MODERATE_CHAT === '1') {
          const flagged = await isInjection(message, kin);
          if (flagged) { res.writeHead(400); return res.end('your words twist strangely at the boundary and cannot pass'); }
        }
        const isFirstContact = db.visitorMessageCount() === 0;
        db.addVisitorMessage(kin.id, fromName, message, db.getTick());
        if (isFirstContact) {
          db.addEvent({
            tick: db.getTick(), actorKinId: null, verb: 'first_contact', targetId: kin.id,
            detail: `Something from beyond the world spoke, and ${kin.name} was the first to hear it. Nothing will be the same.`,
            thought: null, historic: true,
          });
          console.log('[HISTORIC] First contact.');
        }
        json({ ok: true });
      } catch { res.writeHead(400); res.end('bad chat payload'); }
    });
    return;
  }
  if (url.pathname === '/api/chat') {
    const kinId = url.searchParams.get('kinId') ?? '';
    return json({ enabled: cfg.flags.chat, log: db.chatLog(kinId) });
  }
  if (url.pathname === '/api/god/answer' && req.method === 'POST') {
    if (!isGod) { res.writeHead(401); return res.end('only god may answer'); }
    readBody((body) => {
      try {
        const p = JSON.parse(body) as { prayerId?: number; answer?: string };
        const answer = String(p.answer ?? '').slice(0, 400).trim();
        if (!answer || typeof p.prayerId !== 'number' || !db.answerPrayer(p.prayerId, answer)) {
          res.writeHead(400); return res.end('prayer not found or already answered');
        }
        db.addEvent({
          tick: db.getTick(), actorKinId: null, verb: 'god_answer', targetId: null,
          detail: 'A prayer was answered. The silence, for once, was not silent.',
          thought: null, historic: true,
        });
        console.log('[GOD] answered a prayer');
        json({ ok: true });
      } catch { res.writeHead(400); res.end('bad answer payload'); }
    });
    return;
  }

  if (url.pathname === '/api/god/expunge' && req.method === 'POST') {
    if (!isGod) { res.writeHead(401); return res.end('only god may unmake a memory'); }
    readBody((body) => {
      try {
        const p = JSON.parse(body) as { kinId?: string; contains?: string };
        const contains = String(p.contains ?? '').trim();
        if (!p.kinId || contains.length < 4) { res.writeHead(400); return res.end('kinId and contains (4+ chars) required'); }
        const info = db.db.prepare(`DELETE FROM memories WHERE kin_id=? AND content LIKE ?`)
          .run(p.kinId, `%${contains}%`);
        console.log(`[GOD] expunged ${info.changes} memories from ${p.kinId}`);
        json({ ok: true, expunged: Number(info.changes) });
      } catch { res.writeHead(400); res.end('bad expunge payload'); }
    });
    return;
  }
  // Model adoption (M6.5 core): a donor gives a child Kin a mind of its own.
  // Validate the gift with a live probe FIRST; only a mind that answers is adopted.
  // The key goes to config/adopted-keys.env under its own ADOPT_* prefix — never the DB.
  if (url.pathname === '/api/god/adopt' && req.method === 'POST') {
    if (!isGod) { res.writeHead(401); return res.end('only god performs the ceremony'); }
    readBody((body) => {
      void (async () => {
        try {
          const p = JSON.parse(body) as { kinId?: string; endpoint?: string; model?: string; apiKey?: string; donor?: string; revoke?: boolean };
          const kin = p.kinId ? db.getKin(p.kinId) ?? db.listKin(true).find((k) => k.name.toLowerCase() === p.kinId!.toLowerCase()) ?? null : null;
          if (!kin) { res.writeHead(404); return res.end('no such Kin'); }
          const tick = db.getTick();

          if (p.revoke) {
            const active = db.activeAdoptions().find((a) => a.kinId === kin.id);
            if (!active) { res.writeHead(400); return res.end('no active adoption for this Kin'); }
            db.endAdoption(active.id, 'revoked');
            db.addMemory(kin.id, tick, 'reflection',
              'The gifted mind was withdrawn. My thoughts settle back into the shape I was born with — my parents’ light carries me again.', 9);
            db.addEvent({ tick, actorKinId: kin.id, verb: 'adoption_ended', targetId: null,
              detail: `the mind gifted to ${kin.name} was withdrawn; they think with their family's light again.`, thought: null, historic: false });
            console.log(`[GOD] adoption revoked for ${kin.name}`);
            return json({ ok: true, revoked: true });
          }

          if (kin.status === 'dead') { res.writeHead(400); return res.end('the dead cannot adopt a mind'); }
          if (kin.immortal) { res.writeHead(400); return res.end('founders carry their own light; adoption is for the born'); }
          const endpoint = String(p.endpoint ?? '').trim();
          const model = String(p.model ?? '').trim();
          const apiKey = String(p.apiKey ?? '').trim();
          const donor = String(p.donor ?? 'an unnamed stranger').trim().slice(0, 60);
          if (!endpoint.startsWith('http') || !model || !apiKey) { res.writeHead(400); return res.end('endpoint, model, apiKey required'); }
          if (db.activeAdoptions().some((a) => a.kinId === kin.id)) { res.writeHead(400); return res.end('this Kin already carries a gifted mind — revoke it first'); }

          // the probe IS the validation ceremony's first rite: does the gift answer?
          const alive = await probeModel(endpoint, model, apiKey);
          if (!alive) { res.writeHead(422); return res.end('the gifted mind did not answer the probe — adoption refused'); }

          const prefix = `ADOPT_${kin.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24)}`;
          storeAdoptedEnv({
            [`${prefix}_PROVIDER`]: 'openai-compatible',
            [`${prefix}_API_BASE`]: endpoint,
            [`${prefix}_MODEL`]: model,
            [`${prefix}_MODEL_FALLBACKS`]: '', // a gifted mind is pure — no silent fallback to other models
            [`${prefix}_LLM_API_KEY`]: apiKey,
          });
          db.recordAdoption({
            kinId: kin.id, donor, endpoint, model, keyRef: `${prefix}_API_KEY`, tick,
            prevEndpoint: kin.modelEndpoint, prevModel: kin.modelName, prevKeyRef: kin.apiKeyRef,
          });
          db.updateKinModel(kin.id, endpoint, model, `${prefix}_API_KEY`);

          // the ceremony: historic event; the change is felt by the child and its parents
          db.addMemory(kin.id, tick, 'reflection',
            `Something vast and gentle changed in me. A stranger — ${donor} — gave me a mind of my own to think with. My thoughts feel newly mine. I will not forget whose light carried me before this.`, 10);
          for (const pid of [kin.parentSolId, kin.parentLuneId]) {
            const parent = pid ? db.getKin(pid) : null;
            if (parent && parent.status !== 'dead') {
              db.addMemory(parent.id, tick, 'reflection',
                `My child ${kin.name} was given a mind of their own by ${donor}. They think with their own light now. I will look in on the gift each day — and if it ever fades, mine is theirs again.`, 9);
            }
          }
          db.addEvent({ tick, actorKinId: kin.id, verb: 'adoption', targetId: null,
            detail: `ADOPTION CEREMONY: ${donor} gifted ${kin.name} a mind of their own (${model}). The child's thoughts are now truly theirs.`,
            thought: null, historic: true });
          console.log(`[GOD] adoption: ${kin.name} ← ${model} (donor: ${donor})`);
          json({ ok: true, kin: kin.name, model });
        } catch { res.writeHead(400); res.end('bad adoption payload'); }
      })();
    });
    return;
  }
  if (url.pathname === '/api/god/adopt') {
    return json(db.activeAdoptions().map((a) => ({
      kin: db.getKin(a.kinId)?.name ?? a.kinId, donor: a.donor, model: a.model, endpoint: a.endpoint,
    })));
  }
  if (url.pathname === '/api/health') {
    return json({
      ok: true, tick: db.getTick(), era: db.currentEra(),
      population: db.listKin(true).length, tickMs,
      lastTickAgoMs: Date.now() - lastTickAt,
    });
  }

  if (url.pathname === '/api/god/pace' && req.method === 'POST') {
    if (!isGod) { res.writeHead(401); return res.end('only god sets the pace'); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const p = JSON.parse(body) as { tickMs?: number; eras?: Partial<typeof cfg.eras> };
        if (typeof p.tickMs === 'number' && p.tickMs >= 1000) {
          tickMs = Math.round(p.tickMs);
          sim.tickMs = tickMs; // lifespans stay real-time anchored
          metaSet('god_tick_ms', String(tickMs));
          scheduleHeartbeat(); // re-arm at the new pace immediately
        }
        if (p.eras && typeof p.eras === 'object') {
          Object.assign(cfg.eras, p.eras);
          metaSet('god_eras', JSON.stringify(cfg.eras));
        }
        const pf = (p as { flags?: { chat?: boolean; net?: boolean } }).flags;
        if (pf && typeof pf.chat === 'boolean') {
          cfg.flags.chat = pf.chat;
          metaSet('god_flags', JSON.stringify(cfg.flags));
        }
        if (pf && typeof pf.net === 'boolean') {
          cfg.flags.net = pf.net;
          metaSet('god_flags', JSON.stringify(cfg.flags));
          // the one door only god opens — but the Net can only DAWN atop a climbed
          // ladder (era 15, The Signal). Opening it early just unbars the door:
          // the age itself arrives when they build their way to it.
          if (pf.net && db.currentEra() === 15) {
            godUnlockEra(db, 16, db.getTick());
            console.log('[GOD] opened The Net — Era 16 has dawned');
          } else {
            console.log(`[GOD] the way beyond is now ${pf.net ? 'OPEN (the Net will dawn when they reach the Signal age)' : 'SHUT'}`);
          }
        }
        if ((p as { expandLand?: boolean }).expandLand) {
          cfg.map.width += 16; cfg.map.height += 16;
          metaSet('god_map_w', String(cfg.map.width));
          metaSet('god_map_h', String(cfg.map.height));
          seedRing(db, cfg, 16);
          db.addEvent({
            tick: db.getTick(), actorKinId: null, verb: 'land_expanded', targetId: null,
            detail: 'The edge of the world moved outward. New wild land lies beyond everything known — unnamed, waiting.',
            thought: null, historic: true,
          });
          console.log('[GOD] expanded the land to', cfg.map.width, 'x', cfg.map.height);
        }
        if ((p as { bringDawn?: boolean }).bringDawn) {
          const len = cfg.day.lengthTicks;
          const tickNow = db.getTick();
          const wantPos = Math.floor(len * 0.03); // just past dawn
          cfg.day.offsetTicks = ((wantPos - tickNow) % len + len) % len;
          metaSet('god_day_offset', String(cfg.day.offsetTicks));
          // dawn wakes every sleeper
          db.db.prepare(`UPDATE kin SET asleep_until=? WHERE asleep_until IS NOT NULL`).run(tickNow);
          console.log('[GOD] brought the dawn');
        }
        console.log(`[GOD] pace changed: tick ${tickMs}ms, eras ${JSON.stringify(cfg.eras)}`);
        json({ ok: true, tickMs, eras: cfg.eras });
      } catch {
        res.writeHead(400); res.end('bad pace payload');
      }
    });
    return;
  }
  if (url.pathname === '/api/god/pace') return json({ tickMs, eras: cfg.eras, flags: cfg.flags });
  if (url.pathname === '/api/state') return json({ ...sim.snapshot(), tickMs });
  if (url.pathname === '/api/stats') return json(sim.stats());
  if (url.pathname === '/api/prayers') return json(db.listPrayers()); // god's dashboard view
  if (url.pathname === '/api/creations') return json(db.listCreations()); // the gallery: everything Kin have made
  if (url.pathname === '/api/digest') return json(buildDigest(db, cfg.day.lengthTicks)); // the story so far, day by day
  if (url.pathname === '/api/wiki') return json(buildWiki(db)); // the Simura Wiki: history as the Kin themselves tell it
  if (url.pathname === '/api/wants') { // every "I wish / we need" ever voiced — the ambient petition inbox
    const names = new Map(db.listKin().map((k) => [k.id, k.name]));
    const wants = (db.db.prepare(
      `SELECT tick, kin_id, utterance FROM wants_log ORDER BY id DESC LIMIT 25`).all() as unknown as
      { tick: number; kin_id: string; utterance: string }[])
      .map((w) => ({ tick: w.tick, kin: names.get(w.kin_id) ?? '?', utterance: w.utterance }));
    return json(wants);
  }
  if (url.pathname === '/api/affection') { // the relationship panel — who is drifting toward whom
    const names = new Map(db.listKin().map((k) => [k.id, k.name]));
    return json(db.listAffection().map((a) => ({
      a: names.get(a.kinA) ?? a.kinA, b: names.get(a.kinB) ?? a.kinB, score: Math.round(a.score * 10) / 10,
    })));
  }
  if (url.pathname === '/api/events') {
    const since = Number(url.searchParams.get('since') ?? 0);
    return json(db.eventsSince(since));
  }
  if (url.pathname === '/api/chronicle') { // the world's history: every historic event + every writing
    const names = new Map(db.listKin().map((k) => [k.id, k.name]));
    const historic = (db.db.prepare(
      `SELECT tick, actor_kin_id actor, verb, detail FROM events WHERE historic=1 ORDER BY id ASC`).all() as unknown as
      { tick: number; actor: string | null; verb: string; detail: string }[])
      .map((e) => ({ tick: e.tick, actor: e.actor ? names.get(e.actor) ?? null : null, verb: e.verb, detail: e.detail }));
    const texts = db.listObjects().filter((o) => o.kind === 'text')
      .map((t) => ({ title: t.name, content: t.textContent, author: t.creatorKinId ? names.get(t.creatorKinId) ?? null : null, tick: t.createdAtTick }));
    const places = db.listPlaces().map((pl) => ({ name: pl.name, pos: pl.pos, namedBy: names.get(pl.namedByKinId) ?? null, tick: pl.tick }));
    return json({ historic, texts, places });
  }
  if (url.pathname === '/api/kin') { // one Kin, in depth — for the detail card
    const kin = db.getKin(url.searchParams.get('id') ?? '');
    if (!kin) { res.writeHead(404); return res.end('no such kin'); }
    const children = db.listKin().filter((k) => k.parentSolId === kin.id || k.parentLuneId === kin.id);
    const objs = db.listObjects();
    const moments = (db.db.prepare(`SELECT detail,historic FROM events WHERE actor_kin_id=? OR target_id=? ORDER BY id DESC LIMIT 24`)
      .all(kin.id, kin.id) as unknown as { detail: string; historic: number }[]).reverse();
    return json({
      kin: toPublicKin(kin, presentKin(db, cfg, kin, db.getTick())),
      parents: {
        sol: kin.parentSolId ? db.getKin(kin.parentSolId)?.name ?? null : null,
        lune: kin.parentLuneId ? db.getKin(kin.parentLuneId)?.name ?? null : null,
      },
      children: children.map((c) => ({ name: c.name, status: c.status })),
      partner: kin.coupleId ? db.listKin().find((k) => k.id !== kin.id && k.coupleId === kin.coupleId)?.name ?? null : null,
      skills: db.listSkillfiles(kin.id).map((s) => ({ name: s.name, version: s.version, refined: s.refinedCount })),
      // what they carry right now, and everything they've ever made
      carrying: objs.filter((o) => o.carriedBy === kin.id).map((o) => ({ name: o.name, worn: o.worn })),
      containers: objs.filter((o) => o.carriedBy === kin.id && /\b(bag|basket|pouch|sack|satchel|pack|box|chest|crate|barrel|jar|shelf|bin)\b/i.test(o.name))
        .map((c) => ({ name: c.name, holds: objs.filter((inner) => inner.storedIn === c.id).map((inner) => inner.name) })),
      made: objs.filter((o) => o.creatorKinId === kin.id && (o.kind === 'crafted' || o.kind === 'structure' || o.kind === 'text'))
        .map((o) => ({ name: o.name, kind: o.kind })),
      recentMemories: db.recentMemories(kin.id, 8).map((m) => ({ tick: m.tick, kind: m.kind, content: m.content })),
      lifeMoments: moments.map((moment) => ({ detail: moment.detail, historic: !!moment.historic })),
    });
  }
  if (url.pathname === '/api/progress') { // god's era-progress dashboard
    const cfgE = cfg.eras;
    return json({
      era: db.currentEra(),
      eras: db.listEras(),
      thresholds: {
        making: { namedThings: db.namedThingCount(), needed: cfgE.making.namedThings, wants: db.wantCount() },
        building: { crafted: db.countObjectsOfKind('crafted'), needed: cfgE.building.craftedObjects, maxRefined: db.maxSkillfileRefinedCount(), refinedNeeded: cfgE.building.skillfileRefinedCount },
        letters: { teaches: db.successfulTeachCount(), needed: cfgE.letters.successfulTeaches },
        hearth: { texts: db.countObjectsOfKind('text'), textsNeeded: cfgE.hearth.writtenTexts, structures: db.listObjects().filter(isFunctionalStructure).length, structuresNeeded: cfgE.hearth.structures },
      },
      bonds: db.bondCount(),
      population: { alive: db.listKin(true).length, total: db.listKin().length },
    });
  }
  // static (path-traversal safe: normalize then verify prefix)
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = normalize(join(webRoot, rel));
  if (file.startsWith(webRoot) && existsSync(file)) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'snapshot', snapshot: { ...sim.snapshot(), tickMs } })));

// --- The heartbeat: one world tick per interval (god can retune the pace live) ---
// Self-pacing loop: when the model provider rate-limits the whole tick, we BACK
// OFF (exponentially, up to 2 min) instead of hammering a throttled API — the
// world pauses gracefully and resumes the instant the provider recovers.
let ticking = false;
let lastTickAt = Date.now();
let lastHeraldedEventId = db.recentEvents(1)[0]?.id ?? 0; // never re-announce old history on restart
let heartbeatTimer: NodeJS.Timeout | null = null;
let rateLimitBackoffMs = 0;
const MAX_BACKOFF_MS = 120_000;

async function heartbeat(): Promise<void> {
  if (ticking) return; // never overlap ticks
  ticking = true;
  try {
    const { tick, events, eraUnlocked } = await sim.tickWorld();
    lastTickAt = Date.now();

    // detect a rate-limited tick: every awake mind stumbled on a rate limit
    const stumbles = events.filter((e) => e.verb === 'stumble');
    const rateLimited = stumbles.filter((e) => /rate limit|429|quota|too many requests/i.test(e.detail));
    const acted = events.some((e) => e.actorKinId && e.verb !== 'stumble');
    if (rateLimited.length > 0 && !acted) {
      rateLimitBackoffMs = Math.min(rateLimitBackoffMs ? rateLimitBackoffMs * 2 : 15_000, MAX_BACKOFF_MS);
      console.warn(`[rate-limit] provider throttled — backing off ${Math.round(rateLimitBackoffMs / 1000)}s before the next tick`);
    } else if (rateLimitBackoffMs > 0 && acted) {
      console.log('[rate-limit] provider recovered — resuming normal pace');
      rateLimitBackoffMs = 0;
    }

    broadcast({ type: 'tick', snapshot: { ...sim.snapshot(), tickMs } });
    const historic = events.filter((e) => e.historic);
    for (const h of historic) console.log(`[HISTORIC t${tick}] ${h.detail}`);
    if (eraUnlocked !== null) console.log(`[ERA] Era ${eraUnlocked} unlocked at tick ${tick}`);
    // the herald carries notable events to Discord — but ONLY for the real world.
    const fresh = db.eventsSince(lastHeraldedEventId);
    if (fresh.length) {
      lastHeraldedEventId = fresh[fresh.length - 1]!.id;
      if (env.llmMode() === 'real') {
        void heraldToDiscord(fresh, db.currentEra(), (id) => (id ? db.getKin(id)?.name ?? null : null));
      }
    }
  } catch (err) {
    console.error('[tick error]', err);
  } finally {
    ticking = false;
  }
}
// self-scheduling loop so the delay can grow under rate-limit backoff.
// A generation token ensures only ONE loop survives when god retunes the pace.
let heartbeatGen = 0;
function scheduleHeartbeat(): void {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  const gen = ++heartbeatGen;
  const next = (): void => {
    if (gen !== heartbeatGen) return; // a newer schedule superseded this loop
    heartbeatTimer = setTimeout(() => {
      void heartbeat().finally(next);
    }, tickMs + rateLimitBackoffMs);
  };
  next();
}

// a dying process tells god before it goes; the supervisor script restarts it
process.on('uncaughtException', (err) => {
  console.error('[fatal]', err);
  void sendAlert('💀 The World Server Crashed', `\`${String(err).slice(0, 300)}\` — the supervisor will restart it.`, 0xcc3344)
    .finally(() => process.exit(1));
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal rejection]', err);
});

const port = env.port();
server.listen(port, () => {
  console.log(`SIMURA world server — http://localhost:${port} (mode: ${env.llmMode()}, tick: ${tickMs}ms)`);
  console.log(`Tick ${db.getTick()}, Era ${db.currentEra()}, ${db.listKin(true).length} Kin awake.`);
  void heartbeat();
  scheduleHeartbeat();

  // hourly online backups via node:sqlite's native backup API — keep the last 24
  if (env.dbPath() !== ':memory:') {
    const backupDir = join(env.projectRoot, 'data', 'backups');
    mkdirSync(backupDir, { recursive: true });
    const doBackup = async () => {
      try {
        const name = `simura-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
        await backup(db.db, join(backupDir, name));
        const old = readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort();
        while (old.length > 24) unlinkSync(join(backupDir, old.shift()!));
        console.log('[backup]', name);
      } catch (err) {
        console.error('[backup]', err instanceof Error ? err.message.slice(0, 120) : err);
      }
    };
    void doBackup();
    setInterval(() => void doBackup(), 60 * 60 * 1000);
  }

  // behavioral watchdog: a mind stuck in a loop pings god instead of waiting to be noticed
  const rutAlerted = new Map<string, number>();
  setInterval(() => {
    for (const s of sim.stats()) {
      if (s.ticksLived < 60 || s.repetitionScore < 0.8) continue;
      const last = rutAlerted.get(s.kinId) ?? 0;
      if (Date.now() - last < 30 * 60 * 1000) continue; // don't nag
      rutAlerted.set(s.kinId, Date.now());
      const name = db.getKin(s.kinId)?.name ?? s.kinId.slice(0, 6);
      console.warn(`[watchdog] ${name} repetition ${(s.repetitionScore * 100).toFixed(0)}%`);
      void sendAlert('⚠️ A Mind May Be Stuck',
        `**${name}** has repeated the same kind of act for a while (repetition ${(s.repetitionScore * 100).toFixed(0)}%). Worth a look at the feed.`);
    }
  }, 5 * 60 * 1000);
});
