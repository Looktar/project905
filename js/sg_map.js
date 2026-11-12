// 万锦群英传 v1.5: dressing for the strategy map.
//   D-117 territory: every lord's land as a watercolour wash with ink borders (baked when the owners change)
//   D-118 roads: curved brush roads instead of straight lines; armies are little squads of soldiers marching on them
//   D-119 the land between the cities: ink forests, paddies, wheat, villages, peaks, willows (baked once per board),
//         and a live layer of boats on the river, cloud shadows and birds
// Everything in world metres (x east, z south) like the rest of the strategy screen; js/sg_ui.js draws it.

import { CITIES, NODE_IDS, LINKS } from './sg_data.js';
import { ELEV } from './sg_elev.js';
import { elevAt } from './sg_data.js';
import { hash, vnoise, PAPER_R } from './sg_paper.js';

const shash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ roads (D-118)
// A road is a gentle quadratic curve with a little hand wobble, the same every time for the same two places.
// Paths carry their cumulative lengths so anything can be placed a fraction of the way along.
const curves = new Map();
const N_PTS = 26;
export function roadPath(a, b) {
  const A = CITIES[a], B = CITIES[b], key = `${a}|${b}|${A.x}|${A.z}|${B.x}|${B.z}`;
  let p = curves.get(key);
  if (p) return p;
  const rev = a > b, P = rev ? B : A, Q = rev ? A : B, h = shash(rev ? b + a : a + b), h2 = shash((rev ? a : b) + '~');
  const dx = Q.x - P.x, dz = Q.z - P.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
  const bend = (h < 0.5 ? -1 : 1) * (0.05 + 0.08 * Math.abs(h - 0.5) * 2) * len; // 5% to 13% off the straight line
  const mx = (P.x + Q.x) / 2 + nx * bend * 2, mz = (P.z + Q.z) / 2 + nz * bend * 2;
  const pts = [];
  for (let i = 0; i <= N_PTS; i++) {
    const t = i / N_PTS, u = 1 - t, w = Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 3 + h2 * 6.283) * len * 0.012;
    pts.push([u * u * P.x + 2 * u * t * mx + t * t * Q.x + nx * w, u * u * P.z + 2 * u * t * mz + t * t * Q.z + nz * w]);
  }
  if (rev) pts.reverse();
  p = withLengths(pts);
  curves.set(key, p);
  return p;
}
function withLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
// a whole route (several roads) as one path
export function routePath(route) {
  const pts = [];
  for (let i = 1; i < route.length; i++) { const p = roadPath(route[i - 1], route[i]).pts; pts.push(...(i > 1 ? p.slice(1) : p)); }
  return withLengths(pts.length ? pts : [[CITIES[route[0]].x, CITIES[route[0]].z], [CITIES[route[0]].x, CITIES[route[0]].z]]);
}
// the point (and heading) a fraction t of the way along a path
export function along(path, t) {
  const d = Math.max(0, Math.min(1, t)) * path.len, { pts, cum } = path;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1, u = (d - cum[i - 1]) / seg, a = pts[i - 1], b = pts[i];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
}
// a stretch of a path (from t0 to t1) as world points
export function slice(path, t0, t1) {
  const out = [along(path, t0)];
  for (let i = 1; i < path.pts.length - 1; i++) { const f = path.cum[i] / path.len; if (f > t0 && f < t1) out.push(path.pts[i]); }
  out.push(along(path, t1));
  return out;
}

// ------------------------------------------------------------------ territory (D-117)
// Every bit of land belongs to the nearest city (passes count for less), coloured by its lord. The colour pools
// darker at the border like watercolour, with granulation from noise, and the border itself is a wobbly ink line.
export const TERR_M = 4; // metres per pixel
export function bakeTerritory(map, owners, colors) {
  const [HW, HH] = map.half, W = Math.ceil(HW * 2 / TERR_M), H = Math.ceil(HH * 2 / TERR_M);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
  const nodes = NODE_IDS.map((id) => ({ x: CITIES[id].x, z: CITIES[id].z, o: owners[id], w2: CITIES[id].pass ? 1.8 * 1.8 : 1 }));
  const rgb = {};
  for (const [f, col] of Object.entries(colors)) rgb[f] = hex(col);
  for (let y = 0; y < H; y++) {
    const z = y * TERR_M - HH;
    for (let x = 0; x < W; x++) {
      const wx = x * TERR_M - HW;
      let q1 = 1e18, o1 = -1; // squared, weighted distances (sqrt only for the two that matter)
      for (const n of nodes) { const dx = n.x - wx, dz = n.z - z, dd = (dx * dx + dz * dz) * n.w2; if (dd < q1) { q1 = dd; o1 = n.o; } }
      if (o1 < 0) continue;
      let q2 = 1e18;
      for (const n of nodes) if (n.o !== o1) { const dx = n.x - wx, dz = n.z - z, dd = (dx * dx + dz * dz) * n.w2; if (dd < q2) q2 = dd; }
      const d1 = Math.sqrt(q1), d2 = Math.sqrt(q2);
      // the border wanders a little, like a hand-drawn line
      const edge = (d2 - d1) / 2 + (vnoise(wx / 70, z / 70) - 0.5) * 34 + (vnoise(wx / 18 + 7, z / 18) - 0.5) * 8;
      if (edge < -2) continue;
      const far = Math.max(0, Math.min(1, (1150 - d1) / 260)); // fade out far from every city
      if (!far) continue;
      const [r, g, b] = rgb[o1] || [128, 128, 128], o = (y * W + x) * 4;
      // the ink border (edge 0..9 m) blends into the wash: soft ramps on both sides keep it smooth when zoomed in
      const pool = Math.pow(Math.max(0, 1 - Math.max(0, edge - 9) / 120), 1.6), gran = 0.8 + 0.4 * vnoise(wx / 11, z / 11);
      const wash = (0.15 + 0.3 * pool) * gran;
      const ink = Math.max(0, Math.min(1, (edge + 2) / 4)) * Math.max(0, Math.min(1, (11 - edge) / 4)); // 0 outside the line, 1 on it
      const inA = edge < 7 ? 0 : wash, a = (ink * 0.85 + (1 - ink) * inA) * far, m = ink * 0.5;
      d[o] = r * (1 - m); d[o + 1] = g * (1 - m); d[o + 2] = b * (1 - m); d[o + 3] = Math.min(255, a * 255);
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
export const territoryKey = (s) => NODE_IDS.map((id) => s.cities[id].owner).join(',') + '|' + s.factions.map((f) => f.color).join(',');

// ------------------------------------------------------------------ the land between the cities (D-119)
// Baked once per board at the paper's resolution: a transparent layer of little ink pictures, kept off the cities,
// the roads and the water. Which picture goes where depends on the ground: peaks on the heights, paddies and
// willows by the river, forests in patches, villages and wheat in between, and some land left as bare paper.
export const DECOR_K = 2.6;
export const boardKey = () => NODE_IDS.map((id) => `${id}:${Math.round(CITIES[id].x)},${Math.round(CITIES[id].z)}`).join(';') + '/' + LINKS.length;
export function bakeDecor(map, R = PAPER_R) {
  const [HW, HH] = map.half, W = Math.ceil(HW * 2 * R), H = Math.ceil(HH * 2 * R);
  // 1. a mask of where nothing may go (10 m cells): cities, roads, water, rivers
  const MK = 10, mw = Math.ceil(HW * 2 / MK), mh = Math.ceil(HH * 2 / MK);
  const mcv = document.createElement('canvas'); mcv.width = mw; mcv.height = mh;
  const m = mcv.getContext('2d'), mp = (x, z) => [(x + HW) / MK, (z + HH) / MK];
  m.fillStyle = m.strokeStyle = '#000'; m.lineCap = 'round'; m.lineJoin = 'round';
  const line = (pts, w) => { m.lineWidth = w / MK; m.beginPath(); pts.forEach((p, i) => { const [x, y] = mp(p[0], p[1]); if (i) m.lineTo(x, y); else m.moveTo(x, y); }); m.stroke(); };
  for (const a of map.water) { m.beginPath(); a.p.forEach((p, i) => { const [x, y] = mp(p[0], p[1]); if (i) m.lineTo(x, y); else m.moveTo(x, y); }); m.closePath(); m.fill(); line(a.p, 30); }
  for (const [big, pts] of map.rivers) line(pts, big ? 70 : 34);
  for (const [a, b] of LINKS) line(roadPath(a, b).pts, 110);
  for (const id of NODE_IDS) { const [x, y] = mp(CITIES[id].x, CITIES[id].z); m.beginPath(); m.arc(x, y, (CITIES[id].pass ? 110 : 175) / MK, 0, 7); m.fill(); }
  const mask = m.getImageData(0, 0, mw, mh).data;
  const blocked = (x, z, r) => {
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const i = Math.floor((x + ox + HW) / MK), j = Math.floor((z + oz + HH) / MK);
      if (i < 0 || j < 0 || i >= mw || j >= mh || mask[(j * mw + i) * 4 + 3] > 40) return true;
    }
    return false;
  };
  // how far from a big river (for paddies and willows): a second, wider mask
  const rcv = document.createElement('canvas'); rcv.width = mw; rcv.height = mh;
  const rc = rcv.getContext('2d'); rc.strokeStyle = '#000'; rc.lineCap = 'round';
  for (const [, pts] of map.rivers) { rc.lineWidth = 420 / MK; rc.beginPath(); pts.forEach((p, i) => { const [x, y] = mp(p[0], p[1]); if (i) rc.lineTo(x, y); else rc.moveTo(x, y); }); rc.stroke(); }
  const rmask = rc.getImageData(0, 0, mw, mh).data;
  const nearRiver = (x, z) => { const i = Math.floor((x + HW) / MK), j = Math.floor((z + HH) / MK); return i >= 0 && j >= 0 && i < mw && j < mh && rmask[(j * mw + i) * 4 + 3] > 40; };

  // 2. the pictures
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); c.lineCap = 'round'; c.lineJoin = 'round';
  const px = (x, z) => [(x + HW) * R, (z + HH) * R], S = R * DECOR_K; // pictures are drawn DECOR_K times life size so they read at the default zoom
  const span = ELEV.hi - ELEV.lo, GRID = 230, placed = [];
  for (let gz = -HH + 90; gz < HH - 90; gz += GRID) for (let gx = -HW + 90; gx < HW - 90; gx += GRID) {
    const i = Math.round(gx / GRID), j = Math.round(gz / GRID), x = gx + (hash(i, j) - 0.5) * GRID * 0.7, z = gz + (hash(j + 91, i) - 0.5) * GRID * 0.7;
    const t = (elevAt(x, z) - ELEV.lo) / span, wood = vnoise(x / 520 + 3, z / 520), r = hash(i * 7, j * 3);
    let kind = null;
    if (t > 0.72 && r < 0.75) kind = 'peaks';
    else if (nearRiver(x, z)) kind = r < 0.5 ? 'paddy' : r < 0.8 ? 'willow' : null;
    else if (wood > 0.58) kind = r < 0.85 ? 'forest' : 'village';
    else kind = r < 0.16 ? 'village' : r < 0.36 ? 'wheat' : r < 0.5 ? 'forest' : r < 0.56 ? 'pagoda' : null;
    if (!kind) continue;
    const size = { peaks: 70, paddy: 60, willow: 30, forest: 55, village: 45, wheat: 50, pagoda: 25 }[kind] * DECOR_K * 0.7;
    if (blocked(x, z, size)) continue;
    placed.push([kind, x, z, hash(i + 13, j + 29)]);
  }
  // back to front, so lower pictures overlap the ones behind them
  placed.sort((a, b) => a[2] - b[2]);
  for (const [kind, x, z, h] of placed) { const [X, Y] = px(x, z); DRAW[kind](c, X, Y, S, h); }
  return cv;
}

const INK = 'rgba(62,48,34,';
// little ink pictures, (X, Y) the foot in pixels, S px per metre, h a stable random 0..1
const DRAW = {
  forest(c, X, Y, S, h) {
    const n = 5 + Math.floor(h * 5);
    for (let k = 0; k < n; k++) {
      const a = hash(k, Math.floor(h * 997)), b = hash(Math.floor(h * 991), k + 5);
      const x = X + (a - 0.5) * 80 * S, y = Y + (b - 0.5) * 44 * S, r = (7 + a * 5) * S;
      if (b < 0.45) pine(c, x, y, r * 1.6); else tree(c, x, y, r);
    }
  },
  willow(c, X, Y, S, h) {
    for (let k = 0; k < 2 + Math.floor(h * 2); k++) {
      const x = X + (k - 1) * 18 * S + h * 6, y = Y + (k % 2) * 6 * S, r = 13 * S;
      c.strokeStyle = INK + '.55)'; c.lineWidth = Math.max(1, 2 * S); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1, y - r * 1.4); c.stroke();
      c.strokeStyle = 'rgba(96,130,70,.55)'; c.lineWidth = Math.max(0.8, 1.1 * S);
      for (let q = -4; q <= 4; q++) { c.beginPath(); c.moveTo(x, y - r * 1.4); c.quadraticCurveTo(x + q * r * 0.22, y - r * 1.6, x + q * r * 0.3, y - r * 0.3 + Math.abs(q) * 2); c.stroke(); }
    }
  },
  paddy(c, X, Y, S, h) {
    const cols = 3, rows = 2, w = 24 * S, d = 15 * S, sk = 7 * S;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = X + (i - cols / 2) * (w + 2 * S) + j * sk, y = Y + (j - rows / 2) * (d + 2 * S);
      const g = hash(i + Math.floor(h * 50), j);
      c.fillStyle = g < 0.5 ? 'rgba(126,170,96,.42)' : 'rgba(150,184,112,.38)';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w + sk, y + d); c.lineTo(x + sk, y + d); c.closePath(); c.fill();
      c.strokeStyle = INK + '.38)'; c.lineWidth = Math.max(0.7, 0.9 * S); c.stroke();
      c.strokeStyle = 'rgba(80,120,60,.4)'; c.lineWidth = Math.max(0.5, 0.6 * S);
      for (let q = 1; q < 4; q++) { const yy = y + d * q / 4; c.beginPath(); c.moveTo(x + sk * q / 4 + 2, yy); c.lineTo(x + w + sk * q / 4 - 2, yy); c.stroke(); }
    }
  },
  wheat(c, X, Y, S, h) {
    const w = 52 * S, d = 26 * S, sk = 10 * S * (h < 0.5 ? 1 : -1);
    c.fillStyle = h < 0.5 ? 'rgba(214,176,92,.38)' : 'rgba(196,170,96,.34)';
    c.beginPath(); c.moveTo(X - w / 2, Y - d / 2); c.lineTo(X + w / 2, Y - d / 2); c.lineTo(X + w / 2 + sk, Y + d / 2); c.lineTo(X - w / 2 + sk, Y + d / 2); c.closePath(); c.fill();
    c.strokeStyle = INK + '.3)'; c.lineWidth = Math.max(0.6, 0.8 * S); c.stroke();
    c.strokeStyle = 'rgba(150,110,40,.42)'; c.lineWidth = Math.max(0.5, 0.7 * S);
    for (let q = 0; q < 9; q++) { const x = X - w / 2 + w * (q + 0.5) / 9; c.beginPath(); c.moveTo(x, Y - d / 2 + 2); c.lineTo(x + sk, Y + d / 2 - 2); c.stroke(); }
  },
  village(c, X, Y, S, h) {
    const n = 3 + Math.floor(h * 3);
    for (let k = 0; k < n; k++) {
      const a = hash(k + 3, Math.floor(h * 777)), x = X + (k - n / 2) * 15 * S + a * 6 * S, y = Y + (hash(k, 9) - 0.5) * 18 * S;
      hut(c, x, y, (8 + a * 3) * S, a);
    }
    tree(c, X + 34 * S, Y + 4 * S, 7 * S); tree(c, X - 36 * S, Y - 3 * S, 6 * S);
  },
  pagoda(c, X, Y, S) {
    const k = S;
    c.fillStyle = 'rgba(0,0,0,.08)'; c.beginPath(); c.ellipse(X, Y + 2 * k, 11 * k, 3 * k, 0, 0, 7); c.fill();
    for (let t = 0; t < 4; t++) {
      const y = Y - t * 9 * k, w = (11 - t * 2) * k;
      c.fillStyle = 'rgba(232,222,200,.95)'; c.fillRect(X - w * 0.55, y - 7 * k, w * 1.1, 7 * k);
      c.strokeStyle = INK + '.6)'; c.lineWidth = Math.max(0.6, 0.6 * k); c.strokeRect(X - w * 0.55, y - 7 * k, w * 1.1, 7 * k);
      c.fillStyle = 'rgba(70,74,80,.85)'; c.beginPath(); c.moveTo(X - w - 2 * k, y - 6 * k); c.quadraticCurveTo(X, y - 10 * k, X + w + 2 * k, y - 6 * k); c.lineTo(X + w * 0.6, y - 9 * k); c.lineTo(X - w * 0.6, y - 9 * k); c.closePath(); c.fill();
    }
    c.strokeStyle = INK + '.7)'; c.lineWidth = Math.max(0.6, 0.8 * k); c.beginPath(); c.moveTo(X, Y - 36 * k); c.lineTo(X, Y - 44 * k); c.stroke();
  },
  peaks(c, X, Y, S, h) {
    // the classic old-map mountain: overlapping peaks, ink outline, a blue-green wash on top
    const n = 2 + Math.floor(h * 3);
    for (let k = 0; k < n; k++) {
      const a = hash(k + 7, Math.floor(h * 313)), x = X + (k - (n - 1) / 2) * 26 * S + (a - 0.5) * 8 * S, y = Y + (k % 2) * 8 * S, hh = (26 + a * 22) * S, w = hh * 0.95;
      const g = c.createLinearGradient(x, y - hh, x, y);
      g.addColorStop(0, 'rgba(70,120,110,.55)'); g.addColorStop(0.55, 'rgba(120,150,110,.28)'); g.addColorStop(1, 'rgba(200,180,140,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.35, y - hh * 0.55, x, y - hh); c.quadraticCurveTo(x + w * 0.4, y - hh * 0.5, x + w, y); c.closePath(); c.fill();
      c.strokeStyle = INK + '.6)'; c.lineWidth = Math.max(0.9, 1.3 * S);
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.35, y - hh * 0.55, x, y - hh); c.quadraticCurveTo(x + w * 0.4, y - hh * 0.5, x + w, y); c.stroke();
      c.lineWidth = Math.max(0.6, 0.8 * S); c.strokeStyle = INK + '.35)'; // texture strokes (皴)
      for (let q = 0; q < 4; q++) { const f = 0.25 + q * 0.17; c.beginPath(); c.moveTo(x + w * (f - 0.5) * 0.9, y - hh * (1 - f) * 0.9); c.lineTo(x + w * (f - 0.4), y - hh * (1 - f) * 0.45); c.stroke(); }
    }
  },
};
function tree(c, x, y, r) {
  c.strokeStyle = INK + '.5)'; c.lineWidth = Math.max(0.7, r * 0.18); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - r * 0.9); c.stroke();
  c.fillStyle = 'rgba(86,118,66,.5)'; c.beginPath(); c.arc(x, y - r * 1.25, r * 0.75, 0, 7); c.fill();
  c.fillStyle = 'rgba(60,84,50,.42)'; c.beginPath(); c.arc(x - r * 0.25, y - r * 1.05, r * 0.45, 0, 7); c.fill();
  c.strokeStyle = INK + '.45)'; c.lineWidth = Math.max(0.6, r * 0.1); c.beginPath(); c.arc(x, y - r * 1.25, r * 0.75, 3.5, 6.0); c.stroke();
}
function pine(c, x, y, r) {
  c.strokeStyle = INK + '.55)'; c.lineWidth = Math.max(0.7, r * 0.1); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - r * 1.1); c.stroke();
  for (let t = 0; t < 3; t++) {
    const yy = y - r * (0.35 + t * 0.32), w = r * (0.55 - t * 0.13);
    c.fillStyle = t % 2 ? 'rgba(50,84,62,.55)' : 'rgba(64,100,70,.5)';
    c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - r * 0.42); c.lineTo(x + w, yy); c.closePath(); c.fill();
  }
}
function hut(c, x, y, r, a) {
  c.fillStyle = 'rgba(0,0,0,.07)'; c.beginPath(); c.ellipse(x, y + r * 0.15, r * 0.9, r * 0.25, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(238,228,206,.95)'; c.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 0.6);
  c.strokeStyle = INK + '.55)'; c.lineWidth = Math.max(0.5, r * 0.07); c.strokeRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 0.6);
  c.fillStyle = a < 0.6 ? 'rgba(78,82,88,.85)' : 'rgba(150,96,60,.8)';
  c.beginPath(); c.moveTo(x - r * 0.85, y - r * 0.55); c.lineTo(x - r * 0.45, y - r * 1.05); c.lineTo(x + r * 0.45, y - r * 1.05); c.lineTo(x + r * 0.85, y - r * 0.55); c.closePath(); c.fill();
  c.fillStyle = INK + '.6)'; c.fillRect(x - r * 0.1, y - r * 0.35, r * 0.2, r * 0.35);
}

// ------------------------------------------------------------------ live: boats, cloud shadows, birds (D-119)
// Boats row up and down the big rivers (a stretch each), found once per board.
export function boatSpots(map) {
  const out = [], rivers = map.rivers.filter(([big]) => big).map(([, pts]) => withLengths(pts)).filter((p) => p.len > 600);
  rivers.sort((a, b) => b.len - a.len);
  for (let r = 0; r < Math.min(2, rivers.length); r++) for (let k = 0; k < 2; k++) {
    const p = rivers[r], t0 = 0.2 + 0.45 * k + hash(r, k) * 0.1, t1 = t0 + 260 / p.len;
    if (t1 < 0.98) out.push({ path: p, t0, t1, ph: hash(k + 3, r) * 6.283, sp: 0.05 + hash(r + 5, k) * 0.04 });
  }
  return out;
}
// a sampan: a dark hull, a little cabin, a sail; (x, y) in screen pixels, z the scale
export function drawBoat(c, x, y, ang, z) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(z, z);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-9, 0, 7, 2.2, 0, 0, 7); c.fill(); // wake
  c.fillStyle = '#4a3424'; c.beginPath(); c.moveTo(-8, -2.2); c.quadraticCurveTo(0, -3.4, 9, -1); c.lineTo(9, 1); c.quadraticCurveTo(0, 3.4, -8, 2.2); c.closePath(); c.fill();
  c.fillStyle = '#c9b48a'; c.fillRect(-3, -1.6, 5, 3.2);
  c.restore();
  c.save(); c.translate(x, y); c.scale(z, z); // the sail stays upright
  c.strokeStyle = '#4a3424'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(1, 0); c.lineTo(1, -11); c.stroke();
  c.fillStyle = 'rgba(236,222,190,.95)'; c.strokeStyle = 'rgba(74,52,36,.8)'; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(1.5, -10.5); c.quadraticCurveTo(6.5, -6, 2, -1.5); c.lineTo(1.5, -1.5); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
// soft cloud shadows drifting over the board, in world metres
export function cloudShadows(t, half) {
  const [HW, HH] = half, out = [];
  for (let k = 0; k < 3; k++) {
    const sp = 9 + k * 4, span = HW * 2 + 1600, x = ((t * sp + k * 1500) % span) - HW - 800, z = -HH * 0.6 + k * HH * 0.62 + Math.sin(t * 0.03 + k) * 120;
    out.push([x, z, 520 + k * 140]);
  }
  return out;
}
// a flock of birds crossing the screen now and then: [x, y, flap] per bird in screen pixels, or null
export function birds(t, W, H) {
  const P = 26, k = Math.floor(t / P), p = (t % P) / P;
  if (p > 0.55) return null;
  const dir = hash(k, 1) < 0.5 ? 1 : -1, y0 = H * (0.2 + 0.5 * hash(k, 2)), q = p / 0.55;
  const x0 = dir > 0 ? -60 + q * (W + 120) : W + 60 - q * (W + 120), y = y0 - q * 40;
  const out = [];
  for (let i = 0; i < 5; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; out.push([x0 - dir * row * 16, y + side * row * 9 * (i ? 1 : 0), Math.sin(t * 9 + i)]); }
  return out;
}

// ------------------------------------------------------------------ armies (D-118)
// An army is a little squad: a banner bearer with the general's name on a tall flag and 2 to 6 soldiers in two rows,
// stepping along (legs swing, heads bob). (x, y) the squad's feet in screen pixels, dir +1 marching right, -1 left.
export function drawSquad(c, x, y, dir, col, dark, glyph, troops, t, z) {
  const n = Math.max(2, Math.min(6, Math.round(troops / 900)));
  c.save(); c.translate(x, y); c.scale(z * 1.35, z * 1.35);
  c.fillStyle = 'rgba(40,28,18,.22)'; c.beginPath(); c.ellipse(-dir * 6, 3, 18 + n * 3, 5, 0, 0, 7); c.fill();
  // dust behind them
  for (let k = 0; k < 3; k++) {
    const p = (t * 1.6 + k / 3) % 1;
    c.fillStyle = `rgba(160,130,90,${0.28 * (1 - p)})`; c.beginPath(); c.arc(-dir * (14 + n * 4 + p * 16), 1 - p * 6, 2.5 + p * 4, 0, 7); c.fill();
  }
  const men = [];
  for (let i = 0; i < n; i++) men.push([-dir * (4 + Math.floor(i / 2) * 9 + (i % 2) * 3), (i % 2) * 6 - 3, i]);
  men.sort((a, b) => a[1] - b[1]);
  for (const [sx, sy, i] of men) soldier(c, sx, sy, dir, col, dark, t * 9 + i * 1.9);
  // the banner bearer in front, a little taller
  const bx = dir * 9;
  soldier(c, bx, 1, dir, col, dark, t * 9 + 0.6, true);
  const top = -40, wave = (k) => Math.sin(t * 6 + k) * 1.6;
  c.strokeStyle = '#4a3424'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(bx + dir * 3, -2); c.lineTo(bx + dir * 3, top); c.stroke();
  const fx = bx + dir * 3, fw = 15 * -dir; // the flag trails behind the pole
  c.fillStyle = col; c.strokeStyle = dark; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(fx, top + 1); c.lineTo(fx + fw, top + 1 + wave(0)); c.lineTo(fx + fw + wave(1) * 0.5, top + 23 + wave(1)); c.lineTo(fx + fw * 0.5, top + 19 + wave(2)); c.lineTo(fx, top + 23); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(fx, top, 1.8, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = "900 11px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(glyph, fx + fw * 0.5, top + 11.5 + wave(1) * 0.5);
  c.restore();
}
function soldier(c, x, y, dir, col, dark, ph, bearer = false) {
  const step = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 1.4, h = bearer ? 1.08 : 1;
  c.save(); c.translate(x, y - bob); c.scale(h * dir, h);
  c.strokeStyle = '#3a2a1c'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-1, -5); c.lineTo(-1 - step * 2.5, 0); c.moveTo(1, -5); c.lineTo(1 + step * 2.5, 0); c.stroke(); // legs
  c.fillStyle = dark; c.beginPath(); c.moveTo(-3.6, -5); c.lineTo(3.6, -5); c.lineTo(3, -12); c.lineTo(-3, -12); c.closePath(); c.fill(); // tunic
  c.fillStyle = col; c.fillRect(-3.3, -11.5, 6.6, 3.2); // armour band
  c.fillStyle = '#f1d2a8'; c.beginPath(); c.arc(0.4, -15, 3.4, 0, 7); c.fill(); // head
  c.fillStyle = '#2b211a'; c.beginPath(); c.arc(1.6, -15.3, 0.6, 0, 7); c.fill(); // an eye, facing forward
  c.fillStyle = col; c.beginPath(); c.arc(0.4, -15.8, 3.7, Math.PI, 0); c.fill(); // helmet
  c.fillStyle = dark; c.fillRect(-3.4, -16, 7.6, 1);
  c.fillStyle = '#d64545'; c.beginPath(); c.arc(0.2, -19.8, 1.1, 0, 7); c.fill(); // red tassel
  if (!bearer) { // spear, held forward
    c.strokeStyle = '#6b4f32'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-2, -4); c.lineTo(5, -24); c.stroke();
    c.fillStyle = '#c9ced6'; c.beginPath(); c.moveTo(5, -24); c.lineTo(6.4, -28.5); c.lineTo(3.8, -25); c.closePath(); c.fill();
  }
  c.restore();
}
