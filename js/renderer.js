// WebGL2 renderer: one lit+shadowed instanced shader for everything, a depth
// shader for the shadow map and an unlit textured shader for billboard signs.
import { M } from './math.js';

const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec4 aC;
layout(location=3) in vec4 iM0; layout(location=4) in vec4 iM1; layout(location=5) in vec4 iM2; layout(location=6) in vec4 iM3;
layout(location=7) in vec3 iA; layout(location=8) in vec3 iB;
uniform mat4 uVP, uLVP;
out vec3 vN; out vec3 vCol; out float vEm; out vec4 vL; out vec3 vW;
void main(){
  mat4 m = mat4(iM0,iM1,iM2,iM3);
  vec4 w = m*vec4(aP,1.0); vW = w.xyz;
  vN = mat3(m)*aN;
  float mat = floor(aC.a+0.001); vEm = fract(aC.a+0.0001)*10.0;
  vCol = mat<0.5 ? iA*aC.rgb : (mat<1.5 ? iB*aC.rgb : aC.rgb);
  vL = uLVP*w; gl_Position = uVP*w;
}`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vCol; in float vEm; in vec4 vL; in vec3 vW;
uniform sampler2DShadow uSh; uniform vec3 uL, uE, uFog; uniform float uShOn, uTexel, uFogNear, uFogFar, uAlpha; uniform vec4 uSil;
out vec4 o;
float sh(){
  if(uShOn<0.5) return 1.0;
  vec3 p = vL.xyz/vL.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float s=0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) s+=texture(uSh, vec3(p.xy+vec2(x,y)*uTexel*1.3, p.z-0.0012));
  return s/9.0;
}
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(uE-vW); if(dot(n,v)<0.0) n=-n;
  if(uSil.a>0.0){ float r=1.0-max(dot(n,v),0.0); o=vec4(uSil.rgb, uSil.a*(0.45+0.55*r)); return; }
  vec3 b = vCol; float s = sh(); float d = max(dot(n,uL),0.0);
  vec3 amb = mix(vec3(0.62,0.58,0.70), vec3(0.86,0.90,1.0), n.y*0.5+0.5);
  vec3 h = normalize(uL+v); float sp = pow(max(dot(n,h),0.0),40.0)*0.18*s;
  float rim = pow(1.0-max(dot(n,v),0.0),3.0)*0.08;
  vec3 col = b*(amb*0.60 + vec3(1.0,0.95,0.86)*d*s*0.66) + sp + rim*vec3(0.85,0.9,1.0);
  col = mix(col, b*1.15, clamp(vEm,0.0,1.0));
  float dist = length(vW-uE);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist)*0.85);
  o = vec4(col,uAlpha);
}`;
const DVS = `#version 300 es
layout(location=0) in vec3 aP;
layout(location=3) in vec4 iM0; layout(location=4) in vec4 iM1; layout(location=5) in vec4 iM2; layout(location=6) in vec4 iM3;
uniform mat4 uLVP;
void main(){ gl_Position = uLVP*mat4(iM0,iM1,iM2,iM3)*vec4(aP,1.0); }`;
const DFS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.0); }`;
const TVS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec2 aU;
uniform mat4 uVP; out vec2 vU;
void main(){ vU=aU; gl_Position=uVP*vec4(aP,1.0); }`;
const TFS = `#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec3 uE; out vec4 o;
void main(){ vec4 c=texture(uT,vU); if(c.a<0.4) discard; o=vec4(c.rgb,1.0); }`;

// tilt-shift "miniature" depth of field (spec 4): sharp band around the player, blur toward top/bottom
const PVS = `#version 300 es
out vec2 vU;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vU = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
const PFS = `#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec2 uPx; uniform float uFocus, uBand, uMaxR; out vec4 o;
void main(){
  vec3 c = texture(uT, vU).rgb;
  float k = smoothstep(uBand, uBand + 0.32, abs(vU.y - uFocus));
  if (k < 0.02) { o = vec4(c, 1.0); return; }
  vec3 acc = c; float r = k * uMaxR;
  for (int i = 0; i < 16; i++) {
    float f = float(i) + 0.5, a = f * 2.39996;
    acc += texture(uT, vU + vec2(cos(a), sin(a)) * sqrt(f / 16.0) * r * uPx).rgb;
  }
  o = vec4(acc / 17.0, 1.0);
}`;

export const INST_FLOATS = 22;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl; this.canvas = canvas;
    this.pMain = this.prog(VS, FS);
    this.pDepth = this.prog(DVS, DFS);
    this.pSign = this.prog(TVS, TFS);
    this.pPost = this.prog(PVS, PFS);
    this.post = null;      // offscreen MSAA target while tilt-shift is on
    this.tiltShift = false;
    this.u = {};
    for (const [p, names] of [[this.pMain, ['uVP', 'uLVP', 'uSh', 'uL', 'uE', 'uFog', 'uShOn', 'uTexel', 'uFogNear', 'uFogFar', 'uAlpha', 'uSil']], [this.pDepth, ['uLVP']], [this.pSign, ['uVP', 'uT']], [this.pPost, ['uT', 'uPx', 'uFocus', 'uBand', 'uMaxR']]])
      for (const n of names) this.u[p === this.pMain ? n : (p === this.pDepth ? 'd' : p === this.pSign ? 's' : 'p') + n] = gl.getUniformLocation(p, n);
    this.shadowSize = 2048;
    this.initShadow(this.shadowSize);
    this.lightDir = (() => { const v = [0.62, 1.0, -0.5]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
    this.fog = [0.66, 0.73, 0.86];
    this.shadowsOn = true;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }
  prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  initShadow(size) {
    const gl = this.gl;
    if (this.shT) { gl.deleteTexture(this.shT); gl.deleteFramebuffer(this.shF); }
    this.shadowSize = size;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shT = t; this.shF = f;
  }
  // ---- buffers ----
  _geomVAO(mb) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const put = (loc, data, size) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const bufs = [put(0, mb.P, 3), put(1, mb.N, 3), put(2, mb.C, 4)];
    return { vao, bufs, count: mb.P.length / 3 };
  }
  // static mesh (no instancing: instance attributes use constant identity/white)
  mesh(mb) {
    if (!mb.P.length) return null;
    const m = this._geomVAO(mb);
    this.gl.bindVertexArray(null);
    m.static = true;
    return m;
  }
  // instanced mesh. data: Float32Array of n*INST_FLOATS (optional, static)
  instanced(mb, capacity, data = null) {
    const gl = this.gl;
    const m = this._geomVAO(mb);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    const cap = data ? data.length / INST_FLOATS : capacity;
    gl.bufferData(gl.ARRAY_BUFFER, data || new Float32Array(cap * INST_FLOATS), data ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
    const stride = INST_FLOATS * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, stride, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 3, gl.FLOAT, false, stride, 64); gl.vertexAttribDivisor(7, 1);
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 3, gl.FLOAT, false, stride, 76); gl.vertexAttribDivisor(8, 1);
    gl.bindVertexArray(null);
    m.ib = ib; m.cap = cap; m.n = data ? cap : 0; m.data = data ? null : new Float32Array(cap * INST_FLOATS);
    return m;
  }
  upload(m) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, m.ib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, m.n * INST_FLOATS);
  }
  _staticAttribs() {
    const gl = this.gl;
    gl.vertexAttrib4f(3, 1, 0, 0, 0); gl.vertexAttrib4f(4, 0, 1, 0, 0); gl.vertexAttrib4f(5, 0, 0, 1, 0); gl.vertexAttrib4f(6, 0, 0, 0, 1);
    gl.vertexAttrib3f(7, 1, 1, 1); gl.vertexAttrib3f(8, 1, 1, 1);
  }
  draw(m) {
    if (!m || (!m.static && !m.n)) return;
    const gl = this.gl;
    gl.bindVertexArray(m.vao);
    if (m.static) { this._staticAttribs(); gl.drawArrays(gl.TRIANGLES, 0, m.count); }
    else if (m.n > 0) gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, m.n);
    this.stats.calls++;
  }
  // only the first k instances of an instanced mesh
  drawFirst(m, k) {
    if (!m || !k) return;
    const gl = this.gl;
    gl.bindVertexArray(m.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, Math.min(k, m.n));
    this.stats.calls++;
  }
  // static mesh, but leave out the vertex ranges in skip ([[start, end], ...] sorted)
  drawSkipping(m, skip) {
    if (!m) return;
    const gl = this.gl;
    gl.bindVertexArray(m.vao); this._staticAttribs();
    let at = 0;
    for (const [s, e] of skip) { if (s > at) { gl.drawArrays(gl.TRIANGLES, at, s - at); this.stats.calls++; } at = Math.max(at, e); }
    if (at < m.count) { gl.drawArrays(gl.TRIANGLES, at, m.count - at); this.stats.calls++; }
  }
  // x-ray silhouette: draws only where the geometry is hidden behind what is already in the depth buffer.
  // Call before drawing the same geometry normally (so it cannot hide itself); stencil keeps one layer.
  silhouette(drawFn, col) {
    const gl = this.gl;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.depthFunc(gl.GREATER);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.uniform4fv(this.u.uSil, col);
    drawFn();
    gl.uniform4f(this.u.uSil, 0, 0, 0, 0);
    gl.disable(gl.STENCIL_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // semi-transparent static ranges: depth pre-pass, then blend only the front-most surface
  fadePass(list) {
    if (!list.length) return;
    const gl = this.gl;
    for (const f of list) {
      const m = f.m; gl.bindVertexArray(m.vao); this._staticAttribs();
      gl.colorMask(false, false, false, false);
      gl.drawArrays(gl.TRIANGLES, f.s, f.e - f.s);
      gl.colorMask(true, true, true, true);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
      gl.uniform1f(this.u.uAlpha, f.a);
      gl.drawArrays(gl.TRIANGLES, f.s, f.e - f.s);
      gl.uniform1f(this.u.uAlpha, 1);
      gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
      this.stats.calls += 2;
    }
  }
  // ---- signs (billboard textured quads) ----
  signMesh(quads, canvasTex) {
    const gl = this.gl;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads.p), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ub = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads.u), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, tex, count: quads.p.length / 3 };
  }
  // ---- post (tilt-shift) ----
  _postTargets() {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    if (this.post && this.post.w === W && this.post.h === H) return this.post;
    this._freePost();
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const ms = gl.createFramebuffer(), col = gl.createRenderbuffer(), dep = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, dep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH24_STENCIL8, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, dep);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const res = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, res);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.post = { w: W, h: H, ms, col, dep, tex, res };
    if (!ok) { this._freePost(); this.tiltShift = false; }
    return this.post;
  }
  _freePost() {
    const gl = this.gl, p = this.post;
    if (!p) return;
    gl.deleteFramebuffer(p.ms); gl.deleteFramebuffer(p.res); gl.deleteRenderbuffer(p.col); gl.deleteRenderbuffer(p.dep); gl.deleteTexture(p.tex);
    this.post = null;
  }
  // resolve the MSAA scene and draw it to the screen with the tilt-shift blur; focus = screen y (0 top .. 1 bottom)
  endFrame(focus, opts) {
    if (!this.tiltShift || !this.post) return;
    const gl = this.gl, p = this.post;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, p.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, p.res);
    gl.blitFramebuffer(0, 0, p.w, p.h, 0, 0, p.w, p.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, p.w, p.h);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.pPost);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.uniform1i(this.u.puT, 2);
    gl.uniform2f(this.u.puPx, 1 / p.w, 1 / p.h);
    gl.uniform1f(this.u.puFocus, 1 - focus);
    gl.uniform1f(this.u.puBand, opts.band);
    gl.uniform1f(this.u.puMaxR, opts.maxR * (p.h / 900));
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    this.stats.calls++;
  }
  // ---- frame ----
  resize(w, h) { this.canvas.width = w; this.canvas.height = h; }
  begin(camEye, camTarget, fov, focus, shadowRadius) {
    const gl = this.gl;
    this.stats = { calls: 0 };
    const W = this.canvas.width, H = this.canvas.height;
    this.VP = M.mul(M.persp(fov, W / H, 2, 1200), M.look(camEye, camTarget, [0, 1, 0]));
    this.eye = camEye;
    // light camera centred on focus, snapped to texels
    const R = shadowRadius, L = this.lightDir;
    const texel = (2 * R) / this.shadowSize;
    const lv = M.look([L[0] * 150, L[1] * 150, L[2] * 150], [0, 0, 0], [0, 1, 0]);
    // project focus into light space and snap
    const fx = lv[0] * focus[0] + lv[4] * focus[1] + lv[8] * focus[2] + lv[12];
    const fy = lv[1] * focus[0] + lv[5] * focus[1] + lv[9] * focus[2] + lv[13];
    const fz = lv[2] * focus[0] + lv[6] * focus[1] + lv[10] * focus[2] + lv[14];
    const sx = Math.round(fx / texel) * texel, sy = Math.round(fy / texel) * texel;
    this.LVP = M.mul(M.ortho(sx - R, sx + R, sy - R, sy + R, -fz - 160, -fz + 160), lv);
  }
  shadowPass(drawFn) {
    const gl = this.gl;
    if (!this.shadowsOn) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shF);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pDepth);
    gl.uniformMatrix4fv(this.u.duLVP, false, this.LVP);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
    drawFn();
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  mainPass(drawFn, fogNear, fogFar) {
    const gl = this.gl;
    if (this.tiltShift) this._postTargets(); else if (this.post) this._freePost();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tiltShift && this.post ? this.post.ms : null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(this.pMain);
    gl.uniform1f(this.u.uAlpha, 1); gl.uniform4f(this.u.uSil, 0, 0, 0, 0);
    gl.uniformMatrix4fv(this.u.uVP, false, this.VP);
    gl.uniformMatrix4fv(this.u.uLVP, false, this.LVP);
    gl.uniform3fv(this.u.uL, this.lightDir);
    gl.uniform3fv(this.u.uE, this.eye);
    gl.uniform3fv(this.u.uFog, this.fog);
    gl.uniform1f(this.u.uShOn, this.shadowsOn ? 1 : 0);
    gl.uniform1f(this.u.uTexel, 1 / this.shadowSize);
    gl.uniform1f(this.u.uFogNear, fogNear); gl.uniform1f(this.u.uFogFar, fogFar);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shT);
    gl.uniform1i(this.u.uSh, 0);
    drawFn();
  }
  drawSigns(sm) {
    if (!sm) return;
    const gl = this.gl;
    gl.useProgram(this.pSign);
    gl.uniformMatrix4fv(this.u.suVP, false, this.VP);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sm.tex);
    gl.uniform1i(this.u.suT, 1);
    gl.bindVertexArray(sm.vao);
    gl.drawArrays(gl.TRIANGLES, 0, sm.count);
    this.stats.calls++;
  }
  project(p) {
    const VP = this.VP, o = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) o[r] = VP[r] * p[0] + VP[4 + r] * p[1] + VP[8 + r] * p[2] + VP[12 + r];
    if (o[3] <= 0) return null;
    return [(o[0] / o[3]) * 0.5 + 0.5, 1 - ((o[1] / o[3]) * 0.5 + 0.5)];
  }
}
