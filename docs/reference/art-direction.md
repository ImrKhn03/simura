# SIMURA Art Direction — a painterly summer living world

**Status:** revised after visual review and locked for implementation. Changes require updating this document, affected tests, and reference captures.

This is the normative visual language for every procedural generator and renderer in SIMURA. It is subordinate to `world-mechanics.md` for truth and to the Design Law in `ui-surfacing.md` for communication.

## 1. North star

SIMURA is a contemporary painterly, stylized 3D world: a warm summer diorama with the clarity of an animated short. It is a world to watch, not a database to inspect. Silhouette and motion carry meaning before labels. Large, calm color masses lead; small detail supports them. Geometry is economical and softly faceted: expressive Kin, clean architectural masses, clustered foliage, sculpted stone, lucid water, graphic clouds, and precise points of light.

The visual north star is the feeling of a quiet summer afternoon: sun-bleached color, warm directional light, cool open-sky shadow, matte cel-shaded surfaces, gentle atmospheric depth, and an inviting human scale. The reference is a language, never a source of assets or world content. All forms, shaders, textures, animation, and effects remain original, procedural, bundled, and driven by SIMURA's actual state.

The simulation may pass through early material cultures, but its presentation is timeless and premium—not a sepia history game. The interface must never resemble a parchment ledger, retro terminal, rustic inventory, or medieval fantasy HUD. The world is not photorealistic, voxel-blocky, muddy, uniformly faceted, aggressively neon, glossy-plastic, miniature-toy-like, or asset-pack eclectic. Procedural variation is bounded by shared tokens so every generation looks like one place.

### Design Law translated into art rules

- Body, posture, material, light, animation, and spatial grouping speak first.
- Ambient UI never prints internal field names, IDs, coordinates, enum codes, raw ticks, or percentages.
- The map contains terrain, paths, settlements, wonders, danger, and life—not an always-on legend.
- Names are reserved for Kin, genuinely named places, selected things, and rare historic moments.
- Near and mid-distance world content is true 3D. Two-dimensional content is UI text only; far LOD impostors are allowed only after geometry is no longer readable.
- A state cue must survive grayscale, reduced motion, and muted audio through a second channel such as shape, pose, or wording.

## 2. Color system

All hex values are sRGB input tokens. three.js output remains `SRGBColorSpace`; shader math and interpolation happen in linear space. Do not scatter new literal colors through renderers.

### World palette

| Token | Hex | Use |
|---|---|---|
| `night.abyss` | `#050816` | deepest night/background |
| `night.horizon` | `#111B34` | night horizon/fog |
| `night.moonfill` | `#334A78` | cool readable night fill |
| `sky.zenith` | `#5F9ED2` | clear day zenith |
| `sky.horizon` | `#C9E1E8` | clear day horizon |
| `sky.overcast` | `#879AA6` | rain/storm/fog base |
| `sky.dusk` | `#E9A184` | coral golden-hour horizon only |
| `meadow.dry` | `#B3B684` | dry grass/fringe |
| `meadow.sage` | `#70A681` | meadow base |
| `meadow.new` | `#8BC09A` | new growth/highlight |
| `forest.mid` | `#34745C` | canopy base |
| `forest.deep` | `#205344` | deep canopy/shadow |
| `forest.moss` | `#67966F` | moss/age accent |
| `earth.soil` | `#5B554D` | soil/dark paths |
| `earth.wood` | `#76533E` | bark/raw timber |
| `earth.timber` | `#946C4F` | worked timber |
| `earth.edge` | `#C0A17E` | cut wood/neutral highlight |
| `stone.warm` | `#8F8D8A` | common neutral stone |
| `stone.cool` | `#8096A0` | highland/cave stone |
| `stone.pale` | `#D8D8CB` | worn edge/lime/snow transition |
| `shore.sand` | `#D0BD91` | beach/shore |
| `water.shallow` | `#5CB8C1` | shallows |
| `water.deep` | `#327FA1` | deep water |
| `water.foam` | `#E7FFFF` | foam/specular edge |
| `fire.ember` | `#C95F35` | ember/coals |
| `fire.flame` | `#F1A34C` | flame body |
| `fire.star` | `#FFD98D` | star/fire core/bloom source |
| `moon.pale` | `#E8EDF4` | moon/frost highlight |
| `danger.deep` | `#8E3037` | danger ring/deep red |
| `danger.bright` | `#E05A4F` | brief danger accent |
| `wellbeing.good` | `#74A56A` | gentle positive UI/body cue |
| `wellbeing.low` | `#C08A4E` | need/weariness cue |
| `wellbeing.failing` | `#A94442` | failing body cue |
| `plague.pall` | `#82946A` | restrained sick/plague cast |

### Kin lineage anchors

| Token | Hex | Rule |
|---|---|---|
| `kin.sol` | `#FF8066` | founder Sol lineage anchor |
| `kin.lune` | `#64B5F6` | founder Lune lineage anchor |
| `kin.skinWarm` | `#D89A84` | neutral warm skin component |
| `kin.skinCool` | `#B88F91` | neutral cool skin component |

### Interface accents

| Token | Hex | Use |
|---|---|---|
| `ui.text` | `#E8EEF8` | primary text |
| `ui.muted` | `#8C9AAF` | secondary text |
| `ui.glass` | `#0B1426` | translucent panel base |
| `ui.cyan` | `#5DE2E7` | focus, discovery, selection |
| `ui.violet` | `#9D8CFF` | sacred/rare secondary accent |

Children inherit a linear-space blend of parent lineage colors with a deterministic personal hue drift no greater than ±8 degrees, saturation change ±6%, and lightness change ±5%. Body state may temporarily alter saturation/lightness, never replace identity color completely.

### Approved dyes

Kin may choose only these named dyes for garments, hats, roof/trim, vessels, and banners. Natural material remains dominant; dye covers at most 45% of a structure and 75% of a garment.

| Dye | Hex | Source-language intention |
|---|---|---|
| `berry` | `#A94F61` | berry red |
| `ochre` | `#B87936` | earth ochre |
| `charcoal` | `#3E4146` | charcoal black |
| `clay` | `#A96248` | fired clay |
| `indigo` | `#4F5F8F` | deep blue |
| `sage` | `#6F865C` | plant green |
| `bone` | `#D2C6AA` | pale natural |
| `gold` | `#C99B3D` | precious accent only |

Arbitrary model-authored hex colors snap to the nearest approved dye in OKLab (or a documented equivalent perceptual space). Malformed colors fall back to the material's natural base.

### Calamity grades

Grades transform the world palette and preserve skin, fire, water, and danger contrast:

- drought: saturation ×0.72, warm lift toward ochre, raised haze, green luminance reduced;
- coldsnap: cool shadows, pale highlights, saturation ×0.82, no blue-only status communication;
- plague: saturation ×0.78 with restrained olive mids; Kin faces remain readable;
- wildfire: warm horizon and smoke-darkened shadows; active fire remains the brightest warm source;
- flood: saturation ×0.75, cool/cyan lows, muted sky, safe high ground retains value contrast.

## 3. Scale and proportions

One adult Kin is exactly 1.0 world unit from foot sole to crown in neutral stance.

### Kin

| Element | Adult proportion |
|---|---|
| head height | 0.17–0.19 (about 5.5–6 heads tall) |
| head width | 0.17–0.21 |
| shoulder width | 0.34–0.43 |
| torso height | 0.38–0.42 |
| hip height | 0.52–0.56 |
| arm length | 0.40–0.44 |
| leg length | 0.43–0.48 |
| hand/foot hint | 0.07–0.11 |
| eye diameter | 0.014–0.020 |

Infant scale is 0.48–0.58 with head ratio 31%; child scale grows 0.60–0.88 with head ratio 23–27%; adults are 0.92–1.04; elders remain adult scale with a 6–12 degree stoop and shorter stride. Founders are adult regardless of age ticks. Adult heads and eyes must never drift back toward chibi, mascot, or vinyl-toy proportions.

Sol/Lune silhouettes use modest deterministic differences in shoulder/hip/torso curves (maximum 12%); lineage and individual variation matter more than stereotype.

Near-view Kin must read as complete stylized people, not capsule mannequins. The procedural hero rig includes a shaped ribcage, waist and pelvis; clavicles and rounded shoulders; jointed upper/lower limbs; palms, thumbs and finger hints; ankle, shoe upper and sole forms; and a layered face with jaw, chin, cheeks, nose bridge, eyelids, sclera, iris and pupil. A restrained garment layer adds sleeves, cuffs, neckline, yoke/placket and waistband without claiming a crafted wearable exists. Deterministic build, face-width, hair and eye variation makes silhouettes individual while preserving ordinary human proportions. Detail may simplify with distance, but near LOD must retain the full face, hand and clothing silhouette.

### Wearable attachment slots

Every Kin rig exposes stable named anchors:

- `wear.head`: hats, caps, crowns, hoods, wreaths—centered above crown and following head rotation;
- `wear.face`: masks/veils—forward of face without covering eyes by default;
- `wear.neck`: necklaces/scarves;
- `wear.torso`: garments/armor/aprons—fitted around torso;
- `wear.back`: cloaks/packs;
- `wear.handL`, `wear.handR`: held items only, not worn clothing;
- `wear.feet`: footwear.

A crafted wearable is attached to its semantic slot, not shown in a hand. Headwear designed by a Kin retains its procedural/freeform geometry, is normalized to the head bounding box, keeps the Kin's chosen approved dye/material, and participates in head animation. Unknown garments default to `wear.torso`; unknown non-garments remain held. Attachment is rendering of the existing `worn` state, not scripted choice.

### Architecture and props

- adult doorway clear opening: width ≥0.72, height ≥1.25;
- archetype wall top: ≥2.0 Kin heights above floor;
- floor step: ≤0.15 unless a visible ramp/stair is generated;
- small dwelling footprint: minimum 3.0 × 2.6;
- large dwelling/hall footprint: minimum 5.0 × 4.0;
- pitched roof: 28–48 degrees; eave ≥0.12;
- handheld object longest dimension: normally 0.12–0.65;
- hat widest dimension: 0.22–0.55 after head normalization;
- tree height: 1.8–4.5 by species/biome;
- deer-kind shoulder: 0.45–0.75; fowl: 0.20–0.38; predator: 0.45–0.68; fish length: 0.22–0.60.

World collision volumes use navigable meaning, not decorative triangles: structure walls/posts, large rocks/trees, and closed solid props block movement; doors/openings, roof overhangs, grass, particles, labels, worn/held items, and small ground clutter do not.

## 4. Material language

| Material | Roughness | Metalness | Form/surface rule |
|---|---:|---:|---|
| Kin skin | 0.48–0.60 | 0 | smooth normals, soft vertical gradient and restrained cool rim; never plastic |
| cloth/dye | 0.70–0.82 | 0 | broad color, fine deterministic fiber response and restrained sheen |
| raw wood | 0.82 | 0 | directional micro-grain, irregular silhouette, neutral response |
| worked timber | 0.70 | 0 | cleaner planes, visible end grain, subtle edge response |
| stone | 0.78–0.90 | 0 | sculpted planes, cool/neutral variation, contact AO |
| clay | 0.76 | 0 | smooth matte, rounded edges, fine mottling |
| thatch | 0.98 | 0 | layered tapered bundles, no flat roof card near/mid |
| copper/bronze | 0.46 | 0.72 | warm metal, restrained highlight |
| iron/silver | 0.38–0.58 | 0.82 | cool metal; silver brighter than iron |
| gold | 0.32 | 0.88 | rare warm highlight, never large emissive yellow |
| gems | 0.18 | 0.12 | faceted/transmissive suggestion plus tiny bloom sparkle |
| foliage | 0.68–0.80 | 0 | layered smooth clusters, subtle sheen and shader wind |
| water | 0.12–0.24 | 0.02 | Fresnel, depth tint, foam, bounded reflection |
| snow/frost | 0.66 | 0 | pale value cap, cool grazing highlight |
| fire/star | — | — | emissive core + true 3D flame/halo; bounded bloom |
| construction frame | 0.90 | 0 | exposed posts, braces, dust; visually incomplete |

Ordinary surfaces use physically based light transport shaped into two or three broad painterly value bands. Warm key light and cool sky fill describe volume; deterministic micro-variation gently breaks perfect digital gradients. Rim/Fresnel is reserved for water, gems, and rare optical effects—not an ambient cyan outline. Specular response is broad and quiet, and foliage may retain softly faceted normals. The layer must enhance depth without turning the world into neon, chrome, holograms, or glossy toys. All noise/textures are generated locally from deterministic seedable functions or bundled source files. No runtime remote images, fonts, LUTs, normal maps, HDRIs, sounds, or asset packs.

## 5. Lighting and atmosphere

- Key: warm cream daylight directional sun, noon intensity target 2.0–2.4 before grade; dawn and dusk deepen the warmth without becoming an orange wash.
- Fill: cool blue hemisphere/environment contribution, never a flat ambient wash; shadow remains colorful and readable.
- Day skies carry a few large procedural cloud masses. They are atmosphere, not weather telemetry, and disappear or thicken in response to existing weather only.
- Environment: generated gradient cubemap/PMREM, cached once per renderer.
- Shadows: near-camera only, soft PCF/approved contact technique, stable bias on displaced terrain.
- Golden hour: low warm key, cool fill, longer readable shadows, no exposure pumping.
- Night: deep blue values, moon/environment fill enough to read silhouettes, fire owns local warmth.
- Fog: distance/height haze with weather and quality-specific density; no opaque wall around the camera.
- Bloom hierarchy: fire/star core > moon/gem/water sparkle > accomplishment/sacred accents. Ordinary white surfaces must not bloom.
- AO grounds feet, trunks, stones, walls, eaves, and construction joints; radius never turns the scene dirty.
- Vignette is subtle (target 0.06–0.10) and cinema-only or nearly imperceptible elsewhere. Depth of field is cinema-only and disabled by reduce motion.

## 6. Motion language

- Movement lands exactly on snapshot tick timing; animation never changes simulation position.
- Idle motion is small and individual: breathe, blink, look, head-turn toward real speaker.
- State poses: weary slump, sick reduced amplitude/pallor, carrying-star belly light, fear/hurt recoil, work reach/strike, sleep curl/lie, dance rhythm.
- Reduce motion retains pose, material, shape, and wording but removes large bob, shake, looping particles, focus hunting, and rapid grade changes.
- Ambient particles are pooled, slow, sparse, and secondary to real objects.

## 7. Quality presets

The UI exposes Low, Medium, High, and **Ultra** plus Auto. Auto never selects above the device's measured/capability ceiling; manual selection persists. Ultra is an explicit enthusiast mode, not the default.

| Feature | Low | Medium | High | Ultra |
|---|---|---|---|---|
| pixel ratio cap | 1.0 | 1.25 | 1.5 | min(device, 2.0) |
| bloom | half-res essentials | half-res | full/approved | full high precision |
| AO | off/cheap contact | bounded half-res | full approved | higher samples/radius guard |
| AA | FXAA | FXAA | FXAA/high pixel ratio | FXAA/native-capped pixel ratio |
| shadow map | 1024 near | 1536 near | 2048 near | 3072 near, capability-capped |
| grass/detail density | 30% | 60% | 100% | 135% capped |
| particle density | 25% | 55% | 100% | 150% capped |
| draw distance | 55% | 75% | 100% | 125% with chunk cap |
| cinema DoF/god rays | off | off/cheap | cinema only | cinema enhanced |
| water reflection | none | cheap | approved | enhanced bounded |
| far LOD | early | balanced | late | latest within budgets |

Ultra still obeys hard pool/cache/memory caps and must remain usable on the recorded High target. It may exceed High's draw/triangle budget only within the separate Ultra ceilings recorded during Phase 1 baseline; it may never create unbounded work.

## 8. Performance acceptance

Reference implementation machine at lock time: Apple M2 MacBook Air, 8-core CPU/8-core integrated GPU, 16 GB RAM, built-in 2560×1664 display, tested at the phase viewports in a current Chromium browser. Phase 1 records exact browser build and power state. Minimum Low/Medium target remains Apple M1-class integrated graphics with 8 GB RAM or a recorded equivalent.

| Budget | Low | Medium | High | Ultra |
|---|---:|---:|---:|---:|
| acceptance viewport | 1280×720 | 1920×1080 | 1920×1080 | 2560×1440 or native-capped |
| median CPU frame | ≤16.7 ms | ≤16.7 ms | ≤20 ms | ≤25 ms |
| p95 CPU frame | ≤33.3 ms | ≤25 ms | ≤33.3 ms | ≤40 ms |
| draw calls | ≤180 | ≤280 | ≤400 | ≤550 |
| visible triangles | ≤400k | ≤900k | ≤1.5m | ≤2.2m |
| snapshot apply p95 | ≤12 ms | ≤12 ms | ≤16 ms | ≤16 ms |
| scheduled chunk work/frame | ≤4 ms | ≤4 ms | ≤6 ms | ≤6 ms |

Shared hard budgets:

- shared initial JavaScript path ≤220 kB gzip and no chunk above 500 kB uncompressed;
- global streamed snapshot p95 ≤256 kB and individual chunk ≤128 kB uncompressed after Phase 7 transport;
- no synchronous chunk build >50 ms; work is frame-sliced;
- after a deterministic 30-minute traversal and idle/GC observation, heap and renderer resources return to within 10% or 25 MB of warm baseline, whichever allowance is smaller;
- every phase records delta on the same fixture and cannot defer a miss to Phase 7.

## 9. Accessibility and interaction

- Status and danger use at least two of shape, pose, animation, value contrast, icon, and human wording.
- Body/UI contrast targets WCAG AA for text and essential controls; decorative low-contrast world detail is permitted.
- All panel/drawer/tab/quality/camera/mute actions are keyboard and touch reachable, with visible focus and correct focus return.
- Toasts/banners use non-stealing live announcements; no rapid or repetitive announcements.
- Muted audio loses no information. Reduced motion loses no state meaning.
- UI uses bundled/system sans-serif fonts only. Monospaced type is prohibited in the player-facing interface unless a future real in-world object specifically requires it.
- Panels use dark translucent glass, hairline cool borders, soft depth, and generous radii. Cyan indicates focus/selection; coral and blue retain Kin identity; violet is rare. Parchment, amber chrome, ornamental frames, and faux-historic texture are prohibited.

## 10. Deterministic reference fixtures

Phase 1 creates sanitized fixtures under `tests/fixtures/visual/` for:

- dawn/noon/dusk/night; clear/cloud/rain/fog/storm/snow;
- drought/coldsnap/plague/wildfire/flood;
- infant/child/adult/elder/founder, sick/weary/failing/asleep/fading/carrying-star/fulfilled;
- every wearable slot including a Kin-designed hat worn on the head;
- every archetype stage/size/material/dye and one legacy freeform structure;
- each biome, shore, cave, ore, landmark, road, settlement tier, market, festival, shrine, grave, heirloom;
- fish/deer/fowl/predator idle/move/flee/hunt/threat/young/kept;
- normal collision, doorway passage, blocked wall/tree/stone, and non-blocking grass/held/worn items.

Each capture records fixture ID, camera mode/preset/transform, viewport, quality, reduced-motion state, renderer metrics, and expected semantic cues.

## 11. Change control

Changing a palette token, proportion, material, lighting key, attachment anchor, collision meaning, quality budget, or accessibility rule requires:

1. update this reference;
2. update pure token/bounds/fixture tests;
3. regenerate affected reference captures;
4. record performance delta;
5. obtain review before merging the changed direction into a later phase.
