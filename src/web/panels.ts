/** Side-panel tabs beyond the feed: Family (lineage tree) and God (instrumentation). */
import type { BuildDesignSpec, PublicKinSnapshot, ShapePart, WorldObject, WorldSnapshot } from '../shared/types.ts';
import { fallbackShape, shapeThumbnail } from './scene.ts';
import { creationKindPhrase, eventMark, humanEventDetail, kinLifePhrase, skillPracticePhrase } from './presentation.ts';
import { objectSurface } from './render/world-things.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

// --- Family tree ------------------------------------------------------------

function renderFamily(el: HTMLElement, snap: WorldSnapshot): void {
  const kin = snap.kin;
  const roots = kin.filter((k) => !k.parentSolId && !k.parentLuneId);
  const childrenOf = (id: string) => kin.filter((k) => k.parentSolId === id || k.parentLuneId === id);
  const seen = new Set<string>();

  const node = (k: PublicKinSnapshot): string => {
    if (seen.has(k.id)) return '';
    seen.add(k.id);
    const partner = k.coupleId ? kin.find((o) => o.id !== k.id && o.coupleId === k.coupleId) : null;
    const kids = childrenOf(k.id).filter((c) => !seen.has(c.id));
    const dead = k.status === 'dead' ? ' dead' : k.status === 'fading' ? ' fading' : '';
    const bond = partner ? ` <span class="bond">❤ ${esc(partner.name)}</span>` : '';
    return `<div class="tree-node${dead}">
      <span class="tname ${k.gender}">${esc(k.name)}</span>
      <span class="tmeta">${kinLifePhrase(k)}</span>${bond}
      ${kids.length ? `<div class="tree-kids">${kids.map(node).join('')}</div>` : ''}
    </div>`;
  };

  el.innerHTML = `
    <div class="panel-title">Lineage of the Kin</div>
    ${roots.map(node).join('')}
    ${kin.length <= 2 ? '<div class="tmeta" style="margin-top:8px">No children yet. Lives must grow together first.</div>' : ''}`;
}

// --- God dashboard -----------------------------------------------------------

interface Progress {
  era: number;
  thresholds: {
    making: { namedThings: number; needed: number; wants: number };
    building: { crafted: number; needed: number; maxRefined: number; refinedNeeded: number };
    letters: { teaches: number; needed: number };
    hearth: { texts: number; textsNeeded: number; structures: number; structuresNeeded: number };
  };
  bonds: number;
  population: { alive: number; total: number };
}
interface KinStatsRow {
  kinId: string; ticksLived: number; tokensIn: number; tokensOut: number;
  verbCounts: Record<string, number>; repetitionScore: number; skillfileCount: number; memoryCount: number;
}
interface PrayerRow { id: number; tick: number; kinId: string; plea: string; answered: boolean; answer: string | null }
interface AffectionRow { a: string; b: string; score: number }

interface Pace {
  tickMs: number;
  flags?: { chat?: boolean };
  eras: {
    making: { namedThings: number; requiresWant: boolean };
    building: { craftedObjects: number; skillfileRefinedCount: number };
    letters: { successfulTeaches: number };
    hearth: { writtenTexts: number; structures: number };
  };
}

export async function renderGod(el: HTMLElement, snap: WorldSnapshot): Promise<void> {
  // don't clobber forms while god is mid-edit (pace inputs, prayer answers)
  if (el.querySelector('.pace-form:focus-within') || el.querySelector('.answer-row input:focus')) return;
  const [progress, stats, prayers, affection, pace] = await Promise.all([
    fetch('/api/progress').then((r) => r.json() as Promise<Progress>),
    fetch('/api/stats').then((r) => r.json() as Promise<KinStatsRow[]>),
    fetch('/api/prayers').then((r) => r.json() as Promise<PrayerRow[]>),
    fetch('/api/affection').then((r) => r.json() as Promise<AffectionRow[]>),
    fetch('/api/god/pace').then((r) => r.json() as Promise<Pace>),
  ]);
  const nameOf = new Map(snap.kin.map((k) => [k.id, k.name]));
  const bar = (v: number, max: number) => {
    const pct = Math.min(100, Math.round((v / Math.max(1, max)) * 100));
    return `<div class="bar"><div class="bar-fill" style="width:${pct}%"></div><span>${v}/${max}</span></div>`;
  };
  const t = progress.thresholds;
  const health = snap.presentation.worldHealth;

  // slider stops: seconds per tick, slow → fast
  const STOPS = [60, 30, 15, 8, 4];
  const STOP_LABELS = ['Slowest', 'Slow', 'Normal', 'Fast', 'Fastest'];
  const currentSec = Math.round(pace.tickMs / 1000);
  let sliderIdx = STOPS.reduce((best, s, i) =>
    Math.abs(s - currentSec) < Math.abs(STOPS[best]! - currentSec) ? i : best, 0);

  el.innerHTML = `
    <div class="panel-title">Pace of the world</div>
    <div class="pace-form">
      <div class="pace-slider-row">
        <span class="tmeta">slower</span>
        <input id="pace-slider" type="range" min="0" max="${STOPS.length - 1}" step="1" value="${sliderIdx}">
        <span class="tmeta">faster</span>
      </div>
      <div id="pace-label" class="pace-label">${STOP_LABELS[sliderIdx]} — one thought every ${STOPS[sliderIdx]}s <span id="pace-status" class="tmeta"></span></div>
      <button id="bring-dawn" class="god-btn" title="shift the sky so dawn breaks now — sleepers wake, the dark lifts">☀ Bring the dawn</button>
      <button id="expand-land" class="god-btn" title="push the edge of the world outward: +16 in each direction, seeded with fresh unnamed wilderness">🌍 Expand the land</button>
      <details class="pace-advanced">
        <summary class="tmeta">advanced: era thresholds</summary>
        <div class="god-row"><label>1 · naming needed</label><input id="pace-named" type="number" min="1" value="${pace.eras.making.namedThings}"></div>
        <div class="god-row"><label>2 · crafts needed</label><input id="pace-crafted" type="number" min="1" value="${pace.eras.building.craftedObjects}"></div>
        <div class="god-row"><label>2 · refines needed</label><input id="pace-refined" type="number" min="1" value="${pace.eras.building.skillfileRefinedCount}"></div>
        <div class="god-row"><label>3 · teaches needed</label><input id="pace-teaches" type="number" min="1" value="${pace.eras.letters.successfulTeaches}"></div>
        <div class="god-row"><label>4 · writings needed</label><input id="pace-texts" type="number" min="1" value="${pace.eras.hearth.writtenTexts}"></div>
        <div class="god-row"><label>4 · structures needed</label><input id="pace-structs" type="number" min="1" value="${pace.eras.hearth.structures}"></div>
        <button id="pace-apply" class="god-btn">Apply thresholds</button>
      </details>
    </div>

    <div class="panel-title">World health</div>
    ${health ? `<div class="world-health">
      <div><span aria-hidden="true">◉</span><b>${esc(health.populationPhrase)}</b></div>
      <div><span aria-hidden="true">◌</span>${esc(health.foodPhrase)}</div>
      <div><span aria-hidden="true">△</span>${esc(health.predatorPhrase)}</div>
      <div><span aria-hidden="true">⌁</span>${esc(health.calamityPhrase)}</div>
      <div><span aria-hidden="true">✦</span>${esc(health.eraPhrase)}</div>
    </div>` : '<div class="tmeta">The world is still gathering its measure.</div>'}

    <div class="panel-title">Era progress — currently Era ${progress.era}</div>
    <div class="god-row"><label>1 · named things</label>${bar(t.making.namedThings, t.making.needed)}</div>
    <div class="god-row"><label>1 · wants voiced</label>${bar(Math.min(1, t.making.wants), 1)}</div>
    <div class="god-row"><label>2 · crafted</label>${bar(t.building.crafted, t.building.needed)}</div>
    <div class="god-row"><label>2 · skill refined</label>${bar(t.building.maxRefined, t.building.refinedNeeded)}</div>
    <div class="god-row"><label>3 · teachings</label>${bar(t.letters.teaches, t.letters.needed)}</div>
    <div class="god-row"><label>4 · writings</label>${bar(t.hearth.texts, t.hearth.textsNeeded)}</div>
    <div class="god-row"><label>4 · structures</label>${bar(t.hearth.structures, t.hearth.structuresNeeded)}</div>

    <div class="panel-title">Minds</div>
    ${stats.map((s) => {
      const name = nameOf.get(s.kinId) ?? s.kinId.slice(0, 6);
      const topVerbs = Object.entries(s.verbCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([v, n]) => `${v}:${n}`).join(' ');
      return `<div class="god-kin">
        <b>${esc(name)}</b> · ${s.memoryCount} memories · ${s.skillfileCount} skills · rut ${(s.repetitionScore * 100).toFixed(0)}%
        <div class="tmeta">${s.tokensIn.toLocaleString()} in / ${s.tokensOut.toLocaleString()} out tokens · ${esc(topVerbs)}</div>
      </div>`;
    }).join('')}

    <div class="panel-title">Hearts (${progress.bonds} bond${progress.bonds === 1 ? '' : 's'})</div>
    ${affection.length === 0 ? '<div class="tmeta">No lives have touched yet.</div>'
      : affection.slice(0, 12).map((a) =>
        `<div class="god-row"><label>${esc(a.a)} ↔ ${esc(a.b)}</label><span class="score">${a.score}</span></div>`).join('')}

    <div class="panel-title">Wants voiced (their wishes, verbatim)</div>
    <div id="wants-box" class="tmeta">…</div>

    <div class="panel-title">Prayers heard (${prayers.length})</div>
    ${prayers.length === 0 ? '<div class="tmeta">The silence is unbroken. They have not needed you.</div>'
      : prayers.slice(0, 10).map((p) => `
        <div class="prayer-row">t${p.tick} <b>${esc(nameOf.get(p.kinId) ?? '?')}</b>: “${esc(p.plea)}”
          ${p.answered
            ? `<div class="tmeta">↳ answered: “${esc(p.answer ?? '')}”</div>`
            : `<div class="answer-row"><input data-prayer="${p.id}" placeholder="answer from the silence… (or leave unanswered)"><button class="god-btn answer-btn" data-prayer="${p.id}">Answer</button></div>`}
        </div>`).join('')}

    <div class="panel-title">First contact</div>
    <div class="tmeta">${pace.flags?.chat
      ? 'The way between worlds is OPEN — visitors can speak to Kin from their detail cards.'
      : 'The world is untouched. Opening this lets humans speak to Kin — a historic, irreversible moment.'}</div>
    <button id="contact-toggle" class="god-btn">${pace.flags?.chat ? 'Close the way' : 'Open first contact'}</button>

    <div class="panel-title">The Net (Era 16)</div>
    <div class="tmeta">${(pace.flags as { net?: boolean })?.net
      ? 'The way beyond is OPEN — Kin at a powered signal-device can ask questions of the outside world (read-only, allowlisted, fenced).'
      : 'The one door only god opens. Kin can climb every era, but the beyond stays sealed until you choose. Opening it the first time IS the dawn of Era 16.'}</div>
    <button id="net-toggle" class="god-btn">${(pace.flags as { net?: boolean })?.net ? 'Seal the way beyond' : 'Open The Net'}</button>

    <div class="panel-title">Model adoption</div>
    <div class="tmeta">Gift a born Kin (never a founder) a mind of its own. The key is probed live before the ceremony; parents check the gift daily — if it fades, the child returns to the family's light.</div>
    <div id="adoption-list" class="tmeta" style="margin:6px 0"></div>
    <input id="adopt-kin" placeholder="Kin name">
    <input id="adopt-endpoint" placeholder="endpoint (https://…/v1)">
    <input id="adopt-model" placeholder="model name">
    <input id="adopt-key" placeholder="API key" type="password">
    <input id="adopt-donor" placeholder="donor's name">
    <button id="adopt-btn" class="god-btn">Perform the ceremony</button>
    <button id="adopt-revoke" class="god-btn">Revoke a gift</button>`;

  void fetch('/api/wants').then((r) => r.json() as Promise<{ tick: number; kin: string; utterance: string }[]>)
    .then((wants) => {
      const box = el.querySelector('#wants-box');
      if (!box) return;
      box.innerHTML = wants.length === 0 ? 'No wishes voiced yet.'
        : wants.slice(0, 10).map((w) => `<div class="chron-row" style="color:var(--text)">t${w.tick} <b>${esc(w.kin)}</b>: “${esc(w.utterance)}”</div>`).join('');
    });

  const num = (id: string): number => Number((el.querySelector(`#${id}`) as HTMLInputElement).value);
  const status = () => el.querySelector('#pace-status') as HTMLElement;
  const godHeaders = (): Record<string, string> => {
    const t = localStorage.getItem('godToken');
    return t ? { 'x-god-token': t } : {};
  };
  const post = async (payload: unknown): Promise<boolean> => {
    let res = await fetch('/api/god/pace', {
      method: 'POST', headers: { 'content-type': 'application/json', ...godHeaders() }, body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      const t = prompt('This world is guarded. Enter the god token:');
      if (t) {
        localStorage.setItem('godToken', t);
        res = await fetch('/api/god/pace', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-god-token': t }, body: JSON.stringify(payload),
        });
      }
    }
    status().textContent = res.ok ? ' ✓ the world shifted' : ' something resisted';
    setTimeout(() => { if (status()) status().textContent = ''; }, 2500);
    return res.ok;
  };

  // slider applies instantly on release — slide it, the world speeds up or slows down
  const slider = el.querySelector('#pace-slider') as HTMLInputElement;
  const label = el.querySelector('#pace-label') as HTMLElement;
  slider.addEventListener('input', () => {
    const i = Number(slider.value);
    label.firstChild!.textContent = `${STOP_LABELS[i]} — one thought every ${STOPS[i]}s`;
  });
  slider.addEventListener('change', () => {
    void post({ tickMs: STOPS[Number(slider.value)]! * 1000 });
  });

  el.querySelector('#bring-dawn')?.addEventListener('click', () => {
    void post({ bringDawn: true });
  });
  el.querySelector('#expand-land')?.addEventListener('click', () => {
    void post({ expandLand: true });
  });
  el.querySelector('#contact-toggle')?.addEventListener('click', () => {
    void post({ flags: { chat: !pace.flags?.chat } });
  });
  el.querySelector('#net-toggle')?.addEventListener('click', () => {
    const netOpen = (pace.flags as { net?: boolean })?.net ?? false;
    if (!netOpen && !confirm('Open The Net? This dawns Era 16 — a historic, deliberate act. Kin at powered signal-devices will be able to read from the outside world.')) return;
    void post({ flags: { net: !netOpen } });
  });

  // model adoption: list active gifts; perform / revoke ceremonies
  void fetch('/api/god/adopt').then((r) => r.json() as Promise<{ kin: string; donor: string; model: string }[]>)
    .then((list) => {
      const box = el.querySelector('#adoption-list');
      if (box) box.innerHTML = list.length === 0 ? 'No gifted minds are carried right now.'
        : list.map((a) => `<div>✦ <b>${esc(a.kin)}</b> thinks with ${esc(a.model)} — gift of ${esc(a.donor)}</div>`).join('');
    });
  const val = (id: string): string => el.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? '';
  el.querySelector('#adopt-btn')?.addEventListener('click', async () => {
    const payload = { kinId: val('adopt-kin'), endpoint: val('adopt-endpoint'), model: val('adopt-model'), apiKey: val('adopt-key'), donor: val('adopt-donor') };
    if (!payload.kinId || !payload.endpoint || !payload.model || !payload.apiKey) { alert('Kin, endpoint, model, and key are all required.'); return; }
    const r = await fetch('/api/god/adopt', { method: 'POST', headers: { 'content-type': 'application/json', ...godHeaders() }, body: JSON.stringify(payload) });
    alert(r.ok ? 'The ceremony is complete — the child thinks with its own mind now.' : `Refused: ${await r.text()}`);
  });
  el.querySelector('#adopt-revoke')?.addEventListener('click', async () => {
    const kinId = val('adopt-kin');
    if (!kinId || !confirm(`Withdraw the gifted mind from ${kinId}? They return to their family's light.`)) return;
    const r = await fetch('/api/god/adopt', { method: 'POST', headers: { 'content-type': 'application/json', ...godHeaders() }, body: JSON.stringify({ kinId, revoke: true }) });
    alert(r.ok ? 'The gift was withdrawn.' : `Refused: ${await r.text()}`);
  });
  for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>('.answer-btn'))) {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.prayer);
      const input = el.querySelector<HTMLInputElement>(`input[data-prayer="${id}"]`);
      const answer = input?.value.trim();
      if (!answer) return;
      const t = localStorage.getItem('godToken');
      await fetch('/api/god/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(t ? { 'x-god-token': t } : {}) },
        body: JSON.stringify({ prayerId: id, answer }),
      });
      btn.textContent = '✓';
    });
  }

  el.querySelector('#pace-apply')?.addEventListener('click', () => {
    void post({
      eras: {
        making: { namedThings: num('pace-named'), requiresWant: pace.eras.making.requiresWant },
        building: { craftedObjects: num('pace-crafted'), skillfileRefinedCount: num('pace-refined') },
        letters: { successfulTeaches: num('pace-teaches') },
        hearth: { writtenTexts: num('pace-texts'), structures: num('pace-structs') },
      },
    });
  });
}

// --- Chronicle: the world's history as it writes itself -----------------------

interface Chronicle {
  historic: { tick: number; actor: string | null; verb: string; detail: string }[];
  texts: { title: string; content: string | null; author: string | null; tick: number }[];
  places: { name: string; pos: { x: number; y: number }; namedBy: string | null; tick: number }[];
}

interface DayDigest { day: number; headline: string; historic: string[]; numbers: string }

/** WORLD ▸ Story — the day-by-day digest, the world's story so far */
async function renderStory(el: HTMLElement): Promise<void> {
  const digest = await fetch('/api/digest').then((r) => r.json() as Promise<DayDigest[]>).catch(() => [] as DayDigest[]);
  el.innerHTML = `
    <div class="panel-title">The story so far</div>
    ${digest.length === 0 ? '<div class="tmeta">The first day is still being lived.</div>'
      : digest.map((d) => `<details class="text-entry"${d.day === digest[0]!.day ? ' open' : ''}>
          <summary><b>Day ${d.day}</b> — ${esc(d.headline)}</summary>
          <div class="text-body">${d.historic.map((h) => `★ ${esc(h)}`).join('<br>')}${d.historic.length ? '<br>' : ''}${esc(d.numbers)}</div>
        </details>`).join('')}`;
}

async function renderChronicle(el: HTMLElement): Promise<void> {
  const c = await fetch('/api/chronicle').then((r) => r.json() as Promise<Chronicle>);
  el.innerHTML = `
    <div class="panel-title">Historic moments (${c.historic.length})</div>
    ${c.historic.map((h) => { const mark = eventMark(h.verb); return `<div class="chron-row" aria-label="${esc(mark.label)}"><span title="${esc(mark.label)}">${mark.icon}</span> ${h.actor ? `<b>${esc(h.actor)}</b> ` : ''}${esc(humanEventDetail(h.detail))}</div>`; }).join('')}
    <div class="panel-title">Named places (${c.places.length})</div>
    ${c.places.length === 0 ? '<div class="tmeta">The land is still nameless.</div>'
      : c.places.map((p) => `<div class="tmeta">“${esc(p.name)}” — named by ${esc(p.namedBy ?? 'someone now forgotten')}</div>`).join('')}
    <div class="panel-title">Writings (${c.texts.length})</div>
    ${c.texts.length === 0 ? '<div class="tmeta">Nothing has been written yet. The Letters must dawn first.</div>'
      : c.texts.map((t) => `<details class="text-entry"><summary>“${esc(t.title)}” — ${esc(t.author ?? 'author unknown')}</summary><div class="text-body">${esc(t.content ?? '(faded)')}</div></details>`).join('')}`;
}

// --- Creations: the gallery of everything Kin have made ------------------------

interface Creation {
  id: string; kind: string; name: string; description: string; tick: number;
  maker: string | null; makerGender: string | null; makerStatus: string | null; shape: ShapePart[] | null;
  emitsLight: boolean; worn: boolean; carried: boolean; text: string | null;
  designSpec: BuildDesignSpec | null;
}

function constructionPhrase(spec: BuildDesignSpec | null): string {
  if (!spec) return '';
  const form = spec.archetype === 'longhouse' ? 'long house' : spec.archetype;
  const matter = spec.material === 'wood' ? 'timber' : spec.material === 'thatch' ? 'reed and timber' : spec.material;
  if (!spec.complete) {
    const moments = ['ground newly marked', 'foundations taking hold', 'frame standing', 'walls gathering', 'roof nearly whole'];
    return `${spec.size} ${matter} ${form} · ${moments[Math.min(spec.stage, moments.length - 1)]}`;
  }
  if (spec.addition && !spec.addition.complete) return `${spec.size} ${matter} ${form} · a new ${spec.addition.kind} is rising`;
  return `${spec.size} ${matter} ${form} · complete`;
}

const thumbCache = new Map<string, string>();

/** WORLD ▸ Creations — the 3D gallery of everything Kin have built, crafted, written */
async function renderCreations(el: HTMLElement): Promise<void> {
  const items = await fetch('/api/creations').then((r) => r.json() as Promise<Creation[]>);
  if (items.length === 0) {
    el.innerHTML = '<div class="tmeta">Nothing has been made yet. When a Kin shapes something with its hands, it appears here.</div>';
    return;
  }
  const designed = items.filter((c) => c.shape && c.shape.length).length;
  el.innerHTML = `
    <div class="panel-title">Creations (${items.length} made · ${designed} own designs)</div>
    <div class="creation-grid">
      ${items.map((c) => {
        let thumb = '';
        const designedShape = c.shape && c.shape.length ? c.shape : null;
        const renderShape = designedShape
          ?? (c.kind === 'crafted' || c.kind === 'structure' ? fallbackShape(c.name, c.kind) : null);
        if (renderShape) {
          let url = thumbCache.get(c.id);
          if (!url) { url = shapeThumbnail(renderShape, c.emitsLight); thumbCache.set(c.id, url); }
          thumb = `<img class="creation-thumb" src="${url}" alt="">${designedShape ? '' : '<div class="tmeta" style="font-size:10px;margin-top:2px">rough form — no design given</div>'}`;
        } else {
          thumb = `<div class="creation-thumb creation-noshape">✍</div>`;
        }
        const makerCls = c.makerGender === 'sol' ? 'sol' : c.makerGender === 'lune' ? 'lune' : '';
        const surface = objectSurface(c.name, c.description);
        const mark = surface === 'coin' ? ' ◈' : surface === 'cooked' ? ' ◌' : surface === 'gem' ? ' ◆'
          : surface === 'gold' || surface === 'iron' || surface === 'copper' ? ' ◇' : '';
        const heirloom = c.makerStatus === 'dead' && c.maker ? `an heirloom of ${c.maker}, who is gone` : '';
        return `<div class="creation-card">
          ${thumb}
          <div class="creation-name">${esc(c.name)}${mark}${c.emitsLight ? ' ✸' : ''}${c.worn ? ' · worn' : ''}${c.carried ? ' · in hand' : ''}</div>
          <div class="creation-meta"><span class="${makerCls}">${esc(c.maker ?? 'maker unknown')}</span> · ${creationKindPhrase(c.kind)}</div>
          ${heirloom ? `<div class="tmeta">🕯 ${esc(heirloom)}</div>` : ''}
          ${c.designSpec ? `<div class="tmeta">${esc(constructionPhrase(c.designSpec))}</div>` : ''}
          ${c.text ? `<details class="creation-text"><summary>read</summary><div class="text-body">${esc(c.text)}</div></details>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function renderPeople(el: HTMLElement, snap: WorldSnapshot, onFocusKin: (kinId: string) => void): void {
  const groups = new Map<string, PublicKinSnapshot[]>();
  for (const kin of snap.kin) {
    const line = kin.presentation.lineage;
    groups.set(line, [...(groups.get(line) ?? []), kin]);
  }
  el.innerHTML = `<div class="panel-title">The people</div><div class="tmeta">Lives gathered by family line; each name opens a path back to the world.</div>
    ${[...groups.entries()].map(([line, kin]) => `<section><div class="panel-title">${esc(line)}’s line</div>${kin.map((person) => `
      <button class="person-row" data-person="${person.id}" aria-label="Follow ${esc(person.name)}">
        <span class="tname ${person.gender}">${esc(person.name)}</span>
        <span><b>${esc(person.presentation.conditionLine)}</b><small>${esc(person.presentation.identityLine)} · ${esc(person.presentation.lifePhrase)}</small></span>
        <span>${person.presentation.flags.bonded ? '❤' : ''}${person.presentation.flags.carryingStar ? ' ✦' : ''}${person.presentation.founder ? ' ◉' : ''}${person.presentation.adopted ? ' ◇' : ''}</span>
      </button>`).join('')}</section>`).join('')}`;
  for (const button of Array.from(el.querySelectorAll<HTMLButtonElement>('[data-person]'))) button.addEventListener('click', () => onFocusKin(button.dataset.person!));
}

function renderWildlife(el: HTMLElement, snap: WorldSnapshot, onCreature: (object: WorldObject) => void): void {
  const creatures = snap.objects.filter((object) => object.creature).sort((a, b) => Number(b.kind === 'predator') - Number(a.kind === 'predator') || a.name.localeCompare(b.name));
  el.innerHTML = `<div class="panel-title">Wildlife in the known world</div>
    <div class="tmeta">Only living creatures now present are shown. Open one to see what the Kin have truly learned.</div>
    ${creatures.length === 0 ? '<div class="detail-mem">The land is quiet. No creatures have appeared yet.</div>' : creatures.map((object, index) => {
      const view = object.creature!; const mark = object.kind === 'predator' ? '▲' : view.kept ? '▣' : view.young ? '·' : '●';
      return `<button class="person-row" data-creature="${index}" aria-label="Open ${esc(view.species)}: ${esc(view.activityPhrase)}">
        <span aria-hidden="true">${mark}</span><span><b>${esc(view.species)}</b><small>${esc(view.activityPhrase)}${view.young ? ' · young' : ''}${view.kept ? ' · kept close' : ''}</small></span><span>${view.lore ? '◉' : '○'}</span>
      </button>`;
    }).join('')}`;
  for (const button of Array.from(el.querySelectorAll<HTMLButtonElement>('[data-creature]'))) {
    const object = creatures[Number(button.dataset.creature)]; if (object) button.addEventListener('click', () => onCreature(object));
  }
}

function renderEconomy(el: HTMLElement, snap: WorldSnapshot): void {
  const economy = snap.presentation.economy;
  if (!economy) {
    el.innerHTML = '<div class="tmeta">Exchange has not yet taken a shape the world can recount.</div>';
    return;
  }
  const active = economy.holders.filter((holder) => holder.amount > 0);
  el.innerHTML = `
    <div class="panel-title">Things of lasting value</div>
    <div class="economy-total"><span aria-hidden="true">◈</span><b>${esc(economy.currencyPhrase)}</b></div>
    <div class="tmeta">Only physical coins, precious metals, gems, and exchange pieces in the world are counted—never imagined balances.</div>
    <div class="panel-title">Who keeps them</div>
    ${active.length === 0 ? '<div class="tmeta">No one yet keeps a store that others count as wealth.</div>' : active.map((holder, rank) => `
      <div class="economy-row">
        <span class="economy-rank">${rank + 1}</span>
        <span><b>${esc(holder.name)}</b><small>${esc(holder.standing)}</small></span>
        <span class="economy-count" aria-label="${holder.amount} physical pieces">${holder.amount} ◈</span>
      </div>`).join('')}
    <div class="panel-title">Recent exchanges</div>
    ${economy.recentTrades.length === 0 ? '<div class="tmeta">No remembered trade has changed hands recently.</div>'
      : economy.recentTrades.map((line) => `<div class="text-entry">${esc(humanEventDetail(line))}</div>`).join('')}`;
}

// --- WORLD ▸ Relations — the affection web, drawn as a force-free radial graph ---
async function renderRelations(el: HTMLElement, snap: WorldSnapshot, onFocusKin: (kinId: string) => void): Promise<void> {
  const edges = await fetch('/api/affection').then((r) => r.json() as Promise<{ a: string; b: string; score: number }[]>).catch(() => []);
  const living = snap.kin.filter((k) => k.status !== 'dead');
  el.innerHTML = `<div class="panel-title">Relations (${living.length} living)</div>
    ${living.length < 2 ? '<div class="tmeta">Bonds form when lives touch. Too few here yet.</div>'
      : `<canvas id="relations-canvas" width="360" height="300"></canvas>
         <div class="tmeta" style="margin-top:6px">Line thickness &amp; warmth = affection. ❤ = bonded. Click a name to follow.</div>
         <div id="rel-names"></div>`}`;
  if (living.length < 2) return;
  const cv = el.querySelector<HTMLCanvasElement>('#relations-canvas')!;
  const ctx = cv.getContext('2d')!;
  const cx = cv.width / 2; const cy = cv.height / 2; const R = Math.min(cx, cy) - 42;
  const pos = new Map<string, { x: number; y: number }>();
  living.forEach((k, i) => {
    const a = (i / living.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(k.name, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
  });
  // edges first
  for (const e of edges) {
    const pa = pos.get(e.a); const pb = pos.get(e.b);
    if (!pa || !pb) continue;
    const warmth = Math.max(0, Math.min(1, e.score / 100));
    ctx.strokeStyle = `rgba(${Math.round(120 + warmth * 135)}, ${Math.round(90 + warmth * 40)}, ${Math.round(110 - warmth * 40)}, ${0.25 + warmth * 0.6})`;
    ctx.lineWidth = 1 + warmth * 5;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  // nodes
  for (const k of living) {
    const p = pos.get(k.name)!;
    ctx.fillStyle = k.gender === 'sol' ? '#ffb057' : '#7fb4ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef8'; ctx.font = '500 12px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(k.name + (k.coupleId ? ' ❤' : ''), p.x, p.y - 12);
  }
  const namesBox = el.querySelector('#rel-names')!;
  namesBox.innerHTML = living.map((k) => `<button class="god-btn" style="margin:3px 4px 0 0;padding:3px 9px" data-rel="${k.id}">${esc(k.name)}</button>`).join('');
  for (const b of Array.from(namesBox.querySelectorAll<HTMLButtonElement>('button'))) {
    b.addEventListener('click', () => onFocusKin(b.dataset.rel!));
  }
}

// --- WORLD ▸ Wiki — the Simura Wiki, written by the Kin, cross-linked ---
interface WikiPage { slug: string; title: string; kind: string; subtitle: string; body: string; writtenAtTick: number }
interface WikiData {
  index: { writings: { slug: string; title: string; author: string | null; tick: number }[];
    kin: { slug: string; title: string; alive: boolean }[];
    places: { slug: string; title: string }[] };
  pages: Record<string, WikiPage>;
}
let wikiData: WikiData | null = null;
let wikiOpenSlug: string | null = null;

async function renderWiki(el: HTMLElement): Promise<void> {
  wikiData = await fetch('/api/wiki').then((r) => r.json() as Promise<WikiData>).catch(() => null);
  drawWiki(el);
}
function wikiBody(body: string): string {
  // render [[slug|label]] cross-links as clickable spans
  return esc(body).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (_m, slug: string, label: string) =>
    `<span class="wiki-link" data-goto="${slug}">${label}</span>`).replace(/\n/g, '<br>');
}
function drawWiki(el: HTMLElement): void {
  if (!wikiData) { el.innerHTML = '<div class="tmeta">The wiki is empty. It fills as Kin write, name places, and live histories worth recording.</div>'; return; }
  const d = wikiData;
  const p = wikiOpenSlug ? d.pages[wikiOpenSlug] : undefined;
  if (p) {
    el.innerHTML = `<span class="wiki-back">← back to the wiki</span>
      <div class="wiki-page-title">${esc(p.title)}</div>
      <div class="tmeta">${esc(p.subtitle)}</div>
      <div class="text-body" style="margin-top:10px">${wikiBody(p.body)}</div>`;
    el.querySelector('.wiki-back')!.addEventListener('click', () => { wikiOpenSlug = null; drawWiki(el); });
  } else {
    const link = (slug: string, label: string): string => `<div><span class="wiki-link" data-goto="${slug}">${esc(label)}</span></div>`;
    el.innerHTML = `
      <div class="panel-title">The Simura Wiki</div>
      <div class="tmeta">History as the Kin themselves tell it — every page grows from their own deeds, names, and writings.</div>
      <div class="panel-title">Writings (${d.index.writings.length})</div>
      ${d.index.writings.length === 0 ? '<div class="tmeta">No histories written yet. The Letters (Era 3) must dawn, and a memory-deep Kin must take up the task.</div>'
        : d.index.writings.map((w) => link(w.slug, `“${w.title}” — ${w.author ?? 'author unknown'}`)).join('')}
      <div class="panel-title">The Kin (${d.index.kin.length})</div>
      ${d.index.kin.map((k) => link(k.slug, `${k.title}${k.alive ? '' : ' †'}`)).join('')}
      <div class="panel-title">Places (${d.index.places.length})</div>
      ${d.index.places.length === 0 ? '<div class="tmeta">No named places yet.</div>' : d.index.places.map((p) => link(p.slug, p.title)).join('')}`;
  }
  for (const lk of Array.from(el.querySelectorAll<HTMLElement>('.wiki-link'))) {
    lk.addEventListener('click', () => { wikiOpenSlug = lk.dataset.goto!; drawWiki(el); });
  }
}

// --- WORLD tab dispatcher ---
export async function renderWorld(
  el: HTMLElement, sub: string, snap: WorldSnapshot,
  onFocusKin: (kinId: string) => void, onEyeKin: (kinId: string) => void, onCreature: (object: WorldObject) => void,
): Promise<void> {
  void onEyeKin;
  if (sub === 'story') return renderStory(el);
  if (sub === 'chronicle') return renderChronicle(el);
  if (sub === 'creations') return renderCreations(el);
  if (sub === 'economy') { renderEconomy(el, snap); return; }
  if (sub === 'people') { renderPeople(el, snap, onFocusKin); return; }
  if (sub === 'wildlife') { renderWildlife(el, snap, onCreature); return; }
  if (sub === 'family') { renderFamily(el, snap); return; }
  if (sub === 'relations') return renderRelations(el, snap, onFocusKin);
  if (sub === 'wiki') return renderWiki(el);
}

// --- Kin detail card ----------------------------------------------------------

interface KinDetail {
  kin: PublicKinSnapshot;
  parents: { sol: string | null; lune: string | null };
  children: { name: string; status: string }[];
  partner: string | null;
  skills: { name: string; version: number; refined: number }[];
  carrying: { name: string; worn: boolean }[];
  containers?: { name: string; holds: string[] }[];
  made: { name: string; kind: string }[];
  recentMemories: { tick: number; kind: string; content: string }[];
  lifeMoments: { detail: string; historic: boolean }[];
}

export async function showKinDetail(overlay: HTMLElement, kinId: string): Promise<void> {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const res = await fetch(`/api/kin?id=${encodeURIComponent(kinId)}`);
  if (!res.ok) return;
  const d = await res.json() as KinDetail;
  const k = d.kin;
  overlay.innerHTML = `
    <div class="detail-card">
      <button class="close" aria-label="Close ${esc(k.name)}’s portrait">×</button>
      <div class="kname ${k.gender}" style="font-size:17px">${esc(k.name)} ${d.partner ? `<span class="bond">❤ ${esc(d.partner)}</span>` : ''}</div>
      <div class="detail-condition">${esc(k.presentation.conditionLine)}</div>
      <div class="tmeta">${esc(k.presentation.identityLine)} · ${kinLifePhrase(k)}</div>
      <div class="gentle-bars">
        <span aria-label="spirit: ${esc(k.presentation.moodBand)}"><i style="--v:${k.presentation.mood}"></i></span>
        <span aria-label="body: ${esc(k.presentation.conditionLine)}"><i style="--v:${k.presentation.vitality}"></i></span>
        ${k.presentation.fundedLife === null ? '' : `<span aria-label="${esc(k.presentation.fundedLifePhrase)}"><i style="--v:${k.presentation.fundedLife}"></i></span>`}
      </div>
      ${k.presentation.starPhrase ? `<div class="detail-int">✦ ${esc(k.presentation.starPhrase)}</div>` : ''}
      ${d.parents.sol ? `<div class="tmeta">child of ${esc(d.parents.sol)} &amp; ${esc(d.parents.lune ?? '?')}</div>` : ''}
      ${d.children.length ? `<div class="tmeta">children: ${d.children.map((c) => esc(c.name)).join(', ')}</div>` : ''}
      ${k.intention ? `<div class="detail-int">➤ ${esc(k.intention)}</div>` : ''}
      ${k.plan && k.plan.length ? `<div class="panel-title">Their standing plan</div>${k.plan.map((s, i) => `<div class="tmeta">${i + 1}. ${esc(s)}</div>`).join('')}` : ''}
      <details><summary>Life and character</summary><div class="tmeta">${esc(k.presentation.personality)}.</div><div class="tmeta">${esc(k.presentation.fundedLifePhrase)} · known to ${k.presentation.knownTo === 0 ? 'no one closely yet' : `${k.presentation.knownTo} ${k.presentation.knownTo === 1 ? 'other' : 'others'}`}.</div></details>
      ${d.carrying.length ? `<div class="panel-title">Worn and carried</div>${d.carrying.map((c) => `<div class="tmeta">• ${esc(c.name)} — ${c.worn ? 'worn' : 'in hand'}</div>`).join('')}` : ''}
      <div class="panel-title">Carrying (${d.carrying.length})</div>
      ${d.carrying.length === 0 ? '<div class="tmeta">empty-handed</div>'
        : d.carrying.map((c) => `<div class="tmeta">• ${esc(c.name)}${c.worn ? ' <span style="opacity:.6">(worn)</span>' : ''}</div>`).join('')}
      ${(d.containers ?? []).map((c) => `<div class="tmeta" style="margin-left:10px">↳ ${esc(c.name)} keeps: ${c.holds.length === 0 ? 'nothing yet' : c.holds.map(esc).join(', ')} <span style="opacity:.6">(${c.holds.length}/8)</span></div>`).join('')}
      <div class="panel-title">Made (${d.made.length})</div>
      ${d.made.length === 0 ? '<div class="tmeta">nothing yet</div>'
        : d.made.slice(-12).map((m) => `<div class="tmeta">• ${esc(m.name)} <span style="opacity:.6">(${creationKindPhrase(m.kind)})</span></div>`).join('')}
      <div class="panel-title">Skills (${d.skills.length})</div>
      ${d.skills.length === 0 ? '<div class="tmeta">none yet — everything is still new</div>'
        : d.skills.map((s) => `<div class="tmeta">• ${esc(s.name)} — ${skillPracticePhrase(s.refined)}</div>`).join('')}
      <div class="panel-title">Recent memories</div>
      ${d.recentMemories.slice(-5).map((m) => `<div class="detail-mem">${esc(m.content)}</div>`).join('')}
      <details><summary>Life’s remembered turns</summary>${d.lifeMoments.length ? d.lifeMoments.slice(-12).map((moment) => `<div class="detail-mem">${moment.historic ? '★ ' : ''}${esc(humanEventDetail(moment.detail))}</div>`).join('') : '<div class="tmeta">Their story is only beginning.</div>'}</details>
      <div id="chat-section"></div>
    </div>`;
  overlay.style.display = 'flex';
  const close = overlay.querySelector<HTMLButtonElement>('.close')!;
  close.focus();
  const shut = () => { overlay.style.display = 'none'; document.removeEventListener('keydown', onKey); overlay.removeEventListener('click', onBackdrop); returnFocus?.focus(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') shut(); };
  const onBackdrop = (event: MouseEvent) => { if (event.target === overlay) shut(); };
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', onBackdrop);

  // visitor chat — only if god has opened first contact
  const chatRes = await fetch(`/api/chat?kinId=${encodeURIComponent(kinId)}`).then((r) => r.json() as Promise<{ enabled: boolean; log: { kind: string; tick: number; from: string; text: string }[] }>);
  let chatTimer: ReturnType<typeof setInterval> | null = null;
  if (chatRes.enabled) {
    const section = overlay.querySelector('#chat-section') as HTMLElement;
    section.innerHTML = `
      <div class="panel-title">Speak to ${esc(k.name)}</div>
      <div id="chat-log" class="chat-log"></div>
      <div class="chat-input"><input id="chat-name" placeholder="your name" maxlength="40"><input id="chat-msg" placeholder="say something…" maxlength="500"><button class="god-btn" id="chat-send">Send</button></div>
      <div class="tmeta">They will hear you on their next thought. Whether they answer — and how — is theirs.</div>`;
    const logEl = section.querySelector('#chat-log') as HTMLElement;
    const renderLog = (log: typeof chatRes.log) => {
      logEl.innerHTML = log.map((m) => m.kind === 'visitor'
        ? `<div class="chat-visitor"><b>${esc(m.from)}</b>: ${esc(m.text)}</div>`
        : `<div class="chat-kin"><b>${esc(k.name)}</b>: ${esc(m.text)}</div>`).join('');
      logEl.scrollTop = logEl.scrollHeight;
    };
    renderLog(chatRes.log);
    section.querySelector('#chat-send')!.addEventListener('click', async () => {
      const name = (section.querySelector('#chat-name') as HTMLInputElement).value.trim() || 'a visitor';
      const msgInput = section.querySelector('#chat-msg') as HTMLInputElement;
      const message = msgInput.value.trim();
      if (!message) return;
      await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kinId, fromName: name, message }),
      });
      msgInput.value = '';
    });
    chatTimer = setInterval(async () => {
      if (overlay.style.display === 'none') { if (chatTimer) clearInterval(chatTimer); return; }
      const r = await fetch(`/api/chat?kinId=${encodeURIComponent(kinId)}`).then((x) => x.json() as Promise<typeof chatRes>);
      renderLog(r.log);
    }, 4000);
  }

  overlay.querySelector('.close')!.addEventListener('click', () => {
    overlay.style.display = 'none';
    if (chatTimer) clearInterval(chatTimer);
  });
}

export function showCreatureDetail(overlay: HTMLElement, object: WorldObject): void {
  const view = object.creature; if (!view) return;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.innerHTML = `<div class="detail-card creature-detail">
    <button class="close" aria-label="Close creature portrait">×</button>
    <div class="kname" style="font-size:17px">${esc(view.species)}</div>
    <div class="detail-condition">${esc(view.activityPhrase)}</div>
    <div class="tmeta">${view.young ? 'young · ' : ''}${view.kept ? 'kept close · ' : 'wild · '}${view.family === 'great-cat' ? 'great cat' : view.family === 'small-game' ? 'small game' : esc(view.family)}</div>
    ${view.kept ? '<div class="detail-int">A visible band marks the creature as kept.</div>' : ''}
    <div class="panel-title">What is known</div>
    <div class="detail-mem">${view.lore ? esc(view.lore) : 'Its ways have not yet been closely studied.'}</div>
  </div>`;
  overlay.style.display = 'flex'; const close = overlay.querySelector<HTMLButtonElement>('.close')!; close.focus();
  const shut = () => { overlay.style.display = 'none'; document.removeEventListener('keydown', onKey); returnFocus?.focus(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') shut(); };
  close.addEventListener('click', shut); document.addEventListener('keydown', onKey);
}
