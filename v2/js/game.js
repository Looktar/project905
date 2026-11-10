// Game: the whole simulation on the 2D ground plane (no DOM, no three.js; runs headless in tests).
// Views read game.player / game.peds / game.cars and drain game.ev each frame.
import { CFG, COL } from './config.js';
import { clamp, angDiff, makeRng } from './util.js';

const AZ = CFG.camera.azimuth;
// screen-space stick -> world: up on screen is away from the camera
const UPX = -Math.sin(AZ), UPZ = -Math.cos(AZ), RTX = Math.cos(AZ), RTZ = -Math.sin(AZ);
const CAR_TYPES = {
  sedan: { len: 4.4, speed: 1, accel: 1 }, suv: { len: 4.6, speed: 0.97, accel: 0.95 }, van: { len: 5.0, speed: 0.88, accel: 0.8 },
  taxi: { len: 4.4, speed: 1, accel: 1 }, police: { len: 4.5, speed: 1.06, accel: 1.15 },
};

export class Game {
  constructor(world, { seed = 905, mobile = false } = {}) {
    this.w = world; this.rng = makeRng(seed); this.mobile = mobile;
    this.time = 0; this.ev = []; this.nextId = 1;
    this.peds = []; this.cars = [];
    this.trauma = 0; this.stop = 0;
    this.wanted = false; this.lostT = 0; this.bustT = 0; this.reinT = 0; this.spawnT = 0; this.warm = true; this.warmUntil = 1.2;
    const [sx, sz] = world.map.spawn;
    this.player = {
      kind: 'player', id: 0, x: sx, z: sz, y: 0, vy: 0, h: Math.PI, speed: 0, hp: CFG.player.hp, state: 'walk', t: 0,
      punchT: 0, punchAnim: 0, hitT: 0, invuln: 0, regenT: 99, car: null, kvx: 0, kvz: 0, anim: 0,
      look: { skin: COL.skin[1], hair: '#2b2320', shirt: '#ff6b4a', pants: '#2d3a55', hat: 'cap', hatCol: '#f4f6fb' },
    };
    // the map's spawn corner can fall inside a newer building footprint: start on the pavement next to it
    const ne = world.nearestEdge(sx, sz, 60);
    let px = sx, pz = sz;
    if (ne) { const c = world.edgePoint(ne.e, ne.s, 1), side = (sx - c.x) * -c.dz + (sz - c.z) * c.dx >= 0 ? 1 : -1, q = world.edgePoint(ne.e, ne.s, 1, side * (ne.e.w / 2 + 1.4)); px = q.x; pz = q.z; }
    const res = world.resolve(px, pz, CFG.player.radius + 0.2);
    this.player.x = res.x; this.player.z = res.z;
    this.populate();
  }
  emit(k, o) { this.ev.push(Object.assign({ k }, o)); }
  say(who, key) { this.emit('say', { who, key }); }
  feedback(tier) { const f = CFG.feel[tier]; this.trauma = Math.min(1, this.trauma + f.trauma); this.stop = Math.max(this.stop, f.stop); }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  get focus() { return this.player.car || this.player; }

  // ------------------------------------------------------------ spawning
  populate() {
    const P = CFG.peds, T = CFG.traffic, PO = CFG.police, f = this.focus, r = this.rng;
    const inCar = !!this.player.car, far = inCar ? 22 : 0;
    const pMin = this.warm ? 10 : P.spawnMin + far, cMin = this.warm ? 22 : T.spawnMin + far;
    const pedTarget = this.mobile ? P.countMobile : P.countDesktop, carTarget = this.mobile ? T.countMobile : T.countDesktop;
    let civ = 0, footCops = 0, cops = 0;
    for (const p of this.peds) { if (p.cop) { cops++; if (!p.fromCar) footCops++; } else civ++; }
    let ai = 0, parked = 0, copCars = 0;
    for (const c of this.cars) { if (c.driver === 'ai') ai++; else if (c.driver === 'cop') { copCars++; cops++; } else if (c.mode === 'parked' && c !== this.player.car) parked++; }
    for (let n = 0; n < 6 && civ < pedTarget; n++) {
      const s = this.w.randomRoadSpot(r, f.x, f.z, pMin, P.spawnMax + far);
      if (s) { this.addPed(s); civ++; }
    }
    for (let n = 0; n < 4 && ai < carTarget; n++) {
      const s = this.w.randomRoadSpot(r, f.x, f.z, cMin, T.spawnMax + far);
      if (s && this.addCar(s, r.weighted(T.mix), 'ai')) ai++;
    }
    if (parked < T.parked) {
      const s = this.w.randomLotSpot(r, f.x, f.z, this.warm ? 12 : cMin, 130 + far);
      if (s) this.addCar(null, r.weighted(T.mix), null, s);
    }
    if (footCops < PO.footPatrol && cops < PO.max) { const s = this.w.randomRoadSpot(r, f.x, f.z, this.warm ? 30 : pMin, 110 + far); if (s) this.addPed(s, true); }
    if (copCars < PO.carPatrol && cops < PO.max) { const s = this.w.randomRoadSpot(r, f.x, f.z, this.warm ? 45 : cMin, 150 + far); if (s) this.addCar(s, 'police', 'cop'); }
    // recycle whatever drifted far away
    this.peds = this.peds.filter((p) => this.dist(p, f) < P.despawn + far || (p.cop && p.aware && this.wanted));
    this.cars = this.cars.filter((c) => c === this.player.car || c.keep > this.time || this.dist(c, f) < T.despawn + far || (c.driver === 'cop' && c.aware && this.wanted));
  }
  makeLook(cop) {
    const r = this.rng;
    if (cop) return { skin: r.pick(COL.skin), hair: '#2b2320', shirt: COL.cop, pants: '#16264f', hat: 'police', hatCol: COL.cop };
    const sa = r() < CFG.peds.southAsian, female = r() < 0.5;
    const look = { skin: sa ? r.pick(COL.skinSA) : r.pick(COL.skin), hair: sa ? r.pick(COL.hair.slice(0, 3)) : r.pick(COL.hair), shirt: r.pick(COL.shirt), pants: r.pick(COL.pants), hat: 'none', hatCol: r.pick(COL.shirt) };
    const x = r();
    if (sa && !female && x < 0.3) { look.hat = 'turban'; look.hatCol = r.pick(['#e8663c', '#2f6fd0', '#f2c94c', '#8a3ab9', '#1e3a8a', '#d9d9d9']); }
    else if (female && x < 0.6) look.hat = 'long';
    else if (x < 0.2) look.hat = 'cap';
    else if (x > 0.93) look.hat = 'bald';
    if (sa && r() < 0.45) look.long = true;   // kurta: long tunic
    return look;
  }
  addPed(spot, cop = false) {
    const r = this.rng, P = CFG.peds, e = spot.e, dir = r() < 0.5 ? 1 : -1, side = e.oneway ? dir : r() < 0.5 ? 1 : -1;   // one-way = half of a divided road: keep to the outer side
    const s = dir > 0 ? spot.s : e.len - spot.s;
    const q = this.w.edgePoint(e, s, dir, side * (e.w / 2 + P.sideOff));
    if (!this.w.walkable(q.x, q.z)) return null;
    const ped = {
      kind: 'ped', id: this.nextId++, x: q.x, z: q.z, y: 0, vy: 0, h: Math.atan2(q.dx, q.dz), speed: 0, e, dir, s, side,
      state: 'walk', t: 0, cop, hp: cop ? CFG.police.hp : r.range(P.hp[0], P.hp[1]), power: cop ? 1 : r.range(P.power[0], P.power[1]),
      temper: cop ? 'cop' : r.weighted(P.temper), look: this.makeLook(cop), anim: r() * 6, punchT: 0, punchAnim: 0, hitT: 0,
      kvx: 0, kvz: 0, blockT: 0, detour: 0, detourH: 0, detSide: r() < 0.5 ? 1 : -1, stuckT: 0, aware: false, angry: false, threat: null,
    };
    if (ped.temper === 'master') { ped.hp = 220; ped.power = 2.6; }
    ped.maxHp = ped.hp;
    this.peds.push(ped);
    return ped;
  }
  addCar(spot, type, driver, at) {
    const r = this.rng;
    let e = null, dir = 1, s = 0, q;
    if (at) q = { x: at.x, z: at.z, dx: Math.sin(at.h), dz: Math.cos(at.h) };
    else { e = spot.e; dir = e.oneway ? 1 : r() < 0.5 ? 1 : -1; s = dir > 0 ? spot.s : e.len - spot.s; q = this.w.edgePoint(e, s, dir, this.w.laneOff(e)); }
    for (const c of this.cars) if (Math.hypot(c.x - q.x, c.z - q.z) < (at ? 5 : 12)) return null;
    if (Math.hypot(this.player.x - q.x, this.player.z - q.z) < 8) return null;
    const T = CAR_TYPES[type];
    const car = {
      kind: 'car', id: this.nextId++, type, len: T.len, color: type === 'taxi' ? '#ffc21a' : type === 'police' ? '#f4f6fb' : r.pick(COL.car),
      x: q.x, z: q.z, h: Math.atan2(q.dx, q.dz), vx: 0, vz: 0, v: 0, steer: 0, hp: CFG.car.hp, driver, mode: driver ? 'route' : 'parked',
      e, dir, s, next: null, sig: undefined, stuckT: 0, ignoreT: 0, bumpT: 0, honkT: 0, aware: false, siren: false, revT: 0, slowT: 0, keep: 0, wheel: 0, smoke: 0,
    };
    this.cars.push(car);
    return car;
  }
  // put a ped / route car back on the road network after a chase or a flight
  attach(o) {
    const n = this.w.nearestEdge(o.x, o.z, 80);
    if (!n) return false;
    const e = n.e;
    if (o.kind === 'car') { o.e = e; o.dir = e.oneway ? 1 : (Math.sin(o.h) * (e.pts[n.k + 1][0] - e.pts[n.k][0]) + Math.cos(o.h) * (e.pts[n.k + 1][1] - e.pts[n.k][1]) >= 0 ? 1 : -1); o.s = o.dir > 0 ? n.s : e.len - n.s; o.next = null; o.sig = undefined; return true; }
    o.e = e; o.dir = this.rng() < 0.5 ? 1 : -1; o.s = o.dir > 0 ? n.s : e.len - n.s;
    const q = this.w.edgePoint(e, o.s, o.dir);
    o.side = e.oneway ? o.dir : (o.x - q.x) * -q.dz + (o.z - q.z) * q.dx >= 0 ? 1 : -1;
    return true;
  }

  // ------------------------------------------------------------ main update
  update(dt, inp) {
    if (this.stop > 0) { this.stop -= dt; return; }   // hit-stop
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - CFG.feel.decay * dt);
    this.updatePlayer(dt, inp);
    for (const p of this.peds) this.updatePed(p, dt);
    for (const c of this.cars) this.updateCar(c, dt);
    this.carContacts();
    this.updatePolice(dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = this.warm ? 0.02 : 0.25; this.populate(); if (this.time > this.warmUntil) this.warm = false; }
  }

  // move a walker toward heading `aim` at `speed`, sliding along walls; returns distance actually covered
  step(o, aim, speed, dt, r) {
    const ox = o.x, oz = o.z;
    let nx = o.x + Math.sin(aim) * speed * dt + o.kvx * dt, nz = o.z + Math.cos(aim) * speed * dt + o.kvz * dt;
    const k = Math.exp(-7 * dt); o.kvx *= k; o.kvz *= k;
    const res = this.w.resolve(nx, nz, r);
    nx = res.x; nz = res.z;
    if (this.w.walkable(nx, nz)) { o.x = nx; o.z = nz; }
    if (speed > 0.1) o.h += angDiff(o.h, aim) * Math.min(1, 14 * dt);
    const moved = Math.hypot(o.x - ox, o.z - oz);
    o.speed = moved / dt; o.anim += moved * 1.5;
    return moved;
  }
  // chase a point with a short sidestep when blocked by a corner
  pursue(o, tx, tz, speed, dt) {
    let aim = Math.atan2(tx - o.x, tz - o.z);
    if (o.detour > 0) { o.detour -= dt; aim = o.detourH; }
    const moved = this.step(o, aim, speed, dt, CFG.peds.radius);
    if (moved < speed * dt * 0.35) { o.blockT += dt; if (o.blockT > 0.3) { o.blockT = 0; o.detour = 0.7; o.detourH = aim + o.detSide * 1.45; if (this.rng() < 0.3) o.detSide = -o.detSide; } } else o.blockT = 0;
  }

  // ------------------------------------------------------------ player
  updatePlayer(dt, inp) {
    const p = this.player, C = CFG.player;
    p.invuln = Math.max(0, p.invuln - dt); p.punchT -= dt; p.punchAnim = Math.max(0, p.punchAnim - dt); p.hitT = Math.max(0, p.hitT - dt);
    p.regenT += dt;
    if (p.regenT > C.regenDelay && p.hp < C.hp && p.state !== 'ko') p.hp = Math.min(C.hp, p.hp + C.regenRate * dt);
    if (p.state === 'busted') {
      p.t -= dt;
      if (p.t <= 0) this.respawn();
      return;
    }
    if (p.state === 'fly') { this.fly(p, dt); return; }
    if (p.state === 'ko') {
      p.t -= dt; p.speed = 0;
      if (p.t <= 0) { p.state = 'walk'; p.hp = Math.max(p.hp, C.hp * 0.5); p.invuln = C.invuln; this.emit('getup', { who: p }); }
      return;
    }
    if (p.state === 'car') { this.updatePlayerCar(dt, inp); return; }
    const m = Math.min(1, Math.hypot(inp.sx, inp.sy));
    if (m > 0.08) {
      const wx = RTX * inp.sx + UPX * inp.sy, wz = RTZ * inp.sx + UPZ * inp.sy;
      this.step(p, Math.atan2(wx, wz), (inp.run ? C.run : C.walk) * Math.max(0.35, m), dt, C.radius);
    } else this.step(p, p.h, 0, dt, C.radius);
    if (inp.punch && p.punchT <= 0) this.playerPunch();
    if (inp.act) this.tryEnter();
  }
  playerPunch() {
    const p = this.player, C = CFG.player;
    p.punchT = C.punchCooldown; p.punchAnim = 0.22;
    let best = null, bd = 1e9;
    for (const q of this.peds) {
      if (q.state === 'down' || q.state === 'fly') continue;
      const d = this.dist(p, q);
      if (d > C.punchRange) continue;
      const a = Math.abs(angDiff(p.h, Math.atan2(q.x - p.x, q.z - p.z)));
      if (a > C.punchArc && d > 0.9) continue;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { this.emit('whoosh', { x: p.x, z: p.z }); return; }
    p.h = Math.atan2(best.x - p.x, best.z - p.z);
    this.hitPed(best, this.rng.range(C.punchDmg[0], C.punchDmg[1]), p);
  }
  hitPed(q, dmg, by) {
    const r = this.rng, p = this.player;
    q.hp -= dmg; q.hitT = 0.22;
    const a = Math.atan2(q.x - by.x, q.z - by.z);
    q.kvx = Math.sin(a) * 6; q.kvz = Math.cos(a) * 6;
    this.feedback(q.cop ? 'medium' : 'small');
    this.emit('hit', { x: q.x, z: q.z, who: q });
    if (q.cop) { q.angry = true; q.aware = true; this.setWanted(); }
    else this.crime(q.x, q.z);
    this.witness(q.x, q.z, q);
    if (q.hp <= 0) { this.knockDown(q); return; }
    if (q.cop) return;
    const t = q.temper, x = r();
    if (t === 'timid' ? x < 0.9 : t === 'normal' ? x < 0.5 : false) this.flee(q, p);
    else if (q.state !== 'fight') { q.state = 'fight'; q.t = 12; q.punchT = 0.5; this.say(q, t === 'master' ? 'master' : 'fight'); }
  }
  knockDown(q) {
    q.state = 'down'; q.t = this.rng.range(CFG.peds.downTime[0], CFG.peds.downTime[1]); q.speed = 0;
    this.feedback('medium'); this.emit('down', { who: q }); this.say(q, 'ouch');
  }
  flee(q, from) { if (q.cop || q.state === 'down' || q.state === 'fly') return; q.state = 'flee'; q.t = this.rng.range(6, 9); q.threat = from; if (this.rng() < 0.7) this.say(q, 'help'); }
  witness(x, z, except) {
    for (const q of this.peds) {
      if (q === except || q.cop || q.state !== 'walk') continue;
      if (Math.hypot(q.x - x, q.z - z) > CFG.peds.witness) continue;
      const t = q.temper, r = this.rng();
      if (t === 'timid' ? r < 0.85 : t === 'normal' ? r < 0.45 : r < 0.1) this.flee(q, this.focus);
      else if (r > 0.7) this.say(q, 'gasp');
    }
  }
  hurtPlayer(dmg, by) {
    const p = this.player;
    if (p.invuln > 0 || p.state === 'ko' || p.state === 'busted' || p.state === 'car') return;
    p.hp -= dmg; p.regenT = 0; p.hitT = 0.22;
    if (by) { const a = Math.atan2(p.x - by.x, p.z - by.z); p.kvx = Math.sin(a) * 5; p.kvz = Math.cos(a) * 5; }
    this.feedback('medium'); this.emit('hit', { x: p.x, z: p.z, who: p });
    if (p.hp <= 0) this.koPlayer(by);
  }
  koPlayer(by) {
    const p = this.player;
    p.hp = 0; p.state = 'ko'; p.t = CFG.player.koTime; p.speed = 0;
    this.feedback('large'); this.emit('down', { who: p });
    for (const q of this.peds) if (q.state === 'fight') { q.state = 'walk'; this.attach(q); }
    if (by && by.cop && this.wanted) this.bust();
  }
  // ballistic flight after being hit by a car, then lie on the ground
  fly(o, dt) {
    o.vy -= 22 * dt; o.y += o.vy * dt;
    const nx = o.x + o.kvx * dt, nz = o.z + o.kvz * dt, res = this.w.resolve(nx, nz, 0.5, false);
    if (this.w.walkable(res.x, res.z)) { o.x = res.x; o.z = res.z; }
    if (o.y <= 0) {
      o.y = 0; o.kvx = o.kvz = 0;
      if (o === this.player) { o.state = 'ko'; o.t = CFG.player.koTime; this.emit('down', { who: o }); if (this.wanted) for (const q of this.peds) if (q.cop && q.aware && this.dist(q, o) < 6) { this.bust(); break; } }
      else { o.state = 'down'; o.t = this.rng.range(CFG.peds.downTime[0], CFG.peds.downTime[1]); this.emit('down', { who: o }); }
    }
  }
  launch(o, car, speed) {
    o.state = 'fly'; o.y = 0.1; o.vy = 6 + Math.min(6, speed * 0.25);
    const a = Math.atan2(o.x - car.x, o.z - car.z);
    o.kvx = car.vx * 0.85 + Math.sin(a) * 3; o.kvz = car.vz * 0.85 + Math.cos(a) * 3; o.speed = 0;
  }

  // ------------------------------------------------------------ pedestrians and cops on foot
  updatePed(q, dt) {
    const P = CFG.peds, p = this.player, w = this.w;
    q.punchT -= dt; q.punchAnim = Math.max(0, q.punchAnim - dt); q.hitT = Math.max(0, q.hitT - dt);
    if (q.state === 'fly') { this.fly(q, dt); return; }
    if (q.state === 'down') {
      q.t -= dt; q.speed = 0;
      if (q.t <= 0) { q.hp = Math.max(q.hp, q.maxHp * 0.4); if (q.cop) { q.state = 'walk'; this.attach(q); } else { q.state = 'walk'; this.flee(q, this.focus); } this.emit('getup', { who: q }); }
      return;
    }
    if (q.cop && q.aware && this.wanted) { this.copChase(q, dt); return; }
    if (q.cop && q.toCar) {   // walk back to the patrol car after a chase
      const c = q.toCar;
      if (!this.cars.includes(c) || c.driver) { q.toCar = null; q.fromCar = false; this.attach(q); return; }
      this.pursue(q, c.x, c.z, P.walk * 1.6, dt);
      if (this.dist(q, c) < 2.6) { c.driver = 'cop'; c.mode = 'route'; c.siren = false; this.attach(c); q.gone = true; }
      return;
    }
    if (q.state === 'flee') {
      q.t -= dt;
      const th = q.threat || p;
      this.pursue(q, q.x + (q.x - th.x), q.z + (q.z - th.z), P.flee, dt);
      if (q.t <= 0 || this.dist(q, th) > 70) { q.state = 'walk'; this.attach(q); }
      return;
    }
    if (q.state === 'fight') {
      q.t -= dt;
      const d = this.dist(q, p);
      if (q.t <= 0 || d > 20 || p.state !== 'walk' || p.invuln > 0) { q.state = 'walk'; this.attach(q); return; }
      if (d > 1.5) this.pursue(q, p.x, p.z, q.temper === 'master' ? 8.6 : 6.4, dt);
      else { this.step(q, Math.atan2(p.x - q.x, p.z - q.z), 0, dt, P.radius); if (q.punchT <= 0) { q.punchT = q.temper === 'master' ? 0.6 : 0.95; q.punchAnim = 0.22; this.hurtPlayer(6 * q.power, q); } }
      return;
    }
    // walk along the sidewalk
    const e = q.e, tgt = w.edgePoint(e, q.s, q.dir, q.side * (e.w / 2 + P.sideOff));
    const d = Math.hypot(tgt.x - q.x, tgt.z - q.z);
    if (d < 2.6) q.s += P.walk * 1.25 * dt;
    if (q.s >= e.len) {
      const ex = w.exits(w.endNode(e, q.dir), e.i, false), a = this.rng.pick(ex);
      q.e = w.edges[a.e]; q.dir = a.dir; q.s = Math.min(q.e.len, q.e.w / 2 + 2);
      if (q.e.oneway) q.side = q.dir;
    } else if (!e.oneway && this.rng() < P.crossRate * dt) q.side = -q.side;
    const moved = d > 0.3 ? this.step(q, Math.atan2(tgt.x - q.x, tgt.z - q.z), P.walk, dt, P.radius) : this.step(q, q.h, 0, dt, P.radius);
    if (d > 1 && moved < P.walk * dt * 0.3) { q.stuckT += dt; if (q.stuckT > 1.5) { q.stuckT = 0; q.s += 4; if (d > 12) { q.x = tgt.x; q.z = tgt.z; } } } else q.stuckT = 0;
  }
  copChase(q, dt) {
    const p = this.player, PO = CFG.police, f = this.focus, d = this.dist(q, f);
    q.state = 'walk';
    if (p.state === 'busted' || p.state === 'ko') { this.step(q, q.h, 0, dt, CFG.peds.radius); return; }
    const reach = p.car ? 3.6 : 1.5;
    if (d > reach) this.pursue(q, f.x, f.z, PO.run, dt);
    else {
      this.step(q, Math.atan2(f.x - q.x, f.z - q.z), 0, dt, CFG.peds.radius);
      if (!p.car && q.angry && q.punchT <= 0) { q.punchT = 0.9; q.punchAnim = 0.22; this.hurtPlayer(PO.punchDmg, q); }
    }
    if (d <= reach + 0.3 && (!p.car || Math.abs(p.car.v) < 1.5)) this.grab = true;
    if (this.rng() < 0.25 * dt) this.say(q, 'stop');
  }

  // ------------------------------------------------------------ cars
  tryEnter() {
    const p = this.player;
    let best = null, bd = CFG.car.enterDist;
    for (const c of this.cars) { const d = this.dist(p, c); if (d < bd) { bd = d; best = c; } }
    if (!best) return;
    const c = best;
    if (c.driver) {   // pull the driver out
      const cop = c.driver === 'cop';
      const q = this.addPedAt(c.x + Math.cos(c.h) * 2.1, c.z - Math.sin(c.h) * 2.1, cop);
      if (q) {
        if (cop) { q.aware = true; q.angry = true; q.fromCar = true; this.setWanted(); }
        else if (this.rng() < (q.temper === 'timid' ? 0.85 : q.temper === 'normal' ? 0.6 : 0.1)) this.flee(q, p);
        else { q.state = 'fight'; q.t = 10; q.punchT = 0.6; this.say(q, 'mycar'); }
      }
      this.crime(c.x, c.z); this.witness(c.x, c.z, q);
    }
    c.driver = 'player'; c.mode = 'player'; c.vx = Math.sin(c.h) * c.v; c.vz = Math.cos(c.h) * c.v; c.aware = false;
    p.car = c; p.state = 'car'; p.speed = 0;
    this.emit('enter', { car: c });
  }
  addPedAt(x, z, cop) {
    const n = this.w.nearestEdge(x, z, 80);
    if (!n) return null;
    const q = this.addPed({ e: n.e, s: n.s }, cop);
    if (!q) return null;
    const res = this.w.resolve(x, z, CFG.peds.radius);
    if (this.w.walkable(res.x, res.z)) { q.x = res.x; q.z = res.z; }
    this.attach(q);
    return q;
  }
  exitCar() {
    const p = this.player, c = p.car;
    if (!c) return;
    for (const side of [1, -1, 0]) {
      const x = side ? c.x + side * Math.cos(c.h) * 2.2 : c.x - Math.sin(c.h) * 3.4, z = side ? c.z - side * Math.sin(c.h) * 2.2 : c.z - Math.cos(c.h) * 3.4;
      const res = this.w.resolve(x, z, CFG.player.radius);
      if (!this.w.walkable(res.x, res.z) || Math.hypot(res.x - c.x, res.z - c.z) < 1.6) continue;
      p.x = res.x; p.z = res.z; break;
    }
    p.h = c.h; p.state = 'walk'; p.car = null;
    c.driver = null; c.mode = 'parked'; c.keep = this.time + 40;
    this.emit('exit', { car: c });
  }
  updatePlayerCar(dt, inp) {
    const p = this.player, c = p.car;
    let thr = 0, steer = 0;
    const dead = c.hp <= 0;
    if (inp.kb) { thr = inp.kb.thr; steer = inp.kb.steer; }
    else {
      const m = Math.min(1, Math.hypot(inp.sx, inp.sy));
      if (m > 0.12) {
        const wx = RTX * inp.sx + UPX * inp.sy, wz = RTZ * inp.sx + UPZ * inp.sy, a = angDiff(c.h, Math.atan2(wx, wz));
        if (c.rev ? Math.abs(a) < 1.5 : Math.abs(a) > 2.3 && c.v < 2.5) c.rev = !c.rev;
        if (c.rev) { thr = -m; steer = -clamp(angDiff(c.h, Math.atan2(wx, wz) + Math.PI) * 2.2, -1, 1); }
        else { thr = m * (Math.abs(a) > 1.2 ? 0.6 : 1); steer = clamp(a * 2.2, -1, 1); }
      } else c.rev = false;
    }
    if (dead) thr = 0;
    this.drive(c, thr, steer, inp.drift, dt);
    this.carWorld(c, true);
    p.x = c.x; p.z = c.z; p.h = c.h;
    if (inp.horn && c.honkT <= 0) { c.honkT = 0.4; this.emit('honk', { x: c.x, z: c.z }); }
    c.honkT -= dt;
    if (dead) { c.deadT = (c.deadT || 0) + dt; if (c.deadT > CFG.car.wreckExit && Math.abs(c.v) < 2) this.exitCar(); }
    else if (inp.act && Math.abs(c.v) < 9) this.exitCar();
    // run people over
    const sp = Math.hypot(c.vx, c.vz);
    for (const q of this.peds) {
      if (q.state === 'fly') continue;
      const d = this.carPointDist(c, q.x, q.z);
      if (d > 1.15 + CFG.peds.radius) continue;
      if (sp > 3) {
        if (q.state !== 'down') { q.hp -= sp * 3; this.launch(q, c, sp); this.feedback(sp > 12 ? 'large' : 'medium'); this.emit('crash', { x: q.x, z: q.z, tier: 'small' }); this.say(q, 'ouch'); if (q.cop) { q.angry = true; q.aware = true; this.setWanted(); } else this.crime(q.x, q.z); this.witness(q.x, q.z, q); }
      } else if (q.state !== 'down') { const a = Math.atan2(q.x - c.x, q.z - c.z); q.kvx = Math.sin(a) * 3; q.kvz = Math.cos(a) * 3; }
    }
  }
  // distance from a point to the car's spine (two-circle body)
  carPointDist(c, x, z) {
    const o = c.len / 2 - 1.1, fx = Math.sin(c.h), fz = Math.cos(c.h);
    const t = clamp((x - c.x) * fx + (z - c.z) * fz, -o, o);
    return Math.hypot(x - (c.x + fx * t), z - (c.z + fz * t));
  }
  // arcade car physics shared by the player and pursuing police cars
  drive(c, thr, steer, hand, dt) {
    const C = CFG.car, T = CAR_TYPES[c.type];
    let fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx;
    let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
    const top = C.maxSpeed * T.speed * (c.hp < 35 ? 0.75 : 1);
    if (thr > 0) vf += (vf < -0.5 ? C.brake : C.accel * T.accel * (1 - 0.55 * Math.max(0, vf) / top)) * thr * dt;
    else if (thr < 0) vf -= (vf > 0.5 ? C.brake : C.reverse) * -thr * dt;
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);
    vf -= vf * C.drag * dt;
    vf = clamp(vf, -C.maxReverse, top);
    c.h += steer * C.steer * clamp(vf / 7, -1, 1) * (hand ? 1.4 : 1) * dt;
    vl *= Math.exp(-(hand ? C.driftGrip : C.grip) * dt);
    fx = Math.sin(c.h); fz = Math.cos(c.h); rx = -fz; rz = fx;
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.v = vf; c.steer += (steer - c.steer) * Math.min(1, 10 * dt); c.wheel += vf * dt; c.slide = Math.abs(vl);
  }
  // keep a free-driving car out of buildings / water; crash feedback for the player
  carWorld(c, isPlayer) {
    const o = c.len / 2 - 1.1, fx = Math.sin(c.h), fz = Math.cos(c.h);
    let hit = false, nx = 0, nz = 0;
    for (const s of [o, -o]) {
      const px = c.x + fx * s, pz = c.z + fz * s, res = this.w.resolve(px, pz, 1.1);
      if (res.hit) { c.x += res.x - px; c.z += res.z - pz; hit = true; nx = res.nx; nz = res.nz; }
    }
    if (!this.w.walkable(c.x + fx * o, c.z + fz * o) || !this.w.walkable(c.x - fx * o, c.z - fz * o)) { c.x -= c.vx * 0.05; c.z -= c.vz * 0.05; c.vx *= -0.3; c.vz *= -0.3; hit = false; }
    if (hit) {
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= nx * vn * 1.3; c.vz -= nz * vn * 1.3;
        const imp = -vn;
        if (imp > 4) { c.hp -= (imp - 3) * 2.2; if (isPlayer) { this.feedback(imp > 12 ? 'large' : 'medium'); this.emit('crash', { x: c.x, z: c.z, tier: imp > 12 ? 'large' : 'medium' }); } }
      }
    }
  }
  updateCar(c, dt) {
    c.smoke = c.hp < 35 ? 1 : 0;
    if (c.mode === 'player') return;
    if (c.mode === 'parked') { c.v *= Math.exp(-4 * dt); c.vx *= Math.exp(-4 * dt); c.vz *= Math.exp(-4 * dt); c.x += c.vx * dt; c.z += c.vz * dt; return; }
    if (c.driver === 'cop' && c.aware && this.wanted && c.hp > 0) { this.copCar(c, dt); return; }
    if (c.mode === 'pursuit') { c.mode = 'route'; c.siren = false; this.attach(c); }
    this.routeCar(c, dt);
  }
  routeCar(c, dt) {
    const w = this.w, T = CFG.traffic, p = this.player;
    let e = c.e;
    if (!c.next) {
      const ex = w.exits(w.endNode(e, c.dir), e.i, true), a = this.rng.pick(ex), ne = w.edges[a.e];
      const p1 = w.edgePoint(e, e.len, c.dir), p2 = w.edgePoint(ne, 0, a.dir);
      c.next = { e: a.e, dir: a.dir, turn: Math.acos(clamp(p1.dx * p2.dx + p1.dz * p2.dz, -1, 1)) };
    }
    if (c.sig === undefined) c.sig = w.signalFor(e, c.dir);
    const la = 4.5 + c.v * 0.45;
    let ts = c.s + la, te = e, td = c.dir;
    if (ts > e.len) { te = w.edges[c.next.e]; td = c.next.dir; ts = Math.min(ts - e.len, te.len); }
    const tg = w.edgePoint(te, ts, td, w.laneOff(te));
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    let vt = T.speed[e.cls] * CAR_TYPES[c.type].speed;
    const left = e.len - c.s;
    if (c.next.turn > 0.6 && left < 14) vt = Math.min(vt, T.turnSpeed);
    let waiting = false;
    if (c.sig && c.ignoreT <= 0) {
      const d = left - c.sig.sg.half - c.len / 2, st = w.light(c.sig.sg, c.sig.axis, this.time);
      if (d > -1.5 && (st === 'r' || (st === 'y' && d > c.v * c.v / 9))) { vt = d < 0.4 ? 0 : Math.min(vt, Math.sqrt(2 * 5 * d)); waiting = d < 3; }
    }
    if (c.bumpT > 0) { c.bumpT -= dt; vt = 0; }
    // cars ahead and cross traffic
    if (c.ignoreT <= 0)
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz > 600) continue;
        const fwd = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
        if (fwd < 0.5) continue;
        const half = (c.len + o.len) / 2;
        if (lat < 1.9) { const gap = fwd - half; const ov = Math.max(0, o.vx * fx + o.vz * fz); vt = gap < 2.2 ? 0 : Math.min(vt, ov + (gap - 2.2) * T.headway); }
        else if (lat < 3.6 && fwd < 8 && c.id > o.id && Math.abs(angDiff(c.h, o.h)) > 0.6 && o.mode === 'route') vt = Math.min(vt, 0);
      }
    // people in front
    const ahead = (x, z) => { const dx = x - c.x, dz = z - c.z, fwd = dx * fx + dz * fz; return fwd > 0 && fwd < c.len / 2 + 3.5 + c.v * 0.7 && Math.abs(dx * -fz + dz * fx) < 1.5; };
    if (!p.car && p.state !== 'fly' && ahead(p.x, p.z)) { vt = 0; if (c.honkT <= 0 && c.v < 1) { c.honkT = this.rng.range(2, 4); this.emit('honk', { x: c.x, z: c.z }); } }
    if (c.v > 0.3 || vt > 0) for (const q of this.peds) if (q.state !== 'fly' && Math.abs(q.x - c.x) < 14 && ahead(q.x, q.z)) { vt = 0; break; }
    c.honkT -= dt; c.ignoreT -= dt;
    if (c.v < 0.4 && !waiting && c.bumpT <= 0) { c.stuckT += dt; if (c.stuckT > T.stuck) { c.stuckT = 0; c.ignoreT = 3; } } else c.stuckT = 0;
    c.v += clamp(vt - c.v, -T.decel * dt * (vt === 0 ? 1.6 : 1), T.accel * CAR_TYPES[c.type].accel * dt);
    if (c.v < 0) c.v = 0;
    const dh = angDiff(c.h, Math.atan2(tg.x - c.x, tg.z - c.z));
    c.h += clamp(dh, -2.6 * dt, 2.6 * dt) * Math.min(1, c.v / 2.5);
    c.steer = clamp(dh, -1, 1);
    c.vx = Math.sin(c.h) * c.v; c.vz = Math.cos(c.h) * c.v;
    c.x += c.vx * dt; c.z += c.vz * dt; c.wheel += c.v * dt;
    c.s += c.v * dt;
    if (c.s >= e.len) { c.s -= e.len; c.e = w.edges[c.next.e]; c.dir = c.next.dir; c.next = null; c.sig = undefined; }
    // drifted off the route (pushed by the player)? ease back
    const rp = w.edgePoint(c.e, c.s, c.dir, w.laneOff(c.e)), off = Math.hypot(rp.x - c.x, rp.z - c.z);
    if (off > 14) { c.x = rp.x; c.z = rp.z; c.h = Math.atan2(rp.dx, rp.dz); }
    // run over people who jump in front (no crime: not the player's doing)
    if (c.v > 4) {
      for (const q of this.peds) if (q.state !== 'fly' && q.state !== 'down' && this.carPointDist(c, q.x, q.z) < 1.3) { this.launch(q, c, c.v); this.emit('crash', { x: q.x, z: q.z, tier: 'small' }); this.say(q, 'ouch'); }
      if (p.state === 'walk' && p.invuln <= 0 && this.carPointDist(c, p.x, p.z) < 1.35) { p.hp = Math.max(1, p.hp - 25); p.regenT = 0; this.launch(p, c, c.v); this.feedback('large'); this.emit('crash', { x: p.x, z: p.z, tier: 'medium' }); }
    }
  }
  copCar(c, dt) {
    const p = this.player, f = this.focus, d = this.dist(c, f);
    c.mode = 'pursuit'; c.siren = true;
    let tx = f.x, tz = f.z;
    if (p.car) { tx += p.car.vx * 0.5; tz += p.car.vz * 0.5; }
    const a = angDiff(c.h, Math.atan2(tx - c.x, tz - c.z));
    let thr = 1, steer = clamp(a * 2.4, -1, 1);
    if (Math.abs(a) > 1.3 && c.v > 9) thr = -0.6;
    if (!p.car) {
      if (d < 14) { thr = c.v > 1 ? -1 : 0; if (Math.abs(c.v) < 1.6) { this.copExit(c); return; } }
    } else if (d < 6.5 && Math.abs(p.car.v) < 2) { thr = c.v > 0.5 ? -1 : 0; if (d < 6.5) this.grab = true; }
    if (c.revT > 0) { c.revT -= dt; thr = -1; steer = -steer; }
    else if (Math.abs(c.v) < 0.8 && thr > 0) { c.slowT += dt; if (c.slowT > 1.1) { c.slowT = 0; c.revT = 1.0; } } else c.slowT = 0;
    this.drive(c, thr, steer, false, dt);
    this.carWorld(c, false);
  }
  copExit(c) {
    const q = this.addPedAt(c.x + Math.cos(c.h) * 2.1, c.z - Math.sin(c.h) * 2.1, true);
    c.driver = null; c.mode = 'parked'; c.keep = this.time + 60;
    if (q) { q.aware = true; q.fromCar = true; q.homeCar = c; }
  }
  // car-to-car contacts involving free-driving cars (player and pursuit cars)
  carContacts() {
    const cars = this.cars, p = this.player;
    for (const a of cars) {
      if (a.mode !== 'player' && a.mode !== 'pursuit') continue;
      for (const b of cars) {
        if (a === b || ((b.mode === 'player' || b.mode === 'pursuit') && b.id < a.id)) continue;
        if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
        const oa = a.len / 2 - 1.1, ob = b.len / 2 - 1.1;
        for (const sa of [oa, -oa]) for (const sb of [ob, -ob]) {
          const ax = a.x + Math.sin(a.h) * sa, az = a.z + Math.cos(a.h) * sa, bx = b.x + Math.sin(b.h) * sb, bz = b.z + Math.cos(b.h) * sb;
          let dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
          if (d >= 2.15 || d < 1e-4) continue;
          dx /= d; dz /= d;
          const pen = 2.15 - d, free = b.mode === 'player' || b.mode === 'pursuit';
          const ka = free ? 0.5 : 0.75;
          a.x += dx * pen * ka; a.z += dz * pen * ka; b.x -= dx * pen * (1 - ka); b.z -= dz * pen * (1 - ka);
          const rvx = a.vx - b.vx, rvz = a.vz - b.vz, vn = rvx * dx + rvz * dz;
          if (vn >= 0) continue;
          const imp = -vn;
          a.vx -= dx * vn * (free ? 0.6 : 0.9); a.vz -= dz * vn * (free ? 0.6 : 0.9);
          if (free) { b.vx += dx * vn * 0.6; b.vz += dz * vn * 0.6; } else if (b.mode === 'parked') { b.vx += dx * vn * 0.5; b.vz += dz * vn * 0.5; } else b.bumpT = 1.2;
          if (imp > 3) {
            const dm = (imp - 2) * 1.6; a.hp -= dm; b.hp -= dm;
            const mine = a === p.car || b === p.car;
            if (mine) {
              const tier = imp > 12 ? 'large' : 'medium';
              this.feedback(tier); this.emit('crash', { x: ax, z: az, tier });
              const other = a === p.car ? b : a;
              if (other.type === 'police' && other.driver === 'cop') { other.aware = true; this.setWanted(); }
              else if (other.driver === 'ai' && other.honkT <= 0) { other.honkT = 2; this.emit('honk', { x: other.x, z: other.z }); }
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ police
  copsSee(range) {
    const f = this.focus;
    const sees = (o) => this.dist(o, f) < range && this.w.los(o.x, o.z, f.x, f.z);
    for (const q of this.peds) if (q.cop && q.state !== 'down' && q.state !== 'fly' && sees(q)) return true;
    for (const c of this.cars) if (c.driver === 'cop' && sees(c)) return true;
    return false;
  }
  // a crime only matters if a cop sees it
  crime(x, z) { if (this.copsSee(CFG.police.sight)) this.setWanted(); }
  setWanted() {
    if (!this.wanted) { this.wanted = true; this.reinT = CFG.police.reinforce; this.emit('wanted', {}); }
    this.lostT = 0;
    const f = this.focus;
    for (const q of this.peds) if (q.cop && this.dist(q, f) < CFG.police.alert) { q.aware = true; q.toCar = null; }
    for (const c of this.cars) if (c.driver === 'cop' && this.dist(c, f) < CFG.police.alert) c.aware = true;
  }
  updatePolice(dt) {
    const PO = CFG.police, p = this.player;
    if (this.peds.some((q) => q.gone)) this.peds = this.peds.filter((q) => !q.gone);
    if (!this.wanted) { this.bustT = 0; this.grab = false; return; }
    if (p.state === 'busted') return;
    let seen = false;
    const f = this.focus;
    for (const q of this.peds) if (q.cop && q.aware && q.state !== 'down' && this.dist(q, f) < PO.chaseSight && this.w.los(q.x, q.z, f.x, f.z)) { seen = true; break; }
    if (!seen) for (const c of this.cars) if (c.driver === 'cop' && c.aware && this.dist(c, f) < PO.chaseSight && this.w.los(c.x, c.z, f.x, f.z)) { seen = true; break; }
    if (seen) { this.lostT = 0; this.setWanted(); } else this.lostT += dt;
    if (this.lostT >= PO.giveUp) { this.clearWanted(); this.emit('escaped', {}); return; }
    if (this.grab) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 0.7);
    this.grab = false;
    if (this.bustT >= (p.car ? PO.bustCar : PO.bustFoot)) { this.bust(); return; }
    this.reinT -= dt;
    if (this.reinT <= 0) {
      this.reinT = PO.reinforce;
      let cops = 0;
      for (const q of this.peds) if (q.cop) cops++;
      for (const c of this.cars) if (c.driver === 'cop') cops++;
      if (cops < PO.max) {
        const s = this.w.randomRoadSpot(this.rng, f.x, f.z, 75, 130);
        const c = s && this.addCar(s, 'police', 'cop');
        if (c) c.aware = true;
      }
    }
  }
  clearWanted() {
    this.wanted = false; this.lostT = 0; this.bustT = 0;
    for (const q of this.peds) if (q.cop) { q.aware = false; q.angry = false; if (q.homeCar && this.cars.includes(q.homeCar) && !q.homeCar.driver) q.toCar = q.homeCar; else { q.fromCar = false; this.attach(q); } }
    for (const c of this.cars) { c.aware = false; if (c.type === 'police' && !c.driver) c.siren = false; }
  }
  bust() {
    const p = this.player;
    if (p.state === 'busted') return;
    if (p.car) { const c = p.car; c.driver = null; c.mode = 'parked'; c.keep = this.time + 30; p.car = null; }
    p.state = 'busted'; p.t = 2.2; p.speed = 0; p.y = 0;
    this.feedback('large'); this.emit('busted', {});
  }
  respawn() {
    const p = this.player, R = CFG.police.respawn;
    let spot = null;
    for (let i = 0; i < 40 && !spot; i++) {
      const s = this.w.randomRoadSpot(this.rng, p.x, p.z, R[0], R[1]);
      if (!s) continue;
      const q = this.w.edgePoint(s.e, s.s, 1, s.e.w / 2 + 2), res = this.w.resolve(q.x, q.z, CFG.player.radius);
      if (!this.w.walkable(res.x, res.z)) continue;
      if (this.peds.some((c) => c.cop && Math.hypot(c.x - res.x, c.z - res.z) < 40)) continue;
      spot = res;
    }
    if (spot) { p.x = spot.x; p.z = spot.z; }
    p.state = 'walk'; p.hp = Math.max(p.hp, CFG.player.hp * 0.5); p.invuln = CFG.player.invuln;
    this.clearWanted(); this.warm = true; this.warmUntil = this.time + 1; this.spawnT = 0;
    this.emit('respawn', {});
  }
}
