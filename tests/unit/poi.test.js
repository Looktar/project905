// v0.2 recognisable buildings (tools/build_map.py POI pass + js/poi.js): parody names only,
// gas stations you can drive under, canopies that fade like buildings, a small sign atlas.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootSim, loadMap } from '../helpers/headless.js';
import { CFG } from '../../js/config.js';

const map = loadMap();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// content red line: real brand names must never reach a sign (puns only)
const REAL_BRANDS = ['Petro-Canada', 'Circle K', 'Esso', 'Shell', "McDonald's", 'Boston Pizza', 'Swiss Chalet', 'No Frills',
  'Loblaws', 'FreshCo', 'Walmart', 'Costco', 'Home Depot', 'Canadian Tire', 'Rona', 'Shoppers Drug Mart', 'LCBO', 'Staples',
  'Canada Computers', 'Winners', 'RBC', 'TD Canada', 'BMO', 'CIBC', 'HSBC', 'Scotiabank', 'Hilton', 'Courtyard', 'Monte Carlo',
  'YMCA', 'Toyota', 'Honda', 'Kia ', 'Mazda', 'Mercedes', 'BMW', 'Audi', 'Volvo', 'Infiniti', 'Ford', 'Cadillac', 'Chevrolet',
  'Porsche', 'Subaru', 'Lexus', 'Nissan', 'Hyundai', 'Acura', 'Flato', 'Cineplex', 'Tim Hortons', 'Pacific Mall', 'Markville Mall',
  'Splendid China', 'Pan Am', 'IBM'];
const stations = map.buildings.map((b, i) => [b, i]).filter(([b]) => b.st);
const station = (st) => ({ x: st[0], z: st[1], a: st[2], W: st[3], D: st[4] });

describe('POI data (maps/markham.json)', () => {
  it('signs carry parody names only', () => {
    const bad = [];
    for (const b of map.buildings) {
      if (b.n === undefined) continue;
      if (typeof b.n !== 'string' || !b.n.trim()) bad.push(`empty sign at ${b.p[0]}`);
      for (const r of REAL_BRANDS) if (` ${b.n} `.includes(r)) bad.push(`${b.n} contains ${r}`);
    }
    expect(bad).toEqual([]);
    expect(map.buildings.filter((b) => b.n).length).toBeGreaterThanOrEqual(25);
  });

  it('has gas stations with a canopy next to their shop, inside the map', () => {
    expect(stations.length).toBeGreaterThanOrEqual(3);
    for (const [b] of stations) {
      expect(b.poi).toBe('gas');
      expect(b.st.slice(0, 7).every(isNum), JSON.stringify(b.st)).toBe(true);
      const s = station(b.st);
      const [cx, cz] = [b.p.reduce((t, p) => t + p[0], 0) / b.p.length, b.p.reduce((t, p) => t + p[1], 0) / b.p.length];
      expect(Math.hypot(cx - s.x, cz - s.z)).toBeLessThan(40);
      expect(Math.abs(s.x) + s.W / 2).toBeLessThan(map.half[0]);
      expect(Math.abs(s.z) + s.W / 2).toBeLessThan(map.half[1]);
    }
  });

  it('dealers show off cars, every category has a known shape', () => {
    const cats = new Set(['gas', 'carwash', 'dealer', 'fast', 'grocer', 'bigbox', 'shop', 'bank', 'hotel', 'theatre', 'gallery',
      'office', 'plaza', 'church', 'temple', 'school', 'cc', 'library', 'police', 'fire']);
    expect(map.buildings.filter((b) => b.poi && !cats.has(b.poi)).map((b) => b.poi)).toEqual([]);
    const dealers = map.buildings.filter((b) => b.poi === 'dealer');
    expect(dealers.length).toBeGreaterThanOrEqual(5);
    expect(dealers.filter((b) => (b.cars || []).length >= 2).length).toBeGreaterThanOrEqual(5);
  });
});

describe('POIs in the world', () => {
  let world, sim;
  beforeAll(async () => { sim = await bootSim(); world = sim.world; });

  it('a car fits under every canopy between the pump islands, the islands block', () => {
    for (const [, bi] of stations) {
      const s = station(map.buildings[bi].st);
      expect(world.collide(s.x, s.z, CFG.car.radius).hit, `canopy centre ${s.x},${s.z}`).toBe(false);
      const iz = s.D / 2 - 2.1; // pump island offset (js/poi.js islandZ)
      expect(world.collide(s.x + Math.sin(s.a) * iz, s.z + Math.cos(s.a) * iz, 0.5).hit).toBe(true);
    }
  });

  it('the canopy fades (occlusion) when the player stands under it', () => {
    for (const [, bi] of stations) {
      const s = station(map.buildings[bi].st);
      const eye = [s.x + 40, 60, s.z + 50];
      expect(world.occluders(eye, s.x, s.z, CFG.occlusion.sampleY).has(bi)).toBe(true);
    }
  });

  it('keeps the sign atlas to at most two textures (draw calls)', () => {
    expect(world.signStats.count).toBeGreaterThan(40);
    expect(world.signStats.pages.length).toBeLessThanOrEqual(2);
    for (const [w, h] of world.signStats.pages) expect(Math.max(w, h)).toBeLessThanOrEqual(2048);
  });
});
