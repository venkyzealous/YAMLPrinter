# Print to Structured Layout YAML - Chrome Extension & PDF Extractor

A Chrome Extension (Manifest V3) and Python backend pipeline that extracts the visible information, layout hierarchy, tables, infographics, links, and PDF documents into clean, standardized, AI-ready **Structured Layout YAML**.

---

## 🌟 Key Features

- **Direct PDF Structured Extraction (Right-Click Context Menu & Toolbar Popup)**:
  - Right-click any PDF opened in Chrome (`file:///...` or `https://...`) and select **Print to Structured Layout YAML** to extract and download standardized structured YAML with coordinates and hierarchy.
  - Powered by Python (`pymupdf` / `PyYAML`) via Chrome Native Messaging (`com.yamlprinter.pdf_extractor`) or zero-config local HTTP bridge (`pdf_server.py`).
  - Automatically deduplicates Chrome print shadow artifacts (e.g. CSS `text-shadow` double-print).
  - Page-by-page layout with compact single-line bounding boxes `bbox: [x, y, w, h]`, font weights, font sizes, headings (`h1`-`h6`), tables (`headers`, `rows`), and links.
- **Multi-Frame & Embedded IFrame Aggregation**: Seamlessly traverses both top-level portal frames and embedded/sandboxed child iframes (such as EPAM OneHub Play applications, Salesforce embeds, or micro-frontends), stitching the entire application hierarchy into a cohesive structured YAML document with document-relative bounding boxes.
- **Print-Mode Multi-Tab Capture (`includeHiddenTabs: true`)**: Emulates `@media print` CSS conventions (`.step[hidden] { display: block !important }`) to extract all inactive and active tab panels (e.g. `role="tabpanel"`, `.step`, `.tab-pane`), ensuring AI receives the complete multi-tab playbook instead of only the active tab.
- **Visible-Only Intelligence & Noise Purging**: Eliminates decorative background elements, tracking scripts, raw SVG path geometry, SEO meta tags, and responsive stylesheets.
- **Visual Weight & Hierarchy**: Automatically tags heading levels (`h1`-`h6`), computed font weights (bold), font sizes, and reading order based on rendered layout.
- **Spatial Coordinates (`bbox`)**: Captures bounding boxes as token-efficient compact arrays `[x, y, width, height]` so LLMs understand layout adjacency, column alignment, and graphic positions.
- **Infographics & Timelines**: Automatically detects timeline nodes, milestone sequences (`.flow` / `.flow-stage`), and marker-label relationships, structuring them into cohesive timeline groups.
- **Tabular Data Recognition**: Converts HTML and PDF tables into clean 2D tabular YAML structures with headers and rows.
- **Hyperlink & Context Preservation**: Extracts outbound links associated with paragraphs, list items, and actionable anchors.
- **Native Save File Picker**: Integrates with the modern File System Access API (`window.showSaveFilePicker()`) with fallback to Chrome's native save dialog.

---

## 📂 Project Architecture

```
YAMLPrinter/
├── manifest.json                  # Chrome Manifest V3 declaration with fixed key & native messaging
├── background.js                  # Background service worker (Multi-frame, PDF routing & context menu)
├── extractor.js                   # DOM traversal, layout analysis, timeline detection & iframe handler
├── yaml.js                        # Standards-compliant YAML 1.2 serializer (zero external dependencies)
├── content.js                     # Content script handling file picker and toast UI
├── popup.html                     # Toolbar popup interface
├── popup.css                      # Styling for toolbar popup
├── popup.js                       # Controller for toolbar popup & multi-frame / PDF live preview
├── pdf_extractor.py               # Python PyMuPDF layout & table extractor to Structured YAML
├── pdf_native_host.py             # Native Messaging Host communicating over length-prefixed stdin/stdout
├── pdf_native_host.bat            # Windows launcher for Native Messaging Host
├── install_native_host.py         # Registers host in HKCU\Software\Google\Chrome\NativeMessagingHosts
├── install_native_host.bat        # One-click Windows installer batch script
├── com.yamlprinter.pdf_extractor.json # Chrome Native Messaging Host declaration
├── pdf_server.py                  # Local HTTP fallback bridge server (port 8765)
├── test_page.html                 # Comprehensive test sandbox with embedded iframes, timelines & forms
├── test_yaml.js                   # Automated unit test for YAML serializer
└── icons/                         # Extension icons (16px, 48px, 128px)
```

---

## 🚀 Setup & Reload in Chrome

### 1. Register Native Messaging Host (One-Time Setup for PDFs)
Double-click [`install_native_host.bat`](file:///c:/Users/Venkatesh_Jagannatha/OneDrive%20-%20EPAM/Project/ThomsonReuters/AIWorkspace/YAMLPrinter/install_native_host.bat) or run:
```powershell
python install_native_host.py
```
*(This sets the Windows Registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.yamlprinter.pdf_extractor` so Chrome can launch the Python extractor on-demand when you right-click any PDF).*

### 2. Reload the Chrome Extension
1. In Chrome, go to `chrome://extensions/`.
2. Locate **Print to Structured Layout YAML** and click the **Reload** (circular arrow) button.
   *(Or if loading for the first time, turn on "Developer mode" and click "Load unpacked", choosing the `YAMLPrinter` folder).*
3. To allow extracting local PDFs opened from your hard drive (`file:///...`), click **Details** on the extension card and toggle **Allow access to file URLs** to ON.

### 3. Usage
- **For PDFs**: Open any PDF in Chrome (e.g. `file:///C:/path/document.pdf` or any online PDF). Right-click anywhere and select **Print to Structured Layout YAML** (or open the toolbar popup and click "Save Structured YAML"). Chrome will extract the document layout and prompt you to save `<title>-layout.yaml`.
- **For Web Pages**: Right-click anywhere on any web page (or multi-frame EPAM OneHub Play application) and select **Print to Structured Layout YAML**.
