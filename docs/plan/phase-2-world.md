# Phase 2 — The World

**Goal:** The physics: world state, verb set v1, the append-only event log, and the Era engine. God defines what *can* happen; Kin decide what *does*.
**Depends on:** Phase 0 (can start parallel to Phase 1). **Feeds:** Phase 3 (rendering), Phase 4.
**Estimated effort:** 4–5 days.

## Design
- The village square: small tile/voxel grid, a few natural objects (trees, stones, water, plants) as raw material for curiosity
- Verbs are the only way anything changes. Server-side validation = physics (range checks, material availability, one action per tick)
- Everything lands in the append-only `events` log — the single source of truth for the UI, the future wiki, and history

## Verb set v1
| Verb | Effect | Era |
|------|--------|-----|
| move | change position (bounded speed) | 0 |
| observe | detailed perception of a target; may create a named-thing record | 0 |
| speak | say something heard by nearby Kin | 0 |
| craft | combine materials → new world object | 1 |
| build | place/construct structures | 2 |
| write | create a durable readable text object | 3 |
| learn | study a skillfile shared/taught by another Kin | 0 |
| teach | share/explain a skillfile to another Kin (success not guaranteed) | 0 |

## Milestones & tasks

### M2.1 — World state
- [ ] Village map, object placement, Kin positions; seeded natural objects
- [ ] World snapshot API (per-Kin local perception + full state for UI)
- **Accept:** snapshot returns correct local view for a Kin at any position.

### M2.2 — Verb execution + physics
- [ ] Executor per verb with validation (range, materials, targets exist)
- [ ] Failure is information: invalid attempts become felt outcomes ("the stone would not budge"), fed to reflection
- [ ] Crafting: simple combination system with discoverable (not listed) recipes — experimentation matters
- **Accept:** all v1 verbs executable; invalid attempts fail gracefully with narrative feedback.

### M2.3 — Event log
- [ ] Append-only events with tick, actor, verb, detail, historic flag
- [ ] Named-thing registry (things Kin have observed and named) — feeds Era 1 threshold
- [ ] Event stream over WebSocket for the UI
- **Accept:** replaying the log reconstructs world state (event-sourced).

### M2.4 — Era engine
- [ ] Threshold evaluators per Era (see ladder in ../ideas/simura.md):
      Era 1: ~20 named things by both + a spoken want/need ·
      Era 2: ~25 crafted + a making skillfile refined 3+ ·
      Era 3: 5 successful teaches ·
      Era 4: 10 written docs + 3 buildings (flag-gated) ·
      Era 5: god-gated
- [ ] Want/need detector on speech (lightweight LLM classification)
- [ ] Unlock = historic event + verb becomes available to all Kin next tick
- [ ] God override command (rare use): manual unlock/intervention, logged as `trigger: god`
- **Accept:** simulated behavior crossing a threshold fires the unlock exactly once, logged as historic.

### M2.5 — Two Kin, shared world
- [ ] Speech proximity: nearby Kin perceive each other's words next tick
- [ ] Teach/learn flow between two Kin, including failed teaching (feeds Era 3 pain → writing)
- **Accept:** integration test: two stub minds converse and exchange a skillfile.

## Exit criteria
Real minds (Phase 1) plugged into real physics: two Kin move, observe, name things, speak, and the Era engine watches. World is alive but invisible — Phase 3 gives it a face.
