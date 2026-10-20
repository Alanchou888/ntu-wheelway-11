import { CheckCircle2, Download, RefreshCw, WifiOff } from 'lucide-react'
import { offlineDate, useOfflineApp } from './offline'
import type { OfflineOptions } from './offline'
import './offline.css'

interface Props extends OfflineOptions { snapshotDate?: string | null }

/** Mount once above the main workspace. Feed the editor's unsaved state into this component. */
export default function OfflineStatus({ snapshotDate, ...options }: Props) {
  const offline = useOfflineApp(options)
  const date = snapshotDate ?? offline.snapshotDate
  return <section className={`offline-status ${offline.isOffline ? 'is-offline' : ''}`} aria-label="離線、安裝與版本狀態">
    <div className="offline-status-message" role="status" aria-live="polite" aria-atomic="true">
      {offline.isOffline ? <WifiOff size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
      <div><strong>{offline.isOffline ? '目前離線' : offline.offlineReady ? '離線清單已保存' : '離線清單尚未保存'}</strong>
        <span>{offline.isOffline ? offline.offlineReady ? `圖資快照 ${offlineDate(date)}。可查看快照、路段清單與本機草稿，底圖及外部照片需連線。` : '此裝置尚未完成離線保存，請連線後重新開啟。' : `圖資快照 ${offlineDate(date)}。離線保存狀態依目前瀏覽器為準。`}</span>
      </div>
    </div>
    <div className="offline-status-actions">
      {offline.updateAvailable && <button className="offline-action offline-update" disabled={offline.isUpdating || options.hasUnsavedChanges} onClick={() => void offline.applyUpdate()}><RefreshCw size={16} aria-hidden="true" />{offline.isUpdating ? '更新中' : '新版已就緒，更新並重開'}</button>}
      {offline.canInstall && <button className="offline-action" onClick={() => void offline.install()}><Download size={16} aria-hidden="true" />安裝至裝置</button>}
      <details className="offline-help"><summary>離線與安裝說明</summary><div className="offline-help-content">
        <p>{offline.installed ? '目前以獨立視窗開啟。' : '可在支援的瀏覽器安裝為獨立視窗。若未出現安裝按鈕，請查看瀏覽器選單是否有「安裝」或「加入主畫面」。iPhone／iPad 可查看 Safari 的分享選單。功能依瀏覽器與系統版本而異。'}</p>
        <p>請先連線開啟網站，等候顯示「離線清單已保存」。離線時可看本站快照、路段清單與本機草稿，地圖仍有已保存的校園道路幾何。</p>
        <p>外部底圖、臺大 WMS 圖層、網路字型與外部照片不提供離線保存。本機草稿與離線檔案可能因清除瀏覽器資料或系統空間管理而消失，實勘完成後請匯出備份。</p>
        <p>快照取得日期不代表實地查核日期，通行狀態仍以各路段資訊為準。</p>
      </div></details>
    </div>
    {(offline.error || offline.updateMessage || (offline.updateAvailable && options.hasUnsavedChanges)) && <p className="offline-notice" role="status">{offline.error || offline.updateMessage || '新版已就緒。請先儲存或匯出編輯內容，再更新。'}</p>}
  </section>
}
