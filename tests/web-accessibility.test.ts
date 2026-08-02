import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('watcher accessibility contract', () => {
  const html = readFileSync('src/web/index.html', 'utf8');
  it('keeps visible focus, named quality/motion controls, live calamities, and a modal detail surface', () => {
    expect(html).toMatch(/:focus-visible/); expect(html).toMatch(/aria-label="world detail quality"/); expect(html).toMatch(/calmer motion/);
    expect(html).toMatch(/id="calamity-banner"[^>]+aria-live="polite"/); expect(html).toMatch(/id="detail-overlay" role="dialog" aria-modal="true"/);
  });
  it('uses no remote fonts, images, or style imports', () => {
    expect(html.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/@import|https?:\/\//i);
    expect(html).not.toMatch(/font-family\s*:[^;]*(?:monospace|times new roman|georgia)/i);
  });
});
