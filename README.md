# 跑店路線最佳化（全聯）

這是一個純前端的小工具，用來把全聯店點 CSV 轉成可開啟的 Google Maps 分段路線，方便跑店前先整理路線連結與 `routes.txt`。

目前版本的定位是：**少量店點的人工輔助工具**。它會呼叫 Google Maps / Places / Routes API 協助定位與排序，但不保證是全域最快路線；如果店點很多或實際騎乘路況複雜，建議把輸出結果當作初稿，再由使用者人工檢查與調整。

## 線上使用

GitHub Pages：

<https://eyeyesight.github.io/GoogleMaps_RouteOptimization_PX/>

## 適合用途

- 將全聯店點 CSV 轉成 Google Maps 路線連結。
- 快速產生分段路線，方便手機逐段開啟。
- 匯出 `routes.txt`，保留每段路線與店名清單。
- 用於少量店點的跑店前整理。

## 不適合用途

- 不適合直接視為「最快機車路線」。
- 不適合大量店點的全域最佳化。
- 不適合取代人工判斷，例如跨河、山路、單行道、禁行機車、臨時交通狀況。
- 不適合在未限制 API key 的情況下公開使用。

## 功能概要

目前工具會：

1. 讀取 CSV 店點資料。
2. 依店名與地址欄位解析店點。
3. 透過 Places Text Search / Geocoding 取得座標。
4. 移除過近的重複點。
5. 使用 Routes API 最佳化中繼點順序。
6. 將結果拆成多段 Google Maps URL。
7. 產生可下載的 `routes.txt`。

## API 需求

需要一組 Google Maps Platform API key，並啟用：

- Routes API
- Places API
- Geocoding API

建議務必設定：

- HTTP referrer 限制
- API 限制
- 用量 / 預算警示

> 注意：這是純前端工具，API key 會在瀏覽器端使用。請不要使用未限制的正式 key。

## CSV 格式

工具預設：

| 欄位 | 預設索引 | 說明 |
|---|---:|---|
| 店名 | `0` | 例如門市名稱 |
| 地址 | `2` | 例如完整地址 |

CSV 沒有標題列也可以使用。若你的 CSV 欄位不同，可以在畫面中調整「店名欄位」與「地址欄位」索引。

如果來源是 Excel，請先另存為 CSV。

## 使用方式

1. 開啟網站。
2. 貼上受限的 Google Maps API key。
3. 填入起點與終點。
   - 若空白，會使用畫面提示中的預設地點。
4. 設定：
   - 店點上限
   - 每段停靠點
   - 交通工具
   - 是否避開高速公路 / 收費路段
5. 上傳 CSV。
6. 點選「產生路線」。
7. 在輸出頁開啟各段 Google Maps 路線，或下載 `routes.txt`。

## 重要限制

### 店點數量限制

目前版本主要適合少量店點。Routes API 對中繼點數有上限，因此工具不適合直接處理大量店點並期待全域最佳結果。

若需要處理大量店點，建議：

- 先人工分區。
- 每區個別產生路線。
- 再由使用者人工檢查順序。

### 機車路線限制

工具提供機車模式與避開高速公路 / 收費路段設定，但實際路線仍取決於 Google Maps / Routes API 對當地機車路線的支援。

建議將輸出視為：

> 偏機車使用情境的路線初稿，而不是保證最快的機車導航。

### 分段路線限制

Google Maps URL / 手機 app 對單一路線可接受的停靠點數有限。工具會依「每段停靠點」設定拆成多段，建議維持保守數量，例如 6–8 個停靠點。

## 本機開發

這是純前端專案，目前不需要 build step。

```bash
python -m http.server 8000
```

然後開啟：

```text
http://localhost:8000
```

基本檢查：

```bash
node --check app.js
python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
HTMLParser().feed(Path('index.html').read_text(encoding='utf-8'))
print('html parse ok')
PY
git --no-pager diff --check -- index.html styles.css app.js README.md
```

## 檔案結構

```text
.
├── index.html       # 頁面結構
├── styles.css       # 視覺樣式
├── app.js           # CSV、API、路線產生邏輯
└── csv_example.png  # CSV 範例截圖
```

## 安全提醒

- 不要把 API key commit 到 repo。
- 不要在公開 repo 中寫死 API key。
- 使用前請限制 key 的來源網域與可用 API。

## 後續人工處理建議

若輸出路線看起來不合理，建議人工處理：

1. 依地理區域先把 CSV 分組。
2. 分組後個別產生路線。
3. 在 Google Maps 中人工調整明顯不合理的跳點。
4. 實際出發前依交通狀況再次確認。
