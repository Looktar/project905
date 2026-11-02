"""Draw the game map over the real OSM data to check placement (D-64).

Blue = game buildings, orange = procedural houses, grey = game roads,
red outline = real OSM building at map scale, black = real road centreline.

Usage: python tools/map_overlay.py name,x0,z0,x1,z1,px_per_m [...]   (game metres)
Writes test-results/overlay/<name>.png; builds a throwaway map copy there too.
"""
import os, json, math, sys
from PIL import Image, ImageDraw
OUTDIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'test-results', 'overlay')
os.makedirs(OUTDIR, exist_ok=True)
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open('tools/build_map.py', encoding='utf8').read()
src = src.replace("OUT = os.path.join(ROOT, 'maps', 'markham.json')", "OUT = os.path.join(OUTDIR, 'diag.json')")
ns = {'__file__': os.path.abspath('tools/build_map.py'), '__name__': 'diag', 'OUTDIR': OUTDIR}
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(src, 'build_map', 'exec'), ns)
m = json.load(open(os.path.join(OUTDIR, 'diag.json')))
g, rpts, inside = ns['g'], ns['rpts'], ns['inside']
HW, HH = m['half']
def render(x0, z0, x1, z1, px, name):
    W, H = int((x1 - x0) * px), int((z1 - z0) * px)
    im = Image.new('RGB', (W, H), (250, 250, 245)); d = ImageDraw.Draw(im)
    T = lambda p: ((p[0] - x0) * px, (p[1] - z0) * px)
    for e in m['edges']:
        d.line([T(p) for p in e[6]], fill=(190, 190, 190), width=max(1, int(e[3] * px)))
    # game houses (orange boxes)
    for h in m['houses']:
        x, z, a, w, dd = h[:5]
        c, s = math.cos(a), math.sin(a)
        pts = [(x + c * u * w / 2 + s * v * dd / 2, z - s * u * w / 2 + c * v * dd / 2) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d.polygon([T(p) for p in pts], fill=(255, 190, 120))
    for b in m['buildings']:
        d.polygon([T(p) for p in b['p']], fill=(130, 160, 220))
    # real OSM building footprints at true map scale (red outline)
    for w in ns['ways']:
        t = w['tags']
        if 'building' not in t: continue
        p = rpts(w)
        if not all(inside(q) for q in p): continue
        d.line([T(g(q)) for q in p], fill=(220, 30, 30), width=1)
    # real roads centreline (dark)
    for w in ns['drive_ways']:
        p = [g(q) for q in rpts(w)]
        d.line([T(q) for q in p], fill=(60, 60, 60), width=1)
    im.save(os.path.join(OUTDIR, name))
for a in sys.argv[1:]:
    n, x0, z0, x1, z1, px = a.split(',')
    render(float(x0), float(z0), float(x1), float(z1), float(px), n + '.png')
