import * as THREE from 'three';
import { ART } from './art-direction.ts';

/** 0 = day, 1 = deep night. LightingRig drives this; every gouache material listens. */
export const SIMURA_NIGHT = { value: 0 };

export interface SurfaceFinish {
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  gradientStrength?: number;
  microStrength?: number;
  toonStrength?: number;
}

/**
 * SIMURA's gouache finish — the "Summer Afternoon" look. Matte, high-key,
 * hand-painted: no specular ping, a soft two-step light ramp, shadows lifted
 * and tinted warm like paint on paper, and a whisper of paper grain.
 * It rides the stock lighting path, so shadows, fog and tone mapping behave
 * like ordinary three.js materials.
 */
export function enhanceSurface<T extends THREE.MeshPhysicalMaterial>(material: T, finish: SurfaceFinish = {}): T {
  const rimColor = new THREE.Color(finish.rimColor ?? ART.paper.bright);
  const rimStrength = finish.rimStrength ?? 0.0;
  const gradientStrength = finish.gradientStrength ?? 0.04;
  const microStrength = finish.microStrength ?? 0.014;
  const toonStrength = finish.toonStrength ?? 0.55;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.simuraRimColor = { value: rimColor };
    shader.uniforms.simuraRimStrength = { value: rimStrength };
    shader.uniforms.simuraGradientStrength = { value: gradientStrength };
    shader.uniforms.simuraMicroStrength = { value: microStrength };
    shader.uniforms.simuraToonStrength = { value: toonStrength };
    shader.uniforms.simuraShadowTint = { value: new THREE.Color('#C7B9C9') };
    shader.uniforms.simuraNight = SIMURA_NIGHT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSimuraWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSimuraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSimuraWorld;
uniform vec3 simuraRimColor;
uniform float simuraRimStrength;
uniform float simuraGradientStrength;
uniform float simuraMicroStrength;
uniform float simuraToonStrength;
uniform vec3 simuraShadowTint;
uniform float simuraNight;
float simuraHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}`)
      .replace('#include <opaque_fragment>', `
float simuraLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
// gouache ramp: lift the darks, keep the lights flat — two soft paint steps.
// The ramp fades out in true darkness so night still reads as night.
float simuraFlat = 0.34
  + smoothstep(0.14, 0.34, simuraLuma) * 0.38
  + smoothstep(0.5, 0.95, simuraLuma) * 0.42;
float simuraGain = simuraFlat / max(simuraLuma, 0.045);
simuraGain = mix(1.0, simuraGain, smoothstep(0.035, 0.16, simuraLuma));
outgoingLight = mix(outgoingLight, outgoingLight * simuraGain, simuraToonStrength);
// shadows read as paint, not darkness: warm lavender by day, moonlit blue by night
float simuraShade = 1.0 - smoothstep(0.06, 0.5, simuraLuma);
vec3 simuraShadowPaint = mix(simuraShadowTint, vec3(0.66, 0.72, 0.95), simuraNight);
outgoingLight = mix(outgoingLight, outgoingLight * simuraShadowPaint * 1.35, simuraShade * mix(0.4, 0.55, simuraNight));
// hand-painted vertical wash — tops catch the sun a touch more
float simuraVertical = smoothstep(-0.6, 2.0, vSimuraWorld.y);
outgoingLight *= mix(1.0 - simuraGradientStrength, 1.0 + simuraGradientStrength, simuraVertical);
// paper grain
float simuraMicro = simuraHash(floor(vSimuraWorld.xz * 16.0) + floor(vSimuraWorld.y * 9.0));
outgoingLight *= 1.0 + (simuraMicro - 0.5) * simuraMicroStrength;
// optional cream rim — a sunlit edge, used sparingly
float simuraFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
outgoingLight += simuraRimColor * pow(1.0 - simuraFacing, 3.0) * simuraRimStrength;
#include <opaque_fragment>`);
  };
  material.userData.gouache = true;
  material.userData.toonStrength = toonStrength;
  material.customProgramCacheKey = () => `simura-gouache-v2:${rimColor.getHexString()}:${rimStrength}:${gradientStrength}:${microStrength}:${toonStrength}`;
  return material;
}

export function modernSurfaceMaterial(
  color: THREE.ColorRepresentation,
  finish: SurfaceFinish & THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  const { rimColor, rimStrength, gradientStrength, microStrength, toonStrength, ...parameters } = finish;
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.94,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.9,
    specularIntensity: 0.06,
    envMapIntensity: 0.45,
    ...parameters,
  });
  return enhanceSurface(material, { rimColor, rimStrength, gradientStrength, microStrength, toonStrength });
}

export function modernKinMaterial(color: THREE.ColorRepresentation, kind: 'skin' | 'cloth'): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial(color, kind === 'skin'
    ? { roughness: 0.88, specularIntensity: 0.05, rimStrength: 0, gradientStrength: 0.03, microStrength: 0.006, toonStrength: .42 }
    : { roughness: 0.97, specularIntensity: 0.02, rimStrength: 0, gradientStrength: 0.045, microStrength: 0.012, toonStrength: .58 });
}

export function terrainMaterial(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial('#FFFFFF', {
    vertexColors: true,
    roughness: 0.96,
    specularIntensity: 0.03,
    rimStrength: 0,
    gradientStrength: 0.02,
    microStrength: 0.02,
    toonStrength: .3,
  });
}

export function waterMaterial(opacity = 0.86): THREE.MeshPhysicalMaterial {
  const material = modernSurfaceMaterial(ART.water.shallow, {
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    specularIntensity: 0.25,
    rimColor: ART.water.foam,
    rimStrength: 0.14,
    gradientStrength: 0.02,
    microStrength: 0.01,
    toonStrength: .5,
  });
  const surfaceHook = material.onBeforeCompile;
  const time = { value: 0 };
  material.onBeforeCompile = (shader, renderer) => {
    surfaceHook(shader, renderer);
    shader.uniforms.simuraWaterTime = time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float simuraWaterTime;')
      .replace('#include <opaque_fragment>', `
float simuraStreak = sin(vSimuraWorld.x * .32 + simuraWaterTime * .42 + sin(vSimuraWorld.z * .55 + simuraWaterTime * .2) * 1.4)
  + sin(vSimuraWorld.z * .21 - simuraWaterTime * .3) * .5;
float simuraCrest = smoothstep(1.32, 1.5, simuraStreak);
outgoingLight += outgoingLight * simuraCrest * .5 + vec3(.035) * simuraCrest;
#include <opaque_fragment>`);
  };
  material.userData.waterTime = time;
  material.customProgramCacheKey = () => 'simura-water-v3';
  return material;
}
