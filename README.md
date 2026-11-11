# Print to Structured Layout YAML - Chrome Extension & PDF Extractor

A Chrome Extension (Manifest V3) and Python backend pipeline that extracts visible hierarchy, tables, infographics, links, and PDF documents into clean, standardized, AI-ready **Structured Layout YAML**.

---

## 📂 Project Architecture

```
YAMLPrinter/
├── extension/                     <-- LOAD THIS IN CHROME (chrome://extensions -> Load unpacked)
│   ├── manifest.json              # Chrome Manifest V3 declaration
│   ├── background.js              # Service worker (multi-frame aggregator, PDF routing)
│   ├── extractor.js               # Webpage DOM traversal & layout extraction
│   ├── content.js                 # In-page toast & save dialog coordinator
│   ├── yaml.js                    # Zero-dependency YAML 1.2 serializer
│   ├── popup.html                 # Toolbar popup interface
│   ├── popup.css                  # Toolbar popup styling
│   ├── popup.js                   # Toolbar popup controller
│   ├── test_page.html             # Multi-frame & component test sandbox
│   ├── test_yaml.js               # Serializer unit tests
│   └── icons/                     # Extension icons (16px, 48px, 128px)
│
├── backend/                       <-- PYTHON NATIVE MESSAGING HOST & ENGINE (Isolated from Chrome)
│   ├── pdf_extractor.py           # PyMuPDF PDF layout & table extraction engine
│   ├── pdf_native_host.py         # Chrome Native Messaging Host (stdio protocol)
│   ├── pdf_native_host.bat        # Windows launcher for host (bytecode-suppressed)
│   ├── install_native_host.py     # Registry installer for Chrome & Edge
│   ├── install_native_host.bat    # 1-click Windows installer
│   ├── com.yamlprinter.pdf_extractor.json # Native Host manifest
│   └── pdf_server.py              # Zero-config local HTTP bridge (port 8765)
│
├── output/                        <-- Extracted YAML files
└── README.md
```

> [!NOTE]
> By keeping the Chrome Extension in `extension/` and the Python engine in `backend/`, Chrome will **never** encounter `__pycache__` or `.pyc` files when loading or reloading the unpacked extension.

---

## 🚀 Setup & Usage

### 1. Register Native Messaging Host (One-Time Setup)
Double-click [`backend/install_native_host.bat`](file:///c:/Users/Venkatesh_Jagannatha/OneDrive%20-%20EPAM/Project/ThomsonReuters/AIWorkspace/YAMLPrinter/backend/install_native_host.bat) or run:
```powershell
python backend/install_native_host.py
```
*(This sets the Windows Registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.yamlprinter.pdf_extractor` to point to `backend/com.yamlprinter.pdf_extractor.json`).*

### 2. Load Extension in Chrome
1. In Chrome, go to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. If previously loaded pointing to `YAMLPrinter`, click **Remove**.
4. Click **Load unpacked** and select the [`extension/`](file:///c:/Users/Venkatesh_Jagannatha/OneDrive%20-%20EPAM/Project/ThomsonReuters/AIWorkspace/YAMLPrinter/extension) folder:
   ```
   c:\Users\Venkatesh_Jagannatha\OneDrive - EPAM\Project\ThomsonReuters\AIWorkspace\YAMLPrinter\extension
   ```
5. Click **Details** on the extension card and toggle **Allow access to file URLs** to **ON** (allows extracting local PDFs like `file:///C:/...`).

### 3. Usage
- **For PDFs**: Open any PDF in Chrome. Right-click anywhere and select **Print to Structured Layout YAML** (or click the toolbar icon and click **Save Structured YAML**). Chrome will prompt the Save dialog to save `<title>-layout.yaml`.
- **For Web Pages**: Right-click anywhere on any web page (or multi-frame portal application) and select **Print to Structured Layout YAML**.
