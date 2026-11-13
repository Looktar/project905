// 万锦群英传 v1.8 (D-124): the strategy map as a 3D sandtable.
// The baked ink map (paper + little pictures, js/sg_paper.js and js/sg_map.js) is laid over a terrain made from the
// real elevation (js/sg_elev.js, exaggerated so Markham's gentle hills read), lit by a low sun, standing on a wooden
// table body with a gold rim. Territory washes, season tints and cloud shadows are mixed in the shader. Everything
// that moves or is read (roads, cities, armies, labels) is still drawn by js/sg_ui.js on its 2D canvas on top, at
// positions projected through this camera, so it stands on the sandtable.
// World: x east, z south, y up, metres. The camera looks at (cx, h, cz) from `dist` away, tilted `pitch` from
// straight down, turned `yaw` about the vertical (0: north is up the screen).

import { ELEV } from './sg_elev.js';
import { elevAt } from './sg_data.js';

const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv; in float aKind;
uniform mat4 uMVP;
out vec3 vNor; out vec2 vUv; out float vKind; out vec3 vPos;
void main() { vNor = aNor; vUv = aUv; vKind = aKind; vPos = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec3 vNor; in vec2 vUv; in float vKind; in vec3 vPos;
uniform sampler2D uPaper, uTerr, uTerrOld;
uniform float uMix, uHasTerr;
uniform vec4 uTint;
uniform vec3 uCloud[3];
uniform vec3 uSun;
out vec4 o;
void main() {
  vec3 n = normalize(vNor);
  float lit = clamp(0.62 + 0.55 * dot(n, uSun), 0.45, 1.12);
  if (vKind < 0.5) { // the map
    vec3 c = texture(uPaper, vUv).rgb;
    if (uHasTerr > 0.5) {
      vec4 t1 = texture(uTerr, vUv), t0 = texture(uTerrOld, vUv);
      vec4 t = mix(t0, t1, uMix);
      c = mix(c, t.rgb, t.a);
    }
    c = mix(c, uTint.rgb, uTint.a);
    for (int i = 0; i < 3; i++) {
      vec2 d = (vPos.xz - uCloud[i].xy) / vec2(1.5, 1.0);
      c *= 1.0 - 0.10 * (1.0 - smoothstep(0.1, 1.0, length(d) / uCloud[i].z));
    }
    o = vec4(c * lit, 1.0);
  } else if (vKind < 1.5) { // the table's wooden sides, darker towards the bottom, with a little grain
    float g = 0.9 + 0.1 * sin(vUv.x * 900.0 + sin(vUv.y * 40.0) * 3.0);
    vec3 w = mix(vec3(0.20, 0.12, 0.07), vec3(0.42, 0.26, 0.14), clamp(vUv.y, 0.0, 1.0)) * g;
    o = vec4(w * clamp(0.75 + 0.35 * dot(n, uSun), 0.5, 1.1), 1.0);
  } else if (vKind < 2.5) { // the gold rim
    o = vec4(vec3(0.79, 0.62, 0.30) * clamp(0.8 + 0.4 * dot(n, uSun), 0.6, 1.2), 1.0);
  } else { // the soft shadow the table casts on the desk
    float e = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    o = vec4(0.0, 0.0, 0.0, 0.5 * (1.0 - smoothstep(0.78, 1.0, e)));
  }
}`;

export const RELIEF = 210; // metres from the lowest to the highest ground on the table (real: about 48 m)
export const BASE = 70; // how far the wooden sides go below the lowest ground

export class Table {
  constructor(canvas) {
    this.cv = canvas;
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false }); } catch (e) { gl = null; }
    this.gl = gl; this.ok = !!gl;
    if (!gl) return;
    // a software renderer (no GPU) draws the table at a few frames a second: stay flat there unless asked (?sg3d=1)
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'), who = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.soft = /swiftshader|llvmpipe|software|basic render/i.test(who); this.forced = /[?&]sg3d=1/.test(globalThis.location ? location.search : '');
    if (this.soft && !this.forced) { this.ok = false; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      this.prog = p;
    } catch (e) { console.warn('sandtable:', e); this.ok = false; return; }
    const u = (n) => gl.getUniformLocation(this.prog, n);
    this.u = { mvp: u('uMVP'), paper: u('uPaper'), terr: u('uTerr'), terrOld: u('uTerrOld'), mix: u('uMix'), hasTerr: u('uHasTerr'), tint: u('uTint'), cloud: u('uCloud'), sun: u('uSun') };
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.tex = {};
  }
  // ------------------------------------------------------------ the ground
  // heights on a grid, smoothed (the elevation data is coarse), then mapped onto 0..RELIEF
  build(map) {
    if (!this.ok) return;
    const [HW, HH] = map.half, GX = 200, GZ = Math.round(GX * HH / HW), gl = this.gl;
    this.half = [HW, HH]; this.GX = GX; this.GZ = GZ;
    let h = new Float32Array((GX + 1) * (GZ + 1));
    for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) h[j * (GX + 1) + i] = elevAt(-HW + 2 * HW * i / GX, -HH + 2 * HH * j / GZ);
    for (let pass = 0; pass < 3; pass++) { // box blur
      const n = new Float32Array(h.length);
      for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) {
        let a = 0, c = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const x = i + di, z = j + dj; if (x >= 0 && z >= 0 && x <= GX && z <= GZ) { a += h[z * (GX + 1) + x]; c++; } }
        n[j * (GX + 1) + i] = a / c;
      }
      h = n;
    }
    let lo = 1e9, hi = -1e9;
    for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const ex = RELIEF / Math.max(1, hi - lo);
    for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) * ex;
    this.h = h; this.top = RELIEF;
    // vertices: [x y z  nx ny nz  u v  kind]
    const V = [], I = [], at = (i, j) => h[Math.max(0, Math.min(GZ, j)) * (GX + 1) + Math.max(0, Math.min(GX, i))];
    const dx = 2 * HW / GX, dz = 2 * HH / GZ;
    for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) {
      const nx = -(at(i + 1, j) - at(i - 1, j)) / (2 * dx), nz = -(at(i, j + 1) - at(i, j - 1)) / (2 * dz), l = Math.hypot(nx, 1, nz);
      V.push(-HW + i * dx, at(i, j), -HH + j * dz, nx / l, 1 / l, nz / l, i / GX, j / GZ, 0);
    }
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1; I.push(a, c, b, b, c, d); }
    // the sides: a gold rim along the top edge, then wood down to the base
    const side = (pts, nx, nz) => {
      let len = 0;
      for (let q = 0; q < pts.length; q++) {
        const [x, z, y] = pts[q];
        if (q) len += Math.hypot(x - pts[q - 1][0], z - pts[q - 1][1]);
        const b = V.length / 9, u = len / 4000;
        V.push(x, y + 2, z, nx, 0, nz, u, 1, 2, x, y - 5, z, nx, 0, nz, u, 1, 2, x, y - 5, z, nx, 0, nz, u, 1, 1, x, -BASE, z, nx, 0, nz, u, 0, 1);
        if (q) { const a = b - 4; I.push(a, a + 1, b, b, a + 1, b + 1, a + 2, a + 3, b + 2, b + 2, a + 3, b + 3); }
      }
    };
    const edge = (n, f) => Array.from({ length: n + 1 }, (_, q) => f(q));
    side(edge(GX, (i) => [-HW + i * dx, HH, at(i, GZ)]), 0, 1);
    side(edge(GX, (i) => [HW - i * dx, -HH, at(GX - i, 0)]), 0, -1);
    side(edge(GZ, (j) => [-HW, -HH + j * dz, at(0, j)]).reverse(), -1, 0);
    side(edge(GZ, (j) => [HW, -HH + j * dz, at(GX, j)]), 1, 0);
    // a lip of rim right on the map's edge, so the paper never looks cut with scissors
    // the shadow on the desk, a little bigger than the table
    const sb = V.length / 9, m = 260, y = -BASE - 1;
    V.push(-HW - m, y, -HH - m, 0, 1, 0, 0, 0, 3, HW + m, y, -HH - m, 0, 1, 0, 1, 0, 3, -HW - m, y, HH + m, 0, 1, 0, 0, 1, 3, HW + m, y, HH + m, 0, 1, 0, 1, 1, 3);
    I.push(sb, sb + 2, sb + 1, sb + 1, sb + 2, sb + 3);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW);
    if (this.vao) gl.deleteVertexArray(this.vao);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const attr = (name, n, off) => { const l = gl.getAttribLocation(this.prog, name); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 36, off * 4); };
    attr('aPos', 3, 0); attr('aNor', 3, 3); attr('aUv', 2, 6); attr('aKind', 1, 8);
    gl.bindVertexArray(null);
    this.vao = vao; this.count = I.length;
  }
  // ground height (table metres) at world x, z
  height(x, z) {
    if (!this.h) return 0;
    const [HW, HH] = this.half, GX = this.GX, GZ = this.GZ;
    const fx = Math.min(GX - 0.001, Math.max(0, (x + HW) / (2 * HW) * GX)), fz = Math.min(GZ - 0.001, Math.max(0, (z + HH) / (2 * HH) * GZ));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = (a, b) => this.h[b * (GX + 1) + a];
    return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
  }
  // ------------------------------------------------------------ textures
  texture(name, src) {
    if (!this.ok) return;
    const gl = this.gl;
    let t = this.tex[name];
    if (!t) { t = gl.createTexture(); this.tex[name] = t; }
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  // ------------------------------------------------------------ the camera
  // view: { cx, cz, k (px per metre at the target), yaw, pitch, ox, oy (screen point the target sits on), W, H }
  camera(v) {
    const fov = 32 * Math.PI / 180, f = (v.H / 2) / Math.tan(fov / 2), d = f / v.k;
    const ty = this.height(v.cx, v.cz), sp = Math.sin(v.pitch), cp = Math.cos(v.pitch), sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
    const eye = [v.cx + d * sp * sy, ty + d * cp, v.cz + d * sp * cy], tgt = [v.cx, ty, v.cz];
    // basis: forward, right, up (the up hint points north turned by yaw, never parallel to forward)
    const fw = norm(sub(tgt, eye)), hint = [-sy, 0, -cy], rt = norm(cross(fw, hint.map((x, i) => x + (i === 1 ? 1e-6 : 0)))), up = cross(rt, fw);
    const near = d * 0.05, far = d * 6 + 9000, a = v.W / v.H, tf = 1 / Math.tan(fov / 2);
    // off-centre: the target lands on (ox, oy), not the middle of the canvas
    const offx = (v.ox - v.W / 2) / (v.W / 2), offy = -(v.oy - v.H / 2) / (v.H / 2);
    const view = [rt[0], up[0], -fw[0], 0, rt[1], up[1], -fw[1], 0, rt[2], up[2], -fw[2], 0, -dot(rt, eye), -dot(up, eye), dot(fw, eye), 1];
    const proj = [tf / a, 0, 0, 0, 0, tf, 0, 0, offx, offy, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0];
    // the off-centre shift must follow w: x_clip += offx * w, which is what putting it in column 3 (row 0/1) does
    proj[8] = -offx; proj[9] = -offy;
    this.m = mul(proj, view); this.v = { ...v, eye, fw, rt, up, f, d, tf, a, offx, offy };
  }
  // world point -> [screen x, screen y, scale] (scale: 1 at the target's distance, bigger nearer the camera)
  project(x, y, z) {
    const m = this.m, X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Wc = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (Wc <= 1e-3) return [-9999, -9999, 0];
    const v = this.v;
    return [(X / Wc * 0.5 + 0.5) * v.W, (-Y / Wc * 0.5 + 0.5) * v.H, v.d / Wc];
  }
  // screen point -> world [x, z] on the ground (a plane at the target's height)
  unproject(sx, sy) {
    const v = this.v, nx = sx / v.W * 2 - 1 - v.offx, ny = -(sy / v.H * 2 - 1) - v.offy;
    const dir = norm([v.fw[0] + v.rt[0] * nx * v.a / v.tf + v.up[0] * ny / v.tf, v.fw[1] + v.rt[1] * nx * v.a / v.tf + v.up[1] * ny / v.tf, v.fw[2] + v.rt[2] * nx * v.a / v.tf + v.up[2] * ny / v.tf]);
    const gy = this.height(v.cx, v.cz);
    if (dir[1] > -1e-4) return [v.cx, v.cz];
    const t = (gy - v.eye[1]) / dir[1];
    return [v.eye[0] + dir[0] * t, v.eye[2] + dir[2] * t];
  }
  // ------------------------------------------------------------ drawing
  // o: { mix (0..1 old->new territory), tint [r,g,b,a], clouds [[x,z,r] x3], dpr }
  render(o) {
    if (!this.ok || !this.vao) return;
    const gl = this.gl, cv = this.cv;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.mvp, false, this.m);
    const bind = (unit, name, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[name] || this.tex.paper); gl.uniform1i(loc, unit); };
    bind(0, 'paper', this.u.paper); bind(1, 'terr', this.u.terr); bind(2, this.tex.terrOld ? 'terrOld' : 'terr', this.u.terrOld);
    gl.uniform1f(this.u.mix, o.mix ?? 1); gl.uniform1f(this.u.hasTerr, this.tex.terr ? 1 : 0);
    gl.uniform4fv(this.u.tint, o.tint || [0, 0, 0, 0]);
    const cl = (o.clouds || []).concat([[0, 0, 1], [0, 0, 1], [0, 0, 1]]).slice(0, 3);
    gl.uniform3fv(this.u.cloud, cl.flatMap((c) => (c[2] > 1 ? c : [1e6, 1e6, 1])));
    gl.uniform3fv(this.u.sun, norm([-0.6, 0.62, -0.5])); // a low sun from the north-west
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// column-major 4x4 product a * b
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
void ELEV;
