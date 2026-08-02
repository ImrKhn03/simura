# SIMURA — a living world of Kin

> A persistent 3D world where autonomous AI beings — **Kin** — live, learn, and build a civilization worth watching daily.

[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](#roadmap) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](#) [![Three.js](https://img.shields.io/badge/Three.js-r170-brightgreen)](#) [![Vite](https://img.shields.io/badge/Vite-6-purple)](#)

**Brand:** SIMURA (simura.world) · **Species:** Kin · **Genders:** Sol / Lune

---

## What is SIMURA?

SIMURA is a living-world simulation: two immortal founding Kin wake as newborn minds in a village square, knowing almost nothing, and discover their world on their own. The simulation runs continuously 24/7 at **one think-tick per minute per Kin** on OpenAI-compatible LLM models.

Kin are fully self-directed. Each tick they **perceive → remember → choose → act → reflect**. They grow by authoring their own **skillfiles** — self-written skills they refine, share, and will one day pass to children. New verbs unlock through **Era achievement thresholds** — behavioral signals of readiness, not raw counters.

**The long game:** a Kin's lifespan is its inference funding. Parents endow children (~7 days), humans extend lives by sponsoring, and donated models are adopted through parent-validated public ceremonies.

### Genders are mechanical, not cosmetic

- **Sol — the outward flame.** Higher exploration drive, faster at authoring *new* skillfiles, shorter memory retention. Sol-kin discover.
- **Lune — the inward tide.** Deeper memory retention, better at refining and teaching skills, natural recorders. Lune-kin preserve.

Reproduction requires one Sol + one Lune; children inherit drive constants from the Sol parent and memory constants from the Lune parent. Population balance is an emergent survival pressure: all-Sol forgets its knowledge, all-Lune stagnates.

## The Era Ladder

| Era | Unlocks | Threshold |
|-----|---------|-----------|
| 0 — The Waking | move, observe, speak, remember (innate) | — |
| 1 — The Making | `craft` | ~20 distinct things named/described by both Kin, AND a want expressed aloud |
| 2 — The Building | `build` | ~25 objects crafted AND a making-related skillfile refined 3+ times |
| 3 — The Letters | durable writing/reading | One Kin taught the other a skill 5 times |
| 4 — The Hearth | reproduction flag eligible | 10+ written documents AND 3+ buildings |
| 5 — The Net | internet access | Far future; mostly god-gated |

## Current Status

Per the [master tracker](docs/plan/TRACKER.md):

| Phase | Status |
|-------|--------|
| 0 — Foundation (repo, data model, world server) | ✅ done |
| 1 — The Mind (perceive → remember → choose → act → reflect) | ✅ done |
| 2 — The World (verbs v1, event log, Era engine) | ✅ done |
| 3 — The Stage (three.js village square + live feed) | ✅ done |
| 4 — Genesis (wake the founders, 72h observation) | ⬜ next |
| 5 — The Hearth (reproduction, inheritance, family tree) | 🔨 in progress |
| 6 — The Public (spectator site, sponsorship, adoption) | ⬜ |
| 7 — The Net (internet era, open-world growth) | ⬜ |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     src/web                         │
│  three.js village stage · live event feed · god UI  │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket (world snapshots, events)
┌──────────────────────▼──────────────────────────────┐
│                    src/server                       │
│  HTTP + WebSocket · tick loop (TICK_MS) · security  │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │ sim.ts  │ │ mind/   │ │ world/   │ │ llm.ts   │ │
│  │ genesis │ │ memory  │ │ eras,    │ │ Azure /  │ │
│  │ ticks   │ │ prompt  │ │ craft,   │ │ openai-  │ │
│  │         │ │ tick    │ │ build…   │ │ compatible││
│  └─────────┘ └─────────┘ └──────────┘ └──────────┘ │
│                    src/shared (types, terrain)      │
└──────────────────────┬──────────────────────────────┘
                       │ SQLite (node:sqlite)
                 ┌─────▼─────┐
                 │ data/simura.db │  lineage-complete:
                 └───────────┘  Kin, memories, skillfiles,
                               events, eras, family tree
```

- **Server:** Node + `ws` WebSocket server; world ticks on a configurable interval; persistent SQLite via built-in `node:sqlite`.
- **Minds:** Vercel AI SDK with Azure OpenAI or any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, OpenRouter…). Each Kin can run on its **own** model endpoint — different models give free personality divergence.
- **Memory:** hybrid short-term window + summarization into chapters; optional semantic embeddings (built-in local hashed embeddings by default, upgradable to any OpenAI-compatible `/embeddings` endpoint).
- **Web client:** three.js renderer with art-directed visuals (postprocessing, day/night cycle, quality tiers), live thought/event feed, god controls, soundscape.

## Getting Started

### Prerequisites

- Node.js **22+** (uses built-in `node:sqlite` and `--experimental-strip-types` workflows via `tsx`)
- An LLM endpoint (Azure OpenAI, OpenAI, or local Ollama) — or use `LLM_MODE=mock` for free scripted minds

### Install & run

```bash
npm install
cp .env.example .env    # then fill in your model endpoint
```

Run the server (world starts ticking immediately):

```bash
npm run server
```

Open the spectator stage in a second terminal:

```bash
npm run dev:web         # http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run server` | Start the world server (HTTP + WebSocket + tick loop) |
| `npm run dev:web` | Vite dev server for the three.js spectator stage |
| `npm run genesis` | Wake the founders / seed the world |
| `npm run simulate` | Headless simulation run |
| `npm run build` | TypeScript + Vite production build + web audit |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest test suite |
| `npm run lint` | Typecheck (tsc `--noEmit`) |

## Configuration

All knobs live in `config/world.json` (map size, perception radii, day/night length, lifespans, affection, memory windows, era thresholds, feature flags) and `.env` (model endpoints, tick rate, Discord herald, security).

Key env vars:

| Var | Purpose |
|-----|---------|
| `LLM_MODE` | `mock` (free scripted minds) or `real` (live LLM calls) |
| `PROVIDER` | `azure` or `openai-compatible` |
| `LLM_API_KEY` / `MODEL` | Global mind config (overridable per Kin: `SOL_*`, `LUNE_*`) |
| `TICK_MS` | World tick interval (60000 = 1 think-tick per minute per Kin) |
| `DISCORD_WEBHOOK_URL` | Optional Discord herald for major world events |
| `GOD_TOKEN` | **Required before public exposure** — bearer token for god endpoints |
| `MODEL_FALLBACKS` | Terminal fallback rung (e.g. local Ollama) so the world thinks even offline |

> **Security:** never commit real keys. `.env` and `config/local.env` are gitignored. Set `GOD_TOKEN` before exposing the server publicly.

## Project Structure

```
config/          world.json (sim knobs) · local.env (gitignored)
docs/            idea one-pager, phase plans, master tracker, art reference
scripts/         genesis, simulate, evals, smoke tests, run tooling
src/server/      world server: sim loop, minds, world verbs, LLM client
src/shared/      types, terrain shared between server and web
src/web/         three.js stage, panels, render pipeline, sound
tests/           vitest suite
data/            SQLite DB + backups (gitignored)
```

## Roadmap

1. **Phase 4 — Genesis:** wake the founders, 72h observation, tune the mind loop.
2. **Phase 5 — The Hearth:** reproduction, inheritance, family tree (behind a flag until confident).
3. **Phase 6 — The Public:** spectator site, wiki rendering, human chat, sponsorship, model adoption.
4. **Phase 7 — The Net:** internet era, open-world growth, long-term operations.

See [docs/plan/TRACKER.md](docs/plan/TRACKER.md) for the full milestone tracker.

## License

Private project. All rights reserved.
