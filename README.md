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
| **Left Mouse** | Auto-attack (melee swing or ranged bolt by class) |
| **1 – 6** | Learned class abilities |
| **Tab** | Cycle target |
| **E** | Interact / rest at a bonfire |
| **I** | Inventory & equipment |
| **K** | Skills (details & damage) |
| **C** | Character sheet |
| **M** | World map (click a discovered bonfire to fast-travel) |
| **J** | Quest log |
| **Q** | Quaff a health potion |
| **Enter** | Chat |
| **H** | Toggle the controls hint |

## 🗡️ Classes (D&D-inspired)

**Ten** classes, each with unique vitals, a scaling stat, an auto-attack style, and a
**pool of six abilities you learn over time** (you start with just the first one).

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

### 📈 Progression & skill depth
- **Abilities are learned, not given.** You start with one signature skill; each level-up
  lets you **learn a new ability** (once you meet its level requirement) or **rank up** one
  you own (more damage, shorter cooldown, extra projectiles, wider AoE — up to Rank 3).
- **You choose how you grow.** Every level-up opens a roguelike choice screen: pick an
  **attribute** to raise (STR / DEX / INT / Max HP / resources) *and* a **skill** to learn
  or upgrade.
- **Distinct skill kinds**, each with their own feel and visuals: melee arcs, projectiles
  (piercing, multi-shot, exploding), **ground-targeted AoE** (Meteor, Earthquake, Arrow
  Rain), **chain lightning**, **damage-over-time** patches (poison, consecrate, corruption),
  **lifesteal**, buffs & novas (with slow/fear), dashes with i-frames, and **summons**
  (Imp, Hawk, Treant) that fight alongside you.

## 🌍 Game systems

- **Open world & biomes** — a procedural heightfield split into smoothly-blended biomes,
  each with its own **terrain character**: the **Greenwood** forest (plateaus), the snowy
  **Frostpeaks** (tall peaks), the **Mire** swamp (sunken lowlands), and the **Dunes**
  desert (rolling dunes), around the central meadow. Distinct palettes, props, and rocks
  blend along noise-distorted borders. Scattered trees, rocks, bushes, flowers, water,
  drifting clouds, and **ruins** dress the land. Climbable cliffs, and **solid collision**
  on structures for both you and monsters.
- **A big, spread-out world** with **dirt roads** linking the Nexus to every town,
  **named areas** within each biome (Whisperwood Glade, Frostfang Pass, The Bonewaste,
  Rotheart Hollow…) each with a recommended level and a **zone banner** on entry, plus
  **lakes you can swim in** — dive with Shift, surface with Space, and watch your **air
  bar** while submerged (run out and you drown).
- **Towns are safe havens** — no monsters spawn near or wander into a town. Each has its
  own **campfire**. The central hub **The Nexus** (big plaza, glowing portal-obelisk,
  watchtower, well, and **four merchants** — Weaponsmith, Armorer, Alchemist, Trader) is
  joined by four biome outposts — **Thornhollow** (forest), **Frostgard** (snow),
  **Dustmarket** (desert), **Gloomfen** (swamp) — each biome-styled with **two specialised
  merchants**, a quest-giver, and ambient villagers you can talk to for lore.
- **World map (`M`)** showing towns, named areas & levels, elite camps, world bosses, and
  bonfires. Rested bonfires become **fast-travel** points — open the map at a bonfire/town
  and click one to teleport.
- **Quests & chains** — quest-giver NPCs across all towns (look for the ❗ marker) offer
  **multi-step quest chains** and **boss-slaying quests** — slay N of a type, clear a camp
  chest, defeat a named boss, etc. Track them on the HUD and in the **quest log (`J`)**;
  turn them in for **XP, gold, gear, and potions** (boss quests reward epics/legendaries).
  Progress is saved with your character.
- **Gear sets** — some gear belongs to a **set** (Warden's Vigil, Nightstalker, Archmage
  Regalia, Bloodrage Plate). Wearing 2 or 4 pieces grants escalating bonuses, shown on the
  item tooltip and the **character sheet (`C`)**, which breaks down all your stats.
- **Elite war-camps** — scattered through the biomes are camps of **elite** monsters
  (bigger, golden-named, much tougher) guarding a **treasure chest**. Clear the whole camp
  to unlock the chest, then open it for a burst of **high-rarity loot** (often uniques).
- **World bosses** — a powerful named **boss** lurks deep in each biome (Gorath the
  Wildking, Frosthelm the Fallen, Sandmaw the Devourer, The Mirelord) — enormous, ~8× HP,
  with a **telegraphed shockwave slam**, **multiple phases** (they enrage at 66%/33% HP —
  faster, harder, and they **summon minions**), and a dedicated **boss health bar**. They
  drop their own **signature named unique** (Gorath's Wildaxe, The Frosthelm, Maw of the
  Dunes, Shroud of the Mire) plus high-rarity gear and a pile of gold.
- **Consumables** — **health potions** and **elixirs** (temporary buffs to move speed,
  damage, or all attributes). Buy them from the merchant, use them from your bag, or hit
  **`Q`** to quaff a health potion in a pinch. Active buffs show on the HUD with a timer.
- **Movement state machine** — grounded / airborne / climbing, with gravity, jumping,
  sprinting, and wall-climbing, all gated by a **stamina** meter.
- **Combat** — auto-attacks, cone/AoE/projectile abilities, crits, floating combat
  text, target framing & nameplates, and class-scaled damage. Offensive skills aim at your
  target/crosshair; **movement skills (dashes, blinks, rolls) go where you're moving**.
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
  stickman.js          # articulated stickman mesh + animator
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
