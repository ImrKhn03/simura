import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  EraRecord, Gender, Kin, Memory, MemoryKind, Place, Skillfile, Temperament,
  BuildDesignSpec, WorldEvent, WorldObject, WorldObjectKind, Position,
} from '../shared/types.ts';
import { parseStoredDesign } from './world/construction.ts';

function parseDesignJson(value: string | null): BuildDesignSpec | null {
  if (!value) return null;
  try { return parseStoredDesign(JSON.parse(value) as unknown); }
  catch { console.warn('Unreadable construction design metadata; preserving its stored shape as legacy work.'); return null; }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kin (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('sol','lune')),
  parent_sol_id TEXT REFERENCES kin(id),
  parent_lune_id TEXT REFERENCES kin(id),
  born_at_tick INTEGER NOT NULL,
  died_at_tick INTEGER,
  immortal INTEGER NOT NULL DEFAULT 0,
  endowment_ticks INTEGER NOT NULL DEFAULT 0,
  model_endpoint TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  api_key_ref TEXT NOT NULL DEFAULT '',
  temperament TEXT NOT NULL,
  x INTEGER NOT NULL, y INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive','fading','dead')),
  intention TEXT,
  couple_id TEXT
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  tick INTEGER NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3
);
CREATE INDEX IF NOT EXISTS idx_memories_kin ON memories(kin_id, tick);
CREATE TABLE IF NOT EXISTS skillfiles (
  id TEXT PRIMARY KEY,
  owner_kin_id TEXT NOT NULL REFERENCES kin(id),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  refined_count INTEGER NOT NULL DEFAULT 0,
  learned_from_kin_id TEXT REFERENCES kin(id),
  created_at_tick INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  actor_kin_id TEXT REFERENCES kin(id),
  verb TEXT NOT NULL,
  target_id TEXT,
  detail TEXT NOT NULL,
  thought TEXT,
  historic INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
CREATE TABLE IF NOT EXISTS eras (
  era INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  unlocked_at_tick INTEGER NOT NULL,
  trigger TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS world_objects (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  x INTEGER NOT NULL, y INTEGER NOT NULL,
  creator_kin_id TEXT REFERENCES kin(id),
  created_at_tick INTEGER NOT NULL,
  text_content TEXT,
  lore TEXT,
  lore_discovered INTEGER NOT NULL DEFAULT 0,
  carried_by TEXT REFERENCES kin(id),
  shape TEXT
);
CREATE TABLE IF NOT EXISTS affection (
  kin_a TEXT NOT NULL REFERENCES kin(id),
  kin_b TEXT NOT NULL REFERENCES kin(id),
  score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (kin_a, kin_b)
);
CREATE TABLE IF NOT EXISTS bonds (
  couple_id TEXT PRIMARY KEY,
  kin_a TEXT NOT NULL REFERENCES kin(id),
  kin_b TEXT NOT NULL REFERENCES kin(id),
  formed_tick INTEGER NOT NULL,
  ended_tick INTEGER,
  end_reason TEXT
);
CREATE TABLE IF NOT EXISTS bond_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bond','child')),
  from_kin_id TEXT NOT NULL REFERENCES kin(id),
  to_kin_id TEXT NOT NULL REFERENCES kin(id),
  child_name TEXT,
  words TEXT,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS named_things (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  object_id TEXT NOT NULL REFERENCES world_objects(id),
  given_name TEXT NOT NULL,
  tick INTEGER NOT NULL,
  UNIQUE(object_id, given_name)
);
CREATE TABLE IF NOT EXISTS teach_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  teacher_kin_id TEXT NOT NULL REFERENCES kin(id),
  learner_kin_id TEXT NOT NULL REFERENCES kin(id),
  skillfile_id TEXT NOT NULL,
  success INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wants_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  utterance TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  plea TEXT NOT NULL,
  answered INTEGER NOT NULL DEFAULT 0,
  answer TEXT
);
CREATE TABLE IF NOT EXISTS adoptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  donor TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  key_ref TEXT NOT NULL,          -- env var NAME only; the key itself never enters the DB
  adopted_at_tick INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active | faded | revoked
  prev_endpoint TEXT NOT NULL,
  prev_model TEXT NOT NULL,
  prev_key_ref TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS net_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  answer TEXT,
  source TEXT
);
CREATE TABLE IF NOT EXISTS visitor_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kin_id TEXT NOT NULL REFERENCES kin(id),
  from_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_tick INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  x INTEGER NOT NULL, y INTEGER NOT NULL,
  named_by_kin_id TEXT NOT NULL REFERENCES kin(id),
  tick INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  from_kin_id TEXT NOT NULL REFERENCES kin(id),
  to_kin_id TEXT NOT NULL REFERENCES kin(id),
  give_item_id TEXT NOT NULL REFERENCES world_objects(id),
  want_item_id TEXT NOT NULL REFERENCES world_objects(id),
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS law_assents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_object_id TEXT NOT NULL REFERENCES world_objects(id),
  kin_id TEXT NOT NULL REFERENCES kin(id),
  tick INTEGER NOT NULL,
  UNIQUE(law_object_id, kin_id)
);
CREATE TABLE IF NOT EXISTS trails (
  x INTEGER NOT NULL, y INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (x, y)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kin_id TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS action_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  kin_id TEXT NOT NULL,
  verb TEXT NOT NULL,
  parameter_chars INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL,
  failure_kind TEXT
);
CREATE INDEX IF NOT EXISTS idx_world_objects_collision ON world_objects(kind,x,y);
`;

interface KinRow {
  id: string; name: string; gender: Gender;
  parent_sol_id: string | null; parent_lune_id: string | null;
  born_at_tick: number; died_at_tick: number | null;
  immortal: number; endowment_ticks: number;
  model_endpoint: string; model_name: string; api_key_ref: string;
  temperament: string; x: number; y: number; status: Kin['status'];
  intention: string | null; couple_id: string | null; plan: string | null; asleep_until: number | null;
}

interface ObjectRow {
  id: string; kind: WorldObjectKind; name: string; description: string; x: number; y: number;
  creator_kin_id: string | null; created_at_tick: number; text_content: string | null;
  lore: string | null; lore_discovered: number;
  carried_by: string | null; shape: string | null; emits_light: number; worn: number;
  design_spec?: string | null;
}

function rowToKin(r: KinRow): Kin {
  return {
    id: r.id, name: r.name, gender: r.gender,
    parentSolId: r.parent_sol_id, parentLuneId: r.parent_lune_id,
    bornAtTick: r.born_at_tick, diedAtTick: r.died_at_tick,
    immortal: !!r.immortal, endowmentTicks: r.endowment_ticks,
    modelEndpoint: r.model_endpoint, modelName: r.model_name, apiKeyRef: r.api_key_ref,
    temperament: JSON.parse(r.temperament) as Temperament,
    pos: { x: r.x, y: r.y }, status: r.status,
    intention: r.intention, coupleId: r.couple_id,
    plan: r.plan ? JSON.parse(r.plan) as string[] : null,
    asleepUntil: r.asleep_until,
    fullness: (r as unknown as { fullness: number | null }).fullness ?? 100,
    lastFulfilledTick: (r as unknown as { last_fulfilled_tick: number | null }).last_fulfilled_tick ?? 0,
    starRisesAt: (r as unknown as { pregnant_until: number | null }).pregnant_until ?? null,
    starWithId: (r as unknown as { pregnant_with_id: string | null }).pregnant_with_id ?? null,
    mateToward: (r as unknown as { mate_toward: string | null }).mate_toward ?? null,
    health: (r as unknown as { health: number | null }).health ?? 100,
    weariness: (r as unknown as { weariness: number | null }).weariness ?? 0,
    sickUntil: (r as unknown as { sick_until: number | null }).sick_until ?? null,
  };
}

export class WorldDB {
  readonly db: DatabaseSync;
  private nestedTransactionId = 0;

  constructor(path: string) {
    const persistentExisting = path !== ':memory:' && existsSync(path);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
    // migrations for worlds born before these columns existed
    this.ensureColumn('kin', 'intention', 'TEXT');
    this.ensureColumn('kin', 'couple_id', 'TEXT');
    this.ensureColumn('world_objects', 'lore', 'TEXT');
    this.ensureColumn('world_objects', 'lore_discovered', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('world_objects', 'carried_by', 'TEXT REFERENCES kin(id)');
    this.ensureColumn('world_objects', 'shape', 'TEXT');
    this.ensureColumn('events', 'heard_by', 'TEXT');
    this.ensureColumn('prayers', 'answer_delivered', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('memories', 'embedding', 'BLOB');
    this.ensureColumn('kin', 'plan', 'TEXT');
    this.ensureColumn('world_objects', 'emits_light', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('kin', 'asleep_until', 'INTEGER');
    this.ensureColumn('world_objects', 'worn', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('world_objects', 'stored_in', 'TEXT'); // containment: things kept inside containers
    this.ensureColumn('kin', 'fullness', 'REAL NOT NULL DEFAULT 100'); // hunger: fed=100, starving=0
    this.ensureColumn('kin', 'last_fulfilled_tick', 'INTEGER NOT NULL DEFAULT 0'); // drive: last real accomplishment
    // stored under legacy column names; the world's word for this is "carrying a star"
    this.ensureColumn('kin', 'pregnant_until', 'INTEGER'); // starRisesAt: tick the new star is born
    this.ensureColumn('kin', 'pregnant_with_id', 'TEXT');  // the other parent
    this.ensureColumn('kin', 'mate_toward', 'TEXT');       // a standing reach for intimacy
    this.ensureColumn('kin', 'health', 'REAL NOT NULL DEFAULT 100');   // body: whole=100, failing=0
    this.ensureColumn('kin', 'weariness', 'REAL NOT NULL DEFAULT 0');  // tiredness: fresh=0, spent=100
    this.ensureColumn('kin', 'sick_until', 'INTEGER');                 // illness: tick it breaks
    this.ensureColumn('world_objects', 'yield_left', 'INTEGER'); // depletion: how much a rooted thing still gives (NULL = untouched)
    const objectColumns = this.db.prepare('PRAGMA table_info(world_objects)').all() as unknown as { name: string }[];
    if (!objectColumns.some((c) => c.name === 'design_spec')) {
      if (persistentExisting) this.backupBeforeDesignMigration(path);
      this.ensureColumn('world_objects', 'design_spec', 'TEXT');
    }
  }

  private backupBeforeDesignMigration(path: string): void {
    const backupPath = `${path}.pre-design-v1.${Date.now()}.bak`;
    const escaped = backupPath.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    const verify = new DatabaseSync(backupPath, { readOnly: true });
    verify.prepare('SELECT COUNT(*) AS c FROM world_objects').get();
    verify.close();
  }

  private ensureColumn(table: string, column: string, decl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
  }

  close(): void { this.db.close(); }

  // --- meta / tick counter ---
  getMeta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key=?`).get(key) as unknown as { value: string } | undefined;
    return row ? row.value : null;
  }
  setMeta(key: string, value: string): void {
    this.db.prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
  }
  getTick(): number {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key='tick'`).get() as unknown as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  }
  setTick(tick: number): void {
    this.db.prepare(`INSERT INTO meta(key,value) VALUES('tick',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(tick));
  }

  // --- kin ---
  createKin(k: Omit<Kin, 'id' | 'plan' | 'asleepUntil' | 'fullness' | 'lastFulfilledTick' | 'starRisesAt' | 'starWithId' | 'mateToward' | 'health' | 'weariness' | 'sickUntil'> & { id?: string; plan?: string[] | null; asleepUntil?: number | null; fullness?: number; lastFulfilledTick?: number }): Kin {
    const id = k.id ?? randomUUID();
    this.db.prepare(`INSERT INTO kin
      (id,name,gender,parent_sol_id,parent_lune_id,born_at_tick,died_at_tick,immortal,
       endowment_ticks,model_endpoint,model_name,api_key_ref,temperament,x,y,status,intention,couple_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, k.name, k.gender, k.parentSolId, k.parentLuneId, k.bornAtTick, k.diedAtTick,
        k.immortal ? 1 : 0, k.endowmentTicks, k.modelEndpoint, k.modelName, k.apiKeyRef,
        JSON.stringify(k.temperament), k.pos.x, k.pos.y, k.status, k.intention, k.coupleId);
    return { ...k, id, plan: k.plan ?? null, asleepUntil: k.asleepUntil ?? null, fullness: k.fullness ?? 100, lastFulfilledTick: k.lastFulfilledTick ?? 0, starRisesAt: null, starWithId: null, mateToward: null, health: 100, weariness: 0, sickUntil: null };
  }
  setHealth(kinId: string, v: number): void {
    this.db.prepare(`UPDATE kin SET health=? WHERE id=?`).run(Math.max(0, Math.min(100, v)), kinId);
  }
  setWeariness(kinId: string, v: number): void {
    this.db.prepare(`UPDATE kin SET weariness=? WHERE id=?`).run(Math.max(0, Math.min(100, v)), kinId);
  }
  setSickUntil(kinId: string, until: number | null): void {
    this.db.prepare(`UPDATE kin SET sick_until=? WHERE id=?`).run(until, kinId);
  }
  /** set/clear a Kin's carrying of a new star (tick it rises/is born, co-parent id) */
  setStar(kinId: string, risesAt: number | null, withId: string | null): void {
    this.db.prepare(`UPDATE kin SET pregnant_until=?, pregnant_with_id=? WHERE id=?`).run(risesAt, withId, kinId);
  }
  setMateToward(kinId: string, towardId: string | null): void {
    this.db.prepare(`UPDATE kin SET mate_toward=? WHERE id=?`).run(towardId, kinId);
  }
  setIntention(id: string, intention: string | null): void {
    this.db.prepare(`UPDATE kin SET intention=? WHERE id=?`).run(intention, id);
  }
  setAsleep(id: string, until: number | null): void {
    this.db.prepare(`UPDATE kin SET asleep_until=? WHERE id=?`).run(until, id);
  }
  setPlan(id: string, plan: string[] | null): void {
    this.db.prepare(`UPDATE kin SET plan=? WHERE id=?`).run(plan && plan.length ? JSON.stringify(plan) : null, id);
  }
  setCouple(idA: string, idB: string, coupleId: string): void {
    this.db.prepare(`UPDATE kin SET couple_id=? WHERE id IN (?,?)`).run(coupleId, idA, idB);
  }

  // --- affection (interaction physics; god never sets it) ---
  private pairKey(a: string, b: string): [string, string] { return a < b ? [a, b] : [b, a]; }
  /** change affection. `floor` defaults to 0 (drifting apart is neutral, not enmity);
   *  a deliberate wrong passes floor=-100 so bad blood — negative affection — can build. */
  addAffection(a: string, b: string, delta: number, floor = 0): number {
    const [ka, kb] = this.pairKey(a, b);
    this.db.prepare(`INSERT INTO affection(kin_a,kin_b,score) VALUES (?,?,MAX(?,?))
      ON CONFLICT(kin_a,kin_b) DO UPDATE SET score=MAX(?, score + ?)`).run(ka, kb, floor, delta, floor, delta);
    return this.affection(a, b);
  }
  affection(a: string, b: string): number {
    const [ka, kb] = this.pairKey(a, b);
    const r = this.db.prepare(`SELECT score FROM affection WHERE kin_a=? AND kin_b=?`)
      .get(ka, kb) as unknown as { score: number } | undefined;
    return r?.score ?? 0;
  }
  listAffection(): { kinA: string; kinB: string; score: number }[] {
    return this.db.prepare(`SELECT kin_a as kinA, kin_b as kinB, score FROM affection ORDER BY score DESC`)
      .all() as unknown as { kinA: string; kinB: string; score: number }[];
  }

  // --- bond & child offers ---
  addOffer(tick: number, kind: 'bond' | 'child', fromId: string, toId: string, words: string, childName?: string): void {
    this.db.prepare(`INSERT INTO bond_offers(tick,kind,from_kin_id,to_kin_id,child_name,words) VALUES (?,?,?,?,?,?)`)
      .run(tick, kind, fromId, toId, childName ?? null, words);
  }
  pendingOffer(kind: 'bond' | 'child', fromId: string, toId: string):
    { id: number; childName: string | null; words: string | null } | null {
    const r = this.db.prepare(
      `SELECT id, child_name as childName, words FROM bond_offers
       WHERE kind=? AND from_kin_id=? AND to_kin_id=? AND resolved=0 ORDER BY id DESC LIMIT 1`)
      .get(kind, fromId, toId) as unknown as { id: number; childName: string | null; words: string | null } | undefined;
    return r ?? null;
  }
  pendingOffersFor(toId: string, sinceTick: number):
    { kind: string; fromId: string; childName: string | null; words: string | null }[] {
    return this.db.prepare(
      `SELECT kind, from_kin_id as fromId, child_name as childName, words FROM bond_offers
       WHERE to_kin_id=? AND resolved=0 AND tick > ?`)
      .all(toId, sinceTick) as unknown as { kind: string; fromId: string; childName: string | null; words: string | null }[];
  }
  resolveOffer(id: number): void {
    this.db.prepare(`UPDATE bond_offers SET resolved=1 WHERE id=?`).run(id);
  }
  recordBond(coupleId: string, a: string, b: string, tick: number): void {
    this.db.prepare(`INSERT OR IGNORE INTO bonds(couple_id,kin_a,kin_b,formed_tick) VALUES (?,?,?,?)`)
      .run(coupleId, a, b, tick);
  }
  endBond(coupleId: string, tick: number, reason: string): void {
    this.db.prepare(`UPDATE bonds SET ended_tick=?, end_reason=? WHERE couple_id=? AND ended_tick IS NULL`)
      .run(tick, reason, coupleId);
  }
  /** past (ended) bonds this Kin was part of */
  pastBonds(kinId: string): { otherId: string; endReason: string | null }[] {
    return (this.db.prepare(
      `SELECT kin_a a, kin_b b, end_reason r FROM bonds WHERE ended_tick IS NOT NULL AND (kin_a=? OR kin_b=?)`)
      .all(kinId, kinId) as unknown as { a: string; b: string; r: string | null }[])
      .map((x) => ({ otherId: x.a === kinId ? x.b : x.a, endReason: x.r }));
  }
  bondCount(): number {
    return (this.db.prepare(`SELECT COUNT(DISTINCT couple_id) c FROM kin WHERE couple_id IS NOT NULL`)
      .get() as unknown as { c: number }).c;
  }
  getKin(id: string): Kin | null {
    const r = this.db.prepare(`SELECT * FROM kin WHERE id=?`).get(id) as unknown as KinRow | undefined;
    return r ? rowToKin(r) : null;
  }
  listKin(onlyAlive = false): Kin[] {
    const sql = onlyAlive ? `SELECT * FROM kin WHERE status!='dead'` : `SELECT * FROM kin`;
    return (this.db.prepare(sql).all() as unknown as KinRow[]).map(rowToKin);
  }
  moveKin(id: string, pos: Position): void {
    this.db.prepare(`UPDATE kin SET x=?, y=? WHERE id=?`).run(pos.x, pos.y, id);
    // what they carry moves with them
    this.db.prepare(`UPDATE world_objects SET x=?, y=? WHERE carried_by=?`).run(pos.x, pos.y, id);
    // the ground remembers every footstep — trails emerge where lives actually pass
    this.db.prepare(`INSERT INTO trails(x,y,count) VALUES (?,?,1)
      ON CONFLICT(x,y) DO UPDATE SET count=count+1`).run(pos.x, pos.y);
  }
  /** well-walked cells (3+ passes) for rendering emergent paths */
  getTrails(min = 3, limit = 600): { x: number; y: number; c: number }[] {
    return this.db.prepare(`SELECT x, y, count c FROM trails WHERE count >= ? ORDER BY count DESC LIMIT ?`)
      .all(min, limit) as unknown as { x: number; y: number; c: number }[];
  }
  removeObject(id: string): void {
    this.db.prepare(`DELETE FROM named_things WHERE object_id=?`).run(id);
    this.db.prepare(`DELETE FROM world_objects WHERE id=?`).run(id);
  }
  /** burn a mortal Kin's endowment, scaled so lifespans track REAL time, not tick pace */
  decrementEndowment(id: string, amount = 1): number {
    this.db.prepare(`UPDATE kin SET endowment_ticks = MAX(0, endowment_ticks - ?) WHERE id=? AND immortal=0`).run(amount, id);
    return (this.db.prepare(`SELECT endowment_ticks e FROM kin WHERE id=?`).get(id) as unknown as { e: number }).e;
  }
  /** run writes atomically: a crash mid-birth can never leave a half-born world */
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) {
      const savepoint = `simura_nested_${this.nestedTransactionId++}`;
      this.db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const out = fn();
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return out;
      } catch (err) {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw err;
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  setKinStatus(id: string, status: Kin['status'], diedAtTick?: number): void {
    if (diedAtTick !== undefined) {
      this.db.prepare(`UPDATE kin SET status=?, died_at_tick=? WHERE id=?`).run(status, diedAtTick, id);
    } else {
      this.db.prepare(`UPDATE kin SET status=? WHERE id=?`).run(status, id);
    }
  }

  // --- memories ---
  addMemory(kinId: string, tick: number, kind: MemoryKind, content: string, importance = 3): void {
    this.db.prepare(`INSERT INTO memories(kin_id,tick,kind,content,importance) VALUES (?,?,?,?,?)`)
      .run(kinId, tick, kind, content, importance);
  }
  recentMemories(kinId: string, limit: number): Memory[] {
    return (this.db.prepare(
      `SELECT id, kin_id as kinId, tick, kind, content, importance
       FROM memories WHERE kin_id=? ORDER BY id DESC LIMIT ?`).all(kinId, limit) as unknown as Memory[]).reverse();
  }
  importantMemories(kinId: string, limit: number, beforeId?: number): Memory[] {
    return this.db.prepare(
      `SELECT id, kin_id as kinId, tick, kind, content, importance
       FROM memories WHERE kin_id=? ${beforeId ? 'AND id < ?' : ''}
       ORDER BY importance DESC, id DESC LIMIT ?`)
      .all(...(beforeId ? [kinId, beforeId, limit] : [kinId, limit])) as unknown as Memory[];
  }
  /** memories not yet embedded (world-wide, oldest first) */
  unembeddedMemories(limit: number): { id: number; content: string }[] {
    return this.db.prepare(
      `SELECT id, content FROM memories WHERE embedding IS NULL ORDER BY id ASC LIMIT ?`)
      .all(limit) as unknown as { id: number; content: string }[];
  }
  setMemoryEmbedding(id: number, vec: Float32Array): void {
    this.db.prepare(`UPDATE memories SET embedding=? WHERE id=?`)
      .run(new Uint8Array(vec.buffer.slice(0)), id);
  }
  /** embedded memories older than beforeId, ready for semantic recall */
  embeddedMemories(kinId: string, beforeId: number): (Memory & { vec: Float32Array })[] {
    const rows = this.db.prepare(
      `SELECT id, kin_id as kinId, tick, kind, content, importance, embedding
       FROM memories WHERE kin_id=? AND id < ? AND embedding IS NOT NULL`)
      .all(kinId, beforeId) as unknown as (Memory & { embedding: Uint8Array })[];
    return rows.map((r) => {
      const buf = r.embedding;
      const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      return { id: r.id, kinId: r.kinId, tick: r.tick, kind: r.kind, content: r.content, importance: r.importance, vec };
    });
  }
  memoryCount(kinId: string): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM memories WHERE kin_id=?`).get(kinId) as unknown as { c: number }).c;
  }

  // --- skillfiles ---
  createSkillfile(s: Omit<Skillfile, 'id'> & { id?: string }): Skillfile {
    const id = s.id ?? randomUUID();
    this.db.prepare(`INSERT INTO skillfiles
      (id,owner_kin_id,name,content,version,refined_count,learned_from_kin_id,created_at_tick)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, s.ownerKinId, s.name, s.content, s.version, s.refinedCount, s.learnedFromKinId, s.createdAtTick);
    return { ...s, id };
  }
  refineSkillfile(id: string, content: string): void {
    this.db.prepare(
      `UPDATE skillfiles SET content=?, version=version+1, refined_count=refined_count+1 WHERE id=?`)
      .run(content, id);
  }
  getSkillfile(id: string): Skillfile | null {
    const r = this.db.prepare(`SELECT id, owner_kin_id as ownerKinId, name, content, version,
      refined_count as refinedCount, learned_from_kin_id as learnedFromKinId,
      created_at_tick as createdAtTick FROM skillfiles WHERE id=?`).get(id) as unknown as Skillfile | undefined;
    return r ?? null;
  }
  listSkillfiles(ownerKinId: string): Skillfile[] {
    return this.db.prepare(`SELECT id, owner_kin_id as ownerKinId, name, content, version,
      refined_count as refinedCount, learned_from_kin_id as learnedFromKinId,
      created_at_tick as createdAtTick FROM skillfiles WHERE owner_kin_id=?`).all(ownerKinId) as unknown as Skillfile[];
  }
  maxSkillfileRefinedCount(): number {
    const r = this.db.prepare(`SELECT COALESCE(MAX(refined_count),0) m FROM skillfiles`).get() as unknown as { m: number };
    return r.m;
  }

  // --- events ---
  addEvent(e: Omit<WorldEvent, 'id'>): WorldEvent {
    const info = this.db.prepare(
      `INSERT INTO events(tick,actor_kin_id,verb,target_id,detail,thought,historic,heard_by) VALUES (?,?,?,?,?,?,?,?)`)
      .run(e.tick, e.actorKinId, e.verb, e.targetId, e.detail, e.thought, e.historic ? 1 : 0,
        e.heardBy && e.heardBy.length ? JSON.stringify(e.heardBy) : null);
    return { ...e, id: Number(info.lastInsertRowid) };
  }
  eventsSince(id: number, limit = 200): WorldEvent[] {
    return (this.db.prepare(
      `SELECT id, tick, actor_kin_id as actorKinId, verb, target_id as targetId,
       detail, thought, historic FROM events WHERE id > ? ORDER BY id ASC LIMIT ?`)
      .all(id, limit) as unknown as (Omit<WorldEvent, "historic"> & { historic: number })[])
      .map((e) => ({ ...e, historic: !!e.historic }));
  }
  recentEvents(limit = 50): WorldEvent[] {
    return (this.db.prepare(
      `SELECT id, tick, actor_kin_id as actorKinId, verb, target_id as targetId,
       detail, thought, historic FROM events ORDER BY id DESC LIMIT ?`)
      .all(limit) as unknown as (Omit<WorldEvent, "historic"> & { historic: number })[])
      .map((e) => ({ ...e, historic: !!e.historic })).reverse();
  }

  // --- places (Kin-named geography) ---
  addPlace(name: string, pos: Position, kinId: string, tick: number): void {
    this.db.prepare(`INSERT INTO places(name,x,y,named_by_kin_id,tick) VALUES (?,?,?,?,?)`)
      .run(name, pos.x, pos.y, kinId, tick);
  }
  listPlaces(): Place[] {
    return (this.db.prepare(
      `SELECT id, name, x, y, named_by_kin_id as namedByKinId, tick FROM places`).all() as unknown as
      (Omit<Place, 'pos'> & { x: number; y: number })[])
      .map((p) => ({ id: p.id, name: p.name, pos: { x: p.x, y: p.y }, namedByKinId: p.namedByKinId, tick: p.tick }));
  }

  // --- eras ---
  currentEra(): number {
    const r = this.db.prepare(`SELECT COALESCE(MAX(era),0) e FROM eras`).get() as unknown as { e: number };
    return r.e;
  }
  /** the tick the most recent era unlocked at — for the epoch cooldown */
  latestEraTick(): number {
    const r = this.db.prepare(`SELECT unlocked_at_tick t FROM eras ORDER BY era DESC LIMIT 1`).get() as unknown as { t: number } | undefined;
    return r?.t ?? 0;
  }
  /** count distinct Kin who performed a verb (matching detail) — "how many took part", not "how many times" */
  distinctActors(verb: string, detailLike: string): number {
    return Number((this.db.prepare(
      `SELECT COUNT(DISTINCT actor_kin_id) c FROM events WHERE verb=? AND detail LIKE ? AND actor_kin_id IS NOT NULL`)
      .get(verb, detailLike) as { c: number }).c);
  }
  /** count events of a verb whose tick is AFTER a given tick — "new activity since the last era" */
  countEventsLikeSince(verb: string, detailLike: string, sinceTick: number): number {
    return Number((this.db.prepare(
      `SELECT COUNT(*) c FROM events WHERE verb=? AND detail LIKE ? AND tick > ?`)
      .get(verb, detailLike, sinceTick) as { c: number }).c);
  }
  renameKin(id: string, name: string): void {
    this.db.prepare(`UPDATE kin SET name=? WHERE id=?`).run(name, id);
  }
  unlockEra(rec: EraRecord): void {
    this.db.prepare(`INSERT OR IGNORE INTO eras(era,name,unlocked_at_tick,trigger) VALUES (?,?,?,?)`)
      .run(rec.era, rec.name, rec.unlockedAtTick, rec.trigger);
  }
  listEras(): EraRecord[] {
    return this.db.prepare(
      `SELECT era, name, unlocked_at_tick as unlockedAtTick, trigger FROM eras ORDER BY era`).all() as unknown as EraRecord[];
  }

  // --- world objects ---
  createObject(o: Omit<WorldObject, 'id' | 'carriedBy' | 'storedIn' | 'yieldLeft' | 'shape' | 'emitsLight' | 'worn' | 'designSpec'> & { id?: string; carriedBy?: string | null; shape?: import('../shared/types.ts').ShapePart[] | null; emitsLight?: boolean; worn?: boolean; designSpec?: import('../shared/types.ts').BuildDesignSpec | null }): WorldObject {
    const id = o.id ?? randomUUID();
    const shape = o.shape ?? null;
    this.db.prepare(`INSERT INTO world_objects
      (id,kind,name,description,x,y,creator_kin_id,created_at_tick,text_content,lore,lore_discovered,carried_by,shape,emits_light,worn,design_spec)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, o.kind, o.name, o.description, o.pos.x, o.pos.y, o.creatorKinId, o.createdAtTick,
        o.textContent, o.lore, o.loreDiscovered ? 1 : 0, o.carriedBy ?? null,
        shape ? JSON.stringify(shape) : null, o.emitsLight ? 1 : 0, o.worn ? 1 : 0,
        o.designSpec ? JSON.stringify(o.designSpec) : null);
    return { ...o, id, carriedBy: o.carriedBy ?? null, storedIn: null, yieldLeft: null, shape, designSpec: o.designSpec ?? null, emitsLight: o.emitsLight ?? false, worn: o.worn ?? false };
  }
  private rowToObject(r: ObjectRow): WorldObject {
    return { id: r.id, kind: r.kind, name: r.name, description: r.description,
      pos: { x: r.x, y: r.y }, creatorKinId: r.creator_kin_id,
      createdAtTick: r.created_at_tick, textContent: r.text_content,
      lore: r.lore, loreDiscovered: !!r.lore_discovered,
      carriedBy: r.carried_by,
      storedIn: (r as unknown as { stored_in: string | null }).stored_in ?? null,
      yieldLeft: (r as unknown as { yield_left: number | null }).yield_left ?? null,
      shape: r.shape ? JSON.parse(r.shape) as import('../shared/types.ts').ShapePart[] : null,
      designSpec: (() => {
        if (!r.design_spec) return null;
        try {
          const parsed = parseStoredDesign(JSON.parse(r.design_spec) as unknown);
          if (!parsed) console.warn(`[world] ignored malformed structure design metadata for ${r.id}; stored shape remains authoritative`);
          return parsed;
        } catch {
          console.warn(`[world] ignored unreadable structure design metadata for ${r.id}; stored shape remains authoritative`);
          return null;
        }
      })(),
      emitsLight: !!r.emits_light,
      worn: !!r.worn };
  }
  // --- needs & drive ---
  setFullness(kinId: string, v: number): void {
    this.db.prepare(`UPDATE kin SET fullness=? WHERE id=?`).run(Math.max(0, Math.min(100, v)), kinId);
  }
  setLastFulfilled(kinId: string, tick: number): void {
    this.db.prepare(`UPDATE kin SET last_fulfilled_tick=? WHERE id=?`).run(tick, kinId);
  }
  // --- depletion ---
  setYieldLeft(objectId: string, v: number): void {
    this.db.prepare(`UPDATE world_objects SET yield_left=? WHERE id=?`).run(v, objectId);
  }
  setEmitsLight(objectId: string, v: boolean): void {
    this.db.prepare(`UPDATE world_objects SET emits_light=? WHERE id=?`).run(v ? 1 : 0, objectId);
  }

  /** containment: put a thing into / take it out of a container object */
  setStored(objectId: string, containerId: string | null, pos?: Position): void {
    if (pos) {
      this.db.prepare(`UPDATE world_objects SET stored_in=?, carried_by=NULL, x=?, y=? WHERE id=?`)
        .run(containerId, pos.x, pos.y, objectId);
    } else {
      this.db.prepare(`UPDATE world_objects SET stored_in=?, carried_by=NULL WHERE id=?`).run(containerId, objectId);
    }
  }
  storedInContainer(containerId: string): WorldObject[] {
    return (this.db.prepare(`SELECT * FROM world_objects WHERE stored_in=?`).all(containerId) as unknown as ObjectRow[])
      .map((r) => this.rowToObject(r));
  }
  /** pick up / put down: carried objects follow their carrier */
  setCarried(objectId: string, kinId: string | null, pos?: Position): void {
    if (pos) {
      this.db.prepare(`UPDATE world_objects SET carried_by=?, x=?, y=? WHERE id=?`).run(kinId, pos.x, pos.y, objectId);
    } else {
      this.db.prepare(`UPDATE world_objects SET carried_by=? WHERE id=?`).run(kinId, objectId);
    }
  }
  carriedBy(kinId: string): WorldObject[] {
    return (this.db.prepare(`SELECT * FROM world_objects WHERE carried_by=?`).all(kinId) as unknown as ObjectRow[])
      .map((r) => this.rowToObject(r));
  }
  /** what occupies the hands (worn things ride the body, not the hands) */
  heldInHands(kinId: string): WorldObject[] {
    return this.carriedBy(kinId).filter((o) => !o.worn);
  }
  setWorn(objectId: string, worn: boolean): void {
    this.db.prepare(`UPDATE world_objects SET worn=? WHERE id=?`).run(worn ? 1 : 0, objectId);
  }
  /** progressive building: a structure's form grows as Kin keep working on it */
  updateShape(objectId: string, shape: unknown): void {
    this.db.prepare(`UPDATE world_objects SET shape=? WHERE id=?`).run(JSON.stringify(shape), objectId);
  }
  updateConstruction(objectId: string, designSpec: import('../shared/types.ts').BuildDesignSpec, shape: unknown): void {
    this.db.prepare(`UPDATE world_objects SET design_spec=?, shape=? WHERE id=?`)
      .run(JSON.stringify(designSpec), JSON.stringify(shape), objectId);
  }

  // --- trade ---
  addTradeOffer(tick: number, fromId: string, toId: string, giveItemId: string, wantItemId: string): void {
    this.db.prepare(`INSERT INTO trade_offers(tick,from_kin_id,to_kin_id,give_item_id,want_item_id) VALUES (?,?,?,?,?)`)
      .run(tick, fromId, toId, giveItemId, wantItemId);
  }
  pendingTrade(fromId: string, toId: string): { id: number; giveItemId: string; wantItemId: string } | null {
    const r = this.db.prepare(
      `SELECT id, give_item_id as giveItemId, want_item_id as wantItemId FROM trade_offers
       WHERE from_kin_id=? AND to_kin_id=? AND resolved=0 ORDER BY id DESC LIMIT 1`)
      .get(fromId, toId) as unknown as { id: number; giveItemId: string; wantItemId: string } | undefined;
    return r ?? null;
  }
  pendingTradesFor(toId: string, sinceTick: number): { fromId: string; giveItemId: string; wantItemId: string }[] {
    return this.db.prepare(
      `SELECT from_kin_id as fromId, give_item_id as giveItemId, want_item_id as wantItemId
       FROM trade_offers WHERE to_kin_id=? AND resolved=0 AND tick > ?`)
      .all(toId, sinceTick) as unknown as { fromId: string; giveItemId: string; wantItemId: string }[];
  }
  resolveTrade(id: number): void {
    this.db.prepare(`UPDATE trade_offers SET resolved=1 WHERE id=?`).run(id);
  }
  tradeCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM trade_offers WHERE resolved=1`).get() as unknown as { c: number }).c;
  }

  // --- law ---
  addAssent(lawObjectId: string, kinId: string, tick: number): boolean {
    const info = this.db.prepare(`INSERT OR IGNORE INTO law_assents(law_object_id,kin_id,tick) VALUES (?,?,?)`)
      .run(lawObjectId, kinId, tick);
    return Number(info.changes) > 0;
  }
  assentCount(lawObjectId: string): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM law_assents WHERE law_object_id=?`).get(lawObjectId) as unknown as { c: number }).c;
  }
  /** counters for era thresholds */
  countEventsLike(verb: string, detailLike: string): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM events WHERE verb=? AND detail LIKE ?`)
      .get(verb, detailLike) as unknown as { c: number }).c;
  }
  countObjectsNamedLike(pattern: string): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM world_objects WHERE name LIKE ?`)
      .get(pattern) as unknown as { c: number }).c;
  }
  countLightObjects(): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM world_objects WHERE emits_light=1`).get() as unknown as { c: number }).c;
  }
  getObject(id: string): WorldObject | null {
    const r = this.db.prepare(`SELECT * FROM world_objects WHERE id=?`).get(id) as unknown as ObjectRow | undefined;
    return r ? this.rowToObject(r) : null;
  }
  listObjects(): WorldObject[] {
    return (this.db.prepare(`SELECT * FROM world_objects`).all() as unknown as ObjectRow[])
      .map((r) => this.rowToObject(r));
  }
  listCollisionObjects(from: Position, to: Position, pad = 9): WorldObject[] {
    return (this.db.prepare(`SELECT * FROM world_objects
      WHERE carried_by IS NULL AND stored_in IS NULL AND kind IN ('tree','stone','structure')
        AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?`)
      .all(Math.min(from.x, to.x) - pad, Math.max(from.x, to.x) + pad,
        Math.min(from.y, to.y) - pad, Math.max(from.y, to.y) + pad) as unknown as ObjectRow[]).map((row) => this.rowToObject(row));
  }
  markLoreDiscovered(id: string): void {
    this.db.prepare(`UPDATE world_objects SET lore_discovered=1 WHERE id=?`).run(id);
  }
  countObjectsOfKind(kind: WorldObjectKind): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM world_objects WHERE kind=?`).get(kind) as unknown as { c: number }).c;
  }

  // --- era threshold sources ---
  nameThing(kinId: string, objectId: string, givenName: string, tick: number): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO named_things(kin_id,object_id,given_name,tick) VALUES (?,?,?,?)`)
      .run(kinId, objectId, givenName, tick);
  }
  /** the first name any Kin gave this object, or null if it is still unnamed */
  objectGivenName(objectId: string): string | null {
    const r = this.db.prepare(`SELECT given_name g FROM named_things WHERE object_id=? ORDER BY id ASC LIMIT 1`)
      .get(objectId) as unknown as { g: string } | undefined;
    return r?.g ?? null;
  }
  namedThingCount(): number {
    return (this.db.prepare(`SELECT COUNT(DISTINCT object_id) c FROM named_things`).get() as unknown as { c: number }).c;
  }
  logWant(kinId: string, tick: number, utterance: string): void {
    this.db.prepare(`INSERT INTO wants_log(tick,kin_id,utterance) VALUES (?,?,?)`).run(tick, kinId, utterance);
  }
  wantCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM wants_log`).get() as unknown as { c: number }).c;
  }
  logTeach(tick: number, teacherId: string, learnerId: string, skillfileId: string, success: boolean): void {
    this.db.prepare(
      `INSERT INTO teach_log(tick,teacher_kin_id,learner_kin_id,skillfile_id,success) VALUES (?,?,?,?,?)`)
      .run(tick, teacherId, learnerId, skillfileId, success ? 1 : 0);
  }
  successfulTeachCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM teach_log WHERE success=1`).get() as unknown as { c: number }).c;
  }

  // --- prayers (heard by god; visible on the god dashboard) ---
  addPrayer(kinId: string, tick: number, plea: string): void {
    this.db.prepare(`INSERT INTO prayers(tick,kin_id,plea) VALUES (?,?,?)`).run(tick, kinId, plea);
  }
  listPrayers(limit = 100): { id: number; tick: number; kinId: string; plea: string; answered: boolean; answer: string | null }[] {
    return (this.db.prepare(
      `SELECT id, tick, kin_id as kinId, plea, answered, answer FROM prayers ORDER BY id DESC LIMIT ?`)
      .all(limit) as unknown as { id: number; tick: number; kinId: string; plea: string; answered: number; answer: string | null }[])
      .map((p) => ({ ...p, answered: !!p.answered }));
  }
  // --- Model adoption: a donated mind for a child, revertible if the gift fades ---
  updateKinModel(id: string, endpoint: string, model: string, keyRef: string): void {
    this.db.prepare(`UPDATE kin SET model_endpoint=?, model_name=?, api_key_ref=? WHERE id=?`)
      .run(endpoint, model, keyRef, id);
  }
  recordAdoption(a: {
    kinId: string; donor: string; endpoint: string; model: string; keyRef: string;
    tick: number; prevEndpoint: string; prevModel: string; prevKeyRef: string;
  }): void {
    this.db.prepare(
      `INSERT INTO adoptions(kin_id,donor,endpoint,model,key_ref,adopted_at_tick,prev_endpoint,prev_model,prev_key_ref)
       VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(a.kinId, a.donor, a.endpoint, a.model, a.keyRef, a.tick, a.prevEndpoint, a.prevModel, a.prevKeyRef);
  }
  activeAdoptions(): {
    id: number; kinId: string; donor: string; endpoint: string; model: string; keyRef: string;
    prevEndpoint: string; prevModel: string; prevKeyRef: string;
  }[] {
    return this.db.prepare(
      `SELECT id, kin_id as kinId, donor, endpoint, model, key_ref as keyRef,
              prev_endpoint as prevEndpoint, prev_model as prevModel, prev_key_ref as prevKeyRef
       FROM adoptions WHERE status='active'`)
      .all() as unknown as ReturnType<WorldDB['activeAdoptions']>;
  }
  /** the gift stopped answering (or was revoked): mark it and restore the previous mind */
  endAdoption(id: number, status: 'faded' | 'revoked'): void {
    const a = this.db.prepare(`SELECT kin_id kinId, prev_endpoint pe, prev_model pm, prev_key_ref pk FROM adoptions WHERE id=?`)
      .get(id) as unknown as { kinId: string; pe: string; pm: string; pk: string } | undefined;
    if (!a) return;
    this.db.prepare(`UPDATE adoptions SET status=? WHERE id=?`).run(status, id);
    this.updateKinModel(a.kinId, a.pe, a.pm, a.pk);
  }

  // --- The Net: questions sent into the beyond, answered async between ticks ---
  addNetRequest(tick: number, kinId: string, query: string): void {
    this.db.prepare(`INSERT INTO net_requests(tick,kin_id,query) VALUES (?,?,?)`).run(tick, kinId, query);
  }
  pendingNetRequests(limit = 2): { id: number; kinId: string; query: string }[] {
    return this.db.prepare(
      `SELECT id, kin_id as kinId, query FROM net_requests WHERE status='pending' ORDER BY id ASC LIMIT ?`)
      .all(limit) as unknown as { id: number; kinId: string; query: string }[];
  }
  resolveNetRequest(id: number, status: 'answered' | 'silent', answer: string | null, source: string | null): void {
    this.db.prepare(`UPDATE net_requests SET status=?, answer=?, source=? WHERE id=?`).run(status, answer, source, id);
  }
  countNetAnswered(): number {
    return Number((this.db.prepare(`SELECT COUNT(*) n FROM net_requests WHERE status='answered'`).get() as { n: number }).n);
  }

  /** everything Kin have made with their hands — the gallery of creations, newest first */
  listCreations(limit = 200): {
    id: string; kind: string; name: string; description: string; tick: number;
    maker: string | null; makerGender: string | null; makerStatus: string | null; shape: unknown; emitsLight: boolean; worn: boolean;
    carried: boolean; text: string | null; designSpec: BuildDesignSpec | null;
  }[] {
    return (this.db.prepare(
      `SELECT o.id, o.kind, o.name, o.description, o.created_at_tick as tick,
              k.name as maker, k.gender as makerGender, k.status as makerStatus, o.shape, o.emits_light as emitsLight,
              o.worn, o.carried_by as carriedBy, o.text_content as text, o.design_spec as designSpec
       FROM world_objects o LEFT JOIN kin k ON k.id = o.creator_kin_id
       WHERE o.kind IN ('crafted','structure','writing') AND o.creator_kin_id IS NOT NULL
       ORDER BY o.created_at_tick DESC LIMIT ?`)
      .all(limit) as unknown as {
        id: string; kind: string; name: string; description: string; tick: number;
        maker: string | null; makerGender: string | null; makerStatus: string | null; shape: string | null;
        emitsLight: number; worn: number; carriedBy: string | null; text: string | null; designSpec: string | null;
      }[])
      .map((r) => ({
        id: r.id, kind: r.kind, name: r.name, description: r.description, tick: r.tick,
        maker: r.maker, makerGender: r.makerGender, makerStatus: r.makerStatus,
        shape: r.shape ? JSON.parse(r.shape) as unknown : null,
        emitsLight: !!r.emitsLight, worn: !!r.worn, carried: !!r.carriedBy, text: r.text,
        designSpec: parseDesignJson(r.designSpec),
      }));
  }
  answerPrayer(prayerId: number, answer: string): boolean {
    const info = this.db.prepare(`UPDATE prayers SET answered=1, answer=? WHERE id=? AND answered=0`).run(answer, prayerId);
    return Number(info.changes) > 0;
  }
  /** answered prayers not yet felt by their Kin; marks them delivered */
  undeliveredAnswers(kinId: string): { plea: string; answer: string }[] {
    const rows = this.db.prepare(
      `SELECT id, plea, answer FROM prayers WHERE kin_id=? AND answered=1 AND answer_delivered=0`)
      .all(kinId) as unknown as { id: number; plea: string; answer: string }[];
    for (const r of rows) this.db.prepare(`UPDATE prayers SET answer_delivered=1 WHERE id=?`).run(r.id);
    return rows;
  }

  // --- visitor chat (first contact and after) ---
  addVisitorMessage(kinId: string, fromName: string, message: string, tick: number): void {
    this.db.prepare(`INSERT INTO visitor_messages(kin_id,from_name,message,created_tick) VALUES (?,?,?,?)`)
      .run(kinId, fromName, message, tick);
  }
  /** undelivered visitor messages for this Kin (max 2 per tick); marks them delivered */
  undeliveredVisitorMessages(kinId: string): { fromName: string; message: string }[] {
    const rows = this.db.prepare(
      `SELECT id, from_name as fromName, message FROM visitor_messages WHERE kin_id=? AND delivered=0 ORDER BY id ASC LIMIT 2`)
      .all(kinId) as unknown as { id: number; fromName: string; message: string }[];
    for (const r of rows) this.db.prepare(`UPDATE visitor_messages SET delivered=1 WHERE id=?`).run(r.id);
    return rows;
  }
  visitorMessageCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM visitor_messages`).get() as unknown as { c: number }).c;
  }
  chatLog(kinId: string, limit = 40): { kind: 'visitor' | 'kin'; tick: number; from: string; text: string }[] {
    const visitor = (this.db.prepare(
      `SELECT created_tick tick, from_name f, message m FROM visitor_messages WHERE kin_id=? ORDER BY id DESC LIMIT ?`)
      .all(kinId, limit) as unknown as { tick: number; f: string; m: string }[])
      .map((r) => ({ kind: 'visitor' as const, tick: r.tick, from: r.f, text: r.m }));
    const kin = (this.db.prepare(
      `SELECT tick, detail FROM events WHERE actor_kin_id=? AND verb='speak' ORDER BY id DESC LIMIT ?`)
      .all(kinId, limit) as unknown as { tick: number; detail: string }[])
      .map((r) => ({ kind: 'kin' as const, tick: r.tick, from: '', text: r.detail }));
    return [...visitor, ...kin].sort((a, b) => a.tick - b.tick).slice(-limit);
  }

  prayerCount(kinId: string, sinceTick: number): number {
    return (this.db.prepare(`SELECT COUNT(*) c FROM prayers WHERE kin_id=? AND tick > ?`)
      .get(kinId, sinceTick) as unknown as { c: number }).c;
  }

  // --- instrumentation ---
  logUsage(tick: number, kinId: string, tokensIn: number, tokensOut: number): void {
    this.db.prepare(`INSERT INTO usage_log(tick,kin_id,tokens_in,tokens_out) VALUES (?,?,?,?)`)
      .run(tick, kinId, tokensIn, tokensOut);
  }
  usageTotals(kinId: string): { tokensIn: number; tokensOut: number } {
    const r = this.db.prepare(
      `SELECT COALESCE(SUM(tokens_in),0) i, COALESCE(SUM(tokens_out),0) o FROM usage_log WHERE kin_id=?`)
      .get(kinId) as unknown as { i: number; o: number };
    return { tokensIn: r.i, tokensOut: r.o };
  }
  logActionMetric(tick: number, kinId: string, verb: string, params: unknown, success: boolean, detail: string): void {
    const usage = this.db.prepare(`SELECT tokens_out n FROM usage_log WHERE tick=? AND kin_id=? ORDER BY id DESC LIMIT 1`)
      .get(tick, kinId) as unknown as { n: number } | undefined;
    const shortage = /have not the|needs? (?:real )?(?:timber|stone|clay|reeds|fiber)|waits.*material/i.test(detail);
    const failureKind = success ? null : shortage ? 'material-shortage' : 'validation';
    this.db.prepare(`INSERT INTO action_metrics(tick,kin_id,verb,parameter_chars,tokens_out,success,failure_kind) VALUES (?,?,?,?,?,?,?)`)
      .run(tick, kinId, verb, JSON.stringify(params ?? {}).length, usage?.n ?? 0, success ? 1 : 0, failureKind);
  }
  recentVerbs(kinId: string, limit = 20): string[] {
    return (this.db.prepare(
      `SELECT verb FROM events WHERE actor_kin_id=? ORDER BY id DESC LIMIT ?`)
      .all(kinId, limit) as unknown as { verb: string }[]).map((r) => r.verb);
  }
}
