import type { PublicCalamityKind, WorldSnapshot } from '../shared/types.ts';

/** Sanitized deterministic capture catalogue. Future phases implement each family without changing these keys. */
export const VISUAL_FIXTURES = {
  time: ['dawn', 'noon', 'dusk', 'night'],
  weather: ['clear', 'cloudy', 'rain', 'fog', 'storm', 'snow'],
  calamity: ['drought', 'coldsnap', 'plague', 'wildfire', 'flood'],
  kinAge: ['infant', 'child', 'adult', 'elder', 'founder'],
  kinState: ['sick', 'weary', 'failing', 'asleep', 'fading', 'carrying-star', 'fulfilled'],
  wearable: ['head-designed-hat', 'face', 'neck', 'torso', 'back', 'hand-left', 'hand-right', 'feet'],
  structure: ['frame', 'partial', 'complete-small', 'complete-large', 'legacy-freeform'],
  world: ['meadow', 'forest', 'shore', 'cave', 'ore', 'landmark', 'road', 'settlement', 'market', 'festival', 'shrine', 'grave', 'heirloom'],
  creature: ['fish', 'deer', 'fowl', 'predator', 'idle', 'move', 'flee', 'hunt', 'threat', 'young', 'kept'],
  collision: ['open-ground', 'doorway-passage', 'blocked-wall', 'blocked-tree', 'blocked-stone', 'grass-nonblocking', 'held-nonblocking', 'worn-nonblocking'],
} as const;

const CALAMITY_LINES: Record<PublicCalamityKind, string> = {
  drought: 'The earth has gone thirsty.',
  coldsnap: 'A killing cold has settled over the land.',
  plague: 'A sickness moves from hearth to hearth.',
  wildfire: 'Fire is running before the wind.',
  flood: 'The waters have risen beyond their banks.',
};

/** Development-only view transform. It never opens a database or mutates the received snapshot. */
export function applyVisualFixture(snapshot: WorldSnapshot, key: string | null): WorldSnapshot {
  if (!key || !import.meta.env.DEV) return snapshot;
  const copy: WorldSnapshot = { ...snapshot, presentation: { ...snapshot.presentation } };
  const time = key.replace('time-', '');
  const phase = { dawn: 0.02, noon: 0.25, dusk: 0.5, night: 0.75 }[time];
  if (phase !== undefined) {
    copy.dayPhase = phase;
    copy.presentation.dayPart = time === 'noon' ? 'day' : time as WorldSnapshot['presentation']['dayPart'];
  }
  const weather = key.replace('weather-', '') as WorldSnapshot['weather'];
  if ((VISUAL_FIXTURES.weather as readonly string[]).includes(weather)) copy.weather = weather;
  const calamity = key.replace('calamity-', '') as PublicCalamityKind;
  if ((VISUAL_FIXTURES.calamity as readonly string[]).includes(calamity)) {
    copy.presentation.calamity = {
      kind: calamity, line: CALAMITY_LINES[calamity], remaining: 0.55, remainingPhrase: 'about a day may yet pass',
    };
  }
  return copy;
}
