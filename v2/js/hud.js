// HUD: minimap, road name, health, wanted banner, speech bubbles, button labels.
import { CFG, COL } from './config.js';
import { i18n } from './i18n.js';

const AZ = CFG.camera.azimuth;
export class Hud {
  constructor(root, world) {
    this.root = root; this.w = world;
    const $ = (id) => root.querySelector(id);
    this.el = { road: $('#road'), hp: $('#hp'), hpFill: $('#hpfill'), banner: $('#banner'), bannerFill: $('#bannerfill'), bannerTxt: $('#bannertxt'), busted: $('#busted'), bubbles: $('#bubbles'), mini: $('#mini'), dbg: $('#dbg'), a: $('[data-btn=a]'), b: $('[data-btn=b]'), c: $('[data-btn=c]') };
    this.bub = []; this.roadT = 0; this.lastRoad = ''; this.flashT = 0;
    this.drawMap();
    this.mctx = this.el.mini.getContext('2d');
  }
  // whole map pre-rendered once; the minimap just crops it
  drawMap() {
    const m = this.w.map, k = CFG.minimap.pxPerM, hx = this.w.half[0], hz = this.w.half[1];
    const cv = document.createElement('canvas'); cv.width = Math.ceil(hx * 2 * k); cv.height = Math.ceil(hz * 2 * k);
    const c = cv.getContext('2d');
    c.fillStyle = '#a8d77a'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(k, 0, 0, k, hx * k, hz * k);
    const poly = (p) => { c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); };
    const line = (p, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); };
    c.lineCap = c.lineJoin = 'round';
    c.fillStyle = '#bfe389'; for (const a of m.parks) poly(a.p);
    c.fillStyle = '#d5dae3'; for (const a of m.lots) poly(a.p);
    c.fillStyle = COL.water; for (const a of m.water) poly(a.p);
    for (const [big, pts] of m.rivers) line(pts, big ? 9 : 4, COL.water);
    c.fillStyle = '#e9dfd0'; for (const b of m.buildings) poly(b.p);
    for (const pts of m.rails) line(pts, 3, '#8b7d6b');
    for (const e of this.w.edges) if (e.cls === 3) line(e.pts, 7, '#ffffff');
    for (const e of this.w.edges) if (e.cls < 3) line(e.pts, Math.max(9, e.w), e.cls === 0 ? '#ffe08a' : '#ffffff');
    for (const pts of m.overpass) line(pts, 14, '#c3c9d6');
    this.map = cv;
  }
  minimap(g, lms) {
    const cv = this.el.mini, c = this.mctx, S = cv.width, k = CFG.minimap.pxPerM, R = CFG.minimap.radiusM, f = g.focus;
    const sc = S / (2 * R * k), hx = this.w.half[0], hz = this.w.half[1];
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#a8d77a'; c.fillRect(0, 0, S, S);
    c.drawImage(this.map, (f.x + hx - R) * k, (f.z + hz - R) * k, 2 * R * k, 2 * R * k, 0, 0, S, S);
    const at = (x, z) => [S / 2 + (x - f.x) * k * sc, S / 2 + (z - f.z) * k * sc];
    for (const lm of lms) { const [x, y] = at(lm.x, lm.z); if (x < -8 || y < -8 || x > S + 8 || y > S + 8) continue; c.fillStyle = lm.t === 'tims' ? '#c9853f' : '#ff6b4a'; c.beginPath(); c.arc(x, y, lm.t === 'tims' ? 3 : 5, 0, 7); c.fill(); }
    c.fillStyle = '#1e3a8a';
    for (const q of g.peds) if (q.cop) { const [x, y] = at(q.x, q.z); c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
    for (const q of g.cars) if (q.type === 'police' && q.driver === 'cop') { const [x, y] = at(q.x, q.z); c.fillRect(x - 4, y - 4, 8, 8); }
    // player arrow (map north is up)
    c.translate(S / 2, S / 2); c.rotate(Math.PI - f.h);
    c.fillStyle = g.wanted ? '#ff3b3b' : '#ff6b4a'; c.strokeStyle = '#fff'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 7); c.lineTo(0, 3); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke();
  }
  bubble(who, text, cls = '') {
    for (const b of this.bub) if (b.who === who && !cls) { b.el.textContent = text; b.t = 1.6; return; }
    if (this.bub.length > 9) return;
    const el = document.createElement('div'); el.className = 'bubble ' + cls; el.textContent = text;
    this.el.bubbles.appendChild(el);
    this.bub.push({ who, el, t: cls ? 0.55 : 1.6, x: who.x, z: who.z, pow: !!cls, r: (Math.random() - 0.5) * 24 });
  }
  events(ev) {
    for (const e of ev) {
      if (e.k === 'say') this.bubble(e.who, i18n.pick('s_' + e.key));
      else if (e.k === 'hit') this.bubble({ x: e.x, z: e.z }, i18n.pick('pow'), 'pow');
      else if (e.k === 'crash' && e.tier !== 'small') this.bubble({ x: e.x, z: e.z }, i18n.pick('pow'), 'pow');
      else if (e.k === 'busted') { this.el.busted.classList.add('on'); this.el.busted.querySelector('b').textContent = i18n.t('busted'); this.el.busted.querySelector('span').textContent = i18n.t('bustedSub'); }
      else if (e.k === 'respawn') this.el.busted.classList.remove('on');
      else if (e.k === 'escaped') { this.flashT = 2; this.flash = i18n.t('escaped'); }
    }
  }
  update(dt, g, project, lms, dbg) {
    const p = g.player, el = this.el;
    this.roadT -= dt;
    if (this.roadT <= 0) {
      this.roadT = 0.3;
      const n = this.w.roadName(g.focus.x, g.focus.z);
      if (n !== this.lastRoad) { this.lastRoad = n; el.road.querySelector('b').textContent = n || '—'; }
      this.minimap(g, lms);
    }
    el.hp.classList.toggle('on', p.hp < CFG.player.hp - 0.5 || (p.car && p.car.hp < 99));
    el.hpFill.style.width = Math.max(0, p.car ? p.car.hp : p.hp) + '%';
    el.hp.dataset.icon = p.car ? '🚗' : '♥';
    this.flashT -= dt;
    const show = g.wanted || this.flashT > 0;
    el.banner.classList.toggle('on', show); el.banner.classList.toggle('good', !g.wanted);
    if (g.wanted) { el.bannerTxt.textContent = i18n.t(g.lostT > 2 ? 'losing' : 'wanted'); el.bannerFill.style.width = (g.lostT / CFG.police.giveUp * 100) + '%'; }
    else if (this.flashT > 0) { el.bannerTxt.textContent = this.flash; el.bannerFill.style.width = '100%'; }
    const car = !!p.car, lab = car ? ['horn', 'exit', 'drift'] : ['punch', 'enter', 'run'];
    if (this.car !== car || this.lang !== i18n.lang) { this.car = car; this.lang = i18n.lang; el.a.textContent = i18n.t(lab[0]); el.b.textContent = i18n.t(lab[1]); el.c.textContent = i18n.t(lab[2]); }
    el.b.classList.toggle('dim', !car && !g.nearCar);
    for (const b of this.bub) {
      b.t -= dt;
      if (b.who.x !== undefined && !b.pow) { b.x = b.who.x; b.z = b.who.z; }
      const s = project(b.x, b.pow ? 3.2 + (0.55 - b.t) * 3 : 3.6, b.z);
      b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)` + (b.pow ? ` rotate(${b.r}deg) scale(${1 + (0.55 - b.t)})` : '');
      b.el.style.opacity = Math.min(1, b.t * 4);
      if (b.t <= 0) b.el.remove();
    }
    this.bub = this.bub.filter((b) => b.t > 0);
    if (dbg) el.dbg.textContent = dbg;
  }
}
export { AZ };
