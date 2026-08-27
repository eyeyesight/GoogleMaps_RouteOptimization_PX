(function initVisitWorkspace() {
  const ACTIVE_ROUTE_KEY = 'px-route-active';
  const MANIFEST_PREFIX = 'px-route-manifest-';
  const PROGRESS_PREFIX = 'px-route-progress-';
  const MAX_ROUTE_FILE_BYTES = 5 * 1024 * 1024;

  const byId = (id) => document.getElementById(id);
  const fileInput = byId('visitFileInput');
  const emptyView = byId('visitEmpty');
  const dashboard = byId('visitDashboard');
  const menu = byId('visitMenu');
  const detailDialog = byId('visitDetailDialog');
  const routeClearDialog = byId('visitRouteClearDialog');
  const resetDialog = byId('visitResetDialog');
  const toast = byId('visitToast');

  let activeRoute = null;
  let progress = { routeId: '', stores: {}, updatedAt: '' };
  let activeFilter = 'all';
  let activeStoreIndex = null;
  let toastTimer = null;

  function allStores() {
    return activeRoute ? activeRoute.segments.flatMap((segment) => segment.stores) : [];
  }

  function storageKey(prefix, routeId) {
    return `${prefix}${routeId}`;
  }

  function safeJsonParse(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function showToast(message) {
    if (!(toast instanceof HTMLElement)) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 2600);
  }

  function stateFor(store) {
    const key = String(store.index);
    return progress.stores[key] || {
      visited: Boolean(store.visited),
      posterChanged: Boolean(store.posterChanged),
      updatedAt: store.updatedAt || '',
    };
  }

  function saveProgress() {
    if (!activeRoute) return;
    progress.routeId = activeRoute.id;
    progress.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey(PROGRESS_PREFIX, activeRoute.id), JSON.stringify(progress));
    } catch {
      showToast('無法寫入本機儲存空間，請先釋放瀏覽器容量。');
    }
  }

  function saveManifest(route) {
    try {
      localStorage.setItem(storageKey(MANIFEST_PREFIX, route.id), JSON.stringify(route));
      localStorage.setItem(ACTIVE_ROUTE_KEY, route.id);
    } catch {
      throw new Error('瀏覽器本機空間不足，無法保存這份路線。');
    }
  }

  function progressFromRoute(route) {
    const stores = {};
    route.segments.flatMap((segment) => segment.stores).forEach((store) => {
      stores[String(store.index)] = {
        visited: Boolean(store.visited),
        posterChanged: Boolean(store.posterChanged),
        updatedAt: store.updatedAt || '',
      };
    });
    return { routeId: route.id, stores, updatedAt: new Date().toISOString() };
  }

  function hydrateProgress(route) {
    const stored = safeJsonParse(localStorage.getItem(storageKey(PROGRESS_PREFIX, route.id)));
    const base = stored?.routeId === route.id && stored.stores ? stored : progressFromRoute(route);
    route.segments.flatMap((segment) => segment.stores).forEach((store) => {
      const key = String(store.index);
      if (!base.stores[key]) {
        base.stores[key] = {
          visited: Boolean(store.visited),
          posterChanged: Boolean(store.posterChanged),
          updatedAt: store.updatedAt || '',
        };
      }
    });
    return base;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '本機跑店工作階段'
      : new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function isGoogleMapsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['www.google.com', 'maps.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps/');
    } catch {
      return false;
    }
  }

  function storeMapsUrl(store) {
    const params = new URLSearchParams({ api: '1' });
    const coordinate = Number.isFinite(Number(store.lat)) && Number.isFinite(Number(store.lng))
      ? `${store.lat},${store.lng}`
      : [store.name, store.address].filter(Boolean).join(' ');
    params.set('destination', coordinate);
    params.set('travelmode', activeRoute?.travelMode === 'DRIVE' ? 'driving' : 'two-wheeler');
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function makeIcon(symbolId) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#${symbolId}`);
    svg.appendChild(use);
    return svg;
  }

  function makeStatus(text, isComplete) {
    const status = document.createElement('span');
    status.className = `visit-status-pill${isComplete ? ' is-complete' : ''}`;
    status.append(makeIcon(isComplete ? 'icon-check' : 'icon-close'), document.createTextNode(text));
    return status;
  }

  function renderOverview() {
    const stores = allStores();
    const visited = stores.filter((store) => stateFor(store).visited).length;
    const posters = stores.filter((store) => stateFor(store).posterChanged).length;
    const total = stores.length;
    const percent = total ? Math.round((visited / total) * 100) : 0;

    byId('visitRouteDate').textContent = formatDate(activeRoute.createdAt);
    byId('visitRouteName').textContent = activeRoute.name;
    byId('visitRouteMeta').textContent = `${activeRoute.segments.length} 段路線 · ${total} 間店 · ${activeRoute.version === 1 ? '舊版檔案' : `Route ID ${activeRoute.id}`}`;
    byId('visitedCount').textContent = String(visited);
    byId('visitTotalCount').textContent = String(total);
    byId('posterCount').textContent = String(posters);
    byId('visitPercent').textContent = `${percent}%`;
    byId('unvisitedFilterCount').textContent = String(total - visited);
    byId('visitedFilterCount').textContent = String(visited);
    byId('allFilterCount').textContent = String(total);

    const progressBar = byId('visitProgressBar');
    progressBar.style.setProperty('--visit-progress', `${percent}%`);
    progressBar.setAttribute('aria-valuemax', String(total));
    progressBar.setAttribute('aria-valuenow', String(visited));

    byId('visitHeroCount').textContent = `${visited} / ${total}`;
    byId('visitHeroProgress').style.setProperty('--visit-progress', `${percent}%`);
    [0, 1].forEach((offset) => {
      const store = stores[offset];
      const name = byId(`visitHeroStore${offset + 1}Name`);
      const status = byId(`visitHeroStore${offset + 1}Status`);
      if (!store) {
        name.textContent = offset === 0 ? '等待匯入店點' : '依路線順序顯示';
        status.textContent = offset === 0 ? '尚未到店 · 未換牌' : '點開卡片後登記';
        status.classList.remove('is-complete');
        return;
      }
      const storeState = stateFor(store);
      name.textContent = store.name;
      status.textContent = `${storeState.visited ? '已到店' : '尚未到店'} · ${storeState.posterChanged ? '已換牌' : '未換牌'}`;
      status.classList.toggle('is-complete', storeState.visited);
    });
  }

  function storeMatchesFilter(store) {
    const visited = stateFor(store).visited;
    return activeFilter === 'all' || (activeFilter === 'visited' ? visited : !visited);
  }

  function makeStoreCard(store) {
    const state = stateFor(store);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visit-store-card';
    button.setAttribute('aria-label', `開啟 ${store.name}，${state.visited ? '已到店' : '尚未到店'}，${state.posterChanged ? '檔期牌已更換' : '檔期牌未更換'}`);

    const number = document.createElement('span');
    number.className = 'visit-store-number';
    number.textContent = String(store.index).padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'visit-store-copy';
    const name = document.createElement('strong');
    name.textContent = store.name;
    const address = document.createElement('small');
    address.textContent = store.address || '點開查看與登記狀態';
    const statuses = document.createElement('span');
    statuses.className = 'visit-store-statuses';
    statuses.append(
      makeStatus(state.visited ? '已到店' : '尚未到店', state.visited),
      makeStatus(state.posterChanged ? '已換牌' : '未換牌', state.posterChanged),
    );
    copy.append(name, address, statuses);

    const chevron = makeIcon('icon-chevron');
    chevron.classList.add('visit-card-chevron');
    button.append(number, copy, chevron);
    button.addEventListener('click', () => openStoreDetail(store.index));
    return button;
  }

  function renderStoreList() {
    const host = byId('visitStoreList');
    host.textContent = '';
    let visibleCount = 0;

    activeRoute.segments.forEach((segment) => {
      const stores = segment.stores.filter(storeMatchesFilter);
      if (!stores.length) return;
      visibleCount += stores.length;

      const section = document.createElement('section');
      section.className = 'visit-segment';
      const header = document.createElement('header');
      const copy = document.createElement('div');
      const kicker = document.createElement('span');
      kicker.textContent = `ROUTE ${String(segment.index).padStart(2, '0')}`;
      const title = document.createElement('strong');
      title.textContent = `${segment.stores.length} 間店點`;
      copy.append(kicker, title);
      header.appendChild(copy);

      if (isGoogleMapsUrl(segment.url)) {
        const mapLink = document.createElement('a');
        mapLink.href = segment.url;
        mapLink.target = '_blank';
        mapLink.rel = 'noopener';
        mapLink.append(makeIcon('icon-map'), document.createTextNode('開啟此段地圖'));
        header.appendChild(mapLink);
      }

      const cards = document.createElement('div');
      cards.className = 'visit-store-cards';
      stores.forEach((store) => cards.appendChild(makeStoreCard(store)));
      section.append(header, cards);
      host.appendChild(section);
    });

    if (!visibleCount) {
      const empty = document.createElement('div');
      empty.className = 'visit-list-empty';
      empty.append(makeIcon('icon-check'));
      const title = document.createElement('strong');
      title.textContent = activeFilter === 'unvisited' ? '所有店點都已到店' : '這個篩選沒有店點';
      const message = document.createElement('p');
      message.textContent = '切換上方篩選即可查看其他店點。';
      empty.append(title, message);
      host.appendChild(empty);
    }
  }

  function renderDashboard() {
    if (!activeRoute) return;
    emptyView.hidden = true;
    dashboard.hidden = false;
    menu.hidden = false;
    renderOverview();
    renderStoreList();
  }

  function updateToggle(button, active, inactiveLabel, activeLabel) {
    button.setAttribute('aria-pressed', String(active));
    button.textContent = '';
    button.append(makeIcon(active ? 'icon-check' : 'icon-close'), document.createTextNode(active ? activeLabel : inactiveLabel));
  }

  function openStoreDetail(storeIndex) {
    const store = allStores().find((candidate) => candidate.index === storeIndex);
    if (!store) return;
    activeStoreIndex = storeIndex;
    const state = stateFor(store);
    byId('visitDetailIndex').textContent = `STORE ${String(store.index).padStart(2, '0')}`;
    byId('visitDetailName').textContent = store.name;
    byId('visitDetailAddress').textContent = store.address || '這份路線檔沒有提供地址。';
    updateToggle(byId('visitToggleVisited'), state.visited, '尚未到店', '已到店');
    updateToggle(byId('visitTogglePoster'), state.posterChanged, '檔期牌未更換', '檔期牌已更換');
    byId('visitMapsLink').href = storeMapsUrl(store);
    detailDialog.showModal();
  }

  function updateActiveStore(field) {
    const store = allStores().find((candidate) => candidate.index === activeStoreIndex);
    if (!store) return;
    const key = String(store.index);
    const previous = stateFor(store);
    progress.stores[key] = {
      ...previous,
      [field]: !previous[field],
      updatedAt: new Date().toISOString(),
    };
    saveProgress();
    const next = progress.stores[key];
    updateToggle(byId('visitToggleVisited'), next.visited, '尚未到店', '已到店');
    updateToggle(byId('visitTogglePoster'), next.posterChanged, '檔期牌未更換', '檔期牌已更換');
    renderOverview();
    renderStoreList();
    showToast('已自動儲存');
  }

  function importRouteText(text, { source = 'file' } = {}) {
    const route = PXRouteFile.parse(text);
    saveManifest(route);
    activeRoute = route;
    progress = hydrateProgress(route);
    saveProgress();
    activeFilter = 'all';
    document.querySelectorAll('[data-visit-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.visitFilter === activeFilter));
    });
    renderDashboard();
    byId('visitImportStatus').textContent = `已載入 ${allStores().length} 間店點。`;
    if (source !== 'restore') showToast(source === 'planner' ? '已從路線最佳化載入' : 'route.txt 已載入');
  }

  async function importSelectedFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_ROUTE_FILE_BYTES) {
      byId('visitImportStatus').textContent = '檔案超過 5 MB，請確認是否為 route.txt。';
      fileInput.value = '';
      fileInput.dispatchEvent(new Event('fileinputreset'));
      return;
    }
    try {
      importRouteText(await file.text());
    } catch (error) {
      byId('visitImportStatus').textContent = error.message;
      showToast(error.message);
    } finally {
      fileInput.value = '';
      fileInput.dispatchEvent(new Event('fileinputreset'));
    }
  }

  function resetCurrentRoute() {
    if (!activeRoute) return;
    progress = progressFromRoute(activeRoute);
    Object.values(progress.stores).forEach((state) => {
      state.visited = false;
      state.posterChanged = false;
      state.updatedAt = '';
    });
    saveProgress();
    activeFilter = 'all';
    document.querySelectorAll('[data-visit-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.visitFilter === 'all'));
    });
    renderDashboard();
    showToast('跑店進度已歸零');
  }

  function clearVisitStorage() {
    try {
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key) => key === ACTIVE_ROUTE_KEY || key?.startsWith(MANIFEST_PREFIX) || key?.startsWith(PROGRESS_PREFIX));
      keys.forEach((key) => localStorage.removeItem(key));
      return true;
    } catch {
      showToast('無法清除本機跑店資料，請確認瀏覽器儲存空間設定。');
      return false;
    }
  }

  function returnToVisitHome() {
    if (!clearVisitStorage()) return false;
    activeRoute = null;
    progress = { routeId: '', stores: {}, updatedAt: '' };
    activeFilter = 'all';
    activeStoreIndex = null;

    emptyView.hidden = false;
    dashboard.hidden = true;
    menu.open = false;
    menu.hidden = true;
    byId('visitStoreList').textContent = '';
    byId('visitImportStatus').textContent = '尚未載入 route.txt';
    byId('visitHeroCount').textContent = '0 / —';
    byId('visitHeroProgress').style.setProperty('--visit-progress', '0%');
    byId('visitHeroStore1Name').textContent = '等待匯入店點';
    byId('visitHeroStore1Status').textContent = '尚未到店 · 未換牌';
    byId('visitHeroStore1Status').classList.remove('is-complete');
    byId('visitHeroStore2Name').textContent = '依路線順序顯示';
    byId('visitHeroStore2Status').textContent = '點開卡片後登記';
    byId('visitHeroStore2Status').classList.remove('is-complete');
    fileInput.value = '';
    fileInput.dispatchEvent(new Event('fileinputreset'));
    window.setTimeout(() => fileInput.focus(), 0);
    showToast('跑店資料已清除，可載入其他 route.txt');
    return true;
  }

  function exportCurrentRoute() {
    if (!activeRoute) return;
    const exportRoute = { ...activeRoute, resultExportedAt: new Date().toISOString() };
    const text = PXRouteFile.serialize(exportRoute, progress.stores);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `route-result-${activeRoute.id}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('跑店紀錄已匯出');
  }

  function restoreActiveRoute() {
    const routeId = localStorage.getItem(ACTIVE_ROUTE_KEY);
    if (!routeId) return false;
    const route = safeJsonParse(localStorage.getItem(storageKey(MANIFEST_PREFIX, routeId)));
    if (!route?.segments?.length) return false;
    activeRoute = route;
    progress = hydrateProgress(route);
    renderDashboard();
    return true;
  }

  function closeDialogFromBackdrop(dialog) {
    if (!(dialog instanceof HTMLDialogElement)) return;
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom;
      if (clickedOutside) dialog.close('cancel');
    });
  }

  fileInput?.addEventListener('change', importSelectedFile);
  byId('visitExportBtn')?.addEventListener('click', () => {
    menu.open = false;
    exportCurrentRoute();
  });
  byId('replaceRouteBtn')?.addEventListener('click', () => {
    menu.open = false;
    routeClearDialog.showModal();
  });
  byId('visitResetBtn')?.addEventListener('click', () => {
    menu.open = false;
    resetDialog.showModal();
  });
  byId('confirmRouteClearBtn')?.addEventListener('click', (event) => {
    if (!returnToVisitHome()) event.preventDefault();
  });
  byId('confirmVisitResetBtn')?.addEventListener('click', resetCurrentRoute);
  byId('closeVisitDetailBtn')?.addEventListener('click', () => detailDialog.close());
  byId('visitToggleVisited')?.addEventListener('click', () => updateActiveStore('visited'));
  byId('visitTogglePoster')?.addEventListener('click', () => updateActiveStore('posterChanged'));

  document.addEventListener('click', (event) => {
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu?.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
  closeDialogFromBackdrop(detailDialog);
  closeDialogFromBackdrop(routeClearDialog);
  closeDialogFromBackdrop(resetDialog);

  document.querySelectorAll('[data-visit-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.visitFilter;
      document.querySelectorAll('[data-visit-filter]').forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      renderStoreList();
    });
  });

  window.addEventListener('px-route-import', (event) => {
    try {
      importRouteText(event.detail?.text, { source: 'planner' });
    } catch (error) {
      showToast(error.message);
    }
  });

  if (restoreActiveRoute()) setTool('visit');
})();
