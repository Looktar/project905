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
const settings = { lang: store.lang || getLang(), mute: !!store.mute, quality: store.quality || (isTouch ? 'low' : 'high') };
const save = () => { try { localStorage.setItem('p905', JSON.stringify(settings)); } catch (e) { /* private mode */ } };
setLang(settings.lang); sfx.setMuted(settings.mute);

function applyTexts() {
  document.documentElement.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
  $('startBtn').textContent = t('start');
  $('subtitle').textContent = t('subtitle');
  $('tagline').textContent = t('tagline');
  $('langBtn').textContent = t('lang');
  $('controls').textContent = isTouch ? t('controlsMobile') : t('controlsPC');
  $('credit').textContent = t('credit');
  $('muteBtn').textContent = settings.mute ? '🔇' : '🔊';
  $('qBtn').textContent = t('quality') + (settings.lang === 'zh' ? '：' : ': ') + t(settings.quality);
  if (game) game.hud.setMode(!!game.inCar); else ['bA', 'bB', 'bC'].forEach((id, i) => ($(id).textContent = t(['punch', 'enter', 'run'][i])));
}

// ---------------- renderer / sizing
let renderer, world, game, hud;
let W = 0, H = 0;
function resize() {
  [W, H] = layout(app);
  const dprMax = settings.quality === 'high' ? 2 : isTouch ? 1.25 : 1.25;
  const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  if (renderer) renderer.resize(Math.round(W * dpr), Math.round(H * dpr));
  const mini = $('mini'), ms = Math.round(Math.min(W, H) * 0.26);
  mini.width = mini.height = Math.round(ms * Math.min(2, window.devicePixelRatio || 1));
  mini.style.width = mini.style.height = ms + 'px';
}
function applyQuality() {
  if (!renderer) return;
  const hi = settings.quality === 'high';
  renderer.shadowsOn = true;
  renderer.initShadow(hi ? 2048 : 1024);
  resize();
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
  world = new World(renderer, map);
  hud.setWorld(world);
  $('loading').style.display = 'none';
  $('startBtn').disabled = false;
  // preview camera behind the title screen
  previewCam = map.spawn;
  requestAnimationFrame(loop);
}
let previewCam = null;

$('startBtn').addEventListener('click', async () => {
  sfx.unlock();
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
});
$('langBtn').addEventListener('click', () => { settings.lang = settings.lang === 'zh' ? 'en' : 'zh'; setLang(settings.lang); save(); applyTexts(); });
$('muteBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); settings.mute = !settings.mute; sfx.setMuted(settings.mute); save(); applyTexts(); });
$('qBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); settings.quality = settings.quality === 'high' ? 'low' : 'high'; save(); applyQuality(); applyTexts(); });

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
    // auto-lower quality on slow devices
    if (game && fps < 26) {
      lowFpsT++;
      if (lowFpsT >= 4) { lowFpsT = 0; if (settings.quality === 'high') { settings.quality = 'low'; applyQuality(); applyTexts(); } else if (fps < 22) renderer.shadowsOn = false; }
    } else lowFpsT = 0;
  }
  poll(game && !!game.inCar);
  let target, dist, car = null;
  if (game) {
    game.update(dt);
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
  render(target, dist);
  hud.update(dt, game, renderer, W, H);
  cpuMs = cpuMs * 0.95 + (performance.now() - cpu0) * 0.05;
  if (debug) $('dbg').textContent = `${fps.toFixed(0)} fps · cpu ${cpuMs.toFixed(1)}ms · ${renderer.stats.calls} draws · ${game ? game.chars.length + ' chars ' + game.cars.length + ' cars' : ''}`;
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

function render(target, dist) {
  const C = CFG.camera;
  const eye = [target[0] + Math.sin(C.azimuth) * Math.cos(C.elevation) * dist, Math.sin(C.elevation) * dist, target[2] + Math.cos(C.azimuth) * Math.cos(C.elevation) * dist];
  // the visible ground is shifted away from the camera; centre culling there
  const fx = -Math.sin(C.azimuth), fz = -Math.cos(C.azimuth);
  const vc = [target[0] + fx * dist * 0.35, target[2] + fz * dist * 0.35];
  const shR = Math.min(95, dist * 1.25);
  renderer.begin(eye, target, C.fov, [target[0] + fx * dist * 0.2, 0, target[2] + fz * dist * 0.2], shR);
  const vis = world.visibleRect(groundFootprint(eye, target, C.fov, W / H), 22);
  const shadowVis = vis.filter((c) => Math.hypot(c.cx - target[0], c.cz - target[2]) < shR + 70);
  if (game) game.fillBatches();
  const dyn = game ? Object.values(game.B) : [];
  const drawChunks = (list) => { for (const c of list) { renderer.draw(c.static); renderer.draw(c.houseInst); renderer.draw(c.treeInst); renderer.draw(c.lampInst); renderer.draw(c.carInst); } };
  renderer.shadowPass(() => { drawChunks(shadowVis); for (const b of dyn) renderer.draw(b); });
  renderer.mainPass(() => { renderer.draw(world.ground); drawChunks(vis); for (const b of dyn) renderer.draw(b); }, CFG.world.fogNear * (dist / 50), CFG.world.fogFar * (dist / 50));
  renderer.drawSigns(world.signs);
}

boot();
