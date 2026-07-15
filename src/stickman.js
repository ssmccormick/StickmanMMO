// ============================================================
// Stickman mesh: a simple articulated figure built from cylinders
// and a sphere head. Shared by the player, other players, and
// enemies. Exposes joint references so the animator can pose it
// (walk cycle, attack swing, climbing, death flop).
// ============================================================
import * as THREE from 'three';
import { litMat } from './gfx.js';

// Reusable geometries (created once, shared across every stickman).
const G = {
  head: new THREE.SphereGeometry(0.28, 12, 10),
  limb: new THREE.CylinderGeometry(0.07, 0.07, 1, 6),
  torso: new THREE.CylinderGeometry(0.12, 0.1, 1, 7),
};

// Articulated limb proportions. Arms bend at an elbow (upper + forearm) and legs
// at a knee (thigh + calf) with a foot — so the walk/idle/attack animator can
// drive real joints instead of swinging one rigid stick.
export const RIG = { armUpper: 0.34, armLower: 0.30, thigh: 0.52, calf: 0.48 };

// One tapered bone: a Group that pivots at its TOP, with the bar shifted down so
// it rotates from the shoulder/hip/elbow/knee. `isLimbBar` tags it for the
// thickness (limb) scaling in applyAppearance.
function segment(mat, len) {
  const bar = new THREE.Mesh(G.limb, mat);
  bar.scale.set(1, len, 1);
  bar.position.y = -len / 2;
  bar.userData.isLimbBar = true;
  const g = new THREE.Group();
  g.add(bar);
  g.userData.bar = bar; g.userData.len = len;
  return g;
}
// Upper arm → forearm → hand (the weapon/gauntlet mount point).
function buildArm(mat) {
  const upper = segment(mat, RIG.armUpper);
  const fore = segment(mat, RIG.armLower); fore.position.y = -RIG.armUpper; upper.add(fore);
  const hand = new THREE.Group(); hand.position.y = -RIG.armLower; fore.add(hand);
  upper.userData.lower = fore; upper.userData.hand = hand;
  return upper;
}
// Thigh → calf → foot (the boot mount point).
function buildLeg(mat) {
  const thigh = segment(mat, RIG.thigh);
  const calf = segment(mat, RIG.calf); calf.position.y = -RIG.thigh; thigh.add(calf);
  const foot = new THREE.Group(); foot.position.y = -RIG.calf; calf.add(foot);
  const fm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), mat); fm.position.set(0, -0.02, 0.06);
  foot.add(fm);
  thigh.userData.lower = calf; thigh.userData.foot = foot;
  return thigh;
}

// Normalise the various ways createStickman is called into one appearance
// object. Enemies/other players pass {color, accent, scale}; the player passes
// a full {appearance}. Either way we end up with the same fields.
function resolveAppearance({ color, accent, scale, appearance }) {
  if (appearance) return appearance;
  return {
    bodyColor: color != null ? color : 0x9aa4b2,
    accentColor: accent != null ? accent : 0xd8423c,
    hairColor: 0x3a2a1a,
    size: scale != null ? scale : 1,
    build: 1, headSize: 1, limb: 1,
    hair: 'none',          // only the player wears hair; enemies stay bald + crest
  };
}

export function createStickman(opts = {}) {
  const app = resolveAppearance(opts);
  const root = new THREE.Group();
  const bodyMat = litMat({ color: app.bodyColor });
  const accentMat = litMat({ color: app.accentColor });
  const hairMat = litMat({ color: app.hairColor });

  // Hip is the animation root; everything hangs off it.
  const hip = new THREE.Group();
  hip.position.y = 1.0;
  root.add(hip);

  // Torso
  const torso = new THREE.Mesh(G.torso, bodyMat);
  torso.scale.y = 0.7;
  torso.position.y = 0.35;
  hip.add(torso);

  // Head
  const head = new THREE.Mesh(G.head, bodyMat);
  head.position.y = 0.92;
  hip.add(head);

  // A little accent "crest" so classes are visually distinct.
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 6), accentMat);
  crest.position.y = 1.2;
  hip.add(crest);

  // Shoulders origin. Arms bend at the elbow (upper + forearm + hand).
  const shoulderY = 0.66;
  const armL = buildArm(accentMat); armL.position.set(0.18, shoulderY, 0);
  const armR = buildArm(accentMat); armR.position.set(-0.18, shoulderY, 0);
  hip.add(armL, armR);

  // Legs from the hip bend at the knee (thigh + calf + foot). Thigh+calf = 1.0,
  // so with the hip at y=1.0 the ankle lands at y≈0 (feet on the ground).
  const legL = buildLeg(bodyMat); legL.position.set(0.1, 0, 0);
  const legR = buildLeg(bodyMat); legR.position.set(-0.1, 0, 0);
  hip.add(legL, legR);

  // A held "weapon" stick in the right HAND (end of the forearm). Uses its OWN
  // material (cloned) so recolouring it by gear rarity doesn't tint the arms.
  const weapon = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), accentMat.clone());
  weapon.position.y = -0.02; weapon.rotation.z = Math.PI / 2.5;
  armR.userData.hand.add(weapon);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  // Bundle joint refs + materials + per-instance animation phase on the group.
  // Upper joints keep their original names; lower/hand/foot joints are new.
  root.userData.joints = {
    hip, torso, head, crest,
    armL, armR, legL, legR,
    armLlo: armL.userData.lower, armRlo: armR.userData.lower,
    handL: armL.userData.hand, handR: armR.userData.hand,
    legLlo: legL.userData.lower, legRlo: legR.userData.lower,
    footL: legL.userData.foot, footR: legR.userData.foot,
    weapon, hair: null,
  };
  root.userData.mats = { body: bodyMat, accent: accentMat, hair: hairMat };
  root.userData.anim = { phase: Math.random() * Math.PI * 2, attack: 0, climb: 0 };

  applyAppearance(root, app); // colours/proportions/hair from the resolved look
  return root;
}

// Re-apply an appearance to an EXISTING stickman in place: recolour materials,
// rescale proportions, and rebuild the hairpiece. Used at creation and whenever
// the player changes their look at a wardrobe.
export function applyAppearance(root, app) {
  const j = root.userData.joints, m = root.userData.mats;
  if (!j || !m) return;
  root.userData.appearance = app;

  m.body.color.setHex(app.bodyColor);
  m.accent.color.setHex(app.accentColor);
  m.hair.color.setHex(app.hairColor);

  root.scale.setScalar(app.size);
  j.torso.scale.set(app.build, 0.7, app.build);
  j.head.scale.setScalar(app.headSize);
  // Limb thickness: scale only the bars' x/z (every segment) so hands, feet and
  // joint pivots — which drive animation — keep their normal proportions.
  for (const limb of [j.armL, j.armR, j.legL, j.legR]) {
    limb.traverse((o) => { if (o.userData.isLimbBar) { o.scale.x = app.limb; o.scale.z = app.limb; } });
  }

  // Rebuild hair only when the STYLE changes. Colour tweaks just recolour the
  // shared hair material in place (above); proportion tweaks don't touch hair.
  // This matters because the wardrobe fires applyAppearance on every slider
  // drag — rebuilding (and leaking) a hairpiece each frame would bloat GPU
  // memory. When we do rebuild, dispose the old piece's geometry/materials.
  if (root.userData.hairStyle !== app.hair) {
    if (j.hair) { disposeHair(j.hair, m); j.head.remove(j.hair); j.hair = null; }
    const hair = buildHair(app.hair, m.hair);
    if (hair) { j.head.add(hair); j.hair = hair; }
    root.userData.hairStyle = app.hair;
  }
}

// Free a discarded hairpiece's GPU resources. Geometries are always unique to
// the piece, but base styles share the figure's hair material — never dispose
// the shared body/accent/hair materials, only the cosmetic-specific ones.
function disposeHair(group, mats) {
  const keep = new Set([mats.body, mats.accent, mats.hair]);
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !keep.has(o.material)) o.material.dispose();
  });
}

// Build a hairpiece Group positioned relative to the HEAD centre (head radius
// ≈ 0.28, "up" = +y). Most styles tint with the hair material; a few cosmetics
// carry their own fixed colours (gold halo/crown, etc.).
export function buildHair(style, mat) {
  if (!style || style === 'none') return null;
  const g = new THREE.Group();
  const HR = 0.28;
  const gold = () => litMat({ color: 0xffd24a });
  const dark = () => litMat({ color: 0x1a1a1f });
  const cap = (rMul, thetaLen, yOff, mtl) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(HR * rMul, 14, 9, 0, Math.PI * 2, 0, Math.PI * thetaLen), mtl || mat);
    c.position.y = yOff; return c;
  };
  const spike = (x, y, z, rx, rz, len, r = 0.06, mtl) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), mtl || mat);
    c.position.set(x, y, z); c.rotation.x = rx; c.rotation.z = rz; return c;
  };

  switch (style) {
    case 'buzz':
      g.add(cap(1.02, 0.5, 0.02));
      break;
    case 'short':
      g.add(cap(1.08, 0.62, 0.02));
      break;
    case 'spiky': {
      g.add(cap(1.04, 0.5, 0.02));
      const defs = [
        [0, 0.24, 0, -0.1, 0, 0.34], [0.16, 0.2, 0.02, 0.0, 0.6, 0.3],
        [-0.16, 0.2, 0.02, 0.0, -0.6, 0.3], [0.1, 0.2, -0.16, 0.6, 0.3, 0.3],
        [-0.1, 0.2, -0.16, 0.6, -0.3, 0.3], [0.1, 0.2, 0.16, -0.6, 0.3, 0.28],
        [-0.1, 0.2, 0.16, -0.6, -0.3, 0.28],
      ];
      for (const d of defs) g.add(spike(...d));
      break;
    }
    case 'mohawk': {
      const zs = [-0.18, -0.09, 0, 0.09, 0.18];
      const hs = [0.26, 0.36, 0.42, 0.36, 0.24];
      zs.forEach((z, i) => g.add(spike(0, 0.22 + hs[i] * 0.25, z, 0, 0, hs[i], 0.07)));
      break;
    }
    case 'long': {
      g.add(cap(1.08, 0.7, 0.02));
      // two locks down the back to shoulder length
      for (const x of [-0.13, 0.13]) {
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6), mat);
        lock.position.set(x, -0.22, -0.16); lock.rotation.x = -0.25; g.add(lock);
      }
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.55, 7), mat);
      back.position.set(0, -0.24, -0.2); back.rotation.x = -0.2; g.add(back);
      break;
    }
    case 'ponytail': {
      g.add(cap(1.06, 0.55, 0.02));
      const tie = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
      tie.position.set(0, 0.12, -0.26); g.add(tie);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 6), mat);
      tail.position.set(0, -0.05, -0.42); tail.rotation.x = -1.1; g.add(tail);
      break;
    }
    case 'afro': {
      const a = new THREE.Mesh(new THREE.SphereGeometry(HR * 1.55, 14, 12), mat);
      a.position.y = 0.12; a.scale.y = 0.95; g.add(a);
      break;
    }
    case 'braids': {
      g.add(cap(1.06, 0.55, 0.02));
      for (const x of [-0.2, 0.2]) {
        for (let i = 0; i < 3; i++) {
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), mat);
          bead.position.set(x, 0.02 - i * 0.13, -0.04); g.add(bead);
        }
      }
      break;
    }
    // ---- cosmetics ----
    case 'horns': {
      g.add(cap(1.03, 0.5, 0.02, dark()));
      for (const s of [-1, 1]) g.add(spike(0.16 * s, 0.2, -0.02, -0.3, s * 0.7, 0.42, 0.08, dark()));
      break;
    }
    case 'halo': {
      g.add(cap(1.04, 0.5, 0.02));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), gold());
      ring.position.y = 0.5; ring.rotation.x = Math.PI / 2; g.add(ring);
      break;
    }
    case 'crown': {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(HR * 1.02, HR * 1.02, 0.1, 16, 1, true), gold());
      band.position.y = 0.18; g.add(band);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(spike(Math.cos(a) * HR, 0.3, Math.sin(a) * HR, 0, 0, 0.16, 0.04, gold()));
      }
      break;
    }
    case 'cowboyhat': {
      const felt = litMat({ color: 0x6b4a2a });
      const band = litMat({ color: 0x2a2018 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.03, 20), felt);
      brim.position.y = 0.16; brim.scale.z = 1.12; g.add(brim);          // wide oval brim
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.3, 16), felt);
      crown.position.y = 0.31; g.add(crown);
      const crease = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.3, 0.34), felt);
      crease.position.y = 0.33; g.add(crease);                            // centre pinch ridge
      const hatband = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.275, 0.06, 16), band);
      hatband.position.y = 0.2; g.add(hatband);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), litMat({ color: 0xc9a227 }));
      buckle.position.set(0, 0.2, 0.275); g.add(buckle);
      break;
    }
    case 'tophat': {
      const m2 = dark();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18), m2);
      brim.position.y = 0.2; g.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18), m2);
      top.position.y = 0.42; g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.08, 18), litMat({ color: 0xd83c3c }));
      band.position.y = 0.27; g.add(band);
      break;
    }
    case 'antennae': {
      for (const s of [-1, 1]) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5), mat);
        stalk.position.set(0.1 * s, 0.4, 0); stalk.rotation.z = s * 0.3; g.add(stalk);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fe0ff }));
        bulb.position.set(0.16 * s, 0.55, 0); g.add(bulb);
      }
      break;
    }
    case 'flame': {
      const fm = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
      const defs = [[0, 0.26, 0, 0, 0, 0.5], [0.13, 0.22, -0.02, 0.1, 0.4, 0.4], [-0.13, 0.22, -0.02, 0.1, -0.4, 0.4],
        [0.07, 0.22, -0.14, 0.5, 0.2, 0.38], [-0.07, 0.22, -0.14, 0.5, -0.2, 0.38]];
      for (const d of defs) g.add(spike(...d, 0.06, fm));
      break;
    }
    case 'frost': {
      const fm = new THREE.MeshBasicMaterial({ color: 0xbfeaff });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.add(spike(Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18, 0, 0, 0.26 + (i % 2) * 0.12, 0.04, fm));
      }
      break;
    }
    case 'vines': {
      const vm = litMat({ color: 0x4a7a3a });
      const band = new THREE.Mesh(new THREE.TorusGeometry(HR * 1.02, 0.05, 8, 18), vm);
      band.position.y = 0.16; band.rotation.x = Math.PI / 2; g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), vm);
        leaf.position.set(Math.cos(a) * HR, 0.26, Math.sin(a) * HR); leaf.rotation.x = -0.5; g.add(leaf);
      }
      break;
    }
    default:
      g.add(cap(1.08, 0.62, 0.02));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Pose a stickman for this frame.
//   speed01: 0..1 how fast it's moving (drives walk cycle)
//   dt: seconds, state: { attack, climbing, dead, airborne }
export function animateStickman(group, dt, { speed01 = 0, attack = 0, climbing = false, airborne = false, dead = false, emote = null, combo = 0, charging = false } = {}) {
  const a = group.userData.anim;
  const j = group.userData.joints;

  if (dead) {
    // Flop: rotate whole figure onto the ground.
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -Math.PI / 2, Math.min(1, dt * 6));
    return;
  }
  group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, Math.min(1, dt * 8));

  // The walk phase only advances while actually moving — otherwise the legs
  // would keep pumping in place. A slow, always-running "breath" clock drives
  // the idle bob so a standing figure still feels alive without stepping.
  const moving = speed01 > 0.06;
  if (moving) a.phase += dt * (4 + speed01 * 10);
  a.idle = (a.idle || 0) + dt;
  const swing = Math.sin(a.phase) * (speed01 * 0.85); // amplitude ∝ speed (0 at rest)

  // Emotes override the pose with a brief, looping bit of body language.
  if (emote && speed01 < 0.05) {
    poseEmote(group, j, a, emote);
    return;
  }

  const K = Math.min(1, dt * 10); // easing factor toward a target pose
  const L = (o, k, v) => { o[k] = THREE.MathUtils.lerp(o[k], v, K); }; // ease a channel

  // ---- Lower body + off-hand: climb / walk / idle ----
  if (climbing) {
    // Reach up alternately, hauling with bent arms and driving with bent knees.
    const c = Math.sin(a.phase * 1.4);
    j.armL.rotation.x = -2.3 + c * 0.6; j.armR.rotation.x = -2.3 - c * 0.6;
    j.armLlo.rotation.x = -(0.5 - c * 0.4); j.armRlo.rotation.x = -(0.5 + c * 0.4); // elbows flex (hand forward = −x)
    j.legL.rotation.x = 0.4 - c * 0.5; j.legR.rotation.x = 0.4 + c * 0.5;
    j.legLlo.rotation.x = 0.7 + Math.max(0, -c) * 0.6; j.legRlo.rotation.x = 0.7 + Math.max(0, c) * 0.6; // knees flex (heel back = +x)
    j.footL.rotation.x = 0.3; j.footR.rotation.x = 0.3;
    j.hip.rotation.x = 0.2; j.hip.rotation.y = 0;
    j.torso.rotation.y = c * 0.12;
  } else if (moving) {
    // Walk / run: thighs swing, knees flex to clear the ground and extend to
    // plant, ankles roll through the step; arms counter-swing with bent elbows;
    // the torso/hips counter-rotate and the whole body bobs on each stride.
    const s = swing;                         // thigh swing, ∝ speed
    const lift = speed01;
    const kL = Math.max(0, Math.sin(a.phase - 0.7)); // per-leg knee-lift envelopes
    const kR = Math.max(0, Math.sin(a.phase + Math.PI - 0.7));
    j.legL.rotation.x = s; j.legR.rotation.x = -s;
    j.legLlo.rotation.x = (0.12 + kL * 1.35) * lift; // knees flex (heel back = +x)
    j.legRlo.rotation.x = (0.12 + kR * 1.35) * lift;
    j.footL.rotation.x = (0.12 + kL * 0.5) * lift;    // toe-off then flatten
    j.footR.rotation.x = (0.12 + kR * 0.5) * lift;
    j.armL.rotation.x = -s * 1.1; j.armR.rotation.x = s * 1.1;
    j.armLlo.rotation.x = -(0.35 + Math.max(0, -s) * 0.9); // elbows flex forward (−x) on the back-swing
    j.armRlo.rotation.x = -(0.35 + Math.max(0, s) * 0.9);
    j.armL.rotation.z = 0.09;
    j.torso.rotation.y = -s * 0.16; j.torso.rotation.x = lift * 0.14; j.torso.rotation.z = 0;
    j.hip.rotation.y = s * 0.09; j.hip.rotation.x = 0;
    j.hip.position.y = 1.0 + Math.abs(Math.sin(a.phase * 2)) * 0.05 * lift; // two bobs per stride
  } else {
    // IDLE: planted feet, soft knees, relaxed bent arms, a breathing rise/fall
    // and a slow weight-shift so a standing figure never looks frozen.
    const breath = Math.sin(a.idle * 1.6);
    const shift = Math.sin(a.idle * 0.7) * 0.04;
    L(j.legL.rotation, 'x', 0.02); L(j.legR.rotation, 'x', 0.02);
    L(j.legLlo.rotation, 'x', 0.13); L(j.legRlo.rotation, 'x', 0.13);   // soft knees (heel back = +x)
    L(j.footL.rotation, 'x', 0); L(j.footR.rotation, 'x', 0);
    L(j.armL.rotation, 'x', 0.09 + breath * 0.03); L(j.armL.rotation, 'z', -0.1);
    L(j.armR.rotation, 'x', 0.09 + breath * 0.03);
    L(j.armLlo.rotation, 'x', -0.22); L(j.armRlo.rotation, 'x', -0.22); // relaxed elbows bend forward (−x)
    L(j.torso.rotation, 'x', 0.02 + breath * 0.02); L(j.torso.rotation, 'y', shift);
    L(j.hip.rotation, 'y', shift * 0.5); j.hip.rotation.x = 0;
    L(j.hip.position, 'y', 1.0 + breath * 0.012);
  }

  // ---- Weapon arm: a committed, articulated swing (overrides the right arm) ----
  // Each combo drives the SHOULDER (armR) and ELBOW (armRlo) through a real
  // wind-up → strike → follow-through, with torso/hip rotation, an off-hand
  // counter-swing and a bit of leg plant so the whole body commits to the blow:
  //   0) overhead chop down the front, 1) horizontal cut, 2) forward stab.
  if (attack > 0) {
    const t = 1 - attack;                    // 0 → 1 across the swing
    const arc = Math.sin(t * Math.PI);       // 0→1→0 (peak at mid-swing)
    if (combo === 1) {          // horizontal cut sweeping left → right
      j.armR.rotation.x = -1.35 + arc * 0.25;
      j.armR.rotation.z = 1.2 - t * 2.4;
      j.armRlo.rotation.x = -(0.25 + arc * 0.8);   // elbow flexes forward (−x), then extends
      j.torso.rotation.y = 0.38 - t * 0.78;         // big torso whip
      j.torso.rotation.z = 0.12 - t * 0.24;
      j.armL.rotation.x = -0.6; j.armL.rotation.z = -0.35 + t * 0.6;
      j.legL.rotation.x = -0.12 * arc; j.legR.rotation.x = 0.12 * arc;
    } else if (combo === 2) {   // forward stab: retract, then punch the point out
      const push = t;
      j.armR.rotation.x = -1.15 + (1 - Math.cos(push * Math.PI)) * 0.55;
      j.armR.rotation.z = 0;
      j.armRlo.rotation.x = -(1.25 * (1 - push) + 0.05); // cocked elbow (−x) → extends into the thrust
      j.torso.rotation.x = 0.05 + arc * 0.2; j.torso.rotation.y = 0.06;
      j.armL.rotation.x = -0.5 - arc * 0.35; j.armL.rotation.z = -0.15;
      j.legR.rotation.x = 0.22 * arc; j.legRlo.rotation.x = 0.2 * arc; // front knee flexes into the lunge (+x)
    } else {                    // overhead chop straight down the front
      j.armR.rotation.x = -2.6 + t * 2.85;          // raised overhead → forward/down
      j.armR.rotation.z = -0.1 + t * 0.2;
      j.armRlo.rotation.x = -(1.5 * (1 - t) + 0.1);  // cocked behind the head (−x) → snaps out
      j.torso.rotation.x = 0.08 + arc * 0.22; j.torso.rotation.y = -0.1 + t * 0.2;
      j.torso.rotation.z = -0.05 + t * 0.1;
      j.armL.rotation.x = -0.3 - arc * 0.45; j.armL.rotation.z = 0.22;
      j.legR.rotation.x = 0.16 * arc; j.legLlo.rotation.x = 0.22 * arc; // knee flex on the plant (+x)
    }
  } else if (charging) {
    // Wind-up hold: cock the weapon arm back with a bent elbow, coil the torso.
    L(j.armR.rotation, 'x', -2.5); L(j.armR.rotation, 'z', -0.35);
    L(j.armRlo.rotation, 'x', -1.5);
    L(j.armL.rotation, 'x', -0.3);
    j.torso.rotation.x = 0.18; L(j.torso.rotation, 'y', -0.16); L(j.torso.rotation, 'z', 0);
  } else {
    // Recover: relax the weapon-arm roll and torso twist back to neutral.
    L(j.armR.rotation, 'z', 0);
    L(j.torso.rotation, 'z', 0);
  }
}

// Pose the figure for an emote (looping while held). `a.phase` advances each frame.
function poseEmote(group, j, a, emote) {
  const hip = group.children[0];
  const p = a.phase;
  // reset baseline (including the articulated lower joints)
  j.hip.rotation.x = 0; j.hip.rotation.y = 0; j.torso.rotation.x = 0; j.torso.rotation.y = 0; j.torso.rotation.z = 0;
  j.legL.rotation.x = 0; j.legR.rotation.x = 0;
  j.legLlo.rotation.x = 0; j.legRlo.rotation.x = 0; j.footL.rotation.x = 0; j.footR.rotation.x = 0;
  j.armLlo.rotation.x = 0; j.armRlo.rotation.x = 0;
  hip.position.y = 1.0; hip.rotation.z = 0;
  const s = Math.sin(p * 6);
  switch (emote) {
    case 'wave':
      j.armR.rotation.x = -2.5; j.armR.rotation.z = -0.4 + s * 0.5; // raised, waving
      j.armL.rotation.x = 0.2;
      break;
    case 'dance':
      hip.rotation.z = s * 0.18; j.torso.rotation.z = -s * 0.2;
      j.armL.rotation.x = -1.4 - Math.sin(p * 6 + 1) * 0.6; j.armR.rotation.x = -1.4 + Math.sin(p * 6) * 0.6;
      hip.position.y = 1.0 + Math.abs(Math.sin(p * 6)) * 0.12;
      j.legL.rotation.x = Math.sin(p * 6) * 0.3; j.legR.rotation.x = -Math.sin(p * 6) * 0.3;
      break;
    case 'flex':
      j.armL.rotation.x = -1.7; j.armL.rotation.z = 1.3;
      j.armR.rotation.x = -1.7; j.armR.rotation.z = -1.3;
      j.torso.rotation.x = -0.1 + Math.abs(s) * 0.05;
      break;
    case 'bow':
      j.hip.rotation.x = 1.0 + Math.sin(p * 3) * 0.05; j.armL.rotation.x = 0.4; j.armR.rotation.x = 0.4;
      break;
    case 'cheer':
      j.armL.rotation.x = -2.7; j.armR.rotation.x = -2.7;
      hip.position.y = 1.0 + Math.max(0, Math.sin(p * 7)) * 0.3; // little jumps
      break;
    case 'laugh':
      j.torso.rotation.x = 0.25 + Math.abs(Math.sin(p * 12)) * 0.12; // belly laugh
      j.armL.rotation.x = -0.7; j.armR.rotation.x = -0.7;
      break;
    case 'cry':
      j.torso.rotation.x = 0.3; j.armL.rotation.x = -2.3; j.armR.rotation.x = -2.3; // hands to face
      hip.position.y = 1.0 - Math.abs(Math.sin(p * 4)) * 0.04;
      break;
    case 'sit':
      j.hip.rotation.x = 0.1; hip.position.y = 0.5; // lowered
      j.legL.rotation.x = 1.4; j.legR.rotation.x = 1.4; j.armL.rotation.x = 0.3; j.armR.rotation.x = 0.3;
      break;
    default:
      j.armR.rotation.x = -2.4; // generic raised hand
  }
}
