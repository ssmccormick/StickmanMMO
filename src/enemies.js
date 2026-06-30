// ============================================================
// Enemies: stickman monsters with a simple FSM (idle/wander →
// chase → attack), health, level-scaled stats, death + respawn.
// Spawned per world zone so difficulty rises away from town.
// ============================================================
import * as THREE from 'three';
import { animateStickman } from './stickman.js';
import { createCreature } from './creatures.js';
import { heightAt, BOSSES } from './world.js';

const TYPES = {
  slime:    { name: 'Stick Slime',   color: 0x6fae54, accent: 0x3f7d3a, scale: 0.8, hp: 30,  dmg: 6,  speed: 2.6, range: 1.8, xp: 14, aggro: 12 },
  grunt:    { name: 'Bandit',        color: 0x8a6a4a, accent: 0xd8423c, scale: 1.0, hp: 55,  dmg: 10, speed: 3.6, range: 2.2, xp: 24, aggro: 16 },
  wolf:     { name: 'Dire Stick',    color: 0x66707a, accent: 0xcfcfcf, scale: 0.9, hp: 45,  dmg: 9,  speed: 5.2, range: 2.0, xp: 22, aggro: 20 },
  brute:    { name: 'Ogre Brute',    color: 0x7a5a8a, accent: 0xb04a3a, scale: 1.5, hp: 140, dmg: 22, speed: 2.8, range: 2.8, xp: 60, aggro: 14 },
  knight:   { name: 'Fallen Knight', color: 0x3a3f4a, accent: 0x9aa4ef, scale: 1.1, hp: 95,  dmg: 16, speed: 3.8, range: 2.4, xp: 44, aggro: 18 },
  wraith:   { name: 'Sky Wraith',    color: 0x5a3a6a, accent: 0xc07bff, scale: 1.0, hp: 52,  dmg: 13, speed: 6.0, range: 2.2, xp: 34, aggro: 24, fly: true },
  dragon:   { name: 'Vetharion',     color: 0x4a2030, accent: 0x73402c, scale: 1.7, hp: 400, dmg: 18, speed: 5.6, range: 3.4, xp: 1200, aggro: 46, fly: true },
  // Ranged mobs: they close to firing range, then loose projectiles you must
  // dodge. `shootRange` is how far they'll open fire from; `projSpeed` how fast
  // (slower = easier to sidestep).
  archer:   { name: 'Bandit Archer',  color: 0x7a6a4a, accent: 0xffe27a, scale: 1.0, hp: 46,  dmg: 11, speed: 3.6, range: 2.0, xp: 32, aggro: 24, ranged: true, shootRange: 16, projSpeed: 17, projColor: 0xffe27a },
  hexer:    { name: 'Blight Hexer',   color: 0x4a3a64, accent: 0xb05aff, scale: 1.0, hp: 58,  dmg: 14, speed: 3.0, range: 2.0, xp: 40, aggro: 24, ranged: true, shootRange: 18, projSpeed: 13, projColor: 0xb05aff },
  gargoyle: { name: 'Spitfire Gargoyle', color: 0x4a4a55, accent: 0xff7a3c, scale: 1.05, hp: 64, dmg: 15, speed: 5.4, range: 2.2, xp: 46, aggro: 28, fly: true, ranged: true, shootRange: 19, projSpeed: 18, projColor: 0xff7a3c },
};

// Where the great dragon roosts — a far-north open expanse below the high peaks.
export const DRAGON_ROOST = { x: -150, z: 210 };
const TYPE_BY_LEVEL = (lvl) => {
  if (lvl <= 1) return ['slime', 'slime', 'grunt'];
  if (lvl <= 3) return ['grunt', 'wolf', 'slime', 'archer'];
  if (lvl <= 5) return ['grunt', 'wolf', 'knight', 'archer'];
  if (lvl <= 7) return ['wolf', 'knight', 'brute', 'archer', 'hexer'];
  if (lvl <= 10) return ['knight', 'brute', 'wolf', 'hexer'];
  return ['brute', 'knight', 'brute', 'hexer'];
};

let NEXT_ID = 1;

// Enemy projectiles (the dodgeable shots fired by ranged mobs). Module-level so
// the main loop can tick them all at once with updateEnemyShots().
const ENEMY_SHOTS = [];
// Reused scratch vectors for the per-frame AI hot path — avoids allocating a
// handful of Vector3s per active enemy per frame, which was driving GC spikes.
const _toPlayer = new THREE.Vector3();
const _move = new THREE.Vector3();
const _scratch = new THREE.Vector3();
export function updateEnemyShots(dt, player) {
  for (let i = ENEMY_SHOTS.length - 1; i >= 0; i--) {
    const s = ENEMY_SHOTS[i];
    s.mesh.position.addScaledVector(s.dir, s.speed * dt);
    s.mesh.rotation.x += dt * 6; s.mesh.rotation.y += dt * 5;
    s.traveled += s.speed * dt;
    let done = s.traveled >= s.range;
    if (!done && player.alive) {
      const pc = player.pos.clone(); pc.y += 1.0;
      if (s.mesh.position.distanceTo(pc) < 1.0) {
        const dealt = player.takeDamage(s.dmg, s.mesh.position);
        if (dealt > 0) player.lastHitBy = s.owner;
        done = true;
      }
    }
    if (done) {
      if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
      s.mesh.geometry.dispose();
      ENEMY_SHOTS.splice(i, 1);
    }
  }
}
export function clearEnemyShots(scene) {
  for (const s of ENEMY_SHOTS) { if (s.mesh.parent) s.mesh.parent.remove(s.mesh); }
  ENEMY_SHOTS.length = 0;
}

export class Enemy {
  constructor(scene, world, typeId, level, home, opts = {}) {
    this.id = NEXT_ID++;
    this.world = world;
    this.type = TYPES[typeId];
    this.typeId = typeId;
    this.level = level;
    this.home = home.clone();
    this.elite = !!opts.elite;
    this.boss = !!opts.boss;
    this.bossName = opts.bossName || null;
    this.campId = opts.campId || null;
    this.scene = scene;

    const lvlScale = 1 + (level - 1) * 0.32;
    const em = this.boss ? 8 : this.elite ? 2.4 : 1;       // hp multiplier
    this.maxHp = Math.round(this.type.hp * lvlScale * em);
    this.hp = this.maxHp;
    this.dmg = this.type.dmg * (1 + (level - 1) * 0.22) * (this.boss ? 1.9 : this.elite ? 1.5 : 1);
    this.xp = Math.round(this.type.xp * (1 + (level - 1) * 0.4) * (this.boss ? 7 : this.elite ? 2.5 : 1));
    this.displayScale = this.type.scale * (this.boss ? 2.3 : this.elite ? 1.35 : 1);

    this.mesh = createCreature(this.typeId, {
      color: this.boss ? 0x1f1320 : this.elite ? 0x2a2a2a : this.type.color,
      accent: this.boss ? 0xff3030 : this.elite ? 0xffcf3a : this.type.accent,
      scale: this.displayScale,
    });
    // Each creature carries its own poser; fall back to the humanoid animator.
    this._poser = this.mesh.userData.animate || animateStickman;
    scene.add(this.mesh);

    if (this.boss) {
      // Phases, enrage, telegraphed shockwave.
      this.phase = 1;
      this._shockInterval = 6;
      this.bossSpeedMult = 1;
      this.wantsMinions = 0;   // consumed by main to spawn adds
      this._newPhase = 0;      // consumed by main to announce a phase change
      this.specialCd = 4;
      this._shock = null;
      this._shockRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 30),
        new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      this._shockRing.rotation.x = -Math.PI / 2;
      this._shockRing.visible = false;
      scene.add(this._shockRing);
    }

    this.ranged = !!this.type.ranged;       // fires dodgeable projectiles
    this.shootRange = this.type.shootRange || this.type.range;
    this.flying = !!this.type.fly;          // hovers; swoops down to attack
    this.flyHeight = this.flying ? 9 : 0;   // current altitude above the ground
    this.pos = home.clone();
    this.pos.y = heightAt(this.pos.x, this.pos.z) + this.flyHeight;
    this.state = 'idle';
    this.alive = true;
    this.facing = Math.random() * Math.PI * 2;
    this.wanderTarget = this._randomNear(home, 6);
    this.attackTimer = 0;
    this.attackAnim = 0;
    this.respawnTimer = 0;
    this.stun = 0;
    this.slow = 0;
    this.fear = 0;
    this._speed01 = 0;
    this._hitFlash = 0;

    // Floating nameplate sprite.
    this.nameplate = this._makePlate();
    this.mesh.add(this.nameplate);
  }

  _makePlate() {
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 64;
    this._plateCtx = cvs.getContext('2d');
    this._plateCanvas = cvs;
    const tex = new THREE.CanvasTexture(cvs);
    this._plateTex = tex;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(3.2, 0.8, 1);
    spr.position.y = 2.5 * this.displayScale + 0.6;
    this._drawPlate();
    return spr;
  }
  _drawPlate() {
    const ctx = this._plateCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    const label = this.boss ? `☠ ${this.bossName || this.type.name}  Lv${this.level}`
      : `${this.elite ? '★ Elite ' : ''}${this.type.name}  Lv${this.level}`;
    ctx.fillStyle = '#000';
    ctx.fillText(label, 129, 23);
    ctx.fillStyle = this.boss ? '#ff5a3c' : this.elite ? '#ffae42' : (this.hp < this.maxHp ? '#ff6b6b' : '#ffd24a');
    ctx.fillText(label, 128, 22);
    // hp bar
    ctx.fillStyle = '#000'; ctx.fillRect(40, 34, 176, 12);
    ctx.fillStyle = '#5a1a1a'; ctx.fillRect(42, 36, 172, 8);
    ctx.fillStyle = '#e23b3b'; ctx.fillRect(42, 36, 172 * Math.max(0, this.hp / this.maxHp), 8);
    this._plateTex.needsUpdate = true;
  }

  _randomNear(c, r) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    return new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
  }

  update(dt, player, t) {
    if (!this.alive) {
      // Death flop, then respawn after a timer.
      this._poser(this.mesh, dt, { dead: true });
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this._respawn();
      return;
    }

    if (this.stun > 0) { this.stun -= dt; this._speed01 = 0; this._finish(dt); return; }
    if (this.slow > 0) this.slow -= dt;
    const speedMult = this.slow > 0 ? 0.45 : 1;

    const toPlayer = player.alive ? _toPlayer.subVectors(player.pos, this.pos) : null;
    // Flyers judge range by ground distance so their altitude never stops them
    // from noticing you and diving in.
    const dist = !toPlayer ? Infinity : (this.flying ? Math.hypot(toPlayer.x, toPlayer.z) : toPlayer.length());

    if (this.boss) this._bossShockwave(dt, player, dist);

    // ---- Feared: flee from the player, ignoring all other behavior ----
    if (this.fear > 0) {
      this.fear -= dt;
      if (toPlayer && dist > 0.1) {
        const flee = _scratch.copy(toPlayer).setY(0).normalize().multiplyScalar(-1);
        this.pos.x += flee.x * this.type.speed * 1.1 * dt;
        this.pos.z += flee.z * this.type.speed * 1.1 * dt;
        this.facing = Math.atan2(flee.x, flee.z);
        this._speed01 = 0.8;
      }
      const res = this.world.resolveCircle(this.pos.x, this.pos.z, 0.5);
      this.pos.x = res.x; this.pos.z = res.z;
      this.pos.y = heightAt(this.pos.x, this.pos.z);
      this._repelFromTowns();
      this._finish(dt);
      return;
    }

    // ---- FSM ----
    // Ranged mobs engage from afar (shootRange); melee mobs must close in.
    const engageRange = this.ranged ? this.shootRange : this.type.range;
    if (player.alive && dist < this.type.aggro) {
      this.state = dist <= engageRange ? 'attack' : 'chase';
    } else if (this.state !== 'idle' && dist > this.type.aggro * 1.4) {
      this.state = 'return';
    }

    const move = _move.set(0, 0, 0);
    if (this.state === 'chase' && toPlayer) {
      move.copy(toPlayer).setY(0).normalize();
    } else if (this.state === 'attack' && toPlayer) {
      this.facing = Math.atan2(toPlayer.x, toPlayer.z);
      if (this.ranged) {
        // Hold at range and fire; back away (kite) if the player closes in.
        if (dist < this.shootRange * 0.55) move.copy(toPlayer).setY(0).normalize().multiplyScalar(-1);
        if (this.attackTimer <= 0) { this.attackTimer = 1.9 + Math.random() * 0.6; this.attackAnim = 1; this._fireShot(player); }
      } else if (this.attackTimer <= 0) {
        // melee: telegraph then land a hit
        this.attackTimer = 1.6;
        this.attackAnim = 1;
        this.pendingHit = { at: t + 0.35, applied: false };
      }
    } else if (this.state === 'return') {
      const toHome = _scratch.subVectors(this.home, this.pos).setY(0);
      if (toHome.length() < 1.5) { this.state = 'idle'; this.wanderTarget = this._randomNear(this.home, 6); }
      else move.copy(toHome).normalize();
    } else {
      // idle wander
      const toW = _scratch.subVectors(this.wanderTarget, this.pos).setY(0);
      if (toW.length() < 1) { this.wanderTarget = this._randomNear(this.home, 7); }
      else if (Math.random() < 0.9) move.copy(toW).normalize().multiplyScalar(0.4);
    }

    // Apply landed attack on the player after telegraph.
    if (this.pendingHit && !this.pendingHit.applied && t >= this.pendingHit.at) {
      this.pendingHit.applied = true;
      if (player.alive && this.pos.distanceTo(player.pos) <= this.type.range + 0.8) {
        const dealt = player.takeDamage(this.dmg, this.pos);
        if (dealt > 0) player.lastHitBy = this;
      }
    }

    const speed = this.type.speed * speedMult * (this.bossSpeedMult || 1);
    if (move.lengthSq() > 0.0001) {
      this.pos.x += move.x * speed * dt;
      this.pos.z += move.z * speed * dt;
      this.facing = Math.atan2(move.x, move.z);
      this._speed01 = THREE.MathUtils.clamp(speed / 6, 0, 1) * (move.length());
    } else {
      this._speed01 = 0;
    }

    // collision + ground/altitude clamp
    const res = this.world.resolveCircle(this.pos.x, this.pos.z, 0.5);
    this.pos.x = res.x; this.pos.z = res.z;
    if (this.flying) {
      // Ranged flyers hover and rain fire from above; melee flyers dive to strike.
      const target = this.ranged
        ? (this.state === 'idle' ? 9 : 6.5)
        : (this.state === 'attack' ? 1.4 : this.state === 'chase' ? 4.5 : 9);
      this.flyHeight = THREE.MathUtils.lerp(this.flyHeight, target, Math.min(1, dt * 3));
      this.pos.y = heightAt(this.pos.x, this.pos.z) + this.flyHeight;
    } else {
      this.pos.y = heightAt(this.pos.x, this.pos.z);
    }
    this._repelFromTowns();
    if (this.flying) this.pos.y = heightAt(this.pos.x, this.pos.z) + this.flyHeight;

    if (this.attackTimer > 0) this.attackTimer -= dt;
    this._finish(dt);
  }

  // Loose a dodgeable projectile at the player's current position.
  _fireShot(player) {
    const from = this.pos.clone(); from.y += this.flying ? Math.max(0.6, this.flyHeight * 0.4) : 1.1;
    const to = player.pos.clone(); to.y += 1.0;
    const dir = to.sub(from); if (dir.lengthSq() < 1e-4) return; dir.normalize();
    const col = this.type.projColor || 0xffaa44;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshBasicMaterial({ color: col }));
    mesh.position.copy(from);
    mesh.add(new THREE.PointLight(col, 1.2, 6));
    this.scene.add(mesh);
    ENEMY_SHOTS.push({ mesh, dir, speed: this.type.projSpeed || 15, range: this.shootRange + 8, traveled: 0, dmg: this.dmg, owner: this });
  }

  // Towns are safe zones — keep monsters out of them.
  _repelFromTowns() {
    const t = this.world.inSafeZone(this.pos.x, this.pos.z);
    if (!t) return;
    let ax = this.pos.x - t.x, az = this.pos.z - t.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len; az /= len;
    const edge = t.radius + 16.5;
    this.pos.x = t.x + ax * edge;
    this.pos.z = t.z + az * edge;
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    if (this.state === 'chase' || this.state === 'attack') this.state = 'return';
  }

  _finish(dt) {
    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 2.4);
    this.mesh.position.copy(this.pos);
    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, dt * 12);
    this._poser(this.mesh, dt, { speed01: this._speed01, attack: this.attackAnim });

    // Hit flash fade.
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      const s = 1 + this._hitFlash * 0.3;
      this.mesh.scale.setScalar(this.displayScale * s);
      if (this._hitFlash <= 0) this.mesh.scale.setScalar(this.displayScale);
    }
  }

  takeDamage(amount, crit = false) {
    if (!this.alive) return { dealt: 0, killed: false };
    amount = Math.max(1, Math.round(amount));
    this.hp -= amount;
    this._hitFlash = 0.18;
    // aggro on hit
    if (this.state === 'idle' || this.state === 'return') this.state = 'chase';
    // Boss phase transitions at 66% and 33% HP → enrage + summon adds.
    if (this.boss && this.hp > 0) {
      const frac = this.hp / this.maxHp;
      if (this.phase === 1 && frac <= 0.66) this._enterPhase(2);
      else if (this.phase === 2 && frac <= 0.33) this._enterPhase(3);
    }
    this._drawPlate();
    if (this.hp <= 0) { this.hp = 0; this._die(); return { dealt: amount, killed: true, crit, xp: this.xp }; }
    return { dealt: amount, killed: false, crit };
  }

  _enterPhase(n) {
    this.phase = n;
    this.dmg *= 1.3;
    this._shockInterval = Math.max(2.5, this._shockInterval * 0.7);
    this.bossSpeedMult *= 1.18;
    this.wantsMinions = 2;   // main spawns adds
    this._newPhase = n;      // main announces
    this.specialCd = Math.min(this.specialCd, 0.5); // slam soon after enraging
  }

  // Boss-only telegraphed ground slam: a ring expands, then everything within
  // it takes heavy damage.
  _bossShockwave(dt, player, dist) {
    const RADIUS = 7;
    if (this._shock) {
      this._shock.t += dt;
      const r = Math.min(RADIUS, (this._shock.t / 0.7) * RADIUS);
      this._shockRing.position.set(this.pos.x, this.pos.y + 0.15, this.pos.z);
      this._shockRing.scale.set(r, r, r);
      this._shockRing.material.opacity = 0.55 * Math.max(0, 1 - this._shock.t);
      this._shockRing.visible = true;
      if (this._shock.t >= 0.7 && !this._shock.applied) {
        this._shock.applied = true;
        if (player.alive && this.pos.distanceTo(player.pos) <= RADIUS + 0.6) {
          player.takeDamage(this.dmg * 1.6, this.pos);
          player.lastHitBy = this;
        }
      }
      if (this._shock.t >= 1) { this._shock = null; this._shockRing.visible = false; }
    } else {
      this.specialCd -= dt;
      if (this.specialCd <= 0 && player.alive && dist < 14 && (this.state === 'chase' || this.state === 'attack')) {
        this._shock = { t: 0, applied: false };
        this.specialCd = this._shockInterval;
      }
    }
  }

  applyStun(s) { this.stun = Math.max(this.stun, s); }
  applySlow(s) { this.slow = Math.max(this.slow, s); }
  applyFear(s) { this.fear = Math.max(this.fear, s); }

  _die() {
    this.alive = false;
    this.respawnTimer = 18 + Math.random() * 10;
    this.nameplate.visible = false;
  }
  _respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.pos.copy(this._randomNear(this.home, 5));
    if (this.flying) this.flyHeight = 9;
    this.pos.y = heightAt(this.pos.x, this.pos.z) + (this.flying ? this.flyHeight : 0);
    this.mesh.rotation.x = 0;
    this.mesh.scale.setScalar(this.displayScale);
    this.state = 'idle';
    this.nameplate.visible = true;
    this._drawPlate();
  }

  // Re-scale this enemy to a new level (used when a dungeon resets so repeat
  // runs stay challenging relative to the player). Mirrors the constructor's
  // level-dependent math; display scale (boss/elite size) is unchanged.
  setLevel(level) {
    this.level = Math.max(1, Math.round(level));
    const lvlScale = 1 + (this.level - 1) * 0.32;
    const em = this.boss ? 8 : this.elite ? 2.4 : 1;
    this.maxHp = Math.round(this.type.hp * lvlScale * em);
    this.hp = this.maxHp;
    this.dmg = this.type.dmg * (1 + (this.level - 1) * 0.22) * (this.boss ? 1.9 : this.elite ? 1.5 : 1);
    this.xp = Math.round(this.type.xp * (1 + (this.level - 1) * 0.4) * (this.boss ? 7 : this.elite ? 2.5 : 1));
    this._drawPlate();
  }
}

// Populate every spawn zone with level-appropriate monsters.
export function spawnEnemies(scene, world) {
  const enemies = [];
  for (const zone of world.spawnZones) {
    const pool = TYPE_BY_LEVEL(zone.level);
    for (let i = 0; i < zone.count; i++) {
      // sqrt(random) → uniform coverage over the whole disc (no center clumping).
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * zone.radius;
      const home = new THREE.Vector3(zone.center.x + Math.cos(a) * d, 0, zone.center.z + Math.sin(a) * d);
      const typeId = pool[Math.floor(Math.random() * pool.length)];
      const lvl = zone.level + Math.floor(Math.random() * 2);
      enemies.push(new Enemy(scene, world, typeId, lvl, home));
    }
  }
  return enemies;
}

// Sky Wraiths: a couple of flyers patrol the air above each spawn zone,
// cruising high until you wander close, then diving to attack.
export function spawnFlyers(scene, world) {
  const out = [];
  for (const zone of world.spawnZones) {
    const n = zone.level >= 10 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * zone.radius;
      const home = new THREE.Vector3(zone.center.x + Math.cos(a) * d, 0, zone.center.z + Math.sin(a) * d);
      // Some flyers are fire-spitting Gargoyles that strafe you from the air.
      const type = (i === 0 && zone.level >= 4) ? 'gargoyle' : 'wraith';
      out.push(new Enemy(scene, world, type, zone.level + Math.floor(Math.random() * 2), home));
    }
  }
  return out;
}

// The end boss: the great dragon, descended to be challenged once the player
// has accomplished everything else. Scales to the hero but stays formidable.
export function spawnDragon(scene, world, level) {
  const home = new THREE.Vector3(DRAGON_ROOST.x, 0, DRAGON_ROOST.z);
  const lvl = Math.min(28, Math.max(18, level || 18));
  const e = new Enemy(scene, world, 'dragon', lvl, home, { boss: true, bossName: 'Vetharion, the Sky-Tyrant' });
  e.isDragon = true;
  return e;
}

// Spawn a handful of minions around a boss when it enrages.
export function spawnMinions(scene, world, boss, n) {
  const out = [];
  const pool = boss.level >= 16 ? ['knight', 'wolf'] : ['wolf', 'grunt'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const home = new THREE.Vector3(boss.pos.x + Math.cos(a) * 4, 0, boss.pos.z + Math.sin(a) * 4);
    const e = new Enemy(scene, world, pool[i % pool.length], Math.max(1, boss.level - 4), home);
    e.state = 'chase';
    out.push(e);
  }
  return out;
}

// World bosses — one powerful named boss deep in each biome's high-level area.
// Positions derive from BIOME_LAYOUT (via the exported BOSSES table).
export function spawnBosses(scene, world) {
  return BOSSES.map((sp) => {
    const home = new THREE.Vector3(sp.x, 0, sp.z);
    return new Enemy(scene, world, sp.type, sp.level, home, { boss: true, bossName: sp.name });
  });
}

// Populate each dungeon with a pack of monsters and a dungeon Warden boss.
export function spawnDungeons(scene, world) {
  const enemies = [];
  for (const d of world.dungeons) {
    const pool = TYPE_BY_LEVEL(d.level);
    // A pack of regular monsters scattered through the room.
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 22;
      const home = new THREE.Vector3(d.center.x + Math.cos(a) * r, 0, d.center.z + Math.sin(a) * r);
      const e = new Enemy(scene, world, pool[Math.floor(Math.random() * pool.length)], d.level + Math.floor(Math.random() * 2), home);
      d.members.push(e); enemies.push(e);
    }
    // The Warden — a boss at the far end guarding the chest.
    const bossHome = new THREE.Vector3(d.chestPos.x, 0, d.chestPos.z + 6);
    const warden = new Enemy(scene, world, d.level >= 14 ? 'knight' : 'brute', d.level + 3, bossHome, { boss: true, bossName: `${d.name} Warden` });
    d.members.push(warden); enemies.push(warden);
  }
  return enemies;
}

// Populate each elite war-camp with a pack of elites guarding its chest.
export function spawnCamps(scene, world) {
  const enemies = [];
  for (const camp of world.camps) {
    const pool = TYPE_BY_LEVEL(camp.level + 2); // tougher pool than a normal zone
    const count = 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const home = new THREE.Vector3(camp.pos.x + Math.cos(a) * 5, 0, camp.pos.z + Math.sin(a) * 5);
      const typeId = pool[Math.floor(Math.random() * pool.length)];
      const e = new Enemy(scene, world, typeId, camp.level + 2, home, { elite: true, campId: camp.id });
      camp.members.push(e);
      enemies.push(e);
    }
  }
  return enemies;
}
