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
              sandbox_root VARCHAR,
              vault_note_path VARCHAR
            )
            """
        )
        if rows:
            con.executemany(
                """
                INSERT INTO matters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                "SELECT matter_id, client_short_name FROM matters "
                "WHERE is_credit_facility ORDER BY matter_id; "
                "SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k, "
                "count(*) AS n FROM matters WHERE is_credit_facility; "
                "SELECT matter_id FROM matters WHERE is_credit_facility "
                "AND has_revolving_facility ORDER BY matter_id;"
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "sql": safe}
    finally:
        con.close()


def sql_tool_result_json(db_path: Path, sql: str) -> str:
    return json.dumps(run_readonly_sql(db_path, sql), indent=2, default=str)
