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

The game uses ES modules + import maps, which require an `http(s)` origin (they
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
| **Space** | Jump — or kick off a wall while climbing |
| **W into a cliff** | Climb it BotW-style (drains stamina; reach the top to mantle) |
| **Left Mouse** | Auto-attack (melee swing or ranged bolt by class) |
| **1 – 6** | Learned class abilities |
| **Tab** | Cycle target |
| **E** | Interact / rest at a bonfire |
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

- **Open world** — a procedural rolling heightfield with a starter town, scattered
  trees, rocks, bushes & flowers, water, drifting clouds, climbable cliffs, and bonfire
  checkpoints. The terrain is generated from a deterministic seed, so it's identical
  every load and across clients. (Cliffs are axis-aligned so their climb collision matches
  exactly what you see — no invisible walls.)
- **Movement state machine** — grounded / airborne / climbing, with gravity, jumping,
  sprinting, and wall-climbing, all gated by a **stamina** meter.
- **Combat** — auto-attacks, cone/AoE/projectile abilities, crits, floating combat
  text, target framing & nameplates, and class-scaled damage.
- **Enemies & AI** — stickman monsters (slimes, bandits, wolves, knights, ogres) with
  an idle→chase→attack FSM, telegraphed attacks, level-scaled stats, and respawns.
- **Progression** — XP, leveling with stat growth, six escalating-difficulty zones.
- **Bonfires (Dark Souls)** — rest to heal, refill, set your respawn point, and
  respawn the world's monsters. Death shows **YOU DIED** and returns you to the bonfire.
- **Multiplayer** — see other players move and chat in real time when a server is set.

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
