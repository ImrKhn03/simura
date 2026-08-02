/**
 * Discord herald: the world's major moments, delivered as formatted embeds.
 * Configure DISCORD_WEBHOOK_URL in .env; without it, this is a silent no-op.
 */
import type { WorldEvent } from '../shared/types.ts';
import { ERA_NAMES } from '../shared/types.ts';

interface Embed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

const STYLE: Record<string, { emoji: string; title: string; color: number }> = {
  era_unlocked: { emoji: '🌅', title: 'A New Age Dawns', color: 0xffd76a },
  awaken: { emoji: '🌍', title: 'The Waking', color: 0x7fb4ff },
  birth: { emoji: '👶', title: 'A New Light Is Born', color: 0x6fdc8c },
  death: { emoji: '🕯️', title: 'A Light Goes Out', color: 0x6b7688 },
  accept_bond: { emoji: '💞', title: 'Two Lights, One Thread', color: 0xe58ab7 },
  leave_bond: { emoji: '💔', title: 'A Bond Is Broken', color: 0x9a4f5f },
  pray: { emoji: '🙏', title: 'A Prayer Rises', color: 0xb48cf2 },
  god_answer: { emoji: '⚡', title: 'The Silence Answers', color: 0xfff2b0 },
  first_contact: { emoji: '👁️', title: 'First Contact', color: 0x4fc3f7 },
  land_expanded: { emoji: '🗺️', title: 'The World Grows', color: 0x8bc48a },
  mourning_passed: { emoji: '🤍', title: 'Mourning Passes', color: 0xcfd8ee },
};
const DEFAULT_STYLE = { emoji: '⭐', title: 'A Historic Moment', color: 0xffd76a };

/** which events deserve the herald: all historic ones, plus a few always-notable verbs */
export function heraldWorthy(e: WorldEvent): boolean {
  if (e.historic) return true;
  return ['pray', 'accept_bond', 'leave_bond', 'birth', 'death', 'god_answer', 'mourning_passed'].includes(e.verb);
}

export function buildEmbeds(
  events: WorldEvent[], era: number, actorName: (id: string | null) => string | null,
): Embed[] {
  return events.filter(heraldWorthy).map((e) => {
    const style = STYLE[e.verb] ?? DEFAULT_STYLE;
    const who = actorName(e.actorKinId);
    const fields: Embed['fields'] = [{ name: 'Tick', value: `\`${e.tick}\``, inline: true }];
    if (who) fields.unshift({ name: 'Kin', value: `**${who}**`, inline: true });
    if (e.thought) fields.push({ name: 'Their thought', value: `*${e.thought.slice(0, 200)}*` });
    return {
      title: `${style.emoji} ${style.title}`,
      description: e.detail.slice(0, 500),
      color: style.color,
      fields,
      footer: { text: `SIMURA · Era ${era} — ${ERA_NAMES[era] ?? '?'}` },
      timestamp: new Date().toISOString(),
    };
  });
}

/** god-facing operational alert (rut warnings, system notices) */
export async function sendAlert(title: string, description: string, color = 0xff8a5c): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'SIMURA', embeds: [{ title, description, color, timestamp: new Date().toISOString() }] }),
    });
  } catch { /* alerts must never hurt the world */ }
}

let failWarned = false;

/** send one webhook message per tick (up to 10 embeds each); never throws, never blocks the world */
export async function heraldToDiscord(
  events: WorldEvent[], era: number, actorName: (id: string | null) => string | null,
): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const embeds = buildEmbeds(events, era, actorName);
  for (let i = 0; i < embeds.length; i += 10) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'SIMURA', embeds: embeds.slice(i, i + 10) }),
      });
      if (!res.ok && !failWarned) {
        failWarned = true;
        console.error('[discord] webhook rejected:', res.status, (await res.text()).slice(0, 120));
      }
    } catch (err) {
      if (!failWarned) {
        failWarned = true;
        console.error('[discord]', err instanceof Error ? err.message.slice(0, 120) : err);
      }
    }
  }
}
