// ============================================================
// Input: keyboard state, mouse-look via pointer lock, and a few
// edge-triggered "just pressed" helpers. The game reads this each
// frame rather than wiring listeners everywhere.
// ============================================================

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // currently-held key codes
    this.pressed = new Set();       // pressed this frame (cleared after update)
    this.mouse = { dx: 0, dy: 0 };  // accumulated look delta
    this.wheel = 0;
    this.lmb = false;               // left mouse held
    this.lmbPressed = false;        // left mouse pressed this frame
    this.locked = false;
    this.enabled = false;           // gated until the player enters the world
    this.typing = false;            // true while chat box is focused (suppress game keys)

    window.addEventListener('keydown', (e) => {
      if (this.typing) return;
      if (!this.enabled) return;
      // Prevent browser scroll on space/arrows.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });

    // Pointer lock for mouse-look.
    canvas.addEventListener('click', () => {
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
  }

  // Movement axis from WASD, in local space (x = strafe, z = forward).
  moveAxis() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW')) z += 1;
    if (this.keys.has('KeyS')) z -= 1;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    return { x, z };
  }

  down(code) { return this.keys.has(code); }
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
