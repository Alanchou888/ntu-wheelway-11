// Public-source parsing and unit conversion. No field-verification is inferred here.
export const CONTEXT_BBOX = [121.535, 25.0165, 121.5417, 25.0205];
export const FACILITY_BBOX = [121.534, 25.014, 121.543, 25.021];
export const ENDPOINTS = {
  ntu: 'https://map.ntu.edu.tw/ntuga/public/buildinfo.htm?action=getCentroidByBuildId&proj=EPSG:4326',
  wheelroute: 'https://wheelroute.gov.taipei/wheelrouteApi/api/facility/Get/1',
  osm: `https://api.openstreetmap.org/api/0.6/map?bbox=${CONTEXT_BBOX.join(',')}`,
};

const numeric = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
export const validCoordinate = (point) => Array.isArray(point) && point.length === 2
  && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
export const inBbox = (point, bbox) => validCoordinate(point) && point[0] >= bbox[0]
  && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
const round = (value) => Math.round(value * 1e7) / 1e7;

export function normalizeNtu(payload) {
  if (!payload || !Array.isArray(payload.data)) throw new Error('NTU response must contain data[].');
  return [
    { id: 'library', uid: 'AT3041', name: '臺大總圖書館' },
    { id: 'boya', uid: 'AT1044', name: '博雅教學館' },
  ].map((place) => {
    const row = payload.data.find((item) => item.uid === place.uid);
    const coordinate = row ? [numeric(row.lon), numeric(row.lat)] : null;
    if (!inBbox(coordinate, FACILITY_BBOX)) throw new Error(`Missing or invalid NTU building ${place.uid}.`);
    return { ...place, coordinate: coordinate.map(round), sourceId: 'ntu', kind: 'building' };
  });
}

export function normalizeFacilities(payload) {
  if (!Array.isArray(payload) || payload.length === 0) throw new Error('Wheelroute response is empty or not an array.');
  const facilities = [];
  const ids = new Set();
  for (const row of payload) {
    const coordinate = [numeric(row.lon), numeric(row.lat)];
    if (!inBbox(coordinate, FACILITY_BBOX) || String(row.kind) !== '1') continue;
    const widthCm = numeric(row.width);
    const rawSlope = numeric(row.slope);
    const widthM = widthCm !== null && widthCm > 0 ? widthCm / 100 : null;
    // The source uses 0/0 for many unmeasured facilities. Keep those unknown.
    const slopePercent = rawSlope !== null && rawSlope >= 0 && !(rawSlope === 0 && widthM === null)
      ? rawSlope : null;
    const name = String(row.kname || '無障礙斜坡道');
    const sourceKey = name.match(/^\d+/)?.[0] ?? `${round(coordinate[0])},${round(coordinate[1])}`;
    const id = `wheelroute-${sourceKey}`;
    if (ids.has(id)) continue;
    ids.add(id);
    facilities.push({ id, name, coordinate: coordinate.map(round), widthM, slopePercent,
      sourceId: 'wheelroute', status: 'unverified' });
  }
  return facilities.sort((a, b) => a.id.localeCompare(b.id));
}

const decodeXml = (value) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(
    code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)));
const attributes = (xml) => Object.fromEntries([...xml.matchAll(/([\w:]+)="([^"]*)"/g)]
  .map((match) => [match[1], decodeXml(match[2])]));
const tags = (xml) => Object.fromEntries([...xml.matchAll(/<tag\b([^>]*?)\/>/g)]
  .map((match) => { const tag = attributes(match[1]); return [tag.k, tag.v]; }));

export function parseOsm(xml) {
  if (typeof xml !== 'string' || !/<osm\s/.test(xml) || !/<\/osm>/.test(xml)) {
    throw new Error('OSM response is not a complete OSM XML document.');
  }
  const nodes = new Map();
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const row = attributes(match[1]);
    const coordinate = [Number(row.lon), Number(row.lat)];
    if (validCoordinate(coordinate)) nodes.set(row.id, { id: row.id, coordinate, tags: tags(match[2] ?? '') });
  }
  const ways = [];
  for (const match of xml.matchAll(/<way\b([^>]*?)>([\s\S]*?)<\/way>/g)) {
    const row = attributes(match[1]);
    const refs = [...match[2].matchAll(/<nd\b([^>]*?)\/>/g)].map((item) => attributes(item[1]).ref);
    ways.push({ id: row.id, refs, tags: tags(match[2]) });
  }
  const relations = [];
  for (const match of xml.matchAll(/<relation\b([^>]*?)>([\s\S]*?)<\/relation>/g)) {
    const row = attributes(match[1]);
    const members = [...match[2].matchAll(/<member\b([^>]*?)\/>/g)].map((item) => attributes(item[1]));
    relations.push({ id: row.id, members, tags: tags(match[2]) });
  }
  if (nodes.size < 10 || ways.length < 2) throw new Error('OSM response contains too little usable geometry.');
  return { nodes, ways, relations };
}

export function isOutdoorWay(way) {
  const tag = way.tags;
  return Boolean(tag.highway) && !['yes', 'corridor', 'room', 'area'].includes(tag.indoor)
    && (!tag.level || tag.level === '0') && !tag.tunnel && tag.covered !== 'building_passage';
}

export function isCandidateWay(way) {
  const tag = way.tags;
  return isOutdoorWay(way)
    && ['footway', 'pedestrian', 'path', 'service', 'residential', 'living_street', 'cycleway', 'unclassified'].includes(tag.highway)
    && !tag.ford && tag.informal !== 'yes' && tag.foot !== 'no' && tag.wheelchair !== 'no'
    && !['private', 'no'].includes(tag.access) && tag.area !== 'yes';
}

function assembleRings(parts) {
  const remaining = parts.filter((part) => part.length >= 2).map((part) => [...part]);
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    while (ring[0] !== ring.at(-1)) {
      const index = remaining.findIndex((part) => part[0] === ring.at(-1) || part.at(-1) === ring.at(-1)
        || part[0] === ring[0] || part.at(-1) === ring[0]);
      if (index < 0) break;
      const next = remaining.splice(index, 1)[0];
      if (next[0] === ring.at(-1)) ring.push(...next.slice(1));
      else if (next.at(-1) === ring.at(-1)) ring.push(...next.reverse().slice(1));
      else if (next.at(-1) === ring[0]) ring.unshift(...next.slice(0, -1));
      else ring.unshift(...next.reverse().slice(0, -1));
    }
    if (ring.length >= 4 && ring[0] === ring.at(-1)) rings.push(ring);
  }
  return rings;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function featureKind(tag) {
  if (tag.building && tag.building !== 'no') return 'building';
  if (tag.natural === 'water' || tag.water || tag.landuse === 'reservoir') return 'water';
  if (['park', 'garden', 'nature_reserve'].includes(tag.leisure)
    || ['grass', 'forest', 'meadow', 'village_green', 'recreation_ground'].includes(tag.landuse)
    || ['wood', 'scrub', 'grassland'].includes(tag.natural)) return 'green';
  return null;
}

export function osmContext(parsed) {
  const { nodes, ways, relations } = parsed;
  const waysById = new Map(ways.map((way) => [way.id, way]));
  const coordinates = (refs) => refs.map((ref) => nodes.get(ref)?.coordinate?.map(round)).filter(Boolean);
  const features = [];
  const relationMembers = new Set();
  const makeFeature = (id, tag, kind, geometry) => {
    const props = { kind, osmId: id, sourceId: 'osm' };
    if (tag.name) props.name = tag.name;
    if (tag.highway) props.highway = tag.highway;
    return { type: 'Feature', id, properties: props, geometry };
  };
  for (const relation of relations) {
    const kind = featureKind(relation.tags);
    if (!kind || relation.tags.type !== 'multipolygon') continue;
    const outers = assembleRings(relation.members.filter((member) => member.type === 'way' && member.role === 'outer')
      .map((member) => waysById.get(member.ref)?.refs ?? [])).map(coordinates).filter((ring) => ring.length >= 4);
    const inners = assembleRings(relation.members.filter((member) => member.type === 'way' && member.role === 'inner')
      .map((member) => waysById.get(member.ref)?.refs ?? [])).map(coordinates).filter((ring) => ring.length >= 4);
    const polygons = outers.filter((ring) => ring.some((point) => inBbox(point, CONTEXT_BBOX)))
      .map((ring) => [ring, ...inners.filter((hole) => pointInRing(hole[0], ring))]);
    if (!polygons.length) continue;
    relation.members.filter((member) => member.type === 'way' && member.role === 'outer')
      .forEach((member) => relationMembers.add(member.ref));
    features.push(makeFeature(`relation/${relation.id}`, relation.tags, kind,
      polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }));
  }
  for (const way of ways) {
    const points = coordinates(way.refs);
    if (points.length < 2 || !points.some((point) => inBbox(point, CONTEXT_BBOX))) continue;
    const kind = featureKind(way.tags);
    if (kind && !relationMembers.has(way.id) && way.refs[0] === way.refs.at(-1) && points.length >= 4) {
      features.push(makeFeature(`way/${way.id}`, way.tags, kind, { type: 'Polygon', coordinates: [points] }));
    } else if (isOutdoorWay(way)) {
      features.push(makeFeature(`way/${way.id}`, way.tags, 'road', { type: 'LineString', coordinates: points }));
    }
  }
  return { type: 'FeatureCollection', features };
}

export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const pathLengthM = (path) => path.coordinates.slice(1)
  .reduce((length, point, index) => length + distanceM(path.coordinates[index], point), 0);

export function validateCampus(snapshot) {
  if (snapshot?.version !== 1 || !Number.isFinite(Date.parse(snapshot.retrievedAt))) throw new Error('Invalid snapshot version or date.');
  if (!Array.isArray(snapshot.sources) || !['ntu', 'wheelroute', 'osm'].every((id) => snapshot.sources.some((source) => source.id === id))) {
    throw new Error('Required source metadata is missing.');
  }
  for (const source of snapshot.sources) {
    if (!['ok', 'cached'].includes(source.status) || !Number.isFinite(Date.parse(source.retrievedAt))
      || !String(source.url).startsWith('https://')) throw new Error(`Invalid source metadata: ${source.id}.`);
  }
  if (!Array.isArray(snapshot.places) || snapshot.places.length !== 2
    || !['library', 'boya'].every((id) => snapshot.places.some((place) => place.id === id && place.kind === 'building'
      && inBbox(place.coordinate, FACILITY_BBOX)))) throw new Error('Invalid campus buildings.');
  if (!Array.isArray(snapshot.facilities)) throw new Error('Missing facilities array.');
  for (const facility of snapshot.facilities) {
    if (!inBbox(facility.coordinate, FACILITY_BBOX) || facility.sourceId !== 'wheelroute' || facility.status !== 'unverified'
      || !(facility.widthM === null || (Number.isFinite(facility.widthM) && facility.widthM > 0))
      || !(facility.slopePercent === null || (Number.isFinite(facility.slopePercent) && facility.slopePercent >= 0))) {
      throw new Error(`Invalid public facility ${facility.id}.`);
    }
  }
  if (!Array.isArray(snapshot.paths) || snapshot.paths.length !== 2
    || !['direct', 'gentle'].every((id) => snapshot.paths.some((path) => path.id === id))) throw new Error('Two curated paths are required.');
  for (const path of snapshot.paths) {
    if (path.sourceId !== 'osm' || !Array.isArray(path.wayIds) || path.wayIds.length === 0
      || !Array.isArray(path.coordinates) || path.coordinates.length < 2 || !path.coordinates.every(validCoordinate)) {
      throw new Error(`Invalid curated path ${path.id}.`);
    }
    if (pathLengthM(path) < 100 || pathLengthM(path) > 2000) throw new Error(`Unexpected path length: ${path.id}.`);
  }
  if (JSON.stringify(snapshot.paths[0].coordinates[0]) !== JSON.stringify(snapshot.paths[1].coordinates[0])
    || JSON.stringify(snapshot.paths[0].coordinates.at(-1)) !== JSON.stringify(snapshot.paths[1].coordinates.at(-1))) {
    throw new Error('Curated alternatives must share their outdoor start and end coordinates.');
  }
  if (snapshot.context?.type !== 'FeatureCollection' || !Array.isArray(snapshot.context.features)
    || snapshot.context.features.length === 0) throw new Error('Missing campus vector context.');
  return snapshot;
}
