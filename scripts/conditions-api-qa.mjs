// Local integration checks. The loopback guard prevents test reports reaching a public Site.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const origin=process.argv[2]??'http://127.0.0.1:8787'
const url=new URL(origin)
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol==='http:','This QA may run against loopback HTTP only')
const checks=[]
const actor=`automated-local-conditions-${crypto.randomUUID()}`
const call=async(path,method='GET',body,identity=actor)=>{
  const response=await fetch(`${origin}/api/community/${path}`,{method,headers:{Origin:origin,'X-Wheelway-Action':'community',...(identity?{'oai-authenticated-user-id':identity}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  return{status:response.status,body:await response.json()}
}
const input={segmentId:'direct-2',category:'parking',impact:'difficult',message:'AUTOMATED LOCAL TEST ONLY: selected point fixture',authorName:'LOCAL TEST',observedAt:new Date().toISOString(),coordinate:[121.53889483,25.01805954]}
const initial=await call('session','GET',undefined,null)
assert.equal(initial.body.signedIn,false);checks.push('anonymous session')
assert.equal((await call('reports','POST',input,null)).status,401);checks.push('anonymous writes rejected')
for(const coordinate of [[0,0],[121.538,25.03],['121.538',25.018]])assert.equal((await call('reports','POST',{...input,coordinate})).status,400)
checks.push('invalid or distant points rejected by live Worker')
const created=await call('reports','POST',input)
assert.equal(created.status,201);checks.push('point report created')
let feed=await call('reports','GET',undefined,null)
const own=feed.body.reports.find(r=>r.id===created.body.id)
assert.deepEqual(own.coordinate,[121.538895,25.01806]);checks.push('point rounded and shared across visitors')
assert(!JSON.stringify(own).includes(actor));checks.push('account identifier stays private')
assert.equal((await call('reports','POST',input)).status,409);checks.push('duplicate point report rejected')
assert.equal((await call(`reports/${created.body.id}/reaction`,'POST',{reaction:'resolved'},actor+'-other')).status,200)
feed=await call('reports','GET',undefined,null)
assert.equal(feed.body.reports.find(r=>r.id===created.body.id).counts.resolved,1);checks.push('cross-account confirmation retained')
const legacy=await call('reports','POST',{...input,segmentId:'gentle-2',coordinate:null})
assert.equal(legacy.status,201)
feed=await call('reports','GET',undefined,null)
assert.equal(feed.body.reports.find(r=>r.id===legacy.body.id).coordinate,null);checks.push('whole-road report remains supported')
assert.equal((await call(`reports/${created.body.id}`,'DELETE',undefined,actor+'-other')).status,403);checks.push('other account cannot withdraw')
for(const id of [created.body.id,legacy.body.id])assert.equal((await call(`reports/${id}`,'DELETE')).status,200)
feed=await call('reports','GET',undefined,null)
assert(!feed.body.reports.some(r=>[created.body.id,legacy.body.id].includes(r.id)));checks.push('author withdrawal removes test reports from public feed')
const evidence={version:'2.5.0',checkedAt:new Date().toISOString(),environment:'isolated loopback Worker and D1',automatedTestFixtures:true,productionWrites:false,checks}
mkdirSync('docs/evidence',{recursive:true})
writeFileSync('docs/evidence/v25-api-qa.json',JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify({passed:checks.length,productionWrites:false}))
