import { RefreshCw, WifiOff } from 'lucide-react'
import { useOfflineApp } from './offline'
import './offline.css'

export default function OfflineStatus() {
  const offline = useOfflineApp()
  if (!offline.isOffline && !offline.updateAvailable && !offline.updateMessage) return null

  return <section className={`offline-status ${offline.isOffline ? 'is-offline' : ''}`} aria-label="網站狀態">
    {offline.isOffline && <div className="offline-status-message" role="status">
      <WifiOff size={17} aria-hidden="true" />
      <p>{offline.offlineReady ? '目前離線，部分地圖與照片可能無法顯示。' : '目前離線，請連線後再開啟。'}</p>
    </div>}
    {offline.updateAvailable && <button className="offline-action offline-update" disabled={offline.isUpdating} onClick={() => void offline.applyUpdate()}>
      <RefreshCw size={16} aria-hidden="true" />{offline.isUpdating ? '更新中' : '新版已就緒，更新並重開'}
    </button>}
    {offline.updateMessage && <p className="offline-notice" role="status">{offline.updateMessage}</p>}
  </section>
}
