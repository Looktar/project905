// Forced landscape (spec 5.4): the four required cases - rotated mode clockwise /
// counter-clockwise, native landscape primary / secondary - checked against an
// independent evaluation of the CSS transform string (tests/helpers/css-transform.js).
import { describe, it, expect } from 'vitest';
import {
  orientMode, cssTransform, gameToScreen, screenToGame, screenDeltaToGame,
  safeAreaSides, safeAreaVars, normDir,
} from '../../js/orient.js';
import { cssApply, cssUp } from '../helpers/css-transform.js';

const PHONE = { w: 390, h: 844 }; // iPhone 12-15 class viewport, CSS px

const CASES = [
  { name: 'portrait, rotated clockwise (default)', vw: PHONE.w, vh: PHONE.h, rotateDir: 1, rotated: true, dir: 1 },
  { name: 'portrait, rotated counter-clockwise', vw: PHONE.w, vh: PHONE.h, rotateDir: -1, rotated: true, dir: -1 },
  { name: 'native landscape-primary (notch on the left)', vw: PHONE.h, vh: PHONE.w, rotateDir: 1, rotated: false, dir: 1 },
  { name: 'native landscape-secondary (notch on the right)', vw: PHONE.h, vh: PHONE.w, rotateDir: -1, rotated: false, dir: -1 },
];
const modeOf = (c) => orientMode({ vw: c.vw, vh: c.vh, touch: true, rotateDir: c.rotateDir });

const near = (a, b) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};
const round0 = (v) => Math.round(v) + 0; // + 0 turns -0 into 0

describe('orientMode', () => {
  it('rotates only touch devices held in portrait; the game box is always landscape', () => {
    for (const c of CASES) {
      const m = modeOf(c);
      expect(m.rotated, c.name).toBe(c.rotated);
      expect(m.dir).toBe(c.dir);
      expect(m.W).toBe(PHONE.h);
      expect(m.H).toBe(PHONE.w);
    }
    // a tall desktop window is never rotated
    expect(orientMode({ vw: 600, vh: 900, touch: false }).rotated).toBe(false);
    // square viewport counts as landscape
    expect(orientMode({ vw: 500, vh: 500, touch: true }).rotated).toBe(false);
  });
  it('normalises the configured direction (anything >= 0 means clockwise)', () => {
    expect(normDir(1)).toBe(1);
    expect(normDir(0)).toBe(1);
    expect(normDir(undefined)).toBe(1);
    expect(normDir(-1)).toBe(-1);
    expect(normDir(-3)).toBe(-1);
    expect(orientMode({ vw: 390, vh: 844, touch: true }).dir).toBe(1);
  });
  it('uses the expected CSS transform strings', () => {
    expect(cssTransform(modeOf(CASES[0]))).toBe('rotate(90deg) translateY(-100%)');
    expect(cssTransform(modeOf(CASES[1]))).toBe('rotate(-90deg) translateX(-100%)');
    expect(cssTransform(modeOf(CASES[2]))).toBe('none');
    expect(cssTransform(modeOf(CASES[3]))).toBe('none');
  });
});

describe.each(CASES)('$name', (c) => {
  const m = modeOf(c);
  const css = cssTransform(m);
  const { W, H } = m;
  const pts = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2], [W * 0.21, H * 0.77], [121, H - 111]];

  it('the transformed game box covers exactly the screen', () => {
    const scr = pts.slice(0, 4).map((p) => cssApply(css, W, H, p));
    const xs = scr.map((p) => round0(p[0])).sort((a, b) => a - b);
    const ys = scr.map((p) => round0(p[1])).sort((a, b) => a - b);
    expect([xs[0], xs[3], ys[0], ys[3]]).toEqual([0, c.vw, 0, c.vh]);
  });

  it('round trip: CSS(game point) -> screenToGame gives the game point back', () => {
    for (const p of pts) {
      const s = cssApply(css, W, H, p);
      near(screenToGame(s[0], s[1], m), p);
      near(gameToScreen(p[0], p[1], m), s); // forward helper agrees with the CSS
    }
  });

  it('a finger dragged toward the visual "up" of the game gives game dy < 0', () => {
    const up = cssUp(css, W, H); // screen direction of the game's up
    const [dx, dy] = screenDeltaToGame(up[0] * 40, up[1] * 40, m);
    expect(dy).toBeCloseTo(-40, 6);
    expect(dx).toBeCloseTo(0, 6);
    // and "right" in the game is game dx > 0
    const r0 = cssApply(css, W, H, [10, 10]), r1 = cssApply(css, W, H, [11, 10]);
    const [rx, ry] = screenDeltaToGame((r1[0] - r0[0]) * 25, (r1[1] - r0[1]) * 25, m);
    expect(rx).toBeCloseTo(25, 6);
    expect(ry).toBeCloseTo(0, 6);
  });

  it('screenDeltaToGame matches differences of screenToGame', () => {
    for (const [sx, sy, dx, dy] of [[10, 20, 5, -7], [200, 300, -40, 13], [0, 0, 1, 1]]) {
      const a = screenToGame(sx, sy, m), b = screenToGame(sx + dx, sy + dy, m);
      near(screenDeltaToGame(dx, dy, m), [b[0] - a[0], b[1] - a[1]]);
    }
  });

  it('safe-area mapping: each game edge reads the inset of the screen edge it lies on', () => {
    const sides = safeAreaSides(m);
    const mids = { l: [0, H / 2], r: [W, H / 2], t: [W / 2, 0], b: [W / 2, H] };
    const edgeOf = ([x, y]) => (Math.abs(x) < 1e-6 ? 'left' : Math.abs(x - c.vw) < 1e-6 ? 'right' : Math.abs(y) < 1e-6 ? 'top' : 'bottom');
    for (const k of ['l', 'r', 't', 'b']) expect(sides[k], k).toBe(edgeOf(cssApply(css, W, H, mids[k])));
    const vars = safeAreaVars(m);
    for (const k of ['l', 'r', 't', 'b']) expect(vars['--sa-' + k]).toBe(`env(safe-area-inset-${sides[k]})`);
  });
});

describe('safe areas on an iPhone with a notch', () => {
  // what env(safe-area-inset-*) reports, per physical orientation (CSS px)
  const PORTRAIT = { top: 47, bottom: 34, left: 0, right: 0 };
  const resolve = (m, env) => {
    const out = {};
    for (const [k, v] of Object.entries(safeAreaVars(m))) out[k.slice(-1)] = env[/inset-(\w+)/.exec(v)[1]];
    return out;
  };
  it('rotated clockwise: notch on the game\'s left (joystick side), home bar on the right', () => {
    expect(safeAreaSides(modeOf(CASES[0]))).toEqual({ l: 'top', r: 'bottom', t: 'right', b: 'left' });
    expect(resolve(modeOf(CASES[0]), PORTRAIT)).toEqual({ l: 47, r: 34, t: 0, b: 0 });
  });
  it('rotated counter-clockwise: notch on the game\'s right', () => {
    expect(safeAreaSides(modeOf(CASES[1]))).toEqual({ l: 'bottom', r: 'top', t: 'left', b: 'right' });
    expect(resolve(modeOf(CASES[1]), PORTRAIT)).toEqual({ l: 34, r: 47, t: 0, b: 0 });
  });
  it('native landscape-primary / -secondary: insets pass straight through', () => {
    const primary = { left: 47, right: 47, top: 0, bottom: 21 }; // iOS pads both sides in landscape
    const secondary = { left: 0, right: 59, top: 0, bottom: 21 };
    expect(resolve(modeOf(CASES[2]), primary)).toEqual({ l: 47, r: 47, t: 0, b: 21 });
    expect(resolve(modeOf(CASES[3]), secondary)).toEqual({ l: 0, r: 59, t: 0, b: 21 });
    expect(safeAreaVars(modeOf(CASES[3]))).toEqual({
      '--sa-l': 'env(safe-area-inset-left)', '--sa-r': 'env(safe-area-inset-right)',
      '--sa-t': 'env(safe-area-inset-top)', '--sa-b': 'env(safe-area-inset-bottom)',
    });
  });
});

// v0.9.2 (D-79): which way the phone is turned, from the gravity sensor
import { tiltDir, calibrateSign } from '../../js/orient.js';
describe('tilt direction', () => {
  const g = 9.81;
  it('W3C / Android convention (reading points up)', () => {
    expect(tiltDir({ x: g, y: 0.5, z: 1 }, 1)).toBe(1);    // turned counter-clockwise: right edge up
    expect(tiltDir({ x: -g, y: 0.5, z: 1 }, 1)).toBe(-1);  // turned clockwise: left edge up
    expect(tiltDir({ x: 1, y: g, z: 1 }, 1)).toBe(0);      // upright portrait: keep
    expect(tiltDir({ x: 0.5, y: 0.5, z: g }, 1)).toBe(0);  // lying flat: keep
    expect(tiltDir({ x: 6, y: 5, z: 3 }, 1)).toBe(0);      // in between: keep
  });
  it('inverted readings (iOS Safari) give the same answer once the sign is known', () => {
    expect(calibrateSign({ x: 0.3, y: -g, z: -0.5 })).toBe(-1); // upright on an inverted device
    expect(calibrateSign({ x: 0.3, y: g, z: 0.5 })).toBe(1);
    expect(calibrateSign({ x: g, y: 0.3, z: 0 })).toBe(0);      // sideways: cannot tell
    expect(tiltDir({ x: -g, y: -0.5, z: -1 }, -1)).toBe(1);
    expect(tiltDir({ x: g, y: -0.5, z: -1 }, -1)).toBe(-1);
    expect(tiltDir(null, 1)).toBe(0);
  });
});
