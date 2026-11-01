// World: loads the processed OSM map, builds chunked render meshes, collision
// data, the road graph and the minimap image.
import { M, hex, segDist, rnd } from './math.js';
import { MeshBuilder, MAT_A, MAT_B, MAT_V, rbox, box, sphere, ico, cyl, torus, roof, ribbon, disc, flatPoly, extrude } from './geo.js';
import { INST_FLOATS } from './renderer.js';
import { CFG } from './config.js';
import { propColliders, buildPropLandmark, buildHeritage, buildStreetProps, buildingDetail, propSign, propIcons, propPip, buswayDist } from './props.js';

const CH = 160; // chunk size (m)
const COL = {
  grass: '#9fd067', park: '#b3db6f', lot: '#cdd2dc', water: '#5fb3e6', side: '#dde1e8', road: '#5b6782',
  bus: '#b4625a', mark: '#f4f4f4', rail: '#6b4f3a', ballast: '#a59a8e', deck: '#c9ccd4', pier: '#9aa1ae',
};

export class World {
  constructor(renderer, map) {
    this.r = renderer; this.map = map;
    this.half = map.half;
    this.chunks = new Map();
    this.names = map.names;
    this.buildGraph();
    this.buildCollision();
    this.buildChunks();
    this.buildSigns();
    this.buildMinimap();
  }
  chunkKey(x, z) { return Math.floor(x / CH) + ',' + Math.floor(z / CH); }
  chunk(x, z) {
    const k = this.chunkKey(x, z);
    let c = this.chunks.get(k);
    if (!c) {
      c = { k, cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH, mb: new MeshBuilder(), houses: [], trees: [], lamps: [] };
      this.chunks.set(k, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- graph
  buildGraph() {
    const m = this.map;
    this.nodes = m.nodes;
    this.edges = m.edges.map((e, i) => {
      const pts = e[6];
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      return { i, a: e[0], b: e[1], cls: e[2], w: e[3], oneway: e[4], name: e[5], pts, cum, len: cum[cum.length - 1] };
    });
    this.adj = this.nodes.map(() => []);
    for (const e of this.edges) {
      this.adj[e.a].push({ e: e.i, dir: 1 });
      this.adj[e.b].push({ e: e.i, dir: -1 });
    }
    // edge grid for nearest queries
    this.eg = new Map();
    const C = 40;
    this.egCell = C;
    for (const e of this.edges)
      for (let k = 0; k < e.pts.length - 1; k++) {
        const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1];
        const pad = e.w / 2 + 2;
        for (let i = Math.floor((Math.min(ax, bx) - pad) / C); i <= Math.floor((Math.max(ax, bx) + pad) / C); i++)
          for (let j = Math.floor((Math.min(az, bz) - pad) / C); j <= Math.floor((Math.max(az, bz) + pad) / C); j++) {
            const key = i + ',' + j;
            if (!this.eg.has(key)) this.eg.set(key, []);
            this.eg.get(key).push([e.i, k]);
          }
      }
  }
  // point at distance s along edge (dir +1 from a to b), with lateral offset (right of travel)
  edgePoint(e, s, dir, off = 0) {
    const pts = e.pts, cum = e.cum;
    let d = dir > 0 ? s : e.len - s;
    d = Math.max(0, Math.min(e.len, d));
    let k = 0;
    while (k < cum.length - 2 && cum[k + 1] < d) k++;
    const seg = cum[k + 1] - cum[k] || 1;
    const t = (d - cum[k]) / seg;
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    let dx = (bx - ax) / seg, dz = (bz - az) / seg;
    if (dir < 0) { dx = -dx; dz = -dz; }
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    // right of travel direction: (-dz, dx)
    return { x: x + -dz * off, z: z + dx * off, dx, dz };
  }
  nearestEdge(x, z, maxD = 30) {
    const C = this.egCell;
    let best = null;
    for (let i = Math.floor((x - maxD) / C); i <= Math.floor((x + maxD) / C); i++)
      for (let j = Math.floor((z - maxD) / C); j <= Math.floor((z + maxD) / C); j++) {
        const L = this.eg.get(i + ',' + j);
        if (!L) continue;
        for (const [ei, k] of L) {
          const e = this.edges[ei];
          const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1];
          const r = segDist(x, z, ax, az, bx, bz);
          const d = r.d - e.w / 2;
          if (d < maxD && (!best || d < best.d)) best = { e, k, d, raw: r.d, t: r.t };
        }
      }
    return best;
  }
  onRoad(x, z, pad = 0) {
    const n = this.nearestEdge(x, z, 4);
    return n && n.d < pad;
  }
  streetName(x, z) {
    const ne = this.nearestEdge(x, z, 16);
    if (!ne) return '';
    const name = this.names[ne.e.name];
    // near a junction with a differently named road?
    for (const nid of [ne.e.a, ne.e.b]) {
      const [nx, nz] = this.nodes[nid];
      if (Math.hypot(nx - x, nz - z) < 22) {
        const other = this.adj[nid].map((a) => this.names[this.edges[a.e].name]).find((n) => n && n !== name);
        if (other && name) return name + ' · ' + other;
      }
    }
    return name;
  }
  nearestNode(x, z) {
    let best = -1, bd = 1e18;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = (this.nodes[i][0] - x) ** 2 + (this.nodes[i][1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // A* on junction graph, returns list of node ids
  path(from, to, allowOneway = true) {
    const N = this.nodes, open = new Map([[from, 0]]), g = new Map([[from, 0]]), came = new Map();
    const h = (i) => Math.hypot(N[i][0] - N[to][0], N[i][1] - N[to][1]);
    const f = new Map([[from, h(from)]]);
    let it = 0;
    while (open.size && it++ < 4000) {
      let cur = -1, bf = 1e18;
      for (const k of open.keys()) { const v = f.get(k); if (v < bf) { bf = v; cur = k; } }
      if (cur === to) break;
      open.delete(cur);
      for (const a of this.adj[cur]) {
        const e = this.edges[a.e];
        if (!allowOneway && e.oneway && a.dir < 0) continue;
        const nb = a.dir > 0 ? e.b : e.a;
        const ng = g.get(cur) + e.len;
        if (!g.has(nb) || ng < g.get(nb)) { g.set(nb, ng); f.set(nb, ng + h(nb)); came.set(nb, [cur, a]); open.set(nb, 1); }
      }
    }
    if (!came.has(to)) return null;
    const out = []; let c = to;
    while (c !== from) { const [p, a] = came.get(c); out.unshift({ node: c, step: a }); c = p; }
    return out;
  }

  // ---------------------------------------------------------------- collision
  buildCollision() {
    const C = 16; this.cc = C; this.cg = new Map();
    this.colliders = [];
    const addPoly = (poly, kind) => this.addCollider(poly, kind);
    this.map.buildings.forEach((b, i) => { this.colliders[addPoly(b.p, 'b')].bi = i; });
    for (const h of this.map.houses) {
      const [x, z, a, w, d] = h;
      const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
      const corner = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
      addPoly([corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)], 'h');
    }
    for (const t of this.map.trees) {
      const [x, z] = t, r = 0.45;
      addPoly([[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]], 't');
    }
    // water polygons + rivers (blocked unless on a road/bridge)
    this.water = [];
    for (const w of this.map.water) this.water.push(w.p);
    for (const lm of this.map.landmarks) if (lm.t === 'pool') this.water.push(lm.p);
    this.rivers = this.map.rivers.map(([big, pts]) => ({ w: big ? 9 : 3.5, pts }));
    propColliders(this); // storefronts, stations, bus stops, gazebo + walkable dock decks
  }
  addCollider(poly, kind) {
    const C = this.cc;
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    const c = { poly, kind, x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
    const id = this.colliders.push(c) - 1;
    c.id = id;
    for (let i = Math.floor(c.x0 / C); i <= Math.floor(c.x1 / C); i++)
      for (let j = Math.floor(c.z0 / C); j <= Math.floor(c.z1 / C); j++) {
        const k = i + ',' + j;
        if (!this.cg.has(k)) this.cg.set(k, []);
        this.cg.get(k).push(id);
      }
    return id;
  }
  query(x0, z0, x1, z1) {
    const C = this.cc, out = new Set();
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
      for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
        const L = this.cg.get(i + ',' + j);
        if (L) for (const id of L) out.add(id);
      }
    return out;
  }
  // push a circle out of static geometry. returns {x,z,hit,nx,nz}
  collide(x, z, r) {
    let hit = false, hx = 0, hz = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (const id of this.query(x - r, z - r, x + r, z + r)) {
        const c = this.colliders[id];
        if (x + r < c.x0 || x - r > c.x1 || z + r < c.z0 || z - r > c.z1) continue;
        const poly = c.poly, n = poly.length;
        let inside = false, bd = 1e9, bx = 0, bz = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
          const s = segDist(x, z, xj, zj, xi, zi);
          if (s.d < bd) { bd = s.d; bx = s.cx; bz = s.cz; }
        }
        if (inside) {
          let nx = bx - x, nz = bz - z; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
          x = bx + nx * r; z = bz + nz * r; hit = true; hx = nx; hz = nz;
        } else if (bd < r) {
          let nx = x - bx, nz = z - bz; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
          x = bx + nx * r; z = bz + nz * r; hit = true; hx = nx; hz = nz;
        }
      }
    }
    // world bounds
    const [HW, HH] = this.half, m = 4;
    if (x < -HW + m) { x = -HW + m; hit = true; hx = 1; hz = 0; }
    if (x > HW - m) { x = HW - m; hit = true; hx = -1; hz = 0; }
    if (z < -HH + m) { z = -HH + m; hit = true; hx = 0; hz = 1; }
    if (z > HH - m) { z = HH - m; hit = true; hx = 0; hz = -1; }
    return { x, z, hit, nx: hx, nz: hz };
  }
  inWater(x, z) {
    for (const d of this.decks) if (propPip(x, z, d)) return false; // lookout dock over the pond
    for (const p of this.water) {
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, zi] = p[i], [xj, zj] = p[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
      }
      if (inside) return !this.onRoad(x, z, 1);
    }
    for (const rv of this.rivers)
      for (let k = 0; k < rv.pts.length - 1; k++) {
        const [ax, az] = rv.pts[k], [bx, bz] = rv.pts[k + 1];
        if (Math.abs(ax - x) > 60 && Math.abs(bx - x) > 60) continue;
        if (segDist(x, z, ax, az, bx, bz).d < rv.w / 2) return !this.onRoad(x, z, 1.5);
      }
    return false;
  }
  // on (or right next to) the railway ballast
  onRail(x, z, pad = 1) {
    for (const pts of this.map.rails)
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        if (Math.min(ax, bx) - 6 > x || Math.max(ax, bx) + 6 < x || Math.min(az, bz) - 6 > z || Math.max(az, bz) + 6 < z) continue;
        if (segDist(x, z, ax, az, bx, bz).d < 1.6 + pad) return true;
      }
    return false;
  }
  // line of sight between two points (blocked by buildings/houses)
  los(ax, az, bx, bz) {
    const ids = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    for (const id of ids) {
      const c = this.colliders[id];
      if (c.kind === 't') continue;
      const p = c.poly;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++)
        if (segInter(ax, az, bx, bz, p[j][0], p[j][1], p[i][0], p[i][1])) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- render chunks
  buildChunks() {
    const m = this.map;
    // ground areas
    const areaY = { lot: 0.012, park: 0.008, water: 0.02 };
    for (const a of m.parks) flatPoly(this.chunk(...centroid(a.p)).mb, a.p, a.t, areaY.park, COL.park);
    for (const a of m.lots) flatPoly(this.chunk(...centroid(a.p)).mb, a.p, a.t, areaY.lot, COL.lot);
    for (const a of m.water) flatPoly(this.chunk(...centroid(a.p)).mb, a.p, a.t, areaY.water, COL.water);
    for (const [big, pts] of m.rivers) {
      const c = this.chunk(...pts[(pts.length / 2) | 0]);
      ribbon(c.mb, pts, big ? 9 : 3.5, 0.022, COL.water);
    }
    // roads: sidewalks then asphalt then markings (each split by segment midpoint chunk)
    for (const e of this.edges) {
      const side = e.cls <= 2 ? 3.8 : 2.8;
      for (let k = 0; k < e.pts.length - 1; k++) {
        const a = e.pts[k], b = e.pts[k + 1];
        const c = this.chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        ribbon(c.mb, [a, b], e.w + side, 0.03, COL.side);
      }
    }
    for (const e of this.edges)
      for (let k = 0; k < e.pts.length - 1; k++) {
        const a = e.pts[k], b = e.pts[k + 1];
        const c = this.chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        ribbon(c.mb, [a, b], e.w, 0.06, COL.road);
      }
    for (const pts of m.busways)
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        ribbon(this.chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).mb, [a, b], 6.5, 0.075, COL.bus);
      }
    // dashed centre lines on two-way arterials
    for (const e of this.edges) {
      if (e.cls > 2 || e.oneway || e.len < 30) continue;
      for (let s = 12; s < e.len - 12; s += 7) {
        const p = this.edgePoint(e, s, 1), q = this.edgePoint(e, Math.min(s + 3.2, e.len - 12), 1);
        ribbon(this.chunk(p.x, p.z).mb, [[p.x, p.z], [q.x, q.z]], 0.25, 0.085, e.cls === 0 ? '#ffcf3f' : COL.mark, false);
      }
    }
    // crosswalks at arterial junctions (deduplicated: divided roads create several nodes)
    const cwDone = [];
    for (let ni = 0; ni < this.nodes.length; ni++) {
      const inc = this.adj[ni];
      if (inc.length < 3) continue;
      const art = inc.filter((a) => this.edges[a.e].cls <= 2);
      if (art.length < 2) continue;
      const maxW = Math.max(...inc.map((a) => this.edges[a.e].w));
      for (const a of art) {
        const e = this.edges[a.e];
        if (e.len < maxW + 6) continue;
        const d = maxW / 2 + 3;
        const p = this.edgePoint(e, d, a.dir);
        if (cwDone.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 9)) continue;
        cwDone.push([p.x, p.z]);
        const c = this.chunk(p.x, p.z);
        const nx = -p.dz, nz = p.dx;
        for (let t = -e.w / 2 + 0.6; t <= e.w / 2 - 0.6; t += 1.25) {
          const cx = p.x + nx * t, cz = p.z + nz * t;
          ribbon(c.mb, [[cx - p.dx * 1.5, cz - p.dz * 1.5], [cx + p.dx * 1.5, cz + p.dz * 1.5]], 0.6, 0.088, '#f7f7f7', false);
        }
      }
    }
    // rails
    for (const pts of m.rails)
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const c = this.chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        ribbon(c.mb, [a, b], 3.2, 0.05, COL.ballast);
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        for (const o of [-0.7, 0.7]) ribbon(c.mb, [[a[0] + nx * o, a[1] + nz * o], [b[0] + nx * o, b[1] + nz * o]], 0.18, 0.12, '#5a5f6b', false);
      }
    // 407 overpass: elevated deck + piers + barriers
    for (const pts of m.overpass)
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const c = this.chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 0.1) continue;
        const ang = Math.atan2(dx, dz);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        c.mb.add(box(9, 1.0, L + 0.5), M.chain(M.T(mx, 7.6, mz), M.RY(ang)), COL.deck);
        c.mb.add(box(7.5, 0.05, L + 0.5), M.chain(M.T(mx, 8.13, mz), M.RY(ang)), COL.road);
        for (const o of [-4.4, 4.4]) c.mb.add(box(0.35, 0.9, L + 0.5), M.chain(M.T(mx, 8.5, mz), M.RY(ang), M.T(o, 0, 0)), '#e2e5ec');
        for (let s = 0; s < L; s += 26) {
          const px = a[0] + (dx / L) * s, pz = a[1] + (dz / L) * s;
          c.mb.add(box(2.2, 7.2, 1.4), M.chain(M.T(px, 3.6, pz), M.RY(ang)), COL.pier);
        }
      }
    // OSM buildings
    this.bRange = [];
    this.fade = new Map(); // building index -> current alpha (occlusion fade)
    for (const b of m.buildings) {
      const c = this.chunk(...centroid(b.p));
      const v0 = c.mb.count;
      const wc = hex(b.c);
      const rc = [wc[0] * 0.82 + 0.1, wc[1] * 0.82 + 0.1, wc[2] * 0.82 + 0.12];
      extrude(c.mb, b.p, b.t, b.h, wc, rc);
      // a darker base stripe and window band
      if (b.lm !== 'tims' && b.h > 5) this.windowBands(c.mb, b);
      buildingDetail(c.mb, b); // Tim Hortz trim, cinema marquee, tower roofs
      // rooftop boxes on large roofs
      const area = Math.abs(polyArea(b.p));
      if (area > 500 && !b.lm) {
        const [cx, cz] = centroid(b.p);
        for (let i = 0; i < 3; i++) c.mb.add(rbox(2.4, 1.2, 2.4, 0.2), M.T(cx + (i - 1) * 4, b.h + 0.6, cz + (i % 2) * 3), '#c9ced8');
      }
      this.bRange.push([c, v0, c.mb.count]);
    }
    // landmarks
    for (const lm of m.landmarks) this.buildLandmark(lm);
    this.heritageVerts = buildHeritage(this); // Unionville Main St storefronts
    // parking lots: painted stalls + parked cars (static, solid)
    const lotCars = [];
    let seedL = 1;
    const rl = () => { seedL = (seedL * 16807) % 2147483647; return seedL / 2147483647; };
    for (const a of m.lots) {
      const poly = a.p, area = Math.abs(polyArea(poly));
      if (area < 300) continue;
      const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const fill = Math.min(0.5, 120 / (area / 22));
      for (let z = z0 + 4; z < z1 - 3; z += 7.5)
        for (let x = x0 + 3; x < x1 - 2; x += 3.0) {
          if (!pip(x, z, poly)) continue;
          if (this.collide(x, z, 2.9).hit) continue;
          if (this.nearestEdge(x, z, 6)) continue;
          if (buswayDist(m, x, z) < 6.5) continue; // no stalls / parked cars on the bus lanes
          const ch = this.chunk(x, z);
          ribbon(ch.mb, [[x - 1.5, z - 2.6], [x - 1.5, z + 2.6]], 0.14, 0.02, '#ffffff', false);
          if (rl() < fill) {
            const flip = rl() < 0.5 ? 0 : Math.PI;
            lotCars.push([x, z, flip + (rl() - 0.5) * 0.08, Math.floor(rl() * 12)]);
          }
        }
    }
    for (const lc of lotCars) {
      this.chunk(lc[0], lc[1]).lotCars = this.chunk(lc[0], lc[1]).lotCars || [];
      this.chunk(lc[0], lc[1]).lotCars.push(lc);
      const [x, z, ang] = lc, c = Math.cos(ang), s = Math.sin(ang);
      const corner = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
      this.addCollider([corner(-1.05, -2.2), corner(1.05, -2.2), corner(1.05, 2.2), corner(-1.05, 2.2)], 'c');
    }
    // instanced houses / trees / lamps per chunk
    for (const h of m.houses) this.chunk(h[0], h[1]).houses.push(h);
    for (const t of m.trees) this.chunk(t[0], t[1]).trees.push(t);
    for (const e of this.edges) {
      if (e.cls > 1) continue;
      for (let s = 15; s < e.len - 10; s += 34)
        for (const side of e.oneway ? [1] : [1, -1]) {
          const p = this.edgePoint(e, s, side, e.w / 2 + 1.4);
          if (buswayDist(m, p.x, p.z) < 3.6) continue; // keep the bus lanes clear
          this.chunk(p.x, p.z).lamps.push([p.x, p.z, Math.atan2(p.dz, -p.dx)]);
        }
    }
    // hydrants, manhole covers, bus stops (baked into the chunk meshes; needs the lamp positions)
    this.propStats = buildStreetProps(this);
    // shared unit meshes
    const houseMB = new MeshBuilder();
    houseMB.add(box(1, 1, 1), M.T(0, 0.5, 0), '#ffffff', MAT_A);
    houseMB.add(roof(1.12, 0.62, 1.1), M.T(0, 1, 0), '#ffffff', MAT_B);
    houseMB.add(box(0.16, 0.6, 0.02), M.T(0, 0.3, 0.505), '#7c2d12');
    for (const sx of [-0.28, 0.28]) houseMB.add(box(0.15, 0.3, 0.02), M.T(sx, 0.55, 0.505), '#dbeafe');
    houseMB.add(box(0.08, 0.5, 0.08), M.T(0.25, 1.25, -0.15), '#9a3412');
    const treeMB = new MeshBuilder();
    treeMB.add(cyl(0.22, 0.3, 2.2, 6, false), M.T(0, 1.1, 0), '#8a5a3b');
    treeMB.add(ico(1.45), M.T(0, 3.25, 0), '#ffffff', MAT_A);
    treeMB.add(ico(1.1), M.chain(M.T(0.85, 2.7, 0.3), M.RY(0.7)), '#e8f0d0', MAT_A);
    treeMB.add(ico(1.05), M.chain(M.T(-0.75, 2.8, -0.35), M.RY(1.9)), '#f2f7e0', MAT_A);
    const lampMB = new MeshBuilder();
    lampMB.add(cyl(0.09, 0.12, 5.2, 6), M.T(0, 2.6, 0), '#3f4659');
    lampMB.add(box(0.14, 0.14, 1.5), M.T(0, 5.1, 0.7), '#3f4659');
    lampMB.add(rbox(0.6, 0.26, 0.6, 0.1), M.T(0, 4.9, 1.4), '#fff3c4', MAT_V, 0.6);
    const carMB = new MeshBuilder();
    carMB.add(rbox(2.1, 0.85, 4.4, 0.3, 1), M.T(0, 0.72, 0), '#ffffff', MAT_A);
    carMB.add(rbox(1.8, 0.78, 2.3, 0.28, 1), M.T(0, 1.47, -0.25), '#9fd3f2');
    carMB.add(rbox(1.86, 0.14, 2.0, 0.06, 1), M.T(0, 2.2, -0.25), '#ffffff', MAT_A);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) carMB.add(cyl(0.42, 0.42, 0.34, 8), M.chain(M.T(sx, 0.42, sz * 1.4), M.RZ(Math.PI / 2)), '#262a35');
    const carCols = ['#38bdf8', '#fb7185', '#34d399', '#a78bfa', '#f97316', '#e5e7eb', '#94a3b8', '#fde68a', '#ef4444', '#2563eb', '#10b981', '#f8fafc'].map(hex);
    const walls = m.houseWalls.map(hex), roofs = m.houseRoofs.map(hex);
    const tg = ['#a6cf3f', '#b9da4c', '#93c13a', '#8fc24a', '#a9d14f'].map(hex);
    for (const c of this.chunks.values()) {
      c.static = this.r.mesh(c.mb); c.mb = null;
      if (c.houses.length) {
        const d = new Float32Array(c.houses.length * INST_FLOATS);
        c.houses.forEach((h, i) => {
          const o = i * INST_FLOATS;
          writeTRS(d, o, h[0], 0, h[1], h[2], h[3], h[5], h[4]);
          const wc = typeof h[6] === 'number' ? walls[h[6]] : hex(h[6]);
          const rc = typeof h[7] === 'number' ? roofs[h[7]] : hex(h[7]);
          d.set(wc, o + 16); d.set(rc, o + 19);
        });
        c.houseInst = this.r.instanced(houseMB, 0, d);
      }
      if (c.trees.length) {
        const d = new Float32Array(c.trees.length * INST_FLOATS);
        c.trees.forEach((t, i) => {
          const o = i * INST_FLOATS, s = t[2];
          writeTRS(d, o, t[0], 0, t[1], (t[0] * 7.3) % 6.28, s, s, s);
          const col = tg[i % tg.length];
          d.set(col, o + 16); d.set(col, o + 19);
        });
        c.treeInst = this.r.instanced(treeMB, 0, d);
      }
      if (c.lamps.length) {
        const d = new Float32Array(c.lamps.length * INST_FLOATS);
        c.lamps.forEach((l, i) => { writeTRS(d, i * INST_FLOATS, l[0], 0, l[1], l[2], 1, 1, 1); d.set([1, 1, 1], i * INST_FLOATS + 16); d.set([1, 1, 1], i * INST_FLOATS + 19); });
        c.lampInst = this.r.instanced(lampMB, 0, d);
      }
      if (c.lotCars && c.lotCars.length) {
        const d = new Float32Array(c.lotCars.length * INST_FLOATS);
        c.lotCars.forEach((l, i) => { writeTRS(d, i * INST_FLOATS, l[0], 0, l[1], l[2], 1, 1, 1); d.set(carCols[l[3]], i * INST_FLOATS + 16); d.set(carCols[l[3]], i * INST_FLOATS + 19); });
        c.carInst = this.r.instanced(carMB, 0, d);
      }
      // every per-chunk instanced mesh goes into c.inst (drawn in both passes by main.js)
      c.inst = [c.houseInst, c.treeInst, c.lampInst, c.carInst].filter(Boolean);
      c.houses = c.trees = c.lamps = c.lotCars = null;
    }
    // ground plane tiles (large flat quads, one per chunk area incl. outside border)
    const g = new MeshBuilder();
    const [HW, HH] = this.half, E = 400;
    g.quad([-HW - E, 0, -HH - E], [HW + E, 0, -HH - E], [HW + E, 0, HH + E], [-HW - E, 0, HH + E], COL.grass, [0, 1, 0]);
    this.ground = this.r.mesh(g);
  }
  windowBands(mb, b) {
    const n = b.p.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const [x1, z1] = b.p[i], [x2, z2] = b.p[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
    const sgn = area > 0 ? 1 : -1;
    const floors = Math.max(1, Math.floor((b.h - 1) / 3.2));
    for (let i = 0; i < n; i++) {
      const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % n];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 3) continue;
      const nx = (dz / L) * sgn * 0.06, nz = (-dx / L) * sgn * 0.06;
      for (let f = 0; f < floors; f++) {
        const y0 = 1.3 + f * 3.2, y1 = y0 + 1.3;
        if (y1 > b.h - 0.4) break;
        const ux = dx / L, uz = dz / L, m0 = 0.6;
        mb.quad([ax + ux * m0 + nx, y0, az + uz * m0 + nz], [bx - ux * m0 + nx, y0, bz - uz * m0 + nz], [bx - ux * m0 + nx, y1, bz - uz * m0 + nz], [ax + ux * m0 + nx, y1, az + uz * m0 + nz], '#9fd3f2', [nx * 16, 0, nz * 16]);
      }
    }
  }
  buildLandmark(lm) {
    if (lm.t === 'pool') {
      const c = this.chunk(...centroid(lm.p));
      const tris = earclipJS(lm.p);
      flatPoly(c.mb, lm.p, tris, 0.04, '#7fd0f0');
      return;
    }
    const c = this.chunk(lm.x, lm.z);
    const mb = c.mb, y = lm.h;
    if (lm.t === 'tims') {
      const k = Math.min(1.5, Math.max(1, (lm.r || 3) / 5)); // bigger donut on bigger stores
      const T = M.chain(M.T(lm.x, y + 2.2 * k, lm.z), M.RX(0.5), M.S(k));
      mb.add(torus(2.2, 1.0, 30, 12), T, '#d89b5a');
      mb.add(torus(2.2, 0.88, 30, 12), M.chain(T, M.T(0, 0.34, 0), M.S(1, 0.72, 1)), '#f58fb6');
      for (let i = 0; i < 36; i++) {
        const a = rnd() * Math.PI * 2, rr = 2.2 + (rnd() - 0.5) * 1.3;
        mb.add(box(0.28, 0.08, 0.08), M.chain(T, M.T(Math.cos(a) * rr, 1.08, Math.sin(a) * rr), M.RY(rnd() * 3)), ['#ffffff', '#ffd23f', '#60a5fa', '#34d399', '#a78bfa'][i % 5], MAT_V, 0.15);
      }
    } else if (lm.t === 'pacific') {
      const x = lm.x, z = lm.z;
      mb.add(cyl(4.2, 3.3, 11, 28), M.T(x, y + 5.5, z), '#e9c6a0');
      for (let k = 0; k < 3; k++) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + k * 0.2, rr = 3.45 + k * 0.12; mb.add(sphere(0.48, 6), M.T(x + Math.cos(a) * rr, y + 0.7 + k * 0.85, z + Math.sin(a) * rr), '#3b2418'); }
      mb.add(sphere(4.25, 14), M.chain(M.T(x, y + 11, z), M.S(1, 0.32, 1)), '#fbfbfb');
      mb.add(cyl(0.4, 0.4, 8, 10), M.chain(M.T(x + 1.3, y + 14.2, z), M.RZ(-0.28)), '#ff5c93');
    } else if (lm.t === 'markville') {
      const x = lm.x, z = lm.z;
      mb.add(rbox(9, 10, 4.5, 0.3), M.T(x, y + 5, z), '#ff7aa8');
      mb.add(box(9.2, 1.4, 4.7), M.T(x, y + 8.3, z), '#ffffff');
      for (const o of [-2.4, 2.4]) mb.add(torus(1.6, 0.25, 16, 8, Math.PI), M.chain(M.T(x + o, y + 10, z), M.RX(Math.PI / 2), M.RZ(Math.PI)), '#4a3a6b');
    } else if (lm.t === 'civic') {
      const x = lm.x, z = lm.z;
      mb.add(cyl(3.2, 3.6, 3, 20), M.T(x, y + 1.5, z), '#e8edf3');
      mb.add(sphere(3.2, 14), M.chain(M.T(x, y + 3, z), M.S(1, 0.6, 1)), '#9fb8cf');
      mb.add(cyl(0.1, 0.1, 6, 6), M.T(x + 5, y + 3, z), '#cccccc');
      mb.add(box(1.8, 1.0, 0.05), M.T(x + 5.9, y + 5.5, z), '#e53935');
    } else buildPropLandmark(this, lm); // gazebo, dock, cinema popcorn, Viva stations, Unionville / Downtown signs
  }
  // camera-facing signs (camera azimuth is fixed so they are always readable)
  buildSigns() {
    const az = CFG.camera.azimuth;
    const fx = Math.sin(az), fz = Math.cos(az);   // toward camera on ground
    const rx = Math.cos(az), rz = -Math.sin(az);  // camera right
    const specs = [];
    for (const lm of this.map.landmarks) {
      if (lm.t === 'tims') specs.push({ text: 'Tim Hortz', bg: '#c0392b', fg: '#ffffff', x: lm.x, z: lm.z, y: lm.h + 0.2, w: 7, h: 1.5, push: Math.max(5, (lm.r || 3) * 1.05) });
      if (lm.t === 'pacific') specs.push({ text: '大古广场 Pacifick Mall', bg: '#e74c3c', fg: '#ffffff', x: lm.x, z: lm.z, y: lm.h + 1, w: 22, h: 2.6, push: lm.r * 0.9 });
      if (lm.t === 'markville') specs.push({ text: 'Markvile Mall', bg: '#7c3aed', fg: '#ffffff', x: lm.x, z: lm.z, y: lm.h + 1, w: 16, h: 2.4, push: lm.r * 0.8 });
      if (lm.t === 'civic') specs.push({ text: '万锦市政厅 Civic Centre', bg: '#1e3a8a', fg: '#ffffff', x: lm.x, z: lm.z, y: lm.h + 0.6, w: 20, h: 2.4, push: lm.r * 0.8 });
      const ps = propSign(lm);
      if (ps) specs.push(ps);
    }
    if (!specs.length) return;
    const cv = document.createElement('canvas');
    const rowH = 128; cv.width = 1024; cv.height = rowH * specs.length;
    const g = cv.getContext('2d');
    const P = [], U = [];
    specs.forEach((s, i) => {
      const y0 = i * rowH;
      g.fillStyle = s.bg; roundRect(g, 4, y0 + 4, cv.width - 8, rowH - 8, 22); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 8; roundRect(g, 12, y0 + 12, cv.width - 24, rowH - 24, 16); g.stroke();
      g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 78; g.font = `800 ${fs}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
      while (g.measureText(s.text).width > cv.width * 0.86 && fs > 30) { fs -= 4; g.font = `800 ${fs}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`; }
      g.fillText(s.text, cv.width / 2, y0 + rowH / 2 + 4);
      const cx = s.x + fx * s.push, cz = s.z + fz * s.push, hw = s.w / 2;
      const v0 = y0 / cv.height, v1 = (y0 + rowH) / cv.height;
      const A = [cx - rx * hw, s.y, cz - rz * hw], B = [cx + rx * hw, s.y, cz + rz * hw], C = [cx + rx * hw, s.y + s.h, cz + rz * hw], D = [cx - rx * hw, s.y + s.h, cz - rz * hw];
      P.push(...A, ...B, ...C, ...A, ...C, ...D);
      U.push(0, v1, 1, v1, 1, v0, 0, v1, 1, v0, 0, v0);
    });
    this.signs = this.r.signMesh({ p: P, u: U }, cv);
  }
  // ---------------------------------------------------------------- occlusion fade
  // Buildings standing between the camera and the player fade out (spec 4).
  // Returns indices of buildings whose prism cuts the segment from (x, y, z) to the eye for any y in ys.
  occluders(eye, x, z, ys) {
    const out = new Set(), maxH = CFG.occlusion.maxH;
    for (const y0 of ys) {
      const dy = eye[1] - y0;
      if (dy <= 0) continue;
      // past tMax the ray is above every roof, so only that stretch of the ground projection matters
      const tMax = Math.min(1, (maxH - y0) / dy);
      const ex = x + (eye[0] - x) * tMax, ez = z + (eye[2] - z) * tMax;
      for (const id of this.query(Math.min(x, ex), Math.min(z, ez), Math.max(x, ex), Math.max(z, ez))) {
        const c = this.colliders[id];
        if (c.bi === undefined || out.has(c.bi)) continue;
        const t = segPolyEntry(x, z, ex, ez, c.poly);
        if (t >= 0 && y0 + dy * tMax * t < this.map.buildings[c.bi].h) out.add(c.bi);
      }
    }
    return out;
  }
  // animate fade alphas; returns { skip: Map(chunk -> sorted [[s, e]]), list: [{ m, s, e, a }] }
  updateFade(eye, P, dt) {
    const O = CFG.occlusion;
    const hit = this.occluders(eye, P.x, P.z, O.sampleY);
    for (const bi of hit) if (!this.fade.has(bi)) this.fade.set(bi, 1);
    const k = 1 - Math.exp(-O.speed * dt);
    const skip = new Map(), list = [];
    for (const [bi, a] of this.fade) {
      const want = hit.has(bi) ? O.alpha : 1;
      const na = a + (want - a) * k;
      if (want === 1 && na > 0.98) { this.fade.delete(bi); continue; }
      this.fade.set(bi, na);
      const [c, s, e] = this.bRange[bi];
      if (!c.static) continue;
      if (!skip.has(c)) skip.set(c, []);
      skip.get(c).push([s, e]);
      list.push({ m: c.static, s, e, a: na });
    }
    for (const r of skip.values()) r.sort((p, q) => p[0] - q[0]);
    return { skip, list };
  }

  // ---------------------------------------------------------------- minimap image
  buildMinimap() {
    const S = CFG.minimap.pxPerM;
    const [HW, HH] = this.half;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(HW * 2 * S); cv.height = Math.ceil(HH * 2 * S);
    const g = cv.getContext('2d');
    const T = (x, z) => [(x + HW) * S, (z + HH) * S];
    g.fillStyle = COL.grass; g.fillRect(0, 0, cv.width, cv.height);
    const fillPolys = (list, col) => { g.fillStyle = col; for (const a of list) { g.beginPath(); a.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); } };
    fillPolys(this.map.parks.map((a) => a.p), COL.park);
    fillPolys(this.map.lots.map((a) => a.p), COL.lot);
    fillPolys(this.map.water.map((a) => a.p), COL.water);
    g.strokeStyle = COL.water; g.lineCap = 'round';
    for (const [big, pts] of this.map.rivers) { g.lineWidth = (big ? 9 : 3.5) * S; g.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    fillPolys(this.map.buildings.map((b) => b.p), '#e9e2d4');
    g.lineJoin = 'round';
    for (const e of [...this.edges].sort((a, b) => b.cls - a.cls)) {
      g.strokeStyle = e.cls <= 1 ? '#ffffff' : '#eef0f4';
      g.lineWidth = Math.max(e.w * S * 1.3, e.cls <= 1 ? 3 : 1.6);
      g.beginPath(); e.pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    g.strokeStyle = COL.bus; g.lineWidth = 2;
    for (const pts of this.map.busways) { g.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    const icon = { tims: '#c0392b', pacific: '#e74c3c', markville: '#7c3aed', civic: '#1e3a8a' };
    for (const lm of this.map.landmarks) if (icon[lm.t]) { const [x, y] = T(lm.x, lm.z); g.fillStyle = icon[lm.t]; g.beginPath(); g.arc(x, y, lm.t === 'tims' ? 4 : 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    propIcons(g, T, this.map.landmarks);
    this.minimap = cv;
  }

  // chunks overlapping a rectangle [x0,z0,x1,z1] (+margin)
  visibleRect(r, m = 0) {
    const out = [], h = CH / 2;
    for (const c of this.chunks.values())
      if (c.cx + h > r[0] - m && c.cx - h < r[2] + m && c.cz + h > r[1] - m && c.cz - h < r[3] + m) out.push(c);
    return out;
  }
  // visible chunks around a point
  visible(x, z, R) {
    const out = [];
    for (const c of this.chunks.values()) if (Math.hypot(c.cx - x, c.cz - z) < R + CH * 0.72) out.push(c);
    return out;
  }
}

function writeTRS(d, o, x, y, z, a, sx, sy, sz) {
  const c = Math.cos(a), s = Math.sin(a);
  d[o] = c * sx; d[o + 1] = 0; d[o + 2] = -s * sx; d[o + 3] = 0;
  d[o + 4] = 0; d[o + 5] = sy; d[o + 6] = 0; d[o + 7] = 0;
  d[o + 8] = s * sz; d[o + 9] = 0; d[o + 10] = c * sz; d[o + 11] = 0;
  d[o + 12] = x; d[o + 13] = y; d[o + 14] = z; d[o + 15] = 1;
}
function pip(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
// parameter t in [0,1] where segment a->b first enters polygon (0 if a is inside), -1 if it never does
function segPolyEntry(ax, az, bx, bz, poly) {
  if (pip(ax, az, poly)) return 0;
  const rx = bx - ax, rz = bz - az;
  let best = -1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [cx, cz] = poly[j], [dx, dz] = poly[i];
    const sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best < 0 || t < best)) best = t;
  }
  return best;
}
function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; s += x1 * z2 - x2 * z1; } return s / 2; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function segInter(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function earclipJS(poly) {
  const n = poly.length; if (n < 3) return [];
  let idx = [...Array(n).keys()];
  if (polyArea(poly) < 0) idx.reverse();
  const tris = []; let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let ear = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const [ax, az] = poly[i0], [bx, bz] = poly[i1], [cx, cz] = poly[i2];
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) <= 0) continue;
      tris.push([i0, i1, i2]); idx.splice(k, 1); ear = true; break;
    }
    if (!ear) break;
  }
  if (idx.length === 3) tris.push(idx);
  return tris;
}
