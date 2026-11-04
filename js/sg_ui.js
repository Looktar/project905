// 万锦三国志 (D-73): the strategy screen. The real Markham minimap is the board; 12 cities sit on
// it, linked by the real roads (supply lines). Tap a city, give it an order, end the month; duels
// with your generals are played by you (猛攻 / 防守 / 必杀), new generals are revealed like blind boxes.
// Rules live in sg_engine.js; this file is DOM + canvas only. The game state is saved in localStorage.
import { CFG } from './config.js';
import { t, getLang, extend } from './i18n.js';
import { toGamePoint } from './input.js';
import * as E from './sg_engine.js';
import { GENERALS, TRAITS, CITIES, CITY_IDS, ADJ, LINKS, BONDS, NEUTRAL_COLOR } from './sg_data.js';

extend({
  sgStart: '⚔ 万锦三国志', sgTitle: '万锦三国志', sgEnd: '结束本月', sgDate: '建安{y}年 {m}月', sgGold: '金', sgFood: '粮', sgTroops: '兵', sgCities: '城',
  sgLog: '战报', sgMenu: '菜单', sgBack: '回到万锦街头', sgNew: '重新开局', sgNewQ: '重新开局会换一批盲盒，当前进度会丢失。确定吗？', sgHelp: '玩法说明', sgContinue: '继续',
  sgYou: '你', sgUnclaimed: '空城', sgArmy: '{n}军',
  sgCmdDev: '内政', sgCmdDevS: '开发 +金粮', sgCmdDraft: '征兵', sgCmdDraftS: '花金换兵', sgCmdSearch: '搜索', sgCmdSearchS: '找在野武将', sgCmdMove: '调动', sgCmdMoveS: '兵将去邻城',
  sgCmdMarch: '出征', sgCmdMarchS: '攻打邻城', sgCmdRest: '待命', sgOrder: '本月命令', sgPickTarget: '点地图上发光的城池选目标', sgCancel: '取消',
  sgTroopsSend: '出兵', sgGensSend: '带哪些武将', sgNoGen: '没有武将：这里只能内政、征兵、调动', sgCut: '断粮！连不回本城：没有收入，每月掉兵',
  sgCap: '本城', sgDev: '开发', sgDef: '城防', sgGarrison: '驻守武将', sgNone: '没有', sgRumour: '在野传闻', sgRumourN: '{n} 位', sgRoad: '粮道',
  sgOwner: '势力', sgYourSide: '你的势力', sgPickCity: '点城池查看、下命令。和本城连成一片的城才有粮道，才能出征。',
  sgBonds: '羁绊', sgBondOn: '已激活', sgAllGens: '全部武将',
  sgReport: '本月急报', sgQuiet: '这个月很太平。', sgBlind: '开盲盒！', sgBlindStart: '开局盲盒', sgJoined: '{g} 加入了你的势力！', sgRecruited: '{g} 被你俘虏后归降了！',
  sgDuel: '单挑！', sgDuelVs: '{a} 对 {d}', sgAtk: '猛攻', sgDefM: '防守', sgSkill: '必杀', sgDuelRule: '猛攻克必杀 · 必杀破防守 · 防守挡猛攻',
  sgDuelWin: '{g} 赢了单挑！', sgDuelDraw: '不分胜负！', sgRound: '第 {n} 回合', sgMoves: '你：{a} · 对方：{d}', sgHit: '{g} 受到 {n} 伤害', sgRival: '宿敌相见：{r}',
  sgWin: '统一万锦！', sgWinS: '用了 {n} 个月，万锦尽归你手。', sgLose: '势力覆灭…', sgLoseS: '你在万锦撑了 {n} 个月。再来一局，换一批盲盒！', sgAgain: '再来一局',
  sgRivals: '对手', sgIntro: '{a}、{b}、{c} 也在争夺万锦。开局各占一城，8 座空城等人去拿。', sgOrders: '本月已下命令：{n} 城',
  evDev: '{c}：内政，开发 +{n}', evDraft: '{c}：征兵 +{n}', evFound: '{c}：{by} 找到了在野武将 {g}！', evFoundAI: '{f} 在 {c} 找到了 {g}',
  evTreasure: '{c}：没找到人，捡到 {n} 金', evNothing: '{c}：搜了一圈，什么也没找到', evMove: '{c} → {to}：调动 {n} 兵',
  evMarch: '{f} 从 {c} 出兵 {n} 攻打 {to}', evDuel: '单挑 {a} 对 {d}：{w}', evDuelDraw: '平手', evDuelWon: '{g} 胜',
  evTake: '{f} 攻下了 {c}！', evRepel: '{c} 挡住了 {f} 的进攻', evFlee: '{g} 逃到了 {c}', evRecruit: '{f} 俘虏并登用了 {g}', evRelease: '{g} 被俘后不肯投降，被放走了',
  evNewLord: '{g} 继任为君主', evFall: '{f} 灭亡了！', evCapital: '{f} 把本城迁到 {c}', evCut: '{c} 断粮了！兵力减少', evHunger: '{f} 粮草不足，士兵逃散',
  evCoalition: '群雄结成反{f}联盟！', evCoalitionYou: '你占了万锦一半，其他君主联合起来对付你了！', evCoalitionEnd: '反{f}联盟解散了',
  sgHelpText: '一回合是一个月。每座你的城每月下一个命令：内政（开发，增加每月金粮）、征兵（花金加兵）、搜索（找藏在这座城的在野武将，开盲盒）、调动（兵和武将去相邻的自己城）、出征（打相邻的城）。\n\n城和城之间的线是真实道路，也是粮道：只有和本城连成一片的城才有收入、能出征；被切断的城每月掉兵。\n\n两边都有武将时可能单挑：猛攻克必杀、必杀破防守、防守挡猛攻，武力越高伤害越大。赢了单挑对方士气大跌，还可能俘虏对方武将。\n\n同时拥有特定武将会激活羁绊（比如桃园结义），宿敌相见更容易单挑。谁占到 6 座城，其他君主就会结盟对付他。占满 12 座城即统一万锦。',
}, {
  sgStart: '⚔ Three Kingdoms of Markham', sgTitle: 'Three Kingdoms of Markham', sgEnd: 'End month', sgDate: 'Year {Y}, month {m}', sgGold: 'Gold', sgFood: 'Food', sgTroops: 'Troops', sgCities: 'Cities',
  sgLog: 'Log', sgMenu: 'Menu', sgBack: 'Back to the streets', sgNew: 'New game', sgNewQ: 'A new game deals new blind boxes and your progress is lost. Sure?', sgHelp: 'How to play', sgContinue: 'Continue',
  sgYou: 'You', sgUnclaimed: 'Unclaimed', sgArmy: "{n}'s army",
  sgCmdDev: 'Develop', sgCmdDevS: '+gold & food', sgCmdDraft: 'Draft', sgCmdDraftS: 'gold → troops', sgCmdSearch: 'Search', sgCmdSearchS: 'find free officers', sgCmdMove: 'Move', sgCmdMoveS: 'to a city of yours',
  sgCmdMarch: 'Attack', sgCmdMarchS: 'a neighbour', sgCmdRest: 'Idle', sgOrder: 'Order this month', sgPickTarget: 'Tap a glowing city on the map', sgCancel: 'Cancel',
  sgTroopsSend: 'Troops', sgGensSend: 'Officers going', sgNoGen: 'No officers here: develop, draft or move only', sgCut: 'Cut off from your capital: no income, troops desert',
  sgCap: 'Capital', sgDev: 'Dev', sgDef: 'Walls', sgGarrison: 'Officers', sgNone: 'none', sgRumour: 'Rumoured free officers', sgRumourN: '{n}', sgRoad: 'Supply road',
  sgOwner: 'Owner', sgYourSide: 'Your forces', sgPickCity: 'Tap a city to see it and give orders. Only cities linked to your capital are supplied and can attack.',
  sgBonds: 'Bonds', sgBondOn: 'active', sgAllGens: 'All officers',
  sgReport: 'This month', sgQuiet: 'A quiet month.', sgBlind: 'Blind box!', sgBlindStart: 'Starting blind boxes', sgJoined: '{g} joins you!', sgRecruited: '{g} was captured and joins you!',
  sgDuel: 'Duel!', sgDuelVs: '{a} vs {d}', sgAtk: 'Strike', sgDefM: 'Guard', sgSkill: 'Special', sgDuelRule: 'Strike beats Special · Special breaks Guard · Guard stops Strike',
  sgDuelWin: '{g} wins the duel!', sgDuelDraw: 'A draw!', sgRound: 'Round {n}', sgMoves: 'You: {a} · Them: {d}', sgHit: '{g} takes {n}', sgRival: 'Rivals meet: {r}',
  sgWin: 'Markham united!', sgWinS: 'All of Markham is yours after {n} months.', sgLose: 'Your forces are gone…', sgLoseS: 'You lasted {n} months. Try again with new blind boxes!', sgAgain: 'Play again',
  sgRivals: 'Rivals', sgIntro: '{a}, {b} and {c} want Markham too. Everyone starts with one city; 8 cities are up for grabs.', sgOrders: 'Orders given: {n} cities',
  evDev: '{c}: developed +{n}', evDraft: '{c}: drafted +{n}', evFound: '{c}: {by} found {g}!', evFoundAI: '{f} found {g} in {c}',
  evTreasure: '{c}: nobody found, but {n} gold', evNothing: '{c}: searched, found nothing', evMove: '{c} → {to}: moved {n} troops',
  evMarch: '{f} marches {n} from {c} on {to}', evDuel: 'Duel {a} vs {d}: {w}', evDuelDraw: 'draw', evDuelWon: '{g} wins',
  evTake: '{f} took {c}!', evRepel: '{c} held off {f}', evFlee: '{g} fled to {c}', evRecruit: '{f} captured and recruited {g}', evRelease: '{g} was captured, refused to serve and was let go',
  evNewLord: '{g} is the new lord', evFall: '{f} is no more!', evCapital: '{f} moved its capital to {c}', evCut: '{c} is cut off! Troops desert', evHunger: '{f} ran out of food; troops desert',
  evCoalition: 'The lords unite against {f}!', evCoalitionYou: 'You hold half of Markham: the other lords unite against you!', evCoalitionEnd: 'The alliance against {f} broke up',
  sgHelpText: 'One turn is one month. Each of your cities gets one order a month: Develop (more gold and food every month), Draft (gold for troops), Search (find officers hiding in that city: blind boxes), Move (troops and officers to a neighbouring city of yours), Attack (a neighbouring city).\n\nThe lines are real roads and your supply lines: only cities linked to your capital earn and can attack; cut-off cities lose troops every month.\n\nWhen both sides have officers a duel may happen: Strike beats Special, Special breaks Guard, Guard stops Strike; more war power hits harder. Winning breaks the enemy\'s morale and may capture their officer.\n\nCertain officers together switch on bonds (the Peach Garden Oath…); rivals duel more often. Whoever holds 6 cities gets the other lords allied against them. Hold all 12 to unite Markham.',
});

const SAVE = 'p905sg';
const $ = (id) => document.getElementById(id);
const zh = () => getLang() === 'zh';
const F = (k, p = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => (p[x] ?? ''));
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const gName = (id) => (zh() ? GENERALS[id].zh : GENERALS[id].en);
const cName = (id) => (zh() ? CITIES[id].zh : CITIES[id].en);
const KCOL = { shu: '#2f8f4e', wei: '#2f5fae', wu: '#c0392b', qun: '#6b4f8a' };
const kNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const MOVES = { atk: 'sgAtk', def: 'sgDefM', skill: 'sgSkill' };
const dateText = (s) => { const d = E.dateOf(s), y = d.year - 195; return F('sgDate', { y: y === 1 ? '元' : y, Y: d.year, m: d.month }); };
const CMD_ICON = { dev: '内', draft: '兵', search: '搜', move: '调', march: '征' };

function portrait(id, size = 46) {
  const g = GENERALS[id];
  return `<span class="sgP" style="width:${size}px;height:${size}px;background:${KCOL[g.k]};font-size:${Math.round(size * 0.56)}px">${esc(g.zh.slice(-1))}</span>`;
}
function statBars(id) {
  const g = GENERALS[id], row = (l, v, c) => `<div class="sgSt"><span>${l}</span><i><b style="width:${v}%;background:${c}"></b></i><em>${v}</em></div>`;
  return (zh() ? [['统', g.lead], ['武', g.war], ['智', g.int], ['政', g.pol]] : [['LED', g.lead], ['WAR', g.war], ['INT', g.int], ['POL', g.pol]])
    .map(([l, v], i) => row(l, v, ['#7fb2f0', '#f08a6e', '#b79cf0', '#7fd1a1'][i])).join('');
}
function traitTag(id) { const tr = TRAITS[GENERALS[id].trait]; return `<span class="sgTr">${esc(zh() ? tr[0] : tr[1])}</span><small>${esc(zh() ? tr[2] : tr[3])}</small>`; }
function genCard(id, opts = {}) {
  return `<div class="sgG${opts.on ? ' on' : ''}${opts.pick ? ' pick' : ''}" ${opts.data || ''}>${portrait(id)}<div class="sgGi"><b>${esc(gName(id))}</b>${statBars(id)}<div class="sgTrw">${traitTag(id)}</div></div></div>`;
}

export class Sanguo {
  constructor(onClose) {
    this.onClose = onClose; this.cv = $('sgMap'); this.ctx = this.cv.getContext('2d'); this.ptrs = new Map();
    this.sel = null; this.mode = null; this.busy = false; this.pulse = 0;
    $('sgEnd').addEventListener('click', () => this.endMonth());
    $('sgMenuBtn').addEventListener('click', () => this.menu());
    $('sgLogBtn').addEventListener('click', () => this.showLog());
    $('sgPanel').addEventListener('click', (e) => this.panelClick(e));
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = toGamePoint(e.clientX, e.clientY); this.ptrs.set(e.pointerId, { x, y, sx: x, sy: y }); this.moved = this.ptrs.size > 1; });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      const [x, y] = toGamePoint(e.clientX, e.clientY);
      if (this.ptrs.size === 1) { this.cx -= (x - p.x) / this.k; this.cz -= (y - p.y) / this.k; if (Math.hypot(x - p.sx, y - p.sy) > 8) this.moved = true; }
      else {
        const [a, b] = [...this.ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = x; p.y = y;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 10) this.zoomAt(d1 / d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      p.x = x; p.y = y;
    });
    const up = (e) => { const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId); if (p && !this.moved && !this.ptrs.size) this.tap(p.x, p.y); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => this.ptrs.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toGamePoint(e.clientX, e.clientY); this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
  }

  // ---------------------------------------------------------------- open / save
  open(world, W, H) {
    this.w = world;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { s = null; }
    const fresh = !s || s.v !== 1 || s.over;
    if (fresh) s = E.newGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    this.s = s; s.orders = s.orders || {};
    this.sel = null; this.mode = null;
    this.resize(W, H, true);
    this.render(); this.loop();
    if (fresh) this.intro();
  }
  save() { try { localStorage.setItem(SAVE, JSON.stringify(this.s)); } catch (e) { /* private mode */ } }
  resize(W, H, fit) {
    this.W = W; this.H = H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.dpr = dpr;
    this.panelW = Math.min(300, Math.max(240, W * 0.3));
    // the map area: right of the panel, below the top bar
    this.ox = this.panelW + (W - this.panelW) / 2; this.oy = 48 + (H - 48 - 50) / 2; // 50 px kept free for the end-month button
    const xs = CITY_IDS.map((c) => CITIES[c].x), zs = CITY_IDS.map((c) => CITIES[c].z);
    const fitS = Math.min((W - this.panelW - 30) / (Math.max(...xs) - Math.min(...xs) + 220), (H - 48 - 50 - 24) / (Math.max(...zs) - Math.min(...zs) + 200));
    this.sMin = fitS * 0.8; this.sMax = fitS * 4;
    if (fit || !this.s0) { this.k = fitS; this.s0 = fitS; this.cx = (Math.max(...xs) + Math.min(...xs)) / 2; this.cz = (Math.max(...zs) + Math.min(...zs)) / 2 + 20; }
  }
  loop() {
    if (!$('sg').classList.contains('show')) return;
    this.pulse += 1 / 60; this.draw();
    requestAnimationFrame(() => this.loop());
  }
  zoomAt(f, x = this.ox, y = this.oy) {
    const s = Math.min(this.sMax, Math.max(this.sMin, this.k * f));
    const wx = this.cx + (x - this.ox) / this.k, wz = this.cz + (y - this.oy) / this.k;
    this.k = s; this.cx = wx - (x - this.ox) / s; this.cz = wz - (y - this.oy) / s;
  }
  toScreen(x, z) { return [this.ox + (x - this.cx) * this.k, this.oy + (z - this.cz) * this.k]; }

  // ---------------------------------------------------------------- names
  fName(f) {
    if (f < 0) return t('sgUnclaimed');
    const fa = this.s.factions[f];
    return fa.player ? t('sgYou') : F('sgArmy', { n: gName(fa.lord) });
  }
  fColor(f) { return f < 0 ? NEUTRAL_COLOR : this.s.factions[f].color; }

  // ---------------------------------------------------------------- map
  tap(x, y) {
    if (this.busy) return;
    let bestC = null, bd = 38 * 38;
    for (const c of CITY_IDS) { const [sx, sy] = this.toScreen(CITIES[c].x, CITIES[c].z); const d = (sx - x) ** 2 + (sy - y + 10) ** 2; if (d < bd) { bd = d; bestC = c; } }
    if (!bestC) return;
    if (this.mode && this.mode.targets.includes(bestC)) { this.setTarget(bestC); return; }
    if (this.mode && bestC !== this.mode.c) this.mode = null;
    this.sel = bestC; this.render();
  }
  draw() {
    const c = this.ctx, W = this.W, H = this.H, s = this.k, w = this.w, [HW, HH] = w.half, S = CFG.minimap.pxPerM, st = this.s;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#9fd067'; c.fillRect(0, 0, W, H);
    const [x0, y0] = this.toScreen(-HW, -HH);
    c.drawImage(w.minimap, x0, y0, HW * 2 * S * (s / S), HH * 2 * S * (s / S));
    c.fillStyle = 'rgba(70,45,20,.18)'; c.fillRect(0, 0, W, H); // a warm, old-map wash
    const sup = E.supplied(st, E.PLAYER);
    // supply roads
    c.lineCap = 'round';
    for (const [a, b, road] of LINKS) {
      const [ax, ay] = this.toScreen(CITIES[a].x, CITIES[a].z), [bx, by] = this.toScreen(CITIES[b].x, CITIES[b].z);
      const oa = st.cities[a].owner, ob = st.cities[b].owner;
      c.setLineDash(oa === ob && oa >= 0 ? [] : [10, 8]);
      c.strokeStyle = 'rgba(43,33,26,.55)'; c.lineWidth = 9; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = oa === ob && oa >= 0 ? this.fColor(oa) : '#f5ebdd'; c.lineWidth = 5; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      if (this.k > this.s0 * 1.5) {
        c.setLineDash([]); c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const mx = (ax + bx) / 2, my = (ay + by) / 2, tw = c.measureText(road).width + 10;
        c.fillStyle = 'rgba(255,255,255,.88)'; rr(c, mx - tw / 2, my - 8, tw, 16, 8); c.fill();
        c.fillStyle = '#5a4632'; c.fillText(road, mx, my + 0.5);
      }
    }
    c.setLineDash([]);
    // planned orders: arrows from your cities
    for (const [from, o] of Object.entries(st.orders || {})) if (o.cmd === 'march' || o.cmd === 'move') {
      const [ax, ay] = this.toScreen(CITIES[from].x, CITIES[from].z), [bx, by] = this.toScreen(CITIES[o.to].x, CITIES[o.to].z);
      arrow(c, ax, ay, bx, by, o.cmd === 'march' ? '#e23d3d' : '#2f7de1', this.pulse);
    }
    // targets while picking
    if (this.mode) for (const tc of this.mode.targets) {
      const [x, y] = this.toScreen(CITIES[tc].x, CITIES[tc].z), r = 30 + 4 * Math.sin(this.pulse * 5);
      c.strokeStyle = '#f2c14e'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, 7); c.stroke();
    }
    // cities: castles first, labels on top (so a name is never hidden behind a neighbour's castle)
    const ts = Math.min(1, Math.max(0.55, this.k / 0.22)), fs = Math.round(Math.max(10.5, 12 * ts));
    for (const id of CITY_IDS) {
      const C = st.cities[id], [x, y] = this.toScreen(CITIES[id].x, CITIES[id].z), col = this.fColor(C.owner);
      if (id === this.sel) { c.strokeStyle = '#f2c14e'; c.lineWidth = 3.5; c.beginPath(); c.ellipse(x, y + 3, 38 * ts, 15 * ts, 0, 0, 7); c.stroke(); }
      castle(c, x, y, col, C.owner >= 0 && st.factions[C.owner].cap === id, C.owner === E.PLAYER ? '君' : C.owner > 0 ? GENERALS[st.factions[C.owner].lord].zh.slice(-1) : '', ts);
    }
    for (const id of CITY_IDS) {
      const C = st.cities[id], [x, y] = this.toScreen(CITIES[id].x, CITIES[id].z), col = this.fColor(C.owner);
      const lab = `${cName(id)} · ${kNum(C.troops)}`, ly = y + 18 * ts + 9;
      c.font = `700 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(lab).width + 20, lh = fs + 7;
      c.fillStyle = id === this.sel ? 'rgba(90,60,20,.95)' : 'rgba(38,29,22,.88)'; rr(c, x - tw / 2, ly - lh / 2, tw, lh, lh / 2); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x - tw / 2 + 9, ly, 3.5, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.fillText(lab, x + 5, ly + 0.5);
      if (C.owner === E.PLAYER && !sup.has(id)) badge(c, x - 26 * ts, y - 30 * ts, '#d64545', zh() ? '断' : '!');
      const o = st.orders && st.orders[id];
      if (o && CMD_ICON[o.cmd]) badge(c, x + 30 * ts, y - 4 * ts, '#f2c14e', zh() ? CMD_ICON[o.cmd] : o.cmd[0].toUpperCase(), '#2b211a');
    }
    c.fillStyle = 'rgba(43,33,26,.8)'; c.font = '900 14px system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('N ↑', this.panelW + 14, H - 16);
  }

  // ---------------------------------------------------------------- side panel
  render() {
    const st = this.s, me = st.factions[E.PLAYER];
    $('sgDate').textContent = dateText(st);
    const troops = E.ownedBy(st, E.PLAYER).reduce((a, c) => a + st.cities[c].troops, 0);
    $('sgRes').innerHTML = [['金', 'sgGold', me.gold, '#f2c14e'], ['粮', 'sgFood', me.food, '#e9d8a6'], ['兵', 'sgTroops', troops, '#f08a6e'], ['城', 'sgCities', E.ownedBy(st, E.PLAYER).length + '/12', '#7fb2f0']]
      .map(([ch, k, v, col]) => `<span title="${esc(t(k))}"><i style="background:${col}">${zh() ? ch : t(k)[0]}</i>${typeof v === 'number' ? kNum(v) : v}</span>`).join('');
    $('sgEnd').textContent = t('sgEnd');
    $('sgLogBtn').textContent = t('sgLog'); $('sgMenuBtn').textContent = t('sgMenu'); $('sgTitle').textContent = t('sgTitle');
    $('sgPanel').innerHTML = this.sel ? this.cityPanel(this.sel) : this.sidePanel();
    this.save();
  }
  sidePanel() {
    const st = this.s, gs = E.byLead(E.factionGens(st, E.PLAYER)), bonds = E.activeBonds(st, E.PLAYER, []);
    const n = Object.keys(st.orders || {}).length;
    return `<h3>${t('sgYourSide')}</h3><p class="sgHint">${t('sgPickCity')}</p>${n ? `<p class="sgHint">${F('sgOrders', { n })}</p>` : ''}
      ${bonds.length ? `<h4>${t('sgBonds')}</h4>${bonds.map((b) => `<div class="sgBond">${esc(zh() ? b.zh : b.en)} · ${t('sgBondOn')}</div>`).join('')}` : ''}
      <h4>${t('sgAllGens')} · ${gs.length}</h4>${gs.map((g) => genCard(g) + `<div class="sgWhere">📍 ${esc(cName(st.gens[g].c))}</div>`).join('')}`;
  }
  cityPanel(c) {
    const st = this.s, C = st.cities[c], mine = C.owner === E.PLAYER, gs = C.owner >= 0 ? E.byLead(E.gensIn(st, c, C.owner)) : [];
    const cap = C.owner >= 0 && st.factions[C.owner].cap === c;
    let h = `<h3><span class="sgDot" style="background:${this.fColor(C.owner)}"></span>${esc(cName(c))}<button class="sgX" data-a="close">✕</button></h3>
      <div class="sgSub">${esc(this.fName(C.owner))}${cap ? ' · ' + t('sgCap') : ''}</div>
      <div class="sgGrid"><div><small>${t('sgTroops')}</small><b>${C.troops.toLocaleString()}</b></div><div><small>${t('sgDef')}</small><b>${C.def}</b></div><div><small>${t('sgDev')}</small><b>${C.dev}</b></div><div><small>${t('sgRumour')}</small><b>${F('sgRumourN', { n: E.hiddenIn(st, c).length })}</b></div></div>`;
    if (mine && !E.supplied(st, E.PLAYER).has(c)) h += `<p class="sgWarn">${t('sgCut')}</p>`;
    if (mine) h += this.orderBlock(c, gs);
    h += `<h4>${t('sgGarrison')}</h4>${gs.length ? gs.map((g) => genCard(g)).join('') : `<p class="sgHint">${t('sgNone')}</p>`}`;
    h += `<h4>${t('sgRoad')}</h4>${ADJ[c].map(({ c: n, road }) => `<div class="sgRoadRow"><span class="sgDot" style="background:${this.fColor(st.cities[n].owner)}"></span>${esc(cName(n))}<small>${esc(road)}</small></div>`).join('')}`;
    return h;
  }
  orderBlock(c, gs) {
    const st = this.s, o = st.orders[c], m = this.mode && this.mode.c === c ? this.mode : null;
    const can = (cmd) => {
      if (cmd === 'march') return ADJ[c].some(({ c: n }) => E.validOrder(st, E.PLAYER, c, { cmd, to: n }));
      if (cmd === 'move') return ADJ[c].some(({ c: n }) => st.cities[n].owner === E.PLAYER);
      return cmd === 'rest' || E.validOrder(st, E.PLAYER, c, { cmd });
    };
    const btn = (cmd, k) => `<button class="sgCmd${(o && o.cmd === cmd) || (m && m.cmd === cmd) ? ' on' : ''}" data-cmd="${cmd}" ${can(cmd) ? '' : 'disabled'}><b>${t(k)}</b><small>${t(k + 'S')}</small></button>`;
    let h = `<h4>${t('sgOrder')}</h4><div class="sgCmds">${btn('dev', 'sgCmdDev')}${btn('draft', 'sgCmdDraft')}${btn('search', 'sgCmdSearch')}${btn('move', 'sgCmdMove')}${btn('march', 'sgCmdMarch')}<button class="sgCmd${!o && !m ? ' on' : ''}" data-cmd="rest"><b>${t('sgCmdRest')}</b><small>&nbsp;</small></button></div>`;
    if (!gs.length) h += `<p class="sgHint">${t('sgNoGen')}</p>`;
    if (m && !m.to) h += `<p class="sgPick">${t('sgPickTarget')}</p><button class="sgSmall" data-a="cancel">${t('sgCancel')}</button>`;
    const cur = m && m.to ? m : o && (o.cmd === 'march' || o.cmd === 'move') ? o : null;
    if (cur && cur.to) {
      const fr = cur.frac ?? (cur.cmd === 'march' ? 0.8 : 0.5);
      h += `<div class="sgTo">→ ${esc(cName(cur.to))}</div><div class="sgSeg"><span>${t('sgTroopsSend')}</span>${[0.5, 0.8, 1].map((f) => `<button data-frac="${f}" class="${Math.abs(fr - f) < 0.01 ? 'on' : ''}">${Math.round(f * 100)}% · ${kNum(st.cities[c].troops * f)}</button>`).join('')}</div>`;
      if (gs.length) {
        const sel = new Set(cur.gens || []);
        h += `<div class="sgHint">${t('sgGensSend')}</div><div class="sgChips">${gs.map((g) => `<button data-gen="${g}" class="${sel.has(g) ? 'on' : ''}">${esc(gName(g))}</button>`).join('')}</div>`;
      }
    }
    return h;
  }
  panelClick(e) {
    if (this.busy) return;
    const st = this.s, c = this.sel, b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'close') { this.sel = null; this.mode = null; this.render(); return; }
    if (b.dataset.a === 'cancel') { this.mode = null; this.render(); return; }
    if (!c) return;
    const gs = E.byLead(E.gensIn(st, c, E.PLAYER));
    if (b.dataset.cmd) {
      const cmd = b.dataset.cmd;
      this.mode = null;
      if (cmd === 'rest') delete st.orders[c];
      else if (cmd === 'march' || cmd === 'move') {
        const targets = ADJ[c].map((a) => a.c).filter((n) => (cmd === 'march' ? E.validOrder(st, E.PLAYER, c, { cmd, to: n }) : st.cities[n].owner === E.PLAYER));
        delete st.orders[c];
        if (targets.length === 1) { this.mode = { c, cmd, targets }; this.setTarget(targets[0]); return; }
        this.mode = { c, cmd, targets };
      } else st.orders[c] = { cmd };
      this.render(); return;
    }
    const o = st.orders[c];
    if (!o) return;
    if (b.dataset.frac) { o.frac = +b.dataset.frac; this.render(); return; }
    if (b.dataset.gen) {
      const g = b.dataset.gen, set = new Set(o.gens || []);
      if (set.has(g)) set.delete(g); else if (o.cmd === 'move' || set.size < 3) set.add(g);
      o.gens = gs.filter((x) => set.has(x)); this.render();
    }
  }
  setTarget(to) {
    const st = this.s, m = this.mode, gs = E.byLead(E.gensIn(st, m.c, E.PLAYER));
    st.orders[m.c] = { cmd: m.cmd, to, frac: m.cmd === 'march' ? 0.8 : 0.5, gens: m.cmd === 'march' ? gs.slice(0, 3) : [] };
    this.sel = m.c; this.mode = null; this.render();
  }

  // ---------------------------------------------------------------- the month
  async endMonth() {
    if (this.busy) return;
    const st = this.s;
    this.busy = true; this.mode = null;
    E.beginTurn(st, st.orders);
    for (let b = E.nextBattle(st); b; b = E.nextBattle(st)) {
      let win = null;
      if (b.duel) win = b.duel.fa === E.PLAYER || b.duel.fd === E.PLAYER ? await this.duelUI(b.duel) : E.autoDuel(st, b.duel);
      E.resolveBattle(st, b.m, win, b.duel);
    }
    const evs = E.endTurn(st);
    st.orders = {};
    for (const e of evs) if ((e.k === 'found' || e.k === 'recruit') && e.f === E.PLAYER) await this.reveal(e.g, t(e.k === 'found' ? 'sgBlind' : 'sgDuel'), F(e.k === 'found' ? 'sgJoined' : 'sgRecruited', { g: gName(e.g) }));
    this.render();
    await this.report(evs);
    if (st.over) await this.gameOver();
    this.busy = false; this.render();
  }

  evText(e) {
    const st = this.s, P = E.PLAYER, f = this.fName(e.f ?? -1);
    switch (e.k) {
      case 'dev': return e.f === P ? F('evDev', { c: cName(e.c), n: e.n }) : null;
      case 'draft': return e.f === P ? F('evDraft', { c: cName(e.c), n: e.n }) : null;
      case 'found': return e.f === P ? F('evFound', { c: cName(e.c), by: gName(e.by), g: gName(e.g) }) : F('evFoundAI', { f, c: cName(e.c), g: gName(e.g) });
      case 'treasure': return e.f === P ? F('evTreasure', { c: cName(e.c), n: e.n }) : null;
      case 'nothing': return e.f === P ? F('evNothing', { c: cName(e.c) }) : null;
      case 'move': return e.f === P ? F('evMove', { c: cName(e.c), to: cName(e.to), n: e.n }) : null;
      case 'march': return e.f === P || st.cities[e.to].owner === P || (e.to && st.factions.some((x) => x.player && x.cap === e.to)) ? F('evMarch', { f, c: cName(e.c), to: cName(e.to), n: e.n.toLocaleString() }) : null;
      case 'duel': return F('evDuel', { a: gName(e.a), d: gName(e.d), w: e.win ? F('evDuelWon', { g: gName(e.win === 'a' ? e.a : e.d) }) : t('evDuelDraw') });
      case 'take': return F('evTake', { f, c: cName(e.c) });
      case 'repel': return e.f === P || e.fd === P ? F('evRepel', { c: cName(e.c), f }) : null;
      case 'flee': return e.f === P || e.by === P ? F('evFlee', { g: gName(e.g), c: cName(e.c) }) : null;
      case 'recruit': return F('evRecruit', { f, g: gName(e.g) });
      case 'release': return e.f === P || e.from === P ? F('evRelease', { g: gName(e.g) }) : null;
      case 'newlord': return F('evNewLord', { g: gName(e.g) });
      case 'fall': return F('evFall', { f: this.fName(e.f) });
      case 'capital': return F('evCapital', { f, c: cName(e.c) });
      case 'cut': return e.f === P ? F('evCut', { c: cName(e.c) }) : null;
      case 'hunger': return e.f === P ? F('evHunger', { f }) : null;
      case 'coalition': return e.f === P ? t('evCoalitionYou') : F('evCoalition', { f });
      case 'coalitionEnd': return e.f >= 0 ? F('evCoalitionEnd', { f }) : null;
      default: return null;
    }
  }
  layer(html, cls = '') {
    const L = $('sgLayer');
    L.className = 'show ' + cls; L.innerHTML = `<div class="sgCard">${html}</div>`;
    return new Promise((res) => {
      const h = (e) => { const b = e.target.closest('[data-ok]'); if (!b) return; L.removeEventListener('click', h); L.className = ''; L.innerHTML = ''; res(b.dataset.ok); };
      L.addEventListener('click', h);
    });
  }
  async report(evs) {
    const lines = evs.map((e) => [e, this.evText(e)]).filter(([, x]) => x);
    const imp = (e) => ['take', 'fall', 'coalition', 'coalitionEnd', 'duel', 'cut', 'hunger', 'found', 'recruit'].includes(e.k);
    await this.layer(`<h2>${t('sgReport')} · ${dateText({ turn: this.s.turn - 1 })}</h2>
      <ul class="sgEv">${lines.length ? lines.map(([e, x]) => `<li class="${imp(e) ? 'imp' : ''}${e.f === E.PLAYER ? ' me' : ''}">${esc(x)}</li>`).join('') : `<li>${t('sgQuiet')}</li>`}</ul>
      <button class="sgBig" data-ok="1">${t('sgContinue')}</button>`);
  }
  showLog() {
    if (this.busy) return;
    const lines = [...this.s.log].reverse().map((e) => [e, this.evText(e)]).filter(([, x]) => x);
    this.layer(`<h2>${t('sgLog')}<button class="sgX" data-ok="1">✕</button></h2><ul class="sgEv">${lines.map(([e, x]) => { const d = E.dateOf({ turn: e.t }); return `<li><small>${d.year}.${d.month}</small> ${esc(x)}</li>`; }).join('') || `<li>${t('sgQuiet')}</li>`}</ul>`);
  }
  reveal(g, title, line) {
    const bonds = BONDS.filter((b) => b.m.includes(g)).map((b) => `<div class="sgBond">${esc(zh() ? b.zh : b.en)}：${b.m.map((x) => esc(gName(x))).join(' · ')}</div>`).join('');
    return this.layer(`<h2 class="sgCenter">${esc(title)}</h2><div class="sgReveal">${portrait(g, 96)}<div><div class="sgBigName">${esc(gName(g))}</div>${statBars(g)}<div class="sgTrw">${traitTag(g)}</div>${bonds}</div></div>
      <p class="sgCenter">${esc(line)}</p><button class="sgBig" data-ok="1">${t('sgContinue')}</button>`, 'flip');
  }
  async intro() {
    const st = this.s;
    await this.reveal(E.factionGens(st, E.PLAYER)[0], t('sgBlindStart'), F('sgJoined', { g: gName(E.factionGens(st, E.PLAYER)[0]) }));
    await this.reveal(E.factionGens(st, E.PLAYER)[1], t('sgBlindStart'), F('sgJoined', { g: gName(E.factionGens(st, E.PLAYER)[1]) }));
    const [a, b, c] = [1, 2, 3].map((f) => this.fName(f));
    await this.layer(`<h2>${t('sgRivals')}</h2><div class="sgRivals">${[1, 2, 3].map((f) => `<div>${portrait(st.factions[f].lord, 56)}<b style="color:${st.factions[f].color}">${esc(this.fName(f))}</b><small>📍 ${esc(cName(st.factions[f].cap))}</small></div>`).join('')}</div>
      <p>${esc(F('sgIntro', { a, b, c }))}</p><button class="sgBig" data-ok="1">${t('sgContinue')}</button>`);
    this.sel = st.factions[E.PLAYER].cap; this.render();
  }
  duelUI(d) {
    const st = this.s, mineA = d.fa === E.PLAYER, me = mineA ? d.a : d.d, foe = mineA ? d.d : d.a;
    const L = $('sgLayer');
    L.className = 'show duel';
    const paint = (msg) => {
      const hpMe = mineA ? d.hpA : d.hpD, hpFoe = mineA ? d.hpD : d.hpA;
      const side = (g, hp, col) => `<div class="sgDs">${portrait(g, 84)}<b>${esc(gName(g))}</b><small>${zh() ? '武力' : 'WAR'} ${GENERALS[g].war}</small><i class="sgHp"><b style="width:${hp}%;background:${col}"></b></i><em>${hp}</em></div>`;
      const btns = d.done
        ? `<button class="sgBig" data-dm="ok">${t('sgContinue')}</button>`
        : `<div class="sgDm">${['atk', 'def', 'skill'].map((m) => `<button data-dm="${m}">${t(MOVES[m])}</button>`).join('')}</div><p class="sgRule">${t('sgDuelRule')}</p>`;
      L.innerHTML = `<div class="sgCard"><h2 class="sgCenter">${t('sgDuel')} <small>${d.rival ? esc(F('sgRival', { r: zh() ? d.rival : d.rivalEn })) : F('sgRound', { n: Math.min(d.n + 1, CFG.sg.duelRounds) })}</small></h2>
        <div class="sgDuel">${side(me, hpMe, '#2f7de1')}<span class="sgVs">VS</span>${side(foe, hpFoe, '#d64545')}</div>
        <p class="sgCenter sgMsg">${msg}</p>${btns}</div>`;
    };
    paint(esc(F('sgDuelVs', { a: gName(d.a), d: gName(d.d) })));
    return new Promise((res) => {
      const h = (e) => {
        const b = e.target.closest('[data-dm]');
        if (!b) return;
        if (b.dataset.dm === 'ok') { L.removeEventListener('click', h); L.className = ''; L.innerHTML = ''; res(d.win); return; }
        const mv = b.dataset.dm;
        E.duelRound(st, d, mineA ? mv : null, mineA ? null : mv);
        const r = d.log[d.log.length - 1], myMv = mineA ? r.mA : r.mD, foeMv = mineA ? r.mD : r.mA;
        const hits = [r.dmgA && F('sgHit', { g: gName(d.a), n: r.dmgA }), r.dmgD && F('sgHit', { g: gName(d.d), n: r.dmgD })].filter(Boolean).join(' · ');
        let msg = `${esc(F('sgMoves', { a: t(MOVES[myMv]), d: t(MOVES[foeMv]) }))}<br>${esc(hits)}`;
        if (d.done) msg += `<br><b>${esc(d.win ? F('sgDuelWin', { g: gName(d.win === 'a' ? d.a : d.d) }) : t('sgDuelDraw'))}</b>`;
        paint(msg);
      };
      L.addEventListener('click', h);
    });
  }
  async gameOver() {
    const st = this.s, win = st.over === 'win';
    await this.layer(`<h2 class="sgCenter sgBigName">${t(win ? 'sgWin' : 'sgLose')}</h2><p class="sgCenter">${esc(F(win ? 'sgWinS' : 'sgLoseS', { n: st.turn }))}</p><button class="sgBig" data-ok="1">${t('sgAgain')}</button>`);
    this.newGame(false);
  }
  newGame(confirmFirst = true) {
    if (confirmFirst && !window.confirm(t('sgNewQ'))) return;
    try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ }
    this.open(this.w, this.W, this.H);
  }
  async menu() {
    if (this.busy) return;
    const r = await this.layer(`<h2>${t('sgMenu')}<button class="sgX" data-ok="x">✕</button></h2>
      <button class="sgBig" data-ok="back">${t('sgBack')}</button><button class="sgBig alt" data-ok="help">${t('sgHelp')}</button><button class="sgBig alt" data-ok="new">${t('sgNew')}</button>`);
    if (r === 'back') { this.save(); this.onClose(); }
    else if (r === 'help') this.layer(`<h2>${t('sgHelp')}<button class="sgX" data-ok="1">✕</button></h2><p class="sgHelp">${esc(t('sgHelpText'))}</p>`);
    else if (r === 'new') this.newGame(true);
  }
}

// ---------------------------------------------------------------- canvas bits
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = (v) => Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
// a little low-poly castle: stone base, keep, two roofs in the owner's colour, a flag with a character
function castle(c, x, y, col, cap, ch, ts = 1) {
  const k = (cap ? 1.15 : 1) * ts;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(0, 9, 30, 10, 0, 0, 7); c.fill();
  const poly = (pts, f) => { c.fillStyle = f; c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fill(); };
  poly([[-24, 0], [-12, 8], [12, 8], [24, 0], [24, 6], [12, 14], [-12, 14], [-24, 6]], '#b5a285');
  poly([[-24, 0], [-12, -8], [12, -8], [24, 0], [12, 8], [-12, 8]], '#e8decd');
  poly([[-11, 2], [11, 2], [11, -16], [-11, -16]], '#f6eee1');
  poly([[11, 2], [16, -2], [16, -20], [11, -16]], '#d9cbb4');
  poly([[-3, -6], [3, -6], [3, 2], [-3, 2]], '#6b4a2e');
  poly([[-17, -15], [20, -15], [12, -25], [-9, -25]], col);
  poly([[-6, -25], [8, -25], [8, -32], [-6, -32]], '#f6eee1');
  poly([[-11, -31], [13, -31], [7, -39], [-5, -39]], shade(col, 0.82));
  c.strokeStyle = '#5a4632'; c.lineWidth = 2; c.beginPath(); c.moveTo(20, -4); c.lineTo(20, -52); c.stroke();
  poly([[20, -52], [42, -50], [37, -43], [42, -36], [20, -38]], col);
  c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
  if (ch) { c.fillStyle = '#fff'; c.font = "900 12px 'STKaiti','KaiTi','Kaiti SC',serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 30, -44); }
  c.restore();
}
function badge(c, x, y, bg, txt, fg = '#fff') {
  c.fillStyle = bg; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill(); c.stroke();
  c.fillStyle = fg; c.font = '900 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y + 0.5);
}
function arrow(c, ax, ay, bx, by, col, t) {
  const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
  const sx = ax + ux * 26, sy = ay + uy * 26, ex = bx - ux * 34, ey = by - uy * 34;
  c.strokeStyle = col; c.lineWidth = 5; c.setLineDash([12, 8]); c.lineDashOffset = -t * 40;
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
  c.fillStyle = col; c.beginPath(); c.moveTo(ex + ux * 12, ey + uy * 12); c.lineTo(ex - uy * 9, ey + ux * 9); c.lineTo(ex + uy * 9, ey - ux * 9); c.closePath(); c.fill();
}
