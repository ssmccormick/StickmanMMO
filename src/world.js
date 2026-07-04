// ============================================================
// World: procedural 2.5D open world. Rolling heightfield terrain,
// a starter town, scattered trees/rocks, climbable cliffs (BotW
// style), and bonfire checkpoints (Dark Souls style). Also owns
// world collision (AABB boxes + ground height query).
// ============================================================
import * as THREE from 'three';
import { createStickman } from './stickman.js';
import { buildWeaponMesh } from './weapons.js';
import { GIVERS } from './quests.js';
// The deterministic world-data + terrain-height layer lives in a Three-free
// module so the multiplayer server can run the same world. world.js owns only
// the Three.js side (meshes, colours, collision, culling).
import {
  WORLD_SIZE, WATER_LEVEL, SCALE, hash2, smoothNoise, smoothstep, DEG, polar,
  BIOME_LAYOUT, BIOME_SIZE, BIOME_REGIONS, biomeWeights, TOWNS, capOff, AREAS,
  CAMPS, BOSSES, areaAt, ROADS, roadDistance, DUNGEONS, DUNGEON_SITES, MOUNTAINS,
  CAVES, CAVE_SITES, SEA_IN, SEA_OUT, EDGE_SHORE, LEVIATHAN_RADIUS,
  MAGE_TOWER, mageTowerSummitY, CASTLES, heightAt, townBaseHeight, BIOMES, biomeAt, biomeKeyAt,
} from './sim/terrain.js';

// Re-export the world-data API that the rest of the game imports from world.js.
export {
  WORLD_SIZE, WATER_LEVEL, TOWNS, AREAS, MOUNTAINS, BOSSES, DUNGEONS, CAVES,
  EDGE_SHORE, LEVIATHAN_RADIUS, MAGE_TOWER, heightAt, areaAt, BIOMES, biomeKeyAt,
};

const EMPTY_COLLIDERS = []; // shared empty list for resolveCircle grid misses

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

// Buff shrines — pray at one for a long-lived blessing (30–60 min).
const SHRINE_TYPES = [
  { id: 'might', name: 'Shrine of Might', glyph: '⚔️', color: 0xff6a2a, buff: { dmgMult: 1.25 }, dur: 2700, desc: '+25% damage' },
  { id: 'swift', name: 'Shrine of Swiftness', glyph: '🪽', color: 0x6fc8ff, buff: { speedMult: 1.20 }, dur: 2700, desc: '+20% move speed' },
  { id: 'titan', name: 'Shrine of the Titan', glyph: '💪', color: 0x9be29e, buff: { str: 14, dex: 14, int: 14 }, dur: 1800, desc: '+14 to all attributes' },
  { id: 'fury', name: 'Shrine of Fury', glyph: '🔥', color: 0xffae42, buff: { dmgMult: 1.18, speedMult: 1.10 }, dur: 3600, desc: '+18% damage & +10% speed' },
];

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
    this.dungeons = [];    // { id, name, entrance, spawn, exit, level, cleared }
    this.caves = [];       // { id, name, entrance, spawn, exit, chest, ... }
    this.mountains = [];    // { pos, r, h }
    this.critters = [];    // ambient wandering creatures
    this.treasures = [];   // hidden loot chests scattered in the wild
    this.shrines = [];     // buff shrines
    this.puzzles = [];     // rune-sequence puzzle chests
    this.landmarks = [];   // named map landmarks (castles, mage tower, fishing villages)
    this.bossSites = [];   // { x, z, type, level, name } — bosses spawned by main
    this.extraSpawns = []; // { x, z, type, level, elite } — structure guards spawned by main
    this.castleChests = []; // { pos, chest, lid, glow, opened, level, name, radius } — clear-to-open
    this._build();
  }

  _build() {
    this._sky();
    this._terrain();
    this._towns();
    this._scatter();
    this._forests();
    this._groundDetail();
    this._ruins();
    this._cliffs();
    this._mountains();
    this._ranges();
    this._camps();
    this._landmarks();
    this._dungeons();
    this._caves();
    this._bonfires();
    this._spawnZones();
    this._wakingVale();
    this._swordInStone();
    this._shrines();
    this._treasures();
    this._puzzles();
    this._ambientLife();
    this._aerial();
    this._setupCulling();
  }

  // ---- Streaming / culling: only draw objects near the player ----
  // Bucket every non-essential object into a coarse grid; cull() then shows
  // only the cells around the player. Colliders get their own finer grid so
  // movement only tests nearby boxes instead of all ~1500 of them.
  _setupCulling() {
    const CELL = 56;
    this._cullCell = CELL;
    this._cullRadiusCells = 4; // ~224u shown; the tight fog (~205) hides the cull edge
    this._cullBuckets = new Map();
    for (const obj of this.group.children) {
      if (obj.userData.noCull) continue;
      const k = Math.floor(obj.position.x / CELL) + ',' + Math.floor(obj.position.z / CELL);
      let arr = this._cullBuckets.get(k); if (!arr) this._cullBuckets.set(k, arr = []);
      arr.push(obj);
      obj.visible = false;
    }
    // Compute every prop's world matrix ONCE, then freeze it: culled props are
    // static, so re-deriving their matrices every frame is pure waste. cull()
    // re-enables matrix updates only for the cells currently shown — so the
    // per-frame matrix pass scales with the small area around you, not the whole
    // continent (this is the big win against the frame spikes / lag).
    this.group.updateMatrixWorld(true);
    for (const arr of this._cullBuckets.values()) for (const o of arr) o.matrixWorldAutoUpdate = false;
    this._cullActive = new Set();
    this._cullKey = null;
    this._indexColliders();
    this.cull(0, 0); // show the Nexus area immediately (spawn + start-screen backdrop)
  }
  cull(px, pz) {
    if (!this._cullBuckets) return;
    const CELL = this._cullCell, R = this._cullRadiusCells;
    const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
    const key = pcx + ',' + pcz;
    if (key === this._cullKey) return; // only re-evaluate when the player crosses a cell
    this._cullKey = key;
    const want = new Set();
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) want.add((pcx + dx) + ',' + (pcz + dz));
    for (const k of this._cullActive) if (!want.has(k)) { const a = this._cullBuckets.get(k); if (a) for (const o of a) { o.visible = false; o.matrixWorldAutoUpdate = false; } }
    for (const k of want) if (!this._cullActive.has(k)) { const a = this._cullBuckets.get(k); if (a) for (const o of a) { o.visible = true; o.matrixWorldAutoUpdate = true; } }
    this._cullActive = want;
  }
  _indexColliders() {
    const CELL = 32, PAD = 2; // pad so an entity's own cell holds every box it could touch
    this._colCell = CELL;
    this._colGrid = new Map();
    for (const c of this.colliders) {
      const minx = Math.floor((c.min.x - PAD) / CELL), maxx = Math.floor((c.max.x + PAD) / CELL);
      const minz = Math.floor((c.min.z - PAD) / CELL), maxz = Math.floor((c.max.z + PAD) / CELL);
      for (let gx = minx; gx <= maxx; gx++) for (let gz = minz; gz <= maxz; gz++) {
        const k = gx + ',' + gz; let a = this._colGrid.get(k); if (!a) this._colGrid.set(k, a = []); a.push(c);
      }
    }
  }

  _sky() {
    this.scene.background = new THREE.Color(0x9fc4e8);
    // Tight distance fog: things fade out by ~200u so the world reads as a
    // misty continent and distant objects can be culled without a visible pop.
    this.scene.fog = new THREE.Fog(0x9fc4e8, 60, 205);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a7050, 0.85);
    this.scene.add(hemi);
    this.hemi = hemi;
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

    // Day/night palette + a star field that fades in at night.
    this._dayCol = new THREE.Color(0x9fc4e8);
    this._duskCol = new THREE.Color(0xe88a4a);
    this._nightCol = new THREE.Color(0x0a1024);
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 600; i++) {
      const a = hash2(i, 91) * Math.PI * 2, el = hash2(i, 93) * Math.PI * 0.5 + 0.1, r = 500;
      sp.push(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r + 60, Math.sin(a) * Math.cos(el) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    // fog:false so the far-off star field / clouds stay as a backdrop despite the tight fog.
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0, fog: false }));
    this.stars.userData.noCull = true;
    this.scene.add(this.stars);

    // Stylized drifting clouds for the 2.5D backdrop.
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
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
      c.userData.noCull = true;
      this.group.add(c);
      this.clouds.push(c);
    }
  }

  _terrain() {
    // Segment count scales with the (now much larger) world so hills keep a
    // similar on-screen resolution instead of turning into coarse facets.
    const seg = 480;
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
    mesh.userData.noCull = true; // one big ground mesh — always drawn (fog hides the far parts)
    this.group.add(mesh);

    // Water plane (lakes/seas sit in the low biome areas).
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
      new THREE.MeshLambertMaterial({ color: 0x3b6ea5, transparent: true, opacity: 0.78 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    water.userData.noCull = true;
    this.group.add(water);
    this.water = water;
  }

  _addBox(mesh, climbable = false, pad = 0) {
    // Register an AABB collider derived from the mesh's bounding box.
    // updateWorldMatrix(true, true) refreshes ANCESTORS first (a plain
    // updateMatrixWorld would leave the parent group's matrix stale, so a house
    // added inside a positioned group would get a collider stuck at the origin
    // instead of where the house actually stands — houses wouldn't block).
    mesh.updateWorldMatrix(true, true);
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
      ash: { wall: 0x4a3c36, wall2: 0x3a2e2a, roofs: [0x8a2a1a, 0x6a2414, 0xb04a2a], plaza: 0x423630 },
      jungle: { wall: 0x6a7a4a, wall2: 0x5a6a3a, roofs: [0x2f6e2a, 0x3f7e2f, 0x4a5a2a], plaza: 0x5e6a44 },
      crystal: { wall: 0xb4bce0, wall2: 0xc8c2ec, roofs: [0x7a6ad0, 0x9a8ad8, 0xa8b0f0], plaza: 0xc2c6e8 },
      badlands: { wall: 0xc08856, wall2: 0xa86a3a, roofs: [0x8a4a2a, 0xa0522d, 0x6a3a22], plaza: 0xbb8a5a },
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

    // Houses ringed around the plaza (two rings for the bigger Nexus city).
    const houseCount = big ? 16 : 6;
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
    // The Nexus gets a second, inner ring of houses — a proper city.
    if (big) {
      const inner = 9;
      for (let i = 0; i < inner; i++) {
        const ang = (i / inner) * Math.PI * 2 + 0.35;
        const hr = R * 0.42 + (hash2(i + cx + 99, cz) - 0.5) * 3;
        const hx = cx + Math.cos(ang) * hr, hz = cz + Math.sin(ang) * hr;
        const sz = 4 + hash2(i + 5, cx) * 2.5;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(sz, 3.6, sz), wallMats[i % 2]);
        body.position.y = 1.8;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.82, 2.4, 4), roofMats[i % roofMats.length]);
        roof.position.y = 4.9; roof.rotation.y = Math.PI / 4;
        g.add(body, roof);
        g.position.set(hx, heightAt(hx, hz), hz); g.rotation.y = -ang;
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.group.add(g);
        this._addBox(body, false);
      }
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
    const lamps = big ? 14 : 5;
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
    for (let i = 0; i < (big ? 10 : 4); i++) {
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
    for (let i = 0; i < 270; i++) {
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
    const charredMat = new THREE.MeshLambertMaterial({ color: 0x2a1f1a });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
    const jungleTrunk = new THREE.MeshLambertMaterial({ color: 0x6a5a3a });
    const frondMats = [0x2f7e2a, 0x3a8e34, 0x256e22].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const crystalScatter = [0x7ab0ff, 0xb07bff, 0x9a8ad8].map((c) => new THREE.MeshBasicMaterial({ color: c }));

    for (let i = 0; i < 3300; i++) {
      const ang = hash2(i, 11) * Math.PI * 2;
      const rad = 24 + hash2(i, 13) * (WORLD_SIZE - 30);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.5) continue; // skip water
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 4) continue;
      const biome = biomeAt(x, z);

      if (hash2(i, 17) < 0.7) {
        const g = new THREE.Group();
        let solid = null; // collider mesh — registered AFTER g is positioned & added
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
          solid = body;
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
          solid = trunk;
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
          solid = trunk;
        } else if (biome.prop === 'charred') {
          // Charred, twisted dead tree with a faint ember at its root.
          const th = 1.8 + hash2(i, 19) * 2.2;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.3, th, 6), charredMat);
          trunk.position.y = th / 2; g.add(trunk);
          for (let k = 0; k < 2; k++) {
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.9, 4), charredMat);
            br.position.y = th * (0.6 + k * 0.18); br.rotation.z = (hash2(i, k) - 0.5) * 2.2; g.add(br);
          }
          const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), emberMat); ember.position.y = 0.16; g.add(ember);
        } else if (biome.prop === 'jungle') {
          // Tall jungle palm: a slim trunk crowned with broad drooping fronds.
          const th = 3.2 + hash2(i, 19) * 3.4;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, th, 6), jungleTrunk);
          trunk.position.y = th / 2; g.add(trunk);
          const n = 5 + Math.floor(hash2(i, 21) * 3);
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            const frond = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.1, 4), frondMats[(i + k) % frondMats.length]);
            frond.position.set(Math.cos(a) * 0.7, th - 0.3, Math.sin(a) * 0.7);
            frond.rotation.set(Math.sin(a) * 1.35, -a, -Math.cos(a) * 1.35); g.add(frond);
          }
          solid = trunk;
        } else if (biome.prop === 'crystal') {
          // A cluster of glowing crystal spikes jutting from the ground.
          const n = 2 + Math.floor(hash2(i, 19) * 3);
          for (let k = 0; k < n; k++) {
            const ch = 1.0 + hash2(i, 20 + k) * 2.4;
            const cry = new THREE.Mesh(new THREE.ConeGeometry(0.18 + hash2(i, k) * 0.14, ch, 5), crystalScatter[(i + k) % crystalScatter.length]);
            cry.position.set((hash2(i, k) - 0.5) * 1.5, ch / 2, (hash2(k, i) - 0.5) * 1.5);
            cry.rotation.z = (hash2(i, k) - 0.5) * 0.4; g.add(cry);
          }
        } else {
          // Leafy tree.
          const th = 2 + hash2(i, 19) * 2.5;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, th, 6), trunkMat);
          trunk.position.y = th / 2;
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4 + hash2(i, 23), 2.6 + hash2(i, 29) * 1.5, 7),
            leafMats[i % leafMats.length]);
          leaf.position.y = th + 1;
          g.add(trunk, leaf);
          solid = trunk;
        }
        g.position.set(x, y, z);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(g);
        if (solid) this._addBox(solid, false); // now that g sits at (x,y,z), the box is correct
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

  // Heavy, thick forests of tall trees densely packed into the forest areas,
  // layered on top of the lighter world-wide scatter so the woods feel deep.
  _forests() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3f28 });
    const canopyMats = [0x274e22, 0x2f5f2a, 0x386b2f, 0x3f5a26].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const forestAreas = AREAS.filter((a) => (a.biome === 'forest' || a.biome === 'jungle') && !a.safe);
    for (const fa of forestAreas) {
      for (let i = 0; i < 220; i++) {
        const a = hash2(i, fa.x + 7) * Math.PI * 2;
        const rad = Math.sqrt(hash2(i, fa.z + 3)) * fa.r * 0.96; // sqrt → even area fill
        const x = fa.x + Math.cos(a) * rad, z = fa.z + Math.sin(a) * rad;
        const y = heightAt(x, z);
        if (y < -3) continue;
        if (this.inSafeZone(x, z) || roadDistance(x, z) < 5) continue;
        const g = new THREE.Group();
        // A tall trunk — much taller than scatter trees — with stacked canopy.
        const th = 6 + hash2(i, 19) * 8;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, th, 7), trunkMat);
        trunk.position.y = th / 2; g.add(trunk);
        const layers = 3 + Math.floor(hash2(i, 21) * 2);
        for (let k = 0; k < layers; k++) {
          const cr = (2.8 - k * 0.55) + hash2(i, k) * 0.4;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, 2.6, 8), canopyMats[(i + k) % canopyMats.length]);
          cone.position.y = th * 0.68 + k * 1.6; g.add(cone);
        }
        g.position.set(x, y, z);
        g.rotation.y = hash2(i, 33) * Math.PI * 2;
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(g);
        this._addBox(trunk, false);
      }
    }
  }

  _groundDetail() {
    // Bushes (small leafy clumps) and flower tufts to dress the ground.
    // Purely decorative — no colliders, so they never block movement.
    const bushMats = [0x3f7d3a, 0x4f8f3f, 0x57752f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const flowerMats = [0xe85c8a, 0xf2c14e, 0xe8e8e8, 0x9a7bdc].map((c) => new THREE.MeshBasicMaterial({ color: c }));

    for (let i = 0; i < 1800; i++) {
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
    // Out in the reaches (beyond the Sundered Sea), as climbable landmarks.
    const specs = [
      { x: 135, z: 58, w: 22, h: 16, d: 7 },
      { x: -158, z: 96, w: 30, h: 20, d: 8 },
      { x: -112, z: -138, w: 26, h: 14, d: 7 },
      { x: 56, z: -162, w: 24, h: 22, d: 7 },
      { x: 186, z: -34, w: 34, h: 26, d: 9 },
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

  // Big mountains — each is one large rock cone topped with a white snow cap.
  // A central collider box (kept inside the silhouette) makes them solid
  // barriers; mountains flagged with a cave get a dark mouth at the base that
  // descends into an instanced cavern.
  _mountains() {
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6e6a63 });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
    for (const m of MOUNTAINS) {
      const baseY = heightAt(m.x, m.z);
      const g = new THREE.Group();
      // One large cone for the whole peak.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(m.r, m.h, 9), rockMat);
      cone.position.y = m.h / 2;
      g.add(cone);
      // White snow cap: a smaller cone sitting on the upper third of the peak,
      // sized so its base ring matches the mountain's slope (no gap/overhang).
      const capFrac = 0.34;             // cap covers the top 34% of the height
      const capH = m.h * capFrac;
      const capR = m.r * capFrac;       // slope is linear, so radius scales with height
      const cap = new THREE.Mesh(new THREE.ConeGeometry(capR, capH, 9), snowMat);
      cap.position.y = m.h - capH / 2;
      g.add(cap);
      g.position.set(m.x, baseY, m.z);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      const fw = m.r * 0.78; // collider footprint (half-width), well inside the cone
      this.colliders.push({
        min: new THREE.Vector3(m.x - fw, baseY - 2, m.z - fw),
        max: new THREE.Vector3(m.x + fw, baseY + m.h, m.z + fw),
        climbable: false,
      });
      this.mountains.push({ pos: new THREE.Vector3(m.x, baseY, m.z), r: m.r, h: m.h });
      // Cave mouth at the south base.
      if (m.cave) {
        const cave = CAVES.find((c) => c.id === m.cave);
        const mx = m.x, mz = m.z + fw + 1.4, my = heightAt(mx, mz);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.55, 8, 16, Math.PI),
          new THREE.MeshLambertMaterial({ color: 0x4a463f }));
        arch.position.set(mx, my + 0.2, mz);
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.0, 16, 0, Math.PI),
          new THREE.MeshBasicMaterial({ color: 0x05060a }));
        mouth.position.set(mx, my + 0.2, mz + 0.06);
        arch.castShadow = true;
        this.group.add(arch, mouth);
        if (cave) cave._entrancePos = new THREE.Vector3(mx, my, mz + 2.2);
      }
    }
  }

  // Mountain ranges along the borders between adjacent regions, so each biome
  // reads as its own walled-off region. A pass is carved through each range
  // (and gaps are left where areas, towns and roads sit) so you funnel between
  // regions through the passes. Peaks are solid (non-climbable) colliders.
  _ranges() {
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6e6a63 });
    const rockDark = new THREE.MeshLambertMaterial({ color: 0x595550 });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
    // Borders run along the bisector between each pair of neighbouring regions.
    const headings = BIOME_REGIONS.map((r) => (Math.atan2(r.z, r.x) * 180 / Math.PI + 360) % 360).sort((a, b) => a - b);
    const borders = headings.map((a, i) => (((a + (i + 1 < headings.length ? headings[i + 1] : headings[0] + 360)) / 2) % 360));
    this.passes = [];
    const RIN = SEA_OUT + 4, ROUT = WORLD_SIZE - 12; // ranges start at the far shore of the Sundered Sea
    const addPeak = (px, pz, rad, hgt, mat) => {
      const baseY = heightAt(px, pz);
      if (baseY < -3) return;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 8), mat);
      cone.position.set(px, baseY + hgt / 2 - 1, pz);
      cone.castShadow = true; cone.receiveShadow = true;
      this.group.add(cone);
      if (hgt > 46) {
        const capH = hgt * 0.3;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.3, capH, 8), snowMat);
        cap.position.set(px, baseY + hgt - 1 - capH / 2, pz);
        this.group.add(cap);
      }
      const fw = rad * 0.92;
      this.colliders.push({ min: new THREE.Vector3(px - fw, baseY - 2, pz - fw), max: new THREE.Vector3(px + fw, baseY + hgt, pz + fw), climbable: false });
    };
    for (let bi = 0; bi < borders.length; bi++) {
      const ang = borders[bi] * DEG, ux = Math.cos(ang), uz = Math.sin(ang);
      const passR = 172 + (hash2(bi, 71) - 0.5) * 30; // vary where each pass sits
      const passHalf = 16;
      for (let r = RIN; r <= ROUT; r += 8) {
        if (Math.abs(r - passR) < passHalf) continue; // leave the pass open
        // Two staggered rows (slight lateral offset) make a thicker, solid wall.
        for (const row of [-3.5, 3.5]) {
          const lat = row + (hash2(bi * 9 + Math.round(r), 13) - 0.5) * 5;
          const px = ux * r - uz * lat, pz = uz * r + ux * lat;
          if (this.inSafeZone(px, pz) || roadDistance(px, pz) < 9) continue;
          let inArea = false;
          for (const a of AREAS) if (!a.safe && Math.hypot(px - a.x, pz - a.z) < a.r + 2) { inArea = true; break; }
          if (inArea) continue;
          addPeak(px, pz, 11 + hash2(Math.round(r) + (row > 0 ? 1 : 0), bi) * 5, 34 + hash2(bi, Math.round(r) + (row > 0 ? 7 : 0)) * 32, (Math.round(r) % 21 < 10) ? rockMat : rockDark);
        }
      }
      // Flank the pass with two tall snow-capped marker peaks so it's findable.
      const ppx = ux * passR, ppz = uz * passR;
      this.passes.push({ pos: new THREE.Vector3(ppx, heightAt(ppx, ppz), ppz), heading: borders[bi] });
      for (const side of [-1, 1]) {
        addPeak(ux * passR - uz * side * (passHalf + 11), uz * passR + ux * side * (passHalf + 11), 13, 58, rockMat);
      }
    }
  }

  // Instanced caverns reached via a mountain mouth: a deep, dark, crystal-lit
  // room far off the overworld (flat floor at a low Y so it reads as "down").
  _caves() {
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x2e2a33 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x3a3640 });
    const crystalCols = [0x6fd0ff, 0xb07bff, 0x7bffcf];
    for (const c of CAVES) {
      const sx = c.sx, sz = c.sz, fy = c.floorY, half = 36;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1, half * 2), floorMat);
      floor.position.set(sx, fy - 0.5, sz); floor.receiveShadow = true;
      this.group.add(floor);
      // Perimeter walls + an enclosing ceiling.
      for (const [ox, oz, w, dp] of [[0, half, half * 2, 2], [0, -half, half * 2, 2], [half, 0, 2, half * 2], [-half, 0, 2, half * 2]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 11, dp), rockMat);
        wall.position.set(sx + ox, fy + 5.5, sz + oz);
        this.group.add(wall); this._addBox(wall, false);
      }
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1, half * 2), rockMat);
      ceil.position.set(sx, fy + 10, sz); this.group.add(ceil);
      // Stalagmites (up from floor) and stalactites (down from ceiling).
      for (let i = 0; i < 28; i++) {
        const a = hash2(i, 71) * Math.PI * 2, r = 4 + hash2(i, 73) * (half - 6);
        const px = sx + Math.cos(a) * r, pz = sz + Math.sin(a) * r;
        const hh = 1.2 + hash2(i, 77) * 3.2;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4 + hash2(i, 79) * 0.6, hh, 6), rockMat);
        if (hash2(i, 75) > 0.45) cone.position.set(px, fy + hh / 2, pz);
        else { cone.position.set(px, fy + 10 - hh / 2, pz); cone.rotation.x = Math.PI; }
        cone.castShadow = true; this.group.add(cone);
      }
      // Glowing crystal clusters light the dark.
      for (let i = 0; i < 8; i++) {
        const a = hash2(i, 81) * Math.PI * 2, r = 6 + hash2(i, 83) * (half - 9);
        const px = sx + Math.cos(a) * r, pz = sz + Math.sin(a) * r;
        const col = crystalCols[i % crystalCols.length];
        const cl = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const ch = 0.8 + hash2(i, k) * 1.6;
          const cry = new THREE.Mesh(new THREE.ConeGeometry(0.18, ch, 5), new THREE.MeshBasicMaterial({ color: col }));
          cry.position.set((hash2(i, k) - 0.5) * 1.2, ch / 2, (hash2(k, i) - 0.5) * 1.2);
          cry.rotation.z = (hash2(i, k) - 0.5) * 0.5; cl.add(cry);
        }
        const lt = new THREE.PointLight(col, 1.6, 22); lt.position.y = 1.6; cl.add(lt);
        cl.position.set(px, fy, pz); this.group.add(cl);
      }
      // A soft, cool fill so the cavern stays moody but navigable at any hour.
      const fill = new THREE.PointLight(0x7088aa, 0.7, 150);
      fill.position.set(sx, fy + 7, sz); this.group.add(fill);
      // A descending entry ledge (the tunnel you arrive down), an exit portal
      // beside the spawn, and a treasure cache at the deep end.
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 16), floorMat);
      ramp.position.set(sx, fy + 2.4, sz + half - 8); ramp.rotation.x = 0.42;
      this.group.add(ramp);
      this._portal(sx, fy, sz + half - 7, 0x9fd0ff);
      const spawn = new THREE.Vector3(sx, fy, sz + half - 18);
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: 0xb8860b })); base.position.y = 0.45;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a6410 })); lidMesh.position.set(0, 0.25, 0);
      lid.position.set(0, 0.9, -0.6); lid.add(lidMesh);
      const glow = new THREE.PointLight(0xffcf3a, 0, 8); glow.position.y = 1.4;
      chest.add(base, lid, glow); chest.position.set(sx, fy, sz - half + 7);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);

      const entrance = c._entrancePos ? c._entrancePos.clone() : new THREE.Vector3(c.ex, heightAt(c.ex, c.ez), c.ez);
      this.caves.push({
        id: c.id, name: c.name, level: c.level || 0, entrance, spawn,
        exit: new THREE.Vector3(sx, fy, sz + half - 7),
        center: new THREE.Vector3(sx, fy, sz),
        chestPos: new THREE.Vector3(sx, fy, sz - half + 7),
        chest, lid, glow, opened: false,
      });
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
    // Use nearly the whole area radius so packs spread out rather than bunching.
    this.spawnZones = AREAS.filter((a) => !a.safe).map((a) => ({
      center: new THREE.Vector3(a.x, 0, a.z), radius: a.r * 0.95, level: a.level, count: a.count || 9, name: a.name, biome: a.biome,
    }));
    // Extra WILD spawn zones scattered through the now-vast open world, filling
    // the space between named areas from the heartland all the way to the coast.
    // Level scales with distance out; each zone's creatures theme to its biome.
    for (let i = 0; i < 80; i++) {
      const ang = hash2(i, 71) * Math.PI * 2;
      const rad = (0.14 + hash2(i, 73) * 0.70) * WORLD_SIZE; // out to ~the shore
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (this.inSafeZone(x, z) || heightAt(x, z) < WATER_LEVEL + 0.5) continue;
      const level = Math.max(1, Math.round(2 + (rad / WORLD_SIZE) * 44)); // farther = tougher
      this.spawnZones.push({ center: new THREE.Vector3(x, 0, z), radius: 36, level, count: 8, name: null });
    }
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
    // The chest stays locked until every camp member is slain. Positions derive
    // from BIOME_LAYOUT (one per biome, between the town and the high area).
    // The eight biome camps, plus a spread of extra elite camps scattered across
    // the now-vast open world (level scaling with distance from the heartland).
    const scattered = [];
    for (let i = 0; i < 18; i++) {
      const ang = hash2(i, 311) * Math.PI * 2;
      const rad = (0.2 + hash2(i, 313) * 0.6) * WORLD_SIZE;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (this.inSafeZone(x, z) || heightAt(x, z) < WATER_LEVEL + 1) continue;
      const level = Math.max(4, Math.round(6 + (rad / WORLD_SIZE) * 40));
      scattered.push({ id: 'ecamp_' + i, level, x, z });
    }
    const specs = [...CAMPS, ...scattered];
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
      const lockRing = this._lockRing();
      chest.add(base, lid, lockGlow, lockRing);
      chest.position.set(sp.x, y, sp.z);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);
      this.camps.push({
        id: sp.id, level: sp.level,
        pos: new THREE.Vector3(sp.x, y, sp.z),
        chest, lid, glow: lockGlow, ring: lockRing, opened: false, members: [],
      });
    }
  }

  // ---- Big landmarks that fill the now-larger world: enemy castles, a great
  // multi-level mage tower, friendly fishing villages on the coast, and a few
  // extra bandit bases. Each registers a map landmark; the fortified ones add a
  // boss site that main.js populates. ----
  _landmarks() {
    const R = WORLD_SIZE;
    const polarPt = (deg, rad) => ({ x: Math.cos(deg * Math.PI / 180) * rad, z: Math.sin(deg * Math.PI / 180) * rad });

    // A safe-ish flat-enough anchor: nudge off water if the spot is submerged.
    const landAt = (p) => { let y = heightAt(p.x, p.z); return { ...p, y }; };

    // --- Enemy castles (positions + flattened pads defined in terrain.js) ---
    for (const c of CASTLES) {
      const p = { x: c.x, z: c.z, y: heightAt(c.x, c.z) }; // heightAt is the flat pad here
      if (p.y < WATER_LEVEL + 1) continue; // don't drop a castle in the sea
      this._castle(p.x, p.y, p.z, c.name);
      this.bossSites.push({ x: p.x, z: p.z, type: 'knight', level: c.level, name: `Lord of ${c.name}` });
      // Garrison: a full company of knight/brute/archer guards across the
      // courtyard and walls — the castle has to be cleared to loot the vault.
      const GUARDS = 16;
      for (let i = 0; i < GUARDS; i++) {
        const a = (i / GUARDS) * Math.PI * 2 + (i % 2) * 0.2;
        const gr = 8 + (i % 4) * 8;                 // spread across the courtyard rings
        const type = i % 4 === 0 ? 'brute' : (i % 4 === 2 ? 'archer' : 'knight');
        this.extraSpawns.push({ x: p.x + Math.cos(a) * gr, z: p.z + Math.sin(a) * gr, type, level: c.level - 3, elite: true });
      }
      // The castle vault — a special chest behind the keep, locked until cleared.
      this._castleVault(p.x, p.y, p.z, c.level, c.name);
      this.landmarks.push({ name: c.name, x: p.x, z: p.z, glyph: '🏰', color: '#c98a5a' });
    }

    // --- The great Mage Tower (Arcanum Spire): a colossal stepped spire (built
    //     into the terrain — see MAGE_TOWER in terrain.js) that you climb tier by
    //     tier to a broad flat summit where the Archmagus awaits, ringed by
    //     ramparts so the fight stays on top. Guards defend the tiers. ---
    {
      const mt = MAGE_TOWER;
      const foot = heightAt(mt.x, mt.z) - mt.height; // heightAt at centre = summit; foot = summit - height
      const summitY = heightAt(mt.x, mt.z);
      this._mageTower(mt.x, foot, mt.z, summitY);
      // The Archmagus stands at the centre of the summit arena.
      this.bossSites.push({ x: mt.x, z: mt.z, type: 'hexer', level: 36, name: 'Archmagus Nyxaris', boss: true });
      // Acolyte guards on the summit and partway down the tiers.
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.4; this.extraSpawns.push({ x: mt.x + Math.cos(a) * (mt.topR - 6), z: mt.z + Math.sin(a) * (mt.topR - 6), type: 'hexer', level: 33, elite: true }); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const rr = mt.topR + 22; this.extraSpawns.push({ x: mt.x + Math.cos(a) * rr, z: mt.z + Math.sin(a) * rr, type: i % 2 ? 'archer' : 'knight', level: 30, elite: true }); }
      this.landmarks.push({ name: 'The Arcanum Spire', x: mt.x, z: mt.z, glyph: '🔮', color: '#b78bff' });
    }

    // --- Friendly fishing villages out on the coast (safe rest stops) ---
    const villageSpecs = [
      { deg: 20, name: 'Saltbrook' }, { deg: 115, name: 'Codhaven' },
      { deg: 250, name: 'Tidewater' }, { deg: 320, name: 'Pearlbay' },
    ];
    for (const v of villageSpecs) {
      // Walk outward until we near the shore, then sit just inland of it.
      let rad = R * 0.82, p = landAt(polarPt(v.deg, rad));
      for (let i = 0; i < 10 && p.y > WATER_LEVEL + 1.5; i++) { rad += R * 0.015; p = landAt(polarPt(v.deg, rad)); }
      rad -= R * 0.03; p = landAt(polarPt(v.deg, rad)); // step back onto solid ground
      if (p.y < WATER_LEVEL) continue;
      this._fishingVillage(p.x, p.y, p.z, v.name, v.deg);
      this.landmarks.push({ name: v.name, x: p.x, z: p.z, glyph: '🎣', color: '#7fd4e0' });
    }

    // --- A few extra bandit bases (populated like camps) in the open mid-world ---
    const baseSpecs = [
      { deg: 80, rad: R * 0.42, level: 16 }, { deg: 190, rad: R * 0.44, level: 26 },
      { deg: 300, rad: R * 0.42, level: 34 }, { deg: 5, rad: R * 0.62, level: 24 },
    ];
    for (let i = 0; i < baseSpecs.length; i++) {
      const b = baseSpecs[i];
      const p = landAt(polarPt(b.deg, b.rad));
      if (p.y < WATER_LEVEL + 1) continue;
      this._banditBase(p.x, p.y, p.z);
      this.camps.push({ id: 'base_' + i, level: b.level, pos: new THREE.Vector3(p.x, p.y, p.z), chest: null, lid: null, glow: null, opened: true, members: [] });
    }
  }

  // A square-walled enemy castle: curtain walls, four corner towers, a gatehouse.
  _castle(cx, cy, cz, name) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
    const stone2 = new THREE.MeshLambertMaterial({ color: 0x726c60 });
    const roof = new THREE.MeshLambertMaterial({ color: 0x5a3030 });
    const H = 40; // curtain half-width (footprint 80×80)
    const wallH = 7, wallT = 2;
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    this.group.add(g);
    // Four curtain walls (leave a gap on the +z side for a gate).
    const walls = [
      { x: 0, z: -H, w: H * 2, d: wallT },  // north
      { x: -H, z: 0, w: wallT, d: H * 2 },  // west
      { x: H, z: 0, w: wallT, d: H * 2 },   // east
      { x: -H * 0.55, z: H, w: H * 0.9, d: wallT }, // south-left (gate gap in middle)
      { x: H * 0.55, z: H, w: H * 0.9, d: wallT },  // south-right
    ];
    for (const wdef of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wdef.w, wallH, wdef.d), stone);
      wall.position.set(wdef.x, wallH / 2, wdef.z);
      g.add(wall);
      wall.updateWorldMatrix(true, true); this._addBox(wall, false);
    }
    // Corner towers.
    for (const s of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, wallH + 6, 10), stone2);
      tower.position.set(s[0] * H, (wallH + 6) / 2, s[1] * H); g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(5.5, 5, 10), roof);
      cap.position.set(s[0] * H, wallH + 6 + 2.5, s[1] * H); g.add(cap);
      tower.updateWorldMatrix(true, true); this._addBox(tower, false);
    }
    // Gatehouse flanking the south gap.
    for (const sx of [-1, 1]) {
      const gh = new THREE.Mesh(new THREE.BoxGeometry(6, wallH + 4, 6), stone2);
      gh.position.set(sx * H * 0.16, (wallH + 4) / 2, H); g.add(gh);
      gh.updateWorldMatrix(true, true); this._addBox(gh, false);
    }
    // A central keep.
    const keep = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), stone);
    keep.position.set(0, 8, -H * 0.3); g.add(keep);
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(13, 8, 4), roof);
    keepRoof.position.set(0, 20, -H * 0.3); keepRoof.rotation.y = Math.PI / 4; g.add(keepRoof);
    keep.updateWorldMatrix(true, true); this._addBox(keep, false);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // The castle vault: a large, ornate treasure chest set before the keep. It
  // stays sealed (glowing) until the whole castle is cleared, then opens for a
  // high-tier reward. Registered in castleChests for the interaction/clear check.
  _castleVault(cx, cy, cz, level, name) {
    const H = 40;
    const vx = cx, vz = cz - H * 0.3 + 11; // just in front of the keep
    const y = heightAt(vx, vz);
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0xb8860b });
    const chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.9), chestMat); base.position.y = 0.75;
    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.9), lidMat); lidMesh.position.set(0, 0.4, 0);
    lid.position.set(0, 1.5, -0.95); lid.add(lidMesh);
    const glow = new THREE.PointLight(0xffcf3a, 0, 14); glow.position.y = 2.2;
    const ring = this._lockRing(); ring.scale.setScalar(1.3);
    chest.add(base, lid, glow, ring);
    chest.position.set(vx, y, vz);
    chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(chest);
    this.castleChests.push({
      pos: new THREE.Vector3(vx, y, vz), chest, lid, glow, ring,
      opened: false, level: level + 3, name, radius: H + 12, _engaged: false,
    });
  }

  // The Arcanum Spire's visuals — decorating the walkable stepped cone that
  // heightAt already carves (see MAGE_TOWER in terrain.js). Facade bands wrap
  // each tier, and a crenellated rampart rings the flat summit (with an entry
  // gap) — the ramparts are the only colliders, so they keep the boss and player
  // from walking off the top while the tiers stay walkable.
  _mageTower(cx, footY, cz, summitY) {
    const mt = MAGE_TOWER;
    const stone = new THREE.MeshLambertMaterial({ color: 0x4a4668 });
    const stone2 = new THREE.MeshLambertMaterial({ color: 0x565080 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x7a6ab0 });
    const g = new THREE.Group(); g.position.set(cx, 0, cz); // children use absolute Y
    this.group.add(g);

    // Facade band at each tier's riser (visual only — the cone is the walkway).
    for (let k = 1; k <= mt.tiers; k++) {
      const tierTopY = footY + mt.height * (k / mt.tiers);
      const rOuter = mt.topR + (1 - k / mt.tiers) * (mt.baseR - mt.topR);
      const step = mt.height / mt.tiers;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rOuter, rOuter + 2.4, step + 0.6, 30, 1, true), k % 2 ? stone : stone2);
      band.position.y = tierTopY - step / 2; g.add(band);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(rOuter, 0.35, 6, 32), trim);
      lip.rotation.x = Math.PI / 2; lip.position.y = tierTopY; g.add(lip);
    }

    // Crenellated rampart ring around the summit, with a gap on the +x side.
    const rampR = mt.topR - 1.5, segs = 34;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue; // entry gap at +x
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.4, 1.1), stone);
      wall.position.set(Math.cos(a) * rampR, summitY + 1.7, Math.sin(a) * rampR); wall.rotation.y = -a;
      g.add(wall);
      wall.updateWorldMatrix(true, true); this._addBox(wall, false); // solid — keeps the fight on top
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.1), stone2);
      merlon.position.set(Math.cos(a) * rampR, summitY + 3.6, Math.sin(a) * rampR); merlon.rotation.y = -a; g.add(merlon);
    }

    // Four corner braziers on the summit for atmosphere.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), trim);
      post.position.set(Math.cos(a) * (mt.topR - 4), summitY + 1.5, Math.sin(a) * (mt.topR - 4)); g.add(post);
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0xb78bff }));
      flame.position.set(Math.cos(a) * (mt.topR - 4), summitY + 3.3, Math.sin(a) * (mt.topR - 4)); g.add(flame);
      const bl = new THREE.PointLight(0xb78bff, 1.4, 26); bl.position.copy(flame.position); g.add(bl);
    }

    // A great arcane beacon floating high above the arena (no collider).
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: 0xc7a4ff }));
    orb.position.y = summitY + 26; g.add(orb);
    const glow = new THREE.PointLight(0xb78bff, 3.2, 120); glow.position.y = summitY + 26; g.add(glow);
    this._arcanumOrb = orb;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // A small, friendly fishing village on the coast: a few huts, a jetty over the
  // water, drying racks, and villagers. Also a bonfire so it's a rest/save stop.
  _fishingVillage(cx, cy, cz, name, deg) {
    const wall = new THREE.MeshLambertMaterial({ color: 0xb8a07a });
    const roof = new THREE.MeshLambertMaterial({ color: 0x5a7a8a });
    const woodM = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    this.group.add(g);
    // Huts.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const hr = 7 + hash2(i, cx) * 3;
      const hx = Math.cos(a) * hr, hz = Math.sin(a) * hr;
      const hut = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), wall); body.position.y = 1.3;
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.8, 4), roof); top.position.y = 3.4; top.rotation.y = Math.PI / 4;
      hut.add(body, top); hut.position.set(hx, heightAt(cx + hx, cz + hz) - cy, hz);
      g.add(hut);
      body.updateWorldMatrix(true, true); this._addBox(body, false);
    }
    // A jetty running toward deeper water (outward from the map centre).
    const outAng = deg * Math.PI / 180;
    for (let j = 1; j <= 6; j++) {
      const jx = Math.cos(outAng) * (8 + j * 2.4), jz = Math.sin(outAng) * (8 + j * 2.4);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.4), woodM);
      plank.position.set(jx, (WATER_LEVEL + 0.4) - cy, jz); g.add(plank);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3, 5), woodM);
      post.position.set(jx, (WATER_LEVEL - 1) - cy, jz); g.add(post);
    }
    // Friendly villagers.
    for (let i = 0; i < 4; i++) {
      const a = hash2(i + 5, cx) * Math.PI * 2, rr = 3 + hash2(i, cz) * 5;
      const nx = Math.cos(a) * rr, nz = Math.sin(a) * rr;
      const npc = createStickman({ color: 0x8aa0b0, accent: 0x3a5a6a, scale: 0.95 });
      npc.position.set(nx, heightAt(cx + nx, cz + nz) - cy, nz); npc.rotation.y = a;
      g.add(npc);
      this.villagers.push({ pos: new THREE.Vector3(cx + nx, cy, cz + nz), town: name });
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Rest bonfire (adds a fast-travel/save point on the coast).
    this._makeBonfire(cx, cz, name);
  }

  // A palisade bandit base: a ring of sharpened stakes with a couple of tents.
  _banditBase(cx, cy, cz) {
    const woodM = new THREE.MeshLambertMaterial({ color: 0x5a3f28 });
    const tentM = new THREE.MeshLambertMaterial({ color: 0x6a5a3a });
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    this.group.add(g);
    const N = 16, ringR = 9;
    // Ground each piece to its OWN local terrain (relative to the group origin)
    // so the palisade follows the slope instead of floating as a rigid ring.
    const gy = (lx, lz) => heightAt(cx + lx, cz + lz) - cy;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // Leave a gap for an entrance.
      if (Math.abs(a - Math.PI) < 0.5) continue;
      const lx = Math.cos(a) * ringR, lz = Math.sin(a) * ringR, y0 = gy(lx, lz);
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.4, 5), woodM);
      stake.position.set(lx, y0 + 1.5, lz);
      stake.rotation.z = (hash2(i, cx) - 0.5) * 0.2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 5), woodM);
      tip.position.set(lx, y0 + 3.3, lz);
      g.add(stake, tip);
    }
    for (const s of [[-3, -2], [3, 1]]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 4), tentM);
      tent.position.set(s[0], gy(s[0], s[1]) + 1.3, s[1]); tent.rotation.y = Math.PI / 4; g.add(tent);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // Summon the Leviathan: a colossal, Godzilla-like beast that rises out of the
  // deep ocean at the World's Edge. Built once; world.update() animates the rise.
  triggerLeviathan(x, z) {
    if (this._leviathan) return this._leviathan;
    const skin = new THREE.MeshLambertMaterial({ color: 0x233038 });
    const belly = new THREE.MeshLambertMaterial({ color: 0x3a5560 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 46, 12), skin); body.position.y = 23; g.add(body);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 16, 12), belly); chest.position.set(0, 20, 3.5); g.add(chest);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 12, 10), skin); neck.position.set(0, 42, 2); neck.rotation.x = -0.2; g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 13), skin); head.position.set(0, 49, 4); g.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3, 9), belly); jaw.position.set(0, 45.5, 6.5); g.add(jaw);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffce3a }));
      eye.position.set(sx * 2.7, 51, 9.5); g.add(eye);
    }
    for (let i = 0; i < 8; i++) { // dorsal spikes
      const sp = new THREE.Mesh(new THREE.ConeGeometry(1.7 - i * 0.05, 5, 5), skin);
      sp.position.set(0, 8 + i * 5.2, -5.6 - i * 0.3); sp.rotation.x = -0.5; g.add(sp);
    }
    for (const sx of [-1, 1]) { // arms
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.7, 18, 8), skin);
      arm.position.set(sx * 8.5, 22, 2.5); arm.rotation.z = sx * 0.5; g.add(arm);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // Face the map centre (where the fleeing player is).
    g.rotation.y = Math.atan2(-x, -z);
    const from = WATER_LEVEL - 50; // fully submerged
    g.position.set(x, from, z);
    this.scene.add(g);
    const light = new THREE.PointLight(0xff5a2a, 0, 160); light.position.set(x, WATER_LEVEL + 40, z); this.scene.add(light);
    this._leviathan = { group: g, light, t: 0, from, to: WATER_LEVEL - 3 };
    return this._leviathan;
  }

  _portal(x, y, z, color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.18, 8, 20), new THREE.MeshBasicMaterial({ color }));
    ring.position.y = 1.6;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    disc.position.y = 1.6;
    const light = new THREE.PointLight(color, 1.8, 12); light.position.y = 1.6;
    g.add(ring, disc, light);
    g.position.set(x, y, z);
    this.group.add(g);
    return g;
  }

  _dungeons() {
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x3a3540 });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x2a2630 });
    for (const d of DUNGEONS) {
      const sx = d.sx, sz = d.sz, fy = 0, half = 36;
      // Floor.
      const floor = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1, half * 2), floorMat);
      floor.position.set(sx, fy - 0.5, sz); floor.receiveShadow = true;
      this.group.add(floor);
      // Perimeter walls (colliders).
      const wallSpecs = [[0, half, half * 2, 2], [0, -half, half * 2, 2], [half, 0, 2, half * 2], [-half, 0, 2, half * 2]];
      for (const [ox, oz, w, dpt] of wallSpecs) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 7, dpt), wallMat);
        wall.position.set(sx + ox, fy + 3.5, sz + oz); wall.castShadow = true;
        this.group.add(wall); this._addBox(wall, false);
      }
      // Interior pillars (cover + colliders).
      for (const [ox, oz] of [[-16, -8], [16, -8], [-16, 12], [16, 12], [0, 0]]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), wallMat);
        pil.position.set(sx + ox, fy + 3.5, sz + oz); pil.castShadow = true;
        this.group.add(pil); this._addBox(pil, false);
      }
      // Torches (dim mood lighting).
      for (const [ox, oz] of [[-half + 3, -half + 3], [half - 3, -half + 3], [-half + 3, half - 3], [half - 3, half - 3]]) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff8a4a }));
        fl.position.set(sx + ox, fy + 2.4, sz + oz);
        const lt = new THREE.PointLight(0xff8a4a, 1.6, 26); lt.position.set(sx + ox, fy + 3, sz + oz);
        this.group.add(fl, lt);
      }
      // Exit portal (near the south wall) + spawn just in front of it.
      const exit = this._portal(sx, fy, sz + half - 4, 0x9fd0ff);
      const spawn = new THREE.Vector3(sx, fy, sz + half - 9);
      // Loot chest near the boss end.
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: 0xb8860b })); base.position.y = 0.45;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a6410 })); lidMesh.position.set(0, 0.25, 0);
      lid.position.set(0, 0.9, -0.6); lid.add(lidMesh);
      const glow = new THREE.PointLight(0xffcf3a, 0, 8); glow.position.y = 1.4;
      chest.add(base, lid, glow); chest.position.set(sx, fy, sz - half + 6);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);

      // Overworld entrance portal.
      const entrance = new THREE.Vector3(d.ex, heightAt(d.ex, d.ez), d.ez);
      this._portal(entrance.x, entrance.y, entrance.z, 0xb05aff);

      this.dungeons.push({
        id: d.id, name: d.name, level: d.level, entrance,
        spawn, exit: new THREE.Vector3(sx, fy, sz + half - 4),
        center: new THREE.Vector3(sx, fy, sz),
        chestPos: new THREE.Vector3(sx, fy, sz - half + 6),
        chest, lid, glow, opened: false, members: [], cleared: false,
      });
    }
  }
  nearestDungeonEntrance(pos, maxDist = 4) {
    for (const d of this.dungeons) if (d.entrance.distanceTo(pos) < maxDist) return d;
    return null;
  }
  nearestDungeonExit(pos, maxDist = 3.5) {
    for (const d of this.dungeons) if (d.exit.distanceTo(pos) < maxDist) return d;
    return null;
  }
  nearestDungeonChest(pos, maxDist = 4) {
    for (const d of this.dungeons) if (d.chestPos.distanceTo(pos) < maxDist) return d;
    return null;
  }
  dungeonCleared(d) { return d.members.length > 0 && d.members.every((m) => !m.alive); }

  nearestCaveEntrance(pos, maxDist = 4) {
    for (const c of this.caves) if (c.entrance.distanceTo(pos) < maxDist) return c;
    return null;
  }
  nearestCaveExit(pos, maxDist = 3.5) {
    for (const c of this.caves) if (c.exit.distanceTo(pos) < maxDist) return c;
    return null;
  }
  nearestCaveChest(pos, maxDist = 4) {
    for (const c of this.caves) if (c.chestPos.distanceTo(pos) < maxDist) return c;
    return null;
  }

  // The Waking Vale: a small starter glen just outside the Nexus, marked by an
  // Ember-cairn — the spot where the Ashbound wakes from the ash. Pure flavor.
  _wakingVale() {
    const p = polar(14, 110), x = p.x, z = p.z, y = heightAt(x, z);
    const g = new THREE.Group();
    const cols = [0x6a6a60, 0x5e5e55, 0x72706a];
    let yy = 0;
    for (let i = 0; i < 4; i++) {
      const rr = 0.95 - i * 0.16;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), new THREE.MeshLambertMaterial({ color: cols[i % 3] }));
      s.position.y = yy + rr * 0.7; s.rotation.set(i, i * 2, i); g.add(s); yy += rr * 1.2;
    }
    const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
    ember.position.y = yy + 0.35; g.add(ember);
    const glow = new THREE.PointLight(0xff7a2a, 1.5, 13); glow.position.y = yy + 0.35; g.add(glow);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this._wakeEmber = ember;
  }

  // The blade in the stone — hidden far from the roads. Drawing it out requires
  // the worthy (a level + total-attribute gate, checked in main.js).
  _swordInStone() {
    const x = 312, z = -300; // a lonely outcrop in the far reaches
    const y = heightAt(x, z);
    const g = new THREE.Group();
    // A mossy anvil-stone.
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 0), new THREE.MeshLambertMaterial({ color: 0x6b6b62 }));
    stone.scale.set(1.15, 0.65, 1.15); stone.position.y = 0.9; stone.rotation.y = 0.6;
    g.add(stone);
    // A ring of guardian rocks around the base.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.25, 0), new THREE.MeshLambertMaterial({ color: 0x5e5e55 }));
      r.position.set(Math.cos(a) * 3.4, 0.3, Math.sin(a) * 3.4); r.rotation.set(a, a * 2, a);
      g.add(r);
    }
    // The embedded sword — hilt up, blade buried in the stone.
    const sword = buildWeaponMesh('sword', 0xdfe6ff);
    sword.scale.setScalar(2.4);
    sword.rotation.x = Math.PI;        // flip so the blade points down
    sword.position.set(0, 3.5, 0);     // hilt rises above the stone, blade sinks in
    g.add(sword);
    // A soft beacon glow so the worthy can find it.
    const glow = new THREE.PointLight(0x9fd0ff, 1.4, 16); glow.position.set(0, 3.2, 0);
    g.add(glow);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this.swordStone = {
      pos: new THREE.Vector3(x, y, z), group: g, sword, glow, pulled: false,
      req: { level: 14, total: 60 }, // need Lv14+ AND STR+DEX+INT >= 60
    };
  }
  setSwordStonePulled() {
    if (!this.swordStone) return;
    this.swordStone.pulled = true;
    this.swordStone.sword.visible = false;
    this.swordStone.glow.intensity = 0;
  }

  // Buff shrines: one of each type, scattered so each region has one. Pray at
  // a shrine (E) for a long blessing; it then dims on a short cooldown.
  _shrines() {
    // One shrine tucked beside each biome's low area, plus a spread of extra
    // shrines scattered through the open world so exploration always pays off.
    const sites = [];
    for (let i = 0; i < BIOME_LAYOUT.length; i++) {
      const b = BIOME_LAYOUT[i];
      const p = polar(b.heading + b.low.off + 22, b.low.dist * SCALE + 26);
      sites.push({ x: p.x, z: p.z });
    }
    for (let i = 0; i < 24; i++) {
      const ang = hash2(i, 911) * Math.PI * 2;
      const rad = (0.18 + hash2(i, 913) * 0.64) * WORLD_SIZE;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (this.inSafeZone(x, z) || heightAt(x, z) < WATER_LEVEL + 1) continue;
      sites.push({ x, z });
    }
    for (let i = 0; i < sites.length; i++) {
      const type = SHRINE_TYPES[i % SHRINE_TYPES.length];
      let x = sites[i].x, z = sites[i].z, y = heightAt(x, z);
      if (y < -3) { x *= 0.85; z *= 0.85; y = heightAt(x, z); }
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x6a6a62 }));
      base.position.y = 0.25;
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a8478 }));
      plinth.position.y = 1.35;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: type.color }));
      orb.position.y = 2.9;
      const light = new THREE.PointLight(type.color, 1.6, 16); light.position.y = 2.9;
      // Four small pillars around it.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x7a7468 }));
        pil.position.set(Math.cos(a) * 1.7, 0.9, Math.sin(a) * 1.7); g.add(pil);
      }
      g.add(base, plinth, orb, light);
      g.position.set(x, y, z);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(g);
      this._addBox(plinth, false);
      this.shrines.push({ type, pos: new THREE.Vector3(x, y, z), orb, light, cooldownUntil: 0 });
    }
  }
  nearestShrine(pos, maxDist = 4.5) {
    for (const s of this.shrines) if (s.pos.distanceTo(pos) < maxDist) return s;
    return null;
  }

  // Hidden treasure chests scattered across the wild — tucked off the roads and
  // away from towns to reward exploration. Loot scales with how far out it sits.
  _treasures() {
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xb8860b });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x8a6410 });
    let placed = 0;
    for (let i = 0; i < 200 && placed < 30; i++) {
      const ang = hash2(i, 611) * Math.PI * 2;
      const rad = 70 + hash2(i, 613) * (WORLD_SIZE - 90);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3) continue;                                   // not underwater
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 8) continue; // hidden, off the roads
      const area = areaAt(x, z);
      const level = area ? area.level + 1 : Math.max(3, Math.round(rad / 9));
      const chest = new THREE.Group();
      const baseM = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), chestMat); baseM.position.y = 0.4;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 1.0), lidMat); lidMesh.position.set(0, 0.21, 0);
      lid.position.set(0, 0.8, -0.5); lid.add(lidMesh);
      const glow = new THREE.PointLight(0xffcf3a, 0.7, 7); glow.position.y = 1.1;
      chest.add(baseM, lid, glow);
      chest.position.set(x, y, z);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);
      this.treasures.push({ pos: new THREE.Vector3(x, y, z), level, chest, lid, glow, opened: false });
      placed++;
    }
  }
  nearestTreasure(pos, maxDist = 3.5) {
    for (const t of this.treasures) if (!t.opened && t.pos.distanceTo(pos) < maxDist) return t;
    return null;
  }

  // Drive a lock ring's look: pulsing red while locked, steady gold once ready.
  _setRing(ring, ready, t) {
    if (!ring) return;
    ring.visible = true;
    if (ready) { ring.material.color.setHex(0xffcf3a); ring.material.opacity = 0.85; }
    else { ring.material.color.setHex(0xff3b3b); ring.material.opacity = 0.5 + Math.sin(t * 3) * 0.3; }
  }

  // A glowing ring laid on the ground around a chest to show it's LOCKED (red)
  // or ready-to-loot (gold). Added as a child of the chest group.
  _lockRing() {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.13, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    ring.userData.noCull = false;
    return ring;
  }

  // Rune-sequence puzzle chests: a sealed chest ringed by rune stones that pulse
  // a sequence; touch the runes in that order to break the seal. Scattered in the
  // open world so there's always something to solve and loot out there.
  _puzzles() {
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xcaa64a });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x9a7a2a });
    const runeColors = [0x6fc8ff, 0xff8a5a, 0x9be36a, 0xc78bff];
    let placed = 0;
    for (let i = 0; i < 260 && placed < 16; i++) {
      const ang = hash2(i, 811) * Math.PI * 2;
      const rad = (0.18 + hash2(i, 813) * 0.6) * WORLD_SIZE;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < WATER_LEVEL + 1) continue;
      if (this.inSafeZone(x, z) || roadDistance(x, z) < 8) continue;
      const level = Math.max(4, Math.round((rad / WORLD_SIZE) * 44 + 4));
      // Sealed chest with a lock ring.
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.3), chestMat); base.position.y = 0.5;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 1.3), lidMat); lidMesh.position.set(0, 0.28, 0);
      lid.position.set(0, 1.0, -0.65); lid.add(lidMesh);
      const glow = new THREE.PointLight(0x6fc8ff, 0, 10); glow.position.y = 1.5;
      const ring = this._lockRing();
      chest.add(base, lid, glow, ring);
      chest.position.set(x, y, z);
      chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(chest);
      // Three rune stones around it.
      const stones = [];
      const nStones = 3;
      for (let k = 0; k < nStones; k++) {
        const a = (k / nStones) * Math.PI * 2 + 0.5;
        const sx = x + Math.cos(a) * 5, sz = z + Math.sin(a) * 5, sy = heightAt(sx, sz);
        const sg = new THREE.Group();
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.9, 6), new THREE.MeshLambertMaterial({ color: 0x5a5a52 }));
        pil.position.y = 0.95;
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: runeColors[k] }));
        orb.position.y = 2.1;
        sg.add(pil, orb); sg.position.set(sx, sy, sz);
        sg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(sg);
        this._addBox(pil, false);
        stones.push({ orb, pos: new THREE.Vector3(sx, sy, sz) });
      }
      // A deterministic activation order (a shuffled permutation of the stones).
      const seq = [0, 1, 2];
      for (let s = seq.length - 1; s > 0; s--) { const j = Math.floor(hash2(i, 820 + s) * (s + 1)); const tmp = seq[s]; seq[s] = seq[j]; seq[j] = tmp; }
      this.puzzles.push({ pos: new THREE.Vector3(x, y, z), level, chest, lid, glow, ring, stones, seq, progress: 0, solved: false, opened: false });
      placed++;
    }
  }

  // Touch a rune: advances the sequence, resets on a wrong touch, or solves it.
  // Returns 'progress' | 'reset' | 'solved'.
  activateRune(puzzle, stoneIndex) {
    if (puzzle.solved) return 'solved';
    if (puzzle.seq[puzzle.progress] === stoneIndex) {
      puzzle.progress++;
      if (puzzle.progress >= puzzle.seq.length) { puzzle.solved = true; return 'solved'; }
      return 'progress';
    }
    puzzle.progress = 0;
    return 'reset';
  }
  nearestPuzzleChest(pos, maxDist = 3.5) {
    for (const p of this.puzzles) if (!p.opened && p.pos.distanceTo(pos) < maxDist) return p;
    return null;
  }
  nearestPuzzleRune(pos, maxDist = 2.6) {
    for (const p of this.puzzles) {
      if (p.solved) continue;
      for (let k = 0; k < p.stones.length; k++) if (p.stones[k].pos.distanceTo(pos) < maxDist) return { puzzle: p, index: k };
    }
    return null;
  }

  // Fireflies (glow at dusk/night near forests & swamp) plus small wandering
  // critters — rabbits that hop, snakes that slither, little birds. Purely
  // decorative: no colliders, no combat. They just make the world feel alive.
  _ambientLife() {
    const ffCount = 170;
    const ffPos = new Float32Array(ffCount * 3);
    this._ff = [];
    const hosts = AREAS.filter((a) => a.biome === 'forest' || a.biome === 'swamp' || a.safe);
    for (let i = 0; i < ffCount; i++) {
      const h = hosts[i % hosts.length];
      const a = hash2(i, 301) * Math.PI * 2, r = Math.sqrt(hash2(i, 303)) * h.r * 0.85;
      const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
      const baseY = heightAt(x, z) + 1.1 + hash2(i, 305) * 2.4;
      this._ff.push({ x, z, baseY, amp: 0.4 + hash2(i, 307) * 0.9, sp: 0.5 + hash2(i, 309) * 1.1, ph: hash2(i, 311) * 6.28 });
      ffPos[i * 3] = x; ffPos[i * 3 + 1] = baseY; ffPos[i * 3 + 2] = z;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    this.fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
      color: 0xffe98a, size: 0.55, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.fireflies.userData.noCull = true;
    this.group.add(this.fireflies);

    const matRabbit = new THREE.MeshLambertMaterial({ color: 0xb9a98a });
    const matSnake = new THREE.MeshLambertMaterial({ color: 0x4f8a3a });
    const matBird = new THREE.MeshLambertMaterial({ color: 0x6a5a4a });
    for (let i = 0; i < 48; i++) {
      const ang = hash2(i, 401) * Math.PI * 2;
      const rad = 30 + hash2(i, 403) * (WORLD_SIZE - 60);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (heightAt(x, z) < -2) continue; // skip water
      const roll = hash2(i, 405);
      const kind = roll < 0.4 ? 'rabbit' : roll < 0.75 ? 'snake' : 'bird';
      const g = new THREE.Group();
      if (kind === 'rabbit') {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), matRabbit); body.scale.z = 1.4; body.position.y = 0.22;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), matRabbit); head.position.set(0, 0.34, 0.24);
        const ear1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 4), matRabbit); ear1.position.set(-0.05, 0.52, 0.22);
        const ear2 = ear1.clone(); ear2.position.x = 0.05;
        g.add(body, head, ear1, ear2);
      } else if (kind === 'snake') {
        for (let k = 0; k < 5; k++) {
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - k * 0.02, 6, 5), matSnake);
          seg.position.set(0, 0.13, -k * 0.22); g.add(seg);
        }
      } else {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), matBird); body.position.y = 0.2;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), matBird); head.position.set(0, 0.33, 0.12);
        g.add(body, head);
      }
      g.position.set(x, heightAt(x, z), z);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(g);
      this.critters.push({
        kind, mesh: g, home: new THREE.Vector3(x, 0, z), tx: x, tz: z,
        t: hash2(i, 407) * 8, sp: kind === 'snake' ? 0.5 : kind === 'bird' ? 1.0 : 1.5, ph: hash2(i, 409) * 6.28,
      });
    }
  }

  campCleared(camp) { return camp.members.length > 0 && camp.members.every((m) => !m.alive); }
  nearestCamp(pos, maxDist = 4.5) {
    for (const c of this.camps) { if (c.pos.distanceTo(pos) < maxDist) return c; }
    return null;
  }
  nearestCastleChest(pos, maxDist = 5) {
    for (const c of this.castleChests) { if (c.pos.distanceTo(pos) < maxDist) return c; }
    return null;
  }

  // Birds flapping across the sky + one great dragon circling high above.
  _aerial() {
    this.birds = [];
    const birdMat = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
    for (let i = 0; i < 20; i++) {
      const b = new THREE.Group();
      const wings = [];
      for (const s of [1, -1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.32), birdMat);
        wing.geometry.translate(s * 0.5, 0, 0); // pivot at the body center
        b.add(wing); wings.push(wing);
      }
      b.userData.wings = wings;
      const cx = (hash2(i, 511) - 0.5) * WORLD_SIZE * 1.5;
      const cz = (hash2(i, 513) - 0.5) * WORLD_SIZE * 1.5;
      const alt = 38 + hash2(i, 517) * 46;
      b.position.set(cx, alt, cz);
      b.scale.setScalar(1.4 + hash2(i, 519) * 1.6);
      b.userData.noCull = true;
      this.group.add(b);
      this.birds.push({ mesh: b, cx, cz, alt, r: 28 + hash2(i, 523) * 90,
        sp: 0.12 + hash2(i, 529) * 0.22, ph: hash2(i, 531) * 6.28, flapSp: 7 + hash2(i, 537) * 5 });
    }
    this._buildDragon();
  }

  _buildDragon() {
    const g = new THREE.Group();
    const scaleMat = new THREE.MeshLambertMaterial({ color: 0x4a2030 });
    const bellyMat = new THREE.MeshLambertMaterial({ color: 0x73402c });
    const membrane = new THREE.MeshLambertMaterial({ color: 0x2a1020, side: THREE.DoubleSide });
    const segs = []; const N = 9;
    for (let i = 0; i < N; i++) {
      const r = 1.8 * (1 - i / (N + 3));
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), scaleMat);
      seg.position.z = -i * 1.7; g.add(seg); segs.push(seg);
    }
    // Head (forward at +Z): skull, snout, horns, glowing eyes.
    const head = new THREE.Group(); head.position.z = 2.2; g.add(head);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 2.4), scaleMat));
    const snout = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.5), scaleMat); snout.position.set(0, -0.2, 1.7); head.add(snout);
    for (const s of [1, -1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.3, 5), bellyMat); horn.position.set(s * 0.55, 1.05, -0.5); horn.rotation.x = -0.5; head.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb13c })); eye.position.set(s * 0.72, 0.35, 1.05); head.add(eye);
    }
    // Wings: a spar + a broad membrane, flapping from the shoulders.
    const wings = [];
    for (const s of [1, -1]) {
      const wing = new THREE.Group(); wing.position.set(s * 1.1, 0.6, -2.2);
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.07, 6.4, 5), bellyMat);
      spar.rotation.z = Math.PI / 2; spar.position.x = s * 3.2; wing.add(spar);
      const mem = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.06, 4.6), membrane); mem.position.set(s * 3.2, 0, -1.3); wing.add(mem);
      g.add(wing); wings.push(wing);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.4, 5), scaleMat);
    tail.position.z = -N * 1.7 - 0.9; tail.rotation.x = -Math.PI / 2; g.add(tail);
    g.scale.setScalar(2.3);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.noCull = true;
    this.group.add(g);
    this.dragon = { group: g, segs, wings, orbitR: 250, alt: 158, sp: 0.06, ph: 0 };
  }

  // Animate flickering bonfires + drifting clouds + day/night.
  update(t, dt = 0.016) {
    this._dayNight(t);
    if (this.clouds) {
      for (const c of this.clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 420) c.position.x = -420; // wrap around
      }
    }
    for (const b of this.bonfires) {
      const f = 0.8 + Math.sin(t * 12 + b.pos.x) * 0.15 + Math.sin(t * 7) * 0.1;
      b.flame.scale.set(1, f, 1);
      b.light.intensity = 1.8 + f * 0.6;
    }
    if (this.water) this.water.position.y = -4.2 + Math.sin(t * 0.6) * 0.15;
    if (this._nexusOrb) { this._nexusOrb.rotation.y += dt; this._nexusOrb.rotation.x += dt * 0.5; }
    if (this._arcanumOrb) { this._arcanumOrb.rotation.y += dt * 0.6; this._arcanumOrb.position.y += Math.sin(t * 1.2) * 0.02; }

    // The Leviathan rising from the deep.
    if (this._leviathan) {
      const L = this._leviathan; L.t += dt;
      const k = Math.min(1, L.t / 1.7);
      L.group.position.y = L.from + (L.to - L.from) * (k * k * (3 - 2 * k));
      L.group.rotation.y += dt * 0.12;
      L.group.position.y += Math.sin(t * 1.5) * 0.4; // heave in the swell
      L.light.intensity = Math.min(4.5, L.t * 3);
    }

    // Camp chests: glow once unlocked; swing the lid open when looted.
    for (const c of this.camps) {
      if (!c.chest) continue; // bandit bases have no loot chest
      if (c.opened) {
        c.lid.rotation.x = THREE.MathUtils.lerp(c.lid.rotation.x, -2.2, Math.min(1, dt * 6));
        c.glow.intensity = 0; if (c.ring) c.ring.visible = false;
      } else {
        const cleared = this.campCleared(c);
        if (cleared) c.glow.intensity = 1.4 + Math.sin(t * 5) * 0.5; // ready-to-open shimmer
        this._setRing(c.ring, cleared, t);
      }
    }
    // Dungeon chests behave the same once the dungeon is cleared.
    for (const d of this.dungeons) {
      if (d.opened) { d.lid.rotation.x = THREE.MathUtils.lerp(d.lid.rotation.x, -2.2, Math.min(1, dt * 6)); d.glow.intensity = 0; }
      else if (this.dungeonCleared(d)) d.glow.intensity = 1.4 + Math.sin(t * 5) * 0.5;
    }
    // Cave treasure caches glow until looted (caves have no required combat).
    for (const c of this.caves) {
      if (c.opened) { c.lid.rotation.x = THREE.MathUtils.lerp(c.lid.rotation.x, -2.2, Math.min(1, dt * 6)); c.glow.intensity = 0; }
      else c.glow.intensity = 0.8 + Math.sin(t * 4) * 0.4;
    }
    // Castle vaults: dim while the castle still stands, bright once cleared
    // (main.js sets `_cleared`), lid swings open when looted.
    for (const c of this.castleChests) {
      if (c.opened) { c.lid.rotation.x = THREE.MathUtils.lerp(c.lid.rotation.x, -2.2, Math.min(1, dt * 6)); c.glow.intensity = 0; if (c.ring) c.ring.visible = false; }
      else { c.glow.intensity = c._cleared ? (1.8 + Math.sin(t * 5) * 0.6) : 0.25; this._setRing(c.ring, c._cleared, t); }
    }
    // Rune-puzzle chests: pulse the sequence hint through the stones while locked,
    // keep solved stones lit, swing the lid open once looted.
    for (const p of this.puzzles) {
      if (p.opened) {
        p.lid.rotation.x = THREE.MathUtils.lerp(p.lid.rotation.x, -2.2, Math.min(1, dt * 6));
        p.glow.intensity = 0; if (p.ring) p.ring.visible = false;
        continue;
      }
      this._setRing(p.ring, p.solved, t);
      if (p.solved) {
        p.glow.intensity = 1.6 + Math.sin(t * 5) * 0.5;
        for (const s of p.stones) s.orb.scale.setScalar(1.35);
      } else {
        p.glow.intensity = 0.15;
        const done = p.seq.slice(0, p.progress);
        const hint = p.seq[Math.floor(t / 0.7) % p.seq.length]; // pulse through the required order
        for (let k = 0; k < p.stones.length; k++) {
          const isDone = done.includes(k);
          p.stones[k].orb.scale.setScalar(isDone ? 1.3 : (k === hint ? 1.25 : 0.85));
        }
      }
    }

    // Fireflies: fade in from dusk through night and drift on the breeze.
    if (this.fireflies) {
      const night = 1 - (this.dayFactor != null ? this.dayFactor : 1);
      this.fireflies.material.opacity = Math.max(0, night - 0.25) * 1.2;
      if (this.fireflies.material.opacity > 0.01) {
        const arr = this.fireflies.geometry.attributes.position.array;
        for (let i = 0; i < this._ff.length; i++) {
          const f = this._ff[i];
          arr[i * 3] = f.x + Math.sin(t * f.sp + f.ph) * 1.5;
          arr[i * 3 + 1] = f.baseY + Math.sin(t * f.sp * 1.7 + f.ph) * f.amp;
          arr[i * 3 + 2] = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 1.5;
        }
        this.fireflies.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Critters wander toward roaming targets near their home patch (skip the
    // far ones the culler has hidden).
    for (const c of this.critters) {
      if (!c.mesh.visible) continue;
      c.t -= dt;
      if (c.t <= 0) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
        c.tx = c.home.x + Math.cos(a) * r; c.tz = c.home.z + Math.sin(a) * r;
        c.t = 1.5 + Math.random() * 3;
      }
      const m = c.mesh;
      const dx = c.tx - m.position.x, dz = c.tz - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, c.sp * dt);
        m.position.x += (dx / d) * step; m.position.z += (dz / d) * step;
        m.rotation.y = Math.atan2(dx, dz);
      }
      const gy = heightAt(m.position.x, m.position.z);
      if (c.kind === 'snake') {
        m.position.y = gy + 0.02;
        for (let k = 0; k < m.children.length; k++) m.children[k].position.x = Math.sin(t * 4 + c.ph + k * 0.6) * 0.12;
      } else {
        // Hop bob (taller while moving).
        m.position.y = gy + Math.abs(Math.sin(t * 8 + c.ph)) * (d > 0.15 ? 0.25 : 0.05);
      }
    }

    // The sword in the stone pulses its beacon until drawn.
    if (this.swordStone && !this.swordStone.pulled) this.swordStone.glow.intensity = 1.0 + Math.sin(t * 2.5) * 0.5;

    // Shrines: glow & bob when ready, dim while on cooldown.
    for (const s of this.shrines) {
      const ready = t >= s.cooldownUntil;
      s.light.intensity = ready ? 1.6 + Math.sin(t * 3 + s.pos.x) * 0.5 : 0.2;
      s.orb.position.y = 2.9 + (ready ? Math.sin(t * 2 + s.pos.z) * 0.12 : 0);
      s.orb.rotation.y += dt * (ready ? 1.2 : 0.2);
    }
    // Treasure chests: shimmer until opened, then swing the lid up.
    for (const tr of this.treasures) {
      if (tr.opened) { tr.lid.rotation.x = THREE.MathUtils.lerp(tr.lid.rotation.x, -2.2, Math.min(1, dt * 6)); tr.glow.intensity = 0; }
      else tr.glow.intensity = 0.55 + Math.sin(t * 3 + tr.pos.x) * 0.35;
    }

    // Birds: drift in lazy circles, flapping.
    for (const b of this.birds) {
      const x = b.cx + Math.cos(t * b.sp + b.ph) * b.r;
      const z = b.cz + Math.sin(t * b.sp + b.ph) * b.r;
      b.mesh.position.set(x, b.alt + Math.sin(t * 0.6 + b.ph) * 3, z);
      b.mesh.rotation.y = Math.atan2(-Math.sin(t * b.sp + b.ph), Math.cos(t * b.sp + b.ph)) + Math.PI / 2;
      const f = Math.sin(t * b.flapSp + b.ph) * 0.7;
      b.mesh.userData.wings[0].rotation.z = f; b.mesh.userData.wings[1].rotation.z = -f;
    }

    // The dragon: a wide, high orbit with flapping wings and an undulating body.
    if (this.dragon) {
      const d = this.dragon; d.ph += dt * d.sp;
      const x = Math.cos(d.ph) * d.orbitR, z = Math.sin(d.ph) * d.orbitR;
      d.group.position.set(x, d.alt + Math.sin(d.ph * 3) * 9, z);
      d.group.rotation.y = Math.atan2(-Math.sin(d.ph), Math.cos(d.ph)); // face the way it flies
      const flap = Math.sin(t * 2.1) * 0.55;
      d.wings[0].rotation.z = -0.15 - flap; d.wings[1].rotation.z = 0.15 + flap;
      for (let i = 0; i < d.segs.length; i++) {
        d.segs[i].position.y = Math.sin(t * 1.8 + i * 0.5) * 0.5;
        d.segs[i].position.x = Math.sin(t * 1.4 + i * 0.6) * 0.6;
      }
    }
  }

  // Advance the day/night cycle (one full day ~ 5 minutes).
  _dayNight(t) {
    const DAY = 300;
    const phase = (t % DAY) / DAY;                 // 0..1
    const ang = phase * Math.PI * 2 - Math.PI / 2; // sunrise at phase 0
    const elev = Math.sin(phase * Math.PI * 2);    // -1..1 (noon = +1)
    const day = Math.max(0, elev);                 // 0 at night
    this.sun.position.set(Math.cos(ang) * 160, Math.max(8, Math.sin(ang) * 160), 60);
    this.sun.intensity = 0.15 + day * 1.0;
    this.hemi.intensity = 0.22 + day * 0.62;
    // Sky/fog: night → dusk (low sun) → day.
    const dusk = Math.max(0, 1 - Math.abs(elev) * 3); // peaks near horizon
    const col = this._nightCol.clone().lerp(this._dayCol, day);
    col.lerp(this._duskCol, dusk * 0.5);
    this.scene.background.copy(col);
    if (this.scene.fog) this.scene.fog.color.copy(col);
    if (this.stars) this.stars.material.opacity = Math.max(0, 0.9 - day * 4);
    this.timeOfDay = day > 0.15 ? 'day' : (elev > 0 ? 'dawn' : dusk > 0.3 ? 'dusk' : 'night');
    this.isNight = day <= 0.05;
    this.dayFactor = day;          // 0 (night) .. 1 (noon)
    this.dayPhase = phase;
    const tt = (phase * 24 + 6) % 24; // phase 0 = 06:00 (sunrise)
    const hh = Math.floor(tt), mm = Math.floor((tt - hh) * 60);
    this.clockText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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
    // Only test colliders in the entity's grid cell (padded so it holds every
    // box within reach), instead of all ~1500 — a big win for movement.
    const list = this._colGrid
      ? (this._colGrid.get(Math.floor(cx / this._colCell) + ',' + Math.floor(cz / this._colCell)) || EMPTY_COLLIDERS)
      : this.colliders;
    for (const c of list) {
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

  // If the player is at a water's edge, return a nearby spot on the water to
  // cast a fishing bobber to (else null). Used by the fishing interaction.
  nearWater(x, z, reach = 7) {
    if (heightAt(x, z) < WATER_LEVEL) return null; // already in the water
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      for (let d = 2.5; d <= reach; d += 2) {
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (heightAt(px, pz) < WATER_LEVEL - 0.5) return { x: px, z: pz };
      }
    }
    return null;
  }

  // Top Y of a collider (for finishing a climb / standing on cliffs).
  topOf(collider) { return collider.max.y; }
}
