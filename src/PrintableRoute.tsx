import type { NavigationState, Route } from './types'
import { formatDate, formatDistance, lineDistance, metrics, placeNames } from './routes'
import { oldestVerification } from './product'

export default function PrintableRoute({ route, state, snapshotDate }: { route: Route; state: NavigationState; snapshotDate: string }) {
  const m = metrics(route)
  const value = (n: number | null, unit: string) => n === null ? '尚無資料' : `${n} ${unit}`
  return <article className="printable-route"><h1>輪行臺大 · 路線資料</h1><p className="print-mode">{route.kind === 'demo' ? '示範動線：坡度、路寬、路面、階差與入口均為模擬，尚未實勘。' : `實勘動線，最舊查核日期 ${formatDate(oldestVerification(route))}，出發前請核對現場。`}</p><h2>{route.name}</h2><p>{placeNames[route.originEntrance.placeId]} → {placeNames[route.destinationEntrance.placeId]} · {state.wheelchair === 'manual' ? '手動輪椅' : '電動輪椅'}</p><p>距離 {formatDistance(m.distanceM)} · 最大坡度 {value(m.maxSlopePercent, '%')} · 最窄路寬 {value(m.minWidthM, 'm')} · 最大階差 {value(m.maxStepCm, 'cm')}</p>
    <h2>兩端入口</h2>{[route.originEntrance, route.destinationEntrance].map((e, i) => <section key={e.id}><h3>{i ? 'B 終點' : 'A 起點'}：{e.name}</h3><p>經緯度 {e.coordinate.join(', ')} · 查核日期 {formatDate(e.verifiedAt)}</p><p>來源：{e.source}</p>{e.photos[0] && <figure><img src={e.photos[0].src} alt={e.photos[0].alt} /><figcaption>{e.photos[0].caption}</figcaption></figure>}</section>)}
    <h2>逐段條件</h2><table><thead><tr><th>路段</th><th>距離</th><th>坡度</th><th>有效路寬</th><th>階差</th><th>坡道長度</th></tr></thead><tbody>{route.segments.map((s, i) => <tr key={s.id}><th>{i + 1}. {s.name}</th><td>{formatDistance(lineDistance(s.coordinates))}</td><td>{value(s.maxSlopePercent, '%')}</td><td>{value(s.minWidthM, 'm')}</td><td>{value(s.stepHeightCm, 'cm')}</td><td>{value(s.rampLengthM, 'm')}</td></tr>)}</tbody></table>
    {route.segments.map((s, i) => <section key={s.id}><h3>{i + 1}. {s.name}</h3><p>路面：{s.surface ?? '尚無資料'} · 階梯：{s.hasStairs === null ? '未知' : s.hasStairs ? '有' : '無'} · 封閉：{s.closed === null ? '未知' : s.closed ? '是' : '否'}</p><p>障礙：{s.obstacles.join('、') || (route.kind === 'demo' ? '未設定額外障礙，待實勘' : '查核紀錄未列固定障礙')}</p><p>查核日期：{formatDate(s.verifiedAt)} · 來源：{s.source}</p></section>)}
    <footer><p>公開圖資快照：{formatDate(snapshotDate)}。資料取得日期不代表實地查核日期。</p><p>目前路線網址：{window.location.href}</p></footer>
  </article>
}
