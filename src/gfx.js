// ============================================================
// Graphics helpers for the stylised "clean cel-shaded" look. Keeps the low-fi
// aesthetic — no textures, no extra geometry — and leans into it with banded
// toon shading, a shared gradient ramp, and small additive glow/outline helpers.
// Everything routes through litMat() so the whole game can switch between
// cel-shaded and plain flat shading from one flag (QUALITY.toon).
// ============================================================
import * as THREE from 'three';

// Session graphics options (read at world/mesh build time). Cel shading, glow
// halos and character outlines can each be toggled; defaults on.
export const QUALITY = { toon: true, glow: true, outline: true };

// A tiny N-step ramp texture drives the toon banding (dark → light steps).
function makeGradient(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(70 + (i / (steps - 1)) * 185);
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
export const TOON_GRADIENT = makeGradient(3);

// Drop-in replacement for `new THREE.MeshLambertMaterial(params)` — returns a
// cel-shaded MeshToonMaterial (or plain Lambert when toon shading is off). The
// common params (color, vertexColors, transparent, opacity, side, emissive,
// map) carry straight over.
export function litMat(params = {}) {
  if (!QUALITY.toon) return new THREE.MeshLambertMaterial(params);
  const { flatShading, ...rest } = params; // MeshToonMaterial has no flatShading
  return new THREE.MeshToonMaterial({ gradientMap: TOON_GRADIENT, ...rest });
}

// A soft additive halo sprite for a glow source (bonfires, orbs, beams, loot
// beacons) — fakes a bloom bloom-ish glow with zero postprocessing. Returns a
// sprite you parent to the emitter; scale it to taste.
const _haloTex = (() => {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
})();
export function glowSprite(color = 0xffffff, size = 3, opacity = 0.5) {
  const mat = new THREE.SpriteMaterial({ map: _haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat); s.scale.setScalar(size);
  return s;
}

// A cheap comic outline: an inverted-hull black shell cloned from a mesh, pushed
// out along its normals via BackSide rendering. Adds a crisp silhouette to
// characters without any postprocessing. Returns the shell (already positioned
// to overlay `mesh`), or null when outlines are off.
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x10131a, side: THREE.BackSide });
export function outlineShell(mesh, scale = 1.06) {
  if (!QUALITY.outline || !mesh.geometry) return null;
  const shell = new THREE.Mesh(mesh.geometry, _outlineMat);
  shell.scale.setScalar(scale);
  shell.userData.isOutline = true;
  return shell;
}
