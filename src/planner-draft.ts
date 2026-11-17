import type { PlanEndpoint } from './planning-params'
import { MAX_IMPORT_BYTES, openSurveyDraftDatabase } from './survey'
import type { Coordinate, Photo } from './types'

export interface DraftPoint {
  id: string
  leg: string
  coordinate: Coordinate
  slopePercent: number | null
  widthM: number | null
  stepCm: number | null
  surface: string
  note: string
  photo: Photo | null
  recordedAt: string
}

export interface PlannerDraft {
  version: 1
  source: 'community'
  review: 'not-submitted'
  submittedAt: null
  updatedAt: string
  route: { id: string; start: PlanEndpoint; end: PlanEndpoint; geometry: Coordinate[] }
  points: DraftPoint[]
}

type StoredDraft = { revision: number; draft: PlannerDraft }
type DraftWrite = { draft: PlannerDraft; expectedRevision: number | null }

export async function localPlannerDraft(routeId: string, write?: DraftWrite): Promise<StoredDraft | undefined> {
  if (write && new Blob([JSON.stringify(write.draft)]).size > MAX_IMPORT_BYTES) {
    throw new Error('草稿超過 20 MB，請移除部分照片或先下載備份。')
  }
  const db = await openSurveyDraftDatabase()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try { tx = db.transaction('drafts', write ? 'readwrite' : 'readonly') }
    catch { db.close(); reject(new Error('無法開啟本機草稿，請檢查瀏覽器儲存空間。')); return }
    const key = `community-route-v1:${routeId}`
    const store = tx.objectStore('drafts'), request = store.get(key)
    let result: StoredDraft | undefined
    let failure = ''
    request.onsuccess = () => {
      const current = request.result as StoredDraft | undefined
      if (!write) { result = current; return }
      if ((current?.revision ?? null) !== write.expectedRevision) {
        failure = '其他分頁有較新的草稿。請下載此頁內容備份，再重開草稿。'
        tx.abort()
        return
      }
      result = { revision: (current?.revision ?? 0) + 1, draft: write.draft }
      store.put(result, key)
    }
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onabort = () => { db.close(); reject(new Error(failure || '本機儲存未完成，可以先下載草稿。')) }
  })
}
