// 万锦群英传 v1.1 (D-99): every city on the strategy map is drawn as its own Markham landmark instead of
// the same little castle. Canvas only, same faux-3D toy look as the castle: a stone base, a body in the
// place's own colours, roofs / awnings in the owner's colour, and the owner's flag.
// drawCity(c, x, y, kind, col, cap, ch, ts, dev): (x, y) is the middle of the base, as for castle().

// which landmark a site is (ids from js/sg_sites.js / the classic map)
const KIND = {
  pac: 'boba', mkv: 'bag', fmp: 'pagoda', cst: 'bigbox', wdb: 'bigbox', civ: 'civic', dtm: 'towers', unv: 'heritage', spd: 'dome',
  btv: 'airport', esn: 'factory', aan: 'centre', mlk: 'station',
  csh: 'plaza', mts: 'plaza', nks: 'plaza', dnc: 'plaza', shw: 'plaza', ads: 'plaza', mlc: 'plaza', shu: 'plaza',
  mil: 'homes', qtz: 'homes', ray: 'homes', hag: 'homes', und: 'homes', arm: 'homes',
};
export const cityKind = (id) => KIND[id] || 'castle';
export const CITY_KINDS = [...new Set(Object.values(KIND))];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function drawCity(c, x, y, kind, col, cap, ch, ts = 1, dev = 50) {
  const k = 1.15 * (cap ? 1.15 : 1) * ts * (dev < 40 ? 0.88 : dev >= 70 ? 1.1 : 1);
  const dark = shade(col, 0.8);
  c.save(); c.translate(x, y); c.scale(k, k);
  const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fill(); };
  const rect = (x0, y0, w, h, f) => { c.fillStyle = f; c.fillRect(x0, y0, w, h); };
  const circ = (cx, cy, r, f) => { c.fillStyle = f; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); };
  // a block: front face x0..x0+w, from y0 up h, with a side face and a top going back to the right
  const box = (x0, y0, w, h, front, side, top, d = 5) => {
    rect(x0, y0 - h, w, h, front);
    poly([[x0 + w, y0], [x0 + w + d, y0 - d * 0.8], [x0 + w + d, y0 - h - d * 0.8], [x0 + w, y0 - h]], side);
    poly([[x0, y0 - h], [x0 + w, y0 - h], [x0 + w + d, y0 - h - d * 0.8], [x0 + d, y0 - h - d * 0.8]], top);
  };
  const windows = (x0, y0, w, n, hgt = 5, f = '#5d7fa3') => { const gap = w / n; for (let i = 0; i < n; i++) rect(x0 + i * gap + gap * 0.2, y0 - hgt, gap * 0.6, hgt, f); };
  const tree = (tx, ty, r = 5) => { rect(tx - 1, ty - 4, 2, 5, '#7a5230'); circ(tx, ty - 7, r, '#4fae58'); circ(tx - 2, ty - 9, r * 0.55, '#6cc45a'); };
  // shadow and the stone base every city stands on
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(0, 9, 31, 10, 0, 0, 7); c.fill();
  poly([[-25, 0], [-13, 8], [13, 8], [25, 0], [25, 6], [13, 14], [-13, 14], [-25, 6]], '#b5a285');
  poly([[-25, 0], [-13, -8], [13, -8], [25, 0], [13, 8], [-13, 8]], kind === 'homes' || kind === 'heritage' ? '#b9d98a' : '#e8decd');
  let pole = 20; // where the flag pole stands
  const big = dev >= 70;

  if (kind === 'homes') {
    const house = (hx, hy, w, wall) => {
      rect(hx - w / 2, hy - 9, w, 9, wall); poly([[hx + w / 2, hy], [hx + w / 2 + 3, hy - 2.5], [hx + w / 2 + 3, hy - 11.5], [hx + w / 2, hy - 9]], shade('#d9cbb4', 0.9));
      poly([[hx - w / 2 - 1.5, hy - 9], [hx + w / 2 + 1.5, hy - 9], [hx, hy - 17]], col); poly([[hx + w / 2 + 1.5, hy - 9], [hx + w / 2 + 4.5, hy - 11.5], [hx + 3, hy - 19], [hx, hy - 17]], dark);
      rect(hx - 1.5, hy - 5, 3, 5, '#6b4a2e');
    };
    house(-12, -3, 11, '#f6eee1'); if (big) house(9, -5, 10, '#f3e3c8');
    tree(big ? -1 : 8, -5, 5);
    house(1, 3, 13, '#fbf3e4'); house(-15, 5, 9, '#f3e3c8');
    pole = 17;
  } else if (kind === 'plaza' || kind === 'boba' || kind === 'bag' || kind === 'pagoda') {
    box(-21, 3, 36, 13, '#f6eee1', '#d9cbb4', '#efe6d6');
    windows(-20, 3, 34, 5, 6);
    rect(-21, -6.5, 36, 3.5, col); for (let i = 0; i < 6; i++) rect(-21 + i * 6, -6.5, 3, 3.5, 'rgba(255,255,255,.35)'); // striped awning
    if (kind === 'plaza') { rect(-12, -19, 18, 6, dark); rect(-10, -17.5, 14, 3, 'rgba(255,255,255,.85)'); rect(-4, -13, 2, 3, '#8a7a62'); if (big) box(-19, -10, 9, 5, '#f6eee1', '#d9cbb4', col, 3); }
    if (kind === 'boba') { // 大古广场: a giant bubble tea on the roof
      poly([[-11, -11], [3, -11], [6, -31], [-14, -31]], '#f3e2c7'); poly([[-11, -11], [3, -11], [4.4, -20], [-12.4, -20]], '#b8794a');
      for (const [px, py] of [[-8, -13], [-4, -14], [0, -13], [-6, -16.5], [-1, -16.5]]) circ(px, py, 1.5, '#2b1c12');
      rect(-15, -33, 22, 3, '#ffffff'); c.strokeStyle = '#ff5d8f'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-1, -33); c.lineTo(3, -44); c.stroke();
    }
    if (kind === 'bag') { // Markvile Mall: a shopping bag
      poly([[-13, -11], [5, -11], [7, -30], [-15, -30]], '#ff5d8f'); rect(-14.5, -24, 21, 5, '#ffffff');
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.8; c.beginPath(); c.arc(-4, -30, 5, Math.PI, 0); c.stroke();
    }
    if (kind === 'pagoda') { // 万景广场: a Chinese gate roof
      rect(-9, -19, 12, 8, '#c0392b'); poly([[-16, -18], [10, -18], [5, -25], [-11, -25]], col);
      rect(-6, -30, 6, 6, '#c0392b'); poly([[-12, -29], [6, -29], [1, -36], [-7, -36]], dark);
    }
  } else if (kind === 'bigbox') { // Costgo: a warehouse with a band in the owner's colour
    box(-22, 4, 38, 17, '#f4f1ea', '#cfc6b6', '#e6dfd0', 6);
    rect(-22, -13, 38, 4, col); rect(-8, -6, 12, 10, '#5a6478'); for (let i = 1; i < 4; i++) rect(-8, -6 + i * 2.5, 12, 0.7, '#3d4658');
    rect(-19, -3, 6, 7, '#7fa6c9'); rect(8, -3, 6, 7, '#7fa6c9');
  } else if (kind === 'civic') { // the Civic Centre: a hall with a clock tower
    box(-21, 3, 36, 11, '#f5f3ee', '#d6d0c2', '#e9e4d8');
    for (let i = 0; i < 6; i++) rect(-19 + i * 6, -7, 2, 10, '#cfc7b5');
    poly([[-23, -8], [17, -8], [13, -13], [-19, -13]], col);
    box(-7, -13, 9, 20, '#f5f3ee', '#d6d0c2', '#e9e4d8', 3);
    circ(-2.5, -26, 3, '#2d3a55'); circ(-2.5, -26, 2.1, '#ffffff'); rect(-2.8, -27.6, 0.7, 1.8, '#2d3a55');
    poly([[-9, -33], [6, -33], [-1, -43]], dark);
  } else if (kind === 'towers') { // Downtown Markham: glass towers
    const tower = (tx, w, h, g) => { box(tx, 3, w, h, g, shade('#5d86b0', 0.8), col, 4); for (let yy = 0; yy < h - 4; yy += 4) rect(tx + 1.5, 1 - yy - 2, w - 3, 1.6, 'rgba(255,255,255,.55)'); };
    tower(-21, 10, 22, '#7aa7cf'); tower(5, 9, big ? 27 : 20, '#8fb6d6'); tower(-9, 12, big ? 40 : 33, '#6d9bc6');
    pole = 21;
  } else if (kind === 'heritage') { // Unionville Main Street: a row of old shop fronts
    const shop = (sx, w, h, wall) => { rect(sx, 3 - h, w, h, wall); poly([[sx - 1, 3 - h], [sx + w + 1, 3 - h], [sx + w / 2, -3 - h]], '#5a4a44'); rect(sx, -4, w, 2.5, col); rect(sx + w / 2 - 1.5, -1.5, 3, 4.5, '#6b4a2e'); rect(sx + 1.5, 3 - h + 2, w - 3, 3, '#f8f1dc'); };
    shop(-22, 11, 15, '#e7a89a'); shop(-10, 12, 19, '#f1d98a'); shop(3, 11, 14, '#9cc3d9');
    poly([[14, 3], [18, 0], [18, -13], [14, -11]], '#7ea4b8');
    c.strokeStyle = '#3b3b3b'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-25, 6); c.lineTo(-25, -8); c.stroke(); circ(-25, -9.5, 2, '#fff3b0');
    pole = 21;
  } else if (kind === 'dome') { // the sports dome: a white air dome
    c.fillStyle = '#f7f7f4'; c.beginPath(); c.ellipse(-3, 2, 22, 22, 0, Math.PI, 0); c.fill();
    c.fillStyle = 'rgba(0,0,0,.07)'; c.beginPath(); c.ellipse(4, 2, 15, 22, 0, Math.PI * 1.5, 0); c.lineTo(4, 2); c.fill();
    c.strokeStyle = 'rgba(120,130,140,.5)'; c.lineWidth = 0.8; for (const rx of [8, 15]) { c.beginPath(); c.ellipse(-3, 2, rx, 22, 0, Math.PI, 0); c.stroke(); }
    rect(-25, 0, 44, 4, col); rect(-6, -5, 6, 7, '#5a6478');
  } else if (kind === 'airport') { // Buttonville: a control tower and a little plane
    box(8, 3, 5, 24, '#eee7d8', '#cdc3b0', '#e2dac8', 3); box(4, -21, 13, 6, '#7fb4d9', '#5d86b0', col, 4);
    rect(-22, 1, 22, 3, '#8a8f99'); for (let i = 0; i < 4; i++) rect(-20 + i * 5.5, 2.2, 3, 0.7, '#ffffff');
    poly([[-22, -6], [-6, -8], [-2, -6.5], [-6, -4.5], [-22, -4]], '#ffffff'); poly([[-15, -7], [-11, -7], [-16, -13], [-18, -13]], col); poly([[-15, -4.5], [-11, -4.5], [-16, 1], [-18, 1]], dark);
    poly([[-22, -6], [-20, -6], [-23, -11], [-24, -11]], col); rect(-8, -7.2, 3, 1.4, '#5d7fa3');
    pole = 21;
  } else if (kind === 'factory') { // Esna Park: saw-tooth roofs and a chimney
    box(-21, 4, 34, 12, '#e3ddd0', '#c2b9a6', '#d2cab9', 5);
    for (let i = 0; i < 4; i++) poly([[-21 + i * 8.5, -8], [-21 + i * 8.5 + 8.5, -8], [-21 + i * 8.5, -15]], i % 2 ? dark : col);
    windows(-19, 2, 30, 4, 5); rect(-4, -3, 7, 7, '#5a6478');
    box(11, -8, 4, 16, '#b0563f', '#8a4331', '#9c4b37', 2);
    circ(15, -29, 3.2, 'rgba(255,255,255,.85)'); circ(18.5, -33, 4, 'rgba(255,255,255,.7)');
    pole = 22;
  } else if (kind === 'centre') { // Aaniin: a community centre under one sweeping roof
    box(-21, 3, 36, 12, '#f1ece2', '#d0c8b8', '#e4ddcf');
    rect(-19, -8, 22, 10, '#7fb4d9'); for (let i = 1; i < 5; i++) rect(-19 + i * 4.4, -8, 0.7, 10, '#f1ece2');
    c.fillStyle = col; c.beginPath(); c.moveTo(-24, -9); c.quadraticCurveTo(-6, -24, 20, -12); c.lineTo(22, -9); c.quadraticCurveTo(-4, -18, -24, -6); c.closePath(); c.fill();
    rect(7, -6, 5, 8, '#6b4a2e');
  } else if (kind === 'station') { // Milliken: the GO platform and a train
    rect(-24, 2, 44, 3, '#9c9486'); rect(-24, 4.2, 44, 0.8, '#5a4632');
    poly([[-23, 1], [9, 1], [9, -9], [-19, -9], [-23, -5]], '#3f9d5a'); rect(-23, -3, 32, 2.2, '#ffffff'); windows(-17, -4, 24, 5, 3.6, '#2d3a55');
    circ(-16, 2, 2, '#2b2b2b'); circ(2, 2, 2, '#2b2b2b');
    for (const px of [-20, 12]) rect(px, -19, 1.6, 20, '#7a7468');
    poly([[-24, -19], [16, -19], [18, -15], [-22, -15]], col); poly([[16, -19], [20, -22], [22, -18], [18, -15]], dark);
    pole = 21;
  } else { // the old castle (unknown places)
    poly([[-11, 2], [11, 2], [11, -16], [-11, -16]], '#f6eee1'); poly([[11, 2], [16, -2], [16, -20], [11, -16]], '#d9cbb4');
    poly([[-3, -6], [3, -6], [3, 2], [-3, 2]], '#6b4a2e'); poly([[-17, -15], [20, -15], [12, -25], [-9, -25]], col);
    poly([[-6, -25], [8, -25], [8, -32], [-6, -32]], '#f6eee1'); poly([[-11, -31], [13, -31], [7, -39], [-5, -39]], dark);
  }
  // the owner's flag (a capital flies a bigger one with a gold top)
  c.strokeStyle = '#5a4632'; c.lineWidth = 2; c.beginPath(); c.moveTo(pole, 2); c.lineTo(pole, -52); c.stroke();
  poly([[pole, -52], [pole + 22, -50], [pole + 17, -43], [pole + 22, -36], [pole, -38]], col);
  c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
  if (cap) { c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(pole, -54, 2.6, 0, 7); c.fill(); }
  if (ch) { c.fillStyle = '#fff'; c.font = "900 12px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, pole + 10, -44); }
  c.restore();
}
