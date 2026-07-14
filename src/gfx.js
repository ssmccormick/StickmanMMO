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

// Comic outline via inverted hull: for every mesh in a character, add a slightly
// larger black back-face shell as a sibling so it inherits the same animation.
// Gives a crisp cel silhouette with no postprocessing. Cheap enough for the hero
// and bosses; skipped when outlines are off.
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x0e1119, side: THREE.BackSide });
export function addOutlines(root, scale = 1.08) {
  if (!QUALITY.outline || !root) return;
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.isOutline) return;
    if (o.userData.noOutline) return;            // effect/fx meshes opt out
    if (o.visible === false) return;             // hidden meshes (e.g. SSJ aura) — shell must not outlive their visibility
    // Unlit effect meshes (glow cones, auras, flat basics) shouldn't get a solid silhouette.
    const mat = o.material;
    if (mat && (mat.isMeshBasicMaterial || mat.transparent)) return;
    meshes.push(o);
  });
  for (const m of meshes) {
    const shell = new THREE.Mesh(m.geometry, _outlineMat);
    shell.position.copy(m.position); shell.rotation.copy(m.rotation);
    shell.scale.copy(m.scale).multiplyScalar(scale);
    shell.userData.isOutline = true; shell.castShadow = false; shell.receiveShadow = false;
    shell.renderOrder = -1;
    if (m.parent) m.parent.add(shell);
  }
}

// A tiny shared "wind" clock; main.js advances WIND.t.value each frame. windify()
// patches a material so foliage tops sway with it (bend grows with local height),
// giving the world gentle motion without swaying every object on the CPU.
export const WIND = { t: { value: 0 } };
export function windify(mat, amount = 0.18) {
  if (!QUALITY.toon && !mat) return mat;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindT = WIND.t;
    shader.uniforms.uWindAmt = { value: amount };
    shader.vertexShader = 'uniform float uWindT; uniform float uWindAmt;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  float wy = max(transformed.y, 0.0);\n  float wsw = sin(uWindT + position.x * 0.3 + position.z * 0.25);\n  transformed.x += wsw * uWindAmt * wy;\n  transformed.z += cos(uWindT * 0.8 + position.z * 0.3) * uWindAmt * 0.6 * wy;'
    );
  };
  mat.customProgramCacheKey = () => 'windified';
  return mat;
}
