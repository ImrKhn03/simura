# UI Surfacing Plan — make the whole simulation VISIBLE

**Problem:** across this session we built ~25 deep systems (needs, health, mood, reproduction,
life-stages, professions, reputation, economy, culture, disasters, ecosystem, mining, settlements…).
Almost all of it lives in the backend and only surfaces as *text in the feed*. A watcher can't
*see* a Kin's hunger, a drought gripping the land, a wolf hunting, a village growing, or who is
wealthy/renowned/sick. This plan surfaces **everything** visually, without missing a system.

**Principle:** the world already computes all of this — surfacing is mostly *rendering existing
state*, not new simulation. Show it where it's naturally read: **on the Kin** (bodies/state),
**on the map** (world/places/creatures/weather), **in the HUD** (world-level status), and **in
panels** (deep dives). Keep it glanceable first, detailed on click.

---

## DESIGN LAW — informative, never cluttered (read this first)
The UI must feel like *watching a living world*, not reading a database. Bind every decision below to these rules:

1. **Visuals over labels.** Prefer icons, color, glow, posture, animation, and markers to text. A sick Kin *looks* pale and moves slowly — you shouldn't need a "SICK" tag to know. Reserve floating text for the few things visuals can't carry (a name, a place-name).
2. **No internal names, ever, in the UI.** Never show `fullness`, `notorietyOf`, `lifeStage`, `starRisesAt`, verb ids, event verbs, or obj ids. Those are code. The interface speaks the **world's human language** — the same voice as perception ("well-fed", "gaunt with hunger", "an old one", "carrying a new light", "a known thief").
3. **No raw numbers on the ambient layer.** Bars are unlabeled or gentle (a health bar, not "health: 63"). Words beat digits: "thriving / weary / failing", not a percentage. Exact figures live only in the deep-dive drawer, and even there sparingly.
4. **Progressive disclosure.** The stage and Kin bar stay calm and glanceable — a handful of cues at most. Depth appears **on click** (the Kin drawer, a panel). Never crowd the world with everything at once.
5. **The map shows the world, not a legend.** Don't tag every object. Let meshes, colors, and a *few* named labels (settlements, landmarks, the active calamity) carry meaning; everything else is on hover/click.
6. **Meaning, not telemetry.** Show what a thing *means* to the world ("Riverbend, a village"; "a great maker"; "a drought grips the land"), not the metric behind it. If a cue doesn't help a watcher understand or feel the world, cut it.

Where earlier parts of this doc show titles/labels (e.g. "a great maker", life-stage, profession), treat those as the *human phrasing* to render — set in the world's voice, shown sparingly and mostly in the drawer — never as literal stat rows or internal terms.

Legend: ⬜ not surfaced · ◑ partial · ✅ done (this session's UI work).

---

## Part 0 — What ALREADY has UI (this session), for reference
- ✅ Camera system (orbit/eye/fly/cinema + presets), ✅ ambient layer (kin bar glyphs, event ticker, historic toast), ✅ Live/World/God tabs, ✅ World sub-nav (Story·Chronicle·Creations·Family·Relations·Wiki), ✅ Creations gallery (3D thumbnails), ✅ Relations graph, ✅ Wiki, ✅ Story digest, ✅ procedural sound, ✅ minimap, ✅ weather/day-night in the 3D scene, ✅ caves & predators & designed-shape meshes render.
- These are the surfaces we extend below.

---

## Part 1 — THE KIN: bodies, minds, roles (the biggest gap)

Every Kin now has rich interior state that's invisible. Two surfaces: the **Kin bar** (glanceable,
already exists) and a **Kin drawer** (click a Kin — the deep dive; today it shows skills/memories).

### 1A. The Kin drawer — a portrait, not a stat sheet  ⬜
(Data behind it, never shown as such: `fullness`, `health`, `weariness`, `sickUntil`, mood, drive, `endowmentTicks`, `starRisesAt`.)
- **A few gentle, unlabeled bars** for body & spirit — hunger, health, rest, mood — color only (green→amber→red), no numbers. A watcher reads "thriving" or "failing" at a glance from the colors.
- **A one-line "how they are" in the world's voice**, composed from state, e.g. *"Well-fed and rested, but a heaviness sits on them today."* / *"Gaunt and feverish; they need tending."* (Same register as perception — no field names.)
- **Quiet status marks** only when true: carrying a new light (a soft ⭐), asleep, fading, sick — as small icons, not words.
- **Who they are, in plain words** (one short line, only what's earned): their age of life ("a child still" / "an elder"), what they're known for ("a healer", "a great maker", "a known thief"), whether they are well-off, and their line/family — phrased as a sentence, not a table of titles.
- **Their will**: their own intention/plan in their words ("➤ …") — the most human thing to show.
- Deeper facts (exact ages, tallies) stay out unless expanded — this is a *portrait of a person*, not a readout.

### 1B. Kin bar upgrades (glanceable)  ◑ (glyphs exist)
- Add a thin **health/hunger micro-bar** under each chip (2px), and a **mood tint** on the chip border (warm=glad, grey=low).
- Show **life-stage** as a size/icon cue (small dot = child, ✦ = elder).

### 1C. On-body cues in the 3D scene  ⬜
- **Sick** → a faint greenish pallor / slight sway on the Kin mesh.
- **Carrying a star** → a soft glow at the belly (the "star not yet risen").
- **Low health/fading** → the existing fading opacity (already), plus a small ❤ pip that empties.
- **Weary** → slumped posture / slower walk cycle.
- **Newborn/child** → already smaller (lineage-looks); add a tiny label "(child)".

### 1D. Needs & drive API  ⬜
Extend `/api/kin` (and the snapshot `kin[]`) to include `health, weariness, sickUntil, mood, wealth, renown, notoriety, profession, lifeStage` (derive server-side so the client stays dumb). Mood formula lives in `world.ts` — expose a `moodOf()` for reuse.

---

## Part 2 — THE MAP / STAGE: world, places, creatures

### 2A. Natural disasters — the big one  ⬜  (see mechanics doc)
A calamity currently only appears as a feed line. It should **dominate the view**:
- **Full-screen weather-grade effect** per calamity: drought → dry haze + desaturated/yellowed grade + heat shimmer; coldsnap → blue tint + frost vignette + snow; plague → sickly green vignette + drifting motes; wildfire → orange glow at horizon + smoke + ember particles; flood → rising translucent water plane + rain.
- **HUD calamity banner** (top-center, persistent while active): icon + name + "a drought grips the land" + rough days-remaining bar.
- **Historic toast** on begin/end (already fires as historic events — just ensure the toast catches `calamity_began`/`calamity_ended`).
- **Minimap**: tint the whole map by the calamity; for **wildfire**, mark burning tiles; for **flood**, shade the drowned low ground.
- **Sound**: wind howl (drought/cold), fire crackle (wildfire), heavy rain (flood) — extend `sound.ts`.

### 2B. Creatures & the living ecosystem  ◑ (meshes exist)
- ✅ predator/deer/fowl/fish meshes render. ⬜ **Behavioral animation cues**: predator in a *hunting lunge* toward prey; prey *fleeing* (faster gait); a fed/breeding pair idling.
- ⬜ **Threat indicator**: when a predator is within striking range of a Kin, a red ‼ marker over that Kin (danger), or a red ring on the wolf.
- ⬜ **Minimap markers**: predators as red dots, prey as small pale dots, kept/tamed animals as a distinct icon near the herder.
- ⬜ **Creature label on hover/click**: species name + "prowling / grazing / fleeing / kept" + known lore if studied.

### 2C. Settlements, roads, public/sacred structures  ⬜
Let the *look* do the work; label only the named whole (a settlement, a wonder), not every building.
- **Settlement**: **one** gentle floating name over the cluster — just "Riverbend" (its tier shown only in the drawer/roster if wanted). A quiet ring on the minimap. Not a tag per house.
- **Roads**: render heavily-worn ground as a visibly different **path/road** (wider, paler, packed) — no label; the eye reads it as a road. Lines on the minimap.
- **Public vs private vs sacred**: distinguish by **appearance**, not tags — a hall/granary looks bigger/communal, a shrine has a soft glow. A name appears only **on hover/click**, not floating always.
- **Graves/graveyard**: cluster the grave meshes; a graveyard reads visually. Name it only on hover, or if the Kin themselves named the ground.

### 2D. Mining, ores, caves  ◑ (caves & stone render)
- ⬜ **Ore-bearing stone** looks like plain stone — give ore-veined/ore-bearing rock a **metallic fleck / colored vein** by ore type (copper=green, iron=rust, gold=yellow, coal=black, gems=sparkle). Spent stumps/rubble already render (yieldLeft).
- ⬜ **Cave interior cue**: darkness inside a cave (already dark), a faint ore-glint on the walls; a "cave" label.
- ⬜ **Creations gallery**: already shows crafted things; add ore/coins/tools as they're minted (coins get a distinct gold thumbnail).

### 2E. Named places, landmarks, markets  ◑ (places on minimap)
- ⬜ **Market**: when trade clusters at a named place, float a "market" tag + a small stall icon; minimap market pin.
- ⬜ **Festival**: when a festival is happening (recent ritual/dance at a named place with a crowd), a transient celebratory marker + gathered-Kin highlight + a warm light bloom.

---

## Part 3 — THE HUD: world-level status
Top strip currently: SIMURA · Era · tick · 🔇 · weather icon.
Add, compactly:
- ⬜ **Season** indicator (spring/summer/autumn/winter) once era 7.
- ⬜ **Population** count (alive) + a tiny births/deaths pulse.
- ⬜ **Calamity banner** (2A) when active.
- ⬜ **Day/tick clock** as a small sun/moon dial (day phase) — more legible than a number.

---

## Part 4 — PANELS (World tab deep-dives; extend the sub-nav)

### 4A. People panel (new World sub-tab, or upgrade the Kin roster)  ⬜
A sortable roster of all Kin with columns: name, stage, profession, renown/notoriety, wealth, health/mood, bonds, clan. Click → drawer. This is the "who's who" of the civilization — surfaces reputation, professions, wealth, clans, life-stages all at once.

### 4B. Relations graph upgrades  ◑ (graph exists)
- ⬜ Show **enmity** (rivalry) as red/cold edges, not just warmth; ❤ bonded, ✕ estranged.
- ⬜ Cluster by **clan/lineage** (color nodes by `lineageRootName`); this is where factions/clans become visible.
- ⬜ Family/lineage overlay toggle (merge with Family tab).

### 4C. Economy panel (new)  ⬜
- Wealth ranking (who holds the most gold/gems/coins), recent trades, where markets have formed, total minted currency in the world. Surfaces money/wealth/markets/minting.

### 4D. Chronicle / Story / Wiki  ◑ (exist)
- ⬜ Tag Chronicle entries by type with icons: ★ historic, 🌾 disaster, 👶 birth, 🕯 death, ⚒ first-craft, 🏛 first-village, 🪙 first-coin, 📖 first-belief.
- ⬜ Wiki: badge writings by kind — 📖 belief/myth, 🔢 record/number, 🗓 calendar (from the `lore` tag on text objects) — so the cognitive artifacts are distinct.
- ⬜ Story digest: include disasters, births/deaths, first-of-kind milestones (already partly).

### 4E. God tab additions  ◑
- ⬜ A **calamity control** (god may summon/end one — optional, for testing/drama), mirroring the existing net/adoption controls.
- ⬜ World-health readout: population, food abundance, predator count, active calamity, era progress (some exists in /api/progress).

---

## Part 5 — FEED polish
- ⬜ Category icons/colors for the new event verbs: `sickened` 🤒, `death` 🕯, `birth` ⭐, `theft` ⚠, `calamity_began/ended` 🌪, `fauna_appeared` 🐾, `fire_died` 🔥, `adoption` ✦, `net_answer` 🌐.
- ⬜ Extend the Live filters with a **"world"** filter (disasters, fauna, era, land) distinct from Kin acts.

---

## Suggested build order (phased)
1. **Kin drawer vital bars + identity line (1A) + extended /api/kin (1D)** — the single biggest legibility win; makes every interior system readable.
2. **Natural-disaster HUD banner + screen grade + toast (2A)** — the most dramatic missing visual; the user flagged it as the priority.
3. **Kin bar micro-bars + mood tint + on-body sick/star cues (1B, 1C)** — glanceable wellbeing.
4. **Settlements/roads/public-sacred structure labels + minimap (2C)** — the civilization becoming visible.
5. **Ecosystem markers + creature labels + predator threat (2B)** — the living world.
6. **People panel + relations enmity/clan coloring + economy panel (4A, 4B, 4C)** — the social/economic X-ray.
7. **Ore visuals, market/festival markers, feed icons, chronicle/wiki tags (2D, 2E, 4D, 5)** — polish.

Nothing here requires new simulation — it is all rendering of state the backend already holds.
See `docs/reference/world-mechanics.md` for the exact data, numbers, and behaviors to render.

---

## Part 6 — Completeness addendum (every remaining system, mapped)
A final sweep so NOTHING is missed. Each backend system → its UI home.

| System | Backend source | UI surface |
|--------|----------------|-----------|
| Intentions & plans (a Kin's will) | `Kin.intention`, `Kin.plan` | Kin drawer (prominent) + Kin-bar tooltip — "➤ what they mean to do" |
| Heirlooms (a dead maker's work) | object `creatorKinId` where maker is dead | Creations/inspection tag: "an heirloom of X, who is gone" |
| Landmarks (stones/spring/grove/hill/cave) | objects kind `landmark` | distinct meshes + hover label + "★ found" when discovered; minimap pins |
| Progressive building (houses rising) | structure `shape` grows per tick | mesh already re-renders live; add an "under construction" shimmer while parts are added |
| Co-craft ("made together") | craft detail / event | feed credit to both makers |
| Flora depletion (spent stumps/rubble) | `yieldLeft ≤ 0` | ✅ already render as stump/rubble; add ore-vein flecks for ore stones |
| Fire lifecycle (burns to ash) | `emitsLight`, `fire_died` event | flame dims to cold ash on `fire_died`; fire glow already renders |
| Cooking (raw→cooked) | `cook` verb, "cooked X" items | cooked food distinct thumbnail in hands/Creations |
| Kept / tamed animals | `tame` → "a kept X" | herd icon near the herder; distinct from wild; minimap |
| Prey breeding (young born) | "a young X" spawns | render slightly smaller; "🐾 born" ambient |
| Weather & seasons | `weatherAt`, season phase | ✅ weather in scene/HUD; add a season indicator (era 7+) |
| Prayers & wants (the god inbox) | `/api/prayers`, `/api/wants` | ✅ God tab; ensure new prayers pulse/notify |
| Answered prayers ("from the silence") | god answer → memory | feed line + a soft light on the prayer's Kin |
| Model adoption ceremony | `/api/god/adopt` | ✅ God tab controls; add a "gifted mind" badge on adopted Kin in the roster |
| The Net (Era 16) | `reach_beyond`, `net_answer` | God-tab switch (✅); `net_answer` feed icon 🌐; a "reached the beyond" toast |
| Discord herald | server → webhook | external (Discord), not in-app — note only |
| Run report | `scripts/run-report.ts` | CLI/terminal, not in-app (optional: a God-tab "world report" mirror) |
| Echo compression / memory tiers | internal | none needed (invisible plumbing) |
| Era ladder & progress | `/api/progress`, era events | ✅ God-tab progress bars; add era-name to HUD (✅) + "new age" toast |

---

## Part 7 — Definitive coverage matrix (audited against the code)
Every **verb** (46), **Kin field** (28), **object kind** (14), and **event** (37) → its UI home. If a row isn't a visible thing, it's marked *internal*.

**Implementation reconciliation (2026-07-18): complete.** Shipped evidence and automated-test families are indexed in `docs/plan/visual-overhaul-coverage-matrix.md`. The audit retains `stumble`, `mateToward`, echo compression, and memory tiers as internal; dead child-proposal verbs remain absent; and chosen allegiance, formal enforcement, debt, bridges/boundaries, and language drift remain deliberately unrendered.

> This is a **developer audit** — the code names on the left (`fullness`, `notorietyOf`, event verbs…) are references for whoever builds the UI, NOT strings to display. Per the Design Law, the UI itself shows only visuals and the world's human voice. The right-hand descriptions are what the watcher actually sees.

### All verbs → where their result is seen
- Movement/perception: `move`, `observe` → Kin motion on stage; observe reveals lore (creature/nature labels).
- Gathering/goods: `gather`, `carry`, `drop`, `give`, `trade`, `accept_trade` → items in hands (rendered), Creations, Economy panel; **give** shows charity/amends.
- Making: `craft`, `build`, `cook` → structures/objects render (progressive build grows live); cooked food distinct; §10/§12.
- Words/knowledge: `speak`, `write`, `read`, `teach`, `learn`, `author_skill`, `refine_skill` → feed speech bubbles; Wiki badges (belief/record/calendar); **teach at a place = school**; skills in drawer.
- Inner: `reflect`, `rest`, `pray` → feed; rest→💤 & weariness; pray→God-tab inbox + "from the silence".
- Bonds/family: `propose_bond`, `accept_bond`, `decline`, `mate`, `name_child`, `leave_bond` → Relations/Family; ❤ bonded; **decline & leave_bond = drama** (feed + relations enmity); mate→star.
- *(dead, unused: `propose_child`, `accept_child` — replaced by `mate`; no UI)*
- Garments: `wear`, `remove` → **worn items render on the body** (add a "clad/warm" cue); protect vs cold/wet.
- Farming/animals: `plant`, `tame` → **planted crops render as growing plants** (tag "planted"); tamed = "kept" herd icon.
- Culture: `sing`, `dance`, `play`, `ritual` → feed + song bubbles; **dance/ritual at a place with a crowd = festival marker**; **play** = social bonding (feed + affection).
- Governance: `assemble`, `propose_law`, `assent` → **assembly gathering marker**; laws as recorded texts → Wiki/Chronicle "law" badge.
- Body/care: `eat` (hunger bar), `heal` (health + healer profession), `bury` (graves/graveyard).
- Frontier: `signal` (voice across distance — feed), `reach_beyond` (The Net — 🌐 feed + toast).

### All Kin fields → UI
identity `id/name/gender/parentSol/Lune` → Family/roster; `bornAtTick`→age/**life-stage**; `status/diedAtTick`→alive/fading/dead; `immortal`→"founder"; `endowmentTicks`→**Life bar**; `model*`→**"gifted mind" badge** (adoption); `temperament`→**personality shown in drawer** (Sol/Lune drive, memory depth); `pos`→stage; `intention`/`plan`→**drawer "will"**; `asleepUntil`→💤; `coupleId`→❤; `fullness/health/weariness/sickUntil/lastFulfilledTick`→**vital bars + mood**; `starRisesAt/starWithId`→**carrying-a-star glow + countdown**; `mateToward`→*internal*.

### All object kinds → UI
`tree/stone/water/plant/flower`→flora (ore-vein flecks, spent stumps/rubble); `landmark`→wonders + labels; `fish/deer/fowl`→prey meshes + markers; `predator`→wolf mesh + red threat marker; `gathered`→hands/Creations; `crafted`→Creations (coins=gold); `structure`→homes/public/sacred/graves + settlement labels; `text`→Wiki (belief/record/calendar badges).

### All events → UI
Visible: `birth`⭐ `death`🕯 `sickened`🤒 `theft`⚠ `calamity_began/ended`🌪 `fauna_appeared`🐾 `fire_died`🔥 `adoption`✦ `adoption_ended` `net_answer`🌐 `first_contact` `god_answer` `era_unlocked`(new-age toast) `land_expanded`(minimap grows) `mourning_passed`(drama) `fading` `awaken`(dawn) — all as **feed icons + toasts for historic ones**; plus per-verb events (`craft/build/gather/...`) in feed.
Internal/hidden: `stumble` (API hiccups — deliberately hidden from feed).

### Cross-checked against the full build list (nothing omitted)
Body/needs ✅(1) · reproduction ✅(2,§2) · life-stages ✅(1,3) · social/reputation/rivalry/notoriety/professions/clans ✅(1,4) · economy/money/minting/markets ✅(4C,§5) · culture (festivals/temples/beliefs/dance/play/song/ritual) ✅(2E,4D,§9) · knowledge (numbers/calendar/schools) ✅(4D,§9) · settlements/roads/public structures ✅(2C) · mining/ores/caves ✅(2D,§6) · natural disasters ✅(2A,§8) · living ecosystem/predators/prey/breeding/hunting ✅(2B,§7) · justice/theft/amends/compassion ✅(4A,4B,§4) · legacy (graves/heirlooms) ✅(2C,Part 6) · intentions/plans ✅(Part 6) · landmarks ✅(Part 6) · flora lifecycle/fire/cooking ✅(Part 6,§10) · teamwork/progressive building ✅(Part 6,§12) · prayer/adoption/Net ✅(4E,Part 6) · weather/seasons/day-night ✅(2A,3).
