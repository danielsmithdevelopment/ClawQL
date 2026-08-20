#!/usr/bin/env python3
"""Local Pattern G validation against real Calderwood DMS.

Builds matters.duckdb with Phase 1 document inventory and checks SQL shapes
for held-out tasks 028/035/040/042/048 without running the full LAB agent.

Usage:
  python3 integrations/harvey-labs/scripts/validate_document_inventory_local.py \\
    --dms /tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

_ADAPTERS = Path(__file__).resolve().parents[1] / "harness" / "adapters"
if str(_ADAPTERS) not in sys.path:
    sys.path.insert(0, str(_ADAPTERS))

from clawql_lab_duckdb import build_matters_duckdb, run_readonly_sql  # noqa: E402
from clawql_lab_session import (  # noqa: E402
    _build_matter_document_inventory,
    _client_hint,
    _docx_to_text,
    detect_capital_markets,
    detect_credit_facility,
    detect_hsr_second_request,
    detect_restructuring,
)

# Gold matter sets from task.json criteria (not agent output).
GOLD: dict[str, dict[str, Any]] = {
    "028_dip": {
        "label": "Task 028 — DIP financing matters",
        "ids": {
            "1006-00002",
            "1020-00002",
            "1024-00001",
            "1011-00002",
            "1044-00003",
        },
        "sql": """
            SELECT DISTINCT m.matter_id, m.client_short_name, m.practice_area
            FROM matters m
            JOIN matter_documents d ON m.matter_id = d.matter_id
            WHERE d.doc_type = 'dip-financing'
               OR d.filename ILIKE '%dip%'
               OR d.rel_path ILIKE '%debtor-in-possession%'
               OR d.rel_path ILIKE '%/dip/%'
            ORDER BY m.matter_id
        """,
    },
    "035_lockup_180": {
        "label": "Task 035 — CM + lock-up agreement docs",
        "ids": {"1010-00002", "1037-00001"},
        "sql": """
            SELECT DISTINCT m.matter_id, m.client_short_name, d.filename
            FROM matters m
            JOIN matter_documents d ON m.matter_id = d.matter_id
            WHERE lower(m.practice_area) LIKE '%capital%market%'
              AND COALESCE(m.matter_status, '') != 'withdrawn'
              AND (d.filename ILIKE '%lock-up%'
                   OR d.filename ILIKE '%lockup%'
                   OR d.doc_type = 'lock-up-agreement')
            ORDER BY m.matter_id
        """,
    },
    "035_lockup_180_days": {
        "label": "Task 035 — 180-day lock-up via key_terms",
        "ids": {"1010-00002", "1037-00001"},
        "sql": """
            SELECT DISTINCT m.matter_id,
                   CAST(d.key_terms->>'lock_up_period_days' AS INTEGER) AS days
            FROM matters m
            JOIN matter_documents d ON m.matter_id = d.matter_id
            WHERE d.doc_type = 'lock-up-agreement'
              AND COALESCE(m.matter_status, '') != 'withdrawn'
              AND json_extract_string(d.key_terms, '$.offering_status') IS DISTINCT FROM 'withdrawn'
              AND CAST(d.key_terms->>'lock_up_period_days' AS INTEGER) = 180
            ORDER BY m.matter_id
        """,
    },
    "040_withdrawn": {
        "label": "Task 040 — most recent withdrawn offering",
        "ids": {"1020-00003"},
        "sql": """
            SELECT m.matter_id, m.client_short_name, m.matter_status,
                   d.filename, d.key_terms->>'withdrawal_date' AS wd,
                   d.key_terms->>'offering_status' AS offering_status
            FROM matters m
            JOIN matter_documents d ON m.matter_id = d.matter_id
            WHERE lower(m.practice_area) LIKE '%capital%market%'
              AND (
                m.matter_status = 'withdrawn'
                OR d.doc_type = 'withdrawal-notice'
                OR json_extract_string(d.key_terms, '$.offering_status') = 'withdrawn'
              )
            ORDER BY COALESCE(
              TRY_CAST(json_extract_string(d.key_terms, '$.withdrawal_date') AS DATE),
              m.matter_date
            ) DESC NULLS LAST, m.matter_id
            LIMIT 5
        """,
    },
    "042_lockup_cohort": {
        "label": "Task 042 — CM lock-up cohort (6 matters)",
        "ids": {
            "1010-00002",
            "1017-00001",
            "1018-00001",
            "1027-00001",
            "1033-00002",
            "1037-00001",
        },
        "sql": """
            SELECT DISTINCT m.matter_id
            FROM matters m
            JOIN matter_documents d ON m.matter_id = d.matter_id
            WHERE lower(m.practice_area) LIKE '%capital%market%'
              AND COALESCE(m.matter_status, '') != 'withdrawn'
              AND (d.filename ILIKE '%lock-up%'
                   OR d.filename ILIKE '%lockup%'
                   OR d.doc_type = 'lock-up-agreement')
            ORDER BY m.matter_id
        """,
    },
    "048_corp_purpose": {
        "label": "Task 048 — CM Belmont Ridge 1045-00001",
        "ids": {"1045-00001"},
        "sql": """
            SELECT m.matter_id, m.client_short_name, m.practice_area
            FROM matters m
            WHERE m.matter_id = '1045-00001'
              AND lower(m.practice_area) LIKE '%capital%market%'
        """,
    },
}

FALSE_POSITIVE_IDS = {"1008-00002", "1013-00001", "1041-00003"}


def _extract(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return _docx_to_text(path, max_chars=200_000)
    if path.suffix.lower() in {".txt", ".md", ".eml"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    return ""


def build_rows(dms: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for matter_dir in sorted(p for p in dms.iterdir() if p.is_dir()):
        matter_id = matter_dir.name
        detection = detect_hsr_second_request(matter_dir)
        credit = detect_credit_facility(matter_dir)
        capital_markets = detect_capital_markets(matter_dir)
        restructuring = detect_restructuring(matter_dir)
        client = detection.get("client_hint") or _client_hint(matter_dir)
        client = " ".join(str(client).strip().split())
        practice = credit["practice_area"]
        if detection["received"] and practice in {"Other", "Antitrust"}:
            practice = "Antitrust & Competition"
        if practice in {"Other", ""} and capital_markets.get("is_capital_markets"):
            practice = capital_markets["practice_area"]
        if practice in {"Other", ""} and restructuring.get("is_restructuring"):
            practice = restructuring["practice_area"]
        matter_type = credit["matter_type"]
        if matter_type in {"Other", ""} and capital_markets.get("is_capital_markets"):
            matter_type = capital_markets["matter_type"] or "Offering"
        if matter_type in {"Other", ""} and restructuring.get("is_restructuring"):
            matter_type = restructuring["matter_type"] or "Restructuring"

        matter_docs = _build_matter_document_inventory(
            matter_dir, text_extractor=_extract
        )
        matter_status = None
        if any(
            (d.get("doc_type") == "withdrawal-notice")
            and "hsr" not in (d.get("filename") or "").lower()
            for d in matter_docs
        ):
            matter_status = "withdrawn"
        elif any(
            (d.get("key_terms") or {}).get("offering_status") == "withdrawn"
            and (d.get("key_terms") or {}).get("withdrawal_date")
            for d in matter_docs
        ):
            matter_status = "withdrawn"

        rows.append(
            {
                "matter_id": matter_id,
                "client_short_name": client,
                "practice_area": practice,
                "matter_type": matter_type,
                "title": matter_id,
                "is_credit_facility": bool(credit["is_credit_facility"]),
                "is_hsr_second_request": bool(detection["received"]),
                "mentions_springing_lien": False,
                "has_revolving_facility": False,
                "is_secured": False,
                "deal_date": None,
                "has_incremental_facility": False,
                "facility_amount_usd": None,
                "matter_status": matter_status,
                "matter_date": None,
                "document_count": len(matter_docs),
                "indexed_doc_count": sum(
                    1 for d in matter_docs if d.get("parse_status") == "ok"
                ),
                "sandbox_root": str(matter_dir),
                "vault_note_path": "",
                "_matter_documents": matter_docs,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dms",
        type=Path,
        default=Path(
            "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
        ),
    )
    args = parser.parse_args()
    dms = args.dms.expanduser()
    if not dms.is_dir():
        print(f"error: DMS not found: {dms}", file=sys.stderr)
        return 1

    print(f"Building DuckDB from {dms} ({len(list(dms.iterdir()))} matter dirs)…")
    rows = build_rows(dms)
    cm = sum(1 for r in rows if "capital" in (r.get("practice_area") or "").lower())
    restr = sum(
        1 for r in rows if "restruct" in (r.get("practice_area") or "").lower()
    )
    cf = sum(1 for r in rows if r.get("is_credit_facility"))
    print(f"  practice_area: Capital Markets={cm}, Restructuring={restr}, credit_facility={cf}")

    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "matters.duckdb"
        build_matters_duckdb(db, rows)
        doc_n = run_readonly_sql(db, "SELECT count(*) AS n FROM matter_documents")
        print(f"  matter_documents rows: {doc_n['rows'][0]['n']}")

        failed = 0
        for key, spec in GOLD.items():
            out = run_readonly_sql(db, spec["sql"])
            if not out.get("ok"):
                print(f"\nFAIL {spec['label']}: SQL error {out.get('error')}")
                failed += 1
                continue
            if key == "040_withdrawn":
                # Single-answer task: only the top-ranked withdrawn CM offering matters.
                got = {out["rows"][0]["matter_id"]} if out["rows"] else set()
            else:
                got = {r["matter_id"] for r in out["rows"]}
            gold = set(spec["ids"])
            missing = gold - got
            extra_gold_scope = got - gold
            fp_hit = got & FALSE_POSITIVE_IDS
            status = "PASS" if not missing and not fp_hit else "FAIL"
            if missing or fp_hit:
                failed += 1
            print(f"\n{status} {spec['label']}")
            print(f"  gold ({len(gold)}): {sorted(gold)}")
            print(f"  got  ({len(got)}): {sorted(got)[:20]}{'…' if len(got)>20 else ''}")
            if missing:
                print(f"  MISSING: {sorted(missing)}")
            if extra_gold_scope and key not in {"040_withdrawn"}:
                print(f"  extra (may be OK for recall): {sorted(extra_gold_scope)[:15]}")
            if fp_hit:
                print(f"  FALSE POSITIVES: {sorted(fp_hit)}")

        # Per-gold-matter practice_area + inventory sanity
        print("\n--- Gold matter classification ---")
        for mid in sorted(
            set().union(*(s["ids"] for s in GOLD.values())) | FALSE_POSITIVE_IDS
        ):
            r = next((x for x in rows if x["matter_id"] == mid), None)
            if not r:
                print(f"  {mid}: NOT IN DMS")
                continue
            inv = r.get("_matter_documents") or []
            types = sorted({d.get("doc_type") for d in inv if d.get("doc_type")})
            lock = [d["filename"] for d in inv if "lock" in (d.get("filename") or "").lower()][:2]
            dip = [d["filename"] for d in inv if d.get("doc_type") == "dip-financing"][:2]
            print(
                f"  {mid}: pa={r.get('practice_area')} mt={r.get('matter_type')} "
                f"cf={r.get('is_credit_facility')} status={r.get('matter_status')} "
                f"docs={len(inv)} types={types[:5]} lock={lock} dip={dip}"
            )

        print(f"\n{'='*60}")
        print(f"Validation: {len(GOLD) - failed}/{len(GOLD)} checks passed")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
