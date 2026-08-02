/**
 * STYLE LAB v3 — the complete living target scene for SIMURA's visual direction.
 * Dev-only. Uses the production gouache material system, so the approved look
 * ports 1:1 into the live renderer. Covers the full SIMURA vocabulary:
 * time of day, weather, seasons, creatures, kin states, verbs, structures.
 */
import * as THREE from 'three';
import { modernSurfaceMaterial } from './render/materials.ts';
import {
  LAB as P, LAB_LIGHT, labBuilding, labHash as hash, windy, windUniform,
  makeLabTree, labCanopyMaterial, labGroundMaterial, labMeadowColor,
  labGrassGeometry, labGrassMaterial, labGrassTint, labGrassTransform,
  makeLabCharacter as makeCharacter, labWalkCycle as walkCycle, labVerbPose, labBerryShrub, type CharacterRig,
} from './render/style-recipes.ts';

const easeOutBack = (t: number): number => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

// ---------- terrain ----------
const POND = { x: 14, z: 6, r: 7.5 };
const PATH: Array<[number, number]> = [[-2, 30], [-3, 18], [-1, 8], [3, 0], [4, -8], [0, -14], [-6, -18]];

function pathDistance(x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i]!; const [bx, bz] = PATH[i + 1]!;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
const SEGMENT_LENGTHS = PATH.slice(0, -1).map(([ax, az], i) => Math.hypot(PATH[i + 1]![0] - ax, PATH[i + 1]![1] - az));
const PATH_LENGTH = SEGMENT_LENGTHS.reduce((a, b) => a + b, 0);
function pathPoint(distance: number): { x: number; z: number; heading: number } {
  let d = ((distance % PATH_LENGTH) + PATH_LENGTH) % PATH_LENGTH;
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    if (d <= SEGMENT_LENGTHS[i]!) {
      const [ax, az] = PATH[i]!; const [bx, bz] = PATH[i + 1]!;
      const t = d / SEGMENT_LENGTHS[i]!;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    d -= SEGMENT_LENGTHS[i]!;
  }
  return { x: PATH[0]![0], z: PATH[0]![1], heading: 0 };
}

function ground(x: number, z: number): number {
  let h = Math.sin(x * .07) * Math.cos(z * .06) * 1.1 + Math.sin(x * .16 + 2) * .35 + Math.cos(z * .13 + 1) * .3;
  h += Math.sin((x + z) * .045) * .8;
  h -= Math.exp(-((x - POND.x) ** 2 + (z - POND.z) ** 2) / (POND.r * POND.r)) * 2.6;
  const path = pathDistance(x, z);
  if (path < 2.2) h = h * .35 + (h * .65) * (path / 2.2);
  return h;
}

const app = document.getElementById('lab')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LAB_LIGHT.exposure;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(P.paper);
scene.fog = new THREE.Fog(P.paper, LAB_LIGHT.fogNear, LAB_LIGHT.fogFar);

// ---------- lights (driven by the atmosphere system below) ----------
const sun = new THREE.DirectionalLight(LAB_LIGHT.sunColor, LAB_LIGHT.sunIntensity);
sun.position.set(-26, 34, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -46; sun.shadow.camera.right = 46; sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
sun.shadow.bias = -.0004; sun.shadow.normalBias = .06;
sun.shadow.intensity = LAB_LIGHT.shadowIntensity;
scene.add(sun, sun.target);
const hemisphere = new THREE.HemisphereLight(LAB_LIGHT.hemiSky, LAB_LIGHT.hemiGround, LAB_LIGHT.hemiIntensity);
const ambient = new THREE.AmbientLight(LAB_LIGHT.ambientColor, LAB_LIGHT.ambientIntensity);
scene.add(hemisphere, ambient);

// ---------- sky dome ----------
const skyUniforms = {
  top: { value: new THREE.Color('#4E93D8') },
  low: { value: new THREE.Color('#F2E2B8') },
  sun: { value: sun.position.clone().normalize() },
  glow: { value: 1 },
};
{
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
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
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), material));
}

// ---------- stars · moon · fireflies · precipitation ----------
const stars = (() => {
  const pts: number[] = [];
  for (let i = 0; i < 320; i++) { const a = hash(i, 1) * Math.PI * 2; const b = hash(i, 2) * Math.PI * .46; pts.push(Math.cos(a) * Math.cos(b) * 200, Math.sin(b) * 200 + 8, Math.sin(a) * Math.cos(b) * 200); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#F2ECD8', size: 1.1, transparent: true, opacity: 0, fog: false }));
  scene.add(p); return p;
})();
const moon = (() => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: '#F2EFE2', transparent: true, opacity: 0, fog: false }));
  m.position.set(60, 46, -80); m.lookAt(0, 0, 0); scene.add(m); return m;
})();
const fireflies = (() => {
  const pts: number[] = [];
  for (let i = 0; i < 70; i++) pts.push((hash(i, 5) - .5) * 46, 0, (hash(5, i) - .5) * 46);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFE9A8', size: .16, transparent: true, opacity: 0, fog: false }));
  scene.add(p); return p;
})();
function precipitation(count: number, color: string, size: number): THREE.Points {
  const pts: number[] = [];
  for (let i = 0; i < count; i++) pts.push((hash(i, 7) - .5) * 80, hash(7, i) * 26, (hash(i, 11) - .5) * 80);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .75 }));
  p.visible = false; scene.add(p); return p;
}
const rain = precipitation(1100, '#BCCCDF', .09);
const snow = precipitation(750, '#FDFAF0', .16);

// ---------- painted ground ----------
const groundMaterial = labGroundMaterial();
{
  const size = 130, seg = 260;
  const geometry = new THREE.PlaneGeometry(size, size, seg, seg);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const sand = new THREE.Color(P.sand); const sandDeep = new THREE.Color(P.sandDeep);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    const h = ground(x, z);
    pos.setZ(i, h);
    labMeadowColor(x, z, h, c);
    const pd = pathDistance(x, z);
    if (pd < 1.9) c.lerp(pd < 1.1 ? sandDeep.clone().lerp(sand, hash(Math.floor(x * 2), Math.floor(z * 2)) * .8) : sand, THREE.MathUtils.smoothstep(1.9 - pd, 0, 1.4));
    const pondDist = Math.hypot(x - POND.x, z - POND.z);
    if (pondDist < POND.r * 1.25 && pondDist > POND.r * .62) c.lerp(sand, THREE.MathUtils.smoothstep(1 - Math.abs(pondDist - POND.r * .93) / (POND.r * .32), 0, 1) * .9);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, groundMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- pond ----------
const foamRims: THREE.Mesh[] = [];
{
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r * .92, 40),
    modernSurfaceMaterial(P.water, { roughness: .38, specularIntensity: .3, transparent: true, opacity: .92, rimStrength: 0, toonStrength: .4, gradientStrength: 0 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, -.78, POND.z);
  scene.add(water);
  for (const [radius, tube, opacity] of [[POND.r * .9, .1, 1], [POND.r * .78, .05, .5]] as const) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 60), new THREE.MeshBasicMaterial({ color: P.foam, transparent: opacity < 1, opacity }));
    rim.rotation.x = Math.PI / 2; rim.position.set(POND.x, -.74, POND.z); rim.scale.z = .4;
    foamRims.push(rim); scene.add(rim);
  }
}

// ---------- trees ----------
const canopies: THREE.Mesh[] = [];
const canopyMaterial = labCanopyMaterial();
function makeTree(scale: number, seed: number, tall: boolean): THREE.Group {
  const tree = makeLabTree(scale, seed, tall);
  canopies.push(tree.getObjectByName('labCanopy') as THREE.Mesh);
  return tree;
}

const TREES: Array<[number, number, number, boolean]> = [
  [-14, -6, 2, false], [-19, 4, 1.55, true], [-9, 14, 1.9, false], [8, 20, 1.6, true],
  [19, -7, 2.1, false], [24, 14, 1.7, false], [-24, -14, 1.8, true], [12, -21, 1.5, false],
  [-4, -25, 2, true], [28, -2, 1.5, true], [-28, 12, 1.9, false], [2, 34, 1.8, false],
  [22, 26, 1.85, false], [-16, 26, 1.5, true], [34, 10, 1.75, false], [-34, -4, 1.6, false],
  [-13, -18, 1.7, false], [7, 12, 1.45, false],
];
for (let i = 0; i < TREES.length; i++) {
  const [x, z, s, tall] = TREES[i]!;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) continue;
  const tree = makeTree(s, i * 7 + 3, tall);
  tree.position.set(x, ground(x, z) - .05, z);
  tree.rotation.y = hash(i, 9) * Math.PI * 2;
  scene.add(tree);
}

// ---------- shrubs + rocks ----------
for (let i = 0; i < 22; i++) {
  const x = (hash(i, 31) - .5) * 70, z = (hash(31, i) - .5) * 70;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1 || pathDistance(x, z) < 2) continue;
  if (hash(i, 77) > .5) {
    const shrub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.34 + hash(i, 5) * .3, 1),
      modernSurfaceMaterial(new THREE.Color(P.canopyLit).lerp(new THREE.Color(P.canopyDeep), hash(i, 8) * .7), { roughness: .95, flatShading: true, toonStrength: .4 }),
    );
    shrub.scale.y = .62; shrub.position.set(x, ground(x, z) + .1, z); shrub.castShadow = true;
    scene.add(shrub);
  } else {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.2 + hash(i, 6) * .3, 0),
      modernSurfaceMaterial(P.stone, { roughness: .95, flatShading: true }),
    );
    rock.position.set(x, ground(x, z) + .06, z); rock.rotation.set(hash(i, 1) * 3, hash(i, 2) * 3, 0);
    rock.scale.set(1, .62, .85); rock.castShadow = true;
    scene.add(rock);
  }
}

// ---------- soft meadow tufts ----------
const grassMaterial = labGrassMaterial();
{
  const merged = labGrassGeometry();
  const COUNT = 9000;
  const mesh = new THREE.InstancedMesh(merged, grassMaterial, COUNT);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
  const tint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < COUNT * 3 && placed < COUNT; i++) {
    const x = (hash(i, 101) - .5) * 84, z = (hash(101, i) - .5) * 84;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.18 || pathDistance(x, z) < 1.55) continue;
    const y = ground(x, z);
    const t = labGrassTransform(i);
    e.set(0, t.yaw, t.tilt);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y + .01, z), q, new THREE.Vector3(t.scale, t.scale * t.stretch, t.scale));
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, labGrassTint(x, z, i, tint));
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

// ---------- flowers ----------
for (let i = 0; i < 90; i++) {
  const x = (hash(i, 301) - .5) * 70, z = (hash(301, i) - .5) * 70;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.2 || pathDistance(x, z) < 1.8) continue;
  const y = ground(x, z);
  const f = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.014, .018, .26, 5), modernSurfaceMaterial(P.grassDeep, { roughness: .9 }));
  stem.position.y = .13; f.add(stem);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.055, 7, 5),
    modernSurfaceMaterial(hash(i, 41) > .45 ? '#FDF7E4' : (hash(i, 43) > .5 ? '#F2A9C4' : '#F5C86E'), { roughness: .8 }),
  );
  head.scale.y = .72; head.position.y = .28; f.add(head);
  f.position.set(x, y, z);
  f.scale.setScalar(.8 + hash(i, 47) * .7);
  scene.add(f);
}

// ---------- shared building materials ----------
const plasterM = modernSurfaceMaterial(P.plaster, { roughness: .94, microStrength: .02, side: THREE.DoubleSide });
const woodM = modernSurfaceMaterial(P.timber, { roughness: .9, flatShading: true });
const roofM = modernSurfaceMaterial(P.roof, { roughness: .92, flatShading: true });
const fenceM = modernSurfaceMaterial(P.fenceWood, { roughness: .92, flatShading: true });
const windowGlassM = modernSurfaceMaterial('#BFDCE8', { roughness: .4, specularIntensity: .4 });

// ---------- the finished cottage (the contract's final form, solid roof) ----------
{
  const house = labBuilding({
    archetype: 'cottage', width: 5.6, height: 2.5, depth: 4.4,
    palette: { plaster: P.plaster, roof: P.roof, timber: P.timber, accent: P.roofEdge },
  });
  house.position.set(-8, ground(-8, -13) + .05, -13);
  house.rotation.y = .9;
  scene.add(house);
}

// ---------- fence ----------
{
  const fence = new THREE.Group();
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i]!; const [bx, bz] = PATH[i + 1]!;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t + 2.6, z = az + (bz - az) * t;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, .62, 6), fenceM);
      post.position.set(x, ground(x, z) + .3, z); post.rotation.z = (hash(i, s) - .5) * .12; post.castShadow = true;
      fence.add(post);
      const nx = ax + (bx - ax) * ((s + 1) / steps) + 2.6, nz = az + (bz - az) * ((s + 1) / steps);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(.042, .042, 2.25, 5), fenceM);
      rail.position.set((x + nx) / 2, ground((x + nx) / 2, (z + nz) / 2) + .47, (z + nz) / 2);
      rail.rotation.z = Math.PI / 2;
      rail.rotation.y = -Math.atan2(nz - z, nx - x);
      fence.add(rail);
    }
  }
  scene.add(fence);
}

// ---------- lamp post (lit at night) ----------
const lampLight = new THREE.PointLight('#FFDf9E', 0, 8, 1.6);
const lampBulbM = new THREE.MeshBasicMaterial({ color: '#FFE9B0' });
{
  const iron = modernSurfaceMaterial('#5C6A5E', { roughness: .8, flatShading: true });
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 2.6, 7), iron);
  pole.position.y = 1.3; pole.castShadow = true; lamp.add(pole);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(.4, .035, 6, 12, Math.PI / 2), iron);
  arm.position.set(0, 2.6, 0); arm.rotation.z = Math.PI; lamp.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), lampBulbM);
  bulb.position.set(-.4, 2.56, 0); lamp.add(bulb);
  lampLight.position.set(-.4, 2.5, 0); lamp.add(lampLight);
  lamp.position.set(3.2, ground(3.2, 2), 2);
  scene.add(lamp);
}

// ---------- text sprites: labels · speech bubbles · zzz ----------
function canvasSprite(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale * (w / h), scale, 1);
  return sprite;
}
function nameLabel(text: string, color: string): THREE.Sprite {
  return canvasSprite((ctx, w, h) => {
    ctx.font = '600 44px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(62,54,40,.85)'; ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }, 256, 80, .34);
}
function speechBubble(text: string): THREE.Sprite {
  return canvasSprite((ctx, w, h) => {
    ctx.fillStyle = 'rgba(251,246,232,.95)';
    ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 22, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(120,106,78,.4)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - 10, h - 17); ctx.lineTo(w / 2 + 10, h - 17); ctx.lineTo(w / 2, h - 4); ctx.fill();
    ctx.font = '500 30px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3A3B33';
    ctx.fillText(text, w / 2, (h - 16) / 2 + 2);
  }, 360, 110, .62);
}
const zzz = canvasSprite((ctx, w, h) => {
  ctx.font = '700 52px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,252,240,.9)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#6A7C9E';
  ctx.fillText('z Z z', w / 2, h / 2);
}, 200, 90, .42);

// ---------- character rig ----------
// characters come from the style contract — no local copies, ever

// walker with a name label + speech bubble
const walker = makeCharacter(P.shirt, P.shorts, true);
walker.group.scale.setScalar(1.05);
const walkerLabel = nameLabel('Kip', '#FFC08A'); walkerLabel.position.y = 1.85; walker.group.add(walkerLabel);
const bubble = speechBubble('what a fine afternoon…'); bubble.position.y = 2.35; bubble.visible = false; walker.group.add(bubble);
scene.add(walker.group);
// star-carrier stroller: cradles a glowing star (lovely at night)
const stroller = makeCharacter('#E8B27D', '#8A5A3E', false);
const strollerLabel = nameLabel('Mora', '#A9CDF2'); strollerLabel.position.y = 1.8; stroller.group.add(strollerLabel);
const star = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: P.star }));
star.position.set(0, .68, .26); stroller.group.add(star);
const starLight = new THREE.PointLight(P.star, .9, 3); star.add(starLight);
scene.add(stroller.group);
// the kid by the pond
const child = makeCharacter(P.dress, P.dress, false, { dress: true });
child.group.position.set(POND.x - 5.6, ground(POND.x - 5.6, POND.z + 2.4), POND.z + 2.4);
child.group.rotation.y = Math.atan2(5.6, -2.4);
child.group.scale.setScalar(.78);
scene.add(child.group);
// the infant, wobbling by the cottage door
const infant = makeCharacter('#F2D9B8', '#F2D9B8', false);
infant.group.position.set(-5.4, ground(-5.4, -10.6), -10.6);
infant.group.scale.setScalar(.45);
scene.add(infant.group);
// the elder, stooped, resting by the market
const elder = makeCharacter('#D9CBB4', '#6E6A54', false);
elder.group.position.set(6.4, ground(6.4, 14.6), 14.6);
elder.group.rotation.y = -2.2;
elder.body.rotation.x = .14;
elder.head.position.y = 1.02; elder.head.rotation.x = .12;
scene.add(elder.group);
// the sleeper by the campfire + drifting zzz
const sleeper = makeCharacter('#C9B8D9', '#7A6E8A', false);
sleeper.group.position.set(-5.2, ground(-5.2, -7.2) + .18, -7.2);
sleeper.group.rotation.set(-Math.PI / 2 + .12, .6, 0);
zzz.position.set(-5.2, ground(-5.2, -7.2) + 1, -7.2);
scene.add(sleeper.group, zzz);
// the fading one, standing at the grave — half in this world
const ghost = makeCharacter('#D8D8CB', '#D8D8CB', false, { ghost: true });
ghost.group.position.set(-16.6, ground(-16.6, 17.2), 17.2);
ghost.group.rotation.y = .8;
scene.add(ghost.group);

// ---------- particles ----------
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; age: number; grow: number }
const particles: Particle[] = [];
const particleGeometry = new THREE.TetrahedronGeometry(.05, 0);
function burst(at: THREE.Vector3, color: string, count: number, speed: number, lift: number, life = .8, grow = 0): void {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(particleGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92 }));
    const a = (i / count) * Math.PI * 2 + Math.random();
    mesh.position.copy(at).add(new THREE.Vector3(Math.cos(a) * .1, Math.random() * .12, Math.sin(a) * .1));
    scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3(Math.cos(a) * speed, lift + Math.random() * lift, Math.sin(a) * speed), life, age: 0, grow });
  }
}
function stepParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.age += dt;
    if (p.age >= p.life) { p.mesh.removeFromParent(); (p.mesh.material as THREE.Material).dispose(); particles.splice(i, 1); continue; }
    p.velocity.y -= dt * (p.grow > 0 ? .2 : 2.2);
    p.mesh.position.addScaledVector(p.velocity, dt);
    const t = p.age / p.life;
    const s = p.grow > 0 ? 1 + t * p.grow : Math.max(.05, 1 - t);
    p.mesh.scale.setScalar(s);
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = .92 * (1 - t);
  }
}

// ---------- construction site ----------
const SITE = { x: 15, z: -12, w: 4.6, d: 3.6, wall: 2.1 };
const buildStages: THREE.Group[] = [];
const builder = makeCharacter('#D9C9A2', '#6E8A52', true);
{
  const site = new THREE.Group();
  const { w, d, wall } = SITE;
  const s0 = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + .4, .18, d + .4), modernSurfaceMaterial(P.stone, { roughness: .95, flatShading: true }));
  slab.position.y = .09; slab.receiveShadow = true; s0.add(slab);
  s0.add(...[[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([cx, cz]) => {
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(.3, .26, .3), woodM);
    anchor.position.set(cx!, .3, cz!); return anchor;
  }));
  const s1 = new THREE.Group();
  for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.2, wall, .2), woodM);
    post.position.set(cx, wall / 2 + .18, cz); post.castShadow = true; s1.add(post);
  }
  for (const side of [-1, 1]) {
    const beamW = new THREE.Mesh(new THREE.BoxGeometry(w, .16, .16), woodM);
    beamW.position.set(0, wall + .2, side * d / 2); s1.add(beamW);
    const beamD = new THREE.Mesh(new THREE.BoxGeometry(.16, .16, d), woodM);
    beamD.position.set(side * w / 2, wall + .2, 0); s1.add(beamD);
    const diag = new THREE.Mesh(new THREE.BoxGeometry(.1, wall * 1.12, .1), woodM);
    diag.position.set(side * w / 4, wall / 2 + .18, d / 2); diag.rotation.z = side * .5; s1.add(diag);
  }
  const s2 = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w - .12, wall - .08, d - .12), plasterM);
  walls.position.y = wall / 2 + .16; walls.castShadow = true; s2.add(walls);
  const doorway = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.4, .12), woodM);
  doorway.position.set(.5, .88, d / 2 - .02); s2.add(doorway);
  const s3 = new THREE.Group();
  for (const side of [-1, 1]) {
    const slabRoof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, .14, d * .72), roofM);
    slabRoof.position.set(0, wall + .82, side * d * .26);
    slabRoof.rotation.x = side * -.6; slabRoof.castShadow = true; s3.add(slabRoof);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, .18, .26), modernSurfaceMaterial(P.roofEdge, { roughness: .9 }));
  ridge.position.y = wall + 1.26; s3.add(ridge);
  for (const stage of [s0, s1, s2, s3]) { stage.visible = false; site.add(stage); buildStages.push(stage); }
  const pile = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, .09, .26), woodM);
    plank.position.set(w / 2 + 1, .08 + i * .1, -.4 + (hash(i, 2) - .5) * .3);
    plank.rotation.y = (hash(i, 3) - .5) * .3; plank.castShadow = true; pile.add(plank);
  }
  site.add(pile);
  site.position.set(SITE.x, ground(SITE.x, SITE.z) + .02, SITE.z);
  site.rotation.y = -.35;
  scene.add(site);
  builder.group.position.set(SITE.x - 3.4, ground(SITE.x - 3.4, SITE.z - 1), SITE.z - 1);
  builder.group.rotation.y = 1.2;
  scene.add(builder.group);
  const mallet = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .42, 6), woodM);
  handle.position.y = -.34; mallet.add(handle);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(.2, .12, .12), modernSurfaceMaterial(P.stone, { roughness: .9, flatShading: true }));
  headMesh.position.y = -.14; mallet.add(headMesh);
  builder.armR.add(mallet);
}

// ---------- crafting corner + campfire ----------
const crafter = makeCharacter('#C87A56', '#5E7A9E', false);
const craftedPots: THREE.Mesh[] = [];
const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 7), new THREE.MeshBasicMaterial({ color: '#FFAA5E', transparent: true, opacity: .95 }));
const fireLight = new THREE.PointLight('#FFB068', 5, 6, 1.8);
const BENCH = { x: -2.6, z: -8.8 };
{
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, .12, .8), woodM);
  top.position.y = .74; top.castShadow = true; bench.add(top);
  for (const [lx, lz] of [[-.72, -.3], [.72, -.3], [-.72, .3], [.72, .3]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.12, .74, .12), woodM);
    leg.position.set(lx, .37, lz); bench.add(leg);
  }
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(.34, .2, .3), modernSurfaceMaterial('#8B9299', { roughness: .6, metalness: .25, flatShading: true }));
  anvil.position.set(-.3, .9, 0); bench.add(anvil);
  bench.position.set(BENCH.x, ground(BENCH.x, BENCH.z), BENCH.z);
  bench.rotation.y = .5;
  scene.add(bench);
  crafter.group.position.set(BENCH.x + .3, ground(BENCH.x + .3, BENCH.z + 1), BENCH.z + 1);
  crafter.group.rotation.y = Math.PI + .5;
  scene.add(crafter.group);
  const fire = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.11, 0), modernSurfaceMaterial(P.stone, { roughness: .95, flatShading: true }));
    stone.position.set(Math.cos(a) * .42, .06, Math.sin(a) * .42);
    stone.scale.y = .7; fire.add(stone);
  }
  for (const r of [.5, -.6]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .55, 6), woodM);
    log.rotation.z = Math.PI / 2; log.rotation.y = r; log.position.y = .1; fire.add(log);
  }
  flame.position.y = .32; fire.add(flame);
  fireLight.position.y = .5; fire.add(fireLight);
  fire.position.set(BENCH.x - 2, ground(BENCH.x - 2, BENCH.z - .6), BENCH.z - .6);
  scene.add(fire);
}

// ---------- shrine (sacred glow) + grave + prayer ----------
const shrineLight = new THREE.PointLight(P.violet, .6, 5, 2);
const SHRINE = { x: -15, z: 18 };
const prayer = makeCharacter('#B8A9D9', '#8A7EAA', false);
{
  const shrine = new THREE.Group();
  const stoneM = modernSurfaceMaterial(P.stone, { roughness: .94, flatShading: true });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.32, 1.5, .32), stoneM);
    pillar.position.set(side * .68, .75, 0); pillar.castShadow = true; shrine.add(pillar);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, .3, .42), stoneM);
  lintel.position.y = 1.62; lintel.castShadow = true; shrine.add(lintel);
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(.17, 0), modernSurfaceMaterial(P.violet, { roughness: .5, clearcoat: .3 }));
  heart.position.y = 1.05; heart.name = 'shrineHeart'; shrine.add(heart);
  shrineLight.position.y = 1.1; shrine.add(shrineLight);
  shrine.position.set(SHRINE.x, ground(SHRINE.x, SHRINE.z), SHRINE.z);
  shrine.rotation.y = .7;
  scene.add(shrine);
  prayer.group.position.set(SHRINE.x + 1.3, ground(SHRINE.x + 1.3, SHRINE.z + 1), SHRINE.z + 1);
  prayer.group.rotation.y = Math.PI + .7;
  prayer.armL.rotation.x = -2.3; prayer.armR.rotation.x = -2.3;
  scene.add(prayer.group);
  // grave beside: a leaning slab, flowers at its foot, the fading one watching
  const grave = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(.5, .78, .12), stoneM);
  slab.position.y = .39; slab.rotation.x = -.08; slab.castShadow = true; grave.add(slab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .12, 10, 1, false, 0, Math.PI), stoneM);
  cap.rotation.z = Math.PI / 2; cap.rotation.y = Math.PI / 2; cap.position.y = .78; grave.add(cap);
  for (let i = 0; i < 3; i++) {
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(.05, 7, 5), modernSurfaceMaterial('#F2A9C4', { roughness: .8 }));
    bloom.position.set(-.15 + i * .15, .06, .18); grave.add(bloom);
  }
  grave.position.set(SHRINE.x - 1.8, ground(SHRINE.x - 1.8, SHRINE.z - .6), SHRINE.z - .6);
  grave.rotation.y = .5;
  scene.add(grave);
}

// ---------- market stall + vendor ----------
{
  const stall = new THREE.Group();
  for (const [px, pz] of [[-.9, -.5], [.9, -.5], [-.9, .5], [.9, .5]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.1, 2, .1), woodM);
    post.position.set(px, 1, pz); stall.add(post);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2, .14, 1.1), woodM);
  counter.position.y = .85; counter.castShadow = true; stall.add(counter);
  // striped awning: alternating cream / terracotta slats
  for (let i = 0; i < 6; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(.36, .05, 1.5), i % 2 ? roofM : plasterM);
    slat.position.set(-.9 + i * .36, 2.1 - i * .015, 0);
    slat.rotation.z = -.06;
    stall.add(slat);
  }
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .4), fenceM);
    crate.position.set(-.6 + i * .55, 1, .18);
    stall.add(crate);
    for (let f = 0; f < 3; f++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), modernSurfaceMaterial(['#E2674F', '#F5C86E', '#8FC45C'][i]!, { roughness: .8 }));
      fruit.position.set(-.6 + i * .55 + (f - 1) * .1, 1.2, .18 + (f % 2) * .08 - .04);
      stall.add(fruit);
    }
  }
  stall.position.set(5.8, ground(5.8, 13.4), 13.4);
  stall.rotation.y = -.5;
  scene.add(stall);
  const vendor = makeCharacter('#8FB56B', '#5E6A44', true);
  vendor.group.position.set(5.2, ground(5.2, 12.2), 12.2);
  vendor.group.rotation.y = 2.6;
  scene.add(vendor.group);
}

// ---------- gathering vignette: berry shrub + picker ----------
const gatherer = makeCharacter('#E8C9A2', '#A96F52', false);
const GATHER = { x: -13.5, z: 2.5 };
{
  const bush = labBerryShrub(0);
  bush.position.set(GATHER.x, ground(GATHER.x, GATHER.z), GATHER.z);
  scene.add(bush);
  gatherer.group.position.set(GATHER.x + 1, ground(GATHER.x + 1, GATHER.z + .4), GATHER.z + .4);
  gatherer.group.rotation.y = -Math.PI / 2 - .4;
  scene.add(gatherer.group);
}

// ---------- mining vignette: ore rock + miner ----------
const miner = makeCharacter('#C9C2B4', '#6E7A8A', true);
const ORE = { x: 9, z: -19 };
{
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.85, 0), modernSurfaceMaterial(P.stone, { roughness: .95, flatShading: true }));
  rock.position.set(ORE.x, ground(ORE.x, ORE.z) + .4, ORE.z); rock.scale.set(1.15, .85, 1); rock.castShadow = true;
  scene.add(rock);
  for (let i = 0; i < 5; i++) {
    const fleck = new THREE.Mesh(new THREE.OctahedronGeometry(.09, 0), modernSurfaceMaterial('#E3B663', { roughness: .48, metalness: .35 }));
    const a = hash(i, 71) * Math.PI * 2;
    fleck.position.set(ORE.x + Math.cos(a) * .74, ground(ORE.x, ORE.z) + .35 + hash(71, i) * .5, ORE.z + Math.sin(a) * .66);
    fleck.rotation.set(a, a * .7, 0);
    scene.add(fleck);
  }
  miner.group.position.set(ORE.x - 1.3, ground(ORE.x - 1.3, ORE.z + .4), ORE.z + .4);
  miner.group.rotation.y = Math.PI / 2 + .5;
  scene.add(miner.group);
  const pick = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .5, 6), woodM);
  handle.position.y = -.36; pick.add(handle);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(.05, .3, 6), modernSurfaceMaterial('#8B9299', { roughness: .55, metalness: .3 }));
  blade.rotation.z = Math.PI / 2; blade.position.set(.12, -.12, 0); pick.add(blade);
  miner.armR.add(pick);
}

// ---------- creatures ----------
interface CreatureRig { group: THREE.Group; head?: THREE.Group; legs: THREE.Group[]; tail?: THREE.Group; wings: THREE.Group[] }
function quadruped(furColor: string, bodyScale: [number, number, number], neckUp: number, young = false): CreatureRig {
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
function fowlRig(dark: boolean): CreatureRig {
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
// deer family grazing the west meadow
const doe = quadruped('#8C6C58', [.5, .32, .26], .5);
doe.group.position.set(-20, ground(-20, 8), 8); doe.group.rotation.y = .6;
const fawn = quadruped('#A5836B', [.5, .32, .26], .5, true);
fawn.group.position.set(-18.4, ground(-18.4, 9.4), 9.4); fawn.group.rotation.y = -.4;
scene.add(doe.group, fawn.group);
// fowl pecking near the cottage yard
const hens: CreatureRig[] = [];
for (let i = 0; i < 3; i++) {
  const hen = fowlRig(i === 2);
  hen.group.position.set(-10.5 + i * 1.1, ground(-10.5 + i * 1.1, -9.4 + (i % 2)), -9.4 + (i % 2));
  hen.group.rotation.y = hash(i, 91) * Math.PI * 2;
  hens.push(hen); scene.add(hen.group);
}
// the predator prowling the far tree line, ringed in warning
const predator = quadruped('#596473', [.56, .28, .24], .32);
predator.group.position.set(25, ground(25, -20), -20);
const threatRing = new THREE.Mesh(new THREE.TorusGeometry(.62, .04, 6, 24), new THREE.MeshBasicMaterial({ color: P.danger, transparent: true, opacity: .8 }));
threatRing.rotation.x = Math.PI / 2; threatRing.position.y = .06;
predator.group.add(threatRing);
scene.add(predator.group);

// ---------- clouds + birds ----------
const cloudClusters: THREE.Group[] = [];
const birds: THREE.Group[] = [];
const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#FFF9E6', transparent: true, opacity: .92, fog: false });
{
  for (let c = 0; c < 6; c++) {
    const cluster = new THREE.Group();
    const lobeCount = 4 + Math.floor(hash(c, 3) * 3);
    for (let l = 0; l < lobeCount; l++) {
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + hash(c, l) * 2.2, 1), cloudMaterial);
      lobe.scale.set(1.9, .55, 1);
      lobe.position.set((l - lobeCount / 2) * 2.6, hash(l, c) * .8 - Math.abs(l - lobeCount / 2) * .35, hash(c * 3, l) * 1.4);
      cluster.add(lobe);
    }
    const angle = c / 6 * Math.PI * 2 + .4;
    cluster.position.set(Math.cos(angle) * (46 + hash(c, 9) * 40), 26 + hash(c, 11) * 9, Math.sin(angle) * (46 + hash(c, 9) * 40));
    cloudClusters.push(cluster);
    scene.add(cluster);
  }
  const birdM = new THREE.MeshBasicMaterial({ color: '#4A4F52' });
  for (let b = 0; b < 5; b++) {
    const bird = new THREE.Group();
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(.05, .5, 4), birdM);
      wing.rotation.z = side * (Math.PI / 2 + .5); wing.position.x = side * .22; wing.name = side < 0 ? 'wingL' : 'wingR';
      bird.add(wing);
    }
    bird.userData.phase = b * 1.3;
    birds.push(bird);
    scene.add(bird);
  }
}

// ---------- atmosphere: time of day × weather × season ----------
type TimeOfDay = 'noon' | 'dusk' | 'night' | 'dawn';
type Weather = 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
type Season = 'summer' | 'autumn' | 'winter' | 'spring';
let timeOfDay: TimeOfDay = 'noon';
let weather: Weather = 'clear';
let season: Season = 'summer';

const TIME_BASE: Record<TimeOfDay, { sunPos: [number, number, number]; sunColor: string; sunI: number; hemiI: number; ambI: number; skyTop: string; skyLow: string; fog: string; fogNear: number; fogFar: number; night: number }> = {
  noon: { sunPos: [-26, 34, 18], sunColor: '#FFF1CC', sunI: 2.35, hemiI: .65, ambI: .34, skyTop: '#4E93D8', skyLow: '#F2E2B8', fog: '#F3ECD8', fogNear: 92, fogFar: 190, night: 0 },
  dusk: { sunPos: [-36, 11, 6], sunColor: '#FFC489', sunI: 1.6, hemiI: .42, ambI: .3, skyTop: '#7A97C9', skyLow: '#F5B57E', fog: '#F0CFA0', fogNear: 80, fogFar: 172, night: 0 },
  night: { sunPos: [30, 24, -14], sunColor: '#BFD2EE', sunI: .38, hemiI: .22, ambI: .24, skyTop: '#182644', skyLow: '#31446E', fog: '#2C3B60', fogNear: 58, fogFar: 150, night: 1 },
  dawn: { sunPos: [30, 13, 14], sunColor: '#FFD9A8', sunI: 1.45, hemiI: .45, ambI: .3, skyTop: '#6FA0CE', skyLow: '#F2D7A8', fog: '#EFD9B4', fogNear: 84, fogFar: 176, night: 0 },
};
const SEASON_TINT: Record<Season, { ground: string; grass: string; canopy: string }> = {
  summer: { ground: '#FFFFFF', grass: '#FFFFFF', canopy: '#FFFFFF' },
  autumn: { ground: '#F2D9A8', grass: '#EFCD92', canopy: '#E8B470' },
  winter: { ground: '#DDE4E0', grass: '#CBD6CE', canopy: '#C2D2C4' },
  spring: { ground: '#EFFADC', grass: '#E4F7C9', canopy: '#DCF2B4' },
};

function applyAtmosphere(): void {
  const base = TIME_BASE[timeOfDay];
  sun.position.set(...base.sunPos);
  sun.color.set(base.sunColor);
  let sunI = base.sunI;
  hemisphere.intensity = base.hemiI;
  ambient.intensity = base.ambI;
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
  sun.intensity = sunI;
  (skyUniforms.top.value as THREE.Color).copy(skyTop);
  (skyUniforms.low.value as THREE.Color).copy(skyLow);
  (skyUniforms.sun.value as THREE.Vector3).copy(sun.position).normalize();
  skyUniforms.glow.value = weather === 'clear' ? 1 : .25;
  (scene.fog as THREE.Fog).color.copy(fog);
  (scene.fog as THREE.Fog).near = fogNear; (scene.fog as THREE.Fog).far = fogFar;
  (scene.background as THREE.Color).copy(fog);
  cloudMaterial.color.set(cloudColor);
  cloudMaterial.opacity = timeOfDay === 'night' ? .12 : cloudOpacity;
  const night = base.night * (weather === 'clear' ? 1 : .25);
  (stars.material as THREE.PointsMaterial).opacity = night * .95;
  (moon.material as THREE.MeshBasicMaterial).opacity = base.night * .95;
  (fireflies.material as THREE.PointsMaterial).opacity = base.night * (weather === 'rain' || weather === 'storm' ? .1 : .95);
  lampLight.intensity = base.night * 2.4;
  lampBulbM.color.set(base.night ? '#FFE9B0' : '#EFE6CC');
  windowGlassM.emissive.set('#FFD98A');
  windowGlassM.emissiveIntensity = base.night * 1.1;
  fireLight.intensity = 4.4 + base.night * 2.2;
  rain.visible = weather === 'rain' || weather === 'storm';
  snow.visible = weather === 'snow';
  const tint = SEASON_TINT[season];
  groundMaterial.color.set(tint.ground);
  grassMaterial.color.set(tint.grass);
  canopyMaterial.color.set(tint.canopy);
}
function syncButton(id: string, icon: string, value: string): void {
  const el = document.getElementById(id); if (el) el.textContent = `${icon} ${value}`;
}
function setTime(value: TimeOfDay): void { timeOfDay = value; applyAtmosphere(); syncButton('ctl-time', timeIcons[value], value); }
function setWeather(value: Weather): void { weather = value; applyAtmosphere(); syncButton('ctl-weather', weatherIcons[value], value); }
function setSeason(value: Season): void { season = value; applyAtmosphere(); syncButton('ctl-season', seasonIcons[value], value); }
applyAtmosphere();

// control bar
const TIMES: TimeOfDay[] = ['noon', 'dusk', 'night', 'dawn'];
const WEATHERS: Weather[] = ['clear', 'rain', 'snow', 'fog', 'storm'];
const SEASONS: Season[] = ['summer', 'autumn', 'winter', 'spring'];
const timeIcons = { noon: '☀', dusk: '🌇', night: '☾', dawn: '🌅' };
const weatherIcons = { clear: '◌', rain: '🌧', snow: '❄', fog: '🌫', storm: '⛈' };
const seasonIcons = { summer: '✿', autumn: '🍂', winter: '❅', spring: '🌱' };
function wireCycle<T extends string>(id: string, values: T[], icons: Record<T, string>, apply: (v: T) => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  let index = 0;
  el.addEventListener('click', () => {
    index = (index + 1) % values.length;
    apply(values[index]!);
    el.textContent = `${icons[values[index]!]} ${values[index]!}`;
  });
}
wireCycle('ctl-time', TIMES, timeIcons, setTime);
wireCycle('ctl-weather', WEATHERS, weatherIcons, setWeather);
wireCycle('ctl-season', SEASONS, seasonIcons, setSeason);

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 500);
let heading = .8, pitch = .48, zoom = 27;
const target = new THREE.Vector3(2, .4, -5);
let followWalker = false;
function placeCamera(): void {
  const r = Math.cos(pitch) * zoom;
  camera.position.set(target.x + Math.sin(heading) * r, target.y + Math.sin(pitch) * zoom, target.z + Math.cos(heading) * r);
  camera.lookAt(target);
}
placeCamera();
function mood(n: number): void {
  followWalker = n === 3;
  if (n === 1) { heading = .8; pitch = .48; zoom = 27; target.set(2, .4, -5); }
  if (n === 2) { heading = .35; pitch = 1.12; zoom = 34; target.set(0, .4, 2); }
  if (n === 3) { pitch = .2; zoom = 8.5; }
  placeCamera();
}
// explorer controls — identical feel to the game: WASD glide, Q/E rotate, Esc resets
const held = new Set<string>();
addEventListener('keydown', (e) => {
  if (['1', '2', '3'].includes(e.key)) { mood(Number(e.key)); return; }
  const key = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { held.add(key); e.preventDefault(); }
});
addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());
function glideCamera(dt: number): void {
  if (held.has('q')) { heading += dt * 1.7; placeCamera(); }
  if (held.has('e')) { heading -= dt * 1.7; placeCamera(); }
  const forwardX = -Math.sin(heading); const forwardZ = -Math.cos(heading);
  const rightX = -forwardZ; const rightZ = forwardX;
  let moveX = 0; let moveZ = 0;
  if (held.has('w') || held.has('arrowup')) { moveX += forwardX; moveZ += forwardZ; }
  if (held.has('s') || held.has('arrowdown')) { moveX -= forwardX; moveZ -= forwardZ; }
  if (held.has('d') || held.has('arrowright')) { moveX += rightX; moveZ += rightZ; }
  if (held.has('a') || held.has('arrowleft')) { moveX -= rightX; moveZ -= rightZ; }
  if (moveX === 0 && moveZ === 0) return;
  followWalker = false;
  const speed = (7 + zoom * .35) * dt;
  const length = Math.hypot(moveX, moveZ);
  target.x = THREE.MathUtils.clamp(target.x + moveX / length * speed, -60, 60);
  target.z = THREE.MathUtils.clamp(target.z + moveZ / length * speed, -60, 60);
  target.y = Math.max(0, ground(target.x, target.z)) + .4;
  placeCamera();
}
let dragging = false; let lx = 0; let ly = 0;
addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') return; dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  heading -= (e.clientX - lx) * .005; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - ly) * .004, .12, 1.35);
  lx = e.clientX; ly = e.clientY; placeCamera();
});
addEventListener('wheel', (e) => { zoom = THREE.MathUtils.clamp(zoom + e.deltaY * .02, 5, 60); placeCamera(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- the living update ----------
const BUILD_CYCLE = 10;
const STAGE_AT = [0, 2.5, 5, 7.5];
let lastStage = -1;
let lastSparkAt = 0;
let lastFishAt = 0;
let labTime = 0;

function update(dt: number): void {
  glideCamera(dt);
  labTime += dt;
  const t = labTime;
  windUniform.value = t;

  // strollers on the path
  for (const [rig, offset, dir, speed] of [[walker, 0, 1, 1.5], [stroller, PATH_LENGTH * .55, -1, 1.25]] as const) {
    const d = offset + dir * t * speed;
    const p = pathPoint(d);
    rig.group.position.set(p.x, ground(p.x, p.z), p.z);
    rig.group.rotation.y = p.heading + (dir < 0 ? Math.PI : 0);
    walkCycle(rig, t * speed, true);
  }
  bubble.visible = (t % 9) < 3.2;
  child.group.rotation.z = Math.sin(t * .8) * .03;
  labVerbPose(child, 'speak', t);
  infant.group.rotation.z = Math.sin(t * 2.2) * .09;
  infant.armL.rotation.x = Math.sin(t * 2.2) * .4;
  infant.armR.rotation.x = -Math.sin(t * 2.2) * .4;
  elder.head.rotation.y = Math.sin(t * .4) * .2;
  zzz.position.y = ground(-5.2, -7.2) + 1 + Math.sin(t * 1.4) * .08;
  (zzz.material as THREE.SpriteMaterial).opacity = .7 + Math.sin(t * 1.4) * .3;
  ghost.group.position.y = ground(-16.6, 17.2) + Math.sin(t * .9) * .06 + .05;

  // construction
  const cycle = t % BUILD_CYCLE;
  let stage = -1;
  for (let i = 0; i < STAGE_AT.length; i++) if (cycle >= STAGE_AT[i]!) stage = i;
  for (let i = 0; i < buildStages.length; i++) {
    const s = buildStages[i]!;
    s.visible = i <= stage;
    if (i === stage) {
      const grow = THREE.MathUtils.clamp((cycle - STAGE_AT[i]!) / .55, 0, 1);
      s.scale.setScalar(.4 + easeOutBack(grow) * .6);
    } else if (i < stage) s.scale.setScalar(1);
  }
  if (stage !== lastStage) {
    lastStage = stage;
    if (stage >= 0) burst(new THREE.Vector3(SITE.x, ground(SITE.x, SITE.z) + .4 + stage * .7, SITE.z), '#DCC9A2', 10, .9, 1.1, .7);
  }
  labVerbPose(builder, 'work', t);
  builder.armL.rotation.x = -.15 + Math.sin(t * 6.5 + 1.2) * .12;

  // crafting
  labVerbPose(crafter, 'work', t + 2.1);
  crafter.armL.rotation.x = -.35;
  if (t - lastSparkAt > 1.21) {
    lastSparkAt = t;
    burst(new THREE.Vector3(BENCH.x - .12, ground(BENCH.x, BENCH.z) + 1, BENCH.z + .12), '#FFD98D', 7, 1.3, .9, .5);
    if (craftedPots.length < 3 && Math.floor(t / 3.6) !== Math.floor((t - 1.21) / 3.6)) {
      const pot = new THREE.Mesh(new THREE.SphereGeometry(.16, 9, 7), modernSurfaceMaterial('#C08063', { roughness: .85, flatShading: true }));
      pot.scale.set(1, .8, 1);
      const px = BENCH.x + 1 + craftedPots.length * .45, pz = BENCH.z - .5;
      pot.position.set(px, ground(px, pz) + .13, pz);
      pot.castShadow = true;
      craftedPots.push(pot); scene.add(pot);
    }
  }
  for (const pot of craftedPots) pot.scale.x = pot.scale.z = Math.min(1, pot.scale.x + dt * 2.4);

  // gathering: bend, pick, chips
  gatherer.body.rotation.x = .18 + Math.max(0, Math.sin(t * 1.6)) * .25;
  gatherer.armR.rotation.x = -.6 + Math.sin(t * 1.6) * -.5;
  if (Math.floor(t * .5) !== Math.floor((t - dt) * .5)) {
    burst(new THREE.Vector3(GATHER.x + .4, ground(GATHER.x, GATHER.z) + .5, GATHER.z + .2), '#C4AE8E', 5, .5, .7, .6);
  }

  // mining: swing + sparks on impact
  const swing = Math.sin(t * 4.4);
  miner.armR.rotation.x = -1.4 + Math.abs(swing) * 1.05;
  if (swing > .96 && Math.sin((t - dt) * 4.4) <= .96) {
    burst(new THREE.Vector3(ORE.x - .5, ground(ORE.x, ORE.z) + .6, ORE.z + .2), '#FFE3A0', 6, 1.1, .8, .45);
  }

  // prayer: soft light rises at the shrine
  if (Math.floor(t / 4) !== Math.floor((t - dt) / 4)) {
    burst(new THREE.Vector3(SHRINE.x, ground(SHRINE.x, SHRINE.z) + 1.2, SHRINE.z), '#B4A6E4', 6, .25, .5, 1.6, 1.4);
  }
  shrineLight.intensity = .5 + Math.sin(t * 1.3) * .2;
  prayer.body.rotation.x = .06 + Math.sin(t * 1.3) * .05;

  // creatures
  doe.head!.rotation.z = -.5 + (Math.sin(t * .7) > .3 ? -.55 : 0);
  doe.tail!.rotation.y = Math.sin(t * 5) * .3;
  fawn.head!.rotation.z = -.5 + (Math.sin(t * .9 + 2) > .1 ? -.5 : 0);
  for (const [i, hen] of hens.entries()) {
    hen.head!.rotation.z = Math.sin(t * 5 + i * 2) > .55 ? -.75 : 0;
    hen.group.position.y = ground(hen.group.position.x, hen.group.position.z) + Math.abs(Math.sin(t * 6 + i)) * .015;
  }
  const prowl = t * .22;
  predator.group.position.set(25 + Math.cos(prowl) * 4, ground(25 + Math.cos(prowl) * 4, -20 + Math.sin(prowl) * 3), -20 + Math.sin(prowl) * 3);
  predator.group.rotation.y = -prowl + Math.PI / 2;
  for (const [i, hip] of predator.legs.entries()) hip.rotation.x = Math.sin(t * 5 + (i % 2) * Math.PI) * .4;
  (threatRing.material as THREE.MeshBasicMaterial).opacity = .55 + Math.sin(t * 3.4) * .3;

  // fish leap from the pond
  if (t - lastFishAt > 3.4) {
    lastFishAt = t;
    burst(new THREE.Vector3(POND.x + Math.sin(t) * 2.4, -.62, POND.z + Math.cos(t * 1.3) * 2), '#EAFBF4', 8, .8, 1.5, .7);
  }

  // fire
  flame.scale.set(1 + Math.sin(t * 11) * .12, 1 + Math.sin(t * 14 + 1) * .2, 1 + Math.cos(t * 12) * .12);
  if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
    burst(new THREE.Vector3(BENCH.x - 2, ground(BENCH.x - 2, BENCH.z - .6) + .55, BENCH.z - .6), '#E9E2D2', 1, .06, .55, 2.4, 2.2);
  }

  // precipitation fall
  for (const [points, speed, drift] of [[rain, 17, 0], [snow, 2.1, .6]] as const) {
    if (!points.visible) continue;
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      let y = attr.getY(i) - speed * dt;
      if (y < 0) y = 24;
      attr.setY(i, y);
      if (drift) attr.setX(i, attr.getX(i) + Math.sin(t + i) * drift * dt);
    }
    attr.needsUpdate = true;
  }
  // fireflies drift
  if ((fireflies.material as THREE.PointsMaterial).opacity > 0) {
    const attr = fireflies.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      attr.setY(i, .5 + Math.sin(t * .8 + i * 1.7) * .4);
      attr.setX(i, attr.getX(i) + Math.sin(t * .4 + i) * .01);
    }
    attr.needsUpdate = true;
  }

  // canopy sway, clouds, birds, foam
  for (const c of canopies) {
    c.rotation.z = Math.sin(t * .9 + (c.userData.swayPhase as number)) * .016;
    c.rotation.x = Math.cos(t * .7 + (c.userData.swayPhase as number)) * .012;
  }
  for (const [i, cl] of cloudClusters.entries()) {
    cl.position.x += dt * (.35 + i * .04);
    if (cl.position.x > 95) cl.position.x = -95;
  }
  for (const bird of birds) {
    const ph = (bird.userData.phase as number) + t * .16;
    bird.position.set(Math.cos(ph) * 26, 15 + Math.sin(t * .5 + ph) * 2.5, Math.sin(ph) * 26 - 4);
    bird.rotation.y = -ph - Math.PI / 2;
    const flap = Math.sin(t * 9 + ph * 7) * .5;
    bird.getObjectByName('wingL')!.rotation.z = Math.PI / 2 + .5 + flap;
    bird.getObjectByName('wingR')!.rotation.z = -(Math.PI / 2 + .5) - flap;
  }
  for (const rim of foamRims) { const s = 1 + Math.sin(t * 1.1) * .012; rim.scale.x = rim.scale.y = s; }

  stepParticles(dt);

  if (followWalker) {
    const p = pathPoint(t * 1.5);
    target.set(p.x, ground(p.x, p.z) + 1, p.z);
    heading = p.heading + Math.PI;
    placeCamera();
  }
}

function frame(dt: number): void { update(dt); renderer.render(scene, camera); }
let last = performance.now();
const loop = (): void => {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  frame(dt);
};
loop();
setInterval(() => { if (document.hidden) { const now = performance.now(); const dt = Math.min(.5, (now - last) / 1000); last = now; frame(dt); } }, 300);
(globalThis as unknown as { __lab: object }).__lab = {
  frame, mood, setTime, setWeather, setSeason,
  step: (seconds: number) => { const steps = Math.ceil(seconds / .033); for (let i = 0; i < steps; i++) update(.033); renderer.render(scene, camera); },
};
