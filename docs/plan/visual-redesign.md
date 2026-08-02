# SIMURA Rewrite — Visuals & Physics, Fresh Start

**Decision (2026-07-19):** burn the old visual layer and the old movement physics; rebuild both
from first principles. **The style lab is the single source of truth** — the world renderer is
"the lab, fed by the simulation," never a re-implementation of it.

Reference: https://summer-afternoon.vlucendo.com · Contract: `src/web/render/style-recipes.ts`
Lab: `src/web/style-lab.html` (dev-only; every new element is built here first, then imported).

## Iron rules

1. **One source.** All look-defining code lives in `style-recipes.ts` (+ `materials.ts` gouache).
   The lab and the world import it. Re-implementing a recipe anywhere else is a bug.
2. **The lab renders raw; so does the world.** No post-processing stack — direct renderer,
   ACES, lab exposure. If an effect isn't in the lab, the world doesn't get it.
3. **Emergent composition.** The lab arranges content by hand; the world's arrangement comes
   from the simulation. Objects share recipes; scenes are earned by the Kin.
4. **Physics is server truth.** One physics module; the renderer never invents motion.
5. **Deterministic infinity.** Terrain, dressing, colors: pure functions of `(x, z, seed)`.

## Burn list (delete)

- [ ] `src/web/scene.ts` (replaced by a new lab-grown stage)
- [ ] `src/web/render/`: art-direction, grade, pipeline, lighting, terrain, environment,
      structures, kin, kin-animation, creatures, effects, labels, label-layer, object-layer,
      ambient-life, spatial, resources, camera (absorbed/rewritten), quality (slimmed)
- [ ] Their tests (`tests/render-*.test.ts`); replaced by contract + stage tests
- [ ] Old server collision/movement internals (rewritten as one physics module)

**Survivors:** server simulation (minds, world, economy…), ws/REST plumbing, `main.ts` UI shell,
panels, minimap, `shared/terrain.ts` (new base world), `render/materials.ts` (gouache),
`render/style-recipes.ts` (contract), `style-lab.*`, `render/performance.ts` (frame delta).

## Phase R1 — New renderer, grown from the lab

- [ ] `render/world-ground.ts`: seeded ground mesh painted with `labMeadowColor` + biome bands
      (water/shore/rock/snow), water plane + foam rims, decorations (grass/flowers/shrubs/rocks)
      from recipes at lab density, per-chunk deterministic
- [ ] `render/world-things.ts`: sim object → lab builder (trees, rocks, water pools, plants,
      flowers, gathered items, landmarks, structure fallback), lab chunky Kin rig with walk/verb
      poses, simple painted creature rigs, paper name labels
- [ ] New `scene.ts` Stage: raw renderer (no composer), lab atmosphere (time × weather × season
      from the lab's atmosphere system), lab camera (drag orbit · wheel zoom · 1/2/3 moods ·
      double-click follow), picking, snapshot diffing, same public API for `main.ts`
- [ ] Fixture sweep verification: noon/dusk/night × clear/rain/snow screenshots vs lab

## Phase R2 — Physics rewrite (server)

- [ ] `server/world/physics.ts`: one module owning movement — slope limits from terrain,
      water blocking (shore wading), object collision circles, structure walls with doorways,
      path preference on trails; deterministic, unit-tested
- [ ] `sim.ts` and `verbs.ts` route all movement through it; creature movement too
- [ ] Rebuilt physics tests (collision, movement, water, doorways)
- [ ] Fresh genesis after landing (terrain + physics agree)

## Phase R3 — Content at lab quality (in the lab first, then imported)

- [ ] Kin life: stages, states (sick/asleep/fading/star), wearables, verb animations
- [ ] Creatures: deer/boar/goat/fowl/fish/small-game/predators, young/kept, biome spawns
- [ ] Built-by-Kin: staged construction (foundation→frame→walls→roof), completion templates
      per archetype, palette harmonizer for Kin-chosen colors, night window glow
- [ ] Progression-driven appearance: bare founders, earned clothing/hats/tools
- [ ] Effects: dust/sparks/splash/ember as lab particles; fire light pools at night

## Phase R4 — World systems in lab style

- [ ] Weather in-world: rain/snow particles, storm gloom, fog paper-wash (lab atmosphere)
- [ ] Seasons: lab seasonal tints end-to-end; calamities: five distinct painterly looks
- [ ] Minimap repainted on paper; threat rings; trails as painted wear
- [ ] Density/perf: instancing budgets per quality tier, 60fps target at `high`

## Phase R5 — Polish & lock

- [ ] Full suite green + build audit; screenshot archive (lab vs world, all fixtures)
- [ ] Remove dev debug handles; docs updated; TRACKER entry
