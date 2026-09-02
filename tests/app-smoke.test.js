const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function elementStub() {
  return {
    value: '',
    checked: false,
    files: [],
    disabled: false,
    innerHTML: '',
    textContent: '',
    classList: { add() {} },
    addEventListener() {},
    appendChild() {},
    append() {},
    remove() {},
    setAttribute() {},
    click() {},
  };
}

const elements = new Map();
const rootAttributes = new Map();
const documentStub = {
  body: { dataset: {} },
  head: { appendChild() {} },
  documentElement: {
    getAttribute: (name) => rootAttributes.get(name) ?? null,
    setAttribute: (name, value) => rootAttributes.set(name, value),
    removeAttribute: (name) => rootAttributes.delete(name),
  },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, elementStub());
    return elements.get(id);
  },
  createElement: elementStub,
};

const context = vm.createContext({
  Blob,
  URL,
  URLSearchParams,
  TextDecoder,
  Uint8Array,
  console,
  document: documentStub,
  localStorage: { getItem: () => null, setItem() {} },
  window: { matchMedia: () => ({ matches: false }), scrollTo() {} },
  setTimeout,
  clearTimeout,
  alert() {},
  Papa: { parse: (text) => ({ data: parseCsv(text) }) },
  fetch: async () => { throw new Error('Unexpected network call'); },
});

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
vm.runInContext(`${source}\n;globalThis.testApi = { readCsvSmart, parseStoresFromCsv, computeOptimizedOrder, splitUrlsAndNames };`, context);

async function run() {
  const csvPath = process.argv[2];
  assert(csvPath, 'Usage: node tests/app-smoke.test.js <30-store.csv>');
  const bytes = fs.readFileSync(csvPath);
  const file = {
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };

  const csvText = await context.testApi.readCsvSmart(file);
  const stores = context.testApi.parseStoresFromCsv(csvText, { maxApi: 30 });
  assert.equal(stores.length, 30, 'CSV must yield exactly 30 stores');
  assert.equal(new Set(stores.map(({ address }) => address)).size, 30, 'Store addresses must be unique');

  const maximumCsv = [
    '店名,區域,完整地址',
    ...Array.from({ length: 205 }, (_, index) => `測試店${index + 1},台北市,台北市測試路${index + 1}號`),
  ].join('\n');
  const maximumStores = context.testApi.parseStoresFromCsv(maximumCsv, { maxApi: 200 });
  assert.equal(maximumStores.length, 200, 'CSV parser must support and cap at 200 stores');

  const coordinateStops = stores.map((store, index) => [
    `25.${String(100000 + index)},121.${String(500000 + index)}`,
    store.name,
  ]);
  const requestedUrls = [];
  documentStub.head.appendChild = (script) => {
    requestedUrls.push(script.src);
    const params = new URL(script.src).searchParams;
    const callbackName = params.get('jsonCallback');
    const waypointIds = [...params.entries()]
      .filter(([key]) => /^destination\d+$/.test(key))
      .map(([, value]) => value.split(';')[0]);
    setTimeout(() => context.window[callbackName]({
      results: [{
        distance: 42000,
        waypoints: waypointIds.map((id, index) => ({ id, sequence: waypointIds.length - index })),
      }],
    }), 0);
  };

  const origin = '24.9732927,121.5492187';
  const order = await context.testApi.computeOptimizedOrder('test-only-key', origin, origin, coordinateStops, {
    travelMode: 'TWO_WHEELER',
    avoidHighways: true,
    avoidTolls: true,
  });
  assert.equal(order.length, 30);
  assert.deepEqual(Array.from(order), Array.from({ length: 30 }, (_, index) => 29 - index));
  assert.match(requestedUrls[0], /mode=fastest%3Bscooter%3Btraffic%3Adisabled%3Bmotorway%3A-3%2Ctollroad%3A-3/);
  assert.match(requestedUrls[0], /destination30=store29%3B/);
  assert.match(requestedUrls[0], /jsonCallback=__hereSequence_/);

  const sorted = order.map((index) => coordinateStops[index]);
  const output = context.testApi.splitUrlsAndNames(origin, origin, sorted, 8, {
    mode: 'TWO_WHEELER',
    avoidHighways: true,
    avoidTolls: true,
  });
  assert.equal(output.urls.length, 4, '30 stores at 8 per segment must yield 4 URLs');
  assert.equal(output.names.flat().length, 30, 'All 30 store names must be retained');
  assert(output.urls.every((url) => url.includes('travelmode=two-wheeler')));
  assert(output.urls.every((url) => url.includes('avoid=highways%7Ctolls')));

  const maximumCoordinateStops = maximumStores.map((store, index) => [
    `25.${String(100000 + index)},121.${String(500000 + index)}`,
    store.name,
  ]);
  const carOrder = await context.testApi.computeOptimizedOrder('test-only-key', origin, origin, maximumCoordinateStops, {
    travelMode: 'DRIVE',
    avoidHighways: false,
    avoidTolls: true,
  });
  assert.equal(carOrder.length, 200, 'HERE request must preserve all 200 destinations');
  assert.match(requestedUrls[1], /mode=fastest%3Bcar%3Btraffic%3Adisabled%3Btollroad%3A-3/);
  assert.match(requestedUrls[1], /destination200=store199%3B/);

  const carOutput = context.testApi.splitUrlsAndNames(origin, origin, maximumCoordinateStops, 8, {
    mode: 'DRIVE',
    avoidHighways: false,
    avoidTolls: true,
  });
  assert.equal(carOutput.urls.length, 25, '200 stores at 8 per segment must yield 25 URLs');
  assert.equal(carOutput.names.flat().length, 200, 'All 200 store names must be retained');
  assert(carOutput.urls.every((url) => url.includes('travelmode=driving')));

  console.log(`smoke ok: ${stores.length} scooter stores and ${maximumStores.length} car stores`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
