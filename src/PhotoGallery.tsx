import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, X } from 'lucide-react'
import type { Photo } from './types'

export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const photo = photos[index] ?? photos[0]
  const currentIndex = photos[index] ? index : 0
  useEffect(() => { if (open) dialogRef.current?.showModal(); return () => dialogRef.current?.close() }, [open])
  const failedPhoto = photo && failed.includes(photo.src)
  const image = (expanded = false) => !photo || failedPhoto ? <div className="photo-placeholder"><ImageIcon size={28} strokeWidth={1.4} /><div><strong>{photo ? '照片暫時無法載入' : '待補實景照片'}</strong><span>{photo ? '可切換其他照片或稍後再試' : '取得現場照片後會顯示於此'}</span></div></div> : <img className={expanded ? 'expanded-photo' : ''} src={photo.src} alt={photo.alt} onError={() => setFailed(previous => previous.includes(photo.src) ? previous : [...previous, photo.src])} />
  const move = (delta: number) => setIndex(previous => Math.max(0, Math.min(photos.length - 1, previous + delta)))
  if (!photos.length) return image()
  return <div className="photo-gallery"><figure className="segment-photo"><button className="photo-open" onClick={() => setOpen(true)} aria-label={`放大照片 ${currentIndex + 1}：${photo.alt}`}>{image()}<span><Expand size={15} />放大查看</span></button><figcaption>{photo.caption}</figcaption></figure>
    {photos.length > 1 && <div className="photo-selector" role="group" aria-label="選擇實景照片">{photos.map((p, i) => <button key={`${i}-${p.src}`} onClick={() => setIndex(i)} aria-pressed={currentIndex === i} aria-label={`照片 ${i + 1}：${p.caption}`}>{i + 1}</button>)}</div>}
    {open && <dialog className="photo-dialog" ref={dialogRef} aria-labelledby="photo-dialog-title" onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }} onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) } if (e.key === 'ArrowRight') { e.preventDefault(); move(1) } }}><div className="dialog-header"><h2 id="photo-dialog-title">實景照片 {currentIndex + 1} / {photos.length}</h2><button className="icon-button" aria-label="關閉照片" onClick={() => setOpen(false)}><X size={22} /></button></div>{image(true)}<p className="photo-full-caption">{photo.caption}</p><div className="photo-dialog-actions"><button className="button secondary" aria-label="上一張照片" disabled={currentIndex === 0} onClick={() => move(-1)}><ChevronLeft size={18} />上一張</button><button className="button secondary" aria-label="下一張照片" disabled={currentIndex === photos.length - 1} onClick={() => move(1)}>下一張<ChevronRight size={18} /></button></div></dialog>}
  </div>
}
