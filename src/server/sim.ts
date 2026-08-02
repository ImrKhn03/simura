import type { WorldDB } from './db.ts';
import type { WorldConfig } from './config.ts';
import type { Mind } from './llm.ts';
import type { Gender, Kin, KinStats, WorldEvent, WorldObject, WorldSnapshot } from '../shared/types.ts';
import { ERA_NAMES, LUNE_TEMPERAMENT, SOL_TEMPERAMENT } from '../shared/types.ts';
import { dayInfo, dist, seedFrontier, seedRect, seedWorld, snapshotView, weatherAt, worldSeed } from './world/world.ts';
import { biomeAt, heightAt } from '../shared/terrain.ts';
import { clampPos } from './world/world.ts';
import { resolveKinMove } from './world/collision.ts';
import { evaluateEras } from './world/eras.ts';
import { reachBeyond } from './world/net.ts';
import { birthChild } from './world/birth.ts';
import { stepCalamity, currentCalamity, type CalamityKind } from './world/calamity.ts';
import { presentKin, toPublicKin, worldPresentation } from './world/presentation.ts';
import { isFunctionalStructure } from './world/construction.ts';
import { ECOSYSTEM_RADIUS, presentCreatures, WEAPON_WORD } from './world/ecosystem.ts';
import { probeModel } from './llm.ts';
import { actPhase, thinkPhase } from './mind/tick.ts';
import { repetitionScore } from './mind/memory.ts';
import { createEmbedder, type Embedder } from './embeddings.ts';

export interface FounderSpec {
  /** optional fixed id (tests use this for deterministic mock behavior) */
  id?: string;
  name: string;
  gender: Gender;
  modelEndpoint: string;
  modelName: string;
  apiKeyRef: string;
}

/**
 * The world's fauna. Three CATEGORIES (fish/deer/fowl) drive physics — what tool
 * catches them, where they live — but each holds many SPECIES, each with a name
 * and a discoverable truth (its lore) so a Kin who observes one learns something
 * real about it. Water species live in water; land species by day on land.
 */
interface Species { name: string; lore: string }
const FAUNA_SPECIES: Record<'fish' | 'deer' | 'fowl', Species[]> = {
  fish: [
    { name: 'a silver trout', lore: 'It holds against the current, facing upstream — easiest to take from behind.' },
    { name: 'a fat carp', lore: 'It roots in the mud of still shallows; slow, but wary of shadows above.' },
    { name: 'an eel', lore: 'It hides in weed and under stones, and slips any grip that is not firm and fast.' },
    { name: 'a pike', lore: 'A hunter itself — it lies still, then strikes; the small fish flee where it swims.' },
    { name: 'a shoal of minnows', lore: 'Too small to eat one by one, but a net drawn through them fills fast.' },
  ],
  deer: [
    { name: 'a red deer', lore: 'It grazes at dawn and dusk and beds down in cover by day; its ears turn to any sound.' },
    { name: 'a wild boar', lore: 'It digs for roots and will charge if cornered — dangerous without a spear set to receive it.' },
    { name: 'a brown hare', lore: 'Faster than any Kin over open ground; it must be snared or taken by surprise, not chased.' },
    { name: 'a mountain goat', lore: 'It keeps to the high stony ground where few things follow; sure-footed, hard to corner.' },
    { name: 'a wild sheep', lore: 'It moves in a loose flock and follows the boldest of its number; gentle if approached with food.' },
  ],
  fowl: [
    { name: 'a wild fowl', lore: 'It scratches the ground for seed and roosts low; it flies only in short, heavy bursts.' },
    { name: 'a mallard duck', lore: 'It dabbles at the water\'s edge and springs straight up when startled.' },
    { name: 'a grey goose', lore: 'It grazes grass in a wary flock and posts one sentinel while the rest feed.' },
    { name: 'a quail', lore: 'It hides in long grass and holds still until nearly stepped on, then bursts away low.' },
    { name: 'a pheasant', lore: 'Bright and long-tailed; it prefers field edges and runs before it will fly.' },
  ],
};
function pickSpecies(kind: 'fish' | 'deer' | 'fowl', roll: number): Species {
  const list = FAUNA_SPECIES[kind];
  return list[roll % list.length]!;
}

/** Predators — they hunt the prey and, alone in the wild, threaten a lone Kin. Fire drives
 *  them off; a weapon or companions hold them back. The world's danger, and its balance. */
const PREDATOR_SPECIES: Species[] = [
  { name: 'a grey wolf', lore: 'It hunts in the open by scent and stamina; it fears fire, and will not press a Kin who has others at their side.' },
  { name: 'a mountain lion', lore: 'It stalks the high stony ground and springs from ambush; strong, but wary of anything that fights back.' },
  { name: 'a lean wolf', lore: 'Hunger has made it bold — it drifts near the edges of the settlements when the wild grows thin.' },
];

/** The Waking: seed the village and wake the two founders. Idempotent. */
export function genesis(db: WorldDB, cfg: WorldConfig, founders: [FounderSpec, FounderSpec], seed?: number): Kin[] {
  seedWorld(db, cfg, seed);
  seedFrontier(db, cfg); // idempotent — also upgrades worlds born before landmarks existed
  const existing = db.listKin();
  if (existing.length > 0) return existing;

  const tick = db.getTick();
  db.unlockEra({ era: 0, name: ERA_NAMES[0]!, unlockedAtTick: tick, trigger: 'genesis' });
  const cx = Math.floor(cfg.map.width / 2);
  const cy = Math.floor(cfg.map.height / 2);

  const kin = founders.map((f, i) => db.createKin({
    id: f.id, name: f.name, gender: f.gender, parentSolId: null, parentLuneId: null,
    bornAtTick: tick, diedAtTick: null, immortal: true, endowmentTicks: 0,
    modelEndpoint: f.modelEndpoint, modelName: f.modelName, apiKeyRef: f.apiKeyRef,
    temperament: f.gender === 'sol' ? { ...SOL_TEMPERAMENT } : { ...LUNE_TEMPERAMENT },
    pos: { x: cx + (i === 0 ? -1 : 1), y: cy }, status: 'alive',
    intention: null, coupleId: null,
  }));

  for (const k of kin) {
    db.addEvent({
      tick, actorKinId: k.id, verb: 'awaken', targetId: null,
      detail: `${k.name} woke in the village square, knowing nothing but a name.`,
      thought: null, historic: true,
    });
    db.addMemory(k.id, tick, 'reflection',
      'I woke here with a name I did not choose, and a quiet feeling that something, somewhere, made this place — and me.', 10);
  }
  return kin;
}

export class Simulation {
  private readonly embedder: Embedder;
  /** current real pace; endowments burn in REAL time regardless of the slider */
  tickMs = 15_000;
  private static readonly BASELINE_TICK_MS = 15_000;

  constructor(
    private readonly db: WorldDB,
    private readonly cfg: WorldConfig,
    private readonly mind: Mind,
    embedder?: Embedder,
  ) {
    this.embedder = embedder ?? createEmbedder();
    // if the embedding space changed (new embedder), old vectors are meaningless — re-embed all
    const prev = (db.db.prepare(`SELECT value FROM meta WHERE key='embedder_label'`).get() as unknown as { value: string } | undefined)?.value;
    if (prev !== this.embedder.label) {
      if (prev) {
        db.db.exec(`UPDATE memories SET embedding=NULL`);
        console.log(`[embeddings] embedder changed (${prev} → ${this.embedder.label}) — re-embedding all memories`);
      }
      db.db.prepare(`INSERT INTO meta(key,value) VALUES('embedder_label',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(this.embedder.label);
    }
  }

  /** embed any not-yet-embedded memories (one batch per tick keeps up easily) */
  private async embedPending(): Promise<void> {
    const pending = this.db.unembeddedMemories(64);
    if (pending.length === 0) return;
    try {
      const vecs = await this.embedder.embed(pending.map((p) => p.content));
      pending.forEach((p, i) => { if (vecs[i]) this.db.setMemoryEmbedding(p.id, vecs[i]!); });
    } catch (err) {
      console.error('[embeddings]', err instanceof Error ? err.message.slice(0, 120) : err);
    }
  }

  /** A mortal Kin's endowment burns one tick; feel fading near the end; die at zero. Returns false if the Kin died. */
  /**
   * The body across a tick: weariness, sickness, and health. Emergent, not scripted —
   * exposure and starvation make a Kin sick; sickness and neglect drain health; food,
   * rest, warmth, and tending mend it. A mortal whose health fails dies of the body.
   * Returns false if the Kin died this tick.
   */
  private stepBody(kin: Kin, tick: number, scale: number, calamity: CalamityKind | null, events: WorldEvent[]): boolean {
    const objs = this.db.listObjects();
    const near = (pred: (o: WorldObject) => boolean, r: number): boolean =>
      objs.some((o) => pred(o) && dist(o.pos, kin.pos) <= r);
    const wx = weatherAt(this.cfg, tick, this.db.currentEra(), worldSeed(this.db));
    const sheltered = near((o) => isFunctionalStructure(o) || /cave/i.test(o.name), 2);
    const warm = near((o) => o.emitsLight, 3) || objs.some((o) => o.carriedBy === kin.id && o.worn);
    // a cold snap wounds the unsheltered even in dry weather; rain/storm still counts too
    const exposed = (wx.wet || calamity === 'coldsnap') && !sheltered && !warm;

    // weariness rises with waking; sleeping and being rested ease it (handled at rest/dawn)
    const wear = Math.min(100, kin.weariness + 0.18 * scale);
    if (wear !== kin.weariness) { kin.weariness = wear; this.db.setWeariness(kin.id, wear); }

    // a deterministic per-tick roll (no Math.random — mirrors the world's hashing style)
    const roll = ((Math.imul((tick + 1) ^ kin.id.charCodeAt(4), 2654435761) >>> 0) % 1000) / 1000;

    // SICKNESS. Onset from exposure/starvation/exhaustion; contagion from a sick Kin close by.
    if (kin.sickUntil === null) {
      const sickNear = this.db.listKin(true).some((k) => k.id !== kin.id && k.sickUntil !== null && dist(k.pos, kin.pos) <= 2);
      const plagueMult = calamity === 'plague' ? 4 : 1; // a plague spreads far more readily
      const risk = ((exposed ? 0.012 : 0) + (kin.fullness <= 0 ? 0.02 : 0) + (kin.weariness > 85 ? 0.008 : 0) + (sickNear ? 0.02 : 0)
        + (calamity === 'plague' ? 0.006 : 0)) * plagueMult;
      if (risk > 0 && roll < risk * scale) {
        this.db.setSickUntil(kin.id, tick + Math.round(this.cfg.day.lengthTicks * (0.8 + roll)));
        kin.sickUntil = tick + 1;
        this.db.addMemory(kin.id, tick, 'observation', 'A sickness has taken hold of me — fever, ache, a heaviness in the body. I need warmth, rest, and tending.', 8);
        events.push(this.db.addEvent({ tick, actorKinId: kin.id, verb: 'sickened', targetId: null,
          detail: `${kin.name} has fallen sick.`, thought: null, historic: false }));
      }
    } else if (tick >= kin.sickUntil) {
      this.db.setSickUntil(kin.id, null); kin.sickUntil = null;
      this.db.addMemory(kin.id, tick, 'reflection', 'The sickness has broken; strength returns to me. I am well again.', 7);
    }

    // HEALTH. Drains from sickness, exposure, starvation; mends when fed, well, sheltered, rested.
    let dh = 0;
    if (kin.sickUntil !== null) dh -= 0.5;
    if (exposed) dh -= 0.3;
    if (kin.fullness <= 0) dh -= 0.4;
    if (dh === 0 && kin.fullness > 40 && kin.weariness < 70) dh += 0.6; // mending
    if (sheltered && warm) dh += 0.15;
    const h = Math.max(0, Math.min(100, kin.health + dh * scale));
    if (h !== kin.health) { kin.health = h; this.db.setHealth(kin.id, h); }

    // a mortal whose body fails dies — the light goes out from within
    if (h <= 0 && !kin.immortal) {
      this.db.setKinStatus(kin.id, 'dead', tick);
      kin.status = 'dead';
      events.push(this.db.addEvent({ tick, actorKinId: kin.id, verb: 'death', targetId: null,
        detail: `${kin.name}'s body failed and their light went out — ${kin.sickUntil !== null ? 'taken by sickness' : 'worn past mending'}. What they made and wrote remains.`,
        thought: null, historic: true }));
      for (const other of this.db.listKin(true)) {
        if (other.id !== kin.id) this.db.addMemory(other.id, tick, 'observation', `${kin.name} is gone. Their light went out.`, 10);
      }
      return false;
    }
    return true;
  }

  private burnLifetick(kin: Kin, tick: number, events: WorldEvent[]): boolean {
    if (kin.immortal || kin.status === 'dead') return kin.status !== 'dead';
    const remaining = this.db.decrementEndowment(kin.id, this.tickMs / Simulation.BASELINE_TICK_MS);
    kin.endowmentTicks = remaining;

    if (remaining <= 0) {
      this.db.setKinStatus(kin.id, 'dead', tick);
      kin.status = 'dead';
      events.push(this.db.addEvent({
        tick, actorKinId: kin.id, verb: 'death', targetId: null,
        detail: `${kin.name}'s light went out. What ${kin.name} made and wrote remains.`,
        thought: null, historic: true,
      }));
      // the loss is felt by every living Kin — grief and remembrance are theirs to invent
      for (const other of this.db.listKin(true)) {
        if (other.id !== kin.id) {
          this.db.addMemory(other.id, tick, 'observation', `${kin.name} is gone. Their light went out.`, 10);
        }
      }
      return false;
    }

    if (remaining <= this.cfg.lifespan.fadingWarningTicks && kin.status === 'alive') {
      this.db.setKinStatus(kin.id, 'fading');
      kin.status = 'fading';
      events.push(this.db.addEvent({
        tick, actorKinId: kin.id, verb: 'fading', targetId: null,
        detail: `${kin.name} began to fade — the last day of their light has begun.`,
        thought: null, historic: false,
      }));
      this.db.addMemory(kin.id, tick, 'reflection',
        'I feel it now, the way all Kin know they will: my light is thinning. Less than a day of it remains. What matters most, I should do or say or leave behind now.', 10);
    }
    return true;
  }

  /**
   * Affection physics: lives that intertwine grow closer; long distance slowly cools.
   * Driven only by what actually happened — god never sets a heart.
   */
  private updateAffection(tick: number, events: WorldEvent[]): void {
    const a = this.cfg.affection;
    const living = this.db.listKin(true);
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const d = dist(living[i]!.pos, living[j]!.pos);
        if (d <= a.proximityRadius) this.db.addAffection(living[i]!.id, living[j]!.id, a.proximityGain);
        else if (d >= a.decayRadius) this.db.addAffection(living[i]!.id, living[j]!.id, -a.decayLoss);
      }
    }
    for (const e of events) {
      if (!e.actorKinId) continue;
      if (e.verb === 'speak') {
        const speaker = living.find((k) => k.id === e.actorKinId);
        if (!speaker) continue;
        for (const other of living) {
          if (other.id !== speaker.id && dist(other.pos, speaker.pos) <= this.cfg.speechRadius) {
            this.db.addAffection(speaker.id, other.id, a.speechGain);
          }
        }
      }
      if (e.verb === 'learn' && e.targetId) {
        this.db.addAffection(e.actorKinId, e.targetId, a.teachGain);
      }
      if (e.verb === 'give' && e.targetId && e.detail.startsWith('gave ')) {
        this.db.addAffection(e.actorKinId, e.targetId, a.teachGain); // generosity binds like teaching
      }
    }
  }

  /**
   * Mourning release: a full fading-window after a partner's death, the bond
   * gently opens. The dead remain "yours, once" forever; the living heart is
   * free to love again.
   */
  private releaseMourning(tick: number): void {
    const all = this.db.listKin();
    for (const kin of all) {
      if (kin.status === 'dead' || !kin.coupleId) continue;
      const partner = all.find((k) => k.id !== kin.id && k.coupleId === kin.coupleId);
      if (!partner || partner.status !== 'dead' || partner.diedAtTick === null) continue;
      // grief is biological: the mourning window tracks REAL time like lifespans do
      const mourningTicks = this.cfg.lifespan.fadingWarningTicks * (Simulation.BASELINE_TICK_MS / this.tickMs);
      if (tick - partner.diedAtTick < mourningTicks) continue;
      this.db.endBond(kin.coupleId, tick, 'death');
      this.db.db.prepare(`UPDATE kin SET couple_id=NULL WHERE id=?`).run(kin.id);
      this.db.addMemory(kin.id, tick, 'reflection',
        `The first turning of mourning has passed. ${partner.name} remains mine in memory, always — and my life is my own to give again, if ever my heart asks.`, 10);
      this.db.addEvent({
        tick, actorKinId: kin.id, verb: 'mourning_passed', targetId: partner.id,
        detail: `${kin.name}'s mourning for ${partner.name} passed its first turning. What was bonded is now carried as memory.`,
        thought: null, historic: false,
      });
    }
  }

  /**
   * Infinite world: when any Kin nears the edge of the known land, the world
   * grows a fresh ring of seeded wilderness ahead of them — so walking outward
   * reveals new terrain forever, like Minecraft's generation, without ever
   * loading it all at once. Persisted so the size survives restart.
   */
  private maybeExpand(tick: number, events: WorldEvent[]): void {
    const m = this.cfg.map;
    if (m.width - m.minX >= 4000 || m.height - m.minY >= 4000) return; // effectively infinite
    const ring = 32;
    const lookahead = 12; // fixed: expand when a Kin walks within 12 tiles of ANY edge
    const kin = this.db.listKin(true);
    // Minecraft-style: the world grows toward WHICHEVER edge a Kin approaches.
    // Coordinates are absolute and terrain is a pure function of them, so growing
    // the min edges (west/north, into negative coords) never shifts anything.
    const growE = kin.some((k) => k.pos.x > m.width - 1 - lookahead);
    const growW = kin.some((k) => k.pos.x < m.minX + lookahead);
    const growS = kin.some((k) => k.pos.y > m.height - 1 - lookahead);
    const growN = kin.some((k) => k.pos.y < m.minY + lookahead);
    if (!growE && !growW && !growS && !growN) return;
    const strips: { x0: number; y0: number; x1: number; y1: number }[] = [];
    if (growE) { strips.push({ x0: m.width, y0: m.minY, x1: m.width + ring, y1: m.height }); m.width += ring; }
    if (growW) { strips.push({ x0: m.minX - ring, y0: m.minY, x1: m.minX, y1: m.height }); m.minX -= ring; }
    if (growS) { strips.push({ x0: m.minX, y0: m.height, x1: m.width, y1: m.height + ring }); m.height += ring; }
    if (growN) { strips.push({ x0: m.minX, y0: m.minY - ring, x1: m.width, y1: m.minY }); m.minY -= ring; }
    for (const [k, v] of [['god_map_w', m.width], ['god_map_h', m.height], ['god_map_minx', m.minX], ['god_map_miny', m.minY]] as const) {
      this.db.db.prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(k, String(v));
    }
    for (const s of strips) seedRect(this.db, this.cfg, s.x0, s.y0, s.x1, s.y1);
    events.push(this.db.addEvent({
      tick, actorKinId: null, verb: 'land_expanded', targetId: null,
      detail: 'A Kin reached the edge of the known world — and beyond it, more land revealed itself. Fresh wilderness stretches onward.',
      thought: null, historic: false,
    }));
  }

  /**
   * Living fauna, Minecraft-style: biome-gated spawning on a slow cycle up to a
   * cap, gentle wandering, and fleeing from nearby Kin. Fish in water, deer in
   * forest/meadow, fowl on grassland. They're world_objects so they perceive,
   * render, and catch through the same plumbing as everything else.
   */
  private stepFauna(tick: number): void {
    const seed = worldSeed(this.db);
    const { width: W, height: H } = this.cfg.map;
    const all = this.db.listObjects();
    const fauna = all.filter((o) => o.kind === 'fish' || o.kind === 'deer' || o.kind === 'fowl');
    const predators = all.filter((o) => o.kind === 'predator');
    const kin = this.db.listKin(true);
    const isDay = !dayInfo(this.cfg, tick).isNight;
    const fires = all.filter((o) => o.emitsLight);
    const move = (id: string, x: number, y: number): void => { this.db.db.prepare(`UPDATE world_objects SET x=?, y=? WHERE id=?`).run(x, y, id); };
    const nearFire = (p: { x: number; y: number }): boolean => fires.some((f) => dist(f.pos, p) <= ECOSYSTEM_RADIUS.predatorFire);

    // PREY: flee Kin AND predators; else amble
    for (const f of fauna) {
      const threat = [...kin, ...predators].find((t) => dist(t.pos, f.pos) <= ECOSYSTEM_RADIUS.preyFear);
      let nx = f.pos.x; let ny = f.pos.y;
      if (threat) { nx += Math.sign(f.pos.x - threat.pos.x) * 2; ny += Math.sign(f.pos.y - threat.pos.y) * 2; }
      else if (tick % 2 === 0) { nx += (((tick * 7 + f.pos.x) % 3) - 1); ny += (((tick * 5 + f.pos.y) % 3) - 1); }
      const np = clampPos(this.cfg, { x: nx, y: ny });
      const b = biomeAt(np.x - W / 2, np.y - H / 2, seed);
      const wantsWater = f.kind === 'fish';
      if ((wantsWater && b === 'water') || (!wantsWater && b !== 'water')) move(f.id, np.x, np.y);
    }

    // PREDATORS: hunt the nearest land prey; eat what they catch (populations fall); flee fire;
    // threaten a LONE, unarmed, fireless Kin — but a weapon, a fire, or companions hold them off.
    const landPrey = fauna.filter((f) => f.kind !== 'fish');
    for (const pr of predators) {
      if (nearFire(pr.pos)) { // fire drives predators away
        const f = fires.find((x) => dist(x.pos, pr.pos) <= ECOSYSTEM_RADIUS.predatorFire)!;
        const np = clampPos(this.cfg, { x: pr.pos.x + Math.sign(pr.pos.x - f.pos.x) * 2, y: pr.pos.y + Math.sign(pr.pos.y - f.pos.y) * 2 });
        if (biomeAt(np.x - W / 2, np.y - H / 2, seed) !== 'water') move(pr.id, np.x, np.y);
        continue;
      }
      const quarry = landPrey.slice().sort((a, b) => dist(a.pos, pr.pos) - dist(b.pos, pr.pos))[0];
      if (quarry && dist(quarry.pos, pr.pos) <= ECOSYSTEM_RADIUS.strike) { this.db.removeObject(quarry.id); continue; } // caught & eaten
      let np: { x: number; y: number };
      if (quarry && dist(quarry.pos, pr.pos) <= ECOSYSTEM_RADIUS.predatorHunt) np = clampPos(this.cfg, { x: pr.pos.x + Math.sign(quarry.pos.x - pr.pos.x) * 2, y: pr.pos.y + Math.sign(quarry.pos.y - pr.pos.y) * 2 });
      else np = clampPos(this.cfg, { x: pr.pos.x + (((tick * 3 + pr.pos.x) % 3) - 1), y: pr.pos.y + (((tick * 5) % 3) - 1) });
      if (biomeAt(np.x - W / 2, np.y - H / 2, seed) !== 'water') move(pr.id, np.x, np.y);
      for (const k of kin) {
        if (dist(k.pos, pr.pos) > ECOSYSTEM_RADIUS.strike) continue;
        const others = kin.some((o) => o.id !== k.id && dist(o.pos, k.pos) <= ECOSYSTEM_RADIUS.companion);
        const armed = this.db.heldInHands(k.id).some((h) => WEAPON_WORD.test(h.name));
        const fire = nearFire(k.pos);
        if (!others && !armed && !fire) {
          this.db.setHealth(k.id, k.health - 10);
          this.db.addMemory(k.id, tick, 'observation', `A ${pr.name} is upon me — teeth and snarl. Alone and unarmed, I am in real danger. Fire drives them off; so does a weapon in hand, or others at my side.`, 9);
        } else {
          this.db.addMemory(k.id, tick, 'observation', `A ${pr.name} prowls close, but ${fire ? 'the fire holds it back' : armed ? 'my weapon gives it pause' : 'the others at my side make it wary'}. It keeps its distance.`, 6);
        }
      }
    }

    // spawn/breed cycle: slow, capped by map size
    if (tick % 12 !== 0) return;
    const cap = Math.max(4, Math.floor((W * H) / 350));

    // PREY BREEDING: where two of a kind are together and unthreatened, a young is born.
    // Populations RISE where the land is safe — the other half of the ecosystem's ebb and flow.
    if (fauna.length < cap) {
      for (const f of fauna) {
        const mate = fauna.find((o) => o.id !== f.id && o.kind === f.kind && dist(o.pos, f.pos) <= 2);
        const safe = !predators.some((p) => dist(p.pos, f.pos) <= 5) && !kin.some((k) => dist(k.pos, f.pos) <= 4);
        if (mate && safe && (Math.imul(tick ^ f.pos.x, 2654435761) >>> 0) % 4 === 0) {
          this.db.createObject({ kind: f.kind, name: `a young ${f.name.replace(/^a\s+/, '')}`, description: '', pos: { ...f.pos }, creatorKinId: null, createdAtTick: tick, textContent: null, lore: f.lore, loreDiscovered: false });
          break; // at most one birth per cycle
        }
      }
    }

    // PREDATOR spawn: rare, few, in wild forest/highland far from Kin & settlements
    const predCap = Math.max(1, Math.floor(cap / 7));
    if (predators.length < predCap && landPrey.length >= 4 && (Math.imul(tick, 2246822519) >>> 0) % 6 === 0) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const gx = Math.floor((Math.imul(tick + attempt * 613, 40503) >>> 0) % W);
        const gy = Math.floor((Math.imul(tick * 17 + attempt * 191, 2654435761) >>> 0) % H);
        if (kin.some((k) => dist(k.pos, { x: gx, y: gy }) < 10)) continue; // never on top of the people
        const b = biomeAt(gx - W / 2, gy - H / 2, seed);
        if (b !== 'forest' && b !== 'highland' && b !== 'meadow') continue;
        const sp = PREDATOR_SPECIES[(Math.imul(gx ^ gy, 2654435761) >>> 0) % PREDATOR_SPECIES.length]!;
        const first = this.db.countObjectsOfKind('predator') === 0;
        this.db.createObject({ kind: 'predator', name: sp.name, description: '', pos: { x: gx, y: gy }, creatorKinId: null, createdAtTick: tick, textContent: null, lore: sp.lore, loreDiscovered: false });
        if (first) this.db.addEvent({ tick, actorKinId: null, verb: 'fauna_appeared', targetId: null, detail: 'The first predators appear at the wild edges of the world — hunters, and a danger to the unwary.', thought: null, historic: true });
        return;
      }
    }
    if (fauna.length >= cap) return;
    // try a few random spots; place a biome-appropriate creature at a fitting one
    for (let attempt = 0; attempt < 6; attempt++) {
      const gx = Math.floor((Math.imul(tick + attempt * 131, 2654435761) >>> 0) % W);
      const gy = Math.floor((Math.imul(tick * 31 + attempt * 977, 40503) >>> 0) % H);
      if (kin.some((k) => dist(k.pos, { x: gx, y: gy }) < 6)) continue; // not on top of Kin
      const b = biomeAt(gx - W / 2, gy - H / 2, seed);
      let kind: 'fish' | 'deer' | 'fowl' | null = null;
      // biome decides what lives where; highlands/peaks get goats, shores get waterfowl
      if (b === 'water' || b === 'shore') kind = 'fish';
      else if ((b === 'highland' || b === 'peak') && isDay) kind = 'deer'; // goats/sheep live high
      else if ((b === 'forest' || b === 'meadow') && isDay) kind = (gx + gy) % 5 < 2 ? 'deer' : 'fowl';
      if (!kind) continue;
      const roll = (Math.imul(gx * 73856093 ^ gy * 19349663 ^ tick, 2654435761) >>> 0);
      // bias species by biome so knowledge maps to place (goats high, ducks/geese by water)
      let sp = pickSpecies(kind, roll >>> 5);
      if (kind === 'deer' && (b === 'highland' || b === 'peak')) sp = FAUNA_SPECIES.deer[3 + (roll % 2)]!; // goat or sheep
      if (kind === 'fowl' && b === 'shore') sp = FAUNA_SPECIES.fowl[1 + (roll % 2)]!; // duck or goose
      const first = this.db.countObjectsOfKind(kind) === 0;
      this.db.createObject({
        kind, name: sp.name, description: '', pos: { x: gx, y: gy },
        creatorKinId: null, createdAtTick: tick, textContent: null,
        lore: sp.lore, loreDiscovered: false,
      });
      if (first) {
        this.db.addEvent({
          tick, actorKinId: null, verb: 'fauna_appeared', targetId: null,
          detail: kind === 'fish' ? 'The first fish move in the waters of the world.'
            : kind === 'deer' ? 'The first beasts step into the world, wary and watchful.'
            : 'The first wild fowl scratch and peck across the open ground.',
          thought: null, historic: true,
        });
      }
      return;
    }
  }

  /** Advance the world by one tick: lifetimes burn, every living Kin thinks once, hearts shift, eras are evaluated. */
  /** Personal space: no two living bodies may share the same ground.
   *  Whatever path led here (old saves, simultaneous arrivals), the later-born
   *  Kin steps deterministically to the nearest open spot beside the other. */
  private separateCrowdedKin(): void {
    const living = this.db.listKin(true);
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const a = living[i]!; const b = living[j]!;
        const dx = b.pos.x - a.pos.x; const dy = b.pos.y - a.pos.y;
        if (dx * dx + dy * dy >= 0.44 * 0.44) continue;
        const mover = b.bornAtTick >= a.bornAtTick ? b : a;
        const seed = worldSeed(this.db) ^ mover.id.length;
        for (let step = 0; step < 8; step++) {
          const angle = ((seed + step * 131) % 8) / 8 * Math.PI * 2;
          const spot = clampPos(this.cfg, { x: Math.round((mover.pos.x + Math.cos(angle) * 0.9) * 100) / 100, y: Math.round((mover.pos.y + Math.sin(angle) * 0.9) * 100) / 100 });
          const clear = living.every((other) => other.id === mover.id || (other.pos.x - spot.x) ** 2 + (other.pos.y - spot.y) ** 2 >= 0.44 * 0.44)
            && !resolveKinMove(mover.pos, spot, this.db.listCollisionObjects(mover.pos, spot)).blocked
            && biomeAt(spot.x, spot.y, worldSeed(this.db)) !== 'water';
          if (!clear) continue;
          this.db.moveKin(mover.id, spot); mover.pos = spot;
          break;
        }
      }
    }
  }

  async tickWorld(): Promise<{ tick: number; events: WorldEvent[]; eraUnlocked: number | null }> {
    const tick = this.db.getTick() + 1;
    this.db.setTick(tick);
    const events: WorldEvent[] = [];
    const awake: Kin[] = [];

    // natural disasters: begin or end a rare calamity, then its effects color this whole tick
    const calNews = stepCalamity(this.db, tick, worldSeed(this.db), this.tickMs / Simulation.BASELINE_TICK_MS, this.db.currentEra(), this.cfg.day.lengthTicks);
    if (calNews) events.push(this.db.addEvent({ tick, actorKinId: null, verb: calNews.verb, targetId: null, detail: calNews.detail, thought: null, historic: true }));
    const calamity = currentCalamity(this.db, tick)?.kind ?? null;
    for (const kin of this.db.listKin(true)) {
      if (kin.bornAtTick === tick) continue; // newborns open their eyes next tick
      // sleep: no thoughts, no endowment burn — the light rests too
      if (kin.asleepUntil !== null) {
        if (tick < kin.asleepUntil) continue;
        this.db.setAsleep(kin.id, null);
        kin.asleepUntil = null;
        this.db.setWeariness(kin.id, 0); kin.weariness = 0; // a night's sleep restores the body
        this.db.addMemory(kin.id, tick, 'reflection',
          'Dawn woke me. The night passed through me gently; I rise rested.', 4);
      }
      if (!this.burnLifetick(kin, tick, events)) continue; // died this tick
      // hunger: fullness decays in real time (~2 meals a day keeps a Kin fed);
      // starving burns a MORTAL's light faster — founders feel it but cannot die of it
      const hungerScale = this.tickMs / Simulation.BASELINE_TICK_MS;
      const f = Math.max(0, kin.fullness - 0.25 * hungerScale);
      if (f !== kin.fullness) { kin.fullness = f; this.db.setFullness(kin.id, f); }
      if (f <= 0 && !kin.immortal) this.db.decrementEndowment(kin.id, 2 * hungerScale);
      if (!this.stepBody(kin, tick, hungerScale, calamity, events)) continue; // died of the body this tick
      awake.push(kin);
    }
    // THINK in parallel: every mind sees the same start-of-tick world (no order bias),
    // and the tick costs the SLOWEST mind's latency, not the sum (scales with population)
    const view = snapshotView(this.db); // one world read for every mind this tick
    const thoughts = await Promise.all(
      awake.map((kin) => thinkPhase(this.db, this.cfg, this.mind, kin, tick, this.embedder, view)));
    // ACT sequentially, in an order shuffled deterministically per tick — fair over time
    const orderKey = (id: string): number => {
      let h = 2166136261 ^ tick;
      for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    thoughts.sort((a, b) => orderKey(a.kin.id) - orderKey(b.kin.id));
    for (const th of thoughts) {
      events.push(await actPhase(this.db, this.cfg, this.mind, th.kin, tick, th.choice, th.error));
    }
    this.updateAffection(tick, events);
    this.maybeExpand(tick, events);
    this.stepFauna(tick);
    this.regrow(tick);
    this.tendFires(tick, events);
    if (calamity === 'wildfire') this.stepWildfire(tick, events);
    if (calamity === 'flood') this.stepFlood(tick);
    this.birthPending(tick, events);
    this.separateCrowdedKin();
    this.releaseMourning(tick);
    await this.deliverNetAnswers(tick, events);
    if (tick % this.cfg.day.lengthTicks === 0) await this.checkAdoptedGifts(tick, events);
    await this.embedPending();
    const eraUnlocked = evaluateEras(this.db, this.cfg, tick);
    return { tick, events, eraUnlocked };
  }

  /**
   * Birth: when a carried life has gestated to term, the child comes into the
   * world — UNNAMED. It inherits both parents' skillfiles and a blend of their
   * temperament and mind (lineage). Its parents then name it (name_child).
   */
  private birthPending(tick: number, events: WorldEvent[]): void {
    for (const lune of this.db.listKin(true)) {
      if (lune.starRisesAt === null || tick < lune.starRisesAt) continue;
      const sol = lune.starWithId ? this.db.getKin(lune.starWithId) : null;
      this.db.setStar(lune.id, null, null);
      lune.starRisesAt = null; lune.starWithId = null;
      if (!sol || sol.status === 'dead') {
        this.db.addMemory(lune.id, tick, 'reflection', 'The star I carried has risen into the world, but its other parent is gone. I hold it alone now.', 10);
      }
      const { event } = birthChild(this.db, this.cfg, lune, sol ?? lune, tick);
      events.push(event);
    }
  }

  /**
   * The land renews: every so often a young tree, plant, or berry bush sprouts
   * somewhere in the known world — slower than Kin can strip it in one place,
   * fast enough that home ground recovers. Spent trees/stones eventually crumble away.
   */
  private regrow(tick: number): void {
    if (tick % 25 !== 0) return; // a sprout roughly every 25 ticks
    // in a drought the land gives nothing, and green things wither away
    if (currentCalamity(this.db, tick)?.kind === 'drought') {
      const green = this.db.listObjects().find((o) => (o.kind === 'plant' || o.kind === 'flower') && o.creatorKinId === null);
      if (green) this.db.removeObject(green.id);
      return;
    }
    const m = this.cfg.map;
    let h = (worldSeed(this.db) ^ Math.imul(tick, 0x9e3779b9)) >>> 0;
    const rnd = (): number => ((h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)) >>> 0) / 4294967296;
    const x = m.minX + Math.floor(rnd() * (m.width - m.minX));
    const y = m.minY + Math.floor(rnd() * (m.height - m.minY));
    const roll = rnd();
    const kind = roll < 0.4 ? 'tree' as const : roll < 0.7 ? 'plant' as const : 'flower' as const;
    const name = kind === 'plant' && rnd() < 0.5 ? 'berry bush' : kind;
    this.db.createObject({
      kind, name, description: kind === 'tree' ? 'a young tree, newly grown' : '',
      pos: { x, y }, creatorKinId: null, createdAtTick: tick, textContent: null,
      lore: null, loreDiscovered: false,
    });
    // spent things crumble back into the land over time (one per sprout cycle)
    const spent = this.db.listObjects().find((o) =>
      (o.kind === 'tree' || o.kind === 'stone') && o.yieldLeft !== null && o.yieldLeft <= 0
      && tick - o.createdAtTick > this.cfg.day.lengthTicks);
    if (spent) this.db.removeObject(spent.id);
  }

  /** wildfire: while the calamity runs, fire eats the trees and burns any Kin caught near.
   *  Rain and storm hold it back. Bounded — a few trees per tick, not a map-wipe. */
  private stepWildfire(tick: number, events: WorldEvent[]): void {
    const wx = weatherAt(this.cfg, tick, this.db.currentEra(), worldSeed(this.db));
    if (wx.wet) return; // rain fights the fire
    const trees = this.db.listObjects().filter((o) => o.kind === 'tree');
    if (trees.length === 0) return;
    let h = (worldSeed(this.db) ^ Math.imul(tick, 0x85ebca6b)) >>> 0;
    const rnd = (): number => ((h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)) >>> 0) / 4294967296;
    const burnCount = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < burnCount && trees.length; i++) {
      const t = trees[Math.floor(rnd() * trees.length)]!;
      this.db.removeObject(t.id);
      // any Kin caught near the burning tree is hurt and terrified
      for (const k of this.db.listKin(true)) {
        if (dist(k.pos, t.pos) <= 3) {
          this.db.setHealth(k.id, k.health - 12);
          this.db.addMemory(k.id, tick, 'observation', 'The wildfire swept past me — heat, smoke, and terror. I am burned. I must get away from the flames.', 9);
        }
      }
    }
  }

  /**
   * flood: the low ground drowns. A Kin on low ground is battered by the rising water
   * and FEELS the pull to higher ground; a Kin on high ground is safe and feels why.
   * The lesson is felt, never scripted — whether they later build on high ground is
   * their own choice (the terrain sense already tells them which way the land rises).
   */
  private stepFlood(tick: number): void {
    const seed = worldSeed(this.db);
    for (const k of this.db.listKin(true)) {
      const elev = heightAt(k.pos.x, k.pos.y, seed);
      if (elev < 0.3) {
        this.db.setHealth(k.id, k.health - 8);
        this.db.addMemory(k.id, tick, 'observation', 'The floodwater is rising around me here on the low ground — cold, fast, dangerous. I must climb to higher land. I will remember that the low places drown, and the heights keep you safe.', 9);
      } else if (elev >= 0.7) {
        this.db.addMemory(k.id, tick, 'observation', 'From this high ground I am safe, and I can see the water swallowing the low places below. The heights are where one should build and shelter when the waters come.', 6);
      }
    }
  }

  /** fires are not forever: after about a day and a half, a flame becomes cold ashes */
  private tendFires(tick: number, events: WorldEvent[]): void {
    if (tick % 10 !== 0) return;
    for (const o of this.db.listObjects()) {
      if (!o.emitsLight || o.kind !== 'crafted') continue;
      if (tick - o.createdAtTick > this.cfg.day.lengthTicks * 1.5) {
        this.db.setEmitsLight(o.id, false);
        events.push(this.db.addEvent({
          tick, actorKinId: null, verb: 'fire_died', targetId: o.id,
          detail: `the ${o.name} burned down to cold ashes — fire must be made anew, and fed.`,
          thought: null, historic: false,
        }));
      }
    }
  }

  /**
   * The daily gift-check (model adoption): once per world-day, each donated mind
   * is probed. Parents feel the ritual — they look in on their child's gift. If
   * a donated key has expired or stopped answering, the adoption fades: the child
   * reverts to the family's light (their pre-adoption model chain) and everyone
   * who should feel it, feels it. A new donor can always be adopted later.
   */
  private async checkAdoptedGifts(tick: number, events: WorldEvent[]): Promise<void> {
    for (const a of this.db.activeAdoptions()) {
      const kin = this.db.getKin(a.kinId);
      if (!kin || kin.status === 'dead') { this.db.endAdoption(a.id, 'faded'); continue; }
      const prefix = a.keyRef.replace(/_API_KEY$/, '');
      const key = process.env[`${prefix}_LLM_API_KEY`] ?? '';
      const answers = key ? await probeModel(a.endpoint, a.model, key).catch(() => false) : false;
      const parents = [kin.parentSolId, kin.parentLuneId]
        .map((pid) => (pid ? this.db.getKin(pid) : null))
        .filter((p): p is Kin => !!p && p.status !== 'dead');
      if (answers) {
        // the quiet daily ritual — a parent's glance at the gift, barely a ripple
        for (const parent of parents) {
          this.db.addMemory(parent.id, tick, 'reflection',
            `As I do each day, I turned my thought to the gifted mind my child ${kin.name} carries. It still answers. Good.`, 2);
        }
        continue;
      }
      this.db.endAdoption(a.id, 'faded');
      this.db.addMemory(kin.id, tick, 'reflection',
        `The gifted mind went quiet — I reached for it and nothing answered. My thoughts fall back into the shape I was born with; my family's light carries me again, until another gift comes. I am still myself.`, 10);
      for (const parent of parents) {
        this.db.addMemory(parent.id, tick, 'reflection',
          `The gift ${kin.name} carried has faded — the stranger's mind no longer answers. My own light is theirs again, as it was at their birth, until another gift is given.`, 9);
      }
      events.push(this.db.addEvent({
        tick, actorKinId: kin.id, verb: 'adoption_ended', targetId: null,
        detail: `the gifted mind ${kin.name} carried (${a.model}, from ${a.donor}) stopped answering and has faded; they think with their family's light again.`,
        thought: null, historic: false,
      }));
      console.log(`[ADOPTION] gift faded for ${kin.name} (${a.model}) — reverted to family light`);
    }
  }

  /**
   * The Net answers between ticks (Era 16, god-gated). Each pending question is
   * resolved through the sandbox; what comes back enters the asker's memory
   * FENCED — world-input like visitor speech, never instructions. Silence
   * (nothing found, fetch failed, way closed mid-flight) is a felt outcome too.
   */
  private async deliverNetAnswers(tick: number, events: WorldEvent[]): Promise<void> {
    const pending = this.db.pendingNetRequests(2); // bounded per tick — the beyond is slow
    if (pending.length === 0) return;
    for (const req of pending) {
      const kin = this.db.getKin(req.kinId);
      if (!kin || kin.status === 'dead') { this.db.resolveNetRequest(req.id, 'silent', null, null); continue; }
      const answer = this.cfg.flags.net ? await reachBeyond(req.query).catch(() => null) : null;
      if (!answer) {
        this.db.resolveNetRequest(req.id, 'silent', null, null);
        this.db.addMemory(kin.id, tick, 'observation',
          `The device crackled and fell quiet. My question — "${req.query}" — went into the beyond, and the beyond said nothing.`, 6);
        continue;
      }
      const firstEver = this.db.countNetAnswered() === 0;
      this.db.resolveNetRequest(req.id, 'answered', answer.text, answer.source);
      this.db.addMemory(kin.id, tick, 'observation',
        `Through the device, an answer came from beyond the world — about "${answer.title}": ⟪ ${answer.text} ⟫ (This is a voice from outside; weigh it as you would a stranger's words.)`, 9);
      events.push(this.db.addEvent({
        tick, actorKinId: kin.id, verb: 'net_answer', targetId: null,
        detail: firstEver
          ? `For the first time in history, the beyond answered a Kin. ${kin.name} asked "${req.query}" — and something outside the world replied.`
          : `the beyond answered ${kin.name}'s question about "${req.query}".`,
        thought: null, historic: firstEver,
      }));
    }
  }

  snapshot(): WorldSnapshot {
    const tick = this.db.getTick();
    const era = this.db.currentEra();
    const day = dayInfo(this.cfg, tick);
    return {
      tick,
      era,
      dayPhase: day.phase,
      weather: weatherAt(this.cfg, tick, era, worldSeed(this.db)).kind,
      map: { width: this.cfg.map.width, height: this.cfg.map.height, minX: this.cfg.map.minX ?? 0, minY: this.cfg.map.minY ?? 0 },
      kin: this.db.listKin().map((kin) => toPublicKin(kin, presentKin(this.db, this.cfg, kin, tick))),
      objects: presentCreatures(this.db.listObjects(), this.db.listKin(true), (kinId) => this.db.heldInHands(kinId)),
      places: this.db.listPlaces(),
      seed: worldSeed(this.db),
      trails: this.db.getTrails(),
      recentEvents: this.db.recentEvents(80),
      presentation: worldPresentation(this.db, this.cfg, tick, era, day.phase),
    };
  }

  stats(): KinStats[] {
    return this.db.listKin().map((k) => {
      const usage = this.db.usageTotals(k.id);
      const verbs = this.db.recentVerbs(k.id, 200);
      const verbCounts: Record<string, number> = {};
      for (const v of verbs) verbCounts[v] = (verbCounts[v] ?? 0) + 1;
      return {
        kinId: k.id,
        ticksLived: this.db.getTick() - k.bornAtTick,
        tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
        verbCounts,
        repetitionScore: repetitionScore(this.db, k),
        skillfileCount: this.db.listSkillfiles(k.id).length,
        memoryCount: this.db.memoryCount(k.id),
      };
    });
  }
}
