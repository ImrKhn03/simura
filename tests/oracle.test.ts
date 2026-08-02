import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';
import { thinkPhase } from '../src/server/mind/tick.ts';
import type { Mind } from '../src/server/llm.ts';
import type { Verb } from '../src/shared/types.ts';

/** A mind that asks the world before acting — verifies the oracle round trip. */
class AskingMind implements Mind {
  answers: string[] = [];
  async chooseAction(_kin: never, _s: string, _u: string, _v: Verb[], oracle?: (kind: 'where' | 'recall', query: string) => Promise<string>) {
    if (oracle) {
      this.answers.push(await oracle('where', 'flint stone'));
      this.answers.push(await oracle('recall', 'woke'));
      this.answers.push(await oracle('where', 'nonsense-no-such-thing'));
    }
    return { choice: { thought: '', verb: 'reflect' as Verb, params: { insight: 'asked and learned' } }, tokensIn: 0, tokensOut: 0 };
  }
  async summarize() { return { summary: '', tokensIn: 0, tokensOut: 0 }; }
}

describe('the oracle: sight and memory as a tool', () => {
  it('answers where-questions from named things and landmarks, recall from own memory', async () => {
    const { db, cfg, ori } = testWorld();
    const stone = db.listObjects().find((o) => o.kind === 'stone')!;
    db.nameThing(ori.id, stone.id, 'flint stone', 1);
    const mind = new AskingMind();
    await thinkPhase(db, cfg, mind, ori, 2, undefined, undefined);
    expect(mind.answers[0]).toContain('flint stone');
    expect(mind.answers[0]).toMatch(/lies at \(\d+,\d+\)/);
    expect(mind.answers[1]!.length).toBeGreaterThan(0);
    expect(mind.answers[2]).toContain('nothing called');
  });
});
