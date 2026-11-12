import { ArrowRight, Bookmark, Info, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { NavigationState, Route, RouteLimits } from './types'
import type { Favorite } from './product'
import { fromHash } from './routes'

export function LimitControls({ limits, onChange, onSave, feedback }: { limits: RouteLimits; onChange: (v: RouteLimits) => void; onSave: () => void; feedback: string }) {
  const [error, setError] = useState('')
  const fields = [
    { key: 'maxSlope' as const, label: '可接受最大坡度（%）', max: 1000, step: 'any' },
    { key: 'minWidth' as const, label: '至少有效路寬（m）', max: 1000, step: 'any' },
    { key: 'maxStep' as const, label: '可接受最大階差（cm）', max: 1000, step: 'any' },
    { key: 'recheckDays' as const, label: '查核距今天數上限', max: 3650, step: '1' },
  ]
  const count = Object.values(limits).filter(v => v !== null).length
  return <details className="limit-controls" open={count > 0 ? true : undefined}>
    <summary><span>通行條件（選填）</span><small>{count ? `已設定 ${count} 項` : '依自己的需求篩選'}</small></summary>
    <div className="limit-body"><p>留白表示不限制。條件由你設定，輪椅類型不會自動套用門檻。</p><div className="limit-grid">{fields.map(field => <label key={field.key}><span>{field.label}</span><input type="number" min="0" max={field.max} step={field.step} inputMode="decimal" placeholder="不限制" value={limits[field.key] ?? ''} onChange={e => {
      if (!e.target.value) { setError(''); onChange({ ...limits, [field.key]: null }); return }
      const n = e.target.valueAsNumber
      if (!Number.isFinite(n) || n < 0 || n > field.max || (field.key === 'recheckDays' && !Number.isInteger(n))) { setError(`「${field.label}」請輸入 0 到 ${field.max}${field.key === 'recheckDays' ? ' 的整數' : ''}。`); return }
      setError(''); onChange({ ...limits, [field.key]: n })
    }} /></label>)}</div><p>查核天數只套用於實勘路線。符合篩選仍須核對入口、路面與現場狀況。</p>{error && <p className="inline-error" role="alert">{error}</p>}<div className="profile-actions"><button type="button" className="button secondary" onClick={onSave}><Save size={16} />記住我的設定</button><button type="button" className="button plain" onClick={() => onChange({ maxSlope: null, minWidth: null, maxStep: null, recheckDays: null })}><RotateCcw size={15} />清除限制</button></div>{feedback && <p role="status">{feedback}</p>}</div>
  </details>
}

export function SavedRoutes({ favorites, allRoutes, onOpen, onRemove, onUndo, canUndo, onPlan, feedback }: { favorites: Favorite[]; allRoutes: Route[]; onOpen: (favorite: Favorite) => void; onRemove: (key: string) => void; onUndo: () => void; canUndo: boolean; onPlan: () => void; feedback: string }) {
  return <main className="standalone-page" id="content-panel" tabIndex={-1}>
    <div className="standalone-inner">
      <h1 id="panel-heading" tabIndex={-1}>我的收藏</h1>
      <p className="standalone-intro">收藏會存在這個瀏覽器。</p>
      {feedback && <div className="favorite-feedback" role="status"><p>{feedback}</p>{canUndo && <button className="button secondary" onClick={onUndo}>復原移除</button>}</div>}
      {favorites.length ? <ul className="favorites-list">{favorites.map(favorite => {
        const route = allRoutes.find(item => item.id === fromHash(favorite.hash).routeId)
        return <li key={favorite.key}>
          <div className="favorite-heading"><Bookmark size={21} aria-hidden="true" /><h2>{route?.name ?? favorite.name}</h2></div>
          {route ? <p>{route.originEntrance.name} → {route.destinationEntrance.name}</p> : <p className="favorite-unavailable">這是舊版路線，請從地圖重新選擇方向。</p>}
          <div className="favorite-actions">
            {route && <button className="button primary" onClick={() => onOpen(favorite)}>開啟路線<ArrowRight size={16} aria-hidden="true" /></button>}
            <button className="button plain" onClick={() => onRemove(favorite.key)} aria-label={`移除收藏，${favorite.name}`}><Trash2 size={16} aria-hidden="true" />移除收藏</button>
          </div>
        </li>
      })}</ul> : <div className="saved-empty"><Bookmark size={38} aria-hidden="true" /><h2>還沒有收藏的路線</h2><button className="button primary" onClick={onPlan}>查看路線<ArrowRight size={17} aria-hidden="true" /></button></div>}
    </div>
  </main>
}

export function HelpPage({ onDemo, onSources }: { onDemo: () => void; onSources?: () => void }) {
  return <main className="standalone-page" id="content-panel" tabIndex={-1}>
    <div className="standalone-inner help-inner">
      <h1 id="panel-heading" tabIndex={-1}>使用指南</h1>
      <ol className="help-steps mvp-help-steps">
        <li><strong>選擇方向</strong><p>去程從總圖前廣場到博雅西側，回程由博雅西側回到總圖。</p></li>
        <li><strong>查看沿途實勘</strong><p>從路線打開「查看沿途實勘」，就能看到坡道、路面和狹窄處的照片與量測。</p></li>
        <li><strong>查找附近設施</strong><p>可搜尋地點，或從「更多設施」查飲水、廁所等資訊。</p></li>
      </ol>
      <button className="button primary" onClick={onDemo}>查看路線<ArrowRight size={17} aria-hidden="true" /></button>
      <details className="mvp-help-details">
        <summary>資料說明</summary>
        <p>圖上距離是估算，館內虛線是約略走向。實勘卡上的寬度與角度是各點的讀值，全段資訊可從路段查看。</p>
        {onSources && <button className="button secondary" onClick={onSources}>查看地圖來源</button>}
      </details>
      <details className="mvp-help-details">
        <summary>定位與路況回報</summary>
        <p>按「定位我」並同意後，地圖會顯示目前位置和精度。分享連結只包含你查看的路線或地點。</p>
        <p>登入後可回報路況。送出的文字、照片與選定的地圖位置會公開。</p>
      </details>
    </div>
  </main>
}

export function UnavailableRoute({ problem, onCompare, onRoute }: { problem: 'route' | 'segment'; onCompare: () => void; onRoute: () => void }) {
  return <div className="empty-state unavailable-route"><Info size={35} aria-hidden="true" />
    <h1 id="panel-heading" tabIndex={-1}>{problem === 'route' ? '找不到這條路線' : '找不到這個路段'}</h1>
    {problem === 'segment' && <button className="button primary wide" onClick={onRoute}>查看整條路線</button>}
    <button className="button secondary wide" onClick={onCompare}>選擇方向</button>
  </div>
}
