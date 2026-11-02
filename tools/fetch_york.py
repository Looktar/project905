#!/usr/bin/env python3
"""Fetch York Region building footprints for the map (D-68).

OSM has no outline for about 100 office / industrial / retail buildings in the
map (Esna Park, Steelcase, Valleywood ...). York Region's open data has them.
Only footprints of at least MIN_AREA m^2 are kept (houses are smaller and the
game does not use York data for homes); demolished ones are dropped.
build_map.py decides which of them are commercial and adds only those that
OSM does not already have.

Output: data/raw/york_footprints.json.gz  [[OBJECTID, [[lon, lat], ...]], ...]
Licence: York Region Open Data Licence (attribution: "Contains information
licensed under the Open Data Licence - York Region"), see CREDITS.md.
Building the map never needs the network.

Usage: python3 tools/fetch_york.py
"""
import gzip, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'raw', 'york_footprints.json.gz')
URL = 'https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Structures/MapServer/0/query'
BBOX = (-79.385, 43.805, -79.235, 43.905)   # west, south, east, north (same area as fetch_osm.py)
MIN_AREA = 300                              # m^2 (Shape.STArea, projected metres)
PAGE = 2000
UA = 'project905-map-builder/0.2 (+https://github.com/Looktar/project905)'

def query(offset):
    q = {
        'where': f"Shape.STArea() >= {MIN_AREA} AND STATUS <> 'Deleted'",
        'geometry': ','.join(map(str, BBOX)), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
        'spatialRel': 'esriSpatialRelIntersects', 'outSR': 4326, 'outFields': 'OBJECTID',
        'orderByFields': 'OBJECTID', 'resultOffset': offset, 'resultRecordCount': PAGE, 'f': 'geojson',
    }
    req = urllib.request.Request(URL + '?' + urllib.parse.urlencode(q), headers={'User-Agent': UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)['features']
        except Exception as e:  # busy server: back off and retry
            print('retry', offset, e); time.sleep(3 * 2 ** attempt)
    sys.exit('York Region query failed at offset %d' % offset)

out = []
offset = 0
while True:
    feats = query(offset)
    for f in feats:
        g = f.get('geometry')
        if not g:
            continue
        rings = [g['coordinates'][0]] if g['type'] == 'Polygon' else [p[0] for p in g['coordinates']]
        for ring in rings:
            out.append([f['properties']['OBJECTID'], [[round(x, 6), round(y, 6)] for x, y in ring[:-1]]])
    print('offset', offset, '+', len(feats))
    if len(feats) < PAGE:
        break
    offset += PAGE
out.sort(key=lambda r: (r[0], r[1][0]))
with gzip.GzipFile(OUT, 'wb', mtime=0) as f:
    f.write(json.dumps(out, separators=(',', ':')).encode())
print('wrote', OUT, len(out), 'footprints')
