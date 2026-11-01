// Traffic signals (spec 2.4). Computed at load time from the road graph:
//  1. find arterial junctions (>= 2 differently named roads of cls <= 2 meet) and merge
//     nearby junction nodes into one intersection (a divided-road crossing is 2-4 nodes);
//  2. collect approach edges (edges entering the intersection from outside), split them
//     into an E-W and a N-S axis group and give each a stop-line distance;
//  3. place a pole on the right-hand sidewalk corner of every approach with an arm over
//     its lanes and a signal head (baked into the chunk meshes; lamps are drawn by game.js).
// The phase clock is a pure function of game time, so nothing needs updating per frame.
import { M } from './math.js';
import { box, cyl, ribbon } from './geo.js';
import { CFG } from './config.js';

export const SIG_GREEN = 0, SIG_YELLOW = 1, SIG_RED = 2;

// geometry in the local frame of one approach: origin = pole foot, +z = travel direction, +x = left
const POLE_H = 6.5, ARM_Y = 6.15, HEAD_Y = 4.95, LAMP_DY = 0.6;
const POLE_OFF = 0.9;    // pole distance outside the curb, on the sidewalk
const CAR_HALF = 2.3;    // half car length + a little: stop distance is measured to the car centre
const POLE_COL = '#3a4152', HEAD_COL = '#262b38';

const key = (e, dir) => e * 2 + (dir > 0 ? 1 : 0);

// lateral offset (right of the edge centreline) of the traffic driving line. One-way
// carriageways keep a little right of centre so the two halves of a divided road never
// share a line where they converge at a split node.
export const laneOff = (e) => (e.oneway ? Math.min(CFG.traffic.onewayLane, e.w / 4) : e.w / 4);

export function buildSignals(w) {
  const S = CFG.signals;
  const { nodes, edges, adj, names } = w;
  const N = nodes.length;
  const far = (a) => (a.dir > 0 ? edges[a.e].b : edges[a.e].a); // other end of an adjacency entry
  // 1. seeds + single-linkage clustering
  const seeds = [];
  for (let n = 0; n < N; n++) {
    const nm = new Set();
    for (const a of adj[n]) { const e = edges[a.e]; if (e.cls <= 2 && names[e.name]) nm.add(e.name); }
    if (nm.size >= 2) seeds.push(n);
  }
  const par = new Map(seeds.map((n) => [n, n]));
  const find = (a) => { while (par.get(a) !== a) { const p = par.get(par.get(a)); par.set(a, p); a = p; } return a; };
  const R2 = S.clusterRadius * S.clusterRadius;
  for (let i = 0; i < seeds.length; i++)
    for (let j = i + 1; j < seeds.length; j++) {
      const p = nodes[seeds[i]], q = nodes[seeds[j]];
      if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < R2) par.set(find(seeds[i]), find(seeds[j]));
    }
  const groups = new Map();
  for (const n of seeds) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }
  const members = [...groups.values()];
  const cid = new Int32Array(N).fill(-1);
  members.forEach((m, c) => { for (const n of m) cid[n] = c; });
  // a plain node lying between two linked nodes of one cluster (e.g. a split point in the median)
  // is part of it; a node where a divided road merges back (well outside) is not
  const dist = (p, q) => Math.hypot(nodes[p][0] - nodes[q][0], nodes[p][1] - nodes[q][1]);
  for (let n = 0; n < N; n++) {
    if (cid[n] >= 0) continue;
    const nb = adj[n].map(far).filter((o) => cid[o] >= 0);
    let hit = -1;
    for (let i = 0; i < nb.length && hit < 0; i++)
      for (let j = i + 1; j < nb.length; j++)
        if (cid[nb[i]] === cid[nb[j]] && nb[i] !== nb[j] && dist(nb[i], n) + dist(n, nb[j]) < 1.25 * dist(nb[i], nb[j]) + 2) { hit = cid[nb[i]]; break; }
    if (hit >= 0) { cid[n] = hit; members[hit].push(n); }
  }

  // 2. approaches + axis groups
  const list = [];
  members.forEach((mem, c) => {
    let legs = 0;
    const aps = [];
    for (const n of mem)
      for (const a of adj[n]) {
        if (cid[far(a)] === c) continue; // edge inside the intersection: never stops
        legs++;
        const e = edges[a.e], dir = -a.dir; // travelling toward n
        if (e.oneway && dir < 0) continue;
        const p = w.edgePoint(e, e.len - Math.min(8, e.len), dir);
        let hx = nodes[n][0] - p.x, hz = nodes[n][1] - p.z;
        const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
        let maxW = 0;
        for (const b of adj[n]) maxW = Math.max(maxW, edges[b.e].w);
        // crosswalks are painted maxW/2+1.5 .. maxW/2+4.5 from the node (world.buildChunks)
        aps.push({ e: e.i, dir, node: n, hx, hz, axis: 0, stop: maxW / 2 + 4.5 + S.stopGap + CAR_HALF, corner: maxW / 2 + POLE_OFF, pole: null, lamps: null });
      }
    if (legs < 3 || aps.length < 2) return; // a bend where a road changes its name is no intersection
    // fold headings onto the local grid (4-theta mean); group 0 is the one closer to the x axis (E-W)
    let s4 = 0, c4 = 0;
    for (const ap of aps) { const th = Math.atan2(ap.hz, ap.hx); s4 += Math.sin(4 * th); c4 += Math.cos(4 * th); }
    const phi = Math.atan2(s4, c4) / 4;
    for (const ap of aps) {
      let d = Math.atan2(ap.hz, ap.hx) - phi;
      d -= Math.PI * Math.round(d / Math.PI);
      ap.axis = Math.abs(d) < Math.PI / 4 ? 0 : 1;
    }
    if (!aps.some((ap) => ap.axis === 0) || !aps.some((ap) => ap.axis === 1)) return;
    let x = 0, z = 0;
    for (const n of mem) { x += nodes[n][0]; z += nodes[n][1]; }
    list.push({ id: list.length, x: x / mem.length, z: z / mem.length, nodes: mem, approaches: aps, offset: 0 });
  });
  const cycle = 2 * (S.green + S.yellow + S.allRed);
  const byAp = new Map();
  for (const sig of list) {
    sig.offset = ((sig.id * 0.6180339887) % 1) * cycle; // deterministic, well spread
    for (const ap of sig.approaches) { ap.sig = sig; byAp.set(key(ap.e, ap.dir), ap); }
  }
  // a stop line beyond a short approach edge lies on the edge before it: follow pass-through
  // (degree-2) nodes upstream; at real junctions the car's one-edge lookahead finds it
  for (const sig of list)
    for (const ap of sig.approaches) {
      let e = edges[ap.e], dir = ap.dir, stop = ap.stop;
      for (let k = 0; k < 4 && stop > e.len; k++) {
        const up = dir > 0 ? e.a : e.b;
        if (adj[up].length !== 2 || cid[up] >= 0) break;
        const o = adj[up].find((a) => a.e !== e.i);
        if (!o) break;
        const pe = edges[o.e], pdir = -o.dir;
        if (pe.oneway && pdir < 0) break;
        stop -= e.len; e = pe; dir = pdir;
        if (!byAp.has(key(e.i, dir))) byAp.set(key(e.i, dir), { sig, axis: ap.axis, e: e.i, dir, stop, ext: true });
      }
    }

  // 3. poles on the right-hand sidewalk corner of each approach
  const poles = [];
  for (const sig of list) for (const ap of sig.approaches) placePole(w, ap, poles);
  return { list, byAp, poles };
}

// centreline point `back` metres before the approach's entry node, with the travel direction there
function pointBack(w, ap, back) {
  const e = w.edges[ap.e];
  if (back <= e.len - 0.5) return w.edgePoint(e, e.len - back, ap.dir);
  const [nx, nz] = w.nodes[ap.node];
  return { x: nx - ap.hx * back, z: nz - ap.hz * back, dx: ap.hx, dz: ap.hz };
}

function placePole(w, ap, poles) {
  const e = w.edges[ap.e];
  const lane = laneOff(e); // the head hangs over the traffic driving line
  const lat = e.w / 2 + POLE_OFF;
  for (let extra = 0; extra <= 6; extra += 1.5) {
    const c = pointBack(w, ap, ap.corner + extra);
    const x = c.x - c.dz * lat, z = c.z + c.dx * lat; // right of travel: (-dz, dx)
    if (!spotFree(w, x, z, poles)) continue;
    const arm = Math.max(2.6, lat - lane + 0.4);
    const a = Math.atan2(c.dx, c.dz);
    ap.pole = { x, z, a, arm };
    poles.push(ap.pole);
    w.addCollider([[x - 0.18, z - 0.18], [x + 0.18, z - 0.18], [x + 0.18, z + 0.18], [x - 0.18, z + 0.18]], 't'); // thin: no LOS block
    // red / yellow / green lamps run through the head, so both faces show the state of this axis
    // (the back face is what the opposite approach of the same axis sees across the junction)
    const base = M.chain(M.T(x, 0, z), M.RY(a), M.T(arm - 0.4, 0, 0));
    ap.lamps = [0, 1, 2].map((k) => M.chain(base, M.T(0, HEAD_Y + LAMP_DY * (1 - k), 0), M.RX(Math.PI / 2)));
    return;
  }
}

function spotFree(w, x, z, poles) {
  const ne = w.nearestEdge(x, z, 3);
  if (ne && ne.d < 0.45) return false;                 // on (or touching) a road
  if (w.collide(x, z, 0.5).hit || w.inWater(x, z)) return false;
  for (const p of poles) if (Math.abs(p.x - x) < 2 && Math.abs(p.z - z) < 2) return false;
  return true;
}

// static stop bars, poles, arms and heads go into the chunk meshes (no extra draw calls)
export function bakeSignals(w) {
  for (const sig of w.signals)
    for (const ap of sig.approaches) {
      // white stop bar across the approach lanes, just ahead of a waiting car's bumper
      const e = w.edges[ap.e], c = pointBack(w, ap, ap.stop - CAR_HALF - 0.35);
      const [l0, l1] = e.oneway ? [-e.w / 2 + 0.3, e.w / 2 - 0.3] : [0.25, e.w / 2 - 0.3];
      ribbon(w.chunk(c.x, c.z).mb, [[c.x - c.dz * l0, c.z + c.dx * l0], [c.x - c.dz * l1, c.z + c.dx * l1]], 0.5, 0.09, '#f7f7f7', false);
      const P = ap.pole;
      if (!P) continue;
      const mb = w.chunk(P.x, P.z).mb;
      const base = M.chain(M.T(P.x, 0, P.z), M.RY(P.a));
      const A = (g, m, col) => mb.add(g, M.mul(base, m), col);
      A(cyl(0.3, 0.34, 0.3, 6), M.T(0, 0.15, 0), '#a3aab8');           // concrete foot
      A(cyl(0.13, 0.16, POLE_H, 6), M.T(0, POLE_H / 2, 0), POLE_COL);  // pole
      A(box(P.arm + 0.1, 0.2, 0.2), M.T(P.arm / 2, ARM_Y, 0), POLE_COL); // mast arm over the lanes
      const hx = P.arm - 0.4;
      A(box(0.12, 0.35, 0.12), M.T(hx, ARM_Y - 0.25, 0), POLE_COL);     // hanger
      A(box(0.82, 2.0, 0.44), M.T(hx, HEAD_Y, 0), HEAD_COL);            // signal head housing
      A(box(0.98, 2.16, 0.36), M.T(hx, HEAD_Y, 0), '#f2c230');          // backplate: yellow rim around both faces
    }
}

// 0 = green, 1 = yellow, 2 = red for an axis (0 = E-W, 1 = N-S) of a signal at game time t
export function signalState(sig, axis, t) {
  const S = CFG.signals, half = S.green + S.yellow + S.allRed;
  const u = (t + sig.offset + (axis ? half : 0)) % (2 * half);
  return u < S.green ? SIG_GREEN : u < S.green + S.yellow ? SIG_YELLOW : SIG_RED;
}

export function nearPole(poles, x, z, r) {
  for (const p of poles) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
  return false;
}
