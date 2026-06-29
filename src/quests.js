// ============================================================
// Quests. A small set of templates given out by town NPCs. Progress
// is tracked on the player (player.questLog) and persisted with the
// save. Kill/level/chest objectives are advanced by hooks in combat
// and main.
// ============================================================
import { generateItem, makeConsumable } from './items.js';

export const QUESTS = {
  q_slimes: {
    title: 'Pest Control', giver: 'Mara the Herbalist',
    type: 'kill', target: 'slime', count: 6,
    desc: 'Stick Slimes are overrunning the meadows. Slay 6 of them.',
    reward: { xp: 120, gold: 60, potion: 'hp_minor', potionCount: 2 },
  },
  q_bandits: {
    title: 'Highway Justice', giver: 'Captain Stane',
    type: 'kill', target: 'grunt', count: 5,
    desc: 'Bandits prey on travellers. Bring 5 of them to justice.',
    reward: { xp: 240, gold: 120, item: { rarityBoost: 0.6 } },
  },
  q_chest: {
    title: 'Treasure Hunter', giver: 'Finn the Fence',
    type: 'chest', count: 1,
    desc: 'Clear an elite war-camp and crack open its treasure chest.',
    reward: { xp: 360, gold: 200, potion: 'hp_major', potionCount: 1 },
  },
};

// Which NPC offers which quest (positions are placed by world.js).
export const GIVERS = [
  { name: 'Mara the Herbalist', questId: 'q_slimes', color: 0x6fae54, accent: 0xffe27a },
  { name: 'Captain Stane', questId: 'q_bandits', color: 0x9aa4b2, accent: 0xd8423c },
  { name: 'Finn the Fence', questId: 'q_chest', color: 0x5a4f6a, accent: 0xc07bff },
];

export function progressOf(player, id) {
  const q = QUESTS[id]; const st = player.questLog[id];
  if (!st || !st.accepted) return 0;
  if (q.type === 'level') return Math.min(q.count, player.stats.level);
  return Math.min(q.count, st.progress || 0);
}
export function isComplete(player, id) { return progressOf(player, id) >= QUESTS[id].count; }

// 'available' | 'active' | 'complete' | 'done'
export function statusOf(player, id) {
  const st = player.questLog[id];
  if (!st || !st.accepted) return 'available';
  if (st.turnedIn) return 'done';
  return isComplete(player, id) ? 'complete' : 'active';
}

export function accept(player, id) {
  player.questLog[id] = { accepted: true, progress: 0, turnedIn: false };
}

// Grant a quest's reward. Returns a summary (and any levels gained from XP).
export function turnIn(player, id) {
  const q = QUESTS[id];
  const r = q.reward;
  const out = { gold: 0, xp: 0, levels: 0, items: [] };
  if (r.gold) { player.gold += r.gold; out.gold = r.gold; }
  if (r.item) {
    const it = generateItem({ level: r.item.level || player.stats.level, rarityBoost: r.item.rarityBoost || 0.5 });
    if (player.addItem(it)) out.items.push(it);
  }
  if (r.potion) {
    for (let i = 0; i < (r.potionCount || 1); i++) { const c = makeConsumable(r.potion); if (player.addItem(c)) out.items.push(c); }
  }
  if (r.xp) { out.xp = r.xp; out.levels = player.gainXp(r.xp); }
  player.questLog[id].turnedIn = true;
  return out;
}

// Hooks that advance objectives.
export function onKill(player, enemyTypeId) {
  for (const id in player.questLog) {
    const q = QUESTS[id]; const st = player.questLog[id];
    if (q && q.type === 'kill' && st.accepted && !st.turnedIn && q.target === enemyTypeId) {
      st.progress = Math.min(q.count, (st.progress || 0) + 1);
    }
  }
}
export function onChestOpened(player) {
  for (const id in player.questLog) {
    const q = QUESTS[id]; const st = player.questLog[id];
    if (q && q.type === 'chest' && st.accepted && !st.turnedIn) {
      st.progress = Math.min(q.count, (st.progress || 0) + 1);
    }
  }
}
