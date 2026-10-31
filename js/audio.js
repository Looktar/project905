// Tiny synthesized sound effects with WebAudio (no audio files needed).
let ctx = null, master = null, muted = false;
let engine = null, siren = null;

export function unlock() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; }
export function isMuted() { return muted; }

function noiseBuf(dur) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t0, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
export function punch(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
  env(g, t, 0.005, 0.14, 0.7 * vol); o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(0.08);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
  const g2 = ctx.createGain(); env(g2, t, 0.002, 0.07, 0.4 * vol);
  n.connect(f).connect(g2).connect(master); n.start(t);
}
export function scream(vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime, base = 500 + Math.random() * 350;
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.12); o.frequency.linearRampToValueAtTime(base * 0.8, t + 0.5);
  lfo.frequency.value = 9; lg.gain.value = 25; lfo.connect(lg).connect(o.frequency);
  env(g, t, 0.03, 0.5, 0.18 * vol); o.connect(g).connect(master);
  o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
}
export function crash(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(0.4);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
  const g = ctx.createGain(); env(g, t, 0.005, 0.35, 0.6 * Math.min(1, vol));
  n.connect(f).connect(g).connect(master); n.start(t);
}
export function horn() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const fr of [392, 494]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.28); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.36);
  }
}
export function cuffs() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 660, 440].forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = fr; env(g, t + i * 0.16, 0.01, 0.14, 0.08); o.connect(g).connect(master); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.2); });
}
// continuous engine sound: call every frame (speed 0..1, on/off)
export function engineUpdate(on, speed01) {
  if (!ctx) return;
  if (on && !engine) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
    o.connect(f).connect(g).connect(master); o.start();
    engine = { o, f, g };
  }
  if (engine) {
    const t = ctx.currentTime;
    engine.o.frequency.setTargetAtTime(38 + speed01 * 95, t, 0.08);
    engine.f.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
    engine.g.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }
}
// police siren: level 0..1 by distance
export function sirenUpdate(level) {
  if (!ctx) return;
  if (level > 0.01 && !siren) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; g.gain.value = 0; o.connect(g).connect(master); o.start();
    siren = { o, g, ph: 0 };
  }
  if (siren) {
    const t = ctx.currentTime;
    siren.ph = (siren.ph + 1) % 60;
    siren.o.frequency.setTargetAtTime(siren.ph < 30 ? 960 : 700, t, 0.03);
    siren.g.gain.setTargetAtTime(level * 0.06, t, 0.1);
  }
}
