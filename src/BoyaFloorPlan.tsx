import { ChevronDown } from 'lucide-react'

export const boyaFloorPointIds = new Set([
  'field-boya-indoor-ramp',
  'field-boya-restroom',
  'field-boya-west-ramp',
])

export function BoyaFloorPlan() {
  return <details className="boya-floor-details">
    <summary>博雅一樓位置圖<ChevronDown size={16} aria-hidden="true" /></summary>
    <figure>
      <div className="boya-floor-diagram" aria-hidden="true">
        <div className="boya-floor-orientation"><span>西 · 運動場</span><span>東 · 小福樓</span></div>
        <div className="boya-floor-layout">
          <span className="boya-floor-room room-101">101 教室</span>
          <span className="boya-floor-room room-102">102 教室</span>
          <span className="boya-floor-room room-103">103 教室</span>
          <span className="boya-floor-hall">一樓大廳</span>
          <span className="boya-floor-pin floor-exit">門</span>
          <span className="boya-floor-pin floor-ramp">坡</span>
          <span className="boya-floor-lift">電梯</span>
          <span className="boya-floor-pin floor-restroom">廁</span>
        </div>
      </div>
      <figcaption>依校方平面圖與實勘畫面標示相對位置。</figcaption>
    </figure>
    <dl className="boya-floor-legend">
      <div>
        <dt><span className="boya-floor-pin" aria-hidden="true">門</span>西側出口</dt>
        <dd>面向運動場的正門，門外接戶外坡道。</dd>
      </div>
      <div>
        <dt><span className="boya-floor-pin" aria-hidden="true">廁</span>無障礙廁所門口</dt>
        <dd>在西側電梯旁。圖上標的是廁所所在區域。</dd>
      </div>
      <div>
        <dt><span className="boya-floor-pin" aria-hidden="true">坡</span>館內扶手坡道</dt>
        <dd>約在 103 教室旁，依實勘影片中的門牌定位。</dd>
      </div>
    </dl>
    <div className="boya-floor-sources">
      <a href="https://ga.ntu.edu.tw/main_ch/fileRename/fileRename/1656/857/2/3/15.%E5%9C%B0%E7%90%86%E8%B3%87%E8%A8%8A%E7%B3%BB%E7%B5%B1.pdf#page=7" target="_blank" rel="noreferrer">總務處無障礙平面圖（PDF）</a>
      <a href="https://www.aca.ntu.edu.tw/WebUPD/acaEN/CDRegulations/DirectivesGoverningtheManagementofVenueRentalsfortheExhibitionHallintheBoyaLectureBuilding.pdf#page=7" target="_blank" rel="noreferrer">教務處一樓平面圖（PDF）</a>
    </div>
  </details>
}
