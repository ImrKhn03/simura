/** SIMURA shared types — the public contract between server, web, and tests. */

export type Gender = 'sol' | 'lune';

export type Verb =
  | 'move'
  | 'observe'
  | 'gather'
  | 'carry'
  | 'drop'
  | 'give'
  | 'name_place'
  | 'speak'
  | 'craft'
  | 'build'
  | 'write'
  | 'read'
  | 'teach'
  | 'learn'
  | 'author_skill'
  | 'refine_skill'
  | 'reflect'
  | 'rest'
  | 'pray'
  | 'propose_bond'
  | 'accept_bond'
  | 'decline'
  | 'propose_child'
  | 'accept_child'
  | 'wear'
  | 'remove'
  | 'plant'
  | 'sing'
  | 'trade'
  | 'accept_trade'
  | 'assemble'
  | 'propose_law'
  | 'assent'
  | 'leave_bond'
  | 'signal'
  | 'reach_beyond'
  | 'eat'
  | 'cook'
  | 'bury'
  | 'name_child'
  | 'tame'
  | 'ritual'
  | 'mate'
  | 'heal'
  | 'play'
  | 'dance';

/** Verbs available from birth (Era 0 — The Waking). Love, intimacy, and naming
 *  your own child need no era — they are as old as bodies and hearts. */
export const ERA0_VERBS: Verb[] = [
  'move', 'observe', 'gather', 'carry', 'drop', 'give', 'name_place', 'speak', 'teach', 'learn',
  'author_skill', 'refine_skill', 'reflect', 'rest', 'pray', 'propose_bond', 'accept_bond', 'decline',
  'eat', 'name_child', 'heal', 'play',
];

export interface Place {
  id: number;
  name: string;
  pos: Position;
  namedByKinId: string;
  tick: number;
}

/** One box of a Kin-designed shape: offsets (x,y,z), sizes (w,h,d), hex color (c). */
export interface ShapePart {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  c: string;
}

/** Gated by the reproduction flag: intimacy between a bonded Sol+Lune. Mutual
 *  mating conceives a new life — it is not scripted; both must reach for it. */
export const REPRODUCTION_VERBS: Verb[] = ['mate'];

/** Era number → verbs it unlocks. (Some eras unlock materials/physics rather than verbs.) */
export const ERA_VERBS: Record<number, Verb[]> = {
  1: ['craft', 'build', 'cook'], // The Making: hands that shape things, raise shelter, and cook over fire
  2: [],                  // The Building: refinement of structures (no new verb; unlocks bigger builds by threshold)
  3: ['write', 'read'],
  4: ['bury'], // The Hearth: family — the dead are laid to rest (naming a child is innate, Era 0)
  6: ['wear', 'remove'],
  8: ['plant', 'tame'],   // The Sowing: gatherers grow crops and keep animals
  9: ['sing', 'ritual', 'dance'],  // The Song: beauty, dance, and gathering for shared meaning
  10: ['trade', 'accept_trade'],
  11: ['assemble', 'propose_law', 'assent', 'leave_bond'],
  15: ['signal'],
  16: ['reach_beyond'], // The Net: god-gated, never by threshold — the one door only god opens
};

export const ERA_NAMES: Record<number, string> = {
  0: 'The Waking',
  1: 'The Making',
  2: 'The Building',
  3: 'The Letters',
  4: 'The Hearth',
  5: 'The Sack',      // containers: bags extend what hands can hold
  6: 'The Loom',      // clothing, worn and self-designed
  7: 'The Sky',       // the moon and the seasons appear
  8: 'The Sowing',    // planting
  9: 'The Song',      // art for its own sake
  10: 'The Market',   // trade by mutual consent
  11: 'The Law',      // assembly, written law, assent — and bonds may be ended
  12: 'The Forge',    // metal: ore + fire
  13: 'The Wheel',    // carts multiply what travels with you
  14: 'The Current',  // energy: powered light without flame
  15: 'The Signal',   // voices across any distance
  16: 'The Net',      // god-gated, always
};

/** the last era achievable by behavior; The Net (16) opens only by god's hand */
export const MAX_ACHIEVABLE_ERA = 15;

export interface Position { x: number; y: number }

/** Innate cognitive constants — genders are mechanical, not cosmetic. */
export interface Temperament {
  /** 0..1 — bias toward exploration / novel action (Sol high) */
  explorationDrive: number;
  /** 0..1 — memory retention & summary richness (Lune high) */
  memoryDepth: number;
  /** 0..1 — affinity for authoring NEW skillfiles (Sol high) */
  authorAffinity: number;
  /** 0..1 — affinity for refining/teaching existing skills (Lune high) */
  refineAffinity: number;
}

export const SOL_TEMPERAMENT: Temperament = {
  explorationDrive: 0.8, memoryDepth: 0.35, authorAffinity: 0.8, refineAffinity: 0.35,
};
export const LUNE_TEMPERAMENT: Temperament = {
  explorationDrive: 0.35, memoryDepth: 0.85, authorAffinity: 0.35, refineAffinity: 0.85,
};

export interface Kin {
  id: string;
  name: string;
  gender: Gender;
  parentSolId: string | null;
  parentLuneId: string | null;
  bornAtTick: number;
  diedAtTick: number | null;
  immortal: boolean;
  /** funded lifespan in remaining think-ticks; ignored while immortal */
  endowmentTicks: number;
  modelEndpoint: string;
  modelName: string;
  /** name of the env var holding this Kin's API key — keys never live in the DB */
  apiKeyRef: string;
  temperament: Temperament;
  pos: Position;
  status: 'alive' | 'fading' | 'dead';
  /** self-written note-to-self carried between ticks — the Kin's own plan, never ours */
  intention: string | null;
  /** standing multi-step plan, self-written and self-updated (max 6 steps) */
  plan: string[] | null;
  /** asleep until this tick (no thoughts, no endowment burn); null = awake */
  asleepUntil: number | null;
  /** shared id of a bonded pair; null while unbonded */
  coupleId: string | null;
  /** 100 = fed, 0 = starving. Decays with time; eating restores it. Hunger is felt, and for mortals it burns the light faster. */
  fullness: number;
  /** 100 = whole, 0 = failing. Harmed by sickness, exposure, starvation; mends with food, rest, shelter, tending. At 0 a mortal dies. */
  health: number;
  /** 0 = fresh, 100 = spent. Rises with waking effort; eased by rest and sleep. High weariness dulls the body and mind. */
  weariness: number;
  /** if sick: the tick the illness breaks; null = well. Sickness spreads, saps health, and is eased by tending, rest, and warmth. */
  sickUntil: number | null;
  /** the last tick this Kin accomplished something real (made, taught, ate, gave…) — drives the glow of satisfaction and the itch of restlessness */
  lastFulfilledTick: number;
  /** carrying a STAR (Sol + Lune → a new star): the tick it will rise (be born); null = not carrying */
  starRisesAt: number | null;
  /** the other parent of the star being carried; null = not carrying */
  starWithId: string | null;
  /** a standing reach toward a partner for intimacy; when both reach, a star is kindled. null = none */
  mateToward: string | null;
}

/**
 * Browser-safe Kin state. This is an explicit allowlist: never extend or spread
 * the persisted Kin record into a public payload because it contains model and
 * key-routing configuration. Human-facing derived wording is added server-side.
 */
export interface PublicKinSnapshot {
  id: string;
  name: string;
  gender: Gender;
  parentSolId: string | null;
  parentLuneId: string | null;
  bornAtTick: number;
  diedAtTick: number | null;
  immortal: boolean;
  pos: Position;
  status: Kin['status'];
  intention: string | null;
  plan: string[] | null;
  asleepUntil: number | null;
  coupleId: string | null;
  fullness: number;
  health: number;
  weariness: number;
  sickUntil: number | null;
  lastFulfilledTick: number;
  starRisesAt: number | null;
  starWithId: string | null;
  presentation: KinPresentation;
}

export interface KinPresentation {
  mood: number;
  vitality: number;
  moodBand: 'despair' | 'low' | 'steady' | 'glad';
  lifeStage: 'infant' | 'child' | 'adult' | 'elder';
  lifeProgress: number;
  lifePhrase: string;
  fundedLife: number | null;
  fundedLifePhrase: string;
  personality: string;
  profession: string | null;
  renown: string | null;
  notoriety: string | null;
  /** Exact physical precious-item count, reserved for disclosed economy depth. */
  wealthValue: number;
  wealthBand: 'little' | 'comfortable' | 'wealthy';
  lineage: string;
  conditionLine: string;
  identityLine: string;
  starPhrase: string | null;
  knownTo: number;
  founder: boolean;
  adopted: boolean;
  flags: {
    asleep: boolean; fading: boolean; sick: boolean; hungry: boolean; weary: boolean;
    carryingStar: boolean; bonded: boolean; clothed: boolean; fulfilled: boolean; restless: boolean;
  };
}

export type PublicCalamityKind = 'drought' | 'coldsnap' | 'plague' | 'wildfire' | 'flood';

export interface PublicCalamityView {
  kind: PublicCalamityKind;
  line: string;
  /** 0..1 of the calamity remaining; display as a rough bar, never raw ticks. */
  remaining: number;
  remainingPhrase: string;
}

export interface WorldPresentation {
  calamity: PublicCalamityView | null;
  dayPart: 'dawn' | 'day' | 'dusk' | 'night';
  season: 'spring' | 'summer' | 'autumn' | 'winter' | null;
  economy?: {
    physicalCurrency: number;
    currencyPhrase: string;
    holders: { name: string; amount: number; standing: string }[];
    recentTrades: string[];
  };
  worldHealth?: {
    living: number;
    populationPhrase: string;
    foodCount: number;
    foodPhrase: string;
    predators: number;
    predatorPhrase: string;
    calamityPhrase: string;
    eraPhrase: string;
  };
}

export type MemoryKind = 'observation' | 'action' | 'speech' | 'reflection' | 'summary';

export interface Memory {
  id: number;
  kinId: string;
  tick: number;
  kind: MemoryKind;
  content: string;
  importance: number; // 1..10
}

export interface Skillfile {
  id: string;
  ownerKinId: string;
  name: string;
  content: string; // markdown
  version: number;
  refinedCount: number;
  learnedFromKinId: string | null;
  createdAtTick: number;
}

export type WorldObjectKind =
  | 'tree' | 'stone' | 'water' | 'plant' | 'flower' | 'landmark'
  | 'fish' | 'deer' | 'fowl' | 'predator'
  | 'gathered' | 'crafted' | 'structure' | 'text';

/** prey creatures — spawn by biome, wander, flee, breed, and can be caught with the right tool */
export const FAUNA_KINDS: WorldObjectKind[] = ['fish', 'deer', 'fowl'];

export type BuildArchetype = 'cottage' | 'longhouse' | 'hut' | 'hall' | 'granary' | 'wall' | 'tower' | 'shrine' | 'well' | 'fence';
export type BuildSize = 'small' | 'large';
export type BuildMaterial = 'wood' | 'stone' | 'clay' | 'thatch';
export type DyeName = 'berry' | 'ochre' | 'charcoal' | 'clay' | 'indigo' | 'sage' | 'bone' | 'gold';
export type CraftTemplate = 'tool' | 'vessel' | 'garment' | 'coin';

export interface BuildDesignSpec {
  version: 1;
  archetype: BuildArchetype;
  size: BuildSize;
  material: BuildMaterial;
  dye?: DyeName;
  /** completed base stages, 0..stageCount */
  stage: number;
  stageCount: number;
  complete: boolean;
  /** a completed base remains functional while this independent addition rises */
  addition?: { kind: 'room' | 'wing'; stage: number; stageCount: 3; complete: boolean } | null;
}

export interface WorldObject {
  id: string;
  kind: WorldObjectKind;
  name: string;
  description: string;
  pos: Position;
  creatorKinId: string | null;
  createdAtTick: number;
  /** for kind 'text': the written content */
  textContent: string | null;
  /** hidden truth about this thing, revealed on first close observation */
  lore: string | null;
  loreDiscovered: boolean;
  /** id of the Kin carrying this object (position follows them); null = on the ground */
  carriedBy: string | null;
  /** id of the CONTAINER object this is stored inside; null = not stored. Stored things are off the ground and out of hands. */
  storedIn: string | null;
  /** for rooted nature (tree/stone/plant/flower): gathers remaining before it is spent. null = untouched. 0 = spent (a stump, bare rock). */
  yieldLeft: number | null;
  /** Kin-designed geometry (JSON ShapePart[]) — null renders the default mesh for its kind */
  shape: ShapePart[] | null;
  /** versioned server-owned architecture metadata; null means legacy/freeform physics */
  designSpec: BuildDesignSpec | null;
  /** true for fire-things: pushes back the dark for anyone near it */
  emitsLight: boolean;
  /** worn on the body (doesn't occupy hands; warmth against the night) */
  worn: boolean;
  /** read-only renderer meaning for real fauna; absent on non-creatures and persisted rows */
  creature?: CreaturePresentation;
}

export interface CreaturePresentation {
  species: string;
  family: 'fish' | 'hoofed' | 'small-game' | 'fowl' | 'wolf' | 'great-cat';
  young: boolean;
  kept: boolean;
  activity: 'swimming' | 'fleeing' | 'grazing' | 'foraging' | 'kept' | 'prowling' | 'hunting' | 'lunging' | 'fleeing-fire';
  activityPhrase: string;
  threatenedKinIds: string[];
  lore: string | null;
}

export interface WorldEvent {
  id: number;
  tick: number;
  actorKinId: string | null; // null = the world / god
  verb: string;
  targetId: string | null;
  detail: string;
  /** private thought that led to the action (shown muted in UI) */
  thought: string | null;
  historic: boolean;
  /** for speech: ids of Kin who actually heard it (historical reconstructability) */
  heardBy?: string[] | null;
}

export interface EraRecord {
  era: number;
  name: string;
  unlockedAtTick: number;
  trigger: 'achievement' | 'god' | 'genesis';
}

/** What a mind returns each tick. */
export interface ActionChoice {
  thought: string;
  verb: Verb;
  params: Record<string, unknown>;
  /** optional self-written plan carried to the next tick */
  intention?: string;
  /** optional standing multi-step plan (replaces the current one; [] clears it) */
  plan?: string[];
  /** optional spoken words for a visitor from beyond — carried ALONGSIDE the deed, never instead of it */
  say?: string;
}

/** Snapshot pushed to the UI every tick. */
export interface WorldSnapshot {
  tick: number;
  era: number;
  /** 0..1 position in the day cycle (0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight) */
  dayPhase: number;
  weather: 'clear' | 'cloudy' | 'rain' | 'fog' | 'storm' | 'snow';
  /** ms per tick — lets the client animate movement to land exactly on the next tick */
  tickMs?: number;
  /** this world's generation seed — drives procedural terrain on the client */
  seed: number;
  /** well-walked ground: emergent trails (x, y, visit count) */
  trails: { x: number; y: number; c: number }[];
  map: { width: number; height: number; minX: number; minY: number };
  kin: PublicKinSnapshot[];
  objects: WorldObject[];
  places: Place[];
  recentEvents: WorldEvent[];
  presentation: WorldPresentation;
}

export interface KinStats {
  kinId: string;
  ticksLived: number;
  tokensIn: number;
  tokensOut: number;
  verbCounts: Record<string, number>;
  /** 0..1 — how repetitive recent verb choices are (rut detection) */
  repetitionScore: number;
  skillfileCount: number;
  memoryCount: number;
}
