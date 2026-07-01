// ============================================================
// Networked enemies (client side of synced encounters). When connected to an
// authoritative server, the local enemy simulation is switched off and this
// manager renders the server's enemies instead. They're real Enemy instances
// (so targeting, combat, nameplates and the boss bar all work unchanged), but
// their position/HP/state are driven by server snapshots rather than local AI,
// and hitting one reports the damage to the server, which owns the kill.
// ============================================================
import * as THREE from 'three';
import { Enemy, spawnNetShot } from './enemies.js';

const STALE_MS = 2500; // drop an enemy we haven't heard about for this long (left AoI)
const DEAD_MS = 1800;  // remove a corpse this long after death (lets the flop play)

export class NetEnemies {
  constructor({ scene, world, enemies, player, network, combat }) {
    this.scene = scene; this.world = world; this.enemies = enemies;
    this.player = player; this.network = network; this.combat = combat;
    this.map = new Map(); // serverId -> Enemy
    this._clock = 0;
  }

  // Reconcile a batch of server enemy snapshots into live Enemy instances.
  onSnapshot(list) {
    const now = this._clock;
    for (const s of list) {
      let e = this.map.get(s.id);
      if (!e) {
        const home = new THREE.Vector3(s.x, s.y, s.z);
        e = new Enemy(this.scene, this.world, s.t, s.lv, home, { boss: !!s.b, elite: !!s.e, bossName: s.nm });
        e._net = true;
        e._serverId = s.id;
        e._onNetHit = (sid, dmg) => this.network.sendEnemyHit(sid, dmg);
        e._targetPos = new THREE.Vector3(s.x, s.y, s.z);
        e._targetFacing = s.f;
        e.pos.set(s.x, s.y, s.z);
        this.map.set(s.id, e);
        this.enemies.push(e);
      }
      e._lastSeen = now;
      e._targetPos.set(s.x, s.y, s.z);
      e._targetFacing = s.f;
      e.hp = s.hp; e.maxHp = s.mhp;
      e.alive = s.st !== 'dead';
      if (e.alive) e.state = s.st;
      if (e.renderCharge) e.renderCharge(s.cg); // server-driven telegraph
      if (e._drawPlate) e._drawPlate();
    }
  }

  onHp(id, hp) { const e = this.map.get(id); if (e) { e.hp = hp; if (e._drawPlate) e._drawPlate(); } }

  onDeath(msg) {
    const e = this.map.get(msg.enemyId);
    if (!e) return;
    // The client credited with the killing blow gets the XP / gold / loot.
    if (msg.by === this.network.id) this.combat.creditKill(e);
    e.alive = false;
    e._deadAt = this._clock;         // scheduled for cleanup after the death anim
    if (e.renderCharge) e.renderCharge(null); // drop any telegraph
    if (this.combat.target === e) this.combat.target = null;
  }

  onAttack(dmg, enemyId) {
    if (!this.player.alive) return;
    const e = this.map.get(enemyId);
    this.player.takeDamage(dmg, e ? e.pos : this.player.pos);
  }

  onShot(shot) { if (shot) spawnNetShot(this.scene, shot); }

  // Smoothly drive every networked enemy each frame; prune ones that left AoI.
  update(dt) {
    this._clock += dt * 1000;
    const now = this._clock;
    for (const [id, e] of this.map) {
      if (now - e._lastSeen > STALE_MS) { this._remove(id, e); continue; }
      // Clean up a dead enemy shortly after its death animation, rather than
      // leaving the corpse for the whole (now much longer) respawn timer.
      if (!e.alive && e._deadAt && now - e._deadAt > DEAD_MS) { this._remove(id, e); continue; }
      e.pos.lerp(e._targetPos, Math.min(1, dt * 10));
      e.mesh.position.copy(e.pos);
      e.mesh.visible = true;
      e.mesh.matrixWorldAutoUpdate = true;
      let diff = (e._targetFacing || 0) - e.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.mesh.rotation.y += diff * Math.min(1, dt * 10);
      if (e.attackAnim > 0) e.attackAnim = Math.max(0, e.attackAnim - dt * 2.4);
      const moving = e.alive && (e.state === 'chase' || e.state === 'attack' || e.state === 'return');
      const atk = Math.max(e.attackAnim || 0, e.state === 'attack' ? 0.5 : 0);
      if (e._poser) e._poser(e.mesh, dt, { speed01: moving ? 0.8 : 0.15, attack: atk, dead: !e.alive });
      // Hit-flash fade (set by optimistic local hits).
      if (e._hitFlash > 0) { e._hitFlash -= dt; if (e._hitFlash <= 0 && e.mesh.scale) e.mesh.scale.setScalar(e.displayScale); }
    }
  }

  _remove(id, e) {
    this.map.delete(id);
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    if (this.combat.target === e) this.combat.target = null;
    this.scene.remove(e.mesh);
    if (e._shockRing) this.scene.remove(e._shockRing);
  }

  // Tear down every networked enemy (e.g. on disconnect).
  clear() { for (const [id, e] of this.map) this._remove(id, e); }
}
