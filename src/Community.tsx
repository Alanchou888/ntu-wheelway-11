import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Flag, LoaderCircle, LogIn, MapPin, MessageSquare, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { categories, impacts, reactions, relativeTime, reportState, validateReport } from './community-model'
import type { CommunityReport, CommunitySegment, Reaction, ReportCategory, ReportImpact } from './community-model'
import { communityRequest, prepareCommunityPhoto } from './useCommunity'
import type { CommunityData } from './useCommunity'
import PhotoGallery from './PhotoGallery'
import './community.css'

const messageFor = (error: unknown) => error instanceof Error ? error.message : '操作未完成，請稍後再試。'
const localTime = () => { const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16) }
export const signInHref = () => `/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname+location.search+location.hash)}`

function SignInNote() {
  return <div className="community-signin"><LogIn size={20} /><div><strong>登入後一起更新路況</strong><p>所有人都能閱讀，登入後可回報、確認現況及撤回自己的內容。</p><a className="button secondary" href={signInHref()} target="_top">使用 ChatGPT 登入</a></div></div>
}

function ReportCard({ report, data, segmentName, onOpenPhoto }: { report:CommunityReport; data:CommunityData; segmentName?:string; onOpenPhoto:()=>void }) {
  const [action,setAction]=useState<Reaction|'flag'|'withdraw'|null>(null)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  const state=reportState(report)
  const send=async()=>{
    if(!action)return
    setBusy(true);setFeedback('')
    try {
      if(action==='withdraw')await communityRequest(`reports/${report.id}`,{method:'DELETE'})
      else if(action==='flag')await communityRequest(`reports/${report.id}/flag`,{method:'POST',body:JSON.stringify({reason:note})})
      else await communityRequest(`reports/${report.id}/reaction`,{method:'POST',body:JSON.stringify({reaction:action,note})})
      setAction(null);setNote('');setFeedback(action==='flag'?'已送交管理人員檢視。':action==='withdraw'?'已撤回回報。':'已更新你的現場確認。')
      await data.refresh()
    }catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}
  }
  const begin=(next:typeof action)=>{setAction(next);setNote('');setFeedback('')}
  return <article className="community-report">
    <div className="community-report-heading"><strong>{categories[report.category]}</strong><span className={`report-impact ${report.impact}`}>{impacts[report.impact]}</span></div>
    {segmentName&&<p className="report-segment"><MapPin size={13}/>{segmentName}</p>}
    <p className="report-message">{report.message}</p>
    {report.photoUrl&&<PhotoGallery photos={[{src:report.photoUrl,alt:`${categories[report.category]}的使用者照片`,caption:'使用者提供的現場照片'}]} onOpen={onOpenPhoto}/>}
    <div className="report-meta"><span>{report.authorName}{report.own?'（你）':''}</span><time dateTime={report.observedAt} title={new Date(report.observedAt).toLocaleString('zh-TW')}>{relativeTime(report.observedAt)}發現</time><span className={`report-state ${state.kind}`}>{state.label}</span></div>
    <div className="report-confirmations" aria-label="其他使用者的現場確認">{(Object.keys(reactions) as Reaction[]).map(key=><span key={key}>{reactions[key]} {report.counts[key]}</span>)}</div>
    {data.session.signedIn&&<div className="report-actions">{!report.own&&(Object.keys(reactions) as Reaction[]).map(key=><button key={key} aria-pressed={report.myReaction===key} disabled={busy} onClick={()=>begin(key)}>{report.myReaction===key&&<Check size={14}/>} {reactions[key]}</button>)}{report.own?<button disabled={busy} onClick={()=>begin('withdraw')}><Trash2 size={14}/>撤回</button>:<button disabled={busy} className="report-flag" aria-label="檢舉這則回報" title="檢舉這則回報" onClick={()=>begin('flag')}><Flag size={15}/></button>}</div>}
    {action&&<form className="report-action-form" onSubmit={e=>{e.preventDefault();void send()}}>
      <label><span>{action==='flag'?'檢舉原因':action==='withdraw'?'撤回後，這則回報與照片會停止公開。':`確認「${reactions[action]}」，可補充現場情況`}</span>{action!=='withdraw'&&<textarea required={action==='flag'} minLength={action==='flag'?2:undefined} maxLength={200} value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder={action==='flag'?'例如：垃圾訊息、照片包含個人資料':'補充說明（選填）'}/>}</label>
      <div><button type="submit" className="button secondary" disabled={busy}>{busy?<LoaderCircle className="spinner" size={15}/>:<Check size={15}/>} {action==='withdraw'?'確認撤回':action==='flag'?'送出檢舉':'送出確認'}</button><button type="button" className="button plain" disabled={busy} onClick={()=>setAction(null)}>取消</button></div>
    </form>}
    {feedback&&<p className="community-feedback" role="status">{feedback}</p>}
    {report.updates.length>0&&<details className="report-updates"><summary>查看最近確認與補充（{report.counts.exists+report.counts.resolved+report.counts.different}）</summary><ul>{report.updates.map((update,i)=><li key={`${update.at}-${i}`}><strong>{reactions[update.reaction]}</strong><span>{relativeTime(update.at)}</span>{update.note&&<p>{update.note}</p>}</li>)}</ul><p>每個帳號保留最近一次確認，確認數量不代表實勘查核。</p></details>}
  </article>
}

function CommunityStatus({data}:{data:CommunityData}) {
  return <div className="community-status">{data.loading?<span role="status"><LoaderCircle className="spinner" size={14}/>更新路況中</span>:<span>{data.fetchedAt?`更新於 ${new Date(data.fetchedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`:'尚未取得社群資料'}</span>}<button disabled={data.loading} onClick={()=>void data.refresh()} aria-label="重新整理社群路況"><RefreshCw size={15}/>重新整理</button>{data.error&&<p role="alert">{data.error}{data.fetchedAt?' 下方保留上次載入的內容。':''}</p>}{data.truncated&&<p>目前顯示最近 300 則回報，較早內容未列入本次列表。</p>}</div>
}

export function CommunitySection({data,segmentId,onOpen,onOpenPhoto}:{data:CommunityData;segmentId:string;onOpen:()=>void;onOpenPhoto:()=>void}) {
  const reports=data.reports.filter(r=>r.segmentId===segmentId)
  return <section className="community-section" aria-labelledby="segment-community-title"><div className="section-heading"><h3 id="segment-community-title"><MessageSquare size={18}/>這段路的回報</h3><button className="community-link" onClick={onOpen}><Plus size={16}/>回報路況</button></div><p className="community-source-note">使用者提供的現場資訊，與實勘查核分開記錄。</p><CommunityStatus data={data}/>{reports.slice(0,3).map(report=><ReportCard key={report.id} report={report} data={data} onOpenPhoto={onOpenPhoto}/>)}{!reports.length&&!data.loading&&!data.error&&<p className="community-empty">這段路尚無社群回報。走過後可以留下現場情況。</p>}{reports.length>3&&<button className="button secondary wide" onClick={onOpen}>查看這段路的全部 {reports.length} 則回報</button>}</section>
}

function ReportForm({data,segments,initialSegment,onDone}:{data:CommunityData;segments:CommunitySegment[];initialSegment:string;onDone:(segmentId:string)=>void}) {
  const [segmentId,setSegmentId]=useState(initialSegment||segments[0]?.id||'')
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
  const reset=()=>{setMessage('');setPhoto(null);setPendingPhotoId('');if(fileRef.current)fileRef.current.value='';setObservedAt(localTime());onDone(segmentId)}
  const upload=async(id:string)=>{if(photo)await communityRequest(`reports/${id}/photo`,{method:'PUT',body:photo,headers:{'Content-Type':photo.type}})}
  const submit=async()=>{
    setFeedback('');setBusy(true)
    try {
      const input=validateReport({segmentId,category,impact,message,authorName,observedAt:new Date(observedAt).toISOString()},new Set(segments.map(s=>s.id)))
      const {id}=await communityRequest('reports',{method:'POST',body:JSON.stringify(input)})
      if(photo){setPendingPhotoId(id);try{await upload(id)}catch(error){setFeedback(`文字已發布，照片上傳結果尚未確認。${messageFor(error)}`);await data.refresh();return}}
      reset();setFeedback('已公開回報，其他使用者可以查看及確認。');await data.refresh()
    }catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}
  }
  return <form className="community-form" onSubmit={e=>{e.preventDefault();void submit()}}>
    <h3>回報你看到的路況</h3><p>回報會公開顯示於所選路段，請描述實際看到的情況。</p>
    <fieldset disabled={busy||!!pendingPhotoId}>
      <label><span>路段</span><select required value={segmentId} onChange={e=>setSegmentId(e.target.value)}>{segments.map(s=><option key={s.id} value={s.id}>{s.routeName}：{s.name}</option>)}</select></label>
      <div className="community-field-pair"><label><span>問題類型</span><select value={category} onChange={e=>setCategory(e.target.value as ReportCategory)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>通行影響</span><select value={impact} onChange={e=>setImpact(e.target.value as ReportImpact)}>{Object.entries(impacts).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
      <label><span>路況說明</span><textarea required minLength={5} maxLength={500} rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder="例如：轉角停了多輛腳踏車，推輪椅需要繞到旁邊。"/><small>{message.length} / 500 字</small></label>
      <div className="community-field-pair"><label><span>發現時間</span><input required type="datetime-local" value={observedAt} onChange={e=>setObservedAt(e.target.value)}/></label><label><span>公開暱稱（選填）</span><input maxLength={24} value={authorName} onChange={e=>setAuthorName(e.target.value)} placeholder="校園使用者" autoComplete="nickname"/></label></div>
      <label className="community-photo-input"><span><Camera size={17}/>現場照片（選填，一張）</span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{
        const file=e.target.files?.[0];const call=++photoGeneration.current;setPhoto(null);setFeedback('');if(!file)return;setPhotoBusy(true)
        try{const result=await prepareCommunityPhoto(file);if(call===photoGeneration.current)setPhoto(result)}catch(error){if(call===photoGeneration.current){setFeedback(messageFor(error));e.target.value=''}}finally{if(call===photoGeneration.current)setPhotoBusy(false)}
      }}/><small>照片會縮小並移除原始定位資訊。請避開人臉、車牌及私人資訊。</small></label>
      {photoBusy&&<p role="status">正在處理照片</p>}{preview&&<div className="community-photo-preview"><img src={preview} alt="即將公開的照片預覽"/><button type="button" className="button plain" onClick={()=>{photoGeneration.current++;setPhoto(null);if(fileRef.current)fileRef.current.value=''}}>移除照片</button></div>}
    </fieldset>
    {pendingPhotoId?<div className="pending-photo-actions"><button type="button" className="button primary" disabled={busy} onClick={async()=>{setBusy(true);try{await upload(pendingPhotoId);reset();setFeedback('照片已補上。');await data.refresh()}catch(error){setFeedback(messageFor(error))}finally{setBusy(false)}}}>重試上傳照片</button><button type="button" className="button plain" disabled={busy} onClick={()=>{reset();setFeedback('已保留文字回報。')}}>保留文字，略過照片</button></div>:<button type="submit" className="button primary" disabled={busy||photoBusy||!data.session.available}>{busy?<LoaderCircle className="spinner" size={17}/>:<Plus size={17}/>}公開回報</button>}
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

export function CommunityDialog({open,onClose,data,segments,initialSegment,onInspect,onOpenPhoto}:{open:boolean;onClose:()=>void;data:CommunityData;segments:CommunitySegment[];initialSegment:string;onInspect:(id:string)=>boolean;onOpenPhoto:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  const [filter,setFilter]=useState(initialSegment)
  const [category,setCategory]=useState('all')
  const [form,setForm]=useState(false)
  const [draftSegment,setDraftSegment]=useState('')
  const [feedback,setFeedback]=useState('')
  useEffect(()=>{
    if(!open)return
    setFilter(initialSegment);setCategory('all');setFeedback('')
    const trigger=document.activeElement as HTMLElement|null
    ref.current?.showModal()
    return()=>{ref.current?.close();trigger?.focus({preventScroll:true})}
  },[open,initialSegment])
  // Keep an unfinished form mounted while the dialog is closed.
  const shown=data.reports.filter(r=>(!filter||r.segmentId===filter)&&(category==='all'||r.category===category))
  return <dialog ref={ref} className="community-dialog" aria-labelledby="community-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <header className="community-dialog-header"><div><h2 id="community-title">校園路況</h2><p>走過的人，補上現場的情況。</p></div><button className="icon-button" onClick={onClose} aria-label="關閉校園路況"><X size={23}/></button></header>
    <div className="community-dialog-body"><p className="community-source-note">回報標記代表整段道路，並非障礙的精確位置。社群回報不會自動成為已查核路線。</p>
      <div className="community-filter"><label><span>查看路段</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">所有路段</option>{segments.map(s=><option key={s.id} value={s.id}>{s.routeName}：{s.name}</option>)}</select></label><label><span>問題類型</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部類型</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
      <CommunityStatus data={data}/>
      <div className="community-list-heading"><h3>{filter?segments.find(s=>s.id===filter)?.name:'周邊路段'}<span>{shown.length} 則回報</span></h3>{data.session.signedIn&&<button className="button primary" onClick={()=>{setDraftSegment(filter);setForm(true);requestAnimationFrame(()=>ref.current?.querySelector('.community-form')?.scrollIntoView({block:'start',behavior:'instant'}))}}><Plus size={17}/>回報路況</button>}</div>
      {!data.session.signedIn&&!data.loading&&!data.error&&<SignInNote/>}
      <div hidden={!form}>{form&&data.session.signedIn&&<ReportForm key={draftSegment} data={data} segments={segments} initialSegment={draftSegment} onDone={id=>{setFilter(id);setCategory('all');setForm(false);setFeedback('回報已發布，其他使用者可以查看及確認。')}}/>}</div>
      {feedback&&<p className="community-feedback" role="status">{feedback}</p>}
      {shown.map(report=><div key={report.id}><ReportCard report={report} data={data} segmentName={segments.find(s=>s.id===report.segmentId)?.name} onOpenPhoto={onOpenPhoto}/><button className="community-inspect" onClick={()=>{if(onInspect(report.segmentId))onClose();else setFeedback('這段參考線未列入目前候選路線。請先返回設定，檢查資料模式與通行條件。')}}><MapPin size={15}/>在地圖查看這個路段</button></div>)}
      {!shown.length&&!data.loading&&!data.error&&<div className="community-empty"><MessageSquare size={28}/><h3>還沒有這類路況回報</h3><p>可以回報親眼看到的狀況，附上時間與照片。</p></div>}
      <details className="community-guidance"><summary>回報如何更新與顯示</summary><p>違停 6 小時、車流 3 小時、積水 12 小時、施工 3 天、照明 7 天、路面顛簸 30 天、其他 1 天後，若無更新確認，會標為「待重新確認」。這些是本站的顯示期限，逾期不代表問題已排除。</p><p>「已排除」與「現場不同」會保留為使用者回報。每個帳號對同一則回報保留最近一次確認，作者不能確認自己的回報。遇到垃圾訊息或私人資訊，可檢舉交由管理人員處理。</p><p>社群路況需連線取得，並顯示上次更新時間。目前保留原本的距離與坡度排序，回報作為額外選路資訊。</p></details>
      {typeof location!=='undefined'&&new URLSearchParams(location.search).has('community-admin')&&<CommunityAdmin data={data}/>}
    </div>
  </dialog>
}
