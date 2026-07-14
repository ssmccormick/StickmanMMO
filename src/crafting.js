// ============================================================
// Gathering, crafting & construction content. Pure data + small helpers, no
// THREE — the 3D meshes for harvest nodes and placed structures are built in
// world.js, keyed by the string ids here.
//   • MATERIALS — stackable raw/refined resources kept in the player's pouch.
//   • NODE_DROPS — what each harvest-node type yields, by tier.
//   • RECIPES    — crafting recipes (refine ore→bars, cook potions, forge gear).
//   • STRUCTURES — buildable structures placed in the world (Construction).
// Skill training is folded in via player.gainSkillXp('gathering'|'crafting'|
// 'construction', …); yield/quality/discount come from player.skillBonus(...).
// ============================================================

// ---- Materials (the crafting pouch) ----
// tier 1 = starter (near the Nexus), tier 2 = mid, tier 3 = far/dangerous.
export const MATERIALS = {
  // Wood (from trees)
  oak_log:     { id: 'oak_log',     name: 'Oak Log',        glyph: '🪵', cat: 'wood',  tier: 1, value: 3 },
  pine_log:    { id: 'pine_log',    name: 'Pine Log',       glyph: '🪵', cat: 'wood',  tier: 1, value: 3 },
  ashwood_log: { id: 'ashwood_log', name: 'Ashwood Log',    glyph: '🪵', cat: 'wood',  tier: 2, value: 8 },
  ironbark_log:{ id: 'ironbark_log',name: 'Ironbark Log',   glyph: '🪵', cat: 'wood',  tier: 3, value: 18 },
  // Ore & refined bars (from rock / ore veins)
  copper_ore:  { id: 'copper_ore',  name: 'Copper Ore',     glyph: '🟤', cat: 'ore',   tier: 1, value: 4 },
  iron_ore:    { id: 'iron_ore',    name: 'Iron Ore',       glyph: '⚙️', cat: 'ore',   tier: 2, value: 9 },
  mithril_ore: { id: 'mithril_ore', name: 'Mithril Ore',    glyph: '🔩', cat: 'ore',   tier: 3, value: 22 },
  copper_bar:  { id: 'copper_bar',  name: 'Copper Bar',     glyph: '🟧', cat: 'bar',   tier: 1, value: 12 },
  iron_bar:    { id: 'iron_bar',    name: 'Iron Bar',       glyph: '⬛', cat: 'bar',   tier: 2, value: 26 },
  mithril_bar: { id: 'mithril_bar', name: 'Mithril Bar',    glyph: '⬜', cat: 'bar',   tier: 3, value: 60 },
  // Stone (from rock)
  stone:       { id: 'stone',       name: 'Stone',          glyph: '🪨', cat: 'stone', tier: 1, value: 2 },
  granite:     { id: 'granite',     name: 'Granite Block',  glyph: '🧱', cat: 'stone', tier: 2, value: 10 },
  // Herbs & fibre (from herb patches / trees)
  bloomleaf:   { id: 'bloomleaf',   name: 'Bloomleaf',      glyph: '🌿', cat: 'herb',  tier: 1, value: 5 },
  sunpetal:    { id: 'sunpetal',    name: 'Sunpetal',       glyph: '🌼', cat: 'herb',  tier: 2, value: 12 },
  moonherb:    { id: 'moonherb',    name: 'Moonherb',       glyph: '🍀', cat: 'herb',  tier: 3, value: 28 },
  plantfiber:  { id: 'plantfiber',  name: 'Plant Fibre',    glyph: '🌾', cat: 'fibre', tier: 1, value: 3 },
  silkweave:   { id: 'silkweave',   name: 'Silkweave',      glyph: '🧵', cat: 'fibre', tier: 2, value: 11 },
  // Reagents (rare pulls / refined)
  rough_gem:   { id: 'rough_gem',   name: 'Rough Gem',      glyph: '💎', cat: 'gem',   tier: 2, value: 30 },
  arcane_dust: { id: 'arcane_dust', name: 'Arcane Dust',    glyph: '✨', cat: 'gem',   tier: 2, value: 24 },
  radiant_crystal:{ id: 'radiant_crystal', name: 'Radiant Crystal', glyph: '🔷', cat: 'gem', tier: 3, value: 70 },
};
export const MATERIAL_ORDER = Object.keys(MATERIALS);
export function materialById(id) { return MATERIALS[id] || null; }

// ---- Harvest node yields ----
// Each node type has a base skill-xp and a per-tier drop table. `main` drops
// always land; `bonus` is the pool a lucky "rare find" pulls one extra from.
export const NODE_TYPES = {
  tree: { name: 'Tree',        glyph: '🌳', verb: 'chop',    skillXp: 16, color: 0x4a7a34,
    tiers: [ { main: [['oak_log', 1, 3]], bonus: ['plantfiber'] },
             { main: [['ashwood_log', 1, 2], ['oak_log', 1, 2]], bonus: ['plantfiber', 'silkweave'] },
             { main: [['ironbark_log', 1, 2], ['ashwood_log', 1, 2]], bonus: ['silkweave', 'arcane_dust'] } ] },
  rock: { name: 'Rock Outcrop',glyph: '⛰️', verb: 'mine',    skillXp: 20, color: 0x8a8a92,
    tiers: [ { main: [['stone', 1, 3], ['copper_ore', 1, 2]], bonus: ['copper_ore', 'rough_gem'] },
             { main: [['stone', 1, 2], ['iron_ore', 1, 2]], bonus: ['granite', 'rough_gem'] },
             { main: [['granite', 1, 2], ['mithril_ore', 1, 2]], bonus: ['rough_gem', 'radiant_crystal'] } ] },
  herb: { name: 'Herb Patch',  glyph: '🌿', verb: 'gather',  skillXp: 14, color: 0x6ab04a,
    tiers: [ { main: [['bloomleaf', 1, 3]], bonus: ['plantfiber'] },
             { main: [['sunpetal', 1, 2], ['bloomleaf', 1, 2]], bonus: ['silkweave', 'arcane_dust'] },
             { main: [['moonherb', 1, 2], ['sunpetal', 1, 2]], bonus: ['arcane_dust', 'radiant_crystal'] } ] },
};
export const HARVEST_SECS = 2.0; // base seconds to work a node (cut by gatherSpeed)
export const NODE_RESPAWN = 55;  // seconds a depleted node stays gone

// Roll a node's yield → { id: count } map. `yieldBonus` (0..) and `rareFind`
// (0..1) come from the Gathering skill. Deterministic-ish via Math.random.
export function rollNodeDrops(type, tier, yieldBonus = 0, rareFind = 0) {
  const def = NODE_TYPES[type]; if (!def) return {};
  const t = def.tiers[Math.min(tier, def.tiers.length) - 1] || def.tiers[0];
  const out = {};
  const add = (id, n) => { if (n > 0) out[id] = (out[id] || 0) + n; };
  for (const [id, lo, hi] of t.main) {
    let n = lo + Math.floor(Math.random() * (hi - lo + 1));
    n = Math.max(lo, Math.round(n * (1 + yieldBonus)));
    add(id, n);
  }
  if (t.bonus && t.bonus.length && Math.random() < rareFind) add(t.bonus[Math.floor(Math.random() * t.bonus.length)], 1);
  return out;
}

// ---- Recipes ----
// out kinds: {k:'material', id, count} · {k:'consumable', id} · {k:'gear', slot, rarity}
// `req` = crafting level gate. `cost` = { materialId: count }.
export const RECIPES = [
  // Refining
  { id: 'copper_bar', name: 'Smelt Copper Bar', glyph: '🟧', cat: 'Refining', req: 1,  cost: { copper_ore: 2 }, out: { k: 'material', id: 'copper_bar', count: 1 }, xp: 10 },
  { id: 'iron_bar',   name: 'Smelt Iron Bar',   glyph: '⬛', cat: 'Refining', req: 8,  cost: { iron_ore: 2 },   out: { k: 'material', id: 'iron_bar', count: 1 },   xp: 18 },
  { id: 'mithril_bar',name: 'Smelt Mithril Bar',glyph: '⬜', cat: 'Refining', req: 20, cost: { mithril_ore: 2 },out: { k: 'material', id: 'mithril_bar', count: 1 },xp: 40 },
  { id: 'granite',    name: 'Cut Granite Block', glyph: '🧱', cat: 'Refining', req: 5,  cost: { stone: 4 },      out: { k: 'material', id: 'granite', count: 1 },    xp: 12 },
  // Alchemy / cooking
  { id: 'hp_minor', name: 'Brew Minor Health Potion', glyph: '🧪', cat: 'Alchemy', req: 2,  cost: { bloomleaf: 2 },                out: { k: 'consumable', id: 'hp_minor' }, xp: 14 },
  { id: 'hp_major', name: 'Brew Major Health Potion', glyph: '🍷', cat: 'Alchemy', req: 10, cost: { sunpetal: 2, bloomleaf: 2 },   out: { k: 'consumable', id: 'hp_major' }, xp: 24 },
  { id: 'buff_swift',name: 'Mix Potion of Swiftness', glyph: '🪽', cat: 'Alchemy', req: 8,  cost: { sunpetal: 2, plantfiber: 2 },  out: { k: 'consumable', id: 'buff_swift' }, xp: 22 },
  { id: 'buff_power',name: 'Mix Potion of Power',     glyph: '⚗️', cat: 'Alchemy', req: 15, cost: { moonherb: 2, rough_gem: 1 },   out: { k: 'consumable', id: 'buff_power' }, xp: 34 },
  { id: 'buff_might',name: 'Distil Elixir of Might',  glyph: '💪', cat: 'Alchemy', req: 24, cost: { moonherb: 3, radiant_crystal: 1 }, out: { k: 'consumable', id: 'buff_might' }, xp: 46 },
  // Smithing — gear (rarity is a floor; Crafting quality can push it higher)
  { id: 'craft_wpn_t1', name: 'Forge Copper Weapon', glyph: '⚔️', cat: 'Smithing', req: 4,  cost: { copper_bar: 3, oak_log: 2 },  out: { k: 'gear', slot: 'weapon', rarity: 'uncommon' }, xp: 26 },
  { id: 'craft_arm_t1', name: 'Forge Copper Armor',  glyph: '🛡️', cat: 'Smithing', req: 6,  cost: { copper_bar: 3, plantfiber: 3 }, out: { k: 'gear', slot: 'armor', rarity: 'uncommon' }, xp: 26 },
  { id: 'craft_wpn_t2', name: 'Forge Iron Weapon',   glyph: '⚔️', cat: 'Smithing', req: 12, cost: { iron_bar: 3, ashwood_log: 2 }, out: { k: 'gear', slot: 'weapon', rarity: 'rare' }, xp: 44 },
  { id: 'craft_arm_t2', name: 'Forge Iron Armor',    glyph: '🛡️', cat: 'Smithing', req: 14, cost: { iron_bar: 3, silkweave: 3 },  out: { k: 'gear', slot: 'armor', rarity: 'rare' }, xp: 44 },
  { id: 'craft_acc',    name: 'Set Gemmed Trinket',  glyph: '💍', cat: 'Smithing', req: 18, cost: { iron_bar: 1, rough_gem: 2 },  out: { k: 'gear', slot: 'trinket', rarity: 'rare' }, xp: 40 },
  { id: 'craft_wpn_t3', name: 'Forge Mithril Weapon',glyph: '⚔️', cat: 'Smithing', req: 26, cost: { mithril_bar: 3, ironbark_log: 2, arcane_dust: 1 }, out: { k: 'gear', slot: 'weapon', rarity: 'epic' }, xp: 70 },
  { id: 'craft_arm_t3', name: 'Forge Mithril Armor', glyph: '🛡️', cat: 'Smithing', req: 30, cost: { mithril_bar: 4, ironbark_log: 2, radiant_crystal: 1 }, out: { k: 'gear', slot: 'armor', rarity: 'epic' }, xp: 78 },
];
export const RECIPE_CATS = ['Refining', 'Alchemy', 'Smithing'];

// ---- Structures (Construction) ----
// build = the mesh-builder key in world.js. functional structures note a `fn`:
//   'rest'  → acts as a bonfire (rest / heal / save)
//   'craft' → a portable forge you can craft at anywhere
export const STRUCTURES = [
  { id: 'campfire',  name: 'Campfire',      glyph: '🔥', req: 1,  cost: { oak_log: 5 },                    build: 'campfire', fn: 'rest',  desc: 'A resting fire — rest here to heal & save.' },
  { id: 'fence',     name: 'Fence Segment', glyph: '🚧', req: 1,  cost: { oak_log: 3 },                    build: 'fence',   desc: 'A short length of wooden fence.' },
  { id: 'tent',      name: 'Tent',          glyph: '⛺', req: 3,  cost: { oak_log: 6, plantfiber: 4 },     build: 'tent',    desc: 'A canvas tent to mark your camp.' },
  { id: 'banner',    name: 'Banner',        glyph: '🚩', req: 4,  cost: { oak_log: 2, silkweave: 3 },      build: 'banner',  desc: 'Plant your colours in the ground.' },
  { id: 'wall',      name: 'Stone Wall',    glyph: '🧱', req: 6,  cost: { stone: 8 },                      build: 'wall',    desc: 'A solid stone wall segment.' },
  { id: 'lamp',      name: 'Lamp Post',     glyph: '🏮', req: 8,  cost: { iron_bar: 2, radiant_crystal: 1 },build: 'lamp',   desc: 'A glowing lamp that shines at night.' },
  { id: 'forge',     name: 'Portable Forge',glyph: '🏭', req: 12, cost: { stone: 10, iron_bar: 3 },        build: 'forge',   fn: 'craft', desc: 'A field forge — craft anywhere near it.' },
  { id: 'watchtower',name: 'Watchtower',    glyph: '🗼', req: 20, cost: { oak_log: 20, stone: 20, iron_bar: 6 }, build: 'watchtower', desc: 'A tall timber watchtower.' },
  { id: 'statue',    name: 'Hero Statue',   glyph: '🗿', req: 30, cost: { granite: 20, stone: 20, radiant_crystal: 3 }, build: 'statue', desc: 'A monument to your deeds.' },
];
export const STRUCT_BY_ID = Object.fromEntries(STRUCTURES.map((s) => [s.id, s]));

// Apply a Construction/Crafting discount to a cost map → new {id:count} (min 1).
export function discountedCost(cost, disc = 0) {
  const out = {};
  for (const id in cost) out[id] = Math.max(1, Math.round(cost[id] * (1 - disc)));
  return out;
}
