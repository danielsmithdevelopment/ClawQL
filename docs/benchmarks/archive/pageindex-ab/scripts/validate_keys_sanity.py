#!/usr/bin/env python3
"""Cheap pre-freeze key hygiene for pageindex-ab hard-candidate.

Rules (rule-based, not arm-dependent):
  - Every answerable key's normalized_answer / accepted_variants must appear
    in its document (or code repo) text.
  - Calendar years in answers must be in [1990, current_year].

Exit 0 if clean; 1 if issues found. Writes design/key-sanity-report.json.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "corpus" / "hard-candidate"
OUT = ROOT / "design" / "key-sanity-report.json"
YEAR_MAX = datetime.now(timezone.utc).year


def repo_text(rp: Path) -> str:
    if not rp.exists():
        return ""
    parts: list[str] = []
    for p in rp.rglob("*"):
        if p.is_file() and p.suffix in {".ts", ".js", ".md", ".json"}:
            parts.append(p.read_text(errors="ignore"))
    return "\n".join(parts)


def main() -> int:
    keys = [json.loads(l) for l in (CORPUS / "keys.jsonl").read_text().splitlines()]
    man = json.loads((CORPUS / "candidate-manifest.json").read_text())
    docs = {
        d["id"]: (CORPUS / d["path"]).read_text(errors="ignore")
        for d in man["documents"]
        if (CORPUS / d["path"]).exists()
    }
    repos = {r["id"]: CORPUS / r["path"] for r in man.get("repos", [])}

    issues: list[dict] = []
    checked = 0
    for k in keys:
        if k.get("unanswerable"):
            continue
        checked += 1
        variants = [
            v
            for v in [k.get("normalized_answer") or "", *(k.get("accepted_variants") or [])]
            if v and str(v).strip()
        ]
        doc_id = k["document_id"]
        corpus = docs.get(doc_id, "")
        if not corpus and doc_id in repos:
            corpus = repo_text(repos[doc_id])
        if not corpus:
            issues.append({"id": k["id"], "kind": "missing_document", "detail": doc_id})
            continue
        cf = corpus.casefold()
        found = any(str(v).casefold() in cf for v in variants if len(str(v)) >= 2)
        if not found:

            def digits(s: str) -> str:
                return re.sub(r"[^0-9.]", "", str(s))

            corp_d = digits(corpus)
            found = any(digits(v) and digits(v) in corp_d for v in variants)
        if not found:
            issues.append(
                {
                    "id": k["id"],
                    "kind": "answer_not_in_document",
                    "answer": str(variants[0])[:100] if variants else "",
                    "stratum": k.get("stratum"),
                    "type": k.get("question_type"),
                }
            )
        for v in variants:
            if re.fullmatch(r"(19|20)\d{2}", str(v).strip()):
                y = int(v)
                if y < 1990 or y > YEAR_MAX:
                    issues.append({"id": k["id"], "kind": "implausible_year", "answer": v})

    out = {
        "n_keys_checked": checked,
        "n_unanswerable_skipped": len(keys) - checked,
        "n_issues": len(issues),
        "by_kind": dict(Counter(i["kind"] for i in issues)),
        "issues": issues,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({k: out[k] for k in ("n_keys_checked", "n_issues", "by_kind")}, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
