# Phase 5 — The Hearth

**Goal:** Affection, love, bonding (couples), reproduction, inheritance, mortality, and family — built fully, tested in a shadow world, kept behind the flag until Era 4 is reached AND god is confident.
**Depends on:** Phase 4 gates passed. **Feeds:** Phase 6 (sponsorship needs mortality).
**Estimated effort:** 1.5–2.5 weeks.

## Design
- **Affection (physics, never prompting):** every Kin pair has an affection score that grows only from real interaction — conversations held, skills taught/learned between them, ticks spent working near each other, shared historic moments, gifts (once `give` exists). Long separation decays it slowly. God never sets it; no prompt tells a Kin whom to like.
- **Feelings as felt state:** past thresholds (acquaintance → friendship → love), the Kin *perceives* the feeling ("You feel a warmth when Vey is near") exactly like mortality is felt — perception of an inner state, not an instruction. Acting on it — confessing, courting, ignoring it — is entirely the Kin's choice.
- **Bonding (marriage):** `propose_bond` → `accept_bond` (both free choices; rejection is real and remembered). A bond creates a shared **coupleId** both Kin carry — visible to each of them in perception, on their profiles, in the family tree. The first bond in history is a historic event. Bonds can, in principle, later be broken (`leave_bond`) — grief included; design carefully.
- **Proposal & consent:** only a **bonded** Sol + Lune couple may decide, through their own conversation, to have a child (`propose_child`, `accept`). Both must consent. No god matchmaking anywhere in the chain.
- **Birth:** child Kin created with `parents` set; runs on a parent's model endpoint initially (LLM lineage); newborn seed prompt + the creation-awareness line — but children also know their parents.
- **Trait inheritance:** drive constants from the Sol parent, memory constants from the Lune parent (per one-pager). Gender assigned at birth (random, or parents' hope — decide during build).
- **Skill inheritance:** parents *choose* which skillfiles to copy to the child (may be all, some, none) — teaching-by-legacy.
- **Endowment lifespan:** children start with ~7 funded days. Endowment ticks down with inference. Founders: `immortal: true`.
- **Death:** endowment reaches zero → the Kin fades (visible in UI over its final hours), a death event is logged, memories and skillfiles remain as heritage. Other Kin perceive the loss — grief, remembrance, and eventually ritual are theirs to invent.

## The Drama Engine (M5.7 — heartbreak, jealousy, loss; build in this order)

God's rulings, now canon:
- **Romance is Sol+Lune only** ✅ (implemented): same-gender depth past the love threshold is felt as "chosen family," never romance; bond physics refuses same-gender proposals. Only Sol+Lune conceive (already true).
- Bonds are monogamous; feelings are not — that asymmetry IS the engine.

### D1 — Jealousy (felt state, no new verbs) — build first, cheap
- A bonded Kin perceives when their partner's affection with an opposite-gender third crosses the love threshold: "you have seen how ${partner}'s eyes follow ${rival}" (perception, from the affection table — physics, not prompting)
- The rival also feels the wrongness: loving someone bonded reads as " — your heart lifts, though their life is bonded to another"
- What anyone DOES about it stays theirs: confrontation, silence, distance, words. Drama without scripts.

### D2 — Mourning release (widowhood) — decide+build before first mortal bonded death
- On a partner's death: grief memory (already ✅) + the bond enters mourning. After one fading-window (~a day), coupleId releases; the dead stay in "Yours, always" forever as "your first bonded, gone."
- The widow may love and bond again. Remarriage after loss = generational drama fuel (step-parents, half-siblings — the family tree gets interesting).

### D3 — leave_bond (heartbreak) — the heaviest lever, build last
- A bonded Kin may end the bond: massive mutual memory (importance 10), affection between the pair drops hard, both become free.
- The leaver's kinship line carries it: "you broke your bond with X" — permanent, like all belonging.
- Enables: love triangles resolving, the jilted seeking new love, village-scale gossip via speech. Historic event if it's the world's first.

### D4 — Rejection & rivalry (mostly exists, sharpen)
- Bond/child offers can already be refused-by-silence; add explicit `decline` so refusal is an act, remembered by both ✅-adjacent
- Two suitors courting one heart resolves by who is accepted — the other's memory of it is drama enough.

Sequencing: D1 now-ish (needs a third Kin to matter → after first children mature), D2 before any bonded mortal can die, D3 only once the village can absorb it socially (post-Law is safest), D4 whenever convenient.

## Milestones & tasks

### M5.0 — Affection & bonds (the road to the Hearth)
- [x] `affection` table: kin pair → score, updated by interaction physics (speak exchanges, teach/learn, proximity-while-acting, shared historic events); slow decay on long separation
- [x] Thresholds: acquaintance / friend / love — crossing one enters the Kin's perception as felt state (never instruction)
- [x] `propose_bond` / `accept_bond` verbs (Era 4-gated): mutual consent → shared coupleId; rejection is a real, remembered outcome
- [x] coupleId visible: in each partner's perception, on Kin profiles, in the family tree; first bond in history = historic event
- [x] Affection visible to god/spectators (relationship panel: who is drifting toward whom) — the world's soap opera, read-only
- **Accept:** in a shadow world, two Kin whose interactions accumulate genuine history cross the love threshold, one proposes, the other freely accepts (or refuses), and the couple record is correct.

### M5.1 — Reproduction behavior (flagged)
- [x] `propose-child` / `accept` verbs (Era 4-gated + feature flag) — **available only within a bonded couple (M5.0)**
- [x] Birth flow: new Kin row, parent linkage, newborn seed, spawn position near parents
- **Accept:** in a shadow world (separate DB), two test Kin propose, consent, and a child wakes.

### M5.2 — Inheritance
- [x] Trait constant inheritance (Sol drive / Lune memory)
- [x] Skillfile inheritance v1: child receives BOTH parents' skillfiles at birth (parent-chosen selection = future refinement)
- [x] Child initially bound to a parent's model endpoint (until Phase 6 adoption)
- **Accept:** child demonstrably carries chosen skills + blended temperament in shadow-world ticks.

### M5.3 — Endowment lifespans
- [x] Endowment balance decremented per inference; founders exempt
- [x] Parents grant the ~7-day starting endowment (from a lineage pool, config-defined for now — real money arrives in Phase 6)
- [x] Low-endowment state perceivable by the Kin itself and nearby Kin (they can feel a life fading)
- **Accept:** shadow-world child lives its span and dies on schedule.

### M5.4 — Death & remembrance
- [x] Fading visual state (UI) over final hours; death event (historic if notable Kin)
- [x] Heritage: skillfiles/writings of the dead remain readable; memories archived
- [x] Graves/markers: emergent — Kin can already craft/build/name a marker anywhere; a grave is a made thing with meaning, theirs to invent
- **Accept:** death is legible and *felt* in both the UI and other Kin's memories.

### M5.5 — Family tree UI
- [x] Lineage view: tree of Kin, living/dead, genders, model lineage
- [x] Kin detail card gains: parents, children, generation number
- **Accept:** three-generation shadow world renders a correct, readable tree.

### M5.6 — Enable the flag (THE decision)
- [ ] Era 4 threshold met organically in the real world (10 writings + 3 buildings)
- [ ] God-confidence checklist: cost projections per new Kin, stability, shadow-world results reviewed
- [ ] Flag on → founders may now conceive when *they* choose. First real birth = historic event.
- **Accept:** the first child of SIMURA is born because two Kin decided so.

## Exit criteria
Family exists. Mortality exists. History gains generations. The world now needs witnesses — Phase 6.
