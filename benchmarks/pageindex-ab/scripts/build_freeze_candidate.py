#!/usr/bin/env python3
"""Build pageindex-ab freeze-candidate corpus (24 docs + 8 repos + keys).

Generates deterministic synthetic documents for offline factorial runs.
This is NOT the spent freeze (`pageindex-ab-v1`); humans must re-annotate /
swap real Docling PDFs before the confirmatory scored run. Contaminated-smoke
fixtures are never copied here.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "corpus" / "freeze-candidate"
DOCS = OUT / "docs"
CODE = OUT / "code"
MAPS = OUT / "section-maps"
KEYS = OUT / "keys.jsonl"
MANIFEST = OUT / "candidate-manifest.json"

# Unique markers so extractive grading is unambiguous.
WELL = [
    ("ws-alpha-governance", "Alpha Governance Code", "ALPHA-91", "7.5 years", "11", "USD 3,100"),
    ("ws-beta-reporting", "Beta Reporting Manual", "BETA-44", "5.0 years", "7", "USD 1,800"),
    ("ws-gamma-custody", "Gamma Custody Handbook", "GAMMA-12", "6.25 years", "5", "USD 4,200"),
    ("ws-delta-privacy", "Delta Privacy Rulebook", "DELTA-88", "3.0 years", "13", "USD 900"),
    ("ws-epsilon-markets", "Epsilon Markets Guide", "EPS-03", "8.0 years", "9", "USD 2,750"),
    ("ws-zeta-ops", "Zeta Operations Standard", "ZETA-61", "4.5 years", "15", "USD 1,250"),
    ("ws-eta-risk", "Eta Risk Procedures", "ETA-29", "9.0 years", "6", "USD 5,500"),
    ("ws-theta-audit", "Theta Audit Framework", "THETA-17", "2.75 years", "10", "USD 675"),
]

PDF = [
    ("pdf-meridian-credit", "Meridian Credit Agreement", "USD 125,000,000", "3.75%", "3.5x", "0.40%"),
    ("pdf-northwind-facility", "Northwind Facility Agreement", "USD 80,000,000", "2.95%", "4.0x", "0.25%"),
    ("pdf-redwood-termloan", "Redwood Term Loan", "USD 210,000,000", "4.10%", "3.25x", "0.55%"),
    ("pdf-harbor-revolver", "Harbor Revolving Credit", "USD 45,000,000", "3.15%", "2.75x", "0.30%"),
    ("pdf-summit-bridge", "Summit Bridge Loan", "USD 60,000,000", "5.00%", "5.0x", "0.70%"),
    ("pdf-cascade-abs", "Cascade ABS Indenture", "USD 300,000,000", "1.85%", "1.5x", "0.15%"),
    ("pdf-prairie-mezz", "Prairie Mezzanine Note", "USD 25,000,000", "8.25%", "6.0x", "1.10%"),
    ("pdf-lakeside-capex", "Lakeside CapEx Facility", "USD 95,000,000", "3.40%", "3.0x", "0.35%"),
]

WEAK = [
    ("wk-hearing-markets", "Committee Hearing — Markets", "SEV-2", "41 percent", "09:14", "Rivera"),
    ("wk-standup-platform", "Platform Incident Standup", "SEV-1", "67 percent", "14:02", "Chen"),
    ("wk-townhall-ops", "Ops Town Hall Notes", "SEV-3", "22 percent", "11:30", "Patel"),
    ("wk-debrief-clearing", "Clearing Outage Debrief", "SEV-2", "55 percent", "08:47", "Nguyen"),
    ("wk-panel-liquidity", "Liquidity Panel Transcript", "SEV-4", "18 percent", "16:05", "Brooks"),
    ("wk-interview-risk", "Risk Interview Notes", "SEV-2", "39 percent", "10:19", "Okoye"),
    ("wk-workshop-latency", "Latency Workshop Notes", "SEV-3", "73 percent", "13:41", "Singh"),
    ("wk-briefing-cyber", "Cyber Briefing Transcript", "SEV-1", "12 percent", "07:55", "Adler"),
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


def slug_section(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return f"sec-{s}"[:80]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_well(doc_id: str, title: str, proto: str, retain: str, directors: str, fee: str) -> tuple[str, list[dict]]:
    body = f"""# {title}

Synthetic freeze-candidate document for ClawQL pageindex-ab. Not a real regulation.

## 1. Purpose and scope

This handbook governs reporting for covered entities under the {title} program.

## 2. Defined terms

### 2.1 Covered entity

An institution with more than USD 5 billion in assets under management.

### 2.2 Protocol identifier

The protocol identifier for this handbook is **{proto}**. Systems must cite {proto} in every automated filing.

### 2.3 Reporting cycle

The reporting cycle is quarterly unless a written waiver is granted.

## 3. Filing procedures

### 3.1 Electronic submission

Entities submit filings through the Agency Portal. Filings without the protocol identifier are rejected.

### 3.2 Late filings

Late filings incur a base fee of **{fee}** per business day.

## 4. Retention and audit

### 4.1 Record retention

Institutions must retain source documents for **{retain}** after the filing date.

### 4.2 Audit access

Audit packages must be produced within 15 business days of a request.

## 5. Board governance

### 5.1 Board composition

Each covered entity must maintain a board with **{directors}** directors.

### 5.2 Compensation committee

Compensation committee charters are outside this handbook. See the separate Compensation Manual.

## 6. Cross-cutting obligations

Obligations in sections 2.2 and 4.1 apply jointly: every retained archive must label packages with {proto} and the retention clock of {retain}.
"""
    sections = [
        {"id": slug_section(t), "title": t}
        for t in [
            "1. Purpose and scope",
            "2. Defined terms",
            "2.1 Covered entity",
            "2.2 Protocol identifier",
            "2.3 Reporting cycle",
            "3. Filing procedures",
            "3.1 Electronic submission",
            "3.2 Late filings",
            "4. Retention and audit",
            "4.1 Record retention",
            "4.2 Audit access",
            "5. Board governance",
            "5.1 Board composition",
            "5.2 Compensation committee",
            "6. Cross-cutting obligations",
        ]
    ]
    return body, sections


def write_pdf(doc_id: str, title: str, principal: str, margin: str, leverage: str, fee: str) -> tuple[str, list[dict]]:
    # Imperfect / misleading headings mimic Docling conversion artifacts.
    borrower = f"{title.split()[0]} Holdings LLC"
    body = f"""# {title}

CONVERTED FROM PDF — headings may be imperfect.

## ARTICLE I — DEFINITIONS

Borrower means **{borrower}**.

## ARTICLE II — THE CREDITS

### Section 2.01 Commitments

The maximum aggregate principal of the Loans is **{principal}**.

### Section 2.02 Interest

Interest accrues at Term SOFR plus a margin of **{margin}**.

## miscellaneous provisions that look like a heading

Amortization begins on **October 15, 2026** notwithstanding any earlier heading that mentions amortization calendars.

## ARTICLE IV — COVENANTS

### Section 4.02 Negative covenants

The maximum leverage ratio is **{leverage}**.

## schedules

The facility fee on unused commitments is **{fee}** per annum.
"""
    sections = [
        {"id": slug_section(t), "title": t}
        for t in [
            title,
            "ARTICLE I — DEFINITIONS",
            "ARTICLE II — THE CREDITS",
            "Section 2.01 Commitments",
            "Section 2.02 Interest",
            "miscellaneous provisions that look like a heading",
            "ARTICLE IV — COVENANTS",
            "Section 4.02 Negative covenants",
            "schedules",
        ]
    ]
    return body, sections


def write_weak(doc_id: str, title: str, sev: str, rate: str, time_e: str, witness: str) -> tuple[str, list[dict]]:
    body = f"""# {title}

[Speaker 1] We convened the committee after the clearing incident.

Witness {witness} stated the incident severity code was **{sev}** and that the maximum order cancel rate that morning reached **{rate}**.

The clearing outage began at **{time_e}** Eastern according to the exchange clock.

[Speaker 2] No executive compensation packages were discussed in this session.

Additional remarks concerned market structure and vendor SLAs without introducing new severity codes.
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
        f"""export const {marker} = "{marker}";

export function {fn}(n: number): number {{
  // {marker} must remain in this function for code-stratum keys
  return n * 1.01;
}}
""",
        encoding="utf-8",
    )
    (root / "src" / "index.ts").write_text(
        f"""export {{ {fn} }} from "./core.js";
""",
        encoding="utf-8",
    )
    (root / "test" / "core.test.ts").write_text(
        f"""import {{ {fn} }} from "../src/core.js";
if ({fn}(100) <= 100) throw new Error("expected growth");
""",
        encoding="utf-8",
    )


def well_keys(doc_id: str, proto: str, retain: str, directors: str, fee: str, i: int) -> list[dict]:
    base = f"fc-ws-{i:02d}"
    return [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "exact_term",
            "question": f"What is the protocol identifier in {doc_id}?",
            "normalized_answer": proto,
            "accepted_variants": [proto.lower(), proto.upper()],
            "gold_sections": ["sec-2-2-protocol-identifier"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "section_lookup",
            "question": "Where are record retention rules defined?",
            "normalized_answer": "4.1 Record retention",
            "accepted_variants": ["section 4.1", "4.1", "Record retention"],
            "gold_sections": ["sec-4-1-record-retention"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "buried_detail",
            "question": "How long must source documents be retained?",
            "normalized_answer": retain,
            "accepted_variants": [retain.replace(" years", ""), retain],
            "gold_sections": ["sec-4-1-record-retention"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "cross_section",
            "question": "What protocol identifier must label archives kept for the retention period?",
            "normalized_answer": proto,
            "accepted_variants": [proto.lower()],
            "gold_sections": [
                "sec-2-2-protocol-identifier",
                "sec-4-1-record-retention",
                "sec-6-cross-cutting-obligations",
            ],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q05",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "exact_term",
            "question": "How many directors must the board have?",
            "normalized_answer": directors,
            "accepted_variants": [directors],
            "gold_sections": ["sec-5-1-board-composition"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "exact_term",
            "question": "What is the late filing base fee per business day?",
            "normalized_answer": fee,
            "accepted_variants": [fee.replace("USD ", "$"), fee],
            "gold_sections": ["sec-3-2-late-filings"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q07",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "misleading_heading",
            "question": "Where can I find rules about executive pay committees?",
            "normalized_answer": "Compensation Manual",
            "accepted_variants": ["separate Compensation Manual", "outside this handbook"],
            "gold_sections": ["sec-5-2-compensation-committee"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q08",
            "document_id": doc_id,
            "stratum": "well_structured",
            "question_type": "not_in_document",
            "question": "What is the CEO bonus multiplier?",
            "normalized_answer": "",
            "accepted_variants": [],
            "gold_sections": [],
            "unanswerable": True,
        },
    ]


def pdf_keys(doc_id: str, principal: str, margin: str, leverage: str, fee: str, i: int) -> list[dict]:
    base = f"fc-pdf-{i:02d}"
    borrower = doc_id.split("-")[1].capitalize() + " Holdings LLC"
    return [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "exact_term",
            "question": "What is the maximum aggregate principal of the Loans?",
            "normalized_answer": principal,
            "accepted_variants": [principal.replace("USD ", "").replace(",", ""), principal],
            "gold_sections": ["sec-section-2-01-commitments"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "buried_detail",
            "question": "What interest margin over Term SOFR applies?",
            "normalized_answer": margin,
            "accepted_variants": [margin.replace("%", ""), margin],
            "gold_sections": ["sec-section-2-02-interest"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "misleading_heading",
            "question": "When does amortization begin?",
            "normalized_answer": "October 15, 2026",
            "accepted_variants": ["2026-10-15", "Oct 15, 2026"],
            "gold_sections": ["sec-miscellaneous-provisions-that-look-like-a-heading"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "exact_term",
            "question": "What is the maximum leverage ratio?",
            "normalized_answer": leverage,
            "accepted_variants": [leverage.replace("x", ""), leverage],
            "gold_sections": ["sec-section-4-02-negative-covenants"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q05",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "buried_detail",
            "question": "What is the facility fee on unused commitments?",
            "normalized_answer": fee,
            "accepted_variants": [fee, fee.replace("%", " percent")],
            "gold_sections": ["sec-schedules"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "cross_section",
            "question": "Who is the Borrower and what is the commitment size?",
            "normalized_answer": f"{borrower}; {principal}",
            "accepted_variants": [borrower, principal],
            "gold_sections": ["sec-article-i-definitions", "sec-section-2-01-commitments"],
            "unanswerable": False,
        },
        {
            "id": f"{base}-q07",
            "document_id": doc_id,
            "stratum": "converted_pdf",
            "question_type": "section_lookup",
            "question": "Which section states the interest margin?",
            "normalized_answer": "Section 2.02 Interest",
            "accepted_variants": ["2.02", "Section 2.02"],
            "gold_sections": ["sec-section-2-02-interest"],
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


def weak_keys(doc_id: str, sev: str, rate: str, time_e: str, witness: str, i: int) -> list[dict]:
    base = f"fc-wk-{i:02d}"
    return [
        {
            "id": f"{base}-q01",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "exact_term",
            "question": f"What incident severity code did Witness {witness} assign?",
            "normalized_answer": sev,
            "accepted_variants": [sev.lower(), sev],
            "gold_sections": [],  # filled after map write
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q02",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "buried_detail",
            "question": "What was the maximum order cancel rate that morning?",
            "normalized_answer": rate,
            "accepted_variants": [rate.replace(" percent", "%"), rate],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q03",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "section_lookup",
            "question": "When did the clearing outage begin (Eastern)?",
            "normalized_answer": time_e,
            "accepted_variants": [time_e.lstrip("0"), time_e],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q04",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "exact_term",
            "question": "Which witness assigned the severity code?",
            "normalized_answer": witness,
            "accepted_variants": [witness],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q05",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "buried_detail",
            "question": f"Did the session discuss executive compensation? (Witness {witness} context)",
            "normalized_answer": "No",
            "accepted_variants": ["No", "not discussed", "were not discussed"],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q06",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "cross_section",
            "question": f"What severity and cancel rate did {witness} report?",
            "normalized_answer": f"{sev}; {rate}",
            "accepted_variants": [sev, rate],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
        },
        {
            "id": f"{base}-q07",
            "document_id": doc_id,
            "stratum": "weakly_structured",
            "question_type": "misleading_heading",
            "question": "Is there a dedicated severity schedule section?",
            "normalized_answer": "No dedicated schedule",
            "accepted_variants": ["flat transcript", "no dedicated", "No"],
            "gold_sections": [],
            "unanswerable": False,
            "_fill_gold_from_map": True,
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
    base = f"fc-code-{i:02d}"
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
            "notes": "code stratum; gold_sections are file paths",
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
        import shutil

        shutil.rmtree(OUT)
    DOCS.mkdir(parents=True)
    CODE.mkdir(parents=True)
    MAPS.mkdir(parents=True)

    documents = []
    keys: list[dict] = []

    for i, (doc_id, title, proto, retain, directors, fee) in enumerate(WELL, 1):
        body, sections = write_well(doc_id, title, proto, retain, directors, fee)
        path = DOCS / f"{doc_id}.md"
        path.write_text(body, encoding="utf-8")
        (MAPS / f"{doc_id}.json").write_text(
            json.dumps({"document_id": doc_id, "sections": sections}, indent=2) + "\n",
            encoding="utf-8",
        )
        documents.append(
            {
                "id": doc_id,
                "stratum": "well_structured",
                "path": f"docs/{doc_id}.md",
                "sha256": sha256_text(body),
                "token_estimate": max(1, len(body) // 4),
                "fits_arm_d": True,
            }
        )
        keys.extend(well_keys(doc_id, proto, retain, directors, fee, i))

    for i, (doc_id, title, principal, margin, leverage, fee) in enumerate(PDF, 1):
        body, sections = write_pdf(doc_id, title, principal, margin, leverage, fee)
        path = DOCS / f"{doc_id}.md"
        path.write_text(body, encoding="utf-8")
        (MAPS / f"{doc_id}.json").write_text(
            json.dumps({"document_id": doc_id, "sections": sections}, indent=2) + "\n",
            encoding="utf-8",
        )
        documents.append(
            {
                "id": doc_id,
                "stratum": "converted_pdf",
                "path": f"docs/{doc_id}.md",
                "sha256": sha256_text(body),
                "token_estimate": max(1, len(body) // 4),
                "fits_arm_d": True,
            }
        )
        keys.extend(pdf_keys(doc_id, principal, margin, leverage, fee, i))

    for i, (doc_id, title, sev, rate, time_e, witness) in enumerate(WEAK, 1):
        body, sections = write_weak(doc_id, title, sev, rate, time_e, witness)
        path = DOCS / f"{doc_id}.md"
        path.write_text(body, encoding="utf-8")
        (MAPS / f"{doc_id}.json").write_text(
            json.dumps({"document_id": doc_id, "sections": sections}, indent=2) + "\n",
            encoding="utf-8",
        )
        gold = [sections[0]["id"]]
        documents.append(
            {
                "id": doc_id,
                "stratum": "weakly_structured",
                "path": f"docs/{doc_id}.md",
                "sha256": sha256_text(body),
                "token_estimate": max(1, len(body) // 4),
                "fits_arm_d": True,
            }
        )
        for k in weak_keys(doc_id, sev, rate, time_e, witness, i):
            if k.pop("_fill_gold_from_map", False) and not k["unanswerable"]:
                k["gold_sections"] = gold
            keys.append(k)

    repos = []
    for i, (name, fn, marker) in enumerate(REPOS, 1):
        write_repo(name, fn, marker)
        repos.append({"id": name, "path": f"code/{name}", "stratum": "code"})
        keys.extend(code_keys(name, fn, marker, i))

    # Cross-document list questions (structured path home turf — text-only gold for offline)
    list_q = {
        "id": "fc-list-q01",
        "document_id": "ws-alpha-governance",
        "stratum": "well_structured",
        "question_type": "cross_document_list",
        "question": "List protocol identifiers for Alpha and Beta handbooks.",
        "normalized_answer": "ALPHA-91; BETA-44",
        "accepted_variants": ["ALPHA-91", "BETA-44"],
        "gold_sections": ["sec-2-2-protocol-identifier"],
        "unanswerable": False,
        "notes": "cross-document; second annotator required before freeze",
        "related_document_ids": ["ws-alpha-governance", "ws-beta-reporting"],
    }
    keys.append(list_q)

    # Strip non-schema helper keys before write
    clean_keys = []
    for k in keys:
        clean_keys.append({kk: vv for kk, vv in k.items() if not kk.startswith("_")})

    KEYS.write_text("\n".join(json.dumps(k, ensure_ascii=False) for k in clean_keys) + "\n", encoding="utf-8")

    commit = (
        subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT.parents[1]).decode().strip()
    )
    spec = ROOT.parents[1] / "docs" / "benchmarks" / "pageindex-ab-eval-spec-v0.1.md"
    spec_sha = sha256_text(spec.read_text(encoding="utf-8"))
    questions_sha = sha256_text(KEYS.read_text(encoding="utf-8"))

    manifest = {
        "tag": "pageindex-ab-v1-candidate",
        "created_at": "2026-09-29T00:00:00Z",
        "harness_commit": commit,
        "spec_path": "docs/benchmarks/pageindex-ab-eval-spec-v0.1.md",
        "spec_sha256": spec_sha,
        "model_primary": "openrouter/deepseek/deepseek-chat",
        "documents": documents,
        "repos": repos,
        "questions_path": "keys.jsonl",
        "questions_sha256": questions_sha,
        "decision_rules_version": "0.2",
        "spent": False,
        "notes": (
            "Synthetic freeze-candidate for offline factorial. Replace with Docling "
            "PDFs + second-annotator keys before confirmatory scored run. Never cite "
            "contaminated-smoke."
        ),
        "predictions": {
            "pageindex_effect": "positive_small",
            "bm25_effect": "near_zero_on_short_docs",
            "codegraph_effect": "positive_on_code_stratum",
            "expected_new_default": "H-idf-pi pending agent confirmation",
            "recorded_by": "cloud-agent",
            "recorded_at": "2026-09-29T00:00:00Z",
            "rationale": "Contaminated-smoke offline pilot showed +0.15 PI / 0 BM25; confirm on candidate then agent matrix.",
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    (OUT / "README.md").write_text(
        """# Freeze candidate (`pageindex-ab-v1-candidate`)

Synthetic 24-doc + 8-repo set for offline factorial debugging.

**Not spent.** Do not flip product defaults from this set alone.
Human second-pass annotation + real Docling PDFs required before `pageindex-ab-v1` freeze.
Contaminated-smoke fixtures must never be merged here.
""",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "documents": len(documents),
                "repos": len(repos),
                "keys": len(clean_keys),
                "out": str(OUT),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
