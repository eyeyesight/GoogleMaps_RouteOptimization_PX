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

  // CSV drop zone and file-name feedback.
  const fileInput = document.getElementById('csvFile');
  const fileDrop = document.querySelector('[data-file-drop]');
  const fileName = document.querySelector('[data-file-name]');

  const updateFileName = () => {
    if (!(fileInput instanceof HTMLInputElement) || !(fileName instanceof HTMLElement)) return;
    const file = fileInput.files?.[0];
    fileName.textContent = file ? file.name : '尚未選擇檔案';
    fileDrop?.classList.toggle('has-file', Boolean(file));
  };

  fileInput?.addEventListener('change', updateFileName);

  if (fileDrop instanceof HTMLElement && fileInput instanceof HTMLInputElement) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      fileDrop.addEventListener(eventName, (event) => {
        event.preventDefault();
        fileDrop.classList.add('is-dragover');
      });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
      fileDrop.addEventListener(eventName, () => fileDrop.classList.remove('is-dragover'));
    });

    fileDrop.addEventListener('drop', (event) => {
      event.preventDefault();
      fileDrop.classList.remove('is-dragover');
      const droppedFile = event.dataTransfer?.files?.[0];
      if (!droppedFile) return;

      const isCsv = droppedFile.name.toLowerCase().endsWith('.csv') || droppedFile.type === 'text/csv';
      if (!isCsv) {
        fileDrop.animate?.(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 240, easing: 'ease-out' },
        );
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
  }

  // Live line count for the store builder textarea.
  const storeNames = document.getElementById('storeNames');
  const textareaCounter = document.querySelector('.textarea-counter');
  const updateStoreCount = () => {
    if (!(storeNames instanceof HTMLTextAreaElement) || !(textareaCounter instanceof HTMLElement)) return;
    const count = storeNames.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
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

  // Route users to the builder instead of exposing CSV schema details here.
  document.querySelectorAll('[data-open-builder]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('builderTab')?.click();
      document.getElementById('builderTool')?.scrollIntoView({ block: 'start' });
    });
  });
})();
