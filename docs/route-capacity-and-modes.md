# 路線容量與交通模式官方文件查核

> 查核日期：2026-08-24。本文只引用 HERE 與 Google 的第一方官方文件，範圍限定為本專案使用的 HERE Waypoints Sequence API v8（`https://wps.hereapi.com/v8/findsequence2`）與 Google Maps URLs；不把 Google Routes API 的 request limits 混入 Maps URLs 的限制。

## 結論先行

- HERE Waypoints Sequence API v8 單次最多接受 **202 個 waypoints，包含 `start` 與 `end`**；官方 overview 以另一種方式表述為最多 **200 個 destinations**。因此，本專案若固定提供 1 個起點與 1 個終點，名目上最多可送 **200 間店**（`202 - 2 = 200`）。這個 200 店結論是依兩份官方文件及本案固定起終點條件所作的算術推論。（查核日期：2026-08-24；來源：[HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[HERE API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview)、[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)）
- `findsequence2` 明列支援 `car` 與 `scooter`；完整清單為 `car`、`truck`、`bicycle`、`scooter`、`taxi`、`bus`、`pedestrian`。endpoint-specific reference 目前只把 `bicycle`、`bus`、`taxi` 標為 beta／功能有限，沒有把 `car` 或 `scooter` 列入該註記。（查核日期：2026-08-24；來源：[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)）
- Google Maps Directions URLs 的 `travelmode` 官方值包含 `driving` 與 `two-wheeler`；其中 `two-wheeler` 指摩托車等機動二輪車，會在可用地區使用偏好的二輪車道路。台灣（`TW`）目前列在官方 two-wheeler 支援地區。（查核日期：2026-08-24；來源：[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action)、[Google two-wheeler coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled)）
- Google Maps URLs 的 `waypoints` 是介於 `origin` 與 `destination` 之間的中繼點：**行動版瀏覽器最多 3 個，其他平台最多 9 個**。Google 另註明部分 Maps 產品不支援 waypoints，屆時參數可能被忽略；每個 URL 還有 **2,048 字元**上限。（查核日期：2026-08-24；來源：[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）
- 所以「HERE 單次排序 200 店」不代表「Google Maps 單一 URL 可放 200 店」。HERE 負責全域排序，Google Maps URLs 仍須按開啟平台的中繼點上限分段；若要對行動版瀏覽器保守相容，應以每段最多 3 個 `waypoints` 設計。（查核日期：2026-08-24；依據：[HERE waypoint 上限](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[Google Maps URL waypoint 上限](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）

## 一、HERE Waypoints Sequence API v8

### 1. 單次容量

| 項目 | 官方限制／判讀 | 查核日期 | 官方來源 |
| --- | --- | --- | --- |
| endpoint | `GET https://wps.hereapi.com/v8/findsequence2` 用來計算 waypoint 的最佳拜訪順序。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| waypoint 總數 | 每次請求最多 202 個，包含 `start` 與 `end`。 | 2026-08-24 | [HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| destinations | 官方 overview 說明最多可最佳化 200 個 destinations。 | 2026-08-24 | [HERE API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview) |
| 本專案的店數上限 | 固定 `start` 與 `end` 各占一個 waypoint，因此最多剩 200 個 `destinationN` 店點。這是 `202 - 2` 的專案層推論。 | 2026-08-24 | [HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[HERE API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview) |
| 同一路段限制 | 最多 50 個 waypoints 可被指派到同一 road segment；遇到此限制時，官方建議評估 topology-segment clustering。 | 2026-08-24 | [`destination0...destinationN` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| 大型 payload | 官方建議大型 payload 使用 POST，因 GET 可能先碰到 load balancer 的 request-line 長度限制。故 202 是資料模型上限，不等於任何 GET URL 都保證能送滿 202 點。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |

`findsequence` 的中繼 waypoints 全部是 mandatory，服務不會自行略過某些店點；這與本專案「每間店恰好保留一次」的要求相符。（查核日期：2026-08-24；來源：[HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)）

### 2. 交通模式

`mode` 的格式是 `Type;TransportMode;TrafficMode;RouteFeatures`。`findsequence2` 官方列出的 transport modes 如下。（查核日期：2026-08-24；來源：[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)）

| HERE mode | endpoint 狀態 | 與本專案的關係 | 查核日期 | 官方來源 |
| --- | --- | --- | --- | --- |
| `scooter` | 支援，endpoint reference 未標為 beta | 機車排序可繼續使用 `fastest;scooter;...`。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| `car` | 支援，endpoint reference 未標為 beta | 可保留汽車排序選項，使用 `fastest;car;...`。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| `truck` | 支援 | 非目前最低需求。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| `pedestrian` | 支援 | 非目前最低需求；官方另限制 pedestrian waypoints 間距不得超過 5 km。 | 2026-08-24 | [HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |
| `bicycle`、`taxi`、`bus` | 支援，但 endpoint reference 目前標為 beta／功能有限 | 不應因出現在清單就視為與 `car`、`scooter` 同等成熟。 | 2026-08-24 | [`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget) |

HERE 的 Routing v8 說明把 `scooter` 定義為從低功率電動／燃油 scooter 到 motorcycle 的機動二輪車，使用允許摩托車通行的道路；預設偏向市區低功率車輛、限速 60 km/h 且避開高速公路，並不支援專用 scooter lanes。（查核日期：2026-08-24；來源：[HERE Scooter routing](https://docs.here.com/routing/docs/routing-v8-scooter-routing)）

## 二、Google Maps URLs

### 1. `driving` 與 `two-wheeler`

Google Maps Directions URL 使用 `https://www.google.com/maps/dir/?api=1`。`travelmode` 是 optional；本案若要固定交通模式，不應省略它。（查核日期：2026-08-24；來源：[Google Maps URLs — Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）

| 使用情境 | Maps URL 參數 | 官方含義 | 查核日期 | 官方來源 |
| --- | --- | --- | --- | --- |
| 汽車 | `travelmode=driving` | 官方接受的 directions travel mode。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| 機動二輪車 | `travelmode=two-wheeler` | 供摩托車等機動二輪車使用；在可用地區採偏好的二輪車道路。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| 台灣可用性 | `TW` | 台灣目前在 two-wheeler routes 支援清單中。 | 2026-08-24 | [Google two-wheeler coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled) |

官方也提醒，two-wheeler 連結只在支援二輪車的國家／地區運作；此外 navigation 並非所有 Google Maps 產品或所有目的地都可用，必要時 `dir_action=navigate` 可能只開啟 route preview 或被忽略。（查核日期：2026-08-24；來源：[Google Maps URLs — Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）

### 2. waypoint 與 URL 限制

| 項目 | 官方限制 | 對本專案的含義 | 查核日期 | 官方來源 |
| --- | --- | --- | --- | --- |
| 行動版瀏覽器 | 最多 3 個 `waypoints` | 加上 `origin` 與 `destination`，單一 URL 最多描述 5 個 route locations；5 是依官方中繼點上限所作的算術推論。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| 其他平台 | 最多 9 個 `waypoints` | 加上 `origin` 與 `destination`，單一 URL 最多描述 11 個 route locations；11 是依官方中繼點上限所作的算術推論。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| waypoint 順序 | 依 URL 中列出的順序顯示 | HERE 回傳順序可依序寫入各分段 URL；Maps URL 文件未提供自動重排這些 waypoints 的選項。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| 產品差異 | 部分 Google Maps 產品不支援 waypoints，可能忽略該參數 | 不能只做桌面瀏覽器測試；應在實際手機與預定開啟方式驗證。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#directions-action) |
| URL 長度 | 每個 URL 最多 2,048 字元 | 即使未達 3／9 個 waypoint，也可能因地址或 Place ID 過長而先碰到字元限制；座標通常較容易控制長度。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#constructing-valid-urls) |
| API key | Maps URLs 不需要 Google API key | 這只適用於「開啟 Maps URL」；不代表本案其他 Places／Geocoding 呼叫也不需要 key。 | 2026-08-24 | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#introduction) |

Google 官方把 `waypoints` 定義為 `origin` 與 `destination` 之間的 intermediary places；因此「每段停靠點」若用來設定 UI，必須明確說它計算的是中繼點、店點，還是包含起終點的 route locations，否則數字 3、5、9、11 很容易被混用。（查核日期：2026-08-24；來源：[Google Maps URLs — Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）

## 三、對本專案規格的工程判讀

以下是由上述官方限制推導的整合結論，不是供應商逐字提供的產品承諾：

1. **可把業務硬上限設計到 200 間店，但必須標示為 HERE 的名目上限。** 固定起點、200 店、固定終點合計正好 202 waypoints。（查核日期：2026-08-24；依據：[HERE Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)、[HERE API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview)）
2. **200 店上線前仍需驗證傳輸方式。** 官方明示大型 GET 可能受 request-line 長度限制，且單一 road segment 最多 50 waypoints；若維持 GET／JSONP，不能只靠 `202` 這個規格數字宣稱 200 店必然成功。應以實際 payload 做壓力測試，或評估官方建議的 POST 架構。（查核日期：2026-08-24；依據：[`/v8/findsequence2` reference](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)）
3. **汽車模式有完整的供應商參數路徑。** 建議的對應是機車 `HERE scooter → Google two-wheeler`、汽車 `HERE car → Google driving`；兩端官方文件都明列這些 mode。（查核日期：2026-08-24；依據：[HERE endpoint modes](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)、[Google Maps URL modes](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）
4. **Google Maps 輸出必須與 HERE 排序容量分開設計。** 200 店可以先由 HERE 排出完整順序，但不能塞進一條 Maps URL；若要覆蓋「連結落到手機瀏覽器」的情境，分段基準應採最多 3 個中繼 waypoints，9 個只適用於官方所稱的其他平台上限。（查核日期：2026-08-24；依據：[Google Maps URL waypoint limits](https://developers.google.com/maps/documentation/urls/get-started#directions-action)）
5. **分段仍需做 URL 長度與實機驗證。** 2,048 字元和「部分產品忽略 waypoints」是獨立限制，不能因中繼點數低於 3／9 就視為必然成功。（查核日期：2026-08-24；依據：[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)）

## 官方來源索引

- [HERE Waypoints Sequence API v8 — Key concepts](https://docs.here.com/routing/docs/key-concepts-waypoints-sequence)（查核日期：2026-08-24）
- [HERE Waypoints Sequence API v8 — API Overview](https://docs.here.com/routing/reference/waypoints-sequence-api-overview)（查核日期：2026-08-24）
- [HERE Waypoints Sequence API v8 — `/v8/findsequence2`](https://docs.here.com/routing/reference/waypoints-sequence-api-findsequenceget)（查核日期：2026-08-24）
- [HERE Routing API v8 — Scooter routing](https://docs.here.com/routing/docs/routing-v8-scooter-routing)（查核日期：2026-08-24）
- [Google Maps URLs — Get Started / Directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)（查核日期：2026-08-24；官方頁面標示最後更新 2026-08-19 UTC）
- [Google Maps Platform — Countries and regions supported for two-wheeled vehicles](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled)（查核日期：2026-08-24；官方頁面標示最後更新 2026-08-19 UTC）
