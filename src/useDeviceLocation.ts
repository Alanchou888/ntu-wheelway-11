import { useEffect, useState, useSyncExternalStore } from 'react'
import { DeviceLocationSession } from './device-location'

export function useDeviceLocation(provided?: DeviceLocationSession) {
  const [session] = useState(() => provided ?? new DeviceLocationSession(typeof navigator === 'undefined' ? undefined : navigator.geolocation, typeof window !== 'undefined' && window.isSecureContext))
  const state = useSyncExternalStore(session.subscribe,session.snapshot,session.snapshot)
  useEffect(() => {
    const visibility = () => { if (document.hidden) session.pause() }
    const leave = () => session.release()
    const timer = window.setInterval(session.tick,5000)
    document.addEventListener('visibilitychange',visibility)
    window.addEventListener('pagehide',leave)
    return () => { clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);session.release() }
  },[session])
  return {state,session}
}
