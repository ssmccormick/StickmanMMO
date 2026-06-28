// ============================================================
// World: procedural 2.5D open world. Rolling heightfield terrain,
// a starter town, scattered trees/rocks, climbable cliffs (BotW
// style), and bonfire checkpoints (Dark Souls style). Also owns
// world collision (AABB boxes + ground height query).
// ============================================================
import * as THREE from 'three';
import { createStickman } from './stickman.js';

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

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];   // { min:Vec3, max:Vec3, climbable:bool }
    this.bonfires = [];    // { pos:Vec3, mesh, light }
    this.spawnZones = [];  // { center:Vec3, radius, level }
    this._build();
  }

  _build() {
    this._sky();
    this._terrain();
    this._town();
    this._scatter();
    this._groundDetail();
    this._cliffs();
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
    const lush = new THREE.Color(0x6fae54);
    const dry = new THREE.Color(0x9aa05a);
    const rock = new THREE.Color(0x8c8576);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      // Color by elevation for a painted look.
      const t = THREE.MathUtils.clamp((y + 6) / 20, 0, 1);
      const col = y > 9 ? rock.clone().lerp(dry, 0.3) : lush.clone().lerp(dry, t * 0.6);
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
    // Flat stone plaza
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16, 0.4, 32),
      new THREE.MeshLambertMaterial({ color: 0xb9b2a0 })
    );
    plaza.position.set(0, heightAt(0, 0) + 0.0, 0);
    plaza.receiveShadow = true;
    this.group.add(plaza);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xc9c0a8 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x9a4a3a });
    const housePositions = [
      [11, 6], [-11, 7], [9, -10], [-8, -11], [14, -2], [-14, -1],
    ];
    for (const [hx, hz] of housePositions) {
      const g = new THREE.Group();
      const baseY = heightAt(hx, hz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 4.5), wallMat);
      body.position.y = 1.6;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 4), roofMat);
      roof.position.y = 4.3; roof.rotation.y = Math.PI / 4;
      g.add(body, roof);
      g.position.set(hx, baseY, hz);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      this._addBox(body, false);
    }

    // A central fountain / statue landmark.
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0x8d99a6 }));
    statue.position.set(0, heightAt(0, 0) + 2, 0);
    statue.castShadow = true;
    this.group.add(statue);
    this._addBox(statue, false);

    this._vendor();
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
    const leafMats = [0x3f7d3a, 0x4f8f3f, 0x5a6f2f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x7d7a72 });

    for (let i = 0; i < 320; i++) {
      const ang = hash2(i, 11) * Math.PI * 2;
      const rad = 24 + hash2(i, 13) * (WORLD_SIZE - 30);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y = heightAt(x, z);
      if (y < -3.5) continue; // skip water
      if (hash2(i, 17) < 0.72) {
        // Tree
        const g = new THREE.Group();
        const th = 2 + hash2(i, 19) * 2.5;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, th, 6), trunkMat);
        trunk.position.y = th / 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4 + hash2(i, 23), 2.6 + hash2(i, 29) * 1.5, 7),
          leafMats[i % leafMats.length]);
        leaf.position.y = th + 1;
        g.add(trunk, leaf);
        g.position.set(x, y, z);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(g);
        this._addBox(trunk, false);
      } else {
        // Rock
        const r = 0.6 + hash2(i, 31) * 1.6;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
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
    // Checkpoints: rest to heal, set respawn, and refill. Placed at the
    // town and near each cliff cluster.
    const spots = [[0, 8], [44, 28], [-48, -24], [22, -52], [-34, 48], [66, -38]];
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
    // Enemy spawn zones, harder the further from town.
    this.spawnZones = [
      { center: new THREE.Vector3(30, 0, 20), radius: 26, level: 1, count: 8 },
      { center: new THREE.Vector3(-40, 0, -15), radius: 28, level: 3, count: 9 },
      { center: new THREE.Vector3(25, 0, -45), radius: 26, level: 5, count: 9 },
      { center: new THREE.Vector3(-30, 0, 45), radius: 26, level: 7, count: 9 },
      { center: new THREE.Vector3(70, 0, -40), radius: 30, level: 10, count: 10 },
      { center: new THREE.Vector3(-70, 0, 70), radius: 34, level: 14, count: 12 },
    ];
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
