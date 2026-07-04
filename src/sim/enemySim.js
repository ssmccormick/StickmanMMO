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
import { heightAt, TOWNS, AREAS, CAMPS, BOSSES, WORLD_SIZE, WATER_LEVEL, hash2, biomeKeyAt } from './terrain.js';
import { TYPES, TYPE_BY_LEVEL, DRAGON_ROOST, deriveStats, specialsFor, typesForBiome } from './enemyTypes.js';

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

    // Telegraphed specials (shared defs with the client). Bosses use the shared
    // boss rotation and cycle it in order.
    this.specials = specialsFor(typeId, this.ranged, this.boss);
    this.specialCd = 2.5 + Math.random() * 3;
    this._specialIdx = 0;
    this.charge = null;
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
    if (this.specialCd > 0) this.specialCd -= dt;

    // A charged special in progress drives its own movement/telegraph/damage.
    if (this.charge) return this._updateCharge(dt, players);

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

    // Commit to a telegraphed special when ready and in range.
    if (this.specials.length && this.specialCd <= 0 && target && dist < this.type.aggro
        && (this.state === 'attack' || this.state === 'chase')) {
      const pick = this._pickSpecial(dist);
      if (pick) { this._startCharge(pick, target); return null; }
    }

    const evs = [];
    let mvx = 0, mvz = 0;
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
          evs.push({ shot: {
            enemyId: this.id, x: +fx.toFixed(2), y: +fy.toFixed(2), z: +fz.toFixed(2),
            targetId: target.id, tx: +target.x.toFixed(2), ty: +((target.y || 0) + 1).toFixed(2), tz: +target.z.toFixed(2),
            speed: this.type.projSpeed || 15, color: this.type.projColor || 0xffaa44,
            dmg: Math.round(this.dmg), range: this.shootRange + 8,
          } });
        }
      }
      // Melee mobs deal damage only through telegraphed specials — no plain poke.
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
    return evs.length ? evs : null;
  }

  // ---- Telegraphed specials (server-authoritative) ----
  _pickSpecial(dist) {
    const inRange = (s) => dist >= s.minR && dist <= s.maxR;
    if (this.boss) {
      for (let n = 0; n < this.specials.length; n++) {
        const idx = (this._specialIdx + n) % this.specials.length;
        const sp = this.specials[idx];
        if (inRange(sp)) { this._specialIdx = (idx + 1) % this.specials.length; return sp; }
      }
      return null;
    }
    const ready = this.specials.filter(inRange);
    return ready.length ? ready[(Math.random() * ready.length) | 0] : null;
  }
  _startCharge(sp, target) {
    const dx = target.x - this.x, dz = target.z - this.z, l = Math.hypot(dx, dz) || 1;
    this.charge = { sp, phase: 'w', t: 0, dur: sp.windup, dx: dx / l, dz: dz / l,
                    tx: target.x, tz: target.z, cx: this.x, cz: this.z, applied: false, execT: 0 };
    this.facing = Math.atan2(dx, dz);
  }
  _updateCharge(dt, players) {
    const c = this.charge, sp = c.sp;
    let evs = null;
    if (c.phase === 'w') {
      c.t += dt;
      if (c.t >= c.dur) { c.phase = 'e'; c.execT = 0; c.applied = false; }
    } else {
      c.execT += dt;
      evs = this._runExec(dt, c, players);
      if (c.execT >= sp.exec) {
        this.charge = null;
        this.specialCd = sp.cd[0] + Math.random() * (sp.cd[1] - sp.cd[0]);
        this.attackTimer = Math.max(this.attackTimer, 0.8);
      }
    }
    const tz = inSafeZone(this.x, this.z);
    if (tz) { const ax = this.x - tz.x, az = this.z - tz.z, l = Math.hypot(ax, az) || 1; this.x = tz.x + ax / l * tz.radius; this.z = tz.z + az / l * tz.radius; }
    if (this.flying) this.flyHeight += (1.3 - this.flyHeight) * Math.min(1, dt * 4); // swoop down to strike
    this.y = heightAt(this.x, this.z) + (this.flying ? this.flyHeight : 0);
    return evs;
  }
  _runExec(dt, c, players) {
    const sp = c.sp, out = [];
    const hit = (p) => out.push({ hit: { playerId: p.id, dmg: Math.round(this.dmg * sp.dmg), enemyId: this.id } });
    if (sp.shape === 'lane') {                    // dash / pounce / dash-stab
      this.x += c.dx * sp.dashSpeed * dt; this.z += c.dz * sp.dashSpeed * dt;
      if (!c.applied) for (const p of players) if (p.alive && Math.hypot(p.x - this.x, p.z - this.z) <= (sp.hitR || 1.4)) { hit(p); c.applied = true; }
    } else if (sp.shape === 'ring') {             // slam / jump
      let cx = c.tx, cz = c.tz;
      if (sp.id === 'jump') { this.x += (c.tx - this.x) * Math.min(1, dt * 7); this.z += (c.tz - this.z) * Math.min(1, dt * 7); cx = this.x; cz = this.z; }
      if (!c.applied && c.execT >= sp.exec * 0.72) { c.applied = true; for (const p of players) if (p.alive && Math.hypot(p.x - cx, p.z - cz) <= sp.aoe) hit(p); }
    } else if (sp.shape === 'multicone') {        // BOSS: fan of cones
      if (!c.applied) { c.applied = true;
        const base = Math.atan2(c.dx, c.dz), n = sp.cones || 3;
        for (const p of players) { if (!p.alive) continue; const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
          if (d > sp.range + 0.5) continue; const ang = Math.atan2(dx, dz);
          for (let i = 0; i < n; i++) { const ca = base + (i - (n - 1) / 2) * (sp.spread || 0.8);
            const diff = Math.abs(((ang - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (diff <= sp.arc / 2 + 0.15) { hit(p); break; } } } }
    } else if (sp.shape === 'shockwave') {        // BOSS: expanding ring, jump to avoid
      const r = (c.execT / sp.exec) * sp.waveMax;
      if (!c.applied) for (const p of players) { if (!p.alive) continue;
        const pd = Math.hypot(p.x - c.cx, p.z - c.cz);
        if (Math.abs(pd - r) <= sp.band && (p.y || 0) - heightAt(p.x, p.z) < 1.1) { hit(p); c.applied = true; } }
    } else if (sp.shape === 'nova') {             // BOSS: radial bullet-hell burst
      if (!c.applied) { c.applied = true; const n = sp.count || 16, rng = sp.range || 20;
        const fy = this.y + 1.2;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
          out.push({ shot: { enemyId: this.id, x: +this.x.toFixed(2), y: +fy.toFixed(2), z: +this.z.toFixed(2),
            targetId: 0, tx: +(this.x + sx * rng).toFixed(2), ty: +fy.toFixed(2), tz: +(this.z + sz * rng).toFixed(2),
            speed: sp.projSpeed || 12, color: sp.projColor || sp.color || 0xc07bff,
            dmg: Math.round(this.dmg * sp.dmg), range: rng } }); } }
    } else {                                       // arc: cleave / slash / massive cone
      if (!c.applied) { c.applied = true; for (const p of players) { if (!p.alive) continue; const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz); if (d <= sp.range + 0.5) { const diff = Math.abs(((Math.atan2(dx, dz) - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (diff <= sp.arc / 2 + 0.2) hit(p); } } }
    }
    return out.length ? out : null;
  }

  applyDamage(amount) {
    if (!this.alive) return null;
    this.hp -= Math.max(1, Math.round(amount));
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      this.charge = null;
      this.respawnTimer = this.boss ? 270 : 54 + Math.random() * 30; // tripled respawn
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
    // Charge telegraph state (so clients can render the wind-up bar + danger zone).
    if (this.charge) {
      const c = this.charge;
      s.cg = { s: c.sp.id, ph: c.phase, pr: c.phase === 'w' ? +Math.min(1, c.t / c.dur).toFixed(2) : 1,
               tx: +c.tx.toFixed(2), tz: +c.tz.toFixed(2), dx: +c.dx.toFixed(3), dz: +c.dz.toFixed(3) };
      s.st = 'attack';
    }
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
      const radius = a.r * 0.95, count = a.count || 9, pool = typesForBiome(a.biome);
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
      const pool = typesForBiome(biomeKeyAt(c.x, c.z));
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const home = { x: c.x + Math.cos(ang) * 5, z: c.z + Math.sin(ang) * 5 };
        const typeId = pool[Math.floor(Math.random() * pool.length)];
        this._add(new SimEnemy(typeId, c.level + 2, home, { elite: true, campId: c.id }));
      }
    }
    // Wild fill: scattered packs from the heartland out to the coast, themed to
    // whatever biome each lands in (mirrors the client's solo world).
    for (let i = 0; i < 80; i++) {
      const ang = hash2(i, 71) * Math.PI * 2;
      const rad = (0.14 + hash2(i, 73) * 0.70) * WORLD_SIZE;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (inSafeZone(x, z) || heightAt(x, z) < WATER_LEVEL + 0.5) continue;
      const level = Math.max(1, Math.round(2 + (rad / WORLD_SIZE) * 44));
      const pool = typesForBiome(biomeKeyAt(x, z));
      for (let k = 0; k < 8; k++) {
        const a2 = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 36;
        this._add(new SimEnemy(pool[Math.floor(Math.random() * pool.length)], level + Math.floor(Math.random() * 2), { x: x + Math.cos(a2) * d, z: z + Math.sin(a2) * d }));
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
      const evOut = e.update(dt, players); // may return one event or an array
      if (evOut) {
        const arr = Array.isArray(evOut) ? evOut : [evOut];
        for (const ev of arr) { if (ev.hit) events.push({ kind: 'hit', ...ev.hit }); if (ev.shot) events.push({ kind: 'shot', ...ev.shot }); }
      }
      // Only stream LIVING enemies. A dead one stops appearing in snapshots, so
      // clients remove the corpse (after its death animation) instead of leaving
      // it lying around for the whole respawn timer. Its death was already
      // announced via the enemy_death event.
      if (e.alive) active.push(e.snapshot());
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
