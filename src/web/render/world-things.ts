/**
 * Everything that stands in the world — built ONLY from the style contract.
 * Simulation objects, Kin, creatures, labels, thumbnails. No look is defined
 * here: shapes and colours come from `style-recipes.ts` or the sim itself.
 */
import * as THREE from 'three';
import type { PublicCalamityKind, PublicKinSnapshot, ShapePart, WorldObject } from '../../shared/types.ts';
import { modernSurfaceMaterial } from './materials.ts';
import {
  LAB, harmonizeLabColor, labBloomColor, labBuilding, labFlowerGeometry, labFlowerMaterial,
  labFowlRig, labHash, labBasket, labBerryShrub, labCaveEntrance, labNameLabel, labQuadruped, labRockGeometry, labRockMaterial, labSleepSprite, labStrawHat, labWearSlotFor,
  makeLabCharacter, makeLabTree, waterMaterialForPool,
  type CharacterRig, type CreatureRig, type LabBuildingPalette, type LabBuildingSpec,
} from './style-recipes.ts';

export const CALAMITY_VISUAL: Record<PublicCalamityKind, { icon: string; title: string; color: string }> = {
  drought: { icon: '◌', title: 'The great drought', color: '#E0B184' },
  coldsnap: { icon: '✣', title: 'The killing cold', color: '#C9E4F5' },
  plague: { icon: '◍', title: 'The spreading sickness', color: '#AFBC90' },
  wildfire: { icon: '△', title: 'Fire loose in the land', color: '#E8845F' },
  flood: { icon: '≈', title: 'The rising waters', color: '#6FC5CE' },
};

export type ObjectSurface = 'natural' | 'cooked' | 'copper' | 'iron' | 'gold' | 'coal' | 'gem' | 'coin';
export function objectSurface(name: string, description = '', loreKnown = false, lore = ''): ObjectSurface {
  const visible = `${name} ${description} ${loreKnown ? lore : ''}`.toLowerCase();
  if (/\bcooked\b|\broasted\b|\bbaked\b|\bsmoked\b/.test(visible)) return 'cooked';
  if (/\bcoin|minted|currency|shilling|token\b/.test(visible)) return 'coin';
  if (/\bcopper\b/.test(visible)) return 'copper';
  if (/\biron\b|\bsilver\b/.test(visible)) return 'iron';
  if (/\bgold\b|\bgolden\b/.test(visible)) return 'gold';
  if (/\bcoal\b/.test(visible)) return 'coal';
  if (/\bgem|jewel|crystal\b/.test(visible)) return 'gem';
  return 'natural';
}

function surfaceMaterial(surface: ObjectSurface): THREE.MeshPhysicalMaterial {
  if (surface === 'cooked') return modernSurfaceMaterial('#C97B5B', { roughness: .82, flatShading: true });
  if (surface === 'copper') return modernSurfaceMaterial('#C08063', { roughness: .58, metalness: .3, flatShading: true });
  if (surface === 'iron') return modernSurfaceMaterial('#9BA5AE', { roughness: .55, metalness: .32, flatShading: true });
  if (surface === 'gold' || surface === 'coin') return modernSurfaceMaterial('#E3B663', { roughness: .48, metalness: .35, flatShading: true });
  if (surface === 'coal') return modernSurfaceMaterial('#3E434C', { roughness: .92, flatShading: true });
  if (surface === 'gem') return modernSurfaceMaterial(LAB.violet, { roughness: .4, clearcoat: .4, clearcoatRoughness: .3, flatShading: true });
  return modernSurfaceMaterial(LAB.sandDeep, { roughness: .78, flatShading: true });
}

function nameHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function materialColor(name: string, random: () => number): string {
  if (/fire|torch|flame|ember|lantern|drill|tinder/i.test(name)) return '#D98A4E';
  if (/stone|rock|flint|chip|hearth/i.test(name)) return LAB.stone;
  if (/reed|basket|woven|fiber|grass|stalk|net/i.test(name)) return '#CDB878';
  if (/wood|branch|log|stick|board|haft|spear|bow/i.test(name)) return LAB.timber;
  if (/metal|iron|bronze|copper/i.test(name)) return '#C09159';
  if (/cloth|garment|robe|cloak|hide/i.test(name)) return '#C08AA0';
  const hues = [LAB.timber, LAB.stone, '#CDB878', '#8FA96B'];
  return hues[Math.floor(random() * hues.length)]!;
}

/** Kin-designed shapes render as gouache boxes; final-form templates arrive in R3. */
export function makeShapedMesh(shape: ShapePart[], scale = 1): THREE.Group {
  const group = new THREE.Group();
  for (const part of shape) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.w * scale, part.h * scale, part.d * scale),
      modernSurfaceMaterial(harmonizeLabColor(part.c), { roughness: .92, flatShading: true }),
    );
    mesh.position.set(part.x * scale, (part.y + part.h / 2) * scale, part.z * scale);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

export function fallbackShape(name: string, kind: 'crafted' | 'structure'): ShapePart[] {
  let hash = nameHash(name) || 1;
  const random = (): number => ((hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995)) >>> 0) / 4294967296;
  const color = materialColor(name, random);
  if (kind === 'structure') {
    const width = 3 + random() * 1.5; const depth = 2.6 + random() * 1.4; const wall = 2 + random() * .6; const thickness = .22;
    return [
      { x: 0, y: 0, z: 0, w: width, h: .12, d: depth, c: '#A9885E' },
      { x: 0, y: .12, z: -depth / 2 + thickness / 2, w: width, h: wall, d: thickness, c: color },
      { x: -width / 2 + thickness / 2, y: .12, z: 0, w: thickness, h: wall, d: depth, c: color },
      { x: width / 2 - thickness / 2, y: .12, z: 0, w: thickness, h: wall, d: depth, c: color },
      { x: -width / 4 - .2, y: .12, z: depth / 2 - thickness / 2, w: width / 2 - .4, h: wall, d: thickness, c: color },
      { x: width / 4 + .2, y: .12, z: depth / 2 - thickness / 2, w: width / 2 - .4, h: wall, d: thickness, c: LAB.roof },
      { x: 0, y: wall + .12, z: 0, w: width + .3, h: .28, d: depth + .3, c: LAB.roof },
    ];
  }
  const parts: ShapePart[] = [];
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) parts.push({
    x: (random() - .5) * .25, y: i * .12, z: (random() - .5) * .25,
    w: .1 + random() * .25, h: .1 + random() * .3, d: .1 + random() * .25,
    c: i === 0 ? color : materialColor(name.split(' ')[i % 2] ?? name, random),
  });
  return parts;
}

function makeCampfire(): THREE.Group {
  const fire = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.11, 0), labRockMaterial());
    stone.position.set(Math.cos(a) * .42, .06, Math.sin(a) * .42);
    stone.scale.y = .7; fire.add(stone);
  }
  for (const r of [.5, -.6]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .55, 6), modernSurfaceMaterial(LAB.timber, { roughness: .9, flatShading: true }));
    log.rotation.z = Math.PI / 2; log.rotation.y = r; log.position.y = .1; fire.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 7), new THREE.MeshBasicMaterial({ color: '#FFAA5E', transparent: true, opacity: .95 }));
  flame.position.y = .32; flame.name = 'flame'; fire.add(flame);
  const light = new THREE.PointLight('#FFB068', 5, 6, 1.8);
  light.position.y = .5; light.name = 'firelight'; fire.add(light);
  return fire;
}

function makeFish(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.16, 9, 7), modernSurfaceMaterial('#6BAFC7', { roughness: .8, flatShading: true }));
  body.scale.set(1.6, .62, .62); body.position.y = .06; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.08, .14, 4), modernSurfaceMaterial('#4F8099', { roughness: .8, flatShading: true }));
  tail.rotation.z = Math.PI / 2; tail.position.set(-.26, .06, 0); tail.name = 'tail'; g.add(tail);
  return g;
}

const CREATURE_KINDS = new Set(['fish', 'deer', 'fowl', 'predator']);
export const isCreatureKind = (kind: string): boolean => CREATURE_KINDS.has(kind);

function makeCreature(object: WorldObject): THREE.Group {
  const p = object.creature;
  const family = p?.family ?? (object.kind === 'fish' ? 'fish' : object.kind === 'fowl' ? 'fowl' : object.kind === 'predator' ? 'wolf' : 'hoofed');
  let rig: CreatureRig | null = null;
  let group: THREE.Group;
  if (family === 'fish') group = makeFish();
  else if (family === 'fowl') { rig = labFowlRig(/mallard|pheasant|quail/i.test(object.name)); group = rig.group; }
  else if (family === 'wolf' || family === 'great-cat') { rig = labQuadruped(family === 'great-cat' ? '#A88665' : '#596473', [.56, .28, .24], .32, p?.young); group = rig.group; }
  else if (family === 'small-game') { rig = labQuadruped('#B6A58D', [.4, .28, .22], .42, p?.young); group = rig.group; }
  else { rig = labQuadruped(/goat|sheep/i.test(object.name) ? '#B6A58D' : /boar/i.test(object.name) ? '#7A6353' : '#8C6C58', [.5, .32, .26], .5, p?.young); group = rig.group; }
  if (rig) group.userData.creatureRig = rig;
  group.userData.creature = p ?? null;
  group.name = 'creature';
  if (p?.kept) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.12, .022, 5, 12), modernSurfaceMaterial(LAB.roofEdge, { roughness: .6 }));
    band.position.y = .5; band.rotation.x = Math.PI / 2; group.add(band);
  }
  return group;
}


const MATERIAL_PALETTES: Record<string, LabBuildingPalette> = {
  wood: { plaster: LAB.plaster, roof: LAB.roof, timber: LAB.timber, accent: LAB.roofEdge },
  stone: { plaster: '#D9D2C0', roof: '#8E9089', timber: '#8C8477', accent: LAB.roofEdge },
  clay: { plaster: '#E8C9A8', roof: '#B0684A', timber: LAB.timber, accent: '#8E4F35' },
  thatch: { plaster: LAB.plaster, roof: '#C2B168', timber: LAB.timber, accent: '#8F8146' },
};

/** The final form a completed build earns. The Kin chose archetype, size,
 *  material, and dye — we give the craftsmanship; the harmonizer keeps the paint. */
function completedStructure(object: WorldObject): THREE.Group | null {
  const spec = object.designSpec;
  if (!spec?.complete || !object.shape?.length) return null;
  const archetype = spec.archetype as LabBuildingSpec['archetype'];
  let minX = 1e9, maxX = -1e9, minY = 0, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const part of object.shape) {
    minX = Math.min(minX, part.x - part.w / 2); maxX = Math.max(maxX, part.x + part.w / 2);
    maxY = Math.max(maxY, part.y + part.h);
    minZ = Math.min(minZ, part.z - part.d / 2); maxZ = Math.max(maxZ, part.z + part.d / 2);
  }
  const base = MATERIAL_PALETTES[spec.material] ?? MATERIAL_PALETTES.wood!;
  const dye = spec.dye ? harmonizeLabColor({
    berry: '#A94F61', ochre: '#B87936', charcoal: '#3E4146', clay: '#A96248',
    indigo: '#4F5F8F', sage: '#6F865C', bone: '#D2C6AA', gold: '#C99B3D',
  }[spec.dye] ?? base.accent) : null;
  const palette: LabBuildingPalette = {
    plaster: harmonizeLabColor(base.plaster),
    roof: harmonizeLabColor(dye && archetype !== 'shrine' ? dye : base.roof),
    timber: harmonizeLabColor(base.timber),
    accent: harmonizeLabColor(dye ?? base.accent),
  };
  const width = Math.max(1.4, maxX - minX - .3);
  const depth = Math.max(1.2, maxZ - minZ - .3);
  const height = Math.max(1.4, maxY - .6);
  const built = labBuilding({ archetype, width, height, depth, palette });
  built.name = 'completed-structure';
  // settlement aura: a finished home gathers life around it — worn earth, stores, firewood
  if (['cottage', 'longhouse', 'hut', 'hall', 'granary', 'well'].includes(archetype)) {
    const aura = new THREE.Group(); aura.name = 'settlement-aura';
    const seed = Math.round(object.pos.x * 53 + object.pos.y * 29);
    const reach = Math.max(width, depth) * .85;
    const earth = new THREE.Mesh(
      new THREE.CircleGeometry(reach + 1.2, 22),
      modernSurfaceMaterial(LAB.sand, { roughness: .96, transparent: true, opacity: .55, gradientStrength: 0 }),
    );
    earth.rotation.x = -Math.PI / 2; earth.position.y = .02; aura.add(earth);
    const timberM = modernSurfaceMaterial(LAB.timber, { roughness: .9, flatShading: true });
    for (let i = 0; i < 2; i++) {
      const angle = labHash(seed, i) * Math.PI * 2;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(.36, .32, .36), modernSurfaceMaterial(LAB.fenceWood, { roughness: .9, flatShading: true }));
      crate.position.set(Math.cos(angle) * (reach + .5), .16, Math.sin(angle) * (reach + .5));
      crate.rotation.y = labHash(seed, i + 7) * .8; crate.castShadow = true; aura.add(crate);
    }
    const woodAngle = labHash(seed, 21) * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .6, 6), timberM);
      log.rotation.z = Math.PI / 2;
      log.position.set(Math.cos(woodAngle) * (reach + .6) + (i % 2) * .05, .08 + Math.floor(i / 2) * .15, Math.sin(woodAngle) * (reach + .6) + (i % 2) * .16);
      log.castShadow = true; aura.add(log);
    }
    built.add(aura);
  }
  return built;
}

const CONTAINER_LOOK = /\b(bag|basket|pouch|sack|satchel|pack|box|chest|crate|barrel|jar|shelf|bin)\b/i;

/** One sim object → one lab-styled mesh. */
export function makeObjectMesh(object: WorldObject, fill = 0): THREE.Object3D {
  if ((object.kind === 'crafted' || object.kind === 'gathered') && CONTAINER_LOOK.test(object.name)) {
    return labBasket(fill);
  }
  if (object.emitsLight) {
    const group = object.shape ? makeShapedMesh(object.shape) : makeCampfire();
    if (object.shape) {
      const glow = new THREE.PointLight('#FFB068', 5, 6, 1.8); glow.position.y = .6; glow.name = 'firelight'; group.add(glow);
    }
    return group;
  }
  if (object.kind === 'structure') {
    const finished = completedStructure(object);
    if (finished) return finished;
  }
  if (object.shape && (object.kind === 'crafted' || object.kind === 'structure' || object.kind === 'gathered')) {
    const shaped = makeShapedMesh(object.shape);
    if (object.kind === 'structure') markRoofParts(shaped);
    return shaped;
  }
  if (object.kind === 'crafted' || object.kind === 'structure') {
    const shaped = makeShapedMesh(fallbackShape(object.name, object.kind));
    if (object.kind === 'structure') markRoofParts(shaped);
    return shaped;
  }
  if (isCreatureKind(object.kind)) return makeCreature(object);
  const group = new THREE.Group();
  const add = (mesh: THREE.Object3D): void => { mesh.traverse((part) => { if (part instanceof THREE.Mesh) part.castShadow = true; }); group.add(mesh); };
  const seed = Math.round(object.pos.x * 31 + object.pos.y * 17);
  switch (object.kind) {
    case 'tree': {
      if (object.yieldLeft !== null && object.yieldLeft <= 0) {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, .3, 7), modernSurfaceMaterial(LAB.timber, { roughness: .9, flatShading: true }));
        stump.position.y = .15; add(stump); break;
      }
      const scale = 1.5 + labHash(seed, 21) * .6;
      add(makeLabTree(scale, seed, labHash(seed, 99) > .55));
      break;
    }
    case 'stone': {
      const spent = object.yieldLeft !== null && object.yieldLeft <= 0;
      const rock = new THREE.Mesh(labRockGeometry(), labRockMaterial());
      const s = 1.4 + labHash(seed, 6) * 1.4;
      rock.scale.set(s, s * (spent ? .3 : .62), s * .85);
      rock.position.y = spent ? .06 : .12;
      rock.rotation.y = labHash(seed, 3) * Math.PI;
      add(rock);
      const surface = objectSurface(object.name, object.description, object.loreDiscovered, object.lore ?? '');
      if (!spent && surface !== 'natural') {
        const fleckMaterial = surfaceMaterial(surface);
        for (let i = 0; i < 4; i++) {
          const fleck = new THREE.Mesh(new THREE.OctahedronGeometry(.03 + labHash(seed, i) * .02, 0), fleckMaterial);
          const angle = labHash(seed + i, i + 19) * Math.PI * 2;
          fleck.position.set(Math.cos(angle) * .3, .16 + labHash(seed + 7, i) * .16, Math.sin(angle) * .3);
          group.add(fleck);
        }
      }
      break;
    }
    case 'water': {
      const water = new THREE.Mesh(new THREE.CircleGeometry(.9, 32), waterMaterialForPool());
      water.rotation.x = -Math.PI / 2; water.position.y = .04; water.name = 'waterpool'; group.add(water);
      for (const [radius, opacity] of [[.86, 1], [.7, .5]] as const) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, .04, 5, 40), new THREE.MeshBasicMaterial({ color: LAB.foam, transparent: opacity < 1, opacity }));
        rim.rotation.x = Math.PI / 2; rim.position.y = .05; rim.scale.z = .4; group.add(rim);
      }
      break;
    }
    case 'plant': {
      if (/berry|berries/i.test(object.name)) {
        const ripe = object.yieldLeft === null || object.yieldLeft > 0;
        add(labBerryShrub(seed, ripe));
        break;
      }
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(.2, 1), modernSurfaceMaterial(LAB.canopyLit, { roughness: .95, flatShading: true }));
      plant.scale.y = 1.3; plant.position.y = .2; plant.name = 'plantbody'; add(plant);
      break;
    }
    case 'flower': {
      const flower = new THREE.Mesh(labFlowerGeometry(), labFlowerMaterial());
      const tint = new THREE.Color(labBloomColor(labHash(seed, 41)));
      flower.scale.setScalar(1.4);
      const colors = flower.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < colors.count; i++) if (colors.getX(i) === 1 && colors.getY(i) === 1 && colors.getZ(i) === 1) colors.setXYZ(i, tint.r, tint.g, tint.b);
      add(flower);
      break;
    }
    case 'gathered': {
      const surface = objectSurface(object.name, object.description, object.loreDiscovered, object.lore ?? '');
      const geometry = surface === 'coin' ? new THREE.CylinderGeometry(.11, .11, .035, 12) : surface === 'gem' ? new THREE.OctahedronGeometry(.13, 0) : new THREE.IcosahedronGeometry(.12, 0);
      const item = new THREE.Mesh(geometry, surfaceMaterial(surface));
      if (surface === 'coin') item.rotation.x = Math.PI / 2;
      item.position.y = .1; add(item);
      break;
    }
    case 'text': {
      const text = new THREE.Mesh(new THREE.BoxGeometry(.32, .42, .06), modernSurfaceMaterial(LAB.plaster, { roughness: .9 }));
      text.position.y = .24; text.rotation.y = -.4; add(text);
      break;
    }
    case 'landmark': {
      if (/cave/i.test(object.name)) {
        const entrance = labCaveEntrance(seed);
        entrance.rotation.y = labHash(seed, 13) * Math.PI * 2;
        add(entrance);
        break;
      }
      const base = new THREE.Mesh(labRockGeometry(), labRockMaterial());
      base.scale.set(5, 2, 4.2); base.position.y = .3; add(base);
      const spire = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 0), labRockMaterial());
      spire.position.y = 1.1; spire.scale.set(.8, 1.7, .8); spire.rotation.y = labHash(seed, 4) * Math.PI; add(spire);
      break;
    }
  }
  return group;
}

function markRoofParts(group: THREE.Group): void {
  const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  const highest = Math.max(...meshes.map((mesh) => mesh.position.y));
  for (const mesh of meshes) if (mesh.position.y >= highest - .34) { mesh.userData.roofPart = true; mesh.name = mesh.name || 'roofPart'; }
}

// ---------- Kin: the lab's chunky character, coloured by lineage ----------
function kinColorOf(kin: PublicKinSnapshot, byId: Map<string, PublicKinSnapshot>, depth = 0): THREE.Color {
  const own = (labHash(kin.name.length * 7, kin.name.charCodeAt(0)) - 0.5) * 0.06;
  const sol = kin.parentSolId ? byId.get(kin.parentSolId) : null;
  const lune = kin.parentLuneId ? byId.get(kin.parentLuneId) : null;
  if (!sol || !lune || depth > 6) {
    return new THREE.Color(kin.gender === 'sol' ? 0xe8845f : 0x6fa7d8).offsetHSL(own, 0, 0);
  }
  return kinColorOf(sol, byId, depth + 1).lerp(kinColorOf(lune, byId, depth + 1), .5).offsetHSL(own, 0, 0);
}
export function kinColorHex(kin: PublicKinSnapshot, byId: Map<string, PublicKinSnapshot>): string {
  return `#${kinColorOf(kin, byId).getHexString()}`;
}

export interface KinBody {
  rig: CharacterRig;
  group: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  animStart: number;
  animDur: number;
  verb: string;
  asleep: boolean;
  kin: PublicKinSnapshot;
  bodySig: string;
}

const HAIR_ROOTS = ['#2A211B', '#4A3527', '#6B4A2F', '#8A6244', '#3B3230'] as const;
function hairColorOf(kin: PublicKinSnapshot, byId: Map<string, PublicKinSnapshot>, depth = 0): THREE.Color {
  const sol = kin.parentSolId ? byId.get(kin.parentSolId) : null;
  const lune = kin.parentLuneId ? byId.get(kin.parentLuneId) : null;
  if (!sol || !lune || depth > 5) {
    const pick = HAIR_ROOTS[Math.floor(labHash(kin.id.length * 7, kin.id.charCodeAt(0)) * HAIR_ROOTS.length)]!;
    return new THREE.Color(pick).offsetHSL(0, 0, (labHash(kin.id.charCodeAt(1) ?? 3, 9) - .5) * .06);
  }
  return hairColorOf(sol, byId, depth + 1).lerp(hairColorOf(lune, byId, depth + 1), .5);
}

/** Day one is bare: a simple wrap in the lineage colour. Clothing is earned (R3).
 *  Every face is its own: eye set, mouth line, and hair inherited from both parents. */
export function makeKinBody(kin: PublicKinSnapshot, byId: Map<string, PublicKinSnapshot>): { rig: CharacterRig; group: THREE.Group } {
  const lineage = kinColorOf(kin, byId);
  const wrap = `#${lineage.clone().lerp(new THREE.Color('#B9A186'), .55).getHexString()}`;
  const skin = `#${new THREE.Color(LAB.skin).offsetHSL((labHash(kin.id.length, kin.id.charCodeAt(0)) - .5) * .04, 0, (labHash(kin.id.length * 3, 7) - .5) * .1).getHexString()}`;
  const rig = makeLabCharacter(wrap, wrap, false, {
    dress: kin.gender === 'lune', ghost: kin.status === 'fading', skin,
    face: {
      eyeSpread: labHash(kin.id.charCodeAt(0), 11),
      eyeHeight: labHash(kin.id.charCodeAt(0), 23),
      mouthCurve: (labHash(kin.id.charCodeAt(0), 37) - .5) * 1.2,
      hairColor: `#${hairColorOf(kin, byId).getHexString()}`,
    },
  });
  const stage = kin.presentation.lifeStage;
  rig.group.scale.setScalar(stage === 'infant' ? .5 : stage === 'child' ? .72 : stage === 'elder' ? .96 : 1.02);
  const label = labNameLabel(kin.name, kin.gender === 'sol' ? '#FFC08A' : '#A9CDF2');
  label.position.y = 1.85;
  rig.group.add(label);
  const zzz = labSleepSprite();
  zzz.name = 'zzz'; zzz.position.set(.3, 1.5, 0); zzz.visible = false;
  rig.group.add(zzz);
  // anchors: earned things attach here — hands for carrying, slots for wearing
  const anchor = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): void => {
    const point = new THREE.Group(); point.name = name; point.position.set(x, y, z); parent.add(point);
  };
  anchor('hand.L', rig.armL, 0, -.36, .06);
  anchor('hand.R', rig.armR, 0, -.36, .06);
  anchor('wear.head', rig.head, 0, .3, 0);
  anchor('wear.face', rig.head, 0, .02, .26);
  anchor('wear.neck', rig.group, 0, .93, 0);
  anchor('wear.torso', rig.group, 0, .6, .21);
  anchor('wear.back', rig.group, 0, .66, -.23);
  anchor('wear.feet', rig.group, 0, .05, .04);
  return { rig, group: rig.group };
}

/** The mesh a carried or worn object earns on the body. */
export function makeOwnedObjectMesh(object: WorldObject): THREE.Object3D {
  if (object.worn && /hat|straw|woven/i.test(`${object.name} ${object.description ?? ''}`)) {
    return labStrawHat();
  }
  if (CONTAINER_LOOK.test(object.name)) {
    const basket = labBasket(0);
    basket.scale.setScalar(.6);
    return basket;
  }
  const mesh = object.shape?.length ? makeShapedMesh(object.shape) : makeShapedMesh(fallbackShape(object.name, 'crafted'));
  mesh.scale.setScalar(object.worn ? .8 : .55);
  return mesh;
}
export { labWearSlotFor };

export function disposeObjectTree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const map = (material as THREE.MeshStandardMaterial).map; if (map) map.dispose();
        material.dispose();
      }
    }
  });
}

// ---------- creation thumbnails for the panels ----------
const THUMBNAIL_SIZE = 132;
let thumbnailRenderer: THREE.WebGLRenderer | null = null;
let thumbnailScene: THREE.Scene | null = null;
let thumbnailCamera: THREE.PerspectiveCamera | null = null;

export function shapeThumbnail(shape: ShapePart[], emitsLight = false): string {
  if (!thumbnailRenderer) {
    thumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbnailRenderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE); thumbnailScene = new THREE.Scene(); thumbnailCamera = new THREE.PerspectiveCamera(38, 1, .01, 50);
    const key = new THREE.DirectionalLight(0xfff4e0, 2.4); key.position.set(2, 3, 2);
    const fill = new THREE.DirectionalLight(0xbcd4ff, .9); fill.position.set(-2, 1, -1.5);
    thumbnailScene.add(key, fill, new THREE.AmbientLight(0xffffff, .55));
  }
  const group = makeShapedMesh(shape);
  if (emitsLight) { const glow = new THREE.PointLight(0xffb457, 1.4, 4); glow.position.set(0, .4, 0); group.add(glow); }
  thumbnailScene!.add(group);
  const box = new THREE.Box3().setFromObject(group); const center = box.getCenter(new THREE.Vector3()); const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, .2);
  const distance = radius / Math.tan(19 * Math.PI / 180) * 1.25;
  thumbnailCamera!.position.set(center.x + distance * .7, center.y + distance * .55, center.z + distance * .7); thumbnailCamera!.lookAt(center);
  thumbnailRenderer.render(thumbnailScene!, thumbnailCamera!); const url = thumbnailRenderer.domElement.toDataURL('image/png'); thumbnailScene!.remove(group);
  group.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  return url;
}
