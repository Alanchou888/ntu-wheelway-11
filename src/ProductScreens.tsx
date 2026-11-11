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
  return <main className="standalone-page" id="content-panel" tabIndex={-1}><div className="standalone-inner"><h1 id="panel-heading" tabIndex={-1}>我的收藏</h1><p className="standalone-intro">把常用動線留在這個瀏覽器，下次再依最新資料確認。</p><div className="local-data-note"><Info size={18} /><p>收藏與偏好存在目前裝置。路線開啟時會重新檢查資料與通行條件，清除網站資料後收藏也會移除。</p></div>
    {feedback && <div className="favorite-feedback" role="status"><p>{feedback}</p>{canUndo && <button className="button secondary" onClick={onUndo}>復原移除</button>}</div>}
    {favorites.length ? <ul className="favorites-list">{favorites.map(favorite => <li key={favorite.key}><div className="favorite-heading"><Bookmark size={21} /><h2>{favorite.name}</h2><span className={`tiny-badge ${favorite.mode === 'demo' ? 'amber' : ''}`}>{favorite.mode === 'demo' ? '試走紀錄' : '已查核路線'}</span></div><p>{placeNames[favorite.origin as 'library' | 'boya']} → {placeNames[favorite.origin === 'library' ? 'boya' : 'library']}</p><p className="favorite-date">收藏日期 {formatDate(favorite.savedAt)}</p>{!canOpenFavorite(favorite, allRoutes) && <p className="favorite-unavailable">這條動線或條件已變更，開啟後請重新確認。</p>}<div className="favorite-actions"><button className="button primary" onClick={() => onOpen(favorite)}>開啟路線<ArrowRight size={16} /></button><button className="button plain" onClick={() => onRemove(favorite.key)} aria-label={`移除收藏：${favorite.name}`}><Trash2 size={16} />移除收藏</button></div></li>)}</ul> : <div className="saved-empty"><Bookmark size={38} /><h2>還沒有收藏的動線</h2><p>選好路線後，按「收藏這條路線」就能放在這裡。</p><button className="button primary" onClick={onPlan}>開始規劃路線<ArrowRight size={17} /></button></div>}
  </div></main>
}

export function HelpPage({ onDemo, onEditor, onSources }: { onDemo: () => void; onEditor: () => void; onSources: () => void }) {
  return <main className="standalone-page" id="content-panel" tabIndex={-1}><div className="standalone-inner help-inner"><h1 id="panel-heading" tabIndex={-1}>使用說明與資料範圍</h1><p className="standalone-intro">查看第 11 組從總圖前廣場到博雅教學館西側的去回程，以及沿途實勘點。</p>
    <section className="help-section"><h2><BookOpen size={21} />路線怎麼看</h2>
      <ol className="help-steps">
        <li><strong>設定起終點</strong><p>選擇出發方向、輪椅類型與需要的通行條件。</p></li>
        <li><strong>比較動線</strong><p>查看去回程的距離和經過地點。</p></li>
        <li><strong>查看路段</strong><p>點實勘標記或路段，查看照片、觀察和量測來源。</p></li>
        <li><strong>保存或分享</strong><p>確認起終點後，可收藏、複製連結或列印路線。</p></li>
      </ol>
      <button className="button primary" onClick={onDemo}>查看試走路線<ArrowRight size={17} /></button>
    </section>
    <section className="help-section"><h2><Info size={21} />地圖資料</h2>
      <dl className="help-definitions">
        <div><dt>試走紀錄</dt><dd>依第 11 組實際走過的地標與公開圖資重繪。館內虛線為約略走向，照片和量測讀值對應個別實勘點。</dd></div>
        <div><dt>已查核路線</dt><dd>全程及兩端入口均有查核紀錄，路段相接、無階梯且開放通行。</dd></div>
        <div><dt>坡度與階差</dt><dd>全段坡度以百分比表示，階差以公分表示。實勘卡上的手機傾角保留原始讀值。</dd></div>
        <div><dt>有效路寬</dt><dd>路段最窄處的可通行淨寬，以公尺表示。</dd></div>
        <div><dt>瓶頸標記</dt><dd>標示有量測資料的最陡或最窄路段。</dd></div>
        <div><dt>查核日期</dt><dd>路線上的日期取自入口與路段最早的查核紀錄。</dd></div>
      </dl>
      <button className="button secondary" onClick={onSources}>查看公開資料來源</button>
    </section>
    <section className="help-section"><h2><ClipboardCheck size={21} />團隊如何補資料</h2><p>在實勘編輯器建立空白草稿，逐段量測並上傳現場照片。每項確認後匯出 JSON，由團隊複查後透過發布檢查工具更新網站。</p><p>本機草稿不會自動公開或同步給其他人。跨裝置續填請匯出與匯入 JSON，CSV 可用於表格檢閱。</p><button className="button secondary" onClick={onEditor}>開啟實勘編輯器</button></section>
    <section className="help-section"><h2>儲存、離線與隱私</h2><ul><li>偏好、收藏、實勘照片與草稿儲存在目前瀏覽器。社群路況在登入後主動發布才會上傳，實勘草稿不會自動公開。</li><li>本站離線外殼準備完成後，可以查看本站快照與路段清單。外部圖磚、校園圖層及線上照片可能無法顯示。</li><li>公開底圖、校園圖層及字型服務仍會收到一般網頁請求。照片匯入時請避開人臉、車牌與私人資訊。</li><li>離線資料會顯示快照日期。封閉與施工可能在查核後改變，出發前仍需確認現場。</li><li>更換瀏覽器、使用無痕模式或清除網站資料可能移除本機紀錄，實勘後請匯出備份。</li></ul></section>
    <section className="help-section"><h2>社群路況</h2><p>回報時可點選地圖標記障礙位置，或選取路段中點後用方向按鈕微調。位置為選填，發布前會提示該位置將公開。在路線設定開啟避開近期受阻回報，可查看每條被排除動線的原因。資料未取得或需要更新時，會暫不提供符合避開條件的結果。</p><p>從「社群路況」或路段資訊回報違停、顛簸、施工、積水、車流及照明問題。公開瀏覽不需登入，發布、確認與檢舉需要 ChatGPT 登入。公開內容包含暱稱、說明、發現時間及你主動上傳的照片，電子郵件不會公開。</p><p>其他人可確認仍存在、已排除或現場不同，並附上補充說明。每個帳號對同一則回報只計最近一次確認，作者可撤回自己的回報。管理人員可處理被檢舉內容。</p><p>不同類型有不同的顯示期限，逾期顯示待重新確認。使用者回報與已查核資料分開，沒有回報也不代表道路暢通。離線不會發布或排隊送出社群回報。</p></section>
    <section className="help-section"><h2>預演與路況時間軸</h2><p>在路段或確認頁播放預演，沿原始道路幾何查看各段通行條件。可調整預演速度、逐段暫停、前後跳段，或使用進度列的方向鍵、Home 與 End。預演進度與實際行進時間無關，也不會讀取裝置位置。</p><p>時間軸按路段長度排列，分別呈現每段最大坡度與最窄路寬。未知值保留，未補齊全程資料時不判定全程最高或最窄。數值代表整個路段，沒有推算連續高程或精確瓶頸點。</p><p>手機可用「地圖、摘要、展開」按鈕或拖曳面板把手調整高度。播放時面板會收合，點目前路段可展開詳情。拖動地圖會解除跟隨，切到背景會暫停。系統啟用減少動態時，仍可逐段查看與操作進度列。</p></section>
    <section className="help-section"><h2>我的位置</h2><p>按地圖右側「定位我」，閱讀說明後按「同意並開啟定位」，再由瀏覽器詢問是否允許。開啟後會顯示藍色位置點、裝置回報的誤差範圍、精度與更新時間。精度較低時請比對附近地標。</p><p>拖動地圖會解除跟隨，仍會更新位置。可按「回到我的位置」恢復跟隨，或「停止定位並清除位置」。切到背景會暫停，回來需按「繼續定位」。超過 30 秒沒有新位置時，會顯示上次位置。裝置定位和預演位置分開顯示。</p><p>裝置位置只在目前頁面記憶體使用，不保存定位紀錄，也不會自動加入留言或分享連結。回報時自行選擇的地圖落點會公開，與裝置定位分開。地圖服務仍會收到所查看區域的圖磚請求。定位需要 HTTPS 與系統、瀏覽器權限。超出校園範圍時仍保留原本的固定動線。</p></section>
    <section className="help-section"><h2>搜尋校園地點</h2><p>地圖上方可搜尋建物、地標、設施和實勘點。支援「總圖／NTU Library」「博雅／Boya」等別名。方向鍵選擇建議，Enter 開啟，Escape 收起。</p><p>點地圖上的數字可展開相近實勘點。地點卡可直接分享，總圖與博雅也可從卡片設定起終點。</p><p>清單距離採直線計算。建物中心、試走起終點與實勘點分開標示。</p></section>
    <section className="help-section"><h2>地圖主題</h2><p>可切換路線、路況、坡度或設施。坡度依全段最大值呈現，路況圖顯示使用者回報，設施圖標示公開點位。分享連結可保留地圖主題和路況避開設定。</p></section>
    <p className="help-version">輪椅友善路徑導航系統 v2.5 · 第 11 組</p>
  </div></main>
}

export function UnavailableRoute({ problem, onCompare, onRoute }: { problem: 'route' | 'segment'; onCompare: () => void; onRoute: () => void }) {
  return <div className="empty-state unavailable-route"><Info size={35} /><h1 id="panel-heading" tabIndex={-1}>{problem === 'route' ? '此路線目前無法提供' : '此路段資料已更新'}</h1><p>{problem === 'route' ? '連結中的路線可能已撤下、未符合查核條件，或超出目前的通行限制。請重新比較可用動線。' : '連結中的路段已不在目前資料內，請重新檢視這條路線的完整路段。'}</p>{problem === 'segment' && <button className="button primary wide" onClick={onRoute}>重新檢視這條路線</button>}<button className="button secondary wide" onClick={onCompare}>返回比較路線</button></div>
}
