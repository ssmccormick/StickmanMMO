// ============================================================
// Enemies: stickman monsters with a simple FSM (idle/wander →
// chase → attack), health, level-scaled stats, death + respawn.
// Spawned per world zone so difficulty rises away from town.
// ============================================================
import * as THREE from 'three';
import { animateStickman } from './stickman.js';
import { createCreature } from './creatures.js';
import { heightAt, BOSSES } from './world.js';
// Enemy archetypes + level-scaling live in a Three-free shared module so the
// authoritative server simulates identical enemies. Re-export DRAGON_ROOST so
// existing importers (main.js) keep working.
import { TYPES, TYPE_BY_LEVEL, DRAGON_ROOST, deriveStats, SPECIAL_SETS, specialsFor } from './sim/enemyTypes.js';
export { DRAGON_ROOST };

let NEXT_ID = 1;

// Enemy projectiles (the dodgeable shots fired by ranged mobs). Module-level so
// the main loop can tick them all at once with updateEnemyShots().
const ENEMY_SHOTS = [];
// Reused scratch vectors for the per-frame AI hot path — avoids allocating a
// handful of Vector3s per active enemy per frame, which was driving GC spikes.
const _toPlayer = new THREE.Vector3();
const _move = new THREE.Vector3();
const _scratch = new THREE.Vector3();
// Telegraphed special-attack definitions live in the shared sim module so the
// authoritative server drives identical specials (SPECIAL_SETS imported above).
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

// Spawn a dodgeable projectile from a server-authoritative ranged enemy. Reuses
// the same ENEMY_SHOTS pipeline (updateEnemyShots) so it flies and resolves
// against the local player exactly like a locally-fired shot.
export function spawnNetShot(scene, shot) {
  const from = new THREE.Vector3(shot.x, shot.y, shot.z);
  const to = new THREE.Vector3(shot.tx, shot.ty, shot.tz);
  const dir = to.sub(from); if (dir.lengthSq() < 1e-4) return; dir.normalize();
  const col = shot.color || 0xffaa44;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshBasicMaterial({ color: col }));
  mesh.position.copy(from);
  mesh.add(new THREE.PointLight(col, 1.2, 6));
  scene.add(mesh);
  ENEMY_SHOTS.push({ mesh, dir, speed: shot.speed || 15, range: shot.range || 24, traveled: 0, dmg: shot.dmg || 8, owner: null });
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

    const st = deriveStats(typeId, level, { boss: this.boss, elite: this.elite });
    this.maxHp = st.maxHp;
    this.hp = this.maxHp;
    this.dmg = st.dmg;
    this.xp = st.xp;
    this.displayScale = st.displayScale;

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

    // Telegraphed specials: a menu of charged attacks for this type (melee only;
    // ranged mobs keep firing). `charge` holds an in-progress wind-up/execution.
    this.specials = specialsFor(typeId, this.ranged);
    this.specialCd = 2.5 + Math.random() * 3;
    this.charge = null;
    this._jumpArc = 0;

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

    if (this.stun > 0) { this.stun -= dt; this._speed01 = 0; this._cancelCharge(); this._finish(dt); return; }
    if (this.slow > 0) this.slow -= dt;
    if (this.specialCd > 0) this.specialCd -= dt;
    const speedMult = this.slow > 0 ? 0.45 : 1;

    // A charged special in progress drives its own movement/telegraph/damage.
    if (this.charge) { this._updateCharge(dt, player, t); this._finish(dt); return; }

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

    // Commit to a telegraphed special when one is ready and in range (dash-type
    // specials fire from mid-range; slashes/slams from close up). The special
    // then takes over movement + damage via _updateCharge.
    if (this.specials.length && this.specialCd <= 0 && player.alive && dist < this.type.aggro
        && (this.state === 'attack' || this.state === 'chase')) {
      const ready = this.specials.filter((s) => dist >= s.minR && dist <= s.maxR);
      if (ready.length) {
        this._startCharge(ready[(Math.random() * ready.length) | 0], player);
        this._finish(dt);
        return;
      }
    }

    const move = _move.set(0, 0, 0);
    if (this.state === 'chase' && toPlayer) {
      move.copy(toPlayer).setY(0).normalize();
    } else if (this.state === 'attack' && toPlayer) {
      this.facing = Math.atan2(toPlayer.x, toPlayer.z);
      // Ranged mobs fire dodgeable shots; melee mobs deal damage only through
      // their telegraphed specials (no untelegraphed poke) — they just hold and
      // face while a special comes off cooldown.
      if (this.ranged) {
        if (dist < this.shootRange * 0.55) move.copy(toPlayer).setY(0).normalize().multiplyScalar(-1); // kite
        if (this.attackTimer <= 0) { this.attackTimer = 1.9 + Math.random() * 0.6; this.attackAnim = 1; this._fireShot(player); }
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

  // ---- Telegraphed special attacks ----
  _startCharge(sp, player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    this.charge = { sp, phase: 'windup', t: 0, dur: sp.windup, dx: dx / l, dz: dz / l,
                    tx: player.pos.x, tz: player.pos.z, applied: false, execT: 0 };
    this.facing = Math.atan2(dx, dz);
    this.attackAnim = 0.4; // brace/wind-up pose
    this._speed01 = 0;
    this._showTelegraph(sp);
  }

  _updateCharge(dt, player, t) {
    const c = this.charge, sp = c.sp;
    if (c.phase === 'windup') {
      c.t += dt;
      const p = Math.min(1, c.t / c.dur);
      this.facing = Math.atan2(c.dx, c.dz);
      this._speed01 = 0;
      if (this._chargeFill) this._chargeFill.scale.x = Math.max(0.0001, p);
      if (this._indicator) this._indicator.children[0].material.opacity = 0.16 + p * 0.34;
      if (sp.shape !== 'ring') this._positionIndicator(sp); // lane/arc follow the enemy
      if (p >= 1) {
        // FLASH, then execute.
        c.phase = 'exec'; c.execT = 0; c.applied = false;
        this.attackAnim = 1;
        if (this._chargeFill) this._chargeFill.material.color.setHex(0xffffff);
        if (this._indicator) this._indicator.children[0].material.opacity = 0.9;
      }
    } else {
      c.execT += dt;
      this._runExec(dt, c, player);
      if (c.execT >= sp.exec) this._endCharge(sp);
    }
    // Ground/collision clamp during the whole charge.
    const res = this.world.resolveCircle(this.pos.x, this.pos.z, 0.5);
    this.pos.x = res.x; this.pos.z = res.z;
    if (this.flying) this.flyHeight += (1.3 - this.flyHeight) * Math.min(1, dt * 4); // swoop down to strike
    const g = heightAt(this.pos.x, this.pos.z);
    this.pos.y = this.flying ? g + this.flyHeight : g + (this._jumpArc || 0);
    if (this.attackTimer > 0) this.attackTimer -= dt;
  }

  _runExec(dt, c, player) {
    const sp = c.sp;
    if (sp.shape === 'lane') {                    // dash / pounce / dash-stab
      this.pos.x += c.dx * sp.dashSpeed * dt;
      this.pos.z += c.dz * sp.dashSpeed * dt;
      this._speed01 = 1;
      if (!c.applied && player.alive && this.pos.distanceTo(player.pos) <= (sp.hitR || 1.4)) {
        c.applied = true; this._hitPlayer(player, sp.dmg);
      }
    } else if (sp.shape === 'ring') {             // slam / jump
      if (sp.id === 'jump') {
        this.pos.x += (c.tx - this.pos.x) * Math.min(1, dt * 7);
        this.pos.z += (c.tz - this.pos.z) * Math.min(1, dt * 7);
        this._jumpArc = Math.sin(Math.min(1, c.execT / sp.exec) * Math.PI) * 2.4;
      }
      if (!c.applied && c.execT >= sp.exec * 0.72) {
        c.applied = true;
        const cx = sp.id === 'jump' ? this.pos.x : c.tx, cz = sp.id === 'jump' ? this.pos.z : c.tz;
        if (player.alive && Math.hypot(player.pos.x - cx, player.pos.z - cz) <= sp.aoe) this._hitPlayer(player, sp.dmg);
      }
    } else {                                       // arc: cleave / slash
      if (!c.applied) {
        c.applied = true;
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (player.alive && d <= sp.range + 0.5) {
          let diff = Math.abs(((Math.atan2(dx, dz) - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff <= sp.arc / 2 + 0.2) this._hitPlayer(player, sp.dmg);
        }
      }
    }
  }

  _hitPlayer(player, mul) {
    if (!player.alive) return;
    const dealt = player.takeDamage(Math.round(this.dmg * mul), this.pos);
    if (dealt > 0) player.lastHitBy = this;
  }

  _endCharge(sp) {
    this.charge = null; this._jumpArc = 0;
    this.specialCd = sp.cd[0] + Math.random() * (sp.cd[1] - sp.cd[0]);
    this.attackTimer = Math.max(this.attackTimer, 0.8); // brief recovery
    this._clearTelegraph();
  }
  _cancelCharge() {
    if (!this.charge) return;
    this.charge = null; this._jumpArc = 0;
    this.specialCd = 2 + Math.random() * 2;
    this._clearTelegraph();
  }

  // Render-only telegraph for a SERVER-driven charge (multiplayer). The server
  // owns the logic + damage; the client only shows the bar + ground danger zone.
  renderCharge(cg) {
    if (!cg) {
      if (this._renderChargeId) { this._clearTelegraph(); this._renderChargeId = null; this.charge = null; }
      return;
    }
    const sp = (SPECIAL_SETS[this.typeId] || []).find((s) => s.id === cg.s);
    if (!sp) return;
    this.charge = { sp, dx: cg.dx || 0, dz: cg.dz || 1, tx: cg.tx != null ? cg.tx : this.pos.x, tz: cg.tz != null ? cg.tz : this.pos.z };
    if (this._renderChargeId !== cg.s) { this._showTelegraph(sp); this._renderChargeId = cg.s; }
    if (this._chargeFill) {
      this._chargeFill.scale.x = Math.max(0.0001, cg.pr || 0);
      this._chargeFill.material.color.setHex(cg.ph === 'e' ? 0xffffff : 0xff3020);
    }
    if (this._indicator) {
      this._indicator.children[0].material.opacity = cg.ph === 'e' ? 0.9 : (0.16 + (cg.pr || 0) * 0.34);
      if (sp.shape !== 'ring') this._positionIndicator(sp);
    }
    if (cg.ph === 'e') this.attackAnim = 1; // swing on execute
  }

  // Telegraph: a red charge bar over the enemy + a danger zone on the ground.
  _ensureChargeBar() {
    if (this._chargeBar) return;
    const W = 1.3, H = 0.14, ds = this.displayScale || 1;
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: 0x260000, transparent: true, opacity: 0.75, depthTest: false, side: THREE.DoubleSide }));
    bg.renderOrder = 998;
    const fgGeo = new THREE.PlaneGeometry(W, H * 0.7); fgGeo.translate(W / 2, 0, 0);
    const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
    fg.position.x = -W / 2; fg.scale.x = 0.0001; fg.renderOrder = 999;
    g.add(bg, fg);
    g.scale.setScalar(1 / ds);          // constant world size regardless of enemy scale
    g.position.y = 2.4 / ds;            // ~2.4u above the enemy in world space
    this.mesh.add(g);
    this._chargeBar = g; this._chargeFill = fg;
  }
  _showTelegraph(sp) {
    this._ensureChargeBar();
    this._chargeBar.visible = true;
    this._chargeFill.material.color.setHex(0xff3020);
    this._chargeFill.scale.x = 0.0001;
    if (this._indicator) { this.scene.remove(this._indicator); this._disposeObj(this._indicator); }
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: sp.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    let mesh;
    if (sp.shape === 'ring') { mesh = new THREE.Mesh(new THREE.CircleGeometry(sp.aoe, 28), mat); mesh.rotation.x = -Math.PI / 2; }
    else if (sp.shape === 'arc') { mesh = new THREE.Mesh(new THREE.CircleGeometry(sp.range * 0.62, 22), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.z = sp.range * 0.5; }
    else { mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp.width, sp.maxR), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.z = sp.maxR / 2; }
    g.add(mesh);
    this.scene.add(g);
    this._indicator = g;
    this._positionIndicator(sp);
  }
  _positionIndicator(sp) {
    const g = this._indicator; if (!g) return;
    if (sp.shape === 'ring') {
      g.position.set(this.charge.tx, heightAt(this.charge.tx, this.charge.tz) + 0.06, this.charge.tz);
      g.rotation.y = 0;
    } else {
      g.position.set(this.pos.x, heightAt(this.pos.x, this.pos.z) + 0.06, this.pos.z);
      g.rotation.y = Math.atan2(this.charge.dx, this.charge.dz);
    }
  }
  _clearTelegraph() {
    if (this._chargeBar) this._chargeBar.visible = false;
    if (this._chargeFill) { this._chargeFill.material.color.setHex(0xff3020); this._chargeFill.scale.x = 0.0001; }
    if (this._indicator) { this.scene.remove(this._indicator); this._disposeObj(this._indicator); this._indicator = null; }
  }
  _disposeObj(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }

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
    this.updatePlateVisibility();
  }

  // Only show the floating name + HP bar when the enemy is actively engaged
  // (aggro'd on / attacking the player), not while it idles or wanders.
  isEngaged() { return this.alive && (this.state === 'chase' || this.state === 'attack' || !!this.charge); }
  updatePlateVisibility() { if (this.nameplate) this.nameplate.visible = this.isEngaged(); }

  takeDamage(amount, crit = false) {
    if (!this.alive) return { dealt: 0, killed: false };
    amount = Math.max(1, Math.round(amount));
    // Server-driven enemy: forward the hit to the authority and show optimistic,
    // never-lethal feedback. The kill (and XP/loot) come back via enemy_death.
    if (this._net) {
      if (this._onNetHit) this._onNetHit(this._serverId, amount);
      this._hitFlash = 0.18;
      this.hp = Math.max(1, this.hp - amount); // bar dips but the server owns death
      this._drawPlate();
      return { dealt: amount, killed: false, crit };
    }
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
    this.respawnTimer = 54 + Math.random() * 30; // tripled respawn
    this.nameplate.visible = false;
    this._cancelCharge();
  }
  _respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.specialCd = 2.5 + Math.random() * 3;
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

// Bosses tied to hand-placed landmarks (castle lords, the Archmagus, etc.).
export function spawnBossSites(scene, world) {
  return (world.bossSites || []).map((sp) => {
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
