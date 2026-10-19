import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, ImagePlus, MapPin, Save, TriangleAlert, Upload, X } from 'lucide-react'
import CampusMap from './CampusMap'
import type { Campus, Coordinate, Entrance, Photo, Route, Segment, SurveyData } from './types'
import { formatDate, isEligible, segmentLabel } from './routes'
import { createSurveyDrafts, downloadFile, isSegment, MAX_IMPORT_BYTES, parseSurveyData, photoFromFile, readLocalSurvey, routeGeometryIssues, surveyCsv, surveyProgress, today, verificationIssues, writeLocalSurvey } from './survey'
import type { SurveyItem } from './survey'
import './survey-editor.css'

type Target = 'origin' | 'destination' | string
type Patch = Partial<Entrance & Segment>
type SaveState = 'loading' | 'pending' | 'saved' | 'failed'

function NumberField({ label, value, onChange, positive = false }: { label: string; value: number | null; onChange: (n: number | null) => void; positive?: boolean }) {
  return <label className="survey-field"><span>{label}</span><input type="number" min={positive ? '0.01' : '0'} max="100000" step="any" inputMode="decimal" placeholder="未量測" value={value ?? ''} onChange={e => onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null)} /></label>
}
function BooleanField({ label, value, onChange, yes, no }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; yes: string; no: string }) {
  return <label className="survey-field"><span>{label}</span><select value={value === null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'true')}><option value="">尚未確認</option><option value="false">{no}</option><option value="true">{yes}</option></select></label>
}

function CoordinateFields({ coordinate, onChange, onError }: { coordinate: Coordinate; onChange: (c: Coordinate) => void; onError: (s: string) => void }) {
  const [longitude, setLongitude] = useState(String(coordinate[0]))
  const [latitude, setLatitude] = useState(String(coordinate[1]))
  useEffect(() => { setLongitude(String(coordinate[0])); setLatitude(String(coordinate[1])) }, [coordinate[0], coordinate[1]])
  const commit = () => {
    const next: Coordinate = [Number(longitude), Number(latitude)]
    if (!longitude.trim() || !latitude.trim() || !next.every(Number.isFinite) || Math.abs(next[0]) > 180 || Math.abs(next[1]) > 90) {
      onError('入口座標超出範圍，已保留原有位置。經度須介於 -180 與 180，緯度須介於 -90 與 90。')
      setLongitude(String(coordinate[0])); setLatitude(String(coordinate[1])); return
    }
    if (next[0] !== coordinate[0] || next[1] !== coordinate[1]) onChange(next)
  }
  return <div className="survey-grid"><label className="survey-field"><span>入口經度</span><input type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} onBlur={commit} /></label><label className="survey-field"><span>入口緯度</span><input type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} onBlur={commit} /></label></div>
}

function EvidencePhotos({ item, onChange, onError }: { item: SurveyItem; onChange: (photos: Photo[]) => void; onError: (s: string) => void }) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const add = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try { onChange([...item.photos, await photoFromFile(file)]) }
    catch (e) { onError(e instanceof Error ? e.message : '照片讀取失敗') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  return <fieldset className="survey-photos"><legend>現場照片 <span>{item.photos.length} / 4</span></legend>
    <p className="survey-help">每張上限 2 MB。照片與說明會包含在匯出的 JSON，請避開可辨識的人臉及車牌。</p>
    {item.photos.map((photo, i) => <div className="survey-photo" key={`${i}-${photo.src.slice(0, 40)}`}>
      <img src={photo.src} alt={photo.alt || '新加入的實勘照片，請填寫說明'} onError={e => { e.currentTarget.style.display = 'none'; onError('一張照片無法載入，請重新上傳或移除後重試') }} />
      <label className="survey-field"><span>照片 {i + 1} 說明與替代文字</span><input maxLength={500} value={photo.caption} placeholder="例如：從步道面向入口，左側有坡道" onChange={e => onChange(item.photos.map((p, j) => j === i ? { ...p, caption: e.target.value, alt: e.target.value } : p))} /></label>
      <button className="survey-remove" onClick={() => onChange(item.photos.filter((_, j) => j !== i))} aria-label={`移除照片 ${i + 1}`}><X size={15} />移除</button>
    </div>)}
    <input type="file" accept="image/jpeg,image/png,image/webp" ref={inputRef} hidden onChange={e => void add(e.target.files?.[0])} />
    <button className="button secondary wide" disabled={busy || item.photos.length >= 4} onClick={() => inputRef.current?.click()}><ImagePlus size={17} />{busy ? '讀取照片中' : '加入現場照片'}</button>
  </fieldset>
}

function ItemForm({ item, onPatch, onError, onPick, picking, onSync, geometryProblem }: { item: SurveyItem; onPatch: (patch: Patch) => void; onError: (s: string) => void; onPick: () => void; picking: boolean; onSync: () => void; geometryProblem: boolean }) {
  const [confirmed, setConfirmed] = useState(false)
  const issues = verificationIssues(item)
  // Any evidence edit revokes the previous confirmation until the field record
  // is explicitly reviewed again. Eligibility remains a separate route check.
  const patch = (p: Patch) => { setConfirmed(false); onPatch({ ...p, status: 'unverified' }) }
  return <section className="survey-item-form" aria-label="實勘項目表單">
    <div className="section-heading"><h2>{isSegment(item) ? '路段量測' : '入口查核'}</h2><span className="tiny-badge">{segmentLabel(item as Segment)}</span></div>
    <label className="survey-field"><span>項目名稱</span><input maxLength={200} value={item.name} onChange={e => patch({ name: e.target.value })} /></label>
    {isSegment(item) ? <>
      <div className="survey-grid"><NumberField label="最大坡度（%）" value={item.maxSlopePercent} onChange={v => patch({ maxSlopePercent: v })} /><NumberField label="有效路寬（m）" value={item.minWidthM} positive onChange={v => patch({ minWidthM: v })} /><NumberField label="最大階差（cm）" value={item.stepHeightCm} onChange={v => patch({ stepHeightCm: v })} /><NumberField label="坡道長度（m）" value={item.rampLengthM} onChange={v => patch({ rampLengthM: v })} /><BooleanField label="階梯狀況" value={item.hasStairs} yes="有階梯" no="已確認無階梯" onChange={v => patch({ hasStairs: v })} /><BooleanField label="封閉狀況" value={item.closed} yes="已封閉" no="已確認未封閉" onChange={v => patch({ closed: v })} /></div>
      <label className="survey-field"><span>路面條件</span><input maxLength={500} placeholder="例如：瀝青，局部破損" value={item.surface ?? ''} onChange={e => patch({ surface: e.target.value || null })} /></label>
      <label className="survey-field"><span>已知障礙，一行一項</span><textarea maxLength={5000} rows={3} value={item.obstacles.join('\n')} placeholder="查核後未發現固定障礙可留白" onChange={e => patch({ obstacles: e.target.value ? e.target.value.split('\n').slice(0, 30) : [] })} /></label>
      <p className="survey-help">幾何參考公開道路。請現場確認路段銜接，取得日期 {formatDate(item.retrievedAt)}。</p>
    </> : <div className="entrance-location-editor"><p>入口座標：{item.coordinate[0].toFixed(7)}, {item.coordinate[1].toFixed(7)}</p><CoordinateFields coordinate={item.coordinate} onChange={coordinate => patch({ coordinate })} onError={onError} /><button className={`button secondary wide ${picking ? 'picking' : ''}`} aria-pressed={picking} onClick={onPick}><MapPin size={17} />{picking ? '點選地圖設定入口，或按此取消' : '在地圖上設定入口位置'}</button>{geometryProblem && <button className="button secondary wide" onClick={onSync}>將相鄰路段端點移至此入口</button>}<p className="survey-help">可輸入座標或點選地圖記錄入口，請依現場照片核對。變更入口不會自動移動路段端點。</p></div>}
    <div className="survey-grid"><label className="survey-field"><span>實勘日期</span><input type="date" max={today()} value={item.verifiedAt?.slice(0, 10) ?? ''} onChange={e => patch({ verifiedAt: e.target.value || null })} /></label></div>
    <label className="survey-field"><span>實勘者與量測方式</span><textarea maxLength={1000} rows={2} placeholder="填寫團隊代號、使用工具及量測方法" value={item.source} onChange={e => patch({ source: e.target.value })} /></label>
    <EvidencePhotos item={item} onChange={photos => patch({ photos })} onError={onError} />
    <div className="verification-box"><h3>檢查本項紀錄</h3>{issues.length ? <p>待補：{issues.join('、')}。</p> : <p>必要欄位已填齊，請核對是否符合現場。</p>}
      <label className="survey-check"><input type="checkbox" checked={confirmed || item.status === 'verified'} onChange={e => { setConfirmed(e.target.checked); if (!e.target.checked) onPatch({ status: 'unverified' }) }} disabled={issues.length > 0} /><span>我已於上述日期在現場查核，本項照片與量測為實際紀錄。</span></label>
      <button className="button primary wide" disabled={issues.length > 0 || !confirmed || item.status === 'verified'} onClick={() => { onPatch({ status: 'verified' }); setConfirmed(false) }}><ClipboardCheck size={17} />{item.status === 'verified' ? '本項已標記查核' : '標記本項已查核'}</button>
      <p className="survey-help">階梯、封閉或未銜接的路線仍會排除。修改紀錄後需重新確認。</p>
    </div>
  </section>
}

export default function SurveyEditor({ campus, onClose }: { campus: Campus; onClose: () => void }) {
  const [data, setData] = useState<SurveyData>(() => createSurveyDrafts(campus))
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [routeId, setRouteId] = useState('')
  const [target, setTarget] = useState<Target>('origin')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [revision, setRevision] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const latest = useRef(data)
  const readyRef = useRef(false)
  const autoSaveEnabled = useRef(true)
  const saveSequence = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const route = data.routes.find(r => r.id === routeId) ?? data.routes[0]
  const item = route ? target === 'origin' ? route.originEntrance : target === 'destination' ? route.destinationEntrance : route.segments.find(s => s.id === target) ?? route.segments[0] : null
  const geometryIssues = route ? routeGeometryIssues(route) : []
  const progress = route ? surveyProgress(route) : null
  latest.current = data
  readyRef.current = ready

  useEffect(() => {
    let cancelled = false
    readLocalSurvey().then(stored => { if (!cancelled && stored) setData(stored) }).catch(e => { if (!cancelled) { autoSaveEnabled.current = false; setSaveState('failed'); setError(`${e.message || '無法載入本機草稿'}。已暫停自動儲存，請匯入備份或手動儲存新草稿。`) } }).finally(() => { if (!cancelled) { setReady(true); headingRef.current?.focus() } })
    return () => { cancelled = true }
  }, [])
  const persist = async (draft: SurveyData) => {
    autoSaveEnabled.current = true
    const sequence = ++saveSequence.current
    setSaveState('pending')
    try { await writeLocalSurvey(draft); if (sequence === saveSequence.current) { setSaveState('saved'); setError(previous => previous.startsWith('本機儲存失敗') || previous.includes('已暫停自動儲存') ? '' : previous) } }
    catch { if (sequence === saveSequence.current) { setSaveState('failed'); setError('本機儲存失敗，草稿仍在目前畫面，請匯出 JSON 備份。') } }
  }
  useEffect(() => {
    if (!ready || !autoSaveEnabled.current) return
    setSaveState('pending')
    const timer = setTimeout(() => void persist(data), 600)
    return () => clearTimeout(timer)
  }, [data, ready])
  useEffect(() => () => { if (readyRef.current && autoSaveEnabled.current) void writeLocalSurvey(latest.current).catch(() => {}) }, [])
  useEffect(() => {
    if (picking && window.innerWidth <= 760) document.querySelector('.editor-workspace .map-shell')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [picking])

  const updateRoute = (transform: (r: Route) => Route) => {
    setMessage('')
    setData(current => ({ ...current, routes: current.routes.map(r => r.id === route?.id ? transform(r) : r) }))
  }
  const patchItem = (patch: Patch) => {
    const transform = (r: Route): Route => target === 'origin' ? { ...r, originEntrance: { ...r.originEntrance, ...patch } } : target === 'destination' ? { ...r, destinationEntrance: { ...r.destinationEntrance, ...patch } } : { ...r, segments: r.segments.map(s => s.id === item?.id ? { ...s, ...patch } : s) }
    if (patch.photos) {
      const prospective = { ...latest.current, routes: latest.current.routes.map(r => r.id === route?.id ? transform(r) : r) }
      if (new Blob([JSON.stringify(prospective)]).size > MAX_IMPORT_BYTES - 500_000) { setError('照片加入後總資料接近 20 MB 上限，請先縮小照片或移除部分照片。原有資料保留。'); return }
    }
    updateRoute(transform)
  }
  const selectItem = (id: Target) => { setTarget(id); setPicking(false) }
  const pickEntrance = (coordinate: Coordinate) => { if (!picking || !item || isSegment(item)) return; patchItem({ coordinate, status: 'unverified' }); setPicking(false) }
  const syncEndpoint = () => updateRoute(r => ({ ...r, segments: r.segments.map((s, i) => {
    if (target === 'origin' && i === 0) return { ...s, status: 'unverified', coordinates: [r.originEntrance.coordinate, ...s.coordinates.slice(1)] }
    if (target === 'destination' && i === r.segments.length - 1) return { ...s, status: 'unverified', coordinates: [...s.coordinates.slice(0, -1), r.destinationEntrance.coordinate] }
    return s
  }) }))
  const importJson = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('JSON 上限 20 MB，請減少照片大小')
      const parsed = parseSurveyData(JSON.parse((await file.text()).replace(/^\ufeff/, '')))
      autoSaveEnabled.current = true
      setData(parsed); setTarget('origin'); setRouteId(''); setPicking(false); setRevision(v => v + 1)
      setError(''); setMessage(`已匯入 ${parsed.routes.length} 條實勘草稿，原有狀態保留，仍需團隊審核。`)
    } catch (e) { setError(`匯入失敗，保留目前草稿。${e instanceof Error ? e.message : '請檢查檔案'}`) }
    finally { if (inputRef.current) inputRef.current.value = '' }
  }
  const exportData = (csv = false) => {
    try {
      const parsed = parseSurveyData(data)
      const json = JSON.stringify(parsed, null, 2)
      if (new Blob([json]).size > MAX_IMPORT_BYTES) throw new Error('完整資料超過 20 MB，請縮小或移除部分照片後匯出')
      downloadFile(`wheelway-survey-${today()}.${csv ? 'csv' : 'json'}`, csv ? surveyCsv(parsed) : json, csv ? 'text/csv;charset=utf-8' : 'application/json')
      setError(''); setMessage(csv ? '已匯出 CSV 彙整，照片請以 JSON 備份。' : '已匯出含照片的 JSON。審核後再由團隊更新公開網站。')
    } catch (e) { setError(e instanceof Error ? e.message : '匯出失敗') }
  }

  return <main className="workspace editor-workspace">
    <aside className="content-panel survey-panel" id="content-panel" tabIndex={-1} aria-label="實勘草稿編輯器">
      <div className="panel-main">
        <button className="back-link" onClick={onClose}><ArrowLeft size={17} />返回選路</button><p className="panel-eyebrow">FIELD SURVEY</p><h1 tabIndex={-1} ref={headingRef}>實勘資料編輯器</h1>
        <p className="survey-intro">逐段記錄現場，填入自己的量測與照片。</p>
        <div className="survey-local-note"><Save size={18} /><p>草稿僅存在目前瀏覽器，連結不包含草稿。請匯出 JSON 備份，交由團隊審核與發布。</p></div>
        {!ready ? <p role="status">載入本機草稿中…</p> : <>
          <div className="survey-toolbar"><button className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={16} />匯入 JSON</button><button className="button primary" onClick={() => exportData()}><Download size={16} />匯出 JSON</button><button className="button secondary" onClick={() => exportData(true)}><Download size={16} />匯出 CSV</button><button className="button secondary" onClick={() => void persist(data)}><Save size={16} />儲存草稿</button></div>
          <p className="survey-help">匯入會取代目前草稿，請先匯出備份。JSON 保留照片與完整資料，CSV 供表格檢閱。</p>
          <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={e => void importJson(e.target.files?.[0])} />
          <p className={`survey-save-status ${saveState}`} role="status">{saveState === 'saved' ? '已儲存在此瀏覽器' : saveState === 'failed' ? '尚未儲存，請匯出備份' : '正在儲存草稿…'}</p>
          {message && <p className="survey-message" role="status"><CheckCircle2 size={17} />{message}</p>}{error && <p className="survey-error" role="alert"><TriangleAlert size={17} />{error}</p>}
          {route && progress ? <>
            <label className="survey-field"><span>選擇實勘動線</span><select value={route.id} onChange={e => { setRouteId(e.target.value); selectItem('origin') }}>{data.routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="survey-field"><span>動線名稱</span><input maxLength={200} value={route.name} onChange={e => updateRoute(r => ({ ...r, name: e.target.value }))} /></label>
            <div className="survey-progress"><div><strong>{progress.verified} / {progress.total} 項已查核</strong><span>{progress.eligible ? '符合候選條件，待審核發布' : '尚未符合完整候選條件'}</span></div><progress value={progress.verified} max={progress.total} aria-label="入口與路段查核進度" /><p>目前公開網站的已查核路線不會因本機草稿變動。</p></div>
            {geometryIssues.length > 0 && <p className="survey-error"><TriangleAlert size={17} />{geometryIssues.join('、')}。請核對入口與路段幾何。</p>}
            {!isEligible(route, 'survey') && progress.verified === progress.total && <p className="survey-error">紀錄已齊備，但階梯、封閉或幾何條件使此路線無法列入候選。</p>}
            <div className="survey-targets" role="group" aria-label="選擇實勘項目">{[
              { id: 'origin', item: route.originEntrance, label: 'A' }, ...route.segments.map((s, i) => ({ id: s.id, item: s, label: String(i + 1) })), { id: 'destination', item: route.destinationEntrance, label: 'B' },
            ].map(entry => <button key={entry.id} aria-pressed={item?.id === entry.item.id} onClick={() => selectItem(entry.id)}><span>{entry.label}</span><strong>{entry.item.name}</strong><small>{segmentLabel(entry.item as Segment)}</small></button>)}</div>
            {item && <ItemForm key={`${route.id}-${item.id}-${revision}`} item={item} onPatch={patchItem} onError={setError} onPick={() => setPicking(v => !v)} picking={picking} onSync={syncEndpoint} geometryProblem={geometryIssues.length > 0} />}
          </> : <p className="survey-intro">檔案內沒有路線，可從下方建立空白草稿。</p>}
          <div className="survey-reset">{resetting ? <><p>重建會取代此瀏覽器內的草稿。請先匯出需要保留的紀錄。</p><button className="button secondary" onClick={() => { autoSaveEnabled.current = true; setData(createSurveyDrafts(campus)); selectItem('origin'); setRouteId(''); setResetting(false); setRevision(v => v + 1); setMessage('已建立空白草稿，所有通行條件與證據均待填寫。'); setError('') }}>確認重建空白草稿</button><button className="button plain" onClick={() => setResetting(false)}>取消</button></> : <button className="button plain wide" onClick={() => setResetting(true)}>從公開幾何重建空白草稿</button>}</div>
        </>}
      </div>
    </aside>
    <CampusMap campus={campus} routes={route ? [route] : []} selectedId={route?.id ?? ''} segmentId={item && isSegment(item) ? item.id : ''} mode="survey" screen="editor" onSelectRoute={() => {}} onSelectSegment={selectItem} pickingEntrance={picking} onPickEntrance={pickEntrance} />
  </main>
}
