// 万锦群英传 v1.3 (D-110): the board as an old map. Baked once into a canvas: rice paper with fibres and stains,
// the real ground height as ink-wash hills and contour lines, rivers in brush strokes, lakes hatched, parks with
// little ink trees, every street and building of Markham in faint ink, burnt edges and a red seal.
// Drawn at R px per game metre; the strategy screen scales it like the old minimap.

import { ELEV } from './sg_elev.js';
import { elevAt } from './sg_data.js';

export const PAPER_R = 0.75; // px per metre (a 2.6k x 2k canvas)

// cheap value noise
function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function bakePaper(map, R = PAPER_R) {
  const [HW, HH] = map.half, W = Math.ceil(HW * 2 * R), H = Math.ceil(HH * 2 * R);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const toPx = (x, z) => [(x + HW) * R, (z + HH) * R];

  // ---- 1. paper, hills and contours, pixel by pixel. Height and shade come from a coarse grid (every 4 px).
  const G = 4, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2, el = new Float32Array(gw * gh), sh = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) el[j * gw + i] = elevAt(i * G / R - HW, j * G / R - HH);
  // the height data is a 100 m grid: smooth it (three box blurs, about 80 m) so hills read as soft ink, not facets
  const blur = (src, r) => {
    const tmp = new Float32Array(src.length);
    for (let j = 0; j < gh; j++) { let acc = 0; for (let i = -r; i <= r; i++) acc += src[j * gw + Math.min(gw - 1, Math.max(0, i))]; for (let i = 0; i < gw; i++) { tmp[j * gw + i] = acc / (2 * r + 1); acc += src[j * gw + Math.min(gw - 1, i + r + 1)] - src[j * gw + Math.max(0, i - r)]; } }
    for (let i = 0; i < gw; i++) { let acc = 0; for (let j = -r; j <= r; j++) acc += tmp[Math.min(gh - 1, Math.max(0, j)) * gw + i]; for (let j = 0; j < gh; j++) { src[j * gw + i] = acc / (2 * r + 1); acc += tmp[Math.min(gh - 1, j + r + 1) * gw + i] - tmp[Math.max(0, j - r) * gw + i]; } }
  };
  const rb = Math.max(2, Math.round(30 * R / G));
  for (let n = 0; n < 3; n++) blur(el, rb);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const a = el[Math.max(0, j - 2) * gw + Math.max(0, i - 2)], b = el[Math.min(gh - 1, j + 2) * gw + Math.min(gw - 1, i + 2)];
    sh[j * gw + i] = Math.max(-1, Math.min(1, (a - b) * 0.9)); // light from the north-west
  }
  const lo = ELEV.lo, span = ELEV.hi - ELEV.lo, STEP = 6; // a contour every 6 m
  const img = c.createImageData(W, H), d = img.data, prev = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    const gy = y / G, j = Math.floor(gy), fy = gy - j;
    let left = 0;
    for (let x = 0; x < W; x++) {
      const gx = x / G, i = Math.floor(gx), fx = gx - i, k = j * gw + i;
      const e = (el[k] * (1 - fx) + el[k + 1] * fx) * (1 - fy) + (el[k + gw] * (1 - fx) + el[k + gw + 1] * fx) * fy;
      const s = (sh[k] * (1 - fx) + sh[k + 1] * fx) * (1 - fy) + (sh[k + gw] * (1 - fx) + sh[k + gw + 1] * fx) * fy;
      const t = Math.max(0, Math.min(1, (e - lo) / span));
      // rice paper: warm, a little greener in the low ground, ochre on the heights
      let r = 236 - 10 * t, g = 226 - 22 * t, b = 196 - 40 * t;
      // stains and fibres
      const n1 = vnoise(x / 180, y / 180), n2 = vnoise(x / 40 + 9, y / 40 + 3), n3 = hash(x, y);
      const stain = (n1 - 0.5) * 18 + (n2 - 0.5) * 8 + (n3 - 0.5) * 7;
      r += stain; g += stain * 0.95; b += stain * 0.8;
      // ink-wash hills: the shadow side darkens, the lit side lightens a touch
      const ink = Math.max(0, -s) * 0.34 + t * 0.07;
      r = r * (1 - ink) + 92 * ink; g = g * (1 - ink) + 76 * ink; b = b * (1 - ink) + 58 * ink;
      if (s > 0) { r += s * 10; g += s * 9; b += s * 6; }
      // contour lines where the band changes (against the pixel to the left and above)
      const band = Math.floor((e - lo) / STEP);
      if (x > 0 && y > 0 && (band !== Math.floor((left - lo) / STEP) || band !== Math.floor((prev[x] - lo) / STEP))) {
        const major = band % 4 === 0, a = major ? 0.42 : 0.24;
        r = r * (1 - a) + 110 * a; g = g * (1 - a) + 80 * a; b = b * (1 - a) + 52 * a;
      }
      prev[x] = e; left = e;
      const o = (y * W + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);

  c.lineCap = 'round'; c.lineJoin = 'round';
  const path = (pts) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = toPx(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); };
  const poly = (pts) => { path(pts); c.closePath(); };

  // ---- 2. parks: a green wash and little ink trees
  c.fillStyle = 'rgba(120,150,80,.16)';
  for (const a of map.parks) { poly(a.p); c.fill(); }
  const tree = (x, y, k) => {
    c.fillStyle = 'rgba(70,90,50,.38)'; c.beginPath(); c.arc(x, y - 2.6 * k, 2.2 * k, 0, 7); c.fill();
    c.strokeStyle = 'rgba(70,58,40,.45)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y - 0.8 * k); c.lineTo(x, y + 1.2 * k); c.stroke();
  };
  for (let n = 0; n < map.trees.length; n += 3) { const [x, z] = map.trees[n]; const [px, py] = toPx(x, z); tree(px, py, 1 + hash(n, 7) * 0.5); }

  // ---- 3. Markham in faint ink: houses, buildings, streets, rail, the 407
  c.fillStyle = 'rgba(96,72,48,.13)';
  for (const h of map.houses) {
    const [x, z, a, w, dd] = h, cs = Math.cos(a), sn = Math.sin(a), hw = w / 2, hd = dd / 2;
    poly([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + cs * lx + sn * lz, z - sn * lx + cs * lz])); c.fill();
  }
  c.fillStyle = 'rgba(96,72,48,.16)'; c.strokeStyle = 'rgba(96,72,48,.26)'; c.lineWidth = 0.7;
  for (const b of map.buildings) { poly(b.p); c.fill(); c.stroke(); }
  for (const e of map.edges) {
    const cls = e[2], w = e[3], pts = e[6];
    path(pts);
    if (cls <= 1) { c.strokeStyle = 'rgba(96,72,48,.42)'; c.lineWidth = Math.max(2.6, w * R * 0.7); c.stroke(); c.strokeStyle = 'rgba(244,234,208,.75)'; c.lineWidth = Math.max(1.2, w * R * 0.45); c.stroke(); }
    else { c.strokeStyle = cls === 2 ? 'rgba(96,72,48,.34)' : 'rgba(96,72,48,.2)'; c.lineWidth = cls === 2 ? 2 : 1.2; c.stroke(); }
  }
  for (const pts of map.rails) {
    path(pts); c.strokeStyle = 'rgba(70,52,35,.55)'; c.lineWidth = 1.4; c.stroke();
    c.setLineDash([1.4, 5]); c.lineWidth = 5; c.stroke(); c.setLineDash([]);
  }
  for (const pts of map.overpass) { path(pts); c.strokeStyle = 'rgba(70,52,35,.5)'; c.lineWidth = 9; c.stroke(); c.strokeStyle = 'rgba(240,228,198,.95)'; c.lineWidth = 6; c.stroke(); }

  // ---- 4. water: lakes washed and hatched, rivers in brush strokes
  for (const a of map.water) {
    poly(a.p); c.fillStyle = 'rgba(86,146,156,.42)'; c.fill();
    c.save(); poly(a.p); c.clip();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of a.p) { const [x, y] = toPx(p[0], p[1]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    c.strokeStyle = 'rgba(40,96,112,.35)'; c.lineWidth = 0.8;
    for (let y = y0 + 2; y < y1; y += 3.5) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
    c.restore();
    poly(a.p); c.strokeStyle = 'rgba(40,90,105,.65)'; c.lineWidth = 1.3; c.stroke();
  }
  for (const [big, pts] of map.rivers) {
    const w = big ? 16 : 5;
    path(pts); c.strokeStyle = 'rgba(96,150,160,.35)'; c.lineWidth = w * R * 1.6 + 4; c.stroke();
    path(pts); c.strokeStyle = 'rgba(64,124,140,.62)'; c.lineWidth = w * R * 0.9 + 1.5; c.stroke();
    if (big) { path(pts); c.strokeStyle = 'rgba(30,80,96,.55)'; c.lineWidth = 1.1; c.stroke(); }
  }

  // ---- 5. age: darker, burnt edges
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  vg.addColorStop(0, 'rgba(120,80,35,0)'); vg.addColorStop(0.75, 'rgba(120,80,35,.18)'); vg.addColorStop(1, 'rgba(90,55,20,.5)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  for (const [x, y, w, h, gx, gy] of [[0, 0, W, 28, 0, 1], [0, H - 28, W, 28, 0, -1], [0, 0, 28, H, 1, 0], [W - 28, 0, 28, H, -1, 0]]) {
    const lg = c.createLinearGradient(gx < 0 ? x + w : x, gy < 0 ? y + h : y, gx > 0 ? x + w : gx < 0 ? x : x, gy > 0 ? y + h : gy < 0 ? y : y);
    lg.addColorStop(0, 'rgba(80,46,18,.55)'); lg.addColorStop(1, 'rgba(80,46,18,0)'); c.fillStyle = lg; c.fillRect(x, y, w, h);
  }

  // ---- 6. a red seal in the lower right: 万锦舆图
  const sx = W - 120, sy = H - 130, ss = 78;
  c.save(); c.translate(sx, sy); c.rotate(-0.05);
  c.fillStyle = 'rgba(178,40,32,.82)'; c.fillRect(-ss / 2, -ss / 2, ss, ss);
  c.strokeStyle = 'rgba(244,234,208,.9)'; c.lineWidth = 3; c.strokeRect(-ss / 2 + 6, -ss / 2 + 6, ss - 12, ss - 12);
  c.fillStyle = 'rgba(244,234,208,.95)'; c.font = "900 26px 'STKaiti','KaiTi','Kaiti SC','Songti SC','Noto Serif CJK SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('万', 13, -13); c.fillText('锦', 13, 15); c.fillText('舆', -13, -13); c.fillText('图', -13, 15);
  c.restore();
  return cv;
}

// the table the map lies on: dark walnut with grain (a small tile to repeat)
export function woodTile() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wob = vnoise(x / 60, y / 9) * 9 + vnoise(x / 13, y / 40) * 2;
    const ring = (Math.sin((y + wob * 3) / 3.1) + 1) / 2, n = hash(x, y) * 6;
    const o = (y * S + x) * 4;
    d[o] = 54 + ring * 14 + n; d[o + 1] = 38 + ring * 9 + n * 0.8; d[o + 2] = 26 + ring * 6 + n * 0.6; d[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}
