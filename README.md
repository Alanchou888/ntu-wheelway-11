# 輪椅友善路徑導航系統

第 11 組輪椅友善路徑導航系統的 Web App 原始碼。公開版可選擇總圖與博雅之間的去程或回程，查看沿途實勘照片與單點量測。

公開測試網址：https://ntu-wheelway-11.brainyshell5.chatgpt.site/

Public GitHub repo：https://github.com/Alanchou888/ntu-wheelway-11

## 目前的 MVP

首頁直接選方向。搜尋、更多設施、路況回報、分享與收藏均可使用。公開操作的前後差異、團隊工具及資料範圍見 [MVP 公開介面整理](docs/MVP-公開介面整理.md)。

## 既有版本功能紀錄

以下記錄 v2.5 與更早版本的功能。公開 MVP 目前的入口以上一節為準。

- 新增障礙精準落點、路況參與選路，以及路線／路況／坡度／設施四種地圖主題。落點選填且需在所選路段附近，舊整段回報繼續有效。避開近期受阻回報會列出排除原因，資料需要更新時暫不提供符合避開條件的結果。詳見 [v2.5 路況選路與主題圖層](docs/v2.5-路況選路與主題圖層.md)。

- 新增校園地點探索：搜尋建物與設施、鍵盤搜尋建議、最近查看、地圖點選與地點分享。地點卡片呈現來源、取得日期、入口與缺少的資訊，總圖及博雅可設為起終點。詳見 [v2.4 校園地點探索](docs/v2.4-校園地點探索.md)。
- 目前地點快照包含 65 個建物、5 個地標與 18 個公開斜坡道。廁所、電梯、飲水與休息設施 API 本次未取得有效資料，分類保留明確說明，不填入示範設施。
- 新增裝置定位：由使用者按「同意並開啟定位」後取得自己的位置，顯示定位點、誤差範圍與更新時間。支援地圖跟隨、停止及清除，背景自動暫停。位置只在本頁記憶體使用，不存入本站紀錄、回報或分享連結。詳見 [v2.3 裝置定位](docs/v2.3-裝置定位.md)。
- 新增路段社群回報：公開閱讀，登入後可發布文字與照片、確認現況、檢舉與撤回。D1 與 R2 提供跨裝置共用儲存，使用者回報持續與實勘證據分開。詳見 [v2.2 社群路況](docs/v2.2-社群路況.md)。
- 新增路線預演：沿道路幾何播放、逐段暫停、前後跳段、1×／2×／4× 速度及鍵盤進度操作。手機播放時會收合面板。
- 新增互動路況時間軸：按路段距離排列坡度與路寬，選段會同步更新地圖、說明與照片。未知值保留，資料不完整時不判定全程極值。
- 手機可用按鈕、把手拖曳或鍵盤調整面板高度。拖動地圖會解除預演跟隨，背景自動暫停，系統減少動態時保留手動查看。

- 可選擇坡度、路寬、階差與查核期限，條件會保留於分享連結。
- 收藏及偏好保存在目前瀏覽器，可移除收藏並復原。
- 實勘編輯器增加輸入驗證、保存狀態與多分頁寫入衝突保護。
- 照片可逐張檢視及放大，確認路線頁提供列印版面。
- 正式建置產生離線外殼與同版本資料快取，不快取外部地圖圖磚。
- 提供實勘 JSON 審查及本地資料發布工具，流程見 [實勘發布流程](docs/實勘發布流程.md)。

v2.0 的 93 項自動測試與 16 項瀏覽器主要流程檢查保留於 [產品檢查與改善](docs/產品檢查與改善.md) 與 [驗證資料](docs/evidence/v2-ui-qa.json)。v2.1 新增預演幾何、暫停邊界、反向路線、未知值與減少動態的測試，驗證範圍見 [v2.1 操作與驗證](docs/v2.1-路線預演.md)。實際受測者測試、完整輔助科技檢查與真實路況實勘仍待團隊執行。

公開原始碼不包含實際受測者紀錄、本機 IndexedDB 草稿、使用者照片、API 憑證或課程 PDF。公開已查核路線目前為空，需由團隊實勘及審核後接入。

![v2.1 桌面路線預演](docs/evidence/v21-desktop-preview.png)

## 前端設計規則

- [DESIGN.md](DESIGN.md) 記錄字級、色彩、配置、互動與選用 skill 的版本。
- [前端美化提示詞](docs/前端美化提示詞.md) 可直接用於後續修改。
- 實作時使用 Anthropic Frontend Design 與 UI UX Pro Max，已排除不適合地圖工具的行銷頁建議。
- Skill 安裝於開發者本機，不屬於執行網站的必要依賴。

## v1.1 新增

- 實勘編輯器可建立兩條空白動線草稿，逐段填寫量測、入口座標、照片、來源及日期。支援目前瀏覽器自動儲存、JSON 匯入匯出與 CSV 彙整。目前由本機團隊入口提供。
- 差異摘要：比較表直接呈現距離、最大坡度及最窄路寬，以及多走多少公尺、坡度差幾個百分點、路寬差多少公尺。
- 瓶頸標記：標出所選路線最陡與最窄的路段，保留並列情況。地圖標記與清單可互相切換，地圖標記支援 Enter 與空白鍵。

草稿只存在當前瀏覽器的 IndexedDB，公開網址不包含本機草稿。網站不會自動發布草稿。將 JSON 交給團隊審核後，才可接入公開的已查核路線。清除網站資料或更換裝置會失去本機紀錄，請定期匯出備份。

## 啟動

建議使用 Node.js 24，專案保留 npm lockfile。

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run db:local
npm.cmd run dev:api
```

開啟 `http://127.0.0.1:8787/` 查看正式建置與本機 API。前端開發可另開終端執行 `npm.cmd run dev -- --host 127.0.0.1`，開啟 `http://127.0.0.1:5173/`，可使用本機模擬登入。檢查與重新建置：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

網站包含 `dist/client` 前端、`dist/server` Worker 與 `dist/.openai` 發布資訊。社群功能需要 Sites 的 D1 與 R2，相關設定見 v2.2 文件。分享網址保存方向、路段或地點，可直接重新開啟。

團隊可執行 `npm.cmd run team`，從 `http://127.0.0.1:5173/team` 編輯本機草稿或下載空白範本。

`npm.cmd run places:refresh` 更新周邊設施快照，失敗時保留上一版。`npm.cmd run places:refresh -- --offline` 只驗證現有快照，不連線。搜尋與地點分類使用同站 `data/places.json`，瀏覽者不會直接呼叫 Overpass。最近查看只保存目前瀏覽器內最多 8 個公開地點 ID，可從搜尋建議清除。

## 資料範圍

公開版顯示第 11 組試走的去回程和 12 個實勘點。路線依現場地標與公開步道重繪，館內虛線表示約略走向。照片與單點量測可從實勘卡查看。地圖來源及取得日期收在「說明」的「資料說明」。

## 團隊後續工作

- [圖資更新與實勘資料接入](docs/資料維護.md)
- [空白使用者測試與設計決策紀錄](docs/使用者測試紀錄.md)
- [空白實勘 CSV](docs/templates/field-survey.csv)
- 執行 `npm.cmd run survey:template` 可建立可編輯的路線 JSON 範本。

實勘、使用者訪談與正式測試結果需由團隊實際蒐集。程式測試不代表已完成課程要求的受測者測試。

## 技術與 AI 使用紀錄

使用 React、TypeScript、Vite、Leaflet 與 Lucide，社群服務使用 Cloudflare Workers、D1 與 R2。瀏覽路線與公開回報無需登入，發布與確認使用 ChatGPT 登入，無需自行提供付費地圖 API key。實勘草稿仍以瀏覽器 IndexedDB 儲存。

本版由 AI 協助實作介面、公開資料處理及程式驗證。公開版採滿版地圖、浮動面板與路線預演。團隊在實際使用者測試後記錄操作問題與改版依據。

地圖來源：臺大校園公開 API 與 WMS、OpenStreetMap contributors（ODbL）、臺北市輪行臺北設施 API。各筆來源網址與取得日期保存在資料快照中。

## 重跑瀏覽器驗證

啟動開發伺服器後，另開終端執行。需要已安裝 Chrome 的環境，輸出截圖會寫入 `output/playwright/`。

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway open http://localhost:5173/
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/browser-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/browser-v11-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/browser-failure-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/accessibility-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway close
```

`browser-failure-qa.js` 會故意模擬 HTTP 錯誤、圖層故障與圖片遺失，因此瀏覽器網路紀錄會出現預期錯誤。腳本會檢查介面復原、清單可用性及未捕捉的 JavaScript 例外。`browser-v11-qa.js` 會在獨立的自動測試瀏覽器填入明確標示的程式測試資料，檢查本機儲存、照片與匯入匯出，測試資料僅寫入忽略的 `output/`，不放入公開實勘資料。自動無障礙檢查使用 axe-core，不能取代真實輔助科技與使用者測試。
