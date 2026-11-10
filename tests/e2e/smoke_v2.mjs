// Playwright smoke test for the v2 rewrite (v2/): boots the game in headless Chromium (SwiftShader) at
// three viewports, presses Start, walks with the keyboard or a real drag on the touch stick, punches,
// saves a screenshot and fails on any console / page error.
//   npm run smoke:v2            # screenshots in test-results/smoke-v2/
//   BASE_URL=https://looktar.github.io/project905/ npm run smoke:v2   # test the live site
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SHOT_DIR = resolve(process.env.SHOT_DIR || join(ROOT, 'test-results', 'smoke-v2'));
const IGNORE = [/GPU stall due to ReadPixels/, /AudioContext was not allowed/, /requestFullscreen/];
const VIEWPORTS = [
  { name: 'desktop', locale: 'zh-CN', viewport: { width: 1440, height: 900 } },
  { name: 'phone-landscape', locale: 'en-US', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'phone-portrait', locale: 'zh-CN', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, portrait: true },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve(root) {
  const server = http.createServer((req, res) => {
    const fail = (code) => { res.writeHead(code); res.end(String(code)); };
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return fail(400); }
    if (rel.split('/').some((s) => s.startsWith('.'))) return fail(404);
    let file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) return fail(403);
    let st;
    try { st = statSync(file); if (st.isDirectory()) { file = join(file, 'index.html'); st = statSync(file); } } catch { return fail(404); }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function check(browser, base, v) {
  const ctx = await browser.newContext({ viewport: v.viewport, locale: v.locale, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, deviceScaleFactor: v.deviceScaleFactor || 1 });
  const page = await ctx.newPage(), errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  await page.goto(base + 'v2/?debug=1&noauto=1&seed=5');
  await page.waitForFunction(() => window.__p905 && !document.getElementById('start').disabled, null, { timeout: 60000 });
  const title = await page.textContent('#title h1');
  assert(v.locale === 'zh-CN' ? /万锦/.test(title) : /Markham/.test(title), `${v.name}: title language (${title})`);
  assert(!(await page.textContent('body')).includes('GTA'), `${v.name}: forbidden word on screen`);
  const rot = await page.evaluate(() => document.getElementById('root').classList.contains('rot'));
  assert(rot === !!v.portrait, `${v.name}: forced landscape rotation = ${rot}`);
  // Start: a real click / tap on the button (in portrait the button is rotated with the page)
  const sb = await page.locator('#start').boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForFunction(() => document.getElementById('title').classList.contains('hide'), null, { timeout: 5000 });
  const pos = () => page.evaluate(() => { const p = window.__p905.game.player; return { x: p.x, z: p.z }; });
  const a = await pos();
  // SwiftShader runs at a few frames per second: wait for distance, not for time
  const walked = () => page.waitForFunction(([x, z]) => { const p = window.__p905.game.player; return Math.hypot(p.x - x, p.z - z) > 3; }, [a.x, a.z], { timeout: 30000 }).catch(() => {});
  if (!v.isMobile) { await page.keyboard.down('KeyW'); await walked(); await page.keyboard.up('KeyW'); }
  else {
    // drag the stick toward the player's visual "up": screen-up in landscape, screen-right in portrait
    const W = v.viewport.width, H = v.viewport.height;
    const from = v.portrait ? { x: W * 0.3, y: H * 0.2 } : { x: W * 0.15, y: H * 0.7 };
    const to = v.portrait ? { x: from.x + 70, y: from.y } : { x: from.x, y: from.y - 70 };
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 });
    await walked(); await page.mouse.up();
  }
  const b = await pos();
  // "up" on screen is away from the camera: (-sin az, -cos az)
  const az = 0.55, up = (b.x - a.x) * -Math.sin(az) + (b.z - a.z) * -Math.cos(az), side = Math.abs((b.x - a.x) * Math.cos(az) + (b.z - a.z) * -Math.sin(az));
  assert(up > 1.5, `${v.name}: player should walk up the screen (moved ${up.toFixed(2)} m up, ${side.toFixed(2)} m sideways)`);
  if (v.isMobile) {
    const bb = await page.locator('[data-btn=a]').boundingBox();
    assert(bb && bb.width > 40, `${v.name}: punch button visible`);
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  } else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__p905.game.player.punchT > -2 && window.__p905.game.player.punchT !== 0, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => { const P = window.__p905, g = P.game; return { peds: g.peds.length, cars: g.cars.length, chunks: P.wv.live.size, calls: P.renderer.info.render.calls, road: document.querySelector('#road b').textContent }; });
  assert(st.peds > 8 && st.cars > 4 && st.chunks > 3, `${v.name}: world is populated ${JSON.stringify(st)}`);
  assert(st.calls < 150, `${v.name}: draw calls ${st.calls} over budget`);
  assert(st.road && st.road !== '—', `${v.name}: road name shown`);
  await page.screenshot({ path: join(SHOT_DIR, v.name + '.png') });
  assert(!errors.length, `${v.name}: console errors:\n` + errors.join('\n'));
  console.log(`ok ${v.name}: ${JSON.stringify(st)}`);
  await ctx.close();
}

mkdirSync(SHOT_DIR, { recursive: true });
const server = process.env.BASE_URL ? null : await serve(ROOT);
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const v of VIEWPORTS) { try { await check(browser, base, v); } catch (e) { failed = true; console.error('FAIL ' + e.message); } }
await browser.close(); server?.close();
process.exit(failed ? 1 : 0);
