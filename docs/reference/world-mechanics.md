# World Mechanics Reference — how everything actually works

The exact behaviors, numbers, and data behind every system built this session — the source
of truth for both understanding the world and rendering it (pairs with `docs/plan/ui-surfacing.md`).
All effects are FELT (surfaced to minds via perception), never scripted, and gated by biology
(innate) vs civilization (era-earned). Ticks are the world's clock; a "world-day" = `day.lengthTicks`
(default 480). "scale" = tickMs / 15000 (real-time anchoring).

---

## 1. The body & needs (per-Kin, innate from birth)

| Stat | Field | Range | Falls from | Rises from | Death? |
|------|-------|-------|-----------|-----------|--------|
| Fullness (hunger) | `fullness` | 0–100 | ~0.25/tick·scale | eating (+40 raw meat, +70 cooked, +45 plant) | at 0, a MORTAL's endowment burns 2×/tick·scale |
| Health | `health` | 0–100 | sickness −0.5, exposure −0.3, starving −0.4 (per tick) | fed & rested & unhurt +0.6, sheltered+warm +0.15 | at 0, a MORTAL dies "of the body" |
| Weariness | `weariness` | 0–100 | — | rises +0.18/tick·scale | eased by `rest` (nap −30, night sleep →0 at dawn); >85 raises sickness risk |
| Sickness | `sickUntil` | tick or null | — | onset (below) | breaks after ~0.8–1.8 world-days; eased/shortened by `heal` |
| Mood (derived) | computed | 0–100 | low health/hunger/weariness/sick/idle | fed, healthy, rested, partner near, recent accomplishment | felt only; colors behavior |
| Drive/fulfillment | `lastFulfilledTick` | tick | — | any real act (craft/build/gather/give/teach/eat/…) | felt: glow ≤10 ticks after; restlessness >90 ticks |

**Sickness onset** (per tick, if well): risk = (exposed 0.012) + (starving 0.02) + (very weary 0.008) + (a sick Kin within 2 tiles 0.02) + (plague 0.006), all ×(plague ? 4 : 1) ×scale. **Exposed** = (wet weather OR coldsnap) AND no shelter (structure/cave within 2) AND no warmth (fire within 3 or a worn garment).
**Healing** (`heal` verb): +10 health (+22 with a herb in hand; +10 more if the healer's profession is healer); a herb is consumed; illness shortened by ~0.35 world-days. Can tend others (within teachRadius) or self.
**Mood formula:** `fullness·0.25 + health·0.3 + (100−weariness)·0.15 + (sick? −15) + (partner near? +12) + (fulfilled≤20t? +12 : idle>120t? −10)`. ≥78 glad, ≤30 despair, ≤45 low.

**UI:** vital bars in the Kin drawer; micro-bars + mood tint on the Kin bar; on-body pallor (sick), belly-glow (star), fading opacity (dying). Sick/starving/weary already surface as felt lines.

**Movement collision:** a Kin’s chosen destination remains their own, but bodily travel is swept between the current and intended positions. Living rooted trees, unspent stone, and the walk-height solid parts of structures block passage; generated door openings permit it. Floors, roofs, overhangs, trim, grass, particles, small ground matter, carried things, and worn things do not block. A blocked Kin stops or slides along the obstacle and feels ordinary worldly language; collision never chooses a replacement destination or scripts a decision.

---

## 2. Reproduction — the mythic arc (Sol + Lune → a Star)
Gated: intimacy needs a bond (love), one Sol + one Lune, adulthood, enough food; available early (flag).
1. **Bond** (`propose_bond`/`accept_bond`) — affection ≥ love (100). Only adults (life-stage) may bond.
2. **Intimacy** (`mate`) — MUTUAL: one reaching sets `mateToward`; when BOTH have reached each other, a star is kindled. Needs closeness (speechRadius), both fed (≥30 fullness), not already carrying, past child-cooldown.
3. **Carrying a star** — the Lune's `starRisesAt = tick + gestation` (~340 ticks), `starWithId = sol`. Felt: "you carry a star not yet risen."
4. **Birth** (sim, when `tick ≥ starRisesAt`) — an UNNAMED child ("a newborn") is born at the Lune's position; inherits both parents' skillfiles + a blend of temperament + the sol's model (lineage). Event: "A star rises…" (first birth historic).
5. **Naming** (`name_child`, innate) — a parent names the newborn while young.

**UI:** belly-glow while carrying + gestation countdown chip; "A star rises" toast on birth; family/lineage in Family tab & the drawer identity line.

---

## 3. Life-stages (derived from age; founders are eternal adults)
Fractions of `childEndowmentTicks` (funded life): **infant** <7% · **child** <28% · **adult** <80% · **elder** ≥80%. Gates: only adults may bond/mate. Felt: own stage ("you are a child still…", "you have come of age", "you are old now…"); others read as infant/child/elder. Children render smaller and grow.
**UI:** stage in drawer identity line + Kin bar icon; "(child)"/"(elder)" tag over the mesh; coming-of-age toast.

---

## 4. Social layer (derived, perceived — emergent status)
- **Affection** (`affection` table): grows from proximity/speech/teach/give; decays with distance (floor 0); can go NEGATIVE (floor −100) only from deliberate wrongs (rejection, theft) → **rivalry/enmity** ("bad blood between you").
- **Reputation** (`renownOf`, derived from deeds): title like "a great maker / a teacher whose craft lives in others / a keeper of histories / a doer of firsts." Threshold: weighted deed-count ≥6.
- **Notoriety** (`notorietyOf`, from witnessed `theft` events): "a known thief, watched warily." Social punishment.
- **Profession** (`professionOf`): healer/maker/teacher/historian/hunter from real deeds (≥4); mechanical bonus (healer heals more).
- **Wealth** (`wealthOf`): count of money (gold/silver/gems/coins) carried or stashed in own containers; ≥5 = "wealthy," perceived by others as status.
- **Clan/lineage** (`lineageRootName`): descent to a founding line; others "of a different line than yours" (seeds factions as lineages multiply).
- **Compassion**: seeing another in genuine need (hungry/sick/hurt) when you have plenty is felt → charity emerges. **Amends**: a gift to one you wronged heals the rift (forgiveness).

**UI:** People panel (roster of stage/profession/renown/notoriety/wealth/clan); relations graph with warmth AND enmity edges, nodes colored by clan; drawer identity line.

---

## 5. Economy
- **Money = physical objects**, never a balance: commodity money (gold/silver/gems from mining) + **minted currency** (coins/tokens the Kin `craft` from metal — recognized by `MONEY_RE`, gated by the Forge for metal coins). All prized, tradeable for anything, a store of worth. Carriable, storable, stealable, inheritable, losable to fire/flood.
- **Trade** (`trade`/`accept_trade`, Era 10): swaps any held items; precious things function as payment.
- **Markets**: a trade at a named place → felt as a market forming; draws traders.
- **Wealth → status** (see §4). Charity (§4) redistributes.

**UI:** Economy panel (wealth ranking, minted-currency total, market locations, recent trades); market tag/stall on the map; coins as gold thumbnails in Creations.

---

## 6. Mining & materials (Minecraft theory)
- **7 ores** (`ores.ts`): coal (fuel), copper, tin, iron, silver, gold, gems — each with tier, smeltsTo, precious/fuel/hotSmelt.
- **Depth**: rich ores (iron/silver/gold/gems) cluster near caves & high ground; common (copper/coal/tin) elsewhere. You don't know what a vein holds until you mine it.
- **Tool tiers**: stone pick → copper & coal; bronze pick → iron; iron pick → gold/silver/gems. A soft pick "only sparks and chips" a hard vein.
- **Smelting**: ore + fire → metal; hard metals (iron/silver/gold) need **coal** burning hot.
- **Caves**: generate on expansion in high/stony ground; give shelter, hold ore, are dark (fire lights them); distinct mesh.

**UI:** ore-vein flecks colored by type on stone; cave labels & wall-glints; the mining ladder is felt via the Forge era nudge.

---

## 7. ANIMAL BEHAVIOR, SPAWNING & PHYSICS (the ecosystem) — detailed

### 7.1 Prey (fish · deer · fowl) — 15 species
- **Spawning**: every 12 ticks (if under cap = ~`W·H/350`), one prey spawns at a random spot NOT within 6 tiles of a Kin, in a **biome-appropriate** place: fish in water/shore; deer-kind (incl. mountain goat/wild sheep) in highland/peak; deer/fowl in forest/meadow; waterfowl (duck/goose) on shores. Species chosen by a position+tick hash so knowledge maps to place.
- **Each species carries lore** (its ways), revealed by `observe` — e.g. "a red deer grazes at dawn and dusk and beds in cover"; "a pike lies still, then strikes."
- **Movement (per tick)**: flee any Kin OR predator within 4 tiles (move 2 away); else amble ±1 every other tick. Fish stay in water; land prey stay out of it.
- **Breeding**: every 12-tick cycle, where two of the same kind are within 2 tiles AND safe (no predator within 5, no Kin within 4), a "young X" may be born (¼ chance). Populations RISE in safe country.
- **Catching** (`gather`): needs the right tool — fish: spear/net/hook/line; deer: spear/bow/snare; fowl: bow/net/snare. Bare hands fail (it flees). Yields fresh fish / venison / fowl meat.
- **Taming** (`tame`, Era 8): fowl/deer + food in hand + patience → a "kept" animal (gives eggs/young); fish can't be kept.

### 7.2 Predators (wolf · mountain lion) — the danger
- **Spawning**: rare — only if under a low cap (~`preyCap/7`), prey ≥4 exist, a 1-in-6 tick gate hits, in wild forest/highland/meadow **≥10 tiles from any Kin**. First predators are a historic event.
- **Hunting (per tick)**: move 2 tiles toward the nearest LAND prey (within 12); if adjacent (≤1), **eat it** (prey removed → population falls). If no prey in range, amble.
- **Fear of fire**: a predator within 4 tiles of any fire flees it instead of hunting. → a lit campfire wards the settlement.
- **Threat to Kin**: a predator adjacent (≤1) to a Kin who is **alone** (no other Kin within 3), **unarmed** (no spear/bow/axe/blade/knife/club/sling in hand), and **has no fire within 4** → the Kin takes **−10 health** + a fear memory. Otherwise (armed / by a fire / with companions) the predator "keeps its distance." → safety is in arms, hearth, and numbers.
- **Being hunted** (`gather` on a predator): with a weapon → brought down for a **pelt + wild meat** (first is historic); bare-handed → the hunt turns on the hunter (−12 health, predator survives).
- Live creatures (prey & predators) **cannot be carried** — caught, hunted, or tamed only.

### 7.3 The balance
Predation pulls populations DOWN, breeding pushes them UP; predators fear fire and avoid people, so settlements are safer than the wild. A drought/wildfire that thins the wild can drive "a lean wolf" toward the edges of the settlements — emergent drama, unscripted.

**UI:** predator = red minimap dot + hunting-lunge animation + red ‼ over a threatened Kin; prey = pale dots + fleeing gait; kept animals a distinct herd icon; creature labels with species + state + lore; "first predators" toast.

---

## 8. NATURAL DISASTERS (calamities) — detailed

### 8.1 Rhythm (very rare)
State in `meta.calamity` ({kind, until, began}) + `meta.calamity_last`. Each tick `stepCalamity` runs:
- If one is active → nothing new.
- If one just expired → clear it, mark the calm, emit `calamity_ended` (historic).
- Else: require a **forced calm** of ≥20 world-days since the last, THEN a low per-tick roll (~0.00008·scale). Net: **≈ one calamity per world-month** — a memorable event, not routine.
Kind is chosen season-aware (cold/plague/flood in winter; drought/wildfire/plague/flood otherwise). Duration ~0.5–1.4 world-days. Begin/end are historic events.

### 8.2 The five calamities & their physics
| Calamity | What happens (mechanics) | Reuses |
|----------|--------------------------|--------|
| **Drought** | `regrow` gives nothing; green plants wither (one removed per cycle); hunger bites (food scarce) | food/regrow/hunger |
| **Coldsnap** | exposure wounds even in DRY weather (not just rain) → health drains for the unsheltered/unclad; winter-biased | health/exposure |
| **Plague** | sickness onset & contagion ×4; the healers are tested | sickness/health/heal |
| **Wildfire** | in dry weather, 1–2 trees burn away per tick; any Kin within 3 of a burning tree takes −12 health + terror; RAIN fights it | fire/health/trees |
| **Flood** | Kin on low ground (elevation < 0.3) take −8 health + "get to higher ground"; high ground (≥0.7) is SAFE and felt as such | terrain/health |

### 8.3 Emergence & adaptation (important)
Disasters are **not scripted** — a seed-roll may start one, then it runs its course. Effects are **felt** so the Kin can respond: a flood teaches "the low ground drowns, the heights keep you safe" — but whether they then **build on high ground** is THEIR choice (never forced; depends on model). Fire wards wolves and warms against cold; caves & shelter save lives; stored food survives a drought. The calamities interlock with every other system.

**UI (see ui-surfacing 2A):** full-screen per-calamity grade (dry haze / blue frost / green pall / fire glow+smoke / rising water), a persistent HUD banner with days-remaining, historic begin/end toasts, minimap tint + burning/flooded tiles, and calamity-specific sound.

---

## 9. Culture, settlement, knowledge (quick reference)
- **Festivals**: rite/dance at a named place with 3+ present → communal joy, bonds all present, remembered; first historic.
- **Temples/shrines**: built sacred structures; prayer there "lifted"; felt as sacred.
- **Beliefs/myths, records/numbers, calendars**: recognized from `write` content (lore tag `belief`/`record`/`calendar`); the felt NEED to count/keep-time drives inventing them.
- **Schools**: teaching at a named place/public hall with a gathering reaches ALL present.
- **Settlements**: named place + structures → hamlet (2+)/village (4+)/town (8+); first village historic. **Roads**: heavily-worn trails. **Public structures**: hall/granary/commons/square/well/market felt as shared.
- **Justice**: theft witnessed → stains the name (notoriety); amends (a gift to the wronged) heals it. **Elder mentorship**: learning from elders honored.

**UI:** settlement/market/festival/sacred labels on the map; wiki badges for belief/record/calendar; Chronicle milestone icons; People/Relations/Economy panels (§Part 4).

---

## 10. Flora, land & object lifecycles (spawning, depletion, renewal)
- **Initial seeding** (`seedWorld`/`seedRect`): trees, stone, water, plants, flowers scatter by BIOME — meadows: berry bushes/flowers/plants/trees; forest: trees/mushroom patches; shore: reeds/clay banks/water; highland/peak: stone/ore-veined stone. Density ~110 things per 48×48. Each carries hidden **lore** (a discoverable truth via `observe`).
- **Expansion seeding**: when the world grows (a Kin nears an edge), a fresh strip is seeded the same biome-aware way, and a **cave** (+ore cluster) may appear in high/stony ground. Infinite, Minecraft-style.
- **Depletion** (`yieldLeft`): rooted things give a few gathers, then are **spent** — a tree → "spent stump", stone → "picked-over rubble" (both render distinctly), plants/flowers vanish. Scarcity is real.
- **Renewal** (`regrow`, ~every 25 ticks): a young tree/plant/berry bush sprouts somewhere; spent stumps/rubble eventually crumble away. (During a **drought**, regrow gives nothing and green things wither.)
- **Consumption**: crafting and building USE UP raw materials (never food); so does mining a vein.
- **Fire lifecycle** (`tendFires`): a lit fire (emitsLight) burns ~1.5 world-days, then becomes cold ashes (`fire_died` event) — fire must be remade and fed. Fire also wards predators and warms against cold/wet.
- **Cooking** (`cook`, Era 1): raw food + a nearby fire → cooked food (more nourishing, keeps longer).
- **UI:** spent stumps/rubble already render; add ore-vein flecks (§6); a dying fire dims to ash; cooked food distinct in Creations/hands. Regrowth is ambient (no marker needed).

## 11. Landmarks & the memory of the self
- **Landmarks** (`seedFrontier`): 5 seeded wonders — standing stones, clear spring, old grove, cave mouth, tall hill — each with deep lore; finding one is historic. Render as distinct meshes (cave has its own; others as spires today).
- **Intentions & plans**: each Kin carries a self-written `intention` (a note to itself) and a multi-step `plan`, carried between ticks — the closest thing to a visible will. **UI:** show on the Kin drawer (and briefly on the Kin bar tooltip) — this is how a watcher reads a Kin's *purpose*.
- **Heirlooms** (legacy): an object made by a now-DEAD Kin is perceived as carrying their memory ("made by X, who is gone; an heirloom"). **UI:** in Creations/inspection, tag such objects with the dead maker's name + an heirloom mark.
- **Earned names**: a Kin is "a stranger" until acquaintance (proximity/speech/affection or family). **UI:** already reads as "a stranger" in perception; the drawer/roster can show "known to N Kin."

## 12. Progressive building & teamwork (visual growth)
- **Structures grow part by part**: `build` targeting an existing structure ADDS parts (up to 48); anyone may extend anyone's; each stage consumes material. So a house rises over many ticks — floor → walls → roof. **UI:** the structure mesh already re-renders from its shape each tick, so growth is visible live — call it out (a "under construction / growing" cue while parts are being added).
- **Co-craft**: a companion's held materials count as within reach; a thing "made together" — first is historic. **UI:** feed/creation credit to both.

### 12.1 Canonical building physics

Routine structures use a server-owned archetype, `small | large` size, valid primary material, and optional approved dye. A large build costs `ceil(small × 1.5)`. Each eligible physical object contributes exactly one unit. There are no hidden balances or fractional stacks.

| Archetype | Small units | Stages | Valid primary materials |
|---|---:|---:|---|
| fence | 2 | 2 | wood, stone |
| wall | 3 | 2 | wood, stone, clay |
| well | 4 | 3 | stone, clay, wood |
| hut | 5 | 4 | wood, clay, thatch |
| shrine | 5 | 4 | wood, stone, clay, thatch |
| cottage | 7 | 5 | wood, stone, clay, thatch |
| granary | 8 | 5 | wood, stone, clay, thatch |
| tower | 9 | 5 | wood, stone, clay |
| longhouse | 11 | 5 | wood, stone, clay, thatch |
| hall | 13 | 5 | wood, stone, clay, thatch |

Composition is deterministic: wood is all timber; stone is `ceil(total × 0.75)` stone and the rest timber; clay is `ceil(total × 0.65)` clay and the rest timber; thatch is `ceil(total × 0.60)` reeds/fiber and the rest timber. Every stage costs at least one unit. Foundation favors stone/clay, frame favors timber, and roof favors thatch/timber.

Only gathered raw construction matter or recognized worked construction pieces count. Food, live creatures, texts, structures, heirlooms, worn things, and rooted scenery never pay a bill. Stable consumption order is builder's hands → nearby companions' hands → reachable ground → reachable stash. Availability is checked before anything is consumed; a shortage takes nothing and is felt in ordinary worldly language.

A compact site is incomplete until its final base stage. Before that transition it provides no shelter, home, settlement, era, public, or sacred effect. Legacy/freeform structures and graves remain immediately functional under their existing physics. A completed base stays functional while a three-stage room or wing addition rises; an addition costs `max(3, ceil(base bill × 0.40))` units.

Stored versioned design metadata is additive. Unknown or malformed metadata falls back to the stored freeform shape as completed legacy physics. A persistent old world is backed up and verified before the first design-metadata migration. Setting `flags.buildArchetypes` false stops new compact sites while already-generated stored shapes remain visible and usable.

## What is NOT built (so the UI doesn't imply it)
Chosen-allegiance factions & formal law-enforcement (need a village first), debt/obligation, bridges & boundaries, and language drift (deferred until isolated populations exist). Don't render these yet.
