// ============================================================
// World: procedural 2.5D open world. Rolling heightfield terrain,
// a starter town, scattered trees/rocks, climbable cliffs (BotW
// style), and bonfire checkpoints (Dark Souls style). Also owns
// world collision (AABB boxes + ground height query).
// ============================================================
import * as THREE from 'three';
import { createStickman } from './stickman.js';
import { GIVERS } from './quests.js';

export const WORLD_SIZE = 220; // half-extent; world spans -220..220

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

// The single source of truth for ground elevation. Town (near origin)
// is kept flat so combat and the starting area feel grounded.
export function heightAt(x, z) {
  const distTown = Math.hypot(x, z);
  let h = 0;
  h += smoothNoise(x * 0.012, z * 0.012) * 14;
  h += smoothNoise(x * 0.04, z * 0.04) * 4;
  h += smoothNoise(x * 0.11, z * 0.11) * 1.2;
  h -= 6;
  // Flatten the town to a gentle plateau.
  const townFlat = THREE.MathUtils.clamp((distTown - 14) / 22, 0, 1);
  h *= townFlat;
  return h;
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

export function biomeAt(x, z) {
  if (Math.hypot(x, z) < 26) return BIOMES.meadow;   // town & surrounds
  if (x >= 0 && z >= 0) return BIOMES.forest;
  if (x < 0 && z >= 0) return BIOMES.snow;
  if (x < 0 && z < 0) return BIOMES.swamp;
  return BIOMES.desert;
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
    this.questGivers = []; // { name, questId, pos, marker }
    this._build();
  }

  _build() {
    this._sky();
    this._terrain();
    this._town();
    this._questGivers();
    this._scatter();
    this._groundDetail();
    this._cliffs();
    this._camps();
    this._bonfires();
    this._spawnZones();
  }

  _sky() {
    this.scene.background = new THREE.Color(0x9fc4e8);
    this.scene.fog = new THREE.Fog(0x9fc4e8, 90, 320);

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
    const seg = 200;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c1 = new THREE.Color(), c2 = new THREE.Color(), cr = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      // Color by biome + elevation for a painted, region-distinct look.
      const b = biomeAt(x, z);
      c1.setHex(b.ground); c2.setHex(b.ground2); cr.setHex(b.rock);
      const t = THREE.MathUtils.clamp((y + 6) / 20, 0, 1);
      const col = y > 9 ? cr.clone().lerp(c2, 0.3) : c1.clone().lerp(c2, t * 0.6);
      // tiny per-vertex noise so flats aren't a single flat color
      const n = (smoothNoise(x * 0.3, z * 0.3) - 0.5) * 0.06;
      col.offsetHSL(0, 0, n);
      colors.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Water plane in low areas.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
      new THREE.MeshLambertMaterial({ color: 0x3b6ea5, transparent: true, opacity: 0.8 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -4.2;
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

  _town() {
    // Larger flat stone plaza for the expanded town.
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 24, 0.4, 40),
      new THREE.MeshLambertMaterial({ color: 0xb9b2a0 })
    );
    plaza.position.set(0, heightAt(0, 0), 0);
    plaza.receiveShadow = true;
    this.group.add(plaza);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xc9c0a8 });
    const wallMat2 = new THREE.MeshLambertMaterial({ color: 0xb8a98a });
    const roofMats = [0x9a4a3a, 0x7a5a3a, 0x6a7a8a, 0x8a6a4a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    // A bigger ring of houses of varied sizes.
    const housePositions = [
      [14, 8, 4.5], [-14, 9, 4.5], [11, -13, 5.5], [-10, -14, 4], [18, -3, 4],
      [-18, -2, 5], [16, 15, 4.5], [-16, 15, 4], [20, 7, 5], [-20, 8, 4.5],
      [8, 18, 4], [-7, 19, 4.5], [21, -12, 5],
    ];
    housePositions.forEach(([hx, hz, sz], idx) => {
      const g = new THREE.Group();
      const baseY = heightAt(hx, hz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(sz, 3.2, sz), idx % 2 ? wallMat2 : wallMat);
      body.position.y = 1.6;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.8, 2.2, 4), roofMats[idx % roofMats.length]);
      roof.position.y = 4.3; roof.rotation.y = Math.PI / 4;
      g.add(body, roof);
      g.position.set(hx, baseY, hz);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      this._addBox(body, false);
    });

    // Central fountain: basin + statue.
    const baseY0 = heightAt(0, 0);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 20), new THREE.MeshLambertMaterial({ color: 0xa9a290 }));
    basin.position.set(0, baseY0 + 0.35, 0); basin.receiveShadow = true;
    this.group.add(basin);
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 4, 8), new THREE.MeshLambertMaterial({ color: 0x8d99a6 }));
    statue.position.set(0, baseY0 + 2.4, 0); statue.castShadow = true;
    this.group.add(statue);
    this._addBox(statue, false);

    // Lamp posts around the plaza (with glowing tops).
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const lx = Math.cos(ang) * 21, lz = Math.sin(ang) * 21;
      const ly = heightAt(lx, lz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
      post.position.set(lx, ly + 1.5, lz); post.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe8a0 }));
      lamp.position.set(lx, ly + 3.1, lz);
      this.group.add(post, lamp);
    }

    // A few market crates/barrels for flavor.
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a40 });
    for (let i = 0; i < 8; i++) {
      const cx = (hash2(i, 71) - 0.5) * 30, cz = (hash2(i, 73) - 0.5) * 30;
      if (Math.hypot(cx, cz) < 6) continue;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crateMat);
      crate.position.set(cx, heightAt(cx, cz) + 0.45, cz); crate.castShadow = true;
      this.group.add(crate);
    }

    this._vendor();
  }

  _questGivers() {
    // Place quest-giver NPCs around the plaza with a floating marker.
    const slots = [[7, 7], [-7, 7], [7, -6]];
    GIVERS.forEach((gv, i) => {
      const [gx, gz] = slots[i] || [i * 4 - 6, 12];
      const gy = heightAt(gx, gz);
      const npc = createStickman({ color: gv.color, accent: gv.accent });
      npc.position.set(gx, gy, gz);
      npc.rotation.y = Math.atan2(-gx, -gz);
      this.group.add(npc);
      // Floating "!" marker.
      const marker = this._marker('!', '#ffd24a');
      marker.position.set(gx, gy + 3, gz);
      this.group.add(marker);
      this.questGivers.push({ name: gv.name, questId: gv.questId, pos: new THREE.Vector3(gx, gy, gz), marker, npc });
    });
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

  // Update a quest giver's marker glyph (! available, ? turn-in, hidden when done).
  setGiverMarker(questId, glyph, color) {
    const gv = this.questGivers.find((g) => g.questId === questId);
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

  _vendor() {
    // A merchant stall with a shopkeeper stickman. Press E nearby to trade.
    const vx = 0, vz = -10, vy = heightAt(0, -10);
    const g = new THREE.Group();
    // Counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
    counter.position.y = 0.5;
    // Posts + striped awning
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), postMat);
      post.position.set(sx, 1.3, -0.5); g.add(post);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 1.6), new THREE.MeshLambertMaterial({ color: 0xc23b3b }));
    awning.position.set(0, 2.5, -0.4); awning.rotation.x = -0.25; g.add(awning);
    // A coin sign
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: 0xffcf3a, side: THREE.DoubleSide }));
    sign.position.set(0, 2.9, 0.4); g.add(sign);
    g.add(counter);
    g.position.set(vx, vy, vz);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this._addBox(counter, false);

    // Shopkeeper behind the counter.
    const keeper = createStickman({ color: 0xcaa46a, accent: 0x6a4a2a });
    keeper.position.set(vx, vy, vz - 1.1);
    keeper.rotation.y = Math.PI;
    this.group.add(keeper);
    this.vendorKeeper = keeper;

    this.vendor = { pos: new THREE.Vector3(vx, vy, vz) };
  }

  _scatter() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const deadMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4f8a4a });
    const leafMats = [0x3f7d3a, 0x4f8f3f, 0x5a6f2f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const pineMats = [0x2f6f4a, 0x357a52].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const snowCapMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });

    for (let i = 0; i < 460; i++) {
      const ang = hash2(i, 11) * Math.PI * 2;
      const rad = 24 + hash2(i, 13) * (WORLD_SIZE - 30);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.5) continue; // skip water
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

    for (let i = 0; i < 260; i++) {
      const ang = hash2(i, 41) * Math.PI * 2;
      const rad = 18 + hash2(i, 43) * (WORLD_SIZE - 24);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.2) continue; // skip water

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

  _bonfires() {
    // Checkpoints: rest to heal, set respawn, and refill. Deliberately FEW and
    // FAR between — one in town, then one deep in each biome. Dying means a
    // real trek back, Dark Souls style.
    const spots = [[0, 9], [78, 64], [-72, 70], [-78, -66], [82, -72]];
    for (const [x, z] of spots) {
      const y = heightAt(x, z);
      const g = new THREE.Group();
      const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
      pit.position.y = 0.25;
      // Bundled "logs"
      for (let i = 0; i < 5; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
        log.position.y = 0.6; log.rotation.z = 0.5; log.rotation.y = (i / 5) * Math.PI * 2;
        g.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      flame.position.y = 1.3;
      g.add(pit, flame);
      const light = new THREE.PointLight(0xff8a2a, 2.2, 16);
      light.position.y = 1.6;
      g.add(light);
      g.position.set(x, y, z);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(g);
      this.bonfires.push({ pos: new THREE.Vector3(x, y, z), mesh: g, flame, light });
    }
  }

  _spawnZones() {
    // Enemy spawn zones spread across the biomes, harder the further out.
    this.spawnZones = [
      { center: new THREE.Vector3(34, 0, 26), radius: 28, level: 1, count: 8 },   // forest near
      { center: new THREE.Vector3(-34, 0, 30), radius: 28, level: 3, count: 9 },  // snow near
      { center: new THREE.Vector3(34, 0, -30), radius: 28, level: 5, count: 9 },  // desert near
      { center: new THREE.Vector3(-34, 0, -30), radius: 28, level: 7, count: 9 }, // swamp near
      { center: new THREE.Vector3(90, 0, 80), radius: 36, level: 10, count: 11 }, // forest deep
      { center: new THREE.Vector3(-90, 0, 85), radius: 36, level: 13, count: 11 },// snow deep
      { center: new THREE.Vector3(95, 0, -85), radius: 36, level: 16, count: 12 },// desert deep
      { center: new THREE.Vector3(-95, 0, -90), radius: 38, level: 20, count: 12 },// swamp deep
    ];
  }

  _camps() {
    // Elite war-camps: clusters of tough enemies guarding a loot chest.
    // The chest stays locked until every camp member is slain.
    const specs = [
      { id: 'camp_forest', x: 58, z: 46, level: 4 },
      { id: 'camp_snow', x: -56, z: 52, level: 6 },
      { id: 'camp_desert', x: 62, z: -56, level: 9 },
      { id: 'camp_swamp', x: -60, z: -52, level: 13 },
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
