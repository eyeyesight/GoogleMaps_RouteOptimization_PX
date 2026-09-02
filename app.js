if (typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY.trim()) {
  console.warn('請勿在前端硬碼 Google API Key！');
}

const CSV_ENCODINGS = ['utf-8', 'big5-hkscs', 'big5', 'cp950', 'utf-16le', 'utf-16be', 'iso-8859-1'];
const GEOCODE_DELAY_MS = 120;
const DEDUPE_DISTANCE_M = 50;
const STORE_NAME_COLUMN = 0;
const STORE_ADDRESS_COLUMN = 2;
const DEFAULT_STORE_LIMIT = 30;
const MAX_STORES = 200;

const TRANSPORT_MODES = {
  TWO_WHEELER: { here: 'scooter', label: '機車', icon: '🛵' },
  DRIVE: { here: 'car', label: '汽車', icon: '🚗' },
};

let resolvedStoreRows = [];
let isResolvingStoreRows = false;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeTW = (text) => (text ?? '').replace(/臺/g, '台');

function log(message, className = '') {
  const line = document.createElement('div');
  line.textContent = message;
  if (className) line.classList.add(className);
  $('log').appendChild(line);
}

function setView(view) {
  $('resultMenu')?.removeAttribute('open');
  document.body.dataset.view = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearOutput() {
  $('log').innerHTML = '';
  $('outLinks').innerHTML = '';
  $('resultSummary').textContent = '正在產出路線，請留在此頁查看處理紀錄。';
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
    hereApiKey: $('hereApiKey').value.trim(),
    origin: normalizeTW($('origin').value.trim()),
    destination: normalizeTW($('destination').value.trim()),
    maxApi: clampNumber($('maxApi').value, 1, MAX_STORES, DEFAULT_STORE_LIMIT),
    maxUrl: clampNumber($('maxUrl').value, 1, 9, 8),
    travelMode: document.querySelector('input[name="travelMode"]:checked')?.value || 'TWO_WHEELER',
    avoidHighways: document.querySelector('input[name="avoidHighways"]:checked')?.value !== 'false',
    avoidTolls: document.querySelector('input[name="avoidTolls"]:checked')?.value !== 'false',
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
    params.set('travelmode', 'two-wheeler');
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

function parseCoordinate(value) {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return `${latitude},${longitude}`;
}

function parseStoresFromCsv(text, { maxApi }) {
  const rows = Papa.parse(text, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    header: false,
  }).data;

  const stores = [];
  for (const row of rows) {
    const rawName = (row[STORE_NAME_COLUMN] ?? '').toString().trim();
    const rawAddr = (row[STORE_ADDRESS_COLUMN] ?? '').toString().trim();
    if (!rawName || !rawAddr) continue;
    if (/店名/.test(rawName) && /地址/.test(rawAddr)) continue;

    const name = rawName.startsWith('全聯福利中心') ? rawName : `全聯福利中心 ${rawName}店`;
    const latitude = row[3];
    const longitude = row[4];
    stores.push({
      name,
      address: normalizeTW(rawAddr),
      latLng: parseCoordinate(`${latitude},${longitude}`),
    });
    if (stores.length >= maxApi) break;
  }
  return stores;
}

async function searchPlaceCandidates(apiKey, query, maxResultCount = 3) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
    },
    body: JSON.stringify({
      textQuery: `${normalizeTW(query)} 台灣`,
      regionCode: 'TW',
      maxResultCount,
      languageCode: 'zh-TW',
    }),
  });
  if (!response.ok) {
    throw new Error(`Places API error: ${await response.text()}`);
  }

  return ((await response.json()).places || []).filter((place) => place.location);
}

async function textSearchLatLng(apiKey, query) {
  const places = await searchPlaceCandidates(apiKey, query, 1);
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
  let csvCoordinateCount = 0;
  let resolvedCoordinateCount = 0;
  for (const { name, address, latLng: savedLatLng } of stores) {
    try {
      const latLng = savedLatLng || await robustGeocode(apiKey, name, address);
      if (latLng) {
        waypoints.push([latLng, name, address]);
        if (savedLatLng) csvCoordinateCount += 1;
        else resolvedCoordinateCount += 1;
      } else {
        log(` ⚠️ 無法定位 ${name}，已跳過。`, 'error');
      }
    } catch (error) {
      log(` ⚠️ ${name} 解析失敗：${error.message}`, 'error');
    }
    if (!savedLatLng) await sleep(GEOCODE_DELAY_MS);
  }

  const coordinateSources = [];
  if (csvCoordinateCount) coordinateSources.push(`CSV ${csvCoordinateCount}`);
  if (resolvedCoordinateCount) coordinateSources.push(`Google ${resolvedCoordinateCount}`);
  const sourceSummary = coordinateSources.length ? `（${coordinateSources.join('、')}）` : '';
  log(`✅ 座標確認完成：${waypoints.length} 間${sourceSummary}。`, 'ok');
  return waypoints;
}

function warnClosePoints(waypoints, thresholdM = DEDUPE_DISTANCE_M) {
  const seen = [];
  for (const [latLng, name] of waypoints) {
    const [lat, lng] = latLng.split(',').map(Number);
    const nearby = seen.find(([seenLatLng]) => {
      const [seenLat, seenLng] = seenLatLng.split(',').map(Number);
      return haversine(lat, lng, seenLat, seenLng) < thresholdM;
    });

    if (nearby) {
      log(`⚠️ ${name} 與 ${nearby[1]} 距離小於 ${thresholdM}m；兩間仍會保留，請核對座標。`, 'error');
    }
    seen.push([latLng, name]);
  }
  return waypoints;
}

async function resolveLatLng(apiKey, value) {
  return parseCoordinate(value) || robustGeocode(apiKey, '', value);
}

function requestJsonp(url, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__hereSequence_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    };
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };

    window[callbackName] = (data) => finish(resolve, data);
    url.searchParams.set('jsonCallback', callbackName);
    script.src = url.toString();
    script.async = true;
    script.onerror = () => finish(reject, new Error('HERE 回應無法載入，請檢查 API key、Trusted Domains 與網路連線。'));
    script.onload = () => {
      setTimeout(() => {
        if (!settled) finish(reject, new Error('HERE 未回傳有效資料，請檢查 API key 與服務權限。'));
      }, 0);
    };
    const timeout = setTimeout(
      () => finish(reject, new Error('HERE 排序超過 120 秒，請稍後再試。')),
      timeoutMs,
    );
    document.head.appendChild(script);
  });
}

async function computeOptimizedOrder(hereApiKey, origin, destination, waypoints, options) {
  if (waypoints.length < 2) {
    log('ℹ️ 中繼點少於 2 個，直接採用原順序。');
    return waypoints.map((_, index) => index);
  }

  const url = new URL('https://wps.hereapi.com/v8/findsequence2');
  url.searchParams.set('start', `start;${origin}`);
  url.searchParams.set('end', `end;${destination}`);
  url.searchParams.set('improveFor', 'time');
  url.searchParams.set('apiKey', hereApiKey);

  const transport = TRANSPORT_MODES[options.travelMode] || TRANSPORT_MODES.TWO_WHEELER;
  const routeFeatures = [];
  if (options.avoidHighways) routeFeatures.push('motorway:-3');
  if (options.avoidTolls) routeFeatures.push('tollroad:-3');
  const mode = `fastest;${transport.here};traffic:disabled${routeFeatures.length ? `;${routeFeatures.join(',')}` : ''}`;
  url.searchParams.set('mode', mode);
  waypoints.forEach(([latLng], index) => url.searchParams.set(`destination${index + 1}`, `store${index};${latLng}`));

  // HERE supports JSONP for browser clients; the endpoint does not expose CORS headers.
  const data = await requestJsonp(url);
  const result = data.results?.[0];
  const indexes = (result?.waypoints || [])
    .filter(({ id }) => /^store\d+$/.test(id))
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ id }) => Number(id.slice(5)));

  const uniqueIndexes = new Set(indexes);
  if (indexes.length !== waypoints.length || uniqueIndexes.size !== waypoints.length || indexes.some((index) => index >= waypoints.length)) {
    throw new Error(`HERE 回傳的店點順序不完整（${indexes.length}/${waypoints.length}）。`);
  }
  log(`✅ HERE ${transport.here}（${transport.label}）排序完成：約 ${(Number(result.distance) / 1000).toFixed(1)} km。`, 'ok');
  return indexes;
}

function splitRouteSegments(origin, destination, sortedWaypoints, maxWaypointsPerUrl, opts) {
  const segments = [];
  let start = normalizeTW(origin);

  for (let i = 0; i < sortedWaypoints.length; i += maxWaypointsPerUrl) {
    const segment = sortedWaypoints.slice(i, i + maxWaypointsPerUrl);
    const isLastSegment = i + maxWaypointsPerUrl >= sortedWaypoints.length;
    const end = isLastSegment ? normalizeTW(destination) : segment[segment.length - 1][0];
    let segmentWaypoints = (isLastSegment ? segment : segment.slice(0, -1)).map(([point]) => point);
    let segmentNames = segment.map(([, name]) => name);

    if (segmentWaypoints[0] === start) {
      segmentWaypoints = segmentWaypoints.slice(1);
    }

    segments.push({
      index: segments.length + 1,
      url: buildMapsUrl(start, end, segmentWaypoints, opts),
      stores: segment.map(([latLng, name, address], offset) => {
        const [lat, lng] = latLng.split(',').map((value) => value.trim());
        return {
          index: i + offset + 1,
          name,
          address,
          lat,
          lng,
        };
      }),
    });
    start = end;
  }

  return segments;
}

function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function areaFromAddress(address) {
  return normalizeTW(address).match(/(?:台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/)?.[0] || '';
}

function selectedPlace(row) {
  return row.candidates[row.selectedIndex] || null;
}

function createSvgIcon(symbolId) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function formatCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : '—';
}

function setBuilderActionState(title, detail, label = '解析店點', state = 'idle') {
  const titleNode = $('builderActionTitle');
  const detailNode = $('builderActionDetail');
  const labelNode = $('resolveStoresLabel');
  const status = titleNode?.closest?.('.action-bar-status');
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
  if (labelNode) labelNode.textContent = label;
  status?.classList?.toggle('is-ready', state === 'ready');
  status?.classList?.toggle('is-error', state === 'error');
}

function renderBuilderResults() {
  const host = $('builderResults');
  host.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'store-table';
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th>輸入店名</th><th>Google 候選</th><th>完整地址</th><th>緯度</th><th>經度</th><th>地圖</th></tr>';
  const body = document.createElement('tbody');

  resolvedStoreRows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const inputCell = document.createElement('td');
    inputCell.textContent = row.inputName;
    const candidateCell = document.createElement('td');
    const addressCell = document.createElement('td');
    const latitudeCell = document.createElement('td');
    const longitudeCell = document.createElement('td');
    const mapCell = document.createElement('td');
    [inputCell, candidateCell, addressCell, latitudeCell, longitudeCell, mapCell].forEach((cell, index) => {
      cell.dataset.label = ['輸入店名', 'Google 候選', '完整地址', '緯度', '經度', '地圖'][index];
    });

    if (row.candidates.length) {
      if (row.candidates.length === 1) {
        const single = document.createElement('div');
        single.className = 'candidate-single';
        const icon = document.createElement('span');
        icon.appendChild(createSvgIcon('icon-check'));
        const copy = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = row.candidates[0].displayName?.text || row.candidates[0].formattedAddress || 'Google 候選';
        const state = document.createElement('small');
        state.textContent = '唯一候選 · 已自動採用';
        copy.append(name, state);
        single.append(icon, copy);
        candidateCell.appendChild(single);
      } else {
        const picker = document.createElement('details');
        picker.className = 'candidate-picker';
        const summary = document.createElement('summary');
        const currentName = document.createElement('strong');
        currentName.textContent = selectedPlace(row)?.displayName?.text || `候選 ${row.selectedIndex + 1}`;
        const count = document.createElement('small');
        count.textContent = `${row.candidates.length} 個候選`;
        summary.append(currentName, count, createSvgIcon('icon-chevron'));

        const options = document.createElement('div');
        options.className = 'candidate-options';
        row.candidates.forEach((place, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'candidate-option';
          button.setAttribute('aria-pressed', String(index === row.selectedIndex));
          const number = document.createElement('span');
          number.textContent = String(index + 1).padStart(2, '0');
          const copy = document.createElement('div');
          const name = document.createElement('strong');
          name.textContent = place.displayName?.text || `候選 ${index + 1}`;
          const address = document.createElement('small');
          address.textContent = normalizeTW(place.formattedAddress || '地址未提供');
          copy.append(name, address);
          button.append(number, copy);
          button.addEventListener('click', () => {
            resolvedStoreRows[rowIndex].selectedIndex = index;
            renderBuilderResults();
          });
          options.appendChild(button);
        });

        picker.append(summary, options);
        candidateCell.appendChild(picker);
      }

      const place = selectedPlace(row);
      addressCell.textContent = normalizeTW(place.formattedAddress || '');
      latitudeCell.textContent = formatCoordinate(place.location.latitude);
      longitudeCell.textContent = formatCoordinate(place.location.longitude);
      latitudeCell.className = 'coordinate-value';
      longitudeCell.className = 'coordinate-value';
      if (place.googleMapsUri) {
        const link = document.createElement('a');
        link.href = place.googleMapsUri;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'map-link';
        link.title = '在 Google Maps 確認位置';
        link.setAttribute('aria-label', `在 Google Maps 確認 ${row.inputName} 的位置`);
        link.appendChild(createSvgIcon('icon-pin'));
        mapCell.appendChild(link);
      }
    } else {
      candidateCell.textContent = '找不到候選';
      candidateCell.className = 'error';
      addressCell.textContent = '—';
      latitudeCell.textContent = '—';
      longitudeCell.textContent = '—';
    }

    tr.append(inputCell, candidateCell, addressCell, latitudeCell, longitudeCell, mapCell);
    body.appendChild(tr);
  });

  table.append(head, body);
  host.appendChild(table);
  const complete = !isResolvingStoreRows && resolvedStoreRows.length > 0 && resolvedStoreRows.every((row) => selectedPlace(row));
  $('downloadStoresBtn').disabled = !complete;
  $('downloadStoresBtn').hidden = !complete;
}

async function resolveStoreNames() {
  const apiKey = $('builderApiKey').value.trim();
  const names = $('storeNames').value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (!apiKey) return alert('請先貼上 Google Maps API Key');
  if (!names.length) return alert('請輸入至少一個店名');
  if (names.length > MAX_STORES) return alert(`一次最多 ${MAX_STORES} 間店`);

  $('resolveStoresBtn').disabled = true;
  $('downloadStoresBtn').disabled = true;
  $('downloadStoresBtn').hidden = true;
  isResolvingStoreRows = true;
  resolvedStoreRows = [];
  $('builderResults').innerHTML = '';
  $('builderStatus').textContent = `開始解析 ${names.length} 間店…`;
  setBuilderActionState(`解析中 0 / ${names.length}`, '正在搜尋 Google Places 候選門市', '解析中');

  for (let index = 0; index < names.length; index += 1) {
    const inputName = names[index];
    try {
      const branchName = inputName.replace(/^全聯福利中心\s*/, '').replace(/店$/, '').trim();
      const query = `全聯福利中心 ${branchName}店`;
      const candidates = await searchPlaceCandidates(apiKey, query, 3);
      resolvedStoreRows.push({ inputName, candidates, selectedIndex: 0 });
    } catch (error) {
      resolvedStoreRows.push({ inputName, candidates: [], selectedIndex: 0 });
      $('builderStatus').textContent = `${inputName} 解析失敗：${error.message}`;
    }
    $('builderStatus').textContent = `已解析 ${index + 1}/${names.length} 間店`;
    setBuilderActionState(`解析中 ${index + 1} / ${names.length}`, `正在處理：${inputName}`, '解析中');
    renderBuilderResults();
    await sleep(GEOCODE_DELAY_MS);
  }

  isResolvingStoreRows = false;
  const failed = resolvedStoreRows.filter((row) => !selectedPlace(row)).length;
  const needsReview = resolvedStoreRows.filter((row) => row.candidates.length > 1).length;
  $('builderStatus').textContent = failed
    ? `完成，但有 ${failed} 間找不到候選；請修正店名後重新解析。`
    : needsReview
      ? `完成 ${names.length} 間；其中 ${needsReview} 間有多個候選，請確認後下載 CSV。`
      : `完成 ${names.length} 間；唯一候選已自動採用，可以直接下載 CSV。`;
  if (failed) {
    setBuilderActionState(`${failed} 間解析失敗`, '修正店名後可重新解析', '重新解析', 'error');
  } else if (needsReview) {
    setBuilderActionState(`${needsReview} 間候選待確認`, '在解析結果選定門市後即可下載', '重新解析');
  } else {
    setBuilderActionState(`${names.length} 間店點已完成解析`, '標準 CSV 已可下載', '重新解析', 'ready');
  }
  renderBuilderResults();
  $('resolveStoresBtn').disabled = false;
}

function downloadResolvedStores() {
  const rows = [['店名', '區域', '完整地址', '緯度', '經度']];
  for (const row of resolvedStoreRows) {
    const place = selectedPlace(row);
    if (!place) return alert('仍有店名未成功解析');
    const address = normalizeTW(place.formattedAddress || '');
    rows.push([row.inputName, areaFromAddress(address), address, place.location.latitude, place.location.longitude]);
  }
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  downloadText('stores.csv', csv, 'text/csv;charset=utf-8');
}

function renderRouteLinks(route, routeFileText) {
  const routesWrap = document.createElement('ol');
  routesWrap.id = 'routeLinks';
  routesWrap.className = 'route-manifest';

  route.segments.forEach((segment, index) => {
    const routeItem = document.createElement('li');
    const meta = document.createElement('span');
    const link = document.createElement('a');
    const stops = document.createElement('small');

    meta.textContent = `route ${String(index + 1).padStart(2, '0')}`;
    link.href = segment.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `開啟第 ${index + 1} 段 Google Maps 路線`;
    stops.textContent = `${segment.stores.length} 個停靠點`;

    routeItem.append(meta, link, stops);
    routesWrap.appendChild(routeItem);
  });

  const downloadButton = document.createElement('button');
  downloadButton.id = 'downloadAllBtn';
  downloadButton.className = 'output-action route-output-action';
  downloadButton.type = 'button';
  const downloadLabel = document.createElement('span');
  downloadLabel.textContent = '下載 route.txt';
  downloadButton.append(createSvgIcon('icon-download'), downloadLabel);
  downloadButton.addEventListener('click', () => downloadText('route.txt', routeFileText));

  const openVisitButton = document.createElement('button');
  openVisitButton.id = 'openVisitBtn';
  openVisitButton.className = 'output-action route-output-action route-output-action--outlined';
  openVisitButton.type = 'button';
  const openVisitLabel = document.createElement('span');
  openVisitLabel.textContent = '在這台裝置開始跑店';
  openVisitButton.append(createSvgIcon('icon-clipboard'), openVisitLabel);
  openVisitButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('px-route-import', { detail: { text: routeFileText } }));
    setTool('visit');
  });

  const actionWrap = document.createElement('div');
  actionWrap.className = 'route-output-actions';
  actionWrap.append(downloadButton, openVisitButton);

  $('outLinks').append(routesWrap, actionWrap);
}

async function runRouteGeneration() {
  const options = readOptions();
  if (!options.hereApiKey) return alert('請先貼上 HERE API Key');
  if (!options.file) return alert('請先選擇 CSV 檔');
  if (!options.origin || !options.destination) return alert('請先填寫起點與終點');

  clearOutput();
  setView('results');
  log('📥 讀取 .csv ...');

  const csvText = await readCsvSmart(options.file);
  const stores = parseStoresFromCsv(csvText, options);
  log(`➡️ 讀到門市 ${stores.length} 筆（上限 ${options.maxApi}）`);
  if (!stores.length) return alert('CSV 內容為空，或固定欄位格式不正確（第 0 欄店名、第 2 欄地址）');
  const needsGoogleKey = stores.some(({ latLng }) => !latLng) || !parseCoordinate(options.origin) || !parseCoordinate(options.destination);
  if (needsGoogleKey && !options.apiKey) return alert('CSV 或起終點缺少經緯度，請貼上 Google Maps API Key 以完成定位');

  log('📡 讀取或解析店點座標…');
  const waypoints = await geocodeStores(options.apiKey, stores);
  if (!waypoints.length) return alert('沒有可用的中繼點（請檢查 CSV/編碼/地址格式）');
  if (waypoints.length !== stores.length) {
    log(`❌ 有 ${stores.length - waypoints.length} 間店定位失敗；為避免漏店，本次不產生路線。`, 'error');
    return alert('部分店點定位失敗；請先用「店點建檔」確認地址與座標');
  }

  const routeWaypoints = warnClosePoints(waypoints);
  if (routeWaypoints.length < 2) {
    return alert('有效中繼點不足，請檢查 CSV 內容。');
  }

  if (routeWaypoints.length > 100) {
    log('⚠️ 大型路線會產生較長的 HERE GET 請求；若遭瀏覽器或網路設備拒絕，需改由後端 POST 執行。');
  }

  let originLatLng;
  let destinationLatLng;
  try {
    originLatLng = await resolveLatLng(options.apiKey, options.origin);
    destinationLatLng = await resolveLatLng(options.apiKey, options.destination);
  } catch (error) {
    log(`起終點定位失敗：${error.message}`, 'error');
    return alert('起終點定位失敗，請查看 Log');
  }
  if (!originLatLng || !destinationLatLng) return alert('無法定位起點或終點');

  const transport = TRANSPORT_MODES[options.travelMode] || TRANSPORT_MODES.TWO_WHEELER;
  log(`${transport.icon} 呼叫 HERE Waypoints Sequence，以 ${transport.here} 模式排序…`);
  let order;
  try {
    order = await computeOptimizedOrder(
      options.hereApiKey,
      originLatLng,
      destinationLatLng,
      routeWaypoints,
      options,
    );
  } catch (error) {
    log(error.message, 'error');
    return alert('HERE 排序失敗，請查看 Log');
  }

  const sortedWaypoints = order.map((index) => routeWaypoints[index]);
  const segments = splitRouteSegments(originLatLng, destinationLatLng, sortedWaypoints, options.maxUrl, {
    mode: options.travelMode,
    avoidHighways: options.avoidHighways,
    avoidTolls: options.avoidTolls,
  });

  const now = new Date();
  const route = {
    id: PXRouteFile.createRouteId(now),
    createdAt: now.toISOString(),
    name: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 跑店路線`,
    origin: options.origin,
    destination: options.destination,
    travelMode: options.travelMode,
    segments,
  };
  const routeFileText = PXRouteFile.serialize(route);

  $('resultSummary').textContent = `完成：成功讀取並保留 ${stores.length} 筆店點，產出 ${segments.length} 段 Google Maps 路線。`;
  log(`✅ 共產出 ${segments.length} 條路線並整合為單一 route.txt。`);
  renderRouteLinks(route, routeFileText);
}

$('runBtn').addEventListener('click', runRouteGeneration);
$('rerunBtn').addEventListener('click', runRouteGeneration);
$('backToSetupBtn').addEventListener('click', () => setView('setup'));
$('resolveStoresBtn').addEventListener('click', resolveStoreNames);
$('downloadStoresBtn').addEventListener('click', downloadResolvedStores);

const resultMenu = $('resultMenu');

document.addEventListener('click', (event) => {
  if (resultMenu?.open && !resultMenu.contains(event.target)) resultMenu.open = false;
  document.querySelectorAll('.candidate-picker[open]').forEach((picker) => {
    if (!picker.contains(event.target)) picker.open = false;
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const resultMenuWasOpen = Boolean(resultMenu?.open);
  const openPickers = Array.from(document.querySelectorAll('.candidate-picker[open]'));
  const focusedPicker = openPickers.find((picker) => picker.contains(document.activeElement));
  if (resultMenu) resultMenu.open = false;
  openPickers.forEach((picker) => { picker.open = false; });
  if (resultMenuWasOpen) resultMenu.querySelector('summary')?.focus();
  else focusedPicker?.querySelector('summary')?.focus();
});

const TOOL_ORDER = ['builder', 'route', 'visit'];

function setTool(tool) {
  if (!TOOL_ORDER.includes(tool)) return;
  if (resultMenu) resultMenu.open = false;
  document.body.dataset.tool = tool;
  TOOL_ORDER.forEach((toolName) => {
    const tab = $(`${toolName}Tab`);
    const selected = tool === toolName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('routeTab').addEventListener('click', () => setTool('route'));
$('builderTab').addEventListener('click', () => setTool('builder'));
$('visitTab').addEventListener('click', () => setTool('visit'));
$('toolTabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = Math.max(0, TOOL_ORDER.indexOf(document.body.dataset.tool));
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? TOOL_ORDER.length - 1
      : (currentIndex + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + TOOL_ORDER.length) % TOOL_ORDER.length;
  const target = $(`${TOOL_ORDER[nextIndex]}Tab`);
  target.click();
  target.focus();
});

$('apiKey').addEventListener('input', () => { $('builderApiKey').value = $('apiKey').value; });
$('builderApiKey').addEventListener('input', () => { $('apiKey').value = $('builderApiKey').value; });

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
