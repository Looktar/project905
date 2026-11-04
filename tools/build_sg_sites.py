#!/usr/bin/env python3
"""万锦三国志 random maps (v0.9, D-77): the pool of real places every game draws from.

Reads maps/markham.json (roads, rivers, named buildings) and the raw OSM export (named parks, gas
stations) and writes js/sg_sites.js:
  SITES  candidate cities: real neighbourhoods, plazas and landmarks (game metres), whether they sit on
         the Rouge River flats (valley) and whether a big mall or warehouse / big-box store is next
         door (depot, with the town's pun name)
  PARKS  named parks that can become passes (隘口)
  PAIRS  for every two sites close enough to be linked: the real road between them, whether the line
         crosses the Rouge, a gas station on that road (驿站), and parks lying across it
The engine picks 12 sites, links them (Gabriel graph) and turns a few parks into passes, from the
game's seed (js/sg_engine.js genMap). Pure standard library; the output is committed.

    python3 tools/build_sg_sites.py
"""
import gzip, json, math, os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(os.path.join(ROOT, 'maps', 'markham.json'), encoding='utf-8'))
raw = json.load(gzip.open(os.path.join(ROOT, 'data', 'raw', 'markham_osm.json.gz')))
OUT = os.path.join(ROOT, 'js', 'sg_sites.js')
HW, HH = m['half']
o, A = m['origin'], math.radians(m['rot'])

# id, zh, en, x, z  (positions from OSM place nodes, named buildings and landmarks in maps/markham.json)
SITES = [
    ('btv', 'Buttonville', 'Buttonville', -1450, -1050),
    ('csh', 'Cashay Centre', 'Cashay Centre', -1321, -1159),
    ('wdb', 'Woodbine', 'Woodbine', -1450, -300),
    ('fmp', '万景广场', 'First Markum Place', -1164, -198),
    ('cst', 'Costgo', 'Costgo', -1384, -80),
    ('civ', '万锦市政厅', 'Civic Centre', -741, -386),
    ('mts', 'Markum Town Square', 'Markum Town Square', -590, -427),
    ('dtm', 'Downtown Markham', 'Downtown Markham', -499, -14),
    ('unv', 'Unionville', 'Unionville', 171, -632),
    ('nks', 'New Kennedy Sqare', 'New Kennedy Sqare', 299, -241),
    ('mkv', 'Markvile Mall', 'Markvile Mall', 907, -493),
    ('qtz', 'Quantztown', 'Quantztown', 887, -1123),
    ('ray', 'Raymerville', 'Raymerville', 1420, -880),
    ('shw', 'Sherwud Plaza', 'Sherwud Plaza', 1537, -465),
    ('esn', 'Esna Park', 'Esna Park', -1100, 800),
    ('und', 'Underwood', 'Underwood', -198, 761),
    ('dnc', 'Dennison Centre', 'Dennison Centre', -91, 854),
    ('hag', 'Hagerman', 'Hagerman', 120, 380),
    ('pac', '大古广场', 'Pacifick Mall', -145, 1165),
    ('mlk', 'Milliken', 'Milliken', -560, 1180),
    ('mil', 'Milliken Mills', 'Milliken Mills', 600, 900),
    ('aan', 'Aaniin', 'Aaniin', 1416, 416),
    ('ads', 'Armadayle Square', 'Armadayle Square', 1695, 426),
    ('arm', 'Armadale', 'Armadale', 1420, 1020),
    ('mlc', 'Millikin Centre', 'Millikin Centre', 1178, 1277),
    ('spd', 'Markham Sports Dome', 'Markham Sports Dome', 1029, 321),
    ('shu', 'Shoppz of Unionville', 'Shoppz of Unionville', -21, -313),
]
MAX_LINK = 1700.0  # game metres


def game(lat, lon):
    x = (lon - o['lon0']) * math.cos(math.radians(o['lat0'])) * 111320
    z = -(lat - o['lat0']) * 110574
    X, Z = x * math.cos(-A) - z * math.sin(-A), x * math.sin(-A) + z * math.cos(-A)
    return ((X - o['cx']) * m['scale'], (Z - o['cz']) * m['scale'])


def cross(p, q, r, s):
    d = lambda a, b, c: (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return d(p, q, r) * d(p, q, s) < 0 and d(r, s, p) * d(r, s, q) < 0


def seg_t(p, a, b):  # (t along a->b, distance from the line)
    dx, dz = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dz * dz
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
    return t, abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / math.sqrt(L2)


rouge = [r[1] for r in m['rivers'] if r[0] == 1]
def crosses_rouge(a, b):
    return any(cross(a, b, l[i - 1], l[i]) for l in rouge for i in range(1, len(l)))
def rouge_dist(p):
    best = 1e9
    for l in rouge:
        for (ax, az), (bx, bz) in zip(l, l[1:]):
            dx, dz = bx - ax, bz - az
            t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / ((dx * dx + dz * dz) or 1)))
            best = min(best, math.hypot(ax + dx * t - p[0], az + dz * t - p[1]))
    return best


# named arterial roads (class 0/1 in maps/markham.json): points for "which road is this link"
names = m['names']
road_pts = {}
for e in m['edges']:
    if e[5] is not None and e[2] <= 1:
        road_pts.setdefault(names[e[5]], []).extend(e[6])
def nearest_road(p, maxd=140):
    best, bn = maxd, None
    for n, pts in road_pts.items():
        for q in pts[::2]:
            d = math.hypot(q[0] - p[0], q[1] - p[1])
            if d < best:
                best, bn = d, n
    return bn
def road_of(a, b):
    c = Counter(r for r in (nearest_road((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) for t in (0.2, 0.35, 0.5, 0.65, 0.8)) if r)
    return c.most_common(1)[0][0] if c else nearest_road(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 1e9)


# depots: next to a big mall or a warehouse / big-box store (names in maps/markham.json are already puns)
big = []
for b in m['buildings']:
    if not b.get('n') or b.get('poi') not in ('plaza', 'bigbox'):
        continue
    xs, zs = [p[0] for p in b['p']], [p[1] for p in b['p']]
    area = (max(xs) - min(xs)) * (max(zs) - min(zs))
    if b['poi'] == 'bigbox' or area >= 5000:  # warehouse / big-box stores, and the biggest plazas
        big.append((b['n'], sum(xs) / len(xs), sum(zs) / len(zs), 1e8 if b['poi'] == 'bigbox' else area))
for t, n in (('markville', 'Markvile Mall'), ('pacific', '大古广场 Pacifick Mall')):
    lm = next(l for l in m['landmarks'] if l.get('t') == t)
    big.append((n, lm['x'], lm['z'], 1e9))
def depot_of(x, z):
    near = [(a, n) for n, bx, bz, a in big if math.hypot(bx - x, bz - z) < 220]
    return max(near)[1] if near else None


# gas stations (OSM amenity=fuel) and named parks from the raw export
nodes = {e['id']: e for e in raw['elements'] if e['type'] == 'node'}
def centre(e):
    if 'lat' in e:
        return game(e['lat'], e['lon'])
    pts = e.get('geometry') or [nodes[i] for i in e.get('nodes', []) if i in nodes]
    if not pts and e['type'] == 'relation':
        pts = [p for mem in e.get('members', []) for p in (mem.get('geometry') or [])]
    if not pts:
        return None
    g = [game(p['lat'], p['lon']) for p in pts]
    return (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)), g
PUN = {'Petro-Canada': 'Petro-Kanada', 'Petro': 'Petro-Kanada', 'Esso': 'Ezzo', 'Shell': 'Shel', 'Husky': 'Huskee',
       'Pioneer': 'Pioneir', 'Global': 'Globle Gas', 'Canadian Tire': 'Canadian Tyre Gas', 'Circle K': 'Circle Q'}
fuel, parks = [], {}
for e in raw['elements']:
    t = e.get('tags', {})
    if t.get('amenity') == 'fuel':
        c = centre(e)
        if c:
            p = c if 'lat' in e else c[0]
            b = t.get('brand') or t.get('name') or ''
            fuel.append((next((v for k, v in PUN.items() if b.startswith(k)), '加油站 Gas'), p))
    elif t.get('leisure') in ('park', 'nature_reserve') and t.get('name') and e['type'] != 'node':
        c = centre(e)
        if not c:
            continue
        (cx, cz), g = c
        xs, zs = [p[0] for p in g], [p[1] for p in g]
        area = (max(xs) - min(xs)) * (max(zs) - min(zs))
        n = t['name'].replace('’', "'")
        if abs(cx) < HW - 60 and abs(cz) < HH - 60 and area > 2500 and (n not in parks or parks[n][2] < area):
            parks[n] = (cx, cz, area)
def short(n):
    for suf in (' Conservation Park',):
        if n.endswith(suf):
            return n[: -len(suf)]
    return n
PARKS = sorted([(short(n), round(x), round(z)) for n, (x, z, a) in parks.items()], key=lambda p: p[0])

pos = {s[0]: (s[3], s[4]) for s in SITES}
PAIRS = {}
for i, a in enumerate(SITES):
    for b in SITES[i + 1:]:
        pa, pb = pos[a[0]], pos[b[0]]
        L = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        if L > MAX_LINK or L < 250:
            continue
        road = road_of(pa, pb)
        st = None
        for brand, p in fuel:
            t, d = seg_t(p, pa, pb)
            if 0.15 < t < 0.85 and d < 300 and road in road_pts and min(math.hypot(q[0] - p[0], q[1] - p[1]) for q in road_pts[road]) < 45:
                st = [brand, round(t, 2)]
                break
        ps = []
        for k, (n, x, z) in enumerate(PARKS):
            t, d = seg_t((x, z), pa, pb)
            if 0.25 < t < 0.75 and d < 130 and t * L > 200 and (1 - t) * L > 200:
                ps.append([k, round(t, 2), int(crosses_rouge(pa, (x, z))), int(crosses_rouge((x, z), pb))])
        PAIRS[a[0] + '|' + b[0]] = [road, int(crosses_rouge(pa, pb)), st, ps]

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Generated by tools/build_sg_sites.py (D-77): the pool of real places random 万锦三国志 maps draw from.\n')
    f.write('// SITES [id, zh, en, x, z, valley, depot pun name | null]; PARKS [name, x, z];\n')
    f.write('// PAIRS "a|b" -> [road, crosses the Rouge, 驿站 [gas pun, t] | null, parks across it [[park, t, river a-park, river park-b]]]\n')
    f.write('export const SITES = [\n')
    for s in SITES:
        x, z = s[3], s[4]
        f.write('  %s,\n' % json.dumps([s[0], s[1], s[2], x, z, int(rouge_dist((x, z)) < 220), depot_of(x, z)], ensure_ascii=False))
    f.write('];\nexport const PARKS = [\n')
    for p in PARKS:
        f.write('  %s,\n' % json.dumps(list(p), ensure_ascii=False))
    f.write('];\nexport const PAIRS = {\n')
    for k, v in PAIRS.items():
        f.write('  %s: %s,\n' % (json.dumps(k), json.dumps(v, ensure_ascii=False)))
    f.write('};\n')
print('sites %d, parks %d, pairs %d (with a park %d, with a gas station %d), depots %d' % (
    len(SITES), len(PARKS), len(PAIRS), sum(1 for v in PAIRS.values() if v[3]), sum(1 for v in PAIRS.values() if v[2]),
    sum(1 for s in SITES if depot_of(s[3], s[4]))))
