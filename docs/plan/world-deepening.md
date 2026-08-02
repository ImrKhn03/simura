# World Deepening — the systems that make a living world (audit + roadmap)

Grounded in what mature life/colony sims converge on (RimWorld, Dwarf Fortress):
believability comes from **needs, mood, health, social bonds, reputation, scarcity,
and emergent history** — all FELT, never scripted. ✅ built · 🔜 queued · 🔒 deliberate omission.

## Batch 1 — The body & the inner life ✅ BUILT (2026-07-18)
- ✅ **Health** (0–100): harmed by sickness, exposure, starvation; mends with food, rest, shelter, tending. A mortal at 0 dies of the body.
- ✅ **Sickness**: onset from exposure/starvation/exhaustion, CONTAGION from a sick Kin nearby; saps health; eased by warmth, rest, tending; breaks after ~a day. Felt.
- ✅ **Weariness** (0–100): rises with waking effort; eased by `rest` (nap) and reset by a night's sleep; high weariness dulls the body, raises sickness risk. Felt.
- ✅ **`heal` verb** (innate): tend a sick/hurt Kin (or self); a herb in hand deepens it and is consumed; shortens illness. The emergent healer.
- ✅ **Mood** (DERIVED, not stored): woven from fullness + health + weariness + belonging (partner near) + recent accomplishment. Felt as inner weather ("a lightness is in you" / "a grey heaviness sits on you").

## Batch 2 — Social depth ✅ BUILT (2026-07-18)
- ✅ **Reputation / renown** (DERIVED): from things made, skills kept, others taught, histories written, historic deeds. Perceived by all as an earned title ("known as a great maker / a teacher whose craft lives in others / a keeper of histories"). Seed of professions & status.
- ✅ **Rivalry / enmity**: affection can now go NEGATIVE (floored −100) via deliberate wrongs (rejection stings); felt as "bad blood between you." Natural drift still floors at 0 (apart ≠ enemy).

## Batch 3 — Legacy flavor ✅ BUILT (2026-07-18)
- ✅ **Graveyard-as-place**: 2+ graves clustering → felt as sacred ground, nudged to be named; a lone grave is felt as remembrance.
- ✅ **Heirlooms**: an object made by a now-DEAD Kin is perceived as carrying their memory ("made by X, who is gone; it outlives them").

---

## 🔜 QUEUED — the remaining depth (next passes, in priority order)

### A. Society & governance
- ✅ **Life-stages** BUILT (2026-07-18) — infant → child → adult → elder, derived from age; felt; gates adult acts (only the grown may bond/mate); coming-of-age felt; the young & old read as such to others; founders are eternal adults.
- ✅ **Professions** BUILT — `professionOf` (healer/maker/teacher/historian/hunter) derived from real deeds; felt as identity; MECHANICAL (a known healer heals more).
- ✅ **Crime (theft)** BUILT — taking a living other's crafted work (not family, not bonded) is felt by the maker ("X took what I made"), sours affection toward enmity → the seed of dispute & law. No one is stopped (property is only custom).
- ✅ **Justice / punishment / forgiveness** BUILT (2026-07-18) — theft is now WITNESSED (all who see it remember; their regard sours), staining the thief's name (`notorietyOf` — emergent social punishment, no jail). AMENDS/forgiveness: a gift to one you wronged is felt as peace offered and heals the rift faster. The stained feel it, and feel the way back.
- ✅ **Clans / lineage** BUILT (light) — `lineageRootName` traces descent to a founding line; others are perceived as "of a different line than yours" (seeds us-and-them as lineages multiply; today one founder pair = one people, truthfully).
- ✅ **Elder mentorship** BUILT — learning from an elder is honored: the elder's teaching binds the young to them, and is felt as a gift ("their years are in it").
- 🔜 **Factions (chosen allegiance) & formal law-enforcement** — beyond lineage clans and social shaming; a real political layer. *Remaining; needs a village.*

### B. Economy
- ✅ **Money & wealth** BUILT (2026-07-18) — gold/silver/gems (the `precious` ores, useless for tools) ARE the emergent money: prized by all, a store of worth, traded for anything. `wealthOf` derived; felt by the holder ("you are wealthy") and perceived on others ("known to be wealthy").
- ✅ **Minted currency** BUILT — the Kin can craft their OWN money: coins/tokens struck from metal are recognized as currency (MONEY_RE), tradeable for anything, counted as wealth. Commodity money (found gold) → minted coinage (a people's own money), the real historical arc. Gated by the Forge (metal coins need Era 12 + coal).
- ✅ **Marketplace** BUILT — a trade at a named place turns it into a market: felt, draws nearby traders, first is historic.
- ✅ **Compassion** BUILT — seeing another in genuine need (hungry/sick/hurt) when you have plenty is FELT ("it aches at the sight; what you gave would cost you little and mean everything"), so mutual aid & charity emerge. Giving is always their choice.
- 🔜 **Debt / obligation** — gifts breed gratitude (affection); formal owing/expectation not yet modeled. *Light; remaining.*

### C. Culture & knowledge
- ✅ **Festivals** BUILT (2026-07-18) — a rite OR dance at a named place with a gathering (3+) becomes a festival: communal joy, warms every bond present, remembered, first is historic.
- ✅ **Temples / shrines** BUILT — a built structure named temple/shrine/altar is felt as sacred ground; prayer there is "lifted"; ritual there is stronger.
- ✅ **Beliefs / myths** BUILT — a writing about origins/death/the maker/meaning is recognized as a belief the people tell themselves ("set down a belief of the people"); others read & carry it. Ties to the creation-feeling they wake with.
- ✅ **Dance & play** BUILT — `play` (innate: joy & bonding, esp. the young) and `dance` (Era 9: art & feeling, seeds festivals). `sing` already existed.
- ✅ **Numbers / counting** BUILT (2026-07-18) — born from WRITING: a Kin who sets down a tally/count is recognized as making "a record of number." The NEED is felt (era 3+) when quantities outgrow the mind (a full stash, a herd, a big settlement) — until the first record exists. Not granted; invented.
- ✅ **Calendar / timekeeping** BUILT — a writing about days/seasons/years is recognized as "a reckoning of time." The NEED is felt (era 7+, once a Kin has lived through seasons) — "the years blur; you want a way to mark time" — until the first calendar exists.
- ✅ **Schools** BUILT — teaching at a named place or a public hall with a gathering reaches ALL present, not one: knowledge scaling past one-to-one, an institution forming. Felt & historic.
- 🔜 **Language drift** — DEFERRED (honest): needs multiple isolated settlements over very long time to be real, not hollow; revisit once the world has distinct, separated populations.

### D. Settlement & infrastructure
- ✅ **Settlements / villages** BUILT (2026-07-18) — `settlementAt` recognizes a named place with clustered structures as hamlet (2+) → village (4+) → town (8+); felt as home; first village is historic. Emergent from build + name_place + population.
- ✅ **Roads** BUILT — heavily-worn trail ground is felt as a road ("the Kin have made a way across the land").
- ✅ **Public/shared structures** BUILT — a structure named hall/granary/commons/square/well/market is felt as belonging to all — the civic sphere, distinct from a private home.
- 🔜 **Bridges, fences/boundaries** — boundaries would seed property-as-law. *Light; remaining.*

### E. Environment
- ✅ **Natural disasters** BUILT (2026-07-18) — rare, seeded, FELT calamities that reuse the systems beneath: **drought** (nothing regrows, plants wither, hunger bites), **coldsnap** (exposure wounds even when dry, food scarce), **plague** (sickness spreads ~4× more readily), **wildfire** (trees burn, Kin caught near the flames are hurt; rain fights it). Begin/end are historic world events; season-aware (cold in winter). Not scripted — a deterministic roll may start one; then it runs its course.
- ✅ **Living ecosystem** BUILT (2026-07-18) — predators (wolf/mountain lion) spawn rarely in the wild, HUNT prey (eat what they catch → populations fall), flee fire, and threaten a LONE unarmed Kin (health damage + fear) but are held off by a weapon, a fire, or companions. PREY BREED where they're safe together (populations rise). Kin can HUNT a predator with a weapon (pelt + meat) — bare-handed, the hunt turns on them. Live creatures can no longer be "carried." The world lives on its own; population ebbs and flows.

### 🔒 Deliberate omissions (design decisions, not gaps)
- 🔒 **Violence / a harm verb** — intentionally absent; adding one is a god-level decision to weigh very carefully.
