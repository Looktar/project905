#!/usr/bin/env python3
"""Fetch the raw OpenStreetMap data for the map from the Overpass API.

Two queries over the same bbox (see BBOX):
  map    roads, bus stops, non-house buildings, land use, parks, water, rail
  places restaurants, cafes, shops, malls, fuel stations, banks ... (nodes + ways)
Both are merged (deduplicated by type/id) into data/raw/markham_osm.json.gz in
the same shape Overpass returns for `out geom`, which is what build_map.py reads.

The public endpoint is often busy, so each query retries with exponential
backoff across a few mirrors. Building the map never needs the network.

Usage: python3 tools/fetch_osm.py
"""
import gzip, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'raw', 'markham_osm.json.gz')

# south, west, north, east: Woodbine (west) .. Markham Rd (east), Steeles .. 16th Ave + margin
BBOX = (43.805, -79.385, 43.905, -79.235)
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
UA = 'project905-map-builder/0.2 (+https://github.com/Looktar/project905)'

HOUSES = 'house|detached|semidetached_house|terrace|garage|garages|shed|residential|roof|carport|hut'
ROADS = ('motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|'
         'tertiary|tertiary_link|unclassified|residential|living_street|busway')

QUERY_MAP = f'''
(
  way["highway"~"^({ROADS})$"];
  node["highway"="bus_stop"];
  way["building"]["building"!~"^({HOUSES})$"];
  way["landuse"];
  way["leisure"];
  way["natural"~"^(water|wood)$"];
  way["waterway"~"^(river|stream|canal)$"];
  way["water"];
  way["railway"~"^(rail|platform)$"];
  node["railway"~"^(station|stop)$"];
  node["place"~"^(suburb|neighbourhood|town|village)$"];
  relation["natural"="water"];
  relation["waterway"~"^(river|stream)$"];
  relation["leisure"="park"];
);
out geom;
'''

QUERY_PLACES = '''
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|ice_cream|food_court|bar|pub|fuel|bank|cinema|theatre|library|police|fire_station|hospital|clinic|pharmacy|community_centre|place_of_worship|school|college|university|townhall|marketplace|car_wash|post_office|bus_station)$"];
  nwr["shop"];
  nwr["tourism"~"^(hotel|motel|attraction|museum|gallery|viewpoint)$"];
  nwr["leisure"~"^(sports_centre|ice_rink|swimming_pool|stadium|fitness_centre)$"];
  nwr["brand"];
);
out geom;
'''


def run(query, label):
    full = '[out:json][timeout:240][bbox:%s,%s,%s,%s];' % BBOX + query
    body = urllib.parse.urlencode({'data': full}).encode()
    wait = 15
    for attempt in range(8):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read().decode('utf8'))
            if data.get('remark') and 'error' in data['remark'].lower():
                raise RuntimeError(data['remark'])
            print('%s: %d elements from %s' % (label, len(data['elements']), url))
            return data
        except Exception as e:  # noqa: BLE001 - any failure -> retry
            print('%s: attempt %d on %s failed (%s); retry in %ds' % (label, attempt + 1, url, e, wait))
            time.sleep(wait)
            wait = min(wait * 2, 240)
    sys.exit('giving up on %s query' % label)


def main():
    a = run(QUERY_MAP, 'map')
    b = run(QUERY_PLACES, 'places')
    seen, els = set(), []
    for e in a['elements'] + b['elements']:
        k = (e['type'], e['id'])
        if k not in seen:
            seen.add(k); els.append(e)
    out = {k: v for k, v in a.items() if k != 'elements'}
    out['bbox'] = list(BBOX)
    out['elements'] = els
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # mtime=0 keeps the gzip byte-identical for identical data
    with open(OUT, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf8'))
    print('wrote %s: %d elements, %.1f MB' % (OUT, len(els), os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
