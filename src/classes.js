// ============================================================
// Class & progression data. Ten D&D-flavoured classes, each with a
// POOL of abilities that are *learned* over levels (you don't start
// with them all) and can be *ranked up* for more depth. Stats grow
// partly automatically and partly via player choice at level-up.
// ============================================================

export const MAX_RANK = 3;

// ---- Ability "kind" → how combat.js resolves it ----
//   melee      — instant hit in a forward arc
//   projectile — one or more travelling bolts
//   groundaoe  — delayed explosion at a point ahead (telegraphed)
//   chain      — bolt that arcs between nearby enemies
//   dot        — applies damage-over-time (poison/burn) in an area
//   lifesteal  — melee that heals you for a share of damage dealt
//   heal       — restore HP to self
//   buff       — temporary self buff (and/or a nova on cast)
//   dash       — quick reposition, optional hit + i-frames
//   summon     — spawn a temporary spirit/turret that attacks for you
//
// Common fields: id, name, kind, glyph, cost, costType('mp'|'sp'),
// cooldown, reqLevel, desc, color (FX tint). Plus kind-specific params.

export const CLASSES = {
  fighter: {
    name: 'Fighter', glyph: '⚔️', tag: 'Sturdy melee bruiser',
    color: 0x9aa4b2, accent: 0xd8423c,
    desc: 'A disciplined warrior — high health, reliable melee. Forgiving and flexible.',
    primary: 'str',
    base: { hp: 140, mp: 30, sp: 110, str: 16, dex: 12, int: 8 },
    growth: { hp: 14, mp: 2, sp: 7 },
    baseDamage: 14, attackSpeed: 0.55, range: 2.6,
    abilities: [
      { id: 'cleave', name: 'Cleave', kind: 'melee', glyph: '🪓', cost: 12, costType: 'sp', cooldown: 4, reqLevel: 1, arc: 2.4, range: 3.2, mult: 2.0, color: 0xffffff, desc: 'Wide sweep hitting all foes in front.' },
      { id: 'shieldbash', name: 'Shield Bash', kind: 'melee', glyph: '🛡️', cost: 15, costType: 'sp', cooldown: 7, reqLevel: 3, arc: 1.2, range: 2.6, mult: 1.5, stun: 1.6, color: 0xffe27a, desc: 'Bash a foe, stunning it.' },
      { id: 'warcry', name: 'War Cry', kind: 'buff', glyph: '📣', cost: 20, costType: 'mp', cooldown: 16, reqLevel: 5, buff: { dmg: 1.5, dur: 8 }, color: 0xff8a2a, desc: '+50% damage for 8s.' },
      { id: 'sunder', name: 'Sunder', kind: 'dot', glyph: '🩸', cost: 16, costType: 'sp', cooldown: 9, reqLevel: 7, radius: 2.8, dotDps: 8, dotDur: 6, color: 0xcc3333, desc: 'Rend nearby foes, bleeding them over time.' },
      { id: 'whirl', name: 'Whirlwind', kind: 'melee', glyph: '🌀', cost: 22, costType: 'sp', cooldown: 6, reqLevel: 9, arc: 6.3, range: 3.2, mult: 1.6, color: 0xcfe8ff, desc: 'Spin, striking everything around you.' },
      { id: 'execute', name: 'Execute', kind: 'melee', glyph: '💀', cost: 20, costType: 'sp', cooldown: 8, reqLevel: 12, arc: 0.55, range: 3.0, mult: 4.0, execute: true, color: 0xff3030, desc: 'Focused killing thrust in a narrow cone; massive bonus to wounded foes.' },
    ],
  },

  barbarian: {
    name: 'Barbarian', glyph: '🪓', tag: 'Raging berserker',
    color: 0xb07a4a, accent: 0xff5a3c,
    desc: 'Hits like a runaway cart. Massive damage & health, burns stamina fast.',
    primary: 'str',
    base: { hp: 170, mp: 10, sp: 130, str: 18, dex: 11, int: 6 },
    growth: { hp: 18, mp: 1, sp: 8 },
    baseDamage: 18, attackSpeed: 0.6, range: 2.7,
    abilities: [
      { id: 'rage', name: 'Rage', kind: 'buff', glyph: '😤', cost: 0, costType: 'sp', cooldown: 18, reqLevel: 1, buff: { dmg: 1.8, speed: 1.25, dur: 9 }, color: 0xff3030, desc: '+80% dmg & +25% speed for 9s. Free.' },
      { id: 'leap', name: 'Leap Slam', kind: 'dash', glyph: '💥', cost: 18, costType: 'sp', cooldown: 9, reqLevel: 3, range: 7, arc: 3.0, mult: 2.0, color: 0xffae42, desc: 'Leap forward and slam down.' },
      { id: 'whirlwind', name: 'Whirlwind', kind: 'melee', glyph: '🌀', cost: 24, costType: 'sp', cooldown: 6, reqLevel: 5, arc: 6.3, range: 3.4, mult: 1.7, color: 0xcfe8ff, desc: 'Spin, hitting everything around you.' },
      { id: 'quake', name: 'Earthquake', kind: 'groundaoe', glyph: '🌋', cost: 26, costType: 'sp', cooldown: 10, reqLevel: 7, range: 6, aoe: 4.5, mult: 2.4, delay: 0.6, color: 0x8a5a2a, desc: 'Smash the ground for a delayed quake.' },
      { id: 'bloodlust', name: 'Bloodlust', kind: 'lifesteal', glyph: '🩸', cost: 20, costType: 'sp', cooldown: 7, reqLevel: 9, arc: 1.4, range: 2.8, mult: 2.2, leech: 0.45, color: 0xcc2222, desc: 'Brutal strike that heals you.' },
      { id: 'reckless', name: 'Reckless Roar', kind: 'buff', glyph: '🔥', cost: 30, costType: 'sp', cooldown: 22, reqLevel: 12, buff: { dmg: 2.2, speed: 1.4, dur: 7 }, color: 0xff5a3c, desc: 'Go berserk: +120% dmg, +40% speed.' },
    ],
  },

  rogue: {
    name: 'Rogue', glyph: '🗡️', tag: 'Nimble assassin',
    color: 0x4a4f5a, accent: 0x7ad88f,
    desc: 'Fast, fragile, deadly. Bursts single targets and slips away.',
    primary: 'dex',
    base: { hp: 100, mp: 40, sp: 140, str: 12, dex: 18, int: 10 },
    growth: { hp: 10, mp: 3, sp: 10 }, critBonus: 0.15,
    baseDamage: 13, attackSpeed: 0.32, range: 2.4,
    abilities: [
      { id: 'backstab', name: 'Backstab', kind: 'melee', glyph: '🔪', cost: 12, costType: 'sp', cooldown: 5, reqLevel: 1, arc: 0.5, range: 2.8, mult: 3.8, crit: 0.5, color: 0x7ad88f, desc: 'A thin, focused thrust straight ahead — massive single hit, high crit.' },
      { id: 'dash', name: 'Shadow Dash', kind: 'dash', glyph: '💨', cost: 15, costType: 'sp', cooldown: 6, reqLevel: 2, range: 8, arc: 1.4, mult: 1.4, color: 0x9aa4ef, desc: 'Blink through enemies, cutting them.' },
      { id: 'fan', name: 'Fan of Knives', kind: 'projectile', glyph: '🃏', cost: 16, costType: 'sp', cooldown: 7, reqLevel: 4, count: 5, spread: 0.9, speed: 26, mult: 0.8, color: 0xcfcfcf, shape: 'blade', desc: 'Throw a fan of 5 knives.' },
      { id: 'poison', name: 'Envenom', kind: 'dot', glyph: '🧪', cost: 14, costType: 'sp', cooldown: 8, reqLevel: 6, radius: 2.4, dotDps: 12, dotDur: 6, color: 0x6fae54, desc: 'Coat blades in venom — poisons foes.' },
      { id: 'roll', name: 'Evasive Roll', kind: 'dash', glyph: '🤸', cost: 12, costType: 'sp', cooldown: 4, reqLevel: 8, range: 6, arc: 0, mult: 0, iframes: 0.5, color: 0xffffff, desc: 'Dodge roll with brief invulnerability.' },
      { id: 'assassinate', name: 'Assassinate', kind: 'melee', glyph: '☠️', cost: 22, costType: 'sp', cooldown: 10, reqLevel: 11, arc: 0.45, range: 3.2, mult: 5.6, crit: 0.7, color: 0xff3030, desc: 'A razor cone straight ahead — devastating, near-guaranteed killing blow.' },
    ],
  },

  wizard: {
    name: 'Wizard', glyph: '🔮', tag: 'Arcane glass cannon',
    color: 0x5a4a8a, accent: 0x6f9aef,
    desc: 'Devastating spells from range. Tiny health — positioning is everything.',
    primary: 'int', ranged: true, projGlyph: 'spark', projColor: 0x6f9aef,
    base: { hp: 80, mp: 130, sp: 90, str: 7, dex: 11, int: 18 },
    growth: { hp: 8, mp: 12, sp: 5 },
    baseDamage: 9, attackSpeed: 0.5, range: 16,
    abilities: [
      { id: 'firebolt', name: 'Fireball', kind: 'projectile', glyph: '🔥', cost: 18, costType: 'mp', cooldown: 2.5, reqLevel: 1, speed: 22, mult: 2.4, aoe: 3, color: 0xff6a2a, shape: 'orb', desc: 'Explosive fireball.' },
      { id: 'frost', name: 'Frost Nova', kind: 'buff', glyph: '❄️', cost: 24, costType: 'mp', cooldown: 9, reqLevel: 3, nova: { radius: 6, mult: 1.4, slow: 3 }, color: 0x9fe0ff, desc: 'Freeze nearby foes, slowing them.' },
      { id: 'blink', name: 'Blink', kind: 'dash', glyph: '✨', cost: 16, costType: 'mp', cooldown: 7, reqLevel: 4, range: 9, arc: 0, mult: 0, color: 0xb79aff, desc: 'Teleport in your facing direction.' },
      { id: 'chain', name: 'Chain Lightning', kind: 'chain', glyph: '⚡', cost: 22, costType: 'mp', cooldown: 5, reqLevel: 6, jumps: 4, range: 9, mult: 1.8, color: 0x9fe0ff, desc: 'Lightning arcs between enemies.' },
      { id: 'meteor', name: 'Meteor', kind: 'groundaoe', glyph: '☄️', cost: 34, costType: 'mp', cooldown: 11, reqLevel: 9, range: 12, aoe: 5, mult: 3.4, delay: 0.9, color: 0xff5a2a, desc: 'Call a meteor onto a distant point.' },
      { id: 'arcaneorb', name: 'Arcane Orb', kind: 'projectile', glyph: '🟣', cost: 28, costType: 'mp', cooldown: 6, reqLevel: 12, speed: 12, mult: 1.4, pierce: true, aoe: 2, color: 0xb05aff, shape: 'orb', desc: 'Slow piercing orb that detonates repeatedly.' },
    ],
  },

  cleric: {
    name: 'Cleric', glyph: '✨', tag: 'Holy support',
    color: 0xc9c2a0, accent: 0xffe27a,
    desc: 'Smites foes and mends wounds. Self-sustaining — the best solo survivor.',
    primary: 'int', ranged: true, projGlyph: 'holy', projColor: 0xffe27a,
    base: { hp: 120, mp: 110, sp: 100, str: 13, dex: 10, int: 15 },
    growth: { hp: 12, mp: 10, sp: 6 },
    baseDamage: 11, attackSpeed: 0.5, range: 12,
    abilities: [
      { id: 'smite', name: 'Smite', kind: 'projectile', glyph: '⚡', cost: 14, costType: 'mp', cooldown: 1.8, reqLevel: 1, speed: 30, mult: 2.0, color: 0xffe27a, shape: 'orb', holy: true, desc: 'A bolt of holy light.' },
      { id: 'heal', name: 'Heal', kind: 'heal', glyph: '💚', cost: 22, costType: 'mp', cooldown: 3, reqLevel: 2, amount: 0.32, color: 0x7bf08a, desc: 'Restore a chunk of health.' },
      { id: 'sanctuary', name: 'Sanctuary', kind: 'buff', glyph: '🛡️', cost: 28, costType: 'mp', cooldown: 20, reqLevel: 4, buff: { shield: 0.5, dur: 8 }, color: 0xffe27a, desc: 'Shield absorbing damage for 8s.' },
      { id: 'holynova', name: 'Holy Nova', kind: 'buff', glyph: '🌟', cost: 26, costType: 'mp', cooldown: 8, reqLevel: 6, nova: { radius: 6, mult: 1.6 }, selfHeal: 0.18, color: 0xfff2c0, desc: 'Burst of light: damages foes, heals you.' },
      { id: 'consecrate', name: 'Consecrate', kind: 'dot', glyph: '🔆', cost: 24, costType: 'mp', cooldown: 9, reqLevel: 9, radius: 4, dotDps: 14, dotDur: 6, holy: true, color: 0xffe27a, desc: 'Sanctify the ground, burning foes on it.' },
      { id: 'judgement', name: 'Judgement', kind: 'groundaoe', glyph: '⚖️', cost: 32, costType: 'mp', cooldown: 10, reqLevel: 12, range: 11, aoe: 4.5, mult: 3.2, delay: 0.7, holy: true, color: 0xfff2c0, desc: 'Pillar of light strikes a point.' },
    ],
  },

  ranger: {
    name: 'Ranger', glyph: '🏹', tag: 'Wilderness marksman',
    color: 0x5a7a4a, accent: 0x9bd86a,
    desc: 'A deadly archer who kites with arrows. Strong mobility & ranged damage.',
    primary: 'dex', ranged: true, projGlyph: 'arrow', projColor: 0xdddddd,
    base: { hp: 105, mp: 50, sp: 130, str: 12, dex: 17, int: 11 },
    growth: { hp: 10, mp: 4, sp: 9 },
    baseDamage: 12, attackSpeed: 0.4, range: 18,
    abilities: [
      { id: 'power', name: 'Power Shot', kind: 'projectile', glyph: '🎯', cost: 14, costType: 'sp', cooldown: 3, reqLevel: 1, speed: 36, mult: 2.6, pierce: true, color: 0xffe27a, shape: 'arrow', desc: 'Piercing arrow that hits all in its path.' },
      { id: 'multishot', name: 'Multishot', kind: 'projectile', glyph: '🏹', cost: 18, costType: 'sp', cooldown: 6, reqLevel: 3, count: 3, spread: 0.5, speed: 30, mult: 1.3, color: 0xdddddd, shape: 'arrow', desc: 'Fire 3 arrows in a spread.' },
      { id: 'rollr', name: 'Roll', kind: 'dash', glyph: '🤸', cost: 12, costType: 'sp', cooldown: 4, reqLevel: 4, range: 6, arc: 0, mult: 0, iframes: 0.5, color: 0xffffff, desc: 'Dodge roll with brief invulnerability.' },
      { id: 'poisonarrow', name: 'Serpent Arrow', kind: 'dot', glyph: '🐍', cost: 16, costType: 'sp', cooldown: 7, reqLevel: 6, radius: 2.6, dotDps: 13, dotDur: 6, color: 0x6fae54, desc: 'Venomous arrow poisons the area.' },
      { id: 'hawk', name: 'Hawk Companion', kind: 'summon', glyph: '🦅', cost: 24, costType: 'sp', cooldown: 16, reqLevel: 9, dur: 12, atkEvery: 1.0, mult: 1.1, color: 0xcfa46a, desc: 'Summon a hawk that dives at foes.' },
      { id: 'rain', name: 'Arrow Rain', kind: 'groundaoe', glyph: '🌧️', cost: 28, costType: 'sp', cooldown: 10, reqLevel: 12, range: 14, aoe: 5, mult: 2.6, delay: 0.7, color: 0xbfe0a0, desc: 'Volley of arrows rains on a point.' },
    ],
  },

  paladin: {
    name: 'Paladin', glyph: '🛡️', tag: 'Holy juggernaut',
    color: 0xd9d2b0, accent: 0xffd24a,
    desc: 'Plate-clad zealot blending heavy melee with holy magic and self-healing.',
    primary: 'str',
    base: { hp: 155, mp: 70, sp: 100, str: 16, dex: 10, int: 13 },
    growth: { hp: 15, mp: 6, sp: 6 },
    baseDamage: 14, attackSpeed: 0.58, range: 2.7,
    abilities: [
      { id: 'crusader', name: 'Crusader Strike', kind: 'lifesteal', glyph: '⚔️', cost: 10, costType: 'sp', cooldown: 4, reqLevel: 1, arc: 1.4, range: 2.8, mult: 2.0, leech: 0.3, color: 0xffd24a, desc: 'Holy strike that heals you.' },
      { id: 'shieldp', name: 'Sacred Shield', kind: 'buff', glyph: '🛡️', cost: 22, costType: 'mp', cooldown: 16, reqLevel: 3, buff: { shield: 0.55, dur: 8 }, color: 0xfff2c0, desc: 'Holy barrier absorbs damage.' },
      { id: 'hammer', name: 'Hammer of Justice', kind: 'projectile', glyph: '🔨', cost: 18, costType: 'mp', cooldown: 6, reqLevel: 5, speed: 20, mult: 2.0, aoe: 2.5, stunOnHit: 1.2, color: 0xffe27a, shape: 'orb', holy: true, desc: 'Hurl a stunning holy hammer.' },
      { id: 'layhands', name: 'Lay on Hands', kind: 'heal', glyph: '🙌', cost: 30, costType: 'mp', cooldown: 12, reqLevel: 7, amount: 0.5, color: 0x7bf08a, desc: 'A powerful self-heal.' },
      { id: 'consecratep', name: 'Consecration', kind: 'dot', glyph: '🔆', cost: 24, costType: 'mp', cooldown: 9, reqLevel: 9, radius: 4, dotDps: 13, dotDur: 6, holy: true, color: 0xffe27a, desc: 'Holy ground burns nearby foes.' },
      { id: 'avenging', name: 'Avenging Wrath', kind: 'buff', glyph: '😇', cost: 30, costType: 'mp', cooldown: 24, reqLevel: 12, buff: { dmg: 1.7, dur: 10 }, selfHeal: 0.25, color: 0xffd24a, desc: 'Wings of light: +70% dmg, heals you.' },
    ],
  },

  warlock: {
    name: 'Warlock', glyph: '😈', tag: 'Dark afflictor',
    color: 0x4a2a5a, accent: 0xb05aff,
    desc: 'Curses, drains, and damage-over-time. Sustains by stealing life from afar.',
    primary: 'int', ranged: true, projGlyph: 'shadow', projColor: 0xb05aff,
    base: { hp: 100, mp: 120, sp: 90, str: 8, dex: 11, int: 17 },
    growth: { hp: 10, mp: 11, sp: 5 },
    baseDamage: 10, attackSpeed: 0.5, range: 15,
    abilities: [
      { id: 'shadowbolt', name: 'Shadow Bolt', kind: 'projectile', glyph: '🟣', cost: 14, costType: 'mp', cooldown: 1.6, reqLevel: 1, speed: 24, mult: 2.0, color: 0xb05aff, shape: 'orb', desc: 'A bolt of dark energy.' },
      { id: 'drain', name: 'Drain Life', kind: 'lifesteal', glyph: '🩸', cost: 18, costType: 'mp', cooldown: 4, reqLevel: 2, arc: 1.0, range: 11, ranged: true, mult: 1.8, leech: 0.6, color: 0xcc4488, desc: 'Siphon a foe\'s life into yours (ranged).' },
      { id: 'corruption', name: 'Corruption', kind: 'dot', glyph: '🟢', cost: 16, costType: 'mp', cooldown: 6, reqLevel: 4, radius: 3, dotDps: 16, dotDur: 8, color: 0x6fae54, desc: 'Rot spreads through an area.' },
      { id: 'fear', name: 'Howl of Fear', kind: 'buff', glyph: '👻', cost: 22, costType: 'mp', cooldown: 12, reqLevel: 6, nova: { radius: 6, mult: 0.6, fear: 3 }, color: 0xb79aff, desc: 'Terrify nearby foes, sending them fleeing.' },
      { id: 'imp', name: 'Summon Imp', kind: 'summon', glyph: '👹', cost: 26, costType: 'mp', cooldown: 16, reqLevel: 9, dur: 14, atkEvery: 1.2, mult: 1.2, color: 0xff5a3c, desc: 'A cackling imp flings fire at your foes.' },
      { id: 'doom', name: 'Doom', kind: 'groundaoe', glyph: '💀', cost: 34, costType: 'mp', cooldown: 11, reqLevel: 12, range: 12, aoe: 5, mult: 3.2, delay: 0.8, color: 0x8a2abf, desc: 'A column of shadow annihilates a point.' },
    ],
  },

  monk: {
    name: 'Monk', glyph: '👊', tag: 'Martial artist',
    color: 0xc98a4a, accent: 0xffcf6a,
    desc: 'Lightning-fast unarmed combos and incredible mobility. Low cooldowns.',
    primary: 'dex',
    base: { hp: 115, mp: 60, sp: 140, str: 13, dex: 17, int: 11 },
    growth: { hp: 12, mp: 5, sp: 10 }, critBonus: 0.08,
    baseDamage: 11, attackSpeed: 0.26, range: 2.3,
    abilities: [
      { id: 'jab', name: 'Tiger Palm', kind: 'melee', glyph: '👊', cost: 8, costType: 'sp', cooldown: 2, reqLevel: 1, arc: 1.0, range: 2.5, mult: 1.8, color: 0xffcf6a, desc: 'Rapid focused strike.' },
      { id: 'flyingkick', name: 'Flying Kick', kind: 'dash', glyph: '🦵', cost: 12, costType: 'sp', cooldown: 4, reqLevel: 2, range: 8, arc: 1.6, mult: 1.8, color: 0xffe27a, desc: 'Dash-kick through enemies.' },
      { id: 'palm', name: 'Wave Palm', kind: 'projectile', glyph: '🌊', cost: 14, costType: 'sp', cooldown: 4, reqLevel: 4, speed: 18, mult: 1.6, aoe: 2.5, color: 0x6fc8ff, shape: 'orb', desc: 'A blast of chi energy.' },
      { id: 'spinkick', name: 'Spinning Crane', kind: 'melee', glyph: '🌀', cost: 18, costType: 'sp', cooldown: 5, reqLevel: 6, arc: 6.3, range: 3.0, mult: 1.5, color: 0xcfe8ff, desc: 'Whirl, striking all around.' },
      { id: 'meditate', name: 'Meditate', kind: 'heal', glyph: '🧘', cost: 16, costType: 'mp', cooldown: 8, reqLevel: 8, amount: 0.28, color: 0x7bf08a, desc: 'Channel inner peace to heal.' },
      { id: 'thousand', name: 'Thousand Fists', kind: 'melee', glyph: '✊', cost: 24, costType: 'sp', cooldown: 8, reqLevel: 11, arc: 0.7, range: 3.2, mult: 4.6, color: 0xffd24a, desc: 'A blinding focused flurry of blows straight ahead.' },
    ],
  },

  druid: {
    name: 'Druid', glyph: '🍃', tag: 'Shapeshifting naturalist',
    color: 0x4a7a3a, accent: 0x9bd86a,
    desc: 'Commands nature — thorns, poison, summoned beasts, and healing. Versatile.',
    primary: 'int', ranged: true, projGlyph: 'nature', projColor: 0x9bd86a,
    base: { hp: 120, mp: 100, sp: 100, str: 12, dex: 12, int: 15 },
    growth: { hp: 12, mp: 9, sp: 7 },
    baseDamage: 11, attackSpeed: 0.5, range: 13,
    abilities: [
      { id: 'moonfire', name: 'Moonfire', kind: 'projectile', glyph: '🌙', cost: 14, costType: 'mp', cooldown: 1.8, reqLevel: 1, speed: 26, mult: 1.9, color: 0x9bd86a, shape: 'orb', desc: 'A bolt of lunar fire.' },
      { id: 'thorns', name: 'Thornfield', kind: 'dot', glyph: '🌵', cost: 16, costType: 'mp', cooldown: 6, reqLevel: 3, radius: 3.5, dotDps: 14, dotDur: 7, color: 0x6fae54, desc: 'Brambles erupt, shredding foes.' },
      { id: 'rejuv', name: 'Rejuvenation', kind: 'heal', glyph: '🌱', cost: 20, costType: 'mp', cooldown: 4, reqLevel: 4, amount: 0.3, color: 0x7bf08a, desc: 'Restore health with living energy.' },
      { id: 'cyclone', name: 'Cyclone', kind: 'dash', glyph: '🌪️', cost: 16, costType: 'mp', cooldown: 6, reqLevel: 6, range: 8, arc: 2.0, mult: 1.6, color: 0xcfe8ff, desc: 'Become wind, blowing through foes.' },
      { id: 'treant', name: 'Summon Treant', kind: 'summon', glyph: '🌳', cost: 26, costType: 'mp', cooldown: 16, reqLevel: 9, dur: 14, atkEvery: 1.4, mult: 1.4, color: 0x4a7a3a, desc: 'A walking tree pummels your foes.' },
      { id: 'hurricane', name: 'Hurricane', kind: 'groundaoe', glyph: '🌀', cost: 32, costType: 'mp', cooldown: 11, reqLevel: 12, range: 12, aoe: 5.5, mult: 3.0, delay: 0.8, color: 0x6fc8ff, desc: 'A roaring storm batters a point.' },
    ],
  },
};

export const CLASS_ORDER = ['fighter', 'barbarian', 'rogue', 'wizard', 'cleric', 'ranger', 'paladin', 'warlock', 'monk', 'druid'];

// XP needed to advance FROM the given level to the next.
export function xpForLevel(level) {
  return Math.floor(80 * Math.pow(level, 1.45) + 40);
}

// Look up an ability def by id within a class.
export function getAbility(classId, id) {
  return CLASSES[classId].abilities.find((a) => a.id === id);
}

// The signature ability every class starts knowing (its first entry).
export function startingAbilityId(classId) {
  return CLASSES[classId].abilities[0].id;
}

// Effective (rank-scaled) copy of an ability. Higher ranks deal more,
// cooldown faster, throw more projectiles, and widen AoE.
export function effectiveAbility(classId, id, rank) {
  const a = getAbility(classId, id);
  const r = Math.max(1, rank | 0);
  const k = r - 1;
  const e = { ...a, rank: r };
  if (a.mult != null) e.mult = +(a.mult * (1 + 0.28 * k)).toFixed(3);
  if (a.cooldown != null) e.cooldown = +(a.cooldown * (1 - 0.12 * k)).toFixed(3);
  if (a.count != null) e.count = a.count + k;            // +1 projectile per rank
  if (a.aoe != null) e.aoe = +(a.aoe * (1 + 0.12 * k)).toFixed(3);
  if (a.radius != null) e.radius = +(a.radius * (1 + 0.12 * k)).toFixed(3);
  if (a.dotDps != null) e.dotDps = +(a.dotDps * (1 + 0.3 * k)).toFixed(3);
  if (a.amount != null) e.amount = +(a.amount * (1 + 0.22 * k)).toFixed(3);
  if (a.stun != null) e.stun = +(a.stun + 0.3 * k).toFixed(2);
  if (a.jumps != null) e.jumps = a.jumps + k;            // chain bounces further
  if (a.leech != null) e.leech = Math.min(1, a.leech + 0.1 * k);
  if (a.buff) {
    e.buff = { ...a.buff };
    if (a.buff.dmg) e.buff.dmg = +(1 + (a.buff.dmg - 1) * (1 + 0.2 * k)).toFixed(3);
    if (a.buff.dur) e.buff.dur = +(a.buff.dur + k).toFixed(2);
    if (a.buff.shield) e.buff.shield = Math.min(0.85, a.buff.shield + 0.1 * k);
  }
  if (a.nova) {
    e.nova = { ...a.nova };
    if (a.nova.mult) e.nova.mult = +(a.nova.mult * (1 + 0.25 * k)).toFixed(3);
    if (a.nova.radius) e.nova.radius = +(a.nova.radius * (1 + 0.1 * k)).toFixed(3);
  }
  return e;
}

// Build a fresh stat block for a class at level 1.
export function makeStats(classId) {
  const c = CLASSES[classId];
  return {
    classId,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    maxHp: c.base.hp, hp: c.base.hp,
    maxMp: c.base.mp, mp: c.base.mp,
    maxSp: c.base.sp, sp: c.base.sp,
    str: c.base.str, dex: c.base.dex, int: c.base.int,
    unspent: 0,
  };
}

// Apply the AUTOMATIC part of a level-up (vitals growth + small stat
// trickle). The player-chosen attribute/skill is applied separately.
export function applyAutoLevel(s) {
  const c = CLASSES[s.classId];
  s.level += 1;
  s.maxHp += c.growth.hp;
  s.maxMp += c.growth.mp;
  s.maxSp += c.growth.sp;
  // Small automatic primary-stat trickle so every class stays viable.
  s[c.primary] += 1;
  s.hp = s.maxHp; s.mp = s.maxMp; s.sp = s.maxSp; // full restore — classic dopamine
  s.xp -= s.xpNext;
  s.xpNext = xpForLevel(s.level);
  return s;
}

// Apply a chosen attribute boost at level-up.
export function applyAttributeChoice(s, attr) {
  switch (attr) {
    case 'str': s.str += 3; break;
    case 'dex': s.dex += 3; break;
    case 'int': s.int += 3; break;
    case 'vit': s.maxHp += 25; s.hp += 25; break;
    case 'spirit': s.maxMp += 20; s.mp += 20; s.maxSp += 15; s.sp += 15; break;
  }
  return s;
}

export function primaryStat(classId, stats) {
  return stats[CLASSES[classId].primary];
}

// Final per-hit attack power for auto-attack / ability multipliers.
export function attackPower(classId, stats) {
  const c = CLASSES[classId];
  return c.baseDamage + primaryStat(classId, stats) * 1.1 + stats.level * 1.5;
}
