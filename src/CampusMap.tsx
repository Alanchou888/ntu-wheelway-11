import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Layers3, MapPin, Scan, X, CloudOff } from 'lucide-react'
import type { Campus, Coordinate, Mode, Route, Screen } from './types'
import { bottlenecks, lineMidpoint, routeCoordinates } from './routes'
import { reportState } from './community-model'
import type { CommunityReport, CommunitySegment } from './community-model'

interface Props {
  campus: Campus; routes: Route[]; selectedId: string; segmentId: string; mode: Mode; screen: Screen
  onSelectRoute: (id: string) => void; onSelectSegment: (id: string) => void
  pickingEntrance?: boolean; onPickEntrance?: (coordinate: Coordinate) => void
  layoutKey?: string; onMapDrag?: () => void
  preview?: { coordinate: Coordinate; following: boolean; reducedMotion: boolean }
  communityReports?: CommunityReport[]; communitySegments?: CommunitySegment[]; onSelectCommunity?: (segmentId:string)=>void
}
const latlng = (p: Coordinate): L.LatLngTuple => [p[1], p[0]]
export const colors = { gentle: '#205db6', direct: '#985a23', survey: '#205db6' }

export default function CampusMap(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routesRef = useRef<L.LayerGroup | null>(null)
  const facilitiesRef = useRef<L.LayerGroup | null>(null)
  const communityRef = useRef<L.LayerGroup | null>(null)
  const wmsRef = useRef<L.TileLayer.WMS | null>(null)
  const previewRef = useRef<L.Marker | null>(null)
  const actions = useRef(props)
  actions.current = props
  const [layersOpen, setLayersOpen] = useState(false)
  const [showCampus, setShowCampus] = useState(true)
  const [showRamps, setShowRamps] = useState(false)
  const [showCommunity, setShowCommunity] = useState(true)
  const [baseError, setBaseError] = useState(false)
  const [campusError, setCampusError] = useState(false)
  const geometryKey = JSON.stringify(props.routes.map(routeCoordinates))

  const visiblePadding = () => {
    const rect = rootRef.current!.getBoundingClientRect()
    const workspace = rootRef.current?.closest('.route-workspace')
    const sheet = workspace?.querySelector('.map-sheet')?.getBoundingClientRect()
    const dock = workspace?.querySelector('.experience-dock')?.getBoundingClientRect()
    const mobile = window.matchMedia('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)').matches
    const left = sheet && !mobile ? Math.max(24, sheet.right - rect.left + 24) : 24
    const bottom = sheet && mobile ? rect.bottom - sheet.top + 16 : dock ? rect.bottom - dock.top + 24 : 66
    const right = mobile ? 24 : 76
    const top = mobile && ['detail', 'confirm'].includes(actions.current.screen) ? 62 : 76
    return { topLeft: [left, top] as L.PointTuple, bottomRight: [right, bottom] as L.PointTuple,
      usable: rect.width - left - right > 120 && rect.height - bottom - top > 65 }
  }

  const refit = () => {
    const map = mapRef.current
    if (!map) return
    const current = actions.current
    const points = current.routes.flatMap(routeCoordinates)
    const padding = visiblePadding()
    const options = padding.usable ? { paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight } : { padding: [35, 40] as L.PointTuple }
    if (points.length) map.fitBounds(L.latLngBounds(points.map(latlng)), { ...options, maxZoom: 18, animate: false })
    else map.fitBounds(L.latLngBounds(current.campus.places.map(p => latlng(p.coordinate))), { ...options, maxZoom: 18, animate: false })
  }

  useEffect(() => {
    if (!rootRef.current) return
    const map = L.map(rootRef.current, { zoomControl: false, minZoom: 15, maxZoom: 20, scrollWheelZoom: true, attributionControl: true }).setView([25.0182, 121.5386], 17)
    mapRef.current = map
    map.on('dragstart', () => actions.current.onMapDrag?.())
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (actions.current.pickingEntrance) actions.current.onPickEntrance?.([event.latlng.lng, event.latlng.lat])
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.attributionControl.setPrefix(false)
    const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19, maxZoom: 20, className: 'base-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map)
    base.on('tileerror', () => setBaseError(true))
    // Keep a small attributed vector backdrop usable when external tiles fail.
    const pane = map.createPane('campusContext')
    pane.style.zIndex = '210'
    pane.style.pointerEvents = 'none'
    if (props.campus.context) {
      L.geoJSON(props.campus.context, {
        pane: 'campusContext', interactive: false,
        style: feature => {
          const kind = feature?.properties?.kind
          if (kind === 'road') return { color: '#fffdf8', opacity: .74, weight: 5, fillOpacity: .1 }
          if (kind === 'green') return { color: '#b8cfaa', weight: 1, fillColor: '#c5d8b8', fillOpacity: .35, opacity: .4 }
          if (kind === 'water') return { color: '#93bdc3', weight: 1, fillColor: '#a8cdd0', fillOpacity: .6 }
          return { color: '#b7c3bc', weight: 1, fillColor: '#d7dfd6', fillOpacity: .38, opacity: .6 }
        },
      }).addTo(map)
    }
    wmsRef.current = L.tileLayer.wms('https://map.ntu.edu.tw/geoNtuPublic/wms', {
      layers: 'gis:building_incamp,gis:ntu_road', format: 'image/png', transparent: true,
      version: '1.1.1', opacity: .26, maxZoom: 20, attribution: '<a href="https://map.ntu.edu.tw/" target="_blank" rel="noopener noreferrer">臺大校園 WMS</a>',
    })
    wmsRef.current.on('tileerror', () => setCampusError(true))
    routesRef.current = L.layerGroup().addTo(map)
    facilitiesRef.current = L.layerGroup().addTo(map)
    communityRef.current = L.layerGroup().addTo(map)
    const observer = new ResizeObserver(() => { map.invalidateSize({ pan: false }); refit() })
    observer.observe(rootRef.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; routesRef.current = null; facilitiesRef.current = null; wmsRef.current = null; previewRef.current = null }
  }, [props.campus])

  useEffect(() => {
    const map = mapRef.current, wms = wmsRef.current
    if (!map || !wms) return
    if (showCampus) wms.addTo(map)
    else wms.removeFrom(map)
  }, [showCampus, props.campus])

  useEffect(() => {
    const group = routesRef.current
    if (!group) return
    group.clearLayers()
    const focus = props.screen === 'detail' || props.screen === 'confirm'
    const selected = props.routes.find(r => r.id === props.selectedId) ?? props.routes[0]
    props.routes.forEach(route => {
      const isSelected = route.id === props.selectedId
      const color = props.mode === 'survey' ? '#82918a' : colors[route.id as keyof typeof colors] ?? colors.survey
      const points = routeCoordinates(route).map(latlng)
      L.polyline(points, { color: '#ffffff', weight: isSelected ? 10 : 8, opacity: focus && !isSelected ? .4 : .9, interactive: false, lineCap: 'round' }).addTo(group)
      const line = L.polyline(points, { color, weight: isSelected ? 5.5 : 4, opacity: focus && !isSelected ? .22 : isSelected ? 1 : .78, dashArray: route.id === 'direct' ? '8 7' : undefined })
      line.on('click', () => actions.current.onSelectRoute(route.id)).addTo(group)
      if (isSelected && (props.screen === 'detail' || props.screen === 'editor')) {
        route.segments.forEach(segment => {
          const active = segment.id === props.segmentId
          L.polyline(segment.coordinates.map(latlng), { color: active ? '#e09c37' : color, weight: active ? 8 : 5, opacity: 1 })
            .on('click', () => actions.current.onSelectSegment(segment.id)).addTo(group)
          if (active) L.circleMarker(latlng(segment.coordinates[0]), { radius: 6, color: '#fff', weight: 2, fillColor: '#d18b21', fillOpacity: 1 }).addTo(group)
        })
      }
    })
    if (selected && ['compare', 'detail', 'confirm'].includes(props.screen)) {
      const hints = bottlenecks(selected)
      selected.segments.forEach(segment => {
        const matches = hints.filter(h => h.segmentIds.includes(segment.id))
        if (!matches.length) return
        const label = matches.map(h => `${h.kind === 'slope' ? '最陡路段' : '最窄路段'} ${h.value}${h.kind === 'slope' ? '%' : ' m'}`).join('、')
        const title = `${segment.name}：${label}${selected.kind === 'demo' ? '（示範）' : ''}，點選查看路段`
        const icon = L.divIcon({ className: 'bottleneck-marker', html: `<span>${matches.map(h => h.kind === 'slope' ? '坡' : '窄').join(' / ')}</span>`, iconSize: [matches.length > 1 ? 66 : 44, 44], iconAnchor: [matches.length > 1 ? 33 : 22, 22] })
        const tooltip = document.createElement('span')
        tooltip.textContent = title
        const marker = L.marker(latlng(lineMidpoint(segment.coordinates)), { icon, title, keyboard: true, zIndexOffset: 200, bubblingMouseEvents: false }).bindTooltip(tooltip)
        marker.on('click', () => actions.current.onSelectSegment(segment.id)).addTo(group)
        const element = marker.getElement()
        if (element) {
          element.setAttribute('aria-label', title)
          L.DomEvent.on(element, 'keydown', event => {
            const key = (event as KeyboardEvent).key
            if (key === 'Enter' || key === ' ') {
              L.DomEvent.stop(event)
              actions.current.onSelectSegment(segment.id)
            }
          })
        }
      })
    }
    if (selected) {
      ;[selected.originEntrance, selected.destinationEntrance].forEach((entrance, i) => {
        const icon = L.divIcon({ className: 'endpoint-marker', html: `<span class="endpoint-dot ${i ? 'destination' : ''}">${i ? 'B' : 'A'}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })
        const label = document.createElement('span')
        label.textContent = `${entrance.placeId === 'library' ? '總圖書館' : '博雅教學館'}${props.mode === 'demo' ? ' · 示範入口' : ' · 入口'}`
        L.marker(latlng(entrance.coordinate), { icon, keyboard: false }).bindTooltip(label, { permanent: true, direction: i ? 'top' : 'bottom', offset: [0, i ? -17 : 17], className: 'entrance-label' }).addTo(group)
      })
    } else {
      props.campus.places.forEach(place => {
        const label = document.createElement('span')
        label.textContent = `${place.name} · 建物中心`
        L.circleMarker(latlng(place.coordinate), { radius: 7, color: '#fff', weight: 2, fillColor: '#6d8277', fillOpacity: 1 }).bindTooltip(label, { permanent: true, direction: 'top', className: 'entrance-label' }).addTo(group)
      })
    }
  }, [props.routes, props.selectedId, props.segmentId, props.mode, props.screen, props.campus])

  useEffect(() => {
    const group = facilitiesRef.current
    if (!group) return
    group.clearLayers()
    if (showRamps) props.campus.facilities.forEach(facility => {
      const content = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = facility.name
      const body = document.createElement('p')
      body.textContent = '公開斜坡道點位，尚未由團隊查核。'
      content.append(title, body)
      L.circleMarker(latlng(facility.coordinate), { radius: 6, color: '#fff', weight: 2, fillColor: '#c38a39', fillOpacity: .9 }).bindPopup(content).addTo(group)
    })
  }, [showRamps, props.campus])

  useEffect(()=>{
    const group=communityRef.current
    if(!group)return
    group.clearLayers()
    if(!showCommunity)return
    for(const segment of props.communitySegments??[]){
      const reports=(props.communityReports??[]).filter(r=>r.segmentId===segment.id)
      if(!reports.length)continue
      const active=reports.filter(r=>reportState(r).kind==='active')
      const blocked=active.some(r=>r.impact==='blocked')
      const title=`${segment.name}：${reports.length} 則社群路況，${active.length} 則近期回報，點選查看。標記代表整段道路。`
      const icon=L.divIcon({className:`community-map-marker ${blocked?'blocked':!active.length?'stale':''}`,html:`<span>${reports.length}</span>`,iconSize:[44,44],iconAnchor:[-10,44]})
      const label=document.createElement('span');label.textContent=title
      const marker=L.marker(latlng(segment.coordinate),{icon,title,keyboard:true,zIndexOffset:350,bubblingMouseEvents:false}).bindTooltip(label).addTo(group)
      marker.on('click',()=>actions.current.onSelectCommunity?.(segment.id))
      const element=marker.getElement()
      if(element){element.setAttribute('aria-label',title);element.setAttribute('role','button');L.DomEvent.on(element,'keydown',event=>{const key=(event as KeyboardEvent).key;if(key===' '||key==='Enter'){L.DomEvent.stop(event);actions.current.onSelectCommunity?.(segment.id)}})}
    }
  },[props.communityReports,props.communitySegments,showCommunity,props.campus])

  useEffect(() => { refit() }, [geometryKey, props.campus]) // Editing a measurement must not reset the map viewport.

  useEffect(() => {
    const timer = window.setTimeout(refit, 240)
    return () => clearTimeout(timer)
  }, [props.layoutKey, props.screen, props.campus])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!props.preview) { previewRef.current?.remove(); previewRef.current = null; return }
    const { coordinate, following, reducedMotion } = props.preview
    if (!previewRef.current) {
      const icon = L.divIcon({ className: 'tour-position-marker', html: '<span class="tour-position-dot"></span><span class="tour-position-label">預演位置</span>', iconSize: [36, 36], iconAnchor: [18, 18] })
      previewRef.current = L.marker(latlng(coordinate), { icon, interactive: false, keyboard: false, zIndexOffset: 600 }).addTo(map)
      previewRef.current.getElement()?.setAttribute('aria-hidden', 'true')
    } else previewRef.current.setLatLng(latlng(coordinate))
    const padding = visiblePadding()
    if (following && padding.usable) map.panInside(latlng(coordinate), { paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, animate: !reducedMotion, duration: .2 })
  }, [props.preview, props.layoutKey, props.campus])

  return <section className="map-shell" aria-label="臺大校園路線地圖">
    <div className={`map-canvas ${props.pickingEntrance ? 'picking-entrance' : ''}`} ref={rootRef} role="group" aria-label="校園地圖，所有路線與路段亦可使用旁邊的清單操作" />
    {props.pickingEntrance && <div className="map-pick-note" role="status">點選入口位置，座標會填入目前草稿</div>}
    <div className="map-title-pill"><span>臺大公館校區</span><span className="map-title-divider" /><span className="muted">總圖書館與博雅教學館</span></div>
    <div className="map-actions">
      <button className={`map-tool ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-label="地圖圖層" aria-expanded={layersOpen} title="地圖圖層"><Layers3 size={20} /></button>
      <button className="map-tool" onClick={refit} aria-label="回到完整路線" title="回到完整路線"><Scan size={20} /></button>
    </div>
    {layersOpen && <div className="layer-popover">
      <div className="layer-title">地圖圖層<button className="icon-button" onClick={() => setLayersOpen(false)} aria-label="關閉圖層選單"><X size={17} /></button></div>
      <label><input type="checkbox" checked={showCampus} onChange={e => setShowCampus(e.target.checked)} /><span>臺大校園建物與道路</span></label>
      <label><input type="checkbox" checked={showRamps} onChange={e => setShowRamps(e.target.checked)} /><span>公開斜坡道 <small>{props.campus.facilities.length} 個</small></span></label>
      <label><input type="checkbox" checked={showCommunity} onChange={e=>setShowCommunity(e.target.checked)}/><span>社群路況 <small>{props.communityReports?.length??0} 則</small></span></label>
      <p>公開點位尚未實地查核。</p>
    </div>}
    {(baseError || (showCampus && campusError)) && <div className="map-network-note" role="status"><CloudOff size={15} />{baseError ? '底圖暫時無法載入，仍可查看動線與清單。' : '校園圖層暫時無法載入，仍可使用底圖與動線。'}</div>}
    <div className="map-legend">
      {props.screen === 'editor' ? <span><MapPin size={15} />實勘草稿，尚未發布</span> : props.mode === 'demo' ? <><span><i className="legend-line gentle" />較平緩</span><span><i className="legend-line direct" />距離較短</span></> : <span><MapPin size={15} />已查核動線</span>}
    </div>
    <div className="map-north" aria-hidden="true"><span>↑</span>N</div>
  </section>
}
