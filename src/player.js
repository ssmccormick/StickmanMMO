// ============================================================
// Local player controller: stickman mesh, movement state machine
// (grounded / airborne / climbing), vitals & regen, and the new
// progression model — abilities are LEARNED and RANKED over levels,
// and each level-up queues a player choice (attribute + skill).
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman } from './stickman.js';
import {
  CLASSES, makeStats, applyAutoLevel, applyAttributeChoice,
  attackPower, getAbility, effectiveAbility, startingAbilityId, MAX_RANK,
} from './classes.js';
import { heightAt } from './world.js';
import { sumStats, SLOTS, RARITY } from './items.js';

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

    this.mesh = createStickman({ color: this.def.color, accent: this.def.accent });
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(0, heightAt(0, 0), 6);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.state = 'ground';
    this.alive = true;
    this.respawn = this.pos.clone();

    this.attackTimer = 0;
    this.attackAnim = 0;
    this.buffs = { dmg: 1, speed: 1, shield: 0, until: 0, shieldUntil: 0 };
    this.iframeUntil = 0;

    this._speed01 = 0;
    this._clock = 0;
    this.recomputeGear();
  }

  // ---- Equipment-derived effective stats ----
  recomputeGear() {
    this.bonus = sumStats(Object.values(this.gear));
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
    if (!j || !j.weapon) return;
    const w = this.gear.weapon;
    const color = w ? RARITY[w.rarity].hex : this.def.accent;
    j.weapon.material.color.setHex(color);
    const tier = w ? 1 + Object.keys(RARITY).indexOf(w.rarity) * 0.14 : 1;
    j.weapon.scale.setScalar(tier);
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

    if (this.state === 'climb') {
      this._updateClimb(dt, input, move, moving);
    } else {
      let speed = WALK_SPEED * (1 + this.gearSpeed) * (this.buffs.until > this._clock ? this.buffs.speed : 1);
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
      if (res.climb && axis.z > 0 && this.stats.sp > 2) this._startClimb(res.climb, move);

      const ground = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.state = 'ground'; }
      else if (this.state !== 'climb') this.state = 'air';

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
  }

  _regen(dt, sprinting) {
    const s = this.stats;
    // Expire finished consumable buffs.
    if (this.timed.length) this.timed = this.timed.filter((b) => b.until > this._clock);
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
  die() { this.alive = false; this.state = 'air'; this.deathAt = this._clock; }
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
