// World: pure data + queries built from maps/markham.json (no DOM, no three.js, unit-testable).
// Coordinates: x east, z south, metres at game scale. Heading h: forward = (sin h, cos h).
import { CFG } from './config.js';
import { segDist, pointInPoly, segHit } from './util.js';

const GC = 16;          // collision grid cell (m)
const EC = 40;          // edge grid cell (m)
const key = (i, j) => (i + 2048) * 4096 + (j + 2048);

export class World {
  constructor(map) {
    this.map = map;
    this.half = map.half;
    this.names = map.names;
    this.buildGraph();
    this.buildColliders();
    this.buildSignals();
  }

  // ------------------------------------------------------------ road graph
  buildGraph() {
    const m = this.map;
    this.nodes = m.nodes;
    this.edges = m.edges.map((e, i) => {
      const pts = e[6], cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      return { i, a: e[0], b: e[1], cls: e[2], w: e[3], oneway: e[4], name: e[5], pts, cum, len: cum[cum.length - 1] };
    });
    this.adj = this.nodes.map(() => []);
    for (const e of this.edges) { this.adj[e.a].push({ e: e.i, dir: 1 }); this.adj[e.b].push({ e: e.i, dir: -1 }); }
    this.eg = new Map();
    for (const e of this.edges)
      for (let k = 0; k < e.pts.length - 1; k++) {
        const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1], pad = e.w / 2 + 3;
        for (let i = Math.floor((Math.min(ax, bx) - pad) / EC); i <= Math.floor((Math.max(ax, bx) + pad) / EC); i++)
          for (let j = Math.floor((Math.min(az, bz) - pad) / EC); j <= Math.floor((Math.max(az, bz) + pad) / EC); j++) {
            const kk = key(i, j);
            let L = this.eg.get(kk); if (!L) this.eg.set(kk, L = []);
            L.push(e.i, k);
          }
      }
  }
  // lateral offset (right of travel) of the driving lane
  laneOff(e) { return e.oneway && e.w < 8 ? 0 : e.w / 4; }
  // point at distance s along the edge in travel direction dir, off metres to the right of travel
  edgePoint(e, s, dir, off = 0) {
    const pts = e.pts, cum = e.cum;
    let d = dir > 0 ? s : e.len - s;
    d = d < 0 ? 0 : d > e.len ? e.len : d;
    let k = 0;
    while (k < cum.length - 2 && cum[k + 1] < d) k++;
    const seg = cum[k + 1] - cum[k] || 1, t = (d - cum[k]) / seg;
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    let dx = (bx - ax) / seg, dz = (bz - az) / seg;
    if (dir < 0) { dx = -dx; dz = -dz; }
    // right of travel in a z-south frame: (-dz, dx)
    return { x: ax + (bx - ax) * t - dz * off, z: az + (bz - az) * t + dx * off, dx, dz };
  }
  nearestEdge(x, z, maxD = 30) {
    let best = null;
    for (let i = Math.floor((x - maxD) / EC); i <= Math.floor((x + maxD) / EC); i++)
      for (let j = Math.floor((z - maxD) / EC); j <= Math.floor((z + maxD) / EC); j++) {
        const L = this.eg.get(key(i, j));
        if (!L) continue;
        for (let q = 0; q < L.length; q += 2) {
          const e = this.edges[L[q]], k = L[q + 1];
          const r = segDist(x, z, e.pts[k][0], e.pts[k][1], e.pts[k + 1][0], e.pts[k + 1][1]);
          const d = r.d - e.w / 2;
          if (d < maxD && (!best || d < best.d)) best = { e, k, d, raw: r.d, t: r.t, s: e.cum[k] + r.t * (e.cum[k + 1] - e.cum[k]) };
        }
      }
    return best;
  }
  onRoad(x, z, pad = 0) { const n = this.nearestEdge(x, z, pad + 1); return !!n && n.d <= pad; }
  endNode(e, dir) { return dir > 0 ? e.b : e.a; }
  // choices for leaving node n when arriving on edge `from` (cars obey one-ways; no U-turn unless dead end)
  exits(n, from, car = true) {
    const out = [];
    for (const a of this.adj[n]) {
      if (a.e === from) continue;
      const e = this.edges[a.e];
      if (car && e.oneway && a.dir < 0) continue;
      out.push(a);
    }
    if (!out.length) for (const a of this.adj[n]) { const e = this.edges[a.e]; if (!(car && e.oneway && a.dir < 0)) out.push(a); }
    return out;
  }
  // "Hwy 7 · Kennedy Rd" for the HUD
  roadName(x, z) {
    const n = this.nearestEdge(x, z, 40);
    if (!n) return '';
    const name = this.names[n.e.name] || '';
    let cross = '';
    for (const nid of [n.e.a, n.e.b]) {
      const p = this.nodes[nid];
      if (Math.hypot(p[0] - x, p[1] - z) > 34) continue;
      for (const a of this.adj[nid]) { const o = this.names[this.edges[a.e].name]; if (o && o !== name) { cross = o; break; } }
      if (cross) break;
    }
    return cross && name ? name + ' · ' + cross : name || cross;
  }
  // random spot on the road network with rmin <= distance <= rmax from (x, z)
  randomRoadSpot(rng, x, z, rmin, rmax, filter) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rng() * Math.PI * 2, r = rmin + (rmax - rmin) * rng();
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Math.abs(px) > this.half[0] - 20 || Math.abs(pz) > this.half[1] - 20) continue;
      const n = this.nearestEdge(px, pz, 45);
      if (!n || (filter && !filter(n.e))) continue;
      const p = this.edgePoint(n.e, n.s, 1);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < rmin || d > rmax + 30) continue;
      return { e: n.e, s: n.s, x: p.x, z: p.z };
    }
    return null;
  }

  // random parking spot in a lot with rmin <= distance <= rmax
  randomLotSpot(rng, x, z, rmin, rmax) {
    for (let tries = 0; tries < 12; tries++) {
      const l = this.lots[Math.floor(rng() * this.lots.length)];
      if (Math.abs(l.x - x) > rmax + 60 || Math.abs(l.z - z) > rmax + 60) continue;
      const t = l.t[Math.floor(rng() * l.t.length)], a = l.p[t[0]], b = l.p[t[1]], c = l.p[t[2]];
      let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const px = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, pz = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
      const d = Math.hypot(px - x, pz - z);
      if (d < rmin || d > rmax || this.resolve(px, pz, 2.6).hit || this.onRoad(px, pz, 3)) continue;
      return { x: px, z: pz, h: Math.floor(rng() * 4) * Math.PI / 2 };
    }
    return null;
  }

  // ------------------------------------------------------------ collision
  buildColliders() {
    const m = this.map;
    this.cols = [];
    this.cg = new Map();
    const add = (c) => {
      c.id = this.cols.length; this.cols.push(c);
      const bb = c.bb;
      for (let i = Math.floor(bb[0] / GC); i <= Math.floor(bb[2] / GC); i++)
        for (let j = Math.floor(bb[1] / GC); j <= Math.floor(bb[3] / GC); j++) {
          const kk = key(i, j);
          let L = this.cg.get(kk); if (!L) this.cg.set(kk, L = []);
          L.push(c);
        }
      return c;
    };
    const polyBB = (p) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of p) { if (x < x0) x0 = x; if (z < z0) z0 = z; if (x > x1) x1 = x; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };
    this.addPoly = (p, kind, h, extra) => add({ kind, p, h, bb: polyBB(p), ...extra });
    this.bcol = [];
    m.buildings.forEach((b, i) => { if (b.k !== 'roof') this.bcol[i] = this.addPoly(b.p, 'b', b.h, { bi: i }); });
    for (const h of m.houses) this.addPoly(World.rect(h[0], h[1], h[2], h[3], h[4]), 'h', h[5] + 1.5);
    for (const h of m.heritage) this.addPoly(World.rect(h[0], h[1], h[2], h[3], h[4]), 'h', h[5]);
    for (const t of m.trees) add({ kind: 't', x: t[0], z: t[1], r: 0.45, bb: [t[0] - 0.45, t[1] - 0.45, t[0] + 0.45, t[1] + 0.45] });
    this.water = m.water.map((w) => ({ p: w.p, bb: polyBB(w.p) }));
    for (const lm of m.landmarks) if (lm.t === 'pool') this.water.push({ p: lm.p, bb: polyBB(lm.p) });
    // parking lots (parked cars spawn here): centroid + triangles
    this.lots = m.lots.map((l) => { let x = 0, z = 0; for (const q of l.p) { x += q[0] / l.p.length; z += q[1] / l.p.length; } return { p: l.p, t: l.t, x, z }; }).filter((l) => l.t.length);
    this.rivers = m.rivers.map(([big, pts]) => { const w = big ? 9 : 3.5, bb = polyBB(pts); return { w, pts, bb: [bb[0] - w, bb[1] - w, bb[2] + w, bb[3] + w] }; });
  }
  // rectangle corners for a house: centre, angle, full width / depth
  static rect(x, z, a, w, d) {
    const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
    const f = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    return [f(-hw, -hd), f(hw, -hd), f(hw, hd), f(-hw, hd)];
  }
  // push a circle out of buildings / houses / trees; returns {x, z, hit, nx, nz}
  resolve(x, z, r, trees = true) {
    let hit = false, nx = 0, nz = 0;
    for (let it = 0; it < 2; it++) {
      let moved = false;
      const i0 = Math.floor((x - r) / GC), i1 = Math.floor((x + r) / GC), j0 = Math.floor((z - r) / GC), j1 = Math.floor((z + r) / GC);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const L = this.cg.get(key(i, j));
        if (!L) continue;
        for (const c of L) {
          const bb = c.bb;
          if (x + r < bb[0] || x - r > bb[2] || z + r < bb[1] || z - r > bb[3]) continue;
          if (c.kind === 't') {
            if (!trees) continue;
            const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), rr = r + c.r;
            if (d < rr && d > 1e-6) { x = c.x + dx / d * rr; z = c.z + dz / d * rr; hit = moved = true; nx = dx / d; nz = dz / d; }
            continue;
          }
          const p = c.p;
          let bd = 1e9, bx = 0, bz = 0;
          for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
            const s = segDist(x, z, p[b][0], p[b][1], p[a][0], p[a][1]);
            if (s.d < bd) { bd = s.d; bx = s.cx; bz = s.cz; }
          }
          const inside = pointInPoly(x, z, p);
          if (!inside && bd >= r) continue;
          let dx = x - bx, dz = z - bz, d = Math.hypot(dx, dz);
          if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
          dx /= d; dz /= d;
          if (inside) { x = bx - dx * (r + 0.01); z = bz - dz * (r + 0.01); nx = -dx; nz = -dz; }
          else { x = bx + dx * r; z = bz + dz * r; nx = dx; nz = dz; }
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit, nx, nz };
  }
  inWater(x, z) {
    for (const w of this.water) { const b = w.bb; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (pointInPoly(x, z, w.p)) return true; }
    for (const rv of this.rivers) {
      const b = rv.bb; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      for (let k = 0; k < rv.pts.length - 1; k++) if (segDist(x, z, rv.pts[k][0], rv.pts[k][1], rv.pts[k + 1][0], rv.pts[k + 1][1]).d < rv.w / 2) return true;
    }
    return false;
  }
  // can something stand here? (dry or on a bridge, inside the map)
  walkable(x, z) {
    if (Math.abs(x) > this.half[0] - 4 || Math.abs(z) > this.half[1] - 4) return false;
    return !this.inWater(x, z) || this.onRoad(x, z, 2.5);
  }
  // colliders (buildings / houses) whose bounding box touches the segment's cells
  near(ax, az, bx, bz, out = []) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (GC * 0.7)));
    const seen = this._seen || (this._seen = new Set());
    seen.clear(); out.length = 0;
    for (let q = 0; q <= n; q++) {
      const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n;
      const L = this.cg.get(key(Math.floor(x / GC), Math.floor(z / GC)));
      if (!L) continue;
      for (const c of L) if (c.kind !== 't' && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
    return out;
  }
  // first collider crossed by a-b: {c, t} or null
  rayHit(ax, az, bx, bz, minH = 0) {
    let best = null;
    for (const c of this.near(ax, az, bx, bz, this._tmp || (this._tmp = []))) {
      if (c.h < minH) continue;
      const p = c.p;
      for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        const t = segHit(ax, az, bx, bz, p[b][0], p[b][1], p[a][0], p[a][1]);
        if (t >= 0 && (!best || t < best.t)) best = { c, t };
      }
    }
    return best;
  }
  los(ax, az, bx, bz) { return !this.rayHit(ax, az, bx, bz); }

  // ------------------------------------------------------------ traffic signals
  buildSignals() {
    const S = CFG.signals;
    const isSig = this.nodes.map((_, n) => {
      const inc = this.adj[n];
      if (inc.length < 3) return false;
      const names = new Set();
      for (const a of inc) { const e = this.edges[a.e]; if (e.cls <= 2 && e.w >= 8) names.add(e.name); }
      return names.size >= 2;
    });
    // union nodes closer than S.cluster (divided roads make several junction nodes per intersection)
    const parent = this.nodes.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const ids = []; isSig.forEach((v, i) => v && ids.push(i));
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const p = this.nodes[ids[a]], q = this.nodes[ids[b]];
      if (Math.abs(p[0] - q[0]) < S.cluster && Math.hypot(p[0] - q[0], p[1] - q[1]) < S.cluster) parent[find(ids[a])] = find(ids[b]);
    }
    this.sigOf = new Int32Array(this.nodes.length).fill(-1);
    this.signals = [];
    const byRoot = new Map();
    for (const n of ids) {
      const r = find(n);
      let sg = byRoot.get(r);
      if (!sg) { sg = { id: this.signals.length, nodes: [], x: 0, z: 0, rad: 0, offset: 0, approaches: [] }; byRoot.set(r, sg); this.signals.push(sg); }
      sg.nodes.push(n); this.sigOf[n] = sg.id;
    }
    const cycle = 2 * (S.green + S.yellow + S.allRed);
    for (const sg of this.signals) {
      for (const n of sg.nodes) { sg.x += this.nodes[n][0] / sg.nodes.length; sg.z += this.nodes[n][1] / sg.nodes.length; }
      sg.offset = (sg.id * 0.618034 % 1) * cycle;
      let maxW = 6;
      for (const n of sg.nodes) for (const a of this.adj[n]) {
        const e = this.edges[a.e], other = a.dir > 0 ? e.b : e.a;
        if (e.w > maxW) maxW = e.w;
        if (this.sigOf[other] === sg.id) continue;          // internal link of a divided junction
        if (e.oneway && a.dir > 0) continue;                // one-way leaving the junction: no approach
        // travel direction into the node is the reverse of a.dir
        const dir = -a.dir, p = this.edgePoint(e, e.len, dir);
        sg.approaches.push({ e: e.i, dir, axis: Math.abs(p.dx) >= Math.abs(p.dz) ? 0 : 1, node: n });
      }
      sg.rad = 0;
      for (const n of sg.nodes) sg.rad = Math.max(sg.rad, Math.hypot(this.nodes[n][0] - sg.x, this.nodes[n][1] - sg.z));
      sg.half = maxW / 2 + 3.2;   // stop line distance from the approach's own node
      if (new Set(sg.approaches.map((a) => a.axis)).size < 2) sg.dead = true;
    }
    this.cycle = cycle;
  }
  // light for one axis at time t: 'g' | 'y' | 'r'
  light(sg, axis, t) {
    const S = CFG.signals, ph = S.green + S.yellow + S.allRed;
    let u = (t + sg.offset) % this.cycle;
    if (axis === 1) u = (u + ph) % this.cycle;
    return u < S.green ? 'g' : u < S.green + S.yellow ? 'y' : 'r';
  }
  // signal faced when travelling along edge e in direction dir (entering from outside), or null
  signalFor(e, dir) {
    const end = dir > 0 ? e.b : e.a, start = dir > 0 ? e.a : e.b, id = this.sigOf[end];
    if (id < 0 || this.sigOf[start] === id) return null;
    const sg = this.signals[id];
    if (sg.dead) return null;
    const p = this.edgePoint(e, e.len, dir);
    return { sg, axis: Math.abs(p.dx) >= Math.abs(p.dz) ? 0 : 1 };
  }
}
