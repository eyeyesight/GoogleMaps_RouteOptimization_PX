(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('ui-enhanced');

  const setThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', root.getAttribute('data-theme') === 'dark' ? '#0a2119' : '#102019');
  };

  setThemeColor();
  new MutationObserver(setThemeColor).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // Password visibility controls. Business logic continues to read the same input IDs.
  document.querySelectorAll('[data-toggle-visibility]').forEach((button) => {
    const targetId = button.getAttribute('data-toggle-visibility');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!(input instanceof HTMLInputElement)) return;

    button.addEventListener('click', () => {
      const shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      button.classList.toggle('is-visible', shouldShow);
      button.setAttribute('aria-pressed', String(shouldShow));
      button.setAttribute('aria-label', `${shouldShow ? '隱藏' : '顯示'} ${input.labels?.[0]?.textContent?.trim() || 'API Key'}`);
      input.focus({ preventScroll: true });
    });
  });

  // Shared file picker and drop-zone behavior for CSV and route.txt inputs.
  document.querySelectorAll('[data-file-drop]').forEach((fileDrop) => {
    const fileInput = fileDrop.querySelector('input[type="file"]');
    const fileName = fileDrop.querySelector('[data-file-name]');
    if (!(fileDrop instanceof HTMLElement) || !(fileInput instanceof HTMLInputElement) || !(fileName instanceof HTMLElement)) return;

    const updateFileName = () => {
      const file = fileInput.files?.[0];
      fileName.textContent = file?.name || '';
      fileName.title = file?.name || '';
      fileDrop.classList.toggle('has-file', Boolean(file));
      fileDrop.classList.remove('has-error');
    };

    const acceptsFile = (file) => fileInput.accept
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .some((token) => {
        if (token.startsWith('.')) return file.name.toLowerCase().endsWith(token);
        if (token.endsWith('/*')) return file.type.toLowerCase().startsWith(token.slice(0, -1));
        return file.type.toLowerCase() === token;
      });

    fileInput.addEventListener('change', updateFileName);
    fileInput.addEventListener('fileinputreset', updateFileName);

    ['dragenter', 'dragover'].forEach((eventName) => {
      fileDrop.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        fileDrop.classList.add('is-dragover');
      });
    });

    fileDrop.addEventListener('dragleave', (event) => {
      if (!fileDrop.contains(event.relatedTarget)) fileDrop.classList.remove('is-dragover');
    });
    fileDrop.addEventListener('dragend', () => fileDrop.classList.remove('is-dragover'));

    fileDrop.addEventListener('drop', (event) => {
      event.preventDefault();
      fileDrop.classList.remove('is-dragover');
      const droppedFile = event.dataTransfer?.files?.[0];
      if (!droppedFile) return;

      if (!acceptsFile(droppedFile)) {
        fileName.textContent = '不支援此檔案格式';
        fileName.title = '';
        fileDrop.classList.remove('has-file');
        fileDrop.classList.add('has-error');
        fileDrop.animate?.(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 240, easing: 'ease-out' },
        );
        window.setTimeout(updateFileName, 1600);
        return;
      }

      try {
        const transfer = new DataTransfer();
        transfer.items.add(droppedFile);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        // Some browsers restrict programmatic FileList assignment; the native file picker still works.
      }
    });
  });
  const csvFileInput = document.getElementById('csvFile');

  // Live line count for the store builder textarea.
  const storeNames = document.getElementById('storeNames');
  const textareaCounter = document.querySelector('.textarea-counter');
  const countStoreNames = () => storeNames instanceof HTMLTextAreaElement
    ? storeNames.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length
    : 0;
  const updateStoreCount = () => {
    if (!(storeNames instanceof HTMLTextAreaElement) || !(textareaCounter instanceof HTMLElement)) return;
    const count = countStoreNames();
    textareaCounter.textContent = `${count} / 200 間`;
    textareaCounter.classList.toggle('is-over', count > 200);
  };
  storeNames?.addEventListener('input', updateStoreCount);
  updateStoreCount();

  // Compact button-group stepper for the Google Maps segment size.
  document.querySelectorAll('[data-stepper]').forEach((stepper) => {
    const input = stepper.querySelector('input[type="number"]');
    const buttons = Array.from(stepper.querySelectorAll('[data-step]'));
    if (!(input instanceof HTMLInputElement)) return;

    const min = Number(input.min) || 1;
    const max = Number(input.max) || 9;
    const syncStepper = () => {
      const value = Math.max(min, Math.min(max, Number(input.value) || min));
      input.value = String(value);
      buttons.forEach((button) => {
        const direction = Number(button.getAttribute('data-step'));
        button.disabled = direction < 0 ? value <= min : value >= max;
      });
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const direction = Number(button.getAttribute('data-step'));
        input.value = String((Number(input.value) || min) + direction);
        syncStepper();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    syncStepper();
  });

  // Shared Input Sheet action bars. Each tool exposes one primary start action.
  const routeRunButton = document.getElementById('runBtn');
  const routeActionTitle = document.getElementById('routeActionTitle');
  const routeActionDetail = document.getElementById('routeActionDetail');
  const routeStatus = routeActionTitle?.closest('.action-bar-status');
  const apiKey = document.getElementById('apiKey');
  const hereApiKey = document.getElementById('hereApiKey');
  const builderApiKey = document.getElementById('builderApiKey');
  const origin = document.getElementById('origin');
  const destination = document.getElementById('destination');

  const updateRouteAction = () => {
    if (!(routeRunButton instanceof HTMLButtonElement) || !(routeActionTitle instanceof HTMLElement) || !(routeActionDetail instanceof HTMLElement)) return;
    const missing = [];
    if (!(apiKey instanceof HTMLInputElement) || !apiKey.value.trim()) missing.push('Google API Key');
    if (!(hereApiKey instanceof HTMLInputElement) || !hereApiKey.value.trim()) missing.push('HERE API Key');
    if (!(origin instanceof HTMLInputElement) || !origin.value.trim()) missing.push('起點');
    if (!(destination instanceof HTMLInputElement) || !destination.value.trim()) missing.push('終點');
    if (!(csvFileInput instanceof HTMLInputElement) || !csvFileInput.files?.[0]) missing.push('標準 CSV');
    const ready = missing.length === 0;
    routeRunButton.disabled = !ready;
    routeActionTitle.textContent = ready ? 'CSV 與 API 設定完成' : `尚缺 ${missing.length} 項設定`;
    routeActionDetail.textContent = ready ? '可以開始排序並產生分段路線' : `需要：${missing.join('、')}`;
    routeStatus?.classList.toggle('is-ready', ready);
  };

  const builderRunButton = document.getElementById('resolveStoresBtn');
  const builderActionTitle = document.getElementById('builderActionTitle');
  const builderActionDetail = document.getElementById('builderActionDetail');
  const builderStatus = builderActionTitle?.closest('.action-bar-status');
  const resolveStoresLabel = document.getElementById('resolveStoresLabel');
  const downloadStoresButton = document.getElementById('downloadStoresBtn');

  const updateBuilderAction = (markDirty = false) => {
    if (!(builderRunButton instanceof HTMLButtonElement) || !(builderActionTitle instanceof HTMLElement) || !(builderActionDetail instanceof HTMLElement)) return;
    const count = countStoreNames();
    const hasKey = builderApiKey instanceof HTMLInputElement && Boolean(builderApiKey.value.trim());
    const isOver = count > 200;
    const ready = hasKey && count > 0 && !isOver;
    builderRunButton.disabled = !ready;
    builderStatus?.classList.toggle('is-ready', ready);
    builderStatus?.classList.toggle('is-error', isOver);

    if (isOver) {
      builderActionTitle.textContent = '超過 200 間上限';
      builderActionDetail.textContent = '請減少店名數量後再開始解析';
    } else if (ready) {
      builderActionTitle.textContent = `${count} 間店名待解析`;
      builderActionDetail.textContent = '將搜尋 Google Places 候選門市';
    } else {
      builderActionTitle.textContent = '等待必要資料';
      builderActionDetail.textContent = '填入 Places API Key 與至少一間店名';
    }

    if (markDirty) {
      if (resolveStoresLabel instanceof HTMLElement) resolveStoresLabel.textContent = '解析店點';
      if (downloadStoresButton instanceof HTMLButtonElement) {
        downloadStoresButton.disabled = true;
        downloadStoresButton.hidden = true;
      }
    }
  };

  [apiKey, hereApiKey, builderApiKey, origin, destination].forEach((input) => {
    input?.addEventListener('input', () => {
      updateRouteAction();
      updateBuilderAction(input === builderApiKey);
    });
  });
  csvFileInput?.addEventListener('change', updateRouteAction);
  storeNames?.addEventListener('input', () => updateBuilderAction(true));
  updateRouteAction();
  updateBuilderAction();

  // Route users to the builder instead of exposing CSV schema details here.
  document.querySelectorAll('[data-open-builder]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('builderTab')?.click();
      document.getElementById('builderTool')?.scrollIntoView({ block: 'start' });
    });
  });
})();
