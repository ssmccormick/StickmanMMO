// ============================================================
// Weapon meshes: a recognizable little model per weapon kind (sword, axe,
// mace, dagger, bow, staff, wand), built grip-at-origin with the length
// running along +Y so it mounts on the hand exactly like the old weapon
// stick. `color` tints the business end (blade/head/orb) by rarity.
// ============================================================
import * as THREE from 'three';
import { litMat } from './gfx.js';

// Which weapon kinds attack at range (fire a projectile) vs. in melee.
export function isRangedWeaponKind(kind) {
  return kind === 'staff' || kind === 'wand' || kind === 'bow' || kind === 'crossbow'
    || kind === 'throwknife' || kind === 'throwaxe' || kind === 'revolver' || kind === 'rifle';
}

// Per-kind auto-attack profile when this weapon is the one in hand. `ranged`
// flips melee classes to firing projectiles; the rest tune the shot.
export const WEAPON_PROFILE = {
  sword:    { ranged: false },
  axe:      { ranged: false },
  mace:     { ranged: false },
  dagger:   { ranged: false },
  staff:    { ranged: true, shape: 'orb',   speed: 24, range: 16 },
  wand:     { ranged: true, shape: 'orb',   speed: 26, range: 15 },
  bow:      { ranged: true, shape: 'arrow', speed: 34, range: 19 },
  crossbow: { ranged: true, shape: 'arrow', speed: 42, range: 22 },
  throwknife: { ranged: true, shape: 'blade', speed: 30, range: 13 },
  throwaxe:   { ranged: true, shape: 'blade', speed: 22, range: 11 },
  // Guns: fast, flat-shooting tracer rounds. The rifle reaches further.
  revolver: { ranged: true, shape: 'bullet', speed: 54, range: 18, projColor: 0xffe08a },
  rifle:    { ranged: true, shape: 'bullet', speed: 66, range: 26, projColor: 0xfff0b0 },
};

// How each weapon kind RESTS in the hand (local to the right arm). Poles are
// held upright and a little out from the body; ranged kinds thrust forward when
// attacking (see Player._poseHeldWeapon). Shared by the local player and, for
// synced multiplayer, the remote-player renderer.
export const WEAPON_HOLD = {
  staff:    { pos: [-0.07, -0.82, 0.1], rot: [0.18, 0, -0.13] },
  wand:     { pos: [-0.05, -0.62, 0.1], rot: [0.2, 0, -0.1] },
  bow:      { pos: [-0.05, -0.66, 0.1], rot: [0.05, 0, -0.05] },
  crossbow: { pos: [-0.05, -0.62, 0.12], rot: [0.1, 0, 0] },
  throwknife: { pos: [0, -0.56, 0.04], rot: [0.1, 0, -0.1] },
  throwaxe:   { pos: [0, -0.6, 0.04], rot: [0.1, 0, -0.1] },
  revolver: { pos: [-0.02, -0.6, 0.05], rot: [0.15, 0, 0] },   // pistol, held forward
  rifle:    { pos: [-0.04, -0.66, 0.1], rot: [0.08, 0, 0] },   // long gun, levelled
  dagger:   { pos: [0, -0.56, 0.06], rot: [-1.28, 0, 0.08] },    // gripped, point levelled forward & slightly up
  axe:      { pos: [0, -0.6, 0.06], rot: [-1.12, 0, 0.1] },      // head leads, extended forward & angled up
  default:  { pos: [0, -0.6, 0.06], rot: [-1.32, 0, 0.06] },     // sword/mace, extended forward, slightly angled up
};

// ---- Weapon skins: recolour a weapon's materials without changing its shape.
// A skin overrides some of steel/glow/wood/dark/gold; unset fields fall back to
// the rarity tint (steel/glow) or the natural material colour. Chosen per
// character (appearance.weaponSkin) and applied to whatever weapon is held.
export const WEAPON_SKINS = [
  { id: 'default',  name: 'Standard',   glyph: '⚙️' },
  { id: 'gilded',   name: 'Gilded',     glyph: '🪙', steel: 0xffd24a, glow: 0xffe27a, gold: 0xfff0b0 },
  { id: 'obsidian', name: 'Obsidian',   glyph: '⬛', steel: 0x2b2b34, glow: 0x6a6a82, wood: 0x1a1a1f, gold: 0x55555f },
  { id: 'crystal',  name: 'Crystal',    glyph: '🔷', steel: 0x9fe6ff, glow: 0xcdf2ff, gold: 0xcfefff },
  { id: 'ember',    name: 'Ember',      glyph: '🔥', steel: 0xff6a2a, glow: 0xffb24a, wood: 0x3a1a10, gold: 0xff8a3a },
  { id: 'frost',    name: 'Frostbrand', glyph: '❄️', steel: 0xbfeaff, glow: 0xe6f7ff, wood: 0x2a3a44, gold: 0xd0f0ff },
  { id: 'verdant',  name: 'Verdant',    glyph: '🌿', steel: 0x6fae54, glow: 0x9bd86a, wood: 0x3a5a2a, gold: 0x8fca6a },
  { id: 'void',     name: 'Voidsteel',  glyph: '🟣', steel: 0x8a2abf, glow: 0xb05aff, wood: 0x201030, gold: 0xc06bff },
];
export const WEAPON_SKIN_BY_ID = Object.fromEntries(WEAPON_SKINS.map((s) => [s.id, s]));

export function buildWeaponMesh(kind, color = 0xcfd2da, skin = null) {
  // Resolve a skin (id or object) into material colour overrides. Unset fields
  // keep the rarity tint (steel/glow) or the natural material colour.
  const sk = skin && typeof skin === 'object' ? skin
    : (skin && skin !== 'default' ? WEAPON_SKIN_BY_ID[skin] : null);
  const pick = (v, d) => (sk && sk[v] != null ? sk[v] : d);
  const g = new THREE.Group();
  const steel = litMat({ color: pick('steel', color) });
  const glow = new THREE.MeshBasicMaterial({ color: pick('glow', color) });
  const wood = litMat({ color: pick('wood', 0x6a4a2a) });
  const dark = litMat({ color: pick('dark', 0x33333a) });
  const gold = litMat({ color: pick('gold', 0xc9a227) });
  const add = (geo, mat, x, y, z, rot) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(m); return m;
  };

  // Local position of each weapon's "business end" — where attacks emanate from
  // (blade point / mace head / staff orb / bow front). Filled per kind below.
  let tip = [0, 0.9, 0];

  switch (kind) {
    case 'axe': {
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 6), wood, 0, 0.32, 0);
      // A wedge head: a box scaled to a blade, biting forward (+Z).
      const head = add(new THREE.BoxGeometry(0.05, 0.3, 0.36), steel, 0, 0.66, 0.13);
      head.geometry.translate(0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.3, 0.05), steel, 0, 0.66, -0.05); // back spike
      tip = [0, 0.7, 0.28];
      break;
    }
    case 'mace': {
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 6), wood, 0, 0.3, 0);
      add(new THREE.IcosahedronGeometry(0.15, 0), steel, 0, 0.68, 0);
      for (const [x, y, z] of [[0.17, 0.68, 0], [-0.17, 0.68, 0], [0, 0.68, 0.17], [0, 0.68, -0.17], [0, 0.85, 0]]) {
        const r = x ? [0, 0, Math.PI / 2] : z ? [Math.PI / 2, 0, 0] : [0, 0, 0];
        add(new THREE.ConeGeometry(0.045, 0.12, 4), steel, x, y, z, r);
      }
      tip = [0, 0.9, 0];
      break;
    }
    case 'dagger': {
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), dark, 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.16, 0.035, 0.05), gold, 0, 0.17, 0);
      add(new THREE.ConeGeometry(0.05, 0.38, 4), steel, 0, 0.38, 0); // short blade
      tip = [0, 0.57, 0];
      break;
    }
    case 'bow': {
      // A vertical C-curve with a drawn string.
      const limb = add(new THREE.TorusGeometry(0.42, 0.022, 6, 16, Math.PI * 1.05), wood, 0, 0.34, 0, [0, 0, -Math.PI * 0.52]);
      limb.scale.z = 0.6;
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.72, 4), dark, 0.0, 0.34, 0); // string
      tip = [0, 0.34, 0.12]; // arrow leaves from the front of the bow
      break;
    }
    case 'staff': {
      add(new THREE.CylinderGeometry(0.038, 0.045, 1.1, 6), wood, 0, 0.52, 0);
      // Claw prongs cradling a glowing orb.
      for (const a of [0, 1, 2]) {
        const ang = (a / 3) * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4), gold, Math.cos(ang) * 0.07, 1.05, Math.sin(ang) * 0.07, [Math.sin(ang) * 0.6, 0, -Math.cos(ang) * 0.6]);
      }
      add(new THREE.IcosahedronGeometry(0.11, 0), glow, 0, 1.13, 0);
      tip = [0, 1.2, 0]; // the glowing orb at the head of the staff
      break;
    }
    case 'wand': {
      add(new THREE.CylinderGeometry(0.022, 0.03, 0.5, 6), dark, 0, 0.22, 0);
      add(new THREE.IcosahedronGeometry(0.07, 0), glow, 0, 0.5, 0);
      tip = [0, 0.56, 0]; // the gem at the wand's tip
      break;
    }
    case 'crossbow': {
      add(new THREE.BoxGeometry(0.06, 0.55, 0.05), wood, 0, 0.28, 0);           // stock
      add(new THREE.BoxGeometry(0.62, 0.04, 0.05), dark, 0, 0.5, 0);            // bow limbs (horizontal)
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), steel, 0, 0.5, 0, [0, 0, Math.PI / 2]); // string
      add(new THREE.ConeGeometry(0.04, 0.18, 4), steel, 0, 0.62, 0);            // loaded bolt tip
      tip = [0, 0.72, 0];
      break;
    }
    case 'throwknife': {
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 6), dark, 0, 0.06, 0); // handle
      add(new THREE.BoxGeometry(0.04, 0.03, 0.05), gold, 0, 0.13, 0);           // guard
      add(new THREE.ConeGeometry(0.04, 0.28, 4), steel, 0, 0.3, 0);             // blade
      tip = [0, 0.45, 0];
      break;
    }
    case 'throwaxe': {
      add(new THREE.CylinderGeometry(0.03, 0.034, 0.5, 6), wood, 0, 0.22, 0);   // short haft
      add(new THREE.BoxGeometry(0.05, 0.22, 0.28), steel, 0, 0.46, 0.09);       // head
      tip = [0, 0.48, 0.22];
      break;
    }
    case 'revolver': {
      add(new THREE.BoxGeometry(0.055, 0.17, 0.05), wood, 0, 0.06, -0.03, [0.3, 0, 0]); // grip (down/back)
      add(new THREE.BoxGeometry(0.06, 0.11, 0.14), steel, 0, 0.17, 0.02);               // frame
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10), steel, 0, 0.17, 0.02, [Math.PI / 2, 0, 0]); // cylinder
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 8), steel, 0, 0.2, 0.18, [Math.PI / 2, 0, 0]); // barrel (forward)
      tip = [0, 0.2, 0.33]; // muzzle
      break;
    }
    case 'rifle': {
      add(new THREE.BoxGeometry(0.05, 0.13, 0.1), wood, 0, 0.09, -0.13, [0.15, 0, 0]);  // stock
      add(new THREE.BoxGeometry(0.05, 0.09, 0.42), wood, 0, 0.14, 0.07);                // body
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.52, 8), steel, 0, 0.18, 0.22, [Math.PI / 2, 0, 0]); // long barrel
      add(new THREE.BoxGeometry(0.02, 0.03, 0.06), steel, 0, 0.22, 0.12);               // sight
      tip = [0, 0.18, 0.48]; // muzzle
      break;
    }
    case 'sword':
    default: {
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 6), dark, 0, 0.09, 0); // grip
      add(new THREE.SphereGeometry(0.04, 6, 5), gold, 0, 0.0, 0);               // pommel
      add(new THREE.BoxGeometry(0.24, 0.045, 0.05), gold, 0, 0.2, 0);            // crossguard
      add(new THREE.BoxGeometry(0.075, 0.6, 0.022), steel, 0, 0.52, 0);          // blade
      add(new THREE.ConeGeometry(0.038, 0.12, 4), steel, 0, 0.88, 0);            // tip
      tip = [0, 0.96, 0];
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.tip = tip;
  return g;
}

// Build a weapon already posed in its resting hold, ready to add to a stickman's
// right arm. Shared by the local player and the remote-player renderer so both
// hold weapons identically.
export function buildHeldWeapon(kind, color, skin) {
  const wm = buildWeaponMesh(kind, color, skin);
  const h = WEAPON_HOLD[kind] || WEAPON_HOLD.default;
  wm.position.set(h.pos[0], h.pos[1], h.pos[2]);
  wm.rotation.set(h.rot[0], h.rot[1], h.rot[2]);
  return wm;
}
