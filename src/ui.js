// ============================================================
// UI: the DOM overlay. Class-select screen, HUD vitals, hotbar
// with cooldowns, minimap, floating combat text, combat log,
// interaction prompts, target frame, death screen, and chat.
// ============================================================
import { CLASSES, CLASS_ORDER, passiveById, PASSIVES } from './classes.js';
import { SKILLS, SKILL_MAX, skillXpForLevel } from './skills.js';
import { QUALITY } from './gfx.js';
import { Saves } from './save.js';
import { SLOTS, EQUIP_SLOTS, SLOT_LABEL, RARITY, itemTooltip, generateItem, buyPrice, sellPrice, makeConsumable } from './items.js';
import { MATERIALS, MATERIAL_ORDER, RECIPES, RECIPE_CATS, STRUCTURES, discountedCost, materialById } from './crafting.js';
import { MOUNTS, SHOP_MOUNTS, MOUNT_ORDER, mountById } from './mounts.js';
import { WEAPON_SKINS } from './weapons.js';
import * as Quests from './quests.js';
import { TOWNS, AREAS, MOUNTAINS, WATER_LEVEL, WORLD_SIZE, heightAt, biomeColorAt } from './world.js';
import { MAP_GRID } from './player.js';
import { CODEX, PROLOGUE, WORLD_NAME, ashboundEntry, TOWN_CHATTER } from './lore.js';
import { EMOTES } from './player.js';
import * as Achievements from './achievements.js';
import { CharacterPreview } from './preview.js';
import { DEFAULT_SERVER } from './config.js';
import {
  RANGES, BODY_COLORS, ACCENT_COLORS, HAIR_COLORS, HAIR_STYLES, COSMETICS,
  defaultAppearance, normalizeAppearance, unlockedCosmetics, isOptionAvailable, hexCss,
} from './appearance.js';

const LORE_LINES = TOWN_CHATTER;

// Remappable ability hotkeys. The 8 hotbar ability slots default to keys 1..8;
// the options menu lets the player rebind each to any key. combat.js reads the
// live binding (ui.abilityKeys()) rather than a hardcoded list.
export const ABILITY_SLOTS = 8;
export const DEFAULT_ABILITY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];

// A short human label for a KeyboardEvent.code (e.g. 'Digit1'→'1', 'KeyQ'→'Q').
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  if (code.startsWith('Key')) return code.slice(3);
  const named = {
    Space: '␣', Escape: 'Esc', Enter: '⏎', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', Tab: '⇥',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
    AltLeft: 'LAlt', AltRight: 'RAlt',
  };
  return named[code] || code;
}

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

    // Player-adjustable settings (UI scale, look sensitivity, etc.). Loaded from
    // localStorage and applied immediately; smaller HUD by default on touch.
    this.touchDevice = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
      || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this._loadSettings();
    this.applySettings();

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
      card.onclick = () => {
        this.selectedClass = id;
        // Following the class's colours until the player customises: re-skin the
        // in-progress look to the newly chosen class so the preview tracks it.
        if (!this._appearanceTouched && this.creationAppearance) {
          const d = defaultAppearance(id);
          this.creationAppearance.bodyColor = d.bodyColor;   // mutate in place so
          this.creationAppearance.accentColor = d.accentColor; // the customiser ref holds
          this._refreshCustomizer();
        }
        this._buildClassGrid();
        this._showClassDetail(id);
      };
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

    // Pre-fill the server address so players connect automatically:
    //   1. a ?server=<host> URL param (shareable links / testing), else
    //   2. the deployed default from src/config.js.
    // Either is auto-secured to wss:// on the live HTTPS site by the network
    // layer, and an unreachable server falls back to solo.
    try {
      const qp = new URLSearchParams(location.search).get('server');
      const pre = qp || DEFAULT_SERVER;
      if (pre && this.el.serverInput && !this.el.serverInput.value) this.el.serverInput.value = pre;
    } catch { /* no URL API — ignore */ }

    this.el.newCharBtn.onclick = () => this.showCreate();
    this.el.backRoster.onclick = () => this.showRoster();
    this.el.enter.onclick = () => {
      const name = (this.el.nameInput.value || 'Stickaeryn').slice(0, 16);
      this._stopCreationPreview();
      const appearance = normalizeAppearance(this.creationAppearance, this.selectedClass);
      onCreate({ name, classId: this.selectedClass, server: this._server(), appearance });
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
    this._stopCreationPreview();
    this.refreshRoster();
    this.el.rosterView.classList.remove('hidden');
    this.el.createView.classList.add('hidden');
  }

  showCreate() {
    // Hide the "back" button if there are no characters to go back to.
    this.el.backRoster.style.display = Saves.list().length ? 'inline-block' : 'none';
    this.el.createView.classList.remove('hidden');
    this.el.rosterView.classList.add('hidden');
    // Fresh appearance, defaulting to the selected class's colours.
    this.creationAppearance = defaultAppearance(this.selectedClass);
    this._appearanceTouched = false;
    this._initCreationCustomizer();
  }

  // ---- Appearance customiser (shared by creation & the in-game wardrobe) ----
  _initCreationCustomizer() {
    const host = document.getElementById('customize-controls');
    const canvas = document.getElementById('preview-canvas');
    if (!host || !canvas) return;
    this._customizeHost = host;
    if (!this._creationPreview) this._creationPreview = new CharacterPreview(canvas);
    this._buildCustomizer(host, this.creationAppearance, () => {
      this._appearanceTouched = true;
      if (this._creationPreview) this._creationPreview.setAppearance(this.creationAppearance);
    });
    this._creationPreview.setAppearance(this.creationAppearance);
    this._creationPreview.start();
  }
  _refreshCustomizer() {
    if (this._customizeHost && this._customizeActive === this.creationAppearance) {
      this._buildCustomizer(this._customizeHost, this.creationAppearance, this._customizeOnChange);
    }
    if (this._creationPreview) this._creationPreview.setAppearance(this.creationAppearance);
  }
  _stopCreationPreview() { if (this._creationPreview) this._creationPreview.stop(); }

  // Render the full set of controls for `app` into `host`. `onChange` fires
  // after any tweak (already mutated into `app`). Re-rendered on each change so
  // selection highlights stay current.
  _buildCustomizer(host, app, onChange) {
    this._customizeActive = app;
    this._customizeOnChange = onChange;
    const unlocked = unlockedCosmetics();
    const commit = () => {
      onChange();
      this._buildCustomizer(host, app, onChange); // re-render to refresh highlights
    };
    host.innerHTML = '';

    host.appendChild(this._hairRow(app, unlocked, commit));
    host.appendChild(this._colorRow('Body', 'bodyColor', BODY_COLORS, app, unlocked, commit));
    host.appendChild(this._colorRow('Accent', 'accentColor', ACCENT_COLORS, app, unlocked, commit));
    host.appendChild(this._colorRow('Hair', 'hairColor', HAIR_COLORS, app, unlocked, commit));
    host.appendChild(this._weaponSkinRow(app, unlocked, commit));
    // Sliders update live but must NOT trigger a re-render (it would replace the
    // input element mid-drag), so they call onChange directly.
    for (const key of ['size', 'build', 'headSize', 'limb']) {
      host.appendChild(this._sliderRow(key, app, onChange));
    }
  }

  _cz(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  _hairRow(app, unlocked, commit) {
    const row = this._cz('div', 'cz-row');
    row.appendChild(this._cz('div', 'cz-label', 'Hair Style'));
    const grid = this._cz('div', 'cz-grid');
    for (const h of HAIR_STYLES) {
      const locked = h.cosmetic && !isOptionAvailable('hair', h.id, unlocked);
      const cos = COSMETICS.find((c) => c.type === 'hair' && c.value === h.id);
      const btn = this._cz('button', 'cz-chip' + (app.hair === h.id ? ' sel' : '') + (locked ? ' locked' : ''),
        `<span class="cz-glyph">${h.glyph}</span><span class="cz-name">${h.name}</span>${locked ? '<span class="cz-lock">🔒</span>' : ''}`);
      btn.title = locked && cos ? `Locked — ${cos.hint}` : h.name;
      if (!locked) btn.onclick = () => { app.hair = h.id; commit(); };
      grid.appendChild(btn);
    }
    row.appendChild(grid);
    return row;
  }

  _weaponSkinRow(app, unlocked, commit) {
    const row = this._cz('div', 'cz-row');
    row.appendChild(this._cz('div', 'cz-label', 'Weapon Skin'));
    const grid = this._cz('div', 'cz-grid');
    const cur = app.weaponSkin || 'default';
    for (const s of WEAPON_SKINS) {
      const locked = s.id !== 'default' && !isOptionAvailable('weaponSkin', s.id, unlocked);
      const cos = COSMETICS.find((c) => c.type === 'weaponSkin' && c.value === s.id);
      const btn = this._cz('button', 'cz-chip' + (cur === s.id ? ' sel' : '') + (locked ? ' locked' : ''),
        `<span class="cz-glyph">${s.glyph}</span><span class="cz-name">${s.name}</span>${locked ? '<span class="cz-lock">🔒</span>' : ''}`);
      btn.title = locked && cos ? `Locked — ${cos.hint}` : s.name;
      if (!locked) btn.onclick = () => { app.weaponSkin = s.id; commit(); };
      grid.appendChild(btn);
    }
    row.appendChild(grid);
    return row;
  }

  _colorRow(label, field, palette, app, unlocked, commit) {
    const row = this._cz('div', 'cz-row');
    row.appendChild(this._cz('div', 'cz-label', label));
    const grid = this._cz('div', 'cz-swatches');
    // Base palette, then any cosmetic colours of this type (locked teasers shown).
    const cosmetic = COSMETICS.filter((c) => c.type === field);
    const values = [...palette, ...cosmetic.map((c) => c.value)];
    const seen = new Set();
    for (const val of values) {
      if (seen.has(val)) continue; seen.add(val);
      const cos = cosmetic.find((c) => c.value === val);
      const locked = cos && !unlocked.has(cos.id);
      const sw = this._cz('button', 'cz-sw' + (app[field] === val ? ' sel' : '') + (locked ? ' locked' : ''));
      sw.style.background = hexCss(val);
      sw.title = locked ? `${cos.name} — Locked: ${cos.hint}` : (cos ? cos.name : hexCss(val));
      if (locked) sw.innerHTML = '<span class="cz-lock">🔒</span>';
      else sw.onclick = () => { app[field] = val; commit(); };
      grid.appendChild(sw);
    }
    row.appendChild(grid);
    return row;
  }

  _sliderRow(field, app, onChange) {
    const r = RANGES[field];
    const row = this._cz('div', 'cz-row cz-slider-row');
    row.appendChild(this._cz('div', 'cz-label', r.label));
    const input = document.createElement('input');
    input.type = 'range'; input.min = r.min; input.max = r.max; input.step = r.step;
    input.value = app[field]; input.className = 'cz-slider';
    input.oninput = () => { app[field] = parseFloat(input.value); onChange(); };
    row.appendChild(input);
    return row;
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
    this._player = player; // remembered so the keybind editor can refresh labels
    this.el.hotbar.innerHTML = '';
    const def = CLASSES[player.classId];
    const abKeys = this.abilityKeys();
    const atk = document.createElement('div');
    atk.className = 'slot ready';
    atk.innerHTML = `<span class="key">LMB</span>${def.ranged ? '🏹' : '⚔️'}`;
    this.el.hotbar.appendChild(atk);
    // Health-potion quick-slot, right beside the main attack. Shows how many are
    // in the bag; click (or press Q) to quaff one.
    const pot = document.createElement('div');
    pot.className = 'slot ready pot-slot';
    pot.title = 'Quick heal (Q) — quaff a health potion';
    pot.innerHTML = `<span class="key">Q</span>🧪<span class="cost pot-count">0</span>`;
    pot.onclick = () => { if (this.onQuickHeal) this.onQuickHeal(); };
    this.el.hotbar.appendChild(pot);
    this._potSlot = pot; this._potCount = pot.querySelector('.pot-count');
    this.slots = [];
    player.learned.forEach((l, i) => {
      const a = player.ability(i); // rank-scaled
      const pips = '★'.repeat(l.rank) + '·'.repeat(Math.max(0, 3 - l.rank));
      const s = document.createElement('div');
      s.className = 'slot ready';
      s.title = `${a.name} (Rank ${l.rank}) — ${a.desc}`;
      s.innerHTML = `<span class="key">${keyLabel(abKeys[i])}</span>${a.glyph}` +
        `<span class="cost">${a.cost}${a.costType}</span>` +
        `<span class="rank">${pips}</span><div class="cd hidden"></div>`;
      this.el.hotbar.appendChild(s);
      this.slots.push({ el: s, cd: s.querySelector('.cd') });
    });
    // Always-on class passives the player has CHOSEN at level-up — shown as
    // non-interactive chips (they don't take a hotbar slot).
    for (const id of (player.learnedPassives || [])) {
      const pv = passiveById(player.classId, id);
      if (!pv) continue;
      const c = document.createElement('div');
      c.className = 'slot ready passive-slot';
      c.title = `${pv.name} (passive) — ${pv.desc}`;
      c.innerHTML = `<span class="key">◆</span>${pv.glyph}`;
      this.el.hotbar.appendChild(c);
    }
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
    // Exhausted: stamina drained to empty and locked until it fully refills.
    if (this.el.spFill) this.el.spFill.classList.toggle('exhausted', !!player._exhausted);
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

    // Potion quick-slot count (health potions in the bag; empty = greyed out).
    if (this._potCount) {
      const n = player.inventory.filter((it) => it.type === 'consumable' && it.kind === 'heal').length;
      this._potCount.textContent = n;
      this._potSlot.classList.toggle('ready', n > 0);
      this._potSlot.style.opacity = n > 0 ? '1' : '0.45';
    }

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
      : choices.skills.map((s, i) => {
        const tag = s.type === 'learn' ? 'Learn' : s.type === 'passive' ? 'Passive' : `Upgrade →R${s.rank + 1}`;
        return `<div class="lu-card${s.type === 'passive' ? ' lu-passive' : ''}" data-kind="skill" data-i="${i}">
           <div class="lu-glyph">${s.glyph}</div>
           <div class="lu-name">${tag}: ${s.name}</div>
           <div class="lu-desc">${s.desc}</div>
         </div>`; }).join('');

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
        const verb = selSkill.type === 'upgrade' ? 'Upgraded' : 'Learned';
        const tail = selSkill.type === 'passive' ? ' (passive)' : '';
        this.log(`${verb} ${selSkill.name}${tail}!`, 'xp');
      }
      onDone();
    };
  }

  setServerStatus(state, label) {
    this.el.serverStatus.className = `server-status ${state}`;
    this.el.serverStatus.textContent = label;
  }

  toggleHint() {
    this.settings.showHint = !this.settings.showHint;
    this._saveSettings();
    this.el.hint.classList.toggle('hidden', !this.settings.showHint);
  }

  // ---- Settings ----
  _defaultSettings() {
    return {
      uiScale: this.touchDevice ? 0.72 : 1,   // HUD overlay size
      touchScale: 1,                           // on-screen control size
      lookSens: 1,                             // camera look multiplier
      invertY: false,
      showHint: !this.touchDevice,             // hide the wordy hint on phones
      celShading: true,                        // cel/toon shading + outlines + glow
      abilityKeys: DEFAULT_ABILITY_KEYS.slice(), // remappable ability-slot keys (1..8)
    };
  }
  _loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('smmo_settings')) || {}; } catch (e) { saved = {}; }
    this.settings = Object.assign(this._defaultSettings(), saved);
    this._sanitizeKeybinds();
    this._applyGfx(); // set the graphics flags BEFORE any world/mesh is built
  }
  // Push the cel-shading preference into the graphics flags (read at build time).
  _applyGfx() { const on = this.settings.celShading !== false; QUALITY.toon = QUALITY.glow = QUALITY.outline = on; }
  // Guarantee exactly ABILITY_SLOTS ability-key entries (older saves / bad data
  // fall back to the default for that slot).
  _sanitizeKeybinds() {
    const cur = Array.isArray(this.settings.abilityKeys) ? this.settings.abilityKeys : [];
    this.settings.abilityKeys = DEFAULT_ABILITY_KEYS.map((d, i) => (typeof cur[i] === 'string' && cur[i]) ? cur[i] : d);
  }
  // The key code currently bound to ability slot i (used by combat.js + hotbar).
  abilityKeys() { return this.settings.abilityKeys; }
  _saveSettings() {
    try { localStorage.setItem('smmo_settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
  }
  applySettings() {
    const s = this.settings;
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', s.uiScale);
    root.style.setProperty('--touch-scale', s.touchScale);
    if (this.el.hint) this.el.hint.classList.toggle('hidden', !s.showHint);
    if (this.onSettings) this.onSettings(s); // lets main apply camera sensitivity/invert
  }
  setSetting(key, value) {
    this.settings[key] = value;
    this._saveSettings();
    this.applySettings();
  }
  _ensureSettings() {
    if (this.setOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel set-panel"><div class="inv-header"><span>⚙️ Settings</span><button class="inv-close">✕</button></div><div class="skills-body set-body"></div></div>`;
    document.body.appendChild(ov);
    this.setOverlay = ov;
    this.setBody = ov.querySelector('.set-body');
    ov.querySelector('.inv-close').onclick = () => this.closeSettings();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeSettings(); });
  }
  toggleSettings() {
    this._ensureSettings();
    if (this.settingsOpen) this.closeSettings();
    else { this.settingsOpen = true; this.setOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this.renderSettings(); }
  }
  closeSettings() { this.settingsOpen = false; if (this.setOverlay) this.setOverlay.classList.add('hidden'); }
  renderSettings() {
    const s = this.settings;
    const pct = (v) => Math.round(v * 100) + '%';
    this.setBody.innerHTML = `
      <div class="set-row"><label>HUD size <b id="set-ui-v">${pct(s.uiScale)}</b></label>
        <input id="set-ui" type="range" min="0.55" max="1.4" step="0.05" value="${s.uiScale}"></div>
      <div class="set-row"><label>Touch control size <b id="set-tc-v">${pct(s.touchScale)}</b></label>
        <input id="set-tc" type="range" min="0.7" max="1.6" step="0.05" value="${s.touchScale}"></div>
      <div class="set-row"><label>Look sensitivity <b id="set-ls-v">${pct(s.lookSens)}</b></label>
        <input id="set-ls" type="range" min="0.3" max="2.5" step="0.05" value="${s.lookSens}"></div>
      <div class="set-row set-check"><label><input id="set-inv" type="checkbox" ${s.invertY ? 'checked' : ''}> Invert look (Y axis)</label></div>
      <div class="set-row set-check"><label><input id="set-hint" type="checkbox" ${s.showHint ? 'checked' : ''}> Show controls hint</label></div>
      <div class="set-row set-check"><label><input id="set-cel" type="checkbox" ${s.celShading !== false ? 'checked' : ''}> Cel shading (crisp toon look + outlines)</label></div>
      <div class="set-hint-sm">Cel shading applies on your next character load.</div>
      <div class="set-keybinds-head">Ability Hotkeys</div>
      <div class="set-hint-sm">Click a key, then press a new one to rebind it (Esc cancels).</div>
      <div id="set-keybinds" class="kb-grid"></div>
      <button class="set-reset">Reset to defaults</button>
      <button class="set-quit" style="margin-top:10px;width:100%;padding:10px;background:#5a1f1f;color:#ffd7d7;border:1px solid #a13a3a;border-radius:6px;font-weight:bold;cursor:pointer;">⎋ Quit to Character Selection</button>`;
    const bind = (id, key, vid, fmt) => {
      const el = this.setBody.querySelector('#' + id);
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (vid) this.setBody.querySelector('#' + vid).textContent = fmt(v);
        this.setSetting(key, v);
      });
    };
    bind('set-ui', 'uiScale', 'set-ui-v', pct);
    bind('set-tc', 'touchScale', 'set-tc-v', pct);
    bind('set-ls', 'lookSens', 'set-ls-v', pct);
    this.setBody.querySelector('#set-inv').addEventListener('change', (e) => this.setSetting('invertY', e.target.checked));
    this.setBody.querySelector('#set-hint').addEventListener('change', (e) => this.setSetting('showHint', e.target.checked));
    this.setBody.querySelector('#set-cel').addEventListener('change', (e) => { this.setSetting('celShading', e.target.checked); this._applyGfx(); });
    this.setBody.querySelector('.set-reset').addEventListener('click', () => { this.settings = this._defaultSettings(); this._saveSettings(); this.applySettings(); this.renderSettings(); if (this._player) this.refreshHotbar(this._player); });
    this.setBody.querySelector('.set-quit').addEventListener('click', () => { if (this.onQuitToMenu) this.onQuitToMenu(); });
    this._renderKeybinds();
  }

  // Build the ability-hotkey rows and their click-to-rebind behaviour.
  _renderKeybinds() {
    const host = this.setBody && this.setBody.querySelector('#set-keybinds');
    if (!host) return;
    const keys = this.abilityKeys();
    host.innerHTML = '';
    for (let i = 0; i < ABILITY_SLOTS; i++) {
      const row = document.createElement('div');
      row.className = 'kb-row';
      row.innerHTML = `<span class="kb-label">Ability ${i + 1}</span><button class="kb-btn" data-i="${i}">${keyLabel(keys[i])}</button>`;
      host.appendChild(row);
    }
    host.querySelectorAll('.kb-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._beginRebind(+btn.dataset.i, btn));
    });
  }

  // Listen (once) for the next key press and assign it to ability slot i.
  _beginRebind(i, btn) {
    if (this._rebinding) this._rebinding(); // cancel any in-flight rebind
    btn.textContent = 'Press a key…';
    btn.classList.add('listening');
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      cleanup();
      if (e.code === 'Escape') { btn.textContent = keyLabel(this.abilityKeys()[i]); return; }
      const keys = this.abilityKeys().slice();
      // Avoid two slots sharing a key: clear whichever slot already held it.
      for (let j = 0; j < keys.length; j++) if (keys[j] === e.code && j !== i) keys[j] = '';
      keys[i] = e.code;
      this.settings.abilityKeys = keys;
      this._saveSettings();
      this._renderKeybinds();
      if (this._player) this.refreshHotbar(this._player); // update hotbar key labels
    };
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      btn.classList.remove('listening');
      this._rebinding = null;
    };
    this._rebinding = cleanup;
    // Capture phase + stopPropagation keeps this press from reaching game input.
    window.addEventListener('keydown', onKey, true);
  }

  // Close whichever menu/overlay is open (top-most). Returns true if one closed.
  // Used by the ESC key: ESC closes an open window, else opens the options menu.
  closeTopPanel() {
    if (this._chatActive) { this._closeChat(); return true; }
    const panels = [
      ['inventoryOpen', 'closeInventory'], ['vendorOpen', 'closeVendor'], ['skillsOpen', 'closeSkills'],
      ['questDialogOpen', 'closeQuestDialog'], ['questLogOpen', 'closeQuestLog'], ['charSheetOpen', 'closeCharSheet'],
      ['worldMapOpen', 'closeWorldMap'], ['dialogueOpen', 'closeDialogue'], ['codexOpen', 'closeCodex'],
      ['emotesOpen', 'closeEmotes'], ['achievementsOpen', 'closeAchievements'], ['wardrobeOpen', 'closeWardrobe'],
      ['craftingOpen', 'closeCrafting'], ['mountShopOpen', 'closeMountShop'], ['upgradeShopOpen', 'closeUpgradeShop'],
      ['settingsOpen', 'closeSettings'],
    ];
    for (const [flag, fn] of panels) if (this[flag] && typeof this[fn] === 'function') { this[fn](); return true; }
    return false;
  }

  // ---- Minimap ----
  // The Leviathan-zone warning: a flashing banner + a draining "Leviathan bar".
  // `active` shows it; `frac` (1→0) is how much time is left before the beast
  // rises. Call with active=false to hide it.
  setLeviathan(active, frac) {
    if (!this._levEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;top:14%;left:50%;transform:translateX(-50%);z-index:60;text-align:center;pointer-events:none;';
      el.innerHTML = `
        <div class="lev-text" style="font:900 30px Trebuchet MS,sans-serif;color:#ff3b3b;text-shadow:0 0 12px #ff0000,0 2px 4px #000;letter-spacing:1px;">⚠ ENTERING LEVIATHAN ZONE — TURN BACK! ⚠</div>
        <div style="margin:10px auto 0;width:360px;height:16px;background:rgba(0,0,0,0.55);border:2px solid #7a1010;border-radius:8px;overflow:hidden;">
          <div class="lev-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#ff7a2a,#ff2020);"></div>
        </div>
        <div style="margin-top:6px;color:#ffb0b0;font:600 14px Trebuchet MS;">The deep stirs… the Leviathan wakes.</div>`;
      (this.el.hud || document.body).appendChild(el);
      this._levEl = el; this._levFill = el.querySelector('.lev-fill'); this._levText = el.querySelector('.lev-text');
    }
    this._levEl.style.display = active ? 'block' : 'none';
    if (active) {
      this._levFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
      // Flash the warning text.
      const on = Math.sin(Date.now() / 110) > -0.2;
      this._levText.style.opacity = on ? '1' : '0.25';
    }
  }

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
    // Point the arrow the way the player faces. The apex starts pointing "up"
    // (canvas −y); rotating by (π − facing) aims it along the facing direction
    // in minimap space (world x,z map straight to canvas x,y).
    ctx.rotate(Math.PI - player.facing);
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
    const addSlot = (slot, label, active) => {
      const item = p.gear[slot];
      const cell = document.createElement('div');
      cell.className = 'equip-slot' + (item ? ` filled r-${item.rarity}` : '') + (active ? ' active-weapon' : '');
      cell.innerHTML = item
        ? `<div class="slot-glyph">${item.glyph}</div>${active ? '<div class="slot-active">★</div>' : ''}`
        : `<div class="slot-empty">${label}</div>`;
      if (item) {
        this._tipFor(cell, item, p.stats.level);
        cell.onclick = () => {
          const r = p.unequip(slot);
          if (r.error === 'full') this.log('Bag is full.', 'sys');
          this.renderInventory();
        };
      }
      this.equipSlotsEl.appendChild(cell);
    };
    // Every socket, including the extra weapon/ring, cape (back), and shoulders.
    // ★ marks the wielded weapon when two are equipped (Tab swaps).
    for (const slot of EQUIP_SLOTS) {
      const active = (slot === 'weapon' && p.activeWeapon === 0 && !!p.gear.weapon2)
        || (slot === 'weapon2' && p.activeWeapon === 1);
      addSlot(slot, SLOT_LABEL[slot], active);
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
    // Passive perks: always-on, chosen at level-up like a skill (no hotbar slot).
    const pdefs = PASSIVES[player.classId] || [];
    if (pdefs.length) {
      const ownedP = new Set(player.learnedPassives || []);
      html += `<div class="sk-section">Passive Skills</div>`;
      for (const pv of pdefs) {
        const have = ownedP.has(pv.id);
        const ready = player.stats.level >= pv.reqLevel;
        const meta = have ? '◆ Active · always on'
          : ready ? '🔒 Choose at your next level-up' : `🔒 Unlocks at level ${pv.reqLevel}`;
        html += `
          <div class="sk-card${have ? '' : ' locked'}">
            <div class="sk-head"><span class="sk-glyph">${pv.glyph}</span>
              <div><div class="sk-name">${pv.name}</div>
              <div class="sk-meta">${meta}</div></div></div>
            <div class="sk-desc">${pv.desc}</div>
          </div>`;
      }
    }
    // Proficiency skills (RuneScape-style): trained by doing, with milestone perks.
    if (player.skills) {
      html += `<div class="sk-section">Proficiencies — trained by doing</div>`;
      for (const def of SKILLS) {
        const s = player.skills[def.id] || { level: 1, xp: 0 };
        const maxed = s.level >= SKILL_MAX;
        const need = maxed ? 0 : skillXpForLevel(s.level);
        const pct = maxed ? 100 : Math.min(100, Math.round((s.xp / need) * 100));
        const b = player.skillBonus ? player.skillBonus(def.id) : { dmg: 0, crit: 0, speed: 0, fishing: 0, costMul: 0, stamina: 0 };
        const bits = [];
        if (b.dmg) bits.push(`+${Math.round(b.dmg * 100)}% dmg`);
        if (b.crit) bits.push(`+${Math.round(b.crit * 100)}% crit`);
        if (b.speed) bits.push(`+${Math.round(b.speed * 100)}% speed`);
        if (b.fishing) bits.push(`+${Math.round(b.fishing)} fishing`);
        if (b.costMul) bits.push(`-${Math.round(b.costMul * 100)}% cost`);
        if (b.stamina) bits.push(`-${Math.round(b.stamina * 100)}% sprint`);
        if (b.yield) bits.push(`+${Math.round(b.yield * 100)}% yield`);
        if (b.gatherSpeed) bits.push(`+${Math.round(b.gatherSpeed * 100)}% harvest speed`);
        if (b.rareFind) bits.push(`+${Math.round(b.rareFind * 100)}% rare finds`);
        if (b.quality) bits.push(`+${Math.round(b.quality * 100)}% quality`);
        if (b.craftDisc) bits.push(`-${Math.round(b.craftDisc * 100)}% mat cost`);
        if (b.buildDisc) bits.push(`-${Math.round(b.buildDisc * 100)}% build cost`);
        const perks = def.perks.map((p) => `<span class="sk-perk ${s.level >= p.lvl ? 'on' : ''}" title="Lv ${p.lvl}: ${p.desc}">${s.level >= p.lvl ? '◆' : '◇'} ${p.name}</span>`).join('');
        html += `
          <div class="sk-card prof-card">
            <div class="sk-head"><span class="sk-glyph">${def.glyph}</span>
              <div><div class="sk-name">${def.name} <span class="sk-lvl">Lv ${s.level}${maxed ? ' (max)' : ''}</span></div>
              <div class="sk-meta">${bits.join(' · ') || 'No bonus yet — train it to grow'}</div></div></div>
            <div class="prof-xp"><div class="prof-xp-fill" style="width:${pct}%"></div></div>
            <div class="sk-perks">${perks}</div>
          </div>`;
      }
    }
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
    // Merchants stock modest, mostly common/uncommon gear — the good stuff is
    // earned in the world, not bought off a shelf. Legendaries never appear.
    const gear = (slot, n, boost = 0.12) => { for (let i = 0; i < n; i++) {
      let it; do { it = generateItem({ slot, level: Math.max(1, lvl + (i % 3) - 1), rarityBoost: boost }); } while (it.rarity === 'legendary');
      stock.push(it);
    } };
    if (type === 'alchemist') {
      for (const id of ['hp_minor', 'hp_major', 'buff_swift', 'buff_power', 'buff_might', 'hp_minor', 'hp_major']) stock.push(makeConsumable(id));
    } else if (type === 'weapon') {
      gear('weapon', 8, 0.15);
    } else if (type === 'armor') {
      for (const s of ['head', 'chest', 'hands', 'feet']) gear(s, 2, 0.15);
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

  // ---- Crafting & Building window (KeyG) ----
  _ensureCrafting() {
    if (this.craftOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel craft-panel">
        <div class="inv-header"><span>🛠️ Workshop <span class="craft-gold"></span></span><button class="inv-close">✕</button></div>
        <div class="craft-tabs">
          <button class="craft-tab on" data-tab="craft">Craft</button>
          <button class="craft-tab" data-tab="build">Build</button>
          <button class="craft-tab" data-tab="mats">Materials</button>
        </div>
        <div class="craft-body"></div>
      </div>
      <div class="item-tip hidden"></div>`;
    document.body.appendChild(ov);
    this.craftOverlay = ov;
    this.craftBody = ov.querySelector('.craft-body');
    this.craftGoldEl = ov.querySelector('.craft-gold');
    this.craftTip = ov.querySelector('.item-tip');
    this._craftTab = 'craft';
    ov.querySelectorAll('.craft-tab').forEach((b) => b.onclick = () => {
      this._craftTab = b.dataset.tab;
      ov.querySelectorAll('.craft-tab').forEach((x) => x.classList.toggle('on', x === b));
      this.renderCrafting();
    });
    ov.querySelector('.inv-close').onclick = () => this.closeCrafting();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeCrafting(); });
  }
  toggleCrafting(player, world) {
    this._ensureCrafting();
    this._craftPlayer = player; this._craftWorld = world || this._craftWorld;
    if (this.craftingOpen) { this.closeCrafting(); return; }
    this.craftingOpen = true;
    this.craftOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.renderCrafting();
  }
  closeCrafting() {
    this.craftingOpen = false;
    if (this.craftOverlay) this.craftOverlay.classList.add('hidden');
    if (this.craftTip) this.craftTip.classList.add('hidden');
  }
  // A cost line "🪵 2/5" (red if short).
  _costLine(cost, p) {
    return Object.entries(cost).map(([id, n]) => {
      const have = p.materialCount(id), m = materialById(id);
      const ok = have >= n;
      return `<span class="cost-chip ${ok ? '' : 'short'}" title="${m ? m.name : id}">${m ? m.glyph : '?'} ${have}/${n}</span>`;
    }).join(' ');
  }
  renderCrafting() {
    const p = this._craftPlayer; if (!p) return;
    this.craftGoldEl.textContent = `💰 ${p.gold}`;
    const tab = this._craftTab;
    let html = '';
    if (tab === 'mats') {
      html += `<div class="sk-section">Crafting pouch — ${p.materialStacks()}/${p.maxMaterials} stacks</div><div class="mat-grid">`;
      let any = false;
      for (const id of MATERIAL_ORDER) {
        const n = p.materialCount(id); if (!n) continue; any = true;
        const m = MATERIALS[id];
        html += `<div class="mat-cell" title="${m.name} — tier ${m.tier}"><div class="mat-glyph">${m.glyph}</div><div class="mat-n">${n}</div><div class="mat-name">${m.name}</div></div>`;
      }
      html += `</div>`;
      if (!any) html += `<div class="roster-empty">No materials yet — harvest trees, rocks and herb patches out in the world (press E).</div>`;
      this.craftBody.innerHTML = html;
      return;
    }
    if (tab === 'build') {
      const lvl = p.skillLevel('construction');
      const disc = p.skillBonus('construction').buildDisc || 0;
      html += `<div class="sk-section">Construction — Lv ${lvl} · placed where you stand</div>`;
      for (const s of STRUCTURES) {
        const cost = discountedCost(s.cost, disc);
        const canLvl = lvl >= s.req, canPay = p.canAfford(cost);
        const ok = canLvl && canPay;
        html += `<div class="recipe-row ${ok ? '' : 'locked'}" data-build="${s.id}">
          <div class="rr-glyph">${s.glyph}</div>
          <div class="rr-info"><div class="rr-name">${s.name} ${s.fn ? `<span class="rr-tag">${s.fn === 'rest' ? 'rest point' : 'crafting station'}</span>` : ''}</div>
            <div class="rr-desc">${s.desc}</div><div class="rr-cost">${this._costLine(cost, p)}</div></div>
          <button class="rr-btn" ${ok ? '' : 'disabled'}>${canLvl ? (canPay ? 'Build' : 'Need mats') : `Lv ${s.req}`}</button>
        </div>`;
      }
      this.craftBody.innerHTML = html;
      this.craftBody.querySelectorAll('.recipe-row').forEach((row) => {
        const s = STRUCTURES.find((x) => x.id === row.dataset.build);
        row.querySelector('.rr-btn').onclick = () => this._doBuild(s);
      });
      return;
    }
    // Craft tab
    const clvl = p.skillLevel('crafting');
    html += `<div class="sk-section">Crafting — Lv ${clvl}</div>`;
    const disc = p.skillBonus('crafting').craftDisc || 0;
    for (const cat of RECIPE_CATS) {
      html += `<div class="craft-cat">${cat}</div>`;
      for (const r of RECIPES.filter((x) => x.cat === cat)) {
        const cost = discountedCost(r.cost, disc);
        const canLvl = clvl >= r.req, canPay = p.canAfford(cost);
        const ok = canLvl && canPay;
        const outLabel = r.out.k === 'material' ? `${MATERIALS[r.out.id].glyph} ${MATERIALS[r.out.id].name}${r.out.count > 1 ? ' ×' + r.out.count : ''}`
          : r.out.k === 'consumable' ? `${r.glyph} potion` : `${r.glyph} ${r.out.rarity}+ ${r.out.slot}`;
        html += `<div class="recipe-row ${ok ? '' : 'locked'}" data-recipe="${r.id}">
          <div class="rr-glyph">${r.glyph}</div>
          <div class="rr-info"><div class="rr-name">${r.name}</div>
            <div class="rr-desc">Makes: ${outLabel}</div><div class="rr-cost">${this._costLine(cost, p)}</div></div>
          <button class="rr-btn" ${ok ? '' : 'disabled'}>${canLvl ? (canPay ? 'Craft' : 'Need mats') : `Lv ${r.req}`}</button>
        </div>`;
      }
    }
    this.craftBody.innerHTML = html;
    this.craftBody.querySelectorAll('.recipe-row').forEach((row) => {
      const r = RECIPES.find((x) => x.id === row.dataset.recipe);
      row.querySelector('.rr-btn').onclick = () => this._doCraft(r);
    });
  }
  _doCraft(r) {
    const p = this._craftPlayer; if (!p || !r) return;
    if (p.skillLevel('crafting') < r.req) { this.log(`Requires Crafting Lv ${r.req}.`, 'sys'); return; }
    const cost = discountedCost(r.cost, p.skillBonus('crafting').craftDisc || 0);
    if (!p.canAfford(cost)) { this.log('Not enough materials.', 'sys'); return; }
    // Bag-space check for outputs that produce an item.
    if (r.out.k !== 'material' && p.inventory.length >= p.maxInventory) { this.log('Your bag is full.', 'sys'); return; }
    // Pouch-space check for a refined material of a brand-new type.
    if (r.out.k === 'material' && !p.canAddMaterial(r.out.id)) { this.log('Your crafting pouch is full — upgrade it at the Quartermaster.', 'sys'); return; }
    p.spendMaterials(cost);
    let madeName = '';
    if (r.out.k === 'material') {
      p.addMaterial(r.out.id, r.out.count || 1);
      madeName = `${MATERIALS[r.out.id].glyph} ${MATERIALS[r.out.id].name} ×${r.out.count || 1}`;
    } else if (r.out.k === 'consumable') {
      const it = makeConsumable(r.out.id); p.addItem(it); madeName = `${it.glyph} ${it.name}`;
    } else { // gear
      const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      let ri = ORDER.indexOf(r.out.rarity);
      // Crafting quality gives a chance to bump one tier (never to legendary here).
      if (Math.random() < (p.skillBonus('crafting').quality || 0)) ri = Math.min(ri + 1, ORDER.indexOf('epic'));
      const slot = r.out.slot === 'armor' ? ['head', 'chest', 'shoulders', 'hands', 'feet'][Math.floor(Math.random() * 5)]
        : r.out.slot === 'trinket' ? (Math.random() < 0.5 ? 'ring' : 'amulet') : 'weapon';
      const it = generateItem({ slot, level: p.stats.level, forceRarity: ORDER[ri] });
      it.name = `Crafted ${it.name}`;
      p.addItem(it); madeName = `${it.glyph} ${it.name}`;
    }
    p.gainSkillXp('crafting', r.xp || 12);
    this.log(`Crafted <b>${madeName}</b>.`, 'xp');
    if (this.inventoryOpen) this.renderInventory();
    this.renderCrafting();
  }
  _doBuild(s) {
    const p = this._craftPlayer, world = this._craftWorld;
    if (!p || !s) return;
    if (!world) { this.log('Cannot build here.', 'sys'); return; }
    if (p.skillLevel('construction') < s.req) { this.log(`Requires Construction Lv ${s.req}.`, 'sys'); return; }
    const cost = discountedCost(s.cost, p.skillBonus('construction').buildDisc || 0);
    if (!p.canAfford(cost)) { this.log('Not enough materials.', 'sys'); return; }
    // Place a couple of metres in front of the player, facing them.
    const fx = p.pos.x + Math.sin(p.facing) * 3, fz = p.pos.z + Math.cos(p.facing) * 3;
    const rec = world.placeStructure(s.id, fx, fz, p.facing + Math.PI);
    if (!rec) { this.log('Cannot build there.', 'sys'); return; }
    p.spendMaterials(cost);
    p.builds.push({ id: s.id, x: rec.pos.x, y: rec.pos.y, z: rec.pos.z, rot: rec.rot });
    p.gainSkillXp('construction', 18 + s.req);
    this.log(`Built a <b>${s.glyph} ${s.name}</b>.`, 'xp');
    this.floater(`${s.glyph} ${s.name}`, 'xp', p.pos);
    this.renderCrafting();
  }

  // ---- Stablemaster (mount shop) ----
  _ensureMountShop() {
    if (this.mountShopOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel mount-panel">
        <div class="inv-header"><span>🐎 Stablemaster <span class="mount-gold"></span></span><button class="inv-close">✕</button></div>
        <div class="mount-body"></div>
      </div>`;
    document.body.appendChild(ov);
    this.mountShopOverlay = ov;
    this.mountBody = ov.querySelector('.mount-body');
    this.mountGoldEl = ov.querySelector('.mount-gold');
    ov.querySelector('.inv-close').onclick = () => this.closeMountShop();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeMountShop(); });
  }
  openMountShop(player) {
    this._ensureMountShop();
    this._mountPlayer = player;
    this.mountShopOpen = true;
    this.mountShopOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.renderMountShop();
  }
  closeMountShop() { this.mountShopOpen = false; if (this.mountShopOverlay) this.mountShopOverlay.classList.add('hidden'); }
  renderMountShop() {
    const p = this._mountPlayer; if (!p) return;
    this.mountGoldEl.textContent = `💰 ${p.gold}`;
    const owned = p.ownedMountList();
    const ride = p.skillLevel('riding');
    let html = `<div class="sk-section">Your stable · Riding Lv ${ride}</div><div class="mount-list">`;
    // Owned mounts first (switch which one you summon).
    for (const id of MOUNT_ORDER) {
      if (!owned.has(id)) continue;
      const m = MOUNTS[id]; const active = p.activeMount === id;
      html += `<div class="mount-row ${active ? 'active' : ''}" data-ride="${id}">
        <div class="mr-glyph">${m.glyph}</div>
        <div class="mr-info"><div class="mr-name">${m.name} ${active ? '<span class="mr-tag">riding</span>' : ''}</div>
          <div class="mr-desc">${m.desc}</div><div class="mr-stat">Speed ×${m.speed.toFixed(2)}</div></div>
        <button class="mr-btn">${active ? 'Active' : 'Ride'}</button></div>`;
    }
    html += `</div><div class="sk-section">For sale</div><div class="mount-list">`;
    for (const id of SHOP_MOUNTS) {
      if (owned.has(id)) continue;
      const m = MOUNTS[id];
      const okLvl = ride >= m.reqRiding, okGold = p.gold >= m.price;
      const ok = okLvl && okGold;
      html += `<div class="mount-row ${ok ? '' : 'locked'}" data-buy="${id}">
        <div class="mr-glyph">${m.glyph}</div>
        <div class="mr-info"><div class="mr-name">${m.name}</div>
          <div class="mr-desc">${m.desc}</div><div class="mr-stat">Speed ×${m.speed.toFixed(2)} · Riding Lv ${m.reqRiding}</div></div>
        <button class="mr-btn" ${ok ? '' : 'disabled'}>${okLvl ? `💰 ${m.price}` : `Lv ${m.reqRiding}`}</button></div>`;
    }
    html += `</div>`;
    this.mountBody.innerHTML = html;
    this.mountBody.querySelectorAll('.mount-row').forEach((row) => {
      const btn = row.querySelector('.mr-btn');
      if (row.dataset.ride) btn.onclick = () => {
        if (p.setActiveMount(row.dataset.ride)) { this.log(`You'll ride the ${MOUNTS[row.dataset.ride].name} (press R to mount).`, 'xp'); this.renderMountShop(); }
      };
      else if (row.dataset.buy) btn.onclick = () => {
        const m = MOUNTS[row.dataset.buy];
        if (p.skillLevel('riding') < m.reqRiding) { this.log(`Requires Riding Lv ${m.reqRiding}.`, 'sys'); return; }
        if (p.gold < m.price) { this.log('Not enough gold.', 'sys'); return; }
        if (p.buyMount(row.dataset.buy)) {
          this.log(`Bought the <b>${m.glyph} ${m.name}</b> for ${m.price}g! Press R to ride.`, 'xp');
          this.floater(`${m.glyph} ${m.name}`, 'xp', p.pos);
          this.renderMountShop();
        }
      };
    });
  }

  // ---- Quartermaster (bag & pouch upgrades) ----
  _ensureUpgradeShop() {
    if (this.upgradeOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `
      <div class="inv-panel mount-panel">
        <div class="inv-header"><span>🎒 Quartermaster <span class="mount-gold up-gold"></span></span><button class="inv-close">✕</button></div>
        <div class="mount-body up-body"></div>
      </div>`;
    document.body.appendChild(ov);
    this.upgradeOverlay = ov;
    this.upgradeBody = ov.querySelector('.up-body');
    this.upgradeGoldEl = ov.querySelector('.up-gold');
    ov.querySelector('.inv-close').onclick = () => this.closeUpgradeShop();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeUpgradeShop(); });
  }
  openUpgradeShop(player) {
    this._ensureUpgradeShop();
    this._upgradePlayer = player;
    this.upgradeShopOpen = true;
    this.upgradeOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    this.renderUpgradeShop();
  }
  closeUpgradeShop() { this.upgradeShopOpen = false; if (this.upgradeOverlay) this.upgradeOverlay.classList.add('hidden'); }
  renderUpgradeShop() {
    const p = this._upgradePlayer; if (!p) return;
    this.upgradeGoldEl.textContent = `💰 ${p.gold}`;
    const rows = [
      { key: 'inv', glyph: '🎒', name: 'Backpack Expansion', desc: `Adventuring bag — carries your gear, loot & potions.`,
        cur: p.maxInventory, step: 6, atMax: p.invAtMax(), cost: p.invUpgradeCost(), unit: 'slots' },
      { key: 'mat', glyph: '🧰', name: 'Crafting Pouch Expansion', desc: `Material pouch — how many distinct materials you can stockpile.`,
        cur: p.maxMaterials, step: 4, atMax: p.matAtMax(), cost: p.matUpgradeCost(), unit: 'stacks' },
    ];
    let html = `<div class="sk-section">Capacity upgrades</div><div class="mount-list">`;
    for (const r of rows) {
      const okGold = p.gold >= r.cost;
      const label = r.atMax ? 'Maxed' : (okGold ? `💰 ${r.cost}` : `💰 ${r.cost}`);
      html += `<div class="mount-row ${r.atMax ? 'active' : (okGold ? '' : 'locked')}" data-up="${r.key}">
        <div class="mr-glyph">${r.glyph}</div>
        <div class="mr-info"><div class="mr-name">${r.name}</div>
          <div class="mr-desc">${r.desc}</div>
          <div class="mr-stat">${r.cur} ${r.unit}${r.atMax ? ' (max)' : ` → ${r.cur + r.step} ${r.unit}`}</div></div>
        <button class="mr-btn" ${r.atMax || !okGold ? 'disabled' : ''}>${label}</button></div>`;
    }
    html += `</div>`;
    this.upgradeBody.innerHTML = html;
    this.upgradeBody.querySelectorAll('.mount-row').forEach((row) => {
      const btn = row.querySelector('.mr-btn');
      btn.onclick = () => {
        const key = row.dataset.up;
        if (key === 'inv') {
          if (p.invAtMax()) { this.log('Your backpack is already at maximum size.', 'sys'); return; }
          const c = p.invUpgradeCost();
          if (p.gold < c) { this.log('Not enough gold.', 'sys'); return; }
          if (p.buyInvUpgrade()) { this.log(`Backpack expanded to <b>${p.maxInventory} slots</b>.`, 'xp'); if (this.inventoryOpen) this.renderInventory(); this.renderUpgradeShop(); }
        } else {
          if (p.matAtMax()) { this.log('Your crafting pouch is already at maximum size.', 'sys'); return; }
          const c = p.matUpgradeCost();
          if (p.gold < c) { this.log('Not enough gold.', 'sys'); return; }
          if (p.buyMatUpgrade()) { this.log(`Crafting pouch expanded to <b>${p.maxMaterials} stacks</b>.`, 'xp'); if (this.craftingOpen) this.renderCrafting(); this.renderUpgradeShop(); }
        }
      };
    });
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
    const equip = EQUIP_SLOTS.filter((sl) => player.gear[sl]).map((sl) => {
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
    const sub = area.sub != null ? area.sub : (area.safe ? 'Safe Haven' : 'Recommended Level ' + area.level + '+');
    this.areaBanner.innerHTML = `<div class="ab-name">${area.name}</div><div class="ab-sub">${sub}</div>`;
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
            <div><span class="lg" style="background:#0a0d13;border:1px solid #333"></span> Unexplored (fog)</div>
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

    // Zoom + pan state. zoom 1 = whole continent; higher = closer in.
    this._wmZoom = 1; this._wmCenter = { x: 0, z: 0 };
    // Scroll to zoom toward the cursor.
    this.wmCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._wmZoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, e);
    }, { passive: false });
    // Drag to pan (pointer). A tiny drag still counts as a click (fast-travel).
    let dragging = false, lx = 0, ly = 0, moved = 0;
    this.wmCanvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging || !this.worldMapOpen) return;
      const rect = this.wmCanvas.getBoundingClientRect();
      const sc = 600 / rect.width;                     // client px → canvas px
      const view = (WORLD_SIZE * 2) / (this._wmZoom || 1);
      const wpp = view / 600;                          // world units per canvas px
      const dx = (e.clientX - lx) * sc, dy = (e.clientY - ly) * sc;
      moved += Math.abs(dx) + Math.abs(dy);
      this._wmCenter.x -= dx * wpp; this._wmCenter.z -= dy * wpp;
      this._clampWmCenter();
      lx = e.clientX; ly = e.clientY;
      if (moved > 4) this.renderWorldMap();
    });
    window.addEventListener('pointerup', () => { dragging = false; this._wmDragged = moved > 5; });
    // Zoom buttons + reset.
    const zoomBtns = document.createElement('div');
    zoomBtns.className = 'wm-zoom';
    zoomBtns.style.cssText = 'position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:6px;';
    zoomBtns.innerHTML = '<button data-z="in">＋</button><button data-z="out">－</button><button data-z="fit">⤢</button>';
    for (const b of zoomBtns.querySelectorAll('button')) b.style.cssText = 'width:34px;height:34px;font-size:18px;font-weight:bold;background:#1a2230;color:#cfe0ff;border:1px solid #3a4a5a;border-radius:6px;cursor:pointer;';
    zoomBtns.querySelector('[data-z="in"]').onclick = () => this._wmZoomAt(1.4);
    zoomBtns.querySelector('[data-z="out"]').onclick = () => this._wmZoomAt(1 / 1.4);
    zoomBtns.querySelector('[data-z="fit"]').onclick = () => { this._wmZoom = 1; this._wmCenter = { x: 0, z: 0 }; this.renderWorldMap(); };
    const body = ov.querySelector('.wm-body');
    body.style.position = 'relative';
    body.appendChild(zoomBtns);
  }

  _clampWmCenter() {
    const view = (WORLD_SIZE * 2) / (this._wmZoom || 1);
    const lim = Math.max(0, WORLD_SIZE - view / 2); // keep the view over the world
    this._wmCenter.x = Math.max(-lim, Math.min(lim, this._wmCenter.x));
    this._wmCenter.z = Math.max(-lim, Math.min(lim, this._wmCenter.z));
  }

  // Zoom by a factor, keeping the world point under the cursor fixed (if given).
  _wmZoomAt(factor, e) {
    const prev = this._wmZoom || 1;
    const next = Math.max(1, Math.min(8, prev * factor));
    if (next === prev) return;
    if (e) {
      const rect = this.wmCanvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (600 / rect.width);
      const py = (e.clientY - rect.top) * (600 / rect.height);
      const vPrev = (WORLD_SIZE * 2) / prev;
      // World point under the cursor before zoom.
      const wx = this._wmCenter.x + (px / 600 - 0.5) * vPrev;
      const wz = this._wmCenter.z + (py / 600 - 0.5) * vPrev;
      const vNext = (WORLD_SIZE * 2) / next;
      // Re-centre so that same world point stays under the cursor.
      this._wmCenter.x = wx - (px / 600 - 0.5) * vNext;
      this._wmCenter.z = wz - (py / 600 - 0.5) * vNext;
    }
    this._wmZoom = next;
    this._clampWmCenter();
    this.renderWorldMap();
  }
  toggleWorldMap(player, enemies) {
    this._ensureWorldMap();
    this._wmPlayer = player; this._wmEnemies = enemies;
    if (this.worldMapOpen) this.closeWorldMap();
    else { this.worldMapOpen = true; this.wmOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this._wmZoom = 1; this._wmCenter = { x: 0, z: 0 }; this.renderWorldMap(); }
  }
  closeWorldMap() { this.worldMapOpen = false; if (this.wmOverlay) this.wmOverlay.classList.add('hidden'); }

  // The current map view transform (zoom + pan aware). `span` is the full world;
  // `view` is how much of it is visible across the 600px canvas.
  _wmView() {
    const S = 600, span = WORLD_SIZE * 2, half = WORLD_SIZE;
    const zoom = this._wmZoom || 1;
    const view = span / zoom;
    const cx = (this._wmCenter && this._wmCenter.x) || 0;
    const cz = (this._wmCenter && this._wmCenter.z) || 0;
    const originX = cx - view / 2, originZ = cz - view / 2;
    return {
      S, span, half, zoom, view,
      kx: (wx) => (wx - originX) / view * S,
      kz: (wz) => (wz - originZ) / view * S,
      kr: (r) => r / view * S,
    };
  }

  // Build (once) a shaded terrain image of the whole continent by sampling the
  // heightfield + blended biome colours, with hill-shading, water, and snow
  // caps. Cached — it's static, so only the fog overlay changes per render.
  _buildWmTerrain() {
    if (this._wmTerrain) return this._wmTerrain;
    const TS = 360, span = WORLD_SIZE * 2, half = WORLD_SIZE;
    const cv = document.createElement('canvas'); cv.width = TS; cv.height = TS;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(TS, TS); const d = img.data;
    const W = WATER_LEVEL;
    for (let py = 0; py < TS; py++) {
      const wz = py / TS * span - half;
      for (let px = 0; px < TS; px++) {
        const wx = px / TS * span - half;
        const h = heightAt(wx, wz);
        let r, g, b;
        if (h < W) {
          const t = Math.max(0, Math.min(1, (W - h) / 16)); // deeper = darker
          r = 36 * (1 - t) + 8 * t; g = 104 * (1 - t) + 34 * t; b = 150 * (1 - t) + 86 * t;
        } else {
          const col = biomeColorAt(wx, wz, h); // shared THREE.Color (read immediately)
          // Hill-shade from the local slope toward the NW "sun".
          const slope = (heightAt(wx + 3, wz) - heightAt(wx - 3, wz)) + (heightAt(wx, wz + 3) - heightAt(wx, wz - 3));
          const shade = Math.max(0.6, Math.min(1.4, 1 - slope * 0.04 + h * 0.006));
          r = Math.min(255, col.r * 255 * shade); g = Math.min(255, col.g * 255 * shade); b = Math.min(255, col.b * 255 * shade);
        }
        const i = (py * TS + px) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    // Snow caps on the big mountains.
    for (const m of MOUNTAINS) {
      const mx = (m.x + half) / span * TS, mz = (m.z + half) / span * TS, mr = m.r / span * TS;
      const grad = cx.createRadialGradient(mx, mz, 0, mx, mz, mr);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.6, 'rgba(230,238,250,0.5)'); grad.addColorStop(1, 'rgba(200,210,230,0)');
      cx.fillStyle = grad; cx.beginPath(); cx.arc(mx, mz, mr, 0, 7); cx.fill();
    }
    this._wmTerrain = cv; return cv;
  }
  _wmExplored(player, x, z) {
    const span = WORLD_SIZE * 2, half = WORLD_SIZE;
    const gx = Math.floor((x + half) / span * MAP_GRID), gz = Math.floor((z + half) / span * MAP_GRID);
    return player.explored.has(gz * MAP_GRID + gx);
  }
  renderWorldMap() {
    const w = this._world, player = this._wmPlayer, enemies = this._wmEnemies || [];
    if (!w) return;
    const ctx = this.wmCanvas.getContext('2d');
    const v = this._wmView();
    const { S, span, half } = v;

    // Fog of war: start dark, then paint in only the explored cells of the
    // cached terrain image (transformed by the current zoom/pan).
    ctx.fillStyle = '#0a0d13'; ctx.fillRect(0, 0, S, S);
    const terr = this._buildWmTerrain();
    const TS = terr.width, GRID = MAP_GRID;
    const cellW = span / GRID;        // world units per fog cell
    const cellT = TS / GRID;          // terrain-image px per fog cell
    ctx.imageSmoothingEnabled = true;
    for (const idx of player.explored) {
      const gx = idx % GRID, gz = Math.floor(idx / GRID);
      const wx0 = -half + gx * cellW, wz0 = -half + gz * cellW;
      const dx = v.kx(wx0), dy = v.kz(wz0), dS = v.kr(cellW) + 1;
      if (dx > S || dy > S || dx + dS < 0 || dy + dS < 0) continue; // off-screen cull
      ctx.drawImage(terr, gx * cellT, gz * cellT, cellT, cellT, dx, dy, dS, dS);
    }

    // Roads (Nexus → towns) — faint, drawn over the revealed terrain.
    ctx.strokeStyle = 'rgba(60,46,30,0.55)'; ctx.lineWidth = 3;
    for (const t of TOWNS) { if (t.nexus) continue; ctx.beginPath(); ctx.moveTo(v.kx(0), v.kz(0)); ctx.lineTo(v.kx(t.x), v.kz(t.z)); ctx.stroke(); }

    // Areas — ONLY those the player has discovered.
    for (const a of AREAS) {
      if (a.safe || !player.discoveredAreas.has(a.name)) continue;
      ctx.fillStyle = 'rgba(90,169,255,0.10)'; ctx.strokeStyle = 'rgba(120,190,255,0.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(v.kx(a.x), v.kz(a.z), v.kr(a.r), 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cfe7ff'; ctx.font = 'bold 10px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText(`${a.name} (Lv${a.level})`, v.kx(a.x), v.kz(a.z) - v.kr(a.r) - 3);
    }
    // Elite camps & landmark sites — only where you've explored.
    ctx.fillStyle = '#cc8844';
    for (const c of w.camps) { if (!this._wmExplored(player, c.pos.x, c.pos.z)) continue; ctx.beginPath(); ctx.arc(v.kx(c.pos.x), v.kz(c.pos.z), 4, 0, 7); ctx.fill(); }
    // Named landmarks (castles, mage tower, fishing villages) once discovered.
    for (const lm of (w.landmarks || [])) {
      if (!this._wmExplored(player, lm.x, lm.z)) continue;
      ctx.fillStyle = lm.color || '#cbb'; ctx.font = '13px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText(lm.glyph || '⚑', v.kx(lm.x), v.kz(lm.z) + 4);
      ctx.fillStyle = '#e6dcc4'; ctx.font = 'bold 10px Trebuchet MS';
      ctx.fillText(lm.name, v.kx(lm.x), v.kz(lm.z) - 8);
    }
    ctx.font = 'bold 11px Trebuchet MS';
    for (const e of enemies) {
      if (!e.boss || !e.alive || !this._wmExplored(player, e.pos.x, e.pos.z)) continue;
      ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(v.kx(e.pos.x), v.kz(e.pos.z), 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb0b0'; ctx.textAlign = 'center'; ctx.fillText('☠ ' + e.bossName, v.kx(e.pos.x), v.kz(e.pos.z) - 8);
    }
    // Bonfires — discovered ones are travel points; others stay hidden in fog.
    this._wmBonfires = w.bonfires.map((b) => ({ b, cx: v.kx(b.pos.x), cy: v.kz(b.pos.z), found: player.discovered.includes(b.name) }));
    for (const m of this._wmBonfires) {
      if (!m.found && !this._wmExplored(player, m.b.pos.x, m.b.pos.z)) continue;
      ctx.fillStyle = m.found ? '#ff8a2a' : 'rgba(150,120,90,0.6)';
      ctx.beginPath(); ctx.arc(m.cx, m.cy, 5, 0, 7); ctx.fill();
      if (m.found) { ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // Towns — major landmarks; shown once their ground has been explored.
    for (const t of TOWNS) {
      if (!t.nexus && !this._wmExplored(player, t.x, t.z)) continue;
      ctx.fillStyle = '#d8b24a'; ctx.fillRect(v.kx(t.x) - 4, v.kz(t.z) - 4, 8, 8);
      ctx.strokeStyle = '#3a2c14'; ctx.lineWidth = 1; ctx.strokeRect(v.kx(t.x) - 4, v.kz(t.z) - 4, 8, 8);
      ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 11px Trebuchet MS'; ctx.textAlign = 'center';
      ctx.fillText(t.name, v.kx(t.x), v.kz(t.z) + 16);
    }
    // Player (with a heading tick).
    ctx.fillStyle = '#7be38a'; ctx.beginPath(); ctx.arc(v.kx(player.pos.x), v.kz(player.pos.z), 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    this._canTravel = !!(w.nearestBonfire(player.pos, 6) || w.inSafeZone(player.pos.x, player.pos.z));
    this.wmHint.textContent = `${this._canTravel ? 'Click a discovered bonfire to fast-travel.' : 'Stand at a bonfire or town to fast-travel.'}  ·  Scroll to zoom, drag to pan (${(this._wmZoom || 1).toFixed(1)}×)`;
    this.wmHint.style.color = this._canTravel ? '#9be29e' : '#caa';
  }
  _worldMapClick(e) {
    if (this._wmDragged) { this._wmDragged = false; return; } // was a pan, not a click
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

  // ---- Wardrobe (in-game appearance change) ----
  _ensureWardrobe() {
    if (this.wardrobeOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel wardrobe-panel">
        <div class="inv-header"><span>🪞 Wardrobe</span><button class="inv-close">✕</button></div>
        <div class="wardrobe-body">
          <div class="wardrobe-stage"><canvas id="wardrobe-canvas" class="preview-canvas" width="220" height="300"></canvas>
            <div class="wardrobe-hint">Unlock more looks by completing achievements &amp; boss quest lines.</div></div>
          <div id="wardrobe-controls" class="customize-controls"></div>
        </div></div>`;
    document.body.appendChild(ov);
    this.wardrobeOverlay = ov;
    this.wardrobeControls = ov.querySelector('#wardrobe-controls');
    ov.querySelector('.inv-close').onclick = () => this.closeWardrobe();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeWardrobe(); });
  }
  toggleWardrobe(player) {
    this._ensureWardrobe();
    if (this.wardrobeOpen) { this.closeWardrobe(); return; }
    this.wardrobeOpen = true;
    this._wardrobePlayer = player;
    // Edit a copy; apply live to the real character so you see it behind the panel.
    this._wardrobeApp = normalizeAppearance({ ...player.appearance }, player.classId);
    this.wardrobeOverlay.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
    if (!this._wardrobePreview) this._wardrobePreview = new CharacterPreview(this.wardrobeOverlay.querySelector('#wardrobe-canvas'));
    this._buildCustomizer(this.wardrobeControls, this._wardrobeApp, () => {
      player.setAppearance(this._wardrobeApp);
      if (this._wardrobePreview) this._wardrobePreview.setAppearance(this._wardrobeApp);
    });
    this._wardrobePreview.setAppearance(this._wardrobeApp);
    this._wardrobePreview.start();
  }
  closeWardrobe() {
    this.wardrobeOpen = false;
    if (this._wardrobePreview) this._wardrobePreview.stop();
    if (this.wardrobeOverlay) this.wardrobeOverlay.classList.add('hidden');
    // Persist the new look immediately so it survives even before the next rest.
    const p = this._wardrobePlayer;
    if (p) { p.setAppearance(this._wardrobeApp); try { Saves.write(p.toSave()); } catch { /* storage blocked */ } }
  }

  // Pop a toast when a new cosmetic is unlocked (mirrors the achievement toast).
  cosmeticToast(cos) {
    if (!this._toastWrap) {
      this._toastWrap = document.createElement('div');
      this._toastWrap.className = 'ach-toasts';
      this.el.hud.appendChild(this._toastWrap);
    }
    const t = document.createElement('div');
    t.className = 'ach-toast unique';
    t.innerHTML = `<div class="at-glyph">${cos.glyph}</div><div class="at-text">
        <div class="at-title">COSMETIC UNLOCKED!</div>
        <div class="at-rew">${cos.name} — try it at a 🪞 Wardrobe (press N)</div></div>`;
    this._toastWrap.appendChild(t);
    this.log(`🪞 Cosmetic unlocked: ${cos.glyph} ${cos.name} — change your look with N.`, 'xp');
    if (this.audio) this.audio.play('level');
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, 4200);
  }

  // ---- Achievements ----
  _ensureAchievements() {
    if (this.achOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'inv-overlay hidden';
    ov.innerHTML = `<div class="inv-panel skills-panel"><div class="inv-header"><span>🏆 Achievements</span><button class="inv-close">✕</button></div><div class="skills-body ach-body"></div></div>`;
    document.body.appendChild(ov);
    this.achOverlay = ov;
    this.achBody = ov.querySelector('.ach-body');
    ov.querySelector('.inv-close').onclick = () => this.closeAchievements();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeAchievements(); });
  }
  toggleAchievements(player) {
    this._ensureAchievements();
    this._achPlayer = player;
    if (this.achievementsOpen) this.closeAchievements();
    else { this.achievementsOpen = true; this.achOverlay.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); this.renderAchievements(player); }
  }
  closeAchievements() { this.achievementsOpen = false; if (this.achOverlay) this.achOverlay.classList.add('hidden'); }
  renderAchievements(player) {
    const fmtNum = (n) => n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : Math.floor(n);
    const endgame = Achievements.endgameReady(player);
    const rows = Achievements.ACHIEVEMENTS.map((a) => {
      const pr = Achievements.progress(player, a);
      const locked = a.capstone && !endgame && pr.claimed === 0;
      const nodes = a.tiers.map((tier, i) => {
        const got = i < pr.claimed;
        const unique = Achievements.isUnique(tier);
        const cls = `ach-node${got ? ' got' : ''}${unique ? ' unique' : ''}`;
        return `<div class="${cls}" title="${Achievements.rewardLabel(tier.reward)}">
            <div class="ach-tier">${got ? '✓' : fmtNum(tier.count)}</div>
            <div class="ach-rew">${Achievements.rewardLabel(tier.reward)}</div>
          </div>`;
      }).join('<div class="ach-link"></div>');
      const bar = pr.done
        ? `<span class="ach-complete">COMPLETE</span>`
        : locked
          ? `<span class="ach-locked">🔒 Complete every other achievement to make the dragon descend.</span>`
          : `<div class="ach-bar"><div class="ach-fill" style="width:${Math.round(pr.frac * 100)}%"></div></div>
             <span class="ach-count">${fmtNum(pr.val)} / ${fmtNum(pr.next.count)} ${a.noun}</span>`;
      return `<div class="ach-row${a.capstone ? ' capstone' : ''}">
          <div class="ach-head"><span class="ach-glyph">${a.glyph}</span>
            <span class="ach-name">${a.name}</span><span class="ach-cat">${a.cat}</span></div>
          ${bar}
          <div class="ach-track">${nodes}</div>
        </div>`;
    }).join('');
    this.achBody.innerHTML = `<div class="ach-intro">Earn lifetime milestones for everything you do. Each chain ends in a <b>unique reward</b> — and finishing them all summons the <b>🐉 end-boss dragon</b>.</div>${rows}`;
  }
  // A toast when a tier is earned (mid-tier = stat boost, final = unique).
  achievementToast(ach, idx, tier) {
    if (!this._toastWrap) {
      this._toastWrap = document.createElement('div');
      this._toastWrap.className = 'ach-toasts';
      this.el.hud.appendChild(this._toastWrap);
    }
    const unique = Achievements.isUnique(tier);
    const t = document.createElement('div');
    t.className = 'ach-toast' + (unique ? ' unique' : '');
    t.innerHTML = `<div class="at-glyph">${ach.glyph}</div><div class="at-text">
        <div class="at-title">${unique ? 'UNIQUE REWARD!' : 'Achievement!'} ${ach.name}</div>
        <div class="at-rew">${Achievements.rewardLabel(tier.reward)}</div></div>`;
    this._toastWrap.appendChild(t);
    this.log(`🏆 ${ach.name} — ${Achievements.rewardLabel(tier.reward)}`, 'xp');
    if (this.audio) this.audio.play('level');
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, 4200);
    // Keep the panel fresh if it's open.
    if (this.achievementsOpen && this._achPlayer) this.renderAchievements(this._achPlayer);
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
