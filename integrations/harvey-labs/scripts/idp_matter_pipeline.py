#!/usr/bin/env python3
"""Harvey LAB IDP → DuckDB spike: use each document tool for what it's best at.

Pipeline roles (this environment):

  1. Path / matter catalogue — cheap filesystem signals (secured docs, credit facility)
  2. Tika — bytes → text for .docx (universal parse)
  3. LangExtract sidecar — schema-guided grounded field fill into Matter-shaped JSON
  4. DuckDB — typed columns + SQL (018 / 020 / 023 / 024)

Skipped when not needed for this corpus:

  - Gotenberg — Office→PDF; native .docx goes straight to Tika
  - Stirling — OCR / redact; clean born-digital docx needs neither
  - Docling — layout/OCR-heavy parse; optional upgrade after PDF/scan path

Usage:
  python3 integrations/harvey-labs/scripts/idp_matter_pipeline.py \\
    --dms /path/to/dms/matters [--limit-matters 12]

Requires: Tika on :9998, LangExtract on :8090, duckdb Python package.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

# Allow importing LAB detectors without installing the package.
_ADAPTERS = Path(__file__).resolve().parents[1] / "harness" / "adapters"
if str(_ADAPTERS) not in sys.path:
    sys.path.insert(0, str(_ADAPTERS))

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

SECURED_PATH = re.compile(
    r"security-agreement|ip-security|pledge-agreement|intercreditor-agreement",
    re.I,
)
REVOLVER_PATH = re.compile(r"revolving-loan-note|abl-negotiation-issues-memo", re.I)


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
    parse_provider: str = ""
    extract_provider: str = ""
    source_doc: str = ""
    extractions: list[dict[str, Any]] = field(default_factory=list)


def http_json(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None, timeout: float = 120) -> Any:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def tika_parse(path: Path) -> str:
    """Tika role: universal bytes → text."""
    body = path.read_bytes()
    req = urllib.request.Request(
        f"{TIKA_URL}/tika",
        data=body,
        headers={
            "Accept": "text/plain",
            "Content-Type": "application/octet-stream",
        },
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read().decode("utf-8", errors="replace")


def langextract_matter(text: str, *, doc_id: str) -> dict[str, Any]:
    """LangExtract role: schema-guided grounded fill of Matter fields."""
    payload = {
        "text": text[:180_000],
        "schema_preset": "credit_facility_matter",
        "doc_id": doc_id,
        "write_html": True,
        "prompt_description": (
            "Extract credit-facility Matter fields with character grounding: "
            "deal_date, facility_amount_usd, has_incremental_facility, "
            "has_revolving_facility, mentions_springing_lien, is_secured."
        ),
    }
    data = json.dumps(payload).encode("utf-8")
    return http_json(
        f"{LANGEXTRACT_URL}/extract",
        data=data,
        headers={"content-type": "application/json"},
        timeout=180,
    )


def pick_execution_credit_doc(matter_dir: Path) -> Path | None:
    scored: list[tuple[int, Path]] = []
    for p in matter_dir.rglob("*.docx"):
        rel = str(p.relative_to(matter_dir)).replace("\\", "/")
        name = p.name.lower()
        under = (
            rel.startswith("Transaction Documents/")
            or "/Transaction Documents/" in f"/{rel}"
            or rel.startswith("documents/")
            or "/documents/" in f"/{rel}"
        )
        if not under or "execution" not in name:
            continue
        if any(x in name for x in ("memo", "letter", "issues", "redline", "draft")):
            continue
        if "credit-agreement" not in name and "loan-agreement" not in name:
            continue
        score = 0
        if "credit-agreement" in name:
            score += 10
        if "mezzanine" in name:
            score -= 5
        if "bridge" in name:
            score -= 3
        if "amendment" in name:
            score += 2
        scored.append((score, p))
    if not scored:
        return None
    scored.sort(key=lambda x: (-x[0], str(x[1])))
    return scored[0][1]


def path_is_secured(matter_dir: Path) -> bool:
    for p in matter_dir.rglob("*"):
        if p.is_file() and SECURED_PATH.search(p.name) and "execution" in p.name.lower():
            return True
    return False


def path_has_revolver(matter_dir: Path) -> bool:
    for p in matter_dir.rglob("*"):
        if p.is_file() and REVOLVER_PATH.search(p.name):
            return True
    return False


def parse_date(s: str) -> date | None:
    s = s.replace(",", "").strip()
    for fmt in ("%B %d %Y", "%b %d %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_money(s: str) -> float | None:
    s = s.strip().lower().replace("$", "").replace(",", "")
    mult = 1.0
    if s.endswith("billion"):
        mult = 1e9
        s = s[: -len("billion")].strip()
    elif s.endswith("million"):
        mult = 1e6
        s = s[: -len("million")].strip()
    try:
        return float(s) * mult
    except ValueError:
        return None


def extractions_to_fields(extractions: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for e in extractions:
        cls = e.get("extraction_class")
        text = str(e.get("extraction_text") or "")
        if cls == "deal_date":
            out["deal_date"] = parse_date(text)
        elif cls == "facility_amount_usd":
            out["facility_amount_usd"] = parse_money(text)
        elif cls in {
            "has_incremental_facility",
            "has_revolving_facility",
            "mentions_springing_lien",
            "is_secured",
        }:
            out[cls] = text.strip().lower() in {"true", "yes", "1"}
    return out


def process_matter(matter_dir: Path) -> MatterRow:
    matter_id = matter_dir.name
    credit = detect_credit_facility(matter_dir)
    row = MatterRow(
        matter_id=matter_id,
        is_credit_facility=bool(credit["is_credit_facility"]),
        is_secured=path_is_secured(matter_dir),
        has_revolving_facility=path_has_revolver(matter_dir),
    )
    if not row.is_credit_facility:
        return row

    doc = pick_execution_credit_doc(matter_dir)
    if doc is None:
        row.parse_provider = "skip-no-execution-doc"
        return row

    row.source_doc = str(doc.relative_to(matter_dir))
    text = tika_parse(doc)
    row.parse_provider = "tika"
    extracted = langextract_matter(text, doc_id=f"{matter_id}-{doc.stem}"[:80])
    row.extract_provider = str(extracted.get("provider") or extracted.get("backend") or "langextract")
    row.extractions = list(extracted.get("extractions") or [])
    fields = extractions_to_fields(row.extractions)
    if "deal_date" in fields and fields["deal_date"]:
        row.deal_date = fields["deal_date"]
    if "facility_amount_usd" in fields and fields["facility_amount_usd"]:
        row.facility_amount_usd = fields["facility_amount_usd"]
    if "has_incremental_facility" in fields:
        row.has_incremental_facility = bool(fields["has_incremental_facility"])
    if "has_revolving_facility" in fields:
        row.has_revolving_facility = row.has_revolving_facility or bool(
            fields["has_revolving_facility"]
        )
    # Mezzanine-only extracts often mention revolvers as cross-refs; path signals
    # and senior CAs are authoritative for has_revolving_facility.
    if "mezzanine" in row.source_doc.lower() and not path_has_revolver(matter_dir):
        row.has_revolving_facility = False
    if "mentions_springing_lien" in fields:
        row.mentions_springing_lien = bool(fields["mentions_springing_lien"])
    if fields.get("is_secured"):
        row.is_secured = True
    return row


def build_duckdb(rows: list[MatterRow], db_path: Path) -> None:
    import duckdb

    if db_path.exists():
        db_path.unlink()
    con = duckdb.connect(str(db_path))
    con.execute(
        """
        CREATE TABLE matters (
          matter_id VARCHAR PRIMARY KEY,
          is_credit_facility BOOLEAN,
          is_secured BOOLEAN,
          deal_date DATE,
          has_incremental_facility BOOLEAN,
          facility_amount_usd DOUBLE,
          has_revolving_facility BOOLEAN,
          mentions_springing_lien BOOLEAN,
          parse_provider VARCHAR,
          extract_provider VARCHAR,
          source_doc VARCHAR
        )
        """
    )
    con.executemany(
        "INSERT INTO matters VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                r.matter_id,
                r.is_credit_facility,
                r.is_secured,
                r.deal_date,
                r.has_incremental_facility,
                r.facility_amount_usd,
                r.has_revolving_facility,
                r.mentions_springing_lien,
                r.parse_provider,
                r.extract_provider,
                r.source_doc,
            )
            for r in rows
        ],
    )
    con.close()


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
    con.close()
    return out


def wait_health(url: str, name: str) -> None:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        print(f"OK {name}: {body[:120]}")
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"{name} not healthy at {url}: {exc}") from exc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dms",
        type=Path,
        default=Path("/tmp/harvey-labs-work/harvey-labs/tasks/firm-knowledge/dms/matters"),
    )
    ap.add_argument("--limit-matters", type=int, default=0, help="0 = all credit facilities")
    ap.add_argument("--db", type=Path, default=Path("/tmp/idp-matters.duckdb"))
    args = ap.parse_args()

    wait_health(f"{TIKA_URL}/version", "Tika")
    wait_health(f"{LANGEXTRACT_URL}/health", "LangExtract")

    credit_dirs = [
        p
        for p in sorted(args.dms.iterdir())
        if p.is_dir() and detect_credit_facility(p)["is_credit_facility"]
    ]
    if args.limit_matters:
        credit_dirs = credit_dirs[: args.limit_matters]
    print(f"Processing {len(credit_dirs)} credit-facility matters from {args.dms}")

    rows: list[MatterRow] = []
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
        print(
            f"  {row.matter_id}: secured={row.is_secured} date={row.deal_date} "
            f"inc={row.has_incremental_facility} amt={row.facility_amount_usd} "
            f"revolver={row.has_revolving_facility} lien={row.mentions_springing_lien} "
            f"via {row.parse_provider}/{row.extract_provider} doc={row.source_doc}"
        )

    build_duckdb(rows, args.db)
    checks = run_sql_checks(args.db)
    print("\n=== SQL checks ===")
    print("018 k,n:", checks["018"], "ids:", checks["018_ids"])
    print("018 gold match cohort:", set(checks["018_ids"]) == GOLD_018)
    print("018 k==0:", checks["018"][0] == 0)
    print("024 ids:", checks["024_ids"], "gold match:", set(checks["024_ids"]) == GOLD_024)
    print("020 top:", checks["020_top"], "gold?", checks["020_top"] and checks["020_top"][0][0] == GOLD_020)
    print("023 top:", checks["023_top"], "gold?", checks["023_top"] and checks["023_top"][0][0] == GOLD_023)

    summary = {
        "db": str(args.db),
        "rows": [asdict(r) for r in rows],
        "checks": {
            "018_kn": list(checks["018"]) if checks["018"] else None,
            "018_ids": checks["018_ids"],
            "024_ids": checks["024_ids"],
            "020_top": [[a, b] for a, b in checks["020_top"]],
            "023_top": [[a, str(b) if b else None] for a, b in checks["023_top"]],
            "018_cohort_gold": set(checks["018_ids"]) == GOLD_018,
            "018_k0": checks["018"][0] == 0,
            "024_gold": set(checks["024_ids"]) == GOLD_024,
            "020_gold": bool(checks["020_top"]) and checks["020_top"][0][0] == GOLD_020,
            "023_gold": bool(checks["023_top"]) and checks["023_top"][0][0] == GOLD_023,
        },
    }
    out_json = Path("/tmp/idp-matter-pipeline-summary.json")
    # dates not json-serializable via asdict — coerce
    def _ser(o: Any) -> Any:
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, Path):
            return str(o)
        raise TypeError(type(o))

    out_json.write_text(json.dumps(summary, indent=2, default=_ser), encoding="utf-8")
    print(f"\nWrote {out_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
