// 万锦三国志 rules engine (D-73). Pure and deterministic: all randomness comes from the seeded
// generator kept in the state, so a saved game (JSON) resumes exactly. No DOM, unit-tested.
//
// A month:  beginTurn(s, playerOrders)  -> domestic orders of every faction run, armies queue up
//           nextBattle(s)               -> the next army arrives: { m, duel } (duel may be null)
//           duelRound(s, duel, a, d)    -> one exchange of a duel (null move = computer picks)
//           resolveBattle(s, m, winner) -> the siege is fought ('a' / 'd' / null = duel result)
//           endTurn(s)                  -> income, upkeep, supply, coalition, victory, next month
// runTurn() does all of it with computer duels (tests, simulations).
import { CFG } from './config.js';
import { GENERALS, GEN_IDS, TRAIT_FX, BONDS, RIVALS, CITY_IDS, ADJ, FACTION_COLORS } from './sg_data.js';

const K = () => CFG.sg;
export const capOf = (city) => Math.min(K().maxTroops, Math.round(K().capBase + city.dev * K().capPerDev));

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

// ---------------------------------------------------------------- helpers
export const PLAYER = 0;
export const gen = (id) => GENERALS[id];
export const fx = (id, k) => (TRAIT_FX[gen(id).trait] || {})[k] || 0;
export const gensIn = (s, c, f) => Object.values(s.gens).filter((g) => g.c === c && g.f === f && !g.hidden).map((g) => g.id);
export const ownedBy = (s, f) => CITY_IDS.filter((c) => s.cities[c].owner === f);
export const factionGens = (s, f) => Object.values(s.gens).filter((g) => g.f === f && !g.hidden).map((g) => g.id);
export const byLead = (ids) => [...ids].sort((a, b) => gen(b).lead - gen(a).lead);
const best = (ids, k) => ids.reduce((m, id) => (m && gen(m)[k] >= gen(id)[k] ? m : id), null);
export const dateOf = (s) => ({ year: K().startYear + Math.floor(s.turn / 12), month: (s.turn % 12) + 1 });

function hops(a) { // graph distance from city a to every city
  const d = { [a]: 0 }, q = [a];
  while (q.length) { const c = q.shift(); for (const { c: n } of ADJ[c]) if (d[n] === undefined) { d[n] = d[c] + 1; q.push(n); } }
  return d;
}

// cities of f connected to its capital through its own cities (the supply lines)
export function supplied(s, f) {
  const fa = s.factions[f], out = new Set();
  if (!fa || s.cities[fa.cap]?.owner !== f) return out;
  const q = [fa.cap]; out.add(fa.cap);
  while (q.length) { const c = q.shift(); for (const { c: n } of ADJ[c]) if (!out.has(n) && s.cities[n].owner === f) { out.add(n); q.push(n); } }
  return out;
}

// bonds active for a set of generals (army) of faction f
export function activeBonds(s, f, ids) {
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

// ---------------------------------------------------------------- new game
export function newGame(seed = Date.now(), names = {}) {
  const k = K();
  const s = { v: 1, seed: seed >>> 0, r: seed >>> 0, turn: 0, factions: [], cities: {}, gens: {}, coalition: null, over: null, log: [], queue: [], phase: 'orders' };
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
  const pool = shuffle(s, [...GEN_IDS]);
  for (let f = 0; f < 4; f++) {
    const drawn = [pool.pop(), pool.pop()], cap = starts[f];
    s.factions.push({ id: f, player: f === PLAYER, lord: f === PLAYER ? null : drawn[0], name: f === PLAYER ? (names.player || null) : null, color: FACTION_COLORS[f], cap, alive: true, gold: k.startGold, food: k.startFood });
    Object.assign(s.cities[cap], { owner: f, troops: k.startTroops, dev: 50, def: 60 });
    for (const id of drawn) s.gens[id] = { id, f, c: cap, hidden: false, loyal: 85 + fx(id, 'loyal') };
  }
  // everyone else hides somewhere in Markham: the blind boxes found by searching
  const order = shuffle(s, [...CITY_IDS]);
  pool.forEach((id, i) => { s.gens[id] = { id, f: -1, c: order[i % order.length], hidden: true, loyal: 70 }; });
  return s;
}

const ev = (s, e) => { e.t = s.turn; s.log.push(e); if (s.log.length > 60) s.log.shift(); s.events.push(e); return e; };
export const hiddenIn = (s, c) => Object.values(s.gens).filter((g) => g.hidden && g.c === c).map((g) => g.id);

// ---------------------------------------------------------------- orders
// order: { cmd: 'dev' | 'draft' | 'search' | 'move' | 'march' | 'rest', to, gens, frac }
export function validOrder(s, f, c, o) {
  const city = s.cities[c], gs = gensIn(s, c, f), fa = s.factions[f];
  if (!o || city.owner !== f) return false;
  switch (o.cmd) {
    case 'dev': return fa.gold >= K().devCost && city.dev < 100;
    case 'draft': return fa.gold >= K().draftCost && city.troops < capOf(city);
    case 'search': return gs.length > 0;
    case 'move': return ADJ[c].some((a) => a.c === o.to) && s.cities[o.to].owner === f;
    case 'march': return ADJ[c].some((a) => a.c === o.to) && s.cities[o.to].owner !== f && supplied(s, f).has(c) && city.troops >= 200;
    default: return true;
  }
}

function runOrder(s, f, c, o) {
  const k = K(), city = s.cities[c], fa = s.factions[f], gs = gensIn(s, c, f);
  if (!validOrder(s, f, c, o)) return;
  const pickGens = (want) => { const ok = (want || []).filter((g) => gs.includes(g)); return ok.length ? ok.slice(0, 3) : byLead(gs).slice(0, 3); };
  if (o.cmd === 'dev') {
    const g = best(gs, 'pol'), pol = g ? gen(g).pol : 40;
    const amt = Math.round((k.devBase + pol * k.devPerPol) * (1 + (g ? fx(g, 'dev') : 0) + bondFx(s, f, gs, 'dev')));
    fa.gold -= k.devCost; city.dev = Math.min(100, city.dev + amt);
    ev(s, { k: 'dev', f, c, g, n: amt });
  } else if (o.cmd === 'draft') {
    const g = best(gs, 'lead'), lead = g ? gen(g).lead : 40;
    const amt = Math.min(capOf(city) - city.troops, Math.round((k.draftBase + lead * k.draftPerLead) * (1 + (g ? fx(g, 'draft') : 0))));
    fa.gold -= k.draftCost; city.troops += amt;
    ev(s, { k: 'draft', f, c, g, n: amt });
  } else if (o.cmd === 'search') {
    const g = best(gs, 'int'), hid = hiddenIn(s, c);
    const p = k.searchBase + gen(g).int * k.searchPerInt + fx(g, 'search') + gs.reduce((a, x) => Math.max(a, fx(x, 'search')), 0) * 0.5 + bondFx(s, f, gs, 'search');
    if (hid.length && rnd(s) < p) {
      const id = pick(s, hid), G = s.gens[id];
      Object.assign(G, { f, c, hidden: false, loyal: 75 + fx(id, 'loyal') });
      ev(s, { k: 'found', f, c, g: id, by: g });
    } else if (rnd(s) < k.treasure[0]) {
      const n = Math.round(k.treasure[1] + rnd(s) * (k.treasure[2] - k.treasure[1]));
      fa.gold += n; ev(s, { k: 'treasure', f, c, g, n });
    } else ev(s, { k: 'nothing', f, c, g, left: hid.length });
  } else if (o.cmd === 'move') {
    const ids = (o.gens && o.gens.length) ? o.gens.filter((g) => gs.includes(g)) : [];
    const n = Math.floor(city.troops * (o.frac ?? 0.5));
    for (const id of ids) s.gens[id].c = o.to;
    city.troops -= n; s.cities[o.to].troops = Math.min(k.maxTroops, s.cities[o.to].troops + n);
    ev(s, { k: 'move', f, c, to: o.to, n, gens: ids });
  } else if (o.cmd === 'march') {
    const ids = pickGens(o.gens), n = Math.floor(city.troops * Math.min(1, o.frac ?? k.marchFrac));
    for (const id of ids) s.gens[id].c = null; // on the road
    city.troops -= n;
    s.queue.push({ f, from: c, to: o.to, gens: ids, troops: n });
    ev(s, { k: 'march', f, c, to: o.to, n, gens: ids });
  }
}

// ---------------------------------------------------------------- computer lords
export function aiOrders(s, f) {
  const k = K(), out = {}, sup = supplied(s, f), fa = s.factions[f];
  let gold = fa.gold;
  const power = (troops, ids, defending, def) => {
    const g = ids.length ? best(ids, 'lead') : null, lead = g ? gen(g).lead : k.neutralStat;
    const war = ids.length ? Math.max(...ids.map((x) => gen(x).war)) : k.neutralStat;
    return troops * (0.6 + 0.4 * lead / 100 + 0.2 * war / 100) * (defending ? 1 + def / k.defDiv : 1);
  };
  const enemy = (o) => o !== f && !isAlly(s, f, o) && !(o === PLAYER && s.turn < k.truce);
  const threatOf = (c) => Math.max(0, ...ADJ[c].map(({ c: n }) => { const o = s.cities[n].owner; return o >= 0 && o !== f && !isAlly(s, f, o) ? s.cities[n].troops : 0; }));
  const mineAll = ownedBy(s, f);
  for (const c of mineAll) if (!sup.has(c)) { // cut off: pull back towards the supplied cities
    const home = ADJ[c].find(({ c: n }) => s.cities[n].owner === f && sup.has(n));
    out[c] = home ? { cmd: 'move', to: home.c, gens: gensIn(s, c, f), frac: 0.8 } : { cmd: 'dev' };
  }
  // attacks: every neighbouring city of ours may join in (armies merge), up to two targets a month
  for (let n = 0; n < 2; n++) {
    let pick1 = null;
    const targets = new Set();
    for (const c of mineAll) if (sup.has(c) && !out[c]) for (const { c: t } of ADJ[c]) if (enemy(s.cities[t].owner)) targets.add(t);
    for (const t of targets) {
      const T = s.cities[t], o = T.owner;
      const from = ADJ[t].map((a) => a.c).filter((c) => s.cities[c].owner === f && sup.has(c) && !out[c] && s.cities[c].troops >= 800);
      if (!from.length) continue;
      const ids = from.flatMap((c) => byLead(gensIn(s, c, f)).slice(0, 2));
      const troops = from.reduce((a, c) => a + s.cities[c].troops * k.marchFrac, 0);
      let sc = power(troops, ids, false, 0) / Math.max(1, power(T.troops, o >= 0 ? gensIn(s, t, o) : [], true, T.def));
      if (!ids.length) sc *= 0.8;
      if (o === -1) sc += 0.1;
      if (s.coalition !== null && o === s.coalition) sc += 0.3;
      if (sc >= k.aiAttack && (!pick1 || sc > pick1.sc)) pick1 = { t, from, sc };
    }
    if (!pick1) break;
    for (const c of pick1.from) out[c] = { cmd: 'march', to: pick1.t, gens: byLead(gensIn(s, c, f)).slice(0, 2), frac: k.marchFrac };
  }
  for (const c of mineAll) {
    if (out[c]) continue;
    const city = s.cities[c], gs = gensIn(s, c, f);
    const foes = ADJ[c].filter(({ c: n }) => s.cities[n].owner !== f && !isAlly(s, f, s.cities[n].owner));
    const threat = threatOf(c);
    const canDraft = gold >= k.draftCost && city.troops < capOf(city);
    if (city.troops < threat * 1.2 && canDraft) { out[c] = { cmd: 'draft' }; gold -= k.draftCost; }
    else if (gs.length && hiddenIn(s, c).length && rnd(s) < 0.6) out[c] = { cmd: 'search' };
    else if (city.troops < k.aiSafe && canDraft) { out[c] = { cmd: 'draft' }; gold -= k.draftCost; }
    else if (!foes.length && city.troops > 2000) {
      // interior city: feed the most threatened neighbour (and lend it a general if it has none)
      const front = ADJ[c].filter(({ c: n }) => s.cities[n].owner === f).sort((a, b) => threatOf(b.c) - threatOf(a.c))[0];
      if (front && ADJ[front.c].some(({ c: n }) => s.cities[n].owner !== f)) out[c] = { cmd: 'move', to: front.c, frac: 0.6, gens: gs.length > 1 && !gensIn(s, front.c, f).length ? [byLead(gs)[0]] : [] };
      else if (city.dev < 90 && gold >= k.devCost) { out[c] = { cmd: 'dev' }; gold -= k.devCost; }
    } else if (city.dev < 90 && gold >= k.devCost) { out[c] = { cmd: 'dev' }; gold -= k.devCost; }
    else if (gold >= k.draftCost && city.troops < capOf(city)) { out[c] = { cmd: 'draft' }; gold -= k.draftCost; }
  }
  return out;
}

// ---------------------------------------------------------------- the month
export function beginTurn(s, playerOrders = {}) {
  s.events = []; s.queue = [];
  const all = [];
  for (const fa of s.factions) {
    if (!fa.alive) continue;
    const ords = fa.player ? playerOrders : aiOrders(s, fa.id);
    for (const c of Object.keys(ords)) all.push([fa.id, c, ords[c]]);
  }
  // domestic first (in a shuffled order so no faction always goes first), armies queue up
  for (const [f, c, o] of shuffle(s, all.filter(([, , o]) => o.cmd !== 'march'))) runOrder(s, f, c, o);
  for (const [f, c, o] of shuffle(s, all.filter(([, , o]) => o.cmd === 'march'))) runOrder(s, f, c, o);
  // armies of one lord heading for the same city join up and fight as one
  const merged = [];
  for (const m of s.queue) {
    const j = merged.find((x) => x.f === m.f && x.to === m.to);
    if (j) { j.troops += m.troops; j.gens.push(...m.gens); j.froms.push(m.from); } else merged.push({ ...m, gens: [...m.gens], froms: [m.from] });
  }
  s.queue = merged;
  s.phase = 'battles';
  return s.events;
}

export function nextBattle(s) {
  while (s.queue.length) {
    const m = s.queue.shift(), T = s.cities[m.to];
    if (T.owner === m.f) { enterCity(s, m); continue; } // a friend got there first: just move in
    const dGens = T.owner >= 0 ? gensIn(s, m.to, T.owner) : [];
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

function sidePower(s, f, ids, troops, { attacking, outnumbered, def }) {
  const k = K(), g = ids.length ? best(ids, 'lead') : null, lead = g ? gen(g).lead : k.neutralStat;
  const war = ids.length ? Math.max(...ids.map((x) => gen(x).war)) : k.neutralStat;
  let m = 1;
  for (const id of ids) m += (fx(id, 'atk') + (attacking ? fx(id, 'raid') : 0) + (outnumbered ? fx(id, 'few') : 0)) * (id === g ? 1 : 0.5) + (attacking ? 0 : fx(id, 'def') * (id === g ? 1 : 0.5));
  if (f >= 0) m += bondFx(s, f, ids, 'atk') + (attacking ? 0 : bondFx(s, f, ids, 'def'));
  return troops * (0.6 + 0.4 * lead / 100 + 0.2 * war / 100) * m * (attacking ? 1 : 1 + def / k.defDiv);
}

export function resolveBattle(s, m, duelWin = null, duel = null) {
  const k = K(), T = s.cities[m.to], o = T.owner, dGens = o >= 0 ? gensIn(s, m.to, o) : [];
  let aMul = 1, dMul = 1;
  if (duel) {
    const loser = duelWin === 'a' ? duel.d : duelWin === 'd' ? duel.a : null;
    ev(s, { k: 'duel', f: m.f, c: m.to, a: duel.a, d: duel.d, win: duelWin, fd: o, rival: duel.rival });
    if (duelWin === 'a') { T.troops = Math.round(T.troops * (1 - k.duelLoss)); aMul += k.duelWinAtk; }
    if (duelWin === 'd') { m.troops = Math.round(m.troops * (1 - k.duelLoss)); dMul += k.duelWinAtk; }
    if (loser && !fx(loser, 'safe') && rnd(s) < k.duelCapture) {
      const capF = duelWin === 'a' ? m.f : o;
      if (duelWin === 'a') dGens.splice(dGens.indexOf(loser), 1); else m.gens.splice(m.gens.indexOf(loser), 1);
      capture(s, loser, capF, m.to);
    }
  }
  let A = m.troops, D = T.troops;
  for (let r = 0; r < k.rounds && A > 0 && D > 0; r++) {
    const pa = sidePower(s, m.f, m.gens, A, { attacking: true, outnumbered: A < D }) * aMul;
    const pd = sidePower(s, o, dGens, D, { attacking: false, outnumbered: D < A, def: T.def }) * dMul;
    A = Math.max(0, Math.round(A - pd * k.roundLoss * (0.8 + 0.4 * rnd(s))));
    D = Math.max(0, Math.round(D - pa * k.roundLoss * (0.8 + 0.4 * rnd(s))));
    T.def = Math.max(20, T.def - 2);
    if (D > 0 && D < m.troops * 0.12 && A > D * 3) D = 0; // the garrison gives up
  }
  const won = D <= 0 && A > 0;
  ev(s, { k: won ? 'take' : 'repel', f: m.f, c: m.to, from: m.from, fd: o, lostA: m.troops - A, lostD: T.troops - D, gens: [...m.gens], left: A });
  if (won) {
    T.owner = m.f; T.troops = Math.min(k.maxTroops, A); T.def = Math.max(20, T.def - k.siegeDef);
    for (const id of m.gens) s.gens[id].c = m.to;
    for (const id of dGens) {
      const home = ADJ[m.to].find(({ c }) => s.cities[c].owner === o);
      if (home && (fx(id, 'safe') || rnd(s) < k.flee)) { s.gens[id].c = home.c; ev(s, { k: 'flee', f: o, g: id, c: home.c, by: m.f }); }
      else if (fx(id, 'safe')) hide(s, id, m.to);
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
  let home = s.cities[m.from].owner === m.f ? m.from : null;
  if (!home) home = ownedBy(s, m.f).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0] || null;
  if (!home) { for (const id of m.gens) hide(s, id, m.from); return; }
  s.cities[home].troops = Math.min(K().maxTroops, s.cities[home].troops + troops);
  for (const id of m.gens) s.gens[id].c = home;
}
function hide(s, id, c) { Object.assign(s.gens[id], { f: -1, c, hidden: true }); }
// a captured officer: the captor tries to win him over, otherwise lets him go (he hides somewhere)
function capture(s, id, byF, c) {
  const k = K(), from = s.gens[id].f;
  if (byF < 0) { hide(s, id, c); return; }
  const mine = factionGens(s, byF);
  let p = k.recruit + Math.max(0, ...mine.map((x) => fx(x, 'recruit')));
  if (BONDS.some((b) => b.m.includes(id) && b.m.some((x) => x !== id && mine.includes(x)))) p += k.recruitBond;
  if (from >= 0 && s.factions[from] && s.factions[from].lord === id) p += k.recruitLord;
  if (rnd(s) < p) { Object.assign(s.gens[id], { f: byF, c: ownedBy(s, byF).includes(c) ? c : ownedBy(s, byF)[0], hidden: false, loyal: 60 }); ev(s, { k: 'recruit', f: byF, g: id, from }); }
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
function checkFaction(s, f) {
  if (f < 0) return;
  const fa = s.factions[f];
  if (!fa.alive || ownedBy(s, f).length) { fixLord(s, f); return; }
  fa.alive = false;
  for (const id of factionGens(s, f)) hide(s, id, s.gens[id].c || pick(s, CITY_IDS));
  ev(s, { k: 'fall', f });
}

export function endTurn(s) {
  const k = K();
  for (const fa of s.factions) {
    if (!fa.alive) continue;
    if (s.cities[fa.cap].owner !== fa.id) { // capital lost: the strongest city becomes the new one
      const c = ownedBy(s, fa.id).sort((a, b) => s.cities[b].troops - s.cities[a].troops)[0];
      if (c) { fa.cap = c; ev(s, { k: 'capital', f: fa.id, c }); }
    }
    const sup = supplied(s, fa.id);
    let troops = 0;
    for (const c of ownedBy(s, fa.id)) {
      const C = s.cities[c];
      C.def = Math.min(k.defMax, C.def + k.defRegen);
      if (sup.has(c)) { fa.gold += Math.round(k.goldBase + C.dev * k.goldPerDev); fa.food += Math.round(k.foodBase + C.dev * k.foodPerDev); }
      else { C.troops = Math.round(C.troops * (1 - k.cutLoss)); ev(s, { k: 'cut', f: fa.id, c }); }
      troops += C.troops;
    }
    fa.food -= Math.round(troops * k.foodPerTroop);
    if (fa.food < 0) { fa.food = 0; for (const c of ownedBy(s, fa.id)) s.cities[c].troops = Math.round(s.cities[c].troops * (1 - k.hungerLoss)); ev(s, { k: 'hunger', f: fa.id }); }
    fixLord(s, fa.id);
  }
  for (const c of CITY_IDS) { const C = s.cities[c]; if (C.owner === -1 && C.troops < k.neutralMax) C.troops = Math.min(k.neutralMax, C.troops + k.neutralRegen); }
  // the coalition: when one lord holds half of Markham, the others stop fighting each other
  const alive = s.factions.filter((f) => f.alive);
  const lead = alive.find((f) => ownedBy(s, f.id).length >= k.coalitionAt);
  const L = lead && alive.length >= 3 ? lead.id : null;
  if (L !== s.coalition) { ev(s, { k: L === null ? 'coalitionEnd' : 'coalition', f: L === null ? s.coalition : L }); s.coalition = L; }
  const mine = ownedBy(s, PLAYER).length;
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
export function factionName(s, f, zh = true) {
  if (f < 0) return zh ? '空城' : 'Unclaimed';
  const fa = s.factions[f];
  if (fa.player) return zh ? '你' : 'You';
  const g = gen(fa.lord);
  return zh ? g.zh + '军' : g.en + "'s army";
}
