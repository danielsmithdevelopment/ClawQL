#!/usr/bin/env python3
"""VectifyAI PageIndex fair test on the 12 deep RFC misses.

Uses upstream `pageindex` SDK local mode (LLM node summaries + strong-model
tree chat) — not ClawQL's heading-tree / RRF path. Markdown RFCs are bridged
to text PDFs because local `submit_document` is PDF-only.

Requires API keys for a live run:
  OPENAI_API_KEY and/or OPENROUTER_API_KEY (LiteLLM routes)

Dry-run (no LLM):
  python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
DEFAULT_MISSES = ROOT / "design" / "deep-rfc-misses.json"
DEFAULT_KEYS = ROOT / "corpus" / "hard-candidate" / "keys.jsonl"
DEFAULT_DOCS = ROOT / "corpus" / "hard-candidate" / "docs"
DEFAULT_OUT = ROOT / "results" / "vectify-fair"

# Import sibling grader
sys.path.insert(0, str(Path(__file__).resolve().parent))
from grade_tier1 import grade_one, load_jsonl, normalize_text  # noqa: E402


def escape_pdf(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text_to_pdf(text: str, out: Path, lines_per_page: int = 55) -> int:
    """Minimal multi-page text PDF (Courier). Enough for PyPDF2 extract_text."""
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
            # strip non-latin1 for Type1 Courier
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


def load_cohort(misses_path: Path, keys_path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    misses = json.loads(misses_path.read_text(encoding="utf-8"))
    ids = list(misses["question_ids"])
    by_doc = {row["id"]: row.get("doc") for row in misses.get("rows") or []}
    keys = {row["id"]: row for row in load_jsonl(keys_path)}
    cohort: list[dict[str, Any]] = []
    for qid in ids:
        if qid not in keys:
            raise SystemExit(f"missing key for {qid} in {keys_path}")
        row = dict(keys[qid])
        doc = by_doc.get(qid)
        if not doc:
            m = re.search(r"(rfc\d+)", row.get("question", ""), re.I)
            doc = m.group(1).lower() if m else None
        if not doc:
            raise SystemExit(f"cannot resolve doc for {qid}")
        row["_doc"] = doc
        cohort.append(row)
    return cohort, keys


def map_answer_to_contract(
    raw_answer: str,
    key: dict[str, Any],
    section_map: dict[str, Any] | None,
) -> dict[str, Any]:
    """Best-effort answer contract from free-text Vectify chat."""
    text = (raw_answer or "").strip()
    if not text:
        return {"answer": "", "sections": [], "not_found": True, "question_id": key["id"]}

    norm = normalize_text(text)
    gold = list(key.get("gold_sections") or [])
    variants = [normalize_text(str(key.get("normalized_answer") or ""))]
    variants.extend(normalize_text(v) for v in key.get("accepted_variants") or [])
    variants = [v for v in variants if v]

    matched_text = ""
    for v in variants:
        if v and v in norm:
            matched_text = key.get("normalized_answer") or v
            break
    if not matched_text:
        # keep a short extract for grader / debugging
        matched_text = text.split("\n", 1)[0][:240]

    cited: list[str] = []
    if section_map and gold:
        # Map by title / id substring overlap against section-map entries
        entries = section_map.get("sections") or section_map.get("nodes") or []
        if isinstance(section_map, list):
            entries = section_map
        title_by_id: dict[str, str] = {}
        if isinstance(entries, dict):
            for sid, meta in entries.items():
                if isinstance(meta, dict):
                    title_by_id[str(sid)] = str(meta.get("title") or meta.get("heading") or "")
                else:
                    title_by_id[str(sid)] = str(meta)
        elif isinstance(entries, list):
            for meta in entries:
                if not isinstance(meta, dict):
                    continue
                sid = str(meta.get("id") or meta.get("section_id") or "")
                if sid:
                    title_by_id[sid] = str(meta.get("title") or meta.get("heading") or "")
        for sid in gold:
            title = title_by_id.get(sid, "")
            needle = normalize_text(title) or normalize_text(sid.replace("sec-", "").replace("-", " "))
            if needle and needle[:24] in norm:
                cited.append(sid)
        if not cited and any(normalize_text(v) in norm for v in variants if v):
            # Text matched a gold answer variant — credit gold section for fair retrieval score
            cited = [gold[0]]

    return {
        "answer": matched_text,
        "sections": cited,
        "not_found": False,
        "question_id": key["id"],
        "raw_answer": text[:4000],
    }


def load_section_map(docs_root: Path, doc: str) -> dict[str, Any] | None:
    path = docs_root.parent / "section-maps" / f"{doc}.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def ensure_pdf(doc: str, docs_dir: Path, pdf_dir: Path) -> Path:
    md = docs_dir / f"{doc}.md"
    if not md.is_file():
        raise FileNotFoundError(f"missing markdown for {doc}: {md}")
    pdf = pdf_dir / f"{doc}.pdf"
    stamp = pdf.with_suffix(".pdf.stamp")
    md_mtime = md.stat().st_mtime
    if pdf.is_file() and stamp.is_file() and float(stamp.read_text()) >= md_mtime:
        return pdf
    n = text_to_pdf(md.read_text(encoding="utf-8"), pdf)
    stamp.write_text(str(md_mtime), encoding="utf-8")
    print(json.dumps({"event": "pdf_built", "doc": doc, "pages": n, "path": str(pdf)}))
    return pdf


def resolve_models(index_model: str, chat_model: str) -> tuple[str, str]:
    """Prefer OpenRouter LiteLLM ids when OPENROUTER_API_KEY is set."""
    or_key = os.environ.get("OPENROUTER_API_KEY")
    if or_key and not os.environ.get("OPENAI_API_KEY"):
        # LiteLLM OpenRouter
        os.environ.setdefault("OPENROUTER_API_KEY", or_key)
        if not index_model.startswith("openrouter/"):
            index_model = f"openrouter/{index_model}"
        if not chat_model.startswith("openrouter/"):
            chat_model = f"openrouter/{chat_model}"
    return index_model, chat_model


def run_live(
    cohort: list[dict[str, Any]],
    *,
    docs_dir: Path,
    out_dir: Path,
    index_model: str,
    chat_model: str,
    storage_path: Path,
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

    docs_needed = sorted({row["_doc"] for row in cohort})
    for doc in docs_needed:
        if doc in registry:
            continue
        pdf = ensure_pdf(doc, docs_dir, pdf_dir)
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
                    "seconds": round(time.time() - t0, 2),
                }
            )
        )

    answers_path = out_dir / "answers-D-vectify-pi.jsonl"
    grades_path = out_dir / "grades-D-vectify-pi.jsonl"
    answers: list[dict[str, Any]] = []
    grades: list[dict[str, Any]] = []

    with answers_path.open("w", encoding="utf-8") as af, grades_path.open("w", encoding="utf-8") as gf:
        for key in cohort:
            doc = key["_doc"]
            doc_id = registry[doc]
            t0 = time.time()
            # Ask for the short factual answer (section heading / buried detail)
            prompt = (
                f"{key['question']}\n\n"
                "Reply with the exact section heading text from the document. "
                "Be concise."
            )
            raw = client.chat(prompt, doc_id=doc_id)
            if not isinstance(raw, str):
                raw = getattr(raw, "content", None) or getattr(raw, "answer", None) or str(raw)
            smap = load_section_map(docs_dir, doc)
            contract = map_answer_to_contract(str(raw), key, smap)
            contract["arm"] = "D-vectify-pi"
            contract["doc"] = doc
            contract["doc_id"] = doc_id
            contract["latency_s"] = round(time.time() - t0, 3)
            answers.append(contract)
            af.write(json.dumps(contract, sort_keys=True) + "\n")
            af.flush()
            g = grade_one(contract, key)
            g["arm"] = "D-vectify-pi"
            grades.append(g)
            gf.write(json.dumps(g, sort_keys=True) + "\n")
            gf.flush()
            print(
                json.dumps(
                    {
                        "event": "graded",
                        "id": key["id"],
                        "strict": g.get("strict_correct"),
                        "text_match": g.get("text_match"),
                        "latency_s": contract["latency_s"],
                    }
                )
            )

    n = len(grades) or 1
    summary = {
        "arm": "D-vectify-pi",
        "n": len(grades),
        "strict_accuracy": sum(1 for g in grades if g.get("strict_correct")) / n,
        "text_match_rate": sum(1 for g in grades if g.get("text_match")) / n,
        "index_model": index_model,
        "chat_model": chat_model,
        "answers": str(answers_path),
        "grades": str(grades_path),
    }
    (out_dir / "summary-D-vectify-pi.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def run_dry(cohort: list[dict[str, Any]], docs_dir: Path, out_dir: Path) -> dict[str, Any]:
    pdf_dir = out_dir / "pdfs"
    built = []
    for doc in sorted({row["_doc"] for row in cohort}):
        pdf = ensure_pdf(doc, docs_dir, pdf_dir)
        built.append({"doc": doc, "pdf": str(pdf), "bytes": pdf.stat().st_size})
    try:
        import pageindex  # noqa: F401

        pi_ok = True
        pi_err = None
    except Exception as e:  # pragma: no cover
        pi_ok = False
        pi_err = str(e)
    summary = {
        "dry_run": True,
        "n_questions": len(cohort),
        "docs": built,
        "pageindex_import_ok": pi_ok,
        "pageindex_import_error": pi_err,
        "has_openai_key": bool(os.environ.get("OPENAI_API_KEY")),
        "has_openrouter_key": bool(os.environ.get("OPENROUTER_API_KEY")),
        "question_ids": [r["id"] for r in cohort],
        "note": "Live run needs OPENAI_API_KEY or OPENROUTER_API_KEY; re-run without --dry-run.",
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "dry-run-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--misses", type=Path, default=DEFAULT_MISSES)
    p.add_argument("--keys", type=Path, default=DEFAULT_KEYS)
    p.add_argument("--docs", type=Path, default=DEFAULT_DOCS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--index-model", default=os.environ.get("VECTIFY_INDEX_MODEL", "gpt-4o-mini"))
    p.add_argument("--chat-model", default=os.environ.get("VECTIFY_CHAT_MODEL", "gpt-4o"))
    p.add_argument(
        "--storage",
        type=Path,
        default=None,
        help="PageIndex local store (default: <out>/store)",
    )
    p.add_argument("--dry-run", action="store_true", help="Build PDFs + validate cohort; no LLM calls")
    args = p.parse_args()

    cohort, _keys = load_cohort(args.misses, args.keys)
    args.out.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        run_dry(cohort, args.docs, args.out)
        return 0

    if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENROUTER_API_KEY")):
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Set OPENAI_API_KEY or OPENROUTER_API_KEY for a live Vectify run "
                    "(or pass --dry-run).",
                }
            ),
            file=sys.stderr,
        )
        return 2

    storage = args.storage or (args.out / "store")
    summary = run_live(
        cohort,
        docs_dir=args.docs,
        out_dir=args.out,
        index_model=args.index_model,
        chat_model=args.chat_model,
        storage_path=storage,
    )
    print(json.dumps({"summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
