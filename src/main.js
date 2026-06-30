// ============================================================
// Stickman MMO — entry point & game loop. Wires together world,
// player, camera, enemies, combat, UI, audio, and networking.
// ============================================================
import * as THREE from 'three';
import { World, areaAt, WATER_LEVEL } from './world.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { spawnEnemies, spawnCamps, spawnBosses, spawnMinions, spawnDungeons, spawnFlyers } from './enemies.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Network } from './network.js';
import { Saves } from './save.js';
import { starterWeapon, makeStoneSword, rollFishingCatch, RARITY } from './items.js';
import * as Quests from './quests.js';
import * as Achievements from './achievements.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);

const ui = new UI();
const audio = new Audio();
ui.audio = audio; // lets the UI play a sting on achievement unlocks
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

  // If this character already drew the blade in the stone, leave the stone empty.
  if (player.stoneSwordPulled) world.setSwordStonePulled();

  lastHp = player.stats.hp;
  enemies = spawnEnemies(scene, world);
  enemies.push(...spawnCamps(scene, world)); // elite camp packs
  enemies.push(...spawnBosses(scene, world)); // world bosses
  enemies.push(...spawnDungeons(scene, world)); // dungeon packs + wardens
  enemies.push(...spawnFlyers(scene, world));    // Sky Wraiths patrolling the air
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

  network.connect(server, { name, classId });
  input.enabled = true;

  // Debug/tinkering handle — e.g. StickmanGame.player.gainXp(500).
  window.StickmanGame = { player, world, enemies, combat, ui, followCam, renderer };
}

ui.setupStart({
  onCreate: ({ name, classId, server }) => beginGame(classId, name, server, null),
  onContinue: (save, server) => beginGame(save.classId, save.name, server, save),
});

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

  world.update(t, dt);

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

    const menuOpen = ui.inventoryOpen || ui.vendorOpen || ui.skillsOpen || ui.questDialogOpen || ui.questLogOpen || ui.charSheetOpen || ui.worldMapOpen || ui.dialogueOpen || ui.codexOpen || ui.emotesOpen || ui.achievementsOpen;

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
    if (input.just('KeyC')) ui.toggleCharSheet(player);
    if (input.just('KeyM')) ui.toggleWorldMap(player, enemies);
    if (input.just('KeyL')) ui.toggleCodex(player);
    if (input.just('KeyB')) ui.toggleAchievements(player);
    if (input.just('KeyT')) ui.toggleEmotes(player);
    if (input.just('KeyR')) { const on = player.toggleMount(); ui.log(on ? 'You whistle for your steed and ride off.' : 'You dismount.', 'sys'); }
    if (input.just('KeyQ')) quickHeal();

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
      const near = e.pos.distanceToSquared(player.pos) < ACTIVE2;
      e.mesh.visible = near;
      if (near) e.update(dt, player, t);
    }
    // Boss phase reactions: announce enrage and spawn minion adds.
    const newMinions = [];
    for (const e of enemies) {
      if (!e.boss) continue;
      if (e._newPhase) { ui.floater('ENRAGED!', 'crit', e.pos); ui.log(`${e.bossName} enters phase ${e._newPhase}!`, 'death'); e._newPhase = 0; }
      if (e.wantsMinions > 0) { newMinions.push(...spawnMinions(scene, world, e, e.wantsMinions)); ui.log(`${e.bossName} summons minions!`, 'death'); e.wantsMinions = 0; }
    }
    if (newMinions.length) enemies.push(...newMinions);
    combat.suppressInput = menuOpen || player.mounted || !!fishing; // no attacking while fishing
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
    let fishSpot = null;
    const nearVendor = player.alive ? world.nearestVendor(player.pos, 4.5) : null;
    const giver = player.alive ? world.questGivers.find((g) => g.pos.distanceTo(player.pos) < 4.5) : null;
    const giverQuest = giver ? Quests.giverActiveQuest(player, giver.giver) : null;
    const villager = player.alive ? world.villagers.find((v) => v.pos.distanceTo(player.pos) < 3.5) : null;
    const camp = player.alive ? world.nearestCamp(player.pos, 5) : null;
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
    } else if (player.alive && world.nearestShrine(player.pos)) {
      const s = world.nearestShrine(player.pos);
      if (t < s.cooldownUntil) {
        ui.showPrompt(`<b>${s.type.name}</b> lies dormant — ${Math.ceil(s.cooldownUntil - t)}s`);
      } else {
        const mins = Math.round(s.type.dur / 60);
        ui.showPrompt(`Press <b>E</b> to pray at the <b>${s.type.name}</b><br><span style="opacity:.8">${s.type.desc} for ${mins} min</span>`);
        if (input.just('KeyE')) {
          player.applyTimedBuff(s.type.buff, s.type.dur, { label: s.type.name, glyph: s.type.glyph, color: '#' + s.type.color.toString(16).padStart(6, '0') });
          s.cooldownUntil = t + 120;
          ui.log(`Blessed by the ${s.type.name}: ${s.type.desc} for ${mins} minutes.`, 'xp');
          ui.floater(`${s.type.glyph} Blessed`, 'heal', player.pos);
          audio.play('rest');
        }
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

    // Award any newly-earned achievement tiers (toasts the unlock).
    Achievements.check(player, (ach, idx, tier) => ui.achievementToast(ach, idx, tier));

    // HUD + minimap + party frames (live HP).
    ui.updateHud(player, network.count);
    ui.drawMinimap(player, enemies, world, network.others);
    ui.updateEmoteBubble(player);
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
