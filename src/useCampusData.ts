import { useEffect, useState } from 'react'
import type { Campus } from './types'
import { loadCampus } from './data-client'

export function useCampusData() {
  const [campus, setCampus] = useState<Campus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [campusAttempt, setCampusAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(false)
    loadCampus(controller.signal).then(data => { if (!controller.signal.aborted) setCampus(data) }).catch(() => { if (!controller.signal.aborted) setLoadError(true) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [campusAttempt])
  return { campus, loading, loadError, retryCampus: () => setCampusAttempt(n => n + 1) }
}
