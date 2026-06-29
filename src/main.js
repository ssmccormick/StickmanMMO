// ============================================================
// Stickman MMO — entry point & game loop. Wires together world,
// player, camera, enemies, combat, UI, audio, and networking.
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { spawnEnemies, spawnCamps, spawnBosses } from './enemies.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Network } from './network.js';
import { Saves } from './save.js';
import { starterWeapon } from './items.js';
import * as Quests from './quests.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

const ui = new UI();
const audio = new Audio();
const input = new Input(canvas);
const followCam = new FollowCamera(camera);
const world = new World(scene);
const network = new Network(scene, ui);

let player = null;
let enemies = [];
let combat = null;
let started = false;
let deathHandled = false;
let lastHp = 0;
let restCooldown = 0;
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
  ui.log(`${player.name}: ${text}`, 'chat');
  network.sendChat(text);
});

// ---- Start the game (shared by "new character" and "continue") ----
function beginGame(classId, name, server, save) {
  if (started) return;
  started = true;
  audio.init();

  player = new Player(scene, world, classId, name);
  player.world = world;

  if (save) {
    // Continue an existing character.
    player.applySave(save);
  } else {
    // Brand new character → give a starter weapon, then persist so it joins
    // the roster.
    player.gear.weapon = starterWeapon(player.def.primary);
    player.recomputeGear();
    const rec = Saves.create(player.toSave());
    player.saveId = rec.id;
  }

  lastHp = player.stats.hp;
  enemies = spawnEnemies(scene, world);
  enemies.push(...spawnCamps(scene, world)); // elite camp packs
  enemies.push(...spawnBosses(scene, world)); // world bosses
  combat = new Combat({ scene, player, enemies, ui, camera: followCam, audio });
  combat.onLevelUp = () => { audio.play('level'); ui.levelUp(player.stats.level); };
  // Keep panels live as loot is picked up; refresh quest markers on kills.
  combat.onLoot = () => { if (ui.inventoryOpen) ui.renderInventory(); };
  combat.onKillEvent = () => ui.refreshGiverMarkers(player);

  ui.setWorld(world);
  ui.refreshGiverMarkers(player);

  ui.enterWorld(player);
  ui.log(save
    ? `Welcome back, ${name} the ${classId} (Lv ${player.stats.level}).`
    : `Welcome, ${name} the ${classId}. Slay monsters and grow strong!`, 'sys');
  ui.log('Rest at a bonfire (orange flame, press E) to heal and SAVE your progress.', 'sys');

  network.connect(server, { name, classId });
  input.enabled = true;

  // Debug/tinkering handle — e.g. StickmanGame.player.gainXp(500).
  window.StickmanGame = { player, world, enemies, combat, ui, followCam };
}

ui.setupStart({
  onCreate: ({ name, classId, server }) => beginGame(classId, name, server, null),
  onContinue: (save, server) => beginGame(save.classId, save.name, server, save),
});

// Quaff the first health potion in the bag (hotkey Q).
function quickHeal() {
  if (!player || !player.alive) return;
  const pot = player.inventory.find((it) => it.type === 'consumable' && it.kind === 'heal');
  if (!pot) { ui.log('No health potion in your bag.', 'sys'); return; }
  const r = player.useConsumable(pot.uid);
  if (r.heal != null) { ui.log(`Used ${pot.name} (+${r.heal} HP).`, 'heal'); ui.floater(`+${r.heal}`, 'heal', player.pos); }
  if (ui.inventoryOpen) ui.renderInventory();
}

// ---- Main loop ----
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  world.update(t, dt);

  if (started && player) {
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

    const menuOpen = ui.inventoryOpen || ui.vendorOpen || ui.skillsOpen || ui.questDialogOpen || ui.questLogOpen;

    // Crosshair shows while mouse-look is active (aiming), hidden in menus.
    ui.el.crosshair.classList.toggle('hidden', menuOpen || !input.locked);

    // Mouse-look only when no cursor-driven menu is open.
    if (!menuOpen) {
      followCam.handleLook(look.dx, look.dy);
      if (w) followCam.handleZoom(w);
    }

    // Toggle panels & quick-use.
    if (input.just('KeyI')) ui.toggleInventory(player);
    if (input.just('KeyK')) ui.toggleSkills(player);
    if (input.just('KeyJ')) ui.toggleQuestLog(player);
    if (input.just('KeyQ')) quickHeal();
    if (input.just('Enter') && !ui.chatActive) ui.openChat(input);
    if (input.just('KeyH')) ui.toggleHint();

    // Update world entities. Combat ignores attack/ability input while a menu
    // is open, but projectiles/loot/FX keep simulating.
    player.update(dt, input, followCam);
    for (const e of enemies) e.update(dt, player, t);
    combat.suppressInput = menuOpen;
    combat.update(dt, input);
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
        ui.log('You awaken at the bonfire.', 'sys');
      }, 2600);
    }

    // Interactions, by priority: vendor → quest giver → camp chest → bonfire.
    if (restCooldown > 0) restCooldown -= dt;
    const nearVendor = world.vendor && player.alive && world.vendor.pos.distanceTo(player.pos) < 4.5;
    const giver = player.alive ? world.questGivers.find((g) => g.pos.distanceTo(player.pos) < 4.5) : null;
    const camp = player.alive ? world.nearestCamp(player.pos, 5) : null;
    const bonfire = world.nearestBonfire(player.pos, 4.5);
    if (menuOpen) {
      ui.hidePrompt();
    } else if (nearVendor) {
      ui.showPrompt('Press <b>E</b> to trade with the merchant');
      if (input.just('KeyE')) ui.openVendor(player);
    } else if (giver) {
      const st = Quests.statusOf(player, giver.questId);
      const verb = st === 'available' ? 'speak with' : st === 'complete' ? 'turn in quest with' : 'talk to';
      ui.showPrompt(`Press <b>E</b> to ${verb} <b>${giver.name}</b>`);
      if (input.just('KeyE')) ui.openQuestDialog(player, giver);
    } else if (camp) {
      if (camp.opened) {
        ui.hidePrompt();
      } else if (world.campCleared(camp)) {
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
    } else if (bonfire && player.alive) {
      ui.showPrompt('Press <b>E</b> to rest at the bonfire');
      if (input.just('KeyE') && restCooldown <= 0) {
        restCooldown = 1;
        player.restAtBonfire(bonfire.pos);
        // Resting respawns the world's monsters (Dark Souls style).
        for (const e of enemies) if (!e.alive) e.respawnTimer = 0.1;
        // Overwrite this character's save at the bonfire.
        const saved = Saves.write(player.toSave());
        ui.log('You rest. HP/MP/SP restored, respawn point set.', 'heal');
        ui.log(saved ? '💾 Progress saved.' : '⚠ Could not save (storage blocked).', saved ? 'xp' : 'sys');
        ui.floater(saved ? 'Saved' : 'Rested', 'heal', player.pos);
        audio.play('rest');
      }
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

    // HUD + minimap.
    ui.updateHud(player, network.count);
    ui.drawMinimap(player, enemies, world, network.others);
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
