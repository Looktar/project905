// Gameplay: player, pedestrians, police, traffic, buses, combat and the chase.
import { M, clamp, lerp, angDiff, rr, pick, segDist } from './math.js';
import { MeshBuilder, MAT_A, MAT_V, rbox, box, sphere, ico, cyl, star } from './geo.js';
import { INST_FLOATS } from './renderer.js';
import { CFG } from './config.js';
import { input } from './input.js';
import * as sfx from './audio.js';
import { t } from './i18n.js';

const CS = 1.3; // character scale (chibi proportions)
const SKIN = ['#f3c9a2', '#e2ad84', '#c68b62', '#f6d5b8', '#a8714d'];
const SHIRT = ['#ef4444', '#f59e0b', '#22c3a6', '#a78bfa', '#60a5fa', '#f472b6', '#fde047', '#fb923c', '#34d399', '#e5e7eb', '#38bdf8', '#c084fc'];
const PANTS = ['#2f3b59', '#5b4a8a', '#3b4a6b', '#334155', '#475569', '#1e3a8a', '#374151', '#6b4f3a'];
const HAIR = ['#2b2320', '#6b4429', '#d9a441', '#1f1f1f', '#5b3a29', '#111111', '#9ca3af'];
const CARCOL = ['#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#f97316', '#e5e7eb', '#94a3b8', '#fde68a', '#ef4444', '#2563eb', '#10b981', '#f8fafc'];

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
    this.player = this.makeChar('player', sx, sz, { shirt: '#ef4444', pants: '#2f3b59', skin: SKIN[0], hair: '#2b2320' });
    this.player.hp = CFG.player.hp; this.player.face = -Math.PI / 2;
    this.inCar = null;
    this.camPos = [sx, 0, sz]; this.camDist = CFG.camera.distWalk;
    this.spawnAround(true);
    // a parked car right next to the spawn point so cars are discoverable immediately
    const near = world.nearestEdge(sx, sz, 40);
    if (near) {
      const s = near.e.cum[near.k] + 4;
      const p = world.edgePoint(near.e, s, 1, near.e.w / 2 - 1.3);
      this.makeCar('sedan', p.x, p.z, Math.atan2(p.dx, p.dz), { parked: true });
    }
  }

  // ------------------------------------------------------------------ batches
  buildBatches() {
    const mk = (g, mat = MAT_A, col = '#ffffff', em = 0, cap = 700) => { const mb = new MeshBuilder(); mb.add(g, M.I(), col, mat, em); return this.r.instanced(mb, cap); };
    this.B = {
      head: mk(sphere(0.56, 6)), hair: mk(sphere(0.56, 5)), body: mk(rbox(0.82, 0.72, 0.56, 0.22, 1)),
      limb: mk(rbox(0.27, 0.57, 0.28, 0.11, 1), MAT_A, '#ffffff', 0, 1400), hand: mk(sphere(0.15, 3), MAT_A, '#ffffff', 0, 1400),
      eye: mk(sphere(0.07, 3), MAT_V, '#1d2233', 0, 1400), mouth: mk(sphere(0.1, 3), MAT_V, '#7a2b2b'),
      cap: mk(cyl(0.5, 0.54, 0.28, 10)), brim: mk(box(0.7, 0.08, 0.4)), badge: mk(box(0.16, 0.14, 0.05), MAT_V, '#ffd23f', 0.3),
      star: mk(star(0.38), MAT_V, '#ffd23f', 0.6, 300),
      carBody: mk(rbox(2.1, 0.85, 4.4, 0.32), MAT_A, '#ffffff', 0, 120), carCabin: mk(rbox(1.8, 0.78, 2.3, 0.3), MAT_V, '#9fd3f2', 0, 120),
      carRoof: mk(rbox(1.86, 0.14, 2.0, 0.06), MAT_A, '#ffffff', 0, 120), wheel: mk(cyl(0.42, 0.42, 0.34, 8), MAT_V, '#262a35', 0, 480),
      headl: mk(box(0.42, 0.22, 0.1), MAT_V, '#fff6c9', 0.7, 240), taill: mk(box(0.42, 0.2, 0.1), MAT_V, '#ff4d4d', 0.6, 240),
      stripe: mk(box(2.14, 0.3, 3.0), MAT_V, '#1e3a8a', 0, 40), barR: mk(box(0.7, 0.2, 0.4), MAT_V, '#ff2d2d', 0.9, 40), barB: mk(box(0.7, 0.2, 0.4), MAT_V, '#2d6bff', 0.9, 40),
      taxi: mk(rbox(0.8, 0.3, 0.4, 0.08), MAT_V, '#fff7d6', 0.3, 40),
      busBody: mk(rbox(2.5, 2.9, 12, 0.4), MAT_A, '#ffffff', 0, 8), busGlass: mk(rbox(2.56, 1.0, 10.6, 0.2), MAT_V, '#bfe6ff', 0, 8), busRoof: mk(rbox(2.2, 0.25, 10, 0.1), MAT_V, '#e8eef8', 0, 8),
      puff: mk(ico(0.55), MAT_A, '#ffffff', 0, 200),
    };
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
      cap: cols.cap ? hexc(cols.cap) : null,
      hp: 60, maxhp: 60, power: 1, temper: 'normal', state: 'walk', timer: 0, phase: rr(0, 6), punchT: 0, cd: 0,
      path: null, bubbleT: 0, mouth: false, ...extra,
    };
    if (kind === 'player') c.r = CFG.player.radius;
    this.chars.push(c);
    return c;
  }
  makeChar2(kind, x, z) {
    const P = CFG.peds;
    if (kind === 'cop') {
      const c = this.makeChar('cop', x, z, { shirt: '#1e3a8a', pants: '#172554', cap: '#172554', hair: '#222222' });
      c.hp = c.maxhp = CFG.police.hp; c.power = 1.4; c.state = 'patrol';
      return c;
    }
    const roll = Math.random();
    const T = P.temper;
    const temper = roll < T.timid ? 'timid' : roll < T.timid + T.normal ? 'normal' : roll < T.timid + T.normal + T.angry ? 'angry' : 'master';
    const c = this.makeChar('ped', x, z, temper === 'master' ? { shirt: '#111111', pants: '#b91c1c' } : {});
    c.temper = temper;
    c.hp = c.maxhp = temper === 'master' ? 220 : rr(P.hp[0], P.hp[1]);
    c.power = temper === 'master' ? 3.2 : rr(P.power[0], P.power[1]);
    return c;
  }
  makeCar(type, x, z, a, opts = {}) {
    const car = {
      id: uid++, type, x, z, a, speed: 0, vx: 0, vz: 0, hp: CFG.car.hp, col: hexc(opts.col || (type === 'police' ? '#f8fafc' : type === 'taxi' ? '#fbbf24' : pick(CARCOL))),
      driver: opts.driver || null, ai: opts.ai || null, parked: !!opts.parked, stopT: 0, honkT: 0, smokeT: 0, dead: false, cops: opts.cops || 0, route: null, routeT: 0, stuckT: 0, revT: 0,
    };
    this.cars.push(car);
    return car;
  }

  // ------------------------------------------------------------------ helpers
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
    if (!silent) this.hud.banner(t('escaped'), 'green');
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
  hit(target, dmg, attacker) {
    if (target.state === 'down' || target.state === 'fly') return;
    const ax = target.x - attacker.x, az = target.z - attacker.z, L = Math.hypot(ax, az) || 1;
    target.vx += (ax / L) * 4.5; target.vz += (az / L) * 4.5;
    sfx.punch(attacker === this.player ? 1 : 0.6);
    if (target === this.player) {
      if (this.player.invuln > 0 || this.player.state === 'ko') return;
      this.player.hp -= dmg; this.player.hurtT = 3; this.player.regenT = CFG.player.regenDelay;
      if (Math.random() < 0.4) this.bubble('ouch', target);
      if (this.player.hp <= 0) this.playerKO(attacker.kind === 'cop');
      return;
    }
    target.hp -= dmg;
    if (attacker === this.player) {
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
  }
  finishBust() {
    this.hud.busted(false);
    // respawn 150-300 m away from the cops
    const P = this.playerPos();
    let best = null, bestScore = -1;
    for (let i = 0; i < 40; i++) {
      const a = rr(0, 6.28), d = rr(150, 300);
      const ne = this.w.nearestEdge(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 30);
      if (!ne) continue;
      const p = this.w.edgePoint(ne.e, ne.e.cum[ne.k] + 1, 1, ne.e.w / 2 + 1.6);
      if (this.w.inWater(p.x, p.z)) continue;
      let minCop = 1e9;
      for (const c of this.chars) if (c.kind === 'cop') minCop = Math.min(minCop, Math.hypot(c.x - p.x, c.z - p.z));
      if (minCop > bestScore) { bestScore = minCop; best = p; }
    }
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
    for (const c of this.cars) { if (c.dead && c.hp <= 0 && false) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
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
    } else if (car.type === 'police' && car.cops) { car.cops = 0; this.crime(car.x, car.z, car); }
    car.driver = 'player'; car.ai = null; car.parked = false; car.stopT = 0;
    this.inCar = car;
    p.hidden = true;
    this.hud.setMode(true);
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
    const max = car.type === 'police' ? C.maxSpeed * 1.05 : C.maxSpeed;
    if (throttle > 0) { car.speed += (car.speed < 0 ? C.brake : C.accel) * throttle * dt; }
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
      if (impact > 4) { car.hp -= impact * 1.6; if (car === this.inCar) { sfx.crash(impact / 15); this.shake = Math.min(1, impact / 12); } }
    }
  }

  // ------------------------------------------------------------------ path following (peds & traffic)
  startPath(e, s, dir) { return { e, s, dir }; }
  advancePath(path, ds, allowOneway, preferArterial = false) {
    path.s += ds;
    let guard = 0;
    while (path.s >= path.e.len && guard++ < 4) {
      path.s -= path.e.len;
      const node = path.dir > 0 ? path.e.b : path.e.a;
      let opts = this.w.adj[node].filter((a) => a.e !== path.e.i);
      if (!allowOneway) opts = opts.filter((a) => !this.w.edges[a.e].oneway || a.dir > 0);
      if (!opts.length) { opts = [{ e: path.e.i, dir: -path.dir }]; }
      let ch = pick(opts);
      if (preferArterial && Math.random() < 0.6) { const art = opts.filter((a) => this.w.edges[a.e].cls <= 2); if (art.length) ch = pick(art); }
      path.e = this.w.edges[ch.e]; path.dir = ch.dir;
    }
  }

  // ------------------------------------------------------------------ spawning
  spawnAround(initial = false) {
    const P = this.playerPos();
    const PD = CFG.peds, TR = CFG.traffic, PO = CFG.police;
    const target = this.isMobile ? PD.countMobile : PD.countDesktop;
    // despawn far ones
    this.chars = this.chars.filter((c) => c === this.player || this.dist(c, P) < (c.kind === 'cop' && c.state === 'chase' ? 260 : PD.despawn));
    this.cars = this.cars.filter((c) => c === this.inCar || this.dist(c, P) < (c.chasing ? 320 : TR.despawn));
    const peds = this.chars.filter((c) => c.kind === 'ped').length;
    const cops = this.chars.filter((c) => c.kind === 'cop').length;
    const ringPoint = (a, b, cls = 9) => {
      for (let i = 0; i < 6; i++) {
        const ang = rr(0, 6.28), d = rr(a, b);
        const ne = this.w.nearestEdge(P.x + Math.cos(ang) * d, P.z + Math.sin(ang) * d, 25);
        if (ne && ne.e.cls <= cls && ne.e.len > 8) return ne;
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
      const c = this.makeChar2(kind, p.x, p.z);
      c.path = this.startPath(ne.e, s, dir); c.off = off;
    };
    if (peds < target) for (let i = 0; i < Math.min(initial ? target : 3, target - peds); i++) addWalker('ped');
    const copTarget = this.chase.active ? PO.footChase : PO.footPatrol;
    if (cops < copTarget && !this.chase.active) addWalker('cop');
    // traffic
    const moving = this.cars.filter((c) => c.ai && c.type !== 'police').length;
    const trTarget = this.isMobile ? TR.countMobile : TR.countDesktop;
    if (moving < trTarget) {
      const ne = ringPoint(TR.spawnMin, TR.spawnMax, 3);
      if (ne) this.addTraffic(ne, Math.random() < 0.15 ? 'taxi' : 'sedan');
    }
    const parked = this.cars.filter((c) => c.parked && !c.driver).length;
    if (parked < TR.parked) {
      const ne = ringPoint(45, 120, 3);
      if (ne && ne.e.cls === 3) {
        const s = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
        const p = this.w.edgePoint(ne.e, s, 1, ne.e.w / 2 - 1.2);
        if (!this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 6)) this.makeCar(Math.random() < 0.2 ? 'taxi' : 'sedan', p.x, p.z, Math.atan2(p.dx, p.dz), { parked: true });
      }
    }
    const pcars = this.cars.filter((c) => c.type === 'police' && c !== this.inCar).length;
    const pcTarget = this.chase.active ? PO.carChase : PO.carPatrol;
    if (pcars < pcTarget) {
      const ne = ringPoint(this.chase.active ? 70 : TR.spawnMin, this.chase.active ? 110 : TR.spawnMax, 2);
      if (ne) { const car = this.addTraffic(ne, 'police'); if (car && this.chase.active) { car.chasing = true; car.ai = null; } }
    }
    // buses on the rapidway
    this.buses = this.buses.filter((b) => Math.hypot(b.x - P.x, b.z - P.z) < 400);
    if (this.buses.length < CFG.bus.count) {
      let best = null, bd = 1e9;
      for (const pts of this.w.map.busways) for (let k = 0; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - P.x, pts[k][1] - P.z); if (d < bd && d > 60) { bd = d; best = { pts, k }; } }
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
    const off = e.oneway ? 0 : e.w / 4;
    const p = this.w.edgePoint(e, s, dir, off);
    if (this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 10)) return null;
    const car = this.makeCar(type, p.x, p.z, Math.atan2(p.dx, p.dz), { ai: { path: this.startPath(e, s, dir), off }, driver: 'npc', cops: type === 'police' ? 2 : 0 });
    car.speed = CFG.traffic.speed[e.cls] * 0.8;
    return car;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    if (this.busted > 0) { this.busted -= dt; if (this.busted <= 0) this.finishBust(); }
    this.spawnTimer = (this.spawnTimer || 0) - dt;
    if (this.spawnTimer <= 0) { this.spawnAround(); this.spawnTimer = 0.4; }
    this.updatePlayer(dt);
    for (const c of this.chars) if (c !== this.player) this.updateChar(c, dt);
    for (const car of this.cars) this.updateCar(car, dt);
    this.updateBuses(dt);
    this.resolveChars(dt);
    this.carHits(dt);
    this.updateChase(dt);
    this.updatePuffs(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
  updatePlayer(dt) {
    const p = this.player, PC = CFG.player;
    p.invuln = Math.max(0, (p.invuln || 0) - dt);
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
      if (input.enter) this.exitCar();
      if (input.horn) { sfx.horn(); this.bubble('honk', car, 3.2); }
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
    c.bubbleT -= dt; c.cd -= dt; c.punchT -= dt;
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
      if (c.timer <= 0) { c.hp = Math.max(c.hp, c.maxhp * 0.5); if (c.kind === 'cop') c.state = this.chase.active ? 'chase' : 'patrol'; else this.flee(c, P.x, P.z, 6); }
      return;
    }
    const moveTo = (tx, tz, speed) => {
      const dx = tx - c.x, dz = tz - c.z, L = Math.hypot(dx, dz) || 1;
      c.x += (dx / L) * speed * dt; c.z += (dz / L) * speed * dt;
      c.face += angDiff(c.face, Math.atan2(dx, dz)) * Math.min(1, 10 * dt);
      c.speed = speed;
      return L;
    };
    if (c.state === 'walk' || c.state === 'patrol') {
      if (!c.path) { c.state = 'wander'; return; }
      this.advancePath(c.path, PD.walk * dt, true);
      // on one-way carriageways (divided roads) only use the outer/curb side
      const pe = c.path.e, off = (pe.oneway ? c.path.dir : 1) * (pe.w / 2 + 1.7);
      const p = this.w.edgePoint(pe, c.path.s, c.path.dir, off);
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.hypot(dx, dz) > 6) { c.x = p.x; c.z = p.z; } else { c.x += dx * Math.min(1, 6 * dt); c.z += dz * Math.min(1, 6 * dt); }
      c.face += angDiff(c.face, Math.atan2(p.dx, p.dz)) * Math.min(1, 8 * dt);
      c.speed = PD.walk;
      return;
    }
    if (c.state === 'wander' || c.state === 'leave') {
      c.timer -= dt;
      const ff = c.face;
      c.x += Math.sin(ff) * PD.walk * dt; c.z += Math.cos(ff) * PD.walk * dt; c.speed = PD.walk;
      if (Math.random() < dt * 0.3) c.face += rr(-1, 1);
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
      if (d > 1.25) moveTo(tgt.x, tgt.z, c.temper === 'master' ? 6.5 : 5.2);
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
    if (car.chasing) { this.policeDrive(car, dt); return; }
    if (car.ai) {
      const ai = car.ai, path = ai.path, e = path.e;
      let target = CFG.traffic.speed[e.cls];
      if (car.type === 'police') target *= 0.85;
      // look ahead for obstacles
      const fx = Math.sin(car.a), fz = Math.cos(car.a);
      let block = false, blockPlayer = false;
      const check = (o, r) => { const dx = o.x - car.x, dz = o.z - car.z, d = Math.hypot(dx, dz); if (d < 10 && d > 0.1 && (dx * fx + dz * fz) / d > 0.82 && Math.abs(dx * fz - dz * fx) < r) { block = true; return true; } return false; };
      for (const o of this.cars) if (o !== car) check(o, 2.2);
      for (const o of this.chars) if (o.state !== 'down' || true) if (check(o, 1.8) && (o === this.player)) blockPlayer = true;
      if (this.inCar && check(this.inCar, 2.4)) blockPlayer = true;
      if (car.stopT > 0) { car.stopT -= dt; block = true; }
      car.speed = lerp(car.speed, block ? 0 : target, 1 - Math.exp(-(block ? 6 : 1.2) * dt));
      if (blockPlayer) { car.honkT -= dt; if (car.honkT <= 0) { car.honkT = 2.5; if (Math.hypot(car.x - this.player.x, car.z - this.player.z) < 60) { sfx.horn(); this.bubble('honk', car, 3.2); } } }
      this.advancePath(path, car.speed * dt, false, true);
      const p = this.w.edgePoint(path.e, path.s, path.dir, path.e.oneway ? 0 : path.e.w / 4);
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
      if (c.kind !== 'player' && this.w.inWater(c.x, c.z)) { c.face += Math.PI; c.x += Math.sin(c.face) * 0.6; c.z += Math.cos(c.face) * 0.6; }
      if (c === this.player && this.w.inWater(c.x, c.z)) { c.x = c.px ?? c.x; c.z = c.pz ?? c.z; }
      c.px = c.x; c.pz = c.z;
    }
    // simple pairwise separation (grid-free: counts are small)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.state === 'down' || b.state === 'down' || a.state === 'fly' || b.state === 'fly') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
        if (d < m && d > 1e-4) { const k = (m - d) / d / 2; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
  }
  carHits(dt) {
    const movers = this.cars.filter((c) => Math.abs(c.speed) > 3);
    for (const b of this.buses) if (b.moving) movers.push({ x: b.x, z: b.z, a: b.a, speed: CFG.bus.speed, vx: Math.sin(b.a) * CFG.bus.speed, vz: Math.cos(b.a) * CFG.bus.speed, bus: true });
    for (const car of movers) {
      const fx = Math.sin(car.a), fz = Math.cos(car.a);
      const halfL = car.bus ? 6 : 2.2, halfW = car.bus ? 1.3 : 1.05;
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
            this.player.state = 'down'; this.player.timer = 1.6; sfx.crash(0.5);
            if (this.player.hp <= 0) this.playerKO(car.type === 'police');
            continue;
          }
          c.state = 'fly'; c.vy = 4 + sp * 0.35; c.vx = car.vx * 0.7 + (lat > 0 ? fz : -fz) * 3; c.vz = car.vz * 0.7 + (lat > 0 ? -fx : fx) * 3; c.y = 0.1; c.path = null;
          c.hp -= sp * 3; sfx.crash(0.4); if (Math.random() < 0.5) sfx.scream(0.5);
          if (car === this.inCar) { car.hp -= 2; this.crime(c.x, c.z, c.kind === 'cop' ? c : null); if (Math.random() < 0.5) this.hud.bubble(t('pow'), [c.x, 2.5, c.z], 'pow'); }
        }
      }
    }
    // player car vs other cars / buses
    const pc = this.inCar;
    if (pc) {
      const others = [...this.cars.filter((c) => c !== pc), ...this.buses.map((b) => ({ x: b.x, z: b.z, a: b.a, bus: true, speed: 0 }))];
      for (const o of others) {
        const rad = o.bus ? 5.5 : 3.6;
        const dx = pc.x - o.x, dz = pc.z - o.z, d = Math.hypot(dx, dz);
        if (d < rad && d > 0.01) {
          // approximate OBB with distance along each car's axis
          const ofx = Math.sin(o.a), ofz = Math.cos(o.a);
          const lon = dx * ofx + dz * ofz, lat = dx * ofz - dz * ofx;
          const hl = (o.bus ? 6 : 2.2) + 1.6, hw = (o.bus ? 1.3 : 1.05) + 1.05;
          if (Math.abs(lon) > hl || Math.abs(lat) > hw) continue;
          const nx = dx / d, nz = dz / d;
          const rel = (pc.vx - (o.vx || 0)) * nx + (pc.vz - (o.vz || 0)) * nz;
          pc.x += nx * 0.35; pc.z += nz * 0.35;
          if (rel < 0) {
            const imp = -rel;
            pc.vx -= rel * nx * 1.2; pc.vz -= rel * nz * 1.2; pc.speed *= 0.55;
            if (imp > 3) {
              pc.hp -= imp * 1.2; sfx.crash(imp / 14); this.shake = Math.min(1, imp / 12);
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
      if (cops < PO.footChase && !this.inCar) {
        const a = rr(0, 6.28);
        const ne = this.w.nearestEdge(P.x + Math.cos(a) * 45, P.z + Math.sin(a) * 45, 25);
        if (ne) { const p = this.w.edgePoint(ne.e, ne.e.cum[ne.k], 1, ne.e.w / 2 + 1.6); const c = this.makeChar2('cop', p.x, p.z); c.state = 'chase'; }
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
    for (const f of this.puffs) { f.y += f.vy * dt; f.life -= dt; f.s += dt * 0.6; }
    this.puffs = this.puffs.filter((f) => f.life > 0);
  }

  // ------------------------------------------------------------------ render
  fillBatches() {
    for (const b of Object.values(this.B)) b.n = 0;
    const P = this.playerPos();
    const R = 120;
    for (const c of this.chars) if (!c.hidden && Math.abs(c.x - P.x) < R && Math.abs(c.z - P.z) < R) this.drawChar(c);
    for (const car of this.cars) if (Math.abs(car.x - P.x) < R + 30 && Math.abs(car.z - P.z) < R + 30) this.drawCar(car);
    for (const b of this.buses) if (Math.abs(b.x - P.x) < R + 40 && Math.abs(b.z - P.z) < R + 40) {
      const m = M.chain(M.T(b.x, 0, b.z), M.RY(b.a));
      this.put(this.B.busBody, M.mul(m, M.T(0, 1.8, 0)), [0.15, 0.39, 0.92]);
      this.put(this.B.busGlass, M.mul(m, M.T(0, 2.4, 0.2)));
      this.put(this.B.busRoof, M.mul(m, M.T(0, 3.35, 0)));
      for (const s of [-1, 1]) for (const zz of [-3.6, 3.6]) this.put(this.B.wheel, M.chain(m, M.T(s * 1.15, 0.5, zz), M.RZ(Math.PI / 2), M.S(1.2)));
    }
    for (const f of this.puffs) this.put(this.B.puff, M.chain(M.T(f.x, f.y, f.z), M.S(f.s)), f.c);
    for (const b of Object.values(this.B)) if (b.n) this.r.upload(b);
  }
  drawChar(c) {
    const B = this.B;
    let base = M.chain(M.T(c.x, c.y + (c.state === 'down' || c.state === 'ko' ? 0.05 : 0.15), c.z), M.RY(c.face), M.S(CS));
    const lying = c.state === 'down' || c.state === 'ko' || (c.state === 'fly');
    if (lying) base = M.chain(base, M.T(0, 0.3, 0), M.RX(c.state === 'fly' ? -Math.PI / 2 + Math.sin(this.time * 12) * 0.8 : -Math.PI / 2 + 0.1));
    const A = (m, batch, col) => this.put(batch, M.mul(base, m), col);
    c.phase += (c.speed || 0) * 0.016 * 3.2;
    const sw = lying ? 0 : Math.sin(c.phase) * Math.min(1, (c.speed || 0) / 4) * 0.7;
    for (const [sx, s] of [[1, sw], [-1, -sw]]) A(M.chain(M.T(sx * 0.17, 0.55, 0), M.RX(s), M.T(0, -0.27, 0)), B.limb, c.pants);
    A(M.T(0, 0.95, 0), B.body, c.shirt);
    let la = -sw, ra = sw, lz = 0, rz = 0;
    if (c.punchT > 0) { ra = -Math.PI / 2; la = 0.5; }
    else if (c.state === 'flee' || c.mouth) { la = ra = Math.PI * 0.95; lz = -0.3; rz = 0.3; }
    else if (c.state === 'fight' || (c.kind === 'cop' && c.state === 'chase' && (c.speed || 0) < 1)) { la = ra = -1.1; }
    for (const [sx, rx, rzz] of [[-1, la, lz], [1, ra, rz]]) {
      A(M.chain(M.T(sx * 0.5, 1.2, 0), M.RZ(rzz), M.RX(rx), M.T(0, -0.26, 0)), B.limb, c.shirt);
      A(M.chain(M.T(sx * 0.5, 1.2, 0), M.RZ(rzz), M.RX(rx), M.T(0, -0.6, 0)), B.hand, c.skin);
    }
    A(M.T(0, 1.85, 0), B.head, c.skin);
    A(M.chain(M.T(0, 1.98, -0.06), M.S(1.06, 0.78, 1.06)), B.hair, c.hair);
    for (const sx of [-1, 1]) A(M.T(sx * 0.18, 1.83, 0.52), B.eye);
    if (c.mouth || c.state === 'fight') A(M.chain(M.T(0, 1.66, 0.53), M.S(1, 0.7, 0.4)), B.mouth);
    if (c.cap) { A(M.T(0, 2.3, 0), B.cap, c.cap); A(M.T(0, 2.18, 0.42), B.brim, c.cap); A(M.T(0, 2.38, 0.47), B.badge); }
    if (c.state === 'down' || c.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 3 + (i / 3) * Math.PI * 2;
        this.put(B.star, M.chain(M.T(c.x + Math.cos(a) * 0.9 + Math.sin(c.face) * -2.1, 1.4 + Math.sin(a * 2) * 0.15, c.z + Math.sin(a) * 0.9 + Math.cos(c.face) * -2.1), M.RY(CFG.camera.azimuth)));
      }
    }
  }
  drawCar(car) {
    const B = this.B;
    const m = M.chain(M.T(car.x, 0, car.z), M.RY(car.a));
    const P = (batch, mm, col) => this.put(batch, M.mul(m, mm), col);
    const dark = car.hp <= 0 ? [0.3, 0.3, 0.32] : car.col;
    P(B.carBody, M.T(0, 0.72, 0), dark);
    P(B.carCabin, M.T(0, 1.47, -0.25));
    P(B.carRoof, M.T(0, 2.2, -0.25), dark);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(B.wheel, M.chain(M.T(sx * 1.0, 0.42, sz * 1.4), M.RZ(Math.PI / 2)));
    for (const sx of [-1, 1]) { P(B.headl, M.T(sx * 0.62, 0.8, 2.18)); P(B.taill, M.T(sx * 0.62, 0.8, -2.18)); }
    if (car.type === 'police') {
      P(B.stripe, M.T(0, 0.85, 0));
      const blink = car.chasing ? (Math.floor(this.time * 6) % 2) : 0;
      P(B.barR, M.T(-0.4, 2.35, -0.25), blink ? [0.4, 0.1, 0.1] : null);
      P(B.barB, M.T(0.4, 2.35, -0.25), !blink && car.chasing ? [0.1, 0.1, 0.4] : null);
    }
    if (car.type === 'taxi') P(B.taxi, M.T(0, 2.42, -0.25));
  }
}

function hexc(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
