export const attractionSource = {
  id: 'ntu-attractions-osm',
  label: '臺大校園景點位置 · OpenStreetMap',
  url: 'https://www.openstreetmap.org/copyright',
  retrievedAt: '2026-11-18T00:00:00Z',
  status: 'ok',
}

const guide = 'https://visitorcenter.ntu.edu.tw/News_Content_n_74842_s_'

// Follow the NTU Visitor Center directory. Keep existing catalog IDs where available.
// OSM coordinates represent the place or grounds, and can differ from entrances.
export const campusAttractions = [
  { id: 'ntu-main-gate', name: '校門口與大學廣場', aliases: ['臺大正門', '校門口', '臺大校門', '大學廣場'], page: 81367, osm: 'node/14351545808', coordinate: [121.5338527, 25.0167017] },
  { id: 'context-relation/2586500', name: '臺大校史館', aliases: ['校史館', '舊總圖書館', '舊總圖'], page: 81371, osm: 'relation/2586500', coordinate: [121.5353018, 25.0176952] },
  { id: 'context-relation/2586501', name: '文學院', page: 81480, osm: 'relation/2586501', coordinate: [121.5367627, 25.0178746] },
  { id: 'ntu-royal-palm', name: '椰林大道', page: 81479, osm: 'way/1320961818', coordinate: [121.5378173, 25.0173033] },
  { id: 'ntu-fu-bell', name: '傅鐘', aliases: ['台大傅鐘', 'Fu Bell'], page: 81372, osm: 'node/472493077', coordinate: [121.536774, 25.0171283] },
  { id: 'ntu-administration', name: '臺大行政大樓', aliases: ['行政大樓', '第一行政大樓'], page: 81483, osm: 'relation/2589021', coordinate: [121.5367871, 25.0160401] },
  { id: 'ntu-xiao-xiao-fu', name: '小小福', page: 81613, osm: 'way/191358161', coordinate: [121.5370977, 25.015447] },
  { id: 'context-relation/206483', name: '醉月湖', page: 81631, osm: 'relation/206483', coordinate: [121.5376081, 25.0201741] },
  { id: 'ntu-sports-center', name: '臺大綜合體育館', aliases: ['綜合體育館', '新體', '台大小巨蛋'], page: 81632, osm: 'way/39240218', coordinate: [121.5351748, 25.0216082] },
  { id: 'ntu-farm-shop', name: '臺大農產品展示中心（舟山店）', aliases: ['農產品展售中心', '臺大農場農產品展示中心'], page: 81633, osm: 'way/194300396', coordinate: [121.5381268, 25.0158602] },
  { id: 'context-relation/14045855', name: '第一學生活動中心', aliases: ['活大', '第一活動中心'], page: 81634, osm: 'relation/14045855', coordinate: [121.5401105, 25.0180245] },
  { id: 'library', name: '臺大總圖書館', page: 81635 },
  { id: 'ntu-social-sciences', name: '臺大社會科學院', aliases: ['社會科學院大樓', '社科院'], page: 81637, osm: 'way/158624113', coordinate: [121.5423076, 25.020759] },
  { id: 'ntu-liugong-pool', name: '瑠公圳水源池', aliases: ['瑠公池', '舟山路生態池', '琉公圳水源池'], page: 81638, osm: 'way/1052279968', coordinate: [121.5403699, 25.0164491] },
  { id: 'ntu-farm', name: '臺大農業試驗場', aliases: ['農業試驗場', '臺大農場', 'NTU Farm'], page: 81639, osm: 'relation/4505634', coordinate: [121.5406127, 25.0155292] },
  { id: 'ntu-three-pines', name: '共同三松', page: 81640, osm: 'node/1997001712', coordinate: [121.5374785, 25.0157102] },
  { id: 'ntu-odeum', name: '雅頌坊', page: 81642, osm: 'way/158651498', coordinate: [121.5387329, 25.0137808] },
  { id: 'ntu-fu-garden', name: '傅園', page: 81643, osm: 'relation/4505578', coordinate: [121.5336985, 25.0161067] },
  { id: 'ntu-agricultural-exhibition', name: '臺大農業陳列館', aliases: ['農業陳列館', '農陳館'], page: 81644, osm: 'way/39456561', coordinate: [121.5341982, 25.0181421] },
]

export function addCampusAttractions(places, common) {
  for (const attraction of campusAttractions) {
    const existing = places.find(place => place.id === attraction.id)
    const guideUrl = `${guide}${attraction.page}.html`
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...(existing.name === attraction.name ? [] : [existing.name]), ...(attraction.aliases ?? [])])]
      existing.name = attraction.name
      existing.guideUrl = guideUrl
    } else if (attraction.coordinate) {
      places.push({ ...common, id: attraction.id, name: attraction.name, aliases: attraction.aliases ?? [],
        category: 'landmark', coordinate: attraction.coordinate, guideUrl, sourceId: attractionSource.id,
        sourceUrl: `https://www.openstreetmap.org/${attraction.osm}`, contextId: attraction.osm,
        note: '地圖標記為景點的約略位置，實際入口與通行條件請另行確認。' })
    }
  }
}
