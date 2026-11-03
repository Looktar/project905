// Close-up screenshots of the characters (art review, D-72). Needs `npm run serve` on :8905.
//   node tools/char_closeup.mjs  ->  test-results/chars/closeup.png, ingame.png
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'test-results/chars/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8905/?noauto=1');
await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 120000 });
await page.click('#startBtn');
await page.waitForFunction(() => window.__game);
// line up a cast in the middle of the spawn junction (no buildings in front), facing the camera
const pose = async (dist, elev) => page.evaluate(async ([dist, elev]) => {
  const v = document.querySelector('script[type=importmap]').textContent.match(/config\.js\?v=(\w+)/)[1];
  const { CFG } = await import('./js/config.js?v=' + v);
  CFG.camera.distWalk = dist; CFG.camera.elevation = elev;
  const g = window.__game, P = g.player, w = g.w, n = w.nodes[w.nearestNode(P.x, P.z)];
  P.x = n[0] + 3; P.z = n[1] + 2; P.face = 0.55; P.hidden = true; // (the camera follows the hidden player)
  const looks = [
    { hs: 'bob' },
    { turban: [0.97, 0.6, 0.1], beard: true, hs: 'short', kurta: true, skin: [0.72, 0.5, 0.35], hair: [0.1, 0.08, 0.07], shirt: [0.88, 0.95, 1], pants: [0.88, 0.95, 1] },
    { hs: 'bald', hair: [0.84, 0.83, 0.81], skin: [0.96, 0.84, 0.76], shirt: [0.09, 0.64, 0.29] },
    { hs: 'curls', skin: [0.48, 0.29, 0.18], hair: [0.07, 0.05, 0.04], shirt: [0.98, 0.45, 0.09] },
    { hs: 'long', braid: true, dupatta: [0.86, 0.15, 0.47], kurta: true, skin: [0.66, 0.42, 0.24], hair: [0.08, 0.06, 0.06] },
    { hs: 'short', cap: [0.09, 0.15, 0.33], shirt: [0.12, 0.23, 0.54], pants: [0.09, 0.15, 0.33], kind: 'cop' },
  ];
  g.cars.length = 0;
  const others = g.chars.filter((c) => c !== P).slice(0, looks.length);
  for (const c of g.chars) if (c !== P && !others.includes(c)) c.x += 1000;
  const place = () => others.forEach((c, i) => {
    Object.assign(c, { cap: null, turban: null, beard: false, kurta: false, braid: false, dupatta: null, kind: 'ped' }, looks[i]);
    const s = i - 2.5; // a row across the screen (camera right = (cos az, -sin az))
    c.x = P.x + Math.cos(0.55) * s * 1.9; c.z = P.z - Math.sin(0.55) * s * 1.9;
    c.state = 'idle'; c.speed = 0; c.face = 0.55; c.timer = 999; c.path = null; c.mouth = i === 3;
  });
  place(); clearInterval(window.__pin); window.__pin = setInterval(place, 50);
}, [dist, elev]);
await pose(17, 0.5);
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + 'closeup.png' });
await pose(70, 0.86); // the default camera
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + 'ingame.png' });
await browser.close();
console.log('wrote', OUT);
