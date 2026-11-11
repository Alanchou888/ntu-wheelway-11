import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Accessibility, ArrowDownUp, ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Copy, Footprints, Info, LoaderCircle, MessageSquare, Mountain, Printer, Route as RouteIcon, ShieldCheck, SlidersHorizontal, TriangleAlert, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CampusMap, { colors } from './CampusMap'
import type { Campus, CatalogCategory, CatalogPlace, Coordinate, Entrance, Mode, NavigationState, Route, Screen, Segment } from './types'
import { buildWalkedRoutes } from './walked-routes'
import { formatDate, formatDistance, fromHash, lineDistance, lineMidpoint, metrics, placeNames, reverseRoute, segmentLabel, toHash } from './routes'
import { BottleneckList, ComparisonSummary } from './RouteInsights'
import { daysSince, emptyLimits, favoriteFor, flushSurveyDraft, oldestVerification, readFavorites, readInitialNavigation, resolveSharedRoute, savePreferences, selectCandidates, writeFavorites } from './product'
import type { Favorite } from './product'
import { HelpPage, LimitControls, SavedRoutes, UnavailableRoute } from './ProductScreens'
import PhotoGallery from './PhotoGallery'
import PrintableRoute from './PrintableRoute'
import OfflineStatus from './OfflineStatus'
import { useCampusData } from './useCampusData'
import MapSheet from './MapSheet'
import type { SheetSize } from './MapSheet'
import RouteExplorer from './RouteExplorer'
import { useMediaQuery, useRouteTour } from './useRouteTour'
import { CommunityDialog, CommunitySection } from './Community'
import { useCommunity } from './useCommunity'
import { communitySummary } from './community-model'
import {usePlaceCatalog} from './usePlaceCatalog'
import {categoryLabels,clearRecentPlaces,findPlaces,placeEndpointPatch,readRecentPlaces,rememberPlace} from './places'
import {CatalogStatus,PlaceCard,PlaceList,PlaceSearch} from './PlaceDiscovery'
import { fieldObservation } from './field-observations'
import './product.css'
import './campus-design.css'
import './route-experience.css'
import { conditionDataReady, filterConditions, routeReports } from './road-conditions'
import ConditionControls from './ConditionControls'
import './road-conditions.css'

const SurveyEditor = lazy(() => import('./SurveyEditor'))

const screens: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: 'setup', label: '設定條件', icon: SlidersHorizontal },
  { id: 'compare', label: '比較路線', icon: RouteIcon },
  { id: 'detail', label: '檢視路段', icon: Footprints },
  { id: 'confirm', label: '確認動線', icon: CheckCircle2 },
]
const metricValue = (n: number | null, suffix: string) => n === null ? '尚無資料' : `${Number(n.toFixed(1))}${suffix}`

function defaultSheetSize(state: NavigationState): SheetSize {
  if (state.category === 'field' || state.placeId?.startsWith('field-')) return 'full'
  if (state.screen === 'detail' && state.mode === 'demo' && !state.placeId && !state.category) return 'full'
  return state.screen === 'compare' && state.mode === 'demo' && !state.placeId && !state.category ? 'map' : 'half'
}

function WalkedRoutePicker({ routes, onOpen }: { routes: Route[]; onOpen: (route: Route) => void }) {
  return <div className="walked-route-picker" id="walked-route-picker" role="group" aria-label="選擇試走方向" tabIndex={-1}>
    {routes.map(route => {
      const returning = route.id === 'walk-back'
      return <button key={route.id} onClick={() => onOpen(route)} aria-label={`查看${route.name}`}>
        <span className="walked-picker-line" style={{ backgroundColor: returning ? colors['walk-back'] : colors['walk-out'] }} aria-hidden="true" />
        <span><strong>{returning ? '回程' : '去程'}<small>約 {formatDistance(metrics(route).distanceM)}</small></strong>
          <span>{returning ? '博雅西側 → 總圖' : '總圖 → 博雅西側'}</span>
        </span>
      </button>
    })}
  </div>
}

function RouteStats({ route, compact = false }: { route: Route; compact?: boolean }) {
  const m = metrics(route)
  return <div className={`route-stats ${compact ? 'compact' : ''}`}>
    <div><span>{route.walked ? '圖上約距' : '總距離'}</span><strong>{Math.round(m.distanceM)}<small>m</small></strong></div>
    <div><span>最大坡度</span><strong className={m.maxSlopePercent === null ? 'unknown-value' : ''}>{metricValue(m.maxSlopePercent, '')}{m.maxSlopePercent !== null && <small>%</small>}</strong></div>
    <div><span>最窄路寬</span><strong className={m.minWidthM === null ? 'unknown-value' : ''}>{metricValue(m.minWidthM, '')}{m.minWidthM !== null && <small>m</small>}</strong></div>
  </div>
}

function SourceDialog({ campus, onClose }: { campus: Campus; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="sources-dialog" aria-labelledby="sources-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="dialog-header"><h2 id="sources-title">資料來源與取得日期</h2><button className="icon-button" onClick={onClose} aria-label="關閉資料來源"><X size={22} /></button></div>
    <p className="dialog-intro">地圖與設施來自公開圖資。試走路線由第 11 組依地標及照片重繪。</p>
    <div className="source-list">{campus.sources.map(source => <article key={source.id} className="source-card"><div className="source-card-top"><strong>{source.label}</strong><span className={`tiny-badge ${source.status === 'cached' ? 'amber' : ''}`}>{source.status === 'cached' ? '保留快照' : '公開資料'}</span></div><p>取得日期：{formatDate(source.retrievedAt)}</p>{source.note && <p>{source.note}</p>}<a href={source.url} target="_blank" rel="noreferrer">查看原始來源 <ArrowRight size={14} /></a></article>)}</div>
    <div className="source-explainer"><Info size={19} /><p>臺大建物座標用於地點定位。入口位置與整段路線通行條件，需另外查核。試走路段保留現場觀察，未量測的欄位顯示待查核。</p></div>
    <a className="text-link template-link" href="/templates/field-survey.csv" download><ClipboardCheck size={17} />下載空白實勘紀錄範本</a>
    <button className="button secondary wide" onClick={onClose}>返回地圖</button>
  </dialog>
}

function EmptyRoutes({ onDemo, onSetup, onRetry, failed, filtered }: { onDemo: () => void; onSetup: () => void; onRetry: () => void; failed: boolean; filtered: boolean }) {
  return <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={34} strokeWidth={1.5} /></div><span className="eyebrow">{filtered ? '依目前條件篩選' : '等待實勘資料'}</span><h2 id="panel-heading" tabIndex={-1}>{failed ? '查核資料暫時無法載入' : filtered ? '目前沒有符合條件的路線' : '目前無已查核路線'}</h2><p>{failed ? '圖資仍可使用。請重新載入查核資料，或先體驗示範模式。' : filtered ? '可以查看下方排除原因，再回設定調整自己的通行限制。' : '總圖至博雅的入口與路段尚待團隊實地查核。你可以先使用示範路線，體驗完整選路流程。'}</p><div className="empty-rule"><ShieldCheck size={20} /><span>{filtered ? '路線會依量測限制及你開啟的社群避開條件排除，請查看下方原因。' : '僅列出全程及兩端入口皆已查核、無階梯且未封閉的實勘路線。'}</span></div>{failed && <button className="button primary wide" onClick={onRetry}>重新載入查核資料</button>}{!filtered && <button className="button secondary wide" onClick={onDemo}>查看兩段試走路線<ArrowRight size={18} /></button>}<button className="button plain wide" onClick={onSetup}>返回設定條件</button></div>
}

function EntranceCard({ entrance, letter }: { entrance: Entrance; letter: string }) {
  return <details className="entrance-card"><summary><span className="entry-letter">{letter}</span><div><span>{letter === 'A' ? '起點入口' : '終點入口'}</span><strong>{entrance.name}</strong></div><ChevronDown size={17} /></summary><div className="entry-body"><p>{entrance.source}</p><p>查核日期：{formatDate(entrance.verifiedAt)}</p><PhotoGallery key={entrance.id} photos={entrance.photos} /></div></details>
}

function SegmentInfo({ segment, onOpenPhoto, onSelectField }: { segment: Segment; onOpenPhoto: () => void; onSelectField: (id: string) => void }) {
  const facts = [
    ['最大坡度', metricValue(segment.maxSlopePercent, '%')], ['有效路寬', metricValue(segment.minWidthM, ' m')],
    ['最大階差', metricValue(segment.stepHeightCm, ' cm')], ['坡道長度', metricValue(segment.rampLengthM, ' m')],
    ['路面條件', segment.surface ?? '尚無資料'], ['階梯', segment.hasStairs === null ? '尚未確認' : segment.hasStairs ? '有階梯' : '無階梯'],
  ]
  const measurements = <dl className="fact-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  return <article className={`segment-info ${segment.fieldPointIds ? 'walked-segment-info' : ''}`}><div className="section-heading"><h3>{segment.name}</h3><span className={`tiny-badge ${segment.status === 'demo' ? 'amber' : ''}`}>{segmentLabel(segment)}</span></div>
    {segment.fieldPointIds ? <>
      {segment.fieldPointIds.length ? <div className="segment-field-links" role="group" aria-label="這段附近的實勘點">
        <p>這段附近的實勘點</p>
        {segment.fieldPointIds.map(id => {
          const point = fieldObservation(id)
          if (!point) return null
          return <button key={id} onClick={() => onSelectField(id)}>
            <span><strong>{point.name}</strong><small>{point.readings?.map(reading => reading.value).join(' · ') ?? '現場照片'}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        })}
      </div> : <p className="segment-no-points">這段暫無獨立實勘點。</p>}
      <details className="evidence-details segment-measurements"><summary>全段通行條件待查核<ChevronDown size={15} /></summary>{measurements}</details>
    </> : <>{measurements}
      <PhotoGallery key={segment.id} photos={segment.photos} onOpen={onOpenPhoto} />
      <div className={`obstacle-note ${segment.obstacles.length ? 'has-obstacle' : ''}`}><Info size={17} /><p>{segment.obstacles.length ? segment.obstacles.join('、') : segment.status === 'demo' ? '此段未設定額外障礙，實際情況待查核。' : '這段的固定障礙待確認。'}</p></div>
    </>}
    <details className="evidence-details"><summary>資料依據與查核資訊<ChevronDown size={15} /></summary><div><p><span>查核狀態</span>{segmentLabel(segment)}</p><p><span>查核日期</span>{formatDate(segment.verifiedAt)}</p><p><span>圖資取得</span>{formatDate(segment.retrievedAt)}</p><p className="source-text">{segment.source}</p>{segment.sourceUrl && <a href={segment.sourceUrl} target="_blank" rel="noreferrer">查看來源 <ArrowRight size={13} /></a>}</div></details>
  </article>
}

export default function App() {
  const [state, setState] = useState<NavigationState>(readInitialNavigation)
  const { campus, survey, loading, loadError, surveyLoading, surveyError, retryCampus, retrySurvey } = useCampusData()
  const placeData=usePlaceCatalog(campus)
  const catalog=placeData.catalog
  const [placeQuery,setPlaceQuery]=useState('')
  const [recentPlaces,setRecentPlaces]=useState<string[]>([])
  const [placeFeedback,setPlaceFeedback]=useState('')
  const [fieldGroup,setFieldGroup]=useState<string[]>()
  const discovering=!!state.placeId||!!state.category||!!placeQuery.trim()
  const selectedPlace=catalog?.places.find(p=>p.id===state.placeId)
  const foundPlaces=useMemo(() => {
    const matches = catalog ? findPlaces(catalog.places,placeQuery,state.category) : []
    return fieldGroup ? matches.filter(place => fieldGroup.includes(place.id)) : matches
  },[catalog,placeQuery,state.category,fieldGroup])
  useEffect(()=>{if(catalog)setRecentPlaces(readRecentPlaces(catalog.places))},[catalog])
  const [showSources, setShowSources] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [copyFallback, setCopyFallback] = useState(false)
  const [favorites, setFavorites] = useState(readFavorites)
  const [favoriteMessage, setFavoriteMessage] = useState('')
  const [undoFavorites, setUndoFavorites] = useState<Favorite[] | null>(null)
  const [profileFeedback, setProfileFeedback] = useState('')
  const [sheetSize, setSheetSize] = useState<SheetSize>(() => defaultSheetSize(state))
  const [communityOpen, setCommunityOpen] = useState(false)
  const [communitySegment, setCommunitySegment] = useState('')
  const [communityFocus, setCommunityFocus] = useState<{ coordinate: Coordinate; request: number }>()
  const community = useCommunity(!!campus)
  const mobile = useMediaQuery('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)')
  const panelRef = useRef<HTMLElement>(null)
  useEffect(()=>{
    panelRef.current?.querySelector('.panel-main')?.scrollTo({top:0})
  },[state.placeId,state.category,placeQuery,fieldGroup])

  useEffect(() => {
    const handler = async () => {
      const next = fromHash(window.location.hash)
      if (state.screen === 'editor' && next.screen !== 'editor') {
        try { await flushSurveyDraft() }
        catch { window.history.replaceState(null, '', toHash(state)); return }
      }
      if (next.screen !== state.screen || next.placeId !== state.placeId || next.category !== state.category) {
        setSheetSize(defaultSheetSize(next))
        if (next.category !== 'field' || next.screen !== state.screen) setFieldGroup(undefined)
      }
      setState(next)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [state])
  const navigate = async (patch: Partial<NavigationState>) => {
    if (state.screen === 'editor') { try { await flushSurveyDraft() } catch { return } }
    const next = { ...state, ...(patch.origin && patch.origin !== state.origin ? { routeId: '', segmentId: '' } : {}), ...(patch.screen?{placeId:undefined,category:undefined}:{}), ...patch }
    if(patch.screen){setPlaceQuery('');setPlaceFeedback('')}
    if (patch.screen || 'category' in patch && next.category !== 'field') setFieldGroup(undefined)
    if (patch.screen) setSheetSize(defaultSheetSize(next))
    setState(next)
    const hash = toHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setCopyMessage('')
    setCopyFallback(false)
    setFavoriteMessage('')
    if (state.screen === 'saved' && patch.screen && patch.screen !== 'saved') setUndoFavorites(null)
    if ('wheelchair' in patch || 'preference' in patch || 'limits' in patch) setProfileFeedback('')
  }
  const allRoutes = useMemo(() => campus ? [...buildWalkedRoutes(), ...survey.routes] : [], [campus, survey])
  const communitySegments = useMemo(() => allRoutes.flatMap(route => route.segments.map(segment => ({ id: segment.id, name: segment.name, routeName: route.name, coordinate: lineMidpoint(segment.coordinates), coordinates: segment.coordinates }))), [allRoutes])
  const candidates = useMemo(() => filterConditions(selectCandidates(allRoutes, state), community.reports, { enabled: !!state.avoidReports, ready: conditionDataReady(community.fetchedAt, community.error, community.now), now: community.now, segments: communitySegments }), [allRoutes, state.mode, state.preference, state.limits, state.avoidReports, community.reports, community.fetchedAt, community.error, community.now, communitySegments])
  const routes = useMemo(() => {
    const accepted = candidates.accepted.map(route => route.walked || state.origin === route.originEntrance.placeId ? route : reverseRoute(route))
    return state.mode === 'demo' ? accepted.sort((a, b) => Number(b.originEntrance.placeId === state.origin) - Number(a.originEntrance.placeId === state.origin)) : accepted
  }, [candidates, state.origin, state.mode])
  const resolved = resolveSharedRoute(routes, state)
  const selected = resolved.route ?? (state.screen === 'setup' || state.screen === 'compare' ? routes[0] : undefined)
  const baseSegment = selected?.segments.find(s => s.id === state.segmentId) ?? selected?.segments[0]
  const tourRoute = selected && !resolved.problem && !discovering && ['detail', 'confirm'].includes(state.screen) && (state.mode === 'demo' || !surveyLoading) ? selected : null
  const tour = useRouteTour(tourRoute, state.segmentId)
  const activeSegment = tourRoute && tour.engaged && tour.position ? tour.position.leg.segment : baseSegment
  const destination = state.origin === 'library' ? 'boya' : 'library'
  const step = screens.findIndex(s => s.id === state.screen)
  const isDemo = state.mode === 'demo'

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
    const heading = document.getElementById('panel-heading')
    heading?.focus({ preventScroll: true })
  }, [state.screen, loading])

  const chooseMode = (mode: Mode) => navigate({ mode, screen: state.screen === 'setup' ? 'setup' : 'compare', routeId: '', segmentId: '' })
  const query = () => navigate({ screen: routes.length === 1 ? 'detail' : 'compare', routeId: routes[0]?.id ?? '', segmentId: routes[0]?.segments[0]?.id ?? '' })
  const openRoute = (route: Route) => navigate({ screen: 'detail', origin: route.originEntrance.placeId, routeId: route.id, segmentId: route.segments[0]?.id ?? '' })
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${toHash({ ...state, screen: 'confirm', routeId: selected?.id ?? state.routeId })}`
    try { await navigator.clipboard.writeText(url); setCopyMessage('路線連結已複製') }
    catch { setCopyMessage('請從下方欄位複製連結'); setCopyFallback(true) }
  }
  const persistFavorites = (next: Favorite[]) => {
    try { writeFavorites(next); setFavorites(next); return true }
    catch { setFavoriteMessage('這個瀏覽器無法保存收藏，仍可複製路線連結。'); return false }
  }
  const saveFavorite = () => {
    if (!selected) return
    const favorite = favoriteFor(selected, state)
    if (favorites.length >= 20 && !favorites.some(f => f.key === favorite.key)) { setFavoriteMessage('已收藏 20 條動線，請先移除不需要的收藏。'); return }
    if (persistFavorites([favorite, ...favorites.filter(f => f.key !== favorite.key)])) { setUndoFavorites(null); setFavoriteMessage('已收藏在這個瀏覽器，可從「我的收藏」開啟。') }
  }
  const remember = () => { try { savePreferences(state); setProfileFeedback('已記住輪椅類型、偏好、通行條件及路況避開設定。') } catch { setProfileFeedback('這個瀏覽器無法記住設定，仍可繼續選路。') } }
  const inspectTourSegment = (segment: Segment) => {
    tour.pause()
    void navigate({ screen: 'detail', routeId: selected?.id ?? '', segmentId: segment.id })
    if (mobile) setSheetSize('full')
  }
  const startTour = () => {
    if (mobile) {
      setSheetSize('map')
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('.sheet-collapsed .tour-play')?.focus({ preventScroll: true }))
    }
  }
  const explorer = tourRoute ? <RouteExplorer route={tourRoute} tour={tour} onInspect={inspectTourSegment} onStart={startTour} /> : null
  const openCommunity = (segmentId = '') => { tour.pause(); setCommunitySegment(segmentId); setCommunityOpen(true) }
  const inspectCommunitySegment = (id: string, coordinate?: Coordinate | null) => {
    const route = routes.find(r => r.segments.some(s => s.id === id))
    if (!route) return false
    tour.pause()
    void navigate({ screen: 'detail', origin: route.originEntrance.placeId, routeId: route.id, segmentId: id, mapTheme: 'conditions' })
    if (coordinate) setCommunityFocus(previous => ({ coordinate, request: (previous?.request ?? 0) + 1 }))
    setSheetSize('full')
    return true
  }

  const clearDiscovery=()=>{
    setPlaceQuery('');setPlaceFeedback('');void navigate({placeId:undefined,category:undefined})
    const nextSize = defaultSheetSize({ ...state, placeId: undefined, category: undefined })
    setSheetSize(nextSize)
    requestAnimationFrame(() => {
      const heading = mobile && nextSize === 'map' ? 'walked-route-picker' : 'panel-heading'
      document.getElementById(heading)?.focus({ preventScroll: true })
    })
  }
  const choosePlace=(place:CatalogPlace)=>{
    tour.pause();setPlaceQuery('');setPlaceFeedback('')
    const recent=rememberPlace(place.id,recentPlaces);setRecentPlaces(recent.ids)
    if(!recent.saved)setPlaceFeedback('目前瀏覽器無法保存最近查看，地點仍可使用。')
    void navigate({placeId:place.id});setSheetSize(place.category==='field'?'full':'half')
  }
  const chooseCategory=(category:CatalogCategory)=>{
    if (state.category === category && !fieldGroup) { clearDiscovery(); return }
    tour.pause();setFieldGroup(undefined);setPlaceQuery('');setPlaceFeedback('')
    void navigate({category,placeId:undefined});setSheetSize(category==='field'?'full':'half')
    requestAnimationFrame(()=>document.getElementById('place-heading')?.focus({preventScroll:true}))
  }
  const chooseFieldGroup = (ids: string[]) => {
    tour.pause()
    setPlaceQuery('')
    setPlaceFeedback('')
    setFieldGroup(ids)
    void navigate({ category: 'field', placeId: undefined })
    setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const choosePlaceById = (id: string) => {
    const place = catalog?.places.find(place => place.id === id)
    if (place) choosePlace(place)
  }
  const closePlace = () => {
    if (!state.category) { clearDiscovery(); return }
    void navigate({ placeId: undefined })
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const showAllFieldPoints = fieldGroup ? () => {
    setFieldGroup(undefined)
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  } : undefined
  const segmentTabs = selected && activeSegment ? <div className="segment-tabs" role="group" aria-label="選擇路段">
    {selected.segments.map((segment, index) => <button key={segment.id} aria-label={`路段 ${index + 1}：${segment.name}`} aria-pressed={activeSegment.id === segment.id} className={activeSegment.id === segment.id ? 'active' : ''} onClick={event => {
      void navigate({ segmentId: segment.id })
      const picker = event.currentTarget.closest<HTMLDetailsElement>('.walked-segment-picker')
      if (picker) {
        picker.open = false
        picker.querySelector('summary')?.focus({ preventScroll: true })
      }
    }}><span>{index + 1}</span><div><strong>{segment.name}</strong><small>{formatDistance(lineDistance(segment.coordinates))}</small></div><ChevronRight size={15} /></button>)}
  </div> : null
  const mobilePreview = mobile && explorer && <details className="mobile-route-preview">
    <summary>路線預演<ChevronDown size={16} aria-hidden="true" /></summary>
    {explorer}
  </details>
  const setPlaceEndpoint=(action:'from'|'to')=>{
    if(!selectedPlace)return
    const patch=placeEndpointPatch(selectedPlace,action)
    if(!patch)return
    void navigate(patch);setPlaceQuery('');setPlaceFeedback(`已將${selectedPlace.name}設為${action==='from'?'起點':'終點'}，請確認路線入口與通行條件。`)
    requestAnimationFrame(()=>document.getElementById('panel-heading')?.focus({preventScroll:true}))
  }
  const placeEntrances=selectedPlace?.routePlaceId?[...new Map(routes.flatMap(route=>[route.originEntrance,route.destinationEntrance]).filter(entrance=>entrance.placeId===selectedPlace.routePlaceId).map(entrance=>[entrance.id,entrance])).values()]:[]
  const collapsedPlace=discovering?<div className="sheet-route-summary"><div><strong>{selectedPlace?.name??(state.category?`附近${categoryLabels[state.category]}`:'搜尋地點')}</strong><span>{selectedPlace?(selectedPlace.category==='field'?'現場紀錄，路線仍待查核':'公開點位，通行狀態待查核'):`${foundPlaces.length} 個符合的地點`}</span></div><button onClick={()=>setSheetSize('half')}>查看地點</button></div>:null

  return <div className={`app ${campus && step >= 0 ? 'map-experience' : ''}`}>
    <a href="#content-panel" className="skip-link" onClick={e => { e.preventDefault(); setSheetSize('full'); requestAnimationFrame(() => document.getElementById('content-panel')?.focus()) }}>跳至操作內容</a>
    <header className="topbar">
      <button className="brand" onClick={() => navigate({ screen: 'setup' })} aria-label="輪椅友善路徑導航系統，返回設定"><span className="brand-symbol"><RouteIcon size={27} strokeWidth={2} aria-hidden="true" /></span><span><strong>輪椅友善路徑導航系統</strong><small>校園無障礙路線</small></span></button>
      <nav className="product-nav" aria-label="主要功能">{[{ screen: 'setup' as const, label: '路線規劃', icon: RouteIcon }, { screen: 'saved' as const, label: '我的收藏', icon: Bookmark }, { screen: 'help' as const, label: '使用說明', icon: BookOpen }, { screen: 'editor' as const, label: '實勘編輯', icon: ClipboardCheck }].map(item => <button key={item.screen} className={(item.screen === 'setup' ? step >= 0 : state.screen === item.screen) ? 'active' : ''} aria-current={(item.screen === 'setup' ? step >= 0 : state.screen === item.screen) ? 'page' : undefined} onClick={() => navigate({ screen: item.screen })}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span>{item.screen === 'saved' && favorites.length > 0 && <small>{favorites.length}</small>}</button>)}<button disabled={!campus} onClick={() => openCommunity()} aria-haspopup="dialog"><MessageSquare size={17} aria-hidden="true"/><span>社群路況</span></button></nav>
      <button className="source-button" onClick={() => setShowSources(true)} disabled={!campus}><Info size={18} aria-hidden="true" /><span>資料來源</span></button>
    </header>
    {step >= 0 && <div className="journey-bar"><nav className="stepper" aria-label="選路流程">{screens.map((item, i) => { const Icon = item.icon; return <button key={item.id} className={`step ${i === step ? 'current' : ''} ${i < step ? 'completed' : ''}`} disabled={i > step} aria-label={`步驟 ${i + 1}：${item.label}`} aria-current={i === step ? 'step' : undefined} onClick={() => navigate({ screen: item.id })}><span className="step-index" aria-hidden="true">{i < step ? <Check size={13} /> : i + 1}</span><Icon size={16} className="step-icon" aria-hidden="true" /><span className="step-label">{item.label}</span>{i < 3 && <ChevronRight size={13} className="step-chevron" aria-hidden="true" />}</button> })}</nav>
      <div className="mode-switch" role="group" aria-label="資料模式"><button className={isDemo ? 'selected' : ''} aria-pressed={isDemo} onClick={() => chooseMode('demo')}>試走紀錄</button><button className={!isDemo ? 'selected' : ''} aria-pressed={!isDemo} onClick={() => chooseMode('survey')}>已查核路線</button></div>
    </div>}
    <div className={`mode-strip ${isDemo && step >= 0 ? 'demo' : 'survey'}`} role="status">{state.screen === 'editor' ? <><ClipboardCheck size={16} aria-hidden="true" /><strong>本機實勘草稿</strong><span>填寫後匯出，交由團隊審核</span></> : step < 0 ? <><Info size={16} aria-hidden="true" /><strong>校園試用版</strong><span>總圖書館與博雅教學館周邊</span></> : isDemo ? <><TriangleAlert size={16} aria-hidden="true" /><strong>試走紀錄</strong><span>依實際走法重繪，通行條件待查核</span></> : <><ShieldCheck size={16} aria-hidden="true" /><strong>查核模式</strong><span>全程及兩端入口均需有實勘證據</span></>}</div>

    {state.screen === 'help' ? <HelpPage onDemo={() => navigate({ screen: 'setup', mode: 'demo', routeId: '', segmentId: '' })} onEditor={() => navigate({ screen: 'editor' })} onSources={() => setShowSources(true)} /> : state.screen === 'saved' ? <SavedRoutes favorites={favorites} allRoutes={allRoutes} onOpen={favorite => navigate(fromHash(favorite.hash))} onRemove={key => { const previous = favorites; if (persistFavorites(favorites.filter(f => f.key !== key))) { setUndoFavorites(previous); setFavoriteMessage('已移除收藏，可立即復原。') } }} onUndo={() => { if (undoFavorites && persistFavorites(undoFavorites)) { setUndoFavorites(null); setFavoriteMessage('已復原收藏。') } }} canUndo={!!undoFavorites} onPlan={() => navigate({ screen: 'setup' })} feedback={favoriteMessage} /> : loading && !campus ? <main className="app-loading"><LoaderCircle className="spinner" size={28} /><h1>正在展開校園地圖</h1><p>載入公開圖資與路段資料快照</p></main> : loadError && !campus || !campus ? <main className="app-loading error-state"><TriangleAlert size={32} /><h1>圖資暫時無法載入</h1><p>請確認網路連線，再試一次。你也可以先閱讀使用說明。</p><button className="button primary" onClick={retryCampus}>重新載入圖資</button><button className="button secondary" onClick={() => navigate({ screen: 'help' })}>使用說明</button></main> : state.screen === 'editor' ? <Suspense fallback={<main className="app-loading"><LoaderCircle className="spinner" size={28} /><h1>載入實勘編輯器</h1></main>}><SurveyEditor campus={campus} onClose={() => navigate({ screen: 'setup' })} /></Suspense> : <main className={`workspace route-workspace ${catalog?'has-discovery':''}`} data-discovering={discovering} data-sheet={sheetSize} data-screen={state.screen}>
      <MapSheet label={discovering?'地點資訊':state.screen==='setup'?'路線設定':undefined} size={sheetSize} onSize={setSheetSize} mobile={mobile} panelRef={panelRef} collapsed={discovering?collapsedPlace: state.screen === 'compare' && isDemo && routes.length > 0 ? <WalkedRoutePicker routes={routes} onOpen={openRoute} /> : tourRoute ? <RouteExplorer route={tourRoute} tour={tour} compact onInspect={inspectTourSegment} /> : <div className="sheet-route-summary"><div><strong>{state.screen === 'setup' ? '規劃校園路線' : routes.length ? `${routes.length} 條${isDemo ? '試走' : '查核'}路線` : '目前無可用路線'}</strong><span>{placeNames[state.origin]} → {placeNames[destination]}</span></div><button onClick={() => setSheetSize('half')}>{state.screen === 'setup' ? '設定條件' : '查看資訊'}</button></div>}>
        <div className="panel-main" key={state.screen}>
          {placeFeedback&&<p className="place-endpoint-feedback" role="status">{placeFeedback}</p>}
          {discovering&&selectedPlace&&<CatalogStatus loading={placeData.loading} error={placeData.error} onRetry={placeData.retry}/>}
          {discovering&&catalog&&(selectedPlace?<PlaceCard key={selectedPlace.id} place={selectedPlace} catalog={catalog} entrances={placeEntrances} mode={state.mode} onClose={closePlace} backLabel={state.category ? '返回點位清單' : state.screen === 'detail' ? '返回路段' : '返回路線地圖'} onEndpoint={setPlaceEndpoint} onChoose={choosePlace} shareUrl={window.location.origin+window.location.pathname+toHash({...state,placeId:selectedPlace.id,category:undefined})}/>:state.placeId?<section className="place-empty"><h1 id="place-heading" tabIndex={-1}>{placeData.loading?'正在載入地點':'這個地點目前無法開啟'}</h1><p>地點連結可能已變更，或資料快照尚未載入。可重新搜尋或返回路線。</p><CatalogStatus loading={placeData.loading} error={placeData.error} onRetry={placeData.retry}/><button className="button secondary wide" onClick={clearDiscovery}>返回路線規劃</button></section>:<PlaceList key={state.category??placeQuery} catalog={catalog} results={foundPlaces} title={placeQuery.trim()?'搜尋結果':state.category==='field'?(fieldGroup?'附近實勘點':'實勘點') :state.category?`附近${categoryLabels[state.category]}`:'校園地點'} onChoose={choosePlace} onBack={clearDiscovery} fieldList={state.category==='field'} showAllFieldPoints={showAllFieldPoints} backLabel={state.screen==='setup'?'返回路線規劃':'返回路線地圖'} loading={placeData.loading} error={placeData.error} onRetry={placeData.retry}/>)}
          <div className="route-panel-content" hidden={discovering}>
          {state.screen === 'setup' && <>
            <h1 id="panel-heading" tabIndex={-1}>規劃校園路線</h1><p className="panel-intro">選擇起終點，再比較沿途的通行條件。</p>
            <form id="route-planner" onSubmit={e => { e.preventDefault(); query() }} className="route-form">
              <div className="location-fields"><label className="location-field"><span className="location-letter">A</span><span className="field-content"><span>起點</span><select aria-label="起點" value={state.origin} onChange={e => navigate({ origin: e.target.value === 'boya' ? 'boya' : 'library' })}><option value="library">{isDemo ? '總圖前廣場' : '總圖書館'}</option><option value="boya">{isDemo ? '博雅教學館西側' : '博雅教學館'}</option></select></span></label><div className="location-connector" aria-hidden="true" /><label className="location-field"><span className="location-letter end">B</span><span className="field-content"><span>終點</span><select aria-label="終點" value={destination} onChange={e => navigate({ origin: e.target.value === 'library' ? 'boya' : 'library' })}><option value="library">{isDemo ? '總圖前廣場' : '總圖書館'}</option><option value="boya">{isDemo ? '博雅教學館西側' : '博雅教學館'}</option></select></span></label><button type="button" className="swap-button" aria-label="交換起點與終點" onClick={() => navigate({ origin: destination })}><ArrowDownUp size={18} /></button></div>
              <fieldset className="form-section"><legend>移動需求<span>僅註記需求</span></legend><div className="chair-options">{[{ value: 'manual' as const, label: '手動輪椅', icon: Accessibility }, { value: 'electric' as const, label: '電動輪椅', icon: Zap }].map(item => <label key={item.value} className={state.wheelchair === item.value ? 'checked' : ''}><input type="radio" name="wheelchair" value={item.value} checked={state.wheelchair === item.value} onChange={() => navigate({ wheelchair: item.value })} /><item.icon size={19} /><span>{item.label}</span><i className="radio-dot" /></label>)}</div></fieldset>
              {!isDemo && <fieldset className="form-section preference-section"><legend>路線偏好</legend><div className="preference-options">{[{ value: 'short' as const, label: '距離較短', description: '依路程排序', icon: RouteIcon }, { value: 'gentle' as const, label: '較平緩', description: '依最大坡度排序', icon: Mountain }].map(item => <label key={item.value} className={state.preference === item.value ? 'checked' : ''}><input type="radio" name="preference" value={item.value} checked={state.preference === item.value} onChange={() => navigate({ preference: item.value })} /><span className="preference-top"><item.icon size={21} strokeWidth={1.8} aria-hidden="true" /><i className="radio-dot" /></span><strong>{item.label}</strong><span className="preference-description">{item.description}</span></label>)}</div></fieldset>}
              <LimitControls limits={state.limits ?? emptyLimits} onChange={limits => navigate({ limits })} onSave={remember} feedback={profileFeedback} />
              <ConditionControls enabled={!!state.avoidReports} onChange={avoidReports => navigate({ avoidReports })} community={community} />
            </form>
          </>}

          {state.screen !== 'setup' && !isDemo && surveyLoading ? <div className="empty-state" role="status"><LoaderCircle className="spinner" size={27} /><h1 id="panel-heading" tabIndex={-1}>正在載入查核資料</h1><p>公開地圖已可使用，查核資料載入後會再檢查路線資格。</p></div> : state.screen !== 'setup' && resolved.problem ? <UnavailableRoute problem={resolved.problem} onCompare={() => navigate({ screen: 'compare', routeId: '', segmentId: '' })} onRoute={() => navigate({ screen: 'detail', segmentId: selected?.segments[0]?.id ?? '' })} /> : state.screen !== 'setup' && routes.length === 0 && <EmptyRoutes onDemo={() => navigate({ mode: 'demo', screen: 'compare', routeId: '', segmentId: '', limits: undefined })} onSetup={() => navigate({ screen: 'setup' })} onRetry={retrySurvey} failed={surveyError && !isDemo} filtered={candidates.excluded.length > 0} />}

          {state.screen === 'compare' && routes.length > 0 && (isDemo || !surveyLoading) && <>
            <div className="panel-title-row"><h1 id="panel-heading" tabIndex={-1}>比較路線</h1><button className="back-link" onClick={() => navigate({ screen: 'setup' })}><SlidersHorizontal size={16} aria-hidden="true" />修改條件</button></div>{isDemo ? <p className="route-pair">總圖前廣場 ⇄ 博雅教學館西側</p> : <p className="route-pair"><span>{placeNames[state.origin]}</span><ArrowRight size={16} aria-hidden="true" /><span>{placeNames[destination]}</span></p>}
            <div className="compare-preference"><span>{routes.length} 條{isDemo ? '試走' : ''}路線</span><span>{state.wheelchair === 'manual' ? '手動輪椅' : '電動輪椅'}</span>{!isDemo && <span>{state.preference === 'gentle' ? '依坡度排序' : '依距離排序'}</span>}</div>
            <div className="route-cards">{routes.map((route, i) => <button key={route.id} className={`route-card ${route.id === 'walk-back' ? 'direct' : 'gentle'} ${route.walked ? 'walked-route-card' : ''} ${selected?.id === route.id ? 'selected' : ''}`} onClick={() => openRoute(route)} aria-label={`查看${route.name}`}><div className="route-card-top"><span className="route-card-icon">{route.id === 'gentle' ? <Mountain size={20} aria-hidden="true" /> : <RouteIcon size={20} aria-hidden="true" />}</span><div><strong>{route.name}</strong><span>{route.description}</span>{route.walked && <small className="walked-route-distance">圖上約 {formatDistance(metrics(route).distanceM)} · {route.segments.length} 段</small>}</div>{i === 0 && !isDemo && <span className="preference-tag">符合偏好</span>}</div>{!route.walked && <RouteStats route={route} />}{(()=>{const relevant=routeReports(route,community.reports,communitySegments);const summary=communitySummary(relevant,new Set(relevant.map(r=>r.segmentId)),community.now);return summary.total>0?<p className="community-route-note"><MessageSquare size={14}/><span>社群路況 {summary.total} 則，其中 {summary.recent} 則近期回報{summary.blocked>0?'，含通行受阻回報':''}。查看路段了解現場資訊。</span></p>:null})()}{!route.walked && <div className="route-card-surface"><span>{isDemo ? '通行條件待查核' : '無階梯'}</span><span>{metrics(route).surfaces.join('、')}</span></div>}{route.kind === 'survey' && <p className="verification-age">最舊查核 {formatDate(oldestVerification(route))}，{daysSince(oldestVerification(route)!)} 天前</p>}<div className="route-card-footer"><span>{isDemo ? '通行條件待查核' : '全程及入口已查核'}</span><strong>檢視路段<ChevronRight size={18} aria-hidden="true" /></strong></div></button>)}</div>
            <ConditionControls enabled={!!state.avoidReports} onChange={avoidReports => navigate({ avoidReports, routeId: '', segmentId: '' })} community={community} />
            {!isDemo && <ComparisonSummary routes={routes} />}
          </>}

          {state.screen === 'compare' && candidates.excluded.length > 0 && <section className="excluded-routes"><h2>未符合目前條件的動線</h2><p>以下動線已依你設定的條件排除。</p>{candidates.excluded.map(({ route, reasons }) => <article key={route.id}><h3>{route.name}</h3><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></article>)}<button className="button secondary wide" onClick={() => navigate({ screen: 'setup' })}>調整通行條件</button></section>}

          {state.screen === 'detail' && !resolved.problem && selected && activeSegment && (isDemo || !surveyLoading) && <>
            <div className="panel-title-row"><h1 id="panel-heading" tabIndex={-1}>路段資訊</h1><button className="back-link" onClick={() => navigate({ screen: 'compare' })}><ArrowLeft size={17} aria-hidden="true" />返回比較</button></div>
            <div className="detail-route-title"><span className={`route-color-dot ${selected.id}`} />{selected.name}<span>{formatDistance(metrics(selected).distanceM)}</span></div>
            {(!mobile || !selected.walked) && <p className="detail-route-description">{selected.description}</p>}
            {!selected.walked && <><BottleneckList route={selected} onSelect={id => navigate({ segmentId: id })} />{segmentTabs}</>}
            <SegmentInfo segment={activeSegment} onOpenPhoto={tour.pause} onSelectField={choosePlaceById} />
            {selected.walked && <details className="walked-segment-picker">
              <summary>切換路段<small>第 {selected.segments.findIndex(segment => segment.id === activeSegment.id) + 1} / {selected.segments.length} 段</small><ChevronDown size={16} aria-hidden="true" /></summary>
              {segmentTabs}
            </details>}
            {mobilePreview}
            <CommunitySection data={community} segmentId={activeSegment.id} onOpen={() => openCommunity(activeSegment.id)} onOpenPhoto={tour.pause} />
            <div className="sticky-panel-actions"><button className="button primary wide" onClick={() => navigate({ screen: 'confirm', routeId: selected.id })}>選擇這條路線<Check size={18} /></button></div>
          </>}

          {state.screen === 'confirm' && !resolved.problem && selected && (isDemo || !surveyLoading) && <>
            <button className="back-link" onClick={() => navigate({ screen: 'compare' })}><ArrowLeft size={17} aria-hidden="true" />返回比較</button><h1 id="panel-heading" tabIndex={-1}>確認路線</h1><p className="panel-intro confirm-intro">核對兩端入口與沿途條件，再保存這條路線。</p>
            <div className="confirmed-route"><div className="section-heading"><strong>{selected.name}</strong><span className={`tiny-badge ${isDemo ? 'amber' : ''}`}>{isDemo ? '試走紀錄' : '已查核'}</span></div><RouteStats route={selected} compact /></div>
            <div className="entry-cards"><EntranceCard entrance={selected.originEntrance} letter="A" /><div className="entry-connector" /><EntranceCard entrance={selected.destinationEntrance} letter="B" /></div>
            <div className="section-heading confirm-segments-title"><h3>沿途路段</h3><span>{selected.segments.length} 段</span></div><div className="confirm-segments">{selected.segments.map((segment, i) => <button key={segment.id} onClick={() => navigate({ screen: 'detail', segmentId: segment.id })}><span>{i + 1}</span><strong>{segment.name}</strong><span>{formatDistance(lineDistance(segment.coordinates))}</span><ChevronRight size={16} /></button>)}</div>
            {mobilePreview}
            {selected.kind === 'survey' && <p className="verification-age">全程最舊查核日期 {formatDate(oldestVerification(selected))}，距今 {daysSince(oldestVerification(selected)!)} 天。</p>}
            <div className="sticky-panel-actions"><button className="button primary wide" onClick={copyLink}><Copy size={18} />複製路線連結</button><div className="confirm-extra-actions"><button className="button secondary" onClick={saveFavorite}><Bookmark size={17} />收藏這條路線</button><button className="button secondary" onClick={() => window.print()}><Printer size={17} />列印路線</button></div>{favoriteMessage && <p className="copy-feedback" role="status">{favoriteMessage}</p>}{copyMessage && <p className="copy-feedback" role="status"><CheckCircle2 size={15} />{copyMessage}</p>}{copyFallback && <input className="copy-fallback" aria-label="路線連結" readOnly value={`${window.location.origin}${window.location.pathname}${toHash({ ...state, routeId: selected.id })}`} onFocus={e => e.target.select()} />}<p className="form-footnote">出發前請確認入口與現場路況。</p></div>
          </>}
        </div></div>
        {!discovering && state.screen === 'setup' && <div className="setup-actions"><button type="submit" form="route-planner" className="button primary wide search-button">{isDemo ? '查看試走路線' : '比較路線'}<ArrowRight size={19} aria-hidden="true" /></button><p className="form-footnote">{isDemo ? '博雅館內虛線為約略走向。' : '未查核路段不列入候選路線。'}</p></div>}
      </MapSheet>
      {catalog&&<PlaceSearch places={catalog.places} query={placeQuery} category={state.category} selected={selectedPlace} recent={recentPlaces} onQuery={value=>{tour.pause();setFieldGroup(undefined);setPlaceQuery(value);if(state.placeId||state.category)void navigate({placeId:undefined,category:undefined});setSheetSize('half')}} onChoose={choosePlace} onCategory={chooseCategory} onClear={clearDiscovery} onBrowse={()=>{if(!placeQuery.trim()&&!state.category)void navigate({category:'building',placeId:undefined});setSheetSize('full');requestAnimationFrame(()=>document.getElementById('place-heading')?.focus({preventScroll:true}))}} onClearRecent={()=>{if(clearRecentPlaces()){setRecentPlaces([]);setPlaceFeedback('已清除最近查看。')}else setPlaceFeedback('此瀏覽器無法清除儲存紀錄，可從網站設定管理。')}}/>}
      <CampusMap mapTheme={state.mapTheme} onThemeChange={mapTheme=>{tour.pause();setPlaceQuery('');setPlaceFeedback('');void navigate({mapTheme,placeId:undefined,category:undefined});if(mobile)setSheetSize('map')}} communityFocus={communityFocus} catalogPlaces={catalog?.places} catalogCategory={state.category} catalogQuery={placeQuery} selectedPlaceId={state.placeId} discoveryActive={discovering} onSelectPlace={choosePlaceById} fieldGroupIds={fieldGroup} onSelectFieldGroup={chooseFieldGroup} onReturnRoutes={clearDiscovery} campus={campus} routes={routes} selectedId={selected?.id ?? ''} segmentId={activeSegment?.id ?? ''} mode={state.mode} screen={state.screen} layoutKey={mobile ? sheetSize : 'desktop'} communityReports={community.reports} communitySegments={communitySegments} onSelectCommunity={openCommunity} onLocationActivity={() => { tour.pause(); tour.setFollowing(false);if(discovering){setPlaceQuery('');void navigate({placeId:undefined,category:undefined})} }} preview={tour.engaged && tour.position ? { coordinate: tour.position.coordinate, following: tour.following, reducedMotion: tour.reducedMotion, playing: tour.playing } : undefined} onMapDrag={() => { if (tour.engaged && tour.following) tour.setFollowing(false) }} onSelectRoute={id => {setPlaceQuery('');void navigate({ origin: routes.find(route => route.id === id)?.originEntrance.placeId, routeId: id, segmentId: '',placeId:undefined,category:undefined });setSheetSize('half')}} onSelectSegment={id => { void navigate({ screen: state.screen === 'setup' ? 'setup' : 'detail', origin: routes.find(route=>route.segments.some(segment=>segment.id===id))?.originEntrance.placeId, routeId: routes.find(route=>route.segments.some(segment=>segment.id===id))?.id ?? selected?.id ?? '', segmentId: id }) }} />
      {!mobile && explorer && <div className="experience-dock">{explorer}</div>}
    </main>}
    <OfflineStatus snapshotDate={campus?.retrievedAt} beforeUpdate={async () => { try { await flushSurveyDraft(); return document.documentElement.dataset.surveyUnsaved !== 'true' } catch { return false } }} />
    {showSources && campus && <SourceDialog campus={{...campus,sources:[...campus.sources,...(catalog?.sources.filter(source=>source.id==='osm-amenities')??[])]}} onClose={() => setShowSources(false)} />}
    {campus && <CommunityDialog open={communityOpen} onClose={() => setCommunityOpen(false)} data={community} segments={communitySegments} initialSegment={communitySegment} onInspect={inspectCommunitySegment} onOpenPhoto={tour.pause} />}
    {state.screen === 'confirm' && !resolved.problem && selected && campus && <PrintableRoute route={selected} state={state} snapshotDate={campus.retrievedAt} />}
    <div className="sr-only" aria-live="polite">{state.screen === 'detail' && activeSegment ? `目前路段：${activeSegment.name}` : ''}</div>
  </div>
}
