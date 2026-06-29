// ============================================================
// Quests. Templates given out by NPCs across the towns, including
// multi-step chains (via `requires`) and boss-slaying quests. Progress
// lives on player.questLog and persists in the save. Hooks in combat
// and main advance kill / chest / boss objectives.
// ============================================================
import { generateItem, makeConsumable } from './items.js';

// Each quest carries an `intro` (the giver's words when offering it, full of
// story) and an `outro` (their words on turn-in, paying that story off), so the
// whole quest line reads as one arc: prove yourself, push into each reach, and
// reclaim the four shards that keep the Emberheart broken.
export const QUESTS = {
  // --- The Nexus: Mara (herbs), Stane (guard), Finn (fence) ---
  q_slimes: { title: 'Pest Control', type: 'kill', target: 'slime', count: 6,
    desc: 'Slay 6 Stick Slimes in the meadows.',
    intro: 'So the embers coughed up another Ashbound. Good — we need every hand. Start small: the meadows crawl with Stick Slimes, Blight made flesh, and it spreads if you let it. Thin six of them and show the Nexus the flame chose well.',
    outro: 'Cleanly done. I felt the Emberheart stir when you struck — it knows its own. Keep that fire close, Ashbound. You\'ll need it past the roads.',
    reward: { xp: 120, gold: 60, potion: 'hp_minor', potionCount: 2 } },
  q_wolves: { title: 'Thinning the Pack', requires: 'q_slimes', type: 'kill', target: 'wolf', count: 6,
    desc: 'Cull 6 Dire Sticks near the meadows.',
    intro: 'The Dire Sticks have caught the Blight\'s madness and grown bold enough to test the Nexus walls. A pack becomes a tide if no one answers it. Cull six, before they learn the firelight won\'t bite back.',
    outro: 'The wood is quieter tonight. You\'re no longer just ash and a borrowed name — you\'re becoming Ashbound in truth. Mara won\'t say it, but she\'s glad you came.',
    reward: { xp: 260, gold: 120, item: { rarityBoost: 0.7 } } },

  q_bandits: { title: 'Highway Justice', type: 'kill', target: 'grunt', count: 5,
    desc: 'Bring 5 bandits to justice on the roads.',
    intro: 'Not every danger out there is a beast. When the Sundering broke the world it broke people too, and desperate folk took to the roads to prey on the living. The roads must stay open to the reaches. Bring five bandits to justice.',
    outro: 'The highway\'s safer for your work. Mercy was a luxury we lost at the Sundering — justice will have to do. The Nexus owes you, Ashbound.',
    reward: { xp: 220, gold: 110, potion: 'hp_major', potionCount: 1 } },
  q_knights: { title: 'Fallen No More', requires: 'q_bandits', type: 'kill', target: 'knight', count: 5,
    desc: 'Put 5 Fallen Knights to rest.',
    intro: 'Now the harder task. Fallen Knights — the old dead, raised in rusted steel by the Blight — stalk the roads after dark. They were heroes once, same as you. Put five to rest. It\'s the only kindness left them.',
    outro: 'They were us, once. Remember that when the embers call you back from your own death. Five souls freed — well struck, Ashbound.',
    reward: { xp: 420, gold: 220, item: { rarityBoost: 1.0 } } },

  q_chest: { title: 'Treasure Hunter', type: 'chest', count: 1,
    desc: 'Clear an elite war-camp and open its chest.',
    intro: 'Psst. Word is an elite war-camp\'s sitting on a hoard that doesn\'t rightly belong to them. Clear it out, crack the chest, and we\'ll call it... reclamation. The Emberheart won\'t mind. Neither will I.',
    outro: 'Now THAT\'S a haul. Stick with Finn, Ashbound, and you\'ll never want for coin — even with the world ending all around us. Especially then.',
    reward: { xp: 320, gold: 180, item: { rarityBoost: 0.8 } } },

  // --- Thornhollow (forest) ---
  q_forest: { title: 'Wolves at the Door', type: 'kill', target: 'wolf', count: 8,
    desc: 'Slay 8 Dire Sticks in the Greenwood.',
    intro: 'Welcome to the Greenwood, Ashbound. It\'s beautiful, and it\'s trying to kill you — the Blight runs deep here, and even the wolves have turned. Slay eight Dire Sticks so my rangers can hold the tree line a while longer.',
    outro: 'The canopy breathes easier. But the beasts only answer to one thing now, and it isn\'t me. The Wildking holds the deep wood — and a shard of the Emberheart with it.',
    reward: { xp: 360, gold: 160, potion: 'hp_major', potionCount: 2 } },
  q_boss_gorath: { title: 'The Wildking', requires: 'q_forest', type: 'boss', target: 'Gorath the Wildking', count: 1,
    desc: 'Defeat Gorath the Wildking in the deep wood.',
    intro: 'Gorath was a stag-lord of the old wood, until the Blight crowned him its king. A shard of the Emberheart is lodged in his heart — that shard is what keeps the whole Greenwood corrupted. End him, and bring the shard back to the flame. This is no cull. This is war.',
    outro: 'The Wildking falls, and the Greenwood remembers what green means. One shard returns to the Nexus, Ashbound — I can feel the Emberheart drawing it home. Three reaches remain. Don\'t stop now.',
    reward: { xp: 900, gold: 500, item: { rarityBoost: 2.6 } } },

  // --- Frostgard (snow) ---
  q_snow: { title: 'Cold Iron', type: 'kill', target: 'knight', count: 8,
    desc: 'Destroy 8 Fallen Knights in the Frostpeaks.',
    intro: 'Frostgard\'s walls have never fallen, Ashbound, and I\'ll not let your arrival be the first time. The Frostpeaks are thick with Fallen Knights clawing at the gate. Destroy eight, before the cold and the Blight do their work for them.',
    outro: 'The watch can sleep tonight, thanks to you. But the dead don\'t marshal themselves. Frosthelm leads them — and he was one of ours, long ago.',
    reward: { xp: 520, gold: 240, item: { rarityBoost: 1.1 } } },
  q_boss_frosthelm: { title: 'The Fallen Lord', requires: 'q_snow', type: 'boss', target: 'Frosthelm the Fallen', count: 1,
    desc: 'Lay Frosthelm the Fallen low.',
    intro: 'Hard truth, Ashbound: Frosthelm was a First Hero. He helped raise the Nexus you woke in. He died in the Sundering and rose wrong, and now the Blight wears his armor — and his shard of the Emberheart. Lay him low. Take back what he stole. Give the old man peace.',
    outro: 'A founder laid to rest at last, and a second shard returns to the flame. The Emberheart burns a shade brighter — I can see it even from here. Two reaches stand between you and a whole world, Ashbound.',
    reward: { xp: 1200, gold: 650, item: { rarityBoost: 2.8 } } },

  // --- Dustmarket (desert) ---
  q_desert: { title: 'Brutes of the Dunes', type: 'kill', target: 'brute', count: 6,
    desc: 'Fell 6 Ogre Brutes in the Dunes.',
    intro: 'The Dunes are no place for the living, yet here we both are. Ogre Brutes — hill-giants the Blight swelled into monsters — crush our caravans under their fists. Fell six, and the trade roads may breathe again.',
    outro: 'The sand drinks their blood and asks for more. It always does. But the true hunger out here has a name, and a shard in its belly: Sandmaw.',
    reward: { xp: 680, gold: 320, item: { rarityBoost: 1.3 } } },
  q_boss_sandmaw: { title: 'The Devourer', requires: 'q_desert', type: 'boss', target: 'Sandmaw the Devourer', count: 1,
    desc: 'Slay Sandmaw the Devourer in the deep desert.',
    intro: 'Sandmaw the Devourer is hunger given shape, burrowing the deep desert with a shard of the Emberheart lodged in its gut. It will not stop eating until the world is bones — yours included. Stop it first, Ashbound. The sands are counting on you, whether they\'d admit it or not.',
    outro: 'The Devourer, devoured. A third shard returns to the Nexus, and the Dunes fall quiet for the first time in a generation. Only the Mire remains now — and may the Emberheart keep you, for nothing else will out there.',
    reward: { xp: 1600, gold: 850, item: { rarityBoost: 3.0 } } },

  // --- Gloomfen (swamp) ---
  q_swamp: { title: 'Into the Mire', type: 'kill', target: 'knight', count: 8,
    desc: 'Cleanse 8 Fallen Knights from the Mire.',
    intro: 'So the embers sent you to the Mire. Pity. The swamp\'s the oldest wound of the Sundering, and the Fallen wade through it thick as reeds. Cleanse eight of them — if the rot doesn\'t cleanse you first, Ashbound.',
    outro: 'Still breathing? You\'re tougher than you look. But the Mire answers to the thing at its heart, and it\'s been waiting down there far longer than you\'ve been ash.',
    reward: { xp: 900, gold: 420, item: { rarityBoost: 1.5 } } },
  q_boss_mirelord: { title: 'The Mirelord', requires: 'q_swamp', type: 'boss', target: 'The Mirelord', count: 1,
    desc: 'Destroy the Mirelord at the swamp\'s heart.',
    intro: 'The Mirelord is the Blight made flesh — the first thing to crawl from the cracks when the world broke. It is rooted at the swamp\'s heart, coiled around the largest shard of all. End it, Ashbound, and you end the corruption at its source. This is the one we\'ve all been too afraid to face.',
    outro: 'It\'s done. The last and largest shard returns to the Emberheart. Carry it to the Nexus — the flame is whole enough to rekindle now. You did what the rest of us never could. Aethelgard will remember the name of the Ashbound who gave it back its fire.',
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

// Tag each quest with the name of the giver who offers it (used by the quest
// log and the giver dialog). Done once at load from the GIVERS table above.
for (const gv of GIVERS) for (const id of gv.quests) if (QUESTS[id]) QUESTS[id].giver = gv.name;

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
