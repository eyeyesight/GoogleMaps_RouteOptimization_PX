# 32 點跑店路線最佳化替代方案

研究日期：2026-08-22  
適用情境：30 間店，加固定起點與終點，共 32 個點；目前是 GitHub Pages 上的純前端 HTML/CSS/JavaScript，預設交通工具為機車，最佳化後仍要輸出可開啟的 Google Maps 分段 URL。

> **2026-08-22 實作決策：** 進一步核對後，本案先以更精簡的 **HERE Waypoints Sequence API v8** 實作技術 PoC，取代下文初評的 HERE Tour Planning。它直接解固定起終點的單一路徑點序問題，包含起終點最多 202 點且支援 `scooter`。但 HERE 目前方案頁同時把 Optimization 列為 Limited／Base Plans 排除用途，所以正式採用前必須取得 HERE entitlement／方案書面確認，不能把每日 1,000 requests 的技術配額直接視為免費正式授權。下文保留為替代方案背景；最終規格以 [`final-requirements.md`](final-requirements.md) 為準。[Waypoints Sequence concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence) · [API reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) · [HERE pricing and limits](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases)

## 結論先行

目前的瓶頸是 Google Routes API `ComputeRoutes` 的 waypoint optimization 上限，不是 32 點本身已超出一般 TSP/VRP 求解器能力。Google 目前公布的標準 `ComputeRoutes` 上限是 **25 個 intermediate waypoints**，不是「含起終點共 25 點」；因此現有介面寫死 23 間店其實可以放寬到 25 間，但 30 間店仍超限。[Routes API usage limits](https://developers.google.com/maps/documentation/routes/usage-and-billing)

針對本專案預設的「台灣機車跑店」需求，推薦順序如下：

1. **HERE Tour Planning API：優先做實際資料 PoC。** 同步請求可處理 250 tasks，原生支援 `scooter`，Tour Planning 官方標示除中國以外全球可用，因此涵蓋台灣。可先延續目前「使用者貼 API key」的純前端方式驗證，再決定是否加後端；正式環境仍建議以後端 OAuth 或至少 Trusted Domains 保護憑證。[HERE problem limits](https://docs.here.com/tour-planning/docs/problem) · [country support](https://docs.here.com/tour-planning/docs/country-support) · [scooter routing](https://docs.here.com/routing/docs/routing-v8-scooter-routing)
2. **VROOM + Valhalla：若願意維運後端，最佳的開源選擇。** VROOM 負責 TSP/VRP，Valhalla 以 OpenStreetMap 路網提供 `motor_scooter` / `motorcycle` 成本；Valhalla 預設設定允許 50 locations、2,500 matrix pairs，32 點的 1,024 pairs 在範圍內。軟體免授權費，但要自行部署、更新台灣圖資、監控與保護端點。[VROOM official repository](https://github.com/VROOM-Project/vroom) · [Valhalla costing models](https://github.com/valhalla/valhalla-docs/blob/master/turn-by-turn/api-reference.md) · [Valhalla default limits](https://github.com/valhalla/valhalla/blob/master/scripts/valhalla_build_config)
3. **Google Compute Route Matrix + OR-Tools：若「Google 的台灣機車路網成本」最重要。** 先把 32×32 matrix 分成至少兩個請求，再由後端 OR-Tools 排序。技術上最貼近既有 Google 結果，也支援台灣 `TWO_WHEELER`；缺點是兩輪 matrix 屬 Enterprise SKU，完整 1,024 elements 在免費額度用完後，以目前牌價估算約 **US$15.36／次**，尚未含 geocoding 等費用。[matrix limits](https://developers.google.com/maps/documentation/routes/usage-and-billing) · [two-wheeler coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled) · [SKU triggers](https://developers.google.com/maps/billing-and-pricing/sku-details) · [pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
4. **Google Route Optimization API：僅在可以改用汽車模式時優先。** 它可輕鬆涵蓋 30 間店，單車單一車輛模型也很合適，且目前 30 shipments 在免費額度後約 **US$0.30／次**；但原生 `TravelMode` 只有 `DRIVING` 與 `WALKING`，沒有機車或自行車。[official TravelMode enum](https://developers.google.com/maps/documentation/route-optimization/reference/rpc/google.maps.routeoptimization.v1) · [billing](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing)
5. **Mapbox Optimization v2：保留為汽車／單車／步行的商用備選。** 上限 1,000 locations，但仍是 Beta／需取得 v2 access，且沒有 scooter/motorcycle profile，不適合作為目前機車預設模式的第一選擇。[Optimization v2](https://docs.mapbox.com/api/navigation/optimization/)

若短期只要解除 30 間店限制、又不能新增後端，可先在瀏覽器用 Haversine 距離搭配 nearest-neighbor + 2-opt 產生「地理距離近似順序」，再保留現有 Google Maps 分段輸出。這沒有外部最佳化 API 成本，32 點也很小，但它不理解道路方向、河川、橋梁、禁行與機車道路限制，只適合作為過渡或 fallback，不應標示為真正的最短行車路線。

## 共同前提：最佳化與 Google Maps URL 輸出是兩個獨立問題

所有候選方案都能回傳「點的順序」；本專案只要把順序重新映射回原有店名／座標，就能繼續用現有 `buildMapsUrl()` 拆段。因此，HERE、Mapbox、OR-Tools 或 VROOM 的結果都能輸出 Google Maps URL，無須改成供應商自己的導航 App。

不過，Google Maps 會依自己的路網重新計算每一段；如果最佳順序來自 HERE、Mapbox 或 OSM，Google Maps 顯示的實際時間與路徑不會和最佳化器的成本矩陣完全一致。這是可接受的資料源差異，但應在 UI 告知使用者，並以台灣真實門市資料做 route-quality PoC。

另外，Google Maps URLs 官方限制為每個 URL 最長 2,048 字元；waypoints 在行動版瀏覽器最多 3 個，其他平台最多 9 個。Maps URL 本身不需 API key。[Maps URLs documentation](https://developers.google.com/maps/documentation/urls/get-started) 因此目前預設每段 8 個停靠點不是跨平台保證值：若要保證手機瀏覽器可開，應降到 3；若主要由已安裝的 Google Maps App 開啟，可保留可調整值並做實機測試。這個分段限制與 32 點最佳化上限互不相干。

## 方案比較

| 方案 | 32 點 | 點數／請求限制 | 機車／單車 | 台灣 | 成本與認證 | 後端與瀏覽器安全 | Google Maps 分段 URL |
|---|---:|---|---|---|---|---|---|
| 標準 Routes `optimizeWaypointOrder` | 否 | 25 intermediate waypoints | `DRIVE`、`TWO_WHEELER`、`BICYCLE`、`WALK`；兩輪為 Beta | Google 官方列 TW 支援兩輪 | API key/OAuth；最佳化與兩輪會觸發較高 SKU | 現況可從瀏覽器呼叫，但 Google 對 web-service key 建議 proxy | 完全相容；現有做法 |
| Routes Preferred waypoint optimization | 是，條件式 | 98 個純 lat/lng；若任何 place ID 則 25；25+ 時總直線距離 <1,000 km | 25+ 只允許 `DRIVE` | driving 可用；不是機車解法 | Experimental/Pre-GA，需聯絡 Support 取得 access | 建議後端；不是一般公開 GA 依賴 | 完全相容 |
| Route Optimization API | 是 | 公開 usage limits 未列硬性 shipment 上限；官方 timeout 表明列 33–100、101–1,000 乃至 10,001+ | 原生只有 `DRIVING`、`WALKING` | Google Maps 路網；但無機車 | 一台車按 shipment 計價；API key 或 OAuth，REST 方法另要求 IAM permission | **應有後端**；不要在前端放 service-account/OAuth secret | 相容，只取 visits 順序 |
| Compute Route Matrix + OR-Tools | 是 | matrix 一般 625 elements/request；32×32=1,024，至少 2 requests；`TRAFFIC_AWARE_OPTIMAL` 時上限 100/request | Matrix 支援 `TWO_WHEELER`、`BICYCLE`、`WALK`；OR-Tools 不關心交通模式，只吃 matrix | Google 官方列 TW 支援兩輪 | Matrix 按 element 計費；OR-Tools Apache-2.0 免費 | **應有後端**；OR-Tools 官方只有 C++/Python/Java/C#，無官方 browser JS package | 相容，只取 solver 的 index order |
| HERE Tour Planning v3 | 是 | 同步 250 tasks；非同步 6,000 tasks | `car`、`truck`、`scooter`、`bicycle`、`pedestrian` 等 | 官方：除中國外 worldwide；scooter 依可行駛機車道路 | 需向 HERE 確認 Optimization entitlement；API key 或 OAuth 2.0 | PoC 可純前端 API key；正式建議 OAuth 後端或 Trusted Domains | 相容，只取 activities 順序 |
| Mapbox Optimization v2 | 是 | 1,000 locations | `driving`、`driving-traffic`、`cycling`、`walking`；**無機車** | 全球資料但台灣品質需 PoC | 商用、按 request；token；v2 為 Beta/access-gated | public token 可用 URL restrictions；非同步 job API 正式環境仍建議後端 | 相容，只取 stops 順序 |
| VROOM + Valhalla 自架 | 是 | VROOM 無固定 SaaS 點數方案；Valhalla 預設 motor-scooter 50 locations / 2,500 matrix pairs | Valhalla 有 `motor_scooter`、Beta `motorcycle`、bicycle、walk、auto | Valhalla 使用 OSM 全球圖資；台灣品質需以實際門市驗證 | VROOM BSD-2-Clause、Valhalla MIT；另有主機與維運成本，OSM 資料為 ODbL | **必須後端／自架服務**；公開端點應另加認證與限流 | 相容，只取 VROOM route steps 順序 |

### CORS、API key 與純前端可行性

- **Google Routes web services：** 目前專案的瀏覽器 `fetch` 路徑可沿用來做 PoC，但 CORS 能傳送請求不等於 key 安全。Google 對沒有 client SDK 的 browser web-service call 建議使用 secure proxy，且明示 web-service key 原則上應是伺服器與 Google 之間的 shared secret。[Google Maps API security guidance](https://developers.google.com/maps/api-security-best-practices)
- **Google Route Optimization：** `OptimizeTours` 涉及 Cloud OAuth scope 與 IAM permission；service-account/OAuth secret 不得放入不可信任 client，因此視為必須後端。[OptimizeTours authorization](https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours) · [OAuth client warning](https://developers.google.com/maps/api-security-best-practices)
- **HERE Tour Planning：** 官方 browser demo 可直接貼 API key 並送出新問題，所以 CORS/瀏覽器 PoC 有官方實例；API key 要加 Trusted Domains。OAuth 需要 access-key secret，應放後端。[browser demo](https://docs.here.com/tour-planning/docs/demo-tool) · [Trusted Domains](https://docs.here.com/identity-and-access-management/docs/plat-using-apikeys) · [OAuth credentials](https://docs.here.com/tour-planning/docs/quick-start)
- **Mapbox Optimization v2：** Mapbox public token 是 client-side credential，也能設 URL restrictions；但 v2 access 仍受帳戶權限控制，Optimization v2 文件沒有對此專案承諾特定瀏覽器/CORS 組合。應先以受限 public token 做實際 POST/poll PoC，正式環境則以後端隔離非同步 job metadata。[token management](https://docs.mapbox.com/accounts/guides/tokens/) · [Optimization v2](https://docs.mapbox.com/api/navigation/optimization/)
- **OR-Tools／VROOM／Valhalla：** 這些是本地 library 或自架服務，不存在供應商替本專案配置的 browser CORS。應由自己的後端暴露最小化、已認證且限流的 `/optimize` endpoint；不要把 VROOM/Valhalla 原始管理介面直接公開。

## 各方案詳述

### 1. Google Route Optimization API

`OptimizeTours` 是 Google 的正式 VRP 服務，可最佳化一或多輛車、shipments、時間窗、容量、休息與起終點。官方 timeout 建議表直接涵蓋 33–100、101–1,000、1,001–10,000 與 10,001+ shipments/vehicles 的級距，因此 30 間店不是其規模問題；公開 usage limits 頁面只列 60 QPM，沒有列 shipment 數硬上限。[timeouts](https://developers.google.com/maps/documentation/route-optimization/timeouts) · [usage limits](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing)

單一跑店人員可建模為一台 vehicle，每一間店是一個只含 delivery/visit 的 shipment，固定 `startWaypoint` 與 `endWaypoint`。回應中的 route `visits` 會提供執行順序；也可要求 route/transition polylines。[base structure](https://developers.google.com/maps/documentation/route-optimization/concepts/base-structure) · [response interpretation](https://developers.google.com/maps/documentation/route-optimization/interpret-response)

主要阻礙是交通模式。Route Optimization `TravelMode` 官方 enum 目前只有 `DRIVING` 與 Beta `WALKING`，沒有 `TWO_WHEELER` 或 `BICYCLE`。[TravelMode reference](https://developers.google.com/maps/documentation/route-optimization/reference/rpc/google.maps.routeoptimization.v1) API 雖可接受自訂 duration/distance matrix，但若要用 Google `TWO_WHEELER` 建完整 matrix，成本與分批問題仍會回到下一方案。[custom DurationDistanceMatrix reference](https://developers.google.com/maps/documentation/route-optimization/reference/rpc/google.maps.routeoptimization.v1)

費用以 shipments 計。單一 vehicle 觸發 Single Vehicle Routing SKU；目前每月 free usage cap 為 5,000 shipments，之後第一級為 US$10／1,000 shipments。30 間店等於每次約 30 units，所以免費額度約 166 次完整跑店，額度用完後約 US$0.30／次，未含 geocoding/Places。[SKU definition](https://developers.google.com/maps/billing-and-pricing/sku-details) · [current global pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

認證可用 API key 或 OAuth，但 REST `projects.optimizeTours` 文件列出 Cloud Platform OAuth scope 與 `routeoptimization.locations.use` IAM permission。正式環境應由後端呼叫；Google 明確警告不得在不可信任的 client 暴露 service-account keys，並建議 browser web-service calls 經安全 proxy。[OptimizeTours authorization](https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours) · [Google Maps API security guidance](https://developers.google.com/maps/api-security-best-practices)

**判斷：** 若業務允許把機車模式視為汽車近似值，這是最省開發與最低 API 成本的正式解；若機車道路合法性與避開高速公路是硬需求，不應直接採用。

### 2. Routes API 組合：Compute Route Matrix + 自有最佳化器

`ComputeRouteMatrix` 會回傳多 origin × 多 destination 的時間／距離，可把路網計算和點序求解拆開。一般非 transit、非 `TRAFFIC_AWARE_OPTIMAL` request 最多 625 elements；完整 32×32 matrix 是 1,024 elements，可用 16 origins × 32 destinations 分成兩次 512-element request。若使用 `TRAFFIC_AWARE_OPTIMAL`，每次上限降為 100 elements。[Compute Route Matrix limits](https://developers.google.com/maps/documentation/routes/compute_route_matrix) 官方 OR-Tools 範例也示範因 matrix element 上限而分批組裝完整矩陣。[OR-Tools VRP matrix example](https://developers.google.com/optimization/routing/vrp)

Routes API 支援 `DRIVE`、`BICYCLE`、`WALK`、`TWO_WHEELER` 等模式；Google 的兩輪車涵蓋表明列台灣 `TW`，但兩輪、單車與步行仍標示 Beta，UI 必須顯示相應警告。[RouteTravelMode](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode) · [two-wheeler coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled)

最佳化器有三種可替換實作：

- **OR-Tools 後端：** 正式支援 C++、Python、Java、C#；提供 TSP/VRP、時間窗、容量等 routing solver，Apache License 2.0。Routing 問題通常是計算困難問題，官方也明示不保證每次得到數學上的 optimal solution，可用 search time limit 控制品質與延遲。[install/supported languages](https://developers.google.com/optimization/install/) · [TSP caveat](https://developers.google.com/optimization/routing/tsp) · [routing options](https://developers.google.com/optimization/routing/routing_options) · [license](https://github.com/google/or-tools)
- **VROOM 後端：** 可直接吃自訂 cost matrix，適合未來增加多車、時間窗或容量；BSD-2-Clause。[VROOM repository](https://github.com/VROOM-Project/vroom)
- **瀏覽器內 2-opt heuristic：** 不引入 server solver；可用完整 matrix 或 Haversine。這是本專案最小改動，但需自行測試收斂、timeout 與 fallback，也沒有 OR-Tools/VROOM 的複雜 constraint 能力。

Google Matrix 按回傳 element 計費。以 1,024 elements 計算，目前 traffic-unaware 汽車 Essentials 是 US$5／1,000、一般 traffic-aware Pro 是 US$10／1,000、兩輪 Enterprise 是 US$15／1,000；各自每月免費額度為 10,000、5,000、1,000 elements。免費額度用完後，一次完整 matrix 約為 US$5.12、US$10.24、US$15.36。[SKU feature triggers](https://developers.google.com/maps/billing-and-pricing/sku-details) · [current prices](https://developers.google.com/maps/billing-and-pricing/pricing) 兩輪 1,024-element matrix 每月第一個完整矩陣也會略超過 1,000 free cap。

**判斷：** 這是維持 Google 台灣機車路網品質的最可靠架構，但成本遠高於 Route Optimization 的 driving 模式。建議後端快取同一次求解過程中的 matrix，設定每日 quota；Google Maps Platform 內容的保存與再利用仍須遵守當期服務條款。

### 3. Routes Preferred 的 98 waypoint 實驗功能

Google 的 Routes Preferred waypoint optimization 是 Experimental/Pre-GA，需要聯絡 Support 提供預估 QPM 與 waypoint 數後取得 access。它可接受最多 98 個純 latitude/longitude intermediate waypoints；只要請求中有任何 place ID，上限即為 25。當 intermediate waypoints 達 25 個以上，累積直線距離需低於 1,000 km，且交通模式必須是 `DRIVE`。[Routes Preferred waypoint optimization](https://developers.google.com/maps/documentation/routes_preferred/waypoint_optimization_proxy_api)

**判斷：** 若全部店點已 geocode 為座標、實際改用汽車模式，而且可接受 Pre-GA 與申請 access，這是最接近現有程式碼的短期橋接方案；它不是機車解法，也不宜成為沒有 fallback 的核心依賴。

### 4. HERE Tour Planning API

HERE Tour Planning v3 同步 endpoint 目前最多 250 tasks，非同步最多 6,000 tasks；30 間店遠低於限制。它支援 TSP/VRP、固定起終點、時間窗、capacity、skills、交通資料等。[problem limits and profiles](https://docs.here.com/tour-planning/docs/problem) · [sync endpoint](https://docs.here.com/tour-planning/reference/post_problems)

Routing profile 原生包含 `scooter`、`bicycle`、`pedestrian`、`car`、`truck` 等。HERE 將 scooter 定義為從低功率電動／燃油速克達到 motorcycle 的兩輪車，會使用允許 motorcycle 的道路；預設 speed cap 60 km/h 且避開高速公路，也能另行調整。[Tour Planning profiles](https://docs.here.com/tour-planning/docs/problem) · [scooter behavior](https://docs.here.com/routing/docs/routing-v8-scooter-routing) Tour Planning 官方說服務全球可用、僅排除中國；台灣亦有 HERE premium house-number/street-level geocoding coverage。[Tour Planning country support](https://docs.here.com/tour-planning/docs/country-support) · [HERE Taiwan geocoding coverage](https://docs.here.com/geocoding-and-search/docs/geocode-local-coverage)

HERE 的技術文件提供 Tour Planning API，但現行方案頁把 Optimization 列為 Limited／Base Plans 排除用途；確切 entitlement、費率與商用條件必須以 HERE 的書面確認或企業合約為準。[HERE pricing and excluded use cases](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases) 認證主方法是短效 OAuth 2.0 bearer token，也支援 API key；官方 browser demo 可以在 session 中貼 API key 並直接提交新問題，證明可做純前端 PoC。[authentication](https://docs.here.com/tour-planning/docs/quick-start) · [browser demo](https://docs.here.com/tour-planning/docs/demo-tool) API key 預設可被任何網站使用，應設定 Trusted Domains；若使用 OAuth client secret，則必須留在後端安全儲存。[API key trusted domains](https://docs.here.com/identity-and-access-management/docs/plat-using-apikeys) · [OAuth credential handling](https://docs.here.com/tour-planning/docs/quick-start)

**判斷：** 這是目前最符合「30 店、台灣、機車、想先維持純前端」的商用候選。PoC 應用同一批 30 店，和 Google Maps 實際導航比較順序、總時間、禁行道路及高速公路行為，再決定是否採購與加後端。

### 5. VROOM + Valhalla 自架

VROOM 是 C++20 的開源 VRP engine，支援 TSP、CVRP、VRPTW、pickup/delivery 等，原生可搭配 OSRM、OpenRouteService、Valhalla，或使用任意來源的 custom cost matrix；授權為 BSD-2-Clause。[VROOM official repository](https://github.com/VROOM-Project/vroom) 官方另提供 `vroom-express` HTTP wrapper 與 Docker setup，說明它本質上是 server-side 服務。[vroom-express](https://github.com/VROOM-Project/vroom-express) · [vroom-docker](https://github.com/VROOM-Project/vroom-docker)

Valhalla 是使用 OpenStreetMap 的開源 routing engine，MIT 授權，提供 `motor_scooter` 與 Beta `motorcycle` costing；預設 config 對這兩種模式為 50 route locations、2,500 matrix location pairs，因此 32 點／1,024 pairs 可直接處理。[Valhalla repository](https://github.com/valhalla/valhalla) · [costing reference](https://github.com/valhalla/valhalla-docs/blob/master/turn-by-turn/api-reference.md) · [default config](https://github.com/valhalla/valhalla/blob/master/scripts/valhalla_build_config)

這個組合沒有 SaaS API key 與每次費用，但必須自行負擔 server、台灣 OSM extract/build/update、監控、備援、限流與資料授權標示。公開的 demo server 有 fair-use/rate limits，不適合直接當正式產品後端。[Valhalla demo-server policy](https://github.com/valhalla/valhalla)

**判斷：** 若預計工具會長期使用、未來會增加多車／時窗／容量，而且團隊能維運容器服務，這是成本可控且機車模型完整的開源路線；若只為 30 店單人跑店，基礎設施負擔可能高於商用 API。

### 6. Mapbox Optimization v2

Optimization v2 每個 routing problem 最多 1,000 locations，採 submit + poll 的非同步流程，可處理 capacity、time windows、shifts、pickup/dropoff 等；但官方頁面仍稱 Public Beta／需申請 access。[Mapbox Optimization v2](https://docs.mapbox.com/api/navigation/optimization/)

可用 routing profiles 為 `mapbox/driving`、`mapbox/driving-traffic`、`mapbox/cycling`、`mapbox/walking`，沒有 scooter/motorcycle。因此它能處理 32 點，卻不能忠實取代本專案預設機車模式。[vehicle routing profiles](https://docs.mapbox.com/api/navigation/optimization/)

Mapbox Optimization API 依 request 計費，實際 free tier／單價以 Mapbox 當期 pricing page 和取得 v2 access 後的帳戶條件為準。[Mapbox pricing guide](https://docs.mapbox.com/accounts/guides/pricing/) Mapbox public tokens 是設計給 client-side 使用，且可加 URL restrictions；secret scopes 不得放在 client。[token management](https://docs.mapbox.com/accounts/guides/tokens/) 但 v2 是可提交並列出帳戶 routing jobs 的非同步 API，正式產品仍建議經過後端，避免 token 濫用與 job metadata 暴露。

**判斷：** 適合未來改成汽車／單車、已使用 Mapbox、且願意接受 Beta 的團隊；對目前台灣機車需求，優先度低於 HERE 與 VROOM/Valhalla。

## 建議遷移路線

### 階段 A：先把最佳化器做成可替換介面

保留既有 CSV 解析、geocoding、去重與 Google Maps URL 產生，把目前 `computeOptimizedOrder(...)` 抽象為只接受／回傳 index 的 provider：

```text
optimize({ origin, destination, stops, mode, avoidHighways, avoidTolls })
  -> { orderedStopIndexes, provider, warnings, metrics }
```

這樣 HERE PoC、Haversine fallback、未來後端 OR-Tools 都不會碰 CSV 與 URL 分段邏輯。所有 provider 都必須檢查：回傳 index 數量相等、無重複、無越界、未分配 stops 顯示為明確錯誤，不能默默截短。

### 階段 B：一週期 PoC 的建議順序

1. 以真實 30 店資料建立基準：人工順序、目前前 25 店 Google 順序、總行車時間、是否經高速公路／禁行道路。
2. 實作 browser-side Haversine + 2-opt fallback，先解除 UI 的 23 店硬限制並驗證 32 點資料流與 Google Maps URL 分段。
3. 接 HERE Tour Planning synchronous endpoint，使用 `scooter`、固定 start/end、避開高速公路；保存 provider warning 與未分配任務。
4. 同批資料在 Google Maps App 實際檢視並記錄偏差。若 HERE 品質可接受，選擇正式 HERE + 後端 OAuth；若不可接受，再做 Google two-wheeler matrix + OR-Tools 的小型後端 PoC。
5. 若月使用量高到 Google matrix 成本或 HERE 合約成本不合理，再評估 VROOM + Valhalla 自架。

### 階段 C：正式化所需的非功能要求

- 最佳化 web-service 經後端 proxy；前端不持有 OAuth/service-account secret。
- 設定每使用者／每日限流、供應商 quota 與成本告警。
- 對 30 間店以 route request hash 做短期去重，避免使用者重複點擊造成重算；資料保存期限與可否快取須依供應商條款確認。
- provider timeout 時自動降級 Haversine + 2-opt，UI 明確標示「近似排序」。
- Google Maps URL 仍以 3 個 waypoints 作跨平台安全預設，或保留 6–8 並在手機 App 實測後註明平台差異。[Maps URL waypoint limits](https://developers.google.com/maps/documentation/urls/get-started)

## 最終決策規則

- **機車路網正確性第一、想最快上線：** HERE Tour Planning PoC，通過後採 HERE。
- **機車路網正確性第一、必須是 Google 資料：** Google Route Matrix + OR-Tools 後端，先接受並監控約 1,024 Enterprise elements／次的成本。
- **可改用汽車近似、重視低成本與正式 SLA：** Google Route Optimization API。
- **不能新增後端、不能新增商用供應商：** browser Haversine + 2-opt，明確降級標示；它只解點數上限，不保證道路最佳化品質。
- **重視開源、自主控制且能維運：** VROOM + Valhalla，先用台灣 30 店做 OSM 路網品質驗證。
