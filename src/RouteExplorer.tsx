import { Crosshair, Image, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { Route, Segment } from './types'
import type { TourController } from './useRouteTour'
import PhotoGallery from './PhotoGallery'

const number = (n: number | null, unit: string) => n === null ? '尚無資料' : `${Number(n.toFixed(2))}${unit}`

export function RouteTimeline({ tour }: { tour: TourController }) {
  const { model, position } = tour
  const values = model.legs.map(l => l.segment)
  const slopes = values.map(s => s.maxSlopePercent).filter((v): v is number => v !== null)
  const widths = values.map(s => s.minWidthM).filter((v): v is number => v !== null && v > 0)
  const maxSlope = slopes.length > 0 && slopes.length === values.length ? Math.max(...slopes) : null
  const minWidth = widths.length > 0 && widths.length === values.length ? Math.min(...widths) : null
  return <section className="route-timeline" aria-label="互動路況時間軸">
    <div className="timeline-heading"><h3>路況時間軸</h3><span>按路段長度排列</span></div>
    <div className="timeline-scroll"><div className="timeline-grid" style={{ gridTemplateColumns: `46px ${model.legs.map(l => `minmax(44px, ${Math.max(.01, l.distanceM / model.distanceM)}fr)`).join(' ')}` }}>
      {(['slope', 'width'] as const).map(kind => {
        const slope = kind === 'slope'
        return <div className="timeline-lane" key={kind} role="group" aria-label={slope ? '各路段最大坡度' : '各路段最窄路寬'}>
          <span className="timeline-label">{slope ? '坡度' : '路寬'}<small>{slope ? '%' : 'm'}</small></span>
          {model.legs.map(leg => {
            const value = slope ? leg.segment.maxSlopePercent : leg.segment.minWidthM
            const extreme = value !== null && value === (slope ? maxSlope : minWidth)
            const active = leg.index === position?.leg.index
            return <button key={leg.segment.id} className={`timeline-segment ${value === null ? 'unknown' : ''} ${extreme ? 'extreme' : ''} ${active ? 'active' : ''}`}
              aria-pressed={active} aria-label={`第 ${leg.index + 1} 段 ${leg.segment.name}，${slope ? '最大坡度' : '最窄路寬'} ${number(value, slope ? '%' : ' 公尺')}，${Math.round(leg.distanceM)} 公尺${extreme ? slope ? '，全程最高' : '，全程最窄' : ''}`}
              onClick={() => tour.selectSegment(leg.segment.id)}>
              <strong>{value === null ? '未知' : Number(value.toFixed(2))}</strong><small>{extreme ? slope ? '最高' : '最窄' : `第 ${leg.index + 1} 段`}</small>
            </button>
          })}
        </div>
      })}
    </div></div>
    <p className="timeline-caption">每段最大坡度與最窄路寬，未知值保留。{values.some(s => s.status === 'demo') ? '數值為示範。' : ''}</p>
  </section>
}

function Transport({ tour, onStart }: { tour: TourController; onStart?: () => void }) {
  const index = tour.position?.leg.index ?? 0
  return <div className="tour-transport" role="group" aria-label="預演播放控制">
    <button onClick={() => tour.step(-1)} disabled={index === 0} aria-label="上一個預演路段" title="上一段"><SkipBack size={18} aria-hidden="true" /></button>
    <button className="tour-play" onClick={() => { if (!tour.playing) onStart?.(); tour.toggle() }} disabled={tour.reducedMotion} aria-label={tour.playing ? '暫停預演' : tour.distanceM >= tour.model.distanceM ? '重新播放預演' : '播放預演'}>{tour.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}<span>{tour.playing ? '暫停' : '預演'}</span></button>
    <button onClick={() => tour.step(1)} disabled={index >= tour.model.legs.length - 1} aria-label="下一個預演路段" title="下一段"><SkipForward size={18} aria-hidden="true" /></button>
  </div>
}

export default function RouteExplorer({ route, tour, compact = false, onInspect, onStart }: { route: Route; tour: TourController; compact?: boolean; onInspect: (segment: Segment) => void; onStart?: () => void }) {
  const position = tour.position
  if (!position) return null
  const { segment } = position.leg
  if (compact) return <div className="tour-compact">
    <button className="tour-compact-title" onClick={() => onInspect(segment)} aria-label={`查看目前預演路段：${segment.name}`}><strong>第 {position.leg.index + 1} 段 · {route.kind === 'demo' ? '示範預演' : '路線預演'}</strong><span>{segment.name}</span></button>
    <Transport tour={tour} onStart={onStart} />
    <div className="compact-tour-progress" aria-hidden="true"><span style={{ width: `${tour.distanceM / tour.model.distanceM * 100}%` }} /></div>
    {tour.reducedMotion && <p className="compact-reduced-note">已減少動態，可用上一段與下一段檢視。</p>}
    <span className="sr-only" role="status">{tour.notice}</span>
  </div>
  return <section className="route-explorer" aria-label="路線預演與路況時間軸">
    <div className="tour-heading"><div><h2>路線預演</h2><span className="tour-data-label">{route.kind === 'demo' ? '示範路況與入口' : '依查核快照'} · 非即時定位</span></div><button className="tour-reset" onClick={tour.reset} aria-label="預演回到起點" title="回到起點"><RotateCcw size={17} aria-hidden="true" /></button></div>
    <div className="tour-current"><div className="tour-sequence" aria-hidden="true">{position.leg.index + 1}<span>/{tour.model.legs.length}</span></div><div className="tour-current-text"><strong>{segment.name}</strong><span>{number(segment.maxSlopePercent, '%')} 坡度 · {number(segment.minWidthM, ' m')} 路寬 · {segment.surface ?? '路面待確認'}</span></div><button className="tour-inspect" onClick={() => { tour.pause(); onInspect(segment) }}>檢視此段</button></div>
    <div className="tour-playback-row"><Transport tour={tour} onStart={onStart} /><label className="tour-speed"><span>預演速度</span><select aria-label="預演速度" value={tour.speed} onChange={event => tour.setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button className={`tour-follow ${tour.following ? 'active' : ''}`} onClick={() => tour.setFollowing(!tour.following)} aria-pressed={tour.following} aria-label="跟隨預演位置"><Crosshair size={18} aria-hidden="true" /><span>跟隨</span></button></div>
    <div className="tour-scrubber"><input type="range" min="0" max="1000" step="1" value={Math.round(tour.distanceM / tour.model.distanceM * 1000)} aria-label="預演進度" aria-valuetext={`已預演 ${Math.round(tour.distanceM)} 公尺，全程 ${Math.round(tour.model.distanceM)} 公尺，第 ${position.leg.index + 1} 段 ${segment.name}`} onChange={event => tour.seek(Number(event.target.value) / 1000 * tour.model.distanceM)} /><span>{Math.round(tour.distanceM)}<small> / {Math.round(tour.model.distanceM)} m</small></span></div>
    <div className="tour-options"><label><input type="checkbox" checked={tour.pauseEach} onChange={event => tour.setPauseEach(event.target.checked)} />每段結束暫停</label><span>{tour.reducedMotion ? '已依系統設定減少動態，請逐段檢視。' : tour.distanceM >= tour.model.distanceM ? '預演完成' : '播放進度與實際行進時間無關'}</span></div>
    <RouteTimeline tour={tour} />
    <details className="tour-evidence" onToggle={event => { if (event.currentTarget.open) tour.pause() }}><summary><Image size={15} aria-hidden="true" />目前路段照片{!segment.photos.length && <span>待補實景照片</span>}</summary><PhotoGallery key={segment.id} photos={segment.photos} onOpen={tour.pause} /></details>
    <p className="tour-notice" role="status">{tour.notice}</p>
  </section>
}
