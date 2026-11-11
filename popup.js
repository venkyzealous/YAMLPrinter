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
            previewCode.textContent = '# PDF Extractor Bridge is offline.\n# Option 1: Run install_native_host.bat\n# Option 2: Run python pdf_server.py';
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

  btnExport.addEventListener('click', async () => {
    if (!activeTab || !activeTab.id) return;

    btnExport.disabled = true;
    btnExport.textContent = 'Saving...';

    try {
      chrome.runtime.sendMessage(
        {
          action: 'TRIGGER_COMPILED_EXPORT',
          tabId: activeTab.id
        },
        response => {
          btnExport.disabled = false;
          if (response && response.success) {
            btnExport.innerHTML = `
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Export Triggered
            `;
            setTimeout(() => window.close(), 800);
          } else {
            btnExport.textContent = 'Export Failed';
            pageStatus.textContent = (response && response.error) ? response.error : 'Export Failed';
          }
        }
      );
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
