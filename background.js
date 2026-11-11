/**
 * Background Service Worker
 * Universal Context Menu, Multi-Frame Layout Aggregator, PDF Native Bridge, and Download Routing.
 */

importScripts('yaml.js');

const CONTEXT_MENU_ID = 'print-to-structured-layout-yaml';
const NATIVE_HOST_NAME = 'com.yamlprinter.pdf_extractor';
const LOCAL_HTTP_URL = 'http://127.0.0.1:8765/extract';

// Register Universal Right-Click Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Print to Structured Layout YAML',
      contexts: ['page', 'selection', 'link', 'editable', 'image', 'frame']
    });
  });
});

function isPdfUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch (e) {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.pdf');
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab && tab.id) {
    try {
      if (isPdfUrl(tab.url)) {
        await handlePdfExport(tab);
      } else {
        await triggerCompiledExport(tab.id);
      }
    } catch (err) {
      console.error('[YAML Printer] Context menu trigger error:', err);
    }
  }
});

// PDF Extraction Handlers
async function handlePdfExport(tab) {
  const targetUrl = tab.url;

  // 1. Try Chrome Native Messaging Host
  try {
    const nativeRes = await sendNativePdfRequest(targetUrl);
    if (nativeRes && nativeRes.success && nativeRes.yaml) {
      triggerDownloadSaveAs(nativeRes.yaml, nativeRes.filename || 'document-layout.yaml');
      return;
    }
  } catch (nativeErr) {
    console.warn('[YAML Printer] Native Messaging host attempt:', nativeErr.message);
  }

  // 2. Try Local Python Server fallback (http://127.0.0.1:8765)
  try {
    const httpRes = await fetch(LOCAL_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });
    if (httpRes.ok) {
      const data = await httpRes.json();
      if (data.success && data.yaml) {
        triggerDownloadSaveAs(data.yaml, data.filename || 'document-layout.yaml');
        return;
      }
    }
  } catch (httpErr) {
    console.warn('[YAML Printer] Local HTTP fallback attempt:', httpErr.message);
  }

  // 3. Prompt user with setup instructions if neither host is reachable
  const setupInstructions = [
    '# PDF Extractor Bridge Setup Required',
    '# ------------------------------------',
    '# To extract structured layout YAML from PDFs via right-click:',
    '#',
    '# Option 1: Run install_native_host.bat in YAMLPrinter to register Chrome Native Messaging.',
    '# Option 2: Run python pdf_server.py to start the local HTTP bridge on port 8765.',
    '#',
    `# Target PDF: ${targetUrl}`,
    `# Time: ${new Date().toISOString()}`
  ].join('\n');

  triggerDownloadSaveAs(setupInstructions, 'SETUP_PDF_EXTRACTOR.yaml');
}

function sendNativePdfRequest(url) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { action: 'EXTRACT_PDF', url: url },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

async function extractCompiledPdfData(url) {
  try {
    const res = await sendNativePdfRequest(url);
    if (res && res.success && res.yaml) {
      const slug = (res.filename || 'pdf').replace('-layout.yaml', '');
      return {
        data: {
          metadata: { title: slug, url: url, source: url, type: 'PDF' },
          layout: []
        },
        yaml: res.yaml,
        filename: res.filename,
        stats: {
          frames: 1,
          items: (res.yaml.match(/- type:/g) || []).length || 10
        }
      };
    }
  } catch (e) {}

  const httpRes = await fetch(LOCAL_HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url })
  });
  if (!httpRes.ok) {
    throw new Error('PDF Extractor server responded with error');
  }
  const json = await httpRes.json();
  if (json.success && json.yaml) {
    const slug = (json.filename || 'pdf').replace('-layout.yaml', '');
    return {
      data: {
        metadata: { title: slug, url: url, source: url, type: 'PDF' },
        layout: []
      },
      yaml: json.yaml,
      filename: json.filename,
      stats: {
        frames: 1,
        items: (json.yaml.match(/- type:/g) || []).length || 10
      }
    };
  }
  throw new Error(json.error || 'Failed to extract PDF layout');
}

// Central Multi-Frame Compiler for Webpages
async function extractCompiledPageData(tabId, options = {}) {
  const runExtractionInFrame = (opts) => {
    try {
      const extractor = new PageLayoutExtractor(opts || {});
      return {
        isTop: window.self === window.top,
        url: window.location.href,
        title: document.title || '',
        data: extractor.extract()
      };
    } catch (err) {
      return {
        error: err.message,
        url: window.location.href,
        isTop: window.self === window.top
      };
    }
  };

  let frameResults;
  try {
    // 1. Try injecting yaml.js and extractor.js into ALL frames in the tab
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['yaml.js', 'extractor.js']
    });

    // 2. Execute extraction across every frame simultaneously
    frameResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: runExtractionInFrame,
      args: [options]
    });
  } catch (multiFrameErr) {
    console.warn('[YAML Printer] Multi-frame injection failed, falling back to top frame only:', multiFrameErr.message);
    // Fallback: run on top frame only
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['yaml.js', 'extractor.js']
    });
    frameResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: runExtractionInFrame,
      args: [options]
    });
  }

  if (!frameResults || frameResults.length === 0) {
    throw new Error('No frames returned extraction data.');
  }

  // 3. Separate top frame from subframes
  let topResult = null;
  const subFrames = [];

  for (const item of frameResults) {
    const res = item.result;
    if (!res || res.error) continue;
    if (res.isTop || item.frameId === 0) {
      topResult = res;
    } else {
      subFrames.push(res);
    }
  }

  if (!topResult && frameResults[0].result) {
    topResult = frameResults[0].result;
  }

  if (!topResult || !topResult.data) {
    throw new Error('Failed to extract top-level page layout.');
  }

  // 4. Stitch subframe layouts into top frame tree
  const compiledData = stitchSubframesIntoTop(topResult.data, subFrames);
  const yamlText = stringifyYAML(compiledData);

  return {
    data: compiledData,
    yaml: yamlText,
    stats: {
      frames: frameResults.length,
      items: compiledData.layout.length
    }
  };
}

function stitchSubframesIntoTop(topData, subFrames) {
  if (!subFrames || subFrames.length === 0) return topData;

  const framePlaceholders = [];
  function findFrameNodes(nodes) {
    for (const node of nodes) {
      if (node.type === 'frame' || node.tag === 'iframe') {
        framePlaceholders.push(node);
      }
      if (node.elements && Array.isArray(node.elements)) {
        findFrameNodes(node.elements);
      }
    }
  }
  findFrameNodes(topData.layout);

  const matchedSubframes = new Set();

  for (const placeholder of framePlaceholders) {
    if (placeholder.elements && placeholder.elements.length > 0) {
      continue;
    }

    const placeholderUrl = (placeholder.url || '').toLowerCase();
    const matched = subFrames.find(sf => {
      if (matchedSubframes.has(sf)) return false;
      const sfUrl = (sf.url || '').toLowerCase();
      return (
        placeholderUrl.includes(sfUrl) ||
        sfUrl.includes(placeholderUrl) ||
        (placeholderUrl && sfUrl && placeholderUrl.split('?')[0] === sfUrl.split('?')[0])
      );
    });

    const targetSubframe = matched || (subFrames.length === 1 && !matchedSubframes.has(subFrames[0]) ? subFrames[0] : null);

    if (targetSubframe && targetSubframe.data && targetSubframe.data.layout) {
      matchedSubframes.add(targetSubframe);
      const offsetX = placeholder.bbox ? placeholder.bbox[0] : 0;
      const offsetY = placeholder.bbox ? placeholder.bbox[1] : 0;

      const offsetLayout = offsetCoordinates(targetSubframe.data.layout, offsetX, offsetY);
      placeholder.elements = offsetLayout;
      if (!placeholder.title && targetSubframe.title) {
        placeholder.title = targetSubframe.title;
      }
      if (!placeholder.url && targetSubframe.url) {
        placeholder.url = targetSubframe.url;
      }
    }
  }

  for (const sf of subFrames) {
    if (!matchedSubframes.has(sf) && sf.data && sf.data.layout && sf.data.layout.length > 0) {
      topData.layout.push({
        type: 'frame',
        title: sf.title || sf.data.metadata.title,
        url: sf.url || sf.data.metadata.url,
        elements: sf.data.layout
      });
    }
  }

  return topData;
}

function offsetCoordinates(nodes, offsetX, offsetY) {
  if (!nodes || !Array.isArray(nodes) || (offsetX === 0 && offsetY === 0)) {
    return nodes;
  }

  return nodes.map(node => {
    const copy = { ...node };
    if (copy.bbox && Array.isArray(copy.bbox) && copy.bbox.length === 4) {
      copy.bbox = [
        copy.bbox[0] + offsetX,
        copy.bbox[1] + offsetY,
        copy.bbox[2],
        copy.bbox[3]
      ];
    }
    if (copy.elements && Array.isArray(copy.elements)) {
      copy.elements = offsetCoordinates(copy.elements, offsetX, offsetY);
    }
    if (copy.items && Array.isArray(copy.items)) {
      copy.items = copy.items.map(item => {
        if (item.bbox && Array.isArray(item.bbox)) {
          return {
            ...item,
            bbox: [item.bbox[0] + offsetX, item.bbox[1] + offsetY, item.bbox[2], item.bbox[3]]
          };
        }
        return item;
      });
    }
    return copy;
  });
}

async function triggerCompiledExport(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js']
    });
  } catch (err) {
    console.warn('[YAML Printer] content.js injection notice:', err.message);
  }

  const { data, yaml } = await extractCompiledPageData(tabId);
  const slug = (data.metadata?.title || 'page')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'webpage';
  const filename = `${slug}-layout.yaml`;

  try {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'SAVE_COMPILED_YAML',
        content: yaml,
        filename: filename
      },
      response => {
        if (chrome.runtime.lastError || !response || !response.success) {
          triggerDownloadSaveAs(yaml, filename);
        }
      }
    );
  } catch (sendErr) {
    console.warn('[YAML Printer] tabs.sendMessage failed, falling back to direct download:', sendErr);
    triggerDownloadSaveAs(yaml, filename);
  }
}

function triggerDownloadSaveAs(content, filename) {
  const dataUrl = 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(content);
  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.warn('[YAML Printer] downloads.download failed:', chrome.runtime.lastError.message);
    }
  });
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_COMPILED_PAGE_YAML') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab specified' });
      return false;
    }

    chrome.tabs.get(tabId, async (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ success: false, error: 'Tab not found' });
        return;
      }

      if (isPdfUrl(tab.url)) {
        try {
          const res = await extractCompiledPdfData(tab.url);
          sendResponse({ success: true, isPdf: true, ...res });
        } catch (err) {
          sendResponse({ success: false, isPdf: true, error: err.message });
        }
        return;
      }

      extractCompiledPageData(tabId, message.options || {})
        .then(res => sendResponse({ success: true, ...res }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.action === 'TRIGGER_COMPILED_EXPORT') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab specified' });
      return false;
    }

    chrome.tabs.get(tabId, async (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ success: false, error: 'Tab not found' });
        return;
      }

      if (isPdfUrl(tab.url)) {
        handlePdfExport(tab)
          .then(() => sendResponse({ success: true, isPdf: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return;
      }

      triggerCompiledExport(tabId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.action === 'DOWNLOAD_YAML') {
    triggerDownloadSaveAs(message.content, message.filename);
    sendResponse({ success: true });
    return false;
  }
});
