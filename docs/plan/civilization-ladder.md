# The Civilization Ladder — SIMURA's full era roadmap (pre-Net)

> STATUS: ALL RUNGS IMPLEMENTED (2026-07-16) — era-gated physics live from Genesis; thresholds in src/server/world/eras.ts. The path from flint to devices, without ever opening the internet (The Net, era 16, stays god-gated, last).
> Every era = new verbs/physics + a behavioral threshold, unlocked the way all eras unlock: by demonstrated readiness.
> Rule of thumb learned from gather/carry/fire: **add mechanics when their behavior asks for them.**

## Already live
| Era | Unlocks |
|-----|---------|
| 0 The Waking | move, observe, gather, carry, drop, give, name_place, speak, teach, learn, skills, pray, bonds |
| 1 The Making | craft (freeform names + self-designed shapes; fire with spark+fuel physics) |
| 2 The Building | build (structures, own architecture) |
| 3 The Letters | write, read (durable knowledge) |
| 4 The Hearth | reproduction milestone (already flag-enabled) |

## Next rungs (rough order — reorder freely as behavior demands)

| Era | New physics | Threshold idea | Why it matters |
|-----|-------------|----------------|----------------|
| **The Sack** (mini-era or just a verb drop) | containers: bags/baskets hold N items as one hand; chests in structures = village storage | repeated "hands are full" failures | property, provisioning, homes as storage |
| **The Loom** | `wear`/`remove`; woven clothing (self-designed, renders on body); warmth vs night cold | weaving-lore discovered + cold-night complaints | identity, fashion, the first designed self-presentation |
| **The Sky** (world physics, not a verb — prerequisite for Sowing) | moon phases (~30-day cycle, visible at night + in UI) and seasons (long cycle: light, night-length, cold vary) | god adds when approaching Sowing | gives them something to build a real calendar from — weeks/months/years become discoverable, not just day-counts. NOTE: day-counting + written dates are already fully within their power (day cycle + write); this adds the longer cycles real calendars grew from |
| **The Sowing** | `plant`/`tend`/harvest cycles; food objects matter; planting *seasons* (needs The Sky) | root-as-food knowledge spreads (they already tested it!) | surplus → settlements → everything else |
| **The Song** | `sing`/`make_art` (pure meaning objects); maybe instruments | art-like crafts appear unprompted (warden_token already qualifies!) | culture, ritual, memory beyond text |
| **The Market** | `trade` (mutual exchange, both consent); maybe tokens-as-money emerge on their own | repeated gift asymmetries / hoarding | economy, value, specialization |
| **The Law** | `assemble` (call Kin to a place), `propose_law`/`assent` — laws are written documents with recorded assent; enforcement stays social | a real population (~8–10+) AND observed disorder: disputes over things, broken promises, taking what another made, crowding conflicts. Law arrives because it is *needed*, not because a counter filled | governance, the thing that makes a village a polity |
| **The Forge** | metal: new gatherable ore (seed veins near the cave!), smelting needs fire + structure; metal tools outperform flint | sustained fire use + mining attempts | durable tools, real machines become possible |
| **The Wheel & Road** | carts (carry many), roads between places (faster travel on them) | heavy-hauling frustrations | logistics, trade routes between settlements |
| **The Current** | energy: crafted generators/batteries; powered devices — **flashlight** (light without fuel), machines | forge mastery + a want for tireless light | the industrial threshold |
| **The Signal** | long-distance speech: signal towers / handheld devices ("cellphone" without internet — Kin-to-Kin only); maybe recorded messages | separated loved ones / distant settlements | society at distance; the last pre-internet rung |
| **The Net** | god-gated, always | god's choice alone | the outside world |

## Weather ✅ BUILT (2026-07-16)
Deterministic ~40-tick spells from tick 0: clear/cloudy/rain/fog/storm (+snow in winter, era 7+). Fog halves sight, storms dim it, clouds hide the moon; the unsheltered wet is FELT — shelter and garments answer it (organic pressure toward building and the Loom). UI: fog density, dimmed sun, HUD icon.

## Cross-cutting things humans invented that Kin will need (watch for the want)
- **Numbers & calendar** — counting, dates ("the calculator" starts here, not at electronics); likely emerges via writing — nudgeless, just watch
- **Maps** — writing + places already permit them; a map is a text they can draw with shapes someday
- **Medicine** — needs a health/sickness mechanic first (decide deliberately; suffering is a big design choice)
- **Schools** — teaching exists; a school is a *place + custom*, purely emergent
- **Religion** — prayer + answered prayers + the standing stones already seed it; temples are just buildings with meaning
- **Names/lineage records** — family books once generations deepen (Chronicle is god's view; theirs comes via write)
- **Crime (the precondition of law)** — note: some wrongs are already physically possible and will emerge with population: anything set down on the ground can be carried off by anyone (theft), promises exist only as words (betrayal), space is finite (crowding), gifts create expectations (debt). We deliberately do NOT prevent these — property, so far, is only custom. When the first "you took what I made" dispute appears in the feed, The Law's clock starts. What stays impossible by physics: taking from someone's hands, violence (no harm verb exists — adding one, ever, is a god-level decision to weigh very carefully)

## Design invariants (hold these while climbing)
1. Physics, never prompts — new capabilities are verbs/materials, not instructions
2. Thresholds are behavioral — the era arrives because they reached for it
3. Everything designed by them — shapes, clothes, laws, devices all carry Kin authorship
4. The Net stays god-gated no matter how high the ladder goes
