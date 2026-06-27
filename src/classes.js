// ============================================================
// D&D-flavoured class definitions. Each class sets base vitals,
// per-level growth, a color for the stickman, and a hotbar of
// abilities. Abilities are data-driven and resolved in combat.js.
// ============================================================

// Ability "kind" tells combat.js how to resolve it:
//   melee   — instant hit in a forward arc
//   projectile — spawns a travelling bolt
//   heal    — restores HP to self
//   buff    — temporary self buff (damage / speed / shield)
//   dash    — quick reposition + small hit
export const CLASSES = {
  fighter: {
    name: 'Fighter', glyph: '⚔️', tag: 'Sturdy melee bruiser',
    color: 0x9aa4b2, accent: 0xd8423c,
    desc: 'A disciplined warrior. High health and reliable melee damage. Forgiving for new adventurers.',
    base: { hp: 140, mp: 30, sp: 110, str: 16, dex: 12, int: 8 },
    growth: { hp: 18, mp: 3, sp: 8, str: 3, dex: 1.5, int: 0.5 },
    baseDamage: 14, attackSpeed: 0.55, range: 2.6,
    abilities: [
      { id: 'cleave', name: 'Cleave', kind: 'melee', glyph: '🪓', cost: 12, costType: 'sp', cooldown: 4, arc: 2.4, range: 3.2, mult: 2.1, desc: 'A wide sweep hitting all enemies in front.' },
      { id: 'shieldbash', name: 'Shield Bash', kind: 'melee', glyph: '🛡️', cost: 15, costType: 'sp', cooldown: 7, arc: 1.2, range: 2.6, mult: 1.5, stun: 1.6, desc: 'Bash a foe, stunning it briefly.' },
      { id: 'warcry', name: 'War Cry', kind: 'buff', glyph: '📣', cost: 20, costType: 'mp', cooldown: 16, buff: { dmg: 1.5, dur: 8 }, desc: '+50% damage for 8s.' },
    ],
  },
  barbarian: {
    name: 'Barbarian', glyph: '🪓', tag: 'Raging berserker',
    color: 0xb07a4a, accent: 0xff5a3c,
    desc: 'Hits like a runaway cart. Massive damage and health, but burns stamina fast. Rage rewards aggression.',
    base: { hp: 170, mp: 10, sp: 130, str: 18, dex: 11, int: 6 },
    growth: { hp: 22, mp: 1, sp: 9, str: 3.5, dex: 1.2, int: 0.3 },
    baseDamage: 18, attackSpeed: 0.6, range: 2.7,
    abilities: [
      { id: 'rage', name: 'Rage', kind: 'buff', glyph: '😤', cost: 0, costType: 'sp', cooldown: 18, buff: { dmg: 1.8, speed: 1.25, dur: 9 }, desc: '+80% damage & +25% speed for 9s. Free to use.' },
      { id: 'whirlwind', name: 'Whirlwind', kind: 'melee', glyph: '🌀', cost: 25, costType: 'sp', cooldown: 6, arc: 6.3, range: 3.4, mult: 1.6, desc: 'Spin, hitting everything around you.' },
      { id: 'leap', name: 'Leap Slam', kind: 'dash', glyph: '💥', cost: 18, costType: 'sp', cooldown: 9, range: 7, arc: 3.0, mult: 2.0, desc: 'Leap to your target and slam down.' },
    ],
  },
  rogue: {
    name: 'Rogue', glyph: '🗡️', tag: 'Nimble assassin',
    color: 0x4a4f5a, accent: 0x7ad88f,
    desc: 'Fast, fragile, and deadly from the shadows. Excels at bursting single targets and slipping away.',
    base: { hp: 100, mp: 40, sp: 140, str: 12, dex: 18, int: 10 },
    growth: { hp: 12, mp: 4, sp: 11, str: 1.5, dex: 3.5, int: 1 },
    baseDamage: 13, attackSpeed: 0.32, range: 2.4, critBonus: 0.15,
    abilities: [
      { id: 'backstab', name: 'Backstab', kind: 'melee', glyph: '🔪', cost: 12, costType: 'sp', cooldown: 5, arc: 0.9, range: 2.6, mult: 3.0, crit: 0.5, desc: 'Massive single-target strike with high crit.' },
      { id: 'dash', name: 'Shadow Dash', kind: 'dash', glyph: '💨', cost: 15, costType: 'sp', cooldown: 6, range: 8, arc: 1.4, mult: 1.4, desc: 'Blink forward through enemies, cutting them.' },
      { id: 'fan', name: 'Fan of Knives', kind: 'projectile', glyph: '🃏', cost: 18, costType: 'mp', cooldown: 7, count: 5, spread: 0.9, speed: 26, mult: 0.8, desc: 'Throw a fan of 5 knives.' },
    ],
  },
  wizard: {
    name: 'Wizard', glyph: '🔮', tag: 'Arcane glass cannon',
    color: 0x5a4a8a, accent: 0x6f9aef,
    desc: 'Commands devastating spells from range. Tiny health pool — positioning is everything.',
    base: { hp: 80, mp: 130, sp: 90, str: 7, dex: 11, int: 18 },
    growth: { hp: 10, mp: 16, sp: 6, str: 0.5, dex: 1, int: 3.5 },
    baseDamage: 9, attackSpeed: 0.5, range: 16, ranged: true, projGlyph: 'spark',
    abilities: [
      { id: 'firebolt', name: 'Fireball', kind: 'projectile', glyph: '🔥', cost: 18, costType: 'mp', cooldown: 2.5, speed: 22, mult: 2.4, aoe: 3, desc: 'Hurl an explosive fireball.' },
      { id: 'frost', name: 'Frost Nova', kind: 'buff', glyph: '❄️', cost: 24, costType: 'mp', cooldown: 9, nova: { radius: 6, mult: 1.4, slow: 3 }, desc: 'Freeze nearby foes, slowing them.' },
      { id: 'blink', name: 'Blink', kind: 'dash', glyph: '✨', cost: 16, costType: 'mp', cooldown: 7, range: 9, arc: 0, mult: 0, desc: 'Teleport in your facing direction.' },
    ],
  },
  cleric: {
    name: 'Cleric', glyph: '✨', tag: 'Holy support',
    color: 0xc9c2a0, accent: 0xffe27a,
    desc: 'Smites foes and mends wounds. Self-sustaining and durable — the best survivor for solo play.',
    base: { hp: 120, mp: 110, sp: 100, str: 13, dex: 10, int: 15 },
    growth: { hp: 15, mp: 13, sp: 7, str: 2, dex: 1, int: 3 },
    baseDamage: 11, attackSpeed: 0.5, range: 12, ranged: true, projGlyph: 'holy',
    abilities: [
      { id: 'heal', name: 'Heal', kind: 'heal', glyph: '💚', cost: 22, costType: 'mp', cooldown: 3, amount: 0.32, desc: 'Restore a chunk of your health.' },
      { id: 'smite', name: 'Smite', kind: 'projectile', glyph: '⚡', cost: 16, costType: 'mp', cooldown: 1.8, speed: 30, mult: 2.0, holy: true, desc: 'Call down a bolt of holy light.' },
      { id: 'sanctuary', name: 'Sanctuary', kind: 'buff', glyph: '🛡️', cost: 28, costType: 'mp', cooldown: 20, buff: { shield: 0.5, dur: 8 }, desc: 'Shield absorbing damage for 8s.' },
    ],
  },
  ranger: {
    name: 'Ranger', glyph: '🏹', tag: 'Wilderness marksman',
    color: 0x5a7a4a, accent: 0x9bd86a,
    desc: 'A deadly archer who kites enemies with arrows. Strong mobility and steady ranged damage.',
    base: { hp: 105, mp: 50, sp: 130, str: 12, dex: 17, int: 11 },
    growth: { hp: 13, mp: 5, sp: 10, str: 1.5, dex: 3, int: 1.5 },
    baseDamage: 12, attackSpeed: 0.4, range: 18, ranged: true, projGlyph: 'arrow',
    abilities: [
      { id: 'power', name: 'Power Shot', kind: 'projectile', glyph: '🎯', cost: 14, costType: 'sp', cooldown: 3, speed: 36, mult: 2.6, pierce: true, desc: 'A piercing arrow that hits all in its path.' },
      { id: 'multishot', name: 'Multishot', kind: 'projectile', glyph: '🏹', cost: 18, costType: 'sp', cooldown: 6, count: 3, spread: 0.5, speed: 30, mult: 1.3, desc: 'Fire 3 arrows in a spread.' },
      { id: 'roll', name: 'Roll', kind: 'dash', glyph: '🤸', cost: 12, costType: 'sp', cooldown: 4, range: 6, arc: 0, mult: 0, iframes: 0.5, desc: 'Dodge roll with brief invulnerability.' },
    ],
  },
};

export const CLASS_ORDER = ['fighter', 'barbarian', 'rogue', 'wizard', 'cleric', 'ranger'];

// XP needed to advance FROM the given level to the next.
export function xpForLevel(level) {
  return Math.floor(80 * Math.pow(level, 1.45) + 40);
}

// Build a fresh stat block for a class at level 1.
export function makeStats(classId) {
  const c = CLASSES[classId];
  const s = {
    classId,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    maxHp: c.base.hp, hp: c.base.hp,
    maxMp: c.base.mp, mp: c.base.mp,
    maxSp: c.base.sp, sp: c.base.sp,
    str: c.base.str, dex: c.base.dex, int: c.base.int,
  };
  return s;
}

// Apply a single level-up to a stat block (mutates and returns it).
export function applyLevelUp(s) {
  const c = CLASSES[s.classId];
  s.level += 1;
  s.maxHp += c.growth.hp;
  s.maxMp += c.growth.mp;
  s.maxSp += c.growth.sp;
  s.str += c.growth.str;
  s.dex += c.growth.dex;
  s.int += c.growth.int;
  // Level-up fully restores vitals (classic RPG dopamine hit).
  s.hp = s.maxHp; s.mp = s.maxMp; s.sp = s.maxSp;
  s.xp -= s.xpNext;
  s.xpNext = xpForLevel(s.level);
  return s;
}

// The class's primary scaling stat, used to compute attack power.
export function primaryStat(classId, stats) {
  const c = CLASSES[classId];
  if (c.ranged && classId !== 'cleric') return stats.dex;
  if (classId === 'wizard' || classId === 'cleric') return stats.int;
  return stats.str;
}

// Final per-hit attack power for the auto-attack / ability multipliers.
export function attackPower(classId, stats) {
  const c = CLASSES[classId];
  return c.baseDamage + primaryStat(classId, stats) * 1.1 + stats.level * 1.5;
}
