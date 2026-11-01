import { describe, it, expect } from 'vitest';
import { parseGLB, glbToTriangles } from '../../js/glb.js';
import { MeshBuilder } from '../../js/geo.js';

// build a GLB in memory: one quad (2 indexed triangles) with uint8-normalised vertex colours and UVs,
// child node translated + scaled under a parent rotated 90 deg about Y
function makeGLB({ withTexture = false } = {}) {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const col = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const uv = new Float32Array([0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const parts = [pos, col, uv, idx].map((a) => new Uint8Array(a.buffer));
  let o = 0; const views = parts.map((p) => { const v = { buffer: 0, byteOffset: o, byteLength: p.length }; o += Math.ceil(p.length / 4) * 4; return v; });
  const bin = new Uint8Array(o); parts.forEach((p, i) => bin.set(p, views[i].byteOffset));
  const s = Math.SQRT1_2;
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ rotation: [0, s, 0, s], children: [1] }, { translation: [2, 0, 0], scale: [2, 2, 2], mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.5, 1, 1, 1], ...(withTexture ? { baseColorTexture: { index: 0 } } : {}) } }],
    textures: [{ source: 0 }], images: [{ bufferView: 0, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5121, normalized: true, count: 4, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: views,
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(js.length / 4) * 4, pad = new Uint8Array(jl).fill(0x20); pad.set(js); js = pad;
  const total = 12 + 8 + jl + 8 + bin.length, buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(js, 20);
  dv.setUint32(20 + jl, bin.length, true); dv.setUint32(24 + jl, 0x004e4942, true); u8.set(bin, 28 + jl);
  return buf;
}

describe('glb loader', () => {
  it('flattens indexed primitives through the node hierarchy, with colours and flat normals', () => {
    const { json, bin } = parseGLB(makeGLB());
    const t = glbToTriangles(json, bin);
    expect(t.p.length).toBe(6 * 3);
    // vertex 1 = (1,0,0) -> scale 2 -> +2 x -> (4,0,0) -> rotate 90 deg about Y -> (0,0,-4)
    expect(t.p[3]).toBeCloseTo(0, 5); expect(t.p[4]).toBeCloseTo(0, 5); expect(t.p[5]).toBeCloseTo(-4, 5);
    // colour = baseColorFactor x COLOR_0: vertex 0 red * (0.5,1,1)
    expect([t.c[0], t.c[1], t.c[2]]).toEqual([0.5, 0, 0]);
    // the quad faced +z; after the Y rotation it faces +x (flat normal computed from the triangle)
    expect(t.n[0]).toBeCloseTo(1, 5); expect(t.n[2]).toBeCloseTo(0, 5);
    expect(t.bounds.lo[2]).toBeCloseTo(-4, 5); expect(t.bounds.hi[1]).toBeCloseTo(2, 5);
  });
  it('samples a palette texture at each vertex UV', () => {
    const { json, bin } = parseGLB(makeGLB({ withTexture: true }));
    const tex = { 0: { w: 2, h: 2, data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128, 255]) } };
    const t = glbToTriangles(json, bin, tex);
    expect(t.c[0]).toBeCloseTo(0.5, 3); // uv (0.1,0.1) -> white texel; red vertex * 0.5 factor
    expect(t.c[3 * 2]).toBeCloseTo(0.5 * 0, 3); // uv (0.9,0.9) on vertex 2 (green) -> grey texel * green -> r 0
    expect(t.c[3 * 2 + 1]).toBeCloseTo(128 / 255, 3);
  });
  it('bakes into MeshBuilder with vertex-colour material', () => {
    const { json, bin } = parseGLB(makeGLB());
    const mb = new MeshBuilder();
    mb.addTriangles(glbToTriangles(json, bin), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]);
    expect(mb.count).toBe(6);
    expect(mb.C[3]).toBe(2); // MAT_V
    expect(mb.P[3]).toBeCloseTo(10, 5);
  });
});
