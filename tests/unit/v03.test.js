// v0.3 gameplay (D-69): fire + fire trucks, and the mission system, run headless.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootSim } from '../helpers/headless.js';
import { CFG } from '../../js/config.js';

let world;
beforeAll(async () => { world = (await bootSim()).world; });
const newSim = (seed) => bootSim({ world, seed });

describe('fire', () => {
  it('a lit car burns, explodes and stays a burnt wreck', async () => {
    const sim = await newSim(31), g = sim.game, p = g.player;
    sim.step(30);
    sim.removePolice(); sim.freezeSpawning(); // (no arrest in the middle of the test)
    const car = g.cars.find((c) => c.parked && !c.bus && c.type !== 'police') || g.cars.find((c) => !c.bus && c.type !== 'police');
    car.speed = 0; car.ai = null; car.parked = true; // a moving one could knock the player down
    p.x = car.x + 2.2; p.z = car.z; p.face = Math.atan2(car.x - p.x, car.z - p.z);
    p.state = 'walk'; p.hp = CFG.player.hp; // (whatever happened in the first 30 s, e.g. a fight)
    g.cars = g.cars.filter((c) => c === car || Math.hypot(c.x - car.x, c.z - car.z) > 8); // no other car within reach
    sim.press('fire').step();
    expect(car.fire).toBeTruthy();
    sim.step(30 * (CFG.fire.carBoom + 1));
    expect(car.burnt).toBe(true);
    expect(car.hp).toBeLessThanOrEqual(0);
    expect(sim.nonFinite()).toEqual([]);
  });
  it('a building fire brings a fire truck whose crew puts it out and drives off', async () => {
    const sim = await newSim(32), g = sim.game, p = g.player;
    sim.step(30);
    const wall = g.fires.wallNear(p.x, p.z, 80) || (() => {
      for (let r = 5; r < 200; r += 5) { const w = g.fires.wallNear(p.x + r, p.z, 6); if (w) return w; }
      return null;
    })();
    expect(wall).toBeTruthy();
    const f = g.fires.igniteBuilding(wall.bi, wall.x, wall.z);
    p.x = wall.x + 25; p.z = wall.z; // watch from nearby (fires far from the player are forgotten)
    let truck = null, sprayed = false;
    for (let s = 0; s < 200 && !f.out; s++) {
      sim.step(30);
      truck = truck || g.cars.find((c) => c.type === 'fire');
      if (g.chars.some((c) => c.kind === 'fireman')) sprayed = true;
    }
    expect(truck).toBeTruthy();
    expect(sprayed).toBe(true);
    expect(f.out).toBe(true);
    sim.step(30 * 20);
    expect(g.chars.some((c) => c.kind === 'fireman')).toBe(false); // back in the truck
    expect(sim.nonFinite()).toEqual([]);
  });
  it('the water cannon of a stolen fire truck puts a fire out', async () => {
    const sim = await newSim(33), g = sim.game, p = g.player;
    sim.step(10);
    const tk = g.makeCar('fire', p.x + 3, p.z, 0, { parked: true });
    g.enterCar(tk);
    const f = g.fires.add({ kind: 'ground', x: tk.x + Math.sin(tk.a) * 12, z: tk.z + Math.cos(tk.a) * 12, pts: [], life: 60 });
    f.pts = [[f.x, 0.2, f.z, 0.8]]; f.dispatchT = undefined;
    sim.setInput({ fireHeld: true });
    sim.step(30 * 6);
    expect(f.out).toBe(true);
  });
});

describe('missions', () => {
  it('a delivery starts in the ring at a restaurant and pays at the destination', async () => {
    const sim = await newSim(41), g = sim.game, M = g.missions, p = g.player;
    sim.step(90);
    const o = M.offers.find((x) => x.type === 'delivery');
    expect(o).toBeTruthy();
    p.x = o.x; p.z = o.z; sim.step(2);
    expect(M.active && M.active.type).toBe('delivery');
    const before = M.save.money;
    p.x = M.active.target.x; p.z = M.active.target.z; sim.step(2);
    expect(M.active).toBe(null);
    expect(M.save.money).toBeGreaterThan(before);
  });
  it('a race needs a car and runs through every checkpoint', async () => {
    const sim = await newSim(42), g = sim.game, M = g.missions;
    sim.step(10);
    const r = M.races[0];
    g.player.x = r.from.x; g.player.z = r.from.z; M.offerT = 0; sim.step(3);
    expect(M.active).toBe(null); // on foot: no race
    const car = g.makeCar('sedan', r.from.x, r.from.z, 0, { parked: true });
    g.enterCar(car); M.offerT = 0; sim.step(3);
    expect(M.active && M.active.type).toBe('race');
    const n = M.active.cps.length;
    expect(n).toBeGreaterThan(2);
    for (let i = 0; i < n && M.active; i++) { car.x = M.active.target.x; car.z = M.active.target.z; car.speed = 0; sim.step(2); }
    expect(M.active).toBe(null);
    expect(M.save.best[r.id]).toBeGreaterThan(0);
  });
  it('being busted fails the job', async () => {
    const sim = await newSim(43), g = sim.game, M = g.missions, p = g.player;
    sim.step(90);
    const o = M.offers.find((x) => x.type === 'delivery');
    p.x = o.x; p.z = o.z; sim.step(2);
    expect(M.active).toBeTruthy();
    g.bust();
    expect(M.active).toBe(null);
  });
});
