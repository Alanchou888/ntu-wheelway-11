import { useEffect, useMemo, useState } from 'react'
import type { Route } from './types'
import { advanceTour, clampDistance, createTour, positionAt } from './route-tour'

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

interface Playback {
  key: string; distanceM: number; playing: boolean; engaged: boolean
  speed: number; pauseEach: boolean; following: boolean; notice: string
}

export function useRouteTour(route: Route | null, selectedSegmentId: string) {
  const model = useMemo(() => createTour(route), [route])
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const key = `${model.key}|${selectedSegmentId}`
  const initial = (): Playback => ({
    key, distanceM: model.legs.find(l => l.segment.id === selectedSegmentId)?.startM ?? 0,
    playing: false, engaged: false, speed: 1, pauseEach: true, following: true, notice: '',
  })
  const [saved, setSaved] = useState<Playback>(initial)
  // A changed route or reversed direction must never render the previous route's position.
  const playback = saved.key === key ? saved : initial()
  useEffect(() => { setSaved(initial()) }, [key])
  const update = (patch: Partial<Playback>) => setSaved(previous => ({ ...(previous.key === key ? previous : initial()), ...patch }))

  useEffect(() => {
    if (reducedMotion) setSaved(previous => previous.key === key ? { ...previous, playing: false } : previous)
  }, [reducedMotion, key])

  useEffect(() => {
    if (!playback.playing || reducedMotion || model.distanceM <= 0) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      // Background tabs pause, and a delayed frame never skips multiple checkpoints.
      const elapsed = Math.min(250, now - last)
      last = now
      setSaved(previous => {
        if (previous.key !== key || !previous.playing) return previous
        const next = advanceTour(model, previous.distanceM, elapsed / 1000 * model.distanceM / 48 * previous.speed, previous.pauseEach)
        return { ...previous, distanceM: next.distanceM, playing: !next.stopped,
          notice: next.complete ? '預演完成。可重新播放或查看路段。' : next.stopped ? `已到第 ${(positionAt(model, next.distanceM)?.leg.index ?? 0) + 1} 段，預演已暫停。` : '' }
      })
    }, 80)
    const visibility = () => {
      if (document.hidden) setSaved(previous => previous.key === key ? { ...previous, playing: false, notice: '已暫停預演。' } : previous)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [key, model, playback.playing, reducedMotion])

  const position = positionAt(model, playback.distanceM)
  const seek = (distanceM: number) => update({ distanceM: clampDistance(distanceM, model.distanceM), playing: false, engaged: true, following: true, notice: '' })
  const selectSegment = (id: string) => { const leg = model.legs.find(l => l.segment.id === id); if (leg) seek(leg.startM) }
  const toggle = () => {
    if (reducedMotion || !position) return
    update({ playing: !playback.playing, engaged: true,
      distanceM: playback.distanceM >= model.distanceM ? 0 : playback.distanceM, notice: '' })
  }
  const step = (delta: number) => {
    const leg = model.legs[Math.max(0, Math.min(model.legs.length - 1, (position?.leg.index ?? 0) + delta))]
    if (leg) selectSegment(leg.segment.id)
  }
  return {
    ...playback, playing: playback.playing && !reducedMotion, model, position, reducedMotion,
    seek, selectSegment, toggle, step,
    reset: () => seek(0),
    pause: () => update({ playing: false }),
    setFollowing: (following: boolean) => update({ following }),
    setPauseEach: (pauseEach: boolean) => update({ pauseEach }),
    setSpeed: (speed: number) => update({ speed: [1, 2, 4].includes(speed) ? speed : 1 }),
  }
}
export type TourController = ReturnType<typeof useRouteTour>
