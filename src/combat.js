// ============================================================
// Combat: resolves auto-attacks and the player's LEARNED, rank-scaled
// abilities against enemies. Supports many distinct skill kinds —
// melee arcs, projectiles, ground-targeted AoE, chain lightning,
// lingering damage-over-time patches, lifesteal, buffs/novas, dashes,
// and temporary summons — each with its own visuals.
// ============================================================
import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { createStickman } from './stickman.js';
import { rollDrop, goldDrop, generateItem, makeUnique, bossDrop, RARITY } from './items.js';
import * as Quests from './quests.js';

export class Combat {
  constructor({ scene, player, enemies, ui, camera, audio }) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.ui = ui;
    this.cam = camera;
    this.audio = audio;
    this.def = CLASSES[player.classId];
    this.projectiles = [];
    this.patches = [];   // lingering DoT areas
    this.pendings = [];  // delayed ground explosions
    this.summons = [];   // temporary helpers
    this.drops = [];     // world loot pickups
    this._fx = [];
    this.casting = null; // in-progress spell cast: { slot, ab, until, total }
    this.target = null;
    this.onLoot = null;     // (item) => void, set by main for logging
    this.onPartyXp = null;  // (xp) => void, set by main to share kill XP with partymates
  }

  update(dt, input) {
    const p = this.player;
    if (this.target && !this.target.alive) this.target = null;

    // Resolve any in-progress spell cast first (it may fire this frame).
    this._updateCast(dt);

    if (p.alive && !this.suppressInput) {
      if (input.just('Tab')) this.cycleTarget();
      // Auto-attacks and new abilities are locked out while charging a spell.
      if (!this.casting) {
        if (input.lmb && p.attackTimer <= 0) this.autoAttack();
        const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
        for (let i = 0; i < keys.length; i++) if (input.just(keys[i])) this.useAbility(i);
      }
    }

    this._updateProjectiles(dt);
    this._updatePatches(dt);
    this._updatePendings(dt);
    this._updateSummons(dt);
    this._updateDrops(dt);
    this.updateFx(dt);
  }

  // ---- Targeting ----
  cycleTarget() {
    const inRange = this.enemies
      .filter((e) => e.alive && e.pos.distanceTo(this.player.pos) < 40)
      .sort((a, b) => a.pos.distanceTo(this.player.pos) - b.pos.distanceTo(this.player.pos));
    if (!inRange.length) { this.target = null; return; }
    const idx = this.target ? inRange.indexOf(this.target) : -1;
    this.target = inRange[(idx + 1) % inRange.length];
  }

  // Acquire the enemy you're aiming at. A locked target always wins (with a
  // little extra reach, so it doesn't slip out of assist range). Otherwise pick
  // the best foe within `arc` of the crosshair — the angle penalty is gentle so
  // generous off-centre aim still snaps onto what you clearly mean.
  _aimEnemy(range, arc = 1.4) {
    if (this.target && this.target.alive && this.target.pos.distanceTo(this.player.pos) <= range * 1.25) return this.target;
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
      const score = d + ang * 2;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  _faceCam() { const f = this.cam.forward(); this.player.facing = Math.atan2(f.x, f.z); }
  _face(dir) { this.player.facing = Math.atan2(dir.x, dir.z); }

  // The direction offensive skills should travel: toward the locked target
  // (or the enemy nearest the crosshair within `arc`), else straight ahead.
  // This is what makes projectiles "go where you're aiming".
  _aimDir(range, arc = 0.7) {
    const e = this._aimEnemy(range, arc);
    if (e) {
      const d = new THREE.Vector3().subVectors(e.pos, this.player.pos);
      d.y = 0;
      if (d.lengthSq() > 0.0001) return d.normalize();
    }
    return this.cam.forward();
  }

  // A point in front of the player, clamped to a max range (for ground AoE).
  _aimPoint(maxRange) {
    const fwd = this.cam.forward();
    const aimed = this._aimEnemy(maxRange, 0.9);
    if (aimed) return aimed.pos.clone();
    return this.player.pos.clone().addScaledVector(fwd, Math.min(maxRange, 8));
  }

  // ---- Auto attack ----
  autoAttack() {
    const p = this.player;
    p.attackTimer = this.def.attackSpeed;
    p.attackAnim = 1;
    if (this.audio) this.audio.play('swing');
    if (this.def.ranged) {
      const dir = this._aimDir(this.def.range, 0.8);
      this._face(dir);
      this.spawnProjectile(p.pos, dir, {
        speed: 24, mult: 1, color: this.def.projColor || 0xffffff,
        shape: this.def.projGlyph === 'arrow' ? 'arrow' : 'orb', range: this.def.range,
      });
    } else {
      this._faceCam();
      const e = this._aimEnemy(this.def.range, 1.3);
      if (e) this._strike(e, p.apower, { crit: this.def.critBonus || 0 });
    }
  }

  // ---- Abilities ----
  useAbility(i) {
    const p = this.player;
    const ab = p.ability(i);
    if (!ab) return;
    if (p.cooldowns[i] > 0) { this.ui.log(`${ab.name} on cooldown`, 'sys'); return; }
    const pool = ab.costType === 'sp' ? 'sp' : 'mp';
    if (p.stats[pool] < ab.cost) { this.ui.log(`Not enough ${pool.toUpperCase()}`, 'sys'); return; }
    // Ascending costs a FULL Ki gauge, not MP/SP — block it (without burning the
    // cooldown) until the gauge is full and there's a higher form to reach.
    if (ab.kind === 'transform' && !p.canAscend()) {
      this.ui.log(p.ssjLevel >= 3 ? 'Already at the highest Super Saiyan form!' : `Ki not full — ${Math.floor(p.ki)}/${p.kiMax}.`, 'sys');
      return;
    }

    // Resources & cooldown commit up front (a cast is committed, not refunded).
    p.stats[pool] -= ab.cost;
    p.cooldowns[i] = ab.cooldown;
    p.attackAnim = 1;
    this._faceCam();
    if (this.audio) this.audio.play('cast');

    // Spells with a cast time charge up first — movement slows and a cast bar
    // fills — then the effect fires on completion (re-aimed at that moment).
    if (ab.castTime > 0) {
      this.casting = { slot: i, ab, until: p.clock + ab.castTime, total: ab.castTime };
      p.casting = true;
      if (this.ui.showCastBar) this.ui.showCastBar(ab.name, ab.glyph);
      this._chargeFx(ab.color || 0xffffff);
      return;
    }

    this._fireAbility(ab);
    this.ui.flashSlot(i);
  }

  // Dispatch an ability's effect by kind (shared by instant casts and the
  // completion of a charged cast).
  _fireAbility(ab) {
    switch (ab.kind) {
      case 'melee': this._kMelee(ab); break;
      case 'projectile': this._kProjectile(ab); break;
      case 'groundaoe': this._kGroundAoe(ab); break;
      case 'chain': this._kChain(ab); break;
      case 'dot': this._kDot(ab); break;
      case 'lifesteal': this._kLifesteal(ab); break;
      case 'heal': this._kHeal(ab); break;
      case 'buff': this._kBuff(ab); break;
      case 'dash': this._kDash(ab); break;
      case 'summon': this._kSummon(ab); break;
      case 'beam': this._kBeam(ab); break;
      case 'instantstep': this._kInstantStep(ab); break;
      case 'transform': this._kTransform(ab); break;
    }
  }

  // Advance an in-progress cast; fire it (or cancel on death) when due.
  _updateCast(dt) {
    const c = this.casting;
    if (!c) return;
    const p = this.player;
    if (!p.alive) { this._cancelCast(); return; }
    // Keep aiming where the camera looks; a charging caster pivots to track.
    this._faceCam();
    p.attackAnim = Math.max(p.attackAnim, 0.5); // hold a charging pose
    if (p.clock >= c.until) {
      const ab = c.ab, slot = c.slot;
      this.casting = null; p.casting = false;
      if (this.ui.hideCastBar) this.ui.hideCastBar();
      this._fireAbility(ab);
      this.ui.flashSlot(slot);
    } else if (this.ui.setCastProgress) {
      this.ui.setCastProgress(1 - (c.until - p.clock) / c.total);
    }
  }

  _cancelCast() {
    if (!this.casting) return;
    this.casting = null;
    this.player.casting = false;
    if (this.ui.hideCastBar) this.ui.hideCastBar();
  }

  _kMelee(ab) {
    const dir = this.cam.forward();
    const origin = this.player.pos;
    for (const e of this._inArc(origin, dir, ab.range, ab.arc)) {
      let dmg = this.player.apower * ab.mult;
      if (ab.execute && e.hp / e.maxHp < 0.35) dmg *= 1.8; // finisher bonus
      this._strike(e, dmg, { crit: (ab.crit || 0) + (this.def.critBonus || 0) });
      if (ab.stun) e.applyStun(ab.stun);
    }
    this._coneFx(origin, dir, ab.range, ab.arc, ab.color);
  }

  _kProjectile(ab) {
    const count = ab.count || 1;
    const spread = ab.spread || 0;
    // Aim the volley at the target/enemy under the crosshair (else forward).
    const baseDir = this._aimDir(36, 0.85);
    this._face(baseDir);
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1) - 0.5);
      const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), t * spread);
      this.spawnProjectile(this.player.pos, dir, {
        speed: ab.speed, mult: ab.mult, color: ab.color, shape: ab.shape || 'orb',
        range: 32, pierce: ab.pierce, aoe: ab.aoe, holy: ab.holy, stunOnHit: ab.stunOnHit,
      });
    }
  }

  _kGroundAoe(ab) {
    const pos = this._aimPoint(ab.range);
    pos.y = 0;
    this._telegraphFx(pos, ab.aoe, ab.color, ab.delay);
    this.pendings.push({ pos, radius: ab.aoe, dmg: this.player.apower * ab.mult, at: this.player.clock + ab.delay, color: ab.color });
  }

  _kChain(ab) {
    const first = this._aimEnemy(ab.range, 1.4) || this._nearest(this.player.pos, ab.range);
    if (!first) { this.ui.log('No target in range', 'sys'); return; }
    const hit = new Set();
    let cur = first, from = this.player.pos.clone(); from.y += 1.2;
    for (let j = 0; j < ab.jumps && cur; j++) {
      this._strike(cur, this.player.apower * ab.mult * Math.pow(0.85, j), {});
      hit.add(cur.id);
      this._boltFx(from, cur.pos.clone().setY(cur.pos.y + 1), ab.color);
      from = cur.pos.clone(); from.y += 1;
      cur = this._nearest(cur.pos, 7, hit);
    }
  }

  _kDot(ab) {
    const pos = ab.ranged ? this._aimPoint(12) : this.player.pos.clone();
    pos.y = 0;
    this._spawnPatch(pos, ab.radius, ab.dotDps, ab.dotDur, ab.color);
  }

  _kLifesteal(ab) {
    let dealt = 0;
    if (ab.ranged) {
      const e = this._aimEnemy(ab.range, 1.0);
      if (e) { const r = this._strike(e, this.player.apower * ab.mult, {}); dealt += r; this._boltFx(this.player.pos.clone().setY(this.player.pos.y + 1.2), e.pos.clone().setY(e.pos.y + 1), ab.color); }
    } else {
      const dir = this.cam.forward();
      for (const e of this._inArc(this.player.pos, dir, ab.range, ab.arc)) {
        dealt += this._strike(e, this.player.apower * ab.mult, {});
      }
      this._coneFx(this.player.pos, dir, ab.range, ab.arc, ab.color);
    }
    if (dealt > 0) {
      const healed = this.player.heal(dealt * ab.leech);
      if (healed > 0) { this.ui.floater(`+${healed}`, 'heal', this.player.pos); this._healFx(this.player.pos, ab.color); }
    }
  }

  _kHeal(ab) {
    const healed = this.player.heal(this.player.stats.maxHp * ab.amount);
    this.ui.floater(`+${healed}`, 'heal', this.player.pos);
    this.ui.log(`You heal for ${healed}`, 'heal');
    this._healFx(this.player.pos, ab.color);
  }

  _kBuff(ab) {
    const p = this.player;
    if (ab.buff) {
      if (ab.buff.dmg) { p.buffs.dmg = ab.buff.dmg; p.buffs.until = p.clock + ab.buff.dur; }
      if (ab.buff.speed) p.buffs.speed = ab.buff.speed;
      if (ab.buff.shield) { p.buffs.shield = ab.buff.shield; p.buffs.shieldUntil = p.clock + ab.buff.dur; }
      this.ui.log(`${ab.name}!`, 'xp');
      this.ui.floater(ab.name, 'heal', p.pos);
    }
    if (ab.nova) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.pos.distanceTo(p.pos) <= ab.nova.radius) {
          if (ab.nova.mult) this._strike(e, p.apower * ab.nova.mult, {});
          if (ab.nova.slow) e.applySlow(ab.nova.slow);
          if (ab.nova.fear) e.applyFear(ab.nova.fear);
        }
      }
      this._novaFx(p.pos, ab.nova.radius, ab.color);
    }
    if (ab.selfHeal) {
      const healed = p.heal(p.stats.maxHp * ab.selfHeal);
      if (healed) this.ui.floater(`+${healed}`, 'heal', p.pos);
    }
  }

  _kDash(ab) {
    const p = this.player;
    // Movement skills go where you're MOVING (WASD), not where you're aiming.
    // Fall back to camera-forward when standing still.
    const dir = (p.moveDir && p.moveDir.lengthSq() > 0.001) ? p.moveDir.clone().normalize() : this.cam.forward();
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const nx = p.pos.x + dir.x * (ab.range / steps);
      const nz = p.pos.z + dir.z * (ab.range / steps);
      const res = p.world.resolveCircle(nx, nz, 0.5);
      if (Math.hypot(res.x - nx, res.z - nz) > 0.4) break;
      p.pos.x = res.x; p.pos.z = res.z;
    }
    p.facing = Math.atan2(dir.x, dir.z);
    if (ab.iframes) p.iframeUntil = p.clock + ab.iframes;
    if (ab.mult > 0) {
      for (const e of this.enemies) {
        if (e.alive && e.pos.distanceTo(p.pos) <= (ab.arc || 1.5) + 1) this._strike(e, p.apower * ab.mult, {});
      }
    }
    this._dashFx(p.pos, ab.color);
  }

  _kSummon(ab) {
    const offset = new THREE.Vector3(Math.cos(this.player.clock) * 1.6, 0, Math.sin(this.player.clock) * 1.6);
    const pos = this.player.pos.clone().add(offset);
    const mesh = createStickman({ color: ab.color, accent: 0xffffff, scale: 0.6 });
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.summons.push({ mesh, pos, dur: ab.dur, atkEvery: ab.atkEvery, timer: 0.3, mult: ab.mult, color: ab.color, name: ab.name });
    this.ui.log(`${ab.name} summoned!`, 'xp');
  }

  // Kamehameha-style beam: a channelled line that hits every foe in its path.
  // Bends toward the target/aimed foe so it's easy to land down a lane.
  _kBeam(ab) {
    const dir = this._aimDir(ab.range, 0.55);
    this._face(dir);
    const origin = this.player.pos.clone();
    const halfW = (ab.width || 2) * 0.5 + 0.6; // a little forgiving on the edges
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3().subVectors(e.pos, origin); to.y = 0;
      const proj = to.x * dir.x + to.z * dir.z;       // distance along the beam
      if (proj < 0 || proj > ab.range) continue;
      const perp = Math.hypot(to.x - dir.x * proj, to.z - dir.z * proj);
      if (perp > halfW) continue;
      this._strike(e, this.player.apower * ab.mult, { crit: this.def.critBonus || 0 });
      if (ab.stunOnHit) e.applyStun(ab.stunOnHit);
    }
    this._beamFx(origin, dir, ab.range, ab.width || 2, ab.color || 0x3aa0ff);
    if (this.audio) this.audio.play('cast');
  }

  // Instant Step: teleport behind the locked/aimed target, face it, and snap
  // the camera around so you're looking at the foe from your new vantage.
  _kInstantStep(ab) {
    const p = this.player;
    let e = (this.target && this.target.alive && this.target.pos.distanceTo(p.pos) <= ab.range) ? this.target : null;
    if (!e) e = this._aimEnemy(ab.range, 1.8) || this._nearest(p.pos, ab.range);
    if (!e) { this.ui.log('No target to step behind.', 'sys'); return; }
    this._dashFx(p.pos, ab.color);                 // after-image at the old spot
    // Approach vector → land just beyond the enemy (its "back" relative to you).
    const dir = new THREE.Vector3().subVectors(e.pos, p.pos); dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const spot = e.pos.clone().addScaledVector(dir, 1.7);
    const res = p.world.resolveCircle(spot.x, spot.z, 0.5);
    p.pos.x = res.x; p.pos.z = res.z; p.pos.y = e.pos.y;
    // Face the target; it now lies back along -dir from where we landed.
    const face = new THREE.Vector3().subVectors(e.pos, p.pos); face.y = 0;
    if (face.lengthSq() < 1e-4) face.copy(dir).negate();
    p.facing = Math.atan2(face.x, face.z);
    p.iframeUntil = p.clock + 0.4;
    // Swing the camera so its forward points from the player toward the foe.
    if (this.cam && this.cam.yaw != null) this.cam.yaw = Math.atan2(-face.x, -face.z);
    this._dashFx(p.pos, ab.color);
    this._strike(e, p.apower * ab.mult, { crit: (this.def.critBonus || 0) + 0.3 }); // a strike from behind
    if (this.audio) this.audio.play('cast');
  }

  // Super Saiyan: spend a full Ki gauge to ascend a tier; release a golden
  // shockwave that damages nearby foes. Readiness is pre-checked in useAbility.
  _kTransform(ab) {
    const p = this.player;
    const lvl = p.ascend();
    if (!lvl) return;
    this.ui.log(`⚡ SUPER SAIYAN ${lvl}! All attributes +${lvl * 100}% for ${ab.dur || 30}s!`, 'xp');
    this.ui.floater(`SUPER SAIYAN ${lvl}!`, 'crit', p.pos);
    const r = 5 + lvl;
    for (const e of this.enemies) {
      if (e.alive && e.pos.distanceTo(p.pos) <= r) {
        this._strike(e, p.apower * (0.6 + lvl * 0.4), {});
        e.applyStun && e.applyStun(0.8);
      }
    }
    this._novaFx(p.pos, r, ab.color || 0xffe24a);
    this._explodeFx(p.pos.clone().setY(p.pos.y + 1), r * 0.7, 0xfff2a0);
    if (this.audio) this.audio.play('level');
  }

  // ---- Helpers ----
  _inArc(origin, dir, range, arc) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3().subVectors(e.pos, origin);
      const d = to.length();
      if (d > range) continue;
      to.y = 0; to.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(to.dot(dir), -1, 1));
      if (ang <= arc / 2) out.push(e);
    }
    return out;
  }
  _nearest(pos, range, exclude = new Set()) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (!e.alive || exclude.has(e.id)) continue;
      const d = e.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---- Damage application ----
  _strike(enemy, amount, { crit = 0 }) {
    const isCrit = Math.random() < (0.05 + crit + this.player.gearCrit);
    let dmg = amount * (0.9 + Math.random() * 0.2);
    if (isCrit) dmg *= 1.8;
    const res = enemy.takeDamage(dmg, isCrit);
    if (this.audio) this.audio.play('hit');
    // Dealing damage charges the Saiyan's Ki gauge.
    if (res.dealt > 0) this.player.addKi(res.dealt * 0.2 + 2);
    this.ui.floater(`${res.dealt}${isCrit ? '!' : ''}`, isCrit ? 'crit' : 'dmg', enemy.pos);
    // Lifesteal from gear (e.g. unique weapons) heals on every hit.
    if (this.player.gearLifesteal > 0 && res.dealt > 0) this.player.heal(res.dealt * this.player.gearLifesteal);
    if (res.killed) {
      const levels = this.player.gainXp(res.xp);
      this.ui.floater(`+${res.xp} XP`, 'xp', enemy.pos);
      this.ui.log(`Slain ${enemy.type.name} (+${res.xp} XP)`, 'xp');
      if (this.audio) this.audio.play('kill');
      // Gold drop (elites and especially bosses pay out far more).
      const gold = Math.round(goldDrop(enemy.level, enemy.typeId) * (enemy.boss ? 12 : enemy.elite ? 4 : 1));
      this.player.gold += gold;
      this.ui.floater(`+${gold}g`, 'gold', enemy.pos);
      // Quest progress for kills (and boss-slaying).
      Quests.onKill(this.player, enemy.typeId);
      if (this.player.recordKill) this.player.recordKill(enemy.typeId);
      if (enemy.boss) Quests.onBossKill(this.player, enemy.bossName);
      if (this.onKillEvent) this.onKillEvent(enemy);
      if (this.onPartyXp) this.onPartyXp(res.xp);
      if (levels > 0 && this.onLevelUp) this.onLevelUp();
      this._dropLoot(enemy);
      if (this.target === enemy) this.target = null;
    }
    return res.dealt;
  }

  // ---- Loot drops ----
  _dropLoot(enemy) {
    if (enemy.boss) {
      // Bosses drop their signature unique plus a couple of high-rarity pieces.
      this._spawnDrop(bossDrop(enemy.bossName, enemy.level), enemy.pos);
      for (let i = 0; i < 2; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
        this._spawnDrop(generateItem({ level: enemy.level, rarityBoost: 1.5 }), enemy.pos.clone().add(off));
      }
      this.ui.log(`${enemy.bossName} has fallen!`, 'xp');
      return;
    }
    if (enemy.elite) {
      // Elites always drop something good.
      let item = generateItem({ level: enemy.level, rarityBoost: 1.2 });
      if (item.rarity === 'legendary' && Math.random() < 0.6) item = makeUnique(item.ilvl);
      this._spawnDrop(item, enemy.pos);
      return;
    }
    const item = rollDrop(enemy.level, enemy.typeId);
    if (item) this._spawnDrop(item, enemy.pos);
  }

  // Open a cleared camp's chest: spawn a burst of high-rarity loot + gold.
  openChest(camp) {
    const lvl = camp.level + 2;
    for (let i = 0; i < 3; i++) {
      let item = generateItem({ level: lvl, rarityBoost: 1.8 });
      if (item.rarity === 'legendary' && Math.random() < 0.7) item = makeUnique(item.ilvl);
      const off = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
      this._spawnDrop(item, camp.pos.clone().add(off));
    }
    const gold = 50 + camp.level * 18;
    this.player.gold += gold;
    this.ui.floater(`+${gold}g`, 'gold', camp.pos);
    if (this.audio) this.audio.play('level');
  }
  _spawnDrop(item, pos) {
    const color = RARITY[item.rarity].hex;
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color }));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
    );
    beam.position.y = 3;
    g.add(gem, beam);
    g.add(new THREE.PointLight(color, 1.2, 5));
    g.position.set(pos.x, pos.y + 0.7, pos.z);
    this.scene.add(g);
    this.drops.push({ item, mesh: g, gem, base: pos.y + 0.7, t: Math.random() * 6 });
  }
  _updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.gem.rotation.y += dt * 2;
      d.mesh.position.y = d.base + Math.sin(d.t * 3) * 0.15;
      // Auto-pickup when the player walks over it.
      if (this.player.alive && this.player.pos.distanceTo(d.mesh.position) < 1.7) {
        if (this.player.addItem(d.item)) {
          const rar = RARITY[d.item.rarity];
          this.ui.log(`Looted ${d.item.name}`, d.item.rarity === 'common' ? 'sys' : 'xp');
          this.ui.floater(d.item.glyph + ' ' + rar.name, 'xp', this.player.pos);
          if (this.audio) this.audio.play('level');
          if (this.onLoot) this.onLoot(d.item);
          this._removeDrop(i);
        }
        // If bag is full, leave it on the ground.
      }
    }
  }
  _removeDrop(i) {
    const d = this.drops[i];
    this.scene.remove(d.mesh);
    this.drops.splice(i, 1);
  }

  // ---- Projectiles ----
  spawnProjectile(originPos, dir, { speed, mult, color = 0xffffff, shape = 'orb', range = 30, pierce = false, aoe = 0, holy = false, stunOnHit = 0 }) {
    dir = dir.clone().normalize();
    let geo;
    if (shape === 'arrow') geo = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5);
    else if (shape === 'blade') geo = new THREE.BoxGeometry(0.08, 0.5, 0.22);
    else geo = new THREE.SphereGeometry(0.3, 10, 10);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    const start = originPos.clone(); start.y += 1.3;
    mesh.position.copy(start);
    if (shape === 'arrow') { mesh.rotation.x = Math.PI / 2; mesh.lookAt(start.clone().add(dir)); }
    if (shape === 'orb' || holy) mesh.add(new THREE.PointLight(color, 1.4, 6));
    this.scene.add(mesh);
    this.projectiles.push({ mesh, dir, speed, range, traveled: 0, dmg: this.player.apower * mult, pierce, aoe, holy, stunOnHit, hitSet: new Set() });
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = pr.speed * dt;
      pr.mesh.position.addScaledVector(pr.dir, step);
      pr.traveled += step;
      pr.mesh.rotation.z += dt * 6;

      let consumed = false;
      for (const e of this.enemies) {
        if (!e.alive || pr.hitSet.has(e.id)) continue;
        if (pr.mesh.position.distanceTo(e.pos.clone().setY(e.pos.y + 1)) < 1.1) {
          pr.hitSet.add(e.id);
          if (pr.aoe > 0) {
            for (const e2 of this.enemies) if (e2.alive && e2.pos.distanceTo(e.pos) <= pr.aoe) this._strike(e2, pr.dmg, {});
            this._explodeFx(pr.mesh.position, pr.aoe, 0xff8a2a);
            if (!pr.pierce) consumed = true;
          } else {
            this._strike(e, pr.dmg, {});
            if (pr.stunOnHit) e.applyStun(pr.stunOnHit);
            if (!pr.pierce) consumed = true;
          }
          if (consumed) break;
        }
      }
      if (consumed || pr.traveled >= pr.range) {
        this.scene.remove(pr.mesh); pr.mesh.geometry.dispose(); this.projectiles.splice(i, 1);
      }
    }
  }

  // ---- DoT patches ----
  _spawnPatch(pos, radius, dps, dur, color) {
    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.12, pos.z);
    this.scene.add(ring);
    this.patches.push({ pos: pos.clone(), radius, dps, dur, elapsed: 0, tick: 0, mesh: ring, color });
  }
  _updatePatches(dt) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const pa = this.patches[i];
      pa.elapsed += dt; pa.tick += dt;
      pa.mesh.material.opacity = 0.18 + Math.sin(pa.elapsed * 8) * 0.08;
      if (pa.tick >= 0.5) {
        pa.tick -= 0.5;
        for (const e of this.enemies) if (e.alive && e.pos.distanceTo(pa.pos) <= pa.radius) this._strike(e, pa.dps * 0.5, {});
      }
      if (pa.elapsed >= pa.dur) { this.scene.remove(pa.mesh); pa.mesh.geometry.dispose(); this.patches.splice(i, 1); }
    }
  }

  // ---- Delayed ground explosions ----
  _updatePendings(dt) {
    for (let i = this.pendings.length - 1; i >= 0; i--) {
      const pe = this.pendings[i];
      if (this.player.clock >= pe.at) {
        for (const e of this.enemies) if (e.alive && e.pos.distanceTo(pe.pos) <= pe.radius) this._strike(e, pe.dmg, {});
        this._explodeFx(new THREE.Vector3(pe.pos.x, 0.5, pe.pos.z), pe.radius, pe.color);
        this.pendings.splice(i, 1);
      }
    }
  }

  // ---- Summons ----
  _updateSummons(dt) {
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i];
      s.dur -= dt; s.timer -= dt;
      // Hover near the player.
      const want = this.player.pos.clone().add(new THREE.Vector3(Math.cos(this.player.clock * 1.5 + i) * 2, 0, Math.sin(this.player.clock * 1.5 + i) * 2));
      s.pos.lerp(want, Math.min(1, dt * 3));
      s.mesh.position.copy(s.pos);
      s.mesh.position.y += 0.3 + Math.sin(this.player.clock * 4 + i) * 0.1;
      s.mesh.rotation.y += dt * 2;
      if (s.timer <= 0) {
        const e = this._nearest(s.pos, 16);
        if (e) {
          this._boltFx(s.pos.clone().setY(s.pos.y + 0.6), e.pos.clone().setY(e.pos.y + 1), s.color);
          this._strike(e, this.player.apower * s.mult, {});
          s.timer = s.atkEvery;
        } else { s.timer = 0.4; }
      }
      if (s.dur <= 0) { this.scene.remove(s.mesh); this.summons.splice(i, 1); }
    }
  }

  // ---- Visual FX ----
  _tempMesh(mesh, life) { this.scene.add(mesh); mesh.userData.fxLife = life; mesh.userData.fxMax = life; this._fx.push(mesh); }
  updateFx(dt) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const m = this._fx[i];
      m.userData.fxLife -= dt;
      const t = m.userData.fxLife / m.userData.fxMax;
      if (m.material && m.material.opacity != null) m.material.opacity = Math.max(0, t) * (m.userData.baseOpacity || 0.8);
      if (m.userData.grow) m.scale.multiplyScalar(1 + dt * m.userData.grow);
      if (m.userData.rise) m.position.y += dt * m.userData.rise;
      if (m.userData.fxLife <= 0) { this.scene.remove(m); if (m.geometry) m.geometry.dispose(); this._fx.splice(i, 1); }
    }
  }
  _slashFx(origin, dir, range, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(range * 0.4, range, 16, 1, -0.8, 1.6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(origin); m.position.y += 0.6;
    m.rotation.z = -Math.atan2(dir.x, dir.z);
    this._tempMesh(m, 0.22);
  }
  // A filled ground cone/wedge that shows EXACTLY where a melee arc lands —
  // apex at the player, spreading `arc` radians around `dir` out to `range`.
  // Wide arcs read as a fan; thin high-damage arcs read as a forward spear,
  // so the player can always see their reach. Matches `_inArc` precisely.
  _coneFx(origin, dir, range, arc, color = 0xffffff) {
    const heading = Math.atan2(dir.x, dir.z);
    const half = Math.min(arc, Math.PI * 2) / 2;
    const segs = Math.max(3, Math.round((half * 2) / 0.1));
    const y = 0.14, fill = [], rim = [];
    for (let i = 0; i <= segs; i++) {
      const a = heading - half + (i / segs) * half * 2;
      const px = Math.sin(a) * range, pz = Math.cos(a) * range;
      rim.push(px, y, pz);
      if (i < segs) {
        const a2 = heading - half + ((i + 1) / segs) * half * 2;
        fill.push(0, y, 0, px, y, pz, Math.sin(a2) * range, y, Math.cos(a2) * range);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.position.copy(origin); m.userData.baseOpacity = 0.55;
    this._tempMesh(m, 0.3);
    // A bright outline (apex → arc rim → apex) makes the wedge crisp and clear.
    const edge = [0, y, 0, ...rim, 0, y, 0];
    const lgeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
    const line = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    line.position.copy(origin); line.userData.baseOpacity = 0.95;
    this._tempMesh(line, 0.3);
  }
  _healFx(pos, color = 0x7bf08a) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    m.position.copy(pos); m.position.y += 1; m.userData.grow = 1.5; m.userData.rise = 1.5; m.userData.baseOpacity = 0.5;
    this._tempMesh(m, 0.6);
  }
  _novaFx(pos, r, color = 0x9fe0ff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.3;
    this._tempMesh(m, 0.5);
  }
  _explodeFx(pos, r, color = 0xff8a2a) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 16, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    m.position.copy(pos); m.userData.grow = 3; m.userData.baseOpacity = 0.7;
    this._tempMesh(m, 0.32);
  }
  // A gathering glow at the caster's hands while a spell charges up.
  _chargeFx(color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    const o = this.player.pos.clone(); o.y += 1.3;
    o.addScaledVector(this.cam.forward(), 0.5);
    m.position.copy(o);
    m.add(new THREE.PointLight(color, 2, 6));
    m.userData.grow = 1.6; m.userData.baseOpacity = 0.85;
    this._tempMesh(m, 0.6);
  }
  _dashFx(pos, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }));
    m.position.copy(pos); m.position.y += 1; m.userData.grow = 2; m.userData.baseOpacity = 0.4;
    this._tempMesh(m, 0.25);
  }
  _telegraphFx(pos, r, color, life) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.14, pos.z); m.userData.baseOpacity = 0.6;
    this._tempMesh(m, life);
  }
  // A thick channelled beam: a translucent outer shaft + bright white core,
  // laid along `dir` from chest height. Used by Kamehameha.
  _beamFx(origin, dir, range, width, color = 0x3aa0ff) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const mid = origin.clone().addScaledVector(dir, range / 2); mid.y += 1.3;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.5, width * 0.38, range, 18, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    shaft.position.copy(mid); shaft.quaternion.copy(q); shaft.userData.baseOpacity = 0.7;
    this._tempMesh(shaft, 0.45);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.2, width * 0.13, range, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false }));
    core.position.copy(mid); core.quaternion.copy(q); core.userData.baseOpacity = 0.92;
    this._tempMesh(core, 0.4);
    // Muzzle burst at the caster's hands.
    const burst = new THREE.Mesh(new THREE.SphereGeometry(width * 0.6, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    burst.position.copy(origin); burst.position.y += 1.3; burst.userData.grow = 2.4; burst.userData.baseOpacity = 0.8;
    this._tempMesh(burst, 0.3);
  }
  _boltFx(from, to, color = 0x9fe0ff) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    line.userData.baseOpacity = 0.9;
    this._tempMesh(line, 0.18);
  }
}
