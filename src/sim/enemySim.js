// ============================================================
// Authoritative enemy simulation — NO Three.js, NO DOM. Runs on the
// multiplayer server. It spawns the world's enemies, runs their AI only
// near connected players (area-of-interest), and produces:
//   • compact per-tick snapshots of the active enemies (streamed to clients)
//   • combat events (melee hits, ranged shots) routed to the targeted client
//   • death/respawn outcomes (with XP) when a client lands a killing hit
//
// Player HP stays client-authoritative (each client applies its own damage),
// so this layer only owns the ENEMIES — their positions, HP, deaths, and
// loot rolls. That keeps player-feel responsive while making encounters shared.
// ============================================================
import { heightAt, TOWNS, AREAS, CAMPS, BOSSES } from './terrain.js';
import { TYPES, TYPE_BY_LEVEL, DRAGON_ROOST, deriveStats } from './enemyTypes.js';

const ACTIVE_R = 145;              // area-of-interest radius (≳ client's 130)
const ACTIVE2 = ACTIVE_R * ACTIVE_R;

function inSafeZone(x, z) {
  for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.radius) return t;
  return null;
}

let SIM_ID = 1;

class SimEnemy {
  constructor(typeId, level, home, opts = {}) {
    this.id = SIM_ID++;
    this.typeId = typeId;
    this.type = TYPES[typeId] || TYPES.grunt;
    this.level = level;
    this.boss = !!opts.boss; this.elite = !!opts.elite;
    this.bossName = opts.bossName || null;
    this.campId = opts.campId || null;

    const st = deriveStats(typeId, level, opts);
    this.maxHp = st.maxHp; this.hp = this.maxHp;
    this.dmg = st.dmg; this.xp = st.xp; this.displayScale = st.displayScale;

    this.ranged = !!this.type.ranged;
    this.shootRange = this.type.shootRange || this.type.range;
    this.flying = !!this.type.fly;
    this.flyHeight = this.flying ? 9 : 0;

    this.home = { x: home.x, z: home.z };
    this.x = home.x; this.z = home.z;
    this.y = heightAt(this.x, this.z) + this.flyHeight;
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.alive = true;
    this.respawnTimer = 0;
    this.attackTimer = 0;
    this.wanderTarget = this._randomNear(this.home, 7);
  }

  _randomNear(c, r) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    return { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
  }

  // Advance one tick. `players` = [{id,x,y,z,alive}]. Returns a combat event
  // ({hit} or {shot}) or null.
  update(dt, players) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this._respawn();
      return null;
    }

    // Acquire the nearest living player (flyers judge by ground distance).
    let target = null, best = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.x - this.x, dz = p.z - this.z;
      const d = this.flying ? Math.hypot(dx, dz) : Math.hypot(dx, dz, (p.y || 0) - this.y);
      if (d < best) { best = d; target = p; }
    }
    const dist = best;
    const engage = this.ranged ? this.shootRange : this.type.range;
    if (target && dist < this.type.aggro) this.state = dist <= engage ? 'attack' : 'chase';
    else if (this.state !== 'idle' && dist > this.type.aggro * 1.4) this.state = 'return';

    let mvx = 0, mvz = 0, ev = null;
    if (this.state === 'chase' && target) {
      const dx = target.x - this.x, dz = target.z - this.z, l = Math.hypot(dx, dz) || 1;
      mvx = dx / l; mvz = dz / l;
    } else if (this.state === 'attack' && target) {
      this.facing = Math.atan2(target.x - this.x, target.z - this.z);
      if (this.ranged) {
        if (dist < this.shootRange * 0.55) {
          const dx = target.x - this.x, dz = target.z - this.z, l = Math.hypot(dx, dz) || 1;
          mvx = -dx / l; mvz = -dz / l;                    // kite away
        }
        if (this.attackTimer <= 0) {
          this.attackTimer = 1.9 + Math.random() * 0.6;
          const fx = this.x, fy = this.y + (this.flying ? Math.max(0.6, this.flyHeight * 0.4) : 1.1), fz = this.z;
          ev = { shot: {
            enemyId: this.id, x: +fx.toFixed(2), y: +fy.toFixed(2), z: +fz.toFixed(2),
            targetId: target.id, tx: +target.x.toFixed(2), ty: +((target.y || 0) + 1).toFixed(2), tz: +target.z.toFixed(2),
            speed: this.type.projSpeed || 15, color: this.type.projColor || 0xffaa44,
            dmg: Math.round(this.dmg), range: this.shootRange + 8,
          } };
        }
      } else if (this.attackTimer <= 0) {
        this.attackTimer = 1.6;
        if (dist <= this.type.range + 0.8) ev = { hit: { playerId: target.id, dmg: Math.round(this.dmg), enemyId: this.id } };
      }
    } else if (this.state === 'return') {
      const dx = this.home.x - this.x, dz = this.home.z - this.z, l = Math.hypot(dx, dz);
      if (l < 1.5) { this.state = 'idle'; this.wanderTarget = this._randomNear(this.home, 6); }
      else { mvx = dx / l; mvz = dz / l; }
    } else {
      const dx = this.wanderTarget.x - this.x, dz = this.wanderTarget.z - this.z, l = Math.hypot(dx, dz);
      if (l < 1) this.wanderTarget = this._randomNear(this.home, 7);
      else if (Math.random() < 0.9) { mvx = dx / l * 0.4; mvz = dz / l * 0.4; }
    }

    const speed = this.type.speed;
    if (mvx || mvz) { this.x += mvx * speed * dt; this.z += mvz * speed * dt; this.facing = Math.atan2(mvx, mvz); }

    const tz = inSafeZone(this.x, this.z); // keep monsters out of towns
    if (tz) { const ax = this.x - tz.x, az = this.z - tz.z, l = Math.hypot(ax, az) || 1; this.x = tz.x + ax / l * tz.radius; this.z = tz.z + az / l * tz.radius; }

    if (this.flying) {
      const t = this.ranged ? (this.state === 'idle' ? 9 : 6.5)
        : (this.state === 'attack' ? 1.4 : this.state === 'chase' ? 4.5 : 9);
      this.flyHeight += (t - this.flyHeight) * Math.min(1, dt * 3);
      this.y = heightAt(this.x, this.z) + this.flyHeight;
    } else {
      this.y = heightAt(this.x, this.z);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;
    return ev;
  }

  applyDamage(amount) {
    if (!this.alive) return null;
    this.hp -= Math.max(1, Math.round(amount));
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      this.respawnTimer = this.boss ? 90 : 18 + Math.random() * 10;
      return { killed: true };
    }
    return { killed: false };
  }

  _respawn() {
    this.hp = this.maxHp; this.alive = true;
    this.x = this.home.x; this.z = this.home.z;
    this.y = heightAt(this.x, this.z) + this.flyHeight;
    this.state = 'idle'; this.attackTimer = 0;
  }

  // Compact wire snapshot (short keys to keep the stream small).
  snapshot() {
    const s = {
      id: this.id, t: this.typeId, lv: this.level,
      x: +this.x.toFixed(2), y: +this.y.toFixed(2), z: +this.z.toFixed(2),
      f: +this.facing.toFixed(2), hp: Math.round(this.hp), mhp: this.maxHp,
      st: this.alive ? this.state : 'dead', sc: +this.displayScale.toFixed(2),
    };
    if (this.boss) { s.b = 1; s.nm = this.bossName; }
    if (this.elite) s.e = 1;
    return s;
  }
}

export class WorldSim {
  constructor() {
    this.enemies = [];
    this.byId = new Map();
    this._spawn();
  }

  _add(e) { this.enemies.push(e); this.byId.set(e.id, e); return e; }

  _spawn() {
    // Overworld zones (the named, non-safe areas) — packs + a couple of flyers.
    for (const a of AREAS) {
      if (a.safe) continue;
      const radius = a.r * 0.95, count = a.count || 9, pool = TYPE_BY_LEVEL(a.level);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
        const home = { x: a.x + Math.cos(ang) * d, z: a.z + Math.sin(ang) * d };
        const typeId = pool[Math.floor(Math.random() * pool.length)];
        this._add(new SimEnemy(typeId, a.level + Math.floor(Math.random() * 2), home));
      }
      const n = a.level >= 10 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
        const home = { x: a.x + Math.cos(ang) * d, z: a.z + Math.sin(ang) * d };
        const type = (i === 0 && a.level >= 4) ? 'gargoyle' : 'wraith';
        this._add(new SimEnemy(type, a.level + Math.floor(Math.random() * 2), home));
      }
    }
    // Elite war-camp packs.
    for (const c of CAMPS) {
      const pool = TYPE_BY_LEVEL(c.level + 2);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const home = { x: c.x + Math.cos(ang) * 5, z: c.z + Math.sin(ang) * 5 };
        const typeId = pool[Math.floor(Math.random() * pool.length)];
        this._add(new SimEnemy(typeId, c.level + 2, home, { elite: true, campId: c.id }));
      }
    }
    // Named world bosses (one per biome high area).
    for (const b of BOSSES) this._add(new SimEnemy(b.type, b.level, { x: b.x, z: b.z }, { boss: true, bossName: b.name }));
    // The end-boss dragon at its roost (always present in the shared world).
    this._add(new SimEnemy('dragon', 24, { x: DRAGON_ROOST.x, z: DRAGON_ROOST.z }, { boss: true, bossName: 'Vetharion, the Sky-Tyrant' }));
  }

  // Advance the world. `players` = [{id,x,y,z,alive}]. Returns the active
  // enemy snapshots (those near some player) and any combat events this tick.
  tick(dt, players) {
    const active = [], events = [];
    for (const e of this.enemies) {
      let near = false;
      for (const p of players) {
        const dx = p.x - e.x, dz = p.z - e.z;
        if (dx * dx + dz * dz < ACTIVE2) { near = true; break; }
      }
      if (!near) continue;
      const ev = e.update(dt, players);
      if (ev) { if (ev.hit) events.push({ kind: 'hit', ...ev.hit }); if (ev.shot) events.push({ kind: 'shot', ...ev.shot }); }
      active.push(e.snapshot());
    }
    return { active, events };
  }

  // Apply a client's hit to an enemy. Returns a death descriptor or {killed:false}.
  damage(enemyId, amount) {
    const e = this.byId.get(enemyId);
    if (!e || !e.alive) return null;
    const r = e.applyDamage(amount);
    if (!r) return null;
    return {
      enemyId, killed: r.killed, hp: Math.round(e.hp),
      xp: e.xp, level: e.level, typeId: e.typeId, elite: e.elite, boss: e.boss,
      x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2),
    };
  }
}
