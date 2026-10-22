import { MapPin, MessageSquare, Mountain, Route } from 'lucide-react'
import type { MapTheme, Mode } from './types'

export const mapThemes = [
  { id: 'routes' as const, label: '路線', Icon: Route, description: '比較兩條動線' },
  { id: 'conditions' as const, label: '路況', Icon: MessageSquare, description: '近期回報與障礙位置' },
  { id: 'slope' as const, label: '坡度', Icon: Mountain, description: '依各段最大坡度呈現' },
  { id: 'facilities' as const, label: '設施', Icon: MapPin, description: '周邊公開設施點位' },
]

export function ThemeChooser({ theme, onChange }: { theme: MapTheme; onChange: (theme: MapTheme) => void }) {
  return <div className="map-theme-options" role="group" aria-label="地圖主題">{mapThemes.map(({ id, label, Icon, description }) => <button key={id} type="button" aria-pressed={theme === id} onClick={() => onChange(id)}><Icon size={19} aria-hidden="true" /><strong>{label}</strong><small>{description}</small></button>)}</div>
}

export function ThemeLegend({ theme, mode }: { theme: MapTheme; mode: Mode }) {
  if (theme === 'routes') return null
  return <div className="theme-legend-content" aria-label={`${mapThemes.find(t => t.id === theme)?.label}圖例`}>
    <strong>{theme === 'slope' ? `路段最大坡度${mode === 'demo' ? '（示範）' : ''}` : theme === 'conditions' ? '社群路況，未實勘' : '公開設施，未實勘'}</strong>
    {theme === 'slope' ? <><div className="theme-legend-keys"><span><i className="theme-line slope-low" />≤ 3%</span><span><i className="theme-line slope-mid" />&gt; 3% 至 5%</span><span><i className="theme-line slope-high" />&gt; 5%</span><span><i className="theme-line slope-unknown" />未知</span></div><p>整段最大值的分類，未推算連續高程或通行評分。</p></> : theme === 'conditions' ? <><div className="theme-legend-keys"><span><i className="theme-line condition-blocked" />近期無法通行回報</span><span><i className="theme-line condition-difficult" />近期通行困難回報</span><span><i className="theme-line slope-unknown" />其他或尚無回報</span></div><p>有數字的標記代表整段回報，單一驚嘆號代表使用者落點。</p></> : <p>廁、梯、水、休、坡代表設施類型。部分分類資料待補，點選可查看來源。</p>}
  </div>
}
