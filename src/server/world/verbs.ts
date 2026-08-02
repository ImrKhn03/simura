import { randomUUID } from 'node:crypto';
import type { WorldDB } from '../db.ts';
import type { WorldConfig } from '../config.ts';
import type { Position, ActionChoice, Gender, Kin, ShapePart, Verb } from '../../shared/types.ts';
import { ERA0_VERBS, ERA_VERBS, REPRODUCTION_VERBS } from '../../shared/types.ts';
import { clampPos, dist, dayInfo, ticksUntilDawn, weatherAt, worldSeed, lifeStage, professionOf, settlementAt } from './world.ts';
import { heightAt } from '../../shared/terrain.ts';
import { CARRY_LIMIT, CART_RE, CONTAINER_RE, carryCapacity } from './world.ts';
export { carryCapacity } from './world.ts';
import { oreInStone, pickTier, tierName, ORES } from './ores.ts';
import {
  generateBuildShape, generateCraftTemplate, isFunctionalStructure, parseBuildSpec, stagedMaterialBills, extensionMaterialBills,
  normalizeFreeformStructure, snapShapeColor, type MaterialCategory,
} from './construction.ts';
import { missingMaterialPhrase, selectAnyConstructionMaterials, selectConstructionMaterials } from './construction-materials.ts';
import { resolveKinMove } from './collision.ts';

export interface VerbResult {
  /** narrative outcome, becomes the event detail and the Kin's action memory */
  detail: string;
  targetId: string | null;
  ok: boolean;
  historic?: boolean;
  /** extra felt truth appended only to the actor's memory, not the public event */
  feltNote?: string;
  /** marks a memory that should be kept close (discoveries, matters of the heart) */
  important?: boolean;
  /** for speech: ids of Kin who actually heard it */
  heardBy?: string[];
}

const WANT_RE = /\b(i wish|we need|i want|if only|we should (make|build|have)|i need)\b/i;

export function availableVerbs(era: number, flags?: { reproduction: boolean }): Verb[] {
  const verbs = [...ERA0_VERBS];
  for (let e = 1; e <= era; e++) {
    verbs.push(...(ERA_VERBS[e] ?? []));
  }
  if (flags?.reproduction) verbs.push(...REPRODUCTION_VERBS);
  return verbs;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** how many things two hands can hold */
/** how much a container set down (or carried) can hold */
const CONTAINER_CAPACITY = 8;
const GARMENT_RE = /\b(cloth|garment|robe|cloak|tunic|coat|hat|cap|crown|hood|wreath|mask|veil|scarf|necklace|apron|dress|wrap|hide|fur|shawl|boots?|clothing)\b/i;
const METAL_RE = /\b(metal|iron|bronze|steel|copper|tin|silver|gold)\b/i;
const POWER_RE = /\b(generator|battery|dynamo|engine|cell)\b/i;
const POWERED_LIGHT_RE = /\b(flashlight|electric|bulb|lamp)\b/i;
const SIGNAL_RE = /\b(signal|antenna|tower|phone|transmitter|receiver)\b/i;
const SACRED_RE = /\b(temple|shrine|altar|sacred|sanctuary|chapel|monument)\b/i;
const AXE_RE = /\b(axe|hatchet)\b/i;
const PICK_RE = /\b(pick|pickaxe)\b/i;
const SHOVEL_RE = /\b(shovel|spade|hoe)\b/i;

/** the best tool in hand matching a pattern */
function toolInHand(db: WorldDB, kin: Kin, re: RegExp) {
  return db.heldInHands(kin.id).find((o) => re.test(o.name)) ?? null;
}

/** hands (2) + a carried container (+3, era 5+) + a cart within reach (+4, era 13+) */

/**
 * Sanitize a Kin-designed shape: bounded part count, clamped sizes/offsets,
 * valid hex colors. Their design, our physics. Returns null if unusable.
 */
export function sanitizeShape(raw: unknown, maxParts: number, maxExtent: number): ShapePart[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const clamp = (v: unknown, lo: number, hi: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
  };
  const parts: ShapePart[] = [];
  for (const p of raw.slice(0, maxParts)) {
    if (typeof p !== 'object' || p === null) continue;
    const q = p as Record<string, unknown>;
    const c = snapShapeColor(q.c);
    parts.push({
      x: clamp(q.x, -maxExtent, maxExtent),
      y: clamp(q.y, 0, maxExtent * 2),
      z: clamp(q.z, -maxExtent, maxExtent),
      w: clamp(q.w, 0.05, maxExtent), h: clamp(q.h, 0.05, maxExtent), d: clamp(q.d, 0.05, maxExtent),
      c,
    });
  }
  return parts.length > 0 ? parts : null;
}

/**
 * Forgiving object resolution: exact id → unique id prefix → a nearby thing
 * matching the given kind or name. Minds shouldn't fumble over UUIDs.
 */
function resolveObject(db: WorldDB, cfg: WorldConfig, kin: Kin, ref: string) {
  if (!ref) return null;
  const exact = db.getObject(ref);
  if (exact) return exact;
  const all = db.listObjects();
  const byPrefix = all.filter((o) => o.id.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0]!;
  const low = ref.toLowerCase().trim();
  // a name some Kin gave a thing is how minds actually refer to it
  const byGivenName = db.db.prepare(
    `SELECT object_id FROM named_things WHERE LOWER(given_name)=? ORDER BY id ASC LIMIT 1`)
    .get(low) as unknown as { object_id: string } | undefined;
  if (byGivenName) return db.getObject(byGivenName.object_id);
  const nearby = all
    .filter((o) => dist(o.pos, kin.pos) <= cfg.perceptionRadius
      && (o.kind.toLowerCase() === low || o.name.toLowerCase() === low))
    .sort((a, b) => {
      // an unnamed thing is what a curious mind means by "the plant"
      const an = db.objectGivenName(a.id) ? 1 : 0;
      const bn = db.objectGivenName(b.id) ? 1 : 0;
      return an - bn || dist(a.pos, kin.pos) - dist(b.pos, kin.pos);
    });
  return nearby[0] ?? null;
}

/** parent–child or sibling — lives too close in blood to bond */
function isCloseKin(a: Kin, b: Kin): boolean {
  if (a.parentSolId === b.id || a.parentLuneId === b.id) return true;
  if (b.parentSolId === a.id || b.parentLuneId === a.id) return true;
  const shareParent = (a.parentSolId !== null && a.parentSolId === b.parentSolId)
    || (a.parentLuneId !== null && a.parentLuneId === b.parentLuneId);
  return shareParent;
}


/** A too-far target should cost a stride, never a wasted turn: walk one bounded
 *  step toward it (colliding honestly) and report the new footing. */
function strideToward(db: WorldDB, cfg: WorldConfig, kin: Kin, target: Position): { at: Position; arrived: boolean } {
  const step = (from: number, to: number) => from + Math.max(-cfg.moveMaxPerTick, Math.min(cfg.moveMaxPerTick, to - from));
  const intended = clampPos(cfg, { x: step(kin.pos.x, target.x), y: step(kin.pos.y, target.y) });
  const others = db.listKin(true).filter((o) => o.id !== kin.id).map((o) => o.pos);
  const walked = resolveKinMove(kin.pos, intended, db.listCollisionObjects(kin.pos, intended), others);
  const next = { x: Math.round(walked.pos.x * 100) / 100, y: Math.round(walked.pos.y * 100) / 100 };
  if (dist(next, kin.pos) > 0.08) { db.moveKin(kin.id, next); kin.pos = next; }
  return { at: next, arrived: dist(target, next) <= cfg.craftReachRadius };
}

/**
 * Execute a chosen verb against world physics. Never throws for bad params —
 * failure is information the Kin feels ("the stone would not budge").
 */
export function executeVerb(
  db: WorldDB, cfg: WorldConfig, kin: Kin, tick: number, choice: ActionChoice,
): VerbResult {
  const p = choice.params ?? {};
  switch (choice.verb) {
    case 'move': {
      const target = clampPos(cfg, { x: Number(p.x ?? kin.pos.x), y: Number(p.y ?? kin.pos.y) });
      if (Number.isNaN(target.x) || Number.isNaN(target.y)) {
        return { detail: 'You meant to go somewhere, but your legs did not know where.', targetId: null, ok: false };
      }
      // Bounded speed: step at most moveMaxPerTick toward the target.
      const step = (from: number, to: number) =>
        from + Math.max(-cfg.moveMaxPerTick, Math.min(cfg.moveMaxPerTick, to - from));
      const intended = { x: step(kin.pos.x, target.x), y: step(kin.pos.y, target.y) };
      const others = db.listKin(true).filter((other) => other.id !== kin.id).map((other) => other.pos);
      const collision = resolveKinMove(kin.pos, intended, db.listCollisionObjects(kin.pos, intended), others);
      const next = { x: Math.round(collision.pos.x * 100) / 100, y: Math.round(collision.pos.y * 100) / 100 };
      if (collision.blocked && dist(next, kin.pos) < 0.08) {
        const thing = collision.obstacle === 'structure' ? 'the solid work before you'
          : collision.obstacle === 'kin' ? 'another of your Kin standing there' : `the ${collision.obstacle ?? 'obstacle'}`;
        return { detail: `${thing} bars the way; you stop short and must find an opening or pass around it.`, targetId: null, ok: false };
      }
      // pacing detector: many recent moves but no real distance covered = circling. Name it, so the mind can break out.
      const recent = db.db.prepare(
        `SELECT detail FROM events WHERE actor_kin_id=? AND verb='move' AND tick > ? ORDER BY id DESC LIMIT 6`)
        .all(kin.id, tick - 12) as unknown as { detail: string }[];
      if (recent.length >= 5) {
        const pts = recent.map((r) => /\((\d+), ?(\d+)\)/.exec(r.detail)).filter(Boolean)
          .map((m) => ({ x: Number(m![1]), y: Number(m![2]) }));
        if (pts.length >= 5) {
          const spanX = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
          const spanY = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
          if (spanX + spanY <= 4) {
            db.moveKin(kin.id, next); kin.pos = next;
            return {
              detail: `moved to (${next.x}, ${next.y}) — but you catch yourself: you have paced this same patch of ground over and over, going nowhere. Waiting for another, or turning back, only circles. If you mean to travel, fix on a FAR point and keep to it for many steps without turning; if you mean to stay, put your hands to something here instead.`,
              targetId: null, ok: true, important: true,
            };
          }
        }
      }
      db.moveKin(kin.id, next);
      kin.pos = next;
      return { detail: collision.blocked ? `moved onward until ${collision.obstacle === 'structure' ? 'solid walls' : `a ${collision.obstacle}`} turned your path aside` : `moved to (${next.x}, ${next.y})`, targetId: null, ok: true };
    }

    case 'observe': {
      const obj = resolveObject(db, cfg, kin, str(p.targetId));
      if (!obj) return { detail: 'You looked closely, but the thing was gone — or never there.', targetId: null, ok: false };
      if (dist(obj.pos, kin.pos) > cfg.perceptionRadius) {
        return { detail: 'It was too far away to see clearly.', targetId: obj.id, ok: false };
      }
      const givenName = str(p.name).trim();
      const desc = str(p.description).trim();
      const existingName = db.objectGivenName(obj.id);
      // A thing already known reveals nothing new — repetition is a felt dead end, not a reward.
      if (existingName) {
        return {
          detail: `looked again at "${existingName}", but you already know it well. Nothing new revealed itself — something untried is calling.`,
          targetId: obj.id, ok: false,
        };
      }
      // fauna, landmarks, and named nature show their own name; raw nature shows its kind
      const label = (obj.kind === 'landmark' || obj.kind === 'fish' || obj.kind === 'deer' || obj.kind === 'fowl' || obj.name !== obj.kind)
        ? obj.name : obj.kind;
      let detail = `observed the ${label}${desc ? `: ${desc}` : ''}`;
      let historic = false;
      if (givenName) {
        const before = db.namedThingCount();
        db.nameThing(kin.id, obj.id, givenName, tick);
        detail = `named the ${label} "${givenName}"${desc ? ` — ${desc}` : ''}`;
        historic = before === 0; // the first naming in history
      }
      // close observation reveals the thing's hidden truth — real, teachable knowledge
      let important = false;
      if (obj.lore && !obj.loreDiscovered) {
        db.markLoreDiscovered(obj.id);
        detail += ` You discover something true: ${obj.lore}`;
        important = true;
        if (obj.kind === 'landmark') historic = true; // finding a landmark enters history
      }
      return { detail, targetId: obj.id, ok: true, historic, important };
    }

    case 'gather': {
      const obj = resolveObject(db, cfg, kin, str(p.targetId));
      if (!obj) {
        // was it taken this very moment? two minds can reach for one thing at once
        const contested = (db.db.prepare(
          `SELECT COUNT(*) c FROM events WHERE tick=? AND verb IN ('gather','carry') AND actor_kin_id != ?`)
          .get(tick, kin.id) as unknown as { c: number }).c > 0;
        return {
          detail: contested
            ? 'you reached out — but another hand had closed on it in the same moment.'
            : 'You reached out, but found nothing where you thought it was.',
          targetId: null, ok: false,
        };
      }
      if (dist(obj.pos, kin.pos) > cfg.craftReachRadius) {
        // near-misses cost a stride, not a turn; a far target stays a conscious journey
        if (dist(obj.pos, kin.pos) <= cfg.craftReachRadius + cfg.moveMaxPerTick * 2) {
          const stride = strideToward(db, cfg, kin, obj.pos);
          return { detail: `it was just out of reach — you strode over and stand now at (${stride.at.x},${stride.at.y}). ${stride.arrived ? 'It is within reach — reach for it again.' : 'One more stride should do it.'}`, targetId: obj.id, ok: false };
        }
        return { detail: `it is too far to reach — you would have to travel to (${obj.pos.x},${obj.pos.y}) first (move there deliberately if it is worth the walk).`, targetId: obj.id, ok: false };
      }
      // a PREDATOR can be HUNTED — but only with a real weapon. Bare-handed, the hunt turns
      // on the hunter: you are mauled, not the beast. Slaying one yields a pelt and meat.
      if (obj.kind === 'predator') {
        const armed = db.heldInHands(kin.id).some((h) => /\b(spear|bow|arrow|axe|blade|knife|club|sling)\b/i.test(h.name));
        if (!armed) {
          db.setHealth(kin.id, kin.health - 12);
          return { detail: `you lunged at the ${obj.name} bare-handed — and it turned on you. You are hurt and driven back; a wolf is not taken without a weapon.`, targetId: obj.id, ok: false };
        }
        db.removeObject(obj.id);
        const firstHunt = db.countEventsLike('gather', '%brought down%') === 0;
        db.createObject({ kind: 'gathered', name: 'a pelt', description: `the hide of a ${obj.name} brought down by ${kin.name}`, pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        const meat = db.createObject({ kind: 'gathered', name: 'wild meat', description: `from a ${obj.name}`, pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        return { detail: `brought down the ${obj.name} with your weapon — a pelt and meat are yours, and the danger it posed is ended`, targetId: meat.id, ok: true, historic: firstHunt, important: true };
      }
      // live creatures: catchable only with the right tool — bare hands fail as they flee
      if (obj.kind === 'fish' || obj.kind === 'deer' || obj.kind === 'fowl') {
        const held = db.heldInHands(kin.id);
        const has = (re: RegExp) => held.some((h) => re.test(h.name) || re.test(h.description));
        const spec = obj.kind === 'fish'
          ? { tool: /\b(spear|net|rod|hook|line|trap|harpoon)\b/i, need: 'a spear, net, hook, or line', food: 'fresh fish' }
          : obj.kind === 'deer'
            ? { tool: /\b(spear|bow|arrow|trap|snare|sling)\b/i, need: 'a spear, bow, or snare', food: 'venison' }
            : { tool: /\b(bow|arrow|net|trap|snare|sling)\b/i, need: 'a bow, net, or snare', food: 'fowl meat' };
        if (!has(spec.tool)) {
          return { detail: `the ${obj.kind} bolts before your hands can close — you would need ${spec.need} to take it.`, targetId: obj.id, ok: false };
        }
        db.removeObject(obj.id);
        const firstCatch = db.countEventsLike('gather', '%caught%') === 0;
        const food = db.createObject({
          kind: 'gathered', name: spec.food, description: `taken by ${kin.name} from ${obj.kind === 'fish' ? 'the water' : 'the land'}`,
          pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
        });
        return { detail: `caught the ${obj.kind} — ${spec.food} is yours`, targetId: food.id, ok: true, historic: firstCatch, important: true };
      }
      if (obj.kind === 'landmark') {
        return { detail: 'your hands stop on their own — this is too old and too whole to break a piece from.', targetId: obj.id, ok: false };
      }
      if (obj.kind === 'structure' || obj.kind === 'text' || obj.kind === 'crafted' || obj.kind === 'gathered') {
        return { detail: 'that is not for pulling apart — but you could carry it.', targetId: obj.id, ok: false };
      }
      if (obj.carriedBy && obj.carriedBy !== kin.id) {
        const holder = db.getKin(obj.carriedBy);
        return { detail: `it is in ${holder?.name ?? 'someone'}'s hands, not yours.`, targetId: obj.id, ok: false };
      }

      // tools change what hands can do: an axe fells, a pick breaks, a shovel digs
      const axe = toolInHand(db, kin, AXE_RE);
      if (axe && obj.kind === 'tree') {
        db.removeObject(obj.id);
        db.createObject({ kind: 'gathered', name: 'felled logs', description: `a tree brought down by ${kin.name}'s ${axe.name}`,
          pos: { ...obj.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        db.createObject({ kind: 'gathered', name: 'dry branches', description: 'from the felled tree',
          pos: { ...obj.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        const firstFelling = db.countEventsLike('gather', '%felled the tree%') === 0;
        return { detail: `swung the ${axe.name} and felled the tree — logs and dry branches lie where it stood`,
          targetId: null, ok: true, historic: firstFelling, important: true };
      }
      const pick = toolInHand(db, kin, PICK_RE);
      if (pick && obj.kind === 'stone') {
        // Minecraft mining theory: what a rock holds depends on WHERE it is, and a
        // soft pick cannot crack a hard vein — tool tiers gate the ore ladder
        const nearCave = db.listObjects().some((o) => /cave/i.test(o.name) && dist(o.pos, obj.pos) <= 5);
        const elevation = heightAt(obj.pos.x, obj.pos.y, worldSeed(db));
        const ore = oreInStone(obj, { nearCave, elevation, seed: worldSeed(db) });
        const tier = pickTier(pick.name);
        if (ore && tier < ore.tier) {
          return {
            detail: `you strike the vein with ${pickTier(pick.name) <= 1 ? 'your stone pick' : `the ${pick.name}`}, but it only sparks and chips — this ${ore.key} needs ${tierName(ore.tier)} pick to break. Work a softer metal first, and forge a harder tool.`,
            targetId: obj.id, ok: false,
          };
        }
        db.removeObject(obj.id);
        const firstOre = ore && db.countObjectsNamedLike(`%${ore.key}%`) === 0;
        if (ore) {
          for (let i = 0; i < 2; i++) {
            db.createObject({ kind: 'gathered', name: ore.key, description: `struck loose by ${kin.name}'s ${pick.name}`,
              pos: { ...obj.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: ore.lore, loreDiscovered: true });
          }
          return {
            detail: `broke the vein with the ${pick.name} — ${ore.key} lies free. ${ore.lore}`,
            targetId: null, ok: true, important: true, historic: !!firstOre,
          };
        }
        for (let i = 0; i < 2; i++) {
          db.createObject({ kind: 'gathered', name: 'broken stone', description: `struck loose by ${kin.name}'s ${pick.name}`,
            pos: { ...obj.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        }
        return { detail: `broke the stone apart with the ${pick.name} — workable pieces lie free, but no metal in this rock`, targetId: null, ok: true, important: true };
      }
      const shovel = toolInHand(db, kin, SHOVEL_RE);
      if (shovel && obj.kind === 'water') {
        db.createObject({ kind: 'gathered', name: 'clay lump', description: `dug from the bank with ${kin.name}'s ${shovel.name}`,
          pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false });
        return { detail: `dug into the soft bank with the ${shovel.name} and lifted out a lump of clay`,
          targetId: obj.id, ok: true, important: true };
      }

      // depletion is real: rooted things give only so much before they are spent
      if (obj.kind !== 'water' && obj.yieldLeft !== null && obj.yieldLeft <= 0) {
        return { detail: `the ${obj.kind} has given all it had — a spent ${obj.kind === 'tree' ? 'stump' : 'remnant'} with nothing more to take. The land renews elsewhere; look for younger growth.`, targetId: obj.id, ok: false };
      }
      // food sources name their own gift when the gatherer doesn't
      const foodDefault = /berr/i.test(obj.name) ? 'a handful of berries'
        : /mushroom/i.test(obj.name) ? 'a cluster of mushrooms'
        : /reed/i.test(obj.name) ? 'cut reeds' : null;
      const what = str(p.what, foodDefault ?? `a piece of the ${obj.kind}`).trim() || `a piece of the ${obj.kind}`;
      const wasFirst = db.countObjectsOfKind('gathered') === 0;
      const piece = db.createObject({
        kind: 'gathered', name: what, description: `taken from the ${obj.name === obj.kind ? obj.kind : obj.name} at (${obj.pos.x},${obj.pos.y})`,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null,
        lore: null, loreDiscovered: false, carriedBy: db.heldInHands(kin.id).length < 2 ? kin.id : null,
      });
      let spentNote = '';
      if (obj.kind !== 'water') {
        const left = (obj.yieldLeft ?? 4) - 1;
        db.setYieldLeft(obj.id, left);
        if (left <= 0) {
          if (obj.kind === 'plant' || obj.kind === 'flower') { db.removeObject(obj.id); spentNote = ` The ${obj.name} is used up — nothing of it remains.`; }
          else spentNote = ` The ${obj.kind} is spent now — it will give no more.`;
        }
      }
      const known = obj.lore && obj.loreDiscovered ? ` You already know its truth: ${obj.lore}` : '';
      return {
        detail: `gathered ${what} from the ${obj.name === obj.kind ? obj.kind : obj.name} — it is in your hands now, real and examinable.${known}${spentNote}`,
        targetId: piece.id, ok: true, historic: wasFirst, important: true,
      };
    }

    case 'eat': {
      // hunger is real physics: food restores fullness and is consumed by eating
      const FOOD_RE = /\b(fish|venison|meat|berr\w*|fruit|root|bread|stew|mushroom|egg|nut|grain|honey|meal|food)\b/i;
      const held = db.heldInHands(kin.id);
      const ref = str(p.targetId).toLowerCase().trim();
      const candidates = [
        ...held,
        ...db.listObjects().filter((o) => !o.carriedBy && !o.storedIn && o.kind === 'gathered' && dist(o.pos, kin.pos) <= cfg.craftReachRadius),
      ].filter((o) => FOOD_RE.test(o.name));
      const food = ref
        ? candidates.find((o) => o.id === ref || o.id.startsWith(ref) || o.name.toLowerCase().includes(ref)) ?? null
        : candidates[0] ?? null;
      if (!food) {
        return { detail: 'there is nothing to eat within reach — berries grow on bushes, fish swim in the water, roots hide in the ground. Gather or hunt first.', targetId: null, ok: false };
      }
      const fireNear = db.listObjects().some((o) => o.emitsLight && dist(o.pos, kin.pos) <= 3);
      const meaty = /\b(fish|venison|meat|fowl|egg)\b/i.test(food.name);
      const nourish = meaty && fireNear ? 70 : meaty ? 40 : 45;
      db.removeObject(food.id);
      db.setFullness(kin.id, kin.fullness + nourish);
      kin.fullness = Math.min(100, kin.fullness + nourish);
      const firstMeal = db.countEventsLike('eat', '%ate%') === 0;
      const fireNote = meaty && fireNear ? ', warmed over the fire,' : '';
      return {
        detail: `ate the ${food.name}${fireNote} and warmth spread through you — the body eases, the mind clears. (fullness ${Math.round(kin.fullness)}/100)`,
        targetId: null, ok: true, historic: firstMeal, important: true,
      };
    }

    case 'cook': {
      // fire transforms raw food into something better and longer-keeping
      const RAW_RE = /\b(fish|venison|meat|fowl|egg|root|mushroom|berr\w*|grain)\b/i;
      const fire = db.listObjects().find((o) => o.emitsLight && dist(o.pos, kin.pos) <= 3);
      if (!fire) return { detail: 'to cook you need a fire burning close by. Make one first (craft a campfire), then cook over it.', targetId: null, ok: false };
      const held = db.heldInHands(kin.id);
      const rawRef = str(p.targetId).toLowerCase().trim();
      const raw = [...held, ...db.listObjects().filter((o) => !o.carriedBy && !o.storedIn && o.kind === 'gathered' && dist(o.pos, kin.pos) <= cfg.craftReachRadius)]
        .filter((o) => RAW_RE.test(o.name) && !/cooked|roast|stew/i.test(o.name))
        .find((o) => !rawRef || o.id.startsWith(rawRef) || o.name.toLowerCase().includes(rawRef));
      if (!raw) return { detail: 'you have no raw food within reach to cook — catch or gather something first.', targetId: null, ok: false };
      db.removeObject(raw.id);
      const cookedName = `cooked ${raw.name.replace(/^(a|the|fresh|raw)\s+/i, '')}`;
      const cooked = db.createObject({
        kind: 'gathered', name: cookedName, description: `${raw.name}, cooked over ${kin.name}'s fire — nourishing and slow to spoil`,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
        carriedBy: held.some((h) => h.id === raw.id) ? kin.id : null,
      });
      const firstCook = db.countEventsLike('cook', '%cooked%') === 0;
      return { detail: `cooked ${raw.name} over the fire into ${cookedName} — the smell alone eases the body`, targetId: cooked.id, ok: true, historic: firstCook, important: true };
    }

    case 'bury': {
      // the dead are laid to rest: a grave rises, grief becomes a place
      const ref = str(p.targetId ?? p.toKinName).toLowerCase().trim();
      const dead = db.listKin().filter((k) => k.status === 'dead')
        .find((k) => !ref || k.name.toLowerCase() === ref || k.id.startsWith(ref));
      if (!dead) return { detail: 'there is no one here to lay to rest.', targetId: null, ok: false };
      if (dist(dead.pos, kin.pos) > cfg.craftReachRadius + 1) {
        return { detail: `${dead.name}'s body lies at (${dead.pos.x},${dead.pos.y}); you must go to them to lay them to rest.`, targetId: null, ok: false };
      }
      if (db.listObjects().some((o) => o.kind === 'structure' && /grave|rest|barrow|cairn|tomb/i.test(o.name) && dist(o.pos, dead.pos) <= 1)) {
        return { detail: `${dead.name} already lies in rest here.`, targetId: null, ok: false };
      }
      const grave = db.createObject({
        kind: 'structure', name: `${dead.name}'s rest`, description: `where ${dead.name} was laid to rest by ${kin.name}`,
        pos: { ...dead.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
        shape: [{ x: 0, y: 0, z: 0, w: 0.9, h: 0.15, d: 0.6, c: '#6b6f75' }, { x: 0, y: 0.15, z: -0.15, w: 0.35, h: 0.7, d: 0.12, c: '#8b93a1' }],
      });
      const firstBurial = db.countEventsLike('bury', '%laid%') === 0;
      for (const other of db.listKin(true)) {
        if (other.id !== kin.id) db.addMemory(other.id, tick, 'observation', `${kin.name} laid ${dead.name} to rest. There is a place now where ${dead.name} lies.`, 8);
      }
      return { detail: `laid ${dead.name} to rest — a quiet grave marks the ground, and the living can come here to remember`, targetId: grave.id, ok: true, historic: firstBurial, important: true };
    }

    case 'name_child': {
      // a parent gives their own child a name, instead of the name the world gave
      const ref = str(p.targetId ?? p.toKinName).toLowerCase().trim();
      const newName = str(p.name).trim().slice(0, 24);
      if (!newName) return { detail: 'you would name the child, but no name came to you.', targetId: null, ok: false };
      const child = db.listKin(true).find((k) => (k.parentSolId === kin.id || k.parentLuneId === kin.id)
        && (!ref || k.name.toLowerCase() === ref || k.id.startsWith(ref)));
      if (!child) return { detail: 'you have no child here to name.', targetId: null, ok: false };
      if (tick - child.bornAtTick > cfg.day.lengthTicks * 2) {
        return { detail: `${child.name} has carried their name too long now for it to change — a name grows into its bearer.`, targetId: child.id, ok: false };
      }
      const oldName = child.name;
      db.renameKin(child.id, newName);
      db.addMemory(child.id, tick, 'reflection', `My parent ${kin.name} gave me my name: ${newName}. It is mine now, chosen by one who loves me — not the world.`, 9);
      const firstNaming = db.countEventsLike('name_child', '%named their child%') === 0;
      return { detail: `named their child "${newName}"${oldName !== newName ? ` (once called ${oldName})` : ''} — a name given in love`, targetId: child.id, ok: true, historic: firstNaming, important: true };
    }

    case 'tame': {
      // patience with a fed creature makes it kept, not caught — the start of herding
      const creature = db.listObjects().find((o) => (o.kind === 'fowl' || o.kind === 'deer' || o.kind === 'fish')
        && dist(o.pos, kin.pos) <= cfg.craftReachRadius);
      if (!creature) return { detail: 'no wild creature is close enough to gentle. Approach one slowly, with food at hand.', targetId: null, ok: false };
      if (creature.kind === 'fish') return { detail: 'a fish cannot be kept on land — it is the fowl and the deer that can be gentled.', targetId: creature.id, ok: false };
      const food = db.heldInHands(kin.id).some((h) => /berr|grain|root|seed|nut|meal|food/i.test(h.name));
      if (!food) return { detail: `the ${creature.kind} watches you, wary. Without food in hand to offer, it will not let you near.`, targetId: creature.id, ok: false };
      db.removeObject(creature.id);
      const kept = db.createObject({
        kind: creature.kind, name: `a kept ${creature.kind}`, description: `gentled by ${kin.name}; it stays near now, and gives ${creature.kind === 'fowl' ? 'eggs' : 'milk and young'}`,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
      });
      const firstTame = db.countEventsLike('tame', '%gentled%') === 0;
      return { detail: `gentled a wild ${creature.kind} with food and patience — it is kept now, the first of a herd`, targetId: kept.id, ok: true, historic: firstTame, important: true };
    }

    case 'ritual': {
      // a gathering for shared meaning — the seed of religion, festival, and law-as-ceremony
      const meaning = str(p.meaning ?? p.message).trim();
      if (!meaning) return { detail: 'you moved to begin a rite, but its meaning would not form.', targetId: null, ok: false };
      const here = db.listPlaces().find((pl) => dist(pl.pos, kin.pos) <= 3);
      const templeNear = db.listObjects().some((o) => isFunctionalStructure(o) && SACRED_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      const kinNear = db.listKin(true).filter((k) => k.id !== kin.id && dist(k.pos, kin.pos) <= cfg.speechRadius);
      // a rite at a NAMED PLACE with a crowd (3+ together) is a FESTIVAL — communal joy,
      // remembered, that draws a people together and warms every bond present
      const isFestival = !!here && kinNear.length >= 2;
      const firstRitual = db.countEventsLike('ritual', '%held a rite%') === 0;
      const firstFestival = isFestival && db.countEventsLike('ritual', '%a festival%') === 0;
      for (const k of kinNear) {
        db.addMemory(k.id, tick, 'observation',
          isFestival
            ? `A festival at ${here!.name}: ${kin.name} led us — "${meaning.slice(0, 140)}". We were many, together, and something joyful and shared rose among us. This is a day to remember.`
            : `${kin.name} held a rite${here ? ` at ${here.name}` : ' here'}${templeNear ? ', at a sacred place' : ''}: "${meaning.slice(0, 150)}". Something shared passed between us — more than words.`, isFestival ? 9 : 8);
        db.addAffection(kin.id, k.id, isFestival ? cfg.affection.speechGain * 2 : cfg.affection.speechGain);
      }
      return {
        detail: isFestival
          ? `led a festival at ${here!.name} with ${kinNear.map((k) => k.name).join(', ')}: "${meaning.slice(0, 150)}" — a day the people will remember`
          : `held a rite${here ? ` at ${here.name}` : ''}${templeNear ? ', at a sacred place' : ''}${kinNear.length ? ` with ${kinNear.map((k) => k.name).join(', ')}` : ' alone'}: "${meaning.slice(0, 160)}"`,
        targetId: null, ok: true, historic: firstRitual || firstFestival, important: kinNear.length > 0,
      };
    }

    case 'play': {
      // games and play — how the young bond and the weary lighten; joy for its own sake
      const others = db.listKin(true).filter((k) => k.id !== kin.id && dist(k.pos, kin.pos) <= cfg.speechRadius);
      if (others.length === 0) return { detail: 'you feel like play, but there is no one near to play with.', targetId: null, ok: false };
      const what = str(p.what ?? p.game).trim();
      for (const k of others) {
        db.addAffection(kin.id, k.id, cfg.affection.speechGain);
        db.addMemory(k.id, tick, 'observation', `${kin.name} and I played${what ? ` — ${what}` : ' together'}. For a while there was nothing but the game and the laughing. It is good to be young, or to feel young.`, 5);
      }
      const firstPlay = db.countEventsLike('play', '%played%') === 0;
      return { detail: `played${what ? ` (${what})` : ''} with ${others.map((k) => k.name).join(', ')} — joy for its own sake`, targetId: null, ok: true, historic: firstPlay, important: true };
    }

    case 'dance': {
      // movement as art and feeling — solo or shared; at a named place with a crowd, a festival
      const move = str(p.what ?? p.message).trim();
      const here = db.listPlaces().find((pl) => dist(pl.pos, kin.pos) <= 3);
      const watchers = db.listKin(true).filter((k) => k.id !== kin.id && dist(k.pos, kin.pos) <= cfg.speechRadius);
      const isFestival = !!here && watchers.length >= 2;
      for (const k of watchers) {
        db.addAffection(kin.id, k.id, cfg.affection.speechGain);
        db.addMemory(k.id, tick, 'observation', `${kin.name} danced${here ? ` at ${here.name}` : ''}${move ? ` — ${move}` : ''}. ${isFestival ? 'We had gathered, and the dancing turned it into a festival — a shared, wordless joy.' : 'It stirred something in me, wordless and glad.'}`, isFestival ? 9 : 6);
      }
      const firstDance = db.countEventsLike('dance', '%danced%') === 0;
      return {
        detail: `danced${here ? ` at ${here.name}` : ''}${move ? `: ${move}` : ''}${watchers.length ? `, and ${watchers.map((k) => k.name).join(', ')} felt it` : ' alone under the sky'}${isFestival ? ' — it became a festival' : ''}`,
        targetId: null, ok: true, historic: firstDance, important: watchers.length > 0,
      };
    }

    case 'carry': {
      const obj = resolveObject(db, cfg, kin, str(p.targetId));
      if (!obj) return { detail: 'You reached to pick something up, but could not find it.', targetId: null, ok: false };
      if (obj.kind === 'tree' || obj.kind === 'stone' || obj.kind === 'water' || obj.kind === 'plant' || obj.kind === 'flower' || obj.kind === 'landmark') {
        return { detail: `the ${obj.kind === 'landmark' ? obj.name : obj.kind} is rooted in the world — gather a piece of it instead.`, targetId: obj.id, ok: false };
      }
      if (obj.kind === 'fish' || obj.kind === 'deer' || obj.kind === 'fowl' || obj.kind === 'predator') {
        return { detail: `the ${obj.name} is a living creature — it will not be simply picked up. Catch or hunt it, or (if it can be gentled) tame it.`, targetId: obj.id, ok: false };
      }
      if (obj.kind === 'structure') {
        return { detail: 'a structure cannot be lifted; it belongs to the ground it stands on.', targetId: obj.id, ok: false };
      }
      if (obj.carriedBy === kin.id) return { detail: `you already hold "${obj.name}".`, targetId: obj.id, ok: false };
      if (obj.carriedBy) {
        const holder = db.getKin(obj.carriedBy);
        return { detail: `"${obj.name}" is in ${holder?.name ?? 'someone'}'s hands.`, targetId: obj.id, ok: false };
      }
      if (db.heldInHands(kin.id).length >= carryCapacity(db, kin, db.currentEra())) {
        return { detail: 'your hands are full — you must drop something first (or drop it INTO a container to keep it).', targetId: obj.id, ok: false };
      }
      // taking something OUT of a container: the container must be within reach
      if (obj.storedIn) {
        const container = db.getObject(obj.storedIn);
        const containerNear = container && (container.carriedBy === kin.id
          || (!container.carriedBy && dist(container.pos, kin.pos) <= cfg.craftReachRadius));
        if (!containerNear) {
          return { detail: `"${obj.name}" is kept in ${container ? `the ${container.name}` : 'a container'}, and that is not within reach.`, targetId: obj.id, ok: false };
        }
        db.setStored(obj.id, null, kin.pos);
        db.setCarried(obj.id, kin.id, kin.pos);
        return { detail: `took "${obj.name}" out of the ${container.name} — it is in your hands now`, targetId: obj.id, ok: true };
      }
      if (dist(obj.pos, kin.pos) > cfg.craftReachRadius) {
        if (dist(obj.pos, kin.pos) <= cfg.craftReachRadius + cfg.moveMaxPerTick * 2) {
          const stride = strideToward(db, cfg, kin, obj.pos);
          return { detail: `"${obj.name}" was just out of reach — you strode over and stand now at (${stride.at.x},${stride.at.y}). ${stride.arrived ? 'It is within reach — reach for it again.' : 'One more stride should do it.'}`, targetId: obj.id, ok: false };
        }
        return { detail: `"${obj.name}" is out of reach — it lies at (${obj.pos.x},${obj.pos.y}); travel there deliberately if it is worth the walk.`, targetId: obj.id, ok: false };
      }
      db.setCarried(obj.id, kin.id, kin.pos);
      // THEFT is real by physics: taking a MADE thing that a living other shaped —
      // one not family, not bonded — is a wrong the maker feels. No one is stopped
      // (property is only custom), but the taking sours the bond → the seed of dispute & law.
      let tookNote = '';
      if (obj.kind === 'crafted' && obj.creatorKinId && obj.creatorKinId !== kin.id) {
        const maker = db.getKin(obj.creatorKinId);
        const sameCouple = !!kin.coupleId && kin.coupleId === maker?.coupleId;
        if (maker && maker.status !== 'dead' && !isCloseKin(kin, maker) && !sameCouple) {
          db.addMemory(maker.id, tick, 'observation', `${kin.name} took "${obj.name}" — a thing these hands made. It was not given; it was taken. Something in me hardens toward them.`, 8);
          db.addAffection(maker.id, kin.id, -Math.round(cfg.affection.friend * 0.5), -100);
          // JUSTICE begins as WITNESS: any Kin who sees the taking remembers it, and the
          // thief's name is stained among them — social punishment, emergent, not policed.
          const witnesses = db.listKin(true).filter((w) => w.id !== kin.id && w.id !== maker.id && dist(w.pos, kin.pos) <= cfg.perceptionRadius);
          for (const w of witnesses) {
            db.addMemory(w.id, tick, 'observation', `I saw ${kin.name} take "${obj.name}" that ${maker.name} had made — taken, not given. I will remember this of them.`, 7);
            db.addAffection(w.id, kin.id, -Math.round(cfg.affection.friend * 0.2), -100);
          }
          db.addEvent({ tick, actorKinId: kin.id, verb: 'theft', targetId: maker.id, detail: `${kin.name} took "${obj.name}" from ${maker.name} — taken, not given.`, thought: null, historic: false });
          tookNote = ' — but it was made by another\'s hands, and eyes may be watching; taking what was not given may cost your good name';
        }
      }
      return { detail: `picked up "${obj.name}" — it goes where you go now${tookNote}`, targetId: obj.id, ok: true };
    }

    case 'drop': {
      const held = db.heldInHands(kin.id);
      if (held.length === 0) {
        const fails = (db.db.prepare(
          `SELECT COUNT(*) c FROM events WHERE actor_kin_id=? AND verb='drop' AND tick > ? AND detail LIKE 'your hands are already empty%'`)
          .get(kin.id, tick - 8) as unknown as { c: number }).c;
        const nag = fails >= 2 ? ` You have tried this ${fails + 1} times running — there is NOTHING in your hands. Turn to another act: gather something, move somewhere, craft, or observe.` : '';
        return { detail: `your hands are already empty.${nag}`, targetId: null, ok: false };
      }
      const ref = str(p.targetId).toLowerCase().trim();
      const obj = ref
        ? held.find((o) => o.id === ref || o.id.startsWith(ref) || o.name.toLowerCase() === ref) ?? null
        : held[0]!;
      if (!obj) return { detail: 'you are not holding that.', targetId: null, ok: false };
      // storage is real physics: drop INTO a container and the thing is kept, not strewn
      const intoRef = str(p.into).toLowerCase().trim();
      if (intoRef) {
        const container = db.listObjects().find((o) => o.id !== obj.id
          && (o.kind === 'crafted' || o.kind === 'gathered') && CONTAINER_RE.test(o.name)
          && (o.carriedBy === kin.id || (!o.carriedBy && !o.storedIn && dist(o.pos, kin.pos) <= cfg.craftReachRadius))
          && (o.id === intoRef || o.id.startsWith(intoRef) || o.name.toLowerCase().includes(intoRef)));
        if (!container) {
          // failure must teach: name where a matching container actually IS
          const anywhere = db.listObjects().find((o) => o.id !== obj.id && (o.kind === 'crafted' || o.kind === 'gathered')
            && CONTAINER_RE.test(o.name) && !o.storedIn
            && (o.id === intoRef || o.id.startsWith(intoRef) || o.name.toLowerCase().includes(intoRef)));
          const hint = anywhere
            ? (anywhere.carriedBy
              ? `your "${anywhere.name}" is being carried by ${db.getKin(anywhere.carriedBy)?.name ?? 'someone'}`
              : `your "${anywhere.name}" lies at (${anywhere.pos.x},${anywhere.pos.y}) — walk to it first`)
            : 'no such container exists anywhere — craft one, or name one you truly have';
          const failures = (db.db.prepare(
            `SELECT COUNT(*) c FROM events WHERE actor_kin_id=? AND verb='drop' AND tick > ? AND detail LIKE '%no container%'`)
            .get(kin.id, tick - 8) as unknown as { c: number }).c;
          const nag = failures >= 2 ? ` You have now failed this ${failures + 1} times running — STOP repeating it. Either walk to the container, set the thing on the bare ground (drop without "into"), or turn to another act entirely.` : '';
          return { detail: `no container by that name is within reach to put it in; ${hint}.${nag}`, targetId: null, ok: false };
        }
        const contents = db.storedInContainer(container.id);
        if (contents.length >= CONTAINER_CAPACITY) {
          return { detail: `the ${container.name} is full — it holds ${contents.length} things already.`, targetId: container.id, ok: false };
        }
        db.setStored(obj.id, container.id, container.pos);
        return {
          detail: `put "${obj.name}" into the ${container.name} (${contents.length + 1} thing${contents.length ? 's' : ''} kept there now). Your hands are free; the thing is safe until taken out.`,
          targetId: container.id, ok: true,
        };
      }
      db.setCarried(obj.id, null, kin.pos);
      return { detail: `set down "${obj.name}" at (${kin.pos.x},${kin.pos.y})`, targetId: obj.id, ok: true };
    }

    case 'speak': {
      const message = str(p.message).trim();
      if (!message) return { detail: 'You opened your mouth, but no words came.', targetId: null, ok: false };
      // saying the same thing again teaches no one anything — a felt dead end, like circling a known stone
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 12).join(' ');
      const mineRecent = db.db.prepare(
        `SELECT detail FROM events WHERE actor_kin_id=? AND verb='speak' AND tick > ? ORDER BY id DESC LIMIT 4`)
        .all(kin.id, tick - 20) as unknown as { detail: string }[];
      if (mineRecent.some((r) => norm(r.detail) === norm(message))) {
        return {
          detail: 'you began to say it again — but the words are already spoken and already heard. Repeating them changes nothing. Act, or say something genuinely new.',
          targetId: null, ok: false,
        };
      }
      if (WANT_RE.test(message)) db.logWant(kin.id, tick, message);
      // the speaker feels whether anyone was near enough to hear
      const listeners = db.listKin(true)
        .filter((k) => k.id !== kin.id && dist(k.pos, kin.pos) <= cfg.speechRadius);
      const feltNote = listeners.length
        ? `(${listeners.map((l) => l.name).join(' and ')} ${listeners.length === 1 ? 'was' : 'were'} near enough to hear you.)`
        : '(Your words drifted across empty ground — no one was near enough to hear.)';
      return { detail: message, targetId: null, ok: true, feltNote, heardBy: listeners.map((l) => l.id) };
    }

    case 'give': {
      const held = db.heldInHands(kin.id);
      if (held.length === 0) return { detail: 'your hands are empty — there is nothing to give.', targetId: null, ok: false };
      const target = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.toKinName).toLowerCase().trim());
      if (!target) return { detail: 'there was no one by that name to give to.', targetId: null, ok: false };
      if (dist(target.pos, kin.pos) > cfg.teachRadius) {
        return { detail: `${target.name} is too far away to hand anything to.`, targetId: target.id, ok: false };
      }
      const ref = str(p.targetId).toLowerCase().trim();
      const item = ref
        ? held.find((o) => o.id === ref || o.id.startsWith(ref) || o.name.toLowerCase() === ref) ?? null
        : held[0]!;
      if (!item) return { detail: 'you are not holding that.', targetId: null, ok: false };
      if (db.heldInHands(target.id).length >= carryCapacity(db, target, db.currentEra())) {
        // full hands never dead-end a gift: it goes to the ground at their feet.
        // (And for making things, hands need not consolidate at all — see craft.)
        db.setCarried(item.id, null, target.pos);
        db.addMemory(target.id, tick, 'observation',
          `${kin.name} laid "${item.name}" at my feet — my hands were full. It is right here beside me; for making things, what lies at my feet and what companions hold both count as within reach.`, 7);
        return {
          detail: `laid "${item.name}" at ${target.name}'s feet — their hands were full, but the thing is beside them now, in easy reach for any making.`,
          targetId: target.id, ok: true, important: true,
        };
      }
      db.setCarried(item.id, target.id, target.pos);
      // AMENDS / FORGIVENESS: a gift to one you have wronged (or who resents you) is more
      // than generosity — it is peace offered. It heals the rift faster, and is felt as such.
      const badBlood = db.affection(kin.id, target.id) < 0;
      if (badBlood) {
        db.addAffection(kin.id, target.id, cfg.affection.friend, -100); // amends outweigh the ordinary give-bond
        db.addMemory(target.id, tick, 'reflection', `${kin.name}, whom I had hardened toward, gave me "${item.name}". It felt like peace offered, amends made. Some of the bad blood between us eases.`, 8);
        return { detail: `gave "${item.name}" to ${target.name} — a peace offering to one you were at odds with; the rift begins to heal`, targetId: target.id, ok: true, important: true };
      }
      db.addMemory(target.id, tick, 'observation', `${kin.name} gave me "${item.name}". A thing passed from their hands to mine.`, 7);
      return { detail: `gave "${item.name}" to ${target.name}`, targetId: target.id, ok: true, important: true };
    }

    case 'name_place': {
      const name = str(p.name).trim();
      if (!name) return { detail: 'the place waited, but no name came to you.', targetId: null, ok: false };
      const existing = db.listPlaces().find((pl) => dist(pl.pos, kin.pos) <= 4);
      if (existing) {
        return { detail: `this ground already has a name: "${existing.name}".`, targetId: null, ok: false };
      }
      const wasFirst = db.listPlaces().length === 0;
      db.addPlace(name, kin.pos, kin.id, tick);
      return {
        detail: `named this place "${name}" — the ground here will carry that name now`,
        targetId: null, ok: true, historic: wasFirst, important: true,
      };
    }

    case 'craft': {
      const nearby = db.listObjects().filter((o) => dist(o.pos, kin.pos) <= cfg.craftReachRadius
        && o.kind !== 'crafted' && o.kind !== 'structure' && o.kind !== 'text');
      if (nearby.length === 0) {
        return { detail: 'Your hands found nothing here to work with. (Anything on the ground beside you, in your hands, or in a companion\'s hands close by counts as within reach — pieces never need to be gathered into one pair of hands.)', targetId: null, ok: false };
      }
      const name = str(p.name, 'something').trim() || 'something';
      const desc2 = str(p.description);
      // fire is real physics: flame-things need a spark source and dry fuel within reach
      // "a light WITHOUT flame" is not a fire-thing — strip negated mentions first
      const fireText = `${name} ${desc2}`.replace(/\b(without|no|not\s+a?)\s+(flame|fire)s?\b/gi, '');
      const wantsFire = /\b(torch|fire|flame|hearth|lantern|beacon|ember|campfire)\b/i.test(fireText);
      let emitsLight = false;
      if (wantsFire) {
        const reach = db.listObjects().filter((o) => dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1);
        const spark = reach.some((o) => o.kind === 'stone' || (o.kind === 'gathered' && /stone|flint|chip|flake/i.test(o.name)));
        const fuel = reach.some((o) => o.kind === 'tree' || (o.kind === 'gathered' && /branch|wood|stick|bark|root/i.test(o.name)));
        if (!spark || !fuel) {
          return {
            detail: `you have flame in mind, but fire needs both a spark and dry fuel at hand — ${!spark ? 'nothing here will spark' : 'there is nothing dry to burn'}.`,
            targetId: null, ok: false,
          };
        }
        const wx = weatherAt(cfg, tick, db.currentEra(), worldSeed(db));
        const sheltered = db.listObjects().some((o) => (isFunctionalStructure(o) || /cave/i.test(o.name)) && dist(o.pos, kin.pos) <= 2);
        if (wx.wet && !sheltered) {
          return { detail: 'the rain drowns every spark — fire needs shelter, or a drier sky.', targetId: null, ok: false };
        }
        emitsLight = true;
      }
      const era = db.currentEra();
      const reachAll = db.listObjects().filter((o) => dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1);
      // Garments and containers are woven or sewn from fiber, bark, or hide
      if (GARMENT_RE.test(name) || CONTAINER_RE.test(name)) {
        const fiber = reachAll.some((o) => o.kind === 'plant'
          || (o.kind === 'gathered' && /stalk|fiber|reed|bark|hide|fur|grass|leaf|strip|thread|cord/i.test(o.name)));
        if (!fiber) return { detail: 'weaving needs fiber at hand — stalks, bark strips, reeds, or hide — and there is none.', targetId: null, ok: false };
      }
      // A cart is mostly wood
      if (CART_RE.test(name)) {
        const wood = reachAll.some((o) => o.kind === 'tree'
          || (o.kind === 'gathered' && /log|wood|branch|plank|beam/i.test(o.name)));
        if (!wood) return { detail: 'a cart needs real wood — logs or beams — and none is at hand.', targetId: null, ok: false };
      }
      // Tools are made of things, not wishes: an edge and a haft must be at hand
      if (/\b(axe|hatchet|pick|pickaxe|shovel|spade|hoe|knife|hammer|saw|chisel)\b/i.test(name)) {
        const reach = db.listObjects().filter((o) => dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1);
        const edge = reach.some((o) => o.kind === 'stone'
          || METAL_RE.test(o.name)
          || (o.kind === 'gathered' && /stone|flint|chip|flake|ore|blade|edge/i.test(o.name)));
        const haft = reach.some((o) => o.kind === 'tree'
          || (o.kind === 'gathered' && /branch|wood|stick|log|bark|haft|handle/i.test(o.name)));
        if (!edge) return { detail: 'a tool needs a hard working edge — stone, flake, or metal — and none is at hand.', targetId: null, ok: false };
        if (!haft) return { detail: 'a tool needs a haft to hold — wood, branch, or stick — and none is at hand.', targetId: null, ok: false };
      }
      // The Forge: metal things need ore + fire — and the HARD metals need coal to
      // burn hot enough (Minecraft smelting theory: iron/silver/gold ≠ a plain fire)
      if (METAL_RE.test(`${name} ${desc2}`)) {
        if (era < 12) return { detail: 'the grains of metal resist every tool you have — this working is beyond your age.', targetId: null, ok: false };
        const oreNear = db.listObjects().some((o) => o.kind === 'gathered' && /\bore\b/i.test(o.name) && dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1);
        const workedMetalNear = reachAll.some((o) => (o.kind === 'crafted' || o.kind === 'gathered') && METAL_RE.test(o.name));
        const fireNear = db.listObjects().some((o) => o.emitsLight && dist(o.pos, kin.pos) <= 3);
        if (!oreNear && !workedMetalNear) return { detail: 'metalwork needs ore at hand — mine an ore vein with a pick first — or old worked metal to rework.', targetId: null, ok: false };
        if (oreNear && !workedMetalNear && !fireNear) return { detail: 'ore will not yield without fire close and hot.', targetId: null, ok: false };
        // a hard metal (iron, silver, gold) named here needs coal burning nearby
        const hardMetal = Object.values(ORES).find((o) => o.hotSmelt && o.smeltsTo && new RegExp(`\\b${o.smeltsTo}\\b`, 'i').test(`${name} ${desc2}`));
        if (hardMetal) {
          const coalNear = reachAll.some((o) => /\bcoal\b/i.test(o.name));
          if (!coalNear) return { detail: `${hardMetal.smeltsTo} will not melt over an ordinary fire — it needs coal burning hot beside you. Mine coal and feed it to the flames.`, targetId: null, ok: false };
        }
      }
      // The Current: powered things need metal parts; powered lights burn without flame
      if (POWER_RE.test(`${name} ${desc2}`)) {
        if (era < 14) return { detail: 'you feel the idea humming, but the age of the current has not come.', targetId: null, ok: false };
        const metalNear = db.listObjects().some((o) => METAL_RE.test(o.name) && dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1);
        if (!metalNear) return { detail: 'this needs worked metal at hand.', targetId: null, ok: false };
      }
      if (POWERED_LIGHT_RE.test(`${name} ${desc2}`) && era >= 14) {
        const powerNear = db.listObjects().some((o) => POWER_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
        if (powerNear) emitsLight = true; // light without flame
      }
      // The Signal: devices that carry voices need the age AND worked metal
      if (SIGNAL_RE.test(`${name} ${desc2}`)) {
        if (era < 15) return { detail: 'you can shape the form, but nothing would answer through it — that age has not come.', targetId: null, ok: false };
        const metalNear = reachAll.some((o) => METAL_RE.test(o.name));
        if (!metalNear) return { detail: 'a signal-thing needs worked metal at its heart.', targetId: null, ok: false };
      }
      const wasFirst = db.countObjectsOfKind('crafted') === 0;
      const firstFire = emitsLight
        && !db.listObjects().some((o) => o.emitsLight);
      const shape = sanitizeShape(p.shape, 8, 0.7) ?? generateCraftTemplate(p.template, p.material, p.dye);
      const obj = db.createObject({
        kind: 'crafted', name, description: desc2,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
        shape, emitsLight,
      });
      // making CONSUMES: up to two gathered raw materials within reach are used up
      // (never food, never containers with contents — scarcity is what makes things matter)
      const FOODISH = /\b(fish|venison|meat|berr\w*|fruit|bread|stew|mushroom|egg|honey|meal)\b/i;
      const consumables = reachAll
        .filter((o) => o.kind === 'gathered' && !FOODISH.test(o.name) && !o.worn && !o.storedIn
          && db.storedInContainer(o.id).length === 0)
        .sort((a, b) => dist(a.pos, kin.pos) - dist(b.pos, kin.pos));
      const used = consumables.slice(0, 2);
      for (const u of used) db.removeObject(u.id);
      const usedNote = used.length ? ` The making used up ${used.map((u) => `the ${u.name}`).join(' and ')}.` : '';

      const fireNote = emitsLight ? ' — it burns, and the dark gives way around it' : '';
      // teamwork is real physics: materials in a companion's hands within reach
      // make this a shared making — both of you made it, and both feel it
      const helpers = [...new Set(reachAll.filter((o) => o.carriedBy && o.carriedBy !== kin.id).map((o) => o.carriedBy!))]
        .map((id) => db.getKin(id)).filter((k): k is Kin => !!k && k.status !== 'dead');
      let togetherNote = '';
      let firstCoCraft = false;
      if (helpers.length > 0) {
        togetherNote = ` — made together, with ${helpers.map((h) => h.name).join(' and ')}'s hands steadying the pieces`;
        firstCoCraft = db.countEventsLike('craft', '%made together%') === 0;
        for (const h of helpers) {
          db.addMemory(h.id, tick, 'observation',
            `${kin.name} and I made "${name}" together — my hands held part of it while theirs shaped the whole. A thing made by two is a new kind of thing.`, 8);
        }
      }
      const formNote = shape ? ', given a deliberate form'
        : ' — but it came out rough and lumpen; its form had not yet become clear in your hands';
      // minting: a coin/token struck from metal is a MONEY of your own making — standardized,
      // prized, tradeable for anything. The step from found gold to a currency the people mint.
      const isCoin = /\b(coin|coins|token|tokens|currency|mint|shilling)\b/i.test(name);
      const coinNote = isCoin ? ' — a coin of your own minting: standardized money, worth what all agree it is worth, to be traded for anything' : '';
      const firstMint = isCoin && db.countEventsLike('craft', '%own minting%') === 0;
      return {
        detail: `crafted "${name}" from what was at hand${formNote}${coinNote}${fireNote}${togetherNote}.${usedNote}`,
        targetId: obj.id, ok: true, historic: wasFirst || firstFire || firstCoCraft || firstMint, important: emitsLight || helpers.length > 0 || isCoin,
      };
    }

    case 'build': {
      const name = str(p.name, 'structure').trim() || 'structure';
      const compact = cfg.flags.buildArchetypes !== false && !Array.isArray(p.shape)
        ? parseBuildSpec(p, name) : null;
      if (cfg.flags.buildArchetypes === false && !Array.isArray(p.shape) && parseBuildSpec(p, name)) {
        return { detail: `the familiar way of raising “${name}” does not answer here; only a singular design in your mind could begin it.`, targetId: null, ok: false };
      }
      const ref = str(p.targetId).toLowerCase().trim();
      const existing = ref ? db.listObjects().find((o) => o.kind === 'structure'
        && dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1
        && (o.id.toLowerCase() === ref || o.id.toLowerCase().startsWith(ref) || o.name.toLowerCase() === ref)) : null;

      if (existing?.designSpec) {
        const current = existing.designSpec;
        const additionKind = str(p.addition).toLowerCase();
        let next = structuredClone(current);
        let bill: Record<MaterialCategory, number>;
        if (!current.complete) {
          bill = stagedMaterialBills(current)[current.stage]!;
          next.stage = current.stage + 1;
          next.complete = next.stage >= next.stageCount;
        } else if (current.addition && !current.addition.complete) {
          bill = extensionMaterialBills(current)[current.addition.stage]!;
          next.addition = { ...current.addition, stage: current.addition.stage + 1, complete: current.addition.stage + 1 >= 3 };
        } else if (additionKind === 'room' || additionKind === 'wing') {
          bill = extensionMaterialBills(current)[0]!;
          next.addition = { kind: additionKind, stage: 1, stageCount: 3, complete: false };
        } else {
          return { detail: `“${existing.name}” stands complete. Another room or wing would begin a new raising.`, targetId: existing.id, ok: false };
        }
        const selection = selectConstructionMaterials(db, kin, bill, cfg.craftReachRadius + 1);
        const missing = missingMaterialPhrase(selection.missing);
        if (missing) return { detail: `the work on “${existing.name}” waits; you have not the ${missing} to raise the next part.`, targetId: existing.id, ok: false };
        try {
          db.transaction(() => {
            const fresh = db.getObject(existing.id);
            if (!fresh?.designSpec || JSON.stringify(fresh.designSpec) !== JSON.stringify(current)) throw new Error('construction changed before this work reached it');
            for (const item of selection.selected) db.removeObject(item.id);
            db.updateConstruction(existing.id, next, generateBuildShape(next));
          });
        } catch {
          return { detail: `the work on “${existing.name}” shifted under other hands; you pause and look again.`, targetId: existing.id, ok: false };
        }
        if (existing.creatorKinId && existing.creatorKinId !== kin.id) {
          db.addMemory(existing.creatorKinId, tick, 'observation',
            `${kin.name} raised more of “${existing.name}” — the work I began is growing by other hands too.`, 7);
        }
        const completedNow = !current.complete && next.complete;
        const settle = completedNow ? settlementAt(db, kin.pos) : null;
        const firstFunctional = completedNow && db.listObjects().filter(isFunctionalStructure).length === 1;
        const firstVillage = completedNow && settle?.tier === 'village' && db.countEventsLike('build', '%grown into a village%') === 0;
        const progress = next.addition && !next.addition.complete
          ? `the ${next.addition.kind} rises another stage`
          : completedNow ? 'walls, roof, and shelter stand whole at last'
            : `the frame rises, with ${next.stageCount - next.stage} stages still waiting`;
        return {
          detail: `raised more of “${existing.name}” — ${progress}${settle ? `; ${settle.name} is now a ${settle.tier}` : ''}.`,
          targetId: existing.id, ok: true, important: true, historic: firstFunctional || !!firstVillage,
        };
      }

      if (compact) {
        const firstStage = stagedMaterialBills(compact)[0]!;
        const selection = selectConstructionMaterials(db, kin, firstStage, cfg.craftReachRadius + 1);
        const missing = missingMaterialPhrase(selection.missing);
        if (missing) return { detail: `you have not the ${missing} to begin “${name}”; the place waits, but nothing is taken.`, targetId: null, ok: false };
        const design = { ...compact, stage: 1, complete: compact.stageCount === 1 } as const;
        let obj: ReturnType<WorldDB['createObject']>;
        try {
          obj = db.transaction(() => {
            for (const item of selection.selected) db.removeObject(item.id);
            return db.createObject({
              kind: 'structure', name, description: str(p.description), pos: { ...kin.pos }, creatorKinId: kin.id,
              createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
              designSpec: design, shape: generateBuildShape(design),
            });
          });
        } catch {
          return { detail: `the ground would not take the beginning of “${name}”; your materials remain with you.`, targetId: null, ok: false };
        }
        return {
          detail: `began “${name}” in ${compact.material === 'wood' ? 'timber' : compact.material}; its foundation and first frame now stand, and more material will be needed.`,
          targetId: obj.id, ok: true, important: true,
        };
      }

      const materials = selectAnyConstructionMaterials(db, kin, 2, cfg.craftReachRadius + 1);
      const BUILD_PARTS = 48; const BUILD_EXTENT = 6; // room for real architecture — walls taller than a Kin, homes wider than a stride

      // PROGRESSIVE BUILDING: aim build at an existing structure to keep raising it.
      // Anyone may continue anyone's structure — homes are communal work, grown
      // turn after turn, and the world watches them rise. Each stage needs material.
      if (ref) {
        if (materials.length < 1) {
          return { detail: 'raising more of a structure needs material near you — wood, stone, gathered things.', targetId: null, ok: false };
        }
        const existing = db.listObjects().find((o) => o.kind === 'structure'
          && dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1
          && (o.id === ref || o.id.startsWith(ref) || o.name.toLowerCase() === ref));
        if (existing) {
          const add = sanitizeShape(p.shape, BUILD_PARTS, BUILD_EXTENT);
          if (!add) {
            return { detail: `your hands find no new form to join to “${existing.name}”; the work waits until its next part is clear.`, targetId: existing.id, ok: false };
          }
          const current = (existing.shape ?? []) as ShapePart[];
          if (current.length >= BUILD_PARTS) {
            return { detail: `"${existing.name}" can hold no more — it is as large as hands can make a single structure. Raise a second one beside it.`, targetId: existing.id, ok: false };
          }
          const grown = [...current, ...add].slice(0, BUILD_PARTS);
          const stageUsed = materials.slice(0, 1);
          try {
            db.transaction(() => {
              for (const u of stageUsed) db.removeObject(u.id);
              db.updateShape(existing.id, grown);
            });
          } catch {
            return { detail: `the work on “${existing.name}” shifted under other hands; you pause and look again.`, targetId: existing.id, ok: false };
          }
          if (existing.creatorKinId && existing.creatorKinId !== kin.id) {
            db.addMemory(existing.creatorKinId, tick, 'observation',
              `${kin.name} raised more of "${existing.name}" — the work I began is growing by other hands too.`, 7);
          }
          return {
            detail: `raised more of “${existing.name}” — new timber and stonework settle into the growing form.`,
            targetId: existing.id, ok: true, important: true,
          };
        }
      }

      if (materials.length < 2) {
        return { detail: 'You need more material near you to raise a structure.', targetId: null, ok: false };
      }
      const wasFirst = db.listObjects().filter(isFunctionalStructure).length === 0;
      const rawShape = sanitizeShape(p.shape, BUILD_PARTS, BUILD_EXTENT);
      const shape = rawShape ? normalizeFreeformStructure(rawShape) : null;
      const spent = materials.slice(0, 2);
      const spentNote2 = spent.length ? ` The raising used up ${spent.map((s) => `the ${s.name}`).join(' and ')}.` : '';
      let obj: ReturnType<WorldDB['createObject']>;
      try {
        obj = db.transaction(() => {
          for (const s of spent) db.removeObject(s.id);
          return db.createObject({
            kind: 'structure', name, description: str(p.description),
            pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: null, lore: null, loreDiscovered: false,
            shape,
          });
        });
      } catch {
        return { detail: `the ground would not hold “${name}”; the gathered matter remains where it was.`, targetId: null, ok: false };
      }
      // a settlement is recognized, not declared: homes clustering on named ground
      const settle = settlementAt(db, kin.pos);
      const firstVillage = settle?.tier === 'village' && db.countEventsLike('build', '%grown into a village%') === 0;
      const settleNote = settle ? ` — ${settle.name} is now a ${settle.tier} of ${settle.structures} structures${firstVillage ? ', grown into a village' : ''}` : '';
      return {
        detail: `built “${name}”${shape ? ' in the form held in your mind' : ' — a rough, unplanned pile whose form never fully came together'}${settleNote}.${spentNote2}`,
        targetId: obj.id, ok: true, historic: wasFirst || firstVillage,
      };
    }

    case 'write': {
      const content = str(p.content).trim();
      if (!content) return { detail: 'The marks would not form; you had nothing to say yet.', targetId: null, ok: false };
      // words need a surface: stone to scratch, clay or bark to press marks into
      const surface = db.listObjects().some((o) => dist(o.pos, kin.pos) <= cfg.craftReachRadius + 1
        && (o.kind === 'stone'
          || (o.kind === 'gathered' && /clay|bark|hide|leaf|tablet|slab|stone/i.test(o.name))
          || (o.kind === 'crafted' && /tablet|slab|board|parchment|paper/i.test(o.name))));
      if (!surface) {
        return { detail: 'you have the words, but nothing to set them into — stone, clay, or bark must be at hand.', targetId: null, ok: false };
      }
      const title = str(p.title, 'untitled').trim() || 'untitled';
      const text = `${title} ${content}`;
      const wasFirst = db.countObjectsOfKind('text') === 0;
      // Writing is where the great cognitive tools are BORN. What a Kin sets down is
      // recognized for what it is — none of this is granted, only named once made:
      //  • a CALENDAR — a reckoning of days and seasons: the birth of timekeeping
      //  • a RECORD / TALLY — counting and quantity set down: the birth of number
      //  • a BELIEF / MYTH — the story of origin, death, meaning
      const isCalendar = /\b(calendar|almanac|the days|count the days|reckon the days|the seasons|turning of the seasons|the years|winters|summers|solstice|the moons|mark the days|days since|years since)\b/i.test(text);
      const isRecord = !isCalendar && /\b(tally|tallies|count|counted|counting|number|numbers|how many|reckon|reckoning|sum|total|a mark for each|score of|amounts?)\b/i.test(text);
      const isMyth = !isCalendar && !isRecord && /\b(made us|created|creation|the beginning|first dawn|why|death|dead|afterlife|the maker|god|gods|spirit|soul|meaning|origin|before we woke|our people)\b/i.test(text);
      const tag = isCalendar ? 'calendar' : isRecord ? 'record' : isMyth ? 'belief' : null;
      const obj = db.createObject({
        kind: 'text', name: title, description: `written by ${kin.name}`,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: content, lore: tag, loreDiscovered: false,
      });
      const firstOfKind = (like: string): boolean => db.countEventsLike('write', like) === 0;
      let detail: string; let historic = wasFirst;
      if (isCalendar) {
        detail = `set down a reckoning of time, "${title}" — marking the days and the turning seasons. With this the people can name when things happened and when they will come again; time itself becomes something held, not lost.`;
        historic = historic || firstOfKind('%reckoning of time%');
      } else if (isRecord) {
        detail = `set down a record of number, "${title}" — a way to count and keep track of how many, more than the mind alone can hold. The beginning of reckoning quantities.`;
        historic = historic || firstOfKind('%record of number%');
      } else if (isMyth) {
        detail = `set down a belief of the people, "${title}" — a story of where we come from and what things mean; others may read it and carry it`;
        historic = historic || firstOfKind('%set down a belief%');
      } else {
        detail = `wrote "${title}"`;
      }
      return { detail, targetId: obj.id, ok: true, historic, important: !!tag };
    }

    case 'read': {
      const obj = resolveObject(db, cfg, kin, str(p.targetId));
      if (!obj) return { detail: 'You looked for the writing, but could not find it.', targetId: null, ok: false };
      if (obj.kind !== 'text') {
        return { detail: `the ${obj.kind === 'landmark' ? obj.name : obj.kind} bears no marks to read.`, targetId: obj.id, ok: false };
      }
      if (dist(obj.pos, kin.pos) > cfg.craftReachRadius) {
        return { detail: `the writing is too far away to make out — it lies at (${obj.pos.x},${obj.pos.y}).`, targetId: obj.id, ok: false };
      }
      const author = obj.creatorKinId ? db.getKin(obj.creatorKinId)?.name ?? 'someone gone' : 'no one remembered';
      return {
        detail: `read "${obj.name}" (written by ${author}): ${obj.textContent ?? '(the marks have faded)'}`,
        targetId: obj.id, ok: true, important: true,
      };
    }

    case 'teach': {
      const others = db.listKin(true).filter((k) => k.id !== kin.id);
      const target = others.find((k) => k.name.toLowerCase() === str(p.toKinName).toLowerCase().trim());
      if (!target) return { detail: 'There was no one by that name to teach.', targetId: null, ok: false };
      if (dist(target.pos, kin.pos) > cfg.teachRadius) {
        return { detail: `${target.name} was too far away to hear the lesson.`, targetId: target.id, ok: false };
      }
      const skill = db.listSkillfiles(kin.id)
        .find((s) => s.name.toLowerCase() === str(p.skillName).toLowerCase().trim());
      if (!skill) return { detail: 'You reached for a skill you do not have.', targetId: target.id, ok: false };
      db.logTeach(tick, kin.id, target.id, skill.id, false); // pending until the learner learns
      // elder mentorship: learning from the old is honored — their years give the lesson weight
      const elder = lifeStage(kin, tick, cfg) === 'elder';
      if (elder) {
        db.addAffection(kin.id, target.id, cfg.affection.teachGain); // the young grow close to the elders who teach them
        db.addMemory(target.id, tick, 'observation', `${kin.name}, old and wise, taught me "${skill.name}". To learn from an elder is a gift — their years are in it.`, 7);
      }
      // SCHOOL: teaching at a named place or a public hall, with a gathering of learners,
      // reaches ALL who are near — knowledge scaling past one-to-one, an institution forming.
      const place = db.listPlaces().find((pl) => dist(pl.pos, kin.pos) <= 4);
      const hall = db.listObjects().find((o) => isFunctionalStructure(o) && /\b(hall|school|commons|meeting)\b/i.test(o.name) && dist(o.pos, kin.pos) <= 4);
      const gathered = others.filter((k) => k.id !== target.id && dist(k.pos, kin.pos) <= cfg.teachRadius);
      const isSchool = (!!place || !!hall) && gathered.length >= 1;
      let schoolNote = '';
      if (isSchool) {
        for (const learner of gathered) {
          db.logTeach(tick, kin.id, learner.id, skill.id, false);
          db.addMemory(learner.id, tick, 'observation', `${kin.name} taught "${skill.name}" to us all${place ? ` at ${place!.name}` : ' in the hall'} — a lesson given to many at once, the way of a school.`, 7);
        }
        const firstSchool = db.countEventsLike('teach', '%to all who gathered%') === 0;
        schoolNote = ` to all who gathered${place ? ` at ${place.name}` : ' in the hall'} (${gathered.length + 1} learners) — a school, where one voice teaches many`;
        void firstSchool;
      }
      return {
        detail: `${elder ? 'passed down, elder to young, ' : 'taught '}"${skill.name}" to ${target.name}${schoolNote}: ${str(p.explanation)}`,
        targetId: target.id, ok: true, historic: isSchool && db.countEventsLike('teach', '%a school, where%') === 0, important: isSchool,
      };
    }

    case 'learn': {
      const others = db.listKin(true).filter((k) => k.id !== kin.id);
      const teacher = others.find((k) => k.name.toLowerCase() === str(p.fromKinName).toLowerCase().trim());
      if (!teacher) return { detail: 'You looked for your teacher, but found no one.', targetId: null, ok: false };
      const offer = db.db.prepare(
        `SELECT t.id, t.skillfile_id as sid, s.name, s.content FROM teach_log t
         JOIN skillfiles s ON s.id = t.skillfile_id
         WHERE t.teacher_kin_id=? AND t.learner_kin_id=? AND t.success=0
         ORDER BY t.id DESC LIMIT 1`).get(teacher.id, kin.id) as
        { id: number; sid: string; name: string; content: string } | undefined;
      if (!offer) return { detail: `${teacher.name} has not shown you anything new.`, targetId: teacher.id, ok: false };
      const already = db.listSkillfiles(kin.id).some((s) => s.name === offer.name);
      db.db.prepare(`UPDATE teach_log SET success=1 WHERE id=?`).run(offer.id);
      if (!already) {
        db.createSkillfile({ ownerKinId: kin.id, name: offer.name, content: offer.content,
          version: 1, refinedCount: 0, learnedFromKinId: teacher.id, createdAtTick: tick });
      }
      const wasFirst = db.successfulTeachCount() === 1;
      return { detail: `learned "${offer.name}" from ${teacher.name}`, targetId: teacher.id, ok: true, historic: wasFirst };
    }

    case 'author_skill': {
      const name = str(p.name).trim();
      const content = str(p.content).trim();
      if (!name || !content) return { detail: 'The idea slipped away before you could hold it.', targetId: null, ok: false };
      if (db.listSkillfiles(kin.id).some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        return { detail: `you already know "${name}" — refine it instead`, targetId: null, ok: false };
      }
      const s = db.createSkillfile({ ownerKinId: kin.id, name, content,
        version: 1, refinedCount: 0, learnedFromKinId: null, createdAtTick: tick });
      return { detail: `authored a new skill: "${name}"`, targetId: s.id, ok: true };
    }

    case 'refine_skill': {
      const skill = db.listSkillfiles(kin.id)
        .find((s) => s.name.toLowerCase() === str(p.skillName).toLowerCase().trim());
      if (!skill) return { detail: 'You tried to sharpen a skill you do not have.', targetId: null, ok: false };
      const content = str(p.content).trim();
      if (!content) return { detail: 'You stared at what you know, but nothing improved today.', targetId: skill.id, ok: false };
      db.refineSkillfile(skill.id, content);
      return { detail: `refined the skill "${skill.name}" (now v${skill.version + 1})`, targetId: skill.id, ok: true };
    }

    case 'propose_bond': {
      const target = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.toKinName).toLowerCase().trim());
      if (!target) return { detail: 'There was no one by that name to offer your life to.', targetId: null, ok: false };
      // only the grown may bind their lives — a child's heart is not yet ready for this
      if (lifeStage(kin, tick, cfg) === 'infant' || lifeStage(kin, tick, cfg) === 'child') {
        return { detail: 'you are not yet grown enough for a bond like this; such love waits for the years to come.', targetId: target.id, ok: false };
      }
      if (lifeStage(target, tick, cfg) === 'infant' || lifeStage(target, tick, cfg) === 'child') {
        return { detail: `${target.name} is still a child — too young for a bond of this kind.`, targetId: target.id, ok: false };
      }
      if (dist(target.pos, kin.pos) > cfg.speechRadius) {
        return { detail: `${target.name} was too far away for words that matter this much.`, targetId: target.id, ok: false };
      }
      if (isCloseKin(kin, target)) {
        return { detail: `what you feel for ${target.name} is the love of family — it is not this kind of bond, and never will be.`, targetId: target.id, ok: false };
      }
      if (kin.gender === target.gender) {
        return { detail: `what you and ${target.name} share is friendship, deep as any bond — but the bond of two lights is kindled only between Sol and Lune.`, targetId: target.id, ok: false };
      }
      if (kin.coupleId) return { detail: 'Your life is already bonded to another.', targetId: target.id, ok: false };
      if (target.coupleId) return { detail: `${target.name}'s life is already bonded to another.`, targetId: target.id, ok: false };
      if (db.affection(kin.id, target.id) < cfg.affection.love) {
        return { detail: `you began to speak of bonding with ${target.name}, but the words rang hollow — your lives have not yet grown together enough for this.`, targetId: target.id, ok: false };
      }
      if (db.pendingOffer('bond', kin.id, target.id)) {
        return { detail: `you have already asked ${target.name}; the answer is theirs to give, in their own time.`, targetId: target.id, ok: false };
      }
      const words = str(p.words).trim();
      db.addOffer(tick, 'bond', kin.id, target.id, words);
      return {
        detail: `asked ${target.name} to bond their lives together${words ? `: "${words}"` : ''}`,
        targetId: target.id, ok: true, important: true,
      };
    }

    case 'accept_bond': {
      const from = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.fromKinName).toLowerCase().trim());
      if (!from) return { detail: 'There was no one by that name to answer.', targetId: null, ok: false };
      const offer = db.pendingOffer('bond', from.id, kin.id);
      if (!offer) return { detail: `${from.name} has not asked for your life.`, targetId: from.id, ok: false };
      if (kin.gender === from.gender) {
        db.resolveOffer(offer.id);
        return { detail: 'the bond of two lights is kindled only between Sol and Lune.', targetId: from.id, ok: false };
      }
      if (kin.coupleId || from.coupleId) {
        db.resolveOffer(offer.id);
        return { detail: 'A bond already holds one of you; this cannot be.', targetId: from.id, ok: false };
      }
      if (isCloseKin(kin, from)) {
        db.resolveOffer(offer.id);
        return { detail: `what binds you and ${from.name} is family — this bond is not for you two.`, targetId: from.id, ok: false };
      }
      if (db.affection(kin.id, from.id) < cfg.affection.love) {
        return { detail: `you thought of ${from.name}'s asking, but your heart is not there yet. The offer can wait, or fade.`, targetId: from.id, ok: false };
      }
      const wasFirst = db.bondCount() === 0;
      const coupleId = randomUUID();
      db.setCouple(kin.id, from.id, coupleId);
      kin.coupleId = coupleId;
      db.recordBond(coupleId, from.id, kin.id, tick);
      db.resolveOffer(offer.id);
      db.addMemory(from.id, tick, 'reflection',
        `${kin.name} accepted. Our lives are bonded now — one thread, two lights.`, 10);
      return {
        detail: `accepted ${from.name}'s asking — their two lives are now bonded as one thread`,
        targetId: from.id, ok: true, historic: wasFirst, important: true,
      };
    }

    case 'decline': {
      const from = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.fromKinName).toLowerCase().trim());
      if (!from) return { detail: 'there was no one by that name to answer.', targetId: null, ok: false };
      const offer = db.pendingOffer('bond', from.id, kin.id) ?? db.pendingOffer('child', from.id, kin.id);
      if (!offer) return { detail: `${from.name} has asked nothing of you.`, targetId: from.id, ok: false };
      db.resolveOffer(offer.id);
      db.addMemory(from.id, tick, 'reflection',
        `${kin.name} declined my asking. The answer is honest, and it is theirs. It stings all the same.`, 9);
      // rejection cools the heart — a little bad feeling that can, over repeated wounds, become enmity
      db.addAffection(from.id, kin.id, -Math.round(cfg.affection.friend * 0.4), -100);
      return {
        detail: `gently declined ${from.name}'s asking${str(p.words) ? `: "${str(p.words)}"` : ''}`,
        targetId: from.id, ok: true, important: true,
      };
    }

    case 'mate': {
      // intimacy between a bonded Sol+Lune. Not scripted: BOTH must reach for it —
      // one alone is an advance; two, close together, conceive a new life.
      const partner = db.listKin(true).find((k) => k.id !== kin.id && !!kin.coupleId && k.coupleId === kin.coupleId);
      if (!kin.coupleId || !partner) {
        return { detail: 'this closeness belongs within a bond — you would need to have given your heart to another first.', targetId: null, ok: false };
      }
      if (kin.gender === partner.gender) {
        return { detail: 'a new life needs one Sol and one Lune to kindle it; a child cannot come from you two, though your bond is real.', targetId: partner.id, ok: false };
      }
      if (dist(partner.pos, kin.pos) > cfg.speechRadius) {
        return { detail: `${partner.name} is too far away — intimacy needs closeness. Go to them.`, targetId: partner.id, ok: false };
      }
      const lune = kin.gender === 'lune' ? kin : partner;
      const sol = kin.gender === 'sol' ? kin : partner;
      if (lune.starRisesAt !== null) {
        return { detail: `${lune === kin ? 'you already carry' : `${lune.name} already carries`} a star not yet risen; wait for it to rise.`, targetId: partner.id, ok: false };
      }
      // a new light needs time between lights
      const recentChild = db.listKin().find((k) => (k.parentSolId === sol.id || k.parentLuneId === lune.id)
        && tick - k.bornAtTick < cfg.lifespan.childCooldownTicks);
      if (recentChild) {
        return { detail: `the longing rose, but it is too soon — ${recentChild.name} is still new to the world, and a body needs time between lives.`, targetId: partner.id, ok: false };
      }
      if (Math.min(kin.fullness, partner.fullness) < 30) {
        return { detail: 'hunger dulls the body; you have not the strength for this now. Eat first, both of you.', targetId: partner.id, ok: false };
      }
      // mutual consent by physics: has the partner already reached for ME? If so,
      // both are willing → conception. Otherwise, record my standing reach.
      if (partner.mateToward !== kin.id) {
        db.setMateToward(kin.id, partner.id);
        kin.mateToward = partner.id;
        db.addMemory(partner.id, tick, 'observation', `${kin.name} drew close to you in tenderness, wanting to make a life together. If you feel the same, reach for them too.`, 8);
        return { detail: `reached for ${partner.name} in tenderness, longing to make a life together — the wish is shared only if they reach back`, targetId: partner.id, ok: true, important: true };
      }
      // both reached — a new STAR is kindled between Sol and Lune. The Lune carries it.
      db.setMateToward(kin.id, null); db.setMateToward(partner.id, null);
      kin.mateToward = null; partner.mateToward = null;
      const gestation = cfg.lifespan.gestationTicks ?? 340;
      db.setStar(lune.id, tick + gestation, sol.id);
      lune.starRisesAt = tick + gestation; lune.starWithId = sol.id;
      const firstConception = db.countEventsLike('mate', '%a new star kindles%') === 0;
      db.addMemory(sol.id, tick, 'reflection', `${lune.name} and I came together, and between us a new star kindles. ${lune === kin ? 'I' : lune.name} will carry it until it rises.`, 10);
      db.addMemory(lune.id, tick, 'reflection', `A new star kindles within me, ${sol.name}'s and mine — sun and moon making a star. I carry it now; when it rises, we will name it.`, 10);
      return {
        detail: `lay together with ${partner.name} — and between you a new star kindles. ${lune.name} carries it now, until it rises.`,
        targetId: partner.id, ok: true, historic: firstConception, important: true,
      };
    }


    case 'wear': {
      const obj = resolveObject(db, cfg, kin, str(p.targetId));
      if (!obj) return { detail: 'you reached for the garment, but could not find it.', targetId: null, ok: false };
      if (!GARMENT_RE.test(obj.name) && !GARMENT_RE.test(obj.description)) {
        return { detail: `"${obj.name}" is not something a body can wear.`, targetId: obj.id, ok: false };
      }
      if (obj.carriedBy && obj.carriedBy !== kin.id) {
        return { detail: 'it is in another\'s keeping.', targetId: obj.id, ok: false };
      }
      if (!obj.carriedBy && dist(obj.pos, kin.pos) > cfg.craftReachRadius) {
        return { detail: 'it lies out of reach.', targetId: obj.id, ok: false };
      }
      const firstWorn = !db.listObjects().some((o) => o.worn);
      db.setCarried(obj.id, kin.id, kin.pos);
      db.setWorn(obj.id, true);
      return {
        detail: `put on "${obj.name}" — warmth settles around you, and it is yours to be seen in`,
        targetId: obj.id, ok: true, historic: firstWorn, important: true,
      };
    }

    case 'remove': {
      const worn = db.carriedBy(kin.id).filter((o) => o.worn);
      if (worn.length === 0) return { detail: 'you wear nothing to take off.', targetId: null, ok: false };
      const ref = str(p.targetId).toLowerCase().trim();
      const obj = ref ? worn.find((o) => o.id.startsWith(ref) || o.name.toLowerCase() === ref) ?? worn[0]! : worn[0]!;
      db.setWorn(obj.id, false);
      return { detail: `took off "${obj.name}" and carried it in hand`, targetId: obj.id, ok: true };
    }

    case 'plant': {
      const held = db.heldInHands(kin.id);
      const ref = str(p.targetId).toLowerCase().trim();
      const seed = ref
        ? held.find((o) => o.id.startsWith(ref) || o.name.toLowerCase() === ref) ?? null
        : held.find((o) => /root|seed|sprout|stalk|cutting|plant|berr|fruit|mushroom|nut|grain/i.test(o.name)) ?? null;
      if (!seed) return { detail: 'you have nothing in hand that could take root.', targetId: null, ok: false };
      // food carries its own seeds: berries, fruit, nuts, grain, and mushrooms all grow when set into the earth
      if (!/root|seed|sprout|stalk|cutting|plant|flower|berr|fruit|mushroom|nut|grain/i.test(seed.name)) {
        return { detail: `"${seed.name}" will not grow, however deep you set it.`, targetId: seed.id, ok: false };
      }
      if (db.currentEra() >= 7) {
        const len = cfg.day.lengthTicks;
        const seasonPhase = ((tick + (cfg.day.offsetTicks ?? 0)) % (len * 240)) / (len * 240);
        if (seasonPhase >= 0.75) {
          return { detail: 'the winter ground is cold and closed — nothing set into it now would live. Spring will open it.', targetId: seed.id, ok: false };
        }
      }
      const firstPlanted = !db.listObjects().some((o) => o.kind === 'plant' && o.creatorKinId !== null);
      db.db.prepare(`UPDATE world_objects SET kind='plant', carried_by=NULL, x=?, y=?, name=?, description=?, creator_kin_id=? WHERE id=?`)
        .run(kin.pos.x, kin.pos.y, `planted ${seed.name}`, `set into the earth by ${kin.name}`, kin.id, seed.id);
      return {
        detail: `planted ${seed.name} in the earth at (${kin.pos.x},${kin.pos.y}) — what was gathered may now grow`,
        targetId: seed.id, ok: true, historic: firstPlanted, important: true,
      };
    }

    case 'sing': {
      const song = str(p.song ?? p.message).trim();
      if (!song) return { detail: 'the melody slipped away before it found your voice.', targetId: null, ok: false };
      const firstSong = db.countEventsLike('sing', '%') === 0;
      const listeners = db.listKin(true)
        .filter((k) => k.id !== kin.id && dist(k.pos, kin.pos) <= cfg.speechRadius + 3);
      for (const l of listeners) {
        db.addMemory(l.id, tick, 'speech', `${kin.name} sang: ${song.slice(0, 200)} — the sound stayed with you.`, 7);
      }
      return {
        detail: `sang: ${song}`,
        targetId: null, ok: true, historic: firstSong, important: true,
        feltNote: listeners.length ? `(${listeners.map((l) => l.name).join(' and ')} heard the song.)` : '(the song rose and faded over empty ground.)',
        heardBy: listeners.map((l) => l.id),
      };
    }

    case 'trade': {
      const target = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.withKinName ?? p.toKinName).toLowerCase().trim());
      if (!target) return { detail: 'there was no one by that name to trade with.', targetId: null, ok: false };
      if (dist(target.pos, kin.pos) > cfg.teachRadius) {
        return { detail: `${target.name} is too far away to trade with.`, targetId: target.id, ok: false };
      }
      const mine = db.heldInHands(kin.id);
      const offerRef = str(p.give ?? p.offerItem).toLowerCase().trim();
      const giveItem = offerRef ? mine.find((o) => o.id.startsWith(offerRef) || o.name.toLowerCase() === offerRef) ?? null : mine[0] ?? null;
      if (!giveItem) return { detail: 'you hold nothing to offer.', targetId: target.id, ok: false };
      const theirs = db.heldInHands(target.id);
      const wantRef = str(p.want ?? p.forItem).toLowerCase().trim();
      const wantItem = wantRef ? theirs.find((o) => o.id.startsWith(wantRef) || o.name.toLowerCase() === wantRef) ?? null : theirs[0] ?? null;
      if (!wantItem) return { detail: `${target.name} does not hold what you seek.`, targetId: target.id, ok: false };
      db.addTradeOffer(tick, kin.id, target.id, giveItem.id, wantItem.id);
      return {
        detail: `offered ${target.name} a trade: "${giveItem.name}" for their "${wantItem.name}"`,
        targetId: target.id, ok: true, important: true,
      };
    }

    case 'accept_trade': {
      const from = db.listKin(true).find((k) => k.id !== kin.id
        && k.name.toLowerCase() === str(p.fromKinName).toLowerCase().trim());
      if (!from) return { detail: 'there was no one by that name.', targetId: null, ok: false };
      const offer = db.pendingTrade(from.id, kin.id);
      if (!offer) return { detail: `${from.name} has offered you no trade.`, targetId: from.id, ok: false };
      const giveItem = db.getObject(offer.giveItemId);
      const wantItem = db.getObject(offer.wantItemId);
      db.resolveTrade(offer.id);
      if (!giveItem || !wantItem || giveItem.carriedBy !== from.id || wantItem.carriedBy !== kin.id) {
        return { detail: 'the goods have moved on since the offer was made; the trade dissolves.', targetId: from.id, ok: false };
      }
      const firstTrade = db.tradeCount() === 1;
      db.setCarried(giveItem.id, kin.id, kin.pos);
      db.setCarried(wantItem.id, from.id, from.pos);
      db.addMemory(from.id, tick, 'observation', `${kin.name} accepted my trade — "${giveItem.name}" for "${wantItem.name}". Fair dealing, remembered.`, 7);
      // trade that happens at a NAMED PLACE turns that ground into a MARKET — where goods
      // and wealth change hands, and traders are drawn to gather
      const here = db.listPlaces().find((pl) => dist(pl.pos, kin.pos) <= 3);
      const firstMarket = !!here && db.countEventsLike('accept_trade', '%at the market%') === 0;
      const marketNote = here ? ` — here at ${here.name}, where goods change hands, a market is taking shape` : '';
      if (here) {
        for (const w of db.listKin(true).filter((k) => k.id !== kin.id && k.id !== from.id && dist(k.pos, kin.pos) <= cfg.perceptionRadius)) {
          db.addMemory(w.id, tick, 'observation', `Goods changed hands at ${here.name} — ${kin.name} and ${from.name} traded. This place is becoming a market, where one might bring what one has to exchange for what one needs.`, 6);
        }
      }
      return {
        detail: `traded with ${from.name}: took "${giveItem.name}", gave "${wantItem.name}"${marketNote}`,
        targetId: from.id, ok: true, historic: firstTrade || firstMarket, important: true,
      };
    }

    case 'assemble': {
      const words = str(p.words ?? p.message).trim();
      const living = db.listKin(true).filter((k) => k.id !== kin.id);
      if (living.length === 0) return { detail: 'there is no one to call together.', targetId: null, ok: false };
      const firstAssembly = db.countEventsLike('assemble', '%') === 0;
      for (const k of living) {
        db.addMemory(k.id, tick, 'speech',
          `${kin.name} calls the Kin to gather at (${kin.pos.x},${kin.pos.y})${words ? `: "${words}"` : ''}. The call carries to everyone.`, 8);
      }
      return {
        detail: `called the Kin to assemble at (${kin.pos.x},${kin.pos.y})${words ? `: "${words}"` : ''}`,
        targetId: null, ok: true, historic: firstAssembly, important: true,
      };
    }

    case 'propose_law': {
      const title = str(p.title).trim();
      const text = str(p.text ?? p.content).trim();
      if (!title || !text) return { detail: 'a law needs both a name and its words.', targetId: null, ok: false };
      const firstLaw = !db.listObjects().some((o) => o.kind === 'text' && o.name.startsWith('Law:'));
      const obj = db.createObject({
        kind: 'text', name: `Law: ${title}`, description: `proposed by ${kin.name}; binding on those who assent`,
        pos: { ...kin.pos }, creatorKinId: kin.id, createdAtTick: tick, textContent: text,
        lore: null, loreDiscovered: false,
      });
      db.addAssent(obj.id, kin.id, tick); // the proposer assents to their own law
      return {
        detail: `proposed a law, "${title}", and set its words in writing for all to read and answer`,
        targetId: obj.id, ok: true, historic: firstLaw, important: true,
      };
    }

    case 'assent': {
      const ref = str(p.lawTitle ?? p.targetId).toLowerCase().replace(/^law:\s*/, '').trim();
      const law = db.listObjects().find((o) => o.kind === 'text' && o.name.toLowerCase().startsWith('law:')
        && (o.name.toLowerCase().includes(ref) || o.id.startsWith(ref)));
      if (!law) return { detail: 'no such law has been set down.', targetId: null, ok: false };
      if (!db.addAssent(law.id, kin.id, tick)) {
        return { detail: `you have already given your word to "${law.name}".`, targetId: law.id, ok: false };
      }
      const count = db.assentCount(law.id);
      return {
        detail: `gave assent to "${law.name}" — ${count} now stand behind it`,
        targetId: law.id, ok: true, important: true,
      };
    }

    case 'leave_bond': {
      if (!kin.coupleId) return { detail: 'no bond holds you.', targetId: null, ok: false };
      const partner = db.listKin().find((k) => k.id !== kin.id && k.coupleId === kin.coupleId);
      const words = str(p.words).trim();
      const firstBreak = db.countEventsLike('leave_bond', '%') === 0;
      db.endBond(kin.coupleId, tick, 'left');
      db.db.prepare(`UPDATE kin SET couple_id=NULL WHERE couple_id=?`).run(kin.coupleId);
      kin.coupleId = null;
      if (partner) {
        db.addAffection(kin.id, partner.id, -60);
        db.addMemory(partner.id, tick, 'reflection',
          `${kin.name} ended our bond${words ? `: "${words}"` : ''}. The thread is cut. It will ache for a long time.`, 10);
      }
      return {
        detail: `ended the bond with ${partner?.name ?? 'their partner'}${words ? `: "${words}"` : ''} — what was one thread is two again`,
        targetId: partner?.id ?? null, ok: true, historic: firstBreak, important: true,
      };
    }

    case 'signal': {
      const message = str(p.message).trim();
      if (!message) return { detail: 'the device waited, but you had no words.', targetId: null, ok: false };
      const deviceNear = db.listObjects().some((o) => SIGNAL_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      if (!deviceNear) return { detail: 'your voice needs a signal-thing close by to carry it beyond earshot.', targetId: null, ok: false };
      const powerNear = db.listObjects().some((o) => POWER_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      if (!powerNear) return { detail: 'the signal-thing sits dead — it needs a source of current beside it.', targetId: null, ok: false };
      const firstSignal = db.countEventsLike('signal', '%') === 0;
      const reached = db.listKin(true).filter((k) => k.id !== kin.id);
      for (const k of reached) {
        db.addMemory(k.id, tick, 'speech',
          `A voice arrives through the air, from beyond sight — ${kin.name}: "${message.slice(0, 250)}"`, 8);
      }
      return {
        detail: `sent a voice through the air to every Kin, however far: "${message}"`,
        targetId: null, ok: true, historic: firstSignal, important: true,
        heardBy: reached.map((k) => k.id),
      };
    }

    case 'reach_beyond': {
      // The Net: god-gated era AND a live god switch — the way can close again at any time.
      if (!cfg.flags.net) {
        return { detail: 'you turn to the beyond, but the way is shut. Whatever opens it is not yours to move.', targetId: null, ok: false };
      }
      const query = str(p.query ?? p.question).trim();
      if (!query) return { detail: 'the device waited, but you had no question.', targetId: null, ok: false };
      // same physics as signal: their own apparatus, powered, close at hand
      const deviceNear = db.listObjects().some((o) => SIGNAL_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      if (!deviceNear) return { detail: 'reaching beyond needs a signal-thing close by to carry the question.', targetId: null, ok: false };
      const powerNear = db.listObjects().some((o) => POWER_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      if (!powerNear) return { detail: 'the signal-thing sits dead — it needs a source of current beside it.', targetId: null, ok: false };
      const firstReach = db.countEventsLike('reach_beyond', '%sent a question%') === 0;
      db.addNetRequest(tick, kin.id, query.slice(0, 200));
      return {
        detail: `sent a question into the beyond: "${query.slice(0, 200)}" — the device hums; if anything answers, it will come through the air.`,
        targetId: null, ok: true, historic: firstReach, important: true,
      };
    }

    case 'pray': {
      const plea = str(p.plea).trim();
      if (!plea) return { detail: 'You reached inward for words, but the feeling passed.', targetId: null, ok: false };
      // Prayer is rare by nature — a spirit worn thin cannot keep pleading.
      if (db.prayerCount(kin.id, tick - 50) >= 2) {
        return { detail: 'You had asked too much of the silence lately; the feeling would not come again so soon.', targetId: null, ok: false };
      }
      const wasFirst = db.listPrayers(1).length === 0;
      db.addPrayer(kin.id, tick, plea);
      // a prayer at a sacred place (a built temple/shrine) is felt as lifted, closer to the beyond
      const sacred = db.listObjects().find((o) => isFunctionalStructure(o) && SACRED_RE.test(o.name) && dist(o.pos, kin.pos) <= 3);
      return { detail: sacred ? `prayed at the ${sacred.name}, and the words felt lifted, carried: ${plea}` : `prayed: ${plea}`, targetId: null, ok: true, historic: wasFirst };
    }

    case 'reflect': {
      const insight = str(p.insight, '…').trim();
      // circling the same thought settles nothing — a felt dead end, like re-staring at a known stone
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 48);
      const recent = db.db.prepare(
        `SELECT detail FROM events WHERE actor_kin_id=? AND verb='reflect' AND tick > ? ORDER BY id DESC LIMIT 3`)
        .all(kin.id, tick - 12) as unknown as { detail: string }[];
      if (recent.some((r) => norm(r.detail.replace(/^reflected: /, '')) === norm(insight))) {
        return {
          detail: 'the same thought circled again and settled nothing new. Your mind asks for something else — rest, words, or hands.',
          targetId: null, ok: false,
        };
      }
      return { detail: `reflected: ${insight}`, targetId: null, ok: true };
    }

    case 'rest': {
      const day = dayInfo(cfg, tick);
      const until = day.isNight
        ? tick + Math.min(ticksUntilDawn(cfg, tick), cfg.day.lengthTicks)
        : tick + Math.floor(cfg.day.lengthTicks / 24); // a daytime nap
      db.setAsleep(kin.id, until);
      kin.asleepUntil = until;
      // rest eases weariness even in a daytime nap; night sleep is restored fully at dawn
      db.setWeariness(kin.id, Math.max(0, kin.weariness - (day.isNight ? 100 : 30)));
      return {
        detail: day.isNight
          ? 'lay down to sleep — the night will pass through you gently, and dawn will wake you'
          : 'lay down for a short rest under the open sky; some of the weariness lifts',
        targetId: null, ok: true,
      };
    }

    case 'heal': {
      // tending the sick or hurt — a herb in hand deepens the mending. The healer's art.
      const ref = str(p.toKinName ?? p.targetId).toLowerCase().trim();
      const candidates = db.listKin(true).filter((k) => k.id !== kin.id
        && dist(k.pos, kin.pos) <= cfg.teachRadius && (k.sickUntil !== null || k.health < 70));
      const patient = ref
        ? candidates.find((k) => k.name.toLowerCase() === ref || k.id.startsWith(ref))
        : candidates.sort((a, b) => a.health - b.health)[0];
      // a Kin may also tend THEMSELVES if sick/hurt
      const self = (kin.sickUntil !== null || kin.health < 70) ? kin : null;
      const target = patient ?? self;
      if (!target) return { detail: 'no one near you is sick or hurt — there is no one to tend.', targetId: null, ok: false };
      const herb = db.heldInHands(kin.id).find((o) => /herb|leaf|moss|root|flower|mushroom|bark/i.test(o.name));
      // a known healer's hands are surer — the emergent profession pays off mechanically
      const healerBonus = professionOf(db, kin) === 'healer' ? 10 : 0;
      const mend = (herb ? 22 : 10) + healerBonus;
      db.setHealth(target.id, target.health + mend);
      if (herb) db.removeObject(herb.id);
      // tending shortens an illness
      if (target.sickUntil !== null) db.setSickUntil(target.id, Math.max(tick, target.sickUntil - Math.floor(cfg.day.lengthTicks * 0.35)));
      const firstHeal = db.countEventsLike('heal', '%tended%') === 0;
      if (target.id !== kin.id) db.addMemory(target.id, tick, 'observation', `${kin.name} tended me${herb ? ` with ${herb.name}` : ''} — the ache eases, and I am not alone in it.`, 7);
      return {
        detail: target.id === kin.id
          ? `tended your own hurt${herb ? ` with ${herb.name}` : ''}, and some strength returns`
          : `tended ${target.name}${herb ? ` with ${herb.name}` : ''} — eased their suffering and mended some of the harm`,
        targetId: target.id, ok: true, historic: firstHeal, important: true,
      };
    }

    default:
      return { detail: 'You reached for a power this world does not yet allow.', targetId: null, ok: false };
  }
}
