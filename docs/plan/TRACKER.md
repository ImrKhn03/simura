# SIMURA — Master Tracker

> One row per milestone. Update `Status` as work progresses: `⬜ not started` · `🔨 in progress` · `✅ done` · `⏸️ blocked/parked`
> Phase details live in the linked files. Idea one-pager: [../ideas/simura.md](../ideas/simura.md)

## Phase Overview

| # | Phase | File | Goal | Status |
|---|-------|------|------|--------|
| 0 | Foundation | [phase-0-foundation.md](phase-0-foundation.md) | Repo, stack, lineage-complete data model, world server skeleton | ✅ |
| 1 | The Mind | [phase-1-mind.md](phase-1-mind.md) | Kin mind loop: perceive → remember → choose → act → reflect | ✅ |
| 2 | The World | [phase-2-world.md](phase-2-world.md) | World state, verb set v1, event log, Era engine | ✅ |
| 3 | The Stage | [phase-3-stage.md](phase-3-stage.md) | three.js village square + live feed (minimal UI) | ✅ |
| 4 | Genesis | [phase-4-genesis.md](phase-4-genesis.md) | Wake the founders, 72h observation, tune the mind loop | ⬜ |
| 5 | The Hearth | [phase-5-hearth.md](phase-5-hearth.md) | Reproduction, inheritance, family tree (behind flag until confident) | 🔨 |
| 6 | The Public | [phase-6-public.md](phase-6-public.md) | Spectator site, wiki rendering, human chat, sponsorship, model adoption | ⬜ |
| 7 | The Net | [phase-7-net.md](phase-7-net.md) | Internet era, open-world growth, long-term ops | ⬜ |

## Milestone Tracker

### Phase 0 — Foundation
| ID | Milestone | Status |
|----|-----------|--------|
| M0.1 | Repo + stack scaffolded, dev environment runs | ✅ |
| M0.2 | Lineage-complete data model migrated (Kin, memories, skillfiles, events, eras) | ✅ |
| M0.3 | World server skeleton ticks on schedule with persistence | ✅ |
| M0.4 | Per-Kin model endpoint config working (OpenAI-compatible client) | ✅ |

### Phase 1 — The Mind
| ID | Milestone | Status |
|----|-----------|--------|
| M1.1 | Single mind-tick works end to end (perceive → choose verb → act) | ✅ |
| M1.2 | Memory system: short-term log + summarization + long-term recall | ✅ |
| M1.3 | Skillfile authoring/refining/reading by the Kin itself | ✅ |
| M1.4 | Sol/Lune temperament constants applied (drive, memory depth, author/refine affinity) | ✅ |
| M1.5 | Creation-awareness seed prompt finalized; founders' seed identical except gender | ✅ |

### Phase 2 — The World
| ID | Milestone | Status |
|----|-----------|--------|
| M2.1 | World state: village square map, objects, positions | ✅ |
| M2.2 | Verb set v1 (move, observe, speak, craft, write, learn, teach) enforced by physics | ✅ |
| M2.3 | Append-only world event log (the future history source) | ✅ |
| M2.4 | Era engine: behavioral thresholds + rare god override + historic unlock events | ✅ |
| M2.5 | Two Kin converse and affect shared world state | ✅ |

### Phase 3 — The Stage
| ID | Milestone | Status |
|----|-----------|--------|
| M3.1 | three.js village square renders world state | ✅ |
| M3.2 | Two voxel Kin bodies, moving live with server state | ✅ |
| M3.3 | Live thought/event feed panel | ✅ |
| M3.4 | Fixed camera + basic scene polish (day/night tint optional) | ✅ |

### Phase 4 — Genesis
| ID | Milestone | Status |
|----|-----------|--------|
| M4.1 | Founders wake; 24/7 loop stable for 72 hours unattended | ⬜ |
| M4.2 | 72-hour observation review: interesting? ruts? (go/no-go on mind loop) | ⬜ |
| M4.3 | Era 1 (The Making) unlocks organically from Kin behavior | ⬜ |
| M4.4 | Cost + behavior instrumentation dashboard (observe, never cap) | ✅ |
| M4.5 | Eras 2–3 reached; skillfiles visibly refined; teaching observed | ⬜ |
| M4.6 | Prayer system: rare pray verb, prayers on God tab, god CAN now answer — answers arrive "from the silence" as top-importance memories | ✅ |

### Phase 5 — The Hearth
| ID | Milestone | Status |
|----|-----------|--------|
| M5.0 | Affection & bonds: interaction-driven affection meter, love as felt state, propose/accept bond → shared coupleId, relationship panel | ✅ |
| M5.1 | Reproduction behavior behind flag (bonded couples only: proposal, consent, birth) | ✅ |
| M5.2 | Inheritance: skillfile selection by parents + Sol/Lune trait constants | ✅ |
| M5.3 | Endowment lifespans: children get ~7 funded days; founders immortal | ✅ |
| M5.4 | Death, fading, and remembrance events | ✅ |
| M5.5 | Family tree UI | ✅ |
| M5.6 | Era 4 threshold met AND god-confidence check → flag enabled, first birth | ⬜ |
| M5.7 | Drama Engine COMPLETE: jealousy ✅, mourning release ✅, decline ✅, leave_bond ✅ (unlocks with The Law, era 11) | ✅ |

### Phase 6 — The Public
| ID | Milestone | Status |
|----|-----------|--------|
| M6.1 | simura.world spectator site live (read-only world + feed + search Kin) | ⬜ |
| M6.2 | The Simura Wiki BUILT: /api/wiki + World▸Wiki — every Kin `write` becomes a page, one auto-page per Kin (woven only from real deeds/bonds/lineage/writings, never invented) + one per named place, all cross-linked by names the world knows. Historian's pull: memory-deep (Lune) Kin feel unrecorded history fading and are moved to write it (era 3+). We render, they author. | ✅ |
| M6.3 | Human chat with Kin (first contact = historic; injection-defended; god opens/closes the way from the God tab) | ✅ |
| M6.4 | Sponsorship: humans fund Kin lifespans (accounts + payments) | ⬜ |
| M6.5 | Model adoption: donated API keys, validation, parental consent ceremony | ⬜ |
| M6.6 | Security hardening pass (key isolation, abuse, injection via chat) | ⬜ |

### Phase 7 — The Net
| ID | Milestone | Status |
|----|-----------|--------|
| M7.1 | The Net BUILT & sealed: `reach_beyond` verb (era 16 + god flag + powered signal-device), sandboxed read-only fetch (allowlist: Simple/English Wikipedia, no redirects, text-only, truncated), answers arrive fenced as memories "through the air", first answer historic, God-tab "Open The Net" switch (first opening = Era 16 dawn) | ✅ |
| M7.2 | World expansion: god "Expand the land" button (+16 ring of fresh seeded wilderness, historic event); trails→roads foundation; minimap | ✅ |
| M7.3 | Long-term ops: archival, world backups, population scaling | ⬜ |

## Built beyond the original plan (all ✅, live in the world)
| Addition | What it is |
|----------|------------|
| `gather` verb | Innate: take a small piece of any natural thing — born from the founders' root-cutting deadlock; first gather is historic |
| Hidden lore | Every natural object holds one discoverable truth revealed on first close observation; teachable knowledge |
| Landmarks | 5 distant discoveries (standing stones, cave mouth, old grove, spring, tall hill); finding one is historic |
| Day/night cycle | 480-tick days; night physically shrinks sight; UI sun travels, dawn/dusk light |
| Earned names | Kin are strangers until lives touch (proximity/speech); family knows family from birth |
| Intentions | Self-written note-to-self carried between ticks; shown on Kin cards |
| Echo compression | Near-duplicate memories collapse to one line with a count — kills conversation mirror-loops |
| Conversation threading | Last exchanges with the nearest Kin included in perception; speakers feel who heard them |
| Affection→bond→child | Full M5.0–M5.5 arc live, incl. family-bond taboo, child cooldown, inheritance, mortality |
| Reproduction arc (mythic) | Sol (sun) + Lune (moon) → **a Star**. love→bond→**intimacy (mutual `mate`, both must reach)**→**carrying a star (gestation ~340 ticks, felt)**→**it rises = birth (unnamed newborn)**→**parents name it (`name_child`, innate Era 0)**. Emergent, not scripted; felt pulls for longing/carrying/naming. No "pregnant" — the world's own language of light. Available early (flag) — fixes the population deadlock |
| Population deadlock fix | Market pop gate 4→3, Law 8→5 — a single family can now grow into the eras that need a people |
| The body & inner life | health (0–100, death at 0 for mortals) · sickness (exposure/starvation/exhaustion onset + contagion, saps health) · weariness (rises waking, eased by rest/sleep) · `heal` verb (tend sick/hurt, herb-boosted, emergent healer) · MOOD (derived inner weather). All FELT. See [world-deepening.md](world-deepening.md) |
| Social depth | renown/reputation (derived from real deeds, perceived as earned titles → seeds professions) · rivalry/enmity (affection can go negative via wrongs; felt as "bad blood") |
| Legacy flavor | graveyard-as-place (clustered graves → sacred named ground) · heirlooms (a dead maker's work carries their memory) |
| Life-stages | infant→child→adult→elder (derived from age, felt); gates adult acts (only the grown bond/mate); coming-of-age felt; founders eternal adults |
| Professions | healer/maker/teacher/historian/hunter derived from real deeds; felt identity; mechanical (a known healer heals more) — emergent, not assigned |
| Crime & justice | theft felt by the maker AND witnessed by all who see it → the thief's name is stained (`notorietyOf`, emergent social punishment, no jail). AMENDS: a gift to one you wronged heals the rift (forgiveness). Elder mentorship (learning from the old is honored). Lineage/clans (perceived "of a different line") seed us-and-them. Property stays custom |
| Culture & meaning | `play` (innate, bonds the young) · `dance` (Era 9) · FESTIVALS (rite/dance at a named place with a crowd → communal joy, remembered) · TEMPLES (built sacred structures lift prayer, felt as sacred) · BELIEFS/MYTHS (writings about origin/death/meaning recognized as the people's beliefs, read & carried). All emergent, gated, felt — and population-scaled |
| Living ecosystem | predators (wolf/lion) spawn rarely in the wild, hunt & eat prey (populations fall), flee fire, threaten lone unarmed Kin (held off by weapon/fire/companions); prey breed where safe (populations rise); Kin hunt predators with a weapon (pelt+meat) — bare-handed it turns on them; live creatures can't be carried. The world lives on its own |
| Knowledge (cognitive layer) | NUMBERS (writing a tally = "a record of number"; the need felt when quantities outgrow the mind), CALENDAR (writing days/seasons = "a reckoning of time"; the need felt once seasons have turned), SCHOOLS (teaching at a named place/hall reaches all gathered — knowledge past 1-to-1). Invented by the Kin via writing, never granted; needs are felt, tools recognized. Language drift deferred (needs isolated populations) |
| Settlement | villages emerge, not declared: named place + clustered structures → hamlet (2+)/village (4+)/town (8+), felt as home, first village historic. ROADS: heavily-worn trail ground felt as a road. PUBLIC structures (hall/granary/commons/well/square) felt as shared civic ground vs private homes. Emergent from build + name_place + population |
| Economy | gold/silver/gems (mined) = emergent commodity MONEY; the Kin can also MINT their own currency (craft coins/tokens from metal, recognized & tradeable). `wealthOf` derived, felt by holder & perceived on others (status). MARKETS: trade at a named place makes it a market. Money is physical (objects — carriable, storable, stealable, inheritable), never an account balance. COMPASSION: another's genuine need is felt when you have plenty → charity/mutual aid emerge |
| Natural disasters | VERY RARE seeded calamities (~one per world-month: forced ~20-day calm + low chance), felt & historic: drought · coldsnap (winter) · plague (sickness ~4×) · wildfire (trees burn, Kin near flames hurt) · flood (low ground drowns & wounds; high ground safe). Reuse hunger/health/sickness/fire/regrow/terrain — not scripted, they run their course; flood's lesson (build high) is FELT, adaptation left to the Kin. See [world-deepening.md](world-deepening.md) |
| Prayer | Rare-by-physics pleas visible at /api/prayers and the God tab |
| God pace controls | Live tick-speed slider (Slowest→Fastest) + editable era thresholds, persisted in DB |
| AI SDK providers | Azure / any OpenAI-compatible per-Kin or global (currently DeepSeek free via OpenCode Zen) |
| Object resolution | Kin refer to things by given names/kinds/short ids — no UUID fumbling |
| Creations tab | UI gallery of everything Kin make: 3D-rendered thumbnails of their designed shapes, maker/tick/kind, readable writings; Kin sub-tab = clickable roster that flies the camera onto a Kin |
| Run report | `scripts/run-report.ts` — one-command M4.2 review: verb distribution, dead-end hits, model health, tokens, eras, historic beats |
| Procedural world | Minecraft-style seeded infinite terrain (fBm heightmap, biomes, ALL-direction edge-growth incl. negative coords), weather spells, day phases, fauna (fish/deer/fowl + boids birds), terrain+water felt in perception |
| Needs & drive | Hunger (fullness decays; eat verb; meat best cooked; starving burns mortal light faster; founders feel but never die) + dopamine loop (glow after real accomplishment, restlessness after ~90 idle ticks) |
| Scarcity & renewal | Rooted things deplete (4 gathers → spent stump/rubble, rendered), craft/build consume raw materials (never food), fires burn to ashes ~1.5 days, land regrows (sprouts every ~25 ticks + fresh seeding on expansion) |
| Biome riches | The land decides what grows where: berries/flowers in meadows, timber+mushrooms in forest, reeds+clay on shores, stone+ore in highlands — reasons to travel |
| Teamwork & building | Co-craft (companion-held materials in reach; first is historic), give-with-full-hands lays at feet, progressive structures (48 parts, extent 6, anyone extends, each stage consumes material), storage containers (drop into / carry out, contents in perception) |
| Lineage looks | Children render as a blend of their parents' colors (+own tint, drifts per generation); the young are small and grow over ~2 days |
| The world's sound | Procedural WebAudio (no assets): weather-driven wind + rain, birdsong by day, crickets by night; HUD 🔊 toggle |
| The story so far | /api/digest + World▸Story: each world-day told as a chapter (headline, historic beats, counts) — template-woven, zero LLM cost |
| Spectator UX overhaul | Ambient on-stage layer (kin bar with glanceable hunger/sleep/bond/glow/restless glyphs, event ticker, historic toast) + panel consolidated to Live/World/God with World sub-nav (Story·Chronicle·Creations·Family·Relations·Wiki); Live feed filters (all·speech·deeds·historic); Kin detail is now a slide-over drawer not a modal |
| Relations graph | World▸Relations: radial affection web — line warmth+thickness = affection, ❤ = bonded, click a name to follow |
| Camera system | 4 modes (auto/orbit·eye·fly·cinema) + preset angles 1-4, keyboard+mouse+HUD; the whole sky rides the view |
| Era ladder overhaul | Epoch cooldown (≥360 ticks between ages — no cascading); repaired gates (Letters now needs oral-memory FAILURE, not success; Sky = settled literate people; late eras gate on NEW era-specific activity not pre-satisfied cumulative counts); felt "new capacity" nudge on every unlock so weak models discover new verbs |
| New verbs | cook (Era 1, fire→better food), bury + name_child (Era 4, mortality & family), tame (Era 8, herding), ritual (Era 9, shared meaning) |
| Fauna variety & knowledge | 15 species across fish/deer/fowl (trout/carp/eel/pike, boar/hare/goat/sheep, duck/goose/quail/pheasant…), biome-placed (goats high, waterfowl on shores); each carries a discoverable truth — observing a creature teaches its ways, shown in perception |
| Caves (real) | Generate on expansion in high/stony ground; give shelter from weather; walls hold ore; dark inside (fire lights the way); felt in perception; distinct 3D mesh (rocky mound + dark mouth) |
| Mining (Minecraft theory) | `ores.ts`: 7 ores (coal/copper/tin/iron/silver/gold/gems) with DEPTH (rich near caves & heights, common elsewhere) + TOOL TIERS (stone→copper→bronze→iron pick; a soft pick can't crack a hard vein) + SMELTING (ore+fire→metal; iron/silver/gold need COAL burning hot). You don't know what a vein holds until you mine it. The metal ladder IS the tech climb. |

## Watchlist / Backlog (discussed, not yet built — nothing forgotten)
- [x] **`carry` / `drop`** — DONE: two-hand inventory; items follow the carrier, visible in their hands on the UI, no stealing
- [x] **Verb petitions (channel)** — DONE via answered prayers: Kin plead, god replies from the silence; implementing a pleaded-for capability remains a god act in code
- [x] **Civilization ladder BUILT (eras 5–15, all era-gated):** Sack ✅ Loom ✅ Sky ✅ Sowing ✅ Song ✅ Market ✅ Law ✅ Forge ✅ Wheel ✅ Current ✅ Signal ✅ — Net (16) god-gated forever. See [civilization-ladder.md](civilization-ladder.md)
- [x] **`give` + `name_place`** — DONE (generosity feeds affection; named ground appears in perception, on the 3D map, and in the Chronicle). Still unscheduled: `rest`/`dream`, `trade`, `sing`, `ritual`
- [x] **`read` verb** — DONE: unlocks with Era 3 alongside `write`; reads full content + author by title or id
- [x] **`heardBy` on speak events** — DONE: every speech records exactly who heard it; conversation entity still future (population >2)
- [ ] **Intention adoption fallback** — if models keep ignoring the field, make it required-but-emptyable
- [x] **Semantic memory recall** — DONE: embeddings on every memory (local hashed 1024-dim by default, stemmed+stopword-filtered; any OpenAI-compatible /embeddings endpoint via EMBED_* env), hybrid recall 0.75·similarity + 0.15·importance + 0.1·recency, batch back-fill each tick, graceful fallback
- [ ] **Per-verb one-line descriptions in seed prompt** — if a new verb goes undiscovered too long (gather was found organically; watch each addition)
- [x] **Kin-designed shapes** — DONE: craft/build accept a bounded voxel `shape` (parts+colors) rendered as designed; full Phase 7 M7.2 expressiveness still future
- [ ] **Security: rotate Azure + OpenCode keys** (both were pasted in chat)
- [ ] **Era 4 unlock semantics** — reproduction flag was enabled early by god's choice; Era 4 event remains the ceremonial "culture worth being born into" milestone

## Assumption Gates (from the one-pager)
- [ ] **Gate A (after M4.2):** two Kin stay interesting past 72h — else fix mind loop before Phase 5
- [ ] **Gate B (during Phase 4):** memory + skillfiles prevent ruts
- [ ] **Gate C (M4.3):** Era thresholds fire organically without god nudges
- [ ] **Gate D (Phase 3/4):** 3D view earns its keep vs. the text feed
