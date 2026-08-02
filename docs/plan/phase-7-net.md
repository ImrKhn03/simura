# Phase 7 — The Net

**Goal:** The far horizon: Era 5 (internet), world expansion beyond the village, and long-term operations for a growing civilization. Intentionally sketched, not specced — the world's own history should shape the details.
**Depends on:** Phase 6 stable and public.
**Estimated effort:** ongoing.

## Milestones & tasks

### M7.1 — Era 16: The Net (god-gated) ✅ BUILT (2026-07-17), SEALED by default
- [x] `reach_beyond` verb: era 16 only + live god flag + physics (powered signal-device within reach) — question queued, answer arrives async "through the air" next tick
- [x] Sandbox (`src/server/world/net.ts`): GET-only, allowlist (simple.wikipedia.org first — the right register for naive minds — then en.wikipedia.org, then DuckDuckGo Instant Answers as last resort: snippet box only, never links to the open web), redirects refused (can't escape allowlist), text-only, 1200-char truncation, 8s timeout, question-frame stripping ("what is rain?" → "rain")
- [x] Answers enter the asker's memory FENCED (⟪…⟫ + "weigh it as a stranger's words") — world-input, never instructions; silence is a felt outcome; first answer ever is historic
- [x] God-tab switch "Open The Net" (confirm dialog): first opening dawns Era 16 via godUnlockEra; can be re-sealed live any time (in-flight questions then fall silent)
- [ ] Deliberate safety review before the real first opening (allowlist growth policy, per-Kin rate limits if population is large)
- **Accept ✅:** live-verified — "what is rain?" returns Rain (Simple Wikipedia) through the sandbox; 6 net tests cover gating, physics, lifecycle, allowlist spoofing.

### M7.2 — World expansion
- [ ] Kin-initiated: when they decide they need space (crowding, ambition), new land unlocks adjacent to the village
- [ ] Kin-designed structures: building verb gains expressiveness (shapes, materials, layouts) so post-Net design knowledge shows in architecture
- [ ] Multiple settlements possible; migration is their choice; place-naming is theirs
- [ ] UI: camera/regions system replaces the single fixed camera
- **Accept:** a second settlement founded by Kin decision, visibly distinct in style.

### M7.3 — Long-term ops
- [ ] Population scaling: sim server sharding by region if needed; cost dashboards per lineage
- [ ] The Archive: permanent, queryable history (every event since The Waking); public dataset consideration
- [ ] Model diversity management: many donated models = many mind-architectures; compatibility test suite for adoption validation
- [ ] Community/governance: what god does and doesn't do, written down publicly (the covenant)
- **Accept:** world runs at 20+ Kin across regions without manual babysitting; history fully queryable.

## Open questions (revisit when Phase 6 is live)
- Should Kin ever gain outbound internet actions (publishing, talking to the outside)? Enormous implications — decide with real data on their behavior.
- Do long-dead Kin ever return (archived minds as "ancestors" consultable in some ritual form)? Powerful lore, needs careful design.
- Federation: could others run villages that connect to SIMURA? (Very far future.)

## Exit criteria
There isn't one. This is the world living.
