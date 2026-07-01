if (typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY.trim()) {
      console.warn('請勿在前端硬碼 Google API Key！');
    }

    // ---------- 工具 ---------- //
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ★ 台灣地名字形正規化：「臺」→「台」
    const normalizeTW = (s) => (s ?? '').replace(/臺/g, '台');

    function log(msg, cls = "") {
      const el = document.getElementById('log');
      const line = document.createElement('div');
      line.textContent = msg;
      if (cls) line.classList.add(cls);
      el.appendChild(line);
    }

    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const toRad = (d) => d * Math.PI / 180;
      const dphi = toRad(lat2 - lat1);
      const dlambda = toRad(lon2 - lon1);
      const a = Math.sin(dphi/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dlambda/2)**2;
      return 2 * R * Math.asin(Math.sqrt(a));
    }

    function buildMapsUrl(origin, destination, wps, { mode, avoidHighways, avoidTolls }) {
      const base = "https://www.google.com/maps/dir/?api=1";
      const params = new URLSearchParams();

      // 正規化使用者輸入的起終點
      origin = normalizeTW(origin);
      destination = normalizeTW(destination);
      
      params.set("origin", origin);
      params.set("destination", destination);

      // TWO_WHEELER → dirflg=m | others → travelmode
      if (mode === "TWO_WHEELER") {
        params.set("dirflg", "m");
        // 同時仍保留 driving 可提升相容性
        params.set("travelmode", "driving");
      } else if (mode === "DRIVE") {
        params.set("travelmode", "driving");
      } else if (mode === "BICYCLE") {
        params.set("travelmode", "bicycling");
      } else if (mode === "WALK") {
        params.set("travelmode", "walking");
      }

      // avoid
      const avoid = [];
      if (avoidHighways) avoid.push("highways");
      if (avoidTolls)    avoid.push("tolls");
      if (avoid.length) params.set("avoid", avoid.join("|"));
      if (wps && wps.length) params.set("waypoints", wps.join("|"));

      return `${base}&${params.toString()}`;
    }

    // ★ 讀 CSV：多編碼自動偵測（避免亂碼）
    async function readCsvSmart(file) {
      const buf = await file.arrayBuffer();
      const encodings = ['utf-8', 'big5-hkscs', 'big5', 'cp950', 'utf-16le', 'utf-16be', 'iso-8859-1'];
      let best = { text: null, enc: null, bad: Infinity };

      for (const enc of encodings) {
        try {
          const dec = new TextDecoder(enc, { fatal: false });
          const text = dec.decode(new Uint8Array(buf));
          const bad = (text.match(/\uFFFD/g) || []).length; // 替換字元的數量
          if (bad < best.bad) best = { text, enc, bad };
          if (bad === 0 && /[\u4E00-\u9FFF]/.test(text)) { // 無替換字元且有中文字
            best = { text, enc, bad };
            break;
          }
        } catch {}
      }
      // log(`🔤 CSV 編碼推測：${best.enc ?? '未知'}（ =${best.bad}）`);
      return best.text ?? new TextDecoder('utf-8').decode(new Uint8Array(buf));
    }

    async function textSearchLatLng(apiKey, query) {
      const url = "https://places.googleapis.com/v1/places:searchText";
      const body = {
        textQuery: `${normalizeTW(query)} 台灣`,
        regionCode: "TW",
        maxResultCount: 1,
        languageCode: "zh-TW",
      };
      const headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location"
      };
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) return null;
      const j = await r.json();
      const places = j.places || [];
      if (!places.length) return null;
      const loc = places[0].location;
      return `${loc.latitude},${loc.longitude}`;
    }

    // ★ Geocoding：加上 language 與 ", 台灣"
    async function geocodeLatLng(apiKey, query) {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set('address', `${normalizeTW(query)} , 台灣`);
      url.searchParams.set('region', 'tw');
      url.searchParams.set('language', 'zh-TW');
      url.searchParams.set('key', apiKey);
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const loc = j.results[0].geometry.location;
      return `${loc.lat},${loc.lng}`;
    }

    // ★ Robust geocode（地址 → TextSearch → 店名 geocode）
    async function robustGeocode(apiKey, name, addr) {
      const nameN = normalizeTW(name);
      const addrN = normalizeTW(addr);
      
      let addrLL = null;
      if (addrN && addrN.trim()) addrLL = await geocodeLatLng(apiKey, addrN);
      if (addrLL) return addrLL;

      const textLL = await textSearchLatLng(apiKey, `${nameN} ${addrN}`.trim());
      if (textLL) return textLL;

      const nameLL = await geocodeLatLng(apiKey, `${nameN} , 台灣`);
      if (!nameLL) return null;

      return nameLL;
    }

    // ★ 去除過近座標（避免同點）
    function dedupeClosePoints(wps, thresholdM = 50) {
      const kept = [];
      for (const [ll, nm] of wps) {
        const [lat, lng] = ll.split(',').map(Number);
        const tooClose = kept.some(([kll]) => {
          const [klat, klng] = kll.split(',').map(Number);
          return haversine(lat, lng, klat, klng) < thresholdM;
        });
        if (tooClose) {
          log(`⚠️ 與既有點距離 < ${thresholdM}m，視為重複：${nm}`, 'error');
          continue;
        }
        kept.push([ll, nm]);
      }
      return kept;
    }

    async function computeOptimizedOrder(apiKey, origin, destination, waypoints, travelMode, avoidHighways, avoidTolls) {
      const endpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
      const body = {
        origin:      { address: `${normalizeTW(origin)} , 台灣` },
        destination: { address: `${normalizeTW(destination)} , 台灣` },
        intermediates: waypoints.map(([ll]) => {
          const [lat, lng] = ll.split(',').map(Number);
          return { location: { latLng: { latitude: lat, longitude: lng } } };
        }),
        travelMode,
        optimizeWaypointOrder: true,
        routeModifiers: { avoidHighways, avoidTolls },
        languageCode: "zh-TW"
      };
      const headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex"
      };

      if (body.intermediates.length < 2) {
        log('ℹ️ 中繼點少於 2 個，直接採用原順序。');
        return body.intermediates.map((_, i) => i);
      }

      let r = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify(body) });

      // TWO_WHEELER 不支援 → fallback 到 DRIVE
      if (!r.ok && travelMode === 'TWO_WHEELER') {
        log(`TWO_WHEELER 失敗，嘗試改用 DRIVE...`, 'error');
        body.travelMode = 'DRIVE';
        r = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify(body) });
      }
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Routes API error: ${t}`);
      }
      const j = await r.json();
      const idx = j.routes?.[0]?.optimizedIntermediateWaypointIndex || [];

      if (!idx.length) {
        // 很可能是同點/過近 → 提示並回原順序
        log('⚠️ Routes API 未提供最佳化索引，多半是座標重疊/過近，將直接使用原順序。', 'error');
        return body.intermediates.map((_, i) => i);
      }
      // 防呆：長度不一致時，以兩者最小長度切齊
      if (idx.length !== waypoints.length) {
        log(`⚠️ 回傳索引數(${idx.length}) ≠ 中繼點數(${waypoints.length})，將對齊最小長度。`, 'error');
      }
      return idx.slice(0, waypoints.length);
    }

    function splitUrlsAndNames(origin, destination, wpsSorted, maxWpUrl, opts) {
      origin = normalizeTW(origin);
      destination = normalizeTW(destination);
      const urls = [], names = [];
      let start = origin; let i = 0; const n = wpsSorted.length;
      while (i < n) {
        const seg = wpsSorted.slice(i, i + maxWpUrl);
        const isLastChunk = (i + maxWpUrl >= n);
        const end = isLastChunk ? destination : seg[seg.length - 1][0];
        let segWps = (isLastChunk ? seg : seg.slice(0, -1)).map(([p]) => p);
        if (segWps.length && segWps[0] === start) {
          segWps = segWps.slice(1);
        }
        const url = buildMapsUrl(start, end, segWps, opts);
        urls.push(url);
        const segNames = (isLastChunk ? seg : seg.slice(0, -1)).map(([, nm]) => nm);
        if (segNames.length && wpsSorted[i][0] === start) {
          segNames.shift();
        }
        names.push(segNames);
        start = end;
        i += maxWpUrl;
      }
      return { urls, names };
    }

    function downloadText(filename, content) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('runBtn').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKey').value.trim();
      if (!apiKey) return alert('請先貼上 API Key');

      const origin = normalizeTW(document.getElementById('origin').value.trim());
      const destination = normalizeTW(document.getElementById('destination').value.trim());
      const colName = parseInt(document.getElementById('colName').value, 10) || 0;
      const colAddr = parseInt(document.getElementById('colAddr').value, 10) || 2;
      const maxApi = Math.max(1, Math.min(23, parseInt(document.getElementById('maxApi').value, 10) || 23));
      const maxUrl = Math.max(1, Math.min(8, parseInt(document.getElementById('maxUrl').value, 10) || 8));
      const travelMode = document.getElementById('mode').value;
      const avoidHighways = document.getElementById('avoidHighways').checked;
      const avoidTolls = document.getElementById('avoidTolls').checked;

      const file = document.getElementById('csvFile').files[0];
      if (!file) return alert('請先選擇 CSV 檔');

      document.getElementById('log').innerHTML = '';
      document.getElementById('outLinks').innerHTML = '';

      log('📥 讀取 .csv ...');
      // 多編碼解碼 + PapaParse
      const text = await readCsvSmart(file);
      const rows = Papa.parse(text, {
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        header: false
      }).data;

      const stores = [];
      for (const r of rows) {
        const nameRaw = (r[colName] ?? '').toString().trim();
        const addrRaw  = (r[colAddr] ?? '').toString().trim();
        if (!nameRaw || !addrRaw) continue;
        const name = nameRaw.startsWith('全聯福利中心') ? nameRaw : `全聯福利中心 ${nameRaw}店`;
        const addr = normalizeTW(addrRaw);
        stores.push([name, addr]);
        if (stores.length >= maxApi) break;
      }
      log(`➡️ 讀到門市 ${stores.length} 筆（上限 ${maxApi}）`);

      if (!stores.length) return alert('CSV 內容為空或欄位索引設定錯誤');

      // 逐筆取得座標（節流避免 QPS 過高）
      log('📡 解析地點座標（Geocoding / Places Text Search）...');
      const waypoints = [];
      for (let i = 0; i < stores.length; i++) {
        const [name, addr] = stores[i];
        try {
          const ll = await robustGeocode(apiKey, name, addr);
          if (ll) {
            waypoints.push([ll, name]);
            log(` ✅ ${name} → ${ll}`, 'ok');
          } else {
            log(` ⚠️ 無法定位 ${name}，已跳過。`, 'error');
          }
        } catch (e) {
          log(` ⚠️ ${name} 解析失敗：${e.message}`, 'error');
        }
        await sleep(120); // 輕微節流
      }

      if (!waypoints.length) return alert('沒有可用的中繼點（請檢查 CSV/編碼/地址格式）');

      // ★ 去重，避免同點造成最佳化空回傳
      const wpsUnique = dedupeClosePoints(waypoints, 50);
      if (wpsUnique.length < 2) {
        alert('有效中繼點不足（多數座標重疊）。請檢查 CSV 內容與地址。');
        return;
      }

      // 呼叫 Routes API
      log('🧭 呼叫 Routes API 以最佳化中繼點順序 ...');
      let order = [];
      try {
        order = await computeOptimizedOrder(apiKey, origin, destination, wpsUnique, travelMode, avoidHighways, avoidTolls);
      } catch (e) {
        log(e.message, 'error');
        return alert('Routes API 失敗，請查看 Log');
      }

      if (!order.length) {
        // 極端情況：仍為空，最後再防呆一次
        log('⚠️ 仍未取得最佳化索引，改用原順序輸出。', 'error');
        order = wpsUnique.map((_, i) => i);
      }

      // 防呆對齊
      order = order.slice(0, wpsUnique.length);
      const wpsSorted = order.map(i => wpsUnique[i]);
      const urlOpts = {
        mode: travelMode,
        avoidHighways,
        avoidTolls
      };
      const { urls, names } = splitUrlsAndNames(origin, destination, wpsSorted, maxUrl, urlOpts);

      // 建立所有 route 的超連結
      let routesWrap = document.getElementById('routeLinks');
      if (!routesWrap) {
        routesWrap = document.createElement('div');
        routesWrap.id = 'routeLinks';
        routesWrap.className = 'links';
      }
      routesWrap.innerHTML = '';
      urls.forEach((u, idx) => {
        const a = document.createElement('a');
        a.href = u; a.target = '_blank';
        a.textContent = `路線${idx+1}`;
        a.style.display = 'block';
        routesWrap.appendChild(a);
      });

      // 建立單一合併內容
      const combinedText = urls.map((u, idx) => {
        const nm = names[idx] || [];
        return `route${idx+1}: ${u}\n${nm.join('\n')}`;
      }).join('\n\n');

      // 提供單一 .txt 下載按鈕
      const btnAll = document.createElement('button');
      btnAll.id = 'downloadAllBtn';
      btnAll.className = 'secondary';
      btnAll.style.marginTop = '12px';
      btnAll.textContent = '下載 routes.txt';
      btnAll.addEventListener('click', () => downloadText('routes.txt', combinedText));
      const old = document.getElementById('downloadAllBtn');
      if (old) old.remove();

      log(`✅ 共產生 ${urls.length} 條路線並整合為單一 routes.txt。`);
      document.getElementById('log').insertAdjacentElement('afterend', routesWrap);
      routesWrap.insertAdjacentElement('afterend', btnAll);
            
    });

    // ============ 主題切換（含記憶） ============
    (function initTheme(){
      const root = document.documentElement;
      const toggleBtn = document.getElementById('themeToggle');

      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? 'dark' : 'light');
      applyTheme(theme);

      toggleBtn.addEventListener('click', () => {
        const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });

      function applyTheme(mode){
        if (mode === 'dark') {
          root.setAttribute('data-theme','dark');
          toggleBtn.textContent = '淺色';
        } else {
          root.removeAttribute('data-theme'); // default = light
          toggleBtn.textContent = '暗色';
        }
        localStorage.setItem('theme', mode);
      }
    })();
