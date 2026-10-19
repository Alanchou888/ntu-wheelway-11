# 輪行臺大 WHEELWAY

第 11 組輪椅友善路徑導航系統的 Web App v1。依 Proposal-2 與 Project Handout v4 製作，支援「設定條件 → 比較路線 → 檢視路段 → 確認動線」。

## 啟動

建議使用 Node.js 24，專案保留 npm lockfile。

```powershell
npm.cmd ci
npm.cmd run dev
```

開啟 `http://localhost:5173`。正式靜態建置與預覽：

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

靜態輸出位於 `dist/`。網址以 hash 保存畫面、起終點、輪椅類型、偏好及路線，可直接分享與重新開啟。

## 初版資料

預設示範模式的道路幾何來自 OpenStreetMap，兩條動線約 512 公尺與 722 公尺。坡度、路寬、路面、階差與入口標示為示範，查核日期均留空。臺大 API 的建物中心用於定位，未視為無障礙入口。輪行臺北周邊 18 個公開斜坡道點位的未知值保留為 null。

已查核模式目前沒有實勘路線，會顯示「目前無已查核路線」。可在資料來源視窗查看各公開來源與取得日期。地圖圖層失敗時仍可使用資料快照、向量背景與路段清單，未提供圖磚離線下載。

## 團隊後續工作

- [圖資更新與實勘資料接入](docs/資料維護.md)
- [空白使用者測試與設計決策紀錄](docs/使用者測試紀錄.md)
- [空白實勘 CSV](public/templates/field-survey.csv)
- 執行 `npm.cmd run survey:template` 可建立可編輯的路線 JSON 範本。

實勘、使用者訪談與正式測試結果需由團隊實際蒐集。程式測試不代表已完成課程要求的受測者測試。

## 技術與 AI 使用紀錄

使用 React、TypeScript、Vite、Leaflet 與 Lucide。無登入、資料庫或付費 API key。

本版由 AI 協助實作介面、公開資料處理及程式驗證。保留提案的四步流程，將桌面呈現改為清單與地圖並排，手機呈現改為地圖上方、操作下方。未有實勘照片的區塊保留缺圖提示。示範模式與查核模式分開，避免將模擬數值誤認為通行證據。這些實作選擇仍待真實使用者測試與團隊迭代。

地圖來源：臺大校園公開 API 與 WMS、OpenStreetMap contributors（ODbL）、臺北市輪行臺北設施 API。各筆來源網址與取得日期保存在資料快照中。

## 重跑瀏覽器驗證

啟動開發伺服器後，另開終端執行。需要已安裝 Chrome 的環境，輸出截圖會寫入 `output/playwright/`。

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway open http://localhost:5173/
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/browser-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/browser-failure-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway run-code --filename scripts/accessibility-qa.js
npx.cmd --yes --package @playwright/cli playwright-cli -s=wheelway close
```

第二份腳本會故意模擬 HTTP 錯誤、圖層故障與圖片遺失，因此瀏覽器網路紀錄會出現預期錯誤。腳本會檢查介面復原、清單可用性及未捕捉的 JavaScript 例外。自動無障礙檢查使用 axe-core，不能取代真實輔助科技與使用者測試。
