import { describe, it, expect } from 'vitest';
import { fitModel, modelsWanted, POLYFORK } from '../../js/models.js';
import { MAT_A, MAT_V } from '../../js/geo.js';

// a fake 2 m long "car": 2 triangles of orange paint, 1 dark tyre triangle, raised 1 m off the ground
const tri = (c, z0) => ({ p: [-1, 1, z0, 1, 1, z0, 0, 2, z0 + 2], c: [...c, ...c, ...c] });
function fakeCar() {
  const parts = [tri([0.7, 0.53, 0.26], -1), tri([0.7, 0.53, 0.26], -1), tri([0.1, 0.1, 0.1], -1)];
  const p = parts.flatMap((t) => t.p), c = parts.flatMap((t) => t.c), n = p.map((_, i) => (i % 3 === 1 ? 1 : 0));
  return { p, n, c, bounds: { lo: [-1, 1, -1], hi: [1, 2, 1] } };
}

describe('Polyfork model fitting', () => {
  it('scales to the game length, centres on x/z, puts the base on the ground', () => {
    const m = fitModel(fakeCar(), { fit: { len: 4.4 } });
    expect(m.bounds.hi[2] - m.bounds.lo[2]).toBeCloseTo(4.4, 5);
    expect(Math.min(...m.p.filter((_, i) => i % 3 === 1))).toBeCloseTo(0, 5);
    expect(m.bounds.lo[0] + m.bounds.hi[0]).toBeCloseTo(0, 5);
  });
  it('turns the paint into instance colour A (white) and leaves trim as vertex colour', () => {
    const m = fitModel(fakeCar(), { fit: { len: 4.4 }, paint: true });
    expect([...m.mat.slice(0, 6)]).toEqual(Array(6).fill(MAT_A));
    expect([...m.mat.slice(6)]).toEqual(Array(3).fill(MAT_V));
    expect([m.c[0], m.c[1], m.c[2]]).toEqual([1, 1, 1]);
    expect(m.c[18]).toBeCloseTo(0.1, 5);
  });
  it('grades colours lighter and more saturated', () => {
    const m = fitModel(fakeCar(), { fit: { len: 4.4 }, grade: { light: 1.3, sat: 1.35 } });
    expect(m.c[0]).toBeGreaterThan(0.7);
    expect(m.c[0] - m.c[2]).toBeGreaterThan(0.7 - 0.26);
  });
  it('an explicit paint colour (not saturated enough to detect) becomes the tint', () => {
    const m = fitModel(fakeCar(), { fit: { len: 4.4 }, paint: [0.1, 0.1, 0.1] });
    expect([...m.mat]).toEqual([...Array(6).fill(MAT_V), ...Array(3).fill(MAT_A)]);
    expect(m.c[6 * 3]).toBe(1);
    expect(m.c[0]).toBeCloseTo(0.7, 5);
  });
  it('fits by width, and origin "base" puts the pole (lowest vertices) at x/z = 0', () => {
    // a "lamp": pole base at x = -1 .. -0.6 (y = 0), arm reaching out to x = 3 at the top
    const lamp = { p: [-1, 0, 0, -0.6, 0, 0, -0.8, 4, 0, -0.8, 4, 0, 3, 4, 0, 3, 3.6, 0], n: Array(18).fill(0), c: Array(18).fill(0.5), bounds: { lo: [-1, 0, 0], hi: [3, 4, 0] } };
    const w = fitModel(lamp, { fit: { width: 2 } });
    expect(w.bounds.hi[0] - w.bounds.lo[0]).toBeCloseTo(2, 5);
    const b = fitModel(lamp, { fit: { height: 4 }, origin: 'base' });
    expect((b.p[0] + b.p[3]) / 2).toBeCloseTo(0, 5);
    expect(b.bounds.hi[0]).toBeCloseTo(3.8, 5);
  });
  it('?pf=1 / ?pf=0 override the default; every model has an id', () => {
    expect(modelsWanted('?pf=1', false)).toBe(true);
    expect(modelsWanted('?debug=1&pf=0', true)).toBe(false);
    expect(modelsWanted('', true)).toBe(true);
    for (const def of Object.values(POLYFORK)) expect(def.id).toMatch(/^[a-z0-9-]+-[0-9a-f]{6}$/);
  });
});
