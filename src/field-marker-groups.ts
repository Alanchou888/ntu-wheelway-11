import type { Coordinate } from './types'

type FieldPoint = { id: string; coordinate: Coordinate }
type Pixel = { x: number; y: number }

// Merge the closest overlapping badges first so nearby points do not form a chain across the map.
export function groupFieldMarkers<T extends FieldPoint>(places: readonly T[], project: (coordinate: Coordinate) => Pixel): T[][] {
  const groups = places.map(place => ({ members: [place], center: project(place.coordinate) }))
  while (true) {
    let pair: [number, number] | undefined
    let nearest = Infinity
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const dx = Math.abs(groups[i].center.x - groups[j].center.x)
        const dy = Math.abs(groups[i].center.y - groups[j].center.y)
        const distance = dx * dx + dy * dy
        if (dx < 46 && dy < 46 && distance < nearest) {
          pair = [i, j]
          nearest = distance
        }
      }
    }
    if (!pair) return groups.map(group => group.members)
    const [i, j] = pair
    const a = groups[i]
    const [b] = groups.splice(j, 1)
    const count = a.members.length + b.members.length
    groups[i] = {
      members: [...a.members, ...b.members],
      center: {
        x: (a.center.x * a.members.length + b.center.x * b.members.length) / count,
        y: (a.center.y * a.members.length + b.center.y * b.members.length) / count,
      },
    }
  }
}
