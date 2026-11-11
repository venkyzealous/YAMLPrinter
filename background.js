/**
 * Background Service Worker
 * Universal Context Menu, Multi-Frame Layout Aggregator, and Download Routing.
 */

importScripts('yaml.js');

const CONTEXT_MENU_ID = 'print-to-structured-layout-yaml';

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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab && tab.id) {
    try {
      await triggerCompiledExport(tab.id);
    } catch (err) {
      console.error('[YAML Printer] Context menu trigger error:', err);
    }
  }
});

// Central Multi-Frame Compiler
async function extractCompiledPageData(tabId, options = {}) {
  // 1. Inject yaml.js and extractor.js into ALL frames in the tab
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['yaml.js', 'extractor.js']
  });

  // 2. Execute extraction across every frame simultaneously
  const frameResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (opts) => {
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
    },
    args: [options]
  });

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

  // If top frame not explicitly identified, use first
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

  // Find all frame placeholders in the top layout
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

  // Match subframes to placeholders
  for (const placeholder of framePlaceholders) {
    if (placeholder.elements && placeholder.elements.length > 0) {
      // Already populated via same-origin access
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

  // Any remaining unmatched subframes are appended as top-level frame sections
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
  // Inject coordinator into top frame
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  const { data, yaml } = await extractCompiledPageData(tabId);
  const slug = (data.metadata.title || 'page')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'webpage';
  const filename = `${slug}-layout.yaml`;

  // Send compiled YAML to top frame for File System Access Picker
  chrome.tabs.sendMessage(
    tabId,
    {
      action: 'SAVE_COMPILED_YAML',
      content: yaml,
      filename: filename
    },
    response => {
      if (chrome.runtime.lastError || !response || !response.success) {
        // Fallback to Chrome downloads API with saveAs picker dialog
        triggerDownloadSaveAs(yaml, filename);
      }
    }
  );
}

function triggerDownloadSaveAs(content, filename) {
  const dataUrl = 'data:text/yaml;charset=utf-8,' + encodeURIComponent(content);
  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
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

    extractCompiledPageData(tabId, message.options || {})
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'TRIGGER_COMPILED_EXPORT') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab specified' });
      return false;
    }

    triggerCompiledExport(tabId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'DOWNLOAD_YAML') {
    triggerDownloadSaveAs(message.content, message.filename);
    sendResponse({ success: true });
    return false;
  }
});
