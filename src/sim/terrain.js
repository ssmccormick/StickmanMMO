// ============================================================
// Shared world/terrain core — NO Three.js, NO DOM. This is the single
// source of truth for ground elevation, biome layout, town/area/road
// placement, and dungeon/cave sites. It runs identically in the browser
// (imported by world.js) and in Node (imported by the authoritative
// multiplayer server), so client and server agree on the world without
// exchanging any map data.
//
// Everything here is deterministic: same inputs → same outputs on every
// machine. Keep it pure — if you need Three.js (meshes, colours), it
// belongs in world.js, not here.
// ============================================================

// Pure-JS replacements for the two THREE.MathUtils helpers the terrain math
// used (identical semantics: lerp = a+(b-a)t, clamp to [lo,hi]).
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// World scale. Positions spread out by SCALE so locations sit far apart and the
// continent feels large; area/town radii grow more gently by RSCALE so zones
// stay a sensible size with lots of open travel between them. Tripling SCALE
// triples every distance between towns, areas, camps, and spawns.
export const SCALE = 3;
const RSCALE = 1.6;
export const WORLD_SIZE = 380 * SCALE; // half-extent; world spans -WORLD_SIZE..WORLD_SIZE
export const WATER_LEVEL = -4.0;

// Deterministic value-noise so the world is the same every load and
// the server/client agree on terrain height without sharing data.
export function hash2(x, z) {
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
export function smoothNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Each biome fans out from the Nexus along its own heading — deliberately OFF
// the 45° diagonals and unevenly spaced, at varied distances — so the world's
// regions, towns, and areas scatter organically instead of in a neat X. Every
// position derives from this one table and is deterministic across loads.
export const DEG = Math.PI / 180;
export function polar(deg, r) { return { x: Math.cos(deg * DEG) * r, z: Math.sin(deg * DEG) * r }; }

export const BIOME_LAYOUT = [
  { biome: 'forest', heading: 14, dist: 185, town: 'Thornhollow', townDist: 178,
    low: { name: 'Whisperwood Glade', level: 1, off: -14, dist: 105, r: 42, count: 9 },
    high: { name: 'Tanglethorn Deep', level: 10, off: 18, dist: 255, r: 52, count: 12 },
    camp: { id: 'camp_forest', level: 5, off: 9, dist: 215 },
    boss: { name: 'Gorath the Wildking', type: 'brute', level: 12 } },
  { biome: 'snow', heading: 98, dist: 185, town: 'Frostgard', townDist: 175,
    low: { name: 'Frostfang Pass', level: 3, off: -16, dist: 108, r: 42, count: 9 },
    high: { name: 'Glacial Reach', level: 13, off: 14, dist: 252, r: 52, count: 12 },
    camp: { id: 'camp_snow', level: 7, off: 11, dist: 212 },
    boss: { name: 'Frosthelm the Fallen', type: 'knight', level: 16 } },
  { biome: 'desert', heading: 200, dist: 195, town: 'Dustmarket', townDist: 182,
    low: { name: 'Sunscar Flats', level: 5, off: 14, dist: 110, r: 42, count: 9 },
    high: { name: 'The Bonewaste', level: 17, off: -18, dist: 258, r: 54, count: 13 },
    camp: { id: 'camp_desert', level: 10, off: -8, dist: 218 },
    boss: { name: 'Sandmaw the Devourer', type: 'brute', level: 21 } },
  { biome: 'swamp', heading: 288, dist: 180, town: 'Gloomfen', townDist: 170,
    low: { name: 'Murkmire', level: 7, off: -12, dist: 102, r: 42, count: 9 },
    high: { name: 'Rotheart Hollow', level: 22, off: 20, dist: 250, r: 54, count: 13 },
    camp: { id: 'camp_swamp', level: 14, off: 7, dist: 210 },
    boss: { name: 'The Mirelord', type: 'knight', level: 27 } },
  // --- Four farther reaches (end-game), interleaved between the first four ---
  { biome: 'ash', heading: 56, dist: 188, town: 'Cinderhold', townDist: 178,
    low: { name: 'Cinderfields', level: 24, off: -15, dist: 108, r: 46, count: 12 },
    high: { name: 'The Ashen Reach', level: 33, off: 17, dist: 256, r: 56, count: 14 },
    camp: { id: 'camp_ash', level: 28, off: 8, dist: 214 },
    boss: { name: 'Pyraxis the Emberwyrm', type: 'brute', level: 36 } },
  { biome: 'jungle', heading: 142, dist: 182, town: 'Verdanthul', townDist: 172,
    low: { name: 'Tanglevine Basin', level: 26, off: -14, dist: 106, r: 46, count: 12 },
    high: { name: 'Heartroot Hollow', level: 35, off: 18, dist: 252, r: 56, count: 14 },
    camp: { id: 'camp_jungle', level: 30, off: 9, dist: 212 },
    boss: { name: 'Mossfang the Ancient', type: 'brute', level: 38 } },
  { biome: 'crystal', heading: 244, dist: 190, town: 'Prismhold', townDist: 180,
    low: { name: 'Glimmerfront', level: 28, off: 14, dist: 110, r: 46, count: 12 },
    high: { name: 'The Shardspire', level: 37, off: -17, dist: 256, r: 56, count: 14 },
    camp: { id: 'camp_crystal', level: 32, off: -8, dist: 216 },
    boss: { name: 'Vael the Prism Tyrant', type: 'knight', level: 40 } },
  { biome: 'badlands', heading: 332, dist: 184, town: 'Rustmarket', townDist: 174,
    low: { name: 'Rustgulch', level: 30, off: -13, dist: 104, r: 46, count: 12 },
    high: { name: 'Bonechew Canyon', level: 40, off: 19, dist: 254, r: 56, count: 14 },
    camp: { id: 'camp_badlands', level: 34, off: 7, dist: 210 },
    boss: { name: 'Skarn the Bonelord', type: 'knight', level: 44 } },
];

// Per-biome region size (falloff multiplier) so regions vary in extent/shape.
export const BIOME_SIZE = { forest: 1.18, snow: 1.0, desert: 1.12, swamp: 0.9, ash: 1.06, jungle: 1.22, crystal: 0.88, badlands: 1.1 };

// Biome region centers — used by biomeWeights as soft-Voronoi sites.
export const BIOME_REGIONS = BIOME_LAYOUT.map((b) => ({ biome: b.biome, size: BIOME_SIZE[b.biome] || 1, ...polar(b.heading, b.dist * SCALE) }));

// Smooth, noise-distorted biome membership weights at a point: a soft Voronoi
// over the biome region centers, with a meadow core around the Nexus. Defined
// before heightAt so terrain elevation can vary by biome.
export function biomeWeights(x, z) {
  // Distort the sample point so biome borders wander instead of being clean
  // circles (scaled with the world so borders wander proportionally).
  const nx = x + (smoothNoise(x * 0.02 + 1.3, z * 0.02 + 2.7) - 0.5) * 70 * SCALE;
  const nz = z + (smoothNoise(x * 0.02 + 9.1, z * 0.02 + 4.2) - 0.5) * 70 * SCALE;
  const town = 1 - smoothstep(20 * SCALE, 60 * SCALE, Math.hypot(x, z)); // meadow core (true position)
  const outer = 1 - town;
  const w = { forest: 0, snow: 0, swamp: 0, desert: 0, ash: 0, jungle: 0, crystal: 0, badlands: 0, meadow: town };
  let sum = 0; const inf = [];
  for (const r of BIOME_REGIONS) {
    const d = Math.hypot(nx - r.x, nz - r.z);
    const v = 1 / (1 + Math.pow(d / (95 * SCALE * (r.size || 1)), 3)); // soft falloff, scaled by world + region size
    inf.push(v); sum += v;
  }
  for (let i = 0; i < BIOME_REGIONS.length; i++) w[BIOME_REGIONS[i].biome] = (inf[i] / sum) * outer;
  return w;
}

// Town centers (flattened so settlements sit on level ground). The Nexus anchors
// the middle; each biome gets one outpost partway along its heading.
export const TOWNS = [
  { name: 'The Nexus', x: 0, z: 0, biome: 'meadow', radius: 40 * RSCALE, nexus: true },
  ...BIOME_LAYOUT.map((b) => ({ name: b.town, biome: b.biome, radius: 20 * RSCALE, ...polar(b.heading, b.townDist * SCALE) })),
];

// Named adventuring areas within the biomes, each with a level and a spawn
// budget. The player gets a zone banner on entering one. Low areas sit nearer
// the Nexus, high areas farther out, each on a slightly jittered heading.
// Keep areas/camps/bosses off the region borders (which carry mountain ranges)
// by clamping their angular offset toward the center of the wedge.
export const capOff = (o) => Math.max(-9, Math.min(9, o));
export const AREAS = [
  { name: 'Greenmeadow', x: 0, z: 0, r: 40 * RSCALE, level: 0, biome: 'meadow', safe: true },
  // A small starter glen across the first bridge from the Nexus, where the
  // Ashbound takes their first steps onto the mainland.
  { name: 'The Waking Vale', ...polar(14, 110 * SCALE), r: 24 * RSCALE, level: 1, count: 7, biome: 'meadow' },
  ...BIOME_LAYOUT.flatMap((b) => [
    { name: b.low.name, level: b.low.level, biome: b.biome, r: b.low.r * RSCALE, count: b.low.count, ...polar(b.heading + capOff(b.low.off), b.low.dist * SCALE) },
    { name: b.high.name, level: b.high.level, biome: b.biome, r: b.high.r * RSCALE, count: b.high.count, ...polar(b.heading + capOff(b.high.off), b.high.dist * SCALE) },
  ]),
];

// Elite war-camps and world bosses (one per biome) — camps sit between the town
// and the high area; bosses lurk in the high area.
export const CAMPS = BIOME_LAYOUT.map((b) => ({ id: b.camp.id, level: b.camp.level, ...polar(b.heading + capOff(b.camp.off), b.camp.dist * SCALE) }));
export const BOSSES = BIOME_LAYOUT.map((b) => ({ name: b.boss.name, type: b.boss.type, level: b.boss.level, ...polar(b.heading + capOff(b.high.off), b.high.dist * SCALE) }));

// Find the named area a point is in (nearest area whose radius contains it).
export function areaAt(x, z) {
  let best = null, bd = Infinity;
  for (const a of AREAS) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < a.r && d < bd) { bd = d; best = a; }
  }
  return best;
}

// Roads: winding dirt routes from the Nexus out to each town. Each road is a
// polyline whose interior waypoints are pushed off the straight line (tapering
// to zero at both ends) so paths curve and bend like natural trails rather than
// laser-straight spokes.
export const ROADS = TOWNS.filter((t) => !t.nexus).map((t) => {
  const bx = t.x, bz = t.z, len = Math.hypot(bx, bz) || 1;
  const ux = bx / len, uz = bz / len;   // unit vector along the road
  const px = -uz, pz = ux;              // perpendicular
  const N = 7, pts = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const taper = Math.sin(s * Math.PI); // 0 at both towns, 1 in the middle
    // Two offset bands (a broad swing + a finer wobble) for an organic curve.
    const bend = taper * (Math.sin(s * Math.PI * 1.6 + t.x * 0.013) * 22 +
      (smoothNoise(t.x * 0.05 + s * 5, t.z * 0.05) - 0.5) * 40);
    pts.push({ x: bx * s + px * bend, z: bz * s + pz * bend });
  }
  return pts;
});
export function roadDistance(x, z) {
  let best = Infinity;
  for (const pts of ROADS) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      let s = ((x - a.x) * dx + (z - a.z) * dz) / len2;
      s = Math.max(0, Math.min(1, s));
      best = Math.min(best, Math.hypot(x - (a.x + dx * s), z - (a.z + dz * s)));
    }
  }
  return best;
}

// Dungeons: an overworld entrance portal that teleports you to an instanced
// room far off the map. The room sites get a hard-flat floor in heightAt.
export const DUNGEONS = [
  { id: 'undervault', name: 'The Undervault', ex: 30 * SCALE, ez: -25 * SCALE, sx: 720 * SCALE, sz: 0, level: 6 },  // on the Nexus island
  { id: 'frostcrypt', name: 'Frostcrypt', ex: -82 * SCALE, ez: 78 * SCALE, sx: -720 * SCALE, sz: 0, level: 12 },    // forest/snow shore
  { id: 'sunkentomb', name: 'Sunken Tomb', ex: 82 * SCALE, ez: -78 * SCALE, sx: 0, sz: 720 * SCALE, level: 19 },    // jungle/desert shore
];
export const DUNGEON_SITES = DUNGEONS.map((d) => ({ x: d.sx, z: d.sz, radius: 44, floorY: 0 }));

// Mountains: big rocky peaks that act as landmarks/barriers. A couple of them
// have a cave mouth at the base that leads down into an instanced cavern.
export const MOUNTAINS = [
  { x: -150 * SCALE, z: 255 * SCALE, r: 28 * RSCALE, h: 78, cave: 'cave_echo' },  // snowy peak, far north
  { x: 255 * SCALE, z: 70 * SCALE, r: 26 * RSCALE, h: 70, cave: 'cave_deep' },    // eastern forest highland
  { x: -250 * SCALE, z: -80 * SCALE, r: 23 * RSCALE, h: 60 },
  { x: 120 * SCALE, z: -240 * SCALE, r: 21 * RSCALE, h: 54 },
  { x: -285 * SCALE, z: 70 * SCALE, r: 22 * RSCALE, h: 58 },
  { x: 190 * SCALE, z: 215 * SCALE, r: 19 * RSCALE, h: 50 },
];

// Caves: like dungeons, they teleport to an instanced room far off the map,
// but these are deep, dark, crystal-lit caverns reached by descending through
// a mountain-base entrance. A treasure cache waits at the bottom.
export const CAVES = [
  { id: 'cave_echo', name: 'Echohollow Cavern', ex: -150 * SCALE, ez: 255 * SCALE, sx: 0, sz: -720 * SCALE, floorY: -42, level: 4 },
  { id: 'cave_deep', name: 'The Deepvein', ex: 255 * SCALE, ez: 70 * SCALE, sx: -720 * SCALE, sz: -720 * SCALE, floorY: -48, level: 9 },
];
export const CAVE_SITES = CAVES.map((c) => ({ x: c.sx, z: c.sz, radius: 40, floorY: c.floorY }));

const SEA_IN = 52 * SCALE, SEA_OUT = 92 * SCALE; // inner/outer radius of the Sundered Sea ring
export { SEA_IN, SEA_OUT };

// The outer coastline: beyond this radius the continent slides into open ocean.
// Farther still lies the Leviathan Zone (a swim into deep water that summons the
// beast). Content is kept within EDGE_SHORE; the ocean is the outer margin.
export const EDGE_SHORE = WORLD_SIZE * 0.85;
export const LEVIATHAN_RADIUS = WORLD_SIZE * 0.94;

// The Arcanum Spire (great Mage Tower). Built straight into the heightfield as a
// tall STEPPED cone so you can literally walk up its tiers to a big flat summit
// arena (the movement snaps to heightAt, so stepped terrain is walkable). The
// visual tower mesh + rampart colliders (world.js) match these numbers.
export const MAGE_TOWER = { ...polar(210, WORLD_SIZE * 0.56), topR: 26, baseR: 96, height: 60, tiers: 12 };

// The tower's foot elevation (terrain under its centre), sampled once WITHOUT
// the tower's own contribution so tiers rise from real ground, not recursively.
let _towerFoot = null, _inFootSample = false;
function towerFoot() {
  if (_towerFoot == null) { _inFootSample = true; _towerFoot = heightAt(MAGE_TOWER.x, MAGE_TOWER.z); _inFootSample = false; }
  return _towerFoot;
}
// Absolute summit height of the tower (for spawning the boss/guards on top).
export function mageTowerSummitY() { return towerFoot() + MAGE_TOWER.height; }

// The single source of truth for ground elevation. Base rolling noise plus
// per-biome character (snowy peaks, desert dunes, swamp lowlands, forest
// plateaus), all flattened to level ground around every town.
export function heightAt(x, z) {
  // Dungeon rooms and cave instances are flat platforms far off the overworld.
  for (const d of DUNGEON_SITES) if (Math.hypot(x - d.x, z - d.z) < d.radius) return d.floorY;
  for (const c of CAVE_SITES) if (Math.hypot(x - c.x, z - c.z) < c.radius) return c.floorY;
  let h = 0;
  h += smoothNoise(x * 0.012, z * 0.012) * 14;
  h += smoothNoise(x * 0.04, z * 0.04) * 4;
  h += smoothNoise(x * 0.11, z * 0.11) * 1.2;
  h -= 6;

  // Per-biome elevation, blended by weight.
  const w = biomeWeights(x, z);
  if (w.snow > 0.001)   h += w.snow * (smoothNoise(x * 0.022 + 30, z * 0.022 + 30) * 38 - 4); // tall peaks
  if (w.desert > 0.001) h += w.desert * (Math.sin(x * 0.05) * Math.cos(z * 0.045) * 6);        // rolling dunes
  if (w.swamp > 0.001)  h += w.swamp * (-7 + smoothNoise(x * 0.05, z * 0.05) * 2);              // sunken lowlands
  if (w.forest > 0.001) {
    // Forest plateaus: quantize into broad steps.
    const plat = Math.round((smoothNoise(x * 0.02 + 60, z * 0.02 + 60) * 22) / 6) * 6;
    h += w.forest * (plat - 6);
  }
  if (w.ash > 0.001)     h += w.ash * (smoothNoise(x * 0.03 + 80, z * 0.03 + 80) * 30 - 2);        // jagged volcanic ridges
  if (w.jungle > 0.001)  h += w.jungle * (smoothNoise(x * 0.025 + 110, z * 0.025 + 110) * 12 + 2);  // lush rolling hills
  if (w.crystal > 0.001) {
    // Crystal highlands: tall, stepped plateaus.
    const step = Math.round((smoothNoise(x * 0.018 + 140, z * 0.018 + 140) * 34) / 8) * 8;
    h += w.crystal * (step + 4);
  }
  if (w.badlands > 0.001) {
    // Badlands mesas: flat-topped steps separated by canyons.
    const mesa = Math.round((smoothNoise(x * 0.022 + 170, z * 0.022 + 170) * 28) / 10) * 10;
    h += w.badlands * (mesa - 2);
  }

  // Flatten the nearest town to a level plateau.
  let flat = 1;
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    flat = Math.min(flat, clamp((d - t.radius * 0.5) / 20, 0, 1));
  }
  h *= flat;
  // Lift terrain so flattened towns sit at a consistent, walkable height.
  h += (1 - flat) * townBaseHeight(x, z);

  // The Arcanum Spire: a tall stepped cone rising from the land to a broad flat
  // summit. Walkable tier-by-tier (each step just pops you up), so you climb the
  // tower to fight the boss on top. Skipped while sampling the foot height.
  if (!_inFootSample) {
    const mt = MAGE_TOWER;
    const dr = Math.hypot(x - mt.x, z - mt.z);
    if (dr < mt.baseR) {
      const foot = towerFoot();
      const summit = foot + mt.height;
      let ty;
      if (dr <= mt.topR) ty = summit; // flat summit arena
      else {
        const rr = (dr - mt.topR) / (mt.baseR - mt.topR);      // 0 at summit rim → 1 at foot
        const tier = Math.floor((1 - rr) * mt.tiers);           // stepped tiers
        ty = foot + (mt.height) * (tier / mt.tiers);
      }
      // Only ever raise the ground; blend the outermost tier into the terrain at
      // the base so there's no wall to climb onto from the field.
      const inside = 1 - smoothstep(mt.baseR - 14, mt.baseR, dr);
      h = lerp(h, Math.max(h, ty), inside);
      if (dr <= mt.topR) h = summit;
    }
  }

  // The Sundered Sea: a ring of deep water encircling the Nexus heartland, so
  // the central capital is an island and the eight reaches lie beyond the
  // water. Only the land-bridge roads stay above the waves — they're the
  // causeways you cross to leave the heartland.
  const rad = Math.hypot(x, z);
  // The Nexus heartland is a low, FLAT island: within the inner shore, ease the
  // ground toward a plateau that sits just above the water, so the capital reads
  // as an island with the sea lapping just below its edge (not a tall cliff).
  if (rad < SEA_IN) {
    const islandTop = WATER_LEVEL + 2;
    const k = 1 - smoothstep(SEA_IN * 0.55, SEA_IN, rad); // 1 at centre → 0 at the shore
    h = lerp(h, islandTop, k * 0.85);
  }
  const ring = smoothstep(SEA_IN - 8 * SCALE, SEA_IN, rad) * (1 - smoothstep(SEA_OUT, SEA_OUT + 10 * SCALE, rad));
  if (ring > 0.002) {
    const bridge = roadDistance(x, z) < 10 ? 1 : 0;
    const seaFloor = WATER_LEVEL - 6 + smoothNoise(x * 0.05, z * 0.05) * 2.5;
    h = lerp(h, seaFloor, ring * (1 - bridge));
  }

  // The World's Edge: beyond the outer shore the land gives way to open ocean
  // you can swim into — and, far enough out, the Leviathan's domain. The ground
  // ramps below the waterline so there's no invisible wall to walk off; you just
  // wade into the sea.
  if (rad > EDGE_SHORE) {
    const oceanFloor = WATER_LEVEL - 14 + smoothNoise(x * 0.04, z * 0.04) * 3;
    const k = smoothstep(EDGE_SHORE, EDGE_SHORE + 60 * SCALE, rad);
    h = lerp(h, oceanFloor, k);
  }
  return h;
}

// A gentle base height for a town plateau (keeps each town roughly level
// without snapping every town to y=0).
export function townBaseHeight(x, z) {
  let nearest = TOWNS[0], best = Infinity;
  for (const t of TOWNS) { const d = Math.hypot(x - t.x, z - t.z); if (d < best) { best = d; nearest = t; } }
  // raw base noise at the town center → a stable plateau height
  return smoothNoise(nearest.x * 0.012, nearest.z * 0.012) * 8;
}

// Biomes are chosen by map quadrant; the town sits in a neutral meadow at
// the center. Each biome has its own ground palette, rock tint, and prop type.
export const BIOMES = {
  meadow: { name: 'Greenmeadow', ground: 0x6fae54, ground2: 0x9aa05a, rock: 0x8c8576, prop: 'tree' },
  forest: { name: 'The Greenwood', ground: 0x4d8a3a, ground2: 0x66993a, rock: 0x6f6a5e, prop: 'tree' },
  snow: { name: 'Frostpeaks', ground: 0xe2ebf2, ground2: 0xc2d4e2, rock: 0x9aa6b2, prop: 'pine' },
  swamp: { name: 'The Mire', ground: 0x49583a, ground2: 0x3a4a32, rock: 0x55564a, prop: 'dead' },
  desert: { name: 'The Dunes', ground: 0xd9c486, ground2: 0xc7a866, rock: 0xbaa06e, prop: 'cactus' },
  ash: { name: 'The Emberwastes', ground: 0x40322c, ground2: 0x5a3326, rock: 0x7a2a1a, prop: 'charred' },
  jungle: { name: 'The Verdant Wilds', ground: 0x2f6e2a, ground2: 0x3f8230, rock: 0x4a5a3a, prop: 'jungle' },
  crystal: { name: 'Shardspire Highlands', ground: 0x8a9ad0, ground2: 0xb2a8e2, rock: 0x9a8ad8, prop: 'crystal' },
  badlands: { name: 'The Scarlands', ground: 0xb0663a, ground2: 0xc98a4a, rock: 0xa0522d, prop: 'cactus' },
};

// Discrete biome (for prop choice / camps) — the dominant weight, distorted
// so prop regions interleave at borders to match the blended terrain.
export function biomeAt(x, z) {
  if (Math.hypot(x, z) < 22 * SCALE) return BIOMES.meadow;
  const w = biomeWeights(x, z);
  let best = 'forest', bv = -1;
  for (const k of ['forest', 'snow', 'swamp', 'desert', 'ash', 'jungle', 'crystal', 'badlands', 'meadow']) if (w[k] > bv) { bv = w[k]; best = k; }
  return BIOMES[best];
}
