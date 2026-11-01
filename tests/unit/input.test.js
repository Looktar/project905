// js/input.js on a fake DOM: layout() applies the orient.js mode to #app, and the
// touch joystick converts screen coordinates with it (spec 5.4).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { installBrowserStubs, fakeElement } from '../helpers/browser-stubs.js';
import { cssApply, cssUp } from '../helpers/css-transform.js';

// isTouch is decided when js/input.js is first imported: pretend to be a phone first
const env = installBrowserStubs();
env.setTouch(true);
const { input, layout, initTouch, poll, clearEdges, isTouch } = await import('../../js/input.js');
const { CFG } = await import('../../js/config.js');

const PHONE = { w: 390, h: 844 };
const app = fakeElement('div'), joy = fakeElement('div'), knob = fakeElement('div');
const bA = fakeElement('div'), bB = fakeElement('div'), bC = fakeElement('div');
const dir0 = CFG.input.rotateDir;

// lay out for a viewport and place the joystick like index.html does
// (#joy: left 46px, bottom 36px, 150 x 150; safe-area insets are 0 here)
function setViewport(vw, vh, rotateDir = 1) {
  env.setViewport(vw, vh);
  CFG.input.rotateDir = rotateDir;
  const [W, H] = layout(app);
  Object.assign(joy, { offsetLeft: 46, offsetTop: H - 36 - 150, offsetWidth: 150, offsetHeight: 150 });
  return { W, H, css: app.style.transform };
}
// touch at a game point (converted to the screen point the browser would report)
const toScreen = (vp, p) => cssApply(vp.css, vp.W, vp.H, p);
const ptr = (type, id, [x, y]) => app.fire(type, { pointerId: id, clientX: x, clientY: y });

beforeAll(() => { initTouch(app, joy, knob, [[bA, 'a'], [bB, 'b'], [bC, 'c']]); });
afterEach(() => { ptr('pointerup', 1, [0, 0]); poll(false); clearEdges(); });
afterAll(() => { CFG.input.rotateDir = dir0; });

describe('layout()', () => {
  it('detects the stubbed phone as a touch device', () => expect(isTouch).toBe(true));

  it('portrait: rotates #app clockwise by default and swaps width/height', () => {
    const vp = setViewport(PHONE.w, PHONE.h);
    expect([vp.W, vp.H]).toEqual([PHONE.h, PHONE.w]);
    expect(input).toMatchObject({ rotated: true, rotateDir: 1, W: PHONE.h, H: PHONE.w });
    expect(app.style.width).toBe(PHONE.h + 'px');
    expect(app.style.height).toBe(PHONE.w + 'px');
    expect(app.style.transform).toBe('rotate(90deg) translateY(-100%)');
    expect(app.style['--sa-l']).toBe('env(safe-area-inset-top)');
    expect(app.style['--sa-r']).toBe('env(safe-area-inset-bottom)');
    expect(app.style['--sa-t']).toBe('env(safe-area-inset-right)');
    expect(app.style['--sa-b']).toBe('env(safe-area-inset-left)');
  });

  it('portrait with CFG.input.rotateDir = -1: rotates counter-clockwise', () => {
    setViewport(PHONE.w, PHONE.h, -1);
    expect(input).toMatchObject({ rotated: true, rotateDir: -1 });
    expect(app.style.transform).toBe('rotate(-90deg) translateX(-100%)');
    expect(app.style['--sa-l']).toBe('env(safe-area-inset-bottom)');
    expect(app.style['--sa-r']).toBe('env(safe-area-inset-top)');
  });

  it('native landscape: no transform, insets pass through', () => {
    const vp = setViewport(PHONE.h, PHONE.w);
    expect([vp.W, vp.H]).toEqual([PHONE.h, PHONE.w]);
    expect(input.rotated).toBe(false);
    expect(app.style.transform).toBe('none');
    expect(app.style['--sa-l']).toBe('env(safe-area-inset-left)');
    expect(app.style['--sa-b']).toBe('env(safe-area-inset-bottom)');
  });
});

describe.each([
  ['portrait, clockwise', PHONE.w, PHONE.h, 1],
  ['portrait, counter-clockwise', PHONE.w, PHONE.h, -1],
  ['native landscape', PHONE.h, PHONE.w, 1],
])('joystick: %s', (name, vw, vh, rotateDir) => {
  it('dragging toward the visual "up" of the game pushes the stick up (input.my > 0)', () => {
    const vp = setViewport(vw, vh, rotateDir);
    const centre = [46 + 75, vp.H - 36 - 75]; // joystick centre in game coords
    const s0 = toScreen(vp, centre);
    const up = cssUp(vp.css, vp.W, vp.H);
    ptr('pointerdown', 1, s0);
    ptr('pointermove', 1, [s0[0] + up[0] * 40, s0[1] + up[1] * 40]);
    poll(false);
    expect(input.analog).toBe(true);
    expect(input.my).toBeCloseTo(40 / 58, 6); // knob radius R = 58 px
    expect(input.mx).toBeCloseTo(0, 6);
    const [kx, ky] = /translate\((\S+)px, (\S+)px\)/.exec(knob.style.transform).slice(1).map(Number);
    expect(kx).toBeCloseTo(0, 6); // knob drawn 40 px up inside the (unrotated) game box
    expect(ky).toBeCloseTo(-40, 6);
    ptr('pointerup', 1, s0);
    poll(false);
    expect([input.mx, input.my, input.analog]).toEqual([0, 0, false]);
  });

  it('dragging toward the visual "right" steers right (input.mx > 0)', () => {
    const vp = setViewport(vw, vh, rotateDir);
    const s0 = toScreen(vp, [150, vp.H - 120]);
    const s1 = toScreen(vp, [150 + 30, vp.H - 120]); // 30 px to the game's right
    ptr('pointerdown', 1, s0);
    ptr('pointermove', 1, s1);
    poll(false);
    expect(input.mx).toBeGreaterThan(0.3);
    expect(Math.abs(input.my)).toBeLessThan(0.3);
  });

  it('a touch on the right half of the game does not grab the joystick', () => {
    const vp = setViewport(vw, vh, rotateDir);
    const s0 = toScreen(vp, [vp.W * 0.75, vp.H * 0.5]);
    ptr('pointerdown', 1, s0);
    ptr('pointermove', 1, [s0[0] + 30, s0[1] + 30]);
    poll(false);
    expect([input.mx, input.my, input.analog]).toEqual([0, 0, false]);
  });
});

describe('buttons and keyboard', () => {
  it('action buttons set the edge inputs; clearEdges() resets them', () => {
    bA.fire('pointerdown'); bB.fire('pointerdown');
    expect(input.punch).toBe(true);
    expect(input.enter).toBe(true);
    bC.fire('pointerdown');
    poll(false);
    expect(input.run).toBe(true);
    expect(input.horn).toBe(true);
    for (const b of [bA, bB, bC]) b.fire('pointerup');
    clearEdges();
    poll(false);
    expect([input.punch, input.enter, input.horn, input.run]).toEqual([false, false, false, false]);
  });
  it('holding the punch button while driving is the handbrake', () => {
    bA.fire('pointerdown');
    poll(true);
    expect(input.handbrake).toBe(true);
    bA.fire('pointerup');
    poll(true);
    expect(input.handbrake).toBe(false);
  });
  it('WASD / arrows move in screen space (W = up = my > 0) and Space punches', () => {
    env.fire('keydown', { code: 'KeyW' });
    env.fire('keydown', { code: 'KeyD' });
    poll(false);
    expect(input.my).toBeCloseTo(Math.SQRT1_2, 6);
    expect(input.mx).toBeCloseTo(Math.SQRT1_2, 6);
    expect(input.keyThrottle).toBe(1);
    expect(input.keySteer).toBe(1);
    const ev = env.fire('keydown', { code: 'Space' });
    expect(ev.defaultPrevented).toBe(true);
    expect(input.punch).toBe(true);
    env.fire('blur');
    clearEdges();
    poll(false);
    expect([input.mx, input.my, input.punch]).toEqual([0, 0, false]);
  });
});
