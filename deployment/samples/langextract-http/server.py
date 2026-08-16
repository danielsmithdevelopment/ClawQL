#!/usr/bin/env python3
"""
Reference LangExtract HTTP sidecar ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)).

Default DEMO mode: regex grounding without cloud LLM calls.
LIVE mode backends (LANGEXTRACT_BACKEND):
  - openrouter (default) — OPENROUTER_API_KEY + OpenRouter-compatible model id
  - ollama — local OLLAMA_BASE_URL, no cloud key
  - openai_compatible — OPENAI_API_BASE_URL + OPENAI_API_KEY (any OpenAI-compatible endpoint)
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
BACKEND = os.environ.get("LANGEXTRACT_BACKEND", "openrouter").strip().lower()
MODEL_ID = os.environ.get("LANGEXTRACT_MODEL_ID", "deepseek/deepseek-chat")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENAI_COMPAT_BASE_URL = os.environ.get("OPENAI_API_BASE_URL", "").rstrip("/")


def find_span(text: str, needle: str) -> dict[str, int] | None:
    idx = text.find(needle)
    if idx < 0:
        return None
    return {"start": idx, "end": idx + len(needle)}


def demo_extract(body: dict[str, Any]) -> dict[str, Any]:
    text = str(body.get("text", ""))
    preset = str(body.get("schema_preset") or "").strip().lower()
    if preset in {
        "credit_facility_matter",
        "credit_facility",
        "harvey_matter",
        "firm_knowledge_matter",
        "matter_general",
    }:
        return demo_extract_credit_facility(body)

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
        "backend": "demo",
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


def _append_bool(
    extractions: list[dict[str, Any]], text: str, cls: str, needle: str, value: str
) -> None:
    span = find_span(text, needle)
    if not span:
        return
    extractions.append(
        {
            "extraction_class": cls,
            "extraction_text": value,
            "attributes": {"evidence": needle[:120]},
            "char_interval": span,
        }
    )


def demo_extract_credit_facility(body: dict[str, Any]) -> dict[str, Any]:
    """Schema-guided Matter fill for Harvey LAB credit agreements (demo grounding).

    Live LangExtract uses the same extraction_class names via examples; demo mode
    grounds with deterministic patterns so the IDP→DuckDB path can be tested
    offline without an LLM key.
    """
    text = str(body.get("text", ""))
    extractions: list[dict[str, Any]] = []

    # deal_date — prefer "Dated as of …" / "dated as of …"
    m = re.search(
        r"(?:Dated|dated)\s+as\s+of\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})",
        text,
    )
    if m:
        extractions.append(
            {
                "extraction_class": "deal_date",
                "extraction_text": m.group(1).replace(",", ""),
                "attributes": {},
                "char_interval": find_span(text, m.group(1)),
            }
        )

    # facility_amount_usd — aggregate principal in the opening pages
    head = text[:12000]
    amt = re.search(
        r"(?:aggregate\s+principal\s+amount\s+of\s+(?:up\s+to\s+)?|"
        r"facility\s+in\s+an\s+aggregate\s+(?:principal\s+)?amount\s+of\s+(?:up\s+to\s+)?)"
        r"\$\s*([0-9][0-9,]*)",
        head,
        re.I,
    )
    if not amt:
        amt = re.search(
            r"\$\s*([0-9][0-9,]{6,})\s+Senior\s+Secured\s+Term\s+Loan",
            head,
            re.I,
        )
    if amt:
        extractions.append(
            {
                "extraction_class": "facility_amount_usd",
                "extraction_text": amt.group(1),
                "attributes": {"currency": "USD"},
                "char_interval": find_span(text, amt.group(1)),
            }
        )

    # has_incremental_facility
    inc = re.search(
        r"(\"Incremental\s+Facility\"|Incremental\s+Facility\s+means|"
        r"incremental\s+term\s+loan\s+facility)",
        text,
        re.I,
    )
    if inc:
        _append_bool(
            extractions, text, "has_incremental_facility", inc.group(1), "true"
        )

    # has_revolving_facility — establish language (not Existing-only)
    rev = re.search(
        r"(?:provide|providing|establish|establishing|"
        r"request(?:ed|s)?\s+that\s+the\s+lenders?\s+provide)\s+"
        r"(?:a\s+|an\s+|the\s+)?(?:senior\s+secured\s+)?"
        r"(revolving\s+credit\s+facility)",
        text,
        re.I,
    )
    if not rev:
        rev = re.search(
            r"(\$[0-9,]+\s+(?:Senior\s+Secured\s+)?Revolving\s+Credit\s+Facility)",
            text,
            re.I,
        )
    if rev:
        _append_bool(
            extractions, text, "has_revolving_facility", rev.group(1), "true"
        )

    # mentions_springing_lien
    lien = re.search(r"(springing\s+lien)", text, re.I)
    if lien:
        _append_bool(
            extractions, text, "mentions_springing_lien", lien.group(1), "true"
        )

    # is_secured — textual grant language (path signals also applied upstream)
    sec = re.search(
        r"(grant\s+of\s+security\s+interest|Security\s+Agreement|"
        r"first[- ]priority\s+(?:lien|security\s+interest))",
        text,
        re.I,
    )
    if sec:
        _append_bool(extractions, text, "is_secured", sec.group(1), "true")

    # has_adjusted_ebitda_addbacks (011) — explicit add-backs or structured
    # "Adjusted EBITDA means … plus, to the extent deducted …"
    ebitda = re.search(
        r"(add[- ]?backs?\s+(?:to\s+)?(?:Consolidated\s+)?(?:Adjusted\s+)?EBITDA|"
        r"Adjusted\s+EBITDA.{0,120}?add[- ]?backs?|"
        r"EBITDA.{0,80}?add[- ]?backs?|"
        r"add[- ]?backs?.{0,80}?EBITDA|"
        r"customary\s+add[- ]?backs?|"
        r"addbacks?\s+and\s+adjustments|"
        r"include\s+appropriate\s+add[- ]?backs?|"
        r"subject\s+to\s+certain\s+customary\s+addbacks?|"
        r"Consolidated\s+Adjusted\s+EBITDA.{0,200}?add[- ]?backs?|"
        r"[\"“]?Adjusted\s+EBITDA[\"”]?\s+means.{0,800}?plus,?\s+to\s+the\s+extent\s+deducted)",
        text,
        re.I | re.S,
    )
    if ebitda:
        _append_bool(
            extractions,
            text,
            "has_adjusted_ebitda_addbacks",
            ebitda.group(1)[:80],
            "true",
        )

    # is_covenant_lite (014) — market label + TLB / institutional term loan
    cov = re.search(r"(covenant[- ]lite)", text, re.I)
    tlb = re.search(
        r"(Term\s+Loan\s+B|\bTLB\b|institutional\s+term\s+loan)",
        text,
        re.I,
    )
    if cov and tlb:
        _append_bool(
            extractions, text, "is_covenant_lite", cov.group(1), "true"
        )

    # has_mfn_in_credit_agreement (013/015) — literal MFN or accordion
    # same-pricing / equal-treatment (Lumos 1008 has no "MFN" string).
    # Caller must restrict to execution_credit docs (never SAFE).
    mfn = re.search(
        r"(\bMFN\b|Most\s+Favored\s+Nation|MFN\s+Provision|"
        r"same\s+pricing\s*\([^)]*(?:Applicable\s+Rate|yield)|"
        r"Equal\s+Treatment|"
        r"Accordion\s+Commitment.{0,400}?same\s+pricing)",
        text,
        re.I | re.S,
    )
    if mfn:
        _append_bool(
            extractions,
            text,
            "has_mfn_in_credit_agreement",
            mfn.group(1)[:80],
            "true",
        )

    # has_springing_financial_covenant (016 springing-only / 019)
    spring_fc = re.search(
        r"(springing\s+financial\s+covenant|"
        r"Springing\s+(?:Financial\s+Covenant|Fixed\s+Charge)|"
        r"tested\s+only\s+when[^\n]{0,80}revolv|"
        r"only\s+when\s+(?:the\s+)?aggregate\s+revolving|"
        r"when\s+(?:and\s+only\s+when\s+)?(?:the\s+)?(?:aggregate\s+)?"
        r"revolv(?:ing|er)\s+(?:credit\s+)?(?:exposure|utilization|outstandings))",
        text,
        re.I,
    )
    if spring_fc:
        _append_bool(
            extractions,
            text,
            "has_springing_financial_covenant",
            spring_fc.group(1)[:80],
            "true",
        )

    # has_always_on_maintenance_covenant (016) — post-merge clears if springing-gated
    always_on = re.search(
        r"(always[- ]on|"
        r"tested\s+quarterly(?!\s+only)|"
        r"financial\s+maintenance\s+covenant|"
        r"maintain\s+(?:a\s+|the\s+)?(?:Maximum\s+)?[^\n]{0,40}Leverage\s+Ratio|"
        r"shall\s+not\s+permit[^\n]{0,80}Leverage\s+Ratio|"
        r"financial\s+covenant|"
        r"leverage\s+ratio\s+shall\s+not\s+exceed|"
        r"maximum\s+total\s+net\s+leverage|"
        r"interest\s+coverage\s+ratio)",
        text,
        re.I,
    )
    if always_on:
        _append_bool(
            extractions,
            text,
            "has_always_on_maintenance_covenant",
            always_on.group(1)[:80],
            "true",
        )

    # borrower_control (017) — corporate if public borrower; else PE portco → sponsor
    # Keep tight: avoid "publicly traded securities" / ERISA generics / bare exchange names.
    bpub = re.search(
        r"((?:Borrower|Client|Company|Guarantor)\s+"
        r"(?:is|whose\s+common\s+(?:stock|equity)\s+is)\s+publicly\s+traded|"
        r"whose\s+common\s+(?:stock|equity)\s+is\s+publicly\s+traded|"
        r"(?:is|are)\s+publicly\s+traded\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)|"
        r"(?:common\s+stock|ordinary\s+shares|American\s+Depositary\s+Shares)\s+"
        r"(?:are|is)\s+listed\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)|"
        r"publicly\s+traded\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)\s+under\s+the\s+ticker|"
        r"listed\s+on\s+(?:the\s+)?(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)"
        r".{0,40}ticker\s+symbol)",
        text,
        re.I,
    )
    port = re.search(
        r"((?:is\s+an?\s+|an\s+indirect\s+)?portfolio\s+company\s+of)",
        text,
        re.I,
    )
    if bpub:
        extractions.append(
            {
                "extraction_class": "borrower_control",
                "extraction_text": "corporate",
                "attributes": {"evidence": bpub.group(1)[:120]},
                "char_interval": find_span(text, bpub.group(1))
                or find_span(text, "publicly traded"),
            }
        )
    elif port:
        extractions.append(
            {
                "extraction_class": "borrower_control",
                "extraction_text": "sponsor",
                "attributes": {"evidence": port.group(1)[:120]},
                "char_interval": find_span(text, port.group(1)),
            }
        )

    grounded = [e for e in extractions if e.get("char_interval")]
    result = {
        "ok": True,
        "provider": "langextract-sidecar",
        "backend": "demo",
        "model_id": "demo-firm-knowledge-matter-v3",
        "schema_preset": "firm_knowledge_matter",
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
            "<!doctype html><html><head><meta charset=utf-8>"
            "<title>LangExtract credit facility</title></head><body>",
            "<h1>credit_facility_matter extractions</h1><ul>",
        ]
        for e in grounded:
            span = e["char_interval"]
            html.append(
                f"<li><strong>{e['extraction_class']}</strong>: "
                f"{e['extraction_text']} "
                f"<em>({span['start']}–{span['end']})</em></li>"
            )
        html.append("</ul></body></html>")
        html_path.write_text("".join(html), encoding="utf-8")
        result["artifact_paths"] = {
            "jsonl_path": str(jsonl_path),
            "html_path": str(html_path),
        }

    return result


def _build_examples(body: dict[str, Any]) -> tuple[list[Any], Any]:
    import langextract as lx  # type: ignore
    from langextract import data as lx_data  # type: ignore

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
    return examples, lx


def _serialize_result(doc: Any, model_id: str, backend: str) -> dict[str, Any]:
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
    return {
        "ok": True,
        "provider": "langextract-sidecar",
        "backend": backend,
        "model_id": model_id,
        "extractions": grounded,
        "artifact_paths": {},
        "_doc": doc,
        "_grounded": grounded,
    }


def live_extract(body: dict[str, Any]) -> dict[str, Any]:
    backend = (body.get("backend") or BACKEND).strip().lower()
    model_id = body.get("model_id") or MODEL_ID

    try:
        examples, lx = _build_examples(body)
    except ImportError:
        return {
            "ok": False,
            "error": "langextract package not installed; use LANGEXTRACT_MODE=demo or rebuild with requirements.txt",
        }

    prompt = body.get("prompt_description") or "Extract structured entities with grounding."
    extract_kwargs: dict[str, Any] = {
        "text_or_documents": body["text"],
        "prompt_description": prompt,
        "examples": examples,
    }

    if backend == "ollama":
        result = lx.extract(
            **extract_kwargs,
            model_id=model_id,
            model_url=OLLAMA_BASE_URL,
        )
    elif backend == "openai_compatible":
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LANGEXTRACT_API_KEY")
        base_url = OPENAI_COMPAT_BASE_URL
        if not api_key or not base_url:
            return {
                "ok": False,
                "error": "LANGEXTRACT_BACKEND=openai_compatible requires OPENAI_API_KEY and OPENAI_API_BASE_URL",
            }
        from langextract.factory import ModelConfig  # type: ignore

        config = ModelConfig(
            model_id=model_id,
            provider="openai",
            provider_kwargs={"api_key": api_key, "base_url": base_url},
        )
        result = lx.extract(
            **extract_kwargs,
            config=config,
            fence_output=True,
            use_schema_constraints=False,
        )
    else:
        # Default: OpenRouter (ClawQL standard — not direct Gemini)
        api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("LANGEXTRACT_API_KEY")
        if not api_key:
            return {
                "ok": False,
                "error": "LANGEXTRACT_BACKEND=openrouter requires OPENROUTER_API_KEY (or LANGEXTRACT_API_KEY)",
            }
        openrouter_model = model_id.removeprefix("openrouter/")
        try:
            import langextract_provider_openrouter  # noqa: F401  # type: ignore
        except ImportError:
            langextract_provider_openrouter = None  # type: ignore

        if langextract_provider_openrouter is not None and not model_id.startswith("openrouter/"):
            openrouter_model = f"openrouter/{openrouter_model}"

        if langextract_provider_openrouter is not None and model_id.startswith("openrouter/"):
            result = lx.extract(**extract_kwargs, model_id=openrouter_model, api_key=api_key)
        else:
            from langextract.factory import ModelConfig  # type: ignore

            config = ModelConfig(
                model_id=openrouter_model,
                provider="openai",
                provider_kwargs={"api_key": api_key, "base_url": OPENROUTER_BASE_URL},
            )
            result = lx.extract(
                **extract_kwargs,
                config=config,
                fence_output=True,
                use_schema_constraints=False,
            )
        backend = "openrouter"
        model_id = openrouter_model

    doc = result[0] if isinstance(result, list) else result
    out = _serialize_result(doc, model_id, backend)
    grounded = out.pop("_grounded")
    doc = out.pop("_doc")

    if body.get("write_html"):
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        doc_id = body.get("doc_id") or str(uuid.uuid4())[:8]
        html_path = ARTIFACTS_DIR / f"{doc_id}.html"
        try:
            lx.io.save_html(doc, html_path)  # type: ignore[attr-defined]
        except Exception:
            html_path.write_text(
                "<!doctype html><html><body><p>HTML viz unavailable for this backend.</p></body></html>",
                encoding="utf-8",
            )
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
            self._json(
                200,
                {
                    "ok": True,
                    "mode": MODE,
                    "backend": BACKEND,
                    "model_id": MODEL_ID,
                },
            )
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
    print(f"langextract-http listening on :{PORT} mode={MODE} backend={BACKEND}")
    server.serve_forever()
