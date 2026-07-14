// ============================================================
// Worn-gear visuals. Turns a character's equipped armor into little 3D pieces
// (helm, pauldrons, chestplate, cape, gauntlets, boots) attached to the
// stickman's ANIMATED joints, so gauntlets swing with the arms, boots stride
// with the legs, and everything scales with the character's chosen size/build.
//
// Coloured by item rarity (or set colour). Shared by the local player and, over
// the network, by other players — so everyone sees everyone's gear.
//
// A "gear visual" is a compact, JSON-friendly description (so it can be sent to
// the server):  { head, shoulders, chest, back, hands, feet }, each either null
// or { b: baseId, r: rarity, s: setId|null }.
// ============================================================
import * as THREE from 'three';
import { litMat } from './gfx.js';
import { RARITY, SETS } from './items.js';

// Resolve a piece's colour: the set colour if it belongs to one, else the
// rarity tint. Cloth pieces get a slightly deeper tone so they don't look metal.
function pieceColor(piece, cloth = false) {
  const rar = RARITY[piece.r] || RARITY.common;
  let hex = rar.hex;
  if (piece.s && SETS[piece.s] && SETS[piece.s].color) {
    const c = SETS[piece.s].color.replace('#', '');
    const n = parseInt(c, 16);
    if (isFinite(n)) hex = n;
  }
  if (cloth) {
    // Darken ~25% for a fabric look.
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    hex = (Math.round(r * 0.7) << 16) | (Math.round(g * 0.7) << 8) | Math.round(b * 0.7);
  }
  return hex;
}

const isCloth = (baseId) => ['hood', 'robe', 'tunic', 'cape', 'cloak', 'mantle', 'gloves', 'sandals'].includes(baseId);

function mat(hex) { return litMat({ color: hex }); }
const trimMat = () => litMat({ color: 0xc9a227 });

// ---- Per-slot builders. Each returns a Group posed in the parent joint's
// local space (the caller attaches it to the right joint). ----

function buildHead(piece) {
  const g = new THREE.Group();
  const m = mat(pieceColor(piece, isCloth(piece.b)));
  const HR = 0.28;
  if (piece.b === 'crown') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(HR * 1.02, HR * 1.02, 0.08, 16, 1, true), trimMat());
    band.position.y = 0.14; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), trimMat());
      spike.position.set(Math.cos(a) * HR, 0.24, Math.sin(a) * HR); g.add(spike);
    }
  } else if (piece.b === 'hood') {
    // A cloth hood: a cap draping down the back of the head.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HR * 1.16, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), m);
    cap.position.y = 0.03; g.add(cap);
    const drape = new THREE.Mesh(new THREE.ConeGeometry(HR * 1.1, 0.34, 10), m);
    drape.position.set(0, -0.02, -0.14); drape.rotation.x = -0.35; g.add(drape);
  } else {
    // A metal helm: a cap with a small nose/brow guard.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HR * 1.12, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.58), m);
    cap.position.y = 0.05; g.add(cap);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(HR * 1.9, 0.06, 0.05), m);
    brow.position.set(0, 0.06, HR * 0.92); g.add(brow);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), m);
    nose.position.set(0, -0.05, HR * 1.0); g.add(nose);
  }
  return g;
}

function buildChest(piece, build) {
  const g = new THREE.Group();
  const cloth = isCloth(piece.b);
  const m = mat(pieceColor(piece, cloth));
  // A shell around the torso (torso spans ~y 0.05..0.65 in hip space).
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.5, 10), m);
  shell.position.y = 0.36; g.add(shell);
  if (piece.b === 'robe') {
    // A long skirt flaring to the knees.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.6, 10, 1, true), m);
    skirt.position.y = -0.14; g.add(skirt);
  } else if (piece.b === 'plate') {
    // Raised trim + a gorget for a heavier plated look.
    const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 10), trimMat());
    gorget.position.y = 0.58; g.add(gorget);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 10), trimMat());
    belt.position.y = 0.14; g.add(belt);
  }
  g.scale.set(build, 1, build);
  return g;
}

function buildShoulder(piece, side) {
  const g = new THREE.Group();
  const m = mat(pieceColor(piece, isCloth(piece.b)));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
  g.add(dome);
  if (piece.b === 'pauldrons') {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), trimMat());
    spike.position.set(0.09 * side, 0.06, 0); spike.rotation.z = -side * 0.5; g.add(spike);
  }
  return g;
}

function buildCape(piece) {
  const g = new THREE.Group();
  const m = litMat({ color: pieceColor(piece, true), side: THREE.DoubleSide });
  // A cloth panel hanging from the shoulders down the back, flaring at the hem.
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.95, 10, 1, true, Math.PI * 0.72, Math.PI * 0.56), m);
  cape.position.set(0, 0.18, -0.14); cape.rotation.x = -0.12; g.add(cape);
  // A collar clasp at the top.
  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), trimMat());
  clasp.position.set(0, 0.6, -0.06); g.add(clasp);
  return g;
}

function buildGauntlet(piece, limb) {
  const g = new THREE.Group();
  const m = mat(pieceColor(piece, isCloth(piece.b)));
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), m);
  g.add(cuff);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7), m);
  fist.position.y = -0.14; g.add(fist);
  g.scale.set(Math.max(1, limb), 1, Math.max(1, limb));
  return g;
}

function buildBoot(piece, limb) {
  const g = new THREE.Group();
  const m = mat(pieceColor(piece, isCloth(piece.b)));
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 8), m);
  g.add(shin);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.26), m);
  foot.position.set(0, -0.13, 0.06); g.add(foot);
  g.scale.set(Math.max(1, limb), 1, Math.max(1, limb));
  return g;
}

// Compact signature so we only rebuild when the worn set actually changes.
function sig(v) {
  const p = (x) => (x ? `${x.b}:${x.r}:${x.s || ''}` : '-');
  return [p(v.head), p(v.shoulders), p(v.chest), p(v.back), p(v.hands), p(v.feet)].join('|');
}

// Remove & dispose the armor currently attached to a stickman.
export function clearArmorVisual(root) {
  const cur = root.userData.armor;
  if (!cur) return;
  for (const { obj, parent } of cur.meshes) {
    parent.remove(obj);
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  root.userData.armor = null;
}

// Rebuild a stickman's worn armor from a gear visual. `app` supplies build/limb
// so pieces fit the character's proportions (overall size comes from the root
// scale automatically). Cheap no-op when the set is unchanged.
export function applyArmorVisual(root, visual, app = {}) {
  const j = root.userData && root.userData.joints;
  if (!j) return;
  const v = visual || {};
  const key = sig(v);
  if (root.userData.armor && root.userData.armor.key === key) return;
  clearArmorVisual(root);

  const build = app.build || 1;
  const limb = app.limb || 1;
  const meshes = [];
  const attach = (obj, parent, x, y, z) => {
    obj.position.set(x, y, z);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    parent.add(obj);
    meshes.push({ obj, parent });
  };

  if (v.head && j.head) attach(buildHead(v.head), j.head, 0, 0, 0);
  if (v.chest && j.hip) attach(buildChest(v.chest, build), j.hip, 0, 0, 0);
  if (v.back && j.hip) attach(buildCape(v.back), j.hip, 0, 0.05, -0.02);
  if (v.shoulders && j.hip) {
    attach(buildShoulder(v.shoulders, 1), j.hip, 0.2 * build, 0.66, 0);
    attach(buildShoulder(v.shoulders, -1), j.hip, -0.2 * build, 0.66, 0);
  }
  if (v.hands) {
    if (j.armL) attach(buildGauntlet(v.hands, limb), j.armL, 0, -0.6, 0);
    if (j.armR) attach(buildGauntlet(v.hands, limb), j.armR, 0, -0.6, 0);
  }
  if (v.feet) {
    if (j.legL) attach(buildBoot(v.feet, limb), j.legL, 0, -0.66, 0);
    if (j.legR) attach(buildBoot(v.feet, limb), j.legR, 0, -0.66, 0);
  }

  root.userData.armor = { key, meshes };
}
