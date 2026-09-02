# 完整錯誤排除

本文件對應目前三個工作區：「店點建檔」、「路線最佳化」與「跑店登記」。先從畫面上的處理紀錄確認失敗階段，再依下列項目排查。

## 一、按鈕無法使用

### 「解析店點」不能按

請確認：

1. 已在「店點建檔」貼上 Google Maps API Key。
2. 至少輸入一間店，每行一間。
3. 店名沒有超過 200 行。

### 「產生路線」不能按

目前畫面會在下列五項都完成後才啟用按鈕：

1. Google Maps API Key。
2. HERE API Key。
3. 起點。
4. 終點。
5. 標準 CSV。

## 二、Google 店點解析或定位失敗

| 訊息或現象 | 常見原因 | 處理方式 |
|---|---|---|
| `API key not valid` | Key 複製不完整或貼錯欄位 | 重新複製，移除前後空白，確認沒有把 HERE Key 貼到 Google 欄位 |
| Places `PERMISSION_DENIED`／`REQUEST_DENIED` | Billing 未啟用、未啟用 Places API (New)，或 API restriction 漏選 | 在同一 Google Cloud 專案確認 Billing、Places API (New) 及 Key 限制 |
| Geocoding `REQUEST_DENIED` | 未啟用 Geocoding API，或目前網站不在允許來源 | 啟用 Geocoding API，並把目前網站加入 Websites／HTTP referrers |
| 本機可用、GitHub Pages 不可用 | Key 只允許 localhost | 加入正式網站來源 `https://eyeyesight.github.io/*` |
| 找不到門市或候選錯誤 | 店名太簡略、同名門市，或 Google 資料不同 | 補充區域／店名，從最多 3 個候選中核對完整地址與地圖 |

Google 設定變更可能需要幾分鐘生效。若只有部分店點定位失敗，路線工具會停止，不會略過失敗門市；請回到「店點建檔」修正後重新下載 CSV。

## 三、CSV 無法讀取

路線工具要求固定欄位位置：

| 索引 | 欄位 | 必要 |
|---:|---|---|
| 0 | 店名 | 是 |
| 1 | 區域 | 否 |
| 2 | 完整地址 | 是 |
| 3 | 緯度 | 否 |
| 4 | 經度 | 否 |

常見處理方式：

1. 優先使用「店點建檔」下載的 `stores.csv`。
2. 從 Excel 匯出時選擇 CSV UTF-8；程式也會嘗試 Big5／CP950 等常見編碼。
3. 確認店名與完整地址不是空白，且沒有把地址放到錯誤欄位。
4. 至少需要 2 間有效店點，最多讀取 200 間。

## 四、HERE 排序失敗

| 訊息或現象 | 常見原因 | 處理方式 |
|---|---|---|
| Unauthorized | Key 無效、服務未連結，或方案沒有權限 | 核對 Organization、Project、App、Waypoints Sequence 服務與 entitlement |
| 回應無法載入 | Trusted Domains 沒有目前網站，或設定尚未生效 | 加入正確 protocol、domain 與 port；HERE 表示變更最長可能需約 30 分鐘 |
| 排序超過 120 秒 | 網路中斷、服務延遲或請求過大 | 稍後重試；先用少量店點驗證 Key 與服務 |
| 店點順序不完整 | HERE 回傳店數缺漏、重複或索引異常 | 不要使用該結果；保留 Log，重新送出或向 HERE 查詢 |
| 超過 100 間時大型請求失敗 | 純前端 GET URL 過長，可能被瀏覽器或網路設備拒絕 | 分批處理，或由開發者改用後端 POST |

技術上可建立 Key 或收到成功回應，不等於目前方案已授權 Optimization 用途。正式使用前仍須向 HERE 確認 entitlement，詳見 [API Key 設定與官方資料](api-key-setup-research.md)。

## 五、Google Maps 路線缺少停靠點

Google Maps URL 在行動版瀏覽器通常最多接受 3 個中繼點，其他平台最多 9 個。若手機開啟後沒有完整帶入門市：

1. 回到「路線最佳化」。
2. 把「每段停靠點」從預設 8 降到 3。
3. 重新產生並下載 `route.txt`。

HERE 排序與 Google Maps 導航由不同服務完成；Google Maps 仍可能依當下道路重新繪製該段路線。

## 六、`route.txt` 無法匯入

1. 確認檔案不是空白，且不超過 5 MB。
2. 優先使用目前結果頁下載的 `route.txt`。
3. 新格式必須包含 `PX ROUTE FILE` 與至少一間 `[STORE n]`。
4. 舊版 `routes.txt` 仍可匯入，但必須包含 `route1: https://...` 之類的分段行與其後店名。
5. 舊格式沒有地址與座標時，單店地圖會以店名搜尋。

## 七、跑店進度沒有恢復

進度依 `ROUTE_ID` 保存於匯入當下的瀏覽器 `localStorage`。它不會同步到其他手機、瀏覽器或網域。

請確認：

1. 使用同一裝置、同一瀏覽器與同一網站網址。
2. 沒有使用無痕模式，也沒有清除該網站資料。
3. 沒有從選單執行「載入其他 route.txt」；此操作會清除目前保存的跑店路線與進度。
4. 「重設跑店進度」只會把到店及換牌狀態歸零，仍會保留路線。

換裝置或清除資料前，先用「匯出跑店紀錄」下載 `route-result-<ROUTE_ID>.txt`。匯出的結果可再次匯入，並帶回當時的狀態。

## 八、Key 外洩或費用異常

- Key 若出現在公開 commit、Issue、截圖或聊天紀錄，請到供應商控制台建立新 Key、替換後停用舊 Key；只刪除文字不足以消除風險。
- Google Key 應同時設定網站來源與 API 限制，並設定 quota 和 Billing 通知。Budget 通知不會自動停止費用。
- HERE Key 應設定 Trusted Domains，並在 Billing & Usage 核對請求。
- 不要把 API Key、含門市資料的 CSV、`route.txt` 或跑店結果提交到公開版本庫。
