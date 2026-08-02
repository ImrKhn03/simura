/**
 * THE STYLE CONTRACT — extracted verbatim from the approved style lab.
 * The lab (`src/web/style-lab.ts`) and the live renderer both import these
 * recipes; neither may re-implement them. If the look must change, change it
 * HERE, watch it in the lab, and the world follows automatically.
 */
import * as THREE from 'three';
import { modernSurfaceMaterial } from './materials.ts';

// ---------- the lab palette (verbatim) ----------
export const LAB = {
  paper: '#F3ECD8',
  grassBase: '#7FBD53', grassFresh: '#9CD96B', grassGold: '#D6CC7C', grassDeep: '#549C4C',
  sand: '#EBD49B', sandDeep: '#DDBE7E',
  canopyDeep: '#2E7F44', canopyLit: '#76C24F', canopyGlow: '#BEE47F',
  trunk: '#B98A5F',
  water: '#6FC8D2', foam: '#FFFDF2',
  plaster: '#F7EEDA', timber: '#9A6F49', roof: '#C86A47', roofEdge: '#A9532F',
  stone: '#C2BCA9', fenceWood: '#BE9468',
  skin: '#D9A176', hat: '#EBCF83', shirt: '#F2EAD3', shorts: '#79A659', dress: '#5E8FBC',
  violet: '#9C8FD0', star: '#FFE3A0', danger: '#E2674F',
} as const;

// ---------- the lab light rig (verbatim numbers) ----------
export const LAB_LIGHT = {
  sunColor: '#FFF1CC', sunIntensity: 2.35, shadowIntensity: .78,
  hemiSky: '#BFD9F2', hemiGround: '#D8C79B', hemiIntensity: .65,
  ambientColor: '#EFE6CC', ambientIntensity: .34,
  fogNear: 92, fogFar: 190, exposure: 1.16,
  skyTop: '#4E93D8', skyLow: '#F2E2B8',
} as const;

export function labHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- wind (verbatim): one shared uniform every swaying material rides ----------
export const windUniform = { value: 0 };
export function windy<T extends THREE.MeshPhysicalMaterial>(material: T, strength = .05): T {
  const hook = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    hook(shader, r);
    shader.uniforms.simuraWindTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float simuraWindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
float simuraPh = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 1.3;
#else
float simuraPh = 0.0;
#endif
transformed.x += (sin(simuraWindTime * 1.7 + simuraPh) + sin(simuraWindTime * .93 + simuraPh * 2.3) * .5)
  * smoothstep(0.0, 0.3, position.y) * ${strength.toFixed(3)};`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}:wind${strength}`;
  return material;
}

// ---------- painted ground (verbatim colour pass, minus lab scene specifics) ----------
export function labGroundMaterial(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial('#FFFFFF', { vertexColors: true, roughness: .96, rimStrength: 0, gradientStrength: 0, microStrength: .015, toonStrength: .3 });
}

const GROUND = {
  base: new THREE.Color(LAB.grassBase), fresh: new THREE.Color(LAB.grassFresh),
  gold: new THREE.Color(LAB.grassGold), deep: new THREE.Color(LAB.grassDeep),
};

/** The lab's meadow paint: patchwork of fresh and sun-dried grass, valleys deeper.
 *  Callers layer their scene specifics (shores, paths) on the returned colour. */
export function labMeadowColor(x: number, z: number, h: number, target: THREE.Color): THREE.Color {
  target.copy(GROUND.base);
  const patch = labHash(Math.floor((x + 200) / 4.6), Math.floor((z + 200) / 4.6));
  if (patch > .6) target.lerp(GROUND.fresh, (patch - .6) * 1.6);
  else if (patch < .28) target.lerp(GROUND.gold, (.28 - patch) * 1.35);
  target.lerp(GROUND.deep, THREE.MathUtils.clamp(-h * .35, 0, .5));
  target.offsetHSL(0, 0, (labHash(Math.floor(x * 2.4) + 51, Math.floor(z * 2.4) + 13) - .5) * .02);
  return target;
}

// ---------- trees (verbatim) ----------
let sharedCanopyMaterial: THREE.MeshPhysicalMaterial | null = null;
export function labCanopyMaterial(): THREE.MeshPhysicalMaterial {
  sharedCanopyMaterial ??= modernSurfaceMaterial('#FFFFFF', { vertexColors: true, roughness: .96, flatShading: true, rimStrength: 0, gradientStrength: 0, toonStrength: .35 });
  return sharedCanopyMaterial;
}
let sharedTrunkMaterial: THREE.MeshPhysicalMaterial | null = null;
function trunkMaterial(): THREE.MeshPhysicalMaterial {
  sharedTrunkMaterial ??= modernSurfaceMaterial(LAB.trunk, { roughness: .92, flatShading: true });
  return sharedTrunkMaterial;
}

/** The lab tree, exactly: faceted stacked lobes painted deep → lit → sunny glow. */
export function makeLabTree(scale: number, seed: number, tall: boolean): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(.13 * scale, .2 * scale, (tall ? 1.5 : 1.05) * scale, 7),
    trunkMaterial(),
  );
  trunk.name = 'labTrunk';
  trunk.position.y = (tall ? .75 : .5) * scale; trunk.castShadow = true; g.add(trunk);
  const lobes: THREE.BufferGeometry[] = [];
  const spec: Array<[number, number, number, number]> = tall
    ? [[0, 1.7, 0, .78], [0, 2.35, 0, .58], [0, 2.85, 0, .38], [-.5, 1.5, .1, .42], [.48, 1.62, -.1, .4]]
    : [[0, 1.35, 0, .85], [-.62, 1.18, .08, .5], [.6, 1.22, -.06, .52], [-.25, 1.78, -.1, .5], [.3, 1.82, .08, .46], [0, 1.1, .5, .45]];
  for (let i = 0; i < spec.length; i++) {
    const [x, y, z, r] = spec[i]!;
    const geo = new THREE.IcosahedronGeometry(r * scale * (.93 + labHash(seed, i) * .15), 1);
    geo.scale(1.12, .78 + labHash(i, seed) * .2, 1.04);
    geo.rotateY(labHash(seed + i, i) * Math.PI * 2);
    geo.translate(x * scale, y * scale, z * scale);
    lobes.push(geo);
  }
  let vertexTotal = 0; for (const l of lobes) vertexTotal += l.getAttribute('position').count;
  const position = new Float32Array(vertexTotal * 3); const color = new Float32Array(vertexTotal * 3);
  let offset = 0; let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (const l of lobes) { const p = l.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i)); } }
  const deep = new THREE.Color(LAB.canopyDeep), lit = new THREE.Color(LAB.canopyLit), glow = new THREE.Color(LAB.canopyGlow);
  for (const l of lobes) {
    const p = l.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      position[(offset + i) * 3] = p.getX(i); position[(offset + i) * 3 + 1] = p.getY(i); position[(offset + i) * 3 + 2] = p.getZ(i);
      const t = (p.getY(i) - minY) / (maxY - minY);
      const sunny = 1 - (p.getX(i) - minX) / (maxX - minX);
      const c = deep.clone().lerp(lit, Math.pow(t, 1.25)).lerp(glow, Math.max(0, t - .55) * sunny * 1.1);
      c.offsetHSL((labHash(seed, i) - .5) * .018, 0, (labHash(i, seed + 3) - .5) * .045);
      color[(offset + i) * 3] = c.r; color[(offset + i) * 3 + 1] = c.g; color[(offset + i) * 3 + 2] = c.b;
    }
    offset += p.count;
    l.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  merged.computeVertexNormals();
  const canopy = new THREE.Mesh(merged, labCanopyMaterial());
  canopy.name = 'labCanopy';
  canopy.castShadow = true; canopy.userData.swayPhase = labHash(seed, 5) * Math.PI * 2; g.add(canopy);
  return g;
}

// ---------- meadow tufts (verbatim geometry + material + tint) ----------
export function labGrassGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const leans: Array<[number, number, number]> = [[0, 0, 1], [-.3, .1, .85], [.32, -.06, .8], [.05, .3, .7], [-.12, -.28, .75]];
  for (let b = 0; b < leans.length; b++) {
    const [lx, lz, s] = leans[b]!;
    const blade = new THREE.CapsuleGeometry(.032 * (1 - b * .08), .17 * s, 3, 6);
    blade.scale(1, 1, .55);
    blade.translate(0, .12 * s, 0);
    blade.rotateX(lz * 1.1); blade.rotateZ(-lx * 1.1);
    blade.translate(lx * .09, 0, lz * .09);
    blades.push(blade);
  }
  let vertexTotal = 0; for (const b of blades) vertexTotal += b.getAttribute('position').count;
  const merged = new THREE.BufferGeometry();
  const position = new Float32Array(vertexTotal * 3); const normal = new Float32Array(vertexTotal * 3);
  let offset = 0;
  for (const b of blades) {
    const p = b.getAttribute('position') as THREE.BufferAttribute; const n = b.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      position.set([p.getX(i), p.getY(i), p.getZ(i)], (offset + i) * 3);
      normal.set([n.getX(i), n.getY(i), n.getZ(i)], (offset + i) * 3);
    }
    offset += p.count; b.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return merged;
}

export function labGrassMaterial(): THREE.MeshPhysicalMaterial {
  return windy(modernSurfaceMaterial('#FFFFFF', { roughness: .95, rimStrength: 0, gradientStrength: .18, toonStrength: .3 }), .06);
}

const TUFT = {
  base: new THREE.Color(LAB.grassFresh), gold: new THREE.Color(LAB.grassGold), deep: new THREE.Color(LAB.grassDeep),
};

/** Per-tuft colour, exactly as the lab paints its meadow instances. */
export function labGrassTint(x: number, z: number, i: number, target: THREE.Color): THREE.Color {
  target.copy(TUFT.base);
  const t = labHash(Math.floor((x + 200) / 4.6), Math.floor((z + 200) / 4.6));
  if (t > .6) target.lerp(TUFT.deep, (t - .6) * .9); else if (t < .28) target.lerp(TUFT.gold, (.28 - t) * 1.5);
  target.offsetHSL((labHash(i, 29) - .5) * .02, 0, (labHash(i, 23) - .5) * .09);
  return target;
}

/** Lab tuft placement scale/rotation (verbatim ranges). */
export function labGrassTransform(i: number): { yaw: number; tilt: number; scale: number; stretch: number } {
  return {
    yaw: labHash(i, 11) * Math.PI,
    tilt: (labHash(i, 13) - .5) * .22,
    scale: .85 + labHash(i, 17) * 1,
    stretch: .85 + labHash(i, 19) * .55,
  };
}

// ---------- shrubs + rocks (verbatim shapes and colours) ----------
export function labShrubGeometry(): THREE.BufferGeometry { return new THREE.IcosahedronGeometry(.34, 1); }
export function labShrubColor(k: number, target: THREE.Color): THREE.Color {
  return target.set(LAB.canopyLit).lerp(new THREE.Color(LAB.canopyDeep), k * .7);
}
export function labShrubMaterial(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial('#FFFFFF', { vertexColors: false, roughness: .95, flatShading: true, toonStrength: .4 });
}
export function labRockGeometry(): THREE.BufferGeometry { return new THREE.DodecahedronGeometry(.2, 0); }
export function labRockMaterial(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial(LAB.stone, { roughness: .95, flatShading: true });
}

// ---------- flowers (verbatim proportions/colours, instanced-friendly) ----------
export const LAB_BLOOMS = ['#FDF7E4', '#F2A9C4', '#F5C86E'] as const;
export function labBloomColor(k: number): string {
  return k > .45 ? LAB_BLOOMS[0] : k > .225 ? LAB_BLOOMS[1] : LAB_BLOOMS[2];
}
/** Stem painted in vertex colour, bloom left white so instance tint colours it. */
export function labFlowerGeometry(): THREE.BufferGeometry {
  const stemColor = new THREE.Color(LAB.grassDeep);
  const stem = new THREE.CylinderGeometry(.014, .018, .26, 5);
  stem.translate(0, .13, 0);
  const head = new THREE.SphereGeometry(.055, 7, 5);
  head.scale(1, .72, 1);
  head.translate(0, .28, 0);
  const paint = (geometry: THREE.BufferGeometry, r: number, g: number, b: number): void => {
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  paint(stem, stemColor.r, stemColor.g, stemColor.b);
  paint(head, 1, 1, 1);
  const stems = stem.getAttribute('position').count; const heads = head.getAttribute('position').count;
  const merged = new THREE.BufferGeometry();
  const position = new Float32Array((stems + heads) * 3); const normal = new Float32Array((stems + heads) * 3); const color = new Float32Array((stems + heads) * 3);
  let offset = 0;
  for (const part of [stem, head]) {
    const p = part.getAttribute('position') as THREE.BufferAttribute; const n = part.getAttribute('normal') as THREE.BufferAttribute; const c = part.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      position.set([p.getX(i), p.getY(i), p.getZ(i)], (offset + i) * 3);
      normal.set([n.getX(i), n.getY(i), n.getZ(i)], (offset + i) * 3);
      color.set([c.getX(i), c.getY(i), c.getZ(i)], (offset + i) * 3);
    }
    offset += p.count; part.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return merged;
}
export function labFlowerMaterial(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial('#FFFFFF', { vertexColors: true, roughness: .85, rimStrength: 0 });
}

// ---------- atmosphere (verbatim from the lab): time × weather colour math ----------
export type LabTimeOfDay = 'noon' | 'dusk' | 'night' | 'dawn';
export type LabWeather = 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
export type LabSeason = 'summer' | 'autumn' | 'winter' | 'spring';

export const LAB_TIME: Record<LabTimeOfDay, { sunPos: [number, number, number]; sunColor: string; sunI: number; hemiI: number; ambI: number; skyTop: string; skyLow: string; fog: string; fogNear: number; fogFar: number; night: number }> = {
  noon: { sunPos: [-26, 34, 18], sunColor: '#FFF1CC', sunI: 2.35, hemiI: .65, ambI: .34, skyTop: '#4E93D8', skyLow: '#F2E2B8', fog: '#F3ECD8', fogNear: 92, fogFar: 190, night: 0 },
  dusk: { sunPos: [-36, 11, 6], sunColor: '#FFC489', sunI: 1.6, hemiI: .42, ambI: .3, skyTop: '#7A97C9', skyLow: '#F5B57E', fog: '#F0CFA0', fogNear: 80, fogFar: 172, night: 0 },
  night: { sunPos: [30, 24, -14], sunColor: '#BFD2EE', sunI: .38, hemiI: .22, ambI: .24, skyTop: '#182644', skyLow: '#31446E', fog: '#2C3B60', fogNear: 58, fogFar: 150, night: 1 },
  dawn: { sunPos: [30, 13, 14], sunColor: '#FFD9A8', sunI: 1.45, hemiI: .45, ambI: .3, skyTop: '#6FA0CE', skyLow: '#F2D7A8', fog: '#EFD9B4', fogNear: 84, fogFar: 176, night: 0 },
};
export const LAB_SEASON_TINT: Record<LabSeason, { ground: string; grass: string; canopy: string }> = {
  summer: { ground: '#FFFFFF', grass: '#FFFFFF', canopy: '#FFFFFF' },
  autumn: { ground: '#F2D9A8', grass: '#EFCD92', canopy: '#E8B470' },
  winter: { ground: '#DDE4E0', grass: '#CBD6CE', canopy: '#C2D2C4' },
  spring: { ground: '#EFFADC', grass: '#E4F7C9', canopy: '#DCF2B4' },
};

export interface LabAtmosphere {
  sunPos: [number, number, number]; sunColor: string; sunI: number; hemiI: number; ambI: number;
  skyTop: THREE.Color; skyLow: THREE.Color; fog: THREE.Color; fogNear: number; fogFar: number;
  night: number; starNight: number; glow: number; cloudColor: string; cloudOpacity: number;
}

/** The lab's atmosphere math, verbatim: base time preset mixed by weather. */
export function labAtmosphere(timeOfDay: LabTimeOfDay, weather: LabWeather): LabAtmosphere {
  const base = LAB_TIME[timeOfDay];
  let sunI = base.sunI;
  const skyTop = new THREE.Color(base.skyTop);
  const skyLow = new THREE.Color(base.skyLow);
  const fog = new THREE.Color(base.fog);
  let fogNear = base.fogNear, fogFar = base.fogFar;
  let cloudOpacity = .92, cloudColor = '#FFF9E6';
  if (weather === 'rain' || weather === 'storm') {
    const grey = new THREE.Color(weather === 'storm' ? '#8A939B' : '#AEB9BD');
    skyTop.lerp(grey, .75); skyLow.lerp(grey, .5); fog.lerp(grey, .55);
    sunI *= weather === 'storm' ? .32 : .55;
    fogNear *= .6; fogFar *= .62;
    cloudColor = weather === 'storm' ? '#7E878E' : '#C9CFC9'; cloudOpacity = .96;
  } else if (weather === 'snow') {
    const pale = new THREE.Color('#E8EAE2');
    skyTop.lerp(pale, .6); skyLow.lerp(pale, .4); fog.lerp(pale, .5);
    sunI *= .7; fogNear *= .7; fogFar *= .72; cloudColor = '#EFF1EA';
  } else if (weather === 'fog') {
    const pale = new THREE.Color('#E4E0D0');
    skyTop.lerp(pale, .7); skyLow.lerp(pale, .55); fog.lerp(pale, .6);
    sunI *= .6; fogNear = 14; fogFar = 52;
  }
  return {
    sunPos: base.sunPos, sunColor: base.sunColor, sunI, hemiI: base.hemiI, ambI: base.ambI,
    skyTop, skyLow, fog, fogNear, fogFar,
    night: base.night, starNight: base.night * (weather === 'clear' ? 1 : .25),
    glow: weather === 'clear' ? 1 : .25,
    cloudColor, cloudOpacity: timeOfDay === 'night' ? .12 : cloudOpacity,
  };
}

// ---------- sky · stars · moon · fireflies · precipitation · clouds (verbatim) ----------
export interface LabSkyUniforms { top: { value: THREE.Color }; low: { value: THREE.Color }; sun: { value: THREE.Vector3 }; glow: { value: number } }
export function labSkyUniforms(): LabSkyUniforms {
  return { top: { value: new THREE.Color(LAB_LIGHT.skyTop) }, low: { value: new THREE.Color(LAB_LIGHT.skyLow) }, sun: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 1 } };
}
export function labSkyDome(uniforms: LabSkyUniforms, radius = 240): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top; uniform vec3 low; uniform vec3 sun; uniform float glow; varying vec3 vDir;
      void main(){
        float h=clamp(vDir.y*.5+.5,0.,1.);
        vec3 col=mix(low, top, smoothstep(.5,.88,h));
        float d=max(dot(normalize(vDir),sun),0.);
        col+=vec3(1.,.95,.78)*pow(d,90.)*.8*glow+vec3(1.,.93,.72)*pow(d,6.)*.12*glow;
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  dome.renderOrder = -1;
  return dome;
}
export function labStars(): THREE.Points {
  const pts: number[] = [];
  for (let i = 0; i < 320; i++) { const a = labHash(i, 1) * Math.PI * 2; const b = labHash(i, 2) * Math.PI * .46; pts.push(Math.cos(a) * Math.cos(b) * 200, Math.sin(b) * 200 + 8, Math.sin(a) * Math.cos(b) * 200); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#F2ECD8', size: 1.1, transparent: true, opacity: 0, fog: false }));
}
export function labMoon(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: '#F2EFE2', transparent: true, opacity: 0, fog: false }));
  m.position.set(60, 46, -80); m.lookAt(0, 0, 0); return m;
}
export function labFireflies(spread = 46): THREE.Points {
  const pts: number[] = [];
  for (let i = 0; i < 70; i++) pts.push((labHash(i, 5) - .5) * spread, 0, (labHash(5, i) - .5) * spread);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFE9A8', size: .16, transparent: true, opacity: 0, fog: false }));
}
export function labPrecipitation(count: number, color: string, size: number): THREE.Points {
  const pts: number[] = [];
  for (let i = 0; i < count; i++) pts.push((labHash(i, 7) - .5) * 80, labHash(7, i) * 26, (labHash(i, 11) - .5) * 80);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .75 }));
  p.visible = false; return p;
}
export function labCloudClusters(material: THREE.MeshBasicMaterial): THREE.Group[] {
  const clusters: THREE.Group[] = [];
  for (let c = 0; c < 6; c++) {
    const cluster = new THREE.Group();
    const lobeCount = 4 + Math.floor(labHash(c, 3) * 3);
    for (let l = 0; l < lobeCount; l++) {
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + labHash(c, l) * 2.2, 1), material);
      lobe.scale.set(1.9, .55, 1);
      lobe.position.set((l - lobeCount / 2) * 2.6, labHash(l, c) * .8 - Math.abs(l - lobeCount / 2) * .35, labHash(c * 3, l) * 1.4);
      cluster.add(lobe);
    }
    const angle = c / 6 * Math.PI * 2 + .4;
    cluster.position.set(Math.cos(angle) * (46 + labHash(c, 9) * 40), 26 + labHash(c, 11) * 9, Math.sin(angle) * (46 + labHash(c, 9) * 40));
    clusters.push(cluster);
  }
  return clusters;
}

// ---------- paper sprites (verbatim): labels, speech, sleep ----------
export function labCanvasSprite(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale * (w / h), scale, 1);
  return sprite;
}
export function labNameLabel(text: string, color: string): THREE.Sprite {
  return labCanvasSprite((ctx, w, h) => {
    ctx.font = '600 44px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(62,54,40,.85)'; ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }, 256, 80, .34);
}
export function labSpeechBubble(text: string): THREE.Sprite {
  return labCanvasSprite((ctx, w, h) => {
    ctx.fillStyle = 'rgba(251,246,232,.95)';
    ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 22, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(120,106,78,.4)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - 10, h - 17); ctx.lineTo(w / 2 + 10, h - 17); ctx.lineTo(w / 2, h - 4); ctx.fill();
    ctx.font = '500 30px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3A3B33';
    ctx.fillText(text, w / 2, (h - 16) / 2 + 2);
  }, 360, 110, .62);
}

// ---------- characters (verbatim): the chunky lab rig ----------
export interface CharacterRig {
  group: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  body: THREE.Mesh; head: THREE.Group; eyeL?: THREE.Mesh; eyeR?: THREE.Mesh;
}
/** The lab character, v2: feet planted at exactly zero, mitten hands, a quiet
 *  face (eyes, blush, mouth), soft warm skin edge — a person, not a peg. */
export interface LabFace { eyeSpread?: number; eyeHeight?: number; mouthCurve?: number; hairColor?: string }
export function makeLabCharacter(shirt: string, bottoms: string, hat: boolean, options: { dress?: boolean; ghost?: boolean; skin?: string; face?: LabFace } = {}): CharacterRig {
  const g = new THREE.Group();
  const fade = (m: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial => {
    if (options.ghost) { m.transparent = true; m.opacity = .42; }
    return m;
  };
  const skinM = fade(modernSurfaceMaterial(options.skin ?? LAB.skin, { roughness: .88, toonStrength: .42, rimColor: '#FFDFC2', rimStrength: .05, microStrength: .004 }));
  const shirtM = fade(modernSurfaceMaterial(shirt, { roughness: .96, toonStrength: .5, gradientStrength: .05, microStrength: .022 }));
  const legM = fade(modernSurfaceMaterial(bottoms, { roughness: .96, toonStrength: .5, microStrength: .022 }));
  const inkM = fade(modernSurfaceMaterial('#3A2C22', { roughness: .5, gradientStrength: 0, microStrength: 0 }));
  const rig = {} as CharacterRig;
  const shadow = (mesh: THREE.Mesh): THREE.Mesh => { mesh.castShadow = !options.ghost; return mesh; };
  // legs end in real feet whose soles touch exactly y = 0
  for (const side of [-1, 1] as const) {
    const hip = new THREE.Group(); hip.position.set(side * .1, .36, 0);
    const leg = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.062, .16, 4, 8), skinM));
    leg.position.y = -.15; hip.add(leg);
    const foot = shadow(new THREE.Mesh(new THREE.SphereGeometry(.082, 10, 7), skinM));
    foot.scale.set(1.1, .5, 1.5); foot.position.set(0, -.315, .045); hip.add(foot);
    g.add(hip);
    if (side < 0) rig.legL = hip; else rig.legR = hip;
  }
  const body = options.dress
    ? shadow(new THREE.Mesh(new THREE.ConeGeometry(.3, .62, 12), legM))
    : shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.21, .3, 6, 12), shirtM));
  body.position.y = options.dress ? .6 : .58; body.scale.z = .82; body.userData.baseY = body.position.y; g.add(body);
  rig.body = body;
  if (!options.dress) {
    const shorts = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.2, .1, 5, 12), legM));
    shorts.position.y = .4; shorts.scale.set(1, .7, .84); g.add(shorts);
  }
  // arms end in mitten hands
  for (const side of [-1, 1] as const) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .26, .76, 0);
    const arm = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.055, .26, 4, 8), skinM));
    arm.position.y = -.15; shoulder.add(arm);
    const hand = shadow(new THREE.Mesh(new THREE.SphereGeometry(.062, 9, 7), skinM));
    hand.position.y = -.32; shoulder.add(hand);
    shoulder.rotation.z = side * .26;
    g.add(shoulder);
    if (side < 0) rig.armL = shoulder; else rig.armR = shoulder;
  }
  const neck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .09, 8), skinM));
  neck.position.y = .93; g.add(neck);
  const head = new THREE.Group(); head.position.y = 1.08;
  const skull = shadow(new THREE.Mesh(new THREE.SphereGeometry(.24, 18, 14), skinM));
  skull.scale.set(1, .95, .92); head.add(skull);
  for (const side of [-1, 1] as const) {
    const ear = shadow(new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), skinM));
    ear.scale.set(.5, 1, .7); ear.position.set(side * .235, -.01, 0); head.add(ear);
  }
  // the quiet face: eyes that blink, warm cheeks, the smallest mouth
  const face = options.face ?? {};
  const eyeX = .07 + (face.eyeSpread ?? .5) * .034;
  const eyeY = .002 + ((face.eyeHeight ?? .5) - .5) * .03;
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 6), inkM);
    eye.scale.z = .5; eye.position.set(side * eyeX, eyeY, .208);
    head.add(eye);
    if (side < 0) rig.eyeL = eye; else rig.eyeR = eye;
  }
  const blushM = fade(modernSurfaceMaterial('#E8A98F', { roughness: .9, gradientStrength: 0, microStrength: 0 }));
  for (const side of [-1, 1] as const) {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(.032, 7, 5), blushM);
    blush.scale.set(1.1, .6, .35); blush.position.set(side * .135, -.055, .185); head.add(blush);
  }
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .034, 3, 6), fade(modernSurfaceMaterial('#B06B4C', { roughness: .8, gradientStrength: 0, microStrength: 0 })));
  mouth.rotation.z = Math.PI / 2 + (face.mouthCurve ?? 0) * .3;
  mouth.position.set(0, -.095, .215); head.add(mouth);
  const hairM = fade(modernSurfaceMaterial(face.hairColor ?? '#4A3527', { roughness: .95 }));
  const hair = shadow(new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5), hairM));
  hair.position.y = .035; head.add(hair);
  const hairBack = shadow(new THREE.Mesh(new THREE.SphereGeometry(.245, 14, 9, 0, Math.PI * 2, Math.PI * .42, Math.PI * .26), hairM));
  hairBack.position.set(0, .03, -.03); head.add(hairBack);
  if (hat) {
    const straw = fade(modernSurfaceMaterial(LAB.hat, { roughness: .94, flatShading: true }));
    const brim = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.42, .45, .035, 14), straw));
    brim.position.y = .16; brim.rotation.x = .05; head.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 7, 0, Math.PI * 2, 0, Math.PI * .45), straw);
    crown.position.y = .14; crown.scale.y = .8; head.add(crown);
  }
  g.add(head);
  rig.head = head;
  rig.group = g;
  return rig;
}
export function labWalkCycle(rig: CharacterRig, t: number, moving: boolean, rate = 7, amplitude = 1): void {
  const swing = moving ? Math.sin(t * rate) * amplitude : 0;
  rig.legL.rotation.x = swing * .55;
  rig.legR.rotation.x = -swing * .55;
  rig.armL.rotation.x = -swing * .4;
  rig.armR.rotation.x = swing * .4;
  rig.group.position.y += moving ? Math.abs(Math.cos(t * rate)) * .035 * amplitude : 0;
  rig.head.rotation.z = Math.sin(t * .9) * .04 * amplitude;
  // life at rest: a slow breath and the occasional blink
  const baseY = rig.body.userData.baseY as number | undefined;
  if (baseY !== undefined) rig.body.position.y = baseY + (moving ? 0 : Math.sin(t * 1.6) * .008 * amplitude);
  if (rig.eyeL && rig.eyeR) {
    const blink = Math.sin(t * 1.31 + Math.sin(t * .37) * 2) > .975 ? .12 : 1;
    rig.eyeL.scale.y = blink; rig.eyeR.scale.y = blink;
  }
}

// ---------- creatures (verbatim): painted quadruped + fowl ----------
export interface CreatureRig { group: THREE.Group; head?: THREE.Group; legs: THREE.Group[]; tail?: THREE.Group; wings: THREE.Group[] }
export function labQuadruped(furColor: string, bodyScale: [number, number, number], neckUp: number, young = false): CreatureRig {
  const fur = modernSurfaceMaterial(furColor, { roughness: .9, flatShading: true });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), fur);
  body.scale.set(...bodyScale); body.position.y = .52; body.castShadow = true; g.add(body);
  const neck = new THREE.Group(); neck.position.set(bodyScale[0] * .82, .62, 0); neck.rotation.z = -neckUp; g.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .3, 4, 8), fur);
  neckMesh.position.y = .16; neck.add(neckMesh);
  const head = new THREE.Group(); head.position.y = .38; neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), fur); skull.castShadow = true; head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), fur);
  muzzle.scale.set(1.3, .6, .8); muzzle.position.set(.13, -.03, 0); head.add(muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.045, .12, 5), fur);
    ear.position.set(-.02, .14, side * .08); head.add(ear);
  }
  const legs: THREE.Group[] = [];
  for (const [sx, sz] of [[.6, .5], [.6, -.5], [-.6, .5], [-.6, -.5]] as const) {
    const hip = new THREE.Group(); hip.position.set(bodyScale[0] * sx, .42, bodyScale[2] * sz * .8);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .3, 4, 6), fur);
    leg.position.y = -.2; leg.castShadow = true; hip.add(leg);
    g.add(hip); legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(-bodyScale[0] * .95, .6, 0);
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .16, 3, 6), fur);
  tailMesh.position.y = .08; tailMesh.rotation.z = -.7; tail.add(tailMesh); g.add(tail);
  if (young) g.scale.setScalar(.58);
  return { group: g, head: neck, legs, tail, wings: [] };
}
export function labFowlRig(dark: boolean): CreatureRig {
  const feather = modernSurfaceMaterial(dark ? '#53606A' : '#D7DEE3', { roughness: .9, flatShading: true });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.17, 10, 8), feather);
  body.scale.set(1, 1.18, .9); body.position.y = .25; body.castShadow = true; g.add(body);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(0, .28, side * .12);
    const wingMesh = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), feather);
    wingMesh.scale.set(1.2, 1, .3); wingMesh.position.z = side * .02; wing.add(wingMesh);
    g.add(wing); wings.push(wing);
  }
  const head = new THREE.Group(); head.position.set(.07, .43, 0);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.085, 9, 7), feather));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.035, .1, 5), modernSurfaceMaterial('#D58D4A', { roughness: .6 }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(.11, 0, 0); head.add(beak);
  g.add(head);
  return { group: g, head, legs: [], wings };
}

/** The lab pond's water surface, verbatim. */
export function waterMaterialForPool(): THREE.MeshPhysicalMaterial {
  return modernSurfaceMaterial(LAB.water, { roughness: .38, specularIntensity: .3, transparent: true, opacity: .92, rimStrength: 0, toonStrength: .4, gradientStrength: 0 });
}

// ---------- the paint envelope: any colour a Kin invents becomes paint ----------
/** Hue is identity and survives; saturation and lightness are pulled into the
 *  gouache envelope so nothing a mind invents can ever leave the style. */
export function harmonizeLabColor(color: THREE.ColorRepresentation): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(hsl.s, .58), THREE.MathUtils.clamp(hsl.l, .32, .84));
  return `#${c.getHexString()}`;
}

// ---------- buildings: the final forms Kin work earns ----------
/** A SOLID gabled roof — one closed prism, flat-shaded. No floating slabs, no gaps. */
export function gabledRoofGeometry(width: number, depth: number, rise: number, overhang = .5): THREE.BufferGeometry {
  const hw = width / 2 + overhang; const hd = depth / 2 + overhang;
  const a = [-hw, 0, -hd]; const b = [hw, 0, -hd]; const c = [hw, 0, hd]; const d = [-hw, 0, hd];
  const r1 = [-hw, rise, 0]; const r2 = [hw, rise, 0];
  const faces: number[][] = [
    a, b, r2, a, r2, r1,          // back slope
    d, r1, r2, d, r2, c,          // front slope
    a, r1, d,                      // left gable
    b, c, r2,                      // right gable
    a, d, c, a, c, b,              // underside
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface LabBuildingPalette { plaster: string; roof: string; timber: string; accent: string }
export interface LabBuildingSpec {
  archetype: 'cottage' | 'longhouse' | 'hut' | 'hall' | 'granary' | 'wall' | 'tower' | 'shrine' | 'well' | 'fence';
  width: number; height: number; depth: number;
  palette: LabBuildingPalette;
}

/** The redesigned finished building: plinth, plaster body, timber bones, one
 *  solid overhanging roof, framed door and windows. Roof meshes are named and
 *  flagged so the camera can fade them to peek inside. */
export function labBuilding(spec: LabBuildingSpec): THREE.Group {
  const { width: w, height: h, depth: d, palette } = spec;
  const group = new THREE.Group();
  const plaster = modernSurfaceMaterial(palette.plaster, { roughness: .94, microStrength: .02 });
  const timber = modernSurfaceMaterial(palette.timber, { roughness: .9, flatShading: true });
  const roofM = modernSurfaceMaterial(palette.roof, { roughness: .92, flatShading: true });
  const accent = modernSurfaceMaterial(palette.accent, { roughness: .88 });
  const stone = labRockMaterial();
  const solid = (mesh: THREE.Mesh): THREE.Mesh => { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  const roofPart = (mesh: THREE.Mesh): THREE.Mesh => { mesh.userData.roofPart = true; mesh.name = mesh.name || 'roofPart'; return mesh; };

  if (spec.archetype === 'fence') {
    for (const x of [-w / 2, 0, w / 2]) {
      const post = solid(new THREE.Mesh(new THREE.CylinderGeometry(.06, .075, h, 6), timber)); post.position.set(x, h / 2, 0);
    }
    for (const y of [h * .4, h * .78]) {
      const rail = solid(new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, w + .2, 5), timber));
      rail.rotation.z = Math.PI / 2; rail.position.y = y;
    }
    return group;
  }
  if (spec.archetype === 'wall') {
    const base = solid(new THREE.Mesh(new THREE.BoxGeometry(w, .22, d + .1), stone)); base.position.y = .11;
    const run = solid(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster)); run.position.y = .22 + h / 2;
    const cap = solid(new THREE.Mesh(new THREE.BoxGeometry(w + .16, .14, d + .2), roofM)); cap.position.y = .22 + h + .07; roofPart(cap);
    return group;
  }
  if (spec.archetype === 'well') {
    const ring = solid(new THREE.Mesh(new THREE.CylinderGeometry(w * .5, w * .55, .5, 10), stone)); ring.position.y = .25;
    for (const side of [-1, 1]) {
      const post = solid(new THREE.Mesh(new THREE.BoxGeometry(.12, h, .12), timber)); post.position.set(side * w * .42, h / 2 + .4, 0);
    }
    const roof = solid(new THREE.Mesh(gabledRoofGeometry(w * 1.1, w * .8, .5, .18), roofM)); roof.position.y = h + .4; roofPart(roof);
    return group;
  }
  if (spec.archetype === 'tower') {
    const body = solid(new THREE.Mesh(new THREE.CylinderGeometry(w * .42, w * .55, h, 9), stone)); body.position.y = h / 2;
    const band = solid(new THREE.Mesh(new THREE.CylinderGeometry(w * .48, w * .48, .18, 9), timber)); band.position.y = h * .62;
    const cap = solid(new THREE.Mesh(new THREE.ConeGeometry(w * .58, w * .8, 9), roofM)); cap.position.y = h + w * .4; roofPart(cap);
    return group;
  }
  if (spec.archetype === 'shrine') {
    const plinth = solid(new THREE.Mesh(new THREE.BoxGeometry(w, .3, d), stone)); plinth.position.y = .15;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = solid(new THREE.Mesh(new THREE.BoxGeometry(.14, h, .14), timber)); post.position.set(sx * (w / 2 - .16), h / 2 + .3, sz * (d / 2 - .16));
    }
    const roof = solid(new THREE.Mesh(gabledRoofGeometry(w, d, .62, .3), roofM)); roof.position.y = h + .3; roofPart(roof);
    const heart = solid(new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0), accent)); heart.position.y = h * .55;
    const glow = new THREE.PointLight(LAB.violet, .5, 3.4, 2); glow.name = 'sacredGlow'; glow.position.y = h * .6; group.add(glow);
    return group;
  }

  // homes and halls: cottage · longhouse · hut · hall · granary
  const raised = spec.archetype === 'granary' ? .34 : 0;
  if (raised > 0) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const staddle = solid(new THREE.Mesh(new THREE.ConeGeometry(.16, raised, 6), stone)); staddle.position.set(sx * (w / 2 - .3), raised / 2, sz * (d / 2 - .3));
  }
  const plinth = solid(new THREE.Mesh(new THREE.BoxGeometry(w + .14, .18, d + .14), stone)); plinth.position.y = raised + .09;
  const body = solid(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster)); body.position.y = raised + .18 + h / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const post = solid(new THREE.Mesh(new THREE.BoxGeometry(.18, h, .18), timber)); post.position.set(sx * w / 2, raised + .18 + h / 2, sz * d / 2);
  }
  const rise = Math.max(.9, w * .3);
  const roof = solid(new THREE.Mesh(gabledRoofGeometry(w, d, rise, .5), roofM));
  roof.name = 'labRoof'; roof.position.y = raised + .18 + h + .04; roofPart(roof); // lifted a hair — never coplanar with the wall top
  const ridge = solid(new THREE.Mesh(new THREE.BoxGeometry(w + 1.06, .12, .22), timber)); ridge.position.y = raised + .18 + h + rise + .04; roofPart(ridge);
  const door = solid(new THREE.Mesh(new THREE.BoxGeometry(.78, 1.42, .1), timber)); door.position.set(-w * .12, raised + .18 + .71, d / 2 + .04);
  const knob = solid(new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), accent)); knob.position.set(-w * .12 + .26, raised + .18 + .72, d / 2 + .1);
  const windows = Math.max(1, Math.round(w / 2.6));
  for (let i = 0; i < windows; i++) {
    const x = (i + 1) / (windows + 1) * w - w / 2 + w * .12;
    const frame = solid(new THREE.Mesh(new THREE.BoxGeometry(.66, .66, .08), timber)); frame.position.set(x, raised + .18 + h * .62, d / 2 + .03);
    const glass = solid(new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .1), modernSurfaceMaterial('#BFDCE8', { roughness: .4, specularIntensity: .4 })));
    glass.name = 'windowGlass'; glass.position.set(x, raised + .18 + h * .62, d / 2 + .04);
  }
  if (spec.archetype === 'cottage' || spec.archetype === 'hall') {
    const chimney = solid(new THREE.Mesh(new THREE.BoxGeometry(.44, rise + .8, .44), stone));
    chimney.position.set(w / 4, raised + .18 + h + (rise + .8) / 2 - .2, -d / 4); roofPart(chimney);
  }
  return group;
}

// ---------- verbs made visible: every deed has a body ----------
export type LabPose = 'idle' | 'work' | 'gather' | 'pray' | 'dance' | 'carry' | 'speak' | 'fear' | 'rest';

/** Which pose a sim verb earns. Movement wins; the walk cycle handles it. */
export function labPoseForVerb(verb: string, moving: boolean): LabPose {
  if (moving) return 'idle';
  if (/craft|build|refine_skill|cook|write|heal|mine/.test(verb)) return 'work';
  if (/gather|plant|bury|fish/.test(verb)) return 'gather';
  if (/pray|ritual/.test(verb)) return 'pray';
  if (/dance|play|sing/.test(verb)) return 'dance';
  if (/carry|give|trade/.test(verb)) return 'carry';
  if (/speak|teach|net_answer/.test(verb)) return 'speak';
  if (/flee|sickened|wildfire|predator|hurt/.test(verb)) return 'fear';
  if (/rest|reflect/.test(verb)) return 'rest';
  return 'idle';
}

/** The lab's verb pantomime, applied over the walk cycle's neutral stance. */
export function labVerbPose(rig: CharacterRig, pose: LabPose, t: number, motion = 1): void {
  switch (pose) {
    case 'work':
      rig.armR.rotation.x = (-1 + Math.sin(t * 6.5) * .75) * motion;
      rig.armL.rotation.x = -.15 * motion;
      rig.body.rotation.x = .08 * motion;
      break;
    case 'gather':
      rig.body.rotation.x = .38 * motion;
      rig.head.rotation.x = .3 * motion;
      rig.armL.rotation.x = (-.9 + Math.sin(t * 3.2) * .25) * motion;
      rig.armR.rotation.x = (-.9 + Math.sin(t * 3.2 + 1.4) * .25) * motion;
      break;
    case 'pray':
      rig.body.rotation.x = .3 * motion;
      rig.head.rotation.x = .42 * motion;
      rig.armL.rotation.x = -1.15 * motion; rig.armR.rotation.x = -1.15 * motion;
      rig.armL.rotation.z = -.5; rig.armR.rotation.z = .5;
      break;
    case 'dance':
      rig.group.rotation.z = Math.sin(t * 4) * .14 * motion;
      rig.group.position.y += Math.abs(Math.sin(t * 5)) * .1 * motion;
      rig.armL.rotation.x = Math.sin(t * 5) * 1 * motion;
      rig.armR.rotation.x = -Math.sin(t * 5) * 1 * motion;
      break;
    case 'carry':
      rig.armL.rotation.x = -1.05; rig.armR.rotation.x = -1.05;
      break;
    case 'speak':
      rig.head.rotation.x = Math.sin(t * 6) * .06 * motion;
      rig.armR.rotation.x = (-.5 + Math.sin(t * 3) * .3) * motion;
      break;
    case 'fear':
      rig.body.rotation.x = -.14 * motion;
      rig.armL.rotation.x = -1.3; rig.armR.rotation.x = -1.3;
      rig.head.rotation.x = -.18 * motion;
      break;
    case 'rest':
      rig.body.rotation.x = .16;
      rig.head.rotation.z = Math.sin(t * .8) * .06 * motion;
      break;
    default:
      rig.body.rotation.x = 0;
      rig.head.rotation.x = 0;
  }
}

/** The little paper "z z z" that floats over a sleeper. */
export function labSleepSprite(): THREE.Sprite {
  return labCanvasSprite((ctx, w, h) => {
    ctx.font = '700 44px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(62,54,40,.5)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#F6EFDC';
    ctx.fillText('z z z', w / 2, h / 2);
  }, 200, 90, .5);
}

// ---------- worn and carried: what a Kin earns, the body shows ----------
export type LabWearSlot = 'wear.head' | 'wear.face' | 'wear.neck' | 'wear.torso' | 'wear.back' | 'wear.feet';
export function labWearSlotFor(name: string, description = ''): LabWearSlot {
  const text = `${name} ${description}`.toLowerCase();
  return /hat|cap|crown|hood|wreath/.test(text) ? 'wear.head'
    : /mask|veil/.test(text) ? 'wear.face'
      : /necklace|scarf|amulet|pendant/.test(text) ? 'wear.neck'
        : /cloak|pack|quiver/.test(text) ? 'wear.back'
          : /boot|shoe|sandal/.test(text) ? 'wear.feet' : 'wear.torso';
}

/** The crafted straw hat — the icon a Kin earns by weaving, never given free. */
export function labStrawHat(): THREE.Group {
  const hat = new THREE.Group(); hat.name = 'strawHat';
  const straw = modernSurfaceMaterial(LAB.hat, { roughness: .94, flatShading: true });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(.42, .45, .035, 14), straw);
  brim.rotation.x = .05; brim.castShadow = true; hat.add(brim);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 7, 0, Math.PI * 2, 0, Math.PI * .45), straw);
  crown.position.y = -.02; crown.scale.y = .8; hat.add(crown);
  return hat;
}

/** A cave mouth that grew, not one that was drawn: piled faceted boulders,
 *  two leaning jambs and a lintel forming the arch, a recessed dark throat,
 *  moss on the crown and rubble at the feet. */
export function labCaveEntrance(seed: number): THREE.Group {
  const cave = new THREE.Group(); cave.name = 'cave-entrance';
  const rock = labRockMaterial();
  const mossy = modernSurfaceMaterial('#8FAF7A', { roughness: .95, flatShading: true });
  const boulder = (x: number, y: number, z: number, s: number, squash = .78, material: THREE.Material = rock): THREE.Mesh => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), material);
    b.position.set(x, y, z);
    b.scale.set(1 + (labHash(seed, x * 7 + z) - .5) * .3, squash, 1 + (labHash(seed, z * 5 + x) - .5) * .3);
    b.rotation.set(labHash(seed, x + 1) * .6, labHash(seed, z + 2) * Math.PI * 2, labHash(seed, x + z) * .5);
    b.castShadow = true; b.receiveShadow = true;
    cave.add(b);
    return b;
  };
  // the mound: a pile, not a dome
  boulder(0, .9, -.7, 1.55, .85);
  boulder(-1.25, .6, -.2, 1.05);
  boulder(1.3, .55, -.35, 1.15);
  boulder(-.5, 1.55, -.9, .95, .7);
  boulder(.65, 1.5, -.8, .9, .72);
  boulder(0, 2, -1.05, .85, .62, mossy);
  // the arch: two leaning jambs and a lintel
  const jambL = boulder(-.72, .55, .78, .62, 1.2); jambL.rotation.z = .3;
  const jambR = boulder(.7, .55, .8, .6, 1.25); jambR.rotation.z = -.32;
  const lintel = boulder(0, 1.28, .72, .72, .5); lintel.rotation.z = .08;
  // the throat: recessed darkness with depth, never a painted-on hole
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(.52, .62, 1.3, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: '#211D18', side: THREE.BackSide }),
  );
  throat.rotation.x = Math.PI / 2 - .12;
  throat.position.set(0, .52, .35);
  cave.add(throat);
  const deep = new THREE.Mesh(new THREE.CircleGeometry(.5, 10), new THREE.MeshBasicMaterial({ color: '#15120E' }));
  deep.position.set(0, .48, -.25); deep.rotation.x = -.1;
  cave.add(deep);
  // rubble and growth at the feet
  for (let i = 0; i < 5; i++) {
    const a = labHash(seed, i + 40) * Math.PI - Math.PI / 2;
    boulder(Math.sin(a) * (1.7 + labHash(seed, i) * .6), .12, Math.cos(a) * (1.5 + labHash(seed, i + 3) * .7), .18 + labHash(seed, i + 9) * .16);
  }
  const tuft = new THREE.Mesh(labGrassGeometry(), labGrassMaterial());
  tuft.position.set(-.4, 2.3, -1); tuft.scale.setScalar(1.6);
  cave.add(tuft);
  return cave;
}

/** The berry bush, exactly as the lab grows it: deep shrub, bright berries.
 *  Picked clean (`ripe: false`), only the bare bush remains. */
export function labBerryShrub(seed: number, ripe = true): THREE.Group {
  const group = new THREE.Group(); group.name = 'berry-shrub';
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 1), modernSurfaceMaterial(LAB.canopyDeep, { roughness: .95, flatShading: true }));
  bush.scale.y = .72; bush.position.y = .28; bush.castShadow = true;
  group.add(bush);
  if (ripe) {
    const berryM = modernSurfaceMaterial('#E2674F', { roughness: .7 });
    for (let i = 0; i < 9; i++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(.05, 7, 5), berryM);
      const a = labHash(i + seed, 61) * Math.PI * 2;
      const b = labHash(61, i + seed) * Math.PI - Math.PI / 2;
      berry.position.set(Math.cos(a) * Math.cos(b) * .58, .32 + Math.sin(b) * .38, Math.sin(a) * Math.cos(b) * .5);
      group.add(berry);
    }
  }
  return group;
}

/** A woven basket — the world's containers, with a hint of what it holds. */
export function labBasket(fill = 0): THREE.Group {
  const group = new THREE.Group(); group.name = 'basket';
  const weave = modernSurfaceMaterial('#C9A86B', { roughness: .95, flatShading: true, microStrength: .03 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.24, .18, .26, 9, 1, true), weave);
  body.position.y = .13; body.castShadow = true; group.add(body);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .03, 9), weave);
  base.position.y = .015; group.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.24, .028, 6, 12), modernSurfaceMaterial('#A9885E', { roughness: .92, flatShading: true }));
  rim.rotation.x = Math.PI / 2; rim.position.y = .27; group.add(rim);
  const bumps = Math.min(3, fill);
  const keptM = modernSurfaceMaterial(LAB.sandDeep, { roughness: .85, flatShading: true });
  for (let i = 0; i < bumps; i++) {
    const kept = new THREE.Mesh(new THREE.SphereGeometry(.07, 7, 5), keptM);
    kept.position.set((i - 1) * .09, .27, (i % 2) * .07 - .03);
    group.add(kept);
  }
  return group;
}
