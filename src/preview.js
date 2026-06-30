// ============================================================
// CharacterPreview: a tiny self-contained 3D viewport that shows a
// single stickman on a turntable, used by the creation screen and the
// in-game wardrobe so you can see your customisation live. It owns its
// own renderer/scene/camera, independent of the main game renderer.
// ============================================================
import * as THREE from 'three';
import { createStickman, applyAppearance, animateStickman } from './stickman.js';

export class CharacterPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;
    this._resize();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 4.4);
    this.camera.lookAt(0, 1.05, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.4);
    rim.position.set(-3, 2, -2); this.scene.add(rim);

    this.fig = createStickman({ appearance: null });
    this.scene.add(this.fig);

    this._spin = 0.4;     // current turntable yaw
    this._running = false;
    this._last = 0;
    this._loop = this._loop.bind(this);
  }

  _resize() {
    const w = this.canvas.clientWidth || 220, h = this.canvas.clientHeight || 300;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  setAppearance(app) {
    applyAppearance(this.fig, app);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._resize();
    this._last = (typeof performance !== 'undefined' ? performance.now() : 0);
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min(0.05, (now - this._last) / 1000 || 0.016);
    this._last = now;
    // Idle pose + slow turntable. animateStickman only touches rotation.x, so
    // spinning rotation.y here is free.
    animateStickman(this.fig, dt, { speed01: 0 });
    this._spin += dt * 0.6;
    this.fig.rotation.y = this._spin;
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._loop);
  }

  dispose() {
    this.stop();
    try { this.renderer.dispose(); } catch { /* ignore */ }
  }
}
