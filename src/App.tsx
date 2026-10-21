import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Accessibility, ArrowDownUp, ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Copy, Footprints, Info, LoaderCircle, Mountain, Printer, Route as RouteIcon, ShieldCheck, SlidersHorizontal, TriangleAlert, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CampusMap from './CampusMap'
import type { Campus, Entrance, Mode, NavigationState, Route, Screen, Segment } from './types'
import { buildDemoRoutes, formatDate, formatDistance, fromHash, lineDistance, metrics, placeNames, reverseRoute, segmentLabel, toHash } from './routes'
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
import './product.css'
import './campus-design.css'
import './route-experience.css'

const SurveyEditor = lazy(() => import('./SurveyEditor'))

const screens: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: 'setup', label: '設定條件', icon: SlidersHorizontal },
  { id: 'compare', label: '比較路線', icon: RouteIcon },
  { id: 'detail', label: '檢視路段', icon: Footprints },
  { id: 'confirm', label: '確認動線', icon: CheckCircle2 },
]
const metricValue = (n: number | null, suffix: string) => n === null ? '尚無資料' : `${Number(n.toFixed(1))}${suffix}`

function RouteStats({ route, compact = false }: { route: Route; compact?: boolean }) {
  const m = metrics(route)
  return <div className={`route-stats ${compact ? 'compact' : ''}`}>
    <div><span>總距離</span><strong>{Math.round(m.distanceM)}<small>m</small></strong></div>
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
    <p className="dialog-intro">地圖與設施來自公開圖資。示範路況及入口尚待實勘，資料取得時間與實地查核日期分開記錄。</p>
    <div className="source-list">{campus.sources.map(source => <article key={source.id} className="source-card"><div className="source-card-top"><strong>{source.label}</strong><span className={`tiny-badge ${source.status === 'cached' ? 'amber' : ''}`}>{source.status === 'cached' ? '保留快照' : '公開資料'}</span></div><p>取得日期：{formatDate(source.retrievedAt)}</p>{source.note && <p>{source.note}</p>}<a href={source.url} target="_blank" rel="noreferrer">查看原始來源 <ArrowRight size={14} /></a></article>)}</div>
    <div className="source-explainer"><Info size={19} /><p>臺大建物座標用於地點定位。入口位置與整段路線通行條件，需另外查核。示範路線的坡度、路寬及路面數值均為模擬。</p></div>
    <a className="text-link template-link" href="/templates/field-survey.csv" download><ClipboardCheck size={17} />下載空白實勘紀錄範本</a>
    <button className="button secondary wide" onClick={onClose}>返回地圖</button>
  </dialog>
}

function EmptyRoutes({ onDemo, onSetup, onRetry, failed, filtered }: { onDemo: () => void; onSetup: () => void; onRetry: () => void; failed: boolean; filtered: boolean }) {
  return <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={34} strokeWidth={1.5} /></div><span className="eyebrow">{filtered ? '依目前條件篩選' : '等待實勘資料'}</span><h2 id="panel-heading" tabIndex={-1}>{failed ? '查核資料暫時無法載入' : filtered ? '目前沒有符合條件的路線' : '目前無已查核路線'}</h2><p>{failed ? '圖資仍可使用。請重新載入查核資料，或先體驗示範模式。' : filtered ? '可以查看下方排除原因，再回設定調整自己的通行限制。' : '總圖至博雅的入口與路段尚待團隊實地查核。你可以先使用示範路線，體驗完整選路流程。'}</p><div className="empty-rule"><ShieldCheck size={20} /><span>{filtered ? '設定的量測條件不符合，或缺少對應量測值時，路線會被排除。' : '僅列出全程及兩端入口皆已查核、無階梯且未封閉的實勘路線。'}</span></div>{failed && <button className="button primary wide" onClick={onRetry}>重新載入查核資料</button>}{!filtered && <button className="button secondary wide" onClick={onDemo}>試用兩條示範路線<ArrowRight size={18} /></button>}<button className="button plain wide" onClick={onSetup}>返回設定條件</button></div>
}

function EntranceCard({ entrance, letter }: { entrance: Entrance; letter: string }) {
  return <details className="entrance-card"><summary><span className="entry-letter">{letter}</span><div><span>{letter === 'A' ? '起點入口' : '終點入口'}</span><strong>{entrance.name}</strong></div><ChevronDown size={17} /></summary><div className="entry-body"><p>{entrance.source}</p><p>查核日期：{formatDate(entrance.verifiedAt)}</p><PhotoGallery key={entrance.id} photos={entrance.photos} /></div></details>
}

function SegmentInfo({ segment, onOpenPhoto }: { segment: Segment; onOpenPhoto: () => void }) {
  const facts = [
    ['最大坡度', metricValue(segment.maxSlopePercent, '%')], ['有效路寬', metricValue(segment.minWidthM, ' m')],
    ['最大階差', metricValue(segment.stepHeightCm, ' cm')], ['坡道長度', metricValue(segment.rampLengthM, ' m')],
    ['路面條件', segment.surface ?? '尚無資料'], ['階梯', segment.hasStairs === null ? '尚未確認' : segment.hasStairs ? '有階梯' : '無階梯'],
  ]
  return <article className="segment-info"><div className="section-heading"><h3>{segment.name}</h3><span className={`tiny-badge ${segment.status === 'demo' ? 'amber' : ''}`}>{segmentLabel(segment)}</span></div><dl className="fact-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <PhotoGallery key={segment.id} photos={segment.photos} onOpen={onOpenPhoto} />
    <div className={`obstacle-note ${segment.obstacles.length ? 'has-obstacle' : ''}`}><Info size={17} /><p>{segment.obstacles.length ? segment.obstacles.join('、') : segment.status === 'demo' ? '此段未設定額外障礙，實際情況待查核。' : '查核紀錄未列固定障礙，仍請留意現場。'}</p></div>
    <details className="evidence-details"><summary>資料依據與查核資訊<ChevronDown size={15} /></summary><div><p><span>查核狀態</span>{segmentLabel(segment)}</p><p><span>查核日期</span>{formatDate(segment.verifiedAt)}</p><p><span>圖資取得</span>{formatDate(segment.retrievedAt)}</p><p className="source-text">{segment.source}</p>{segment.sourceUrl && <a href={segment.sourceUrl} target="_blank" rel="noreferrer">查看來源 <ArrowRight size={13} /></a>}</div></details>
  </article>
}

export default function App() {
  const [state, setState] = useState<NavigationState>(readInitialNavigation)
  const { campus, survey, loading, loadError, surveyLoading, surveyError, retryCampus, retrySurvey } = useCampusData()
  const [showSources, setShowSources] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [copyFallback, setCopyFallback] = useState(false)
  const [favorites, setFavorites] = useState(readFavorites)
  const [favoriteMessage, setFavoriteMessage] = useState('')
  const [undoFavorites, setUndoFavorites] = useState<Favorite[] | null>(null)
  const [profileFeedback, setProfileFeedback] = useState('')
  const [sheetSize, setSheetSize] = useState<SheetSize>('half')
  const mobile = useMediaQuery('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)')
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handler = async () => {
      const next = fromHash(window.location.hash)
      if (state.screen === 'editor' && next.screen !== 'editor') {
        try { await flushSurveyDraft() }
        catch { window.history.replaceState(null, '', toHash(state)); return }
      }
      if (next.screen !== state.screen) setSheetSize('half')
      setState(next)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [state])
  const navigate = async (patch: Partial<NavigationState>) => {
    if (state.screen === 'editor') { try { await flushSurveyDraft() } catch { return } }
    const next = { ...state, ...patch }
    if (next.screen !== state.screen) setSheetSize('half')
    setState(next)
    const hash = toHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setCopyMessage('')
    setCopyFallback(false)
    setFavoriteMessage('')
    if (state.screen === 'saved' && patch.screen && patch.screen !== 'saved') setUndoFavorites(null)
    if ('wheelchair' in patch || 'preference' in patch || 'limits' in patch) setProfileFeedback('')
  }
  const allRoutes = useMemo(() => campus ? [...buildDemoRoutes(campus), ...survey.routes] : [], [campus, survey])
  const candidates = useMemo(() => selectCandidates(allRoutes, state), [allRoutes, state.mode, state.preference, state.limits])
  const routes = useMemo(() => candidates.accepted.map(r => state.origin === r.originEntrance.placeId ? r : reverseRoute(r)), [candidates, state.origin])
  const resolved = resolveSharedRoute(routes, state)
  const selected = resolved.route
  const baseSegment = selected?.segments.find(s => s.id === state.segmentId) ?? selected?.segments[0]
  const tourRoute = selected && !resolved.problem && ['detail', 'confirm'].includes(state.screen) && (state.mode === 'demo' || !surveyLoading) ? selected : null
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
  const openRoute = (route: Route) => navigate({ screen: 'detail', routeId: route.id, segmentId: route.segments[0]?.id ?? '' })
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
  const remember = () => { try { savePreferences(state); setProfileFeedback('已記住輪椅類型、偏好與通行條件。') } catch { setProfileFeedback('這個瀏覽器無法記住設定，仍可繼續選路。') } }
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

  return <div className={`app ${campus && step >= 0 ? 'map-experience' : ''}`}>
    <a href="#content-panel" className="skip-link" onClick={e => { e.preventDefault(); setSheetSize('full'); requestAnimationFrame(() => document.getElementById('content-panel')?.focus()) }}>跳至操作內容</a>
    <header className="topbar">
      <button className="brand" onClick={() => navigate({ screen: 'setup' })} aria-label="輪行臺大，返回設定"><span className="brand-symbol"><RouteIcon size={27} strokeWidth={2} aria-hidden="true" /></span><span><strong>輪行臺大</strong><small>校園無障礙路線</small></span></button>
      <nav className="product-nav" aria-label="主要功能">{[{ screen: 'setup' as const, label: '路線規劃', icon: RouteIcon }, { screen: 'saved' as const, label: '我的收藏', icon: Bookmark }, { screen: 'help' as const, label: '使用說明', icon: BookOpen }, { screen: 'editor' as const, label: '實勘編輯', icon: ClipboardCheck }].map(item => <button key={item.screen} className={(item.screen === 'setup' ? step >= 0 : state.screen === item.screen) ? 'active' : ''} aria-current={(item.screen === 'setup' ? step >= 0 : state.screen === item.screen) ? 'page' : undefined} onClick={() => navigate({ screen: item.screen })}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span>{item.screen === 'saved' && favorites.length > 0 && <small>{favorites.length}</small>}</button>)}</nav>
      <button className="source-button" onClick={() => setShowSources(true)} disabled={!campus}><Info size={18} aria-hidden="true" /><span>資料來源</span></button>
    </header>
    {step >= 0 && <div className="journey-bar"><nav className="stepper" aria-label="選路流程">{screens.map((item, i) => { const Icon = item.icon; return <button key={item.id} className={`step ${i === step ? 'current' : ''} ${i < step ? 'completed' : ''}`} disabled={i > step} aria-label={`步驟 ${i + 1}：${item.label}`} aria-current={i === step ? 'step' : undefined} onClick={() => navigate({ screen: item.id })}><span className="step-index" aria-hidden="true">{i < step ? <Check size={13} /> : i + 1}</span><Icon size={16} className="step-icon" aria-hidden="true" /><span className="step-label">{item.label}</span>{i < 3 && <ChevronRight size={13} className="step-chevron" aria-hidden="true" />}</button> })}</nav>
      <div className="mode-switch" role="group" aria-label="資料模式"><button className={isDemo ? 'selected' : ''} aria-pressed={isDemo} onClick={() => chooseMode('demo')}>示範模式</button><button className={!isDemo ? 'selected' : ''} aria-pressed={!isDemo} onClick={() => chooseMode('survey')}>已查核路線</button></div>
    </div>}
    <div className={`mode-strip ${isDemo && step >= 0 ? 'demo' : 'survey'}`} role="status">{state.screen === 'editor' ? <><ClipboardCheck size={16} aria-hidden="true" /><strong>本機實勘草稿</strong><span>填寫後匯出，交由團隊審核</span></> : step < 0 ? <><Info size={16} aria-hidden="true" /><strong>校園試用版</strong><span>總圖書館與博雅教學館周邊</span></> : isDemo ? <><TriangleAlert size={16} aria-hidden="true" /><strong>示範模式</strong><span>坡度、路寬與入口尚未實勘</span><span className="strip-extra">供選路流程測試</span></> : <><ShieldCheck size={16} aria-hidden="true" /><strong>查核模式</strong><span>全程及兩端入口均需有實勘證據</span></>}</div>

    {state.screen === 'help' ? <HelpPage onDemo={() => navigate({ screen: 'setup', mode: 'demo', routeId: '', segmentId: '' })} onEditor={() => navigate({ screen: 'editor' })} onSources={() => setShowSources(true)} /> : state.screen === 'saved' ? <SavedRoutes favorites={favorites} allRoutes={allRoutes} onOpen={favorite => navigate(fromHash(favorite.hash))} onRemove={key => { const previous = favorites; if (persistFavorites(favorites.filter(f => f.key !== key))) { setUndoFavorites(previous); setFavoriteMessage('已移除收藏，可立即復原。') } }} onUndo={() => { if (undoFavorites && persistFavorites(undoFavorites)) { setUndoFavorites(null); setFavoriteMessage('已復原收藏。') } }} canUndo={!!undoFavorites} onPlan={() => navigate({ screen: 'setup' })} feedback={favoriteMessage} /> : loading && !campus ? <main className="app-loading"><LoaderCircle className="spinner" size={28} /><h1>正在展開校園地圖</h1><p>載入公開圖資與路段資料快照</p></main> : loadError && !campus || !campus ? <main className="app-loading error-state"><TriangleAlert size={32} /><h1>圖資暫時無法載入</h1><p>請確認網路連線，再試一次。你也可以先閱讀使用說明。</p><button className="button primary" onClick={retryCampus}>重新載入圖資</button><button className="button secondary" onClick={() => navigate({ screen: 'help' })}>使用說明</button></main> : state.screen === 'editor' ? <Suspense fallback={<main className="app-loading"><LoaderCircle className="spinner" size={28} /><h1>載入實勘編輯器</h1></main>}><SurveyEditor campus={campus} onClose={() => navigate({ screen: 'setup' })} /></Suspense> : <main className="workspace route-workspace" data-sheet={sheetSize} data-screen={state.screen}>
      <MapSheet size={sheetSize} onSize={setSheetSize} mobile={mobile} panelRef={panelRef} collapsed={tourRoute ? <RouteExplorer route={tourRoute} tour={tour} compact onInspect={inspectTourSegment} /> : <div className="sheet-route-summary"><div><strong>{state.screen === 'setup' ? '規劃校園路線' : routes.length ? `${routes.length} 條${isDemo ? '示範' : '查核'}路線` : '目前無可用路線'}</strong><span>{placeNames[state.origin]} → {placeNames[destination]}</span></div><button onClick={() => setSheetSize('half')}>{state.screen === 'setup' ? '設定條件' : '查看資訊'}</button></div>}>
        <div className="panel-main" key={state.screen}>
          {mobile && explorer}
          {state.screen === 'setup' && <>
            <h1 id="panel-heading" tabIndex={-1}>規劃校園路線</h1><p className="panel-intro">選擇起終點，再比較沿途的通行條件。</p>
            <form id="route-planner" onSubmit={e => { e.preventDefault(); query() }} className="route-form">
              <div className="location-fields"><label className="location-field"><span className="location-letter">A</span><span className="field-content"><span>起點</span><select aria-label="起點" value={state.origin} onChange={e => navigate({ origin: e.target.value === 'boya' ? 'boya' : 'library' })}><option value="library">總圖書館{isDemo ? '示範入口' : ''}</option><option value="boya">博雅教學館{isDemo ? '示範入口' : ''}</option></select></span></label><div className="location-connector" aria-hidden="true" /><label className="location-field"><span className="location-letter end">B</span><span className="field-content"><span>終點</span><select aria-label="終點" value={destination} onChange={e => navigate({ origin: e.target.value === 'library' ? 'boya' : 'library' })}><option value="library">總圖書館{isDemo ? '示範入口' : ''}</option><option value="boya">博雅教學館{isDemo ? '示範入口' : ''}</option></select></span></label><button type="button" className="swap-button" aria-label="交換起點與終點" onClick={() => navigate({ origin: destination })}><ArrowDownUp size={18} /></button></div>
              <fieldset className="form-section"><legend>移動需求<span>僅註記需求</span></legend><div className="chair-options">{[{ value: 'manual' as const, label: '手動輪椅', icon: Accessibility }, { value: 'electric' as const, label: '電動輪椅', icon: Zap }].map(item => <label key={item.value} className={state.wheelchair === item.value ? 'checked' : ''}><input type="radio" name="wheelchair" value={item.value} checked={state.wheelchair === item.value} onChange={() => navigate({ wheelchair: item.value })} /><item.icon size={19} /><span>{item.label}</span><i className="radio-dot" /></label>)}</div></fieldset>
              <fieldset className="form-section preference-section"><legend>路線偏好</legend><div className="preference-options">{[{ value: 'short' as const, label: '距離較短', description: '依路程排序', icon: RouteIcon }, { value: 'gentle' as const, label: '較平緩', description: '依最大坡度排序', icon: Mountain }].map(item => <label key={item.value} className={state.preference === item.value ? 'checked' : ''}><input type="radio" name="preference" value={item.value} checked={state.preference === item.value} onChange={() => navigate({ preference: item.value })} /><span className="preference-top"><item.icon size={21} strokeWidth={1.8} aria-hidden="true" /><i className="radio-dot" /></span><strong>{item.label}</strong><span className="preference-description">{item.description}</span></label>)}</div></fieldset>
              <LimitControls limits={state.limits ?? emptyLimits} onChange={limits => navigate({ limits })} onSave={remember} feedback={profileFeedback} />
            </form>
          </>}

          {state.screen !== 'setup' && !isDemo && surveyLoading ? <div className="empty-state" role="status"><LoaderCircle className="spinner" size={27} /><h1 id="panel-heading" tabIndex={-1}>正在載入查核資料</h1><p>公開地圖已可使用，查核資料載入後會再檢查路線資格。</p></div> : state.screen !== 'setup' && resolved.problem ? <UnavailableRoute problem={resolved.problem} onCompare={() => navigate({ screen: 'compare', routeId: '', segmentId: '' })} onRoute={() => navigate({ screen: 'detail', segmentId: selected?.segments[0]?.id ?? '' })} /> : state.screen !== 'setup' && routes.length === 0 && <EmptyRoutes onDemo={() => navigate({ mode: 'demo', screen: 'compare', routeId: '', segmentId: '', limits: undefined })} onSetup={() => navigate({ screen: 'setup' })} onRetry={retrySurvey} failed={surveyError && !isDemo} filtered={candidates.excluded.length > 0} />}

          {state.screen === 'compare' && routes.length > 0 && (isDemo || !surveyLoading) && <>
            <div className="panel-title-row"><h1 id="panel-heading" tabIndex={-1}>比較路線</h1><button className="back-link" onClick={() => navigate({ screen: 'setup' })}><SlidersHorizontal size={16} aria-hidden="true" />修改條件</button></div><p className="route-pair"><span>{placeNames[state.origin]}</span><ArrowRight size={16} aria-hidden="true" /><span>{placeNames[destination]}</span></p>
            <div className="compare-preference"><span>{routes.length} 條{isDemo ? '示範' : ''}路線</span><span>{state.wheelchair === 'manual' ? '手動輪椅' : '電動輪椅'}</span><span>{state.preference === 'gentle' ? '依坡度排序' : '依距離排序'}</span></div>
            <div className="route-cards">{routes.map((route, i) => <button key={route.id} className={`route-card ${route.id === 'direct' ? 'direct' : 'gentle'} ${selected?.id === route.id ? 'selected' : ''}`} onClick={() => openRoute(route)} aria-label={`查看${route.name}`}><div className="route-card-top"><span className="route-card-icon">{route.id === 'gentle' ? <Mountain size={20} aria-hidden="true" /> : <RouteIcon size={20} aria-hidden="true" />}</span><div><strong>{route.name}</strong>{route.kind === 'survey' && <span>{route.description}</span>}</div>{i === 0 && <span className="preference-tag">符合偏好</span>}</div><RouteStats route={route} /><div className="route-card-surface"><span>無階梯{isDemo ? '（示範）' : ''}</span><span>{metrics(route).surfaces.join('、')}</span></div>{route.kind === 'survey' && <p className="verification-age">最舊查核 {formatDate(oldestVerification(route))}，{daysSince(oldestVerification(route)!)} 天前</p>}<div className="route-card-footer"><span>{isDemo ? '示範路況，尚未實勘' : '全程及入口已查核'}</span><strong>檢視路段<ChevronRight size={18} aria-hidden="true" /></strong></div></button>)}</div>
            <ComparisonSummary routes={routes} />
          </>}

          {state.screen === 'compare' && candidates.excluded.length > 0 && <section className="excluded-routes"><h2>未符合目前條件的動線</h2><p>以下動線已依你設定的條件排除。</p>{candidates.excluded.map(({ route, reasons }) => <article key={route.id}><h3>{route.name}</h3><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></article>)}<button className="button secondary wide" onClick={() => navigate({ screen: 'setup' })}>調整通行條件</button></section>}

          {state.screen === 'detail' && !resolved.problem && selected && activeSegment && (isDemo || !surveyLoading) && <>
            <button className="back-link" onClick={() => navigate({ screen: 'compare' })}><ArrowLeft size={17} aria-hidden="true" />返回比較</button><h1 id="panel-heading" tabIndex={-1}>路段資訊</h1><div className="detail-route-title"><span className={`route-color-dot ${selected.id}`} />{selected.name}<span>{formatDistance(metrics(selected).distanceM)}</span></div><p className="detail-route-description">{selected.description}</p>
            <BottleneckList route={selected} onSelect={id => navigate({ segmentId: id })} />
            <div className="segment-tabs" role="group" aria-label="選擇路段">{selected.segments.map((segment, i) => <button key={segment.id} aria-label={`路段 ${i + 1}：${segment.name}`} aria-pressed={activeSegment.id === segment.id} className={activeSegment.id === segment.id ? 'active' : ''} onClick={() => navigate({ segmentId: segment.id })}><span>{i + 1}</span><div><strong>{segment.name}</strong><small>{formatDistance(lineDistance(segment.coordinates))}</small></div><ChevronRight size={15} /></button>)}</div>
            <SegmentInfo segment={activeSegment} onOpenPhoto={tour.pause} />
            <div className="sticky-panel-actions"><button className="button primary wide" onClick={() => navigate({ screen: 'confirm', routeId: selected.id })}>選擇這條路線<Check size={18} /></button></div>
          </>}

          {state.screen === 'confirm' && !resolved.problem && selected && (isDemo || !surveyLoading) && <>
            <button className="back-link" onClick={() => navigate({ screen: 'compare' })}><ArrowLeft size={17} aria-hidden="true" />返回比較</button><h1 id="panel-heading" tabIndex={-1}>確認路線</h1><p className="panel-intro confirm-intro">核對兩端入口與沿途條件，再保存這條路線。</p>
            <div className="confirmed-route"><div className="section-heading"><strong>{selected.name}</strong><span className={`tiny-badge ${isDemo ? 'amber' : ''}`}>{isDemo ? '示範路線' : '已查核'}</span></div><RouteStats route={selected} compact /></div>
            <div className="entry-cards"><EntranceCard entrance={selected.originEntrance} letter="A" /><div className="entry-connector" /><EntranceCard entrance={selected.destinationEntrance} letter="B" /></div>
            <div className="section-heading confirm-segments-title"><h3>沿途路段</h3><span>{selected.segments.length} 段</span></div><div className="confirm-segments">{selected.segments.map((segment, i) => <button key={segment.id} onClick={() => navigate({ screen: 'detail', segmentId: segment.id })}><span>{i + 1}</span><strong>{segment.name}</strong><span>{formatDistance(lineDistance(segment.coordinates))}</span><ChevronRight size={16} /></button>)}</div>
            {selected.kind === 'survey' && <p className="verification-age">全程最舊查核日期 {formatDate(oldestVerification(selected))}，距今 {daysSince(oldestVerification(selected)!)} 天。</p>}
            <div className="sticky-panel-actions"><button className="button primary wide" onClick={copyLink}><Copy size={18} />複製路線連結</button><div className="confirm-extra-actions"><button className="button secondary" onClick={saveFavorite}><Bookmark size={17} />收藏這條路線</button><button className="button secondary" onClick={() => window.print()}><Printer size={17} />列印路線</button></div>{favoriteMessage && <p className="copy-feedback" role="status">{favoriteMessage}</p>}{copyMessage && <p className="copy-feedback" role="status"><CheckCircle2 size={15} />{copyMessage}</p>}{copyFallback && <input className="copy-fallback" aria-label="路線連結" readOnly value={`${window.location.origin}${window.location.pathname}${toHash({ ...state, routeId: selected.id })}`} onFocus={e => e.target.select()} />}<p className="form-footnote">出發前請確認入口與現場路況。</p></div>
          </>}
        </div>
        {state.screen === 'setup' && <div className="setup-actions"><button type="submit" form="route-planner" className="button primary wide search-button">比較路線<ArrowRight size={19} aria-hidden="true" /></button><p className="form-footnote">{isDemo ? '示範動線的路況數值皆為模擬。' : '未查核路段不列入候選路線。'}</p></div>}
      </MapSheet>
      <CampusMap campus={campus} routes={routes} selectedId={selected?.id ?? ''} segmentId={activeSegment?.id ?? ''} mode={state.mode} screen={state.screen} layoutKey={mobile ? sheetSize : 'desktop'} preview={tour.engaged && tour.position ? { coordinate: tour.position.coordinate, following: tour.following, reducedMotion: tour.reducedMotion } : undefined} onMapDrag={() => { if (tour.engaged && tour.following) tour.setFollowing(false) }} onSelectRoute={id => navigate({ routeId: id, segmentId: '' })} onSelectSegment={id => { void navigate({ screen: state.screen === 'setup' ? 'setup' : 'detail', routeId: selected?.id ?? '', segmentId: id }); setSheetSize('half') }} />
      {!mobile && explorer && <div className="experience-dock">{explorer}</div>}
    </main>}
    <OfflineStatus snapshotDate={campus?.retrievedAt} beforeUpdate={async () => { try { await flushSurveyDraft(); return document.documentElement.dataset.surveyUnsaved !== 'true' } catch { return false } }} />
    {showSources && campus && <SourceDialog campus={campus} onClose={() => setShowSources(false)} />}
    {state.screen === 'confirm' && !resolved.problem && selected && campus && <PrintableRoute route={selected} state={state} snapshotDate={campus.retrievedAt} />}
    <div className="sr-only" aria-live="polite">{state.screen === 'detail' && activeSegment ? `目前路段：${activeSegment.name}` : ''}</div>
  </div>
}
