// Tiny WebAudio synth: every sound is generated, there are no audio files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.engine = null; this.siren = null; }
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.5; this.out.connect(this.ctx.destination);
    const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.5; }
  tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, freq, vol = 0.4, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur);
  }
  play(k, e) {
    if (!this.ctx || this.muted) return;
    if (k === 'whoosh') this.burst(0.12, 1800, 0.15, 2);
    else if (k === 'hit') { this.burst(0.09, 900, 0.5); this.tone('square', 220, 80, 0.12, 0.25); }
    else if (k === 'down') { this.tone('sine', 500, 120, 0.35, 0.25); this.tone('triangle', 900, 1400, 0.12, 0.12, 0.3); }
    else if (k === 'crash') { this.burst(e.tier === 'large' ? 0.4 : 0.22, 300, e.tier === 'large' ? 0.8 : 0.5, 0.6); this.tone('sawtooth', 120, 40, 0.2, 0.3); }
    else if (k === 'honk') { this.tone('square', 392, 392, 0.22, 0.12); this.tone('square', 494, 494, 0.22, 0.12); }
    else if (k === 'enter' || k === 'exit') { this.burst(0.06, 500, 0.3); this.tone('sine', 180, 120, 0.08, 0.2, 0.05); }
    else if (k === 'wanted') { this.tone('square', 700, 700, 0.12, 0.15); this.tone('square', 930, 930, 0.16, 0.15, 0.14); }
    else if (k === 'busted') { this.tone('triangle', 520, 520, 0.16, 0.25); this.tone('triangle', 390, 390, 0.16, 0.25, 0.18); this.tone('triangle', 260, 200, 0.4, 0.25, 0.36); }
    else if (k === 'escaped') { this.tone('triangle', 520, 520, 0.1, 0.2); this.tone('triangle', 660, 660, 0.1, 0.2, 0.1); this.tone('triangle', 880, 880, 0.2, 0.2, 0.2); }
  }
  // continuous engine + siren, driven every frame
  loop(inCar, speed, siren) {
    if (!this.ctx) return;
    if (!this.engine) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(this.out); o.start();
      this.engine = { o, g };
      const so = this.ctx.createOscillator(), sg = this.ctx.createGain();
      so.type = 'triangle'; sg.gain.value = 0; so.connect(sg); sg.connect(this.out); so.start();
      this.siren = { o: so, g: sg };
    }
    const t = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(inCar ? 0.07 : 0, t, 0.08);
    this.engine.o.frequency.setTargetAtTime(55 + Math.abs(speed) * 7, t, 0.06);
    this.siren.g.gain.setTargetAtTime(siren ? 0.06 : 0, t, 0.1);
    this.siren.o.frequency.setTargetAtTime(siren ? 650 + 250 * Math.sign(Math.sin(t * 5)) : 600, t, 0.08);
  }
}
