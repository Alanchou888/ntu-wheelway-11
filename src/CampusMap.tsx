import { useEffect, useMemo, useRef, useState } from 'react'
import {createPortal} from 'react-dom'
import L from 'leaflet'
import { Layers3, MapPin, Scan, X, CloudOff } from 'lucide-react'
import type { Campus, CatalogCategory, CatalogPlace, Coordinate, MapTheme, Mode, Route, Screen } from './types'
import { bottlenecks, lineMidpoint, routeCoordinates } from './routes'
import { categories, reportState } from './community-model'
import type { CommunityReport, CommunitySegment } from './community-model'
import { isLiveLocation, withinLocationCoverage } from './device-location'
import type { DeviceLocationSession } from './device-location'
import { useDeviceLocation } from './useDeviceLocation'
import LocationControls from './LocationControls'
import {categoryLabels,findPlaces} from './places'
import { reportMatchesSegment, slopeStyle } from './road-conditions'
import { mapThemes, ThemeChooser, ThemeLegend } from './MapThemes'

interface Props {
  campus: Campus; routes: Route[]; selectedId: string; segmentId: string; mode: Mode; screen: Screen
  onSelectRoute: (id: string) => void; onSelectSegment: (id: string) => void
  pickingEntrance?: boolean; onPickEntrance?: (coordinate: Coordinate) => void
  layoutKey?: string; onMapDrag?: () => void
  preview?: { coordinate: Coordinate; following: boolean; reducedMotion: boolean; playing?: boolean }
  communityReports?: CommunityReport[]; communitySegments?: CommunitySegment[]; onSelectCommunity?: (segmentId:string)=>void
  onLocationActivity?:()=>void; locationSession?:DeviceLocationSession
  catalogPlaces?:CatalogPlace[];catalogCategory?:CatalogCategory;catalogQuery?:string;selectedPlaceId?:string;discoveryActive?:boolean
  onSelectPlace?:(id:string)=>void;onReturnRoutes?:()=>void
  mapTheme?:MapTheme;onThemeChange?:(theme:MapTheme)=>void
  communityFocus?:{coordinate:Coordinate;request:number}
}
const latlng = (p: Coordinate): L.LatLngTuple => [p[1], p[0]]
export const colors = { gentle: '#205db6', direct: '#985a23', survey: '#205db6' }

export default function CampusMap(props: Props) {
  const device = useDeviceLocation(props.locationSession)
  const locationActions=useRef(device)
  locationActions.current=device
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routesRef = useRef<L.LayerGroup | null>(null)
  const facilitiesRef = useRef<L.LayerGroup | null>(null)
  const communityRef = useRef<L.LayerGroup | null>(null)
  const placesRef=useRef<L.LayerGroup|null>(null)
  const buildingClicksRef=useRef<L.LayerGroup|null>(null)
  const wmsRef = useRef<L.TileLayer.WMS | null>(null)
  const previewRef = useRef<L.Marker | null>(null)
  const ownMarkerRef=useRef<L.Marker|null>(null)
  const accuracyRef=useRef<L.Circle|null>(null)
  const ownFocusRef=useRef(0)
  const actions = useRef(props)
  actions.current = props
  const layerButton=useRef<HTMLButtonElement>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  useEffect(()=>{if(!layersOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setLayersOpen(false);layerButton.current?.focus()}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[layersOpen])
  const [showCampus, setShowCampus] = useState(true)
  const [showRamps, setShowRamps] = useState(false)
  const [showCommunity, setShowCommunity] = useState(true)
  const [baseError, setBaseError] = useState(false)
  const [campusError, setCampusError] = useState(false)
  const [zoom,setZoom]=useState(17)
  const [viewRevision,setViewRevision]=useState(0)
  const theme=props.mapTheme??'routes'
  const showFacilities=theme==='facilities'||(theme==='routes'&&showRamps)
  const catalogMatches=useMemo(()=>props.catalogPlaces?findPlaces(props.catalogPlaces,props.catalogQuery,props.catalogCategory):[],[props.catalogPlaces,props.catalogQuery,props.catalogCategory])
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
    const top = mobile&&actions.current.catalogPlaces?128:mobile && ['detail', 'confirm'].includes(actions.current.screen) ? 62 : 76
    return { topLeft: [left, top] as L.PointTuple, bottomRight: [right, bottom] as L.PointTuple,
      usable: rect.width - left - right > 120 && rect.height - bottom - top > 65 }
  }

  const focusMyLocation = (resetZoom=false) => {
    const map=mapRef.current, current=locationActions.current.state
    if(!map||!current.fix||!isLiveLocation(current))return
    const padding=visiblePadding()
    if(resetZoom)map.setZoom(17,{animate:false})
    if(padding.usable)map.panInside(latlng(current.fix.coordinate),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,animate:false})
  }

  const focusPlace=()=>{
    const map=mapRef.current,current=actions.current
    if(!map||!current.discoveryActive||!current.catalogPlaces)return false
    const place=current.catalogPlaces.find(p=>p.id===current.selectedPlaceId)
    const points=place?[place]:findPlaces(current.catalogPlaces,current.catalogQuery,current.catalogCategory)
    if(!points.length)return false
    const padding=visiblePadding()
    if(!padding.usable)return false
    if(place){map.setZoom(18,{animate:false});map.panInside(latlng(place.coordinate),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,animate:false})}
    else map.fitBounds(L.latLngBounds(points.map(p=>latlng(p.coordinate))),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,maxZoom:18,animate:false})
    return true
  }
  const refit = (respectLocation=true,respectDiscovery=true) => {
    const map = mapRef.current
    if (!map) return
    if(respectDiscovery&&focusPlace())return
    const own=locationActions.current.state
    if(respectLocation&&own.following&&isLiveLocation(own)&&!actions.current.preview?.following&&!actions.current.preview?.playing){focusMyLocation();return}
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
    map.on('zoomend',()=>setZoom(map.getZoom()))
    map.on('moveend',()=>setViewRevision(value=>value+1))
    map.on('dragstart', () => {locationActions.current.session.setFollowing(false);actions.current.onMapDrag?.()})
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
    placesRef.current=L.layerGroup().addTo(map)
    buildingClicksRef.current=L.layerGroup().addTo(map)
    const observer = new ResizeObserver(() => { map.invalidateSize({ pan: false }); refit() })
    observer.observe(rootRef.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; routesRef.current = null; facilitiesRef.current = null; wmsRef.current = null; previewRef.current = null; ownMarkerRef.current=null;accuracyRef.current=null;ownFocusRef.current=0;placesRef.current=null;buildingClicksRef.current=null }
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
    if(props.discoveryActive)return
    const focus = props.screen === 'detail' || props.screen === 'confirm'
    const selected = props.routes.find(r => r.id === props.selectedId) ?? props.routes[0]
    props.routes.forEach(route => {
      const isSelected = route.id === props.selectedId
      const color = theme==='slope'||theme==='conditions' ? '#718096' : props.mode === 'survey' ? '#82918a' : colors[route.id as keyof typeof colors] ?? colors.survey
      const points = routeCoordinates(route).map(latlng)
      L.polyline(points, { color: '#ffffff', weight: isSelected ? 10 : 8, opacity: focus && !isSelected ? .4 : .9, interactive: false, lineCap: 'round' }).addTo(group)
      const line = L.polyline(points, { color, weight: isSelected ? 5.5 : 4, opacity: focus && !isSelected ? .22 : isSelected ? 1 : .78, dashArray: route.id === 'direct' ? '8 7' : undefined })
      line.on('click', () => actions.current.onSelectRoute(route.id)).addTo(group)
      if(theme==='slope'||theme==='conditions')route.segments.forEach(segment=>{
        const reports=(props.communityReports??[]).filter(r=>reportMatchesSegment(r,segment,props.communitySegments))
        const active=reports.filter(r=>reportState(r).kind==='active')
        const blocked=active.some(r=>r.impact==='blocked'),difficult=active.some(r=>r.impact==='difficult')
        const style=theme==='slope'?slopeStyle(segment.maxSlopePercent):{color:blocked?'#973628':difficult?'#a55d16':'#67778a',dashArray:blocked?'3 4':difficult?'10 4':'3 6',label:blocked?'近期有人回報無法通行':difficult?'近期有人回報通行困難':reports.length?'其他或待確認回報':'尚無回報，通行情況待確認'}
        const label=document.createElement('span');label.textContent=`${segment.name}：${theme==='slope'?(segment.maxSlopePercent===null?'坡度未知':`最大坡度 ${segment.maxSlopePercent}%${props.mode==='demo'?'（示範）':''}`):style.label}`
        L.polyline(segment.coordinates.map(latlng),{color:style.color,weight:segment.id===props.segmentId?8:isSelected?6:4,opacity:focus&&!isSelected?0.5:1,dashArray:style.dashArray}).bindTooltip(label).on('click',()=>actions.current.onSelectSegment(segment.id)).addTo(group)
      })
      if (theme==='routes' && isSelected && (props.screen === 'detail' || props.screen === 'editor')) {
        route.segments.forEach(segment => {
          const active = segment.id === props.segmentId
          L.polyline(segment.coordinates.map(latlng), { color: active ? '#e09c37' : color, weight: active ? 8 : 5, opacity: 1 })
            .on('click', () => actions.current.onSelectSegment(segment.id)).addTo(group)
          if (active) L.circleMarker(latlng(segment.coordinates[0]), { radius: 6, color: '#fff', weight: 2, fillColor: '#d18b21', fillOpacity: 1 }).addTo(group)
        })
      }
    })
    if (theme==='routes' && selected && ['compare', 'detail', 'confirm'].includes(props.screen)) {
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
  }, [props.routes, props.selectedId, props.segmentId, props.mode, props.screen, props.campus,props.discoveryActive,theme,props.communityReports,props.communitySegments])

  useEffect(() => {
    const group = facilitiesRef.current
    if (!group) return
    group.clearLayers()
    if (showFacilities&&!props.catalogPlaces) props.campus.facilities.forEach(facility => {
      const content = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = facility.name
      const body = document.createElement('p')
      body.textContent = '公開斜坡道點位，尚未由團隊查核。'
      content.append(title, body)
      L.circleMarker(latlng(facility.coordinate), { radius: 6, color: '#fff', weight: 2, fillColor: '#c38a39', fillOpacity: .9 }).bindPopup(content).addTo(group)
    })
  }, [showFacilities, props.campus,props.catalogPlaces])

  useEffect(()=>{
    const group=buildingClicksRef.current
    if(!group)return
    group.clearLayers()
    if(!props.catalogPlaces||!props.campus.context)return
    const placeFor=(feature:GeoJSON.Feature)=>props.catalogPlaces?.find(p=>p.contextId===String(feature.id)||p.routePlaceId&&(p.name===feature.properties?.name||p.aliases.includes(feature.properties?.name)))
    L.geoJSON(props.campus.context,{
      filter:feature=>!!placeFor(feature),
      style:{stroke:false,fillColor:'#205db6',fillOpacity:.015},
      onEachFeature:(feature,layer)=>{
        const place=placeFor(feature)
        if(place)layer.on('click',(event:L.LeafletMouseEvent)=>{L.DomEvent.stopPropagation(event);actions.current.onSelectPlace?.(place.id)})
      },
    }).addTo(group)
  },[props.catalogPlaces,props.campus])

  useEffect(()=>{
    const group=placesRef.current
    if(!group)return
    group.clearLayers()
    if(!props.catalogPlaces)return
    const selected=props.catalogPlaces.find(p=>p.id===props.selectedPlaceId)
    if(selected){
      const feature=props.campus.context?.features.find(f=>selected.contextId===String(f.id)||selected.routePlaceId&&(selected.name===f.properties?.name||selected.aliases.includes(f.properties?.name)))
      if(feature)L.geoJSON(feature,{interactive:false,style:{color:'#205db6',weight:2,fillColor:'#5798e2',fillOpacity:.17}}).addTo(group)
    }
    const filtered=!!props.catalogCategory||!!props.catalogQuery?.trim()
    const bounds=mapRef.current?.getBounds().pad(.05)
    const shown=props.catalogPlaces.filter(p=>p.id===props.selectedPlaceId||(bounds?.contains(latlng(p.coordinate))&&(filtered?catalogMatches.some(match=>match.id===p.id):theme==='facilities'?p.category!=='building'&&p.category!=='landmark':!!p.routePlaceId||showFacilities&&p.category==='ramp'||zoom>=17&&p.category==='landmark'||zoom>=19&&p.category==='building')))
    for(const place of shown){
      const active=place.id===props.selectedPlaceId
      const element=document.createElement('span');element.textContent=({building:'館',toilet:'廁',elevator:'梯',water:'水',rest:'休',ramp:'坡',landmark:'景'} as const)[place.category]
      const icon=L.divIcon({className:`catalog-map-marker ${active?'selected':''}`,html:element,iconSize:[44,44],iconAnchor:[22,22]})
      const label=document.createElement('span');label.textContent=place.name
      const marker=L.marker(latlng(place.coordinate),{icon,keyboard:true,title:place.name,zIndexOffset:active?850:100,bubblingMouseEvents:false}).bindTooltip(label,{permanent:active,direction:'top',offset:[0,-18],className:'catalog-place-label'}).addTo(group)
      marker.on('click',()=>actions.current.onSelectPlace?.(place.id))
      const target=marker.getElement()
      target?.setAttribute('aria-label',`開啟地點：${place.name}，${categoryLabels[place.category]}`)
      if(target)L.DomEvent.on(target,'keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){L.DomEvent.preventDefault(event);actions.current.onSelectPlace?.(place.id)}})
    }
  },[props.catalogPlaces,props.catalogCategory,props.catalogQuery,props.selectedPlaceId,props.campus,catalogMatches,showFacilities,theme,zoom,viewRevision])

  useEffect(()=>{
    if(!props.discoveryActive)return
    device.session.setFollowing(false)
    const timer=window.setTimeout(focusPlace,props.selectedPlaceId?0:200)
    return()=>clearTimeout(timer)
  },[props.selectedPlaceId,props.catalogCategory,props.catalogQuery,props.catalogPlaces,props.discoveryActive,props.layoutKey,device.session])

  useEffect(()=>{
    const group=communityRef.current
    if(!group)return
    group.clearLayers()
    if(theme!=='conditions'&&(theme!=='routes'||!showCommunity))return
    for(const segment of props.communitySegments??[]){
      const reports=(props.communityReports??[]).filter(r=>r.segmentId===segment.id&&!r.coordinate)
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
    for(const report of (props.communityReports??[]).filter(r=>r.coordinate)){
      const state=reportState(report),segment=props.communitySegments?.find(s=>s.id===report.segmentId)
      const title=`${segment?.name??'路段'}：${categories[report.category]}，${state.label}。使用者標記位置，未經實勘。`
      const content=document.createElement('span');content.textContent='!'
      const icon=L.divIcon({className:`community-map-marker precise ${state.kind!=='active'?'stale':report.impact==='blocked'?'blocked':''}`,html:content,iconSize:[44,44],iconAnchor:[22,22]})
      const label=document.createElement('span');label.textContent=title
      const marker=L.marker(latlng(report.coordinate!),{icon,title,keyboard:true,zIndexOffset:400,bubblingMouseEvents:false}).bindTooltip(label).addTo(group)
      marker.on('click',()=>actions.current.onSelectCommunity?.(report.segmentId))
      const element=marker.getElement();element?.setAttribute('aria-label',title);element?.setAttribute('role','button')
      if(element)L.DomEvent.on(element,'keydown',event=>{const key=(event as KeyboardEvent).key;if(key===' '||key==='Enter'){L.DomEvent.stop(event);actions.current.onSelectCommunity?.(report.segmentId)}})
    }
  },[props.communityReports,props.communitySegments,showCommunity,props.campus,theme])

  useEffect(()=>{
    if(!props.communityFocus)return
    const timer=window.setTimeout(()=>{
      const map=mapRef.current,point=props.communityFocus?.coordinate
      if(!map||!point)return
      const padding=visiblePadding()
      device.session.setFollowing(false)
      map.setZoom(19,{animate:false})
      if(padding.usable)map.panInside(latlng(point),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,animate:false})
      else map.panTo(latlng(point),{animate:false})
    },300)
    return()=>clearTimeout(timer)
  },[props.communityFocus,props.layoutKey,props.screen,device.session])

  useEffect(() => { refit() }, [geometryKey, props.campus]) // Editing a measurement must not reset the map viewport.

  useEffect(() => {
    const timer = window.setTimeout(()=>refit(), 240)
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

  useEffect(()=>{
    if(props.preview?.playing||props.preview?.following)device.session.setFollowing(false)
  },[props.preview?.playing,props.preview?.following,device.session])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    const state=device.state
    if(!state.fix){ownMarkerRef.current?.remove();accuracyRef.current?.remove();ownMarkerRef.current=null;accuracyRef.current=null;return}
    const live=isLiveLocation(state),color=live?'#146cda':'#6c7c8c'
    const icon=L.divIcon({className:`device-location-marker ${live?'':'stale'}`,html:'<span></span>',iconSize:[32,32],iconAnchor:[16,16]})
    const label=document.createElement('span');label.textContent=live?'我的位置':'上次位置，待更新'
    if(!ownMarkerRef.current){
      ownMarkerRef.current=L.marker(latlng(state.fix.coordinate),{icon,keyboard:false,interactive:false,zIndexOffset:700}).bindTooltip(label,{permanent:true,direction:'top',offset:[0,-15],className:'device-location-label'}).addTo(map)
      ownMarkerRef.current.getElement()?.setAttribute('aria-hidden','true')
      accuracyRef.current=L.circle(latlng(state.fix.coordinate),{radius:state.fix.accuracyM,color,weight:1,fillColor:color,fillOpacity:.12,interactive:false}).addTo(map)
    }else{
      ownMarkerRef.current.setLatLng(latlng(state.fix.coordinate)).setIcon(icon).setTooltipContent(label)
      accuracyRef.current?.setLatLng(latlng(state.fix.coordinate)).setRadius(state.fix.accuracyM).setStyle({color,fillColor:color})
    }
    if(state.following&&live&&!props.preview?.playing&&!props.preview?.following){
      const resetZoom=ownFocusRef.current!==state.focusRequest
      ownFocusRef.current=state.focusRequest
      focusMyLocation(resetZoom)
    }
  },[device.state,props.campus,props.layoutKey,props.preview?.playing,props.preview?.following])

  return <section className="map-shell" aria-label="臺大校園路線地圖">
    <div className={`map-canvas ${props.pickingEntrance ? 'picking-entrance' : ''}`} ref={rootRef} role="group" aria-label="校園地圖，所有路線與路段亦可使用旁邊的清單操作" />
    {props.pickingEntrance && <div className="map-pick-note" role="status">點選入口位置，座標會填入目前草稿</div>}
    <div className="map-title-pill"><span>臺大公館校區</span><span className="map-title-divider" /><span className="muted">總圖書館與博雅教學館</span></div>
    <div className="map-actions">
      <button ref={layerButton} className={`map-tool map-theme-tool ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-label="地圖圖層" aria-expanded={layersOpen} title="地圖圖層"><Layers3 size={20} /><span>{theme==='routes'?'圖層':mapThemes.find(t=>t.id===theme)?.label}</span></button>
      <button className="map-tool" onClick={()=>{device.session.setFollowing(false);if(props.discoveryActive)props.onReturnRoutes?.();refit(false,false)}} aria-label="回到完整路線" title="回到完整路線"><Scan size={20} /></button>
      {props.screen!=='editor'&&<LocationControls state={device.state} session={device.session} inCoverage={!device.state.fix||withinLocationCoverage(device.state.fix,props.campus.paths.flatMap(path=>path.coordinates))} onActivity={()=>actions.current.onLocationActivity?.()}/>}
    </div>
    {layersOpen && createPortal(<div className="layer-popover">
      <div className="layer-title">地圖圖層<button className="icon-button" onClick={() => setLayersOpen(false)} aria-label="關閉圖層選單"><X size={17} /></button></div>
      {props.onThemeChange&&<><ThemeChooser theme={theme} onChange={next=>{props.onThemeChange?.(next);setLayersOpen(false);layerButton.current?.focus()}} /><ThemeLegend theme={theme} mode={props.mode}/></>}
      <label><input type="checkbox" checked={showCampus} onChange={e => setShowCampus(e.target.checked)} /><span>臺大校園建物與道路</span></label>
      <label><input type="checkbox" checked={showFacilities} disabled={theme!=='routes'} onChange={e => setShowRamps(e.target.checked)} /><span>公開斜坡道 <small>{props.campus.facilities.length} 個</small></span></label>
      <label><input type="checkbox" checked={theme==='conditions'||theme==='routes'&&showCommunity} disabled={theme!=='routes'} onChange={e=>setShowCommunity(e.target.checked)}/><span>社群路況 <small>{props.communityReports?.length??0} 則</small></span></label>
      <p>公開點位尚未實地查核。</p>
    </div>,rootRef.current?.closest('.route-workspace')??document.body)}
    {(baseError || (showCampus && campusError)) && <div className="map-network-note" role="status"><CloudOff size={15} />{baseError ? '底圖暫時無法載入，仍可查看動線與清單。' : '校園圖層暫時無法載入，仍可使用底圖與動線。'}</div>}
    <div className={`map-legend ${theme!=='routes'?'theme-legend':''}`} aria-live="polite">
      {theme!=='routes'?<ThemeLegend theme={theme} mode={props.mode}/>:props.screen === 'editor' ? <span><MapPin size={15} />實勘草稿，尚未發布</span> : props.mode === 'demo' ? <><span><i className="legend-line gentle" />較平緩</span><span><i className="legend-line direct" />距離較短</span></> : <span><MapPin size={15} />已查核動線</span>}
    </div>
    <div className="map-north" aria-hidden="true"><span>↑</span>N</div>
  </section>
}
