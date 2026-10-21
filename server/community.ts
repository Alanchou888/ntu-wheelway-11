import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import { reactions, validateReport } from '../src/community-model'
import type { CommunityReport, Reaction } from '../src/community-model'

export interface CommunityEnv { DB: D1Database; BUCKET: R2Bucket; COMMUNITY_ADMIN_TOKEN?: string }
type Row = { id: string; segment_id: string; category: CommunityReport['category']; impact: CommunityReport['impact']; message: string; author_name: string; author_key: string; observed_at: string; created_at: string; photo_key: string | null; status: string }
type Vote = { report_id: string; reaction: Reaction; note: string; name: string; created_at: string }
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
class ApiError extends Error { constructor(message: string, public status = 400) { super(message) } }
export async function actorKey(request: Request) {
  const id = request.headers.get('oai-authenticated-user-id')
  if (!id) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}
function writeOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.get('X-Wheelway-Action') !== 'community') throw new ApiError('請從本網站重新操作。', 403)
}
async function body(request: Request, max = 6000): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new ApiError('資料格式有誤。', 415)
  const bytes = await limitedBytes(request, max)
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value }
  catch { throw new ApiError('資料格式有誤。') }
}
export async function limitedBytes(request: Request, max: number) {
  if (Number(request.headers.get('Content-Length') ?? 0) > max) throw new ApiError('檔案或內容太大。', 413)
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []; let length = 0
  for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > max) { await reader.cancel(); throw new ApiError('檔案或內容太大。', 413) } chunks.push(part.value) }
  const result = new Uint8Array(length); let offset = 0
  for (const part of chunks) { result.set(part, offset); offset += part.length }
  return result
}
export function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png'
  const text = (a: number, b: number) => new TextDecoder().decode(bytes.slice(a,b))
  if (text(0,4) === 'RIFF' && text(8,12) === 'WEBP') return 'image/webp'
  return null
}
async function rate(env: CommunityEnv, actor: string, kind: string, max: number) {
  const hour = new Date().toISOString().slice(0,13)
  const key = `${kind}:${actor}:${hour}`
  const row = await env.DB.prepare('INSERT INTO community_rate (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').bind(key, new Date(Date.now()+86_400_000).toISOString()).first<{count: number}>()
  if (!row || row.count > max) throw new ApiError('操作較頻繁，請稍後再試。', 429)
  await env.DB.prepare('DELETE FROM community_rate WHERE expires_at < ?').bind(new Date().toISOString()).run()
}
async function rowFor(env: CommunityEnv, id: string) {
  const row = await env.DB.prepare('SELECT * FROM community_reports WHERE id = ? AND status = ?').bind(id, 'visible').first<Row>()
  if (!row) throw new ApiError('這則回報已撤回或暫時無法查看。', 404)
  return row
}
async function reports(env: CommunityEnv, actor: string | null, admin = false) {
  const subset=`SELECT id FROM community_reports ${admin ? '' : "WHERE status = 'visible'"} ORDER BY created_at DESC, id DESC LIMIT 300`
  const result = await env.DB.prepare(`SELECT * FROM community_reports ${admin ? '' : "WHERE status = 'visible'"} ORDER BY created_at DESC, id DESC LIMIT 301`).all<Row>()
  const rows = result.results.slice(0, 300)
  type Totals={report_id:string;exists_count:number;resolved_count:number;different_count:number;last_exists:string|null;last_resolved:string|null;last_different:string|null;my_reaction:Reaction|null}
  const [totals,updates,flags]=await Promise.all([
    env.DB.prepare(`SELECT report_id, SUM(reaction = 'exists') AS exists_count, SUM(reaction = 'resolved') AS resolved_count, SUM(reaction = 'different') AS different_count,
      MAX(CASE WHEN reaction = 'exists' THEN created_at END) AS last_exists, MAX(CASE WHEN reaction = 'resolved' THEN created_at END) AS last_resolved,
      MAX(CASE WHEN reaction = 'different' THEN created_at END) AS last_different, MAX(CASE WHEN actor_key = ? THEN reaction END) AS my_reaction
      FROM community_votes WHERE report_id IN (${subset}) GROUP BY report_id`).bind(actor??'').all<Totals>(),
    env.DB.prepare(`SELECT report_id, reaction, note, name, created_at FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY report_id ORDER BY created_at DESC) AS position FROM community_votes WHERE report_id IN (${subset})) WHERE position <= 8 ORDER BY created_at DESC`).all<Vote>(),
    admin?env.DB.prepare(`SELECT report_id, reason, created_at FROM community_flags WHERE report_id IN (${subset}) ORDER BY created_at DESC`).all<{report_id:string;reason:string;created_at:string}>():Promise.resolve({results:[] as {report_id:string;reason:string;created_at:string}[]}),
  ])
  return { truncated: result.results.length > 300, serverTime: new Date().toISOString(), reports: rows.map(row => {
    const total=totals.results.find(t=>t.report_id===row.id)
    return { id: row.id, segmentId: row.segment_id, category: row.category, impact: row.impact, message: row.message, authorName: row.author_name, observedAt: row.observed_at, createdAt: row.created_at,
      photoUrl: row.photo_key ? `/api/community/photos/${row.id}` : null, own: actor === row.author_key,
      counts: { exists: total?.exists_count??0, resolved: total?.resolved_count??0, different: total?.different_count??0 },
      lastExistsAt: total?.last_exists??null, lastResolvedAt: total?.last_resolved??null, lastDifferentAt: total?.last_different??null, myReaction: total?.my_reaction??null,
      updates: updates.results.filter(v=>v.report_id===row.id).map(v=>({ reaction: v.reaction, note: v.note, name: v.name, at: v.created_at })),
      ...(admin ? { status: row.status, flagCount: flags.results.filter(f=>f.report_id===row.id).length, flags:flags.results.filter(f=>f.report_id===row.id).map(f=>({reason:f.reason,at:f.created_at})) } : {}),
    }
  }) }
}

export async function communityApi(request: Request, env: CommunityEnv, segmentIds: ReadonlySet<string>): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '')
    const method = request.method
    if (!env.DB || !env.BUCKET) return json({ error: '社群服務尚未連接，路線與實勘資料仍可使用。' }, 503)
    const actor = await actorKey(request)
    if (path === '/api/community/session' && method === 'GET') return json({ signedIn: !!actor, available: true })
    if (path === '/api/community/reports' && method === 'GET') return json(await reports(env, actor))
    const photo = path.match(/^\/api\/community\/photos\/([a-f0-9-]{36})$/)
    if (photo && method === 'GET') {
      const row = await rowFor(env, photo[1]); if (!row.photo_key) throw new ApiError('照片無法查看。',404)
      const object = await env.BUCKET.get(row.photo_key); if (!object) throw new ApiError('照片暫時無法載入。',404)
      return new Response(object.body as unknown as BodyInit, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; sandbox" } })
    }
    if (path === '/api/community/admin' || path.startsWith('/api/community/admin/')) {
      if (!env.COMMUNITY_ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.COMMUNITY_ADMIN_TOKEN}`) throw new ApiError('管理驗證未通過。', 403)
      if (method === 'GET' && path === '/api/community/admin') return json(await reports(env, actor, true))
      if (method === 'POST') {
        writeOrigin(request)
        const input = await body(request)
        if (!['visible', 'hidden'].includes(String(input.status))) throw new ApiError('請選擇管理操作。')
        const id = path.split('/').at(-1)
        const exists = await env.DB.prepare('SELECT status FROM community_reports WHERE id = ?').bind(id).first<{status:string}>()
        if (!exists || exists.status === 'withdrawn') throw new ApiError('這則回報已由作者撤回。',404)
        await env.DB.prepare('UPDATE community_reports SET status = ? WHERE id = ?').bind(input.status,id).run()
        return json({ ok: true })
      }
      throw new ApiError('找不到此操作。',404)
    }
    if (!['POST','PUT','DELETE'].includes(method)) throw new ApiError('找不到此操作。',404)
    writeOrigin(request)
    if (!actor) throw new ApiError('登入後即可回報與確認路況。',401)
    if (path === '/api/community/reports' && method === 'POST') {
      const payload = await body(request)
      let input: ReturnType<typeof validateReport>
      try { input = validateReport(payload, segmentIds) }
      catch (error) { throw new ApiError(error instanceof Error ? error.message : '請檢查回報內容。') }
      await rate(env,actor,'report',10)
      const duplicate = await env.DB.prepare("SELECT id FROM community_reports WHERE author_key = ? AND segment_id = ? AND category = ? AND status = 'visible' AND created_at > ?").bind(actor,input.segmentId,input.category,new Date(Date.now()-300_000).toISOString()).first()
      if (duplicate) throw new ApiError('你剛剛已回報這類路況，請先查看原回報。',409)
      const id = crypto.randomUUID()
      await env.DB.prepare('INSERT INTO community_reports (id, segment_id, category, impact, message, author_name, author_key, observed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id,input.segmentId,input.category,input.impact,input.message,input.authorName,actor,input.observedAt,new Date().toISOString()).run()
      return json({ id },201)
    }
    const match = path.match(/^\/api\/community\/reports\/([a-f0-9-]{36})(?:\/(reaction|flag|photo))?$/)
    if (!match) throw new ApiError('找不到此回報。',404)
    const row = await rowFor(env,match[1])
    if (!match[2] && method === 'DELETE') {
      if (row.author_key !== actor) throw new ApiError('只能撤回自己的回報。',403)
      await env.DB.prepare("UPDATE community_reports SET status = 'withdrawn' WHERE id = ?").bind(row.id).run()
      if (row.photo_key) await env.BUCKET.delete(row.photo_key)
      return json({ok:true})
    }
    if (match[2] === 'photo' && method === 'PUT') {
      if (row.author_key !== actor) throw new ApiError('只能替自己的回報加入照片。',403)
      if (row.photo_key) return json({ok:true,alreadyAttached:true})
      await rate(env,actor,'photo',15)
      const bytes = await limitedBytes(request, 2*1024*1024)
      const mime = imageType(bytes)
      if (!mime || bytes.length < 20 || request.headers.get('Content-Type') !== mime) throw new ApiError('照片需為 JPEG、PNG 或 WebP，且不超過 2 MB。',415)
      const key = `community/${row.id}`
      await env.BUCKET.put(key, bytes, { httpMetadata:{contentType:mime} })
      await env.DB.prepare('UPDATE community_reports SET photo_key = ? WHERE id = ? AND status = ?').bind(key,row.id,'visible').run()
      return json({ok:true})
    }
    if (match[2] === 'reaction' && method === 'POST') {
      if (row.author_key === actor) throw new ApiError('自己的回報由其他使用者確認。')
      const input = await body(request)
      if (!Object.hasOwn(reactions,String(input.reaction))) throw new ApiError('請選擇現場狀況。')
      const note = typeof input.note === 'string' ? input.note.trim() : ''
      if (note.length > 200) throw new ApiError('補充說明最多 200 字。')
      await rate(env,actor,'reaction',40)
      await env.DB.prepare('INSERT INTO community_votes (report_id, actor_key, reaction, note, name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(report_id, actor_key) DO UPDATE SET reaction = excluded.reaction, note = excluded.note, created_at = excluded.created_at').bind(row.id,actor,input.reaction,note,'路過使用者',new Date().toISOString()).run()
      return json({ok:true})
    }
    if (match[2] === 'flag' && method === 'POST') {
      const input = await body(request)
      const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
      if (reason.length < 2 || reason.length > 200) throw new ApiError('請填寫 2 至 200 字的檢舉原因。')
      await rate(env,actor,'flag',15)
      await env.DB.prepare('INSERT INTO community_flags (report_id, actor_key, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(report_id, actor_key) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at').bind(row.id,actor,reason,new Date().toISOString()).run()
      return json({ok:true})
    }
    throw new ApiError('找不到此操作。',404)
  } catch (error) {
    if (error instanceof ApiError) return json({error:error.message},error.status)
    console.error('Community API request failed', error instanceof Error ? error.name : 'unknown')
    return json({error:'社群服務暫時無法使用，請稍後重新整理。'},503)
  }
}
