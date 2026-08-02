import type { Position, WorldObject } from '../../shared/types.ts';

const sq = (value: number) => value * value;

export interface MoveResolution {
  pos: Position;
  blocked: boolean;
  obstacle: 'tree' | 'stone' | 'structure' | 'kin' | null;
}

/** Two standing bodies never share the same ground. */
const KIN_BODY_RADIUS = 0.22;
function blockedByBody(bodies: Position[], point: Position, radius: number): boolean {
  return bodies.some((body) => sq(point.x - body.x) + sq(point.y - body.y) < sq(radius + KIN_BODY_RADIUS));
}

function blocksPoint(object: WorldObject, point: Position, radius: number): boolean {
  if (object.carriedBy || object.storedIn || object.worn) return false;
  if (object.kind === 'tree' && (object.yieldLeft === null || object.yieldLeft > 0)) {
    return sq(point.x - object.pos.x) + sq(point.y - object.pos.y) < sq(radius + 0.34);
  }
  if (object.kind === 'stone' && (object.yieldLeft === null || object.yieldLeft > 0)) {
    return sq(point.x - object.pos.x) + sq(point.y - object.pos.y) < sq(radius + 0.38);
  }
  if (object.kind !== 'structure' || !object.shape) return false;
  return object.shape.some((part) => {
    // Floors, roofs, lintels, trim, and thin door leaves do not obstruct a walking body.
    if (part.h <= 0.2 || part.y >= 1.15 || (part.d < 0.12 && part.w < 1)) return false;
    const cx = object.pos.x + part.x;
    const cy = object.pos.y + part.z;
    return Math.abs(point.x - cx) < part.w / 2 + radius && Math.abs(point.y - cy) < part.d / 2 + radius;
  });
}

function obstacleAt(objects: WorldObject[], point: Position, radius: number): MoveResolution['obstacle'] {
  const object = objects.find((candidate) => blocksPoint(candidate, point, radius));
  return object?.kind === 'tree' || object?.kind === 'stone' ? object.kind : object ? 'structure' : null;
}

/** Swept, deterministic body collision. It constrains travel but never chooses where a Kin wants to go.
 *  `bodies` are the other living Kin — a walking body slides around them exactly like any obstacle. */
export function resolveKinMove(from: Position, intended: Position, objects: WorldObject[], bodies: Position[] = [], radius = 0.22): MoveResolution {
  const hitAt = (point: Position): MoveResolution['obstacle'] => {
    const solid = obstacleAt(objects, point, radius);
    if (solid) return solid;
    return blockedByBody(bodies, point, radius) ? 'kin' : null;
  };
  const dx = intended.x - from.x; const dy = intended.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.18));
  let pos = { ...from }; let blocked = false; let obstacle: MoveResolution['obstacle'] = null;
  for (let i = 1; i <= steps; i++) {
    const candidate = { x: pos.x + dx / steps, y: pos.y + dy / steps };
    const hit = hitAt(candidate);
    if (!hit) { pos = candidate; continue; }
    blocked = true; obstacle ??= hit;
    const slideX = { x: candidate.x, y: pos.y };
    const slideY = { x: pos.x, y: candidate.y };
    if (Math.abs(slideX.x - pos.x) > .001 && !hitAt(slideX)) pos = slideX;
    else if (Math.abs(slideY.y - pos.y) > .001 && !hitAt(slideY)) pos = slideY;
    else break;
  }
  if (!blocked) return { pos: { ...intended }, blocked, obstacle };
  const snapped = { x: Math.round(pos.x), y: Math.round(pos.y) };
  return { pos: hitAt(snapped) ? { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100 } : snapped, blocked, obstacle };
}
