# 跑店路線最佳化（全聯）

這是一套給跑店人員使用的瀏覽器工具：最多整理 200 間門市、依機車或汽車路網安排拜訪順序、產生分段 Google Maps 導航，並在手機逐店登記「是否到店」與「檔期牌是否更換」。

**完整流程：店點建檔 → 下載 `stores.csv` → 路線最佳化 → 下載 `route.txt` → 手機跑店登記**

## 立即使用

直接開啟線上版：<https://eyeyesight.github.io/GoogleMaps_RouteOptimization_PX/>

工具本身不需安裝或登入。建議在電腦完成建檔與路線規劃，再把 `route.txt` 傳到手機執行跑店。

| 使用前準備 | 什麼時候需要 |
|---|---|
| Google API Key | 「店點建檔」和「路線最佳化」所使用，用於解析店點或起訖位置。 |
| HERE API Key | 「路線最佳化」所使用，用於安排機車或汽車的拜訪順序。 |
| 店名清單或標準 CSV | 沒有 `stores.csv` 時先用店名建檔，若已有五欄 `stores.csv` 則可直接規劃路線。 |
| `route.txt` | 換到手機或另一台裝置跑店時使用，而該裝置可從結果頁開始，不必匯入或登記 Key。 |

## Quick Start

1. 在「店點建檔」貼上 Google Key，每行輸入一間店，確認候選位置後下載 `stores.csv`。
2. 到「路線最佳化」填入 Google Key、HERE Key、起點與終點，選擇交通工具並上傳 CSV。
3. 產生路線後先檢查各段 Google Maps，再下載 `route.txt`。
4. 把檔案傳到手機，開啟同一網站的「跑店登記」並匯入。
5. 點開門市卡片更新到店／換牌狀態，結束後匯出跑店紀錄備份。

已有 `stores.csv` 可直接從第 2 步開始，已有 `route.txt` 則可直接從第 4 步開始。

## 完整使用流程

1. **店點建檔（沒有標準 CSV 才需要）**：一次可輸入 1–200 個店名。唯一候選會自動採用，當存在多個候選時請核對地址或開啟地圖確認。全部選定後才能下載 UTF-8 CSV。
2. **路線最佳化**：上傳 `stores.csv`，輸入地址或 `緯度,經度` 格式的起終點，選擇機車／汽車、是否避開高速與收費道路，以及每段停靠點數。若任何門市定位失敗，系統會停止，避免漏店。
3. **交接路線**：結果頁可逐段開啟 Google Maps、下載 `route.txt`，或直接按「在這台裝置開始跑店」。預設每段 8 個停靠點，可在 1–9 間調整。
4. **手機跑店登記**：匯入後依分段與順序顯示門市。狀態只在門市明細內修改並立即自動保存；可篩選到店狀態、開啟單店導航、重設進度，或匯出 `route-result-<ROUTE_ID>.txt`。結果檔可再次匯入，接續其中的狀態。

## API Key 與前置設定

API Key 須設定成僅本工具所在的網站方能使用，並只開放本工具需要的 API；費用方面，須設定合理的呼叫次數上限，若平台支援，建議開啟費用通知，避免 Key 被盜用或產生預期外的費用：
- Google Key 必須啟用 **Places API (New)** 與 **Geocoding API**，並連結有效的 Cloud Billing。
- HERE Key 必須能使用 **Waypoints Sequence API v8**。

HERE 把本工具使用的「路線排序」列為 Optimization 服務，即便 API Key 建立成功，且測試時能正常排出路線，也只代表技術設定是正確的，不代表你的方案允許正式使用。實際上線前，請向 HERE 確認目前方案是否包含 Optimization 的使用權。

完整建立步驟、網域限制、費用控制及官方來源見 [API Key 設定指南](docs/api-key-setup-research.md)。

## 常見問題

| 問題 | 處理方式 |
|---|---|
| 「產生路線」不能按 | 確認 Google Key、HERE Key、起點、終點及 CSV 都已填入 |
| CSV 顯示 0 筆或格式錯誤 | 至少要有店名與完整地址；優先使用「店點建檔」輸出的 CSV |
| Google 顯示 `PERMISSION_DENIED`／`REQUEST_DENIED` | 檢查 Billing、Places API (New)、Geocoding API 及網站來源限制 |
| HERE 顯示 Unauthorized 或無法載入 | 檢查 Key、服務連結、Trusted Domains 與方案權限；設定更新後可能需要等待 |
| 手機缺少停靠點或進度消失 | 每段停靠點降到 3；進度只存在匯入時的同一瀏覽器與裝置，清除網站資料前先匯出 |

更多錯誤訊息、路線檔與本機儲存排查見 [完整錯誤排除](docs/troubleshooting.md)。

## `stores.csv` 與 `route.txt` 格式

CSV 標題列可有可無，但欄位固定：

| 索引 | 欄位 | 必要 |
|:---:|:---:|:---:|
| 0 | 店名 | 是 |
| 1 | 區域 | 否 |
| 2 | 完整地址 | 是 |
| 3 | 緯度 | 否 |
| 4 | 經度 | 否 |

沒有座標時會使用 Google API 定位；由「店點建檔」下載的標準 CSV 會包含完整五欄，可避免每次重新查詢門市座標。

新版 `route.txt` 是可讀文字格式，包含 `ROUTE_ID`、建立時間、交通模式、分段 Maps URL，以及每間店的名稱、地址與座標。匯出的結果另含 `VISITED`、`POSTER_CHANGED` 與更新時間。舊版 `routes.txt` 仍可匯入，但缺少地址與座標時會以店名開啟 Maps 搜尋。

## 使用限制與安全事項

- 「路線最佳化」每次必須有至少 2 間有效店點，最多 200 間。`route.txt` 匯入上限為 5 MB。
- Google 官方文件僅保證行動版瀏覽器支援最多 3 個中繼點，其他開啟平台最多 9 個：本工具預設每段 8 個停靠點，僅特定裝置實際出現漏點時，才需要降為 3。
- API Key 不會寫入下載檔或版本庫，但瀏覽器端 Key 不是祕密；務必設定網站、API、quota 與費用限制。
- 跑店路線與進度只保存在目前瀏覽器的 `localStorage`，不會跨裝置同步。無痕模式、清除網站資料或更換瀏覽器都可能失去進度。
- `stores.csv`、`route.txt` 與匯出結果可能包含門市位置及工作紀錄，請透過可信任的方式傳送與保存。
- HERE 負責排序、Google Maps 負責繪製各段導航，出發前仍應評估禁行機車、施工與臨時更動等交通狀況。

## 開發者資訊

專案是純 HTML／CSS／JavaScript，沒有 build step。Google Places／Geocoding 負責座標，HERE Waypoints Sequence 排列店點，Google Maps URLs 負責分段導航，`route.txt` 負責把規劃交接給手機。

```bash
python -m http.server 8000
node --check app.js
node --check ui.js
node --check route-file.js
node --check visit.js
```

延伸文件：[最終需求與驗收標準](docs/final-requirements.md) · [路線容量與交通模式](docs/route-capacity-and-modes.md) · [API Key 設定指南](docs/api-key-setup-research.md) · [替代方案研究](docs/route-optimization-alternatives.md)
