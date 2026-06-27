// ============================================================
// Combat: resolves the player's auto-attacks and abilities against
// enemies, manages travelling projectiles, target selection, and
// reports damage/heal/xp events to the UI for floaters & the log.
// ============================================================
import * as THREE from 'three';
import { CLASSES } from './classes.js';

export class Combat {
  constructor({ scene, player, enemies, ui, camera, audio }) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;     // live array reference
    this.ui = ui;
    this.cam = camera;
    this.audio = audio;
    this.projectiles = [];
    this.target = null;
    this.def = CLASSES[player.classId];
  }

  update(dt, input) {
    const p = this.player;
    if (!p.alive) { this._updateProjectiles(dt); return; }

    // Drop dead/despawned target.
    if (this.target && (!this.target.alive)) this.target = null;

    // Tab cycles target.
    if (input.just('Tab')) this.cycleTarget();

    // Auto-attack (LMB held).
    if (input.lmb && p.attackTimer <= 0) this.autoAttack();

    // Abilities 1-4 (slot 0..2 are the three class abilities).
    const keys = ['Digit1', 'Digit2', 'Digit3'];
    for (let i = 0; i < keys.length; i++) {
      if (input.just(keys[i])) this.useAbility(i);
    }

    this._updateProjectiles(dt);
  }

  // ---- Targeting ----
  cycleTarget() {
    const inRange = this.enemies
      .filter((e) => e.alive && e.pos.distanceTo(this.player.pos) < 40)
      .sort((a, b) => a.pos.distanceTo(this.player.pos) - b.pos.distanceTo(this.player.pos));
    if (inRange.length === 0) { this.target = null; return; }
    const idx = this.target ? inRange.indexOf(this.target) : -1;
    this.target = inRange[(idx + 1) % inRange.length];
  }

  // Nearest enemy within a forward cone of the camera.
  _aimEnemy(range, arc = 1.2) {
    if (this.target && this.target.alive && this.target.pos.distanceTo(this.player.pos) <= range) return this.target;
    const fwd = this.cam.forward();
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3().subVectors(e.pos, this.player.pos);
      const d = to.length();
      if (d > range) continue;
      to.y = 0; to.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(to.dot(fwd), -1, 1));
      if (ang > arc) continue;
      const score = d + ang * 4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  _faceFromCamera() {
    const f = this.cam.forward();
    this.player.facing = Math.atan2(f.x, f.z);
  }

  // ---- Auto attack ----
  autoAttack() {
    const p = this.player;
    p.attackTimer = this.def.attackSpeed;
    p.attackAnim = 1;
    this._faceFromCamera();
    if (this.audio) this.audio.play('swing');

    if (this.def.ranged) {
      this.spawnProjectile({
        speed: 24, mult: 1, glyph: this.def.projGlyph || 'arrow', range: this.def.range,
      });
    } else {
      const e = this._aimEnemy(this.def.range, 1.0);
      if (e) this._strike(e, p.apower, { crit: this.def.critBonus || 0 });
    }
  }

  // ---- Abilities ----
  useAbility(i) {
    const p = this.player;
    const ab = this.def.abilities[i];
    if (!ab) return;
    if (p.cooldowns[i] > 0) { this.ui.log(`${ab.name} on cooldown`, 'sys'); return; }
    const pool = ab.costType === 'mp' ? 'mp' : ab.costType === 'sp' ? 'sp' : 'mp';
    if (p.stats[pool] < ab.cost) { this.ui.log(`Not enough ${pool.toUpperCase()}`, 'sys'); return; }

    p.stats[pool] -= ab.cost;
    p.cooldowns[i] = ab.cooldown;
    p.attackAnim = 1;
    this._faceFromCamera();
    if (this.audio) this.audio.play('cast');

    switch (ab.kind) {
      case 'melee': this._abilityMelee(ab); break;
      case 'projectile': this._abilityProjectile(ab); break;
      case 'heal': this._abilityHeal(ab); break;
      case 'buff': this._abilityBuff(ab); break;
      case 'dash': this._abilityDash(ab); break;
    }
    this.ui.flashSlot(i);
  }

  _abilityMelee(ab) {
    const dir = this.cam.forward();
    const origin = this.player.pos;
    let hit = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3().subVectors(e.pos, origin);
      const d = to.length();
      if (d > ab.range) continue;
      to.y = 0; to.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(to.dot(dir), -1, 1));
      if (ang > ab.arc / 2) continue;
      this._strike(e, this.player.apower * ab.mult, { crit: (ab.crit || 0) + (this.def.critBonus || 0) });
      if (ab.stun) e.applyStun(ab.stun);
      hit++;
    }
    this._slashFx(origin, dir, ab.range);
  }

  _abilityProjectile(ab) {
    const count = ab.count || 1;
    const spread = ab.spread || 0;
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1) - 0.5);
      this.spawnProjectile({
        speed: ab.speed, mult: ab.mult, glyph: ab.glyph === '🔥' ? 'fire' : (this.def.projGlyph || 'arrow'),
        range: 30, spreadAngle: t * spread, pierce: ab.pierce, aoe: ab.aoe, holy: ab.holy,
      });
    }
  }

  _abilityHeal(ab) {
    const amt = this.player.stats.maxHp * ab.amount;
    const healed = this.player.heal(amt);
    this.ui.floater(`+${healed}`, 'heal', this.player.pos);
    this.ui.log(`You heal for ${healed}`, 'heal');
    this._healFx(this.player.pos);
  }

  _abilityBuff(ab) {
    const p = this.player;
    if (ab.buff) {
      if (ab.buff.dmg) { p.buffs.dmg = ab.buff.dmg; p.buffs.until = p.clock + ab.buff.dur; }
      if (ab.buff.speed) { p.buffs.speed = ab.buff.speed; }
      if (ab.buff.shield) { p.buffs.shield = ab.buff.shield; p.buffs.shieldUntil = p.clock + ab.buff.dur; }
      this.ui.log(`${ab.name}!`, 'xp');
      this.ui.floater(ab.name, 'heal', p.pos);
    }
    if (ab.nova) {
      // Frost Nova: damage + slow everything nearby.
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.pos.distanceTo(p.pos) <= ab.nova.radius) {
          this._strike(e, p.apower * ab.nova.mult, {});
          e.applySlow(ab.nova.slow);
        }
      }
      this._novaFx(p.pos, ab.nova.radius);
    }
  }

  _abilityDash(ab) {
    const p = this.player;
    const dir = this.cam.forward();
    // Move the player forward up to ab.range, stopping at collisions.
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const nx = p.pos.x + dir.x * (ab.range / steps);
      const nz = p.pos.z + dir.z * (ab.range / steps);
      const res = p.world.resolveCircle(nx, nz, 0.5);
      if (Math.hypot(res.x - nx, res.z - nz) > 0.4) break; // blocked
      p.pos.x = res.x; p.pos.z = res.z;
    }
    p.facing = Math.atan2(dir.x, dir.z);
    if (ab.iframes) p.iframeUntil = p.clock + ab.iframes;
    // Damage things passed through.
    if (ab.mult > 0) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.pos.distanceTo(p.pos) <= (ab.arc || 1.5) + 1) {
          this._strike(e, p.apower * ab.mult, {});
        }
      }
    }
    this._dashFx(p.pos);
  }

  // ---- Damage application ----
  _strike(enemy, amount, { crit = 0 }) {
    const isCrit = Math.random() < (0.05 + crit);
    let dmg = amount * (0.9 + Math.random() * 0.2);
    if (isCrit) dmg *= 1.8;
    const res = enemy.takeDamage(dmg, isCrit);
    if (this.audio) this.audio.play('hit');
    this.ui.floater(`${res.dealt}${isCrit ? '!' : ''}`, isCrit ? 'crit' : 'dmg', enemy.pos);
    if (res.killed) {
      const levels = this.player.gainXp(res.xp);
      this.ui.floater(`+${res.xp} XP`, 'xp', enemy.pos);
      this.ui.log(`Slain ${enemy.type.name} (+${res.xp} XP)`, 'xp');
      if (this.audio) this.audio.play('kill');
      if (levels > 0) { this.ui.levelUp(this.player.stats.level); if (this.audio) this.audio.play('level'); }
      if (this.target === enemy) this.target = null;
    }
  }

  // ---- Projectiles ----
  spawnProjectile({ speed, mult, glyph, range = 30, spreadAngle = 0, pierce = false, aoe = 0, holy = false }) {
    const dir = this.cam.forward().clone();
    if (spreadAngle) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle);
    const colorMap = { arrow: 0xdddddd, fire: 0xff6a2a, holy: 0xffe27a, spark: 0x6f9aef, knife: 0xcfcfcf };
    const color = colorMap[glyph] || 0xffffff;
    const geo = glyph === 'fire' ? new THREE.SphereGeometry(0.35, 8, 8) : new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    if (glyph !== 'fire') { mesh.rotation.x = Math.PI / 2; }
    const start = this.player.pos.clone(); start.y += 1.3;
    mesh.position.copy(start);
    if (glyph !== 'fire') mesh.lookAt(start.clone().add(dir));
    const light = glyph === 'fire' || holy ? new THREE.PointLight(color, 1.5, 6) : null;
    if (light) mesh.add(light);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh, dir, speed, range, traveled: 0,
      dmg: this.player.apower * mult,
      pierce, aoe, holy, hitSet: new Set(),
    });
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = pr.speed * dt;
      pr.mesh.position.addScaledVector(pr.dir, step);
      pr.traveled += step;

      let consumed = false;
      for (const e of this.enemies) {
        if (!e.alive || pr.hitSet.has(e.id)) continue;
        if (pr.mesh.position.distanceTo(e.pos.clone().setY(e.pos.y + 1)) < 1.1) {
          pr.hitSet.add(e.id);
          if (pr.aoe > 0) {
            // explode: hit all enemies in radius
            for (const e2 of this.enemies) {
              if (e2.alive && e2.pos.distanceTo(e.pos) <= pr.aoe) this._strike(e2, pr.dmg, {});
            }
            this._explodeFx(pr.mesh.position, pr.aoe);
            consumed = true;
          } else {
            this._strike(e, pr.dmg, {});
            if (!pr.pierce) consumed = true;
          }
          if (consumed) break;
        }
      }

      if (consumed || pr.traveled >= pr.range) {
        this.scene.remove(pr.mesh);
        pr.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ---- Visual FX (lightweight, auto-cleaned) ----
  _tempMesh(mesh, life) {
    this.scene.add(mesh);
    mesh.userData.fxLife = life;
    mesh.userData.fxMax = life;
    (this._fx ||= []).push(mesh);
  }
  updateFx(dt) {
    if (!this._fx) return;
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const m = this._fx[i];
      m.userData.fxLife -= dt;
      const t = m.userData.fxLife / m.userData.fxMax;
      if (m.material) m.material.opacity = Math.max(0, t);
      if (m.userData.grow) m.scale.multiplyScalar(1 + dt * m.userData.grow);
      if (m.userData.rise) m.position.y += dt * m.userData.rise;
      if (m.userData.fxLife <= 0) {
        this.scene.remove(m); m.geometry.dispose(); this._fx.splice(i, 1);
      }
    }
  }
  _slashFx(origin, dir, range) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(range * 0.4, range, 16, 1, -0.8, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(origin); m.position.y += 0.6;
    m.rotation.z = -Math.atan2(dir.x, dir.z);
    this._tempMesh(m, 0.22);
  }
  _healFx(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x7bf08a, transparent: true, opacity: 0.5 }));
    m.position.copy(pos); m.position.y += 1;
    m.userData.grow = 1.5; m.userData.rise = 1.5;
    this._tempMesh(m, 0.6);
  }
  _novaFx(pos, r) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, r, 24),
      new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.3;
    this._tempMesh(m, 0.5);
  }
  _explodeFx(pos, r) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.7 }));
    m.position.copy(pos); m.userData.grow = 3;
    this._tempMesh(m, 0.3);
  }
  _dashFx(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    m.position.copy(pos); m.position.y += 1; m.userData.grow = 2;
    this._tempMesh(m, 0.25);
  }
}
