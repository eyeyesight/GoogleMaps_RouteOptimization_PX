# Product Requirements

本文件是本專案的 product／implementation source of truth。Coding agent 與 maintainer 必須用它判定產品行為、資料契約與驗收結果。

定義日期：2026-08-22 · 最後核對：2026-08-27

| 規範詞 | 意義 |
|---|---|
| `MUST` | 不可違反的產品需求；未滿足即為 acceptance blocker |
| `MUST NOT` | 明確禁止的行為；一旦發生即為 acceptance blocker |
| `SHOULD` | 建議做法；未滿足不會單獨阻擋驗收 |
| `CURRENT` | 目前實作方式；符合所有 `MUST` 時可以替換 |
| `DEFAULT` | 目前預設值；可調整，不改變產品需求 |
| `EXTERNAL CONSTRAINT` | 第三方服務施加的限制 |
| `OPEN / UNCONFIRMED` | 尚未確認；不得當作已成立的事實 |

## 1. Product Scope

產品必須提供一條完整的單人跑店工作流：

- 由店名建立可供路線規劃使用的標準店點資料。
- 以一個固定起點、一個固定終點與一組中繼店點產生拜訪順序。
- 支援機車與汽車。
- 產生可由 Google Maps 開啟的分段導航。
- 將路線規劃結果交給手機上的跑店登記流程。
- 在目前裝置保存跑店進度，不使用中央帳號或中央資料庫。

產品上限的唯一正式定義：

| Constant | Value | Scope |
|---|---:|---|
| `MAX_STORES` | 200 | 單次店點建檔與單次路線規劃的店數上限 |

## 2. User Workflow

```text
店點建檔
  → 路線最佳化
  → route.txt
  → 手機跑店登記
  → 匯出跑店結果
```

已有符合 Data Contracts 的 CSV 或 `route.txt` 時，可從對應階段開始。

## 3. Functional Requirements

每項 requirement 只定義一個必須成立的產品行為。具體 pass／fail 條件見第 5 節。

### Route Optimization

| ID | Requirement |
|---|---|
| `FR-ROUTE-01` | `MUST` 接受且要求一個起點與一個終點。 |
| `FR-ROUTE-02` | `MUST` 將單次處理店數限制在 `MAX_STORES` 以內。 |
| `FR-ROUTE-03` | `MUST` 接受符合 Input CSV contract 的原始或擴充 CSV。 |
| `FR-ROUTE-04` | `MUST` 在排序前取得起點、終點與每間店的有效座標。 |
| `FR-ROUTE-05` | `MUST` 支援機車與汽車兩種交通模式。 |
| `FR-ROUTE-06` | `MUST` 依所選交通模式產生店點拜訪順序。 |
| `FR-ROUTE-07` | `MUST` 讓使用者分別設定是否避開高速公路與收費路段。 |
| `FR-ROUTE-08` | `MUST` 使每間輸入店點在排序結果中出現且只出現一次。 |
| `FR-ROUTE-09` | `MUST` 將完整順序切成連續的導航分段。 |
| `FR-ROUTE-10` | `MUST` 為每個分段產生可由 Google Maps 開啟、且符合所選交通模式的導航連結。 |
| `FR-ROUTE-11` | `MUST` 產生並下載符合 `route.txt` contract 的路線檔。 |
| `FR-ROUTE-12` | `MUST` 允許同一裝置把剛產生的路線直接交給跑店登記，不必先下載再匯入。 |

### Store Registration

| ID | Requirement |
|---|---|
| `FR-STORE-01` | `MUST` 接受逐行店名，並套用 `MAX_STORES` 上限。 |
| `FR-STORE-02` | `MUST` 為每個店名提供最多 3 個位置候選。 |
| `FR-STORE-03` | `MUST` 顯示候選名稱、完整地址、座標與地圖核對入口，並允許使用者變更候選。 |
| `FR-STORE-04` | `MUST` 在每個輸入店名都有可用候選後才允許匯出。 |
| `FR-STORE-05` | `MUST` 以 `stores.csv` 檔名匯出符合 Standard CSV contract 的 UTF-8 CSV。 |

### Run / Visit Tracking

| ID | Requirement |
|---|---|
| `FR-RUN-01` | `MUST` 匯入符合目前 `route.txt` contract 的路線檔。 |
| `FR-RUN-02` | `MUST` 保持舊版 `routes.txt` 的匯入相容性。 |
| `FR-RUN-03` | `MUST` 依分段與店點順序顯示跑店清單。 |
| `FR-RUN-04` | `MUST` 提供全部、已到店與尚未到店三種篩選。 |
| `FR-RUN-05` | `MUST` 為每間店分別記錄到店狀態與檔期牌更換狀態。 |
| `FR-RUN-06` | `MUST` 只在店點明細中修改狀態；點擊清單卡片本身不得直接改變狀態。 |
| `FR-RUN-07` | `MUST` 在每次狀態修改後立即保存，並能在同一裝置與網站重新開啟時恢復。 |
| `FR-RUN-08` | `MUST` 提供分段導航與單店導航。 |
| `FR-RUN-09` | `MUST` 匯出符合 Run Result Export contract 的跑店結果。 |
| `FR-RUN-10` | `MUST` 允許重設全部跑店狀態，同時保留目前路線。 |
| `FR-RUN-11` | `MUST` 在使用者確認載入其他路線時，清除目前保存的路線與進度。 |

### Security and Privacy

| ID | Requirement |
|---|---|
| `FR-SEC-01` | `MUST NOT` 將使用者輸入的 API Key 持久化、寫入下載檔或納入版本庫。 |
| `FR-SEC-02` | `MUST NOT` 將跑店路線或進度寫入中央資料庫。 |

## 4. Data Contracts

### Input CSV

CSV 可有或沒有標題列。欄位位置固定。

#### Raw CSV

| Index | Field | Required | Contract |
|---:|---|---|---|
| 0 | 店名 | Yes | 非空白字串 |
| 1 | 區域 | No | 可為空白 |
| 2 | 地址 | Yes | 非空白字串 |

#### Standard CSV (`stores.csv`)

| Index | Field | Required | Contract |
|---:|---|---|---|
| 0 | 店名 | Yes | 非空白字串 |
| 1 | 區域 | No | 可為空白 |
| 2 | 完整地址 | Yes | 非空白字串 |
| 3 | 緯度 | No | 與經度同時存在時，必須是有效數值 |
| 4 | 經度 | No | 與緯度同時存在時，必須是有效數值 |

`FR-STORE-05` 的輸出標題列固定為：

```text
店名,區域,完整地址,緯度,經度
```

### `route.txt`

新產生的檔案使用 `PX ROUTE FILE`、`VERSION: 2`。下列資訊必須保存：

| Scope | Required fields |
|---|---|
| File | `ROUTE_ID`, `CREATED_AT` |
| Route | `NAME`, `TOTAL_STORES`, `TRAVEL_MODE`, `ORIGIN`, `DESTINATION` |
| Segment | 唯一正整數 index、`GOOGLE_MAPS_URL` |
| Store | 唯一正整數 index、`NAME`, `ADDRESS`, `LAT`, `LNG` |

`CURRENT` serializer 另寫入 `TASK: 檔期牌更換`。此欄位不是獨立 Product Requirement。

舊版 `routes.txt` 只作為 `FR-RUN-02` 的輸入相容格式。新輸出不得降級為舊格式。

### Run Result Export

跑店結果必須保留完整 `route.txt` 路線資料，並加入：

| Scope | Required fields |
|---|---|
| File | `RESULT_EXPORTED_AT` |
| Every store | `VISITED`, `POSTER_CHANGED` |
| Modified store | `UPDATED_AT` |

`VISITED` 與 `POSTER_CHANGED` 是 Boolean。未修改店點可以沒有 `UPDATED_AT`。

## 5. Acceptance Criteria

以下條件均為必要條件。任一條件失敗，對應 requirement 即為 fail。

### Route Optimization

| ID | Pass conditions |
|---|---|
| `FR-ROUTE-01` | 起點或終點為空時禁止開始；兩者都有值時可進入後續驗證。 |
| `FR-ROUTE-02` | 使用 `N = MAX_STORES` 的有效資料時，完整資料流可保留 N 間店；任何單次結果不得超過 `MAX_STORES`。 |
| `FR-ROUTE-03` | Raw CSV 與 Standard CSV 各至少一份 fixture 可成功解析；可選標題列不得被當成店點。 |
| `FR-ROUTE-04` | 地址與 `lat,lng` 形式的起終點均可處理；任一店點或起終點無法取得有效座標時，操作停止並顯示錯誤。 |
| `FR-ROUTE-05` | UI 可選機車與汽車；切換後讀取到的交通模式與選項一致。 |
| `FR-ROUTE-06` | 以可控制的排序回應測試時，最終店點順序與回應 sequence 一致；排序失敗不得假裝成功。 |
| `FR-ROUTE-07` | 高速公路與收費路段可獨立切換；每種組合都會套用到排序與導航輸出。 |
| `FR-ROUTE-08` | 輸入 N 間店時，輸出包含 N 個唯一 input store index；provider 回傳缺漏、重複或 out-of-range index 時，操作失敗並顯示錯誤；不得 silent fallback 成缺店路線。 |
| `FR-ROUTE-09` | 每段不超過使用者設定的停靠點數；上一段終點等於下一段起點；合併所有分段後沒有漏店或重複計入店點。 |
| `FR-ROUTE-10` | 每段連結可由 Google Maps 開啟；開啟後的交通模式與避開設定符合使用者選擇。 |
| `FR-ROUTE-11` | 下載檔可由 Run / Visit Tracking 重新匯入；route ID、分段數、店數、店點順序與地址／座標保持一致。 |
| `FR-ROUTE-12` | 點擊同裝置交接操作後，跑店登記立即顯示相同 route ID、分段與店點順序。 |

### Store Registration

| ID | Pass conditions |
|---|---|
| `FR-STORE-01` | 1 間與 `MAX_STORES` 間店名均可開始解析；超過 `MAX_STORES` 時禁止解析並顯示上限錯誤。 |
| `FR-STORE-02` | 每個輸入店名顯示的候選數不超過 3。 |
| `FR-STORE-03` | 每個候選顯示名稱、地址與座標；有地圖 URI 時可開啟核對；切換候選後，畫面與匯出資料改為所選候選。 |
| `FR-STORE-04` | 任一店名沒有可用候選時，下載操作不可用；所有店名都有可用候選時才可下載。 |
| `FR-STORE-05` | 輸出檔名為 `stores.csv`，可用 UTF-8 解碼，標題與欄位順序符合 Standard CSV contract，並可由 Route Optimization 讀取相同店數。 |

### Run / Visit Tracking

| ID | Pass conditions |
|---|---|
| `FR-RUN-01` | 有效的 version 2 `route.txt` 可匯入；空檔或沒有任何 store 的檔案顯示錯誤且不建立工作階段。 |
| `FR-RUN-02` | 含 `routeN: URL` 與後續店名的 legacy fixture 可匯入；缺少座標時仍可用店名建立單店導航。 |
| `FR-RUN-03` | 分段順序、分段內店點順序與檔案一致；所有店點恰好顯示一次。 |
| `FR-RUN-04` | 全部顯示所有店點；已到店只顯示 `VISITED=true`；尚未到店只顯示 `VISITED=false`。 |
| `FR-RUN-05` | `VISITED` 與 `POSTER_CHANGED` 可獨立切換；畫面計數與狀態文字立即更新。 |
| `FR-RUN-06` | 點擊店點卡片只開啟明細且不改變狀態；只有明細內的狀態控制會修改資料。 |
| `FR-RUN-07` | 每次狀態切換後不需額外儲存；重新載入同一網站時，相同 route ID 的路線與狀態可恢復。 |
| `FR-RUN-08` | 有效分段 URL 可開啟；單店有座標時以座標導航，沒有座標時以店名／地址搜尋。 |
| `FR-RUN-09` | 匯出檔符合 Run Result Export contract；重新匯入後可恢復每間店的兩個狀態。 |
| `FR-RUN-10` | 重設後所有 `VISITED`、`POSTER_CHANGED` 為 false，所有 `UPDATED_AT` 清空；route ID、分段與店點順序不變。 |
| `FR-RUN-11` | 使用者確認載入其他路線後，目前工作階段與保存進度被清除，畫面回到路線檔匯入狀態。 |

### Security and Privacy

| ID | Pass conditions |
|---|---|
| `FR-SEC-01` | 輸入 API Key 並完成一次操作後，Key 不得出現在下載檔、Web Storage、IndexedDB 或版本控制檔案中；重新載入頁面時 Key 欄位為空。 |
| `FR-SEC-02` | 跑店路線與狀態操作不得向專案控制的中央資料儲存服務寫入資料；離線保存只限目前裝置。 |

## 6. Default Configuration

> Changing these values does not change the Product Requirements.

| Setting | `DEFAULT` value | Adjustable |
|---|---|---|
| 起點 | 空白 | Yes |
| 終點 | 空白 | Yes |
| 交通模式 | 機車（`TWO_WHEELER`） | Yes |
| 避開高速公路 | 啟用 | Yes |
| 避開收費路段 | 啟用 | Yes |
| 每段停靠點 | 8；UI 可調範圍 1–9 | Yes |

`CURRENT` 營運估算：一般營運量為每月不超過 20 次路線規劃。這不是 acceptance blocker。

## 7. External Constraints

### Google Maps Platform

| Status | Constraint |
|---|---|
| `EXTERNAL CONSTRAINT` | Google Maps URL 的行動版瀏覽器最多支援 3 個 intermediate waypoints；其他平台最多 9 個。 |
| `EXTERNAL CONSTRAINT` | Google Maps URL 長度上限為 2,048 字元。 |
| `EXTERNAL CONSTRAINT` | Maps URL 的機車與汽車模式分別使用 `two-wheeler` 與 `driving`。 |
| `EXTERNAL CONSTRAINT` | Places API (New) 與 Geocoding API 要求有效 Billing；公開網站 Key 必須限制網站來源與可呼叫 API。 |
| `EXTERNAL CONSTRAINT` | Google Budget alert 只提供通知，不會自動停止 API 或封頂費用；請求量上限必須另設 Quota。 |
| `EXTERNAL CONSTRAINT` | Quota、價格與免費額度可能調整，不得把特定時點數值寫成永久產品保證。 |

### HERE

#### Technical capability

| Status | Constraint |
|---|---|
| `EXTERNAL CONSTRAINT` | Waypoints Sequence API v8 單次最多 202 個 waypoints，包含 start 與 end；此容量可涵蓋 `MAX_STORES`。 |
| `EXTERNAL CONSTRAINT` | Waypoints Sequence 支援 `scooter` 與 `car`。 |
| `EXTERNAL CONSTRAINT` | 2026-08-22 查核時，Limited Plan 為所有服務合計 1,000 requests/day，Waypoints Sequencing 為 1 RPS。實際值以帳戶方案與控制台為準。 |
| `EXTERNAL CONSTRAINT` | 公開瀏覽器使用 HERE API Key 時必須設定 Trusted Domains；設定最長可能約 30 分鐘生效。 |
| `EXTERNAL CONSTRAINT` | 大型 GET 可能受 URL／request-line 長度限制；官方大型請求路徑為 POST。 |

#### Commercial / contractual permission

| Status | Constraint |
|---|---|
| `OPEN / UNCONFIRMED` | HERE 將目的地順序或路線計算歸類為 Optimization；Limited／Base Plans 的排除用途包含 Optimization。正式使用前仍需取得可用方案或書面確認。 |

API 技術測試成功只證明技術設定可呼叫，不代表商業或合約權限已確認。

詳細來源見 [API Key 設定指南](api-key-setup-research.md)與[路線容量與交通模式查核](route-capacity-and-modes.md)。

## 8. Current Implementation

> These are implementation choices unless explicitly constrained by a Product Requirement.

| Area | `CURRENT` implementation | Primary code |
|---|---|---|
| Deployment | 純前端 HTML／CSS／JavaScript，部署於 GitHub Pages，沒有 build step | [`index.html`](../index.html) |
| Store resolution | Google Places Text Search (New)，找不到時使用 Google Geocoding | [`app.js`](../app.js) |
| Candidate selection | 唯一候選自動採用；多個候選預先選取第一筆，但使用者可以改選 | [`app.js`](../app.js) |
| Route ordering | HERE Waypoints Sequence API v8，`improveFor=time`、`traffic:disabled` | [`app.js`](../app.js) |
| HERE browser transport | 以 GET／JSONP 呼叫；endpoint 未提供瀏覽器 CORS response header | [`app.js`](../app.js) |
| Transport mapping | `TWO_WHEELER → scooter → two-wheeler`；`DRIVE → car → driving` | [`app.js`](../app.js) |
| Route preferences | HERE 使用 `motorway:-3`、`tollroad:-3`；Maps URL 使用 `avoid=highways|tolls` | [`app.js`](../app.js) |
| Navigation | Google Maps URLs | [`app.js`](../app.js) |
| Route handoff | `PX ROUTE FILE` version 2；同裝置以 custom event 直接交接 | [`route-file.js`](../route-file.js), [`app.js`](../app.js) |
| Legacy compatibility | 舊版 `routes.txt` 由 legacy parser 轉成目前資料模型 | [`route-file.js`](../route-file.js) |
| Run persistence | 依 route ID 寫入瀏覽器 `localStorage` | [`visit.js`](../visit.js) |
| API Key handling | Key 由使用者當次貼入；目前 route UI gate 要求 Google 與 HERE Key；程式不持久化 Key | [`ui.js`](../ui.js), [`app.js`](../app.js) |
| CSV handling | Papa Parse；輸入嘗試 UTF-8、Big5／CP950 等常見編碼；建檔輸出 UTF-8 BOM | [`app.js`](../app.js) |
| Capacity enforcement | 店點建檔超過 `MAX_STORES` 時拒絕；路線 CSV parser 最多讀取 `MAX_STORES` | [`app.js`](../app.js) |
| Current input guards | 路線生成要求至少 2 間有效店點；`route.txt` 匯入檔案上限為 5 MB | [`app.js`](../app.js), [`visit.js`](../visit.js) |

更換排序 provider、座標 provider 或本機保存技術是允許的；替換後仍必須通過第 5 節所有相關 Acceptance Criteria。

### Current conformance notes

| Requirement | Status | Note |
|---|---|---|
| `FR-RUN-02`, `FR-RUN-08` | `CURRENT` known gap | `storeMapsUrl()` 以 `Number(value)` 判斷座標；legacy 空字串會被視為數值零，可能無法退回店名／地址搜尋。修正並通過對應 Acceptance Criteria 前不得標記 pass。 |
| `FR-ROUTE-02` | `OPEN / UNCONFIRMED` | `MAX_STORES` 的完整前端 GET／JSONP 路徑仍受外部 URL 長度限制風險；必須以實際部署環境驗證，不得只用 provider mock 宣告 pass。 |

## 9. Architecture Decisions

### ADR-01 — Waypoints Sequence over Tour Planning

**Decision**

`CURRENT` 路線排序採 HERE Waypoints Sequence API v8，不採 HERE Tour Planning。

**Reason**

目前情境是單一執行者、固定起終點與單一路徑排序，不需要多車、容量、技能或時間窗等 VRP 能力。Waypoints Sequence 介面較小，技術容量符合 `MAX_STORES`。

**Implication**

此決策不把 HERE 固定成永久 Product Requirement。替代 provider 必須滿足 Route Optimization requirements、Data Contracts 與商業使用權限。

背景比較見[路線最佳化替代方案](route-optimization-alternatives.md)。

## 10. Future / Conditional Architecture

以下項目目前不是 acceptance blocker：

- `SHOULD`：若改成正式多人服務，可加入 backend proxy，將 provider credentials 留在伺服器端。
- `SHOULD`：backend 可集中實作 rate limiting、usage monitoring 與錯誤觀測。
- `SHOULD`：若 GET／JSONP 無法可靠處理大型路線，可改用 server-side POST。
- `SHOULD`：更換 route ordering provider 時，應先以第 5 節作為 provider contract test。

若目前實作無法通過既有 Acceptance Criteria，該 failure 仍是 blocker；採用 backend 或其他 provider 只是可能解法，不會降低 `MUST`。

新增中央帳號、跨裝置同步或中央進度資料庫會改變 Product Scope，必須先經過明確的產品需求變更，不得視為本節的隱含建議。
