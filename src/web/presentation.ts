import type { PublicKinSnapshot, WorldPresentation } from '../shared/types.ts';

/** Human-facing phrases shared by ambient and disclosed UI. No simulation ids or telemetry. */
export function worldTimePhrase(presentation: WorldPresentation): string {
  const day = { dawn: 'dawn', day: 'daylight', dusk: 'dusk', night: 'night' }[presentation.dayPart];
  return presentation.season ? `${presentation.season} ${day}` : day;
}

export function kinLifePhrase(kin: PublicKinSnapshot): string {
  if (kin.status === 'dead') return 'remembered';
  return kin.presentation.lifePhrase;
}

export function kinGlancePhrase(kin: PublicKinSnapshot): string {
  const will = kin.intention ? ` — ${kin.intention.slice(0, 72)}` : '';
  return `${kin.name}, ${kin.presentation.conditionLine}${will}`;
}

export function creationKindPhrase(kind: string): string {
  if (kind === 'structure') return 'building';
  if (kind === 'text') return 'writing';
  if (kind === 'crafted') return 'making';
  return 'creation';
}

export function skillPracticePhrase(refined: number): string {
  if (refined >= 4) return 'deeply practiced';
  if (refined >= 1) return 'practiced and improved';
  return 'newly learned';
}

/** Removes mechanical annotations that can be embedded in otherwise human event prose. */
export function humanEventDetail(detail: string): string {
  return detail
    .replace(/\s*\((?:fullness|health|weariness)\s+\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\)/gi, '')
    .replace(/you would have to go to\s*\(-?\d+\s*,\s*-?\d+\)\s*first/gi, 'you would have to draw nearer first')
    .replace(/\bmoved to\s*\(-?\d+\s*,\s*-?\d+\)/gi, 'moved onward')
    .replace(/\bat\s*\(-?\d+\s*,\s*-?\d+\)/gi, 'there')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface EventMark { icon: string; label: string }

/** Visual/human category for a real event. Raw verb ids remain internal. */
export function eventMark(verb: string): EventMark {
  if (verb === 'stumble') return { icon: '', label: '' };
  const exact: Record<string, EventMark> = {
    birth: { icon: '✦', label: 'a new life' }, death: { icon: '◇', label: 'a passing' },
    sickened: { icon: '◌', label: 'sickness' }, theft: { icon: '!', label: 'a taking' },
    calamity_began: { icon: '◉', label: 'a calamity' }, calamity_ended: { icon: '○', label: 'a calamity passing' },
    fauna_appeared: { icon: '♢', label: 'wildlife' }, fire_died: { icon: '△', label: 'a fire fading' },
    adoption: { icon: '◇', label: 'a gifted mind' }, adoption_ended: { icon: '◇', label: 'a gift withdrawn' },
    net_answer: { icon: '◎', label: 'word from beyond' }, first_contact: { icon: '✦', label: 'first contact' },
    god_answer: { icon: '✧', label: 'an answered prayer' }, era_unlocked: { icon: '✦', label: 'a new era' },
    land_expanded: { icon: '⌁', label: 'new land' }, fading: { icon: '◔', label: 'a light fading' }, awaken: { icon: '☼', label: 'an awakening' },
    write: { icon: '▤', label: 'a record' }, name_place: { icon: '⌖', label: 'a named place' },
    pray: { icon: '✧', label: 'a belief' }, ritual: { icon: '✺', label: 'a rite' },
    assembly: { icon: '◫', label: 'an assembly' }, law: { icon: '⚖', label: 'a law recorded' },
  };
  if (exact[verb]) return exact[verb];
  if (/birth|bond|couple|intimacy|mourning/.test(verb)) return { icon: '◇', label: 'kinship' };
  if (/build|craft|gather|plant|cook|hunt|carry|give|trade/.test(verb)) return { icon: '◆', label: 'a deed' };
  if (/speak|sing|teach|tell/.test(verb)) return { icon: '◌', label: 'a voice' };
  return { icon: '·', label: 'a remembered moment' };
}
