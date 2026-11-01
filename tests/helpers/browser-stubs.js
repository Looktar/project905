// Minimal browser globals so the game's ES modules can be imported in Node.
//
// Provides only what js/*.js touch when imported or when World/Game run:
//   window (= globalThis), innerWidth/innerHeight, devicePixelRatio, matchMedia,
//   window add/removeEventListener, and document.createElement('canvas') with a
//   no-op 2D context (World draws its minimap and sign atlas into canvases).
// Node already has performance, navigator.language, URL, etc.
//
// installBrowserStubs() is idempotent (vitest's setup file calls it, and so does
// tests/helpers/headless.js for use outside vitest). The returned object lets a
// test change the fake viewport / pointer type and fire window events:
//
//   const env = installBrowserStubs();
//   env.setViewport(390, 844); env.setTouch(true);   // before importing js/input.js
//   env.fire('keydown', { code: 'KeyW' });

export function installBrowserStubs() {
  const g = globalThis;
  if (g.__p905stubs) return g.__p905stubs;

  const state = { touch: false, listeners: new Map() };
  const env = {
    state,
    setViewport(w, h) { g.innerWidth = w; g.innerHeight = h; },
    // pointer: coarse + 'ontouchstart' in window (what js/input.js checks for isTouch)
    setTouch(on) { state.touch = !!on; if (on) g.ontouchstart = null; else delete g.ontouchstart; },
    // dispatch a fake event to window listeners (keydown, keyup, blur, resize, ...)
    fire(type, props = {}) {
      const ev = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props };
      for (const fn of [...(state.listeners.get(type) || [])]) fn.call(g, ev);
      return ev;
    },
  };

  if (typeof g.window === 'undefined') g.window = g;
  env.setViewport(1440, 900);
  g.devicePixelRatio = 1;
  g.addEventListener = (type, fn) => {
    if (!state.listeners.has(type)) state.listeners.set(type, []);
    state.listeners.get(type).push(fn);
  };
  g.removeEventListener = (type, fn) => {
    const l = state.listeners.get(type);
    if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1);
  };
  g.matchMedia = (query) => ({
    media: query,
    matches: mediaMatches(query, state),
    onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  if (typeof g.document === 'undefined') {
    g.document = {
      createElement: (tag) => (String(tag).toLowerCase() === 'canvas' ? fakeCanvas() : fakeElement(tag)),
      getElementById: () => null,
      querySelector: () => null,
      documentElement: fakeElement('html'),
      body: fakeElement('body'),
    };
  }
  if (typeof g.requestAnimationFrame === 'undefined') {
    g.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
    g.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  g.__p905stubs = env;
  return env;
}

function mediaMatches(query, state) {
  const q = String(query);
  const g = globalThis;
  if (/pointer\s*:\s*coarse/.test(q)) return state.touch;
  if (/pointer\s*:\s*fine/.test(q)) return !state.touch;
  if (/orientation\s*:\s*portrait/.test(q)) return g.innerHeight > g.innerWidth;
  if (/orientation\s*:\s*landscape/.test(q)) return g.innerWidth >= g.innerHeight;
  return false;
}

// A plain object that looks enough like an HTMLElement for code that only sets
// styles, classes, text and listeners.
export function fakeElement(tag = 'div') {
  const listeners = new Map();
  const classes = new Set();
  const el = {
    tagName: String(tag).toUpperCase(),
    style: { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k] ?? ''; }, removeProperty(k) { delete this[k]; } },
    dataset: {},
    children: [],
    textContent: '',
    className: '',
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; if (v) classes.add(c); else classes.delete(c); return v; },
      contains: (c) => classes.has(c),
    },
    offsetLeft: 0, offsetTop: 0, offsetWidth: 0, offsetHeight: 0,
    listeners,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const l = listeners.get(type); if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); },
    // dispatch a fake event object to this element's listeners
    fire(type, props = {}) {
      const ev = { type, target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props };
      for (const fn of [...(listeners.get(type) || [])]) fn.call(el, ev);
      return ev;
    },
    appendChild(c) { el.children.push(c); return c; },
    remove() {},
    closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
  };
  return el;
}

export function fakeCanvas() {
  const cv = fakeElement('canvas');
  cv.width = 300; cv.height = 150;
  let ctx2d = null;
  cv.getContext = (type) => (type === '2d' ? (ctx2d ||= fake2dContext(cv)) : null); // no WebGL in Node
  cv.toDataURL = () => 'data:,';
  return cv;
}

// 2D context: property writes are kept (fillStyle, font, ...), unknown methods are
// no-ops; measureText returns a rough width from the current font size.
function fake2dContext(canvas) {
  const target = {
    canvas,
    font: '10px sans-serif',
    measureText(text) {
      const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]);
      return { width: String(text).length * px * 0.6, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
    },
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const noop = () => {};
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
