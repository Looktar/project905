// Pranks + collectibles (v0.4, D-70). In the spirit of a "to-do list of mischief": a fixed list of
// Markham pranks, each tied to a real place or a game system, ticked off once (saved per viewer);
// plus 30 golden dim sum hidden on sidewalks next to real landmarks, plazas and parks.
// Game code reports what happens through game.ev(type, data); see on().
import { M } from './math.js';
import { CFG } from './config.js';
import * as sfx from './audio.js';
import { input } from './input.js';
import { t, getLang } from './i18n.js';

const KEY = 'p905.pranks.v1';
const GOLD = [1, 0.78, 0.22];

export class Pranks {
  constructor(game) {
    this.g = game; this.save = load(); this.flash = 0;
    const lm = (id) => game.w.map.landmarks.find((l) => l.t === id);
    const near = (id, pad) => { const l = lm(id); return l ? (x, z) => Math.hypot(x - l.x, z - l.z) < (l.r || 10) + pad : () => false; };
    const tims = game.w.map.landmarks.filter((l) => l.t === 'tims');
    const nearTims = (x, z) => tims.some((l) => Math.hypot(x - l.x, z - l.z) < 18);
    const inPacific = near('pacific', 30), inUnion = near('unionville', 110), atCivic = near('civic', 25), atMarkville = near('markville', 50);
    // [id, zh, en, (type, data) => done?]
    this.list = [
      ['tims', '在 Tim Hortz 门口打人', 'Punch someone outside a Tim Hortz', (e, d) => e === 'hit' && nearTims(d.target.x, d.target.z)],
      ['pacific', '在大古广场门口放火', 'Start a fire at Pacifick Mall', (e, d) => e === 'ignite' && inPacific(d.x, d.z)],
      ['taxi', '把出租车司机拽下车', 'Pull a taxi driver out of the cab', (e, d) => e === 'carjack' && d.type === 'taxi'],
      ['police', '开走一辆警车', 'Drive off in a police car', (e, d) => e === 'enter' && d.type === 'police'],
      ['firetruck', '开走一辆消防车', 'Drive off in a fire truck', (e, d) => e === 'enter' && d.type === 'fire'],
      ['bowling', '开车撞倒 5 个路人', 'Knock down 5 people with a car', (e) => e === 'runover' && this.count('runover') >= 5, 'runover', 5],
      ['unionville', '在 Unionville 老街把人打趴下', 'Knock someone out on Old Unionville main street', (e, d) => e === 'hit' && d.ko && inUnion(d.target.x, d.target.z)],
      ['boom', '让一辆车爆炸', 'Blow up a car', (e) => e === 'boom'],
      ['escape', '甩掉警察', 'Lose the cops', (e) => e === 'escaped'],
      ['civic', '在市政厅门口狂按喇叭', 'Honk outside the Civic Centre', (e, d) => e === 'horn' && atCivic(d.x, d.z)],
      ['drift', '在 Markvile Mall 停车场漂移', 'Drift in the Markvile Mall parking lot', (e, d) => e === 'drift' && atMarkville(d.x, d.z)],
      ['firemen', '让消防员来救你点的火', 'Make the firefighters put out your fire', (e, d) => e === 'crew' && d.byPlayer],
      ['master', '惹到武林高手被揍晕', 'Get knocked out by a kung fu master', (e, d) => e === 'ko' && d.by && d.by.temper === 'master'],
    ];
    this.buns = placeBuns(game);
  }
  label(p) { return p[getLang() === 'zh' ? 1 : 2]; }
  count(k) { return this.save.count[k] || 0; }

  // ------------------------------------------------------------------ events
  on(type, d = {}) {
    if (type === 'runover') { this.save.count.runover = this.count('runover') + 1; store(this.save); }
    for (const p of this.list) {
      if (this.save.done.includes(p[0])) continue;
      let ok = false;
      try { ok = p[3](type, d); } catch (e) { ok = false; }
      if (!ok) continue;
      this.save.done.push(p[0]); store(this.save);
      const n = this.save.done.length, all = n === this.list.length;
      this.g.missions.reward(CFG.pranks.reward + (all ? CFG.pranks.allBonus : 0), `${t('pDone')} ${this.label(p)} (${n}/${this.list.length})`);
      this.flash = 2;
    }
  }
  update(dt) {
    const g = this.g, P = g.playerPos(), car = g.inCar;
    this.flash = Math.max(0, this.flash - dt);
    // drifting: handbrake at speed (checked here: there is no single event for it)
    if (car && input.handbrake && Math.abs(car.speed) > 9) this.on('drift', { x: car.x, z: car.z });
    // golden dim sum: walk or drive through it
    for (const b of this.buns) {
      if (b.got || Math.abs(b.x - P.x) > 3 || Math.abs(b.z - P.z) > 3 || Math.hypot(b.x - P.x, b.z - P.z) > (car ? 3.2 : 1.8)) continue;
      b.got = true; this.save.buns.push(b.key); store(this.save);
      const n = this.save.buns.length, all = n === this.buns.length;
      sfx.ding();
      g.hud.bubble(t('pBunPop'), [b.x, 2.6, b.z], 'pow');
      g.missions.reward(CFG.pranks.bun + (all ? CFG.pranks.allBonus : 0), `${t('pBun')} ${n}/${this.buns.length}`);
    }
  }
  draw() {
    const g = this.g, B = g.B, P = g.playerPos(), tm = g.time;
    for (const b of this.buns) {
      if (b.got || Math.abs(b.x - P.x) > 110 || Math.abs(b.z - P.z) > 110) continue;
      const y = 1.6 + Math.sin(tm * 2.4 + b.x) * 0.25, base = M.chain(M.T(b.x, y, b.z), M.RY(tm * 1.8 + b.z));
      g.put(B.bun, M.mul(base, M.S(1.6, 1.15, 1.6)), GOLD);        // the bun (big enough to spot from the default camera)
      g.put(B.bun, M.mul(base, M.chain(M.T(0, 0.68, 0), M.S(0.45))), GOLD); // the twist on top
    }
  }

  // ------------------------------------------------------------------ the list (📋 panel)
  render(el) {
    const S = this.save, mi = this.g.missions, esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const rows = this.list.map((p) => {
      const done = S.done.includes(p[0]), prog = p[4] && !done ? ` <small>(${Math.min(this.count(p[4]), p[5])}/${p[5]})</small>` : '';
      return `<li class="${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${esc(this.label(p))}${prog}</li>`;
    }).join('');
    const lmDone = mi.save.visited.length, lmAll = mi.landmarks.length;
    const best = mi.races.map((r, i) => `${i + 1}. ${esc(mi.label(r.to.nm))}: ${mi.save.best[r.id] ? fmt(mi.save.best[r.id]) : '—'}`).join('<br>');
    el.innerHTML = `<h3>${t('pTitle')} ${S.done.length}/${this.list.length}</h3><ul class="plist">${rows}</ul>
      <h3>🥟 ${t('pBun')} ${S.buns.length}/${this.buns.length}</h3><p class="phint">${t('pBunHint')}</p>
      <h3>📍 ${t('pLandmarks')} ${lmDone}/${lmAll}</h3>
      <h3>🏁 ${t('pRaces')}</h3><p>${best}</p>
      <h3>💰 $ ${mi.save.money}</h3>`;
  }
}

// 30 spots, the same for everyone: next to landmarks, named places and big parks, spread out
// (>= CFG.pranks.bunGap m apart), each on the nearest sidewalk so it can always be reached
function placeBuns(game) {
  const W = game.w, m = W.map, cand = [];
  const cen = (P) => { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; };
  for (const l of m.landmarks) if (l.t !== 'viva') cand.push(l.p ? cen(l.p) : [l.x, l.z]);
  for (const b of m.buildings) if (b.n) cand.push(cen(b.p));
  for (const p of m.parks) { const P = p.p; if (P.length > 4 && area(P) > 4000) cand.push(cen(P)); }
  // a fixed shuffle (hash of the position) so the set never depends on load order
  cand.sort((a, b) => hash(a) - hash(b));
  const out = [], gap = CFG.pranks.bunGap, saved = load().buns;
  for (const [x, z] of cand) {
    if (out.length >= CFG.pranks.buns) break;
    const ne = W.nearestEdge(x, z, 60);
    if (!ne) continue;
    const s = ne.e.cum[ne.k] + ne.t * (ne.e.cum[ne.k + 1] - ne.e.cum[ne.k]);
    const q = W.edgePoint(ne.e, s, 1, ne.e.w / 2 + 1.8), r = W.edgePoint(ne.e, s, 1, -(ne.e.w / 2 + 1.8));
    const p = Math.hypot(q.x - x, q.z - z) < Math.hypot(r.x - x, r.z - z) ? q : r;
    if (W.inWater(p.x, p.z) || W.collide(p.x, p.z, 0.6).hit) continue;
    if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < gap)) continue;
    const key = Math.round(p.x) + ',' + Math.round(p.z);
    out.push({ x: p.x, z: p.z, key, got: saved.includes(key) });
  }
  return out;
}
function hash([x, z]) { let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return (h ^ (h >>> 15)) >>> 0; }
function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return Math.abs(a / 2); }
function load() {
  const d = { done: [], count: {}, buns: [] };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.done)) return { ...d, ...s }; } catch (e) { /* private mode */ }
  return d;
}
function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not saved */ } }
function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
