# Phase 3 — The Stage

**Goal:** The minimal-but-real UI: a three.js village square where you watch the founders live, plus the live thought/event feed. Ships before Genesis — observation happens through this UI, not raw logs.
**Depends on:** Phase 2 (world state + event stream). **Feeds:** Phase 4 observation, later the public site.
**Estimated effort:** 3–5 days.

## Design principles
- Fixed camera over the village square (slight orbit/zoom allowed; no free-fly yet)
- Voxel aesthetic: simple, charming, readable at a glance — this is a stage, not a AAA game
- The feed is half the product: thoughts, speech, events, and **historic moments visually distinct**
- Everything read-only. No god controls in this UI (god acts via server CLI only)

## Milestones & tasks

### M3.1 — Village square renders
- [ ] Vite + three.js app in `/src/web`
- [ ] Render map, terrain tiles, natural objects, crafted objects and buildings from world state
- [ ] WebSocket subscription; state updates live per tick
- **Accept:** world state changes on the server appear in the browser within a tick.

### M3.2 — Voxel Kin bodies
- [ ] Two voxel avatars, visually distinct by gender (Sol: warm palette; Lune: cool palette)
- [ ] Smooth interpolated movement between tick positions
- [ ] Speech bubble on `speak`; small activity indicator while crafting/building/writing
- **Accept:** watching for 5 minutes, you can tell who is who and what each is doing without reading the feed.

### M3.3 — Live feed panel
- [ ] Scrolling feed: thoughts (private, muted styling), speech, actions, outcomes
- [ ] Historic events (Era unlocks, firsts) highlighted distinctly
- [ ] Filter by Kin; click a Kin in 3D to focus their feed
- **Accept:** the feed alone tells the story of the last hour coherently.

### M3.4 — Scene polish (timeboxed: 1 day max)
- [ ] Fixed camera framing, lighting, optional day/night tint tied to real time
- [ ] Kin detail card on click: name, gender, age in ticks, skillfile list, recent memories summary
- **Accept:** you'd happily leave this open on a second monitor.

## Explicitly out (this phase)
- Accounts, chat, sponsorship UI (Phase 6)
- Family tree view (Phase 5)
- Free camera / world expansion rendering (Phase 7)

## Exit criteria
You can watch SIMURA live in a browser and understand it. Gate D check begins: does the 3D view earn its keep vs. the feed?
