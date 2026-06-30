// ============================================================
// UI: the DOM overlay. Class-select screen, HUD vitals, hotbar
// with cooldowns, minimap, floating combat text, combat log,
// interaction prompts, target frame, death screen, and chat.
// ============================================================
import { CLASSES, CLASS_ORDER } from './classes.js';
import { Saves } from './save.js';
import { SLOTS, SLOT_LABEL, RARITY, itemTooltip, generateItem, buyPrice, sellPrice, makeConsumable } from './items.js';
import * as Quests from './quests.js';
import { TOWNS, AREAS } from './world.js';
import { CODEX, PROLOGUE, WORLD_NAME, ashboundEntry, TOWN_CHATTER } from './lore.js';
import { EMOTES } from './player.js';

const LORE_LINES = TOWN_CHATTER;

export class UI {
  constructor() {
    this.el = {
      start: document.getElementById('start-screen'),
      hud: document.getElementById('hud'),
      nameInput: document.getElementById('name-input'),
      classGrid: document.getElementById('class-grid'),
      classDetail: document.getElementById('class-detail'),
      enter: document.getElementById('enter-world'),
      serverInput: document.getElementById('server-input'),
      serverStatus: document.getElementById('server-status'),
      rosterView: document.getElementById('roster-view'),
      createView: document.getElementById('create-view'),
      rosterGrid: document.getElementById('roster-grid'),
      newCharBtn: document.getElementById('new-char-btn'),
      backRoster: document.getElementById('back-roster'),
      storageNote: document.getElementById('storage-note'),

      hpFill: document.getElementById('hp-fill'), hpText: document.getElementById('hp-text'),
      mpFill: document.getElementById('mp-fill'), mpText: document.getElementById('mp-text'),
      spFill: document.getElementById('sp-fill'), spText: document.getElementById('sp-text'),
      xpFill: document.getElementById('xp-fill'), xpText: document.getElementById('xp-text'),
      charName: document.getElementById('char-name'),
      charClass: document.getElementById('char-class'),
      charLevel: document.getElementById('char-level'),
      gold: document.getElementById('gold'),

      hotbar: document.getElementById('hotbar'),
      minimap: document.getElementById('minimap'),
      clockIcon: document.getElementById('clock-icon'),
      clockTime: document.getElementById('clock-time'),
      playerCount: document.getElementById('player-count'),
      targetFrame: document.getElementById('target-frame'),
      targetName: document.getElementById('target-name'),
      targetHpFill: document.getElementById('target-hp-fill'),
      log: document.getElementById('log'),
      prompt: document.getElementById('prompt'),
      floaters: document.getElementById('floaters'),
      death: document.getElementById('death-screen'),
      hint: document.getElementById('controls-hint'),
      crosshair: document.getElementById('crosshair'),
    };
    this.selectedClass = 'fighter';
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.project = null; // set by main: (Vector3) => {x,y,visible}
    this._buildClassGrid();
    this._chatActive = false;

    // Dynamically-added HUD pieces: active-buff bar + quest tracker.
    this.buffBar = document.createElement('div');
    this.buffBar.className = 'buffbar';
    this.el.hud.appendChild(this.buffBar);
    this.questTracker = document.createElement('div');
    this.questTracker.className = 'quest-tracker';
    this.el.hud.appendChild(this.questTracker);

    // Air/breath bar (shown only while swimming underwater).
    this.airBar = document.createElement('div');
    this.airBar.className = 'air-bar hidden';
    this.airBar.innerHTML = '🫧 <div class="air-track"><div class="air-fill"></div></div>';
    this.el.hud.appendChild(this.airBar);
    this.airFill = this.airBar.querySelector('.air-fill');

    // Ki gauge (saiyan hero class only): fills in battle; spend a full bar to
    // ascend a Super Saiyan form.
    this.kiBar = document.createElement('div');
    this.kiBar.className = 'ki-bar hidden';
    this.kiBar.innerHTML = '<span class="ki-label">⚡ KI</span><div class="ki-track"><div class="ki-fill"></div></div><span class="ki-form"></span>';
    this.el.hud.appendChild(this.kiBar);
    this.kiFill = this.kiBar.querySelector('.ki-fill');
    this.kiForm = this.kiBar.querySelector('.ki-form');

    // Cast bar (spells with a cast time): name + a filling progress bar.
    this.castBar = document.createElement('div');
    this.castBar.className = 'cast-bar hidden';
    this.castBar.innerHTML = '<span class="cast-name"></span><div class="cast-track"><div class="cast-fill"></div></div>';
    this.el.hud.appendChild(this.castBar);
    this.castName = this.castBar.querySelector('.cast-name');
    this.castFill = this.castBar.querySelector('.cast-fill');

    // Area name banner.
    this.areaBanner = document.createElement('div');
    this.areaBanner.className = 'area-banner hidden';
    this.el.hud.appendChild(this.areaBanner);

    // Boss health bar (top-center, shown only when fighting a boss).
    this.bossBar = document.createElement('div');
    this.bossBar.className = 'boss-bar hidden';
    this.bossBar.innerHTML = '<div class="bb-name"></div><div class="bb-track"><div class="bb-fill"></div></div>';
    this.el.hud.appendChild(this.bossBar);
    this.bbName = this.bossBar.querySelector('.bb-name');
    this.bbFill = this.bossBar.querySelector('.bb-fill');

    // Party frames + invite popup.
    this.partyFrames = document.createElement('div');
    this.partyFrames.className = 'party-frames hidden';
    this.el.hud.appendChild(this.partyFrames);
    this.partyInviteEl = document.createElement('div');
    this.partyInviteEl.className = 'party-invite hidden';
    this.el.hud.appendChild(this.partyInviteEl);
  }

  updatePartyFrames(player, network) {
    const members = network.party || [];
    if (members.length <= 1) { this.partyFrames.classList.add('hidden'); return; }
    this.partyFrames.classList.remove('hidden');
    this.partyFrames.innerHTML = '<div class="pf-title">Party</div>' + members.map((mrec) => {
      const isSelf = mrec.id === network.id;
      let name, lvl, hp, maxHp = null;
      if (isSelf) { name = player.name + ' (you)'; lvl = player.stats.level; hp = Math.round(player.stats.hp); maxHp = Math.round(player.effMaxHp); }
      else { const o = network.others[mrec.id]; name = mrec.name; lvl = (o && o.level) || mrec.level || 1; hp = (o && o.hp != null) ? o.hp : (mrec.hp || 0); }
      const body = maxHp
        ? `<div class="pf-bar"><div class="pf-fill" style="width:${Math.max(0, hp / maxHp * 100)}%"></div></div>`
        : `<div class="pf-hp">❤ ${hp}</div>`;
      return `<div class="pf"><div class="pf-top">${name} · Lv ${lvl}</div>${body}</div>`;
    }).join('');
  }

  showPartyInvite(fromName, onAccept, onDecline) {
    this.partyInviteEl.classList.remove('hidden');
    this.partyInviteEl.innerHTML = `<div class="pi-text"><b>${fromName}</b> invites you to a party</div><div class="pi-btns"><button class="pi-yes">Accept</button><button class="pi-no">Decline</button></div>`;
    this.partyInviteEl.querySelector('.pi-yes').onclick = () => { onAccept(); this.partyInviteEl.classList.add('hidden'); };
    this.partyInviteEl.querySelector('.pi-no').onclick = () => { onDecline(); this.partyInviteEl.classList.add('hidden'); };
  }

  updateBossBar(enemy) {
    if (!enemy || !enemy.alive) { this.bossBar.classList.add('hidden'); return; }
    this.bossBar.classList.remove('hidden');
    this.bbName.textContent = `☠ ${enemy.bossName || 'Boss'}  ·  Lv ${enemy.level}`;
    this.bbFill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
  }

  setWorld(world) { this._world = world; }

  _buildClassGrid() {
    this.el.classGrid.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      const card = document.createElement('div');
      card.className = 'class-card' + (id === this.selectedClass ? ' selected' : '') + (c.hero ? ' hero' : '');
      card.innerHTML = `${c.hero ? '<div class="hero-flag">HERO</div>' : ''}<div class="glyph">${c.glyph}</div><div class="cname">${c.name}</div><div class="ctag">${c.tag}</div>`;
      card.onclick = () => { this.selectedClass = id; this._buildClassGrid(); this._showClassDetail(id); };
      this.el.classGrid.appendChild(card);
    }
    this._showClassDetail(this.selectedClass);
  }

  _showClassDetail(id) {
    const c = CLASSES[id];
    const start = c.abilities[0];
    const learn = c.abilities.slice(1)
      .map((a) => `${a.glyph} ${a.name} <span style="opacity:.5">Lv${a.reqLevel}</span>`).join(' · ');
    this.el.classDetail.innerHTML = `
      ${c.desc}
      <div class="stats">
        <span><b>HP</b> ${c.base.hp}</span>
        <span><b>MP</b> ${c.base.mp}</span>
        <span><b>SP</b> ${c.base.sp}</span>
        <span><b>STR</b> ${c.base.str}</span>
        <span><b>DEX</b> ${c.base.dex}</span>
        <span><b>INT</b> ${c.base.int}</span>
        <span>Scales with <b>${c.primary.toUpperCase()}</b></span>
      </div>
      <div class="stats">Starts with: ${start.glyph} <b>${start.name}</b> — ${start.desc}</div>
      <div class="stats" style="opacity:.8">Learn as you level: ${learn}</div>`;
  }

  // Wire the start screen. Callbacks:
  //   onCreate({ name, classId, server })  — make a brand new character
  //   onContinue(save, server)             — load an existing save
  setupStart({ onCreate, onContinue }) {
    this._onCreate = onCreate;
    this._onContinue = onContinue;

    this.el.newCharBtn.onclick = () => this.showCreate();
    this.el.backRoster.onclick = () => this.showRoster();
    this.el.enter.onclick = () => {
      const name = (this.el.nameInput.value || 'Stickaeryn').slice(0, 16);
      onCreate({ name, classId: this.selectedClass, server: this._server() });
    };

    // Storage availability hint.
    if (!Saves.available()) {
      this.el.storageNote.textContent = '⚠ saves unavailable (private mode / blocked storage)';
    } else {
      this.el.storageNote.textContent = 'Progress saves when you rest at a bonfire.';
    }

    // Start on the roster if any characters exist, else jump to create.
    if (Saves.list().length > 0) this.showRoster();
    else this.showCreate();
  }

  _server() { return this.el.serverInput.value.trim(); }

  showRoster() {
    this.refreshRoster();
    this.el.rosterView.classList.remove('hidden');
    this.el.createView.classList.add('hidden');
  }

  showCreate() {
    // Hide the "back" button if there are no characters to go back to.
    this.el.backRoster.style.display = Saves.list().length ? 'inline-block' : 'none';
    this.el.createView.classList.remove('hidden');
    this.el.rosterView.classList.add('hidden');
  }

  refreshRoster() {
    const grid = this.el.rosterGrid;
    grid.innerHTML = '';
    const chars = Saves.list();
    if (!chars.length) {
      grid.innerHTML = '<div class="roster-empty">No saved characters yet — create one below.</div>';
      return;
    }
    for (const ch of chars) {
      const c = CLASSES[ch.classId] || CLASSES.fighter;
      const card = document.createElement('div');
      card.className = 'roster-card';
      card.innerHTML = `
        <div class="rc-glyph">${c.glyph}</div>
        <div class="rc-info">
          <div class="rc-name">${ch.name}</div>
          <div class="rc-meta">Lv ${ch.level} ${c.name}</div>
          <div class="rc-when">${this._ago(ch.lastPlayed)}</div>
        </div>
        <button class="rc-del" title="Delete character">✕</button>`;
      card.querySelector('.rc-del').onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete ${ch.name} (Lv ${ch.level} ${c.name})? This cannot be undone.`)) {
          Saves.remove(ch.id);
          this.refreshRoster();
          if (!Saves.list().length) this.showCreate();
        }
      };
      card.onclick = () => this._onContinue(ch, this._server());
      grid.appendChild(card);
    }
  }

  _ago(ts) {
    if (!ts) return 'new';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  enterWorld(player) {
    this.el.start.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.charName.textContent = player.name;
    this.el.charClass.textContent = CLASSES[player.classId].name;
    this.refreshHotbar(player);
  }

  // Rebuild the hotbar from the player's LEARNED abilities (called on
  // entry and whenever a new skill is learned / ranked up).
  refreshHotbar(player) {
    this.el.hotbar.innerHTML = '';
    const def = CLASSES[player.classId];
    const atk = document.createElement('div');
    atk.className = 'slot ready';
    atk.innerHTML = `<span class="key">LMB</span>${def.ranged ? '🏹' : '⚔️'}`;
    this.el.hotbar.appendChild(atk);
    this.slots = [];
    player.learned.forEach((l, i) => {
      const a = player.ability(i); // rank-scaled
      const pips = '★'.repeat(l.rank) + '·'.repeat(Math.max(0, 3 - l.rank));
      const s = document.createElement('div');
      s.className = 'slot ready';
      s.title = `${a.name} (Rank ${l.rank}) — ${a.desc}`;
      s.innerHTML = `<span class="key">${i + 1}</span>${a.glyph}` +
        `<span class="cost">${a.cost}${a.costType}</span>` +
        `<span class="rank">${pips}</span><div class="cd hidden"></div>`;
      this.el.hotbar.appendChild(s);
      this.slots.push({ el: s, cd: s.querySelector('.cd') });
    });
  }

  flashSlot(i) {
    const s = this.slots[i];
    if (!s) return;
    s.el.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 260 });
  }

  updateHud(player, playerCount) {
    const s = player.stats;
    this._bar(this.el.hpFill, this.el.hpText, s.hp, player.effMaxHp);
    this._bar(this.el.mpFill, this.el.mpText, s.mp, player.effMaxMp);
    this._bar(this.el.spFill, this.el.spText, s.sp, player.effMaxSp);
    this.el.charLevel.textContent = s.level;
    const xpPct = (s.xp / s.xpNext) * 100;
    this.el.xpFill.style.width = `${xpPct}%`;
    this.el.xpText.textContent = `XP ${Math.floor(s.xp)} / ${s.xpNext}`;
    this.el.gold.textContent = player.gold;
    this.el.playerCount.textContent = playerCount;

    // Air bar — only while it matters (underwater / recovering).
    if (player.air < player.maxAir - 0.01) {
      this.airBar.classList.remove('hidden');
      this.airFill.style.width = `${(player.air / player.maxAir) * 100}%`;
      this.airFill.style.background = player.air < player.maxAir * 0.3 ? '#ff5a5a' : '#5ac8ff';
    } else {
      this.airBar.classList.add('hidden');
    }

    // Ki gauge + Super Saiyan form (saiyan only).
    if (player.isSaiyan) {
      this.kiBar.classList.remove('hidden');
      this.kiFill.style.width = `${(player.ki / player.kiMax) * 100}%`;
      const ready = player.canAscend();
      this.kiBar.classList.toggle('ready', ready);
      this.kiBar.classList.toggle('ssj', player.ssjActive);
      if (player.ssjActive) {
        const rem = Math.max(0, Math.ceil(player.ssjUntil - player.clock));
        this.kiForm.textContent = `SSJ${player.ssjLevel} · ${rem}s`;
      } else {
        this.kiForm.textContent = ready ? 'ASCEND READY' : '';
      }
    } else if (!this.kiBar.classList.contains('hidden')) {
      this.kiBar.classList.add('hidden');
    }

    // Active consumable buffs with countdown.
    this.buffBar.innerHTML = player.timed.map((b) => {
      const rem = Math.max(0, Math.ceil(b.until - player.clock));
      return `<div class="buff" style="border-color:${b.color}">${b.glyph || '✨'}<b>${rem}s</b></div>`;
    }).join('');

    // Quest tracker (active/complete quests).
    const active = Object.keys(player.questLog)
      .filter((id) => { const st = Quests.statusOf(player, id); return st === 'active' || st === 'complete'; });
    this.questTracker.innerHTML = active.slice(0, 4).map((id) => {
      const q = Quests.QUESTS[id]; const pr = Quests.progressOf(player, id); const done = pr >= q.count;
      return `<div class="qt ${done ? 'done' : ''}">📜 ${q.title} <b>${pr}/${q.count}</b>${done ? ' ✓ turn in' : ''}</div>`;
    }).join('');

    // hotbar cooldowns
    if (this.slots) {
      this.slots.forEach((slot, i) => {
        const cd = player.cooldowns[i];
        if (cd > 0) {
          slot.cd.classList.remove('hidden');
          slot.cd.textContent = cd.toFixed(1);
          slot.el.classList.remove('ready');
        } else {
          slot.cd.classList.add('hidden');
          slot.el.classList.add('ready');
        }
      });
    }
  }

  _bar(fill, text, val, max) {
    fill.style.width = `${Math.max(0, (val / max) * 100)}%`;
    text.textContent = `${Math.max(0, Math.round(val))} / ${Math.round(max)}`;
  }

  // ---- Cast bar (charged spells) ----
  showCastBar(name, glyph) {
    this.castName.textContent = `${glyph || ''} ${name}`.trim();
    this.castFill.style.width = '0%';
    this.castBar.classList.remove('hidden');
  }
  setCastProgress(frac) {
    this.castFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
  hideCastBar() { this.castBar.classList.add('hidden'); }

  setTarget(enemy) {
    if (!enemy || !enemy.alive) { this.el.targetFrame.classList.add('hidden'); return; }
    this.el.targetFrame.classList.remove('hidden');
    this.el.targetName.textContent = `${enemy.type.name}  ·  Lv ${enemy.level}`;
    this.el.targetHpFill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
  }

  log(msg, cls = 'sys') {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = msg;
    this.el.log.prepend(d);
    while (this.el.log.children.length > 40) this.el.log.lastChild.remove();
  }

  floater(text, cls, worldPos) {
    if (!this.project) return;
    const p = this.project(worldPos);
    if (!p.visible) return;
    const d = document.createElement('div');
    d.className = `floater ${cls}`;
    d.textContent = text;
    d.style.left = `${p.x + (Math.random() * 30 - 15)}px`;
    d.style.top = `${p.y - 20}px`;
    this.el.floaters.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  showPrompt(html) {
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }
  hidePrompt() { this.el.prompt.classList.add('hidden'); }

  showDeath(show) { this.el.death.classList.toggle('hidden', !show); }

  levelUp(level) {
    this.log(`LEVEL UP! You are now level ${level}`, 'xp');
    const f = document.createElement('div');
    f.className = 'levelup-flash';
    f.textContent = `LEVEL ${level}!`;
    this.el.hud.appendChild(f);
    setTimeout(() => f.remove(), 2000);
  }

  // Roguelike level-up choice: pick one attribute boost and one skill
  // (learn a new ability or rank up an owned one). Pauses the game.
  showLevelUp(player, onDone) {
    this.levelModalOpen = true;
    // Release the pointer lock so the cursor is free to click the cards.
    if (document.exitPointerLock) document.exitPointerLock();
    const choices = player.getLevelChoices();
    let selAttr = null, selSkill = null;

    const wrap = document.createElement('div');
    wrap.className = 'levelup-modal';
    const skillEmpty = choices.skills.length === 0;

    const attrCards = choices.attrs.map((a, i) =>
      `<div class="lu-card" data-kind="attr" data-i="${i}"><div class="lu-name">${a.label}</div><div class="lu-desc">${a.desc}</div></div>`
    ).join('');
    const skillCards = skillEmpty
      ? `<div class="lu-empty">All skills learned & maxed — enjoy the extra attributes!</div>`
      : choices.skills.map((s, i) =>
        `<div class="lu-card" data-kind="skill" data-i="${i}">
           <div class="lu-glyph">${s.glyph}</div>
           <div class="lu-name">${s.type === 'learn' ? 'Learn' : `Upgrade →R${s.rank + 1}`}: ${s.name}</div>
           <div class="lu-desc">${s.desc}</div>
         </div>`).join('');

    wrap.innerHTML = `
      <div class="lu-panel">
        <div class="lu-title">LEVEL ${player.stats.level}</div>
        <div class="lu-sub">Choose an attribute to raise</div>
        <div class="lu-grid">${attrCards}</div>
        <div class="lu-sub">${skillEmpty ? 'Skills' : 'Learn or upgrade a skill'}</div>
        <div class="lu-grid skills">${skillCards}</div>
        <button class="lu-confirm" disabled>CONFIRM</button>
      </div>`;
    this.el.hud.appendChild(wrap);

    const confirmBtn = wrap.querySelector('.lu-confirm');
    const updateConfirm = () => {
      confirmBtn.disabled = !(selAttr !== null && (skillEmpty || selSkill !== null));
    };

    wrap.querySelectorAll('.lu-card').forEach((card) => {
      card.onclick = () => {
        const kind = card.dataset.kind, idx = +card.dataset.i;
        wrap.querySelectorAll(`.lu-card[data-kind="${kind}"]`).forEach((c) => c.classList.remove('sel'));
        card.classList.add('sel');
        if (kind === 'attr') selAttr = choices.attrs[idx].id;
        else selSkill = choices.skills[idx];
        updateConfirm();
      };
    });

    confirmBtn.onclick = () => {
      player.applyLevelChoice(selAttr, selSkill);
      this.refreshHotbar(player);
      wrap.remove();
      this.levelModalOpen = false;
      if (selSkill) {
        this.log(selSkill.type === 'learn' ? `Learned ${selSkill.name}!` : `Upgraded ${selSkill.name}!`, 'xp');
      }
      onDone();
    };
  }

  setServerStatus(state, label) {
    this.el.serverStatus.className = `server-status ${state}`;
    this.el.serverStatus.textContent = label;
  }

  toggleHint() { this.el.hint.classList.toggle('hidden'); }

  // ---- Minimap ----
  drawMinimap(player, enemies, world, others) {
    const ctx = this.minimapCtx;
    const W = 160, scale = 0.32;
    // Tint the minimap by time of day, and update the clock readout.
    const df = world.dayFactor != null ? world.dayFactor : 1;
    const lerp = (a, b) => Math.round(a + (b - a) * df);
    ctx.fillStyle = `rgb(${lerp(14, 46)},${lerp(18, 60)},${lerp(30, 44)})`;
    ctx.fillRect(0, 0, W, W);
    if (this.el.clockTime) {
      this.el.clockTime.textContent = world.clockText || '';
      this.el.clockIcon.textContent = world.isNight ? '🌙' : (df > 0.4 ? '☀️' : '🌅');
    }
    const cx = W / 2, cy = W / 2;
    const tx = (x) => cx + (x - player.pos.x) * scale;
    const ty = (z) => cy + (z - player.pos.z) * scale;

    // bonfires
    ctx.fillStyle = '#ff8a2a';
    for (const b of world.bonfires) {
      const x = tx(b.pos.x), y = ty(b.pos.z);
      if (x < 0 || x > W || y < 0 || y > W) continue;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    }
    // enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      const x = tx(e.pos.x), y = ty(e.pos.z);
      if (x < 0 || x > W || y < 0 || y > W) continue;
      ctx.fillStyle = e.state === 'chase' || e.state === 'attack' ? '#ff4444' : '#cc8844';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
    }
    // other players
    ctx.fillStyle = '#6fa4ef';
    for (const id in others) {
      const o = others[id];
      const x = tx(o.pos.x), y = ty(o.pos.z);
      if (x < 0 || x > W || y < 0 || y > W) continue;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
    }
    // player (always center) with facing
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-player.facing);
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // border ring
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 2, 0, 7); ctx.stroke();
  }

  // ---- Inventory & Equipment ----
  _ensureInv() {
    if (this.invOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel">
        <div class="inv-header"><span>🎒 Inventory &amp; Equipment</span><button class="inv-close">✕</button></div>
        <div class="inv-body">
          <div class="equip-col">
            <div class="equip-slots"></div>
            <div class="char-stats"></div>
          </div>
          <div class="bag-wrap">
            <div class="bag-title">Bag · <span style="opacity:.6">click to equip · right-click to drop</span></div>
            <div class="bag-grid"></div>
          </div>
        </div>
      </div>
      <div class="item-tip hidden"></div>`;
    document.body.appendChild(ov);
    this.invOverlay = ov;
    this.equipSlotsEl = ov.querySelector('.equip-slots');
    this.charStatsEl = ov.querySelector('.char-stats');
    this.bagGridEl = ov.querySelector('.bag-grid');
    this.itemTip = ov.querySelector('.item-tip');
    ov.querySelector('.inv-close').onclick = () => this.closeInventory();
    // Click the dark backdrop (outside the panel) to close.
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeInventory(); });
  }

  toggleInventory(player) {
    this._ensureInv();
    this._invPlayer = player;
    if (this.inventoryOpen) this.closeInventory();
    else {
      this.inventoryOpen = true;
      this.invOverlay.classList.remove('hidden');
      if (document.exitPointerLock) document.exitPointerLock();
      this.renderInventory();
    }
  }
  closeInventory() {
    this.inventoryOpen = false;
    if (this.invOverlay) this.invOverlay.classList.add('hidden');
    this._hideTip();
  }

  renderInventory() {
    const p = this._invPlayer;
    if (!p) return;

    // Equipment slots.
    this.equipSlotsEl.innerHTML = '';
    for (const slot of SLOTS) {
      const item = p.gear[slot];
      const cell = document.createElement('div');
      cell.className = 'equip-slot' + (item ? ` filled r-${item.rarity}` : '');
      cell.innerHTML = item
        ? `<div class="slot-glyph">${item.glyph}</div>`
        : `<div class="slot-empty">${SLOT_LABEL[slot]}</div>`;
      if (item) {
        this._tipFor(cell, item, p.stats.level);
        cell.onclick = () => {
          const r = p.unequip(slot);
          if (r.error === 'full') this.log('Bag is full.', 'sys');
          this.renderInventory();
        };
      }
      this.equipSlotsEl.appendChild(cell);
    }

    // Effective stats summary.
    const b = p.bonus;
    this.charStatsEl.innerHTML = `
      <div class="cs-title">${CLASSES[p.classId].name} · Lv ${p.stats.level}</div>
      <div class="cs-row"><span>STR</span><b>${p.effStr}</b></div>
      <div class="cs-row"><span>DEX</span><b>${p.effDex}</b></div>
      <div class="cs-row"><span>INT</span><b>${p.effInt}</b></div>
      <div class="cs-row"><span>Max HP</span><b>${p.effMaxHp}</b></div>
      <div class="cs-row"><span>Attack</span><b>${Math.round(p.apower)}</b></div>
      <div class="cs-row"><span>Armor</span><b>${p.gearArmor}</b></div>
      <div class="cs-row"><span>Crit</span><b>${Math.round((0.05 + p.gearCrit) * 100)}%</b></div>
      <div class="cs-row"><span>Move</span><b>+${Math.round(p.gearSpeed * 100)}%</b></div>
      ${p.gearLifesteal ? `<div class="cs-row"><span>Lifesteal</span><b>${Math.round(p.gearLifesteal * 100)}%</b></div>` : ''}
      <div class="cs-row"><span>💰 Gold</span><b>${p.gold}</b></div>`;

    // Bag grid.
    this.bagGridEl.innerHTML = '';
    for (let i = 0; i < p.maxInventory; i++) {
      const item = p.inventory[i];
      const cell = document.createElement('div');
      cell.className = 'bag-cell' + (item ? ` filled r-${item.rarity}` : '');
      if (item) {
        cell.innerHTML = `<div class="slot-glyph">${item.glyph}</div>`;
        // Compare against whatever is equipped in that slot.
        this._tipFor(cell, item, p.stats.level, item.type === 'consumable' ? null : p.gear[item.slot]);
        cell.onclick = () => {
          if (item.type === 'consumable') {
            const r = p.useConsumable(item.uid);
            if (r.heal != null) this.log(`Used ${item.name} (+${r.heal} HP).`, 'heal');
            else if (r.buff) this.log(`Used ${item.name}.`, 'xp');
            this._hideTip();
          } else {
            const r = p.equipFromInventory(item.uid);
            if (r.error === 'level') this.log(`Requires level ${item.reqLevel}.`, 'sys');
          }
          this.renderInventory();
        };
        // Right-click to drop/destroy.
        cell.oncontextmenu = (e) => {
          e.preventDefault();
          p.dropItem(item.uid);
          this.log(`Dropped ${item.name}.`, 'sys');
          this._hideTip();
          this.renderInventory();
        };
      }
      this.bagGridEl.appendChild(cell);
    }
  }

  _tipFor(el, item, level, equipped) {
    el.onmouseenter = () => {
      this.itemTip.innerHTML = itemTooltip(item, level, equipped);
      this.itemTip.style.borderColor = RARITY[item.rarity].color;
      this.itemTip.classList.remove('hidden');
    };
    el.onmousemove = (e) => {
      this.itemTip.style.left = Math.min(e.clientX + 16, window.innerWidth - 240) + 'px';
      this.itemTip.style.top = (e.clientY + 16) + 'px';
    };
    el.onmouseleave = () => this._hideTip();
  }
  _hideTip() { if (this.itemTip) this.itemTip.classList.add('hidden'); }

  // ---- Skills window ----
  _ensureSkills() {
    if (this.skillsOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel skills-panel">
        <div class="inv-header"><span>📖 Skills</span><button class="inv-close">✕</button></div>
        <div class="skills-note"></div>
        <div class="skills-body"></div>
      </div>`;
    document.body.appendChild(ov);
    this.skillsOverlay = ov;
    this.skillsBody = ov.querySelector('.skills-body');
    this.skillsNote = ov.querySelector('.skills-note');
    ov.querySelector('.inv-close').onclick = () => this.closeSkills();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeSkills(); });
  }
  toggleSkills(player) {
    this._ensureSkills();
    this._skillsPlayer = player;
    if (this.skillsOpen) this.closeSkills();
    else {
      this.skillsOpen = true;
      this.skillsOverlay.classList.remove('hidden');
      if (document.exitPointerLock) document.exitPointerLock();
      this.renderSkills(player);
    }
  }
  closeSkills() { this.skillsOpen = false; if (this.skillsOverlay) this.skillsOverlay.classList.add('hidden'); }

  renderSkills(player) {
    const def = CLASSES[player.classId];
    const owned = new Set(player.learned.map((l) => l.id));
    this.skillsNote.innerHTML = `Your attack power is <b>${Math.round(player.apower)}</b> — damage values below scale with it (and your gear).`;

    let html = '';
    player.learned.forEach((l, i) => {
      const ab = player.ability(i);
      const pips = '★'.repeat(l.rank) + '·'.repeat(Math.max(0, 3 - l.rank));
      const meta = `Key ${i + 1} · ${ab.cost} ${ab.costType.toUpperCase()} · ${ab.cooldown}s CD${this._rangeStr(ab)}`;
      const stats = this._abilityLines(player, ab)
        .map(([k, v]) => `<div class="sk-stat"><span>${k}</span><b>${v}</b></div>`).join('');
      html += `
        <div class="sk-card">
          <div class="sk-head"><span class="sk-glyph">${ab.glyph}</span>
            <div><div class="sk-name">${ab.name} <span class="sk-pips">${pips}</span></div>
            <div class="sk-meta">${meta}</div></div></div>
          <div class="sk-desc">${ab.desc}</div>
          <div class="sk-stats">${stats}</div>
        </div>`;
    });
    // Not-yet-learned abilities, shown locked.
    def.abilities.filter((a) => !owned.has(a.id)).forEach((a) => {
      const ready = player.stats.level >= a.reqLevel;
      html += `
        <div class="sk-card locked">
          <div class="sk-head"><span class="sk-glyph">${a.glyph}</span>
            <div><div class="sk-name">${a.name}</div>
            <div class="sk-meta">🔒 ${ready ? 'Available at your next level-up' : `Unlocks at level ${a.reqLevel}`}</div></div></div>
          <div class="sk-desc">${a.desc}</div>
        </div>`;
    });
    this.skillsBody.innerHTML = html;
  }

  _rangeStr(ab) {
    if (ab.kind === 'melee') return ` · ${ab.range}yd arc`;
    if (ab.kind === 'heal' || ab.kind === 'buff') return '';
    if (ab.radius) return ` · ${ab.radius}yd radius`;
    if (ab.range) return ` · ${ab.range}yd`;
    return '';
  }

  // Human-readable, value-accurate damage/effect lines for a skill.
  _abilityLines(player, ab) {
    const ap = player.apower;
    const hit = (m) => Math.round(ap * m);
    const pct = (v) => `${Math.round(v * 100)}%`;
    const L = [];
    switch (ab.kind) {
      case 'melee':
      case 'dash':
        if (ab.mult > 0) L.push(['Damage', `~${hit(ab.mult)}${ab.arc > 1.5 ? ' each' : ''}`]);
        if (ab.stun) L.push(['Stun', `${ab.stun}s`]);
        if (ab.crit) L.push(['Bonus crit', `+${pct(ab.crit)}`]);
        if (ab.execute) L.push(['Execute', '+80% vs low HP']);
        if (ab.iframes) L.push(['Invuln', `${ab.iframes}s`]);
        break;
      case 'projectile': {
        const per = hit(ab.mult);
        L.push(['Damage', ab.count > 1 ? `~${per} ×${ab.count} (${per * ab.count} total)` : `~${per}`]);
        if (ab.aoe) L.push(['Splash', `${ab.aoe}yd`]);
        if (ab.pierce) L.push(['Pierce', 'all in path']);
        if (ab.stunOnHit) L.push(['Stun', `${ab.stunOnHit}s`]);
        break;
      }
      case 'groundaoe':
        L.push(['Damage', `~${hit(ab.mult)}`]);
        L.push(['Radius', `${ab.aoe}yd`]);
        L.push(['Delay', `${ab.delay}s`]);
        break;
      case 'chain':
        L.push(['Damage', `~${hit(ab.mult)}`]);
        L.push(['Jumps', `${ab.jumps}`]);
        break;
      case 'dot':
        L.push(['Damage', `${ab.dotDps}/s for ${ab.dotDur}s`]);
        L.push(['Total', `~${Math.round(ab.dotDps * ab.dotDur)}`]);
        L.push(['Radius', `${ab.radius}yd`]);
        break;
      case 'lifesteal':
        L.push(['Damage', `~${hit(ab.mult)}`]);
        L.push(['Heal', `${pct(ab.leech)} of damage`]);
        break;
      case 'heal':
        L.push(['Heal', `~${Math.round(player.effMaxHp * ab.amount)} (${pct(ab.amount)} HP)`]);
        break;
      case 'buff':
        if (ab.buff && ab.buff.dmg) L.push(['Damage', `+${Math.round((ab.buff.dmg - 1) * 100)}% / ${ab.buff.dur}s`]);
        if (ab.buff && ab.buff.speed) L.push(['Speed', `+${Math.round((ab.buff.speed - 1) * 100)}%`]);
        if (ab.buff && ab.buff.shield) L.push(['Shield', `${pct(ab.buff.shield)} absorb / ${ab.buff.dur}s`]);
        if (ab.selfHeal) L.push(['Heal', `${pct(ab.selfHeal)} HP`]);
        if (ab.nova) {
          if (ab.nova.mult) L.push(['Nova dmg', `~${hit(ab.nova.mult)}`]);
          if (ab.nova.slow) L.push(['Slow', `${ab.nova.slow}s`]);
          if (ab.nova.fear) L.push(['Fear', `${ab.nova.fear}s`]);
          L.push(['Radius', `${ab.nova.radius}yd`]);
        }
        break;
      case 'summon':
        L.push(['Duration', `${ab.dur}s`]);
        L.push(['Hit', `~${hit(ab.mult)} / ${ab.atkEvery}s`]);
        break;
    }
    return L;
  }

  // ---- Vendor / merchant ----
  _ensureVendor() {
    if (this.vendorOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel vendor-panel">
        <div class="inv-header"><span>🛒 <span class="vendor-title">Merchant</span> <span class="vendor-gold"></span></span><button class="inv-close">✕</button></div>
        <div class="vendor-body">
          <div class="vendor-col">
            <div class="bag-title">Buy</div>
            <div class="vendor-buy"></div>
          </div>
          <div class="vendor-col">
            <div class="bag-title">Sell <span style="opacity:.6">(your bag)</span></div>
            <div class="vendor-sell"></div>
          </div>
        </div>
      </div>
      <div class="item-tip hidden"></div>`;
    document.body.appendChild(ov);
    this.vendorOverlay = ov;
    this.vendorBuyEl = ov.querySelector('.vendor-buy');
    this.vendorSellEl = ov.querySelector('.vendor-sell');
    this.vendorGoldEl = ov.querySelector('.vendor-gold');
    this.vendorTitleEl = ov.querySelector('.vendor-title');
    this.vendorTip = ov.querySelector('.item-tip');
    ov.querySelector('.inv-close').onclick = () => this.closeVendor();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeVendor(); });
  }

  openVendor(player, vendor) {
    this._ensureVendor();
    this._vendorPlayer = player;
    this._vendorInfo = vendor || { label: 'Trader', type: 'general' };
    this._vendorStock = this._genStock(this._vendorInfo.type, player.stats.level);
    this.vendorOpen = true;
    this.vendorOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.renderVendor();
  }

  // Stock list filtered by merchant type.
  _genStock(type, lvl) {
    const stock = [];
    const gear = (slot, n, boost = 0.45) => { for (let i = 0; i < n; i++) stock.push(generateItem({ slot, level: Math.max(1, lvl + (i % 3) - 1), rarityBoost: boost })); };
    if (type === 'alchemist') {
      for (const id of ['hp_minor', 'hp_major', 'buff_swift', 'buff_power', 'buff_might', 'hp_minor', 'hp_major']) stock.push(makeConsumable(id));
    } else if (type === 'weapon') {
      gear('weapon', 8, 0.55);
    } else if (type === 'armor') {
      for (const s of ['head', 'chest', 'hands', 'feet']) gear(s, 2, 0.55);
    } else if (type === 'general') {
      gear('ring', 3); gear('amulet', 3);
      for (const id of ['hp_minor', 'hp_major']) stock.push(makeConsumable(id));
    } else {
      gear('weapon', 2); for (const s of ['head', 'chest']) gear(s, 2);
    }
    return stock;
  }
  closeVendor() {
    this.vendorOpen = false;
    if (this.vendorOverlay) this.vendorOverlay.classList.add('hidden');
    if (this.vendorTip) this.vendorTip.classList.add('hidden');
  }

  renderVendor() {
    const p = this._vendorPlayer;
    if (!p) return;
    if (this.vendorTitleEl) this.vendorTitleEl.textContent = (this._vendorInfo && this._vendorInfo.label) || 'Merchant';
    this.vendorGoldEl.textContent = `💰 ${p.gold}`;

    // Buy list.
    this.vendorBuyEl.innerHTML = '';
    this._vendorStock.forEach((item, i) => {
      const price = buyPrice(item);
      const row = this._vendorRow(item, price, p, p.gold >= price ? 'Buy' : 'Need 💰');
      row.onclick = () => {
        if (p.gold < price) { this.log('Not enough gold.', 'sys'); return; }
        if (p.inventory.length >= p.maxInventory) { this.log('Bag is full.', 'sys'); return; }
        p.gold -= price; p.addItem(item);
        this._vendorStock.splice(i, 1);
        this.log(`Bought ${item.name} for ${price}g.`, 'xp');
        this.renderVendor();
      };
      this._tipForEl(row, item, p.stats.level, p.gear[item.slot], this.vendorTip);
      this.vendorBuyEl.appendChild(row);
    });
    if (!this._vendorStock.length) this.vendorBuyEl.innerHTML = '<div class="roster-empty">Sold out — come back later.</div>';

    // Sell list (bag).
    this.vendorSellEl.innerHTML = '';
    p.inventory.forEach((item) => {
      const price = sellPrice(item);
      const row = this._vendorRow(item, price, p, 'Sell');
      row.onclick = () => {
        p.gold += price; p.dropItem(item.uid);
        this.log(`Sold ${item.name} for ${price}g.`, 'xp');
        this.renderVendor();
      };
      this._tipForEl(row, item, p.stats.level, p.gear[item.slot], this.vendorTip);
      this.vendorSellEl.appendChild(row);
    });
    if (!p.inventory.length) this.vendorSellEl.innerHTML = '<div class="roster-empty">Your bag is empty.</div>';
  }

  _vendorRow(item, price, p, action) {
    const rar = RARITY[item.rarity];
    const row = document.createElement('div');
    row.className = `vendor-row r-${item.rarity}`;
    const meta = item.type === 'consumable' ? 'Consumable' : `${rar.name} ${SLOT_LABEL[item.slot]} · ilvl ${item.ilvl}`;
    row.innerHTML = `
      <div class="vr-glyph">${item.glyph}</div>
      <div class="vr-info">
        <div class="vr-name" style="color:${rar.color}">${item.name}</div>
        <div class="vr-meta">${meta}</div>
      </div>
      <div class="vr-price">💰 ${price}<span class="vr-act">${action}</span></div>`;
    return row;
  }

  // Tooltip bound to a specific tip element (vendor uses its own).
  _tipForEl(el, item, level, equipped, tipEl) {
    el.addEventListener('mouseenter', () => {
      tipEl.innerHTML = itemTooltip(item, level, equipped);
      tipEl.style.borderColor = RARITY[item.rarity].color;
      tipEl.classList.remove('hidden');
    });
    el.addEventListener('mousemove', (e) => {
      tipEl.style.left = Math.min(e.clientX + 16, window.innerWidth - 250) + 'px';
      tipEl.style.top = Math.min(e.clientY + 16, window.innerHeight - 200) + 'px';
    });
    el.addEventListener('mouseleave', () => tipEl.classList.add('hidden'));
  }

  // ---- Character sheet ----
  _ensureCharSheet() {
    if (this.csOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel skills-panel"><div class="inv-header"><span>🧍 Character</span><button class="inv-close">✕</button></div><div class="skills-body cs-sheet"></div></div>`;
    document.body.appendChild(ov);
    this.csOverlay = ov;
    this.csBody = ov.querySelector('.cs-sheet');
    ov.querySelector('.inv-close').onclick = () => this.closeCharSheet();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeCharSheet(); });
  }
  toggleCharSheet(player) {
    this._ensureCharSheet();
    if (this.charSheetOpen) this.closeCharSheet();
    else { this.charSheetOpen = true; this.csOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this.renderCharSheet(player); }
  }
  closeCharSheet() { this.charSheetOpen = false; if (this.csOverlay) this.csOverlay.classList.add('hidden'); }
  renderCharSheet(player) {
    const s = player.stats; const c = CLASSES[player.classId];
    const armor = player.gearArmor;
    const mit = armor > 0 ? Math.round(Math.min(0.75, armor / (armor + 60 + s.level * 8)) * 100) : 0;
    const attr = (label, eff, base) => `<div class="cs-row"><span>${label}</span><b>${eff}</b><span class="cs-base">(${base} base${eff - base ? ` +${eff - base}` : ''})</span></div>`;
    const der = (label, val) => `<div class="cs-row"><span>${label}</span><b>${val}</b></div>`;
    const sets = (player.activeSets || []).filter((x) => x.tiers.length);
    const setHtml = sets.length
      ? sets.map((x) => `<div class="cs-set" style="color:${x.color}">${x.name} — ${x.count} pieces (${x.tiers.map((t) => t + 'pc').join(', ')} active)</div>`).join('')
      : '<div class="cs-base">No set bonuses active</div>';
    const equip = SLOTS.map((sl) => {
      const it = player.gear[sl];
      const col = it ? (it.setId ? '#9be0ff' : RARITY[it.rarity].color) : '#777';
      return `<div class="cs-row"><span>${SLOT_LABEL[sl]}</span><b style="color:${col}">${it ? it.glyph + ' ' + it.name : '—'}</b></div>`;
    }).join('');

    this.csBody.innerHTML = `
      <div class="cs-grid">
        <div class="cs-col">
          <div class="cs-h">${player.name} · ${c.name} · Lv ${s.level}</div>
          <div class="cs-sub">Attributes</div>
          ${attr('STR', player.effStr, s.str)}
          ${attr('DEX', player.effDex, s.dex)}
          ${attr('INT', player.effInt, s.int)}
          <div class="cs-sub">Vitals</div>
          ${der('Max HP', Math.round(player.effMaxHp))}
          ${der('Max MP', Math.round(player.effMaxMp))}
          ${der('Max SP', Math.round(player.effMaxSp))}
        </div>
        <div class="cs-col">
          <div class="cs-sub">Combat</div>
          ${der('Attack Power', Math.round(player.apower))}
          ${der('Armor', `${armor} (${mit}% dmg reduced)`)}
          ${der('Crit Chance', `${Math.round((0.05 + player.gearCrit) * 100)}%`)}
          ${der('Lifesteal', `${Math.round(player.gearLifesteal * 100)}%`)}
          ${der('Move Speed', `+${Math.round(player.gearSpeed * 100)}%`)}
          ${der('🎣 Fishing', player.fishingStat)}
          ${der('💰 Gold', player.gold)}
          <div class="cs-sub">Set Bonuses</div>
          ${setHtml}
        </div>
      </div>
      <div class="cs-sub">Equipment</div>
      ${equip}`;
  }

  // ---- Quests ----
  _rewardText(r) {
    return [r.xp ? `${r.xp} XP` : null, r.gold ? `${r.gold} gold` : null,
      r.item ? 'a piece of gear' : null, r.potion ? `${r.potionCount || 1}× ${r.potion.startsWith('hp') ? 'potion' : 'elixir'}` : null]
      .filter(Boolean).join(' · ');
  }

  _ensureQuestDialog() {
    if (this.qdOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel quest-dialog"></div>`;
    document.body.appendChild(ov);
    this.qdOverlay = ov;
    this.qdEl = ov.querySelector('.quest-dialog');
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeQuestDialog(); });
  }

  openQuestDialog(player, gv) {
    this._ensureQuestDialog();
    this.questDialogOpen = true;
    if (document.exitPointerLock) document.exitPointerLock();
    const id = Quests.giverActiveQuest(player, gv.giver);

    // Render the dialog: a portrait header, a narrative line that types itself
    // out, and a footer (objective + reward + action) revealed once typing ends.
    const present = (title, narrative, objectiveHtml, rewardHtml, btnLabel, onAct) => {
      this.qdEl.innerHTML = `
        <div class="inv-header"><span>🗨️ ${gv.name}</span><button class="inv-close">✕</button></div>
        <div class="qd-body">
          ${title ? `<div class="qd-title">${title}</div>` : ''}
          <div class="qd-narrative"></div>
          <div class="qd-foot" style="display:none">
            ${objectiveHtml ? `<div class="qd-objective">${objectiveHtml}</div>` : ''}
            ${rewardHtml ? `<div class="qd-reward">${rewardHtml}</div>` : ''}
            <button class="qd-btn">${btnLabel}</button>
          </div>
          <div class="qd-hint">▸ click to continue</div>
        </div>`;
      this.qdOverlay.classList.remove('hidden');
      this.qdEl.querySelector('.inv-close').onclick = () => this.closeQuestDialog();
      const foot = this.qdEl.querySelector('.qd-foot');
      const hint = this.qdEl.querySelector('.qd-hint');
      const reveal = () => {
        hint.style.display = 'none';
        foot.style.display = '';
        this.qdEl.querySelector('.qd-btn').onclick = (e) => {
          e.stopPropagation();
          onAct(); this.closeQuestDialog(); this.refreshGiverMarkers(player);
        };
      };
      // Clicking the body fast-forwards the typewriter (and is a no-op after).
      this.qdEl.querySelector('.qd-body').onclick = () => this._skipTypewriter();
      this._startTypewriter(this.qdEl.querySelector('.qd-narrative'), '“' + narrative + '”', reveal);
    };

    if (!id) {
      present('', 'Nothing for you right now, Ashbound. Rest at the Ember, and come back when the world needs you again.', '', '', 'Farewell', () => {});
      return;
    }
    const q = Quests.QUESTS[id]; const st = Quests.statusOf(player, id);
    const reward = `Reward: <b>${this._rewardText(q.reward)}</b>`;
    if (st === 'available') {
      present(q.title, q.intro, `<span class="qd-task">Objective</span> ${q.desc}`, reward, 'Accept Quest',
        () => { Quests.accept(player, id); this.log(`Quest accepted: ${q.title}`, 'xp'); });
    } else if (st === 'active') {
      present(q.title, 'The deed isn\'t done yet. Come back when it is, Ashbound — the flame is waiting, and so am I.',
        `<span class="qd-task">Progress</span> <b>${Quests.progressOf(player, id)} / ${q.count}</b> — ${q.desc}`, reward, 'Close', () => {});
    } else if (st === 'complete') {
      present(q.title, q.outro, `<b style="color:#7be38a">✓ Objective complete!</b>`, reward, 'Turn In',
        () => {
          const out = Quests.turnIn(player, id);
          this.log(`Quest complete: ${q.title}! Reward: ${this._rewardText(q.reward)}`, 'xp');
          out.items.forEach((it) => this.log(`Received ${it.name}.`, 'xp'));
        });
    } else {
      present(q.title, 'Already done, and done well. The Emberheart remembers it, Ashbound. So do I.', '', '', 'Farewell', () => {});
    }
  }
  // Reveal `text` into `el` character by character; calls onComplete when done.
  // Long passages aren't slower overall — the per-tick step scales with length.
  _startTypewriter(el, text, onComplete) {
    if (this._twTimer) clearInterval(this._twTimer);
    this._twEl = el; this._twText = text; this._twOnComplete = onComplete; this._twDone = false;
    el.textContent = '';
    let i = 0;
    const step = Math.max(1, Math.round(text.length / 170));
    this._twTimer = setInterval(() => {
      i += step;
      if (i >= text.length) { el.textContent = text; this._finishTypewriter(); }
      else el.textContent = text.slice(0, i);
    }, 16);
  }
  _finishTypewriter() {
    if (this._twTimer) { clearInterval(this._twTimer); this._twTimer = null; }
    if (this._twDone) return;
    this._twDone = true;
    if (this._twEl) this._twEl.textContent = this._twText;
    const cb = this._twOnComplete; this._twOnComplete = null;
    if (cb) cb();
  }
  _skipTypewriter() { if (!this._twDone) this._finishTypewriter(); }
  closeQuestDialog() {
    this.questDialogOpen = false;
    if (this._twTimer) { clearInterval(this._twTimer); this._twTimer = null; }
    this._twDone = true; this._twOnComplete = null;
    if (this.qdOverlay) this.qdOverlay.classList.add('hidden');
  }

  // Refresh every giver's floating marker based on its active quest.
  refreshGiverMarkers(player) {
    if (!this._world) return;
    for (const gv of this._world.questGivers) {
      const id = Quests.giverActiveQuest(player, gv.giver);
      if (!id) { this._world.updateGiverMarker(gv, null); continue; }
      const st = Quests.statusOf(player, id);
      if (st === 'available') this._world.updateGiverMarker(gv, '!', '#ffd24a');
      else if (st === 'complete') this._world.updateGiverMarker(gv, '?', '#7be38a');
      else this._world.updateGiverMarker(gv, null); // active → no marker
    }
  }

  _ensureQuestLog() {
    if (this.qlOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel skills-panel"><div class="inv-header"><span>📜 Quest Log</span><button class="inv-close">✕</button></div><div class="skills-body ql-body"></div></div>`;
    document.body.appendChild(ov);
    this.qlOverlay = ov;
    this.qlBody = ov.querySelector('.ql-body');
    ov.querySelector('.inv-close').onclick = () => this.closeQuestLog();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeQuestLog(); });
  }
  toggleQuestLog(player) {
    this._ensureQuestLog();
    this._qlPlayer = player;
    if (this.questLogOpen) this.closeQuestLog();
    else { this.questLogOpen = true; this.qlOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this.renderQuestLog(player); }
  }
  closeQuestLog() { this.questLogOpen = false; if (this.qlOverlay) this.qlOverlay.classList.add('hidden'); }
  renderQuestLog(player) {
    const ids = Object.keys(player.questLog);
    if (!ids.length) { this.qlBody.innerHTML = '<div class="roster-empty">No quests yet. Look for villagers with a ❗ above them in town.</div>'; return; }
    this.qlBody.innerHTML = ids.map((id) => {
      const q = Quests.QUESTS[id]; if (!q) return '';
      const pr = Quests.progressOf(player, id); const st = Quests.statusOf(player, id);
      const tag = st === 'done' ? '<span style="color:#7be38a">✓ Completed</span>'
        : st === 'complete' ? '<span style="color:#ffd24a">Ready to turn in</span>'
        : `In progress — ${pr}/${q.count}`;
      return `<div class="sk-card">
        <div class="sk-name">${q.title} <span class="sk-meta">· ${q.giver}</span></div>
        <div class="sk-desc">${q.desc}</div>
        <div class="sk-meta">${tag} · Reward: ${this._rewardText(q.reward)}</div></div>`;
    }).join('');
  }

  // ---- Codex / Lore board (L) ----
  _ensureCodex() {
    if (this.cxOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel codex-panel">
      <div class="inv-header"><span>📖 Codex — ${WORLD_NAME}</span><button class="inv-close">✕</button></div>
      <div class="codex-body"><div class="codex-rail"></div><div class="codex-content"></div></div>
    </div>`;
    document.body.appendChild(ov);
    this.cxOverlay = ov;
    this.cxRail = ov.querySelector('.codex-rail');
    this.cxContent = ov.querySelector('.codex-content');
    ov.querySelector('.inv-close').onclick = () => this.closeCodex();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeCodex(); });
  }
  toggleCodex(player) {
    this._ensureCodex();
    this._cxPlayer = player;
    if (this.codexOpen) { this.closeCodex(); return; }
    this.codexOpen = true;
    this.cxOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.renderCodex();
  }
  closeCodex() { this.codexOpen = false; if (this.cxOverlay) this.cxOverlay.classList.add('hidden'); }
  _codexSections() {
    // Prologue first, then the codex; the personalized "You" entry is appended
    // into the Ashbound section so the player is written into the world.
    const sections = [{ id: 'prologue', title: 'Prologue', icon: '✦', entries: [{ title: `The World of ${WORLD_NAME}`, body: PROLOGUE }] }];
    for (const s of CODEX) {
      if (s.id === 'ashbound' && this._cxPlayer) sections.push({ ...s, entries: [...s.entries, ashboundEntry(this._cxPlayer)] });
      else sections.push(s);
    }
    return sections;
  }
  renderCodex() {
    const sections = this._codexSections();
    if (!sections.find((s) => s.id === this._cxSection)) this._cxSection = sections[0].id;
    this.cxRail.innerHTML = sections.map((s) =>
      `<button class="cx-tab ${s.id === this._cxSection ? 'active' : ''}" data-id="${s.id}">${s.icon} ${s.title}</button>`).join('');
    this.cxRail.querySelectorAll('.cx-tab').forEach((b) => { b.onclick = () => { this._cxSection = b.dataset.id; this.renderCodex(); }; });
    const sec = sections.find((s) => s.id === this._cxSection);
    this.cxContent.innerHTML = sec.entries.map((e) =>
      `<div class="cx-entry"><div class="cx-entry-title">${e.title}</div><div class="cx-entry-body">${this._loreToHtml(e.body)}</div></div>`).join('');
    this.cxContent.scrollTop = 0;
  }
  _loreToHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  // ---- Emotes (T) ----
  _ensureEmotes() {
    if (this.emOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel emote-panel"><div class="inv-header"><span>😀 Emotes</span><button class="inv-close">✕</button></div><div class="emote-grid"></div></div>`;
    document.body.appendChild(ov);
    this.emOverlay = ov;
    this.emGrid = ov.querySelector('.emote-grid');
    ov.querySelector('.inv-close').onclick = () => this.closeEmotes();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeEmotes(); });
  }
  toggleEmotes(player) {
    this._ensureEmotes();
    if (this.emotesOpen) { this.closeEmotes(); return; }
    this.emotesOpen = true;
    this.emOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.emGrid.innerHTML = EMOTES.map((e) => `<button class="emote-btn" data-id="${e.id}"><div class="emote-glyph">${e.glyph}</div><div>${e.name}</div></button>`).join('');
    this.emGrid.querySelectorAll('.emote-btn').forEach((b) => { b.onclick = () => {
      const e = player.doEmote(b.dataset.id);
      if (this.onEmote) this.onEmote(e);
      this.closeEmotes();
    }; });
  }
  closeEmotes() { this.emotesOpen = false; if (this.emOverlay) this.emOverlay.classList.add('hidden'); }
  updateEmoteBubble(player) {
    if (!this.emBubble) {
      const b = document.createElement('div'); b.className = 'emote-bubble hidden';
      (document.getElementById('floaters') || document.body).appendChild(b);
      this.emBubble = b;
    }
    const active = player && player.emote && player._clock < player.emote.until;
    if (!active || !this.project) { this.emBubble.classList.add('hidden'); return; }
    const head = player.pos.clone(); head.y += 1.4;
    const sp = this.project(head);
    if (!sp || !sp.visible) { this.emBubble.classList.add('hidden'); return; }
    this.emBubble.textContent = player.emote.glyph;
    this.emBubble.style.left = sp.x + 'px';
    this.emBubble.style.top = sp.y + 'px';
    this.emBubble.classList.remove('hidden');
  }

  // ---- Area banner ----
  showAreaBanner(area) {
    this.areaBanner.innerHTML = `<div class="ab-name">${area.name}</div><div class="ab-sub">${area.safe ? 'Safe Haven' : 'Recommended Level ' + area.level + '+'}</div>`;
    this.areaBanner.classList.remove('hidden', 'show');
    void this.areaBanner.offsetWidth;
    this.areaBanner.classList.add('show');
    clearTimeout(this._abT);
    this._abT = setTimeout(() => this.areaBanner.classList.add('hidden'), 3600);
  }

  // ---- NPC dialogue ----
  _ensureDialogue() {
    if (this.dlgOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel quest-dialog"><div class="inv-header"><span class="dlg-name">Villager</span><button class="inv-close">✕</button></div><div class="qd-body"><div class="qd-desc dlg-line"></div><button class="qd-btn">Close</button></div></div>`;
    document.body.appendChild(ov);
    this.dlgOverlay = ov;
    ov.querySelector('.inv-close').onclick = () => this.closeDialogue();
    ov.querySelector('.qd-btn').onclick = () => this.closeDialogue();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeDialogue(); });
  }
  showDialogue(name, line) {
    this._ensureDialogue();
    this.dialogueOpen = true;
    if (document.exitPointerLock) document.exitPointerLock();
    this.dlgOverlay.querySelector('.dlg-name').textContent = name;
    this.dlgOverlay.querySelector('.dlg-line').textContent = '"' + line + '"';
    this.dlgOverlay.classList.remove('hidden');
  }
  closeDialogue() { this.dialogueOpen = false; if (this.dlgOverlay) this.dlgOverlay.classList.add('hidden'); }
  randomLore() { return LORE_LINES[Math.floor(Math.random() * LORE_LINES.length)]; }

  // ---- World map ----
  _ensureWorldMap() {
    if (this.wmOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel wm-panel">
        <div class="inv-header"><span>🗺️ World Map</span><button class="inv-close">✕</button></div>
        <div class="wm-body">
          <canvas class="wm-canvas" width="600" height="600"></canvas>
          <div class="wm-legend">
            <div><span class="lg" style="background:#d8b24a"></span> Town</div>
            <div><span class="lg" style="background:#ff8a2a"></span> Bonfire (click to travel)</div>
            <div><span class="lg" style="background:#ff4444"></span> Boss</div>
            <div><span class="lg" style="background:#cc8844"></span> Elite camp</div>
            <div><span class="lg" style="background:#5aa9ff"></span> Area</div>
            <div><span class="lg" style="background:#7be38a"></span> You</div>
            <div class="wm-hint"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    this.wmOverlay = ov;
    this.wmCanvas = ov.querySelector('.wm-canvas');
    this.wmHint = ov.querySelector('.wm-hint');
    ov.querySelector('.inv-close').onclick = () => this.closeWorldMap();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeWorldMap(); });
    this.wmCanvas.addEventListener('click', (e) => this._worldMapClick(e));
  }
  toggleWorldMap(player, enemies) {
    this._ensureWorldMap();
    this._wmPlayer = player; this._wmEnemies = enemies;
    if (this.worldMapOpen) this.closeWorldMap();
    else { this.worldMapOpen = true; this.wmOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this.renderWorldMap(); }
  }
  closeWorldMap() { this.worldMapOpen = false; if (this.wmOverlay) this.wmOverlay.classList.add('hidden'); }

  _wmScale() { const S = 600, span = 760; return { S, k: (v) => (v + 380) / span * S }; }
  renderWorldMap() {
    const w = this._world, player = this._wmPlayer, enemies = this._wmEnemies || [];
    if (!w) return;
    const ctx = this.wmCanvas.getContext('2d');
    const { S, k } = this._wmScale();
    ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, S, S);

    // Roads (Nexus → towns).
    ctx.strokeStyle = 'rgba(180,150,110,0.5)'; ctx.lineWidth = 3;
    for (const t of TOWNS) { if (t.nexus) continue; ctx.beginPath(); ctx.moveTo(k(0), k(0)); ctx.lineTo(k(t.x), k(t.z)); ctx.stroke(); }

    // Areas.
    for (const a of AREAS) {
      if (a.safe) continue;
      ctx.fillStyle = 'rgba(90,169,255,0.08)'; ctx.strokeStyle = 'rgba(90,169,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(k(a.x), k(a.z), a.r / 760 * S, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9bd0ff'; ctx.font = '10px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText(`${a.name} (Lv${a.level})`, k(a.x), k(a.z) - a.r / 760 * S - 3);
    }
    // Camps.
    ctx.fillStyle = '#cc8844';
    for (const c of w.camps) { ctx.beginPath(); ctx.arc(k(c.pos.x), k(c.pos.z), 4, 0, 7); ctx.fill(); }
    // Bosses (alive).
    ctx.font = 'bold 11px Trebuchet MS';
    for (const e of enemies) {
      if (!e.boss || !e.alive) continue;
      ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(k(e.pos.x), k(e.pos.z), 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb0b0'; ctx.textAlign = 'center'; ctx.fillText('☠ ' + e.bossName, k(e.pos.x), k(e.pos.z) - 8);
    }
    // Bonfires.
    this._wmBonfires = w.bonfires.map((b) => ({ b, cx: k(b.pos.x), cy: k(b.pos.z), found: player.discovered.includes(b.name) }));
    for (const m of this._wmBonfires) {
      ctx.fillStyle = m.found ? '#ff8a2a' : 'rgba(150,120,90,0.5)';
      ctx.beginPath(); ctx.arc(m.cx, m.cy, 5, 0, 7); ctx.fill();
    }
    // Towns.
    for (const t of TOWNS) {
      ctx.fillStyle = '#d8b24a'; ctx.fillRect(k(t.x) - 4, k(t.z) - 4, 8, 8);
      ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 11px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText(t.name, k(t.x), k(t.z) + 16);
    }
    // Player.
    ctx.fillStyle = '#7be38a'; ctx.beginPath(); ctx.arc(k(player.pos.x), k(player.pos.z), 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    this._canTravel = !!(w.nearestBonfire(player.pos, 6) || w.inSafeZone(player.pos.x, player.pos.z));
    this.wmHint.textContent = this._canTravel ? 'Click a discovered bonfire to fast-travel.' : 'Stand at a bonfire or town to fast-travel.';
    this.wmHint.style.color = this._canTravel ? '#9be29e' : '#caa';
  }
  _worldMapClick(e) {
    if (!this._canTravel || !this._wmBonfires) return;
    const rect = this.wmCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (600 / rect.width);
    const my = (e.clientY - rect.top) * (600 / rect.height);
    let best = null, bd = 14;
    for (const m of this._wmBonfires) {
      if (!m.found) continue;
      const d = Math.hypot(mx - m.cx, my - m.cy);
      if (d < bd) { bd = d; best = m; }
    }
    if (best && this.onFastTravel) { this.onFastTravel(best.b); this.closeWorldMap(); }
  }

  // ---- Chat ----
  setupChat(onSend) {
    this._onSend = onSend;
    this._chatInput = document.createElement('input');
    this._chatInput.className = 'chat-input hidden';
    this._chatInput.maxLength = 120;
    this._chatInput.placeholder = 'Say something… (Enter to send, Esc to cancel)';
    this.el.hud.appendChild(this._chatInput);

    window.addEventListener('keydown', (e) => {
      if (this._chatActive) {
        if (e.code === 'Enter') {
          const txt = this._chatInput.value.trim();
          if (txt) this._onSend(txt);
          this._closeChat();
        } else if (e.code === 'Escape') {
          this._closeChat();
        }
        e.stopPropagation();
      }
    }, true);
  }
  openChat(input) {
    this._chatActive = true;
    input.typing = true;
    this._chatInput.classList.remove('hidden');
    this._chatInput.value = '';
    this._chatInput.focus();
    this._inputRef = input;
  }
  _closeChat() {
    this._chatActive = false;
    if (this._inputRef) this._inputRef.typing = false;
    this._chatInput.classList.add('hidden');
    this._chatInput.blur();
  }
  get chatActive() { return this._chatActive; }
}
