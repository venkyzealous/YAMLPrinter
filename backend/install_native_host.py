#!/usr/bin/env python3
"""
Installer for YAML Printer Chrome Extension Native Messaging Host
Registers com.yamlprinter.pdf_extractor in Windows Registry for Google Chrome and Microsoft Edge.
"""

import sys
sys.dont_write_bytecode = True
import os
import json
import winreg

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HOST_NAME = "com.yamlprinter.pdf_extractor"
BAT_PATH = os.path.join(SCRIPT_DIR, "pdf_native_host.bat")
JSON_PATH = os.path.join(SCRIPT_DIR, f"{HOST_NAME}.json")

# Default deterministic extension IDs
KNOWN_EXT_IDS = [
    "egealfhapmcabmefaajdmlgbdjnbdnhb",
    "clbmcmklddcicmkmbakobdncdinegjfd"
]


def install():
    ext_ids = list(KNOWN_EXT_IDS)
    if len(sys.argv) > 1 and sys.argv[1] not in ext_ids:
        ext_ids.append(sys.argv[1])

    manifest_data = {
        "name": HOST_NAME,
        "description": "YAML Printer PDF Extractor Host",
        "path": BAT_PATH,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{eid}/" for eid in ext_ids
        ]
    }

    # Write manifest JSON
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)
    print(f"Created Native Messaging Host manifest: {JSON_PATH}")

    # Register in Windows Registry for Google Chrome & Microsoft Edge
    targets = [
        (winreg.HKEY_CURRENT_USER, rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"),
        (winreg.HKEY_CURRENT_USER, rf"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}")
    ]

    for root, subkey in targets:
        try:
            key = winreg.CreateKeyEx(root, subkey, 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, JSON_PATH)
            winreg.CloseKey(key)
            print(f"Registered registry key: HKCU\\{subkey} -> {JSON_PATH}")
        except Exception as e:
            print(f"Warning: Could not register HKCU\\{subkey}: {e}")

    print("\nNative Host successfully installed!")
    print(f"Allowed Extension IDs: {ext_ids}")


if __name__ == "__main__":
    install()
