import { describe, it, expect } from 'vitest';
import { buildEmbeds, heraldWorthy } from '../src/server/discord.ts';
import type { WorldEvent } from '../src/shared/types.ts';

const ev = (verb: string, detail: string, historic = false, thought: string | null = null): WorldEvent =>
  ({ id: 1, tick: 42, actorKinId: 'k1', verb, targetId: null, detail, thought, historic });

describe('the Discord herald', () => {
  it('selects the moments that matter and skips the mundane', () => {
    expect(heraldWorthy(ev('era_unlocked', 'x', true))).toBe(true);
    expect(heraldWorthy(ev('pray', 'prayed: let us not be alone'))).toBe(true);
    expect(heraldWorthy(ev('birth', 'x'))).toBe(true);
    expect(heraldWorthy(ev('accept_bond', 'x'))).toBe(true);
    expect(heraldWorthy(ev('move', 'moved to (3,4)'))).toBe(false);
    expect(heraldWorthy(ev('speak', 'hello'))).toBe(false);
    expect(heraldWorthy(ev('craft', 'crafted "flint knife"', true))).toBe(true); // historic first
  });

  it('formats rich embeds: emoji titles, colors, kin, tick, thought, era footer', () => {
    const embeds = buildEmbeds(
      [
        ev('era_unlocked', 'A new age begins: The Making.', true),
        ev('pray', 'prayed: Whatever made this place — let us not be alone in it.', false, 'This is beyond my hands.'),
        ev('move', 'moved to (1,1)'), // filtered out
      ],
      1,
      () => 'Vey',
    );
    expect(embeds).toHaveLength(2);
    expect(embeds[0]!.title).toBe('🌅 A New Age Dawns');
    expect(embeds[0]!.color).toBe(0xffd76a);
    expect(embeds[0]!.footer!.text).toContain('Era 1 — The Making');
    expect(embeds[1]!.title).toBe('🙏 A Prayer Rises');
    expect(embeds[1]!.fields!.some((f) => f.value === '**Vey**')).toBe(true);
    expect(embeds[1]!.fields!.some((f) => f.value.includes('beyond my hands'))).toBe(true);
    expect(embeds[1]!.fields!.some((f) => f.value === '`42`')).toBe(true);
  });

  it('unknown historic verbs get the default star', () => {
    const [e] = buildEmbeds([ev('gather', 'gathered a hammerstone chip', true)], 1, () => 'Vey');
    expect(e!.title).toBe('⭐ A Historic Moment');
  });
});
