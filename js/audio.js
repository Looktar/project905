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

// ---- v0.3: fire + missions
export function ignite() {
  if (!ctx) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(0.5); f.type = 'bandpass'; f.frequency.value = 900;
  s.connect(f).connect(g).connect(master); env(g, t, 0.05, 0.4, 0.25); s.start(t);
}
export function boom() {
  if (!ctx) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(1.4); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(80, t + 1.2);
  s.connect(f).connect(g).connect(master); env(g, t, 0.01, 1.3, 1.0); s.start(t);
}
let hoseT = 0;
export function hose() {
  if (!ctx || ctx.currentTime < hoseT) return;
  hoseT = ctx.currentTime + 0.25;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(0.3); f.type = 'highpass'; f.frequency.value = 2500;
  s.connect(f).connect(g).connect(master); env(g, t, 0.03, 0.25, 0.08); s.start(t);
}
function tone(freq, t0, dur, vol, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; o.connect(g).connect(master); env(g, t0, 0.01, dur, vol); o.start(t0); o.stop(t0 + dur + 0.05);
}
export function ding() { if (ctx) tone(1320, ctx.currentTime, 0.25, 0.18); }
export function cash() { if (!ctx) return; const t = ctx.currentTime; tone(988, t, 0.12, 0.15, 'square'); tone(1319, t + 0.1, 0.3, 0.15, 'square'); }
// fire-truck siren: a slow wail (rises and falls), unlike the police two-tone
let fsiren = null;
export function fireSirenUpdate(level) {
  if (!ctx) return;
  if (level > 0.01 && !fsiren) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; g.gain.value = 0; o.connect(g).connect(master); o.start();
    fsiren = { o, g };
  }
  if (fsiren) {
    const t = ctx.currentTime, ph = (t % 3) / 3;
    fsiren.o.frequency.setTargetAtTime(520 + 380 * Math.sin(ph * Math.PI), t, 0.05);
    fsiren.g.gain.setTargetAtTime(level * 0.035, t, 0.1);
  }
}

// ---- 万锦三国志 (v0.9.4, D-81): war drums, clashing steel, fanfares, blind-box sparkle
export function drum(n = 2) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < n; i++) {
    const t0 = t + i * 0.22, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.25);
    env(g, t0, 0.005, 0.3, 0.8); o.connect(g).connect(master); o.start(t0); o.stop(t0 + 0.35);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
    s.buffer = noiseBuf(0.1); f.type = 'lowpass'; f.frequency.value = 600; env(g2, t0, 0.002, 0.08, 0.3);
    s.connect(f).connect(g2).connect(master); s.start(t0);
  }
}
export function clash(vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const fr of [1870, 2630, 3410]) tone(fr * (0.97 + Math.random() * 0.06), t, 0.35, 0.05 * vol, 'triangle');
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(0.15); f.type = 'highpass'; f.frequency.value = 3000; env(g, t, 0.001, 0.12, 0.35 * vol);
  s.connect(f).connect(g).connect(master); s.start(t);
}
export function fanfare(good = true) {
  if (!ctx) return;
  const t = ctx.currentTime, notes = good ? [523, 659, 784, 1047] : [392, 349, 311, 262];
  notes.forEach((fr, i) => tone(fr, t + i * 0.13, i === 3 ? 0.5 : 0.14, 0.12, good ? 'square' : 'triangle'));
}
export function sparkle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [1568, 1976, 2349, 3136, 2637].forEach((fr, i) => tone(fr, t + i * 0.06, 0.25, 0.07, 'sine'));
}
export function whoosh() {
  if (!ctx) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(0.6); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
  s.connect(f).connect(g).connect(master); env(g, t, 0.08, 0.45, 0.3); s.start(t);
}
// stop the street loops (engine, sirens) when leaving the streets
export function quiet() { engineUpdate(false, 0); sirenUpdate(0); fireSirenUpdate(0); }

// ---- 万锦三国志 background music (v0.9.8): synthesized, no audio files. A guzheng-like plucked
// melody in D major pentatonic (宫调) over a slow bass line and a frame drum. The melody is generated
// in four-bar sections (A A' B A'') so it repeats enough to sound like a tune but never loops exactly.
// mood 'battle' plays faster with more drums (the month's battles).
const PENTA = [0, 2, 4, 7, 9], ROOTS = [0, -3, -7, -5]; // D, Bm, G, A
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const scaleNote = (i) => 62 + PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5); // i = 0 is D4
let bgmOn = false, bgmMood = 'calm', bgmBus = null, bgmTimer = 0, bgmNext = 0, bgmStep = 0, bgmSection = null;
function pluck(freq, t0, vol, len = 1.4) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.985, t0); o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.04); // the string bends into tune
  o2.frequency.value = freq * 2; g2.gain.value = 0.25;
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t0); f.frequency.exponentialRampToValueAtTime(700, t0 + len);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(bgmBus);
  o.start(t0); o2.start(t0); o.stop(t0 + len + 0.05); o2.stop(t0 + len + 0.05);
}
function bass(freq, t0, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bgmBus); o.start(t0); o.stop(t0 + dur + 0.05);
}
function frameDrum(t0, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.3);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  o.connect(g).connect(bgmBus); o.start(t0); o.stop(t0 + 0.4);
}
function woodblock(t0, vol) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(0.05); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 6;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  s.connect(f).connect(g).connect(bgmBus); s.start(t0);
}
// one bar = 8 eighth notes; a phrase is 8 steps of scale indices (null = rest, '-' = hold)
function phrase(root) {
  const rhythms = [[1, 0, 1, 1, 1, '-', 1, '-'], [1, 1, 1, 0, 1, '-', '-', '-'], [1, '-', 1, 1, 1, 1, 1, '-'], [1, 0, 1, 0, 1, 1, 1, '-']];
  const r = rhythms[Math.floor(Math.random() * rhythms.length)];
  let i = 5 + root + Math.floor(Math.random() * 3);
  return r.map((x) => { if (x !== 1) return x === 0 ? null : '-'; i += [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]; i = Math.max(2, Math.min(12, i)); return i; });
}
function newSection() {
  const A = phrase(0), A2 = [...A.slice(0, 5), ...phrase(0).slice(5)], B = phrase(2), A3 = [...A.slice(0, 4), ...phrase(-1).slice(4)];
  A3[6] = 5; A3[7] = '-'; // every section comes home to D
  return [A, A2, B, A3];
}
function bgmTick() {
  if (!ctx || !bgmOn) return;
  if (!bgmBus) { bgmBus = ctx.createGain(); bgmBus.gain.value = 0.55; bgmBus.connect(master); }
  const battle = bgmMood === 'battle', dt = 60 / (battle ? 108 : 76) / 2;
  if (bgmNext < ctx.currentTime) bgmNext = ctx.currentTime + 0.05;
  while (bgmNext < ctx.currentTime + 0.5) {
    const t = bgmNext, bar = Math.floor(bgmStep / 8) % 4, st = bgmStep % 8;
    if (bgmStep % 64 === 0 || !bgmSection) bgmSection = newSection(); // two passes of each section, then a new one
    const n = bgmSection[bar][st];
    if (typeof n === 'number') {
      let hold = 1; while (st + hold < 8 && bgmSection[bar][st + hold] === '-') hold++;
      const f = midi(scaleNote(n)), v = battle ? 0.16 : 0.13;
      pluck(f, t, v, 0.5 + hold * dt * 1.6);
      if (hold >= 3 && Math.random() < 0.4) for (let k = 1; k < hold * 3; k++) pluck(f, t + k * dt / 3, v * 0.35 * (1 - k / (hold * 3)), 0.3); // 轮指 tremolo on long notes
    }
    if (st === 0) { const root = 50 + ROOTS[bar]; bass(midi(root), t, dt * 8, battle ? 0.14 : 0.1); bass(midi(root + 7), t + dt * 4, dt * 4, 0.05); }
    if (battle) { if ([0, 3, 4, 6].includes(st)) frameDrum(t, st === 0 ? 0.5 : 0.3); woodblock(t, 0.05); }
    else { if (st === 0) frameDrum(t, 0.22); if (st === 4) woodblock(t, 0.04); }
    bgmNext += dt; bgmStep++;
  }
}
export function bgm(on) {
  bgmOn = on;
  clearInterval(bgmTimer); bgmTimer = 0;
  if (on) { bgmNext = 0; bgmStep = 0; bgmSection = null; bgmTimer = setInterval(bgmTick, 100); bgmTick(); if (bgmBus && ctx) { bgmBus.gain.cancelScheduledValues(ctx.currentTime); bgmBus.gain.setValueAtTime(0.55, ctx.currentTime); } }
  else if (bgmBus && ctx) bgmBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15); // fade out what is already scheduled
}
export function setBgmMood(m) { bgmMood = m; }
export const bgmPlaying = () => bgmOn;
