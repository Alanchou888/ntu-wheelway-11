import{readFileSync}from'node:fs'
import{describe,it,expect,vi,afterEach}from'vitest'
import{renderToStaticMarkup}from'react-dom/server'
import{clearRecentPlaces,fallbackPlaces,findPlaces,parsePlaceCatalog,placeEndpointPatch,readRecentPlaces,rememberPlace}from'../src/places'
import{PlaceCard,PlaceList}from'../src/PlaceDiscovery'
import{fromHash,toHash}from'../src/routes'
import type{Campus,PlaceCatalog}from'../src/types'
const campus=JSON.parse(readFileSync('public/data/campus.json','utf8')) as Campus
const catalog=parsePlaceCatalog(JSON.parse(readFileSync('public/data/places.json','utf8')))
const library=catalog.places.find(p=>p.id==='library')!,boya=catalog.places.find(p=>p.id==='boya')!
afterEach(()=>vi.unstubAllGlobals())
describe('campus place search and endpoints',()=>{
  it('finds aliases, mixed case and Taiwan character variants',()=>{
    for(const query of ['總圖','台大總圖','ＮＴＵ　Ｌｉｂｒａｒｙ','main library'])expect(findPlaces(catalog.places,query)[0].id).toBe('library')
    for(const query of ['博雅','bOyA'])expect(findPlaces(catalog.places,query)[0].id).toBe('boya')
  })
  it('filters by category and keeps zero matches distinct from missing facilities',()=>{
    expect(findPlaces(catalog.places,'','ramp')).toHaveLength(18)
    expect(findPlaces(catalog.places,'','building').every(p=>p.category==='building')).toBe(true)
    expect(findPlaces(catalog.places,'this location does not exist')).toEqual([])
    expect(findPlaces(catalog.places,'','toilet')).toEqual([])
  })
  it('keeps the two routable buildings first without inferring other entrances',()=>{
    expect(findPlaces(catalog.places).slice(0,2).map(p=>p.id)).toEqual(['library','boya'])
    expect(catalog.places.filter(p=>p.routePlaceId)).toHaveLength(2)
    expect(catalog.places.every(p=>p.verifiedAt===null)).toBe(true)
  })
  it('configures direction explicitly and leaves routing policy in the parent state',()=>{
    expect(placeEndpointPatch(library,'from')?.origin).toBe('library')
    expect(placeEndpointPatch(library,'to')?.origin).toBe('boya')
    expect(placeEndpointPatch(boya,'from')?.origin).toBe('boya')
    expect(placeEndpointPatch(boya,'to')?.origin).toBe('library')
    expect(placeEndpointPatch(catalog.places.find(p=>!p.routePlaceId)!,'to')).toBeNull()
    expect(placeEndpointPatch(boya,'to')).not.toHaveProperty('mode')
    expect(placeEndpointPatch(boya,'to')).not.toHaveProperty('limits')
  })
  it('round trips place and category links while preserving old route links',()=>{
    const state={...fromHash('#screen=confirm&from=boya&mode=survey&maxSlope=2'),placeId:'context-way/191360829',category:'building' as const}
    expect(fromHash(toHash(state))).toEqual(state)
    expect(fromHash('#screen=setup')).not.toHaveProperty('placeId')
    expect(fromHash('#place=%3Cscript%3E&category=fake')).not.toHaveProperty('placeId')
    expect(fromHash('#category=fake')).not.toHaveProperty('category')
    expect(toHash(state)).not.toMatch(/accuracy|longitude|latitude/)
  })
  it('uses existing endpoint and ramp data if the optional catalog fails',()=>{
    const fallback=fallbackPlaces(campus)
    expect(fallback.places).toHaveLength(20)
    expect(fallback.places.filter(p=>p.category==='building')).toHaveLength(2)
    expect(fallback.places.every(p=>p.verifiedAt===null)).toBe(true)
  })
  it('rejects invalid catalogs instead of partially presenting trusted claims',()=>{
    for(const patch of [{coordinate:[200,25]},{category:'fake'},{sourceUrl:'javascript:alert(1)'},{verifiedAt:'2026-10-21'},{routePlaceId:'other'},{widthM:NaN},{openingHours:20}]){
      const value=structuredClone(catalog);Object.assign(value.places[0],patch);expect(()=>parsePlaceCatalog(value)).toThrow()
    }
    const duplicate=structuredClone(catalog);duplicate.places.push(duplicate.places[0]);expect(()=>parsePlaceCatalog(duplicate)).toThrow()
  })
  it('bounds recent place IDs, filters removed IDs and handles unavailable storage',()=>{
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)})
    let ids:string[]=[];for(const p of catalog.places.slice(0,15))ids=rememberPlace(p.id,ids).ids
    expect(ids).toHaveLength(8);expect(rememberPlace(ids[2],ids).ids[0]).toBe(ids[2]);expect(readRecentPlaces(catalog.places)).toHaveLength(8)
    expect(readRecentPlaces([library,boya])).toEqual([]);expect(clearRecentPlaces()).toBe(true);expect(readRecentPlaces(catalog.places)).toEqual([])
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')},removeItem:()=>{throw Error('blocked')}})
    expect(readRecentPlaces(catalog.places)).toEqual([]);expect(rememberPlace('library',[]).saved).toBe(false);expect(clearRecentPlaces()).toBe(false)
  })
})
describe('place information disclosure',()=>{
  it('shows unknown hours, separate demo entrances and unverified sources',()=>{
    const html=renderToStaticMarkup(<PlaceCard place={library} catalog={catalog} entrances={[]} mode="demo" onClose={()=>{}} onEndpoint={()=>{}} onChoose={()=>{}} shareUrl="https://example.test/#place=library"/>)
    expect(html).toContain('來源尚未提供');expect(html).toContain('建物中心與路線入口分開標示');expect(html).toContain('尚未實地查核');expect(html).toContain('待補實景照片')
  })
  it('disables route actions on unconnected points',()=>{
    const html=renderToStaticMarkup(<PlaceCard place={catalog.places.find(p=>!p.routePlaceId)!} catalog={catalog} entrances={[]} mode="demo" onClose={()=>{}} onEndpoint={()=>{}} onChoose={()=>{}} shareUrl="https://example.test/"/>)
    expect(html.match(/disabled=""/g)).toHaveLength(2);expect(html).toContain('尚未接入可通行路網')
  })
  it('explains empty public records and provides a usable return action',()=>{
    const html=renderToStaticMarkup(<PlaceList catalog={catalog as PlaceCatalog} results={[]} title="附近廁所" onChoose={()=>{}} onBack={()=>{}} loading={false} error={false} onRetry={()=>{}}/>)
    expect(html).toContain('空白結果不代表現場沒有設施');expect(html).toContain('返回路線規劃');expect(html).toContain('暫時未取得')
  })
})
