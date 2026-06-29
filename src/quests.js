// ============================================================
// Quests. Templates given out by NPCs across the towns, including
// multi-step chains (via `requires`) and boss-slaying quests. Progress
// lives on player.questLog and persists in the save. Hooks in combat
// and main advance kill / chest / boss objectives.
// ============================================================
import { generateItem, makeConsumable } from './items.js';

export const QUESTS = {
  // --- The Nexus: Mara (herbs), Stane (guard), Finn (fence) ---
  q_slimes: { title: 'Pest Control', type: 'kill', target: 'slime', count: 6,
    desc: 'Stick Slimes overrun the meadows. Slay 6 of them.',
    reward: { xp: 120, gold: 60, potion: 'hp_minor', potionCount: 2 } },
  q_wolves: { title: 'Thinning the Pack', requires: 'q_slimes', type: 'kill', target: 'wolf', count: 6,
    desc: 'Dire Sticks grow bold. Cull 6 of them.',
    reward: { xp: 260, gold: 120, item: { rarityBoost: 0.7 } } },

  q_bandits: { title: 'Highway Justice', type: 'kill', target: 'grunt', count: 5,
    desc: 'Bandits prey on travellers. Bring 5 to justice.',
    reward: { xp: 220, gold: 110, potion: 'hp_major', potionCount: 1 } },
  q_knights: { title: 'Fallen No More', requires: 'q_bandits', type: 'kill', target: 'knight', count: 5,
    desc: 'Fallen Knights stalk the roads. Put 5 to rest.',
    reward: { xp: 420, gold: 220, item: { rarityBoost: 1.0 } } },

  q_chest: { title: 'Treasure Hunter', type: 'chest', count: 1,
    desc: 'Clear an elite war-camp and crack open its chest.',
    reward: { xp: 320, gold: 180, item: { rarityBoost: 0.8 } } },

  // --- Thornhollow (forest) ---
  q_forest: { title: 'Wolves at the Door', type: 'kill', target: 'wolf', count: 8,
    desc: 'The Greenwood teems with beasts. Slay 8 Dire Sticks.',
    reward: { xp: 360, gold: 160, potion: 'hp_major', potionCount: 2 } },
  q_boss_gorath: { title: 'The Wildking', requires: 'q_forest', type: 'boss', target: 'Gorath the Wildking', count: 1,
    desc: 'Gorath the Wildking rules the deep wood. End his reign.',
    reward: { xp: 900, gold: 500, item: { rarityBoost: 2.6 } } },

  // --- Frostgard (snow) ---
  q_snow: { title: 'Cold Iron', type: 'kill', target: 'knight', count: 8,
    desc: 'Fallen Knights haunt the Frostpeaks. Destroy 8.',
    reward: { xp: 520, gold: 240, item: { rarityBoost: 1.1 } } },
  q_boss_frosthelm: { title: 'The Fallen Lord', requires: 'q_snow', type: 'boss', target: 'Frosthelm the Fallen', count: 1,
    desc: 'Frosthelm the Fallen will not rest. Lay him low.',
    reward: { xp: 1200, gold: 650, item: { rarityBoost: 2.8 } } },

  // --- Dustmarket (desert) ---
  q_desert: { title: 'Brutes of the Dunes', type: 'kill', target: 'brute', count: 6,
    desc: 'Ogre Brutes roam the Dunes. Fell 6 of them.',
    reward: { xp: 680, gold: 320, item: { rarityBoost: 1.3 } } },
  q_boss_sandmaw: { title: 'The Devourer', requires: 'q_desert', type: 'boss', target: 'Sandmaw the Devourer', count: 1,
    desc: 'Sandmaw devours all who cross the deep desert. Slay it.',
    reward: { xp: 1600, gold: 850, item: { rarityBoost: 3.0 } } },

  // --- Gloomfen (swamp) ---
  q_swamp: { title: 'Into the Mire', type: 'kill', target: 'knight', count: 8,
    desc: 'The Mire crawls with Fallen Knights. Cleanse 8.',
    reward: { xp: 900, gold: 420, item: { rarityBoost: 1.5 } } },
  q_boss_mirelord: { title: 'The Mirelord', requires: 'q_swamp', type: 'boss', target: 'The Mirelord', count: 1,
    desc: 'The Mirelord festers at the swamp\'s heart. Destroy it.',
    reward: { xp: 2400, gold: 1200, item: { rarityBoost: 3.2 } } },
};

// Quest-giver NPCs, grouped by town. Each offers its quest chain in order.
export const GIVERS = [
  { name: 'Mara the Herbalist', town: 'The Nexus', dx: 8, dz: 8, color: 0x6fae54, accent: 0xffe27a, quests: ['q_slimes', 'q_wolves'] },
  { name: 'Captain Stane', town: 'The Nexus', dx: -8, dz: 8, color: 0x9aa4b2, accent: 0xd8423c, quests: ['q_bandits', 'q_knights'] },
  { name: 'Finn the Fence', town: 'The Nexus', dx: 8, dz: -7, color: 0x5a4f6a, accent: 0xc07bff, quests: ['q_chest'] },
  { name: 'Ranger Elowen', town: 'Thornhollow', dx: 0, dz: 5, color: 0x4d8a3a, accent: 0x9bd86a, quests: ['q_forest', 'q_boss_gorath'] },
  { name: 'Warden Bram', town: 'Frostgard', dx: 0, dz: 5, color: 0x9aa6c2, accent: 0x9fe0ff, quests: ['q_snow', 'q_boss_frosthelm'] },
  { name: 'Sister Dune', town: 'Dustmarket', dx: 0, dz: 5, color: 0xd9c486, accent: 0xffcf6a, quests: ['q_desert', 'q_boss_sandmaw'] },
  { name: 'Old Cregg', town: 'Gloomfen', dx: 0, dz: 5, color: 0x6a7a52, accent: 0xb05aff, quests: ['q_swamp', 'q_boss_mirelord'] },
];

export function progressOf(player, id) {
  const q = QUESTS[id]; const st = player.questLog[id];
  if (!st || !st.accepted) return 0;
  if (q.type === 'level') return Math.min(q.count, player.stats.level);
  return Math.min(q.count, st.progress || 0);
}
export function isComplete(player, id) { return progressOf(player, id) >= QUESTS[id].count; }

// 'locked' | 'available' | 'active' | 'complete' | 'done'
export function statusOf(player, id) {
  const q = QUESTS[id];
  if (q.requires) { const r = player.questLog[q.requires]; if (!r || !r.turnedIn) return 'locked'; }
  const st = player.questLog[id];
  if (!st || !st.accepted) return 'available';
  if (st.turnedIn) return 'done';
  return isComplete(player, id) ? 'complete' : 'active';
}

// The quest a giver should currently offer (first unlocked, not-done in its chain).
export function giverActiveQuest(player, giver) {
  for (const id of giver.quests) {
    const s = statusOf(player, id);
    if (s === 'available' || s === 'active' || s === 'complete') return id;
  }
  return null;
}

export function accept(player, id) { player.questLog[id] = { accepted: true, progress: 0, turnedIn: false }; }

export function turnIn(player, id) {
  const r = QUESTS[id].reward;
  const out = { gold: 0, xp: 0, levels: 0, items: [] };
  if (r.gold) { player.gold += r.gold; out.gold = r.gold; }
  if (r.item) { const it = generateItem({ level: r.item.level || player.stats.level, rarityBoost: r.item.rarityBoost || 0.5 }); if (player.addItem(it)) out.items.push(it); }
  if (r.potion) { for (let i = 0; i < (r.potionCount || 1); i++) { const c = makeConsumable(r.potion); if (player.addItem(c)) out.items.push(c); } }
  if (r.xp) { out.xp = r.xp; out.levels = player.gainXp(r.xp); }
  player.questLog[id].turnedIn = true;
  return out;
}

function advance(player, predicate) {
  for (const id in player.questLog) {
    const q = QUESTS[id]; const st = player.questLog[id];
    if (q && st.accepted && !st.turnedIn && predicate(q)) st.progress = Math.min(q.count, (st.progress || 0) + 1);
  }
}
export function onKill(player, enemyTypeId) { advance(player, (q) => q.type === 'kill' && q.target === enemyTypeId); }
export function onChestOpened(player) { advance(player, (q) => q.type === 'chest'); }
export function onBossKill(player, bossName) { advance(player, (q) => q.type === 'boss' && q.target === bossName); }
