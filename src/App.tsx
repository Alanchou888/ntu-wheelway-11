import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Camera, ChevronDown, ChevronRight, Copy, Info, LoaderCircle, MessageSquare, Printer, Route as RouteIcon, TriangleAlert, X } from 'lucide-react'
import CampusMap, { colors } from './CampusMap'
import type { Campus, CatalogCategory, CatalogPlace, Coordinate, Entrance, NavigationState, Route, Segment } from './types'
import { buildWalkedRoutes } from './walked-routes'
import { formatDate, formatDistance, fromHash, lineDistance, lineMidpoint, metrics } from './routes'
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
import { CatalogStatus, PlaceCard, PlaceList, PlaceSearch } from './PlaceDiscovery'
import { fieldObservation } from './field-observations'
import './product.css'
import './campus-design.css'
import './route-experience.css'
import './road-conditions.css'
import './mvp.css'

const navItems = [
  { screen: 'compare', label: '路線', icon: RouteIcon },
  { screen: 'saved', label: '收藏', icon: Bookmark },
  { screen: 'help', label: '說明', icon: BookOpen },
] as const

function defaultSheetSize(state: NavigationState): SheetSize {
  if (state.placeId?.startsWith('field-') || state.category === 'field') return 'full'
  return state.screen === 'compare' && !state.placeId && !state.category ? 'map' : 'half'
}

function DirectionPicker({ routes, onOpen }: { routes: Route[]; onOpen: (route: Route) => void }) {
  return <div className="direction-picker" id="direction-picker" tabIndex={-1} aria-labelledby="direction-heading">
    <h1 id="direction-heading">選擇方向</h1>
    <div className="walked-route-picker">
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

function SegmentInfo({ segment, onSelectField }: { segment: Segment; onSelectField: (id: string) => void }) {
  const fields = (segment.fieldPointIds ?? []).flatMap(id => fieldObservation(id) ?? [])
  const facts = [
    ['最大坡度', segment.maxSlopePercent, '%'],
    ['最窄路寬', segment.minWidthM, ' 公尺'],
    ['最大階差', segment.stepHeightCm, ' 公分'],
  ] as const
  return <section className="segment-info walked-segment-info" aria-labelledby="field-section-heading">
    <div className="section-heading"><h2 id="field-section-heading" tabIndex={-1}>現場紀錄</h2>{fields.length > 0 && segment.retrievedAt && <span>最近紀錄 {formatDate(segment.retrievedAt)}</span>}</div>
    <h3 className="field-segment-name">{segment.name}</h3>
    {fields.length ? <div className="segment-field-links">
      {fields.map(point => {
        const values = point.readings?.map(reading => reading.value) ?? ['現場照片']
        return <button key={point.id} onClick={() => onSelectField(point.id)}>
          <span><strong>{point.name}</strong><small>{[point.level, ...values].filter(Boolean).join(' · ')}</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      })}
    </div> : <p className="segment-no-points">這段沒有個別點位紀錄。</p>}
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
  const community = useCommunity(!!campus)
  const mobile = useMediaQuery('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)')
  const panelRef = useRef<HTMLElement>(null)

  const discovering = !!state.placeId || !!state.category || !!placeQuery.trim() || browsingPlaces
  const selectedPlace = catalog?.places.find(place => place.id === state.placeId)
  const foundPlaces = useMemo(() => {
    const matches = catalog ? findPlaces(catalog.places, placeQuery, state.category) : []
    return fieldGroup ? fieldGroup.ids.flatMap(id => matches.find(place => place.id === id) ?? []) : matches
  }, [catalog, placeQuery, state.category, fieldGroup])
  useEffect(() => { if (catalog) setRecentPlaces(readRecentPlaces(catalog.places)) }, [catalog])

  const routes = useMemo(buildWalkedRoutes, [])
  const communitySegments = useMemo(() => routes.flatMap(route => route.segments.map(segment => ({
    id: segment.id, name: segment.name, routeName: route.name, coordinate: lineMidpoint(segment.coordinates), coordinates: segment.coordinates,
  }))), [routes])
  const resolved = resolveSharedRoute(routes, state)
  const selected = resolved.route ?? (state.screen === 'compare' ? routes[0] : undefined)
  const baseSegment = selected?.segments.find(segment => segment.id === state.segmentId) ?? selected?.segments[0]
  const tourRoute = selected && !resolved.problem && !discovering && state.screen === 'detail' ? selected : null
  const tour = useRouteTour(tourRoute, state.segmentId)
  const activeSegment = tourRoute && tour.engaged && tour.position ? tour.position.leg.segment : baseSegment
  const routeFieldIds = selected?.segments.flatMap(segment => segment.fieldPointIds ?? []) ?? []
  const mapScreen = state.screen !== 'help' && state.screen !== 'saved'

  useEffect(() => {
    const handler = () => {
      const next = publicNavigation(fromHash(window.location.hash))
      if (next.screen !== state.screen || next.placeId !== state.placeId || next.category !== state.category) {
        setSheetSize(defaultSheetSize(next))
        if (next.screen !== state.screen || !next.category) setFieldGroup(undefined)
        if (next.screen !== state.screen || next.placeId) setPlaceQuery('')
        if (next.screen !== state.screen) setBrowsingPlaces(false)
      }
      setState(next)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [state])
  useEffect(() => {
    panelRef.current?.querySelector('.panel-main')?.scrollTo({ top: 0 })
    const heading = document.getElementById('place-heading') ?? document.getElementById('direction-picker') ?? document.getElementById('panel-heading')
    heading?.focus({ preventScroll: true })
  }, [state.screen, loading])
  useEffect(() => { panelRef.current?.querySelector('.panel-main')?.scrollTo({ top: 0 }) }, [state.placeId, state.category, placeQuery, fieldGroup])

  const navigate = (patch: Partial<NavigationState>) => {
    const next = publicNavigation({ ...state, ...(patch.screen ? { placeId: undefined, category: undefined } : {}), ...patch })
    if (patch.screen) {
      setPlaceQuery('')
      setPlaceFeedback('')
      setBrowsingPlaces(false)
      setSheetSize(defaultSheetSize(next))
    }
    if (patch.screen || 'category' in patch && next.category !== 'field') setFieldGroup(undefined)
    setState(next)
    const hash = publicHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setCopyMessage('')
    setCopyFallback(false)
    setFavoriteMessage('')
    if (state.screen === 'saved' && patch.screen && patch.screen !== 'saved') setUndoFavorites(null)
  }
  const showDirections = () => navigate({ screen: 'compare', routeId: '', segmentId: '' })
  const openRoute = (route: Route, segmentId = route.segments[0]?.id ?? '') => navigate({ screen: 'detail', origin: route.originEntrance.placeId, routeId: route.id, segmentId })
  const routeLink = `${window.location.origin}${window.location.pathname}${publicHash({ ...state, screen: 'detail', routeId: selected?.id ?? state.routeId, placeId: undefined, category: undefined })}`
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(routeLink); setCopyMessage('路線連結已複製') }
    catch { setCopyMessage('請複製下方的路線連結'); setCopyFallback(true) }
  }
  const persistFavorites = (next: Favorite[]) => {
    try { writeFavorites(next); setFavorites(next); return true }
    catch { setFavoriteMessage('這個瀏覽器無法保存收藏。可以複製連結。'); return false }
  }
  const saveFavorite = () => {
    if (!selected) return
    const saved = favoriteFor(selected, state)
    const favorite = { ...saved, hash: publicHash({ ...state, screen: 'detail', routeId: selected.id, segmentId: '', placeId: undefined, category: undefined }) }
    if (favorites.length >= 20 && !favorites.some(item => item.key === favorite.key)) { setFavoriteMessage('收藏已滿 20 條，請先移除一條。'); return }
    if (persistFavorites([favorite, ...favorites.filter(item => item.key !== favorite.key)])) {
      setUndoFavorites(null)
      setFavoriteMessage('已加入這個瀏覽器的收藏。')
    }
  }
  const inspectTourSegment = (segment: Segment) => {
    tour.pause()
    if (selected) openRoute(selected, segment.id)
    if (mobile) setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('field-section-heading')?.focus({ preventScroll: true }))
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
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    navigate({ placeId: undefined, category: undefined })
    setSheetSize(defaultSheetSize({ ...state, placeId: undefined, category: undefined }))
    requestAnimationFrame(() => (document.getElementById('direction-picker') ?? document.getElementById('panel-heading'))?.focus({ preventScroll: true }))
  }
  const choosePlace = (place: CatalogPlace) => {
    tour.pause()
    setPlaceQuery('')
    setPlaceFeedback('')
    const recent = rememberPlace(place.id, recentPlaces)
    setRecentPlaces(recent.ids)
    if (!recent.saved) setPlaceFeedback('最近查看無法儲存在此瀏覽器。')
    navigate({ placeId: place.id })
    setSheetSize(place.category === 'field' ? 'full' : 'half')
  }
  const choosePlaceById = (id: string) => {
    const place = catalog?.places.find(item => item.id === id)
    if (place) choosePlace(place)
  }
  const chooseCategory = (category: CatalogCategory) => {
    if (state.category === category && !fieldGroup) { clearDiscovery(); return }
    tour.pause()
    setFieldGroup(undefined)
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    navigate({ category, placeId: undefined })
    setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const chooseFieldGroup = (ids: string[], title = '附近實勘點') => {
    tour.pause()
    setPlaceQuery('')
    setPlaceFeedback('')
    setBrowsingPlaces(false)
    setFieldGroup({ ids, title })
    navigate({ category: 'field', placeId: undefined })
    setSheetSize('full')
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const hasPlaceList = !!state.category || browsingPlaces
  const closePlace = () => {
    if (!hasPlaceList) { clearDiscovery(); return }
    navigate({ placeId: undefined })
    requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
  }
  const setPlaceEndpoint = (action: 'from' | 'to') => {
    const patch = selectedPlace && placeEndpointPatch(selectedPlace, action)
    const route = patch && routes.find(item => item.originEntrance.placeId === patch.origin)
    if (route) openRoute(route)
  }
  const placeEntrances = selectedPlace?.routePlaceId ? [...new Map(routes.flatMap(route => [route.originEntrance, route.destinationEntrance]).filter(entrance => entrance.placeId === selectedPlace.routePlaceId).map(entrance => [entrance.id, entrance])).values()] : []
  const placesTitle = placeQuery.trim() ? '搜尋結果' : fieldGroup?.title ?? (state.category ? categoryLabels[state.category] : '校園地點')
  const collapsed = discovering
    ? <div className="sheet-route-summary"><div><strong>{selectedPlace?.name ?? placesTitle}</strong></div><button onClick={() => setSheetSize('half')}>查看資訊</button></div>
    : state.screen === 'compare' ? <DirectionPicker routes={routes} onOpen={openRoute} />
    : tourRoute && tour.engaged ? <RouteExplorer route={tourRoute} tour={tour} compact onInspect={inspectTourSegment} />
    : <div className="sheet-route-summary"><div><strong>{selected?.name ?? '路線'}</strong></div><button onClick={() => setSheetSize('half')}>查看路線</button></div>

  return <div className={`app mvp ${campus && mapScreen ? 'map-experience' : ''}`}>
    <a href="#content-panel" className="skip-link" onClick={event => { event.preventDefault(); setSheetSize('full'); requestAnimationFrame(() => document.getElementById('content-panel')?.focus()) }}>跳至主要內容</a>
    <header className="topbar">
      <button className="brand" onClick={showDirections} aria-label="輪椅友善路徑導航系統，返回路線"><span className="brand-symbol"><RouteIcon size={25} aria-hidden="true" /></span><span><strong>輪椅友善路徑導航系統</strong></span></button>
      <nav className="product-nav" aria-label="主要功能">
        {navItems.map(item => {
          const active = item.screen === 'compare' ? mapScreen : state.screen === item.screen
          return <button key={item.screen} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => item.screen === 'compare' ? showDirections() : navigate({ screen: item.screen })}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span></button>
        })}
        <button disabled={!campus} onClick={() => openCommunity()} aria-haspopup="dialog"><MessageSquare size={17} aria-hidden="true" /><span>路況</span></button>
      </nav>
    </header>
    {mapScreen && <p className="route-scope-note"><Info size={16} aria-hidden="true" /><span>總圖與博雅的試走紀錄，部分通行條件尚未確認。</span></p>}

    {state.screen === 'help' ? <HelpPage onDemo={showDirections} onSources={campus ? () => setShowSources(true) : undefined} />
      : state.screen === 'saved' ? <SavedRoutes favorites={favorites} allRoutes={routes} onOpen={favorite => navigate(fromHash(favorite.hash))}
        onRemove={key => { if (persistFavorites(favorites.filter(item => item.key !== key))) { setUndoFavorites(favorites); setFavoriteMessage('已移除收藏。') } }}
        onUndo={() => { if (undoFavorites && persistFavorites(undoFavorites)) { setUndoFavorites(null); setFavoriteMessage('已復原收藏。') } }}
        canUndo={!!undoFavorites} onPlan={showDirections} feedback={favoriteMessage} />
      : !campus ? <main className="app-loading" id="content-panel" tabIndex={-1}>
        {loading ? <><LoaderCircle className="spinner" size={28} /><h1>載入校園路線</h1></>
          : loadError && <><TriangleAlert size={32} /><h1>地圖資料暫時無法載入</h1><button className="button primary" onClick={retryCampus}>重新載入</button></>}
      </main>
      : <main className={`workspace route-workspace ${catalog ? 'has-discovery' : ''}`} data-discovering={discovering} data-sheet={sheetSize} data-screen={state.screen}>
      <MapSheet label={discovering ? '地點資訊' : state.screen === 'compare' ? '選擇方向' : '路線資訊'} size={sheetSize} onSize={setSheetSize}
        showControls={state.screen !== 'compare' || discovering || sheetSize !== 'map'} mobile={mobile} panelRef={panelRef} collapsed={collapsed}>
        <div className="panel-main" key={state.screen}>
          {placeFeedback && <p className="place-endpoint-feedback" role="status">{placeFeedback}</p>}
          {discovering && catalog && (selectedPlace ? <>
            <CatalogStatus loading={false} error={placeData.error} onRetry={placeData.retry} />
            <PlaceCard key={selectedPlace.id} place={selectedPlace} catalog={catalog} entrances={placeEntrances} mode="demo"
              onClose={closePlace} backLabel={hasPlaceList ? '返回地點清單' : state.screen === 'detail' ? '返回路線' : '返回地圖'}
              onEndpoint={setPlaceEndpoint} onChoose={choosePlace} shareUrl={window.location.origin + window.location.pathname + publicHash({ ...state, category: undefined })} />
          </> : state.placeId ? <section className="place-empty">
            <h1 id="place-heading" tabIndex={-1}>{placeData.loading ? '載入地點' : '找不到這個地點'}</h1>
            <CatalogStatus loading={false} error={placeData.error} onRetry={placeData.retry} />
            <button className="button secondary" onClick={clearDiscovery}>返回路線</button>
          </section> : <PlaceList key={state.category ?? placeQuery} catalog={catalog} results={foundPlaces} category={state.category} title={placesTitle}
            onChoose={choosePlace} onBack={clearDiscovery} fieldList={state.category === 'field'}
            showAllFieldPoints={fieldGroup ? () => { setFieldGroup(undefined); document.getElementById('place-heading')?.focus({ preventScroll: true }) } : undefined}
            backLabel="返回路線" loading={placeData.loading} error={placeData.error} onRetry={placeData.retry} />)}

          <div className="route-panel-content" hidden={discovering}>
            {resolved.problem ? <UnavailableRoute problem={resolved.problem} onCompare={showDirections} onRoute={() => { if (selected) openRoute(selected) }} />
              : state.screen === 'compare' ? <>
              <h1 id="panel-heading" tabIndex={-1}>選擇方向</h1>
              <div className="route-cards direction-cards">{routes.map(route => <button key={route.id} className={`route-card walked-route-card ${route.id === 'walk-back' ? 'direct' : 'gentle'}`} onClick={() => openRoute(route)} aria-label={`查看${route.name}`}>
                <div className="route-card-top"><span className="route-card-icon"><RouteIcon size={20} aria-hidden="true" /></span>
                  <div><strong>{route.name}</strong><span>{route.description}</span><small className="walked-route-distance">圖上約 {formatDistance(metrics(route).distanceM)}</small></div>
                  <ChevronRight className="walked-route-open" size={18} aria-hidden="true" />
                </div>
              </button>)}</div>
            </> : selected && <>
              <div className="route-heading">
                <button className="back-link" onClick={state.screen === 'confirm' ? () => openRoute(selected, state.segmentId) : showDirections}><ArrowLeft size={17} aria-hidden="true" />{state.screen === 'confirm' ? '返回路線' : '更換方向'}</button>
                <h1 id="panel-heading" tabIndex={-1}>{state.screen === 'confirm' ? '分享路線' : selected.name}</h1>
                {state.screen === 'confirm' && <p>{selected.name}</p>}
                <p className="route-distance">圖上約 {formatDistance(metrics(selected).distanceM)}</p>
              </div>

              {state.screen === 'detail' && activeSegment && <>
                <p className="detail-route-description">{selected.description}</p>
                <div className="route-primary-actions">
                  {routeFieldIds.length > 0 && <button className="button primary" onClick={() => chooseFieldGroup(routeFieldIds, '沿途實勘')}><Camera size={17} aria-hidden="true" />查看沿途實勘</button>}
                  <button className="button secondary" onClick={() => navigate({ screen: 'confirm', routeId: selected.id })}><Bookmark size={16} aria-hidden="true" />分享或收藏</button>
                </div>
                <details className="walked-segment-picker">
                  <summary>切換路段<small>{selected.segments.findIndex(segment => segment.id === activeSegment.id) + 1} / {selected.segments.length}</small><ChevronDown size={16} aria-hidden="true" /></summary>
                  <div className="segment-tabs" role="group" aria-label="選擇路段">{selected.segments.map((segment, index) => <button key={segment.id} aria-label={`第 ${index + 1} 段，${segment.name}`} aria-pressed={activeSegment.id === segment.id} className={activeSegment.id === segment.id ? 'active' : ''} onClick={event => {
                    tour.pause()
                    navigate({ segmentId: segment.id })
                    const picker = event.currentTarget.closest<HTMLDetailsElement>('details')
                    if (picker) { picker.open = false; picker.querySelector('summary')?.focus({ preventScroll: true }) }
                  }}><span>{index + 1}</span><div><strong>{segment.name}</strong><small>{formatDistance(lineDistance(segment.coordinates))}</small></div><ChevronRight size={15} aria-hidden="true" /></button>)}</div>
                </details>
                <SegmentInfo segment={activeSegment} onSelectField={choosePlaceById} />
                {tourRoute && <details className="mobile-route-preview" onToggle={event => { if (!event.currentTarget.open) tour.pause() }}>
                  <summary>路線預演<ChevronDown size={16} aria-hidden="true" /></summary>
                  <RouteExplorer route={tourRoute} tour={tour} onInspect={inspectTourSegment} onStart={startTour} />
                </details>}
                <CommunitySection data={community} segmentId={activeSegment.id} onOpen={() => openCommunity(activeSegment.id)} onOpenPhoto={tour.pause} />
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

      {catalog && <PlaceSearch places={catalog.places} query={placeQuery} category={state.category} selected={selectedPlace} recent={recentPlaces}
        onQuery={value => {
          tour.pause(); setFieldGroup(undefined); setBrowsingPlaces(false); setPlaceQuery(value)
          if (state.placeId || state.category) navigate({ placeId: undefined, category: undefined })
          setSheetSize(value.trim() ? 'half' : defaultSheetSize({ ...state, placeId: undefined, category: undefined }))
        }}
        onChoose={choosePlace} onCategory={chooseCategory} onClear={clearDiscovery}
        onBrowse={() => {
          if (state.category || state.placeId) navigate({ category: undefined, placeId: undefined })
          setBrowsingPlaces(true)
          setSheetSize('full')
          requestAnimationFrame(() => document.getElementById('place-heading')?.focus({ preventScroll: true }))
        }}
        onClearRecent={() => { if (clearRecentPlaces()) setRecentPlaces([]); else setPlaceFeedback('此瀏覽器無法清除最近查看。') }} />}
      <CampusMap campus={campus} routes={routes} selectedId={selected?.id ?? ''} segmentId={activeSegment?.id ?? ''} mode="demo" screen={state.screen}
        layoutKey={mobile ? sheetSize : 'desktop'} mapTheme={state.mapTheme} onThemeChange={mapTheme => {
          tour.pause(); setPlaceQuery(''); setBrowsingPlaces(false); navigate({ mapTheme, placeId: undefined, category: undefined })
          if (mobile) setSheetSize('map')
        }}
        communityFocus={communityFocus} catalogPlaces={catalog?.places} catalogCategory={state.category} catalogQuery={placeQuery}
        selectedPlaceId={state.placeId} discoveryActive={discovering} onSelectPlace={choosePlaceById} fieldGroupIds={fieldGroup?.ids}
        onSelectFieldGroup={chooseFieldGroup} onReturnRoutes={clearDiscovery} communityReports={community.reports}
        communitySegments={communitySegments} onSelectCommunity={openCommunity}
        onLocationActivity={() => { tour.pause(); tour.setFollowing(false); if (discovering) clearDiscovery() }}
        preview={tour.engaged && tour.position ? { coordinate: tour.position.coordinate, following: tour.following, reducedMotion: tour.reducedMotion, playing: tour.playing } : undefined}
        onMapDrag={() => { if (tour.engaged && tour.following) tour.setFollowing(false) }}
        onSelectRoute={id => { const route = routes.find(item => item.id === id); if (route) openRoute(route) }}
        onSelectSegment={id => { const route = routes.find(item => item.segments.some(segment => segment.id === id)); if (route) openRoute(route, id) }} />
    </main>}
    <OfflineStatus />
    {showSources && campus && <SourceDialog campus={{ ...campus, sources: [...campus.sources, ...(catalog?.sources.filter(source => source.id === 'osm-amenities') ?? [])] }} onClose={() => setShowSources(false)} />}
    {campus && <CommunityDialog open={communityOpen} onClose={() => setCommunityOpen(false)} data={community} segments={communitySegments} initialSegment={communitySegment} onInspect={inspectCommunitySegment} onOpenPhoto={tour.pause} />}
    {state.screen === 'confirm' && !resolved.problem && selected && campus && <PrintableRoute route={selected} state={state} snapshotDate={campus.retrievedAt} />}
    <div className="sr-only" aria-live="polite">{state.screen === 'detail' && activeSegment ? `目前路段 ${activeSegment.name}` : ''}</div>
  </div>
}
