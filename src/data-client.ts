import { isCampus } from './routes'
import { parseSurveyData } from './survey'

export async function fetchSnapshot<T>(url: string, validate: (value: unknown) => T, parent?: AbortSignal, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return validate(await response.json())
  } finally { clearTimeout(timer); parent?.removeEventListener('abort', abort) }
}
export const loadCampus = (signal?: AbortSignal) => fetchSnapshot('/data/campus.json', value => { if (!isCampus(value)) throw new Error('圖資格式不完整'); return value }, signal)
export const loadSurvey = (signal?: AbortSignal) => fetchSnapshot('/data/surveyed-routes.json', parseSurveyData, signal)
