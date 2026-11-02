// External low-poly models from Polyfork (owner-authorised, D-42). Per Polyfork's licence the free
// models are loaded straight from polyfork.dev's CDN at run time (linking is allowed; re-hosting
// the files in our public repo would be redistribution), so they are never committed here.
// Anything that fails or is slow to load falls back to the procedural models.
import { parseGLB, glbToTriangles } from './glb.js';
import { MAT_A, MAT_B, MAT_V } from './geo.js';

const CDN = 'https://polyfork.dev/cdn/';

// key -> Polyfork asset id + how to fit it into the game (metres; cars face +z, origin on the ground).
// fit: len (z) | height (y) | width (x). paint: true = auto-detect the body colour, or the [r, g, b]
// body colour when it is not saturated enough to detect; it becomes the per-instance tint.
// origin 'base': x/z origin at the footprint of the lowest vertices (a lamp's pole, not its bbox)
export const POLYFORK = {
  sedan: { id: 'compact-hatchback-386417', fit: { len: 4.4 }, paint: true },
  suv: { id: 'family-crossover-suv-42027f', fit: { len: 4.6 }, paint: [0.34, 0.39, 0.43] },
  van: { id: 'family-minivan-924de0', fit: { len: 4.9 }, paint: true },
  taxi: { id: 'yellow-cab-8df4a0', fit: { len: 4.5 } },
  police: { id: 'police-cruiser-a2d25e', fit: { len: 4.6 } },
  bus: { id: 'city-bus-49fd97', fit: { len: 12 }, paint: [0.43, 0.56, 0.63] }, // blue band -> Viva blue
  tree: { id: 'broad-canopy-shade-tree-e7c4a2', fit: { height: 5.6 }, grade: { light: 1.3, sat: 1.35 } },
  lamp: { id: 'cobra-head-street-light-3e25b8', fit: { height: 6.2 }, origin: 'base', grade: { light: 1.1, sat: 1 } },
  hydrant: { id: 'fire-hydrant-b68b17', fit: { height: 0.85 }, grade: { light: 1.2, sat: 1.3 } },
  shelter: { id: 'bus-shelter-f786b4', fit: { width: 4.2 } },
  // houses (one kit, sample behind ?ph=1): native size in metres; world.js scales each instance to
  // its lot. Wall colour -> instance colour A, roof -> B (the map's house palettes, D-63)
  house2: { id: 'two-storey-family-house-c63c4a', fit: { width: 8 }, tints: [{ col: [0.775, 0.653, 0.483], mat: MAT_A }, { col: [0.296, 0.234, 0.170], mat: MAT_B, tol: 0.04 }] },
  split: { id: 'split-level-house-40fe1a', fit: { width: 12 }, tints: [{ col: [0.847, 0.783, 0.653], mat: MAT_A }, { col: [0.296, 0.234, 0.170], mat: MAT_B, tol: 0.04 }] },
  ranch: { id: 'single-storey-ranch-house-3880ea', fit: { width: 12 }, tints: [{ col: [0.847, 0.783, 0.653], mat: MAT_A }, { col: [0.296, 0.234, 0.170], mat: MAT_B, tol: 0.04 }] },
};
export const HOUSE_MODELS = ['house2', 'split', 'ranch'];

export const MODELS = {}; // filled by loadModels(): key -> { p, n, c, mat, bounds }

// ?pf=1 turns Polyfork models on, ?pf=0 off; otherwise CFG decides (style sample first, ART-BIBLE 7)
export function modelsWanted(search, def, key = 'pf') {
  const m = new RegExp('[?&]' + key + '=([01])').exec(search);
  return m ? m[1] === '1' : def;
}

export async function loadModels(keys = Object.keys(POLYFORK), timeoutMs = 6000) {
  const work = keys.map(async (k) => {
    const def = POLYFORK[k];
    const res = await fetch(CDN + def.id + '.glb');
    if (!res.ok) throw new Error(def.id + ' ' + res.status);
    const { json, bin } = parseGLB(await res.arrayBuffer());
    MODELS[k] = fitModel(glbToTriangles(json, bin), def);
  });
  const all = Promise.allSettled(work);
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  return MODELS;
}

// scale to the game size, centre on x/z with the base at y = 0, and mark the paint for tinting
export function fitModel(t, def) {
  const { lo, hi } = t.bounds;
  const F = def.fit;
  const s = F.len ? F.len / (hi[2] - lo[2]) : F.width ? F.width / (hi[0] - lo[0]) : F.height / (hi[1] - lo[1]);
  let cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  if (def.origin === 'base') {
    let x = 0, z = 0, n = 0;
    for (let i = 0; i < t.p.length; i += 3) if (t.p[i + 1] < lo[1] + 0.03 * (hi[1] - lo[1])) { x += t.p[i]; z += t.p[i + 2]; n++; }
    if (n) { cx = x / n; cz = z / n; }
  }
  const p = new Float32Array(t.p.length);
  for (let i = 0; i < p.length; i += 3) { p[i] = (t.p[i] - cx) * s; p[i + 1] = (t.p[i + 1] - lo[1]) * s; p[i + 2] = (t.p[i + 2] - cz) * s; }
  const nv = t.p.length / 3, mat = new Float32Array(nv).fill(MAT_V), c = Float32Array.from(t.c), c0 = t.c;
  // colour grade toward our bright toy palette (ART-BIBLE 4): more saturation, lighter
  if (def.grade) for (let i = 0; i < c.length; i += 3) {
    const g = (c[i] + c[i + 1] + c[i + 2]) / 3;
    for (let k = 0; k < 3; k++) c[i + k] = Math.min(1, (g + (c[i + k] - g) * def.grade.sat) * def.grade.light);
  }
  if (def.paint) {
    // the paint is the most common clearly coloured (saturated, not dark) vertex colour, or the
    // given one: it becomes instance colour A (white x tint) so every car keeps its own colour
    const key = (i) => [c[i], c[i + 1], c[i + 2]].map((v) => Math.round(v * 20)).join(',');
    let isPaint;
    if (Array.isArray(def.paint)) {
      const P = def.paint;
      isPaint = (i) => Math.abs(c0[i] - P[0]) < 0.03 && Math.abs(c0[i + 1] - P[1]) < 0.03 && Math.abs(c0[i + 2] - P[2]) < 0.03;
    } else {
      const hist = new Map();
      for (let i = 0; i < c.length; i += 3) {
        const mx = Math.max(c[i], c[i + 1], c[i + 2]), mn = Math.min(c[i], c[i + 1], c[i + 2]);
        if (mx > 0.45 && mx - mn > 0.25) hist.set(key(i), (hist.get(key(i)) || 0) + 1);
      }
      const paint = [...hist].sort((a, b) => b[1] - a[1])[0];
      isPaint = (i) => paint && key(i) === paint[0];
    }
    for (let i = 0; i < c.length; i += 3) if (isPaint(i)) { c[i] = c[i + 1] = c[i + 2] = 1; mat[i / 3] = MAT_A; }
  }
  // tints: [{ col: [r,g,b], mat, tol }] - vertices near col take instance colour A / B (a house's
  // wall / roof colour); the vertex keeps its brightness relative to col so siding and shingle
  // stripes survive the recolour
  for (const T of def.tints || []) {
    const L = (T.col[0] + T.col[1] + T.col[2]) / 3, tol = T.tol || 0.03;
    for (let i = 0; i < c.length; i += 3) {
      if (mat[i / 3] !== MAT_V) continue;
      if (Math.abs(c0[i] - T.col[0]) > tol || Math.abs(c0[i + 1] - T.col[1]) > tol || Math.abs(c0[i + 2] - T.col[2]) > tol) continue;
      const g = Math.min(1.25, (c0[i] + c0[i + 1] + c0[i + 2]) / 3 / L);
      c[i] = c[i + 1] = c[i + 2] = g; mat[i / 3] = T.mat;
    }
  }
  return { p, n: t.n, c, mat, bounds: { lo: [(lo[0] - cx) * s, 0, (lo[2] - cz) * s], hi: [(hi[0] - cx) * s, (hi[1] - lo[1]) * s, (hi[2] - cz) * s] }, tris: nv / 3 };
}
