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
//           duelRound(s, duel, move)    -> one round of a duel: the reader's answer to the stance (null = computer)
//           resolveBattle(s, m, winner) -> the siege is fought ('a' / 'd' / null = duel result)
//           endTurn(s)                  -> income, upkeep, supply, coalition, victory, next month
// runTurn() does all of it with computer duels (tests, simulations).
import { CFG } from './config.js';
import { COUNTERS, TIMELY, BUILDINGS, PASS_BLD, SPECIALTY, ITEMS, ITEM_IDS, GENERALS, GEN_IDS, SANGUO_IDS, TRAIT_FX, BONDS, RIVALS, CITY_IDS, PASS_IDS, NODE_IDS, CITIES, ADJ, FACTION_COLORS, CLASSIC, useMap, currentMapKey } from './sg_data.js';
import { SITES, PARKS, PAIRS } from './sg_sites.js';
import { cityKind } from './sg_art.js';

export const SAVE_V = 6; // v1.1: treasures, truces, poaching
const K = () => CFG.sg;
// v1.4 (D-115): buildings. bldLv counts the specialty bonus (one level more, once built)
export const bldRaw = (city, b) => (city && city.bld && city.bld[b]) || 0;
export const isSpecialty = (city, b) => !!city && SPECIALTY[cityKind(city.id)] === b;
export const bldLv = (city, b) => { const L = bldRaw(city, b); return L && isSpecialty(city, b) ? L + 1 : L; };
export const capOf = (city) => (city.pass ? K().passCap + bldLv(city, 'barracks') * K().bldCap : Math.min(K().maxTroops + bldLv(city, 'barracks') * K().bldCap, Math.round(K().capBase + city.dev * K().capPerDev) + bldLv(city, 'barracks') * K().bldCap));
export const defMaxOf = (city) => (city.pass ? K().passDefMax : K().defMax) + bldLv(city, 'walls') * K().bldWall;

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
// v1.2 (D-103): how hard the computer lords are in this game (CFG.sg.diff): months of grace, the odds they
// want before attacking, and how much better than you they run their lands
export const DIFFS = ['normal', 'hard', 'hell'];
export const D = (s) => K().diff[(s && s.diff) || K().diffDefault] || K().diff[K().diffDefault];
let CUR = null; // the game being played: treasures change an officer's stats, so gen() has to know whose game it is
export function loadMap(s) { CUR = s; if (s.map && s.map.key !== currentMapKey()) useMap(s.map); return s; }

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
// an officer's stats in the current game: his own plus his treasure's (v1.1, D-97), at most 110
const BOOST = new Map();
export const itemOf = (id) => (CUR && CUR.gens && CUR.gens[id] && CUR.gens[id].item) || null;
export function gen(id) {
  const it = itemOf(id);
  if (!it || !ITEMS[it]) return GENERALS[id];
  const key = id + '|' + it;
  let g = BOOST.get(key);
  if (!g) { const b = GENERALS[id], f = ITEMS[it].fx; g = { ...b }; for (const k of ['lead', 'war', 'int', 'pol']) if (f[k]) g[k] = Math.min(110, b[k] + f[k]); BOOST.set(key, g); }
  return g;
}
export const itemFx = (id, k) => { const it = itemOf(id); return (it && ITEMS[it].fx[k]) || 0; };
export const fx = (id, k) => (TRAIT_FX[gen(id).trait] || {})[k] || 0;
export const gensIn = (s, c, f) => Object.values(s.gens).filter((g) => g.c === c && g.f === f && !g.hidden).map((g) => g.id);
export const guardsIn = (s, c) => Object.values(s.gens).filter((g) => g.guard && g.c === c).map((g) => g.id);
export const ownedBy = (s, f) => NODE_IDS.filter((c) => s.cities[c].owner === f);      // cities and passes
export const citiesOf = (s, f) => CITY_IDS.filter((c) => s.cities[c].owner === f);    // cities only
export const factionGens = (s, f) => Object.values(s.gens).filter((g) => g.f === f && !g.hidden && f >= 0).map((g) => g.id);
export const byLead = (ids) => [...ids].sort((a, b) => gen(b).lead - gen(a).lead);
export const byWar = (ids) => [...ids].sort((a, b) => gen(b).war - gen(a).war);
const best = (ids, k) => ids.reduce((m, id) => (m && gen(m)[k] >= gen(id)[k] ? m : id), null);
export const dateOf = (s) => ({ year: K().startYear + Math.floor(s.turn / 12), month: (s.turn % 12) + 1 });
export const adjacent = (a, b) => ADJ[a].some((x) => x.c === b);
export const linkOf = (a, b) => ADJ[a].find((x) => x.c === b) || null;
// the road an army takes from a to b (v0.9.8): the quickest way through nodes of f (any number of
// roads, 驿站 roads count faster); the last road may end at someone else's node. Falls back to [a, b].
const legTime = (x, y, l) => Math.hypot(CITIES[x].x - CITIES[y].x, CITIES[x].z - CITIES[y].z) / (K().marchSpeed * (l.station ? K().relaySpeed : 1));
function roads(s, f, a) { // quickest times from a through f's own nodes; foreign nodes are reached but not passed
  const d = { [a]: 0 }, prev = {}, done = new Set();
  for (;;) {
    let c = null;
    for (const n in d) if (!done.has(n) && (c === null || d[n] < d[c])) c = n;
    if (c === null) break;
    done.add(c);
    if (c !== a && s.cities[c].owner !== f) continue;
    for (const l of ADJ[c]) { const t = d[c] + legTime(c, l.c, l); if (d[l.c] === undefined || t < d[l.c] - 1e-9) { d[l.c] = t; prev[l.c] = c; } }
  }
  return { d, prev };
}
export function routeOf(s, f, a, b) {
  loadMap(s);
  const { prev } = roads(s, f, a);
  if (prev[b] === undefined) return [a, b];
  const r = [b];
  while (r[0] !== a) r.unshift(prev[r[0]]);
  return r;
}
// every node an officer in c can reach within maxMarch months: own nodes (move) or others' (march)
function reach(s, f, c) {
  const { d } = roads(s, f, c), lim = K().maxMarch;
  return Object.keys(d).filter((n) => n !== c && Math.max(1, Math.ceil(d[n] - 0.15)) <= lim);
}
export const marchTargets = (s, f, c) => { loadMap(s); return reach(s, f, c).filter((n) => s.cities[n].owner !== f); };
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
// the month's weather (was only on screen; v1.4 lets it matter for TIMELY officers)
export function weatherKey(s) {
  const m = dateOf(s).month, r = (s.turn * 7 + (s.seed || 0)) % 3;
  return isWinter(s) ? 'snow' : m === 9 ? 'harvest' : m <= 5 ? ['sun', 'rain', 'cloud'][r] : m <= 8 ? ['sun', 'hot', 'sun'][r] : ['sun', 'wind', 'cloud'][r];
}
// v1.4 (D-114): historical counters and the right weather. countersOf: pairs where one of `ids` beat one of `foes`
export function countersOf(ids, foes, defending = false) {
  const out = [];
  for (const c of COUNTERS) {
    if (c.def && !defending) continue;
    const a = ids.find((x) => c.a.includes(x)), b = a && foes.find((x) => c.b.includes(x));
    if (a && b) out.push({ c, a, b });
  }
  return out;
}
export function timelyOf(s, ids, river = false) {
  const w = weatherKey(s), dry = (seasonOf(s) === 'autumn' || seasonOf(s) === 'winter') && w !== 'rain', out = [];
  for (const t of TIMELY) {
    const id = ids.find((x) => t.m.includes(x));
    if (!id) continue;
    if (t.when === 'rain' ? w === 'rain' : t.when === 'dry' ? dry : t.when === 'snow' ? w === 'snow' : t.when === 'river' ? river : false) out.push({ t, id });
  }
  return out;
}
export const snowproof = (ids) => ids.some((x) => TIMELY.some((t) => t.snowproof && t.m.includes(x)));
const snowPenOf = (s, ids) => (isWinter(s) && !snowproof(ids) ? K().snowPen : 0);
const crossesRiver = (army) => { const r = army && army.route; if (!r || r.length < 2) return false; const l = linkOf(r[r.length - 2], r[r.length - 1]); return !!(l && l.river); };
export const wallMul = (city) => (1 + city.def / K().defDiv) * (city.pass ? K().passMul : 1);

// bonds active for a set of generals (army) of faction f
export function activeBonds(s, f, ids) {
  if (f < 0) return [];
  const fac = new Set(factionGens(s, f)), army = new Set(ids || []);
  return BONDS.filter((b) => b.m.filter((m) => (b.scope === 'army' ? army : fac).has(m)).length >= b.need);
}
// v1.6 (D-120): every bond that can happen in this game (enough of its members drawn) or that f has a member of,
// with where each member is: 'mine' | 'wild' (hiding in city c) | 'guard' (holding a pass) | 'lord' (serving f2) | 'out'
export function bondView(s, f) {
  const out = [];
  for (const b of BONDS) {
    const there = b.m.filter((m) => s.gens[m]), have = b.m.filter((m) => s.gens[m] && s.gens[m].f === f);
    if (there.length < b.need && !have.length) continue;
    const where = Object.fromEntries(b.m.map((m) => {
      const G = s.gens[m];
      return [m, !G ? { k: 'out' } : G.f === f ? { k: 'mine', c: G.c } : G.hidden ? { k: 'wild', c: G.c } : G.guard ? { k: 'guard', c: G.c } : G.f >= 0 ? { k: 'lord', f: G.f, c: G.c } : { k: 'wild', c: G.c }];
    }));
    out.push({ b, have, need: b.need, ready: have.length >= b.need, possible: there.length >= b.need, where });
  }
  return out.sort((x, y) => (y.ready - x.ready) || (y.have.length / y.need - x.have.length / x.need) || (y.possible - x.possible));
}
// a bond switched on or off for the player this month: a card for each (faction bonds work at once, army bonds once
// enough of them march together)
function checkBonds(s) {
  const now = bondView(s, PLAYER).filter((x) => x.ready).map((x) => x.b.id), was = s.bondsOn || [];
  for (const id of now) if (!was.includes(id)) ev(s, { k: 'bond', f: PLAYER, b: id });
  for (const id of was) if (!now.includes(id)) ev(s, { k: 'bondLost', f: PLAYER, b: id });
  s.bondsOn = now;
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
  if (truceLeft(s, f, g)) return true;
  const L = s.coalition;
  return L !== null && L !== undefined && f !== L && g !== L && g >= 0 && f > 0; // AI members leave each other (and the player) alone
}
// who defends a node: the owner's officers there, or the guard of a neutral pass
export const defenders = (s, c) => (s.cities[c].owner >= 0 ? gensIn(s, c, s.cities[c].owner) : guardsIn(s, c));

// ---------------------------------------------------------------- new game
// opts.map: 'classic' (the fixed map, default: tests) or 'random' (a new board from the seed: the real game)
// rarity (v0.9.5): by the best two stats
export function tierOf(id) {
  const g = GENERALS[id], v = [g.lead, g.war, g.int, g.pol].sort((a, b) => b - a), top = v[0] + v[1];
  if (v[0] >= 100 || top >= 190) return 'UR';
  if (top >= 182) return 'SSR';
  if (top >= 168 || v.reduce((a, b) => a + b, 0) >= 290) return 'SR';
  return 'R';
}
// the officers of one game (v1.0, D-87): rosterSize of them, a few bonds complete enough to switch on,
// then each rarity in proportion to the pool (at most rosterUR UR), so no game is all gods or all foot soldiers
export function drawRoster(s, mode) {
  const k = K(), pool = mode === 'sanguo' ? SANGUO_IDS : GEN_IDS, n = Math.min(k.rosterSize, pool.length), picked = new Set();
  for (const b of shuffle(s, BONDS.filter((b) => b.m.every((m) => pool.includes(m)))).slice(0, k.rosterBonds)) {
    for (const m of shuffle(s, [...b.m]).slice(0, b.need)) picked.add(m);
  }
  const tiers = ['UR', 'SSR', 'SR', 'R'], by = Object.fromEntries(tiers.map((t) => [t, shuffle(s, pool.filter((id) => tierOf(id) === t))]));
  const want = Object.fromEntries(tiers.map((t) => [t, Math.round(n * by[t].length / pool.length)]));
  want.UR = Math.min(want.UR, k.rosterUR);
  for (const t of tiers) for (const id of by[t]) {
    if ([...picked].filter((x) => tierOf(x) === t).length >= want[t] || picked.size >= n) break;
    picked.add(id);
  }
  for (const id of shuffle(s, pool.filter((x) => !picked.has(x) && tierOf(x) !== 'UR'))) { if (picked.size >= n) break; picked.add(id); }
  return [...picked].slice(0, n);
}
export function newGame(seed = Date.now(), opts = {}) {
  const k = K(), names = opts.names || {};
  const map = opts.map === 'random' ? genMap(seed) : CLASSIC;
  const s = { v: SAVE_V, seed: seed >>> 0, r: seed >>> 0, turn: 0, factions: [], cities: {}, gens: {}, coalition: null, over: null, log: [], queue: [], phase: 'orders', orders: {}, map, armies: [], nextArmy: 1, diff: DIFFS.includes(opts.diff) ? opts.diff : k.diffDefault };
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
  // v1.0 (D-87): a game draws its own officers (roster 'mix' from every era, 'sanguo' from the 三国 48);
  // without one it is the classic game with all 48 三国 officers (tests, old simulations)
  s.roster = opts.roster || 'classic';
  const pool = shuffle(s, opts.roster ? drawRoster(s, opts.roster) : [...SANGUO_IDS]);
  for (let f = 0; f < 4; f++) {
    const drawn = [pool.pop(), pool.pop()], cap = starts[f];
    s.factions.push({ id: f, player: f === PLAYER, lord: f === PLAYER ? null : drawn[0], name: f === PLAYER ? (names.player || null) : null, color: FACTION_COLORS[f], cap, alive: true, gold: k.startGold, food: k.startFood });
    Object.assign(s.cities[cap], { owner: f, troops: Math.round(k.startTroops * (f !== PLAYER ? D(s).start : 1)), dev: 50, def: 60 });
    for (const id of drawn) s.gens[id] = { id, f, c: cap, hidden: false, loyal: 85 + fx(id, 'loyal') };
  }
  // everyone else hides somewhere in Markham (cities only): the blind boxes found by searching
  const order = shuffle(s, [...CITY_IDS]);
  pool.forEach((id, i) => { s.gens[id] = { id, f: -1, c: order[i % order.length], hidden: true, loyal: 70 }; });
  // the strongest officer still at large holds Toogood 虎牢关 for nobody (like Lü Bu at Hulao)
  const big = PASS_IDS.find((c) => CITIES[c].big);
  const guard = pool.reduce((m, id) => (m && gen(m).war >= gen(id).war ? m : id), null);
  if (big && guard) Object.assign(s.gens[guard], { c: big, hidden: false, guard: true });
  // v1.6 (D-120): a bond to chase from the start (games with a drawn roster): you get one of its members, and word
  // of another one hiding in a city near your capital
  if (opts.roster) {
    const P = s.factions[PLAYER], cap = P.cap, mine = factionGens(s, PLAYER);
    const b = shuffle(s, BONDS.filter((x) => x.m.filter((m) => s.gens[m] && s.gens[m].hidden).length >= 2))[0];
    if (b) {
      const [m1, m2] = shuffle(s, b.m.filter((m) => s.gens[m] && s.gens[m].hidden));
      const out = mine.find((x) => !b.m.includes(x)) || mine[mine.length - 1];
      Object.assign(s.gens[out], { f: -1, c: s.gens[m1].c, hidden: true, loyal: 70 });
      Object.assign(s.gens[m1], { f: PLAYER, c: cap, hidden: false, guard: false, loyal: 85 + fx(m1, 'loyal') });
      const h = hops(cap), near = CITY_IDS.filter((c) => c !== cap && s.cities[c].owner === -1).sort((x, y) => h[x] - h[y])[0];
      if (near) s.gens[m2].c = near;
      s.lead = { b: b.id, g: m2, c: s.gens[m2].c };
    }
  }
  s.bondsOn = bondView(s, PLAYER).filter((x) => x.ready).map((x) => x.b.id);
  // v1.1 (D-97): this game's treasures, drawn with a generator of their own so older seeds play as before
  let r2 = (s.seed ^ 0x9e3779b9) >>> 0;
  const rnd2 = () => { r2 = (Math.imul(r2, 1664525) + 1013904223) >>> 0; return r2 / 4294967296; };
  const all = [...ITEM_IDS];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd2() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  let ur = 0;
  s.items = all.filter((id) => ITEMS[id].tier !== 'UR' || ur++ < k.itemUR).slice(0, k.itemCount);
  s.truce = {};
  return s;
}

const ev = (s, e) => { e.t = s.turn; s.log.push(e); if (s.log.length > 60) s.log.shift(); s.events.push(e); return e; };
export const hiddenIn = (s, c) => Object.values(s.gens).filter((g) => g.hidden && g.c === c).map((g) => g.id);

// ---------------------------------------------------------------- orders
// one order per officer: orders = { [general id]: { cmd, to, n } }
// cmd: 'draft' | 'search' | 'fort' | 'move' | 'march'   (n = troops taken along)
//      'plot' (计略) with kind 'rumor' (流言: troops desert) or 'fire' (火计: walls burn) against a neighbour
export const COST = { build: 'bldCost', dev: 'devCost', draft: 'draftCost', fort: 'fortCost', plot: 'plotCost', envoy: 'envoyCost', poach: 'poachCost' };
// ---- truces (v1.1, D-98): an envoy buys a few months of peace with one lord
const tKey = (f, g) => (f < g ? f + '-' + g : g + '-' + f);
export const truceLeft = (s, f, g) => (f < 0 || g < 0 || f === g || !s.truce ? 0 : Math.max(0, (s.truce[tKey(f, g)] || 0) - s.turn));
export function envoyChance(s, f, id, tf) {
  const k = K(), mine = citiesOf(s, f).length, theirs = citiesOf(s, tf).length;
  let p = k.envoyBase + (gen(id).pol - 60) * k.envoyPol + (theirs >= mine + 2 ? -k.envoyStrong : theirs < mine ? k.envoyWeak : 0);
  if (s.coalition === f) p *= k.envoyCoalition; // the lords have sworn to bring you down
  return Math.max(0.05, Math.min(0.9, p));
}
// ---- poaching (v1.1, D-98): talk an enemy officer next door into changing sides
export function poachTargets(s, f, c) {
  const out = [];
  for (const { c: n } of ADJ[c]) { const o = s.cities[n].owner; if (o < 0 || o === f) continue; for (const g of gensIn(s, n, o)) if (s.factions[o].lord !== g) out.push(g); }
  return out;
}
export function poachChance(s, f, id, tid) {
  const k = K(), T = s.gens[tid], mine = factionGens(s, f);
  let p = (100 - (T.loyal ?? 70)) / 100 * k.poachLoyal + (gen(id).int - 70) * k.poachInt;
  if (BONDS.some((b) => b.m.includes(tid) && b.m.some((x) => x !== tid && mine.includes(x)))) p += k.poachBond;
  if (T.f >= 0 && citiesOf(s, T.f).length <= 1) p += k.poachLosing;
  return Math.max(0.03, Math.min(0.8, p));
}
// ---- treasures: who carries what
// a found treasure goes to the finder; if he has one already, to the best officer of his without one
function giveItem(s, f, finder, item) {
  const free = (id) => !s.gens[id].item;
  const key = ITEMS[item].fx.war ? 'war' : ITEMS[item].fx.int ? 'int' : ITEMS[item].fx.pol ? 'pol' : 'lead';
  const to = free(finder) ? finder : best(factionGens(s, f).filter(free), key);
  if (!to) return null;
  s.gens[to].item = item;
  return to;
}
// the player hands a treasure from one of his officers to another (no order needed, they swap)
export function passItem(s, from, to) {
  const A = s.gens[from], B = s.gens[to];
  if (!A || !B || A.f !== B.f || A.f < 0 || !A.item || from === to) return false;
  [A.item, B.item] = [B.item || null, A.item];
  if (!A.item) delete A.item;
  return true;
}
export const PLOTS = ['rumor', 'fire', 'grain'];
// chance that a stratagem by officer id works against node c
export function plotChance(s, id, c) {
  const k = K(), d = defenders(s, c), dInt = d.length ? Math.max(...d.map((x) => gen(x).int)) : k.neutralStat;
  return Math.max(0.1, Math.min(k.plotMax, k.plotBase + (gen(id).int - dInt) * k.plotInt + fx(id, 'plot')));
}
// v0.9.5 (D-82): a good administrator (政治) gets things done for less: x1.15 at 政治 20 down to x0.75 at 100
export const costOf = (cmd, id) => (COST[cmd] ? Math.round(K()[COST[cmd]] * (id && GENERALS[id] ? Math.min(K().costMax, Math.max(K().costMin, K().costMax - gen(id).pol * K().costPerPol)) : 1)) : 0);
export const orderCost = (o, id) => (o && COST[o.cmd] ? costOf(o.cmd, id) : 0);
// what an officer would achieve (the numbers the order buttons show, and what runOrder does).
// v1.2 (D-102): the curves are squares of the stat, so a 文官 and a 武将 are far apart at each other's work
// v1.5 (D-116): no more 内政 order. A city grows by itself every month: a little with nobody there, much more with a
// good governor (the officer with the best 政治 stationed in it, squared like every other job). devAmt is that
// monthly growth (one decimal) for officer id governing city; id = null means nobody is there.
export function devAmt(s, f, id, city = null) {
  const k = K(), base = id ? k.growBase + k.growMax * (gen(id).pol / 100) ** k.effExp : k.growBase * k.growAlone;
  return Math.round(base * (1 + (id ? fx(id, 'dev') + bondFx(s, f, [id], 'dev') : 0) + bldLv(city, 'academy') * k.bldAcadDev) * 10) / 10;
}
// v1.7 (D-123): 军粮. Food comes mostly with the September harvest (a trickle the rest of the year), every soldier at
// home eats every month, and an army takes its rations with it when it sets off.
export const foodIn = (s, base) => Math.round(base * (dateOf(s).month === 9 ? K().foodTrickle + K().harvestMonths : K().foodTrickle));
// rations for n soldiers on a road of so many months (and the month of fighting at the end)
export const rationsOf = (n, months) => Math.round(n * (months + 1) * K().foodPerTroop * K().marchFood);
// the most soldiers lord f could feed on such a road now
export const feedable = (s, f, months) => Math.floor(s.factions[f].food / ((months + 1) * K().foodPerTroop * K().marchFood));
// what lord f's soldiers at home eat in a month, and how many months his granary lasts at that rate
export function foodUse(s, f) { return Math.round(ownedBy(s, f).reduce((a, c) => a + s.cities[c].troops, 0) * K().foodPerTroop); }
export function foodMonths(s, f) { const u = foodUse(s, f); return u ? Math.floor(s.factions[f].food / u) : 99; }
// rice prices (gold per 100 food): cheap after the harvest, dear before it; selling fetches sellRate of that
export function ricePrice(s) { const m = dateOf(s).month, k = K(); return Math.round(k.ricePrice * (m >= 9 && m <= 11 ? k.riceCheap : m >= 4 && m <= 8 ? k.riceDear : 1)); }
export const riceSell = (s) => Math.round(ricePrice(s) * K().sellRate);
// buy (n > 0) or sell (n < 0) food at the market, at once; at most tradeMax a month each way
export function trade(s, f, n) {
  const fa = s.factions[f], k = K(), done = (s.traded = s.traded || {})[f] || 0;
  n = Math.round(n / 100) * 100;
  if (!n || Math.abs(done + n) > k.tradeMax) return false;
  if (n > 0) { const cost = n / 100 * ricePrice(s); if (fa.gold < cost) return false; fa.gold -= cost; fa.food += n; }
  else { if (fa.food < -n) return false; fa.food += n; fa.gold += -n / 100 * riceSell(s); }
  s.traded[f] = done + n;
  return true;
}
// a city's gold and food a month for its owner (food: the base the harvest and the trickle are made of)
export function cityIncome(s, c) {
  const k = K(), C = s.cities[c], ai = C.owner >= 0 && C.owner !== PLAYER;
  if (C.pass || C.owner < 0) return [0, 0];
  return [Math.round((k.goldBase + C.dev * k.goldPerDev) * (ai ? D(s).gold : 1) * (1 + bldLv(C, 'market') * k.bldMarket)),
    Math.round((k.foodBase + C.dev * k.foodPerDev) * (1 + (CITIES[c].valley ? k.valleyFood : 0) + (CITIES[c].depot ? k.depotFood : 0)) * (ai ? D(s).food : 1) * (1 + bldLv(C, 'farm') * k.bldFarm))];
}
export const governorOf = (s, c) => { const C = s.cities[c], gs = C && C.owner >= 0 ? gensIn(s, c, C.owner) : []; return gs.length ? best(gs, 'pol') : null; };
export const growthOf = (s, c) => { const C = s.cities[c]; return C.pass || C.owner < 0 || C.dev >= 100 ? 0 : devAmt(s, C.owner, governorOf(s, c), C); };
export function draftAmt(id, city = null) { const k = K(); return Math.round((k.draftBase + k.draftMax * (gen(id).lead / 100) ** k.effExp) * (1 + fx(id, 'draft') + bldLv(city, 'barracks') * k.bldDraft)); }
export function searchChance(s, f, id, city = null) { const k = K(); return Math.min(0.95, k.searchBase + k.searchMax * (gen(id).int / 100) ** k.searchExp + fx(id, 'search') + bondFx(s, f, [id], 'search') + bldLv(city, 'academy') * k.bldAcadSearch); }
export function fortAmt(id) { const k = K(), G = gen(id); return Math.round(k.fortBase + k.fortMax * (Math.max(G.lead, G.pol) / 100) ** k.effExp + (fx(id, 'def') > 0 ? 4 : 0)); }
// v0.9.6 (D-83, the 总决策's rule): an army fights in proportion to its 武力 (the best one at its head),
// so with the same troops the side with the higher 武力 always wins; 统率 decides how many troops an
// officer can lead (commandOf). A garrison without officers fights at neutralStat.
export function statMul(ids) {
  const k = K();
  return (ids.length ? Math.max(...ids.map((x) => gen(x).war)) : k.neutralStat) / 100;
}
export const commandOf = (id) => Math.round(gen(id).lead * K().leadTroops);
export const commandOfAll = (ids) => ids.reduce((a, id) => a + commandOf(id), 0);
// where an officer in c may move (v0.9.8): any node of ours joined to c through our own nodes
export function moveTargets(s, f, c) {
  loadMap(s);
  return reach(s, f, c).filter((n) => s.cities[n].owner === f);
}
export function validOrder(s, f, id, o) {
  loadMap(s);
  const G = s.gens[id];
  if (!o || !G || G.f !== f || G.hidden || !G.c) return false;
  const c = G.c, city = s.cities[c], fa = s.factions[f], k = K();
  if (city.owner !== f) return false;
  switch (o.cmd) {
    case 'draft': return !city.pass && fa.gold >= costOf('draft', id) && city.troops < capOf(city);
    case 'search': return !city.pass;
    case 'fort': return fa.gold >= costOf('fort', id) && city.def < defMaxOf(city);
    case 'build': return canBuild(city, o.b) && fa.gold >= costOf('build', id);
    case 'move': return moveTargets(s, f, c).includes(o.to);
    case 'march': return s.cities[o.to] && s.cities[o.to].owner !== f && !truceLeft(s, f, s.cities[o.to].owner) && marchTargets(s, f, c).includes(o.to) && supplied(s, f).has(c) && city.troops >= k.minMarch && feedable(s, f, travelMonths(routeOf(s, f, c, o.to))) >= k.minMarch;
    case 'envoy': return o.f !== f && !!s.factions[o.f] && s.factions[o.f].alive && !truceLeft(s, f, o.f) && fa.gold >= costOf('envoy', id);
    case 'poach': return !city.pass && !!s.gens[o.g] && poachTargets(s, f, c).includes(o.g) && fa.gold >= costOf('poach', id);
    case 'intercept': return interceptTargets(s, f, c).some((a) => a.id === o.army) && city.troops >= k.minMarch && feedable(s, f, 0) >= k.minMarch;
    case 'plot': return PLOTS.includes(o.kind) && adjacent(c, o.to) && s.cities[o.to].owner !== f && !truceLeft(s, f, s.cities[o.to].owner) && fa.gold >= costOf('plot', id);
    default: return false;
  }
}

// can building b go up a level in this city now? (level 2 needs 开发 40, level 3 needs 65; passes: walls and beacon only)
export function canBuild(city, b) {
  if (!BUILDINGS[b] || (city.pass && !PASS_BLD.includes(b))) return false;
  const L = bldRaw(city, b), k = K();
  return L < 3 && (city.pass || city.dev >= k.bldDev[L]);
}
function runOrder(s, f, id, o) {
  const k = K(), fa = s.factions[f];
  if (!validOrder(s, f, id, o)) { if (s.gens[id] && s.gens[id].f === f) ev(s, { k: 'skip', f, g: id, cmd: o && o.cmd }); return; }
  const c = s.gens[id].c, city = s.cities[c], G = gen(id);
  if (o.cmd === 'draft') {
    const amt = Math.min(capOf(city) - city.troops, Math.round(draftAmt(id, city) * (f !== PLAYER ? D(s).draft : 1)));
    fa.gold -= costOf('draft', id); city.troops += amt;
    ev(s, { k: 'draft', f, c, g: id, n: amt });
  } else if (o.cmd === 'search') {
    const hid = hiddenIn(s, c);
    const p = searchChance(s, f, id, city);
    if (hid.length && rnd(s) < p) {
      const nid = pick(s, hid);
      Object.assign(s.gens[nid], { f, c, hidden: false, rumor: false, loyal: 75 + fx(nid, 'loyal') });
      ev(s, { k: 'found', f, c, g: nid, by: id });
    } else {
      // one roll: gold as before, and above that slice a treasure (v1.1); cleverer officers find more
      const r = rnd(s), pItem = (s.items || []).length ? k.itemBase + gen(id).int * k.itemPerInt : 0;
      if (r < k.treasure[0]) {
        const n = Math.round(k.treasure[1] + rnd(s) * (k.treasure[2] - k.treasure[1]));
        fa.gold += n; ev(s, { k: 'treasure', f, c, g: id, n });
      } else if (r < k.treasure[0] + pItem) {
        const item = s.items.shift(), to = giveItem(s, f, id, item);
        if (to) ev(s, { k: 'item', f, c, g: id, to, item }); else { s.items.push(item); ev(s, { k: 'nothing', f, c, g: id, left: hid.length }); }
      } else ev(s, { k: 'nothing', f, c, g: id, left: hid.length });
    }
  } else if (o.cmd === 'build') {
    fa.gold -= costOf('build', id);
    city.bld = city.bld || {};
    city.bld[o.b] = bldRaw(city, o.b) + 1;
    if (!city.pass) city.dev = Math.min(100, city.dev + k.bldDevUp); // v1.5: building brings people in
    if (o.b === 'walls') city.def = Math.min(defMaxOf(city), city.def + 5);
    ev(s, { k: 'build', f, c, g: id, b: o.b, lv: city.bld[o.b] });
  } else if (o.cmd === 'fort') {
    const amt = fortAmt(id);
    fa.gold -= costOf('fort', id); city.def = Math.min(defMaxOf(city), city.def + amt);
    ev(s, { k: 'fort', f, c, g: id, n: amt });
  } else if (o.cmd === 'plot') {
    const T = s.cities[o.to], ok = rnd(s) < plotChance(s, id, o.to);
    fa.gold -= costOf('plot', id);
    let n = 0;
    if (ok && o.kind === 'rumor') { n = Math.round(T.troops * (k.rumorBase + G.int * k.rumorPerInt)); T.troops -= n; }
    if (ok && o.kind === 'grain') { const of = s.cities[o.to].owner; n = of >= 0 ? Math.min(s.factions[of].food, Math.round(k.grainBase + G.int * k.grainPerInt)) : 0; if (of >= 0) s.factions[of].food -= n; } // v1.7: 烧粮
    if (ok && o.kind === 'fire') { n = Math.min(T.def - 10, Math.round(k.fireBase + G.int * k.firePerInt)); T.def -= Math.max(0, n); T.troops = Math.round(T.troops * 0.97); }
    ev(s, { k: 'plot', f, c, to: o.to, g: id, kind: o.kind, ok, n, fd: T.owner });
  } else if (o.cmd === 'envoy') {
    const ok = rnd(s) < envoyChance(s, f, id, o.f);
    fa.gold -= costOf('envoy', id);
    if (ok) s.truce[tKey(f, o.f)] = s.turn + k.envoyMonths + 1;
    ev(s, { k: 'truce', f, g: id, to: o.f, ok, n: k.envoyMonths });
  } else if (o.cmd === 'poach') {
    const T = s.gens[o.g], from = T.f, ok = rnd(s) < poachChance(s, f, id, o.g);
    fa.gold -= costOf('poach', id);
    if (ok) { Object.assign(T, { f, c, hidden: false, guard: false, loyal: 70 }); fixLord(s, from); }
    else T.loyal = Math.min(100, (T.loyal ?? 70) + k.poachSpurned);
    ev(s, { k: 'poach', f, c, g: id, who: o.g, from, ok }); // not `t`: ev() stamps the turn there (that slip froze the month-end report in v1.1)
  } else if (o.cmd === 'move' || o.cmd === 'march') {
    // the officer sets off with his troops; a short road takes one month (he arrives this month)
    const march = o.cmd === 'march', route = routeOf(s, f, c, o.to), months = travelMonths(route);
    let n = Math.min(commandOf(id), march ? Math.min(city.troops, Math.floor(o.n ?? city.troops * k.marchFrac)) : Math.max(0, Math.min(city.troops, Math.floor(o.n || 0))));
    // v1.7 (D-123): an attack takes its rations along; short of food, only as many go as can be fed
    if (march && n > feedable(s, f, months)) { n = feedable(s, f, months); if (n >= k.minMarch) ev(s, { k: 'rations', f, g: id, n }); }
    if (march && n < k.minMarch) { ev(s, { k: 'skip', f, g: id, cmd: 'march', why: 'food' }); return; }
    if (march) fa.food -= rationsOf(n, months);
    s.gens[id].c = null; // on the road
    city.troops -= n;
    // officers leaving the same city for the same place this month go as one army
    const j = s.armies.find((x) => x.f === f && x.from === c && x.to === o.to && x.kind === o.cmd && x.left === x.total && x.total === months);
    if (j) { j.gens.push(id); j.troops += n; }
    else s.armies.push({ id: s.nextArmy++, f, kind: o.cmd, from: c, to: o.to, route, gens: [id], troops: n, terr: march ? terrain(route[route.length - 2], o.to).m : 1, total: months, left: months });
    ev(s, { k: o.cmd, f, c, to: o.to, n, gens: [id], months });
  } else if (o.cmd === 'intercept') {
    // sally out against an enemy army on a road through this city: a field battle this month, then home
    const A = s.armies.find((a) => a.id === o.army), n = Math.min(commandOf(id), city.troops, Math.floor(o.n ?? city.troops * k.marchFrac), feedable(s, f, 0));
    if (!A || n < k.minMarch) { ev(s, { k: 'skip', f, g: id, cmd: 'intercept' }); return; }
    s.gens[id].c = null; city.troops -= n; fa.food -= rationsOf(n, 0);
    const j = s.fields.find((x) => x.b === A && x.a.kind === 'intercept' && x.a.f === f && x.a.from === c);
    if (j) { j.a.gens.push(id); j.a.troops += n; }
    else s.fields.push({ a: { id: 0, f, kind: 'intercept', from: c, to: c, route: [c], gens: [id], troops: n }, b: A });
    ev(s, { k: 'intercept', f, c, g: id, n, fb: A.f, to: A.to });
  }
}
// a hostile army on a road that passes through (or ends at) city c can be intercepted from c
export function interceptTargets(s, f, c) {
  return (s.armies || []).filter((a) => a.f !== f && !isAlly(s, f, a.f) && a.route.includes(c));
}

// ---------------------------------------------------------------- computer lords (and 委任 for the player)
export const armyPower = (troops, ids) => troops * statMul(ids);
// opts.war = false: domestic only (the player's "auto-assign"); opts.skip: officers that already have orders;
// opts.gold: gold left to spend
export function aiOrders(s, f, opts = {}) {
  loadMap(s);
  const k = K(), out = {}, sup = supplied(s, f), skip = opts.skip || new Set(), war = opts.war !== false;
  let gold = opts.gold ?? s.factions[f].gold;
  const free = (c) => byLead(gensIn(s, c, f).filter((g) => !out[g] && !skip.has(g)));
  const mine = ownedBy(s, f);
  const hostile = (o) => o >= 0 && o !== f && !isAlly(s, f, o);
  const enemy = (o) => o !== f && !isAlly(s, f, o) && !(o === PLAYER && s.turn < D(s).grace);
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
  const thr = D(s).attack - Math.min(k.aiBoldGold[1], gold / k.aiBoldGold[0]) - (s.factions.filter((x) => x.alive).length <= 2 ? k.aiBoldLast : 0);
  const playerLeads = f !== PLAYER && citiesOf(s, PLAYER).length >= Math.max(...s.factions.filter((x) => x.alive && x.id !== PLAYER).map((x) => citiesOf(s, x.id).length));
  for (let n = 0; war && n < 2; n++) {
    let pick1 = null;
    const targets = new Set();
    for (const c of mine) if (sup.has(c) && !used.has(c) && free(c).length) for (const { c: t } of ADJ[c]) if (s.cities[t].owner !== f && enemy(s.cities[t].owner)) targets.add(t);
    for (const t of targets) {
      if (enRoute.has(t)) continue; // our army is already on its way there
      const T = s.cities[t];
      const from = ADJ[t].map((a) => a.c).filter((c) => s.cities[c].owner === f && sup.has(c) && !used.has(c) && free(c).length && s.cities[c].troops >= 800);
      if (!from.length) continue;
      const ids = from.flatMap((c) => free(c).slice(0, 3));
      let troops = 0, tw = 0;
      for (const c of from) { const x = Math.min(s.cities[c].troops * k.marchFrac, commandOfAll(free(c).slice(0, 3))); troops += x; tw += x * terrain(c, t).m; }
      if (troops < k.minMarch) continue;
      let sc = armyPower(troops, ids) * (tw / troops) * (isWinter(s) ? 1 - k.snowPen : 1) / Math.max(1, armyPower(T.troops, defenders(s, t)) * wallMul(T));
      if (T.owner === -1) sc += 0.1;
      if (s.coalition !== null && T.owner === s.coalition) sc += 0.3;
      if (T.owner === PLAYER && playerLeads) sc += D(s).hunt; // v1.6 (D-121): the computer lords gang up on a leading player
      if (sc >= thr && (!pick1 || sc > pick1.sc)) pick1 = { t, from, sc };
    }
    if (!pick1) break;
    for (const c of pick1.from) {
      const ld = free(c).slice(0, 3);
      let left = Math.floor(s.cities[c].troops * k.marchFrac);
      for (const g of ld) { const x = Math.min(commandOf(g), left); left -= x; out[g] = { cmd: 'march', to: pick1.t, n: x }; }
      used.add(c);
    }
  }
  // sallies (v0.9.6): meet an enemy army on a road through our city when our best fighters can beat it
  for (const c of war ? mine : []) {
    const C = s.cities[c];
    for (const A of interceptTargets(s, f, c)) {
      if (!enemy(A.f) && A.to !== c) continue;
      const gs = byWar(free(c)).slice(0, 3);
      if (!gs.length) break;
      const n = Math.min(Math.floor(C.troops * k.marchFrac), commandOfAll(gs));
      if (n < k.minMarch || armyPower(n, gs) < armyPower(A.troops, A.gens) * k.aiSally) continue;
      let left = n;
      for (const g of gs) { const x = Math.min(commandOf(g), left); left -= x; if (x > 0) out[g] = { cmd: 'intercept', army: A.id, n: x }; }
      break;
    }
  }
  // everyone else: one job each, most urgent first
  const incoming = {};
  for (const c of mine) {
    const C = s.cities[c];
    let gs = free(c), searched = false, fed = false, plotted = false, poached = false;
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
      if (war && !C.pass && !poached && front && f !== PLAYER && gold >= k.poachCost + 200 && gen(best(gs, 'int')).int >= 80) {
        const g0 = best(gs, 'int'), tg = poachTargets(s, f, c).filter((x) => enemy(s.gens[x].f)).sort((a, b) => poachChance(s, f, g0, b) - poachChance(s, f, g0, a))[0];
        if (tg && poachChance(s, f, g0, tg) >= k.aiPoachMin && rnd(s) < k.aiPoach) { out[take('int')] = { cmd: 'poach', g: tg }; gold -= k.poachCost; poached = true; continue; }
      }
      if (front && gold >= k.fortCost && C.def < (C.pass ? defMaxOf(C) : 60) && (C.pass || threat > C.troops * 0.6)) { out[take('pol')] = { cmd: 'fort' }; gold -= k.fortCost; continue; }
      // v1.4: a lord with gold to spare builds: walls and beacons on the front, markets and farms behind it
      if (gold >= k.bldCost + k.aiBuildSpare && rnd(s) < k.aiBuild) {
        const want = (front ? ['walls', 'beacon', 'barracks', 'market'] : ['market', 'farm', 'academy', 'barracks']).find((b) => canBuild(C, b));
        if (want) { out[take('pol')] = { cmd: 'build', b: want }; gold -= k.bldCost; continue; }
      }
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
  s.events = []; s.queue = []; s.fields = []; s.arrived = false; s.armies = s.armies || []; s.nextArmy = s.nextArmy || 1;
  const all = [];
  for (const fa of s.factions) {
    if (!fa.alive) continue;
    const ords = fa.player ? playerOrders : aiOrders(s, fa.id);
    for (const id of Object.keys(ords)) all.push([fa.id, id, ords[id]]);
  }
  // domestic first (in a shuffled order so no faction always goes first), armies queue up
  for (const [f, id, o] of shuffle(s, all.filter(([, , o]) => o.cmd !== 'march' && o.cmd !== 'intercept'))) runOrder(s, f, id, o);
  for (const [f, id, o] of shuffle(s, all.filter(([, , o]) => o.cmd === 'march'))) runOrder(s, f, id, o);
  for (const [f, id, o] of shuffle(s, all.filter(([, , o]) => o.cmd === 'intercept'))) runOrder(s, f, id, o);
  // two hostile armies coming down the same road from opposite ends meet halfway: a field battle (v0.9.6)
  for (let i = 0; i < s.armies.length; i++) for (let j = i + 1; j < s.armies.length; j++) {
    const a = s.armies[i], b = s.armies[j];
    if (a.f === b.f || isAlly(s, a.f, b.f) || isAlly(s, b.f, a.f)) continue;
    // routes can be several roads long (v0.9.8): they meet on the first road they take in opposite directions
    const back = new Set(b.route.slice(1).map((x, i) => x + '>' + b.route[i]));
    const leg = a.route.slice(1).map((x, i) => a.route[i] + '>' + x).find((l) => back.has(l));
    if (leg && !s.fields.some((x) => x.a === a || x.b === a || x.a === b || x.b === b)) s.fields.push({ a, b, leg: leg.split('>') });
  }
  s.phase = 'battles';
  return s.events;
}

// after the field battles: the armies arriving this month (left 1) reach their goal. Moves into a node
// of ours just go in; everything else fights. Armies of one lord arriving at the same place join up and
// fight as one (terrain: troop-weighted)
function arrivals(s) {
  s.arrived = true;
  const arriving = s.armies.filter((a) => a.left <= 1);
  s.armies = s.armies.filter((a) => a.left > 1);
  for (const a of arriving) {
    if (!s.factions[a.f].alive) continue;
    a.gens = a.gens.filter((id) => s.gens[id].f === a.f && !s.gens[id].hidden);
    // the road is cut (v0.9.8): someone took a node of ours on the way, so the army fights there instead
    const cut = a.route.slice(1, -1).find((n) => s.cities[n].owner !== a.f);
    if (cut) {
      const i = a.route.indexOf(cut);
      ev(s, { k: 'blocked', f: a.f, c: cut, to: a.to, gens: [...a.gens], fd: s.cities[cut].owner });
      Object.assign(a, { to: cut, route: a.route.slice(0, i + 1), terr: terrain(a.route[i - 1], cut).m });
    }
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
}

// where on the map two armies meet: partway along the road from a's start
export function meetPoint(F) {
  const a = F.a, b = F.b, P = (id) => CITIES[id];
  if (a.kind === 'intercept') { // out of the city gate towards the enemy
    const i = b.route.indexOf(a.from), n = b.route[i > 0 ? i - 1 : 1] || b.route[0];
    return { x: P(a.from).x + (P(n).x - P(a.from).x) * 0.25, z: P(a.from).z + (P(n).z - P(a.from).z) * 0.25 };
  }
  const [p, q] = F.leg || [a.from, a.to];
  return { x: (P(p).x + P(q).x) / 2, z: (P(p).z + P(q).z) / 2 };
}

export function nextBattle(s) {
  loadMap(s);
  // field battles first (armies meeting on the road, sallies), then the armies that arrive
  while (s.fields && s.fields.length) {
    const F = s.fields.shift(), { a, b } = F;
    if (!s.factions[a.f].alive || !s.factions[b.f].alive || (a.kind !== 'intercept' && !s.armies.includes(a)) || !s.armies.includes(b)) {
      if (a.kind === 'intercept') homeFrom(s, a, a.troops);
      continue;
    }
    for (const x of [a, b]) x.gens = x.gens.filter((id) => s.gens[id].f === x.f && !s.gens[id].hidden);
    const m = { field: true, a, b, f: a.f, fb: b.f, to: a.kind === 'intercept' ? a.from : a.to, at: meetPoint(F), troops: a.troops, gens: a.gens };
    let duel = null;
    if (a.gens.length && b.gens.length) {
      const A = best(a.gens, 'war'), D = best(b.gens, 'war'), riv = rivalry(a.gens, b.gens);
      let p = riv ? K().duelRival : K().duelChance;
      if (gen(A).war >= 85 && gen(D).war >= 85) p += K().duelBig;
      if (rnd(s) < p) duel = newDuel(s, A, D, a.f, b.f, riv);
    }
    return { m, duel };
  }
  if (!s.arrived) arrivals(s);
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
        duel = newDuel(s, A, D, m.f, T.owner, riv);
      }
    }
    return { m, duel };
  }
  return null;
}

// ---- duels (v0.9.9, D-86): reading the opponent. Each round the side that is not reading (the computer)
// settles on a move and takes a stance; the reader (you, or the attacker in a computer duel) sees the
// stance and answers. A reader with the higher 智力 always sees the true stance; a cleverer opponent
// sometimes feints: he shows the stance that baits the wrong answer. 武力 sets the damage (a big gap:
// one blow is enough), 统率 the stamina and the fighting spirit (斗志) a special move needs. The damage
// has no dice: the only luck is in the reading.
const BEATS = { atk: 'skill', skill: 'def', def: 'atk' };  // move -> the move it beats
const BEATEN = { atk: 'def', skill: 'atk', def: 'skill' }; // move -> the move that beats it
export const DUEL_MOVES = ['atk', 'def', 'skill'];
const side = (d, x) => (x === 'a' ? { g: d.a, f: d.fa, hp: 'hpA', sp: 'spA' } : { g: d.d, f: d.fd, hp: 'hpD', sp: 'spD' });
export function feintChance(reader, foe) {
  const k = K(), dif = gen(foe).int - gen(reader).int;
  return dif <= 0 ? 0 : Math.min(k.feintMax, k.feintBase + dif * k.feintPerInt);
}
export const canSkill = (d, x) => d[side(d, x).sp] >= K().duelSkillCost;
// the computer side picks its move and shows a stance (true, or a feint)
function duelIntent(s, d) {
  const who = d.reader === 'a' ? 'd' : 'a', r = rnd(s), mine = canSkill(d, who);
  // a reader short of 斗志 cannot break a guard, so the computer guards more against him; one who will
  // see through any feint gets the safest moves (a strike only risks a counter, a guard only a tie)
  const read = feintChance(side(d, d.reader).g, side(d, who).g) === 0;
  const w = canSkill(d, d.reader) ? (read ? { atk: 0.6, def: 0.15, skill: 0.25 } : { atk: 0.4, def: 0.25, skill: 0.35 })
    : (read ? { atk: 0.35, def: 0.55, skill: 0.1 } : { atk: 0.3, def: 0.5, skill: 0.2 });
  if (!mine) { w.atk += w.skill * 0.5; w.def += w.skill * 0.5; w.skill = 0; }
  const mv = r < w.atk ? 'atk' : r < w.atk + w.def ? 'def' : 'skill';
  const p = feintChance(side(d, d.reader).g, side(d, who).g);
  d.feintP = p; d.next = mv; d.feint = rnd(s) < p;
  d.tell = d.feint ? BEATEN[mv] : mv; // a feint shows the stance whose answer his real move beats
}
export function newDuel(s, a, dd, fa, fd, riv = null) {
  loadMap(s);
  const k = K(), hp = (g) => Math.round(k.duelHp + gen(g).lead * k.duelHpLead) + itemFx(g, 'hp'), sp = (g) => Math.min(100, Math.round(gen(g).lead * k.duelSpLead) + itemFx(g, 'sp'));
  const d = { a, d: dd, fa, fd, reader: fd === PLAYER && fa !== PLAYER ? 'd' : 'a', alt: fa !== PLAYER && fd !== PLAYER, hpA: hp(a), hpD: hp(dd), maxA: hp(a), maxD: hp(dd), spA: sp(a), spD: sp(dd),
    n: 0, log: [], rival: riv ? riv.zh : null, rivalEn: riv ? riv.en : null, done: false, win: null };
  duelIntent(s, d);
  return d;
}
// the computer reading a stance (computer duels, and the 自动 button): mostly answers what it sees
export function aiAnswer(s, d) {
  const want = rnd(s) < K().duelAiRead ? BEATEN[d.tell] : DUEL_MOVES[Math.floor(rnd(s) * 3)];
  return want === 'skill' && !canSkill(d, d.reader) ? 'atk' : want;
}
// one round: mv is the reader's move (null: the computer answers for him)
export function duelRound(s, d, mv = null) {
  const k = K(), R = d.reader, O = R === 'a' ? 'd' : 'a';
  mv = mv || aiAnswer(s, d);
  if (mv === 'skill' && !canSkill(d, R)) mv = 'atk';
  const moves = { [R]: mv, [O]: d.next }, dmg = { a: 0, d: 0 }, sp = { a: 0, d: 0 };
  const other = (x) => side(d, x === 'a' ? 'd' : 'a').g;
  const bonus = (x) => 1 + fx(side(d, x).g, 'duel') + bondFx(s, side(d, x).f, [side(d, x).g], 'duel') + countersOf([side(d, x).g], [other(x)], true).reduce((a, y) => a + y.c.fx, 0);
  const war = (x) => gen(side(d, x).g).war;
  const hit = (w, l, kind) => {
    if (kind !== 'tie' && kind !== 'chip' && war(w) - war(l) >= k.duelKoGap) return d[side(d, l).hp]; // 武力悬殊: one blow
    const mul = { skill: k.duelSkillMul, atk: 1, counter: k.duelCounter, chip: k.duelChip, tie: k.duelTie / k.duelHit }[kind];
    return k.duelHit * Math.min(k.duelMax, Math.max(k.duelMin, (war(w) / war(l)) ** k.duelExp)) * bonus(w) * mul;
  };
  for (const x of ['a', 'd']) if (moves[x] === 'skill') sp[x] -= k.duelSkillCost;
  let won = null;
  if (moves.a === moves.d) { dmg.a = hit('d', 'a', 'tie'); dmg.d = hit('a', 'd', 'tie'); sp.a += k.duelSpTie; sp.d += k.duelSpTie; }
  else {
    won = BEATS[moves.a] === moves.d ? 'a' : 'd';
    const l = won === 'a' ? 'd' : 'a', m = moves[won];
    dmg[l] = hit(won, l, m === 'skill' ? 'skill' : m === 'def' ? 'counter' : 'atk');
    sp[l] += k.duelSpHit;
    if (m === 'def') { sp[won] += k.duelSpBlock; dmg[won] = hit(l, won, 'chip'); } // a block still jars the arm
  }
  for (const x of ['a', 'd']) {
    const S = side(d, x);
    d[S.hp] = Math.max(0, Math.round(d[S.hp] - dmg[x]));
    d[S.sp] = Math.max(0, Math.min(100, d[S.sp] + sp[x]));
  }
  d.n++;
  d.log.push({ mA: moves.a, mD: moves.d, dmgA: Math.round(dmg.a), dmgD: Math.round(dmg.d), tell: d.tell, feint: d.feint, won });
  if (d.hpA <= 0 || d.hpD <= 0 || d.n >= k.duelRounds) {
    d.done = true;
    d.win = d.hpA <= 0 && d.hpD <= 0 ? null : d.hpD <= 0 ? 'a' : d.hpA <= 0 ? 'd' : Math.abs(d.hpA - d.hpD) < k.duelDraw ? null : d.hpA > d.hpD ? 'a' : 'd';
  } else {
    if (d.alt) d.reader = d.reader === 'a' ? 'd' : 'a'; // a computer duel: the two take turns reading
    duelIntent(s, d);
  }
  return d;
}
export function autoDuel(s, d) { while (!d.done) duelRound(s, d); return d.win; }

// what the battle screen shows (v1.4): each side's counters and weather buffs, [side, zh, en, fx]
export function edgeOf(s, aIds, bIds, river = false, siege = false, fa = -1, fb = -1) {
  const out = [];
  for (const [si, ids, foes, att, f] of [[0, aIds, bIds, true, fa], [1, bIds, aIds, !siege, fb]]) {
    // v1.6 (D-120): bonds show on the battle screen too, with their attack (and, defending a city, defence) bonus
    for (const b of activeBonds(s, f, ids)) { const v = (b.fx.atk || 0) + (att ? 0 : b.fx.def || 0); if (v) out.push([si, '♥ ' + b.zh, '♥ ' + b.en, v]); }
    if (f >= 0 && s.factions[f] && s.factions[f].hungry) out.push([si, '断粮', 'Hungry', -K().hungryPen]);
    for (const x of countersOf(ids, foes, !att)) out.push([si, x.c.zh, x.c.en, x.c.fx, x.a, x.b]);
    for (const x of timelyOf(s, ids, si === 0 && river)) out.push([si, x.t.zh, x.t.en, x.t.fx, x.id]);
    if (isWinter(s) && snowproof(ids)) out.push([si, '不惧风雪', 'Snow-hardy', 0]);
  }
  return out;
}
function sidePower(s, f, ids, troops, { attacking, outnumbered, foes = [], river = false }) {
  const g = ids.length ? best(ids, 'lead') : null;
  let m = 1;
  m += Math.min(K().counterMax, countersOf(ids, foes, !attacking).reduce((a, x) => a + x.c.fx, 0));
  m += timelyOf(s, ids, river).reduce((a, x) => a + x.t.fx, 0);
  for (const id of ids) m += (fx(id, 'atk') + (attacking ? fx(id, 'raid') : 0) + (outnumbered ? fx(id, 'few') : 0)) * (id === g ? 1 : 0.5) + (attacking ? 0 : fx(id, 'def') * (id === g ? 1 : 0.5));
  if (f >= 0) m += bondFx(s, f, ids, 'atk') + (attacking ? 0 : bondFx(s, f, ids, 'def'));
  if (f >= 0 && s.factions[f].hungry) m -= K().hungryPen; // v1.7: hungry soldiers fight badly
  return troops * statMul(ids) * m;
}

// an army sent home (an interceptor after its sally, or a beaten army): troops and officers back
function homeFrom(s, a, troops) { retreat(s, { ...a, home: null }, troops); }
// a field battle (v0.9.6): no walls, the same rule as everywhere: troops x 武力, fought to the end
function resolveField(s, m, duelWin, duel) {
  const k = K(), { a, b } = m;
  let aMul = 1 - snowPenOf(s, a.gens), bMul = 1 - snowPenOf(s, b.gens);
  if (duel) {
    ev(s, { k: 'duel', f: a.f, fd: b.f, c: m.to, a: duel.a, d: duel.d, win: duelWin, rival: duel.rival, field: true });
    if (duelWin === 'a') { b.troops = Math.round(b.troops * (1 - k.duelLoss)); aMul += k.duelWinAtk; }
    if (duelWin === 'd') { a.troops = Math.round(a.troops * (1 - k.duelLoss)); bMul += k.duelWinAtk; }
  }
  let A = a.troops, B = b.troops;
  m.rounds = [[A, B]]; m.sideGens = [[...a.gens], [...b.gens]]; // the battle screen plays these back
  m.edge = edgeOf(s, a.gens, b.gens, false, false, a.f, b.f);
  for (let r = 0; r < k.fieldRounds && A > 0 && B > 0; r++) {
    const pa = sidePower(s, a.f, a.gens, A, { attacking: true, outnumbered: A < B, foes: b.gens }) * aMul;
    const pb = sidePower(s, b.f, b.gens, B, { attacking: true, outnumbered: B < A, foes: a.gens }) * bMul;
    A = Math.max(0, Math.round(A - pb * k.roundLoss)); B = Math.max(0, Math.round(B - pa * k.roundLoss));
    m.rounds.push([A, B]);
    if (A > 0 && B > 0 && (A < a.troops * k.rout || B < b.troops * k.rout)) break; // one side breaks and runs
  }
  const aWon = A * statMul(a.gens) * aMul >= B * statMul(b.gens) * bMul;
  const W = aWon ? a : b, L = aWon ? b : a, wLeft = aWon ? A : B, lLeft = aWon ? B : A;
  ev(s, { k: 'field', f: W.f, fl: L.f, c: m.to, at: m.at, lostW: W.troops - wLeft, lostL: L.troops - lLeft, gw: [...W.gens], gl: [...L.gens], intercept: a.kind === 'intercept' });
  // the loser turns back home with what is left; the winner goes on (an interceptor goes home)
  if (L.kind !== 'intercept') s.armies = s.armies.filter((x) => x !== L);
  homeFrom(s, L, lLeft);
  if (W.kind === 'intercept') homeFrom(s, W, wLeft); else W.troops = wLeft;
}

export function resolveBattle(s, m, duelWin = null, duel = null) {
  loadMap(s);
  if (m.field) { resolveField(s, m, duelWin, duel); return; }
  const k = K(), T = s.cities[m.to], o = T.owner, dGens = defenders(s, m.to);
  let aMul = (m.terr ?? 1) * (1 - snowPenOf(s, m.gens)), dMul = 1;
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
  m.rounds = [[A, D]]; m.sideGens = [[...m.gens], [...dGens]]; // the battle screen plays these back
  m.edge = edgeOf(s, m.gens, dGens, crossesRiver(m), true, m.f, o);
  // v0.9.6: no dice in the fighting itself (troops x 武力 x walls decide); the siege goes on until one
  // side breaks, so the stronger side always carries the day
  for (let r = 0; r < k.rounds && A > 0 && D > 0; r++) {
    const pa = sidePower(s, m.f, m.gens, A, { attacking: true, outnumbered: A < D, foes: dGens, river: crossesRiver(m) }) * aMul;
    const pd = sidePower(s, o, dGens, D, { attacking: false, outnumbered: D < A, foes: m.gens }) * dMul * walls * (1 + bldLv(T, 'beacon') * k.bldBeacon);
    A = Math.max(0, Math.round(A - pd * k.roundLoss));
    D = Math.max(0, Math.round(D - pa * k.roundLoss));
    m.rounds.push([A, D]);
    if (A > 0 && A < m.troops * k.rout) break; // the attackers give up
    T.def = Math.max(20, T.def - 2);
    if (D > 0 && D < m.troops * 0.12 && A > D * 3) { D = 0; m.rounds.push([A, 0]); } // the garrison gives up
  }
  const won = D <= 0 && A > 0;
  ev(s, { k: won ? 'take' : 'repel', f: m.f, c: m.to, from: m.from, fd: o, lostA: m.troops - A, lostD: T.troops - D, gens: [...m.gens], left: A, pass: !!T.pass });
  if (won) {
    T.owner = m.f; T.troops = Math.min(capOf(T), A); T.def = Math.max(20, T.def - k.siegeDef);
    if (T.bld) for (const b of Object.keys(T.bld)) T.bld[b] = Math.max(0, T.bld[b] - 1); // sacked: every building loses a level
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
  T.troops = Math.min(Math.max(K().maxTroops, capOf(T)), T.troops + m.troops);
  for (const id of m.gens) s.gens[id].c = m.to;
}
function retreat(s, m, troops) {
  // every officer goes back where he came from (if still ours); the troops go with the first one
  const back = (c) => (c && s.cities[c].owner === m.f ? c : null);
  const fallback = back(m.from) || ownedBy(s, m.f).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0] || null;
  if (!fallback) { for (const id of m.gens) hide(s, id, pick(s, CITY_IDS)); return; }
  s.cities[fallback].troops = Math.min(Math.max(K().maxTroops, capOf(s.cities[fallback])), s.cities[fallback].troops + troops);
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

// a month's 军饷 for lord f (troops: everything he has under arms, cities and armies; counted if not given)
export function payOf(s, f, troops = null) {
  const k = K();
  if (troops === null) troops = ownedBy(s, f).reduce((a, c) => a + s.cities[c].troops, 0) + s.armies.filter((a) => a.f === f).reduce((a, x) => a + x.troops, 0);
  return Math.round(Math.max(0, troops - k.payFree * citiesOf(s, f).length) * k.payTroop + factionGens(s, f).length * k.payGen); // each city keeps payFree soldiers on its own fields
}
export function endTurn(s) {
  loadMap(s);
  const k = K();
  if (s.arrived === false) arrivals(s); // nobody called nextBattle: the arrivals still happen (their battles are lost)
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
        // v1.5 (D-116): the city grows by itself, faster under a good governor (whole points; the rest carries over)
        C.grow = (C.grow || 0) + growthOf(s, c);
        const up = Math.floor(C.grow); C.grow = Math.round((C.grow - up) * 100) / 100;
        if (up > 0) { const was = C.dev; C.dev = Math.min(100, C.dev + up); if (fa.id === PLAYER && ((was < 40 && C.dev >= 40) || (was < 65 && C.dev >= 65))) ev(s, { k: 'grow', f: fa.id, c, n: C.dev }); }
        const [gold, food] = cityIncome(s, c);
        fa.gold += gold;
        fa.food += foodIn(s, food); // v1.7 (D-123): a trickle all year, the harvest in September
      }
      troops += C.troops;
    }
    fa.food -= Math.round(troops * k.foodPerTroop); // v1.7: armies on the road eat the rations they took
    for (const a of s.armies) if (a.f === fa.id) troops += a.troops; // (but they are paid)
    // v1.6 (D-122): 军饷. Soldiers and officers are paid every month; a lord who cannot pay loses soldiers
    // (in proportion to what he owes) and his officers grow less loyal
    const pay = payOf(s, fa.id, troops);
    fa.pay = pay;
    if (fa.gold >= pay) fa.gold -= pay;
    else {
      const short = 1 - fa.gold / pay; fa.gold = 0;
      for (const c of ownedBy(s, fa.id)) s.cities[c].troops = Math.round(s.cities[c].troops * (1 - k.desert * short));
      for (const a of s.armies) if (a.f === fa.id) a.troops = Math.max(1, Math.round(a.troops * (1 - k.desert * short)));
      for (const id of factionGens(s, fa.id)) if (id !== fa.lord) s.gens[id].loyal = Math.max(0, (s.gens[id].loyal ?? 80) - k.unpaidLoyal);
      ev(s, { k: 'unpaid', f: fa.id, n: Math.round(short * 100) });
    }
    // v1.6 (D-121): a computer lord with gold to spare hires soldiers for its front (the weakest front city first)
    if (fa.id !== PLAYER && D(s).merc && fa.gold > k.aiReserve) {
      let spend = Math.floor((fa.gold - k.aiReserve) * D(s).merc);
      const front = ownedBy(s, fa.id).filter((c) => sup.has(c) && ADJ[c].some(({ c: n }) => s.cities[n].owner !== fa.id)).sort((a, b) => s.cities[a].troops - s.cities[b].troops);
      for (const c of front) {
        const C = s.cities[c], n = Math.min(capOf(C) - C.troops, Math.floor(spend / k.mercCost) * 100);
        if (n < 100) continue;
        C.troops += n; const cost = n / 100 * k.mercCost; fa.gold -= cost; spend -= cost;
      }
    }
    // v1.7 (D-123): an empty granary costs soldiers, loyalty and fighting spirit (hungry: -hungryPen in battle next month)
    fa.hungry = fa.food < 0;
    if (fa.food < 0) {
      fa.food = 0;
      for (const c of ownedBy(s, fa.id)) s.cities[c].troops = Math.round(s.cities[c].troops * (1 - k.hungerLoss));
      for (const id of factionGens(s, fa.id)) if (id !== fa.lord) s.gens[id].loyal = Math.max(0, (s.gens[id].loyal ?? 80) - k.hungerLoyal);
      ev(s, { k: 'hunger', f: fa.id });
    }
    // a computer lord keeps a few months of food in hand, buying with spare gold (and selling a glut when broke)
    if (fa.id !== PLAYER) {
      const want = foodUse(s, fa.id) * k.aiFoodMonths;
      if (fa.food < want && fa.gold > k.aiReserve * 0.5) trade(s, fa.id, Math.min(want - fa.food, Math.floor((fa.gold - k.aiReserve * 0.5) / ricePrice(s)) * 100, k.tradeMax));
      else if (fa.food > want * 3 && fa.gold < 200) trade(s, fa.id, -Math.min(fa.food - want * 2, k.tradeMax));
    }
    fixLord(s, fa.id);
  }
  checkBonds(s);
  s.traded = {};
  for (const c of NODE_IDS) {
    const C = s.cities[c], max = C.pass ? (CITIES[c].big ? k.passBigTroops : k.passTroops[1]) : k.neutralMax;
    if (C.owner === -1 && C.troops < max) C.troops = Math.min(max, C.troops + k.neutralRegen);
  }
  // the coalition: when one lord holds half of Markham, the others stop fighting each other
  const alive = s.factions.filter((f) => f.alive);
  const lead = alive.find((f) => citiesOf(s, f.id).length >= (f.id === PLAYER ? D(s).coalition : k.coalitionAt));
  const L = lead && alive.length >= 3 ? lead.id : null;
  if (L !== s.coalition) { ev(s, { k: L === null ? 'coalitionEnd' : 'coalition', f: L === null ? s.coalition : L }); s.coalition = L; }
  // armies still on the road: one month nearer (the armies of a fallen lord have broken up)
  s.armies = s.armies.filter((a) => s.factions[a.f].alive);
  for (const a of s.armies) a.left--;
  for (const key of Object.keys(s.truce || {})) if (s.truce[key] <= s.turn + 1) { const [a, b] = key.split('-').map(Number); delete s.truce[key]; if (s.factions[a].alive && s.factions[b].alive) ev(s, { k: 'truceEnd', f: a, to: b }); }
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
// 委任: give every officer without an order a peaceful job (draft, search, fortify, build, spread out)
export function autoAssign(s, orders = {}) {
  const spent = Object.entries(orders).reduce((a, [id, o]) => a + orderCost(o, id), 0);
  return { ...aiOrders(s, PLAYER, { war: false, skip: new Set(Object.keys(orders)), gold: s.factions[PLAYER].gold - spent }), ...orders };
}
export function factionName(s, f, zh = true) {
  if (f < 0) return zh ? '空城' : 'Unclaimed';
  const fa = s.factions[f];
  if (fa.player) return zh ? '你' : 'You';
  const g = gen(fa.lord);
  return zh ? g.zh + '军' : g.en + "'s army";
}
