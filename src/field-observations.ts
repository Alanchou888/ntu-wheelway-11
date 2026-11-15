import type { CatalogCategory, CatalogPlace, Coordinate, Photo, PlaceCatalog, PublicSource } from './types'

const date = '2026-11-10'
const folder = '/field/2026-11-10'
const source: PublicSource = {
  id: 'group-11-field', label: '第 11 組實勘紀錄', retrievedAt: date,
  url: `${folder}/boya-ramp.webp`, status: 'ok',
  note: '照片、影片與量測對應地圖上的個別實勘點。',
}

export const fieldKinds = {
  ramp: { symbol: '坡', label: '坡道' },
  narrow: { symbol: '窄', label: '狹窄通道或入口' },
  curb: { symbol: '差', label: '路緣與高低差' },
  uneven: { symbol: '磚', label: '路面不平' },
  temporary: { symbol: '車', label: '可能的暫時阻礙' },
  general: { symbol: '記', label: '一般實勘' },
} as const

interface AngleReading {
  instrument: 'GeoClino' | '手機水平儀'
  degrees: number | null
  source: string
}

export interface FieldObservation {
  id: string
  name: string
  coordinate: Coordinate
  kind: keyof typeof fieldKinds
  attention?: string
  note: string
  location: string
  level?: string
  facilityCategory?: Exclude<CatalogCategory, 'field'>
  files: string
  photos: Photo[]
  width?: { label: string; cm: number; context: string }
  angles?: AngleReading[]
  video?: { src: string; caption: string }
}

function photo(file: string, alt: string, caption: string): Photo {
  return { src: `${folder}/${file}.webp`, alt, caption }
}

const observations: FieldObservation[] = [
  {
    id: 'field-library-ramp',
    name: '總圖階梯旁無障礙坡道',
    kind: 'ramp',
    attention: '組員上坡時感到費力',
    facilityCategory: 'ramp',
    coordinate: [121.540236, 25.017225],
    location: '組員確認量測位置在總圖階梯旁無障礙坡道。地圖依同場照片 GPS 估位。',
    files: 'IMG_0958、IMG_9227（試走影片），IMG_0961、IMG_0963、IMG_0964（手機量測照片）',
    note: '石板坡面兩側有扶手。有練習經驗的組員上坡時仍覺得費力，上肢力量較小的人可能需要協助。',
    angles: [
      { instrument: 'GeoClino', degrees: -5, source: 'IMG_0964 左側手機，垂直刻度（量測組員確認）' },
      { instrument: '手機水平儀', degrees: -6, source: 'IMG_0964 右側手機，螢幕中央' },
      { instrument: '手機水平儀', degrees: -7, source: 'IMG_0961、IMG_0963，螢幕中央' },
    ],
    photos: [photo('library-ramp', '石板坡面與兩側扶手', '從坡道下端看石板面與扶手。'),
      photo('library-level', '石板坡面上的兩支手機，左邊開著 GeoClino，右邊開著水平儀', '兩支手機在石板坡面上的單點量測。')],
  },
  {
    id: 'field-road-incline',
    name: '柏油路面傾角量測點',
    kind: 'general',
    coordinate: [121.538781, 25.017569],
    location: '照片 GPS，標示拍攝位置',
    files: 'IMG_9230、IMG_9231（量測照片）',
    note: '組員把手機放在柏油路面，記錄這個位置的傾角讀值。',
    angles: [{ instrument: 'GeoClino', degrees: 1, source: 'IMG_9230、IMG_9231，左側垂直刻度' }],
    photos: [photo('asphalt-reading', 'GeoClino 手機放在柏油路面上', '柏油路面的量測位置。')],
  },
  {
    id: 'field-curb-incline',
    name: '土木系館前路緣',
    kind: 'curb',
    attention: '穿過路緣接縫時有顛簸',
    coordinate: [121.538506, 25.017625],
    location: '組員確認位於土木系館前。座標取自手機量測畫面。',
    files: 'IMG_0970（試走影片約 00:06.5），IMG_0971 至 IMG_0975（路緣與量測畫面）',
    note: '影片拍到輪椅從柏油面跨過路緣接縫上磚面。組員感到顛簸，上去需要用力。',
    angles: [{ instrument: 'GeoClino', degrees: -15, source: 'IMG_0972 約 00:07.8、IMG_0973 至 IMG_0975，左側垂直刻度' }],
    photos: [photo('curb-overview', '紅線旁的路緣接縫，左側柏油、右側磚面', '柏油面、路緣和磚面的接縫。'),
      photo('curb-reading', '量測手機放在紅線旁的淺色路緣上', '手機量的是這一小段路緣表面。')],
    video: { src: `${folder}/curb-surface.mp4`, caption: '手機放在淺色路緣上。左側是柏油面，右側是磚面。' },
  },
  {
    id: 'field-boya-ramp',
    name: '博雅東側戶外坡道',
    kind: 'ramp',
    attention: '坡道旁有階梯',
    facilityCategory: 'ramp',
    coordinate: [121.537278, 25.018922],
    location: '坡道照片 GPS，對照博雅東側建物與階梯',
    files: 'IMG_5061、IMG_5063、IMG_9237（影片），IMG_5062、IMG_3122（照片）',
    note: '坡道兩側有綠色扶手，旁邊有階梯。影片拍到手動輪椅上坡，旁邊有組員。',
    width: { label: '入口兩端距離', cm: 98, context: '以 iPad 在坡道入口兩端橫向估測。' },
    photos: [photo('boya-ramp', '有綠色扶手的博雅戶外坡道', '從坡道下端往上看，可見兩側扶手。'),
      photo('boya-east-width', 'iPad 在戶外坡道入口標示 98 公分', '坡道入口兩端約 98 公分。')],
    video: { src: `${folder}/boya-ramp.mp4`, caption: '從坡道下端往上看，可見兩側扶手及旁側樓梯。' },
  },
  {
    id: 'field-boya-indoor-ramp',
    name: '博雅館內扶手坡道',
    kind: 'narrow',
    attention: '試走用的手動輪椅勉強通過',
    facilityCategory: 'ramp',
    coordinate: [121.537003, 25.018886],
    level: '一樓',
    location: '一樓位置圖依 IMG_5066 約 00:11 的 103 教室門牌標示。校園地圖的圖釘依 IMG_9238 中量測手機的座標估位。',
    files: 'IMG_5065、IMG_5066（館內影片），IMG_3123（寬度照片），IMG_9238 約 00:00.9（量測畫面）',
    note: '坡道在 103 教室旁。試走時用的手動輪椅勉強通過，較寬的輪椅可能受扶手間距限制。',
    width: { label: '扶手間寬度', cm: 89, context: '以 iPad 在兩側扶手之間橫向估測。' },
    angles: [{ instrument: 'GeoClino', degrees: -4, source: 'IMG_9238 約 00:00.87，左側垂直刻度' }],
    photos: [photo('boya-indoor-width', '博雅館內坡道的扶手間標示 89 公分', '一樓坡道的兩側扶手間約 89 公分。'),
      photo('boya-indoor-reading', '量測手機放在博雅館內的灰色磚面上', '博雅一樓灰色磚面的單點量測。')],
  },
  {
    id: 'field-boya-restroom',
    name: '博雅館內廁所門口',
    kind: 'narrow',
    attention: '門口空間可能限制較寬的輪椅',
    facilityCategory: 'toilet',
    coordinate: [121.5366969, 25.01889],
    level: '一樓',
    location: '校方一樓平面圖標示廁所位於西側電梯旁。校園地圖的圖釘標在建物中心。',
    files: 'IMG_3126（門口寬度照片），IMG_5067 約 00:22 至 00:33（館內試走影片）',
    note: '影片中，手動輪椅進到廁所，門邊有組員。較寬的電動輪椅可能受門口寬度限制。',
    width: { label: '門口寬度', cm: 78, context: 'iPad 單點估測。開門角度與轉向空間也會影響進出。' },
    photos: [photo('boya-restroom-width', '博雅館內廁所門口的量測線標示 78 公分', '一樓廁所門口約 78 公分。')],
  },
  {
    id: 'field-boya-west-ramp',
    name: '博雅西側戶外坡道',
    kind: 'ramp',
    facilityCategory: 'ramp',
    coordinate: [121.5362, 25.0188],
    location: '圖釘依 IMG_5069 影片 GPS 估位。',
    files: 'IMG_5068（照片）、IMG_5069（試走影片）',
    note: '西側正門朝向運動場，門外有戶外坡道。試走時輪椅經過這段坡道，兩側有扶手。',
    photos: [photo('boya-west-ramp', '輪椅經過博雅西側的扶手坡道', '試走時經過西側的戶外坡道。')],
  },
  {
    id: 'field-covered-walkway',
    name: '博雅西南側有遮蔽的走廊',
    kind: 'general',
    coordinate: [121.536331, 25.018492],
    location: '圖釘依走廊照片的 GPS 估位。',
    files: 'IMG_5072（照片）、IMG_5075（走廊影片）',
    note: '回程線附近的有遮蔽走廊。照片可見磚面、扶手與旁邊的樓梯。',
    photos: [photo('covered-ramp', '磚面走廊右側有扶手與樓梯', '有遮蔽的走廊及旁側樓梯。')],
  },
  {
    id: 'field-tile-incline',
    name: '走廊磚面傾角量測點',
    kind: 'general',
    coordinate: [121.5366, 25.0184],
    location: '圖釘依影片的 GPS 估位。',
    files: 'IMG_9243 約 00:03.1（量測畫面）',
    note: '影片拍到手機放在走廊磚面上量測。',
    angles: [{ instrument: 'GeoClino', degrees: -4, source: 'IMG_9243 約 00:03.1，左側垂直刻度' }],
    photos: [photo('tile-reading', '開著 GeoClino 的手機放在走廊磚面上', '走廊磚面的量測位置。')],
  },
  {
    id: 'field-redline-incline',
    name: '紅線旁柏油傾角量測點',
    kind: 'general',
    coordinate: [121.5379, 25.0184],
    location: '影片 GPS，標示約略拍攝位置',
    files: 'IMG_9244 約 00:02.5（量測畫面）',
    note: '影片拍到手機放在紅線旁的柏油面上量測。',
    angles: [{ instrument: 'GeoClino', degrees: -2, source: 'IMG_9244 約 00:02.5，左側垂直刻度' }],
    photos: [photo('redline-reading', '開著 GeoClino 的手機放在紅線旁的柏油面上', '紅線旁柏油面的量測位置。')],
  },
  {
    id: 'field-bricks',
    name: '草地旁磚面不平處',
    kind: 'uneven',
    attention: '磚塊高低不一，接縫不齊',
    coordinate: [121.540092, 25.018461],
    location: '磚面照片 GPS，標示拍攝位置',
    files: 'IMG_5079（照片）、IMG_9245（路面影片）',
    note: '照片可見草地旁的鋪面磚塊高低不一、接縫不齊。',
    photos: [photo('brick-surface', '草地旁的地磚有高低差', '草地旁步道的磚面近照。')],
  },
  {
    id: 'field-bicycles',
    name: '腳踏車停放區旁通道',
    kind: 'temporary',
    attention: '通道寬度會隨單側停車情形變動',
    coordinate: [121.540436, 25.017911],
    location: '通道照片 GPS，標示拍攝位置',
    files: 'IMG_5084（照片）',
    note: '拍攝時通道一側停放多輛腳踏車，另一側有欄杆。通道寬度會隨停放情形變動。',
    photos: [photo('bicycle-lane', '柏油通道旁停有腳踏車', '拍攝當時的停放狀況。')],
  },
]

export function fieldObservation(id: string) {
  return observations.find(point => point.id === id)
}

export function formatFieldAngle(degrees: number | null): string {
  return degrees === null ? '待確認' : `${String(degrees).replace('-', '−')}°`
}

export function withFieldObservations(catalog: PlaceCatalog): PlaceCatalog {
  const places: CatalogPlace[] = observations.map(point => ({
    id: point.id, name: point.name, coordinate: point.coordinate, category: 'field',
    aliases: ['現場紀錄', '實勘點', fieldKinds[point.kind].label], note: point.note, photos: point.photos,
    sourceId: source.id, sourceUrl: point.photos[0].src, retrievedAt: date,
    verifiedAt: null, routePlaceId: null, contextId: null, address: null, openingHours: null,
    wheelchair: null, level: point.level ?? null, indoor: null, widthM: null, slopePercent: null,
  }))
  return { ...catalog, places: [...catalog.places, ...places], sources: [...catalog.sources, source] }
}
