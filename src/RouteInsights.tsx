import { Mountain, MoveHorizontal } from 'lucide-react'
import type { Route } from './types'
import { bottlenecks, comparisonDifference, metrics } from './routes'

const value = (n: number | null, unit: string) => n === null ? '尚無資料' : `${Number(n.toFixed(2))} ${unit}`

export function ComparisonSummary({ routes }: { routes: Route[] }) {
  if (routes.length < 2) return null
  const [a, b] = [...routes.slice(0, 2)].sort((x, y) => metrics(x).distanceM - metrics(y).distanceM)
  const am = metrics(a), bm = metrics(b), d = comparisonDifference(a, b)
  const change = (n: number | null, less: string, more: string, unit: string) => n === null ? '資料不足，暫不比較' : n === 0 ? '相同' : `${n > 0 ? more : less} ${value(Math.abs(n), unit)}`
  return <section className="comparison-summary" aria-labelledby="comparison-heading">
    <div className="section-heading"><h2 id="comparison-heading">兩條路，差在哪裡？</h2><span>{a.kind === 'demo' || b.kind === 'demo' ? '示範數值' : '查核數值'}</span></div>
    <table><caption className="sr-only">{a.name}與{b.name}的通行條件比較</caption><thead><tr><th scope="col">條件</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr></thead><tbody>
      <tr><th scope="row">距離</th><td>{Math.round(am.distanceM)} m</td><td>{Math.round(bm.distanceM)} m</td></tr>
      <tr><th scope="row">最大坡度</th><td>{value(am.maxSlopePercent, '%')}</td><td>{value(bm.maxSlopePercent, '%')}</td></tr>
      <tr><th scope="row">最窄路寬</th><td>{value(am.minWidthM, 'm')}</td><td>{value(bm.minWidthM, 'm')}</td></tr>
    </tbody></table>
    <p className="comparison-baseline">「{b.name}」相較於「{a.name}」</p>
    <ul className="difference-list"><li>路程{change(d.distanceM, '減少', '增加', 'm')}</li><li>最大坡度{change(d.slopePoints, '降低', '增加', '個百分點')}</li><li>最窄路寬{change(d.widthM, '減少', '增加', 'm')}</li></ul>
  </section>
}

export function BottleneckList({ route, onSelect }: { route: Route; onSelect: (id: string) => void }) {
  const items = bottlenecks(route)
  return <section className="bottleneck-section" aria-label="路線瓶頸路段">
    <h2>先看最陡與最窄路段</h2>
    {items.length ? <div className="bottleneck-buttons">{items.flatMap(item => item.segmentIds.map(id => {
      const segment = route.segments.find(s => s.id === id)!
      const slope = item.kind === 'slope'
      return <button key={`${item.kind}-${id}`} onClick={() => onSelect(id)}><span className="bottleneck-icon">{slope ? <Mountain size={17} /> : <MoveHorizontal size={17} />}</span><span><strong>{slope ? '最陡路段' : '最窄路段'} · {value(item.value, slope ? '%' : 'm')}</strong><small>{segment.name}</small></span></button>
    }))}</div> : <p>量測資料未齊，暫不判定全程最陡與最窄路段。</p>}
    <p className="bottleneck-explainer">{route.kind === 'demo' ? '依示範數值標示。' : ''}地圖標記代表整個路段，實際瓶頸點需現場確認。</p>
  </section>
}
