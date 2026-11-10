// GameView: draws people, cars and particles with two instanced meshes (rounded boxes + wheels).
import * as THREE from '../vendor/three.module.min.js';
import { CFG, COL } from './config.js';

const colCache = new Map();
const C = (hex) => { let c = colCache.get(hex); if (!c) colCache.set(hex, c = new THREE.Color(hex)); return c; };
const E = new THREE.Matrix4(), L = new THREE.Matrix4(), M = new THREE.Matrix4(), R = new THREE.Matrix4();
const P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), EUL = new THREE.Euler();

// unit box with rounded corners
function roundedBox(r = 0.14, seg = 3) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg), pos = g.attributes.position, nor = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-0.5 + r, Math.min(0.5 - r, v.x)), Math.max(-0.5 + r, Math.min(0.5 - r, v.y)), Math.max(-0.5 + r, Math.min(0.5 - r, v.z)));
    v.sub(c);
    if (v.lengthSq() > 1e-8) { v.normalize(); nor.setXYZ(i, v.x, v.y, v.z); pos.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); }
  }
  return g;
}

export class GameView {
  constructor(game, scene) {
    this.g = game; this.scene = scene;
    const mat = new THREE.MeshLambertMaterial();
    this.box = new THREE.InstancedMesh(roundedBox(), mat, 1800);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); wg.rotateZ(Math.PI / 2);
    this.wheel = new THREE.InstancedMesh(wg, mat, 260);
    for (const m of [this.box, this.wheel]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; this.scene.add(m); }
    this.lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 400);
    this.lights.frustumCulled = false; this.lights.count = 0; this.scene.add(this.lights);
    this.nb = 0; this.nw = 0; this.nl = 0;
    // ground ring under the player (always visible, even behind houses and trees)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.25, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthTest: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 9; this.scene.add(this.ring);
    this.hint = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.3, 36), new THREE.MeshBasicMaterial({ color: '#2fd4ff', transparent: true, opacity: 0.85, depthTest: false }));
    this.hint.rotation.x = -Math.PI / 2; this.hint.renderOrder = 8; this.hint.visible = false; this.scene.add(this.hint);
    this.parts = [];
  }
  // part: local offset, size, colour, optional pivot rotation about x (pivot at the top of the part)
  put(ox, oy, oz, sx, sy, sz, col, rx = 0, ry = 0) {
    if (this.nb >= 1800) return;
    if (rx) { L.makeTranslation(ox, oy + sy / 2, oz); R.makeRotationX(rx); L.multiply(R); R.makeTranslation(0, -sy / 2, 0); L.multiply(R); }
    else L.makeTranslation(ox, oy, oz);
    if (ry) { R.makeRotationY(ry); L.multiply(R); }
    R.makeScale(sx, sy, sz); L.multiply(R);
    M.multiplyMatrices(E, L);
    this.box.setMatrixAt(this.nb, M); this.box.setColorAt(this.nb, C(col)); this.nb++;
  }
  glow(ox, oy, oz, sx, sy, sz, col) {
    if (this.nl >= 400) return;
    L.makeTranslation(ox, oy, oz); R.makeScale(sx, sy, sz); L.multiply(R); M.multiplyMatrices(E, L);
    this.lights.setMatrixAt(this.nl, M); this.lights.setColorAt(this.nl, C(col)); this.nl++;
  }
  person(o, t) {
    const lk = o.look, down = o.state === 'down' || o.state === 'ko', fly = o.state === 'fly';
    const sq = o.hitT > 0 ? 1 - 0.28 * Math.sin(o.hitT / 0.22 * Math.PI) : 1;
    EUL.set(down ? -Math.PI / 2 : fly ? t * 9 : 0, o.h, 0, 'YXZ'); Q.setFromEuler(EUL);
    P.set(o.x, (o.y || 0) + (down ? 0.42 : fly ? 1.2 : 0), o.z); S.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    E.compose(P, Q, S);
    const run = Math.min(1, o.speed / 5), sw = down || fly ? 0.5 : Math.sin(o.anim) * (0.35 + 0.55 * run) * Math.min(1, o.speed / 1.2);
    const bob = down || fly ? 0 : Math.abs(Math.sin(o.anim)) * 0.07 * Math.min(1, o.speed / 1.2);
    const cop = o.cop, busted = o.state === 'busted';
    this.put(-0.27, 0.375, 0, 0.44, 0.78, 0.48, lk.pants, sw);
    this.put(0.27, 0.375, 0, 0.44, 0.78, 0.48, lk.pants, -sw);
    if (lk.long) this.put(0, 1.05 + bob, 0, 1.08, 1.3, 0.66, lk.shirt); else this.put(0, 1.225 + bob, 0, 1.06, 0.97, 0.64, lk.shirt);
    if (cop) this.put(0, 0.98 + bob, 0, 1.09, 0.16, 0.67, '#111a33');
    const punch = o.punchAnim > 0 ? -1.7 * Math.sin(o.punchAnim / 0.22 * Math.PI) : 0;
    const up = busted ? Math.PI : 0;
    this.put(-0.69, 1.25 + bob, 0, 0.3, 0.82, 0.36, lk.shirt, up || -sw);
    this.put(0.69, 1.25 + bob, 0, 0.3, 0.82, 0.36, lk.shirt, up || punch || sw);
    this.put(0, 2.2 + bob, 0, 1.02, 0.96, 0.94, lk.skin);
    this.put(-0.22, 2.24 + bob, 0.47, 0.13, 0.19, 0.06, '#1b2333');
    this.put(0.22, 2.24 + bob, 0.47, 0.13, 0.19, 0.06, '#1b2333');
    const hat = lk.hat;
    if (hat === 'turban') this.put(0, 2.78 + bob, -0.02, 1.14, 0.56, 1.06, lk.hatCol);
    else if (hat === 'cap' || hat === 'police') { this.put(0, 2.74 + bob, 0, 1.08, 0.3, 1.0, lk.hatCol); this.put(0, 2.63 + bob, 0.62, 0.92, 0.09, 0.4, hat === 'police' ? '#111a33' : lk.hatCol); if (hat === 'police') this.put(0, 2.76 + bob, 0.5, 0.22, 0.2, 0.06, '#ffd23d'); }
    else if (hat !== 'bald') { this.put(0, 2.7 + bob, -0.04, 1.08, 0.3, 1.0, lk.hair); this.put(0, hat === 'long' ? 2.05 + bob : 2.35 + bob, -0.44, 1.08, hat === 'long' ? 1.25 : 0.6, 0.22, lk.hair); }
    if (down) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; this.star(o.x - Math.sin(o.h) * 2.2 + Math.sin(a) * 0.8, 1.5 + Math.sin(t * 7 + i) * 0.12, o.z - Math.cos(o.h) * 2.2 + Math.cos(a) * 0.8, 0.3); }
  }
  star(x, y, z, s, col = '#ffd23d') {
    if (this.nl >= 400) return;
    EUL.set(0.7, x * 3 + y * 5, 0.7); Q.setFromEuler(EUL); P.set(x, y, z); S.set(s, s, s); M.compose(P, Q, S);
    this.lights.setMatrixAt(this.nl, M); this.lights.setColorAt(this.nl, C(col)); this.nl++;
  }
  car(c, t) {
    const len = c.len, type = c.type, roll = -c.steer * Math.min(1, Math.abs(c.v) / 14) * 0.07;
    EUL.set(0, c.h, roll, 'YXZ'); Q.setFromEuler(EUL); P.set(c.x, 0, c.z); S.set(1, 1, 1); E.compose(P, Q, S);
    const tall = type === 'suv' ? 0.2 : type === 'van' ? 0.32 : 0, bh = 0.66 + tall * 0.5, by = 0.42 + bh / 2;
    const body = c.hp <= 0 ? '#4a4f5c' : c.color;
    this.put(0, by, 0, 2.06, bh, len, body);
    const cabL = type === 'van' ? len * 0.72 : type === 'suv' ? len * 0.62 : len * 0.5, cabZ = type === 'van' ? -0.35 : type === 'suv' ? -0.4 : -0.3, ch = 0.62 + tall;
    this.put(0, by + bh / 2 + ch / 2 - 0.06, cabZ, 1.8, ch, cabL, '#2a3a52');
    this.put(0, by + bh / 2 + ch - 0.02, cabZ, 1.84, 0.12, cabL - 0.3, body);
    if (type === 'van') this.put(0, by + bh / 2 + ch / 2 - 0.06, cabZ - 0.6, 1.86, ch - 0.1, cabL - 1.3, body);
    if (type === 'police') {
      this.put(0, by + 0.02, 0, 2.1, bh * 0.6, len * 0.36, COL.cop);
      const on = c.siren, ph = Math.floor(t * 6) % 2;
      this.glow(-0.45, by + bh / 2 + ch + 0.14, cabZ, 0.7, 0.2, 0.34, on && ph ? '#ff2a2a' : '#8a1f1f');
      this.glow(0.45, by + bh / 2 + ch + 0.14, cabZ, 0.7, 0.2, 0.34, on && !ph ? '#2a6bff' : '#1f2f8a');
    } else if (type === 'taxi') this.glow(0, by + bh / 2 + ch + 0.16, cabZ, 0.7, 0.24, 0.3, '#fff6c9');
    this.glow(-0.68, by + 0.04, len / 2, 0.44, 0.2, 0.08, '#fff6c9'); this.glow(0.68, by + 0.04, len / 2, 0.44, 0.2, 0.08, '#fff6c9');
    const brake = c.v < 0.4 && c.driver ? '#ff3b3b' : '#b02a2a';
    this.glow(-0.7, by + 0.06, -len / 2, 0.42, 0.18, 0.08, brake); this.glow(0.7, by + 0.06, -len / 2, 0.42, 0.18, 0.08, brake);
    // wheels
    const wz = len / 2 - 0.95;
    for (let i = 0; i < 4; i++) {
      if (this.nw >= 260) break;
      const front = i < 2, sx = i % 2 ? 1 : -1;
      L.makeTranslation(sx * 0.98, 0.44, front ? wz : -wz);
      if (front) { R.makeRotationY(c.steer * 0.5); L.multiply(R); }
      R.makeRotationX(c.wheel / 0.44); L.multiply(R);
      R.makeScale(0.34, 0.88, 0.88); L.multiply(R);
      M.multiplyMatrices(E, L);
      this.wheel.setMatrixAt(this.nw, M); this.wheel.setColorAt(this.nw, C('#20242e')); this.nw++;
    }
  }
  burst(x, y, z, n, col, speed = 6, size = 0.3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({ x, y, z, vx: Math.sin(a) * v, vy: 3 + Math.random() * 5, vz: Math.cos(a) * v, life: 0.5 + Math.random() * 0.3, max: 0.8, size, col, grav: 16 });
    }
  }
  events(ev) {
    for (const e of ev) {
      if (e.k === 'hit') this.burst(e.x, 2, e.z, 7, '#ffd23d');
      else if (e.k === 'crash') this.burst(e.x, 1, e.z, e.tier === 'large' ? 16 : 9, '#f4f6fb', 8, 0.34);
      else if (e.k === 'down') this.burst(e.who.x, 1.5, e.who.z, 6, '#ffffff', 4, 0.25);
    }
  }
  update(dt, t) {
    const g = this.g, f = g.focus, lim = 150;
    this.nb = this.nw = this.nl = 0;
    const p = g.player;
    if (p.state !== 'car' && !(p.invuln > 0 && Math.floor(t * 12) % 2 && p.state === 'walk')) this.person(p, t);
    for (const q of g.peds) if (Math.abs(q.x - f.x) < lim && Math.abs(q.z - f.z) < lim) this.person(q, t);
    for (const c of g.cars) {
      if (Math.abs(c.x - f.x) > lim || Math.abs(c.z - f.z) > lim) continue;
      this.car(c, t);
      if (c.smoke && Math.random() < dt * 14) this.parts.push({ x: c.x + Math.sin(c.h) * c.len * 0.4, y: 1.2, z: c.z + Math.cos(c.h) * c.len * 0.4, vx: (Math.random() - 0.5), vy: 2.5, vz: (Math.random() - 0.5), life: 1.1, max: 1.1, size: 0.5, col: c.hp <= 0 ? '#30343c' : '#9aa3b2', grav: -1, grow: 1.2 });
      if (c.slide > 5 && Math.abs(c.v) > 6 && Math.random() < dt * 30) this.parts.push({ x: c.x - Math.sin(c.h) * 1.6, y: 0.3, z: c.z - Math.cos(c.h) * 1.6, vx: 0, vy: 0.8, vz: 0, life: 0.5, max: 0.5, size: 0.45, col: '#e6e9f0', grav: 0, grow: 1.5 });
    }
    // particles
    for (const q of this.parts) {
      q.life -= dt; q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.1 && q.grav > 0) { q.y = 0.1; q.vy *= -0.4; }
      const s = q.size * (q.grow ? 1 + (1 - q.life / q.max) * q.grow : Math.max(0.2, q.life / q.max));
      this.star(q.x, q.y, q.z, s, q.col);
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    this.box.count = this.nb; this.wheel.count = this.nw; this.lights.count = this.nl;
    for (const m of [this.box, this.wheel, this.lights]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // rings
    const inCar = !!p.car;
    this.ring.position.set(f.x, 0.2, f.z); this.ring.scale.setScalar(inCar ? 2.6 : 1);
    this.ring.material.color.set(g.wanted ? '#ff5a5a' : '#ffffff');
    this.ring.visible = p.state !== 'busted';
    let best = null, bd = CFG.car.enterDist + 1.5;
    if (!inCar && p.state === 'walk') for (const c of g.cars) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    this.hint.visible = !!best;
    if (best) { this.hint.position.set(best.x, 0.22, best.z); this.hint.material.opacity = bd < CFG.car.enterDist ? 0.95 : 0.4; this.hint.scale.setScalar(1 + Math.sin(t * 6) * 0.04); }
    this.near = best && bd < CFG.car.enterDist ? best : null;
  }
}
