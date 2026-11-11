#!/usr/bin/env python3
"""
Lightweight Local HTTP Bridge Server for YAML Printer
Provides a fallback HTTP API for the Chrome extension when Native Messaging is not available.

Endpoints:
- GET  /ping    : Health check
- POST /extract : Accepts {"url": "..."} or {"path": "..."}, returns structured YAML
"""

import sys
sys.dont_write_bytecode = True
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pdf_extractor import extract_pdf_to_yaml

PORT = 8765


class PDFHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(200)

    def do_GET(self):
        if self.path == "/ping":
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"status": "ok", "service": "yaml-printer-pdf"}).encode("utf-8"))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode("utf-8"))

    def do_POST(self):
        if self.path == "/extract":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body) if body else {}

                target = payload.get("path") or payload.get("url")
                if not target:
                    self._set_cors_headers(400)
                    self.wfile.write(json.dumps({"success": False, "error": "No url or path supplied"}).encode("utf-8"))
                    return

                yaml_str, filename = extract_pdf_to_yaml(target)
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({
                    "success": True,
                    "yaml": yaml_str,
                    "filename": filename,
                    "source": target
                }).encode("utf-8"))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode("utf-8"))

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[PDF Server] {self.address_string()} - {args[0]} {args[1]}\n")


def run():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, PDFHandler)
    print(f"[PDF Server] Running on http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[PDF Server] Stopped.")


if __name__ == "__main__":
    run()
