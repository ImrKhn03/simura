import * as THREE from 'three';
import type { WorldSnapshot } from '../../shared/types.ts';
import type { KinBody } from './world-things.ts';
import { terrainHeight } from './world-ground.ts';

/** One camera, one feel: the lab's three-quarter view, explored like a game.
 *  WASD / arrows glide over the land (camera-relative), drag looks around,
 *  the wheel zooms, Q/E rotate. Click a Kin to follow; move to break away. */
export type CameraMode = 'auto';

export interface CameraFrameContext {
  bodies: Map<string, KinBody>;
  snapshot: WorldSnapshot | null;
}

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export class CameraRig {
  private heading = .8;
  private pitch = .48;
  private zoom = 27;
  readonly pan = new THREE.Vector2();
  private followed: string | null = null;
  private held = new Set<string>();
  private moved = false;
  private detachInput: (() => void) | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly setCinema: (active: boolean) => void,
    private readonly modeChanged: (mode: CameraMode) => void,
  ) { this.load(); this.setCinema(false); }

  get cameraMode(): CameraMode { return 'auto'; }
  get followId(): string | null { return this.followed; }
  get watchedId(): string | null { return this.followed; }
  get pointerMoved(): boolean { return this.moved; }

  /** Mode requests from older UI paths all resolve to the one explorer view. */
  setMode(_mode: string, _context: CameraFrameContext, kinId?: string): void {
    if (kinId) this.followed = kinId;
    this.modeChanged('auto');
  }

  /** Presets collapsed to one: reset to the lab's hero view. */
  applyPreset(_preset: number, _context: CameraFrameContext): void {
    this.heading = .8; this.pitch = .48; this.zoom = 27; this.save();
  }

  focusKin(kinId: string, bodies: Map<string, KinBody>): void {
    this.followed = kinId; this.zoom = Math.min(this.zoom, 12);
    const body = bodies.get(kinId); if (body) this.heading = body.group.rotation.y + Math.PI;
  }

  focusCreature(objectId: string, snapshot: WorldSnapshot | null): void {
    const object = snapshot?.objects.find((candidate) => candidate.id === objectId && candidate.creature); if (!object) return;
    const living = snapshot?.kin.filter((kin) => kin.status !== 'dead') ?? [];
    const centerX = living.length ? living.reduce((sum, kin) => sum + kin.pos.x, 0) / living.length : 0;
    const centerZ = living.length ? living.reduce((sum, kin) => sum + kin.pos.y, 0) / living.length : 0;
    this.followed = null; this.pan.set(object.pos.x - centerX, object.pos.y - centerZ); this.zoom = Math.min(this.zoom, 14);
  }

  stopFollowing(resetPan = false): void { this.followed = null; if (resetPan) this.pan.set(0, 0); }

  attachInput(dom: HTMLElement, bounds: () => { width: number; height: number; minX: number; minY: number }, context: () => CameraFrameContext): void {
    this.detachInput?.();
    void context;
    const wheel = (event: WheelEvent): void => { event.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * .03, 6, 60); this.save(); };
    const contextMenu = (event: MouseEvent): void => event.preventDefault();
    let dragging = false; let lastX = 0; let lastY = 0;
    const pointerDown = (event: PointerEvent): void => { dragging = true; this.moved = false; lastX = event.clientX; lastY = event.clientY; };
    const pointerUp = (): void => { dragging = false; };
    const pointerMove = (event: PointerEvent): void => {
      if (!dragging) return;
      const dx = event.clientX - lastX; const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      lastX = event.clientX; lastY = event.clientY;
      this.heading -= dx * .005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .004, .18, 1.2);
      this.save();
    };
    const typing = (): boolean => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    const keyDown = (event: KeyboardEvent): void => {
      if (typing()) return;
      const key = event.key.toLowerCase();
      if (MOVE_KEYS.has(key) || key === 'q' || key === 'e') { this.held.add(key); event.preventDefault(); return; }
      if (key === 'escape') { this.stopFollowing(); return; }
    };
    const keyUp = (event: KeyboardEvent): void => { this.held.delete(event.key.toLowerCase()); };
    const blur = (): void => { this.held.clear(); dragging = false; };
    dom.addEventListener('wheel', wheel, { passive: false }); dom.addEventListener('contextmenu', contextMenu);
    dom.addEventListener('pointerdown', pointerDown); dom.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp); window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
    this.boundsFn = bounds;
    this.detachInput = () => {
      dom.removeEventListener('wheel', wheel); dom.removeEventListener('contextmenu', contextMenu);
      dom.removeEventListener('pointerdown', pointerDown); dom.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp); window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
    };
  }

  private boundsFn: (() => { width: number; height: number; minX: number; minY: number }) | null = null;

  frame(_now: number, dt: number, context: CameraFrameContext): THREE.Vector3 {
    // WASD glide, camera-relative — forward is into the screen, like a game.
    const forwardX = -Math.sin(this.heading); const forwardZ = -Math.cos(this.heading);
    const rightX = -forwardZ; const rightZ = forwardX;
    let moveX = 0; let moveZ = 0;
    if (this.held.has('w') || this.held.has('arrowup')) { moveX += forwardX; moveZ += forwardZ; }
    if (this.held.has('s') || this.held.has('arrowdown')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (this.held.has('d') || this.held.has('arrowright')) { moveX += rightX; moveZ += rightZ; }
    if (this.held.has('a') || this.held.has('arrowleft')) { moveX -= rightX; moveZ -= rightZ; }
    if (this.held.has('q')) this.heading += dt * 1.7;
    if (this.held.has('e')) this.heading -= dt * 1.7;
    if (moveX !== 0 || moveZ !== 0) {
      const speed = (7 + this.zoom * .35) * dt;
      const length = Math.hypot(moveX, moveZ);
      const centroidNow = this.centroid(context);
      const limit = this.boundsFn?.() ?? { minX: 0, minY: 0, width: 48, height: 48 };
      if (this.followed && context.bodies.has(this.followed)) {
        // break away from a follow exactly where they stand
        const body = context.bodies.get(this.followed)!;
        this.pan.set(body.group.position.x - centroidNow.x, body.group.position.z - centroidNow.z);
      }
      this.followed = null;
      this.pan.x = THREE.MathUtils.clamp(this.pan.x + moveX / length * speed, limit.minX - centroidNow.x - 24, limit.minX + limit.width - centroidNow.x + 24);
      this.pan.y = THREE.MathUtils.clamp(this.pan.y + moveZ / length * speed, limit.minY - centroidNow.z - 24, limit.minY + limit.height - centroidNow.z + 24);
    }
    let target: THREE.Vector3;
    if (this.followed && context.bodies.has(this.followed)) {
      target = context.bodies.get(this.followed)!.group.position.clone(); target.y += .56;
    } else {
      target = this.centroid(context); target.x += this.pan.x; target.z += this.pan.y;
      target.y = Math.max(0, terrainHeight(target.x, target.z));
    }
    const radius = Math.cos(this.pitch) * this.zoom;
    const wanted = new THREE.Vector3(
      target.x + Math.sin(this.heading) * radius,
      Math.max(target.y + Math.sin(this.pitch) * this.zoom, terrainHeight(target.x + Math.sin(this.heading) * radius, target.z + Math.cos(this.heading) * radius) + 1.4),
      target.z + Math.cos(this.heading) * radius,
    );
    this.camera.position.lerp(wanted, Math.min(1, dt * 5));
    this.camera.lookAt(target);
    return target;
  }

  private centroid(context: CameraFrameContext): THREE.Vector3 {
    const living = context.snapshot?.kin.filter((kin) => kin.status !== 'dead') ?? [];
    if (!living.length) return new THREE.Vector3(24, 0, 24);
    return new THREE.Vector3(
      living.reduce((sum, kin) => sum + kin.pos.x, 0) / living.length, 0,
      living.reduce((sum, kin) => sum + kin.pos.y, 0) / living.length,
    );
  }

  dispose(_context: CameraFrameContext): void { this.detachInput?.(); this.detachInput = null; this.held.clear(); }

  private save(): void { try { localStorage.setItem('camState', JSON.stringify({ version: 7, heading: this.heading, pitch: this.pitch, zoom: this.zoom })); } catch { /* optional */ } }
  private load(): void {
    try {
      const state = JSON.parse(localStorage.getItem('camState') ?? '{}') as { version?: number; heading?: number; pitch?: number; zoom?: number };
      if (state.version !== 7) return;
      if (typeof state.heading === 'number') this.heading = state.heading;
      if (typeof state.pitch === 'number') this.pitch = THREE.MathUtils.clamp(state.pitch, .18, 1.2);
      if (typeof state.zoom === 'number') this.zoom = THREE.MathUtils.clamp(state.zoom, 6, 60);
    } catch { /* optional */ }
  }
}
