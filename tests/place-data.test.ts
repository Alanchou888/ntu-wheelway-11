import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,it,expect}from'vitest'
import{buildPlaceCatalog,normalizeAmenities,refreshPlaces,validatePlaceCatalog}from'../scripts/refresh-places.mjs'
const campus=JSON.parse(await readFile('public/data/campus.json','utf8'))
describe('place data snapshots',()=>{
  it('maps only explicit public amenity tags and keeps unknowns',()=>{
    const rows=[{type:'node',id:1,lon:121.537,lat:25.018,tags:{amenity:'toilets',wheelchair:'yes'}},{type:'way',id:2,center:{lon:121.538,lat:25.019},tags:{amenity:'drinking_water',opening_hours:'24/7'}},{type:'node',id:3,lon:121.537,lat:25.018,tags:{highway:'elevator',level:'0;1'}},{type:'node',id:4,lon:121.537,lat:25.018,tags:{amenity:'bench'}}]
    const places=normalizeAmenities({elements:rows})
    expect(places).toHaveLength(4);expect(places.map(p=>p.category).sort()).toEqual(['elevator','rest','toilet','water'])
    expect(places.every(p=>p.verifiedAt===null&&p.routePlaceId===null)).toBe(true)
    expect(places.find(p=>p.id==='osm-node-1').wheelchair).toBe('yes')
    expect(places.find(p=>p.id==='osm-node-1').openingHours).toBeNull()
  })
  it('excludes private, out of scope, invalid, duplicated and nonworking amenities',()=>{
    const row={type:'node',id:10,lon:121.537,lat:25.018,tags:{amenity:'bench'}}
    const value={elements:[row,row,{...row,id:11,tags:{amenity:'bench',access:'private'}},{...row,id:12,lon:0},{...row,id:13,tags:{amenity:'bench',disused:'yes'}},{...row,id:14,tags:{amenity:'fountain'}},{...row,type:'other',id:15}]}
    expect(normalizeAmenities(value)).toHaveLength(1)
    expect(()=>normalizeAmenities({elements:[],remark:'runtime timeout'})).toThrow()
  })
  it('preserves source dates and building centers as unverified locations',()=>{
    const snapshot=buildPlaceCatalog(campus)
    expect(snapshot.places.length).toBeGreaterThan(50)
    expect(snapshot.places.find(p=>p.id==='library').coordinate).toEqual(campus.places[0].coordinate)
    expect(snapshot.places.every(p=>p.verifiedAt===null&&p.retrievedAt===snapshot.sources.find(s=>s.id===p.sourceId).retrievedAt)).toBe(true)
    const broken=structuredClone(snapshot);broken.places[0].verifiedAt='2026-10-21';expect(()=>validatePlaceCatalog(broken)).toThrow()
  })
  it('keeps an existing snapshot byte for byte when no amenity download ever succeeded',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'wheelway-places-')),path=join(dir,'places.json')
    try{
      const original={...buildPlaceCatalog(campus),amenitiesStatus:'unavailable'};const serialized=JSON.stringify(original)+'\n';await writeFile(path,serialized)
      const result=await refreshPlaces({outputPath:path,fetchImpl:async()=>{throw Error('offline')}})
      expect(result.cached).toBe(true);expect(await readFile(path,'utf8')).toBe(serialized)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('retains a previously fetched amenity with its acquisition date on refresh failure',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'wheelway-places-')),path=join(dir,'places.json')
    try{
      const source={id:'osm-amenities',label:'OSM amenities',url:'https://overpass-api.de/api/interpreter',retrievedAt:'2026-10-19T00:00:00Z',status:'ok'}
      const amenities=normalizeAmenities({elements:[{type:'node',id:20,lon:121.537,lat:25.018,tags:{amenity:'toilets'}}]})
      await writeFile(path,JSON.stringify(buildPlaceCatalog(campus,amenities,source)))
      const result=await refreshPlaces({outputPath:path,now:new Date('2026-10-21'),fetchImpl:async()=>{throw Error('offline')}})
      expect(result.snapshot.sources.find(s=>s.id==='osm-amenities')).toMatchObject({status:'cached',retrievedAt:source.retrievedAt})
      expect(result.snapshot.places.find(p=>p.id==='osm-node-20').retrievedAt).toBe(source.retrievedAt)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('falls back to the documented mirror and accepts a successful empty category result',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'wheelway-places-')),path=join(dir,'places.json');let calls=0
    try{
      const result=await refreshPlaces({outputPath:path,fetchImpl:async()=>{calls++;if(calls===1)return{ok:false,status:502};return{ok:true,json:async()=>({elements:[]})}}})
      expect(calls).toBe(2);expect(result.snapshot.amenitiesStatus).toBe('ok');expect(result.snapshot.sources.find(s=>s.id==='osm-amenities').url).toBe('https://overpass.private.coffee/api/interpreter')
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})
