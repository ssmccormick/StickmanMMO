// ============================================================
// Creatures: builds a distinct mesh per enemy type so monsters look like
// their names — a gelatinous Slime, a quadruped Wolf, a hulking Ogre, a
// hooded Bandit, an armored Fallen Knight — instead of identical stickmen.
//
// Each builder returns a THREE.Group whose userData carries an `animate`
// poser (group, dt, state) used by the Enemy each frame. Humanoid types
// decorate the shared stickman and leave `animate` unset, so the Enemy
// falls back to the standard humanoid animator.
// ============================================================
import * as THREE from 'three';
import { litMat } from './gfx.js';
import { createStickman } from './stickman.js';

export function createCreature(typeId, opts = {}) {
  switch (typeId) {
    case 'slime':  return makeSlime(opts);
    case 'wolf':   return makeWolf(opts);
    case 'grunt':  return makeBandit(opts);
    case 'knight': return makeKnight(opts);
    case 'brute':  return makeOgre(opts);
    case 'wraith': return makeWraith(opts);
    case 'dragon': return makeDragon(opts);
    case 'archer': return makeBandit(opts);   // hooded humanoid with a bow-feel
    case 'hexer':  return makeBandit(opts);   // hooded caster
    case 'gargoyle': return makeWraith(opts); // winged flyer that spits fire
    default:       return createStickman(opts);
  }
}

// ---- Humanoids: decorate the shared stickman (animated by animateStickman) ----

function makeBandit({ color, accent, scale = 1 } = {}) {
  const root = createStickman({ color, accent, scale });
  const j = root.userData.joints;
  if (j.crest) j.crest.visible = false;
  const cloth = litMat({ color: 0x24262b });
  // A bandana/mask across the lower face and a hood on top.
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.15, 0.34), cloth);
  mask.position.set(0, -0.04, 0.1); j.head.add(mask);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.32, 7), cloth);
  hood.position.set(0, 0.2, -0.02); j.head.add(hood);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}

function makeKnight({ color, accent, scale = 1 } = {}) {
  const root = createStickman({ color, accent, scale });
  const j = root.userData.joints;
  if (j.crest) j.crest.visible = false;
  const steel = litMat({ color: 0x9aa4b2 });
  // Domed helmet + a coloured plume.
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), steel);
  helm.scale.y = 1.12; helm.position.set(0, 0.06, 0); j.head.add(helm);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 6), litMat({ color: accent }));
  plume.position.set(0, 0.36, -0.05); j.head.add(plume);
  // Pauldrons + a chest plate.
  for (const s of [0.18, -0.18]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), steel);
    p.position.set(s, 0.66, 0); j.hip.add(p);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.22), steel);
  plate.position.set(0, 0.42, 0.03); j.hip.add(plate);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}

function makeOgre({ color, accent, scale = 1 } = {}) {
  const root = createStickman({ color, accent, scale });
  const j = root.userData.joints;
  if (j.crest) j.crest.visible = false;
  const skin = litMat({ color });
  // Barrel chest/belly + hunched shoulders for a hulking silhouette.
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), skin);
  belly.scale.set(1.25, 1.0, 1.0); belly.position.set(0, 0.4, 0); j.hip.add(belly);
  for (const s of [0.34, -0.34]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 7), skin);
    sh.position.set(s, 0.66, 0); j.hip.add(sh);
  }
  // Oversized head with a heavy brow and two tusks.
  j.head.scale.setScalar(1.3);
  const tuskMat = litMat({ color: 0xf0ecd8 });
  for (const s of [0.1, -0.1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), tuskMat);
    tusk.position.set(s, -0.16, 0.2); tusk.rotation.x = 0.35; j.head.add(tusk);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.12), skin);
  brow.position.set(0, 0.1, 0.2); j.head.add(brow);
  // Big fists at the ends of the arms.
  for (const arm of [j.armL, j.armR]) {
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skin);
    fist.position.set(0, -0.62, 0); arm.add(fist);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// ---- Wolf: a quadruped with its own trotting gait ----

function makeWolf({ color, accent, scale = 1 } = {}) {
  const root = new THREE.Group();
  const fur = litMat({ color });
  const dark = litMat({ color: accent });
  const body = new THREE.Group(); body.position.y = 0.55; root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.95), fur); body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), fur); chest.position.z = 0.4; body.add(chest);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), fur); haunch.position.z = -0.4; body.add(haunch);

  // Head at the front (+z) — the wolf faces its movement direction.
  const head = new THREE.Group(); head.position.set(0, 0.16, 0.6); body.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.28), fur));
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), fur); snout.position.set(0, -0.05, 0.22); head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), dark); nose.position.set(0, -0.03, 0.34); head.add(nose);
  for (const s of [0.09, -0.09]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 5), fur); ear.position.set(s, 0.18, -0.02); head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    eye.position.set(s, 0.03, 0.13); head.add(eye);
  }

  // Tail, angled up.
  const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.5); tail.rotation.x = -0.9; body.add(tail);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.42, 5), fur); tailMesh.position.y = 0.2; tail.add(tailMesh);

  // Four legs, pivoting from the top so they swing.
  const legs = [];
  for (const [lx, lz] of [[0.13, 0.42], [-0.13, 0.42], [0.13, -0.4], [-0.13, -0.4]]) {
    const pivot = new THREE.Group(); pivot.position.set(lx, 0, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.55, 5), fur); leg.position.y = -0.27; pivot.add(leg);
    body.add(pivot); legs.push(pivot);
  }

  root.scale.setScalar(scale);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.anim = { phase: Math.random() * Math.PI * 2 };
  root.userData.parts = { body, head, tail, legs };
  root.userData.animate = animateWolf;
  return root;
}

function animateWolf(group, dt, { speed01 = 0, attack = 0, dead = false } = {}) {
  const p = group.userData.parts, a = group.userData.anim;
  if (dead) { group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, Math.PI / 2, Math.min(1, dt * 6)); return; }
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, Math.min(1, dt * 8));
  a.phase += dt * (5 + speed01 * 12);
  const sw = Math.sin(a.phase) * (0.2 + speed01 * 0.85);
  // Diagonal trot: front-left + back-right swing together, opposite the others.
  p.legs[0].rotation.x = sw; p.legs[3].rotation.x = sw;
  p.legs[1].rotation.x = -sw; p.legs[2].rotation.x = -sw;
  p.tail.rotation.y = Math.sin(a.phase * 1.5) * 0.3;
  p.head.rotation.x = Math.sin(a.phase) * 0.05 - (attack > 0 ? Math.sin((1 - attack) * Math.PI) * 0.6 : 0);
  p.body.position.y = 0.55 + Math.abs(Math.sin(a.phase)) * 0.03 * speed01;
}

// ---- Slime: a gelatinous blob that squashes, stretches and hops ----

function makeSlime({ color, accent, scale = 1 } = {}) {
  const root = new THREE.Group();
  const mat = litMat({ color });
  const body = new THREE.Group(); root.add(body);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat);
  blob.scale.set(1, 0.8, 1); blob.position.y = 0.4; body.add(blob);
  for (const s of [0.16, -0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(s, 0.5, 0.36); body.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0x202020 }));
    pupil.position.set(s, 0.5, 0.42); body.add(pupil);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), litMat({ color: accent }));
  core.position.y = 0.32; body.add(core);

  root.scale.setScalar(scale);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.anim = { phase: Math.random() * Math.PI * 2 };
  root.userData.parts = { body, blob };
  root.userData.animate = animateSlime;
  return root;
}

function animateSlime(group, dt, { speed01 = 0, attack = 0, dead = false } = {}) {
  const p = group.userData.parts, a = group.userData.anim;
  if (dead) { p.blob.scale.set(1.35, 0.15, 1.35); return; } // splat
  a.phase += dt * (3 + speed01 * 8);
  // Squash-stretch wobble + a hop while moving.
  const squash = 1 + Math.sin(a.phase * 2) * (0.06 + speed01 * 0.12);
  p.blob.scale.set(1 / squash, 0.8 * squash, 1 / squash);
  p.body.position.y = Math.abs(Math.sin(a.phase)) * (0.05 + speed01 * 0.3);
  if (attack > 0) p.body.position.y += Math.sin((1 - attack) * Math.PI) * 0.4; // lunge-hop
}

// ---- Sky Wraith: a winged flyer that beats its wings and dives to attack ----

function makeWraith({ color, accent, scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = litMat({ color });
  const wingMat = litMat({ color: accent, side: THREE.DoubleSide });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), skin); torso.scale.set(0.8, 1.1, 0.8); body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), skin); head.position.set(0, 0.4, 0.05); body.add(head);
  for (const s of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), wingMat); horn.position.set(s * 0.1, 0.56, 0); body.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), new THREE.MeshBasicMaterial({ color: 0xff5a3c })); eye.position.set(s * 0.08, 0.42, 0.18); body.add(eye);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 4), skin); leg.position.set(s * 0.12, -0.35, 0); body.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), skin); tail.position.set(0, -0.2, -0.3); tail.rotation.x = 1.2; body.add(tail);
  const wings = [];
  for (const s of [1, -1]) {
    const wing = new THREE.Group(); wing.position.set(s * 0.2, 0.15, -0.05);
    const mem = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.7), wingMat); mem.position.set(s * 0.55, 0, -0.1); wing.add(mem);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 1.0, 4), skin); bone.rotation.z = Math.PI / 2; bone.position.x = s * 0.5; wing.add(bone);
    body.add(wing); wings.push(wing);
  }
  root.scale.setScalar(scale);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.anim = { phase: Math.random() * Math.PI * 2 };
  root.userData.parts = { body, wings };
  root.userData.animate = animateWraith;
  return root;
}

function animateWraith(group, dt, { speed01 = 0, attack = 0, dead = false } = {}) {
  const p = group.userData.parts, a = group.userData.anim;
  if (dead) { group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, Math.PI / 2, Math.min(1, dt * 6)); return; }
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, Math.min(1, dt * 8));
  a.phase += dt * (6 + speed01 * 5);
  const flap = Math.sin(a.phase * 2) * (0.5 + speed01 * 0.4) + 0.25;
  p.wings[0].rotation.z = -flap; p.wings[1].rotation.z = flap;
  p.body.position.y = Math.sin(a.phase) * 0.06;
  p.body.rotation.x = attack > 0 ? Math.sin((1 - attack) * Math.PI) * 0.5 : THREE.MathUtils.lerp(p.body.rotation.x, 0, Math.min(1, dt * 8));
}

// ---- Dragon: the great sky-tyrant — a serpentine body, broad flapping
// wings, horned head with glowing eyes. Used for the end boss (and mount). ----
function makeDragon({ color = 0x4a2030, accent = 0x73402c, scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const scaleMat = litMat({ color });
  const bellyMat = litMat({ color: accent });
  const membrane = litMat({ color: 0x2a1020, side: THREE.DoubleSide });

  // Serpentine spine (head at +Z).
  const segs = []; const N = 7;
  for (let i = 0; i < N; i++) {
    const r = 0.5 * (1 - i / (N + 4));
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), scaleMat);
    seg.position.z = -i * 0.5; body.add(seg); segs.push(seg);
  }
  // Head.
  const head = new THREE.Group(); head.position.z = 0.65; body.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.66), scaleMat));
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.42), scaleMat); snout.position.set(0, -0.06, 0.5); head.add(snout);
  for (const s of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), bellyMat); horn.position.set(s * 0.16, 0.32, -0.16); horn.rotation.x = -0.5; head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb13c })); eye.position.set(s * 0.2, 0.1, 0.3); head.add(eye);
  }
  // Wings.
  const wings = [];
  for (const s of [1, -1]) {
    const wing = new THREE.Group(); wing.position.set(s * 0.32, 0.18, -0.55);
    const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 1.9, 5), bellyMat); spar.rotation.z = Math.PI / 2; spar.position.x = s * 0.95; wing.add(spar);
    const mem = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.03, 1.35), membrane); mem.position.set(s * 0.95, 0, -0.4); wing.add(mem);
    body.add(wing); wings.push(wing);
  }
  // Tail spike + hind legs.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), scaleMat); tail.position.z = -N * 0.5 - 0.3; tail.rotation.x = -Math.PI / 2; body.add(tail);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.4, 5), scaleMat); leg.position.set(s * 0.22, -0.32, 0.1); body.add(leg);
  }
  root.scale.setScalar(scale);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.anim = { phase: Math.random() * Math.PI * 2 };
  root.userData.parts = { body, wings, segs };
  root.userData.animate = animateDragon;
  return root;
}

function animateDragon(group, dt, { speed01 = 0, attack = 0, dead = false } = {}) {
  const p = group.userData.parts, a = group.userData.anim;
  if (dead) { group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, Math.PI / 2, Math.min(1, dt * 4)); return; }
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, Math.min(1, dt * 8));
  a.phase += dt * (3 + speed01 * 4);
  const flap = Math.sin(a.phase * 2.4) * 0.6 + 0.2;
  p.wings[0].rotation.z = -flap; p.wings[1].rotation.z = flap;
  for (let i = 0; i < p.segs.length; i++) {
    p.segs[i].position.y = Math.sin(a.phase * 1.6 + i * 0.5) * 0.16;
    p.segs[i].position.x = Math.sin(a.phase * 1.2 + i * 0.6) * 0.18;
  }
  p.body.rotation.x = attack > 0 ? Math.sin((1 - attack) * Math.PI) * 0.4 : THREE.MathUtils.lerp(p.body.rotation.x, 0, Math.min(1, dt * 8));
}
