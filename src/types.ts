import type { FeatureCollection } from 'geojson'

export type Coordinate = [number, number]
export type PlaceId = 'library' | 'boya'
export type Verification = 'demo' | 'unverified' | 'verified' | 'blocked'
export type Mode = 'demo' | 'survey'
export type Preference = 'gentle' | 'short'
export type Wheelchair = 'manual' | 'electric'
export type Screen = 'setup' | 'compare' | 'detail' | 'confirm' | 'editor' | 'saved' | 'help'
export interface Photo { src: string; alt: string; caption: string; sourceUrl?: string }
export interface Place { id: PlaceId; name: string; coordinate: Coordinate; uid: string; sourceId: string; kind: 'building' }
export interface PublicSource { id: string; label: string; url: string; retrievedAt: string; status: 'ok' | 'cached'; note?: string }
export interface Facility { id: string; name: string; coordinate: Coordinate; widthM: number | null; slopePercent: number | null; sourceId: string; status: 'unverified' }
export interface PathAsset { id: string; name: string; coordinates: Coordinate[]; sourceId: string; wayIds: string[]; note?: string; photos?: Photo[] }
export interface Campus { version: number; retrievedAt: string; sources: PublicSource[]; places: Place[]; facilities: Facility[]; paths: PathAsset[]; context?: FeatureCollection }
export interface Entrance { id: string; placeId: PlaceId; name: string; coordinate: Coordinate; status: Verification; verifiedAt: string | null; source: string; photos: Photo[] }
export interface Segment {
  id: string; name: string; coordinates: Coordinate[]; status: Verification
  maxSlopePercent: number | null; minWidthM: number | null; stepHeightCm: number | null
  hasStairs: boolean | null; surface: string | null; rampLengthM: number | null
  closed: boolean | null; obstacles: string[]; photos: Photo[]; source: string
  sourceUrl?: string; retrievedAt: string | null; verifiedAt: string | null
}
export interface Route {
  id: string; name: string; description: string; kind: 'demo' | 'survey'
  originEntrance: Entrance; destinationEntrance: Entrance; segments: Segment[]
}
export interface SurveyData { version: number; routes: Route[] }
export interface RouteMetrics { distanceM: number; maxSlopePercent: number | null; minWidthM: number | null; maxStepCm: number | null; surfaces: string[] }
export interface RouteLimits { maxSlope: number | null; minWidth: number | null; maxStep: number | null; recheckDays: number | null }
export interface NavigationState { screen: Screen; mode: Mode; origin: PlaceId; wheelchair: Wheelchair; preference: Preference; routeId: string; segmentId: string; limits?: RouteLimits }
