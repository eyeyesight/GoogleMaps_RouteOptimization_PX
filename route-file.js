(function initRouteFileFormat(globalScope) {
  const HEADER = 'PX ROUTE FILE';
  const VERSION = 2;

  function cleanLine(value) {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  }

  function localDateParts(date = new Date()) {
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      compact: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
      time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
      milliseconds: pad(date.getMilliseconds(), 3),
    };
  }

  function createRouteId(date = new Date()) {
    const parts = localDateParts(date);
    return `${parts.compact}-${parts.time}-${parts.milliseconds}`;
  }

  function parseBoolean(value) {
    return /^(?:true|1|yes)$/i.test(String(value ?? '').trim());
  }

  function stableHash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function serialize(route, progress = {}) {
    const createdAt = route.createdAt || new Date().toISOString();
    const date = localDateParts(new Date(createdAt));
    const stores = (route.segments || []).flatMap((segment) => segment.stores || []);
    const lines = [
      HEADER,
      `VERSION: ${VERSION}`,
      `ROUTE_ID: ${cleanLine(route.id || createRouteId())}`,
      `CREATED_AT: ${cleanLine(createdAt)}`,
    ];

    if (route.resultExportedAt) lines.push(`RESULT_EXPORTED_AT: ${cleanLine(route.resultExportedAt)}`);

    lines.push(
      '',
      '[ROUTE]',
      `NAME: ${cleanLine(route.name || `${date.date} 跑店路線`)}`,
      `TOTAL_STORES: ${stores.length}`,
      `TRAVEL_MODE: ${cleanLine(route.travelMode || 'TWO_WHEELER')}`,
      `ORIGIN: ${cleanLine(route.origin)}`,
      `DESTINATION: ${cleanLine(route.destination)}`,
      'TASK: 檔期牌更換',
    );

    (route.segments || []).forEach((segment, segmentOffset) => {
      lines.push('', `[SEGMENT ${segment.index || segmentOffset + 1}]`, `GOOGLE_MAPS_URL: ${cleanLine(segment.url)}`);
      (segment.stores || []).forEach((store) => {
        const index = Number(store.index) || stores.indexOf(store) + 1;
        const state = progress[String(index)] || progress[index] || store;
        lines.push(
          '',
          `[STORE ${index}]`,
          `NAME: ${cleanLine(store.name)}`,
          `ADDRESS: ${cleanLine(store.address)}`,
          `LAT: ${cleanLine(store.lat)}`,
          `LNG: ${cleanLine(store.lng)}`,
        );
        if (typeof state.visited === 'boolean' || typeof state.posterChanged === 'boolean') {
          lines.push(
            `VISITED: ${Boolean(state.visited)}`,
            `POSTER_CHANGED: ${Boolean(state.posterChanged)}`,
          );
        }
        if (state.updatedAt) lines.push(`UPDATED_AT: ${cleanLine(state.updatedAt)}`);
      });
    });

    return `${lines.join('\r\n')}\r\n`;
  }

  function parseVersionTwo(text) {
    const route = {
      version: VERSION,
      id: '',
      createdAt: '',
      name: '',
      origin: '',
      destination: '',
      travelMode: 'TWO_WHEELER',
      segments: [],
    };
    let currentSegment = null;
    let currentStore = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line === HEADER) continue;

      const section = line.match(/^\[(ROUTE|SEGMENT\s+(\d+)|STORE\s+(\d+))\]$/i);
      if (section) {
        if (/^SEGMENT/i.test(section[1])) {
          currentSegment = { index: Number(section[2]), url: '', stores: [] };
          route.segments.push(currentSegment);
          currentStore = null;
        } else if (/^STORE/i.test(section[1])) {
          if (!currentSegment) {
            currentSegment = { index: 1, url: '', stores: [] };
            route.segments.push(currentSegment);
          }
          currentStore = {
            index: Number(section[3]),
            name: '',
            address: '',
            lat: '',
            lng: '',
            visited: false,
            posterChanged: false,
            updatedAt: '',
          };
          currentSegment.stores.push(currentStore);
        } else {
          currentSegment = null;
          currentStore = null;
        }
        continue;
      }

      const separator = line.indexOf(':');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim().toUpperCase();
      const value = line.slice(separator + 1).trim();

      if (currentStore) {
        if (key === 'NAME') currentStore.name = value;
        else if (key === 'ADDRESS') currentStore.address = value;
        else if (key === 'LAT') currentStore.lat = value;
        else if (key === 'LNG') currentStore.lng = value;
        else if (key === 'VISITED') currentStore.visited = parseBoolean(value);
        else if (key === 'POSTER_CHANGED') currentStore.posterChanged = parseBoolean(value);
        else if (key === 'UPDATED_AT') currentStore.updatedAt = value;
      } else if (currentSegment) {
        if (key === 'GOOGLE_MAPS_URL') currentSegment.url = value;
      } else {
        if (key === 'ROUTE_ID') route.id = value;
        else if (key === 'CREATED_AT') route.createdAt = value;
        else if (key === 'NAME') route.name = value;
        else if (key === 'ORIGIN') route.origin = value;
        else if (key === 'DESTINATION') route.destination = value;
        else if (key === 'TRAVEL_MODE') route.travelMode = value;
      }
    }

    const stores = route.segments.flatMap((segment) => segment.stores);
    if (!route.id) route.id = `route-${stableHash(text)}`;
    if (!route.createdAt) route.createdAt = new Date().toISOString();
    if (!route.name) route.name = `${localDateParts(new Date(route.createdAt)).date} 跑店路線`;
    if (!stores.length) throw new Error('route.txt 中找不到任何店點。');

    const usedIndexes = new Set();
    stores.forEach((store, index) => {
      let nextIndex = Number(store.index);
      if (!Number.isFinite(nextIndex) || nextIndex < 1 || usedIndexes.has(nextIndex)) {
        nextIndex = index + 1;
        while (usedIndexes.has(nextIndex)) nextIndex += 1;
      }
      store.index = nextIndex;
      usedIndexes.add(nextIndex);
      if (!store.name) store.name = `店點 ${store.index}`;
    });
    route.segments.sort((a, b) => a.index - b.index);
    return route;
  }

  function parseLegacy(text) {
    const route = {
      version: 1,
      id: `legacy-${stableHash(text)}`,
      createdAt: new Date().toISOString(),
      name: `${localDateParts().date} 跑店路線（舊格式）`,
      origin: '',
      destination: '',
      travelMode: 'TWO_WHEELER',
      segments: [],
    };
    let currentSegment = null;
    let storeIndex = 0;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const routeLine = line.match(/^route\s*(\d+)\s*:\s*(https?:\/\/\S+)/i);
      if (routeLine) {
        currentSegment = { index: Number(routeLine[1]), url: routeLine[2], stores: [] };
        route.segments.push(currentSegment);
        continue;
      }
      if (!currentSegment || /^https?:\/\//i.test(line)) continue;
      storeIndex += 1;
      currentSegment.stores.push({
        index: storeIndex,
        name: line,
        address: '',
        lat: '',
        lng: '',
        visited: false,
        posterChanged: false,
        updatedAt: '',
      });
    }

    if (!storeIndex) throw new Error('無法辨識這份路線檔，請重新從「路線最佳化」下載 route.txt。');
    return route;
  }

  function parse(text) {
    const normalized = String(text ?? '').replace(/^\uFEFF/, '').trim();
    if (!normalized) throw new Error('檔案是空的。');
    return normalized.startsWith(HEADER) ? parseVersionTwo(normalized) : parseLegacy(normalized);
  }

  globalScope.PXRouteFile = Object.freeze({
    HEADER,
    VERSION,
    createRouteId,
    parse,
    serialize,
  });
})(globalThis);
