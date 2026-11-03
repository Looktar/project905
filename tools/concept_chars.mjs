// Character style concept sheets (2D SVG, for the owner to pick a direction; not used by the game).
//   node tools/concept_chars.mjs   ->  docs/concept/characters/*.png (+ sheet.html)
// The same five townspeople drawn in four styles. Playwright (dev dependency) renders the PNGs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = new URL('../docs/concept/characters/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// the cast: mixed like Markham (ART-BIBLE 5); personalities are not tied to looks
const CAST = [
  { name: '华裔女生 · 波波头', skin: '#f3d2b3', hair: '#2b1d16', style: 'bob', top: '#f472b6', pants: '#334155', extra: 'backpack', shoes: '#f8fafc' },
  { name: '南亚大叔 · 头巾 kurta', skin: '#b9825a', hair: '#1f1712', style: 'dastar', turban: '#f59e0b', top: '#e0f2fe', pants: '#e0f2fe', extra: 'kurta', shoes: '#78350f' },
  { name: '白人爷爷 · 眼镜毛衣', skin: '#f6d5c3', hair: '#d6d3d1', style: 'bald', top: '#16a34a', pants: '#a8a29e', extra: 'glasses', shoes: '#57534e' },
  { name: '黑人少年 · 卷发卫衣', skin: '#7b4a2d', hair: '#120c09', style: 'curls', top: '#f97316', pants: '#1e3a8a', extra: 'hoodie', shoes: '#ef4444' },
  { name: '警察', skin: '#e9b993', hair: '#3b2a20', style: 'short', top: '#1e3a8a', pants: '#172554', extra: 'cop', shoes: '#0f172a' },
];

const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
let uid = 0;

// ---------------------------------------------------------------- styles
// Each style gives proportions; the parts below are drawn from them.
const STYLES = [
  { key: 'A', title: 'A · 圆润玩具风', sub: '像软胶玩具：圆头、豆子身体、短手短脚、眼睛有高光、腮红。和现在最接近，改动最小', head: 'circle', r: 60, hy: 215, body: { w: 92, h: 86, top: 152, rx: 40 }, leg: { w: 28, h: 60, gap: 20 }, arm: { w: 22, h: 70 }, eyes: 'dot', blush: true, mouth: 'smile', shine: true },
  { key: 'B', title: 'B · 方块积木风', sub: '圆角方块拼起来，像积木小人；脸很简单，轮廓最清楚，远看也认得出', head: 'square', r: 56, hy: 214, body: { w: 98, h: 88, top: 152, rx: 12 }, leg: { w: 34, h: 60, gap: 22 }, arm: { w: 24, h: 74 }, eyes: 'square', blush: false, mouth: 'line', shine: false },
  { key: 'C', title: 'C · 大头手办风', sub: '头更大（头身比约 1:1），大眼睛、刘海、衣服有领子和扣子；最可爱，细节最多', head: 'circle', r: 80, hy: 236, body: { w: 76, h: 72, top: 150, rx: 26 }, leg: { w: 22, h: 52, gap: 15 }, arm: { w: 18, h: 58 }, eyes: 'big', blush: true, mouth: 'tiny', shine: true },
  { key: 'D', title: 'D · 修长低多边形风（要骨骼动画）', sub: '正常一点的比例（约 1:3.5），多面体明暗；最“像人”，要做骨骼动画，工作量大', head: 'circle', r: 34, hy: 300, body: { w: 70, h: 122, top: 264, rx: 10 }, leg: { w: 26, h: 132, gap: 15 }, arm: { w: 18, h: 120 }, eyes: 'small', blush: false, mouth: null, shine: false, facet: true },
];

function person(S, c, x, g) {
  const id = 'p' + uid++, out = [];
  const B = S.body, L = S.leg, A = S.arm, r = S.r, hx = x, hy = g - S.hy;
  const bodyTop = g - B.top, bodyBot = bodyTop + B.h;
  const facet = (fill, d) => S.facet ? `<path d="${d}" fill="${fill}"/>` : '';
  // shadow
  out.push(`<ellipse cx="${x}" cy="${g + 4}" rx="${B.w * 0.75}" ry="9" fill="rgba(30,40,70,.18)"/>`);
  // backpack behind
  if (c.extra === 'backpack') out.push(`<rect x="${x - B.w * 0.42}" y="${bodyTop + 6}" width="${B.w * 0.84}" height="${B.h * 0.8}" rx="${B.w * 0.2}" fill="#facc15" stroke="${shade('#facc15', 0.7)}" stroke-width="3"/>`);
  // legs + shoes
  for (const s of [-1, 1]) {
    const lx = x + s * L.gap - L.w / 2, ly = bodyBot - 10;
    out.push(`<rect x="${lx}" y="${ly}" width="${L.w}" height="${g - ly - 6}" rx="${S.key === 'B' ? 6 : L.w / 2}" fill="${c.pants}"/>`);
    out.push(facet(shade(c.pants, 0.8), `M${lx + L.w / 2} ${ly}h${L.w / 2}v${g - ly - 6}h-${L.w / 2}z`));
    out.push(S.key === 'B' ? `<rect x="${lx - 3}" y="${g - 14}" width="${L.w + 10}" height="14" rx="4" fill="${c.shoes}"/>` : `<ellipse cx="${lx + L.w / 2 + 4}" cy="${g - 5}" rx="${L.w * 0.72}" ry="${S.key === 'D' ? 7 : 10}" fill="${c.shoes}"/>`);
  }
  // body (kurta: long tunic; hoodie: hood behind the neck)
  if (c.extra === 'hoodie') out.push(`<ellipse cx="${x}" cy="${bodyTop + 4}" rx="${B.w * 0.42}" ry="${B.w * 0.2}" fill="${shade(c.top, 0.8)}"/>`);
  const bh = c.extra === 'kurta' ? B.h + L.h * 0.45 : B.h;
  out.push(`<rect x="${x - B.w / 2}" y="${bodyTop}" width="${B.w}" height="${bh}" rx="${Math.min(B.rx, bh / 2)}" fill="${c.top}"/>`);
  if (S.facet) out.push(`<path d="M${x} ${bodyTop}h${B.w / 2 - 4}l4 10v${bh - 10}h-${B.w / 2}z" fill="${shade(c.top, 0.82)}"/>`);
  else out.push(`<clipPath id="${id}b"><rect x="${x - B.w / 2}" y="${bodyTop}" width="${B.w}" height="${bh}" rx="${Math.min(B.rx, bh / 2)}"/></clipPath><rect clip-path="url(#${id}b)" x="${x + B.w * 0.22}" y="${bodyTop}" width="${B.w}" height="${bh}" fill="rgba(0,0,0,.12)"/>`);
  // clothes details
  if (c.extra === 'kurta') out.push(`<path d="M${x} ${bodyTop + 4}v${B.h * 0.5}" stroke="${shade(c.top, 0.7)}" stroke-width="3"/>` + [0.18, 0.3, 0.42].map((k) => `<circle cx="${x}" cy="${bodyTop + B.h * k}" r="2.6" fill="#a16207"/>`).join(''));
  if (c.extra === 'hoodie') out.push(`<rect x="${x - B.w * 0.26}" y="${bodyTop + B.h * 0.55}" width="${B.w * 0.52}" height="${B.h * 0.24}" rx="8" fill="${shade(c.top, 0.85)}"/><path d="M${x - 8} ${bodyTop + 4}v${B.h * 0.3}M${x + 8} ${bodyTop + 4}v${B.h * 0.3}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`);
  if (c.extra === 'glasses') for (let i = 0; i < 3; i++) out.push(`<rect x="${x - B.w / 2}" y="${bodyTop + B.h * (0.35 + i * 0.2)}" width="${B.w}" height="${B.h * 0.07}" fill="${shade(c.top, 1.35)}" clip-path="url(#${id}b)"/>`);
  if (c.extra === 'cop') out.push(`<rect x="${x - B.w / 2}" y="${bodyTop + B.h * 0.74}" width="${B.w}" height="${B.h * 0.12}" fill="#0f172a"/><rect x="${x - 6}" y="${bodyTop + B.h * 0.74}" width="12" height="${B.h * 0.12}" fill="#fbbf24"/><path d="M${x - B.w * 0.3} ${bodyTop + B.h * 0.24}l7 -6 7 6 -7 9z" fill="#fbbf24"/>`);
  if (c.extra === 'backpack') out.push(`<path d="M${x - B.w * 0.3} ${bodyTop + 2}v${B.h * 0.7}M${x + B.w * 0.3} ${bodyTop + 2}v${B.h * 0.7}" stroke="#ca8a04" stroke-width="6" stroke-linecap="round"/>`);
  if (S.key === 'C') out.push(`<path d="M${x - 16} ${bodyTop}l16 16 16 -16" fill="#fff" stroke="${shade(c.top, 0.7)}" stroke-width="2"/>`);
  // arms + hands
  for (const s of [-1, 1]) {
    const ax = x + s * (B.w / 2 + A.w * 0.25), ay = bodyTop + 8, rot = s * (S.key === 'D' ? 5 : 12);
    out.push(`<g transform="rotate(${rot} ${ax} ${ay})"><rect x="${ax - A.w / 2}" y="${ay}" width="${A.w}" height="${A.h}" rx="${S.key === 'B' ? 8 : A.w / 2}" fill="${c.top}"/>${S.facet ? `<rect x="${ax}" y="${ay}" width="${A.w / 2}" height="${A.h}" fill="${shade(c.top, 0.82)}"/>` : ''}<circle cx="${ax}" cy="${ay + A.h + A.w * 0.2}" r="${A.w * 0.62}" fill="${c.skin}"/></g>`);
  }
  // neck for the tall style
  if (S.key === 'D') out.push(`<rect x="${x - 9}" y="${hy + r - 6}" width="18" height="${bodyTop - hy - r + 10}" fill="${shade(c.skin, 0.9)}"/>`);
  // head
  const headShape = S.head === 'square' ? `<rect x="${hx - r}" y="${hy - r * 0.92}" width="${r * 2}" height="${r * 1.84}" rx="${r * 0.36}"/>` : `<circle cx="${hx}" cy="${hy}" r="${r}"/>`;
  const hair = (d) => `<path d="${d}" fill="${c.hair}"/>`;
  // hair behind the head
  if (c.style === 'bob') out.push(hair(`M${hx - r * 1.08} ${hy + r * 0.55}V${hy - r * 0.2}A${r * 1.08} ${r * 1.08} 0 0 1 ${hx + r * 1.08} ${hy - r * 0.2}V${hy + r * 0.55}Z`));
  if (c.style === 'curls') for (let i = 0; i < 11; i++) { const a = Math.PI * (0.95 + i * 0.11); out.push(`<circle cx="${hx + Math.cos(a) * r * 0.98}" cy="${hy + Math.sin(a) * r * 0.98}" r="${r * 0.3}" fill="${c.hair}"/>`); }
  out.push(`<clipPath id="${id}h">${headShape}</clipPath>`);
  out.push(headShape.replace('/>', ` fill="${c.skin}"/>`));
  if (S.facet) out.push(`<path clip-path="url(#${id}h)" d="M${hx} ${hy - r}L${hx + r} ${hy - r * 0.2}V${hy + r}H${hx}z" fill="rgba(0,0,0,.1)"/>`);
  else out.push(`<circle clip-path="url(#${id}h)" cx="${hx + r * 0.9}" cy="${hy + r * 0.2}" r="${r * 0.75}" fill="rgba(0,0,0,.07)"/>`);
  // hair in front, clipped to the head
  const front = [];
  if (c.style === 'bob') front.push(hair(`M${hx - r * 1.1} ${hy - r * 1.1}H${hx + r * 1.1}V${hy - r * 0.18}Q${hx + r * 0.55} ${hy - r * 0.42} ${hx + r * 0.2} ${hy - r * 0.2}Q${hx - r * 0.25} ${hy - r * 0.5} ${hx - r * 0.75} ${hy - r * 0.15}L${hx - r * 1.1} ${hy - r * 0.1}Z`));
  if (c.style === 'curls') front.push(hair(`M${hx - r * 1.1} ${hy - r * 1.1}H${hx + r * 1.1}V${hy - r * 0.42}` + Array.from({ length: 6 }, (_, i) => `Q${hx + r * (0.92 - i * 0.37)} ${hy - r * 0.18} ${hx + r * (0.73 - i * 0.37)} ${hy - r * 0.42}`).join('') + 'Z'));
  if (c.style === 'short' || c.style === 'dastar') front.push(hair(`M${hx - r * 1.1} ${hy - r * 1.1}H${hx + r * 1.1}V${hy - r * 0.38}Q${hx} ${hy - r * 0.62} ${hx - r * 1.1} ${hy - r * 0.32}Z`));
  if (c.style === 'dastar') front.push(hair(`M${hx - r * 1.1} ${hy - r * 0.1}H${hx - r * 0.7}V${hy + r * 0.28}Q${hx} ${hy + r * 0.72} ${hx + r * 0.7} ${hy + r * 0.28}V${hy - r * 0.1}H${hx + r * 1.1}V${hy + r * 1.2}H${hx - r * 1.1}Z`) + `<path d="M${hx - r * 0.35} ${hy + r * 0.48}Q${hx} ${hy + r * 0.3} ${hx + r * 0.35} ${hy + r * 0.48}Q${hx} ${hy + r * 0.62} ${hx - r * 0.35} ${hy + r * 0.48}Z" fill="${c.skin}"/>`);
  if (c.style === 'bald') front.push(hair(`M${hx - r * 1.1} ${hy - r * 0.35}Q${hx - r * 0.7} ${hy - r * 0.1} ${hx - r * 0.82} ${hy + r * 0.25}L${hx - r * 1.1} ${hy + r * 0.3}Z M${hx + r * 1.1} ${hy - r * 0.35}Q${hx + r * 0.7} ${hy - r * 0.1} ${hx + r * 0.82} ${hy + r * 0.25}L${hx + r * 1.1} ${hy + r * 0.3}Z`));
  out.push(`<g clip-path="url(#${id}h)">${front.join('')}</g>`);
  if (S.shine) out.push(`<ellipse cx="${hx - r * 0.42}" cy="${hy - r * 0.55}" rx="${r * 0.2}" ry="${r * 0.1}" transform="rotate(-30 ${hx - r * 0.42} ${hy - r * 0.55})" fill="rgba(255,255,255,.35)"/>`);
  // face
  const ey = hy + r * 0.1, ex = r * 0.36;
  for (const s of [-1, 1]) {
    const cx = hx + s * ex;
    if (S.eyes === 'dot') out.push(`<ellipse cx="${cx}" cy="${ey}" rx="${r * 0.11}" ry="${r * 0.15}" fill="#1e1b2e"/><circle cx="${cx + r * 0.04}" cy="${ey - r * 0.06}" r="${r * 0.045}" fill="#fff"/>`);
    if (S.eyes === 'square') out.push(`<rect x="${cx - r * 0.09}" y="${ey - r * 0.12}" width="${r * 0.18}" height="${r * 0.24}" rx="3" fill="#1e1b2e"/>`);
    if (S.eyes === 'big') out.push(`<ellipse cx="${cx}" cy="${ey}" rx="${r * 0.19}" ry="${r * 0.23}" fill="#fff"/><ellipse cx="${cx + s * r * 0.02}" cy="${ey + r * 0.03}" rx="${r * 0.14}" ry="${r * 0.18}" fill="#5b3a29"/><ellipse cx="${cx + s * r * 0.02}" cy="${ey + r * 0.05}" rx="${r * 0.08}" ry="${r * 0.11}" fill="#1e1b2e"/><circle cx="${cx + r * 0.06}" cy="${ey - r * 0.06}" r="${r * 0.05}" fill="#fff"/><circle cx="${cx - r * 0.05}" cy="${ey + r * 0.1}" r="${r * 0.025}" fill="#fff"/>`);
    if (S.eyes === 'small') out.push(`<circle cx="${cx}" cy="${ey}" r="${r * 0.09}" fill="#1e1b2e"/>`);
    if (S.blush) out.push(`<ellipse cx="${hx + s * r * 0.58}" cy="${ey + r * 0.28}" rx="${r * 0.14}" ry="${r * 0.08}" fill="rgba(244,114,182,.45)"/>`);
  }
  if (c.extra === 'glasses') out.push(`<g fill="none" stroke="#44403c" stroke-width="${Math.max(2, r * 0.05)}"><circle cx="${hx - ex}" cy="${ey}" r="${r * 0.22}"/><circle cx="${hx + ex}" cy="${ey}" r="${r * 0.22}"/><path d="M${hx - ex + r * 0.22} ${ey}H${hx + ex - r * 0.22}"/></g>`);
  if (S.mouth === 'smile') out.push(`<path d="M${hx - r * 0.14} ${ey + r * 0.32}Q${hx} ${ey + r * 0.45} ${hx + r * 0.14} ${ey + r * 0.32}" fill="none" stroke="#7f1d1d" stroke-width="${r * 0.06}" stroke-linecap="round"/>`);
  if (S.mouth === 'line') out.push(`<path d="M${hx - r * 0.16} ${ey + r * 0.38}H${hx + r * 0.16}" stroke="#1e1b2e" stroke-width="${r * 0.07}" stroke-linecap="round"/>`);
  if (S.mouth === 'tiny') out.push(`<path d="M${hx - r * 0.08} ${ey + r * 0.36}Q${hx} ${ey + r * 0.44} ${hx + r * 0.08} ${ey + r * 0.36}" fill="none" stroke="#7f1d1d" stroke-width="${r * 0.045}" stroke-linecap="round"/>`);
  // headwear on top
  if (c.style === 'dastar') {
    const T = c.turban;
    out.push(`<path d="M${hx - r * 1.04} ${hy - r * 0.25}Q${hx - r * 1.1} ${hy - r * 1.45} ${hx} ${hy - r * 1.42}Q${hx + r * 1.1} ${hy - r * 1.45} ${hx + r * 1.04} ${hy - r * 0.25}Q${hx} ${hy - r * 0.55} ${hx - r * 1.04} ${hy - r * 0.25}Z" fill="${T}"/>`);
    out.push(`<path d="M${hx - r * 0.9} ${hy - r * 0.5}Q${hx} ${hy - r * 1.25} ${hx + r * 0.75} ${hy - r * 1.2}M${hx - r * 0.95} ${hy - r * 0.8}Q${hx - r * 0.1} ${hy - r * 1.4} ${hx + r * 0.5} ${hy - r * 1.38}" fill="none" stroke="${shade(T, 0.75)}" stroke-width="${r * 0.06}"/>`);
  }
  if (c.extra === 'cop') {
    out.push(`<path d="M${hx - r * 0.95} ${hy - r * 0.55}L${hx - r * 1.05} ${hy - r * 1.15}Q${hx} ${hy - r * 1.4} ${hx + r * 1.05} ${hy - r * 1.15}L${hx + r * 0.95} ${hy - r * 0.55}Z" fill="#172554"/>`);
    out.push(`<path d="M${hx - r * 1.0} ${hy - r * 0.55}Q${hx} ${hy - r * 0.28} ${hx + r * 1.0} ${hy - r * 0.55}L${hx + r * 0.95} ${hy - r * 0.42}Q${hx} ${hy - r * 0.15} ${hx - r * 0.95} ${hy - r * 0.42}Z" fill="#0f172a"/>`);
    out.push(`<circle cx="${hx}" cy="${hy - r * 0.85}" r="${r * 0.13}" fill="#fbbf24"/>`);
  }
  return out.join('');
}

function sheet(S, W = 1200, H = 720) {
  const g = 610;
  const people = CAST.map((c, i) => person(S, c, 140 + i * 230, g)).join('');
  const labels = CAST.map((c, i) => `<text x="${140 + i * 230}" y="${g + 46}" text-anchor="middle" font-size="19" font-weight="700" fill="#475569">${c.name}</text>`).join('');
  // the same cast at in-game size (about 1/4), to judge readability from the default camera
  const tiny = CAST.map((c, i) => `<g transform="translate(${880 + i * 58} ${150}) scale(0.24)">${person(S, c, 0, 0)}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif">
  <rect width="${W}" height="${H}" fill="#f8f4ec"/>
  <rect y="${g}" width="${W}" height="${H - g}" fill="#e7e1d6"/>
  <text x="40" y="62" font-size="38" font-weight="900" fill="#2d3a55">${S.title}</text>
  <foreignObject x="40" y="78" width="760" height="80"><div xmlns="http://www.w3.org/1999/xhtml" style="font:500 19px 'PingFang SC','Microsoft YaHei',sans-serif;color:#475569;line-height:1.45">${S.sub}</div></foreignObject>
  <rect x="850" y="24" width="320" height="150" rx="16" fill="#9aa5b8"/><text x="1010" y="50" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">游戏里实际大小（默认镜头）</text>${tiny}
  ${people}${labels}
</svg>`;
}

const svgs = STYLES.map((S) => [S.key, sheet(S)]);
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ddd">${svgs.map(([k, s]) => `<div id="s${k}" style="width:1200px">${s}</div>`).join('')}</body>`;
writeFileSync(new URL('sheet.html', OUT), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
await page.setContent(html);
for (const [k] of svgs) await page.locator('#s' + k).screenshot({ path: new URL(`style-${k}.png`, OUT).pathname.replace(/^\/([A-Z]:)/, '$1') });
await browser.close();
console.log('wrote', svgs.map(([k]) => `style-${k}.png`).join(', '));
