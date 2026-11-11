/**
 * Popup Controller
 * Manages user triggers from toolbar popup, previews compiled multi-frame and PDF output,
 * and computes token statistics.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const btnExport = document.getElementById('btn-export');
  const btnCopy = document.getElementById('btn-copy');
  const btnPreview = document.getElementById('btn-preview');
  const btnClosePreview = document.getElementById('btn-close-preview');
  const previewContainer = document.getElementById('preview-container');
  const previewCode = document.querySelector('#preview-code code');
  const statElements = document.getElementById('stat-elements');
  const statSize = document.getElementById('stat-size');
  const statTokens = document.getElementById('stat-tokens');
  const pageStatus = document.getElementById('page-status');

  let activeTab = null;
  let cachedYaml = '';
  let defaultFilename = 'layout.yaml';

  // Get active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
  } catch (err) {
    console.error('Failed to query tab:', err);
    pageStatus.textContent = 'Error';
    return;
  }

  // Pre-load layout stats
  loadLayoutStats();

  async function loadLayoutStats() {
    if (!activeTab || !activeTab.id || (activeTab.url && activeTab.url.startsWith('chrome://') && !activeTab.url.includes('pdf'))) {
      pageStatus.textContent = 'Restricted';
      btnExport.disabled = true;
      btnCopy.disabled = true;
      btnPreview.disabled = true;
      return;
    }

    pageStatus.textContent = 'Scanning...';

    try {
      chrome.runtime.sendMessage(
        {
          action: 'GET_COMPILED_PAGE_YAML',
          tabId: activeTab.id,
          options: { includeHiddenTabs: true }
        },
        response => {
          if (response && response.success) {
            cachedYaml = response.yaml;
            if (response.filename) {
              defaultFilename = response.filename;
            } else {
              const slug = (activeTab.title || 'page')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 50) || 'webpage';
              defaultFilename = `${slug}-layout.yaml`;
            }

            const bytes = new Blob([cachedYaml]).size;
            const kb = (bytes / 1024).toFixed(1);
            const estimatedTokens = Math.round(cachedYaml.length / 3.8);

            statElements.textContent = response.stats.items;
            statSize.textContent = `${kb} KB`;
            statTokens.textContent = estimatedTokens.toLocaleString();
            previewCode.textContent = cachedYaml;
            
            if (response.isPdf) {
              pageStatus.textContent = 'PDF Document';
            } else if (response.stats.frames > 1) {
              pageStatus.textContent = `Multi-Frame (${response.stats.frames})`;
            } else {
              pageStatus.textContent = 'Ready';
            }
          } else if (response && response.isPdf) {
            pageStatus.textContent = 'Bridge Needed';
            previewCode.textContent = '# PDF Extractor Bridge is offline.\n# Option 1: Run backend/install_native_host.bat\n# Option 2: Run python backend/pdf_server.py';
          } else {
            pageStatus.textContent = 'Ready';
          }
        }
      );
    } catch (err) {
      console.warn('Could not inspect tab:', err);
      pageStatus.textContent = 'Ready';
    }
  }

  function triggerDownloadDirect(content, filename) {
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

  btnExport.addEventListener('click', async () => {
    if (!cachedYaml) {
      await loadLayoutStats();
    }

    if (!cachedYaml) {
      btnExport.textContent = 'No Data';
      return;
    }

    btnExport.disabled = true;
    btnExport.textContent = 'Saving...';

    try {
      triggerDownloadDirect(cachedYaml, defaultFilename);
      btnExport.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Saved!
      `;
      setTimeout(() => {
        btnExport.disabled = false;
        btnExport.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Save Structured YAML
        `;
      }, 2500);
    } catch (err) {
      console.error('Export failed:', err);
      btnExport.disabled = false;
      btnExport.textContent = 'Export Failed';
    }
  });

  btnCopy.addEventListener('click', async () => {
    if (!cachedYaml && activeTab && activeTab.id) {
      await loadLayoutStats();
    }

    if (cachedYaml) {
      await navigator.clipboard.writeText(cachedYaml);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = '✓ Copied!';
      btnCopy.style.borderColor = 'var(--success)';
      setTimeout(() => {
        btnCopy.textContent = originalText;
        btnCopy.style.borderColor = 'var(--border)';
      }, 1500);
    }
  });

  btnPreview.addEventListener('click', () => {
    previewContainer.classList.toggle('hidden');
    if (!previewContainer.classList.contains('hidden')) {
      previewContainer.scrollIntoView({ behavior: 'smooth' });
    }
  });

  btnClosePreview.addEventListener('click', () => {
    previewContainer.classList.add('hidden');
  });
});
