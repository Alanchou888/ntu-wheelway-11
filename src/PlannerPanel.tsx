import { useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDownUp, ArrowLeft, Bookmark, ChevronDown, Copy, MapPin, X } from 'lucide-react'
import { fieldObservation } from './field-observations'
import { findPlaces } from './places'
import { canPlanToPlace, planningPreferences } from './planning-params'
import type { EndpointSlot, PlanEndpoint, PlanRequest, PlanningPreference } from './planning-params'
import { FieldSummary, FieldSymbol } from './PlaceDiscovery'
import { formatDate, formatDistance } from './routes'
import { estimateSpeedKmh, maxSnapM, reportSummary, smoothnessLabel, surfaceLabel } from './routing-plan'
import type { PlannedLeg, PlannedRoute, PlanningResult } from './routing-plan'
import { networkUrl } from './routing-network'
import type { RoutingNetwork } from './routing-network'
import type { CatalogPlace } from './types'
import './planner.css'

function EndpointField({ slot, value, places, onPlace, onMap, onClear }: {
  slot: EndpointSlot; value?: PlanEndpoint; places: CatalogPlace[]
  onPlace: (place: CatalogPlace) => void; onMap: () => void; onClear: () => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const from = slot === 'start'
  const label = from ? '起點 A' : '終點 B'
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const query = open ? typed : value?.name ?? ''
  const matches = open ? findPlaces(places, query).slice(0, 6) : []
  const choose = (place: CatalogPlace) => { inputRef.current?.focus(); setOpen(false); onPlace(place) }
  return <div className="planner-endpoint" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <div className="planner-input-row">
      <span className={from ? 'planner-pin-a' : 'planner-pin-b'} aria-hidden="true">{from ? 'A' : 'B'}</span>
      <input id={id} ref={inputRef} role="combobox" aria-label={`搜尋${label}`} aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? `${id}-places` : undefined}
        aria-activedescendant={active >= 0 && matches[active] ? `${id}-place-${active}` : undefined}
        placeholder={`搜尋${label}`} autoComplete="off" value={query}
        onFocus={event => { event.currentTarget.select(); setTyped(value?.name ?? ''); setActive(-1); setOpen(true) }}
        onChange={event => { setTyped(event.target.value); setActive(-1); setOpen(true) }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false) }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) { setTyped(value?.name ?? ''); setActive(0); setOpen(true); return }
            const direction = event.key === 'ArrowDown' ? 1 : -1
            setActive(n => matches.length ? Math.max(0, Math.min(n + direction, matches.length - 1)) : -1)
          }
          if (event.key === 'Enter' && open && matches.length) {
            event.preventDefault()
            choose(matches[Math.max(0, active)])
          }
        }} />
      {value && <button type="button" className="planner-icon" aria-label={`清除${label}`} title={`清除${label}`} onClick={() => { inputRef.current?.focus(); setTyped(''); setActive(-1); setOpen(true); onClear() }}><X size={17} aria-hidden="true" /></button>}
      <button type="button" className="planner-icon planner-map-pick" aria-label={`用地圖選擇${label}`} title={`用地圖選擇${label}`} onClick={() => { setOpen(false); onMap() }}><MapPin size={18} aria-hidden="true" /></button>
    </div>
    {open && <div className="planner-suggestions">
      <ul id={`${id}-places`} role="listbox" aria-label={`${label}搜尋結果`}>
        {matches.map((place, index) => <li key={place.id} role="presentation">
          <button type="button" role="option" tabIndex={-1} id={`${id}-place-${index}`} aria-selected={active === index}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
            <span>{place.name}</span>{place.level && <small>樓層標記 {place.level}</small>}
          </button>
        </li>)}
      </ul>
      {!matches.length && <p role="status">找不到符合的地點。也可以直接在地圖選點。</p>}
    </div>}
  </div>
}

const failures: Record<Exclude<PlanningResult['status'], 'ok'>, string> = {
  'outside-a': '起點 A 在臺大及周邊的路網範圍外，請在校園附近選點。',
  'outside-b': '終點 B 在臺大及周邊的路網範圍外，請在校園附近選點。',
  'unsnapped-a': `起點 A 的 ${maxSnapM} 公尺內找不到可接入的路網，請改選鄰近的步道或入口。`,
  'unsnapped-b': `終點 B 的 ${maxSnapM} 公尺內找不到可接入的路網，請改選鄰近的步道或入口。`,
  'same-access': '起點和終點接到同一個位置，請選擇不同的起終點。',
  disconnected: '兩點之間沒有可用的連線。路網可能不相通，或受方向、階梯及封閉影響。請試試鄰近的步道或入口。',
}

function RouteCards({ routes, selected, onChoose }: {
  routes: PlannedRoute[]; selected: PlannedRoute; onChoose: (id: string) => void
}) {
  return <ul className="planner-candidates" aria-label="候選路線">
    {routes.map((route, index) => <li key={route.id}>
      <button type="button" aria-pressed={route.id === selected.id} onClick={() => onChoose(route.id)}>
        <span className="planner-candidate-title"><strong>路線 {index + 1}</strong>
          <span>{formatDistance(route.distanceM)} · 約 {route.estimateMinutes} 分鐘</span></span>
        <small>{route.missingM > 0 ? `約 ${formatDistance(route.missingM)} 缺部分通行資料` : '有路面、坡度和路寬標記'}
          {route.roughM >= 1 && ` · 約 ${formatDistance(route.roughM)} 有粗糙鋪面或不平標記`}
          {route.reports.length > 0 && ` · ${route.reports.length} 則近期回報`}</small>
      </button>
    </li>)}
  </ul>
}

function EvidenceLinks({ ids, onField }: { ids: string[]; onField: (id: string) => void }) {
  const points = ids.flatMap(id => fieldObservation(id) ?? [])
  return points.length ? <ul className="segment-field-links">{points.map(point => <li key={point.id}>
    <button type="button" id={`plan-field-${point.id}`} onClick={() => onField(point.id)}>
      <FieldSymbol kind={point.kind} /><span className="field-link-text"><strong>{point.name}</strong><FieldSummary point={point} /></span>
    </button>
  </li>)}</ul> : null
}

function LegDetails({ leg, onReport, onReportLeg }: { leg: PlannedLeg; onReport: (segmentId: string) => void; onReportLeg: (leg: PlannedLeg) => void }) {
  const { way } = leg
  return <div className="planner-leg" id="planner-leg-details">
    <div className="planner-leg-title"><strong>{leg.name}</strong><span>{formatDistance(leg.distanceM)}</span></div>
    {leg.teamSegmentNames.length > 0 && <p className="planner-team-note">此段在圖上與團隊試走線重疊，可對照試走紀錄。</p>}
    <dl>
      <div><dt>坡度幅度</dt><dd>{way.inclinePercent === null ? '未知' : `${Math.abs(way.inclinePercent)}%`}</dd></div>
      <div><dt>路寬標記</dt><dd>{way.widthM === null ? '未知' : `${way.widthM} m`}</dd></div>
      <div><dt>路面</dt><dd>{surfaceLabel(way.surface)}</dd></div>
      <div><dt>平整度</dt><dd>{smoothnessLabel(way.smoothness)}</dd></div>
    </dl>
    {(way.ramp || way.crossing) && <p>公開圖資標記為{way.ramp ? '坡道' : '行穿線'}。</p>}
    {way.wheelchair === 'limited' && <p>公開圖資標記為輪椅通行受限。</p>}
    {leg.reports.length > 0 && <ul className="planner-reports">{leg.reports.map(report =>
      <li key={report.id}><button type="button" onClick={() => onReport(report.segmentId)}>
        <strong>{reportSummary(report)}</strong><span>{report.message}</span>
        <small>{report.counts.exists ? '有人確認仍存在' : '待他人確認'}</small>
      </button></li>)}</ul>}
    {!way.separateLevel && <button type="button" className="community-link planner-leg-report" onClick={() => onReportLeg(leg)}>回報這一段</button>}
    <a href={`https://www.openstreetmap.org/way/${way.osmId}`} target="_blank" rel="noreferrer">查看這段的 OpenStreetMap 資料</a>
  </div>
}

interface Props {
  plan: PlanRequest; result?: PlanningResult; selected?: PlannedRoute; activeLeg?: PlannedLeg
  network?: RoutingNetwork; networkError: boolean; places: CatalogPlace[]
  reportsNote: string; shareMessage: string; manualLink?: string
  onPlace: (slot: EndpointSlot, place: CatalogPlace) => void
  onMap: (slot: EndpointSlot) => void; onClear: (slot: EndpointSlot) => void
  onSwap: () => void; onPreference: (value: PlanningPreference) => void
  onCandidate: (id: string) => void; onLeg: (id: string) => void; onField: (id: string) => void
  onBack: () => void; onCopy: () => void; onSave: () => void; onReport: (segmentId: string) => void
  onReportLeg: (leg: PlannedLeg) => void
  onRetry: () => void; onDraft: () => void; preview?: ReactNode
}

export default function PlannerPanel(props: Props) {
  const { plan, network, result, selected, activeLeg } = props
  const legIndex = activeLeg && selected ? selected.legs.indexOf(activeLeg) : -1
  const places = useMemo(() => props.places.filter(canPlanToPlace), [props.places])
  return <section className="planner-panel" aria-labelledby="panel-heading">
    <button className="back-link" type="button" onClick={props.onBack}><ArrowLeft size={16} aria-hidden="true" />返回地圖</button>
    <h1 id="panel-heading" tabIndex={-1}>路線規劃</h1>
    <div className="planner-endpoints">
      {(['start', 'end'] as const).map(slot => <EndpointField key={slot}
        slot={slot} value={plan[slot]} places={places} onPlace={place => props.onPlace(slot, place)}
        onMap={() => props.onMap(slot)} onClear={() => props.onClear(slot)} />)}
      <button type="button" className="planner-icon planner-swap" aria-label="交換起點與終點" title="交換起點與終點"
        disabled={!plan.start && !plan.end} onClick={props.onSwap}><ArrowDownUp size={19} aria-hidden="true" /></button>
    </div>
    <label className="planner-preference">選路偏好
      <select value={plan.preference} onChange={event => props.onPreference(event.target.value as PlanningPreference)}>
        {Object.entries(planningPreferences).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {props.networkError ? <div className="planner-message" role="alert">
      <p>路網資料暫時無法載入。地圖與原有試走路線仍可查看。</p>
      <button type="button" className="button secondary" onClick={props.onRetry}>重新載入路網</button>
    </div> : !network ? <p className="planner-message" role="status">載入校園路網中…</p> : !result
      ? <p className="planner-message">選好起終點後，地圖會自動算出路線。</p>
      : result.status !== 'ok' ? <p className="planner-message" role="alert">{failures[result.status]}</p> : selected && <>
        <h2>規劃結果</h2>
        <p className="planner-source-note">公開路網 · 團隊尚未查核全程</p>
        <RouteCards routes={result.routes} selected={selected} onChoose={props.onCandidate} />
        <div className="planner-route-notes">
          {result.access.some(access => access.offsetM >= 2) && <p>
            {result.access.map((access, i) => access.offsetM >= 2 ? `${i ? 'B' : 'A'} 接入點距選點 ${formatDistance(access.offsetM)}` : null).filter(Boolean).join('，')}。距離從圖上的路網接入點起算。
          </p>}
          <p>按 {estimateSpeedKmh} km/h 估算時間。路線排除圖資已標示的階梯與封閉。</p>
          {props.reportsNote && <p>{props.reportsNote}</p>}
          <p>已標坡度最大 {selected.markedSlopeMax === null ? '未知' : `${selected.markedSlopeMax}%`} · 已標最窄路寬 {selected.markedWidthMin === null ? '未知' : `${selected.markedWidthMin} m`}</p>
          {plan.preference === 'gentle' && result.routes.every(route => route.markedSlopeMax === null) && <p>這些路線都缺坡度資料，無法判斷哪條較平緩。</p>}
          {selected.teamM > 0 && <p>約 {formatDistance(selected.teamM)} 與團隊試走線重疊。</p>}
        </div>
        <details className="planner-details" id="planner-leg-details-panel">
          <summary>逐段查看<ChevronDown size={15} aria-hidden="true" /></summary>
          <label className="planner-leg-select">路段
            <select value={activeLeg?.id ?? ''} onChange={event => props.onLeg(event.target.value)}>
              {selected.legs.map((leg, index) => <option key={leg.id} value={leg.id}>第 {index + 1} 段 · {leg.name} · {formatDistance(leg.distanceM)}</option>)}
            </select>
          </label>
          {activeLeg && legIndex >= 0 && <LegDetails leg={activeLeg} onReport={props.onReport} onReportLeg={props.onReportLeg} />}
        </details>
        {selected.fieldPointIds.length > 0 && <details className="planner-details">
          <summary>沿途實勘點與照片（{selected.fieldPointIds.length}）<ChevronDown size={15} aria-hidden="true" /></summary>
          <p className="planner-source-note">這些實勘點在路線附近，點開可看原始量測和照片。</p>
          <EvidenceLinks ids={selected.fieldPointIds} onField={props.onField} />
        </details>}
        {props.preview}
        <div className="planner-actions">
          <button type="button" className="button secondary" onClick={props.onCopy}><Copy size={16} aria-hidden="true" />分享</button>
          <button type="button" className="button secondary" onClick={props.onSave}><Bookmark size={16} aria-hidden="true" />收藏</button>
        </div>
        {props.shareMessage && <p className="planner-message" role="status">{props.shareMessage}</p>}
        {props.manualLink && <input className="copy-fallback" aria-label="路線分享連結" readOnly value={props.manualLink} onFocus={event => event.target.select()} />}
        <button type="button" className="button plain planner-draft-link" onClick={props.onDraft}>記錄沿途實勘</button>
      </>}
    {network && <p className="planner-copyright"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap 貢獻者</a>
      {' · '}<a href={networkUrl} download>路網快照</a> · {formatDate(network.dataAsOf ?? network.retrievedAt)}</p>}
  </section>
}
