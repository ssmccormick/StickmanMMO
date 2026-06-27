// ============================================================
// UI: the DOM overlay. Class-select screen, HUD vitals, hotbar
// with cooldowns, minimap, floating combat text, combat log,
// interaction prompts, target frame, death screen, and chat.
// ============================================================
import { CLASSES, CLASS_ORDER } from './classes.js';
import { Saves } from './save.js';

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

      hotbar: document.getElementById('hotbar'),
      minimap: document.getElementById('minimap'),
      playerCount: document.getElementById('player-count'),
      targetFrame: document.getElementById('target-frame'),
      targetName: document.getElementById('target-name'),
      targetHpFill: document.getElementById('target-hp-fill'),
      log: document.getElementById('log'),
      prompt: document.getElementById('prompt'),
      floaters: document.getElementById('floaters'),
      death: document.getElementById('death-screen'),
      hint: document.getElementById('controls-hint'),
    };
    this.selectedClass = 'fighter';
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.project = null; // set by main: (Vector3) => {x,y,visible}
    this._buildClassGrid();
    this._chatActive = false;
  }

  _buildClassGrid() {
    this.el.classGrid.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      const card = document.createElement('div');
      card.className = 'class-card' + (id === this.selectedClass ? ' selected' : '');
      card.innerHTML = `<div class="glyph">${c.glyph}</div><div class="cname">${c.name}</div><div class="ctag">${c.tag}</div>`;
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
    this._bar(this.el.hpFill, this.el.hpText, s.hp, s.maxHp);
    this._bar(this.el.mpFill, this.el.mpText, s.mp, s.maxMp);
    this._bar(this.el.spFill, this.el.spText, s.sp, s.maxSp);
    this.el.charLevel.textContent = s.level;
    const xpPct = (s.xp / s.xpNext) * 100;
    this.el.xpFill.style.width = `${xpPct}%`;
    this.el.xpText.textContent = `XP ${Math.floor(s.xp)} / ${s.xpNext}`;
    this.el.playerCount.textContent = playerCount;

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
    ctx.clearRect(0, 0, W, W);
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
