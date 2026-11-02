// v0.4 (D-70): the Markham mischief list and the golden dim sum, run headless.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootSim } from '../helpers/headless.js';
import { CFG } from '../../js/config.js';

let world;
beforeAll(async () => { world = (await bootSim()).world; });
const newSim = (seed) => bootSim({ world, seed });

describe('golden dim sum', () => {
  it('30 buns, spread out, on reachable sidewalks, the same every game', async () => {
    const a = (await newSim(51)).game.pranks.buns, b = (await newSim(52)).game.pranks.buns;
    expect(a.length).toBe(CFG.pranks.buns);
    expect(a.map((x) => x.key)).toEqual(b.map((x) => x.key));
    for (const p of a) {
      expect(world.inWater(p.x, p.z)).toBe(false);
      for (const q of a) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(CFG.pranks.bunGap);
    }
  });
  it('walking into one collects it and pays', async () => {
    const sim = await newSim(53), g = sim.game, P = g.pranks;
    sim.step(5);
    const b = P.buns.find((x) => !x.got), before = g.missions.save.money;
    g.player.x = b.x; g.player.z = b.z; sim.step(2);
    expect(b.got).toBe(true);
    expect(g.missions.save.money).toBe(before + CFG.pranks.bun);
  });
});

describe('mischief list', () => {
  it('stealing a fire truck and a police car tick their pranks', async () => {
    const sim = await newSim(54), g = sim.game, P = g.pranks;
    sim.step(5);
    g.enterCar(g.makeCar('fire', g.player.x + 3, g.player.z, 0, { parked: true }));
    g.exitCar(true);
    g.enterCar(g.makeCar('police', g.player.x + 3, g.player.z, 0, { parked: true }));
    expect(P.save.done).toContain('firetruck');
    expect(P.save.done).toContain('police');
  });
  it('knocking down 5 people with a car counts up to the prank', async () => {
    const sim = await newSim(55), P = (await sim).game.pranks;
    for (let i = 0; i < 4; i++) P.on('runover', {});
    expect(P.save.done).not.toContain('bowling');
    P.on('runover', {});
    expect(P.save.done).toContain('bowling');
  });
  it('the list panel renders every prank, race and counter', async () => {
    const sim = await newSim(56), el = { innerHTML: '' };
    sim.game.pranks.render(el);
    for (const p of sim.game.pranks.list) expect(el.innerHTML).toContain(sim.game.pranks.label(p));
    expect(el.innerHTML).not.toContain('undefined');
  });
});
