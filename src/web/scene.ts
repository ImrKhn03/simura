/**
 * The world's window — the style lab, fed by the simulation.
 * Raw renderer, lab atmosphere, lab camera, lab-built things. Every visual
 * decision lives in `render/style-recipes.ts`; this file only wires the
 * simulation's snapshots into the lab's scene.
 */
import * as THREE from 'three';
import type { PublicKinSnapshot, WorldObject, WorldSnapshot } from '../shared/types.ts';
import { CameraRig, type CameraMode } from './render/camera.ts';
import { boundedFrameDelta } from './render/performance.ts';
import { browserCapability, parseQualityChoice, qualitySettings, type QualityChoice } from './render/quality.ts';
import { SIMURA_NIGHT } from './render/materials.ts';
import {
  LAB_LIGHT, LAB_SEASON_TINT, labAtmosphere, labCanopyMaterial, labCloudClusters,
  labFireflies, labMoon, labPrecipitation, labSkyDome, labSkyUniforms, labStars,
  labPoseForVerb, labVerbPose, labWalkCycle, type LabTimeOfDay, type LabWeather,
} from './render/style-recipes.ts';
import { setTerrainSeed, terrainHeight, WorldGround, type TerrainBounds } from './render/world-ground.ts';
import {
  CALAMITY_VISUAL, disposeObjectTree, labWearSlotFor, makeKinBody, makeObjectMesh, makeOwnedObjectMesh, makeShapedMesh, type KinBody,
} from './render/world-things.ts';

export { fallbackShape, kinColorHex, shapeThumbnail, CALAMITY_VISUAL } from './render/world-things.ts';
export { setTerrainSeed, terrainHeight } from './render/world-ground.ts';

// Scene space IS world space: absolute grid coords, so terrain, objects, and
// server perception all agree forever — expansion never shifts anything.

const TIME_OF: Record<WorldSnapshot['presentation']['dayPart'], LabTimeOfDay> = {
  dawn: 'dawn', day: 'noon', dusk: 'dusk', night: 'night',
};
const WEATHER_OF: Record<WorldSnapshot['weather'], LabWeather> = {
  clear: 'clear', cloudy: 'rain', rain: 'rain', fog: 'fog', storm: 'storm', snow: 'snow',
};

interface ThingRecord { object: WorldObject; mesh: THREE.Object3D; key: string; from?: THREE.Vector3; to?: THREE.Vector3; animStart?: number; animDur?: number }

export class Stage {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private qualityChoice: QualityChoice = 'auto';
  private preset: 'low' | 'medium' | 'high' | 'ultra' = 'high';
  private reduceMotionOverride = false;

  private ground: WorldGround;
  private things = new Map<string, ThingRecord>();
  private kinBodies = new Map<string, KinBody>();
  private threatMarkers = new Map<string, THREE.Mesh>();
  private cameraRig: CameraRig;

  private sun = new THREE.DirectionalLight(LAB_LIGHT.sunColor, LAB_LIGHT.sunIntensity);
  private hemisphere = new THREE.HemisphereLight(LAB_LIGHT.hemiSky, LAB_LIGHT.hemiGround, LAB_LIGHT.hemiIntensity);
  private ambient = new THREE.AmbientLight(LAB_LIGHT.ambientColor, LAB_LIGHT.ambientIntensity);
  private skyUniforms = labSkyUniforms();
  private stars = labStars();
  private moon = labMoon();
  private fireflies = labFireflies(60);
  private rain = labPrecipitation(1100, '#BCCCDF', .09);
  private snow = labPrecipitation(750, '#FDFAF0', .16);
  private cloudMaterial = new THREE.MeshBasicMaterial({ color: '#FFF9E6', transparent: true, opacity: .92, fog: false });
  private clouds: THREE.Group[] = [];
  private nightFactor = 0;
  private readonly owned = new Map<string, { mesh: THREE.Object3D; key: string }>();
  private readonly sunOffset = new THREE.Vector3(-22, 29, 15);

  private mapW = 48; private mapH = 48;
  private mapMinX = 0; private mapMinY = 0;
  private groundKey = '';
  private lastSnap: WorldSnapshot | null = null;
  private readonly events = new AbortController();
  private resizeObserver: ResizeObserver | null = null;
  private frameHandle = 0;
  private disposed = false;

  onCameraModeChange: ((mode: string) => void) | null = null;
  onKinClick: ((kinId: string) => void) | null = null;
  onCreatureClick: ((creature: WorldObject) => void) | null = null;

  constructor(container: HTMLElement) {
    if (import.meta.env.DEV) (globalThis as { __stage?: Stage }).__stage = this;
    // the lab renders raw: antialiased, ACES, lab exposure, no post stack
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LAB_LIGHT.exposure;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 500);
    this.camera.position.set(0, 24, 26);
    this.camera.lookAt(24, 0, 24);

    this.scene.background = new THREE.Color(LAB_LIGHT.skyLow);
    this.scene.fog = new THREE.Fog('#F3ECD8', LAB_LIGHT.fogNear, LAB_LIGHT.fogFar);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -46; this.sun.shadow.camera.right = 46;
    this.sun.shadow.camera.top = 46; this.sun.shadow.camera.bottom = -46;
    this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .06;
    this.sun.shadow.intensity = LAB_LIGHT.shadowIntensity;
    this.scene.add(this.sun, this.sun.target, this.hemisphere, this.ambient);
    this.scene.add(labSkyDome(this.skyUniforms), this.stars, this.moon, this.fireflies, this.rain, this.snow);
    this.clouds = labCloudClusters(this.cloudMaterial);
    for (const cluster of this.clouds) this.scene.add(cluster);

    this.ground = new WorldGround(this.scene);
    this.cameraRig = new CameraRig(this.camera, () => { /* cinema needs no pipeline */ }, (mode) => this.onCameraModeChange?.(mode));

    try {
      this.qualityChoice = parseQualityChoice(localStorage.getItem('renderQuality'));
      this.reduceMotionOverride = localStorage.getItem('reduceMotion') === '1';
    } catch { /* preferences are optional */ }
    this.applyQuality();

    const resize = (): void => {
      const { clientWidth: w, clientHeight: h } = container;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(container);
    resize();

    const dom = this.renderer.domElement;
    this.cameraRig.attachInput(dom, () => this.terrainBounds(), () => this.cameraContext());
    const pick = (ev: PointerEvent | MouseEvent): { kinId?: string; creature?: WorldObject } | null => {
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      for (const [kinId, body] of this.kinBodies) if (ray.intersectObject(body.group, true).length > 0) return { kinId };
      for (const record of this.things.values()) {
        if (!record.object.creature) continue;
        if (ray.intersectObject(record.mesh, true).length > 0) return { creature: record.object };
      }
      return null;
    };
    dom.addEventListener('click', (ev) => {
      if (this.cameraRig.pointerMoved) return;
      const hit = pick(ev);
      if (hit?.kinId) this.onKinClick?.(hit.kinId);
      else if (hit?.creature) this.onCreatureClick?.(hit.creature);
    }, { signal: this.events.signal });
    dom.addEventListener('dblclick', (ev) => {
      const hit = pick(ev);
      if (hit?.kinId) this.cameraRig.focusKin(hit.kinId, this.kinBodies);
      else this.cameraRig.stopFollowing(true);
    }, { signal: this.events.signal });

    let lastT = performance.now();
    const loop = (): void => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      const now = performance.now();
      if (document.hidden) { lastT = now; return; }
      const dt = boundedFrameDelta(lastT, now, true);
      lastT = now;
      this.animate(now, dt);
      this.renderer.info.reset();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setCameraMode(mode: CameraMode, kinId?: string): void { this.cameraRig.setMode(mode, this.cameraContext(), kinId); }
  get cameraMode(): string { return this.cameraRig.cameraMode; }
  get selectedQuality(): QualityChoice { return this.qualityChoice; }
  applyCameraPreset(n: number): void { this.cameraRig.applyPreset(n, this.cameraContext()); }
  focusKin(kinId: string): void { this.cameraRig.focusKin(kinId, this.kinBodies); }
  focusCreature(objectId: string): void { this.cameraRig.focusCreature(objectId, this.lastSnap); }

  metrics(): { calls: number; triangles: number; geometries: number; textures: number; chunks: number; objects: number; creatures: number } {
    const info = this.renderer.info;
    let creatures = 0; for (const record of this.things.values()) if (record.object.creature) creatures++;
    return {
      calls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      chunks: 1, objects: this.things.size, creatures,
    };
  }

  setQuality(choice: QualityChoice, reduceMotion = this.reduceMotionOverride): void {
    this.qualityChoice = parseQualityChoice(choice);
    this.reduceMotionOverride = reduceMotion;
    try {
      localStorage.setItem('renderQuality', this.qualityChoice);
      localStorage.setItem('reduceMotion', reduceMotion ? '1' : '0');
    } catch { /* preferences are optional */ }
    this.applyQuality();
    if (this.lastSnap) { this.groundKey = ''; this.update(this.lastSnap); }
  }

  private applyQuality(): void {
    const cap = browserCapability(this.renderer);
    const settings = qualitySettings(this.qualityChoice, { ...cap, reducedMotion: cap.reducedMotion || this.reduceMotionOverride });
    this.preset = settings.preset;
    this.renderer.setPixelRatio(settings.pixelRatio);
    this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
  }

  update(snap: WorldSnapshot): void {
    this.lastSnap = snap;
    this.mapW = snap.map.width; this.mapH = snap.map.height;
    this.mapMinX = snap.map.minX ?? 0; this.mapMinY = snap.map.minY ?? 0;
    const gk = `${this.mapMinX},${this.mapMinY}:${this.mapW}x${this.mapH}x${snap.seed}:${this.preset}`;
    if (gk !== this.groundKey) {
      this.groundKey = gk;
      setTerrainSeed(snap.seed);
      this.ground.rebuild(this.terrainBounds(), this.preset);
    }
    this.applyAtmosphere(snap);
    this.ground.applySeason(snap.presentation.season);
    this.ground.updateTrails(snap.trails);
    this.ground.updateFlood(snap.presentation.calamity?.kind === 'flood', this.terrainBounds());
    this.updateThings(snap);
    this.updateKin(snap);
    this.updateOwned(snap);
    this.updateThreatMarkers(snap);
  }

  private applyAtmosphere(snap: WorldSnapshot): void {
    const time = TIME_OF[snap.presentation.dayPart];
    const weather = WEATHER_OF[snap.weather];
    const a = labAtmosphere(time, weather);
    this.sunOffset.set(...a.sunPos).normalize().multiplyScalar(36);
    this.sunOffset.y = Math.max(10, this.sunOffset.y);
    this.sun.position.copy(this.sunOffset);
    this.sun.color.set(a.sunColor);
    this.sun.intensity = a.sunI;
    this.hemisphere.intensity = a.hemiI;
    this.ambient.intensity = a.ambI;
    (this.skyUniforms.top.value).copy(a.skyTop);
    (this.skyUniforms.low.value).copy(a.skyLow);
    (this.skyUniforms.sun.value).copy(this.sun.position).normalize();
    this.skyUniforms.glow.value = a.glow;
    // a calamity stains the whole sky with its colour — unmistakable, still paint
    const calamity = snap.presentation.calamity;
    if (calamity) {
      const stain = new THREE.Color(CALAMITY_VISUAL[calamity.kind].color);
      a.fog.lerp(stain, .22); a.skyLow.lerp(stain, .3);
      this.sun.color.lerp(stain, .18);
    }
    (this.scene.fog as THREE.Fog).color.copy(a.fog);
    (this.scene.fog as THREE.Fog).near = a.fogNear;
    (this.scene.fog as THREE.Fog).far = a.fogFar;
    (this.scene.background as THREE.Color).copy(a.fog);
    this.cloudMaterial.color.set(a.cloudColor);
    this.cloudMaterial.opacity = a.cloudOpacity;
    (this.stars.material as THREE.PointsMaterial).opacity = a.starNight * .95;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = snap.era >= 7 ? a.night * .95 : 0;
    (this.fireflies.material as THREE.PointsMaterial).opacity = a.night * (weather === 'rain' || weather === 'storm' ? .1 : .95);
    this.rain.visible = snap.weather === 'rain' || snap.weather === 'storm';
    this.snow.visible = snap.weather === 'snow';
    this.nightFactor = a.night;
    SIMURA_NIGHT.value = a.night;
    // finished homes light their windows as the dark comes in
    for (const record of this.things.values()) {
      if (record.mesh.name !== 'completed-structure') continue;
      record.mesh.traverse((part) => {
        if (part instanceof THREE.Mesh && part.name === 'windowGlass') {
          const material = part.material as THREE.MeshPhysicalMaterial;
          material.emissive.set('#FFC97A');
          material.emissiveIntensity = a.night * 1.1;
        }
      });
    }
    labCanopyMaterial().color.set(LAB_SEASON_TINT[snap.presentation.season ?? 'summer'].canopy);
  }

  private thingKey(object: WorldObject): string {
    return `${object.kind}|${object.pos.x},${object.pos.y}|${object.yieldLeft !== null && object.yieldLeft <= 0 ? 'spent' : 'live'}|${object.shape ? 'shaped' : 'plain'}|${object.carriedBy ?? ''}|${object.creature?.activity ?? ''}`;
  }

  private updateThings(snap: WorldSnapshot): void {
    const seen = new Set<string>();
    for (const object of snap.objects) {
      if (object.carriedBy || object.storedIn) continue; // carried rides the Kin; stored is inside its container
      seen.add(object.id);
      const fill = snap.objects.reduce((count, other) => count + (other.storedIn === object.id ? 1 : 0), 0);
      const key = `${this.thingKey(object)}|fill:${fill}`;
      let record = this.things.get(object.id);
      if (record && record.key !== key) { disposeObjectTree(record.mesh); this.things.delete(object.id); record = undefined; }
      if (!record) {
        const mesh = makeObjectMesh(object, fill);
        mesh.position.set(object.pos.x, terrainHeight(object.pos.x, object.pos.y), object.pos.y);
        this.scene.add(mesh);
        record = { object, mesh, key };
        this.things.set(object.id, record);
      } else {
        record.object = object;
        const next = new THREE.Vector3(object.pos.x, terrainHeight(object.pos.x, object.pos.y), object.pos.y);
        if (object.creature && record.mesh.position.distanceToSquared(next) > .0001) {
          // creatures walk to their new ground, same glide as Kin
          record.from = record.mesh.position.clone();
          record.to = next;
          record.animStart = performance.now();
          record.animDur = (snap.tickMs ?? 4000) * .85;
          record.mesh.rotation.y = Math.atan2(next.x - record.from.x, next.z - record.from.z);
        } else {
          record.from = undefined; record.to = undefined;
          record.mesh.position.copy(next);
        }
      }
    }
    for (const [id, record] of this.things) if (!seen.has(id)) { disposeObjectTree(record.mesh); this.things.delete(id); }
  }

  private updateKin(snap: WorldSnapshot): void {
    const byId = new Map(snap.kin.map((kin) => [kin.id, kin]));
    const dur = (snap.tickMs ?? 4000) * .85;
    const now = performance.now();
    const latestVerb = new Map<string, string>();
    for (const event of snap.recentEvents) if (event.actorKinId && event.tick >= snap.tick - 1) latestVerb.set(event.actorKinId, event.verb);
    for (const kin of snap.kin) {
      let body = this.kinBodies.get(kin.id);
      if (kin.status === 'dead') {
        if (body) { disposeObjectTree(body.group); this.kinBodies.delete(kin.id); }
        continue;
      }
      const x = kin.pos.x, z = kin.pos.y;
      const gy = terrainHeight(x, z);
      const asleep = kin.asleepUntil !== null && kin.asleepUntil > snap.tick;
      const bodySig = `${kin.presentation.lifeStage}|${kin.status}|${kin.gender}`;
      if (body && body.bodySig !== bodySig) { disposeObjectTree(body.group); this.kinBodies.delete(kin.id); body = undefined; }
      if (body) {
        body.from = body.group.position.clone();
        body.to = new THREE.Vector3(x, gy, z);
        body.animStart = now; body.animDur = dur;
        body.verb = latestVerb.get(kin.id) ?? body.verb;
        body.asleep = asleep; body.kin = kin;
      } else {
        const made = makeKinBody(kin, byId);
        made.group.position.set(x, gy, z);
        this.scene.add(made.group);
        this.kinBodies.set(kin.id, {
          rig: made.rig, group: made.group,
          from: new THREE.Vector3(x, gy, z), to: new THREE.Vector3(x, gy, z),
          animStart: now, animDur: dur, verb: 'reflect', asleep, kin, bodySig,
        });
      }
    }
    for (const [id, body] of this.kinBodies) if (!byId.has(id) || byId.get(id)!.status === 'dead') {
      disposeObjectTree(body.group); this.kinBodies.delete(id);
    }
  }

  /** Carried things ride the hands; worn things sit in their slots. Earned, visible. */
  private updateOwned(snap: WorldSnapshot): void {
    const seen = new Set<string>();
    let handSide = 0;
    for (const object of snap.objects) {
      if (!object.carriedBy || object.storedIn) continue;
      const body = this.kinBodies.get(object.carriedBy);
      if (!body) continue;
      const slot = object.worn ? labWearSlotFor(object.name, object.description ?? '')
        : /\b(pack|satchel)\b/i.test(object.name) ? 'wear.back'
          : (handSide++ % 2 === 0 ? 'hand.R' : 'hand.L');
      const anchor = body.group.getObjectByName(slot);
      if (!anchor) continue;
      seen.add(object.id);
      const key = `${object.carriedBy}|${slot}|${object.worn ? 'worn' : 'held'}|${body.bodySig}`;
      let record = this.owned.get(object.id);
      if (record && (record.key !== key || record.mesh.parent !== anchor)) {
        disposeObjectTree(record.mesh); this.owned.delete(object.id); record = undefined;
      }
      if (!record) {
        const mesh = makeOwnedObjectMesh(object);
        if (!object.worn) mesh.rotation.set(-.65, .35, .1); // cradled against the forearm
        anchor.add(mesh);
        this.owned.set(object.id, { mesh, key });
      }
    }
    for (const [id, record] of this.owned) if (!seen.has(id)) { disposeObjectTree(record.mesh); this.owned.delete(id); }
  }

  private updateThreatMarkers(snap: WorldSnapshot): void {
    const threatened = new Set(snap.objects.flatMap((object) => object.creature?.threatenedKinIds ?? []));
    for (const [kinId, marker] of this.threatMarkers) if (!threatened.has(kinId)) { disposeObjectTree(marker); this.threatMarkers.delete(kinId); }
    for (const kinId of threatened) {
      const kin = snap.kin.find((person) => person.id === kinId && person.status !== 'dead');
      if (!kin) continue;
      let marker = this.threatMarkers.get(kinId);
      if (!marker) {
        marker = new THREE.Mesh(new THREE.TorusGeometry(.62, .04, 6, 24), new THREE.MeshBasicMaterial({ color: '#E2674F', transparent: true, opacity: .8 }));
        marker.rotation.x = Math.PI / 2; marker.name = 'threat-ring';
        this.threatMarkers.set(kinId, marker); this.scene.add(marker);
      }
      marker.position.set(kin.pos.x, terrainHeight(kin.pos.x, kin.pos.y) + .06, kin.pos.y);
    }
  }

  private animate(now: number, dt: number): void {
    const t = now / 1000;
    this.ground.frame(t, this.reduceMotionOverride);

    // kin: glide between ticks, walk when moving, lie when asleep
    for (const body of this.kinBodies.values()) {
      const k = Math.min(1, (now - body.animStart) / body.animDur);
      body.group.position.lerpVectors(body.from, body.to, k);
      body.group.position.y = terrainHeight(body.group.position.x, body.group.position.z);
      const moving = body.from.distanceToSquared(body.to) > .01 && k < 1;
      if (moving) {
        body.group.rotation.y = Math.atan2(body.to.x - body.from.x, body.to.z - body.from.z);
      }
      const zzz = body.group.getObjectByName('zzz');
      if (zzz) zzz.visible = body.asleep;
      if (body.asleep) {
        body.group.rotation.x = -Math.PI / 2 * .92;
        body.group.position.y += .18;
        if (zzz) zzz.position.y = 1.5 + Math.sin(t * 1.4 + body.kin.id.length) * .08;
      } else {
        // stand WITH the hill: a gentle tilt along the slope underfoot
        const yaw = body.group.rotation.y;
        const ahead = terrainHeight(body.group.position.x + Math.sin(yaw) * .3, body.group.position.z + Math.cos(yaw) * .3);
        const behind = terrainHeight(body.group.position.x - Math.sin(yaw) * .3, body.group.position.z - Math.cos(yaw) * .3);
        body.group.rotation.x = THREE.MathUtils.clamp((behind - ahead) * .55, -.16, .16);
        // calmer motion damps flourish, never the act of walking itself
        const motion = this.reduceMotionOverride ? .6 : 1;
        // stride keeps time with the ground actually covered — walking, never sliding
        const glideSpeed = body.from.distanceTo(body.to) / Math.max(.4, body.animDur / 1000);
        const strideRate = THREE.MathUtils.clamp(4 + glideSpeed * 9, 5, 12);
        labWalkCycle(body.rig, t + body.kin.id.charCodeAt(0), moving, strideRate, motion);
        if (!moving) labVerbPose(body.rig, labPoseForVerb(body.verb, false), t + body.kin.id.charCodeAt(0), motion);
      }
    }

    // creatures glide, sway, and step; fires flicker
    for (const record of this.things.values()) {
      let travelling = false;
      if (record.from && record.to && record.animStart !== undefined && record.animDur) {
        const k = Math.min(1, (now - record.animStart) / record.animDur);
        record.mesh.position.lerpVectors(record.from, record.to, k);
        record.mesh.position.y = terrainHeight(record.mesh.position.x, record.mesh.position.z);
        travelling = k < 1;
        if (!travelling) { record.from = undefined; record.to = undefined; }
      }
      const rig = record.mesh.userData?.creatureRig as { legs: THREE.Group[]; tail?: THREE.Group; wings: THREE.Group[] } | undefined;
      if (rig) {
        const wave = Math.sin(t * (travelling ? 8 : 3) + record.mesh.position.x * .7) * (this.reduceMotionOverride ? .35 : 1) * (travelling ? 1.4 : 1);
        rig.legs.forEach((leg, i) => { leg.rotation.x = wave * (i % 2 === 0 ? .35 : -.35); });
        if (rig.tail) rig.tail.rotation.y = wave * .4;
        rig.wings.forEach((wing, i) => { wing.rotation.x = wave * .15 * (i === 0 ? 1 : -1); });
      }
      const tail = record.mesh.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 6 + record.mesh.position.x) * .5;
      const flame = record.mesh.getObjectByName('flame');
      if (flame) flame.scale.set(1 + Math.sin(t * 11) * .12, 1 + Math.sin(t * 14 + 1) * .2, 1 + Math.cos(t * 12) * .12);
      const firelight = record.mesh.getObjectByName('firelight') as THREE.PointLight | null;
      if (firelight) firelight.intensity = (4.4 + Math.sin(t * 9) * .9) * (0.6 + this.nightFactor * .6);
    }

    // sky life
    for (let i = 0; i < this.clouds.length; i++) {
      const cluster = this.clouds[i]!;
      cluster.position.x += dt * (.35 + i * .04);
      if (cluster.position.x > 120) cluster.position.x = -120;
    }
    if (this.rain.visible || this.snow.visible) {
      const points = this.rain.visible ? this.rain : this.snow;
      const positions = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const speed = this.rain.visible ? 14 : 3.2;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - dt * speed;
        if (y < 0) y = 26;
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
    }

    const target = this.cameraRig.frame(now, dt, this.cameraContext());
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.position.set(target.x + this.sunOffset.x, this.sunOffset.y, target.z + this.sunOffset.z);
    this.fireflies.position.set(target.x, terrainHeight(target.x, target.z) + .6, target.z);
    this.rain.position.set(target.x, 0, target.z);
    this.snow.position.set(target.x, 0, target.z);
    this.stars.position.set(target.x, 0, target.z);
  }

  private terrainBounds(): TerrainBounds {
    return { minX: this.mapMinX, minY: this.mapMinY, width: this.mapW, height: this.mapH };
  }

  private cameraContext(): { bodies: Map<string, KinBody>; snapshot: WorldSnapshot | null } {
    return { bodies: this.kinBodies, snapshot: this.lastSnap };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    this.events.abort();
    this.cameraRig.dispose(this.cameraContext());
    for (const record of this.owned.values()) disposeObjectTree(record.mesh);
    this.owned.clear();
    for (const body of this.kinBodies.values()) disposeObjectTree(body.group);
    this.kinBodies.clear();
    for (const record of this.things.values()) disposeObjectTree(record.mesh);
    this.things.clear();
    for (const marker of this.threatMarkers.values()) disposeObjectTree(marker);
    this.threatMarkers.clear();
    this.ground.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.clear();
  }
}

export type { PublicKinSnapshot };
export { makeShapedMesh };
