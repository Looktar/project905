// v0.1 landmarks (Unionville Main St, Toogood Pond, Downtown Markham + cinema, Viva stations) and
// street props (fire hydrants, manhole covers, bus stops). Everything is baked into the per-chunk
// static meshes, so none of it costs an extra draw call.
import { M, segDist } from './math.js';
import { MAT_V, box, cyl, ico, torus, roof, disc } from './geo.js';
import { CFG } from './config.js';
import { MODELS } from './models.js';

const COL = {
  post: '#475569', glass: '#9ad7f5', glass2: '#bfe6ff', viva: '#2563eb', platform: '#d6dae3', tactile: '#ffd23f',
  white: '#ffffff', cream: '#f8f1e7', wood: '#b9824c', wood2: '#a8743f', woodDark: '#6b4f3a', bench: '#c47a3d',
  hydrant: '#ef4444', hydrantDark: '#b91c1c', manholeRim: '#8a93a6', manhole: '#4a5266', window: '#a5dcf7',
  windowUp: '#dbeafe', door: '#7c2d12', gazeboRoof: '#4f8f6f', yrt: '#16a34a', shelterRoof: '#64748b',
};
const HERITAGE_ROOFS = ['#4a5568', '#7b2d26', '#2f6b4f', '#3b4a6b', '#6b4f3a'];

// geometry helpers ----------------------------------------------------------------------------
const put = (mb, base, g, m, col, em = 0) => mb.add(g, M.mul(base, m), col, MAT_V, em);
const at = (x, y, z) => M.T(x, y, z);
const frame = (x, z, a) => M.chain(M.T(x, 0, z), M.RY(a));
function pip(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
// oriented rectangle, local +z = front (same convention as houses)
function rectPoly(x, z, a, w, d) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]);
}
// a tapered tube split into vertical stripes: returns [even stripes, odd stripes]
const stripeCache = new Map();
function stripedTube(rb, rt, h, n) {
  const key = [rb, rt, h, n].join();
  if (stripeCache.has(key)) return stripeCache.get(key);
  const out = [{ p: [], n: [] }, { p: [], n: [] }];
  const sl = (rb - rt) / h;
  for (let j = 0; j < n; j++) {
    const a0 = (j / n) * Math.PI * 2, a1 = ((j + 1) / n) * Math.PI * 2, g = out[j % 2];
    const q = [[rb, -h / 2, a0], [rb, -h / 2, a1], [rt, h / 2, a1], [rt, h / 2, a0]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [r, y, a] = q[k], c = Math.cos(a), s = Math.sin(a), L = Math.hypot(1, sl);
      g.p.push(r * c, y, r * s); g.n.push(c / L, sl / L, s / L);
    }
  }
  stripeCache.set(key, out);
  return out;
}
function busDist(map, x, z) {
  let best = 1e9;
  for (const pts of map.busways)
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      if (Math.abs(ax - x) > 80 && Math.abs(bx - x) > 80) continue;
      best = Math.min(best, segDist(x, z, ax, az, bx, bz).d);
    }
  return best;
}

// bbox-prefiltered lookups for bulk placement (World.inWater scans every water polygon)
function fastLookups(w) {
  const box2 = (pts, pad) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };
  const polys = w.water.map((p) => ({ p, b: box2(p, 0) }));
  const segs = [];
  for (const rv of w.rivers) for (let k = 0; k < rv.pts.length - 1; k++) segs.push({ a: rv.pts[k], c: rv.pts[k + 1], r: rv.w / 2, b: box2([rv.pts[k], rv.pts[k + 1]], rv.w / 2) });
  const bus = [];
  for (const pts of w.map.busways) for (let k = 0; k < pts.length - 1; k++) bus.push({ a: pts[k], c: pts[k + 1], b: box2([pts[k], pts[k + 1]], 8) });
  const inB = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
  return {
    // any lake / pond / river (bridges included: no props on bridges)
    wet(x, z) {
      for (const q of polys) if (inB(q.b, x, z) && pip(x, z, q.p)) return true;
      for (const q of segs) if (inB(q.b, x, z) && segDist(x, z, q.a[0], q.a[1], q.c[0], q.c[1]).d < q.r) return true;
      return false;
    },
    // distance to the busway centre line (capped at 8 m)
    bus(x, z) {
      let best = 8;
      for (const q of bus) if (inB(q.b, x, z)) best = Math.min(best, segDist(x, z, q.a[0], q.a[1], q.c[0], q.c[1]).d);
      return best;
    },
  };
}

// colliders + walkable decks (called at the end of World.buildCollision) ----------------------
export function propColliders(w) {
  const m = w.map;
  w.decks = [];
  for (const h of m.heritage || []) w.addCollider(rectPoly(h[0], h[1], h[2], h[3], h[4]), 'h');
  for (const s of m.stops || []) w.addCollider(rectPoly(s[0], s[1], s[2], s[3] === 2 ? 6.6 : s[3] === 1 ? 5.0 : 3.4, s[3] ? 1.8 : 0.8), 't');
  for (const lm of m.landmarks) {
    if (lm.t === 'viva') w.addCollider(rectPoly(lm.x, lm.z, lm.a, 0.7, lm.L), 't');
    if (lm.t === 'gazebo') {
      const oct = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; oct.push([lm.x + Math.cos(a) * 3.4, lm.z + Math.sin(a) * 3.4]); }
      w.addCollider(oct, 't');
    }
    if (lm.t === 'dock') {
      const ux = Math.sin(lm.a), uz = Math.cos(lm.a);
      w.decks.push(rectPoly(lm.x + ux * lm.L / 2, lm.z + uz * lm.L / 2, lm.a, lm.w - 0.3, lm.L));
    }
  }
}

// landmark geometry (called from World.buildLandmark for the new types) ------------------------
export function buildPropLandmark(w, lm) {
  const mb = w.chunk(lm.x, lm.z).mb;
  if (lm.t === 'viva') vivaStation(mb, lm);
  else if (lm.t === 'gazebo') gazebo(mb, lm);
  else if (lm.t === 'dock') dock(mb, lm);
  else if (lm.t === 'cinema') popcorn(mb, lm);
  else if (lm.t === 'unionville') signPosts(mb, lm.x, lm.z, lm.h - 0.2, lm.h + 2.35, 2.4, 0.09, '#2f2a24');
  else if (lm.t === 'downtown') downtownSign(w, lm);
}

// median platform between the two bus lanes, glass canopy with a blue roof (no logos / text)
function vivaStation(mb, lm) {
  const F = frame(lm.x, lm.z, lm.a), L = lm.L;
  put(mb, F, box(0.6, 0.22, L), at(0, 0.11, 0), COL.platform);
  for (const sx of [-0.23, 0.23]) put(mb, F, box(0.1, 0.02, L - 0.3), at(sx, 0.225, 0), COL.tactile);
  for (const z of [-L / 2 + 1.6, 0, L / 2 - 1.6]) put(mb, F, cyl(0.09, 0.09, 4.0, 6, false), at(0, 2.2, z), COL.post);
  put(mb, F, box(3.2, 0.1, L - 0.8), at(0, 4.22, 0), COL.glass, 0.25);
  put(mb, F, box(2.5, 0.2, L - 0.4), at(0, 4.4, 0), COL.viva);
  put(mb, F, box(1.2, 0.16, L - 1.2), at(0, 4.56, 0), '#3b82f6');
  for (const z of [-3.2, 3.2]) put(mb, F, box(0.05, 1.7, 3.0), at(0, 1.1, z), COL.glass2, 0.2);
  put(mb, F, box(0.3, 2.4, 0.3), at(0, 1.42, L / 2 - 0.5), COL.viva, 0.1);
  put(mb, F, box(0.32, 0.5, 0.32), at(0, 2.4, L / 2 - 0.5), COL.white, 0.4);
  put(mb, F, box(0.34, 0.08, 1.8), at(0, 0.58, -1.2), COL.bench);
  for (const z of [-1.9, -0.5]) put(mb, F, box(0.26, 0.36, 0.08), at(0, 0.4, z), COL.post);
}

// white octagonal gazebo with a pointed roof
function gazebo(mb, lm) {
  const F = frame(lm.x, lm.z, Math.PI / 8), R = 3.0;
  put(mb, F, cyl(R + 0.35, R + 0.45, 0.4, 8), at(0, 0.2, 0), '#ecebe6');
  put(mb, F, box(1.6, 0.2, 0.9), at(0, 0.1, R + 0.75), '#ecebe6'); // step at the entrance gap (local +z)
  for (let i = 0; i < 8; i++) {
    const a0 = ((i + 0.5) / 8) * Math.PI * 2, a1 = ((i + 1.5) / 8) * Math.PI * 2;
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
    put(mb, F, cyl(0.12, 0.12, 2.6, 6, false), at(x0, 1.7, z0), COL.white);
    if (i === 1) continue; // entrance gap
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    for (const y of [0.75, 1.3]) put(mb, F, box(0.08, 0.08, len), M.chain(at(mx, y, mz), M.RY(ang)), COL.white);
  }
  put(mb, F, cyl(R + 0.35, R + 0.35, 0.28, 8), at(0, 3.1, 0), COL.white);
  put(mb, F, cyl(0.05, R + 0.85, 2.3, 8), at(0, 4.35, 0), COL.gazeboRoof);
  put(mb, F, cyl(0.06, 0.06, 0.8, 6, false), at(0, 5.7, 0), COL.white);
  put(mb, F, ico(0.22), at(0, 6.15, 0), COL.white);
}

// little wooden lookout dock from the shore into the pond (deck is walkable: World.decks)
function dock(mb, lm) {
  const F = frame(lm.x, lm.z, lm.a), L = lm.L, W = lm.w;
  const n = Math.max(3, Math.round(L / 1.5));
  for (let i = 0; i < n; i++) put(mb, F, box(W, 0.14, L / n - 0.06), at(0, 0.1, (L / n) * (i + 0.5)), i % 2 ? COL.wood : COL.wood2);
  for (const sx of [-W / 2 + 0.12, W / 2 - 0.12])
    for (const z of [L * 0.3, L * 0.65, L - 0.15]) put(mb, F, cyl(0.1, 0.1, 1.45, 6, false), at(sx, 0.45, z), COL.woodDark);
  for (const sx of [-W / 2 + 0.12, W / 2 - 0.12]) put(mb, F, box(0.1, 0.1, L * 0.72), at(sx, 1.12, L * 0.64), COL.woodDark);
  put(mb, F, box(W - 0.2, 0.1, 0.1), at(0, 1.12, L - 0.15), COL.woodDark);
}

// giant striped popcorn bucket on the cinema roof
function popcorn(mb, lm) {
  const az = CFG.camera.azimuth, fx = Math.sin(az), fz = Math.cos(az);
  const x = lm.x - fx * lm.r * 0.25, z = lm.z - fz * lm.r * 0.25, y = lm.h;
  const H = 7.4, rb = 2.8, rt = 3.9, base = M.T(x, y + H / 2, z);
  const [a, b] = stripedTube(rb, rt, H, 16);
  mb.add(a, base, '#e11d48', MAT_V); mb.add(b, base, COL.white, MAT_V);
  mb.add(cyl(rb, rb, 0.2, 16), M.T(x, y + 0.1, z), '#e11d48', MAT_V);
  mb.add(torus(rt, 0.2, 20, 6), M.T(x, y + H, z), COL.white, MAT_V);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cols = ['#fff3c4', '#ffe8a3', '#fffaf0', '#f8d77e'];
  for (let i = 0; i < 40; i++) {
    const ang = r() * Math.PI * 2, rr = Math.sqrt(r()) * (rt - 0.45), hh = (1 - (rr / rt) ** 2) * 2.0;
    mb.add(ico(0.55 + r() * 0.25), M.chain(M.T(x + Math.cos(ang) * rr, y + H + 0.15 + hh * (0.6 + r() * 0.5), z + Math.sin(ang) * rr), M.RY(r() * 3)), cols[i % 4], MAT_V);
  }
  for (let i = 0; i < 6; i++) { // a few kernels spilt on the roof
    const ang = r() * Math.PI * 2, rr = rb + 1.2 + r() * 2.0;
    mb.add(ico(0.5), M.T(x + Math.cos(ang) * rr, y + 0.4, z + Math.sin(ang) * rr), cols[i % 4], MAT_V);
  }
}

// two posts under a camera-facing sign (signs always face the fixed camera azimuth)
function signPosts(mb, x, z, y0, y1, half, r, col) {
  const az = CFG.camera.azimuth, rx = Math.cos(az), rz = -Math.sin(az), fx = Math.sin(az), fz = Math.cos(az);
  for (const s of [-1, 1]) {
    const px = x + rx * half * s - fx * 0.12, pz = z + rz * half * s - fz * 0.12;
    mb.add(cyl(r, r, y1 - y0, 6, false), M.T(px, (y0 + y1) / 2, pz), col, MAT_V);
  }
}

// "Downtown Markham" sign on two posts beside a street on the camera side of the tower cluster,
// at a free spot that no tower hides from the (fixed) camera
function downtownSign(w, lm) {
  const az = CFG.camera.azimuth, rx = Math.cos(az), rz = -Math.sin(az), fx = Math.sin(az), fz = Math.cos(az);
  const ox = lm.x + fx * 22, oz = lm.z + fz * 22;
  const visible = (x, z) => {
    for (let d = 2; d <= 40; d += 2) {
      const px = x + fx * d, pz = z + fz * d;
      for (const b of w.map.buildings) {
        if (b.h < 6.5 + d * 0.85) continue;
        const p = b.p;
        if (px < p[0][0] - 60 || px > p[0][0] + 60 || pz < p[0][1] - 60 || pz > p[0][1] + 60) continue;
        if (pip(px, pz, p)) return false;
      }
    }
    return true;
  };
  const free = (x, z) => {
    const ne = w.nearestEdge(x, z, 14);
    if (!ne || ne.d < 1.8 || ne.d > 9) return false; // beside a street, not on it
    for (let k = -7; k <= 7; k++) {
      const sx = x + rx * k, sz = z + rz * k;
      const n2 = w.nearestEdge(sx, sz, 2);
      if (n2 && n2.d < 0.5) return false;
      if (w.collide(sx, sz, 0.7).hit || w.inWater(sx, sz) || busDist(w.map, sx, sz) < 4.5) return false;
    }
    return visible(x, z);
  };
  let spot = null;
  for (let r = 0; r <= 90 && !spot; r += 3)
    for (let i = 0, n = Math.max(1, Math.round(r / 2)); i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r;
      if (free(x, z)) { spot = [x, z]; break; }
    }
  if (!spot) return;
  lm.sx = spot[0]; lm.sz = spot[1];
  const mb = w.chunk(spot[0], spot[1]).mb;
  signPosts(mb, spot[0], spot[1], 0, 6.2, 5.6, 0.16, '#334155');
  for (const s of [-1, 1]) {
    const px = spot[0] + rx * 5.6 * s, pz = spot[1] + rz * 5.6 * s;
    mb.add(box(0.9, 0.5, 0.9), M.T(px, 0.25, pz), '#94a3b8', MAT_V);
    w.addCollider(rectPoly(px, pz, 0, 0.9, 0.9), 't');
  }
}

// sign specs for the camera-facing sign atlas (World.buildSigns)
export function propSign(lm) {
  if (lm.t === 'unionville') return { text: 'Unionville 老街 Main St', bg: '#2f6b4f', fg: '#fff6dd', x: lm.x, z: lm.z, y: lm.h + 2.2, w: 13, h: 2.0, push: 0 };
  if (lm.t === 'cinema') return { text: 'Cineplax 影城', bg: '#1e1b4b', fg: '#ffd23f', x: lm.x, z: lm.z, y: lm.h + 0.6, w: 12, h: 2.3, push: lm.r * 0.85 };
  if (lm.t === 'downtown' && lm.sx !== undefined) return { text: 'Downtown Markham', bg: '#0f766e', fg: '#ffffff', x: lm.sx, z: lm.sz, y: 4.0, w: 13, h: 2.2, push: 0 };
  if (lm.t === 'gazebo') return { text: 'Toogood Pond', bg: '#7c4a2a', fg: '#fff6dd', x: lm.x, z: lm.z, y: 2.33, w: 4.2, h: 0.62, push: 3.6 };
  return null;
}

// minimap icons for the new landmark types
export function propIcons(g, T, landmarks) {
  const dot = (x, y, r, fill, stroke = '#fff', sq = false) => {
    g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 2; g.beginPath();
    if (sq) g.rect(x - r, y - r, r * 2, r * 2); else g.arc(x, y, r, 0, 7);
    g.fill(); g.stroke();
  };
  for (const lm of landmarks) {
    if (lm.x === undefined) continue;
    const [x, y] = T(lm.x, lm.z);
    if (lm.t === 'unionville') dot(x, y, 7, '#2f6b4f');
    else if (lm.t === 'gazebo') dot(x, y, 5, '#ffffff', '#2f6b4f');
    else if (lm.t === 'cinema') dot(x, y, 6, '#1e1b4b', '#ffd23f', true);
    else if (lm.t === 'downtown') dot(x, y, 7, '#0f766e');
    else if (lm.t === 'viva') dot(x, y, 3.5, '#ffffff', '#2563eb', true); // white square: not a police dot
  }
}

// extra detail on special buildings (called for every OSM/procedural building) ---------------
export function buildingDetail(mb, b) {
  if (b.lm === 'tims') {
    edgeBoxes(mb, b, b.h - 0.35, 0.7, 0.32, COL.cream, 0.15);   // cream roof band
    edgeBoxes(mb, b, 1.9, 1.5, 0.06, COL.window, 0.03, 0.62, 0.2); // shop windows
  } else if (b.lm === 'cinema') {
    edgeBoxes(mb, b, 4.4, 0.45, 0.9, '#ffd23f', 0.45, 1, 0.4);    // glowing marquee band
  } else if (b.k === 'tower') {
    const xs = b.p.map((q) => q[0]), zs = b.p.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...zs) - Math.min(...zs);
    mb.add(box(W + 0.4, 0.5, D + 0.4), M.T(cx, b.h - 0.2, cz), '#f1f5f9', MAT_V);
    mb.add(box(W * 0.45, 1.8, D * 0.45), M.T(cx, b.h + 0.9, cz), '#94a3b8', MAT_V);
  }
}
// boxes along every footprint edge (bands / windows); frac = share of the edge length used
export function edgeBoxes(mb, b, y, h, depth, col, out, frac = 1, em = 0) {
  const p = b.p, n = p.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % n];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < (frac < 1 ? 3 : 0.5)) continue;
    const nx = (dz / L) * sgn, nz = (-dx / L) * sgn;
    const len = frac < 1 ? L * frac : L + depth;
    mb.add(box(len, h, depth), M.chain(M.T((ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out), M.RY(Math.atan2(dx, dz) + Math.PI / 2)), col, MAT_V, em);
  }
}

// Unionville heritage storefronts ------------------------------------------------------------
export function buildHeritage(w) {
  const m = w.map, walls = m.heritageWalls || [], awns = m.heritageAwnings || [];
  let verts = 0;
  for (const s of m.heritage || []) {
    const [x, z, a, W, D, H, wi, ai, style] = s;
    const mb = w.chunk(x, z).mb, v0 = mb.count, F = frame(x, z, a);
    const wall = walls[wi] || '#f4e3b1', awn = awns[ai] || '#e11d48', fz = D / 2;
    put(mb, F, box(W, H, D), at(0, H / 2, 0), wall);
    put(mb, F, box(W + 0.12, 0.45, D + 0.12), at(0, 0.22, 0), '#e7e2d8');
    if (style) {
      put(mb, F, box(W + 0.1, 1.3, 0.3), at(0, H + 0.6, fz - 0.15), wall);           // false front
      put(mb, F, box(W + 0.5, 0.26, 0.55), at(0, H + 1.3, fz - 0.12), COL.white);    // cornice
      put(mb, F, box(W, 0.12, D), at(0, H + 0.06, 0), '#cbd2dc');
    } else {
      put(mb, F, roof(W + 0.5, 2.1, D + 0.5), at(0, H, 0), HERITAGE_ROOFS[(wi + ai) % HERITAGE_ROOFS.length]);
      put(mb, F, box(0.55, 1.4, 0.55), at(W * 0.3, H + 1.2, -D * 0.25), '#9a3412');
    }
    // shop front: big window, door, awning with a white valance, blank name board
    const doorX = (wi % 2 ? 1 : -1) * (W / 2 - 0.95);
    put(mb, F, box(W * 0.56, 1.55, 0.08), at(-doorX * 0.32, 1.35, fz + 0.03), COL.window, 0.2);
    put(mb, F, box(1.0, 2.1, 0.08), at(doorX, 1.05, fz + 0.03), COL.door);
    put(mb, F, box(W * 0.9, 0.12, 1.25), M.chain(at(0, 2.78, fz + 0.58), M.RX(0.38)), awn);
    put(mb, F, box(W * 0.9, 0.3, 0.06), at(0, 2.42, fz + 1.17), COL.white);
    put(mb, F, box(W * 0.66, 0.55, 0.08), at(0, 3.45, fz + 0.04), COL.cream);
    // upper floor windows with white frames
    const nw = W > 7 ? 3 : 2, wy = H - 1.45;
    if (wy > 3.9)
      for (let i = 0; i < nw; i++) {
        const wx = (i - (nw - 1) / 2) * (W / nw);
        put(mb, F, box(1.15, 1.4, 0.05), at(wx, wy, fz + 0.02), COL.white);
        put(mb, F, box(0.85, 1.1, 0.06), at(wx, wy, fz + 0.04), COL.windowUp, 0.15);
      }
    // back: door + upper windows so the side seen from the camera is not blank
    put(mb, F, box(0.95, 2.0, 0.06), at(W * 0.22, 1.0, -fz - 0.03), '#8b5a3c');
    if (wy > 3.9) for (const wx of [-W * 0.25, W * 0.25]) put(mb, F, box(0.85, 1.05, 0.06), at(wx, wy, -fz - 0.03), COL.windowUp, 0.15);
    verts += mb.count - v0;
  }
  return verts;
}

// street props --------------------------------------------------------------------------------
export function buildStreetProps(w) {
  const t0 = performance.now(), cfg = CFG.props, stats = { hydrants: 0, manholes: 0, stops: 0, verts: 0, ms: 0 };
  const F = fastLookups(w);
  const vcount = () => { let n = 0; for (const c of w.chunks.values()) if (c.mb) n += c.mb.count; return n; };
  const v0 = vcount();
  let seed = 905;
  const rl = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // spatial hash for spacing checks
  const mkGrid = (cell) => ({ cell, m: new Map() });
  const gAdd = (G, x, z) => { const k = Math.floor(x / G.cell) + ',' + Math.floor(z / G.cell); if (!G.m.has(k)) G.m.set(k, []); G.m.get(k).push([x, z]); };
  const gNear = (G, x, z, r) => {
    const i0 = Math.floor((x - r) / G.cell), i1 = Math.floor((x + r) / G.cell), j0 = Math.floor((z - r) / G.cell), j1 = Math.floor((z + r) / G.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const [px, pz] of G.m.get(i + ',' + j) || []) if (Math.hypot(px - x, pz - z) < r) return true;
    return false;
  };
  const lamps = mkGrid(20);
  for (const c of w.chunks.values()) for (const l of c.lamps || []) gAdd(lamps, l[0], l[1]);
  const stopsG = mkGrid(20);
  for (const s of w.map.stops || []) gAdd(stopsG, s[0], s[1]);
  for (const lm of w.map.landmarks) if (lm.t === 'viva') gAdd(stopsG, lm.x, lm.z);

  // fire hydrants on the sidewalk next to the curb: first at arterial junction corners, then along
  // arterials (collectors: one side, sparser)
  const hyd = mkGrid(cfg.hydrantGap);
  const tryHydrant = (e, s, dir, off) => {
    if (s < 6 || s > e.len - 6) return false;
    const p = w.edgePoint(e, s, dir, off);
    if (gNear(hyd, p.x, p.z, cfg.hydrantGap) || gNear(lamps, p.x, p.z, 2.6) || gNear(stopsG, p.x, p.z, 7)) return false;
    const ne = w.nearestEdge(p.x, p.z, 3);
    if (ne && ne.d < 0.25) return false; // on another road
    if (F.bus(p.x, p.z) < 3.8 || F.wet(p.x, p.z) || w.collide(p.x, p.z, 0.45).hit) return false;
    hydrant(w.chunk(p.x, p.z).mb, p.x, p.z, Math.atan2(p.dx, p.dz));
    w.addCollider(rectPoly(p.x, p.z, 0, 0.5, 0.5), 't');
    gAdd(hyd, p.x, p.z); stats.hydrants++;
    return true;
  };
  for (let ni = 0; ni < w.nodes.length; ni++) {
    const inc = w.adj[ni];
    if (inc.length < 3 || inc.filter((a) => w.edges[a.e].cls <= 1).length < 2) continue;
    const maxW = Math.max(...inc.map((a) => w.edges[a.e].w));
    for (const a of inc) {
      const e = w.edges[a.e], off = e.w / 2 + cfg.hydrantOffset;
      if (e.cls > 1) continue;
      // one-way carriageways: only the outer (curb) side, i.e. right of the legal direction
      const offs = e.oneway ? [a.dir > 0 ? off : -off] : [off, -off];
      if (offs.some((o) => tryHydrant(e, maxW / 2 + cfg.hydrantCorner, a.dir, o))) break;
    }
  }
  for (const e of w.edges) {
    if (e.cls > 2 || e.len < 2 * cfg.hydrantFirst) continue;
    const spacing = e.cls <= 1 ? cfg.hydrantSpacing : cfg.hydrantSpacing * 1.6;
    const sides = e.oneway || e.cls === 2 ? [1] : [1, -1];
    for (const side of sides)
      for (let s = cfg.hydrantFirst; s < e.len - cfg.hydrantFirst; s += spacing)
        for (const ds of [0, 4, -4, 8]) if (tryHydrant(e, s + ds, side, e.w / 2 + cfg.hydrantOffset)) break;
  }
  // manhole covers on the carriageway, away from junctions, centre lines and the busway
  const mh = mkGrid(cfg.manholeGap);
  for (const e of w.edges) {
    if (e.len < 30 || (e.cls === 3 && rl() > cfg.manholeResidential)) continue;
    let s = 12 + rl() * 20;
    while (s < e.len - 12) {
      let lat = 0;
      if (!e.oneway && e.cls <= 2) lat = (rl() < 0.5 ? -1 : 1) * e.w / 4;
      else if (e.oneway) lat = (rl() - 0.5) * Math.max(0, e.w - 3);
      const p = w.edgePoint(e, s, 1, lat);
      if (!gNear(mh, p.x, p.z, cfg.manholeGap) && F.bus(p.x, p.z) > 4.2 && !F.wet(p.x, p.z)) {
        const mb = w.chunk(p.x, p.z).mb;
        disc(mb, p.x, p.z, 0.62, 0.066, COL.manholeRim, 8);
        disc(mb, p.x, p.z, 0.5, 0.069, COL.manhole, 8);
        gAdd(mh, p.x, p.z); stats.manholes++;
      }
      s += cfg.manholeSpacing[0] + rl() * (cfg.manholeSpacing[1] - cfg.manholeSpacing[0]);
    }
  }
  // bus stops: Viva curbside shelters, small shelters, bench + pole
  for (const st of w.map.stops || []) { busStop(w.chunk(st[0], st[1]).mb, st); stats.stops++; }
  stats.verts = vcount() - v0;
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}

function hydrant(mb, x, z, a) {
  const F = frame(x, z, a);
  if (MODELS.hydrant) { mb.addTriangles(MODELS.hydrant, F); return; } // Polyfork hydrant
  put(mb, F, cyl(0.19, 0.24, 0.72, 6, false), at(0, 0.39, 0), COL.hydrant);
  put(mb, F, ico(0.22), at(0, 0.78, 0), COL.hydrant);
  put(mb, F, box(0.62, 0.13, 0.13), at(0, 0.5, 0), COL.hydrantDark);
}

function busStop(mb, st) {
  const [x, z, a, kind] = st, F = frame(x, z, a);
  if (kind === 2) { // Viva curbside shelter: glass back wall, blue roof, info pylon
    put(mb, F, box(6.0, 0.12, 1.8), at(0, 0.06, 0), COL.platform);
    for (const sx of [-2.7, 2.7]) for (const sz of [-0.7, 0.7]) put(mb, F, cyl(0.07, 0.07, 2.8, 6, false), at(sx, 1.5, sz), COL.post);
    put(mb, F, box(5.6, 1.9, 0.05), at(0, 1.2, -0.75), COL.glass2, 0.2);
    put(mb, F, box(6.2, 0.08, 2.0), at(0, 2.9, 0), COL.glass, 0.25);
    put(mb, F, box(6.4, 0.2, 2.2), at(0, 3.04, 0), COL.viva);
    put(mb, F, box(0.35, 2.4, 0.35), at(3.3, 1.2, 0.3), COL.viva, 0.1);
    put(mb, F, box(0.37, 0.45, 0.37), at(3.3, 2.1, 0.3), COL.white, 0.4);
    put(mb, F, box(2.6, 0.1, 0.45), at(-0.6, 0.5, -0.35), COL.bench);
  } else if (kind === 1 && MODELS.shelter) { // Polyfork shelter (back wall at -z, like ours) + YRT sign
    put(mb, F, box(4.4, 0.1, 2.1), at(0, 0.05, 0), COL.platform);
    mb.addTriangles(MODELS.shelter, M.mul(F, at(0, 0.1, 0)));
    put(mb, F, cyl(0.05, 0.05, 2.7, 6, false), at(2.6, 1.35, 0.8), COL.post);
    put(mb, F, box(0.55, 0.6, 0.05), at(2.6, 2.45, 0.8), COL.yrt, 0.1);
  } else if (kind === 1) { // small shelter
    put(mb, F, box(4.0, 0.1, 1.7), at(0, 0.05, 0), COL.platform);
    for (const sx of [-1.8, 1.8]) for (const sz of [-0.65, 0.65]) put(mb, F, cyl(0.06, 0.06, 2.5, 6, false), at(sx, 1.3, sz), COL.post);
    put(mb, F, box(3.7, 1.7, 0.05), at(0, 1.1, -0.7), COL.glass2, 0.2);
    put(mb, F, box(4.2, 0.16, 1.9), at(0, 2.6, 0), COL.shelterRoof);
    put(mb, F, box(2.2, 0.1, 0.42), at(0, 0.5, -0.35), COL.bench);
    put(mb, F, cyl(0.05, 0.05, 2.7, 6, false), at(2.4, 1.35, 0.6), COL.post);
    put(mb, F, box(0.55, 0.6, 0.05), at(2.4, 2.45, 0.6), COL.yrt, 0.1);
  } else { // bench + bus stop pole
    put(mb, F, box(2.0, 0.1, 0.5), at(0, 0.48, 0), COL.bench);
    put(mb, F, box(2.0, 0.45, 0.1), at(0, 0.82, -0.22), COL.bench);
    for (const sx of [-0.8, 0.8]) put(mb, F, box(0.1, 0.45, 0.45), at(sx, 0.22, 0), COL.post);
    put(mb, F, cyl(0.05, 0.05, 2.7, 6, false), at(1.6, 1.35, 0.25), COL.post);
    put(mb, F, box(0.55, 0.6, 0.05), at(1.6, 2.45, 0.25), COL.yrt, 0.1);
  }
}

export { pip as propPip, busDist as buswayDist };
