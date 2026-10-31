// Keyboard + touch input, and the "forced landscape" layout.
// On phones held in portrait (including iPhone with rotation lock) the whole
// #app container is rotated 90deg so the game is always shown in landscape.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const input = {
  mx: 0, my: 0,            // movement vector in screen space (my>0 = screen up)
  run: false, handbrake: false,
  punch: false, enter: false, horn: false,   // edge-triggered, cleared each frame
  rotated: false, W: 0, H: 0,
};

const keys = new Set();
const edge = (k) => { if (k === 'Space') input.punch = true; if (k === 'KeyF' || k === 'KeyE') input.enter = true; if (k === 'KeyH') input.horn = true; };
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) edge(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let joy = null; // {id, cx, cy}
let joyVec = [0, 0];
const btnState = { run: false, punchHeld: false };

export function layout(app) {
  const w = innerWidth, h = innerHeight;
  input.rotated = isTouch && h > w;
  if (input.rotated) {
    app.style.width = h + 'px'; app.style.height = w + 'px';
    app.style.transform = 'rotate(90deg) translateY(-100%)';
    input.W = h; input.H = w;
  } else {
    app.style.width = w + 'px'; app.style.height = h + 'px';
    app.style.transform = 'none';
    input.W = w; input.H = h;
  }
  return [input.W, input.H];
}

// screen delta -> game delta (accounts for the rotation)
function toGameDelta(dx, dy) { return input.rotated ? [dy, -dx] : [dx, dy]; }
function toGamePoint(x, y) { return input.rotated ? [y, innerWidth - x] : [x, y]; }

export function initTouch(app, joyEl, knobEl, buttons) {
  const R = 58;
  const base = () => {
    // base centre in game coords: from the element's layout box (untransformed offsets)
    return [joyEl.offsetLeft + joyEl.offsetWidth / 2, joyEl.offsetTop + joyEl.offsetHeight / 2];
  };
  app.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn,.ui')) return;
    const [gx, gy] = toGamePoint(e.clientX, e.clientY);
    if (gx < input.W * 0.5 && !joy) {
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
  const end = (e) => { if (joy && e.pointerId === joy.id) { joy = null; updateJoy(0, 0); } };
  app.addEventListener('pointerup', end); app.addEventListener('pointercancel', end);
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
    });
    const up = (e) => { el.classList.remove('on'); if (act === 'c') btnState.run = false; if (act === 'a') btnState.punchHeld = false; };
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
}
export function clearEdges() { input.punch = input.enter = input.horn = false; }
