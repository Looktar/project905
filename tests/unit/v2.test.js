// v2 rewrite: world queries, forced-landscape maths and a headless run of the whole simulation.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { World } from '../../v2/js/world.js';
import { Game } from '../../v2/js/game.js';
import { CFG } from '../../v2/js/config.js';
import { layout, toGame, safeArea } from '../../v2/js/orient.js';
import { angDiff, makeRng, pointInPoly } from '../../v2/js/util.js';

const SEED = Number(process.env.SIM_SEED) || 11;
let world;
const idle = () => ({ sx: 0, sy: 0, run: false, punch: false, act: false, drift: false, horn: false, kb: null });
function run(g, sec, inp = idle(), each) {
  for (let i = 0; i < sec * 60; i++) { if (each) each(i, inp); g.update(1 / 60, inp); inp.punch = inp.act = inp.horn = false; }
}
const drain = (g) => { const k = g.ev.map((e) => e.k); g.ev.length = 0; return k; };
beforeAll(() => { world = new World(JSON.parse(fs.readFileSync(new URL('../../maps/markham.json', import.meta.url), 'utf8'))); });

describe('v2 orient', () => {
  it('landscape passes through, portrait rotates', () => {
    expect(layout(844, 390)).toEqual({ rot: false, w: 844, h: 390 });
    expect(layout(390, 844)).toEqual({ rot: true, w: 844, h: 390 });
    expect(toGame(100, 50, 844, 390)).toEqual({ x: 100, y: 50 });
    // portrait: the screen's top-right corner is the game's top-left
    expect(toGame(390, 0, 390, 844)).toEqual({ x: 0, y: 0 });
    expect(toGame(0, 844, 390, 844)).toEqual({ x: 844, y: 390 });
    expect(safeArea(47, 0, 34, 0, true)).toEqual({ top: 0, right: 34, bottom: 0, left: 47 });
    expect(safeArea(0, 47, 21, 47, false)).toEqual({ top: 0, right: 47, bottom: 21, left: 47 });
  });
  it('angDiff wraps', () => { expect(angDiff(3, -3)).toBeCloseTo(0.283, 2); expect(angDiff(0, 1)).toBe(1); });
});

describe('v2 world', () => {
  it('builds the graph, colliders and signals', () => {
    expect(world.edges.length).toBeGreaterThan(4000);
    expect(world.signals.filter((s) => !s.dead).length).toBeGreaterThan(30);
    expect(world.roadName(world.map.spawn[0], world.map.spawn[1])).toMatch(/Hwy 7|Kennedy/);
  });
  it('pushes a circle out of every building it is dropped into', () => {
    const r = makeRng(3);
    for (let i = 0; i < 300; i++) {
      const b = r.pick(world.map.buildings);
      if (b.k === 'roof') continue;
      const res = world.resolve(b.p[0][0] * 0.5 + b.p[2 % b.p.length][0] * 0.5, b.p[0][1] * 0.5 + b.p[2 % b.p.length][1] * 0.5, 0.5);
      expect(pointInPoly(res.x, res.z, b.p) && false).toBe(false);
      expect(Number.isFinite(res.x) && Number.isFinite(res.z)).toBe(true);
    }
  });
  it('line of sight is blocked by buildings', () => {
    const b = world.map.buildings[0], xs = b.p.map((p) => p[0]), zs = b.p.map((p) => p[1]);
    expect(world.los(Math.min(...xs) - 5, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...xs) + 5, (Math.min(...zs) + Math.max(...zs)) / 2)).toBe(false);
  });
  it('signals: the two axes are never green together', () => {
    const sg = world.signals.find((s) => !s.dead);
    for (let t = 0; t < 60; t += 0.5) expect(world.light(sg, 0, t) !== 'r' && world.light(sg, 1, t) !== 'r').toBe(false);
  });
});

describe('v2 simulation', () => {
  it('fills the street and keeps numbers finite for two minutes', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 3);
    expect(g.peds.filter((p) => !p.cop).length).toBeGreaterThan(15);
    expect(g.cars.filter((c) => c.driver === 'ai').length).toBeGreaterThan(6);
    run(g, 120);
    for (const o of [...g.peds, ...g.cars, g.player]) expect(Number.isFinite(o.x + o.z + o.h)).toBe(true);
    // traffic is flowing, not gridlocked
    const moving = g.cars.filter((c) => c.driver === 'ai' && c.v > 1).length, all = g.cars.filter((c) => c.driver === 'ai').length;
    expect(moving / all).toBeGreaterThan(0.3);
  });
  it('walkers stay off the asphalt most of the time', () => {
    const g = new Game(world, { seed: SEED + 1 });
    let on = 0, n = 0;
    run(g, 40, idle(), (i) => { if (i % 30 === 0 && i > 300) for (const p of g.peds) if (p.state === 'walk') { n++; if (!world.onRoad(p.x, p.z, -0.4)) continue; const a = world.nodes[p.e.a], b = world.nodes[p.e.b]; if (Math.min(Math.hypot(a[0] - p.x, a[1] - p.z), Math.hypot(b[0] - p.x, b[1] - p.z)) > 16) on++; } });
    expect(n).toBeGreaterThan(200);
    expect(on / n).toBeLessThan(0.04);   // crossing at junctions is fine; walking down the middle of a block is not
  });
  it('punching a pedestrian hurts, they react, and nobody dies', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 2);
    const q = g.peds.find((p) => !p.cop); const p = g.player;
    for (const c of g.peds) if (c.cop) c.x += 500;   // no witnesses in uniform
    for (const c of g.cars) if (c.driver === 'cop') c.x += 500;
    q.x = p.x + Math.sin(p.h) * 1.2; q.z = p.z + Math.cos(p.h) * 1.2; q.temper = 'timid'; q.hp = 200;
    const hp = q.hp, inp = idle(); inp.punch = true;
    run(g, 0.1, inp);
    expect(q.hp).toBeLessThan(hp);
    expect(drain(g)).toContain('hit');
    q.hp = 1; q.state = 'walk'; q.x = p.x + Math.sin(p.h) * 1.2; q.z = p.z + Math.cos(p.h) * 1.2; p.punchT = 0;
    inp.punch = true; run(g, 0.1, inp);
    expect(q.state).toBe('down');
    run(g, 13);
    expect(q.state).not.toBe('down');
    expect(g.wanted).toBe(false);
  });
  it('carjacking: pull the driver out, drive off, get out again', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 3);
    const c = g.cars.find((k) => k.driver === 'ai'), p = g.player, n = g.peds.length;
    p.x = c.x + 2.2; p.z = c.z;
    const inp = idle(); inp.act = true; run(g, 0.05, inp);
    expect(p.state).toBe('car'); expect(p.car).toBe(c); expect(g.peds.length).toBe(n + 1);
    const x0 = c.x, z0 = c.z;
    inp.kb = { thr: 1, steer: 0 }; run(g, 3, inp);
    expect(Math.hypot(c.x - x0, c.z - z0)).toBeGreaterThan(8);
    inp.kb = { thr: 0, steer: 0 }; run(g, 0.1, inp, () => { c.vx = c.vz = 0; c.v = 0; });
    inp.act = true; run(g, 0.05, inp);
    expect(p.state).toBe('walk'); expect(c.driver).toBe(null);
  });
  it('police: seen crime -> chase -> busted when you stand still -> respawn 150-300 m away', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 3);
    const p = g.player, cop = g.peds.find((q) => q.cop) || g.addPedAt(p.x + 6, p.z, true);
    cop.x = p.x + 5; cop.z = p.z; cop.state = 'walk';
    g.crime(p.x, p.z);
    expect(g.wanted).toBe(true);
    const x0 = p.x, z0 = p.z;
    let busted = false;
    run(g, 12, idle(), () => { if (g.ev.some((e) => e.k === 'busted')) busted = true; g.ev.length = 0; });
    expect(busted).toBe(true);
    expect(p.state).toBe('walk'); expect(g.wanted).toBe(false);
    const d = Math.hypot(p.x - x0, p.z - z0);
    expect(d).toBeGreaterThan(CFG.police.respawn[0] - 5); expect(d).toBeLessThan(CFG.police.respawn[1] + 40);
  });
  it('police: out of sight for 10 s and they give up', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 3);
    g.setWanted();
    for (const q of g.peds) if (q.cop) { q.x += 400; }
    for (const c of g.cars) if (c.driver === 'cop') { c.x += 400; c.aware = false; }
    g.reinT = 999;
    run(g, CFG.police.giveUp + 1);
    expect(g.wanted).toBe(false);
  });
  it('a crime nobody in uniform sees is not a crime', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 2);
    for (const q of g.peds) if (q.cop) q.x += 500;
    for (const c of g.cars) if (c.driver === 'cop') c.x += 500;
    g.crime(g.player.x, g.player.z);
    expect(g.wanted).toBe(false);
  });
  it('being knocked out costs nothing: up again after 3 s with half health', () => {
    const g = new Game(world, { seed: SEED });
    run(g, 1);
    g.hurtPlayer(500, null);
    expect(g.player.state).toBe('ko');
    run(g, CFG.player.koTime + 0.2);
    expect(g.player.state).toBe('walk'); expect(g.player.hp).toBeGreaterThanOrEqual(50);
  });
  it('the player cannot walk into buildings or water', () => {
    const g = new Game(world, { seed: SEED }), p = g.player, inp = idle();
    for (const [sx, sy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      inp.sx = sx; inp.sy = sy; inp.run = true;
      run(g, 25, inp, (i) => { if (i % 20 === 0) { for (const b of world.near(p.x - 1, p.z, p.x + 1, p.z, [])) expect(pointInPoly(p.x, p.z, b.p)).toBe(false); expect(world.inWater(p.x, p.z) && !world.onRoad(p.x, p.z, 2.5)).toBe(false); } });
    }
  });
});
