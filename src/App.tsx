import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Camera, ChevronDown, ChevronRight, Copy, Info, LoaderCircle, Map as MapIcon, MessageSquare, Printer, Route as RouteIcon, TriangleAlert, X } from 'lucide-react'
import CampusMap, { colors } from './CampusMap'
import type { Campus, CatalogCategory, CatalogPlace, Coordinate, Entrance, NavigationState, Route, Segment } from './types'
import { buildWalkedRoutes, walkedDistanceLabel } from './walked-routes'
import { formatDate, formatDistance, fromHash, lineDistance, lineMidpoint } from './routes'
import { publicHash, publicNavigation } from './public-navigation'
import { favoriteFor, readFavorites, resolveSharedRoute, writeFavorites } from './product'
import type { Favorite } from './product'
import { HelpPage, SavedRoutes, UnavailableRoute } from './ProductScreens'
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
import { usePlaceCatalog } from './usePlaceCatalog'
import { categoryLabels, clearRecentPlaces, findPlaces, placeEndpointPatch, readRecentPlaces, rememberPlace } from './places'
import { CatalogStatus, FieldSummary, FieldSymbol, PlaceCard, PlaceList, PlaceSearch } from './PlaceDiscovery'
import { BoyaFloorPlan, boyaFloorPointIds } from './BoyaFloorPlan'
import { fieldObservation } from './field-observations'
import type { FieldObservation } from './field-observations'
import PlannerPanel from './PlannerPanel'
import PlannerDraftDialog from './PlannerDraftDialog'
import { initialPlan, planEndpoint } from './planning-params'
import type { EndpointSlot, PlanEndpoint, PlanRequest } from './planning-params'
import { planRoutes, reportSummary, surfaceLabel } from './routing-plan'
import type { PlannedRoute } from './routing-plan'
import type { TourRoute } from './route-tour'
import { useRoutingNetwork } from './useRoutingNetwork'
import { conditionDataReady, validateReportPoint } from './road-conditions'
import './product.css'
import './campus-design.css'
import './route-experience.css'
import './road-conditions.css'
import './mvp.css'

const navItems = [
  { screen: 'compare', label: '地圖', icon: MapIcon },
  { screen: 'saved', label: '收藏', icon: Bookmark },
  { screen: 'help', label: '說明', icon: BookOpen },
] as const
const emptyPlans: PlannedRoute[] = []

function defaultSheetSize(state: NavigationState): SheetSize {
  if (!state.placeId && state.category === 'field') return 'full'
  return state.screen === 'compare' && !state.placeId && !state.category ? 'map' : 'half'
}

function DemoRoutePicker({ routes, onOpen, headingId, onPlan }: { routes: Route[]; onOpen: (route: Route) => void; headingId: string; onPlan: () => void }) {
  return <section className="direction-picker" aria-labelledby={headingId}>
    <div className="demo-route-heading">
      <div className="demo-heading-text"><RouteIcon size={20} aria-hidden="true" />
        <div><h1 id={headingId} tabIndex={-1}>示範路線</h1><p>第 11 組試走紀錄</p></div>
      </div>
      <button className="button primary planner-start" type="button" onClick={onPlan}>規劃新路線<ArrowRight size={14} aria-hidden="true" /></button>
    </div>
    <ul className="walked-route-picker">
      {routes.map(route => {
        const [direction, endpoints] = route.name.split('｜')
        return <li key={route.id}><button onClick={() => onOpen(route)} aria-label={`查看${route.name}`}>
          <span className="walked-picker-line" style={{ backgroundColor: colors[route.id as keyof typeof colors] ?? colors.survey }} aria-hidden="true" />
          <span><strong>{direction}</strong>
            {endpoints && <span>{endpoints}</span>}
            <small>{walkedDistanceLabel(route).replace('圖上估算', '')}</small>
          </span>
          <ChevronRight className="demo-route-chevron" size={16} aria-hidden="true" />
        </button></li>
      })}
    </ul>
  </section>
}

function SourceDialog({ campus, onClose }: { campus: Campus; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="sources-dialog" aria-labelledby="sources-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-header"><h2 id="sources-title">資料說明</h2><button className="icon-button" onClick={onClose} aria-label="關閉資料說明"><X size={22} /></button></div>
    <p className="dialog-intro">路線由第 11 組依試走地標與照片重繪。底圖和附近設施來自以下圖資。</p>
    <div className="source-list">{campus.sources.map(source => <article key={source.id} className="source-card">
      <strong>{source.label}</strong><p>取得於 {formatDate(source.retrievedAt)}</p>
      <a href={source.url} target="_blank" rel="noreferrer">原始來源 <ArrowRight size={14} aria-hidden="true" /></a>
    </article>)}</div>
    <button className="button secondary wide" onClick={onClose}>返回說明</button>
  </dialog>
}

function EndpointCard({ entrance, label }: { entrance: Entrance; label: string }) {
  return <details className="entrance-card">
    <summary><div><span>{label}</span><strong>{entrance.name}</strong></div><ChevronDown size={17} aria-hidden="true" /></summary>
    <div className="entry-body"><p>{entrance.source}</p><PhotoGallery photos={entrance.photos} /></div>
  </details>
}

function FieldLinks({ points, prefix, onSelect }: { points: FieldObservation[]; prefix: string; onSelect: (id: string) => void }) {
  return <ul className="segment-field-links">
    {points.map(point => <li key={point.id}><button id={`${prefix}-${point.id}`} onClick={() => onSelect(point.id)}>
      <FieldSymbol kind={point.kind} />
      <span className="field-link-text"><strong>{point.name}</strong><FieldSummary point={point} /></span>
      <ChevronRight size={17} aria-hidden="true" />
    </button></li>)}
  </ul>
}

function SegmentInfo({ segment, onSelectField }: { segment: Segment; onSelectField: (id: string) => void }) {
  const fields = (segment.fieldPointIds ?? []).flatMap(id => fieldObservation(id) ?? [])
  const facts = [
    ['最大坡度', segment.maxSlopePercent, '%'],
    ['最窄路寬', segment.minWidthM, ' 公尺'],
    ['最大階差', segment.stepHeightCm, ' 公分'],
  ] as const
  return <section className="segment-info walked-segment-info" aria-labelledby="field-section-heading">
    <h2 id="field-section-heading" tabIndex={-1}>目前路段</h2>
    <h3 className="field-segment-name">{segment.name}</h3>
    {segment.nextLandmark && <p className="segment-landmark">下一個地標 <strong>{segment.nextLandmark}</strong></p>}
    {segment.approximate && <p className="segment-indoor">組員由東側進入博雅一樓，再從西側出來。館內轉折尚未測繪。</p>}
    {fields.some(point => boyaFloorPointIds.has(point.id)) && <BoyaFloorPlan key={segment.id} />}
    {fields.length ? <FieldLinks points={fields} prefix="segment" onSelect={onSelectField} />
      : <p className="segment-no-points">這一段尚無實勘點。</p>}
    <details className="evidence-details segment-measurements">
      <summary>全段通行資料<ChevronDown size={15} aria-hidden="true" /></summary>
      <dl className="fact-grid">
        {facts.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value === null ? '無全段資料' : `${value}${unit}`}</dd></div>)}
        <div><dt>階梯</dt><dd>{segment.hasStairs === null ? '無全段資料' : segment.hasStairs ? '有階梯' : '無階梯'}</dd></div>
        <div><dt>路面</dt><dd>{segment.surface ?? '無全段資料'}</dd></div>
        <div><dt>封閉狀況</dt><dd>{segment.closed === null ? '無全段資料' : segment.closed ? '封閉' : '開放'}</dd></div>
      </dl>
    </details>
  </section>
}

type PanelView = { size: SheetSize; scrollTop: number; focusId?: string }

export default function App() {
  const [state, setState] = useState(() => publicNavigation(fromHash(window.location.hash)))
  const { campus, loading, loadError, retryCampus } = useCampusData()
  const placeData = usePlaceCatalog(campus)
  const catalog = placeData.catalog
  const [placeQuery, setPlaceQuery] = useState('')
  const [browsingPlaces, setBrowsingPlaces] = useState(false)
  const [recentPlaces, setRecentPlaces] = useState<string[]>([])
  const [placeFeedback, setPlaceFeedback] = useState('')
  const [fieldGroup, setFieldGroup] = useState<{ ids: string[]; title: string }>()
  const [showSources, setShowSources] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [copyFallback, setCopyFallback] = useState(false)
  const [favorites, setFavorites] = useState(readFavorites)
  const [favoriteMessage, setFavoriteMessage] = useState('')
  const [undoFavorites, setUndoFavorites] = useState<Favorite[] | null>(null)
  const [sheetSize, setSheetSize] = useState<SheetSize>(() => defaultSheetSize(state))
  const [communityOpen, setCommunityOpen] = useState(false)
  const [communitySegment, setCommunitySegment] = useState('')
  const [communityFocus, setCommunityFocus] = useState<{ coordinate: Coordinate; request: number }>()
  const [plannerPicking, setPlannerPicking] = useState<EndpointSlot | 'observation' | null>(null)
  const [plannerPickError, setPlannerPickError] = useState('')
  const [plannerLegId, setPlannerLegId] = useState('')
  const [draftRoute, setDraftRoute] = useState<PlannedRoute>()
  const [draftCoordinate, setDraftCoordinate] = useState<Coordinate>()
  const [draftLegId, setDraftLegId] = useState('')
  const community = useCommunity(!!campus)
  const mobile = useMediaQuery('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)')
  const panelRef = useRef<HTMLElement>(null)
  const routeView = useRef<(PanelView & { segmentId: string }) | null>(null)
  const listView = useRef<PanelView | null>(null)
  const panelRestore = useRef<PanelView | null>(null)

  const discovering = !!state.placeId || !!state.category || !!placeQuery.trim() || browsingPlaces
  const selectedPlace = catalog?.places.find(place => place.id === state.placeId)
  const foundPlaces = useMemo(() => {
    const matches = catalog ? findPlaces(catalog.places, placeQuery, state.category) : []
    return fieldGroup ? fieldGroup.ids.flatMap(id => matches.find(place => place.id === id) ?? []) : matches
  }, [catalog, placeQuery, state.category, fieldGroup])
  useEffect(() => { if (catalog) setRecentPlaces(readRecentPlaces(catalog.places)) }, [catalog])

  const routes = useMemo(buildWalkedRoutes, [])
  const planning = state.screen === 'plan'
  const plan = state.plan ?? initialPlan
  const routing = useRoutingNetwork(planning)
  const communitySegments = useMemo(() => routes.flatMap(route => route.segments.map(segment => ({
    id: segment.id, name: segment.name, routeName: route.name, coordinate: lineMidpoint(segment.coordinates),
    coordinates: segment.approximate ? undefined : segment.coordinates, approximate: segment.approximate,
  }))), [routes])
  const fieldPoints = useMemo(() =>
    [...new Set(routes.flatMap(route => route.segments.flatMap(segment => segment.fieldPointIds ?? [])))]
      .flatMap(id => fieldObservation(id) ?? []), [routes])
  const plannedResult = useMemo(() => planning && routing.network && plan.start && plan.end
    ? planRoutes(routing.network, plan.start.coordinate, plan.end.coordinate, plan.preference, {
      walkedRoutes: routes, fieldPoints, reports: community.reports, reportSegments: communitySegments, now: community.now,
    }) : undefined, [planning, routing.network, plan, routes, fieldPoints, community.reports, communitySegments, community.now])
  const plannedRoutes = plannedResult?.status === 'ok' ? plannedResult.routes : emptyPlans
  const planned = plannedRoutes.find(route => route.id === state.planChoice) ?? plannedRoutes[0]
  const plannedLeg = planned?.legs.find(leg => leg.id === plannerLegId) ?? planned?.legs[0]
  const plannedTour = useMemo<TourRoute | null>(() => planned ? {
    id: planned.id, kind: 'planned', originEntrance: { id: 'start' },
    segments: planned.legs.map(leg => ({
      id: leg.id, name: leg.name, coordinates: leg.coordinates, status: 'unverified',
      maxSlopePercent: leg.way.inclinePercent === null ? null : Math.abs(leg.way.inclinePercent),
      minWidthM: leg.way.widthM, stepHeightCm: null, hasStairs: null,
      surface: leg.way.surface ? surfaceLabel(leg.way.surface) : null, rampLengthM: null,
      closed: null, obstacles: leg.reports.map(reportSummary),
      photos: leg.fieldPointIds.flatMap(id => fieldObservation(id)?.photos ?? []),
      source: 'OpenStreetMap 公開路網', retrievedAt: routing.network?.retrievedAt ?? null, verifiedAt: null,
    })),
  } : null, [planned, routing.network])
  const resolved = resolveSharedRoute(routes, state)
  const selected = planning ? undefined : resolved.route ?? (state.screen === 'compare' ? routes[0] : undefined)
  const baseSegment = selected?.segments.find(segment => segment.id === state.segmentId) ?? selected?.segments[0]
  const tourRoute = selected && !resolved.problem && !discovering && state.screen === 'detail' ? selected : null
  const tour = useRouteTour(planning && !discovering ? plannedTour : tourRoute, planning ? plannerLegId : state.segmentId)
  const activeSegment = tourRoute && tour.engaged && tour.position ? tour.position.leg.segment : baseSegment
  const routeFieldIds = [...new Set(selected?.segments.flatMap(segment => segment.fieldPointIds ?? []) ?? [])]
  const routeAttention = routeFieldIds.flatMap(id => {
    const point = fieldObservation(id)
    return point?.attention ? [point] : []
  })
  const mapScreen = state.screen !== 'help' && state.screen !== 'saved'
  const hasPlaceList = !!state.category || browsingPlaces || !!placeQuery.trim()

  const currentPanel = () => panelRef.current?.querySelector<HTMLElement>('.panel-main')
  const capturePanelView = (): PanelView => ({
    size: sheetSize,
    scrollTop: currentPanel()?.scrollTop ?? 0,
    focusId: panelRef.current?.contains(document.activeElement) ? document.activeElement?.id : undefined,
  })
  const rememberRouteView = () => {
    if (!discovering && state.screen === 'detail' && activeSegment) {
      routeView.current = { ...capturePanelView(), segmentId: activeSegment.id }
    } else if (!discovering && planning) {
      routeView.current = { ...capturePanelView(), segmentId: state.segmentId }
    }
  }

  useEffect(() => {
    const handler = () => {
      const next = publicNavigation(fromHash(window.location.hash))
      if (next.screen !== state.screen || next.placeId !== state.placeId || next.category !== state.category) {
        setSheetSize(defaultSheetSize(next))
        if (next.screen !== state.screen || !next.category) setFieldGroup(undefined)
        if (next.screen !== state.screen) {
          setPlannerPicking(null)
          setDraftRoute(undefined)
          setDraftCoordinate(undefined)
          setPlaceQuery('')
          setBrowsingPlaces(false)
          routeView.current = null
          listView.current = null
        } else if (!next.placeId && !next.category && !placeQuery.trim() && !browsingPlaces && routeView.current?.segmentId === next.segmentId) {
          panelRestore.current = routeView.current
          setSheetSize(routeView.current.size)
          routeView.current = null
        }
      }
      setState(next)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [state, placeQuery, browsingPlaces])
  useEffect(() => {
    panelRef.current?.querySelector('.panel-main')?.scrollTo({ top: 0 })
    const heading = document.getElementById('place-heading') ?? document.getElementById('demo-mobile-heading') ?? document.getElementById('panel-heading')
    heading?.focus({ preventScroll: true })
  }, [state.screen, state.routeId, loading])
  useEffect(() => {
    const restore = panelRestore.current
    panelRestore.current = null
    currentPanel()?.scrollTo({ top: restore?.scrollTop ?? 0 })
    if (restore) {
      const fallback = document.getElementById('place-heading') ?? document.getElementById('panel-heading')
      const target = restore.focusId ? document.getElementById(restore.focusId) ?? fallback : fallback
      target?.focus({ preventScroll: true })
    }
  }, [state.placeId, state.category, placeQuery, fieldGroup, browsingPlaces])

  const navigate = (patch: Partial<NavigationState>) => {
    const next = publicNavigation({ ...state, ...(patch.screen ? { placeId: undefined, category: undefined } : {}), ...patch })
    if (patch.screen) {
      setPlannerPicking(null)
      if (patch.screen !== 'plan') {
        setDraftRoute(undefined)
        setDraftCoordinate(undefined)
      }
      setPlaceQuery('')
      setPlaceFeedback('')
      setBrowsingPlaces(false)
      setSheetSize(defaultSheetSize(next))
      routeView.current = null
      listView.current = null
    }
    if (patch.screen || 'category' in patch && next.category !== 'field') setFieldGroup(undefined)
    setState(next)
    const hash = publicHash(next)
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    setCopyMessage('')
    setCopyFallback(false)
    setFavoriteMessage('')
    if (state.screen === 'saved' && patch.screen && patch.screen !== 'saved') setUndoFavorites(null)
  }
  const showDirections = () => navigate({ screen: 'compare', routeId: '', segmentId: '' })
  const startPlanning = () => navigate({ screen: 'plan', plan, routeId: '', segmentId: '', mapTheme: 'routes' })
  const changePlan = (next: PlanRequest) => {
    tour.pause()
    setPlannerLegId('')
    setPlannerPicking(null)
    setPlannerPickError('')
    setDraftRoute(undefined)
    setDraftCoordinate(undefined)
    navigate({ ...(planning ? {} : { screen: 'plan' }), plan: next, planChoice: undefined, routeId: '', segmentId: '',
      placeId: undefined, category: undefined, mapTheme: 'routes' })
    setSheetSize('half')
  }
  const choosePlanEndpoint = (slot: EndpointSlot, endpoint?: PlanEndpoint) => changePlan({ ...plan, [slot]: endpoint })
  const planFromPlace = (slot: EndpointSlot, place: CatalogPlace) => {
    const known = place.routePlaceId ? routes.flatMap(route => [route.originEntrance, route.destinationEntrance])
      .find(entrance => entrance.placeId === place.routePlaceId) : undefined
    choosePlanEndpoint(slot, known ? planEndpoint(known.name, known.coordinate) : planEndpoint(place.name, place.coordinate))
  }
  const selectPlannedRoute = (id: string) => {
    if (id === planned?.id) return
    tour.pause()
    setPlannerLegId('')
    setDraftRoute(undefined)
    setDraftCoordinate(undefined)
    navigate({ planChoice: id })
  }
  const selectPlannedLeg = (id: string, showDetails = false) => {
    tour.pause()
    setPlannerLegId(id)
    if (!showDetails) return
    if (mobile && sheetSize === 'map') setSheetSize('half')
    requestAnimationFrame(() => {
      const details = document.getElementById('planner-leg-details-panel') as HTMLDetailsElement | null
      if (details) { details.open = true; details.querySelector('select')?.focus() }
    })
  }
  const beginPlannerPick = (slot: EndpointSlot | 'observation') => {
    tour.pause()
    setPlannerPicking(slot)
    setPlannerPickError('')
    if (mobile) setSheetSize('map')
  }
  const cancelPlannerPick = () => { setPlannerPicking(null); setPlannerPickError(''); setSheetSize('half') }
  const commitPlannerPick = (coordinate: Coordinate) => {
    if (plannerPicking === 'observation') {
      try {
        validateReportPoint(coordinate, draftRoute?.legs.find(leg => leg.id === draftLegId)?.coordinates)
        setDraftCoordinate(coordinate)
        cancelPlannerPick()
      } catch (error) { setPlannerPickError(error instanceof Error ? error.message : '請選擇路段附近的位置。') }
    } else if (plannerPicking) {
      choosePlanEndpoint(plannerPicking, planEndpoint(plannerPicking === 'start' ? '地圖選點 A' : '地圖選點 B', coordinate))
    }
  }
  const openRoute = (route: Route, segmentId = route.segments[0]?.id ?? '') => {
    tour.pause()
    if (state.screen === 'detail' && state.routeId === route.id && !discovering) {
      navigate({ segmentId })
    } else {
      navigate({ screen: 'detail', origin: route.originEntrance.placeId, routeId: route.id, segmentId })
    }
  }
  const plannedHash = publicHash({ ...state, screen: 'plan', plan, planChoice: planned?.id, routeId: '', segmentId: '', placeId: undefined, category: undefined })
  const routeHash = planning ? plannedHash : publicHash({ ...state, screen: 'detail', routeId: selected?.id ?? state.routeId, placeId: undefined, category: undefined })
  const routeLink = `${window.location.origin}${window.location.pathname}${routeHash}`
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(routeLink); setCopyMessage('路線連結已複製') }
    catch { setCopyMessage('請複製下方的路線連結'); setCopyFallback(true) }
  }
  const persistFavorites = (next: Favorite[]) => {
    try { writeFavorites(next); setFavorites(next); return true }
    catch { setFavoriteMessage('這個瀏覽器無法保存收藏。可以複製連結。'); return false }
  }
  const addFavorite = (favorite: Favorite) => {
    if (favorites.length >= 20 && !favorites.some(item => item.key === favorite.key)) { setFavoriteMessage('收藏已滿 20 條，請先移除一條。'); return }
    if (persistFavorites([favorite, ...favorites.filter(item => item.key !== favorite.key)])) {
      setUndoFavorites(null)
      setFavoriteMessage('已加入這個瀏覽器的收藏。')
    }
  }
  const saveFavorite = () => {
    if (!selected) return
    const saved = favoriteFor(selected, state)
    addFavorite({ ...saved, hash: publicHash({ ...state, screen: 'detail', routeId: selected.id, segmentId: '', placeId: undefined, category: undefined }) })
  }
  const savePlanned = () => {
    if (!planned || !plan.start || !plan.end) return
    addFavorite({ key: planned.id, name: `${plan.start.name} → ${plan.end.name}`, hash: plannedHash,
      savedAt: new Date().toISOString(), mode: 'demo', origin: state.origin })
  }
  const inspectTourSegment = (segment: Segment) => {
    tour.pause()
    if (selected) openRoute(selected, segment.id)
    if (mobile) setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('field-section-heading')?.focus())
  }
  const startTour = () => {
    if (mobile) {
      setSheetSize('map')
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('.sheet-collapsed .tour-play')?.focus({ preventScroll: true }))
    }
  }
  const openCommunity = (segmentId = '') => { tour.pause(); setCommunitySegment(segmentId); setCommunityOpen(true) }
  const inspectCommunitySegment = (id: string, coordinate?: Coordinate | null) => {
    const route = routes.find(item => item.segments.some(segment => segment.id === id))
    if (!route) return false
    tour.pause()
    navigate({ screen: 'detail', origin: route.originEntrance.placeId, routeId: route.id, segmentId: id, mapTheme: 'conditions' })
    if (coordinate) setCommunityFocus(previous => ({ coordinate, request: (previous?.request ?? 0) + 1 }))
    setSheetSize('full')
    return true
  }
  const clearDiscovery = () => {
    const savedView = routeView.current
    panelRestore.current = savedView
    routeView.current = null
    listView.current = null
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    navigate({ placeId: undefined, category: undefined, segmentId: savedView?.segmentId ?? state.segmentId })
    setSheetSize(savedView?.size ?? defaultSheetSize({ ...state, placeId: undefined, category: undefined }))
    if (!savedView) requestAnimationFrame(() => (document.getElementById('demo-mobile-heading') ?? document.getElementById('panel-heading'))?.focus({ preventScroll: true }))
  }
  const choosePlace = (place: CatalogPlace) => {
    rememberRouteView()
    if (hasPlaceList && !state.placeId) listView.current = capturePanelView()
    tour.pause()
    setPlaceFeedback('')
    const recent = rememberPlace(place.id, recentPlaces)
    setRecentPlaces(recent.ids)
    if (!recent.saved) setPlaceFeedback('最近查看無法儲存在此瀏覽器。')
    navigate({ placeId: place.id, segmentId: routeView.current?.segmentId ?? state.segmentId })
    setSheetSize('half')
  }
  const choosePlaceById = (id: string) => {
    const place = catalog?.places.find(item => item.id === id)
    if (place) choosePlace(place)
  }
  const chooseCategory = (category: CatalogCategory) => {
    if (state.category === category && !fieldGroup) { clearDiscovery(); return }
    rememberRouteView()
    tour.pause()
    setFieldGroup(undefined)
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    navigate({ category, placeId: undefined, segmentId: routeView.current?.segmentId ?? state.segmentId })
    setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const chooseFieldGroup = (ids: string[], title = '附近實勘點') => {
    rememberRouteView()
    tour.pause()
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    setFieldGroup({ ids, title })
    navigate({ category: 'field', placeId: undefined, segmentId: routeView.current?.segmentId ?? state.segmentId })
    setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const closePlace = () => {
    if (!hasPlaceList) { clearDiscovery(); return }
    panelRestore.current = listView.current
    setSheetSize(listView.current?.size ?? 'full')
    if (!listView.current) requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
    listView.current = null
    navigate({ placeId: undefined })
  }
  const setPlaceEndpoint = (action: 'from' | 'to') => {
    const patch = selectedPlace && placeEndpointPatch(selectedPlace, action)
    const route = patch && routes.find(item => item.originEntrance.placeId === patch.origin)
    if (route) openRoute(route)
  }
  const setPlacePlanEndpoint = (action: 'from' | 'to') => {
    if (selectedPlace) planFromPlace(action === 'from' ? 'start' : 'end', selectedPlace)
  }
  const placeEntrances = selectedPlace?.routePlaceId ? [...new Map(routes.flatMap(route => [route.originEntrance, route.destinationEntrance]).filter(entrance => entrance.placeId === selectedPlace.routePlaceId).map(entrance => [entrance.id, entrance])).values()] : []
  const placesTitle = placeQuery.trim() ? '搜尋結果' : fieldGroup?.title ?? (state.category ? categoryLabels[state.category] : '校園地點')
  const planReportNote = community.truncated ? '社群回報只載入部分，沿途可能還有其他路況。'
    : !conditionDataReady(community.fetchedAt, community.error, community.now) ? '目前未能取得完整的近期社群路況。' : ''
  const collapsed = discovering
    ? <div className="sheet-route-summary"><div><strong>{selectedPlace?.name ?? placesTitle}</strong></div><button onClick={() => setSheetSize('half')}>查看資訊</button></div>
    : planning ? plannerPicking
      ? null
      : plannedTour && tour.engaged
        ? <RouteExplorer route={plannedTour} tour={tour} compact onInspect={segment => selectPlannedLeg(segment.id, true)} />
        : <div className="sheet-route-summary"><div><strong>{planned ? `${formatDistance(planned.distanceM)} · 約 ${planned.estimateMinutes} 分鐘` : '路線規劃'}</strong></div><button onClick={() => setSheetSize('half')}>查看規劃</button></div>
    : state.screen === 'compare' ? <DemoRoutePicker routes={routes} onOpen={openRoute} headingId="demo-mobile-heading" onPlan={startPlanning} />
    : tourRoute && tour.engaged ? <RouteExplorer route={tourRoute} tour={tour} compact onInspect={inspectTourSegment} />
    : <div className="sheet-route-summary"><div><strong>{selected?.name ?? '路線'}</strong></div><button onClick={() => setSheetSize('half')}>查看路線</button></div>

  return <div className={`app mvp ${campus && mapScreen ? 'map-experience' : ''}`}>
    <a href="#content-panel" className="skip-link" onClick={event => { event.preventDefault(); setSheetSize('full'); requestAnimationFrame(() => document.getElementById('content-panel')?.focus()) }}>跳至主要內容</a>
    <header className="topbar">
      <button className="brand" onClick={showDirections} aria-label="輪椅友善路徑導航系統，返回地圖"><span className="brand-symbol"><RouteIcon size={25} aria-hidden="true" /></span><span><strong>輪椅友善路徑導航系統</strong></span></button>
      <nav className="product-nav" aria-label="主要功能">
        {navItems.map(item => {
          const active = item.screen === 'compare' ? mapScreen : state.screen === item.screen
          return <button key={item.screen} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => item.screen === 'compare' ? showDirections() : navigate({ screen: item.screen })}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span></button>
        })}
        <button disabled={!campus} onClick={() => openCommunity()} aria-haspopup="dialog"><MessageSquare size={17} aria-hidden="true" /><span>路況</span></button>
      </nav>
    </header>
    {mapScreen && !planning && state.screen !== 'compare' && <p className="route-scope-note"><Info size={16} aria-hidden="true" /><span>總圖與博雅的試走紀錄，部分通行條件尚未確認。</span></p>}

    {state.screen === 'help' ? <HelpPage onDemo={showDirections} onPlan={startPlanning} onSources={campus ? () => setShowSources(true) : undefined} />
      : state.screen === 'saved' ? <SavedRoutes favorites={favorites} allRoutes={routes} onOpen={favorite => navigate(fromHash(favorite.hash))}
        onRemove={key => { if (persistFavorites(favorites.filter(item => item.key !== key))) { setUndoFavorites(favorites); setFavoriteMessage('已移除收藏。') } }}
        onUndo={() => { if (undoFavorites && persistFavorites(undoFavorites)) { setUndoFavorites(null); setFavoriteMessage('已復原收藏。') } }}
        canUndo={!!undoFavorites} onPlan={showDirections} feedback={favoriteMessage} />
      : !campus ? <main className="app-loading" id="content-panel" tabIndex={-1}>
        {loading ? <><LoaderCircle className="spinner" size={28} /><h1>載入校園路線</h1></>
          : loadError && <><TriangleAlert size={32} /><h1>地圖資料暫時無法載入</h1><button className="button primary" onClick={retryCampus}>重新載入</button></>}
      </main>
      : <main className={`workspace route-workspace ${catalog && !planning ? 'has-discovery' : ''}`} data-discovering={discovering} data-has-place={!!selectedPlace} data-sheet={sheetSize} data-screen={state.screen} data-planner-picking={!!plannerPicking}>
      <MapSheet label={discovering ? '地點資訊' : planning ? '路線規劃' : state.screen === 'compare' ? '示範路線' : '路線資訊'} size={sheetSize} onSize={setSheetSize}
        showControls={!plannerPicking && (state.screen !== 'compare' || discovering || sheetSize !== 'map')} mobile={mobile} panelRef={panelRef} collapsed={collapsed}>
        <div className="panel-main" key={state.screen}>
          {placeFeedback && <p className="place-endpoint-feedback" role="status">{placeFeedback}</p>}
          {discovering && catalog && (selectedPlace ? <>
            <CatalogStatus loading={false} error={placeData.error} onRetry={placeData.retry} />
            <PlaceCard key={selectedPlace.id} place={selectedPlace} catalog={catalog} entrances={placeEntrances} mode="demo"
              onClose={closePlace} backLabel={hasPlaceList ? '返回地點清單' : planning ? '返回規劃路線' : state.screen === 'detail' ? '返回路線' : '返回地圖'}
              onEndpoint={setPlaceEndpoint} onPlanEndpoint={setPlacePlanEndpoint}
              onChoose={choosePlace} shareUrl={window.location.origin + window.location.pathname + publicHash({ ...state, category: undefined })} />
          </> : state.placeId ? <section className="place-empty">
            <h1 id="place-heading" tabIndex={-1}>{placeData.loading ? '載入地點' : '找不到這個地點'}</h1>
            <CatalogStatus loading={false} error={placeData.error} onRetry={placeData.retry} />
            <button className="button secondary" onClick={clearDiscovery}>返回路線</button>
          </section> : <PlaceList key={state.category ?? placeQuery} catalog={catalog} results={foundPlaces} category={state.category} title={placesTitle}
            onChoose={choosePlace} onBack={clearDiscovery} fieldList={state.category === 'field'}
            showAllFieldPoints={fieldGroup ? () => { setFieldGroup(undefined); document.getElementById('place-heading')?.focus({ preventScroll: true }) } : undefined}
            backLabel="返回路線" loading={placeData.loading} error={placeData.error} onRetry={placeData.retry} />)}

          <div className="route-panel-content" hidden={discovering}>
            {planning ? <PlannerPanel plan={plan} result={plannedResult} selected={planned} activeLeg={plannedLeg}
              network={routing.network} networkError={routing.error} places={catalog?.places ?? []} reportsNote={planReportNote}
              shareMessage={copyMessage || favoriteMessage} manualLink={copyFallback ? routeLink : undefined}
              onPlace={planFromPlace} onMap={beginPlannerPick} onClear={choosePlanEndpoint}
              onSwap={() => changePlan({ ...plan, start: plan.end, end: plan.start })}
              onPreference={preference => changePlan({ ...plan, preference })}
              onCandidate={selectPlannedRoute} onLeg={selectPlannedLeg} onField={choosePlaceById}
              onBack={showDirections} onCopy={copyLink} onSave={savePlanned} onReport={openCommunity} onRetry={routing.retry}
              onDraft={() => { tour.pause(); setDraftCoordinate(undefined); setDraftRoute(planned) }}
              preview={plannedTour && <details className="planner-details" onToggle={event => { if (!event.currentTarget.open && sheetSize !== 'map') tour.pause() }}>
                <summary>路線預演<ChevronDown size={15} aria-hidden="true" /></summary>
                <RouteExplorer route={plannedTour} tour={tour} onInspect={segment => selectPlannedLeg(segment.id, true)} onStart={startTour} />
              </details>} />
              : resolved.problem ? <UnavailableRoute problem={resolved.problem} onCompare={showDirections} onRoute={() => { if (selected) openRoute(selected) }} />
              : state.screen === 'compare' ? <DemoRoutePicker routes={routes} onOpen={openRoute} headingId="panel-heading" onPlan={startPlanning} />
              : selected && <>
              <div className="route-heading">
                <div className="route-heading-tools">
                  <button className="back-link" onClick={state.screen === 'confirm' ? () => openRoute(selected, state.segmentId) : showDirections}><ArrowLeft size={17} aria-hidden="true" />{state.screen === 'confirm' ? '返回路線' : '全部示範路線'}</button>
                  <p className="route-distance">{walkedDistanceLabel(selected)}</p>
                </div>
                <h1 id="panel-heading" tabIndex={-1}>{state.screen === 'confirm' ? '分享路線' : selected.name}</h1>
                {state.screen === 'confirm' && <p>{selected.name}</p>}
                <p className="route-endpoints">{selected.originEntrance.name} → {selected.destinationEntrance.name}</p>
              </div>

              {state.screen === 'detail' && activeSegment && <>
                <section className="route-attention" aria-labelledby="route-attention-heading">
                  <h2 id="route-attention-heading">沿途注意</h2>
                  <FieldLinks points={routeAttention} prefix="attention" onSelect={choosePlaceById} />
                  <button id="route-all-field-points" className="button secondary wide" onClick={() => chooseFieldGroup(routeFieldIds, '沿途實勘')}><Camera size={17} aria-hidden="true" />查看沿途實勘（{routeFieldIds.length}）</button>
                </section>
                <p className="walked-limits">全段坡度、路寬、階差、階梯及路面仍未完整量測。</p>
                <p className="detail-route-description">{selected.description}</p>
                <details className="walked-segment-picker">
                  <summary>逐段查看<small>第 {selected.segments.findIndex(segment => segment.id === activeSegment.id) + 1} 段</small><ChevronDown size={16} aria-hidden="true" /></summary>
                  <div className="segment-tabs" role="group" aria-label="選擇路段">{selected.segments.map((segment, index) => <button key={segment.id} aria-label={`第 ${index + 1} 段，${segment.name}`} aria-pressed={activeSegment.id === segment.id} className={activeSegment.id === segment.id ? 'active' : ''} onClick={event => {
                    tour.pause()
                    navigate({ segmentId: segment.id })
                    const picker = event.currentTarget.closest<HTMLDetailsElement>('details')
                    if (picker) picker.open = false
                    requestAnimationFrame(() => document.getElementById('field-section-heading')?.focus())
                  }}><span>{index + 1}</span><div><strong>{segment.name}</strong><small>{segment.approximate ? '館內走向約略' : formatDistance(lineDistance(segment.coordinates))}</small></div><ChevronRight size={15} aria-hidden="true" /></button>)}</div>
                </details>
                <SegmentInfo segment={activeSegment} onSelectField={choosePlaceById} />
                {tourRoute && <details className="mobile-route-preview" onToggle={event => { if (!event.currentTarget.open) tour.pause() }}>
                  <summary>路線預演<ChevronDown size={16} aria-hidden="true" /></summary>
                  <RouteExplorer route={tourRoute} tour={tour} onInspect={inspectTourSegment} onStart={startTour} />
                </details>}
                <div className="route-secondary-actions">
                  <button className="button plain" onClick={() => navigate({ screen: 'confirm', routeId: selected.id })}><Bookmark size={16} aria-hidden="true" />分享或收藏</button>
                </div>
                <details className="mvp-route-reports">
                  <summary>這一段的使用者回報</summary>
                  <CommunitySection data={community} segmentId={activeSegment.id} onOpen={() => openCommunity(activeSegment.id)} onOpenPhoto={tour.pause} />
                </details>
              </>}

              {state.screen === 'confirm' && <>
                <div className="route-share-actions">
                  <button className="button primary wide" onClick={copyLink}><Copy size={18} aria-hidden="true" />複製路線連結</button>
                  <div className="confirm-extra-actions"><button className="button secondary" onClick={saveFavorite}><Bookmark size={17} aria-hidden="true" />收藏路線</button><button className="button secondary" onClick={() => window.print()}><Printer size={17} aria-hidden="true" />列印路線</button></div>
                  {favoriteMessage && <p className="copy-feedback" role="status">{favoriteMessage}</p>}
                  {copyMessage && <p className="copy-feedback" role="status">{copyMessage}</p>}
                  {copyFallback && <input className="copy-fallback" aria-label="路線連結" readOnly value={routeLink} onFocus={event => event.target.select()} />}
                </div>
                <div className="entry-cards"><EndpointCard entrance={selected.originEntrance} label="起點" /><EndpointCard entrance={selected.destinationEntrance} label="終點" /></div>
              </>}
            </>}
          </div>
        </div>
      </MapSheet>

      {catalog && !planning && <PlaceSearch places={catalog.places} query={placeQuery} category={state.category} selected={selectedPlace} recent={recentPlaces}
        onQuery={value => {
          if (value.trim()) rememberRouteView()
          tour.pause(); setFieldGroup(undefined); setBrowsingPlaces(false); setPlaceQuery(value)
          if (state.placeId || state.category) navigate({ placeId: undefined, category: undefined })
          setSheetSize(value.trim() ? 'half' : defaultSheetSize({ ...state, placeId: undefined, category: undefined }))
        }}
        onChoose={choosePlace} onCategory={chooseCategory} onClear={clearDiscovery}
        onBrowse={() => {
          rememberRouteView()
          if (state.category || state.placeId) navigate({ category: undefined, placeId: undefined })
          setBrowsingPlaces(true)
          setSheetSize('full')
          requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
        }}
        onClearRecent={() => { if (clearRecentPlaces()) setRecentPlaces([]); else setPlaceFeedback('此瀏覽器無法清除最近查看。') }} />}
      <CampusMap campus={campus} routes={routes} selectedId={selected?.id ?? ''} segmentId={activeSegment?.id ?? ''} mode="demo" screen={state.screen}
        layoutKey={mobile ? sheetSize : 'desktop'} mapTheme={planning ? 'routes' : state.mapTheme} onThemeChange={planning ? undefined : mapTheme => {
          tour.pause(); setPlaceQuery(''); setBrowsingPlaces(false); navigate({ mapTheme, placeId: undefined, category: undefined })
          if (mobile) setSheetSize('map')
        }}
        communityFocus={communityFocus} catalogPlaces={catalog?.places} catalogCategory={state.category} catalogQuery={placeQuery}
        selectedPlaceId={state.placeId} discoveryActive={discovering} onSelectPlace={choosePlaceById} fieldGroupIds={fieldGroup?.ids}
        onSelectFieldGroup={chooseFieldGroup} onReturnRoutes={clearDiscovery} communityReports={community.reports}
        communitySegments={communitySegments} onSelectCommunity={openCommunity}
        mapObscured={mobile && sheetSize === 'full'}
        planner={planning ? {
          plan, routes: plannedRoutes, selectedId: planned?.id, legId: plannerLegId,
          access: plannedResult?.status === 'ok' ? plannedResult.access : undefined,
          picking: plannerPicking, observation: draftCoordinate,
          onPick: commitPlannerPick, onRoute: selectPlannedRoute, onLeg: id => { clearDiscovery(); selectPlannedLeg(id, true) },
        } : undefined}
        plannerPickError={plannerPickError} onCancelPlannerPick={cancelPlannerPick}
        onLocationActivity={() => { tour.pause(); tour.setFollowing(false) }}
        preview={tour.engaged && tour.position && !tour.position.leg.segment.approximate ? { coordinate: tour.position.coordinate, following: tour.following, reducedMotion: tour.reducedMotion, playing: tour.playing } : undefined}
        onMapDrag={() => { if (tour.engaged && tour.following) tour.setFollowing(false) }}
        onSelectRoute={id => { const route = routes.find(item => item.id === id); if (route) openRoute(route, id === selected?.id && state.segmentId ? state.segmentId : undefined) }}
        onSelectSegment={id => { const route = routes.find(item => item.segments.some(segment => segment.id === id)); if (route) openRoute(route, id) }} />
    </main>}
    <OfflineStatus />
    {showSources && campus && <SourceDialog campus={{ ...campus, sources: [...campus.sources, ...(catalog?.sources.filter(source => source.id === 'osm-amenities') ?? [])] }} onClose={() => setShowSources(false)} />}
    {campus && <CommunityDialog open={communityOpen} onClose={() => setCommunityOpen(false)} data={community} segments={communitySegments} initialSegment={communitySegment} onInspect={inspectCommunitySegment} onOpenPhoto={tour.pause} />}
    {planning && draftRoute && plan.start && plan.end && <PlannerDraftDialog key={draftRoute.id} route={draftRoute}
      start={plan.start} end={plan.end} activeLegId={plannedLeg?.id} open={plannerPicking !== 'observation'}
      pickedPoint={draftCoordinate} pickedLegId={draftLegId} onPick={legId => {
        setDraftCoordinate(undefined); setDraftLegId(legId); beginPlannerPick('observation')
      }} onClearPick={() => setDraftCoordinate(undefined)}
      onClose={() => { setDraftRoute(undefined); setDraftCoordinate(undefined); setDraftLegId('') }} />}
    {state.screen === 'confirm' && !resolved.problem && selected && campus && <PrintableRoute route={selected} state={state} snapshotDate={campus.retrievedAt} />}
    <div className="sr-only" aria-live="polite">{state.screen === 'detail' && activeSegment ? `目前路段 ${activeSegment.name}` : ''}</div>
  </div>
}
