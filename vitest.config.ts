import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // SQLite-heavy simulation suites contend badly when every logical core
    // launches a worker; keep the required `npm test` gate deterministic.
    // SQLite-heavy simulation suites contend hard on small laptops; one worker
    // keeps individual physics tests inside their real timeouts and makes the gate reproducible.
    maxWorkers: 1,
  },
});
