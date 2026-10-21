import type { Coordinate } from './types'

export const LOCATION_FRESH_MS = 30_000
export interface DeviceFix { coordinate: Coordinate; accuracyM: number; timestamp: number }
export interface LocationSnapshot {
  status: 'off' | 'requesting' | 'tracking' | 'paused' | 'error'
  fix: DeviceFix | null; following: boolean; message: string; now: number; focusRequest: number
}
type Provider = Pick<Geolocation, 'watchPosition' | 'clearWatch'>

export function parseDeviceFix(position: GeolocationPosition, now: number): DeviceFix {
  const { longitude, latitude, accuracy } = position.coords
  if (![longitude, latitude, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0 || accuracy > 20_000_000) throw new Error('裝置回傳的位置無法使用，請重新定位。')
  if (position.timestamp > now + 5000 || now - position.timestamp > LOCATION_FRESH_MS) throw new Error('裝置回傳的位置已過期，請重新定位。')
  return { coordinate: [longitude, latitude], accuracyM: accuracy, timestamp: position.timestamp }
}

export function isLiveLocation(state: LocationSnapshot) {
  return state.status === 'tracking' && !!state.fix && state.now - state.fix.timestamp <= LOCATION_FRESH_MS
}
export function locationStatus(state: LocationSnapshot) {
  if (state.status === 'requesting') return '等待裝置定位'
  if (state.status === 'paused') return '定位已暫停'
  if (state.status === 'error') return '定位暫時無法使用'
  if (state.status === 'off') return '定位未開啟'
  return isLiveLocation(state) ? state.following ? '跟隨我的位置' : '定位已開啟' : '位置待更新'
}
export function accuracyLabel(accuracy: number) {
  return accuracy >= 1000 ? `約 ${(accuracy / 1000).toFixed(1)} 公里` : `約 ${Math.max(1, Math.round(accuracy))} 公尺`
}

/** A page-scoped session. No position is written to storage, URLs or APIs. */
export class DeviceLocationSession {
  private value: LocationSnapshot
  private listeners = new Set<() => void>()
  private watchId: number | null = null
  private generation = 0
  constructor(private provider: Provider | undefined, private secure: boolean, private clock: () => number = Date.now) {
    this.value = { status: 'off', fix: null, following: false, message: '', now: this.clock(), focusRequest: 0 }
  }
  snapshot = () => this.value
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<LocationSnapshot>) {
    this.value = { ...this.value, ...patch, now: this.clock() }
    for (const listener of this.listeners) listener()
  }
  private cancel() {
    this.generation++
    if (this.watchId !== null) this.provider?.clearWatch(this.watchId)
    this.watchId = null
  }
  start = () => {
    this.cancel()
    if (!this.secure) { this.update({ status: 'error', fix: null, following: false, message: '定位需要安全連線，請使用正式網站的 HTTPS 網址。' }); return }
    if (!this.provider) { this.update({ status: 'error', fix: null, following: false, message: '目前瀏覽器未提供定位，請用手機 Chrome 或 Safari 開啟網站。' }); return }
    const generation = this.generation
    this.update({ status: 'requesting', following: true, message: '請在瀏覽器提示中允許位置存取。', focusRequest: this.value.focusRequest + 1 })
    const fail = (message: string, denied = false) => {
      if (generation !== this.generation) return
      this.cancel()
      this.update({ status: 'error', following: false, ...(denied ? { fix: null } : {}), message })
    }
    try {
      const id = this.provider.watchPosition(position => {
        if (generation !== this.generation) return
        try {
          const fix = parseDeviceFix(position, this.clock())
          if (this.value.fix && fix.timestamp < this.value.fix.timestamp) return
          this.update({ status: 'tracking', fix, message: '' })
        } catch (error) { fail(error instanceof Error ? error.message : '裝置位置無法使用。') }
      }, error => {
        const messages: Record<number, string> = {
          1: '定位權限未開啟。可在瀏覽器網站設定允許位置後重試，或用手機 Chrome、Safari 開啟。',
          2: '目前找不到裝置位置。請確認系統定位已開啟，移到訊號較好的位置後再試。',
          3: '取得位置逾時。請確認系統定位與訊號，再按重新定位。',
        }
        fail(messages[error.code] ?? '定位暫時無法使用，請稍後重試。', error.code === 1)
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 12_000 })
      if (generation === this.generation) this.watchId = id
      else this.provider.clearWatch(id)
    } catch { fail('瀏覽器無法啟動定位，請檢查位置權限，或用手機 Chrome、Safari 開啟。', true) }
  }
  stop = () => {
    this.cancel()
    this.update({ status: 'off', fix: null, following: false, message: '定位已停止，本頁的位置已清除。' })
  }
  pause = () => {
    if (this.value.status !== 'tracking' && this.value.status !== 'requesting') return
    this.cancel()
    this.update({ status: 'paused', following: false, message: '已暫停取得位置。回到頁面後可按「繼續定位」。' })
  }
  setFollowing = (following: boolean) => {
    if (following && !isLiveLocation({ ...this.value, now: this.clock() })) return
    if (!following && !this.value.following) return
    this.update({ following, ...(following ? { focusRequest: this.value.focusRequest + 1 } : {}) })
  }
  tick = () => { if (this.value.fix) this.update({}) }
  release = () => { this.cancel(); this.update({ status: 'off', fix: null, following: false, message: '' }) }
}

/** Coverage describes this product's fixed campus reference area only. */
export function withinLocationCoverage(fix: DeviceFix, points: Coordinate[]) {
  if (!points.length) return false
  const latitude = points.reduce((sum,p) => sum+p[1],0)/points.length
  const lngPadding=250/(111_320*Math.max(.1,Math.cos(latitude*Math.PI/180)))
  const latPadding=250/110_540
  return fix.coordinate[0] >= Math.min(...points.map(p=>p[0]))-lngPadding && fix.coordinate[0] <= Math.max(...points.map(p=>p[0]))+lngPadding
    && fix.coordinate[1] >= Math.min(...points.map(p=>p[1]))-latPadding && fix.coordinate[1] <= Math.max(...points.map(p=>p[1]))+latPadding
}
