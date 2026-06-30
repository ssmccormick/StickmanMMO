# 🏃 Stickman MMO

A **2.5D open-world browser MMORPG** of stick figures — a smorgasbord of beloved
game mechanics that puts **systems over graphics**. Inspired by **World of
Warcraft** (classes, leveling, hotbars, nameplates), **Dark Souls** (bonfire
checkpoints, stamina, "YOU DIED", monster respawn on rest), and **Breath of the
Wild** (free-form cliff climbing with a stamina meter).

Built with **Three.js**, runs entirely in the browser with **no build step** and
**no external dependencies** (Three.js is vendored into `vendor/`). An optional
lightweight Node WebSocket server adds real multiplayer; without it the game runs
in solo mode.

![Stickman MMO](https://img.shields.io/badge/engine-three.js-blue) ![No build step](https://img.shields.io/badge/build-none-green)

---

## ▶️ Play

**Online:** https://ssmccormick.github.io/StickmanMMO/ (auto-deployed from this branch via GitHub Pages).

**Locally:** The game uses ES modules + import maps, which require an `http(s)` origin (they
won't load from a `file://` URL). Serve the folder with the bundled zero-dependency
static server:

```bash
node static-server.js          # → http://localhost:5173
# or: npm start
```

Then open **http://localhost:5173**, pick a class, and click **ENTER THE WORLD**.
Any static file server works too (`npx serve`, `python3 -m http.server`, etc.).

## 🎮 Controls

| Input | Action |
|-------|--------|
| **W A S D** | Move (relative to camera) |
| **Mouse** | Look / orbit camera (click canvas to lock pointer) |
| **Mouse wheel** | Zoom camera |
| **Shift** | Sprint (drains stamina) |
| **Space** | Jump / climb up / **swim up** |
| **Shift** (in water) | Dive down |
| **R** | Summon / dismiss your mount |
| **W into a cliff** | Climb it BotW-style (drains stamina; reach the top to mantle) |
| **Left Mouse** | Auto-attack (melee swing or ranged shot by your wielded weapon) |
| **1 – 6** | Learned class abilities |
| **Tab** | Swap between your two weapons |
| **F** | Cycle target |
| **E** | Interact / rest at a bonfire |
| **I** | Inventory & equipment |
| **K** | Skills (details & damage) |
| **C** | Character sheet |
| **M** | World map (click a discovered bonfire to fast-travel) |
| **J** | Quest log |
| **L** | Codex / lore-board |
| **B** | Achievements |
| **N** | Wardrobe (change your look; apply unlocked cosmetics) |
| **T** | Emote wheel (wave, dance, cheer, flex…) |
| **E** (near water) | Cast a line and fish |
| **Q** | Quaff a health potion |
| **Enter** | Chat |
| **O** | Settings (HUD size, look sensitivity, invert Y…) |
| **H** | Toggle the controls hint |

### 🎮 Gamepad & 📱 touch
The game also plays with a **controller** or on a **phone/tablet** — every source feeds the
same input, so all systems work the same.

- **Gamepad** (standard layout, just plug in / pair and it's detected): **left stick** moves,
  **right stick** looks, **RT** attacks, **LB** sprints, **RB** cycles target, **A** jumps,
  **B** interacts, **X** potion, **Y** mount. Hold **LT** for the *ability layer* — then
  **A/B/X/Y** and the bumpers fire abilities **1–6**. **D-pad** opens inventory / skills /
  map / quests; **Start** = character, **Back** = achievements, **L3** = emotes.
- **Touch**: on phones/tablets an on-screen layer appears automatically — a **left analog
  joystick** to move, **drag the right side** to look (**pinch** to zoom), a big **attack**
  button with jump / interact / sprint / target / potion / mount, an **ability bar** that
  mirrors your real skills with glyphs and cooldowns, and a **menu strip** (bag, character,
  quests, map, achievements, skills, lore, emotes, plus **ℹ️ hints** and **⚙️ settings**).
  The desktop HUD shrinks automatically on phones, and the mouse hotbar is replaced by the
  on-screen ability bar.

### ⚙️ Settings (`O`, or the gear button)
A settings panel (saved to your browser) lets you tune **HUD size**, **touch-control size**,
**look sensitivity**, **invert look (Y)**, and whether the **controls hint** is shown — handy
for fitting the interface to a small phone screen.

## 🎨 Character customisation & cosmetics

Every hero is **yours to shape**. The creation screen has a live, turntable **3D preview**
and a full customiser:

- **Colours** — body, accent, and hair, from a wide palette.
- **Proportions** — sliders for **height, build, head size, and limb thickness**.
- **Hairstyles** — bald, buzz, short, spiky, mohawk, long, ponytail, afro, braids… and a
  set of **unlockable** ones.

**Unlockable cosmetics** are earned *in-game* through **achievements** and **boss quest
lines**, and unlock **account-wide** — once you earn a look on one character, every future
hero can wear it. Examples:

- 😈 **Demon Horns** — complete the *Ogreslayer* achievement (Berserker).
- 😇 **Seraph Halo** — complete the *Pilgrim* achievement.
- 🍃 **Wildcrown** — defeat **Gorath the Wildking** (Thornhollow quest line).
- ❄️ **Frostcrown** / 🔥 **Emberlocks** — defeat **Frosthelm** / **Pyraxis**.
- 👑 **Hero’s Crown** — complete the final quest and slay the Sky-Tyrant.
- 🪙 **Gilded Hide**, 🩸 **Bloodforged**, 🐉 **Dragonscale** body colours, and more.

Change your look any time at a **🪞 Wardrobe (press `N`)** — it applies live and only offers
what you've unlocked. New unlocks pop a toast as you earn them.

## 🗡️ Classes (D&D-inspired)

**Eleven** classes — ten D&D archetypes plus one **special hero class** — each with unique
vitals, a scaling stat, an auto-attack style, and a **pool of six abilities you learn over
time** (you start with just the first one). Each class also sets your hero's **default
colours** at creation — which you're then free to customise.

| Class | Style | Signature kit |
|-------|-------|---------------|
| **Fighter** ⚔️ | Sturdy melee | Cleave, Shield Bash, War Cry, Sunder (bleed), Whirlwind, Execute |
| **Barbarian** 🪓 | Berserker | Rage, Leap Slam, Whirlwind, Earthquake, Bloodlust (lifesteal), Reckless Roar |
| **Rogue** 🗡️ | Burst assassin | Backstab, Shadow Dash, Fan of Knives, Envenom (poison), Roll, Assassinate |
| **Wizard** 🔮 | Glass cannon | Fireball, Frost Nova, Blink, Chain Lightning, Meteor, Arcane Orb |
| **Cleric** ✨ | Holy support | Smite, Heal, Sanctuary, Holy Nova, Consecrate, Judgement |
| **Ranger** 🏹 | Marksman | Power Shot, Multishot, Roll, Serpent Arrow, Hawk Companion, Arrow Rain |
| **Paladin** 🛡️ | Holy juggernaut | Crusader Strike, Sacred Shield, Hammer of Justice, Lay on Hands, Consecration, Avenging Wrath |
| **Warlock** 😈 | Dark afflictor | Shadow Bolt, Drain Life, Corruption, Howl of Fear, Summon Imp, Doom |
| **Monk** 👊 | Martial artist | Tiger Palm, Flying Kick, Wave Palm, Spinning Crane, Meditate, Thousand Fists |
| **Druid** 🍃 | Naturalist | Moonfire, Thornfield, Rejuvenation, Cyclone, Summon Treant, Hurricane |
| **Super Saiyan** ⚡ | *Hero* — ki warrior | Ki Blast, Kamehameha (blue beam), Instant Step (teleport-strike), **Super Saiyan** (ascend), After-Image, Spirit Bomb |

### ⚡ Super Saiyan — the special hero class
A ki warrior who powers up *in the fight*. Dealing and taking damage fills a **Ki gauge**
(shown above the hotbar). Signature kit:
- **Ki Blast** — a fast golden bolt that bursts on impact.
- **Kamehameha** — channel a massive **blue beam** that scorches everything in a line ahead.
- **Instant Step** — vanish and reappear **behind your target, facing it**; the camera snaps
  around to your new vantage for the follow-up strike.
- **Super Saiyan** — spend a **full Ki gauge** to **ascend** (SSJ1 → SSJ2 → SSJ3). Each tier
  grants **+100% to all attributes for 30 seconds** and **lengthens your glowing golden hair**
  (and wreathes you in a flame aura). Ascend *again* before the form fades to climb to the next
  level — let it lapse and you fall back to base and must build up from SSJ1 again.

### 📈 Progression & skill depth
- **Abilities are learned, not given.** You start with one signature skill; each level-up
  lets you **learn a new ability** (once you meet its level requirement) or **rank up** one
  you own (more damage, shorter cooldown, extra projectiles, wider AoE — up to Rank 3).
- **You choose how you grow.** Every level-up opens a roguelike choice screen: pick an
  **attribute** to raise (STR / DEX / INT / Max HP / resources) *and* a **skill** to learn
  or upgrade.
- **Cast times on the heavy hitters.** Big nukes, heals, and summons (Fireball, Meteor,
  Kamehameha, Heal, Lay on Hands, Summon Imp/Treant, Spirit Bomb…) **charge up** before they
  fire: a **cast bar** fills, your **movement slows to a trudge** while channelling, and the
  spell releases — re-aimed at that moment — when the bar completes. Quick strikes, dashes,
  and instant novas still fire immediately. Higher ranks shave the cast time.
- **Forgiving aim assist, now in full 3D.** Offensive skills snap onto a locked target or the
  foe nearest your crosshair within a generous cone, so projectiles and beams land where you
  clearly mean — no pixel-perfect aiming required. **Look up or down to aim up or down**:
  attacks, bolts, and beams now angle vertically, so you can shoot a **Sky Wraith** out of the
  air or blast the **dragon** overhead. The camera's vertical range is wider to match.
- **Two weapon slots — press `Tab` to swap.** Equip a primary and a secondary weapon and
  switch between them instantly. The **wielded** weapon decides how you auto-attack, so a melee
  hero can carry a **bow, crossbow, or throwing knives/axes** in the off-slot to pluck flying
  foes and ranged mobs out of the sky, then `Tab` back to a blade up close. Each weapon kind is
  held in its own pose (poles upright, blades angled) and **fires from its tip** — and ranged
  weapons thrust forward when you attack or cast.
- **Ranged enemies you have to dodge.** Beyond melee mobs, the world now has **Bandit Archers**
  and **Blight Hexers** that close to firing range and loose projectiles at you, plus
  **Spitfire Gargoyles** that hover and strafe you from the air. Their shots are slow enough to
  **sidestep** — keep moving, break line of sight, or shoot back.
- **Distinct skill kinds**, each with their own feel and visuals: melee arcs, projectiles
  (piercing, multi-shot, exploding), **ground-targeted AoE** (Meteor, Earthquake, Arrow
  Rain), **chain lightning**, **damage-over-time** patches (poison, consecrate, corruption),
  **lifesteal**, buffs & novas (with slow/fear), dashes with i-frames, and **summons**
  (Imp, Hawk, Treant) that fight alongside you.

## 🌍 Game systems

- **Open world & eight biomes** — a procedural heightfield split into smoothly-blended
  biomes, each with its own **terrain character** and palette: the **Greenwood** forest
  (plateaus), snowy **Frostpeaks** (tall peaks), the **Mire** swamp (sunken lowlands), the
  **Dunes** desert (rolling dunes), plus four farther end-game reaches — the **Emberwastes**
  (charred volcanic ridges), the **Verdant Wilds** (lush jungle hills with towering palms),
  the **Shardspire Highlands** (stepped crystal plateaus), and the **Scarlands** (rust-red
  badland mesas). Each fans out from the Nexus on its own heading, so the world is laid out
  organically (a soft-Voronoi of biome regions, not a neat grid). Distinct props and rocks
  blend along noise-distorted borders. Scattered trees, rocks, bushes, flowers, water,
  drifting clouds, **ruins**, and big snow-capped **mountains** dress the land. Climbable
  cliffs, and **solid collision** on structures for both you and monsters.
- **An island-capital continent** — the **Nexus** is a large **walled city on an island**
  ringed by the **Sundered Sea**. Long **land-bridge causeways** (the roads) cross the water
  to the eight surrounding reaches — to leave the heartland you take a bridge (or brave the
  cold sea). Each reach is then **walled off from its neighbours by mountain ranges**, so
  region-to-region travel funnels through a **mountain pass** (a gap flanked by tall
  snow-capped marker peaks). The Nexus itself has two rings of houses, a glowing
  portal-obelisk, four merchants, lamps and villagers, with **The Waking Vale** — a small
  starter glen marked by an Ember-cairn — just across the first bridge, where the Ashbound
  takes their first steps onto the mainland.
- **Streamed for performance** — the world is large, so **distance fog** fades the horizon
  and only objects and enemies **near the player are drawn and updated** (the rest stream
  out). Far props and mobs are also **frozen out of the per-frame transform pass**, so the
  CPU only does work for the small area around you — not the whole continent — keeping the
  frame rate smooth and free of stutter. (The great dragon is the lone exception: it stays
  loaded at any range, circling its distant roost until you're ready to challenge it.)
- **Fishing** — stand at any shoreline (lake, river, or the Sundered Sea) and press **`E`**
  to cast a line. A bobber drops in; wait for the float to dip, then press **`E`** in the
  window to reel in your catch. Fish range from a humble **Minnow** up to a **Leviathan Fry**
  — better/farther water yields rarer fish — and they're **edible** (a small heal) or
  **sellable**. (Quaffing with **`Q`** prefers real potions, so it never eats your catch.)
- **You can fish up *anything*.** The line doesn't just pull fish — it can surface real **gear
  and treasure**, up to legendaries and named uniques. A new **🎣 Fishing** stat (rolls on
  ordinary gear, and granted in bulk by fishing sets) raises the odds of reeling **loot over
  fish**, **higher-tier fish**, and **better-quality gear** — invest in it and the deep pays
  out. Some rewards are **fishing-exclusive** and can be found *no other way*:
  - **Fishing uniques** — *Stormhook, the Tide-Render* (rod), *Pearl of the Abyss*, *Crown of
    Coral*, *Scales of the Leviathan*, and more, each loaded with the Fishing stat.
  - **Tidecaller's Regalia** — a rare fishing-**only** set with a powerful combat package
    (INT/damage/lifesteal) *and* heavy Fishing, dredged up a piece at a time.
  - **Angler's Garb** — the dedicated fishing set (found anywhere or fished up); its 2/4-piece
    bonuses are pure fishing power (plus stamina/speed/health). Check your Fishing total on the
    **`C`** character sheet.
- **Emotes** — press **`T`** for an emote wheel (wave, dance, cheer, flex, laugh, bow, cry,
  sit). Your stickman acts it out and a little bubble pops above your head.
- **Achievements** (**`B`**) — **22** long-horizon milestone trees for everything you do:
  slaying slimes (and wolves, bandits, knights, ogres, and sky wraiths), total kills, walking,
  riding, climbing, swimming, fishing, discovering areas, opening chests, earning gold,
  leveling, praying at shrines, resting, emoting, and completing quests. Each chain has four
  tiers — the first three grant **small permanent stat boosts**, and the **final node is a
  unique passive or ability**, e.g.:
  - **Slime Slayer** (100 → 250 → 500 → 1000 slimes): +Move Speed ×2, +Max HP, then a
    bouncy **🟢 Slime Mount** you can summon with **`R`**.
  - **Windwalker** (walk far enough): +12% speed and sprinting barely costs stamina.
  - **Spider-Climb** (climb): walls cost no stamina. **Amphibious** (swim): never drown &
    swim faster. **Trailblazer** (ride): your mount gallops 25% faster.
  - **Angler's Mastery** (fish): +25 Fishing forever. **Pathfinder** (discover areas):
    +speed and you reveal far more of the map as you travel.
  - **Boss Slayer** → **Giantslayer** (+25% damage to bosses); **Treasure Hunter** →
    **Treasure Sense** (chests yield far better loot); **Tycoon** → **Midas** (+50% gold from
    kills); **Ascendant** (reach Lv 50) → **Veteran**; **Pilgrim** → **Blessed** (shrine
    blessings last 50% longer); **Performer** → **Showman**.
  - **Ogreslayer** → **Berserker** (+25% damage while below 35% HP); **Hero of Aethelgard**
    (complete 22 quests) → **Champion**; plus **Wolfsbane**, **Outlaw Hunter**, **Knightsbane**,
    **Skyhunter**, and **Wayfarer** (rest at Embers).
  Unlocks pop a toast, stack permanently, and persist with your character.
- **🐉 The end boss — Vetharion, the Sky-Tyrant.** The great dragon that circles high above
  is the **final challenge at the end of everything**: complete **every other achievement**
  and it **descends** from its endless orbit to the **Dragon's Roost** in the far north.
  It's a flying boss with swoops, breath-slams, and a colossal health pool — fell it to begin
  the **Dragonslayer** chain, whose capstone (10 dragons slain) grants a **rideable Dragon
  Mount** (summon with **`R`**) and a sky-tyrant's might.
- **Fog-of-war world map** (**`M`**) — the map now renders the **actual continent**: a
  shaded heightfield with blended biome colours, hill-shading, water depth, snow-capped
  peaks, and roads. Land you haven't visited stays **shrouded in fog** — explore to reveal
  it — and **area names, camps, bosses, and bonfires only appear once you've found them**.
- **Hidden treasure & shrines** — **30 treasure chests** are tucked off the roads across
  the wild (loot scales with how far out they sit), and **buff shrines** in each region
  grant a long blessing (30–60 min) — Might (+25% dmg), Swiftness (+20% speed), Titan (+14
  all attributes), or Fury — so wandering off the path pays off.
- **A big, spread-out world** with **winding dirt roads** that bend like natural trails
  linking the Nexus to every town, **named areas** within each biome (Whisperwood Glade,
  The Bonewaste, The Shardspire, Bonechew Canyon…) each with a recommended level and a
  **zone banner** on entry, plus
  **lakes you can swim in** — dive with Shift, surface with Space, and watch your **air
  bar** while submerged (run out and you drown).
- **Mountains & caves** — big craggy **mountains** with snow caps rise as landmarks and
  solid barriers across the world. A couple of them have a dark **cave mouth** at the base:
  press **`E`** to **descend** into an instanced, crystal-lit **cavern** — stalactites and
  stalagmites, glowing crystal clusters, and a **treasure cache** waiting at the bottom.
  Step on the exit portal to climb back to the surface.
- **Heavy, thick forests** — the forest areas (Whisperwood Glade, Tanglethorn Deep) are
  densely packed with **tall, layered trees** that tower over the lighter world-wide
  scatter, so the woods feel genuinely deep.
- **A world that feels alive** — **fireflies** drift and glow over the forests and swamp at
  dusk and through the night, small **critters** wander everywhere (rabbits that hop, little
  birds, **snakes** that slither), **flocks of birds** wheel across the sky, and a great
  **dragon** circles high overhead. Purely ambient — they just make the world breathe.
- **Flying enemies** — **Sky Wraiths** patrol the air above the wilds, cruising high until
  you stray close, then **diving down to attack** before climbing back out of reach.
- **The sword in the stone** — a glowing blade is hidden in a lonely outcrop in the far
  reaches. Draw it (E) only if you're **worthy** (Level 14+ and 60+ total STR/DEX/INT) to
  claim **Aetherbrand, the Kingmaker**, a fixed legendary sword.
- **Weapon models** — your equipped weapon now renders as the real thing — sword, axe,
  mace, dagger, bow, staff, or wand — tinted and scaled by its rarity.
- **Towns are safe havens** — no monsters spawn near or wander into a town. Each has its
  own **campfire**. The central hub **The Nexus** (big plaza, glowing portal-obelisk,
  watchtower, well, and **four merchants** — Weaponsmith, Armorer, Alchemist, Trader) is
  joined by four biome outposts — **Thornhollow** (forest), **Frostgard** (snow),
  **Dustmarket** (desert), **Gloomfen** (swamp) — each biome-styled with **two specialised
  merchants**, a quest-giver, and ambient villagers you can talk to for lore.
- **World map (`M`)** showing towns, named areas & levels, elite camps, world bosses, and
  bonfires. Rested bonfires become **fast-travel** points — open the map at a bonfire/town
  and click one to teleport.
- **A world with a story** — **Aethelgard** is a world shattered by *the Sundering*, its
  binding flame (the **Emberheart**) broken into **eight shards** and its **eight reaches**
  overrun by the **Blight**. Bonfires are *Embers* of that flame — which is the in-world
  reason you respawn — and **you are one of the Ashbound**, a hero called back from the ash to
  reclaim the eight shards held by the eight **Archfiends** (the Inner Four, then the Outer
  Four beyond the old maps). And when the flame is whole again, the **Sky-Tyrant Vetharion**
  descends for the final battle. Read the whole lore-board in the **Codex (`L`)**: prologue,
  the world, the Sundering, the Ashbound (with a **personalized entry written from your own
  character**), the eight reaches, the Archfiends, the Sky-Tyrant, a bestiary, and the deep places.
- **Story-driven quests (24 of them)** — quest-giver NPCs in **every town** (look for the ❗
  marker) offer **multi-step quest chains** and **boss-slaying quests**, each framed by the
  overarching story: clear each reach in turn, fell its Archfiend to return a shard, and march
  from the meadows all the way to the **Dragon's Roost** finale against Vetharion. There are
  side quests too — a **fishing** request and a **level-up "Proving"** — plus **Keeper Aelith**
  at the Nexus, who only appears for the final trial. The **quest-giver popup** is a roomy
  dialog where the giver's words **type out letter by letter** (click to fill instantly), then
  reveal the objective and reward. Track quests on the HUD and in the **quest log (`J`)**; turn
  them in for **XP, gold, gear, and potions** (boss quests reward epics/legendaries). Saved
  with your character.
- **Gear sets** — some gear belongs to a **set** (Warden's Vigil, Nightstalker, Archmage
  Regalia, Bloodrage Plate). Wearing 2 or 4 pieces grants escalating bonuses, shown on the
  item tooltip and the **character sheet (`C`)**, which breaks down all your stats.
- **Elite war-camps** — scattered through the biomes are camps of **elite** monsters
  (bigger, golden-named, much tougher) guarding a **treasure chest**. Clear the whole camp
  to unlock the chest, then open it for a burst of **high-rarity loot** (often uniques).
- **World bosses** — a powerful named **boss** lurks deep in each of the eight biomes
  (Gorath the Wildking, Frosthelm the Fallen, Sandmaw the Devourer, The Mirelord, and the
  four end-game Archfiends — Pyraxis the Emberwyrm, Mossfang the Ancient, Vael the Prism
  Tyrant, and Skarn the Bonelord up at Level 44) — enormous, ~8× HP, with a **telegraphed
  shockwave slam**, **multiple phases** (they enrage at 66%/33% HP — faster, harder, and
  they **summon minions**), and a dedicated **boss health bar**. The first four drop their
  own **signature named unique** plus high-rarity gear and a pile of gold.
- **Consumables** — **health potions** and **elixirs** (temporary buffs to move speed,
  damage, or all attributes). Buy them from the merchant, use them from your bag, or hit
  **`Q`** to quaff a health potion in a pinch. Active buffs show on the HUD with a timer.
- **Movement state machine** — grounded / airborne / climbing, with gravity, jumping,
  sprinting, and wall-climbing, all gated by a **stamina** meter.
- **Combat** — auto-attacks, cone/AoE/projectile abilities, crits, floating combat
  text, target framing & nameplates, and class-scaled damage. Offensive skills aim at your
  target/crosshair; **movement skills (dashes, blinks, rolls) go where you're moving**.
  Melee abilities draw a **visible ground cone** matching their exact hitbox — wide skills
  (Cleave, Whirlwind) read as a fan, while focused burst skills (**Backstab**, **Assassinate**,
  **Execute**, **Thousand Fists**) are **thin, high-damage cones** that spear straight ahead,
  so you can always see where a hit lands.
- **Enemies & AI** — stickman monsters (slimes, bandits, wolves, knights, ogres) with
  an idle→chase→attack FSM, telegraphed attacks, level-scaled stats, and respawns.
- **Progression** — XP, leveling with stat growth, six escalating-difficulty zones.
- **Bonfires (Dark Souls)** — rest to heal, refill, set your respawn point, and
  respawn the world's monsters. They're deliberately **few and far between** — one in town
  and one deep in each biome — so dying is a real setback. Death shows **YOU DIED** and
  returns you to the last bonfire.
- **Saved characters** — pick a class & name to create a hero; the start screen shows a
  **roster** of your saved characters to continue or delete. **Resting at a bonfire saves
  your progress** (level, XP, attributes, learned/ranked skills, and respawn point),
  overwriting that character's save — true Dark Souls bonfire save points. Saves live in
  the browser's `localStorage`, so they persist across sessions on the same browser
  (including the standalone file).
- **Loot & gear** — enemies drop procedurally generated **weapons, armor, and
  accessories** across 5 rarities (Common → Legendary), shown as colored beacons you
  walk over to pick up. Open the **inventory** (`I`) to equip items into 7 gear slots
  (weapon, head, chest, hands, feet, ring, amulet). Gear adds **STR/DEX/INT, Max HP/MP/SP,
  attack damage, armor (damage mitigation), crit, lifesteal, and move speed** — all flowing
  into combat. Hover any bag item for a rarity-colored tooltip that **compares it to what
  you have equipped** (per-stat deltas). Click to equip, right-click to drop. New characters
  start with a class-appropriate weapon, and your equipped weapon recolors your stickman by
  rarity.
- **Named uniques** — legendaries can roll as **named unique items** (e.g. *Hungering Edge*,
  *Heart of the Phoenix*) with flavor text and signature effects like **lifesteal**.
- **Gold & a town merchant** — enemies drop **gold**; visit the **merchant stall** in town
  (press `E`) to **buy** a rotating stock of level-appropriate gear and **sell** your spare
  loot. Gold is saved with your character.
- **Mounts** — press **`R`** to summon your **Sticksteed** and gallop (~2.6× speed) across
  the big world. You dismount automatically to fight, to swim, or when hit.
- **Day/night cycle** — a ~5-minute day with a moving sun, shifting sky/fog colours, a
  dusk glow, and a star field at night (bonfires and lamps light the dark). The **minimap
  tints** with the time of day and a **clock readout** (☀️/🌅/🌙 + HH:MM) sits under it.
- **Dungeons** — glowing purple **entrance portals** near the towns lead to instanced,
  walled **dungeon rooms** (The Undervault, Frostcrypt, Sunken Tomb) packed with monsters
  and a **Warden boss**. Clear it to unlock a loot chest; step on the exit portal to leave.
  Looting the chest **seals the dungeon for 5 minutes** (a per-run lockout); when it resets,
  the pack revives and **re-scales toward your level** so repeat runs stay challenging.
- **Multiplayer & parties** — see other players move and chat in real time when a server is
  set. Form a **party** with `/invite <name>` in chat (and `/leave`); party members show on
  a party panel with live health. Grouped players **share kill XP** (each kill grants
  partymates ~50% of its XP) and **notable loot** (rare+ finds) is announced to the party.

## 🛰️ Multiplayer (optional)

The client is fully playable solo. To play with others, run the relay server and
enter its URL on the start screen (e.g. `ws://localhost:8080`).

```bash
cd server
npm install          # installs the single dependency: ws
npm start            # → ws://localhost:8080
```

The server is a thin presence/relay: each client simulates its own world (terrain
is deterministic, enemies are local), and the server only broadcasts player
positions and chat. This keeps it tiny while letting you wander the same world
together. Point clients at a public host/port to play over the internet.

## 📁 Project layout

```
index.html             # entry; import map → vendored three
static-server.js       # zero-dep static server for local play
vendor/three.module.js # vendored Three.js (no CDN needed)
src/
  main.js              # game loop, wiring, death/respawn, interactions
  classes.js           # D&D class data, stats, leveling math
  world.js             # terrain, town, props, cliffs, bonfires, collision
  player.js            # local controller: movement FSM, vitals, XP
  camera.js            # orbit-follow camera with terrain collision
  input.js             # keyboard + pointer-lock mouse look
  stickman.js          # articulated stickman mesh + animator + hair/appearance
  appearance.js        # customisation model + unlockable cosmetics catalogue
  preview.js           # live 3D character preview (creation + wardrobe)
  enemies.js           # monster types, AI FSM, spawning
  combat.js            # attacks, abilities, projectiles, targeting, FX
  ui.js                # HUD, class select, hotbar, minimap, floaters, chat
  network.js           # WebSocket client (graceful offline → solo)
  audio.js             # tiny WebAudio SFX synth (no asset files)
server/
  server.js            # optional multiplayer relay (ws)
  package.json
```

## 🧩 Design notes

- **Systems over graphics, on purpose.** Everything is built from primitive
  geometry (cylinders, spheres, cones) so the focus stays on mechanics. The
  stickman rig is animated procedurally for walking, attacking, climbing, and a
  death flop.
- **No build, no CDN.** Vendoring Three.js and using import maps means you can
  clone and play with nothing but Node (for the static server) — fully offline.

## License

MIT
