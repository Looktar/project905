// Headless gameplay simulation: the real World + Game run in Node through
// tests/helpers/headless.js (fake renderer / HUD, seeded Math.random).
import { describe, it, expect, beforeAll } from 'vitest';
import { bootSim, pointInPoly } from '../helpers/headless.js';
import { CFG } from '../../js/config.js';
import { t } from '../../js/i18n.js';
import { segDist } from '../../js/math.js';

const DT = 1 / 30;
// Runs are deterministic per seed. SIM_SEED=<n> shifts every seed to try other random
// streams (e.g. `for i in $(seq 20); do SIM_SEED=$i npx vitest run tests/unit/sim.test.js; done`).
const SEED = Number(process.env.SIM_SEED || 0);
let world;
beforeAll(async () => { world = (await bootSim()).world; }); // the World is built once (~1 s)
const newSim = (seed) => bootSim({ world, seed: seed + SEED * 1000 }); // fresh Game, same World

// ---------------------------------------------------------------- helpers
// Entity limits implied by js/config.js + js/game.js (desktop counts: the
// matchMedia stub reports pointer: fine).
function limits() {
  const PO = CFG.police, policeCars = Math.max(PO.carPatrol, PO.carChase);
  return {
    peds: CFG.peds.countDesktop, // the scripts below never carjack (that adds the driver as a ped)
    traffic: CFG.traffic.countDesktop,
    police: policeCars,
    cops: PO.footPatrol + PO.footChase + 2 * policeCars, // patrol + reinforcements + 2 officers per police car
    buses: CFG.bus.count,
    laneBuses: CFG.bus.laneCount,
    cars: CFG.traffic.countDesktop + policeCars + CFG.traffic.parked + CFG.bus.laneCount + 2, // + the car parked at spawn + one the player left
  };
}
function invariantProblems(sim) {
  const out = sim.nonFinite();
  const c = sim.counts(), L = limits();
  for (const k of Object.keys(L)) if (c[k] > L[k]) out.push(`${k}: ${c[k]} > limit ${L[k]}`);
  const P = sim.playerPos();
  const b = sim.buildingAt(P.x, P.z);
  if (b) out.push(`player inside a ${b.kind === 'h' ? 'house' : 'building'} at (${P.x.toFixed(1)}, ${P.z.toFixed(1)})`);
  return out;
}
const centroid = (poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const polyDistance = (x, z, poly) => Math.min(...poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return segDist(x, z, p[0], p[1], q[0], q[1]).d; }));
function nearestBuilding(sim, x, z, R = 80) {
  let best = null, bd = Infinity;
  for (const id of sim.world.query(x - R, z - R, x + R, z + R)) {
    const c = sim.world.colliders[id];
    if (c.kind !== 'b' && c.kind !== 'h') continue;
    const d = polyDistance(x, z, c.poly);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
// a free spot (not inside any collider) rMin..rMax metres from `from`, optionally with line of sight to it
function findSpot(sim, from, rMin, rMax, needLos) {
  for (let r = rMin; r <= rMax; r += 1)
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (sim.buildingAt(x, z, ['b', 'h', 't', 'c']) || sim.world.inWater(x, z)) continue;
      if (needLos && !sim.world.los(x, z, from.x, from.z)) continue;
      return { x, z };
    }
  return null;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- boot + invariants
describe('headless boot', () => {
  it('builds the world and starts the game the way main.js does', async () => {
    const sim = await newSim(1);
    const { game, renderer } = sim;
    expect(renderer.calls.mesh).toBeGreaterThan(50);       // per-chunk static meshes
    expect(renderer.calls.instanced).toBeGreaterThan(50);  // houses / trees / lamps / parked cars + character batches
    expect(renderer.unknown.size).toBe(0);
    expect(world.chunks.size).toBeGreaterThan(20);
    // player on the sidewalk near Hwy 7 x Kennedy Rd, with people and a car around
    const [sx, sz] = world.map.spawn;
    expect(Math.hypot(game.player.x - sx, game.player.z - sz)).toBeLessThan(40);
    expect(sim.buildingAt(game.player.x, game.player.z)).toBeNull();
    expect(world.streetName(game.player.x, game.player.z)).toMatch(/Hwy 7|Kennedy/);
    expect(sim.counts().peds).toBeGreaterThan(CFG.peds.countDesktop / 2);
    expect(game.cars.some((c) => c.parked && dist(c, game.player) < 40)).toBe(true);
    expect(sim.nonFinite()).toEqual([]);
  });

  it('stays consistent through a scripted session: run into a building, punch around, drive, get out', async () => {
    const sim = await newSim(11);
    const g = sim.game, p = sim.player;
    const problems = [];
    const check = (s) => { for (const msg of invariantProblems(s)) problems.push(`t=${s.time.toFixed(2)}s ${msg}`); };

    // 1) run straight at the nearest building / house for 5 s
    const wall = nearestBuilding(sim, p.x, p.z);
    const [cx, cz] = centroid(wall.poly);
    let closest = Infinity;
    for (let i = 0; i < 150; i++) {
      sim.steerToward(cx, cz, { analog: false, run: true }).step(1, DT, check);
      closest = Math.min(closest, polyDistance(p.x, p.z, wall.poly));
    }
    expect(closest, 'the player should reach the wall').toBeLessThan(p.r + 0.25);
    expect(pointInPoly(p.x, p.z, wall.poly)).toBe(false);

    // 2) run in circles for 6 s, punching twice a second
    for (let i = 0; i < 180; i++) {
      const a = i * 0.05;
      sim.setInput({ mx: Math.cos(a), my: Math.sin(a), analog: false, run: i % 60 < 30 });
      if (i % 15 === 0) sim.press('punch');
      sim.step(1, DT, check);
    }

    // 3) calm down (no chase, no fights), walk to the nearest free car and get in
    for (let i = 0; i < 200 && g.busted > 0; i++) sim.step(1, DT, check);
    g.endChase(true); sim.removePolice().resetInput();
    for (const c of g.chars) if (c.state === 'fight') g.flee(c, p.x, p.z);
    for (let i = 0; i < 200 && p.state !== 'walk'; i++) sim.step(1, DT, check);
    const free = g.cars.filter((c) => !c.driver && !c.ai && c.type !== 'police' && dist(c, p) < 40).sort((a, b) => dist(a, p) - dist(b, p));
    const car = free[0] || sim.parkCarNear(p.x, p.z);
    for (let i = 0; i < 300 && dist(car, p) > 1.8; i++) sim.steerToward(car.x, car.z, { analog: false }).step(1, DT, check);
    sim.resetInput().press('enter').step(1, DT, check);
    expect(g.inCar).toBe(car);
    expect(p.hidden).toBe(true);

    // 4) drive: stick up for 4 s, a handbrake turn, then pull the stick back
    const start = { x: car.x, z: car.z };
    let far = 0;
    const track = (s) => { check(s); far = Math.max(far, dist(car, start)); };
    sim.setInput({ mx: 0, my: 1, analog: true }).step(120, DT, track);
    sim.setInput({ mx: 1, my: 0, analog: true, handbrake: true }).step(45, DT, track);
    sim.setInput({ mx: 0, my: -1, analog: true, handbrake: false }).step(60, DT, track);
    expect(far, 'the car should have moved').toBeGreaterThan(15);

    // 5) get out and walk off (running someone over can start a chase that ends in a
    //    bust; input is ignored while busted, and the respawn puts the player on foot)
    for (let i = 0; i < 200 && g.busted > 0; i++) sim.step(1, DT, check);
    if (g.inCar) sim.resetInput().press('enter').step(1, DT, check);
    expect(g.inCar).toBeNull();
    expect(p.hidden).toBe(false);
    sim.setInput({ mx: -1, my: 0.3 }).step(60, DT, check);

    expect(problems.slice(0, 10)).toEqual([]);
    // CPU side of rendering: per-frame instance buffers fill up within capacity
    const n = sim.render();
    for (const [k, b] of Object.entries(g.B)) expect(b.n, k).toBeLessThanOrEqual(b.cap);
    expect(n.head).toBeGreaterThan(0);
    expect(n.carBody).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- combat + police
describe('combat and police', () => {
  it('a landed punch gives feedback: shake, a short hit-stop and a squash pop, all settling back', async () => {
    const sim = await newSim(22);
    sim.step(1).removePolice();
    const g = sim.game;
    const at = sim.ahead(1.0);
    const ped = sim.spawn('ped', at.x, at.z, { temper: 'timid', hp: 80, maxhp: 80 });
    sim.press('punch').step();
    expect(ped.hp).toBeLessThan(80);
    expect(g.shake).toBeGreaterThan(0);
    expect(g.hitStop).toBeGreaterThan(0);
    expect(ped.squashT).toBeGreaterThan(0);
    sim.seconds(1.5);
    expect(g.shake).toBe(0);
    expect(g.hitStop).toBeLessThanOrEqual(0);
    expect(ped.squashT).toBeLessThanOrEqual(0);
  });

  it('punching a pedestrian in front of the player lowers its hp; the punch then cools down', async () => {
    const sim = await newSim(21);
    sim.step(1).removePolice(); // spawning waits 0.4 s after this frame
    const g = sim.game, p = sim.player;
    const at = sim.ahead(1.0);
    const ped = sim.spawn('ped', at.x, at.z, { temper: 'normal', hp: 80, maxhp: 80 });
    sim.press('punch').step();
    const dmg = 80 - ped.hp;
    expect(dmg).toBeGreaterThanOrEqual(CFG.player.punchDmg[0]);
    expect(dmg).toBeLessThanOrEqual(CFG.player.punchDmg[1]);
    expect(p.cd).toBeGreaterThan(0);
    const hp1 = ped.hp;
    sim.press('punch').step(); // still cooling down: no second hit
    expect(ped.hp).toBe(hp1);
    expect(g.chase.active).toBe(false); // no officer around
  });

  it('a crime seen by a cop starts the chase; officers within the alert radius join', async () => {
    const sim = await newSim(31);
    sim.step(1).removePolice();
    const g = sim.game, p = sim.player, PO = CFG.police;
    const at = sim.ahead(1.0);
    const spot = findSpot(sim, at, 8, PO.sight - 6, true);
    expect(spot, 'a spot with a clear view of the victim').not.toBeNull();
    const witness = sim.spawn('cop', spot.x, spot.z);
    const backup = sim.spawn('cop', p.x + (PO.alert - 15), p.z);   // in alert range, cannot see
    const tooFar = sim.spawn('cop', p.x, p.z + PO.alert + 25);     // outside alert range
    sim.spawn('ped', at.x, at.z, { temper: 'timid' });
    sim.press('punch').step();
    expect(g.chase.active).toBe(true);
    expect(witness.state).toBe('chase');
    expect(backup.state).toBe('chase');
    expect(tooFar.state).not.toBe('chase');
    expect(sim.hud.calls('banner')).toContainEqual([t('chase'), 'red']);
  });

  it('a crime no officer can see does not start a chase', async () => {
    const sim = await newSim(32);
    sim.step(1).removePolice();
    const at = sim.ahead(1.0);
    const spot = findSpot(sim, at, CFG.police.sight + 8, CFG.police.sight + 20, false);
    sim.spawn('cop', spot.x, spot.z); // beyond sight range
    const victim = sim.spawn('ped', at.x, at.z, { hp: 80, maxhp: 80 });
    sim.press('punch').step();
    expect(victim.hp).toBeLessThan(80);
    expect(sim.game.chase.active).toBe(false);
  });

  it(`never more than ${CFG.police.max} officers (on foot + in cars) during a long chase (spec 6.4)`, async () => {
    const sim = await newSim(43);
    sim.step(1);
    const g = sim.game;
    let most = 0;
    // keep the chase alive for 60 s (seen every frame) and let patrols, police cars and reinforcements pour in
    for (let i = 0; i < Math.round(60 / DT); i++) {
      g.startChase(sim.player.x, sim.player.z);
      sim.step();
      most = Math.max(most, g.policeCount());
    }
    expect(CFG.police.max).toBeLessThanOrEqual(8); // spec 6.4 default; uncapped this scenario reaches 9-10
    expect(most).toBeGreaterThan(2);
    expect(most).toBeLessThanOrEqual(CFG.police.max);
  });

  it(`the chase ends after ${CFG.police.giveUp} s unseen, not before`, async () => {
    const sim = await newSim(41);
    sim.step(1).freezeSpawning(); // no new units arrive
    const g = sim.game, giveUp = CFG.police.giveUp;
    g.startChase(sim.player.x, sim.player.z);
    expect(g.chase.active).toBe(true);
    // stay hidden: every frame, drop all police (incl. the reinforcements the chase calls in)
    const hidden = (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) sim.removePolice().step(); };
    hidden(giveUp - 0.5);
    expect(g.chase.active).toBe(true);
    expect(g.chase.unseen).toBeCloseTo(giveUp - 0.5, 1);
    hidden(1);
    expect(g.chase.active).toBe(false);
    expect(sim.hud.calls('banner')).toContainEqual([t('escaped'), 'green']);
  });

  it('being seen again resets the give-up timer', async () => {
    const sim = await newSim(42);
    sim.step(1).freezeSpawning();
    const g = sim.game, p = sim.player;
    g.startChase(p.x, p.z);
    for (let i = 0; i < 150; i++) sim.removePolice().step();
    expect(g.chase.unseen).toBeGreaterThan(4);
    const spot = findSpot(sim, p, 6, 15, true);
    sim.spawn('cop', spot.x, spot.z, { state: 'chase' });
    sim.step();
    expect(g.chase.unseen).toBe(0);
    expect(g.chase.active).toBe(true);
  });

  it(`an officer holding the player for ${CFG.police.bustFoot} s busts them; so does a knock-out by a cop`, async () => {
    const sim = await newSim(43);
    sim.step(1).freezeSpawning().removePolice();
    const g = sim.game, p = sim.player;
    g.startChase(p.x, p.z);
    sim.spawn('cop', p.x + 0.9, p.z, { state: 'chase' });
    sim.seconds(CFG.police.bustFoot - 0.3);
    expect(g.busted).toBe(0);
    sim.seconds(0.6);
    expect(g.busted).toBeGreaterThan(0);
    expect(sim.hud.calls('busted')).toContainEqual([true]);

    const sim2 = await newSim(44);
    sim2.step(1).removePolice();
    const cop = sim2.spawn('cop', sim2.player.x + 1, sim2.player.z);
    sim2.game.hit(sim2.player, 1000, cop);
    expect(sim2.player.state).toBe('ko');
    expect(sim2.game.busted).toBeGreaterThan(0);
  });

  it('after bust() and the busted timer the player respawns far from the cops, chase cleared', async () => {
    const sim = await newSim(51);
    sim.step(1).removePolice();
    const g = sim.game, p = sim.player;
    const before = { x: p.x, z: p.z };
    sim.spawn('cop', p.x + 2, p.z, { state: 'chase' });
    sim.spawn('cop', p.x - 2, p.z + 1, { state: 'chase' });
    g.startChase(p.x, p.z);
    g.bust();
    expect(g.busted).toBeGreaterThan(0);
    let frames = 0;
    while (g.busted > 0 && frames++ < 200) sim.step();
    expect(frames).toBe(Math.ceil(2.2 / DT)); // ~2 s "BUSTED!" screen
    expect(sim.hud.calls('busted').at(-1)).toEqual([false]);
    expect(g.chase.active).toBe(false);
    expect(g.cars.some((c) => c.chasing)).toBe(false);
    expect(g.chars.filter((c) => c.kind === 'cop' && dist(c, p) < 100)).toEqual([]);
    expect(p).toMatchObject({ state: 'walk', hp: CFG.player.hp });
    expect(p.invuln).toBeGreaterThan(0);
    const d = dist(p, before);
    expect(d).toBeGreaterThanOrEqual(150);
    expect(d).toBeLessThanOrEqual(300 + 10); // spec 2.5: 150-300 m
    expect(sim.buildingAt(p.x, p.z)).toBeNull();
    expect(sim.world.inWater(p.x, p.z)).toBe(false);
  });
});

describe('respawn distance after a bust (spec 2.5: 150-300 m)', () => {
  const dists = [];
  it('respawns at least 150 m away, outside buildings and water, from several places', async () => {
    const sim = await newSim(61);
    sim.step(1).freezeSpawning();
    const g = sim.game, p = sim.player;
    const origin = { x: p.x, z: p.z };
    for (const [dx, dz] of [[0, 0], [300, 0], [0, -400], [-600, 100]]) {
      const s = sim.sidewalkNear(origin.x + dx, origin.z + dz);
      for (let i = 0; i < 10; i++) {
        Object.assign(p, { x: s.x, z: s.z });
        sim.spawn('cop', s.x + 4, s.z, { state: 'chase' });
        sim.spawn('cop', s.x - 3, s.z + 3, { state: 'chase' });
        // in the game finishBust() runs at the start of update(); the same update's
        // collision pass then pushes the player out of any building at the new spot
        g.finishBust();
        sim.step();
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        dists.push(d);
        expect(d).toBeGreaterThanOrEqual(150);
        expect(sim.world.inWater(p.x, p.z)).toBe(false);
        expect(sim.buildingAt(p.x, p.z)).toBeNull();
      }
    }
    expect(dists).toHaveLength(40);
  });

  // finishBust used to snap to the START of the nearest road segment and never re-check the
  // distance (respawns at 300-450 m); it now snaps to the nearest point and re-checks.
  it('every respawn is within 150-300 m (+ sidewalk offset)', () => {
    expect(dists).toHaveLength(40);
    for (const d of dists) expect(d).toBeLessThanOrEqual(300 + 10);
  });
});

describe('NPCs move like people (no gliding, no popping into view)', () => {
  const WALKING = ['walk', 'patrol', 'cross', 'wander', 'leave'];
  // main.js camera: follow the player, zoom out with car speed
  const followCamera = (g, dt) => {
    const car = g.inCar, C = CFG.camera, P = g.playerPos();
    const want = car ? C.distCarMin + (C.distCarMax - C.distCarMin) * Math.min(1, Math.abs(car.speed) / CFG.car.maxSpeed) : C.distWalk;
    g.camDist += (want - g.camDist) * (1 - Math.exp(-1.5 * dt));
    g.camPos[0] += (P.x - g.camPos[0]) * (1 - Math.exp(-6 * dt));
    g.camPos[2] += (P.z - g.camPos[2]) * (1 - Math.exp(-6 * dt));
  };

  it('walking pedestrians and officers never move faster than a brisk walk', async () => {
    const sim = await newSim(71);
    const g = sim.game, last = new Map(), limit = CFG.peds.walk * 2.2; // ~3.5 m/s: a brisk walk (crossing is 2 m/s)
    let glideFrames = 0;
    sim.seconds(60, DT, () => {
      for (const c of g.chars) {
        if (c === g.player) continue;
        const l = last.get(c);
        if (l && WALKING.includes(c.state) && WALKING.includes(l.state) && Math.hypot(c.vx, c.vz) < 0.5) {
          if (Math.hypot(c.x - l.x, c.z - l.z) / DT > limit) glideFrames++;
        }
        last.set(c, { x: c.x, z: c.z, state: c.state });
      }
    });
    // the old exponential catch-up glided ~900 frames a minute at junction corners (often > 6 m/s);
    // a few single-frame shoves (crowding, walls) are fine
    expect(glideFrames).toBeLessThan(15);
  });

  it('new pedestrians, officers and cars appear off-screen while the camera follows the player', async () => {
    for (const drive of [false, true]) {
      const sim = await newSim(drive ? 73 : 72);
      const g = sim.game;
      if (drive) g.enterCar(sim.parkCarNear(g.player.x, g.player.z));
      const seen = new Set([...g.chars, ...g.cars]);
      let spawned = 0;
      const popped = [];
      sim.seconds(45, DT, (s, i) => {
        s.setInput({ mx: Math.cos(i / 300), my: Math.sin(i / 300), run: true, analog: true });
        followCamera(g, DT);
        for (const c of [...g.chars, ...g.cars]) {
          if (seen.has(c)) continue;
          seen.add(c); spawned++;
          // carjacked drivers and officers stepping out of their car appear next to it on purpose
          const nearCar = g.cars.some((car) => car !== c && Math.hypot(car.x - c.x, car.z - c.z) < 4);
          if (g.onScreen(c.x, c.z) && !nearCar) popped.push(c.kind || c.type);
        }
      });
      expect(spawned).toBeGreaterThan(10);
      expect(popped).toEqual([]);
    }
  });
});

describe('pedestrians and the player', () => {
  it('a pedestrian walks smoothly around the player standing in its way (no shaking, no getting stuck)', async () => {
    for (const seed of [81, 82, 83]) {
      const sim = await newSim(seed);
      sim.step(30);
      const g = sim.game, p = g.player;
      const ped = g.chars.find((c) => c.kind === 'ped' && c.state === 'walk' && c.path && c.path.e.len - c.path.s > 25);
      expect(ped, 'a walking pedestrian with room ahead').toBeTruthy();
      for (const c of g.chars) if (c !== p && c !== ped) c.x += 1000; // just the two of them
      g.cars.length = 0;
      sim.freezeSpawning();
      const off = (ped.path.e.oneway ? ped.path.dir : 1) * (ped.path.e.w / 2 + 1.7);
      const spot = g.w.edgePoint(ped.path.e, ped.path.s + 5, ped.path.dir, off);
      Object.assign(p, { x: spot.x, z: spot.z });
      const fx = spot.dx, fz = spot.dz; // walking direction at the player
      let reversals = 0, prev = null, x = ped.x, z = ped.z;
      sim.seconds(8, DT, () => {
        const d = [ped.x - x, ped.z - z]; x = ped.x; z = ped.z;
        if (prev && Math.hypot(...d) > 0.004 && Math.hypot(...prev) > 0.004 && d[0] * prev[0] + d[1] * prev[1] < 0) reversals++;
        prev = d;
      });
      expect(reversals).toBeLessThanOrEqual(2);
      // not stuck at the player: walked on (around them, or crossed the street)
      expect(Math.hypot(ped.x - p.x, ped.z - p.z)).toBeGreaterThan(2);
      if (ped.state === 'walk') expect((ped.x - p.x) * fx + (ped.z - p.z) * fz).toBeGreaterThan(2);
    }
  });
});

describe('Viva buses in Hwy 7 traffic', () => {
  it('buses appear around the spawn, keep to Hwy 7 and cannot be boarded (spec 2.3)', async () => {
    const sim = await newSim(91);
    const g = sim.game, hwy7 = g.w.names.indexOf('Hwy 7');
    let seen = null, offRoad = 0;
    sim.seconds(40, DT, () => {
      for (const b of g.cars) if (b.bus) { seen = seen || b; if (b.ai.path.e.name !== hwy7) offRoad++; }
    });
    expect(seen, 'a Viva bus in Hwy 7 traffic within 40 s').toBeTruthy();
    expect(offRoad).toBe(0);
    // stand next to the bus and press enter: nothing happens
    const b = g.cars.find((c) => c.bus);
    Object.assign(g.player, { x: b.x + Math.cos(b.a) * 2, z: b.z - Math.sin(b.a) * 2 });
    b.speed = 0; b.stopT = 5;
    sim.press('enter').step();
    expect(g.inCar === b).toBe(false);
  });
});

describe('pedestrians and traffic lights', () => {
  it('at signalised junctions pedestrians start crossing on their green', async () => {
    const sim = await newSim(95);
    const g = sim.game, sigs = g.w.signals;
    let starts = 0, onRed = 0;
    sim.seconds(120, DT, () => {
      for (const c of g.chars) {
        if (c._waiting && c.state === 'cross' && c.crossWait <= 0 && c.crossSig) {
          starts++;
          if (g.w.signalState(c.crossSig, c.crossAxis, g.time) !== 0) onRed++;
        }
        c._waiting = c.state === 'cross' && c.crossWait > 0;
      }
    });
    expect(sigs.length).toBeGreaterThan(50);
    expect(starts).toBeGreaterThan(5);
    // before signals were respected ~1 in 6 started on red
    expect(onRed).toBe(0);
  });
});
