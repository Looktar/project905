// Missions (v0.3, D-69): small jobs on the street, no story. Walk or drive into a glowing ring:
//   delivery  pick up food at a restaurant / Tim Hortz, bring it to a named place before the timer runs out
//   taxi      in a taxi: a waving passenger appears; drive them to a named place
//   race      in any car: start ring at three spots, checkpoints along the roads, beat the clock
//   landmark  check in at Markham's landmarks (saved per viewer)
// Money is only a score (shown top-left, saved in this browser). Busted: the job fails and a fine.
import { M, pick } from './math.js';
import { CFG } from './config.js';
import * as sfx from './audio.js';
import { t, getLang } from './i18n.js';

const KEY = 'p905.missions.v1';
const COL = { delivery: [1, 0.8, 0.1], taxi: [0.3, 0.85, 0.35], race: [0.15, 0.85, 1], landmark: [0.68, 0.33, 0.97], target: [1, 0.45, 0.1] };
export const LANDMARKS = {
  pacific: ['大古广场 Pacifick Mall', 'Pacifick Mall'], markville: ['Markvile Mall', 'Markvile Mall'],
  civic: ['万锦市政厅', 'Civic Centre'], unionville: ['Unionville 老街', 'Old Unionville'],
  cinema: ['Downtown 影城', 'Downtown Cinema'], downtown: ['Downtown Markham', 'Downtown Markham'], pool: ['Toogood 湖', 'Toogood Pond'],
};

export class Missions {
  constructor(game) {
    this.g = game; this.active = null; this.offers = []; this.offerT = 0; this.routeT = 0; this.route = null; this.taxiT = 0;
    this.save = load();
    const W = game.w, m = W.map;
    // check-in spots
    this.landmarks = [];
    for (const lm of m.landmarks) {
      const nm = LANDMARKS[lm.t];
      if (!nm || this.landmarks.some((l) => l.id === lm.t)) continue;
      const [x, z] = lm.p ? centroid(lm.p) : [lm.x, lm.z];
      this.landmarks.push({ id: lm.t, x, z, r: Math.max(14, (lm.r || 10) + 10), nm });
    }
    // places a delivery / fare can go to: landmarks + every named building
    this.places = this.landmarks.map((l) => ({ x: l.x, z: l.z, label: l.nm }));
    for (const b of m.buildings) if (b.n && b.poi !== 'school') { const [x, z] = centroid(b.p); this.places.push({ x, z, label: [b.n, b.n] }); }
    // pick-up counters: restaurants / bubble tea / Tim Hortz
    this.shops = [];
    for (const s of m.stores || []) if (s[6] === 'food' || s[6] === 'tea') this.shops.push({ x: s[0], z: s[1], label: [s[4], s[4]] });
    for (const lm of m.landmarks) if (lm.t === 'tims') this.shops.push({ x: lm.x, z: lm.z, label: ['Tim Hortz', 'Tim Hortz'] });
    // races: three start spots, each to a landmark ~1 km away
    const L = (id) => this.landmarks.find((l) => l.id === id);
    const sp = { x: m.spawn[0], z: m.spawn[1], nm: ['Kennedy × Hwy 7 路口', 'Kennedy & Hwy 7'] };
    this.races = [[sp, L('markville')], [L('pacific'), sp], [L('civic'), L('unionville')]]
      .filter(([a, b]) => a && b).map(([a, b], i) => ({ id: 'r' + i, from: this.roadSpot(a.x, a.z, 0), to: b }));
    this.hud();
  }

  // ------------------------------------------------------------------ helpers
  label(l) { return l[getLang() === 'zh' ? 0 : 1]; }
  // a reachable point for a place: the sidewalk (or road centre) nearest to it
  roadSpot(x, z, side = 1) {
    const ne = this.g.w.nearestEdge(x, z, 80);
    if (!ne) return { x, z };
    const s = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
    const p = this.g.w.edgePoint(ne.e, s, 1, 0);
    if (!side) return { x: p.x, z: p.z };
    // the curb on the side of the place
    const q = this.g.w.edgePoint(ne.e, s, 1, ne.e.w / 2 + 1.8), r = this.g.w.edgePoint(ne.e, s, 1, -(ne.e.w / 2 + 1.8));
    return Math.hypot(q.x - x, q.z - z) < Math.hypot(r.x - x, r.z - z) ? { x: q.x, z: q.z } : { x: r.x, z: r.z };
  }
  routeLen(a, b) {
    const W = this.g.w, na = W.nearestNode(a.x, a.z), nb = W.nearestNode(b.x, b.z);
    const p = na >= 0 && nb >= 0 ? W.path(na, nb) : null;
    if (!p) return null;
    let L = 0, prev = W.nodes[na];
    const nodes = [na];
    for (const s of p) { const n = W.nodes[s.node]; L += Math.hypot(n[0] - prev[0], n[1] - prev[1]); prev = n; nodes.push(s.node); }
    return { L, nodes };
  }
  // a named place [min, max] m (by road) from here
  pickPlace(from, min, max) {
    const cand = this.places.filter((p) => { const d = Math.hypot(p.x - from.x, p.z - from.z); return d > min * 0.7 && d < max; });
    for (let i = 0; i < 12 && cand.length; i++) {
      const p = pick(cand), spot = this.roadSpot(p.x, p.z), r = this.routeLen(from, spot);
      if (r && r.L > min && r.L < max * 1.4) return { ...spot, label: p.label, len: r.L };
    }
    return null;
  }
  reward(amount, why) {
    amount = Math.round(amount);
    this.save.money += amount; store(this.save);
    this.g.hud.banner(`+$${amount} ${why}`, 'green');
    sfx.cash();
    this.hud();
  }
  fail(why) {
    if (this.active && this.active.passenger) this.dropPassenger(false);
    this.active = null; this.route = null;
    this.g.hud.banner(why, 'red');
    this.hud();
  }
  onBusted() {
    if (this.active) this.fail(t('mFailBusted'));
    const fine = Math.round(this.save.money * CFG.missions.bustFine);
    if (fine > 0) { this.save.money -= fine; store(this.save); this.hud(); }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.g, P = g.playerPos(), MC = CFG.missions;
    const inCar = g.inCar, near = (o, r) => Math.hypot(o.x - P.x, o.z - P.z) < r;
    // landmarks: check in by walking / driving past
    for (const l of this.landmarks) if (!this.save.visited.includes(l.id) && near(l, l.r)) {
      this.save.visited.push(l.id); store(this.save);
      this.reward(MC.landmark, `${t('mCheckin')} ${this.label(l.nm)} (${this.save.visited.length}/${this.landmarks.length})`);
    }
    const A = this.active;
    if (!A) {
      this.offerT -= dt;
      if (this.offerT <= 0) { this.offerT = 2; this.refreshOffers(); }
      if (g.busted > 0) return;
      // a race starts only when you stop in its ring (it sits on a busy junction)
      for (const o of this.offers) if (near(o, o.r) && (o.type !== 'race' || !inCar || Math.abs(inCar.speed) < 4)) { this.start(o); break; }
      this.hud();
      return;
    }
    A.timer -= dt;
    if (A.timer <= 0) { this.fail(A.type === 'delivery' ? t('mFailCold') : A.type === 'taxi' ? t('mFailFare') : t('mFailSlow')); return; }
    if ((A.type === 'race' || A.type === 'taxi') && !inCar) { this.fail(A.type === 'race' ? t('mFailCar') : t('mFailFare')); return; }
    if (A.type === 'taxi' && inCar.type !== 'taxi') { this.fail(t('mFailFare')); return; }
    const tg = A.target, slow = !inCar || Math.abs(inCar.speed) < 3;
    if (A.type === 'taxi' && A.stage === 'pickup') {
      const c = A.ped;
      if (!c || !g.chars.includes(c) || c.state === 'down' || c.state === 'fly') { this.fail(t('mFailFare')); return; }
      tg.x = c.x; tg.z = c.z;
      if (near(c, 7) && slow) {
        c.gone = true; g.chars = g.chars.filter((o) => o !== c);
        A.passenger = { shirt: c.shirt }; A.stage = 'ride';
        const dest = this.pickPlace(P, MC.taxiMin, MC.taxiMax);
        if (!dest) { this.fail(t('mFailFare')); return; }
        A.target = { ...dest, r: 8 }; A.timer = dest.len / MC.taxiPace + MC.slack; A.len = dest.len;
        g.bubble('mGetIn', inCar, 3.4); this.routeT = 0;
      }
    } else if (A.type === 'race') {
      if (near(tg, tg.r)) {
        sfx.ding();
        A.cp++;
        if (A.cp >= A.cps.length) {
          const time = A.limit - A.timer, best = this.save.best[A.id];
          if (!best || time < best) { this.save.best[A.id] = Math.round(time * 10) / 10; store(this.save); }
          this.active = null; this.route = null;
          this.reward(MC.raceBase + A.timer * MC.raceBonus, `${t('mRaceDone')} ${fmt(time)}${!best || time < best ? ' · ' + t('mRecord') : ''}`);
          return;
        }
        A.target = A.cps[A.cp]; this.routeT = 0;
      }
    } else if (near(tg, tg.r) && slow) {
      // delivery / taxi drop-off
      const fast = A.timer / A.limit;
      if (A.type === 'taxi') this.dropPassenger(true);
      this.active = null; this.route = null;
      const base = A.type === 'taxi' ? MC.taxiBase + A.len * MC.taxiPerM : MC.deliveryBase + A.len * MC.deliveryPerM;
      this.reward(base * (1 + fast), A.type === 'taxi' ? t('mFareDone') : t('mDelivered'));
      return;
    }
    // route on the minimap
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 1.5;
      const r = this.routeLen(P, this.active.target);
      this.route = r ? r.nodes.map((n) => g.w.nodes[n]) : null;
    }
    this.hud();
  }
  refreshOffers() {
    const g = this.g, P = g.playerPos(), MC = CFG.missions, out = [];
    // two nearest restaurants with take-out
    const shops = this.shops.map((s) => [Math.hypot(s.x - P.x, s.z - P.z), s]).filter(([d]) => d > 15 && d < MC.offerReach).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [, s] of shops) { s.spot = s.spot || this.roadSpot(s.x, s.z); out.push({ type: 'delivery', ...s.spot, r: 3.2, shop: s }); }
    for (const r of this.races) if (Math.hypot(r.from.x - P.x, r.from.z - P.z) < MC.offerReach * 1.6) out.push({ type: 'race', ...r.from, r: 6, race: r });
    // taxi: a waving passenger now and then while you drive a taxi
    if (g.inCar && g.inCar.type === 'taxi') {
      this.taxiT -= 2;
      if (this.taxiT <= 0) {
        const c = g.chars.find((o) => o.kind === 'ped' && o.state === 'walk' && Math.hypot(o.x - P.x, o.z - P.z) > 25 && Math.hypot(o.x - P.x, o.z - P.z) < 110);
        if (c) { this.taxiT = 6; this.start({ type: 'taxi', ped: c }); return; }
      }
    }
    this.offers = out;
  }
  start(o) {
    const g = this.g, MC = CFG.missions;
    if (o.type === 'delivery') {
      const dest = this.pickPlace(o, MC.deliveryMin, MC.deliveryMax);
      if (!dest) return;
      this.active = { type: 'delivery', target: { ...dest, r: 4.5 }, timer: dest.len / MC.deliveryPace + MC.slack, len: dest.len, from: o.shop.label };
      this.active.limit = this.active.timer;
      g.hud.banner(`${t('mDelivery')}: ${this.label(o.shop.label)} → ${this.label(dest.label)}`, 'blue');
    } else if (o.type === 'race') {
      if (!g.inCar) { if (!this.noCarT || g.time > this.noCarT) { g.bubble('mNeedCar', g.player); this.noCarT = g.time + 4; } return; }
      const r = this.routeLen(o.race.from, o.race.to);
      if (!r) return;
      // checkpoints: route junctions every >= 110 m, the last one at the finish
      const cps = [];
      let acc = 0, prev = g.w.nodes[r.nodes[0]];
      for (const n of r.nodes.slice(1)) { const q = g.w.nodes[n]; acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; if (acc >= MC.cpGap) { cps.push({ x: q[0], z: q[1], r: 10 }); acc = 0; } }
      const end = g.w.nodes[r.nodes[r.nodes.length - 1]];
      if (!cps.length || Math.hypot(cps[cps.length - 1].x - end[0], cps[cps.length - 1].z - end[1]) > 30) cps.push({ x: end[0], z: end[1], r: 10 });
      const limit = r.L / MC.racePace + 8;
      this.active = { type: 'race', id: o.race.id, cps, cp: 0, target: cps[0], timer: limit, limit, to: o.race.to.nm };
      sfx.ding();
      g.hud.banner(`${t('mRace')} → ${this.label(o.race.to.nm)}`, 'blue');
    } else if (o.type === 'taxi') {
      const c = o.ped;
      c.state = 'hail'; c.path = null; c.timer = 60;
      this.active = { type: 'taxi', stage: 'pickup', ped: c, target: { x: c.x, z: c.z, r: 7 }, timer: MC.taxiWait, limit: MC.taxiWait, len: 0 };
      g.bubble('mTaxi', c);
      g.hud.banner(t('mTaxiCall'), 'blue');
    }
    this.offers = []; this.routeT = 0;
    if (this.active && !this.active.limit) this.active.limit = this.active.timer;
    this.hud();
  }
  dropPassenger(paid) {
    const g = this.g, A = this.active, car = g.inCar || g.playerPos();
    if (!A || !A.passenger) return;
    const s = g.carSide ? g.carSide(car, 2) : [car.x + 2, car.z];
    const c = g.makeChar2('ped', s[0], s[1]);
    c.shirt = A.passenger.shirt; c.state = 'wander'; c.timer = 8;
    g.bubble(paid ? 'mThanks' : 'mAngry', c);
    A.passenger = null;
  }

  // ------------------------------------------------------------------ HUD + draw
  hud() {
    const A = this.active, h = this.g.hud;
    h.money(this.save.money);
    if (!A) { h.mission(null); return; }
    const P = this.g.playerPos(), d = Math.round(Math.hypot(A.target.x - P.x, A.target.z - P.z));
    let title;
    if (A.type === 'delivery') title = `🍜 ${t('mDelivery')} → ${this.label(A.target.label)}`;
    else if (A.type === 'taxi') title = A.stage === 'pickup' ? `🚕 ${t('mTaxiPick')}` : `🚕 ${t('mTaxi2')} → ${this.label(A.target.label)}`;
    else title = `🏁 ${t('mRace')} ${A.cp + 1}/${A.cps.length} → ${this.label(A.to)}`;
    h.mission(title, `${d} m · ${fmt(Math.max(0, A.timer))}`, A.timer < 10);
  }
  draw() {
    const g = this.g, B = g.B, P = g.playerPos(), tm = g.time, R = 160;
    const ring = (x, z, r, col, gem = true) => {
      if (Math.abs(x - P.x) > R || Math.abs(z - P.z) > R) return;
      const pulse = 1 + Math.sin(tm * 4) * 0.06;
      g.put(B.ring, M.chain(M.T(x, 0.25, z), M.S(r / 2.6 * pulse, 1, r / 2.6 * pulse)), col);
      if (gem) g.put(B.gem, M.chain(M.T(x, 4.2 + Math.sin(tm * 2.5) * 0.4, z), M.RY(tm * 2), M.S(1, 1.5, 1)), col);
    };
    if (this.active) {
      const A = this.active, tg = A.target;
      if (!(A.type === 'taxi' && A.stage === 'pickup')) ring(tg.x, tg.z, tg.r, A.type === 'race' ? COL.race : COL.target);
      else ring(tg.x, tg.z, 2.2, COL.taxi);
      if (A.type === 'race' && A.cps[A.cp + 1]) { const n = A.cps[A.cp + 1]; ring(n.x, n.z, n.r * 0.6, [0.5, 0.6, 0.7], false); }
    } else for (const o of this.offers) ring(o.x, o.z, o.r, COL[o.type]);
    for (const l of this.landmarks) if (!this.save.visited.includes(l.id)) { const sx = l.x, sz = l.z; if (Math.abs(sx - P.x) < R && Math.abs(sz - P.z) < R) g.put(B.gem, M.chain(M.T(sx, 14 + Math.sin(tm * 2) * 0.6, sz), M.RY(tm * 1.5), M.S(1.6, 2.4, 1.6)), COL.landmark); }
  }
  // minimap overlay (called by HUD.drawMini): route, target, offers, landmarks
  mini(c, P, k, size) {
    const X = (x) => size / 2 + (x - P.x) * k, Y = (z) => size / 2 + (z - P.z) * k;
    const css = (col) => `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
    const dot = (x, z, col, r, edge = false) => {
      let px = X(x), py = Y(z);
      if (edge) { const dx = px - size / 2, dy = py - size / 2, L = Math.hypot(dx, dy), m = size / 2 - 8; if (L > m) { px = size / 2 + dx / L * m; py = size / 2 + dy / L * m; } }
      c.fillStyle = css(col); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); c.stroke();
    };
    if (this.route && this.route.length) {
      c.strokeStyle = 'rgba(249,115,22,.9)'; c.lineWidth = size * 0.025; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(size / 2, size / 2);
      for (const n of this.route) c.lineTo(X(n[0]), Y(n[1]));
      c.lineTo(X(this.active.target.x), Y(this.active.target.z)); c.stroke();
    }
    for (const l of this.landmarks) if (!this.save.visited.includes(l.id)) dot(l.x, l.z, COL.landmark, size * 0.025);
    if (this.active) dot(this.active.target.x, this.active.target.z, this.active.type === 'race' ? COL.race : COL.target, size * 0.04, true);
    else for (const o of this.offers) dot(o.x, o.z, COL[o.type], size * 0.032);
  }
}

function load() {
  const d = { money: 0, visited: [], best: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.money === 'number') return { ...d, ...s }; } catch (e) { /* private mode: start fresh */ }
  return d;
}
function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not saved: fine */ } }
function fmt(s) { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function centroid(P) { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; }
