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
  return pivot;
}

export function createStickman({ color = 0x9aa4b2, accent = 0xd8423c, scale = 1 } = {}) {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const accentMat = new THREE.MeshLambertMaterial({ color: accent });

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

  root.scale.setScalar(scale);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  // Bundle joint refs + per-instance animation phase on the group.
  root.userData.joints = { hip, torso, head, crest, armL, armR, legL, legR, weapon };
  root.userData.anim = { phase: Math.random() * Math.PI * 2, attack: 0, climb: 0 };
  return root;
}

// Pose a stickman for this frame.
//   speed01: 0..1 how fast it's moving (drives walk cycle)
//   dt: seconds, state: { attack, climbing, dead, airborne }
export function animateStickman(group, dt, { speed01 = 0, attack = 0, climbing = false, airborne = false, dead = false } = {}) {
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
