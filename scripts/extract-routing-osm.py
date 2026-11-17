"""Optional fallback: trim a Geofabrik Taiwan PBF to the NTU routing area.

Install pyosmium (pip install osmium), then pass the PBF and a temporary JSON
path. Run routes:refresh -- --input <temporary JSON> to publish the snapshot.
"""

import argparse
import json
from pathlib import Path

import osmium

BOUNDS = (121.5338, 25.0116, 121.5446, 25.022)
SOURCE = 'https://download.geofabrik.de/asia/taiwan.html'
NODE_TAGS = {
    'barrier', 'locked', 'foot', 'access', 'wheelchair', 'kerb', 'width',
    'access:conditional', 'foot:conditional', 'wheelchair:conditional',
    'oneway:foot:conditional', 'oneway:wheelchair:conditional',
}
WAY_TAGS = NODE_TAGS | {
    'highway', 'name', 'name:zh', 'footway', 'sidewalk', 'service', 'surface',
    'smoothness', 'incline', 'est_width', 'maxwidth:physical', 'level',
    'indoor', 'tunnel', 'bridge', 'layer', 'construction', 'disused',
    'abandoned', 'area', 'oneway:foot', 'oneway:wheelchair',
    'foot:forward', 'foot:backward', 'wheelchair:forward',
    'wheelchair:backward', 'access:forward', 'access:backward',
    'sidewalk:left', 'sidewalk:right', 'ramp', 'sac_scale', 'ford',
}


class CampusExtract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = {}
        self.ways = []

    def node(self, node):
        if not node.location.valid():
            return
        lon, lat = node.location.lon, node.location.lat
        west, south, east, north = BOUNDS
        if west <= lon <= east and south <= lat <= north:
            self.nodes[node.id] = {
                'type': 'node', 'id': node.id, 'lon': lon, 'lat': lat,
                'tags': {tag.k: tag.v for tag in node.tags if tag.k in NODE_TAGS},
            }

    def way(self, way):
        if 'highway' not in way.tags:
            return
        ids = [node.ref for node in way.nodes]
        if not any(node_id in self.nodes for node_id in ids):
            return
        self.ways.append({
            'type': 'way', 'id': way.id, 'nodes': ids,
            'tags': {tag.k: tag.v for tag in way.tags if tag.k in WAY_TAGS},
        })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pbf', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with osmium.io.Reader(str(args.pbf)) as reader:
        header = reader.header()
        timestamp = header.get('osmosis_replication_timestamp')
    extract = CampusExtract()
    extract.apply_file(str(args.pbf))
    used = {node_id for way in extract.ways for node_id in way['nodes']}
    nodes = [node for node_id, node in extract.nodes.items() if node_id in used]
    with args.output.open('w', encoding='utf-8') as output:
        json.dump({'source': SOURCE, 'dataAsOf': timestamp or None,
                   'elements': nodes + extract.ways}, output, ensure_ascii=False)
        output.write('\n')
    print(f'{len(nodes)} nodes, {len(extract.ways)} highway ways, data {timestamp}')


if __name__ == '__main__':
    main()
