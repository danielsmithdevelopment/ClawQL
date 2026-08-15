"""Task-scoped DuckDB for Harvey LAB ClawQL arms (SQL-first retrieval spike).

Builds a read-mostly ``matters`` table from the same DMS detectors used for
ontology seeding. Agents query via ``clawql_sql`` instead of ClawQL filter DSL.

See ``docs/design/harvey-lab-duckdb-retrieval.md``.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable

_SPRINGING_LIEN_RE = re.compile(r"springing\s+lien", re.IGNORECASE)
# Task-024 calibration: establish a revolving facility in THIS deal (not
# "Existing Revolving Credit Facility" cross-refs). Offline DMS: TP=4 FP=0 FN=0
# vs public gold {1008,1012,1019-00002,1038-00002} — never seed those IDs.
_REVOLVER_ESTABLISH_RE = re.compile(
    r"(?:"
    r"(?:provide|providing|establish|establishing|"
    r"request(?:ed|s)?\s+that\s+the\s+lenders?\s+provide)\s+"
    r"(?:a\s+|an\s+|the\s+)?(?:senior\s+secured\s+)?(?:asset[- ]based\s+)?"
    r"revolving\s+credit\s+facility"
    r"|"
    r"(?:\$[0-9,]+|\$?\s*[0-9,]+\s*(?:million|billion)?)\s+"
    r"(?:senior\s+secured\s+)?revolving\s+credit\s+facility"
    r"|"
    r"\"Revolving\s+Credit\s+Facility\"\s+and,?\s+together\s+with"
    r")",
    re.IGNORECASE | re.DOTALL,
)
_REVOLVER_PATH_RE = re.compile(
    r"revolving-loan-note|abl-negotiation-issues-memo",
    re.IGNORECASE,
)
_REVOLVER_DOC_EXCLUDE = (
    "mezzanine",
    "bridge-loan",
    "bridge_loan",
    "term-loan-agreement",
    "dip-",
)
_SECURED_PATH_RE = re.compile(
    r"security-agreement|ip-security|pledge-agreement|intercreditor-agreement",
    re.IGNORECASE,
)
_INC_FACILITY_RE = re.compile(
    r"(\"Incremental\s+Facility\"|Incremental\s+Facility\s+means|"
    r"incremental\s+term\s+loan\s+facility)",
    re.IGNORECASE,
)
_DEAL_DATE_RE = re.compile(
    r"(?:Dated|dated)\s+as\s+of\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})",
)
_FACILITY_AMOUNT_RE = re.compile(
    r"(?:aggregate\s+principal\s+amount\s+of\s+(?:up\s+to\s+)?|"
    r"facility\s+in\s+an\s+aggregate\s+(?:principal\s+)?amount\s+of\s+(?:up\s+to\s+)?)"
    r"\$\s*([0-9][0-9,]*)",
    re.IGNORECASE,
)
_FACILITY_AMOUNT_ALT_RE = re.compile(
    r"\$\s*([0-9][0-9,]{6,})\s+Senior\s+Secured\s+Term\s+Loan",
    re.IGNORECASE,
)
_SQL_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|attach|copy|export|install|load|"
    r"pragma|create\s+or\s+replace|create\s+table|create\s+view|"
    r"create\s+schema|grant|revoke|call|execute|vacuum)\b",
    re.IGNORECASE,
)
_MAX_ROWS = int(os.environ.get("CLAWQL_LAB_SQL_MAX_ROWS", "500"))
_MAX_CELL_CHARS = int(os.environ.get("CLAWQL_LAB_SQL_MAX_CELL_CHARS", "2000"))


def duckdb_available() -> bool:
    try:
        import duckdb  # noqa: F401

        return True
    except ImportError:
        return False


def default_duckdb_path(vault_path: Path) -> Path:
    return Path(vault_path) / "lab" / "matters.duckdb"


def matter_mentions_springing_lien(
    matter_dir: Path,
    *,
    text_extractor: Callable[[Path], str] | None = None,
    priority_docs: Callable[[Path], list[Path]] | None = None,
) -> bool:
    """Mechanical content index — not rubric-derived."""
    for p in matter_dir.rglob("*"):
        name = p.name.lower()
        if "springing" in name and "lien" in name:
            return True
    if priority_docs is None or text_extractor is None:
        return False
    for doc in priority_docs(matter_dir):
        try:
            body = text_extractor(doc)
        except Exception:  # noqa: BLE001
            continue
        if body and _SPRINGING_LIEN_RE.search(body):
            return True
    return False


def _revolving_candidate_docs(matter_dir: Path) -> list[Path]:
    """Execution senior/credit agreements under Transaction Documents/documents."""
    out: list[Path] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() != ".docx":
            continue
        rel = str(p.relative_to(matter_dir)).replace("\\", "/")
        name = p.name.lower()
        under = (
            rel.startswith("Transaction Documents/")
            or "/Transaction Documents/" in f"/{rel}"
            or rel.startswith("documents/")
            or "/documents/" in f"/{rel}"
        )
        if not under:
            continue
        if any(tok in name for tok in _REVOLVER_DOC_EXCLUDE):
            continue
        if _REVOLVER_PATH_RE.search(name):
            out.append(p)
            continue
        if "execution" not in name:
            continue
        if (
            "credit-agreement" in name
            or "credit_agreement" in name
            or ("amendment" in name and "credit" in name)
        ):
            out.append(p)
    return out


def matter_has_revolving_facility(
    matter_dir: Path,
    *,
    text_extractor: Callable[[Path], str] | None = None,
) -> bool:
    """Mechanical index: deal establishes a revolving credit facility.

    Fair content/path scan for task-024-style enumeration. Excludes mezzanine /
    bridge / term-loan-only filenames and ignores bare \"Existing Revolving…\"
    cross-references (those need establish-language).
    """
    for p in matter_dir.rglob("*"):
        if p.is_file() and _REVOLVER_PATH_RE.search(p.name):
            return True
    if text_extractor is None:
        return False
    for doc in _revolving_candidate_docs(matter_dir):
        try:
            body = text_extractor(doc)
        except Exception:  # noqa: BLE001
            continue
        if body and _REVOLVER_ESTABLISH_RE.search(body):
            return True
    return False


def matter_is_secured(matter_dir: Path) -> bool:
    """Execution security / pledge / intercreditor path signal."""
    for p in matter_dir.rglob("*"):
        if (
            p.is_file()
            and _SECURED_PATH_RE.search(p.name)
            and "execution" in p.name.lower()
        ):
            return True
    return False


def _pick_execution_credit_doc(matter_dir: Path) -> Path | None:
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
        score = 10 if "credit-agreement" in name else 0
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


def _parse_deal_date(raw: str) -> str | None:
    from datetime import datetime

    s = raw.replace(",", "").strip()
    for fmt in ("%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_money(num: str) -> float | None:
    try:
        return float(num.replace(",", ""))
    except ValueError:
        return None


def _langextract_base_url() -> str | None:
    url = (
        os.environ.get("CLAWQL_LAB_LANGEXTRACT_URL")
        or os.environ.get("LANGEXTRACT_BASE_URL")
        or ""
    ).strip()
    return url.rstrip("/") or None


def _tika_base_url() -> str | None:
    url = (
        os.environ.get("CLAWQL_LAB_TIKA_URL") or os.environ.get("TIKA_BASE_URL") or ""
    ).strip()
    return url.rstrip("/") or None


def _tika_parse_bytes(data: bytes, *, timeout: float = 180) -> str:
    import urllib.request

    base = _tika_base_url()
    if not base:
        raise RuntimeError("Tika URL not configured")
    req = urllib.request.Request(
        f"{base}/tika",
        data=data,
        headers={
            "Accept": "text/plain",
            "Content-Type": "application/octet-stream",
        },
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _langextract_matter_fields(text: str, *, doc_id: str) -> dict[str, Any]:
    """POST schema_preset=credit_facility_matter; map grounded extractions."""
    import json
    import urllib.request

    base = _langextract_base_url()
    if not base:
        raise RuntimeError("LangExtract URL not configured")
    payload = {
        "text": text[:180_000],
        "schema_preset": "credit_facility_matter",
        "doc_id": doc_id[:80],
        "write_html": False,
    }
    req = urllib.request.Request(
        f"{base}/extract",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if not body.get("ok"):
        raise RuntimeError(body.get("error") or "langextract failed")
    fields: dict[str, Any] = {
        "provider": body.get("provider") or body.get("backend") or "langextract",
        "model_id": body.get("model_id"),
    }
    for e in body.get("extractions") or []:
        cls = e.get("extraction_class")
        text_v = str(e.get("extraction_text") or "")
        if cls == "deal_date":
            fields["deal_date"] = _parse_deal_date(text_v) or text_v
        elif cls == "facility_amount_usd":
            fields["facility_amount_usd"] = _parse_money(text_v)
        elif cls in {
            "has_incremental_facility",
            "has_revolving_facility",
            "mentions_springing_lien",
            "is_secured",
        }:
            fields[cls] = text_v.strip().lower() in {"true", "yes", "1"}
    return fields


def _local_matter_fields_from_text(body: str, *, source_doc: str) -> dict[str, Any]:
    out: dict[str, Any] = {
        "deal_date": None,
        "has_incremental_facility": False,
        "facility_amount_usd": None,
        "provider": "local-heuristic",
    }
    m = _DEAL_DATE_RE.search(body)
    if m:
        out["deal_date"] = _parse_deal_date(m.group(1))
    if _INC_FACILITY_RE.search(body):
        out["has_incremental_facility"] = True
    head = body[:12000]
    amt = _FACILITY_AMOUNT_RE.search(head) or _FACILITY_AMOUNT_ALT_RE.search(head)
    if amt:
        out["facility_amount_usd"] = _parse_money(amt.group(1))
    if _REVOLVER_ESTABLISH_RE.search(body) and "mezzanine" not in source_doc.lower():
        out["has_revolving_facility"] = True
    if _SPRINGING_LIEN_RE.search(body):
        out["mentions_springing_lien"] = True
    return out


def extract_credit_facility_matter_fields(
    matter_dir: Path,
    *,
    text_extractor: Callable[[Path], str] | None = None,
) -> dict[str, Any]:
    """Fill Matter typed fields (LangExtract preset names).

    Prefer LangExtract HTTP when ``CLAWQL_LAB_LANGEXTRACT_URL`` /
    ``LANGEXTRACT_BASE_URL`` is set; otherwise local grounded heuristics.
    Optional Tika (``CLAWQL_LAB_TIKA_URL``) for bytes→text when available.
    """
    out: dict[str, Any] = {
        "is_secured": matter_is_secured(matter_dir),
        "deal_date": None,
        "has_incremental_facility": False,
        "facility_amount_usd": None,
        "has_revolving_facility": False,
        "mentions_springing_lien": False,
        "source_doc": "",
        "extract_provider": "none",
    }
    # Path revolvers / springing filenames always apply.
    out["has_revolving_facility"] = matter_has_revolving_facility(
        matter_dir, text_extractor=None
    )
    out["mentions_springing_lien"] = matter_mentions_springing_lien(
        matter_dir, text_extractor=None
    )

    doc = _pick_execution_credit_doc(matter_dir)
    if doc is None:
        # Still allow path-only revolver/secured.
        out["extract_provider"] = "path-only"
        return out
    out["source_doc"] = str(doc.relative_to(matter_dir))

    body = ""
    parse_provider = "none"
    if _tika_base_url():
        try:
            body = _tika_parse_bytes(doc.read_bytes())
            parse_provider = "tika"
        except Exception:  # noqa: BLE001
            body = ""
    if not body and text_extractor is not None:
        try:
            body = text_extractor(doc) or ""
            parse_provider = "docx-local"
        except Exception:  # noqa: BLE001
            body = ""
    if not body:
        out["extract_provider"] = f"{parse_provider}/empty"
        # Fall back to full-tree path+text scans when we have an extractor.
        if text_extractor is not None:
            out["has_revolving_facility"] = matter_has_revolving_facility(
                matter_dir, text_extractor=text_extractor
            )
            out["mentions_springing_lien"] = matter_mentions_springing_lien(
                matter_dir, text_extractor=text_extractor
            )
        return out

    fields: dict[str, Any]
    if _langextract_base_url():
        try:
            fields = _langextract_matter_fields(
                body, doc_id=f"{matter_dir.name}-{doc.stem}"
            )
            out["extract_provider"] = f"{parse_provider}/langextract"
        except Exception:  # noqa: BLE001
            fields = _local_matter_fields_from_text(body, source_doc=out["source_doc"])
            out["extract_provider"] = f"{parse_provider}/local-fallback"
    else:
        fields = _local_matter_fields_from_text(body, source_doc=out["source_doc"])
        out["extract_provider"] = f"{parse_provider}/local"

    if fields.get("deal_date"):
        out["deal_date"] = fields["deal_date"]
    if fields.get("facility_amount_usd") is not None:
        out["facility_amount_usd"] = fields["facility_amount_usd"]
    if "has_incremental_facility" in fields:
        out["has_incremental_facility"] = bool(fields["has_incremental_facility"])
    if fields.get("has_revolving_facility"):
        out["has_revolving_facility"] = True
    if fields.get("mentions_springing_lien"):
        out["mentions_springing_lien"] = True
    if fields.get("is_secured"):
        out["is_secured"] = True

    # Mezzanine-only docs: revolver only if path evidence (notes / ABL).
    if "mezzanine" in out["source_doc"].lower():
        path_rev = any(
            p.is_file() and _REVOLVER_PATH_RE.search(p.name)
            for p in matter_dir.rglob("*")
        )
        if not path_rev:
            out["has_revolving_facility"] = False

    return out


def build_matters_duckdb(db_path: Path, rows: list[dict[str, Any]]) -> Path:
    """Create/replace matters.duckdb from row dicts."""
    import duckdb

    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    con = duckdb.connect(str(db_path))
    try:
        con.execute(
            """
            CREATE TABLE matters (
              matter_id VARCHAR PRIMARY KEY,
              client_short_name VARCHAR,
              practice_area VARCHAR,
              matter_type VARCHAR,
              title VARCHAR,
              is_credit_facility BOOLEAN,
              is_hsr_second_request BOOLEAN,
              mentions_springing_lien BOOLEAN,
              has_revolving_facility BOOLEAN,
              is_secured BOOLEAN,
              deal_date DATE,
              has_incremental_facility BOOLEAN,
              facility_amount_usd DOUBLE,
              sandbox_root VARCHAR,
              vault_note_path VARCHAR
            )
            """
        )
        if rows:
            con.executemany(
                """
                INSERT INTO matters VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                [
                    (
                        r["matter_id"],
                        r.get("client_short_name") or "",
                        r.get("practice_area") or "Other",
                        r.get("matter_type") or "Other",
                        r.get("title") or "",
                        bool(r.get("is_credit_facility")),
                        bool(r.get("is_hsr_second_request")),
                        bool(r.get("mentions_springing_lien")),
                        bool(r.get("has_revolving_facility")),
                        bool(r.get("is_secured")),
                        r.get("deal_date"),
                        bool(r.get("has_incremental_facility")),
                        r.get("facility_amount_usd"),
                        r.get("sandbox_root") or "",
                        r.get("vault_note_path") or "",
                    )
                    for r in rows
                ],
            )
        con.execute(
            """
            CREATE VIEW credit_facilities AS
            SELECT * FROM matters WHERE is_credit_facility
            """
        )
        con.execute(
            """
            CREATE VIEW revolving_credit_facilities AS
            SELECT * FROM matters
            WHERE is_credit_facility AND has_revolving_facility
            """
        )
    finally:
        con.close()
    return db_path


def validate_readonly_select(sql: str) -> str:
    text = (sql or "").strip()
    if not text:
        raise ValueError("sql is empty")
    # Single statement only
    stripped = text.rstrip().rstrip(";")
    if ";" in stripped:
        raise ValueError("only a single SQL statement is allowed")
    if _SQL_FORBIDDEN.search(stripped):
        raise ValueError("read-only SELECT/WITH queries only")
    head = stripped.lstrip().split(None, 1)[0].lower()
    if head not in {"select", "with", "describe", "show", "summarize"}:
        raise ValueError("query must start with SELECT, WITH, DESCRIBE, SHOW, or SUMMARIZE")
    return stripped


def run_readonly_sql(db_path: Path, sql: str) -> dict[str, Any]:
    import duckdb

    safe = validate_readonly_select(sql)
    if not Path(db_path).is_file():
        return {
            "ok": False,
            "error": f"DuckDB not found at {db_path}. Pre-ingest may have failed.",
        }
    con = duckdb.connect(str(db_path), read_only=True)
    try:
        cur = con.execute(safe)
        cols = [d[0] for d in (cur.description or [])]
        raw_rows = cur.fetchmany(_MAX_ROWS + 1)
        truncated = len(raw_rows) > _MAX_ROWS
        raw_rows = raw_rows[:_MAX_ROWS]
        rows: list[dict[str, Any]] = []
        for tup in raw_rows:
            row: dict[str, Any] = {}
            for i, col in enumerate(cols):
                val = tup[i]
                if isinstance(val, str) and len(val) > _MAX_CELL_CHARS:
                    val = val[:_MAX_CELL_CHARS] + "…[truncated]"
                elif val is not None and not isinstance(val, (str, int, float, bool)):
                    val = str(val)
                row[col] = val
            rows.append(row)
        return {
            "ok": True,
            "sql": safe,
            "columns": cols,
            "rows": rows,
            "rowCount": len(rows),
            "truncated": truncated,
            "hint": (
                "For frequency/cohort tasks: "
                "SELECT matter_id FROM matters WHERE is_credit_facility; "
                "SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k, "
                "count(*) AS n FROM matters WHERE is_credit_facility; "
                "SELECT matter_id FROM matters WHERE is_credit_facility "
                "AND has_revolving_facility; "
                "SELECT matter_id FROM matters WHERE has_incremental_facility "
                "AND facility_amount_usd IS NOT NULL "
                "ORDER BY facility_amount_usd DESC LIMIT 1; "
                "SELECT matter_id FROM matters WHERE is_credit_facility "
                "AND is_secured AND deal_date IS NOT NULL "
                "ORDER BY deal_date DESC LIMIT 1;"
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "sql": safe}
    finally:
        con.close()


def sql_tool_result_json(db_path: Path, sql: str) -> str:
    return json.dumps(run_readonly_sql(db_path, sql), indent=2, default=str)
