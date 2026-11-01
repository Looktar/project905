// Minimal GLB (binary glTF 2.0) loader -> flat, non-indexed triangles with per-vertex colours,
// ready for MeshBuilder (our renderer uses drawArrays and vertex colours, no textures).
// Colour per vertex = baseColorFactor x COLOR_0 x baseColorTexture sampled at the vertex UV
// (low-poly kits usually paint with a small palette texture, so per-vertex sampling is exact).
// Supports: node hierarchy (matrix or TRS), multiple meshes/primitives, indexed or not,
// float / normalized integer accessors. Skips: skins, morph targets, non-triangle primitives.

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

export function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let off = 12, json = null, bin = null;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  if (!json) throw new Error('GLB without JSON chunk');
  return { json, bin };
}

function accessor(gltf, bin, i) {
  const a = gltf.accessors[i], n = NCOMP[a.type], T = COMP[a.componentType];
  const out = new Float32Array(a.count * n);
  if (a.bufferView === undefined) return { data: out, n };
  const bv = gltf.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0), size = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * size;
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  const norm = a.normalized ? NORM[a.componentType] : 0;
  for (let k = 0; k < a.count; k++)
    for (let c = 0; c < n; c++) {
      let v = dv[get](base + k * stride + c * size, true);
      if (norm) v = Math.max(-1, v / norm);
      out[k * n + c] = v;
    }
  return { data: out, n };
}

// column-major 4x4 helpers
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
function nodeMatrix(nd) {
  if (nd.matrix) return nd.matrix.slice();
  const [tx, ty, tz] = nd.translation || [0, 0, 0], [x, y, z, w] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// textures: { [imageIndex]: { w, h, data: Uint8ClampedArray RGBA } } decoded by the caller (browser: decodeImages)
export function glbToTriangles(gltf, bin, textures = {}) {
  const P = [], N = [], C = [];
  const sample = (img, u, v) => {
    const x = Math.min(img.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * img.w)));
    const y = Math.min(img.h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * img.h)));
    const o = (y * img.w + x) * 4;
    return [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255];
  };
  const srgb = (c) => c; // baked as-is: our shader works in display space like the procedural colours
  const emit = (mesh, M) => {
    for (const pr of mesh.primitives) {
      if (pr.mode !== undefined && pr.mode !== 4) continue;
      const pos = accessor(gltf, bin, pr.attributes.POSITION);
      const nrm = pr.attributes.NORMAL !== undefined ? accessor(gltf, bin, pr.attributes.NORMAL) : null;
      const col = pr.attributes.COLOR_0 !== undefined ? accessor(gltf, bin, pr.attributes.COLOR_0) : null;
      const uv = pr.attributes.TEXCOORD_0 !== undefined ? accessor(gltf, bin, pr.attributes.TEXCOORD_0) : null;
      const mat = pr.material !== undefined ? gltf.materials[pr.material] : null;
      const pbr = (mat && mat.pbrMetallicRoughness) || {};
      const f = pbr.baseColorFactor || [1, 1, 1, 1];
      const texI = pbr.baseColorTexture ? gltf.textures[pbr.baseColorTexture.index].source : undefined;
      const img = texI !== undefined ? textures[texI] : null;
      const idx = pr.indices !== undefined ? accessor(gltf, bin, pr.indices).data : null;
      const count = idx ? idx.length : pos.data.length / 3;
      const tri = [];
      for (let k = 0; k < count; k++) {
        const i = idx ? idx[k] : k;
        const x = pos.data[i * 3], y = pos.data[i * 3 + 1], z = pos.data[i * 3 + 2];
        let r = f[0], g = f[1], b = f[2];
        if (col) { r *= col.data[i * col.n]; g *= col.data[i * col.n + 1]; b *= col.data[i * col.n + 2]; }
        if (img && uv) { const s = sample(img, uv.data[i * 2], uv.data[i * 2 + 1]); r *= s[0]; g *= s[1]; b *= s[2]; }
        const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
        tri.push([wx, wy, wz, srgb(r), srgb(g), srgb(b), nrm ? [nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]] : null]);
        if (tri.length === 3) {
          // flat normal when the file has none (also the low-poly look)
          let fn = null;
          if (!tri[0][6]) {
            const ux = tri[1][0] - tri[0][0], uy = tri[1][1] - tri[0][1], uz = tri[1][2] - tri[0][2];
            const vx = tri[2][0] - tri[0][0], vy = tri[2][1] - tri[0][1], vz = tri[2][2] - tri[0][2];
            fn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
          }
          for (const t of tri) {
            P.push(t[0], t[1], t[2]);
            let [nx, ny, nz] = fn || t[6];
            if (!fn) { const a = nx, b2 = ny, c2 = nz; nx = M[0] * a + M[4] * b2 + M[8] * c2; ny = M[1] * a + M[5] * b2 + M[9] * c2; nz = M[2] * a + M[6] * b2 + M[10] * c2; }
            const L = Math.hypot(nx, ny, nz) || 1;
            N.push(nx / L, ny / L, nz / L);
            C.push(t[3], t[4], t[5]);
          }
          tri.length = 0;
        }
      }
    }
  };
  const walk = (ni, parent) => {
    const nd = gltf.nodes[ni], M = mul(parent, nodeMatrix(nd));
    if (nd.mesh !== undefined) emit(gltf.meshes[nd.mesh], M);
    for (const ch of nd.children || []) walk(ch, M);
  };
  const scene = gltf.scenes ? gltf.scenes[gltf.scene || 0] : { nodes: gltf.nodes.map((_, i) => i) };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ni of scene.nodes) walk(ni, I);
  return { p: P, n: N, c: C, bounds: bounds(P) };
}

function bounds(P) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  return { lo, hi };
}

// browser: decode the embedded images (PNG/JPEG) to RGBA so glbToTriangles can sample them
export async function decodeImages(gltf, bin) {
  const out = {};
  for (let i = 0; i < (gltf.images || []).length; i++) {
    const im = gltf.images[i];
    if (im.bufferView === undefined) continue;
    const bv = gltf.bufferViews[im.bufferView];
    const blob = new Blob([bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType || 'image/png' });
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d');
    g.drawImage(bmp, 0, 0);
    out[i] = { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
  }
  return out;
}

// fetch + parse + flatten; result can be handed to MeshBuilder.addTriangles()
export async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const { json, bin } = parseGLB(buf);
  return glbToTriangles(json, bin, await decodeImages(json, bin));
}
