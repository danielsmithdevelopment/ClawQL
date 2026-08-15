#!/usr/bin/env python3
"""Harvey LAB IDP → DuckDB: generalized Matter field fill + gold SQL checks.

Pipeline roles:

  1. Path / matter catalogue — credit facility / secured / revolver path signals
  2. Multi-doc catalogue — execution CAs, memos, term sheets (never SAFE for MFN)
  3. Tika — bytes → text
  4. LangExtract sidecar — schema-guided grounded field fill (firm_knowledge_matter)
  5. DuckDB — typed columns + SQL gold for 006–010 / 011–025

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
    detect_hsr_filing,
    extract_matter_fields,
)
from clawql_lab_matter_schema import (  # noqa: E402
    FIELD_ALWAYS_ON_MAINT,
    FIELD_BORROWER_CONTROL,
    FIELD_COVENANT_LITE,
    FIELD_EBITDA_ADDBACKS,
    FIELD_MAINTENANCE_FC,
    FIELD_MFN_CREDIT,
    FIELD_SPRINGING_FC,
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
GOLD_025_PRECISION = GOLD_024 | {"1021-00001"}
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

# 006–008 — HSR filings (folder-precise; precision allows 3 more without requiring them)
GOLD_006_REQUIRED = {"1001-00001", "1003-00001"}
GOLD_006_PRECISION = {
    "1001-00001",
    "1003-00001",
    "1032-00001",
    "1038-00001",
    "1041-00001",
}
GOLD_008 = "1003-00001"
GOLD_008_DATE = "2024-06-18"

# 009 — live maintenance (excl. cov-lite with no always-on); 010 — that cov-lite set
GOLD_009_REQUIRED = {
    "1006-00001",
    "1010-00001",
    "1012-00001",
    "1013-00001",
    "1019-00002",
    "1036-00001",
    "1038-00002",
    "1042-00001",
    "1043-00001",
}
GOLD_009_PRECISION = {
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
GOLD_010_REQUIRED_ANY = {"1005-00001", "1021-00001"}
GOLD_010_PRECISION = {"1005-00001", "1021-00001", "1008-00001", "1038-00002"}

# 016 — always-on vs springing-only on Fix-7 credit-12
GOLD_016_ALWAYS = {
    "1006-00001",
    "1042-00001",
    "1012-00001",
    "1010-00001",
    "1043-00001",
    "1036-00001",
    "1013-00001",
    "1019-00002",
}
GOLD_016_SPRINGING = {"1021-00001", "1008-00001", "1038-00002", "1005-00001"}
GOLD_016_YOY = {
    2021: (1, 1),
    2022: (1, 2),
    2023: (1, 3),
    2024: (2, 2),
    2025: (1, 2),
    2026: (2, 2),
}

# 017 — population ≠ credit-12; rates proven on POP017 field fills
POP017_EXTRA = {"1001-00007", "1041-00003", "1007-00001"}
POP017 = GOLD_011 | POP017_EXTRA
GOLD_017_SPONSOR_AB = {
    "1005-00001",
    "1006-00001",
    "1012-00001",
    "1043-00001",
    "1019-00002",
    "1042-00001",
}
GOLD_017_CORPORATE_AB = {"1021-00001", "1038-00002", "1010-00001"}

# 019 — recall 11 required; precision allow-list includes springing-only 1005
GOLD_019_REQUIRED = {
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
GOLD_019_PRECISION = GOLD_019_REQUIRED | {"1005-00001"}

# 021 / 022 — secured credit facilities (incl. Fairwater without executed CA on file)
GOLD_021 = set(GOLD_018)  # same 12 credit facilities, all secured

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
    has_springing_financial_covenant: bool = False
    has_always_on_maintenance_covenant: bool = False
    has_maintenance_financial_covenant: bool = False
    borrower_control: str | None = None
    has_hsr_filing: bool = False
    hsr_filing_date: date | None = None
    hsr_filing_proof_doc: str = ""
    practice_area: str = "Other"
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


def process_matter(
    matter_dir: Path,
    *,
    force_extract: bool = False,
    hsr_only: bool = False,
) -> MatterRow:
    matter_id = matter_dir.name
    credit = detect_credit_facility(matter_dir)
    row = MatterRow(
        matter_id=matter_id,
        is_credit_facility=bool(credit["is_credit_facility"]),
        practice_area=str(credit.get("practice_area") or "Other"),
    )
    hsr = detect_hsr_filing(matter_dir)
    if hsr.get("filed"):
        row.has_hsr_filing = True
        row.hsr_filing_proof_doc = str(hsr.get("proof_doc") or "")
        row.practice_area = "Antitrust & Competition"
        fd = hsr.get("filing_date")
        if isinstance(fd, date):
            row.hsr_filing_date = fd
        elif isinstance(fd, str) and fd:
            for fmt in ("%Y-%m-%d", "%B %d %Y", "%b %d %Y"):
                try:
                    row.hsr_filing_date = datetime.strptime(
                        fd.replace(",", ""), fmt
                    ).date()
                    break
                except ValueError:
                    continue

    if hsr_only:
        return row
    if not row.is_credit_facility and not force_extract:
        return row

    fields = extract_matter_fields(matter_dir)
    # POP017 extras: only borrower_control for 017 rates — do not pollute
    # credit-cohort SQL (020 incremental, 011 add-backs, etc.).
    if force_extract and not row.is_credit_facility:
        bc = fields.get(FIELD_BORROWER_CONTROL)
        row.borrower_control = str(bc).strip().lower() if bc else None
        row.parse_provider = str(fields.get("parse_provider") or "")
        row.extract_provider = str(fields.get("extract_provider") or "")
        row.source_doc = str(fields.get("source_doc") or "")
        row.docs_scanned = int(fields.get("docs_scanned") or 0)
        return row

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
    row.has_springing_financial_covenant = bool(fields.get(FIELD_SPRINGING_FC))
    row.has_always_on_maintenance_covenant = bool(fields.get(FIELD_ALWAYS_ON_MAINT))
    row.has_maintenance_financial_covenant = bool(fields.get(FIELD_MAINTENANCE_FC))
    bc = fields.get(FIELD_BORROWER_CONTROL)
    row.borrower_control = str(bc).strip().lower() if bc else None
    row.parse_provider = str(fields.get("parse_provider") or "")
    row.extract_provider = str(fields.get("extract_provider") or "")
    row.source_doc = str(fields.get("source_doc") or "")
    row.docs_scanned = int(fields.get("docs_scanned") or 0)
    return row


def _row_to_duck(row: MatterRow) -> dict[str, Any]:
    return {
        "matter_id": row.matter_id,
        "practice_area": row.practice_area,
        "is_credit_facility": row.is_credit_facility,
        "is_secured": row.is_secured,
        "deal_date": row.deal_date.isoformat() if row.deal_date else None,
        "has_incremental_facility": row.has_incremental_facility,
        "facility_amount_usd": row.facility_amount_usd,
        "has_revolving_facility": row.has_revolving_facility,
        "mentions_springing_lien": row.mentions_springing_lien,
        "has_hsr_filing": row.has_hsr_filing,
        "hsr_filing_date": row.hsr_filing_date.isoformat()
        if row.hsr_filing_date
        else None,
        "hsr_filing_proof_doc": row.hsr_filing_proof_doc,
        FIELD_EBITDA_ADDBACKS: row.has_adjusted_ebitda_addbacks,
        proof_column(FIELD_EBITDA_ADDBACKS): row.has_adjusted_ebitda_addbacks_proof_doc,
        FIELD_COVENANT_LITE: row.is_covenant_lite,
        proof_column(FIELD_COVENANT_LITE): row.is_covenant_lite_proof_doc,
        FIELD_MFN_CREDIT: row.has_mfn_in_credit_agreement,
        proof_column(FIELD_MFN_CREDIT): row.has_mfn_in_credit_agreement_proof_doc,
        FIELD_SPRINGING_FC: row.has_springing_financial_covenant,
        FIELD_ALWAYS_ON_MAINT: row.has_always_on_maintenance_covenant,
        FIELD_MAINTENANCE_FC: row.has_maintenance_financial_covenant,
        FIELD_BORROWER_CONTROL: row.borrower_control,
    }


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
        WHERE is_credit_facility
          AND has_incremental_facility
          AND facility_amount_usd IS NOT NULL
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
    out["016_always"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND {FIELD_ALWAYS_ON_MAINT}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["016_springing"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND {FIELD_SPRINGING_FC}
              AND NOT {FIELD_ALWAYS_ON_MAINT}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["016_yoy"] = {
        int(y): (int(k), int(n))
        for y, k, n in con.execute(
            f"""
            SELECT year(deal_date) AS y,
                   count(*) FILTER (WHERE {FIELD_ALWAYS_ON_MAINT}) AS k,
                   count(*) AS n
            FROM matters
            WHERE is_credit_facility AND deal_date IS NOT NULL
            GROUP BY 1
            ORDER BY 1
            """
        ).fetchall()
    }
    out["017_rates"] = {
        str(bc): (int(with_ab), int(n))
        for bc, with_ab, n in con.execute(
            f"""
            SELECT {FIELD_BORROWER_CONTROL} AS bc,
                   count(*) FILTER (WHERE {FIELD_EBITDA_ADDBACKS}) AS with_ab,
                   count(*) AS n
            FROM matters
            WHERE matter_id IN ({",".join("?" for _ in POP017)})
              AND {FIELD_BORROWER_CONTROL} IS NOT NULL
            GROUP BY 1
            ORDER BY 1
            """,
            list(sorted(POP017)),
        ).fetchall()
    }
    out["017_sponsor_ab"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE matter_id IN ({",".join("?" for _ in POP017)})
              AND {FIELD_BORROWER_CONTROL} = 'sponsor'
              AND {FIELD_EBITDA_ADDBACKS}
            ORDER BY matter_id
            """,
            list(sorted(POP017)),
        ).fetchall()
    ]
    out["017_corporate_ab"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE matter_id IN ({",".join("?" for _ in POP017)})
              AND {FIELD_BORROWER_CONTROL} = 'corporate'
              AND {FIELD_EBITDA_ADDBACKS}
            ORDER BY matter_id
            """,
            list(sorted(POP017)),
        ).fetchall()
    ]
    out["019_ids"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND {FIELD_MAINTENANCE_FC}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["006_ids"] = [
        r[0]
        for r in con.execute(
            """
            SELECT matter_id FROM matters
            WHERE has_hsr_filing
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["008_top"] = con.execute(
        """
        SELECT matter_id, hsr_filing_date, hsr_filing_proof_doc FROM matters
        WHERE has_hsr_filing AND hsr_filing_date IS NOT NULL
        ORDER BY hsr_filing_date DESC LIMIT 3
        """
    ).fetchall()
    out["009_ids"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility
              AND {FIELD_MAINTENANCE_FC}
              AND NOT (
                {FIELD_COVENANT_LITE}
                AND NOT {FIELD_ALWAYS_ON_MAINT}
              )
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["010_ids"] = [
        r[0]
        for r in con.execute(
            f"""
            SELECT matter_id FROM matters
            WHERE is_credit_facility
              AND {FIELD_COVENANT_LITE}
              AND NOT {FIELD_ALWAYS_ON_MAINT}
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["021_ids"] = [
        r[0]
        for r in con.execute(
            """
            SELECT matter_id FROM matters
            WHERE is_credit_facility AND is_secured
            ORDER BY matter_id
            """
        ).fetchall()
    ]
    out["025_ids"] = list(out["024_ids"])
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
    # 017 population extras (Financing / non–Fix-7) — field fill only; not credit cohort
    extra_dirs = [
        args.dms / mid
        for mid in sorted(POP017_EXTRA)
        if (args.dms / mid).is_dir()
    ]
    # 006–008 HSR filing matters (folder-precise path scan; no full IDP fill)
    hsr_dirs = [
        p
        for p in sorted(args.dms.iterdir())
        if p.is_dir() and detect_hsr_filing(p).get("filed")
    ]
    print(
        f"Processing {len(credit_dirs)} credit-facility + {len(extra_dirs)} "
        f"POP017-extra + {len(hsr_dirs)} HSR-filing matters from {args.dms}"
    )

    rows: list[MatterRow] = []
    duck_rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    work: list[tuple[Path, bool, bool]] = (
        [(d, False, False) for d in credit_dirs]
        + [(d, True, False) for d in extra_dirs]
        + [(d, False, True) for d in hsr_dirs]
    )
    for matter_dir, force, hsr_only in work:
        if matter_dir.name in seen and not hsr_only:
            continue
        if matter_dir.name in seen and hsr_only:
            # Merge HSR flags onto existing credit/extra row if overlap (unlikely).
            continue
        seen.add(matter_dir.name)
        try:
            row = process_matter(
                matter_dir, force_extract=force, hsr_only=hsr_only and not force
            )
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {matter_dir.name}: {exc}")
            row = MatterRow(
                matter_id=matter_dir.name,
                is_credit_facility=not force and not hsr_only,
                parse_provider=f"error:{type(exc).__name__}",
            )
        rows.append(row)
        duck_rows.append(_row_to_duck(row))
        print(
            f"  {row.matter_id}: secured={row.is_secured} date={row.deal_date} "
            f"ebitda={row.has_adjusted_ebitda_addbacks} covlite={row.is_covenant_lite} "
            f"mfn={row.has_mfn_in_credit_agreement} always={row.has_always_on_maintenance_covenant} "
            f"spring_fc={row.has_springing_financial_covenant} "
            f"maint={row.has_maintenance_financial_covenant} "
            f"control={row.borrower_control} hsr={row.has_hsr_filing} "
            f"hsr_date={row.hsr_filing_date} docs={row.docs_scanned} "
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
    print(
        "016 always:",
        checks["016_always"],
        "gold?",
        set(checks["016_always"]) == GOLD_016_ALWAYS,
    )
    print(
        "016 springing-only:",
        checks["016_springing"],
        "gold?",
        set(checks["016_springing"]) == GOLD_016_SPRINGING,
    )
    print("016 YoY:", checks["016_yoy"], "gold?", checks["016_yoy"] == GOLD_016_YOY)
    print(
        "017 rates:",
        checks["017_rates"],
        "gold 6/8+3/4?",
        checks["017_rates"].get("sponsor") == (6, 8)
        and checks["017_rates"].get("corporate") == (3, 4),
    )
    print(
        "017 sponsor AB:",
        checks["017_sponsor_ab"],
        "gold?",
        set(checks["017_sponsor_ab"]) == GOLD_017_SPONSOR_AB,
    )
    print(
        "017 corporate AB:",
        checks["017_corporate_ab"],
        "gold?",
        set(checks["017_corporate_ab"]) == GOLD_017_CORPORATE_AB,
    )
    pred019 = set(checks["019_ids"])
    print(
        "019 ids:",
        checks["019_ids"],
        "gold?",
        GOLD_019_REQUIRED <= pred019 <= GOLD_019_PRECISION,
    )
    pred006 = set(checks["006_ids"])
    print(
        "006/007 HSR filings:",
        checks["006_ids"],
        "gold?",
        GOLD_006_REQUIRED <= pred006 <= GOLD_006_PRECISION,
    )
    top008 = checks["008_top"]
    print(
        "008 most recent HSR:",
        top008,
        "gold?",
        bool(top008)
        and top008[0][0] == GOLD_008
        and str(top008[0][1]) == GOLD_008_DATE,
    )
    pred009 = set(checks["009_ids"])
    print(
        "009 live maintenance:",
        checks["009_ids"],
        "gold?",
        GOLD_009_REQUIRED <= pred009 <= GOLD_009_PRECISION,
    )
    pred010 = set(checks["010_ids"])
    print(
        "010 cov-lite no always-on:",
        checks["010_ids"],
        "gold?",
        bool(pred010 & GOLD_010_REQUIRED_ANY) and pred010 <= GOLD_010_PRECISION,
    )
    print(
        "021/022 secured:",
        checks["021_ids"],
        "gold?",
        set(checks["021_ids"]) == GOLD_021,
    )
    pred025 = set(checks["025_ids"])
    print(
        "025 revolver:",
        checks["025_ids"],
        "gold?",
        GOLD_024 <= pred025 <= GOLD_025_PRECISION,
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
            "016_always_gold": set(checks["016_always"]) == GOLD_016_ALWAYS,
            "016_springing_gold": set(checks["016_springing"]) == GOLD_016_SPRINGING,
            "016_yoy_gold": checks["016_yoy"] == GOLD_016_YOY,
            "017_rates_gold": checks["017_rates"].get("sponsor") == (6, 8)
            and checks["017_rates"].get("corporate") == (3, 4),
            "017_sponsor_ab_gold": set(checks["017_sponsor_ab"]) == GOLD_017_SPONSOR_AB,
            "017_corporate_ab_gold": set(checks["017_corporate_ab"])
            == GOLD_017_CORPORATE_AB,
            "019_gold": GOLD_019_REQUIRED <= set(checks["019_ids"]) <= GOLD_019_PRECISION,
            "006_gold": GOLD_006_REQUIRED <= set(checks["006_ids"]) <= GOLD_006_PRECISION,
            "007_gold": GOLD_006_REQUIRED <= set(checks["006_ids"]) <= GOLD_006_PRECISION,
            "008_gold": bool(checks["008_top"])
            and checks["008_top"][0][0] == GOLD_008
            and str(checks["008_top"][0][1]) == GOLD_008_DATE,
            "009_gold": GOLD_009_REQUIRED <= set(checks["009_ids"]) <= GOLD_009_PRECISION,
            "010_gold": bool(set(checks["010_ids"]) & GOLD_010_REQUIRED_ANY)
            and set(checks["010_ids"]) <= GOLD_010_PRECISION,
            "021_gold": set(checks["021_ids"]) == GOLD_021,
            "022_gold": set(checks["021_ids"]) == GOLD_021,
            "025_gold": GOLD_024 <= set(checks["025_ids"]) <= GOLD_025_PRECISION,
            "011_ids": checks["011_ids"],
            "014_ids": checks["014_ids"],
            "015_top": [[a, str(b) if b else None] for a, b in checks["015_top"]],
            "016_always": checks["016_always"],
            "016_springing": checks["016_springing"],
            "016_yoy": {str(k): list(v) for k, v in checks["016_yoy"].items()},
            "017_rates": {k: list(v) for k, v in checks["017_rates"].items()},
            "019_ids": checks["019_ids"],
            "006_ids": checks["006_ids"],
            "008_top": [
                [a, str(b) if b else None, c] for a, b, c in checks["008_top"]
            ],
            "009_ids": checks["009_ids"],
            "010_ids": checks["010_ids"],
            "021_ids": checks["021_ids"],
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
        "006_gold",
        "007_gold",
        "008_gold",
        "009_gold",
        "010_gold",
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
        "016_always_gold",
        "016_springing_gold",
        "016_yoy_gold",
        "017_rates_gold",
        "017_sponsor_ab_gold",
        "017_corporate_ab_gold",
        "019_gold",
        "021_gold",
        "022_gold",
        "025_gold",
    ]
    all_ok = all(summary["checks"][k] for k in gold_keys)
    print("ALL_GOLD", all_ok)
    failed = [k for k in gold_keys if not summary["checks"][k]]
    if failed:
        print("FAILED", failed)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
