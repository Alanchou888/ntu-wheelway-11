import { useEffect, useRef, useState } from 'react'
import { LocateFixed, LoaderCircle, MapPin, Pause, Play, Square, X } from 'lucide-react'
import { accuracyLabel, isLiveLocation, locationStatus } from './device-location'
import type { DeviceLocationSession, LocationSnapshot } from './device-location'
import './device-location.css'

export function LocationDetails({state,inCoverage}:{state:LocationSnapshot;inCoverage:boolean}) {
  const live=isLiveLocation(state)
  return <>
    <div className="location-state"><span className={live?'location-dot':'location-dot inactive'}/><strong>{locationStatus(state)}</strong></div>
    {state.fix&&<dl className="location-facts"><div><dt>裝置回報精度</dt><dd>{accuracyLabel(state.fix.accuracyM)}</dd></div><div><dt>最近更新</dt><dd>{new Date(state.fix.timestamp).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}{!live?'（上次位置）':''}</dd></div></dl>}
    {state.fix&&state.fix.accuracyM>50&&<p className="location-caution">定位精度較低，請比對附近地標，無法據此判斷位於道路的哪一側。</p>}
    {state.fix&&!inCoverage&&<p className="location-caution">目前位置在服務範圍外。網站動線仍限於臺大總圖書館與博雅教學館周邊。</p>}
    {state.fix&&state.status==='tracking'&&!live&&<p className="location-caution">超過 30 秒沒有新位置，圖上保留上次位置與誤差範圍。</p>}
    {state.message&&<p className={state.status==='error'?'location-caution':'location-message'} role="status">{state.message}</p>}
  </>
}

export default function LocationControls({state,session,inCoverage,onActivity}:{state:LocationSnapshot;session:DeviceLocationSession;inCoverage:boolean;onActivity:()=>void}) {
  const [open,setOpen]=useState(false)
  const ref=useRef<HTMLDialogElement>(null)
  const autoClose=useRef(false)
  const live=isLiveLocation(state)
  const running=state.status==='requesting'||state.status==='tracking'
  useEffect(()=>{
    if(!open)return
    const trigger=document.activeElement as HTMLElement|null
    ref.current?.showModal()
    return()=>{ref.current?.close();trigger?.focus({preventScroll:true})}
  },[open])
  useEffect(()=>{if(autoClose.current&&state.status==='tracking'){autoClose.current=false;setOpen(false)}},[state.status])
  const start=()=>{autoClose.current=true;onActivity();session.start()}
  const follow=()=>{onActivity();session.setFollowing(true);setOpen(false)}
  return <>
    <span className="sr-only" role="status">{state.status==='off'?state.message:locationStatus(state)}</span>
    <button className={`map-tool location-tool ${live?'active':''}`} aria-label="定位我" aria-haspopup="dialog" title="定位我" onClick={()=>setOpen(true)}>{state.status==='requesting'?<LoaderCircle className="spinner" size={20}/>:<LocateFixed size={21}/>}</button>
    {state.status!=='off'&&<button className={`location-status-chip ${live?'':'inactive'}`} onClick={()=>setOpen(true)} aria-label={`位置設定：${locationStatus(state)}`}><MapPin size={16}/><span>{locationStatus(state)}{state.fix&&<small>精度{accuracyLabel(state.fix.accuracyM)}</small>}</span></button>}
    {open&&<dialog ref={ref} className="location-dialog" aria-labelledby="location-title" onCancel={e=>{e.preventDefault();setOpen(false)}} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="dialog-header"><h2 id="location-title">我的位置</h2><button className="icon-button" onClick={()=>setOpen(false)} aria-label="關閉位置設定"><X size={22}/></button></div>
      <p className="location-intro">開啟後，地圖會顯示裝置回報的位置與誤差範圍。請在瀏覽器提示中選擇是否允許。</p>
      <LocationDetails state={state} inCoverage={inCoverage}/>
      <div className="location-dialog-actions">
        {live?<><button className="button primary" onClick={follow}><LocateFixed size={18}/>回到我的位置</button><button className="button secondary" aria-pressed={state.following} onClick={()=>{if(!state.following)onActivity();session.setFollowing(!state.following)}}>{state.following?<Pause size={17}/>:<Play size={17}/>} {state.following?'暫停地圖跟隨':'跟隨我的位置'}</button></>:state.status==='requesting'?<button className="button secondary" onClick={()=>{autoClose.current=false;session.stop()}}>取消定位</button>:<button className="button primary" onClick={start}><LocateFixed size={18}/>{state.status==='paused'?'繼續定位':state.status==='error'||state.fix?'重新定位':'同意並開啟定位'}</button>}
        {(running||state.fix||state.status==='paused')&&<button className="button plain" onClick={()=>{autoClose.current=false;session.stop()}}><Square size={16}/>停止定位並清除位置</button>}
      </div>
      <p className="location-privacy">位置只用於目前頁面，本站不保存定位紀錄，也不會將位置加入留言或分享連結。地圖服務仍會收到所查看區域的圖磚請求。</p>
      <p className="location-scope">裝置定位與路線預演分開顯示。定位不會改動起終點、通行條件或查核狀態。</p>
    </dialog>}
  </>
}
