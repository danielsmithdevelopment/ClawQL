#!/usr/bin/env python3
"""
Local Privacy Filter HTTP sidecar ([#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)).

Default DEMO mode: regex heuristics for the OpenAI Privacy Filter taxonomy — **no model download**,
**no cloud calls**. LIVE mode loads `openai/privacy-filter` (or a local checkpoint) via transformers
on-operator hardware only.

This is an additional backup layer after Microsoft Presidio on ClawQL gateway paths.
"""
from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

PORT = int(os.environ.get("PORT", "8091"))
MODE = os.environ.get("PRIVACY_FILTER_MODE", "demo").strip().lower()
MODEL_ID = os.environ.get(
    "PRIVACY_FILTER_MODEL",
    os.environ.get("CLAWQL_PRIVACY_FILTER_MODEL", "openai/privacy-filter"),
).strip()
DEVICE = os.environ.get("PRIVACY_FILTER_DEVICE", "cpu").strip()
HF_CACHE = os.environ.get("HF_HOME") or os.environ.get("TRANSFORMERS_CACHE") or ""

_classifier = None


def demo_spans(text: str) -> list[dict[str, Any]]:
    """Heuristic spans aligned to Privacy Filter's 8 categories (CI / smoke)."""
    patterns: list[tuple[str, re.Pattern[str]]] = [
        ("secret", re.compile(r"\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b")),
        ("private_email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
        ("private_phone", re.compile(r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b")),
        ("account_number", re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{9,17}\b")),
        ("private_url", re.compile(r"https?://[^\s]+@[^\s]+", re.I)),
        ("private_date", re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}/(?:19|20)\d{2}\b")),
        ("private_address", re.compile(r"\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive)\b")),
        ("private_person", re.compile(r"\b(?:Name|Employee|Patient|Borrower):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)\b")),
    ]
    spans: list[dict[str, Any]] = []
    occupied: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        for a, b in occupied:
            if start < b and end > a:
                return True
        return False

    for label, pat in patterns:
        for m in pat.finditer(text):
            if m.lastindex:
                start, end = m.start(1), m.end(1)
            else:
                start, end = m.start(), m.end()
            if overlaps(start, end):
                continue
            occupied.append((start, end))
            spans.append(
                {
                    "entity_group": label,
                    "start": start,
                    "end": end,
                    "score": 1.0,
                }
            )
    spans.sort(key=lambda s: s["start"])
    return spans


def apply_spans(text: str, spans: list[dict[str, Any]]) -> str:
    out = text
    for s in sorted(spans, key=lambda x: int(x["start"]), reverse=True):
        start, end = int(s["start"]), int(s["end"])
        label = str(s.get("entity_group") or s.get("label") or "PII").upper()
        out = out[:start] + f"[{label}]" + out[end:]
    return out


def get_live_classifier():
    global _classifier
    if _classifier is not None:
        return _classifier
    # Local weights only — transformers downloads from HF Hub into operator cache (no OpenAI API).
    from transformers import pipeline  # type: ignore

    kwargs: dict[str, Any] = {
        "task": "token-classification",
        "model": MODEL_ID,
        "aggregation_strategy": "simple",
    }
    if DEVICE:
        kwargs["device"] = DEVICE if DEVICE != "cpu" else -1
    _classifier = pipeline(**kwargs)
    return _classifier


def live_spans(text: str) -> list[dict[str, Any]]:
    clf = get_live_classifier()
    raw = clf(text)
    spans: list[dict[str, Any]] = []
    for item in raw:
        group = item.get("entity_group") or item.get("entity") or "PII"
        if isinstance(group, str) and group.startswith(("B-", "I-", "E-", "S-")):
            group = group.split("-", 1)[1]
        spans.append(
            {
                "entity_group": str(group).lower(),
                "start": int(item["start"]),
                "end": int(item["end"]),
                "score": float(item.get("score", 0.0)),
            }
        )
    return spans


def redact(text: str) -> dict[str, Any]:
    if MODE == "live":
        spans = live_spans(text)
        mode = "live"
    else:
        spans = demo_spans(text)
        mode = "demo"
    masked = apply_spans(text, spans)
    return {
        "ok": True,
        "text": masked,
        "spans": spans,
        "mode": mode,
        "local": True,
        "model_id": MODEL_ID if mode == "live" else "demo-heuristic-v1",
        "provider": "privacy-filter-sidecar",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep smoke logs quiet unless debugging.
        if os.environ.get("PRIVACY_FILTER_DEBUG") == "1":
            super().log_message(fmt, *args)

    def _json(self, code: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] in ("/health", "/"):
            self._json(
                200,
                {
                    "ok": True,
                    "mode": MODE,
                    "model_id": MODEL_ID,
                    "local": True,
                    "device": DEVICE,
                    "hf_cache": bool(HF_CACHE),
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/redact":
            self._json(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "invalid JSON"})
            return
        text = str(body.get("text", ""))
        try:
            self._json(200, redact(text))
        except Exception as e:  # noqa: BLE001 — surface to gateway failure policy
            self._json(500, {"ok": False, "error": str(e), "local": True})


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(
        f"[privacy-filter-http] listening on :{PORT} mode={MODE} model={MODEL_ID} local=true",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
