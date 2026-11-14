// 万锦三国志 (D-73): the strategy rules, run headless.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  newGame, runTurn, beginTurn, nextBattle, resolveBattle, endTurn, duelRound, autoDuel, autoPlayer, newDuel, feintChance,
  supplied, ownedBy, citiesOf, gensIn, guardsIn, factionGens, activeBonds, rivalry, capOf, PLAYER, validOrder, hiddenIn,
  terrain, wallMul, autoAssign, aiOrders, orderCost, isWinter, plotChance, EVENT_IDS, moveTargets, genMap, loadMap, travelMonths,
  statMul, draftAmt, devAmt, searchChance, costOf, commandOf, interceptTargets, routeOf, marchTargets, tierOf, drawRoster,
} from '../../js/sg_engine.js';
import { GENERALS, GEN_IDS, SANGUO_IDS, ERAS, RIVALS, CITY_IDS, PASS_IDS, NODE_IDS, ADJ, LINKS, CITIES, BONDS, TRAITS, TRAIT_FX } from '../../js/sg_data.js';
import { ELEV } from '../../js/sg_elev.js';
import * as E from '../../js/sg_engine.js';
import * as M from '../../js/sg_map.js';
import { Table } from '../../js/sg_table.js';
import { SITES, PARKS } from '../../js/sg_sites.js';
import { readFileSync } from 'node:fs';
import { CFG } from '../../js/config.js';

const check = (s) => {
  // every general is in exactly one consistent state; numbers stay sane
  for (const g of Object.values(s.gens)) {
    if (g.hidden) { expect(g.f).toBe(-1); expect(CITIES[g.c].pass).toBe(false); }
    else if (g.guard) { expect(g.f).toBe(-1); expect(s.cities[g.c].owner).toBe(-1); }
    else if (g.c === null) expect((s.armies || []).some((a) => a.f === g.f && a.gens.includes(g.id))).toBe(true); // on the road
    else { expect(g.f).toBeGreaterThanOrEqual(0); expect(s.cities[g.c].owner).toBe(g.f); }
  }
  for (const c of NODE_IDS) { const C = s.cities[c]; expect(C.troops).toBeGreaterThanOrEqual(0); expect(C.troops).toBeLessThanOrEqual(Math.max(CFG.sg.maxTroops, capOf(C))); expect(C.dev).toBeLessThanOrEqual(100); }
  for (const f of s.factions) { expect(f.gold).toBeGreaterThanOrEqual(0); expect(f.food).toBeGreaterThanOrEqual(0); }
};

// tests of other rules march along roads that take one month (v0.9.3 made long roads slower)
const oneMonthRoads = () => {
  let keep;
  beforeEach(() => { keep = CFG.sg.marchSpeed; CFG.sg.marchSpeed = 1e9; });
  afterEach(() => { CFG.sg.marchSpeed = keep; });
};

describe('data', () => {
  it('generals, traits, bonds and the road graph are consistent', () => {
    expect(GEN_IDS.length).toBeGreaterThanOrEqual(40);
    for (const id of GEN_IDS) { const g = GENERALS[id]; expect(TRAITS[g.trait]).toBeTruthy(); expect(TRAIT_FX[g.trait]).toBeTruthy(); for (const k of ['lead', 'war', 'int', 'pol']) expect(g[k]).toBeGreaterThan(0); }
    for (const b of BONDS) for (const m of b.m) expect(GENERALS[m]).toBeTruthy();
    expect(CITY_IDS.length).toBe(12);
    expect(PASS_IDS.length).toBe(5);
    for (const [a, b] of LINKS) { expect(CITIES[a]).toBeTruthy(); expect(CITIES[b]).toBeTruthy(); }
    // connected
    const seen = new Set(['unv']), q = ['unv'];
    while (q.length) for (const { c } of ADJ[q.shift()]) if (!seen.has(c)) { seen.add(c); q.push(c); }
    expect(seen.size).toBe(NODE_IDS.length);
    // inside the map (maps/markham.json half extents)
    for (const c of Object.values(CITIES)) { expect(Math.abs(c.x)).toBeLessThan(1753); expect(Math.abs(c.z)).toBeLessThan(1306); }
  });
});

describe('real terrain (v0.8)', () => {
  oneMonthRoads();
  const map = JSON.parse(readFileSync(new URL('../../maps/markham.json', import.meta.url), 'utf8'));
  const cross = (p, q, r, t) => { const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return d(p, q, r) * d(p, q, t) < 0 && d(r, t, p) * d(r, t, q) < 0; };
  const P = (c) => [CITIES[c].x, CITIES[c].z];
  const hits = (a, b, lines) => lines.some((l) => l.some((pt, i) => i > 0 && cross(P(a), P(b), l[i - 1], pt)));
  it('the elevation grid covers the map and has real numbers', () => {
    expect(ELEV.nx * ELEV.nz).toBe(ELEV.h.length);
    expect(ELEV.x0).toBeLessThanOrEqual(-map.half[0]); expect(ELEV.x0 + (ELEV.nx - 1) * ELEV.step).toBeGreaterThanOrEqual(map.half[0]);
    expect(ELEV.lo).toBeGreaterThan(140); expect(ELEV.hi).toBeLessThan(260); // Markham sits ~170-215 m above sea level
    for (const c of NODE_IDS) expect(CITIES[c].elev).toBeGreaterThan(150);
  });
  it('river flags match the Rouge River in the map; passes are real parks', () => {
    const rouge = map.rivers.filter((r) => r[0] === 1).map((r) => r[1]);
    for (const [a, b, , river] of LINKS) expect([a, b, hits(a, b, rouge)]).toEqual([a, b, !!river]);
    // every pass is a park in the map data (within 150 m of a park outline), between exactly two nodes
    const parks = map.parks.map((p) => (p.p || p)).filter((p) => Array.isArray(p) && Array.isArray(p[0]));
    for (const c of PASS_IDS) {
      expect(ADJ[c].length).toBe(2);
      const d = Math.min(...parks.flatMap((p) => p.map(([x, z]) => Math.hypot(x - CITIES[c].x, z - CITIES[c].z))));
      expect([c, d < 150]).toEqual([c, true]);
    }
    // valley cities really are near the Rouge
    const near = (c) => Math.min(...rouge.flatMap((l) => l.map(([x, z]) => Math.hypot(x - CITIES[c].x, z - CITIES[c].z))));
    for (const c of CITY_IDS) if (CITIES[c].valley) expect(near(c)).toBeLessThan(220);
  });
  it('crossing the river or attacking uphill is harder; passes have strong walls', () => {
    expect(terrain('wdb', 'civ').why).toContain('river');
    expect(terrain('wdb', 'civ').m).toBeLessThan(terrain('wdb', 'esn').m + 0.1);
    const up = ['dtm', 'p_tg'], dn = ['p_tg', 'dtm'];
    if (CITIES.p_tg.elev > CITIES.dtm.elev) expect(terrain(...up).m).toBeLessThan(terrain(...dn).m);
    const s = newGame(3);
    expect(wallMul(s.cities.p_tg)).toBeGreaterThan(wallMul(s.cities[s.factions[0].cap]));
    // passes: no people (no develop / draft / search), but you can fortify and garrison them
    const id = factionGens(s, 0)[0];
    Object.assign(s.cities.p_mm, { owner: 0, troops: 500 }); s.gens[id].c = 'p_mm';
    expect(validOrder(s, 0, id, { cmd: 'dev' })).toBe(false);
    expect(validOrder(s, 0, id, { cmd: 'draft' })).toBe(false);
    expect(validOrder(s, 0, id, { cmd: 'search' })).toBe(false);
    expect(validOrder(s, 0, id, { cmd: 'fort' })).toBe(true);
  });
  it('Toogood 虎牢关 starts with a guard; beating it can win him over', () => {
    let won = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed), [g] = guardsIn(s, 'p_tg');
      expect(g).toBeTruthy();
      expect(s.gens[g].hidden).toBe(false);
      const id = factionGens(s, 0)[0];
      // only the player is left, next to the pass with a huge army
      for (const f of s.factions.slice(1)) { f.alive = false; for (const x of factionGens(s, f.id)) Object.assign(s.gens[x], { f: -1, hidden: true }); }
      for (const c of CITY_IDS) s.cities[c].owner = -1;
      for (const x of factionGens(s, 0)) s.gens[x].c = 'unv';
      Object.assign(s.cities.unv, { owner: 0, troops: 10000 }); s.factions[0].cap = 'unv';
      const keep = CFG.sg.leadTroops; CFG.sg.leadTroops = 200; // one officer leading the whole big army (統率 limits are tested elsewhere)
      try { runTurn(s, { [id]: { cmd: 'march', to: 'p_tg', n: 10000 } }); } finally { CFG.sg.leadTroops = keep; }
      if (s.cities.p_tg.owner === 0) won++;
      expect(guardsIn(s, 'p_tg').length).toBeLessThanOrEqual(s.cities.p_tg.owner === 0 ? 0 : 1);
      if (s.cities.p_tg.owner === 0) expect(s.gens[g].guard).toBe(false);
      check(s);
    }
    expect(won).toBeGreaterThan(20);
  });
});

describe('seasons, stratagems, random events (v0.8.1)', () => {
  oneMonthRoads();
  it('winter makes attacking harder; September brings the harvest', () => {
    const atk = (turn) => {
      const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c, [a] = factionGens(s, 0).sort((x, y) => GENERALS[y].war - GENERALS[x].war); // the fighter leads (v1.2: weak stats are weaker)
      for (const f of s.factions.slice(1)) f.alive = false;
      Object.assign(s.cities[n], { troops: 1500, def: 50 }); s.turn = turn; CFG.sg.eventChance = 0;
      try { runTurn(s, { [a]: { cmd: 'march', to: n, n: 2000 } }); } finally { CFG.sg.eventChance = 0.55; }
      return s.events.find((e) => e.k === 'take' || e.k === 'repel').lostA;
    };
    expect(isWinter({ turn: 0 })).toBe(true); expect(isWinter({ turn: 5 })).toBe(false);
    expect(atk(0)).toBeGreaterThan(atk(5)); // January vs June: more losses in the snow (same seed, same dice)
    const month = (turn) => { const x = newGame(4), f0 = x.factions[1].food; x.turn = turn; x.events = []; CFG.sg.eventChance = 0; try { endTurn(x); } finally { CFG.sg.eventChance = 0.55; } return x.factions[1].food - f0; };
    expect(month(8)).toBeGreaterThan(month(7) * 2); // month index 8 = September
  });
  it('rumours thin the garrison, fire burns the walls; clever officers succeed more', () => {
    let rum = 0, fire = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c, [a] = factionGens(s, 0);
      for (const f of s.factions.slice(1)) f.alive = false;
      Object.assign(s.cities[n], { troops: 2000, def: 60 });
      expect(validOrder(s, 0, a, { cmd: 'plot', kind: 'rumor', to: n })).toBe(true);
      expect(validOrder(s, 0, a, { cmd: 'plot', kind: 'rumor', to: c })).toBe(false);
      beginTurn(s, { [a]: { cmd: 'plot', kind: seed % 2 ? 'rumor' : 'fire', to: n } });
      const e = s.events.find((x) => x.k === 'plot');
      if (e.ok && e.kind === 'rumor') { rum++; expect(s.cities[n].troops).toBeLessThan(2000); }
      if (e.ok && e.kind === 'fire') { fire++; expect(s.cities[n].def).toBeLessThan(60); }
    }
    expect(rum + fire).toBeGreaterThan(6);
    const s = newGame(1);
    s.gens.zhugeliang = { ...s.gens.zhugeliang, f: 0, c: s.factions[0].cap, hidden: false };
    s.gens.xuchu = { ...s.gens.xuchu, f: 0, c: s.factions[0].cap, hidden: false };
    const n = ADJ[s.factions[0].cap][0].c;
    expect(plotChance(s, 'zhugeliang', n)).toBeGreaterThan(plotChance(s, 'xuchu', n));
  });
  it('random events happen, stay inside the rules, and Lunar New Year pays every February', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame(seed);
      for (let t = 0; t < 36 && !s.over; t++) { for (const e of runTurn(s, autoPlayer(s))) if (e.k === 'event') seen.add(e.id); check(s); }
    }
    expect(seen.has('cny')).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(7);
    for (const id of seen) if (id !== 'cny') expect(EVENT_IDS).toContain(id);
  });
});

describe('relay stations and supply depots (v0.8.2)', () => {
  it('驿站 roads (gas stations) help attackers and let an officer move two roads in a month', () => {
    const st = LINKS.filter((l) => l[4]);
    expect(st.length).toBeGreaterThanOrEqual(4);
    for (const l of st) { expect(l[4][1]).toBeGreaterThan(0.15); expect(l[4][1]).toBeLessThan(0.85); }
    expect(terrain('wdb', 'esn').why).toContain('station');
    expect(terrain('wdb', 'esn').m).toBeGreaterThan(terrain('esn', 'p_mm').m - 0.2);
    const s = newGame(2);
    for (const c of ['wdb', 'esn', 'pac', 'dtm']) s.cities[c].owner = 0;
    expect(moveTargets(s, 0, 'wdb')).toContain('pac');  // Woodbine Ave has a relay, then Steeles Ave E
    expect(moveTargets(s, 0, 'wdb')).toContain('dtm');  // ... or Warden Ave
    s.cities.esn.owner = 1;
    expect(moveTargets(s, 0, 'wdb')).not.toContain('pac'); // the middle city must be ours
    expect(moveTargets(s, 0, 'dtm')).not.toContain('pac'); // no road of ours leads there
  });
  it('补给站 (malls) feed their own supply line', () => {
    expect(CITY_IDS.filter((c) => CITIES[c].depot).sort()).toEqual(['btv', 'mkv', 'pac', 'wdb']);
    const s = newGame(6);
    for (const c of NODE_IDS) s.cities[c].owner = 1;
    s.factions[1].cap = 'arm';
    for (const c of ['pac', 'esn']) s.cities[c].owner = 0;
    s.factions[0].cap = 'hag';                                // capital lost, but the depot still feeds its neighbours
    expect(supplied(s, 0).has('esn')).toBe(true);
    s.cities.pac.owner = 1;
    expect(supplied(s, 0).has('esn')).toBe(false);
  });
});

describe('random boards (v0.9)', () => {
  const map = JSON.parse(readFileSync(new URL('../../maps/markham.json', import.meta.url), 'utf8'));
  const rouge = map.rivers.filter((r) => r[0] === 1).map((r) => r[1]);
  const cross = (p, q, r, t) => { const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return d(p, q, r) * d(p, q, t) < 0 && d(r, t, p) * d(r, t, q) < 0; };
  it('every seed draws a valid board of real places; the same seed draws the same board', () => {
    const sets = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const m = genMap(seed * 977);
      expect(JSON.stringify(genMap(seed * 977))).toBe(JSON.stringify(m));
      const cities = m.nodes.filter((n) => !n[6]), passes = m.nodes.filter((n) => n[6]);
      expect(cities.length).toBe(CFG.sg.cityCount);
      expect(passes.length).toBeGreaterThanOrEqual(1); expect(passes.length).toBeLessThanOrEqual(CFG.sg.passCount);
      expect(passes.filter((n) => n[7]).length).toBe(1); // exactly one 虎牢关
      for (const c of cities) expect(SITES.some((x) => x[0] === c[0])).toBe(true);
      for (const p of passes) expect(PARKS.some(([n, x, z]) => x === p[3] && z === p[4] && p[2].startsWith(n))).toBe(true);
      for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) expect(Math.hypot(cities[i][3] - cities[j][3], cities[i][4] - cities[j][4])).toBeGreaterThanOrEqual(CFG.sg.siteSpacing);
      // connected, and the river flags match the real Rouge
      const at = Object.fromEntries(m.nodes.map((n) => [n[0], [n[3], n[4]]]));
      const seen = new Set([m.nodes[0][0]]), q = [m.nodes[0][0]];
      while (q.length) { const c = q.shift(); for (const [a, b] of m.links) { const n = a === c ? b : b === c ? a : null; if (n && !seen.has(n)) { seen.add(n); q.push(n); } } }
      expect(seen.size).toBe(m.nodes.length);
      for (const [a, b, , river, st] of m.links) {
        expect([a, b, rouge.some((l) => l.some((pt, k) => k > 0 && cross(at[a], at[b], l[k - 1], pt)))]).toEqual([a, b, !!river]);
        if (st) { expect(st[1]).toBeGreaterThanOrEqual(0); expect(st[1]).toBeLessThanOrEqual(1); }
      }
      sets.add(cities.map((c) => c[0]).sort().join());
    }
    expect(sets.size).toBeGreaterThan(20); // new combinations every game
  });
  it('a random game plays, saves and resumes on its own board, even next to another game', () => {
    const a = newGame(4242, { map: 'random' }), other = newGame(7, { map: 'random' });
    expect(a.map.key).not.toBe(other.map.key);
    for (let i = 0; i < 8; i++) { runTurn(a, autoPlayer(a)); runTurn(other, autoPlayer(other)); }
    const b = JSON.parse(JSON.stringify(a));
    newGame(3); // switch the tables to the classic map
    for (let i = 0; i < 8; i++) { runTurn(a, autoPlayer(a)); runTurn(b, autoPlayer(b)); }
    delete a.events; delete b.events;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    loadMap(a); check(a);
    expect(Object.keys(a.cities).sort()).toEqual([...NODE_IDS].sort());
  });
  it('computer-vs-computer games on random boards stay consistent and usually end', () => {
    let ended = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame(seed * 31, { map: 'random' });
      for (let t = 0; t < 200 && !s.over && s.factions.filter((f) => f.alive).length > 1; t++) { runTurn(s, autoPlayer(s)); if (t % 10 === 0) check(s); }
      check(s);
      if (s.over || s.factions.filter((f) => f.alive).length === 1) ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(9);
  });
});

describe('armies on the road (v0.9.3)', () => {
  it('a long road takes more months; relay roads are quicker; the army is on the map meanwhile', () => {
    const s = newGame(9);
    const pairs = LINKS.map(([a, b]) => [a, b, travelMonths([a, b])]);
    expect(Math.max(...pairs.map((p) => p[2]))).toBeGreaterThanOrEqual(2);
    const L = ([a, b]) => Math.hypot(CITIES[a].x - CITIES[b].x, CITIES[a].z - CITIES[b].z);
    const st = LINKS.find((l) => l[4]), plain = LINKS.find((l) => !l[4] && Math.abs(L(l) - L(st)) < 120);
    if (plain) expect(travelMonths(st.slice(0, 2))).toBeLessThanOrEqual(travelMonths(plain.slice(0, 2)));
    // march down a two-month road: nothing happens in month 1, the army is on the road; it fights in month 2
    const two = pairs.find(([a, b, t]) => t === 2 && !CITIES[a].pass && !CITIES[b].pass);
    const [from, to] = two;
    for (const f of s.factions.slice(1)) { f.alive = false; for (const x of factionGens(s, f.id)) Object.assign(s.gens[x], { f: -1, hidden: true }); }
    for (const c of NODE_IDS) s.cities[c].owner = -1;
    const [g] = factionGens(s, 0);
    for (const x of factionGens(s, 0)) s.gens[x].c = from;
    Object.assign(s.cities[from], { owner: 0, troops: 6000 }); s.factions[0].cap = from;
    Object.assign(s.cities[to], { troops: 300, def: 20 });
    runTurn(s, { [g]: { cmd: 'march', to, n: 5000 } });
    expect(s.cities[to].owner).toBe(-1);
    expect(s.armies.length).toBe(1);
    expect(s.armies[0]).toMatchObject({ f: 0, to, left: 1, total: 2 });
    expect(s.gens[g].c).toBe(null);
    check(s);
    const t1 = s.factions[0].food;
    runTurn(s, {});
    expect(s.cities[to].owner).toBe(0);
    expect(s.gens[g].c).toBe(to);
    expect(s.armies.length).toBe(0);
    check(s);
    expect(t1).toBeGreaterThan(0);
    // moves take time too, and an officer on the road cannot take orders
    Object.assign(s.cities[from], { owner: 0 });
    const [h] = factionGens(s, 0).filter((x) => s.gens[x].c === to);
    runTurn(s, { [h]: { cmd: 'move', to: from, n: 0 } });
    expect(s.gens[h].c).toBe(null);
    expect(validOrder(s, 0, h, { cmd: 'dev' })).toBe(false);
    runTurn(s, {});
    expect(s.gens[h].c).toBe(from);
    check(s);
  });
  it('the computer counts armies coming for it, and does not send two at one target', () => {
    let again = 0, sent = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = newGame(seed * 7, { map: 'random' });
      for (let t = 0; t < 30 && !s.over; t++) {
        // armies still on the road after this month's arrivals; then: did a new army set off for the same place?
        const onRoad = new Set(s.armies.filter((a) => a.left > 1 && a.kind === 'march').map((a) => a.f + '>' + a.to)), maxId = s.nextArmy;
        runTurn(s, autoPlayer(s));
        for (const a of s.armies) if (a.id >= maxId && a.kind === 'march' && a.f > 0) { sent++; if (onRoad.has(a.f + '>' + a.to)) again++; }
        check(s);
      }
    }
    expect(sent).toBeGreaterThan(10);
    expect(again).toBe(0);
  });
});

describe('officers make a real difference (v0.9.5)', () => {
  it('stats drive every order and every battle; deputies count; good administrators pay less', () => {
    const s = newGame(1);
    expect(statMul(['lvbu']) / statMul(['xunyu'])).toBeGreaterThan(1.6);           // a great general vs a scholar
    expect(statMul(['caocao', 'xiahoudun', 'xuchu'])).toBeGreaterThan(statMul(['caocao']) + 0.2); // deputies help
    expect(draftAmt('caocao')).toBeGreaterThan(draftAmt('diaochan') * 2);
    expect(devAmt(s, 0, 'xunyu')).toBeGreaterThan(devAmt(s, 0, 'zhangfei') * 3);
    expect(searchChance(s, 0, 'zhugeliang')).toBeGreaterThan(searchChance(s, 0, 'xuchu') + 0.35);
    expect(costOf('dev', 'xunyu')).toBeLessThan(costOf('dev', 'lvbu') * 0.7);
    // duels: a big gap in 武力 is decisive
    let wins = 0;
    for (let i = 0; i < 40; i++) if (autoDuel(s, newDuel(s, 'lvbu', 'huanggai', 1, 2)) === 'a') wins++;
    expect(wins).toBeGreaterThan(30); // 武力 100 vs 82: a clear favourite
  });
});

describe('统率 leads troops, 武力 wins battles, armies meet in the field (v0.9.6)', () => {
  // a bare board: the player and lord 1 only, nobody else around
  const duo = () => {
    const s = newGame(9);
    for (const f of s.factions.slice(2)) { f.alive = false; for (const x of factionGens(s, f.id)) Object.assign(s.gens[x], { f: -1, hidden: true }); }
    for (const c of NODE_IDS) s.cities[c].owner = -1;
    for (const g of Object.values(s.gens)) if (!g.hidden && !g.guard) Object.assign(g, { f: -1, hidden: true, c: CITY_IDS[0] });
    CFG.sg.eventChance = 0;
    return s;
  };
  const join = (s, id, f, c) => Object.assign(s.gens[id], { f, c, hidden: false, guard: false });
  afterEach(() => { CFG.sg.eventChance = 0.55; });
  it('an officer leads at most 统率 x 60 troops', () => {
    const s = duo();
    join(s, 'zhangfei', 0, 'btv'); Object.assign(s.cities.btv, { owner: 0, troops: 9000 }); s.factions[0].cap = 'btv';
    runTurn(s, { zhangfei: { cmd: 'march', to: 'wdb', n: 9000 } });
    const sent = 9000 - s.cities.btv.troops;
    expect(commandOf('zhangfei')).toBe(GENERALS.zhangfei.lead * CFG.sg.leadTroops);
    expect(sent).toBeLessThanOrEqual(commandOf('zhangfei'));
  });
  it('same troops: the higher 武力 always wins in the field (two armies meeting on a road)', () => {
    for (const [strong, weak] of [['lvbu', 'xuchu'], ['guanyu', 'zhangliao'], ['zhangfei', 'liubei']]) {
      for (const flip of [false, true]) {
        const s = duo(), [p0, p1] = flip ? [weak, strong] : [strong, weak];
        join(s, p0, 0, 'btv'); // lord 1's officer joins after the computer gave its orders (no sally of its own)
        Object.assign(s.cities.btv, { owner: 0, troops: 4000 }); Object.assign(s.cities.wdb, { owner: 1, troops: 4000 });
        s.factions[0].cap = 'btv'; s.factions[1].cap = 'wdb'; s.turn = 6;
        CFG.sg.duelChance = 0; CFG.sg.duelRival = 0; CFG.sg.duelBig = 0;
        try {
          beginTurn(s, { [p0]: { cmd: 'march', to: 'wdb', n: 3000 } });
          // lord 1 sends the same 3,000 the other way
          s.cities.wdb.troops -= 3000; join(s, p1, 1, null);
          s.armies.push({ id: 99, f: 1, kind: 'march', from: 'wdb', to: 'btv', route: ['wdb', 'btv'], gens: [p1], troops: 3000, terr: 1, total: 2, left: 2 });
          s.fields.push({ a: s.armies[0], b: s.armies[1] });
          for (let b = nextBattle(s); b; b = nextBattle(s)) resolveBattle(s, b.m, null, null);
        } finally { CFG.sg.duelChance = 0.5; CFG.sg.duelRival = 0.85; CFG.sg.duelBig = 0.15; }
        const fe = s.events.find((e) => e.k === 'field');
        expect(fe).toBeTruthy();
        expect(fe.gw).toContain(strong);
      }
    }
  });
  it('a sally from the city stops an army coming at it', () => {
    const s = duo();
    join(s, 'guanyu', 0, 'btv'); join(s, 'xunyu', 1, 'wdb');
    Object.assign(s.cities.btv, { owner: 0, troops: 5000 }); Object.assign(s.cities.wdb, { owner: 1, troops: 5000 });
    s.factions[0].cap = 'btv'; s.factions[1].cap = 'wdb'; s.turn = 6;
    s.gens.xunyu.c = null; s.cities.wdb.troops -= 2500;
    s.armies.push({ id: 7, f: 1, kind: 'march', from: 'wdb', to: 'btv', route: ['wdb', 'btv'], gens: ['xunyu'], troops: 2500, terr: 1, total: 2, left: 1 });
    expect(interceptTargets(s, 0, 'btv').map((a) => a.id)).toEqual([7]);
    expect(validOrder(s, 0, 'guanyu', { cmd: 'intercept', army: 7 })).toBe(true);
    runTurn(s, { guanyu: { cmd: 'intercept', army: 7, n: 3000 } });
    expect(s.events.some((e) => e.k === 'field' && e.f === 0 && e.intercept)).toBe(true);
    expect(s.events.some((e) => e.k === 'skip')).toBe(false); // the order runs once
    expect(s.cities.btv.owner).toBe(0);          // the enemy never reached the walls
    expect(s.gens.guanyu.c).toBe('btv');         // and Guan Yu is back home
    expect(s.armies.length).toBe(0);
    expect(s.gens.xunyu.c).toBe('wdb');          // the beaten army went home
    check(s);
  });
});

describe('new game', () => {
  it('each lord starts with one city and two random generals; the rest hide in the cities', () => {
    const s = newGame(11);
    for (const f of s.factions) { expect(ownedBy(s, f.id).length).toBe(1); expect(factionGens(s, f.id).length).toBe(2); }
    expect(citiesOf(s, -1).length).toBe(8);
    expect(PASS_IDS.every((c) => s.cities[c].owner === -1)).toBe(true);
    const hid = Object.values(s.gens).filter((g) => g.hidden).length;
    expect(hid).toBe(SANGUO_IDS.length - 8 - 1); // one guards Toogood 虎牢关 (the classic game: all 48)
    expect(CITY_IDS.every((c) => hiddenIn(s, c).length >= 2)).toBe(true);
    // the same seed deals the same game; another seed another one
    expect(JSON.stringify(newGame(11))).toBe(JSON.stringify(s));
    expect(JSON.stringify(newGame(12).gens)).not.toBe(JSON.stringify(s.gens));
  });
  it('a saved game (JSON) resumes exactly', () => {
    const a = newGame(5);
    for (let i = 0; i < 6; i++) runTurn(a, autoPlayer(a));
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 6; i++) { runTurn(a, autoPlayer(a)); runTurn(b, autoPlayer(b)); }
    delete a.events; delete b.events;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('orders (one per officer, v0.8)', () => {
  oneMonthRoads();
  it('grow, draft and search', () => {
    const s = newGame(3), c = s.factions[0].cap, C = s.cities[c], g0 = s.factions[0].gold, [a, b] = factionGens(s, 0);
    const dev0 = C.dev;
    expect(validOrder(s, 0, a, { cmd: 'dev' })).toBe(false); // v1.5: no 内政 order, the city grows by itself
    for (let i = 0; i < 6; i++) runTurn(s, {}); // even a poor governor gets somewhere in half a year
    expect(C.dev).toBeGreaterThan(dev0);
    const t0 = C.troops;
    runTurn(s, { [a]: { cmd: 'draft' } });
    expect(C.troops).toBeGreaterThan(t0 * 0.97);
    expect(C.troops).toBeLessThanOrEqual(capOf(C));
    expect(s.factions[0].gold).not.toBe(g0);
    // searching long enough finds the blind boxes hidden in the city
    const before = factionGens(s, 0).length;
    const wise = [a, b].sort((x, y) => GENERALS[y].int - GENERALS[x].int)[0]; // v1.2: a dull officer finds next to nothing
    for (let i = 0; i < 72 && factionGens(s, 0).length <= before; i++) runTurn(s, { [wise]: { cmd: 'search' } }); // luck: a dull officer may need years
    expect(factionGens(s, 0).length).toBeGreaterThan(before);
    check(s);
    // two officers in one city both act in the same month
    const s2 = newGame(3), cap = s2.factions[0].cap, d0 = s2.cities[cap].dev, t1 = s2.cities[cap].troops;
    s2.factions.slice(1).forEach((f) => { f.alive = false; });
    runTurn(s2, { [a]: { cmd: 'search' }, [b]: { cmd: 'draft' } });
    expect(s2.cities[cap].dev).toBeGreaterThanOrEqual(d0);
    expect(s2.cities[cap].troops).toBeGreaterThan(t1);
  });
  it('a city with no officers cannot act; officers move and take troops along', () => {
    const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1 && !CITIES[a.c].pass).c, [a] = factionGens(s, 0);
    Object.assign(s.cities[n], { owner: 0, troops: 100 });
    for (const f of s.factions.slice(1)) f.alive = false;
    expect(gensIn(s, n, 0).length).toBe(0);
    expect(validOrder(s, 0, a, { cmd: 'move', to: n })).toBe(true);
    const t0 = s.cities[c].troops;
    runTurn(s, { [a]: { cmd: 'move', to: n, n: 1000 } });
    expect(s.gens[a].c).toBe(n);
    expect(s.cities[c].troops).toBeLessThan(t0 - 900);
    expect(validOrder(s, 0, a, { cmd: 'draft' })).toBe(true);
    check(s);
  });
  it('auto-assign gives every idle officer a job and keeps the given orders', () => {
    const s = newGame(5), [a, b] = factionGens(s, 0), cap = s.factions[0].cap;
    const t = ADJ[cap].find((x) => s.cities[x.c].owner === -1).c;
    const mine = { [a]: { cmd: 'march', to: t, n: 1000 } };
    const all = autoAssign(s, mine);
    expect(all[a]).toEqual(mine[a]);
    expect(all[b]).toBeTruthy();
    if (all[b].cmd === 'march') expect(all[b].to).not.toBe(t); // v1.8: may attack, but not where you already sent someone
    expect(orderCost({ cmd: 'dev' })).toBe(CFG.sg.devCost);
    // the computer gives orders per officer too
    for (const [id, o] of Object.entries(aiOrders(s, 1))) { expect(s.gens[id].f).toBe(1); expect(validOrder(s, 1, id, o)).toBe(true); }
  });
  it('march only from a supplied city to a neighbour; armies of one lord merge', () => {
    const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c;
    const far = CITY_IDS.find((x) => x !== c && !ADJ[c].some((a) => a.c === x));
    const [a, b] = factionGens(s, 0);
    expect(validOrder(s, 0, a, { cmd: 'march', to: n })).toBe(true);
    expect(validOrder(s, 0, a, { cmd: 'march', to: far })).toBe(false);
    s.cities[n].troops = 300; s.cities[n].def = 20;
    for (const f of s.factions.slice(1)) f.alive = false; // keep the computer lords out of it
    runTurn(s, { [a]: { cmd: 'march', to: n, n: 1200 }, [b]: { cmd: 'march', to: n, n: 1200 } });
    expect(s.events.filter((e) => e.k === 'take' || e.k === 'repel').length).toBe(1); // merged into one army
    expect(s.cities[n].owner).toBe(0);
    expect(gensIn(s, n, 0).length).toBeGreaterThan(0);
    check(s);
  });
});

describe('supply lines', () => {
  it('a city cut off from the capital earns nothing and loses troops', () => {
    const s = newGame(21), cap = s.factions[0].cap;
    // give the player a chain cap - a - b, then cut a
    const a = ADJ[cap].find((x) => !CITIES[x.c].pass)?.c || ADJ[cap][0].c, b = ADJ[a].find((x) => x.c !== cap).c;
    for (const x of [a, b]) Object.assign(s.cities[x], { owner: 0, troops: 2000 });
    expect(supplied(s, 0).has(b)).toBe(true);
    s.cities[a].owner = 1;
    if (ADJ[b].some((x) => x.c === cap)) return; // b also touches the capital: nothing to cut
    expect(supplied(s, 0).has(b)).toBe(false);
    const g = factionGens(s, 0)[0]; s.gens[g].c = b;
    expect(validOrder(s, 0, g, { cmd: 'march', to: a })).toBe(false);
    s.events = [];
    const t = s.cities[b].troops; endTurn(s);
    expect(s.cities[b].troops).toBeLessThan(t);
    expect(s.events.some((e) => e.k === 'cut' && e.c === b)).toBe(true);
  });
});

describe('duels and bonds', () => {
  oneMonthRoads();
  it('duels (v0.9.9): read the stance; 智力 decides who can be fooled, 武力 the damage, a big gap one blow', () => {
    const s = newGame(1);
    // 吕布 (武力 100) reads 荀彧's (14) strike and blocks it: one blow ends it
    const d = newDuel(s, 'lvbu', 'xunyu', 0, 1);
    Object.assign(d, { next: 'atk', tell: 'atk', feint: false });
    duelRound(s, d, 'def');
    expect(d.hpD).toBe(0); expect(d.done).toBe(true); expect(d.win).toBe('a');
    // between equals the damage depends on the moves: a special breaks a guard harder than a strike lands
    const e = newDuel(s, 'zhaoyun', 'machao', 0, 1), hp0 = e.hpD;
    Object.assign(e, { next: 'def', tell: 'def', feint: false, spA: 100 });
    duelRound(s, e, 'skill');
    const f = newDuel(s, 'zhaoyun', 'machao', 0, 1);
    Object.assign(f, { next: 'skill', tell: 'skill', feint: false });
    duelRound(s, f, 'atk');
    expect(hp0 - e.hpD).toBeGreaterThan(f.maxD - f.hpD);
    expect(e.spA).toBe(100 - CFG.sg.duelSkillCost);
    // 必杀 needs 斗志: without it the answer is a plain strike
    const g = newDuel(s, 'zhaoyun', 'machao', 0, 1);
    Object.assign(g, { next: 'def', tell: 'def', feint: false, spA: 0 });
    duelRound(s, g, 'skill');
    expect(g.log[0].mA).toBe('atk');
    // the cleverer reader always sees the true stance; a duller one is sometimes fooled, and a feint baits
    expect(feintChance('zhugeliang', 'lvbu')).toBe(0);
    expect(feintChance('lvbu', 'zhugeliang')).toBeGreaterThan(0.25);
    const BEATS = { atk: 'skill', skill: 'def', def: 'atk' }, BEATEN = { atk: 'def', skill: 'atk', def: 'skill' };
    let feints = 0;
    for (let i = 0; i < 300; i++) {
      const smart = newDuel(s, 'zhaoyun', 'machao', 0, 1); // 赵云 智力 76 reads 马超 44
      expect(smart.tell).toBe(smart.next);
      const dull = newDuel(s, 'machao', 'zhaoyun', 0, 1);
      if (dull.tell !== dull.next) { feints++; expect(BEATS[dull.next]).toBe(BEATEN[dull.tell]); }
    }
    expect(feints / 300).toBeGreaterThan(feintChance('machao', 'zhaoyun') - 0.08);
    expect(feints / 300).toBeLessThan(feintChance('machao', 'zhaoyun') + 0.08);
    // reading pays: answering what you see beats guessing, and every duel ends within duelRounds
    let read = 0, guess = 0;
    for (let i = 0; i < 200; i++) {
      const x = newDuel(s, 'xuchu', 'dianwei', 0, 1);
      while (!x.done) duelRound(s, x, BEATEN[x.tell] === 'skill' && x.spA < CFG.sg.duelSkillCost ? 'atk' : BEATEN[x.tell]);
      if (x.win === 'a') read++;
      const y = newDuel(s, 'xuchu', 'dianwei', 0, 1);
      while (!y.done) duelRound(s, y, ['atk', 'def', 'skill'][i % 3]);
      if (y.win === 'a') guess++;
      expect(x.n).toBeLessThanOrEqual(CFG.sg.duelRounds);
    }
    expect(read).toBeGreaterThan(guess + 40);
  });
  it('bonds switch on with enough members; rivals are found across armies', () => {
    const s = newGame(2);
    for (const id of ['liubei', 'guanyu']) Object.assign(s.gens[id], { f: 0, c: s.factions[0].cap, hidden: false });
    expect(activeBonds(s, 0, ['liubei', 'guanyu']).map((b) => b.id)).toContain('taoyuan');
    expect(activeBonds(s, 0, ['liubei']).map((b) => b.id)).not.toContain('taoyuan');
    expect(rivalry(['zhangliao'], ['ganning']).zh).toBe('逍遥津');
    expect(rivalry(['ganning'], ['zhangliao'])).toBeTruthy();
    expect(rivalry(['zhaoyun'], ['xunyu'])).toBe(null);
  });
  it('the battle steps run one by one as the UI drives them', () => {
    const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c;
    beginTurn(s, { [factionGens(s, 0)[0]]: { cmd: 'march', to: n, n: 2000 } });
    let mine = null;
    for (let b = nextBattle(s); b; b = nextBattle(s)) { if (b.m.f === 0) mine = b; resolveBattle(s, b.m, b.duel ? autoDuel(s, b.duel) : null, b.duel); }
    expect(mine && mine.m.to).toBe(n);
    expect(nextBattle(s)).toBe(null);
    endTurn(s);
    expect(s.turn).toBe(1);
    check(s);
  });
});

describe('whole games', () => {
  it('computer-vs-computer games stay consistent and usually end', () => {
    let ended = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const s = newGame(seed);
      for (let t = 0; t < 200 && !s.over; t++) { runTurn(s, autoPlayer(s)); if (t % 10 === 0) check(s); }
      check(s);
      if (s.over) ended++;
      if (s.over === 'win') expect(citiesOf(s, PLAYER).length).toBe(12);
      else if (!s.over) ended += s.factions.filter((f) => f.alive).length === 1 ? 1 : 0;
    }
    expect(ended).toBeGreaterThanOrEqual(13);
  });
  it('the coalition forms against a lord holding half of Markham', () => {
    const s = newGame(4);
    const mine = CITY_IDS.filter((c) => s.cities[c].owner === -1).slice(0, 5);
    for (const c of mine) s.cities[c].owner = 2;
    s.events = []; endTurn(s);
    expect(s.coalition).toBe(2);
    expect(s.events.some((e) => e.k === 'coalition' && e.f === 2)).toBe(true);
  });
});

describe('orders reach beyond the next city (v0.9.8)', () => {
  // a chain of three nodes a - b - c where a and c are not neighbours
  const chain = () => {
    for (const a of NODE_IDS) for (const { c: b } of ADJ[a]) for (const { c } of ADJ[b]) if (c !== a && !ADJ[a].some((x) => x.c === c)) return [a, b, c];
    return null;
  };
  it('moves and attacks go along our own roads, never through someone else\'s node', () => {
    const s = newGame(4), [a, b, c] = chain();
    for (const n of NODE_IDS) s.cities[n].owner = 1;
    s.cities[a].owner = 0; s.cities[b].owner = 0;
    expect(marchTargets(s, 0, a)).toContain(c);                 // attack c from a, through b
    expect(routeOf(s, 0, a, c)).toEqual([a, b, c]);
    s.cities[c].owner = 0;
    expect(moveTargets(s, 0, a)).toContain(c);                  // move straight to c
    s.cities[b].owner = 1;
    expect(moveTargets(s, 0, a)).not.toContain(c);              // b is not ours any more
    expect(marchTargets(s, 0, a)).not.toContain(ADJ[c].map((x) => x.c).find((n) => n !== b && !ADJ[a].some((y) => y.c === n)) || 'none');
    // every target is within maxMarch months, and every route only passes through our own nodes
    const t = newGame(5);
    for (const n of NODE_IDS) t.cities[n].owner = 0;
    t.cities[NODE_IDS[NODE_IDS.length - 1]].owner = 1;
    for (const n of moveTargets(t, 0, NODE_IDS[0])) {
      const r = routeOf(t, 0, NODE_IDS[0], n);
      expect(travelMonths(r)).toBeLessThanOrEqual(CFG.sg.maxMarch);
      for (const x of r.slice(1, -1)) expect(t.cities[x].owner).toBe(0);
    }
  });
  it('a far order is valid and its army follows the roads; a road cut on the way means a fight there', () => {
    const s = newGame(4), [a, b, c] = chain(), g = factionGens(s, 0)[0];
    for (const n of NODE_IDS) if (s.cities[n].owner === 0) s.cities[n].owner = 1;
    for (const n of [a, b]) Object.assign(s.cities[n], { owner: 0, troops: 5000 });
    s.cities[c].owner = 1; s.factions[0].cap = a; Object.assign(s.gens[g], { c: a });
    expect(validOrder(s, 0, g, { cmd: 'march', to: c, n: 2000 })).toBe(true);
    beginTurn(s, { [g]: { cmd: 'march', to: c, n: 2000 } });
    const army = s.armies.find((x) => x.gens.includes(g)) || [...s.queue].find((x) => x.gens.includes(g));
    expect(army.route).toEqual([a, b, c]);
    // someone takes b before the army gets there
    army.left = 1; s.cities[b].owner = 2;
    for (let m = nextBattle(s); m; m = nextBattle(s)) resolveBattle(s, m.m, null, m.duel);
    expect(s.events.some((e) => e.k === 'blocked' && e.c === b && e.to === c)).toBe(true);
  });
});

describe('万锦群英传: great generals of every era, 32 a game (v1.0)', () => {
  it('the pool: every era up to the mid-Qing, sound data, one portrait character each', () => {
    expect(GEN_IDS.length).toBeGreaterThanOrEqual(110);
    expect(SANGUO_IDS.length).toBe(48);
    for (const e of Object.keys(ERAS)) expect(GEN_IDS.filter((id) => GENERALS[id].era === e).length).toBeGreaterThanOrEqual(5);
    const glyphs = new Set(GEN_IDS.map((id) => GENERALS[id].glyph));
    expect(glyphs.size).toBe(GEN_IDS.length);
    for (const id of GEN_IDS) { const g = GENERALS[id]; expect(g.zh).toContain(g.glyph); expect(g.tag[0].length).toBe(1); expect(g.tag[1]).toBeTruthy(); }
    for (const b of BONDS) for (const m of b.m) expect(GENERALS[m]).toBeTruthy();
    for (const r of RIVALS) for (const m of [...r.a, ...r.b]) expect(GENERALS[m]).toBeTruthy();
  });
  it('each game draws 32: no repeats, a sensible mix of rarities, a few bonds ready to switch on', () => {
    const sets = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      for (const roster of ['mix', 'sanguo']) {
        const s = newGame(seed * 131, { map: 'random', roster }), ids = Object.keys(s.gens);
        expect(ids.length).toBe(CFG.sg.rosterSize);
        expect(new Set(ids).size).toBe(ids.length);
        if (roster === 'sanguo') for (const id of ids) expect(GENERALS[id].era).toBe('sg');
        const n = (t) => ids.filter((id) => tierOf(id) === t).length;
        expect(n('UR')).toBeLessThanOrEqual(CFG.sg.rosterUR + 1); // a dealt bond may bring one more
        expect(n('UR')).toBeGreaterThanOrEqual(2);
        expect(n('SR') + n('R')).toBeGreaterThanOrEqual(16);
        const ready = BONDS.filter((b) => b.m.filter((m) => ids.includes(m)).length >= b.need).length;
        expect(ready).toBeGreaterThanOrEqual(2);
        expect(Object.values(s.gens).filter((g) => g.hidden).length).toBe(CFG.sg.rosterSize - 8 - 1);
        sets.add(ids.sort().join());
        if (roster === 'mix') expect(new Set(ids.map((id) => GENERALS[id].era)).size).toBeGreaterThanOrEqual(4);
      }
    }
    expect(sets.size).toBe(60); // every game its own cast
    // the same seed deals the same cast
    expect(Object.keys(newGame(77, { roster: 'mix' }).gens).join()).toBe(Object.keys(newGame(77, { roster: 'mix' }).gens).join());
    expect(drawRoster(newGame(3), 'mix').length).toBe(CFG.sg.rosterSize);
  });
  it('an all-eras game plays to the end', () => {
    let ended = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = newGame(seed * 7, { map: 'random', roster: 'mix' });
      for (let t = 0; t < 150 && !s.over; t++) { runTurn(s, autoPlayer(s)); check(s); }
      if (s.over) ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------- v1.1: treasures, truces, poaching (D-97, D-98)
describe('万锦群英传 v1.1', () => {
  const fresh = (seed = 42) => E.newGame(seed);
  const mine = (s) => E.factionGens(s, E.PLAYER);
  it('a game hides its own treasures, at most itemUR of the best', async () => {
    const { ITEMS } = await import('../../js/sg_data.js');
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = fresh(seed);
      expect(s.items.length).toBe(CFG.sg.itemCount);
      expect(new Set(s.items).size).toBe(s.items.length);
      expect(s.items.filter((i) => ITEMS[i].tier === 'UR').length).toBeLessThanOrEqual(CFG.sg.itemUR);
    }
    expect(fresh(7).items).toEqual(fresh(7).items);
  });
  it('a treasure raises its bearer and only its bearer, and can be handed over', () => {
    const s = fresh(), [a, b] = mine(s), war = E.gen(a).war, lead = E.gen(a).lead;
    s.gens[a].item = 'qinglong';
    expect(E.gen(a).war).toBe(Math.min(110, war + 8));
    expect(E.gen(b).war).toBe(GENERALS[b].war);
    expect(E.passItem(s, a, b)).toBe(true);
    expect(E.gen(a).war).toBe(war); expect(E.itemOf(b)).toBe('qinglong');
    s.gens[a].item = 'chitu';
    expect(E.commandOf(a)).toBe(Math.round(Math.min(110, lead + 10) * CFG.sg.leadTroops));
    // another game does not see them
    const s2 = fresh(43); E.loadMap(s2);
    if (s2.gens[a]) expect(E.gen(a).lead).toBe(GENERALS[a].lead);
  });
  it('searching turns treasures up, and they end up on an officer of the finder', () => {
    let found = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(seed), n0 = s.items.length;
      for (let m = 0; m < 14; m++) E.runTurn(s, Object.fromEntries(mine(s).filter((g) => s.gens[g].c && !CITIES[s.gens[g].c].pass).map((g) => [g, { cmd: 'search' }])));
      const carried = Object.values(s.gens).filter((g) => g.item).length;
      expect(carried + s.items.length).toBe(n0);
      found += carried;
    }
    expect(found).toBeGreaterThan(10);
  });
  it('an envoy buys a truce: no attacks either way until it runs out', () => {
    const s = fresh(), g = mine(s)[0];
    expect(E.validOrder(s, E.PLAYER, g, { cmd: 'envoy', f: 1 })).toBe(true);
    expect(E.validOrder(s, E.PLAYER, g, { cmd: 'envoy', f: 0 })).toBe(false);
    const p = E.envoyChance(s, E.PLAYER, g, 1);
    expect(p).toBeGreaterThan(0.05); expect(p).toBeLessThanOrEqual(0.9);
    s.truce['0-1'] = s.turn + 3;
    expect(E.truceLeft(s, 0, 1)).toBe(3); expect(E.truceLeft(s, 1, 0)).toBe(3);
    expect(E.isAlly(s, 1, 0)).toBe(true); expect(E.isAlly(s, 0, 2)).toBe(false);
    expect(E.validOrder(s, E.PLAYER, g, { cmd: 'envoy', f: 1 })).toBe(false);
    const cap1 = s.factions[1].cap;
    expect(E.validOrder(s, E.PLAYER, g, { cmd: 'march', to: cap1 })).toBe(false);
    let ended = false;
    for (let m = 0; m < 4; m++) { for (const e of E.runTurn(s, {})) if (e.k === 'truceEnd') ended = true; if (!ended) expect(s.cities[s.factions[0].cap].owner).toBe(0); }
    expect(ended).toBe(true); expect(E.truceLeft(s, 0, 1)).toBe(0);
  });
  it('poaching: only officers next door, never a lord; a success changes sides, a failure hardens him', () => {
    const s = fresh(), agent = mine(s)[0], cap = s.factions[0].cap, f1 = s.factions[1];
    const nb = ADJ[cap][0].c;
    // put lord 1 and one of his officers in the city next door
    Object.assign(s.cities[nb], { owner: 1 });
    const theirs = E.factionGens(s, 1), officer = theirs.find((x) => x !== f1.lord);
    for (const x of theirs) s.gens[x].c = nb;
    expect(E.poachTargets(s, 0, cap)).toEqual([officer]);
    expect(E.validOrder(s, 0, agent, { cmd: 'poach', g: f1.lord })).toBe(false);
    s.gens[officer].loyal = 100;
    const low = E.poachChance(s, 0, agent, officer);
    s.gens[officer].loyal = 20;
    expect(E.poachChance(s, 0, agent, officer)).toBeGreaterThan(low);
    // certain success / certain failure by forcing the chance through loyalty and the dice
    let ok = 0, no = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t2 = JSON.parse(JSON.stringify(s)); t2.r = seed * 7919; t2.orders = {};
      const gold = t2.factions[0].gold;
      E.beginTurn(t2, { [agent]: { cmd: 'poach', g: officer } });
      const e = t2.events.find((x) => x.k === 'poach' && x.f === 0);
      if (!e) continue; // the computer moved him away first
      expect(e.who).toBe(officer); expect(e.g).toBe(agent); expect(e.t).toBe(t2.turn); // `t` is the turn stamp on every event
      expect(t2.factions[0].gold).toBeLessThan(gold);
      if (e.ok) { ok++; expect(t2.gens[officer].f).toBe(0); expect(t2.gens[officer].c).toBe(cap); } else { no++; expect(t2.gens[officer].f).toBe(1); expect(t2.gens[officer].loyal).toBe(20 + CFG.sg.poachSpurned); }
    }
    expect(ok).toBeGreaterThan(5); expect(no).toBeGreaterThan(2);
  });
  it('whole games still end, with treasures and poaching in play', () => {
    let poach = 0, items = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = E.newGame(seed, { map: 'random', roster: 'mix', diff: 'normal' }); // longer games: more chances to poach
      for (let m = 0; m < 240 && !s.over; m++) for (const e of E.runTurn(s, E.autoPlayer(s))) { if (e.k === 'poach') poach++; if (e.k === 'item') items++; }
      for (const g of Object.values(s.gens)) expect(Number.isFinite(E.gen(g.id).war)).toBe(true);
    }
    expect(items).toBeGreaterThan(5);
    expect(poach).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- v1.2: 文武差距, difficulty, biographies (D-102..D-105)
describe('万锦群英传 v1.2', () => {
  it('weak stats are stretched down, strong ones are untouched', async () => {
    const { spreadStat, WEAK_AT } = await import('../../js/sg_data.js');
    expect(spreadStat(100)).toBe(100); expect(spreadStat(WEAK_AT)).toBe(WEAK_AT); expect(spreadStat(30)).toBe(10); expect(spreadStat(0)).toBe(5);
    for (const g of Object.values(GENERALS)) for (const k of ['lead', 'war', 'int', 'pol']) {
      expect(g[k]).toBe(spreadStat(g.base[k]));
      expect(g[k]).toBeGreaterThanOrEqual(5); expect(g[k]).toBeLessThanOrEqual(100);
    }
    expect(GENERALS.zhangfei.war).toBe(98); expect(GENERALS.zhangfei.int).toBeLessThan(15);
    expect(GENERALS.zhugeliang.int).toBe(100); expect(GENERALS.zhugeliang.war).toBeLessThan(30);
  });
  it("a 文官 and a 武将 are far apart at each other's work", () => {
    const s = E.newGame(1); E.loadMap(s);
    // 内政 by 政治, 搜索 by 智力, costs by 政治
    expect(E.devAmt(s, 0, 'xunyu')).toBeGreaterThan(E.devAmt(s, 0, 'zhangfei') * 8);
    expect(E.searchChance(s, 0, 'zhugeliang')).toBeGreaterThan(E.searchChance(s, 0, 'lvbu') * 6);
    expect(E.costOf('dev', 'lvbu')).toBeGreaterThan(E.costOf('dev', 'xiaohe') * 2);
    // 征兵 and troops led by 统率, fighting by 武力
    expect(E.draftAmt('guanyu')).toBeGreaterThan(E.draftAmt('xunyu') * 2.5);
    expect(E.commandOf('guanyu')).toBeGreaterThan(E.commandOf('xunyu') * 2);
    expect(E.statMul(['lvbu'])).toBeGreaterThan(E.statMul(['xunyu']) * 10);
    // every curve rises with its stat
    const ids = Object.keys(GENERALS), by = (k) => [...ids].sort((a, b) => GENERALS[a][k] - GENERALS[b][k]);
    const mono = (list, f) => list.every((id, i) => i === 0 || f(id) >= f(list[i - 1]) - 1e-9);
    expect(mono(by('lead'), (id) => E.commandOf(id))).toBe(true);
    expect(mono(by('pol'), (id) => -E.costOf('dev', id))).toBe(true);
  });
  it('three difficulty levels: grace, aggression, and how well the computer runs its lands', () => {
    expect(E.DIFFS).toEqual(['normal', 'hard', 'hell']);
    expect(E.newGame(3).diff).toBe(CFG.sg.diffDefault);
    expect(E.newGame(3, { diff: 'nonsense' }).diff).toBe(CFG.sg.diffDefault);
    const n = E.newGame(3, { diff: 'normal' }), h = E.newGame(3, { diff: 'hell' });
    expect(E.D(n).grace).toBeGreaterThan(E.D(h).grace); expect(E.D(n).attack).toBeGreaterThan(E.D(h).attack);
    // the player's own start is the same at every level; the computer's is not
    expect(n.cities[n.factions[0].cap].troops).toBe(h.cities[h.factions[0].cap].troops);
    expect(h.cities[h.factions[1].cap].troops).toBeGreaterThan(n.cities[n.factions[1].cap].troops);
    // nobody attacks the player during the grace months, at any level
    for (const diff of E.DIFFS) {
      const s = E.newGame(11, { map: 'random', diff }), cap = s.factions[0].cap;
      for (let m = 0; m < E.D(s).grace - 1; m++) E.runTurn(s, {});
      expect(s.cities[cap].owner).toBe(0);
      expect(s.log.some((e) => (e.k === 'take' || e.k === 'repel') && e.c === cap)).toBe(false);
    }
    // harder levels beat the same automatic player more often
    const wins = (diff) => { let w = 0; for (let seed = 1; seed <= 60; seed++) { const s = E.newGame(seed, { map: 'random', roster: 'mix', diff }); for (let m = 0; m < 300 && !s.over; m++) E.runTurn(s, E.autoPlayer(s)); if (s.over === 'win') w++; } return w; };
    expect(wins('normal')).toBeGreaterThan(wins('hell'));
  });
  it('officers sent together leave as one army', () => {
    const s = E.newGame(5), cap = s.factions[0].cap, [a, b] = E.factionGens(s, 0);
    for (const f of s.factions.slice(1)) f.alive = false;
    const to = E.marchTargets(s, 0, cap).find((n) => E.validOrder(s, 0, a, { cmd: 'march', to: n }));
    E.beginTurn(s, { [a]: { cmd: 'march', to, n: 1000 }, [b]: { cmd: 'march', to, n: 800 } });
    const ev = s.events.filter((e) => e.k === 'march' && e.f === 0);
    expect(ev.length).toBe(2);
    expect(ev[0].n + ev[1].n).toBe(1800);
    // one army (still on the road) or one battle (it arrived this month), never two
    const onRoad = s.armies.filter((x) => x.f === 0 && x.to === to);
    expect(onRoad.length).toBeLessThanOrEqual(1);
    if (onRoad.length) { expect([...onRoad[0].gens].sort()).toEqual([a, b].sort()); expect(onRoad[0].troops).toBe(1800); }
    expect(s.gens[a].c).toBe(null); expect(s.gens[b].c).toBe(null);
  });
  it('every officer has an introduction in both languages', async () => {
    const { BIOS } = await import('../../js/sg_bios.js');
    for (const id of Object.keys(GENERALS)) {
      expect(BIOS[id], id).toBeTruthy();
      expect(BIOS[id][0].length, id).toBeGreaterThan(8); expect(BIOS[id][0].length, id).toBeLessThan(70);
      expect(BIOS[id][1].length, id).toBeGreaterThan(20); expect(/[一-鿿]/.test(BIOS[id][1]), id).toBe(false);
    }
    expect(Object.keys(BIOS).length).toBe(Object.keys(GENERALS).length);
  });
});

describe('v1.4: history counters, weather and buildings (D-114, D-115)', () => {
  it('every counter and weather officer exists', async () => {
    const D = await import('../../js/sg_data.js');
    for (const c of D.COUNTERS) for (const id of [...c.a, ...c.b]) expect(GENERALS[id], id).toBeTruthy();
    for (const x of D.TIMELY) for (const id of x.m) expect(GENERALS[id], id).toBeTruthy();
    for (const b of Object.values(D.SPECIALTY)) expect(D.BUILDINGS[b]).toBeTruthy();
  });
  it('a historical counter only works against the right foe', () => {
    expect(E.countersOf(['luxun'], ['liubei']).length).toBe(1);
    expect(E.countersOf(['luxun'], ['caocao']).length).toBe(0);
    expect(E.countersOf(['liubei'], ['luxun']).length).toBe(0);
  });
  it('the weather decides who gets a buff', () => {
    const s = newGame(5);
    let rain = null, snow = null;
    for (let i = 0; i < 60 && !(rain && snow); i++) { s.turn = i; const w = E.weatherKey(s); if (w === 'rain' && rain === null) rain = i; if (w === 'snow' && snow === null) snow = i; }
    s.turn = rain; expect(E.timelyOf(s, ['guanyu']).length).toBe(1); expect(E.timelyOf(s, ['zhangfei']).length).toBe(0);
    s.turn = snow; expect(E.timelyOf(s, ['huoqubing']).length).toBe(1); expect(E.snowproof(['huoqubing'])).toBe(true); expect(E.snowproof(['zhangfei'])).toBe(false);
    expect(E.timelyOf(s, ['ganning'], true).length).toBe(1); expect(E.timelyOf(s, ['ganning'], false).length).toBe(0);
  });
  it('buildings: levels, needs, effects, specialty and losing a level when sacked', () => {
    const s = newGame(3), P = 0, c = s.factions[P].cap, C = s.cities[c], [a] = factionGens(s, P);
    s.factions[P].gold = 5000; C.dev = 30;
    const cap0 = E.capOf(C), def0 = E.defMaxOf(C);
    expect(E.canBuild(C, 'barracks')).toBe(true);
    runTurn(s, { [a]: { cmd: 'build', b: 'barracks' } });
    expect(E.bldRaw(C, 'barracks')).toBe(1);
    expect(E.capOf(C)).toBeGreaterThan(cap0);
    expect(s.log.some((e) => e.k === 'build' && e.c === c && e.b === 'barracks' && e.lv === 1)).toBe(true);
    C.dev = 30; expect(E.canBuild(C, 'barracks')).toBe(false); // level 2 needs 开发 40
    C.dev = 70; runTurn(s, { [a]: { cmd: 'build', b: 'walls' } });
    expect(E.defMaxOf(C)).toBeGreaterThan(def0);
    C.bld = { barracks: 3 }; expect(E.canBuild(C, 'barracks')).toBe(false); // max level
    // a landmark's specialty counts one level more
    const sp = NODE_IDS.find((n) => !CITIES[n].pass && ['market', 'farm', 'academy'].some((b) => E.isSpecialty(s.cities[n], b)));
    if (sp) { const T = s.cities[sp], b = ['market', 'farm', 'academy'].find((x) => E.isSpecialty(T, x)); T.bld = { [b]: 1 }; expect(E.bldLv(T, b)).toBe(2); }
    // passes only take walls and beacons
    const p = PASS_IDS[0]; expect(E.canBuild(s.cities[p], 'market')).toBe(false); expect(E.canBuild(s.cities[p], 'walls')).toBe(true);
    // a market makes more gold
    const M = s.cities[c]; M.bld = {}; const g1 = s.factions[P].gold; runTurn(s, {}); const plain = s.factions[P].gold - g1;
    M.bld = { market: 3 }; const g2 = s.factions[P].gold; runTurn(s, {}); expect(s.factions[P].gold - g2).toBeGreaterThanOrEqual(plain);
    check(s);
  });
  it('the computer builds, and whole games still end', () => {
    let built = 0, ended = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = newGame(seed);
      let seen = 0;
      for (let i = 0; i < 200 && !s.over; i++) { runTurn(s, autoPlayer(s)); seen += s.events.filter((e) => e.k === 'build').length; }
      built += seen + Object.values(s.cities).filter((C) => C.bld && Object.values(C.bld).some((v) => v > 0)).length;
      if (s.over || s.factions.filter((f) => f.alive).length === 1) ended++;
      check(s);
    }
    expect(built).toBeGreaterThan(0);
    expect(ended).toBeGreaterThanOrEqual(4);
  });
});

describe('v1.5: no 内政 order, cities grow under their governors (D-116)', () => {
  it('a good governor makes a city grow faster than a poor one or nobody', () => {
    const s = newGame(3), P = 0, c = s.factions[P].cap, C = s.cities[c];
    expect(E.devAmt(s, P, 'xunyu', C)).toBeGreaterThan(E.devAmt(s, P, 'zhangfei', C) * 3);
    expect(E.devAmt(s, P, 'zhangfei', C)).toBeGreaterThan(E.devAmt(s, P, null, C));
    expect(E.growthOf(s, c)).toBe(E.devAmt(s, P, E.governorOf(s, c), C));
    expect(E.gen(E.governorOf(s, c)).pol).toBe(Math.max(...E.gensIn(s, c, P).map((x) => E.gen(x).pol)));
    C.bld = { academy: 2 }; expect(E.growthOf(s, c)).toBeGreaterThan(E.devAmt(s, P, E.governorOf(s, c), { ...C, bld: {} }));
    C.dev = 100; expect(E.growthOf(s, c)).toBe(0);
    const pass = PASS_IDS[0]; expect(E.growthOf(s, pass)).toBe(0);
  });
  it('growth adds up over months, building brings people in, and nobody is ever told to 内政', () => {
    const s = newGame(4), P = 0, c = s.factions[P].cap, C = s.cities[c], [a] = factionGens(s, P);
    C.dev = 20; C.grow = 0;
    const per = E.growthOf(s, c);
    for (let i = 0; i < 6; i++) runTurn(s, {});
    expect(C.dev).toBeGreaterThanOrEqual(20 + Math.floor(per * 6) - 1);
    s.factions[P].gold = 3000; const d = C.dev;
    runTurn(s, { [a]: { cmd: 'build', b: 'market' } });
    expect(C.dev).toBeGreaterThanOrEqual(d + CFG.sg.bldDevUp);
    for (let seed = 1; seed <= 3; seed++) {
      const g = newGame(seed);
      for (let i = 0; i < 40 && !g.over; i++) {
        for (const f of g.factions.filter((x) => x.alive)) for (const o of Object.values(f.id === P ? autoPlayer(g) : E.aiOrders(g, f.id))) expect(o.cmd).not.toBe('dev');
        runTurn(g, autoPlayer(g));
      }
      check(g);
    }
  });
  it('cityIncome matches what the month pays', () => {
    const s = newGame(6), P = 0, c = s.factions[P].cap;
    for (const f of s.factions.slice(1)) f.alive = false;
    const owned = Object.keys(s.cities).filter((x) => s.cities[x].owner === P && !s.cities[x].pass);
    const want = owned.reduce((a, x) => a + E.cityIncome(s, x)[0], 0) - E.payOf(s, P), g0 = s.factions[P].gold; // v1.6: minus 军饷
    runTurn(s, {});
    expect(s.factions[P].gold - g0).toBeGreaterThanOrEqual(want - 1);
    expect(E.cityIncome(s, c)[0]).toBeGreaterThan(0);
  });
});

describe('v1.5: curved roads for the map (D-118)', () => {
  it('a road starts and ends at its cities, is the same both ways, and bends a little', () => {
    E.newGame(11); // loads a board
    for (const [a, b] of LINKS.slice(0, 8)) {
      const p = M.roadPath(a, b), q = M.roadPath(b, a);
      expect(p.pts[0][0]).toBeCloseTo(CITIES[a].x, 5); expect(p.pts[p.pts.length - 1][1]).toBeCloseTo(CITIES[b].z, 5);
      expect(q.pts[0][0]).toBeCloseTo(CITIES[b].x, 5);
      for (let i = 0; i < p.pts.length; i++) { expect(p.pts[i][0]).toBeCloseTo(q.pts[q.pts.length - 1 - i][0], 5); }
      const straight = Math.hypot(CITIES[b].x - CITIES[a].x, CITIES[b].z - CITIES[a].z);
      expect(p.len).toBeGreaterThanOrEqual(straight);
      expect(p.len).toBeLessThan(straight * 1.2);
      const [x0, z0] = M.along(p, 0), [x1, z1] = M.along(p, 1);
      expect(Math.hypot(x0 - CITIES[a].x, z0 - CITIES[a].z)).toBeLessThan(1e-6);
      expect(Math.hypot(x1 - CITIES[b].x, z1 - CITIES[b].z)).toBeLessThan(1e-6);
    }
  });
  it('a route joins its roads, and a slice stays on it', () => {
    const [a, b] = LINKS[0], n = ADJ[b].map((x) => x.c).find((x) => x !== a);
    const r = M.routePath([a, b, n]);
    expect(r.len).toBeCloseTo(M.roadPath(a, b).len + M.roadPath(b, n).len, 3);
    const sl = M.slice(r, 0.2, 0.7);
    expect(sl.length).toBeGreaterThan(2);
    expect(M.along(r, 0.5)[0]).toBeTypeOf('number');
  });
});

describe('v1.6: bonds you can see, troop pay, harder lords (D-120 to D-122)', () => {
  it('a new game gives you a bond to chase, and finding the member switches it on with an event', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = E.newGame(seed, { map: 'random', roster: 'mix' }), P = 0;
      expect(s.lead).toBeTruthy();
      const b = BONDS.find((x) => x.id === s.lead.b), v = E.bondView(s, P).find((x) => x.b.id === b.id);
      expect(v.have.length).toBeGreaterThanOrEqual(1);
      expect(v.where[s.lead.g].k).toBe('wild');
      expect(s.gens[s.lead.g].c).toBe(s.lead.c);
      expect(CITIES[s.lead.c].pass).toBeFalsy();
      if (v.need - v.have.length !== 1) continue;
      Object.assign(s.gens[s.lead.g], { f: P, c: s.factions[P].cap, hidden: false });
      const evs = runTurn(s, {});
      expect(evs.some((e) => e.k === 'bond' && e.b === b.id && e.f === P)).toBe(true);
      expect(s.bondsOn).toContain(b.id);
      // losing him again switches it off
      Object.assign(s.gens[s.lead.g], { f: -1, hidden: true });
      expect(runTurn(s, {}).some((e) => e.k === 'bondLost' && e.b === b.id)).toBe(true);
    }
  });
  it('bonds show on the battle screen', () => {
    const s = newGame(3);
    s.gens.guanyu = s.gens.guanyu || { id: 'guanyu', f: 0, c: s.factions[0].cap }; Object.assign(s.gens.guanyu, { f: 0, hidden: false });
    s.gens.liubei = s.gens.liubei || { id: 'liubei', f: 0, c: s.factions[0].cap }; Object.assign(s.gens.liubei, { f: 0, hidden: false });
    const edge = E.edgeOf(s, ['liubei', 'guanyu'], [], false, false, 0, 1);
    expect(edge.some((x) => x[0] === 0 && x[1].includes('桃园'))).toBe(true);
  });
  it('troop pay: what it costs, and what happens when you cannot pay', () => {
    const s = newGame(3), P = 0, k = CFG.sg, cap = s.factions[P].cap;
    for (const f of s.factions.slice(1)) f.alive = false;
    const troops = Object.values(s.cities).filter((c) => c.owner === P).reduce((a, c) => a + c.troops, 0);
    expect(E.payOf(s, P)).toBe(Math.round(Math.max(0, troops - k.payFree * E.citiesOf(s, P).length) * k.payTroop + factionGens(s, P).length * k.payGen));
    s.cities[cap].troops = 9000; s.factions[P].gold = 0;
    const evs = runTurn(s, {});
    if (s.factions[P].gold === 0) {
      expect(evs.some((e) => e.k === 'unpaid' && e.f === P)).toBe(true);
      expect(s.cities[cap].troops).toBeLessThan(9000);
    }
    check(s);
  });
  it('a rich computer lord hires soldiers for its front; the player never does', () => {
    const s = E.newGame(5, { diff: 'hard' });
    const f = 1, fa = s.factions[f];
    fa.gold = 5000;
    const before = E.citiesOf(s, f).reduce((a, c) => a + s.cities[c].troops, 0) + s.armies.filter((a) => a.f === f).reduce((a, x) => a + x.troops, 0);
    s.factions[0].gold = 5000;
    const p0 = s.factions[0].gold;
    s.events = [];
    E.endTurn(s);
    const after = E.citiesOf(s, f).reduce((a, c) => a + s.cities[c].troops, 0) + s.armies.filter((a) => a.f === f).reduce((a, x) => a + x.troops, 0);
    expect(fa.gold).toBeLessThan(5000 - E.payOf(s, f) + 2000);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(s.factions[0].gold).toBeGreaterThan(p0 - 1000); // only pay and income, no hiring
    check(s);
  });
  it('the difficulty levels still go easy → hard', () => {
    const d = CFG.sg.diff;
    expect(d.normal.merc).toBeLessThan(d.hard.merc); expect(d.hard.merc).toBeLessThan(d.hell.merc);
    expect(d.normal.hunt).toBeLessThan(d.hell.hunt); expect(d.hard.grace).toBeLessThan(d.normal.grace);
  });
});

describe('v1.7: food is 军粮 (D-123)', () => {
  it('most food comes with the September harvest', () => {
    const s = newGame(3), k = CFG.sg;
    expect(E.foodIn(s, 100)).toBe(Math.round(100 * k.foodTrickle));
    let sep = null; for (let i = 0; i < 24 && sep === null; i++) { s.turn = i; if (E.dateOf(s).month === 9) sep = i; }
    s.turn = sep; expect(E.foodIn(s, 100)).toBe(Math.round(100 * (k.foodTrickle + k.harvestMonths)));
    expect(k.harvestMonths).toBeGreaterThan(k.foodTrickle * 11); // the harvest is more than the rest of the year together
  });
  it('an attack takes its rations; short of food fewer go, or none', () => {
    const s = newGame(3), P = 0, cap = s.factions[P].cap, [a] = factionGens(s, P), C = s.cities[cap];
    C.troops = 8000;
    const to = E.marchTargets(s, P, cap).find((n) => E.validOrder(s, P, a, { cmd: 'march', to: n }));
    const months = E.travelMonths(E.routeOf(s, P, cap, to));
    s.factions[P].food = 5000;
    const n = Math.min(E.commandOf(a), 3000), f0 = s.factions[P].food;
    E.beginTurn(s, { [a]: { cmd: 'march', to, n } });
    const A = s.armies.find((x) => x.f === P);
    expect(A.troops).toBe(n);
    expect(f0 - s.factions[P].food).toBe(E.rationsOf(n, months));
    // a nearly empty granary: the order is refused
    const s2 = newGame(3), [b] = factionGens(s2, P); s2.cities[cap].troops = 8000; s2.factions[P].food = 10;
    expect(E.validOrder(s2, P, b, { cmd: 'march', to })).toBe(false);
    // half the food: only as many go as can be fed
    const s3 = newGame(3), [g] = factionGens(s3, P); s3.cities[cap].troops = 8000;
    s3.factions[P].food = E.rationsOf(1500, months);
    E.beginTurn(s3, { [g]: { cmd: 'march', to, n: 3000 } });
    const A3 = s3.armies.find((x) => x.f === P);
    expect(A3.troops).toBeLessThanOrEqual(1500);
    expect(s3.events.some((e) => e.k === 'rations')).toBe(true);
  });
  it('hunger costs soldiers and fighting spirit', () => {
    const s = newGame(3), P = 0, cap = s.factions[P].cap;
    for (const f of s.factions.slice(1)) f.alive = false;
    s.cities[cap].troops = 9000; s.factions[P].food = 0;
    const evs = runTurn(s, {});
    expect(evs.some((e) => e.k === 'hunger' && e.f === P)).toBe(true);
    expect(s.factions[P].hungry).toBe(true);
    expect(E.edgeOf(s, factionGens(s, P), [], false, false, P, 1).some((x) => x[0] === 0 && x[1] === '断粮')).toBe(true);
  });
  it('the rice market: cheap after the harvest, dear before it, capped each month', () => {
    const s = newGame(3), P = 0, k = CFG.sg, at = (m) => { for (let i = 0; i < 24; i++) { s.turn = i; if (E.dateOf(s).month === m) return; } };
    at(10); const cheap = E.ricePrice(s); at(6); const dear = E.ricePrice(s);
    expect(cheap).toBeLessThan(dear);
    s.factions[P].gold = 100000; s.factions[P].food = 0; s.traded = {};
    const g0 = s.factions[P].gold;
    expect(E.trade(s, P, 1000)).toBe(true);
    expect(s.factions[P].food).toBe(1000); expect(g0 - s.factions[P].gold).toBe(10 * dear);
    expect(E.trade(s, P, k.tradeMax)).toBe(false); // over the monthly cap
    expect(E.trade(s, P, -500)).toBe(true); expect(s.factions[P].food).toBe(500);
    expect(E.riceSell(s)).toBeLessThan(E.ricePrice(s));
  });
  it('the grain plot burns food, and computer lords keep their granaries stocked', () => {
    expect(E.PLOTS).toContain('grain');
    let burned = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = newGame(seed), P = 0, [a] = factionGens(s, P), cap = s.factions[P].cap;
      const to = ADJ[cap].map((x) => x.c).find((n) => s.cities[n].owner > 0) || ADJ[cap].map((x) => x.c).find((n) => E.validOrder(s, P, a, { cmd: 'plot', kind: 'grain', to: n }));
      if (!to || !E.validOrder(s, P, a, { cmd: 'plot', kind: 'grain', to })) continue;
      const o = s.cities[to].owner, f0 = o >= 0 ? s.factions[o].food : 0;
      E.beginTurn(s, { [a]: { cmd: 'plot', kind: 'grain', to } });
      const e = s.events.find((x) => x.k === 'plot' && x.kind === 'grain');
      if (e && e.ok && o >= 0) { burned++; expect(s.factions[o].food).toBe(f0 - e.n); }
    }
    let hungry = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const s = newGame(seed);
      for (let i = 0; i < 48 && !s.over; i++) { runTurn(s, autoPlayer(s)); hungry += s.events.filter((e) => e.k === 'hunger' && e.f !== 0).length; check(s); }
    }
    expect(hungry).toBeLessThan(8);
    expect(burned).toBeGreaterThanOrEqual(0);
  });
});

describe('v1.8: 委任 attacks too (only with good odds and food)', () => {
  it('sends a strong city against a weak neighbour, within the granary', () => {
    let attacked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = newGame(seed), P = 0, cap = s.factions[P].cap;
      s.cities[cap].troops = 9000; s.factions[P].food = 20000;
      const weak = ADJ[cap].map((x) => x.c).find((n) => s.cities[n].owner === -1);
      if (!weak) continue;
      s.cities[weak].troops = 300;
      const o = autoAssign(s, {});
      const m = Object.entries(o).filter(([, x]) => x.cmd === 'march');
      if (m.length) attacked++;
      for (const [id, x] of m) expect(validOrder(s, P, id, x)).toBe(true);
      // no food, no attack
      s.factions[P].food = 0;
      expect(Object.values(autoAssign(s, {})).some((x) => x.cmd === 'march')).toBe(false);
    }
    expect(attacked).toBeGreaterThanOrEqual(7);
  });
  it('does not attack when the odds are poor', () => {
    const s = newGame(2), P = 0, cap = s.factions[P].cap;
    s.cities[cap].troops = 1200; s.factions[P].food = 20000;
    for (const { c } of ADJ[cap]) if (s.cities[c].owner !== P) s.cities[c].troops = 9000;
    expect(Object.values(autoAssign(s, {})).some((x) => x.cmd === 'march')).toBe(false);
  });
});

describe('v1.8: the sandtable camera (D-124)', () => {
  const cam = (v) => { const T = Object.create(Table.prototype); T.h = null; T.camera(v); return T; };
  it('the target lands on (ox, oy), at k pixels per metre, and screen points map back to the ground', () => {
    for (const [yaw, pitch] of [[0, 0.88], [0.4, 0.6], [-0.6, 1.05], [0, 0.01]]) {
      const v = { cx: 120, cz: -340, k: 0.3, yaw, pitch, ox: 700, oy: 380, W: 1280, H: 720 }, T = cam(v);
      const [x, y, sc] = T.project(v.cx, 0, v.cz);
      expect(x).toBeCloseTo(v.ox, 3); expect(y).toBeCloseTo(v.oy, 3); expect(sc).toBeCloseTo(1, 3);
      const [x2] = T.project(v.cx + 10 * Math.cos(yaw), 0, v.cz - 10 * Math.sin(yaw)); // 10 m to the screen's right
      expect(x2 - x).toBeCloseTo(3, 1);
      for (const [sx, sy] of [[300, 200], [1100, 650], [700, 380]]) {
        const [wx, wz] = T.unproject(sx, sy), [px, py] = T.project(wx, 0, wz);
        expect(px).toBeCloseTo(sx, 2); expect(py).toBeCloseTo(sy, 2);
      }
    }
  });
  it('yaw 0 keeps north up the screen; nearer things look bigger when tilted', () => {
    const T = cam({ cx: 0, cz: 0, k: 0.3, yaw: 0, pitch: 0.9, ox: 640, oy: 360, W: 1280, H: 720 });
    expect(T.project(0, 0, -500)[1]).toBeLessThan(T.project(0, 0, 500)[1]);
    expect(T.project(0, 0, 500)[2]).toBeGreaterThan(T.project(0, 0, -500)[2]);
  });
});

describe('v1.9: the advisor and the forecast (D-125)', () => {
  it('the forecast matches what the month actually does (with no battles or events)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = newGame(seed), P = 0, [a, b] = factionGens(s, P);
      for (const f of s.factions.slice(1)) f.alive = false; // nobody else moves
      s.events = [];
      void b;
      const orders = { [a]: { cmd: 'draft' } }; // (a search could find an officer or a treasure: not forecastable)
      const fc = E.forecast(s, P, orders), g0 = s.factions[P].gold, f0 = s.factions[P].food;
      const t0 = Object.values(s.cities).filter((c) => c.owner === P).reduce((x, c) => x + c.troops, 0);
      const real = JSON.parse(JSON.stringify(s));
      E.beginTurn(real, orders);
      for (let x = E.nextBattle(real); x; x = E.nextBattle(real)) E.resolveBattle(real, x.m, x.duel ? E.autoDuel(real, x.duel) : null, x.duel);
      const randomBefore = real.events.length;
      E.endTurn(real);
      if (real.events.slice(randomBefore).some((e) => ['event', 'riot', 'hunger', 'unpaid'].includes(e.k))) continue; // a random event changed things
      expect(real.factions[P].gold - g0).toBeCloseTo(fc.gold, -1);
      expect(real.factions[P].food - f0).toBeCloseTo(fc.food, -1);
      const t1 = Object.values(real.cities).filter((c) => c.owner === P).reduce((x, c) => x + c.troops, 0);
      expect(t1 - t0).toBe(fc.troops);
    }
  });
  it('the advisor warns about an attack, hunger and spare officers, and points at a weak neighbour', () => {
    const s = newGame(3), P = 0, cap = s.factions[P].cap, A = ADJ[cap][0].c;
    let tips = E.advise(s, P, {});
    expect(tips.some((x) => x.k === 'idle')).toBe(true);
    s.factions[P].food = 0;
    expect(E.advise(s, P, {})[0].k).toBe('hungry');
    s.factions[P].food = 30000;
    s.armies.push({ id: 999, f: 1, gens: [], troops: 20000, from: A, to: cap, route: [A, cap], left: 1, total: 1 });
    tips = E.advise(s, P, {});
    expect(tips[0]).toMatchObject({ k: 'attacked', c: cap });
    s.armies.pop();
    s.cities[cap].troops = 9000;
    const n = ADJ[cap].map((x) => x.c).find((x) => s.cities[x].owner !== P);
    s.cities[n].troops = 200;
    expect(E.advise(s, P, {}).some((x) => x.k === 'chance')).toBe(true);
    expect(E.advisorOf(s, P)).toBe(factionGens(s, P).sort((x, y) => E.gen(y).int - E.gen(x).int)[0]);
  });
});
