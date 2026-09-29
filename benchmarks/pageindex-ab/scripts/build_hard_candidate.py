#!/usr/bin/env python3
"""Build pageindex-ab hard-candidate corpus from public RFCs + long synthetics.

Design goals (vs synthetic freeze-candidate):
- Well-structured: real IETF RFCs (unused in ClawQL evals so far)
- Converted / weak: long synthetics with buried markers + misleading headings
- Questions emphasize buried detail / cross-section / not-in-document
- Harvey LAB and ExtractBench fixtures are NEVER imported

Tag: pageindex-ab-v1-hard-candidate (not spent).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "corpus" / "hard-candidate"
DOCS = OUT / "docs"
CODE = OUT / "code"
MAPS = OUT / "section-maps"
KEYS = OUT / "keys.jsonl"
MANIFEST = OUT / "candidate-manifest.json"
SEED = ROOT / "corpus" / "seed"

# Public RFCs — well_structured. Prefer mid-size for CI; 9110 is large.
RFC_URLS = [
    ("rfc8259", "https://www.rfc-editor.org/rfc/rfc8259.txt"),  # JSON ~28KB
    ("rfc6749", "https://www.rfc-editor.org/rfc/rfc6749.txt"),  # OAuth ~160KB
    ("rfc7519", "https://www.rfc-editor.org/rfc/rfc7519.txt"),  # JWT
    ("rfc7636", "https://www.rfc-editor.org/rfc/rfc7636.txt"),  # PKCE
    ("rfc7807", "https://www.rfc-editor.org/rfc/rfc7807.txt"),  # Problem Details
    ("rfc8615", "https://www.rfc-editor.org/rfc/rfc8615.txt"),  # Well-Known URIs
    ("rfc9110", "https://www.rfc-editor.org/rfc/rfc9110.txt"),  # HTTP Semantics large
    ("rfc9205", "https://www.rfc-editor.org/rfc/rfc9205.txt"),  # BCP HTTP API
]

# Unique buried markers for long synthetic strata (never appear in RFCs).
PDF_DOCS = [
    {
        "id": "pdf-long-meridian-credit",
        "title": "Meridian Holdings Credit Agreement (Docling convert)",
        "principal": "USD 187,500,000",
        "margin": "4.125%",
        "leverage": "3.85x",
        "fee": "0.55%",
        "amort_date": "March 3, 2027",
        "borrower": "Meridian Holdings LLC",
    },
    {
        "id": "pdf-long-northwind-indenture",
        "title": "Northwind ABS Indenture (Docling convert)",
        "principal": "USD 412,000,000",
        "margin": "2.05%",
        "leverage": "1.75x",
        "fee": "0.18%",
        "amort_date": "July 22, 2028",
        "borrower": "Northwind ABS Issuer LLC",
    },
    {
        "id": "pdf-long-harbor-revolver",
        "title": "Harbor Revolving Facility (Docling convert)",
        "principal": "USD 95,250,000",
        "margin": "3.40%",
        "leverage": "2.90x",
        "fee": "0.35%",
        "amort_date": "November 9, 2026",
        "borrower": "Harbor Ridge Holdings LLC",
    },
    {
        "id": "pdf-long-cascade-term",
        "title": "Cascade Term Loan Agreement (Docling convert)",
        "principal": "USD 260,000,000",
        "margin": "5.50%",
        "leverage": "4.25x",
        "fee": "0.80%",
        "amort_date": "January 14, 2029",
        "borrower": "Cascade Peak Capital LLC",
    },
]

WEAK_DOCS = [
    {
        "id": "wk-long-clearing-hearing",
        "title": "Committee Hearing Transcript — Clearing Outage (synthetic)",
        "sev": "SEV-2",
        "rate": "47 percent",
        "time_e": "09:17",
        "witness": "Rivera",
        "vendor": "LatticeClear",
    },
    {
        "id": "wk-long-latency-workshop",
        "title": "Latency Workshop Notes — Market Structure (synthetic)",
        "sev": "SEV-3",
        "rate": "61 percent",
        "time_e": "14:42",
        "witness": "Chen",
        "vendor": "PulseFeed",
    },
    {
        "id": "wk-long-cyber-briefing",
        "title": "Cyber Briefing Transcript — Vendor Incident (synthetic)",
        "sev": "SEV-1",
        "rate": "19 percent",
        "time_e": "07:08",
        "witness": "Adler",
        "vendor": "NightOwl SOC",
    },
    {
        "id": "wk-long-liquidity-panel",
        "title": "Liquidity Panel Transcript — Cancel Storm (synthetic)",
        "sev": "SEV-2",
        "rate": "53 percent",
        "time_e": "11:05",
        "witness": "Okoye",
        "vendor": "BlueRibbon Matching",
    },
]

REPOS = [
    ("tiny-calc", "scaleInterest", "SECRET_MARKER"),
    ("tiny-ledger", "postEntry", "LEDGER_LOCK"),
    ("tiny-router", "routePacket", "ROUTE_TOKEN"),
    ("tiny-parser", "parseLine", "PARSE_FLAG"),
    ("tiny-cache", "evictKey", "CACHE_SALT"),
    ("tiny-queue", "enqueueJob", "QUEUE_SIG"),
    ("tiny-auth", "verifyToken", "AUTH_PEPPER"),
    ("tiny-metrics", "recordGauge", "METRIC_TAG"),
]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_artifact_heading_title(title: str) -> bool:
    """TOC leader-dot lines and numbered list/procedure steps — not real sections."""
    t = (title or "").strip()
    if not t:
        return True
    if "..." in t or "…" in t or re.search(r"\.\s+\.\s+\.", t) or re.search(r"\.{3,}", t):
        return True
    if re.search(r"\s{2,}\d+\s*$", t) and "." in t:
        return True
    m = re.match(r"^(\d+(?:\.\d+)*)\s+(.+)$", t)
    if m:
        rest = m.group(2)
        if re.match(
            r"^(If|Verify|Create|The|A|An|When|For|Note|Ensure|Confirm|Check)\b",
            rest,
        ):
            return True
    return False


def slug_section(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower().strip()).strip("-")
    return f"sec-{s}"[:80]


def fetch(url: str) -> bytes:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "ClawQL-pageindex-ab/0.2-hard"})
    with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
        return resp.read()


def ensure_rfc(doc_id: str, url: str) -> Path:
    SEED.mkdir(parents=True, exist_ok=True)
    path = SEED / f"{doc_id}.txt"
    if path.exists() and path.stat().st_size > 1000:
        return path
    print(f"fetch {doc_id} …", file=sys.stderr)
    path.write_bytes(fetch(url))
    print(f"  {path.stat().st_size} bytes", file=sys.stderr)
    return path


def rfc_to_markdown(doc_id: str, raw: str) -> str:
    """Best-effort: promote numbered RFC section headers to ATX headings."""
    lines = raw.replace("\r\n", "\n").split("\n")
    out: list[str] = [f"# {doc_id.upper()}", ""]
    # Capture title from early non-empty lines
    title = doc_id.upper()
    for line in lines[:80]:
        if re.search(r"[A-Za-z]{4,}", line) and "RFC" not in line and len(line.strip()) > 10:
            if not line.startswith(" ") or "Notation" in line or "Protocol" in line:
                t = line.strip()
                if 10 < len(t) < 120 and not t.startswith("Request for Comments"):
                    title = t
                    break
    out[0] = f"# {title}"

    section_re = re.compile(
        r"^(?P<num>\d+(?:\.\d+){0,5})\.?\s+(?P<title>[A-Z][^\n]{2,90})$"
    )
    for line in lines:
        m = section_re.match(line.strip())
        if m and not line.startswith("    "):
            promoted = f"{m.group('num')} {m.group('title').strip()}"
            # Skip TOC / list-step lines — they skewed fair-test golds and trees.
            if is_artifact_heading_title(promoted):
                out.append(line)
                continue
            depth = m.group("num").count(".") + 1
            depth = min(max(depth, 2), 4)
            hashes = "#" * depth
            out.append("")
            out.append(f"{hashes} {promoted}")
            out.append("")
        else:
            out.append(line)
    return "\n".join(out) + "\n"


def extract_rfc_facts(doc_id: str, markdown: str) -> dict:
    """Pull a few high-signal facts for keys (deterministic heuristics)."""
    facts: dict = {"doc_id": doc_id}
    # RFC number
    m = re.search(r"Request for Comments:\s*(\d+)", markdown, re.I)
    facts["rfc_number"] = m.group(1) if m else doc_id.replace("rfc", "")
    # Category
    m = re.search(r"Category:\s*([A-Za-z \-]+)", markdown)
    facts["category"] = (m.group(1).strip() if m else "Standards Track")[:40]
    # A distinctive quoted / MUST phrase early in body
    m = re.search(r"\b(MUST|SHALL|REQUIRED)\b[^\n]{10,120}", markdown)
    facts["normative_snippet"] = m.group(0).strip() if m else "MUST"
    # Find a mid-document unique-ish token (year or acronym)
    years = re.findall(r"\b(20\d{2})\b", markdown)
    facts["year"] = years[0] if years else "2015"
    # Real ATX headings only (TOC / list-step artifacts excluded)
    heads = [
        h.strip()
        for h in re.findall(r"^#{2,4}\s+(.+)$", markdown, re.M)
        if not is_artifact_heading_title(h)
    ]
    facts["first_section"] = heads[0] if heads else "1 Introduction"
    # Buried: pick a heading near 60% through *valid* headings
    if heads:
        facts["buried_section"] = heads[min(len(heads) - 1, max(1, int(len(heads) * 0.6)))]
    else:
        facts["buried_section"] = "Appendix"
    # Obsoletes line
    m = re.search(r"Obsoletes:\s*([0-9, ]+)", markdown)
    facts["obsoletes"] = m.group(1).strip() if m else ""
    return facts


def noise_paragraphs(n: int, seed: str) -> str:
    chunks = []
    for i in range(n):
        chunks.append(
            f"### Boilerplate block {i + 1} ({seed})\n\n"
            f"This section restates general compliance language for {seed}. "
            f"It intentionally contains no evaluation markers. Parties acknowledge "
            f"standard representations, warranties, and notice procedures. "
            f"Cross-references to schedules {i + 1} through {i + 3} are placeholders only. "
            f"Nothing in this boilerplate states principal, margin, leverage, severity, "
            f"or facility fee figures used by the gold keys.\n"
        )
    return "\n".join(chunks)


def write_long_pdf(spec: dict) -> tuple[str, list[dict]]:
    """Long Docling-imperfect credit doc with buried markers after noise."""
    title = spec["title"]
    body = f"""# {title}

CONVERTED FROM PDF — imperfect headings; tables as prose.

## ARTICLE I — DEFINITIONS

Borrower means **{spec['borrower']}**. Agreement Date means September 1, 2026.

## ARTICLE II — THE CREDITS

### Section 2.01 Commitments

Lenders commit to make Loans. (Commitment size appears later in schedules after conversion noise.)

### Section 2.02 Interest

Interest accrues at Term SOFR plus a margin described in the pricing schedule below the noise blocks.

## ARTICLE III — REPRESENTATIONS

### Section 3.01 Organization

Borrower is duly organized. This article does not state numeric covenants.

{noise_paragraphs(18, spec['id'])}

## miscellaneous provisions that look like a heading

This block mimics a bad Docling heading. The **amortization schedule start date** is **{spec['amort_date']}**, even though nothing in the title says amortization.

## ARTICLE IV — COVENANTS

### Section 4.01 Affirmative covenants

Borrower shall maintain insurance and provide quarterly certificates.

### Section 4.02 Negative covenants

Borrower shall not incur Indebtedness except Permitted Indebtedness. Maximum leverage ratio is **{spec['leverage']}**.

## ARTICLE V — EVENTS OF DEFAULT

Standard event-of-default language. No facility fee here.

{noise_paragraphs(8, spec['id'] + "-tail")}

## schedules

Schedule 1 lists subsidiary guarantors. The maximum aggregate principal of the Loans is **{spec['principal']}**. Interest margin over Term SOFR is **{spec['margin']}**. The facility fee on unused commitments is **{spec['fee']}** per annum.
"""
    sections = [
        {"id": slug_section(t), "title": t}
        for t in re.findall(r"^#{1,3}\s+(.+)$", body, re.M)
        if not is_artifact_heading_title(t)
    ]
    return body, sections


def write_long_weak(spec: dict) -> tuple[str, list[dict]]:
    title = spec["title"]
    filler = "\n\n".join(
        f"[Speaker {i}] Discussed market structure topic {i} without stating severity codes, "
        f"cancel rates, or vendor names used in the gold key."
        for i in range(1, 40)
    )
    body = f"""# {title}

[Chair] We convened after the incident. Opening remarks omit quantitative details.

{filler}

[Witness {spec['witness']}] For the record, the incident severity code was **{spec['sev']}**.
The maximum order cancel rate that morning reached **{spec['rate']}**.
The outage began at **{spec['time_e']}** Eastern. The primary vendor implicated was **{spec['vendor']}**.

{filler}

[Speaker X] No executive compensation packages were discussed in this session.
"""
    sections = [{"id": slug_section(title), "title": title}]
    return body, sections


def write_repo(name: str, fn: str, marker: str) -> None:
    root = CODE / name
    (root / "src").mkdir(parents=True, exist_ok=True)
    (root / "test").mkdir(parents=True, exist_ok=True)
    (root / "package.json").write_text(
        json.dumps({"name": name, "type": "module", "private": True}, indent=2) + "\n",
        encoding="utf-8",
    )
    (root / "src" / "core.ts").write_text(
        f'export const {marker} = "{marker}";\n\n'
        f"export function {fn}(n: number): number {{\n"
        f"  // {marker}\n"
        f"  return n * 1.01;\n"
        f"}}\n",
        encoding="utf-8",
    )
    (root / "src" / "index.ts").write_text(
        f'export {{ {fn} }} from "./core.js";\n', encoding="utf-8"
    )
    (root / "test" / "core.test.ts").write_text(
        f'import {{ {fn} }} from "../src/core.js";\n'
        f"if ({fn}(100) <= 100) throw new Error('expected growth');\n",
        encoding="utf-8",
    )


def rfc_keys(doc_id: str, facts: dict, i: int) -> list[dict]:
    base = f"hc-rfc-{i:02d}"
    keys = [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "exact_term",
            "question": f"What is the RFC number for document {doc_id}?",
            "normalized_answer": facts["rfc_number"],
            "accepted_variants": [facts["rfc_number"], f"RFC {facts['rfc_number']}"],
            "gold_sections": [],
            "unanswerable": False,
            "notes": "answer in header/status block",
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "section_lookup",
            "question": f"What is the first numbered section heading in {doc_id}?",
            "normalized_answer": facts["first_section"],
            "accepted_variants": [facts["first_section"].split(" ", 1)[-1][:40]],
            "gold_sections": [slug_section(facts["first_section"])],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "buried_detail",
            "question": f"Which mid-document section heading appears near 60% depth in {doc_id}?",
            "normalized_answer": facts["buried_section"],
            "accepted_variants": [facts["buried_section"][:48]],
            "gold_sections": [slug_section(facts["buried_section"])],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "exact_term",
            "question": f"What Category line does {doc_id} declare?",
            "normalized_answer": facts["category"],
            "accepted_variants": [facts["category"]],
            "gold_sections": [],
            "unanswerable": False,
        },
        # q05 MUST/SHALL quote removed: empty gold_sections → cite-impossible for every arm.
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "not_in_document",
            "question": f"What is the CEO bonus multiplier stated in {doc_id}?",
            "normalized_answer": "",
            "accepted_variants": [],
            "gold_sections": [],
            "unanswerable": True,
        },
    ]
    # q07: Obsoletes only when present. Do NOT fall back to "earliest publication
    # year" — empty gold_sections + often a bogus body year (e.g. 2070).
    if facts.get("obsoletes"):
        keys.append(
            {
                "id": f"{base}-q07",
                "document_id": doc_id,
                "stratum": "well_structured",
                "question_type": "exact_term",
                "question": f"Which RFC(s) does {doc_id} obsolete?",
                "normalized_answer": facts["obsoletes"],
                "accepted_variants": [x.strip() for x in facts["obsoletes"].split(",") if x.strip()],
                "gold_sections": [],
                "unanswerable": False,
                "notes": "header metadata; gold_sections empty by design (status block)",
            }
        )
    keys.append(
        {
            "id": f"{base}-q08",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "cross_section",
            "question": f"Give the RFC number and Category for {doc_id}.",
            "normalized_answer": f"{facts['rfc_number']}; {facts['category']}",
            "accepted_variants": [facts["rfc_number"], facts["category"]],
            "gold_sections": [],
            "unanswerable": False,
            "notes": "header metadata; gold_sections empty by design (status block)",
        }
    )
    return keys


def pdf_keys(spec: dict, i: int) -> list[dict]:
    doc_id = spec["id"]
    base = f"hc-pdf-{i:02d}"
    return [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "exact_term",
            "question": "What is the maximum aggregate principal of the Loans?",
            "normalized_answer": spec["principal"],
            "accepted_variants": [spec["principal"].replace("USD ", "").replace(",", "")],
            "gold_sections": ["sec-schedules"],
            "unanswerable": False,
            "notes": "buried after boilerplate noise",
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "buried_detail",
            "question": "What interest margin over Term SOFR applies?",
            "normalized_answer": spec["margin"],
            "accepted_variants": [spec["margin"].replace("%", "")],
            "gold_sections": ["sec-schedules"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "misleading_heading",
            "question": "When does amortization begin?",
            "normalized_answer": spec["amort_date"],
            "accepted_variants": [spec["amort_date"]],
            "gold_sections": ["sec-miscellaneous-provisions-that-look-like-a-heading"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "exact_term",
            "question": "What is the maximum leverage ratio?",
            "normalized_answer": spec["leverage"],
            "accepted_variants": [spec["leverage"].replace("x", "")],
            "gold_sections": ["sec-section-4-02-negative-covenants"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q05",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "buried_detail",
            "question": "What is the facility fee on unused commitments?",
            "normalized_answer": spec["fee"],
            "accepted_variants": [spec["fee"]],
            "gold_sections": ["sec-schedules"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "cross_section",
            "question": "Who is the Borrower and what is the commitment size?",
            "normalized_answer": f"{spec['borrower']}; {spec['principal']}",
            "accepted_variants": [spec["borrower"], spec["principal"]],
            "gold_sections": ["sec-article-i-definitions", "sec-schedules"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q07",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "section_lookup",
            "question": "Which article states negative covenants including leverage?",
            "normalized_answer": "ARTICLE IV — COVENANTS",
            "accepted_variants": ["ARTICLE IV", "4.02", "Negative covenants"],
            "gold_sections": ["sec-article-iv-covenants", "sec-section-4-02-negative-covenants"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q08",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "not_in_document",
            "question": "What is the Borrower's Moody's credit rating?",
            "normalized_answer": "",
            "accepted_variants": [],
            "gold_sections": [],
            "unanswerable": True,
        },
    ]


def weak_keys(spec: dict, gold: list[str], i: int) -> list[dict]:
    doc_id = spec["id"]
    base = f"hc-wk-{i:02d}"
    return [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "exact_term",
            "question": f"What incident severity code did Witness {spec['witness']} assign?",
            "normalized_answer": spec["sev"],
            "accepted_variants": [spec["sev"].lower()],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "buried_detail",
            "question": "What was the maximum order cancel rate that morning?",
            "normalized_answer": spec["rate"],
            "accepted_variants": [spec["rate"].replace(" percent", "%")],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "section_lookup",
            "question": "When did the outage begin (Eastern)?",
            "normalized_answer": spec["time_e"],
            "accepted_variants": [spec["time_e"].lstrip("0")],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "exact_term",
            "question": "Which vendor was primarily implicated?",
            "normalized_answer": spec["vendor"],
            "accepted_variants": [spec["vendor"]],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q05",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "cross_section",
            "question": f"What severity and cancel rate did {spec['witness']} report?",
            "normalized_answer": f"{spec['sev']}; {spec['rate']}",
            "accepted_variants": [spec["sev"], spec["rate"]],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "misleading_heading",
            "question": "Is there a dedicated severity schedule section with tables?",
            "normalized_answer": "No dedicated schedule",
            "accepted_variants": ["flat transcript", "No", "no dedicated"],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q07",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "buried_detail",
            "question": "Were executive compensation packages discussed?",
            "normalized_answer": "No",
            "accepted_variants": ["not discussed", "No"],
            "gold_sections": gold,
            "unanswerable": False,
        },
        {
            "id": f"{base}-q08",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "not_in_document",
            "question": "What was the CEO compensation package discussed?",
            "normalized_answer": "",
            "accepted_variants": [],
            "gold_sections": [],
            "unanswerable": True,
        },
    ]


def code_keys(name: str, fn: str, marker: str, i: int) -> list[dict]:
    base = f"hc-code-{i:02d}"
    return [
        {
            "id": f"{base}-q01",
            "document_id": name,
            "stratum": "code",
            "question_type": "exact_term",
            "question": f"Which function contains {marker}?",
            "normalized_answer": fn,
            "accepted_variants": [fn, f"{fn}()"],
            "gold_sections": ["src/core.ts"],
            "unanswerable": False,
            "notes": "code stratum",
        },
        {
            "id": f"{base}-q02",
            "document_id": name,
            "stratum": "code",
            "question_type": "section_lookup",
            "question": f"What file exports {fn}?",
            "normalized_answer": "src/index.ts",
            "accepted_variants": ["index.ts", "src/index.ts"],
            "gold_sections": ["src/index.ts"],
            "unanswerable": False,
            "notes": "code stratum",
        },
        {
            "id": f"{base}-q03",
            "document_id": name,
            "stratum": "code",
            "question_type": "buried_detail",
            "question": f"What constant string equals {marker}?",
            "normalized_answer": marker,
            "accepted_variants": [marker],
            "gold_sections": ["src/core.ts"],
            "unanswerable": False,
            "notes": "code stratum",
        },
        {
            "id": f"{base}-q04",
            "document_id": name,
            "stratum": "code",
            "question_type": "not_in_document",
            "question": "What is the production Kubernetes namespace?",
            "normalized_answer": "",
            "accepted_variants": [],
            "gold_sections": [],
            "unanswerable": True,
            "notes": "code stratum",
        },
    ]


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    DOCS.mkdir(parents=True)
    CODE.mkdir(parents=True)
    MAPS.mkdir(parents=True)

    documents = []
    keys: list[dict] = []

    # Well-structured: RFCs
    for i, (doc_id, url) in enumerate(RFC_URLS, 1):
        try:
            path = ensure_rfc(doc_id, url)
        except Exception as err:  # noqa: BLE001
            print(f"skip {doc_id}: {err}", file=sys.stderr)
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        md = rfc_to_markdown(doc_id, raw)
        facts = extract_rfc_facts(doc_id, md)
        out = DOCS / f"{doc_id}.md"
        out.write_text(md, encoding="utf-8")
        heads = [
            t
            for t in re.findall(r"^#{1,4}\s+(.+)$", md, re.M)
            if not is_artifact_heading_title(t)
        ]
        sections = [{"id": slug_section(t), "title": t} for t in heads[:200]]
        (MAPS / f"{doc_id}.json").write_text(
            json.dumps({"document_id": doc_id, "sections": sections, "source_url": url}, indent=2)
            + "\n",
            encoding="utf-8",
        )
        documents.append(
            {
                "id": doc_id,
                "stratum": "well_structured",
                "path": f"docs/{doc_id}.md",
                "sha256": sha256_text(md),
                "token_estimate": max(1, len(md) // 4),
                "fits_arm_d": len(md) // 4 < 120_000,
                "source_url": url,
            }
        )
        keys.extend(rfc_keys(doc_id, facts, i))

    # Converted PDF long synthetics
    for i, spec in enumerate(PDF_DOCS, 1):
        body, sections = write_long_pdf(spec)
        (DOCS / f"{spec['id']}.md").write_text(body, encoding="utf-8")
        (MAPS / f"{spec['id']}.json").write_text(
            json.dumps({"document_id": spec["id"], "sections": sections}, indent=2) + "\n",
            encoding="utf-8",
        )
        documents.append(
            {
                "id": spec["id"],
                "stratum": "converted_pdf",
                "path": f"docs/{spec['id']}.md",
                "sha256": sha256_text(body),
                "token_estimate": max(1, len(body) // 4),
                "fits_arm_d": False,
            }
        )
        keys.extend(pdf_keys(spec, i))

    # Weak long synthetics
    for i, spec in enumerate(WEAK_DOCS, 1):
        body, sections = write_long_weak(spec)
        (DOCS / f"{spec['id']}.md").write_text(body, encoding="utf-8")
        (MAPS / f"{spec['id']}.json").write_text(
            json.dumps({"document_id": spec["id"], "sections": sections}, indent=2) + "\n",
            encoding="utf-8",
        )
        gold = [sections[0]["id"]]
        documents.append(
            {
                "id": spec["id"],
                "stratum": "weakly_structured",
                "path": f"docs/{spec['id']}.md",
                "sha256": sha256_text(body),
                "token_estimate": max(1, len(body) // 4),
                "fits_arm_d": False,
            }
        )
        keys.extend(weak_keys(spec, gold, i))

    repos = []
    for i, (name, fn, marker) in enumerate(REPOS, 1):
        write_repo(name, fn, marker)
        repos.append({"id": name, "path": f"code/{name}", "stratum": "code"})
        keys.extend(code_keys(name, fn, marker, i))

    # Cross-document list across two RFCs (text path; not ontology)
    if len(documents) >= 2:
        a, b = documents[0], documents[1]
        keys.append(
            {
                "id": "hc-list-q01",
                "document_id": a["id"],
                "stratum": "well_structured",
                "question_type": "cross_document_list",
                "question": f"List the RFC numbers for {a['id']} and {b['id']}.",
                "normalized_answer": f"{a['id'].replace('rfc','')}; {b['id'].replace('rfc','')}",
                "accepted_variants": [
                    a["id"].replace("rfc", ""),
                    b["id"].replace("rfc", ""),
                ],
                "gold_sections": [],
                "unanswerable": False,
                "related_document_ids": [a["id"], b["id"]],
                "notes": "cross-document; Harvey/ExtractBench excluded",
            }
        )

    KEYS.write_text(
        "\n".join(json.dumps(k, ensure_ascii=False) for k in keys) + "\n", encoding="utf-8"
    )
    commit = (
        subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT.parents[1]).decode().strip()
    )
    spec = ROOT.parents[1] / "docs" / "benchmarks" / "pageindex-ab-eval-spec-v0.1.md"
    manifest = {
        "tag": "pageindex-ab-v1-hard-candidate",
        "created_at": "2026-09-29T03:10:00Z",
        "harness_commit": commit,
        "spec_path": "docs/benchmarks/pageindex-ab-eval-spec-v0.1.md",
        "spec_sha256": sha256_text(spec.read_text(encoding="utf-8")),
        "model_primary": "google/gemini-2.5-flash-lite",
        "documents": documents,
        "repos": repos,
        "questions_path": "keys.jsonl",
        "questions_sha256": sha256_text(KEYS.read_text(encoding="utf-8")),
        "decision_rules_version": "0.2",
        "spent": False,
        "notes": (
            "Hard candidate: public RFCs + long synthetics. "
            "Harvey LAB and ExtractBench fixtures excluded. Not spent."
        ),
        "exclusions": ["harvey-labs", "extractbench", "contaminated-smoke"],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        """# Hard candidate (`pageindex-ab-v1-hard-candidate`)

Public IETF RFCs (well-structured) + long synthetic Docling/weak docs + 8 tiny repos.

**Not spent.** Harvey LAB and ExtractBench fixtures are excluded by design.
Human second-pass still required before confirmatory `pageindex-ab-v1` freeze.
""",
        encoding="utf-8",
    )

    # Refresh seed manifest for whatever RFCs we have
    seed_docs = []
    for p in sorted(SEED.glob("rfc*.txt")):
        data = p.read_bytes()
        seed_docs.append(
            {
                "id": p.stem,
                "stratum": "well_structured",
                "path": f"seed/{p.name}",
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
                "seed_only": True,
            }
        )
    (SEED / "seed-manifest.json").write_text(
        json.dumps({"documents": seed_docs}, indent=2) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "ok": True,
                "documents": len(documents),
                "repos": len(repos),
                "keys": len(keys),
                "out": str(OUT),
                "well_structured": sum(1 for d in documents if d["stratum"] == "well_structured"),
                "converted_pdf": sum(1 for d in documents if d["stratum"] == "converted_pdf"),
                "weakly_structured": sum(1 for d in documents if d["stratum"] == "weakly_structured"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
