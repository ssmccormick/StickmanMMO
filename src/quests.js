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
    intro: 'The Mirelord is the Blight made flesh — the first thing to crawl from the cracks when the world broke. It is rooted at the swamp\'s heart, coiled around a great shard of the Emberheart. End it, Ashbound, and you cut the corruption at its oldest root. This is the one we\'ve all been too afraid to face.',
    outro: 'It\'s done. A fourth shard returns to the flame — and the Mire falls quiet for the first time since the Sundering. But the Emberheart still aches; it counts EIGHT pieces of itself, not four. There are reaches beyond the old maps — the Outer Four — and a shard lost in each. Rest, Ashbound. The hardest road is still ahead.',
    reward: { xp: 2400, gold: 1200, item: { rarityBoost: 3.2 } } },

  // ===================== THE OUTER FOUR (end-game reaches) =====================
  // --- Cinderhold (ash / Emberwastes) ---
  q_ash: { title: 'Where the Ash Burns', type: 'kill', target: 'brute', count: 10,
    desc: 'Break 10 Ogre Brutes in the Emberwastes.',
    intro: 'So the embers sent you past the old maps, to the Emberwastes — where the Blight burns instead of rots. Cinderhold has held this furnace of a reach for a hundred years, but the ash-swollen Brutes are battering our forge-gates. Break ten of them, and we\'ll see if you\'re forged for what comes next.',
    outro: 'Tempered, not melted. Good. But the brutes only rage because the wyrm rages — Pyraxis, coiled in the molten deep with a shard smoldering in its breast. That fire is why this reach never cools.',
    reward: { xp: 2000, gold: 900, item: { rarityBoost: 2.0 } } },
  q_boss_pyraxis: { title: 'The Emberwyrm', requires: 'q_ash', type: 'boss', target: 'Pyraxis the Emberwyrm', count: 1,
    desc: 'Slay Pyraxis the Emberwyrm in the molten deep.',
    intro: 'Pyraxis is a beast born of the Sundering\'s own fire, and the shard in its breast keeps the whole reach burning. Quench it, Ashbound — drag the fifth shard out of the embers before the Emberwastes burn the rest of the world down with them.',
    outro: 'The furnace cools at last. A fifth shard returns to the Emberheart, and the ash settles into something like peace. Three of the Outer Four remain — and they only grow stranger from here.',
    reward: { xp: 3000, gold: 1500, item: { rarityBoost: 3.0 } } },

  // --- Verdanthul (jungle / Verdant Wilds) ---
  q_jungle: { title: 'The Hungry Green', type: 'kill', target: 'wolf', count: 10,
    desc: 'Cull 10 Dire Sticks in the Verdant Wilds.',
    intro: 'Welcome to the Verdant Wilds, ash-walker. Older and hungrier than the Greenwood ever was — the vines here drink blood, and the beasts have forgotten fear entirely. Cull ten of the Dire packs so my canopy-folk can keep the green from swallowing the town whole.',
    outro: 'The green takes a breath, and so do we. But the Wilds answer to something far older than any wolf — Mossfang, who was rooted here before the first tree, and woke wrong when the world broke.',
    reward: { xp: 2200, gold: 1000, item: { rarityBoost: 2.1 } } },
  q_boss_mossfang: { title: 'The Ancient', requires: 'q_jungle', type: 'boss', target: 'Mossfang the Ancient', count: 1,
    desc: 'Fell Mossfang the Ancient in the jungle\'s heart.',
    intro: 'Mossfang is a primordial thing — vast, root-bound, its shard pulsing beneath a hundred years of bark and moss. It does not hunt; it simply grows, and the reach grows monstrous with it. Cut the sixth shard from its heartwood, Ashbound. Few who walk into that green walk back out.',
    outro: 'The Ancient sleeps the true sleep now, and the sixth shard comes home. The Emberheart glows hotter in my hand than it has in a generation. Two reaches left. Two shards. Then... we shall see what the flame becomes.',
    reward: { xp: 3300, gold: 1650, item: { rarityBoost: 3.0 } } },

  // --- Prismhold (crystal / Shardspire Highlands) ---
  q_crystal: { title: 'False Light', type: 'kill', target: 'knight', count: 10,
    desc: 'Shatter 10 Fallen Knights in the Shardspire Highlands.',
    intro: 'The Shardspire Highlands shine like the Emberheart itself — and that is the lie of them. The light here is fractured, cruel, and the Fallen that march the crystal flats gleam as they kill. Shatter ten, Ashbound, and do not be fooled by anything that glitters out here.',
    outro: 'Ten less liars on the flats. But the brightest lie of all sits the crystal throne: Vael, the Prism Tyrant, who split a shard of the flame into a hundred cold colors and called it a crown.',
    reward: { xp: 2500, gold: 1150, item: { rarityBoost: 2.2 } } },
  q_boss_vael: { title: 'The Prism Tyrant', requires: 'q_crystal', type: 'boss', target: 'Vael the Prism Tyrant', count: 1,
    desc: 'Break Vael the Prism Tyrant on the Shardspire.',
    intro: 'Vael holds the brightest shard — and the coldest. It refracts the Emberheart\'s own light into something that warms nothing and blinds everything. End the Tyrant, Ashbound, and reclaim the seventh shard before the false light spreads to the Nexus itself.',
    outro: 'The crystal goes dark, and the true warmth returns to the seventh shard. Only the Scarlands remain now — the last, farthest, hardest reach. One shard stands between you and an Emberheart made whole.',
    reward: { xp: 3600, gold: 1800, item: { rarityBoost: 3.1 } } },

  // --- Rustmarket (badlands / Scarlands) ---
  q_badlands: { title: 'The Bone-Dry Frontier', type: 'kill', target: 'knight', count: 10,
    desc: 'Put down 10 Fallen Knights in the Scarlands.',
    intro: 'You\'ve come to the end of the world, Ashbound — the Scarlands, all rust-red rock and bone-dry canyon. Rustmarket scrapes a living from the ruin, but the dead outnumber us a hundred to one and march to a single drum. Put down ten of the marching Fallen so we can hear ourselves think.',
    outro: 'That\'s ten fewer drums. But they all march for Skarn, the Bonelord, throned in the deepest canyon on the last lost shard. Reach him, and you reach the end of the long road.',
    reward: { xp: 2800, gold: 1300, item: { rarityBoost: 2.3 } } },
  q_boss_skarn: { title: 'The Bonelord', requires: 'q_badlands', type: 'boss', target: 'Skarn the Bonelord', count: 1,
    desc: 'Cast down Skarn the Bonelord at the canyon\'s bottom.',
    intro: 'Skarn is the marshal of every dead thing in the Scarlands, and the eighth and final shard is set in its bone throne like a jewel. Cast it down, Ashbound, and the Emberheart will hold all eight pieces of itself once more. Everything we are has come down to this.',
    outro: 'The Bonelord falls, and the EIGHTH shard returns to the flame. For the first time since the Sundering, the Emberheart is whole — I can feel it blazing from here. You did what no Ashbound before you could. And yet... the sky has gone strange. Something vast is stirring above the far peaks. Go to Keeper Aelith at the Nexus. Quickly.',
    reward: { xp: 4200, gold: 2200, item: { rarityBoost: 3.3 } } },

  // ===================== THE SKY-TYRANT (the true finale) =====================
  q_dragon: { title: 'The Sky-Tyrant', requires: 'q_boss_skarn', type: 'boss', target: 'Vetharion, the Sky-Tyrant', count: 1,
    desc: 'Slay Vetharion, the Sky-Tyrant, at the Dragon\'s Roost.',
    intro: 'You felt it the moment the eighth shard came home, didn\'t you? When the Emberheart was made whole, the Blight\'s last and greatest horror tore loose from the sky to reclaim it: Vetharion, the Sky-Tyrant — the dragon that has circled Aethelgard since the world broke, waiting for the flame to be worth devouring. It has descended to the Dragon\'s Roost in the far north. Everything — every shard, every Archfiend, every death and rebirth — has been preparing you for this. Go, Ashbound. End it, and the world is finally, truly free.',
    outro: 'The Sky-Tyrant falls from the heavens, and the long shadow it cast over Aethelgard lifts at last. The Emberheart blazes whole and unthreatened, the Embers brighten in every reach, and the world remembers how to hope. You are no longer the last Ashbound — you are the first hero of the age to come. Aethelgard will sing your name beside the First Heroes, for as long as the flame remembers. And it will remember you forever.',
    reward: { xp: 9000, gold: 5000, item: { rarityBoost: 4.0 } } },

  // ===================== AREA LIEUTENANT LINES =====================
  // A second quest line per reach, given by a local specialist, hunting the
  // Archfiend's Lieutenant — a lesser champion that terrorizes the near country
  // before the Archfiend's own deep lair. Each is a two-step chain (thin the
  // herald's beasts, then fell the herald) and runs parallel to the main line.

  // --- Thornhollow (forest): Houndmaster Cael ---
  q_forest_hunt: { title: 'The Bramble Hunt', type: 'kill', target: 'boar', count: 8,
    desc: 'Drive off 8 Tuskchargers from the Greenwood trails.',
    intro: 'You smell that? Rot and crushed bramble. Something big is churning up the near wood and driving the Tuskchargers wild — eight of them gored my hounds this week alone. Thin the herd for me, Ashbound, and we\'ll track the thing that spooked them to its lair.',
    outro: 'The trails are safe to walk again. And now I know what stirred them: Bramblehorn, a thorn-crowned tyrant the Blight grew out of an old boar-king. It nests in the thickets between here and the deep wood.',
    reward: { xp: 240, gold: 110, potion: 'hp_minor', potionCount: 2 } },
  q_boss_bramblehorn: { title: 'Herald of the Wildking', requires: 'q_forest_hunt', type: 'boss', target: 'Bramblehorn the Thorn-Tyrant', count: 1,
    desc: 'Slay Bramblehorn the Thorn-Tyrant in the near thickets.',
    intro: 'Bramblehorn is Gorath\'s herald — the Wildking sends it ahead to break anything that dares approach the deep wood. A wall of thorn and muscle. Put it down, Ashbound, and you\'ll have cleared the road to the Wildking himself.',
    outro: 'The Thorn-Tyrant lies still, and the deep wood\'s door stands open. Gorath will feel that loss. Go finish what you started — the Greenwood is counting on you.',
    reward: { xp: 520, gold: 260, item: { rarityBoost: 1.4 } } },

  // --- Frostgard (snow): Huntress Signe ---
  q_snow_hunt: { title: 'The White Hunt', type: 'kill', target: 'frostwolf', count: 8,
    desc: 'Bring down 8 Frost Fangs stalking the Frostpeaks.',
    intro: 'The Frost Fangs have gone from wary to fearless — they circle Frostgard\'s walls in daylight now, and only one thing makes a wolf that bold: a bigger wolf leading it. Cull eight of the pack, Ashbound, and flush their leader into the open.',
    outro: 'Good hunting. The pack breaks without its numbers — and its leader is no ordinary wolf. Rimefang, a white alpha the size of a bear, its breath cold enough to still a heart. It dens in the passes above the town.',
    reward: { xp: 360, gold: 170, potion: 'hp_major', potionCount: 1 } },
  q_boss_rimefang: { title: 'The White Alpha', requires: 'q_snow_hunt', type: 'boss', target: 'Rimefang the White Alpha', count: 1,
    desc: 'Slay Rimefang the White Alpha in the high passes.',
    intro: 'Rimefang is Frosthelm\'s hound — the Fallen Lord loosed it to keep the living penned in Frostgard while the dead marshal in the peaks. End the alpha, Ashbound, and Frosthelm loses his eyes on the pass.',
    outro: 'The great wolf falls silent in the snow. Frosthelm hunts blind now. The peaks are yours to climb — go and lay the old Lord to rest.',
    reward: { xp: 700, gold: 340, item: { rarityBoost: 1.5 } } },

  // --- Dustmarket (desert): Digger Tavi ---
  q_desert_hunt: { title: 'The Scarab Swarm', type: 'kill', target: 'scarab', count: 8,
    desc: 'Crush 8 War Scarabs boiling up from the Dunes.',
    intro: 'They come up out of the sand in waves now — War Scarabs, big as shields, chewing through our dig-sites and our diggers alike. Eight of them, Ashbound. Crush the shells and something will come up to defend the brood. It always does.',
    outro: 'The digs can breathe again. And you were right to leave one alive to run — it led straight to her. Khareth, the Scarab Queen, a bloated horror that lays the whole swarm. She burrows the near dunes.',
    reward: { xp: 620, gold: 300, item: { rarityBoost: 1.3 } } },
  q_boss_khareth: { title: 'The Brood-Queen', requires: 'q_desert_hunt', type: 'boss', target: 'Khareth the Scarab Queen', count: 1,
    desc: 'Slay Khareth the Scarab Queen in the near dunes.',
    intro: 'Khareth feeds the whole reach\'s swarms — every scarab in the Dunes is her spawn, and Sandmaw the Devourer lets her breed because her broods soften his prey. Kill the Queen, Ashbound, and you starve the Devourer of his army.',
    outro: 'The Queen is gutted and her broods die in the sand with her. Sandmaw hunts alone now. Go find the Devourer in the deep desert — he\'ll be hungrier, and angrier, than ever.',
    reward: { xp: 1000, gold: 500, item: { rarityBoost: 1.8 } } },

  // --- Gloomfen (swamp): Fenwise Mup ---
  q_swamp_hunt: { title: 'Drain the Lurkers', type: 'kill', target: 'bogling', count: 8,
    desc: 'Put down 8 Bog Lurkers in the shallows of the Mire.',
    intro: 'The Bog Lurkers are massing, Ashbound — hulking things of mud and hate, and they only gather thick when their brood-father calls them close. Put eight of them back in the muck. Draw out the one that\'s pulling their strings.',
    outro: 'The shallows still. And there it is on the water — Grulmog, a Lurker grown vast on a century of drowned dead, the brood-father of the whole fen. It squats between here and the Mire\'s black heart.',
    reward: { xp: 840, gold: 400, item: { rarityBoost: 1.5 } } },
  q_boss_grulmog: { title: 'The Brood-Father', requires: 'q_swamp_hunt', type: 'boss', target: 'Grulmog the Bog-Devourer', count: 1,
    desc: 'Destroy Grulmog the Bog-Devourer in the deep shallows.',
    intro: 'Grulmog is the Mirelord\'s gatekeeper — a wall of rotted flesh that swallows anything wading toward the swamp\'s heart. The Mirelord has never needed to move because Grulmog eats its enemies first. Cut the gatekeeper down, Ashbound, and the heart lies open.',
    outro: 'The brood-father sinks into the muck it was born from. Nothing guards the Mire\'s heart now but the Mirelord itself. Steel yourself — the oldest wound of the Sundering waits just beyond.',
    reward: { xp: 1400, gold: 720, item: { rarityBoost: 2.0 } } },

  // --- Cinderhold (ash): Slag-Warden Orun ---
  q_ash_hunt: { title: 'Hounds of Cinder', type: 'kill', target: 'emberhound', count: 10,
    desc: 'Break 10 Ember Hounds prowling the Emberwastes.',
    intro: 'The Ember Hounds run in burning packs across the slag, and lately they hunt with purpose — herding our forge-crews toward the deep vents. Something is using them as beaters on a hunt, Ashbound. Kill ten and find out what.',
    outro: 'Tempered work. The pack answered to a bigger fire all along: Cindermaw, a hound the size of a wagon, its hide cracked open and glowing like a forge. It dens in the near ashfields.',
    reward: { xp: 1600, gold: 760, item: { rarityBoost: 1.8 } } },
  q_boss_cindermaw: { title: 'The Forge-Hound', requires: 'q_ash_hunt', type: 'boss', target: 'Cindermaw the Ashen Hound', count: 1,
    desc: 'Slay Cindermaw the Ashen Hound in the near ashfields.',
    intro: 'Cindermaw is Pyraxis\'s hunting-hound — the Emberwyrm looses it to run down anything that tries to reach the molten deep. Snuff its fire, Ashbound, and Pyraxis will have no one to chase you but itself.',
    outro: 'The Forge-Hound gutters and goes cold. The road to the molten deep is clear. Go quench Pyraxis — and mind the heat.',
    reward: { xp: 2200, gold: 1100, item: { rarityBoost: 2.4 } } },

  // --- Verdanthul (jungle): Trapper Yiss ---
  q_jungle_hunt: { title: 'Eyes in the Green', type: 'kill', target: 'panther', count: 10,
    desc: 'Hunt 10 Shadowpanthers in the Verdant Wilds.',
    intro: 'You never see the Shadowpanthers until they\'re on you — and lately there are far too many, all slinking toward one dark grove. Something has drawn them together, ash-walker. Thin them to ten fewer, and follow the trail they leave.',
    outro: 'The green has fewer eyes now. And the trail led true — to Shaggath, a panther grown black and vast, its claws wet with the blood of my whole trapping-line. It stalks the near canopy.',
    reward: { xp: 1750, gold: 830, item: { rarityBoost: 1.85 } } },
  q_boss_shaggath: { title: 'The Blood-Panther', requires: 'q_jungle_hunt', type: 'boss', target: 'Shaggath the Blood-Panther', count: 1,
    desc: 'Fell Shaggath the Blood-Panther in the near canopy.',
    intro: 'Shaggath is Mossfang\'s claw — the one moving part of an Ancient that cannot move, sent to rend anything that nears the heartwood. Kill the claw, Ashbound, and Mossfang is left blind and rooted, waiting for you.',
    outro: 'The Blood-Panther bleeds out among the roots. Mossfang has no reach left but its own slow hunger. Go to the jungle\'s heart and cut the shard from the Ancient.',
    reward: { xp: 2400, gold: 1200, item: { rarityBoost: 2.4 } } },

  // --- Prismhold (crystal): Cutter Vane ---
  q_crystal_hunt: { title: 'Shatter the Golems', type: 'kill', target: 'shardling', count: 10,
    desc: 'Shatter 10 Shard Golems on the crystal flats.',
    intro: 'The Shard Golems are growing — the flats grow more of them every night, marching in ranks toward the spire. Something is quarrying our own crystal into an army, Ashbound. Break ten of them and dull the light that\'s shaping them.',
    outro: 'Ten less marchers. And now I see the shape behind them: Facet-Warden Prismis, a golem grown into a walking prism, cutting new soldiers from the flats. It guards the near approach to the Shardspire.',
    reward: { xp: 2000, gold: 950, item: { rarityBoost: 1.9 } } },
  q_boss_prismis: { title: 'The Facet-Warden', requires: 'q_crystal_hunt', type: 'boss', target: 'Prismis the Facet-Warden', count: 1,
    desc: 'Break Prismis the Facet-Warden on the crystal approach.',
    intro: 'Prismis is Vael\'s warden — the Prism Tyrant\'s own light given legs, set to cut and blind any who climb toward the throne. Shatter the Warden, Ashbound, and Vael loses the wall of false light it hides behind.',
    outro: 'The Warden bursts into a rain of dead crystal. The approach to the throne is dark and open now. Climb the Shardspire and break the Tyrant\'s cold crown.',
    reward: { xp: 2700, gold: 1350, item: { rarityBoost: 2.5 } } },

  // --- Rustmarket (badlands): Bonepicker Sela ---
  q_badlands_hunt: { title: 'Rattle the Bones', type: 'kill', target: 'bonewalker', count: 10,
    desc: 'Put down 10 Bonewalkers in the Scarlands canyons.',
    intro: 'The Bonewalkers are stacking themselves into something, Ashbound — dragging bone to bone in the canyons, building toward a shape none of us wants to see finished. Put ten back down as loose bones, and rattle whatever\'s assembling them.',
    outro: 'That\'s ten fewer to worry about. And the thing that\'s stacking them showed itself: Rustfang, a Bonewalker fused with a mountain of scrap and rusted iron. It patrols the canyons above Bonechew.',
    reward: { xp: 2300, gold: 1100, item: { rarityBoost: 2.0 } } },
  q_boss_rustfang: { title: 'The Scrap-Tyrant', requires: 'q_badlands_hunt', type: 'boss', target: 'Rustfang the Scrap-Tyrant', count: 1,
    desc: 'Cast down Rustfang the Scrap-Tyrant in the upper canyons.',
    intro: 'Rustfang is Skarn\'s foreman — the Bonelord\'s will made of scrap iron and stolen bone, building the walls that seal Bonechew Canyon. Tear the foreman apart, Ashbound, and the last road to the last Archfiend lies open.',
    outro: 'The Scrap-Tyrant collapses into the junk it was raised from. Nothing stands between you and Bonechew\'s bottom now — nothing but Skarn, and the eighth shard. This is the end of the long road.',
    reward: { xp: 3000, gold: 1500, item: { rarityBoost: 2.6 } } },

  // ===================== SIDE QUESTS =====================
  q_angler: { title: 'A Quiet Hour', requires: 'q_chest', type: 'fish', count: 12,
    desc: 'Reel in 12 fish from the waters of Aethelgard.',
    intro: 'Between you and me, Ashbound, this world-saving business is exhausting to watch. Do an old fence a favor — go wet a line somewhere quiet and bring me back twelve good fish. The Sundered Sea, a river, a mountain tarn, doesn\'t matter. Half of them I\'ll sell. The other half... well, even the Emberheart\'s chosen has to eat.',
    outro: 'Now THAT is a catch. There\'s coin in fish, and there\'s peace in fishing — and out here, peace is the rarer prize. Come back and cast a line whenever the war gets too loud, eh?',
    reward: { xp: 600, gold: 400, item: { rarityBoost: 1.2 } } },
  q_proving: { title: 'The Proving', requires: 'q_knights', type: 'level', count: 15,
    desc: 'Grow to level 15 and prove you can carry the flame.',
    intro: 'The reaches beyond the Nexus will eat a green Ashbound alive. Before I send anyone past the bridges with my blessing, they prove they can survive the road. Reach the fifteenth mark of your strength, soldier — claw your way to level 15 — and report back to me a hero, not a hopeful.',
    outro: 'Fifteen levels of scars and grit. The flame chose well — you\'re ready for the reaches that matter now. Go carry the firelight where Frostgard and the rest can\'t. The Nexus stands with you, Ashbound.',
    reward: { xp: 800, gold: 350, potion: 'hp_major', potionCount: 3 } },
};

// Quest-giver NPCs, grouped by town. Each offers its quest chain in order.
export const GIVERS = [
  { name: 'Mara the Herbalist', town: 'The Nexus', dx: 8, dz: 8, color: 0x6fae54, accent: 0xffe27a, quests: ['q_slimes', 'q_wolves'] },
  { name: 'Captain Stane', town: 'The Nexus', dx: -8, dz: 8, color: 0x9aa4b2, accent: 0xd8423c, quests: ['q_bandits', 'q_knights', 'q_proving'] },
  { name: 'Finn the Fence', town: 'The Nexus', dx: 8, dz: -7, color: 0x5a4f6a, accent: 0xc07bff, quests: ['q_chest', 'q_angler'] },
  { name: 'Ranger Elowen', town: 'Thornhollow', dx: 0, dz: 5, color: 0x4d8a3a, accent: 0x9bd86a, quests: ['q_forest', 'q_boss_gorath'] },
  { name: 'Houndmaster Cael', town: 'Thornhollow', dx: 7, dz: -4, color: 0x6a5a3a, accent: 0xd8b26a, quests: ['q_forest_hunt', 'q_boss_bramblehorn'] },
  { name: 'Warden Bram', town: 'Frostgard', dx: 0, dz: 5, color: 0x9aa6c2, accent: 0x9fe0ff, quests: ['q_snow', 'q_boss_frosthelm'] },
  { name: 'Huntress Signe', town: 'Frostgard', dx: 7, dz: -4, color: 0xbfc8d8, accent: 0xe0f0ff, quests: ['q_snow_hunt', 'q_boss_rimefang'] },
  { name: 'Sister Dune', town: 'Dustmarket', dx: 0, dz: 5, color: 0xd9c486, accent: 0xffcf6a, quests: ['q_desert', 'q_boss_sandmaw'] },
  { name: 'Digger Tavi', town: 'Dustmarket', dx: 7, dz: -4, color: 0xc2a05a, accent: 0x8a6a3a, quests: ['q_desert_hunt', 'q_boss_khareth'] },
  { name: 'Old Cregg', town: 'Gloomfen', dx: 0, dz: 5, color: 0x6a7a52, accent: 0xb05aff, quests: ['q_swamp', 'q_boss_mirelord'] },
  { name: 'Fenwise Mup', town: 'Gloomfen', dx: 7, dz: -4, color: 0x4a5a3a, accent: 0x7fae5a, quests: ['q_swamp_hunt', 'q_boss_grulmog'] },
  // The Outer Four — two givers per end-game town (main line + lieutenant line).
  { name: 'Emberwright Hadda', town: 'Cinderhold', dx: 0, dz: 5, color: 0x8a4a2a, accent: 0xff8a2a, quests: ['q_ash', 'q_boss_pyraxis'] },
  { name: 'Slag-Warden Orun', town: 'Cinderhold', dx: 7, dz: -4, color: 0x6a3a2a, accent: 0xff5a2a, quests: ['q_ash_hunt', 'q_boss_cindermaw'] },
  { name: 'Vinespeaker Oba', town: 'Verdanthul', dx: 0, dz: 5, color: 0x2f6e2a, accent: 0x9bd86a, quests: ['q_jungle', 'q_boss_mossfang'] },
  { name: 'Trapper Yiss', town: 'Verdanthul', dx: 7, dz: -4, color: 0x3a5a2a, accent: 0x6fd86a, quests: ['q_jungle_hunt', 'q_boss_shaggath'] },
  { name: 'Lumen the Refracted', town: 'Prismhold', dx: 0, dz: 5, color: 0x8a9ad0, accent: 0xb2a8e2, quests: ['q_crystal', 'q_boss_vael'] },
  { name: 'Cutter Vane', town: 'Prismhold', dx: 7, dz: -4, color: 0x9a8ad8, accent: 0xcdf2ff, quests: ['q_crystal_hunt', 'q_boss_prismis'] },
  { name: 'Scrap-Captain Dol', town: 'Rustmarket', dx: 0, dz: 5, color: 0xb0663a, accent: 0xc98a4a, quests: ['q_badlands', 'q_boss_skarn'] },
  { name: 'Bonepicker Sela', town: 'Rustmarket', dx: 7, dz: -4, color: 0xcabf9a, accent: 0x8a7a5a, quests: ['q_badlands_hunt', 'q_boss_rustfang'] },
  // The Keeper of the Flame, at the Nexus, offers the final trial.
  { name: 'Keeper Aelith', town: 'The Nexus', dx: -8, dz: -7, color: 0xd8b24a, accent: 0xff6a2a, quests: ['q_dragon'] },
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
  if (player.counters) player.counters.quests = (player.counters.quests || 0) + 1; // Hero of Aethelgard
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
export function onFish(player) { advance(player, (q) => q.type === 'fish'); }
