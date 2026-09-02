# API Key 設定

本工具使用兩把不同的 API Key：
- **Google Maps API Key** 負責把店名與地址轉成可用的門市資料及座標。
- **HERE API Key** 負責依機車或汽車路網安排拜訪順序。

目前「路線最佳化」畫面需要填入兩把 Key，「跑店登記」則只需要匯入 `route.txt`，不需要 API Key。

**Google 流程**：建立專案 → 啟用 Billing → 啟用 API → 建立 Key → 限制 Key → 回到本工具測試

**HERE 流程**：建立 Project → 連結 Waypoints Sequence → 建立 App → 建立 Key → 設定 Trusted Domains → 回到本工具測試

> 介面名稱可能因帳戶方案、權限或平台更新而略有不同。若找不到本文列出的選單，請使用英文名稱搜尋，或查看文末的官方文件。

## Google Maps API Key

### 1. 建立 Google Cloud 專案

Google Cloud 專案是這把 Key 與相關費用設定所在的工作空間。

1. 登入 [Google Cloud Console](https://console.cloud.google.com/)。
2. 點頁首的專案選擇器。
3. 點 **New Project／Create Project**。
4. 在 **Project name** 輸入名稱，例如 `GoogleMaps-RouteOptimization`。
5. 若畫面要求選擇 **Organization／Location**，依你的帳戶或公司設定選擇。
6. 點 **Create**，完成後切換到剛建立的專案。

### 2. 啟用 Billing

Billing 是 Google Cloud 的付款帳戶。Google Maps Platform 即使使用免費額度，也必須先把專案連結到有效的 Billing account。

1. 在 Google Cloud Console 進入 **Billing → My projects**。
2. 找到剛建立的專案。
3. 如果狀態顯示 **Billing is disabled**，在該列點 **Actions → Change billing**。
4. 選擇有效的 Billing account，點 **Set account**。
5. 如果還沒有 Billing account，先依畫面建立帳戶並加入付款資料，再回來連結專案。
6. 回到 **My projects**，確認專案的 Billing 已啟用。

> 注意：啟用 Billing 不代表一定會產生費用，但使用量超過免費額度時可能收費。完成 Key 設定後，建議再設定 Quota 與預算通知。

### 3. 啟用 Places API (New) 與 Geocoding API

本工具只需要這兩個 Google API：Places API (New) 搜尋門市，Geocoding API 解析地址。

1. 確認頁首目前選到正確的專案。
2. 進入 **APIs & Services → Library**；部分介面會顯示為 **Google Maps Platform → Maps API Library**。
3. 搜尋 **Places API (New)**，進入後點 **Enable**。
4. 如果看到 **Manage** 而不是 **Enable**，代表這個 API 已經啟用，可以直接進下一步。
5. 回到 Library，搜尋 **Geocoding API**，進入後點 **Enable**。
6. 到 **APIs & Services → Enabled APIs & services**，確認兩個 API 都在清單中。

> 注意：請選 **Places API (New)**，不要只啟用名稱相近的舊版 **Places API**。

### 4. 建立 API Key

1. 進入 **APIs & Services → Credentials**。
2. 點 **Create credentials → API key**。
3. 複製產生的 Key，先放在安全的密碼管理工具。
4. 關閉建立完成的彈窗。
5. 從 Credentials 清單點進剛建立的 Key，準備設定限制。

不要把 Key 寫入 `app.js`、README、公開 Issue、截圖或版本庫。

### 5. 限制 API Key

這一步包含兩種限制：允許哪些網站使用，以及允許呼叫哪些 API。兩種都要設定。

#### 限制可使用的網站

1. 在 Key 的編輯頁找到 **Application restrictions**。
2. 選 **Websites／HTTP referrers**。
3. 加入正式網站：

   ```text
   https://eyeyesight.github.io
   ```

4. 如果需要本機測試，再分別加入：

   ```text
   http://localhost:8000
   http://127.0.0.1:8000
   ```

5. 不要使用 `*` 或 `*.*` 允許所有網站。
6. 不要只加入 `/GoogleMaps_RouteOptimization_PX/*` 這類專案路徑；瀏覽器請求不一定會帶完整路徑。請保留實際的網站來源，並從正式網址測試。

#### 限制可呼叫的 API

1. 找到 **API restrictions**。
2. 選 **Restrict key**。
3. 只勾選：

   - **Places API (New)**
   - **Geocoding API**

4. 點 **Save**。

設定可能需要幾分鐘才完全生效。儲存後請回到正式網站測試，不要只在 localhost 驗證。

> 安全建議：網站來源限制可以降低公開網頁 Key 被濫用的風險，但不會讓 Key 變成祕密。若未來改成多人使用的正式服務，可再評估由後端代為呼叫 Google API。

### 6. 回到本工具測試

先測試 Places API (New)：

1. 開啟[線上工具](https://eyeyesight.github.io/GoogleMaps_RouteOptimization_PX/)。
2. 切換到「店點建檔」。
3. 把 Google Key 貼到 **Google Maps API Key**。
4. 輸入一間可以核對的門市名稱，點「解析店點」。
5. 如果畫面顯示候選名稱、完整地址、經緯度與 Google Maps 連結，代表 Places API (New) 已設定成功。

Geocoding API 是定位的備援：Places 找不到起點、終點或店點時，工具才會接著呼叫它。畫面不會另外標示最後由哪一個 Google API 找到位置，因此請先在 **Enabled APIs & services** 確認 Geocoding API 已啟用；等下面完成 HERE Key 後，再用地址形式的起終點產生一份小型路線，確認整體定位流程能完成。

遇到 `PERMISSION_DENIED`、`REQUEST_DENIED` 或本機可用但正式網站不可用時，請查看[完整錯誤排除](troubleshooting.md)。

### 建議：設定 Quota 與預算通知

Quota 是 API 可接受的請求上限；Budget 是費用通知。這兩項不影響第一次建立 Key，但建議在正式使用前完成。

#### 設定 Quota

1. 進入 **IAM & Admin → Quotas & System Limits**，確認選到正確專案。
2. 用 **Service** 篩選 **Places API (New)** 與 **Geocoding API**。
3. 勾選要限制的項目，點 **Edit Quotas**。
4. 依實際尖峰使用量設定每分鐘或每日上限，並保留足以完成一次跑店建檔的空間。
5. 如果看不到編輯按鈕，請請專案管理者確認你是否有調整 Quota 的權限。

也可以從 **APIs & Services → Enabled APIs & services → 選擇 API → Quotas & System Limits** 進入同一類設定。

#### 設定預算通知

1. 進入 **Billing → Budgets & alerts**。
2. 點 **Create budget**。
3. 在 **Scope** 只選本專案；需要時再限定 Google Maps Platform 相關服務。
4. 設定每月預算金額。
5. 設定通知門檻與收件者，例如 50%、90%、100%。
6. 點 **Finish**，回到清單確認預算已建立。

> 重要：Budget alert 只會通知，**不會自動停止 API，也不是費用上限**。真正要限制請求量，仍需設定 Quota；若要自動停用服務，必須另外建立自動化流程。

## HERE API Key

### 1. 建立或確認 HERE 帳戶

HERE 的 Organization 可以先理解為帳戶所在的工作空間；Project、App 與 Key 都會建立在這個工作空間裡。

1. 開啟 [HERE Get Started](https://www.here.com/get-started)。
2. 依畫面註冊或登入 HERE 帳戶。
3. 如果公司已經有 HERE Organization，請管理者邀請你的帳戶加入。
4. 登入後，確認右上角目前選到要使用的 Organization。
5. 如果註冊後沒有可用的 Organization 或無法建立 Project，請聯絡 HERE，不要先假設目前帳戶已能使用 Waypoints Sequence。

### 2. 建立 Project

Project 是 HERE 中用來集中管理服務、App 與使用量的專案空間。

1. 登入 [HERE Platform](https://platform.here.com/)。
2. 從左上角 **Launcher** 開啟 **Projects Manager**。
3. 點 **Create new project**。
4. 在 **Name** 輸入名稱，例如 `GoogleMaps Route Optimization`。
5. 輸入 4–16 個字元、在目前 Organization 內不重複的 **Project ID**，例如 `gm-route-opt`。
6. 視需要填寫 Description。
7. 點 **Save**。

> 注意：Project ID 建立後不能更改，送出前請再確認一次。

### 3. 連結 Waypoints Sequence 服務

1. 開啟剛建立的 Project。
2. 進入 **Resources → Services**。
3. 點 **Link a service**。
4. 找到 **HERE Waypoints Sequence API v8** 或 **Waypoints Sequencing**。
5. 點 **Link**。

如果清單中找不到這項服務，請先停止設定並聯絡 HERE。這通常表示目前 Organization 的方案尚未提供這項服務；單純建立 API Key 無法補上服務權限。

### 4. 建立 App

App 是 API Key 所屬的應用程式身分。

1. 從 **Launcher** 開啟 **Access Manager**。
2. 切換到 **Apps**。
3. 點 **Register new app**。
4. 輸入 App 名稱，例如 `GoogleMaps Route Optimization`。
5. 把剛建立的 Project 設為 **default project**。
6. 如果畫面提供 **Allow access only in this project**，建議開啟。
7. 點 **Register**。

### 5. 建立 API Key

1. 進入剛建立的 App。
2. 開啟 **Credentials**。
3. 選 **API Keys**。
4. 點 **Create API key**。
5. 複製產生的 Key，存入安全的密碼管理工具。

> 安全建議：每個獨立應用各自使用 App 與 Key，不要跨專案共用。HERE 每個 App 最多可建立兩把 Key，第二把可留給日後輪替。

### 6. 設定 Trusted Domains

Trusted Domains 是允許哪些網站使用這把 HERE Key 的清單。

1. 在同一個 App 開啟 **Trusted domains**。
2. 加入正式網站：

   ```text
   https://eyeyesight.github.io
   ```

3. 如果需要本機測試，再分別加入：

   ```text
   http://localhost:8000
   http://127.0.0.1:8000
   ```

4. 把 **Enable trusted domains** 切換為開啟。
5. 點 Save，確認網域仍顯示在清單中。

> 注意：Trusted Domains 最長可能需要約 30 分鐘才生效。網址開頭的 `http`／`https` 與連接埠（例如 `8000`）都會影響比對；本機網址使用不同連接埠時，要把實際網址另外加入。

### 7. 回到本工具測試

1. 先在「店點建檔」準備一份至少 2 間店、含地址與座標的標準 CSV。
2. 切換到「路線最佳化」。
3. 填入 Google Key、HERE Key、起點與終點。
4. 上傳一份只含少量店點的標準 CSV。
5. 點「產生路線」。
6. 如果 Log 顯示 `HERE scooter（機車）排序完成` 或 `HERE car（汽車）排序完成`，並產生分段 Google Maps 連結，代表 HERE 的技術設定成功。

如果剛設定 Trusted Domains，請先等待再重試。遇到 Unauthorized、無法載入或排序逾時時，請查看[完整錯誤排除](troubleshooting.md)。

> 容量說明：Waypoints Sequence 單次最多接受 202 個 waypoints，這個數字包含固定起點與終點。本工具因此最多安排 200 間店。

### 正式使用前：確認方案是否允許 Optimization

> **「API 能成功呼叫」代表技術設定正確；「方案允許正式使用 Optimization」是另一件事。**

HERE 把「計算目的地順序或路線」歸類為 Optimization。Limited／Base Plans 的排除用途包含 Optimization，因此正式使用前必須向 HERE 確認你的方案是否允許這項用途，也就是確認正式服務權限（entitlement）。

聯絡 HERE 時，建議一次提供：

- 使用地區：台灣。
- 使用者：單一外勤人員。
- 規模：每次最多 200 間店，另有固定起點與終點。
- 交通模式：`scooter`／`car`。
- 預估每日請求量。
- 使用方式：公開瀏覽器前端。

請取得可用方案或書面確認後，再把技術測試成功視為可正式使用。

### 建議：查看用量與設定警示

1. 在 HERE Platform 點右上角個人圖示。
2. 進入 **Billing & Usage** 查看用量。
3. 如果帳戶提供 Usage alerts，可依 Project 或 App 設定警示。

HERE 路線服務的用量最長可能約兩小時才出現在報表中。不要只靠立即重新整理判斷請求是否有被記錄。

2026-08-22 查核時，未提供付款資料的 Limited Plan 列出所有服務合計每日 1,000 次請求，Waypoints Sequencing 每秒 1 次請求。實際可用量仍以你的 Billing & Usage、方案與 HERE 回覆為準；這些技術配額也不代表方案已允許正式 Optimization 用途。

## 設定完成檢查

### Google

- [ ] 專案已連結有效的 Billing account。
- [ ] Places API (New) 與 Geocoding API 都已啟用。
- [ ] Key 已限制可用網站，且只允許 Places API (New) 與 Geocoding API。
- [ ] 在「店點建檔」能看到門市候選、地址與座標。

### HERE

- [ ] Project 已連結 Waypoints Sequence，並已建立 App 與 API Key。
- [ ] Trusted Domains 已啟用，且正式網站已加入清單。
- [ ] 小型路線測試能完成 HERE 排序並產生 Google Maps 連結。
- [ ] 正式使用前，已向 HERE 確認方案允許 Optimization。

### 費用與安全

- [ ] Google Quota 與 Budget alerts 已依需要設定，且已理解 Budget alert 不會自動停止花費。
- [ ] Key 沒有寫入原始碼、公開文件、Issue 或版本庫。

## 官方文件

本文的 API 與方案資訊最後查核於 **2026-08-22**。控制台介面與方案內容可能更新；若本文介面名稱不同，請以以下官方文件為準。

### Google

- 專案與入門：[Google Maps Platform getting started](https://developers.google.com/maps/get-started)
- Billing：[建立 Billing account](https://docs.cloud.google.com/billing/docs/how-to/account-management-overview) · [啟用或變更 Billing](https://docs.cloud.google.com/billing/docs/how-to/modify-project) · [確認 Billing 狀態](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled)
- Places：[Places API (New) 設定](https://developers.google.com/maps/documentation/places/web-service/get-api-key) · [Places API 遷移說明](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-overview)
- Geocoding：[Geocoding API 設定](https://developers.google.com/maps/documentation/geocoding/start) · [用量與 Billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)
- Key 安全：[Google Maps Platform API security best practices](https://developers.google.com/maps/api-security-best-practices)
- Quota：[查看與管理 Quota](https://docs.cloud.google.com/docs/quotas/view-manage) · [限制 API 用量](https://docs.cloud.google.com/apis/docs/capping-api-usage)
- Budget：[建立 Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)

### HERE

- 帳戶與開始使用：[HERE Get Started](https://www.here.com/get-started) · [管理帳戶與 Organization](https://docs.here.com/identity-and-access-management/docs/manage-your-individual-or-organization-platform-account) · [Cost Management 入門](https://docs.here.com/usage/docs/get-started)
- Project 與 App：[管理 Projects](https://docs.here.com/identity-and-access-management/docs/manage-projects) · [管理 Apps](https://docs.here.com/identity-and-access-management/docs/manage-apps)
- API Key 與 Trusted Domains：[HERE API Key 說明](https://docs.here.com/identity-and-access-management/docs/plat-using-apikeys)
- Waypoints Sequence：[開始使用](https://docs.here.com/routing/docs/get-started-waypoints-sequence) · [API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview) · [Endpoint reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)
- 用量與限制：[Usage service](https://docs.here.com/usage/docs/cost-management-usage-service) · [Usage alerts](https://docs.here.com/usage/docs/cost-management-dev-guide-readme) · [Limits and quotas](https://docs.here.com/policies/docs/limits-and-quotas)
- 方案與 Optimization 限制：[HERE 請求頻率與排除用途](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases)
