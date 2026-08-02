import { describe, expect, it } from 'vitest';
import { VISUAL_FIXTURES } from '../src/web/visual-fixtures.ts';

describe('sanitized visual fixture catalogue', () => {
  it('covers every locked reference family with unique deterministic keys', () => {
    expect(VISUAL_FIXTURES.time).toEqual(['dawn', 'noon', 'dusk', 'night']);
    expect(VISUAL_FIXTURES.weather).toHaveLength(6);
    expect(VISUAL_FIXTURES.calamity).toHaveLength(5);
    expect(VISUAL_FIXTURES.wearable).toContain('head-designed-hat');
    expect(VISUAL_FIXTURES.collision).toContain('doorway-passage');
    expect(VISUAL_FIXTURES.collision).toContain('held-nonblocking');
    for (const family of Object.values(VISUAL_FIXTURES)) expect(new Set(family).size).toBe(family.length);
  });

  it('contains no secret/provider vocabulary', () => {
    expect(JSON.stringify(VISUAL_FIXTURES)).not.toMatch(/apiKey|endpoint|modelName|provider|adoption/i);
  });
});
