import { useEffect, useMemo, useRef, useState } from 'react'
import {createPortal} from 'react-dom'
import L from 'leaflet'
import { Layers3, MapPin, Minus, Plus, Scan, X, CloudOff } from 'lucide-react'
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
import { groupFieldMarkers } from './field-marker-groups'
import { fieldKinds, fieldObservation } from './field-observations'
import { drawPlannerMap } from './planner-map'
import type { PlannerMapOverlay } from './planner-map'

interface Props {
  campus: Campus; routes: Route[]; selectedId: string; segmentId: string; mode: Mode; screen: Screen
  onSelectRoute: (id: string) => void; onSelectSegment: (id: string) => void
  pickingEntrance?: boolean; onPickEntrance?: (coordinate: Coordinate) => void
  layoutKey?: string; onMapDrag?: () => void
  mapObscured?: boolean
  preview?: { coordinate: Coordinate; following: boolean; reducedMotion: boolean; playing?: boolean }
  communityReports?: CommunityReport[]; communitySegments?: CommunitySegment[]; onSelectCommunity?: (segmentId:string)=>void
  onLocationActivity?:()=>void; locationSession?:DeviceLocationSession
  catalogPlaces?:CatalogPlace[];catalogCategory?:CatalogCategory;catalogQuery?:string;selectedPlaceId?:string;discoveryActive?:boolean
  onSelectPlace?:(id:string)=>void;onReturnRoutes?:()=>void
  fieldGroupIds?: string[]; onSelectFieldGroup?: (ids: string[]) => void
  mapTheme?:MapTheme;onThemeChange?:(theme:MapTheme)=>void
  communityFocus?:{coordinate:Coordinate;request:number}
  planner?: PlannerMapOverlay
  plannerPickError?: string
  onCancelPlannerPick?: () => void
}
const latlng = (p: Coordinate): L.LatLngTuple => [p[1], p[0]]
const fieldGroupIncludes = (place: CatalogPlace, ids?: string[]) => !ids || ids.includes(place.id)
export const colors = { 'walk-out': '#205db6', 'walk-back': '#985a23', gentle: '#205db6', direct: '#985a23', survey: '#205db6' }

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
  const fittedView = useRef('')
  const inspectedSegment = useRef('')
  const actions = useRef(props)
  actions.current = props
  const layerButton=useRef<HTMLButtonElement>(null)
  const layerPanel = useRef<HTMLDivElement>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  useEffect(()=>{if(!layersOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setLayersOpen(false);layerButton.current?.focus()}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[layersOpen])
  useEffect(() => {
    if (props.mapObscured) setLayersOpen(false)
    else if (layersOpen) layerPanel.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [layersOpen, props.mapObscured])
  const [showCampus, setShowCampus] = useState(true)
  const [showRamps, setShowRamps] = useState(false)
  const [showCommunity, setShowCommunity] = useState(true)
  const [baseError, setBaseError] = useState(false)
  const [campusError, setCampusError] = useState(false)
  const [zoom,setZoom]=useState(17)
  const [viewRevision,setViewRevision]=useState(0)
  const theme=props.mapTheme??'routes'
  const showFacilities=theme==='facilities'||(theme==='routes'&&showRamps)
  const catalogMatches=useMemo(() => {
    const matches = props.catalogPlaces ? findPlaces(props.catalogPlaces, props.catalogQuery, props.catalogCategory) : []
    return matches.filter(place => fieldGroupIncludes(place, props.fieldGroupIds))
  },[props.catalogPlaces,props.catalogQuery,props.catalogCategory,props.fieldGroupIds])
  const showWalkedPoints = props.mode === 'demo' && props.routes.some(route => route.walked)
  const simulatedSlopes = props.routes.some(route => route.kind === 'demo' && !route.walked)
  const viewingFieldPoints = props.catalogCategory === 'field' ||
    props.catalogPlaces?.some(place => place.id === props.selectedPlaceId && place.category === 'field')
  const hideRouteLines = props.discoveryActive && !(showWalkedPoints && viewingFieldPoints)
  const geometryKey = useMemo(() => JSON.stringify(props.routes.map(routeCoordinates)), [props.routes])
  const overviewRouteId = ['detail', 'confirm', 'editor'].includes(props.screen) ? props.selectedId : ''
  const plannerPicking = props.planner?.picking
  const plannerFitKey = props.planner
    ? `plan|${props.planner.selectedId ?? ''}|${props.planner.plan.start?.coordinate ?? ''}|${props.planner.plan.end?.coordinate ?? ''}`
    : ''
  const fitKey = plannerFitKey || `${theme}|${overviewRouteId}|${geometryKey}`

  const visiblePadding = () => {
    const rect = rootRef.current!.getBoundingClientRect()
    const workspace = rootRef.current?.closest('.route-workspace')
    const sheet = workspace?.querySelector('.map-sheet')?.getBoundingClientRect()
    const dock = workspace?.querySelector('.experience-dock')?.getBoundingClientRect()
    const mobile = window.matchMedia('(max-width: 760px), (max-height: 540px) and (max-width: 1000px)').matches
    const left = sheet && !mobile ? Math.max(24, sheet.right - rect.left + 24) : 24
    const bottom = sheet && mobile ? rect.bottom - sheet.top + 24 : dock ? rect.bottom - dock.top + 24 : 66
    const right = mobile ? 24 : 76
    const toolbar = workspace?.querySelector('.map-actions')?.getBoundingClientRect()
    const top = mobile ? Math.max(28, (toolbar?.height ? toolbar.bottom - rect.top + 24 : 28)) : 78
    return { topLeft: [left, top] as L.PointTuple, bottomRight: [right, bottom] as L.PointTuple,
      usable: rect.width - left - right > 100 && rect.height - bottom - top > 44 }
  }

  const focusMyLocation = (resetZoom=false) => {
    const map=mapRef.current, current=locationActions.current.state
    if(!map||!current.fix||!isLiveLocation(current))return
    const padding=visiblePadding()
    if(resetZoom)map.setZoom(17,{animate:false})
    if(padding.usable)map.panInside(latlng(current.fix.coordinate),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,animate:false})
  }

  const focusPlace=(fitResults = true)=>{
    const map=mapRef.current,current=actions.current
    if(!map||!current.discoveryActive||!current.catalogPlaces)return false
    const place=current.catalogPlaces.find(p=>p.id===current.selectedPlaceId)
    const points=place?[place]:fitResults ? findPlaces(current.catalogPlaces,current.catalogQuery,current.catalogCategory)
      .filter(point => fieldGroupIncludes(point, current.fieldGroupIds)) : []
    if(!points.length)return false
    const padding=visiblePadding()
    if(!padding.usable)return false
    if(place)map.panInside(latlng(place.coordinate),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,animate:false})
    else map.fitBounds(L.latLngBounds(points.map(p=>latlng(p.coordinate))),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,maxZoom:18,animate:false})
    return true
  }
  const fitRoutes = () => {
    const map = mapRef.current
    if (!map) return
    const current = actions.current
    if(current.mapTheme==='facilities'&&!current.discoveryActive){
      const points=current.catalogPlaces?.filter(place=>place.category!=='building'&&place.category!=='landmark')??[]
      const padding=visiblePadding()
      if(points.length&&padding.usable){map.fitBounds(L.latLngBounds(points.map(place=>latlng(place.coordinate))),{paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,maxZoom:18,animate:false});return}
    }
    const route = ['detail', 'confirm', 'editor'].includes(current.screen) ? current.routes.find(item => item.id === current.selectedId) : undefined
    const planned = current.planner?.routes.find(candidate => candidate.id === current.planner?.selectedId)
    const pins = [current.planner?.plan.start, current.planner?.plan.end].flatMap(endpoint => endpoint ? [endpoint.coordinate] : [])
    const points = planned ? [...planned.coordinates, ...pins] : pins.length ? pins : route ? routeCoordinates(route) : current.routes.flatMap(routeCoordinates)
    const padding = visiblePadding()
    const options = padding.usable ? { paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight } : { padding: [35, 40] as L.PointTuple }
    if (points.length) map.fitBounds(L.latLngBounds(points.map(latlng)), { ...options, maxZoom: 18, animate: false })
    else map.fitBounds(L.latLngBounds(current.campus.places.map(p => latlng(p.coordinate))), { ...options, maxZoom: 18, animate: false })
  }

  useEffect(() => {
    if (!rootRef.current) return
    const map = L.map(rootRef.current, { zoomControl: false, minZoom: 15, maxZoom: 20, scrollWheelZoom: true, attributionControl: true }).setView([25.0182, 121.5386], 17)
    mapRef.current = map
    fittedView.current = ''
    inspectedSegment.current = ''
    map.on('zoomend',()=>setZoom(map.getZoom()))
    map.on('moveend',()=>setViewRevision(value=>value+1))
    map.on('dragstart', () => {locationActions.current.session.setFollowing(false);actions.current.onMapDrag?.()})
    map.on('click', (event: L.LeafletMouseEvent) => {
      const point: Coordinate = [event.latlng.lng, event.latlng.lat]
      if (actions.current.planner?.picking) actions.current.planner.onPick(point)
      else if (actions.current.pickingEntrance) actions.current.onPickEntrance?.(point)
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
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: true, debounceMoveend: true }))
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
    if (actions.current.planner) {
      drawPlannerMap(group, {
        ...actions.current.planner,
        onLeg: id => actions.current.planner?.onLeg(id),
        onRoute: id => actions.current.planner?.onRoute(id),
      })
      return
    }
    if(hideRouteLines)return
    const focus = props.screen === 'detail' || props.screen === 'confirm'
    const selected = props.routes.find(r => r.id === props.selectedId) ?? props.routes[0]
    props.routes.forEach(route => {
      const isSelected = route.id === props.selectedId
      const color = theme==='slope'||theme==='conditions' ? '#718096' : props.mode === 'survey' ? '#82918a' : colors[route.id as keyof typeof colors] ?? colors.survey
      const spans = route.walked ? route.segments : [{ coordinates: routeCoordinates(route), approximate: false }]
      for (const span of spans) {
        if (span.approximate) {
          if (!focus || isSelected) {
            const label = document.createElement('span')
            label.textContent = '博雅館內走向約略'
            const icon = L.divIcon({ className: 'indoor-map-label', html: label, iconSize: [122, 24], iconAnchor: [61, 12] })
            L.marker(latlng(lineMidpoint(span.coordinates)), { icon, interactive: false, keyboard: false }).addTo(group)
          }
          continue
        }
        const points = span.coordinates.map(latlng)
        L.polyline(points, { color: '#ffffff', weight: isSelected ? 10 : 8, opacity: focus && !isSelected ? .4 : .9, interactive: false, lineCap: 'round' }).addTo(group)
        const line = L.polyline(points, { color, weight: isSelected ? 5.5 : 4, opacity: focus && !isSelected ? .22 : isSelected ? 1 : .78, dashArray: ['direct', 'walk-back'].includes(route.id) ? '8 7' : undefined })
        line.bindTooltip(route.name).on('click', () => actions.current.onSelectRoute(route.id)).addTo(group)
      }
      if(theme==='slope'||theme==='conditions')route.segments.forEach(segment=>{
        if (segment.approximate) return
        const reports=(props.communityReports??[]).filter(r=>reportMatchesSegment(r,segment,props.communitySegments))
        const active=reports.filter(r=>reportState(r).kind==='active')
        const blocked=active.some(r=>r.impact==='blocked'),difficult=active.some(r=>r.impact==='difficult')
        const style=theme==='slope'?slopeStyle(segment.maxSlopePercent):{color:blocked?'#973628':difficult?'#a55d16':'#67778a',dashArray:blocked?'3 4':difficult?'10 4':'3 6',label:blocked?'近期有人回報無法通行':difficult?'近期有人回報通行困難':reports.length?'其他社群回報':'尚無路況回報'}
        const label=document.createElement('span');label.textContent=`${segment.name}：${theme==='slope'?(segment.maxSlopePercent===null?'坡度未知':`最大坡度 ${segment.maxSlopePercent}%${props.mode==='demo'?'（示範）':''}`):style.label}`
        L.polyline(segment.coordinates.map(latlng),{color:style.color,weight:segment.id===props.segmentId?8:isSelected?6:4,opacity:focus&&!isSelected?0.5:1,dashArray:style.dashArray}).bindTooltip(label).on('click',()=>actions.current.onSelectSegment(segment.id)).addTo(group)
      })
      if (theme==='routes' && isSelected && (props.screen === 'detail' || props.screen === 'editor')) {
        route.segments.forEach(segment => {
          if (segment.approximate) return
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
        label.textContent = entrance.name
        L.marker(latlng(entrance.coordinate), { icon, keyboard: false }).bindTooltip(label, { permanent: true, direction: i ? 'top' : 'bottom', offset: [0, i ? -17 : 17], className: 'entrance-label' }).addTo(group)
      })
    } else {
      props.campus.places.forEach(place => {
        const label = document.createElement('span')
        label.textContent = `${place.name} · 建物中心`
        L.circleMarker(latlng(place.coordinate), { radius: 7, color: '#fff', weight: 2, fillColor: '#6d8277', fillOpacity: 1 }).bindTooltip(label, { permanent: true, direction: 'top', className: 'entrance-label' }).addTo(group)
      })
    }
  }, [props.routes, props.selectedId, props.segmentId, props.mode, props.screen, props.campus,hideRouteLines,theme,
    props.communityReports,props.communitySegments,props.planner?.routes,props.planner?.plan,props.planner?.access,
    props.planner?.selectedId,props.planner?.legId,props.planner?.observation,plannerPicking])

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
    if(!props.catalogPlaces||!props.campus.context||plannerPicking)return
    const placeFor=(feature:GeoJSON.Feature)=>props.catalogPlaces?.find(p=>p.contextId===String(feature.id)||p.routePlaceId&&(p.name===feature.properties?.name||p.aliases.includes(feature.properties?.name)))
    L.geoJSON(props.campus.context,{
      filter:feature=>!!placeFor(feature),
      style:{stroke:false,fillColor:'#205db6',fillOpacity:.015},
      onEachFeature:(feature,layer)=>{
        const place=placeFor(feature)
        if(place)layer.on('click',(event:L.LeafletMouseEvent)=>{L.DomEvent.stopPropagation(event);actions.current.onSelectPlace?.(place.id)})
      },
    }).addTo(group)
  },[props.catalogPlaces,props.campus,plannerPicking])

  useEffect(()=>{
    const group=placesRef.current
    const map=mapRef.current
    if(!group||!map)return
    group.clearLayers()
    if(!props.catalogPlaces || props.mapObscured || !rootRef.current || plannerPicking)return
    // Keep markers behind the search or sheet out of the tab order and hit testing.
    const canvas = rootRef.current.getBoundingClientRect()
    const workspace = rootRef.current.closest('.route-workspace')
    const overlays = Array.from(workspace?.querySelectorAll(
      '.map-sheet, .place-search-field, .place-category-strip, .map-actions, .location-status-chip, .layer-popover, .leaflet-control-zoom',
    ) ?? []).map(el => el.getBoundingClientRect()).filter(rect => rect.width && rect.height)
    const markerFits = (coordinate: L.LatLngExpression) => {
      const point = map.latLngToContainerPoint(coordinate)
      const x = canvas.left + point.x
      const y = canvas.top + point.y
      const half = 22
      return x - half >= canvas.left && x + half <= canvas.right && y - half >= canvas.top && y + half <= canvas.bottom &&
        overlays.every(rect => x + half <= rect.left || x - half >= rect.right || y + half <= rect.top || y - half >= rect.bottom)
    }
    const selected=props.catalogPlaces.find(p=>p.id===props.selectedPlaceId)
    if(selected){
      const feature=props.campus.context?.features.find(f=>selected.contextId===String(f.id)||selected.routePlaceId&&(selected.name===f.properties?.name||selected.aliases.includes(f.properties?.name)))
      if(feature)L.geoJSON(feature,{interactive:false,style:{color:'#205db6',weight:2,fillColor:'#5798e2',fillOpacity:.17}}).addTo(group)
    }
    const filtered=!!props.catalogCategory||!!props.catalogQuery?.trim()
    const activeRoute = overviewRouteId ? props.routes.find(route => route.id === overviewRouteId) : undefined
    const activeFieldIds = activeRoute ? new Set(activeRoute.segments.flatMap(segment => segment.fieldPointIds ?? [])) : undefined
    const bounds=map.getBounds().pad(.05)
    const shown = props.catalogPlaces.filter(place => {
      if (place.id === props.selectedPlaceId) return true
      if (!bounds.contains(latlng(place.coordinate))) return false
      if (filtered) return catalogMatches.some(match => match.id === place.id)
      if (showWalkedPoints && place.category === 'field') return !activeFieldIds || activeFieldIds.has(place.id)
      if (theme === 'facilities') return place.category !== 'building' && place.category !== 'landmark'
      return !!place.routePlaceId || showFacilities && place.category === 'ramp' ||
        zoom >= 17 && place.category === 'landmark' || zoom >= 19 && place.category === 'building'
    })
    const clusterable = props.onSelectFieldGroup
      ? shown.filter(place => place.category === 'field' && place.id !== props.selectedPlaceId)
      : []
    const groups = groupFieldMarkers(clusterable, coordinate => map.latLngToLayerPoint(latlng(coordinate)))
    const groupedIds = new Set<string>()
    for (const members of groups) {
      if (members.length < 2) continue
      const center = L.point(0, 0)
      for (const place of members) {
        const pixel = map.latLngToLayerPoint(latlng(place.coordinate))
        center.x += pixel.x / members.length
        center.y += pixel.y / members.length
      }
      const coordinate = map.layerPointToLatLng(center)
      if (!markerFits(coordinate)) continue
      const kinds = [...new Set(members.map(place => fieldObservation(place.id)?.kind ?? 'general'))]
      const label = `查看 ${members.length} 個實勘點，${kinds.map(kind => fieldKinds[kind].label).join('、')}`
      const badge = document.createElement('span')
      badge.setAttribute('aria-hidden', 'true')
      const count = document.createElement('b')
      count.textContent = String(members.length)
      const symbols = document.createElement('small')
      symbols.textContent = kinds.map(kind => fieldKinds[kind].symbol).join('')
      badge.append(count, symbols)
      const icon = L.divIcon({
        className: 'catalog-map-marker field-cluster', html: badge,
        iconSize: [44, 44], iconAnchor: [22, 22],
      })
      const marker = L.marker(coordinate, { icon, keyboard: true, title: label, zIndexOffset: 270, bubblingMouseEvents: false }).addTo(group)
      const ids = members.map(place => place.id)
      ids.forEach(id => groupedIds.add(id))
      const open = () => actions.current.onSelectFieldGroup?.(ids)
      marker.on('click', open)
      const target = marker.getElement()
      target?.setAttribute('aria-label', label)
      target?.setAttribute('role', 'button')
      if (target) L.DomEvent.on(target, 'keydown', event => {
        const key = (event as KeyboardEvent).key
        if (key === 'Enter' || key === ' ') {
          L.DomEvent.stop(event)
          open()
        }
      })
    }
    for(const place of shown){
      if (groupedIds.has(place.id) || !markerFits(latlng(place.coordinate))) continue
      const active=place.id===props.selectedPlaceId
      const field = fieldObservation(place.id)
      const kind = field ? fieldKinds[field.kind] : undefined
      const element=document.createElement('span')
      element.textContent=kind?.symbol ?? ({building:'館',toilet:'廁',elevator:'梯',water:'水',rest:'休',ramp:'坡',landmark:'景',field:'記'} as const)[place.category]
      element.setAttribute('aria-hidden','true')
      const icon=L.divIcon({className:`catalog-map-marker ${field ? `field-marker field-kind-${field.kind}` : ''} ${active?'selected':''}`,html:element,iconSize:[44,44],iconAnchor:[22,22]})
      const label=document.createElement('span')
      label.textContent=place.level && field ? `${place.name}（${place.level}示意）` : place.name
      const marker=L.marker(latlng(place.coordinate),{icon,keyboard:true,title:place.name,zIndexOffset:active?850:100,bubblingMouseEvents:false}).bindTooltip(label,{permanent:active,direction:'top',offset:[0,-18],className:'catalog-place-label'}).addTo(group)
      marker.on('click',()=>actions.current.onSelectPlace?.(place.id))
      const target=marker.getElement()
      target?.setAttribute('aria-label',`開啟${field ? '實勘點' : '公開地點'} ${label.textContent}，${kind?.label ?? categoryLabels[place.category]}`)
      target?.setAttribute('role', 'button')
      if(target)L.DomEvent.on(target,'keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){L.DomEvent.stop(event);actions.current.onSelectPlace?.(place.id)}})
    }
  },[props.catalogPlaces,props.catalogCategory,props.catalogQuery,props.selectedPlaceId,props.campus,props.routes,props.layoutKey,props.mapObscured,overviewRouteId,catalogMatches,showFacilities,showWalkedPoints,layersOpen,theme,zoom,viewRevision,plannerPicking])

  useEffect(()=>{
    if(!props.discoveryActive)return
    device.session.setFollowing(false)
    const timer=window.setTimeout(() => focusPlace(), 220)
    return()=>clearTimeout(timer)
  },[props.selectedPlaceId,props.catalogCategory,props.catalogQuery,props.catalogPlaces,props.discoveryActive,props.fieldGroupIds,device.session])

  useEffect(()=>{
    const group=communityRef.current
    if(!group)return
    group.clearLayers()
    if(plannerPicking || theme!=='conditions'&&(theme!=='routes'||!showCommunity))return
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
  },[props.communityReports,props.communitySegments,showCommunity,props.campus,theme,plannerPicking])

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

  useEffect(() => {
    if (props.discoveryActive || plannerPicking || fittedView.current === fitKey || (theme === 'facilities' && !props.catalogPlaces)) return
    const timer = window.setTimeout(() => {
      fittedView.current = fitKey
      device.session.setFollowing(false)
      fitRoutes()
    }, 220)
    return () => clearTimeout(timer)
  }, [fitKey, theme, props.catalogPlaces, props.campus, props.discoveryActive, device.session, plannerPicking])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (locationActions.current.state.following) focusMyLocation()
      else focusPlace(false)
      setViewRevision(previous => previous + 1)
    }, 220)
    return () => clearTimeout(timer)
  }, [props.layoutKey])

  useEffect(() => {
    if (props.screen !== 'detail' || props.discoveryActive || inspectedSegment.current === props.segmentId) return
    inspectedSegment.current = props.segmentId
    const segment = props.routes.find(route => route.id === props.selectedId)?.segments.find(item => item.id === props.segmentId)
    const padding = visiblePadding()
    if (segment && padding.usable) {
      mapRef.current?.panInside(latlng(lineMidpoint(segment.coordinates)), {
        paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, animate: false,
      })
    }
  }, [props.screen, props.discoveryActive, props.segmentId, props.selectedId, props.routes])

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

  return <section className="map-shell" aria-label="臺大校園路線地圖" inert={props.mapObscured}>
    <div className={`map-canvas ${props.pickingEntrance ? 'picking-entrance' : ''} ${plannerPicking ? 'planner-picking' : ''}`} ref={rootRef} role="group" aria-label="校園地圖，所有路線與路段亦可使用旁邊的清單操作" />
    {props.pickingEntrance && <div className="map-pick-note" role="status">點選入口位置，座標會填入目前草稿</div>}
    {plannerPicking && <div className="planner-pick-note">
      <p role="status">請在地圖上選{plannerPicking === 'start' ? '起點 A' : plannerPicking === 'end' ? '終點 B' : '實勘位置'}</p>
      <button type="button" className="button secondary" onClick={() => {
        const map = mapRef.current
        const pad = visiblePadding()
        const size = map?.getSize()
        if (!map || !size) return
        const point = pad.usable ? map.containerPointToLatLng([
          (size.x + pad.topLeft[0] - pad.bottomRight[0]) / 2,
          (size.y + pad.topLeft[1] - pad.bottomRight[1]) / 2,
        ]) : map.getCenter()
        props.planner?.onPick([point.lng, point.lat])
      }}>使用畫面中央</button>
      <button type="button" className="button plain" onClick={props.onCancelPlannerPick}>取消選點</button>
      {props.plannerPickError && <p className="planner-pick-error" role="alert">{props.plannerPickError}</p>}
    </div>}
    {!props.planner && <div className="map-title-pill"><span>臺大公館校區</span><span className="map-title-divider" /><span className="muted">總圖書館與博雅教學館</span></div>}
    <div className="map-actions">
      <button ref={layerButton} className={`map-tool map-theme-tool ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-label="地圖圖例與圖層" aria-expanded={layersOpen} title="圖例與圖層"><Layers3 size={20} aria-hidden="true" /><span>{showWalkedPoints ? '圖例' : (mapThemes.find(t=>t.id===theme)?.label ?? '圖層')}</span></button>
      <button className="map-tool" onClick={()=>{device.session.setFollowing(false);if(props.discoveryActive)props.onReturnRoutes?.();fitRoutes()}} aria-label="回到完整路線" title="回到完整路線"><Scan size={20} aria-hidden="true" /></button>
      {props.screen!=='editor'&&<LocationControls state={device.state} session={device.session} inCoverage={!device.state.fix||withinLocationCoverage(device.state.fix,props.campus.paths.flatMap(path=>path.coordinates))} onActivity={()=>actions.current.onLocationActivity?.()}/>}
      <div className="mobile-map-zoom" role="group" aria-label="縮放地圖">
        <button className="map-tool" onClick={() => mapRef.current?.zoomIn()} disabled={zoom >= 20} aria-label="放大地圖"><Plus size={19} aria-hidden="true" /></button>
        <button className="map-tool" onClick={() => mapRef.current?.zoomOut()} disabled={zoom <= 15} aria-label="縮小地圖"><Minus size={19} aria-hidden="true" /></button>
      </div>
    </div>
    {layersOpen && !props.mapObscured && createPortal(<div className="layer-popover" ref={layerPanel}>
      <div className="layer-title">圖例與圖層<button className="icon-button" onClick={() => { setLayersOpen(false); layerButton.current?.focus() }} aria-label="關閉圖例與圖層"><X size={17} aria-hidden="true" /></button></div>
      {props.planner && <ul className="planner-layer-key" aria-label="規劃路線圖例">
        <li><i className="legend-line planned" />規劃路線</li>
        <li><i className="legend-line alt" />替代路線</li>
        <li><i className="legend-line overlap" />試走線重疊處</li>
        <li><i className="legend-line caution" />回報／選中路段</li>
      </ul>}
      {showWalkedPoints && <div className="field-map-key">
        <ul className="field-legend" aria-label="實勘點圖例">{Object.entries(fieldKinds).map(([kind, item]) =>
          <li key={kind}><span className={`field-symbol field-kind-${kind}`} aria-hidden="true">{item.symbol}</span>{item.label}</li>
        )}</ul>
        <p>數字標記可開啟一組實勘點。白色圖釘來自公開圖資。</p>
      </div>}
      {props.onThemeChange&&<><ThemeChooser theme={theme} showSlope={props.routes.some(route => route.segments.some(segment => segment.maxSlopePercent !== null))} onChange={next=>{props.onThemeChange?.(next);setLayersOpen(false);layerButton.current?.focus()}} /><ThemeLegend theme={theme} simulatedSlopes={simulatedSlopes}/></>}
      <label><input type="checkbox" checked={showCampus} onChange={e => setShowCampus(e.target.checked)} /><span>臺大校園建物與道路</span></label>
      <label><input type="checkbox" checked={showFacilities} disabled={theme!=='routes'} onChange={e => setShowRamps(e.target.checked)} /><span>公開斜坡道 <small>{props.campus.facilities.length} 個</small></span></label>
      <label><input type="checkbox" checked={theme==='conditions'||theme==='routes'&&showCommunity} disabled={theme!=='routes'} onChange={e=>setShowCommunity(e.target.checked)}/><span>社群路況 <small>{props.communityReports?.length??0} 則</small></span></label>
      <p>公開點位尚未實地查核。</p>
    </div>,rootRef.current?.closest('.route-workspace')??document.body)}
    {(baseError || (showCampus && campusError)) && <div className="map-network-note" role="status"><CloudOff size={15} />{baseError ? '底圖暫時無法載入，仍可查看動線與清單。' : '校園圖層暫時無法載入，仍可使用底圖與動線。'}</div>}
    <div className={`map-legend ${props.planner ? 'planner-map-key' : theme!=='routes'?'theme-legend':''}`} aria-live="polite">
      {props.planner ? <><span><i className="legend-line planned" />規劃路線</span><span><i className="legend-line alt" />替代路線</span><span><i className="legend-line overlap" />試走線重疊處</span><span><i className="legend-line caution" />回報／選中路段</span></>
        : theme!=='routes'?<ThemeLegend theme={theme} simulatedSlopes={simulatedSlopes}/>:props.screen === 'editor' ? <span><MapPin size={15} />實勘草稿，尚未發布</span> : props.mode === 'demo' ? <><span><i className="legend-line gentle" />去程</span><span><i className="legend-line direct" />回程</span>{showWalkedPoints && <span>博雅館內走向約略</span>}</> : <span><MapPin size={15} />已查核動線</span>}
    </div>
    <div className="map-north" aria-hidden="true"><span>↑</span>N</div>
  </section>
}
