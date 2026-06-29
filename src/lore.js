// ============================================================
// Lore: the world-board for Aethelgard. A cohesive backstory that the
// quests and the player's role hang from — read in-game via the Codex (L).
// The central conceit ties directly to the game's mechanics: bonfires are
// Embers of a great flame, which is *why* the Ashbound (you) return from
// death, and the four world bosses hold the shards that keep it broken.
// ============================================================

export const WORLD_NAME = 'Aethelgard';

// The hook, shown at the top of the Codex.
export const PROLOGUE =
  'In the age before memory, the First Heroes raised the Nexus at the heart of ' +
  'Aethelgard and kindled the Emberheart — a flame that bound the world together ' +
  'and remembered the names of the brave. While it burned, no hero who fell beside ' +
  'its embers stayed dead for long.\n\n' +
  'Then came the Sundering. The Emberheart cracked, the land tore into four wild and ' +
  'warring reaches, and into the wounds crept the Blight — a corruption that raises the ' +
  'dead, maddens the beasts, and crowns monsters as kings.\n\n' +
  'The embers are guttering now. But the flame still remembers a few. It has remembered you.';

// The codex: categorized lore the player can browse. Each section is a list of
// short, readable entries.
export const CODEX = [
  {
    id: 'world', title: 'The World', icon: '🌍', entries: [
      { title: 'Aethelgard', body: 'A broken world of green meadows, deep wood, frozen peaks, burning dunes and drowned mire — all of it spun out from one central refuge, the Nexus. The roads still remember when it was whole.' },
      { title: 'The Nexus', body: 'The first and last refuge: a meadow town at the center of every road, raised by the First Heroes around the Emberheart itself. No Blight may enter while the flame burns, which is why every town remains a haven.' },
      { title: 'The Emberheart & the Embers', body: 'The great flame at the Nexus is the Emberheart. Every bonfire in the wilds is one of its scattered Embers. Rest at an Ember and it learns your name; fall in battle, and it calls you back. This is why the Ashbound do not stay dead — and why the guttering of the Embers threatens all of Aethelgard.' },
      { title: 'The Roads', body: 'The First Heroes laid stone roads from the Nexus out to the four reaches. Travellers keep to them after dark — the Blight runs thickest where the roads run out.' },
    ],
  },
  {
    id: 'sundering', title: 'The Sundering', icon: '☄️', entries: [
      { title: 'The Breaking', body: 'No two tales agree on what cracked the Emberheart — a war, a betrayal, a bargain struck with something beneath the world. What is certain is that the land tore apart, and four reaches drifted away into wilderness, each left to rot in its own way.' },
      { title: 'The Blight', body: 'From the cracks seeped the Blight: a corruption that animates the fallen, maddens beasts, and pools where the strongest monsters crown themselves kings. It cannot abide Ember-light — the one mercy left to the living.' },
      { title: 'The Shards', body: 'When the Emberheart broke, four shards of its essence were lost into the reaches. Each was seized by a monster the Blight raised into a king. While the shards are held, the flame cannot be made whole — and the world cannot be healed.' },
    ],
  },
  {
    id: 'ashbound', title: 'The Ashbound', icon: '🔥', entries: [
      { title: 'Reborn from Embers', body: 'The Ashbound are heroes the Emberheart refuses to forget. Burned to ash and called back from the embers, they alone can carry living flame into the Blighted reaches. Most of the old Ashbound are gone now. You are among the last.' },
      { title: 'Your Purpose', body: 'Prove yourself in the meadows, push into each reach, and end the four Archfiends whose stolen shards keep the Emberheart broken. Carry their fall back to the Nexus, and the flame may yet be rekindled — and Aethelgard saved.' },
    ],
  },
  {
    id: 'reaches', title: 'The Four Reaches', icon: '🗺️', entries: [
      { title: 'The Greenwood (Forest)', body: 'A vast, overgrown wood watched over by the town of Thornhollow and its rangers. Beautiful and deadly — even the wolves have turned. The stag-lord Gorath rules its depths.' },
      { title: 'The Frostpeaks (Snow)', body: 'A range of bitter cold and old stone, anchored by the fortress-town of Frostgard, whose walls have never fallen. The dead walk thick here, marshalled by the Fallen Lord, Frosthelm.' },
      { title: 'The Dunes (Desert)', body: 'An endless burning waste, crossed only by the caravans of Dustmarket. Hill-giants and worse roam it, and beneath the sand hunts the Devourer, Sandmaw.' },
      { title: 'The Mire (Swamp)', body: 'The oldest wound of the Sundering — a drowned, rotting fen ringed by sunken Gloomfen. The Blight is densest here, coiled around the thing at its heart: the Mirelord.' },
    ],
  },
  {
    id: 'archfiends', title: 'The Four Archfiends', icon: '☠️', entries: [
      { title: 'Gorath the Wildking', body: 'A stag-lord of the old wood, swollen monstrous by the Blight that crowned him. The shard lodged in his heart keeps the whole Greenwood corrupted.' },
      { title: 'Frosthelm the Fallen', body: 'Once a First Hero who helped raise the Nexus. He died in the Sundering and rose wrong; now the Blight wears his armor — and his shard of the Emberheart.' },
      { title: 'Sandmaw the Devourer', body: 'Hunger given shape, burrowing the deep desert with a shard lodged in its gut. It will not stop eating until the world is bones.' },
      { title: 'The Mirelord', body: 'The Blight made flesh — the first thing to crawl from the cracks at the Sundering. It is rooted at the swamp\'s heart around the largest shard of all.' },
    ],
  },
  {
    id: 'bestiary', title: 'Bestiary', icon: '🐾', entries: [
      { title: 'Stick Slime', body: 'Blight made small: gelatinous scavengers that ooze across the meadows. Harmless alone, a creeping tide in numbers.' },
      { title: 'Bandit', body: 'Desperate folk who took to the roads after the Sundering. Not monsters — but they\'ll kill you for your boots all the same.' },
      { title: 'Dire Stick', body: 'Wolves maddened and made bold by the Blight, hunting in packs that no longer fear the firelight.' },
      { title: 'Ogre Brute', body: 'Hill-giants the corruption swelled and brutalized. Slow, vast, and strong enough to crush a caravan underfoot.' },
      { title: 'Fallen Knight', body: 'The old dead, raised in their rusted armor to guard the reaches. They were heroes once. Putting them down is the only kindness left them.' },
    ],
  },
  {
    id: 'deep', title: 'The Deep Places', icon: '🕳️', entries: [
      { title: 'Dungeons', body: 'Sealed vaults of the old world, packed with Blight and guarded by Wardens. Clear one and its hoard is yours — but the reach reclaims it in time.' },
      { title: 'Caves', body: 'Crystal caverns beneath the mountains, where Ember-light still glints in the dark. Descend far enough and a cache waits at the bottom.' },
    ],
  },
];

// A personalized Codex entry weaving the player into the world.
export function ashboundEntry(player) {
  const cls = (player && player.def && player.def.name) ? player.def.name : 'wanderer';
  const name = (player && player.name) ? player.name : 'Ashbound';
  const lvl = (player && player.stats) ? player.stats.level : 1;
  return {
    title: `You — ${name}`,
    body: `You are ${name}, a ${cls} newly returned from the ash. You woke at the Nexus with the ` +
      `Emberheart's call in your bones and no memory of the life that earned you a place among the ` +
      `Ashbound. Whatever you were, you are now Aethelgard's last ember of hope.\n\n` +
      `You stand at level ${lvl}. The road begins in the meadows and ends at the heart of the Blight — ` +
      `with four Archfiends, and four stolen shards, between you and a world made whole.`,
  };
}

// Ambient one-liners townsfolk say (kept consistent with the lore above).
export const TOWN_CHATTER = [
  'They say the Nexus was raised by the First Heroes, around the Emberheart itself.',
  'Rest at an Ember, traveller — fall out there, and it\'s the only thing that\'ll call you back.',
  'The further from the roads, the thicker the Blight. Mind yourself.',
  'An Ashbound, here? Then the Emberheart isn\'t done with us yet.',
  'Four shards, four monsters wearing crowns. That\'s all that stands between us and the end.',
  'Frostgard\'s walls have never fallen. Long may they stand.',
  'My grandfather swore Frosthelm helped raise the Nexus. Now look at him.',
  'The Mirelord was here before the Sundering, they say. Before everything.',
  'Gold buys gear, but it won\'t buy back a guttered Ember.',
];
