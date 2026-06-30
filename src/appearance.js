// ============================================================
// Character appearance: the customisation model for a stickman's
// look (colours, proportions, hair) plus the catalogue of
// UNLOCKABLE cosmetics earned through achievements and quest lines.
//
// Unlocks are stored ACCOUNT-WIDE (a single localStorage key shared by
// every character) so a hairstyle you earn on one hero can be worn by
// the next. The actual chosen look is per-character and lives on the
// save (player.appearance).
// ============================================================
import { CLASSES } from './classes.js';
import { ACHIEVEMENTS } from './achievements.js';

// ---- Tunable numeric proportions (sliders in the customiser) ----
export const RANGES = {
  size:     { min: 0.82, max: 1.28, step: 0.01, label: 'Height' },
  build:    { min: 0.70, max: 1.45, step: 0.01, label: 'Build' },     // torso/shoulder width
  headSize: { min: 0.75, max: 1.30, step: 0.01, label: 'Head' },
  limb:     { min: 0.65, max: 1.55, step: 0.01, label: 'Limbs' },      // arm/leg thickness
};

// ---- Base palettes everyone can pick from at creation ----
export const BODY_COLORS = [
  0x9aa4b2, 0xb07a4a, 0x4a4f5a, 0x5a4a8a, 0xc9c2a0, 0x5a7a4a, 0xd9d2b0,
  0x4a2a5a, 0xc98a4a, 0x4a7a3a, 0x2b3340, 0xe0c0a0, 0x708090, 0x33415a,
];
export const ACCENT_COLORS = [
  0xd8423c, 0xff5a3c, 0x7ad88f, 0x6f9aef, 0xffe27a, 0x9bd86a, 0xffd24a,
  0xb05aff, 0xffcf6a, 0x6fc8ff, 0xff8fb0, 0xffffff, 0x2a2a2a, 0x44e0c8,
];
export const HAIR_COLORS = [
  0x2a1a0e, 0x3a2a1a, 0x5a3a1a, 0x8a5a2a, 0xc98a3a, 0xe6c878, 0xb0b0b0,
  0xeeeeee, 0xd83c3c, 0x6f9aef, 0x9bd86a, 0xb05aff, 0xff8fb0, 0x44e0c8,
];

// ---- Hair styles. `cosmetic:true` ones must be unlocked. ----
export const HAIR_STYLES = [
  { id: 'none',     name: 'Bald',      glyph: '🥚' },
  { id: 'buzz',     name: 'Buzzcut',   glyph: '👤' },
  { id: 'short',    name: 'Short',     glyph: '💇' },
  { id: 'spiky',    name: 'Spiky',     glyph: '🦔' },
  { id: 'mohawk',   name: 'Mohawk',    glyph: '🎸' },
  { id: 'long',     name: 'Long',      glyph: '💁' },
  { id: 'ponytail', name: 'Ponytail',  glyph: '🐎' },
  { id: 'afro',     name: 'Afro',      glyph: '🌳' },
  { id: 'braids',   name: 'Braids',    glyph: '🧶' },
  // --- cosmetic (unlockable) ---
  { id: 'horns',    name: 'Demon Horns',  glyph: '😈', cosmetic: true },
  { id: 'halo',     name: 'Seraph Halo',  glyph: '😇', cosmetic: true },
  { id: 'crown',    name: 'Hero’s Crown', glyph: '👑', cosmetic: true },
  { id: 'tophat',   name: 'Dapper Topper', glyph: '🎩', cosmetic: true },
  { id: 'antennae', name: 'Star-Touched',  glyph: '🛸', cosmetic: true },
  { id: 'flame',    name: 'Emberlocks',    glyph: '🔥', cosmetic: true },
  { id: 'frost',    name: 'Frostcrown',    glyph: '❄️', cosmetic: true },
  { id: 'vines',    name: 'Wildcrown',     glyph: '🍃', cosmetic: true },
];
export const HAIR_BY_ID = Object.fromEntries(HAIR_STYLES.map((h) => [h.id, h]));

// ---- The cosmetics catalogue: every unlockable look + how it's earned. ----
// type: 'hair' | 'bodyColor' | 'accentColor' | 'hairColor'
// value: the appearance value it grants access to
// unlock: { kind, ... } — see isCosmeticEarned() for the supported kinds.
export const COSMETICS = [
  // ----- Hairstyles -----
  { id: 'hair_horns', type: 'hair', value: 'horns', name: 'Demon Horns', glyph: '😈',
    unlock: { kind: 'special', id: 'berserker' }, hint: 'Complete the Ogreslayer achievement (unlocks Berserker).' },
  { id: 'hair_halo', type: 'hair', value: 'halo', name: 'Seraph Halo', glyph: '😇',
    unlock: { kind: 'special', id: 'blessed' }, hint: 'Complete the Pilgrim achievement (pray at 100 shrines).' },
  { id: 'hair_antennae', type: 'hair', value: 'antennae', name: 'Star-Touched', glyph: '🛸',
    unlock: { kind: 'special', id: 'pathfinder' }, hint: 'Complete the Cartographer achievement (discover 16 areas).' },
  { id: 'hair_tophat', type: 'hair', value: 'tophat', name: 'Dapper Topper', glyph: '🎩',
    unlock: { kind: 'special', id: 'showman' }, hint: 'Complete the Performer achievement (500 emotes).' },
  { id: 'hair_vines', type: 'hair', value: 'vines', name: 'Wildcrown', glyph: '🍃',
    unlock: { kind: 'quest', id: 'q_boss_gorath' }, hint: 'Defeat Gorath the Wildking (Thornhollow quest line).' },
  { id: 'hair_frost', type: 'hair', value: 'frost', name: 'Frostcrown', glyph: '❄️',
    unlock: { kind: 'quest', id: 'q_boss_frosthelm' }, hint: 'Defeat Frosthelm the Fallen (Frostgard quest line).' },
  { id: 'hair_flame', type: 'hair', value: 'flame', name: 'Emberlocks', glyph: '🔥',
    unlock: { kind: 'quest', id: 'q_boss_pyraxis' }, hint: 'Defeat Pyraxis in the Ashlands (Ember quest line).' },
  { id: 'hair_crown', type: 'hair', value: 'crown', name: 'Hero’s Crown', glyph: '👑',
    unlock: { kind: 'quest', id: 'q_dragon' }, hint: 'Complete the final quest and slay the Sky-Tyrant.' },

  // ----- Body colours -----
  { id: 'body_gold', type: 'bodyColor', value: 0xffd24a, name: 'Gilded Hide', glyph: '🪙',
    unlock: { kind: 'special', id: 'midas' }, hint: 'Complete the Tycoon achievement (Midas Touch).' },
  { id: 'body_crimson', type: 'bodyColor', value: 0x8a1f1f, name: 'Bloodforged', glyph: '🩸',
    unlock: { kind: 'special', id: 'warlord' }, hint: 'Complete the Monster Hunter achievement (Warlord).' },
  { id: 'body_obsidian', type: 'bodyColor', value: 0x16181f, name: 'Obsidian', glyph: '⬛',
    unlock: { kind: 'quest', id: 'q_boss_skarn' }, hint: 'Defeat Skarn in the Badlands.' },
  { id: 'body_void', type: 'bodyColor', value: 0x2a1a4a, name: 'Voidtouched', glyph: '🟪',
    unlock: { kind: 'quest', id: 'q_boss_vael' }, hint: 'Defeat Vael in the Crystal Reach.' },
  { id: 'body_dragon', type: 'bodyColor', value: 0x2f5a3a, name: 'Dragonscale', glyph: '🐉',
    unlock: { kind: 'special', id: 'dragonlord' }, hint: 'Complete the Dragonslayer achievement (Dragonlord).' },
  { id: 'body_spectral', type: 'bodyColor', value: 0xbfeaff, name: 'Spectral', glyph: '👻',
    unlock: { kind: 'special', id: 'amphibious' }, hint: 'Complete the Pearl Diver achievement (Amphibious).' },

  // ----- Accent colours -----
  { id: 'accent_holy', type: 'accentColor', value: 0xfff2a0, name: 'Holy Light', glyph: '🌟',
    unlock: { kind: 'special', id: 'blessed' }, hint: 'Complete the Pilgrim achievement.' },
  { id: 'accent_arcane', type: 'accentColor', value: 0xc06bff, name: 'Arcane Glow', glyph: '🔮',
    unlock: { kind: 'quest', id: 'q_boss_vael' }, hint: 'Defeat Vael in the Crystal Reach.' },
  { id: 'accent_ember', type: 'accentColor', value: 0xff5a1a, name: 'Ember', glyph: '🔥',
    unlock: { kind: 'quest', id: 'q_boss_pyraxis' }, hint: 'Defeat Pyraxis in the Ashlands.' },
  { id: 'accent_champion', type: 'accentColor', value: 0xffe9a0, name: 'Champion’s Gold', glyph: '🏅',
    unlock: { kind: 'special', id: 'champion' }, hint: 'Complete the Hero of Aethelgard achievement.' },

  // ----- Hair colours -----
  { id: 'haircol_gold', type: 'hairColor', value: 0xffe24a, name: 'Super Gold', glyph: '⚡',
    unlock: { kind: 'level', n: 25 }, hint: 'Reach level 25.' },
  { id: 'haircol_void', type: 'hairColor', value: 0x7a2aff, name: 'Voidweave', glyph: '🟣',
    unlock: { kind: 'quest', id: 'q_boss_mirelord' }, hint: 'Defeat the Mirelord in the Mire.' },
];
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

// ---- Default (class-flavoured) look for a brand-new character ----
export function defaultAppearance(classId) {
  const c = CLASSES[classId] || CLASSES.fighter;
  return {
    bodyColor: c.color,
    accentColor: c.accent,
    hairColor: 0x3a2a1a,
    size: 1, build: 1, headSize: 1, limb: 1,
    hair: 'short',
  };
}

// Coerce an arbitrary (possibly old/partial) appearance into a valid one.
export function normalizeAppearance(app, classId) {
  const d = defaultAppearance(classId);
  if (!app || typeof app !== 'object') return d;
  const clamp = (v, r, def) => (typeof v === 'number' && isFinite(v)) ? Math.min(r.max, Math.max(r.min, v)) : def;
  return {
    bodyColor:   Number.isInteger(app.bodyColor) ? app.bodyColor : d.bodyColor,
    accentColor: Number.isInteger(app.accentColor) ? app.accentColor : d.accentColor,
    hairColor:   Number.isInteger(app.hairColor) ? app.hairColor : d.hairColor,
    size:     clamp(app.size, RANGES.size, d.size),
    build:    clamp(app.build, RANGES.build, d.build),
    headSize: clamp(app.headSize, RANGES.headSize, d.headSize),
    limb:     clamp(app.limb, RANGES.limb, d.limb),
    hair:     HAIR_BY_ID[app.hair] ? app.hair : d.hair,
  };
}

export const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

// ---- Account-wide unlock storage ----
const UKEY = 'stickmanmmo.cosmetics.v1';
function readUnlocks() {
  try { const a = JSON.parse(localStorage.getItem(UKEY) || '[]'); return new Set(Array.isArray(a) ? a : []); }
  catch { return new Set(); }
}
function writeUnlocks(set) {
  try { localStorage.setItem(UKEY, JSON.stringify([...set])); } catch { /* storage blocked — fail soft */ }
}
export function unlockedCosmetics() { return readUnlocks(); }
export function isCosmeticUnlocked(id) { return readUnlocks().has(id); }

// Is an appearance VALUE available to wear? Base options are always free; only
// catalogue cosmetics need their id in the account unlock set.
export function isOptionAvailable(type, value, unlocked) {
  const cos = COSMETICS.find((c) => c.type === type && c.value === value);
  if (!cos) return true;              // not a catalogue cosmetic → base option
  return unlocked.has(cos.id);
}

// ---- Has the player earned the requirement behind a cosmetic? ----
function hasEarnedSpecial(player, specialId) {
  if (!player.achievements) return false;
  for (const a of ACHIEVEMENTS) {
    const claimed = player.achievements[a.id] || 0;
    for (let i = 0; i < claimed && i < a.tiers.length; i++) {
      if (a.tiers[i].reward && a.tiers[i].reward.special === specialId) return true;
    }
  }
  return false;
}
function questDone(player, id) {
  const q = player.questLog && player.questLog[id];
  return !!(q && q.turnedIn);
}
export function isCosmeticEarned(player, cos) {
  const u = cos.unlock || {};
  switch (u.kind) {
    case 'special':     return hasEarnedSpecial(player, u.id);
    case 'quest':       return questDone(player, u.id);
    case 'level':       return (player.stats && player.stats.level || 0) >= u.n;
    case 'achievement': return ((player.achievements && player.achievements[u.id]) || 0) >= (u.tier || 1);
    default:            return false;
  }
}

// Scan everything the player has earned and unlock any newly-qualifying
// cosmetics into the account pool. Returns the list of NEWLY unlocked ones.
export function evaluateUnlocks(player) {
  const set = readUnlocks();
  const fresh = [];
  for (const cos of COSMETICS) {
    if (set.has(cos.id)) continue;
    if (isCosmeticEarned(player, cos)) { set.add(cos.id); fresh.push(cos); }
  }
  if (fresh.length) writeUnlocks(set);
  return fresh;
}
