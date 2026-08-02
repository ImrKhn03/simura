import { Stage, kinColorHex } from './scene.ts';
import { SoundScape } from './sound.ts';
import { renderGod, renderWorld, showCreatureDetail, showKinDetail } from './panels.ts';
import type { PublicKinSnapshot, WorldEvent, WorldSnapshot } from '../shared/types.ts';
import { ERA_NAMES } from '../shared/types.ts';
import { eventMark, humanEventDetail, kinGlancePhrase, worldTimePhrase } from './presentation.ts';
import type { QualityChoice } from './render/quality.ts';
import { applyVisualFixture } from './visual-fixtures.ts';
import { CALAMITY_VISUAL } from './render/world-things.ts';
import { biomeAt } from '../shared/terrain.ts';

const stage = new Stage(document.getElementById('stage')!);
(globalThis as typeof globalThis & { __SIMURA_METRICS__?: () => ReturnType<Stage['metrics']> }).__SIMURA_METRICS__ = () => stage.metrics();
const feedEl = document.getElementById('feed')!;
const godEl = document.getElementById('god')!;
const overlayEl = document.getElementById('detail-overlay')!;
const hudDay = document.getElementById('hud-day')!;
const hudEra = document.getElementById('hud-era')!;
const hudPop = document.getElementById('hud-pop')!;
const dayDial = document.getElementById('day-dial')!;
const kinBarEl = document.getElementById('kin-bar')!;
const tickerEl = document.getElementById('ticker')!;
const toastEl = document.getElementById('toast')!;
const calamityBannerEl = document.getElementById('calamity-banner')!;
const liveFiltersEl = document.getElementById('live-filters')!;
const qualityChoiceEl = document.getElementById('quality-choice') as HTMLSelectElement;
const reduceMotionEl = document.getElementById('reduce-motion') as HTMLInputElement;
const sideEl = document.getElementById('side')!;
const sideToggleEl = document.getElementById('side-toggle') as HTMLButtonElement;
sideEl.inert = true;
sideToggleEl.addEventListener('click', () => {
  const open = !sideEl.classList.contains('open');
  sideEl.classList.toggle('open', open); sideEl.inert = !open;
  sideToggleEl.setAttribute('aria-expanded', String(open)); sideToggleEl.textContent = open ? '×' : '☰';
});
qualityChoiceEl.value = stage.selectedQuality;
try { reduceMotionEl.checked = localStorage.getItem('reduceMotion') === '1'; } catch { /* optional preference */ }
qualityChoiceEl.addEventListener('change', () => stage.setQuality(qualityChoiceEl.value as QualityChoice, reduceMotionEl.checked));
reduceMotionEl.addEventListener('change', () => stage.setQuality(qualityChoiceEl.value as QualityChoice, reduceMotionEl.checked));

// --- tabs: Live · World · God ---
let activeTab = 'feed';
let worldSub = 'story';
let lastSnap: WorldSnapshot | null = null;
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#tabs button'))) {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab!;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('active', p.id === activeTab));
    liveFiltersEl.classList.toggle('active', activeTab === 'feed');
    if (lastSnap) refreshPanels(lastSnap);
  });
}
liveFiltersEl.classList.add('active'); // Live is the default tab
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#world-nav button'))) {
  btn.addEventListener('click', () => {
    worldSub = btn.dataset.w!;
    document.querySelectorAll('#world-nav button').forEach((b) => b.classList.toggle('active', b === btn));
    if (lastSnap) refreshPanels(lastSnap);
  });
}
// live feed filters: all · speech · deeds · historic
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('#live-filters button'))) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#live-filters button').forEach((b) => b.classList.toggle('active', b === btn));
    feedEl.className = `tab-page active${btn.dataset.f === 'all' ? '' : ` f-${btn.dataset.f}`}`;
  });
}

function refreshPanels(snap: WorldSnapshot): void {
  if (activeTab === 'world') {
    void renderWorld(document.getElementById('world-body')!, worldSub, snap,
      (kinId) => stage.focusKin(kinId), (kinId) => stage.focusKin(kinId), (creature) => { stage.focusCreature(creature.id); showCreatureDetail(overlayEl, creature); });
  }
  if (activeTab === 'god') void renderGod(godEl, snap);
}

stage.onKinClick = (kinId) => void showKinDetail(overlayEl, kinId);
stage.onCreatureClick = (creature) => { stage.focusCreature(creature.id); showCreatureDetail(overlayEl, creature); };
overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) overlayEl.style.display = 'none'; });
overlayEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(overlayEl.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) return;
  const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

const kinById = new Map<string, PublicKinSnapshot>();
let lastEventId = 0;
let lastTickerId = 0;
let lastToastId = 0;

// --- the on-stage ambient layer ---

/** the kin bar: every living soul, glanceable — hunger, sleep, bonds, glow, restlessness */
function renderKinBar(snap: WorldSnapshot): void {
  const byId = new Map(snap.kin.map((k) => [k.id, k]));
  kinBarEl.innerHTML = '';
  for (const k of snap.kin) {
    kinById.set(k.id, k);
    if (k.status === 'dead') continue;
    const glyphs: string[] = [];
    if (k.presentation.flags.hungry) glyphs.push('◒');
    if (k.presentation.flags.asleep) glyphs.push('☾');
    if (k.presentation.flags.bonded) glyphs.push('❤');
    if (k.presentation.flags.carryingStar) glyphs.push('✦');
    if (k.presentation.flags.fulfilled) glyphs.push('✨'); else if (k.presentation.flags.restless) glyphs.push('↟');
    if (k.presentation.flags.fading) glyphs.push('🕯');
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `kin-chip stage-${k.presentation.lifeStage}${k.status === 'fading' ? ' fading' : ''}`;
    const color = kinColorHex(k, byId);
    chip.style.setProperty('--kin-color', color);
    chip.innerHTML = `<span class="kc-name" style="color:${color}">${escapeHtml(k.name)}</span><span class="kc-state">${glyphs.join(' ') || '·'}</span><span class="kc-bars" aria-hidden="true"><i style="--v:${k.presentation.mood}"></i><i style="--v:${k.presentation.vitality}"></i></span>`;
    chip.setAttribute('aria-label', kinGlancePhrase(k));
    chip.addEventListener('click', () => { stage.focusKin(k.id); void showKinDetail(overlayEl, k.id); });
    chip.addEventListener('dblclick', () => stage.focusKin(k.id));
    kinBarEl.appendChild(chip);
  }
}

const NOTABLE = new Set(['craft', 'build', 'eat', 'gather', 'teach', 'give', 'write', 'plant', 'sing', 'trade',
  'birth', 'death', 'era_unlocked', 'adoption', 'net_answer', 'name_place', 'signal', 'reach_beyond', 'pray']);

/** ticker: notable deeds drift up from the world; toast: history interrupts */
function pulseStage(events: WorldEvent[]): void {
  for (const e of events) {
    if (e.historic && e.id > lastToastId) {
      lastToastId = e.id;
      const t = document.createElement('div');
      t.className = 'toast-card';
      t.textContent = `★ ${humanEventDetail(e.detail).slice(0, 140)}`;
      toastEl.replaceChildren(t);
      setTimeout(() => { if (t.parentElement) t.remove(); }, 8200);
      continue;
    }
    if (e.id <= lastTickerId || !NOTABLE.has(e.verb) || e.historic) continue;
    lastTickerId = e.id;
    const actor = e.actorKinId ? kinById.get(e.actorKinId) : null;
    const line = document.createElement('div');
    line.className = 'tick-line';
    line.innerHTML = `<span class="who" style="color:${actor ? (actor.gender === 'sol' ? 'var(--sol)' : 'var(--lune)') : 'var(--historic)'}">${escapeHtml(actor?.name ?? '✦')}</span> ${escapeHtml(humanEventDetail(e.detail).slice(0, 110))}`;
    tickerEl.appendChild(line);
    while (tickerEl.children.length > 3) tickerEl.removeChild(tickerEl.firstChild!);
    setTimeout(() => { if (line.parentElement) line.remove(); }, 9200);
  }
}

function appendEvents(events: WorldEvent[]): void {
  const nearBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 60;
  for (const e of events) {
    if (e.id <= lastEventId) continue;
    lastEventId = e.id;
    // stumbles are internal hiccups (rate limits, provider errors) — not part of
    // the world's story; never show them in the feed
    if (e.verb === 'stumble') continue;
    const actor = e.actorKinId ? kinById.get(e.actorKinId) : null;
    const div = document.createElement('div');
    div.className = `ev ${actor ? actor.gender : 'world'}${e.historic ? ' historic' : ''}${e.verb === 'pray' ? ' prayer' : ''}`;
    // categorize for the Live filters: speech vs. deeds (hands-on acts)
    const worldVerbs = ['calamity_began', 'calamity_ended', 'fauna_appeared', 'era_unlocked', 'land_expanded', 'fire_died'];
    const cat = worldVerbs.includes(e.verb) ? 'world' : (e.verb === 'speak' || e.verb === 'sing') ? 'speech'
      : ['craft', 'build', 'gather', 'give', 'plant', 'eat', 'carry', 'drop', 'teach', 'write', 'trade', 'name_place'].includes(e.verb) ? 'deed' : 'other';
    div.dataset.cat = cat;
    const mark = eventMark(e.verb);
    const who = `${mark.icon}${mark.icon ? ' ' : ''}${actor ? actor.name : 'the world'}`;
    const cleanDetail = humanEventDetail(e.detail);
    const verb = e.verb === 'speak' ? `<span class="detail">“${escapeHtml(cleanDetail)}”</span>`
      : `<span class="detail">${escapeHtml(cleanDetail)}</span>`;
    div.innerHTML = `
      <span class="who">${escapeHtml(who)}</span> ${verb}
      ${e.thought ? `<div class="thought">${escapeHtml(e.thought)}</div>` : ''}`;
    feedEl.appendChild(div);
  }
  while (feedEl.children.length > 400) feedEl.removeChild(feedEl.firstChild!);
  if (nearBottom) feedEl.scrollTop = feedEl.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

// --- minimap: the whole known world at a glance ---
const minimap = document.getElementById('minimap') as HTMLCanvasElement;
function drawMinimap(snap: WorldSnapshot): void {
  const ctx = minimap.getContext('2d')!;
  // bounds can extend into negative coords as the world grows west/north
  const minX = snap.map.minX ?? 0; const minY = snap.map.minY ?? 0;
  const spanX = snap.map.width - minX; const spanY = snap.map.height - minY;
  const s = minimap.width / Math.max(spanX, spanY);
  const mx = (x: number): number => (x - minX) * s;
  const my = (y: number): number => (y - minY) * s;
  ctx.clearRect(0, 0, minimap.width, minimap.height);
  // the known world as a paper map: each tile painted its biome colour
  const BIOME_INK: Record<string, string> = {
    water: '#7FC6D2', shore: '#E8D3A0', meadow: '#A8CF7E', forest: '#6FAE68', highland: '#C2BCA9', peak: '#EFE9D3',
  };
  for (let gx = minX; gx < snap.map.width; gx++) {
    for (let gy = minY; gy < snap.map.height; gy++) {
      ctx.fillStyle = BIOME_INK[biomeAt(gx, gy, snap.seed)] ?? '#A8CF7E';
      ctx.fillRect(mx(gx), my(gy), s + .5, s + .5);
    }
  }
  if (snap.presentation.calamity) {
    ctx.fillStyle = `${CALAMITY_VISUAL[snap.presentation.calamity.kind].color}55`;
    ctx.fillRect(0, 0, spanX * s, spanY * s);
  }
  for (const tr of snap.trails) {
    ctx.fillStyle = 'rgba(205,178,120,0.75)';
    ctx.fillRect(mx(tr.x), my(tr.y), s, s);
  }
  for (const o of snap.objects) {
    if (o.carriedBy) continue;
    if (o.creature) {
      const x = mx(o.pos.x); const y = my(o.pos.y); const radius = o.creature.young ? 1.2 : 1.8;
      if (o.kind === 'predator') {
        ctx.fillStyle = '#E05A4F'; ctx.beginPath(); ctx.moveTo(x, y - 2.8); ctx.lineTo(x - 2.7, y + 2.2); ctx.lineTo(x + 2.7, y + 2.2); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = '#FFFDF2'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        if (o.creature.kept) { ctx.strokeStyle = '#4DA6A8'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 3, y - 3, 6, 6); }
      }
      continue;
    }
    ctx.fillStyle = o.kind === 'structure' ? '#C86A47' : o.kind === 'landmark' ? '#9C9482'
      : o.kind === 'water' ? '#4FA8BC' : o.kind === 'tree' ? '#3E7C50' : '';
    if (ctx.fillStyle && ctx.fillStyle !== '#000000') ctx.fillRect(mx(o.pos.x) - 1, my(o.pos.y) - 1, 2, 2);
  }
  for (const pl of snap.places) {
    ctx.fillStyle = '#d8c9a0';
    ctx.fillRect(mx(pl.pos.x) - 1, my(pl.pos.y) - 1, 3, 3);
  }
  for (const k of snap.kin) {
    if (k.status === 'dead') continue;
    ctx.fillStyle = k.gender === 'sol' ? '#E8845F' : '#6FA7D8';
    ctx.beginPath();
    ctx.arc(mx(k.pos.x), my(k.pos.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function applySnapshot(snap: WorldSnapshot): void {
  snap = applyVisualFixture(snap, new URLSearchParams(location.search).get('fixture'));
  lastSnap = snap;
  stage.update(snap);
  renderKinBar(snap);
  appendEvents(snap.recentEvents);
  pulseStage(snap.recentEvents);
  refreshPanels(snap);
  drawMinimap(snap);
  hudDay.textContent = worldTimePhrase(snap.presentation);
  const wIcon = { clear: '☀', cloudy: '☁', rain: '🌧', fog: '🌫', storm: '⛈', snow: '❄' }[snap.weather] ?? '';
  hudEra.textContent = `${ERA_NAMES[snap.era] ?? 'The world unfolding'} ${wIcon}`;
  const living = snap.kin.filter((kin) => kin.status !== 'dead').length;
  hudPop.textContent = `${living} ${living === 1 ? 'life' : 'lives'}`;
  dayDial.style.setProperty('--phase', String(snap.dayPhase));
  const calamity = snap.presentation.calamity;
  if (calamity) {
    const visual = CALAMITY_VISUAL[calamity.kind];
    calamityBannerEl.innerHTML = `<div class="calamity-card" style="--calamity:${visual.color}"><span class="calamity-icon" aria-hidden="true">${visual.icon}</span><span class="calamity-copy"><b>${escapeHtml(visual.title)}</b><small>${escapeHtml(calamity.line)}</small></span><span class="calamity-progress" role="img" aria-label="${escapeHtml(calamity.remainingPhrase)}"><i style="--remaining:${calamity.remaining}"></i></span></div>`;
  } else calamityBannerEl.replaceChildren();
  sound.setState(snap.dayPhase, snap.weather, calamity?.kind ?? null);
}

// --- camera modes: auto · eye · fly · cinema (buttons mirror keyboard/mouse controls) ---
// one camera: the lab explorer view — WASD glide, drag look, wheel zoom

// --- the world's sound: opt-in (browsers require a gesture), procedural, weather-aware ---
const sound = new SoundScape();
document.addEventListener('visibilitychange', () => sound.setPageVisible(!document.hidden));
const soundBtn = document.getElementById('hud-sound')!;
soundBtn.addEventListener('click', () => {
  soundBtn.textContent = sound.toggle() ? '🔊' : '🔇';
});

// --- live connection with reconnect; initial state via REST as fallback ---
async function bootstrap(): Promise<void> {
  try {
    const snap = await (await fetch('/api/state')).json() as WorldSnapshot;
    applySnapshot(snap);
  } catch { /* server not up yet; ws will retry */ }
}

function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data as string) as { type: string; snapshot: WorldSnapshot };
    if (data.type === 'snapshot' || data.type === 'tick') applySnapshot(data.snapshot);
  };
  ws.onclose = () => setTimeout(connect, 2500);
  ws.onerror = () => ws.close();
}

void bootstrap();
connect();
