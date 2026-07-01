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
};

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
};
export function specialsFor(typeId, ranged) { return (!ranged && SPECIAL_SETS[typeId]) ? SPECIAL_SETS[typeId] : []; }

// The single derivation of an enemy's level-scaled combat stats — used by both
// the client Enemy and the server SimEnemy so they always agree.
export function deriveStats(typeId, level, opts = {}) {
  const type = TYPES[typeId] || TYPES.grunt;
  const boss = !!opts.boss, elite = !!opts.elite;
  const lvlScale = 1 + (level - 1) * 0.32;
  const em = boss ? 8 : elite ? 2.4 : 1;
  return {
    maxHp: Math.round(type.hp * lvlScale * em),
    dmg: type.dmg * (1 + (level - 1) * 0.22) * (boss ? 1.9 : elite ? 1.5 : 1),
    xp: Math.round(type.xp * (1 + (level - 1) * 0.4) * (boss ? 7 : elite ? 2.5 : 1)),
    displayScale: type.scale * (boss ? 2.3 : elite ? 1.35 : 1),
  };
}
