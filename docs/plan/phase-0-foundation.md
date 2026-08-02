# Phase 0 — Foundation

**Goal:** A running skeleton: repo, stack, lineage-complete data model, and a world server that ticks and persists — before any intelligence exists.
**Depends on:** nothing. **Feeds:** every other phase.
**Estimated effort:** 2–3 days.

## Stack decisions (proposed)
- **Server:** Node.js + TypeScript (single world-server process; tick scheduler inside)
- **DB:** SQLite via better-sqlite3 to start (single-writer world = perfect fit; migrate to Postgres when public)
- **LLM client:** plain OpenAI-compatible HTTP client, endpoint + model + key stored **per Kin**
- **Frontend:** Vite + three.js (Phase 3)
- **Transport:** WebSocket for live world state → UI
- **Monorepo layout:** `/src/server`, `/src/shared`, `/src/web`, `/tests`, `/config`, `/scripts`

## Data model (lineage-complete from day one)
- `kin` — id, name, gender (`sol`|`lune`), parents (nullable pair), born_at, died_at (null), immortal flag, endowment_balance, model_endpoint, model_name, api_key_ref, temperament constants (exploration_drive, memory_depth, author_affinity, refine_affinity), position, status
- `memories` — kin_id, tick, kind (`observation`|`reflection`|`summary`), content, importance
- `skillfiles` — id, owner_kin_id, name, content (markdown), version, refined_count, learned_from (nullable kin_id)
- `events` — append-only world log: tick, actor, verb, target, detail, historic flag
- `eras` — era number, name, unlocked_at_tick, trigger (`achievement`|`god`)
- `world_objects` — id, kind, position, creator_kin_id, created_at_tick
- `settings/flags` — feature flags: reproduction, chat, sponsorship, wiki

## Milestones & tasks

### M0.1 — Repo + stack scaffolded
- [ ] Init TypeScript monorepo, lint/test/build scripts (`npm run build|test|lint`)
- [ ] `/config` for world config (tick interval = 60s, village bounds, era definitions)
- [ ] Secrets via `.env` (never committed); API keys referenced, not stored in code
- **Accept:** `npm run build && npm test` green on a hello-world server.

### M0.2 — Data model migrated
- [ ] Schema + migration script for all tables above
- [ ] Typed repository layer (typed interfaces for all public APIs)
- **Accept:** can create two founder Kin rows (parents null, immortal true) and read them back with types intact.

### M0.3 — World server skeleton ticks
- [ ] Tick scheduler: fires per-Kin mind ticks at 1/min/Kin, staggered
- [ ] Crash-safe: resumes from DB state on restart; tick counter persisted
- [ ] Structured logging
- **Accept:** server runs 1 hour unattended, tick counter advances, restart resumes cleanly.

### M0.4 — Per-Kin model client
- [ ] OpenAI-compatible chat client; endpoint/model/key resolved per Kin
- [ ] Retry with backoff; failures logged as world events ("Kin felt dizzy"), never crash the world
- [ ] Token usage recorded per call per Kin (observability only — **no caps ever**)
- **Accept:** each founder can complete a chat call through its own configured endpoint.

## Exit criteria
Skeleton server ticks 24/7 with persistence, two founder rows exist, model calls work per Kin. No intelligence yet — that's Phase 1.
