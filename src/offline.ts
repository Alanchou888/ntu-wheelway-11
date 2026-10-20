import { useEffect, useRef, useState } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
interface OfflineMessage { type?: string; ready?: boolean; snapshotDate?: string | null }
export interface OfflineOptions {
  /** Defaults to production builds, so Vite's development files are never cached. */
  enabled?: boolean
  /** A second check is made immediately before reloading after worker activation. */
  hasUnsavedChanges?: boolean
  /** Optional application-level save or confirmation. Returning false cancels the update. */
  beforeUpdate?: () => boolean | Promise<boolean>
}

export function updateAllowed(hasUnsavedChanges: boolean, isUpdating: boolean) { return !hasUnsavedChanges && !isUpdating }
/** Read synchronously each time: the editor can receive more input while a worker activates. */
export function hasPendingSurveyChanges(explicit = false) {
  return explicit || (typeof document !== 'undefined' && document.documentElement.dataset.surveyUnsaved === 'true')
}
export function offlineDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '尚無日期'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '尚無日期'
  return value.slice(0, 10).replaceAll('-', '/')
}

/** Optional progressive enhancement. Errors leave the normal online app usable. */
export function useOfflineApp(options: OfflineOptions = {}) {
  const enabled = options.enabled ?? import.meta.env.PROD
  const [isOffline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [offlineReady, setReady] = useState(false)
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isUpdating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [updateMessage, setUpdateMessage] = useState('')
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const optionsRef = useRef(options)
  const reloadRequested = useRef(false)
  const reloadAvailable = useRef(false)
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  optionsRef.current = options

  useEffect(() => {
    let disposed = false
    let lastCheck = 0
    const cleanups: (() => void)[] = []
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const standalone = () => setInstalled(displayMode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone)
    standalone()
    displayMode.addEventListener('change', standalone)
    cleanups.push(() => displayMode.removeEventListener('change', standalone))
    const handlePrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt) }
    const installedHandler = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', installedHandler)
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < 60_000) return
      lastCheck = Date.now()
      void registrationRef.current?.update().catch(() => undefined)
    }
    const online = () => { setOffline(false); checkUpdate() }
    const offline = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', checkUpdate)
    cleanups.push(() => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', installedHandler)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', checkUpdate)
    })

    if (enabled && 'serviceWorker' in navigator && window.isSecureContext) {
      let previousController = navigator.serviceWorker.controller
      const stopUpdating = () => { if (updateTimer.current) clearTimeout(updateTimer.current); setUpdating(false) }
      const onControllerChange = () => {
        const current = navigator.serviceWorker.controller
        if (previousController && current !== previousController) {
          // A different tab may have installed the release. This tab still decides when to reload.
          reloadAvailable.current = true
          setUpdateAvailable(true)
        }
        previousController = current
        if (!reloadRequested.current) return
        reloadRequested.current = false
        reloadAvailable.current = true
        stopUpdating()
        if (hasPendingSurveyChanges(optionsRef.current.hasUnsavedChanges)) {
          setUpdateMessage('新版已準備好。請先儲存或匯出編輯內容，再按更新。')
          return
        }
        window.location.reload()
      }
      const onMessage = (event: MessageEvent<OfflineMessage>) => {
        if (event.data?.type !== 'WHEELWAY_OFFLINE_READY') return
        setReady(true)
        setSnapshotDate(event.data.snapshotDate ?? null)
      }
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
      navigator.serviceWorker.addEventListener('message', onMessage)
      cleanups.push(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
        navigator.serviceWorker.removeEventListener('message', onMessage)
        if (updateTimer.current) clearTimeout(updateTimer.current)
      })
      const inspectStatus = (worker: ServiceWorker | null) => {
        if (!worker || typeof MessageChannel === 'undefined') return
        const channel = new MessageChannel()
        const timeout = setTimeout(() => channel.port1.close(), 5000)
        channel.port1.onmessage = (event: MessageEvent<OfflineMessage>) => {
          clearTimeout(timeout)
          channel.port1.close()
          if (disposed) return
          setReady(event.data.ready === true)
          setSnapshotDate(event.data.snapshotDate ?? null)
        }
        cleanups.push(() => { clearTimeout(timeout); channel.port1.close() })
        try { worker.postMessage({ type: 'WHEELWAY_OFFLINE_STATUS' }, [channel.port2]) }
        catch { clearTimeout(timeout); channel.port1.close() }
      }
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then(registration => {
        if (disposed) return
        registrationRef.current = registration
        setError('')
        setUpdateAvailable(!!registration.waiting)
        inspectStatus(registration.active)
        const inspectWorker = () => {
          const worker = registration.installing
          if (!worker) return
          const onStateChange = () => {
            if (worker.state === 'installed' && registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true)
            if (worker.state === 'activated') inspectStatus(worker)
          }
          worker.addEventListener('statechange', onStateChange)
          cleanups.push(() => worker.removeEventListener('statechange', onStateChange))
        }
        inspectWorker()
        registration.addEventListener('updatefound', inspectWorker)
        cleanups.push(() => registration.removeEventListener('updatefound', inspectWorker))
      }).catch(() => { if (!disposed) setError('離線保存未能啟用，仍可在線上使用。重新連線後再開啟此頁可重試。') })
    }
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()) }
  }, [enabled])

  const applyUpdate = async () => {
    if (!updateAllowed(!!optionsRef.current.hasUnsavedChanges, isUpdating)) {
      setUpdateMessage('請先儲存或匯出編輯內容，再更新。')
      return false
    }
    setUpdating(true)
    setUpdateMessage('')
    try {
      if (optionsRef.current.beforeUpdate && !await optionsRef.current.beforeUpdate()) { setUpdating(false); return false }
      if (hasPendingSurveyChanges(optionsRef.current.hasUnsavedChanges)) { setUpdating(false); setUpdateMessage('請先儲存或匯出編輯內容，再更新。'); return false }
      if (reloadAvailable.current) { window.location.reload(); return true }
      const waiting = registrationRef.current?.waiting
      if (!waiting) { setUpdating(false); setUpdateAvailable(false); return false }
      reloadRequested.current = true
      waiting.postMessage({ type: 'WHEELWAY_ACTIVATE_UPDATE' })
      updateTimer.current = setTimeout(() => {
        reloadRequested.current = false
        setUpdating(false)
        setUpdateMessage('更新尚未完成，可稍後再試。編輯內容仍留在目前頁面。')
      }, 15_000)
      return true
    } catch {
      reloadRequested.current = false
      setUpdating(false)
      setUpdateMessage('更新未能完成，請稍後再試。')
      return false
    }
  }

  const install = async () => {
    if (!prompt) return
    try { await prompt.prompt(); await prompt.userChoice }
    catch { setError('請使用瀏覽器選單查看是否提供安裝或加入主畫面。') }
    finally { setPrompt(null) }
  }

  return { isOffline, offlineReady, snapshotDate, updateAvailable, isUpdating, error, updateMessage, canInstall: !!prompt && !installed, installed, applyUpdate, install }
}
