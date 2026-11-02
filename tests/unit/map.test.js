// Data contract for maps/markham.json (built by tools/build_map.py).
// Only checks what the game relies on, so adding new keys, landmark types or
// extra fields per item keeps it green.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const MAP_URL = new URL('../../maps/markham.json', import.meta.url);
const map = JSON.parse(readFileSync(MAP_URL, 'utf8'));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPt = (p) => Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]);

describe('maps/markham.json', () => {
  it('is small enough to ship (< 3 MB)', () => {
    expect(statSync(MAP_URL).size).toBeLessThan(3 * 1024 * 1024);
  });

  it('credits OpenStreetMap (ODbL)', () => {
    expect(map.attribution).toMatch(/OpenStreetMap/);
    expect(map.attribution).toMatch(/York Region/); // D-68: York footprints fill in commercial buildings
  });

  it('has every section that js/world.js and js/game.js read', () => {
    const arrays = ['names', 'nodes', 'edges', 'busways', 'overpass', 'rails', 'rivers', 'water', 'parks', 'lots',
      'buildings', 'houses', 'houseWalls', 'houseRoofs', 'trees', 'landmarks'];
    for (const k of arrays) expect(Array.isArray(map[k]), k).toBe(true);
    expect(map.half).toHaveLength(2);
    expect(map.half.every((v) => isNum(v) && v > 0)).toBe(true);
    expect(isPt(map.spawn)).toBe(true);
  });

  it('nodes are finite [x, z] points', () => {
    expect(map.nodes.length).toBeGreaterThan(100);
    const bad = map.nodes.findIndex((n) => !isPt(n));
    expect(bad).toBe(-1);
  });

  it('every edge references valid nodes, has a width > 0 and a polyline from node a to node b', () => {
    // edge = [a, b, class, width, oneway, nameIndex, points, ...future fields]
    const N = map.nodes.length, bad = [];
    map.edges.forEach((e, i) => {
      const [a, b, cls, w, oneway, name, pts] = e;
      const why = !Number.isInteger(a) || a < 0 || a >= N ? 'node a'
        : !Number.isInteger(b) || b < 0 || b >= N ? 'node b'
        : !Number.isInteger(cls) || cls < 0 ? 'class'
        : !isNum(w) || w <= 0 ? 'width'
        : ![0, 1, true, false].includes(oneway) ? 'oneway'
        : !Number.isInteger(name) || name < 0 || name >= map.names.length ? 'name index'
        : !Array.isArray(pts) || pts.length < 2 || !pts.every(isPt) ? 'points'
        : Math.hypot(pts[0][0] - map.nodes[a][0], pts[0][1] - map.nodes[a][1]) > 0.5 ? 'start != node a'
        : Math.hypot(pts.at(-1)[0] - map.nodes[b][0], pts.at(-1)[1] - map.nodes[b][1]) > 0.5 ? 'end != node b'
        : null;
      if (why) bad.push(`edge ${i}: ${why}`);
    });
    expect(bad.slice(0, 10)).toEqual([]);
    expect(map.edges.length).toBeGreaterThan(100);
  });

  it('spawns within ~60 m of the Hwy 7 x Kennedy Rd junction', () => {
    const hwy7 = map.names.indexOf('Hwy 7'), kennedy = map.names.indexOf('Kennedy Rd');
    expect(hwy7).toBeGreaterThanOrEqual(0);
    expect(kennedy).toBeGreaterThanOrEqual(0);
    const roadsAt = new Map(); // node -> set of road-name indices meeting there
    for (const e of map.edges) for (const n of [e[0], e[1]]) {
      if (!roadsAt.has(n)) roadsAt.set(n, new Set());
      roadsAt.get(n).add(e[5]);
    }
    const junctions = [...roadsAt].filter(([, s]) => s.has(hwy7) && s.has(kennedy)).map(([n]) => map.nodes[n]);
    expect(junctions.length).toBeGreaterThan(0);
    const [sx, sz] = map.spawn;
    const d = Math.min(...junctions.map(([x, z]) => Math.hypot(x - sx, z - sz)));
    expect(d).toBeLessThan(60);
  });

  it('has the first landmarks: Pacific Mall, Markville, Civic Centre and at least two Tim Hortons', () => {
    const types = map.landmarks.map((l) => l.t);
    expect(types).toEqual(expect.arrayContaining(['pacific', 'markville', 'civic']));
    expect(types.filter((t) => t === 'tims').length).toBeGreaterThanOrEqual(2);
    for (const lm of map.landmarks.filter((l) => ['pacific', 'markville', 'civic', 'tims'].includes(l.t))) {
      expect(isNum(lm.x) && isNum(lm.z) && isNum(lm.h), lm.t).toBe(true);
      expect(Math.abs(lm.x)).toBeLessThanOrEqual(map.half[0]);
      expect(Math.abs(lm.z)).toBeLessThanOrEqual(map.half[1]);
    }
  });

  it('buildings, houses and trees are well formed (they become colliders)', () => {
    expect(map.buildings.filter((b) => !(Array.isArray(b.p) && b.p.length >= 3 && b.p.every(isPt) && isNum(b.h) && b.h > 0)).length).toBe(0);
    // house = [x, z, angle, width, depth, height, wall colour, roof colour]
    expect(map.houses.filter((h) => !(h.slice(0, 6).every(isNum) && h[3] > 0 && h[4] > 0 && h[5] > 0)).length).toBe(0);
    expect(map.trees.filter((t) => !(isPt(t) && isNum(t[2]) && t[2] > 0)).length).toBe(0);
  });
});
