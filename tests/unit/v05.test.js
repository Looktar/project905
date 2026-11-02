// v0.5 (D-71): the big map's place search, GPS and teleport, run headless.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootSim } from '../helpers/headless.js';
import { searchPlaces, fuzzyDist, norm } from '../../js/nav.js';

let world;
beforeAll(async () => { world = (await bootSim()).world; });
const newSim = (seed) => bootSim({ world, seed });

describe('place search', () => {
  it('fuzzy substring distance', () => {
    expect(fuzzyDist(norm('Pacific Mall'), norm('大古广场 Pacifick Mall'))).toBe(1);
    expect(fuzzyDist('costco', 'costgo')).toBe(1);
    expect(fuzzyDist('kennedy', 'kennedyrd')).toBe(0);
  });
  it('real names find the pun names; Chinese works; categories list the nearest', async () => {
    const g = (await newSim(61)).game, P = g.playerPos(), find = (q, cat) => searchPlaces(world, g.nav.places, q, cat, P);
    expect(find('Pacific Mall')[0].en).toMatch(/Pacifick/);
    expect(find('costco')[0].zh).toMatch(/Costgo/);
    expect(find('tim hortons')[0].cat).toBe('tims');
    expect(find('markville mall')[0].en).toMatch(/Markvile/);
    expect(find('Markville').slice(0, 3).some((r) => /Markvile Mall/.test(r.en))).toBe(true);
    expect(find('市政厅')[0].cat).toBe('lm');
    expect(find('Kennedy').slice(0, 3).some((r) => r.cat === 'street')).toBe(true);
    expect(find('zzqqxx')).toEqual([]);
    const gas = find('', 'gas');
    expect(gas.length).toBeGreaterThan(5);
    for (let i = 1; i < gas.length; i++) expect(gas[i].d).toBeGreaterThanOrEqual(gas[i - 1].d);
    // the same name (Subwey) at most three times
    expect(find('Subwey').filter((r) => r.norm === 'subwey').length).toBeLessThanOrEqual(3);
  });
});

describe('GPS and teleport', () => {
  it('navigating draws a route and clears on arrival', async () => {
    const sim = await newSim(62), g = sim.game, P = g.playerPos();
    const dest = searchPlaces(world, g.nav.places, 'Markville', null, P)[0];
    g.nav.set(dest); sim.step(2);
    expect(g.nav.route && g.nav.route.length).toBeGreaterThan(2);
    g.player.x = g.nav.target.x; g.player.z = g.nav.target.z; sim.step(2);
    expect(g.nav.target).toBe(null);
  });
  it('teleport moves the player (or the car) next to the place, not during a chase or a job', async () => {
    const sim = await newSim(63), g = sim.game;
    sim.step(5);
    const dest = searchPlaces(world, g.nav.places, 'Pacific Mall', null, g.playerPos())[0];
    expect(g.nav.teleport(dest)).toBe(null);
    let P = g.playerPos();
    expect(Math.hypot(P.x - dest.x, P.z - dest.z)).toBeLessThan(90);
    expect(world.inWater(P.x, P.z)).toBe(false);
    sim.step(3);
    expect(sim.nonFinite()).toEqual([]);
    // in a car: the car comes along
    const car = g.makeCar('sedan', P.x + 3, P.z, 0, { parked: true }); g.enterCar(car);
    const civic = searchPlaces(world, g.nav.places, '市政厅', null, P)[0];
    expect(g.nav.teleport(civic)).toBe(null);
    P = g.playerPos();
    expect(g.inCar).toBe(car);
    expect(Math.hypot(P.x - civic.x, P.z - civic.z)).toBeLessThan(90);
    g.chase.active = true;
    expect(g.nav.teleport(dest)).toBe('tpChase');
  });
});
