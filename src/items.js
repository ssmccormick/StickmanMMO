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

let UID = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

  // Name: rarity prefix + base, with a suffix from the dominant bonus stat.
  const dominant = Object.entries(stats).filter(([k]) => k !== 'damage' && k !== 'armor')
    .sort((a, b) => b[1] - a[1])[0];
  const suffix = dominant && SUFFIX[dominant[0]] ? ` of ${SUFFIX[dominant[0]]}` : '';
  const name = `${pick(PREFIX[rarityId])} ${base.name}${rarityId === 'common' ? '' : suffix}`;

  return {
    // String uid with a random suffix so freshly-generated items never
    // collide with items loaded from a previous session's save.
    uid: 'it' + (UID++) + '_' + Math.random().toString(36).slice(2, 7),
    baseId: base.id, kind: base.kind || null,
    name, slot, glyph: base.glyph,
    rarity: rarityId, ilvl, reqLevel: Math.max(1, ilvl - 2),
    stats,
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

// Roll a drop for a slain enemy. Tougher types drop more & better.
export function rollDrop(enemyLevel, enemyTypeId) {
  const chance = { slime: 0.22, grunt: 0.3, wolf: 0.28, knight: 0.42, brute: 0.55 }[enemyTypeId] ?? 0.3;
  if (Math.random() > chance) return null;
  const boost = { knight: 0.5, brute: 1.0 }[enemyTypeId] || 0.15;
  return generateItem({ level: enemyLevel + (Math.random() < 0.3 ? 1 : 0), rarityBoost: boost });
}

// Total stat contribution of a set of equipped items.
export function sumStats(items) {
  const t = {};
  for (const it of items) { if (!it) continue; for (const k in it.stats) addStat(t, k, it.stats[k]); }
  return t;
}

// HTML tooltip for an item (rarity-coloured, stat lines).
export function itemTooltip(item, playerLevel) {
  const rar = RARITY[item.rarity];
  const order = ['damage', 'armor', 'str', 'dex', 'int', 'maxHp', 'maxMp', 'maxSp', 'crit', 'speed'];
  const label = { damage: 'Damage', armor: 'Armor', str: 'STR', dex: 'DEX', int: 'INT', maxHp: 'Max HP', maxMp: 'Max MP', maxSp: 'Max SP', crit: 'Crit', speed: 'Move Speed' };
  const lines = order.filter((k) => item.stats[k]).map((k) => {
    const v = item.stats[k];
    const disp = (k === 'crit' || k === 'speed') ? `+${Math.round(v * 100)}%` : `+${v}`;
    return `<div class="tip-stat">${disp} ${label[k]}</div>`;
  }).join('');
  const reqBad = playerLevel != null && playerLevel < item.reqLevel;
  return `
    <div class="tip-name" style="color:${rar.color}">${item.glyph} ${item.name}</div>
    <div class="tip-sub">${rar.name} ${SLOT_LABEL[item.slot]} · ilvl ${item.ilvl}</div>
    ${lines}
    <div class="tip-req" style="color:${reqBad ? '#ff6b6b' : '#9a9'}">Requires level ${item.reqLevel}</div>`;
}
