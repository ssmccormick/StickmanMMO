// ============================================================
// Items & loot. Procedurally generated weapons, armor, and
// accessories with rarities, item levels, and stat lines. Used for
// enemy drops, starter gear, and the inventory/equipment system.
// ============================================================

export const SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'ring', 'amulet'];
export const SLOT_LABEL = {
  weapon: 'Weapon', head: 'Head', chest: 'Chest', hands: 'Hands', feet: 'Feet', ring: 'Ring', amulet: 'Amulet',
};

export const RARITY = {
  common:    { name: 'Common',    color: '#b8b8b8', hex: 0xb8b8b8, weight: 54, lines: 1, mult: 1.0 },
  uncommon:  { name: 'Uncommon',  color: '#5fd35f', hex: 0x5fd35f, weight: 26, lines: 2, mult: 1.35 },
  rare:      { name: 'Rare',      color: '#5aa9ff', hex: 0x5aa9ff, weight: 13, lines: 3, mult: 1.8 },
  epic:      { name: 'Epic',      color: '#c07bff', hex: 0xc07bff, weight: 6,  lines: 4, mult: 2.4 },
  legendary: { name: 'Legendary', color: '#ff9a3c', hex: 0xff9a3c, weight: 1,  lines: 5, mult: 3.2 },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Gear sets — wearing multiple pieces grants escalating bonuses.
export const SETS = {
  warden:    { name: "Warden's Vigil",   color: '#7be38a', bonuses: { 2: { armor: 25, maxHp: 60 }, 4: { armor: 60, maxHp: 170, lifesteal: 0.06 } } },
  nightstalker: { name: 'Nightstalker',  color: '#9be0ff', bonuses: { 2: { crit: 0.06, speed: 0.06 }, 4: { crit: 0.15, dex: 16 } } },
  archmage:  { name: 'Archmage Regalia', color: '#c07bff', bonuses: { 2: { int: 12, maxMp: 80 }, 4: { int: 32, damage: 34 } } },
  bloodrage: { name: 'Bloodrage Plate',  color: '#ff7b6a', bonuses: { 2: { str: 12, damage: 18 }, 4: { str: 30, lifesteal: 0.08, speed: 0.05 } } },
};
const SET_KEYS = Object.keys(SETS);

// Base templates. Weapons carry a `damage` budget + a stat affinity;
// armor carries `armor`; accessories are pure stat lines.
const BASES = {
  weapon: [
    { id: 'sword',  name: 'Sword',   glyph: '⚔️', kind: 'sword', affinity: 'str' },
    { id: 'axe',    name: 'Axe',     glyph: '🪓', kind: 'axe',   affinity: 'str' },
    { id: 'mace',   name: 'Mace',    glyph: '🔨', kind: 'mace',  affinity: 'str' },
    { id: 'dagger', name: 'Dagger',  glyph: '🗡️', kind: 'dagger', affinity: 'dex' },
    { id: 'bow',    name: 'Bow',     glyph: '🏹', kind: 'bow',   affinity: 'dex' },
    { id: 'staff',  name: 'Staff',   glyph: '🔮', kind: 'staff', affinity: 'int' },
    { id: 'wand',   name: 'Wand',    glyph: '✨', kind: 'wand',  affinity: 'int' },
  ],
  head:   [{ id: 'helm', name: 'Helm', glyph: '⛑️' }, { id: 'hood', name: 'Hood', glyph: '🎓' }, { id: 'crown', name: 'Circlet', glyph: '👑' }],
  chest:  [{ id: 'plate', name: 'Breastplate', glyph: '🛡️' }, { id: 'robe', name: 'Robe', glyph: '🥼' }, { id: 'tunic', name: 'Tunic', glyph: '👕' }],
  hands:  [{ id: 'gauntlets', name: 'Gauntlets', glyph: '🧤' }, { id: 'gloves', name: 'Gloves', glyph: '🧤' }],
  feet:   [{ id: 'boots', name: 'Boots', glyph: '🥾' }, { id: 'sandals', name: 'Sandals', glyph: '👢' }],
  ring:   [{ id: 'ring', name: 'Ring', glyph: '💍' }, { id: 'band', name: 'Band', glyph: '💍' }],
  amulet: [{ id: 'amulet', name: 'Amulet', glyph: '📿' }, { id: 'pendant', name: 'Pendant', glyph: '🔱' }],
};

const PREFIX = {
  common: ['Worn', 'Plain', 'Sturdy'],
  uncommon: ['Fine', 'Polished', 'Keen'],
  rare: ['Gleaming', 'Runed', 'Tempered'],
  epic: ['Resplendent', 'Dread', 'Ascendant'],
  legendary: ['Godforged', 'Eternal', 'Mythic'],
};
const SUFFIX = { str: 'the Bear', dex: 'the Fox', int: 'the Owl', maxHp: 'the Titan', crit: 'Ruin', maxMp: 'the Sage', maxSp: 'the Wind', armor: 'the Mountain', speed: 'Swiftness', damage: 'Wrath' };

// Named legendary uniques — each rolls as a normal legendary for its slot,
// then gets a fixed name/glyph/flavour plus a signature bonus (e.g. lifesteal).
const UNIQUES = [
  { slot: 'weapon', base: 'sword',  name: 'Hungering Edge',       glyph: '🩸', bonus: { lifesteal: 0.14, crit: 0.06 }, flavor: 'It drinks deep of every wound.' },
  { slot: 'weapon', base: 'staff',  name: 'Starcaller',           glyph: '🌟', bonus: { crit: 0.12, int: 6 },        flavor: 'The heavens answer your call.' },
  { slot: 'weapon', base: 'dagger', name: "Whisper, the Last Word", glyph: '🗡️', bonus: { crit: 0.16, speed: 0.05 },  flavor: 'You never hear it coming.' },
  { slot: 'ring',   name: 'Bloodthirster Band',  glyph: '💍', bonus: { lifesteal: 0.10, crit: 0.05 }, flavor: 'Hunger, given a circle to wear.' },
  { slot: 'amulet', name: 'Heart of the Phoenix', glyph: '🔥', bonus: { lifesteal: 0.06, maxHp: 70 },  flavor: 'Warmth that will not die.' },
  { slot: 'chest',  name: 'Aegis of the Colossus', glyph: '🛡️', bonus: { armor: 45, maxHp: 90 },        flavor: 'Unbroken for a thousand years.' },
];

// Consumables — potions & elixirs. Heal items restore HP; buff items apply a
// timed effect (speed/damage multiplier or flat attributes).
export const CONSUMABLES = [
  { id: 'hp_minor', name: 'Minor Health Potion', glyph: '🧪', kind: 'heal', heal: 0.35, value: 25, desc: 'Instantly restore 35% of your health.' },
  { id: 'hp_major', name: 'Major Health Potion', glyph: '🍷', kind: 'heal', heal: 0.70, value: 70, desc: 'Instantly restore 70% of your health.' },
  { id: 'buff_swift', name: 'Potion of Swiftness', glyph: '🪽', kind: 'buff', buff: { speedMult: 1.30, dur: 30 }, value: 55, desc: '+30% move speed for 30s.' },
  { id: 'buff_power', name: 'Potion of Power', glyph: '⚗️', kind: 'buff', buff: { dmgMult: 1.40, dur: 30 }, value: 90, desc: '+40% damage for 30s.' },
  { id: 'buff_might', name: 'Elixir of Might', glyph: '💪', kind: 'buff', buff: { str: 8, dex: 8, int: 8, dur: 45 }, value: 80, desc: '+8 to all attributes for 45s.' },
];

let UID = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function makeConsumable(id) {
  const c = CONSUMABLES.find((x) => x.id === id) || CONSUMABLES[0];
  return {
    uid: 'c' + (UID++) + '_' + Math.random().toString(36).slice(2, 7),
    baseId: c.id, name: c.name, glyph: c.glyph, slot: 'consumable', type: 'consumable',
    rarity: 'uncommon', kind: c.kind, heal: c.heal, buff: c.buff, desc: c.desc, value: c.value,
  };
}

// Fish you reel in — edible (small heal) and sellable. Rarer fish are worth
// more and heal more; the deeper/farther the water, the better the odds.
const FISH = [
  { name: 'Minnow',      glyph: '🐟', rarity: 'common',    heal: 0.08, value: 6 },
  { name: 'River Bass',  glyph: '🐟', rarity: 'common',    heal: 0.12, value: 12 },
  { name: 'Silverscale', glyph: '🐠', rarity: 'uncommon',  heal: 0.18, value: 28 },
  { name: 'Rainbow Trout', glyph: '🐠', rarity: 'uncommon', heal: 0.22, value: 40 },
  { name: 'Gleamfin Pike', glyph: '🐡', rarity: 'rare',    heal: 0.30, value: 85 },
  { name: 'Emberscale Eel', glyph: '🐍', rarity: 'rare',   heal: 0.32, value: 110 },
  { name: 'Golden Koi',  glyph: '🎏', rarity: 'epic',      heal: 0.45, value: 240 },
  { name: 'Leviathan Fry', glyph: '🐉', rarity: 'legendary', heal: 0.6, value: 600 },
];
export function makeFish(level = 1) {
  // Weighted toward common; a small luck boost from deeper water (level).
  const boost = Math.min(0.5, level * 0.012);
  const r = Math.random();
  let idx;
  if (r < 0.5 - boost) idx = Math.floor(Math.random() * 2);           // common
  else if (r < 0.82 - boost) idx = 2 + Math.floor(Math.random() * 2); // uncommon
  else if (r < 0.96) idx = 4 + Math.floor(Math.random() * 2);         // rare
  else if (r < 0.995) idx = 6;                                        // epic
  else idx = 7;                                                       // legendary
  const f = FISH[idx];
  return {
    uid: 'f' + (UID++) + '_' + Math.random().toString(36).slice(2, 7),
    baseId: 'fish', name: f.name, glyph: f.glyph, slot: 'consumable', type: 'consumable',
    rarity: f.rarity, kind: 'heal', heal: f.heal, value: f.value,
    desc: `A ${f.rarity} catch. Eat to restore ${Math.round(f.heal * 100)}% HP, or sell it.`,
  };
}

function rollRarity(boost = 0) {
  // boost shifts the weighted roll toward higher tiers.
  const entries = RARITY_ORDER.map((id) => [id, RARITY[id].weight * (1 + (RARITY_ORDER.indexOf(id) * boost))]);
  let total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of entries) { if ((r -= w) <= 0) return id; }
  return 'common';
}

// One bonus stat line scaled by item level + rarity multiplier.
function rollLine(ilvl, mult, excludeAffinity) {
  const kinds = ['str', 'dex', 'int', 'maxHp', 'maxMp', 'maxSp', 'crit', 'speed'];
  const k = pick(kinds);
  let v;
  switch (k) {
    case 'str': case 'dex': case 'int': v = Math.round((1 + ilvl * 0.5) * mult); break;
    case 'maxHp': v = Math.round((6 + ilvl * 2.2) * mult); break;
    case 'maxMp': case 'maxSp': v = Math.round((4 + ilvl * 1.6) * mult); break;
    case 'crit': v = +((0.02 + ilvl * 0.0015) * mult).toFixed(3); break;
    case 'speed': v = +((0.015 + ilvl * 0.0008) * mult).toFixed(3); break;
  }
  return { k, v: Math.max(v, k === 'crit' || k === 'speed' ? 0.01 : 1) };
}

function addStat(stats, k, v) { stats[k] = (stats[k] || 0) + v; }

// Generate a single item. opts: { slot, level, rarityBoost, forceRarity }
export function generateItem({ slot, level = 1, rarityBoost = 0, forceRarity } = {}) {
  slot = slot || pick(SLOTS);
  const base = pick(BASES[slot]);
  const rarityId = forceRarity || rollRarity(rarityBoost);
  const rar = RARITY[rarityId];
  const ilvl = Math.max(1, level);
  const stats = {};

  if (slot === 'weapon') {
    addStat(stats, 'damage', Math.round((6 + ilvl * 1.5) * rar.mult));
    addStat(stats, base.affinity, Math.round((2 + ilvl * 0.4) * rar.mult));
  } else if (['head', 'chest', 'hands', 'feet'].includes(slot)) {
    const armorBudget = { chest: 1.4, head: 1.0, feet: 0.8, hands: 0.7 }[slot];
    addStat(stats, 'armor', Math.round((3 + ilvl * 1.3 * armorBudget) * rar.mult));
  }
  // Bonus stat lines (accessories get an extra one — they're pure stats).
  const lines = rar.lines + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
  for (let i = 0; i < lines; i++) { const l = rollLine(ilvl, rar.mult); addStat(stats, l.k, l.v); }

  // Chance (on uncommon+) for this to be a set piece.
  let setId = null;
  if (rarityId !== 'common' && Math.random() < 0.24) setId = pick(SET_KEYS);

  // Name: set name, or rarity prefix + base with a suffix from the top stat.
  const dominant = Object.entries(stats).filter(([k]) => k !== 'damage' && k !== 'armor')
    .sort((a, b) => b[1] - a[1])[0];
  const suffix = dominant && SUFFIX[dominant[0]] ? ` of ${SUFFIX[dominant[0]]}` : '';
  const name = setId ? `${SETS[setId].name} ${base.name}`
    : `${pick(PREFIX[rarityId])} ${base.name}${rarityId === 'common' ? '' : suffix}`;

  return {
    // String uid with a random suffix so freshly-generated items never
    // collide with items loaded from a previous session's save.
    uid: 'it' + (UID++) + '_' + Math.random().toString(36).slice(2, 7),
    baseId: base.id, kind: base.kind || null,
    name, slot, glyph: base.glyph,
    rarity: rarityId, ilvl, reqLevel: Math.max(1, ilvl - 2),
    stats, setId, setName: setId ? SETS[setId].name : null,
  };
}

// A simple, reliable starter weapon matched to the class's primary stat.
export function starterWeapon(primary) {
  const slotBase = primary === 'int' ? 'staff' : primary === 'dex' ? 'bow' : 'sword';
  const it = generateItem({ slot: 'weapon', level: 1, forceRarity: 'common' });
  // Swap to a base matching the class fantasy.
  const base = BASES.weapon.find((b) => b.id === slotBase);
  it.baseId = base.id; it.kind = base.kind; it.glyph = base.glyph;
  it.name = `Worn ${base.name}`;
  return it;
}

// Turn any item into one of the named uniques (keeps its rolled stats,
// adds the signature bonus + flavour). Used when a legendary drops.
export function makeUnique(ilvl) {
  const u = pick(UNIQUES);
  const it = generateItem({ slot: u.slot, level: ilvl, forceRarity: 'legendary' });
  it.name = u.name; it.glyph = u.glyph; it.unique = true; it.flavor = u.flavor;
  if (u.base) it.baseId = u.base;
  for (const k in u.bonus) it.stats[k] = (it.stats[k] || 0) + u.bonus[k];
  return it;
}

// The blade in the stone — a fixed legendary reward for the worthy. Always a
// sword, scaled a bit above the player's level, with a heroic stat package.
export function makeStoneSword(level = 20) {
  const it = generateItem({ slot: 'weapon', level: level + 4, forceRarity: 'legendary' });
  const base = BASES.weapon.find((b) => b.id === 'sword');
  it.baseId = base.id; it.kind = base.kind; it.glyph = '⚔️';
  it.name = 'Aetherbrand, the Kingmaker';
  it.unique = true;
  it.flavor = 'Drawn from the stone by the worthy alone. The Emberheart hums where it rests.';
  it.stats.damage = (it.stats.damage || 0) + Math.round(20 + level * 2.5);
  it.stats.str = (it.stats.str || 0) + 14;
  it.stats.crit = (it.stats.crit || 0) + 0.1;
  it.stats.lifesteal = (it.stats.lifesteal || 0) + 0.08;
  return it;
}

// Signature uniques dropped by specific world bosses.
export const BOSS_UNIQUES = {
  'Gorath the Wildking': { slot: 'weapon', base: 'axe', name: "Gorath's Wildaxe", glyph: '🪓', bonus: { lifesteal: 0.12, str: 12, speed: 0.05 }, flavor: 'Torn from the Wildking’s dying grip.' },
  'Frosthelm the Fallen': { slot: 'head', name: 'The Frosthelm', glyph: '⛑️', bonus: { armor: 55, maxHp: 130, int: 12 }, flavor: 'The frozen crown of a fallen lord.' },
  'Sandmaw the Devourer': { slot: 'weapon', base: 'sword', name: 'Maw of the Dunes', glyph: '🗡️', bonus: { crit: 0.15, dex: 16, lifesteal: 0.08 }, flavor: 'It hungers still.' },
  'The Mirelord': { slot: 'chest', name: 'Shroud of the Mire', glyph: '🥼', bonus: { armor: 75, maxHp: 220, lifesteal: 0.07 }, flavor: 'Woven from the swamp’s own rot.' },
};
export function bossDrop(bossName, level) {
  const u = BOSS_UNIQUES[bossName];
  if (!u) return makeUnique(level);
  const it = generateItem({ slot: u.slot, level, forceRarity: 'legendary' });
  it.name = u.name; it.glyph = u.glyph; it.unique = true; it.flavor = u.flavor;
  if (u.base) it.baseId = u.base;
  it.setId = null; it.setName = null;
  for (const k in u.bonus) it.stats[k] = (it.stats[k] || 0) + u.bonus[k];
  return it;
}

// Roll a drop for a slain enemy. Tougher types drop more & better.
export function rollDrop(enemyLevel, enemyTypeId) {
  const chance = { slime: 0.22, grunt: 0.3, wolf: 0.28, knight: 0.42, brute: 0.55 }[enemyTypeId] ?? 0.3;
  if (Math.random() > chance) return null;
  const boost = { knight: 0.5, brute: 1.0 }[enemyTypeId] || 0.15;
  const item = generateItem({ level: enemyLevel + (Math.random() < 0.3 ? 1 : 0), rarityBoost: boost });
  // A legendary has a good chance to be a named unique instead.
  if (item.rarity === 'legendary' && Math.random() < 0.6) return makeUnique(item.ilvl);
  return item;
}

// Gold/value of an item — used for vendor buy & sell prices.
export function itemValue(item) {
  if (item.type === 'consumable') return item.value || 20;
  return Math.max(1, Math.round(item.ilvl * RARITY[item.rarity].mult * 9));
}
export function buyPrice(item) { return item.type === 'consumable' ? itemValue(item) : itemValue(item) * 2; }
export function sellPrice(item) { return Math.max(1, Math.floor(itemValue(item) * 0.35)); }

// Gold dropped by a slain enemy.
export function goldDrop(enemyLevel, enemyTypeId) {
  const mult = { slime: 0.7, grunt: 1, wolf: 0.9, knight: 1.6, brute: 2.4 }[enemyTypeId] ?? 1;
  return Math.max(1, Math.round((3 + enemyLevel * 2.2) * mult * rnd(0.7, 1.3)));
}

// Total stat contribution of a set of equipped items.
export function sumStats(items) {
  const t = {};
  for (const it of items) { if (!it) continue; for (const k in it.stats) addStat(t, k, it.stats[k]); }
  return t;
}

const STAT_ORDER = ['damage', 'armor', 'str', 'dex', 'int', 'maxHp', 'maxMp', 'maxSp', 'crit', 'speed', 'lifesteal'];
const STAT_LABEL = { damage: 'Damage', armor: 'Armor', str: 'STR', dex: 'DEX', int: 'INT', maxHp: 'Max HP', maxMp: 'Max MP', maxSp: 'Max SP', crit: 'Crit', speed: 'Move Speed', lifesteal: 'Lifesteal' };
const PCT_STATS = new Set(['crit', 'speed', 'lifesteal']);
const fmtStat = (k, v) => (PCT_STATS.has(k) ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${v}`);

// HTML tooltip for an item. If `equipped` is provided, shows a comparison
// block with per-stat deltas vs. what's currently worn in that slot.
export function itemTooltip(item, playerLevel, equipped) {
  const rar = RARITY[item.rarity];
  if (item.type === 'consumable') {
    return `
      <div class="tip-name" style="color:${rar.color}">${item.glyph} ${item.name}</div>
      <div class="tip-sub">Consumable</div>
      <div class="tip-stat" style="color:#cfe0ff">${item.desc}</div>
      <div class="tip-req" style="color:#9a9">Click to use</div>`;
  }
  const lines = STAT_ORDER.filter((k) => item.stats[k]).map((k) =>
    `<div class="tip-stat">${fmtStat(k, item.stats[k])} ${STAT_LABEL[k]}</div>`).join('');
  const reqBad = playerLevel != null && playerLevel < item.reqLevel;
  const flavor = item.flavor ? `<div class="tip-flavor">“${item.flavor}”</div>` : '';

  let compare = '';
  if (equipped && equipped.uid !== item.uid) {
    const keys = new Set([...Object.keys(item.stats), ...Object.keys(equipped.stats)]);
    const deltas = [...keys].filter((k) => STAT_LABEL[k]).sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b))
      .map((k) => {
        const d = (item.stats[k] || 0) - (equipped.stats[k] || 0);
        if (Math.abs(d) < (PCT_STATS.has(k) ? 0.001 : 0.5)) return '';
        const col = d > 0 ? '#7be38a' : '#ff7b7b';
        return `<div class="tip-stat" style="color:${col}">${fmtStat(k, d)} ${STAT_LABEL[k]}</div>`;
      }).filter(Boolean).join('');
    compare = `<div class="tip-cmp"><div class="tip-cmp-h">vs. equipped ${equipped.glyph} <span style="color:${RARITY[equipped.rarity].color}">${equipped.name}</span></div>${deltas || '<div class="tip-stat" style="opacity:.6">no stat change</div>'}</div>`;
  }

  let setBlock = '';
  if (item.setId && SETS[item.setId]) {
    const set = SETS[item.setId];
    const tiers = Object.keys(set.bonuses).map((n) => {
      const b = set.bonuses[n];
      const parts = Object.entries(b).map(([k, v]) => fmtStat(k, v) + ' ' + (STAT_LABEL[k] || k)).join(', ');
      return `<div class="tip-set-line">(${n}) ${parts}</div>`;
    }).join('');
    setBlock = `<div class="tip-set" style="color:${set.color}"><div>${set.name} (set)</div>${tiers}</div>`;
  }

  return `
    <div class="tip-name" style="color:${item.setId ? SETS[item.setId].color : rar.color}">${item.glyph} ${item.name}${item.unique ? ' ✦' : ''}</div>
    <div class="tip-sub">${rar.name} ${SLOT_LABEL[item.slot]} · ilvl ${item.ilvl}</div>
    ${lines}
    ${flavor}
    <div class="tip-req" style="color:${reqBad ? '#ff6b6b' : '#9a9'}">Requires level ${item.reqLevel}</div>
    ${setBlock}
    ${compare}`;
}
