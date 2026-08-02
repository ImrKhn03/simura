# Renderer architecture

Phase 8 turns `src/web/scene.ts` into the stable `Stage` composition façade. The simulation remains the sole authority: `Stage.update(snapshot)` dispatches already-presented server state to rendering subsystems and never invents world behavior.

## Ownership

- `render/pipeline.ts` owns the WebGL composer, post-processing targets, procedural environment map, resize/render/context lifecycle, and the `RenderBackend` seam.
- `render/camera.ts` owns auto/orbit, eye, fly, and cinema state; camera persistence; pointer/keyboard controls; eye-body restoration; focus; and listener cleanup.
- `render/lighting.ts` owns sky, sun, moon, stars, fog, ambient/hemisphere lights, weather/calamity lighting, and their resources.
- `render/terrain.ts` owns terrain, water sheet, biome color placement, streamed trails, foliage decoration, flood surface, wind/water time, and disposal.
- `render/structures.ts` owns server-authored shape rendering, construction stages, roof marking, material surfaces, and legacy freeform fallback geometry.
- `render/object-layer.ts` owns the snapshot object registry, add/change/remove reconciliation, carried/stored visibility, object/creature LOD, creature animation, and roof-part handles.
- `render/kin.ts` owns procedural human body construction and semantic wear slots. `render/kin-animation.ts` owns interpolation, locomotion, gestures, sleep, breathing, blinking, and Kin LOD.
- `render/label-layer.ts` owns place labels and speech bubbles. `render/labels.ts` owns canvas-texture creation and creation thumbnails.
- `render/creatures.ts`, `render/effects.ts`, and `render/ambient-life.ts` own their pooled rigs/resources and frame behavior.
- `render/spatial.ts` owns interest calculation and bounded chunk lifecycle. `render/resources.ts` owns safe tree disposal, including preservation of explicitly shared assets.

No renderer subsystem imports `scene.ts` or `main.ts`. `tests/render-modules.test.ts` walks all local web imports and fails on a cycle.

## Snapshot and frame flow

```text
authoritative server snapshot
        |
        v
Stage.update(snapshot)
  |-- lighting/grade + terrain season/flood/trails
  |-- interest set + object registry
  |-- Kin registry/worn items + creature threat marks
  `-- labels/events/effect cues

requestAnimationFrame
        |
        v
Stage.animate(now, dt)
  |-- object/creature layer
  |-- terrain/effects/Kin/labels/ambient life
  |-- camera rig -> lighting/weather anchor
  `-- RenderBackend.render(dt)
```

The snapshot is never fetched by a renderer subsystem. The one `Stage` loop is paused while the document is hidden, and resumed delta is bounded. `Stage.dispose()` is idempotent and releases the loop, input, observer, canvas, and every owned renderer resource.

## Adding a renderer feature

Place pure presentation rules beside the owning subsystem, give the subsystem a narrow `update`, `frame`, and/or `dispose` contract, and dispatch the server-owned snapshot slice from `Stage`. Add characterization before moving ownership, plus a module-cycle check and the relevant quality/performance fixture. UI text must remain human-facing; simulation derivation stays server-side.

## Backend seam

`RenderBackend` describes the currently useful canvas, capabilities, metrics, quality, resize, render, context, and disposal surface. `RenderPipeline` is the sole production implementation and remains WebGL. A future WebGPU adapter must implement that seam and pass the same snapshots, visual fixtures, lifecycle tests, and budgets; Phase 8 intentionally does not partially ship WebGPU.
