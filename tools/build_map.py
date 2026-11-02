#!/usr/bin/env python3
"""Project 905 map builder.

Turns the raw OpenStreetMap export (data/raw/markham_osm.json.gz) into the
compact game map (maps/markham.json).

Steps: project to local metres -> rotate so the main road grid is axis aligned
("map north") -> clip to Woodbine..Markham Rd x Steeles..16th -> compress 40% ->
road graph (junctions + polylines) -> procedural houses -> OSM buildings ->
water / parks / rail / 407 overpass -> landmarks.

Usage: python3 tools/build_map.py
"""
import gzip, json, math, os, random, re, sys
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
xW = road_coord('Woodbine Avenue', 0)
xE = road_coord('Markham Road', 0)
zS = road_coord('Steeles Avenue East', 1)
zN = road_coord('16th Avenue', 1)
print('bounds real:', xW, xE, zN, zS)
X0, X1 = min(xW, xE) - MARGIN - 600.0, max(xW, xE) + MARGIN  # west strip keeps the plazas on both sides of Woodbine
Z0, Z1 = min(zN, zS) - MARGIN - 250.0, max(zN, zS) + MARGIN  # north strip keeps King Square (north of 16th)
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
# historic districts are tagged landuse=commercial but are not parking lots (no stalls / parked cars)
HERITAGE_AREAS = {'Historic Main Street Unionville'}
heritage_areas = []
# procedural houses only go where people actually live: never on business / school / church land (D-64)
NO_HOUSE_LANDUSE = {'commercial', 'retail', 'industrial', 'religious', 'construction', 'cemetery',
                    'farmland', 'brownfield', 'greenfield', 'recreation_ground'}
NO_HOUSE_AMENITY = {'school', 'college', 'university', 'hospital', 'place_of_worship', 'parking',
                    'community_centre', 'fire_station'}
NO_HOUSE_LEISURE = {'pitch', 'playground', 'sports_centre', 'track', 'golf_course'}
no_house = []
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
        if gp:
            (heritage_areas if t.get('name') in HERITAGE_AREAS else lots).append(gp)
    elif t.get('landuse') in ('grass', 'forest', 'meadow', 'cemetery'):
        gp = area_polys(w)
        if gp: parks.append(gp)
    if (t.get('landuse') in NO_HOUSE_LANDUSE or t.get('amenity') in NO_HOUSE_AMENITY
            or t.get('leisure') in NO_HOUSE_LEISURE):
        gp = area_polys(w)
        if gp: no_house.append(gp)
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

no_house_grid = Grid(30.0)
for p in no_house:
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    no_house_grid.add((min(xs), min(zs), max(xs), max(zs)), p)
def in_no_house(x, z):
    return any(point_in_poly(x, z, p) for p in no_house_grid.query((x, z, x, z)))

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

def segs_cross(a, b, c, d):
    o = lambda p, q, r: (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(c, d, a) * o(c, d, b) < 0 and o(a, b, c) * o(a, b, d) < 0

def polys_overlap(P, Q):
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        for j in range(len(Q)):
            if segs_cross(a, b, Q[j], Q[(j + 1) % len(Q)]):
                return True
    return point_in_poly(P[0][0], P[0][1], Q) or point_in_poly(Q[0][0], Q[0][1], P)

def fits(poly, pad=1.5, skip=None):
    for (x, z) in poly + [centroid(poly)]:
        if road_clear(x, z, pad) < 0:
            return False
    xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
    for o in occ.query((min(xs), min(zs), max(xs), max(zs))):
        if o is not skip and polys_overlap(poly, o['p']):
            return False
    return True

HERITAGE_MARGIN = 22.0   # game metres around a historic district that get storefronts
def in_heritage_zone(x, z):
    for p in heritage_areas:
        xs = [q[0] for q in p]; zs = [q[1] for q in p]
        if min(xs) - HERITAGE_MARGIN <= x <= max(xs) + HERITAGE_MARGIN and min(zs) - HERITAGE_MARGIN <= z <= max(zs) + HERITAGE_MARGIN:
            return True
    return False

TIMS_FALLBACK = []
osm_placed = []      # (building, OSM tags) for the v0.2 POI pass
poi_rejected = []    # (OSM tags, game centroid) of brand buildings that did not fit
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
    # every building sits on its own real footprint at map scale; landmarks stay oversized so they
    # read from afar. The grow pass below then lets buildings swell into the free space around them
    size_k = 0.72 if lm else SCALE
    c = centroid(p)
    gc = g(c)
    gp = [(gc[0] + (q[0] - c[0]) * size_k, gc[1] + (q[1] - c[1]) * size_k) for q in p]
    gp = ring_simplify(gp, 0.4)
    if len(gp) < 3 or abs(poly_area(gp)) < 14:
        continue
    ok = False
    for shrink in (1.0, 0.85, 0.7, 0.55):
        sp = [(gc[0] + (q[0] - gc[0]) * shrink, gc[1] + (q[1] - gc[1]) * shrink) for q in gp]
        if fits(sp, 1.0):
            ok = True; break
    if not ok:
        if t.get('brand') == 'Tim Hortons':
            TIMS_FALLBACK.append(gc)
        elif t.get('brand') or t.get('amenity') == 'fire_station':
            poi_rejected.append((t, gc))   # v0.2 POIs: placed near the OSM spot later if there is room
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
    elif (not lm and btype in ('retail', 'commercial', 'yes') and abs(poly_area(gp)) < 70
          and in_heritage_zone(*centroid(gp))):
        continue  # tiny shop boxes on a historic main street are replaced by procedural storefronts
    osm_placed.append((place_building(gp, h, color, btype, extra), t))

# toy proportions: true-scale footprints look tiny next to full-size cars and people, so each one
# grows around its centroid as far as BLD_GROW allows without touching a road or a neighbour (D-64)
BLD_GROW = (1.35, 1.2, 1.1)
for b, t in osm_placed:
    if b.get('lm'):
        continue
    P = b['p']; c = centroid(P)
    for k in BLD_GROW:
        sp = [(c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k) for x, z in P]
        gap = [(c[0] + (x - c[0]) * (k + 0.06), c[1] + (z - c[1]) * (k + 0.06)) for x, z in P]
        if fits(gap, 1.0, skip=b):
            b['p'] = [[round(x, 2), round(z, 2)] for x, z in sp]
            occ.add((min(q[0] for q in sp), min(q[1] for q in sp), max(q[0] for q in sp), max(q[1] for q in sp)), b)
            break

# ---------------------------------------------------------------- v0.1 landmark / prop placement helpers
prng = random.Random(9050)   # own RNG so landmark/prop tweaks do not reshuffle the rest of the map

def bbox_of(poly):
    xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
    return (min(xs), min(zs), max(xs), max(zs))

def rect_poly(cx, cz, ang, w, d):
    """oriented rectangle; same convention as houses: local +z is the front, which faces (sin ang, cos ang)"""
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + c * lx + s * lz, cz - s * lx + c * lz)
            for lx, lz in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]

def r2p(poly):
    return [(round(x, 2), round(z, 2)) for x, z in poly]

def grow(poly, pad):
    """push the corners of a convex footprint outwards by ~pad metres"""
    c = centroid(poly); out = []
    for x, z in poly:
        dx, dz = x - c[0], z - c[1]; L = math.hypot(dx, dz) or 1
        out.append((x + dx / L * pad * 1.42, z + dz / L * pad * 1.42))
    return out

def occ_free(poly, pad=0.0):
    pp = grow(poly, pad) if pad else poly
    for o in occ.query(bbox_of(pp)):
        if polys_overlap(pp, o['p']):
            return False
    return True

def reserve(poly):
    """mark a footprint as taken so later buildings / houses / trees / props avoid it"""
    rec = {'p': [list(q) for q in poly]}
    occ.add(bbox_of(poly), rec)
    return rec

def line_dist(x, z, lines, reach=60):
    best = 1e9
    for pts in lines:
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            if min(ax, bx) - reach < x < max(ax, bx) + reach and min(az, bz) - reach < z < max(az, bz) + reach:
                best = min(best, seg_dist(x, z, ax, az, bx, bz))
    return best

river_grid = Grid(30.0)
for big, pts in rivers:
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        river_grid.add((min(ax, bx) - 5, min(az, bz) - 5, max(ax, bx) + 5, max(az, bz) + 5), (ax, az, bx, bz, 4.5 if big else 1.75))

def river_clear(x, z):
    """distance to the nearest river / stream bank (rivers are drawn as ribbons)"""
    best = 1e9
    for (ax, az, bx, bz, hw) in river_grid.query((x - 12, z - 12, x + 12, z + 12)):
        best = min(best, seg_dist(x, z, ax, az, bx, bz) - hw)
    return best

def water_dist(x, z, reach=80, seg=False):
    """distance to the nearest lake/pond shoreline (negative inside water) and that shore point
    (+ the shoreline direction when seg=True)"""
    best, bp, bd = 1e9, None, None
    for p in water_grid.query((x - reach, z - reach, x + reach, z + reach)):
        for i in range(len(p)):
            (ax, az), (bx, bz) = p[i], p[(i + 1) % len(p)]
            d = seg_dist(x, z, ax, az, bx, bz)
            if d < best:
                dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
                t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
                best, bp, bd = d, (ax + dx * t, az + dz * t), (dx / math.sqrt(L2), dz / math.sqrt(L2))
    wd = -best if in_water(x, z) else best
    return (wd, bp, bd) if seg else (wd, bp)

def spot_ok(poly, road_pad=1.0, occ_pad=0.6, allow_park=True, keep_off=4.0):
    """footprint is on dry land inside the map, off roads / busways / rails / overpass and free of buildings"""
    c = centroid(poly)
    samples = list(poly) + [c] + [((poly[i][0] + poly[(i + 1) % len(poly)][0]) / 2,
                                   (poly[i][1] + poly[(i + 1) % len(poly)][1]) / 2) for i in range(len(poly))]
    for (x, z) in samples:
        if abs(x) > HALF_W - 8 or abs(z) > HALF_H - 8:
            return False
        if road_clear(x, z, road_pad) < 0 or in_water(x, z, 2) or river_clear(x, z) < 1.0:
            return False
        if not allow_park and in_park(x, z):
            return False
    rad = max(math.hypot(x - c[0], z - c[1]) for x, z in poly)
    if line_dist(c[0], c[1], busways) < rad + 3.25 + keep_off * 0.25 or line_dist(c[0], c[1], rails) < rad + 3 \
            or line_dist(c[0], c[1], overpass) < rad + 6:
        return False
    return occ_free(poly, occ_pad)

def nearest_road(x, z, R=45):
    """(distance to road surface, closest centreline point, segment direction) of the nearest drivable road"""
    best = None
    for (ax, az, bx, bz, hw) in road_grid.query((x - R, z - R, x + R, z + R)):
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t
        d = math.hypot(x - px, z - pz) - hw
        if best is None or d < best[0]:
            L = math.sqrt(L2) or 1
            best = (d, px, pz, dx / L, dz / L)
    return best

def facing_road(x, z, nr):
    """house-style angle whose front (local +z) faces the road nr, squared to the road direction"""
    _, px, pz, ux, uz = nr
    nx, nz = -uz, ux
    if nx * (px - x) + nz * (pz - z) < 0:
        nx, nz = -nx, -nz
    return math.atan2(nx, nz)

# ---------------------------------------------------------------- Tim Hortz: one per real Tim Hortons
def tims_host(x, z, max_area, near=2.5):
    """a small ordinary building that contains (or touches) the store's OSM point"""
    best = None
    for b in occ.query((x - near, z - near, x + near, z + near)):
        if 'k' not in b or b.get('lm') or b['k'] in ('church', 'school', 'house', 'apartments', 'hotel', 'bridge'):
            continue
        p = b['p']
        dist = 0 if point_in_poly(x, z, p) else min(
            seg_dist(x, z, p[i][0], p[i][1], p[(i + 1) % len(p)][0], p[(i + 1) % len(p)][1]) for i in range(len(p)))
        if dist <= near and abs(poly_area(p)) <= max_area and (best is None or dist < best[0]):
            best = (dist, b)
    return best[1] if best else None

# the camera always looks from the same direction (js/config.js camera.azimuth / elevation)
CAM_DIR = (math.sin(0.55), math.cos(0.55))
CAM_SLOPE = 0.85  # flatter than tan(elevation): rays to the upper part of the screen are flatter

def hidden_from_camera(x, z, top):
    """is a rooftop prop at height `top` hidden behind a taller building on the camera side?"""
    for d in range(2, 42, 2):
        px, pz = x + CAM_DIR[0] * d, z + CAM_DIR[1] * d
        for b in occ.query((px, pz, px, pz)):
            if b.get('h', 0) > top + d * CAM_SLOPE and point_in_poly(px, pz, b['p']):
                return True
    return False

def tims_spot(x, z, rmax):
    """search rings around the OSM point for a free store footprint facing the nearest road"""
    best = None
    for (w, d) in ((10.0, 8.0), (9.0, 7.0), (8.0, 6.5)):
        first = None
        for r in [0] + list(range(3, rmax + 1, 3)):
            if first is not None and r > first + 9:
                break
            n = 1 if r == 0 else max(8, int(2 * math.pi * r / 3.5))
            for k in range(n):
                a = 2 * math.pi * k / n
                cx, cz = x + math.cos(a) * r, z + math.sin(a) * r
                nr = nearest_road(cx, cz)
                if nr is None:
                    continue
                poly = rect_poly(cx, cz, facing_road(cx, cz, nr), w, d)
                if not spot_ok(poly, road_pad=1.2, occ_pad=1.0):
                    continue
                # close to the real store, with street frontage, not in a park, visible from the camera
                score = r + max(0, nr[0] - d / 2 - 12) * 1.5 + (12 if in_park(cx, cz) else 0) \
                    + (25 if hidden_from_camera(cx, cz, 7) else 0)
                if best is None or score < best[0]:
                    best = (score, cx, cz, poly)
                if first is None:
                    first = r
        if best:
            return best
    return None

def add_tims_landmark(poly, h=5):
    lc = centroid(poly)
    landmarks.append({'t': 'tims', 'x': round(lc[0], 1), 'z': round(lc[1], 1), 'h': h,
                      'r': round(max(3.0, math.sqrt(abs(poly_area(poly))) * 0.5), 1)})
    tims_done.append(lc)

tims_pts = []
for e in els:
    t = e.get('tags', {})
    if t.get('brand') != 'Tim Hortons' or 'building' in t:
        continue   # buildings tagged with the brand were handled in the building loop
    if e['type'] == 'node':
        rp = rot(proj(e['lat'], e['lon']))
    elif e['type'] == 'way' and e.get('geometry'):
        q = [rot(proj(gm['lat'], gm['lon'])) for gm in e['geometry']]
        rp = (sum(a for a, _ in q) / len(q), sum(b for _, b in q) / len(q))
    else:
        continue
    if inside(rp):
        tims_pts.append(g(rp))
tims_report = []
for (x, z) in tims_pts + TIMS_FALLBACK:
    if any(math.hypot(x - a, z - b) < 30 for a, b in tims_done):
        continue
    # the store's own building (or the small plaza it sits in) is the most faithful spot
    host = tims_host(x, z, 450)
    spot = None if host else tims_spot(x, z, 32)
    if not host:
        # a bigger building at the point beats a free lot spot that the camera cannot see
        big = tims_host(x, z, 700, near=6)
        if big and (not spot or (hidden_from_camera(spot[1], spot[2], 7)
                                 and not hidden_from_camera(*centroid(big['p']), 7))):
            host, spot = big, None
    if not host and not spot:
        spot = tims_spot(x, z, 75)
    if host:
        host['lm'] = 'tims'; host['c'] = '#c0392b'; host['h'] = 5
        add_tims_landmark(host['p']); tims_report.append(('host', round(x), round(z)))
    elif spot:
        poly = r2p(spot[3])
        place_building(poly, 5, '#c0392b', 'retail', {'lm': 'tims'})
        add_tims_landmark(poly); tims_report.append(('store %.0fm away' % math.hypot(spot[1] - x, spot[2] - z), round(x), round(z)))
    else:
        tims_report.append(('FAILED', round(x), round(z)))
print('tim hortz:', len(tims_done), tims_report)

# Civic centre reflecting pool / rink
for w in ways:
    if w['tags'].get('name') == 'Markham Civic Centre Ice Rink':
        gp = area_polys(w)
        if gp:
            c = centroid(gp)
            gp = [(c[0] + (q[0] - c[0]) * 1.4, c[1] + (q[1] - c[1]) * 1.4) for q in gp]
            landmarks.append({'t': 'pool', 'p': [[round(a, 2), round(b, 2)] for a, b in gp]})

def osm_point(e):
    if e['type'] == 'node':
        return g(rot(proj(e['lat'], e['lon'])))
    if e.get('geometry'):
        q = [g(rot(proj(gm['lat'], gm['lon']))) for gm in e['geometry']]
        return (sum(a for a, _ in q) / len(q), sum(b for _, b in q) / len(q))
    return None

def named(name):
    for e in els:
        if e.get('tags', {}).get('name') == name:
            p = osm_point(e)
            if p and abs(p[0]) < HALF_W and abs(p[1]) < HALF_H:
                return p
    return None

# busway corridors are kept free of trees / houses / props
for pts in busways:
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        if L > 0.5:
            reserve(rect_poly((ax + bx) / 2, (az + bz) / 2, math.atan2(bx - ax, bz - az), 6.6, L + 1.0))

# ---------------------------------------------------------------- Unionville Main St: heritage storefront row
HERITAGE_WALLS = ['#c0533a', '#e8b84a', '#9cc59a', '#8ec5e6', '#f4e3b1', '#f2a7b8', '#f7f2e7', '#5fb3a8', '#d98c5f', '#b9a3e3']
HERITAGE_AWNINGS = ['#e11d48', '#2f6b4f', '#1e3a8a', '#f59e0b', '#7c2d12', '#0e7490']
shops = []   # [x, z, ang, w, d, h, wall, awning, style(0 gable / 1 false front)]
HERITAGE_EDGE_NAMES = {'Main St Unionville'}
for e in edges:
    if names[e[5]] not in HERITAGE_EDGE_NAMES:
        continue
    pts, width = e[6], e[3]
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        if L < 8:
            continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        nx, nz = -uz, ux
        for side in (1, -1):
            k, last = 1.5, -1
            while k < L - 6:
                w = prng.uniform(6.2, 7.8); d = prng.uniform(7.0, 8.4)
                if k + w > L - 1:
                    break
                fx, fz = ax + ux * (k + w / 2), az + uz * (k + w / 2)
                if not in_heritage_zone(fx, fz):
                    k += 3; continue
                off = width / 2 + 1.9 + 0.6 + d / 2
                cx, cz = fx + nx * off * side, fz + nz * off * side
                ang = math.atan2(-nx * side, -nz * side)
                poly = rect_poly(cx, cz, ang, w, d)
                if not spot_ok(poly, road_pad=0.4, occ_pad=0.15, allow_park=False):
                    k += 2.0; continue
                wall = prng.choice([i for i in range(len(HERITAGE_WALLS)) if i != last])
                last = wall
                style = 1 if prng.random() < 0.4 else 0
                h = prng.uniform(6.0, 7.2) if style else prng.uniform(4.8, 5.6)
                shops.append([round(cx, 2), round(cz, 2), round(ang, 3), round(w, 1), round(d, 1), round(h, 1),
                                 wall, prng.randrange(len(HERITAGE_AWNINGS)), style])
                reserve(poly)
                k += w + prng.uniform(0.3, 0.9)
print('heritage storefronts:', len(shops))
if shops:
    # "Unionville 老街 Main St" sign on the false-front storefront closest to the middle of the street
    mx = sum(h[0] for h in shops) / len(shops); mz = sum(h[1] for h in shops) / len(shops)
    host = min(shops, key=lambda h: math.hypot(h[0] - mx, h[1] - mz) + (0 if h[8] else 40))
    host[8] = 1; host[5] = max(host[5], 6.6)
    landmarks.append({'t': 'unionville', 'x': host[0], 'z': host[1], 'h': host[5], 'a': host[2]})

# ---------------------------------------------------------------- Toogood Pond: gazebo on the shore + lookout dock
gz = named('Toogood Pond Gazebo')
if gz:
    x, z = gz
    wd, shore = water_dist(x, z)
    if shore and wd > 9:
        # the compressed shoreline sits far from the mapped point: walk the gazebo down to ~6 m from the water
        best = None
        for t in range(0, 101, 2):
            px, pz = x + (shore[0] - x) * t / 100, z + (shore[1] - z) * t / 100
            d2, _ = water_dist(px, pz)
            ok = d2 >= 5.5 and spot_ok(rect_poly(px, pz, 0, 7.4, 7.4), road_pad=2, occ_pad=0.5, keep_off=0)
            if ok:
                best = (px, pz)
            if d2 < 6.5:
                break
        if best:
            x, z = best
    if water_dist(x, z)[0] > 3.6:
        landmarks.append({'t': 'gazebo', 'x': round(x, 1), 'z': round(z, 1), 'r': 3.3})
        reserve(rect_poly(x, z, 0, 7.4, 7.4))
lk = named('Toogood Pond Lookout Platform')
if lk:
    wd, shore, sdir = water_dist(lk[0], lk[1], seg=True)
    if shore and abs(wd) < 12:
        # point the dock from the shore into the pond, as square to the shoreline as the water allows
        nx, nz = -sdir[1], sdir[0]
        if not in_water(shore[0] + nx * 1.5, shore[1] + nz * 1.5):
            nx, nz = -nx, -nz
        a0 = math.atan2(nx, nz)
        best = None
        for k in range(-6, 7):
            a = a0 + k * math.radians(6)
            ux, uz = math.sin(a), math.cos(a)
            wet = sum(1 for s in range(1, 10) if in_water(shore[0] + ux * s, shore[1] + uz * s))
            dry = sum(1 for s in range(1, 4) if not in_water(shore[0] - ux * s, shore[1] - uz * s))
            score = wet * 2 + dry - abs(k) * 0.5
            if best is None or score > best[0]:
                best = (score, a)
        a = best[1]
        ux, uz = math.sin(a), math.cos(a)
        L = 2.0 + sum(1 for s in range(1, 9) if in_water(shore[0] + ux * s, shore[1] + uz * s))
        rx, rz = shore[0] - ux * 2.0, shore[1] - uz * 2.0   # land end
        landmarks.append({'t': 'dock', 'x': round(rx, 2), 'z': round(rz, 2), 'a': round(a, 3), 'L': round(min(L, 9.0), 1), 'w': 2.6})
        reserve(rect_poly(rx + ux * 1.5, rz + uz * 1.5, a, 3.4, 4.0))

# ---------------------------------------------------------------- Downtown Markham: cinema + a cluster of towers
cin = None
for e in els:
    t = e.get('tags', {})
    if t.get('amenity') == 'cinema':
        p = osm_point(e)
        if p and abs(p[0]) < HALF_W and abs(p[1]) < HALF_H:
            cin = p; break
if cin:
    best = None
    for b in occ.query((cin[0] - 25, cin[1] - 25, cin[0] + 25, cin[1] + 25)):
        if 'k' not in b or b.get('lm') or abs(poly_area(b['p'])) < 150:
            continue
        p = b['p']
        dist = 0 if point_in_poly(cin[0], cin[1], p) else min(
            seg_dist(cin[0], cin[1], p[i][0], p[i][1], p[(i + 1) % len(p)][0], p[(i + 1) % len(p)][1]) for i in range(len(p)))
        if best is None or dist < best[0]:
            best = (dist, b)
    if best and best[0] < 25:
        b = best[1]
        b['lm'] = 'cinema'; b['c'] = '#6d78e0'; b['h'] = max(b['h'], 14)
        lc = centroid(b['p'])
        landmarks.append({'t': 'cinema', 'x': round(lc[0], 1), 'z': round(lc[1], 1), 'h': b['h'],
                          'r': round(math.sqrt(abs(poly_area(b['p']))) * 0.5, 1)})
    # the tall OSM buildings around the cinema define the downtown core
    tall = [(centroid(b['p']), b['h']) for b in buildings if b['h'] >= 20]
    tall = [(c, h) for c, h in tall if math.hypot(c[0] - cin[0], c[1] - cin[1]) < 240]
    if tall:
        dx = sum(c[0] * h for c, h in tall) / sum(h for _, h in tall)
        dz = sum(c[1] * h for c, h in tall) / sum(h for _, h in tall)
    else:
        dx, dz = cin
    TOWER_COLS = ['#bcd7e6', '#c7d2fe', '#cbd5e1', '#d5e8d4', '#e2d6c7', '#a5c8e4', '#dbe4f0']
    tall_pts = [c for c, _ in tall]
    def downtown_ground(x, z):
        """towers go on commercial land (parking lots) or right next to the existing high-rises"""
        if any(math.hypot(x - c[0], z - c[1]) < 55 for c in tall_pts):
            return True
        return any(point_in_poly(x, z, p) for p in lots
                   if bbox_of(p)[0] <= x <= bbox_of(p)[2] and bbox_of(p)[1] <= z <= bbox_of(p)[3])
    cands = []
    for ix in range(-24, 25):
        for iz in range(-24, 25):
            x, z = dx + ix * 6, dz + iz * 6
            r = math.hypot(x - dx, z - dz)
            if r < 140:
                cands.append((r + prng.uniform(0, 14), x, z))
    cands.sort()
    towers = 0
    for _, x, z in cands:
        if towers >= 8:
            break
        if not downtown_ground(x, z):
            continue
        w, d = prng.choice((14, 16, 18)), prng.choice((14, 16, 18))
        # axis aligned like the (rotated) arterial grid
        if not spot_ok(rect_poly(x, z, 0, w + 4, d + 4), road_pad=2.5, occ_pad=2.5, allow_park=False):
            continue
        h = prng.choice((26, 30, 34, 38, 42, 46))
        place_building(r2p(rect_poly(x, z, 0, w, d)), h, prng.choice(TOWER_COLS), 'tower')
        towers += 1
    # landmark point = centre of the finished high-rise cluster (OSM + procedural towers)
    tall = [(centroid(b['p']), b['h']) for b in buildings if b['h'] >= 20]
    tall = [(c, h) for c, h in tall if math.hypot(c[0] - dx, c[1] - dz) < 200]
    if tall:
        dx = sum(c[0] * h for c, h in tall) / sum(h for _, h in tall)
        dz = sum(c[1] * h for c, h in tall) / sum(h for _, h in tall)
    landmarks.append({'t': 'downtown', 'x': round(dx, 1), 'z': round(dz, 1)})
    print('downtown towers added:', towers, 'cluster centre', round(dx), round(dz))

# ---------------------------------------------------------------- Viva rapidway stations + bus stops
def lane_clear(x, z):
    """distance from a point to the nearest car lane path (one-way: centre, two-way: +-w/4)"""
    best = 1e9
    for (ax, az, bx, bz, hw) in road_grid.query((x - 16, z - 16, x + 16, z + 16)):
        dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        ux, uz = dx / L, dz / L
        t = (x - ax) * ux + (z - az) * uz
        s = (x - ax) * -uz + (z - az) * ux
        lanes = (0.0,) if seg_oneway.get((ax, az, bx, bz)) else (-hw / 2, hw / 2)
        for o in lanes:
            if t < 0:
                d = math.hypot(x - (ax - uz * o), z - (az + ux * o))
            elif t > L:
                d = math.hypot(x - (bx - uz * o), z - (bz + ux * o))
            else:
                d = abs(s - o)
            best = min(best, d)
    return best
seg_oneway = {}
for e in edges:
    for (ax, az), (bx, bz) in zip(e[6], e[6][1:]):
        seg_oneway[(ax, az, bx, bz)] = e[4]
jdeg = defaultdict(int)
for e in edges:
    jdeg[e[0]] += 1; jdeg[e[1]] += 1
junctions = [jnodes[i] for i, dg in jdeg.items() if dg >= 3]

def island_ok(cx, cz, ux, uz, L, hw=0.35):
    """a median platform between the two bus lanes: clear of car lanes, junctions, water and buildings"""
    nx, nz = -uz, ux
    for k in range(0, 9):
        a = -L / 2 + L * k / 8
        for o in (-hw, hw):
            x, z = cx + ux * a + nx * o, cz + uz * a + nz * o
            if lane_clear(x, z) < 1.45 or in_water(x, z, 2) or river_clear(x, z) < 2:
                return False
            if abs(x) > HALF_W - 8 or abs(z) > HALF_H - 8:
                return False
    if min((math.hypot(jx - cx, jz - cz) for jx, jz in junctions), default=1e9) < L / 2 + 9:
        return False
    for o in occ.query((cx - L, cz - L, cx + L, cz + L)):
        if 'k' in o and polys_overlap(rect_poly(cx, cz, math.atan2(ux, uz), 0.8, L), o['p']):
            return False
    return True

stations = []
VIVA_LEN = 16.0
# anchors: OSM platforms on the busway, then arterial junctions next to it
anchors = []
for nd in nodes_pt:
    t = nd.get('tags', {})
    if t.get('public_transport') == 'platform' or t.get('highway') == 'bus_stop':
        p = osm_point(nd)
        if p and line_dist(p[0], p[1], busways, 20) < 9:
            anchors.append((0, p))
jcls = defaultdict(list)
for e in edges:
    jcls[e[0]].append(e[2]); jcls[e[1]].append(e[2])
for i, cl in jcls.items():
    if len(cl) >= 3 and sum(1 for c in cl if c <= 2) >= 2:
        p = jnodes[i]
        if line_dist(p[0], p[1], busways, 50) < 40:
            anchors.append((1 + min(cl), p))
anchors.sort(key=lambda a: a[0])
for pri, (axx, azz) in anchors:
    if any(math.hypot(s['x'] - axx, s['z'] - azz) < 110 for s in stations):
        continue
    best = None
    for pts in busways:
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            L = math.hypot(bx - ax, bz - az)
            if L < VIVA_LEN + 1:
                continue
            ux, uz = (bx - ax) / L, (bz - az) / L
            s = VIVA_LEN / 2 + 0.5
            while s <= L - VIVA_LEN / 2 - 0.5:
                cx, cz = ax + ux * s, az + uz * s
                da = math.hypot(cx - axx, cz - azz)
                if da < 70:
                    score = abs(da - (6 if pri == 0 else 24))
                    if (best is None or score < best[0]) and island_ok(cx, cz, ux, uz, VIVA_LEN):
                        best = (score, cx, cz, ux, uz)
                s += 2
    if best and all(math.hypot(st['x'] - best[1], st['z'] - best[2]) > 110 for st in stations):
        _, cx, cz, ux, uz = best
        stations.append({'t': 'viva', 'x': round(cx, 2), 'z': round(cz, 2), 'a': round(math.atan2(ux, uz), 4), 'L': VIVA_LEN, 'kind': 'median'})
        reserve(rect_poly(cx, cz, math.atan2(ux, uz), 3.6, VIVA_LEN + 1))

# curbside stops: Viva platforms on mixed-traffic roads get a blue shelter, other bus stops a small shelter / bench
stops = []   # [x, z, ang, kind] kind: 0 bench + pole, 1 small shelter, 2 viva curbside shelter
seen_stops = []
for nd in nodes_pt:
    t = nd.get('tags', {})
    if not (t.get('highway') == 'bus_stop' or t.get('public_transport') == 'platform'):
        continue
    p = osm_point(nd)
    if not p or abs(p[0]) > HALF_W - 10 or abs(p[1]) > HALF_H - 10:
        continue
    if line_dist(p[0], p[1], busways, 20) < 9 or any(math.hypot(p[0] - a, p[1] - b) < 9 for a, b in seen_stops):
        continue
    viva = 'VIVA' in (t.get('network', '') + t.get('operator', '')).upper()
    kind = 2 if viva else (1 if t.get('shelter') == 'yes' else 0)
    # snap to the back of the sidewalk of the road the stop belongs to
    best = None
    for (ax, az, bx, bz, hw) in road_grid.query((p[0] - 14, p[1] - 14, p[0] + 14, p[1] + 14)):
        d = seg_dist(p[0], p[1], ax, az, bx, bz)
        if d < 14 and (best is None or d < best[0]):
            best = (d, ax, az, bx, bz, hw)
    if not best:
        continue
    _, ax, az, bx, bz, hw = best
    L = math.hypot(bx - ax, bz - az) or 1
    ux, uz = (bx - ax) / L, (bz - az) / L
    nx, nz = -uz, ux
    t0 = max(0.0, min(L, (p[0] - ax) * ux + (p[1] - az) * uz))
    side = 1 if (p[0] - ax) * nx + (p[1] - az) * nz >= 0 else -1
    depth = 1.8 if kind else 1.0
    placed = False
    for shift in (0, 3, -3, 6, -6, 9, -9):
        tt = t0 + shift
        if tt < 4 or tt > L - 4:
            continue
        off = hw + 1.9 + 0.45 + depth / 2
        cx, cz = ax + ux * tt + nx * off * side, az + uz * tt + nz * off * side
        ang = math.atan2(-nx * side, -nz * side)   # front (bench side) faces the road
        poly = rect_poly(cx, cz, ang, 6.0 if kind == 2 else 4.2, depth)
        if spot_ok(poly, road_pad=0.3, occ_pad=0.3, keep_off=0):
            stops.append([round(cx, 2), round(cz, 2), round(ang, 3), kind])
            reserve(poly); seen_stops.append(p); placed = True
            break
print('viva stations:', len(stations), 'bus stops:', len(stops), '(viva curbside: %d)' % sum(1 for s in stops if s[3] == 2))
landmarks.extend(stations)

# ---------------------------------------------------------------- v0.2 POIs: gas stations, brands, categorised buildings
# Content red line: real brands never appear in the game, each one gets a pun.
# real brand (OSM `brand`, or a word of the name for car dealers) -> (category, game name, style key)
BRANDS = {
    'Petro-Canada': ('gas', 'Petro-Kanada', 'petro'),
    'Circle K': ('gas', 'Circle Q', 'circleq'),
    'Esso': ('gas', 'Ezzo', 'ezzo'),
    'Shell': ('gas', 'Shel', 'shel'),
    'Husky': ('gas', 'Huskee', 'huskee'),
    'Pioneer': ('gas', 'Pioneir', 'pioneir'),
    'Global': ('gas', 'Globle Gas', 'globle'),
    'Petro': ('gas', 'Petro-Kanada', 'petro'),
    'Canadian Tire Gas': ('gas', 'Canadian Tyre Gas', 'tyre'),
    '_fuel': ('gas', '加油站 Gas', 'gasgen'),        # unbranded / small chains
    "McDonald's": ('fast', "McDanold's", 'mcd'),
    'Boston Pizza': ('fast', 'Bostin Pizza', 'bpizza'),
    'Swiss Chalet': ('fast', 'Swiss Chalay', 'chalay'),
    'No Frills': ('grocer', 'No Thrills', 'nothrills'),
    'Loblaws': ('grocer', 'Loblawz', 'loblawz'),
    'FreshCo': ('grocer', 'FreshGo', 'freshgo'),
    'Walmart': ('bigbox', 'Wallmort', 'wallmort'),
    'Costco': ('bigbox', 'Costgo', 'costgo'),
    'The Home Depot': ('bigbox', 'Home Deepot', 'deepot'),
    'Canadian Tire': ('bigbox', 'Canadian Tyre', 'tyre'),
    'Rona': ('bigbox', 'Rhona', 'rhona'),
    'Rona+': ('bigbox', 'Rhona', 'rhona'),
    'Shoppers Drug Mart': ('shop', 'Shoppers Drug Mark', 'shoppers'),
    'LCBO': ('shop', 'LCB0', 'lcb0'),
    'Staples': ('shop', 'Stables', 'stables'),
    'Canada Computers': ('shop', 'Canada Komputers', 'kompu'),
    'Winners': ('shop', 'Winnerz', 'winnerz'),
    'RBC': ('bank', 'RBG', 'rbg'),
    'TD': ('bank', 'TB Bank', 'tb'),
    'TD Canada Trust': ('bank', 'TB Bank', 'tb'),
    'BMO': ('bank', 'BNO', 'bno'),
    'CIBC': ('bank', 'CIBS', 'cibs'),
    'HSBC': ('bank', 'HSBB', 'hsbb'),
    'Scotiabank': ('bank', 'Scotchiabank', 'scotchia'),
    'Hilton': ('hotel', 'Hiltun Suites', 'hiltun'),
    'Courtyard': ('hotel', 'Courtyerd', 'hotel'),
    'Monte Carlo Inn': ('hotel', 'Monte Carla Inn', 'hotel'),
    'YMCA': ('cc', 'YNCA', 'ymca'),
}
DEALERS = {   # word in the dealer's brand / name -> pun
    'Toyota': 'Toyoda', 'Honda': 'Hondo', 'Kia': 'Kio', 'Mazda': 'Mazba', 'Mercedes-Benz': 'Mercedez',
    'BMW': 'BMV', 'Audi': 'Oudi', 'Volvo': 'Volvu', 'Infiniti': 'Infinitty', 'Ford': 'Forb',
    'Cadillac': 'Cadillak', 'Chevrolet': 'Chevvy', 'Porsche': 'Porshe', 'Subaru': 'Subaro',
    'Lexus': 'Lexxus', 'Nissan': 'Nissun', 'Hyundai': 'Hyundoi', 'Acura': 'Akura',
}
DEALER_PLACES = ('Markham', 'Unionville', 'Uptown', 'Markville', 'Agincourt')
NAMED = {     # well-known names (real place names may stay; shops and malls get a pun)
    'New Kennedy Square': ('plaza', 'New Kennedy Sqare', 'plaza'),
    '朗豪坊 Langham Square': ('plaza', '朗好坊 Langhum Square', 'plaza'),
    'Market Village': ('plaza', 'Markit Village', 'plaza'),
    'Splendid China Mall': ('plaza', '华丽中国 Splendid Chyna Mall', 'plaza'),
    'J-Town': ('plaza', '日夲城 J-Toun', 'plaza'),
    'First Markham Place': ('plaza', '万景广场 First Markum Place', 'plaza'),
    '王府井': ('plaza', '王府景 Kingz Square', 'plaza'),
    'Metro Square': ('plaza', '大都汇广场 Metroh Square', 'plaza'),
    'Sherwood Plaza': ('plaza', 'Sherwud Plaza', 'plaza'),
    '冠業超市 First Choice Supermarket': ('grocer', '冠叶超市 First Choyce', 'firstchoyce'),
    'Village Grocer': ('grocer', 'Village Grosser', 'vgrocer'),
    'Flato Markham Theatre': ('theatre', '万锦剧院 Markham Theatre', 'theatre'),
    'Varley Art Gallery of Markham': ('gallery', 'Varley 美术馆 Gallery', 'gallery'),
    'Markham Pan Am Centre': ('cc', 'Pan Yam Centre 游泳馆', 'panyam'),
    'IBM Toronto Lab': ('office', 'IBN Lab', 'office'),
}
SCHOOL_SHORT = [(' High School', ' H.S.'), (' Secondary School', ' S.S.'), (' Public School', ' P.S.'),
                (' Montessori School,', ' Montessori'), (' Montessori School', ' Montessori')]
POI_LOOK = {   # category -> (wall colour or None to keep, height rule)
    'gas': '#f8fafc', 'dealer': '#eef4f8', 'fast': '#d93b30', 'grocer': '#f3ead8', 'bigbox': '#e9e4da',
    'plaza': '#f6e7cf', 'church': None, 'temple': '#f7e1b5', 'school': '#cf7a55', 'cc': '#e3f1ee',
    'library': '#efe3c8', 'fire': '#d64541', 'police': '#dbe4f0', 'bank': '#eef2f7',
}
CHURCH_WALLS = ['#f5f0e6', '#c9765b', '#e6d7bd', '#f2e6d0']
poirng = random.Random(9052)   # own RNG: POI tweaks never reshuffle the rest of the map

art_grid = Grid(24.0)
for e in edges:
    if e[2] > 2:
        continue
    for (ax, az), (bx, bz) in zip(e[6], e[6][1:]):
        hw = e[3] / 2
        art_grid.add((min(ax, bx) - hw, min(az, bz) - hw, max(ax, bx) + hw, max(az, bz) + hw), (ax, az, bx, bz, hw))
art_junctions = [jnodes[i] for i, cl in jcls.items() if len(cl) >= 3 and sum(1 for c in cl if c <= 2) >= 2]

def nearest_art(x, z, R=45):
    """like nearest_road, arterials (class <= 2) only"""
    best = None
    for (ax, az, bx, bz, hw) in art_grid.query((x - R, z - R, x + R, z + R)):
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t
        d = math.hypot(x - px, z - pz) - hw
        if best is None or d < best[0]:
            L = math.sqrt(L2) or 1
            best = (d, px, pz, dx / L, dz / L)
    return best

def poi_set(b, cat, name=None, style=None):
    b['poi'] = cat
    if name:
        b['n'] = name
    if style:
        b['s'] = style
    col = POI_LOOK.get(cat)
    if col:
        b['c'] = col
    elif cat == 'church':
        b['c'] = poirng.choice(CHURCH_WALLS)

def poi_spot(x, z, sizes, rmax, road_pad=1.2, occ_pad=1.0):
    """free footprint (facing the nearest road) as close as possible to the OSM spot"""
    for (w, d) in sizes:
        best = None
        for r in [0] + list(range(3, rmax + 1, 3)):
            n = 1 if r == 0 else max(8, int(2 * math.pi * r / 3.5))
            for k in range(n):
                a = 2 * math.pi * k / n
                cx, cz = x + math.cos(a) * r, z + math.sin(a) * r
                nr = nearest_road(cx, cz)
                if nr is None:
                    continue
                score = r + max(0, nr[0] - d / 2 - 10) * 1.5 + (12 if in_park(cx, cz) else 0)
                if best is not None and score >= best[0]:
                    continue
                poly = rect_poly(cx, cz, facing_road(cx, cz, nr), w, d)
                if not spot_ok(poly, road_pad=road_pad, occ_pad=occ_pad):
                    continue
                if hidden_from_camera(cx, cz, 6):
                    score += 25
                if best is None or score < best[0]:
                    best = (score, cx, cz, r2p(poly))
            if best and r > best[0] + 6:
                break
        if best:
            return best[3]
    return None

def front_row(b, n_max, size, wall_off=0.8):
    """parked vehicles (dealer display cars, a school bus) along the walls facing the road (and the camera):
    nose to the wall where there is room, else parallel to it. size = (width, length)"""
    poly = b['p']; c = centroid(poly)
    nr = nearest_art(c[0], c[1], 60) or nearest_road(c[0], c[1], 70)   # show them off to the main road
    if not nr:
        return []
    tx, tz = nr[1] - c[0], nr[2] - c[1]; L = math.hypot(tx, tz) or 1; tx /= L; tz /= L
    sgn = 1 if poly_area(poly) > 0 else -1
    cand = []
    for i in range(len(poly)):
        (ax, az), (bx, bz) = poly[i], poly[(i + 1) % len(poly)]
        el = math.hypot(bx - ax, bz - az)
        if el < size[0] + 1:
            continue
        nx, nz = (bz - az) / el * sgn, -(bx - ax) / el * sgn   # outward normal
        score = (nx * tx + nz * tz) + 0.6 * (nx * CAM_DIR[0] + nz * CAM_DIR[1])
        cand.append((-score, i, ax, az, bx, bz, el, nx, nz))
    cand.sort()
    out = []
    for sc, i, ax, az, bx, bz, el, nx, nz in cand:
        if len(out) >= n_max or (sc > 0.3 and out):
            break
        ux, uz = (bx - ax) / el, (bz - az) / el
        for along, depth, a in ((size[0], size[1], math.atan2(nx, nz)), (size[1], size[0], math.atan2(ux, uz))):
            step = along + 0.75
            k = min(n_max - len(out), int((el + 1.0) // step))
            got = 0
            for off in (wall_off, wall_off + 1.5, wall_off + 3.0):
                for j in range(k):
                    s = el / 2 + (j - (k - 1) / 2) * step
                    x = ax + ux * s + nx * (off + depth / 2); z = az + uz * s + nz * (off + depth / 2)
                    cp = rect_poly(x, z, a, size[0], size[1])
                    if spot_ok(cp, road_pad=1.9, occ_pad=0.1, keep_off=0):
                        reserve(cp); out.append([round(x, 2), round(z, 2), round(a, 3), poirng.randrange(8)]); got += 1
                if got:
                    break
            if got:
                break
    return out[:n_max]

poi_report = defaultdict(int)
poi_items = [(b, t) for b, t in osm_placed if not b.get('lm')]

# ---- gas stations: kiosk + canopy over pump islands + price pylon, at the corner toward the junction
gas = []   # [brand, [(building or None, centroid)]]
for b, t in poi_items:
    if BRANDS.get(t.get('brand'), ('',))[0] == 'gas':
        gas.append((t['brand'], b, centroid(b['p']), t))
for t, gc in poi_rejected:
    if BRANDS.get(t.get('brand'), ('',))[0] == 'gas':
        gas.append((t['brand'], None, gc, t))
def fuel_key(t):
    br = t.get('brand', '')
    if BRANDS.get(br, ('',))[0] == 'gas':
        return br
    return 'Canadian Tire Gas' if br == 'Canadian Tire' else '_fuel'
for e in els:   # most stations are only an amenity=fuel point
    t = e.get('tags', {})
    if t.get('amenity') == 'fuel' and 'building' not in t:
        gc = osm_point(e)
        if gc and abs(gc[0]) < HALF_W - 25 and abs(gc[1]) < HALF_H - 25:
            gas.append((fuel_key(t), None, gc, t))
groups = []
for brand, b, gc, t in gas:
    for gr in groups:
        if gr[0] == brand and any(math.hypot(gc[0] - q[1][0], gc[1] - q[1][1]) < 32 for q in gr[1]):
            gr[1].append((b, gc, t)); break
    else:
        groups.append([brand, [(b, gc, t)]])

def crosses_road(a, b):
    n = int(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5) + 1
    return any(road_clear(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 0) < 0 for i in range(n + 1))

def station_spot(kx, kz, same_side=True):
    jn = min(art_junctions, key=lambda j: math.hypot(j[0] - kx, j[1] - kz), default=None)
    if jn and math.hypot(jn[0] - kx, jn[1] - kz) > 90:
        jn = None
    for (W, D) in ((13.0, 9.6), (11.4, 8.8)):
        best = None
        for r in range(0, 26 if same_side else 42, 2):
            n = 1 if r == 0 else max(8, int(2 * math.pi * r / 2.5))
            for k in range(n):
                a = 2 * math.pi * k / n
                cx, cz = kx + math.cos(a) * r, kz + math.sin(a) * r
                nr = nearest_art(cx, cz, 40)
                if nr is None:
                    continue
                gap = nr[0] - D / 2   # canopy front edge -> curb
                if gap < 3.2 or gap > 11:
                    continue
                score = abs(gap - 5.0) * 1.2 + r * 0.45 + (math.hypot(cx - jn[0], cz - jn[1]) * 0.25 if jn else 0)
                if best is not None and score >= best[0]:
                    continue
                ang = facing_road(cx, cz, nr)
                poly = rect_poly(cx, cz, ang, W, D)
                if not spot_ok(poly, road_pad=2.6, occ_pad=1.4, allow_park=False):
                    continue
                if same_side and crosses_road((kx, kz), (cx, cz)):
                    continue
                if hidden_from_camera(cx, cz, 5.5):
                    score += 20
                if best is None or score < best[0]:
                    best = (score, cx, cz, ang, W, D, gap, jn)
        if best:
            return best
    # no room on the store's own corner (within ~25 m): the nearest free corner across the street
    return station_spot(kx, kz, False) if same_side else None

stations = 0
for brand, members in groups:
    cat, name, style = BRANDS[brand]
    kx = sum(q[1][0] for q in members) / len(members); kz = sum(q[1][1] for q in members) / len(members)
    kiosk = None
    for b, gc, t in members:
        if b is not None and t.get('amenity') != 'car_wash' and abs(poly_area(b['p'])) >= 12:
            kiosk = b
    sp = station_spot(*(centroid(kiosk['p']) if kiosk else (kx, kz)))
    if not sp:
        print('gas station FAILED', brand, round(kx), round(kz)); continue
    _, cx, cz, ang, W, D, gap, jn = sp
    across = lambda b: b is not None and crosses_road(centroid(b['p']), (cx, cz))
    if across(kiosk):
        kiosk = None   # the forecourt only fits across the street: the station gets a new shop beside it
    members = [q for q in members if not across(q[0])]
    fx, fz = math.sin(ang), math.cos(ang)       # toward the road
    sx, sz = math.cos(ang), -math.sin(ang)      # along the road (local +x)
    reserve(grow(rect_poly(cx, cz, ang, W, D), 0.8))
    # price pylon: near the curb, on the side toward the junction
    side = 1
    if jn and (jn[0] - cx) * sx + (jn[1] - cz) * sz < 0:
        side = -1
    pylon = None
    for sd in (side, -side):
        for lat in (W / 2 + 2.2, W / 2 + 3.4, W / 2 + 1.2, W / 2 + 4.6):
            for dep in (D / 2 + gap - 3.0, D / 2 + gap - 3.8, D / 2 + gap - 4.6):
                px, pz = cx + sx * lat * sd + fx * dep, cz + sz * lat * sd + fz * dep
                pp = rect_poly(px, pz, 0.55, 3.4, 0.9)    # board faces the camera (azimuth 0.55)
                if road_clear(px, pz, 2.4) >= 0 and spot_ok(pp, road_pad=0.4, occ_pad=0.2, keep_off=0):
                    pylon = (px, pz); break
            if pylon: break
        if pylon: break
    if pylon:
        reserve(rect_poly(pylon[0], pylon[1], 0.55, 3.4, 0.9))
    back = D / 2 + 3.0
    if not kiosk:
        for (bx_, bz_) in [(-fx * (D / 2 + 2.2 + 2.9) + sx * o, -fz * (D / 2 + 2.2 + 2.9) + sz * o) for o in (0, 3, -3, 6, -6)] + \
                         [(sx * (W / 2 + 2.4 + 4.0) * s - fx * dd, sz * (W / 2 + 2.4 + 4.0) * s - fz * dd) for s in (1, -1) for dd in (0, 2.5)]:
            kp = rect_poly(cx + bx_, cz + bz_, ang, 8.0, 5.8)
            if spot_ok(kp, road_pad=1.0, occ_pad=0.4, keep_off=1):
                kiosk = place_building(r2p(kp), 4.2, '#f8fafc', 'retail')
                back = max(back, -(bx_ * fx + bz_ * fz) + 2.9 + 1.0)
                break
    if not kiosk:   # no room for a shop: the biggest station building hosts the canopy
        placed = [q[0] for q in members if q[0] is not None]
        kiosk = max(placed, key=lambda b: abs(poly_area(b['p']))) if placed else None
    if not kiosk:
        print('gas station FAILED (no kiosk)', brand, round(kx), round(kz)); continue
    for b, gc, t in members:
        if b is not None and b is not kiosk:
            poi_set(b, 'carwash', None, style); b['h'] = min(b['h'], 4.5)
    poi_set(kiosk, 'gas', name, style); kiosk['h'] = 4.2
    kiosk['st'] = [round(cx, 2), round(cz, 2), round(ang, 4), W, D, round(gap + D / 2, 2), round(back, 2)] + \
        ([round(pylon[0], 2), round(pylon[1], 2)] if pylon else [])
    # forecourt: canopy + margin, out to the curb (and back to the shop); trees / houses keep off it
    reserve(r2p([(cx + sx * lx + fx * lz, cz + sz * lx + fz * lz) for lx, lz in
                 ((-W / 2 - 3, -back), (W / 2 + 3, -back), (W / 2 + 3, gap + D / 2 - 2.2), (-W / 2 - 3, gap + D / 2 - 2.2))]))
    stations += 1
    poi_report['gas'] += 1
    print('gas station', name, 'at', round(cx), round(cz), 'junction', jn and [round(v) for v in jn], 'pylon', bool(pylon))
gas_out = 0
for w in ways:
    t = w['tags']
    if BRANDS.get(t.get('brand'), ('',))[0] == 'gas' and 'building' in t:
        if not all(inside(q) for q in rpts(w)):
            gas_out += 1
print('gas stations: %d placed, %d station buildings outside the map' % (stations, gas_out))

# ---- brands, dealers and well-known places on the OSM buildings that made it into the game
def dealer_name(t):
    words = (t.get('brand', '') + ';' + t.get('name', ''))
    puns = []
    for real, pun in DEALERS.items():
        if real in words and pun not in puns:
            puns.append(pun)
    if not puns:
        return None
    place = next((p for p in DEALER_PLACES if p in t.get('name', '')), '')
    return (' '.join(puns[:2]) + (' ' + place if place else '')).strip()

def classify(t, b=None):
    """(category, sign text or None, style) for an OSM tag set, or None"""
    brand, name = t.get('brand', ''), t.get('name', '')
    if t.get('shop') == 'car' or (brand and any(k in brand for k in DEALERS)):
        dn = dealer_name(t)
        if dn:
            return ('dealer', dn, dn.split()[0].lower())
    if brand in BRANDS or name in BRANDS:
        return BRANDS[brand if brand in BRANDS else name]
    if name in NAMED:
        return NAMED[name]
    am = t.get('amenity')
    if am == 'fire_station' or t.get('building') == 'fire_station':
        num = ''.join(ch for ch in name if ch.isdigit())
        return ('fire', '消防站 Fire Hall' + (' ' + num if num else ''), 'fire')
    if am == 'police':
        return ('police', '警察局 Police', 'police')
    if am == 'library':
        return ('library', (name.split(' - ')[-1].replace(' Branch', '') + ' 图书馆').strip(), 'library')
    if am == 'place_of_worship' or t.get('building') in ('church', 'temple', 'mosque'):
        rel = t.get('religion', 'christian' if t.get('building') == 'church' else '')
        return ('church' if rel == 'christian' else 'temple', None, None)
    if am == 'community_centre' or name.endswith('Community Centre'):
        short = name.replace(' Memorial', '').replace(' Community Centre', '')
        return ('cc', short + ' 社区中心' if short and short != name else None, 'cc')
    if t.get('building') == 'school' or am == 'school':
        return ('school', None, 'school')
    if am == 'car_wash':
        return ('carwash', None, 'carwash')
    return None

for b, t in poi_items:
    if b.get('poi'):
        continue
    cl = classify(t, b)
    if not cl:
        continue
    cat, nm, st = cl
    if cat == 'gas':
        continue
    area = abs(poly_area(b['p']))
    if cat == 'cc' and area < 120:
        nm = None
    poi_set(b, cat, nm, st)
    if cat in ('church', 'temple'):
        b['h'] = min(b['h'], 7.5)
    elif cat == 'dealer':
        b['h'] = max(6.5, min(b['h'], 8.0))
    elif cat in ('fast', 'bank'):
        b['h'] = min(b['h'], 6.0)
    poi_report[cat] += 1

# brand places whose building did not fit (or that are only a point): a compact building near the OSM spot
extra_pts = []
for t, gc in poi_rejected:
    extra_pts.append((t, gc))
for e in els:
    t = e.get('tags', {})
    if e['type'] == 'node' and (t.get('shop') == 'car' or t.get('amenity') in ('fire_station', 'police')):
        p = osm_point(e)
        if p and abs(p[0]) < HALF_W - 10 and abs(p[1]) < HALF_H - 10:
            extra_pts.append((t, p))
FALLBACK_SIZE = {'dealer': [(16.0, 11.0), (13.0, 9.5)], 'fast': [(11.0, 9.0), (9.0, 7.5)],
                 'fire': [(13.0, 9.5), (11.0, 8.0)], 'police': [(14.0, 10.0)]}
FALLBACK_H = {'dealer': 7.0, 'fast': 5.0, 'fire': 7.0, 'police': 9.0}
for t, gc in extra_pts:
    cl = classify(t)
    if not cl or cl[0] not in FALLBACK_SIZE:
        continue
    if any(b.get('n') == cl[1] and math.hypot(*(centroid(b['p'])[i] - gc[i] for i in (0, 1))) < 60 for b in buildings):
        continue
    poly = poi_spot(gc[0], gc[1], FALLBACK_SIZE[cl[0]], 36)
    if not poly:
        print('poi FAILED', cl[1], [round(v) for v in gc]); continue
    b = place_building(poly, FALLBACK_H[cl[0]], '#ffffff', 'retail')
    poi_set(b, cl[0], cl[1], cl[2])
    poi_report[cl[0] + ' (new)'] += 1
    print('poi placed near the OSM spot:', cl[1], round(math.hypot(centroid(poly)[0] - gc[0], centroid(poly)[1] - gc[1])), 'm away')

# ---- malls that OSM only maps as a named retail area: the biggest building on it becomes the plaza
MALL_AREAS = {
    'First Markham Place 萬錦廣場': NAMED['First Markham Place'],
    'King Square Shopping Centre': NAMED['王府井'],
    '旺角 Peachtree Centre': ('plaza', '旺阁广场 Peachtrea Centre', 'plaza'),
    'Times Square': ('plaza', '时戴广场 Tymes Square', 'plaza'),
}
for w in ways:
    t = w['tags']
    cl = MALL_AREAS.get(t.get('name'))
    if not cl or 'building' in t:
        continue
    gp = area_polys(w)
    if not gp:
        continue
    if any(b.get('n') == cl[1] for b in buildings):
        continue
    inner = [b for b in buildings if not b.get('lm') and b.get('poi') in (None, 'plaza') and point_in_poly(*centroid(b['p']), gp)]
    if inner:
        b = max(inner, key=lambda b: abs(poly_area(b['p'])))
    else:   # the mall building itself did not fit: a compact one on its own lot
        poly = poi_spot(*centroid(gp), [(30.0, 20.0), (24.0, 16.0), (18.0, 12.0)], 45)
        if not poly:
            print('mall area FAILED', cl[1]); continue
        b = place_building(poly, 8.0, '#ffffff', 'retail')
    poi_set(b, *cl)
    poi_report['plaza (area)'] += 1

# ---- Top-50 restaurants, bubble tea and Asian supermarkets (docs/RECOGNITION-TOP50.md): a small
# sign on the building the shop is in, at the shop's own spot, plus a minimap dot. Puns only.
STORES = [   # (regex on name / brand / name:zh, sign, style, kind)
    (r'Haidilao', '海底涝火锅 Haidelao', 'haidelao', 'food'),
    (r'Dayali|大鸭梨', '大鸭莉烤鸭 Dayalee Duck', 'dayalee', 'food'),
    (r'QJD|Quanjude|全聚德', '全聚得 QJB Duck', 'qjb', 'food'),
    (r'Congee Queen', '皇后茗粥 Congee Kween', 'kween', 'food'),
    (r'Kaka All You', 'Kaga 任食 All-U-Can-Eat', 'kaga', 'food'),
    (r'^Phoenix Restaurant', '凤凰茶餐厅 Phoenyx', 'phoenyx', 'food'),
    (r'Big Beef Bowl|牛大碗', '牛太碗 Big Beaf Bowl', 'beaf', 'food'),
    (r'西域食府', '西域食坊 Magical Tayste', 'tayste', 'food'),
    (r'Hey Noodles', '嘿晓面 Hay Noodles', 'hay', 'food'),
    (r"Diana's", "Dianna's Oyster Bar", 'dianna', 'food'),
    (r'Mr\. Congee', '龙粥纪 Mr. Kongee', 'kongee', 'food'),
    (r'Wonton Hut', '云吞小屋 Wantan Hutt', 'hutt', 'food'),
    (r'Yunshang Rice Noodle', '云上米线 Yunshan Noodle', 'yunshan', 'food'),
    (r'Chatime', '日出茶泰 Chatyme', 'chatyme', 'tea'),
    (r'^CoCo', '都渴 CoKo Tea', 'coko', 'tea'),
    (r'The Alley', '鹿脚巷 The Allee', 'allee', 'tea'),
    (r'(?i)machi machi', '麦吉吉 Machy Machy', 'machy', 'tea'),
    (r'Yi Fang', '一方水果茶 Yi Fong', 'yifong', 'tea'),
    (r'Kung Fu Tea', '功夫茶 Kung Fu Tee', 'kungfutee', 'tea'),
    (r'Presotea|PrestoTea', 'Prestotee', 'prestotee', 'tea'),
    (r"Ten Ren", "天人茗茶 Ten Wren's", 'tenwren', 'tea'),
    (r'Real Fruit Bubble', 'Reel Fruit Bubble Tea', 'reelfruit', 'tea'),
    (r'Comebuy', 'Comebye', 'comebye', 'tea'),
    (r'Tealicious', '书意 Shuyee Tea', 'shuyee', 'tea'),
    (r'T&T Supermarket', '大统花 T+T Market', 'ttee', 'grocer'),
    (r'^Foody Mart', '丰太超市 Foodee Mart', 'foodee', 'grocer'),
]
STORE_RE = [(re.compile(rx), sign, st, kind) for rx, sign, st, kind in STORES]
store_grid = Grid(20.0)
stores = []
store_skip = defaultdict(int)

def store_host(x, z, R=18):
    """building the shop is in (or the nearest one within R)"""
    best = None
    for b in occ.query((x - R, z - R, x + R, z + R)):
        if 'p' not in b or 'h' not in b or b.get('st') or b.get('lm') == 'tims':
            continue
        if point_in_poly(x, z, b['p']):
            return b, 0.0
        d = min(seg_dist(x, z, *b['p'][i], *b['p'][(i + 1) % len(b['p'])]) for i in range(len(b['p'])))
        if d < R and (best is None or d < best[1]):
            best = (b, d)
    return best

for e in els:
    t = e.get('tags', {})
    if 'highway' in t:
        continue
    key = ' | '.join(t.get(k, '') for k in ('name', 'brand', 'name:zh'))
    hit = next(((sign, st, kind) for rx, sign, st, kind in STORE_RE if rx.search(key)), None)
    if not hit:
        continue
    p = osm_point(e)
    if not p or abs(p[0]) > HALF_W - 5 or abs(p[1]) > HALF_H - 5:
        store_skip['outside'] += 1; print('store outside', hit[0], p and [round(v) for v in p]); continue
    if any(math.hypot(p[0] - s[0], p[1] - s[1]) < 9 for s in store_grid.query((p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9))):
        store_skip['crowded'] += 1; continue
    host = store_host(*p)
    if not host:
        store_skip['no building'] += 1; continue
    b = host[0]
    # sign row above the building's own name sign; pushed out to the camera-facing front of the building
    y = b['h'] + (3.0 if b.get('n') else 0.3)
    push = max(0.4, max((q[0] - p[0]) * CAM_DIR[0] + (q[1] - p[1]) * CAM_DIR[1] for q in b['p']) + 0.3)
    stores.append([round(p[0], 2), round(p[1], 2), round(y, 2), round(push, 2), hit[0], hit[1], hit[2]])
    store_grid.add((p[0], p[1], p[0], p[1]), p)
print('stores:', len(stores), dict(store_skip), sorted({s[4] for s in stores}))

# schools and libraries are often only tagged on the grounds: name the biggest building on them
for w in ways:
    t = w['tags']
    if 'building' in t or t.get('amenity') not in ('school', 'library'):
        continue
    gp = area_polys(w)
    if not gp or not t.get('name'):
        continue
    bb = bbox_of(gp)
    inside_b = [b for b in occ.query(bb) if 'k' in b and not b.get('lm') and b.get('poi') in (None, 'school', 'library')
                and point_in_poly(*centroid(b['p']), gp)]
    if not inside_b:
        continue
    host = max(inside_b, key=lambda b: abs(poly_area(b['p'])))
    if t['amenity'] == 'school':
        for b in inside_b:
            if not b.get('poi'):
                poi_set(b, 'school', None, 'school'); poi_report['school'] += 1
        host['sname'] = t['name']
    else:
        cat, nm, st = classify(t)
        poi_set(host, cat, nm, st); poi_report[cat] += 1
# school signs: one per school name, on its biggest building
named_schools = {}
for b, t in poi_items:
    if b.get('poi') == 'school' and t.get('name'):
        b['sname'] = t['name']
for b in buildings:
    nm = b.pop('sname', None)
    if nm and (nm not in named_schools or abs(poly_area(b['p'])) > abs(poly_area(named_schools[nm]['p']))):
        named_schools[nm] = b
for nm, b in named_schools.items():
    short = nm
    for a, c in SCHOOL_SHORT:
        short = short.replace(a, c)
    b['n'] = short.strip(' ,')
# display cars in front of every dealer, a yellow school bus at each named school
for b in buildings:
    if b.get('poi') == 'dealer':
        cars = front_row(b, 6, (2.3, 4.7))
        if cars:
            b['cars'] = cars; poi_report['dealer cars'] += len(cars)
    elif b.get('poi') == 'school' and b.get('n'):
        bus = front_row(b, 1, (2.8, 9.8), 1.5)
        if bus:
            b['bus'] = bus[0]; poi_report['school buses'] += 1
poi_report['signs'] = sum(1 for b in buildings if b.get('n'))
print('POIs:', dict(sorted(poi_report.items())))

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
    if in_water(cx, cz, r) or in_park(cx, cz) or (not heritage and in_no_house(cx, cz)):
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
    'heritage': shops,
    'heritageWalls': HERITAGE_WALLS,
    'heritageAwnings': HERITAGE_AWNINGS,
    'stops': stops,
    'stores': stores,
    'attribution': 'Map data (c) OpenStreetMap contributors, ODbL',
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
