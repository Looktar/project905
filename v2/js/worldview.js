// WorldView: turns the map into three.js meshes. Static scenery is baked per chunk and built lazily
// around the camera; tall buildings stay separate meshes so they can fade when they hide the player.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, COL } from './config.js';
import { MeshBuilder, shade } from './mesh.js';

const CH = CFG.world.chunk;
const AZ = CFG.camera.azimuth;
const LM_NAMES = {
  pacific: '大古广场 Pacifick Mall', markville: 'Markvile Mall', civic: '万锦市政厅 Civic Centre', tims: 'Tim Hortz',
  cinema: 'Cineplax 影城', unionville: 'Unionville 老街 Main St', downtown: 'Downtown Markham',
};
const SIGN_COL = { food: '#e8532f', tea: '#d9488b', cafe: '#7a4a2b', grocer: '#2f9e55', gen: '#2f6fd0', lm: '#ff6b4a', poi: '#3b4a6b' };

export class WorldView {
  constructor(world, scene, quality) {
    this.w = world; this.scene = scene; this.q = quality;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // anything standing between the camera and the player is dithered away in a circle around the player
    this.cut = { value: new THREE.Vector4(0, 0, 0, 0) };
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCut = this.cut;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutP; varying float vCutD;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCutP = (modelMatrix * vec4(transformed, 1.0)).xyz; vCutD = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uCut; varying vec3 vCutP; varying float vCutD;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uCut.w > 0.0 && vCutP.y > 0.45 && vCutD < uCut.z - 0.7) {
            float d = distance(gl_FragCoord.xy, uCut.xy);
            if (d < uCut.w) {
              float keep = 0.1 + 0.9 * smoothstep(uCut.w * 0.6, uCut.w, d);
              float n = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
              if (n > keep) discard;
            }
          }`)
        // ground detail without extra geometry: paving tiles on sidewalks (y = 0.05), stall lines in parking lots (y = 0.025)
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vCutP.y > 0.045 && vCutP.y < 0.055) {
            vec2 t = floor(vCutP.xz / 1.7);
            diffuseColor.rgb *= mod(t.x + t.y, 2.0) < 0.5 ? 0.93 : 1.0;
          } else if (vCutP.y > 0.02 && vCutP.y < 0.03) {
            float row = mod(vCutP.z, 13.0);
            if (row < 10.4 && (mod(vCutP.x, 2.9) < 0.16 || abs(row - 5.2) < 0.09)) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.75);
            else if (row >= 10.4) diffuseColor.rgb *= 0.9;
          }`);
    };
    this.chunks = new Map(); this.live = new Map(); this.queue = [];
    this.signTex = new Map();
    this.bucket();
    this.buildGround();
    this.buildBulbs();
  }
  ck(x, z) { return Math.floor(x / CH) * 1000 + Math.floor(z / CH); }
  slot(x, z) {
    const k = this.ck(x, z);
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, c = { k, cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH, segs: [], nodes: [], houses: [], trees: [], builds: [], heritage: [], stops: [], lamps: [], sigs: [], signs: [], lms: [], over: [], marks: [] });
    return c;
  }

  // sort every map item into its chunk (cheap; geometry is built later, on demand)
  bucket() {
    const w = this.w, m = w.map;
    for (const e of w.edges) for (let k = 0; k < e.pts.length - 1; k++) this.slot((e.pts[k][0] + e.pts[k + 1][0]) / 2, (e.pts[k][1] + e.pts[k + 1][1]) / 2).segs.push(e.i, k);
    w.nodes.forEach((n, i) => { if (w.adj[i].length) this.slot(n[0], n[1]).nodes.push(i); });
    for (const h of m.houses) this.slot(h[0], h[1]).houses.push(h);
    for (const t of m.trees) this.slot(t[0], t[1]).trees.push(t);
    for (const h of m.heritage) this.slot(h[0], h[1]).heritage.push(h);
    for (const s of m.stops) this.slot(s[0], s[1]).stops.push(s);
    m.buildings.forEach((b, i) => {
      let x = 0, z = 0; for (const p of b.p) { x += p[0] / b.p.length; z += p[1] / b.p.length; }
      b.cx = x; b.cz = z;
      this.slot(x, z).builds.push(i);
      if (b.n && !b.lm) this.slot(x, z).signs.push({ x, z, y: b.h + 2.2, text: b.n, col: SIGN_COL.poi, size: 2.3 });
    });
    for (const s of m.stores) this.slot(s[0], s[1]).signs.push({ x: s[0], z: s[1], y: s[2] + 1.6, text: s[4], col: SIGN_COL[s[6]] || SIGN_COL.gen, size: 1.9 });
    for (const lm of m.landmarks) {
      if (lm.x === undefined) continue;
      this.slot(lm.x, lm.z).lms.push(lm);
      const name = LM_NAMES[lm.t];
      if (name && lm.t !== 'tims') this.slot(lm.x, lm.z).signs.push({ x: lm.x, z: lm.z + (lm.r || 8) * 0.55, y: (lm.h || 6) + 3, text: name, col: SIGN_COL.lm, size: 3.4 });
    }
    for (const pts of m.overpass) for (let k = 0; k < pts.length - 1; k++) this.slot((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2).over.push([pts[k], pts[k + 1]]);
    // street lamps along the bigger roads
    for (const e of w.edges) {
      if (e.cls > 2 || e.w < 8) continue;
      for (let s = 16; s < e.len - 12; s += 34) { const p = w.edgePoint(e, s, 1, e.w / 2 + 0.9); this.slot(p.x, p.z).lamps.push([p.x, p.z, Math.atan2(-p.dz, p.dx) + Math.PI / 2, p.dx, p.dz]); }
    }
    for (const sg of w.signals) if (!sg.dead) this.slot(sg.x, sg.z).sigs.push(sg);
  }

  // one always-on mesh for the big flat areas
  buildGround() {
    const m = this.w.map, mb = new MeshBuilder(), hx = this.w.half[0] + 400, hz = this.w.half[1] + 400;
    mb.quad([-hx, 0, -hz], [-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], COL.grass);
    for (const a of m.parks) mb.flat(a.p, a.t, 0.015, COL.park);
    for (const a of m.lots) mb.flat(a.p, a.t, 0.025, COL.lot);
    for (const a of m.water) mb.flat(a.p, a.t, 0.035, COL.water);
    for (const [big, pts] of m.rivers) mb.ribbon(pts, big ? 9 : 3.5, 0.04, COL.water);
    for (const pts of m.rails) { mb.ribbon(pts, 2.6, 0.13, COL.rail); mb.ribbon(pts, 1.5, 0.15, '#6b6257'); }
    const g = new THREE.Mesh(mb.build(), this.mat);
    g.receiveShadow = true; g.frustumCulled = false;
    this.scene.add(g);
    // the red rapid-transit lanes sit on top of the asphalt
    const bb = new MeshBuilder();
    for (const pts of m.busways) bb.ribbon(pts, 6.5, 0.105, COL.bus);
    if (!bb.empty) { const b = new THREE.Mesh(bb.build(), this.mat); b.receiveShadow = true; b.frustumCulled = false; this.scene.add(b); }
  }

  // ------------------------------------------------------------ chunk streaming
  update(x, z, dt) {
    const R = CFG.world.loadRadius, i0 = Math.floor((x - R) / CH), i1 = Math.floor((x + R) / CH), j0 = Math.floor((z - R) / CH), j1 = Math.floor((z + R) / CH);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 1000 + j, c = this.chunks.get(k);
      if (c && !c.group && !c.queued) { c.queued = true; this.queue.push(c); }
    }
    if (this.queue.length) {
      this.queue.sort((a, b) => Math.hypot(b.cx - x, b.cz - z) - Math.hypot(a.cx - x, a.cz - z));
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < (this.first ? 6 : 1e9)) { const c = this.queue.pop(); c.queued = false; this.buildChunk(c); }
      if (!this.queue.length) this.first = true;
    }
    for (const c of this.live.values()) if (Math.hypot(c.cx - x, c.cz - z) > CFG.world.dropRadius) this.dropChunk(c);
  }
  dropChunk(c) {
    this.scene.remove(c.group);
    c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.userData.sign) o.material.dispose(); });
    c.group = null; this.live.delete(c.k);
  }
  buildChunk(c) {
    const w = this.w, m = w.map, mb = new MeshBuilder(), g = new THREE.Group();
    this.roads(c, mb);
    for (const h of c.houses) {
      const [x, z, a, hw, hd, hh, wi, ri] = h;
      mb.box(x, 0, z, hw, hh, hd, a, typeof wi === 'string' ? wi : m.houseWalls[wi % m.houseWalls.length]);
      mb.gable(x, hh, z, hw + 0.5, hd + 0.5, Math.min(hw, hd) * 0.42, a, typeof ri === 'string' ? ri : m.houseRoofs[ri % m.houseRoofs.length]);
      mb.box(x + Math.sin(a) * hd / 2, 0, z + Math.cos(a) * hd / 2, 1.1, 2.1, 0.16, a, '#7a5230');
    }
    for (const t of c.trees) {
      const [x, z, s] = t, k = (Math.abs(Math.floor(x * 7 + z * 13)) % 4), col = COL.leaf[k], col2 = COL.leaf[(k + 1) % 4];
      mb.cyl(x, 0, z, 0.3 * s, 0.22 * s, 2.2 * s, COL.trunk, 5, false);
      mb.blob(x, 3.6 * s, z, 2.3 * s, col, 0.9, col2);
      mb.blob(x + 0.9 * s, 4.9 * s, z - 0.4 * s, 1.5 * s, col2, 0.9);
    }
    for (const h of c.heritage) {
      const [x, z, a, hw, hd, hh, wi, ai, gab] = h;
      mb.box(x, 0, z, hw, hh, hd, a, m.heritageWalls[wi % m.heritageWalls.length], '#d8d2c6');
      if (gab) mb.gable(x, hh, z, hw + 0.3, hd + 0.3, 2, a, '#4a5568');
      const fx = Math.sin(a), fz = Math.cos(a);
      mb.box(x + fx * (hd / 2 + 0.6), 2.6, z + fz * (hd / 2 + 0.6), hw * 0.9, 0.25, 1.3, a, m.heritageAwnings[ai % m.heritageAwnings.length]);
      mb.box(x + fx * (hd / 2 + 0.05), 0.5, z + fz * (hd / 2 + 0.05), hw * 0.7, 1.9, 0.1, a, COL.glass);
    }
    for (const s of c.stops) {
      const [x, z, a] = s;
      mb.box(x, 2.3, z, 3.4, 0.18, 1.5, a, '#3fa7ff');
      mb.box(x - Math.sin(a) * 0.65, 0, z - Math.cos(a) * 0.65, 3.2, 2.3, 0.1, a, COL.glass);
      mb.box(x, 0.45, z, 2.2, 0.14, 0.5, a, '#8a96ad');
    }
    for (const l of c.lamps) {
      const [x, z, , dx, dz] = l;
      mb.cyl(x, 0, z, 0.12, 0.09, 6.2, '#5a6478', 5, false);
      mb.box(x + dz * 0.9, 6.1, z - dx * 0.9, 0.35, 0.16, 1.9, Math.atan2(dz, -dx), '#5a6478');
      mb.box(x + dz * 1.6, 5.98, z - dx * 1.6, 0.4, 0.12, 0.6, Math.atan2(dz, -dx), '#fff6c9');
    }
    for (const seg of c.over) this.overpass(mb, seg[0], seg[1]);
    for (const sg of c.sigs) this.signalPoles(mb, sg);
    for (const lm of c.lms) this.landmark(mb, lm);
    for (const bi of c.builds) this.building(mb, m.buildings[bi]);
    if (!mb.empty) { const mesh = new THREE.Mesh(mb.build(), this.mat); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
    for (const s of c.signs) g.add(this.sign(s));
    c.group = g; this.live.set(c.k, c); this.scene.add(g);
  }

  roads(c, mb) {
    const w = this.w;
    const sideW = (e) => (e.cls <= 2 ? 2.6 : 2.0);
    for (let q = 0; q < c.segs.length; q += 2) {
      const e = w.edges[c.segs[q]], k = c.segs[q + 1], seg = [e.pts[k], e.pts[k + 1]];
      mb.ribbon(seg, e.w + sideW(e) * 2, 0.05, COL.side);
      mb.ribbon(seg, e.w, 0.09, e.cls === 3 ? COL.roadMinor : COL.road);
      if (k > 0) { mb.disc(seg[0][0], seg[0][1], e.w / 2 + sideW(e), 0.05, COL.side, 10); mb.disc(seg[0][0], seg[0][1], e.w / 2, 0.09, COL.road, 10); }   // fill the wedge at bends
    }
    for (const n of c.nodes) {
      let maxW = 0, side = 2, minor = true;
      for (const a of w.adj[n]) { const e = w.edges[a.e]; if (e.w > maxW) maxW = e.w; if (e.cls <= 2) { side = 2.6; minor = false; } }
      const [x, z] = w.nodes[n];
      mb.disc(x, z, maxW / 2 + side, 0.05, COL.side, 14);
      mb.disc(x, z, maxW / 2, 0.09, minor ? COL.roadMinor : COL.road, 14);
    }
    // lane markings: whole edges are drawn by the chunk that owns the edge's first segment
    for (let q = 0; q < c.segs.length; q += 2) {
      if (c.segs[q + 1] !== 0) continue;
      const e = w.edges[c.segs[q]];
      if (e.cls > 2 || e.len < 8) continue;
      const padAt = (n) => { if (w.adj[n].length < 3) return 0; let mw = 0; for (const a of w.adj[n]) mw = Math.max(mw, w.edges[a.e].w); return (w.sigOf[n] >= 0 ? w.signals[w.sigOf[n]].half + 3.4 : mw / 2 + 1.5); };
      const p0 = padAt(e.a), p1 = padAt(e.b);
      const dash = (off, col, step, on) => { for (let s = p0; s < e.len - p1 - 0.5; s += step) { const a = w.edgePoint(e, s, 1, off), b = w.edgePoint(e, Math.min(s + on, e.len - p1), 1, off); mb.ribbon([[a.x, a.z], [b.x, b.z]], 0.24, 0.12, col); } };
      if (!e.oneway) {
        if (e.w >= 11) { dash(-0.22, COL.yellow, 6, 6); dash(0.22, COL.yellow, 6, 6); } else dash(0, COL.mark, 7, 3.2);
        if (e.w >= 14) { dash(e.w / 4, COL.mark, 7, 3.2); dash(-e.w / 4, COL.mark, 7, 3.2); }
      } else if (e.w >= 8) dash(0, COL.mark, 7, 3.2);
    }
  }
  signalPoles(mb, sg) {
    const w = this.w;
    sg.lamps = [];
    for (const ap of sg.approaches) {
      const e = w.edges[ap.e], s = Math.max(2, e.len - sg.half);
      if (e.len < sg.half + 2) continue;
      // zebra crossing just past the stop line
      const cw = w.edgePoint(e, s + 1.6, ap.dir), nx = -cw.dz, nz = cw.dx;
      const lo = e.oneway ? -e.w / 2 : -e.w / 2, hi = e.w / 2;
      for (let t = lo + 0.7; t <= hi - 0.7; t += 1.3) mb.ribbon([[cw.x + nx * t - cw.dx * 1.3, cw.z + nz * t - cw.dz * 1.3], [cw.x + nx * t + cw.dx * 1.3, cw.z + nz * t + cw.dz * 1.3]], 0.62, 0.125, COL.mark);
      const st = w.edgePoint(e, s - 0.6, ap.dir);
      mb.ribbon([[st.x + nx * (e.oneway ? lo : 0), st.z + nz * (e.oneway ? lo : 0)], [st.x + nx * hi, st.z + nz * hi]], 0.4, 0.125, COL.mark);
      // pole on the right-hand corner with an arm over the lanes
      const p = w.edgePoint(e, s + 0.4, ap.dir, e.w / 2 + 1.0), ang = Math.atan2(p.dx, p.dz);
      mb.cyl(p.x, 0, p.z, 0.16, 0.12, 6.4, '#2d3a55', 6, false);
      const reach = Math.min(e.w * 0.45, 5.5), ax = p.x - nx * reach / 2, az = p.z - nz * reach / 2;
      mb.box(ax, 6.0, az, reach, 0.18, 0.18, ang, '#2d3a55');
      const hx = p.x - nx * reach, hz = p.z - nz * reach;
      mb.box(hx, 4.9, hz, 0.62, 1.7, 0.5, ang, '#1b2333');
      sg.lamps.push({ x: hx, z: hz, axis: ap.axis });
    }
  }
  overpass(mb, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, ang = Math.atan2(dx, dz), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    mb.box(mx, 7.2, mz, 15, 0.9, l + 0.4, ang, COL.overpass, '#6b7590');
    mb.box(mx - dz / l * 7.3, 8.1, mz + dx / l * 7.3, 0.5, 0.9, l + 0.4, ang, '#d7dbe4');
    mb.box(mx + dz / l * 7.3, 8.1, mz - dx / l * 7.3, 0.5, 0.9, l + 0.4, ang, '#d7dbe4');
    if (l > 12 && !this.w.onRoad(mx, mz, 4)) mb.box(mx, 0, mz, 2.2, 7.2, 2.2, ang, '#aab1bf');
  }
  building(mb, b) {
    const h = b.h, wall = b.c, k = b.k;
    const glassy = (k === 'office' || k === 'apartments' || k === 'tower' || k === 'hotel' || k === 'commercial') && h >= 9;
    if (glassy) {
      const floors = Math.max(2, Math.round(h / 3.4)), fh = h / floors;
      for (let f = 0; f < floors; f++) {
        mb.prism(b.p, null, f * fh, f * fh + fh * 0.42, f === 0 ? shade(wall, 0.82) : wall);
        mb.prism(b.p, null, f * fh + fh * 0.42, (f + 1) * fh - fh * 0.12, k === 'apartments' ? '#8fb6d6' : '#7aa7cf');
        mb.prism(b.p, null, (f + 1) * fh - fh * 0.12, (f + 1) * fh, wall);
      }
      mb.flat(b.p, b.t, h, shade(wall, 0.92));
    } else if (k === 'retail' || b.poi) {
      mb.prism(b.p, null, 0, Math.min(2.7, h * 0.45), '#8fb6d6');
      mb.prism(b.p, null, Math.min(2.7, h * 0.45), h - 1.1, wall);
      mb.prism(b.p, b.t, h - 1.1, h, b.lm ? '#e04848' : shade(wall, 0.8), shade(wall, 1.04));
    } else mb.prism(b.p, b.t, 0, h, wall, shade(wall, k === 'industrial' ? 0.9 : 1.05));
    if (b.poi === 'church' || k === 'church' || k === 'cathedral') { mb.box(b.cx, h, b.cz, 2.4, 5, 2.4, 0, '#f4f1ea'); mb.cyl(b.cx, h + 5, b.cz, 1.9, 0, 4.5, '#4a5568', 4, false); }
    if (b.poi === 'gas') { mb.box(b.cx + 9, 4.2, b.cz + 5, 11, 0.6, 7, 0, '#f4f6fb', '#e04848'); for (const s of [-4, 4]) mb.cyl(b.cx + 9 + s, 0, b.cz + 5, 0.25, 0.25, 4.2, '#d7dbe4', 6, false); }
  }
  landmark(mb, lm) {
    const { x, z } = lm, y = lm.h || 0, t = lm.t;
    if (t === 'tims') {
      const k = Math.min(1.5, Math.max(1, (lm.r || 3) / 5));
      mb.cyl(x, y, z, 0.25, 0.25, 1.2 * k, '#8a96ad', 6, false);
      mb.torus(x, y + 1.2 * k + 0.75 * k, z, 1.9 * k, 0.75 * k, '#c9853f', '#ff8fb8');
    } else if (t === 'pacific') {
      mb.cyl(x, y, z, 3.0, 4.3, 9, '#f3e2c7', 12, true);
      mb.cyl(x, y + 0.2, z, 3.1, 3.6, 3.2, '#b8794a', 12, false);
      mb.cyl(x, y + 9, z, 4.6, 4.4, 0.7, '#f4f6fb', 12, true);
      mb.cyl(x + 1, y + 9, z, 0.38, 0.38, 5, '#ff5d8f', 6, true);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mb.blob(x + Math.sin(a) * 3.4, y + 0.6, z + Math.cos(a) * 3.4, 0.75, '#2b1c12'); }
    } else if (t === 'markville') {
      mb.box(x, y, z, 8, 8.5, 3.4, 0.3, '#ff5d8f', '#ffd1e0');
      mb.box(x, y + 2.6, z, 8.1, 2, 3.5, 0.3, '#f4f6fb');
      mb.torus(x, y + 8.6, z, 2, 0.22, '#f4f6fb', null, 10, 5);
    } else if (t === 'cinema') {
      for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2, c = i % 2 ? '#f4f6fb' : '#e04848'; mb.quad([x + Math.sin(a0) * 2.6, y, z + Math.cos(a0) * 2.6], [x + Math.sin(a1) * 2.6, y, z + Math.cos(a1) * 2.6], [x + Math.sin(a1) * 3.7, y + 6, z + Math.cos(a1) * 3.7], [x + Math.sin(a0) * 3.7, y + 6, z + Math.cos(a0) * 3.7], c); }
      for (let i = 0; i < 12; i++) { const a = i * 2.4, r = (i % 4) * 0.8; mb.blob(x + Math.sin(a) * r, y + 6.3 + (i % 3) * 0.6, z + Math.cos(a) * r, 1.1, i % 2 ? '#fff3b0' : '#ffe27a'); }
    } else if (t === 'civic') {
      mb.box(x, y, z, 4, 9, 4, 0, '#f5f3ee'); mb.box(x, y + 6, z + 2.05, 2.2, 2.2, 0.1, 0, '#2d3a55');
      mb.cyl(x, y + 9, z, 3.2, 0, 4, '#3fa7ff', 4, false);
      mb.cyl(x + 6, y, z, 0.12, 0.12, 7, '#d7dbe4', 5, false); mb.box(x + 7.2, y + 5.4, z, 2.2, 1.4, 0.08, 0, '#e04848');
    } else if (t === 'viva') {
      const a = lm.a, L = lm.L || 16;
      mb.box(x, 0.1, z, 2.2, 0.3, L, a, '#d7dbe4');
      mb.box(x, 3, z, 2.6, 0.2, L * 0.8, a, '#3fa7ff');
      for (const s of [-L * 0.3, 0, L * 0.3]) mb.cyl(x + Math.sin(a) * s, 0.4, z + Math.cos(a) * s, 0.12, 0.12, 2.6, '#f4f6fb', 5, false);
    } else if (t === 'unionville') {
      mb.cyl(x, 0, z, 0.2, 0.2, 5, '#3b4a6b', 6, false);
    }
  }

  // ------------------------------------------------------------ signs
  sign(s) {
    let tex = this.signTex.get(s.text);
    if (!tex) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), font = '700 44px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.font = font;
      const tw = Math.ceil(ctx.measureText(s.text).width) + 44;
      cv.width = tw; cv.height = 72;
      ctx.fillStyle = s.col; ctx.beginPath(); ctx.roundRect(2, 2, tw - 4, 68, 18); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.font = font; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.text, tw / 2, 38);
      tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.aspect = tw / 72;
      this.signTex.set(s.text, tex);
    }
    const mesh = new THREE.Mesh(WorldView.plane || (WorldView.plane = new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
    mesh.scale.set(s.size * tex.userData.aspect, s.size, 1);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.order = 'YXZ'; mesh.rotation.y = AZ; mesh.rotation.x = -0.45;
    mesh.userData.sign = true;
    return mesh;
  }

  // ------------------------------------------------------------ traffic light bulbs (one instanced mesh)
  buildBulbs() {
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial(), 256);
    this.bulbs.frustumCulled = false; this.bulbs.count = 0;
    this.scene.add(this.bulbs);
    this.bulbCol = { g: new THREE.Color('#3dff7a'), y: new THREE.Color('#ffd23d'), r: new THREE.Color('#ff3d3d') };
  }
  updateBulbs(x, z, time) {
    const m = new THREE.Matrix4();
    let n = 0;
    for (const c of this.live.values()) for (const sg of c.sigs) {
      if (!sg.lamps || Math.hypot(sg.x - x, sg.z - z) > 170) continue;
      for (const l of sg.lamps) {
        if (n >= 255) break;
        const st = this.w.light(sg, l.axis, time), y = st === 'r' ? 6.15 : st === 'y' ? 5.75 : 5.35;
        // both faces of the head, so the fixed camera always sees one
        for (const s of [1, -1]) { m.makeTranslation(l.x + Math.sin(AZ) * 0.3 * s, y, l.z + Math.cos(AZ) * 0.3 * s); this.bulbs.setMatrixAt(n, m); this.bulbs.setColorAt(n, this.bulbCol[st]); n++; }
      }
    }
    this.bulbs.count = n;
    this.bulbs.instanceMatrix.needsUpdate = true;
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ see-through circle around the player
  setCut(camera, x, y, z, bufW, bufH) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -v.z;
    v.set(x, y, z).project(camera);
    this.cut.value.set((v.x * 0.5 + 0.5) * bufW, (v.y * 0.5 + 0.5) * bufH, depth, bufH * 0.105);
  }
}
