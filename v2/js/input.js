// Keyboard + touch input. Produces one plain state object the simulation reads each step.
import { layout, toGame } from './orient.js';

export class Input {
  constructor(root) {
    this.root = root;
    this.s = { sx: 0, sy: 0, run: false, punch: false, act: false, drift: false, horn: false, kb: null };
    this.keys = new Set(); this.touch = { sx: 0, sy: 0, id: null }; this.held = {}; this.inCar = false; this.enabled = false;
    this.usedTouch = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') { if (!this.inCar) this.s.punch = true; e.preventDefault(); }
      if (e.code === 'KeyF' || e.code === 'Enter') this.s.act = true;
      if (e.code === 'KeyH') this.s.horn = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // floating stick on the left half
    const zone = root.querySelector('#stickzone'), base = root.querySelector('#stick'), knob = root.querySelector('#knob');
    const R = 56;
    let ox = 0, oy = 0;
    const pos = (e) => toGame(e.clientX, e.clientY, innerWidth, innerHeight);
    zone.addEventListener('pointerdown', (e) => {
      if (this.touch.id !== null) return;
      this.usedTouch = this.usedTouch || e.pointerType !== 'mouse';
      const p = pos(e); ox = p.x; oy = p.y; this.touch.id = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) {}
      base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    });
    const move = (e) => {
      if (e.pointerId !== this.touch.id) return;
      const p = pos(e); let dx = p.x - ox, dy = p.y - oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.touch.sx = dx / R; this.touch.sy = -dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const up = (e) => { if (e.pointerId !== this.touch.id) return; this.touch.id = null; this.touch.sx = this.touch.sy = 0; base.classList.remove('on'); };
    zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    for (const b of root.querySelectorAll('[data-btn]')) {
      const k = b.dataset.btn;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); this.usedTouch = this.usedTouch || e.pointerType !== 'mouse'; this.held[k] = true; b.classList.add('down');
        if (!this.enabled) return;
        if (k === 'a') { if (this.inCar) this.s.horn = true; else this.s.punch = true; }
        if (k === 'b') this.s.act = true;
      });
      const rel = () => { this.held[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
    }
    // no page scrolling / zooming / long-press menus while playing
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
  // call once per frame before the simulation steps; one-shot flags are cleared by consume()
  read(inCar) {
    this.inCar = inCar;
    const k = this.keys, s = this.s, d = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    const kx = d('KeyD', 'ArrowRight') - d('KeyA', 'ArrowLeft'), ky = d('KeyW', 'ArrowUp') - d('KeyS', 'ArrowDown');
    const t = this.touch;
    if (t.id !== null) { s.sx = t.sx; s.sy = t.sy; s.kb = null; }
    else if (inCar) { s.sx = s.sy = 0; s.kb = kx || ky || !this.usedTouch ? { thr: ky, steer: -kx } : null; }
    else { const m = Math.hypot(kx, ky) || 1; s.sx = kx / m; s.sy = ky / m; s.kb = null; }
    s.run = k.has('ShiftLeft') || k.has('ShiftRight') || (!inCar && !!this.held.c);
    s.drift = inCar && (k.has('Space') || !!this.held.c);
    if (!this.enabled) { s.sx = s.sy = 0; s.kb = null; s.punch = s.act = s.horn = false; }
    return s;
  }
  consume() { this.s.punch = this.s.act = this.s.horn = false; }
}
export { layout };
