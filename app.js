if (typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY.trim()) {
  console.warn('請勿在前端硬碼 Google API Key！');
}

const CSV_ENCODINGS = ['utf-8', 'big5-hkscs', 'big5', 'cp950', 'utf-16le', 'utf-16be', 'iso-8859-1'];
const GEOCODE_DELAY_MS = 120;
const DEDUPE_DISTANCE_M = 50;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeTW = (text) => (text ?? '').replace(/臺/g, '台');

function log(message, className = '') {
  const line = document.createElement('div');
  line.textContent = message;
  if (className) line.classList.add(className);
  $('log').appendChild(line);
}

function clearOutput() {
  $('log').innerHTML = '';
  $('outLinks').innerHTML = '';
  $('routeLinks')?.remove();
  $('downloadAllBtn')?.remove();
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safeValue));
}

function readOptions() {
  return {
    apiKey: $('apiKey').value.trim(),
    origin: normalizeTW($('origin').value.trim()),
    destination: normalizeTW($('destination').value.trim()),
    colName: parseInt($('colName').value, 10) || 0,
    colAddr: parseInt($('colAddr').value, 10) || 2,
    maxApi: clampNumber($('maxApi').value, 1, 23, 23),
    maxUrl: clampNumber($('maxUrl').value, 1, 8, 8),
    travelMode: $('mode').value,
    avoidHighways: $('avoidHighways').checked,
    avoidTolls: $('avoidTolls').checked,
    file: $('csvFile').files[0],
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const earthRadiusM = 6371000;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlambda / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

function buildMapsUrl(origin, destination, waypoints, { mode, avoidHighways, avoidTolls }) {
  const params = new URLSearchParams();
  params.set('origin', normalizeTW(origin));
  params.set('destination', normalizeTW(destination));

  if (mode === 'TWO_WHEELER') {
    params.set('dirflg', 'm');
    params.set('travelmode', 'driving');
  } else if (mode === 'DRIVE') {
    params.set('travelmode', 'driving');
  } else if (mode === 'BICYCLE') {
    params.set('travelmode', 'bicycling');
  } else if (mode === 'WALK') {
    params.set('travelmode', 'walking');
  }

  const avoid = [];
  if (avoidHighways) avoid.push('highways');
  if (avoidTolls) avoid.push('tolls');
  if (avoid.length) params.set('avoid', avoid.join('|'));
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));

  return `https://www.google.com/maps/dir/?api=1&${params.toString()}`;
}

async function readCsvSmart(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let best = { text: null, encoding: null, bad: Infinity };

  for (const encoding of CSV_ENCODINGS) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      const bad = (text.match(/\uFFFD/g) || []).length;
      if (bad < best.bad) best = { text, encoding, bad };
      if (bad === 0 && /[\u4E00-\u9FFF]/.test(text)) break;
    } catch {}
  }

  return best.text ?? new TextDecoder('utf-8').decode(bytes);
}

function parseStoresFromCsv(text, { colName, colAddr, maxApi }) {
  const rows = Papa.parse(text, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    header: false,
  }).data;

  const stores = [];
  for (const row of rows) {
    const rawName = (row[colName] ?? '').toString().trim();
    const rawAddr = (row[colAddr] ?? '').toString().trim();
    if (!rawName || !rawAddr) continue;

    const name = rawName.startsWith('全聯福利中心') ? rawName : `全聯福利中心 ${rawName}店`;
    stores.push({ name, address: normalizeTW(rawAddr) });
    if (stores.length >= maxApi) break;
  }
  return stores;
}

async function textSearchLatLng(apiKey, query) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify({
      textQuery: `${normalizeTW(query)} 台灣`,
      regionCode: 'TW',
      maxResultCount: 1,
      languageCode: 'zh-TW',
    }),
  });
  if (!response.ok) return null;

  const places = (await response.json()).places || [];
  const location = places[0]?.location;
  return location ? `${location.latitude},${location.longitude}` : null;
}

async function geocodeLatLng(apiKey, query) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${normalizeTW(query)} , 台灣`);
  url.searchParams.set('region', 'tw');
  url.searchParams.set('language', 'zh-TW');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) return null;

  const result = (await response.json()).results?.[0];
  const location = result?.geometry?.location;
  return location ? `${location.lat},${location.lng}` : null;
}

async function robustGeocode(apiKey, name, address) {
  const normalizedName = normalizeTW(name);
  const normalizedAddress = normalizeTW(address);

  if (normalizedAddress.trim()) {
    const addressLatLng = await geocodeLatLng(apiKey, normalizedAddress);
    if (addressLatLng) return addressLatLng;
  }

  const textLatLng = await textSearchLatLng(apiKey, `${normalizedName} ${normalizedAddress}`.trim());
  if (textLatLng) return textLatLng;

  return geocodeLatLng(apiKey, `${normalizedName} , 台灣`);
}

async function geocodeStores(apiKey, stores) {
  const waypoints = [];
  for (const { name, address } of stores) {
    try {
      const latLng = await robustGeocode(apiKey, name, address);
      if (latLng) {
        waypoints.push([latLng, name]);
        log(` ✅ ${name} → ${latLng}`, 'ok');
      } else {
        log(` ⚠️ 無法定位 ${name}，已跳過。`, 'error');
      }
    } catch (error) {
      log(` ⚠️ ${name} 解析失敗：${error.message}`, 'error');
    }
    await sleep(GEOCODE_DELAY_MS);
  }
  return waypoints;
}

function dedupeClosePoints(waypoints, thresholdM = DEDUPE_DISTANCE_M) {
  const kept = [];
  for (const [latLng, name] of waypoints) {
    const [lat, lng] = latLng.split(',').map(Number);
    const tooClose = kept.some(([keptLatLng]) => {
      const [keptLat, keptLng] = keptLatLng.split(',').map(Number);
      return haversine(lat, lng, keptLat, keptLng) < thresholdM;
    });

    if (tooClose) {
      log(`⚠️ 與既有點距離 < ${thresholdM}m，視為重複：${name}`, 'error');
      continue;
    }
    kept.push([latLng, name]);
  }
  return kept;
}

async function computeOptimizedOrder(apiKey, origin, destination, waypoints, travelMode, avoidHighways, avoidTolls) {
  const body = {
    origin: { address: `${normalizeTW(origin)} , 台灣` },
    destination: { address: `${normalizeTW(destination)} , 台灣` },
    intermediates: waypoints.map(([latLng]) => {
      const [latitude, longitude] = latLng.split(',').map(Number);
      return { location: { latLng: { latitude, longitude } } };
    }),
    travelMode,
    optimizeWaypointOrder: true,
    routeModifiers: { avoidHighways, avoidTolls },
    languageCode: 'zh-TW',
  };

  if (body.intermediates.length < 2) {
    log('ℹ️ 中繼點少於 2 個，直接採用原順序。');
    return body.intermediates.map((_, index) => index);
  }

  let response = await fetchRoutes(apiKey, body);
  if (!response.ok && travelMode === 'TWO_WHEELER') {
    log('TWO_WHEELER 失敗，嘗試改用 DRIVE...', 'error');
    body.travelMode = 'DRIVE';
    response = await fetchRoutes(apiKey, body);
  }
  if (!response.ok) {
    throw new Error(`Routes API error: ${await response.text()}`);
  }

  const indexes = (await response.json()).routes?.[0]?.optimizedIntermediateWaypointIndex || [];
  if (!indexes.length) {
    log('⚠️ Routes API 未提供最佳化索引，多半是座標重疊/過近，將直接使用原順序。', 'error');
    return body.intermediates.map((_, index) => index);
  }
  if (indexes.length !== waypoints.length) {
    log(`⚠️ 回傳索引數(${indexes.length}) ≠ 中繼點數(${waypoints.length})，將對齊最小長度。`, 'error');
  }
  return indexes.slice(0, waypoints.length);
}

function fetchRoutes(apiKey, body) {
  return fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex',
    },
    body: JSON.stringify(body),
  });
}

function splitUrlsAndNames(origin, destination, sortedWaypoints, maxWaypointsPerUrl, opts) {
  const urls = [];
  const names = [];
  let start = normalizeTW(origin);

  for (let i = 0; i < sortedWaypoints.length; i += maxWaypointsPerUrl) {
    const segment = sortedWaypoints.slice(i, i + maxWaypointsPerUrl);
    const isLastSegment = i + maxWaypointsPerUrl >= sortedWaypoints.length;
    const end = isLastSegment ? normalizeTW(destination) : segment[segment.length - 1][0];
    let segmentWaypoints = (isLastSegment ? segment : segment.slice(0, -1)).map(([point]) => point);
    let segmentNames = (isLastSegment ? segment : segment.slice(0, -1)).map(([, name]) => name);

    if (segmentWaypoints[0] === start) {
      segmentWaypoints = segmentWaypoints.slice(1);
      segmentNames = segmentNames.slice(1);
    }

    urls.push(buildMapsUrl(start, end, segmentWaypoints, opts));
    names.push(segmentNames);
    start = end;
  }

  return { urls, names };
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderRouteLinks(urls, names) {
  const routesWrap = document.createElement('div');
  routesWrap.id = 'routeLinks';
  routesWrap.className = 'links';

  urls.forEach((url, index) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.textContent = `路線${index + 1}`;
    link.style.display = 'block';
    routesWrap.appendChild(link);
  });

  const combinedText = urls.map((url, index) => {
    return `route${index + 1}: ${url}\n${(names[index] || []).join('\n')}`;
  }).join('\n\n');

  const downloadButton = document.createElement('button');
  downloadButton.id = 'downloadAllBtn';
  downloadButton.className = 'secondary';
  downloadButton.style.marginTop = '12px';
  downloadButton.textContent = '下載 routes.txt';
  downloadButton.addEventListener('click', () => downloadText('routes.txt', combinedText));

  $('log').insertAdjacentElement('afterend', routesWrap);
  routesWrap.insertAdjacentElement('afterend', downloadButton);
}

async function runRouteGeneration() {
  const options = readOptions();
  if (!options.apiKey) return alert('請先貼上 API Key');
  if (!options.file) return alert('請先選擇 CSV 檔');

  clearOutput();
  log('📥 讀取 .csv ...');

  const csvText = await readCsvSmart(options.file);
  const stores = parseStoresFromCsv(csvText, options);
  log(`➡️ 讀到門市 ${stores.length} 筆（上限 ${options.maxApi}）`);
  if (!stores.length) return alert('CSV 內容為空或欄位索引設定錯誤');

  log('📡 解析地點座標（Geocoding / Places Text Search）...');
  const waypoints = await geocodeStores(options.apiKey, stores);
  if (!waypoints.length) return alert('沒有可用的中繼點（請檢查 CSV/編碼/地址格式）');

  const uniqueWaypoints = dedupeClosePoints(waypoints);
  if (uniqueWaypoints.length < 2) {
    return alert('有效中繼點不足（多數座標重疊）。請檢查 CSV 內容與地址。');
  }

  log('🧭 呼叫 Routes API 以最佳化中繼點順序 ...');
  let order;
  try {
    order = await computeOptimizedOrder(
      options.apiKey,
      options.origin,
      options.destination,
      uniqueWaypoints,
      options.travelMode,
      options.avoidHighways,
      options.avoidTolls,
    );
  } catch (error) {
    log(error.message, 'error');
    return alert('Routes API 失敗，請查看 Log');
  }

  if (!order.length) {
    log('⚠️ 仍未取得最佳化索引，改用原順序輸出。', 'error');
    order = uniqueWaypoints.map((_, index) => index);
  }

  const sortedWaypoints = order.slice(0, uniqueWaypoints.length).map((index) => uniqueWaypoints[index]);
  const { urls, names } = splitUrlsAndNames(options.origin, options.destination, sortedWaypoints, options.maxUrl, {
    mode: options.travelMode,
    avoidHighways: options.avoidHighways,
    avoidTolls: options.avoidTolls,
  });

  log(`✅ 共產生 ${urls.length} 條路線並整合為單一 routes.txt。`);
  renderRouteLinks(urls, names);
}

$('runBtn').addEventListener('click', runRouteGeneration);

(function initTheme() {
  const root = document.documentElement;
  const toggleBtn = $('themeToggle');
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');

  applyTheme(theme);
  toggleBtn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  function applyTheme(mode) {
    if (mode === 'dark') {
      root.setAttribute('data-theme', 'dark');
      toggleBtn.textContent = '淺色';
    } else {
      root.removeAttribute('data-theme');
      toggleBtn.textContent = '暗色';
    }
    localStorage.setItem('theme', mode);
  }
})();
