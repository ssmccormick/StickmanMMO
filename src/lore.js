// ============================================================
// Lore: the world-board for Aethelgard. A cohesive backstory that the
// quests and the player's role hang from — read in-game via the Codex (L).
// The central conceit ties directly to the game's mechanics: bonfires are
// Embers of a great flame, which is *why* the Ashbound (you) return from
// death; the eight world bosses hold the shards that keep it broken, and the
// Sky-Tyrant dragon is the end-boss that descends once all eight have fallen.
// ============================================================

export const WORLD_NAME = 'Aethelgard';

// The hook, shown at the top of the Codex.
export const PROLOGUE =
  'In the age before memory, the First Heroes raised the Nexus at the heart of ' +
  'Aethelgard and kindled the Emberheart — a flame that bound the world together ' +
  'and remembered the names of the brave. While it burned, no hero who fell beside ' +
  'its embers stayed dead for long.\n\n' +
  'Then came the Sundering. The Emberheart shattered into eight shards, the land tore into ' +
  'eight wild and warring reaches, and into the wounds crept the Blight — a corruption that ' +
  'raises the dead, maddens the beasts, and crowns monsters as kings. And high above it all, ' +
  'a dragon tore loose from the breaking sky, and has circled ever since — waiting.\n\n' +
  'The embers are guttering now. But the flame still remembers a few. It has remembered you.';

// The codex: categorized lore the player can browse. Each section is a list of
// short, readable entries.
export const CODEX = [
  {
    id: 'world', title: 'The World', icon: '🌍', entries: [
      { title: 'Aethelgard', body: 'A broken world of green meadows, deep wood, frozen peaks, burning dunes and drowned mire — and, beyond the old maps, the stranger Outer reaches of ash, jungle, crystal and rust. All of it spun out from one central refuge, the Nexus. The roads still remember when it was whole.' },
      { title: 'The Nexus', body: 'The first and last refuge: a great walled city raised by the First Heroes upon an island at the heart of the world, ringed by the Sundered Sea. Long stone causeways bridge the water to the eight reaches beyond, and the small Waking Vale across the first bridge is where the newly-Ashbound take their first steps onto the mainland. No Blight may enter while the flame burns — which is why every town remains a haven.' },
      { title: 'The Sundered Sea', body: 'When the world cracked, the waters rushed in to ring the Nexus, drowning the old heartland and leaving the capital an island. Only the First Heroes\' causeways still cross it — to reach any reach you must take a bridge, or brave the cold water.' },
      { title: 'The Emberheart & the Embers', body: 'The great flame at the Nexus is the Emberheart. Every bonfire in the wilds is one of its scattered Embers. Rest at an Ember and it learns your name; fall in battle, and it calls you back. This is why the Ashbound do not stay dead — and why the guttering of the Embers threatens all of Aethelgard.' },
      { title: 'The Reaches & Their Passes', body: 'When the world sundered, great mountain ranges rose between the reaches, walling each region off from its neighbours. To cross from one reach to the next you must find the mountain pass that pierces the range — or brave the deadly heights of the high country between.' },
      { title: 'Shrines & Lost Caches', body: 'The old world left its marks across the wild: rune-lit shrines that bless the worthy traveller for a time, and treasure caches hidden far from the roads. Stray off the beaten path and you may be rewarded.' },
    ],
  },
  {
    id: 'sundering', title: 'The Sundering', icon: '☄️', entries: [
      { title: 'The Breaking', body: 'No two tales agree on what cracked the Emberheart — a war, a betrayal, a bargain struck with something beneath the world. What is certain is that the land tore apart, and eight reaches drifted away into wilderness, each left to rot in its own way.' },
      { title: 'The Blight', body: 'From the cracks seeped the Blight: a corruption that animates the fallen, maddens beasts, and pools where the strongest monsters crown themselves kings. It cannot abide Ember-light — the one mercy left to the living.' },
      { title: 'The Eight Shards', body: 'When the Emberheart broke, EIGHT shards of its essence were lost into the reaches — the Inner Four (Greenwood, Frostpeaks, Dunes, Mire), close to the Nexus and long known, and the Outer Four (Emberwastes, Verdant Wilds, Shardspire, Scarlands), far beyond the old maps. Each shard was seized by an Archfiend the Blight raised into a king. While even one is held, the flame cannot be made whole.' },
      { title: 'The Thing in the Sky', body: 'Not everything the Sundering loosed crawled. When the Emberheart cracked, a dragon — Vetharion, the Sky-Tyrant — tore free of the heavens and took to an endless orbit above Aethelgard. The Archfiends are the Blight\'s crowns; Vetharion is its hunger. It waits for the flame to be made whole again, so that it may devour something worth devouring.' },
    ],
  },
  {
    id: 'ashbound', title: 'The Ashbound', icon: '🔥', entries: [
      { title: 'Reborn from Embers', body: 'The Ashbound are heroes the Emberheart refuses to forget. Burned to ash and called back from the embers, they alone can carry living flame into the Blighted reaches. Most of the old Ashbound are gone now. You are among the last.' },
      { title: 'Your Purpose', body: 'Prove yourself in the meadows, push into each reach in turn, and end the eight Archfiends whose stolen shards keep the Emberheart broken — the Inner Four first, then the Outer Four beyond the old maps. Carry every shard back to the Nexus, and the flame will be whole again. But beware: when it is, the Sky-Tyrant will descend to claim it, and the last and greatest battle of the age will be yours to fight.' },
    ],
  },
  {
    id: 'reaches', title: 'The Reaches', icon: '🗺️', entries: [
      { title: 'The Greenwood (Forest)', body: 'A vast, overgrown wood watched over by the town of Thornhollow and its rangers. Beautiful and deadly — even the wolves have turned. The herald Bramblehorn guards the near thickets; the stag-lord Gorath rules its depths.' },
      { title: 'The Frostpeaks (Snow)', body: 'A range of bitter cold and old stone, anchored by the fortress-town of Frostgard, whose walls have never fallen. The white alpha Rimefang prowls the passes; deeper still, the dead walk thick, marshalled by the Fallen Lord, Frosthelm.' },
      { title: 'The Dunes (Desert)', body: 'An endless burning waste, crossed only by the caravans of Dustmarket. The Scarab Queen Khareth breeds in the near dunes; beneath the deep sand hunts the Devourer, Sandmaw.' },
      { title: 'The Mire (Swamp)', body: 'The oldest wound of the Sundering — a drowned, rotting fen ringed by sunken Gloomfen. The brood-father Grulmog guards the shallows; the Blight is densest at the heart, coiled around the thing that rules it: the Mirelord.' },
      { title: 'The Emberwastes (Ash)', body: 'A scorched volcanic waste of charred trees and ember-lit ash, where the Blight burns rather than rots. The forge-town of Cinderhold endures the heat; the forge-hound Cindermaw runs the ashfields, and the Emberwyrm Pyraxis prowls the molten deep.' },
      { title: 'The Verdant Wilds (Jungle)', body: 'A riotous, suffocating jungle of towering palms and tangled vine, ruled from the canopy-town of Verdanthul. The Blood-Panther Shaggath stalks the near canopy; older and hungrier than any of them, Mossfang the Ancient roots at its heart.' },
      { title: 'Shardspire Highlands (Crystal)', body: 'Pale, glittering highlands of crystal spires that hum with Ember-light, anchored by Prismhold. The Facet-Warden Prismis guards the approach; upon the spire, Vael, the Prism Tyrant, bends the light to cruel ends.' },
      { title: 'The Scarlands (Badlands)', body: 'A cracked country of rust-red mesas and bone-dry canyons, held by the frontier-town of Rustmarket. The Scrap-Tyrant Rustfang seals the upper canyons; at the very bottom, the Bonelord Skarn rules the endless dead.' },
    ],
  },
  {
    id: 'archfiends', title: 'The Archfiends', icon: '☠️', entries: [
      { title: 'Gorath the Wildking', body: 'A stag-lord of the old wood, swollen monstrous by the Blight that crowned him. The shard lodged in his heart keeps the whole Greenwood corrupted.' },
      { title: 'Frosthelm the Fallen', body: 'Once a First Hero who helped raise the Nexus. He died in the Sundering and rose wrong; now the Blight wears his armor — and his shard of the Emberheart.' },
      { title: 'Sandmaw the Devourer', body: 'Hunger given shape, burrowing the deep desert with a shard lodged in its gut. It will not stop eating until the world is bones.' },
      { title: 'The Mirelord', body: 'The Blight made flesh — the first thing to crawl from the cracks at the Sundering. It is rooted at the swamp\'s heart around the largest shard of all.' },
      { title: 'Pyraxis the Emberwyrm', body: 'A beast born of the Sundering\'s fire, wreathed in the Emberwastes\' ash. The shard in its breast smolders, keeping the volcanic reach forever burning.' },
      { title: 'Mossfang the Ancient', body: 'A primordial thing that woke in the jungle\'s heart when the world broke, vast and root-bound. Its shard pulses beneath layers of bark and moss.' },
      { title: 'Vael the Prism Tyrant', body: 'A being of fractured Ember-light that rules the crystal highlands, splitting the flame into a hundred cruel colors. Its shard is the brightest — and the coldest.' },
      { title: 'Skarn the Bonelord', body: 'The marshal of the Scarlands\' endless dead, throned in bone at the bottom of Bonechew Canyon. Its shard is the last and most distant of all — and with its fall, the eight are whole.' },
    ],
  },
  {
    id: 'heralds', title: 'The Heralds', icon: '🩸', entries: [
      { title: 'The Lieutenants', body: 'No Archfiend rules its reach alone. Each has raised a Herald — a lesser champion of the Blight — to terrorize the near country, blood the reach\'s beasts, and break any Ashbound long before they reach the deep lair. Fell a Herald, and its Archfiend is left weakened, blinded, or exposed.' },
      { title: 'Bramblehorn the Thorn-Tyrant', body: 'Gorath\'s herald: an old boar-king swollen into a wall of thorn and muscle. The Wildking sends it ahead to gore anything that nears the deep wood.' },
      { title: 'Rimefang the White Alpha', body: 'Frosthelm\'s hound: a white wolf the size of a bear, its breath cold enough to still a heart. It keeps the living penned in Frostgard while the dead marshal above.' },
      { title: 'Khareth the Scarab Queen', body: 'Sandmaw\'s breeder: a bloated horror that lays the whole Dunes\' swarm. The Devourer suffers her broods because they soften his prey.' },
      { title: 'Grulmog the Bog-Devourer', body: 'The Mirelord\'s gatekeeper: a Bog Lurker grown vast on a century of drowned dead. It swallows anything wading toward the swamp\'s heart, so the Mirelord need never move.' },
      { title: 'Cindermaw the Ashen Hound', body: 'Pyraxis\'s hunting-hound: a beast the size of a wagon, its hide cracked open and glowing like a forge. It runs down anything fleeing the molten deep.' },
      { title: 'Shaggath the Blood-Panther', body: 'Mossfang\'s claw: the one moving part of an Ancient that cannot move, sent to rend anything nearing the heartwood.' },
      { title: 'Prismis the Facet-Warden', body: 'Vael\'s warden: the Prism Tyrant\'s own light given legs, cutting fresh soldiers from the crystal flats and blinding all who climb toward the throne.' },
      { title: 'Rustfang the Scrap-Tyrant', body: 'Skarn\'s foreman: a Bonewalker fused with a mountain of scrap iron, building the walls that seal Bonechew Canyon at the Bonelord\'s command.' },
    ],
  },
  {
    id: 'skytyrant', title: 'The Sky-Tyrant', icon: '🐉', entries: [
      { title: 'Vetharion', body: 'The dragon that tore loose when the world broke and has circled Aethelgard ever since — vast, patient, and older than any Archfiend. The crowned monsters merely rule the ruin; Vetharion intends to end it. It will not descend until the Emberheart is whole again and worth the taking.' },
      { title: 'The Dragon\'s Roost', body: 'When all eight shards return to the flame, the Sky-Tyrant breaks its endless orbit and falls upon the far-northern wastes — the Dragon\'s Roost, below the high peaks. There the last battle of the age is fought, beneath a sky that has waited a thousand years to land.' },
      { title: 'The Final Trial', body: 'No shard, no Archfiend, no death and rebirth was ever the true test — they were the preparation. Vetharion is the trial the Ashbound was kindled for. To fell it is to free Aethelgard not just from the Blight, but from the shadow that hung over the whole broken age.' },
    ],
  },
  {
    id: 'bestiary', title: 'Bestiary', icon: '🐾', entries: [
      { title: 'Stick Slime', body: 'Blight made small: gelatinous scavengers that ooze across the meadows. Harmless alone, a creeping tide in numbers.' },
      { title: 'Bandit', body: 'Desperate folk who took to the roads after the Sundering. Not monsters — but they\'ll kill you for your boots all the same.' },
      { title: 'Dire Stick', body: 'Wolves maddened and made bold by the Blight, hunting in packs that no longer fear the firelight.' },
      { title: 'Ogre Brute', body: 'Hill-giants the corruption swelled and brutalized. Slow, vast, and strong enough to crush a caravan underfoot.' },
      { title: 'Fallen Knight', body: 'The old dead, raised in their rusted armor to guard the reaches. They were heroes once. Putting them down is the only kindness left them.' },
      { title: 'Sky Wraith', body: 'Winged horrors born of the Blight\'s reach into the air. They circle high over the wilds and fold their wings to dive the moment a living thing strays too far from the firelight.' },
      { title: 'Vetharion, the Sky-Tyrant', body: 'Not a beast of the reaches but of the sky itself — the dragon loosed by the Sundering. The largest living thing in Aethelgard, and the last the Ashbound will ever have to face.' },
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
      `You stand at level ${lvl}. The road begins in the meadows and ends in the far-northern sky — ` +
      `with eight Archfiends and their eight stolen shards between you and a world made whole, and the ` +
      `Sky-Tyrant Vetharion waiting beyond them all for the flame to be worth devouring.`,
  };
}

// Ambient one-liners townsfolk say (kept consistent with the lore above).
export const TOWN_CHATTER = [
  'They say the Nexus was raised by the First Heroes, around the Emberheart itself.',
  'Rest at an Ember, traveller — fall out there, and it\'s the only thing that\'ll call you back.',
  'The further from the roads, the thicker the Blight. Mind yourself.',
  'An Ashbound, here? Then the Emberheart isn\'t done with us yet.',
  'Eight shards, eight monsters wearing crowns. That\'s all that stands between us and the end.',
  'Frostgard\'s walls have never fallen. Long may they stand.',
  'My grandfather swore Frosthelm helped raise the Nexus. Now look at him.',
  'The Mirelord was here before the Sundering, they say. Before everything.',
  'Gold buys gear, but it won\'t buy back a guttered Ember.',
  'The Inner Four are bad enough — but folk who\'ve come back from the Outer reaches don\'t talk much.',
  'They say Cinderhold\'s air is hot enough to cook bread on the wind. And Rustmarket\'s worse.',
  'Look up some clear night and you\'ll see it — that shadow that circles and circles. Best pray it stays up there.',
  'When the last shard comes home, they say the sky itself will come down for it. Gives me chills.',
];
