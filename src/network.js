// ============================================================
// Network client. Connects to the optional WebSocket server for
// multiplayer; if no server is given (or it fails) the game runs
// in solo mode with zero errors. Spawns/updates other players as
// stickmen with nameplates, and relays chat.
// ============================================================
import * as THREE from 'three';
import { createStickman, animateStickman } from './stickman.js';
import { CLASSES } from './classes.js';
import { heightAt } from './world.js';

export class Network {
  constructor(scene, ui) {
    this.scene = scene;
    this.ui = ui;
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.others = {};           // id -> remote player record
    this.onChat = null;
    this._sendTimer = 0;
  }

  // Attempt connection. selfInfo = { name, classId }. Resolves either way.
  connect(url, selfInfo) {
    this.selfInfo = selfInfo;
    if (!url) { this.ui.setServerStatus('offline', 'offline — solo play'); return; }
    this.ui.setServerStatus('connecting', 'connecting…');
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.ui.setServerStatus('offline', 'offline — solo play');
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.ui.setServerStatus('online', 'online');
      this.ui.log('Connected to server.', 'sys');
      this._send({ type: 'join', name: selfInfo.name, classId: selfInfo.classId });
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.ui.setServerStatus('offline', 'offline — solo play');
      this._clearOthers();
    };
    this.ws.onerror = () => {
      this.ui.setServerStatus('offline', 'offline — solo play');
    };
    this.ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      this._handle(msg);
    };
  }

  _handle(msg) {
    switch (msg.type) {
      case 'welcome':
        this.id = msg.id;
        (msg.players || []).forEach((p) => { if (p.id !== this.id) this._spawnOther(p); });
        break;
      case 'spawn':
        if (msg.player.id !== this.id) this._spawnOther(msg.player);
        break;
      case 'state':
        if (msg.id !== this.id) this._updateOther(msg);
        break;
      case 'despawn':
        this._despawn(msg.id);
        break;
      case 'chat':
        if (this.onChat) this.onChat(msg);
        break;
    }
  }

  _spawnOther(p) {
    if (this.others[p.id]) return;
    const def = CLASSES[p.classId] || CLASSES.fighter;
    const mesh = createStickman({ color: def.color, accent: def.accent });
    mesh.position.set(p.x || 0, p.y || 0, p.z || 0);
    this.scene.add(mesh);
    const plate = this._makePlate(p.name, def.name);
    plate.position.y = 2.6;
    mesh.add(plate);
    this.others[p.id] = {
      id: p.id, name: p.name, classId: p.classId, mesh,
      pos: new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
      target: new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
      facing: 0, targetFacing: 0, state: 'ground', _speed01: 0,
    };
    this.ui.log(`${p.name} entered the world.`, 'sys');
  }

  _updateOther(msg) {
    const o = this.others[msg.id];
    if (!o) { this._spawnOther(msg); return; }
    o.target.set(msg.x, msg.y, msg.z);
    o.targetFacing = msg.facing;
    o.state = msg.state;
  }

  _despawn(id) {
    const o = this.others[id];
    if (!o) return;
    this.scene.remove(o.mesh);
    this.ui.log(`${o.name} left.`, 'sys');
    delete this.others[id];
  }

  _clearOthers() {
    for (const id in this.others) this.scene.remove(this.others[id].mesh);
    this.others = {};
  }

  _makePlate(name, className) {
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 48;
    const ctx = cvs.getContext('2d');
    ctx.font = 'bold 20px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(name, 129, 21);
    ctx.fillStyle = '#9bd0ff'; ctx.fillText(name, 128, 20);
    ctx.font = '13px Trebuchet MS'; ctx.fillStyle = '#cfe0ff';
    ctx.fillText(className, 128, 38);
    const tex = new THREE.CanvasTexture(cvs);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(3, 0.6, 1);
    return spr;
  }

  // Throttled state broadcast (~12/s).
  sendState(player, dt) {
    if (!this.connected) return;
    this._sendTimer -= dt;
    if (this._sendTimer > 0) return;
    this._sendTimer = 0.08;
    this._send({
      type: 'state',
      x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2),
      facing: +player.facing.toFixed(2), state: player.state,
      hp: Math.round(player.stats.hp), level: player.stats.level,
    });
  }

  sendChat(text) {
    if (this.connected) this._send({ type: 'chat', text });
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  // Smoothly interpolate remote players each frame.
  update(dt) {
    for (const id in this.others) {
      const o = this.others[id];
      const prev = o.pos.clone();
      o.pos.lerp(o.target, Math.min(1, dt * 10));
      o.pos.y = heightAt(o.pos.x, o.pos.z) > o.pos.y - 2 ? o.pos.y : o.pos.y;
      o.mesh.position.copy(o.pos);
      const moved = prev.distanceTo(o.pos);
      o._speed01 = THREE.MathUtils.clamp(moved / dt / 8, 0, 1);

      let diff = o.targetFacing - o.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      o.facing += diff * Math.min(1, dt * 10);
      o.mesh.rotation.y = o.facing;
      animateStickman(o.mesh, dt, { speed01: o._speed01, climbing: o.state === 'climb' });
    }
  }

  get count() { return 1 + Object.keys(this.others).length; }
}
