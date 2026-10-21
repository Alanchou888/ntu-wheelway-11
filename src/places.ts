import type {Campus,CatalogCategory,CatalogPlace,NavigationState,PlaceCatalog} from './types'
import {distance} from './routes'

export const categoryLabels:Record<CatalogCategory,string>={building:'建物',toilet:'廁所',elevator:'電梯',water:'飲水',rest:'休息',ramp:'坡道',landmark:'地標'}
export const catalogCategories=Object.keys(categoryLabels) as CatalogCategory[]
const canonical=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en').replaceAll('臺','台').replace(/[\s\p{P}]/gu,'')
export function parsePlaceCatalog(value:unknown):PlaceCatalog{
  if(!value||typeof value!=='object')throw new Error('地點資料格式不完整')
  const data=value as PlaceCatalog
  if(data.version!==1||!Array.isArray(data.places)||!data.places.length||data.places.length>500||!Array.isArray(data.sources)||!Array.isArray(data.bbox)||data.bbox.length!==4||!data.bbox.every(Number.isFinite))throw new Error('地點資料格式不完整')
  const ids=new Set<string>()
  for(const p of data.places){
    if(!p||typeof p.id!=='string'||!p.id||p.id.length>120||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!catalogCategories.includes(p.category)||!Array.isArray(p.coordinate)||p.coordinate.length!==2||!p.coordinate.every(Number.isFinite)||Math.abs(p.coordinate[0])>180||Math.abs(p.coordinate[1])>90||!Array.isArray(p.aliases)||!p.aliases.every(a=>typeof a==='string')||p.verifiedAt!==null||!Number.isFinite(Date.parse(p.retrievedAt))||!data.sources.some(s=>s.id===p.sourceId)||!/^https:\/\//.test(p.sourceUrl)||p.routePlaceId!==null&&(!['library','boya'].includes(p.routePlaceId)||p.id!==p.routePlaceId))throw new Error('地點資料有無法使用的欄位')
    for(const key of ['address','openingHours','wheelchair','level','indoor','contextId','note'] as const)if(p[key]!==null&&typeof p[key]!=='string')throw new Error('地點說明格式不完整')
    for(const key of ['widthM','slopePercent'] as const)if(p[key]!==null&&(!Number.isFinite(p[key])||p[key]!<0))throw new Error('地點量測格式不完整')
    if(!Array.isArray(p.photos)||p.photos.some(photo=>typeof photo.src!=='string'||!/^https:\/\/|^\/(?!\/)/.test(photo.src)||typeof photo.alt!=='string'||typeof photo.caption!=='string'))throw new Error('地點照片格式不完整')
    ids.add(p.id)
  }
  if(!['library','boya'].every(id=>data.places.some(p=>p.id===id&&p.routePlaceId===id)))throw new Error('缺少校園地點')
  return data
}
export function fallbackPlaces(campus:Campus):PlaceCatalog{
  const base={address:null,openingHours:null,wheelchair:null,level:null,indoor:null,widthM:null,slopePercent:null,photos:[],verifiedAt:null,contextId:null}
  const source=(id:string)=>campus.sources.find(s=>s.id===id)!
  return{version:1,bbox:[121.534,25.014,121.543,25.021],sources:campus.sources,places:[...campus.places.map(p=>({...base,id:p.id,name:p.name,aliases:p.id==='library'?['總圖','NTU Library']:['博雅','Boya'],category:'building' as const,coordinate:p.coordinate,routePlaceId:p.id,sourceId:p.sourceId,sourceUrl:source(p.sourceId).url,retrievedAt:source(p.sourceId).retrievedAt,note:'建物中心位置，入口需另外確認。'})),...campus.facilities.map(p=>({...base,id:p.id,name:p.name,aliases:['坡道','斜坡道'],category:'ramp' as const,coordinate:p.coordinate,routePlaceId:null,sourceId:p.sourceId,sourceUrl:source(p.sourceId).url,retrievedAt:source(p.sourceId).retrievedAt,widthM:p.widthM,slopePercent:p.slopePercent,note:'公開斜坡道，尚未實地查核。'}))]}
}
export function findPlaces(places:CatalogPlace[],query='',category?:CatalogCategory):CatalogPlace[]{
  const words=query.trim().split(/\s+/).filter(Boolean).map(canonical).filter(Boolean)
  const reference=places.find(p=>p.id==='library')?.coordinate
  const score=(p:CatalogPlace)=>{const names=[p.name,...p.aliases].map(canonical),whole=canonical(query);return words.length?(names[0]===whole?0:names.includes(whole)?1:words.some(w=>names.some(name=>name.startsWith(w)))?2:3):p.routePlaceId?0:1}
  return places.filter(p=>!category||p.category===category).filter(p=>{const haystack=canonical([p.name,...p.aliases,categoryLabels[p.category],p.address??''].join(' '));return words.every(w=>haystack.includes(w))}).sort((a,b)=>score(a)-score(b)||(reference?distance(a.coordinate,reference)-distance(b.coordinate,reference):0)||a.id.localeCompare(b.id))
}
const RECENT_KEY='wheelway-recent-places-v1'
export function readRecentPlaces(places:CatalogPlace[]):string[]{
  try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)??'[]');return Array.isArray(value)?[...new Set(value.filter(id=>typeof id==='string'&&places.some(p=>p.id===id)))].slice(0,8):[]}catch{return[]}
}
export function rememberPlace(id:string,previous:string[]):{ids:string[];saved:boolean}{
  const ids=[id,...previous.filter(value=>value!==id)].slice(0,8)
  try{localStorage.setItem(RECENT_KEY,JSON.stringify(ids));return{ids,saved:true}}catch{return{ids,saved:false}}
}
export function clearRecentPlaces(){try{localStorage.removeItem(RECENT_KEY);return true}catch{return false}}
export function placeEndpointPatch(place:CatalogPlace,action:'from'|'to'):Partial<NavigationState>|null{
  if(!place.routePlaceId)return null
  return{screen:'setup',origin:action==='from'?place.routePlaceId:place.routePlaceId==='library'?'boya':'library',routeId:'',segmentId:'',placeId:undefined,category:undefined}
}
