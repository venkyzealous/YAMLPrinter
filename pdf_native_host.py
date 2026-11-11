#!/usr/bin/env python3
"""
Chrome Native Messaging Host for YAML Printer
Exchanges length-prefixed JSON with Chrome extension over stdin/stdout.
Processes PDF extraction requests using PDFLayoutExtractor.
"""

import sys
sys.dont_write_bytecode = True
import os
import struct
import json
import datetime
import traceback

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pdf_extractor import extract_pdf_to_yaml


def log_host(msg):
    try:
        log_path = os.path.join(SCRIPT_DIR, "host.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass


def read_message():
    """Read a length-prefixed JSON message from stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    message_length = struct.unpack("@I", raw_length)[0]
    message_bytes = sys.stdin.buffer.read(message_length)
    if len(message_bytes) < message_length:
        return None
    return json.loads(message_bytes.decode("utf-8"))


def send_message(message_dict):
    """Send a length-prefixed JSON message to stdout."""
    encoded_content = json.dumps(message_dict, ensure_ascii=False).encode("utf-8")
    length_prefix = struct.pack("@I", len(encoded_content))
    sys.stdout.buffer.write(length_prefix)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()


def main():
    log_host("--- Host process started ---")
    while True:
        try:
            msg = read_message()
            if msg is None:
                log_host("EOF reached on stdin. Exiting.")
                break

            log_host(f"Received action: {msg.get('action')}, url: {msg.get('url', msg.get('path'))}")

            target = msg.get("path") or msg.get("url")
            if not target:
                send_message({
                    "success": False,
                    "error": "No URL or file path provided"
                })
                continue

            yaml_str, filename = extract_pdf_to_yaml(target)
            log_host(f"Extraction successful: filename={filename}, yaml_bytes={len(yaml_str)}")

            send_message({
                "success": True,
                "yaml": yaml_str,
                "filename": filename,
                "source": target
            })

        except Exception as e:
            err_trace = traceback.format_exc()
            log_host(f"ERROR: {str(e)}\n{err_trace}")
            send_message({
                "success": False,
                "error": str(e),
                "trace": err_trace
            })
            break


if __name__ == "__main__":
    main()
