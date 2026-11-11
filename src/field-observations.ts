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
  files: string
  photos: Photo[]
  readings?: { label: string; value: string; context: string }[]
  video?: { src: string; caption: string }
}

function photo(file: string, alt: string, caption: string): Photo {
  return { src: `${folder}/${file}.webp`, alt, caption }
}

const observations: Observation[] = [
  {
    id: 'field-library-ramp',
    name: '總圖階梯旁無障礙坡道',
    coordinate: [121.540236, 25.017225],
    location: '由同場照片 GPS 定位。坡道兩端及手機放置的位置待核對。',
    files: 'IMG_0958、IMG_9227（試走影片），IMG_0961、IMG_0963、IMG_0964（手機量測照片）',
    note: '石板坡面兩側有扶手。平常有練習的組員試上坡時仍覺得費力，上肢力量較小的使用者可能需要協助。坡長與最窄淨寬待量。',
    readings: [{ label: '附近石面讀值', value: '−7°、−6°、0E', context: '−6° 和 0E 來自同一張照片中的兩支手機。放置位置和方向待核對，坡道坡度需重新量測。' }],
    photos: [photo('library-ramp', '石板坡面與兩側扶手', '坡道下端，取自 IMG_0958。'),
      photo('library-level', '兩支手機在石面上分別顯示 0E 與 −6 度', 'IMG_0964。兩支手機在紅色石面上的原始讀值。')],
  },
  {
    id: 'field-road-incline',
    name: '柏油路面傾角量測點',
    coordinate: [121.538781, 25.017569],
    location: '照片 GPS，標示拍攝位置',
    files: 'IMG_9230、IMG_9231（量測照片）',
    note: '手機放在柏油路面取樣。行進方向和量測校正待確認。',
    readings: [{ label: '手機傾角讀值', value: '3N', context: '柏油路面單點，保留畫面原始讀值。' }],
    photos: [photo('asphalt-reading', '手機放在柏油路面，顯示 3N', '柏油路面單點的手機傾角讀值。')],
  },
  {
    id: 'field-curb-incline',
    name: '土木系館前路緣',
    coordinate: [121.538506, 25.017625],
    location: '組員確認位於土木系館前。座標取自手機量測畫面。',
    files: 'IMG_0970（試走影片約 00:06.5），IMG_0971 至 IMG_0975（路緣與量測畫面）',
    note: '影片拍到輪椅從柏油面跨過路緣接縫上磚面。組員感到顛簸，上去需要用力。階差高度待量。',
    readings: [{ label: '手機傾角讀值', value: '2N', context: '手機放在紅線旁的淺色路緣。高度和沿行進方向的坡度仍待量測。' }],
    photos: [photo('curb-overview', '紅線旁的路緣接縫，左側柏油、右側磚面', 'IMG_0972 開頭，可看見柏油、路緣和磚面相接。'),
      photo('curb-reading', '手機放在路緣旁，顯示 2N', 'IMG_0973 的路緣單點讀值。')],
    video: { src: `${folder}/curb-surface.mp4`, caption: '手機放在淺色路緣上。左側是柏油面，右側是磚面。' },
  },
  {
    id: 'field-boya-ramp',
    name: '博雅東側戶外坡道',
    coordinate: [121.537278, 25.018922],
    location: '坡道照片 GPS，對照博雅東側建物與階梯',
    files: 'IMG_5061、IMG_5063、IMG_9237（影片），IMG_5062、IMG_3122（照片）',
    note: '坡道兩側有綠色扶手，旁邊有階梯。影片拍到本次試用的手動輪椅上坡，旁邊有組員。獨立通過及較寬輪椅的情形待確認。',
    readings: [{ label: '入口兩端約距', value: '98 公分', context: 'iPad 在入口兩端的橫向估測。扶手內側最窄淨寬待量。' }],
    photos: [photo('boya-ramp', '有綠色扶手的博雅戶外坡道', '從坡道下端往上看，可見兩側扶手。'),
      photo('boya-east-width', 'iPad 在戶外坡道入口標示 98 公分', 'IMG_3122 的入口橫向估測，約 98 公分。')],
    video: { src: `${folder}/boya-ramp.mp4`, caption: '從坡道下端往上看，可見兩側扶手及旁側樓梯。' },
  },
  {
    id: 'field-boya-indoor-ramp',
    name: '博雅館內扶手坡道',
    coordinate: [121.537003, 25.018886],
    location: '以 IMG_9238 中量測手機顯示的座標估位，影片本身的 GPS 有偏移。樓層、轉折與門的位置待核對。',
    files: 'IMG_5065、IMG_5066（館內影片），IMG_3123（寬度照片），IMG_9238 約 00:00.9（量測畫面）',
    note: '組員試走時，本次使用的手動輪椅勉強能過。較寬的輪椅可能受限，需核對扶手間最窄處。',
    readings: [
      { label: '扶手間約寬', value: '89 公分', context: 'iPad 橫向估測。採用組員確認的 89 公分讀值。' },
      { label: '手機傾角讀值', value: '1W', context: '館內灰色磚面的單點讀值，量測方向待確認。' },
    ],
    photos: [photo('boya-indoor-width', '博雅館內坡道的扶手間標示 89 公分', 'IMG_3123 的扶手間單點估測，約 89 公分。'),
      photo('boya-indoor-reading', '手機放在博雅館內的磚面上，顯示 1W', 'IMG_9238 約 00:00.9 的手機傾角畫面。')],
  },
  {
    id: 'field-boya-restroom',
    name: '博雅館內廁所門口',
    coordinate: [121.5366969, 25.01889],
    location: '組員確認位於博雅館內。地圖標在建物中心，廁所的樓層與門口位置待確認。',
    files: 'IMG_3126（門口寬度照片），IMG_5067 約 00:22 至 00:33（館內試走影片）',
    note: '影片可見本次試用的手動輪椅進入廁所，門邊有組員。能否獨立進出仍待確認。較寬的電動輪椅可能受限，現場尚未試走。',
    readings: [{ label: '門口約寬', value: '78 公分', context: 'iPad 單點估測。開門角度與轉向空間也會影響進出。' }],
    photos: [photo('boya-restroom-width', '博雅館內廁所門口的量測線標示 78 公分', 'IMG_3126 的門口單點估測，約 78 公分。')],
  },
  {
    id: 'field-boya-west-ramp',
    name: '博雅西側戶外坡道',
    coordinate: [121.5362, 25.0188],
    location: '依 IMG_5069 影片 GPS 標示約略拍攝位置，出口門待確認。',
    files: 'IMG_5068（照片）、IMG_5069（試走影片）',
    note: '組員確認這段是博雅館外的坡道。影片可見輪椅經過兩側有扶手的坡面，淨寬與坡度待量測。',
    photos: [photo('boya-west-ramp', '輪椅經過博雅西側的扶手坡道', '取自 IMG_5069 的戶外坡道畫面。')],
  },
  {
    id: 'field-covered-walkway',
    name: '博雅西南側有遮蔽的走廊',
    coordinate: [121.536331, 25.018492],
    location: '走廊照片 GPS，建物入口名稱待確認',
    files: 'IMG_5072（照片）、IMG_5075（走廊影片）',
    note: '可見有遮蔽的磚面走廊、扶手及旁邊的樓梯。與回程主線的接法待核對。',
    photos: [photo('covered-ramp', '磚面走廊右側有扶手與樓梯', '有遮蔽的走廊及旁側樓梯。')],
  },
  {
    id: 'field-tile-incline',
    name: '走廊磚面傾角量測點',
    coordinate: [121.5366, 25.0184],
    location: '影片 GPS，走廊內確切位置待確認',
    files: 'IMG_9243 約 00:03.1（量測畫面）',
    note: '影片拍到手機放在走廊磚面。行進方向和量測校正待確認。',
    readings: [{ label: '手機傾角讀值', value: '3S', context: '走廊磚面單點，保留畫面原始讀值。' }],
    photos: [photo('tile-reading', '磚面上的手機傾角畫面，顯示 3S', '現場影片的磚面量測畫面。')],
  },
  {
    id: 'field-redline-incline',
    name: '紅線旁柏油傾角量測點',
    coordinate: [121.5379, 25.0184],
    location: '影片 GPS，標示約略拍攝位置',
    files: 'IMG_9244 約 00:02.5（量測畫面）',
    note: '影片拍到紅線旁的柏油路面取樣。行進方向和量測校正待確認。',
    readings: [{ label: '手機傾角讀值', value: '1E', context: '紅線旁柏油路面單點，保留畫面原始讀值。' }],
    photos: [photo('redline-reading', '柏油路上的手機傾角畫面，顯示 1E', '現場影片的柏油路面量測畫面。')],
  },
  {
    id: 'field-bricks',
    name: '草地旁磚面不平處',
    coordinate: [121.540092, 25.018461],
    location: '磚面照片 GPS，標示拍攝位置',
    files: 'IMG_5079（照片）、IMG_9245（路面影片）',
    note: '照片可見鋪面磚塊高低不一、接縫不齊。階差與影響範圍待量測。',
    photos: [photo('brick-surface', '草地旁的地磚有高低差', '草地旁步道的磚面近照。')],
  },
  {
    id: 'field-bicycles',
    name: '腳踏車停放區旁通道',
    coordinate: [121.540436, 25.017911],
    location: '通道照片 GPS，標示拍攝位置',
    files: 'IMG_5084（照片）',
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
