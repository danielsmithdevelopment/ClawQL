#!/usr/bin/env python3
"""
Reference LangExtract HTTP sidecar ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)).

Default DEMO mode: regex grounding without cloud LLM calls.
Set LANGEXTRACT_MODE=live + GEMINI_API_KEY to call upstream langextract (optional pip dep).
"""
from __future__ import annotations

import json
import os
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

PORT = int(os.environ.get("PORT", "8090"))
ARTIFACTS_DIR = Path(os.environ.get("LANGEXTRACT_ARTIFACTS_DIR", "/tmp/langextract-artifacts"))
MODE = os.environ.get("LANGEXTRACT_MODE", "demo").strip().lower()
MODEL_ID = os.environ.get("LANGEXTRACT_MODEL_ID", "gemini-2.5-flash")


def find_span(text: str, needle: str) -> dict[str, int] | None:
    idx = text.find(needle)
    if idx < 0:
        return None
    return {"start": idx, "end": idx + len(needle)}


def demo_extract(body: dict[str, Any]) -> dict[str, Any]:
    text = str(body.get("text", ""))
    extractions: list[dict[str, Any]] = []

    wages = re.search(r"Box\s*1[^\d]*(\d[\d,]*\.\d{2})", text, re.I)
    if wages:
        span = find_span(text, wages.group(1))
        extractions.append(
            {
                "extraction_class": "wages",
                "extraction_text": wages.group(1),
                "attributes": {"box": "1"},
                "char_interval": span,
            }
        )

    name = re.search(r"Employee:\s*\n\s*Name:\s*([A-Z][A-Z .'-]+)", text, re.I)
    if name:
        value = name.group(1).strip()
        extractions.append(
            {
                "extraction_class": "employee_name",
                "extraction_text": value,
                "attributes": {},
                "char_interval": find_span(text, value),
            }
        )

    grounded = [e for e in extractions if e.get("char_interval")]
    result = {
        "ok": True,
        "provider": "langextract-sidecar",
        "model_id": "demo-heuristic-v1",
        "extractions": grounded,
        "artifact_paths": {},
    }

    if body.get("write_html"):
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        doc_id = body.get("doc_id") or str(uuid.uuid4())[:8]
        jsonl_path = ARTIFACTS_DIR / f"{doc_id}.jsonl"
        html_path = ARTIFACTS_DIR / f"{doc_id}.html"
        with jsonl_path.open("w", encoding="utf-8") as f:
            for row in grounded:
                f.write(json.dumps(row) + "\n")
        html = [
            "<!doctype html><html><head><meta charset=utf-8><title>LangExtract demo</title></head><body>",
            "<h1>LangExtract reference visualization (demo)</h1>",
            "<pre>",
            text.replace("&", "&amp;").replace("<", "&lt;"),
            "</pre><ul>",
        ]
        for e in grounded:
            span = e["char_interval"]
            html.append(
                f"<li><strong>{e['extraction_class']}</strong>: {e['extraction_text']} "
                f"<em>({span['start']}–{span['end']})</em></li>"
            )
        html.append("</ul></body></html>")
        html_path.write_text("".join(html), encoding="utf-8")
        result["artifact_paths"] = {
            "jsonl_path": str(jsonl_path),
            "html_path": str(html_path),
        }

    return result


def live_extract(body: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("LANGEXTRACT_API_KEY")
    if not api_key:
        return {"ok": False, "error": "LANGEXTRACT_MODE=live requires GEMINI_API_KEY or LANGEXTRACT_API_KEY"}

    try:
        import langextract as lx  # type: ignore
        from langextract import data as lx_data  # type: ignore
    except ImportError:
        return {
            "ok": False,
            "error": "langextract package not installed in image; use LANGEXTRACT_MODE=demo or rebuild with requirements.txt",
        }

    examples_in = body.get("examples") or []
    examples = []
    for ex in examples_in:
        extractions = [
            lx_data.Extraction(
                extraction_class=e["extraction_class"],
                extraction_text=e["extraction_text"],
                attributes=e.get("attributes") or {},
            )
            for e in ex.get("extractions", [])
        ]
        examples.append(lx_data.ExampleData(text=ex["text"], extractions=extractions))

    model_id = body.get("model_id") or MODEL_ID
    result = lx.extract(
        text_or_documents=body["text"],
        prompt_description=body.get("prompt_description") or "Extract structured entities with grounding.",
        examples=examples,
        model_id=model_id,
        api_key=api_key,
    )

    doc = result[0] if isinstance(result, list) else result
    extractions = []
    for ext in getattr(doc, "extractions", []) or []:
        interval = getattr(ext, "char_interval", None)
        extractions.append(
            {
                "extraction_class": getattr(ext, "extraction_class", "unknown"),
                "extraction_text": getattr(ext, "extraction_text", ""),
                "attributes": getattr(ext, "attributes", {}) or {},
                "char_interval": (
                    {"start": interval.start, "end": interval.end}
                    if interval is not None
                    else None
                ),
            }
        )

    grounded = [e for e in extractions if e.get("char_interval")]
    out: dict[str, Any] = {
        "ok": True,
        "provider": "langextract-sidecar",
        "model_id": model_id,
        "extractions": grounded,
        "artifact_paths": {},
    }

    if body.get("write_html"):
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        doc_id = body.get("doc_id") or str(uuid.uuid4())[:8]
        html_path = ARTIFACTS_DIR / f"{doc_id}.html"
        lx.io.save_html(doc, html_path)  # type: ignore[attr-defined]
        jsonl_path = ARTIFACTS_DIR / f"{doc_id}.jsonl"
        with jsonl_path.open("w", encoding="utf-8") as f:
            for row in grounded:
                f.write(json.dumps(row) + "\n")
        out["artifact_paths"] = {"jsonl_path": str(jsonl_path), "html_path": str(html_path)}

    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True, "mode": MODE, "model_id": MODEL_ID})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/extract":
            self._json(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "invalid JSON body"})
            return
        if not body.get("text"):
            self._json(400, {"ok": False, "error": "text is required"})
            return

        if MODE == "live":
            payload = live_extract(body)
        else:
            payload = demo_extract(body)
        code = 200 if payload.get("ok") else 502
        self._json(code, payload)


if __name__ == "__main__":
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"langextract-http listening on :{PORT} mode={MODE}")
    server.serve_forever()
