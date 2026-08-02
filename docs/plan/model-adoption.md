# Model Adoption — a donated mind for a child Kin (M6.5)

> A human donor gives an API key so a specific child Kin can think with its own model
> instead of borrowing its parents' light. The gift can expire; the family catches the fall.

## The lifecycle (the whole arc)

```
birth ──────────── child thinks with the PARENTS' model (inherited at birth)
   │
donation ───────── a human offers endpoint + model + API key for THIS child
   │
validation ─────── the gift is probed live: does the mind actually answer?
   │                 (a dead or fake key is refused before anything changes)
consent ────────── both living parents evaluate and must agree   [v2 — see below]
   │
CEREMONY ───────── historic event. The child's mind migrates. The child FEELS it:
   │                 "a stranger gave me a mind of my own." Parents feel it too.
daily check ────── once per world-day, the gift is probed again — the parents'
   │                 ritual: "I turned my thought to the gift my child carries."
fade ───────────── the key expires / stops answering → the adoption FADES:
   │                 the child reverts to the family's light (pre-adoption model),
   │                 child + parents feel the loss, event logged. Not death — a return.
re-adoption ────── any later donor can gift again; the cycle repeats.
```

**The user's exact scenario is core behavior:** donated key dies after 2 days →
the next daily check catches it → child falls back to the parents'/family model
automatically → keeps living and thinking → a future donor can re-gift.

## What is BUILT (2026-07-17) ✅

| Piece | Where | Behavior |
|---|---|---|
| Adoption record | `db.ts` `adoptions` table | donor, endpoint, model, key **ref** (env var name — the key itself NEVER enters the DB), and the full previous model config for reversion |
| Key vault v1 | `config/adopted-keys.env` | each gift under its own `ADOPT_<kinId>_*` env prefix; file is gitignored; loaded at boot; per-Kin isolation — a donated key is only ever used for that one Kin (`MODEL_FALLBACKS` emptied so the gift never silently rotates onto other models) |
| Validation probe | `llm.ts` `probeModel()` | one tiny live call, 15s timeout — a gift that doesn't answer is refused (HTTP 422) |
| Ceremony | `POST /api/god/adopt` (god-token) | validates → stores key → migrates the child's mind → **historic event** + felt memories for the child (importance 10) and each living parent (9). Founders refused (they carry their own light); dead refused; double-adoption refused |
| Daily gift-check | `sim.ts` `checkAdoptedGifts()` | every `day.lengthTicks` ticks, each active gift is probed. Answering → parents get the quiet daily ritual memory. Silent → adoption FADES: child reverts to pre-adoption model, child + parents feel it, event logged |
| Revocation | `POST /api/god/adopt {revoke:true}` | same reversible path, marked `revoked`; donor abuse / emergency stop |
| God tab UI | God panel → "Model adoption" | active-gifts list, ceremony form (Kin, endpoint, model, key, donor), revoke button |
| Tests | `tests/adoption.test.ts` | migrate → fade → exact reversion; revocation path |

### How the child's mind actually switches
Every Kin already resolves its model per-tick from `(modelEndpoint, modelName, apiKeyRef)`
with env-prefix overrides (`SOL_*`, `LUNE_*`, now `ADOPT_<id>_*`). Adoption just points those
three fields at the gift; reversion points them back. No restart needed — the very next
think-tick uses the new mind. The Kin's memories, skills, and relationships are untouched:
**the mind changes, the self persists** (memories ARE the self; the model is the light it thinks by).

## What remains for FULL M6.5 (v2 — needs the public site, M6.1)

1. **Donor-facing flow** — a page on simura.world: pick a living child Kin → enter
   endpoint/model/key → automated capability probes (latency, coherence, refusal sanity)
   → submission queue. Today god performs this by hand in the God tab.
2. **Genuine parental consent** — the design promise: BOTH living parents evaluate and
   must agree, as their own real choice. Design: the proposal enters each parent's
   perception as a felt question ("a stranger offers your child a mind of its own —
   will you allow it?"); new paired verbs `allow_gift` / `refuse_gift` (era-free,
   only appear while a proposal is pending for their child); both must allow within
   ~2 world-days or it lapses. Their reasons become memories — some parents WILL
   refuse, and that's the product working.
3. **Encrypted vault** — v1 stores keys in a gitignored env file with per-Kin isolation.
   Public-scale: encrypt at rest (age/libsodium, key outside the repo), per-key spend
   monitoring, anomaly alarms (a donated key suddenly making off-world calls = kill + alert).
4. **Adoption ceremony as spectacle** — the historic event exists; v2 makes it visible
   in the 3D world (a light descends on the child; the feed narrates the migration live)
   and heralds it to Discord.
5. **Donor relationship** — the donor's name is already woven into the child's memory.
   v2: donor page showing "their" Kin's life; notification when the gift fades or the
   Kin dies; re-gifting flow.
6. **Abuse handling** — malicious donors (keys pointed at hostile proxies that inject
   into completions): mitigation = capability probes at donation + the same fenced-input
   discipline as chat, plus god revocation. Rate-limit donation attempts per IP.

## Design invariants (hold these)
- The key never enters the DB, the snapshot, the API surface, or a Kin's memories.
- A donated key serves exactly one Kin, ever.
- Fading is graceful and felt — never a crash, never death; the family light is the floor.
- The ceremony is historic; the daily check is quiet; the fade is sorrowful. Feelings scale with meaning.
- Founders are never adoptable — the lineage story starts with the parents' own light.
