/** The Net (Era 16, M7.1): god-gated reach into the outside world — sandboxed, allowlisted, fenced. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { availableVerbs, executeVerb } from '../src/server/world/verbs.ts';
import { godUnlockEra } from '../src/server/world/eras.ts';
import { hostAllowed, NET_ALLOWLIST } from '../src/server/world/net.ts';

describe('The Net (Era 16)', () => {
  it('reach_beyond exists only at era 16 — the one era no threshold can reach', () => {
    expect(availableVerbs(15)).not.toContain('reach_beyond');
    expect(availableVerbs(16)).toContain('reach_beyond');
  });

  it('the way stays shut without the god flag, even at era 16', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 16, 1);
    cfg.flags.net = false;
    const shut = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'reach_beyond', params: { query: 'what is rain?' } });
    expect(shut.ok).toBe(false);
    expect(shut.detail).toContain('the way is shut');
  });

  it('needs their own apparatus: a signal-thing AND current close by', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 16, 1);
    cfg.flags.net = true;
    const bare = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'reach_beyond', params: { query: 'what is rain?' } });
    expect(bare.ok).toBe(false);
    expect(bare.detail).toContain('signal-thing');
    db.createObject({ kind: 'crafted', name: 'signal tower', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const dead = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'reach_beyond', params: { query: 'what is rain?' } });
    expect(dead.ok).toBe(false);
    expect(dead.detail).toContain('source of current');
  });

  it('with flag + powered device, the question is queued for the beyond — first is historic', () => {
    const { db, cfg, ori } = testWorld();
    godUnlockEra(db, 16, 1);
    cfg.flags.net = true;
    db.createObject({ kind: 'crafted', name: 'signal tower', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    db.createObject({ kind: 'crafted', name: 'hand-crank generator', description: '', pos: { ...ori.pos }, creatorKinId: ori.id, createdAtTick: 1, textContent: null, lore: null, loreDiscovered: false });
    const first = executeVerb(db, cfg, ori, 2, { thought: '', verb: 'reach_beyond', params: { query: 'what is rain?' } });
    expect(first.ok).toBe(true);
    expect(first.historic).toBe(true);
    expect(db.pendingNetRequests(5)).toHaveLength(1);
    expect(db.pendingNetRequests(5)[0]!.query).toBe('what is rain?');
    // a second reach is no longer historic
    db.addEvent({ tick: 2, actorKinId: ori.id, verb: 'reach_beyond', targetId: null, detail: first.detail, thought: null, historic: true });
    const second = executeVerb(db, cfg, ori, 3, { thought: '', verb: 'reach_beyond', params: { query: 'what is snow?' } });
    expect(second.ok).toBe(true);
    expect(second.historic).toBe(false);
  });

  it('request lifecycle: pending → answered/silent, counted', () => {
    const { db, ori } = testWorld();
    db.addNetRequest(1, ori.id, 'what is rain?');
    db.addNetRequest(1, ori.id, 'what is snow?');
    const pending = db.pendingNetRequests(5);
    expect(pending).toHaveLength(2);
    db.resolveNetRequest(pending[0]!.id, 'answered', 'Rain is water falling…', 'en.wikipedia.org');
    db.resolveNetRequest(pending[1]!.id, 'silent', null, null);
    expect(db.pendingNetRequests(5)).toHaveLength(0);
    expect(db.countNetAnswered()).toBe(1);
  });

  it('sandbox allowlist: only named hosts exist; redirects and strangers are refused', () => {
    for (const host of NET_ALLOWLIST) expect(hostAllowed(`https://${host}/anything`)).toBe(true);
    expect(hostAllowed('https://evil.example.com/page')).toBe(false);
    expect(hostAllowed('https://en.wikipedia.org.evil.com/x')).toBe(false); // suffix spoof
    expect(hostAllowed('not a url')).toBe(false);
  });
});
