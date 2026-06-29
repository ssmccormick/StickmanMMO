// ============================================================
// Weapon meshes: a recognizable little model per weapon kind (sword, axe,
// mace, dagger, bow, staff, wand), built grip-at-origin with the length
// running along +Y so it mounts on the hand exactly like the old weapon
// stick. `color` tints the business end (blade/head/orb) by rarity.
// ============================================================
import * as THREE from 'three';

export function buildWeaponMesh(kind, color = 0xcfd2da) {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color });
  const glow = new THREE.MeshBasicMaterial({ color });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33333a });
  const gold = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
  const add = (geo, mat, x, y, z, rot) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(m); return m;
  };

  switch (kind) {
    case 'axe': {
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 6), wood, 0, 0.32, 0);
      // A wedge head: a box scaled to a blade, biting forward (+Z).
      const head = add(new THREE.BoxGeometry(0.05, 0.3, 0.36), steel, 0, 0.66, 0.13);
      head.geometry.translate(0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.3, 0.05), steel, 0, 0.66, -0.05); // back spike
      break;
    }
    case 'mace': {
      add(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 6), wood, 0, 0.3, 0);
      add(new THREE.IcosahedronGeometry(0.15, 0), steel, 0, 0.68, 0);
      for (const [x, y, z] of [[0.17, 0.68, 0], [-0.17, 0.68, 0], [0, 0.68, 0.17], [0, 0.68, -0.17], [0, 0.85, 0]]) {
        const r = x ? [0, 0, Math.PI / 2] : z ? [Math.PI / 2, 0, 0] : [0, 0, 0];
        add(new THREE.ConeGeometry(0.045, 0.12, 4), steel, x, y, z, r);
      }
      break;
    }
    case 'dagger': {
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), dark, 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.16, 0.035, 0.05), gold, 0, 0.17, 0);
      add(new THREE.ConeGeometry(0.05, 0.38, 4), steel, 0, 0.38, 0); // short blade
      break;
    }
    case 'bow': {
      // A vertical C-curve with a drawn string.
      const limb = add(new THREE.TorusGeometry(0.42, 0.022, 6, 16, Math.PI * 1.05), wood, 0, 0.34, 0, [0, 0, -Math.PI * 0.52]);
      limb.scale.z = 0.6;
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.72, 4), dark, 0.0, 0.34, 0); // string
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
      break;
    }
    case 'wand': {
      add(new THREE.CylinderGeometry(0.022, 0.03, 0.5, 6), dark, 0, 0.22, 0);
      add(new THREE.IcosahedronGeometry(0.07, 0), glow, 0, 0.5, 0);
      break;
    }
    case 'sword':
    default: {
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 6), dark, 0, 0.09, 0); // grip
      add(new THREE.SphereGeometry(0.04, 6, 5), gold, 0, 0.0, 0);               // pommel
      add(new THREE.BoxGeometry(0.24, 0.045, 0.05), gold, 0, 0.2, 0);            // crossguard
      add(new THREE.BoxGeometry(0.075, 0.6, 0.022), steel, 0, 0.52, 0);          // blade
      add(new THREE.ConeGeometry(0.038, 0.12, 4), steel, 0, 0.88, 0);            // tip
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
