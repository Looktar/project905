// Full-city map support (v0.5, D-71): the index of named places, a forgiving search over it,
// and the GPS waypoint (route on the minimap, a beacon in the world) + teleport.
// buildPlaces / searchPlaces / fuzzyDist are pure (unit-tested); Nav needs a Game.
import { M } from './math.js';
import * as sfx from './audio.js';
import { t, getLang } from './i18n.js';
import { LANDMARKS } from './missions.js';

const CYAN = [0.1, 0.8, 0.95];
const SHOPS = { gas: 'gas', plaza: 'mall', cc: 'mall', bigbox: 'mall', grocer: 'mall', shop: 'mall' };
// category -> [icon, zh, en]; the order is the chip order in the big map
export const CATS = {
  lm: ['⭐', '地标', 'Landmarks'], mall: ['🛍️', '商场广场', 'Malls & plazas'], tims: ['☕', 'Tim Hortz', 'Tim Hortz'],
  gas: ['⛽', '加油站', 'Gas'], food: ['🍜', '餐馆', 'Restaurants'], tea: ['🧋', '奶茶咖啡', 'Tea & coffee'],
  other: ['📍', '其他', 'Other'], street: ['🛣️', '街道', 'Streets'],
};

// every searchable place: { zh, en, x, z, cat }. Streets carry their edge ids instead of one spot
// (the closest stretch to the player is used, see spotOf)
export function buildPlaces(world) {
  const m = world.map, out = [], cen = (P) => { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; };
  const seen = new Set();
  for (const l of m.landmarks) {
    if (l.t === 'tims') { out.push({ zh: 'Tim Hortz', en: 'Tim Hortz', x: l.x, z: l.z, cat: 'tims' }); continue; }
    const nm = LANDMARKS[l.t];
    if (!nm || seen.has(l.t)) continue;
    seen.add(l.t);
    const [x, z] = l.p ? cen(l.p) : [l.x, l.z];
    out.push({ zh: nm[0], en: nm[1], x, z, cat: 'lm' });
  }
  for (const b of m.buildings) if (b.n) {
    const [x, z] = b.st || cen(b.p);
    out.push({ zh: b.n, en: b.n, x, z, cat: SHOPS[b.poi] || (b.poi === 'fast' ? 'food' : 'other') });
  }
  for (const s of m.stores || []) {
    // generic signs are "中餐 Chinese": split them; real (pun) names stay as they are
    const sp = s[4].indexOf(' '), [zh, en] = s[6] === 'gen' && sp > 0 ? [s[4].slice(0, sp), s[4].slice(sp + 1)] : [s[4], s[4]];
    out.push({ zh, en, x: s[0], z: s[1], cat: s[6] === 'tea' || s[6] === 'cafe' ? 'tea' : s[6] === 'grocer' ? 'mall' : 'food' });
  }
  const byName = new Map();
  world.edges.forEach((e, i) => { const n = world.names[e.name]; if (n) (byName.get(n) || byName.set(n, []).get(n)).push(i); });
  for (const [n, ids] of byName) out.push({ zh: n, en: n, edges: ids, cat: 'street', x: 0, z: 0 });
  for (const p of out) p.norm = norm(p.zh === p.en ? p.zh : p.zh + ' ' + p.en);
  return out;
}

// lower case, no accents, no spaces or punctuation (CJK kept)
export function norm(s) { return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, ''); }

// smallest edit distance between q and any substring of s (Sellers), so "pacific mall" finds
// "Pacifick Mall" and "costco" finds "Costgo": the town's names are puns on the real ones
export function fuzzyDist(q, s) {
  let prev = new Array(q.length + 1), cur = new Array(q.length + 1);
  for (let i = 0; i <= q.length; i++) prev[i] = i;
  let best = prev[q.length];
  for (let j = 1; j <= s.length; j++) {
    cur[0] = 0;
    for (let i = 1; i <= q.length; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (q[i - 1] === s[j - 1] ? 0 : 1));
    best = Math.min(best, cur[q.length]);
    [prev, cur] = [cur, prev];
  }
  return best;
}

// the closest stretch of a street to (x, z), or the place itself
export function spotOf(world, p, x, z) {
  if (!p.edges) return p;
  let best = null, bd = 1e18;
  for (const i of p.edges) for (const q of world.edges[i].pts) { const d = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (d < bd) { bd = d; best = q; } }
  return { ...p, x: best[0], z: best[1] };
}

// search by text and/or category; nearest first among equally good matches. Returns spots.
export function searchPlaces(world, places, q, cat, from, n = 12) {
  q = norm(q || '');
  const res = [];
  for (const p of places) {
    if (cat && p.cat !== cat) continue;
    let score = 0;
    if (q) {
      const at = p.norm.indexOf(q);
      if (at >= 0) score = at === 0 ? 0 : 0.3;
      else if (q.length >= 4) { const d = fuzzyDist(q, p.norm); if (d > Math.floor(q.length / 3)) continue; score = 3 * d / q.length; } else continue;
      if (p.cat === 'street') score += 0.5; else if (p.cat === 'lm') score -= 0.4; // "Markville": the mall before the road and the school
    }
    const s = spotOf(world, p, from.x, from.z);
    res.push({ ...s, score, d: Math.hypot(s.x - from.x, s.z - from.z) });
  }
  res.sort((a, b) => a.score - b.score || a.d - b.d);
  // the same name many times (Subwey, Tim Hortz): keep the nearest three
  const out = [], count = new Map();
  for (const r of res) { const c = count.get(r.norm) || 0; if (c >= 3) continue; count.set(r.norm, c + 1); out.push(r); if (out.length >= n) break; }
  return out;
}

export class Nav {
  constructor(game) {
    this.g = game; this.target = null; this.route = null; this.routeT = 0;
    this.places = buildPlaces(game.w);
  }
  label(p) { return getLang() === 'zh' ? p.zh : p.en; }
  set(p) {
    const spot = this.g.missions.roadSpot(p.x, p.z);
    this.target = { x: spot.x, z: spot.z, px: p.x, pz: p.z, zh: p.zh, en: p.en };
    this.routeT = 0;
    this.g.hud.banner(`${t('navTo')} ${this.label(p)}`, 'blue');
  }
  clear() { this.target = null; this.route = null; }
  // move the player (and their car) next to a place. Returns an i18n key when not allowed.
  teleport(p) {
    const g = this.g;
    if (g.busted > 0 || g.player.state === 'ko') return 'tpBusy';
    if (g.chase.active) return 'tpChase';
    if (g.missions.active) return 'tpJob';
    const car = g.inCar, s = g.missions.roadSpot(p.x, p.z, car ? 0 : 1);
    if (car) {
      const ne = g.w.nearestEdge(s.x, s.z, 10);
      if (ne) { const a = ne.e.pts[ne.k], b = ne.e.pts[ne.k + 1]; car.a = Math.atan2(b[0] - a[0], b[1] - a[1]); }
      car.x = s.x; car.z = s.z; car.speed = 0;
      g.cars = g.cars.filter((c) => c === car || Math.hypot(c.x - s.x, c.z - s.z) > 7); // nothing parked on top of us
    } else {
      const q = g.w.collide(s.x, s.z, g.player.r);
      g.player.x = q.x; g.player.z = q.z; g.player.vx = g.player.vz = 0;
    }
    g.camPos = [s.x, 0, s.z];
    g.spawnAround(true);
    if (this.target && Math.hypot(this.target.px - p.x, this.target.pz - p.z) < 1) this.clear();
    g.hud.banner(`${t('tpDone')} ${this.label(p)}`, 'green');
    return null;
  }

  update(dt) {
    const A = this.target;
    if (!A) return;
    const g = this.g, P = g.playerPos();
    if (Math.hypot(A.x - P.x, A.z - P.z) < 22 || Math.hypot(A.px - P.x, A.pz - P.z) < 22) {
      g.hud.banner(`${t('navArrive')} ${this.label(A)}`, 'green');
      sfx.ding(); this.clear(); return;
    }
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 1.5;
      const r = g.missions.routeLen(P, A);
      this.route = r ? r.nodes.map((n) => g.w.nodes[n]) : null;
    }
  }
  draw() {
    const A = this.target;
    if (!A) return;
    const g = this.g, B = g.B, tm = g.time, P = g.playerPos();
    if (Math.abs(A.x - P.x) > 200 || Math.abs(A.z - P.z) > 200) return;
    const pulse = 1 + Math.sin(tm * 4) * 0.06;
    g.put(B.ring, M.chain(M.T(A.x, 0.25, A.z), M.S(1.6 * pulse, 1, 1.6 * pulse)), CYAN);
    g.put(B.gem, M.chain(M.T(A.x, 8 + Math.sin(tm * 2.5) * 0.6, A.z), M.RY(tm * 2), M.S(1.4, 2.2, 1.4)), CYAN);
  }
  // minimap overlay (HUD.drawMini): cyan route + the target, held at the rim when far
  mini(c, P, k, size) {
    const A = this.target;
    if (!A) return;
    const X = (x) => size / 2 + (x - P.x) * k, Y = (z) => size / 2 + (z - P.z) * k;
    if (this.route && this.route.length) {
      c.strokeStyle = 'rgba(6,182,212,.9)'; c.lineWidth = size * 0.025; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(size / 2, size / 2);
      for (const n of this.route) c.lineTo(X(n[0]), Y(n[1]));
      c.lineTo(X(A.x), Y(A.z)); c.stroke();
    }
    let px = X(A.x), py = Y(A.z);
    const dx = px - size / 2, dy = py - size / 2, L = Math.hypot(dx, dy), m = size / 2 - 8;
    if (L > m) { px = size / 2 + dx / L * m; py = size / 2 + dy / L * m; }
    c.fillStyle = '#06b6d4'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, size * 0.04, 0, 7); c.fill(); c.stroke();
  }
}
