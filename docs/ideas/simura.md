# SIMURA — a living world of Kin

**Brand:** SIMURA (simura.world) · **Species:** Kin · **Genders:** Sol / Lune

## Problem Statement
How might we create a persistent 3D world where autonomous AI beings (Kin) live, learn, and build a civilization that humans find worth watching daily — and eventually worth sponsoring?

## Recommended Direction
Launch as a **Genesis Broadcast**: two immortal founding Kin — one Sol, one Lune — waking as newborn minds in a village square, knowing almost nothing, discovering their world on their own. The simulation runs continuously 24/7 at **1 think-tick per minute per Kin** on OpenAI-compatible models, **with no spending cap** (cost is instrumented for visibility only, never limited).

Kin are fully self-directed: each tick they perceive, remember, and freely choose among the world's available verbs. They grow by authoring their own **skillfiles** — self-written skills they refine, share, and will one day pass to children. New verbs unlock through **Era achievement thresholds** (see ladder below); god can rarely intervene but the world never depends on it.

Each Kin stores its own model endpoint + credentials. Founders may run on the same model or different ones — different models give free personality divergence; same model diverges through experience alone. This per-Kin endpoint design is also the foundation of the future API-key adoption mechanic.

**Creation-awareness seed** (one sentence, nothing more):
> "You woke here with a name you did not choose, and a quiet feeling that something, somewhere, made this place — and you."

**Genders are mechanical, not cosmetic:**
- **Sol — the outward flame.** Higher exploration drive, faster at authoring *new* skillfiles, shorter memory retention. Sol-kin discover.
- **Lune — the inward tide.** Deeper memory retention, better at refining and teaching skills, natural recorders. Lune-kin preserve; future historians will be Lune.
- Reproduction requires one Sol + one Lune; children inherit drive constants from the Sol parent and memory constants from the Lune parent. Population balance becomes an emergent survival pressure: all-Sol forgets its knowledge, all-Lune stagnates.

A **minimal but real UI ships in week one**: three.js village square, two voxel Kin, fixed camera, live thought/event feed. The data model is lineage-complete from day one (parentage, gender, endowment, family tree); reproduction, sponsorship, chat, and the wiki ship dark behind flags.

The long game: a Kin's lifespan is its inference funding — parents endow children (~7 days), humans extend lives by sponsoring, and donated models are adopted through parent-validated public ceremonies.

## The Era Ladder
Thresholds are behavioral signals of readiness, not raw counters. Every unlock is a historic world-log event.

| Era | Unlocks | Threshold |
|-----|---------|-----------|
| 0 — The Waking | move, observe, speak, remember (innate) | — |
| 1 — The Making | `craft` | ~20 distinct things named/described by both Kin, AND a want/need expressed aloud in conversation |
| 2 — The Building | `build` | ~25 objects crafted AND a making-related skillfile refined 3+ times |
| 3 — The Letters | durable writing/reading | One Kin successfully taught the other a skill 5 times (writing unlocks when spoken memory has visibly failed them) |
| 4 — The Hearth | reproduction flag eligible | 10+ written documents AND 3+ buildings — a culture worth being born into. Flag still requires god's confidence to enable. |
| 5 — The Net | internet access | Far future; mostly god-gated — the one verb too dangerous for a counter |

## Key Assumptions to Validate
- [ ] **Two autonomous Kin stay interesting past 72 hours** — watch them through the minimal UI for 3 days; if it's boring, fix the mind loop before adding features
- [ ] **Memory + skillfiles prevent behavioral ruts** — watch for repetition loops; tune memory summarization and unlock pacing against them
- [ ] **Achievement-driven Era unlocks actually fire** — verify Kin organically reach thresholds without god nudges
- [ ] **The 3D view earns its keep vs. the text feed** — show both to a few friends, see which they keep open

## MVP Scope (~1–2 weeks)
**In:** 24/7 world server (1 tick/min/Kin); two newborn-minded founders with Sol/Lune temperaments, persistent memory, and skillfile authoring; world verb set v1 chosen freely by Kin every tick; achievement-based Era unlocks with rare god override; live event feed; three.js village square with two voxel Kin bodies and fixed camera; lineage-complete data model; per-Kin model endpoint config; reproduction/sponsorship/chat/wiki behind feature flags.

**Out (built later, designed for now):** child-spawning behavior, family-tree UI, the wiki (activates when population grows and Lune historians emerge), human chat, API-key donation ceremonies, accounts, payments.

## Not Doing (and Why)
- **Self-modifying code** — skillfiles give the felt effect of self-improvement, fully inspectable, zero security risk
- **Fixed 7-day lifespan rule** — replaced by funded-lifespan endowments: same mortality, plus it *is* the sponsorship model
- **God-driven simulation** — god defines physics and rarely intervenes; Kin choice drives everything, or the world isn't alive
- **Human chat at launch** — the untouched world is the mystique; "first contact" becomes an in-world historic event later
- **Scripted personalities** — founders start as genuine blank newborns with an explore drive; who they become is the show
- **Spending caps** — cost is observed, never limited; later, human sponsorship funds existence

## Next Steps
1. Spec the Kin mind loop (perceive → remember → choose verb → act → reflect)
2. Spec the world server tick architecture and event log
3. Design the skillfile format and memory summarization
4. Build the three.js village square viewer
