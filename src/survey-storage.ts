import type { SurveyData } from './types'
import { readLocalSurveyRecord, SurveyConflictError, SurveyReadError, writeLocalSurvey } from './survey'
import type { StoredSurvey } from './survey'

/** One editing session. Writes are serialized and revisions are checked in IDB. */
export class SurveyDraftSession {
  data: SurveyData
  savedAt: string | null = null
  conflict: SurveyConflictError | null = null
  private savedData: SurveyData | null
  private revision: number | null | undefined
  private inFlight: Promise<void> | null = null

  constructor(initial: SurveyData) { this.data = initial; this.savedData = initial }
  get dirty() { return this.data !== this.savedData }
  change(data: SurveyData) { this.data = data }
  async load(): Promise<StoredSurvey> {
    if (this.inFlight) await this.inFlight.catch(() => {})
    try {
      const record = await readLocalSurveyRecord()
      this.revision = record.revision
      this.data = record.data ?? this.data
      this.savedData = this.data
      this.savedAt = record.savedAt
      this.conflict = null
      return record
    } catch (e) {
      // A malformed legacy record stays intact until the user explicitly saves
      // a replacement or rebuilds. Its raw contents can still be downloaded.
      if (e instanceof SurveyReadError) this.revision = e.revision
      this.savedData = null
      throw e
    }
  }
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (this.conflict) return Promise.reject(this.conflict)
    if (this.revision === undefined) return Promise.reject(new Error('尚未載入本機草稿，請稍後重試'))
    if (!this.dirty) return Promise.resolve()
    const run = async () => {
      while (this.dirty) {
        const draft = this.data
        try {
          const record = await writeLocalSurvey(draft, this.revision!)
          this.revision = record.revision
          this.savedAt = record.savedAt
          this.savedData = draft
        } catch (e) { if (e instanceof SurveyConflictError) this.conflict = e; throw e }
      }
    }
    this.inFlight = run().finally(() => { this.inFlight = null })
    return this.inFlight
  }
}
