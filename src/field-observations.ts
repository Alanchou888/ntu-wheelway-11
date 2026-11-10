import type { CatalogPlace, Coordinate, Photo, PlaceCatalog, PublicSource } from './types'

const date = '2026-11-10'
const folder = '/field/2026-11-10'
const source: PublicSource = {
  id: 'group-11-field', label: '第 11 組實勘紀錄', retrievedAt: date,
  url: `${folder}/boya-ramp.webp`, status: 'ok',
  note: '依拍攝位置標示個別觀察，尚未查核完整路線。',
}

interface Observation {
  id: string
  name: string
  coordinate: Coordinate
  note: string
  location: string
  photos: Photo[]
  reading?: { degrees: number; raw: string }
  video?: string
}

function photo(file: string, alt: string, caption: string): Photo {
  return { src: `${folder}/${file}.webp`, alt, caption }
}

const observations: Observation[] = [
  {
    id: 'field-library-ramp',
    name: '總圖西南側扶手坡道',
    coordinate: [121.540236, 25.017225],
    location: '由同場照片 GPS 定位，坡道範圍待確認',
    note: '影片可見石板坡面和兩側扶手。拍攝期間有輪椅通過，最窄寬度、坡長和坡度待量測。',
    photos: [photo('library-ramp', '石板坡面與兩側扶手', '扶手坡道下端，取自現場影片。')],
  },
  {
    id: 'field-road-incline',
    name: '柏油路面傾角量測點',
    coordinate: [121.538781, 25.017569],
    location: '照片 GPS，標示拍攝位置',
    note: '手機放在柏油路面取樣。行進方向和量測校正待確認。',
    reading: { degrees: 3, raw: '3N' },
    photos: [photo('asphalt-reading', '手機放在柏油路面，顯示 3N', '柏油路面單點的手機傾角讀值。')],
  },
  {
    id: 'field-curb-incline',
    name: '路緣接縫傾角量測點',
    coordinate: [121.538506, 25.017625],
    location: '取自量測畫面上的經緯度，實際路緣位置待確認',
    note: '路緣與柏油交界可見接縫。手機畫面可讀取傾角，階差高度與輪椅通過方向待確認。',
    reading: { degrees: 2, raw: '2N' },
    photos: [photo('curb-reading', '手機放在路緣旁，顯示 2N', '路緣旁單點的手機傾角讀值。')],
  },
  {
    id: 'field-boya-ramp',
    name: '博雅東側戶外坡道',
    coordinate: [121.537278, 25.018922],
    location: '坡道照片 GPS，對照博雅東側建物與階梯',
    note: '坡道有兩側綠色扶手，旁邊有階梯。影片拍到輪椅沿坡道上行；入口門檻、路寬與坡度待量測。',
    photos: [photo('boya-ramp', '有綠色扶手的博雅戶外坡道', '從坡道下端往上看，可見兩側扶手。')],
    video: `${folder}/boya-ramp.mp4`,
  },
  {
    id: 'field-covered-walkway',
    name: '博雅西南側有遮蔽的走廊',
    coordinate: [121.536331, 25.018492],
    location: '走廊照片 GPS，建物入口名稱待確認',
    note: '可見有遮蔽的磚面走廊、扶手及旁邊的樓梯。走廊和校外或室內路線的接法待確認。',
    photos: [photo('covered-ramp', '磚面走廊右側有扶手與樓梯', '有遮蔽的走廊及旁側樓梯。')],
  },
  {
    id: 'field-tile-incline',
    name: '走廊磚面傾角量測點',
    coordinate: [121.5366, 25.0184],
    location: '影片 GPS，走廊內確切位置待確認',
    note: '影片拍到手機放在走廊磚面。行進方向和量測校正待確認。',
    reading: { degrees: 3, raw: '3S' },
    photos: [photo('tile-reading', '磚面上的手機傾角畫面，顯示 3S', '現場影片的磚面量測畫面。')],
  },
  {
    id: 'field-redline-incline',
    name: '紅線旁柏油傾角量測點',
    coordinate: [121.5379, 25.0184],
    location: '影片 GPS，標示約略拍攝位置',
    note: '影片拍到紅線旁的柏油路面取樣。行進方向和量測校正待確認。',
    reading: { degrees: 1, raw: '1E' },
    photos: [photo('redline-reading', '柏油路上的手機傾角畫面，顯示 1E', '現場影片的柏油路面量測畫面。')],
  },
  {
    id: 'field-bricks',
    name: '草地旁磚面不平處',
    coordinate: [121.540092, 25.018461],
    location: '磚面照片 GPS，標示拍攝位置',
    note: '照片可見鋪面磚塊高低不一、接縫不齊。階差與影響範圍待量測。',
    photos: [photo('brick-surface', '草地旁的地磚有高低差', '草地旁步道的磚面近照。')],
  },
  {
    id: 'field-bicycles',
    name: '腳踏車停放區旁通道',
    coordinate: [121.540436, 25.017911],
    location: '通道照片 GPS，標示拍攝位置',
    note: '拍攝時通道一側停放多輛腳踏車，另一側有欄杆。實際淨寬與通行狀況會隨停放情形變動。',
    photos: [photo('bicycle-lane', '柏油通道旁停有腳踏車', '拍攝當時的停放狀況。')],
  },
]

export function fieldObservation(id: string) {
  return observations.find(point => point.id === id)
}

export function withFieldObservations(catalog: PlaceCatalog): PlaceCatalog {
  const places: CatalogPlace[] = observations.map(point => ({
    id: point.id, name: point.name, coordinate: point.coordinate, category: 'field',
    aliases: ['現場紀錄', '實勘點'], note: point.note, photos: point.photos,
    sourceId: source.id, sourceUrl: point.photos[0].src, retrievedAt: date,
    verifiedAt: null, routePlaceId: null, contextId: null, address: null, openingHours: null,
    wheelchair: null, level: null, indoor: null, widthM: null, slopePercent: null,
  }))
  return { ...catalog, places: [...catalog.places, ...places], sources: [...catalog.sources, source] }
}
