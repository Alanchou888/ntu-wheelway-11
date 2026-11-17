import L from 'leaflet'
import type { EndpointSlot, PlanRequest } from './planning-params'
import type { PlannedRoute, RoadAccess } from './routing-plan'
import type { Coordinate } from './types'

export interface PlannerMapOverlay {
  plan: PlanRequest
  routes: PlannedRoute[]
  access?: [RoadAccess, RoadAccess]
  selectedId?: string
  legId?: string
  picking: EndpointSlot | 'observation' | 'report' | null
  observation?: Coordinate
  onPick: (coordinate: Coordinate) => void
  onRoute: (id: string) => void
  onLeg: (id: string) => void
}

const latlng = ([x, y]: Coordinate): L.LatLngTuple => [y, x]
const tooltip = (text: string) => {
  const label = document.createElement('span')
  label.textContent = text
  return label
}

export function drawPlannerMap(layer: L.LayerGroup, overlay: PlannerMapOverlay) {
  const interactive = !overlay.picking
  const selected = overlay.routes.find(route => route.id === overlay.selectedId)
  const alternatives = overlay.routes.filter(route => route !== selected)
  alternatives.forEach(route => L.polyline(route.coordinates.map(latlng), {
    className: 'planner-alternative-line', color: '#536b88', dashArray: '6 7', opacity: .83, weight: 4,
    interactive, bubblingMouseEvents: false,
  }).on('click', () => overlay.onRoute(route.id)).addTo(layer))
  if (selected) {
    L.polyline(selected.coordinates.map(latlng), { color: '#fff', weight: 10, interactive: false }).addTo(layer)
    for (const leg of selected.legs) {
      const active = leg.id === overlay.legId
      const report = leg.reports.length > 0
      const team = leg.teamSegmentNames.length > 0
      L.polyline(leg.coordinates.map(latlng), {
        className: 'planner-selected-line',
        color: active || report ? '#a96812' : team ? '#007672' : '#205db6',
        weight: active ? 8 : 5.5, interactive, bubblingMouseEvents: false,
      }).bindTooltip(tooltip(leg.name)).on('click', () => overlay.onLeg(leg.id)).addTo(layer)
    }
  }
  const endpoints = [overlay.plan.start, overlay.plan.end]
  endpoints.forEach((endpoint, i) => {
    if (!endpoint) return
    const label = i ? 'B' : 'A'
    const snap = overlay.access?.[i]
    const icon = L.divIcon({ className: 'endpoint-marker planner-endpoint-marker', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<span class="endpoint-dot ${i ? 'destination' : ''}">${label}</span>` })
    L.marker(latlng(endpoint.coordinate), { icon, keyboard: false, interactive: false }).bindTooltip(tooltip(endpoint.name), {
      permanent: true, direction: i ? 'top' : 'bottom', offset: [0, i ? -15 : 15], className: 'entrance-label',
    }).addTo(layer)
    if (snap && snap.offsetM >= 2) L.circleMarker(latlng(snap.coordinate), {
      radius: 4, color: '#205db6', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive,
    }).bindTooltip(tooltip(`${label} 路網接入點`)).addTo(layer)
  })
  if (overlay.observation) L.circleMarker(latlng(overlay.observation), {
    radius: 8, color: '#fff', weight: 2, fillColor: '#805124', fillOpacity: 1, interactive: false,
  }).bindTooltip(tooltip('草稿實勘位置'), { permanent: true, direction: 'top' }).addTo(layer)
}
