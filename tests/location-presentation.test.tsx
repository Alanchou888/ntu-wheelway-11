import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe,expect,it } from 'vitest'
import { LocationDetails } from '../src/LocationControls'
import type { LocationSnapshot } from '../src/device-location'
const now=Date.parse('2026-10-21T11:00:00Z')
const base:LocationSnapshot={status:'tracking',fix:{coordinate:[121.538,25.017],accuracyM:80,timestamp:now},following:true,message:'',now,focusRequest:1}
describe('location presentation',()=>{
  it('shows device uncertainty and out-of-coverage context without claiming route accessibility',()=>{
    const html=renderToStaticMarkup(createElement(LocationDetails,{state:base,inCoverage:false}))
    expect(html).toContain('約 80 公尺');expect(html).toContain('定位精度較低');expect(html).toContain('服務範圍外');expect(html).not.toContain('已查核')
  })
  it('labels old data explicitly and retains the last update time',()=>{
    const html=renderToStaticMarkup(createElement(LocationDetails,{state:{...base,now:now+31_000},inCoverage:true}))
    expect(html).toContain('位置待更新');expect(html).toContain('上次位置');expect(html).toContain('超過 30 秒')
  })
})
