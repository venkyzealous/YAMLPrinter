#!/usr/bin/env python3
"""
Structured Layout PDF Extractor
Converts PDF documents into AI-ready Structured Layout YAML, matching the schema
and conventions of the YAMLPrinter Chrome Extension.

Captures:
- Document metadata (title, author, creation date, total pages)
- Per-page dimensions and layouts
- Headings with hierarchy levels (h1-h6), font size, weight, and family
- Paragraphs with reading order and bounding boxes
- Shadow text deduplication (filters Chrome print text-shadow duplicates)
- Tabular data (headers, rows, table bounding boxes)
- Bulleted and numbered lists
- Hyperlinks and embedded URIs
- Image elements and bounding boxes
- Compact single-line flow style bounding boxes [x, y, w, h]
"""

import sys
sys.dont_write_bytecode = True
import os
import re
import ssl
import datetime
import urllib.parse
import urllib.request
from typing import Dict, Any, List, Optional, Tuple
import yaml
import pymupdf


class FlowList(list):
    """Marker class to serialize sequences in compact flow style [x, y, w, h]."""
    pass


class PDFLayoutExtractor:
    def __init__(self, options: Optional[Dict[str, Any]] = None):
        self.options = options or {}
        self.min_dimension = self.options.get("min_dimension", 2)

    def extract_from_path(self, file_path: str) -> Dict[str, Any]:
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        doc = pymupdf.open(file_path)
        return self._process_doc(doc, source=file_path)

    def extract_from_url_or_path(self, url_or_path: str) -> Dict[str, Any]:
        if url_or_path.startswith("file:///"):
            parsed = urllib.parse.urlparse(url_or_path)
            local_path = urllib.parse.unquote(parsed.path)
            if sys.platform == "win32" and local_path.startswith("/"):
                local_path = local_path[1:]
            return self.extract_from_path(local_path)
        elif url_or_path.startswith("http://") or url_or_path.startswith("https://"):
            req = urllib.request.Request(
                url_or_path,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            # Create permissive SSL context to handle corporate proxies / certs
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                pdf_bytes = resp.read()
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            return self._process_doc(doc, source=url_or_path)
        else:
            return self.extract_from_path(url_or_path)

    def _process_doc(self, doc: pymupdf.Document, source: str) -> Dict[str, Any]:
        meta = doc.metadata or {}
        title = meta.get("title") or os.path.splitext(os.path.basename(source))[0]
        if not title or title.strip() == "":
            title = "Document"

        pages_layout: List[Dict[str, Any]] = []

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_data = self._process_page(page, page_idx + 1)
            pages_layout.append(page_data)

        metadata = {
            "title": title.strip(),
            "url": source,
            "source_type": "PDF",
            "total_pages": len(doc),
            "author": meta.get("author") or None,
            "created_at": meta.get("creationDate") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "bbox_format": "[x, y, width, height] in PDF points (72 pt/inch)"
        }

        # Remove None values
        clean_metadata = {k: v for k, v in metadata.items() if v is not None}

        return {
            "metadata": clean_metadata,
            "pages": pages_layout
        }

    def _process_page(self, page: pymupdf.Page, page_num: int) -> Dict[str, Any]:
        rect = page.rect
        page_width = round(rect.width)
        page_height = round(rect.height)

        # 1. Extract Links
        links = self._extract_links(page)

        # 2. Extract Tables
        tables, table_rects = self._extract_tables(page)

        # 3. Extract Text Blocks & Spans
        text_page = page.get_text("dict")
        raw_blocks = text_page.get("blocks", [])

        # Filter out text inside tables to avoid duplicates
        elements: List[Dict[str, Any]] = []

        # Add detected tables
        for tbl in tables:
            elements.append(tbl)

        # Parse Text Blocks with Shadow Deduplication
        for block in raw_blocks:
            # Type 0 = text block, Type 1 = image block
            if block.get("type") == 0:
                block_bbox = block.get("bbox", (0, 0, 0, 0))
                # Skip if inside table
                if self._is_inside_any(block_bbox, table_rects):
                    continue

                parsed = self._parse_text_block(block, links)
                if parsed:
                    if isinstance(parsed, list):
                        elements.extend(parsed)
                    else:
                        elements.append(parsed)

            elif block.get("type") == 1:
                img_bbox = block.get("bbox", (0, 0, 0, 0))
                w = round(img_bbox[2] - img_bbox[0])
                h = round(img_bbox[3] - img_bbox[1])
                if w >= self.min_dimension and h >= self.min_dimension:
                    elements.append({
                        "type": "image",
                        "bbox": FlowList([round(img_bbox[0]), round(img_bbox[1]), w, h])
                    })

        # Sort elements by top-to-bottom reading order (y coordinate, then x)
        elements.sort(key=lambda el: (el.get("bbox", [0, 0])[1] if "bbox" in el else 0, el.get("bbox", [0, 0])[0] if "bbox" in el else 0))

        return {
            "page_number": page_num,
            "dimensions": FlowList([page_width, page_height]),
            "elements": elements
        }

    def _extract_links(self, page: pymupdf.Page) -> List[Dict[str, Any]]:
        links = []
        try:
            for link in page.get_links():
                uri = link.get("uri")
                from_rect = link.get("from")
                if uri and from_rect:
                    links.append({
                        "uri": uri,
                        "rect": (from_rect.x0, from_rect.y0, from_rect.x1, from_rect.y1)
                    })
        except Exception:
            pass
        return links

    def _extract_tables(self, page: pymupdf.Page) -> Tuple[List[Dict[str, Any]], List[Tuple[float, float, float, float]]]:
        tables = []
        table_rects = []
        try:
            tabs = page.find_tables()
            if tabs and tabs.tables:
                for tab in tabs.tables:
                    extracted = tab.extract()
                    if not extracted or len(extracted) == 0:
                        continue

                    t_bbox = tab.bbox
                    w = round(t_bbox[2] - t_bbox[0])
                    h = round(t_bbox[3] - t_bbox[1])
                    bbox = FlowList([round(t_bbox[0]), round(t_bbox[1]), w, h])
                    table_rects.append((t_bbox[0], t_bbox[1], t_bbox[2], t_bbox[3]))

                    headers = [str(c or "").strip() for c in extracted[0]]
                    rows = []
                    for row in extracted[1:]:
                        cleaned_row = [str(cell or "").strip().replace("\n", " ") for cell in row]
                        if any(cleaned_row):
                            rows.append(cleaned_row)

                    tables.append({
                        "type": "table",
                        "bbox": bbox,
                        "headers": FlowList(headers) if len(headers) <= 6 else headers,
                        "rows": [FlowList(r) if len(r) <= 6 else r for r in rows]
                    })
        except Exception:
            pass
        return tables, table_rects

    def _parse_text_block(self, block: Dict[str, Any], links: List[Dict[str, Any]]) -> Optional[Any]:
        lines = block.get("lines", [])
        if not lines:
            return None

        # Shadow Text Deduplication:
        # Chrome print frequently creates double-printed text shadow spans with negligible offset (< 1.5 pt)
        deduped_spans = []
        seen_spans = []

        for line in lines:
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                if not text:
                    continue

                sb = span.get("bbox", (0, 0, 0, 0))
                # Check for duplicate
                is_duplicate = False
                for seen_text, seen_bbox in seen_spans:
                    if text == seen_text and abs(sb[0] - seen_bbox[0]) < 2.0 and abs(sb[1] - seen_bbox[1]) < 2.0:
                        is_duplicate = True
                        break

                if not is_duplicate:
                    seen_spans.append((text, sb))
                    deduped_spans.append(span)

        if not deduped_spans:
            return None

        # Analyze dominant text styles
        full_text_parts = []
        max_size = 0.0
        total_flags = 0
        font_names = set()
        matched_links = []

        for span in deduped_spans:
            txt = span.get("text", "").strip()
            if txt:
                full_text_parts.append(txt)
            sz = span.get("size", 12.0)
            if sz > max_size:
                max_size = sz
            total_flags |= span.get("flags", 0)
            font_names.add(span.get("font", ""))

            # Check links
            s_bbox = span.get("bbox", (0, 0, 0, 0))
            for lk in links:
                if self._overlaps(s_bbox, lk["rect"]):
                    matched_links.append({"text": txt, "url": lk["uri"]})

        full_text = " ".join(full_text_parts).replace("  ", " ").strip()
        if not full_text:
            return None

        b_bbox = block.get("bbox", (0, 0, 0, 0))
        w = round(b_bbox[2] - b_bbox[0])
        h = round(b_bbox[3] - b_bbox[1])
        bbox = FlowList([round(b_bbox[0]), round(b_bbox[1]), w, h])

        is_bold = bool(total_flags & 2) or any("bold" in fn.lower() or "black" in fn.lower() for fn in font_names)
        weight = 700 if is_bold else 400
        size_pt = round(max_size)

        # Hierarchy Detection: Heading vs Paragraph vs List Item
        is_heading = False
        heading_level = 1

        if size_pt >= 24:
            is_heading = True
            heading_level = 1
        elif size_pt >= 19:
            is_heading = True
            heading_level = 2
        elif size_pt >= 15 and is_bold:
            is_heading = True
            heading_level = 3
        elif is_bold and len(full_text) < 80 and not full_text.endswith("."):
            is_heading = True
            heading_level = 4

        # List Item Detection (bullets • - * or numbered 1. 2.)
        list_match = re.match(r"^([•\-\*\u2022\u25cf\u25cb]|\d+[\.\)])\s+(.*)", full_text)
        if list_match and not is_heading:
            content = list_match.group(2).strip()
            item_node: Dict[str, Any] = {
                "type": "list_item",
                "text": content,
                "bbox": bbox
            }
            if matched_links:
                item_node["links"] = matched_links
            return item_node

        if is_heading:
            node: Dict[str, Any] = {
                "type": "heading",
                "level": heading_level,
                "text": full_text,
                "bbox": bbox,
                "style": {
                    "weight": weight,
                    "size": size_pt,
                    **({"is_bold": True} if is_bold else {})
                }
            }
            if matched_links:
                node["links"] = matched_links
            return node

        # Standard Paragraph
        node = {
            "type": "paragraph",
            "text": full_text,
            "bbox": bbox
        }
        if is_bold or size_pt > 14:
            node["style"] = {
                "weight": weight,
                "size": size_pt,
                **({"is_bold": True} if is_bold else {})
            }
        if matched_links:
            node["links"] = matched_links
        return node

    @staticmethod
    def _is_inside_any(box: Tuple[float, float, float, float], rects: List[Tuple[float, float, float, float]]) -> bool:
        bx0, by0, bx1, by1 = box
        for rx0, ry0, rx1, ry1 in rects:
            if bx0 >= rx0 - 2 and by0 >= ry0 - 2 and bx1 <= rx1 + 2 and by1 <= ry1 + 2:
                return True
        return False

    @staticmethod
    def _overlaps(b1: Tuple[float, float, float, float], b2: Tuple[float, float, float, float]) -> bool:
        return not (b1[2] < b2[0] or b1[0] > b2[2] or b1[3] < b2[1] or b1[1] > b2[3])


def _represent_flow_list(dumper, data):
    return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=True)


yaml.add_representer(FlowList, _represent_flow_list, Dumper=yaml.SafeDumper)


def extract_pdf_to_yaml(file_path_or_url: str) -> Tuple[str, str]:
    extractor = PDFLayoutExtractor()
    data = extractor.extract_from_url_or_path(file_path_or_url)
    title = data.get("metadata", {}).get("title", "document")
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:50] or "document"
    filename = f"{slug}-layout.yaml"
    yaml_str = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=120)
    return yaml_str, filename


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pdf_extractor.py <path-to-pdf-or-url>")
        sys.exit(1)

    yaml_out, out_filename = extract_pdf_to_yaml(sys.argv[1])
    print(yaml_out)
