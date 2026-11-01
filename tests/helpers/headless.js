// Headless simulation harness: runs the real World + Game in Node (no browser, no GPU).
//
//   import { bootSim } from '../helpers/headless.js';
//
//   const sim = await bootSim();                  // parse maps/markham.json + build the World (~1-2 s)
//   sim.setInput({ mx: 0, my: 1, run: true });    // stick / keys, screen space: my > 0 = screen up
//   sim.step(30);                                 // 30 x game.update(1/30); edge inputs cleared each frame
//   sim.press('punch').step();                    // one-frame button press ('punch' | 'enter' | 'horn')
//   const sim2 = await bootSim({ world: sim.world }); // fresh Game on the same World: cheap
//
// Real:   js/world.js, js/game.js and all they import (math, geo, config, i18n, input,
//         audio - audio stays silent because unlock() is never called).
// Fake:   the WebGL Renderer (FakeRenderer: same return shapes, counts calls), the DOM
//         HUD (FakeHUD: records every call), browser globals (browser-stubs.js).
//         Both fakes answer unknown methods with a recording no-op, so new renderer /
//         HUD methods added by other work packages do not break the harness.
// Random: Math.random is replaced by a seeded PRNG (bootSim({ seed })) so runs are
//         reproducible; pass seed: null to keep the native one. Character/car ids come
//         from a module-level counter in game.js (the flee wobble uses them), so to
//         replay a run exactly, repeat the same bootSim() calls in the same order.
// Sim helpers: step / seconds / render, setInput / press / resetInput / steerToward,
//         spawn / parkCarNear / sidewalkNear / removePolice / freezeSpawning,
//         buildingAt / counts / nonFinite (see the class below).
// Not covered here: shaders and pixels, DOM/CSS layout, real touch events, sound.
// Those are checked by the Playwright smoke test (tests/e2e/smoke.mjs).
//
// Works in vitest and in plain Node scripts (e.g. a quick balancing experiment):
//   node -e "import('./tests/helpers/headless.js').then(async (h) => { const s = await h.bootSim(); s.step(300); console.log(s.counts()); })"

import './setup.js'; // must stay first: game modules read matchMedia/window when imported
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../../js/world.js';
import { Game } from '../../js/game.js';
import { input, clearEdges } from '../../js/input.js';
import { CFG } from '../../js/config.js';
import { INST_FLOATS } from '../../js/renderer.js';

export { CFG, input };
export const MAP_PATH = fileURLToPath(new URL('../../maps/markham.json', import.meta.url));

// ---------------------------------------------------------------- map + randomness
const mapCache = new Map();
// Parsed map JSON (cached per path; World and Game only read it).
export function loadMap(path = MAP_PATH) {
  if (!mapCache.has(path)) mapCache.set(path, JSON.parse(readFileSync(path, 'utf8')));
  return mapCache.get(path);
}

// Replace Math.random with a seeded PRNG (mulberry32). Returns a restore function.
export function seedRandom(seed) {
  const native = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = native; };
}

// ---------------------------------------------------------------- fakes
// Unknown method names return a no-op that is recorded in `unknown` (a Set).
function withFallback(obj) {
  return new Proxy(obj, {
    get(t, k, recv) {
      if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return Reflect.get(t, k, recv);
      return (...args) => { t.unknown.add(k); t.log?.push({ m: k, args }); return null; };
    },
  });
}

// Stand-in for js/renderer.js: returns objects shaped like the real ones (mesh,
// instanced, signMesh) so World and Game code paths run unchanged.
export class FakeRenderer {
  constructor() {
    this.calls = { mesh: 0, instanced: 0, signMesh: 0, upload: 0, draw: 0 };
    this.stats = { calls: 0 };
    this.shadowsOn = true;
    this.unknown = new Set();
    return withFallback(this);
  }
  // static mesh (null when empty, like the real one)
  mesh(mb) { this.calls.mesh++; return mb.P.length ? { static: true, count: mb.P.length / 3 } : null; }
  // instanced mesh: dynamic (capacity, data buffer to fill, n = 0) or static (data given, n = cap)
  instanced(mb, capacity, data = null) {
    this.calls.instanced++;
    const cap = data ? data.length / INST_FLOATS : capacity;
    return { count: mb.P.length / 3, cap, n: data ? cap : 0, data: data ? null : new Float32Array(cap * INST_FLOATS), initial: data };
  }
  signMesh(quads, canvasTex) { this.calls.signMesh++; return { count: quads.p.length / 3, canvas: canvasTex }; }
  upload(m) { this.calls.upload++; }
  draw(m) { if (!m) return; this.calls.draw++; this.stats.calls++; }
  // frame API used by main.js (not by World/Game); harmless no-ops
  resize() {}
  initShadow() {}
  begin() { this.stats = { calls: 0 }; }
  shadowPass(fn) { fn(); }
  mainPass(fn) { fn(); }
  drawSigns() {}
  project() { return null; }
}

// Stand-in for js/hud.js: every method call is appended to hud.log as { m, args }.
export function createFakeHUD() {
  const hud = {
    log: [],
    unknown: new Set(),
    world: null,
    setWorld(w) { this.world = w; },
    calls(name) { return this.log.filter((e) => e.m === name).map((e) => e.args); },
    clearLog() { this.log.length = 0; },
  };
  for (const m of ['bubble', 'banner', 'busted', 'chaseMeter', 'setMode', 'update', 'drawMini'])
    hud[m] = (...args) => { hud.log.push({ m, args }); };
  return withFallback(hud);
}

// ---------------------------------------------------------------- boot
// opts.seed:  PRNG seed for Math.random (null = keep native randomness)
// opts.world: reuse an already built World (it is not modified by Game)
// opts.map:   map JSON object (default: maps/markham.json)
export async function bootSim({ seed = 905, world = null, map = null } = {}) {
  if (seed !== null && seed !== undefined) seedRandom(seed);
  const renderer = world ? world.r : new FakeRenderer();
  if (!world) world = new World(renderer, map || loadMap());
  const hud = createFakeHUD();
  hud.setWorld(world);
  resetInput();
  const game = new Game(world, renderer, hud);
  return new Sim({ world, game, renderer, hud });
}

export function resetInput() {
  Object.assign(input, { mx: 0, my: 0, analog: false, run: false, handbrake: false, keyThrottle: 0, keySteer: 0 });
  clearEdges();
}

// ---------------------------------------------------------------- sim wrapper
export class Sim {
  constructor({ world, game, renderer, hud }) {
    this.world = world; this.game = game; this.renderer = renderer; this.hud = hud;
    this.input = input; this.CFG = CFG;
    this.time = 0;
  }
  get player() { return this.game.player; }
  // the player, or the car the player is driving (what the camera follows)
  playerPos() { return this.game.playerPos(); }

  // Advance n frames like main.js's loop (minus poll() and rendering):
  // game.update(dt), then edge-triggered inputs (punch/enter/horn) are cleared.
  // each(sim, i) is called after every frame (e.g. to check invariants).
  step(n = 1, dt = 1 / 30, each = null) {
    for (let i = 0; i < n; i++) {
      this.game.update(dt);
      clearEdges();
      this.time += dt;
      if (each) each(this, i);
    }
    return this;
  }
  seconds(sec, dt = 1 / 30, each = null) { return this.step(Math.round(sec / dt), dt, each); }
  // Build the per-frame instance buffers (CPU side of rendering); returns { batch: instanceCount }.
  render() {
    this.game.fillBatches();
    return Object.fromEntries(Object.entries(this.game.B).map(([k, b]) => [k, b.n]));
  }

  // ---- input (screen space, same meaning as js/input.js)
  setInput(fields) { Object.assign(input, fields); return this; }
  resetInput() { resetInput(); return this; }
  // one-frame button press: 'punch' | 'enter' | 'horn' (cleared by the next step)
  press(...names) { for (const k of names) input[k] = true; return this; }
  // stick vector [mx, my] that moves the player toward world point (x, z)
  stickToward(x, z) {
    const P = this.playerPos();
    const dx = x - P.x, dz = z - P.z, L = Math.hypot(dx, dz) || 1;
    const [rx, rz] = this.game.worldDir(1, 0), [ux, uz] = this.game.worldDir(0, 1); // screen right / up on the ground
    return [(dx * rx + dz * rz) / L, (dx * ux + dz * uz) / L];
  }
  // hold the stick toward (x, z); analog = touch stick (cars steer toward it), else keys
  steerToward(x, z, { mag = 1, analog = true, run = false } = {}) {
    const [mx, my] = this.stickToward(x, z);
    return this.setInput({ mx: mx * mag, my: my * mag, analog, run });
  }

  // ---- world/entity helpers
  // point `dist` metres in front of the player (along player.face)
  ahead(dist = 1) {
    const p = this.player;
    return { x: p.x + Math.sin(p.face) * dist, z: p.z + Math.cos(p.face) * dist };
  }
  // spawn a pedestrian or officer with the game's own factory; props override fields
  spawn(kind, x, z, props = {}) { return Object.assign(this.game.makeChar2(kind, x, z), props); }
  // a parked, driverless car on the kerb lane of the road nearest to (x, z)
  parkCarNear(x, z, type = 'sedan') {
    const ne = this.world.nearestEdge(x, z, 80);
    if (!ne) return null;
    const p = this.world.edgePoint(ne.e, edgeS(ne), 1, ne.e.w / 2 - 1.3);
    return this.game.makeCar(type, p.x, p.z, Math.atan2(p.dx, p.dz), { parked: true });
  }
  // a walkable point on the sidewalk of the road nearest to (x, z) (as Game does for the spawn)
  sidewalkNear(x, z) {
    const ne = this.world.nearestEdge(x, z, 80);
    if (!ne) return null;
    const p = this.world.edgePoint(ne.e, edgeS(ne), 1, ne.e.w / 2 + 2.2);
    const r = this.world.collide(p.x, p.z, CFG.player.radius);
    return { x: r.x, z: r.z };
  }
  // remove every officer and police car (except a police car the player drives)
  removePolice() {
    const g = this.game;
    g.chars = g.chars.filter((c) => c.kind !== 'cop');
    g.cars = g.cars.filter((c) => c.type !== 'police' || c === g.inCar);
    return this;
  }
  // stop (or restart) Game.spawnAround: nothing new arrives and nothing is despawned
  freezeSpawning(on = true) { this.game.spawnTimer = on ? Infinity : 0; return this; }
  // collider (OSM building 'b' / house 'h' by default) whose polygon contains (x, z), or null
  buildingAt(x, z, kinds = ['b', 'h']) {
    for (const id of this.world.query(x, z, x, z)) {
      const c = this.world.colliders[id];
      if (kinds.includes(c.kind) && pointInPoly(x, z, c.poly)) return c;
    }
    return null;
  }
  counts() {
    const g = this.game;
    return {
      peds: g.chars.filter((c) => c.kind === 'ped').length,
      cops: g.chars.filter((c) => c.kind === 'cop').length,
      cars: g.cars.length,
      traffic: g.cars.filter((c) => c.ai && c.type !== 'police').length,
      police: g.cars.filter((c) => c.type === 'police').length,
      parked: g.cars.filter((c) => c.parked && !c.driver).length,
      buses: g.buses.length,
    };
  }
  // descriptions of every non-finite position/velocity/hp in the game state ([] = all good)
  nonFinite() {
    const g = this.game, bad = [];
    const chk = (label, o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && !Number.isFinite(o[k])) bad.push(`${label}.${k}=${o[k]}`); };
    for (const c of g.chars) chk(`${c.kind}#${c.id}`, c, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'face', 'speed', 'hp']);
    for (const car of g.cars) chk(`car:${car.type}#${car.id}`, car, ['x', 'z', 'a', 'speed', 'vx', 'vz', 'hp']);
    for (const b of g.buses) chk('bus', b, ['x', 'z', 'a', 's']);
    for (const f of g.puffs) chk('puff', f, ['x', 'y', 'z', 's']);
    chk('camera', { x: g.camPos[0], z: g.camPos[2], dist: g.camDist }, ['x', 'z', 'dist']);
    return bad;
  }
}

// distance along edge ne.e (from node a) of a World.nearestEdge() result
const edgeS = (ne) => ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
