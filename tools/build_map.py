#!/usr/bin/env python3
"""Project 905 map builder.

Turns the raw OpenStreetMap export (data/raw/markham_osm.json.gz) into the
compact game map (maps/markham.json).

Steps: project to local metres -> rotate so the main road grid is axis aligned
("map north") -> clip to Warden..McCowan x Steeles..16th -> compress 40% ->
road graph (junctions + polylines) -> procedural houses -> OSM buildings ->
water / parks / rail / 407 overpass -> landmarks.

Usage: python3 tools/build_map.py
"""
import gzip, json, math, os, random, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw', 'markham_osm.json.gz')
OUT = os.path.join(ROOT, 'maps', 'markham.json')

SCALE = 0.4            # coordinate compression
MARGIN = 80.0          # real metres kept outside the boundary roads
LAT0, LON0 = 43.85, -79.30
random.seed(905)

# ---------------------------------------------------------------- helpers
def proj(lat, lon):
    return ((lon - LON0) * math.cos(math.radians(LAT0)) * 111320.0,
            -(lat - LAT0) * 110574.0)

def dp_simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, az = pts[a]; bx, bz = pts[b]
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, pz = pts[i]
            d = abs((px - ax) * dz - (pz - az) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def ring_simplify(ring, tol):
    """simplify a closed ring given without the repeated closing point"""
    n = len(ring)
    if n < 4:
        return ring
    x0, z0 = ring[0]
    far = max(range(n), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - z0) ** 2)
    a = dp_simplify(ring[:far + 1], tol)
    b = dp_simplify(ring[far:] + [ring[0]], tol)
    return a[:-1] + b[:-1]

def seg_dist(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
    cx, cz = ax + dx * t, az + dz * t
    return math.hypot(px - cx, pz - cz)

def poly_area(poly):
    s = 0
    for i in range(len(poly)):
        x1, z1 = poly[i]; x2, z2 = poly[(i + 1) % len(poly)]
        s += x1 * z2 - x2 * z1
    return s / 2

def centroid(poly):
    a = poly_area(poly)
    if abs(a) < 1e-6:
        return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
    cx = cz = 0
    for i in range(len(poly)):
        x1, z1 = poly[i]; x2, z2 = poly[(i + 1) % len(poly)]
        f = x1 * z2 - x2 * z1
        cx += (x1 + x2) * f; cz += (z1 + z2) * f
    return (cx / (6 * a), cz / (6 * a))

def point_in_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside

def earclip(poly):
    """Triangulate a simple polygon -> list of index triples."""
    n = len(poly)
    if n < 3:
        return []
    idx = list(range(n))
    if poly_area(poly) < 0:
        idx.reverse()
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        ear = False
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            ax, az = poly[i0]; bx, bz = poly[i1]; cx, cz = poly[i2]
            if (bx - ax) * (cz - az) - (bz - az) * (cx - ax) <= 0:
                continue
            ok = True
            for j in idx:
                if j in (i0, i1, i2):
                    continue
                px, pz = poly[j]
                d1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax)
                d2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx)
                d3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx)
                if d1 >= 0 and d2 >= 0 and d3 >= 0:
                    ok = False; break
            if ok:
                tris.append((i0, i1, i2)); idx.pop(k); ear = True; break
        if not ear:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris

class Grid:
    """Uniform grid of axis-aligned bounding boxes for overlap queries."""
    def __init__(self, cell=20.0):
        self.cell = cell; self.d = defaultdict(list)
    def _cells(self, x0, z0, x1, z1):
        c = self.cell
        for i in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for j in range(int(math.floor(z0 / c)), int(math.floor(z1 / c)) + 1):
                yield (i, j)
    def add(self, box, item):
        for k in self._cells(*box):
            self.d[k].append((box, item))
    def query(self, box):
        seen = set(); out = []
        for k in self._cells(*box):
            for b, it in self.d.get(k, ()):
                if id(it) in seen:
                    continue
                if b[0] <= box[2] and b[2] >= box[0] and b[1] <= box[3] and b[3] >= box[1]:
                    seen.add(id(it)); out.append(it)
        return out

# ---------------------------------------------------------------- load
print('loading', RAW)
with gzip.open(RAW, 'rt', encoding='utf8') as f:
    osm = json.load(f)
els = osm['elements']
ways = [e for e in els if e['type'] == 'way' and 'geometry' in e]
nodes_pt = [e for e in els if e['type'] == 'node']
rels = [e for e in els if e['type'] == 'relation']

def wpts(w):
    return [proj(g['lat'], g['lon']) for g in w['geometry']]

# ---------------------------------------------------------------- rotation
ROADCLS = {'primary', 'secondary', 'tertiary'}
s4 = c4 = 0.0
for w in ways:
    if w['tags'].get('highway') in ROADCLS:
        p = wpts(w)
        for (x1, z1), (x2, z2) in zip(p, p[1:]):
            L = math.hypot(x2 - x1, z2 - z1)
            a = math.atan2(z2 - z1, x2 - x1)
            s4 += L * math.sin(4 * a); c4 += L * math.cos(4 * a)
ANG = math.atan2(s4, c4) / 4          # grid angle relative to x axis
print('grid rotation (deg):', math.degrees(ANG))
CA, SA = math.cos(-ANG), math.sin(-ANG)

def rot(p):
    x, z = p
    return (x * CA - z * SA, x * SA + z * CA)

def rpts(w):
    return [rot(p) for p in wpts(w)]

# ---------------------------------------------------------------- bounds from boundary roads
def road_coord(name, axis):
    vals = []
    for w in ways:
        if w['tags'].get('name') == name and w['tags'].get('highway'):
            vals += [p[axis] for p in rpts(w)]
    vals.sort()
    return vals[len(vals) // 2] if vals else None

# median x of N-S roads / median z of E-W roads, restricted to the core area
xW = road_coord('Warden Avenue', 0)
xE = road_coord('McCowan Road', 0)
zS = road_coord('Steeles Avenue East', 1)
zN = road_coord('16th Avenue', 1)
print('bounds real:', xW, xE, zN, zS)
X0, X1 = min(xW, xE) - MARGIN - 420.0, max(xW, xE) + MARGIN  # extra west strip keeps the Civic Centre
Z0, Z1 = min(zN, zS) - MARGIN, max(zN, zS) + MARGIN
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2

def inside(p, pad=0):
    return X0 - pad <= p[0] <= X1 + pad and Z0 - pad <= p[1] <= Z1 + pad

def g(p):
    """real rotated metres -> game metres"""
    return (round((p[0] - CX) * SCALE, 2), round((p[1] - CZ) * SCALE, 2))

HALF_W = (X1 - X0) * SCALE / 2
HALF_H = (Z1 - Z0) * SCALE / 2
print('game size: %.0f x %.0f m' % (HALF_W * 2, HALF_H * 2))

def clip_line(pts):
    """split a polyline into the runs that are inside the region (keeping one point beyond)."""
    runs, cur = [], []
    for i, p in enumerate(pts):
        if inside(p):
            if not cur and i > 0:
                cur.append(pts[i - 1])
            cur.append(p)
        else:
            if cur:
                cur.append(p); runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]

# ---------------------------------------------------------------- roads + graph
DRIVE = {'primary': 0, 'secondary': 1, 'tertiary': 2, 'unclassified': 3, 'residential': 3,
         'living_street': 3, 'primary_link': 2, 'secondary_link': 2, 'tertiary_link': 2}
DEF_LANES = {0: 4, 1: 4, 2: 2, 3: 2}

def short_name(n):
    if not n:
        return ''
    rep = [('Highway 7', 'Hwy 7'), ('Highway 407', 'Hwy 407'), (' Avenue', ' Ave'), (' Road', ' Rd'),
           (' Street', ' St'), (' Drive', ' Dr'), (' Boulevard', ' Blvd'), (' Crescent', ' Cres'),
           (' Court', ' Crt'), (' Circle', ' Cir'), (' Parkway', ' Pkwy'), (' East', ' E'),
           (' West', ' W'), (' Place', ' Pl'), (' Gate', ' Gt'), (' Trail', ' Trl'), (' Lane', ' Ln')]
    for a, b in rep:
        n = n.replace(a, b)
    return n

names = []
name_idx = {}
def nid(n):
    n = short_name(n)
    if n not in name_idx:
        name_idx[n] = len(names); names.append(n)
    return name_idx[n]

# node usage counting for junction detection
use = defaultdict(int)
drive_ways = []
for w in ways:
    t = w['tags']
    hw = t.get('highway')
    if hw in DRIVE and 'nodes' in w:
        drive_ways.append(w)
        for i, n in enumerate(w['nodes']):
            use[n] += 2 if (i == 0 or i == len(w['nodes']) - 1) else 1

node_xy = {}
for w in drive_ways:
    for n, gm in zip(w['nodes'], w['geometry']):
        node_xy[n] = rot(proj(gm['lat'], gm['lon']))

junction_ids = {}
jnodes = []
def jid(n):
    if n not in junction_ids:
        junction_ids[n] = len(jnodes); jnodes.append(g(node_xy[n]))
    return junction_ids[n]

edges = []  # [a, b, cls, width, oneway, name, pts]
for w in drive_ways:
    t = w['tags']; cls = DRIVE[t['highway']]
    oneway = 1 if t.get('oneway') in ('yes', '1', 'true') else 0
    try:
        lanes = int(str(t.get('lanes', '')).split(';')[0])
    except ValueError:
        lanes = DEF_LANES[cls] // (2 if oneway else 1)
    lanes = max(1, min(lanes, 6))
    width = round(min(lanes * 2.7 + 0.6, 14.0), 1)
    if cls == 3:
        width = 6.0
    ns = w['nodes']
    # split into segments between junctions, keep only parts inside region
    seg = [ns[0]]
    for n in ns[1:]:
        seg.append(n)
        if use[n] > 1 or n == ns[-1]:
            pts_real = [node_xy[k] for k in seg]
            if any(inside(p) for p in pts_real):
                pts = dp_simplify([g(p) for p in pts_real], 0.6)
                edges.append([jid(seg[0]), jid(seg[-1]), cls, width, oneway, nid(t.get('name')), pts])
            seg = [n]

# drop tiny disconnected islands: keep largest connected component
adj = defaultdict(list)
for i, e in enumerate(edges):
    adj[e[0]].append(i); adj[e[1]].append(i)
comp = {}
best_c, best_n = None, 0
for s in range(len(jnodes)):
    if s in comp or s not in adj:
        continue
    stack = [s]; comp[s] = s; cnt = 0
    while stack:
        u = stack.pop(); cnt += 1
        for ei in adj[u]:
            for v in (edges[ei][0], edges[ei][1]):
                if v not in comp:
                    comp[v] = s; stack.append(v)
    if cnt > best_n:
        best_n, best_c = cnt, s
edges = [e for e in edges if comp.get(e[0]) == best_c]
# reindex junctions
used = sorted({e[0] for e in edges} | {e[1] for e in edges})
remap = {o: i for i, o in enumerate(used)}
jnodes = [jnodes[o] for o in used]
for e in edges:
    e[0] = remap[e[0]]; e[1] = remap[e[1]]
print('graph: %d junctions, %d edges' % (len(jnodes), len(edges)))

# road grid for clearance checks
road_grid = Grid(24.0)
for e in edges:
    pts, hw = e[6], e[3] / 2
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        box = (min(ax, bx) - hw, min(az, bz) - hw, max(ax, bx) + hw, max(az, bz) + hw)
        road_grid.add(box, (ax, az, bx, bz, hw))

def road_clear(x, z, r):
    """distance from point to nearest road edge minus r (>0 means clear)"""
    best = 1e9
    for (ax, az, bx, bz, hw) in road_grid.query((x - r - 12, z - r - 12, x + r + 12, z + r + 12)):
        best = min(best, seg_dist(x, z, ax, az, bx, bz) - hw)
    return best - r

# ---------------------------------------------------------------- special lines
busways, overpass, rails, rivers = [], [], [], []
for w in ways:
    t = w['tags']; hw = t.get('highway')
    if hw == 'busway' or t.get('name') == 'VIVA Rapidway':
        for r in clip_line(rpts(w)):
            busways.append(dp_simplify([g(p) for p in r], 0.5))
    elif hw == 'motorway':
        for r in clip_line(rpts(w)):
            overpass.append(dp_simplify([g(p) for p in r], 0.8))
    elif t.get('railway') == 'rail' and t.get('service') not in ('yard', 'siding', 'spur'):
        for r in clip_line(rpts(w)):
            rails.append(dp_simplify([g(p) for p in r], 0.6))
    elif t.get('waterway') in ('river', 'stream', 'canal'):
        for r in clip_line(rpts(w)):
            rivers.append([1 if t.get('waterway') == 'river' else 0, dp_simplify([g(p) for p in r], 0.8)])

# ---------------------------------------------------------------- areas
def area_polys(w):
    p = rpts(w)
    if len(p) < 4 or p[0] != p[-1]:
        return None
    p = p[:-1]
    if not any(inside(q, 50) for q in p):
        return None
    gp = ring_simplify([g(q) for q in p], 0.5)
    if len(gp) < 3 or abs(poly_area(gp)) < 4:
        return None
    return gp

water, parks, lots, plazas = [], [], [], []
for w in ways:
    t = w['tags']
    if t.get('natural') == 'water':
        gp = area_polys(w)
        if gp: water.append(gp)
    elif t.get('leisure') in ('park', 'golf_course', 'pitch'):
        gp = area_polys(w)
        if gp: parks.append(gp)
    elif t.get('landuse') in ('commercial', 'retail'):
        gp = area_polys(w)
        if gp: lots.append(gp)
    elif t.get('landuse') in ('grass', 'forest', 'meadow', 'cemetery'):
        gp = area_polys(w)
        if gp: parks.append(gp)
for r in rels:
    if r['tags'].get('natural') == 'water':
        for m in r['members']:
            if m.get('role') == 'outer' and m.get('geometry'):
                p = [rot(proj(q['lat'], q['lon'])) for q in m['geometry']]
                if len(p) > 3 and p[0] == p[-1] and any(inside(q, 50) for q in p):
                    gp = ring_simplify([g(q) for q in p[:-1]], 0.8)
                    if len(gp) >= 3:
                        water.append(gp)

def tri_out(polys):
    out = []
    for p in polys:
        t = earclip(p)
        if t:
            out.append({'p': [list(q) for q in p], 't': [list(x) for x in t]})
    return out

water_grid = Grid(30.0)
for p in water:
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    water_grid.add((min(xs), min(zs), max(xs), max(zs)), p)
def in_water(x, z, r=0):
    for p in water_grid.query((x - r, z - r, x + r, z + r)):
        if point_in_poly(x, z, p):
            return True
    return False

park_grid = Grid(30.0)
for p in parks:
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    park_grid.add((min(xs), min(zs), max(xs), max(zs)), p)
def in_park(x, z):
    return any(point_in_poly(x, z, p) for p in park_grid.query((x, z, x, z)))

# ---------------------------------------------------------------- buildings (OSM, non-house)
PALETTE = {
    'retail': ['#f1e4cc', '#e9d5b5', '#f3dcd0', '#dfe7f2'],
    'commercial': ['#cfe3f0', '#d9d4ee', '#e2ecd6', '#f3e1c4'],
    'apartments': ['#f6d6c2', '#d8e2f0', '#efe6d2', '#d6ead8'],
    'industrial': ['#d5d9e0', '#c9d3dc', '#e0dccf'],
    'school': ['#f4c9a0', '#e8b98c'],
    'church': ['#f2efe6'],
    'default': ['#efe4d0', '#dfe6ee', '#f2dccb', '#e3ead6', '#ece0f0'],
}
LANDMARK_NAMES = {
    'Pacific Mall': 'pacific', 'CF Markville': 'markville', 'Markham Civic Centre': 'civic',
}
occ = Grid(20.0)
buildings = []
landmarks = []
tims_done = []

def place_building(poly, h, color, kind, extra=None):
    xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
    box = (min(xs), min(zs), max(xs), max(zs))
    b = {'p': [list(q) for q in poly], 'h': round(h, 1), 'c': color, 'k': kind}
    if extra:
        b.update(extra)
    buildings.append(b)
    occ.add(box, b)
    return b

def fits(poly, pad=1.5):
    for (x, z) in poly + [centroid(poly)]:
        if road_clear(x, z, pad) < 0:
            return False
    xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
    for o in occ.query((min(xs), min(zs), max(xs), max(zs))):
        return False
    return True

TIMS_FALLBACK = []
blds = []
for w in ways:
    t = w['tags']
    if 'building' not in t:
        continue
    p = rpts(w)
    if len(p) < 4 or not all(inside(q) for q in p):
        continue
    blds.append((w, p[:-1]))
# landmarks and big ones first
def prio(item):
    w, p = item
    return (0 if w['tags'].get('name') in LANDMARK_NAMES else 1, -abs(poly_area(p)))
blds.sort(key=prio)

for w, p in blds:
    t = w['tags']
    name = t.get('name', '')
    lm = LANDMARK_NAMES.get(name)
    btype = t.get('building', 'yes')
    if lm:
        size_k = 0.72
    else:
        size_k = 0.55
    c = centroid(p)
    gc = g(c)
    gp = [(gc[0] + (q[0] - c[0]) * size_k, gc[1] + (q[1] - c[1]) * size_k) for q in p]
    gp = ring_simplify(gp, 0.4)
    if len(gp) < 3 or abs(poly_area(gp)) < 25:
        continue
    ok = False
    for shrink in (1.0, 0.85, 0.7, 0.55):
        sp = [(gc[0] + (q[0] - gc[0]) * shrink, gc[1] + (q[1] - gc[1]) * shrink) for q in gp]
        if fits(sp, 1.0):
            ok = True; break
    if not ok:
        if t.get('brand') == 'Tim Hortons':
            TIMS_FALLBACK.append(gc)
        continue
    gp = [(round(x, 2), round(z, 2)) for x, z in sp]
    try:
        lv = float(str(t.get('building:levels', '')).split(';')[0])
    except ValueError:
        lv = 0
    if lv:
        h = min(4 + lv * 2.4, 46)
    else:
        h = {'apartments': 16, 'retail': 6, 'commercial': 9, 'industrial': 7, 'school': 7,
             'church': 8, 'hotel': 20, 'office': 14}.get(btype, 6 + random.random() * 4)
    pal = PALETTE.get(btype, PALETTE['default'])
    color = random.choice(pal)
    extra = None
    if lm:
        extra = {'lm': lm}
        h = {'pacific': 9, 'markville': 9, 'civic': 12}[lm]
        color = {'pacific': '#f1e4cc', 'markville': '#e7dcf3', 'civic': '#f5f3ee'}[lm]
        lc = centroid(gp)
        landmarks.append({'t': lm, 'x': round(lc[0], 1), 'z': round(lc[1], 1), 'h': h,
                          'r': round(math.sqrt(abs(poly_area(gp))) * 0.5, 1)})
    if t.get('brand') == 'Tim Hortons':
        extra = {'lm': 'tims'}; color = '#c0392b'; h = 5
        lc = centroid(gp)
        landmarks.append({'t': 'tims', 'x': round(lc[0], 1), 'z': round(lc[1], 1), 'h': h, 'r': 3})
        tims_done.append(lc)
    place_building(gp, h, color, btype, extra)

# Tim Hortons nodes without a building: small store near the node
cands = [g(rot(proj(nd['lat'], nd['lon']))) for nd in nodes_pt
         if nd.get('tags', {}).get('brand') == 'Tim Hortons' and inside(rot(proj(nd['lat'], nd['lon'])))]
for (x, z) in cands + TIMS_FALLBACK:
    if any(math.hypot(x - a, z - b) < 30 for a, b in tims_done):
        continue
    for attempt in range(30):
        ox = x + random.uniform(-14, 14); oz = z + random.uniform(-14, 14)
        sq = [(ox - 5, oz - 4), (ox + 5, oz - 4), (ox + 5, oz + 4), (ox - 5, oz + 4)]
        if fits(sq, 1.0):
            place_building(sq, 5, '#c0392b', 'retail', {'lm': 'tims'})
            landmarks.append({'t': 'tims', 'x': round(ox, 1), 'z': round(oz, 1), 'h': 5, 'r': 3})
            tims_done.append((ox, oz)); break

# Civic centre reflecting pool / rink
for w in ways:
    if w['tags'].get('name') == 'Markham Civic Centre Ice Rink':
        gp = area_polys(w)
        if gp:
            c = centroid(gp)
            gp = [(c[0] + (q[0] - c[0]) * 1.4, c[1] + (q[1] - c[1]) * 1.4) for q in gp]
            landmarks.append({'t': 'pool', 'p': [[round(a, 2), round(b, 2)] for a, b in gp]})

# ---------------------------------------------------------------- procedural houses
HOUSE_WALLS = ['#f4e3b1', '#f7f2e7', '#cfe3b0', '#f6d5c3', '#dbe7f5', '#f3dcae', '#e7d9f2', '#fde2e4']
HOUSE_ROOFS = ['#2f6b4f', '#7b2d26', '#3b4a6b', '#6b4f3a', '#4a5568', '#9a3412', '#335c67']
HERITAGE = {'Main St Unionville'}
houses = []
hgrid = Grid(16.0)

def try_house(cx, cz, ang, hw, hd, heritage=False):
    r = math.hypot(hw, hd) / 2
    if cx < -HALF_W + 6 or cx > HALF_W - 6 or cz < -HALF_H + 6 or cz > HALF_H - 6:
        return False
    if road_clear(cx, cz, r * 0.85) < 1.2:
        return False
    if in_water(cx, cz, r) or in_park(cx, cz):
        return False
    box = (cx - r, cz - r, cx + r, cz + r)
    for o in hgrid.query(box):
        if math.hypot(o['x'] - cx, o['z'] - cz) < (o['r'] + r) * 0.92:
            return False
    for o in occ.query(box):
        # overlap test against building bbox (cheap & conservative)
        xs = [q[0] for q in o['p']]; zs = [q[1] for q in o['p']]
        if min(xs) - r < cx < max(xs) + r and min(zs) - r < cz < max(zs) + r:
            return False
    hrec = {'x': round(cx, 2), 'z': round(cz, 2), 'r': r}
    hgrid.add(box, hrec)
    if heritage:
        wall = random.choice(['#f4e3b1', '#fde2e4', '#cfe3b0', '#dbe7f5', '#f6d5c3', '#ffffff'])
        roof = random.choice(['#2f6b4f', '#7b2d26', '#3b4a6b'])
        h = 4.4
    else:
        wall = random.choice(HOUSE_WALLS); roof = random.choice(HOUSE_ROOFS)
        h = 3.6 + random.choice([0, 0, 2.4])
    houses.append([round(cx, 2), round(cz, 2), round(ang, 3), round(hw, 1), round(hd, 1), round(h, 1),
                   HOUSE_WALLS.index(wall) if wall in HOUSE_WALLS else wall,
                   HOUSE_ROOFS.index(roof) if roof in HOUSE_ROOFS else roof])
    return True

for e in edges:
    cls, width, name = e[2], e[3], names[e[5]]
    heritage = name in HERITAGE
    if cls != 3 and not heritage:
        continue
    pts = e[6]
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        if L < 6:
            continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        nx, nz = -uz, ux
        step = 9.5 if heritage else 11.5
        k = 5.0
        while k < L - 4:
            for side in (1, -1):
                hw = random.uniform(7.0, 9.0); hd = random.uniform(6.5, 8.0)
                off = width / 2 + 2.6 + hd / 2 + random.uniform(0.5, 1.8)
                cx = ax + ux * k + nx * off * side
                cz = az + uz * k + nz * off * side
                ang = math.atan2(-nx * side, -nz * side)  # house front faces the road
                try_house(cx, cz, ang, hw, hd, heritage)
            k += step
print('houses:', len(houses), 'buildings:', len(buildings))

# ---------------------------------------------------------------- trees
trees = []
tgrid = Grid(20.0)
def add_tree(x, z, s):
    if road_clear(x, z, 1.5) < 0 or in_water(x, z, 1):
        return
    for o in occ.query((x - 2, z - 2, x + 2, z + 2)):
        xs = [q[0] for q in o['p']]; zs = [q[1] for q in o['p']]
        if min(xs) - 2 < x < max(xs) + 2 and min(zs) - 2 < z < max(zs) + 2:
            return
    for o in hgrid.query((x - 2, z - 2, x + 2, z + 2)):
        if math.hypot(o['x'] - x, o['z'] - z) < o['r'] + 1.5:
            return
    for o in tgrid.query((x - 3, z - 3, x + 3, z + 3)):
        if math.hypot(o[0] - x, o[1] - z) < 3.5:
            return
    rec = (round(x, 1), round(z, 1), round(s, 2))
    tgrid.add((x - 1, z - 1, x + 1, z + 1), rec)
    trees.append(list(rec))

# street trees along arterial edges
for e in edges:
    if e[2] > 2:
        continue
    pts = e[6]
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        if L < 10:
            continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        nx, nz = -uz, ux
        k = 6
        while k < L - 6:
            for side in (1, -1):
                off = e[3] / 2 + 4.5
                add_tree(ax + ux * k + nx * off * side, az + uz * k + nz * off * side, random.uniform(0.75, 0.95))
            k += 14
# parks
for p in parks:
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    area = abs(poly_area(p))
    n = int(min(area / 140, 60))
    for _ in range(n):
        x = random.uniform(min(xs), max(xs)); z = random.uniform(min(zs), max(zs))
        if point_in_poly(x, z, p):
            add_tree(x, z, random.uniform(0.8, 1.25))
# backyard trees among houses
for hrec in houses[::3]:
    x, z, ang = hrec[0], hrec[1], hrec[2]
    add_tree(x - math.sin(ang) * 9, z - math.cos(ang) * 9, random.uniform(0.7, 1.0))
print('trees:', len(trees))

# ---------------------------------------------------------------- spawn point: Hwy 7 x Kennedy
hwy7, ken = name_idx.get('Hwy 7'), name_idx.get('Kennedy Rd')
best = None
jn_names = defaultdict(set)
for e in edges:
    jn_names[e[0]].add(e[5]); jn_names[e[1]].add(e[5])
for j, ns_ in jn_names.items():
    if hwy7 in ns_ and ken in ns_:
        x, z = jnodes[j]
        if best is None or x + z > best[0] + best[1]:
            best = (x, z)
if best is None:
    best = (0, 0)
spawn = [round(best[0] + 16, 1), round(best[1] + 14, 1)]
print('spawn near Hwy7 x Kennedy:', best)

# ---------------------------------------------------------------- write
def r2(v):
    return round(v, 1)

out = {
    'v': 1,
    'scale': SCALE,
    'half': [round(HALF_W, 1), round(HALF_H, 1)],
    'rot': round(math.degrees(ANG), 2),
    'origin': {'lat0': LAT0, 'lon0': LON0, 'cx': round(CX, 1), 'cz': round(CZ, 1)},
    'spawn': spawn,
    'names': names,
    'nodes': [[r2(x), r2(z)] for x, z in jnodes],
    'edges': [[e[0], e[1], e[2], e[3], e[4], e[5], [[r2(x), r2(z)] for x, z in e[6]]] for e in edges],
    'busways': [[[r2(x), r2(z)] for x, z in b] for b in busways],
    'overpass': [[[r2(x), r2(z)] for x, z in b] for b in overpass],
    'rails': [[[r2(x), r2(z)] for x, z in b] for b in rails],
    'rivers': [[c, [[r2(x), r2(z)] for x, z in b]] for c, b in rivers],
    'water': tri_out(water),
    'parks': tri_out(parks),
    'lots': tri_out(lots),
    'buildings': [dict(b, t=[list(x) for x in earclip([tuple(q) for q in b['p']])]) for b in buildings],
    'houses': houses,
    'houseWalls': HOUSE_WALLS,
    'houseRoofs': HOUSE_ROOFS,
    'trees': trees,
    'landmarks': landmarks,
    'attribution': 'Map data (c) OpenStreetMap contributors, ODbL',
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
