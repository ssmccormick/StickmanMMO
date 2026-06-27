// ============================================================
// Enemies: stickman monsters with a simple FSM (idle/wander →
// chase → attack), health, level-scaled stats, death + respawn.
// Spawned per world zone so difficulty rises away from town.
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman } from './stickman.js';
import { heightAt } from './world.js';

const TYPES = {
  slime:    { name: 'Stick Slime',   color: 0x6fae54, accent: 0x3f7d3a, scale: 0.8, hp: 30,  dmg: 6,  speed: 2.6, range: 1.8, xp: 14, aggro: 12 },
  grunt:    { name: 'Bandit',        color: 0x8a6a4a, accent: 0xd8423c, scale: 1.0, hp: 55,  dmg: 10, speed: 3.6, range: 2.2, xp: 24, aggro: 16 },
  wolf:     { name: 'Dire Stick',    color: 0x66707a, accent: 0xcfcfcf, scale: 0.9, hp: 45,  dmg: 9,  speed: 5.2, range: 2.0, xp: 22, aggro: 20 },
  brute:    { name: 'Ogre Brute',    color: 0x7a5a8a, accent: 0xb04a3a, scale: 1.5, hp: 140, dmg: 22, speed: 2.8, range: 2.8, xp: 60, aggro: 14 },
  knight:   { name: 'Fallen Knight', color: 0x3a3f4a, accent: 0x9aa4ef, scale: 1.1, hp: 95,  dmg: 16, speed: 3.8, range: 2.4, xp: 44, aggro: 18 },
};
const TYPE_BY_LEVEL = (lvl) => {
  if (lvl <= 1) return ['slime', 'slime', 'grunt'];
  if (lvl <= 3) return ['grunt', 'wolf', 'slime'];
  if (lvl <= 5) return ['grunt', 'wolf', 'knight'];
  if (lvl <= 7) return ['wolf', 'knight', 'brute'];
  if (lvl <= 10) return ['knight', 'brute', 'wolf'];
  return ['brute', 'knight', 'brute'];
};

let NEXT_ID = 1;

export class Enemy {
  constructor(scene, world, typeId, level, home) {
    this.id = NEXT_ID++;
    this.world = world;
    this.type = TYPES[typeId];
    this.typeId = typeId;
    this.level = level;
    this.home = home.clone();

    const lvlScale = 1 + (level - 1) * 0.32;
    this.maxHp = Math.round(this.type.hp * lvlScale);
    this.hp = this.maxHp;
    this.dmg = this.type.dmg * (1 + (level - 1) * 0.22);
    this.xp = Math.round(this.type.xp * (1 + (level - 1) * 0.4));

    this.mesh = createStickman({ color: this.type.color, accent: this.type.accent, scale: this.type.scale });
    scene.add(this.mesh);

    this.pos = home.clone();
    this.pos.y = heightAt(this.pos.x, this.pos.z);
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
    spr.position.y = 2.5 * this.type.scale + 0.6;
    this._drawPlate();
    return spr;
  }
  _drawPlate() {
    const ctx = this._plateCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(`${this.type.name}  Lv${this.level}`, 129, 23);
    ctx.fillStyle = this.hp < this.maxHp ? '#ff6b6b' : '#ffd24a';
    ctx.fillText(`${this.type.name}  Lv${this.level}`, 128, 22);
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
      animateStickman(this.mesh, dt, { dead: true });
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this._respawn();
      return;
    }

    if (this.stun > 0) { this.stun -= dt; this._speed01 = 0; this._finish(dt); return; }
    if (this.slow > 0) this.slow -= dt;
    const speedMult = this.slow > 0 ? 0.45 : 1;

    const toPlayer = player.alive ? new THREE.Vector3().subVectors(player.pos, this.pos) : null;
    const dist = toPlayer ? toPlayer.length() : Infinity;

    // ---- Feared: flee from the player, ignoring all other behavior ----
    if (this.fear > 0) {
      this.fear -= dt;
      if (toPlayer && dist > 0.1) {
        const flee = toPlayer.clone().setY(0).normalize().multiplyScalar(-1);
        this.pos.x += flee.x * this.type.speed * 1.1 * dt;
        this.pos.z += flee.z * this.type.speed * 1.1 * dt;
        this.facing = Math.atan2(flee.x, flee.z);
        this._speed01 = 0.8;
      }
      const res = this.world.resolveCircle(this.pos.x, this.pos.z, 0.5);
      this.pos.x = res.x; this.pos.z = res.z;
      this.pos.y = heightAt(this.pos.x, this.pos.z);
      this._finish(dt);
      return;
    }

    // ---- FSM ----
    if (player.alive && dist < this.type.aggro) {
      this.state = dist <= this.type.range ? 'attack' : 'chase';
    } else if (this.state !== 'idle' && dist > this.type.aggro * 1.4) {
      this.state = 'return';
    }

    let move = new THREE.Vector3();
    if (this.state === 'chase' && toPlayer) {
      move.copy(toPlayer).setY(0).normalize();
    } else if (this.state === 'attack' && toPlayer) {
      // face player, hold, swing on cooldown
      this.facing = Math.atan2(toPlayer.x, toPlayer.z);
      if (this.attackTimer <= 0) {
        this.attackTimer = 1.6;
        this.attackAnim = 1;
        this.pendingHit = { at: t + 0.35, applied: false }; // telegraph window
      }
    } else if (this.state === 'return') {
      const toHome = new THREE.Vector3().subVectors(this.home, this.pos).setY(0);
      if (toHome.length() < 1.5) { this.state = 'idle'; this.wanderTarget = this._randomNear(this.home, 6); }
      else move.copy(toHome).normalize();
    } else {
      // idle wander
      const toW = new THREE.Vector3().subVectors(this.wanderTarget, this.pos).setY(0);
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

    const speed = this.type.speed * speedMult;
    if (move.lengthSq() > 0.0001) {
      this.pos.x += move.x * speed * dt;
      this.pos.z += move.z * speed * dt;
      this.facing = Math.atan2(move.x, move.z);
      this._speed01 = THREE.MathUtils.clamp(speed / 6, 0, 1) * (move.length());
    } else {
      this._speed01 = 0;
    }

    // collision + ground clamp
    const res = this.world.resolveCircle(this.pos.x, this.pos.z, 0.5);
    this.pos.x = res.x; this.pos.z = res.z;
    this.pos.y = heightAt(this.pos.x, this.pos.z);

    if (this.attackTimer > 0) this.attackTimer -= dt;
    this._finish(dt);
  }

  _finish(dt) {
    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 2.4);
    this.mesh.position.copy(this.pos);
    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, dt * 12);
    animateStickman(this.mesh, dt, { speed01: this._speed01, attack: this.attackAnim });

    // Hit flash fade.
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      const s = 1 + this._hitFlash * 0.3;
      this.mesh.scale.setScalar(this.type.scale * s);
      if (this._hitFlash <= 0) this.mesh.scale.setScalar(this.type.scale);
    }
  }

  takeDamage(amount, crit = false) {
    if (!this.alive) return { dealt: 0, killed: false };
    amount = Math.max(1, Math.round(amount));
    this.hp -= amount;
    this._hitFlash = 0.18;
    // aggro on hit
    if (this.state === 'idle' || this.state === 'return') this.state = 'chase';
    this._drawPlate();
    if (this.hp <= 0) { this.hp = 0; this._die(); return { dealt: amount, killed: true, crit, xp: this.xp }; }
    return { dealt: amount, killed: false, crit };
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
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.mesh.rotation.x = 0;
    this.mesh.scale.setScalar(this.type.scale);
    this.state = 'idle';
    this.nameplate.visible = true;
    this._drawPlate();
  }
}

// Populate every spawn zone with level-appropriate monsters.
export function spawnEnemies(scene, world) {
  const enemies = [];
  for (const zone of world.spawnZones) {
    const pool = TYPE_BY_LEVEL(zone.level);
    for (let i = 0; i < zone.count; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * zone.radius;
      const home = new THREE.Vector3(zone.center.x + Math.cos(a) * d, 0, zone.center.z + Math.sin(a) * d);
      const typeId = pool[Math.floor(Math.random() * pool.length)];
      const lvl = zone.level + Math.floor(Math.random() * 2);
      enemies.push(new Enemy(scene, world, typeId, lvl, home));
    }
  }
  return enemies;
}
