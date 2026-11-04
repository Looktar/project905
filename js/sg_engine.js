// 万锦三国志 rules engine (D-73, v0.8 D-74). Pure and deterministic: all randomness comes from the
// seeded generator kept in the state, so a saved game (JSON) resumes exactly. No DOM, unit-tested.
//
// v0.8: every officer (not every city) gets one order a month; passes (关) are real parks across
// a road; real terrain (ground height, the Rouge River) helps the defender.
// v0.8.1: seasons (autumn harvest, winter snow), stratagems (流言 rumour / 火计 fire), random events.
// v0.9: every game draws its own map of real places (genMap); the map travels in the save (s.map).
// v0.9.3: armies take time on the road (s.armies): the longer the road, the more months; relay roads
// are quicker. They are shown on the map while they march and fight when they arrive.
//
// A month:  beginTurn(s, playerOrders)  -> domestic orders of every faction run, armies queue up
//           nextBattle(s)               -> the next army arrives: { m, duel } (duel may be null)
//           duelRound(s, duel, a, d)    -> one exchange of a duel (null move = computer picks)
//           resolveBattle(s, m, winner) -> the siege is fought ('a' / 'd' / null = duel result)
//           endTurn(s)                  -> income, upkeep, supply, coalition, victory, next month
// runTurn() does all of it with computer duels (tests, simulations).
import { CFG } from './config.js';
import { GENERALS, GEN_IDS, TRAIT_FX, BONDS, RIVALS, CITY_IDS, PASS_IDS, NODE_IDS, CITIES, ADJ, FACTION_COLORS, CLASSIC, useMap, currentMapKey } from './sg_data.js';
import { SITES, PARKS, PAIRS } from './sg_sites.js';

export const SAVE_V = 4;
const K = () => CFG.sg;
export const capOf = (city) => (city.pass ? K().passCap : Math.min(K().maxTroops, Math.round(K().capBase + city.dev * K().capPerDev)));
export const defMaxOf = (city) => (city.pass ? K().passDefMax : K().defMax);

// ---------------------------------------------------------------- random (mulberry32 in the state)
export function rnd(s) {
  s.r = (s.r + 0x6d2b79f5) | 0;
  let t = s.r;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, a) => a[Math.floor(rnd(s) * a.length)];
function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------------------------------------------------------------- the board of this game
// The data tables (CITIES, ADJ, ...) describe one map at a time; every entry point switches them to the
// map of the state it is given, so several games (tests, a save next to a new game) never mix up.
export function loadMap(s) { if (s.map && s.map.key !== currentMapKey()) useMap(s.map); return s; }

// a random board (v0.9, D-77): `cityCount` real places at least `siteSpacing` apart, linked to their
// natural neighbours (Gabriel graph: a and b are linked when no other city sits inside the circle on a-b),
// then `passCount` of the parks lying across those roads become passes, one of them the big 虎牢关
export function genMap(seed) {
  const k = K(), g = { r: seed >>> 0 };
  rnd(g);
  const pair = (a, b) => PAIRS[a + '|' + b] || (PAIRS[b + '|' + a] && flip(PAIRS[b + '|' + a]));
  const flip = ([road, river, st, ps]) => [road, river, st && [st[0], Math.round((1 - st[1]) * 100) / 100], ps.map(([p, t, ra, rb]) => [p, Math.round((1 - t) * 100) / 100, rb, ra])];
  const S = Object.fromEntries(SITES.map((x) => [x[0], x]));
  let cities = null, links = null;
  for (let tries = 0; tries < 60 && !links; tries++) {
    const pick1 = [];
    for (const site of shuffle(g, [...SITES])) {
      if (pick1.length >= k.cityCount) break;
      if (pick1.every((o) => Math.hypot(o[3] - site[3], o[4] - site[4]) >= k.siteSpacing)) pick1.push(site);
    }
    if (pick1.length < k.cityCount) continue;
    const ids = pick1.map((x) => x[0]), L = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = S[ids[i]], b = S[ids[j]], p = pair(ids[i], ids[j]);
      if (!p) continue;
      const mx = (a[3] + b[3]) / 2, mz = (a[4] + b[4]) / 2, r2 = ((a[3] - b[3]) ** 2 + (a[4] - b[4]) ** 2) / 4;
      if (ids.some((c) => c !== ids[i] && c !== ids[j] && (S[c][3] - mx) ** 2 + (S[c][4] - mz) ** 2 < r2)) continue;
      L.push([ids[i], ids[j], p]);
    }
    // connected?
    const seen = new Set([ids[0]]), q = [ids[0]];
    while (q.length) { const c = q.shift(); for (const [a, b] of L) { const n = a === c ? b : b === c ? a : null; if (n && !seen.has(n)) { seen.add(n); q.push(n); } } }
    if (seen.size === ids.length) { cities = pick1; links = L; }
  }
  if (!links) return CLASSIC;
  // passes: parks across roads, at most one per road and one per city
  const out = [], nodes = cities.map(([id, zh, en, x, z, valley, depot]) => [id, zh, en, x, z, valley, 0, 0, depot ? [depot, depot] : null]);
  const used = new Set(), busy = new Set();
  let passes = 0;
  for (const [a, b, p] of shuffle(g, [...links])) {
    const [road, river, st, ps] = p, cand = ps.filter(([pk]) => !used.has(pk) && cities.every((c) => Math.hypot(c[3] - PARKS[pk][1], c[4] - PARKS[pk][2]) >= k.passClear));
    if (passes < k.passCount && cand.length && !busy.has(a) && !busy.has(b)) {
      const [pk, t, ra, rb] = cand[Math.floor(rnd(g) * cand.length)], [name, x, z] = PARKS[pk], id = 'p' + pk, big = passes === 0;
      nodes.push([id, name + (big ? ' 虎牢关' : ' 关'), name + (big ? ' Tiger Pass' : ' Pass'), x, z, 0, 1, big ? 1 : 0, null]);
      // the relay station stays on whichever half of the road it was on
      out.push([a, id, road, ra, st && st[1] < t ? [st[0], Math.round(st[1] / t * 100) / 100] : null]);
      out.push([id, b, road, rb, st && st[1] >= t ? [st[0], Math.round((st[1] - t) / (1 - t) * 100) / 100] : null]);
      used.add(pk); busy.add(a); busy.add(b); passes++;
    } else out.push([a, b, road, river, st]);
  }
  if (!passes) return genMap((seed + 0x9e3779b9) >>> 0); // every board gets at least its 虎牢关
  return { key: 'r' + (seed >>> 0), nodes, links: out };
}

// ---------------------------------------------------------------- helpers
export const PLAYER = 0;
export const gen = (id) => GENERALS[id];
export const fx = (id, k) => (TRAIT_FX[gen(id).trait] || {})[k] || 0;
export const gensIn = (s, c, f) => Object.values(s.gens).filter((g) => g.c === c && g.f === f && !g.hidden).map((g) => g.id);
export const guardsIn = (s, c) => Object.values(s.gens).filter((g) => g.guard && g.c === c).map((g) => g.id);
export const ownedBy = (s, f) => NODE_IDS.filter((c) => s.cities[c].owner === f);      // cities and passes
export const citiesOf = (s, f) => CITY_IDS.filter((c) => s.cities[c].owner === f);    // cities only
export const factionGens = (s, f) => Object.values(s.gens).filter((g) => g.f === f && !g.hidden && f >= 0).map((g) => g.id);
export const byLead = (ids) => [...ids].sort((a, b) => gen(b).lead - gen(a).lead);
const best = (ids, k) => ids.reduce((m, id) => (m && gen(m)[k] >= gen(id)[k] ? m : id), null);
export const dateOf = (s) => ({ year: K().startYear + Math.floor(s.turn / 12), month: (s.turn % 12) + 1 });
export const adjacent = (a, b) => ADJ[a].some((x) => x.c === b);
export const linkOf = (a, b) => ADJ[a].find((x) => x.c === b) || null;
// the road an army takes from a to b: the direct road, or two roads through a node of ours (relay moves)
export function routeOf(s, f, a, b) {
  if (adjacent(a, b)) return [a, b];
  const via = ADJ[a].find(({ c: n, station }) => station && s.cities[n].owner === f && adjacent(n, b));
  return via ? [a, via.c, b] : [a, b];
}
// months on the road (v0.9.3): road length / marching speed, quicker on a road with a 驿站
export function travelMonths(route) {
  const k = K();
  let t = 0;
  for (let i = 1; i < route.length; i++) {
    const a = CITIES[route[i - 1]], b = CITIES[route[i]], l = linkOf(route[i - 1], route[i]);
    t += Math.hypot(a.x - b.x, a.z - b.z) / (k.marchSpeed * (l && l.station ? k.relaySpeed : 1));
  }
  return Math.max(1, Math.ceil(t - 0.15));
}

function hops(a) { // graph distance from city a to every node
  const d = { [a]: 0 }, q = [a];
  while (q.length) { const c = q.shift(); for (const { c: n } of ADJ[c]) if (d[n] === undefined) { d[n] = d[c] + 1; q.push(n); } }
  return d;
}

// cities and passes of f connected to its capital, or to one of its 补给站 supply depots, through its own nodes
export function supplied(s, f) {
  loadMap(s);
  const fa = s.factions[f], out = new Set();
  if (!fa) return out;
  const q = [fa.cap, ...CITY_IDS.filter((c) => CITIES[c].depot)].filter((c) => s.cities[c]?.owner === f);
  for (const c of q) out.add(c);
  while (q.length) { const c = q.shift(); for (const { c: n } of ADJ[c]) if (!out.has(n) && s.cities[n].owner === f) { out.add(n); q.push(n); } }
  return out;
}

// ---------------------------------------------------------------- terrain (v0.8, D-74)
// attacking from `from` into `to`: crossing the Rouge costs, attacking uphill costs, downhill helps a little
export function terrain(from, to) {
  const k = K(), link = linkOf(from, to), dh = CITIES[to].elev - CITIES[from].elev;
  let m = 1;
  const why = [];
  if (link && link.river) { m -= k.riverPen; why.push('river'); }
  if (link && link.station) { m += k.stationAtk; why.push('station'); } // 驿站: fed and fuelled on the way
  if (dh > 0) { const p = Math.min(k.hillMax, dh * k.hillPerM); m -= p; if (p >= 0.04) why.push('uphill'); }
  else if (dh < 0) { const p = Math.min(k.hillMax / 2, -dh * k.hillPerM / 2); m += p; if (p >= 0.04) why.push('downhill'); }
  return { m, why };
}
// walls: a pass is worth more than a city wall of the same number
// seasons: December to February is snowy Markham winter (attacking is harder), September is harvest
export const isWinter = (s) => [12, 1, 2].includes(dateOf(s).month);
export const seasonOf = (s) => { const m = dateOf(s).month; return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'; };
export const wallMul = (city) => (1 + city.def / K().defDiv) * (city.pass ? K().passMul : 1);

// bonds active for a set of generals (army) of faction f
export function activeBonds(s, f, ids) {
  if (f < 0) return [];
  const fac = new Set(factionGens(s, f)), army = new Set(ids || []);
  return BONDS.filter((b) => b.m.filter((m) => (b.scope === 'army' ? army : fac).has(m)).length >= b.need);
}
function bondFx(s, f, ids, k) { return activeBonds(s, f, ids).reduce((a, b) => a + (b.fx[k] || 0), 0); }
export function rivalry(a, d) { // rival pair across two armies (first found)
  for (const r of RIVALS) {
    if (a.some((x) => r.a.includes(x)) && d.some((x) => r.b.includes(x))) return r;
    if (a.some((x) => r.b.includes(x)) && d.some((x) => r.a.includes(x))) return r;
  }
  return null;
}
export function isAlly(s, f, g) { // coalition partners (never the leader); everyone not the leader counts as a partner
  if (f === g) return true;
  const L = s.coalition;
  return L !== null && L !== undefined && f !== L && g !== L && g >= 0 && f > 0; // AI members leave each other (and the player) alone
}
// who defends a node: the owner's officers there, or the guard of a neutral pass
export const defenders = (s, c) => (s.cities[c].owner >= 0 ? gensIn(s, c, s.cities[c].owner) : guardsIn(s, c));

// ---------------------------------------------------------------- new game
// opts.map: 'classic' (the fixed map, default: tests) or 'random' (a new board from the seed: the real game)
export function newGame(seed = Date.now(), opts = {}) {
  const k = K(), names = opts.names || {};
  const map = opts.map === 'random' ? genMap(seed) : CLASSIC;
  const s = { v: SAVE_V, seed: seed >>> 0, r: seed >>> 0, turn: 0, factions: [], cities: {}, gens: {}, coalition: null, over: null, log: [], queue: [], phase: 'orders', orders: {}, map, armies: [], nextArmy: 1 };
  loadMap(s);
  rnd(s);
  // starting cities: four, pairwise at least 2 roads apart
  let starts = null;
  for (let tries = 0; tries < 200 && !starts; tries++) {
    const c = shuffle(s, [...CITY_IDS]).slice(0, 4);
    if (c.every((a, i) => c.every((b, j) => i === j || hops(a)[b] >= 2))) starts = c;
  }
  starts = starts || CITY_IDS.slice(0, 4);
  for (const c of CITY_IDS) {
    s.cities[c] = { id: c, owner: -1, troops: Math.round(k.neutralTroops[0] + rnd(s) * (k.neutralTroops[1] - k.neutralTroops[0])), dev: Math.round(30 + rnd(s) * 30), def: Math.round(35 + rnd(s) * 25) };
  }
  for (const c of PASS_IDS) {
    const big = CITIES[c].big;
    s.cities[c] = { id: c, owner: -1, pass: true, dev: 0, def: big ? k.passBigDef : k.passDef,
      troops: big ? k.passBigTroops : Math.round(k.passTroops[0] + rnd(s) * (k.passTroops[1] - k.passTroops[0])) };
  }
  const pool = shuffle(s, [...GEN_IDS]);
  for (let f = 0; f < 4; f++) {
    const drawn = [pool.pop(), pool.pop()], cap = starts[f];
    s.factions.push({ id: f, player: f === PLAYER, lord: f === PLAYER ? null : drawn[0], name: f === PLAYER ? (names.player || null) : null, color: FACTION_COLORS[f], cap, alive: true, gold: k.startGold, food: k.startFood });
    Object.assign(s.cities[cap], { owner: f, troops: k.startTroops, dev: 50, def: 60 });
    for (const id of drawn) s.gens[id] = { id, f, c: cap, hidden: false, loyal: 85 + fx(id, 'loyal') };
  }
  // everyone else hides somewhere in Markham (cities only): the blind boxes found by searching
  const order = shuffle(s, [...CITY_IDS]);
  pool.forEach((id, i) => { s.gens[id] = { id, f: -1, c: order[i % order.length], hidden: true, loyal: 70 }; });
  // the strongest officer still at large holds Toogood 虎牢关 for nobody (like Lü Bu at Hulao)
  const big = PASS_IDS.find((c) => CITIES[c].big);
  const guard = pool.reduce((m, id) => (m && gen(m).war >= gen(id).war ? m : id), null);
  if (big && guard) Object.assign(s.gens[guard], { c: big, hidden: false, guard: true });
  return s;
}

const ev = (s, e) => { e.t = s.turn; s.log.push(e); if (s.log.length > 60) s.log.shift(); s.events.push(e); return e; };
export const hiddenIn = (s, c) => Object.values(s.gens).filter((g) => g.hidden && g.c === c).map((g) => g.id);

// ---------------------------------------------------------------- orders
// one order per officer: orders = { [general id]: { cmd, to, n } }
// cmd: 'dev' | 'draft' | 'search' | 'fort' | 'move' | 'march'   (n = troops taken along)
//      'plot' (计略) with kind 'rumor' (流言: troops desert) or 'fire' (火计: walls burn) against a neighbour
export const COST = { dev: 'devCost', draft: 'draftCost', fort: 'fortCost', plot: 'plotCost' };
export const PLOTS = ['rumor', 'fire'];
// chance that a stratagem by officer id works against node c
export function plotChance(s, id, c) {
  const k = K(), d = defenders(s, c), dInt = d.length ? Math.max(...d.map((x) => gen(x).int)) : k.neutralStat;
  return Math.max(0.1, Math.min(k.plotMax, k.plotBase + (gen(id).int - dInt) * k.plotInt + fx(id, 'plot')));
}
export const orderCost = (o) => (o && COST[o.cmd] ? K()[COST[o.cmd]] : 0);
// where an officer in c may move: a neighbouring node of ours, or one road further when the first road
// has a 驿站 relay station (the node in between must be ours too)
export function moveTargets(s, f, c) {
  loadMap(s);
  const out = new Set();
  for (const { c: n, station } of ADJ[c]) {
    if (s.cities[n].owner !== f) continue;
    out.add(n);
    if (station) for (const { c: m } of ADJ[n]) if (m !== c && s.cities[m].owner === f) out.add(m);
  }
  return [...out];
}
export function validOrder(s, f, id, o) {
  loadMap(s);
  const G = s.gens[id];
  if (!o || !G || G.f !== f || G.hidden || !G.c) return false;
  const c = G.c, city = s.cities[c], fa = s.factions[f], k = K();
  if (city.owner !== f) return false;
  switch (o.cmd) {
    case 'dev': return !city.pass && fa.gold >= k.devCost && city.dev < 100;
    case 'draft': return !city.pass && fa.gold >= k.draftCost && city.troops < capOf(city);
    case 'search': return !city.pass;
    case 'fort': return fa.gold >= k.fortCost && city.def < defMaxOf(city);
    case 'move': return moveTargets(s, f, c).includes(o.to);
    case 'march': return adjacent(c, o.to) && s.cities[o.to].owner !== f && supplied(s, f).has(c) && city.troops >= k.minMarch;
    case 'plot': return PLOTS.includes(o.kind) && adjacent(c, o.to) && s.cities[o.to].owner !== f && fa.gold >= k.plotCost;
    default: return false;
  }
}

function runOrder(s, f, id, o) {
  const k = K(), fa = s.factions[f];
  if (!validOrder(s, f, id, o)) { if (s.gens[id] && s.gens[id].f === f) ev(s, { k: 'skip', f, g: id, cmd: o && o.cmd }); return; }
  const c = s.gens[id].c, city = s.cities[c], G = gen(id);
  if (o.cmd === 'dev') {
    const amt = Math.round((k.devBase + G.pol * k.devPerPol) * (1 + fx(id, 'dev') + bondFx(s, f, [id], 'dev')));
    fa.gold -= k.devCost; city.dev = Math.min(100, city.dev + amt);
    ev(s, { k: 'dev', f, c, g: id, n: amt });
  } else if (o.cmd === 'draft') {
    const amt = Math.min(capOf(city) - city.troops, Math.round((k.draftBase + G.lead * k.draftPerLead) * (1 + fx(id, 'draft'))));
    fa.gold -= k.draftCost; city.troops += amt;
    ev(s, { k: 'draft', f, c, g: id, n: amt });
  } else if (o.cmd === 'search') {
    const hid = hiddenIn(s, c);
    const p = k.searchBase + G.int * k.searchPerInt + fx(id, 'search') + bondFx(s, f, [id], 'search');
    if (hid.length && rnd(s) < p) {
      const nid = pick(s, hid);
      Object.assign(s.gens[nid], { f, c, hidden: false, rumor: false, loyal: 75 + fx(nid, 'loyal') });
      ev(s, { k: 'found', f, c, g: nid, by: id });
    } else if (rnd(s) < k.treasure[0]) {
      const n = Math.round(k.treasure[1] + rnd(s) * (k.treasure[2] - k.treasure[1]));
      fa.gold += n; ev(s, { k: 'treasure', f, c, g: id, n });
    } else ev(s, { k: 'nothing', f, c, g: id, left: hid.length });
  } else if (o.cmd === 'fort') {
    const amt = Math.round(k.fortBase + Math.max(G.lead, G.pol) * k.fortPerStat + (fx(id, 'def') > 0 ? 4 : 0));
    fa.gold -= k.fortCost; city.def = Math.min(defMaxOf(city), city.def + amt);
    ev(s, { k: 'fort', f, c, g: id, n: amt });
  } else if (o.cmd === 'plot') {
    const T = s.cities[o.to], ok = rnd(s) < plotChance(s, id, o.to);
    fa.gold -= k.plotCost;
    let n = 0;
    if (ok && o.kind === 'rumor') { n = Math.round(T.troops * (k.rumorBase + G.int * k.rumorPerInt)); T.troops -= n; }
    if (ok && o.kind === 'fire') { n = Math.min(T.def - 10, Math.round(k.fireBase + G.int * k.firePerInt)); T.def -= Math.max(0, n); T.troops = Math.round(T.troops * 0.97); }
    ev(s, { k: 'plot', f, c, to: o.to, g: id, kind: o.kind, ok, n, fd: T.owner });
  } else if (o.cmd === 'move' || o.cmd === 'march') {
    // the officer sets off with his troops; a short road takes one month (he arrives this month)
    const march = o.cmd === 'march';
    const n = march ? Math.min(city.troops, Math.floor(o.n ?? city.troops * k.marchFrac)) : Math.max(0, Math.min(city.troops, Math.floor(o.n || 0)));
    if (march && n < k.minMarch) { ev(s, { k: 'skip', f, g: id, cmd: 'march' }); return; }
    const route = routeOf(s, f, c, o.to), months = travelMonths(route);
    s.gens[id].c = null; // on the road
    city.troops -= n;
    // officers leaving the same city for the same place this month go as one army
    const j = s.armies.find((x) => x.f === f && x.from === c && x.to === o.to && x.kind === o.cmd && x.left === x.total && x.total === months);
    if (j) { j.gens.push(id); j.troops += n; }
    else s.armies.push({ id: s.nextArmy++, f, kind: o.cmd, from: c, to: o.to, route, gens: [id], troops: n, terr: march ? terrain(route[route.length - 2], o.to).m : 1, total: months, left: months });
    ev(s, { k: o.cmd, f, c, to: o.to, n, gens: [id], months });
  }
}

// ---------------------------------------------------------------- computer lords (and 委任 for the player)
const armyPower = (troops, ids) => {
  const k = K(), g = ids.length ? best(ids, 'lead') : null, lead = g ? gen(g).lead : k.neutralStat;
  const war = ids.length ? Math.max(...ids.map((x) => gen(x).war)) : k.neutralStat;
  return troops * (0.6 + 0.4 * lead / 100 + 0.2 * war / 100);
};
// opts.war = false: domestic only (the player's "auto-assign"); opts.skip: officers that already have orders;
// opts.gold: gold left to spend
export function aiOrders(s, f, opts = {}) {
  loadMap(s);
  const k = K(), out = {}, sup = supplied(s, f), skip = opts.skip || new Set(), war = opts.war !== false;
  let gold = opts.gold ?? s.factions[f].gold;
  const free = (c) => byLead(gensIn(s, c, f).filter((g) => !out[g] && !skip.has(g)));
  const mine = ownedBy(s, f);
  const hostile = (o) => o >= 0 && o !== f && !isAlly(s, f, o);
  const enemy = (o) => o !== f && !isAlly(s, f, o) && !(o === PLAYER && s.turn < k.truce);
  const inbound = (c) => s.armies.filter((a) => a.to === c && hostile(a.f)).reduce((x, a) => x + a.troops, 0);
  const threatOf = (c) => Math.max(inbound(c), ...ADJ[c].map(({ c: n }) => (hostile(s.cities[n].owner) ? s.cities[n].troops : 0)));
  const enRoute = new Set(s.armies.filter((a) => a.f === f).map((a) => a.to));
  const isFront = (c) => ADJ[c].some(({ c: n }) => s.cities[n].owner !== f && !isAlly(s, f, s.cities[n].owner));
  // cut off: everybody walks back towards the supplied cities, the first one brings the troops
  for (const c of mine) if (!sup.has(c)) {
    const home = ADJ[c].find(({ c: n }) => s.cities[n].owner === f && sup.has(n));
    if (home) free(c).forEach((g, i) => { out[g] = { cmd: 'move', to: home.c, n: i === 0 ? Math.floor(s.cities[c].troops * 0.8) : 0 }; });
  }
  // attacks: every neighbouring node of ours may join in (armies merge), up to two targets a month
  const used = new Set();
  // a rich lord, or one of the last two, gets bolder (no endless stand-offs between full cities)
  const thr = k.aiAttack - Math.min(k.aiBoldGold[1], gold / k.aiBoldGold[0]) - (s.factions.filter((x) => x.alive).length <= 2 ? k.aiBoldLast : 0);
  for (let n = 0; war && n < 2; n++) {
    let pick1 = null;
    const targets = new Set();
    for (const c of mine) if (sup.has(c) && !used.has(c) && free(c).length) for (const { c: t } of ADJ[c]) if (s.cities[t].owner !== f && enemy(s.cities[t].owner)) targets.add(t);
    for (const t of targets) {
      if (enRoute.has(t)) continue; // our army is already on its way there
      const T = s.cities[t];
      const from = ADJ[t].map((a) => a.c).filter((c) => s.cities[c].owner === f && sup.has(c) && !used.has(c) && free(c).length && s.cities[c].troops >= 800);
      if (!from.length) continue;
      const ids = from.flatMap((c) => free(c).slice(0, 2));
      let troops = 0, tw = 0;
      for (const c of from) { const x = s.cities[c].troops * k.marchFrac; troops += x; tw += x * terrain(c, t).m; }
      let sc = armyPower(troops, ids) * (tw / troops) * (isWinter(s) ? 1 - k.snowPen : 1) / Math.max(1, armyPower(T.troops, defenders(s, t)) * wallMul(T));
      if (T.owner === -1) sc += 0.1;
      if (s.coalition !== null && T.owner === s.coalition) sc += 0.3;
      if (sc >= thr && (!pick1 || sc > pick1.sc)) pick1 = { t, from, sc };
    }
    if (!pick1) break;
    for (const c of pick1.from) {
      const ld = free(c).slice(0, 2), x = Math.floor(s.cities[c].troops * k.marchFrac / ld.length);
      for (const g of ld) out[g] = { cmd: 'march', to: pick1.t, n: x };
      used.add(c);
    }
  }
  // everyone else: one job each, most urgent first
  const incoming = {};
  for (const c of mine) {
    const C = s.cities[c];
    let gs = free(c), searched = false, fed = false, plotted = false;
    const take = (key) => { const g = best(gs, key); gs = gs.filter((x) => x !== g); return g; };
    const threat = threatOf(c), front = isFront(c);
    const canDraft = () => !C.pass && gold >= k.draftCost && C.troops < capOf(C);
    while (gs.length) {
      if (canDraft() && (C.troops < threat * 1.2 || C.troops < k.aiSafe)) { out[take('lead')] = { cmd: 'draft' }; gold -= k.draftCost; continue; }
      if (!C.pass && !searched && hiddenIn(s, c).length && rnd(s) < 0.7) { out[take('int')] = { cmd: 'search' }; searched = true; continue; }
      // a clever officer on the front line plots against the strongest hostile neighbour
      if (war && !plotted && front && gold >= k.plotCost + 100 && gen(best(gs, 'int')).int >= 75) {
        const t = ADJ[c].map((a) => a.c).filter((n) => enemy(s.cities[n].owner) && s.cities[n].owner !== f).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0];
        if (t && rnd(s) < 0.7) { out[take('int')] = { cmd: 'plot', kind: s.cities[t].def > 50 ? 'fire' : 'rumor', to: t }; gold -= k.plotCost; plotted = true; continue; }
      }
      if (front && gold >= k.fortCost && C.def < (C.pass ? defMaxOf(C) : 60) && (C.pass || threat > C.troops * 0.6)) { out[take('pol')] = { cmd: 'fort' }; gold -= k.fortCost; continue; }
      if (!C.pass && C.dev < 90 && gold >= k.devCost) { out[take('pol')] = { cmd: 'dev' }; gold -= k.devCost; continue; }
      // a spare officer goes where there is nobody, so every city can act
      if (gs.length >= 2 || !front) {
        const need = ADJ[c].map((a) => a.c).filter((n) => s.cities[n].owner === f && sup.has(n) && !gensIn(s, n, f).length && !incoming[n]);
        if (need.length) { const to = need[0]; out[take('pol')] = { cmd: 'move', to, n: !front && C.troops > 2000 ? Math.floor(C.troops * 0.4) : 0 }; incoming[to] = 1; continue; }
      }
      // interior: feed the most threatened neighbour
      if (!front && !fed && C.troops > 2000) {
        const fr = ADJ[c].filter(({ c: n }) => s.cities[n].owner === f && isFront(n)).sort((a, b) => threatOf(b.c) - threatOf(a.c))[0];
        if (fr) { out[take('lead')] = { cmd: 'move', to: fr.c, n: Math.floor(C.troops * 0.6) }; fed = true; continue; }
      }
      if (canDraft()) { out[take('lead')] = { cmd: 'draft' }; gold -= k.draftCost; continue; }
      if (!C.pass && searched === false && hiddenIn(s, c).length) { out[take('int')] = { cmd: 'search' }; searched = true; continue; }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the month
export function beginTurn(s, playerOrders = {}) {
  loadMap(s);
  s.events = []; s.queue = []; s.armies = s.armies || []; s.nextArmy = s.nextArmy || 1;
  const all = [];
  for (const fa of s.factions) {
    if (!fa.alive) continue;
    const ords = fa.player ? playerOrders : aiOrders(s, fa.id);
    for (const id of Object.keys(ords)) all.push([fa.id, id, ords[id]]);
  }
  // domestic first (in a shuffled order so no faction always goes first), armies queue up
  for (const [f, id, o] of shuffle(s, all.filter(([, , o]) => o.cmd !== 'march'))) runOrder(s, f, id, o);
  for (const [f, id, o] of shuffle(s, all.filter(([, , o]) => o.cmd === 'march'))) runOrder(s, f, id, o);
  // the armies arriving this month (left 1): moves into a node of ours just go in; everything else fights.
  // Armies of one lord arriving at the same place join up and fight as one (terrain: troop-weighted)
  const arriving = s.armies.filter((a) => a.left <= 1);
  s.armies = s.armies.filter((a) => a.left > 1);
  for (const a of arriving) {
    if (!s.factions[a.f].alive) continue;
    a.gens = a.gens.filter((id) => s.gens[id].f === a.f && !s.gens[id].hidden);
    if (s.cities[a.to].owner === a.f) { enterCity(s, a); if (a.kind === 'move') ev(s, { k: 'arrive', f: a.f, c: a.to, n: a.troops, gens: [...a.gens] }); }
    else s.queue.push(a);
  }
  const merged = [];
  for (const m of s.queue) {
    const j = merged.find((x) => x.f === m.f && x.to === m.to);
    if (j) {
      j.terr = (j.terr * j.troops + m.terr * m.troops) / Math.max(1, j.troops + m.troops);
      j.troops += m.troops; j.gens.push(...m.gens); if (!j.froms.includes(m.from)) j.froms.push(m.from);
      j.home[m.gens[0]] = m.from;
    } else merged.push({ ...m, gens: [...m.gens], froms: [m.from], home: { [m.gens[0]]: m.from } });
  }
  s.queue = merged;
  s.phase = 'battles';
  return s.events;
}

export function nextBattle(s) {
  loadMap(s);
  while (s.queue.length) {
    const m = s.queue.shift(), T = s.cities[m.to];
    if (!s.factions[m.f].alive) continue; // the lord fell earlier this month: the army breaks up (its officers already scattered)
    m.gens = m.gens.filter((id) => s.gens[id].f === m.f && !s.gens[id].hidden);
    if (T.owner === m.f) { enterCity(s, m); continue; } // a friend got there first: just move in
    const dGens = defenders(s, m.to);
    let duel = null;
    if (m.gens.length && dGens.length) {
      const a = best(m.gens, 'war'), d = best(dGens, 'war'), riv = rivalry(m.gens, dGens);
      let p = riv ? K().duelRival : K().duelChance;
      if (gen(a).war >= 85 && gen(d).war >= 85) p += K().duelBig;
      if (rnd(s) < p) {
        // with a rivalry, the rivals themselves step forward
        let A = a, D = d;
        if (riv) { A = m.gens.find((x) => riv.a.includes(x) || riv.b.includes(x)) || a; D = dGens.find((x) => riv.a.includes(x) || riv.b.includes(x)) || d; }
        duel = { a: A, d: D, fa: m.f, fd: T.owner, hpA: 100, hpD: 100, n: 0, log: [], rival: riv ? riv.zh : null, rivalEn: riv ? riv.en : null, done: false, win: null };
      }
    }
    return { m, duel };
  }
  return null;
}

const BEATS = { atk: 'skill', skill: 'def', def: 'atk' }; // move -> the move it beats
export function aiMove(s) { const r = rnd(s); return r < 0.4 ? 'atk' : r < 0.7 ? 'def' : 'skill'; }
export function duelRound(s, d, mA = null, mD = null) {
  const k = K();
  mA = mA || aiMove(s); mD = mD || aiMove(s);
  const wa = gen(d.a).war, wd = gen(d.d).war;
  const bonus = (id, f) => 1 + fx(id, 'duel') + bondFx(s, f, [id], 'duel');
  const hit = (w, l, id, f, skill) => k.duelHit * Math.min(2.2, Math.max(0.45, (w / l) ** 1.6)) * bonus(id, f) * (0.85 + 0.3 * rnd(s)) * (skill ? 1 + k.duelSkill : 1);
  let dmgA = 0, dmgD = 0; // damage taken by a / d
  if (mA === mD) { dmgA = k.duelTie * Math.min(2, (wd / wa) ** 1.6); dmgD = k.duelTie * Math.min(2, (wa / wd) ** 1.6); }
  else if (BEATS[mA] === mD) dmgD = hit(wa, wd, d.a, d.fa, mA === 'skill');
  else dmgA = hit(wd, wa, d.d, d.fd, mD === 'skill');
  d.hpA = Math.max(0, Math.round(d.hpA - dmgA)); d.hpD = Math.max(0, Math.round(d.hpD - dmgD)); d.n++;
  d.log.push({ mA, mD, dmgA: Math.round(dmgA), dmgD: Math.round(dmgD) });
  if (d.hpA <= 0 || d.hpD <= 0 || d.n >= k.duelRounds) {
    d.done = true;
    d.win = d.hpA <= 0 && d.hpD <= 0 ? null : d.hpD <= 0 ? 'a' : d.hpA <= 0 ? 'd' : Math.abs(d.hpA - d.hpD) < 8 ? null : d.hpA > d.hpD ? 'a' : 'd';
  }
  return d;
}
export function autoDuel(s, d) { while (!d.done) duelRound(s, d); return d.win; }

function sidePower(s, f, ids, troops, { attacking, outnumbered }) {
  const k = K(), g = ids.length ? best(ids, 'lead') : null, lead = g ? gen(g).lead : k.neutralStat;
  const war = ids.length ? Math.max(...ids.map((x) => gen(x).war)) : k.neutralStat;
  let m = 1;
  for (const id of ids) m += (fx(id, 'atk') + (attacking ? fx(id, 'raid') : 0) + (outnumbered ? fx(id, 'few') : 0)) * (id === g ? 1 : 0.5) + (attacking ? 0 : fx(id, 'def') * (id === g ? 1 : 0.5));
  if (f >= 0) m += bondFx(s, f, ids, 'atk') + (attacking ? 0 : bondFx(s, f, ids, 'def'));
  return troops * (0.6 + 0.4 * lead / 100 + 0.2 * war / 100) * m;
}

export function resolveBattle(s, m, duelWin = null, duel = null) {
  loadMap(s);
  const k = K(), T = s.cities[m.to], o = T.owner, dGens = defenders(s, m.to);
  let aMul = (m.terr ?? 1) * (isWinter(s) ? 1 - k.snowPen : 1), dMul = 1;
  if (duel) {
    const loser = duelWin === 'a' ? duel.d : duelWin === 'd' ? duel.a : null;
    ev(s, { k: 'duel', f: m.f, c: m.to, a: duel.a, d: duel.d, win: duelWin, fd: o, rival: duel.rival });
    if (duelWin === 'a') { T.troops = Math.round(T.troops * (1 - k.duelLoss)); aMul += k.duelWinAtk; }
    if (duelWin === 'd') { m.troops = Math.round(m.troops * (1 - k.duelLoss)); dMul += k.duelWinAtk; }
    if (loser && !fx(loser, 'safe') && rnd(s) < k.duelCapture) {
      const capF = duelWin === 'a' ? m.f : o;
      if (duelWin === 'a') dGens.splice(dGens.indexOf(loser), 1); else m.gens.splice(m.gens.indexOf(loser), 1);
      capture(s, loser, capF, m.to);
      if (duelWin === 'd' && o >= 0 && s.gens[loser].f === o) dGens.push(loser); // won over by the defenders: he now stands on the walls
    }
  }
  let A = m.troops, D = T.troops;
  const walls = wallMul(T);
  for (let r = 0; r < k.rounds && A > 0 && D > 0; r++) {
    const pa = sidePower(s, m.f, m.gens, A, { attacking: true, outnumbered: A < D }) * aMul;
    const pd = sidePower(s, o, dGens, D, { attacking: false, outnumbered: D < A }) * dMul * walls;
    A = Math.max(0, Math.round(A - pd * k.roundLoss * (0.8 + 0.4 * rnd(s))));
    D = Math.max(0, Math.round(D - pa * k.roundLoss * (0.8 + 0.4 * rnd(s))));
    T.def = Math.max(20, T.def - 2);
    if (D > 0 && D < m.troops * 0.12 && A > D * 3) D = 0; // the garrison gives up
  }
  const won = D <= 0 && A > 0;
  ev(s, { k: won ? 'take' : 'repel', f: m.f, c: m.to, from: m.from, fd: o, lostA: m.troops - A, lostD: T.troops - D, gens: [...m.gens], left: A, pass: !!T.pass });
  if (won) {
    T.owner = m.f; T.troops = Math.min(k.maxTroops, A); T.def = Math.max(20, T.def - k.siegeDef);
    for (const id of m.gens) s.gens[id].c = m.to;
    for (const id of dGens) {
      const home = o >= 0 ? ADJ[m.to].find(({ c }) => s.cities[c].owner === o) : null;
      if (home && (fx(id, 'safe') || rnd(s) < k.flee)) { s.gens[id].c = home.c; ev(s, { k: 'flee', f: o, g: id, c: home.c, by: m.f }); }
      else if (fx(id, 'safe')) hide(s, id, pick(s, CITY_IDS));
      else capture(s, id, m.f, m.to);
    }
    checkFaction(s, o);
  } else {
    T.troops = D;
    retreat(s, m, A);
  }
}

function enterCity(s, m) {
  const T = s.cities[m.to];
  T.troops = Math.min(K().maxTroops, T.troops + m.troops);
  for (const id of m.gens) s.gens[id].c = m.to;
}
function retreat(s, m, troops) {
  // every officer goes back where he came from (if still ours); the troops go with the first one
  const back = (c) => (c && s.cities[c].owner === m.f ? c : null);
  const fallback = back(m.from) || ownedBy(s, m.f).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0] || null;
  if (!fallback) { for (const id of m.gens) hide(s, id, pick(s, CITY_IDS)); return; }
  s.cities[fallback].troops = Math.min(K().maxTroops, s.cities[fallback].troops + troops);
  for (const id of m.gens) s.gens[id].c = back(m.home && m.home[id]) || fallback;
}
function hide(s, id, c) { Object.assign(s.gens[id], { f: -1, c: CITIES[c] && !CITIES[c].pass ? c : CITY_IDS[0], hidden: true, guard: false, rumor: false }); }
// a captured officer: the captor tries to win him over, otherwise lets him go (he hides somewhere)
function capture(s, id, byF, c) {
  const k = K(), from = s.gens[id].f;
  if (byF < 0) { hide(s, id, pick(s, CITY_IDS)); return; }
  const mine = factionGens(s, byF);
  let p = k.recruit + Math.max(0, ...mine.map((x) => fx(x, 'recruit')));
  if (BONDS.some((b) => b.m.includes(id) && b.m.some((x) => x !== id && mine.includes(x)))) p += k.recruitBond;
  if (from >= 0 && s.factions[from] && s.factions[from].lord === id) p += k.recruitLord;
  if (rnd(s) < p) { Object.assign(s.gens[id], { f: byF, c: ownedBy(s, byF).includes(c) ? c : ownedBy(s, byF)[0], hidden: false, guard: false, loyal: 60 }); ev(s, { k: 'recruit', f: byF, g: id, from }); }
  else { hide(s, id, pick(s, CITY_IDS)); ev(s, { k: 'release', f: byF, g: id, from }); }
  if (from >= 0) fixLord(s, from);
}
function fixLord(s, f) {
  const fa = s.factions[f];
  if (!fa || fa.player || !fa.alive) return;
  if (fa.lord && s.gens[fa.lord].f === f) return;
  const next = byLead(factionGens(s, f))[0];
  if (next) { fa.lord = next; ev(s, { k: 'newlord', f, g: next }); }
}
// a lord with no city left is gone, even if he still holds a pass (the pass goes back to nobody)
function checkFaction(s, f) {
  if (f < 0) return;
  const fa = s.factions[f];
  if (!fa.alive || citiesOf(s, f).length) { fixLord(s, f); return; }
  fa.alive = false;
  for (const c of ownedBy(s, f)) s.cities[c].owner = -1;
  for (const id of factionGens(s, f)) hide(s, id, s.gens[id].c || pick(s, CITY_IDS));
  ev(s, { k: 'fall', f });
}

// ---------------------------------------------------------------- random events (v0.8.1)
// one random Markham event most months, plus the fixed ones (Lunar New Year fair, the harvest)
const owned = (s) => CITY_IDS.filter((c) => s.cities[c].owner >= 0);
export const EVENTS = {
  nightmarket: (s) => { const c = pick(s, CITY_IDS.filter((x) => CITIES[x].depot && s.cities[x].owner >= 0)); if (!c) return null; const o = s.cities[c].owner, n = Math.round(150 + rnd(s) * 100); s.factions[o].gold += n; return { c, f: o, n }; },
  bumper: (s) => { const c = pick(s, owned(s)); if (!c) return null; const o = s.cities[c].owner; s.factions[o].food += 400; return { c, f: o, n: 400 }; },
  volunteers: (s) => { const c = pick(s, owned(s)); if (!c) return null; const C = s.cities[c], n = Math.min(300, capOf(C) - C.troops); if (n <= 0) return null; C.troops += n; return { c, f: C.owner, n }; },
  merchant: (s) => { const fs = s.factions.filter((x) => x.alive); const fa = pick(s, fs); fa.gold += 120; return { f: fa.id, n: 120 }; },
  blizzard: (s) => { if (!isWinter(s)) return null; const c = pick(s, owned(s)); if (!c) return null; const C = s.cities[c], n = Math.round(C.troops * 0.06); C.troops -= n; return { c, f: C.owner, n }; },
  icestorm: (s) => { if (![12, 1, 2, 3].includes(dateOf(s).month)) return null; const c = pick(s, owned(s)); if (!c) return null; const C = s.cities[c], n = Math.min(10, C.def - 20); if (n <= 0) return null; C.def -= n; return { c, f: C.owner, n }; },
  flood: (s) => { if (![4, 5].includes(dateOf(s).month)) return null; const c = pick(s, CITY_IDS.filter((x) => CITIES[x].valley && s.cities[x].owner >= 0)); if (!c) return null; const C = s.cities[c], n = Math.round(C.troops * 0.05); C.troops -= n; C.dev = Math.max(0, C.dev - 4); return { c, f: C.owner, n }; },
  riot: (s) => { const c = pick(s, owned(s).filter((x) => s.cities[x].dev < 45)); if (!c) return null; const C = s.cities[c], n = Math.round(C.troops * 0.1); C.troops -= n; return { c, f: C.owner, n }; },
  sighting: (s) => { const g = pick(s, Object.values(s.gens).filter((x) => x.hidden && !x.rumor).map((x) => x.id)); if (!g) return null; s.gens[g].rumor = true; return { g, c: s.gens[g].c }; },
};
export const EVENT_IDS = Object.keys(EVENTS);
function randomEvents(s) {
  const k = K(), m = dateOf(s).month;
  if (m === 2) { for (const fa of s.factions) if (fa.alive) fa.gold += k.cnyGold * citiesOf(s, fa.id).length; ev(s, { k: 'event', id: 'cny', n: k.cnyGold }); } // 春节庙会
  if (rnd(s) >= k.eventChance) return;
  for (let tries = 0; tries < 4; tries++) {
    const id = pick(s, EVENT_IDS), r = EVENTS[id](s);
    if (r) { ev(s, { k: 'event', id, ...r }); return; }
  }
}

export function endTurn(s) {
  loadMap(s);
  const k = K();
  randomEvents(s);
  for (const fa of s.factions) {
    if (!fa.alive) continue;
    if (s.cities[fa.cap].owner !== fa.id) { // capital lost: the strongest city becomes the new one
      const c = citiesOf(s, fa.id).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0];
      if (c) { fa.cap = c; ev(s, { k: 'capital', f: fa.id, c }); }
    }
    const sup = supplied(s, fa.id);
    let troops = 0;
    for (const c of ownedBy(s, fa.id)) {
      const C = s.cities[c];
      C.def = Math.min(defMaxOf(C), C.def + (C.pass ? k.passDefRegen : k.defRegen));
      if (!sup.has(c)) { C.troops = Math.round(C.troops * (1 - k.cutLoss)); ev(s, { k: 'cut', f: fa.id, c }); }
      else if (!C.pass) {
        fa.gold += Math.round(k.goldBase + C.dev * k.goldPerDev);
        const food = Math.round((k.foodBase + C.dev * k.foodPerDev) * (1 + (CITIES[c].valley ? k.valleyFood : 0) + (CITIES[c].depot ? k.depotFood : 0)));
        fa.food += dateOf(s).month === 9 ? food * (1 + k.harvest) : food; // 秋收
      }
      troops += C.troops;
    }
    for (const a of s.armies) if (a.f === fa.id) troops += a.troops; // armies on the road eat too
    fa.food -= Math.round(troops * k.foodPerTroop);
    if (fa.food < 0) { fa.food = 0; for (const c of ownedBy(s, fa.id)) s.cities[c].troops = Math.round(s.cities[c].troops * (1 - k.hungerLoss)); ev(s, { k: 'hunger', f: fa.id }); }
    fixLord(s, fa.id);
  }
  for (const c of NODE_IDS) {
    const C = s.cities[c], max = C.pass ? (CITIES[c].big ? k.passBigTroops : k.passTroops[1]) : k.neutralMax;
    if (C.owner === -1 && C.troops < max) C.troops = Math.min(max, C.troops + k.neutralRegen);
  }
  // the coalition: when one lord holds half of Markham, the others stop fighting each other
  const alive = s.factions.filter((f) => f.alive);
  const lead = alive.find((f) => citiesOf(s, f.id).length >= k.coalitionAt);
  const L = lead && alive.length >= 3 ? lead.id : null;
  if (L !== s.coalition) { ev(s, { k: L === null ? 'coalitionEnd' : 'coalition', f: L === null ? s.coalition : L }); s.coalition = L; }
  // armies still on the road: one month nearer (the armies of a fallen lord have broken up)
  s.armies = s.armies.filter((a) => s.factions[a.f].alive);
  for (const a of s.armies) a.left--;
  if (dateOf(s).month === 9) ev(s, { k: 'harvest' });
  const mine = citiesOf(s, PLAYER).length;
  if (mine === CITY_IDS.length) s.over = 'win';
  else if (!mine) s.over = 'lose';
  if (s.over) ev(s, { k: s.over });
  s.turn++; s.phase = 'orders';
  return s.events;
}

// one whole month with computer duels; returns the month's events
export function runTurn(s, orders = {}) {
  beginTurn(s, orders);
  for (let b = nextBattle(s); b; b = nextBattle(s)) resolveBattle(s, b.m, b.duel ? autoDuel(s, b.duel) : null, b.duel);
  return endTurn(s);
}

// a computer plays the player's side too (tests / balance)
export function autoPlayer(s) { return aiOrders(s, PLAYER); }
// 委任: give every officer without an order a peaceful job (develop, draft, search, fortify, spread out)
export function autoAssign(s, orders = {}) {
  const spent = Object.values(orders).reduce((a, o) => a + orderCost(o), 0);
  return { ...aiOrders(s, PLAYER, { war: false, skip: new Set(Object.keys(orders)), gold: s.factions[PLAYER].gold - spent }), ...orders };
}
export function factionName(s, f, zh = true) {
  if (f < 0) return zh ? '空城' : 'Unclaimed';
  const fa = s.factions[f];
  if (fa.player) return zh ? '你' : 'You';
  const g = gen(fa.lord);
  return zh ? g.zh + '军' : g.en + "'s army";
}
