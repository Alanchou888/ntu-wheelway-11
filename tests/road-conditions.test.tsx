import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Campus, Coordinate, Route } from '../src/types'
import type { CommunityReport, CommunitySegment } from '../src/community-model'
import { buildDemoRoutes, fromHash, lineMidpoint, reverseRoute, toHash } from '../src/routes'
import { selectCandidates } from '../src/product'
import { conditionDataReady, conditionReasons, distanceToLineM, filterConditions, reportMatchesSegment, routeReports, slopeStyle, validateReportPoint } from '../src/road-conditions'
import { ThemeChooser, ThemeLegend } from '../src/MapThemes'

const now=Date.parse('2026-10-22T04:00:00Z')
const demos=buildDemoRoutes(JSON.parse(readFileSync('public/data/campus.json','utf8')) as Campus)
const routes=[demos.find(r=>r.id==='gentle')!,demos.find(r=>r.id==='direct')!]
const report=(patch:Partial<CommunityReport>={}):CommunityReport=>({id:'test-report',segmentId:routes[0].segments[1].id,category:'parking',impact:'difficult',message:'Automated fixture only',authorName:'TEST',observedAt:new Date(now-60_000).toISOString(),createdAt:new Date(now).toISOString(),coordinate:null,own:false,photoUrl:null,counts:{exists:0,resolved:0,different:0},lastExistsAt:null,lastResolvedAt:null,lastDifferentAt:null,myReaction:null,updates:[],...patch})
const segments:CommunitySegment[]=routes.flatMap(route=>route.segments.map(segment=>({id:segment.id,name:segment.name,routeName:route.name,coordinate:lineMidpoint(segment.coordinates),coordinates:segment.coordinates})))
const base=()=>selectCandidates(routes,fromHash(''))
const filtered=(reports:CommunityReport[],enabled=true,ready=true)=>filterConditions(base(),reports,{enabled,ready,now})

describe('community condition route decisions',()=>{
  it('keeps the original distance or slope order when avoidance is off',()=>{
    const short=selectCandidates(routes,fromHash('#prefer=short'))
    expect(filterConditions(short,[report()],{enabled:false,ready:true,now})).toBe(short)
    expect(short.accepted[0].id).toBe('direct')
    expect(filtered([report()],false).accepted[0].id).toBe('gentle')
  })
  it('returns two, one and zero candidates with concrete reasons',()=>{
    expect(filtered([]).accepted).toHaveLength(2)
    const one=filtered([report()])
    expect(one.accepted.map(r=>r.id)).toEqual(['direct'])
    expect(one.excluded[0].reasons[0]).toContain('違停')
    expect(filtered([report(),report({segmentId:routes[1].segments[0].id,impact:'blocked'})]).accepted).toHaveLength(0)
  })
  it('retains stale, resolved, disputed and passable reports without excluding routes',()=>{
    for(const patch of [{observedAt:new Date(now-7*3_600_000).toISOString()},{lastResolvedAt:new Date(now).toISOString()},{lastDifferentAt:new Date(now).toISOString()},{impact:'passable' as const}]){
      expect(filtered([report(patch)]).accepted).toHaveLength(2)
    }
  })
  it('renews an old report only after a new still-exists confirmation',()=>{
    expect(filtered([report({observedAt:new Date(now-7*3_600_000).toISOString(),lastExistsAt:new Date(now).toISOString()})]).accepted).toHaveLength(1)
  })
  it('does not promote demos or unverified routes to the verified mode',()=>{
    const verified=selectCandidates(routes,fromHash('#mode=survey'))
    expect(filterConditions(verified,[],{enabled:true,ready:true,now}).accepted).toEqual([])
    expect(routes.every(r=>r.kind==='demo')).toBe(true)
  })
  it('keeps personal restrictions and their reasons',()=>{
    const restricted=selectCandidates(routes,fromHash('#maxSlope=3'))
    const result=filterConditions(restricted,[report()],{enabled:true,ready:true,now})
    expect(result.accepted).toHaveLength(0)
    expect(result.excluded).toHaveLength(2)
    expect(result.excluded.flatMap(r=>r.reasons).join()).toContain('最大坡度')
  })
  it('withholds avoidance results when reports are unavailable instead of assuming clear roads',()=>{
    const result=filtered([],true,false)
    expect(result.accepted).toHaveLength(0)
    expect(result.excluded.every(r=>r.reasons[0].includes('需要更新'))).toBe(true)
    expect(conditionDataReady(null,'',now)).toBe(false)
    expect(conditionDataReady(new Date(now).toISOString(),'API unavailable',now)).toBe(false)
    expect(conditionDataReady(new Date(now-300_001).toISOString(),'',now)).toBe(false)
    expect(conditionDataReady(new Date(now-300_000).toISOString(),'',now)).toBe(true)
  })
  it('preserves decisions when route direction is reversed',()=>{
    expect(conditionReasons(reverseRoute(routes[0]),[report()],now)).toEqual(conditionReasons(routes[0],[report()],now))
  })
})

describe('precise reports and shared roads',()=>{
  const line:Coordinate[]=[[121.538,25.018],[121.539,25.018]]
  it('measures distance to the line and its endpoints',()=>{
    expect(distanceToLineM([121.5385,25.018],line)).toBeCloseTo(0)
    expect(distanceToLineM([121.5385,25.0181],line)).toBeCloseTo(11.132,2)
    expect(distanceToLineM([121.537,25.018],line)).toBeGreaterThan(95)
    expect(distanceToLineM([121.538,25.018],[])).toBe(Infinity)
  })
  it('accepts optional or near-road points and rejects far-road points',()=>{
    expect(()=>validateReportPoint(null)).not.toThrow()
    expect(()=>validateReportPoint([121.5385,25.0182],line)).not.toThrow()
    expect(()=>validateReportPoint([121.5385,25.019],line)).toThrow('30 公尺')
    expect(()=>validateReportPoint([121.5385,25.018])).toThrow()
  })
  it('applies a point to alternate segments sharing that location',()=>{
    const segment={...routes[1].segments[0],coordinates:line}
    const point=report({segmentId:'different-id',coordinate:[121.5385,25.018]})
    expect(reportMatchesSegment(point,segment)).toBe(true)
    expect(reportMatchesSegment({...point,coordinate:[121.54,25.018]},segment)).toBe(false)
  })
  it('applies whole-road reports to shared lengths without confusing one junction with an overlap',()=>{
    const source={id:'source',name:'Source',routeName:'Route',coordinate:line[0],coordinates:line}
    const parallel={...routes[1].segments[0],coordinates:[...line]}
    const junction={...parallel,coordinates:[[121.539,25.018],[121.539,25.019]] as Coordinate[]}
    expect(reportMatchesSegment(report({segmentId:'source'}),parallel,[source])).toBe(true)
    expect(reportMatchesSegment(report({segmentId:'source'}),junction,[source])).toBe(false)
  })
  it('does not count one report twice across multiple segments',()=>{
    const route:Route={...routes[0],segments:[routes[0].segments[1],routes[0].segments[1]]}
    expect(routeReports(route,[report()],segments)).toHaveLength(1)
  })
})

describe('theme and link contracts',()=>{
  it('round-trips avoidance and map themes while keeping older links valid',()=>{
    const state={...fromHash(''),avoidReports:true,mapTheme:'slope' as const}
    expect(fromHash(toHash(state))).toMatchObject({avoidReports:true,mapTheme:'slope'})
    expect(fromHash('#theme=invalid&avoidReports=yes')).not.toHaveProperty('mapTheme')
    expect(fromHash('')).not.toHaveProperty('avoidReports')
  })
  it('labels thresholds and unknown values without claiming a safety grade',()=>{
    expect(slopeStyle(null).label).toContain('未知')
    expect(slopeStyle(3).label).toBe('坡度 ≤ 3%')
    expect(slopeStyle(5).label).toBe('坡度 > 3% 至 5%')
    expect(slopeStyle(5.1).label).toBe('坡度 > 5%')
    const html=renderToStaticMarkup(<ThemeLegend theme="slope" mode="demo" />)
    expect(html).toContain('示範');expect(html).toContain('未知')
  })
  it('provides pressed-state controls and legends for all four themes',()=>{
    const html=renderToStaticMarkup(<ThemeChooser theme="conditions" onChange={()=>{}} />)
    expect(html.match(/<button/g)).toHaveLength(4)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(renderToStaticMarkup(<ThemeLegend theme="conditions" mode="demo" />)).toContain('未實勘')
    expect(renderToStaticMarkup(<ThemeLegend theme="facilities" mode="survey" />)).toContain('資料待補')
  })
})
