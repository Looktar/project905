// External low-poly models from Polyfork (owner-authorised, D-42). Per Polyfork's licence the free
// models are loaded straight from polyfork.dev's CDN at run time (linking is allowed; re-hosting
// the files in our public repo would be redistribution), so they are never committed here.
// Anything that fails or is slow to load falls back to the procedural models.
import { parseGLB, glbToTriangles } from './glb.js';
import { MAT_A, MAT_V } from './geo.js';

const CDN = 'https://polyfork.dev/cdn/';

// key -> Polyfork asset id + how to fit it into the game (metres; cars face +z, origin on the ground)
export const POLYFORK = {
  sedan: { id: 'compact-hatchback-386417', fit: { len: 4.4 }, paint: true },
  tree: { id: 'broad-canopy-shade-tree-e7c4a2', fit: { height: 5.6 }, grade: { light: 1.3, sat: 1.35 } },
};

export const MODELS = {}; // filled by loadModels(): key -> { p, n, c, mat, bounds }

// ?pf=1 turns Polyfork models on, ?pf=0 off; otherwise CFG decides (style sample first, ART-BIBLE 7)
export function modelsWanted(search, def) {
  const m = /[?&]pf=([01])/.exec(search);
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
  const s = def.fit.len ? def.fit.len / (hi[2] - lo[2]) : def.fit.height / (hi[1] - lo[1]);
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  const p = new Float32Array(t.p.length);
  for (let i = 0; i < p.length; i += 3) { p[i] = (t.p[i] - cx) * s; p[i + 1] = (t.p[i + 1] - lo[1]) * s; p[i + 2] = (t.p[i + 2] - cz) * s; }
  const nv = t.p.length / 3, mat = new Float32Array(nv).fill(MAT_V), c = Float32Array.from(t.c);
  // colour grade toward our bright toy palette (ART-BIBLE 4): more saturation, lighter
  if (def.grade) for (let i = 0; i < c.length; i += 3) {
    const g = (c[i] + c[i + 1] + c[i + 2]) / 3;
    for (let k = 0; k < 3; k++) c[i + k] = Math.min(1, (g + (c[i + k] - g) * def.grade.sat) * def.grade.light);
  }
  if (def.paint) {
    // the paint is the most common clearly coloured (saturated, not dark) vertex colour: it becomes
    // instance colour A (white x tint) so every car keeps its own random colour
    const key = (i) => [c[i], c[i + 1], c[i + 2]].map((v) => Math.round(v * 20)).join(',');
    const hist = new Map();
    for (let i = 0; i < c.length; i += 3) {
      const mx = Math.max(c[i], c[i + 1], c[i + 2]), mn = Math.min(c[i], c[i + 1], c[i + 2]);
      if (mx > 0.45 && mx - mn > 0.25) hist.set(key(i), (hist.get(key(i)) || 0) + 1);
    }
    const paint = [...hist].sort((a, b) => b[1] - a[1])[0];
    if (paint) for (let i = 0; i < c.length; i += 3) if (key(i) === paint[0]) { c[i] = c[i + 1] = c[i + 2] = 1; mat[i / 3] = MAT_A; }
  }
  return { p, n: t.n, c, mat, bounds: { lo: [(lo[0] - cx) * s, 0, (lo[2] - cz) * s], hi: [(hi[0] - cx) * s, (hi[1] - lo[1]) * s, (hi[2] - cz) * s] }, tris: nv / 3 };
}
