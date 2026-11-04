// 万锦三国志 (D-73): the strategy rules, run headless.
import { describe, it, expect } from 'vitest';
import {
  newGame, runTurn, beginTurn, nextBattle, resolveBattle, endTurn, duelRound, autoDuel, autoPlayer,
  supplied, ownedBy, gensIn, factionGens, activeBonds, rivalry, capOf, PLAYER, validOrder, hiddenIn,
} from '../../js/sg_engine.js';
import { GENERALS, GEN_IDS, CITY_IDS, ADJ, LINKS, CITIES, BONDS, TRAITS, TRAIT_FX } from '../../js/sg_data.js';
import { CFG } from '../../js/config.js';

const check = (s) => {
  // every general is in exactly one consistent state; numbers stay sane
  for (const g of Object.values(s.gens)) {
    if (g.hidden) expect(g.f).toBe(-1);
    else { expect(g.f).toBeGreaterThanOrEqual(0); expect(s.cities[g.c].owner).toBe(g.f); }
  }
  for (const c of CITY_IDS) { const C = s.cities[c]; expect(C.troops).toBeGreaterThanOrEqual(0); expect(C.troops).toBeLessThanOrEqual(CFG.sg.maxTroops); expect(C.dev).toBeLessThanOrEqual(100); }
  for (const f of s.factions) { expect(f.gold).toBeGreaterThanOrEqual(0); expect(f.food).toBeGreaterThanOrEqual(0); }
};

describe('data', () => {
  it('generals, traits, bonds and the road graph are consistent', () => {
    expect(GEN_IDS.length).toBeGreaterThanOrEqual(40);
    for (const id of GEN_IDS) { const g = GENERALS[id]; expect(TRAITS[g.trait]).toBeTruthy(); expect(TRAIT_FX[g.trait]).toBeTruthy(); for (const k of ['lead', 'war', 'int', 'pol']) expect(g[k]).toBeGreaterThan(0); }
    for (const b of BONDS) for (const m of b.m) expect(GENERALS[m]).toBeTruthy();
    expect(CITY_IDS.length).toBe(12);
    for (const [a, b] of LINKS) { expect(CITIES[a]).toBeTruthy(); expect(CITIES[b]).toBeTruthy(); }
    // connected
    const seen = new Set(['unv']), q = ['unv'];
    while (q.length) for (const { c } of ADJ[q.shift()]) if (!seen.has(c)) { seen.add(c); q.push(c); }
    expect(seen.size).toBe(12);
    // inside the map (maps/markham.json half extents)
    for (const c of Object.values(CITIES)) { expect(Math.abs(c.x)).toBeLessThan(1753); expect(Math.abs(c.z)).toBeLessThan(1306); }
  });
});

describe('new game', () => {
  it('each lord starts with one city and two random generals; the rest hide in the cities', () => {
    const s = newGame(11);
    for (const f of s.factions) { expect(ownedBy(s, f.id).length).toBe(1); expect(factionGens(s, f.id).length).toBe(2); }
    expect(ownedBy(s, -1).length).toBe(8);
    const hid = Object.values(s.gens).filter((g) => g.hidden).length;
    expect(hid).toBe(GEN_IDS.length - 8);
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

describe('orders', () => {
  it('develop, draft and search', () => {
    const s = newGame(3), c = s.factions[0].cap, C = s.cities[c], g0 = s.factions[0].gold;
    const dev0 = C.dev;
    runTurn(s, { [c]: { cmd: 'dev' } });
    expect(C.dev).toBeGreaterThan(dev0);
    const t0 = C.troops;
    runTurn(s, { [c]: { cmd: 'draft' } });
    expect(C.troops).toBeGreaterThan(t0 * 0.97);
    expect(C.troops).toBeLessThanOrEqual(capOf(C));
    expect(s.factions[0].gold).not.toBe(g0);
    // searching long enough finds the blind boxes hidden in the city
    const before = factionGens(s, 0).length;
    for (let i = 0; i < 12; i++) runTurn(s, { [c]: { cmd: 'search' } });
    expect(factionGens(s, 0).length).toBeGreaterThan(before);
    check(s);
  });
  it('march only from a supplied city to a neighbour; armies of one lord merge', () => {
    const s = newGame(9), c = s.factions[0].cap, n = ADJ[c].find((a) => s.cities[a.c].owner === -1).c;
    const far = CITY_IDS.find((x) => x !== c && !ADJ[c].some((a) => a.c === x));
    expect(validOrder(s, 0, c, { cmd: 'march', to: n })).toBe(true);
    expect(validOrder(s, 0, c, { cmd: 'march', to: far })).toBe(false);
    s.cities[n].troops = 300; s.cities[n].def = 20;
    for (const f of s.factions.slice(1)) f.alive = false; // keep the computer lords out of it
    runTurn(s, { [c]: { cmd: 'march', to: n } });
    expect(s.cities[n].owner).toBe(0);
    expect(gensIn(s, n, 0).length).toBeGreaterThan(0);
    check(s);
  });
});

describe('supply lines', () => {
  it('a city cut off from the capital earns nothing and loses troops', () => {
    const s = newGame(21), cap = s.factions[0].cap;
    // give the player a chain cap - a - b, then cut a
    const a = ADJ[cap][0].c, b = ADJ[a].find((x) => x.c !== cap).c;
    for (const x of [a, b]) Object.assign(s.cities[x], { owner: 0, troops: 2000 });
    expect(supplied(s, 0).has(b)).toBe(true);
    s.cities[a].owner = 1;
    if (ADJ[b].some((x) => x.c === cap)) return; // b also touches the capital: nothing to cut
    expect(supplied(s, 0).has(b)).toBe(false);
    expect(validOrder(s, 0, b, { cmd: 'march', to: a })).toBe(false);
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
    beginTurn(s, { [c]: { cmd: 'march', to: n } });
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
      if (s.over === 'win') expect(ownedBy(s, PLAYER).length).toBe(12);
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
