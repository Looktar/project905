// Geometry primitives + a mesh builder that bakes transforms into flat arrays.
import { M, hex } from './math.js';

function nmat(m) {
  const A = m[0], B = m[4], C = m[8], D = m[1], E = m[5], F = m[9], G = m[2], H = m[6], K = m[10];
  const det = A * (E * K - F * H) - B * (D * K - F * G) + C * (D * H - E * G);
  const inv = [E * K - F * H, -(B * K - C * H), B * F - C * E, -(D * K - F * G), A * K - C * G, -(A * F - C * D), D * H - E * G, -(A * H - B * G), A * E - B * D].map((v) => v / det);
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

// material codes stored in colour alpha: 0 = instance colour A, 1 = instance colour B, 2 = vertex colour
export const MAT_A = 0, MAT_B = 1, MAT_V = 2;

export class MeshBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; }
  get count() { return this.P.length / 3; }
  add(g, m, col, mat = MAT_V, em = 0) {
    const nm = nmat(m);
    const c = col ? hex(col) : [1, 1, 1];
    const P = this.P, N = this.N, C = this.C;
    const gp = g.p, gn = g.n;
    for (let i = 0; i < gp.length; i += 3) {
      const x = gp[i], y = gp[i + 1], z = gp[i + 2];
      P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const a = gn[i], b = gn[i + 1], d = gn[i + 2];
      let nx = nm[0] * a + nm[1] * b + nm[2] * d, ny = nm[3] * a + nm[4] * b + nm[5] * d, nz = nm[6] * a + nm[7] * b + nm[8] * d;
      const l = Math.hypot(nx, ny, nz) || 1;
      N.push(nx / l, ny / l, nz / l);
      C.push(c[0], c[1], c[2], mat + em * 0.1); // emissive packed: mat + em*0.1 (em<=0.9)
    }
  }
  // triangles from glb.js (p, n, c flat arrays; per-vertex colours) baked through matrix m
  addTriangles(t, m, mat = MAT_V, em = 0) {
    const nm = nmat(m), P = this.P, N = this.N, C = this.C;
    for (let i = 0; i < t.p.length; i += 3) {
      const x = t.p[i], y = t.p[i + 1], z = t.p[i + 2];
      P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const a = t.n[i], b = t.n[i + 1], d = t.n[i + 2];
      const nx = nm[0] * a + nm[1] * b + nm[2] * d, ny = nm[3] * a + nm[4] * b + nm[5] * d, nz = nm[6] * a + nm[7] * b + nm[8] * d;
      const l = Math.hypot(nx, ny, nz) || 1;
      N.push(nx / l, ny / l, nz / l);
      // t.mat (optional, one per vertex) overrides mat, e.g. MAT_A on a car's paint for per-car colours
      C.push(t.c[i], t.c[i + 1], t.c[i + 2], (t.mat ? t.mat[i / 3] : mat) + em * 0.1);
    }
  }
  // raw triangles with one normal (for flat ground pieces)
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, col, nx = 0, ny = 1, nz = 0, mat = MAT_V) {
    const c = hex(col);
    this.P.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    for (let i = 0; i < 3; i++) this.C.push(c[0], c[1], c[2], mat);
  }
  quad(a, b, c, d, col, n, mat = MAT_V) {
    this.tri(...a, ...b, ...c, col, ...n, mat);
    this.tri(...a, ...c, ...d, col, ...n, mat);
  }
}

const cache = new Map();
export function rbox(w, h, d, r = 0, m = 2) {
  const key = 'rb' + [w, h, d, r, m].join(',');
  if (cache.has(key)) return cache.get(key);
  const H = [w / 2, h / 2, d / 2];
  r = Math.min(r, ...H);
  const I = H.map((v) => v - r);
  const p = [], n = [];
  const coords = (ax) => {
    if (r <= 0) return [-H[ax], H[ax]];
    const a = [];
    for (let k = 0; k <= m; k++) a.push(-I[ax] - r * Math.cos((k / m) * Math.PI / 2));
    for (let k = 0; k <= m; k++) a.push(I[ax] + r * Math.sin((k / m) * Math.PI / 2));
    return a;
  };
  const cl = (v, l) => Math.max(-l, Math.min(l, v));
  const pt = (q, a, s) => {
    const inn = [cl(q[0], I[0]), cl(q[1], I[1]), cl(q[2], I[2])];
    let v = [q[0] - inn[0], q[1] - inn[1], q[2] - inn[2]];
    const L = Math.hypot(...v);
    if (L < 1e-6) { v = [0, 0, 0]; v[a] = s; } else v = v.map((x) => x / L);
    return [[inn[0] + v[0] * r, inn[1] + v[1] * r, inn[2] + v[2] * r], v];
  };
  for (const [a, u, vv] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]])
    for (const s of [1, -1]) {
      const U = coords(u), V = coords(vv);
      for (let i = 0; i < U.length - 1; i++)
        for (let j = 0; j < V.length - 1; j++) {
          const q = (ii, jj) => { const o = [0, 0, 0]; o[a] = s * H[a]; o[u] = U[ii]; o[vv] = V[jj]; return pt(o, a, s); };
          const A = q(i, j), B = q(i + 1, j), Cc = q(i + 1, j + 1), D = q(i, j + 1);
          for (const t of [A, B, Cc, A, Cc, D]) { p.push(...t[0]); n.push(...t[1]); }
        }
    }
  const g = { p, n };
  cache.set(key, g);
  return g;
}
export const box = (w, h, d) => rbox(w, h, d, 0);

export function sphere(r = 1, s = 12) {
  const key = 'sp' + r + ',' + s;
  if (cache.has(key)) return cache.get(key);
  const p = [], n = [];
  const v = (i, j) => { const th = (i / s) * Math.PI, ph = (j / (2 * s)) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
  for (let i = 0; i < s; i++)
    for (let j = 0; j < 2 * s; j++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      for (const t of [a, b, c, a, c, d]) { p.push(t[0] * r, t[1] * r, t[2] * r); n.push(...t); }
    }
  const g = { p, n };
  cache.set(key, g);
  return g;
}

// flat-shaded icosahedron (low-poly canopy / puffs)
export function ico(r = 1) {
  const key = 'ico' + r;
  if (cache.has(key)) return cache.get(key);
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((q) => { const l = Math.hypot(...q); return q.map((x) => (x / l) * r); });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const p = [], n = [];
  for (const [a, b, c] of f) {
    const A = v[a], B = v[b], C = v[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...nn); nn = nn.map((x) => x / l);
    p.push(...A, ...B, ...C); n.push(...nn, ...nn, ...nn);
  }
  const g = { p, n };
  cache.set(key, g);
  return g;
}

export function cyl(rt, rb, h, s = 16, caps = true) {
  const key = 'cy' + [rt, rb, h, s, caps].join(',');
  if (cache.has(key)) return cache.get(key);
  const p = [], n = [];
  const sl = (rb - rt) / h;
  for (let j = 0; j < s; j++) {
    const a0 = (j / s) * Math.PI * 2, a1 = ((j + 1) / s) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const q = [[rb * c0, -h / 2, rb * s0, c0, s0], [rb * c1, -h / 2, rb * s1, c1, s1], [rt * c1, h / 2, rt * s1, c1, s1], [rt * c0, h / 2, rt * s0, c0, s0]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const t = q[k]; p.push(t[0], t[1], t[2]); const L = Math.hypot(t[3], sl, t[4]); n.push(t[3] / L, sl / L, t[4] / L); }
    if (caps) {
      p.push(0, h / 2, 0, rt * c0, h / 2, rt * s0, rt * c1, h / 2, rt * s1); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      p.push(0, -h / 2, 0, rb * c1, -h / 2, rb * s1, rb * c0, -h / 2, rb * s0); n.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    }
  }
  const g = { p, n };
  cache.set(key, g);
  return g;
}

export function torus(R, r, a = 28, b = 12, arc = Math.PI * 2) {
  const p = [], n = [];
  const v = (i, j) => {
    const u = (i / a) * arc, w = (j / b) * Math.PI * 2;
    const cx = Math.cos(u), sx = Math.sin(u);
    return [[(R + r * Math.cos(w)) * cx, r * Math.sin(w), (R + r * Math.cos(w)) * sx], [Math.cos(w) * cx, Math.sin(w), Math.cos(w) * sx]];
  };
  for (let i = 0; i < a; i++)
    for (let j = 0; j < b; j++) {
      const A = v(i, j), B = v(i + 1, j), C = v(i + 1, j + 1), D = v(i, j + 1);
      for (const t of [A, B, C, A, C, D]) { p.push(...t[0]); n.push(...t[1]); }
    }
  return { p, n };
}

export function roof(w, h, d) {
  const x = w / 2, z = d / 2, p = [], n = [];
  const tri = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn); nn = nn.map((q) => q / l);
    p.push(...a, ...b, ...c); n.push(...nn, ...nn, ...nn);
  };
  const A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], E = [0, h, -z], F = [0, h, z];
  tri(D, C, F); tri(A, E, B); tri(A, D, F); tri(A, F, E); tri(B, E, F); tri(B, F, C);
  return { p, n };
}

export function star(R = 0.28) {
  const p = [], n = [], pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? R * 0.45 : R; pts.push([Math.cos(a) * r, -Math.sin(a) * r]); }
  for (let i = 0; i < 10; i++) {
    const a = pts[i], b = pts[(i + 1) % 10];
    p.push(0, 0, 0.02, a[0], a[1], 0.02, b[0], b[1], 0.02); n.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    p.push(0, 0, -0.02, b[0], b[1], -0.02, a[0], a[1], -0.02); n.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
  }
  return { p, n };
}

// ---- flat ground helpers (write straight into a MeshBuilder) ----
export function ribbon(mb, pts, w, y, col, capRound = true) {
  const h = w / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    const nx = (-dz / L) * h, nz = (dx / L) * h;
    mb.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], col, [0, 1, 0]);
  }
  if (capRound) for (const [x, z] of pts) disc(mb, x, z, h, y, col, 10);
}
export function disc(mb, x, z, r, y, col, s = 12) {
  for (let i = 0; i < s; i++) {
    const a0 = (i / s) * Math.PI * 2, a1 = ((i + 1) / s) * Math.PI * 2;
    mb.tri(x, y, z, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, col);
  }
}
export function flatPoly(mb, poly, tris, y, col) {
  for (const [a, b, c] of tris) {
    const A = poly[a], B = poly[b], C = poly[c];
    mb.tri(A[0], y, A[1], B[0], y, B[1], C[0], y, C[1], col);
  }
}
export function extrude(mb, poly, tris, h, wallCol, roofCol) {
  const n = poly.length;
  // orientation
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  const sgn = area > 0 ? 1 : -1;
  const wc = hex(wallCol);
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const nx = (dz / L) * sgn, nz = (-dx / L) * sgn;
    // slightly darker band at the bottom gives a toy-like base
    mb.quad([ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], wc, [nx, 0, nz]);
  }
  flatPoly(mb, poly, tris, h, roofCol);
}

export function ident() { return M.I(); }
