import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WorldConfig {
  /** bounds: [minX, width) × [minY, height). min edges can go NEGATIVE as the
   *  world expands west/north — coordinates are absolute and never shift. */
  map: { width: number; height: number; minX: number; minY: number };
  perceptionRadius: number;
  speechRadius: number;
  teachRadius: number;
  moveMaxPerTick: number;
  craftReachRadius: number;
  /** day cycle: lengthTicks per full day; nightFraction of it is dark; at night sight shrinks by nightPerceptionFactor. offsetTicks is god's runtime dawn-shift (persisted in world DB, not this file) */
  day: { lengthTicks: number; nightFraction: number; nightPerceptionFactor: number; offsetTicks?: number };
  /** fadingWarningTicks: ticks of felt fading before death; childEndowmentTicks: a newborn's funded lifespan (~7 days) */
  lifespan: { fadingWarningTicks: number; childEndowmentTicks: number; childCooldownTicks: number; gestationTicks?: number };
  /** affection physics: interaction-driven, never prompted */
  affection: {
    friend: number; love: number;
    proximityRadius: number; proximityGain: number;
    speechGain: number; teachGain: number;
    decayRadius: number; decayLoss: number;
  };
  /** chapterEvery: summaries per life-chapter consolidation; maxListedSkills: prompt cap */
  memory: { shortTermWindow: number; summarizeEveryTicks: number; recallCount: number; chapterEvery: number; maxListedSkills: number };
  /** hard cap on objects listed in perception — beyond it, the world is summarized, not enumerated */
  perceptionMaxObjects: number;
  eras: {
    making: { namedThings: number; requiresWant: boolean };
    building: { craftedObjects: number; skillfileRefinedCount: number };
    letters: { successfulTeaches: number };
    hearth: { writtenTexts: number; structures: number };
  };
  flags: { reproduction: boolean; chat: boolean; sponsorship: boolean; wiki: boolean; net: boolean; buildArchetypes?: boolean };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load runtime secrets into process.env on import, so every entrypoint (server,
 * genesis, smoke, eval) is configured the same way. We try `.env` first, then
 * fall back to `config/local.env`. Some environments (secret scanners, editor
 * hooks) delete files literally named ".env"; keeping a copy at config/local.env
 * — a name they don't target — means a lost .env never silently drops us to mock.
 */
export const ENV_PATHS = [join(ROOT, 'config', 'local.env'), join(ROOT, '.env')];
(() => {
  for (const p of ENV_PATHS) {
    if (existsSync(p)) { try { process.loadEnvFile(p); return p; } catch { /* try next */ } }
  }
  return null;
})();

/**
 * Donated minds (model adoption): each donated key lives under its own
 * ADOPT_<id>_* prefix in config/adopted-keys.env — its own file, never the DB,
 * never the main config. Loaded additively at boot; appended at adoption time.
 */
export const ADOPTED_KEYS_PATH = join(ROOT, 'config', 'adopted-keys.env');
try { if (existsSync(ADOPTED_KEYS_PATH)) process.loadEnvFile(ADOPTED_KEYS_PATH); } catch { /* none yet */ }

export function storeAdoptedEnv(vars: Record<string, string>): void {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  appendFileSync(ADOPTED_KEYS_PATH, lines.join('\n') + '\n', 'utf8');
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

export function loadWorldConfig(): WorldConfig {
  return JSON.parse(readFileSync(join(ROOT, 'config', 'world.json'), 'utf8')) as WorldConfig;
}

export const env = {
  llmMode: (): 'mock' | 'real' => (process.env.LLM_MODE === 'real' ? 'real' : 'mock'),
  port: (): number => Number(process.env.PORT ?? 8787),
  dbPath: (): string => process.env.DB_PATH ?? join(ROOT, 'data', 'simura.db'),
  tickMs: (): number => Number(process.env.TICK_MS ?? 60_000),
  projectRoot: ROOT,
};
