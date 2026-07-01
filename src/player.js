// ============================================================
// Local player controller: stickman mesh, movement state machine
// (grounded / airborne / climbing), vitals & regen, and the new
// progression model — abilities are LEARNED and RANKED over levels,
// and each level-up queues a player choice (attribute + skill).
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman, applyAppearance } from './stickman.js';
import { defaultAppearance, normalizeAppearance } from './appearance.js';
import { buildWeaponMesh, isRangedWeaponKind, WEAPON_PROFILE } from './weapons.js';
import {
  CLASSES, makeStats, applyAutoLevel, applyAttributeChoice,
  attackPower, getAbility, effectiveAbility, startingAbilityId, MAX_RANK,
} from './classes.js';
import { heightAt, WATER_LEVEL } from './world.js';
import { sumStats, SLOTS, RARITY, SETS } from './items.js';
import * as Achievements from './achievements.js';

function emptyGear() {
  const g = {};
  for (const s of SLOTS) g[s] = null;
  g.weapon2 = null; // secondary weapon (Tab swaps which one is wielded)
  return g;
}

// Emotes: a bit of body language + a floating bubble. Shared with the UI.
export const EMOTES = [
  { id: 'wave', name: 'Wave', glyph: '👋' },
  { id: 'dance', name: 'Dance', glyph: '🕺' },
  { id: 'cheer', name: 'Cheer', glyph: '🎉' },
  { id: 'flex', name: 'Flex', glyph: '💪' },
  { id: 'laugh', name: 'Laugh', glyph: '😂' },
  { id: 'bow', name: 'Bow', glyph: '🙇' },
  { id: 'cry', name: 'Cry', glyph: '😢' },
  { id: 'sit', name: 'Sit', glyph: '🪑' },
];

// Map fog-of-war grid: the world (-380..380, span 760) is divided into a
// MAP_GRID × MAP_GRID lattice; cells the player has stood near are "explored".
export const MAP_GRID = 64;
const MAP_SPAN = 760, MAP_HALF = 380;

// How each weapon kind RESTS in the hand (local to the right arm). Poles are
// held upright and a little out from the body (so they don't merge into the
// arm); ranged kinds then thrust forward when attacking (see _poseHeldWeapon).
const WEAPON_HOLD = {
  staff:    { pos: [-0.07, -0.82, 0.1], rot: [0.18, 0, -0.13] }, // upright, leaning outward
  wand:     { pos: [-0.05, -0.62, 0.1], rot: [0.2, 0, -0.1] },
  bow:      { pos: [-0.05, -0.66, 0.1], rot: [0.05, 0, -0.05] },
  crossbow: { pos: [-0.05, -0.62, 0.12], rot: [0.1, 0, 0] },
  throwknife: { pos: [0, -0.56, 0.04], rot: [0.1, 0, -0.1] },
  throwaxe:   { pos: [0, -0.6, 0.04], rot: [0.1, 0, -0.1] },
  dagger:   { pos: [0, -0.56, 0], rot: [0, 0, Math.PI / 2.4] },
  default:  { pos: [0, -0.62, 0], rot: [0, 0, Math.PI / 2.5] },  // sword/axe/mace
};

const GRAVITY = 26;
const JUMP_VEL = 9.5;
const WALK_SPEED = 7.0;
const SPRINT_MULT = 1.7;
const CLIMB_SPEED = 3.2;
const RADIUS = 0.5;
const MAX_SLOTS = 6; // hotbar ability slots (keys 1..6)

export class Player {
  constructor(scene, world, classId, name, appearance) {
    this.world = world;
    this.name = name;
    this.classId = classId;
    this.def = CLASSES[classId];
    this.stats = makeStats(classId);

    // How this hero looks — colours, proportions, and hairstyle. Defaults to a
    // class-flavoured look; a custom one comes from creation or a save.
    this.appearance = appearance
      ? normalizeAppearance(appearance, classId)
      : defaultAppearance(classId);

    // Abilities you KNOW, in hotbar order. You start with one.
    this.learned = [{ id: startingAbilityId(classId), rank: 1 }];
    this.cooldowns = [0];
    this.pendingLevelUps = 0; // levels gained but not yet "spent" in the modal

    // Equipment & inventory.
    this.gear = emptyGear();
    this.activeWeapon = 0;  // 0 = weapon slot, 1 = weapon2 slot (Tab toggles)
    this.inventory = [];
    this.maxInventory = 24;
    this.bonus = {};        // cached summed gear stats
    this.gold = 0;
    this.timed = [];        // active consumable buffs: {until, label, color, str?, dmgMult?, speedMult?...}
    this.questLog = {};     // id -> { accepted, progress, turnedIn }
    this.discovered = [];   // names of bonfires rested at (fast-travel points)
    this.stoneSwordPulled = false; // has the blade in the stone been drawn?

    this.mesh = createStickman({ appearance: this.appearance });
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

    // ---- Ki & Super Saiyan (the saiyan hero class) ----
    // Ki builds while fighting; a FULL gauge can be spent to ascend through
    // Super Saiyan forms, each one multiplying all attributes for 30s.
    this.ki = 0; this.kiMax = 100;
    this.ssjLevel = 0;   // 0 = base, 1..3 = SSJ tiers
    this.ssjUntil = 0;   // clock time the current form fades
    this.casting = false; // true while charging a cast-time spell (slows movement)

    // ---- Achievements: lifetime counters, claimed tiers, derived rewards ----
    this.counters = {};        // walk/ride/climb/swim/fish/discover/kill_* totals
    this.achievements = {};    // achievement id -> tiers claimed
    this.achBonus = {};        // permanent stat bonuses earned (summed into gear bonus)
    this.passives = new Set(); // unlocked behaviour flags (windwalker, amphibious…)
    this.discoveredAreas = new Set(); // named areas seen (for the map + Cartographer)
    this.explored = new Set(); // explored map cells (z*MAP_GRID + x)
    this.mountSkin = 'horse';
    this._buildSsjFx();

    this.recomputeGear();
  }

  get isSaiyan() { return this.classId === 'saiyan'; }
  get ssjActive() { return this.ssjLevel > 0 && this._clock < this.ssjUntil; }
  // Power multiplier from the active form: SSJ1 ×2, SSJ2 ×3, SSJ3 ×4.
  get ssjMult() { return this.ssjActive ? 1 + this.ssjLevel : 1; }
  get kiFull() { return this.isSaiyan && this.ki >= this.kiMax - 0.01; }
  canAscend() { return this.kiFull && this.ssjLevel < 3; }
  addKi(amount) {
    if (!this.isSaiyan || amount <= 0) return;
    this.ki = Math.min(this.kiMax, this.ki + amount);
  }
  // Spend a full gauge to climb one form (or kindle SSJ1 from base/faded).
  ascend() {
    if (!this.canAscend()) return 0;
    this.ki = 0;
    this.ssjLevel = this.ssjActive ? this.ssjLevel + 1 : 1;
    this.ssjUntil = this._clock + 30;
    this._updateSsjVisual();
    return this.ssjLevel;
  }

  // Golden spiky hair (grows per tier) + a rising flame aura, both attached
  // to the player mesh and hidden until a Super Saiyan form is active.
  _buildSsjFx() {
    const j = this.mesh.userData.joints;
    if (!j || !j.head) return;
    const gold = new THREE.MeshBasicMaterial({ color: 0xffe24a });
    const hair = new THREE.Group();
    // [x, y, z, rotX, rotZ, length] — spikes radiating up & back from the scalp.
    const defs = [
      [0, 0.28, -0.02, 0.05, 0.0, 1.05],
      [0.14, 0.25, -0.04, 0.2, 0.5, 0.85],
      [-0.14, 0.25, -0.04, 0.2, -0.5, 0.85],
      [0.09, 0.23, -0.16, 0.7, 0.2, 0.9],
      [-0.09, 0.23, -0.16, 0.7, -0.2, 0.9],
      [0, 0.22, -0.2, 1.0, 0.0, 1.0],
      [0.11, 0.26, 0.12, -0.45, 0.3, 0.65],
      [-0.11, 0.26, 0.12, -0.45, -0.3, 0.65],
    ];
    for (const [x, y, z, rx, rz, len] of defs) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.44 * len, 5), gold);
      c.position.set(x, y, z);
      c.rotation.x = rx; c.rotation.z = rz;
      hair.add(c);
    }
    hair.visible = false;
    j.head.add(hair);
    this.ssjHair = hair;

    // Flame aura — a translucent open cone that envelops the body.
    const auraMat = new THREE.MeshBasicMaterial({ color: 0xffe24a, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false });
    const aura = new THREE.Mesh(new THREE.ConeGeometry(0.72, 2.7, 14, 1, true), auraMat);
    aura.position.y = 1.15;
    aura.visible = false;
    this.mesh.add(aura);
    this.ssjAura = aura;
  }

  // Change the character's look at runtime (wardrobe). Re-applies colours,
  // proportions and hair to the live mesh, keeping gear/SSJ visuals intact.
  setAppearance(app) {
    this.appearance = normalizeAppearance(app, this.classId);
    applyAppearance(this.mesh, this.appearance);
    this._updateWeaponVisual && this._updateWeaponVisual(); // re-assert held weapon model
    this._updateSsjVisual();                                // hide custom hair if mid-transform
  }

  _updateSsjVisual() {
    const on = this.ssjActive;
    // The golden Super Saiyan mane replaces your normal hairstyle while active.
    const customHair = this.mesh.userData.joints && this.mesh.userData.joints.hair;
    if (customHair) customHair.visible = !on;
    if (this.ssjHair) {
      this.ssjHair.visible = on;
      // Taller, more dramatic hair each tier.
      this.ssjHair.scale.set(1 + this.ssjLevel * 0.12, 0.75 + this.ssjLevel * 0.6, 1 + this.ssjLevel * 0.12);
    }
    if (this.ssjAura) {
      this.ssjAura.visible = on;
      this.ssjAura.scale.setScalar(0.85 + this.ssjLevel * 0.22);
      // Brighter, whiter-gold at the highest tier.
      this.ssjAura.material.color.setHex(this.ssjLevel >= 3 ? 0xfff6b0 : 0xffe24a);
    }
  }

  // ---- Equipment-derived effective stats ----
  // The weapon currently wielded (slot 1 or 2 per activeWeapon).
  curWeapon() {
    const w = this.activeWeapon === 1 ? this.gear.weapon2 : this.gear.weapon;
    return w || this.gear.weapon || this.gear.weapon2 || null;
  }
  // Toggle which of the two weapons is wielded (only if both slots are filled).
  swapWeapon() {
    if (!this.gear.weapon || !this.gear.weapon2) return null;
    this.activeWeapon = this.activeWeapon === 0 ? 1 : 0;
    this.recomputeGear(); // re-applies stats and swaps the held model
    return this.curWeapon();
  }
  // Auto-attack profile from the WIELDED weapon (so a melee class holding a bow
  // fires arrows), falling back to the class default when unarmed.
  attackProfile() {
    const w = this.curWeapon();
    const prof = w && WEAPON_PROFILE[w.kind];
    if (prof && prof.ranged) {
      const col = (this.def.projColor) || (prof.shape === 'arrow' ? 0xddccaa : 0xffd24a);
      return { ranged: true, shape: prof.shape, speed: prof.speed, range: prof.range, projColor: col };
    }
    if (prof && !prof.ranged) return { ranged: false, range: this.def.range };
    // Unarmed → class default.
    return { ranged: !!this.def.ranged, shape: this.def.projGlyph === 'arrow' ? 'arrow' : 'orb', speed: 24, range: this.def.range, projColor: this.def.projColor || 0xffffff };
  }

  recomputeGear() {
    // Only the WIELDED weapon contributes stats (the stowed one is inactive).
    const active = this.curWeapon();
    const items = [];
    for (const s in this.gear) {
      if (s === 'weapon' || s === 'weapon2') continue;
      if (this.gear[s]) items.push(this.gear[s]);
    }
    if (active) items.push(active);
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
    // Permanent achievement rewards stack on top of gear/set bonuses.
    if (this.achBonus) for (const k in this.achBonus) this.bonus[k] = (this.bonus[k] || 0) + this.achBonus[k];
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
  // Super Saiyan multiplies every attribute (×2 / ×3 / ×4) while a form holds.
  get effStr() { return Math.round((this.stats.str + (this.bonus.str || 0) + this._t('str')) * this.ssjMult); }
  get effDex() { return Math.round((this.stats.dex + (this.bonus.dex || 0) + this._t('dex')) * this.ssjMult); }
  get effInt() { return Math.round((this.stats.int + (this.bonus.int || 0) + this._t('int')) * this.ssjMult); }
  get gearCrit() { return this.bonus.crit || 0; }
  get gearArmor() { return this.bonus.armor || 0; }
  get gearSpeed() { return (this.bonus.speed || 0) + (this._tm('speedMult') - 1); }
  get gearLifesteal() { return this.bonus.lifesteal || 0; }
  // Fishing power from gear + set bonuses: better fish tiers & loot when fishing.
  get fishingStat() { return this.bonus.fishing || 0; }

  get apower() {
    const effStats = { ...this.stats, str: this.effStr, dex: this.effDex, int: this.effInt };
    let p = attackPower(this.classId, effStats) + (this.bonus.damage || 0);
    if (this.buffs.until > this._clock) p *= this.buffs.dmg;
    p *= this._tm('dmgMult'); // potion damage buffs
    // Berserker (Ogreslayer reward): hits harder while badly wounded.
    if (this.passives.has('berserker') && this.stats.hp < this.effMaxHp * 0.35) p *= 1.25;
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

  // Play an emote: a few seconds of body language + a floating bubble.
  doEmote(id) {
    const e = EMOTES.find((x) => x.id === id) || EMOTES[0];
    this.emote = { id: e.id, glyph: e.glyph, until: this._clock + 3.2 };
    this.counters.emote = (this.counters.emote || 0) + 1; // Performer achievement
    return e;
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
    // Weapons fill slot 1, then slot 2; if both are full, replace the wielded one.
    let slot = item.slot;
    if (item.slot === 'weapon') {
      slot = !this.gear.weapon ? 'weapon' : !this.gear.weapon2 ? 'weapon2' : (this.activeWeapon === 1 ? 'weapon2' : 'weapon');
      this.activeWeapon = slot === 'weapon2' ? 1 : 0; // wield what you just equipped
    }
    const prev = this.gear[slot];
    this.gear[slot] = item;
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
    // Keep the wielded-weapon pointer valid when a weapon slot empties.
    if (slot === 'weapon' || slot === 'weapon2') {
      if (!this.gear.weapon && this.gear.weapon2) this.activeWeapon = 1;
      else this.activeWeapon = 0;
    }
    this.recomputeGear();
    return { unequipped: item };
  }
  dropItem(uid) { return this._removeUid(uid); }

  _updateWeaponVisual() {
    const j = this.mesh && this.mesh.userData.joints;
    if (!j || !j.armR) return;
    const w = this.curWeapon();
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
        // Each weapon kind is held in its own natural pose: poles (staff/bow)
        // run straight up & down in the grip, the wand points forward like a
        // focus, and blades sit angled in a ready stance.
        const h = WEAPON_HOLD[kind] || WEAPON_HOLD.default;
        wm.position.set(h.pos[0], h.pos[1], h.pos[2]);
        wm.rotation.set(h.rot[0], h.rot[1], h.rot[2]);
        const tier = 1 + Object.keys(RARITY).indexOf(w.rarity) * 0.06;
        wm.scale.setScalar(tier);
        j.armR.add(wm);
        this._heldWeapon = wm;
      }
      this._heldKey = key;
      this._heldKind = kind;
    }
  }

  // Ranged/caster weapons rest upright but THRUST FORWARD when attacking or
  // casting, so the staff/bow/thrown weapon points outward at the target rather
  // than staying glued to the arm. Melee keeps the normal arm swing.
  _poseHeldWeapon() {
    const w = this._heldWeapon;
    const kind = this._heldKind;
    if (!w || !isRangedWeaponKind(kind)) return;
    const j = this.mesh.userData.joints;
    const base = (WEAPON_HOLD[kind] || WEAPON_HOLD.default).rot;
    const attacking = this.attackAnim > 0;
    if (kind === 'bow' || kind === 'crossbow') {
      // A bow/crossbow is levelled and loosed, not thrust like a spear: raise the
      // arm to aim it forward on release; the weapon keeps its steady orientation
      // (the arrow/bolt already leaves from the tip via weaponMuzzle()).
      if (attacking) j.armR.rotation.set(-1.5, 0, 0);
      w.rotation.set(base[0], base[1], base[2]);
    } else if (attacking) {
      // Staff / wand / thrown: rest upright, then thrust the tip outward on cast.
      const t = Math.sin((1 - this.attackAnim) * Math.PI); // 0→1→0 ease over the swing
      j.armR.rotation.set(-1.4 * t, 0, 0);                 // extend the arm toward the foe
      w.rotation.set(base[0] + (2.9 - base[0]) * t, base[1], base[2] * (1 - t)); // tip points outward
    } else {
      w.rotation.set(base[0], base[1], base[2]);            // resting upright pose
    }
  }

  // World position of the held weapon's tip — where attacks/projectiles emanate
  // from. Falls back to the chest if unarmed (or the weapon has no tip tag).
  weaponMuzzle() {
    const w = this._heldWeapon;
    const chest = this.pos.clone(); chest.y += 1.3;
    if (!w || !w.userData.tip) return chest;
    w.updateWorldMatrix(true, false);
    const t = w.userData.tip;
    return w.localToWorld(new THREE.Vector3(t[0], t[1], t[2]));
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

    // Remember where we started so we can credit distance to the right counter.
    const sx = this.pos.x, sy = this.pos.y, sz = this.pos.z;

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
      if (this.ssjActive) speed *= 1 + this.ssjLevel * 0.12; // Saiyan swiftness
      if (this.mounted) speed *= 2.6 * (this.passives.has('trailblazer') ? 1.25 : 1); // gallop
      if (sprinting) { speed *= SPRINT_MULT; this.stats.sp -= 22 * dt * (this.passives.has('windwalker') ? 0.4 : 1); }
      if (this.casting) speed *= 0.4; // charging a spell — slowed to a trudge

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
    this._trackDistance(sx, sy, sz);
    this._markExplored();
  }

  // Credit distance travelled this frame to the matching achievement counter.
  _trackDistance(sx, sy, sz) {
    const dxz = Math.hypot(this.pos.x - sx, this.pos.z - sz);
    const dy = Math.abs(this.pos.y - sy);
    if (dxz < 1e-4 && dy < 1e-4) return;
    if (dxz > 30) return; // ignore teleports (fast-travel, Instant Step)
    const c = this.counters;
    if (this.state === 'climb') c.climb = (c.climb || 0) + dxz + dy;
    else if (this.state === 'swim') c.swim = (c.swim || 0) + dxz + dy * 0.5;
    else if (this.mounted) c.ride = (c.ride || 0) + dxz;
    else c.walk = (c.walk || 0) + dxz;
  }

  // Reveal the fog-of-war cells around the player (wider with Pathfinder).
  _markExplored() {
    const gx = Math.floor((this.pos.x + MAP_HALF) / MAP_SPAN * MAP_GRID);
    const gz = Math.floor((this.pos.z + MAP_HALF) / MAP_SPAN * MAP_GRID);
    const R = this.passives.has('pathfinder') ? 4 : 2;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R + 1) continue;
      const x = gx + dx, z = gz + dz;
      if (x < 0 || x >= MAP_GRID || z < 0 || z >= MAP_GRID) continue;
      this.explored.add(z * MAP_GRID + x);
    }
  }

  // Record a kill for achievements (per-type + total).
  recordKill(typeId) {
    this.counters.kill_total = (this.counters.kill_total || 0) + 1;
    if (typeId) this.counters['kill_' + typeId] = (this.counters['kill_' + typeId] || 0) + 1;
  }
  // Note a newly-entered named area (for the map + Cartographer).
  discoverArea(name) {
    if (!name || this.discoveredAreas.has(name)) return false;
    this.discoveredAreas.add(name);
    this.counters.discover = (this.counters.discover || 0) + 1;
    return true;
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
    if (!this.passives.has('spiderclimb')) this.stats.sp -= 9 * dt; // Spider-Climb: free climbing
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
  // A bouncy slime steed (the Slime Slayer achievement reward).
  _buildSlimeSteed() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0x5fd35f, transparent: true, opacity: 0.85 }));
    body.scale.y = 0.72; body.position.y = 0.66;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x10240f });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat); e1.position.set(0.26, 0.85, 0.7);
    const e2 = e1.clone(); e2.position.x = -0.26;
    // A little nucleus so it reads as a slime.
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x9bef9b, transparent: true, opacity: 0.5 }));
    core.position.y = 0.55;
    g.add(body, core, e1, e2);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = []; g.userData.phase = 0; g.userData.slime = true; g.userData.body = body;
    return g;
  }
  // A rideable dragon (the Dragonslayer capstone reward).
  _buildDragonSteed() {
    const g = new THREE.Group();
    const scaleMat = new THREE.MeshLambertMaterial({ color: 0x4a2030 });
    const bellyMat = new THREE.MeshLambertMaterial({ color: 0x73402c });
    const membrane = new THREE.MeshLambertMaterial({ color: 0x2a1020, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), scaleMat);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.0, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6), scaleMat); neck.position.set(0, 1.4, 0.7); neck.rotation.x = 0.7;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.5), scaleMat); head.position.set(0, 1.75, 1.0);
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb13c })); eye.position.set(s * 0.13, 1.82, 1.18); g.add(eye);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), bellyMat); horn.position.set(s * 0.12, 1.98, 0.86); horn.rotation.x = -0.5; g.add(horn);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.1, 5), scaleMat); tail.position.set(0, 1.0, -1.0); tail.rotation.x = -Math.PI / 2;
    g.add(body, neck, head, tail);
    const wings = [];
    for (const s of [1, -1]) {
      const wing = new THREE.Group(); wing.position.set(s * 0.3, 1.25, -0.1);
      const mem = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 1.2), membrane); mem.position.set(s * 0.85, 0, -0.3); wing.add(mem);
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 1.7, 5), bellyMat); spar.rotation.z = Math.PI / 2; spar.position.x = s * 0.85; wing.add(spar);
      g.add(wing); wings.push(wing);
    }
    const legs = [];
    for (const [lx, lz] of [[0.25, 0.45], [-0.25, 0.45], [0.25, -0.45], [-0.25, -0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.9, 5), scaleMat); leg.position.set(lx, 0.45, lz); g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0; g.userData.dragon = true; g.userData.wings = wings;
    return g;
  }
  // Swap the steed model (e.g. to the unlocked Slime or Dragon mount).
  setMountSkin(skin) {
    if (this.mountSkin === skin && this.steed) return;
    this.mountSkin = skin;
    const wasMounted = this.mounted;
    if (this.steed) this.scene.remove(this.steed);
    this.steed = skin === 'slime' ? this._buildSlimeSteed()
      : skin === 'dragon' ? this._buildDragonSteed()
      : this._buildSteed();
    this.steed.visible = wasMounted;
    this.scene.add(this.steed);
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
    const amphibious = this.passives.has('amphibious');
    const SWIM = amphibious ? 8.0 : 5.5; // Amphibious: faster swimming
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

    // Air / drowning. Amphibious never runs out of breath.
    const headUnder = this.pos.y < WATER_LEVEL - 0.6;
    if (headUnder && !amphibious) {
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
    // Emotes auto-expire and only play while standing still and not attacking.
    const emote = (this.emote && this._clock < this.emote.until && this.state === 'ground' && this.attackAnim <= 0) ? this.emote.id : null;
    animateStickman(this.mesh, dt, {
      speed01: this._speed01, attack: this.attackAnim,
      climbing: this.state === 'climb', airborne: this.state === 'air', emote,
    });
    this._poseHeldWeapon();

    // Super Saiyan aura: flicker the flame and let the hair shimmer.
    if (this.ssjActive && this.ssjAura) {
      const f = 0.22 + Math.abs(Math.sin(this._clock * 16)) * 0.18;
      this.ssjAura.material.opacity = f;
      this.ssjAura.scale.y = (0.85 + this.ssjLevel * 0.22) * (1 + Math.sin(this._clock * 12) * 0.05);
    }

    // Mount: sit the rider higher and trot the steed beneath.
    if (this.mounted) {
      this.mesh.position.y += 0.85;
      this.steed.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.steed.rotation.y = this.mesh.rotation.y;
      const sd = this.steed.userData;
      sd.phase += dt * (4 + this._speed01 * 14);
      sd.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(sd.phase + (i % 2) * Math.PI) * 0.5 * (0.3 + this._speed01); });
      if (sd.slime) {
        // Squash-and-stretch hop instead of a trot.
        const b = Math.abs(Math.sin(sd.phase)) * (0.12 + this._speed01 * 0.2);
        sd.body.scale.set(1 + b * 0.5, 0.72 - b, 1 + b * 0.5);
        this.steed.position.y += b * 0.4;
        this.mesh.position.y += b * 0.4;
      } else if (sd.dragon) {
        // Beat the wings and ride a little higher off the ground.
        const flap = Math.sin(sd.phase * 1.6) * 0.6 + 0.15;
        sd.wings[0].rotation.z = -flap; sd.wings[1].rotation.z = flap;
        this.steed.position.y += 0.4 + Math.sin(sd.phase) * 0.08;
        this.mesh.position.y += 0.5;
      }
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

    // Ki: a slow passive trickle (so you can always eventually transform),
    // topped up much faster by dealing/taking damage in combat.
    if (this.isSaiyan) {
      if (this.ki < this.kiMax) this.ki = Math.min(this.kiMax, this.ki + 1.5 * dt);
      // A faded Super Saiyan form drops you back to base.
      if (this.ssjLevel > 0 && this._clock >= this.ssjUntil) { this.ssjLevel = 0; this._updateSsjVisual(); }
    }
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
    if (this.isSaiyan) this.addKi(amount * 0.4); // pain fuels ki
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
    this.counters.rest = (this.counters.rest || 0) + 1; // Wayfarer achievement
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
      activeWeapon: this.activeWeapon,
      counters: this.counters,
      achievements: this.achievements,
      discoveredAreas: [...this.discoveredAreas],
      explored: [...this.explored],
      mountSkin: this.mountSkin,
      appearance: this.appearance,
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
    if (typeof save.activeWeapon === 'number') this.activeWeapon = save.activeWeapon;
    // Achievements: restore counters & claimed tiers, then re-derive rewards.
    if (save.counters && typeof save.counters === 'object') this.counters = { ...save.counters };
    if (save.achievements && typeof save.achievements === 'object') this.achievements = { ...save.achievements };
    if (Array.isArray(save.discoveredAreas)) this.discoveredAreas = new Set(save.discoveredAreas);
    if (Array.isArray(save.explored)) this.explored = new Set(save.explored);
    // Restore the saved look (older saves without one keep the class default).
    if (save.appearance) this.setAppearance(save.appearance);
    Achievements.reapply(this); // rebuilds achBonus/passives, recomputes gear, restores mount skin
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
