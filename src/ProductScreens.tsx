import { ArrowRight, Bookmark, BookOpen, ClipboardCheck, Info, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { NavigationState, Route, RouteLimits } from './types'
import type { Favorite } from './product'
import { canOpenFavorite } from './product'
import { formatDate, placeNames } from './routes'

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
  return <main className="standalone-page"><div className="standalone-inner"><p className="panel-eyebrow">MY ROUTES</p><h1 id="panel-heading" tabIndex={-1}>我的收藏</h1><p className="standalone-intro">把常用動線留在這個瀏覽器，下次再依最新資料確認。</p><div className="local-data-note"><Info size={18} /><p>收藏與偏好存在目前裝置。路線開啟時會重新檢查資料與通行條件，清除網站資料後收藏也會移除。</p></div>
    {feedback && <div className="favorite-feedback" role="status"><p>{feedback}</p>{canUndo && <button className="button secondary" onClick={onUndo}>復原移除</button>}</div>}
    {favorites.length ? <ul className="favorites-list">{favorites.map(favorite => <li key={favorite.key}><div className="favorite-heading"><Bookmark size={21} /><h2>{favorite.name}</h2><span className={`tiny-badge ${favorite.mode === 'demo' ? 'amber' : ''}`}>{favorite.mode === 'demo' ? '示範動線' : '實勘動線'}</span></div><p>{placeNames[favorite.origin as 'library' | 'boya']} → {placeNames[favorite.origin === 'library' ? 'boya' : 'library']}</p><p className="favorite-date">收藏日期 {formatDate(favorite.savedAt)}</p>{!canOpenFavorite(favorite, allRoutes) && <p className="favorite-unavailable">這條動線或條件已變更，開啟後請重新確認。</p>}<div className="favorite-actions"><button className="button primary" onClick={() => onOpen(favorite)}>開啟路線<ArrowRight size={16} /></button><button className="button plain" onClick={() => onRemove(favorite.key)} aria-label={`移除收藏：${favorite.name}`}><Trash2 size={16} />移除收藏</button></div></li>)}</ul> : <div className="saved-empty"><Bookmark size={38} /><h2>還沒有收藏的動線</h2><p>選好路線後，按「收藏這條路線」就能放在這裡。</p><button className="button primary" onClick={onPlan}>開始規劃路線<ArrowRight size={17} /></button></div>}
  </div></main>
}

export function HelpPage({ onDemo, onEditor, onSources }: { onDemo: () => void; onEditor: () => void; onSources: () => void }) {
  return <main className="standalone-page"><div className="standalone-inner help-inner"><p className="panel-eyebrow">START HERE</p><h1 id="panel-heading" tabIndex={-1}>使用說明與資料範圍</h1><p className="standalone-intro">輪行臺大目前支援總圖書館與博雅教學館周邊，先比較，再依現場確認。</p>
    <section className="help-section"><h2><BookOpen size={21} />四步選一條路</h2><ol className="help-steps"><li><strong>設定需求</strong><p>選起終點、輪椅類型與偏好，需要時設定坡度、路寬、階差及查核天數。</p></li><li><strong>比較動線</strong><p>查看距離與條件差異，未符合個人限制的路線會列出原因。</p></li><li><strong>查看路段</strong><p>點最陡、最窄路段或地圖，核對量測、照片、來源及實勘日期。</p></li><li><strong>確認與保存</strong><p>核對兩端入口，再收藏、複製連結或列印完整路線資料。</p></li></ol><button className="button primary" onClick={onDemo}>開始體驗示範動線<ArrowRight size={17} /></button></section>
    <section className="help-section"><h2><Info size={21} />先看懂資料</h2><dl className="help-definitions"><div><dt>示範模式</dt><dd>道路幾何參考公開圖資。坡度、寬度、階差、路面與入口均為示範，供操作測試。</dd></div><div><dt>已查核路線</dt><dd>需要全程及兩端入口的實勘證據。未填值、階梯、封閉與未銜接的路段會排除。目前仍待團隊接入真實實勘資料。</dd></div><div><dt>最大坡度與階差</dt><dd>坡度以百分比表示，階差以公分表示。兩者分開記錄，請依自己能接受的條件判斷。</dd></div><div><dt>有效路寬</dt><dd>使用最窄處的可通行淨寬，以公尺表示，請同時查看轉彎與固定障礙。</dd></div><div><dt>瓶頸標記</dt><dd>標記代表具有最陡或最窄量測的整個路段，並列時全部顯示。位置不代表極值的精確測量點。</dd></div><div><dt>查核日期</dt><dd>使用整條路線最舊的入口或路段查核日，避免只看到較新的部分。圖資下載日期另行顯示。</dd></div></dl><button className="button secondary" onClick={onSources}>查看公開資料來源</button></section>
    <section className="help-section"><h2><ClipboardCheck size={21} />團隊如何補資料</h2><p>在實勘編輯器建立空白草稿，逐段量測並上傳現場照片。每項確認後匯出 JSON，由團隊複查後透過發布檢查工具更新網站。</p><p>本機草稿不會自動公開或同步給其他人。跨裝置續填請匯出與匯入 JSON，CSV 可用於表格檢閱。</p><button className="button secondary" onClick={onEditor}>開啟實勘編輯器</button></section>
    <section className="help-section"><h2>儲存、離線與隱私</h2><ul><li>偏好、收藏、實勘照片與草稿儲存在目前瀏覽器。沒有登入、廣告追蹤或自動上傳草稿。</li><li>本站離線外殼準備完成後，可以查看本站快照與路段清單。外部圖磚、校園圖層及線上照片可能無法顯示。</li><li>公開底圖、校園圖層及字型服務仍會收到一般網頁請求。照片匯入時請避開人臉、車牌與私人資訊。</li><li>離線資料會顯示快照日期。封閉與施工可能在查核後改變，出發前仍需確認現場。</li><li>更換瀏覽器、使用無痕模式或清除網站資料可能移除本機紀錄，實勘後請匯出備份。</li></ul></section>
    <section className="help-section"><h2>目前服務範圍</h2><p>提供固定校園動線的條件比較與路段查閱。尚未提供即時施工回報、GPS 逐步導航、語音指引或任意地址搜尋。網站功能與真實路況查核分開維護，使用者測試紀錄由實際操作後填寫。</p><p className="help-version">輪行臺大 v2.0 · 第 11 組校園試用版</p></section>
  </div></main>
}

export function UnavailableRoute({ problem, onCompare, onRoute }: { problem: 'route' | 'segment'; onCompare: () => void; onRoute: () => void }) {
  return <div className="empty-state unavailable-route"><Info size={35} /><h1 id="panel-heading" tabIndex={-1}>{problem === 'route' ? '此路線目前無法提供' : '此路段資料已更新'}</h1><p>{problem === 'route' ? '連結中的路線可能已撤下、未符合查核條件，或超出目前的通行限制。請重新比較可用動線。' : '連結中的路段已不在目前資料內，請重新檢視這條路線的完整路段。'}</p>{problem === 'segment' && <button className="button primary wide" onClick={onRoute}>重新檢視這條路線</button>}<button className="button secondary wide" onClick={onCompare}>返回比較路線</button></div>
}
