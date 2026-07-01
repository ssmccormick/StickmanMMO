// ============================================================
// Stickman mesh: a simple articulated figure built from cylinders
// and a sphere head. Shared by the player, other players, and
// enemies. Exposes joint references so the animator can pose it
// (walk cycle, attack swing, climbing, death flop).
// ============================================================
import * as THREE from 'three';

// Reusable geometries (created once, shared across every stickman).
const G = {
  head: new THREE.SphereGeometry(0.28, 12, 10),
  limb: new THREE.CylinderGeometry(0.07, 0.07, 1, 6),
  torso: new THREE.CylinderGeometry(0.12, 0.1, 1, 7),
};

function limbMesh(mat, length) {
  const m = new THREE.Mesh(G.limb, mat);
  m.scale.y = length;
  // Pivot at the top: shift geometry down so it rotates from the shoulder/hip.
  m.position.y = -length / 2;
  const pivot = new THREE.Group();
  pivot.add(m);
  pivot.userData.bar = m;   // the inner bar — scaled in x/z to set limb thickness
  pivot.userData.len = length;
  return pivot;
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
  const bodyMat = new THREE.MeshLambertMaterial({ color: app.bodyColor });
  const accentMat = new THREE.MeshLambertMaterial({ color: app.accentColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: app.hairColor });

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

  // Shoulders origin
  const shoulderY = 0.66;
  const armL = limbMesh(accentMat, 0.62); armL.position.set(0.18, shoulderY, 0);
  const armR = limbMesh(accentMat, 0.62); armR.position.set(-0.18, shoulderY, 0);
  hip.add(armL, armR);

  // Legs from hip
  const legL = limbMesh(bodyMat, 0.7); legL.position.set(0.1, 0, 0);
  const legR = limbMesh(bodyMat, 0.7); legR.position.set(-0.1, 0, 0);
  hip.add(legL, legR);

  // A held "weapon" stick on the right arm. Uses its OWN material (cloned)
  // so recolouring it by gear rarity doesn't tint the arms/crest too.
  const weapon = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), accentMat.clone());
  weapon.position.y = -0.62; weapon.rotation.z = Math.PI / 2.5;
  armR.add(weapon);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  // Bundle joint refs + materials + per-instance animation phase on the group.
  root.userData.joints = { hip, torso, head, crest, armL, armR, legL, legR, weapon, hair: null };
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
  // Limb thickness: scale only the inner bar's x/z so the held weapon and joint
  // pivots (which drive animation) keep their normal proportions.
  for (const limb of [j.armL, j.armR, j.legL, j.legR]) {
    const bar = limb.userData.bar;
    if (bar) { bar.scale.x = app.limb; bar.scale.z = app.limb; }
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
  const gold = () => new THREE.MeshLambertMaterial({ color: 0xffd24a });
  const dark = () => new THREE.MeshLambertMaterial({ color: 0x1a1a1f });
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
      const felt = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
      const band = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.03, 20), felt);
      brim.position.y = 0.16; brim.scale.z = 1.12; g.add(brim);          // wide oval brim
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.3, 16), felt);
      crown.position.y = 0.31; g.add(crown);
      const crease = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.3, 0.34), felt);
      crease.position.y = 0.33; g.add(crease);                            // centre pinch ridge
      const hatband = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.275, 0.06, 16), band);
      hatband.position.y = 0.2; g.add(hatband);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
      buckle.position.set(0, 0.2, 0.275); g.add(buckle);
      break;
    }
    case 'tophat': {
      const m2 = dark();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18), m2);
      brim.position.y = 0.2; g.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18), m2);
      top.position.y = 0.42; g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.08, 18), new THREE.MeshLambertMaterial({ color: 0xd83c3c }));
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
      const vm = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
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
export function animateStickman(group, dt, { speed01 = 0, attack = 0, climbing = false, airborne = false, dead = false, emote = null } = {}) {
  const a = group.userData.anim;
  const j = group.userData.joints;

  if (dead) {
    // Flop: rotate whole figure onto the ground.
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -Math.PI / 2, Math.min(1, dt * 6));
    return;
  }
  group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, Math.min(1, dt * 8));

  // Advance walk phase proportional to speed.
  a.phase += dt * (4 + speed01 * 10);
  const swing = Math.sin(a.phase) * (0.2 + speed01 * 0.7);

  // Emotes override the pose with a brief, looping bit of body language.
  if (emote && speed01 < 0.05) {
    poseEmote(group, j, a, emote);
    return;
  }

  if (climbing) {
    // Reach up alternately while climbing.
    const c = Math.sin(a.phase * 1.4);
    j.armL.rotation.x = -2.3 + c * 0.6;
    j.armR.rotation.x = -2.3 - c * 0.6;
    j.legL.rotation.x = 0.4 - c * 0.5;
    j.legR.rotation.x = 0.4 + c * 0.5;
    j.hip.rotation.x = 0.2;
  } else {
    j.legL.rotation.x = swing;
    j.legR.rotation.x = -swing;
    j.armL.rotation.x = -swing * 0.8;
    j.armR.rotation.x = swing * 0.8;
    j.hip.rotation.x = 0;
    // Subtle idle bob + body lean while moving.
    j.torso.rotation.x = speed01 * 0.18;
    group.children[0].position.y = 1.0 + Math.abs(Math.sin(a.phase)) * 0.04 * speed01;
  }

  // Attack swing overrides the right arm for a moment.
  if (attack > 0) {
    const t = 1 - attack; // 0..1 progress
    const swingAngle = Math.sin(t * Math.PI) * 2.4;
    j.armR.rotation.x = -swingAngle;
    j.armR.rotation.z = Math.sin(t * Math.PI) * 0.6;
  } else {
    j.armR.rotation.z = THREE.MathUtils.lerp(j.armR.rotation.z, 0, Math.min(1, dt * 10));
  }
}

// Pose the figure for an emote (looping while held). `a.phase` advances each frame.
function poseEmote(group, j, a, emote) {
  const hip = group.children[0];
  const p = a.phase;
  // reset baseline
  j.hip.rotation.x = 0; j.torso.rotation.x = 0; j.torso.rotation.z = 0;
  j.legL.rotation.x = 0; j.legR.rotation.x = 0;
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
