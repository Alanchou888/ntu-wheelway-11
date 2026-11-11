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
    name: '總圖階梯旁無障礙坡道',
    coordinate: [121.540236, 25.017225],
    location: '由同場照片 GPS 定位，坡道範圍待確認',
    note: '石板坡面兩側有扶手。組員試走時，即使平常有練習，上坡仍相當費力。依組員觀察，上肢力氣較小的使用者上下坡可能需要協助。坡度、坡長與最窄寬度待量測。',
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
    name: '土木系館前路緣',
    coordinate: [121.538506, 25.017625],
    location: '組員確認位於土木系館前。座標取自手機量測畫面。',
    note: '路緣接縫顛簸，試走時輪椅上去需要用力。手機的量測面、通過方向與階差高度待確認。',
    reading: { degrees: 2, raw: '2N' },
    photos: [photo('curb-reading', '手機放在路緣旁，顯示 2N', '路緣旁單點的手機傾角讀值。')],
  },
  {
    id: 'field-boya-ramp',
    name: '博雅東側戶外坡道',
    coordinate: [121.537278, 25.018922],
    location: '坡道照片 GPS，對照博雅東側建物與階梯',
    note: '坡道有兩側綠色扶手，旁邊有階梯。IMG_3122 的 iPad 截圖顯示入口兩側量測線約 98 公分。組員反映這類狹窄處手動輪椅勉強可過，較寬的輪椅可能無法通過。全段最窄淨寬仍待複測。',
    photos: [photo('boya-ramp', '有綠色扶手的博雅戶外坡道', '從坡道下端往上看，可見兩側扶手。'),
      photo('boya-east-width', 'iPad 在戶外坡道入口標示 98 公分', 'IMG_3122 的入口橫向估測，約 98 公分。')],
    video: `${folder}/boya-ramp.mp4`,
  },
  {
    id: 'field-boya-indoor-ramp',
    name: '博雅館內扶手坡道',
    coordinate: [121.5368, 25.0192],
    location: '依同時段 IMG_9238 影片 GPS 標示約略位置，樓層與連接的門待確認。',
    note: '組員確認 IMG_5065 位於博雅館內。IMG_3123、IMG_3124 的 iPad 截圖在同一處扶手間分別標出約 89、91 公分。組員反映手動輪椅勉強能過較窄處，較寬的輪椅可能無法通過。',
    photos: [photo('boya-indoor-width', '博雅館內坡道的扶手間標示 91 公分', 'IMG_3124 的單點估測約 91 公分，同一處另一次估測約 89 公分。')],
  },
  {
    id: 'field-boya-west-ramp',
    name: '博雅西側戶外坡道',
    coordinate: [121.5362, 25.0188],
    location: '依 IMG_5069 影片 GPS 標示約略拍攝位置，出口門待確認。',
    note: '組員確認這段是博雅館外的坡道。影片可見輪椅經過兩側有扶手的坡面，淨寬與坡度待量測。',
    photos: [photo('boya-west-ramp', '輪椅經過博雅西側的扶手坡道', '取自 IMG_5069 的戶外坡道畫面。')],
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
