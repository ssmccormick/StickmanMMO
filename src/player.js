// ============================================================
// Local player controller: stickman mesh, movement state machine
// (grounded / airborne / climbing), vitals & regen, and the new
// progression model — abilities are LEARNED and RANKED over levels,
// and each level-up queues a player choice (attribute + skill).
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman } from './stickman.js';
import { buildWeaponMesh } from './weapons.js';
import {
  CLASSES, makeStats, applyAutoLevel, applyAttributeChoice,
  attackPower, getAbility, effectiveAbility, startingAbilityId, MAX_RANK,
} from './classes.js';
import { heightAt, WATER_LEVEL } from './world.js';
import { sumStats, SLOTS, RARITY, SETS } from './items.js';

function emptyGear() {
  const g = {};
  for (const s of SLOTS) g[s] = null;
  return g;
}

const GRAVITY = 26;
const JUMP_VEL = 9.5;
const WALK_SPEED = 7.0;
const SPRINT_MULT = 1.7;
const CLIMB_SPEED = 3.2;
const RADIUS = 0.5;
const MAX_SLOTS = 6; // hotbar ability slots (keys 1..6)

export class Player {
  constructor(scene, world, classId, name) {
    this.world = world;
    this.name = name;
    this.classId = classId;
    this.def = CLASSES[classId];
    this.stats = makeStats(classId);

    // Abilities you KNOW, in hotbar order. You start with one.
    this.learned = [{ id: startingAbilityId(classId), rank: 1 }];
    this.cooldowns = [0];
    this.pendingLevelUps = 0; // levels gained but not yet "spent" in the modal

    // Equipment & inventory.
    this.gear = emptyGear();
    this.inventory = [];
    this.maxInventory = 24;
    this.bonus = {};        // cached summed gear stats
    this.gold = 0;
    this.timed = [];        // active consumable buffs: {until, label, color, str?, dmgMult?, speedMult?...}
    this.questLog = {};     // id -> { accepted, progress, turnedIn }
    this.discovered = [];   // names of bonfires rested at (fast-travel points)
    this.stoneSwordPulled = false; // has the blade in the stone been drawn?

    this.mesh = createStickman({ color: this.def.color, accent: this.def.accent });
    scene.add(this.mesh);
    this.scene = scene;

    // Mount: a simple "Sticksteed" you can summon to cross the world faster.
    this.mounted = false;
    this.steed = this._buildSteed();
    this.steed.visible = false;
    scene.add(this.steed);

    this.pos = new THREE.Vector3(0, heightAt(0, 0), 6);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.moveDir = null;    // current WASD world-space move direction (null if still)
    this.state = 'ground';
    this.alive = true;
    this.respawn = this.pos.clone();

    this.attackTimer = 0;
    this.attackAnim = 0;
    this.buffs = { dmg: 1, speed: 1, shield: 0, until: 0, shieldUntil: 0 };
    this.iframeUntil = 0;

    this._speed01 = 0;
    this._clock = 0;
    this.maxAir = 12; this.air = 12; this._drownAcc = 0;
    this.recomputeGear();
  }

  // ---- Equipment-derived effective stats ----
  recomputeGear() {
    const items = Object.values(this.gear).filter(Boolean);
    this.bonus = sumStats(items);
    // Set bonuses: tally equipped pieces per set, add active tier bonuses.
    const counts = {};
    for (const it of items) if (it.setId) counts[it.setId] = (counts[it.setId] || 0) + 1;
    this.activeSets = [];
    for (const sid in counts) {
      const set = SETS[sid]; if (!set) continue;
      const c = counts[sid]; const tiers = [];
      for (const tier of [2, 4]) {
        if (c >= tier && set.bonuses[tier]) {
          for (const k in set.bonuses[tier]) this.bonus[k] = (this.bonus[k] || 0) + set.bonuses[tier][k];
          tiers.push(tier);
        }
      }
      this.activeSets.push({ id: sid, name: set.name, color: set.color, count: c, tiers });
    }
    // Re-clamp current pools to the new effective maxima.
    this.stats.hp = Math.min(this.stats.hp, this.effMaxHp);
    this.stats.mp = Math.min(this.stats.mp, this.effMaxMp);
    this.stats.sp = Math.min(this.stats.sp, this.effMaxSp);
    this._updateWeaponVisual();
  }
  // Sum / product of an active timed-buff field.
  _t(key) { let s = 0; for (const b of this.timed) if (b[key]) s += b[key]; return s; }
  _tm(key) { let m = 1; for (const b of this.timed) if (b[key]) m *= b[key]; return m; }

  get effMaxHp() { return this.stats.maxHp + (this.bonus.maxHp || 0); }
  get effMaxMp() { return this.stats.maxMp + (this.bonus.maxMp || 0); }
  get effMaxSp() { return this.stats.maxSp + (this.bonus.maxSp || 0); }
  get effStr() { return this.stats.str + (this.bonus.str || 0) + this._t('str'); }
  get effDex() { return this.stats.dex + (this.bonus.dex || 0) + this._t('dex'); }
  get effInt() { return this.stats.int + (this.bonus.int || 0) + this._t('int'); }
  get gearCrit() { return this.bonus.crit || 0; }
  get gearArmor() { return this.bonus.armor || 0; }
  get gearSpeed() { return (this.bonus.speed || 0) + (this._tm('speedMult') - 1); }
  get gearLifesteal() { return this.bonus.lifesteal || 0; }

  get apower() {
    const effStats = { ...this.stats, str: this.effStr, dex: this.effDex, int: this.effInt };
    let p = attackPower(this.classId, effStats) + (this.bonus.damage || 0);
    if (this.buffs.until > this._clock) p *= this.buffs.dmg;
    p *= this._tm('dmgMult'); // potion damage buffs
    return p;
  }

  // Use a consumable from the bag: heal or apply a timed buff.
  useConsumable(uid) {
    const item = this.inventory.find((x) => x.uid === uid);
    if (!item || item.type !== 'consumable') return { error: 'invalid' };
    this._removeUid(uid);
    if (item.kind === 'heal') {
      const amt = this.heal(this.effMaxHp * item.heal);
      return { used: item, heal: amt };
    }
    if (item.kind === 'buff') {
      const colors = { speedMult: 0x6fc8ff, dmgMult: 0xff6a2a };
      const color = item.buff.speedMult ? '#6fc8ff' : item.buff.dmgMult ? '#ff6a2a' : '#9be29e';
      this.timed.push({ ...item.buff, until: this._clock + item.buff.dur, label: item.name, glyph: item.glyph, color });
      return { used: item, buff: item.buff };
    }
    return { error: 'invalid' };
  }

  // Apply a long-lived timed buff (used by shrines). Re-praying refreshes it
  // rather than stacking duplicates.
  applyTimedBuff(buff, dur, { label, glyph, color }) {
    this.timed = this.timed.filter((b) => b.label !== label);
    this.timed.push({ ...buff, until: this._clock + dur, label, glyph, color, dur });
  }

  // ---- Inventory / equipment management ----
  addItem(item) {
    if (this.inventory.length >= this.maxInventory) return false;
    this.inventory.push(item);
    return true;
  }
  _removeUid(uid) {
    const i = this.inventory.findIndex((x) => x.uid === uid);
    return i >= 0 ? this.inventory.splice(i, 1)[0] : null;
  }
  // Equip a bag item into its slot; any displaced item returns to the bag.
  equipFromInventory(uid) {
    const item = this.inventory.find((x) => x.uid === uid);
    if (!item) return { error: 'missing' };
    if (this.stats.level < item.reqLevel) return { error: 'level', item };
    this._removeUid(uid);
    const prev = this.gear[item.slot];
    this.gear[item.slot] = item;
    if (prev) this.addItem(prev);
    this.recomputeGear();
    return { equipped: item, replaced: prev };
  }
  unequip(slot) {
    const item = this.gear[slot];
    if (!item) return { error: 'empty' };
    if (this.inventory.length >= this.maxInventory) return { error: 'full' };
    this.gear[slot] = null;
    this.addItem(item);
    this.recomputeGear();
    return { unequipped: item };
  }
  dropItem(uid) { return this._removeUid(uid); }

  _updateWeaponVisual() {
    const j = this.mesh && this.mesh.userData.joints;
    if (!j || !j.armR) return;
    const w = this.gear.weapon;
    const kind = w ? (w.kind || 'sword') : null;
    const color = w ? RARITY[w.rarity].hex : this.def.accent;
    // Swap the held model only when the weapon kind/rarity actually changes.
    const key = kind ? kind + ':' + w.rarity : 'none';
    if (key !== this._heldKey) {
      if (this._heldWeapon) {
        j.armR.remove(this._heldWeapon);
        this._heldWeapon.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this._heldWeapon = null;
      }
      if (j.weapon) j.weapon.visible = false; // hide the generic stick
      if (kind) {
        const wm = buildWeaponMesh(kind, color);
        wm.position.set(0, -0.62, 0);
        wm.rotation.z = Math.PI / 2.5; // mount it in the hand like the old stick
        const tier = 1 + Object.keys(RARITY).indexOf(w.rarity) * 0.06;
        wm.scale.setScalar(tier);
        j.armR.add(wm);
        this._heldWeapon = wm;
      }
      this._heldKey = key;
    }
  }

  // The rank-scaled ability in hotbar slot i (or null).
  ability(i) {
    const l = this.learned[i];
    if (!l) return null;
    return effectiveAbility(this.classId, l.id, l.rank);
  }

  // ---- Movement ----
  update(dt, input, cam) {
    this._clock += dt;
    if (!this.alive) { animateStickman(this.mesh, dt, { dead: true }); return; }

    const axis = input.moveAxis();
    const fwd = cam.forward(), right = cam.right();
    const move = new THREE.Vector3().addScaledVector(fwd, axis.z).addScaledVector(right, axis.x);
    const moving = move.lengthSq() > 0.001;
    if (moving) move.normalize();

    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const sprinting = wantSprint && moving && this.stats.sp > 1 && this.state !== 'climb';

    const groundHere = heightAt(this.pos.x, this.pos.z);
    const inWater = groundHere < WATER_LEVEL - 0.6 && this.pos.y < WATER_LEVEL + 1.2;

    if (this.state === 'climb') {
      this._updateClimb(dt, input, move, moving);
    } else if (inWater) {
      this._updateSwim(dt, input, move, moving);
    } else {
      let speed = WALK_SPEED * (1 + this.gearSpeed) * (this.buffs.until > this._clock ? this.buffs.speed : 1);
      if (this.mounted) speed *= 2.6; // gallop
      if (sprinting) { speed *= SPRINT_MULT; this.stats.sp -= 22 * dt; }

      this.vel.x = move.x * speed;
      this.vel.z = move.z * speed;
      this.vel.y -= GRAVITY * dt;

      if (input.just('Space') && this.state === 'ground') { this.vel.y = JUMP_VEL; this.state = 'air'; }

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;

      const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS);
      this.pos.x = res.x; this.pos.z = res.z;

      // Start climbing: press forward into a climbable wall with stamina.
      if (res.climb && axis.z > 0 && this.stats.sp > 2 && !this.mounted) this._startClimb(res.climb, move);

      const ground = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.state = 'ground'; }
      else if (this.state !== 'climb') this.state = 'air';

      if (moving) this.facing = Math.atan2(move.x, move.z);
      this.moveDir = moving ? move.clone() : null;
      this._speed01 = THREE.MathUtils.clamp(Math.hypot(this.vel.x, this.vel.z) / (WALK_SPEED * SPRINT_MULT), 0, 1);
    }

    this._applyTransform(dt);
    this._regen(dt, sprinting);
  }

  _startClimb(collider, move) {
    this.state = 'climb';
    this.climbCollider = collider;
    this.vel.set(0, 0, 0);
    // Lift slightly off the ground so the "slid below base" check below
    // doesn't immediately drop us when grabbing on at ground level.
    this.pos.y += 0.35;
    const cx = (collider.min.x + collider.max.x) / 2;
    const cz = (collider.min.z + collider.max.z) / 2;
    this.facing = Math.atan2(cx - this.pos.x, cz - this.pos.z);
  }

  _updateClimb(dt, input, move, moving) {
    const c = this.climbCollider;
    this.stats.sp -= 9 * dt;
    if (this.stats.sp <= 0) { this.stats.sp = 0; this._dropClimb(); return; }

    if (input.just('Space')) {
      this._dropClimb();
      this.vel.y = JUMP_VEL * 0.8;
      this.vel.x = -Math.sin(this.facing) * 5;
      this.vel.z = -Math.cos(this.facing) * 5;
      this.state = 'air';
      return;
    }

    const axis = input.moveAxis();
    const vy = axis.z * CLIMB_SPEED;
    const lateralX = Math.cos(this.facing) * axis.x * CLIMB_SPEED;
    const lateralZ = -Math.sin(this.facing) * axis.x * CLIMB_SPEED;

    this.pos.y += vy * dt;
    this.pos.x += lateralX * dt;
    this.pos.z += lateralZ * dt;

    const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS - 0.1);
    this.pos.x = res.x; this.pos.z = res.z;

    if (this.pos.y >= c.max.y - 0.3) {
      this.pos.y = c.max.y + 0.1;
      this.pos.x += Math.sin(this.facing) * 0.9;
      this.pos.z += Math.cos(this.facing) * 0.9;
      this._dropClimb();
      this.state = 'air';
      return;
    }
    // Let go if we've climbed back down to the ground, or the wall ahead
    // is gone (climbed off the side).
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground || !this.world.climbAhead(this.pos, Math.sin(this.facing), Math.cos(this.facing), 1.4)) {
      this._dropClimb();
    }
    this._speed01 = moving ? 0.6 : 0;
  }

  _dropClimb() { this.state = 'air'; this.climbCollider = null; }

  // ---- Mount ----
  _buildSteed() {
    const g = new THREE.Group();
    const hide = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const mane = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), hide);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.0, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.9, 6), hide);
    neck.position.set(0, 1.4, 0.7); neck.rotation.x = 0.7;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.6), hide);
    head.position.set(0, 1.7, 1.05);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.8, 5), mane);
    tail.position.set(0, 1.1, -0.8); tail.rotation.x = -0.6;
    g.add(body, neck, head, tail);
    const legs = [];
    for (const [lx, lz] of [[0.25, 0.5], [-0.25, 0.5], [0.25, -0.5], [-0.25, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), hide);
      leg.position.set(lx, 0.5, lz);
      g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0;
    return g;
  }
  canMount() { return this.alive && (this.state === 'ground' || this.state === 'air'); }
  toggleMount() {
    if (this.mounted) { this.dismount(); return false; }
    if (!this.canMount()) return false;
    this.mounted = true; this.steed.visible = true; return true;
  }
  dismount() { this.mounted = false; if (this.steed) this.steed.visible = false; }

  // Swimming: WASD glides horizontally, Space ascends, Shift dives; gentle
  // buoyancy floats you up otherwise. Air drains while your head is submerged.
  _updateSwim(dt, input, move, moving) {
    this.state = 'swim';
    if (this.mounted) this.dismount(); // can't ride in deep water
    const SWIM = 5.5;
    this.vel.x = move.x * SWIM;
    this.vel.z = move.z * SWIM;
    const up = input.down('Space');
    const down = input.down('ShiftLeft') || input.down('ShiftRight');
    let vy = 0;
    if (up) vy += 4.5;
    if (down) vy -= 4.5;
    if (!up && !down) vy += 1.4; // buoyancy
    this.vel.y = vy;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS);
    this.pos.x = res.x; this.pos.z = res.z;
    const gy = heightAt(this.pos.x, this.pos.z);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, gy + 0.3, WATER_LEVEL + 0.4);
    if (gy >= WATER_LEVEL - 0.4) this.state = 'air'; // reached the shore

    if (moving) this.facing = Math.atan2(move.x, move.z);
    this.moveDir = moving ? move.clone() : null;
    this._speed01 = moving ? 0.7 : 0;

    // Air / drowning.
    const headUnder = this.pos.y < WATER_LEVEL - 0.6;
    if (headUnder) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0; this._drownAcc += dt;
        if (this._drownAcc >= 0.7) { this._drownAcc = 0; this.takeDamage(this.effMaxHp * 0.06, this.pos); }
      }
    } else {
      this.air = Math.min(this.maxAir, this.air + dt * 3); this._drownAcc = 0;
    }
  }

  _applyTransform(dt) {
    this.mesh.position.copy(this.pos);
    const cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y = cur + diff * Math.min(1, dt * 14);

    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3.2);
    animateStickman(this.mesh, dt, {
      speed01: this._speed01, attack: this.attackAnim,
      climbing: this.state === 'climb', airborne: this.state === 'air',
    });

    // Mount: sit the rider higher and trot the steed beneath.
    if (this.mounted) {
      this.mesh.position.y += 0.85;
      this.steed.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.steed.rotation.y = this.mesh.rotation.y;
      const sd = this.steed.userData;
      sd.phase += dt * (4 + this._speed01 * 14);
      sd.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(sd.phase + (i % 2) * Math.PI) * 0.5 * (0.3 + this._speed01); });
    }
  }

  _regen(dt, sprinting) {
    const s = this.stats;
    // Expire finished consumable buffs.
    if (this.timed.length) this.timed = this.timed.filter((b) => b.until > this._clock);
    // Air refills on land.
    if (this.state !== 'swim') this.air = this.maxAir;
    if (!sprinting && this.state !== 'climb') s.sp = Math.min(this.effMaxSp, s.sp + 16 * dt);
    s.mp = Math.min(this.effMaxMp, s.mp + (1.5 + this.effInt * 0.05) * dt);
    if (this.state === 'ground' && this._speed01 < 0.1) s.hp = Math.min(this.effMaxHp, s.hp + 2.0 * dt);
    s.sp = Math.max(0, s.sp);
    for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    if (this.attackTimer > 0) this.attackTimer -= dt;
  }

  // ---- Vitals ----
  takeDamage(amount, fromPos) {
    if (!this.alive) return 0;
    if (this.mounted) this.dismount(); // knocked off your steed
    if (this._clock < this.iframeUntil) return 0;
    // Armor mitigation (diminishing, capped at 75%).
    const armor = this.gearArmor;
    if (armor > 0) amount *= (1 - Math.min(0.75, armor / (armor + 60 + this.stats.level * 8)));
    if (this.buffs.shieldUntil > this._clock && this.buffs.shield > 0) amount *= (1 - this.buffs.shield);
    amount = Math.max(1, Math.round(amount));
    this.stats.hp -= amount;
    if (this.stats.hp <= 0) { this.stats.hp = 0; this.die(); }
    return amount;
  }
  heal(amount) {
    amount = Math.round(amount);
    this.stats.hp = Math.min(this.effMaxHp, this.stats.hp + amount);
    return amount;
  }
  die() { this.alive = false; this.state = 'air'; this.deathAt = this._clock; this.dismount(); }
  reviveAt(pos) {
    this.alive = true;
    this.pos.copy(pos); this.pos.y = heightAt(pos.x, pos.z);
    this.vel.set(0, 0, 0); this.state = 'ground'; this.mesh.rotation.x = 0;
    this.stats.hp = this.effMaxHp; this.stats.mp = this.effMaxMp; this.stats.sp = this.effMaxSp;
  }
  restAtBonfire(pos) {
    this.respawn = pos.clone();
    this.stats.hp = this.effMaxHp; this.stats.mp = this.effMaxMp; this.stats.sp = this.effMaxSp;
  }

  // ---- Persistence ----
  // Snapshot this character into a plain save record (overwrites on rest).
  toSave() {
    const s = this.stats;
    return {
      id: this.saveId,
      name: this.name,
      classId: this.classId,
      level: s.level, xp: s.xp, xpNext: s.xpNext,
      maxHp: s.maxHp, maxMp: s.maxMp, maxSp: s.maxSp,
      str: s.str, dex: s.dex, int: s.int,
      learned: this.learned.map((l) => ({ id: l.id, rank: l.rank })),
      respawn: { x: this.respawn.x, y: this.respawn.y, z: this.respawn.z },
      gear: this.gear,             // plain item objects, JSON-serializable
      inventory: this.inventory,
      gold: this.gold,
      questLog: this.questLog,
      discovered: this.discovered,
      stoneSword: this.stoneSwordPulled,
    };
  }

  // Restore a saved character into this freshly-constructed player.
  applySave(save) {
    this.saveId = save.id;
    const s = this.stats;
    s.level = save.level; s.xp = save.xp; s.xpNext = save.xpNext;
    s.maxHp = save.maxHp; s.maxMp = save.maxMp; s.maxSp = save.maxSp;
    s.str = save.str; s.dex = save.dex; s.int = save.int;
    s.hp = s.maxHp; s.mp = s.maxMp; s.sp = s.maxSp;
    if (Array.isArray(save.learned) && save.learned.length) {
      this.learned = save.learned.map((l) => ({ id: l.id, rank: l.rank }));
      this.cooldowns = this.learned.map(() => 0);
    }
    if (save.respawn) {
      this.respawn = new THREE.Vector3(save.respawn.x, save.respawn.y, save.respawn.z);
      this.pos.copy(this.respawn);
      this.pos.y = heightAt(this.pos.x, this.pos.z);
    }
    if (save.gear) this.gear = Object.assign(emptyGear(), save.gear);
    if (Array.isArray(save.inventory)) this.inventory = save.inventory;
    if (typeof save.gold === 'number') this.gold = save.gold;
    if (save.questLog && typeof save.questLog === 'object') this.questLog = save.questLog;
    if (Array.isArray(save.discovered)) this.discovered = save.discovered;
    this.stoneSwordPulled = !!save.stoneSword;
    this.recomputeGear();
    // Top vitals to the gear-adjusted maxima after equipping saved items.
    this.stats.hp = this.effMaxHp; this.stats.mp = this.effMaxMp; this.stats.sp = this.effMaxSp;
  }

  // ---- Progression ----
  // Award XP; auto-level vitals and queue a choice per level gained.
  gainXp(amount) {
    this.stats.xp += amount;
    let gained = 0;
    while (this.stats.xp >= this.stats.xpNext) {
      applyAutoLevel(this.stats);
      this.pendingLevelUps++;
      gained++;
    }
    return gained;
  }

  // Options to present in the level-up modal for the current level.
  getLevelChoices() {
    const attrs = [
      { id: 'str', label: '+3 STR', desc: 'Melee / physical power' },
      { id: 'dex', label: '+3 DEX', desc: 'Agility, ranged & crit' },
      { id: 'int', label: '+3 INT', desc: 'Spell power & mana regen' },
      { id: 'vit', label: '+25 Max HP', desc: 'Raw survivability' },
      { id: 'spirit', label: '+MP / +SP', desc: 'Bigger resource pools' },
    ];
    const owned = new Set(this.learned.map((l) => l.id));
    const skills = [];
    // Learnable: meets level req, not owned, room in hotbar.
    if (this.learned.length < MAX_SLOTS) {
      for (const a of this.def.abilities) {
        if (!owned.has(a.id) && this.stats.level >= a.reqLevel) {
          skills.push({ type: 'learn', id: a.id, name: a.name, glyph: a.glyph, desc: a.desc });
        }
      }
    }
    // Upgradeable: owned and below max rank.
    for (const l of this.learned) {
      if (l.rank < MAX_RANK) {
        const a = getAbility(this.classId, l.id);
        skills.push({ type: 'upgrade', id: l.id, name: a.name, glyph: a.glyph, rank: l.rank,
          desc: `Rank ${l.rank} → ${l.rank + 1}: more damage, shorter cooldown.` });
      }
    }
    return { attrs, skills };
  }

  // Apply the chosen attribute + skill action from the modal.
  applyLevelChoice(attrId, skill) {
    if (attrId) applyAttributeChoice(this.stats, attrId);
    if (skill) {
      if (skill.type === 'learn' && this.learned.length < MAX_SLOTS) {
        this.learned.push({ id: skill.id, rank: 1 });
        this.cooldowns.push(0);
      } else if (skill.type === 'upgrade') {
        const l = this.learned.find((x) => x.id === skill.id);
        if (l && l.rank < MAX_RANK) l.rank++;
      }
    }
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
  }

  get clock() { return this._clock; }
}
