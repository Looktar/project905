// Boot, main loop, camera, settings.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, COL } from './config.js';
import { World } from './world.js';
import { Game } from './game.js';
import { WorldView } from './worldview.js';
import { GameView } from './gameview.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { i18n } from './i18n.js';
import { layout, safeArea } from './orient.js';

const qs = new URLSearchParams(location.search);
const root = document.getElementById('root'), canvas = document.getElementById('gl');
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const store = { load() { try { return JSON.parse(localStorage.getItem('p905v2') || '{}'); } catch (e) { return {}; } }, save(o) { try { localStorage.setItem('p905v2', JSON.stringify(o)); } catch (e) {} } };
const set = Object.assign({ sound: true, shadow: true, sharp: !mobile, lang: (navigator.language || 'zh').startsWith('zh') ? 'zh' : 'en', manual: false }, store.load());
if (qs.get('lang')) set.lang = qs.get('lang');
i18n.lang = set.lang;
if (mobile) root.classList.add('touch');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky); scene.fog = new THREE.Fog(COL.sky, 170, 420);
const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 2, 12, 700);
scene.add(new THREE.HemisphereLight('#eaf2ff', '#b9c9a0', 1.75));
const sun = new THREE.DirectionalLight('#fff1d6', 2.5);
sun.castShadow = true; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35;
const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 420;
scene.add(sun, sun.target);
const SUN = new THREE.Vector3(0.55, 1.15, 0.38).normalize().multiplyScalar(200);

let W = 1, H = 1, rot = false;
function applyQuality() {
  const pr = Math.min(devicePixelRatio || 1, set.sharp ? (mobile ? 1.5 : 2) : 1);
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
  sun.castShadow = set.shadow; renderer.shadowMap.enabled = true;
  const size = mobile ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
}
function resize() {
  const L = layout(innerWidth, innerHeight);
  W = L.w; H = L.h; rot = L.rot;
  root.classList.toggle('rot', rot);
  root.style.width = W + 'px'; root.style.height = H + 'px';
  // safe areas follow the rotation
  const cs = getComputedStyle(document.documentElement), px = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const sa = safeArea(px('--sa-t'), px('--sa-r'), px('--sa-b'), px('--sa-l'), rot);
  for (const [k, v] of [['--pt', sa.top], ['--pr', sa.right], ['--pb', sa.bottom], ['--pl', sa.left]]) root.style.setProperty(k, v + 'px');
  camera.aspect = W / H; camera.updateProjectionMatrix();
  applyQuality();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

function texts() {
  for (const el of document.querySelectorAll('[data-t]')) { if (el.id === 'start' && el.disabled) continue; el.textContent = i18n.t(el.dataset.t); }
  document.documentElement.lang = i18n.lang;
  const on = (v) => i18n.t(v ? 'on' : 'off');
  document.getElementById('s-sound').textContent = on(set.sound); document.getElementById('s-shadow').textContent = on(set.shadow);
  document.getElementById('s-sharp').textContent = on(set.sharp); document.getElementById('s-lang').textContent = i18n.lang === 'zh' ? '中文' : 'English';
  document.getElementById('mute').textContent = set.sound ? '🔊' : '🔇';
}
texts();

const sfx = new Sfx(); sfx.setMuted(!set.sound);
const v3 = new THREE.Vector3(), v2 = new THREE.Vector2();
let game, world, wv, gv, hud, input, started = false, paused = false;
const cam = { x: 0, z: 0, dist: CFG.camera.distWalk };

async function boot() {
  const map = await (await fetch('../maps/markham.json')).json();
  world = new World(map);
  game = new Game(world, { seed: Number(qs.get('seed')) || (Date.now() & 0xffff), mobile });
  wv = new WorldView(world, scene, set);
  gv = new GameView(game, scene);
  input = new Input(root);
  hud = new Hud(root, world);
  cam.x = game.player.x; cam.z = game.player.z;
  wv.update(cam.x, cam.z, 0);
  window.__p905 = { game, world, wv, gv, input, renderer, set, cam };
  const btn = document.getElementById('start');
  btn.disabled = false; btn.textContent = i18n.t('start');
  if (qs.get('autostart')) start();
  requestAnimationFrame(frame);
}
function start() {
  if (started) return;
  started = true; input.enabled = true;
  document.getElementById('title').classList.add('hide');
  sfx.unlock();
  if (mobile) { try { const p = document.documentElement.requestFullscreen?.(); p && p.catch(() => {}); screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) {} }
}
document.getElementById('start').addEventListener('click', start);
const toggleLang = () => { i18n.toggle(); set.lang = i18n.lang; store.save(set); texts(); };
document.getElementById('lang').addEventListener('click', toggleLang);
document.getElementById('s-lang').addEventListener('click', toggleLang);
const openSettings = (o) => { paused = o; document.getElementById('settings').classList.toggle('hide', !o); if (input) input.enabled = started && !o; };
document.getElementById('gear').addEventListener('click', () => openSettings(true));
document.getElementById('s-close').addEventListener('click', () => openSettings(false));
addEventListener('keydown', (e) => { if (e.code === 'Escape' && started) openSettings(!paused); if (e.code === 'Enter' && !started && game) start(); });
const flip = (k) => () => { set[k] = !set[k]; set.manual = true; store.save(set); sfx.setMuted(!set.sound); applyQuality(); texts(); };
document.getElementById('mute').addEventListener('click', flip('sound'));
document.getElementById('s-sound').addEventListener('click', flip('sound'));
document.getElementById('s-shadow').addEventListener('click', flip('shadow'));
document.getElementById('s-sharp').addEventListener('click', flip('sharp'));

function project(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H }; }

let last = 0, acc = 0, fpsT = 0, fpsN = 0, fps = 60, lowT = 0, dbg = '';
const STEP = 1 / 60, debug = qs.get('debug');
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
  const t = now / 1000;
  if (started && !paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) { game.update(STEP, input.read(!!game.player.car)); input.consume(); acc -= STEP; n++; }
    if (n === 4) acc = 0;
  }
  // events -> sound, particles, bubbles
  if (game.ev.length) {
    for (const e of game.ev) sfx.play(e.k, e);
    gv.events(game.ev); hud.events(game.ev);
    game.ev.length = 0;
  }
  const p = game.player, f = game.focus, car = p.car;
  // camera: fixed azimuth, follows the player, pulls back with speed
  const C = CFG.camera, sp = car ? Math.hypot(car.vx, car.vz) : 0;
  const wantD = car ? C.distCarMin + (C.distCarMax - C.distCarMin) * Math.min(1, sp / 22) : C.distWalk;
  const k = 1 - Math.exp(-C.lag * dt);
  const lead = car ? 0.45 : 0;
  cam.x += (f.x + (car ? car.vx * lead : 0) - cam.x) * k; cam.z += (f.z + (car ? car.vz * lead : 0) - cam.z) * k;
  cam.dist += (wantD - cam.dist) * (1 - Math.exp(-2 * dt));
  if (Math.hypot(f.x - cam.x, f.z - cam.z) > 60) { cam.x = f.x; cam.z = f.z; }
  const sh = game.trauma * game.trauma * CFG.feel.maxOffset;
  const tx = cam.x + Math.sin(t * 47) * sh, tz = cam.z + Math.cos(t * 39) * sh;
  const ce = Math.cos(C.elevation), se = Math.sin(C.elevation);
  camera.position.set(tx + Math.sin(C.azimuth) * ce * cam.dist, se * cam.dist + Math.sin(t * 53) * sh * 0.5, tz + Math.cos(C.azimuth) * ce * cam.dist);
  camera.lookAt(tx, 1.2, tz);
  // sun follows in whole shadow texels so shadows do not shimmer
  const tex = 190 / sun.shadow.mapSize.x, sx = Math.round(cam.x / tex) * tex, sz = Math.round(cam.z / tex) * tex;
  sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN.x, SUN.y, sz + SUN.z);
  wv.update(cam.x, cam.z, dt); wv.updateBulbs(cam.x, cam.z, game.time);
  camera.updateMatrixWorld(); renderer.getDrawingBufferSize(v2);
  wv.setCut(camera, f.x, car ? 1.0 : 1.5, f.z, v2.x, v2.y);
  gv.update(dt, t);
  game.nearCar = gv.near;
  renderer.render(scene, camera);
  let siren = false;
  if (game.wanted) for (const c of game.cars) if (c.siren && Math.hypot(c.x - f.x, c.z - f.z) < 90) { siren = true; break; }
  sfx.loop(started && !!car && !paused, car ? car.v : 0, started && siren && !paused);
  // fps + automatic quality
  fpsT += dt; fpsN++;
  if (fpsT >= 1) {
    fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (debug) { const i = renderer.info.render; dbg = `${fps.toFixed(0)} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris · ${game.peds.length} peds ${game.cars.length} cars · chunks ${wv.live.size}`; }
    if (started && !set.manual && !qs.get('noauto')) {
      lowT = fps < 26 ? lowT + 1 : 0;
      if (lowT >= 4) { lowT = 0; if (set.sharp) set.sharp = false; else if (set.shadow) set.shadow = false; applyQuality(); texts(); }
    }
  }
  hud.update(dt, game, project, world.map.landmarks.filter((l) => l.x !== undefined && l.t !== 'viva'), dbg);
}
boot().catch((e) => { console.error(e); document.getElementById('start').textContent = 'Error: ' + e.message; });
