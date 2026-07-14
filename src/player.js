// ============================================================
// Local player controller: stickman mesh, movement state machine
// (grounded / airborne / climbing), vitals & regen, and the new
// progression model — abilities are LEARNED and RANKED over levels,
// and each level-up queues a player choice (attribute + skill).
// ============================================================
import * as THREE from 'three';
import { litMat } from './gfx.js';
import { createStickman, animateStickman, applyAppearance } from './stickman.js';
import { defaultAppearance, normalizeAppearance } from './appearance.js';
import { SKILLS, SKILL_MAX, skillXpForLevel, skillBonus as skillBonusFor } from './skills.js';
import { buildWeaponMesh, isRangedWeaponKind, WEAPON_PROFILE, WEAPON_HOLD } from './weapons.js';
import { applyArmorVisual } from './gear3d.js';
import {
  CLASSES, makeStats, applyAutoLevel, applyAttributeChoice,
  attackPower, getAbility, effectiveAbility, startingAbilityId, MAX_RANK,
  passiveAggregateIds, passivesFor, passiveById,
} from './classes.js';
import { heightAt, WATER_LEVEL, WORLD_SIZE } from './world.js';
import { sumStats, EQUIP_SLOTS, RARITY, SETS } from './items.js';
import { MOUNTS, mountById } from './mounts.js';
import * as Achievements from './achievements.js';

function emptyGear() {
  const g = {};
  for (const s of EQUIP_SLOTS) g[s] = null; // every socket, incl. weapon2 & ring2
  return g;
}

// Bag/pouch capacity + upgrade steps (bought from the Quartermaster). Combat
// bag counts item slots; the crafting pouch counts distinct material stacks.
export const INV_BASE = 24, INV_STEP = 6, INV_MAX = 60;
export const MAT_BASE = 12, MAT_STEP = 4, MAT_MAX = 32;
// Escalating gold cost of the next capacity upgrade, by how many already bought.
export function invUpgradeCost(tier) { return Math.round(250 * Math.pow(1.7, tier)); }
export function matUpgradeCost(tier) { return Math.round(180 * Math.pow(1.7, tier)); }

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

// Map fog-of-war grid: the whole world is divided into a MAP_GRID × MAP_GRID
// lattice; cells the player has stood near are "explored". The grid tracks the
// full (tripled) world span, at a resolution that keeps cells ~12u across.
export const MAP_SPAN = WORLD_SIZE * 2, MAP_HALF = WORLD_SIZE;
export const MAP_GRID = Math.round(MAP_SPAN / 12);

// (WEAPON_HOLD — how each weapon kind rests in the hand — now lives in
// weapons.js so the remote-player renderer can hold weapons identically.)

const GRAVITY = 26;
const JUMP_VEL = 9.5;
const WALK_SPEED = 7.0;
const SPRINT_MULT = 1.7;
const CLIMB_SPEED = 3.2;
const RADIUS = 0.5;
// Dodge roll tuning.
const DODGE_COST = 26;      // stamina spent per roll
const DODGE_IFRAMES = 0.36; // seconds of invincibility (a full roll grants these)
const DODGE_CD = 0.5;       // min seconds between rolls
const DODGE_SPEED = 15;     // peak roll speed (units/sec)
const MAX_SLOTS = 8; // hotbar ability slots (keys 1..8)

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
    this.maxInventory = INV_BASE;
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
    this.attackLock = 0;     // seconds rooted mid-swing (committed & vulnerable)
    this.comboStep = 0;      // alternates the swing on quick successive melee hits
    // Dodge roll (Ctrl): a stamina-fuelled evasive roll with i-frames that also
    // cancels a committed swing. Weak (no i-frames) when you're low on stamina.
    this.dodging = false;
    this.dodgeT = 0;         // 1 → 0 progress of the current roll
    this.dodgeDur = 0.42;
    this.dodgeDir = { x: 0, z: 1 };
    this.dodgeCd = 0;        // brief cooldown between rolls
    this.dodgeWeak = false;  // rolled while out of stamina (no i-frames, shorter)
    this.onDodge = null;     // (dir) callback for the whoosh FX
    this._exhausted = false; // true after stamina hits 0 until it fully refills
    this._lungeT = 0;        // brief forward lunge on the stab (combo step 2)
    this._lungeDir = { x: 0, z: 1 };
    this.charging = false;   // winding up a charged basic attack (crawls to a stop)
    this.stealthUntil = 0;   // rogue Shadowmeld: stealthed while clock < this
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
    // RuneScape-style proficiency skills — trained by activity (see skills.js).
    this.skills = {};
    for (const s of SKILLS) this.skills[s.id] = { level: 1, xp: 0 };
    this.onSkillUp = null;     // (skillId, level) callback for level-up feedback
    this._skillBonusCache = {}; // memo of skillBonus per id, cleared on level-up
    this.learnedPassives = []; // class passives CHOSEN at level-up (ids; see classes PASSIVES)
    this._passDirty = true;    // recompute the passive aggregate on next read
    this.discoveredAreas = new Set(); // named areas seen (for the map + Cartographer)
    this.explored = new Set(); // explored map cells (z*MAP_GRID + x)
    this.mountSkin = 'horse';
    // Crafting pouch: stackable materials kept out of the 24-slot combat bag.
    this.materials = {};       // materialId -> count
    this.maxMaterials = MAT_BASE; // distinct material stacks the pouch can hold (upgradeable)
    this.builds = [];          // placed structures: { type, x, y, z, rot }
    this.ownedMounts = new Set(); // mount skins bought from the Stablemaster
    this.activeMount = 'horse';   // which owned mount setMountSkin summons
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
      c.userData.noOutline = true;
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
    aura.userData.noOutline = true;
    this.mesh.add(aura);
    this.ssjAura = aura;
  }

  // Change the character's look at runtime (wardrobe). Re-applies colours,
  // proportions and hair to the live mesh, keeping gear/SSJ visuals intact.
  setAppearance(app) {
    this.appearance = normalizeAppearance(app, this.classId);
    applyAppearance(this.mesh, this.appearance);
    this._updateWeaponVisual && this._updateWeaponVisual(); // re-assert held weapon (skin may have changed)
    // Force the worn armor to rebuild so it re-fits the new proportions/skin.
    if (this.mesh) this.mesh.userData.armor = null;
    this._updateArmorVisual();
    this._updateSsjVisual();                                // hide custom hair if mid-transform
    if (this.onLookChange) this.onLookChange();
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
    this._updateArmorVisual();
    if (this.onLookChange) this.onLookChange(); // let multiplayer re-broadcast our look
  }

  // Compact, JSON-friendly description of everything that shows on the model —
  // the wielded weapon (+ its skin) and each worn armor piece. Sent to other
  // players so they see our gear; also used to render our own armor locally.
  equipVisual() {
    const g = this.gear;
    const w = this.curWeapon();
    const piece = (it) => (it ? { b: it.baseId, r: it.rarity, s: it.setId || null } : null);
    return {
      weapon: w ? { kind: w.kind || 'sword', r: w.rarity } : null,
      skin: (this.appearance && this.appearance.weaponSkin) || 'default',
      head: piece(g.head), shoulders: piece(g.shoulders), chest: piece(g.chest),
      back: piece(g.back), hands: piece(g.hands), feet: piece(g.feet),
    };
  }

  // Rebuild the worn-armor meshes on our own model (scaled to our proportions).
  _updateArmorVisual() {
    if (!this.mesh) return;
    applyArmorVisual(this.mesh, this.equipVisual(), this.appearance);
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
  // Aggregate of the class passives the player has CHOSEN at level-up
  // (recomputed only when the learned set changes). See classes.js PASSIVES.
  get pass() {
    if (this._passDirty) { this._pass = passiveAggregateIds(this.classId, this.learnedPassives); this._passDirty = false; }
    return this._pass;
  }
  get gearCrit() { return (this.bonus.crit || 0) + this.pass.crit; }
  get gearArmor() { return this.bonus.armor || 0; }
  get gearSpeed() { return (this.bonus.speed || 0) + (this._tm('speedMult') - 1) + this.pass.speed; }
  get gearLifesteal() { return (this.bonus.lifesteal || 0) + this.pass.lifesteal; }
  // Cooldown multiplier from passives (floored so it can never trivialize CDs).
  get cdrMult() { return Math.max(0.4, 1 - this.pass.cdr); }

  // ---- Proficiency skills ----
  skillLevel(id) { const s = this.skills[id]; return s ? s.level : 1; }
  // Cached aggregate bonus for a skill (dmg/crit/speed/fishing/costMul/stamina).
  skillBonus(id) {
    if (!this._skillBonusCache[id]) this._skillBonusCache[id] = skillBonusFor(id, this.skillLevel(id));
    return this._skillBonusCache[id];
  }
  // Train a skill by `amt` XP; rolls level-ups on the steep skill curve.
  gainSkillXp(id, amt) {
    const s = this.skills[id];
    if (!s || s.level >= SKILL_MAX || !(amt > 0)) return;
    s.xp += amt;
    let leveled = false;
    while (s.level < SKILL_MAX && s.xp >= skillXpForLevel(s.level)) {
      s.xp -= skillXpForLevel(s.level); s.level++; leveled = true;
    }
    if (leveled) { this._skillBonusCache[id] = null; if (this.onSkillUp) this.onSkillUp(id, s.level); }
  }
  // Fishing power from gear + set bonuses + the Fishing skill.
  get fishingStat() { return (this.bonus.fishing || 0) + this.skillBonus('fishing').fishing; }

  get apower() {
    const effStats = { ...this.stats, str: this.effStr, dex: this.effDex, int: this.effInt };
    let p = attackPower(this.classId, effStats) + (this.bonus.damage || 0);
    if (this.buffs.until > this._clock) p *= this.buffs.dmg;
    p *= this._tm('dmgMult'); // potion damage buffs
    p *= (1 + this.pass.dmg); // always-on class passive damage
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
    } else if (item.slot === 'ring') {
      // Rings fill the first free socket, else replace the first ring.
      slot = !this.gear.ring ? 'ring' : !this.gear.ring2 ? 'ring2' : 'ring';
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
    const skin = (this.appearance && this.appearance.weaponSkin) || 'default';
    // Swap the held model only when the weapon kind/rarity/skin actually changes.
    const key = kind ? kind + ':' + w.rarity + ':' + skin : 'none';
    if (key !== this._heldKey) {
      if (this._heldWeapon) {
        j.armR.remove(this._heldWeapon);
        this._heldWeapon.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this._heldWeapon = null;
      }
      if (j.weapon) j.weapon.visible = false; // hide the generic stick
      if (kind) {
        const wm = buildWeaponMesh(kind, color, skin);
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

  // Weapons rest in the hand at the hip and EXTEND OUTWARD when used: ranged
  // weapons thrust/level toward the target, and melee blades swing out from the
  // cross-body ready pose so the strike reaches forward instead of hugging the arm.
  // Kick off a brief forward lunge (used by the stab combo step). `dir` is a
  // world-space direction; only its horizontal component matters.
  lunge(dir) {
    const l = Math.hypot(dir.x, dir.z) || 1;
    this._lungeDir = { x: dir.x / l, z: dir.z / l };
    this._lungeT = 1;
  }

  // ---- Dodge roll ----
  // Roll in `dir` (or, if none, where you face). Costs stamina, grants i-frames,
  // and CANCELS a committed swing. Rolling with too little stamina still moves
  // you but is "weak" — no i-frames and a shorter roll — so being out of stamina
  // is dangerous. Returns true if a roll started.
  tryDodge(dir) {
    if (!this.alive || this.mounted) return false;
    if (this.dodging || this.dodgeCd > 0) return false;
    if (this.state === 'climb' || this.state === 'swim') return false;
    const d = (dir && (dir.x || dir.z)) ? dir : { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    const l = Math.hypot(d.x, d.z) || 1;
    this.dodgeDir = { x: d.x / l, z: d.z / l };
    // A proper roll needs a chunk of stamina; below that it's a weak stumble.
    const strong = this.stats.sp >= DODGE_COST && !this._exhausted;
    this.dodgeWeak = !strong;
    this.dodging = true;
    this.dodgeT = 1;
    this.dodgeDur = strong ? 0.42 : 0.3;
    this.dodgeCd = DODGE_CD + this.dodgeDur;
    this.stats.sp = Math.max(0, this.stats.sp - (strong ? DODGE_COST : this.stats.sp)); // a weak roll burns what's left
    if (strong) this.iframeUntil = this._clock + DODGE_IFRAMES; // i-frames only on a real roll
    // Cancel any committed swing / charge and face the roll.
    this.attackLock = 0; this.attackAnim = 0; this.charging = false;
    this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    if (this.onDodge) this.onDodge(this.dodgeDir);
    return true;
  }
  _updateDodge(dt) {
    this.dodgeT = Math.max(0, this.dodgeT - dt / this.dodgeDur);
    const ease = this.dodgeT;                 // fast at the start, slowing out
    const spd = (this.dodgeWeak ? 0.5 : 1) * DODGE_SPEED * (0.35 + ease);
    this.pos.x += this.dodgeDir.x * spd * dt;
    this.pos.z += this.dodgeDir.z * spd * dt;
    const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS);
    this.pos.x = res.x; this.pos.z = res.z;
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.state = 'ground';
    this._speed01 = 0.7;
    this.moveDir = null;
    if (this.dodgeT <= 0) { this.dodging = false; this.mesh.rotation.x = 0; }
  }

  _poseHeldWeapon() {
    const w = this._heldWeapon;
    const kind = this._heldKind;
    if (!w) return;
    const j = this.mesh.userData.joints;
    const base = (WEAPON_HOLD[kind] || WEAPON_HOLD.default).rot;
    const attacking = this.attackAnim > 0;
    if (!isRangedWeaponKind(kind)) {
      // Melee: the ARM now carries the swing's arc (see animateStickman); the
      // blade just follows the grip — a light straighten through a slash, and a
      // full forward point on the stab (comboStep 2) so the tip leads the thrust.
      if (attacking) {
        // Straighten the blade IN LINE with the arm through the swing so it
        // sweeps the arc (slash) / leads the thrust (stab) instead of staying
        // angled in the grip — then eases back to the upright ready pose.
        const arc = Math.sin((1 - this.attackAnim) * Math.PI); // 0→1→0 over the swing
        const ext = Math.PI * 0.92;                            // blade in line with the arm
        w.rotation.set(base[0] + (ext - base[0]) * arc, base[1], base[2] * (1 - arc));
      } else {
        w.rotation.set(base[0], base[1], base[2]);
      }
      return;
    }
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

    // Commitment + dodge timers.
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.attackLock > 0) this.attackLock = Math.max(0, this.attackLock - dt);
    // Dodge roll (Ctrl / pad / touch) — fires even mid-swing to cancel it.
    if (!this.dodging && (input.just('ControlLeft') || input.just('ControlRight') || input.just('Dodge'))) {
      this.tryDodge(moving ? { x: move.x, z: move.z } : null);
    }

    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    // No sprinting while exhausted (drained to empty) or mounted (the steed is
    // already your speed — stacking a sprint on top was far too fast).
    const sprinting = wantSprint && moving && this.stats.sp > 1 && !this._exhausted && !this.mounted && this.state !== 'climb' && this.attackLock <= 0 && !this.dodging;

    const groundHere = heightAt(this.pos.x, this.pos.z);
    const inWater = groundHere < WATER_LEVEL - 0.6 && this.pos.y < WATER_LEVEL + 1.2;

    if (this.dodging) {
      this._updateDodge(dt);
    } else if (this.state === 'climb') {
      this._updateClimb(dt, input, move, moving);
    } else if (inWater) {
      this._updateSwim(dt, input, move, moving);
    } else {
      const rooted = this.attackLock > 0;                    // committed to a swing
      let speed = WALK_SPEED * (1 + this.gearSpeed + this.skillBonus('athletics').speed) * (this.buffs.until > this._clock ? this.buffs.speed : 1);
      if (this.ssjActive) speed *= 1 + this.ssjLevel * 0.12; // Saiyan swiftness
      if (this.mounted) speed *= this.mountSpeed * (1 + this.skillBonus('riding').speed) * (this.passives.has('trailblazer') ? 1.25 : 1); // steady canter (per-mount speed)
      if (sprinting) { speed *= SPRINT_MULT; this.stats.sp -= 22 * dt * (this.passives.has('windwalker') ? 0.4 : 1) * (1 - this.skillBonus('athletics').stamina); }
      if (this.casting) speed *= 0.4; // charging a spell — slowed to a trudge
      if (this.charging) speed *= 0.18; // winding up a charged attack — a near standstill
      if (rooted) speed *= 0.12; // rooted mid-swing: you can't just walk out of it

      this.vel.x = move.x * speed;
      this.vel.z = move.z * speed;
      this.vel.y -= GRAVITY * dt;

      if (input.just('Space') && this.state === 'ground' && !rooted) { this.vel.y = JUMP_VEL; this.state = 'air'; }

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;

      // A stab (combo step 2) carries the hero forward a short, decaying step.
      if (this._lungeT > 0) {
        const sp = 10 * this._lungeT;
        this.pos.x += this._lungeDir.x * sp * dt;
        this.pos.z += this._lungeDir.z * sp * dt;
        this._lungeT = Math.max(0, this._lungeT - dt * 4.2);
      }

      const res = this.world.resolveCircle(this.pos.x, this.pos.z, RADIUS);
      this.pos.x = res.x; this.pos.z = res.z;

      // Start climbing: press forward into a climbable wall with stamina.
      if (res.climb && axis.z > 0 && this.stats.sp > 2 && !this.mounted) this._startClimb(res.climb, move);

      const ground = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.state = 'ground'; }
      else if (this.state !== 'climb') this.state = 'air';

      if (moving && !rooted) this.facing = Math.atan2(move.x, move.z); // keep swing facing while rooted
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
    else if (this.mounted) { c.ride = (c.ride || 0) + dxz; this.gainSkillXp('riding', dxz * 0.35); }
    else if (this.state === 'ground') { c.walk = (c.walk || 0) + dxz; this.gainSkillXp('athletics', dxz * 0.16); }
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
    const hide = litMat({ color: 0x7a5334 });
    const hide2 = litMat({ color: 0x8a6340 });
    const mane = litMat({ color: 0x2e2013 });
    const leather = litMat({ color: 0x4a2f1c });
    const blanket = litMat({ color: 0x8a3a3a });
    const hoof = litMat({ color: 0x241a12 });

    // Barrel body + a rounded chest and haunches for a fuller silhouette.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.05, 6, 12), hide);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.12, 0);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), hide); chest.position.set(0, 1.12, 0.55); chest.scale.set(0.9, 0.95, 0.8);
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), hide); rump.position.set(0, 1.14, -0.55); rump.scale.set(0.95, 1.0, 0.85);
    g.add(body, chest, rump);

    // Neck + head with muzzle, ears and a forelock.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.95, 8), hide); neck.position.set(0, 1.5, 0.78); neck.rotation.x = 0.62;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.44), hide2); head.position.set(0, 1.86, 1.16); head.rotation.x = 0.25;
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.26), hide2); muzzle.position.set(0, 1.74, 1.4); muzzle.rotation.x = 0.25;
    g.add(neck, head, muzzle);
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), hide2); ear.position.set(s * 0.09, 2.06, 1.06); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x120b06 })); eye.position.set(s * 0.13, 1.9, 1.32); g.add(eye);
    }
    // Mane crest along the neck + a flowing tail.
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.62), mane); crest.position.set(0, 1.68, 0.82); crest.rotation.x = 0.62; g.add(crest);
    const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), mane); forelock.position.set(0, 2.0, 1.2); forelock.rotation.x = 0.5; g.add(forelock);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.9, 6), mane); tail.position.set(0, 1.05, -0.95); tail.rotation.x = -0.5; g.add(tail);

    // Saddle blanket + saddle + a pommel the rider sits behind.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.9), blanket); pad.position.set(0, 1.42, 0.05); g.add(pad);
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), leather); saddle.rotation.z = Math.PI / 2; saddle.position.set(0, 1.5, 0.05); saddle.scale.set(1, 1, 0.9); g.add(saddle);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), leather); pommel.position.set(0, 1.6, 0.4); g.add(pommel);
    // Reins running from the bit up toward the pommel (where the rider's hands go).
    const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4), leather); rein.position.set(0, 1.62, 0.78); rein.rotation.x = -0.7; g.add(rein);

    // Legs with hooves; the trot animator swings these (userData.legs).
    const legs = [];
    for (const [lx, lz] of [[0.24, 0.52], [-0.24, 0.52], [0.24, -0.52], [-0.24, -0.52]]) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.05, 6), hide); upper.position.y = -0.52; leg.add(upper);
      const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6), hoof); shoe.position.y = -1.02; leg.add(shoe);
      leg.position.set(lx, 1.05, lz);
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
      litMat({ color: 0x5fd35f, transparent: true, opacity: 0.85 }));
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
    const scaleMat = litMat({ color: 0x4a2030 });
    const bellyMat = litMat({ color: 0x73402c });
    const membrane = litMat({ color: 0x2a1020, side: THREE.DoubleSide });
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
      : skin === 'direwolf' ? this._buildBeastSteed('direwolf')
      : skin === 'charger' ? this._buildBeastSteed('charger')
      : skin === 'raptor' ? this._buildRaptorSteed()
      : skin === 'elk' ? this._buildElkSteed()
      : skin === 'sandstrider' ? this._buildStriderSteed()
      : this._buildSteed();
    this.steed.visible = wasMounted;
    this.scene.add(this.steed);
  }

  // ---- Purchasable mount meshes (Stablemaster) ----
  // A quadruped built to a variant profile. `direwolf` = low, lean, grey;
  // `charger` = a barded (armored) warhorse. Both trot via userData.legs.
  _buildBeastSteed(variant) {
    const g = new THREE.Group();
    const wolf = variant === 'direwolf';
    const m = mountById(variant);
    const hide = litMat({ color: m.color });
    const hide2 = litMat({ color: wolf ? 0x6a6f78 : 0x4a4d55 });
    const dark = litMat({ color: wolf ? 0x3a3f47 : 0x23242a });
    const metal = litMat({ color: 0x8a8f9a });
    const blanket = litMat({ color: wolf ? 0x5a3a3a : 0x6a2f2f });
    const bodyY = wolf ? 1.0 : 1.12, len = wolf ? 1.15 : 1.05, gir = wolf ? 0.32 : 0.38;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(gir, len, 6, 12), hide);
    body.rotation.z = Math.PI / 2; body.position.set(0, bodyY, 0);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(gir + 0.05, 12, 10), hide); chest.position.set(0, bodyY, 0.55); chest.scale.set(0.9, 0.95, 0.8);
    const rump = new THREE.Mesh(new THREE.SphereGeometry(gir + 0.06, 12, 10), hide); rump.position.set(0, bodyY, -0.55); rump.scale.set(0.95, 1, 0.85);
    g.add(body, chest, rump);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, wolf ? 0.6 : 0.95, 8), hide); neck.position.set(0, bodyY + (wolf ? 0.25 : 0.38), wolf ? 0.7 : 0.78); neck.rotation.x = wolf ? 1.0 : 0.62;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, wolf ? 0.5 : 0.44), hide2); head.position.set(0, bodyY + (wolf ? 0.4 : 0.74), wolf ? 1.05 : 1.16); head.rotation.x = wolf ? 0.1 : 0.25;
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), hide2); muzzle.position.set(0, bodyY + (wolf ? 0.34 : 0.62), wolf ? 1.32 : 1.4); muzzle.rotation.x = wolf ? 0.05 : 0.25;
    g.add(neck, head, muzzle);
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, wolf ? 0.22 : 0.16, 5), hide2); ear.position.set(s * 0.09, bodyY + (wolf ? 0.6 : 0.94), wolf ? 0.98 : 1.06); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: wolf ? 0xffd23c : 0x120b06 })); eye.position.set(s * 0.11, bodyY + (wolf ? 0.44 : 0.78), wolf ? 1.24 : 1.32); g.add(eye);
    }
    // Tail: bushy for the wolf, whisked for the horse.
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(wolf ? 0.1 : 0.06, wolf ? 0.03 : 0.14, wolf ? 0.8 : 0.9, 6), dark);
    tail.position.set(0, bodyY - (wolf ? 0.05 : 0.07), -0.95); tail.rotation.x = wolf ? -1.1 : -0.5; g.add(tail);
    // Charger barding: face plate, chest plate, saddle blanket.
    if (!wolf) {
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.06), metal); face.position.set(0, bodyY + 0.78, 1.36); g.add(face);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 6), metal); spike.position.set(0, bodyY + 1.02, 1.28); spike.rotation.x = 0.3; g.add(spike);
      const barding = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.5), metal); barding.position.set(0, bodyY - 0.05, 0.5); g.add(barding);
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.86), blanket); pad.position.set(0, bodyY + 0.3, 0.05); g.add(pad);
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.46, 4, 8), litMat({ color: 0x4a2f1c })); saddle.rotation.z = Math.PI / 2; saddle.position.set(0, bodyY + 0.38, 0.05); saddle.scale.set(1, 1, 0.9); g.add(saddle);
    const legs = [];
    for (const [lx, lz] of [[0.22, 0.5], [-0.22, 0.5], [0.22, -0.5], [-0.22, -0.5]]) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, bodyY, 6), hide); upper.position.y = -bodyY / 2; leg.add(upper);
      const paw = new THREE.Mesh(wolf ? new THREE.SphereGeometry(0.09, 6, 6) : new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6), dark); paw.position.y = -bodyY + 0.06; leg.add(paw);
      leg.position.set(lx, bodyY, lz); g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0; g.userData.seat = wolf ? 1.28 : 1.4;
    return g;
  }

  // A feathered ridge-runner (dinosaur-ish): two big legs, small arms, a long
  // balancing tail. The fastest mount.
  _buildRaptorSteed() {
    const g = new THREE.Group();
    const m = mountById('raptor');
    const skin = litMat({ color: m.color });
    const belly = litMat({ color: 0x94a86a });
    const feather = litMat({ color: 0xb5502e });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 6, 12), skin);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.15, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 8), skin); neck.position.set(0, 1.5, 0.55); neck.rotation.x = 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.5), skin); head.position.set(0, 1.78, 0.9); head.rotation.x = 0.18;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.4), belly); jaw.position.set(0, 1.68, 0.98); jaw.rotation.x = 0.12;
    g.add(body, neck, head, jaw);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), feather); crest.position.set(0, 1.94, 0.72); crest.rotation.x = -0.4; g.add(crest);
    for (const s of [1, -1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffca2c })); eye.position.set(s * 0.1, 1.82, 1.0); g.add(eye); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 6), skin); tail.position.set(0, 1.12, -0.95); tail.rotation.x = -Math.PI / 2 - 0.2; g.add(tail);
    // Little forelimbs.
    for (const s of [1, -1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.4, 5), skin); arm.position.set(s * 0.22, 1.2, 0.42); arm.rotation.x = 0.8; g.add(arm); }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.7), litMat({ color: 0x5a3a2a })); pad.position.set(0, 1.44, 0.02); g.add(pad);
    // Two powerful legs (the trot animator swings these).
    const legs = [];
    for (const s of [1, -1]) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), skin); thigh.position.y = -0.35; leg.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 6), skin); shin.position.set(0, -0.85, 0.08); leg.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.34), belly); foot.position.set(0, -1.12, 0.16); leg.add(foot);
      leg.position.set(s * 0.18, 1.15, -0.05); g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0; g.userData.seat = 1.42;
    return g;
  }

  // A towering antlered stag.
  _buildElkSteed() {
    const g = new THREE.Group();
    const m = mountById('elk');
    const hide = litMat({ color: m.color });
    const hide2 = litMat({ color: 0x8a6a44 });
    const antler = litMat({ color: 0xd8c9a4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.05, 6, 12), hide);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.3, 0);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), hide); chest.position.set(0, 1.3, 0.55); chest.scale.set(0.9, 1, 0.8); g.add(chest);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.0, 8), hide); neck.position.set(0, 1.75, 0.8); neck.rotation.x = 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.5), hide2); head.position.set(0, 2.15, 1.15); head.rotation.x = 0.3;
    g.add(body, neck, head);
    // Branching antlers.
    for (const s of [1, -1]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 5), antler); base.position.set(s * 0.1, 2.4, 1.06); base.rotation.z = s * 0.5; g.add(base);
      for (let b = 0; b < 3; b++) {
        const tine = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 5), antler);
        tine.position.set(s * (0.28 + b * 0.06), 2.5 + b * 0.16, 1.06 - b * 0.05); tine.rotation.z = s * 0.9; g.add(tine);
      }
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), hide2); ear.position.set(s * 0.13, 2.28, 1.02); ear.rotation.z = s * 0.6; g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x14100a })); eye.position.set(s * 0.12, 2.18, 1.32); g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hide2); tail.position.set(0, 1.34, -0.95); g.add(tail);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.86), litMat({ color: 0x4a3a5a })); pad.position.set(0, 1.6, 0.05); g.add(pad);
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.46, 4, 8), litMat({ color: 0x3a2a1c })); saddle.rotation.z = Math.PI / 2; saddle.position.set(0, 1.68, 0.05); g.add(saddle);
    const legs = [];
    for (const [lx, lz] of [[0.24, 0.5], [-0.24, 0.5], [0.24, -0.5], [-0.24, -0.5]]) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 1.3, 6), hide); upper.position.y = -0.65; leg.add(upper);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6), litMat({ color: 0x1a140c })); hoof.position.y = -1.28; leg.add(hoof);
      leg.position.set(lx, 1.3, lz); g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0; g.userData.seat = 1.62;
    return g;
  }

  // A long-legged desert strider (camel-like).
  _buildStriderSteed() {
    const g = new THREE.Group();
    const m = mountById('sandstrider');
    const hide = litMat({ color: m.color });
    const hide2 = litMat({ color: 0xb08a3a });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.95, 6, 12), hide);
    body.rotation.z = Math.PI / 2; body.position.set(0, 1.45, 0);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), hide); hump.position.set(0, 1.72, -0.05); hump.scale.set(0.9, 0.8, 0.9); g.add(hump);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), hide); neck.position.set(0, 1.95, 0.7); neck.rotation.x = 0.42;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.44), hide2); head.position.set(0, 2.45, 1.05); head.rotation.x = 0.2;
    g.add(body, neck, head);
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), hide2); ear.position.set(s * 0.08, 2.6, 0.98); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0x1a120a })); eye.position.set(s * 0.1, 2.48, 1.22); g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.7, 5), hide2); tail.position.set(0, 1.4, -0.9); tail.rotation.x = -0.4; g.add(tail);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.8), litMat({ color: 0x7a4a2a })); pad.position.set(0, 1.68, 0.05); g.add(pad);
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 4, 8), litMat({ color: 0x5a3218 })); saddle.rotation.z = Math.PI / 2; saddle.position.set(0, 1.76, 0.1); g.add(saddle);
    const legs = [];
    for (const [lx, lz] of [[0.2, 0.46], [-0.2, 0.46], [0.2, -0.46], [-0.2, -0.46]]) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 1.45, 6), hide); upper.position.y = -0.72; leg.add(upper);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 6), hide2); foot.position.y = -1.42; leg.add(foot);
      leg.position.set(lx, 1.45, lz); g.add(leg); legs.push(leg);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.legs = legs; g.userData.phase = 0; g.userData.seat = 1.78;
    return g;
  }
  // A mount must be EARNED (the base steed from Marathoner, the Slime/Dragon
  // capstone mounts) OR BOUGHT from the Stablemaster (ownedMounts).
  get hasMount() { return this.passives.has('steed') || this.passives.has('slimemount') || this.passives.has('dragonmount') || this.ownedMounts.size > 0; }
  canMount() { return this.hasMount && this.alive && (this.state === 'ground' || this.state === 'air'); }
  // The speed multiplier of the currently-summoned mount (falls back to horse).
  get mountSpeed() { return (MOUNTS[this.mountSkin] || MOUNTS.horse).speed; }
  // Which mounts this hero can currently ride (earned + bought).
  ownedMountList() {
    const owned = new Set(this.ownedMounts);
    if (this.passives.has('steed')) owned.add('horse');
    if (this.passives.has('slimemount')) owned.add('slime');
    if (this.passives.has('dragonmount')) owned.add('dragon');
    return owned;
  }
  ownsMount(skin) { return this.ownedMountList().has(skin); }
  // Buy a mount from the Stablemaster: spends gold, records ownership, summons it.
  buyMount(skin) {
    const m = mountById(skin);
    if (!m || this.ownsMount(skin)) return false;
    if (this.skillLevel('riding') < (m.reqRiding || 1)) return false;
    if (this.gold < m.price) return false;
    this.gold -= m.price;
    this.ownedMounts.add(skin);
    this.setActiveMount(skin);
    return true;
  }
  // Choose which owned mount to ride; rebuilds the steed mesh if it changed.
  setActiveMount(skin) {
    if (!this.ownsMount(skin)) return false;
    this.activeMount = skin;
    this.setMountSkin(skin);
    return true;
  }
  toggleMount() {
    if (this.mounted) { this.dismount(); return false; }
    if (!this.canMount()) return false;
    // Make sure the summoned steed matches the chosen mount.
    if (this.activeMount && this.ownsMount(this.activeMount) && this.mountSkin !== this.activeMount) this.setMountSkin(this.activeMount);
    this.mounted = true; this.steed.visible = true; return true;
  }
  dismount() { this.mounted = false; if (this.steed) this.steed.visible = false; }

  // ---- Crafting pouch (stackable materials) ----
  materialStacks() { return Object.keys(this.materials).length; }
  pouchFull() { return this.materialStacks() >= this.maxMaterials; }
  // Can a material land in the pouch? Existing stacks always grow; a brand-new
  // material type needs a free stack slot.
  canAddMaterial(id) { return (this.materials[id] || 0) > 0 || !this.pouchFull(); }
  // Returns true if stored, false if the pouch is full for a new material type.
  addMaterial(id, n = 1) {
    if (!(n > 0)) return true;
    if (!(this.materials[id] > 0) && this.pouchFull()) return false;
    this.materials[id] = (this.materials[id] || 0) + n;
    return true;
  }
  materialCount(id) { return this.materials[id] || 0; }

  // ---- Bag / pouch upgrades (Quartermaster) ----
  invTier() { return Math.round((this.maxInventory - INV_BASE) / INV_STEP); }
  invAtMax() { return this.maxInventory >= INV_MAX; }
  invUpgradeCost() { return invUpgradeCost(this.invTier()); }
  buyInvUpgrade() {
    if (this.invAtMax()) return false;
    const c = this.invUpgradeCost();
    if (this.gold < c) return false;
    this.gold -= c; this.maxInventory = Math.min(INV_MAX, this.maxInventory + INV_STEP);
    return true;
  }
  matTier() { return Math.round((this.maxMaterials - MAT_BASE) / MAT_STEP); }
  matAtMax() { return this.maxMaterials >= MAT_MAX; }
  matUpgradeCost() { return matUpgradeCost(this.matTier()); }
  buyMatUpgrade() {
    if (this.matAtMax()) return false;
    const c = this.matUpgradeCost();
    if (this.gold < c) return false;
    this.gold -= c; this.maxMaterials = Math.min(MAT_MAX, this.maxMaterials + MAT_STEP);
    return true;
  }
  canAfford(cost) { for (const id in cost) if ((this.materials[id] || 0) < cost[id]) return false; return true; }
  spendMaterials(cost) {
    if (!this.canAfford(cost)) return false;
    for (const id in cost) { this.materials[id] -= cost[id]; if (this.materials[id] <= 0) delete this.materials[id]; }
    return true;
  }

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
      combo: this.comboStep || 0, charging: this.charging,
    });
    this._poseHeldWeapon();
    // Dodge roll: a forward somersault. Pivot at ~waist height (H) so the flip
    // arcs cleanly instead of sweeping through the ground around the feet.
    if (this.dodging) {
      const a = (1 - this.dodgeT) * Math.PI * 2;   // 0 → 2π over the roll
      const H = 1.0;
      this.mesh.rotation.x = a;
      this.mesh.position.y = this.pos.y + H - H * Math.cos(a);
    } else if (this.mesh.rotation.x) {
      this.mesh.rotation.x = 0;
    }
    // Fade stealth out when it expires.
    if (this.stealthUntil && this._clock >= this.stealthUntil) { this.stealthUntil = 0; this.setStealth(false); }

    // Super Saiyan aura: flicker the flame and let the hair shimmer.
    if (this.ssjActive && this.ssjAura) {
      const f = 0.22 + Math.abs(Math.sin(this._clock * 16)) * 0.18;
      this.ssjAura.material.opacity = f;
      this.ssjAura.scale.y = (0.85 + this.ssjLevel * 0.22) * (1 + Math.sin(this._clock * 12) * 0.05);
    }

    // Mount: seat the rider ON the saddle (straddling, hands to the reins) and
    // trot the steed beneath.
    if (this.mounted) {
      const sd = this.steed.userData;
      const seat = sd.seat || (sd.dragon ? 1.55 : sd.slime ? 1.5 : 1.4); // saddle height for this mount
      this.mesh.position.y += seat - 1.0;                   // the rider's hip (local +1) rests at the saddle
      // Sitting pose: thighs forward and splayed to straddle, hands forward on
      // the reins, a slight forward lean — instead of legs dangling straight.
      const rj = this.mesh.userData.joints;
      if (rj) {
        rj.legL.rotation.set(-1.2, 0, 0.34); rj.legR.rotation.set(-1.2, 0, -0.34);
        rj.armL.rotation.set(-0.5, 0, 0.12); rj.armR.rotation.set(-0.5, 0, -0.12);
        rj.torso.rotation.x = 0.14;
      }
      this.steed.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.steed.rotation.y = this.mesh.rotation.y;
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
        this.steed.position.y += 0.35 + Math.sin(sd.phase) * 0.08;
      }
    }
  }

  _regen(dt, sprinting) {
    const s = this.stats;
    // Expire finished consumable buffs.
    if (this.timed.length) this.timed = this.timed.filter((b) => b.until > this._clock);
    // Air refills on land.
    if (this.state !== 'swim') this.air = this.maxAir;
    const pass = this.pass; // always-on class passives (regen bonuses)
    const spWasEmpty = s.sp <= 0.5; // captured BEFORE regen tops it back up
    if (!sprinting && this.state !== 'climb') s.sp = Math.min(this.effMaxSp, s.sp + (8 + pass.spRegen) * dt);
    else if (pass.spRegen) s.sp = Math.min(this.effMaxSp, s.sp + pass.spRegen * dt);
    s.mp = Math.min(this.effMaxMp, s.mp + (1.5 + this.effInt * 0.05 + pass.mpRegen) * dt);
    // Passive HP regen ticks anywhere; the standing-still bonus stacks on top.
    if (pass.hpRegen) s.hp = Math.min(this.effMaxHp, s.hp + pass.hpRegen * dt);
    if (this.state === 'ground' && this._speed01 < 0.1) s.hp = Math.min(this.effMaxHp, s.hp + 2.0 * dt);
    s.sp = Math.max(0, s.sp);
    // Exhaustion: run stamina fully dry and you can't spend ANY until it has
    // recharged all the way back up (no more tapping the last sliver to sprint).
    if (spWasEmpty) this._exhausted = true;
    else if (this._exhausted && s.sp >= this.effMaxSp - 0.5) this._exhausted = false;
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
      learnedPassives: [...this.learnedPassives],
      skills: this.skills,
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
      maxInventory: this.maxInventory,
      maxMaterials: this.maxMaterials,
      materials: this.materials,
      builds: this.builds,
      ownedMounts: [...this.ownedMounts],
      activeMount: this.activeMount,
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
    if (Array.isArray(save.learnedPassives)) { this.learnedPassives = save.learnedPassives.slice(); this._passDirty = true; }
    if (save.skills && typeof save.skills === 'object') {
      for (const s of SKILLS) { const v = save.skills[s.id]; if (v) this.skills[s.id] = { level: Math.min(SKILL_MAX, v.level || 1), xp: v.xp || 0 }; }
      this._skillBonusCache = {};
    }
    if (save.respawn) {
      this.respawn = new THREE.Vector3(save.respawn.x, save.respawn.y, save.respawn.z);
      this.pos.copy(this.respawn);
      this.pos.y = heightAt(this.pos.x, this.pos.z);
    }
    if (save.gear) this.gear = Object.assign(emptyGear(), save.gear);
    if (Array.isArray(save.inventory)) this.inventory = save.inventory;
    if (typeof save.gold === 'number') this.gold = save.gold;
    if (typeof save.maxInventory === 'number') this.maxInventory = Math.max(INV_BASE, Math.min(INV_MAX, save.maxInventory));
    if (typeof save.maxMaterials === 'number') this.maxMaterials = Math.max(MAT_BASE, Math.min(MAT_MAX, save.maxMaterials));
    if (save.materials && typeof save.materials === 'object') this.materials = { ...save.materials };
    if (Array.isArray(save.builds)) this.builds = save.builds.slice();
    if (Array.isArray(save.ownedMounts)) this.ownedMounts = new Set(save.ownedMounts);
    if (typeof save.activeMount === 'string') this.activeMount = save.activeMount;
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
    // Re-summon the mount the player last chose (a bought mount survives reapply,
    // which only restores achievement-granted skins).
    if (this.activeMount && this.ownsMount(this.activeMount)) this.setMountSkin(this.activeMount);
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
    // Learnable passives: an always-on perk you pick like a skill (it doesn't
    // take a hotbar slot). Offered once its level requirement is met.
    const ownedP = new Set(this.learnedPassives);
    for (const pv of passivesFor(this.classId, this.stats.level)) {
      if (!ownedP.has(pv.id)) skills.push({ type: 'passive', id: pv.id, name: pv.name, glyph: pv.glyph, desc: pv.desc });
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
      } else if (skill.type === 'passive') {
        if (!this.learnedPassives.includes(skill.id)) { this.learnedPassives.push(skill.id); this._passDirty = true; }
      }
    }
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
  }

  get clock() { return this._clock; }
  get isStealthed() { return this._clock < this.stealthUntil; }

  // Fade the hero to a translucent shadow while stealthed (rogue Shadowmeld).
  setStealth(on) {
    const setOp = (mat) => { if (!mat) return; mat.transparent = on; mat.opacity = on ? 0.3 : 1; };
    const m = this.mesh && this.mesh.userData.mats;
    if (m) { setOp(m.body); setOp(m.accent); setOp(m.hair); }
    if (this.mesh) this.mesh.traverse((o) => {
      if (o.isMesh && o.material && (o.material.type === 'MeshLambertMaterial' || o.material.type === 'MeshToonMaterial')) setOp(o.material);
    });
  }
}
