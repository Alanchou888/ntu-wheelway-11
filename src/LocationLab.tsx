import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import CampusMap from './CampusMap'
import MapSheet from './MapSheet'
import type { SheetSize } from './MapSheet'
import { DeviceLocationSession } from './device-location'
import { buildDemoRoutes } from './routes'
import { useMediaQuery } from './useRouteTour'
import type { Campus } from './types'

/** Development-only browser contract fixture. Removed from production by Vite. */
export default function LocationLab() {
  const [campus,setCampus]=useState<Campus|null>(null)
  const [scenario,setScenario]=useState('near')
  const selected=useRef('near')
  const clock=useRef(Date.now())
  const sequence=useRef(0)
  const callbacks=useRef(new Map<number,{success:PositionCallback;error:PositionErrorCallback|null|undefined;timer:ReturnType<typeof setTimeout>}>())
  const [counts,setCounts]=useState({starts:0,stops:0})
  const [preview,setPreview]=useState(false)
  const [session]=useState(()=>new DeviceLocationSession({
    watchPosition(success,error){
      const id=sequence.current++
      const timer=setTimeout(()=>{
        if(!callbacks.current.has(id))return
        if(selected.current==='denied'||selected.current==='timeout'){error?.({code:selected.current==='denied'?1:3} as GeolocationPositionError);return}
        success({timestamp:clock.current,coords:{longitude:selected.current==='outside'?121.56:121.5385,latitude:25.0173,accuracy:selected.current==='poor'?240:8}} as GeolocationPosition)
      },250)
      callbacks.current.set(id,{success,error,timer});setCounts(c=>({...c,starts:c.starts+1}));return id
    },
    clearWatch(id){const callback=callbacks.current.get(id);if(callback){clearTimeout(callback.timer);callbacks.current.delete(id);setCounts(c=>({...c,stops:c.stops+1}))}},
  },true,()=>clock.current))
  const state=useSyncExternalStore(session.subscribe,session.snapshot,session.snapshot)
  const panelRef=useRef<HTMLElement>(null)
  const [sheet,setSheet]=useState<SheetSize>('map')
  const mobile=useMediaQuery('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)')
  useEffect(()=>{const controller=new AbortController();void fetch('/data/campus.json',{signal:controller.signal}).then(r=>r.json()).then(setCampus).catch(()=>{});return()=>controller.abort()},[])
  if(!campus)return <p>載入公開校園圖資</p>
  const routes=buildDemoRoutes(campus)
  const move=()=>{clock.current+=1000;for(const callback of callbacks.current.values())callback.success({timestamp:clock.current,coords:{longitude:121.539,latitude:25.0178,accuracy:10}} as GeolocationPosition)}
  return <div className="app map-experience"><header style={{padding:12,borderBottom:'1px solid #bac7d5',background:'#fff',zIndex:1000}}><h1 style={{fontSize:17}}>定位開發測試，非裝置真實位置</h1><p style={{fontSize:12,margin:'6px 0'}}>固定座標僅用於本機檢查，正式網站不載入這個測試頁。</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><label>測試情境 <select aria-label="測試情境" style={{minHeight:44}} value={scenario} onChange={e=>{selected.current=e.target.value;setScenario(e.target.value)}}><option value="near">校園內</option><option value="poor">精度較低</option><option value="outside">服務範圍外</option><option value="denied">拒絕權限</option><option value="timeout">定位逾時</option></select></label><button className="button secondary" onClick={move}>移動測試位置</button><button className="button secondary" onClick={()=>{clock.current+=35_000;session.tick()}}>使位置過期</button><button className="button secondary" onClick={session.pause}>模擬切到背景</button><button className="button secondary" onClick={()=>setPreview(true)}>啟動測試預演</button></div><p role="status" style={{fontSize:12,marginTop:6}}>測試狀態：{state.status}，watch 開啟 {counts.starts} 次，停止 {counts.stops} 次，跟隨 {state.following?'開':'關'}</p></header>
    <main className="workspace route-workspace" data-screen="setup"><MapSheet size={sheet} onSize={setSheet} mobile={mobile} panelRef={panelRef} collapsed={<p>定位測試，非裝置位置</p>}><div className="panel-main"><h2>定位測試</h2><p>按地圖右側「定位我」開啟。定位由測試提供器回傳，不會觸發裝置定位權限。</p></div></MapSheet><CampusMap campus={campus} routes={routes} selectedId="gentle" segmentId="gentle-1" screen="setup" mode="demo" onSelectRoute={()=>{}} onSelectSegment={()=>{}} layoutKey={sheet} locationSession={session} onLocationActivity={()=>setPreview(false)} preview={preview?{coordinate:[121.537,25.019],following:true,playing:true,reducedMotion:true}:undefined}/></main>
  </div>
}
