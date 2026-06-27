// ============================================================
// Tiny WebAudio synth for SFX. No asset files — every sound is a
// short generated blip so the whole game stays self-contained.
// ============================================================
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  // Must be called from a user gesture (the Enter button) to satisfy
  // browser autoplay policies.
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { this.enabled = false; }
  }

  _blip(freq, dur, type = 'square', gain = 0.06, slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }

  play(name) {
    switch (name) {
      case 'swing': this._blip(220, 0.09, 'triangle', 0.04, 160); break;
      case 'hit':   this._blip(140, 0.08, 'square', 0.05, 90); break;
      case 'cast':  this._blip(520, 0.16, 'sawtooth', 0.04, 880); break;
      case 'kill':  this._blip(330, 0.12, 'square', 0.05, 110); break;
      case 'level': this._blip(523, 0.18, 'triangle', 0.07, 1046); setTimeout(() => this._blip(784, 0.22, 'triangle', 0.07), 120); break;
      case 'hurt':  this._blip(180, 0.14, 'sawtooth', 0.06, 70); break;
      case 'rest':  this._blip(440, 0.3, 'sine', 0.05, 660); break;
      case 'death': this._blip(200, 0.6, 'sawtooth', 0.08, 50); break;
    }
  }
}
