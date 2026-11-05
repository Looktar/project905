// Keyboard + touch input, and the "forced landscape" layout.
// On phones held in portrait (including iPhone with rotation lock) the whole
// #app container is rotated 90deg so the game is always shown in landscape.
// The geometry (CSS transform, touch -> game coordinates, safe areas) lives in
// orient.js (pure, unit-tested); this file only applies it to the DOM.
import { CFG } from './config.js';
import { orientMode, cssTransform, screenToGame, screenDeltaToGame, safeAreaVars } from './orient.js';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const input = {
  mx: 0, my: 0,            // movement vector in screen space (my>0 = screen up)
  run: false, handbrake: false,
  punch: false, enter: false, horn: false, fire: false, // edge-triggered, cleared each frame
  fireHeld: false,         // lighter / water cannon button held (v0.3)
  rotated: false, rotateDir: 1, W: 0, H: 0,  // forced-landscape state (see orient.js)
};

const keys = new Set();
const edge = (k) => { if (k === 'Space') input.punch = true; if (k === 'KeyF' || k === 'KeyE') input.enter = true; if (k === 'KeyH') input.horn = true; if (k === 'KeyG') input.fire = true; };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return; // typing in the map search box
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) edge(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let joy = null; // {id, cx, cy}
let joyVec = [0, 0];
const btnState = { run: false, punchHeld: false, fireHeld: false };

// Orientation mode currently applied to #app. Touch coordinates are converted with
// this same mode, so they always match the CSS transform on screen (even if a
// resize event has not been handled yet).
let mode = orientMode({ vw: innerWidth, vh: innerHeight, touch: false });

// Forced landscape always turns the page the same way (D-81, the 总决策 asked for one fixed direction):
// the game's top edge along the phone's right edge, so the phone is turned counter-clockwise to play.
export function layout(app) {
  mode = orientMode({ vw: innerWidth, vh: innerHeight, touch: isTouch, rotateDir: CFG.input.rotateDir });
  input.rotated = mode.rotated; input.rotateDir = mode.dir;
  input.W = mode.W; input.H = mode.H;
  app.style.width = mode.W + 'px'; app.style.height = mode.H + 'px';
  app.style.transform = cssTransform(mode);
  // safe-area insets re-mapped to game sides: the HUD CSS uses var(--sa-l) etc.
  const sa = safeAreaVars(mode);
  for (const k in sa) app.style.setProperty(k, sa[k]);
  return [input.W, input.H];
}

// screen -> game (accounts for the rotation)
export function toGameDelta(dx, dy) { return screenDeltaToGame(dx, dy, mode); }
export function toGamePoint(x, y) { return screenToGame(x, y, mode); }

export function initTouch(app, joyEl, knobEl, buttons) {
  const R = 58;
  const base = () => {
    // base centre in game coords: from the element's layout box (untransformed offsets)
    return [joyEl.offsetLeft + joyEl.offsetWidth / 2, joyEl.offsetTop + joyEl.offsetHeight / 2];
  };
  app.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn,.ui')) return;
    const [gx, gy] = toGamePoint(e.clientX, e.clientY);
    // a new finger on the stick side takes the stick over: if the old finger's pointerup was lost
    // (iOS can drop it when the page changes under the finger) the stick must never stay stuck
    if (gx < input.W * 0.5 && (!joy || !down.has(joy.id))) {
      joy = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
      const [bx, by] = base();
      joy.gx0 = bx; joy.gy0 = by;
      // start offset from base centre so the knob jumps to the finger
      joy.ox = gx - bx; joy.oy = gy - by;
      updateJoy(gx - bx, gy - by);
    }
  });
  app.addEventListener('pointermove', (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    const [dx, dy] = toGameDelta(e.clientX - joy.sx, e.clientY - joy.sy);
    updateJoy(joy.ox + dx, joy.oy + dy);
  });
  // fingers currently down, tracked on window (a release outside #app still counts)
  const down = new Set();
  const end = (e) => { down.delete(e.pointerId); if (joy && e.pointerId === joy.id) { joy = null; updateJoy(0, 0); } };
  for (const t of [window, app]) { // (idempotent: in a browser #app's events also reach window)
    t.addEventListener('pointerdown', (e) => down.add(e.pointerId), true);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) t.addEventListener(ev, end, true);
  }
  const reset = () => { down.clear(); if (joy) { joy = null; updateJoy(0, 0); } };
  addEventListener('blur', reset);
  addEventListener('visibilitychange', () => { if (document.hidden) reset(); }); // (bubbles from document)
  // iOS fallback: no finger left on the screen at all -> release the stick
  addEventListener('touchend', (e) => { if (!e.touches.length) reset(); }, true);
  addEventListener('touchcancel', (e) => { if (!e.touches.length) reset(); }, true);
  function updateJoy(dx, dy) {
    const L = Math.hypot(dx, dy);
    const k = L > R ? R / L : 1;
    dx *= k; dy *= k;
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    const m = Math.min(1, L / R);
    joyVec = m < dead ? [0, 0] : [(dx / R), (-dy / R)];
  }
  for (const [el, act] of buttons) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.add('on');
      if (act === 'a') { input.punch = true; btnState.punchHeld = true; }
      if (act === 'b') input.enter = true;
      if (act === 'c') { btnState.run = true; input.horn = true; }
      if (act === 'd') { input.fire = true; btnState.fireHeld = true; }
    });
    const up = (e) => { el.classList.remove('on'); if (act === 'c') btnState.run = false; if (act === 'a') btnState.punchHeld = false; if (act === 'd') btnState.fireHeld = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }
}

// call once per frame before game update
export function poll(inCar) {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (x || y) { const L = Math.hypot(x, y); x /= L; y /= L; }
  if (joyVec[0] || joyVec[1]) { x = joyVec[0]; y = joyVec[1]; input.analog = true; } else input.analog = false;
  input.mx = x; input.my = y;
  input.keyThrottle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.keySteer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || btnState.run;
  input.handbrake = keys.has('Space') || (inCar && btnState.punchHeld);
  input.fireHeld = keys.has('KeyG') || btnState.fireHeld;
}
export function clearEdges() { input.punch = input.enter = input.horn = input.fire = false; }
