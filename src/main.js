// ============================================================
// Stickman MMO — entry point & game loop. Wires together world,
// player, camera, enemies, combat, UI, audio, and networking.
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { spawnEnemies } from './enemies.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Network } from './network.js';

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

// ---- Start the game from the class-select screen ----
ui.onEnter(({ name, classId, server }) => {
  if (started) return;
  started = true;
  audio.init();

  player = new Player(scene, world, classId, name);
  player.world = world;
  lastHp = player.stats.hp;
  enemies = spawnEnemies(scene, world);
  combat = new Combat({ scene, player, enemies, ui, camera: followCam, audio });

  ui.enterWorld(player);
  ui.log(`Welcome, ${name} the ${classId}. Slay monsters and grow strong!`, 'sys');
  ui.log('Find a bonfire (orange flame) and press E to rest.', 'sys');

  network.connect(server, { name, classId });
  input.enabled = true;
});

// ---- Main loop ----
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  world.update(t);

  if (started && player) {
    // Camera look from mouse.
    const look = input.consumeLook();
    followCam.handleLook(look.dx, look.dy);
    const w = input.consumeWheel();
    if (w) followCam.handleZoom(w);

    // Chat open (Enter) and hint toggle (H).
    if (input.just('Enter') && !ui.chatActive) ui.openChat(input);
    if (input.just('KeyH')) ui.toggleHint();

    // Update world entities.
    player.update(dt, input, followCam);
    for (const e of enemies) e.update(dt, player, t);
    combat.update(dt, input);
    combat.updateFx(dt);
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

    // Bonfire interaction.
    if (restCooldown > 0) restCooldown -= dt;
    const bonfire = world.nearestBonfire(player.pos, 4.5);
    if (bonfire && player.alive) {
      ui.showPrompt('Press <b>E</b> to rest at the bonfire');
      if (input.just('KeyE') && restCooldown <= 0) {
        restCooldown = 1;
        player.restAtBonfire(bonfire.pos);
        // Resting respawns the world's monsters (Dark Souls style).
        for (const e of enemies) if (!e.alive) e.respawnTimer = 0.1;
        ui.log('You rest. HP/MP/SP restored, respawn point set.', 'heal');
        ui.floater('Rested', 'heal', player.pos);
        audio.play('rest');
      }
    } else {
      ui.hidePrompt();
    }

    // Target frame: locked target or current aim.
    ui.setTarget(combat.target);

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
