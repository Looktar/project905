// Playwright smoke test (spec 6.6): load the game in headless Chromium with
// SwiftShader WebGL at three viewports, press Play, let it run, save a screenshot
// and fail on any console error / page error / failed request.
// Phones: a real touch drag on the joystick must push the stick toward the
// player's visual "up"; in portrait the game must be rotated (forced landscape).
// SwiftShader renders ~3 fps: this checks logic, console and layout, not speed.
//
//   npm run smoke                                 # screenshots in test-results/smoke/
//   SHOT_DIR=/tmp/shots npm run smoke
//   CHROMIUM_PATH=/path/to/chrome npm run smoke   # use a specific Chromium binary
//   BASE_URL=http://localhost:8905/ npm run smoke # test an already running server
//   BASE_URL=https://looktar.github.io/project905/ npm run smoke   # ... or the live site
//
// Plain Node script on purpose (no test runner): it serves the repo itself on a
// free port, so it needs nothing but `playwright`.
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SHOT_DIR = resolve(process.env.SHOT_DIR || join(ROOT, 'test-results', 'smoke'));
const PAGE = '?debug=1&noauto=1'; // noauto: keep graphics settings fixed at headless frame rates
const RUN_MS = 4000;               // let the game run before the screenshot
const IGNORE = [/GPU stall due to ReadPixels/]; // Chromium performance chatter, not our bug

const VIEWPORTS = [
  { name: 'desktop', locale: 'zh-CN', viewport: { width: 1440, height: 900 } },
  { name: 'phone-landscape', locale: 'en-US', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'phone-portrait', locale: 'zh-CN', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, portrait: true },
];

// ---------------------------------------------------------------- static server
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
function serve(root) {
  const server = http.createServer((req, res) => {
    const fail = (code) => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(String(code)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return fail(400); }
    // never serve dot paths (.git, .github, .claude/ agent worktrees, ...)
    if (rel.split('/').some((s) => s.startsWith('.'))) return fail(404);
    let file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) return fail(403);
    let st;
    try { st = statSync(file); if (st.isDirectory()) { file = join(file, 'index.html'); st = statSync(file); } } catch { return fail(404); }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------------------------------------------------------------- checks
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// geometry of #app and the screen direction of the game's "up" (from the applied CSS transform)
const appState = (page) => page.evaluate(() => {
  const app = document.getElementById('app'), cs = getComputedStyle(app), r = app.getBoundingClientRect();
  const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
  const a = m.transformPoint(new DOMPoint(0, 0)), b = m.transformPoint(new DOMPoint(0, -1));
  const joy = document.getElementById('joy').getBoundingClientRect();
  return {
    vw: innerWidth, vh: innerHeight, w: app.offsetWidth, h: app.offsetHeight,
    rect: [r.left, r.top, r.width, r.height].map(Math.round), transform: cs.transform,
    up: [b.x - a.x, b.y - a.y], joy: [joy.left + joy.width / 2, joy.top + joy.height / 2, joy.width],
    saL: app.style.getPropertyValue('--sa-l'),
    input: window.__input ? { rotated: window.__input.rotated, rotateDir: window.__input.rotateDir } : null,
  };
});

async function checkPortrait(page, when) {
  const s = await appState(page);
  check(s.vh > s.vw, `${when}: viewport should be portrait (${s.vw}x${s.vh})`);
  check(s.w === s.vh && s.h === s.vw, `${when}: #app should be ${s.vh}x${s.vw} (swapped), got ${s.w}x${s.h}`);
  check(s.transform !== 'none', `${when}: #app should be rotated, transform is none`);
  check(s.rect[0] === 0 && s.rect[1] === 0 && s.rect[2] === s.vw && s.rect[3] === s.vh, `${when}: rotated #app should cover the screen, rect ${s.rect}`);
  check(Math.abs(Math.abs(s.up[0]) - 1) < 1e-6 && Math.abs(s.up[1]) < 1e-6, `${when}: game "up" should point sideways on a portrait screen, got ${s.up}`);
  if (s.input) {
    check(s.input.rotated === true, `${when}: input.rotated should be true`);
    check(Math.sign(s.up[0]) === s.input.rotateDir, `${when}: rotateDir ${s.input.rotateDir} but game up points ${s.up}`);
  }
  check(/^env\(safe-area-inset-(top|bottom)\)$/.test(s.saL), `${when}: --sa-l should map to the top/bottom inset, got "${s.saL}"`);
  return s;
}

// touch-drag from the joystick centre toward the game's visual "up"; input.my must go > 0
async function joystickDrag(page, context, shotPath) {
  const s = await appState(page);
  const [x0, y0] = s.joy, L = 50;
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  // record whether the game cancelled each touchmove (iOS Safari / in-app browsers otherwise drag the whole page)
  await page.evaluate(() => { window.__tmPrevented = []; addEventListener('touchmove', (e) => window.__tmPrevented.push(e.defaultPrevented), { passive: false }); });
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', x0 + (s.up[0] * L * i) / 5, y0 + (s.up[1] * L * i) / 5); await sleep(30); }
  const tm = await page.evaluate(() => window.__tmPrevented);
  check(tm.length > 0 && tm.every(Boolean), `joystick touchmoves must be cancelled so the page cannot pan, got ${JSON.stringify(tm)}`);
  await page.waitForFunction(() => window.__input.my > 0.5, null, { timeout: 15000 })
    .catch(async () => { throw new Error('joystick drag toward visual up did not give input.my > 0.5, got ' + JSON.stringify(await page.evaluate(() => [window.__input.mx, window.__input.my]))); });
  const [mx, my] = await page.evaluate(() => [window.__input.mx, window.__input.my]);
  check(Math.abs(mx) < 0.2, `joystick drag straight up gave mx = ${mx}`);
  if (shotPath) await page.screenshot({ path: shotPath });
  await touch('touchEnd');
  await page.waitForFunction(() => window.__input.my === 0 && window.__input.mx === 0, null, { timeout: 15000 });
  await cdp.detach();
  return [mx, my];
}

async function runViewport(browser, base, vp) {
  const { name, portrait, ...ctxOpts } = vp;
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && !IGNORE.some((re) => re.test(msg.text()))) problems.push(`console error: ${msg.text()}`); });
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => { if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`); });
  const notes = [];
  try {
    await page.goto(new URL(PAGE, base).href, { waitUntil: 'load' });
    await page.waitForFunction(() => { const b = document.getElementById('startBtn'); return b && !b.disabled; }, null, { timeout: 120000 });
    if (portrait) await checkPortrait(page, 'title screen');
    if (ctxOpts.hasTouch) await page.tap('#startBtn'); else await page.click('#startBtn');
    await page.waitForFunction(() => window.__game && window.__input, null, { timeout: 30000 });
    await sleep(RUN_MS);
    if (portrait) {
      const s = await checkPortrait(page, 'in game');
      notes.push(`rotated ${s.input.rotateDir > 0 ? 'clockwise' : 'counter-clockwise'}, #app ${s.w}x${s.h}`);
    }
    const shot = join(SHOT_DIR, `${name}.png`);
    await page.screenshot({ path: shot });
    notes.push(`screenshot ${shot}`);
    if (ctxOpts.hasTouch) {
      const [mx, my] = await joystickDrag(page, context, join(SHOT_DIR, `${name}-drag.png`));
      notes.push(`joystick up-drag -> mx ${mx.toFixed(2)}, my ${my.toFixed(2)}`);
    } else {
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => window.__input.my === 1, null, { timeout: 15000 });
      await page.keyboard.up('KeyW');
      notes.push('keyboard W -> my 1');
    }
    notes.push('hud: ' + (await page.locator('#dbg').textContent()).trim());
    // the big map (v0.5): tap the minimap, search, pick the first result, screenshot, close
    const tap = (sel) => (ctxOpts.hasTouch ? page.tap(sel) : page.click(sel));
    await tap('#mini');
    await page.waitForSelector('#bigmap.show', { timeout: 5000 });
    await page.fill('#bmQ', 'pacific mall');
    await tap('#bmList [data-i="0"]');
    await page.waitForSelector('#bmCard.show', { timeout: 5000 });
    await sleep(500);
    await page.screenshot({ path: join(SHOT_DIR, `${name}-map.png`) });
    notes.push('big map: ' + (await page.locator('#bmCard b').textContent()).trim());
    await tap('#bigmap .x');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
    await page.screenshot({ path: join(SHOT_DIR, `${name}-failure.png`) }).catch(() => {});
  }
  await context.close();
  return { name, problems, notes };
}

// ---------------------------------------------------------------- main
const watchdog = setTimeout(() => { console.error('smoke: timed out after 6 minutes'); process.exit(1); }, 6 * 60 * 1000);
mkdirSync(SHOT_DIR, { recursive: true });
const server = process.env.BASE_URL ? null : await serve(ROOT);
const base = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/?$/, '/') : `http://127.0.0.1:${server.address().port}/`;
console.log(`smoke: ${base}${PAGE}`);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
try {
  for (const vp of VIEWPORTS) {
    const t0 = Date.now();
    const r = await runViewport(browser, base, vp);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.problems.length) failed++;
    console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${r.name} (${vp.viewport.width}x${vp.viewport.height}, ${secs}s)`);
    for (const n of r.notes) console.log('       ' + n);
    for (const p of r.problems) console.log('     ! ' + p);
  }
} finally {
  await browser.close();
  server?.close();
  clearTimeout(watchdog);
}
console.log(failed ? `smoke: ${failed} viewport(s) failed` : 'smoke: all viewports passed');
process.exit(failed ? 1 : 0);
