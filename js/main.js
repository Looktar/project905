import { Renderer } from './renderer.js';
import { World } from './world.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { CFG } from './config.js';
import { input, layout, initTouch, poll, clearEdges, isTouch } from './input.js';
import * as sfx from './audio.js';
import { t, setLang, getLang } from './i18n.js';
import { lerp } from './math.js';

const app = document.getElementById('app');
const canvas = document.getElementById('c');
const $ = (id) => document.getElementById(id);

// ---------------- settings (persisted)
const store = (() => { try { return JSON.parse(localStorage.getItem('p905') || '{}'); } catch (e) { return {}; } })();
const Q = CFG.quality;
const DPR = isTouch ? Q.dpr.touch : Q.dpr.desktop;
const settings = {
  lang: store.lang || getLang(),
  mute: !!store.mute,
  mini: store.mini !== false,                       // minimap expanded
  shadows: store.shadows !== false,
  tilt: typeof store.tilt === 'boolean' ? store.tilt : !isTouch, // miniature tilt-shift blur (spec 4: off on phones by default)
  res: DPR[store.res] ? store.res : Q.defaultRes[isTouch ? 'touch' : 'desktop'], // pixel-ratio level: low / mid / high
  manualQ: !!store.manualQ,                         // graphics picked by hand: no auto-lowering
};
const save = () => { try { localStorage.setItem('p905', JSON.stringify(settings)); } catch (e) { /* private mode */ } };
setLang(settings.lang); sfx.setMuted(settings.mute);
// ?bench=1: baseline benchmark at the spawn (Hwy 7 x Kennedy, entities full), spec 7
const bench = /bench=1/.test(location.search) ? { t: 0, frames: [], calls: 0, cpu: 0, n: 0, done: false } : null;
const autoQ = !/noauto=1/.test(location.search) && !bench; // ?noauto=1 keeps graphics fixed (benchmarks, screenshots)

function applyTexts() {
  document.documentElement.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
  $('startBtn').textContent = t('start');
  $('subtitle').textContent = t('subtitle');
  $('tagline').textContent = t('tagline');
  $('langBtn').textContent = t('lang');
  $('controls').textContent = isTouch ? t('controlsMobile') : t('controlsPC');
  $('credit').textContent = t('credit');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('muteBtn').textContent = settings.mute ? '🔇' : '🔊';
  const cur = { lang: settings.lang, sound: settings.mute ? 'off' : 'on', mini: settings.mini ? 'open' : 'small', shadows: settings.shadows ? 'on' : 'off', tilt: settings.tilt ? 'on' : 'off', res: settings.res };
  for (const seg of document.querySelectorAll('.seg[data-key]'))
    for (const b of seg.children) b.classList.toggle('on', b.dataset.v === cur[seg.dataset.key]);
  if (game) game.hud.setMode(!!game.inCar); else ['bA', 'bB', 'bC'].forEach((id, i) => ($(id).textContent = t(['punch', 'enter', 'run'][i])));
}

// ---------------- renderer / sizing
let renderer, world, game, hud;
let W = 0, H = 0;
function resize() {
  [W, H] = layout(app);
  const dpr = Math.min(window.devicePixelRatio || 1, DPR[settings.res]);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  if (renderer) renderer.resize(Math.round(W * dpr), Math.round(H * dpr));
  const mini = $('mini'), ms = Math.round(Math.min(W, H) * 0.26);
  mini.width = mini.height = Math.round(ms * Math.min(2, window.devicePixelRatio || 1));
  mini.style.width = mini.style.height = ms + 'px';
}
function applyQuality() {
  if (!renderer) return;
  renderer.shadowsOn = settings.shadows;
  renderer.tiltShift = settings.tilt;
  const size = isTouch ? Q.shadowMap.touch : Q.shadowMap.desktop;
  if (renderer.shadowSize !== size) renderer.initShadow(size);
  resize();
}
// one step down when the frame rate stays low: tilt-shift off, sharp -> normal resolution, shadows off, saver
function lowerQuality() {
  if (settings.tilt) settings.tilt = false;
  else if (settings.res === 'high') settings.res = 'mid';
  else if (settings.shadows) settings.shadows = false;
  else if (settings.res === 'mid') settings.res = 'low';
  else return false;
  return true;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------------- boot
async function boot() {
  applyTexts();
  resize();
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    $('loading').textContent = 'WebGL2 not available on this browser.'; return;
  }
  applyQuality();
  $('loading').textContent = t('loading');
  const res = await fetch('maps/markham.json');
  const map = await res.json();
  hud = new HUD(app);
  hud.setMiniOpen(settings.mini);
  hud.onMiniToggle = (open) => { settings.mini = open; save(); applyTexts(); };
  world = new World(renderer, map);
  hud.setWorld(world);
  $('loading').style.display = 'none';
  $('startBtn').disabled = false;
  // preview camera behind the title screen
  previewCam = map.spawn;
  if (bench) startGame();
  requestAnimationFrame(loop);
}
let previewCam = null;

$('startBtn').addEventListener('click', () => { sfx.unlock(); startGame(); });
async function startGame() {
  $('title').classList.add('hide');
  $('hudwrap').classList.add('on');
  if (isTouch) {
    // Android: try real fullscreen + landscape lock; iOS falls back to the rotation layout
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) { /* ignore */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* ignore */ }
    setTimeout(resize, 300);
  }
  game = new Game(world, renderer, hud);
  window.__game = game; window.__input = input;
  applyTexts();
}
$('langBtn').addEventListener('click', () => { settings.lang = settings.lang === 'zh' ? 'en' : 'zh'; setLang(settings.lang); save(); applyTexts(); });
$('muteBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); settings.mute = !settings.mute; sfx.setMuted(settings.mute); save(); applyTexts(); });

// ---------------- settings + credits panels (spec 5.6, M4)
let paused = false; // the game pauses while a panel is open
const anyModal = () => !!document.querySelector('.modal.show');
function openModal(id) { $(id).classList.add('show'); paused = true; sfx.setMuted(true); }
function closeModal(id) { $(id).classList.remove('show'); paused = anyModal(); if (!paused) sfx.setMuted(settings.mute); }
for (const m of document.querySelectorAll('.modal')) {
  m.addEventListener('pointerdown', (e) => e.stopPropagation()); // never start the joystick under a panel
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); });
}
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeModal(b.dataset.close));
$('setBtn').addEventListener('pointerdown', (e) => e.stopPropagation());
$('setBtn').addEventListener('click', () => openModal('settings'));
$('openCredits').addEventListener('click', () => openModal('credits'));
$('titleCredits').addEventListener('click', () => openModal('credits'));
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (anyModal()) for (const m of document.querySelectorAll('.modal.show')) closeModal(m.id);
  else if (game) openModal('settings');
});
for (const seg of document.querySelectorAll('.seg[data-key]')) seg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  const v = b.dataset.v, k = seg.dataset.key;
  if (k === 'lang') { settings.lang = v; setLang(v); }
  if (k === 'sound') settings.mute = v === 'off';
  if (k === 'mini') { settings.mini = v === 'open'; if (hud) hud.setMiniOpen(settings.mini); }
  if (k === 'shadows') { settings.shadows = v === 'on'; settings.manualQ = true; applyQuality(); }
  if (k === 'tilt') { settings.tilt = v === 'on'; settings.manualQ = true; applyQuality(); }
  if (k === 'res') { settings.res = v; settings.manualQ = true; applyQuality(); }
  save(); applyTexts();
});

// accidental-touch guards (M1b): iOS Safari ignores user-scalable=no, so block pinch / double-tap zoom
// and the long-press menu explicitly; one-finger scrolling inside panels keeps working
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());
initTouch(app, $('joy'), $('knob'), [[$('bA'), 'a'], [$('bB'), 'b'], [$('bC'), 'c']]);
if (isTouch) document.body.classList.add('touch');

// ---------------- loop
let cpuMs = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, lowFpsT = 0;
const debug = /debug=1/.test(location.search);
function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - last) / 1000; last = now;
  let dt = Math.min(0.05, raw);
  fpsAcc += raw; fpsN++;
  const cpu0 = performance.now();
  if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    // auto-lower quality on slow devices (spec 5.6), unless the player chose graphics by hand
    if (game && autoQ && !settings.manualQ && !paused && fps < Q.autoFps) {
      lowFpsT++;
      if (lowFpsT >= 4) { lowFpsT = 0; if (lowerQuality()) { applyQuality(); save(); applyTexts(); hud.banner(t('autoLowered'), 'blue'); } }
    } else lowFpsT = 0;
  }
  poll(game && !!game.inCar);
  let target, dist, car = null;
  if (game) {
    if (!paused) game.update(dt);
    const P = game.playerPos();
    car = game.inCar;
    const lead = car ? 0.55 : 0.25;
    target = [P.x + (car ? car.vx : 0) * lead, 0, P.z + (car ? car.vz : 0) * lead];
    const C = CFG.camera;
    const want = car ? lerp(C.distCarMin, C.distCarMax, Math.min(1, Math.abs(car.speed) / CFG.car.maxSpeed)) : C.distWalk;
    game.camDist = lerp(game.camDist, want, 1 - Math.exp(-1.5 * dt));
    for (let i = 0; i < 3; i += 2) game.camPos[i] = lerp(game.camPos[i], target[i], 1 - Math.exp(-6 * dt));
    target = game.camPos.slice();
    if (game.shake > 0) { target[0] += (Math.random() - 0.5) * game.shake * 0.8; target[2] += (Math.random() - 0.5) * game.shake * 0.8; }
    dist = game.camDist;
  } else {
    const a = now / 9000;
    target = [previewCam[0] + Math.cos(a) * 20, 0, previewCam[1] + Math.sin(a) * 20];
    dist = 70;
  }
  clearEdges();
  render(target, dist, dt);
  hud.update(dt, game, renderer, W, H);
  const cpuFrame = performance.now() - cpu0;
  cpuMs = cpuMs * 0.95 + cpuFrame * 0.05;
  if (bench && game && !bench.done) benchFrame(raw, cpuFrame);
  if (debug) $('dbg').textContent = `${fps.toFixed(0)} fps · cpu ${cpuMs.toFixed(1)}ms · ${renderer.stats.calls} draws · ${game ? game.chars.length + ' chars ' + game.cars.length + ' cars' : ''}`;
}

// ---------------- benchmark (?bench=1): warm up, then measure; results for the PROGRESS log
function benchFrame(raw, cpuFrame) {
  const B = CFG.bench;
  bench.t += raw;
  if (bench.t < B.warmup) return;
  bench.frames.push(raw); bench.calls += renderer.stats.calls; bench.cpu += cpuFrame; bench.n++;
  $('dbg').textContent = `bench ${Math.ceil(B.warmup + B.measure - bench.t)}s…`;
  if (bench.t < B.warmup + B.measure) return;
  bench.done = true;
  $('dbg').textContent = '';
  const f = bench.frames.slice().sort((a, b) => a - b), sum = f.reduce((a, b) => a + b, 0);
  const r = {
    fps: +(f.length / sum).toFixed(1),
    low1: +(1 / f[Math.min(f.length - 1, Math.floor(f.length * 0.99))]).toFixed(1),
    draws: Math.round(bench.calls / bench.n), cpu: +(bench.cpu / bench.n).toFixed(1),
    chars: game.chars.length, cars: game.cars.length,
    res: settings.res, shadows: settings.shadows, canvas: canvas.width + '×' + canvas.height,
  };
  window.__bench = r;
  $('benchOut').textContent = [
    `平均帧率 Avg FPS: ${r.fps}`, `最差 1% 1% low: ${r.low1} fps`, `Draw calls: ${r.draws}`, `CPU: ${r.cpu} ms/帧`,
    `实体 Entities: ${r.chars} 人 / ${r.cars} 车`, `画质 Quality: ${r.res} · ${r.shadows ? '阴影开' : '阴影关'} · ${r.canvas}`,
    navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 120),
  ].join('\n');
  $('benchRes').classList.add('show');
}

// rectangle of ground (y=0) covered by the camera frustum
function groundFootprint(eye, target, fov, aspect) {
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const rx = norm([-f[2], 0, f[0]]); // right = f x up
  const u = [rx[1] * f[2] - rx[2] * f[1], rx[2] * f[0] - rx[0] * f[2], rx[0] * f[1] - rx[1] * f[0]];
  const tv = Math.tan(fov / 2), th = tv * aspect;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const d = [f[0] + rx[0] * th * sx + u[0] * tv * sy, f[1] + rx[1] * th * sx + u[1] * tv * sy, f[2] + rx[2] * th * sx + u[2] * tv * sy];
    let tt = d[1] < -0.02 ? -eye[1] / d[1] : 700;
    tt = Math.min(tt, 700);
    const x = eye[0] + d[0] * tt, z = eye[2] + d[2] * tt;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

function render(target, dist, dt) {
  const C = CFG.camera;
  const eye = [target[0] + Math.sin(C.azimuth) * Math.cos(C.elevation) * dist, Math.sin(C.elevation) * dist, target[2] + Math.cos(C.azimuth) * Math.cos(C.elevation) * dist];
  // the visible ground is shifted away from the camera: centre the shadow map a bit ahead
  const fx = -Math.sin(C.azimuth), fz = -Math.cos(C.azimuth);
  const shR = Math.min(95, dist * 1.25);
  renderer.begin(eye, target, C.fov, [target[0] + fx * dist * 0.2, 0, target[2] + fz * dist * 0.2], shR);
  const vis = world.visibleRect(groundFootprint(eye, target, C.fov, W / H), 22);
  const shadowVis = vis.filter((c) => Math.hypot(c.cx - target[0], c.cz - target[2]) < shR + 70);
  if (game) game.fillBatches();
  const dyn = game ? Object.values(game.B) : [];
  // buildings between the camera and the player fade out; the player shows an x-ray silhouette when hidden
  const fade = game ? world.updateFade(eye, game.playerPos(), dt) : null;
  renderer.shadowPass(() => {
    for (const c of shadowVis) { renderer.draw(c.static); for (const m of c.inst) renderer.draw(m); }
    for (const b of dyn) renderer.draw(b);
  });
  renderer.mainPass(() => {
    renderer.draw(world.ground);
    for (const c of vis) {
      const sk = fade && fade.skip.get(c);
      if (sk) renderer.drawSkipping(c.static, sk); else renderer.draw(c.static);
      for (const m of c.inst) renderer.draw(m);
    }
    // silhouette before any character is drawn: the player's first instances in each batch (see game.fillBatches)
    if (game) renderer.silhouette(() => { for (const b of dyn) renderer.drawFirst(b, b.pk); }, CFG.occlusion.silhouette);
    for (const b of dyn) renderer.draw(b);
    if (fade) renderer.fadePass(fade.list);
  }, CFG.world.fogNear * (dist / 50), CFG.world.fogFar * (dist / 50));
  renderer.drawSigns(world.signs);
  // tilt-shift: keep the band around the player sharp
  const fp = game ? renderer.project([game.playerPos().x, 1, game.playerPos().z]) : null;
  renderer.endFrame(fp ? Math.min(0.8, Math.max(0.2, fp[1])) : 0.5, CFG.post);
}

boot();
