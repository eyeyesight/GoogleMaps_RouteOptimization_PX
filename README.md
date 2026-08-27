# 多站點跑店路線最佳化

純前端工具：單次最多讀取 200 間全聯店點；以 HERE 的機車或汽車路網排列拜訪順序，再切成可直接開啟的 Google Maps 導航連結。完成規劃後可下載 `route.txt`，帶到手機的「跑店登記」分頁逐店記錄到店與檔期牌狀態。

線上版本：<https://eyeyesight.github.io/GoogleMaps_RouteOptimization_PX/>

## 現行架構

```text
店名／CSV
  → Google Places／Geocoding 取得明確座標
  → HERE Waypoints Sequence API v8（scooter／car）排列最多 200 間店
  → 驗證沒有漏點、重複或越界
  → 分段 Google Maps URLs（two-wheeler／driving）
  → route.txt（分段地圖、店點順序、地址與座標）
  → 手機跑店登記（localStorage 自動續跑）
```

- 路線工具固定以 200 間為單次上限，不在一般操作區暴露工程設定。
- HERE Waypoints Sequence 上限為 202 點（包含固定起點與終點），因此可容納 200 間店。
- Google Maps URL 只負責呈現與導航，不負責多店最佳化。
- 不需要 build step，也不會保存 API key。只有「跑店登記」會把已匯入路線與進度保存在目前瀏覽器的 `localStorage`。

詳細驗收標準見 [`docs/final-requirements.md`](docs/final-requirements.md)，API key 官方資料核對見 [`docs/api-key-setup-research.md`](docs/api-key-setup-research.md)，替代方案研究見 [`docs/route-optimization-alternatives.md`](docs/route-optimization-alternatives.md)。

## API 需求

### HERE API key

用於 Waypoints Sequence API v8。請建立 HERE 專案與 API key，連結服務並設定 Trusted Domains。技術上能建立 key 或收到測試回應，不代表目前帳戶方案已授權 Optimization 用途；正式採用前需向 HERE 確認 entitlement。

HERE endpoint 沒有提供瀏覽器 CORS response header，因此本純前端版本依官方支援改用 JSONP；API key 仍會出現在 request URL 中，Trusted Domains 是必要的濫用防護。若日後改成正式多人服務，建議加一層後端 proxy。

交通模式會成對映射：

```text
機車：HERE fastest;scooter;traffic:disabled → Google Maps two-wheeler
汽車：HERE fastest;car;traffic:disabled     → Google Maps driving
```

勾選偏好時另加 `motorway:-3`、`tollroad:-3`。

### Google Maps API key

只有在地址或店名需要轉座標時才需要。請啟用：

- Places API (New)
- Geocoding API

公開部署時務必設定網站來源限制、API 限制與用量警示。API key 由使用者在頁面當次貼入，不會寫入 repo 或下載檔。

## API key 手把手取得教學

本工具需要兩把不同的 key：

| Key | 用途 | 必須啟用的服務 |
|---|---|---|
| Google Maps API key | 店名／地址轉成完整地址與座標 | Places API (New)、Geocoding API |
| HERE API key | 用 scooter／car 模式排列最多 200 間店 | Waypoints Sequence API v8 |

請不要把任何 key 寫進 `app.js`、README、截圖或 commit。建立完成後，只貼到工具網頁的對應輸入框。

### A. 取得 Google Maps API key

Google Maps Platform 即使使用每月免費額度，仍要求專案連結有效的 Cloud Billing 帳戶。Billing budget 只是通知，**不會自動停止計費**；真正要限制請求量，還要設定 API quota。[Places API (New) 設定說明](https://developers.google.com/maps/documentation/places/web-service/get-api-key) · [Cloud Billing budget 說明](https://docs.cloud.google.com/billing/docs/how-to/budgets)

#### 1. 建立 Google Cloud 專案

1. 登入 [Google Cloud Console](https://console.cloud.google.com/)。
2. 點最上方的專案選擇器。
3. 點「新增專案／New Project」。
4. 專案名稱可填 `GoogleMaps-RouteOptimization`。
5. 點「建立／Create」，完成後確認最上方選到剛建立的專案。

#### 2. 連結 Billing

1. 左上角導覽選單進入「Billing／帳單」。
2. 建立或選擇 Billing account，依畫面加入付款方式。
3. 把 `GoogleMaps-RouteOptimization` 專案連結到該 Billing account。
4. 回到專案總覽，確認 Billing 狀態為啟用。

這一步不等於一定會被收費；但免費額度用完、key 被濫用或 quota 設太高時仍可能產生費用。

#### 3. 啟用兩個 API

1. 進入「APIs & Services → Library」。
2. 搜尋 `Places API (New)`，進入後點「Enable／啟用」。不要只啟用名稱相近的舊版 `Places API`。
3. 回到 Library，搜尋 `Geocoding API`，進入後點「Enable／啟用」。
4. 若按鈕顯示「Manage／管理」，代表已啟用。

Google 官方說明啟用後可能要等幾分鐘才可呼叫。[Places API (New) 官方設定](https://developers.google.com/maps/documentation/places/web-service/get-api-key) · [Geocoding API 官方設定](https://developers.google.com/maps/documentation/geocoding/start)

#### 4. 建立 API key

1. 進入「APIs & Services → Credentials」。
2. 點「Create credentials → API key」。
3. 複製產生的 key，暫時放在安全的密碼管理工具。
4. 立刻點「Edit API key／編輯 API 金鑰」，不要先以無限制狀態公開使用。

#### 5. 限制可使用的網站

在 API key 編輯頁的「Application restrictions」：

1. 選擇「Websites／HTTP referrers」。
2. 正式 GitHub Pages 加入：

   ```text
   https://eyeyesight.github.io/*
   ```

3. 若要在本機測試，再加入：

   ```text
   http://localhost:8000/*
   http://127.0.0.1:8000/*
   ```

4. 不要加入 `*` 或 `*.*` 這類允許所有網站的規則。

#### 6. 限制可呼叫的 API

同一頁的「API restrictions」：

1. 選「Restrict key」。
2. 只勾選：
   - `Places API (New)`
   - `Geocoding API`
3. 點「Save」。設定可能需要幾分鐘才完全生效。

Google 建議同時設定 Website restriction 和 API restriction，才能降低 key 被盜用與超額費用的風險。瀏覽器跨來源請求有時只帶 origin 而沒有完整 path，因此不要只設定 `/GoogleMaps_RouteOptimization_PX/*`；應保留 `https://eyeyesight.github.io/*` 並從正式部署頁實測。[Google Maps API key 安全指引](https://developers.google.com/maps/api-security-best-practices)

#### 7. 設定 quota 與預算通知

1. 進入「Google Maps Platform → Quotas」。
2. 分別選擇 Places API (New) 與 Geocoding API。
3. 對可編輯的每日或每分鐘 quota 設定保守上限。本專案每次最多處理 30 店、每月通常少於 20 次，可先從每日 `100` 次開始；若該 API 只有每分鐘 quota，就選擇足以完成一次 30 店解析的最低值。
4. 再進入「Billing → Budgets & alerts → Create budget」。
5. Scope 只選本專案，設定小額月預算及 `50%`、`80%`、`100%` 通知。
6. 再次注意：一般 budget alert 只通知；API quota 才會在到達限制時拒絕後續請求。[Google Maps quota 管理](https://developers.google.com/maps/documentation/geocoding/usage-and-billing) · [建立 budget alert](https://docs.cloud.google.com/billing/docs/how-to/budgets)

#### 8. 在本工具驗證 Google key

1. 開啟本工具並切換到「店點建檔」。
2. 把 Google key 貼到 `Google Maps API Key`。
3. 店名輸入 `南港旗艦`，點「解析店點」。
4. 能看到 Google 候選、完整地址與經緯度即代表成功。
5. 驗證後不要把 key 保存在文字檔或提交到 Git。

### B. 取得 HERE API key

> **先確認方案：** HERE 技術文件顯示 Waypoints Sequence 可處理 202 點並支援 `scooter`，但目前方案頁把「計算目的地順序或路線」歸類為 Optimization，並列為 Limited／Base Plans 的排除用途。以下流程可用來建立 key 與做技術驗證；正式使用前，請把「台灣、30 店＋固定起終點、scooter、每月約 20 次」提供給 HERE，取得可用方案或書面 entitlement。不要因 key 建立成功或測試回傳 200 就假定免費方案允許正式使用。[HERE 方案限制](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases)

#### 1. 建立 HERE 帳戶

1. 開啟 [HERE Platform](https://platform.here.com/)。
2. 註冊或登入 HERE 帳戶。
3. 若公司已有 Organization，請管理員邀請帳戶；否則依註冊精靈建立／取得 Organization。
4. 確認右上角目前選到正確的 Organization。

#### 2. 建立 Project 並連結服務

1. 從 Launcher 開啟「Projects Manager」。
2. 點「Create new project」。
3. 名稱可填 `GoogleMaps Route Optimization`。
4. Project ID 需為 Organization 內唯一的 4–16 字元，建立後不能更改，例如 `gm-route-opt`。
5. 儲存後進入該 Project 的「Resources → Services → Link a service」。
6. 尋找 Waypoints Sequence／Waypoints Sequencing 相關服務並點「Link」。
7. 如果服務沒有出現在清單，代表目前 Organization 很可能沒有 entitlement；請停止正式部署並聯絡 HERE 確認方案，不要只繼續建立 key。[HERE Project 與連結服務](https://docs.here.com/identity-and-access-management/docs/manage-projects)

#### 3. 建立 App

1. 從 HERE Platform 左上角 Launcher 開啟「Access Manager」。
2. 切換到「Apps」頁籤。
3. 點「Register new app」。
4. 名稱可填 `GoogleMaps Route Optimization`。
5. 把上一步建立的 Project 設為 default project。
6. 若畫面提供「Allow access only in this project」，請啟用。
7. 點「Register」。HERE 會建立一個唯一 App ID。[HERE 建立 App 官方說明](https://docs.here.com/identity-and-access-management/docs/manage-apps)

#### 4. 建立 API key

1. 進入剛建立的 App。
2. 打開「Credentials」頁籤。
3. 選擇「API Keys」。
4. 點「Create API key」。
5. 複製產生的 key；每個 App 最多可有兩把 key，第二把可用於日後輪替。[HERE API key 官方說明](https://docs.here.com/identity-and-access-management/docs/plat-using-apikeys)

#### 5. 設定 Trusted Domains

HERE API key 預設可被任何網站使用，必須另外開啟 Trusted Domains：

1. 在同一個 App 進入「Trusted domains」頁籤。
2. 加入正式站台：

   ```text
   https://eyeyesight.github.io
   ```

3. 本機測試時再加入：

   ```text
   http://localhost:8000
   http://127.0.0.1:8000
   ```

4. 將「Enable trusted domains」切換成開啟。
5. 儲存後最長可能需要約 30 分鐘才生效。HERE 網頁目前最多可加入 20 個 Trusted Domains。[HERE Trusted Domains 官方說明](https://docs.here.com/identity-and-access-management/docs/plat-using-apikeys)

#### 6. 在本工具驗證 HERE key

1. 在「路線最佳化」把 key 貼到 `HERE API Key`。
2. Google key 欄位可先留空，但上傳的 CSV 必須已有緯度與經度。
3. 上傳「店點建檔」產生的 `stores_enriched.csv`，點「產生路線」。
4. Log 顯示 `HERE scooter（機車）排序完成` 或 `HERE car（汽車）排序完成`，並產生 Google Maps 分段連結，即代表成功。
5. 測試成功只表示技術權限生效；正式使用仍要完成前述 Optimization entitlement 確認。

### C. 常見錯誤排查

| 畫面／Log 訊息 | 最常見原因 | 處理方式 |
|---|---|---|
| `API key not valid` | key 複製不完整或貼錯欄位 | 確認 Google 與 HERE key 沒有互換、前後沒有空白 |
| Places `PERMISSION_DENIED`／`REQUEST_DENIED` | 未啟用 Places API (New)、Billing 未連結或 API restriction 漏選 | 回 Google Cloud 確認三項設定，等待幾分鐘再試 |
| Geocoding `REQUEST_DENIED` | Geocoding API 未啟用或 referrer 不允許目前網址 | 啟用 API，並把目前完整網域加入 Website restrictions |
| HERE `Unauthorized` | HERE key 無效、服務未連結或 entitlement 尚未生效 | 核對 Project、Services、App default project 與帳戶方案 |
| HERE 無法載入或排序失敗 | Trusted Domains 沒有目前網域，或剛修改尚未同步 | 加入正確 protocol、domain、port，最多等待 30 分鐘 |
| 本機成功、GitHub Pages 失敗 | restrictions 只加入 localhost | 加入 Google 的 `https://eyeyesight.github.io/*` 與 HERE 的 `https://eyeyesight.github.io` |

若 key 曾出現在公開 commit、issue、截圖或聊天紀錄，不要只刪除文字；應到供應商控制台建立新 key、替換後刪除舊 key。

## 使用方式

### 直接產生路線

1. 在「路線最佳化」貼入 HERE key；若 CSV 沒有座標，再貼 Google key。
2. 輸入起終點，支援地址或 `緯度,經度`。畫面預設為全家便利商店新店統寶店：`24.9732927,121.5492187`。
3. 選擇交通工具，上傳 CSV，按「產生路線」。單次最多處理 200 間。
4. 逐段開啟 Google Maps，或下載 `route.txt` 傳到手機。

### 在手機登記跑店進度

1. 切換到「跑店登記」，開啟電腦產生的 `route.txt`。
2. 首頁卡片只顯示「是否到店／是否換牌」；點進店點明細後才可修改，降低手機滑動時的誤觸。
3. 每次修改會立即寫入該裝置的 `localStorage`；關閉分頁或瀏覽器後，再次開啟仍會恢復同一份 `ROUTE_ID` 的進度。
4. 右上角選單可重新載入檔案、匯出含 `VISITED`／`POSTER_CHANGED` 的結果，或只重設本次路線的紀錄。

新版 `route.txt` 是可讀文字格式，包含 `ROUTE_ID`、建立時間、分段 Google Maps URL，以及每間店的名稱、地址與座標。舊版 `routes.txt` 仍可匯入，但因缺少地址與座標，店點明細會以店名開啟 Google Maps 搜尋。

機車每一段使用 `travelmode=two-wheeler`，汽車使用 `travelmode=driving`；工具預設每段 8 間店，可依實際開啟平台調低。Google 官方文件指出 mobile browser 最多支援 3 個中繼點、其他平台最多 9 個，因此若手機沒有完整帶入停靠點，請把「每段停靠點」調低至 3。

### 只用店名建立標準 CSV

1. 切換到「店點建檔」。
2. 貼上 Google key，再把店名逐行輸入，最多 200 間。
3. 每間店從最多 3 個 Google Places 候選中選定正確門市，並用「確認位置」開啟地圖核對。
4. 全部成功後下載 `stores_enriched.csv`，再回到「路線最佳化」使用。

## CSV 格式

原始資料可有或沒有標題列：

| 索引 | 欄位 | 必要 | 說明 |
|---:|---|---|---|
| `0` | 店名 | 是 | 例如 `南港旗艦` |
| `1` | 區域 | 否 | 例如 `台北市` |
| `2` | 完整地址 | 是 | 例如 `台北市士林區天母西路3號B1` |
| `3` | 緯度 | 否 | 建檔工具會輸出 |
| `4` | 經度 | 否 | 建檔工具會輸出 |

有第 3、4 欄時會直接使用座標，避免每次重新定位。支援 UTF-8、Big5／CP950 等常見編碼。

## 免費額度適配

- HERE 的技術配額頁列出 Limited Plan 每日 1,000 requests、Waypoints Sequencing 1 RPS；但同頁把 Optimization 列為 Limited／Base Plans 排除用途，因此這些數字不能視為本案免費正式使用的授權。上線前必須取得 HERE entitlement／方案確認。
- Google Places Text Search Pro 目前每月免費使用上限為 5,000；30 店 × 20 次約 600 次。
- 供應商價格與額度可能調整，上線前仍應在 HERE 與 Google Cloud 控制台設定 quota／預算警示。

## 本機開發與檢查

```bash
python -m http.server 8000
```

開啟 <http://localhost:8000>。基本檢查：

```bash
node --check app.js
git diff --check
```

## 安全與使用限制

- 這是純前端小量內部工具。API key 會出現在瀏覽器送出的請求中，必須限制網域與 API。
- HERE 排序與 Google Maps 輸出會使用同一類交通模式，但由兩個供應商各自重畫路線，預估時間與實際道路仍可能不同。
- 純前端版本以 JSONP／GET 呼叫 HERE；接近 200 間的大型請求若遇 URL 長度限制，正式部署需改為後端 POST。
- 出發前仍需在 Google Maps 核對禁行機車、施工、臨時交通與山區道路狀況。
- 不要把 API key、下載的門市資料或個資提交到公開 repo。
