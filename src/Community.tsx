import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Flag, LoaderCircle, LogIn, MapPin, MessageSquare, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { categories, impacts, isRoadReportId, needsReportCheck, reactions, relativeTime, reportMeasurementLabels, reportState, validateReport } from './community-model'
import type { CommunityReport, CommunitySegment, Reaction, ReportCategory, ReportImpact, ReportInput } from './community-model'
import { addPracticeReport, practiceWidthReportId, recordPracticeReaction, sampleCommunityReports } from './community-practice'
import { communityRequest, prepareCommunityPhoto } from './useCommunity'
import type { CommunityData } from './useCommunity'
import PhotoGallery from './PhotoGallery'
import ReportPointPicker from './ReportPointPicker'
import type { Coordinate } from './types'
import { validateReportPoint } from './road-conditions'
import './community.css'

const messageFor = (error: unknown) => error instanceof Error ? error.message : '操作未完成，請稍後再試。'
const localTime = () => { const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16) }
export const signInHref = () => `/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname+location.search+location.hash)}`
export interface CommunityIntent { segmentId: string; coordinate?: Coordinate | null; compose?: boolean }

type PracticeActions = { react: (reaction: Reaction, note: string) => void; withdraw: () => void }

function SignInNote() {
  return <div className="community-signin"><LogIn size={20} /><div><strong>登入後一起更新路況</strong><p>所有人都能閱讀，登入後可回報、確認現況及撤回自己的內容。</p><a className="button secondary" href={signInHref()} target="_top">使用 ChatGPT 登入</a></div></div>
}

function ReportCard({ report, data, segmentName, onOpenPhoto, practice, onSupplement }: {
  report: CommunityReport; data: CommunityData; segmentName?: string; onOpenPhoto: () => void
  practice?: PracticeActions; onSupplement?: () => void
}) {
  const [action,setAction]=useState<Reaction|'flag'|'withdraw'|null>(null)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  const state=reportState(report, data.now)
  const send=async()=>{
    if(!action)return
    setBusy(true);setFeedback('')
    try {
      if (practice) {
        if (action === 'withdraw') practice.withdraw()
        else if (action !== 'flag') practice.react(action, note)
        setAction(null); setNote(''); setFeedback('已更新這則示範紀錄。')
        return
      }
      if(action==='withdraw')await communityRequest(`reports/${report.id}`,{method:'DELETE'})
      else if(action==='flag')await communityRequest(`reports/${report.id}/flag`,{method:'POST',body:JSON.stringify({reason:note})})
      else await communityRequest(`reports/${report.id}/reaction`,{method:'POST',body:JSON.stringify({reaction:action,note})})
      setAction(null);setNote('');setFeedback(action==='flag'?'已送交管理人員檢視。':action==='withdraw'?'已撤回回報。':'已更新你的現場確認。')
      await data.refresh()
    }catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}
  }
  const begin=(next:typeof action)=>{setAction(next);setNote('');setFeedback('')}
  return <article className="community-report" id={practice ? report.id : undefined} tabIndex={practice ? -1 : undefined}>
    <div className="community-report-heading"><strong>{practice && <small className="practice-pill">示範</small>}{categories[report.category]}</strong><span className={`report-impact ${report.impact}`}>{impacts[report.impact]}</span></div>
    {segmentName&&<p className="report-segment"><MapPin size={13}/>{segmentName}</p>}
    <p className="report-location-kind"><MapPin size={13} aria-hidden="true" />{practice ? '情境模擬' : report.coordinate ? '使用者標記位置' : '整段道路回報'}</p>
    <p className="report-message">{report.message}</p>
    {report.measurements && <div className="report-measurements">
      <small>{practice ? '示範單點量測' : '使用者單點量測'}</small>
      <ul>{reportMeasurementLabels(report.measurements).map((value, index) => <li key={index}>{value}</li>)}</ul>
    </div>}
    {report.photoUrl&&<PhotoGallery photos={[{src:report.photoUrl,alt:`${categories[report.category]}的使用者照片`,caption:'使用者提供的現場照片'}]} onOpen={onOpenPhoto}/>}
    <div className="report-meta"><span>{report.authorName}{report.own?'（你）':''}</span><time dateTime={report.observedAt} title={new Date(report.observedAt).toLocaleString('zh-TW')}>{relativeTime(report.observedAt)}發現</time><span className={`report-state ${state.kind}`}>{state.label}</span></div>
    <div className="report-confirmations" aria-label="其他使用者的現場確認">{(Object.keys(reactions) as Reaction[]).map(key=><span key={key}>{reactions[key]} {report.counts[key]}</span>)}</div>
    {(practice || data.session.signedIn) && <div className="report-actions">
      {!report.own && (Object.keys(reactions) as Reaction[]).map(key => <button key={key} aria-pressed={report.myReaction === key} disabled={busy} onClick={() => begin(key)}>
        {report.myReaction === key && <Check size={14} aria-hidden="true" />}{reactions[key]}
      </button>)}
      {report.own && <button disabled={busy} onClick={() => begin('withdraw')}><Trash2 size={14} aria-hidden="true" />撤回</button>}
      {!practice && onSupplement && <button disabled={busy} onClick={onSupplement}>補充這個位置</button>}
      {!practice && !report.own && <button disabled={busy} className="report-flag" aria-label="檢舉這則回報" title="檢舉這則回報" onClick={() => begin('flag')}><Flag size={15} aria-hidden="true" /></button>}
    </div>}
    {action&&<form className="report-action-form" onSubmit={e=>{e.preventDefault();void send()}}>
      <label><span>{action==='flag'?'檢舉原因':action==='withdraw'?practice?'移除這則示範回報？':'撤回後，這則回報與照片會停止公開。':`確認「${reactions[action]}」，可補充現場情況`}</span>{action!=='withdraw'&&<textarea required={action==='flag'} minLength={action==='flag'?2:undefined} maxLength={200} value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder={action==='flag'?'例如：垃圾訊息、照片包含個人資料':'補充說明（選填）'}/>}</label>
      <div><button type="submit" className="button secondary" disabled={busy}>{busy?<LoaderCircle className="spinner" size={15}/>:<Check size={15}/>} {action==='withdraw'?'確認撤回':action==='flag'?'送出檢舉':'送出確認'}</button><button type="button" className="button plain" disabled={busy} onClick={()=>setAction(null)}>取消</button></div>
    </form>}
    {feedback&&<p className="community-feedback" role="status">{feedback}</p>}
    {report.updates.length>0&&<details className="report-updates"><summary>查看最近確認與補充（{report.counts.exists+report.counts.resolved+report.counts.different}）</summary><ul>{report.updates.map((update,i)=><li key={`${update.at}-${i}`}><strong>{reactions[update.reaction]}</strong><span>{relativeTime(update.at)}</span>{update.note&&<p>{update.note}</p>}</li>)}</ul><p>每個帳號保留最近一次確認，確認數量不代表實勘查核。</p></details>}
  </article>
}

function CommunityStatus({data}:{data:CommunityData}) {
  if (!data.loading && !data.error && !data.truncated) return null
  return <div className="community-status">
    {data.loading && <span role="status"><LoaderCircle className="spinner" size={14} aria-hidden="true" />載入路況中</span>}
    {data.error && <><p role="alert">路況暫時無法載入。{data.fetchedAt?'下方是上次取得的回報。':''}</p><button onClick={()=>void data.refresh()}><RefreshCw size={15} aria-hidden="true" />重新載入路況</button></>}
    {data.truncated&&<p>顯示最近 300 則回報。</p>}
  </div>
}

export function CommunitySection({data,segmentId,onOpen,onOpenPhoto}:{data:CommunityData;segmentId:string;onOpen:()=>void;onOpenPhoto:()=>void}) {
  const reports=data.reports.filter(r=>r.segmentId===segmentId)
  return <section className="community-section" aria-labelledby="segment-community-title"><div className="section-heading"><h3 id="segment-community-title"><MessageSquare size={18}/>這段路的回報</h3><button className="community-link" onClick={onOpen}><Plus size={16}/>回報路況</button></div><CommunityStatus data={data}/>{reports.slice(0,3).map(report=><ReportCard key={report.id} report={report} data={data} onOpenPhoto={onOpenPhoto}/>)}{!reports.length&&!data.loading&&!data.error&&<p className="community-empty">這段路目前沒有回報。</p>}{reports.length>3&&<button className="button secondary wide" onClick={onOpen}>查看這段路的全部 {reports.length} 則回報</button>}</section>
}

function ReportForm({ data, segments, initial, onDone, active, practice }: {
  data: CommunityData; segments: CommunitySegment[]; initial: CommunityIntent; onDone: (id: string) => void; active: boolean
  practice?: (input: ReportInput) => void
}) {
  const [segmentId,setSegmentId]=useState(initial.segmentId||segments[0]?.id||'')
  const segment = segments.find(item => item.id === segmentId)
  const [coordinate,setCoordinate]=useState<Coordinate|null>(initial.coordinate ?? null)
  const fixed = isRoadReportId(initial.segmentId)
  const [category,setCategory]=useState<ReportCategory>('parking')
  const [impact,setImpact]=useState<ReportImpact>('difficult')
  const [message,setMessage]=useState('')
  const [authorName,setAuthorName]=useState('')
  const [observedAt,setObservedAt]=useState(localTime)
  const [photo,setPhoto]=useState<Blob|null>(null)
  const [preview,setPreview]=useState('')
  const [photoBusy,setPhotoBusy]=useState(false)
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  const [pendingPhotoId,setPendingPhotoId]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)
  const photoGeneration=useRef(0)
  useEffect(()=>{if(!photo){setPreview('');return}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url)},[photo])
  useEffect(()=>()=>{photoGeneration.current++},[])
  const reset=()=>{setMessage('');setPhoto(null);setCoordinate(null);setPendingPhotoId('');if(fileRef.current)fileRef.current.value='';setObservedAt(localTime());onDone(segmentId)}
  const upload=async(id:string)=>{if(photo)await communityRequest(`reports/${id}/photo`,{method:'PUT',body:photo,headers:{'Content-Type':photo.type}})}
  const submit=async(fields: FormData)=>{
    setFeedback('');setBusy(true)
    try {
      const number = (key: string) => {
        const value = String(fields.get(key) ?? '').trim()
        return value ? Number(value) : null
      }
      const input=validateReport({segmentId,category,impact,message,authorName,coordinate,observedAt:new Date(observedAt).toISOString(),
        measurements: { widthCm: number('widthCm'), stepCm: number('stepCm'), slopePercent: number('slopePercent'), surface: fields.get('surface') },
      },new Set(segments.map(s=>s.id)))
      if (fixed && !input.coordinate) throw new Error('請先標記看到路況的位置。')
      validateReportPoint(input.coordinate,segment?.coordinates)
      if (practice) { practice(input); reset(); return }
      const {id}=await communityRequest('reports',{method:'POST',body:JSON.stringify(input)})
      if(photo){setPendingPhotoId(id);try{await upload(id)}catch(error){setFeedback(`文字已發布，照片上傳結果尚未確認。${messageFor(error)}`);await data.refresh();return}}
      reset();setFeedback('已公開回報，其他使用者可以查看及確認。');await data.refresh()
    }catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}
  }
  return <form className="community-form" onSubmit={e=>{e.preventDefault();void submit(new FormData(e.currentTarget))}}>
    <h3>{practice ? '新增示範回報' : '回報你看到的路況'}</h3>
    <p>{practice ? '可輸入一個假想情境，練習送出回報。' : '回報會公開顯示於所選路段，請描述實際看到的情況。'}</p>
    <fieldset disabled={busy||!!pendingPhotoId}>
      {fixed ? <p className="report-draft-road"><MapPin size={16} aria-hidden="true" />{segment?.name ?? '校園路網標記'}</p>
        : <label><span>路段</span><select required value={segmentId} onChange={e=>{setSegmentId(e.target.value);setCoordinate(null);setFeedback('')}}>{segments.filter(item => !isRoadReportId(item.id)).map(s=><option key={s.id} value={s.id}>{s.routeName}｜{s.name}</option>)}</select></label>}
      {segment?.approximate ? <p>館內走向約略，可用整段回報。</p>
        : <ReportPointPicker key={segmentId} segment={segment} coordinate={coordinate} onChange={setCoordinate} active={active&&!busy&&!pendingPhotoId} practice={!!practice} />}
      <div className="community-field-pair"><label><span>問題類型</span><select value={category} onChange={e=>setCategory(e.target.value as ReportCategory)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>通行影響</span><select value={impact} onChange={e=>setImpact(e.target.value as ReportImpact)}>{Object.entries(impacts).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
      <label><span>路況說明</span><textarea required minLength={5} maxLength={500} rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder="例如：轉角停了多輛腳踏車，推輪椅需要繞到旁邊。"/><small>{message.length} / 500 字</small></label>
      <details className="community-measure-fields">
        <summary>補充單點量測（選填）</summary>
        <p>填寫這個位置量到的數值。沒量到的欄位可留空。</p>
        <div className="community-field-pair">
          <label>淨寬（公分）<input name="widthCm" type="number" min="1" max="5000" step="any" inputMode="decimal" /></label>
          <label>階差（公分）<input name="stepCm" type="number" min="0" max="150" step="any" inputMode="decimal" /></label>
          <label>坡度（%）<input name="slopePercent" type="number" min="0" max="100" step="any" inputMode="decimal" /></label>
          <label>路面材質<input name="surface" maxLength={40} placeholder="例如地磚、柏油" /></label>
        </div>
      </details>
      {!practice && <div className="community-field-pair"><label><span>發現時間</span><input required type="datetime-local" value={observedAt} onChange={e=>setObservedAt(e.target.value)}/></label><label><span>公開暱稱（選填）</span><input maxLength={24} value={authorName} onChange={e=>setAuthorName(e.target.value)} placeholder="校園使用者" autoComplete="off"/></label></div>}
      {!practice && <label className="community-photo-input"><span><Camera size={17} aria-hidden="true" />現場照片（選填，一張）</span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{
        const file=e.target.files?.[0];const call=++photoGeneration.current;setPhoto(null);setFeedback('');if(!file)return;setPhotoBusy(true)
        try{const result=await prepareCommunityPhoto(file);if(call===photoGeneration.current)setPhoto(result)}catch(error){if(call===photoGeneration.current){setFeedback(messageFor(error));e.target.value=''}}finally{if(call===photoGeneration.current)setPhotoBusy(false)}
      }}/><small>照片會縮小並移除原始定位資訊。請避開人臉、車牌及私人資訊。</small></label>}
      {photoBusy&&<p role="status">正在處理照片</p>}{preview&&<div className="community-photo-preview"><img src={preview} alt="即將公開的照片預覽"/><button type="button" className="button plain" onClick={()=>{photoGeneration.current++;setPhoto(null);if(fileRef.current)fileRef.current.value=''}}>移除照片</button></div>}
    </fieldset>
    {pendingPhotoId?<div className="pending-photo-actions"><button type="button" className="button primary" disabled={busy} onClick={async()=>{setBusy(true);try{await upload(pendingPhotoId);reset();setFeedback('照片已補上。');await data.refresh()}catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}}}>重試上傳照片</button><button type="button" className="button plain" disabled={busy} onClick={()=>{reset();setFeedback('已保留文字回報。')}}>保留文字，略過照片</button></div>:<button type="submit" className="button primary" disabled={busy||photoBusy||!segment||(!practice&&!data.session.available)}>{busy?<LoaderCircle className="spinner" size={17} aria-hidden="true" />:<Plus size={17} aria-hidden="true" />}{practice ? '送出示範回報' : '公開回報'}</button>}
    {feedback&&<p className="community-feedback" role="status">{feedback}</p>}
  </form>
}

function CommunityAdmin({data}:{data:CommunityData}) {
  const [token,setToken]=useState('');const [error,setError]=useState('')
  const [reports,setReports]=useState<(CommunityReport&{status:string;flagCount:number;flags:{reason:string;at:string}[]})[]>([])
  const [loaded,setLoaded]=useState(false)
  const load=async()=>{try{const result=await communityRequest('admin',{headers:{Authorization:`Bearer ${token}`}});setReports(result.reports);setLoaded(true);setError('')}catch(e){setError(messageFor(e))}}
  return <details className="community-admin"><summary>內容管理</summary><form onSubmit={e=>{e.preventDefault();void load()}}><label>管理金鑰<input type="password" required value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label><button className="button secondary" type="submit">載入管理列表</button></form>{error&&<p role="alert">{error}</p>}{loaded&&<p>{reports.length} 則紀錄。作者撤回的內容無法重新公開。</p>}{reports.map(r=><article key={r.id}><strong>{categories[r.category]} · {r.status} · {r.flagCount} 則檢舉</strong><p>{r.message}</p>{r.flags?.map((flag,i)=><p key={i}>檢舉原因：{flag.reason}（{relativeTime(flag.at)}）</p>)}{r.status!=='withdrawn'&&<button className="button secondary" onClick={async()=>{try{await communityRequest(`admin/${r.id}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({status:r.status==='visible'?'hidden':'visible'})});await load();await data.refresh()}catch(e){setError(messageFor(e))}}}>{r.status==='visible'?'隱藏回報':'恢復公開'}</button>}</article>)}</details>
}

function PracticeRouteComparison({ report, now }: { report?: CommunityReport; now: number }) {
  const [minimum, setMinimum] = useState(90)
  const state = report && reportState(report, now)
  const width = state?.kind === 'active' ? report?.measurements?.widthCm : null
  const widthStatus = (value?: number | null) => value == null ? '此處淨寬未知' : value < minimum ? '低於設定淨寬' : '此處符合設定淨寬'
  return <details className="community-measure-fields practice-comparison">
    <summary>練習比較兩條路線</summary>
    <p>總圖到博雅的模擬情境。兩條路線各看一個通行點。</p>
    <label>希望至少有多少淨寬
      <select value={minimum} onChange={event => setMinimum(Number(event.target.value))}>
        {[75, 90, 110, 130].map(value => <option key={value} value={value}>{value} 公分</option>)}
      </select>
    </label>
    <ul aria-live="polite">
      <li><strong>經廣場轉角 · 約 580 公尺</strong><p>{width == null ? widthStatus() : `回報單點淨寬 ${width} 公分 · ${widthStatus(width)}`}</p>
        {state && <p>{state.label}</p>}</li>
      <li><strong>繞行較寬步道 · 約 620 公尺</strong><p>模擬單點淨寬 120 公分 · {widthStatus(120)}</p></li>
    </ul>
    {report && <button type="button" className="community-link" onClick={() => {
      const card = document.getElementById(practiceWidthReportId)
      card?.focus({ preventScroll: true })
      card?.scrollIntoView({ block: 'center' })
    }}>前往核對轉角回報</button>}
  </details>
}

interface CommunityDialogProps {
  open: boolean; onClose: () => void; data: CommunityData; segments: CommunitySegment[]; practiceSegments: CommunitySegment[]
  intent: CommunityIntent; mapReady: boolean; mapError: boolean; onMapRetry: () => void; onMapPick: () => void
  onInspect: (id: string, coordinate?: Coordinate | null) => boolean; onOpenPhoto: () => void
}

export function CommunityDialog({open,onClose,data,segments,practiceSegments,intent,mapReady,mapError,
    onMapRetry,onMapPick,onInspect,onOpenPhoto}: CommunityDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const lastIntent = useRef<CommunityIntent | null>(null)
  const draftVersion = useRef(0)
  const [view, setView] = useState<'live' | 'practice'>('live')
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState('all')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [draft, setDraft] = useState<{ target: CommunityIntent; version: number }>()
  const [practiceDraft, setPracticeDraft] = useState(false)
  const [examples, setExamples] = useState(() => sampleCommunityReports(practiceSegments, data.now))
  const [feedback, setFeedback] = useState('')
  const [practiceFeedback, setPracticeFeedback] = useState('')

  useEffect(() => {
    if (!open) return
    const dialog = ref.current, trigger = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }) }
  }, [open])
  useEffect(() => {
    if (!open || lastIntent.current === intent) return
    lastIntent.current = intent
    setFilter(intent.segmentId)
    setCategory('all')
    setPendingOnly(false)
    setView('live')
    setFeedback('')
    if (intent.compose) setDraft({ target: intent, version: ++draftVersion.current })
  }, [open, intent])

  const scrollToForm = () => requestAnimationFrame(() => {
    const form = ref.current?.querySelector<HTMLElement>('.community-dialog-body:not([hidden]) .community-form')
    form?.scrollIntoView({ block: 'start', behavior: 'instant' })
    form?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
  })
  const begin = (target: CommunityIntent) => {
    setDraft({ target, version: ++draftVersion.current })
    setFeedback('')
    scrollToForm()
  }
  const chooseView = (next: 'live' | 'practice') => {
    setView(next)
    ref.current?.scrollTo({ top: 0 })
  }
  const selectedSegment = segments.find(segment => segment.id === filter)
  const matching = data.reports.filter(report => (!filter || report.segmentId === filter) && (category === 'all' || report.category === category))
  const pending = matching.filter(report => needsReportCheck(report, data.now))
  const shown = pendingOnly ? pending : matching
  return <dialog ref={ref} className="community-dialog" aria-labelledby="community-title"
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <header className="community-dialog-header">
      <h2 id="community-title">校園路況</h2>
      <button className="icon-button" onClick={onClose} aria-label="關閉校園路況"><X size={23} aria-hidden="true" /></button>
    </header>
    <div className="community-views" role="group" aria-label="選擇路況內容">
      <button type="button" aria-pressed={view === 'live'} onClick={() => chooseView('live')}>使用者回報</button>
      <button type="button" aria-pressed={view === 'practice'} onClick={() => chooseView('practice')}>示範練習</button>
    </div>
    <div className="community-dialog-body" hidden={view !== 'live'}>
      <CommunityStatus data={data} />
      {data.session.signedIn ? <div className="community-contribute">
        <button type="button" className="button primary" disabled={!mapReady} onClick={onMapPick}><MapPin size={17} aria-hidden="true" />在地圖選回報位置</button>
        <button type="button" className="button secondary" onClick={() => begin({ segmentId: selectedSegment && !isRoadReportId(selectedSegment.id) ? selectedSegment.id : '' })}>選既有試走路段</button>
        {mapError && <button type="button" className="button plain" onClick={onMapRetry}>重新載入校園路網</button>}
        {!mapReady && !mapError && <p className="community-source-note" role="status">正在載入校園路網…</p>}
      </div> : !data.loading && !data.error && <SignInNote />}
      {draft && data.session.signedIn && <ReportForm key={draft.version} data={data} segments={segments}
        initial={draft.target} active={open && view === 'live'} onDone={id => {
          setFilter(id); setCategory('all'); setPendingOnly(false); setDraft(undefined); setFeedback('已公開回報，其他使用者可以查看及確認。')
        }} />}
      <div className="community-filter">
        <label><span>查看路段</span><select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">所有路段</option>
          {filter && !selectedSegment && <option value={filter}>校園路網標記</option>}
          {segments.map(segment => <option key={segment.id} value={segment.id}>{segment.routeName}｜{segment.name}</option>)}
        </select></label>
        <label><span>問題類型</span><select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="all">全部類型</option>{Object.entries(categories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      <div className="community-list-heading">
        <h3>{selectedSegment?.name ?? '路況回報'}<span>{shown.length} 則</span></h3>
        <button type="button" className="button secondary" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}>待核對（{pending.length}）</button>
      </div>
      {feedback && <p className="community-feedback" role="status">{feedback}</p>}
      {shown.map(report => {
        const segment = segments.find(item => item.id === report.segmentId)
        return <div key={report.id}>
          <ReportCard report={report} data={data} segmentName={segment?.name ?? '校園路網標記'} onOpenPhoto={onOpenPhoto}
            onSupplement={segment && report.coordinate ? () => begin({ segmentId: report.segmentId, coordinate: report.coordinate }) : undefined} />
          <button type="button" className="community-inspect" onClick={() => {
            if (onInspect(report.segmentId, report.coordinate)) onClose()
            else setFeedback('目前的路線地圖找不到這段道路。')
          }}><MapPin size={15} aria-hidden="true" />{report.coordinate ? '在地圖查看標記位置' : '在地圖查看這個路段'}</button>
        </div>
      })}
      {!shown.length && !data.loading && !data.error && <div className="community-empty"><MessageSquare size={28} aria-hidden="true" />
        <h3>{pendingOnly ? '目前沒有符合的待核對回報' : '還沒有這類路況回報'}</h3>
        <button type="button" className="community-link" onClick={() => chooseView('practice')}>先試用示範回報</button>
      </div>}
      <details className="community-guidance">
        <summary>回報怎麼更新</summary>
        <p>到過現場的人可以補上量測，或確認「仍然存在」「已排除」「現場不同」。逾期會列入待核對。新路網有其他使用者確認的近期受阻點，規劃時才會避開。</p>
      </details>
      {typeof location !== 'undefined' && new URLSearchParams(location.search).has('community-admin') && <CommunityAdmin data={data} />}
    </div>
    <div className="community-dialog-body" hidden={view !== 'practice'}>
      <div className="practice-banner">
        <strong>示範資料</strong>
        <p>可練習回報和核對。這裡的路況是虛構情境，操作留在此頁。</p>
      </div>
      <PracticeRouteComparison report={examples.find(report => report.id === practiceWidthReportId)} now={data.now} />
      <div className="community-contribute">
        <button type="button" className="button primary" onClick={() => { setPracticeDraft(true); scrollToForm() }}><Plus size={17} aria-hidden="true" />新增示範回報</button>
        <button type="button" className="button plain" onClick={() => {
          setExamples(sampleCommunityReports(practiceSegments, Date.now())); setPracticeDraft(false); setPracticeFeedback('已重設示範。')
        }}>重設示範</button>
      </div>
      {practiceDraft && <ReportForm data={data} segments={practiceSegments} initial={{ segmentId: '' }} active={open && view === 'practice'}
        practice={input => setExamples(previous => [addPracticeReport(input), ...previous])} onDone={() => {
          setPracticeDraft(false); setPracticeFeedback('示範回報已加入這個頁面。')
        }} />}
      {practiceFeedback && <p className="community-feedback" role="status">{practiceFeedback}</p>}
      {examples.map(report => <ReportCard key={report.id} report={report} data={data}
        segmentName={practiceSegments.find(segment => segment.id === report.segmentId)?.name} onOpenPhoto={onOpenPhoto}
        practice={{
          react: (reaction, note) => setExamples(previous => previous.map(item => item.id === report.id ? recordPracticeReaction(item, reaction, note) : item)),
          withdraw: () => setExamples(previous => previous.filter(item => item.id !== report.id)),
        }} />)}
    </div>
  </dialog>
}
