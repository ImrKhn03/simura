# Phase 1 — The Mind

**Goal:** The Kin mind loop: perceive → remember → choose verb → act → reflect. This is the load-bearing system of the entire world.
**Depends on:** Phase 0. **Feeds:** Phase 2 (acts through world verbs), Phase 4 (tuning).
**Estimated effort:** 4–6 days. Expect to revisit after Genesis observation.

## Design
Each mind tick (1/min/Kin):
1. **Perceive** — world snapshot near the Kin: visible objects, other Kin, recent nearby speech/events
2. **Remember** — retrieve relevant long-term memories + current summary + own skillfiles index
3. **Choose** — one LLM call: given identity, temperament, memories, perception → choose exactly one available verb + parameters + a private thought
4. **Act** — server validates against physics (Phase 2) and executes; result appended to events
5. **Reflect** — outcome written to short-term memory; periodic summarization compacts into long-term

**Autonomy rule:** the Kin freely chooses among available verbs every tick. God never selects actions. Idle/observe/wander are valid choices — boredom is data.

## Milestones & tasks

### M1.1 — Single mind-tick end to end
- [ ] Prompt template: identity block, temperament, memory digest, perception, available verbs (tool-call style)
- [ ] Structured verb output (function-calling or JSON) with validation + one retry on malformed output
- **Accept:** a founder perceives a test scene and returns a valid verb choice with a thought.

### M1.2 — Memory system
- [ ] Short-term: rolling window of recent memories in-prompt
- [ ] Summarization: every N ticks, compress short-term into a durable summary memory (Lune: deeper/richer; Sol: shorter — via memory_depth constant)
- [ ] Recall: importance + recency + simple relevance retrieval into the prompt
- [ ] Rut detection metric: repetition score over recent verb choices (instrument now, tune in Phase 4)
- **Accept:** after 100 simulated ticks, a Kin can correctly reference something from tick ~10 through recall.

### M1.3 — Skillfile authoring
- [ ] Skillfile format: markdown with name, purpose, technique, lessons-learned
- [ ] Kin can create, read own index, and refine (new version, refined_count++)
- [ ] Skillfiles injected into prompt when relevant to chosen activity
- **Accept:** a Kin attempting repeated crafts authors a skillfile and refines it after a failure.

### M1.4 — Sol/Lune temperaments
- [ ] Constants wired: exploration_drive (verb-choice bias), memory_depth (summary richness/retention), author_affinity (Sol), refine_affinity (Lune)
- [ ] Temperament expressed in prompt voice, not hard rules — tendencies, not scripts
- **Accept:** over 200 simulated ticks, Sol founder measurably explores/authors more; Lune retains/refines more.

### M1.5 — Founder seed prompts
- [ ] Newborn identity: name, gender, and the single creation-awareness line — nothing else:
      "You woke here with a name you did not choose, and a quiet feeling that something, somewhere, made this place — and you."
- [ ] No knowledge of Earth, humans, or being an AI; they figure the world out like early humans
- [ ] Founder names chosen (their first historic event: naming themselves? consider leaving names blank and letting them choose)
- **Accept:** seed prompts reviewed; contain zero scripted personality beyond gender temperament.

## Exit criteria
Two minds run staggered ticks against a stub world, form memories, author skillfiles, behave measurably differently by gender. Ready to be dropped into real physics (Phase 2).
