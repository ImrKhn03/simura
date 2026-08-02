/**
 * The land under the world — painted with the style contract's meadow brush,
 * dressed with the contract's grass, flowers, shrubs and rocks, at lab density.
 * Terrain height is the shared server/client function; nothing here invents look.
 */
import * as THREE from 'three';
import { heightAt } from '../../shared/terrain.ts';
import type { WorldSnapshot } from '../../shared/types.ts';
import {
  LAB, LAB_SEASON_TINT, labBloomColor, labFlowerGeometry, labFlowerMaterial,
  labGrassGeometry, labGrassMaterial, labGrassTint, labGrassTransform,
  labGroundMaterial, labHash, labMeadowColor, labRockGeometry, labRockMaterial,
  labShrubColor, labShrubGeometry, labShrubMaterial, waterMaterialForPool,
  windUniform, type LabSeason,
} from './style-recipes.ts';
import { modernSurfaceMaterial } from './materials.ts';
import type { QualityPreset } from './quality.ts';

let terrainSeed = 1;
export function setTerrainSeed(seed: number): void { terrainSeed = (seed | 0) || 1; }
export function currentTerrainSeed(): number { return terrainSeed; }
export function terrainHeight(sx: number, sz: number): number { return heightAt(sx, sz, terrainSeed); }

export interface TerrainBounds { minX: number; minY: number; width: number; height: number }

/** Dressing density per quality tier — the lab runs at ~1.28 tufts/m². */
export const DRESSING_CAP: Record<QualityPreset, number> = { low: 1600, medium: 3600, high: 6400, ultra: 9600 };

const BAND = {
  waterDeep: new THREE.Color('#3F9DB4'),
  water: new THREE.Color(LAB.water),
  sand: new THREE.Color(LAB.sand),
  rock: new THREE.Color(LAB.stone),
  snow: new THREE.Color('#EFE9D3'),
};

/** Below the meadow: shore and lakebed. Above it: rock and snow. */
function bandColor(h: number, target: THREE.Color): THREE.Color {
  if (h < -1.4) return target.copy(BAND.waterDeep);
  if (h < -0.5) return target.copy(BAND.waterDeep).lerp(BAND.water, (h + 1.4) / .9);
  if (h < -0.1) return target.copy(BAND.water).lerp(BAND.sand, (h + .5) / .4);
  if (h < 1.9) return target.copy(BAND.rock); // blended into meadow by caller
  if (h < 2.6) return target.copy(BAND.rock).lerp(BAND.snow, (h - 1.9) / .7);
  return target.copy(BAND.snow);
}

export class WorldGround {
  private root: THREE.Group | null = null;
  readonly groundMaterial = labGroundMaterial();
  readonly grassMaterial = labGrassMaterial();
  private waterTime: { value: number } | null = null;
  private trailMesh: THREE.InstancedMesh | null = null;
  private trailKey = '';
  private floodSurface: THREE.Mesh | null = null;
  private season: LabSeason = 'summer';

  constructor(private readonly scene: THREE.Scene) {}

  rebuild(bounds: TerrainBounds, preset: QualityPreset): void {
    this.disposeRoot();
    const root = new THREE.Group(); root.name = 'world-ground';
    const padding = 10;
    const spanWidth = bounds.width - bounds.minX + padding * 2;
    const spanHeight = bounds.height - bounds.minY + padding * 2;
    const centerX = (bounds.minX + bounds.width) / 2;
    const centerZ = (bounds.minY + bounds.height) / 2;

    // painted ground: lab meadow brush, banded at shores, rock and snow
    const geometry = new THREE.PlaneGeometry(spanWidth, spanHeight, Math.min(spanWidth * 3, 420), Math.min(spanHeight * 3, 420));
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors: number[] = [];
    const meadow = new THREE.Color(); const band = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + centerX; const z = -position.getY(i) + centerZ;
      const h = terrainHeight(x, z); position.setZ(i, h);
      labMeadowColor(x, z, h, meadow);
      bandColor(h, band);
      let mix = 0;
      if (h >= .15 && h < 1.3) mix = 1;
      else if (h >= -0.1 && h < .15) mix = (h + .1) / .25;
      else if (h >= 1.3 && h < 1.9) mix = 1 - (h - 1.3) / .6;
      const c = band.lerp(meadow, THREE.MathUtils.clamp(mix, 0, 1));
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const plane = new THREE.Mesh(geometry, this.groundMaterial);
    plane.rotation.x = -Math.PI / 2; plane.position.set(centerX, 0, centerZ); plane.receiveShadow = true;
    root.add(plane);

    // lakes: one still sheet at the waterline
    const waterMaterial = waterMaterialForPool();
    this.waterTime = { value: 0 };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(spanWidth, spanHeight), waterMaterial);
    water.rotation.x = -Math.PI / 2; water.position.set(centerX, -.55, centerZ);
    root.add(water);

    root.add(this.buildDressing(bounds, padding, preset));
    this.root = root;
    this.scene.add(root);
    this.applySeason(this.season, true);
  }

  /** Lab dressing at lab density: grass everywhere fertile, flowers, shrubs, rocks. */
  private buildDressing(bounds: TerrainBounds, padding: number, preset: QualityPreset): THREE.Group {
    const group = new THREE.Group(); group.name = 'dressing';
    const seed = currentTerrainSeed();
    const minX = bounds.minX - padding, minZ = bounds.minY - padding;
    const width = bounds.width - bounds.minX + padding * 2, depth = bounds.height - bounds.minY + padding * 2;
    const cap = DRESSING_CAP[preset];
    interface Placement { x: number; z: number; y: number; k: number }
    const grass: Placement[] = []; const flowers: Placement[] = []; const shrubs: Placement[] = []; const rocks: Placement[] = [];
    for (let i = 0; i < cap * 2 && grass.length + flowers.length + shrubs.length + rocks.length < cap; i++) {
      const x = minX + labHash(seed + i, 101) * width;
      const z = minZ + labHash(101, seed + i) * depth;
      const y = terrainHeight(x, z);
      if (!Number.isFinite(y) || y < -0.1 || y > 1.9) continue;
      const k = labHash(seed + i, 53);
      if (k > .985) flowers.push({ x, z, y, k });
      else if (k > .955) shrubs.push({ x, z, y, k });
      else if (k > .93) rocks.push({ x, z, y, k });
      else grass.push({ x, z, y, k });
    }
    const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const euler = new THREE.Euler(); const tint = new THREE.Color();

    const grassMesh = new THREE.InstancedMesh(labGrassGeometry(), this.grassMaterial, Math.max(1, grass.length));
    grassMesh.name = 'dress-grass';
    grassMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, grass.length) * 3), 3);
    grass.forEach((p, index) => {
      const t = labGrassTransform(index);
      euler.set(0, t.yaw, t.tilt); quaternion.setFromEuler(euler);
      matrix.compose(new THREE.Vector3(p.x, p.y + .01, p.z), quaternion, new THREE.Vector3(t.scale, t.scale * t.stretch, t.scale));
      grassMesh.setMatrixAt(index, matrix);
      grassMesh.setColorAt(index, labGrassTint(p.x, p.z, index, tint));
    });
    grassMesh.count = grass.length; grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    group.add(grassMesh);

    const flowerMesh = new THREE.InstancedMesh(labFlowerGeometry(), labFlowerMaterial(), Math.max(1, flowers.length));
    flowerMesh.name = 'dress-flowers';
    flowerMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, flowers.length) * 3), 3);
    flowers.forEach((p, index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.k * Math.PI * 2);
      const s = .8 + labHash(index, 47) * .7;
      matrix.compose(new THREE.Vector3(p.x, p.y, p.z), quaternion, new THREE.Vector3(s, s, s));
      flowerMesh.setMatrixAt(index, matrix);
      tint.set(labBloomColor(labHash(index, 41)));
      flowerMesh.setColorAt(index, tint);
    });
    flowerMesh.count = flowers.length; flowerMesh.instanceMatrix.needsUpdate = true;
    if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
    group.add(flowerMesh);

    const shrubMesh = new THREE.InstancedMesh(labShrubGeometry(), labShrubMaterial(), Math.max(1, shrubs.length));
    shrubMesh.name = 'dress-shrubs';
    shrubMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, shrubs.length) * 3), 3);
    shrubs.forEach((p, index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.k * Math.PI * 2);
      const s = 1 + labHash(index, 5) * .88;
      matrix.compose(new THREE.Vector3(p.x, p.y + .1, p.z), quaternion, new THREE.Vector3(s, s * .62, s));
      shrubMesh.setMatrixAt(index, matrix);
      shrubMesh.setColorAt(index, labShrubColor(labHash(index, 8), tint));
    });
    shrubMesh.count = shrubs.length; shrubMesh.instanceMatrix.needsUpdate = true;
    if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;
    group.add(shrubMesh);

    const rockMesh = new THREE.InstancedMesh(labRockGeometry(), labRockMaterial(), Math.max(1, rocks.length));
    rockMesh.name = 'dress-rocks';
    rocks.forEach((p, index) => {
      euler.set(labHash(index, 1) * 3, labHash(index, 2) * 3, 0); quaternion.setFromEuler(euler);
      const s = 1 + labHash(index, 6) * 1.5;
      matrix.compose(new THREE.Vector3(p.x, p.y + .06, p.z), quaternion, new THREE.Vector3(s, s * .62, s * .85));
      rockMesh.setMatrixAt(index, matrix);
    });
    rockMesh.count = rocks.length; rockMesh.instanceMatrix.needsUpdate = true;
    group.add(rockMesh);
    return group;
  }

  applySeason(season: WorldSnapshot['presentation']['season'], force = false): void {
    const next: LabSeason = season ?? 'summer';
    if (!force && next === this.season) return;
    this.season = next;
    const tint = LAB_SEASON_TINT[next];
    this.groundMaterial.color.set(tint.ground);
    this.grassMaterial.color.set(tint.grass);
  }

  updateTrails(trails: WorldSnapshot['trails']): void {
    const key = trails.map((trail) => `${trail.x},${trail.y}:${trail.c}`).join('|');
    if (key === this.trailKey) return; this.trailKey = key;
    if (this.trailMesh) { disposeMesh(this.trailMesh); this.trailMesh = null; }
    if (!trails.length) return;
    const material = modernSurfaceMaterial(LAB.sandDeep, { transparent: true, opacity: .55, roughness: .92, rimStrength: 0, gradientStrength: 0 });
    this.trailMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(.5, 10), material, trails.length);
    this.trailMesh.name = 'trails';
    const matrix = new THREE.Matrix4();
    trails.forEach((trail, index) => {
      const wear = THREE.MathUtils.clamp((Math.max(0, trail.c) - 1) / 44, 0, 1);
      const s = .8 + wear * 1.4;
      matrix.makeRotationX(-Math.PI / 2);
      matrix.setPosition(trail.x, terrainHeight(trail.x, trail.y) + .03, trail.y);
      matrix.scale(new THREE.Vector3(s, s, 1));
      this.trailMesh!.setMatrixAt(index, matrix);
    });
    this.trailMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.trailMesh);
  }

  updateFlood(active: boolean, bounds: TerrainBounds): void {
    if (!active) { if (this.floodSurface) { disposeMesh(this.floodSurface); this.floodSurface = null; } return; }
    if (this.floodSurface) return;
    const spanWidth = bounds.width - bounds.minX + 20; const spanHeight = bounds.height - bounds.minY + 20;
    const flood = new THREE.Mesh(new THREE.PlaneGeometry(spanWidth, spanHeight), waterMaterialForPool());
    flood.name = 'flood'; flood.rotation.x = -Math.PI / 2;
    flood.position.set((bounds.minX + bounds.width) / 2, .3, (bounds.minY + bounds.height) / 2);
    this.floodSurface = flood; this.scene.add(flood);
  }

  frame(time: number, reduceMotion: boolean): void {
    windUniform.value = reduceMotion ? 0 : time;
    if (this.waterTime) this.waterTime.value = reduceMotion ? 0 : time;
  }

  private disposeRoot(): void {
    if (!this.root) return;
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material !== this.groundMaterial && material !== this.grassMaterial) material.dispose();
      }
    });
    this.root.removeFromParent(); this.root = null;
  }

  dispose(): void {
    this.disposeRoot();
    if (this.trailMesh) { disposeMesh(this.trailMesh); this.trailMesh = null; }
    if (this.floodSurface) { disposeMesh(this.floodSurface); this.floodSurface = null; }
    this.groundMaterial.dispose();
    this.grassMaterial.dispose();
  }
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}
