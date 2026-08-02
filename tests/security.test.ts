import { describe, expect, it } from 'vitest';
import { WEB_SECURITY_HEADERS } from '../src/server/security.ts';

describe('self-contained web security policy', () => {
  it('allows only bundled scripts/assets and same-origin connections', () => {
    const csp = WEB_SECURITY_HEADERS['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/https?:\/\/|cdn|googleapis/i);
  });
});
