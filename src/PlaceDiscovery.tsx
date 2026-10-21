import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,ArrowUpDown,ArrowUpRight,Armchair,Building2,ChevronRight,Clock,Copy,Droplets,MapPin,Search,ShieldQuestion,Toilet,X} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import type {CatalogCategory,CatalogPlace,Entrance,Mode,PlaceCatalog} from './types'
import {categoryLabels,findPlaces} from './places'
import {distance,formatDate,formatDistance} from './routes'
import PhotoGallery from './PhotoGallery'
import './place-discovery.css'

const categoryIcons:Record<CatalogCategory,LucideIcon>={building:Building2,toilet:Toilet,elevator:ArrowUpDown,water:Droplets,rest:Armchair,ramp:ArrowUpRight,landmark:MapPin}
const quickCategories:CatalogCategory[]=['building','toilet','elevator','water','rest','ramp','landmark']
export function PlaceIcon({category,size=19}:{category:CatalogCategory;size?:number}){const Icon=categoryIcons[category];return <Icon size={size} aria-hidden="true"/>}

interface SearchProps{
  places:CatalogPlace[];query:string;category?:CatalogCategory;selected?:CatalogPlace;recent:string[]
  onQuery:(value:string)=>void;onChoose:(place:CatalogPlace)=>void;onCategory:(category:CatalogCategory)=>void
  onClear:()=>void;onBrowse:()=>void;onClearRecent:()=>void
}
export function PlaceSearch({places,query,category,selected,recent,onQuery,onChoose,onCategory,onClear,onBrowse,onClearRecent}:SearchProps){
  const [open,setOpen]=useState(false)
  const [active,setActive]=useState(-1)
  const root=useRef<HTMLDivElement>(null)
  const matched=findPlaces(places,query)
  const recentPlaces=recent.flatMap(id=>places.find(p=>p.id===id)??[])
  const options=query.trim()?matched.slice(0,7):[...recentPlaces,...matched.filter(p=>!recent.includes(p.id))].slice(0,6)
  const choose=(place:CatalogPlace)=>{setOpen(false);setActive(-1);onChoose(place)}
  return <div className="discovery-tools">
    <div className="place-search" ref={root} onBlur={event=>{if(!root.current?.contains(event.relatedTarget))setOpen(false)}}>
      <form className="place-search-field" role="search" onSubmit={event=>{event.preventDefault();if(options[active>=0?active:0])choose(options[active>=0?active:0]);else{setOpen(false);onBrowse()}}}>
        <Search size={21} aria-hidden="true"/>
        <input id="place-search-input" aria-label="搜尋校園地點" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="place-suggestions" aria-activedescendant={open&&active>=0&&options[active]?`place-suggestion-${active}`:undefined} placeholder="搜尋校園地點與設施" autoComplete="off" value={query} onFocus={()=>{setOpen(true);setActive(-1)}} onChange={event=>{onQuery(event.target.value);setOpen(true);setActive(-1)}} onKeyDown={event=>{
          if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1)}
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>options.length?event.key==='ArrowDown'?Math.min(index+1,options.length-1):index<0?options.length-1:Math.max(0,index-1):-1)}
        }}/>
        {(query||selected||category)&&<button className="place-search-clear" type="button" aria-label="清除搜尋並返回路線" onClick={()=>{onClear();setOpen(false);setActive(-1)}}><X size={20}/></button>}
      </form>
      {open&&<div className="place-suggestions">
        <div className="suggestions-heading"><span>{query.trim()?'搜尋建議':recentPlaces.length?'最近查看與附近地點':'附近地點'}</span>{!query.trim()&&recentPlaces.length>0&&<button onClick={onClearRecent}>清除最近查看</button>}</div>
        <ul id="place-suggestions" role="listbox" aria-label="地點搜尋建議">{options.map((place,index)=><li key={place.id} role="presentation"><button type="button" role="option" id={`place-suggestion-${index}`} aria-selected={active===index} tabIndex={-1} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(place)}><span className={`place-category-icon ${place.category}`}>{recent.includes(place.id)&&!query.trim()?<Clock size={18} aria-hidden="true"/>:<PlaceIcon category={place.category}/>}</span><span><strong>{place.name}</strong><small>{categoryLabels[place.category]}{place.routePlaceId?' · 支援校園選路':' · 公開點位'}</small></span><ArrowUpRight size={17} aria-hidden="true"/></button></li>)}</ul>
        {!options.length&&<p className="suggestions-empty">找不到「{query.slice(0,50)}」。試試「總圖」「博雅」或設施類別。</p>}
        <button className="suggestions-all" onClick={()=>{setOpen(false);onBrowse()}}>查看{query.trim()?'全部搜尋結果':'地點清單'}<ArrowRight size={16}/></button>
        <p className="suggestions-scope">搜尋總圖與博雅周邊的公開地點</p>
      </div>}
    </div>
    <div className="place-category-strip" role="group" aria-label="附近設施分類">{quickCategories.map(value=><button key={value} className={category===value?'selected':''} aria-pressed={category===value} onClick={()=>{setOpen(false);onCategory(value)}}><PlaceIcon category={value} size={17}/><span>{categoryLabels[value]}</span></button>)}</div>
  </div>
}

export function CatalogStatus({loading,error,onRetry}:{loading:boolean;error:boolean;onRetry:()=>void}){
  return loading?<p className="catalog-status" role="status">正在補齊周邊地點，基本圖資仍可使用。</p>:error?<div className="catalog-status warning" role="status"><p>周邊地點快照暫時無法載入，先顯示可讀取的資料。路線規劃仍可使用。</p><button onClick={onRetry}>重試地點資料</button></div>:null
}
export function PlaceList({catalog,results,title,onChoose,onBack,loading,error,onRetry}:{catalog:PlaceCatalog;results:CatalogPlace[];title:string;onChoose:(p:CatalogPlace)=>void;onBack:()=>void;loading:boolean;error:boolean;onRetry:()=>void}){
  const [limit,setLimit]=useState(45)
  const reference=catalog.places.find(p=>p.id==='library')
  return <section className="place-results"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/>返回路線規劃</button><div className="place-list-title"><h1 id="place-heading" tabIndex={-1}>{title}</h1><span>{results.length} 個地點</span></div><p className="place-list-intro">公開點位供尋找位置，通行條件與入口仍待查核。</p><CatalogStatus loading={loading} error={error} onRetry={onRetry}/>{catalog.amenitiesStatus==='unavailable'&&!results.length&&<p className="catalog-status warning">廁所、電梯、飲水與休息設施的公開資料暫時未取得。建物、地標與坡道仍可查看。</p>}
    {results.length?<><ul className="place-result-list">{results.slice(0,limit).map(place=><li key={place.id}><button onClick={()=>onChoose(place)}><span className={`place-category-icon ${place.category}`}><PlaceIcon category={place.category} size={22}/></span><span className="place-result-text"><strong>{place.name}</strong><small>{categoryLabels[place.category]}{place.routePlaceId?' · 支援校園選路':''}</small>{reference&&<small>距總圖中心直線 {formatDistance(distance(reference.coordinate,place.coordinate))}</small>}</span><ChevronRight size={16} aria-hidden="true"/></button></li>)}</ul>{results.length>limit&&<button className="button secondary wide" onClick={()=>setLimit(n=>n+45)}>顯示更多地點</button>}</>:<div className="place-empty"><Search size={30}/><h2>這個範圍尚無符合的點位</h2><p>公開圖資可能尚未收錄。可換個關鍵字或其他類別，空白結果不代表現場沒有設施。</p><button className="button secondary wide" onClick={onBack}>返回路線規劃</button></div>}
    <p className="place-data-note">距離採直線計算，實際可通行路線需另行確認。</p>
  </section>
}

export function PlaceCard({place,catalog,entrances,mode,onClose,onEndpoint,onChoose,shareUrl}:{place:CatalogPlace;catalog:PlaceCatalog;entrances:Entrance[];mode:Mode;onClose:()=>void;onEndpoint:(action:'from'|'to')=>void;onChoose:(place:CatalogPlace)=>void;shareUrl:string}){
  const [copy,setCopy]=useState('')
  const [fallback,setFallback]=useState(false)
  const heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{heading.current?.focus({preventScroll:true})},[])
  const source=catalog.sources.find(s=>s.id===place.sourceId)
  const nearby=catalog.places.filter(p=>p.id!==place.id&&!['building','landmark'].includes(p.category)&&distance(p.coordinate,place.coordinate)<=250).sort((a,b)=>distance(a.coordinate,place.coordinate)-distance(b.coordinate,place.coordinate)).slice(0,3)
  const wheelchair=place.wheelchair?({yes:'來源標記為可使用',no:'來源標記為無法使用',limited:'來源標記為部分可使用',designated:'來源標記為輪椅專用'}[place.wheelchair]??place.wheelchair):'來源尚未提供'
  const share=async()=>{try{await navigator.clipboard.writeText(shareUrl);setCopy('已複製地點連結');setFallback(false)}catch{setCopy('請複製下方地點連結');setFallback(true)}}
  return <article className="place-card">
    <div className="place-card-top"><button className="back-link" onClick={onClose}><ArrowLeft size={17}/>返回地圖資訊</button><button className="icon-button" onClick={onClose} aria-label="關閉地點卡片"><X size={20}/></button></div>
    <div className={`place-card-symbol ${place.category}`}><PlaceIcon category={place.category} size={30}/><span>{categoryLabels[place.category]}</span></div>
    <h1 id="place-heading" ref={heading} tabIndex={-1}>{place.name}</h1>
    <p className="place-card-subtitle">{categoryLabels[place.category]}<span>公開點位，待實勘</span></p>
    <div className="place-card-actions"><button className="button primary" disabled={!place.routePlaceId} onClick={()=>onEndpoint('to')}><ArrowRight size={17}/>前往這裡</button><button className="button secondary" disabled={!place.routePlaceId} onClick={()=>onEndpoint('from')}><MapPin size={17}/>從這裡出發</button><button className="place-share" onClick={share}><Copy size={17}/>分享</button></div>
    {copy&&<p className="place-copy-status" role="status">{copy}</p>}{fallback&&<input className="copy-fallback" aria-label="地點連結" readOnly value={shareUrl} onFocus={event=>event.target.select()}/>}
    <p className={`place-route-scope ${place.routePlaceId?'connected':''}`}>{place.routePlaceId?`可設定總圖與博雅之間的${mode==='demo'?'示範':'查核'}選路。建物中心與路線入口分開標示。`:'此地點尚未接入可通行路網，目前提供位置與公開資訊。'}</p>
    <dl className="place-facts"><div><dt>位置說明</dt><dd>{place.note}</dd></div><div><dt>地址</dt><dd>{place.address??'來源尚未提供'}</dd></div><div><dt>開放時間</dt><dd>{place.openingHours??'來源尚未提供'}{place.openingHours&&<small>來源原始標記，未判讀目前是否開放</small>}</dd></div><div><dt>輪椅資訊</dt><dd>{wheelchair}{place.wheelchair&&<small>公開標記，尚未由團隊查核</small>}</dd></div>{place.level&&<div><dt>樓層標記</dt><dd>{place.level}</dd></div>}{place.widthM!==null&&<div><dt>來源路寬</dt><dd>{place.widthM} m，現況待查核</dd></div>}{place.slopePercent!==null&&<div><dt>來源坡度</dt><dd>{place.slopePercent}%，現況待查核</dd></div>}</dl>
    {place.routePlaceId&&<section className="place-entrances"><h2>路線入口<span>{mode==='demo'?'示範位置':'實勘資料'}</span></h2>{entrances.length?<ul>{entrances.map(entrance=><li key={entrance.id}><MapPin size={17}/><div><strong>{entrance.name}</strong><p>{entrance.source}</p><small>查核日期：{formatDate(entrance.verifiedAt)}</small></div></li>)}</ul>:<p>目前沒有符合條件的路線入口。</p>}</section>}
    <section className="place-photo-section"><h2>地點照片</h2><PhotoGallery photos={place.photos}/></section>
    {nearby.length>0&&<section className="place-nearby"><h2>附近設施<span>直線 250 m 內</span></h2>{nearby.map(p=><button key={p.id} onClick={()=>onChoose(p)}><PlaceIcon category={p.category} size={18}/><span>{p.name}<small>直線 {formatDistance(distance(p.coordinate,place.coordinate))}</small></span><ChevronRight size={16}/></button>)}</section>}
    <div className="place-source"><ShieldQuestion size={18}/><div><strong>尚未實地查核</strong><p>{source?.label??'公開圖資'} · 取得 {formatDate(place.retrievedAt)}</p>{source?.status==='cached'&&<p>更新暫時失敗，保留上一版快照。</p>}<a href={place.sourceUrl} target="_blank" rel="noreferrer">查看原始來源<ArrowUpRight size={14}/></a></div></div>
  </article>
}
