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
  player.passives.add(sp.passive || id);
  if (sp.stat) addStat(player, sp.stat);
  if ((sp.passive || id) === 'slimemount' && player.setMountSkin) player.setMountSkin('slime');
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
  if (player.passives.has('slimemount') && player.setMountSkin) player.setMountSkin('slime');
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
