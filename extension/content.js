/**
 * Content Script Coordinator
 * Listens for export commands, runs layout extraction, and downloads the YAML file.
 */

(() => {
  if (window.__yamlPrinterMessageListener) {
    try {
      chrome.runtime.onMessage.removeListener(window.__yamlPrinterMessageListener);
    } catch (e) {}
  }

  function downloadBlob(content, filename) {
    const blob = new Blob([content], { type: 'application/x-yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentElement) a.parentElement.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    }, 500);
  }

  window.__yamlPrinterMessageListener = (message, sender, sendResponse) => {
    // 1. Direct compiled YAML save request from background multi-frame aggregator
    if (message.action === 'SAVE_COMPILED_YAML') {
      try {
        downloadBlob(message.content, message.filename);
        showToast(`Saved layout as ${message.filename}`, 'success');
        sendResponse({ success: true, saved: true });
      } catch (err) {
        console.error('[YAML Printer] Save error:', err);
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    // 2. Single-frame export trigger (fallback)
    if (message.action === 'EXPORT_LAYOUT_YAML') {
      try {
        showToast('Extracting structured layout...', 'info');
        const extractor = new PageLayoutExtractor(message.options || {});
        const structuredData = extractor.extract();
        const yamlOutput = stringifyYAML(structuredData);

        const slug = generatePageSlug(structuredData.metadata.title || window.location.hostname);
        const filename = `${slug}-layout.yaml`;

        downloadBlob(yamlOutput, filename);
        showToast(`Saved layout as ${filename}`, 'success');
        sendResponse({ success: true, filename, size: yamlOutput.length });
      } catch (err) {
        console.error('[YAML Printer] Extraction error:', err);
        showToast(`Export failed: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }

    // 3. Single-frame preview request
    if (message.action === 'PREVIEW_LAYOUT_YAML') {
      try {
        const extractor = new PageLayoutExtractor(message.options || {});
        const data = extractor.extract();
        const yamlText = stringifyYAML(data);
        sendResponse({ success: true, yaml: yamlText, stats: { items: data.layout.length } });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }
  };

  chrome.runtime.onMessage.addListener(window.__yamlPrinterMessageListener);

  function generatePageSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50) || 'webpage';
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('yaml-printer-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'yaml-printer-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
      info: '#0f172a',
      success: '#059669',
      error: '#dc2626'
    };

    toast.style.cssText = `
      background: ${bgColors[type] || bgColors.info};
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    }, 2800);
  }
})();
