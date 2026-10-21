import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accuracyLabel, DeviceLocationSession, isLiveLocation, LOCATION_FRESH_MS, parseDeviceFix, withinLocationCoverage } from '../src/device-location'

let now:number
let success:PositionCallback[]
let failure:PositionErrorCallback[]
let provider:Pick<Geolocation,'watchPosition'|'clearWatch'>
const fix=(patch:Partial<GeolocationCoordinates>={},timestamp=now)=>({timestamp,coords:{longitude:121.538,latitude:25.017,accuracy:8,altitude:null,altitudeAccuracy:null,heading:null,speed:null,...patch}} as GeolocationPosition)
beforeEach(()=>{
  now=Date.parse('2026-10-21T11:00:00Z');success=[];failure=[]
  provider={watchPosition:vi.fn((onSuccess,onError)=>{success.push(onSuccess);failure.push(onError!);return success.length-1}),clearWatch:vi.fn()}
})

describe('device positioning requires an explicit action',()=>{
  it('does not request location when created or subscribed',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now)
    const unsubscribe=session.subscribe(()=>{})
    expect(session.snapshot().status).toBe('off');expect(provider.watchPosition).not.toHaveBeenCalled();unsubscribe()
  })
  it('requests fresh high-accuracy readings only after start',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start()
    expect(session.snapshot().status).toBe('requesting')
    expect(provider.watchPosition).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:true,maximumAge:5000,timeout:12000})
    success[0](fix());expect(session.snapshot().fix?.coordinate).toEqual([121.538,25.017]);expect(isLiveLocation(session.snapshot())).toBe(true)
  })
  it('rejects unsupported or insecure contexts without starting a watch',()=>{
    for(const [api,secure]of [[undefined,true],[provider,false]] as const){const session=new DeviceLocationSession(api,secure,()=>now);session.start();expect(session.snapshot().status).toBe('error')}
    expect(provider.watchPosition).not.toHaveBeenCalled()
  })
  it('clears watch ID zero and all position data on stop',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());session.stop()
    expect(provider.clearWatch).toHaveBeenCalledWith(0);expect(session.snapshot()).toMatchObject({status:'off',fix:null,following:false})
    success[0](fix({longitude:122}));expect(session.snapshot().fix).toBeNull()
  })
  it('cancels an earlier watch and ignores its late callback after restart',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();session.start();success[0](fix({longitude:122}));expect(session.snapshot().fix).toBeNull();success[1](fix());expect(session.snapshot().status).toBe('tracking');expect(provider.clearWatch).toHaveBeenCalledWith(0)
  })
  it('pauses on leaving the foreground and requires explicit resume',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());session.pause();success[0](fix({longitude:122}))
    expect(session.snapshot()).toMatchObject({status:'paused',following:false,fix:{coordinate:[121.538,25.017]}});expect(isLiveLocation(session.snapshot())).toBe(false)
    expect(provider.watchPosition).toHaveBeenCalledTimes(1);session.start();success[1](fix());expect(isLiveLocation(session.snapshot())).toBe(true)
  })
  it('releases a session without retaining its coordinates',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());session.release();expect(session.snapshot().fix).toBeNull();success[0](fix());expect(session.snapshot().status).toBe('off')
  })
})

describe('position quality and recovery',()=>{
  it.each([1,2,3])('handles error code %i without automatic permission requests',code=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();failure[0]({code} as GeolocationPositionError)
    expect(session.snapshot().status).toBe('error');expect(session.snapshot().following).toBe(false);expect(session.snapshot().message.length).toBeGreaterThan(10);expect(provider.clearWatch).toHaveBeenCalledWith(0);expect(provider.watchPosition).toHaveBeenCalledTimes(1)
  })
  it('clears prior location when permission is revoked',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());failure[0]({code:1} as GeolocationPositionError);expect(session.snapshot().fix).toBeNull()
  })
  it('retains an explicitly stale last position after temporary signal failure',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());failure[0]({code:2} as GeolocationPositionError);expect(session.snapshot().fix).not.toBeNull();expect(isLiveLocation(session.snapshot())).toBe(false)
  })
  it('marks old readings as stale and refuses to follow them',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());session.setFollowing(false);now+=LOCATION_FRESH_MS+1;session.tick();session.setFollowing(true);expect(isLiveLocation(session.snapshot())).toBe(false);expect(session.snapshot().following).toBe(false)
  })
  it('keeps position updates when map following is disabled',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());session.setFollowing(false);now+=1000;success[0](fix({longitude:121.539}));expect(session.snapshot().fix?.coordinate[0]).toBe(121.539);expect(session.snapshot().following).toBe(false);session.setFollowing(true);expect(session.snapshot().following).toBe(true)
  })
  it('ignores out-of-order readings',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());now+=1000;success[0](fix({longitude:122},now-2000));expect(session.snapshot().fix?.coordinate[0]).toBe(121.538)
  })
  it('allows an explicit recenter request while already following',()=>{
    const session=new DeviceLocationSession(provider,true,()=>now);session.start();success[0](fix());const previous=session.snapshot().focusRequest;session.setFollowing(true);expect(session.snapshot().focusRequest).toBe(previous+1);expect(session.snapshot().following).toBe(true)
  })
  it('handles synchronous browser exceptions and synchronous denial',()=>{
    const throwing={...provider,watchPosition:()=>{throw new Error('blocked')}}
    const session=new DeviceLocationSession(throwing,true,()=>now);session.start();expect(session.snapshot().status).toBe('error')
    const immediate={...provider,watchPosition:(_s:PositionCallback,e?:PositionErrorCallback|null)=>{e?.({code:1} as GeolocationPositionError);return 42}}
    const denied=new DeviceLocationSession(immediate,true,()=>now);denied.start();expect(provider.clearWatch).toHaveBeenCalledWith(42);expect(denied.snapshot().status).toBe('error')
  })
  it('rejects invalid coordinates, uncertainty and timestamps',()=>{
    for(const value of [fix({latitude:91}),fix({longitude:181}),fix({accuracy:-1}),fix({longitude:NaN}),fix({},now-LOCATION_FRESH_MS-1),fix({},now+6000)])expect(()=>parseDeviceFix(value,now)).toThrow()
    expect(parseDeviceFix(fix({accuracy:0}),now).accuracyM).toBe(0)
  })
  it('uses the fixed campus coverage without changing route endpoints',()=>{
    const points:[number,number][]=[[121.535,25.016],[121.541,25.02]]
    expect(withinLocationCoverage(parseDeviceFix(fix(),now),points)).toBe(true)
    expect(withinLocationCoverage(parseDeviceFix(fix({longitude:121.56}),now),points)).toBe(false)
    expect(withinLocationCoverage(parseDeviceFix(fix(),now),[])).toBe(false)
    expect(accuracyLabel(1500)).toBe('約 1.5 公里')
  })
})
