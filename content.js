/**
 * Content Script Coordinator
 * Listens for export commands, runs layout extraction, and handles the Save File Picker.
 */

(() => {
  if (window.__yamlPrinterMessageListener) {
    try {
      chrome.runtime.onMessage.removeListener(window.__yamlPrinterMessageListener);
    } catch (e) {}
  }

  window.__yamlPrinterMessageListener = (message, sender, sendResponse) => {
    // 1. Direct compiled YAML save request from background multi-frame aggregator
    if (message.action === 'SAVE_COMPILED_YAML') {
      saveYAMLWithPicker(message.content, message.filename)
        .then(saved => {
          if (saved) {
            showToast(`Saved layout as ${message.filename}`, 'success');
          }
          sendResponse({ success: true, saved });
        })
        .catch(err => {
          console.warn('[YAML Printer] Save error, falling back to direct anchor download:', err);
          fallbackAnchorDownload(message.content, message.filename);
          showToast(`Saved layout as ${message.filename}`, 'success');
          sendResponse({ success: true, saved: true });
        });
      return true; // Keep channel open for async response
    }

    // 2. Single-frame export trigger (fallback)
    if (message.action === 'EXPORT_LAYOUT_YAML') {
      executeSingleFrameExport(message.options || {})
        .then(result => sendResponse({ success: true, result }))
        .catch(err => {
          console.error('[YAML Printer] Extraction error:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
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

  async function executeSingleFrameExport(options = {}) {
    showToast('Extracting structured layout...', 'info');

    const extractor = new PageLayoutExtractor(options);
    const structuredData = extractor.extract();
    const yamlOutput = stringifyYAML(structuredData);

    const slug = generatePageSlug(structuredData.metadata.title || window.location.hostname);
    const filename = `${slug}-layout.yaml`;

    const saved = await saveYAMLWithPicker(yamlOutput, filename);

    if (saved) {
      showToast(`Saved layout as ${filename}`, 'success');
      return { filename, size: yamlOutput.length };
    } else {
      showToast('Export cancelled or completed via download', 'info');
      return { filename, size: yamlOutput.length };
    }
  }

  function generatePageSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50) || 'webpage';
  }

  async function saveYAMLWithPicker(content, defaultFilename) {
    // Priority 1: Modern File System Access API
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [
            {
              description: 'YAML File (*.yaml, *.yml)',
              accept: {
                'text/yaml': ['.yaml', '.yml']
              }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([content], { type: 'text/yaml;charset=utf-8' }));
        await writable.close();
        return true;
      } catch (err) {
        if (err.name === 'AbortError') {
          return false;
        }
        console.warn('[YAML Printer] showSaveFilePicker failed or blocked by gesture. Falling back to background download...', err);
      }
    }

    // Priority 2: Fallback via background chrome.downloads API with saveAs prompt
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'DOWNLOAD_YAML',
          content: content,
          filename: defaultFilename
        },
        response => {
          if (response && response.success) {
            resolve(true);
          } else {
            // Priority 3: DOM Anchor fallback
            fallbackAnchorDownload(content, defaultFilename);
            resolve(true);
          }
        }
      );
    });
  }

  function fallbackAnchorDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function showToast(message, type = 'info') {
    const existing = document.getElementById('__yaml_printer_toast__');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '__yaml_printer_toast__';
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      backgroundColor: type === 'success' ? '#0f766e' : '#1e293b',
      color: '#ffffff',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      opacity: '0',
      transform: 'translateY(10px)',
      pointerEvents: 'none'
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }
})();
