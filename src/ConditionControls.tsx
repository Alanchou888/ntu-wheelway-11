import { LoaderCircle, MessageSquare, RefreshCw } from 'lucide-react'
import type { CommunityData } from './useCommunity'
import { conditionDataReady } from './road-conditions'

export default function ConditionControls({ enabled, onChange, community }: { enabled: boolean; onChange: (enabled: boolean) => void; community: CommunityData }) {
  const ready = conditionDataReady(community.fetchedAt, community.error, community.now)
  return <section className="condition-controls" aria-label="社群路況選路條件">
    <label className="condition-toggle"><input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} /><span><strong>避開近期受阻回報</strong><small>排除近期回報通行困難或無法通行的動線</small></span></label>
    <div className="condition-info"><MessageSquare size={15} aria-hidden="true" /><p>參考使用者現場回報。沒有回報的路段，通行情況仍待確認。</p></div>
    {enabled && <div className="condition-freshness" role="status">{community.loading ? <span><LoaderCircle size={14} className="spinner" />正在更新社群路況</span> : ready ? <span>資料更新於 {new Date(community.fetchedAt!).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}{community.truncated ? '，僅涵蓋最近 300 則' : ''}</span> : <span>社群資料需要更新，暫無法確認避開條件。</span>}<button type="button" disabled={community.loading} onClick={() => void community.refresh()}><RefreshCw size={14} />更新</button></div>}
    {enabled && community.error && <p className="condition-error" role="alert">{community.error}</p>}
  </section>
}
