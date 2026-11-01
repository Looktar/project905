// Independent evaluator for the CSS `transform` strings used on #app, so tests can
// check orient.js against what the browser actually does with the CSS.
// Supports rotate(<deg>), translate(<a>[, <b>]), translateX(<a>), translateY(<a>)
// with px or % lengths; transform-origin is 0 0 (as in index.html).
// Matrices use CSS matrix(a, b, c, d, e, f) order: x' = a*x + c*y + e, y' = b*x + d*y + f.

const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

// w/h: the element's (unrotated) size, used to resolve percentages
export function cssMatrix(transform, w, h) {
  let M = [1, 0, 0, 1, 0, 0];
  if (!transform || transform === 'none') return M;
  const len = (v, ref) => (String(v).trim().endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v));
  const fns = [...transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)];
  if (!fns.length) throw new Error('cannot parse transform: ' + transform);
  for (const [, fn, argStr] of fns) {
    const args = argStr.split(',').map((s) => s.trim());
    let T;
    if (fn === 'rotate') {
      const a = (parseFloat(args[0]) * Math.PI) / 180;
      T = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
    } else if (fn === 'translateX') T = [1, 0, 0, 1, len(args[0], w), 0];
    else if (fn === 'translateY') T = [1, 0, 0, 1, 0, len(args[0], h)];
    else if (fn === 'translate') T = [1, 0, 0, 1, len(args[0], w), len(args[1] ?? '0', h)];
    else throw new Error('unsupported transform function ' + fn);
    M = mul(M, T); // the list applies right to left: M = M1 * M2 * ...
  }
  return M;
}

export const applyMatrix = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

// element-local point -> screen point for an element at (0, 0) with this transform
export function cssApply(transform, w, h, p) { return applyMatrix(cssMatrix(transform, w, h), p); }

// screen direction (unit vector) of the element's local "up" (-y) at point p
export function cssUp(transform, w, h, p = [w / 2, h / 2]) {
  const a = cssApply(transform, w, h, p), b = cssApply(transform, w, h, [p[0], p[1] - 1]);
  return [b[0] - a[0], b[1] - a[1]];
}
