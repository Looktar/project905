// js/math.js helpers that gameplay relies on.
import { describe, it, expect } from 'vitest';
import { M, trs, angDiff, segDist, clamp, lerp, hex, rnd } from '../../js/math.js';

const PI = Math.PI;
// column-major mat4 * point
const xf = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
const close = (a, b, digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('angDiff (shortest signed turn from a to b)', () => {
  it('handles the simple cases', () => {
    expect(angDiff(0, PI / 2)).toBeCloseTo(PI / 2);
    expect(angDiff(PI / 2, 0)).toBeCloseTo(-PI / 2);
    expect(angDiff(1, 1)).toBe(0);
  });
  it('wraps around instead of turning the long way', () => {
    expect(angDiff(0, (3 * PI) / 2)).toBeCloseTo(-PI / 2);
    expect(angDiff(-3, 3)).toBeCloseTo(6 - 2 * PI);
    expect(angDiff(0.2, 0.2 + 8 * PI)).toBeCloseTo(0);
    expect(angDiff(10 * PI + 0.1, 0)).toBeCloseTo(-0.1);
  });
  it('always lands in [-PI, PI] and is antisymmetric', () => {
    for (let i = 0; i < 200; i++) {
      const a = Math.sin(i * 12.9898) * 40, b = Math.cos(i * 78.233) * 40;
      const d = angDiff(a, b);
      expect(Math.abs(d)).toBeLessThanOrEqual(PI + 1e-12);
      expect(Math.cos(a + d)).toBeCloseTo(Math.cos(b), 9);
      expect(Math.sin(a + d)).toBeCloseTo(Math.sin(b), 9);
      if (Math.abs(Math.abs(d) - PI) > 1e-9) expect(angDiff(b, a)).toBeCloseTo(-d, 9);
    }
  });
});

describe('segDist (point to segment)', () => {
  it('projects onto the segment interior', () => {
    expect(segDist(5, 3, 0, 0, 10, 0)).toEqual({ d: 3, cx: 5, cz: 0, t: 0.5 });
  });
  it('clamps to the end points', () => {
    expect(segDist(-4, 3, 0, 0, 10, 0)).toMatchObject({ d: 5, cx: 0, cz: 0, t: 0 });
    expect(segDist(13, -4, 0, 0, 10, 0)).toMatchObject({ d: 5, cx: 10, cz: 0, t: 1 });
  });
  it('works for diagonal and degenerate segments', () => {
    const r = segDist(0, 1, -1, -1, 1, 1);
    expect(r.d).toBeCloseTo(Math.SQRT1_2);
    expect(r.t).toBeCloseTo(0.75);
    expect([r.cx, r.cz]).toEqual([0.5, 0.5]);
    expect(segDist(0, 2, -1, -1, 1, 1)).toMatchObject({ t: 1, cx: 1, cz: 1 }); // past the end
    expect(segDist(3, 4, 0, 0, 0, 0)).toMatchObject({ d: 5, cx: 0, cz: 0, t: 0 });
  });
});

describe('M (column-major mat4)', () => {
  it('I is the identity for mul()', () => {
    const A = M.chain(M.T(1, 2, 3), M.RY(0.7), M.S(2, 3, 4));
    close(M.mul(M.I(), A), A);
    close(M.mul(A, M.I()), A);
  });
  it('T translates points', () => {
    close(xf(M.T(1, -2, 3), [4, 5, 6]), [5, 3, 9]);
  });
  it('RY(a) turns local +z (forward) into (sin a, 0, cos a): the game heading convention', () => {
    for (const a of [0, 0.4, PI / 2, -2.5]) close(xf(M.RY(a), [0, 0, 1]), [Math.sin(a), 0, Math.cos(a)]);
    close(xf(M.RY(PI / 2), [1, 0, 0]), [0, 0, -1]);
  });
  it('mul applies the right-hand matrix first (scale, then rotate, then translate)', () => {
    const m = M.chain(M.T(10, 0, 0), M.RY(PI / 2), M.S(2));
    close(xf(m, [0, 0, 1]), [12, 0, 0]);
  });
  it('trs() is the fast path of T * RY * S', () => {
    const out = new Float32Array(20);
    trs(out, 2, 3, 4, -5, 0.8, 1.5, 2, 0.5);
    const ref = M.chain(M.T(3, 4, -5), M.RY(0.8), M.S(1.5, 2, 0.5));
    close(Array.from(out.slice(2, 18)), ref, 5);
  });
});

describe('small helpers', () => {
  it('clamp / lerp', () => {
    expect([clamp(-1, 0, 1), clamp(0.5, 0, 1), clamp(3, 0, 1)]).toEqual([0, 0.5, 1]);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
  it('hex() parses #rrggbb into 0..1 floats and passes arrays through', () => {
    close(hex('#ff8000'), [1, 128 / 255, 0]);
    close(hex('00ff00'), [0, 1, 0]);
    const a = [0.1, 0.2, 0.3];
    expect(hex(a)).toBe(a);
  });
  it('rnd() stays inside [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
