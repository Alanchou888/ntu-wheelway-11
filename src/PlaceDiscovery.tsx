import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,ArrowUpDown,ArrowUpRight,Armchair,Building2,Camera,ChevronDown,ChevronRight,Clock,Copy,Droplets,MapPin,Search,Toilet,X} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import type {CatalogCategory,CatalogPlace,Entrance,Mode,PlaceCatalog} from './types'
import {categoryLabels,findPlaces} from './places'
import {distance,formatDate,formatDistance} from './routes'
import {fieldObservation} from './field-observations'
import PhotoGallery from './PhotoGallery'
import './place-discovery.css'

const categoryIcons:Record<CatalogCategory,LucideIcon>={building:Building2,toilet:Toilet,elevator:ArrowUpDown,water:Droplets,rest:Armchair,ramp:ArrowUpRight,landmark:MapPin,field:Camera}
const facilityCategories:CatalogCategory[]=['field','ramp','toilet','water','elevator','rest','building','landmark']
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
  const more=useRef<HTMLDetailsElement>(null)
  const availableCategories=new Set(places.map(place=>place.category))
  const quickCategories=facilityCategories.filter(value=>(value==='field'||value==='ramp')&&availableCategories.has(value))
  const extraCategories=facilityCategories.filter(value=>!quickCategories.includes(value))
  const matched=findPlaces(places,query)
  const recentPlaces=recent.flatMap(id=>places.find(p=>p.id===id)??[])
  const options=query.trim()?matched.slice(0,7):[...recentPlaces,...matched.filter(p=>!recent.includes(p.id))].slice(0,6)
  const choose=(place:CatalogPlace)=>{setOpen(false);setActive(-1);onChoose(place)}
  return <div className="discovery-tools">
    <div className="place-search" ref={root} onBlur={event=>{if(!root.current?.contains(event.relatedTarget))setOpen(false)}}>
      <form className="place-search-field" role="search" onSubmit={event=>{
        event.preventDefault()
        const option=active>=0?options[active]:query.trim()?options[0]:undefined
        if(option)choose(option)
        else{setOpen(false);onBrowse()}
      }}>
        <Search size={21} aria-hidden="true"/>
        <input id="place-search-input" aria-label="搜尋校園地點" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?'place-suggestions':undefined} aria-activedescendant={open&&active>=0&&options[active]?`place-suggestion-${active}`:undefined} placeholder="搜尋地點與設施" autoComplete="off" value={query} onFocus={()=>{if(more.current)more.current.open=false;setOpen(true);setActive(-1)}} onChange={event=>{onQuery(event.target.value);setOpen(true);setActive(-1)}} onKeyDown={event=>{
          if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1)}
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>options.length?event.key==='ArrowDown'?Math.min(index+1,options.length-1):index<0?options.length-1:Math.max(0,index-1):-1)}
        }}/>
        {(query||selected||category)&&<button className="place-search-clear" type="button" aria-label="清除搜尋並返回路線" onClick={()=>{onClear();setOpen(false);setActive(-1)}}><X size={20}/></button>}
      </form>
      {open&&<div className="place-suggestions">
        <div className="suggestions-heading"><span>{query.trim()?'搜尋建議':recentPlaces.length?'最近查看與附近地點':'附近地點'}</span>{!query.trim()&&recentPlaces.length>0&&<button onClick={onClearRecent}>清除最近查看</button>}</div>
        <ul id="place-suggestions" role="listbox" aria-label="地點搜尋建議">{options.map((place,index)=><li key={place.id} role="presentation"><button type="button" role="option" id={`place-suggestion-${index}`} aria-selected={active===index} tabIndex={-1} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(place)}><span className={`place-category-icon ${place.category}`}>{recent.includes(place.id)&&!query.trim()?<Clock size={18} aria-hidden="true"/>:<PlaceIcon category={place.category}/>}</span><span><strong>{place.name}</strong><small>{categoryLabels[place.category]}{place.routePlaceId?' · 支援校園選路':place.category==='field'?' · 現場紀錄':' · 公開點位'}</small></span><ArrowUpRight size={17} aria-hidden="true"/></button></li>)}</ul>
        {!options.length&&<p className="suggestions-empty">找不到「{query.slice(0,50)}」。試試「總圖」「博雅」或設施類別。</p>}
        <button className="suggestions-all" onClick={()=>{setOpen(false);onBrowse()}}>查看{query.trim()?'全部搜尋結果':'地點清單'}<ArrowRight size={16}/></button>
        <p className="suggestions-scope">搜尋總圖與博雅周邊的設施和實勘點</p>
      </div>}
    </div>
    <div className="place-category-strip" role="group" aria-label="附近設施分類">
      {quickCategories.map(value=><button key={value} className={category===value?'selected':''} aria-pressed={category===value} onClick={()=>{setOpen(false);if(more.current)more.current.open=false;onCategory(value)}}><PlaceIcon category={value} size={17}/><span>{categoryLabels[value]}</span></button>)}
      <details className="facility-more" ref={more} onToggle={event=>{if(event.currentTarget.open)setOpen(false)}} onKeyDown={event=>{
        if(event.key==='Escape'&&more.current?.open){event.preventDefault();event.stopPropagation();more.current.open=false;more.current.querySelector('summary')?.focus()}
      }}>
        <summary className={category&&extraCategories.includes(category)?'selected':undefined}>更多設施<ChevronDown size={16} aria-hidden="true"/></summary>
        <div className="facility-options" role="group" aria-label="更多設施分類">
          {extraCategories.map(value=><button key={value} className={category===value?'selected':''} aria-pressed={category===value} onClick={()=>{if(more.current)more.current.open=false;onCategory(value)}}>
            <PlaceIcon category={value} size={17}/><span>{categoryLabels[value]}{!availableCategories.has(value)&&<small>資料暫缺</small>}</span>
          </button>)}
        </div>
      </details>
    </div>
  </div>
}

export function CatalogStatus({loading,error,onRetry}:{loading:boolean;error:boolean;onRetry:()=>void}){
  return loading?<p className="catalog-status" role="status">載入地點中</p>:error?<div className="catalog-status warning" role="status"><p>部分地點暫時無法載入。</p><button onClick={onRetry}>重新載入地點</button></div>:null
}
export function PlaceList({catalog,results,category,title,onChoose,onBack,loading,error,onRetry,fieldList,showAllFieldPoints,backLabel='返回路線'}:{
  catalog:PlaceCatalog;results:CatalogPlace[];category?:CatalogCategory;title:string;onChoose:(p:CatalogPlace)=>void;onBack:()=>void
  loading:boolean;error:boolean;onRetry:()=>void;fieldList?:boolean;showAllFieldPoints?:()=>void;backLabel?:string
}){
  const [limit,setLimit]=useState(45)
  const reference=catalog.places.find(p=>p.id==='library')
  return <section className="place-results">
    <button className="back-link" onClick={onBack}><ArrowLeft size={17}/>{backLabel}</button>
    <div className="place-list-title"><h1 id="place-heading" tabIndex={-1}>{title}</h1>{results.length>0&&<span>{results.length} {fieldList?'個實勘點':'個地點'}</span>}</div>
    <CatalogStatus loading={loading} error={error} onRetry={onRetry}/>
    {results.length ? <>
      <ul className="place-result-list">{results.slice(0,limit).map(place=>{
        const field=fieldObservation(place.id)
        const values=field?.readings?.map(reading=>reading.value)??['現場照片']
        return <li key={place.id}><button onClick={()=>onChoose(place)}>
          <span className={`place-category-icon ${place.category}`}><PlaceIcon category={place.category} size={22}/></span>
          <span className="place-result-text"><strong>{place.name}</strong>
            {field ? <small>{[place.level, ...values].filter(Boolean).join(' · ')}</small> : <>
              <small>{categoryLabels[place.category]}{place.routePlaceId?' · 支援校園選路':''}</small>
              {reference&&<small>距總圖中心直線 {formatDistance(distance(reference.coordinate,place.coordinate))}</small>}
            </>}
          </span><ChevronRight size={16} aria-hidden="true"/>
        </button></li>
      })}</ul>
      {results.length>limit&&<button className="button secondary wide" onClick={()=>setLimit(n=>n+45)}>顯示更多地點</button>}
    </> : !loading && <div className="place-empty"><Search size={30} aria-hidden="true"/><p>{category?`目前沒有${categoryLabels[category]}點位資料。`:'找不到符合的地點。可試試其他關鍵字。'}</p></div>}
    {showAllFieldPoints&&<button className="button secondary wide field-show-all" onClick={showAllFieldPoints}>查看全部實勘點</button>}
    {!fieldList&&results.length>0&&<p className="place-data-note">清單顯示直線距離。</p>}
  </section>
}

export function PlaceCard({place,catalog,entrances,mode,onClose,onEndpoint,onChoose,shareUrl,backLabel='返回地圖資訊'}:{place:CatalogPlace;catalog:PlaceCatalog;entrances:Entrance[];mode:Mode;onClose:()=>void;onEndpoint:(action:'from'|'to')=>void;onChoose:(place:CatalogPlace)=>void;shareUrl:string;backLabel?:string}){
  const [copy,setCopy]=useState('')
  const [fallback,setFallback]=useState(false)
  const heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{heading.current?.focus({preventScroll:true})},[])
  const field=fieldObservation(place.id)
  const source=catalog.sources.find(s=>s.id===place.sourceId)
  const nearby=catalog.places.filter(p=>p.id!==place.id&&!['building','landmark'].includes(p.category)&&distance(p.coordinate,place.coordinate)<=250).sort((a,b)=>distance(a.coordinate,place.coordinate)-distance(b.coordinate,place.coordinate)).slice(0,3)
  const wheelchair=place.wheelchair?({yes:'來源標記為可使用',no:'來源標記為無法使用',limited:'來源標記為部分可使用',designated:'來源標記為輪椅專用'}[place.wheelchair]??place.wheelchair):'來源尚未提供'
  const share=async()=>{try{await navigator.clipboard.writeText(shareUrl);setCopy('已複製地點連結');setFallback(false)}catch{setCopy('請複製下方地點連結');setFallback(true)}}
  const shareStatus=<>{copy&&<p className="place-copy-status" role="status">{copy}</p>}{fallback&&<input className="copy-fallback" aria-label="地點連結" readOnly value={shareUrl} onFocus={event=>event.target.select()}/>}</>
  if(field) return <article className="place-card field-card">
    <div className="place-card-top">
      <button className="back-link" onClick={onClose}><ArrowLeft size={17}/>{backLabel}</button>
      <button className="field-share" onClick={share}><Copy size={16}/>分享</button>
    </div>
    <p className="field-card-date"><PlaceIcon category="field" size={16}/>{['實勘紀錄', place.level, formatDate(place.retrievedAt)].filter(Boolean).join(' · ')}</p>
    <h1 id="place-heading" ref={heading} tabIndex={-1}>{place.name}</h1>
    {shareStatus}
    <p className="field-observation-note">{place.note}</p>
    {field.readings&&<dl className="field-readings">{field.readings.map(({label,value,context})=><div key={label}>
      <dt>{label}</dt><dd><strong>{value}</strong><span>{context}</span></dd>
    </div>)}</dl>}
    <section className="place-photo-section"><h2>現場照片</h2><PhotoGallery photos={place.photos}/></section>
    {field.video&&<section className="place-photo-section field-video">
      <h2>現場短片</h2>
      <video controls playsInline preload="none" poster={place.photos[0]?.src} aria-label={`${place.name}現場短片`}><source src={field.video.src} type="video/mp4"/></video>
      <p>{field.video.caption}</p>
    </section>}
    <details className="field-source">
      <summary>位置與素材來源</summary>
      <p>{field.location}</p>
      <p>{source?.label??'第 11 組實勘紀錄'} · {field.files}</p>
    </details>
  </article>
  return <article className="place-card">
    <div className="place-card-top"><button className="back-link" onClick={onClose}><ArrowLeft size={17}/>{backLabel}</button><button className="icon-button" onClick={onClose} aria-label="關閉地點卡片"><X size={20}/></button></div>
    <div className={`place-card-symbol ${place.category}`}><PlaceIcon category={place.category} size={30}/><span>{categoryLabels[place.category]}</span></div>
    <h1 id="place-heading" ref={heading} tabIndex={-1}>{place.name}</h1>
    <p className="place-card-subtitle">{categoryLabels[place.category]}</p>
    <div className={`place-card-actions ${place.routePlaceId?'':'share-only'}`}>
      {place.routePlaceId&&<><button className="button primary" onClick={()=>onEndpoint('to')}><ArrowRight size={17} aria-hidden="true"/>前往這裡</button>
        <button className="button secondary" onClick={()=>onEndpoint('from')}><MapPin size={17} aria-hidden="true"/>從這裡出發</button></>}
      <button className="place-share" onClick={share}><Copy size={17} aria-hidden="true"/>分享</button>
    </div>
    {shareStatus}
    {place.routePlaceId&&<p className="place-route-scope connected">地圖上的館名標示建物中心，路線起終點另有標記。</p>}
    <dl className="place-facts">
      {place.note&&!place.routePlaceId&&<div><dt>位置</dt><dd>{place.note}</dd></div>}
      {place.address&&<div><dt>地址</dt><dd>{place.address}</dd></div>}
      <div><dt>開放時間</dt><dd>{place.openingHours??'暫無資料'}</dd></div>
      <div><dt>輪椅資訊</dt><dd>{wheelchair}</dd></div>
      {place.level&&<div><dt>樓層</dt><dd>{place.level}</dd></div>}
      {place.widthM!==null&&<div><dt>圖資路寬</dt><dd>{place.widthM} 公尺</dd></div>}
      {place.slopePercent!==null&&<div><dt>圖資坡度</dt><dd>{place.slopePercent}%</dd></div>}
    </dl>
    {place.routePlaceId&&<section className="place-entrances"><h2>{mode==='demo'?'試走起終點':'路線入口'}</h2>{entrances.length?<ul>{entrances.map(entrance=><li key={entrance.id}><MapPin size={17}/><div><strong>{entrance.name}</strong><p>{entrance.source}</p>{entrance.verifiedAt&&<small>查核日期 {formatDate(entrance.verifiedAt)}</small>}</div></li>)}</ul>:<p>目前沒有符合條件的路線位置。</p>}</section>}
    <section className="place-photo-section"><h2>地點照片</h2><PhotoGallery photos={place.photos}/></section>
    {nearby.length>0&&<section className="place-nearby"><h2>附近設施<span>直線 250 m 內</span></h2>{nearby.map(p=><button key={p.id} onClick={()=>onChoose(p)}><PlaceIcon category={p.category} size={18}/><span>{p.name}<small>直線 {formatDistance(distance(p.coordinate,place.coordinate))}</small></span><ChevronRight size={16}/></button>)}</section>}
    <details className="field-source">
      <summary>資料說明</summary>
      <p>{source?.label??'地點圖資'} · 取得於 {formatDate(place.retrievedAt)}</p>
      <a href={place.sourceUrl} target="_blank" rel="noreferrer">查看原始來源<ArrowUpRight size={14} aria-hidden="true"/></a>
    </details>
  </article>
}
