import {readFile,writeFile,rename,rm} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {dirname,resolve} from 'node:path'
import {FACILITY_BBOX,inBbox,validCoordinate} from './data-normalization.mjs'
import {addCampusAttractions, attractionSource, campusAttractions} from './campus-attractions.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export const placesPath=resolve(root,'public/data/places.json')
export const CATALOG_BBOX=[121.5334,25.0135,121.543,25.022]
export const OVERPASS_ENDPOINT='https://overpass-api.de/api/interpreter'
export const OVERPASS_MIRROR='https://overpass.private.coffee/api/interpreter'
export const OSM_MAP_ENDPOINT='https://api.openstreetmap.org/api/0.6/map.json?bbox=121.535,25.0165,121.5417,25.0205'
const box=[FACILITY_BBOX[1],FACILITY_BBOX[0],FACILITY_BBOX[3],FACILITY_BBOX[2]].join(',')
export const AMENITY_QUERY=`[out:json][timeout:25];(nwr(${box})[amenity~"^(toilets|drinking_water|bench|shelter)$"];nwr(${box})[highway=elevator];);out center tags;`
const kinds={toilets:'toilet',drinking_water:'water',bench:'rest',shelter:'rest'}
const labels={toilet:'廁所',water:'飲水點',rest:'休息設施',elevator:'電梯'}
const common={address:null,openingHours:null,wheelchair:null,level:null,indoor:null,widthM:null,slopePercent:null,routePlaceId:null,contextId:null,verifiedAt:null,photos:[]}
const text=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,300):null
const aliases=tags=>[...new Set(['name:en','name:zh','alt_name','short_name'].flatMap(key=>(text(tags[key])??'').split(';')).filter(Boolean))]
function representative(geometry){
  const points=geometry?.type==='Polygon'?geometry.coordinates[0]:geometry?.type==='MultiPolygon'?geometry.coordinates.flatMap(p=>p[0]):[]
  if(!points.length||!points.every(validCoordinate))return null
  return [(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2]
}
export function normalizeAmenities(payload){
  if(!payload||!Array.isArray(payload.elements)||payload.remark)throw new Error('Incomplete Overpass response')
  const ids=new Set(),places=[]
  for(const row of payload.elements){
    const tags=row.tags??{},category=tags.highway==='elevator'?'elevator':kinds[tags.amenity]
    const coordinate=row.type==='node'?[row.lon,row.lat]:[row.center?.lon,row.center?.lat]
    const sourceId=`${row.type}/${row.id}`
    if(!category||!['node','way','relation'].includes(row.type)||!/^\d+$/.test(String(row.id))||!inBbox(coordinate,FACILITY_BBOX)||ids.has(sourceId)||['private','no'].includes(tags.access)||tags.disused==='yes'||tags.abandoned==='yes')continue
    ids.add(sourceId)
    const label = tags.amenity === 'bench' ? '座椅' : tags.amenity === 'shelter' ? '遮蔽處' : labels[category]
    const note = tags.access === 'customers' ? '公開圖資標記為供顧客使用。' : tags.access === 'permit' ? '公開圖資標記為須取得許可。' : '公開設施點位，尚未由團隊實地查核。'
    places.push({...common,id:`osm-${row.type}-${row.id}`,name:text(tags['name:zh'])??text(tags.name)??label,aliases:aliases(tags),category,coordinate,sourceId:'osm-amenities',sourceUrl:`https://www.openstreetmap.org/${sourceId}`,address:text(tags['addr:full'])??text([tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join('')),openingHours:text(tags.opening_hours),wheelchair:text(tags.wheelchair),level:text(tags['level:ref'])??text(tags.level),indoor:text(tags.indoor),note})
  }
  return places.sort((a,b)=>a.id.localeCompare(b.id))
}
function normalizeMapAmenities(payload){
  if(!Array.isArray(payload?.elements)||payload.remark)throw new Error('Incomplete OSM map response')
  const nodes=new Map(payload.elements.filter(row=>row.type==='node').map(row=>[row.id,[row.lon,row.lat]]))
  const elements=payload.elements.filter(row=>row.tags).map(row=>{
    if(row.type!=='way'||!row.nodes?.length)return row
    const points=row.nodes.map(id=>nodes.get(id))
    if(!points.every(validCoordinate))return row
    const [lon,lat]=representative({type:'Polygon',coordinates:[points]})
    return {...row,center:{lon,lat}}
  })
  return normalizeAmenities({elements})
}
export function buildPlaceCatalog(campus,amenities=[],amenitySource=null){
  const sourceById=Object.fromEntries(campus.sources.map(source=>[source.id,source]))
  const places=campus.places.map(place=>({...common,id:place.id,name:place.name,aliases:place.id==='library'?['總圖','總圖書館','NTU Library','Main Library']:['博雅','Boya'],category:'building',coordinate:place.coordinate,sourceId:'ntu',sourceUrl:sourceById.ntu.url,routePlaceId:place.id,note:'臺大 API 建物中心位置，入口需另外確認。'}))
  for(const feature of campus.context?.features??[]){
    const p=feature.properties??{},name=text(p.name),coordinate=representative(feature.geometry)
    const curated = campusAttractions.find(attraction => attraction.osm && attraction.osm === feature.id)
    if (curated && curated.id !== `context-${feature.id}`) continue
    if(!name||!['building','green','water'].includes(p.kind)||!inBbox(coordinate,FACILITY_BBOX)||places.some(place=>[place.name,...place.aliases].includes(name)))continue
    places.push({...common,id:`context-${feature.id}`,name,aliases:[],category:p.kind==='building'?'building':'landmark',coordinate,sourceId:'osm-context',sourceUrl:`https://www.openstreetmap.org/${feature.id}`,contextId:String(feature.id),note:p.kind==='building'?'建物幾何的代表位置，尚未取得可通行入口。':'公開地標位置，尚未查核通行條件。'})
  }
  for(const facility of campus.facilities)places.push({...common,id:facility.id,name:facility.name,aliases:['斜坡道','坡道'],category:'ramp',coordinate:facility.coordinate,sourceId:'wheelroute',sourceUrl:sourceById.wheelroute.url,widthM:facility.widthM,slopePercent:facility.slopePercent,note:'輪行臺北公開斜坡道，原始量測與目前通行狀態待查核。'})
  addCampusAttractions(places, common)
  const sources=[sourceById.ntu,sourceById.wheelroute,{...sourceById.osm,id:'osm-context',label:'OpenStreetMap 校園建物與地標'},attractionSource]
  if(amenitySource)sources.push(amenitySource)
  places.push(...amenities)
  for(const place of places)place.retrievedAt=sources.find(source=>source.id===place.sourceId)?.retrievedAt??null
  return validatePlaceCatalog({version:1,bbox:CATALOG_BBOX,sources,places})
}
export function validatePlaceCatalog(value){
  if(value?.version!==1||!Array.isArray(value.places)||!value.places.length||!Array.isArray(value.sources))throw new Error('Invalid place catalog')
  const ids=new Set(),categories=['building','toilet','elevator','water','rest','ramp','landmark']
  if(!['library','boya'].every(id=>value.places.some(p=>p.id===id&&p.routePlaceId===id)))throw new Error('Missing campus endpoints')
  for(const p of value.places){
    if(ids.has(p.id)||!p.id||!text(p.name)||!categories.includes(p.category)||!inBbox(p.coordinate,CATALOG_BBOX)||p.verifiedAt!==null||!/^https:\/\//.test(p.sourceUrl)||!value.sources.some(s=>s.id===p.sourceId&&s.retrievedAt===p.retrievedAt)||!Number.isFinite(Date.parse(p.retrievedAt)))throw new Error('Invalid place entry')
    ids.add(p.id)
  }
  return value
}
export async function refreshPlaces({outputPath=placesPath,campusPath=resolve(root,'public/data/campus.json'),fetchImpl=fetch,now=new Date(),offline=false}={}){
  const campus=JSON.parse(await readFile(campusPath,'utf8'))
  let previous=null
  try{previous=validatePlaceCatalog(JSON.parse(await readFile(outputPath,'utf8')))}catch{}
  if(offline){if(!previous)throw new Error('No valid place snapshot available');return{snapshot:previous,cached:true}}
  let amenities,source,cached=false,unavailable=false
  try{
    let endpoint=OVERPASS_ENDPOINT,lastError
    for(const url of [OVERPASS_ENDPOINT,OVERPASS_MIRROR]){
      try{
        const response=await fetchImpl(`${url}?${new URLSearchParams({data:AMENITY_QUERY})}`,{signal:AbortSignal.timeout(25_000),headers:{'User-Agent':'NTU-Wheelway/2.4 (bounded public campus snapshot)'}})
        if(!response.ok)throw new Error(`HTTP ${response.status}`)
        amenities=normalizeAmenities(await response.json());endpoint=url;break
      }catch(error){lastError=error}
    }
    if(!amenities){
      const previousSource=previous?.sources.find(s=>s.id==='osm-amenities')
      if(previousSource&&previousSource.url!==OSM_MAP_ENDPOINT)throw lastError
      const response=await fetchImpl(OSM_MAP_ENDPOINT,{signal:AbortSignal.timeout(15_000),headers:{'User-Agent':'NTU-Wheelway/2.5 (bounded campus snapshot)'}})
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
      amenities=normalizeMapAmenities(await response.json())
      endpoint=OSM_MAP_ENDPOINT
    }
    source={id:'osm-amenities',label:'OpenStreetMap 周邊設施',url:endpoint,retrievedAt:now.toISOString(),status:'ok',note:'固定校園範圍的公開圖資快照。設施樓層、使用限制和輪椅資訊以來源標記為準。'}
  }catch(error){
    const oldSource=previous?.sources.find(s=>s.id==='osm-amenities')
    if(!oldSource){
      if(previous)return{snapshot:previous,cached:true}
      amenities=[];source=null;unavailable=true;cached=true
    }else{
      amenities=previous.places.filter(p=>p.sourceId==='osm-amenities')
      source={...oldSource,status:'cached',note:`更新未成功，保留 ${oldSource.retrievedAt} 的設施快照。公開標記仍待實勘。`};cached=true
    }
  }
  const snapshot=buildPlaceCatalog(campus,amenities,source)
  const rampSource=previous?.sources.find(item=>item.id==='taipei-public-ramps')
  if(rampSource){
    snapshot.sources.push(rampSource)
    snapshot.places.push(...previous.places.filter(place=>place.sourceId===rampSource.id))
    validatePlaceCatalog(snapshot)
  }
  snapshot.amenitiesStatus=unavailable?'unavailable':cached?'cached':'ok'
  const temp=`${outputPath}.${process.pid}.tmp`
  try{await writeFile(temp,JSON.stringify(snapshot)+'\n','utf8');await rename(temp,outputPath)}finally{await rm(temp,{force:true}).catch(()=>{})}
  return{snapshot,cached}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2)
  if(args.some(arg=>arg!=='--offline'))throw new Error('Usage: node scripts/refresh-places.mjs [--offline]')
  try{const {snapshot,cached}=await refreshPlaces({offline:args.includes('--offline')});console.log(JSON.stringify({places:snapshot.places.length,categories:Object.fromEntries(['building','toilet','elevator','water','rest','ramp','landmark'].map(category=>[category,snapshot.places.filter(p=>p.category===category).length])),cached,sources:snapshot.sources.map(s=>({id:s.id,retrievedAt:s.retrievedAt,status:s.status}))},null,2))}catch(error){console.error(error.message);process.exitCode=1}
}
