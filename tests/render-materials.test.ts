import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modernKinMaterial, modernSurfaceMaterial, terrainMaterial, waterMaterial } from '../src/web/render/materials.ts';

describe('gouache material system', () => {
  it('uses matte physical materials shaped into a shared deterministic gouache finish', () => {
    const material = modernSurfaceMaterial('#778899');
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.onBeforeCompile).toBeTypeOf('function');
    expect(material.customProgramCacheKey()).toContain('simura-gouache-v2');
    expect(material.userData.gouache).toBe(true);
    expect(material.userData.toonStrength).toBeGreaterThan(.4);
    expect(material.clearcoat).toBe(0);
    expect(material.roughness).toBeGreaterThan(.85);
    expect(material.specularIntensity).toBeLessThan(.15);
    expect(material.map).toBeNull();
  });

  it('keeps Kin surfaces matte but materially distinct', () => {
    const skin = modernKinMaterial('#CC9988', 'skin');
    const cloth = modernKinMaterial('#445577', 'cloth');
    expect(skin.roughness).toBeLessThan(cloth.roughness);
    expect(skin.roughness).toBeGreaterThanOrEqual(0.48);
    expect(cloth.specularIntensity).toBeLessThan(0.1);
    expect(cloth.userData.toonStrength).toBeGreaterThan(skin.userData.toonStrength as number);
    expect(skin.customProgramCacheKey()).not.toBe(cloth.customProgramCacheKey());
  });

  it('gives terrain vertex color and water a bounded optical response', () => {
    const terrain = terrainMaterial();
    const water = waterMaterial();
    expect(terrain.vertexColors).toBe(true);
    expect(water.transparent).toBe(true);
    expect(water.depthWrite).toBe(false);
    expect(water.clearcoat).toBeLessThanOrEqual(0.5);
    expect(water.roughness).toBeLessThan(terrain.roughness);
    expect(water.userData.waterTime).toMatchObject({ value: 0 });
    expect(water.customProgramCacheKey()).toBe('simura-water-v3');
  });
});
