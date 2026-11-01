// v0.2 recognisable buildings: gas stations (canopy + pumps + price pylon), car dealers with display
// cars, fast food, supermarkets, Chinese plazas, churches, schools, fire halls ... plus their parody
// name signs and minimap dots. tools/build_map.py decides what each OSM building is (`b.poi`), its
// sign text (`b.n`, always a pun for real brands) and style key (`b.s`); everything here is baked
// into the chunk meshes inside the building's own vertex range (World.bRange), so it adds no draw
// calls and fades with the building.
import { M } from './math.js';
import { MAT_V, box, rbox, cyl, ico, sphere } from './geo.js';
import { CFG } from './config.js';
import { edgeBoxes } from './props.js';

// sign / trim colours per style key: bg + fg = sign, band (+ band2) = building trim
const STYLE = {
  petro: { bg: '#d52b1e', fg: '#ffffff', band2: '#ffffff' },
  circleq: { bg: '#e4002b', fg: '#ffffff', band2: '#f7941d' },
  ezzo: { bg: '#f8fafc', fg: '#d6001c', band: '#d6001c', band2: '#1e40af' },
  shel: { bg: '#ffd100', fg: '#dd1d21', band: '#dd1d21', band2: '#ffd100' },
  mcd: { bg: '#d93b30', fg: '#ffc72c', band: '#ffc72c' },
  bpizza: { bg: '#b91c1c', fg: '#ffffff', band: '#1f2937' },
  chalay: { bg: '#b91c1c', fg: '#fde68a' },
  nothrills: { bg: '#ffd400', fg: '#111111' },
  loblawz: { bg: '#f97316', fg: '#ffffff' },
  freshgo: { bg: '#16a34a', fg: '#ffffff' },
  wallmort: { bg: '#1d4ed8', fg: '#fde047' },
  costgo: { bg: '#dc2626', fg: '#ffffff', band: '#1d4ed8' },
  deepot: { bg: '#f97316', fg: '#ffffff' },
  tyre: { bg: '#dc2626', fg: '#ffffff', band2: '#16a34a' },
  rhona: { bg: '#1e3a8a', fg: '#fde047' },
  shoppers: { bg: '#dc2626', fg: '#ffffff' },
  lcb0: { bg: '#166534', fg: '#ffffff' },
  stables: { bg: '#cc0000', fg: '#ffffff' },
  kompu: { bg: '#1e3a8a', fg: '#ffffff', band: '#ef4444' },
  winnerz: { bg: '#111827', fg: '#ffffff' },
  rbg: { bg: '#005daa', fg: '#ffd200' },
  tb: { bg: '#2e8b2e', fg: '#ffffff' },
  bno: { bg: '#0079c1', fg: '#ffffff', band2: '#ed1c24' },
  cibs: { bg: '#8b0000', fg: '#ffffff' },
  hsbb: { bg: '#ffffff', fg: '#db0011', band: '#db0011' },
  scotchia: { bg: '#ec111a', fg: '#ffffff' },
  hiltun: { bg: '#1e3a8a', fg: '#ffffff' },
  hotel: { bg: '#334155', fg: '#fef3c7' },
  ymca: { bg: '#6d28d9', fg: '#ffffff' },
  plaza: { bg: '#c8102e', fg: '#ffd84d', band2: '#f2c14e' },
  firstchoyce: { bg: '#c8102e', fg: '#ffffff', band2: '#f2c14e' },
  vgrocer: { bg: '#365314', fg: '#fef3c7' },
  theatre: { bg: '#581c87', fg: '#fde68a' },
  gallery: { bg: '#0f766e', fg: '#ffffff' },
  panyam: { bg: '#0369a1', fg: '#ffffff' },
  cc: { bg: '#0f766e', fg: '#ffffff' },
  library: { bg: '#7c2d12', fg: '#fff7ed' },
  fire: { bg: '#b91c1c', fg: '#ffffff', band: '#f8fafc' },
  police: { bg: '#1e3a8a', fg: '#ffffff' },
  school: { bg: '#14532d', fg: '#ffffff', band: '#f4ead5' },
  carwash: { bg: '#0284c7', fg: '#ffffff' },
  office: { bg: '#334155', fg: '#ffffff' },
  // car dealers (style = first word of the pun)
  toyoda: { bg: '#eb0a1e', fg: '#ffffff' }, hondo: { bg: '#cc0000', fg: '#ffffff' },
  kio: { bg: '#05141f', fg: '#ffffff', band: '#bb162b' }, mazba: { bg: '#334155', fg: '#ffffff' },
  mercedez: { bg: '#111827', fg: '#e5e7eb', band: '#9ca3af' }, bmv: { bg: '#1c69d4', fg: '#ffffff' },
  oudi: { bg: '#111827', fg: '#ffffff', band: '#bb0a30' }, volvu: { bg: '#1e3a8a', fg: '#ffffff' },
  infinitty: { bg: '#1f2937', fg: '#e5e7eb', band: '#9ca3af' }, forb: { bg: '#1e40af', fg: '#ffffff' },
};
const DEF = { bg: '#334155', fg: '#ffffff' };
export const poiStyle = (b) => STYLE[b.s] || STYLE[b.poi] || DEF;
const band = (b) => { const s = poiStyle(b); return s.band || s.bg; };
const CAR_COLS = ['#ef4444', '#f8fafc', '#1f2937', '#2563eb', '#cbd5e1', '#f59e0b', '#10b981', '#a78bfa'];
// sign size per category (height in m; width follows the text)
const SIGN_H = { gas: 2.3, dealer: 2.2, plaza: 2.5, bigbox: 2.5, grocer: 2.4, hotel: 2.2, school: 2.0, fire: 1.9, fast: 1.9 };
const BRAND_DOTS = new Set(['gas', 'dealer', 'fast', 'grocer', 'bigbox', 'plaza', 'bank', 'shop', 'hotel']);

const put = (mb, base, g, m, col, em = 0) => mb.add(g, M.mul(base, m), col, MAT_V, em);
const at = (x, y, z) => M.T(x, y, z);
const frame = (x, z, a) => M.chain(M.T(x, 0, z), M.RY(a));
const cam = () => { const az = CFG.camera.azimuth; return { fx: Math.sin(az), fz: Math.cos(az), rx: Math.cos(az), rz: -Math.sin(az), az }; };
function pip(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function rectPoly(x, z, a, w, d, z0 = -d / 2, z1 = d / 2) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, z0], [w / 2, z0], [w / 2, z1], [-w / 2, z1]].map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]);
}
function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
// how far the footprint reaches from its centroid toward the camera
function frontExtent(p, c, fx, fz) { let m = 0; for (const q of p) m = Math.max(m, (q[0] - c[0]) * fx + (q[1] - c[1]) * fz); return m; }
// the footprint edge most visible from the camera: { mx, mz, ux, uz, nx, nz, L }
function cameraEdge(b) {
  const p = b.p, n = p.length, { fx, fz } = cam();
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  const sgn = area > 0 ? 1 : -1;
  let best = null;
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % n], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 4) continue;
    const nx = (dz / L) * sgn, nz = (-dx / L) * sgn, s = (nx * fx + nz * fz) * Math.min(L, 20);
    if (!best || s > best.s) best = { s, mx: (ax + bx) / 2, mz: (az + bz) / 2, ux: dx / L, uz: dz / L, nx, nz, L };
  }
  return best;
}
// gas station frame from the map: [cx, cz, ang, W, D, front (to curb), back, pylonX?, pylonZ?]
const station = (st) => ({ x: st[0], z: st[1], a: st[2], W: st[3], D: st[4], front: st[5], back: st[6], px: st[7], pz: st[8] });
const CANOPY_Y = 5.2; // underside of the gas canopy (a car is 2.2 m tall; high enough to see the pumps below)

// ---------------------------------------------------------------- colliders (World.buildCollision)
export function poiColliders(w) {
  w.aprons = [];
  w.map.buildings.forEach((b, bi) => {
    if (b.st) {
      const s = station(b.st), Wi = islandLen(s);
      for (const iz of islandZ(s)) w.addCollider(rectPoly(s.x + Math.sin(s.a) * iz, s.z + Math.cos(s.a) * iz, s.a, Wi, 1.3), 't');
      // the canopy roof only hides the player (occlusion fade) and never blocks: you can drive under it
      const g = w.colliders[w.addCollider(rectPoly(s.x, s.z, s.a, s.W, s.D), 'o')];
      g.bi = bi; g.h = CANOPY_Y + 0.8;
      if (s.px !== undefined) {
        const { az } = cam();
        w.addCollider(rectPoly(s.px, s.pz, az, 3.4, 0.7), 't');
      }
      w.aprons.push(apronPoly(s));
    }
    for (const c of b.cars || []) w.addCollider(rectPoly(c[0], c[1], c[2], 2.8, 5.0), 'c'); // display car on its plinth
    if (b.bus) w.addCollider(rectPoly(b.bus[0], b.bus[1], b.bus[2], 2.6, 9.6), 'c');
  });
}
const islandLen = (s) => Math.min(s.W - 4.2, 7.2);
const islandZ = (s) => [-(s.D / 2 - 2.1), s.D / 2 - 2.1]; // islands close to the long edges: visible under the roof
const apronPoly = (s) => rectPoly(s.x, s.z, s.a, s.W + 6, 0, -s.back, s.front);
export const inApron = (w, x, z) => (w.aprons || []).some((p) => pip(x, z, p));

// ---------------------------------------------------------------- ground (outside the fade range)
export function poiGround(w, b) {
  if (!b.st) return;
  const s = station(b.st), p = apronPoly(s), mb = w.chunk(s.x, s.z).mb;
  mb.tri(p[0][0], 0.016, p[0][1], p[2][0], 0.016, p[2][1], p[1][0], 0.016, p[1][1], '#e9e5dc');
  mb.tri(p[0][0], 0.016, p[0][1], p[3][0], 0.016, p[3][1], p[2][0], 0.016, p[2][1], '#e9e5dc');
  // painted lane arrows between the islands
  const F = frame(s.x, s.z, s.a);
  for (const iz of [0, -s.D / 2 - 0.2, s.D / 2 + 0.2]) put(mb, F, box(s.W * 0.55, 0.01, 0.16), at(0, 0.02, iz), '#ffffff');
}

// ---------------------------------------------------------------- building detail (World.buildChunks)
export const poiWindows = (b) => !['gas', 'dealer', 'church', 'temple', 'fast', 'fire', 'carwash'].includes(b.poi);
export function poiDetail(w, mb, b) {
  if (!b.poi) return;
  const st = poiStyle(b), h = b.h;
  const [cx, cz] = centroid(b.p);
  switch (b.poi) {
    case 'gas':
      edgeBoxes(mb, b, 1.6, 1.6, 0.06, '#a5dcf7', 0.03, 0.62, 0.2);
      edgeBoxes(mb, b, h - 0.35, 0.7, 0.3, band(b), 0.12, 1, 0.12);
      if (b.st) gasStation(mb, b, station(b.st), st);
      break;
    case 'carwash':
      edgeBoxes(mb, b, h - 0.35, 0.7, 0.3, band(b), 0.12, 1, 0.1);
      edgeBoxes(mb, b, 1.6, 2.6, 0.06, '#7dd3fc', 0.03, 0.5, 0.15);
      break;
    case 'dealer':
      edgeBoxes(mb, b, 2.1, 3.0, 0.08, '#8fd3f7', 0.05, 0.94, 0.3);     // glass showroom
      edgeBoxes(mb, b, h - 0.45, 0.9, 0.32, band(b), 0.14, 1, 0.1);
      for (const c of b.cars || []) { // shiny cars on white display plinths
        put(mb, frame(c[0], c[1], c[2]), box(2.8, 0.14, 5.0), at(0, 0.07, 0), '#f8fafc', 0.1);
        bakedCar(mb, c[0], c[1], c[2], CAR_COLS[c[3] % CAR_COLS.length], 0.14);
      }
      break;
    case 'fast':
      edgeBoxes(mb, b, 1.7, 1.6, 0.06, '#a5dcf7', 0.03, 0.62, 0.2);
      edgeBoxes(mb, b, h - 0.4, 0.8, 0.32, band(b), 0.14, 1, 0.2);
      if (b.s === 'mcd') burger(mb, cx, h, cz); else pizza(mb, cx, h, cz);
      break;
    case 'grocer': case 'bigbox': case 'shop': case 'bank': case 'hotel': case 'theatre': case 'gallery': case 'office':
      edgeBoxes(mb, b, Math.min(h - 0.45, 6.5), 0.9, 0.32, band(b), 0.14, 1, 0.12);
      if (st.band2) edgeBoxes(mb, b, Math.min(h - 0.45, 6.5) - 0.55, 0.16, 0.36, st.band2, 0.16);
      if (b.poi !== 'hotel') entrance(mb, b, st);
      break;
    case 'plaza':
      chinesePlaza(mb, b, st, cx, cz);
      break;
    case 'church':
      steeple(mb, b, cx, cz);
      break;
    case 'temple':
      mb.add(sphere(2.6, 10), M.chain(M.T(cx, h, cz), M.S(1, 0.85, 1)), '#fbf7ef', MAT_V);
      mb.add(cyl(0.04, 0.3, 1.8, 6), M.T(cx, h + 3.0, cz), '#f2c14e', MAT_V, 0.2);
      edgeBoxes(mb, b, h - 0.3, 0.6, 0.3, '#ea8a2a', 0.12);
      break;
    case 'school':
      edgeBoxes(mb, b, h - 0.3, 0.6, 0.3, band(b), 0.12);
      if (b.bus) schoolBus(mb, b.bus);
      break;
    case 'cc': case 'library': case 'police':
      edgeBoxes(mb, b, h - 0.4, 0.8, 0.3, band(b), 0.12, 1, 0.08);
      entrance(mb, b, st);
      break;
    case 'fire':
      edgeBoxes(mb, b, h - 0.35, 0.7, 0.3, '#f8fafc', 0.12);
      fireHall(mb, b, cx, cz);
      break;
  }
}

// canopy on posts over two pump islands; posts stand on the islands (the only canopy colliders)
function gasStation(mb, b, s, st) {
  const F = frame(s.x, s.z, s.a), W = s.W, D = s.D, Wi = islandLen(s), Y = CANOPY_Y, bandC = band(b);
  put(mb, F, box(W, 0.4, D), at(0, Y + 0.2, 0), '#f8fafc', 0.35);                 // lit underside
  put(mb, F, box(W - 0.3, 0.06, D - 0.3), at(0, Y + 1.03, 0), bandC, 0.05);        // brand-coloured roof: reads as a canopy from above
  put(mb, F, box(W - 2.2, 0.07, D - 2.2), at(0, Y + 1.04, 0), st.band2 || '#f8fafc');
  for (const sz of [-1, 1]) put(mb, F, box(W + 0.2, 0.75, 0.18), at(0, Y + 0.68, sz * (D / 2 + 0.01)), bandC, 0.15);
  for (const sx of [-1, 1]) put(mb, F, box(0.18, 0.75, D + 0.2), at(sx * (W / 2 + 0.01), Y + 0.68, 0), bandC, 0.15);
  if (st.band2) {
    for (const sz of [-1, 1]) put(mb, F, box(W + 0.24, 0.16, 0.2), at(0, Y + 0.28, sz * (D / 2 + 0.02)), st.band2, 0.15);
    for (const sx of [-1, 1]) put(mb, F, box(0.2, 0.16, D + 0.24), at(sx * (W / 2 + 0.02), Y + 0.28, 0), st.band2, 0.15);
  }
  for (const iz of islandZ(s)) {
    put(mb, F, box(Wi, 0.22, 1.3), at(0, 0.11, iz), '#cbd0d8');
    for (const ex of [-1, 1]) {
      put(mb, F, cyl(0.2, 0.2, Y, 8, false), at(ex * (Wi / 2 - 0.45), 0.22 + Y / 2 - 0.1, iz), '#f1f5f9');
      put(mb, F, cyl(0.24, 0.24, 0.9, 8), at(ex * (Wi / 2 - 0.45), 0.67, iz), bandC);  // post skirt
      // pump: white body, dark screen, brand-coloured top
      const px = ex * Wi * 0.2;
      put(mb, F, rbox(1.0, 1.75, 0.7, 0.06), at(px, 0.22 + 0.88, iz), '#ffffff');
      put(mb, F, box(0.6, 0.42, 0.74), at(px, 1.5, iz), '#1f2937', 0.25);
      put(mb, F, box(1.06, 0.34, 0.76), at(px, 2.1, iz), bandC, 0.15);
      put(mb, F, box(0.14, 0.7, 0.8), at(px + ex * 0.58, 1.0, iz), '#111827');      // hose holster
    }
  }
  if (s.px !== undefined) {   // price pylon facing the camera
    const { az } = cam(), P = frame(s.px, s.pz, az);
    put(mb, P, box(3.6, 0.5, 0.8), at(0, 0.25, 0), '#9ca3af');
    put(mb, P, box(3.3, 6.2, 0.42), at(0, 3.6, 0), bandC);
    put(mb, P, box(3.44, 0.24, 0.5), at(0, 6.8, 0), st.band2 || '#ffffff');
  }
}
const PYLON_SIGN = { y: 3.05, w: 3.0, h: 3.4 };

// static display car (same shape as the parked-car batch, baked with vertex colours)
function bakedCar(mb, x, z, a, col, y0 = 0) {
  const F = M.chain(M.T(x, y0, z), M.RY(a));
  put(mb, F, rbox(2.1, 0.85, 4.4, 0.3, 1), at(0, 0.72, 0), col, 0.12);
  put(mb, F, rbox(1.8, 0.78, 2.3, 0.28, 1), at(0, 1.47, -0.25), '#bfe6ff', 0.25);
  put(mb, F, rbox(1.86, 0.14, 2.0, 0.06, 1), at(0, 2.2, -0.25), col, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(mb, F, cyl(0.42, 0.42, 0.34, 8), M.chain(at(sx, 0.42, sz * 1.4), M.RZ(Math.PI / 2)), '#262a35');
}
function entrance(mb, b, st) {
  const e = cameraEdge(b);
  if (!e) return;
  const a = Math.atan2(e.nx, e.nz), F = frame(e.mx, e.mz, a), w = Math.min(e.L * 0.4, 8);
  put(mb, F, box(w, 2.4, 0.08), at(0, 1.25, 0.05), '#8fd3f7', 0.3);
  put(mb, F, box(w + 1.2, 0.22, 1.6), at(0, 2.75, 0.8), st.band || st.bg);
}
function burger(mb, x, y, z) {
  const T = M.T(x, y, z), seeds = [[0.6, 0.5], [-0.7, 0.3], [0.1, -0.8], [-0.2, 0.9], [0.9, -0.3], [-0.9, -0.5]];
  mb.add(cyl(2.1, 2.2, 0.8, 18), M.mul(T, M.T(0, 0.5, 0)), '#e3a35b', MAT_V);
  mb.add(cyl(2.35, 2.35, 0.55, 18), M.mul(T, M.T(0, 1.15, 0)), '#6b3a1f', MAT_V);
  mb.add(box(3.6, 0.1, 3.6), M.mul(T, M.chain(M.T(0, 1.47, 0), M.RY(0.6))), '#ffc72c', MAT_V);
  mb.add(cyl(2.45, 2.45, 0.16, 18), M.mul(T, M.T(0, 1.58, 0)), '#7cc242', MAT_V);
  mb.add(sphere(2.2, 10), M.mul(T, M.chain(M.T(0, 1.66, 0), M.S(1, 0.62, 1))), '#e8a85e', MAT_V);
  for (const [sx, sz] of seeds) mb.add(box(0.26, 0.1, 0.14), M.mul(T, M.chain(M.T(sx, 1.66 + 1.32 * Math.sqrt(Math.max(0, 1 - (sx * sx + sz * sz) / 4.4)), sz), M.RY(sx * 2))), '#fff7e0', MAT_V);
}
function pizza(mb, x, y, z) {
  const T = M.chain(M.T(x, y + 2.2, z), M.RX(-0.9));
  mb.add(cyl(2.6, 2.6, 0.35, 20), T, '#d9a05b', MAT_V);
  mb.add(cyl(2.3, 2.3, 0.12, 20), M.mul(T, M.T(0, 0.22, 0)), '#ffd24a', MAT_V);
  for (const [px, pz] of [[0.9, 0.6], [-1, 0.4], [0.1, -1.1], [-0.4, 1.3], [1.2, -0.7]]) mb.add(cyl(0.42, 0.42, 0.1, 10), M.mul(T, M.T(px, 0.3, pz)), '#c0392b', MAT_V);
  mb.add(cyl(0.12, 0.12, 2.2, 6, false), M.T(x, y + 1.1, z), '#6b7280', MAT_V);
}
// red + gold trim, a row of lanterns along the camera-side walls and a little green-tiled pavilion roof
function chinesePlaza(mb, b, st, cx, cz) {
  const h = b.h, p = b.p, n = p.length, { fx, fz } = cam();
  edgeBoxes(mb, b, h - 0.5, 1.0, 0.32, st.bg, 0.14, 1, 0.1);
  edgeBoxes(mb, b, h + 0.06, 0.2, 0.42, st.band2 || '#f2c14e', 0.17, 1, 0.2);
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  const sgn = area > 0 ? 1 : -1;
  let lanterns = 0;
  for (let i = 0; i < n && lanterns < 40; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % n], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 5) continue;
    const nx = (dz / L) * sgn, nz = (-dx / L) * sgn;
    if (nx * fx + nz * fz < 0.15) continue; // only walls the camera sees
    for (let s = 2.5; s < L - 1.5 && lanterns < 40; s += 4.2, lanterns++) {
      const x = ax + (dx / L) * s + nx * 0.75, z = az + (dz / L) * s + nz * 0.75, y = h - 1.75;
      mb.add(ico(0.42), M.chain(M.T(x, y, z), M.S(1, 1.2, 1)), '#e11d2e', MAT_V, 0.4);
      mb.add(cyl(0.2, 0.2, 0.12, 6), M.T(x, y + 0.52, z), '#f2c14e', MAT_V);
      mb.add(cyl(0.2, 0.2, 0.12, 6), M.T(x, y - 0.52, z), '#f2c14e', MAT_V);
      mb.add(box(0.05, 0.4, 0.05), M.T(x, y - 0.8, z), '#f2c14e', MAT_V);
    }
  }
  const r = Math.min(4.5, Math.sqrt(Math.abs(area) / 2) * 0.22);
  if (r < 1.8) return;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mb.add(cyl(0.18, 0.18, 2.2, 6, false), M.T(cx + sx * r * 0.62, h + 1.1, cz + sz * r * 0.62), '#c8102e', MAT_V);
  mb.add(cyl(0.3, r * 1.25, 1.9, 4), M.chain(M.T(cx, h + 3.1, cz), M.RY(Math.PI / 4)), '#2f7d5b', MAT_V);
  mb.add(box(r * 1.5, 0.2, r * 1.5), M.T(cx, h + 2.2, cz), '#c8102e', MAT_V);
  mb.add(ico(0.35), M.T(cx, h + 4.25, cz), '#f2c14e', MAT_V, 0.3);
}
// white tower + slate spire + gold cross on the camera-side end of the roof
function steeple(mb, b, cx, cz) {
  const { fx, fz } = cam(), ext = frontExtent(b.p, [cx, cz], fx, fz);
  let x = cx + fx * ext * 0.45, z = cz + fz * ext * 0.45;
  if (!pip(x, z, b.p)) { x = cx; z = cz; }
  const y = b.h, roofC = b.c === '#c9765b' ? '#f5f0e6' : '#ffffff';
  mb.add(box(2.6, 3.4, 2.6), M.T(x, y + 1.7, z), roofC, MAT_V);
  mb.add(box(2.0, 1.5, 2.0), M.T(x, y + 4.15, z), roofC, MAT_V);
  mb.add(box(0.9, 1.0, 2.05), M.T(x, y + 4.15, z), '#334155', MAT_V);  // belfry openings
  mb.add(box(2.05, 1.0, 0.9), M.T(x, y + 4.15, z), '#334155', MAT_V);
  mb.add(cyl(0.02, 1.55, 4.6, 4), M.chain(M.T(x, y + 7.2, z), M.RY(Math.PI / 4)), '#475569', MAT_V);
  mb.add(box(0.18, 1.3, 0.18), M.T(x, y + 9.95, z), '#f2c14e', MAT_V, 0.3);
  mb.add(box(0.8, 0.18, 0.18), M.chain(M.T(x, y + 10.15, z), M.RY(cam().az)), '#f2c14e', MAT_V, 0.3);
}
function schoolBus(mb, s) {
  const F = frame(s[0], s[1], s[2]);
  put(mb, F, rbox(2.5, 2.2, 8.2, 0.25, 1), at(0, 1.55, -0.6), '#fbbf24', 0.1);
  put(mb, F, rbox(2.4, 1.1, 1.5, 0.2, 1), at(0, 1.05, 4.1), '#fbbf24', 0.1);     // hood
  for (const sx of [-1, 1]) {
    put(mb, F, box(0.04, 0.6, 7.0), at(sx * 1.26, 2.1, -0.6), '#bfe6ff', 0.2);
    put(mb, F, box(0.04, 0.12, 8.0), at(sx * 1.26, 1.2, -0.6), '#111827');
  }
  put(mb, F, box(2.2, 0.8, 0.04), at(0, 2.1, 3.42), '#bfe6ff', 0.2);
  for (const sx of [-1, 1]) for (const sz of [-3.2, 3.6]) put(mb, F, cyl(0.5, 0.5, 0.36, 8), M.chain(at(sx * 1.12, 0.5, sz), M.RZ(Math.PI / 2)), '#262a35');
}
// big white bay doors on the camera side + a hose tower
function fireHall(mb, b, cx, cz) {
  const e = cameraEdge(b);
  if (e) {
    const a = Math.atan2(e.nx, e.nz), F = frame(e.mx, e.mz, a), nd = Math.max(1, Math.min(3, Math.floor(e.L / 4.2)));
    for (let i = 0; i < nd; i++) {
      const ox = (i - (nd - 1) / 2) * 3.8;
      put(mb, F, box(3.1, 3.4, 0.1), at(ox, 1.7, 0.05), '#f1f5f9');
      for (let k = 0; k < 4; k++) put(mb, F, box(3.0, 0.06, 0.14), at(ox, 0.7 + k * 0.8, 0.06), '#cbd5e1');
    }
  }
  const { fx, fz } = cam(), ext = frontExtent(b.p, [cx, cz], -fx, -fz);
  let x = cx - fx * ext * 0.5, z = cz - fz * ext * 0.5;
  if (!pip(x, z, b.p)) { x = cx; z = cz; }
  mb.add(box(2.4, b.h + 4, 2.4), M.T(x, (b.h + 4) / 2, z), '#c0392b', MAT_V);
  mb.add(box(2.7, 0.4, 2.7), M.T(x, b.h + 4.2, z), '#f8fafc', MAT_V);
}

// ---------------------------------------------------------------- signs (World.buildSigns)
export function poiSigns(b) {
  if (!b.n) return [];
  const st = poiStyle(b), { fx, fz } = cam();
  if (b.st) {
    const s = station(b.st), out = [];
    // name along the front of the canopy roof, price board on the pylon
    const ext = Math.abs(Math.sin(s.a) * fx + Math.cos(s.a) * fz) * s.D / 2 + Math.abs(Math.cos(s.a) * fx - Math.sin(s.a) * fz) * s.W / 2;
    out.push({ text: b.n, bg: st.bg, fg: st.fg, x: s.x, z: s.z, y: CANOPY_Y + 1.05, h: SIGN_H.gas, push: ext * 0.85, maxW: s.W * 1.3 });
    if (s.px !== undefined) out.push({ text: b.n, sub: '149.9', bg: st.bg, fg: st.fg, x: s.px, z: s.pz, y: PYLON_SIGN.y, w: PYLON_SIGN.w, h: PYLON_SIGN.h, push: 0.24 });
    return out;
  }
  // on top of the wall the camera sees best, so the sign always sits on its own building
  const e = cameraEdge(b);
  if (!e) {
    const [cx, cz] = centroid(b.p);
    return [{ text: b.n, bg: st.bg, fg: st.fg, x: cx, z: cz, y: b.h + 0.3, h: SIGN_H[b.poi] || 1.8, push: frontExtent(b.p, [cx, cz], fx, fz), maxW: 24 }];
  }
  return [{ text: b.n, bg: st.bg, fg: st.fg, x: e.mx, z: e.mz, y: b.h + 0.3, h: SIGN_H[b.poi] || 1.8, push: 0.4, maxW: Math.max(10, e.L * 1.3) }];
}

// ---------------------------------------------------------------- minimap dots
export function poiIcons(g, T, buildings) {
  for (const b of buildings) {
    if (!BRAND_DOTS.has(b.poi) || !b.n) continue;
    const [x, y] = b.st ? T(b.st[0], b.st[1]) : T(...centroid(b.p)), gas = b.poi === 'gas';
    g.fillStyle = gas ? '#f97316' : poiStyle(b).bg; g.strokeStyle = gas ? '#ffffff' : '#ffffff'; g.lineWidth = 1.5;
    g.beginPath();
    if (gas) { g.moveTo(x, y - 5); g.lineTo(x + 4.5, y + 3.5); g.lineTo(x - 4.5, y + 3.5); g.closePath(); } else g.arc(x, y, 3.5, 0, 7);
    g.fill(); g.stroke();
  }
}
