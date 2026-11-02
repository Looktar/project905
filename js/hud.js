// DOM HUD: minimap (tap: the big map, bigmap.js), street name, health, speech bubbles, banners, busted overlay.
import { CFG } from './config.js';
import { t } from './i18n.js';

export class HUD {
  constructor(app) {
    this.app = app;
    this.el = (id) => document.getElementById(id);
    this.mini = this.el('mini'); this.mctx = this.mini.getContext('2d');
    this.street = this.el('street'); this.streetName = this.el('streetName'); this.hp = this.el('hp'); this.hpFill = this.el('hpfill');
    this.bubbles = []; this.layer = this.el('bubbles');
    this.bannerEl = this.el('banner'); this.bustEl = this.el('bust'); this.meter = this.el('meter');
    this.lastStreet = '';
    this.miniOpen = true;
    this.mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.onMiniTap) this.onMiniTap(); }); // the big map (v0.5); size is in Settings
  }
  setMiniOpen(open) { this.miniOpen = open; this.mini.classList.toggle('small', !open); }
  setWorld(world) { this.world = world; }
  bubble(text, pos, cls = '') {
    const d = document.createElement('div');
    d.className = 'bub ' + cls; d.textContent = text;
    this.layer.appendChild(d);
    this.bubbles.push({ d, pos, life: cls === 'pow' ? 0.7 : 1.6 });
    if (this.bubbles.length > 14) { const b = this.bubbles.shift(); b.d.remove(); }
  }
  banner(text, color) {
    const b = this.bannerEl;
    b.textContent = text; b.className = 'show ' + color;
    clearTimeout(this._bt); this._bt = setTimeout(() => (b.className = ''), 2600);
  }
  // missions (v0.3): money pill under the minimap, job panel at the bottom
  money(v) { const e = this.el('money'); if (e && this._money !== v) { this._money = v; e.textContent = '$ ' + v; e.classList.toggle('show', v > 0); } }
  mission(title, sub, hurry) {
    const e = this.el('mission'); if (!e) return;
    if (!title) { if (this._mis) { e.classList.remove('show'); this._mis = ''; } return; }
    const key = title + sub + hurry;
    if (key === this._mis) return;
    this._mis = key; e.classList.add('show'); e.classList.toggle('hurry', !!hurry);
    e.firstElementChild.textContent = title; e.lastElementChild.textContent = sub;
  }
  busted(on) { this.bustEl.textContent = t('busted'); this.bustEl.classList.toggle('show', on); }
  chaseMeter(v) { this.meter.style.display = v > 0.02 ? 'block' : 'none'; this.meter.firstElementChild.style.width = Math.min(100, v * 100) + '%'; }
  setMode(inCar, type) {
    const bD = this.el('bD');
    if (bD) { bD.textContent = t(inCar ? 'spray' : 'light'); bD.classList.toggle('hide', !!inCar && type !== 'fire'); }
    this.el('bA').textContent = t(inCar ? 'drift' : 'punch');
    this.el('bB').textContent = t(inCar ? 'exit' : 'enter');
    this.el('bC').textContent = t(inCar ? 'horn' : 'run');
  }
  update(dt, game, renderer, W, H) {
    // bubbles
    for (const b of this.bubbles) {
      b.life -= dt;
      const p = renderer.project(b.pos);
      if (!p) { b.d.style.display = 'none'; continue; }
      b.d.style.display = 'block';
      b.d.style.left = (p[0] * W).toFixed(1) + 'px';
      b.d.style.top = (p[1] * H - (1.6 - b.life) * 14).toFixed(1) + 'px';
      if (b.life < 0.3) b.d.style.opacity = Math.max(0, b.life / 0.3);
    }
    this.bubbles = this.bubbles.filter((b) => { if (b.life <= 0) { b.d.remove(); return false; } return true; });
    if (!game) return;
    const P = game.playerPos();
    // street name (throttled)
    const nowMs = performance.now();
    if (!this._st || nowMs - this._st > 350) {
      this._st = nowMs;
      const s = this.world.streetName(P.x, P.z);
      if (s && s !== this.lastStreet) { this.streetName.textContent = s; this.street.classList.add('show'); this.lastStreet = s; }
      if (!s) this.street.classList.remove('show');
    }
    // health (only when hurt)
    const p = game.player;
    const show = p.hp < CFG.player.hp - 0.5 || p.hurtT > 0;
    this.hp.classList.toggle('show', show);
    this.hpFill.style.width = Math.max(0, (p.hp / CFG.player.hp) * 100) + '%';
    this.drawMini(game, P);
  }
  drawMini(game, P) {
    const c = this.mctx, cv = this.mini, S = CFG.minimap.pxPerM;
    const size = cv.width, R = this.miniOpen ? CFG.minimap.radiusM : CFG.minimap.radiusM * 0.6;
    const [HW, HH] = this.world.half;
    const img = this.world.minimap;
    c.save();
    c.clearRect(0, 0, size, size);
    c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, 7); c.clip();
    const sx = (P.x + HW) * S - R * S, sy = (P.z + HH) * S - R * S;
    c.fillStyle = '#9fd067'; c.fillRect(0, 0, size, size);
    c.drawImage(img, sx, sy, R * 2 * S, R * 2 * S, 0, 0, size, size);
    const k = size / (R * 2);
    const dot = (x, z, col, r) => { const px = size / 2 + (x - P.x) * k, py = size / 2 + (z - P.z) * k; c.fillStyle = col; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); };
    const blink = Math.floor(performance.now() / 250) % 2;
    for (const ch of game.chars) if (ch.kind === 'cop') dot(ch.x, ch.z, ch.state === 'chase' ? (blink ? '#ef4444' : '#3b82f6') : '#3b82f6', size * 0.022);
    for (const car of game.cars) if (car.type === 'police' && car !== game.inCar) dot(car.x, car.z, car.chasing ? (blink ? '#3b82f6' : '#ef4444') : '#1e3a8a', size * 0.032);
    if (game.missions) game.missions.mini(c, P, k, size);
    if (game.nav) game.nav.mini(c, P, k, size);
    // player arrow
    const ang = game.inCar ? game.inCar.a : game.player.face;
    c.translate(size / 2, size / 2); c.rotate(-ang + Math.PI);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#e11d48'; c.lineWidth = size * 0.02;
    c.beginPath(); c.moveTo(0, -size * 0.07); c.lineTo(size * 0.05, size * 0.05); c.lineTo(0, size * 0.025); c.lineTo(-size * 0.05, size * 0.05); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // north marker
    c.fillStyle = '#2d3a55'; c.font = `700 ${size * 0.1}px sans-serif`; c.textAlign = 'center'; c.fillText('N', size / 2, size * 0.12);
  }
}
