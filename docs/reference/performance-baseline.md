# Integrated renderer performance baseline

Recorded 2026-07-18 on the Phase-0 reference Apple M2 MacBook Air using the deterministic local world and Chromium live QA. This is a development/performance record, not player-facing telemetry.

## Bounded contracts

- Render chunks are 16×16 world units with negative-safe floor division.
- Interest radii are Low 2, Medium 3, High 4, Ultra 5 chunks plus one preload ring; unloaded lifecycle history is capped at 160 chunks.
- Representative serialized snapshot: 30,138 bytes, below the 256 KiB global-heartbeat ceiling, so chunk transport is not activated. `snapshotTransport()` switches to chunked mode above that threshold without changing simulation authority.
- Effects are fixed at 420 instances; environment decoration remains quality-capped; creature geometry/materials are shared and creature detail/shadows cull by quality/distance.
- Hidden tabs skip renderer/animation work and suspend procedural audio; resumed frame delta is clamped to 100 ms.

## Production bundle

Terser plus the repository-bundled Three source-module entry produces:

- application: 129.92 kB / 43.57 kB gzip;
- post/effects: 48.72 kB / 10.01 kB gzip;
- Three core: 205.12 kB / 55.86 kB gzip;
- Three renderer: 342.69 kB / 82.17 kB gzip;
- total JavaScript gzip: 191.61 kB.

No JavaScript chunk exceeds the locked 500 KiB uncompressed ceiling and the complete initial JavaScript path remains below 220 KiB gzip. `scripts/audit-web-build.ts` enforces both ceilings and rejects runtime remote references.

Rollup reports a supported `three-renderer → three-core → three-renderer` cross-chunk dependency because the pinned Three source entry is deliberately split below the per-chunk ceiling. It is not a source-module cycle (`tests/render-modules.test.ts` enforces that), does not duplicate the runtime, and remains preferable to the prior 517.01 kB monolithic Three chunk.

## Ongoing measurement

Development builds expose `window.__SIMURA_METRICS__()` for draw calls, triangles, geometry/texture counts, active chunks, visible object meshes, and creatures. The ambient UI never shows these values. `RENDER_BUDGETS` is the executable Low/Medium/High/Ultra ceiling table; `budgetBreaches()` is used by deterministic fixture/soak tooling.

The expanded deterministic-world overview measured the following integrated renderer totals (including post-processing passes):

| Quality | Draw calls | Triangles |
| --- | ---: | ---: |
| Low | 124 | 256,496 |
| Medium | 189 | 517,809 |
| High | 235 | 530,249 |
| Ultra | 363 | 546,725 |

All four modes remain below their locked budgets. These figures are regression baselines, not promises that every frame has identical totals: camera position, visible construction, weather, and creature activity legitimately alter them.

The required soak invariant is lifecycle-based: synthetic traversal proves capped chunk history; repeated unload tests prove owned geometry/material disposal while shared creature assets survive; browser resource counters must return within the Phase-0 10%/25 MB warm-baseline allowance during manual 30-minute QA.
