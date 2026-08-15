#!/usr/bin/env python3
"""Harvey LAB IDP → DuckDB: generalized Matter field fill + gold SQL checks.

Pipeline roles:

  1. Path / matter catalogue — credit facility / secured / revolver path signals
  2. Multi-doc catalogue — execution CAs, memos, term sheets (never SAFE for MFN)
  3. Tika — bytes → text
  4. LangExtract sidecar — schema-guided grounded field fill (firm_knowledge_matter)
  5. DuckDB — typed columns + SQL gold for 011–015 / 018 / 020 / 023 / 024

Usage:
  python3 integrations/harvey-labs/scripts/idp_matter_pipeline.py \\
    --dms /path/to/dms/matters

Requires: Tika on :9998, LangExtract on :8090, duckdb Python package.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

_ADAPTERS = Path(__file__).resolve().parents[1] / "harness" / "adapters"
if str(_ADAPTERS) not in sys.path:
    sys.path.insert(0, str(_ADAPTERS))

from clawql_lab_duckdb import (  # noqa: E402
    build_matters_duckdb,
    extract_matter_fields,
)
from clawql_lab_matter_schema import (  # noqa: E402
    FIELD_COVENANT_LITE,
    FIELD_EBITDA_ADDBACKS,
    FIELD_MFN_CREDIT,
    proof_column,
)
from clawql_lab_session import detect_credit_facility  # noqa: E402

TIKA_URL = "http://127.0.0.1:9998"
LANGEXTRACT_URL = "http://127.0.0.1:8090"

GOLD_018 = {
    "1005-00001",
    "1006-00001",
    "1008-00001",
    "1010-00001",
    "1012-00001",
    "1013-00001",
    "1019-00002",
    "1021-00001",
    "1036-00001",
    "1038-00002",
    "1042-00001",
    "1043-00001",
}
GOLD_024 = {"1008-00001", "1012-00001", "1019-00002", "1038-00002"}
GOLD_020 = "1005-00001"
GOLD_023 = "1013-00001"
GOLD_011 = {
    "1005-00001",
    "1006-00001",
    "1010-00001",
    "1012-00001",
    "1019-00002",
    "1021-00001",
    "1038-00002",
    "1042-00001",
    "1043-00001",
}
GOLD_014 = {"1005-00001", "1021-00001"}
GOLD_013 = "1008-00001"
GOLD_015 = "1019-00002"


@dataclass
class MatterRow:
    matter_id: str
    is_credit_facility: bool = False
    is_secured: bool = False
    deal_date: date | None = None
    has_incremental_facility: bool = False
    facility_amount_usd: float | None = None
    has_revolving_facility: bool = False
    mentions_springing_lien: bool = False
    has_adjusted_ebitda_addbacks: bool = False
    has_adjusted_ebitda_addbacks_proof_doc: str = ""
    is_covenant_lite: bool = False
    is_covenant_lite_proof_doc: str = ""
    has_mfn_in_credit_agreement: bool = False
    has_mfn_in_credit_agreement_proof_doc: str = ""
    parse_provider: str = ""
    extract_provider: str = ""
    source_doc: str = ""
    docs_scanned: int = 0
    extractions: list[dict[str, Any]] = field(default_factory=list)


def wait_health(url: str, name: str) -> None:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        print(f"OK {name}: {body[:120]}")
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"{name} not healthy at {url}: {exc}") from exc


def process_matter(matter_dir: Path) -> MatterRow:
    matter_id = matter_dir.name
    credit = detect_credit_facility(matter_dir)
    row = MatterRow(
        matter_id=matter_id,
        is_credit_facility=bool(credit["is_credit_facility"]),
    )
    if not row.is_credit_facility:
        return row

    fields = extract_matter_fields(matter_dir)
    row.is_secured = bool(fields.get("is_secured"))
    dd = fields.get("deal_date")
    if isinstance(dd, date):
        row.deal_date = dd
    elif isinstance(dd, str) and dd:
        for fmt in ("%Y-%m-%d", "%B %d %Y", "%b %d %Y"):
            try:
                row.deal_date = datetime.strptime(dd.replace(",", ""), fmt).date()
                break
            except ValueError:
                continue
    row.has_incremental_facility = bool(fields.get("has_incremental_facility"))
    row.facility_amount_usd = fields.get("facility_amount_usd")
    row.has_revolving_facility = bool(fields.get("has_revolving_facility"))
    row.mentions_springing_lien = bool(fields.get("mentions_springing_lien"))
    row.has_adjusted_ebitda_addbacks = bool(fields.get(FIELD_EBITDA_ADDBACKS))
    row.has_adjusted_ebitda_addbacks_proof_doc = str(
        fields.get(proof_column(FIELD_EBITDA_ADDBACKS)) or ""
    )
    row.is_covenant_lite = bool(fields.get(FIELD_COVENANT_LITE))
    row.is_covenant_lite_proof_doc = str(
        fields.get(proof_column(FIELD_COVENANT_LITE)) or ""
    )
    row.has_mfn_in_credit_agreement = bool(fields.get(FIELD_MFN_CREDIT))
    row.has_mfn_in_credit_agreement_proof_doc = str(
        fields.get(proof_column(FIELD_MFN_CREDIT)) or ""
    )
    row.parse_provider = str(fields.get("parse_provider") or "")
    row.extract_provider = str(fields.get("extract_provider") or "")
    row.source_doc = str(fields.get("source_doc") or "")
    row.docs_scanned = int(fields.get("docs_scanned") or 0)
    return row


def run_sql_checks(db_path: Path) -> dict[str, Any]:
    import duckdb

    con = duckdb.connect(str(db_path), read_only=True)
    out: dict[str, Any] = {}
    out["018"] = con.execute(
        """
        SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k,
               count(*) AS n
        FROM matters WHERE is_credit_facility
        """
    ).fetchone()
    out["018_ids"] = [
        r[0]
        for r in con.execute(
            "SELECT matter_id FROM matters WHERE is_credit_facility ORDER BY matter_id"
        ).fetchall()
    ]
    out["024_ids"] = [
        r[0]
        for r in con.execute(
            """
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND has_revolving_facility
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["020_top"] = con.execute(
        """
        SELECT matter_id, facility_amount_usd FROM matters
        WHERE has_incremental_facility AND facility_amount_usd IS NOT NULL
        ORDER BY facility_amount_usd DESC LIMIT 3
        """
    ).fetchall()
    out["023_top"] = con.execute(
        """
        SELECT matter_id, deal_date FROM matters
        WHERE is_credit_facility AND is_secured AND deal_date IS NOT NULL
        ORDER BY deal_date DESC LIMIT 5
        """
    ).fetchall()
    out["011_ids"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND {FIELD_EBITDA_ADDBACKS}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["012_k"] = con.execute(
        "SELECT count(*) FROM matters WHERE mentions_springing_lien"
    ).fetchone()[0]
    out["014_ids"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND {FIELD_COVENANT_LITE}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["013_mfn"] = con.execute(
        f"""
        SELECT matter_id FROM matters
        WHERE matter_id = ? AND {FIELD_MFN_CREDIT}
        """,
        [GOLD_013],
    ).fetchone()
    out["015_top"] = con.execute(
        f"""
        SELECT matter_id, deal_date FROM matters
        WHERE is_credit_facility AND {FIELD_MFN_CREDIT} AND deal_date IS NOT NULL
        ORDER BY deal_date DESC LIMIT 3
        """
    ).fetchall()
    con.close()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dms",
        type=Path,
        default=Path(
            "/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"
        ),
    )
    ap.add_argument("--limit-matters", type=int, default=0, help="0 = all credit facilities")
    ap.add_argument("--db", type=Path, default=Path("/tmp/idp-matters.duckdb"))
    args = ap.parse_args()

    wait_health(f"{TIKA_URL}/version", "Tika")
    wait_health(f"{LANGEXTRACT_URL}/health", "LangExtract")

    # Point extractors at local sidecars.
    import os

    os.environ.setdefault("CLAWQL_LAB_TIKA_URL", TIKA_URL)
    os.environ.setdefault("CLAWQL_LAB_LANGEXTRACT_URL", LANGEXTRACT_URL)

    credit_dirs = [
        p
        for p in sorted(args.dms.iterdir())
        if p.is_dir() and detect_credit_facility(p)["is_credit_facility"]
    ]
    if args.limit_matters:
        credit_dirs = credit_dirs[: args.limit_matters]
    print(f"Processing {len(credit_dirs)} credit-facility matters from {args.dms}")

    rows: list[MatterRow] = []
    duck_rows: list[dict[str, Any]] = []
    for matter_dir in credit_dirs:
        try:
            row = process_matter(matter_dir)
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {matter_dir.name}: {exc}")
            row = MatterRow(
                matter_id=matter_dir.name,
                is_credit_facility=True,
                parse_provider=f"error:{type(exc).__name__}",
            )
        rows.append(row)
        duck_rows.append(
            {
                "matter_id": row.matter_id,
                "is_credit_facility": row.is_credit_facility,
                "is_secured": row.is_secured,
                "deal_date": row.deal_date.isoformat() if row.deal_date else None,
                "has_incremental_facility": row.has_incremental_facility,
                "facility_amount_usd": row.facility_amount_usd,
                "has_revolving_facility": row.has_revolving_facility,
                "mentions_springing_lien": row.mentions_springing_lien,
                FIELD_EBITDA_ADDBACKS: row.has_adjusted_ebitda_addbacks,
                proof_column(FIELD_EBITDA_ADDBACKS): row.has_adjusted_ebitda_addbacks_proof_doc,
                FIELD_COVENANT_LITE: row.is_covenant_lite,
                proof_column(FIELD_COVENANT_LITE): row.is_covenant_lite_proof_doc,
                FIELD_MFN_CREDIT: row.has_mfn_in_credit_agreement,
                proof_column(FIELD_MFN_CREDIT): row.has_mfn_in_credit_agreement_proof_doc,
            }
        )
        print(
            f"  {row.matter_id}: secured={row.is_secured} date={row.deal_date} "
            f"ebitda={row.has_adjusted_ebitda_addbacks} covlite={row.is_covenant_lite} "
            f"mfn={row.has_mfn_in_credit_agreement} docs={row.docs_scanned} "
            f"via {row.parse_provider}/{row.extract_provider}"
        )

    build_matters_duckdb(args.db, duck_rows)
    checks = run_sql_checks(args.db)
    print("\n=== SQL checks ===")
    print("018 k,n:", checks["018"], "ids:", checks["018_ids"])
    print("018 gold match cohort:", set(checks["018_ids"]) == GOLD_018)
    print("018 k==0:", checks["018"][0] == 0)
    print("024 ids:", checks["024_ids"], "gold match:", set(checks["024_ids"]) == GOLD_024)
    print("020 top:", checks["020_top"], "gold?", checks["020_top"] and checks["020_top"][0][0] == GOLD_020)
    print("023 top:", checks["023_top"], "gold?", checks["023_top"] and checks["023_top"][0][0] == GOLD_023)
    print("011 ids:", checks["011_ids"], "gold?", set(checks["011_ids"]) == GOLD_011)
    print("012 springing count:", checks["012_k"], "gold=0?", checks["012_k"] == 0)
    print("014 ids:", checks["014_ids"], "gold?", set(checks["014_ids"]) == GOLD_014)
    print("013 Lumos MFN:", checks["013_mfn"], "gold?", bool(checks["013_mfn"]))
    print(
        "015 top:",
        checks["015_top"],
        "gold?",
        bool(checks["015_top"]) and checks["015_top"][0][0] == GOLD_015,
    )

    summary = {
        "db": str(args.db),
        "rows": [asdict(r) for r in rows],
        "checks": {
            "018_cohort_gold": set(checks["018_ids"]) == GOLD_018,
            "018_k0": checks["018"][0] == 0,
            "024_gold": set(checks["024_ids"]) == GOLD_024,
            "020_gold": bool(checks["020_top"]) and checks["020_top"][0][0] == GOLD_020,
            "023_gold": bool(checks["023_top"]) and checks["023_top"][0][0] == GOLD_023,
            "011_gold": set(checks["011_ids"]) == GOLD_011,
            "012_gold": checks["012_k"] == 0,
            "014_gold": set(checks["014_ids"]) == GOLD_014,
            "013_gold": bool(checks["013_mfn"]),
            "015_gold": bool(checks["015_top"]) and checks["015_top"][0][0] == GOLD_015,
            "011_ids": checks["011_ids"],
            "014_ids": checks["014_ids"],
            "015_top": [[a, str(b) if b else None] for a, b in checks["015_top"]],
        },
    }

    def _ser(o: Any) -> Any:
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, Path):
            return str(o)
        raise TypeError(type(o))

    out_json = Path("/tmp/idp-matter-pipeline-summary.json")
    out_json.write_text(json.dumps(summary, indent=2, default=_ser), encoding="utf-8")
    print(f"\nWrote {out_json}")

    gold_keys = [
        "018_cohort_gold",
        "018_k0",
        "024_gold",
        "020_gold",
        "023_gold",
        "011_gold",
        "012_gold",
        "014_gold",
        "013_gold",
        "015_gold",
    ]
    all_ok = all(summary["checks"][k] for k in gold_keys)
    print("ALL_GOLD", all_ok)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
