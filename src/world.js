// ============================================================
// World: procedural 2.5D open world. Rolling heightfield terrain,
// a starter town, scattered trees/rocks, climbable cliffs (BotW
// style), and bonfire checkpoints (Dark Souls style). Also owns
// world collision (AABB boxes + ground height query).
// ============================================================
import * as THREE from 'three';
import { createStickman } from './stickman.js';
import { GIVERS } from './quests.js';

export const WORLD_SIZE = 380; // half-extent; world spans -380..380
export const WATER_LEVEL = -4.0;

// Deterministic value-noise so the world is the same every load and
// the server/client agree on terrain height without sharing data.
function hash2(x, z) {
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function smoothNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

function smoothstep(a, b, x) { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Smooth, noise-distorted biome membership weights at a point. Defined before
// heightAt so terrain elevation can vary by biome.
export function biomeWeights(x, z) {
  const nx = x + (smoothNoise(x * 0.018 + 1.3, z * 0.018 + 2.7) - 0.5) * 52;
  const nz = z + (smoothNoise(x * 0.018 + 9.1, z * 0.018 + 4.2) - 0.5) * 52;
  const ex = smoothstep(-30, 30, nx);   // 0 = west, 1 = east
  const ez = smoothstep(-30, 30, nz);   // 0 = south, 1 = north
  const town = 1 - smoothstep(16, 44, Math.hypot(x, z));
  const outer = 1 - town;
  return {
    forest: ex * ez * outer,
    snow: (1 - ex) * ez * outer,
    swamp: (1 - ex) * (1 - ez) * outer,
    desert: ex * (1 - ez) * outer,
    meadow: town,
  };
}

// Town centers (flattened so settlements sit on level ground). Declared here
// for heightAt. Spread far across the larger world.
export const TOWNS = [
  { name: 'The Nexus', x: 0, z: 0, biome: 'meadow', radius: 28, nexus: true },
  { name: 'Thornhollow', x: 150, z: 105, biome: 'forest', radius: 20 },
  { name: 'Frostgard', x: -150, z: 110, biome: 'snow', radius: 20 },
  { name: 'Dustmarket', x: 155, z: -108, biome: 'desert', radius: 20 },
  { name: 'Gloomfen', x: -152, z: -112, biome: 'swamp', radius: 20 },
];

// Named adventuring areas within the biomes, each with a level and a spawn
// budget. The player gets a zone banner on entering one.
export const AREAS = [
  { name: 'Greenmeadow', x: 0, z: 0, r: 40, level: 0, biome: 'meadow', safe: true },
  { name: 'Whisperwood Glade', x: 90, z: 62, r: 42, level: 1, biome: 'forest', count: 9 },
  { name: 'Tanglethorn Deep', x: 205, z: 158, r: 52, level: 10, biome: 'forest', count: 12 },
  { name: 'Frostfang Pass', x: -92, z: 66, r: 42, level: 3, biome: 'snow', count: 9 },
  { name: 'Glacial Reach', x: -205, z: 165, r: 52, level: 13, biome: 'snow', count: 12 },
  { name: 'Sunscar Flats', x: 96, z: -62, r: 42, level: 5, biome: 'desert', count: 9 },
  { name: 'The Bonewaste', x: 212, z: -158, r: 54, level: 17, biome: 'desert', count: 13 },
  { name: 'Murkmire', x: -95, z: -64, r: 42, level: 7, biome: 'swamp', count: 9 },
  { name: 'Rotheart Hollow', x: -212, z: -162, r: 54, level: 22, biome: 'swamp', count: 13 },
];

// Find the named area a point is in (nearest area whose radius contains it).
export function areaAt(x, z) {
  let best = null, bd = Infinity;
  for (const a of AREAS) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < a.r && d < bd) { bd = d; best = a; }
  }
  return best;
}

// Roads: straight dirt routes from the Nexus out to each town.
const ROADS = TOWNS.filter((t) => !t.nexus).map((t) => ({ ax: 0, az: 0, bx: t.x, bz: t.z }));
export function roadDistance(x, z) {
  let best = Infinity;
  for (const r of ROADS) {
    const dx = r.bx - r.ax, dz = r.bz - r.az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - r.ax) * dx + (z - r.az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = r.ax + dx * t, pz = r.az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

// The single source of truth for ground elevation. Base rolling noise plus
// per-biome character (snowy peaks, desert dunes, swamp lowlands, forest
// plateaus), all flattened to level ground around every town.
export function heightAt(x, z) {
  let h = 0;
  h += smoothNoise(x * 0.012, z * 0.012) * 14;
  h += smoothNoise(x * 0.04, z * 0.04) * 4;
  h += smoothNoise(x * 0.11, z * 0.11) * 1.2;
  h -= 6;

  // Per-biome elevation, blended by weight.
  const w = biomeWeights(x, z);
  if (w.snow > 0.001)   h += w.snow * (smoothNoise(x * 0.022 + 30, z * 0.022 + 30) * 38 - 4); // tall peaks
  if (w.desert > 0.001) h += w.desert * (Math.sin(x * 0.05) * Math.cos(z * 0.045) * 6);        // rolling dunes
  if (w.swamp > 0.001)  h += w.swamp * (-7 + smoothNoise(x * 0.05, z * 0.05) * 2);              // sunken lowlands
  if (w.forest > 0.001) {
    // Forest plateaus: quantize into broad steps.
    const plat = Math.round((smoothNoise(x * 0.02 + 60, z * 0.02 + 60) * 22) / 6) * 6;
    h += w.forest * (plat - 6);
  }

  // Flatten the nearest town to a level plateau.
  let flat = 1;
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    flat = Math.min(flat, THREE.MathUtils.clamp((d - t.radius * 0.5) / 20, 0, 1));
  }
  h *= flat;
  // Lift terrain so flattened towns sit at a consistent, walkable height.
  h += (1 - flat) * townBaseHeight(x, z);
  return h;
}

// A gentle base height for a town plateau (keeps each town roughly level
// without snapping every town to y=0).
function townBaseHeight(x, z) {
  let nearest = TOWNS[0], best = Infinity;
  for (const t of TOWNS) { const d = Math.hypot(x - t.x, z - t.z); if (d < best) { best = d; nearest = t; } }
  // raw base noise at the town center → a stable plateau height
  return smoothNoise(nearest.x * 0.012, nearest.z * 0.012) * 8;
}

// Biomes are chosen by map quadrant; the town sits in a neutral meadow at
// the center. Each biome has its own ground palette, rock tint, and prop type.
export const BIOMES = {
  meadow: { name: 'Greenmeadow', ground: 0x6fae54, ground2: 0x9aa05a, rock: 0x8c8576, prop: 'tree' },
  forest: { name: 'The Greenwood', ground: 0x4d8a3a, ground2: 0x66993a, rock: 0x6f6a5e, prop: 'tree' },
  snow: { name: 'Frostpeaks', ground: 0xe2ebf2, ground2: 0xc2d4e2, rock: 0x9aa6b2, prop: 'pine' },
  swamp: { name: 'The Mire', ground: 0x49583a, ground2: 0x3a4a32, rock: 0x55564a, prop: 'dead' },
  desert: { name: 'The Dunes', ground: 0xd9c486, ground2: 0xc7a866, rock: 0xbaa06e, prop: 'cactus' },
};

// Discrete biome (for prop choice / camps) — the dominant weight, distorted
// so prop regions interleave at borders to match the blended terrain.
export function biomeAt(x, z) {
  if (Math.hypot(x, z) < 22) return BIOMES.meadow;
  const w = biomeWeights(x, z);
  let best = 'forest', bv = -1;
  for (const k of ['forest', 'snow', 'swamp', 'desert', 'meadow']) if (w[k] > bv) { bv = w[k]; best = k; }
  return BIOMES[best];
}

// Blended ground color at a point (used per terrain vertex).
const _bc = new THREE.Color(), _g1 = new THREE.Color(), _g2 = new THREE.Color(), _rk = new THREE.Color();
export function biomeColorAt(x, z, y) {
  const w = biomeWeights(x, z);
  const t = THREE.MathUtils.clamp((y + 6) / 20, 0, 1);
  _bc.setRGB(0, 0, 0); let rockR = 0, rockG = 0, rockB = 0, total = 0;
  for (const key in w) {
    const wt = w[key]; if (wt <= 0.0001) continue;
    const b = BIOMES[key];
    _g1.setHex(b.ground); _g2.setHex(b.ground2);
    _g1.lerp(_g2, t * 0.6);
    _bc.r += _g1.r * wt; _bc.g += _g1.g * wt; _bc.b += _g1.b * wt;
    _rk.setHex(b.rock); rockR += _rk.r * wt; rockG += _rk.g * wt; rockB += _rk.b * wt; total += wt;
  }
  if (total > 0) { _bc.r /= total; _bc.g /= total; _bc.b /= total; rockR /= total; rockG /= total; rockB /= total; }
  if (y > 9) { _bc.r = _bc.r * 0.3 + rockR * 0.7; _bc.g = _bc.g * 0.3 + rockG * 0.7; _bc.b = _bc.b * 0.3 + rockB * 0.7; }
  return _bc;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];   // { min:Vec3, max:Vec3, climbable:bool }
    this.bonfires = [];    // { pos:Vec3, mesh, light }
    this.spawnZones = [];  // { center:Vec3, radius, level }
    this.camps = [];       // elite war-camps with loot chests
    this.questGivers = []; // { name, giver, pos, marker, npc }
    this.vendors = [];     // { name, label, type, pos }
    this.villagers = [];   // { pos, town } — interactable for lore
    this._build();
  }

  _build() {
    this._sky();
    this._terrain();
    this._towns();
    this._scatter();
    this._groundDetail();
    this._ruins();
    this._cliffs();
    this._camps();
    this._bonfires();
    this._spawnZones();
  }

  _sky() {
    this.scene.background = new THREE.Color(0x9fc4e8);
    this.scene.fog = new THREE.Fog(0x9fc4e8, 140, 620);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a7050, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 90;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;

    // Stylized drifting clouds for the 2.5D backdrop.
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.clouds = [];
    for (let i = 0; i < 30; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(hash2(i, 7) * 4);
      for (let k = 0; k < n; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + hash2(i, k) * 4, 7, 6), cloudMat);
        puff.position.set((hash2(i, k) - 0.5) * 16, hash2(k, i) * 3, (hash2(i + 1, k) - 0.5) * 9);
        c.add(puff);
      }
      c.position.set((hash2(i, 1) - 0.5) * 460, 64 + hash2(i, 2) * 40, (hash2(i, 3) - 0.5) * 460);
      c.userData.drift = 1.2 + hash2(i, 5) * 2.2; // units/sec along +x
      this.group.add(c);
      this.clouds.push(c);
    }
  }

  _terrain() {
    const seg = 300;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const col = new THREE.Color();
    const road = new THREE.Color(0x9a8466);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      // Smoothly blended biome color (borders wander via noise).
      col.copy(biomeColorAt(x, z, y));
      // tiny per-vertex noise so flats aren't a single flat color
      const n = (smoothNoise(x * 0.3, z * 0.3) - 0.5) * 0.06;
      col.offsetHSL(0, 0, n);
      // Dirt roads from the Nexus to each town.
      const rd = roadDistance(x, z);
      if (rd < 6) col.lerp(road, (1 - rd / 6) * 0.85);
      colors.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Water plane (lakes/seas sit in the low biome areas).
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
      new THREE.MeshLambertMaterial({ color: 0x3b6ea5, transparent: true, opacity: 0.78 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    this.group.add(water);
    this.water = water;
  }

  _addBox(mesh, climbable = false, pad = 0) {
    // Register an AABB collider derived from the mesh's bounding box.
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    box.min.x -= pad; box.min.z -= pad; box.max.x += pad; box.max.z += pad;
    this.colliders.push({ min: box.min, max: box.max, climbable });
  }

  // Per-biome architecture palettes for towns.
  _townPalette(biome) {
    return {
      meadow: { wall: 0xc9c0a8, wall2: 0xb8a98a, roofs: [0x9a4a3a, 0x7a5a3a, 0x6a7a8a, 0x8a6a4a], plaza: 0xb9b2a0 },
      forest: { wall: 0x8a7a52, wall2: 0x9a8a5a, roofs: [0x3f6a3a, 0x4f7a3a, 0x5a6f2f], plaza: 0x8a8a66 },
      snow: { wall: 0xcdd6e0, wall2: 0xbcc6d2, roofs: [0x6a7a8a, 0x7a8aa0, 0xeaf2ff], plaza: 0xc2cdd8 },
      desert: { wall: 0xd8c79a, wall2: 0xc8b486, roofs: [0xc08a4a, 0xb07a3a, 0x9a6a3a], plaza: 0xcdbb88 },
      swamp: { wall: 0x6a6a55, wall2: 0x5a5a48, roofs: [0x4a5a3a, 0x3a4a30, 0x55603a], plaza: 0x6a6a52 },
    }[biome] || { wall: 0xc9c0a8, wall2: 0xb8a98a, roofs: [0x9a4a3a], plaza: 0xb9b2a0 };
  }

  _towns() {
    const byTown = {};
    for (const gv of GIVERS) (byTown[gv.town] ||= []).push(gv);
    for (const t of TOWNS) this._buildTown(t, byTown[t.name] || []);
  }

  _buildTown(t, givers) {
    const pal = this._townPalette(t.biome);
    const cx = t.x, cz = t.z, baseY = heightAt(cx, cz);
    const R = t.radius;
    const big = !!t.nexus;

    // Plaza.
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.4, 40), new THREE.MeshLambertMaterial({ color: pal.plaza }));
    plaza.position.set(cx, baseY, cz); plaza.receiveShadow = true;
    this.group.add(plaza);

    // Houses ringed around the plaza.
    const houseCount = big ? 12 : 6;
    const wallMats = [new THREE.MeshLambertMaterial({ color: pal.wall }), new THREE.MeshLambertMaterial({ color: pal.wall2 })];
    const roofMats = pal.roofs.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < houseCount; i++) {
      const ang = (i / houseCount) * Math.PI * 2 + (big ? 0 : 0.4);
      const hr = R * 0.7 + (hash2(i + cx, cz) - 0.5) * 3;
      const hx = cx + Math.cos(ang) * hr, hz = cz + Math.sin(ang) * hr;
      const sz = 4 + hash2(i, cx) * 2;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(sz, 3.2, sz), wallMats[i % 2]);
      body.position.y = 1.6;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.82, 2.2, 4), roofMats[i % roofMats.length]);
      roof.position.y = 4.3; roof.rotation.y = Math.PI / 4;
      g.add(body, roof);
      g.position.set(hx, heightAt(hx, hz), hz);
      g.rotation.y = -ang;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      this._addBox(body, false);
    }

    // Landmark: the Nexus gets a glowing portal-obelisk; others a biome totem.
    if (big) {
      const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 7, 6), new THREE.MeshLambertMaterial({ color: 0x6a5a8a }));
      obelisk.position.set(cx, baseY + 3.5, cz); obelisk.castShadow = true;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }));
      orb.position.set(cx, baseY + 8, cz);
      const glow = new THREE.PointLight(0x9fd0ff, 2.4, 24); glow.position.set(cx, baseY + 8, cz);
      this.group.add(obelisk, orb, glow);
      this._nexusOrb = orb;
      this._addBox(obelisk, false);
    } else {
      const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.4, 6), new THREE.MeshLambertMaterial({ color: roofMats[0].color }));
      totem.position.set(cx, baseY + 1.7, cz); totem.castShadow = true;
      this.group.add(totem); this._addBox(totem, false);
    }

    // Lamp posts.
    const lamps = big ? 8 : 5;
    for (let a = 0; a < lamps; a++) {
      const ang = (a / lamps) * Math.PI * 2;
      const lx = cx + Math.cos(ang) * (R - 3), lz = cz + Math.sin(ang) * (R - 3);
      const ly = heightAt(lx, lz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
      post.position.set(lx, ly + 1.5, lz); post.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe8a0 }));
      lamp.position.set(lx, ly + 3.1, lz);
      this.group.add(post, lamp);
    }

    // A watchtower and a well (new structures).
    this._tower(cx + R * 0.62, cz - R * 0.62, pal);
    this._well(cx - R * 0.6, cz + R * 0.4);

    // Merchant stalls — the Nexus has all four trades; outposts have two.
    const mTypes = big ? ['weapon', 'armor', 'alchemist', 'general'] : ['armor', 'alchemist'];
    mTypes.forEach((type, i) => {
      const ang = Math.PI + i * (Math.PI * 2 / (mTypes.length + 1));
      const mx = cx + Math.cos(ang) * (R * 0.62), mz = cz + Math.sin(ang) * (R * 0.62);
      this._merchant(mx, mz, t.name, type, ang + Math.PI);
    });

    // Ambient villagers (flavor; interactable for lore).
    const villagerCols = [0xb08a6a, 0x8a8a9a, 0xa06a6a, 0x6a8a7a];
    for (let i = 0; i < (big ? 6 : 4); i++) {
      const ang = hash2(i + 3, cx) * Math.PI * 2, rr = 5 + hash2(i, cz) * (R - 10);
      const nx = cx + Math.cos(ang) * rr, nz = cz + Math.sin(ang) * rr;
      const npc = createStickman({ color: villagerCols[i % villagerCols.length], accent: 0x554433, scale: 0.95 });
      npc.position.set(nx, heightAt(nx, nz), nz);
      npc.rotation.y = hash2(i, 9) * Math.PI * 2;
      this.group.add(npc);
      this.villagers.push({ pos: new THREE.Vector3(nx, heightAt(nx, nz), nz), town: t.name });
    }

    // Quest givers for this town.
    for (const gv of givers) {
      const gx = cx + gv.dx, gz = cz + gv.dz, gy = heightAt(cx + gv.dx, cz + gv.dz);
      const npc = createStickman({ color: gv.color, accent: gv.accent });
      npc.position.set(gx, gy, gz);
      npc.rotation.y = Math.atan2(cx - gx, cz - gz);
      this.group.add(npc);
      const marker = this._marker('!', '#ffd24a');
      marker.position.set(gx, gy + 3, gz);
      this.group.add(marker);
      this.questGivers.push({ name: gv.name, giver: gv, pos: new THREE.Vector3(gx, gy, gz), marker, npc });
    }
  }

  _tower(x, z, pal) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 8, 10), new THREE.MeshLambertMaterial({ color: pal.wall2 }));
    shaft.position.y = 4;
    const batt = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1, 10), new THREE.MeshLambertMaterial({ color: pal.wall }));
    batt.position.y = 8.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 2.2, 10), new THREE.MeshLambertMaterial({ color: pal.roofs[0] }));
    roof.position.y = 9.8;
    g.add(shaft, batt, roof);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this._addBox(shaft, false);
  }

  _well(x, z) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 1, 12), new THREE.MeshLambertMaterial({ color: 0x8a8276 }));
    ring.position.y = 0.5;
    for (const sx of [-0.8, 0.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
      post.position.set(sx, 1.5, 0); g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    roof.position.y = 2.8; roof.rotation.y = Math.PI / 4;
    g.add(ring, roof);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this._addBox(ring, false);
  }

  _merchant(x, z, townName, type = 'general', facing = 0) {
    const TYPE = {
      weapon: { label: 'Weaponsmith', awning: 0xb04a3a, glyph: '⚔️' },
      armor: { label: 'Armorer', awning: 0x4a6a9a, glyph: '🛡️' },
      alchemist: { label: 'Alchemist', awning: 0x4a9a5a, glyph: '🧪' },
      general: { label: 'Trader', awning: 0xc9a227, glyph: '💍' },
    }[type] || { label: 'Trader', awning: 0xc9a227 };
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
    counter.position.y = 0.5;
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), postMat);
      post.position.set(sx, 1.3, -0.5); g.add(post);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 1.6), new THREE.MeshLambertMaterial({ color: TYPE.awning }));
    awning.position.set(0, 2.5, -0.4); awning.rotation.x = -0.25; g.add(awning);
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: 0xffcf3a, side: THREE.DoubleSide }));
    sign.position.set(0, 2.9, 0.4); g.add(sign);
    g.add(counter);
    g.position.set(x, y, z); g.rotation.y = facing;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this._addBox(counter, false);

    const keeper = createStickman({ color: 0xcaa46a, accent: 0x6a4a2a });
    keeper.position.set(x - Math.sin(facing) * 1.1, y, z - Math.cos(facing) * 1.1);
    keeper.rotation.y = facing + Math.PI;
    this.group.add(keeper);

    this.vendors.push({ name: `${TYPE.label} of ${townName}`, label: TYPE.label, type, pos: new THREE.Vector3(x, y, z) });
  }

  _marker(text, color) {
    const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.font = 'bold 52px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(text, 34, 36);
    ctx.fillStyle = color; ctx.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(cvs);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.3, 1.3, 1);
    return spr;
  }

  // Set a quest-giver's floating marker (gv is a world.questGivers entry).
  updateGiverMarker(gv, glyph, color) {
    if (!gv) return;
    if (!glyph) { gv.marker.visible = false; return; }
    gv.marker.visible = true;
    const cvs = gv.marker.material.map.image;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.font = 'bold 52px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(glyph, 34, 36);
    ctx.fillStyle = color; ctx.fillText(glyph, 32, 34);
    gv.marker.material.map.needsUpdate = true;
  }

  nearestVendor(pos, maxDist = 4.5) {
    for (const v of this.vendors) if (v.pos.distanceTo(pos) < maxDist) return v;
    return null;
  }

  // Scattered ruins (broken pillars) out in the wild, per biome.
  _ruins() {
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    for (let i = 0; i < 90; i++) {
      const ang = hash2(i, 201) * Math.PI * 2;
      const rad = 50 + hash2(i, 203) * (WORLD_SIZE - 70);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3) continue;
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 4) continue;
      const cluster = 2 + Math.floor(hash2(i, 205) * 3);
      for (let k = 0; k < cluster; k++) {
        const h = 1.5 + hash2(i, 207 + k) * 3;
        const px = x + (hash2(i, k) - 0.5) * 4, pz = z + (hash2(k, i) - 0.5) * 4;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, h, 8), pillarMat);
        pillar.position.set(px, heightAt(px, pz) + h / 2, pz);
        pillar.rotation.z = (hash2(i, k) - 0.5) * 0.3;
        pillar.castShadow = true;
        this.group.add(pillar);
        this._addBox(pillar, false);
      }
    }
  }

  _scatter() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const deadMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4f8a4a });
    const leafMats = [0x3f7d3a, 0x4f8f3f, 0x5a6f2f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const pineMats = [0x2f6f4a, 0x357a52].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const snowCapMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });

    for (let i = 0; i < 1100; i++) {
      const ang = hash2(i, 11) * Math.PI * 2;
      const rad = 24 + hash2(i, 13) * (WORLD_SIZE - 30);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.5) continue; // skip water
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 4) continue;
      const biome = biomeAt(x, z);

      if (hash2(i, 17) < 0.7) {
        const g = new THREE.Group();
        if (biome.prop === 'cactus') {
          // Saguaro-style cactus.
          const h = 1.8 + hash2(i, 19) * 1.8;
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, h, 7), cactusMat);
          body.position.y = h / 2;
          g.add(body);
          if (hash2(i, 21) > 0.4) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h * 0.5, 6), cactusMat);
            arm.position.set(0.35, h * 0.6, 0); arm.rotation.z = -0.6; g.add(arm);
          }
          this._addBox(body, false);
        } else if (biome.prop === 'pine') {
          // Snowy pine: stacked cones with white caps.
          const th = 2.4 + hash2(i, 19) * 2;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, th * 0.5, 6), trunkMat);
          trunk.position.y = th * 0.25; g.add(trunk);
          for (let k = 0; k < 3; k++) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4 - k * 0.3, 1.4, 7), pineMats[i % pineMats.length]);
            cone.position.y = th * 0.5 + k * 0.9; g.add(cone);
          }
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 7), snowCapMat);
          cap.position.y = th * 0.5 + 2.5; g.add(cap);
          this._addBox(trunk, false);
        } else if (biome.prop === 'dead') {
          // Bare, gnarled dead tree.
          const th = 2.2 + hash2(i, 19) * 2;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, th, 6), deadMat);
          trunk.position.y = th / 2; g.add(trunk);
          for (let k = 0; k < 3; k++) {
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 4), deadMat);
            br.position.y = th * (0.6 + k * 0.12);
            br.rotation.z = (hash2(i, k) - 0.5) * 2; g.add(br);
          }
          this._addBox(trunk, false);
        } else {
          // Leafy tree.
          const th = 2 + hash2(i, 19) * 2.5;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, th, 6), trunkMat);
          trunk.position.y = th / 2;
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4 + hash2(i, 23), 2.6 + hash2(i, 29) * 1.5, 7),
            leafMats[i % leafMats.length]);
          leaf.position.y = th + 1;
          g.add(trunk, leaf);
          this._addBox(trunk, false);
        }
        g.position.set(x, y, z);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(g);
      } else {
        // Rock (tinted by biome).
        const r = 0.6 + hash2(i, 31) * 1.6;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshLambertMaterial({ color: biome.rock }));
        rock.position.set(x, y + r * 0.4, z);
        rock.rotation.set(hash2(i, 1) * 3, hash2(i, 2) * 3, hash2(i, 3) * 3);
        rock.castShadow = true; rock.receiveShadow = true;
        this.group.add(rock);
      }
    }
  }

  _groundDetail() {
    // Bushes (small leafy clumps) and flower tufts to dress the ground.
    // Purely decorative — no colliders, so they never block movement.
    const bushMats = [0x3f7d3a, 0x4f8f3f, 0x57752f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const flowerMats = [0xe85c8a, 0xf2c14e, 0xe8e8e8, 0x9a7bdc].map((c) => new THREE.MeshBasicMaterial({ color: c }));

    for (let i = 0; i < 600; i++) {
      const ang = hash2(i, 41) * Math.PI * 2;
      const rad = 18 + hash2(i, 43) * (WORLD_SIZE - 24);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.2) continue; // skip water
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 4) continue;

      if (hash2(i, 47) < 0.55) {
        // Bush: a cluster of small spheres.
        const g = new THREE.Group();
        const lobes = 2 + Math.floor(hash2(i, 51) * 3);
        const mat = bushMats[i % bushMats.length];
        for (let k = 0; k < lobes; k++) {
          const r = 0.4 + hash2(i, 53 + k) * 0.5;
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), mat);
          lobe.position.set((hash2(i, k) - 0.5) * 1.2, r * 0.7, (hash2(k, i) - 0.5) * 1.2);
          lobe.castShadow = true;
          g.add(lobe);
        }
        g.position.set(x, y, z);
        this.group.add(g);
      } else {
        // Flower tuft: a tiny stem + a coloured blossom.
        const g = new THREE.Group();
        const n = 1 + Math.floor(hash2(i, 59) * 3);
        for (let k = 0; k < n; k++) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4),
            new THREE.MeshLambertMaterial({ color: 0x5a7a3a }));
          stem.position.set((hash2(i, k) - 0.5) * 0.6, 0.2, (hash2(k, i + 1) - 0.5) * 0.6);
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), flowerMats[(i + k) % flowerMats.length]);
          bloom.position.set(stem.position.x, 0.42, stem.position.z);
          g.add(stem, bloom);
        }
        g.position.set(x, y, z);
        this.group.add(g);
      }
    }
  }

  _cliffs() {
    // Tall climbable rock walls placed around the map. Tagged climbable
    // so the player can scale them BotW-style with stamina.
    const cliffMat = new THREE.MeshLambertMaterial({ color: 0x8a8073 });
    // NOTE: cliffs are kept AXIS-ALIGNED (no Y rotation). A rotated box's
    // world AABB is larger than the box itself, which produced "invisible
    // walls" you could climb where no rock appeared. Axis-aligned keeps the
    // collider exactly matching what you see.
    const specs = [
      { x: 40, z: 30, w: 22, h: 16, d: 7 },
      { x: -50, z: -20, w: 30, h: 20, d: 8 },
      { x: 20, z: -55, w: 26, h: 14, d: 7 },
      { x: -35, z: 50, w: 24, h: 22, d: 7 },
      { x: 70, z: -40, w: 34, h: 26, d: 9 },
    ];
    for (const sp of specs) {
      const baseY = heightAt(sp.x, sp.z);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sp.w, sp.h, sp.d), cliffMat);
      mesh.position.set(sp.x, baseY + sp.h / 2 - 1, sp.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this._addBox(mesh, true);
      // A reward platform marker on top (loot chest).
      const chest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), new THREE.MeshLambertMaterial({ color: 0xb8860b }));
      chest.position.set(sp.x, baseY + sp.h - 0.6, sp.z);
      chest.castShadow = true;
      this.group.add(chest);
    }
  }

  _makeBonfire(x, z, name) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
    pit.position.y = 0.25;
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
      log.position.y = 0.6; log.rotation.z = 0.5; log.rotation.y = (i / 5) * Math.PI * 2;
      g.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
    flame.position.y = 1.3;
    const light = new THREE.PointLight(0xff8a2a, 2.2, 16); light.position.y = 1.6;
    g.add(pit, flame, light);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this.bonfires.push({ pos: new THREE.Vector3(x, y, z), mesh: g, flame, light, name });
  }

  _bonfires() {
    // A campfire in every town, plus one deep in each far area. These double
    // as fast-travel points once discovered.
    for (const t of TOWNS) this._makeBonfire(t.x + t.radius * 0.45, t.z, t.name);
    for (const a of AREAS) if (!a.safe && a.level >= 10) this._makeBonfire(a.x, a.z, a.name);
  }

  _spawnZones() {
    // Spawn zones are the named, level-gated areas (no enemies in safe areas).
    this.spawnZones = AREAS.filter((a) => !a.safe).map((a) => ({
      center: new THREE.Vector3(a.x, 0, a.z), radius: a.r * 0.85, level: a.level, count: a.count || 9, name: a.name,
    }));
  }

  // ---- Safe zones (no monsters near towns) ----
  nearestTown(pos) {
    let best = null, bd = Infinity;
    for (const t of TOWNS) { const d = Math.hypot(pos.x - t.x, pos.z - t.z); if (d < bd) { bd = d; best = t; } }
    return { town: best, dist: bd };
  }
  inSafeZone(x, z) {
    for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.radius + 16) return t;
    return null;
  }

  _camps() {
    // Elite war-camps: clusters of tough enemies guarding a loot chest.
    // The chest stays locked until every camp member is slain.
    const specs = [
      { id: 'camp_forest', x: 130, z: 95, level: 5 },
      { id: 'camp_snow', x: -128, z: 100, level: 7 },
      { id: 'camp_desert', x: 135, z: -100, level: 10 },
      { id: 'camp_swamp', x: -130, z: -102, level: 14 },
    ];
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xb8860b });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x8a6410 });
    for (const sp of specs) {
      const y = heightAt(sp.x, sp.z);
      // Fire-ring decor marking the camp.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.25, 6, 18),
        new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, y + 0.12, sp.z);
      this.group.add(ring);
      // Treasure chest with an openable lid.
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.2), chestMat); base.position.y = 0.45;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.2), lidMat); lidMesh.position.set(0, 0.25, 0);
      lid.position.set(0, 0.9, -0.6); lid.add(lidMesh);
      const lockGlow = new THREE.PointLight(0xffcf3a, 0, 8); lockGlow.position.y = 1.4;
      chest.add(base, lid, lockGlow);
      chest.position.set(sp.x, y, sp.z);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);
      this.camps.push({
        id: sp.id, level: sp.level,
        pos: new THREE.Vector3(sp.x, y, sp.z),
        chest, lid, glow: lockGlow, opened: false, members: [],
      });
    }
  }

  campCleared(camp) { return camp.members.length > 0 && camp.members.every((m) => !m.alive); }
  nearestCamp(pos, maxDist = 4.5) {
    for (const c of this.camps) { if (c.pos.distanceTo(pos) < maxDist) return c; }
    return null;
  }

  // Animate flickering bonfires + drifting clouds.
  update(t, dt = 0.016) {
    if (this.clouds) {
      for (const c of this.clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 240) c.position.x = -240; // wrap around
      }
    }
    for (const b of this.bonfires) {
      const f = 0.8 + Math.sin(t * 12 + b.pos.x) * 0.15 + Math.sin(t * 7) * 0.1;
      b.flame.scale.set(1, f, 1);
      b.light.intensity = 1.8 + f * 0.6;
    }
    if (this.water) this.water.position.y = -4.2 + Math.sin(t * 0.6) * 0.15;
    if (this._nexusOrb) { this._nexusOrb.rotation.y += dt; this._nexusOrb.rotation.x += dt * 0.5; }

    // Camp chests: glow once unlocked; swing the lid open when looted.
    for (const c of this.camps) {
      if (c.opened) {
        c.lid.rotation.x = THREE.MathUtils.lerp(c.lid.rotation.x, -2.2, Math.min(1, dt * 6));
        c.glow.intensity = 0;
      } else if (this.campCleared(c)) {
        c.glow.intensity = 1.4 + Math.sin(t * 5) * 0.5; // ready-to-open shimmer
      }
    }
  }

  nearestBonfire(pos, maxDist = 4) {
    let best = null, bd = maxDist;
    for (const b of this.bonfires) {
      const d = b.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---- Collision ----
  // Push a horizontal circle (cx,cz,r) out of any solid collider.
  // Returns the climbable collider it is pressed against, if any.
  resolveCircle(cx, cz, r) {
    let touchingClimb = null;
    for (const c of this.colliders) {
      // closest point on AABB (xz only)
      const nx = THREE.MathUtils.clamp(cx, c.min.x, c.max.x);
      const nz = THREE.MathUtils.clamp(cz, c.min.z, c.max.z);
      const dx = cx - nx, dz = cz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (r - d) / d;
        if (d2 > 0.0000001) {
          cx += dx * push; cz += dz * push;
        } else {
          cx += r; // dead-center fallback
        }
        if (c.climbable) touchingClimb = c;
      }
    }
    return { x: cx, z: cz, climb: touchingClimb };
  }

  // Is there a climbable surface within `reach` ahead of pos along dir?
  climbAhead(pos, dirX, dirZ, reach = 1.2) {
    const cx = pos.x + dirX * reach, cz = pos.z + dirZ * reach;
    for (const c of this.colliders) {
      if (!c.climbable) continue;
      if (cx >= c.min.x - 0.2 && cx <= c.max.x + 0.2 && cz >= c.min.z - 0.2 && cz <= c.max.z + 0.2) {
        return c;
      }
    }
    return null;
  }

  // Top Y of a collider (for finishing a climb / standing on cliffs).
  topOf(collider) { return collider.max.y; }
}
