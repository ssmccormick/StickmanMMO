// ============================================================
// Shared enemy archetypes + stat derivation — NO Three.js, NO DOM.
// Imported by the client (enemies.js, for meshes/AI) AND the headless
// authoritative server (enemySim.js), so a "Bandit Archer (Lv 7)" has
// the exact same HP/damage/XP wherever it's simulated. Colours are plain
// hex numbers here (data only) — turning them into materials happens
// client-side.
// ============================================================

export const TYPES = {
  slime:    { name: 'Stick Slime',   color: 0x6fae54, accent: 0x3f7d3a, scale: 0.8, hp: 30,  dmg: 6,  speed: 2.6, range: 1.8, xp: 14, aggro: 12 },
  grunt:    { name: 'Bandit',        color: 0x8a6a4a, accent: 0xd8423c, scale: 1.0, hp: 55,  dmg: 10, speed: 3.6, range: 2.2, xp: 24, aggro: 16 },
  wolf:     { name: 'Dire Stick',    color: 0x66707a, accent: 0xcfcfcf, scale: 0.9, hp: 45,  dmg: 9,  speed: 5.2, range: 2.0, xp: 22, aggro: 20 },
  brute:    { name: 'Ogre Brute',    color: 0x7a5a8a, accent: 0xb04a3a, scale: 1.5, hp: 140, dmg: 22, speed: 2.8, range: 2.8, xp: 60, aggro: 14 },
  knight:   { name: 'Fallen Knight', color: 0x3a3f4a, accent: 0x9aa4ef, scale: 1.1, hp: 95,  dmg: 16, speed: 3.8, range: 2.4, xp: 44, aggro: 18 },
  wraith:   { name: 'Sky Wraith',    color: 0x5a3a6a, accent: 0xc07bff, scale: 1.0, hp: 52,  dmg: 13, speed: 6.0, range: 2.2, xp: 34, aggro: 24, fly: true },
  dragon:   { name: 'Vetharion',     color: 0x4a2030, accent: 0x73402c, scale: 1.7, hp: 400, dmg: 18, speed: 5.6, range: 3.4, xp: 1200, aggro: 46, fly: true },
  // Ranged mobs: they close to firing range, then loose projectiles you must
  // dodge. `shootRange` is how far they'll open fire from; `projSpeed` how fast
  // (slower = easier to sidestep).
  archer:   { name: 'Bandit Archer',  color: 0x7a6a4a, accent: 0xffe27a, scale: 1.0, hp: 46,  dmg: 11, speed: 3.6, range: 2.0, xp: 32, aggro: 24, ranged: true, shootRange: 16, projSpeed: 17, projColor: 0xffe27a },
  hexer:    { name: 'Blight Hexer',   color: 0x4a3a64, accent: 0xb05aff, scale: 1.0, hp: 58,  dmg: 14, speed: 3.0, range: 2.0, xp: 40, aggro: 24, ranged: true, shootRange: 18, projSpeed: 13, projColor: 0xb05aff },
  gargoyle: { name: 'Spitfire Gargoyle', color: 0x4a4a55, accent: 0xff7a3c, scale: 1.05, hp: 64, dmg: 15, speed: 5.4, range: 2.2, xp: 46, aggro: 28, fly: true, ranged: true, shootRange: 19, projSpeed: 18, projColor: 0xff7a3c },
  // Fish People — amphibious raiders that haunt the coastline and shallows.
  fishman:  { name: 'Fishfolk Raider', color: 0x3a8a7a, accent: 0x9be0c8, scale: 1.05, hp: 68, dmg: 15, speed: 4.2, range: 2.4, xp: 40, aggro: 22 },
  tidecaller: { name: 'Tidecaller', color: 0x2a6a8a, accent: 0x6fc8ff, scale: 1.0, hp: 60, dmg: 16, speed: 3.4, range: 2.0, xp: 46, aggro: 24, ranged: true, shootRange: 17, projSpeed: 15, projColor: 0x6fc8ff },

  // ---- Biome-themed fauna (fills each region with its own creatures) ----
  // Forest / Greenwood
  boar:      { name: 'Tuskcharger',   color: 0x8a6a3a, accent: 0x5a3a1a, scale: 1.2, hp: 80,  dmg: 16, speed: 4.6, range: 2.6, xp: 34, aggro: 18 },
  sprite:    { name: 'Thorn Sprite',  color: 0x7fce5a, accent: 0xcfffa0, scale: 0.85, hp: 40, dmg: 11, speed: 4.4, range: 2.0, xp: 30, aggro: 22, ranged: true, shootRange: 15, projSpeed: 18, projColor: 0x9be36a },
  // Snow / Frostpeaks
  frostwolf: { name: 'Frost Fang',    color: 0xcfe0ee, accent: 0x9fd0ff, scale: 0.95, hp: 58, dmg: 14, speed: 5.6, range: 2.0, xp: 34, aggro: 22 },
  frostcaster:{ name: 'Rime Warden',  color: 0xbfeaff, accent: 0x6fc8ff, scale: 1.0, hp: 62,  dmg: 15, speed: 3.0, range: 2.0, xp: 44, aggro: 24, ranged: true, shootRange: 18, projSpeed: 13, projColor: 0x9fe0ff },
  // Desert / Dunes
  scarab:    { name: 'War Scarab',    color: 0xc7a866, accent: 0x8a6a3a, scale: 0.9, hp: 46,  dmg: 12, speed: 5.0, range: 1.9, xp: 28, aggro: 20 },
  sandstalker:{ name: 'Dune Stalker', color: 0xd9c486, accent: 0xe0b060, scale: 1.05, hp: 60, dmg: 14, speed: 3.4, range: 2.0, xp: 42, aggro: 24, ranged: true, shootRange: 17, projSpeed: 16, projColor: 0xe0c060 },
  // Swamp / Mire
  bogling:   { name: 'Bog Lurker',    color: 0x4a5a3a, accent: 0x3a4a2a, scale: 1.25, hp: 100, dmg: 18, speed: 2.6, range: 2.8, xp: 46, aggro: 16 },
  mirecaster:{ name: 'Mire Hexer',    color: 0x5a6a4a, accent: 0x9be36a, scale: 1.0, hp: 62,  dmg: 15, speed: 2.9, range: 2.0, xp: 48, aggro: 24, ranged: true, shootRange: 18, projSpeed: 12, projColor: 0x8fd86a },
  // Ash / Emberwastes
  emberhound:{ name: 'Ember Hound',   color: 0x5a2a1a, accent: 0xff5a2a, scale: 1.0, hp: 66,  dmg: 17, speed: 5.4, range: 2.2, xp: 44, aggro: 26 },
  cindermage:{ name: 'Cinder Adept',  color: 0x4a2a2a, accent: 0xff7a3c, scale: 1.0, hp: 64,  dmg: 16, speed: 3.0, range: 2.0, xp: 50, aggro: 26, ranged: true, shootRange: 19, projSpeed: 17, projColor: 0xff7a3c },
  // Jungle / Verdant Wilds
  panther:   { name: 'Shadowpanther', color: 0x2a3a2a, accent: 0x6fd86a, scale: 1.0, hp: 70,  dmg: 18, speed: 6.2, range: 2.2, xp: 46, aggro: 28 },
  blowpiper: { name: 'Vine Piper',    color: 0x3f6a2a, accent: 0x9be36a, scale: 1.0, hp: 58,  dmg: 15, speed: 3.6, range: 2.0, xp: 48, aggro: 24, ranged: true, shootRange: 17, projSpeed: 18, projColor: 0x9be36a },
  // Crystal / Shardspire
  shardling: { name: 'Shard Golem',   color: 0x9a8ad8, accent: 0xcdf2ff, scale: 1.2, hp: 108, dmg: 19, speed: 3.0, range: 2.6, xp: 54, aggro: 18 },
  prismcaster:{ name: 'Prism Seer',   color: 0x8a9ad0, accent: 0xb2a8e2, scale: 1.0, hp: 66,  dmg: 16, speed: 3.0, range: 2.0, xp: 56, aggro: 26, ranged: true, shootRange: 19, projSpeed: 15, projColor: 0xc7a4ff },
  // Badlands / Scarlands
  bonewalker:{ name: 'Bonewalker',    color: 0xcabf9a, accent: 0x8a7a5a, scale: 1.05, hp: 78, dmg: 17, speed: 3.4, range: 2.4, xp: 50, aggro: 20 },
  scrapshot: { name: 'Scrap Gunner',  color: 0xb0663a, accent: 0xffe27a, scale: 1.0, hp: 64,  dmg: 16, speed: 3.2, range: 2.0, xp: 52, aggro: 26, ranged: true, shootRange: 18, projSpeed: 22, projColor: 0xffd27a },
};

// Which creatures inhabit each biome (a melee bruiser + a ranged caster + a
// generic filler). Spawns pick from the pool of whatever biome they land in, so
// the world reads as distinct regions from the heartland out to the coast.
export const BIOME_TYPES = {
  meadow:   ['slime', 'grunt', 'wolf'],
  forest:   ['boar', 'sprite', 'wolf', 'grunt'],
  snow:     ['frostwolf', 'frostcaster', 'knight'],
  desert:   ['scarab', 'sandstalker', 'grunt'],
  swamp:    ['bogling', 'mirecaster', 'hexer'],
  ash:      ['emberhound', 'cindermage', 'brute'],
  jungle:   ['panther', 'blowpiper', 'brute'],
  crystal:  ['shardling', 'prismcaster', 'knight'],
  badlands: ['bonewalker', 'scrapshot', 'brute'],
};
export function typesForBiome(biomeKey) { return BIOME_TYPES[biomeKey] || BIOME_TYPES.meadow; }

// Where the great dragon roosts — a far-north open expanse below the high peaks.
// Scaled with the world (see terrain.js SCALE) so it stays near the northern
// peaks after the world is spread out.
import { SCALE } from './terrain.js';
export const DRAGON_ROOST = { x: -150 * SCALE, z: 210 * SCALE };

export const TYPE_BY_LEVEL = (lvl) => {
  if (lvl <= 1) return ['slime', 'slime', 'grunt'];
  if (lvl <= 3) return ['grunt', 'wolf', 'slime', 'archer'];
  if (lvl <= 5) return ['grunt', 'wolf', 'knight', 'archer'];
  if (lvl <= 7) return ['wolf', 'knight', 'brute', 'archer', 'hexer'];
  if (lvl <= 10) return ['knight', 'brute', 'wolf', 'hexer'];
  return ['brute', 'knight', 'brute', 'hexer'];
};

// ---- Telegraphed special attacks, per enemy type (shared client + server) ----
// Each winds up (a red bar fills + a ground danger zone glows), flashes full
// red, then executes. Shapes: 'lane' (dash), 'ring' (slam/jump AoE), 'arc'
// (front sweep). `dmg` is a multiple of the enemy's base damage.
export const SPECIAL_SETS = {
  slime: [
    { id: 'dash', shape: 'lane', minR: 3, maxR: 9,  windup: 0.6,  exec: 0.28, cd: [4, 7],  dashSpeed: 16, hitR: 1.5, width: 1.6, dmg: 1.25, color: 0x8fe05a },
    { id: 'jump', shape: 'ring', minR: 3, maxR: 11, windup: 0.85, exec: 0.55, cd: [6, 10], aoe: 2.4, dmg: 1.5, color: 0x8fe05a },
  ],
  grunt: [
    { id: 'slash', shape: 'arc', minR: 0, maxR: 3, windup: 0.4, exec: 0.22, cd: [3, 5], range: 2.8, arc: 1.5, dmg: 1.2, color: 0xff6a4a },
  ],
  wolf: [
    { id: 'pounce', shape: 'lane', minR: 3, maxR: 8, windup: 0.45, exec: 0.25, cd: [4, 7], dashSpeed: 17, hitR: 1.4, width: 1.5, dmg: 1.3, color: 0xcfcfcf },
  ],
  knight: [
    { id: 'slash', shape: 'arc', minR: 0, maxR: 3.2, windup: 0.5, exec: 0.24, cd: [4, 6], range: 3.2, arc: 1.8, dmg: 1.3, color: 0x9aa4ef },
    { id: 'dashstab', shape: 'lane', minR: 3, maxR: 9, windup: 0.7, exec: 0.3, cd: [6, 9], dashSpeed: 19, hitR: 1.3, width: 1.1, dmg: 1.7, color: 0x9aa4ef },
  ],
  brute: [
    { id: 'cleave', shape: 'arc', minR: 0, maxR: 3.9, windup: 0.8, exec: 0.3, cd: [5, 8], range: 3.9, arc: 2.5, dmg: 1.5, color: 0xff8a2a },
    { id: 'slam', shape: 'ring', minR: 0, maxR: 4.5, windup: 1.0, exec: 0.4, cd: [7, 11], aoe: 3.4, dmg: 1.9, color: 0xff5a1a },
  ],
  wraith: [ // Sky Wraith — a swooping dive-slash
    { id: 'dive', shape: 'lane', minR: 2, maxR: 9, windup: 0.5, exec: 0.28, cd: [4, 7], dashSpeed: 18, hitR: 1.6, width: 1.5, dmg: 1.3, color: 0xc07bff },
  ],
  dragon: [ // Vetharion — a great sweeping bite and a crashing tail slam
    { id: 'cleave', shape: 'arc', minR: 0, maxR: 5.5, windup: 0.85, exec: 0.35, cd: [5, 8], range: 5.5, arc: 2.2, dmg: 1.4, color: 0xff5a3c },
    { id: 'slam', shape: 'ring', minR: 0, maxR: 7, windup: 1.1, exec: 0.45, cd: [8, 12], aoe: 4.6, dmg: 1.7, color: 0xff3030 },
  ],
  fishman: [ // Fishfolk Raider — a trident jab and a lunging spear dash
    { id: 'trident', shape: 'arc', minR: 0, maxR: 3, windup: 0.42, exec: 0.22, cd: [3, 5], range: 2.9, arc: 1.4, dmg: 1.25, color: 0x9be0c8 },
    { id: 'lunge', shape: 'lane', minR: 3, maxR: 8, windup: 0.5, exec: 0.26, cd: [5, 8], dashSpeed: 16, hitR: 1.4, width: 1.6, dmg: 1.35, color: 0x6fc8ff },
  ],
};
// A basic telegraphed strike every melee foe falls back to, so the many themed
// creatures without a bespoke special still attack (enemies only deal damage via
// telegraphed specials). Ranged foes attack with projectiles and get none.
const DEFAULT_MELEE = [
  { id: 'strike', shape: 'arc', minR: 0, maxR: 3, windup: 0.45, exec: 0.22, cd: [3, 5], range: 2.9, arc: 1.5, dmg: 1.2, color: 0xffd0a0 },
];

// ---- Boss attack rotation ----
// Every named boss (Archfiend + Lieutenant) cycles through this fixed sequence of
// big, readable, telegraphed attacks instead of the small per-type specials. New
// telegraph shapes drive them (handled in both the client renderer and the
// authoritative server sim so multiplayer stays identical):
//   • 'multicone' — winds up, then fans out several damage cones at once
//   • 'lane'      — a long, wide charging dash across a large area
//   • 'shockwave' — an expanding ground ring you must JUMP over to avoid
//   • 'arc'       — one massive frontal cone
//   • 'nova'      — a bullet-hell burst of many radial projectiles
export const BOSS_SPECIALS = [
  { id: 'b_multicone', shape: 'multicone', minR: 0, maxR: 16, windup: 1.05, exec: 0.32, cd: [4.5, 6.5], cones: 3, spread: 0.85, range: 12, arc: 0.52, dmg: 1.4, color: 0xff7a2a },
  { id: 'b_dash',      shape: 'lane',      minR: 4, maxR: 22, windup: 0.85, exec: 0.42, cd: [4.5, 6.5], dashSpeed: 27, hitR: 2.7, width: 4.2, maxR: 22, dmg: 1.7, color: 0xff5a3c },
  { id: 'b_shock',     shape: 'shockwave', minR: 0, maxR: 18, windup: 1.0,  exec: 0.95, cd: [5, 7],     waveMax: 15, band: 2.0, dmg: 1.6, color: 0xffd23c },
  { id: 'b_cone',      shape: 'arc',       minR: 0, maxR: 13, windup: 0.95, exec: 0.32, cd: [4.5, 6.5], range: 12, arc: 1.5, dmg: 1.8, color: 0xff3030 },
  { id: 'b_nova',      shape: 'nova',      minR: 0, maxR: 24, windup: 1.0,  exec: 0.35, cd: [5, 7],     count: 20, projSpeed: 12, projColor: 0xc07bff, range: 22, dmg: 1.05, color: 0xc07bff },
];

export function specialsFor(typeId, ranged, boss) {
  if (boss) return BOSS_SPECIALS;
  if (ranged) return [];
  return SPECIAL_SETS[typeId] || DEFAULT_MELEE;
}

// Look a special definition up by id across every known set (per-type, default,
// and boss) — used by the multiplayer client to resolve a server-sent telegraph.
export function findSpecial(typeId, id) {
  const pools = [BOSS_SPECIALS, SPECIAL_SETS[typeId] || [], DEFAULT_MELEE];
  for (const pool of pools) { const s = pool.find((x) => x.id === id); if (s) return s; }
  return null;
}

// Per-biome boss colouring so an Archfiend/Lieutenant looks like it belongs to
// its reach (fire-scorched in the ash, rimed in the snow, and so on). Applied
// wherever a boss mesh is built, keyed off the boss's map position.
import { biomeKeyAt } from './terrain.js';
export const BOSS_THEME = {
  meadow:   { color: 0x2a1a30, accent: 0xff3030 },
  forest:   { color: 0x244a1f, accent: 0x9be36a },
  snow:     { color: 0xafe0f4, accent: 0x6fc8ff },
  desert:   { color: 0xbfa05a, accent: 0xffcf6a },
  swamp:    { color: 0x2f3f22, accent: 0x8fd86a },
  ash:      { color: 0x3a1610, accent: 0xff5a2a },
  jungle:   { color: 0x1f3a1a, accent: 0x6fd86a },
  crystal:  { color: 0x7a6ad0, accent: 0xcdf2ff },
  badlands: { color: 0x6a3f22, accent: 0xffb060 },
};
export function bossThemeAt(x, z) { return BOSS_THEME[biomeKeyAt(x, z)] || BOSS_THEME.meadow; }

// The single derivation of an enemy's level-scaled combat stats — used by both
// the client Enemy and the server SimEnemy so they always agree.
export function deriveStats(typeId, level, opts = {}) {
  const type = TYPES[typeId] || TYPES.grunt;
  const boss = !!opts.boss, elite = !!opts.elite;
  // A Lieutenant is a "mini-boss": still a named boss (bar, telegraphs,
  // persistence) but tuned lighter than an Archfiend, so it reads as the
  // reach's warm-up encounter rather than a second raid boss.
  const mini = boss && !!opts.miniboss;
  const lvlScale = 1 + (level - 1) * 0.32;
  const em = mini ? 4.5 : boss ? 8 : elite ? 2.4 : 1;
  return {
    maxHp: Math.round(type.hp * lvlScale * em),
    dmg: type.dmg * (1 + (level - 1) * 0.22) * (mini ? 1.6 : boss ? 1.9 : elite ? 1.5 : 1),
    xp: Math.round(type.xp * (1 + (level - 1) * 0.4) * (mini ? 4.5 : boss ? 7 : elite ? 2.5 : 1)),
    displayScale: type.scale * (mini ? 1.85 : boss ? 2.3 : elite ? 1.35 : 1),
  };
}
