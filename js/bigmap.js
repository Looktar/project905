// The full-city map (v0.5, D-71): tap the minimap or press M. Drag to pan, pinch / wheel to zoom,
// search a place (or tap a category chip), then navigate (GPS route on the minimap) or teleport.
// The game is paused while it is open (main.js openModal). Search + routing live in nav.js.
import { CFG } from './config.js';
import { t, getLang } from './i18n.js';
import { toGamePoint } from './input.js';
import { CATS, searchPlaces, spotOf } from './nav.js';

const $ = (id) => document.getElementById(id);
const LABEL_CATS = { lm: 0, mall: 1.1, gas: 2.2, tims: 2.2, food: 3.5, tea: 3.5, other: 2.2 }; // min zoom (px / m) for a name label

export class BigMap {
  constructor(close) {
    this.close = close; this.cv = $('bmCanvas'); this.ctx = this.cv.getContext('2d');
    this.q = $('bmQ'); this.list = $('bmList'); this.card = $('bmCard');
    this.cat = null; this.sel = null; this.ptrs = new Map();
    this.q.addEventListener('input', () => { this.cat = null; this.search(); });
    this.q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const r = this.results && this.results[0]; if (r) this.select(r); this.q.blur(); } if (e.key === 'Escape') this.close(); });
    $('bmChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (!b) return; this.cat = this.cat === b.dataset.c ? null : b.dataset.c; this.q.value = ''; this.search(); });
    this.list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) this.select(this.results[+li.dataset.i]); });
    $('bmGo').addEventListener('click', () => { if (!this.sel) return; this.game.nav.set(this.sel); this.close(); });
    $('bmTp').addEventListener('click', () => {
      if (!this.sel) return;
      const err = this.game.nav.teleport(this.sel);
      if (err) { $('bmMsg').textContent = t(err); return; }
      this.close();
    });
    $('bmStop').addEventListener('click', () => { this.game.nav.clear(); this.card.classList.remove('show'); this.sel = null; this.dirty = true; });
    $('bmMe').addEventListener('click', () => { const P = this.game.playerPos(); this.cx = P.x; this.cz = P.z; this.dirty = true; });
    $('bmIn').addEventListener('click', () => this.zoomAt(1.6));
    $('bmOut').addEventListener('click', () => this.zoomAt(1 / 1.6));
    // pan / pinch / tap
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = toGamePoint(e.clientX, e.clientY); this.ptrs.set(e.pointerId, { x, y, sx: x, sy: y }); this.moved = this.ptrs.size > 1; });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      const [x, y] = toGamePoint(e.clientX, e.clientY);
      if (this.ptrs.size === 1) {
        this.cx -= (x - p.x) / this.s; this.cz -= (y - p.y) / this.s;
        if (Math.hypot(x - p.sx, y - p.sy) > 8) this.moved = true;
      } else {
        const [a, b] = [...this.ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = x; p.y = y;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 10) this.zoomAt(d1 / d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      p.x = x; p.y = y; this.dirty = true;
    });
    const up = (e) => {
      const p = this.ptrs.get(e.pointerId);
      this.ptrs.delete(e.pointerId);
      if (p && !this.moved && !this.ptrs.size) this.tap(p.x, p.y);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => this.ptrs.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toGamePoint(e.clientX, e.clientY); this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
  }

  open(game, W, H) {
    this.game = game; this.w = game.w; this.W = W; this.H = H; SCALE = this.w.map.scale || 0.4;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.dpr = dpr;
    const P = game.playerPos(), [HW, HH] = this.w.half;
    this.sMin = Math.min(W / (HW * 2), H / (HH * 2)) * 0.95; this.sMax = 4;
    if (!this.s) this.s = Math.max(this.sMin, W / 900);
    this.cx = P.x; this.cz = P.z;
    this.q.placeholder = t('mapSearch');
    $('bmChips').innerHTML = Object.entries(CATS).map(([k, v]) => `<button data-c="${k}">${v[0]} ${v[getLang() === 'zh' ? 1 : 2]}</button>`).join('');
    const nav = game.nav.target;
    this.sel = null; this.card.classList.remove('show');
    if (nav) this.select({ ...nav, x: nav.px, z: nav.pz }, false);
    this.search();
    this.dirty = true; this.loop();
  }
  loop() {
    if (!this.game || !$('bigmap').classList.contains('show')) return;
    if (this.dirty) { this.dirty = false; this.draw(); }
    requestAnimationFrame(() => this.loop());
  }
  zoomAt(f, x = this.W / 2, y = this.H / 2) {
    const s = Math.min(this.sMax, Math.max(this.sMin, this.s * f));
    // keep the world point under (x, y) fixed
    const wx = this.cx + (x - this.W / 2) / this.s, wz = this.cz + (y - this.H / 2) / this.s;
    this.s = s; this.cx = wx - (x - this.W / 2) / s; this.cz = wz - (y - this.H / 2) / s;
    this.dirty = true;
  }
  toScreen(x, z) { return [this.W / 2 + (x - this.cx) * this.s, this.H / 2 + (z - this.cz) * this.s]; }

  search() {
    const q = this.q.value.trim();
    for (const b of $('bmChips').children) b.classList.toggle('on', b.dataset.c === this.cat);
    if (!q && !this.cat) { this.results = []; this.list.innerHTML = ''; return; }
    this.results = searchPlaces(this.w, this.game.nav.places, q, this.cat, this.game.playerPos(), 12);
    const zh = getLang() === 'zh', esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    this.list.innerHTML = this.results.length
      ? this.results.map((r, i) => `<div data-i="${i}">${CATS[r.cat][0]} ${esc(zh ? r.zh : r.en)}<small>${dist(r.d)}</small></div>`).join('')
      : `<p>${t('mapNone')}</p>`;
  }
  select(p, center = true) {
    this.sel = p;
    const zh = getLang() === 'zh', d = Math.hypot(p.x - this.game.playerPos().x, p.z - this.game.playerPos().z);
    this.card.firstElementChild.textContent = `${CATS[p.cat] ? CATS[p.cat][0] + ' ' : '📍 '}${zh ? p.zh : p.en}`;
    $('bmDist').textContent = dist(d);
    $('bmMsg').textContent = '';
    $('bmStop').style.display = this.game.nav.target ? '' : 'none';
    this.card.classList.add('show');
    if (center) { this.cx = p.x; this.cz = p.z; if (this.s < 1.1) this.s = Math.min(this.sMax, 1.4); }
    this.list.innerHTML = ''; this.dirty = true;
  }
  // a tap: the nearest labelled place within ~30 px, else that spot on the map (named after its street)
  tap(x, y) {
    let best = null, bd = 30 * 30;
    for (const p of this.visibleLabels || []) { const d = (p.sx - x) ** 2 + (p.sy - y) ** 2; if (d < bd) { bd = d; best = p.p; } }
    if (!best) {
      const wx = this.cx + (x - this.W / 2) / this.s, wz = this.cz + (y - this.H / 2) / this.s;
      const ne = this.w.nearestEdge(wx, wz, 60);
      if (!ne) return;
      const st = this.w.names[ne.e.name] || t('mapHere');
      best = spotOf(this.w, { zh: st, en: st, cat: 'street', edges: [ne.e.i] }, wx, wz);
    }
    this.select(best, false);
  }

  draw() {
    const c = this.ctx, W = this.W, H = this.H, s = this.s, w = this.w, [HW, HH] = w.half, S = CFG.minimap.pxPerM;
    const g = this.game, P = g.playerPos();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#9fd067'; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    const [x0, y0] = this.toScreen(-HW, -HH);
    c.drawImage(w.minimap, x0, y0, (HW * 2 * S) * (s / S), (HH * 2 * S) * (s / S));
    const line = (pts, col, width) => { c.strokeStyle = col; c.lineWidth = width; c.lineJoin = c.lineCap = 'round'; c.beginPath(); pts.forEach((q, i) => { const [x, y] = this.toScreen(q[0], q[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
    const pin = (x, z, col, r) => { const [sx, sy] = this.toScreen(x, z); c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill(); c.stroke(); };
    // routes: mission (orange) and GPS (cyan)
    const nav = g.nav.target, mi = g.missions;
    if (mi.active && mi.route) line([[P.x, P.z], ...mi.route, [mi.active.target.x, mi.active.target.z]], 'rgba(249,115,22,.9)', 5);
    if (nav && g.nav.route) line([[P.x, P.z], ...g.nav.route, [nav.x, nav.z]], 'rgba(6,182,212,.95)', 5);
    // names: landmarks always, the rest once zoomed in; greedy, no overlaps
    const boxes = [], vis = [];
    c.font = '700 13px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const zh = getLang() === 'zh';
    for (const p of g.nav.places) {
      const z = LABEL_CATS[p.cat];
      if (z === undefined || s < z) continue;
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (sx < -50 || sy < -20 || sx > W + 50 || sy > H + 20) continue;
      const txt = (CATS[p.cat][0] + ' ' + (zh ? p.zh : p.en)), tw = c.measureText(txt).width + 8;
      const b = [sx - tw / 2, sy - 10, sx + tw / 2, sy + 10];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b); vis.push({ p, sx, sy });
      c.fillStyle = p.cat === 'lm' ? 'rgba(124,58,237,.92)' : 'rgba(255,255,255,.9)';
      roundRect(c, b[0], b[1], tw, 20, 10); c.fill();
      c.fillStyle = p.cat === 'lm' ? '#fff' : '#2d3a55'; c.fillText(txt, sx, sy + 1);
    }
    this.visibleLabels = vis;
    if (mi.active) pin(mi.active.target.x, mi.active.target.z, '#f97316', 8);
    if (nav) pin(nav.x, nav.z, '#06b6d4', 9);
    if (this.sel) { const [sx, sy] = this.toScreen(this.sel.x, this.sel.z); c.fillStyle = '#e11d48'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy - 16, 9, Math.PI * 0.15, Math.PI * 0.85, true); c.lineTo(sx, sy); c.closePath(); c.fill(); c.stroke(); }
    // the player arrow
    const [px, py] = this.toScreen(P.x, P.z), ang = g.inCar ? g.inCar.a : g.player.face;
    c.save(); c.translate(px, py); c.rotate(-ang + Math.PI);
    c.fillStyle = '#fff'; c.strokeStyle = '#e11d48'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 9); c.lineTo(0, 4); c.lineTo(-9, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#2d3a55'; c.font = '900 16px system-ui, sans-serif'; c.fillText('N ↑', 30, H - 22);
  }
}

let SCALE = 0.4; // game metres per real metre (map.json)
function dist(m) { m /= SCALE; return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
