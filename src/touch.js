// ============================================================
// Touch controls: an on-screen overlay for phones/tablets that
// feeds the shared Input (a left analog joystick for movement, a
// right-side drag area for camera look + pinch-zoom, and tap/hold
// buttons that synthesise the same key codes the game already reads).
// Built in JS so there's no markup to maintain in index.html.
// ============================================================

const LOOK_SENS = 1.7;     // touch-drag → mouse-equivalent look speed
const STICK_R = 56;        // joystick travel radius (px)

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.className = 'hidden';
    this.root.innerHTML = this._markup();
    document.body.appendChild(this.root);

    this.stick = this.root.querySelector('#tc-stick');
    this.knob = this.root.querySelector('#tc-knob');
    this.lookArea = this.root.querySelector('#tc-look');

    this._stickId = null;       // active touch id driving the joystick
    this._lookId = null;        // active touch id driving look
    this._lookLast = null;      // last look position
    this._pinch = null;         // {dist} for two-finger zoom

    this._wireStick();
    this._wireLook();
    this._wireButtons();
  }

  _markup() {
    // Action cluster + ability bar + menu strip. data-attrs drive behaviour:
    //   data-act="attack"  → holds the attack input
    //   data-hold="CODE"   → presses while held (sprint)
    //   data-press="CODE"  → a single edge press (tap)
    const abil = [1, 2, 3, 4, 5, 6].map((n) =>
      `<button class="tc-ab" data-press="Digit${n}"><span class="tc-ab-k">${n}</span><span class="tc-ab-g">·</span><span class="tc-ab-cd"></span></button>`).join('');
    const menu = [
      ['KeyI', '🎒'], ['KeyC', '🧍'], ['KeyJ', '📜'], ['KeyM', '🗺️'], ['KeyB', '🏆'],
      ['KeyK', '✨'], ['KeyL', '📖'], ['KeyN', '🪞'], ['KeyT', '👋'], ['KeyH', 'ℹ️'], ['KeyO', '⚙️'],
    ].map(([c, g]) => `<button class="tc-menu-btn" data-press="${c}">${g}</button>`).join('');
    return `
      <div id="tc-stick" class="tc-stick"><div id="tc-knob" class="tc-knob"></div></div>
      <div id="tc-look" class="tc-look"></div>
      <div class="tc-menus">${menu}</div>
      <div class="tc-abilities">${abil}</div>
      <div class="tc-actions">
        <button class="tc-btn tc-attack" data-act="attack">⚔️</button>
        <button class="tc-btn tc-jump" data-press="Space">⤴</button>
        <button class="tc-btn tc-interact" data-press="KeyE">E</button>
        <button class="tc-btn tc-sprint" data-hold="ShiftLeft">»</button>
        <button class="tc-btn tc-target" data-press="KeyF">🎯</button>
        <button class="tc-btn tc-swap" data-press="Tab">🔁</button>
        <button class="tc-btn tc-potion" data-press="KeyQ">🧪</button>
        <button class="tc-btn tc-mount" data-press="KeyR">🐎</button>
      </div>`;
  }

  // Show the controls (called once the player enters the world on a touch device).
  // The body flag lets the stylesheet shrink/hide desktop HUD bits (e.g. the
  // mouse hotbar, which the touch ability bar replaces).
  enable() { this.root.classList.remove('hidden'); document.body.classList.add('touch-mode'); }
  // Hide the movement/look/action layer while a full-screen menu is open so it
  // doesn't fight the menu for touches (the menu has its own buttons).
  setPlayVisible(on) { this.root.classList.toggle('tc-menuhidden', !on); }

  // Mirror the player's learned abilities onto the on-screen ability bar:
  // each button shows its skill glyph and a cooldown sweep; unused slots hide.
  syncHud(player) {
    if (!this._abEls) this._abEls = [...this.root.querySelectorAll('.tc-ab')];
    for (let i = 0; i < this._abEls.length; i++) {
      const btn = this._abEls[i];
      const learned = player.learned[i];
      if (!learned) { btn.style.display = 'none'; continue; }
      btn.style.display = '';
      const ab = player.ability(i);
      const g = btn.querySelector('.tc-ab-g'); if (g && ab) g.textContent = ab.glyph;
      const cd = player.cooldowns[i] || 0;
      const cdEl = btn.querySelector('.tc-ab-cd');
      if (cd > 0.05) { btn.classList.add('tc-cd'); cdEl.textContent = cd.toFixed(cd < 10 ? 1 : 0); }
      else { btn.classList.remove('tc-cd'); cdEl.textContent = ''; }
    }
  }

  _wireStick() {
    const rectCenter = () => { const r = this.stick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const move = (t) => {
      const c = rectCenter();
      let dx = t.clientX - c.x, dy = t.clientY - c.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setAxis(dx / STICK_R, -dy / STICK_R); // up = forward
    };
    this.stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; this._stickId = t.identifier; move(t);
    }, { passive: false });
    this.stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this._stickId) move(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._stickId) {
        this._stickId = null; this.knob.style.transform = 'translate(0,0)'; this.input.setAxis(0, 0);
      }
    };
    this.stick.addEventListener('touchend', end);
    this.stick.addEventListener('touchcancel', end);
  }

  _wireLook() {
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    this.lookArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) { this._pinch = { d: dist(e.touches[0], e.touches[1]) }; return; }
      const t = e.changedTouches[0]; this._lookId = t.identifier; this._lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    this.lookArea.addEventListener('touchmove', (e) => {
      e.preventDefault();
      // Two fingers → pinch zoom.
      if (e.touches.length >= 2 && this._pinch) {
        const d = dist(e.touches[0], e.touches[1]);
        const delta = d - this._pinch.d;
        if (Math.abs(delta) > 14) { this.input.addWheel(delta > 0 ? -1 : 1); this._pinch.d = d; }
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId || !this._lookLast) continue;
        this.input.addLook((t.clientX - this._lookLast.x) * LOOK_SENS, (t.clientY - this._lookLast.y) * LOOK_SENS);
        this._lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    const end = (e) => {
      if (e.touches.length < 2) this._pinch = null;
      for (const t of e.changedTouches) if (t.identifier === this._lookId) { this._lookId = null; this._lookLast = null; }
    };
    this.lookArea.addEventListener('touchend', end);
    this.lookArea.addEventListener('touchcancel', end);
  }

  _wireButtons() {
    for (const btn of this.root.querySelectorAll('button')) {
      const press = (e) => {
        e.preventDefault();
        btn.classList.add('tc-on');
        if (btn.dataset.act === 'attack') this.input.setLmb(true);
        else if (btn.dataset.hold) this.input.pressVirtual(btn.dataset.hold);
        else if (btn.dataset.press) this.input.pressVirtual(btn.dataset.press);
      };
      const release = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('tc-on');
        if (btn.dataset.act === 'attack') this.input.setLmb(false);
        else if (btn.dataset.hold) this.input.releaseVirtual(btn.dataset.hold);
        else if (btn.dataset.press) this.input.releaseVirtual(btn.dataset.press);
      };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
    }
  }
}
