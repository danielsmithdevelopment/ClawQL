#!/usr/bin/env python3
"""VectifyAI PageIndex fair test — misses + no-harm cohorts.

Upstream `pageindex` SDK local mode (LLM summaries + strong tree chat).
Grade **answer-only** (citations ignored). Default PDF source: official IETF.

Shared strong model with query-rewrite via VECTIFY_FAIR_MODEL / --chat-model.

Dry-run:
  python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py --dry-run --pdf-source ietf
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MISSES = ROOT / "design" / "deep-rfc-misses.json"
DEFAULT_NOHARM = ROOT / "design" / "no-harm-rfc-hits.json"
DEFAULT_KEYS = ROOT / "corpus" / "hard-candidate" / "keys.jsonl"
DEFAULT_DOCS = ROOT / "corpus" / "hard-candidate" / "docs"
DEFAULT_OUT = ROOT / "results" / "vectify-fair"
IETF_PDF = "https://www.rfc-editor.org/rfc/rfc{num}.pdf"
IETF_TXT = "https://www.rfc-editor.org/rfc/rfc{num}.txt"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grade_tier1 import load_jsonl, normalize_text  # noqa: E402


def escape_pdf(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text_to_pdf(text: str, out: Path, lines_per_page: int = 55) -> int:
    """Minimal multi-page text PDF (Courier). Fallback when IETF fetch unavailable."""
    lines = text.splitlines() or [""]
    pages = [lines[i : i + lines_per_page] for i in range(0, len(lines), lines_per_page)]
    objects: list[tuple[int, bytes]] = []
    kids: list[str] = []
    obj_id = 3
    for page_lines in pages:
        parts = ["BT", "/F1 9 Tf", "14 TL", "40 770 Td"]
        for i, line in enumerate(page_lines):
            if i:
                parts.append("T*")
            safe = line[:110].encode("latin-1", "replace").decode("latin-1")
            parts.append(f"({escape_pdf(safe)}) Tj")
        parts.append("ET")
        stream = "\n".join(parts).encode("latin-1", "replace")
        content_id = obj_id
        objects.append(
            (content_id, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        )
        obj_id += 1
        page_id = obj_id
        objects.append(
            (
                page_id,
                (
                    f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                    f"/Contents {content_id} 0 R /Resources << /Font << /F1 "
                    f"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>"
                ).encode(),
            )
        )
        kids.append(f"{page_id} 0 R")
        obj_id += 1
    pages_dict = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>".encode()
    catalog = b"<< /Type /Catalog /Pages 2 0 R >>"
    out_parts = [b"%PDF-1.4\n"]
    all_objs = [(1, catalog), (2, pages_dict)] + objects
    all_objs.sort(key=lambda x: x[0])
    offsets: dict[int, int] = {}
    for oid, body in all_objs:
        offsets[oid] = sum(len(p) for p in out_parts)
        out_parts.append(f"{oid} 0 obj\n".encode())
        out_parts.append(body)
        out_parts.append(b"\nendobj\n")
    xref_pos = sum(len(p) for p in out_parts)
    max_id = max(offsets)
    out_parts.append(f"xref\n0 {max_id + 1}\n".encode())
    out_parts.append(b"0000000000 65535 f \n")
    for i in range(1, max_id + 1):
        out_parts.append(f"{offsets[i]:010d} 00000 n \n".encode())
    out_parts.append(
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(b"".join(out_parts))
    return len(pages)


def resolve_doc(question: str, hint: str | None = None) -> str:
    if hint:
        return hint.lower()
    m = re.search(r"(rfc\d+)", question, re.I)
    if not m:
        raise SystemExit(f"cannot resolve doc from question: {question[:80]}")
    return m.group(1).lower()


def load_cohort_file(path: Path, keys: dict[str, dict[str, Any]], bucket: str) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    by_doc = {row["id"]: row.get("doc") for row in data.get("rows") or []}
    out: list[dict[str, Any]] = []
    for qid in data["question_ids"]:
        if qid not in keys:
            raise SystemExit(f"missing key for {qid} in keys.jsonl")
        row = dict(keys[qid])
        row["_doc"] = resolve_doc(row.get("question", ""), by_doc.get(qid))
        row["_cohort"] = bucket
        out.append(row)
    return out


def load_cohort(
    misses_path: Path,
    keys_path: Path,
    noharm_path: Path | None = None,
    cohort: str = "both",
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    keys = {row["id"]: row for row in load_jsonl(keys_path)}
    rows: list[dict[str, Any]] = []
    if cohort in ("misses", "both"):
        rows.extend(load_cohort_file(misses_path, keys, "misses"))
    if cohort in ("no-harm", "both") and noharm_path:
        rows.extend(load_cohort_file(noharm_path, keys, "no-harm"))
    # de-dupe by id preserving order
    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        uniq.append(r)
    return uniq, keys


def answer_only_correct(answer: str, not_found: bool, key: dict[str, Any]) -> bool:
    if key.get("unanswerable") or key.get("question_type") == "not_in_document":
        return bool(not_found)
    if not_found:
        return False
    norm = normalize_text(answer or "")
    cands = [normalize_text(str(key.get("normalized_answer") or ""))]
    cands.extend(normalize_text(v) for v in key.get("accepted_variants") or [])
    cands = [c for c in cands if c]
    if not cands:
        return False
    return any(c in norm or norm in c for c in cands)


def grade_answer_only(contract: dict[str, Any], key: dict[str, Any]) -> dict[str, Any]:
    ok = answer_only_correct(
        str(contract.get("answer") or ""),
        bool(contract.get("not_found")),
        key,
    )
    return {
        "question_id": key["id"],
        "cohort": key.get("_cohort"),
        "arm": contract.get("arm"),
        "answer_only_correct": ok,
        # keep fields for decide() fallbacks; citations are NOT decision-relevant
        "text_match": ok if not key.get("unanswerable") else None,
        "strict_correct": ok,
        "grade_mode": "answer_only",
    }


def map_answer_to_contract(raw_answer: str, key: dict[str, Any]) -> dict[str, Any]:
    text = (raw_answer or "").strip()
    qtype = key.get("question_type")
    if not text:
        return {
            "answer": "",
            "sections": [],
            "not_found": True,
            "question_id": key["id"],
            "raw_answer": "",
        }
    # crude abstention detection
    low = text.lower()
    abstain = any(
        p in low
        for p in ("not found", "not in the document", "cannot find", "no such", "absent")
    )
    if qtype == "not_in_document" and abstain:
        return {
            "answer": "",
            "sections": [],
            "not_found": True,
            "question_id": key["id"],
            "raw_answer": text[:4000],
        }

    norm = normalize_text(text)
    variants = [normalize_text(str(key.get("normalized_answer") or ""))]
    variants.extend(normalize_text(v) for v in key.get("accepted_variants") or [])
    variants = [v for v in variants if v]
    matched = ""
    for v in variants:
        if v and (v in norm or norm in v):
            matched = str(key.get("normalized_answer") or v)
            break
    if not matched:
        matched = text.split("\n", 1)[0][:240]
    return {
        "answer": matched,
        "sections": [],  # intentionally empty — answer-only grade
        "not_found": False,
        "question_id": key["id"],
        "raw_answer": text[:4000],
    }


def ensure_pdf_bridge(doc: str, docs_dir: Path, pdf_dir: Path) -> Path:
    md = docs_dir / f"{doc}.md"
    if not md.is_file():
        raise FileNotFoundError(f"missing markdown for {doc}: {md}")
    pdf = pdf_dir / f"{doc}.bridge.pdf"
    stamp = pdf.with_suffix(".pdf.stamp")
    md_mtime = md.stat().st_mtime
    if pdf.is_file() and stamp.is_file() and float(stamp.read_text()) >= md_mtime:
        return pdf
    n = text_to_pdf(md.read_text(encoding="utf-8"), pdf)
    stamp.write_text(str(md_mtime), encoding="utf-8")
    print(json.dumps({"event": "pdf_bridge", "doc": doc, "pages": n, "path": str(pdf)}))
    return pdf


def _http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ClawQL-pageindex-ab-fair-test/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def ensure_pdf_ietf(doc: str, pdf_dir: Path) -> tuple[Path, str]:
    """Official IETF PDF when published; else official .txt → text PDF.

    Returns (path, provenance) where provenance is ``ietf-pdf`` or ``ietf-txt``.
    """
    m = re.fullmatch(r"rfc(\d+)", doc.lower())
    if not m:
        raise ValueError(f"not an rfc doc id: {doc}")
    num = m.group(1)
    pdf_dir.mkdir(parents=True, exist_ok=True)

    pdf = pdf_dir / f"{doc}.ietf.pdf"
    if pdf.is_file() and pdf.stat().st_size > 1000 and pdf.read_bytes()[:4] == b"%PDF":
        return pdf, "ietf-pdf"

    url_pdf = IETF_PDF.format(num=num)
    try:
        data = _http_get(url_pdf)
        if len(data) >= 1000 and data.startswith(b"%PDF"):
            pdf.write_bytes(data)
            print(
                json.dumps(
                    {
                        "event": "pdf_ietf",
                        "doc": doc,
                        "bytes": len(data),
                        "url": url_pdf,
                        "path": str(pdf),
                        "provenance": "ietf-pdf",
                    }
                )
            )
            return pdf, "ietf-pdf"
        print(json.dumps({"event": "pdf_ietf_bad_body", "doc": doc, "bytes": len(data), "url": url_pdf}))
    except (urllib.error.URLError, TimeoutError) as e:
        print(json.dumps({"event": "pdf_ietf_miss", "doc": doc, "url": url_pdf, "error": str(e)}))

    # Many pre-HTML RFCs have no rfc-editor PDF — use authoritative .txt instead of our MD bridge.
    txt_pdf = pdf_dir / f"{doc}.ietf-txt.pdf"
    url_txt = IETF_TXT.format(num=num)
    try:
        text = _http_get(url_txt).decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError) as e:
        raise RuntimeError(f"failed to fetch IETF txt {url_txt}: {e}") from e
    if len(text) < 200:
        raise RuntimeError(f"IETF txt too small for {doc}: {len(text)} chars")
    n = text_to_pdf(text, txt_pdf)
    print(
        json.dumps(
            {
                "event": "pdf_ietf_txt",
                "doc": doc,
                "pages": n,
                "url": url_txt,
                "path": str(txt_pdf),
                "provenance": "ietf-txt",
                "note": "No official PDF; authoritative RFC text rendered to PDF for PageIndex local submit.",
            }
        )
    )
    return txt_pdf, "ietf-txt"


def ensure_pdf(doc: str, docs_dir: Path, pdf_dir: Path, source: str) -> Path:
    if source == "ietf":
        try:
            path, prov = ensure_pdf_ietf(doc, pdf_dir)
            print(json.dumps({"event": "pdf_ready", "doc": doc, "provenance": prov, "path": str(path)}))
            return path
        except Exception as e:
            print(json.dumps({"event": "pdf_ietf_fallback_bridge", "doc": doc, "error": str(e)}))
            return ensure_pdf_bridge(doc, docs_dir, pdf_dir)
    return ensure_pdf_bridge(doc, docs_dir, pdf_dir)


def resolve_models(index_model: str, chat_model: str) -> tuple[str, str]:
    or_key = os.environ.get("OPENROUTER_API_KEY")
    if or_key and not os.environ.get("OPENAI_API_KEY"):
        os.environ.setdefault("OPENROUTER_API_KEY", or_key)
        if not index_model.startswith(("openrouter/", "openai/", "anthropic/", "google/")):
            index_model = f"openrouter/{index_model}"
        elif not index_model.startswith("openrouter/") and "/" in index_model:
            index_model = f"openrouter/{index_model}"
        if not chat_model.startswith("openrouter/") and "/" in chat_model:
            chat_model = f"openrouter/{chat_model}"
        elif not chat_model.startswith(("openrouter/", "openai/", "anthropic/", "google/")):
            chat_model = f"openrouter/{chat_model}"
    return index_model, chat_model


def chat_prompt(key: dict[str, Any]) -> str:
    qtype = key.get("question_type")
    q = key["question"]
    if qtype == "not_in_document":
        return (
            f"{q}\n\nIf the answer is not in the document, say exactly: NOT_FOUND. "
            "Otherwise give a short factual answer."
        )
    if qtype in ("section_lookup", "buried_detail"):
        return f"{q}\n\nReply with the exact section heading text from the document. Be concise."
    return f"{q}\n\nReply with a short exact answer from the document only."


def run_live(
    cohort: list[dict[str, Any]],
    *,
    docs_dir: Path,
    out_dir: Path,
    index_model: str,
    chat_model: str,
    storage_path: Path,
    pdf_source: str,
) -> dict[str, Any]:
    from pageindex import PageIndexClient

    index_model, chat_model = resolve_models(index_model, chat_model)
    pdf_dir = out_dir / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    storage_path.mkdir(parents=True, exist_ok=True)

    client = PageIndexClient(
        index=index_model,
        chat=chat_model,
        storage_path=str(storage_path),
    )

    registry_path = out_dir / "doc_ids.json"
    registry: dict[str, str] = {}
    if registry_path.is_file():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))

    for doc in sorted({row["_doc"] for row in cohort}):
        if doc in registry:
            continue
        pdf = ensure_pdf(doc, docs_dir, pdf_dir, pdf_source)
        t0 = time.time()
        result = client.submit_document(str(pdf))
        doc_id = result["doc_id"]
        registry[doc] = doc_id
        registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
        print(
            json.dumps(
                {
                    "event": "indexed",
                    "doc": doc,
                    "doc_id": doc_id,
                    "pdf_source": pdf_source,
                    "seconds": round(time.time() - t0, 2),
                }
            )
        )

    answers_path = out_dir / "answers-D-vectify-pi.jsonl"
    grades_path = out_dir / "grades-D-vectify-pi.jsonl"
    grades: list[dict[str, Any]] = []

    with answers_path.open("w", encoding="utf-8") as af, grades_path.open("w", encoding="utf-8") as gf:
        for key in cohort:
            doc = key["_doc"]
            doc_id = registry[doc]
            t0 = time.time()
            raw = client.chat(chat_prompt(key), doc_id=doc_id)
            if not isinstance(raw, str):
                raw = getattr(raw, "content", None) or getattr(raw, "answer", None) or str(raw)
            # Normalize NOT_FOUND token
            if str(raw).strip().upper() == "NOT_FOUND":
                contract = {
                    "answer": "",
                    "sections": [],
                    "not_found": True,
                    "question_id": key["id"],
                    "raw_answer": "NOT_FOUND",
                }
            else:
                contract = map_answer_to_contract(str(raw), key)
            contract["arm"] = "D-vectify-pi"
            contract["doc"] = doc
            contract["doc_id"] = doc_id
            contract["cohort"] = key.get("_cohort")
            contract["latency_s"] = round(time.time() - t0, 3)
            contract["chat_model"] = chat_model
            af.write(json.dumps(contract, sort_keys=True) + "\n")
            af.flush()
            g = grade_answer_only(contract, key)
            grades.append(g)
            gf.write(json.dumps(g, sort_keys=True) + "\n")
            gf.flush()
            print(
                json.dumps(
                    {
                        "event": "graded",
                        "id": key["id"],
                        "cohort": key.get("_cohort"),
                        "answer_only": g["answer_only_correct"],
                        "latency_s": contract["latency_s"],
                    }
                )
            )

    n = len(grades) or 1
    summary = {
        "arm": "D-vectify-pi",
        "n": len(grades),
        "answer_only_accuracy": sum(1 for g in grades if g.get("answer_only_correct")) / n,
        "by_cohort": {
            bucket: {
                "n": sum(1 for g in grades if g.get("cohort") == bucket),
                "answer_only_accuracy": (
                    sum(1 for g in grades if g.get("cohort") == bucket and g.get("answer_only_correct"))
                    / max(1, sum(1 for g in grades if g.get("cohort") == bucket))
                ),
            }
            for bucket in ("misses", "no-harm")
        },
        "index_model": index_model,
        "chat_model": chat_model,
        "pdf_source": pdf_source,
        "grade_mode": "answer_only",
    }
    (out_dir / "summary-D-vectify-pi.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def run_dry(
    cohort: list[dict[str, Any]],
    docs_dir: Path,
    out_dir: Path,
    pdf_source: str,
) -> dict[str, Any]:
    pdf_dir = out_dir / "pdfs"
    built = []
    for doc in sorted({row["_doc"] for row in cohort}):
        pdf = ensure_pdf(doc, docs_dir, pdf_dir, pdf_source)
        built.append({"doc": doc, "pdf": str(pdf), "bytes": pdf.stat().st_size, "source": pdf_source})
    try:
        import pageindex  # noqa: F401

        pi_ok, pi_err = True, None
    except Exception as e:  # pragma: no cover
        pi_ok, pi_err = False, str(e)
    summary = {
        "dry_run": True,
        "n_questions": len(cohort),
        "cohorts": {
            "misses": sum(1 for r in cohort if r.get("_cohort") == "misses"),
            "no-harm": sum(1 for r in cohort if r.get("_cohort") == "no-harm"),
        },
        "docs": built,
        "pdf_source": pdf_source,
        "pageindex_import_ok": pi_ok,
        "pageindex_import_error": pi_err,
        "has_openai_key": bool(os.environ.get("OPENAI_API_KEY")),
        "has_openrouter_key": bool(os.environ.get("OPENROUTER_API_KEY")),
        "shared_model_env": os.environ.get("VECTIFY_FAIR_MODEL"),
        "question_ids": [r["id"] for r in cohort],
        "grade_mode": "answer_only",
        "beat_rule": "Net>=5 on misses AND no-harm >=14/15; else tie→purge",
        "note": "Live run via GHA sentinel .run-vectify-fair (OPENROUTER_API_KEY) or local keys.",
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "dry-run-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


def main() -> int:
    default_chat = os.environ.get("VECTIFY_FAIR_MODEL") or os.environ.get(
        "VECTIFY_CHAT_MODEL", "openai/gpt-4o"
    )
    default_index = os.environ.get("VECTIFY_INDEX_MODEL", "openai/gpt-4o-mini")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--no-harm", type=Path, default=DEFAULT_NOHARM)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--docs", type=Path, default=DEFAULT_DOCS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--cohort", choices=("both", "misses", "no-harm"), default="both")
    p.add_argument("--pdf-source", choices=("ietf", "bridge"), default="ietf")
    p.add_argument("--index-model", default=default_index)
    p.add_argument("--chat-model", default=default_chat, help="Must match query-rewrite --model")
    p.add_argument("--storage", type=Path, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    cohort, _keys = load_cohort(args.misses, args.keys, args.no_harm, args.cohort)
    args.out.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        run_dry(cohort, args.docs, args.out, args.pdf_source)
        return 0

    if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENROUTER_API_KEY")):
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Set OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY, or pass --dry-run.",
                }
            ),
            file=sys.stderr,
        )
        return 2

    summary = run_live(
        cohort,
        docs_dir=args.docs,
        out_dir=args.out,
        index_model=args.index_model,
        chat_model=args.chat_model,
        storage_path=args.storage or (args.out / "store"),
        pdf_source=args.pdf_source,
    )
    print(json.dumps({"summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
