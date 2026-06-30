// ============================================================
// Input: a single abstraction the game reads each frame. Three
// sources feed it — keyboard + mouse (pointer lock), a GAMEPAD
// (polled via the Gamepad API), and on-screen TOUCH controls
// (see touch.js). Gamepad/touch synthesise the same key "codes"
// (KeyW, Space, Digit1, …) plus an analog move axis and look delta,
// so the rest of the game needs no special cases.
// ============================================================

// Standard-gamepad button indices.
const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};
const DEAD = 0.22;          // analog stick deadzone
const PAD_LOOK = 1150;      // right-stick look speed (→ pixels/sec of mouse-equiv)
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // currently-held key codes (keyboard)
    this.vheld = new Set();         // currently-held VIRTUAL codes (pad/touch)
    this.pressed = new Set();       // pressed this frame (keyboard + virtual edges)
    this.mouse = { dx: 0, dy: 0 };  // accumulated look delta (mouse + pad + touch)
    this.axis = { x: 0, z: 0 };     // analog move axis (pad stick / touch joystick)
    this.wheel = 0;
    this.lmb = false;               // attack held (mouse / pad RT / touch attack)
    this.lmbPressed = false;        // attack pressed this frame
    this.locked = false;
    this.enabled = false;           // gated until the player enters the world
    this.typing = false;            // true while chat box is focused (suppress game keys)
    this.touchDevice = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
      || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.padActive = false;         // a gamepad provided input recently
    this._padDesired = new Set();   // virtual codes the pad held last poll

    window.addEventListener('keydown', (e) => {
      if (this.typing) return;
      if (!this.enabled) return;
      // Prevent browser scroll on space/arrows.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });

    // Pointer lock for mouse-look (skipped on touch devices).
    canvas.addEventListener('click', () => {
      if (this.touchDevice) return;
      if (this.enabled && !this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; });
    window.addEventListener('wheel', (e) => { if (this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });

    window.addEventListener('gamepadconnected', () => { this.padActive = true; });
  }

  // ---- Virtual buttons (touch / gamepad synthesise key "codes") ----
  pressVirtual(code) {
    if (!this.enabled) return;
    if (!this.vheld.has(code)) this.pressed.add(code); // edge for just()
    this.vheld.add(code);
  }
  releaseVirtual(code) { this.vheld.delete(code); }
  setLmb(on) {
    if (!this.enabled) { this.lmb = false; return; }
    if (on && !this.lmb) this.lmbPressed = true;
    this.lmb = on;
  }
  addLook(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }
  setAxis(x, z) { this.axis.x = x; this.axis.z = z; }
  addWheel(n) { if (this.enabled) this.wheel += n; }

  // ---- Gamepad: poll once per frame and translate to the unified state ----
  pollGamepad(dt) {
    if (!this.enabled || typeof navigator.getGamepads !== 'function') return;
    let gp = null;
    for (const g of navigator.getGamepads()) { if (g && g.connected) { gp = g; break; } }
    if (!gp) { if (this._padDesired.size) { for (const c of this._padDesired) this.releaseVirtual(c); this._padDesired = new Set(); } return; }

    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);

    // Left stick → analog move; right stick → look.
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    if (lx || ly) { this.axis.x = lx; this.axis.z = -ly; this.padActive = true; }
    else if (this.padActive) { this.axis.x = 0; this.axis.z = 0; }
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { this.mouse.dx += rx * PAD_LOOK * dt; this.mouse.dy += ry * PAD_LOOK * dt; this.padActive = true; }

    // RT = attack (held). LT held = "ability layer" for the face buttons.
    this.setLmb(val(PAD.RT) > 0.4);
    const layer = val(PAD.LT) > 0.4;

    // Build the set of virtual codes the pad wants held this frame, then diff
    // against last frame so codes change cleanly (e.g. when the layer toggles).
    const want = new Set();
    if (!layer && b(PAD.LB)) want.add('ShiftLeft');            // sprint (hold)
    const face = layer
      ? { [PAD.A]: 'Digit1', [PAD.B]: 'Digit2', [PAD.X]: 'Digit3', [PAD.Y]: 'Digit4', [PAD.RB]: 'Digit5', [PAD.LB]: 'Digit6' }
      : { [PAD.A]: 'Space', [PAD.B]: 'KeyE', [PAD.X]: 'KeyQ', [PAD.Y]: 'KeyR', [PAD.RB]: 'Tab' };
    for (const i in face) if (b(+i)) want.add(face[i]);
    const menus = { [PAD.UP]: 'KeyI', [PAD.DOWN]: 'KeyK', [PAD.LEFT]: 'KeyM', [PAD.RIGHT]: 'KeyJ' };
    for (const i in menus) if (b(+i)) want.add(menus[i]);
    if (b(PAD.START)) want.add('KeyC');
    if (b(PAD.BACK)) want.add('KeyB');
    if (b(PAD.L3)) want.add('KeyT');

    if (want.size || this._padDesired.size) this.padActive = true;
    for (const code of want) if (!this._padDesired.has(code)) this.pressVirtual(code);
    for (const code of this._padDesired) if (!want.has(code)) this.releaseVirtual(code);
    this._padDesired = want;
  }

  // Should the aiming reticle be shown? (mouse-look, gamepad, or touch.)
  get aiming() { return this.locked || this.padActive || this.touchDevice; }

  // Movement axis from WASD or the analog stick/joystick, local space
  // (x = strafe, z = forward). Clamped to the unit square.
  moveAxis() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.axis.x; z += this.axis.z;
    return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) };
  }

  down(code) { return this.keys.has(code) || this.vheld.has(code); }
  just(code) { return this.pressed.has(code); }

  // Pull-and-clear the accumulated look delta.
  consumeLook() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0; this.mouse.dy = 0;
    return d;
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  // Call at end of each frame to clear edge-triggered state.
  endFrame() {
    this.pressed.clear();
    this.lmbPressed = false;
  }
}
