// 万锦三国志 (D-73): the strategy rules, run headless.
import { describe, it, expect } from 'vitest';
import {
  newGame, runTurn, beginTurn, nextBattle, resolveBattle, endTurn, duelRound, autoDuel, autoPlayer,
  supplied, ownedBy, citiesOf, gensIn, guardsIn, factionGens, activeBonds, rivalry, capOf, PLAYER, validOrder, hiddenIn,
  terrain, wallMul, autoAssign, aiOrders, orderCost, isWinter, plotChance, EVENT_IDS,
} from '../../js/sg_engine.js';
import { GENERALS, GEN_IDS, CITY_IDS, PASS_IDS, NODE_IDS, ADJ, LINKS, CITIES, BONDS, TRAITS, TRAIT_FX } from '../../js/sg_data.js';
import { ELEV } from '../../js/sg_elev.js';
import { readFileSync } from 'node:fs';
import { CFG } from '../../js/config.js';

const check = (s) => {
  // every general is in exactly one consistent state; numbers stay sane
  for (const g of Object.values(s.gens)) {
    if (g.hidden) { expect(g.f).toBe(-1); expect(CITIES[g.c].pass).toBe(false); }
    else if (g.guard) { expect(g.f).toBe(-1); expect(s.cities[g.c].owner).toBe(-1); }
    else { expect(g.f).toBeGreaterThanOrEqual(0); expect(s.cities[g.c].owner).toBe(g.f); }
  }
  for (const c of NODE_IDS) { const C = s.cities[c]; expect(C.troops).toBeGreaterThanOrEqual(0); expect(C.troops).toBeLessThanOrEqual(CFG.sg.maxTroops); expect(C.dev).toBeLessThanOrEqual(100); }
  for (const f of s.factions) { expect(f.gold).toBeGreaterThanOrEqual(0); expect(f.food).toBeGreaterThanOrEqual(0); }
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
      runTurn(s, { [id]: { cmd: 'march', to: 'p_tg', n: 10000 } });
      if (s.cities.p_tg.owner === 0) won++;
      expect(guardsIn(s, 'p_tg').length).toBeLessThanOrEqual(s.cities.p_tg.owner === 0 ? 0 : 1);
      if (s.cities.p_tg.owner === 0) expect(s.gens[g].guard).toBe(false);
      check(s);
    }
    expect(won).toBeGreaterThan(20);
  });
});

describe('seasons, stratagems, random events (v0.8.1)', () => {
  it('winter makes attacking harder; September brings the harvest', () => {
    const atk = (turn) => {
      const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c, [a] = factionGens(s, 0);
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

describe('new game', () => {
  it('each lord starts with one city and two random generals; the rest hide in the cities', () => {
    const s = newGame(11);
    for (const f of s.factions) { expect(ownedBy(s, f.id).length).toBe(1); expect(factionGens(s, f.id).length).toBe(2); }
    expect(citiesOf(s, -1).length).toBe(8);
    expect(PASS_IDS.every((c) => s.cities[c].owner === -1)).toBe(true);
    const hid = Object.values(s.gens).filter((g) => g.hidden).length;
    expect(hid).toBe(GEN_IDS.length - 8 - 1); // one guards Toogood 虎牢关
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
  it('develop, draft and search', () => {
    const s = newGame(3), c = s.factions[0].cap, C = s.cities[c], g0 = s.factions[0].gold, [a, b] = factionGens(s, 0);
    const dev0 = C.dev;
    runTurn(s, { [a]: { cmd: 'dev' } });
    expect(C.dev).toBeGreaterThan(dev0);
    const t0 = C.troops;
    runTurn(s, { [a]: { cmd: 'draft' } });
    expect(C.troops).toBeGreaterThan(t0 * 0.97);
    expect(C.troops).toBeLessThanOrEqual(capOf(C));
    expect(s.factions[0].gold).not.toBe(g0);
    // searching long enough finds the blind boxes hidden in the city
    const before = factionGens(s, 0).length;
    for (let i = 0; i < 12; i++) runTurn(s, { [a]: { cmd: 'search' } });
    expect(factionGens(s, 0).length).toBeGreaterThan(before);
    check(s);
    // two officers in one city both act in the same month
    const s2 = newGame(3), cap = s2.factions[0].cap, d0 = s2.cities[cap].dev, t1 = s2.cities[cap].troops;
    s2.factions.slice(1).forEach((f) => { f.alive = false; });
    runTurn(s2, { [a]: { cmd: 'dev' }, [b]: { cmd: 'draft' } });
    expect(s2.cities[cap].dev).toBeGreaterThan(d0);
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
    expect(validOrder(s, 0, a, { cmd: 'dev' })).toBe(s.cities[n].dev < 100);
    check(s);
  });
  it('auto-assign gives every idle officer a peaceful job and keeps the given orders', () => {
    const s = newGame(5), [a, b] = factionGens(s, 0), cap = s.factions[0].cap;
    const t = ADJ[cap].find((x) => s.cities[x.c].owner === -1).c;
    const mine = { [a]: { cmd: 'march', to: t, n: 1000 } };
    const all = autoAssign(s, mine);
    expect(all[a]).toEqual(mine[a]);
    expect(all[b]).toBeTruthy();
    expect(all[b].cmd).not.toBe('march');
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
  it('rock-paper-scissors rounds, stronger arms hit harder; a duel always ends', () => {
    const s = newGame(1);
    const d = { a: 'lvbu', d: 'xunyu', fa: 0, fd: 1, hpA: 100, hpD: 100, n: 0, log: [], done: false, win: null };
    duelRound(s, d, 'atk', 'skill'); // atk beats skill
    expect(d.hpD).toBeLessThan(100); expect(d.hpA).toBe(100);
    const d2 = { ...d, hpA: 100, hpD: 100, n: 0, log: [], done: false };
    duelRound(s, d2, 'atk', 'def'); // def beats atk
    expect(d2.hpA).toBeLessThan(100);
    expect(100 - d2.hpA).toBeLessThan(100 - d.hpD); // Xun Yu hits Lü Bu softly
    let lvWins = 0;
    for (let i = 0; i < 40; i++) { const x = { ...d, hpA: 100, hpD: 100, n: 0, log: [], done: false, win: null }; if (autoDuel(s, x) === 'a') lvWins++; expect(x.done).toBe(true); expect(x.n).toBeLessThanOrEqual(CFG.sg.duelRounds); }
    expect(lvWins).toBeGreaterThan(30);
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
