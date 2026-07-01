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
    this.party = [];            // member records {id,name,...} (incl. self)
    this.partyInvite = null;    // pending {fromId, fromName}
    this.onParty = null;        // () => void, fired on party change
    this.onPartyInvite = null;  // (fromName) => void
    this.onPartyXp = null;      // (amount, fromName) => void, shared kill XP
    this.onPartyLoot = null;    // (item, fromName) => void, notable partymate loot
    this._sendTimer = 0;
  }

  // Normalise a user-entered server address into a usable WebSocket URL.
  // Accepts bare hosts ("play.example.com" / "1.2.3.4:8080") and, crucially,
  // upgrades ws:// → wss:// when the page itself is served over HTTPS — browsers
  // block insecure ws:// from an https:// page (mixed content), which is the #1
  // gotcha when connecting from the live GitHub Pages site.
  _normalizeUrl(url) {
    let u = url.trim();
    const pageSecure = typeof location !== 'undefined' && location.protocol === 'https:';
    if (!/^wss?:\/\//i.test(u)) u = (pageSecure ? 'wss://' : 'ws://') + u; // add scheme
    if (pageSecure && /^ws:\/\//i.test(u)) u = u.replace(/^ws:\/\//i, 'wss://'); // force secure
    return u;
  }

  // Attempt connection. selfInfo = { name, classId }. Resolves either way.
  // Keeps trying to reconnect if the link drops — important for hosts whose free
  // tier sleeps when idle (e.g. Render), so a wake-up or redeploy re-joins the
  // player automatically instead of stranding them in an empty world.
  connect(url, selfInfo) {
    this.selfInfo = selfInfo;
    if (!url) { this.ui.setServerStatus('offline', 'offline — solo play'); return; }
    this._url = this._normalizeUrl(url);
    this._wantConnect = true;
    this._reconnectDelay = 1000;
    this._everConnected = false;
    this._open();
  }

  _open() {
    if (!this._wantConnect) return;
    this.ui.setServerStatus('connecting', this._everConnected ? 'reconnecting…' : 'connecting…');
    try {
      this.ws = new WebSocket(this._url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectDelay = 1000; // reset backoff on success
      this.ui.setServerStatus('online', 'online');
      this.ui.log(this._everConnected ? 'Reconnected to server.' : 'Connected to server.', 'sys');
      this._everConnected = true;
      this._send({ type: 'join', name: this.selfInfo.name, classId: this.selfInfo.classId });
    };
    this.ws.onclose = () => {
      this.connected = false;
      this._clearOthers();
      this._scheduleReconnect();
    };
    this.ws.onerror = () => { /* an onclose follows, which handles reconnect */ };
    this.ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      this._handle(msg);
    };
  }

  // Retry with exponential backoff (capped), until we succeed or disconnect().
  _scheduleReconnect() {
    if (!this._wantConnect || this._reconnectTimer) {
      if (!this._wantConnect) this.ui.setServerStatus('offline', 'offline — solo play');
      return;
    }
    this.ui.setServerStatus('connecting', 'reconnecting…');
    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(15000, delay * 2);
    this._reconnectTimer = setTimeout(() => { this._reconnectTimer = null; this._open(); }, delay);
  }

  // Stop trying and close the link (e.g. leaving to the menu).
  disconnect() {
    this._wantConnect = false;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } }
    this.connected = false;
    this.ui.setServerStatus('offline', 'offline — solo play');
  }

  _handle(msg) {
    switch (msg.type) {
      case 'welcome':
        this.id = msg.id;
        (msg.players || []).forEach((p) => { if (p.id !== this.id) this._spawnOther(p); });
        // An authoritative server owns the enemies — tell the game to switch
        // from local enemy simulation to rendering the server's shared enemies.
        this.authoritative = !!msg.authoritative;
        if (this.authoritative && this.onAuthoritative) this.onAuthoritative();
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
      case 'party_invited':
        this.partyInvite = { fromId: msg.fromId, fromName: msg.fromName };
        if (this.onPartyInvite) this.onPartyInvite(msg.fromName);
        break;
      case 'party_update':
        this.party = msg.members || [];
        if (this.onParty) this.onParty();
        break;
      case 'party_xp':
        if (this.onPartyXp) this.onPartyXp(msg.amount || 0, msg.fromName || 'A partymate');
        break;
      case 'party_loot':
        if (this.onPartyLoot) this.onPartyLoot(msg.item || null, msg.fromName || 'A partymate');
        break;
      // ---- Authoritative enemies (synced encounters) ----
      case 'enemies':     if (this.onEnemies) this.onEnemies(msg.e || []); break;
      case 'enemy_hp':    if (this.onEnemyHp) this.onEnemyHp(msg.enemyId, msg.hp); break;
      case 'enemy_death': if (this.onEnemyDeath) this.onEnemyDeath(msg); break;
      case 'enemy_attack':if (this.onEnemyAttack) this.onEnemyAttack(msg.dmg, msg.enemyId); break;
      case 'enemy_shot':  if (this.onEnemyShot) this.onEnemyShot(msg.shot); break;
    }
  }

  // Report a hit on a server enemy; the server applies it and broadcasts the
  // resulting HP/death.
  sendEnemyHit(serverId, dmg) { this._send({ type: 'enemy_hit', enemyId: serverId, dmg }); }

  inviteByName(name) { this._send({ type: 'party_invite', targetName: name }); }
  acceptInvite() { if (this.partyInvite) { this._send({ type: 'party_accept', leaderId: this.partyInvite.fromId }); this.partyInvite = null; } }
  declineInvite() { this.partyInvite = null; }
  leaveParty() { this._send({ type: 'party_leave' }); this.party = []; if (this.onParty) this.onParty(); }

  // True only when actually grouped (party includes self + at least one other).
  inParty() { return this.connected && this.party.length > 1; }
  // Relay a share of kill XP / a notable loot drop to the rest of the party.
  sendPartyXp(amount) { if (this.inParty() && amount > 0) this._send({ type: 'party_xp', amount }); }
  sendPartyLoot(item) { if (this.inParty() && item) this._send({ type: 'party_loot', item }); }

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
    o.hp = msg.hp; o.level = msg.level;
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
