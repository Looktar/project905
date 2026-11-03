// Gameplay: player, pedestrians, police, traffic, buses, combat and the chase.
import { M, clamp, lerp, angDiff, rr, pick, segDist } from './math.js';
import { MeshBuilder, MAT_A, MAT_V, rbox, box, sphere, ico, cyl, star, torus } from './geo.js';
import { INST_FLOATS } from './renderer.js';
import { CFG } from './config.js';
import { MODELS } from './models.js';
import { input } from './input.js';
import * as sfx from './audio.js';
import { t } from './i18n.js';
import { SIG_GREEN, SIG_YELLOW, laneOff } from './signals.js';
import { Fires, bindInput } from './fire.js';
import { Missions } from './missions.js';
import { Pranks } from './pranks.js';
import { Nav } from './nav.js';

bindInput(input);

const CS = 1.3; // character scale (chibi proportions)
const SKIN = ['#f3c9a2', '#e2ad84', '#c68b62', '#f6d5b8', '#a8714d'];
const SHIRT = ['#ef4444', '#f59e0b', '#22c3a6', '#a78bfa', '#60a5fa', '#f472b6', '#fde047', '#fb923c', '#34d399', '#e5e7eb', '#38bdf8', '#c084fc'];
const PANTS = ['#2f3b59', '#5b4a8a', '#3b4a6b', '#334155', '#475569', '#1e3a8a', '#374151', '#6b4f3a'];
const HAIR = ['#2b2320', '#6b4429', '#d9a441', '#1f1f1f', '#5b3a29', '#111111', '#9ca3af'];
const SHOES = ['#f8fafc', '#1f2937', '#78350f', '#ef4444', '#334155', '#f8fafc', '#2563eb'];
// blocky hairstyles (style B, D-72); grey hair is often 'bald' (side tufts)
const HAIRDO = ['short', 'short', 'bob', 'bob', 'long', 'curls', 'spiky'];
// South Asian residents: skin, hair and outfit colours (kurta / salwar kameez, dupatta, dastar)
const SA_SKIN = ['#c68642', '#a86b3c', '#8d5524', '#b5774a', '#9c6644'];
const SA_HAIR = ['#141010', '#1f1612', '#2b1d16', '#111111'];
const SA_TOP = ['#f59e0b', '#9f1239', '#0f766e', '#ca8a04', '#1d4ed8', '#f8fafc', '#c026d3', '#ea580c', '#15803d'];
const SA_LOW = ['#f5f5f4', '#e7e5e4', '#1f2937', '#334155', '#fde68a', '#fbcfe8'];
const SA_WRAP = ['#f97316', '#1e3a8a', '#b91c1c', '#111827', '#db2777', '#f8fafc', '#facc15', '#16a34a'];
const CARCOL = ['#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#f97316', '#e5e7eb', '#94a3b8', '#fde68a', '#ef4444', '#2563eb', '#10b981', '#f8fafc'];
const SUVCOL = ['#2563eb', '#ef4444', '#10b981', '#f8fafc', '#475569', '#0ea5e9', '#84cc16', '#f59e0b'];
const VANCOL = ['#f8fafc', '#e5e7eb', '#fde68a', '#93c5fd', '#fca5a5', '#86efac', '#c4b5fd'];
const VAN_ROOF = [0.97, 0.97, 0.98], RAIL = [0.22, 0.24, 0.3];
// traffic-light lamps [red, yellow, green]: lit / unlit colours (the lamp batch is emissive)
const LAMP_ON = [[1, 0.22, 0.2], [1, 0.78, 0.15], [0.25, 1, 0.45]];
const LAMP_OFF = [[0.32, 0.1, 0.1], [0.33, 0.26, 0.07], [0.07, 0.25, 0.13]];

// Vehicle shapes. Every type reuses the sedan batches with scaled part matrices, so new
// types cost no draw calls. Local frame: +z forward, y up.
const BUS_EXTRA = 3.8; // a 12 m bus is ~3.8 m longer at each end than a car: added to following gaps
const SHAPES = (() => {
  const T = M.T, S = M.S, C = M.chain;
  const wheels = (x, y, z, s) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => C(T(sx * x, y, sz * z), M.RZ(Math.PI / 2), S(s))));
  const pair = (x, y, z) => [T(-x, y, z), T(x, y, z)];
  const sedan = { body: T(0, 0.72, 0), cabin: T(0, 1.47, -0.25), roof: T(0, 2.2, -0.25), wheels: wheels(1.0, 0.42, 1.4, 1), head: pair(0.62, 0.8, 2.18), tail: pair(0.62, 0.8, -2.18) };
  return {
    sedan, taxi: sedan, police: sedan,
    // SUV: taller boxy body, high ground clearance, big wheels, long cabin, roof rails, spare wheel
    suv: {
      body: C(T(0, 0.99, 0), S(1.06, 1.22, 1.03)), cabin: C(T(0, 1.86, -0.32), S(1.1, 1.08, 1.4)), roof: C(T(0, 2.34, -0.32), S(1.1, 1, 1.55)),
      wheels: wheels(1.02, 0.5, 1.5, 1.2), head: pair(0.66, 1.12, 2.27), tail: pair(0.72, 1.18, -2.27),
      rails: [-0.86, 0.86].map((x) => C(T(x, 2.47, -0.32), S(0.07, 0.9, 1.45))), spare: C(T(0, 1.12, -2.42), M.RX(Math.PI / 2), S(1.05, 0.9, 1.05)),
    },
    // van (minivan, 面包车): tall one-box body with a window band all round and a white roof
    van: {
      body: C(T(0, 1.3, 0), S(1.05, 2.2, 1.07)), cabin: C(T(0, 1.78, 0.02), S(1.24, 0.8, 2.08)), roof: C(T(0, 2.27, -0.05), S(1.08, 1, 2.15)),
      wheels: wheels(1.02, 0.44, 1.6, 1.05), head: pair(0.7, 0.86, 2.36), tail: pair(0.76, 1.0, -2.36),
    },
    // fire truck (v0.3): long red body, cab up front, silver ladder on the roof, yellow band, red lights
    fire: {
      body: C(T(0, 1.25, -0.3), S(1.15, 2.0, 1.72)), cabin: C(T(0, 2.05, 2.45), S(1.3, 1.05, 0.55)), roof: C(T(0, 2.45, -1.1), S(0.62, 1, 2.7)),
      wheels: wheels(1.15, 0.5, 2.6, 1.2), head: pair(0.8, 1.0, 3.5), tail: pair(0.85, 1.0, -4.1),
      band: C(T(0, 1.05, -0.3), S(1.14, 0.45, 2.55)), rungs: [-3, -1.5, 0, 1.5].map((z) => C(T(0, 2.56, z - 1.1), S(0.5, 0.4, 0.04))),
    },
  };
})();

let uid = 1;

export class Game {
  constructor(world, renderer, hud) {
    this.w = world; this.r = renderer; this.hud = hud;
    this.isMobile = matchMedia('(pointer: coarse)').matches;
    this.chars = []; this.cars = []; this.buses = []; this.puffs = [];
    this.time = 0;
    this.chase = { active: false, unseen: 0, reinforce: 0 };
    this.busted = 0;
    this.shake = 0;
    this.buildBatches();
    let [sx, sz] = world.map.spawn;
    // snap the spawn point onto the sidewalk of the closest road
    const sn = world.nearestEdge(sx, sz, 60);
    if (sn) {
      const s0 = sn.e.cum[sn.k] + sn.t * (sn.e.cum[sn.k + 1] - sn.e.cum[sn.k]);
      const sp = world.edgePoint(sn.e, s0, 1, sn.e.w / 2 + 2.2);
      const res = world.collide(sp.x, sp.z, 0.6); sx = res.x; sz = res.z;
    }
    this.player = this.makeChar('player', sx, sz, { shirt: '#ef4444', pants: '#2f3b59', skin: SKIN[0], hair: '#2b2320', shoes: '#f8fafc', hs: 'spiky' });
    this.player.hp = CFG.player.hp; this.player.face = -Math.PI / 2;
    this.inCar = null;
    this.camPos = [sx, 0, sz]; this.camDist = CFG.camera.distWalk;
    this.viewAspect = 844 / 390; // main.js sets the real screen aspect every frame
    this.fires = new Fires(this);
    this.missions = new Missions(this);
    this.pranks = new Pranks(this);
    this.nav = new Nav(this);
    this.spawnAround(true);
    // a parked car right next to the spawn point so cars are discoverable immediately
    const near = world.nearestEdge(sx, sz, 40);
    if (near) {
      const s = near.e.cum[near.k] + 4;
      const p = world.edgePoint(near.e, s, 1, Math.max(near.e.w / 2 - 1.3, laneOff(near.e) + 2.4)); // clear of the traffic lane
      this.makeCar('sedan', p.x, p.z, Math.atan2(p.dx, p.dz), { parked: true });
    }
  }

  // ------------------------------------------------------------------ batches
  buildBatches() {
    const mk = (g, mat = MAT_A, col = '#ffffff', em = 0, cap = 700) => { const mb = new MeshBuilder(); mb.add(g, M.I(), col, mat, em); return this.r.instanced(mb, cap); };
    this.B = {
      // characters: blocky toy style (D-72). hair is a unit rounded cube scaled into caps, fringes, sides, beards
      head: mk(rbox(1.08, 1.0, 0.98, 0.2, 2)), hair: mk(rbox(1, 1, 1, 0.1, 1), MAT_A, '#ffffff', 0, 2100), body: mk(rbox(0.9, 0.78, 0.6, 0.13, 1)),
      limb: mk(rbox(0.3, 0.57, 0.3, 0.07, 1), MAT_A, '#ffffff', 0, 2100), hand: mk(sphere(0.15, 4), MAT_A, '#ffffff', 0, 1400),
      eye: mk(rbox(0.11, 0.16, 0.06, 0.03, 1), MAT_V, '#1d2233', 0, 1400), mouth: mk(box(0.22, 0.05, 0.04), MAT_V, '#5b2121'),
      cap: mk(rbox(1.16, 0.32, 1.1, 0.08, 1)), brim: mk(box(0.96, 0.07, 0.42)), badge: mk(box(0.16, 0.14, 0.05), MAT_V, '#ffd23f', 0.3),
      star: mk(star(0.38), MAT_V, '#ffd23f', 0.6, 300),
      carBody: mk(rbox(2.1, 0.85, 4.4, 0.32), MAT_A, '#ffffff', 0, 120), carCabin: mk(rbox(1.8, 0.78, 2.3, 0.3), MAT_V, '#9fd3f2', 0, 120),
      carRoof: mk(rbox(1.86, 0.14, 2.0, 0.06), MAT_A, '#ffffff', 0, 120), wheel: mk(cyl(0.42, 0.42, 0.34, 8), MAT_V, '#262a35', 0, 480),
      headl: mk(box(0.42, 0.22, 0.1), MAT_V, '#fff6c9', 0.7, 240), taill: mk(box(0.42, 0.2, 0.1), MAT_V, '#ff4d4d', 0.6, 240),
      stripe: mk(box(2.14, 0.3, 3.0), MAT_V, '#1e3a8a', 0, 40), barR: mk(box(0.7, 0.2, 0.4), MAT_V, '#ff2d2d', 0.9, 40), barB: mk(box(0.7, 0.2, 0.4), MAT_V, '#2d6bff', 0.9, 40),
      taxi: mk(rbox(0.8, 0.3, 0.4, 0.08), MAT_V, '#fff7d6', 0.3, 40),
      busBody: mk(rbox(2.5, 2.9, 12, 0.4), MAT_A, '#ffffff', 0, 8), busGlass: mk(rbox(2.56, 1.0, 10.6, 0.2), MAT_V, '#bfe6ff', 0, 8), busRoof: mk(rbox(2.2, 0.25, 10, 0.1), MAT_V, '#e8eef8', 0, 8),
      puff: mk(ico(0.55), MAT_A, '#ffffff', 0, 600),
      // fire + water (fire.js) and mission markers (missions.js): emissive so they glow
      flame: mk(ico(0.55), MAT_A, '#ffffff', 0.85, 500), water: mk(ico(0.16), MAT_A, '#ffffff', 0.3, 500),
      ring: mk(torus(2.6, 0.2, 32, 6), MAT_A, '#ffffff', 0.75, 24), gem: mk(ico(0.7), MAT_A, '#ffffff', 0.6, 24),
      bun: mk(sphere(0.55, 8), MAT_A, '#ffffff', 0.55, 40), // golden dim sum (pranks.js)
      // traffic-light lamps: a short emissive cylinder through the head, lens on both faces
      sigLamp: mk(cyl(0.25, 0.25, 0.52, 12), MAT_A, '#ffffff', 0.9, 900),
    };
    // Polyfork vehicles (when loaded): one instanced batch per model, paint tinted per car
    this.pf = {}; // (also listed in this.B as pf_<type>, so every batch loop sees them)
    for (const [k, cap] of [['sedan', 140], ['suv', 60], ['van', 30], ['taxi', 40], ['police', 20], ['bus', 8]]) {
      if (!MODELS[k]) continue;
      const mb = new MeshBuilder(); mb.addTriangles(MODELS[k], M.I()); this.B['pf_' + k] = this.pf[k] = this.r.instanced(mb, cap);
    }
    this.tmp = new Float32Array(16);
  }
  put(batch, m, col) {
    if (batch.n >= batch.cap) return;
    const o = batch.n * INST_FLOATS, d = batch.data;
    for (let i = 0; i < 16; i++) d[o + i] = m[i];
    const c = col || [1, 1, 1];
    d[o + 16] = c[0]; d[o + 17] = c[1]; d[o + 18] = c[2]; d[o + 19] = c[0]; d[o + 20] = c[1]; d[o + 21] = c[2];
    batch.n++;
  }

  // ------------------------------------------------------------------ factories
  makeChar(kind, x, z, cols = {}, extra = {}) {
    const c = {
      id: uid++, kind, x, z, y: 0, vy: 0, vx: 0, vz: 0, face: rr(0, 6.28), speed: 0, r: CFG.peds.radius,
      shirt: hexc(cols.shirt || pick(SHIRT)), pants: hexc(cols.pants || pick(PANTS)), skin: hexc(cols.skin || pick(SKIN)), hair: hexc(cols.hair || pick(HAIR)),
      cap: cols.cap ? hexc(cols.cap) : null, shoes: hexc(cols.shoes || pick(SHOES)),
      hp: 60, maxhp: 60, power: 1, temper: 'normal', state: 'walk', timer: 0, phase: rr(0, 6), punchT: 0, cd: 0,
      path: null, bubbleT: 0, mouth: false, ...extra,
    };
    if (kind === 'player') c.r = CFG.player.radius;
    c.hs = cols.hs || (c.hair[0] > 0.55 && c.hair[2] > 0.55 ? (Math.random() < 0.6 ? 'bald' : 'short') : pick(HAIRDO));
    this.chars.push(c);
    return c;
  }
  makeChar2(kind, x, z) {
    const P = CFG.peds;
    if (kind === 'cop') {
      const c = this.makeChar('cop', x, z, { shirt: '#1e3a8a', pants: '#172554', cap: '#172554', hair: '#222222', shoes: '#0f172a', hs: 'short' });
      c.hp = c.maxhp = CFG.police.hp; c.power = 1.4; c.state = 'patrol';
      return c;
    }
    const roll = Math.random();
    const T = P.temper;
    const temper = roll < T.timid ? 'timid' : roll < T.timid + T.normal ? 'normal' : roll < T.timid + T.normal + T.angry ? 'angry' : 'master';
    const sa = temper !== 'master' && Math.random() < P.southAsian;
    const c = this.makeChar('ped', x, z, temper === 'master' ? { shirt: '#111111', pants: '#b91c1c' }
      : sa ? { skin: pick(SA_SKIN), hair: pick(SA_HAIR), shirt: pick(SA_TOP), pants: pick(SA_LOW) } : {});
    if (sa) {
      // half dressed traditionally: a kurta (long tunic); some men wear a dastar, some women a dupatta + braid
      if (Math.random() < P.kurta) c.kurta = true;
      if (Math.random() < 0.5) { c.hs = 'short'; if (Math.random() < P.turban) { c.turban = hexc(pick(SA_WRAP)); c.beard = true; } }
      else { c.braid = true; c.hs = 'long'; if (Math.random() < P.dupatta) { c.dupatta = hexc(pick(SA_WRAP)); c.kurta = true; } }
    }
    c.temper = temper;
    c.hp = c.maxhp = temper === 'master' ? 220 : rr(P.hp[0], P.hp[1]);
    c.power = temper === 'master' ? 3.2 : rr(P.power[0], P.power[1]);
    return c;
  }
  makeCar(type, x, z, a, opts = {}) {
    const car = {
      id: uid++, type, x, z, a, speed: 0, vx: 0, vz: 0, hp: CFG.car.hp, bus: type === 'bus', col: hexc(opts.col || (type === 'bus' ? '#2563eb' : type === 'police' ? '#f8fafc' : type === 'taxi' ? '#fbbf24' : pick(type === 'suv' ? SUVCOL : type === 'van' ? VANCOL : CARCOL))),
      driver: opts.driver || null, ai: opts.ai || null, parked: !!opts.parked, stopT: 0, honkT: 0, smokeT: 0, dead: false, cops: opts.cops || 0, route: null, routeT: 0, stuckT: 0, revT: 0,
    };
    this.cars.push(car);
    return car;
  }
  // random civilian vehicle type by the weights in CFG.traffic.mix
  pickType() {
    const mix = CFG.traffic.mix;
    let r = Math.random() * Object.values(mix).reduce((a, b) => a + b, 0);
    for (const k in mix) { r -= mix[k]; if (r < 0) return k; }
    return 'sedan';
  }

  // ------------------------------------------------------------------ helpers
  // gameplay events for the prank list (pranks.js): hit, carjack, enter, runover, horn, escaped, ignite, boom, crew, ko
  ev(type, data) { if (this.pranks) this.pranks.on(type, data); }
  bubble(key, c, dy = 3.6) { this.hud.bubble(t(key), [c.x, (c.y || 0) + dy, c.z]); }
  worldDir(mx, my) {
    const az = CFG.camera.azimuth;
    const fx = -Math.sin(az), fz = -Math.cos(az), rx = Math.cos(az), rz = -Math.sin(az);
    return [rx * mx + fx * my, rz * mx + fz * my];
  }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  playerPos() { return this.inCar ? this.inCar : this.player; }
  crime(x, z, direct = null) {
    let seen = !!direct;
    for (const c of this.chars) {
      if (c.kind !== 'cop' || c.state === 'down' || c.state === 'fly') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < CFG.police.sight && this.w.los(c.x, c.z, x, z)) { seen = true; break; }
    }
    if (!seen) for (const car of this.cars) {
      if (car.type !== 'police' || car.dead || !car.cops) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < CFG.police.sight * 1.2 && this.w.los(car.x, car.z, x, z)) { seen = true; break; }
    }
    // bystanders react
    for (const c of this.chars) {
      if (c.kind !== 'ped' || c.state === 'down' || c.state === 'fly' || c.state === 'fight') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < CFG.peds.witness) {
        const p = { timid: 0.85, normal: 0.45, angry: 0.1, master: 0 }[c.temper];
        if (Math.random() < p) { this.flee(c, x, z); if (Math.random() < 0.35) { this.bubble('help', c); sfx.scream(0.4); } }
      }
    }
    if (seen) this.startChase(x, z);
  }
  startChase(x, z) {
    const P = this.playerPos();
    if (!this.chase.active) { this.hud.banner(t('chase'), 'red'); }
    this.chase.active = true; this.chase.unseen = 0;
    for (const c of this.chars) if (c.kind === 'cop' && c.state !== 'down' && c.state !== 'fly' && this.dist(c, P) < CFG.police.alert) { if (c.state !== 'chase') this.bubble('stop', c); c.state = 'chase'; c.path = null; }
    for (const car of this.cars) if (car.type === 'police' && car.cops && !car.dead && this.dist(car, P) < CFG.police.alert * 1.5) { car.chasing = true; car.ai = null; }
  }
  endChase(silent = false) {
    if (!this.chase.active) return;
    this.chase.active = false;
    for (const c of this.chars) if (c.kind === 'cop' && c.state === 'chase') { c.state = 'leave'; c.timer = 20; }
    for (const car of this.cars) if (car.type === 'police') car.chasing = false;
    if (!silent) { this.hud.banner(t('escaped'), 'green'); this.ev('escaped'); }
  }
  flee(c, fx, fz, time = rr(5, 8)) {
    if (c.state === 'down' || c.state === 'fly') return;
    c.state = 'flee'; c.timer = time; c.path = null;
    c.fleeFrom = [fx, fz];
  }
  knockDown(c, time) {
    c.state = 'down'; c.timer = time; c.path = null; c.vx *= 0.3; c.vz *= 0.3;
  }

  // ------------------------------------------------------------------ combat
  // game feel: one call per impact, scaled by importance tier (CFG.feel): camera trauma (shake),
  // a short hit-stop (freeze) and, for a struck character, a squash "pop"
  feedback(tier, who = null) {
    const F = CFG.feel[tier];
    this.shake = Math.min(1, this.shake + F.trauma);
    this.hitStop = Math.max(this.hitStop || 0, F.stop);
    if (who) who.squashT = CFG.feel.squashTime;
  }
  hit(target, dmg, attacker) {
    if (target.state === 'down' || target.state === 'fly') return;
    const ax = target.x - attacker.x, az = target.z - attacker.z, L = Math.hypot(ax, az) || 1;
    target.vx += (ax / L) * 4.5; target.vz += (az / L) * 4.5;
    sfx.punch(attacker === this.player ? 1 : 0.6);
    if (attacker === this.player || target === this.player) this.feedback(target.kind === 'cop' || target === this.player ? 'medium' : 'small', target);
    if (target === this.player) {
      if (this.player.invuln > 0 || this.player.state === 'ko') return;
      this.player.hp -= dmg; this.player.hurtT = 3; this.player.regenT = CFG.player.regenDelay;
      if (Math.random() < 0.4) this.bubble('ouch', target);
      if (this.player.hp <= 0) { this.ev('ko', { by: attacker }); this.playerKO(attacker.kind === 'cop'); }
      return;
    }
    target.hp -= dmg;
    if (attacker === this.player) {
      this.ev('hit', { target, ko: target.hp <= 0 });
      if (Math.random() < 0.6) this.hud.bubble(t('pow'), [target.x, 2.8, target.z], 'pow');
      this.crime(target.x, target.z, target.kind === 'cop' ? target : null);
    }
    if (target.kind === 'cop') {
      if (target.hp <= 0) { this.knockDown(target, 6); target.hp = target.maxhp * 0.6; }
      else if (attacker === this.player) target.state = 'chase';
      return;
    }
    // pedestrian reaction
    if (target.hp <= 0) { this.knockDown(target, rr(...CFG.peds.downTime)); return; }
    const r = Math.random();
    const react = {
      timid: r < 0.85 ? 'flee' : 'fall',
      normal: r < 0.45 ? 'flee' : r < 0.8 ? 'fight' : 'fall',
      angry: r < 0.9 ? 'fight' : 'flee',
      master: 'fight',
    }[target.temper];
    if (attacker !== this.player && react === 'fight') return;
    if (react === 'flee') { this.flee(target, attacker.x, attacker.z); if (Math.random() < 0.5) { this.bubble('help', target); sfx.scream(); } }
    else if (react === 'fall') this.knockDown(target, 2.5);
    else { if (target.state !== 'fight') this.bubble(target.temper === 'master' ? 'master' : 'angry', target); target.state = 'fight'; target.timer = 14; target.path = null; }
  }
  playerKO(byCop) {
    const p = this.player;
    this.feedback('large', p);
    p.state = 'ko'; p.timer = CFG.player.koTime; p.hp = 0;
    this.bubble('ko', p, 4);
    if (byCop) { this.bust(); return; }
    for (const c of this.chars) if (c.state === 'fight') this.flee(c, p.x, p.z, 4);
  }
  bust() {
    if (this.busted > 0) return;
    this.busted = 2.2;
    sfx.cuffs();
    this.hud.busted(true);
    this.missions.onBusted();
  }
  finishBust() {
    this.hud.busted(false);
    // respawn 150-300 m away (spec 2.5) on a sidewalk, as far from the police as possible,
    // never in water or on the tracks; the distance is checked after snapping to the road
    const P = this.playerPos(), [r0, r1] = CFG.police.respawn, mid = (r0 + r1) / 2;
    const cops = [...this.chars.filter((c) => c.kind === 'cop'), ...this.cars.filter((c) => c.type === 'police' && c !== this.inCar)];
    let best = null, bestScore = -1, alt = null;
    for (let i = 0; i < 80 && bestScore < 1e9; i++) {
      const a = rr(0, 6.28), d = rr(r0 + 10, r1 - 10);
      const ne = this.w.nearestEdge(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 30);
      if (!ne) continue;
      const s = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
      const side = ne.e.oneway || Math.random() < 0.5 ? 1 : -1; // divided roads: outer curb only
      const sp = this.w.edgePoint(ne.e, s, 1, side * (ne.e.w / 2 + 1.6));
      const q = this.w.collide(sp.x, sp.z, CFG.player.radius);
      if (this.w.inWater(q.x, q.z) || this.w.onRail(q.x, q.z)) continue;
      const dd = Math.hypot(q.x - P.x, q.z - P.z);
      if (dd < r0 || dd > r1) { if (!alt || Math.abs(dd - mid) < alt.miss) alt = { x: q.x, z: q.z, miss: Math.abs(dd - mid) }; continue; }
      let minCop = 1e9;
      for (const c of cops) minCop = Math.min(minCop, Math.hypot(c.x - q.x, c.z - q.z));
      if (minCop > bestScore) { bestScore = minCop; best = q; }
    }
    best = best || alt;
    if (this.inCar) this.exitCar(true);
    const p = this.player;
    if (best) { p.x = best.x; p.z = best.z; }
    p.state = 'walk'; p.hp = CFG.player.hp; p.invuln = CFG.player.invuln; p.vx = p.vz = 0;
    this.endChase(true);
    // remove all police so the restart is calm
    this.chars = this.chars.filter((c) => c.kind !== 'cop');
    this.cars = this.cars.filter((c) => c.type !== 'police' || c === this.inCar);
    this.camPos = [p.x, 0, p.z];
  }

  // ------------------------------------------------------------------ cars
  nearestCar(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) { if (c.bus) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } } // no boarding buses (spec 2.3)
    return best;
  }
  enterCar(car) {
    const p = this.player;
    if (car.driver === 'npc' || (car.ai && !car.parked)) {
      // carjack: pull the driver out
      const side = this.carSide(car, 1.8);
      const d = this.makeChar2(car.type === 'police' ? 'cop' : 'ped', side[0], side[1]);
      if (car.type === 'police') { car.cops = 0; d.state = 'chase'; }
      else { this.bubble('stolen', d); if (d.temper === 'angry' || d.temper === 'master') { d.state = 'fight'; d.timer = 12; } else this.flee(d, p.x, p.z); }
      this.crime(car.x, car.z, car.type === 'police' ? d : null);
      this.ev('carjack', car);
    } else if (car.type === 'police' && car.cops) { car.cops = 0; this.crime(car.x, car.z, car); }
    car.driver = 'player'; car.ai = null; car.parked = false; car.stopT = 0;
    this.inCar = car;
    p.hidden = true;
    this.hud.setMode(true, car.type);
    this.ev('enter', car);
  }
  carSide(car, off) {
    const rx = Math.cos(car.a), rz = -Math.sin(car.a);
    return [car.x - rx * off, car.z - rz * off];
  }
  exitCar(silent = false) {
    const car = this.inCar; if (!car) return;
    const p = this.player;
    let [x, z] = this.carSide(car, 2.0);
    const res = this.w.collide(x, z, p.r); x = res.x; z = res.z;
    p.x = x; p.z = z; p.hidden = false; p.face = car.a; p.state = 'walk';
    car.driver = null; car.parked = true; car.speed *= 0.3;
    this.inCar = null;
    this.hud.setMode(false);
    sfx.engineUpdate(false, 0);
  }
  carPhysics(car, throttle, steer, handbrake, dt) {
    const C = CFG.car;
    if (car.hp <= 0) { throttle = 0; steer *= 0.3; }
    const TR = CFG.traffic, ty = car.type;
    const max = C.maxSpeed * (ty === 'police' ? 1.05 : ty === 'van' ? TR.vanSpeed : ty === 'suv' ? TR.suvSpeed : 1);
    const acc = C.accel * (ty === 'van' ? TR.vanAccel : 1);
    if (throttle > 0) { car.speed += (car.speed < 0 ? C.brake : acc) * throttle * dt; }
    else if (throttle < 0) { car.speed += (car.speed > 0.5 ? -C.brake : -C.reverse) * -throttle * dt; }
    car.speed -= car.speed * C.drag * dt + Math.sign(car.speed) * 0.8 * dt * (throttle === 0 ? 1 : 0);
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    car.speed = clamp(car.speed, -C.maxReverse, max);
    const steerAmt = steer * C.steer * clamp(car.speed / 7, -1, 1) * (handbrake ? 1.35 : 1);
    car.a += steerAmt * dt;
    const fx = Math.sin(car.a), fz = Math.cos(car.a);
    const grip = handbrake ? C.driftGrip : C.grip;
    const k = 1 - Math.exp(-grip * dt);
    car.vx = lerp(car.vx, fx * car.speed, k); car.vz = lerp(car.vz, fz * car.speed, k);
    if (handbrake) car.speed *= 1 - 0.9 * dt;
    car.x += car.vx * dt; car.z += car.vz * dt;
    // static collision using two circles (front/back)
    let hit = false, impact = 0;
    for (const off of [1.3, -1.3]) {
      const cx = car.x + fx * off, cz = car.z + fz * off;
      const res = this.w.collide(cx, cz, 1.1);
      if (res.hit) {
        car.x += res.x - cx; car.z += res.z - cz; hit = true;
        const vn = car.vx * res.nx + car.vz * res.nz;
        if (vn < 0) { impact = Math.max(impact, -vn); car.vx -= vn * res.nx * 1.3; car.vz -= vn * res.nz * 1.3; }
      }
    }
    if (this.w.inWater(car.x, car.z)) { car.x -= car.vx * dt * 1.5; car.z -= car.vz * dt * 1.5; car.speed *= -0.3; car.vx *= -0.3; car.vz *= -0.3; }
    if (hit && impact > 0.3) {
      car.speed = (car.vx * fx + car.vz * fz);
      if (impact > 4) { car.hp -= impact * 1.6; if (car === this.inCar) { sfx.crash(impact / 15); this.feedback(impact > 12 ? 'large' : 'medium'); } }
    }
  }

  // ------------------------------------------------------------------ path following (peds & traffic)
  startPath(e, s, dir) { return { e, s, dir }; }
  // random continuation {e, dir} at the far end of edge e travelled in direction dir
  // (preferArterial = traffic: likes arterials, never U-turns where a divided road splits)
  pickNext(e, dir, allowOneway, preferArterial, stay = -1) {
    const node = dir > 0 ? e.b : e.a;
    let opts = this.w.adj[node].filter((a) => a.e !== e.i);
    if (!allowOneway) opts = opts.filter((a) => !this.w.edges[a.e].oneway || a.dir > 0);
    if (!opts.length) return { e: e.i, dir: -dir };
    if (stay >= 0) { const on = opts.filter((a) => this.w.edges[a.e].name === stay); if (on.length) opts = on; } // buses keep to their road
    if (preferArterial && opts.length > 1) {
      // travel directions over ~10 m (carriageways splay out right at a split node)
      const W = this.w, n = W.nodes[node], q = W.edgePoint(e, e.len - Math.min(10, e.len), dir);
      let hx = n[0] - q.x, hz = n[1] - q.z;
      const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
      const fwd = opts.filter((a) => {
        const o = W.edges[a.e], r = W.edgePoint(o, Math.min(10, o.len), a.dir), sx = r.x - n[0], sz = r.z - n[1];
        return hx * sx + hz * sz > -0.7 * (Math.hypot(sx, sz) || 1);
      });
      if (fwd.length) opts = fwd;
    }
    let ch = pick(opts);
    if (preferArterial && Math.random() < 0.6) { const art = opts.filter((a) => this.w.edges[a.e].cls <= 2); if (art.length) ch = pick(art); }
    return ch;
  }
  // path.next (set ahead of time by traffic, see signalAhead) is the committed next edge
  advancePath(path, ds, allowOneway, preferArterial = false) {
    path.s += ds;
    let guard = 0;
    while (path.s >= path.e.len && guard++ < 4) {
      path.s -= path.e.len;
      const ch = path.next || this.pickNext(path.e, path.dir, allowOneway, preferArterial);
      path.e = this.w.edges[ch.e]; path.dir = ch.dir; path.next = null;
    }
  }
  // is the move e -> nx a left turn, with oncoming traffic about to come through the junction?
  // give-way line on a minor road: distance before the junction node (end of edge e driven in dir)
  // where a car waiting for traffic on a bigger road stops, clear of that road's carriageway.
  // 0 = no line (we are on the biggest road there, or it is a signalised junction)
  giveWay(e, dir) {
    const k = dir > 0 ? 'gwF' : 'gwB';
    if (e[k] === undefined) {
      const node = dir > 0 ? e.b : e.a;
      let w = 0, major = Infinity;
      for (const a of this.w.adj[node]) if (a.e !== e.i) { const o = this.w.edges[a.e]; w = Math.max(w, o.w); major = Math.min(major, o.cls); }
      e[k] = major < e.cls ? w / 2 + CFG.traffic.giveWayGap : 0;
    }
    return e[k];
  }
  leftTurnBlocked(car, e, dir, nx, sig) {
    const W = this.w, a = W.edgePoint(e, Math.max(0, e.len - 6), dir), o = W.edges[nx.e], b = W.edgePoint(o, Math.min(6, o.len), nx.dir);
    if (b.dx * a.dz - b.dz * a.dx < 0.5) return false; // not a left turn (left of travel = (dz, -dx))
    for (const c of this.cars) {
      if (c === car || !c.ai || Math.abs(c.speed) < 2) continue;
      if (Math.sin(c.a) * a.dx + Math.cos(c.a) * a.dz > -0.7) continue; // not heading the other way
      const dx = sig.x - c.x, dz = sig.z - c.z, d = Math.hypot(dx, dz);
      if (d < 45 && dx * Math.sin(c.a) + dz * Math.cos(c.a) > 0 && d / c.speed < 4) return true; // approaching, < 4 s away
    }
    return false;
  }
  // next traffic-light stop line ahead of a traffic car: {ap, d} with d = path distance to it
  // (negative once passed), looking at the current edge and the committed next edge
  signalAhead(path) {
    const W = this.w, rem = path.e.len - path.s;
    let ap = W.sigApproach(path.e.i, path.dir);
    if (ap && rem - ap.stop > -0.5) return { ap, d: rem - ap.stop };
    const nx = path.next;
    ap = nx && W.sigApproach(nx.e, nx.dir);
    if (ap) return { ap, d: rem + W.edges[nx.e].len - ap.stop };
    return null;
  }

  // walk c toward (tx, tz) at most `speed`, stepping around the player instead of bumping into them
  // (bump + push-apart made pedestrians shake when the player brushed past); returns the distance left
  stepToward(c, tx, tz, speed, dt) {
    let dx = tx - c.x, dz = tz - c.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return 0;
    dx /= L; dz /= L;
    c.avoidT = Math.max(0, (c.avoidT || 0) - dt);
    c.yieldT = Math.max(0, (c.yieldT || 0) - dt);
    if (c.yieldT > 0) { c.mvx = (c.mvx || 0) * 0.8; c.mvz = (c.mvz || 0) * 0.8; return L; } // just bumped into the player: let them pass
    let mx = dx, mz = dz, sp = speed;
    const p = this.player, A = CFG.peds.avoidPlayer;
    if (!p.hidden && p.state !== 'ko' && p.state !== 'down') {
      const ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz) || 1e-4;
      const ux = ox / d, uz = oz / d, clear = c.r + p.r + 0.45;
      const half = Math.asin(Math.min(1, clear / d)); // half-angle of the player's personal space seen from here
      // does the way we want to go run into that space? then walk along its edge (tangent), never into it
      if (d < A && ux * dx + uz * dz > Math.cos(half)) {
        const px = -uz, pz = ux; // perpendicular to the line toward the player
        if (c.avoidT <= 0) {
          // pass on the side the goal already leans to; skip a side blocked by a wall; no way round -> wait
          const free = (sd) => {
            const qx = p.x + px * sd * clear, qz = p.z + pz * sd * clear;
            return !this.w.collide(qx, qz, c.r + 0.1).hit && !this.w.collide((qx + c.x) / 2, (qz + c.z) / 2, c.r + 0.1).hit;
          };
          const pref = dx * px + dz * pz >= 0 ? 1 : -1;
          c.avoidSide = free(pref) ? pref : free(-pref) ? -pref : 0;
        }
        c.avoidT = c.avoidSide ? 0.6 : 0.3;
        if (!c.avoidSide) { c.mvx = (c.mvx || 0) * 0.8; c.mvz = (c.mvz || 0) * 0.8; return L; }
        const cs = Math.cos(half), sn = Math.sin(half) * c.avoidSide;
        mx = ux * cs + px * sn; mz = uz * cs + pz * sn;
        sp *= 0.85;
      }
    }
    // a little inertia: the walking velocity eases toward the wanted one, so it can never flip
    // from one frame to the next (direct position steps made people shake when nudged)
    const want = Math.min(sp, L / Math.max(dt, 1e-3));
    const k = Math.min(1, 10 * dt);
    c.mvx = (c.mvx || 0) + (mx * want - (c.mvx || 0)) * k;
    c.mvz = (c.mvz || 0) + (mz * want - (c.mvz || 0)) * k;
    c.x += c.mvx * dt; c.z += c.mvz * dt;
    const v = Math.hypot(c.mvx, c.mvz);
    if (v > 0.05) c.face += angDiff(c.face, Math.atan2(c.mvx, c.mvz)) * Math.min(1, 7 * dt);
    return L;
  }

  // back onto the sidewalk network from wherever a pedestrian / officer ended up (after fleeing, a chase...)
  rejoinPath(c) {
    const ne = this.w.nearestEdge(c.x, c.z, 30);
    if (!ne || ne.e.len < 8) { c.timer = 3; return; }
    const dir = Math.random() < 0.5 ? 1 : -1;
    const s0 = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
    c.path = this.startPath(ne.e, dir > 0 ? s0 : ne.e.len - s0, dir);
    c.state = c.kind === 'cop' ? 'patrol' : 'walk'; c.lagT = 0;
  }
  // is (x, y, z) inside the camera view (+margin in screen fractions)? main.js keeps camPos, camDist
  // and viewAspect current; the projection matches main.js render()
  onScreen(x, z, margin = 0, y = 1) {
    const C = CFG.camera, d = this.camDist, t = this.camPos;
    const key = t[0] + ',' + t[2] + ',' + d + ',' + this.viewAspect;
    if (this._vpKey !== key) {
      const eye = [t[0] + Math.sin(C.azimuth) * Math.cos(C.elevation) * d, Math.sin(C.elevation) * d, t[2] + Math.cos(C.azimuth) * Math.cos(C.elevation) * d];
      this._vp = M.mul(M.persp(C.fov, this.viewAspect, 2, 1200), M.look(eye, [t[0], 0, t[2]], [0, 1, 0]));
      this._vpKey = key;
    }
    const V = this._vp;
    const cx = V[0] * x + V[4] * y + V[8] * z + V[12], cy = V[1] * x + V[5] * y + V[9] * z + V[13], cw = V[3] * x + V[7] * y + V[11] * z + V[15];
    return cw > 0 && Math.abs(cx / cw) < 1 + margin && Math.abs(cy / cw) < 1 + margin;
  }

  // can someone walking at `speed` get from a to b before any approaching car or bus arrives?
  roadClear(ax, az, bx, bz, speed) {
    const need = Math.hypot(bx - ax, bz - az) / speed + 1.5;
    const movers = [...this.cars, ...this.buses.filter((b) => b.moving).map((b) => ({ x: b.x, z: b.z, speed: CFG.bus.speed, vx: Math.sin(b.a), vz: Math.cos(b.a) }))];
    for (const car of movers) {
      const v = Math.abs(car.speed);
      if (v < 1) continue;
      const r = segDist(car.x, car.z, ax, az, bx, bz);
      if (r.d > 90) continue;
      if (r.d > 4 && (r.cx - car.x) * car.vx + (r.cz - car.z) * car.vz <= 0) continue; // moving away
      if (r.d / v < need) return false;
    }
    return true;
  }

  // everyone in uniform: officers on foot + officers still sitting in police cars (spec 6.4: <= 8)
  policeCount() {
    let n = 0;
    for (const c of this.chars) if (c.kind === 'cop') n++;
    for (const car of this.cars) if (car.type === 'police') n += car.cops || 0;
    return n;
  }

  // ------------------------------------------------------------------ spawning
  spawnAround(initial = false) {
    const P = this.playerPos();
    const PD = CFG.peds, TR = CFG.traffic, PO = CFG.police;
    const target = this.isMobile ? PD.countMobile : PD.countDesktop;
    // despawn far ones
    this.chars = this.chars.filter((c) => c === this.player || this.dist(c, P) < ((c.kind === 'cop' && c.state === 'chase') || c.kind === 'fireman' ? 260 : PD.despawn));
    this.cars = this.cars.filter((c) => c === this.inCar || this.dist(c, P) < (c.chasing || c.task ? 320 : TR.despawn));
    const peds = this.chars.filter((c) => c.kind === 'ped').length;
    const cops = this.chars.filter((c) => c.kind === 'cop').length;
    // a road near a random point of the ring [a, b] m around the player; after the first frame it must
    // be off-screen so nothing pops into view (the camera is wider when driving, so retry further out)
    const ringPoint = (a, b, cls = 9) => {
      for (let i = 0; i < 16; i++) {
        const far = i >= 10 ? 40 : 0;
        const ang = rr(0, 6.28), d = rr(a + far, b + far);
        const ne = this.w.nearestEdge(P.x + Math.cos(ang) * d, P.z + Math.sin(ang) * d, 25);
        if (!ne || ne.e.cls > cls || ne.e.len <= 8) continue;
        const q = this.w.edgePoint(ne.e, ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]), 1, 0);
        if (!initial && this.onScreen(q.x, q.z, CFG.peds.spawnMargin)) continue;
        return ne;
      }
      return null;
    };
    const addWalker = (kind) => {
      const ne = initial ? ringPoint(12, 60) : ringPoint(PD.spawnMin, PD.spawnMax);
      if (!ne) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const s0 = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
      const s = dir > 0 ? s0 : ne.e.len - s0;
      const off = (ne.e.oneway ? dir : 1) * (ne.e.w / 2 + 1.7);
      const p = this.w.edgePoint(ne.e, s, dir, off);
      if (this.w.inWater(p.x, p.z)) return;
      if (!initial && this.onScreen(p.x, p.z, CFG.peds.spawnMargin)) return; // the sidewalk spot itself, not just the road
      const c = this.makeChar2(kind, p.x, p.z);
      c.path = this.startPath(ne.e, s, dir); c.off = off;
    };
    if (peds < target) for (let i = 0; i < Math.min(initial ? target : 3, target - peds); i++) addWalker('ped');
    const copTarget = this.chase.active ? PO.footChase : PO.footPatrol;
    if (cops < copTarget && !this.chase.active && this.policeCount() < PO.max) addWalker('cop');
    // traffic
    const moving = this.cars.filter((c) => c.ai && c.type !== 'police' && !c.bus).length;
    const trTarget = this.isMobile ? TR.countMobile : TR.countDesktop;
    if (moving < trTarget) {
      const ne = ringPoint(TR.spawnMin, TR.spawnMax, 3);
      if (ne) this.addTraffic(ne, this.pickType());
    }
    // Viva buses in Hwy 7 traffic, so they show up around the spawn too (the rapidway is only out west)
    if (this.cars.filter((c) => c.bus).length < CFG.bus.laneCount) {
      if (!this.busRoad) { const nm = this.w.names.indexOf('Hwy 7'); this.busRoad = { nm, edges: this.w.edges.filter((e) => e.name === nm && e.len > 25) }; }
      for (let i = 0; i < 8 && this.busRoad.edges.length; i++) {
        const e = pick(this.busRoad.edges), mid = this.w.edgePoint(e, e.len / 2, 1);
        const d = Math.hypot(mid.x - P.x, mid.z - P.z);
        if (d < (initial ? 30 : TR.spawnMin) || d > TR.spawnMax + 60) continue;
        const car = this.addTraffic({ e, k: Math.floor((e.pts.length - 2) / 2), t: 0.5 }, 'bus');
        if (car) { car.ai.stay = this.busRoad.nm; break; }
      }
    }
    const parked = this.cars.filter((c) => c.parked && !c.driver).length;
    if (parked < TR.parked) {
      const ne = ringPoint(45, 120, 3);
      if (ne && ne.e.cls === 3) {
        const s = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
        const p = this.w.edgePoint(ne.e, s, 1, ne.e.w / 2 - 1.2);
        if (!this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 6) && (initial || !this.onScreen(p.x, p.z, CFG.peds.spawnMargin))) this.makeCar(this.pickType(), p.x, p.z, Math.atan2(p.dx, p.dz), { parked: true });
      }
    }
    const pcars = this.cars.filter((c) => c.type === 'police' && c !== this.inCar).length;
    const pcTarget = this.chase.active ? PO.carChase : PO.carPatrol;
    if (pcars < pcTarget && this.policeCount() + 2 <= PO.max) {
      const ne = ringPoint(this.chase.active ? 70 : TR.spawnMin, this.chase.active ? 110 : TR.spawnMax, 2);
      if (ne) { const car = this.addTraffic(ne, 'police'); if (car && this.chase.active) { car.chasing = true; car.ai = null; } }
    }
    // buses on the rapidway
    this.buses = this.buses.filter((b) => Math.hypot(b.x - P.x, b.z - P.z) < 400);
    if (this.buses.length < CFG.bus.count) {
      let best = null, bd = 1e9;
      for (const pts of this.w.map.busways) for (let k = 0; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z); if (d < bd && d > 60 && !this.onScreen(pts[k][0], pts[k][1], 0.35)) { bd = d; best = { pts, k }; } }
      if (best && bd < 350) {
        const cum = [0]; for (let k = 1; k < best.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(best.pts[k][0] - best.pts[k - 1][0], best.pts[k][1] - best.pts[k - 1][1]));
        if (cum[cum.length - 1] > 60) this.buses.push({ pts: best.pts, cum, s: cum[best.k], dir: Math.random() < 0.5 ? 1 : -1, x: 0, z: 0, a: 0, stopT: 0 });
      }
    }
  }
  addTraffic(ne, type) {
    const e = ne.e;
    let dir = Math.random() < 0.5 ? 1 : -1;
    if (e.oneway) dir = 1;
    const s0 = e.cum[ne.k] + ne.t * (e.cum[ne.k + 1] - e.cum[ne.k]);
    const s = dir > 0 ? s0 : e.len - s0;
    const off = laneOff(e);
    const p = this.w.edgePoint(e, s, dir, off);
    if (this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < (type === 'bus' || c.bus ? 16 : 10))) return null;
    if (this.time > 0.5 && this.onScreen(p.x, p.z, CFG.peds.spawnMargin)) return null; // never pop into view
    const car = this.makeCar(type, p.x, p.z, Math.atan2(p.dx, p.dz), { ai: { path: this.startPath(e, s, dir), off }, driver: 'npc', cops: type === 'police' ? 2 : 0 });
    car.speed = CFG.traffic.speed[e.cls] * 0.8;
    return car;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    // the BUSTED screen counts real time; then hit-stop nearly freezes the world for a few frames
    if (this.busted > 0) { this.busted -= dt; if (this.busted <= 0) this.finishBust(); }
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= CFG.feel.stopScale; }
    this.time += dt;
    this.spawnTimer = (this.spawnTimer || 0) - dt;
    if (this.spawnTimer <= 0) { this.spawnAround(); this.spawnTimer = 0.4; }
    this.updatePlayer(dt);
    for (const c of this.chars) if (c !== this.player) this.updateChar(c, dt);
    for (const car of this.cars) this.updateCar(car, dt);
    this.updateBuses(dt);
    this.resolveChars(dt);
    this.carHits(dt);
    this.fires.update(dt);
    this.missions.update(dt);
    this.pranks.update(dt);
    this.nav.update(dt);
    this.updateChase(dt);
    this.updatePuffs(dt);
    this.shake = Math.max(0, this.shake - dt * CFG.feel.decay); // trauma decays; the camera shakes by trauma^2
  }
  updatePlayer(dt) {
    const p = this.player, PC = CFG.player;
    p.invuln = Math.max(0, (p.invuln || 0) - dt);
    if (p.squashT > 0) p.squashT -= dt;
    p.hurtT = Math.max(0, (p.hurtT || 0) - dt);
    p.regenT = Math.max(0, (p.regenT || 0) - dt);
    if (p.regenT <= 0 && p.hp < PC.hp && p.state !== 'ko') p.hp = Math.min(PC.hp, p.hp + PC.regenRate * dt);
    if (this.busted > 0) { if (this.inCar) this.inCar.speed *= 0.9; return; }
    if (this.inCar) {
      const car = this.inCar;
      let thr = 0, st = 0;
      if (input.analog) {
        // stick: drive toward the pushed screen direction
        const [wx, wz] = this.worldDir(input.mx, input.my);
        const mag = Math.min(1, Math.hypot(input.mx, input.my));
        const want = Math.atan2(wx, wz);
        const d = angDiff(car.a, want);
        if (Math.abs(d) < 2.3 || car.speed > 4) { thr = mag; st = clamp(d * 1.8, -1, 1) * (car.speed < -0.5 ? -1 : 1); }
        else { thr = -mag; st = clamp(-angDiff(car.a + Math.PI, want) * 1.5, -1, 1); }
      } else {
        thr = input.keyThrottle; st = -input.keySteer;
        // camera is rotated: map steering to car-relative (A/D = left/right of the car)
      }
      this.carPhysics(car, thr, st, input.handbrake, dt);
      // a wrecked car cannot drive: say so and climb out (on a phone it felt like the stick had locked)
      if (car.hp <= 0) {
        if (!car.wreckT) this.hud.banner(t('wrecked'), 'red');
        car.wreckT = (car.wreckT || 0) + dt;
        if (car.wreckT > CFG.car.wreckExit && Math.abs(car.speed) < 3) { this.exitCar(); return; }
      }
      if (input.enter) this.exitCar();
      if (input.horn) { sfx.horn(); this.bubble('honk', car, 3.2); this.ev('horn', car); }
      sfx.engineUpdate(true, Math.min(1, Math.abs(car.speed) / CFG.car.maxSpeed));
      p.x = car.x; p.z = car.z;
      return;
    }
    if (p.state === 'ko' || p.state === 'down') {
      p.timer -= dt; p.vx *= 0.9; p.vz *= 0.9; p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.timer <= 0) { p.state = 'walk'; p.hp = Math.max(p.hp, PC.hp * 0.5); p.invuln = PC.invuln; }
      return;
    }
    const [wx, wz] = this.worldDir(input.mx, input.my);
    const mag = Math.min(1, Math.hypot(input.mx, input.my));
    const sp = (input.run ? PC.run : PC.walk) * mag;
    p.x += (wx * (input.run ? PC.run : PC.walk) + p.vx) * dt;
    p.z += (wz * (input.run ? PC.run : PC.walk) + p.vz) * dt;
    p.vx *= Math.exp(-6 * dt); p.vz *= Math.exp(-6 * dt);
    p.speed = sp;
    if (mag > 0.05) p.face = p.face + angDiff(p.face, Math.atan2(wx, wz)) * Math.min(1, 14 * dt);
    p.cd -= dt; p.punchT -= dt;
    if (input.punch && p.cd <= 0) {
      p.cd = PC.punchCooldown; p.punchT = 0.22;
      // auto-aim at the closest target in front
      let best = null, bd = PC.punchRange + 0.6;
      for (const c of this.chars) {
        if (c === p || c.state === 'down' || c.state === 'fly') continue;
        const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
        if (d > bd) continue;
        const ang = Math.abs(angDiff(p.face, Math.atan2(dx, dz)));
        if (ang < PC.punchArc || d < 1.1) { best = c; bd = d; }
      }
      if (best) { p.face = Math.atan2(best.x - p.x, best.z - p.z); this.hit(best, rr(...PC.punchDmg), p); }
      else sfx.punch(0.25);
    }
    if (input.enter) {
      const car = this.nearestCar(p.x, p.z, 4.2);
      if (car) this.enterCar(car);
    }
  }
  updateChar(c, dt) {
    const P = this.playerPos(), PD = CFG.peds;
    c.bubbleT -= dt; c.cd -= dt; c.punchT -= dt; if (c.squashT > 0) c.squashT -= dt;
    // knockback velocity
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.vx *= Math.exp(-5 * dt); c.vz *= Math.exp(-5 * dt);
    if (c.state === 'fly') {
      c.y += c.vy * dt; c.vy -= 22 * dt;
      if (c.y <= 0) { c.y = 0; this.knockDown(c, c.kind === 'cop' ? 6 : rr(...PD.downTime)); }
      return;
    }
    if (c.state === 'down') {
      c.timer -= dt;
      if (c.timer <= 0) { c.hp = Math.max(c.hp, c.maxhp * 0.5); if (c.kind === 'cop') c.state = this.chase.active ? 'chase' : 'patrol'; else if (c.kind === 'fireman') c.state = 'hose'; else { c.state = 'wander'; this.flee(c, P.x, P.z, 6); } } // flee() ignores downed people
      return;
    }
    const moveTo = (tx, tz, speed) => {
      const dx = tx - c.x, dz = tz - c.z, L = Math.hypot(dx, dz) || 1;
      c.x += (dx / L) * speed * dt; c.z += (dz / L) * speed * dt;
      c.face += angDiff(c.face, Math.atan2(dx, dz)) * Math.min(1, 10 * dt);
      c.speed = speed;
      return L;
    };
    // watching a fire from a safe distance (fire.js), or waving down a taxi (missions.js)
    if (c.state === 'gawk' || c.state === 'hail') {
      c.timer -= dt;
      const f = c.gawk, tx = f ? f.x : P.x, tz = f ? f.z : P.z, d = Math.hypot(tx - c.x, tz - c.z);
      if (c.timer <= 0 || (f && f.out && f.outT > 4)) { c.gawk = null; c.mouth = false; this.rejoinPath(c); return; }
      if (f && d > 16) { this.stepToward(c, tx, tz, PD.walk * 1.2, dt); c.speed = PD.walk * 1.2; return; }
      if (f && d < 9) { const L = d || 1; c.x -= (tx - c.x) / L * PD.walk * dt; c.z -= (tz - c.z) / L * PD.walk * dt; }
      c.speed = 0; c.face += angDiff(c.face, Math.atan2(tx - c.x, tz - c.z)) * Math.min(1, 6 * dt);
      c.mouth = c.state === 'hail' ? Math.sin(this.time * 6) > 0 : Math.sin(this.time * 2 + c.id) > 0.6; // waving / pointing
      if (f && c.bubbleT <= 0 && Math.random() < dt * 0.12) { this.bubble(pick(['fire', 'wow', 'call119']), c); c.bubbleT = 5; }
      return;
    }
    if (c.state === 'cross') {
      // look both ways at the curb (give up waiting after a while), then walk over to the other sidewalk
      const sp = PD.walk * PD.crossSpeed;
      if (c.crossWait > 0) {
        c.crossWait -= dt; c.speed = 0;
        c.face += angDiff(c.face, Math.atan2(c.crossTo[0] - c.x, c.crossTo[1] - c.z)) * Math.min(1, 6 * dt);
        // never start on red at a signal (giving up waiting only skips the turning-car check)
        if (c.crossSig && this.w.signalState(c.crossSig, c.crossAxis, this.time) !== SIG_GREEN) { c.crossWait = Math.max(c.crossWait, dt); return; }
        if (c.crossWait > 0 && !this.roadClear(c.x, c.z, c.crossTo[0], c.crossTo[1], sp)) return;
        c.crossWait = 0;
      }
      const left = this.stepToward(c, c.crossTo[0], c.crossTo[1], sp, dt); c.speed = sp;
      if (left < 0.4) { c.state = c.crossBack; c.crossTo = null; return; }
      // blocked (a wall, a crowd)? after 3 s without progress give up and rejoin the sidewalk from here
      if (left < c.crossBest - 0.3) { c.crossBest = left; c.crossStall = 0; } else c.crossStall += dt;
      if (c.crossStall > 3) { c.state = 'wander'; c.timer = 1.5; c.crossTo = null; }
      return;
    }
    if (c.state === 'walk' || c.state === 'patrol') {
      if (!c.path) { c.state = 'wander'; return; }
      // now and then cross a two-way street (spec 2.2): same spot, opposite direction = other sidewalk
      if (!c.path.e.oneway && c.path.e.len > 20 && Math.random() < dt * PD.crossRate)
        c.path = { e: c.path.e, s: c.path.e.len - c.path.s, dir: -c.path.dir };
      // on one-way carriageways (divided roads) only use the outer/curb side
      const pathPoint = () => { const pe = c.path.e, off = (pe.oneway ? c.path.dir : 1) * (pe.w / 2 + 1.7); return this.w.edgePoint(pe, c.path.s, c.path.dir, off); };
      let p = pathPoint(), gap = Math.hypot(p.x - c.x, p.z - c.z);
      // the path point only runs on while we keep up (or are stuck behind something for a moment), so
      // corners and shoves are walked at walking pace instead of gliding over (the old exponential catch-up)
      c.lagT = gap > PD.keepUp ? (c.lagT || 0) + dt : 0;
      // a path point inside the player's personal space never waits there (or we'd circle the player): skip past it
      const pl = this.player, inSpace = !pl.hidden && Math.hypot(p.x - pl.x, p.z - pl.z) < c.r + pl.r + 0.6;
      if (gap <= PD.keepUp || c.lagT > 1.5 || inSpace) { this.advancePath(c.path, PD.walk * dt * (inSpace ? 3 : 1), true); p = pathPoint(); gap = Math.hypot(p.x - c.x, p.z - c.z); }
      // far from the path point (crossing, turning across a junction, dead-end turn-around): walk there, never snap
      if (gap > 6) {
        c.crossBack = c.state; c.state = 'cross'; c.crossTo = [p.x, p.z]; c.crossBest = 1e9; c.crossStall = 0; c.lagT = 0;
        // at a signalised junction: walk with the traffic going the same way (wait for its green)
        const mx = (c.x + p.x) / 2, mz = (c.z + p.z) / 2;
        c.crossSig = (this.w.signals || []).find((sg) => Math.hypot(sg.x - mx, sg.z - mz) < PD.signalReach) || null;
        c.crossAxis = Math.abs(p.x - c.x) > Math.abs(p.z - c.z) ? 0 : 1;
        c.crossWait = c.crossSig ? PD.crossSignalWait : PD.crossMaxWait;
        return;
      }
      const x0 = c.x, z0 = c.z;
      this.stepToward(c, p.x, p.z, PD.walk * PD.catchUp, dt);
      c.speed = Math.hypot(c.x - x0, c.z - z0) / dt; // legs swing with the real pace
      return;
    }
    if (c.state === 'wander' || c.state === 'leave') {
      c.timer -= dt;
      const ff = c.face;
      c.x += Math.sin(ff) * PD.walk * dt; c.z += Math.cos(ff) * PD.walk * dt; c.speed = PD.walk;
      if (Math.random() < dt * 0.3) c.face += rr(-1, 1);
      if (c.timer <= 0) this.rejoinPath(c);
      return;
    }
    if (c.state === 'flee') {
      c.timer -= dt;
      const [fx, fz] = c.fleeFrom || [P.x, P.z];
      const dx = c.x - fx, dz = c.z - fz, L = Math.hypot(dx, dz) || 1;
      const wob = Math.sin(this.time * 2 + c.id) * 0.4;
      const ax = dx / L, az = dz / L;
      const vx = ax * Math.cos(wob) - az * Math.sin(wob), vz = az * Math.cos(wob) + ax * Math.sin(wob);
      c.x += vx * PD.flee * dt; c.z += vz * PD.flee * dt;
      c.face += angDiff(c.face, Math.atan2(vx, vz)) * Math.min(1, 10 * dt);
      c.speed = PD.flee; c.mouth = true;
      if (c.timer <= 0) { c.state = 'wander'; c.timer = 30; c.mouth = false; }
      return;
    }
    if (c.state === 'fight') {
      c.timer -= dt;
      const tgt = this.player;
      const d = this.dist(c, tgt);
      if (this.inCar || c.timer <= 0 || d > 22 || tgt.state === 'ko') { this.flee(c, tgt.x, tgt.z, 4); return; }
      if (d > 1.25) moveTo(tgt.x, tgt.z, c.temper === 'master' ? 7.4 : 6.0);
      else { c.speed = 0; c.face = Math.atan2(tgt.x - c.x, tgt.z - c.z); if (c.cd <= 0) { c.cd = rr(0.8, 1.3) / (c.temper === 'master' ? 1.5 : 1); c.punchT = 0.22; this.hit(tgt, 5 * c.power, c); } }
      return;
    }
    if (c.state === 'chase') {
      // police officer on foot
      const tgt = this.inCar || this.player;
      const d = this.dist(c, tgt);
      const reach = this.inCar ? 3.2 : 1.25;
      if (d > reach) moveTo(tgt.x, tgt.z, CFG.police.runSpeed);
      else {
        c.speed = 0; c.face = Math.atan2(tgt.x - c.x, tgt.z - c.z);
        if (!this.inCar && c.cd <= 0) { c.cd = 1.1; c.punchT = 0.22; this.hit(this.player, CFG.police.punchDmg, c); }
      }
      if (c.bubbleT <= 0 && Math.random() < dt * 0.25) { this.bubble('stop', c); c.bubbleT = 4; }
      return;
    }
  }
  updateCar(car, dt) {
    car.smokeT -= dt;
    if (car.hp < 35 && car.smokeT <= 0) { car.smokeT = car.hp <= 0 ? 0.08 : 0.25; this.puffs.push({ x: car.x + Math.sin(car.a) * 1.8, y: 1.2, z: car.z + Math.cos(car.a) * 1.8, vy: 1.6, life: 1.6, s: 0.6, c: car.hp <= 0 ? [0.25, 0.25, 0.28] : [0.75, 0.75, 0.78] }); }
    if (car === this.inCar) return;
    if (car.type === 'fire' && car.task && !car.ai) return; // a fire truck on a call drives itself (fire.js)
    if (car.chasing) { this.policeDrive(car, dt); return; }
    if (car.ai) {
      const ai = car.ai, path = ai.path, e = path.e, TR = CFG.traffic, SG = CFG.signals;
      let target = TR.speed[e.cls] * (car.type === 'van' ? TR.vanSpeed : car.type === 'suv' ? TR.suvSpeed : 1);
      if (car.type === 'police') target *= 0.85;
      if (!path.next) path.next = this.pickNext(e, path.dir, false, true, ai.stay ?? -1);
      if (car.bus) target *= CFG.bus.laneSpeed;
      const calm = !(car.impatient > 0); // an impatient car (stuck too long) ignores lights, merges, crossing + parked cars
      // look ahead: the traffic car ahead on our own path (or merging into it) is followed with a
      // gap (smooth queues); other moving cars in the forward cone (crossing traffic, the player's
      // car) cap our speed the same way; people in the cone make us stop
      const fx = Math.sin(car.a), fz = Math.cos(car.a), rem = e.len - path.s;
      let block = false, blockPlayer = false, cap = Infinity, lead = Infinity, leadV = 0;
      // minor road into a bigger one: give way at the line (nose clear of the main road), never
      // creep into the junction; once past the line the car just goes
      const gw = calm ? this.giveWay(e, path.dir) : 0, toLine = rem - gw, node = path.dir > 0 ? e.b : e.a;
      const giveWay = () => { if (gw && toLine > -0.3 && toLine < 25) cap = Math.min(cap, follow(Math.max(0, toLine) + TR.gap, 0)); };
      // forward cone: returns the distance ahead along our heading, or 0
      const cone1 = (x, z, r, range) => { const dx = x - car.x, dz = z - car.z, d = Math.hypot(dx, dz), lon = dx * fx + dz * fz; return d < range && d > 0.1 && lon / d > 0.82 && Math.abs(dx * fz - dz * fx) < r ? lon : 0; };
      // a 12 m bus is checked at its nose, middle and tail (crossing in front of us it can block the
      // lane while its centre is well off to the side)
      const cone = (o, r, range) => {
        if (!o.bus) return cone1(o.x, o.z, r, range);
        let best = 0;
        for (const k of [-5, 0, 5]) { const l = cone1(o.x + Math.sin(o.a) * k, o.z + Math.cos(o.a) * k, r, range); if (l && (!best || l < best)) best = l; }
        return best;
      };
      // speed cap that keeps TR.gap (centre to centre, + headway at speed) behind something at
      // distance dist moving at v; closer than that it drops back below v
      const follow = (dist, v) => {
        v = Math.max(0, v);
        const need = TR.gap + TR.headway * v;
        return dist >= need ? v + Math.sqrt(2 * TR.followDecel * (dist - need)) : Math.max(0, v - 2 * (need - dist));
      };
      const nx = path.next;
      const parkedCar = (o) => !o.ai && o !== this.inCar && !o.chasing && Math.abs(o.speed) < 0.5;
      for (const o of this.cars) {
        if (o === car) continue;
        const op = o.ai && o.ai.path;
        // approaching a give-way line: main-road traffic about to reach the junction, or already in it
        if (gw && op && op.e !== e && toLine > -0.3 && toLine < 12) {
          const oEnd = op.dir > 0 ? op.e.b : op.e.a, oStart = op.dir > 0 ? op.e.a : op.e.b;
          if ((oEnd === node && op.e.cls < e.cls && op.e.len - op.s < 6 + o.speed * 2.5) || (oStart === node && op.s < 6)) giveWay();
        }
        // (short gaps along the path overestimate the real distance where lane offsets cut a corner)
        const ahead = (g) => { if (g < 15) g = Math.min(g, Math.hypot(o.x - car.x, o.z - car.z)); g -= o.bus ? BUS_EXTRA : 0; if (g < lead) { lead = g; leadV = o.speed; } };
        if (op && op.e === e && op.dir === path.dir) { if (op.s > path.s) ahead(op.s - path.s); continue; }
        if (op && op.e.i === nx.e && op.dir === nx.dir) { ahead(rem + op.s); continue; }
        // merging: another car heading into the same next edge from elsewhere; the one further
        // from the merge point treats the closer one as the car ahead
        if (calm && op && op.next && op.next.e === nx.e && op.next.dir === nx.dir && rem < 15) {
          const ro = op.e.len - op.s;
          if (ro < rem || (ro === rem && o.id < car.id)) { ahead(rem - ro); if (ro < 12 || o.speed > 2) giveWay(); }
          continue;
        }
        if (!calm && o !== this.inCar || parkedCar(o)) continue; // parked cars: measured along the path below
        // (a bus looks ahead from its nose, and a bit wider)
        const ext = car.bus ? BUS_EXTRA : 0;
        const lon = cone(o, (o === this.inCar ? 2.4 : 2.2) + (car.bus ? 0.5 : 0), 14 + ext);
        if (!lon) continue;
        cap = Math.min(cap, follow(lon - ext - (o.bus ? BUS_EXTRA : 0), (o.vx || 0) * fx + (o.vz || 0) * fz)); // crossing / turning traffic
        if (op) giveWay();
        if (o === this.inCar && lon < 10) blockPlayer = true;
      }
      for (const o of this.chars) if (cone(o, car.bus ? 2.2 : 1.8, car.bus ? 10 + BUS_EXTRA : 10)) { block = true; if (o === this.player) blockPlayer = true; }
      // parked / abandoned cars are measured along our path (robust on bends): stop behind one in
      // our lane, or pull out around it; on a two-way road only while nothing comes the other way
      // in the space we need (back into the lane if something does, unless already alongside it)
      const lane = laneOff(e), sw = ai.swerve || 0, near = [];
      let pass = 0, passS = 99, oncoming = false;
      for (const o of this.cars) {
        if (o === car || Math.abs(o.x - car.x) > 30 || Math.abs(o.z - car.z) > 30) continue;
        if (!parkedCar(o)) { near.push(o); continue; }
        let q = alongEdge(e, path.dir, o.x, o.z), ds = q.s - path.s;
        if (q.d > 4) { const q2 = alongEdge(this.w.edges[nx.e], nx.dir, o.x, o.z); if (q2.d < q.d) { q = q2; ds = rem + q2.s; } }
        const dl = q.lat - lane; // its offset from our lane line, + = to the right
        if (q.d > 4 || ds < -4.6 || ds > 30 || dl < -0.6 || dl > TR.passGap) continue;
        if (ds < 16) { pass = Math.max(pass, TR.passGap - dl); passS = Math.min(passS, ds); }
        if (calm && ds > 0 && Math.abs(dl + sw) < 2.2) cap = Math.min(cap, follow(ds, 0));
      }
      if (pass && !e.oneway)
        for (const o of near) {
          const dx = o.x - car.x, dz = o.z - car.z, lon = dx * fx + dz * fz, left = dx * fz - dz * fx;
          if (lon > 0 && lon < 30 && left > 0.8 && left < pass + 2.6 && Math.sin(o.a) * fx + Math.cos(o.a) * fz < -0.5) oncoming = true;
        }
      ai.swerve = lerp(sw, pass < 3 && (!oncoming || passS < 2) ? pass : 0, Math.min(1, (0.8 + 0.2 * car.speed) * dt));
      if (lead < 40) cap = Math.min(cap, follow(lead - (car.bus ? BUS_EXTRA : 0), leadV)); // queue behind the car ahead on our path (always)
      // traffic lights: stop at the line on red, and on yellow if a comfortable stop still fits
      const sg = calm ? this.signalAhead(path) : null;
      if (sg && sg.d > -0.5) {
        const st = this.w.signalState(sg.ap.sig, sg.ap.axis, this.time);
        // turning left on green: wait at the line while oncoming traffic is coming through
        const yieldLeft = st === SIG_GREEN && sg.ap.e === e.i && sg.d < 30 && this.leftTurnBlocked(car, e, path.dir, nx, sg.ap.sig);
        if (st !== SIG_GREEN || yieldLeft) {
          const v = Math.max(0, car.speed), dd = Math.max(0, sg.d - 0.05 - (car.bus ? BUS_EXTRA : 0)); // a bus's nose is further ahead
          const comf = Math.sqrt(2 * SG.comfortDecel * dd), hard = Math.sqrt(2 * SG.maxDecel * dd);
          if (v <= (st === SIG_YELLOW ? comf : hard) + 0.3) cap = Math.min(cap, v <= comf + 0.3 ? comf : hard);
        }
      }
      if (car.stopT > 0) { car.stopT -= dt; block = true; }
      car.speed = lerp(car.speed, block ? 0 : Math.min(target, cap), 1 - Math.exp(-(block ? 6 : 1.2) * dt));
      if (car.speed > cap) car.speed = cap;
      // deadlock guard: a car that has not moved for SG.maxWait s (any reason) goes for a while
      if (car.impatient > 0) car.impatient -= dt;
      if (car.speed < 0.5) { car.waitT = (car.waitT || 0) + dt; if (car.waitT > SG.maxWait) { car.waitT = 0; car.impatient = SG.impatient; } }
      else if (car.speed > 2) car.waitT = 0;
      if (blockPlayer) { car.honkT -= dt; if (car.honkT <= 0) { car.honkT = 2.5; if (Math.hypot(car.x - this.player.x, car.z - this.player.z) < 60) { sfx.horn(); this.bubble('honk', car, 3.2); } } }
      this.advancePath(path, car.speed * dt, false, true);
      const p = this.w.edgePoint(path.e, path.s, path.dir, laneOff(path.e) - (ai.swerve || 0));
      const dx = p.x - car.x, dz = p.z - car.z;
      if (Math.hypot(dx, dz) > 8) { car.x = p.x; car.z = p.z; car.a = Math.atan2(p.dx, p.dz); }
      else {
        car.x += dx * Math.min(1, 8 * dt); car.z += dz * Math.min(1, 8 * dt);
        car.a += angDiff(car.a, Math.atan2(p.dx, p.dz)) * Math.min(1, 5 * dt);
      }
      car.vx = Math.sin(car.a) * car.speed; car.vz = Math.cos(car.a) * car.speed;
      return;
    }
    // parked / abandoned: just friction + collisions
    this.carPhysics(car, 0, 0, false, dt);
  }
  policeDrive(car, dt) {
    const tgt = this.inCar || this.player;
    const d = this.dist(car, tgt);
    let aimX = tgt.x, aimZ = tgt.z;
    car.routeT -= dt;
    if (d > 40) {
      if (car.routeT <= 0 || !car.route) {
        car.routeT = 2.5;
        const a = this.w.nearestNode(car.x, car.z), b = this.w.nearestNode(tgt.x, tgt.z);
        const path = a >= 0 && b >= 0 ? this.w.path(a, b) : null;
        car.route = path ? path.map((s) => s.node) : null; car.routeI = 0;
      }
      if (car.route && car.route.length) {
        let n = this.w.nodes[car.route[car.routeI]];
        if (Math.hypot(n[0] - car.x, n[1] - car.z) < 9 && car.routeI < car.route.length - 1) { car.routeI++; n = this.w.nodes[car.route[car.routeI]]; }
        aimX = n[0]; aimZ = n[1];
      }
    }
    // cops get out when the suspect is on foot nearby and the car is slow
    if (!this.inCar && d < 16 && Math.abs(car.speed) < 3 && car.cops > 0) {
      for (let i = 0; i < car.cops; i++) {
        const s = this.carSide(car, i ? -2 : 2);
        const c = this.makeChar2('cop', s[0], s[1]); c.state = 'chase'; this.bubble('stop', c);
      }
      car.cops = 0;
    }
    if (!car.cops && !this.inCar) { this.carPhysics(car, 0, 0, false, dt); return; }
    const want = Math.atan2(aimX - car.x, aimZ - car.z);
    const da = angDiff(car.a, want);
    let thr = Math.abs(da) > 1.6 ? 0.35 : 1, st = clamp(da * 2, -1, 1);
    if (d < 10 && !this.inCar) thr = -0.6;
    if (car.revT > 0) { car.revT -= dt; thr = -1; st = -st; }
    else if (Math.abs(car.speed) < 0.8) { car.stuckT += dt; if (car.stuckT > 1.4) { car.revT = 1.0; car.stuckT = 0; } } else car.stuckT = 0;
    this.carPhysics(car, thr, st, false, dt);
  }
  updateBuses(dt) {
    for (const b of this.buses) {
      const L = b.cum[b.cum.length - 1];
      let block = false;
      const fx = Math.sin(b.a), fz = Math.cos(b.a);
      for (const o of [...this.cars, this.player]) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d < 12 && d > 0.1 && (dx * fx + dz * fz) / d > 0.85 && Math.abs(dx * fz - dz * fx) < 2.4 && !(o === this.player && this.inCar)) block = true; }
      if (!block) b.s += b.dir * CFG.bus.speed * dt;
      if (b.s > L - 2) { b.s = L - 2; b.dir = -1; } else if (b.s < 2) { b.s = 2; b.dir = 1; }
      let k = 0; while (k < b.cum.length - 2 && b.cum[k + 1] < b.s) k++;
      const seg = b.cum[k + 1] - b.cum[k] || 1, tt = (b.s - b.cum[k]) / seg;
      const [ax, az] = b.pts[k], [bx, bz] = b.pts[k + 1];
      const dx = (bx - ax) * b.dir, dz = (bz - az) * b.dir;
      const nx = -dz / seg, nz = dx / seg;
      b.x = ax + (bx - ax) * tt + nx * 1.6; b.z = az + (bz - az) * tt + nz * 1.6;
      b.a = Math.atan2(dx, dz); b.moving = !block;
    }
  }
  resolveChars(dt) {
    const list = this.chars.filter((c) => !c.hidden);
    for (const c of list) {
      if (c.state === 'fly') continue;
      const res = this.w.collide(c.x, c.z, c.r);
      c.x = res.x; c.z = res.z;
      // NPCs turn back at the water's edge (step back to where they were instead of hopping 0.6 m)
      if (c.kind !== 'player' && this.w.inWater(c.x, c.z)) { c.face += Math.PI; c.x = c.px ?? c.x; c.z = c.pz ?? c.z; }
      if (c === this.player && this.w.inWater(c.x, c.z)) { c.x = c.px ?? c.x; c.z = c.pz ?? c.z; }
      c.px = c.x; c.pz = c.z;
    }
    // simple pairwise separation (grid-free: counts are small)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.state === 'down' || b.state === 'down' || a.state === 'fly' || b.state === 'fly') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
        if (d < m && d > 1e-4) {
          // the player is solid: only the NPC gives way (pushing both made them shove back and forth)
          let k = (m - d) / d, ka = a === this.player ? 0 : b === this.player ? k : k / 2, kb = k - ka;
          // player vs NPC: a soft springy nudge (velocity) and only deep overlap is pushed out at once
          const npcB = a === this.player ? b : null, npcA = b === this.player ? a : null;
          if (npcA || npcB) {
            const n = npcA || npcB, sg = npcA ? -1 : 1, ov = m - d;
            n.vx += sg * (dx / d) * ov * 9; n.vz += sg * (dz / d) * ov * 9;
            const hard = Math.max(0, ov - 0.2) / d;
            if (npcA) { ka = hard; kb = 0; } else { ka = 0; kb = hard; }
          }
          // bumped by the player: stand still for a moment (once, then walk around) instead of shoving back
          const npc = a === this.player ? b : b === this.player ? a : null;
          if (npc && !(npc.bumpCD > this.time)) { npc.yieldT = 0.4; npc.bumpCD = this.time + 1.5; npc.avoidT = 0; } // then pick a way round afresh
          a.x -= dx * ka; a.z -= dz * ka; b.x += dx * kb; b.z += dz * kb;
        }
      }
  }
  carHits(dt) {
    const movers = this.cars.filter((c) => Math.abs(c.speed) > 3);
    for (const b of this.buses) if (b.moving) movers.push({ x: b.x, z: b.z, a: b.a, speed: CFG.bus.speed, vx: Math.sin(b.a) * CFG.bus.speed, vz: Math.cos(b.a) * CFG.bus.speed, bus: true });
    for (const car of movers) {
      const fx = Math.sin(car.a), fz = Math.cos(car.a);
      const halfL = car.bus ? 6 : car.type === 'fire' ? 3.9 : 2.2, halfW = car.bus ? 1.3 : car.type === 'fire' ? 1.25 : 1.05;
      for (const c of this.chars) {
        if (c.hidden || c.state === 'fly' || c.state === 'down') continue;
        const dx = c.x - car.x, dz = c.z - car.z;
        const lon = dx * fx + dz * fz, lat = dx * fz - dz * fx;
        if (Math.abs(lon) < halfL + c.r && Math.abs(lat) < halfW + c.r) {
          const sp = Math.abs(car.speed);
          if (c === this.player) {
            if (this.player.invuln > 0 || this.player.state === 'ko') continue;
            this.player.vx += car.vx * 0.8; this.player.vz += car.vz * 0.8;
            this.player.hp -= sp * 1.5; this.player.hurtT = 3; this.player.regenT = CFG.player.regenDelay;
            this.player.state = 'down'; this.player.timer = 1.6; sfx.crash(0.5); this.feedback('medium', this.player);
            if (this.player.hp <= 0) this.playerKO(car.type === 'police');
            continue;
          }
          c.state = 'fly'; c.vy = 4 + sp * 0.35; c.vx = car.vx * 0.7 + (lat > 0 ? fz : -fz) * 3; c.vz = car.vz * 0.7 + (lat > 0 ? -fx : fx) * 3; c.y = 0.1; c.path = null;
          c.hp -= sp * 3; sfx.crash(0.4); if (Math.random() < 0.5) sfx.scream(0.5);
          if (car === this.inCar) { car.hp -= 2; this.ev('runover', c); this.crime(c.x, c.z, c.kind === 'cop' ? c : null); if (Math.random() < 0.5) this.hud.bubble(t('pow'), [c.x, 2.5, c.z], 'pow'); }
        }
      }
    }
    // player car vs other cars / buses
    const pc = this.inCar;
    if (pc) {
      const others = [...this.cars.filter((c) => c !== pc), ...this.buses.map((b) => ({ x: b.x, z: b.z, a: b.a, bus: true, speed: 0 }))];
      for (const o of others) {
        const rad = o.bus ? 5.5 : o.type === 'fire' ? 5 : 3.6;
        const dx = pc.x - o.x, dz = pc.z - o.z, d = Math.hypot(dx, dz);
        if (d < rad && d > 0.01) {
          // approximate OBB with distance along each car's axis
          const ofx = Math.sin(o.a), ofz = Math.cos(o.a);
          const lon = dx * ofx + dz * ofz, lat = dx * ofz - dz * ofx;
          const hl = (o.bus ? 6 : o.type === 'fire' ? 3.9 : 2.2) + 1.6, hw = (o.bus ? 1.3 : o.type === 'fire' ? 1.25 : 1.05) + 1.05;
          if (Math.abs(lon) > hl || Math.abs(lat) > hw) continue;
          const nx = dx / d, nz = dz / d;
          const rel = (pc.vx - (o.vx || 0)) * nx + (pc.vz - (o.vz || 0)) * nz;
          pc.x += nx * 0.35; pc.z += nz * 0.35;
          if (rel < 0) {
            const imp = -rel;
            pc.vx -= rel * nx * 1.2; pc.vz -= rel * nz * 1.2; pc.speed *= 0.55;
            if (imp > 3) {
              pc.hp -= imp * 1.2; sfx.crash(imp / 14); this.feedback(imp > 12 ? 'large' : 'medium');
              if (!o.bus) {
                o.hp -= imp * 1.5; o.stopT = 2.5;
                if (o.ai) { o.speed = 0; } else { o.vx += -rel * nx * -0.6; o.vz += -rel * nz * -0.6; }
                if (o.type === 'police') this.crime(o.x, o.z, o);
              }
            }
          }
        }
      }
    }
  }
  updateChase(dt) {
    const P = this.playerPos();
    let siren = 0;
    for (const car of this.cars) if (car.type === 'police' && car.chasing && car !== this.inCar) siren = Math.max(siren, 1 - this.dist(car, P) / 160);
    sfx.sirenUpdate(this.chase.active ? Math.max(0, siren) : 0);
    if (!this.chase.active) return;
    const PO = CFG.police;
    let seen = false;
    for (const c of this.chars) if (c.kind === 'cop' && c.state === 'chase' && this.dist(c, P) < PO.sight * 1.6 && this.w.los(c.x, c.z, P.x, P.z)) { seen = true; break; }
    if (!seen) for (const car of this.cars) if (car.type === 'police' && car.chasing && car !== this.inCar && this.dist(car, P) < PO.sight * 1.8 && this.w.los(car.x, car.z, P.x, P.z)) { seen = true; break; }
    this.chase.unseen = seen ? 0 : this.chase.unseen + dt;
    this.hud.chaseMeter(this.chase.unseen / PO.giveUp);
    if (this.chase.unseen > PO.giveUp) { this.endChase(); return; }
    // reinforcements
    this.chase.reinforce -= dt;
    if (this.chase.reinforce <= 0) {
      this.chase.reinforce = PO.reinforce;
      const cops = this.chars.filter((c) => c.kind === 'cop' && c.state === 'chase').length;
      if (cops < PO.footChase && !this.inCar && this.policeCount() < PO.max) {
        // backup arrives on foot from just outside the view
        for (let i = 0; i < 10; i++) {
          const a = rr(0, 6.28), d = rr(45, 75);
          const ne = this.w.nearestEdge(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 25);
          if (!ne) continue;
          const p = this.w.edgePoint(ne.e, ne.e.cum[ne.k], 1, ne.e.w / 2 + 1.6);
          if (this.onScreen(p.x, p.z, CFG.peds.spawnMargin) || this.w.inWater(p.x, p.z)) continue;
          const c = this.makeChar2('cop', p.x, p.z); c.state = 'chase';
          break;
        }
      }
    }
    // bust checks
    if (this.busted > 0) return;
    const p = this.player;
    if (!this.inCar) {
      let near = false;
      for (const c of this.chars) if (c.kind === 'cop' && c.state === 'chase' && this.dist(c, p) < 1.5) near = true;
      p.bustT = near && p.state !== 'ko' ? (p.bustT || 0) + dt : Math.max(0, (p.bustT || 0) - dt * 2);
      if (p.bustT > PO.bustFoot) { p.bustT = 0; this.bust(); }
    } else {
      const car = this.inCar;
      let near = false;
      for (const c of this.chars) if (c.kind === 'cop' && c.state === 'chase' && this.dist(c, car) < 3.6) near = true;
      for (const o of this.cars) if (o.type === 'police' && o !== car && this.dist(o, car) < 5.2) near = true;
      const slow = Math.abs(car.speed) < 1.5 || car.hp <= 0;
      car.bustT = near && slow ? (car.bustT || 0) + dt : Math.max(0, (car.bustT || 0) - dt * 2);
      if (car.bustT > PO.bustCar) { car.bustT = 0; this.bust(); }
    }
  }
  updatePuffs(dt) {
    for (const f of this.puffs) { f.y += f.vy * dt; f.life -= dt; f.s += dt * 0.6; if (f.vx) { f.x += f.vx * dt; f.z += f.vz * dt; } }
    this.puffs = this.puffs.filter((f) => f.life > 0);
  }

  // ------------------------------------------------------------------ render
  fillBatches() {
    for (const b of Object.values(this.B)) b.n = 0;
    // the player (or the car they drive) goes first in every batch: instances [0, pk) are "the player",
    // which lets the renderer draw an x-ray silhouette of just them (spec 4)
    if (this.inCar) this.drawCar(this.inCar); else if (!this.player.hidden) this.drawChar(this.player);
    for (const b of Object.values(this.B)) b.pk = b.n;
    const P = this.playerPos();
    const R = 120;
    for (const c of this.chars) if (c !== this.player && !c.hidden && Math.abs(c.x - P.x) < R && Math.abs(c.z - P.z) < R) this.drawChar(c);
    for (const car of this.cars) if (car !== this.inCar && Math.abs(car.x - P.x) < R + 30 && Math.abs(car.z - P.z) < R + 30) this.drawCar(car);
    for (const b of this.buses) if (Math.abs(b.x - P.x) < R + 40 && Math.abs(b.z - P.z) < R + 40) {
      this.drawBus(M.chain(M.T(b.x, 0, b.z), M.RY(b.a)));
    }
    for (const f of this.puffs) this.put(this.B.puff, M.chain(M.T(f.x, f.y, f.z), M.S(f.s)), f.c);
    this.fires.draw();
    this.missions.draw();
    this.pranks.draw();
    this.nav.draw();
    this.drawSignals(P);
    for (const b of Object.values(this.B)) if (b.n) this.r.upload(b);
  }
  // traffic-light lamps near the player (poles and heads are static chunk geometry)
  drawSignals(P) {
    const SR = CFG.signals.drawRadius;
    for (const sg of this.w.signals) {
      if (Math.abs(sg.x - P.x) > SR || Math.abs(sg.z - P.z) > SR) continue;
      const lit = [2 - this.w.signalState(sg, 0, this.time), 2 - this.w.signalState(sg, 1, this.time)]; // lamp 0 red, 1 yellow, 2 green
      for (const ap of sg.approaches) if (ap.lamps) for (let k = 0; k < 3; k++) this.put(this.B.sigLamp, ap.lamps[k], k === lit[ap.axis] ? LAMP_ON[k] : LAMP_OFF[k]);
    }
  }
  drawChar(c) {
    const B = this.B;
    // squash & stretch pop after a hit: squash at once, spring back with a little overshoot
    let sq = 1, st = 1;
    if (c.squashT > 0) {
      const u = 1 - c.squashT / CFG.feel.squashTime, k = Math.sin(u * Math.PI * 1.5) * (1 - u); // 1 -> -0.3 -> 0
      st = 1 - 0.25 * k; sq = 1 + 0.18 * k;
    }
    let base = M.chain(M.T(c.x, c.y + (c.state === 'down' || c.state === 'ko' ? 0.05 : 0.15), c.z), M.RY(c.face), M.S(CS * sq, CS * st, CS * sq));
    const lying = c.state === 'down' || c.state === 'ko' || (c.state === 'fly');
    if (lying) base = M.chain(base, M.T(0, 0.3, 0), M.RX(c.state === 'fly' ? -Math.PI / 2 + Math.sin(this.time * 12) * 0.8 : -Math.PI / 2 + 0.1));
    const A = (m, batch, col) => this.put(batch, M.mul(base, m), col);
    c.phase += (c.speed || 0) * 0.016 * 3.2;
    const sw = lying ? 0 : Math.sin(c.phase) * Math.min(1, (c.speed || 0) / 4) * 0.7;
    for (const [sx, s] of [[1, sw], [-1, -sw]]) {
      A(M.chain(M.T(sx * 0.18, 0.55, 0), M.RX(s), M.T(0, -0.27, 0)), B.limb, c.pants);
      A(M.chain(M.T(sx * 0.18, 0.55, 0), M.RX(s), M.T(0, -0.5, 0.06), M.S(1.16, 0.22, 1.35)), B.limb, c.shoes); // shoe
    }
    A(M.T(0, 0.95, 0), B.body, c.shirt);
    if (c.kurta) A(M.chain(M.T(0, 0.6, 0), M.S(1.04, 0.62, 1.02)), B.body, c.shirt); // long tunic over the thighs
    if (c.dupatta) A(M.chain(M.T(0, 1.0, 0.02), M.RZ(0.75), M.S(0.9, 1.75, 2.15)), B.limb, c.dupatta); // scarf across the chest
    let la = -sw, ra = sw, lz = 0, rz = 0;
    if (c.punchT > 0) { ra = -Math.PI / 2; la = 0.5; }
    else if (c.state === 'flee' || c.mouth) { la = ra = Math.PI * 0.95; lz = -0.3; rz = 0.3; }
    else if (c.state === 'fight' || (c.kind === 'cop' && c.state === 'chase' && (c.speed || 0) < 1)) { la = ra = -1.1; }
    for (const [sx, rx, rzz] of [[-1, la, lz], [1, ra, rz]]) {
      A(M.chain(M.T(sx * 0.5, 1.2, 0), M.RZ(rzz), M.RX(rx), M.T(0, -0.26, 0)), B.limb, c.shirt);
      A(M.chain(M.T(sx * 0.5, 1.2, 0), M.RZ(rzz), M.RX(rx), M.T(0, -0.6, 0)), B.hand, c.skin);
    }
    A(M.T(0, 1.85, 0), B.head, c.skin);
    this.drawHair(c, A);
    if (c.braid) A(M.chain(M.T(0, 1.42, -0.5), M.RX(0.15), M.S(0.55, 1.05, 0.55)), B.limb, c.hair);
    const blink = (this.time + c.id * 0.37) % 4 < 0.12; // a quick blink every few seconds
    for (const sx of [-1, 1]) A(blink ? M.chain(M.T(sx * 0.21, 1.86, 0.5), M.S(1.2, 0.2, 1)) : M.T(sx * 0.21, 1.88, 0.5), B.eye);
    const shout = c.mouth || c.state === 'fight' || c.state === 'flee';
    A(shout ? M.chain(M.T(0, 1.62, 0.51), M.S(0.9, 3.2, 1)) : M.T(0, 1.64, 0.51), B.mouth);
    if (c.cap) { A(M.T(0, 2.44, -0.01), B.cap, c.cap); A(M.T(0, 2.3, 0.6), B.brim, c.cap); A(M.T(0, 2.46, 0.57), B.badge); }
    if (c.state === 'down' || c.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 3 + (i / 3) * Math.PI * 2;
        this.put(B.star, M.chain(M.T(c.x + Math.cos(a) * 0.9 + Math.sin(c.face) * -2.1, 1.4 + Math.sin(a * 2) * 0.15, c.z + Math.sin(a) * 0.9 + Math.cos(c.face) * -2.1), M.RY(CFG.camera.azimuth)));
      }
    }
  }
  // hair / dastar / beard as rounded blocks around the head (head: 1.08 x 1.0 x 0.98 at y 1.85)
  drawHair(c, A) {
    const H = this.B.hair, col = c.hair, P = (x, y, z, sx, sy, sz, cc = col) => A(M.chain(M.T(x, y, z), M.S(sx, sy, sz)), H, cc);
    if (c.turban) {
      P(0, 2.33, -0.02, 1.18, 0.52, 1.1, c.turban); P(0, 2.5, 0.12, 0.5, 0.36, 0.86, c.turban); // wrap + the peak in front
    } else if (c.hs === 'bald') {
      for (const s of [-1, 1]) P(s * 0.55, 1.86, -0.12, 0.1, 0.3, 0.55);
    } else {
      const curls = c.hs === 'curls', big = curls ? 1.12 : 1, longBack = c.hs === 'bob' || c.hs === 'long' || curls;
      if (!c.cap) P(0, curls ? 2.38 : 2.32, -0.02, 1.16 * big, curls ? 0.38 : 0.24, 1.08 * big); // top
      P(0, longBack ? 1.78 : 1.98, -0.46, 1.16 * big, longBack ? 1.0 : 0.62, 0.2); // back
      if (longBack) for (const s of [-1, 1]) P(s * 0.56 * big, c.hs === 'long' ? 1.66 : 1.82, -0.06, 0.12, c.hs === 'long' ? 1.0 : 0.72, 0.88); // sides
      if (c.hs === 'long') P(0, 1.36, -0.5, 1.0, 0.6, 0.16); // down the back
      if (!c.cap && !curls) P(0.08, 2.2, 0.47, c.hs === 'spiky' ? 0.9 : 1.1, 0.16, 0.1); // fringe
      if (c.hs === 'spiky' && !c.cap) for (const x of [-0.3, 0, 0.3]) A(M.chain(M.T(x, 2.48, 0.05), M.RZ(x * 0.8), M.RX(-0.25), M.S(0.24, 0.3, 0.5)), H, col);
    }
    if (c.beard) { P(0, 1.52, 0.1, 1.1, 0.42, 0.84); for (const s of [-1, 1]) P(s * 0.5, 1.75, 0.05, 0.12, 0.5, 0.6); }
  }
  // Viva bus (rapidway buses and the ones running in Hwy 7 traffic)
  drawBus(m) {
    if (this.pf.bus) { this.put(this.pf.bus, m, [0.15, 0.39, 0.92]); return; }
    this.put(this.B.busBody, M.mul(m, M.T(0, 1.8, 0)), [0.15, 0.39, 0.92]);
    this.put(this.B.busGlass, M.mul(m, M.T(0, 2.4, 0.2)));
    this.put(this.B.busRoof, M.mul(m, M.T(0, 3.35, 0)));
    for (const s of [-1, 1]) for (const zz of [-3.6, 3.6]) this.put(this.B.wheel, M.chain(m, M.T(s * 1.15, 0.5, zz), M.RZ(Math.PI / 2), M.S(1.2)));
  }
  drawCar(car) {
    const B = this.B;
    const m = M.chain(M.T(car.x, 0, car.z), M.RY(car.a));
    if (car.bus) { this.drawBus(m); return; }
    const P = (batch, mm, col) => this.put(batch, M.mul(m, mm), col);
    const dark = car.burnt ? [0.13, 0.13, 0.14] : car.hp <= 0 ? [0.3, 0.3, 0.32] : car.col;
    const pf = this.pf[car.type];
    if (pf) {
      this.put(pf, m, dark); // taxi / police models have no paint part: they keep their own livery
      if (car.type === 'police' && car.chasing) { // flashing bar over the model's own (static) light bar
        const blink = Math.floor(this.time * 6) % 2;
        P(blink ? B.barR : B.barB, M.T(blink ? -0.35 : 0.35, 1.78, -0.35));
      }
      return;
    }
    const V = SHAPES[car.type] || SHAPES.sedan;
    P(B.carBody, V.body, dark);
    P(B.carCabin, V.cabin);
    P(B.carRoof, V.roof, car.type === 'van' && car.hp > 0 ? VAN_ROOF : dark);
    for (const w of V.wheels) P(B.wheel, w);
    for (const h of V.head) P(B.headl, h);
    for (const h of V.tail) P(B.taill, h);
    if (V.rails) for (const r of V.rails) P(B.carRoof, r, RAIL);
    if (V.spare) P(B.wheel, V.spare);
    if (car.type === 'police') {
      P(B.stripe, M.T(0, 0.85, 0));
      const blink = car.chasing ? (Math.floor(this.time * 6) % 2) : 0;
      P(B.barR, M.T(-0.4, 2.35, -0.25), blink ? [0.4, 0.1, 0.1] : null);
      P(B.barB, M.T(0.4, 2.35, -0.25), !blink && car.chasing ? [0.1, 0.1, 0.4] : null);
    }
    if (car.type === 'taxi') P(B.taxi, M.T(0, 2.42, -0.25));
    if (car.type === 'fire') {
      if (!car.burnt) { P(B.stripe, V.band, [1, 0.85, 0.2]); for (const r of V.rungs) P(B.carRoof, r, [0.85, 0.87, 0.9]); }
      const blink = Math.floor(this.time * 5) % 2, on = !!car.task;
      P(B.barR, M.T(-0.45, 2.75, 2.45), on && blink ? null : [0.4, 0.1, 0.1]);
      P(B.barR, M.T(0.45, 2.75, 2.45), on && !blink ? null : [0.4, 0.1, 0.1]);
    }
  }
}

// point (x, z) relative to edge e travelled in direction dir: distance along it, lateral offset
// (+ = right of travel) and distance from the centreline
function alongEdge(e, dir, x, z) {
  let d = 1e9, s = 0, lat = 0;
  for (let k = 0; k < e.pts.length - 1; k++) {
    const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1], r = segDist(x, z, ax, az, bx, bz);
    if (r.d >= d) continue;
    const L = e.cum[k + 1] - e.cum[k] || 1;
    d = r.d; s = e.cum[k] + r.t * L;
    lat = ((z - r.cz) * (bx - ax) - (x - r.cx) * (bz - az)) / L; // right of a->b: (-dz, dx)
  }
  return dir > 0 ? { s, lat, d } : { s: e.len - s, lat: -lat, d };
}
function hexc(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
