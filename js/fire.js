// Fire (v0.3, D-69): the player can set cars and buildings alight; a burning car explodes after a
// while (cartoon: flash, smoke, people fly and see stars); fire trucks come from the real fire
// stations, firefighters get out and hose it down, then drive off. A stolen fire truck has a water
// cannon. Buildings only burn and smoke (they never collapse). Everything here is cartoon.
import { M, clamp, angDiff, rr, pick, segDist } from './math.js';
import { CFG } from './config.js';
import { laneOff } from './signals.js';
import * as sfx from './audio.js';
import { t } from './i18n.js';

const FLAME = [[1, 0.93, 0.35], [1, 0.62, 0.12], [0.98, 0.33, 0.08]];
const CAM = [Math.sin(CFG.camera.azimuth), Math.cos(CFG.camera.azimuth)];
let fid = 1;

export class Fires {
  constructor(game) {
    this.g = game; this.list = []; this.water = []; this.cd = 0;
    // fire stations: the map's fire-hall buildings (OSM amenity=fire_station)
    this.stations = game.w.map.buildings.filter((b) => b.poi === 'fire').map((b) => centroid(b.p));
  }

  // ------------------------------------------------------------------ lighting fires
  // player action (on foot): the nearest car, else the nearest building wall, else a small fire on the ground
  tryArson() {
    const g = this.g, p = g.player, F = CFG.fire;
    if (this.cd > 0 || p.state !== 'walk' && p.state !== 'wander') return;
    this.cd = F.lightCooldown; p.punchT = 0.22;
    const hx = p.x + Math.sin(p.face) * 1.2, hz = p.z + Math.cos(p.face) * 1.2;
    if (this.list.filter((f) => !f.out).length >= F.max) { g.bubble('tooHot', p); return; }
    let car = null, cd = F.reach + 1.4;
    for (const c of g.cars) { if (c.bus || c.fire || c === g.inCar) continue; const d = Math.hypot(c.x - hx, c.z - hz); if (d < cd) { cd = d; car = c; } }
    let f = null;
    if (car) f = this.igniteCar(car);
    else {
      const wall = this.wallNear(hx, hz, F.reach);
      f = wall ? this.igniteBuilding(wall.bi, wall.x, wall.z) : this.add({ kind: 'ground', x: hx, z: hz, pts: [[hx, 0.2, hz, 0.8]], life: F.groundLife });
    }
    if (!f) return;
    f.byPlayer = true;
    sfx.ignite();
    g.crime(f.x, f.z);
  }
  wallNear(x, z, R) {
    const W = this.g.w;
    let best = null;
    for (const id of W.query(x - R, z - R, x + R, z + R)) {
      const c = W.colliders[id];
      if (c.kind !== 'b' || c.bi === undefined) continue;
      const P = c.poly;
      for (let i = 0; i < P.length; i++) {
        const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], r = segDist(x, z, ax, az, bx, bz);
        if (r.d < R && (!best || r.d < best.d)) best = { d: r.d, bi: c.bi, x: r.cx, z: r.cz };
      }
    }
    return best;
  }
  add(o) {
    const f = { id: fid++, heat: CFG.fire.startHeat, t: 0, smokeT: 0, out: false, outT: 0, truck: null, ...o };
    this.list.push(f);
    this.alarm(f);
    return f;
  }
  igniteCar(car) {
    if (car.fire) return null;
    const f = this.add({ kind: 'car', car, x: car.x, z: car.z, pts: [[0, 1.5, 0.8, 2.0], [0, 1.4, -1.1, 1.7]], life: CFG.fire.carLife });
    car.fire = f; car.stopT = 99; if (car.ai) car.speed = 0;
    // the driver jumps out and runs
    if (car.driver === 'npc' && car.ai && !car.bus) {
      const s = this.g.carSide(car, 1.9), d = this.g.makeChar2(car.type === 'police' ? 'cop' : 'ped', s[0], s[1]);
      if (d.kind === 'ped') { this.g.flee(d, car.x, car.z, 7); this.g.bubble('fire', d); }
      car.ai = null; car.driver = null; car.cops = 0; car.chasing = false;
    }
    return f;
  }
  igniteBuilding(bi, x, z) {
    const b = this.g.w.map.buildings[bi];
    if (!b) return null;
    const old = this.list.find((f) => f.bi === bi && !f.out);
    if (old) { old.heat = Math.min(1, old.heat + 0.2); return old; }
    // flames along the roof edge nearest the lighter (and the camera-facing side, so they read)
    const P = b.p, pts = [];
    const cand = [];
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az);
      for (let s = 2; s < L - 1; s += 4.5) {
        const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L;
        cand.push([Math.hypot(px - x, pz - z) - ((px * CAM[0] + pz * CAM[1]) * 0.05), px, pz]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    const n = clamp(Math.round(Math.sqrt(Math.abs(area(P))) / 6), 2, 5);
    for (const [, px, pz] of cand.slice(0, n)) pts.push([px, b.h + 0.3, pz, 2.8]);
    if (!pts.length) pts.push([x, b.h + 0.4, z, 1.6]);
    return this.add({ kind: 'bld', bi, x, z, pts, life: CFG.fire.bldLife, h: b.h });
  }

  // people come to look (or run), the fire service is called after a moment
  alarm(f) {
    const g = this.g;
    f.dispatchT = CFG.fire.dispatchDelay;
    for (const c of g.chars) {
      if (c.kind !== 'ped' || c.state === 'down' || c.state === 'fly' || c.state === 'fight') continue;
      const d = Math.hypot(c.x - f.x, c.z - f.z);
      if (d > CFG.fire.gawkReach) continue;
      if (c.temper === 'timid' || d < 8) { g.flee(c, f.x, f.z, rr(4, 7)); if (Math.random() < 0.3) g.bubble('fire', c); }
      else if (Math.random() < 0.6) { c.state = 'gawk'; c.gawk = f; c.timer = rr(12, 25); c.path = null; }
    }
  }

  // ------------------------------------------------------------------ water
  // a cone of water from (x, z) along (dx, dz): cools every fire point in range; returns the fire hit
  spray(x, z, dx, dz, range, power, dt, y = 1.6) {
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    for (let i = 0; i < 2; i++) this.water.push({ x: x + dx, y, z: z + dz, vx: dx * rr(13, 17) + rr(-1, 1), vy: rr(2.5, 4.5), vz: dz * rr(13, 17) + rr(-1, 1), life: 1.2 });
    let hit = null;
    for (const f of this.list) {
      if (f.out) continue;
      for (const [px, , pz] of this.pts(f)) {
        const ox = px - x, oz = pz - z, d = Math.hypot(ox, oz);
        if (d < range && (ox * dx + oz * dz) / (d || 1) > 0.8) { hit = f; break; }
      }
      if (hit === f) { f.heat -= power * dt * (f.kind === 'bld' ? 0.6 : 1); f.wetT = 1; } // a big building takes longer
    }
    return hit;
  }
  // world positions of a fire's flame points
  pts(f) {
    if (f.kind !== 'car') return f.pts;
    const c = f.car, s = Math.sin(c.a), co = Math.cos(c.a);
    return f.pts.map(([lx, y, lz, r]) => [c.x + co * lx + s * lz, y, c.z - s * lx + co * lz, r]);
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.g, F = CFG.fire, P = g.playerPos();
    this.cd = Math.max(0, this.cd - dt);
    if (!g.inCar && input().fire) this.tryArson();
    // stolen fire truck: water cannon while the button is held
    const tk = g.inCar && g.inCar.type === 'fire' ? g.inCar : null;
    if (tk && input().fireHeld) {
      const hit = this.spray(tk.x + Math.sin(tk.a) * 3.6, tk.z + Math.cos(tk.a) * 3.6, Math.sin(tk.a), Math.cos(tk.a), F.cannonRange, F.cannonPower, dt, 2.6);
      if (hit) hit.playerWater = true;
      sfx.hose();
    }
    // wrecked cars sometimes catch fire on their own
    for (const c of g.cars) if (c.hp <= 0 && !c.fire && !c.burnt && !c.bus && !c.fireRoll) { c.fireRoll = true; if (Math.random() < F.wreckFire) this.igniteCar(c); }
    for (const f of this.list) {
      f.t += dt;
      if (f.kind === 'car') { f.x = f.car.x; f.z = f.car.z; }
      if (f.out) { f.outT += dt; this.smoke(f, dt, 0.35); continue; }
      f.wetT = Math.max(0, (f.wetT || 0) - dt);
      if (!f.wetT) f.heat = Math.min(1, f.heat + dt / F.grow); // grows back only while nobody sprays it
      // a car burns down to an explosion; buildings and ground fires burn out on their own
      if (f.kind === 'car' && !f.car.burnt) {
        f.car.hp = Math.min(f.car.hp, CFG.car.hp * (1 - f.t / F.carBoom));
        if (f.t > F.carBoom) this.explode(f);
      }
      if (f.t > f.life) this.extinguish(f, false);
      else if (f.heat <= 0) this.extinguish(f, true);
      this.smoke(f, dt, 1);
      // too close: hot! (pushed back, a little damage)
      if (!g.inCar && g.player.state !== 'ko') {
        for (const [px, py, pz, r] of this.pts(f)) {
          if (py > 3) continue;
          const dx = g.player.x - px, dz = g.player.z - pz, d = Math.hypot(dx, dz);
          if (d < r + 0.9) { g.player.vx += dx / (d || 1) * 10 * dt * 6; g.player.vz += dz / (d || 1) * 10 * dt * 6; g.player.hp -= F.burnDps * dt; g.player.hurtT = 2; g.player.regenT = CFG.player.regenDelay; if (Math.random() < dt) g.bubble('hot', g.player); if (g.player.hp <= 0) g.playerKO(false); }
        }
      }
      // call the fire service
      if (f.dispatchT !== undefined && !f.truck) { f.dispatchT -= dt; if (f.dispatchT <= 0) { f.dispatchT = 6; this.dispatch(f); } }
    }
    // forget fires far away / long out
    this.list = this.list.filter((f) => {
      const keep = (f.out ? f.outT < F.smokeAfter : true) && Math.hypot(f.x - P.x, f.z - P.z) < F.forget;
      if (!keep && f.kind === 'car') f.car.fire = null;
      return keep;
    });
    for (const w of this.water) { w.x += w.vx * dt; w.z += w.vz * dt; w.y += w.vy * dt; w.vy -= 14 * dt; w.life -= dt; if (w.y < 0) w.life = 0; }
    this.water = this.water.filter((w) => w.life > 0).slice(-F.maxWater);
    this.updateTrucks(dt);
    this.updateCrews(dt);
  }
  smoke(f, dt, k) {
    f.smokeT -= dt * k;
    if (f.smokeT > 0) return;
    const big = f.kind === 'bld';
    f.smokeT = big ? 0.12 : 0.2;
    const pts = this.pts(f), [px, py, pz] = pick(pts), s = f.out ? 0.8 : 1.1 + f.heat * (big ? 2.2 : 1.0);
    const gr = f.out ? 0.55 : 0.18 + Math.random() * 0.12;
    this.g.puffs.push({ x: px + rr(-0.5, 0.5), y: py + 0.8, z: pz + rr(-0.5, 0.5), vy: big ? 3 : 2.2, life: big ? 3.2 : 2.2, s, c: [gr, gr, gr * 1.05] });
  }
  extinguish(f, byWater) {
    if (f.out) return;
    f.out = true; f.heat = 0;
    if (f.kind === 'car') f.car.burnt = true;
    if (byWater) {
      this.g.hud.bubble(t('fireOut'), [f.x, (f.h || 2) + 2, f.z]);
      if (f.playerWater) this.g.missions.reward(CFG.fire.reward, t('fireOutReward'));
    }
  }
  explode(f) {
    const g = this.g, car = f.car, F = CFG.fire;
    car.burnt = true; car.hp = -50; f.t = 0; f.life = F.wreckBurn; f.heat = 0.6;
    if (g.inCar === car) g.exitCar(true);
    sfx.boom();
    g.hud.bubble(t('boom'), [car.x, 3.4, car.z], 'pow');
    const P = g.playerPos(), d = Math.hypot(P.x - car.x, P.z - car.z);
    if (d < 45) g.feedback(d < 15 ? 'large' : 'medium');
    for (let i = 0; i < 14; i++) {
      const a = rr(0, 6.28), sp = rr(2, 6);
      g.puffs.push({ x: car.x + Math.cos(a), y: rr(0.5, 2.5), z: car.z + Math.sin(a), vy: rr(2, 5), life: rr(0.5, 0.9), s: rr(1.2, 2), c: pick(FLAME), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp });
    }
    car.vx = (car.vx || 0) + rr(-2, 2); car.vz = (car.vz || 0) + rr(-2, 2);
    // cartoon blast: people nearby fly and see stars; the player is knocked down
    for (const c of g.chars) {
      if (c.hidden || c.state === 'fly' || c.state === 'down') continue;
      const dx = c.x - car.x, dz = c.z - car.z, L = Math.hypot(dx, dz);
      if (L > F.blast) continue;
      if (c === g.player) { c.vx += dx / (L || 1) * 9; c.vz += dz / (L || 1) * 9; c.hp -= F.blastDmg; c.state = 'down'; c.timer = 1.6; c.hurtT = 3; c.regenT = CFG.player.regenDelay; if (c.hp <= 0) g.playerKO(false); continue; }
      c.state = 'fly'; c.vy = 6; c.vx = dx / (L || 1) * 7; c.vz = dz / (L || 1) * 7; c.y = 0.1; c.path = null;
    }
    // chain reaction: cars parked right next to it catch fire
    for (const o of g.cars) if (o !== car && !o.fire && !o.bus && Math.hypot(o.x - car.x, o.z - car.z) < F.chain && Math.random() < 0.6) this.igniteCar(o);
  }

  // ------------------------------------------------------------------ fire trucks
  dispatch(f) {
    const g = this.g, F = CFG.fire;
    if (g.cars.filter((c) => c.type === 'fire' && c.task).length >= F.maxTrucks) return;
    // from the nearest fire station if it is close enough, else from a road just out of view
    let from = null;
    const st = this.stations.map((s) => [Math.hypot(s[0] - f.x, s[1] - f.z), s]).sort((a, b) => a[0] - b[0])[0];
    if (st && st[0] < F.stationReach) from = g.w.nearestEdge(st[1][0], st[1][1], 60);
    for (let i = 0; !from && i < 24; i++) {
      const a = rr(0, 6.28), d = rr(110, 170), ne = g.w.nearestEdge(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, 25);
      if (!ne || ne.e.cls > 3 || ne.e.len < 10) continue;
      const q = g.w.edgePoint(ne.e, ne.e.cum[ne.k], 1, 0);
      if (!g.onScreen(q.x, q.z, 0.2)) from = ne;
    }
    if (!from) return;
    const e = from.e, s = e.cum[from.k] + from.t * (e.cum[from.k + 1] - e.cum[from.k]), p = g.w.edgePoint(e, s, 1, laneOff(e));
    if (g.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 6)) return;
    const tk = g.makeCar('fire', p.x, p.z, Math.atan2(p.dx, p.dz), { driver: 'npc', col: '#dc2626' });
    tk.task = f; tk.crew = 2; tk.routeT = 0; f.truck = tk;
  }
  updateTrucks(dt) {
    const g = this.g;
    let siren = 0;
    const P = g.playerPos();
    for (const tk of g.cars) {
      if (tk.type !== 'fire' || tk === g.inCar) continue;
      if (tk.task) siren = Math.max(siren, 1 - Math.hypot(tk.x - P.x, tk.z - P.z) / 170);
      if (!tk.task || tk.ai) continue;
      const f = tk.task;
      if (f.out && !tk.crewOut) { this.leave(tk); continue; }
      if (tk.crewOut) { g.carPhysics(tk, 0, 0, true, dt); continue; }
      // drive there along the road graph (like a police car), stop short of the fire
      const d = Math.hypot(f.x - tk.x, f.z - tk.z), stopAt = f.kind === 'bld' ? 16 : 12;
      let ax = f.x, az = f.z;
      tk.routeT -= dt;
      if (d > 35) {
        if (tk.routeT <= 0 || !tk.route) {
          tk.routeT = 3;
          const a = g.w.nearestNode(tk.x, tk.z), b = g.w.nearestNode(f.x, f.z);
          const path = a >= 0 && b >= 0 ? g.w.path(a, b) : null;
          tk.route = path ? path.map((s) => s.node) : null; tk.routeI = 0;
        }
        if (tk.route && tk.route.length) {
          let n = g.w.nodes[tk.route[tk.routeI]];
          if (Math.hypot(n[0] - tk.x, n[1] - tk.z) < 10 && tk.routeI < tk.route.length - 1) { tk.routeI++; n = g.w.nodes[tk.route[tk.routeI]]; }
          ax = n[0]; az = n[1];
        }
      }
      if (d < stopAt) {
        g.carPhysics(tk, 0, 0, true, dt);
        if (Math.abs(tk.speed) < 1.5) this.crewOut(tk);
        continue;
      }
      const da = angDiff(tk.a, Math.atan2(ax - tk.x, az - tk.z));
      let thr = Math.abs(da) > 1.6 ? 0.35 : d < 30 ? 0.45 : 0.85;
      let st = clamp(da * 2, -1, 1);
      if (tk.revT > 0) { tk.revT -= dt; thr = -1; st = -st; }
      else if (Math.abs(tk.speed) < 0.8) { tk.stuckT += dt; if (tk.stuckT > 1.6) { tk.revT = 1.1; tk.stuckT = 0; } } else tk.stuckT = 0;
      g.carPhysics(tk, thr, st, false, dt);
      if (tk.honkT <= 0 && d < 60) { tk.honkT = 4; g.bubble('fireTruck', tk, 4); } else tk.honkT -= dt;
    }
    sfx.fireSirenUpdate(Math.max(0, siren));
  }
  crewOut(tk) {
    const g = this.g;
    tk.crewOut = [];
    for (let i = 0; i < tk.crew; i++) {
      const s = g.carSide(tk, i ? -2.2 : 2.2);
      const c = g.makeChar('fireman', s[0], s[1], { shirt: '#f59e0b', pants: '#1f2937', cap: '#dc2626', hair: '#2b2320' }, { temper: 'timid', state: 'hose', truck: tk, fire: tk.task, side: i ? -1 : 1 });
      tk.crewOut.push(c);
    }
    tk.crew = 0;
  }
  updateCrews(dt) {
    const g = this.g, F = CFG.fire;
    for (const c of g.chars) {
      if (c.kind !== 'fireman' || c.state === 'down' || c.state === 'fly') continue;
      const tk = c.truck, f = c.fire;
      if (c.state === 'flee' || c.state === 'wander' || c.state === 'walk') { if (c.timer < 1) c.state = 'hose'; continue; }
      if (c.state === 'hose' && f && !f.out && tk && !tk.dead) {
        // stand ~6 m off the nearest flame (fanned out a little) and spray at it
        const pts = this.pts(f);
        let best = pts[0], bd = 1e9;
        for (const q of pts) { const d = Math.hypot(q[0] - c.x, q[2] - c.z); if (d < bd) { bd = d; best = q; } }
        const want = f.kind === 'bld' ? 7 : 5.5;
        if (bd > want + 0.8) { this.g.stepToward(c, best[0], best[2], 4.2, dt); c.speed = 4.2; }
        else {
          c.speed = 0; c.face += angDiff(c.face, Math.atan2(best[0] - c.x, best[2] - c.z)) * Math.min(1, 8 * dt);
          c.punchT = 0.1; // arms forward: holding the hose
          this.spray(c.x, c.z, best[0] - c.x, best[2] - c.z, want + 6, F.hosePower, dt, 1.4);
          if (Math.random() < dt * 0.15) g.bubble('hose', c);
        }
        continue;
      }
      // fire out (or no truck): back to the truck and in
      c.state = 'back';
      if (!tk || tk.dead || g.inCar === tk) { c.kind = 'ped'; c.state = 'wander'; c.timer = 20; continue; }
      const L = this.g.stepToward(c, tk.x, tk.z, 4.2, dt); c.speed = 4.2;
      if (L < 2.6) { c.hidden = true; c.gone = true; tk.crew++; }
    }
    if (g.chars.some((c) => c.gone)) g.chars = g.chars.filter((c) => !c.gone);
    for (const tk of g.cars) if (tk.type === 'fire' && tk.crewOut && tk.crewOut.every((c) => c.gone || c.kind !== 'fireman')) { tk.crewOut = null; this.leave(tk); }
  }
  // back into normal traffic (it despawns once out of range)
  leave(tk) {
    const g = this.g;
    tk.task = null; tk.crewOut = null;
    const ne = g.w.nearestEdge(tk.x, tk.z, 40);
    if (!ne) return;
    const dir = Math.abs(angDiff(tk.a, Math.atan2(ne.e.pts[ne.k + 1][0] - ne.e.pts[ne.k][0], ne.e.pts[ne.k + 1][1] - ne.e.pts[ne.k][1]))) < 1.57 || ne.e.oneway ? 1 : -1;
    const s0 = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
    tk.ai = { path: g.startPath(ne.e, dir > 0 ? s0 : ne.e.len - s0, dir), off: laneOff(ne.e) };
    tk.stopT = 0;
  }

  // ------------------------------------------------------------------ draw
  draw() {
    const g = this.g, B = g.B, P = g.playerPos(), R = 150, tm = g.time;
    for (const f of this.list) {
      if (f.out || Math.abs(f.x - P.x) > R || Math.abs(f.z - P.z) > R) continue;
      const k = Math.min(1, 0.35 + f.heat * 0.75);
      for (const [px, py, pz, r] of this.pts(f)) {
        for (let i = 0; i < 4; i++) {
          const ph = tm * (7 + i * 1.7) + f.id * 3 + px;
          const h = (i * 0.45 + ((tm * 1.6 + i * 0.37 + f.id) % 1) * 0.9) * r * k * 0.8;
          const s = r * k * (1 - i * 0.18) * (0.85 + 0.2 * Math.sin(ph));
          g.put(B.flame, M.chain(M.T(px + Math.sin(ph) * 0.25 * r, py + h, pz + Math.cos(ph * 1.3) * 0.25 * r), M.RY(ph), M.S(s, s * 1.5, s)), FLAME[Math.min(2, i)]);
        }
      }
    }
    for (const w of this.water) g.put(B.water, M.chain(M.T(w.x, w.y, w.z), M.S(0.9 + (1.2 - w.life) * 0.8)), [0.62, 0.84, 1]);
  }
}

// lazily read the shared input object (avoids an import cycle in the headless tests)
let _input = null;
export function bindInput(i) { _input = i; }
const input = () => _input || {};

function centroid(P) { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; }
function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; }
