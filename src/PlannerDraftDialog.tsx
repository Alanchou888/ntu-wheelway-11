import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MapPin, X } from 'lucide-react'
import type { PlanEndpoint } from './planning-params'
import { localPlannerDraft } from './planner-draft'
import type { DraftPoint, PlannerDraft } from './planner-draft'
import { formatDate, formatDistance, lineMidpoint } from './routes'
import type { PlannedRoute } from './routing-plan'
import { downloadFile, measurementInput, photoFromFile } from './survey'
import type { Coordinate, Photo } from './types'
import { prepareCommunityPhoto } from './useCommunity'

interface Props {
  route: PlannedRoute
  start: PlanEndpoint
  end: PlanEndpoint
  activeLegId?: string
  open: boolean
  pickedPoint?: Coordinate
  pickedLegId: string
  onPick: (legId: string) => void
  onClearPick: () => void
  onClose: () => void
}

export default function PlannerDraftDialog({ route, start, end, activeLegId, open, pickedPoint, pickedLegId, onPick, onClearPick, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [legId, setLegId] = useState(activeLegId ?? route.legs[0]?.id)
  const [points, setPoints] = useState<DraftPoint[]>([])
  const [revision, setRevision] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [formEdited, setFormEdited] = useState(false)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [message, setMessage] = useState('')
  const leg = route.legs.find(item => item.id === legId) ?? route.legs[0]
  const marked = pickedLegId === leg.id ? pickedPoint : undefined
  const coordinate = marked ?? lineMidpoint(leg.coordinates)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [open])

  useEffect(() => {
    let active = true
    void localPlannerDraft(route.id).then(record => {
      if (active && record) {
        setPoints(record.draft.points)
        setSavedAt(record.draft.updatedAt)
        setRevision(record.revision)
      }
    }).catch(error => { if (active) setMessage(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [route.id])

  const draft = (): PlannerDraft => ({
    version: 1, source: 'community', review: 'not-submitted', submittedAt: null, updatedAt: new Date().toISOString(),
    route: { id: route.id, start, end, geometry: route.coordinates }, points,
  })
  const finish = () => {
    if (saving) return
    if ((dirty || formEdited || photo) && !window.confirm('還有未儲存的內容，要關閉草稿嗎？')) return
    dialogRef.current?.close()
    onClose()
  }
  const addPoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget, data = new FormData(form)
    const read = (key: string) => String(data.get(key) ?? '').trim()
    try {
      const point: DraftPoint = {
        id: crypto.randomUUID(), leg: leg.name, coordinate,
        slopePercent: measurementInput(read('slope')), widthM: measurementInput(read('width'), true),
        stepCm: measurementInput(read('step')), surface: read('surface'), note: read('note'),
        photo, recordedAt: new Date().toISOString(),
      }
      if ([point.slopePercent, point.widthM, point.stepCm, point.photo].every(value => value === null) && !point.surface && !point.note) {
        setMessage('請填寫一項量測、路面或通行心得，也可以附上照片。')
        return
      }
      setPoints(previous => [...previous, point])
      setDirty(true)
      setFormEdited(false)
      setPhoto(null)
      form.reset()
      onClearPick()
      setMessage('已加入實勘點。可繼續新增，或儲存本機草稿。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '無法加入實勘點。') }
  }
  const save = async () => {
    if (formEdited || photo) {
      setMessage('請先按「加入實勘點」，再儲存草稿。')
      return
    }
    setSaving(true)
    const data = draft()
    try {
      const record = await localPlannerDraft(route.id, { draft: data, expectedRevision: revision })
      if (record) {
        setRevision(record.revision)
        setSavedAt(data.updatedAt)
        setDirty(false)
        setMessage('已儲存在這個瀏覽器。')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗，請先下載草稿。') }
    finally { setSaving(false) }
  }

  return <dialog ref={dialogRef} className="community-dialog planner-draft" aria-labelledby="planner-draft-heading"
    onCancel={event => { event.preventDefault(); finish() }}>
    <header className="community-dialog-header">
      <div><h2 id="planner-draft-heading">記錄沿途實勘</h2><p>個人草稿 · 尚未送審</p></div>
      <button type="button" className="button plain" onClick={finish} aria-label="關閉實勘草稿"><X size={20} /></button>
    </header>
    <div className="community-dialog-body">
      <strong>{start.name} → {end.name}</strong>
      <p className="planner-muted">{formatDistance(route.distanceM)} · 以目前選擇的路線記錄，可下載草稿交給團隊。</p>
      <form className="community-form" onSubmit={addPoint} onChange={event => {
        if (!(event.target instanceof HTMLSelectElement)) setFormEdited(true)
      }}>
        <fieldset disabled={loading || saving || points.length >= 15}>
          <label>記錄路段<select value={leg.id} onChange={event => {
            onClearPick(); setLegId(event.target.value); setMessage('')
          }}>
            {route.legs.map((item, i) => <option value={item.id} key={item.id}>{i + 1}　{item.name} · {formatDistance(item.distanceM)}</option>)}
          </select></label>
          <div className="planner-draft-location">
            <button type="button" className="button secondary" onClick={() => onPick(leg.id)}><MapPin size={16} aria-hidden="true" /> 用地圖選實勘點</button>
            <small>{marked ? `地圖標記 ${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)}` : '目前使用路段中點'}</small>
          </div>
          <div className="planner-draft-measure">
            <label>坡度（%）<input name="slope" type="number" min="0" max="100" step="any" inputMode="decimal" /></label>
            <label>路寬（公尺）<input name="width" type="number" min="0.01" max="50" step="any" inputMode="decimal" /></label>
            <label>階差（公分）<input name="step" type="number" min="0" max="150" step="any" inputMode="decimal" /></label>
          </div>
          <label>路面<input name="surface" maxLength={100} placeholder="例如柏油、地磚" /></label>
          <label>通行心得<textarea name="note" maxLength={600} rows={2} placeholder="例如地磚不平，前輪通過時會晃動" /></label>
          <label className="community-photo-input">現場照片<input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              setPhoto(null)
              if (!file) return
              setMessage('')
              setPhotoBusy(true)
              void prepareCommunityPhoto(file).then(blob => photoFromFile(new File([blob], 'observation.jpg', { type: blob.type })))
                .then(setPhoto).catch(error => setMessage(error.message)).finally(() => setPhotoBusy(false))
            }} disabled={photoBusy} /></label>
          <small>照片會留在本機草稿，下載時會一併帶出。分享前請留意人臉或車牌。</small>
          {photo && <div className="community-photo-preview"><img src={photo.src} alt="待加入的現場照片" /></div>}
          <button type="submit" className="button secondary" disabled={photoBusy}>{photoBusy ? '處理照片中' : '加入實勘點'}</button>
        </fieldset>
        {points.length >= 15 && <p>每份草稿最多 15 個實勘點。</p>}
      </form>
      {points.length > 0 && <section aria-labelledby="draft-preview-heading">
        <h3 id="draft-preview-heading">草稿預覽（{points.length} 處）</h3>
        <ol className="planner-draft-points">{points.map(point => <li key={point.id}>
          <div><strong>{point.leg}</strong><small>{formatDate(point.recordedAt)}</small></div>
          <span>{[
            point.slopePercent !== null && `坡度 ${point.slopePercent}%`,
            point.widthM !== null && `路寬 ${point.widthM} 公尺`,
            point.stepCm !== null && `階差 ${point.stepCm} 公分`,
            point.surface,
          ].filter(Boolean).join(' · ')}</span>
          {point.note && <p>{point.note}</p>}
          {point.photo && <img src={point.photo.src} alt={`${point.leg}的實勘照片`} />}
          <button type="button" className="button plain" aria-label={`移除${point.leg}實勘點`} disabled={saving}
            onClick={() => { setPoints(previous => previous.filter(item => item.id !== point.id)); setDirty(true) }}>移除</button>
        </li>)}</ol>
      </section>}
      <div className="pending-photo-actions">
        <button type="button" className="button primary" onClick={() => void save()}
          disabled={loading || saving || photoBusy || (!points.length && (!revision || !dirty))}>{saving ? '儲存中' : '儲存在這個瀏覽器'}</button>
        <button type="button" className="button secondary" disabled={!points.length} onClick={() => {
          if (formEdited || photo) { setMessage('請先按「加入實勘點」，再下載草稿。'); return }
          downloadFile(`NTU-Wheelway-${route.id}.json`, JSON.stringify(draft(), null, 2), 'application/json')
        }}>下載草稿</button>
      </div>
      {savedAt && <p className="planner-muted">最近儲存 {formatDate(savedAt)} · 尚未送審</p>}
      <p className="planner-draft-status" role="status">{message}</p>
    </div>
  </dialog>
}
