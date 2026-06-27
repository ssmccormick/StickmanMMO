// ============================================================
// Local player controller: owns the stickman mesh, the movement
// state machine (grounded / airborne / climbing), vitals & their
// regen, and XP/leveling. Combat lives in combat.js and reads
// from here.
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman } from './stickman.js';
import { CLASSES, makeStats, applyLevelUp, attackPower } from './classes.js';
import { heightAt } from './world.js';

const GRAVITY = 26;
const JUMP_VEL = 9.5;
const WALK_SPEED = 7.0;
const SPRINT_MULT = 1.7;
const CLIMB_SPEED = 3.2;
const RADIUS = 0.5;

export class Player {
  constructor(scene, world, classId, name) {
    this.world = world;
    this.name = name;
    this.classId = classId;
    this.def = CLASSES[classId];
    this.stats = makeStats(classId);

    this.mesh = createStickman({ color: this.def.color, accent: this.def.accent });
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(0, heightAt(0, 0), 6);
    this.vel = new THREE.Vector3();
    this.facing = 0;            // yaw the figure points toward
    this.state = 'ground';      // ground | air | climb
    this.alive = true;
    this.respawn = this.pos.clone();

    // timers / combat-facing fields used by combat.js
    this.attackTimer = 0;       // remaining auto-attack cooldown
    this.attackAnim = 0;        // 0..1 swing animation
    this.cooldowns = [0, 0, 0]; // ability cooldowns
    this.buffs = { dmg: 1, speed: 1, shield: 0, until: 0, shieldUntil: 0 };
    this.iframeUntil = 0;
    this.invulnTime = 0;

    this._speed01 = 0;
    this._clock = 0;
  }

  get apower() { return attackPower(this.classId, this.stats) * (this.buffs.until > this._clock ? this.buffs.dmg : 1); }

  // ---- Movement ----
  update(dt, input, cam) {
    this._clock += dt;
    if (!this.alive) { animateStickman(this.mesh, dt, { dead: true }); return; }

    const axis = input.moveAxis();
    const fwd = cam.forward(), right = cam.right();
    // Desired world-space move direction.
    const move = new THREE.Vector3()
      .addScaledVector(fwd, axis.z)
      .addScaledVector(right, axis.x);
    const moving = move.lengthSq() > 0.001;
    if (moving) move.normalize();

    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const sprinting = wantSprint && moving && this.stats.sp > 1 && this.state !== 'climb';

    // ---------- CLIMB STATE ----------
    if (this.state === 'climb') {
      this._updateClimb(dt, input, move, moving);
    } else {
      // ---------- GROUND / AIR ----------
      let speed = WALK_SPEED * (this.buffs.until > this._clock ? this.buffs.speed : 1);
      if (sprinting) { speed *= SPRINT_MULT; this.stats.sp -= 22 * dt; }

      this.vel.x = move.x * speed;
      this.vel.z = move.z * speed;
      this.vel.y -= GRAVITY * dt;

      // Jump
      if (input.just('Space') && this.state === 'ground') {
        this.vel.y = JUMP_VEL;
        this.state = 'air';
      }

      // Integrate
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;

      // Horizontal collision against world boxes.
      const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS);
      this.pos.x = res.x; this.pos.z = res.z;

      // Start climbing BotW-style: press forward into a climbable wall
      // with stamina to spare. Works from the ground or mid-air.
      if (res.climb && axis.z > 0 && this.stats.sp > 2) {
        this._startClimb(res.climb, move);
      }

      // Ground clamp
      const ground = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vel.y = 0;
        this.state = 'ground';
      } else if (this.state !== 'climb') {
        this.state = 'air';
      }

      // Face movement direction
      if (moving) this.facing = Math.atan2(move.x, move.z);
      this._speed01 = THREE.MathUtils.clamp(Math.hypot(this.vel.x, this.vel.z) / (WALK_SPEED * SPRINT_MULT), 0, 1);
    }

    this._applyTransform(dt);
    this._regen(dt, sprinting);
  }

  _startClimb(collider, move) {
    this.state = 'climb';
    this.climbCollider = collider;
    this.vel.set(0, 0, 0);
    // Face into the wall: pick the wall normal closest to approach.
    const cx = (collider.min.x + collider.max.x) / 2;
    const cz = (collider.min.z + collider.max.z) / 2;
    this.facing = Math.atan2(cx - this.pos.x, cz - this.pos.z);
  }

  _updateClimb(dt, input, move, moving) {
    const c = this.climbCollider;
    // Drain stamina while climbing.
    this.stats.sp -= 9 * dt;
    if (this.stats.sp <= 0) { this.stats.sp = 0; this._dropClimb(); return; }

    // Jump off the wall.
    if (input.just('Space')) {
      this._dropClimb();
      this.vel.y = JUMP_VEL * 0.8;
      // hop backward off the wall
      this.vel.x = -Math.sin(this.facing) * 5;
      this.vel.z = -Math.cos(this.facing) * 5;
      this.state = 'air';
      return;
    }

    const axis = input.moveAxis();
    // Vertical via W/S, lateral via A/D along the wall.
    let vy = axis.z * CLIMB_SPEED;
    // lateral movement is perpendicular to facing
    const lateralX = Math.cos(this.facing) * axis.x * CLIMB_SPEED;
    const lateralZ = -Math.sin(this.facing) * axis.x * CLIMB_SPEED;

    this.pos.y += vy * dt;
    this.pos.x += lateralX * dt;
    this.pos.z += lateralZ * dt;

    // Stick to the wall surface horizontally.
    const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS - 0.1);
    this.pos.x = res.x; this.pos.z = res.z;

    // Reached the top → mantle over onto the cliff.
    if (this.pos.y >= c.max.y - 0.3) {
      this.pos.y = c.max.y + 0.1;
      // nudge forward onto the top surface
      this.pos.x += Math.sin(this.facing) * 0.9;
      this.pos.z += Math.cos(this.facing) * 0.9;
      this._dropClimb();
      this.state = 'air';
      return;
    }
    // Slid below base → let go.
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground + 0.1 || !this.world.climbAhead(this.pos, Math.sin(this.facing), Math.cos(this.facing), 1.4)) {
      this._dropClimb();
    }
    this._speed01 = moving ? 0.6 : 0;
  }

  _dropClimb() {
    this.state = 'air';
    this.climbCollider = null;
  }

  _applyTransform(dt) {
    this.mesh.position.copy(this.pos);
    // Smoothly rotate toward facing.
    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, dt * 14);

    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3.2);
    animateStickman(this.mesh, dt, {
      speed01: this._speed01,
      attack: this.attackAnim,
      climbing: this.state === 'climb',
      airborne: this.state === 'air',
    });
  }

  _regen(dt, sprinting) {
    const s = this.stats;
    // Stamina regenerates when not actively spending it.
    if (!sprinting && this.state !== 'climb') s.sp = Math.min(s.maxSp, s.sp + 16 * dt);
    s.mp = Math.min(s.maxMp, s.mp + (1.5 + s.int * 0.05) * dt);
    if (this.state === 'ground' && this._speed01 < 0.1) s.hp = Math.min(s.maxHp, s.hp + 2.0 * dt);
    s.sp = Math.max(0, s.sp);

    // tick cooldowns
    for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    if (this.attackTimer > 0) this.attackTimer -= dt;
  }

  // ---- Vitals / combat hooks ----
  takeDamage(amount, fromPos) {
    if (!this.alive) return 0;
    if (this._clock < this.iframeUntil) return 0;
    // Shield buff absorbs a fraction.
    if (this.buffs.shieldUntil > this._clock && this.buffs.shield > 0) {
      amount *= (1 - this.buffs.shield);
    }
    amount = Math.max(1, Math.round(amount));
    this.stats.hp -= amount;
    if (this.stats.hp <= 0) { this.stats.hp = 0; this.die(); }
    return amount;
  }

  heal(amount) {
    amount = Math.round(amount);
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
    return amount;
  }

  die() {
    this.alive = false;
    this.state = 'air';
    this.deathAt = this._clock;
  }

  reviveAt(pos) {
    this.alive = true;
    this.pos.copy(pos);
    this.pos.y = heightAt(pos.x, pos.z);
    this.vel.set(0, 0, 0);
    this.state = 'ground';
    this.mesh.rotation.x = 0;
    this.stats.hp = this.stats.maxHp;
    this.stats.mp = this.stats.maxMp;
    this.stats.sp = this.stats.maxSp;
  }

  // returns number of levels gained
  gainXp(amount) {
    this.stats.xp += amount;
    let gained = 0;
    while (this.stats.xp >= this.stats.xpNext) {
      applyLevelUp(this.stats);
      gained++;
    }
    return gained;
  }

  restAtBonfire(pos) {
    this.respawn = pos.clone();
    this.stats.hp = this.stats.maxHp;
    this.stats.mp = this.stats.maxMp;
    this.stats.sp = this.stats.maxSp;
  }

  get clock() { return this._clock; }
}
