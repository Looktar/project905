// Forced-landscape geometry (spec 5.4). Pure functions only: no DOM access, so
// this module is unit-tested in Node (tests/unit/orient.test.js).
//
// When a touch device is held in portrait, #app is laid out as a landscape box
// (width = innerHeight, height = innerWidth) and rotated by 90deg with CSS
// (#app is position:fixed at 0,0 with transform-origin 0 0). A "mode" says how:
//   m = { rotated, dir, vw, vh }   vw/vh = innerWidth/innerHeight (the real screen)
//   dir  1 = clockwise (default): the game's top edge lies along the phone's right
//            edge, so the player turns the phone counter-clockwise to play and an
//            iPhone notch ends up on the player's left.
//   dir -1 = counter-clockwise: the game's top edge lies along the phone's left edge.
// "Game" coordinates are CSS px inside #app (x right, y down, 0..W x 0..H).
// In native landscape (landscape-primary or landscape-secondary) the browser
// rotates the viewport itself, so every mapping below is the identity.

export const normDir = (d) => (d < 0 ? -1 : 1);

// Decide the mode for a viewport. W/H = size of the (unrotated) game box.
export function orientMode({ vw, vh, touch, rotateDir = 1 }) {
  const rotated = !!touch && vh > vw;
  return { rotated, dir: normDir(rotateDir), vw, vh, W: rotated ? vh : vw, H: rotated ? vw : vh };
}

// CSS transform for #app (needs transform-origin: 0 0).
//   clockwise:          game (x, y) -> screen (vw - y, x)
//   counter-clockwise:  game (x, y) -> screen (y, vh - x)
export function cssTransform(m) {
  if (!m.rotated) return 'none';
  return m.dir < 0 ? 'rotate(-90deg) translateX(-100%)' : 'rotate(90deg) translateY(-100%)';
}

// game point -> screen point (what the CSS transform does)
export function gameToScreen(x, y, m) {
  if (!m.rotated) return [x, y];
  return m.dir < 0 ? [y, m.vh - x] : [m.vw - y, x];
}

// screen point (e.g. PointerEvent clientX/clientY) -> game point
export function screenToGame(x, y, m) {
  if (!m.rotated) return [x, y];
  return m.dir < 0 ? [m.vh - y, x] : [y, m.vw - x];
}

// screen-space movement (finger drag) -> game-space movement
export function screenDeltaToGame(dx, dy, m) {
  if (!m.rotated) return [dx, dy];
  return m.dir < 0 ? [-dy, dx] : [dy, -dx];
}

// Which physical screen edge each game edge lies on (l/r/t/b = game left/right/top/bottom).
export function safeAreaSides(m) {
  if (!m.rotated) return { l: 'left', r: 'right', t: 'top', b: 'bottom' };
  return m.dir < 0
    ? { l: 'bottom', r: 'top', t: 'left', b: 'right' }
    : { l: 'top', r: 'bottom', t: 'right', b: 'left' };
}

// CSS custom properties for #app: --sa-l/r/t/b = the safe-area inset on that
// game side, e.g. clockwise: { '--sa-l': 'env(safe-area-inset-top)', ... }.
// The HUD CSS uses them as var(--sa-l, 0px) instead of env() directly.
export function safeAreaVars(m) {
  const s = safeAreaSides(m), out = {};
  for (const k of ['l', 'r', 't', 'b']) out['--sa-' + k] = `env(safe-area-inset-${s[k]})`;
  return out;
}

// Which way is the phone turned? (v0.9.2, D-79) From the gravity reading of a devicemotion event
// (accelerationIncludingGravity, device axes: x to the screen's right, y to its top).
// sign: +1 where the reading points up (the W3C convention, Android), -1 where it points down
// (iOS Safari); calibrateSign() learns it while the phone is held upright.
// Returns 1 (turned counter-clockwise: the right edge is up, so the game's top goes along the right
// edge, the default rotation), -1 (turned clockwise), or 0 (not clearly sideways: keep what we have).
export function tiltDir(g, sign = 1) {
  if (!g || g.x == null || g.y == null) return 0;
  const x = g.x * sign, y = g.y * sign, z = g.z ? g.z * sign : 0, m = Math.hypot(x, y, z);
  if (m < 1e-6) return 0;
  if (Math.abs(x) < 0.6 * m || Math.abs(x) < 1.5 * Math.abs(y)) return 0;
  return x > 0 ? 1 : -1;
}
// upright portrait (top edge up): the y reading is +g with the W3C convention, -g on inverted devices
export function calibrateSign(g) {
  if (!g || g.x == null || g.y == null) return 0;
  const m = Math.hypot(g.x, g.y, g.z || 0);
  if (m < 1e-6 || Math.abs(g.y) < 0.8 * m) return 0;
  return g.y > 0 ? 1 : -1;
}

