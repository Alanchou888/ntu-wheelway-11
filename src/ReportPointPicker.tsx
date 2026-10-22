import { useEffect, useId, useRef, useState } from 'react'
import L from 'leaflet'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MapPin, X } from 'lucide-react'
import type { Coordinate } from './types'
import type { CommunitySegment } from './community-model'
import { validateReportPoint } from './road-conditions'

export default function ReportPointPicker({ segment, coordinate, onChange, active }: { segment?: CommunitySegment; coordinate: Coordinate | null; onChange: (point: Coordinate | null) => void; active: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pin = useRef<L.Marker | null>(null)
  const lastPoint = useRef(coordinate)
  lastPoint.current = coordinate
  const actions = useRef({ onChange, segment })
  actions.current = { onChange, segment }
  const [error, setError] = useState('')
  const [tilesFailed, setTilesFailed] = useState(false)
  const hint = useId()
  const choose = (point: Coordinate) => {
    try {
      validateReportPoint(point, actions.current.segment?.coordinates)
      setError('')
      actions.current.onChange(point.map(n => Number(n.toFixed(6))) as Coordinate)
    } catch (e) { setError(e instanceof Error ? e.message : '請重新選擇位置。') }
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose

  useEffect(() => {
    if (!root.current || !segment || !active) return
    const instance = L.map(root.current, { scrollWheelZoom: false, minZoom: 16, maxZoom: 20, attributionControl: true }).setView([segment.coordinate[1], segment.coordinate[0]], 18)
    map.current = instance
    instance.attributionControl.setPrefix(false)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19, maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).on('tileerror', () => setTilesFailed(true)).addTo(instance)
    if (segment.coordinates?.length) {
      const line = L.polyline(segment.coordinates.map(p => [p[1], p[0]] as L.LatLngTuple), { color: '#205db6', weight: 6, bubblingMouseEvents: true }).addTo(instance)
      instance.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 18, animate: false })
    }
    instance.on('click', (event: L.LeafletMouseEvent) => chooseRef.current([event.latlng.lng, event.latlng.lat]))
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    observer.observe(root.current)
    return () => { observer.disconnect(); instance.remove(); map.current = null; pin.current = null }
  }, [segment?.id, active])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (!coordinate) { pin.current?.remove(); pin.current = null; return }
    if (!pin.current) {
      const element = document.createElement('span')
      element.textContent = '!'
      const icon = L.divIcon({ className: 'report-picked-pin', html: element, iconSize: [44, 44], iconAnchor: [22, 22] })
      pin.current = L.marker([coordinate[1], coordinate[0]], { icon, draggable: true, title: '回報位置，可拖曳或使用下方微調按鈕', keyboard: true }).addTo(instance)
      pin.current.on('dragend', () => {
        const position = pin.current!.getLatLng()
        chooseRef.current([position.lng, position.lat])
        // Restore the last valid point if the drag was rejected.
        if (lastPoint.current) pin.current?.setLatLng([lastPoint.current[1], lastPoint.current[0]])
      })
    } else pin.current.setLatLng([coordinate[1], coordinate[0]])
  }, [coordinate, active, segment?.id])

  if (!segment) return null
  const nudge = (east: number, north: number) => {
    const start = coordinate ?? segment.coordinate
    choose([start[0] + east / (111_320 * Math.cos(start[1] * Math.PI / 180)), start[1] + north / 111_320])
  }
  return <section className="report-point-picker" aria-label="選擇障礙位置">
    <div className="report-point-heading"><strong><MapPin size={17} aria-hidden="true" />標記位置（選填）</strong>{coordinate && <button type="button" onClick={() => { onChange(null); setError('') }}><X size={15} />清除</button>}</div>
    <p id={hint}>點選藍色路段附近，或用下方按鈕選取及微調。發布後，這個標記位置會公開顯示。</p>
    <div ref={root} className="report-point-map" role="group" aria-label="回報落點地圖，可改用下方按鈕選取位置" aria-describedby={hint} />
    {tilesFailed && <p className="report-point-notice">底圖暫時無法載入，藍色路段與下方位置按鈕仍可使用。</p>}
    <div className="report-point-tools"><button type="button" className="button secondary" onClick={() => { choose(segment.coordinate); map.current?.panTo([segment.coordinate[1], segment.coordinate[0]], { animate: false }) }}>選取路段中點</button><div className="report-point-nudge" role="group" aria-label="微調標記，每次 2 公尺">{[{ x: -2, y: 0, label: '向西移動 2 公尺', Icon: ArrowLeft }, { x: 0, y: 2, label: '向北移動 2 公尺', Icon: ArrowUp }, { x: 0, y: -2, label: '向南移動 2 公尺', Icon: ArrowDown }, { x: 2, y: 0, label: '向東移動 2 公尺', Icon: ArrowRight }].map(({ x, y, label, Icon }) => <button key={label} type="button" disabled={!coordinate} aria-label={label} title={label} onClick={() => nudge(x, y)}><Icon size={18} /></button>)}</div></div>
    <p className="report-point-value" role="status">{coordinate ? `已選位置：${coordinate[1].toFixed(6)}, ${coordinate[0].toFixed(6)}。方向按鈕每次微調 2 公尺。` : '尚未指定位置，將以整段道路回報。'}</p>
    {error && <p className="report-point-error" role="alert">{error}</p>}
  </section>
}
