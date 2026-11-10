// MeshBuilder: bakes many small coloured shapes into one flat-shaded BufferGeometry.
import * as THREE from '../vendor/three.module.min.js';

const cache = new Map();
const tmp = new THREE.Color();
export function rgb(hex) {
  let c = cache.get(hex);
  if (!c) { tmp.set(hex); c = [tmp.r, tmp.g, tmp.b]; cache.set(hex, c); }
  return c;
}
export function shade(hex, k) { tmp.set(hex).multiplyScalar(k); return '#' + tmp.getHexString(); }

export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  get empty() { return !this.p.length; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, col) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    const [r, g, b] = typeof col === 'string' ? rgb(col) : col;
    this.c.push(r, g, b, r, g, b, r, g, b);
  }
  // quad a-b-c-d (counter-clockwise seen from the front)
  quad(a, b, c, d, col) { this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col); this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], col); }
  // flat polygon at height y from a triangle index list (faces up)
  flat(poly, tris, y, col) {
    for (const t of tris) {
      const a = poly[t[0]], b = poly[t[1]], c = poly[t[2]];
      const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
      if (up) this.tri(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], col); else this.tri(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1], col);
    }
  }
  // ribbon of width w along a polyline at height y
  ribbon(pts, w, y, col) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      this.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], col);
    }
  }
  disc(x, z, r, y, col, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      this.tri(x, y, z, x + Math.sin(a) * r, y, z + Math.cos(a) * r, x + Math.sin(b) * r, y, z + Math.cos(b) * r, col);
    }
  }
  // extruded polygon: walls y0..y1 plus roof
  prism(poly, tris, y0, y1, wall, roof) {
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[area > 0 ? i : (n - i) % n], b = poly[area > 0 ? (i + 1) % n : (n - i - 1 + n) % n];
      this.quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], wall);
    }
    if (tris) this.flat(poly, tris, y1, roof || wall);
  }
  // oriented box: centre (x, y, z) is the middle of the base; a rotates around y
  box(x, y, z, sx, sy, sz, a, col, top) {
    const c = Math.cos(a), s = Math.sin(a), hx = sx / 2, hz = sz / 2;
    const f = (lx, lz, yy) => [x + c * lx + s * lz, yy, z - s * lx + c * lz];
    const y1 = y + sy;
    const p = [f(-hx, -hz, y), f(hx, -hz, y), f(hx, hz, y), f(-hx, hz, y)], q = [f(-hx, -hz, y1), f(hx, -hz, y1), f(hx, hz, y1), f(-hx, hz, y1)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(p[j], p[i], q[i], q[j], col); }
    this.quad(q[0], q[3], q[2], q[1], top || col);
  }
  // gable roof over a w x d footprint, ridge along local x
  gable(x, y, z, w, d, h, a, col) {
    const c = Math.cos(a), s = Math.sin(a), hx = w / 2, hz = d / 2;
    const f = (lx, lz, yy) => [x + c * lx + s * lz, yy, z - s * lx + c * lz];
    const a0 = f(-hx, -hz, y), a1 = f(hx, -hz, y), a2 = f(hx, hz, y), a3 = f(-hx, hz, y), r0 = f(-hx * 0.86, 0, y + h), r1 = f(hx * 0.86, 0, y + h);
    this.quad(a1, a0, r0, r1, col); this.quad(a3, a2, r1, r0, col);
    const side = shade(typeof col === 'string' ? col : '#888888', 0.85);
    this.tri(...a0, ...a3, ...r0, side); this.tri(...a2, ...a1, ...r1, side);
  }
  // tapered cylinder / cone along y
  cyl(x, y, z, r0, r1, h, col, n = 8, cap = true) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b);
      this.quad([x + sa * r0, y, z + ca * r0], [x + sb * r0, y, z + cb * r0], [x + sb * r1, y + h, z + cb * r1], [x + sa * r1, y + h, z + ca * r1], col);
      if (cap && r1 > 0.01) this.tri(x, y + h, z, x + sa * r1, y + h, z + ca * r1, x + sb * r1, y + h, z + cb * r1, col);
    }
  }
  // low-poly blob (squashed icosahedron) for tree crowns and scoops
  blob(x, y, z, r, col, sy = 1, col2) {
    const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const k = r / Math.hypot(1, t);
    F.forEach((f, i) => {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]];
      this.tri(x + a[0] * k, y + a[1] * k * sy, z + a[2] * k, x + b[0] * k, y + b[1] * k * sy, z + b[2] * k, x + c[0] * k, y + c[1] * k * sy, z + c[2] * k, col2 && i % 3 === 0 ? col2 : col);
    });
  }
  torus(x, y, z, R, r, col, col2, n = 14, m = 7) {
    const P = (i, j) => { const a = i / n * Math.PI * 2, b = j / m * Math.PI * 2, rr = R + Math.cos(b) * r; return [x + Math.sin(a) * rr, y + Math.sin(b) * r, z + Math.cos(a) * rr]; };
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) this.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), col2 && j >= 1 && j <= 2 ? col2 : col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingSphere();
    return g;
  }
}
