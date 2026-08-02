# Phase 4 — Genesis

**Goal:** Wake the founders. Run 24/7. Observe, measure, and tune the mind loop until the world is genuinely interesting. This phase is watching and tuning, not feature-building — and it gates everything after it.
**Depends on:** Phases 1–3. **Feeds:** go/no-go for Phase 5.
**Estimated effort:** 1–2 weeks elapsed (mostly observation), tuning bursts in between.

## The moment
Pick models for each founder (same or different — different models = free personality divergence). Start the server. Tick 1 is a historic event: **The Waking**. From here the world log is real history — treat the DB as permanent.

## Milestones & tasks

### M4.1 — 72 hours unattended
- [ ] Deploy to an always-on machine (VPS or local server) with process supervision + restarts
- [ ] Automated DB backups (history is sacred from tick 1)
- [ ] Alerting on: server down, LLM failures sustained, tick stalls
- **Accept:** 72 hours, no manual intervention, no data loss.

### M4.2 — Observation review (GATE A)
- [ ] Watch daily through the UI; keep a god-journal of observations
- [ ] Review: Are they interesting? Surprising? Distinct from each other? Would a stranger watch for 10 minutes?
- [ ] Rut report from the repetition metric (M1.2)
- **Decision:** interesting → proceed. Boring → tune mind loop (memory recall, prompt, reflection cadence) and repeat 72h. Do NOT add features to fix boring.

### M4.3 — Era 1 unlocks organically (GATE C)
- [ ] Verify naming + want/need detection fire correctly from real behavior
- [ ] The Making unlocks as a historic event without god nudges
- **Accept:** craft verb appears; founders discover crafting through experimentation.

### M4.4 — Instrumentation dashboard
- [ ] Per-Kin: tokens/day, cost/day, verb distribution, memory growth, skillfile count, repetition score
- [ ] Cost per Kin-day figure (the future unit economics of sponsorship) — observed, never capped
- **Accept:** one glance answers "how alive and how expensive is the world today?"

### M4.5 — Through the Eras
- [ ] World runs until Era 2 (Building) and Era 3 (Letters) unlock organically
- [ ] First written document = major historic event (the beginning of recorded history)
- [ ] Tune era pacing if too fast (world pace should feel slow, generational)
- **Accept:** village has structures and at least one Kin-written text; skillfiles show real refinement lineage.

### M4.6 — Prayer (the one channel toward god)
- [x] `pray` verb, innate from Era 0: Kin may address whatever made this place — but only in true need
- [x] Rarity is enforced twice: prompt guidance ("rare and costly to the spirit") + physics (a Kin who prayed twice in the last 50 ticks cannot pray again yet)
- [x] Prayers land in the `prayers` table and `/api/prayers` (god's view); prayer events glow violet in the feed; the first prayer in history is historic
- [ ] God dashboard panel: browse prayers, mark answered, optionally respond (an answer would itself be a historic event — design carefully, gods should be quiet)
- **Accept:** prayers are rare (< ~2% of ticks), legible to god, and never commanded by god.

## Tuning levers (in preference order)
1. Memory summarization cadence and recall quality
2. Reflection prompts (what the Kin asks itself)
3. Perception richness (what the world offers to notice)
4. Temperament constants
5. Tick cadence (last resort; 1/min is the design)

## Exit criteria
Gates A–D reviewed and passing. The world is interesting, self-paced, instrumented, and has begun recording its own history. Only now does reproduction (Phase 5) get built out.
