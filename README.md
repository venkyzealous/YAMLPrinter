# Print to Structured Layout YAML - Chrome Extension

A Chrome Extension (Manifest V3) that extracts the visible information, visual formatting hierarchy, tables, infographics (such as timelines), hyperlinks, embedded iframes, and multi-tab structures from any web page and converts them into clean, standardized, AI-ready **Structured Layout YAML**.

---

## 🌟 Key Features

- **Multi-Frame & Embedded IFrame Aggregation**: Seamlessly traverses both top-level portal frames and embedded/sandboxed child iframes (such as EPAM OneHub Play applications, Salesforce embeds, or micro-frontends), stitching the entire application hierarchy into a cohesive structured YAML document with document-relative bounding boxes.
- **Print-Mode Multi-Tab Capture (`includeHiddenTabs: true`)**: Emulates `@media print` CSS conventions (`.step[hidden] { display: block !important }`) to extract all inactive and active tab panels (e.g. `role="tabpanel"`, `.step`, `.tab-pane`), ensuring AI receives the complete multi-tab playbook instead of only the active tab.
- **Visible-Only Intelligence & Noise Purging**: Eliminates decorative background elements, tracking scripts, raw SVG path geometry, SEO meta tags, and responsive stylesheets.
- **Visual Weight & Hierarchy**: Automatically tags heading levels (`h1`-`h6`), computed font weights (bold), font sizes, and reading order based on rendered layout.
- **Spatial Coordinates (`bbox`)**: Captures bounding boxes as token-efficient compact arrays `[x, y, width, height]` so LLMs understand layout adjacency, column alignment, and graphic positions.
- **Infographics & Timelines**: Automatically detects timeline nodes, milestone sequences (`.flow` / `.flow-stage`), and marker-label relationships, structuring them into cohesive timeline groups.
- **Tabular Data Recognition**: Converts HTML tables into clean 2D tabular YAML structures with headers and rows.
- **Hyperlink & Context Preservation**: Extracts outbound links associated with paragraphs, list items, and actionable anchors.
- **Native Save File Picker**: Integrates with the modern File System Access API (`window.showSaveFilePicker()`) with fallback to Chrome's native save dialog.
- **Universal Triggers**:
  - **Right-Click Context Menu**: Right-click anywhere on any page and click `Print to Structured Layout YAML`.
  - **Toolbar Action Popup**: 1-click Save, instant live preview, copy-to-clipboard, and real-time element / token count estimators.

---

## 📂 Project Architecture

```
YAMLPrinter/
├── manifest.json       # Chrome Manifest V3 declaration
├── background.js       # Background service worker (Multi-frame aggregation & context menu)
├── extractor.js        # DOM traversal, layout analysis, timeline detection & iframe handler
├── yaml.js             # Standards-compliant YAML 1.2 serializer (zero external dependencies)
├── content.js          # Content script handling file picker and toast UI
├── popup.html          # Toolbar popup interface
├── popup.css           # Styling for toolbar popup
├── popup.js            # Controller for toolbar popup & multi-frame live preview
├── test_page.html      # Comprehensive test sandbox with embedded iframes, timelines & forms
├── test_yaml.js        # Automated unit test for YAML serializer
└── icons/              # Extension icons (16px, 48px, 128px)
```

---

## 🚀 How to Reload in Chrome

If you previously loaded the unpacked extension into Chrome:
1. In Chrome, go to `chrome://extensions/`.
2. Locate **Print to Structured Layout YAML**.
3. Click the **Reload** (circular arrow) icon on the extension card.
4. Navigate to your target page (e.g., `https://onehub.epam.com/play/04fb8f3e32f32000/`) and refresh the page once.
5. Right-click anywhere and select **Print to Structured Layout YAML** or click the extension toolbar icon.
