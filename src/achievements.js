// ============================================================
// Achievements: long-horizon goals tracked against lifetime action
// counters (kills, distance walked/ridden/climbed/swum, fish caught,
// areas discovered…). Each achievement is a small TREE: the first
// tiers grant modest permanent stat boosts, and the FINAL tier grants
// a unique passive or ability (a Slime Mount, never-drown, etc.).
//
// Rewards are folded into player.achBonus (permanent, summed into the
// gear-bonus pool) and player.passives (a Set of behaviour flags read
// by the movement/mount/climb/swim systems).
// ============================================================

// Unique end-of-tree rewards. `stat` is permanent; `passive` is a flag.
export const SPECIALS = {
  slimemount: { name: 'Slime Mount',       glyph: '🟢', passive: 'slimemount', desc: 'A bouncy slime steed — press R to ride it.' },
  windwalker: { name: 'Windwalker',        glyph: '🌬️', passive: 'windwalker', stat: { speed: 0.12 }, desc: '+12% move speed; sprinting drains far less stamina.' },
  trailblazer:{ name: 'Trailblazer',       glyph: '🐎', passive: 'trailblazer', desc: 'Your mount gallops 25% faster.' },
  spiderclimb:{ name: 'Spider-Climb',      glyph: '🦎', passive: 'spiderclimb', desc: 'Climbing no longer drains stamina.' },
  amphibious: { name: 'Amphibious',        glyph: '🐟', passive: 'amphibious', desc: 'Never run out of breath underwater; swim faster.' },
  anglerlord: { name: "Angler's Mastery",  glyph: '🎣', passive: 'anglerlord', stat: { fishing: 25 }, desc: '+25 Fishing, always.' },
  warlord:    { name: 'Warlord',           glyph: '⚔️', passive: 'warlord', stat: { damage: 80, str: 24 }, desc: '+80 Damage & +24 STR — a living weapon.' },
  pathfinder: { name: 'Pathfinder',        glyph: '🧭', passive: 'pathfinder', stat: { speed: 0.06 }, desc: '+6% move speed; you reveal far more of the map as you travel.' },
  giantslayer:{ name: 'Giantslayer',       glyph: '🗡️', passive: 'giantslayer', stat: { crit: 0.05 }, desc: '+25% damage to bosses; +5% crit.' },
  treasurer:  { name: 'Treasure Sense',    glyph: '💎', passive: 'treasureseeker', stat: { maxHp: 80 }, desc: 'Chests yield far better loot; +80 Max HP.' },
  midas:      { name: 'Midas Touch',       glyph: '🪙', passive: 'midas', stat: { maxHp: 80, maxMp: 60 }, desc: 'Slain foes drop +50% gold.' },
  veteran:    { name: 'Veteran',           glyph: '🎖️', stat: { str: 10, dex: 10, int: 10 }, desc: '+10 to all attributes.' },
  blessed:    { name: 'Blessed',           glyph: '🙏', passive: 'blessed', stat: { maxMp: 60 }, desc: 'Shrine blessings last 50% longer; +60 Max MP.' },
  showman:    { name: 'Showman',           glyph: '🎭', passive: 'showman', stat: { speed: 0.05 }, desc: '+5% move speed and a flair for the dramatic.' },
  dragonlord: { name: 'Dragonlord',        glyph: '🐉', passive: 'dragonmount', stat: { damage: 120, maxHp: 220, str: 20 }, desc: 'Ride a DRAGON (press R), and wield a sky-tyrant’s might.' },
  wolfsbane:  { name: 'Wolfsbane',         glyph: '🐺', stat: { crit: 0.06, dex: 10 }, desc: '+6% Crit, +10 DEX.' },
  lawbringer: { name: 'Lawbringer',        glyph: '⚖️', stat: { damage: 34 }, desc: '+34 Damage.' },
  vanguard:   { name: 'Vanguard',          glyph: '🛡️', stat: { armor: 45, maxHp: 90 }, desc: '+45 Armor, +90 Max HP.' },
  berserker:  { name: 'Berserker',         glyph: '🪓', passive: 'berserker', stat: { damage: 40 }, desc: '+40 Damage; deal +25% damage while below 35% HP.' },
  skywarden:  { name: 'Skywarden',         glyph: '🦅', stat: { dex: 14, speed: 0.05 }, desc: '+14 DEX, +5% move speed.' },
  champion:   { name: 'Champion of Aethelgard', glyph: '🏅', stat: { str: 12, dex: 12, int: 12, maxHp: 120 }, desc: '+12 to all attributes, +120 Max HP.' },
  homeward:   { name: 'Homeward',          glyph: '🏕️', stat: { maxHp: 80, maxSp: 60 }, desc: '+80 Max HP, +60 Max SP.' },
};

// Each achievement: a counter it watches + four ascending tiers.
export const ACHIEVEMENTS = [
  {
    id: 'slimeslayer', name: 'Slime Slayer', glyph: '🟢', cat: 'Combat', counter: 'kill_slime', noun: 'slimes slain',
    tiers: [
      { count: 100,  reward: { speed: 0.08 } },
      { count: 250,  reward: { speed: 0.05 } },
      { count: 500,  reward: { maxHp: 80 } },
      { count: 1000, reward: { special: 'slimemount' } },
    ],
  },
  {
    id: 'monsterhunter', name: 'Monster Hunter', glyph: '💀', cat: 'Combat', counter: 'kill_total', noun: 'monsters slain',
    tiers: [
      { count: 250,  reward: { str: 5 } },
      { count: 1000, reward: { damage: 24 } },
      { count: 3000, reward: { crit: 0.05 } },
      { count: 7000, reward: { special: 'warlord' } },
    ],
  },
  {
    id: 'marathoner', name: 'Marathoner', glyph: '👣', cat: 'Travel', counter: 'walk', noun: 'paces walked',
    tiers: [
      { count: 1500,  reward: { speed: 0.05 } },
      { count: 5000,  reward: { maxSp: 50 } },
      { count: 12000, reward: { speed: 0.05 } },
      { count: 30000, reward: { special: 'windwalker' } },
    ],
  },
  {
    id: 'cavalier', name: 'Cavalier', glyph: '🐎', cat: 'Travel', counter: 'ride', noun: 'paces ridden',
    tiers: [
      { count: 2500,  reward: { maxHp: 60 } },
      { count: 8000,  reward: { speed: 0.04 } },
      { count: 20000, reward: { armor: 30 } },
      { count: 50000, reward: { special: 'trailblazer' } },
    ],
  },
  {
    id: 'cliffhanger', name: 'Cliffhanger', glyph: '🧗', cat: 'Travel', counter: 'climb', noun: 'metres climbed',
    tiers: [
      { count: 150,  reward: { maxSp: 40 } },
      { count: 500,  reward: { str: 5 } },
      { count: 1200, reward: { maxSp: 60 } },
      { count: 3000, reward: { special: 'spiderclimb' } },
    ],
  },
  {
    id: 'pearldiver', name: 'Pearl Diver', glyph: '🌊', cat: 'Travel', counter: 'swim', noun: 'metres swum',
    tiers: [
      { count: 400,  reward: { maxSp: 40 } },
      { count: 1200, reward: { int: 5 } },
      { count: 3000, reward: { maxMp: 60 } },
      { count: 8000, reward: { special: 'amphibious' } },
    ],
  },
  {
    id: 'angler', name: 'Master Angler', glyph: '🎣', cat: 'Fishing', counter: 'fish', noun: 'catches reeled in',
    tiers: [
      { count: 25,  reward: { fishing: 6 } },
      { count: 75,  reward: { fishing: 8 } },
      { count: 200, reward: { maxHp: 60 } },
      { count: 500, reward: { special: 'anglerlord' } },
    ],
  },
  {
    id: 'cartographer', name: 'Cartographer', glyph: '🗺️', cat: 'Exploration', counter: 'discover', noun: 'areas discovered',
    tiers: [
      { count: 3,  reward: { speed: 0.03 } },
      { count: 6,  reward: { maxHp: 50 } },
      { count: 10, reward: { str: 4, dex: 4, int: 4 } },
      { count: 16, reward: { special: 'pathfinder' } },
    ],
  },
  {
    id: 'bossslayer', name: 'Boss Slayer', glyph: '☠️', cat: 'Combat', counter: 'kill_boss', noun: 'bosses felled',
    tiers: [
      { count: 5,   reward: { damage: 18 } },
      { count: 15,  reward: { maxHp: 80 } },
      { count: 40,  reward: { armor: 30 } },
      { count: 100, reward: { special: 'giantslayer' } },
    ],
  },
  {
    id: 'treasurehunter', name: 'Treasure Hunter', glyph: '💰', cat: 'Exploration', counter: 'treasure', noun: 'chests opened',
    tiers: [
      { count: 10,  reward: { maxSp: 40 } },
      { count: 30,  reward: { crit: 0.04 } },
      { count: 75,  reward: { maxHp: 70 } },
      { count: 150, reward: { special: 'treasurer' } },
    ],
  },
  {
    id: 'tycoon', name: 'Tycoon', glyph: '🪙', cat: 'Fortune', counter: 'gold_earned', noun: 'gold earned',
    tiers: [
      { count: 5000,   reward: { maxHp: 50 } },
      { count: 25000,  reward: { armor: 25 } },
      { count: 100000, reward: { damage: 24 } },
      { count: 500000, reward: { special: 'midas' } },
    ],
  },
  {
    id: 'ascendant', name: 'Ascendant', glyph: '⭐', cat: 'Mastery', counter: 'level', noun: 'character level',
    tiers: [
      { count: 10, reward: { str: 4, dex: 4, int: 4 } },
      { count: 20, reward: { maxHp: 90 } },
      { count: 35, reward: { damage: 30 } },
      { count: 50, reward: { special: 'veteran' } },
    ],
  },
  {
    id: 'pilgrim', name: 'Pilgrim', glyph: '🙏', cat: 'Exploration', counter: 'shrine', noun: 'shrines prayed at',
    tiers: [
      { count: 5,   reward: { maxMp: 40 } },
      { count: 15,  reward: { int: 5 } },
      { count: 40,  reward: { maxMp: 70 } },
      { count: 100, reward: { special: 'blessed' } },
    ],
  },
  {
    id: 'performer', name: 'Performer', glyph: '🎭', cat: 'Social', counter: 'emote', noun: 'emotes performed',
    tiers: [
      { count: 25,  reward: { maxSp: 30 } },
      { count: 75,  reward: { speed: 0.03 } },
      { count: 200, reward: { maxHp: 50 } },
      { count: 500, reward: { special: 'showman' } },
    ],
  },
  {
    id: 'wolfsbane', name: 'Wolfsbane', glyph: '🐺', cat: 'Combat', counter: 'kill_wolf', noun: 'Dire Sticks slain',
    tiers: [
      { count: 50,  reward: { speed: 0.03 } },
      { count: 150, reward: { dex: 6 } },
      { count: 400, reward: { maxHp: 60 } },
      { count: 900, reward: { special: 'wolfsbane' } },
    ],
  },
  {
    id: 'outlaw', name: 'Outlaw Hunter', glyph: '⚖️', cat: 'Combat', counter: 'kill_grunt', noun: 'bandits brought to justice',
    tiers: [
      { count: 50,  reward: { maxSp: 40 } },
      { count: 150, reward: { damage: 16 } },
      { count: 400, reward: { crit: 0.04 } },
      { count: 900, reward: { special: 'lawbringer' } },
    ],
  },
  {
    id: 'knightsbane', name: 'Knightsbane', glyph: '⚔️', cat: 'Combat', counter: 'kill_knight', noun: 'Fallen Knights laid to rest',
    tiers: [
      { count: 50,  reward: { armor: 18 } },
      { count: 150, reward: { maxHp: 70 } },
      { count: 400, reward: { str: 8 } },
      { count: 900, reward: { special: 'vanguard' } },
    ],
  },
  {
    id: 'ogreslayer', name: 'Ogreslayer', glyph: '🪓', cat: 'Combat', counter: 'kill_brute', noun: 'Ogre Brutes broken',
    tiers: [
      { count: 40,  reward: { str: 5 } },
      { count: 120, reward: { damage: 20 } },
      { count: 300, reward: { maxHp: 80 } },
      { count: 700, reward: { special: 'berserker' } },
    ],
  },
  {
    id: 'skyhunter', name: 'Skyhunter', glyph: '🦅', cat: 'Combat', counter: 'kill_wraith', noun: 'Sky Wraiths downed',
    tiers: [
      { count: 30,  reward: { dex: 5 } },
      { count: 90,  reward: { speed: 0.04 } },
      { count: 240, reward: { crit: 0.04 } },
      { count: 600, reward: { special: 'skywarden' } },
    ],
  },
  {
    id: 'heroofaethelgard', name: 'Hero of Aethelgard', glyph: '🏅', cat: 'Mastery', counter: 'quests', noun: 'quests completed',
    tiers: [
      { count: 4,  reward: { maxHp: 50 } },
      { count: 9,  reward: { damage: 22 } },
      { count: 15, reward: { str: 6, dex: 6, int: 6 } },
      { count: 22, reward: { special: 'champion' } },
    ],
  },
  {
    id: 'wayfarer', name: 'Wayfarer', glyph: '🏕️', cat: 'Exploration', counter: 'rest', noun: 'times rested at an Ember',
    tiers: [
      { count: 5,   reward: { maxSp: 30 } },
      { count: 20,  reward: { maxHp: 50 } },
      { count: 60,  reward: { maxMp: 60 } },
      { count: 150, reward: { special: 'homeward' } },
    ],
  },
  {
    id: 'dragonslayer', name: 'Dragonslayer', glyph: '🐉', cat: 'Legend', counter: 'kill_dragon', noun: 'dragons slain', capstone: true,
    tiers: [
      { count: 1,  reward: { damage: 50 } },
      { count: 3,  reward: { maxHp: 150 } },
      { count: 5,  reward: { str: 12, dex: 12, int: 12 } },
      { count: 10, reward: { special: 'dragonlord' } },
    ],
  },
];

// ---- Reward labelling ----
const PCT = new Set(['speed', 'crit', 'lifesteal']);
const STAT_LABEL = { str: 'STR', dex: 'DEX', int: 'INT', maxHp: 'Max HP', maxMp: 'Max MP', maxSp: 'Max SP', crit: 'Crit', speed: 'Move Speed', armor: 'Armor', lifesteal: 'Lifesteal', fishing: '🎣 Fishing', damage: 'Damage' };
const fmt = (k, v) => (PCT.has(k) ? `+${Math.round(v * 100)}% ${STAT_LABEL[k]}` : `+${v} ${STAT_LABEL[k]}`);

export function rewardLabel(reward) {
  if (reward.special) { const s = SPECIALS[reward.special]; return `${s.glyph} ${s.name}`; }
  return Object.entries(reward).map(([k, v]) => fmt(k, v)).join(', ');
}
export function isUnique(tier) { return !!(tier.reward && tier.reward.special); }

// ---- Application ----
function addStat(player, stat) { for (const k in stat) player.achBonus[k] = (player.achBonus[k] || 0) + stat[k]; }

function applySpecial(player, id) {
  const sp = SPECIALS[id]; if (!sp) return;
  if (sp.passive) player.passives.add(sp.passive);
  if (sp.stat) addStat(player, sp.stat);
  if (sp.passive === 'slimemount' && player.setMountSkin) player.setMountSkin('slime');
  if (sp.passive === 'dragonmount' && player.setMountSkin) player.setMountSkin('dragon');
}
function applyReward(player, reward) {
  if (reward.special) applySpecial(player, reward.special);
  else addStat(player, reward);
}

export function counterOf(player, key) { return (player.counters && player.counters[key]) || 0; }

// Silently re-apply every already-claimed tier (called after loading a save).
export function reapply(player) {
  player.achBonus = {};
  player.passives = player.passives || new Set();
  player.passives.clear();
  player.achievements = player.achievements || {};
  for (const a of ACHIEVEMENTS) {
    const claimed = player.achievements[a.id] || 0;
    for (let i = 0; i < claimed && i < a.tiers.length; i++) applyReward(player, a.tiers[i].reward);
  }
  if (player.recomputeGear) player.recomputeGear();
  // Restore the unlocked mount skin (the Dragon outranks the Slime).
  if (player.setMountSkin) {
    if (player.passives.has('dragonmount')) player.setMountSkin('dragon');
    else if (player.passives.has('slimemount')) player.setMountSkin('slime');
  }
}

// "The end of everything": every achievement except the Dragonslayer chain is
// fully complete. When true, the great dragon descends to be challenged.
export function endgameReady(player) {
  if (!player.achievements) return false;
  return ACHIEVEMENTS.every((a) => a.capstone || (player.achievements[a.id] || 0) >= a.tiers.length);
}

// Award any newly-earned tiers; calls onUnlock(ach, tierIndex, tier) for each.
export function check(player, onUnlock) {
  if (!player.achievements) player.achievements = {};
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    const val = counterOf(player, a.counter);
    let claimed = player.achievements[a.id] || 0;
    while (claimed < a.tiers.length && val >= a.tiers[claimed].count) {
      applyReward(player, a.tiers[claimed].reward);
      claimed++;
      player.achievements[a.id] = claimed;
      changed = true;
      if (onUnlock) onUnlock(a, claimed - 1, a.tiers[claimed - 1]);
    }
  }
  if (changed && player.recomputeGear) player.recomputeGear();
  return changed;
}

// Progress summary for the UI: claimed count, next tier, and fraction to it.
export function progress(player, a) {
  const val = counterOf(player, a.counter);
  const claimed = (player.achievements && player.achievements[a.id]) || 0;
  const done = claimed >= a.tiers.length;
  const next = done ? null : a.tiers[claimed];
  const prev = claimed > 0 ? a.tiers[claimed - 1].count : 0;
  const frac = done ? 1 : Math.max(0, Math.min(1, (val - prev) / (next.count - prev)));
  return { val, claimed, done, next, frac };
}
