import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunityReport, CommunitySession } from './community-model'

export async function communityRequest(path: string, options: RequestInit = {}) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`/api/community/${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'X-Wheelway-Action': 'community', ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type':'application/json' } : {}), ...options.headers } })
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('社群服務尚未連接，請稍後重新整理。')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '操作未完成，請稍後再試。')
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('連線逾時，請重新整理確認結果後再操作。')
    if (error instanceof TypeError) throw new Error('目前無法連線，請連線後重新整理。')
    throw error
  } finally { clearTimeout(timer) }
}

export function useCommunity(enabled: boolean) {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [session, setSession] = useState<CommunitySession>({ signedIn:false, available:false })
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  const [fetchedAt,setFetchedAt] = useState<string|null>(null)
  const [truncated,setTruncated] = useState(false)
  const alive = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const call = ++generation.current
    setLoading(true)
    try {
      const [data, identity] = await Promise.all([communityRequest('reports'),communityRequest('session')])
      if (alive.current && call === generation.current) {
        if (!Array.isArray(data.reports)) throw new Error('路況資料格式有誤，請稍後重試。')
        setReports(data.reports); setSession(identity); setFetchedAt(new Date().toISOString()); setTruncated(!!data.truncated); setError('')
      }
    } catch (e) { if (alive.current && call === generation.current) setError(e instanceof Error ? e.message : '社群路況無法載入。') }
    finally { if (alive.current && call === generation.current) setLoading(false) }
  },[])
  useEffect(()=>{
    alive.current=true
    if (!enabled) return ()=>{alive.current=false;generation.current++}
    void refresh()
    const update=()=>{if(document.visibilityState==='visible' && navigator.onLine) void refresh()}
    const interval=window.setInterval(update,60_000)
    window.addEventListener('online',update); document.addEventListener('visibilitychange',update)
    return ()=>{alive.current=false;generation.current++;clearInterval(interval);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update)}
  },[enabled,refresh])
  return {reports,session,error,loading,fetchedAt,truncated,refresh}
}
export type CommunityData = ReturnType<typeof useCommunity>

export async function prepareCommunityPhoto(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size>12*1024*1024) throw new Error('請選擇 12 MB 內的 JPEG、PNG 或 WebP 照片。')
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('照片無法讀取，請換一張。')})
  try {
    if(bitmap.width*bitmap.height>50_000_000) throw new Error('照片尺寸太大，請先縮小。')
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height))
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    const context=canvas.getContext('2d');if(!context)throw new Error('這個瀏覽器無法處理照片。')
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('照片無法處理，請換一張。')),'image/jpeg',.82))
    if(blob.size>2*1024*1024)throw new Error('照片處理後仍超過 2 MB，請換一張較小的照片。')
    return blob
  }finally{bitmap.close()}
}
