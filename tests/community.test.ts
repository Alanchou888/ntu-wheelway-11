import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { communityApi, imageType } from '../server/community'
import type { CommunityEnv } from '../server/community'
import { communitySummary, reportState, validateReport } from '../src/community-model'
import type { CommunityReport } from '../src/community-model'
import type { Coordinate } from '../src/types'

const ids=new Set(['gentle-1','direct-2'])
const input=()=>({segmentId:'gentle-1',category:'parking',impact:'difficult',message:'Automated test fixture only',authorName:'TEST',observedAt:new Date().toISOString()})
let sqlite:DatabaseSync
let env:CommunityEnv
let files:Map<string,{bytes:Uint8Array;httpMetadata:{contentType:string}}>
function request(path:string,method='GET',value?:unknown,actor:string|null='test-a',headers:Record<string,string>={}){
  return new Request('https://test.invalid/api/community/'+path,{method,headers:{'X-Wheelway-Action':'community',Origin:'https://test.invalid',...(actor?{'oai-authenticated-user-id':actor}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(value!==undefined?{body:JSON.stringify(value)}:{})})
}
const call=(path:string,method='GET',value?:unknown,actor:string|null='test-a',headers:Record<string,string>={})=>communityApi(request(path,method,value,actor,headers),env,ids)
const create=async(actor='test-a',patch={})=>{const response=await call('reports','POST',{...input(),...patch},actor);expect(response.status).toBe(201);return (await response.json()).id as string}
const list=async(actor:string|null='test-a')=>(await(await call('reports','GET',undefined,actor)).json()).reports as CommunityReport[]

beforeEach(()=>{
  sqlite=new DatabaseSync(':memory:')
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'))
  for(const entry of journal.entries) sqlite.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`,import.meta.url),'utf8'))
  const db={prepare(sql:string){let values:unknown[]=[];const prepared={bind(...args:unknown[]){values=args;return prepared},async first(){return sqlite.prepare(sql).get(...values as never[])??null},async all(){return {results:sqlite.prepare(sql).all(...values as never[]),success:true}},async run(){return sqlite.prepare(sql).run(...values as never[])}};return prepared}}
  files=new Map()
  const bucket={async put(key:string,bytes:Uint8Array,options:{httpMetadata:{contentType:string}}){files.set(key,{bytes,httpMetadata:options.httpMetadata})},async get(key:string){const item=files.get(key);return item?{body:item.bytes,httpMetadata:item.httpMetadata}:null},async delete(key:string){files.delete(key)}}
  env={DB:db,BUCKET:bucket,COMMUNITY_ADMIN_TOKEN:'test-secret'} as unknown as CommunityEnv
})
afterEach(()=>sqlite.close())

describe('community public API and ownership',()=>{
  it('stores an optional user-chosen point and keeps legacy reports without a point',async()=>{
    const lines=new Map<string,Coordinate[]>([['gentle-1',[[121.538,25.018],[121.539,25.018]]]])
    const response=await communityApi(request('reports','POST',{...input(),coordinate:[121.53855555,25.01801]}),env,ids,lines)
    expect(response.status).toBe(201)
    expect((await list(null))[0].coordinate).toEqual([121.538556,25.01801])
    await create('legacy-user')
    expect((await list(null)).find(r=>r.authorName==='TEST'&&r.coordinate===null)).toBeTruthy()
  })
  it('rejects invalid coordinates and points outside the chosen segment on the server',async()=>{
    const lines=new Map<string,Coordinate[]>([['gentle-1',[[121.538,25.018],[121.539,25.018]]]])
    for(const coordinate of [[121.538,25.03],[0,0],['121.538',25.018],[121.538],[190,91],{lat:25.018,lng:121.538}]){
      const response=await communityApi(request('reports','POST',{...input(),coordinate}),env,ids,lines)
      expect(response.status).toBe(400)
    }
    expect(await list(null)).toHaveLength(0)
  })
  it('allows anonymous reads and requires sign-in for writes',async()=>{
    expect((await call('reports','GET',undefined,null)).status).toBe(200)
    expect((await call('reports','POST',input(),null)).status).toBe(401)
    expect((await(await call('session','GET',undefined,null)).json()).signedIn).toBe(false)
  })
  it('shares one durable report across identities without exposing identity keys',async()=>{
    await create()
    const own=await list();const other=await list('test-b');const anonymous=await list(null)
    expect(own[0].own).toBe(true);expect(other[0].own).toBe(false);expect(anonymous[0].message).toBe(input().message)
    const encoded=JSON.stringify(anonymous)
    expect(encoded).not.toContain('author_key');expect(encoded).not.toContain('test-a');expect(encoded).not.toContain('email')
  })
  it('rejects cross-origin and unsupported requests',async()=>{
    expect((await call('reports','POST',input(),'test-a',{Origin:'https://other.invalid'})).status).toBe(403)
    expect((await call('reports','POST',input(),'test-a',{'Sec-Fetch-Site':'cross-site'})).status).toBe(403)
    expect((await call('reports','POST',input(),'test-a',{'X-Wheelway-Action':''})).status).toBe(403)
    expect((await call('missing')).status).toBe(404)
  })
  it('rejects unknown segments, categories and future observations',async()=>{
    for(const patch of [{segmentId:'not-a-road'},{category:'__proto__'},{impact:'safe'},{observedAt:'2030-01-01'},{message:'a'}]){
      expect((await call('reports','POST',{...input(),...patch})).status).toBe(400)
    }
  })
  it('prevents immediate duplicate reports',async()=>{
    await create()
    expect((await call('reports','POST',input())).status).toBe(409)
    expect(await list()).toHaveLength(1)
  })
  it('keeps the feed readable above the D1 parameter limit and bounds recent notes',async()=>{
    for(let n=0;n<105;n++)await create(`test-${n}`)
    expect(await list(null)).toHaveLength(105)
    const id=(await list())[0].id
    for(let n=0;n<12;n++)await call(`reports/${id}/reaction`,'POST',{reaction:'exists',note:`TEST ${n}`},`observer-${n}`)
    const report=(await list())[0]
    expect(report.counts.exists).toBe(12);expect(report.updates).toHaveLength(8)
  })
  it('stores text literally without SQL interpolation',async()=>{
    const id=await create('test-a',{message:"<script>alert('x')</script> '); DROP TABLE community_reports; --"})
    expect((await list())[0].id).toBe(id)
    expect((await list())[0].message).toContain('<script>')
  })
  it('allows only the author to withdraw and makes associated photos unavailable',async()=>{
    const id=await create()
    expect((await call(`reports/${id}`,'DELETE',undefined,'test-b')).status).toBe(403)
    expect((await call(`reports/${id}`,'DELETE')).status).toBe(200)
    expect(await list(null)).toHaveLength(0)
    expect((await call(`photos/${id}`)).status).toBe(404)
  })
})

describe('community confirmations and moderation',()=>{
  it('does not allow authors to confirm their own report',async()=>{
    const id=await create()
    expect((await call(`reports/${id}/reaction`,'POST',{reaction:'exists'})).status).toBe(400)
  })
  it('counts each other account once and replaces its previous reaction',async()=>{
    const id=await create()
    expect((await call(`reports/${id}/reaction`,'POST',{reaction:'exists',note:'TEST observation'},'test-b')).status).toBe(200)
    expect((await list())[0].counts.exists).toBe(1)
    await call(`reports/${id}/reaction`,'POST',{reaction:'resolved'},'test-b')
    const report=(await list('test-b'))[0]
    expect(report.counts).toEqual({exists:0,resolved:1,different:0});expect(report.myReaction).toBe('resolved')
    expect(report.updates).toHaveLength(1)
  })
  it('preserves conflicting observations without promoting the route to verified',async()=>{
    const id=await create()
    await call(`reports/${id}/reaction`,'POST',{reaction:'different'},'test-b')
    const report=(await list())[0]
    expect(reportState(report).kind).toBe('disputed')
    expect(report).not.toHaveProperty('verifiedAt')
    expect((await list(null))).toHaveLength(1)
  })
  it('requires a reason to flag and restricts moderation to the secret',async()=>{
    const id=await create()
    expect((await call(`reports/${id}/flag`,'POST',{reason:'x'},'test-b')).status).toBe(400)
    expect((await call(`reports/${id}/flag`,'POST',{reason:'TEST spam'},'test-b')).status).toBe(200)
    expect((await call('admin')).status).toBe(403)
    const response=await call('admin','GET',undefined,null,{Authorization:'Bearer test-secret'})
    expect((await response.json()).reports[0].flagCount).toBe(1)
  })
  it('can hide and restore content, but cannot restore an author withdrawal',async()=>{
    const id=await create();const auth={Authorization:'Bearer test-secret'}
    expect((await call(`admin/${id}`,'POST',{status:'hidden'},null,auth)).status).toBe(200)
    expect(await list()).toHaveLength(0)
    expect((await call(`reports/${id}/reaction`,'POST',{reaction:'exists'},'test-b')).status).toBe(404)
    await call(`admin/${id}`,'POST',{status:'visible'},null,auth)
    expect(await list()).toHaveLength(1)
    await call(`reports/${id}`,'DELETE')
    expect((await call(`admin/${id}`,'POST',{status:'visible'},null,auth)).status).toBe(404)
  })
  it('enforces an atomic per-account write limit',async()=>{
    for(let n=0;n<10;n++){
      const id=await create('test-a')
      await call(`reports/${id}`,'DELETE')
    }
    expect((await call('reports','POST',input())).status).toBe(429)
    expect((await call('reports','POST',input(),'test-b')).status).toBe(201)
  })
})

describe('community photos and expiry',()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10,...new Array(24).fill(0)])
  const upload=(id:string,bytes:Uint8Array,mime='image/png',actor='test-a')=>communityApi(new Request(`https://test.invalid/api/community/reports/${id}/photo`,{method:'PUT',body:bytes,headers:{'oai-authenticated-user-id':actor,'X-Wheelway-Action':'community',Origin:'https://test.invalid','Content-Type':mime}}),env,ids)
  it('uploads one allowed image, serves it to another visitor, and deletes it on withdrawal',async()=>{
    const id=await create()
    expect((await upload(id,png)).status).toBe(200)
    expect((await list('test-b'))[0].photoUrl).toBe(`/api/community/photos/${id}`)
    const photo=await call(`photos/${id}`,'GET',undefined,null)
    expect(photo.headers.get('Content-Type')).toBe('image/png');expect(new Uint8Array(await photo.arrayBuffer())).toEqual(png)
    expect((await upload(id,png)).status).toBe(200)
    expect(files.size).toBe(1)
    await call(`reports/${id}`,'DELETE');expect(files.size).toBe(0)
  })
  it('rejects someone else’s upload, executable images, MIME mismatch and oversized files',async()=>{
    const id=await create()
    expect((await upload(id,png,'image/png','test-b')).status).toBe(403)
    expect((await upload(id,new TextEncoder().encode('<svg onload="alert(1)"></svg>'),'image/svg+xml')).status).toBe(415)
    expect((await upload(id,png,'image/jpeg')).status).toBe(415)
    expect((await upload(id,new Uint8Array(2*1024*1024+1))).status).toBe(413)
    expect(imageType(new Uint8Array([255,216,255]))).toBe('image/jpeg')
  })
  it('expires temporary reports without treating them as cleared',async()=>{
    await create('test-a',{observedAt:new Date(Date.now()-7*3_600_000).toISOString()})
    const report=(await list())[0]
    expect(reportState(report)).toEqual({label:'待重新確認',kind:'stale'})
    expect(communitySummary([report],ids)).toEqual({total:1,recent:0,blocked:0})
  })
  it('uses a new existence confirmation to renew a stale observation',async()=>{
    const id=await create('test-a',{observedAt:new Date(Date.now()-7*3_600_000).toISOString()})
    await call(`reports/${id}/reaction`,'POST',{reaction:'exists'},'test-b')
    expect(reportState((await list())[0]).kind).toBe('active')
  })
  it('keeps long-lived surface observations longer than temporary congestion',()=>{
    const now=Date.now(),base={observedAt:new Date(now-24*3_600_000).toISOString(),lastExistsAt:null,lastResolvedAt:null,lastDifferentAt:null} as CommunityReport
    expect(reportState({...base,category:'rough'},now).kind).toBe('active')
    expect(reportState({...base,category:'traffic'},now).kind).toBe('stale')
    expect(()=>validateReport({...input(),observedAt:new Date(now-31*86_400_000).toISOString()},ids,now)).toThrow()
  })
})
