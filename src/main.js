// ============================================================
// Stickman MMO — entry point & game loop. Wires together world,
// player, camera, enemies, combat, UI, audio, and networking.
// ============================================================
import * as THREE from 'three';
import { World, areaAt, WATER_LEVEL, WORLD_SIZE, LEVIATHAN_RADIUS } from './world.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Player } from './player.js';
import { spawnEnemies, spawnCamps, spawnBosses, spawnBossSites, spawnExtras, spawnFishPeople, spawnMinions, spawnDungeons, spawnFlyers, spawnLootGoblins, spawnKeyThieves, spawnDragon, DRAGON_ROOST, updateEnemyShots, clearEnemyShots } from './enemies.js';
import { Combat } from './combat.js';
import { NetEnemies } from './netenemies.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Network } from './network.js';
import { Saves } from './save.js';
import { starterKit, makeStoneSword, rollFishingCatch, RARITY } from './items.js';
import { SKILL_BY_ID as SKILLS_BY_ID } from './skills.js';
import { addOutlines, WIND } from './gfx.js';
import * as Quests from './quests.js';
import * as Achievements from './achievements.js';
import { evaluateUnlocks } from './appearance.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Filmic tone mapping + sRGB output: richer, less "flat" colour out of the same
// scene. The exposure is nudged slightly bright to keep the cel look punchy.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);

const ui = new UI();
const audio = new Audio();
ui.audio = audio; // lets the UI play a sting on achievement unlocks
const input = new Input(canvas);
const touch = new TouchControls(input);
const followCam = new FollowCamera(camera);
// Apply player settings that touch the camera (look sensitivity / invert), and
// re-apply now that followCam exists (the UI applied CSS-only bits on construct).
ui.onSettings = (s) => { followCam.sensitivity = followCam.baseSensitivity * s.lookSens; followCam.invertY = !!s.invertY; };
ui.applySettings();
const world = new World(scene);
const network = new Network(scene, ui);

let player = null;
let enemies = [];
let netEnemies = null;   // server-driven enemy manager (set when on an authoritative server)
let netMode = false;     // true while enemies are server-authoritative
let combat = null;
let started = false;
let deathHandled = false;
let dragonAwoken = false;   // has the end-boss dragon descended?
let leviathanT = 0;         // time spent in the Leviathan Zone (drains the warning bar)
let leviathanTriggered = false; // has the beast risen (kills the player)?
let cosmeticTimer = 0;      // throttle for the cosmetic-unlock scan
let lastGold = 0;           // for crediting gold earned to the Tycoon achievement
let lastHp = 0;
let restCooldown = 0;
let currentArea = null;
const DUNGEON_LOCKOUT = 300; // seconds a dungeon stays sealed after its chest is looted
const clock = new THREE.Clock();

// Project a world position to 2D screen coords for floating text.
ui.project = (v) => {
  const p = v.clone();
  p.y += 1.8;
  p.project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    visible: p.z < 1,
  };
};

// Remote chat → combat log + floating bubble handled in network.
network.onChat = (msg) => {
  ui.log(`${msg.name}: ${msg.text}`, 'chat');
};

ui.setupChat((text) => {
  // Party chat commands.
  if (text.startsWith('/invite ')) {
    const name = text.slice(8).trim();
    if (!network.connected) { ui.log('Party needs a server connection.', 'sys'); return; }
    network.inviteByName(name); ui.log(`Party invite sent to ${name}.`, 'sys'); return;
  }
  if (text === '/leave') { network.leaveParty(); ui.log('You left the party.', 'sys'); return; }
  if (text === '/party') { ui.log('Party: /invite <name> to invite, /leave to leave.', 'sys'); return; }
  ui.log(`${player.name}: ${text}`, 'chat');
  network.sendChat(text);
});

// Party hooks (active only when connected to a server).
network.onParty = () => { if (player) ui.updatePartyFrames(player, network); };
network.onPartyInvite = (fromName) => ui.showPartyInvite(fromName, () => network.acceptInvite(), () => network.declineInvite());
// Receive a share of a partymate's kill XP (may trigger a level-up).
network.onPartyXp = (amount, fromName) => {
  if (!player || !player.alive || amount <= 0) return;
  const levels = player.gainXp(amount);
  ui.floater(`+${amount} XP (party)`, 'xp', player.pos);
  ui.log(`Shared ${amount} XP from ${fromName}'s kill.`, 'xp');
  if (levels > 0 && combat) combat.onLevelUp && combat.onLevelUp();
};
// A partymate found something notable.
network.onPartyLoot = (item, fromName) => {
  if (!item) return;
  ui.log(`${fromName} looted ${item.glyph || ''} ${item.name} (${item.rarity}).`, 'xp');
};

// ---- Start the game (shared by "new character" and "continue") ----
function beginGame(classId, name, server, save, appearance) {
  if (started) return;
  started = true;
  audio.init();

  player = new Player(scene, world, classId, name, appearance);
  player.world = world;
  addOutlines(player.mesh); // crisp comic silhouette on the hero
  // Proficiency skill level-ups: a small toast + floater.
  player.onSkillUp = (id, level) => {
    const def = SKILLS_BY_ID[id];
    if (def) { ui.log(`${def.glyph} ${def.name} skill is now level ${level}!`, 'xp'); ui.floater(`${def.glyph} ${def.name} Lv ${level}`, 'xp', player.pos); audio.play('level'); }
  };

  if (save) {
    // Continue an existing character.
    player.applySave(save);
  } else {
    // Brand new character → outfit them in a class-themed starter set (weapon +
    // armor pieces that actually show on the model), then persist to the roster.
    Object.assign(player.gear, starterKit(classId));
    player.recomputeGear();
    const rec = Saves.create(player.toSave());
    player.saveId = rec.id;
  }

  // If this character already drew the blade in the stone, leave the stone empty.
  if (player.stoneSwordPulled) world.setSwordStonePulled();

  lastHp = player.stats.hp;
  lastGold = player.gold;
  dragonAwoken = false;
  clearEnemyShots(scene); // no stray projectiles from a previous character
  enemies = spawnEnemies(scene, world);
  enemies.push(...spawnCamps(scene, world)); // elite camp packs
  enemies.push(...spawnBosses(scene, world)); // world bosses
  enemies.push(...spawnBossSites(scene, world)); // castle lords + the Archmagus
  enemies.push(...spawnExtras(scene, world));    // castle garrisons + mage-tower guards
  enemies.push(...spawnFishPeople(scene, world)); // Fish People war-parties along the coast
  enemies.push(...spawnDungeons(scene, world)); // dungeon packs + wardens
  enemies.push(...spawnFlyers(scene, world));    // Sky Wraiths patrolling the air
  enemies.push(...spawnLootGoblins(scene, world)); // 50 fleeing treasure thieves to hunt
  enemies.push(...spawnKeyThieves(scene, world, () => { // thieves that hold puzzle-chest keys
    ui.log('The Key Thief falls — the chest\'s seal unwinds!', 'xp');
    if (player) ui.floater('Key claimed!', 'xp', player.pos);
    audio.play('level');
  }));
  combat = new Combat({ scene, player, enemies, ui, camera: followCam, audio });
  combat.onLevelUp = () => { audio.play('level'); ui.levelUp(player.stats.level); };
  // Keep panels live as loot is picked up; refresh quest markers on kills.
  combat.onLoot = (item) => {
    if (ui.inventoryOpen) ui.renderInventory();
    // Announce notable finds to partymates.
    if (item && ['rare', 'epic', 'legendary'].includes(item.rarity)) network.sendPartyLoot({ name: item.name, glyph: item.glyph, rarity: item.rarity });
  };
  combat.onKillEvent = () => ui.refreshGiverMarkers(player);
  // Party-shared XP: relay half of every kill's XP to grouped members.
  combat.onPartyXp = (xp) => network.sendPartyXp(Math.round(xp * 0.5));
  // Broadcast attacks/casts so other players see us fight.
  combat.onAction = (info) => network.sendAction(info);

  // ---- Synced encounters: switch to server-authoritative enemies ----
  // Fires when we connect to a server that owns the enemies. We retire the
  // local enemy simulation and render the shared, server-driven enemies instead.
  netEnemies = null; netMode = false;
  network.onAuthoritative = () => {
    if (netMode) return;
    netMode = true;
    // The server owns the shared OPEN-WORLD enemies, so retire those. But KEEP
    // the instanced/structure encounters (castle garrisons, camps, the mage
    // tower, dungeons, Fish People) as local content — otherwise joining a server
    // would empty every castle and camp. They keep running client-side.
    const keep = [];
    for (const e of enemies) {
      if (e.persistent) { keep.push(e); continue; }
      scene.remove(e.mesh); if (e._shockRing) scene.remove(e._shockRing);
    }
    enemies.length = 0; enemies.push(...keep);
    combat.target = null;
    clearEnemyShots(scene);
    netEnemies = new NetEnemies({ scene, world, enemies, player, network, combat });
    ui.log('Joined a shared world — you and other heroes now fight the same monsters.', 'sys');
  };
  network.onEnemies = (list) => { if (netEnemies) netEnemies.onSnapshot(list); };
  network.onEnemyHp = (id, hp) => { if (netEnemies) netEnemies.onHp(id, hp); };
  network.onEnemyDeath = (m) => { if (netEnemies) netEnemies.onDeath(m); };
  network.onEnemyAttack = (dmg, eid) => { if (netEnemies) netEnemies.onAttack(dmg, eid); };
  network.onEnemyShot = (shot) => { if (netEnemies) netEnemies.onShot(shot); };

  ui.setWorld(world);
  ui.refreshGiverMarkers(player);
  // Fast-travel: teleport to a discovered bonfire and arrive rested.
  ui.onFastTravel = (bonfire) => {
    player.pos.copy(bonfire.pos);
    player.vel.set(0, 0, 0); player.state = 'ground';
    player.restAtBonfire(bonfire.pos);
    if (!player.discovered.includes(bonfire.name)) player.discovered.push(bonfire.name);
    lastHp = player.stats.hp;
    ui.log(`Fast-travelled to ${bonfire.name}.`, 'xp');
  };
  currentArea = null;

  ui.enterWorld(player);
  ui.log(save
    ? `Welcome back, ${name} the ${classId} (Lv ${player.stats.level}).`
    : `Welcome, ${name} the ${classId}. Slay monsters and grow strong!`, 'sys');
  ui.log('Rest at a bonfire (orange flame, press E) to heal and SAVE your progress.', 'sys');

  // Quit to character selection: save, drop the connection, and reload back to
  // the roster/start screen (a clean teardown of world/enemies/network).
  ui.onQuickHeal = () => quickHeal(); // clicking the Q potion slot also heals
  ui.onQuitToMenu = () => {
    try { if (player && player.saveId) Saves.write(player.toSave()); } catch { /* storage blocked */ }
    try { network.disconnect(); } catch { /* ignore */ }
    location.reload();
  };

  network.connect(server, { name, classId, appearance: player.appearance, equip: player.equipVisual() });
  // Re-broadcast our look whenever gear or appearance changes, so other players
  // see our armor, weapon, and cosmetics update live.
  player.onLookChange = () => network.sendLook(player.appearance, player.equipVisual());
  input.enabled = true;
  if (input.touchDevice) { touch.enable(); ui.log('Touch controls enabled — left stick to move, drag right to look.', 'sys'); }

  // Debug/tinkering handle — e.g. StickmanGame.player.gainXp(500).
  window.StickmanGame = { player, world, enemies, combat, ui, followCam, renderer, input, touch, network, get netMode() { return netMode; }, get netEnemies() { return netEnemies; } };
}

ui.setupStart({
  onCreate: ({ name, classId, server, appearance }) => beginGame(classId, name, server, null, appearance),
  onContinue: (save, server) => beginGame(save.classId, save.name, server, save, save.appearance),
});

// Is an elite war-camp cleared (chest unlockable)? Solo counts the camp's own
// elite members. In multiplayer those members are retired when the server takes
// over the world's enemies, so instead we clear the camp once it's been engaged
// (server-driven mobs were nearby) and none remain alive within its bounds.
function campIsCleared(camp) {
  if (camp._clearedLatch) return true;
  if (!netMode) return world.campCleared(camp);
  const near = enemies.some((e) => e.alive && e.pos.distanceTo(camp.pos) < 15);
  if (near) camp._engaged = true;
  if (camp._engaged && !near) { camp._clearedLatch = true; return true; }
  return false;
}

// A castle vault unlocks once the castle is cleared: it must have been engaged
// (enemies were within its bounds) and none remain alive there now. Works in
// solo (the garrison is always present) and multiplayer (server mobs nearby).
// Also stamps `_cleared` so world.update can shimmer the chest when ready.
function castleIsCleared(chest) {
  if (chest._clearedLatch) { chest._cleared = true; return true; }
  const near = enemies.some((e) => e.alive && e.pos.distanceTo(chest.pos) < chest.radius);
  if (near) chest._engaged = true;
  chest._cleared = !!chest._engaged && !near;
  if (chest._cleared) chest._clearedLatch = true; // don't re-lock when the garrison respawns
  return chest._cleared;
}

// Quaff the first health potion in the bag (hotkey Q).
function quickHeal() {
  if (!player || !player.alive) return;
  // Prefer an actual potion over a fish so Q doesn't eat your catch.
  const pot = player.inventory.find((it) => it.type === 'consumable' && it.kind === 'heal' && it.baseId !== 'fish')
    || player.inventory.find((it) => it.type === 'consumable' && it.kind === 'heal');
  if (!pot) { ui.log('No health potion in your bag.', 'sys'); return; }
  const r = player.useConsumable(pot.uid);
  if (r.heal != null) { ui.log(`Used ${pot.name} (+${r.heal} HP).`, 'heal'); ui.floater(`+${r.heal}`, 'heal', player.pos); }
  if (ui.inventoryOpen) ui.renderInventory();
}

// ---- Fishing: cast at a water spot, wait for a bite, reel it in with E ----
let fishing = null;
function startFishing(spot, t) {
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  bob.position.set(spot.x, WATER_LEVEL + 0.15, spot.z);
  scene.add(bob);
  player.facing = Math.atan2(spot.x - player.pos.x, spot.z - player.pos.z); // face the water
  fishing = { stage: 'wait', biteAt: t + 2.5 + Math.random() * 5, biteUntil: 0, bobber: bob, anchor: player.pos.clone() };
  ui.log('You cast your line into the water…', 'sys');
  audio.play('cast');
}
function endFishing(msg, type) {
  if (fishing && fishing.bobber) scene.remove(fishing.bobber);
  fishing = null;
  if (msg) ui.log(msg, type || 'sys');
}
function updateFishing(t) {
  if (!player.alive || player.pos.distanceTo(fishing.anchor) > 1.6) { endFishing('You stop fishing.'); return; }
  const bob = fishing.bobber;
  if (fishing.stage === 'wait') {
    bob.position.y = WATER_LEVEL + 0.15 + Math.sin(t * 2) * 0.04;
    ui.showPrompt('🎣 Waiting for a bite…  <span style="opacity:.7">(move to stop)</span>');
    if (t >= fishing.biteAt) { fishing.stage = 'bite'; fishing.biteUntil = t + 1.5; ui.log('Something bites!', 'xp'); audio.play('cast'); }
    else if (input.just('KeyE')) endFishing('You reeled in too early — nothing.');
  } else if (fishing.stage === 'bite') {
    bob.position.y = WATER_LEVEL - 0.15 + Math.sin(t * 24) * 0.12; // dipping
    ui.showPrompt('❗ <b>A bite!</b> Press <b>E</b> to reel it in!');
    if (input.just('KeyE')) {
      const area = areaAt(player.pos.x, player.pos.z);
      const lvl = (area && area.level) || Math.round(Math.hypot(player.pos.x, player.pos.z) / 9);
      // Your Fishing stat raises the chance of reeling up loot (and its quality)
      // over a plain fish. You can hook almost anything down there.
      const loot = rollFishingCatch(lvl, player.fishingStat);
      if (player.addItem(loot)) {
        player.counters.fish = (player.counters.fish || 0) + 1; // Master Angler progress
        player.gainSkillXp('fishing', 28 + lvl * 1.5); // train the Fishing skill
        Quests.onFish(player); // advance fishing quests
        const rar = RARITY[loot.rarity];
        if (loot.type === 'consumable') {
          ui.log(`You reel in a <b>${loot.name}</b>! (${loot.rarity}, worth ${loot.value}g)`, 'xp');
          ui.floater(`${loot.glyph} ${loot.name}`, 'xp', player.pos);
          audio.play(loot.rarity === 'common' ? 'cast' : 'level');
        } else {
          const tag = loot.fishingOnly ? ' — a fishing-only treasure!' : '';
          const cls = loot.rarity === 'common' ? 'sys' : 'xp';
          ui.log(`You reel up <b style="color:${rar.color}">${loot.glyph} ${loot.name}</b> (${rar.name} ${loot.slot})${tag}`, cls);
          ui.floater(`${loot.glyph} ${rar.name}`, cls, player.pos);
          audio.play('level');
        }
        if (ui.inventoryOpen) ui.renderInventory();
      } else ui.log('Your catch slipped away — your bag is full.', 'sys');
      endFishing();
    } else if (t >= fishing.biteUntil) endFishing('It got away…');
  }
}

// ---- Main loop ----
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  input.pollGamepad(dt); // fold any controller state into the unified input

  world.update(t, dt);
  WIND.t.value = t; // advance the shared wind clock (foliage sway)
  if (started && player) world.followSun(player.pos, camera.position); // shadows/sky track the player

  if (started && player) {
    // Stream the world: only show objects near the player (the rest is fogged).
    world.cull(player.pos.x, player.pos.z);
    // Dungeon resets: once a sealed dungeon's timer elapses, revive its pack,
    // re-scale it toward the player's level (so repeat runs stay relevant), and
    // re-lock the chest. Each member keeps its level offset from the dungeon.
    for (const d of world.dungeons) {
      if (d.lockoutUntil && t >= d.lockoutUntil) {
        d.lockoutUntil = 0;
        const target = Math.max(d.level, Math.min(player.stats.level + 1, d.level + 8));
        for (const m of d.members) {
          const off = m.level - d.level;
          m.setLevel(target + off);
          if (m.alive) m.hp = m.maxHp; else m.respawnTimer = 0.01;
        }
        d.level = target;
        d.opened = false; d.cleared = false;
        d.lid.rotation.x = 0; d.glow.intensity = 0;
        ui.log(`${d.name} stirs back to life — now Lv ${d.level}.`, 'sys');
      }
    }

    // Queue up level-up choice modals (one per pending level). The modal
    // pauses the world until the player confirms their attribute + skill.
    if (player.pendingLevelUps > 0 && !ui.levelModalOpen) {
      ui.showLevelUp(player, () => { lastHp = player.stats.hp; });
    }
    const paused = ui.levelModalOpen;

    // Always consume mouse-look so deltas don't pile up while paused.
    const look = input.consumeLook();
    const w = input.consumeWheel();

    if (paused) {
      // Frozen: only keep the camera trailing and the HUD live.
      ui.el.crosshair.classList.add('hidden');
      ui.updateBossBar(null);
      followCam.update(player.pos, dt);
      ui.updateHud(player, network.count);
      ui.drawMinimap(player, enemies, world, network.others);
      renderer.render(scene, camera);
      input.endFrame();
      return;
    }

    const menuOpen = ui.inventoryOpen || ui.vendorOpen || ui.skillsOpen || ui.questDialogOpen || ui.questLogOpen || ui.charSheetOpen || ui.worldMapOpen || ui.dialogueOpen || ui.codexOpen || ui.emotesOpen || ui.achievementsOpen || ui.settingsOpen || ui.wardrobeOpen;

    // Crosshair shows while aiming (mouse-look, gamepad, or touch), hidden in menus.
    ui.el.crosshair.classList.toggle('hidden', menuOpen || !input.aiming);
    // Tuck the touch controls away while a full-screen menu is open.
    if (input.touchDevice) touch.setPlayVisible(!menuOpen);

    // Mouse-look only when no cursor-driven menu is open.
    if (!menuOpen) {
      followCam.handleLook(look.dx, look.dy);
      if (w) followCam.handleZoom(w);
    }

    // ESC closes the top open window; with none open it opens the options menu.
    if (input.just('Escape')) { if (!ui.closeTopPanel()) ui.toggleSettings(player); }
    // Toggle panels & quick-use.
    if (input.just('KeyI')) ui.toggleInventory(player);
    if (input.just('KeyK')) ui.toggleSkills(player);
    if (input.just('KeyJ')) ui.toggleQuestLog(player);
    if (input.just('KeyC')) ui.toggleCharSheet(player);
    if (input.just('KeyM')) ui.toggleWorldMap(player, enemies);
    if (input.just('KeyL')) ui.toggleCodex(player);
    if (input.just('KeyB')) ui.toggleAchievements(player);
    if (input.just('KeyN')) ui.toggleWardrobe(player);
    if (input.just('KeyV')) {
      const m = followCam.cycleMode();
      ui.log(m === 'fps' ? 'First-person view.' : 'Over-the-shoulder view.', 'sys');
    }
    if (input.just('KeyO')) ui.toggleSettings(player);
    if (input.just('KeyT')) ui.toggleEmotes(player);
    if (input.just('KeyR')) {
      if (!player.hasMount) ui.log('You have no steed yet — travel far on foot (see the Marathoner achievement) to earn one.', 'sys');
      else { const on = player.toggleMount(); ui.log(on ? 'You whistle for your steed and ride off.' : 'You dismount.', 'sys'); }
    }
    if (input.just('KeyQ')) quickHeal();
    // Tab swaps between your two weapons (e.g. melee ↔ a bow for flying foes).
    if (input.just('Tab')) {
      const w = player.swapWeapon();
      if (w) { ui.log(`Switched to ${w.glyph} ${w.name}.`, 'sys'); if (ui.inventoryOpen) ui.renderInventory(); if (ui.charSheetOpen) ui.renderCharSheet(player); }
      else ui.log('Equip a second weapon to swap (Tab).', 'sys');
    }

    // Area banner when entering a new named area; first visit reveals it on the map.
    const area = areaAt(player.pos.x, player.pos.z);
    if (area && area !== currentArea) { currentArea = area; ui.showAreaBanner(area); player.discoverArea(area.name); }
    else if (!area) currentArea = null;
    if (input.just('Enter') && !ui.chatActive) ui.openChat(input);
    if (input.just('KeyH')) ui.toggleHint();

    // Update world entities. Combat ignores attack/ability input while a menu
    // is open, but projectiles/loot/FX keep simulating.
    player.update(dt, input, followCam);
    // Only tick (and draw) enemies near the player — far ones freeze offscreen.
    // Saves the per-frame AI/animation/collision cost of the world's ~300 mobs.
    const ACTIVE2 = 130 * 130;
    for (const e of enemies) {
      if (e._net) continue; // server-driven enemies are updated by netEnemies below
      // The dragon stays loaded at any distance — it's a visual landmark
      // circling its far-north roost until the player unlocks the fight.
      const near = e.isDragon || e.pos.distanceToSquared(player.pos) < ACTIVE2;
      e.mesh.visible = near;
      // Far mobs skip update AND drop out of scene.updateMatrixWorld — without
      // this their whole limb hierarchy is still walked every frame even though
      // they're frozen and invisible, which is most of the world's ~300 mobs.
      e.mesh.matrixWorldAutoUpdate = near;
      if (near) e.update(dt, player, t);
    }
    // Server enemies (synced multiplayer): drive their motion/animation here.
    if (netEnemies) netEnemies.update(dt);
    // Boss phase reactions: announce enrage and spawn minion adds. (Boss phases
    // are owned by the server in authoritative mode, so skip locally.)
    const newMinions = [];
    for (const e of enemies) {
      if (!e.boss || e._net) continue;               // server bosses handle their own phases
      if (netMode && !e.persistent) continue;         // (only persistent local bosses remain)
      if (e._newPhase) { ui.floater('ENRAGED!', 'crit', e.pos); ui.log(`${e.bossName} enters phase ${e._newPhase}!`, 'death'); e._newPhase = 0; }
      if (e.wantsMinions > 0) { newMinions.push(...spawnMinions(scene, world, e, e.wantsMinions)); ui.log(`${e.bossName} summons minions!`, 'death'); e.wantsMinions = 0; }
    }
    if (newMinions.length) enemies.push(...newMinions);
    combat.suppressInput = menuOpen || player.mounted || !!fishing; // no attacking while fishing
    combat.update(dt, input);
    updateEnemyShots(dt, player); // fly the ranged mobs' projectiles you must dodge
    network.update(dt);
    network.sendState(player, dt);

    // Detect damage taken → feedback.
    if (player.alive) {
      if (player.stats.hp < lastHp - 0.5) {
        const dmg = Math.round(lastHp - player.stats.hp);
        ui.floater(`-${dmg}`, 'taken', player.pos);
        audio.play('hurt');
      }
      lastHp = player.stats.hp;
    }

    // ---- The Leviathan Zone: swim too far past the coast and the beast wakes. ----
    if (player.alive) {
      const rad = Math.hypot(player.pos.x, player.pos.z);
      // Only the overworld ocean band counts. Dungeon/cave instances live far
      // off the map (radius ≫ the world), so exclude anything past the edge —
      // otherwise porting into an instance reads as "deep in the Leviathan sea".
      const inZone = rad > LEVIATHAN_RADIUS && rad < WORLD_SIZE * 1.2;
      const DUR = 8; // seconds in the zone before the Leviathan rises
      if (inZone && !leviathanTriggered) {
        leviathanT = Math.min(DUR, leviathanT + dt);
        ui.setLeviathan(true, 1 - leviathanT / DUR);
        if (leviathanT >= DUR) {
          leviathanTriggered = true;
          ui.setLeviathan(false, 0);
          const len = rad || 1;
          world.triggerLeviathan(player.pos.x + (player.pos.x / len) * 34, player.pos.z + (player.pos.z / len) * 34);
          ui.log('The <b>LEVIATHAN</b> erupts from the abyss and drags you under!', 'death');
          audio.play('death');
          player.takeDamage(999999, player.pos.clone());
        }
      } else {
        if (leviathanT > 0) leviathanT = Math.max(0, leviathanT - dt * 2.2); // recede when you turn back
        ui.setLeviathan(!leviathanTriggered && leviathanT > 0.05, leviathanT > 0 ? 1 - leviathanT / DUR : 1);
      }
    }

    // Death + respawn flow.
    if (!player.alive && !deathHandled) {
      deathHandled = true;
      ui.showDeath(true);
      ui.log('YOU DIED.', 'death');
      audio.play('death');
      setTimeout(() => {
        player.reviveAt(player.respawn);
        lastHp = player.stats.hp;
        ui.showDeath(false);
        deathHandled = false;
        // Reset the Leviathan warning so it can trigger again on a future swim.
        leviathanT = 0; leviathanTriggered = false; ui.setLeviathan(false, 1);
        ui.log('You awaken at the bonfire.', 'sys');
      }, 2600);
    }

    // Interactions, by priority: vendor → quest giver → camp chest → bonfire.
    if (restCooldown > 0) restCooldown -= dt;
    let fishSpot = null;
    const nearVendor = player.alive ? world.nearestVendor(player.pos, 4.5) : null;
    const giver = player.alive ? world.questGivers.find((g) => g.pos.distanceTo(player.pos) < 4.5) : null;
    const giverQuest = giver ? Quests.giverActiveQuest(player, giver.giver) : null;
    const villager = player.alive ? world.villagers.find((v) => v.pos.distanceTo(player.pos) < 3.5) : null;
    const camp = player.alive ? world.nearestCamp(player.pos, 5) : null;
    // Keep nearby castle vaults' clear-state fresh so they shimmer once the
    // castle is cleared (even before you walk right up to the chest).
    for (const cc of world.castleChests) if (!cc.opened && cc.pos.distanceTo(player.pos) < 130) castleIsCleared(cc);
    const bonfire = world.nearestBonfire(player.pos, 4.5);
    if (menuOpen) {
      ui.hidePrompt();
    } else if (fishing) {
      updateFishing(t);
    } else if (nearVendor) {
      ui.showPrompt(`Press <b>E</b> to trade with the <b>${nearVendor.label}</b>`);
      if (input.just('KeyE')) ui.openVendor(player, nearVendor);
    } else if (giver && giverQuest) {
      const st = Quests.statusOf(player, giverQuest);
      const verb = st === 'available' ? 'speak with' : st === 'complete' ? 'turn in quest with' : 'talk to';
      ui.showPrompt(`Press <b>E</b> to ${verb} <b>${giver.name}</b>`);
      if (input.just('KeyE')) ui.openQuestDialog(player, giver);
    } else if (villager) {
      ui.showPrompt('Press <b>E</b> to talk');
      if (input.just('KeyE')) ui.showDialogue('Villager', ui.randomLore());
    } else if (player.alive && world.nearestDungeonEntrance(player.pos)) {
      const d = world.nearestDungeonEntrance(player.pos);
      if (d.lockoutUntil && t < d.lockoutUntil) {
        ui.showPrompt(`<b>${d.name}</b> is sealed — resets in <b>${Math.ceil(d.lockoutUntil - t)}s</b>`);
      } else {
        ui.showPrompt(`Press <b>E</b> to enter <b>${d.name}</b> (Lv ${d.level})`);
        if (input.just('KeyE')) {
          player.dismount(); player.pos.copy(d.spawn); player.pos.y = d.spawn.y;
          player.vel.set(0, 0, 0); player.state = 'ground'; lastHp = player.stats.hp;
          ui.log(`You descend into ${d.name}.`, 'sys');
        }
      }
    } else if (player.alive && world.nearestDungeonExit(player.pos)) {
      const d = world.nearestDungeonExit(player.pos);
      ui.showPrompt('Press <b>E</b> to leave the dungeon');
      if (input.just('KeyE')) {
        player.pos.copy(d.entrance); player.vel.set(0, 0, 0); player.state = 'ground'; lastHp = player.stats.hp;
        ui.log(`You leave ${d.name}.`, 'sys');
      }
    } else if (player.alive && world.nearestDungeonChest(player.pos)) {
      const d = world.nearestDungeonChest(player.pos);
      if (d.opened) ui.hidePrompt();
      else if (world.dungeonCleared(d)) {
        ui.showPrompt('Press <b>E</b> to open the dungeon chest');
        if (input.just('KeyE')) {
          d.opened = true;
          d.lockoutUntil = t + DUNGEON_LOCKOUT;
          combat.openChest({ level: d.level + 2, pos: d.chestPos });
          ui.log(`You loot the ${d.name} chest! It seals for ${Math.round(DUNGEON_LOCKOUT)}s.`, 'xp');
        }
      } else {
        ui.showPrompt('Clear the dungeon to unlock the chest');
      }
    } else if (player.alive && world.nearestCaveEntrance(player.pos)) {
      const c = world.nearestCaveEntrance(player.pos);
      ui.showPrompt(`Press <b>E</b> to descend into <b>${c.name}</b>`);
      if (input.just('KeyE')) {
        player.dismount(); player.pos.copy(c.spawn); player.pos.y = c.spawn.y;
        player.vel.set(0, 0, 0); player.state = 'ground'; lastHp = player.stats.hp;
        ui.log(`You descend into ${c.name}.`, 'sys');
      }
    } else if (player.alive && world.nearestCaveExit(player.pos)) {
      const c = world.nearestCaveExit(player.pos);
      ui.showPrompt('Press <b>E</b> to climb back to the surface');
      if (input.just('KeyE')) {
        player.pos.copy(c.entrance); player.pos.y = c.entrance.y;
        player.vel.set(0, 0, 0); player.state = 'ground'; lastHp = player.stats.hp;
        ui.log(`You leave ${c.name}.`, 'sys');
      }
    } else if (player.alive && world.nearestCaveChest(player.pos)) {
      const c = world.nearestCaveChest(player.pos);
      if (c.opened) ui.hidePrompt();
      else {
        ui.showPrompt('Press <b>E</b> to open the crystal cache');
        if (input.just('KeyE')) {
          c.opened = true;
          combat.openChest({ level: (c.level || 3) + 2, pos: c.chestPos });
          ui.log(`You loot the ${c.name} cache!`, 'xp');
        }
      }
    } else if (player.alive && world.nearestCastleChest(player.pos, 6)) {
      const cc = world.nearestCastleChest(player.pos, 6);
      if (cc.opened) ui.hidePrompt();
      else if (castleIsCleared(cc)) {
        ui.showPrompt('Press <b>E</b> to open the castle vault');
        if (input.just('KeyE')) {
          cc.opened = true;
          combat.openChest({ level: cc.level, pos: cc.pos });
          Quests.onChestOpened(player);
          ui.log(`You breach the vault of <b>${cc.name}</b>!`, 'xp');
        }
      } else {
        ui.showPrompt('Clear the castle to unlock the vault');
      }
    } else if (camp) {
      if (camp.opened) {
        ui.hidePrompt();
      } else if (campIsCleared(camp)) {
        ui.showPrompt('Press <b>E</b> to open the treasure chest');
        if (input.just('KeyE')) {
          camp.opened = true;
          combat.openChest(camp);
          Quests.onChestOpened(player);
          ui.refreshGiverMarkers(player);
          ui.log('You crack open the war-camp chest!', 'xp');
        }
      } else {
        ui.showPrompt('Defeat the <b>elite camp</b> to unlock the chest');
      }
    } else if (player.alive && world.nearestShrine(player.pos)) {
      const s = world.nearestShrine(player.pos);
      if (t < s.cooldownUntil) {
        ui.showPrompt(`<b>${s.type.name}</b> lies dormant — ${Math.ceil(s.cooldownUntil - t)}s`);
      } else {
        const mins = Math.round(s.type.dur / 60);
        ui.showPrompt(`Press <b>E</b> to pray at the <b>${s.type.name}</b><br><span style="opacity:.8">${s.type.desc} for ${mins} min</span>`);
        if (input.just('KeyE')) {
          const dur = s.type.dur * (player.passives.has('blessed') ? 1.5 : 1); // Blessed: longer blessings
          player.applyTimedBuff(s.type.buff, dur, { label: s.type.name, glyph: s.type.glyph, color: '#' + s.type.color.toString(16).padStart(6, '0') });
          player.counters.shrine = (player.counters.shrine || 0) + 1; // Pilgrim achievement
          s.cooldownUntil = t + 120;
          ui.log(`Blessed by the ${s.type.name}: ${s.type.desc} for ${Math.round(dur / 60)} minutes.`, 'xp');
          ui.floater(`${s.type.glyph} Blessed`, 'heal', player.pos);
          audio.play('rest');
        }
      }
    } else if (player.alive && world.nearestPuzzleRune(player.pos)) {
      const { puzzle, index } = world.nearestPuzzleRune(player.pos);
      ui.showPrompt('Press <b>E</b> to touch the rune');
      if (input.just('KeyE')) {
        const r = world.activateRune(puzzle, index);
        if (r === 'solved') { ui.log('The runes align — the seal shatters!', 'xp'); ui.floater('Seal broken!', 'xp', player.pos); audio.play('level'); }
        else if (r === 'reset') { ui.log('Wrong rune — the seal flares and resets. Watch the pulsing order.', 'sys'); audio.play('hurt'); }
        else { audio.play('cast'); }
      }
    } else if (player.alive && world.nearestPuzzleKey(player.pos)) {
      // A shape-key sitting on its pedestal — pick it up, then slot it at the chest.
      const { puzzle } = world.nearestPuzzleKey(player.pos);
      ui.showPrompt('Press <b>E</b> to take the shard-key');
      if (input.just('KeyE')) {
        world.collectPuzzleKey(puzzle);
        ui.log('You lift the shard-key — carry it back to the sealed chest.', 'xp');
        audio.play('cast');
      }
    } else if (player.alive && world.nearestPuzzleChest(player.pos)) {
      const pz = world.nearestPuzzleChest(player.pos);
      if (pz.solved) {
        ui.showPrompt('Press <b>E</b> to open the sealed chest');
        if (input.just('KeyE')) {
          pz.opened = true;
          combat.openChest({ level: pz.level + 2, pos: pz.pos });
          Quests.onChestOpened(player);
          ui.log('You claim the warded chest!', 'xp');
        }
      } else if (pz.type === 'shapekey') {
        if (pz.hasKey) {
          ui.showPrompt('Press <b>E</b> to slot the shard-key');
          if (input.just('KeyE')) { pz.solved = true; ui.log('The shard-key fits — the seal breaks!', 'xp'); ui.floater('Seal broken!', 'xp', player.pos); audio.play('level'); }
        } else {
          ui.showPrompt('A shaped keyhole binds this chest — find the matching shard-key nearby');
        }
      } else if (pz.type === 'keycarrier') {
        ui.showPrompt('A thief fled with this chest\'s key — hunt down the <b>Key Thief</b> and slay it');
      } else {
        ui.showPrompt('A rune seal binds this chest — touch the runes in the pulsing order');
      }
    } else if (player.alive && world.nearestTreasure(player.pos)) {
      const tr = world.nearestTreasure(player.pos);
      ui.showPrompt('Press <b>E</b> to open the hidden treasure');
      if (input.just('KeyE')) {
        tr.opened = true;
        combat.openChest({ level: tr.level + 1, pos: tr.pos });
        ui.log('You uncover a hidden treasure chest!', 'xp');
        ui.floater('Treasure!', 'xp', player.pos);
      }
    } else if (player.alive && world.swordStone && !world.swordStone.pulled && player.pos.distanceTo(world.swordStone.pos) < 4.5) {
      const ss = world.swordStone;
      const total = player.effStr + player.effDex + player.effInt;
      const worthy = player.stats.level >= ss.req.level && total >= ss.req.total;
      if (worthy) {
        ui.showPrompt('A blade waits in the stone. Press <b>E</b> to draw it.');
        if (input.just('KeyE')) {
          world.setSwordStonePulled();
          player.stoneSwordPulled = true;
          const blade = makeStoneSword(player.stats.level);
          if (player.addItem(blade)) {
            ui.log(`The stone yields! You draw <b>${blade.name}</b>.`, 'xp');
            ui.floater('★ Aetherbrand drawn!', 'crit', player.pos);
            if (ui.inventoryOpen) ui.renderInventory();
          } else {
            ui.log('Your pack is too full to draw the blade.', 'sys');
            world.swordStone.pulled = false; world.swordStone.sword.visible = true; player.stoneSwordPulled = false;
          }
        }
      } else {
        ui.showPrompt(`A blade rests in the stone, but you are not yet worthy.<br><span style="opacity:.8">Requires <b>Level ${ss.req.level}</b> and <b>${ss.req.total}</b> total STR+DEX+INT (you have Lv ${player.stats.level}, ${Math.round(total)}).</span>`);
      }
    } else if (bonfire && player.alive) {
      ui.showPrompt('Press <b>E</b> to rest at the bonfire');
      if (input.just('KeyE') && restCooldown <= 0) {
        restCooldown = 1;
        player.restAtBonfire(bonfire.pos);
        if (bonfire.name && !player.discovered.includes(bonfire.name)) {
          player.discovered.push(bonfire.name);
          ui.log(`Discovered bonfire: ${bonfire.name} (fast-travel unlocked).`, 'xp');
        }
        // Resting respawns the world's monsters (Dark Souls style).
        for (const e of enemies) if (!e.alive) e.respawnTimer = 0.1;
        // Overwrite this character's save at the bonfire.
        const saved = Saves.write(player.toSave());
        ui.log('You rest. HP/MP/SP restored, respawn point set.', 'heal');
        ui.log(saved ? '💾 Progress saved.' : '⚠ Could not save (storage blocked).', saved ? 'xp' : 'sys');
        ui.floater(saved ? 'Saved' : 'Rested', 'heal', player.pos);
        audio.play('rest');
      }
    } else if (player.alive && player.state === 'ground' && !player.mounted && (fishSpot = world.nearWater(player.pos.x, player.pos.z))) {
      ui.showPrompt(`Press <b>E</b> to cast a line and fish${player.fishingStat ? `  <span style="opacity:.7">(🎣 ${player.fishingStat})</span>` : ''}`);
      if (input.just('KeyE')) startFishing(fishSpot, t);
    } else {
      ui.hidePrompt();
    }

    // Target frame: locked target or current aim.
    ui.setTarget(combat.target);

    // Boss health bar: show for an aggroed nearby boss (or a targeted one).
    let boss = enemies.find((e) => e.boss && e.alive && (e.state === 'chase' || e.state === 'attack') && e.pos.distanceTo(player.pos) < 50);
    if (!boss && combat.target && combat.target.boss && combat.target.alive) boss = combat.target;
    ui.updateBossBar(boss || null);

    // Camera follows the player.
    followCam.update(player.pos, dt);
    // In first-person, hide your own body so it doesn't fill the screen.
    if (player.mesh) player.mesh.visible = followCam.mode !== 'fps';

    // Keep level/gold counters live for their achievements (gold = total earned).
    if (player.gold > lastGold) player.counters.gold_earned = (player.counters.gold_earned || 0) + (player.gold - lastGold);
    lastGold = player.gold;
    player.counters.level = player.stats.level;

    // Award any newly-earned achievement tiers (toasts the unlock).
    const achChanged = Achievements.check(player, (ach, idx, tier) => ui.achievementToast(ach, idx, tier));

    // Unlock any cosmetics whose achievement/quest/level requirements are now
    // met (account-wide), toasting each new one. Throttled (it touches
    // localStorage) and also fired immediately whenever an achievement lands.
    cosmeticTimer -= dt;
    if (achChanged || cosmeticTimer <= 0) {
      cosmeticTimer = 1.5;
      for (const cos of evaluateUnlocks(player)) ui.cosmeticToast(cos);
    }

    // The end of everything: once all other achievements are complete, the
    // great dragon descends from its endless orbit to be challenged. (In a shared
    // world the dragon is server-owned, so the client never spawns its own.)
    if (!netMode && !dragonAwoken && Achievements.endgameReady(player)) {
      dragonAwoken = true;
      const dragon = spawnDragon(scene, world, player.stats.level);
      enemies.push(dragon);
      if (world.dragon) world.dragon.group.visible = false; // it has landed to fight
      player.discoverArea && player.discoverArea('Dragon’s Roost');
      ui.log('The sky darkens. <b>Vetharion, the Sky-Tyrant</b> descends to the far north — your final trial awaits at the Dragon’s Roost!', 'death');
      ui.showAreaBanner({ name: 'Vetharion Descends', sub: `The Sky-Tyrant roosts at (${DRAGON_ROOST.x}, ${DRAGON_ROOST.z})` });
      audio.play('level');
    }

    // HUD + minimap + party frames (live HP).
    ui.updateHud(player, network.count);
    ui.drawMinimap(player, enemies, world, network.others);
    ui.updateEmoteBubble(player);
    if (input.touchDevice) touch.syncHud(player); // mirror abilities/cooldowns onto touch bar
    if (network.party.length > 1) ui.updatePartyFrames(player, network);
  }

  renderer.render(scene, camera);
  input.endFrame();
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
