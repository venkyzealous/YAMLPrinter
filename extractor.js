/**
 * Structured Layout DOM Extractor
 * Extracts visible webpage layout, hierarchy, infographics, tables, links,
 * accessible iframes, and multi-tab structures into an AI-ready structured tree.
 */

(() => {
  if (typeof globalThis.PageLayoutExtractor === 'function') {
    return;
  }

  class PageLayoutExtractor {
    constructor(options = {}) {
      this.options = {
        includeBBox: true,
        includeStyles: true,
        includeHiddenTabs: true, // Emulates @media print to capture all document tab panels
        minDimension: 2,
        parentOffset: [0, 0], // [offsetX, offsetY] for nested frame coordinates
        ...options
      };
      this.scrollX = window.scrollX || window.pageXOffset || 0;
      this.scrollY = window.scrollY || window.pageYOffset || 0;
      this.visitedElements = new WeakSet();
      this.isInsideTabPanel = false;
    }

    extract() {
      this.visitedElements = new WeakSet();
      const doc = document;
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scroll_width: Math.max(doc.documentElement.scrollWidth, doc.body ? doc.body.scrollWidth : 0),
        scroll_height: Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0)
      };

      const metadata = {
        title: doc.title || 'Untitled',
        url: window.location.href,
        viewport: [viewport.width, viewport.height],
        page_dimensions: [viewport.scroll_width, viewport.scroll_height],
        captured_at: new Date().toISOString(),
        bbox_format: '[x, y, width, height] relative to document'
      };

      const rootElements = this.findContentRoots(doc.body);
      const layout = [];

      for (const root of rootElements) {
        const extracted = this.processElement(root);
        if (extracted) {
          if (Array.isArray(extracted)) {
            layout.push(...extracted);
          } else {
            layout.push(extracted);
          }
        }
      }

      return {
        metadata,
        layout: this.pruneEmptyNodes(layout)
      };
    }

    extractFromRoot(rootElement) {
      if (!rootElement) return [];
      const layout = [];
      const children = Array.from(rootElement.children);
      for (const child of children) {
        const extracted = this.processElement(child);
        if (extracted) {
          if (Array.isArray(extracted)) {
            layout.push(...extracted);
          } else {
            layout.push(extracted);
          }
        }
      }
      return this.pruneEmptyNodes(layout);
    }

    findContentRoots(body) {
      if (!body) return [];

      // Find landmarks
      const landmarks = Array.from(
        body.querySelectorAll('header, nav, main, article, aside, footer, [role="main"], [role="banner"]')
      ).filter(el => this.isVisible(el) && !this.isInsideAnother(el, 'header, nav, main, article, aside, footer'));

      if (landmarks.length > 0) {
        return landmarks;
      }

      // Fallback: direct visible children
      return Array.from(body.children).filter(el => this.isVisible(el));
    }

    isInsideAnother(el, selector) {
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (parent.matches && parent.matches(selector)) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    isTabPanel(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      const role = el.getAttribute('role');
      if (role === 'tabpanel') return true;
      const className = (el.className || '').toString();
      return /\b(step|tab-pane|tabpanel|tab-content)\b/i.test(className);
    }

    getComputedStyleSafe(el) {
      try {
        const win = el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window;
        return win.getComputedStyle(el);
      } catch (e) {
        return window.getComputedStyle(el);
      }
    }

    isVisible(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

      const tagName = el.tagName.toUpperCase();
      // Non-visual and script/meta tags
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'OBJECT', 'EMBED'].includes(tagName)) {
        return false;
      }

      // Handle IFRAMEs explicitly
      if (tagName === 'IFRAME') {
        const rect = el.getBoundingClientRect();
        return rect.width >= this.options.minDimension && rect.height >= this.options.minDimension;
      }

      // Tab panels in print mode (emulating @media print .step[hidden] { display: block !important })
      if (this.options.includeHiddenTabs && this.isTabPanel(el)) {
        return true;
      }

      // If inside a tab panel that was unhidden for print capture
      if (this.isInsideTabPanel) {
        const style = this.getComputedStyleSafe(el);
        if (style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05) {
          return false;
        }
        return true;
      }

      // Standard visibility check
      if (typeof el.checkVisibility === 'function') {
        try {
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return false;
          }
        } catch (e) {}
      }

      const style = this.getComputedStyleSafe(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) < 0.05 ||
        el.getAttribute('aria-hidden') === 'true'
      ) {
        return false;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width < this.options.minDimension && rect.height < this.options.minDimension) {
        return false;
      }

      return true;
    }

    getBBox(el) {
      const rect = el.getBoundingClientRect();
      const offsetX = (this.options.parentOffset ? this.options.parentOffset[0] : 0) + this.scrollX;
      const offsetY = (this.options.parentOffset ? this.options.parentOffset[1] : 0) + this.scrollY;

      return [
        Math.round(rect.left + offsetX),
        Math.round(rect.top + offsetY),
        Math.round(rect.width),
        Math.round(rect.height)
      ];
    }

    getVisualWeight(el) {
      const style = this.getComputedStyleSafe(el);
      const weight = parseInt(style.fontWeight, 10) || (style.fontWeight === 'bold' ? 700 : 400);
      const size = Math.round(parseFloat(style.fontSize)) || 16;
      const isBold = weight >= 600;

      return {
        weight,
        size,
        ...(isBold ? { is_bold: true } : {})
      };
    }

    processElement(el) {
      if (!this.isVisible(el) || this.visitedElements.has(el)) return null;

      const tagName = el.tagName.toUpperCase();

      // 1. IFRAMES: Same-origin inspection & cross-origin placeholder creation
      if (tagName === 'IFRAME') {
        return this.extractIFrame(el);
      }

      // 2. Tab Panels: capture active & inactive sections (like print layout)
      if (this.isTabPanel(el)) {
        return this.extractTabPanel(el);
      }

      // 3. Tables
      if (tagName === 'TABLE') {
        const role = (el.getAttribute('role') || '').toLowerCase();
        if (role !== 'presentation' && role !== 'none') {
          this.markSubtreeVisited(el);
          return this.extractTable(el);
        }
      }

      // 4. Lists
      if (tagName === 'UL' || tagName === 'OL' || tagName === 'DL') {
        this.markSubtreeVisited(el);
        return this.extractList(el);
      }

      // 5. Headings
      if (/^H[1-6]$/.test(tagName) || el.getAttribute('role') === 'heading') {
        this.visitedElements.add(el);
        const text = el.innerText.trim();
        if (!text) return null;
        const links = Array.from(el.querySelectorAll('a[href]'))
          .filter(a => a.innerText.trim())
          .map(a => ({ text: a.innerText.trim(), url: a.href }));
        const level = /^H[1-6]$/.test(tagName)
          ? parseInt(tagName.substring(1), 10)
          : parseInt(el.getAttribute('aria-level'), 10) || 2;
        const node = {
          type: 'heading',
          level,
          text: text.replace(/\s+/g, ' '),
          bbox: this.getBBox(el),
          style: this.getVisualWeight(el)
        };
        if (links.length > 0) node.links = links;
        return node;
      }

      // 7. Blockquotes
      if (tagName === 'BLOCKQUOTE') {
        this.visitedElements.add(el);
        return {
          type: 'quote',
          text: el.innerText.trim(),
          bbox: this.getBBox(el)
        };
      }

      // 8. Code Blocks
      if (tagName === 'PRE') {
        this.visitedElements.add(el);
        return {
          type: 'code_block',
          text: el.innerText.trim(),
          bbox: this.getBBox(el)
        };
      }

      // 9. Form Controls / Interactive elements
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) {
        this.visitedElements.add(el);
        return this.extractInteractive(el);
      }

      // 10. Standalone Links
      if (tagName === 'A' && el.href) {
        const text = el.innerText.trim();
        if (text) {
          this.visitedElements.add(el);
          return {
            type: 'link',
            text,
            url: el.href,
            bbox: this.getBBox(el)
          };
        }
      }

      // 11. Paragraphs or generic text blocks
      if (tagName === 'P') {
        this.visitedElements.add(el);
        return this.extractParagraph(el);
      }

      // 12. SVGs: Extract visible text labels instead of path geometry
      if (tagName === 'SVG') {
        this.markSubtreeVisited(el);
        return this.extractSVG(el);
      }

      // 13. Container / Structural elements (div, section, article, main, header, footer, etc.)
      return this.extractContainer(el);
    }

    extractIFrame(iframe) {
      this.visitedElements.add(iframe);
      const bbox = this.getBBox(iframe);
      const src = iframe.src || iframe.getAttribute('src') || '';
      const title = iframe.title || iframe.getAttribute('aria-label') || '';

      let frameElements = [];
      let frameTitle = title;

      try {
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (doc && doc.body) {
          if (!frameTitle) frameTitle = doc.title || '';
          const subExtractor = new PageLayoutExtractor({
            ...this.options,
            parentOffset: [bbox[0], bbox[1]]
          });
          frameElements = subExtractor.findContentRoots(doc.body).map(r => subExtractor.processElement(r)).flat().filter(Boolean);
        }
      } catch (e) {
        // Cross-origin iframe: elements array will be populated by multi-frame stitcher
      }

      return {
        type: 'frame',
        tag: 'iframe',
        title: frameTitle || undefined,
        url: src || undefined,
        bbox,
        elements: frameElements
      };
    }

    extractTabPanel(panel) {
      this.visitedElements.add(panel);
      const bbox = this.getBBox(panel);
      const style = this.getComputedStyleSafe(panel);
      const isHidden = panel.hasAttribute('hidden') || style.display === 'none';

      // Temporarily flag that we are processing a tab panel so child visibility checks pass
      const prevInside = this.isInsideTabPanel;
      this.isInsideTabPanel = true;

      const children = Array.from(panel.children);
      const elements = [];
      for (const child of children) {
        const res = this.processElement(child);
        if (res) {
          if (Array.isArray(res)) elements.push(...res);
          else elements.push(res);
        }
      }

      this.isInsideTabPanel = prevInside;

      if (elements.length === 0) return null;

      return {
        type: 'tab_panel',
        id: panel.id || undefined,
        state: isHidden ? 'inactive' : 'active',
        bbox,
        elements
      };
    }

    extractParagraph(el) {
      const text = el.innerText.trim();
      if (!text) return null;

      const links = Array.from(el.querySelectorAll('a[href]'))
        .filter(a => a.innerText.trim())
        .map(a => ({
          text: a.innerText.trim(),
          url: a.href
        }));

      const node = {
        type: 'paragraph',
        text: text.replace(/\s+/g, ' '),
        bbox: this.getBBox(el)
      };

      if (links.length > 0) {
        node.links = links;
      }

      return node;
    }

    extractTable(table) {
      const bbox = this.getBBox(table);
      const captionEl = table.querySelector('caption');
      const caption = captionEl ? captionEl.innerText.trim() : undefined;

      const headers = [];
      table.querySelectorAll('th').forEach(th => {
        const txt = th.innerText.trim().replace(/\s+/g, ' ');
        if (txt) headers.push(txt);
      });

      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => {
          const links = Array.from(td.querySelectorAll('a[href]'))
            .filter(a => a.innerText.trim())
            .map(a => ({ text: a.innerText.trim(), url: a.href }));
          const text = td.innerText.trim().replace(/\s+/g, ' ');
          if (links.length > 0) {
            cells.push({ text, links });
          } else {
            cells.push(text);
          }
        });
        if (cells.length > 0) {
          rows.push(cells);
        }
      });

      return {
        type: 'table',
        ...(caption ? { caption } : {}),
        bbox,
        headers: headers.length > 0 ? headers : undefined,
        rows
      };
    }

    extractList(listEl) {
      const isOrdered = listEl.tagName.toUpperCase() === 'OL';
      const items = [];

      const liElements = Array.from(listEl.querySelectorAll(':scope > li'));
      for (const li of liElements) {
        const text = li.innerText.trim();
        if (!text) continue;

        const links = Array.from(li.querySelectorAll('a[href]'))
          .filter(a => a.innerText.trim())
          .map(a => ({ text: a.innerText.trim(), url: a.href }));

        const item = {
          text: text.replace(/\s+/g, ' '),
          bbox: this.getBBox(li)
        };
        if (links.length > 0) item.links = links;
        items.push(item);
      }

      return {
        type: isOrdered ? 'ordered_list' : 'list',
        bbox: this.getBBox(listEl),
        items
      };
    }

    extractInteractive(el) {
      const tagName = el.tagName.toUpperCase();
      const bbox = this.getBBox(el);

      if (tagName === 'BUTTON') {
        return {
          type: 'button',
          text: el.innerText.trim() || el.getAttribute('aria-label') || el.value || '',
          bbox,
          disabled: el.disabled || undefined
        };
      }

      if (tagName === 'INPUT') {
        const inputType = el.type || 'text';
        return {
          type: 'input',
          input_type: inputType,
          name: el.name || undefined,
          placeholder: el.placeholder || undefined,
          value: inputType === 'password' ? '***' : el.value || undefined,
          checked: el.checked || undefined,
          disabled: el.disabled || undefined,
          bbox
        };
      }

      if (tagName === 'SELECT') {
        const selectedOption = el.options[el.selectedIndex];
        return {
          type: 'select',
          name: el.name || undefined,
          selected: selectedOption ? selectedOption.text : undefined,
          bbox
        };
      }

      if (tagName === 'TEXTAREA') {
        return {
          type: 'textarea',
          placeholder: el.placeholder || undefined,
          value: el.value || undefined,
          bbox
        };
      }

      return null;
    }

    extractSVG(svg) {
      const textNodes = Array.from(svg.querySelectorAll('text, tspan'))
        .map(node => node.textContent.trim())
        .filter(t => t.length > 0);

      const titleEl = svg.querySelector('title');
      const title = titleEl ? titleEl.textContent.trim() : svg.getAttribute('aria-label') || undefined;

      if (!title && textNodes.length === 0) return null;

      return {
        type: 'graphic',
        tag: 'svg',
        bbox: this.getBBox(svg),
        label: title,
        labels_in_graphic: textNodes.length > 0 ? textNodes : undefined
      };
    }

    getContainerSemanticType(el, tagName) {
      const isSemantic = ['header', 'nav', 'main', 'article', 'aside', 'footer', 'section'].includes(tagName);
      if (isSemantic) return tagName;

      const role = (el.getAttribute('role') || '').toLowerCase();
      if (role === 'grid' || role === 'table') return 'grid';
      if (role === 'row') return 'row';
      if (role === 'cell' || role === 'gridcell') return 'cell';
      if (role === 'columnheader' || role === 'rowheader') return 'header';

      const className = (el.className || '').toString().toLowerCase();
      if (/\b(grid|matrix|board|spreadsheet)\b/.test(className)) return 'grid';
      if (/\b(card|tile|panel-box|action-card|item-card)\b/.test(className)) return 'card';
      if (/\b(row|table-row|grid-row)\b/.test(className)) return 'row';
      if (/\b(col|column|grid-col|table-cell|cell)\b/.test(className)) return 'column';
      if (/\b(badge|pill|tag|chip)\b/.test(className)) return 'badge';

      return 'section';
    }

    extractContainer(el) {
      const children = Array.from(el.children).filter(child => this.isVisible(child));
      const directText = this.getCleanDirectText(el);
      const tagName = el.tagName.toLowerCase();
      const containerType = this.getContainerSemanticType(el, tagName);
      const isSpecialType = containerType !== 'section';

      // Redundant wrapper elimination (only for plain non-semantic wrapper divs)
      if (children.length === 1 && !directText && !isSpecialType && !['header', 'nav', 'main', 'article', 'aside', 'footer', 'section'].includes(tagName)) {
        return this.processElement(children[0]);
      }

      const processedChildren = [];
      for (const child of children) {
        const res = this.processElement(child);
        if (res) {
          if (Array.isArray(res)) {
            processedChildren.push(...res);
          } else {
            processedChildren.push(res);
          }
        }
      }

      if (processedChildren.length === 0 && directText) {
        const links = Array.from(el.querySelectorAll('a[href]'))
          .filter(a => a.innerText.trim())
          .map(a => ({ text: a.innerText.trim(), url: a.href }));

        const block = {
          type: 'text_block',
          tag: tagName,
          text: directText,
          bbox: this.getBBox(el),
          style: this.getVisualWeight(el)
        };
        if (links.length > 0) block.links = links;
        return block;
      }

      if (processedChildren.length === 0) {
        return null;
      }

      const isSemantic = ['header', 'nav', 'main', 'article', 'aside', 'footer', 'section'].includes(tagName);

      if (isSemantic || isSpecialType || processedChildren.length > 1 || directText) {
        const node = {
          type: containerType,
          bbox: this.getBBox(el),
          ...(directText ? { direct_text: directText } : {}),
          elements: processedChildren
        };
        return node;
      }

      return processedChildren;
    }

    getCleanDirectText(el) {
      let text = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent;
        }
      }
      return text.replace(/\s+/g, ' ').trim();
    }

    markSubtreeVisited(el) {
      this.visitedElements.add(el);
      el.querySelectorAll('*').forEach(child => this.visitedElements.add(child));
    }

    pruneEmptyNodes(nodes) {
      if (!Array.isArray(nodes)) return nodes;
      const result = [];
      for (const node of nodes) {
        if (!node) continue;
        if (node.elements && Array.isArray(node.elements)) {
          node.elements = this.pruneEmptyNodes(node.elements);
          if (node.elements.length === 0 && !node.text && !node.direct_text && node.type !== 'frame') {
            continue;
          }
        }
        result.push(node);
      }
      return result;
    }
  }

  globalThis.PageLayoutExtractor = PageLayoutExtractor;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PageLayoutExtractor };
  }
})();
