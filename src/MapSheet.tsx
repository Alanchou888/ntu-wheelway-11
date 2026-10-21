import { useRef } from 'react'
import type { ReactNode, Ref } from 'react'
import { AlignLeft, Map, Maximize2 } from 'lucide-react'

export type SheetSize = 'map' | 'half' | 'full'
const sizes: SheetSize[] = ['map', 'half', 'full']
const labels = { map: '地圖', half: '摘要', full: '展開' }

interface Props {
  size: SheetSize; onSize: (size: SheetSize) => void; mobile: boolean
  panelRef: Ref<HTMLElement>; children: ReactNode; collapsed: ReactNode
  label?: string
}
export default function MapSheet({ size, onSize, mobile, panelRef, children, collapsed, label='路線資訊' }: Props) {
  const gesture = useRef<{ y: number; pointer: number; dragged: boolean } | null>(null)
  const shift = (direction: number) => onSize(sizes[Math.max(0, Math.min(2, sizes.indexOf(size) + direction))])
  return <aside className="content-panel map-sheet" data-size={size} id="content-panel" tabIndex={-1} ref={panelRef} aria-label={label==='路線資訊'?'路線設定與資訊':label}>
    <div className="sheet-controls">
      <button className="sheet-grip" aria-label={`調整面板高度，目前${labels[size]}，可使用上下方向鍵`} onPointerDown={event => {
        gesture.current = { y: event.clientY, pointer: event.pointerId, dragged: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => { if (gesture.current && Math.abs(event.clientY - gesture.current.y) > 12) gesture.current.dragged = true }}
      onPointerUp={event => {
        const previous = gesture.current
        if (previous && event.pointerId === previous.pointer) {
          const delta = previous.y - event.clientY
          if (Math.abs(delta) > 30) shift(delta > 0 ? 1 : -1)
        }
      }} onPointerCancel={() => { gesture.current = null }} onClick={() => {
        if (!gesture.current?.dragged) onSize(sizes[(sizes.indexOf(size) + 1) % sizes.length])
        gesture.current = null
      }} onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); shift(event.key === 'ArrowUp' ? 1 : -1) }
      }}><span aria-hidden="true" /><span>{label}</span></button>
      <div className="sheet-size-buttons" role="group" aria-label="面板高度">{[
        { size: 'map' as const, icon: Map }, { size: 'half' as const, icon: AlignLeft }, { size: 'full' as const, icon: Maximize2 },
      ].map(item => <button key={item.size} onClick={() => onSize(item.size)} aria-pressed={size === item.size} aria-label={`${labels[item.size]}面板`}><item.icon size={16} aria-hidden="true" /><span>{labels[item.size]}</span></button>)}</div>
    </div>
    {mobile && size === 'map' && <div className="sheet-collapsed">{collapsed}</div>}
    <div className="sheet-body" hidden={mobile && size === 'map'}>{children}</div>
  </aside>
}
