import { useEffect, useState } from 'react'
import { loadRoutingNetwork } from './routing-network'
import type { RoutingNetwork } from './routing-network'

export function useRoutingNetwork(enabled: boolean) {
  const [network, setNetwork] = useState<RoutingNetwork>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || network) return
    const controller = new AbortController()
    loadRoutingNetwork(controller.signal).then(result => {
      if (!controller.signal.aborted) setNetwork(result)
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [enabled, network, attempt])

  return { network, error, retry: () => { setError(false); setAttempt(value => value + 1) } }
}
