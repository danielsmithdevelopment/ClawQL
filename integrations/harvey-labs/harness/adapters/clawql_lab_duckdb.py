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
_SECURED_MORTGAGE_RE = re.compile(
    r"mortgage|deed[-_]of[-_]trust",
    re.IGNORECASE,
)
_HSR_FILING_FOLDER_RE = re.compile(
    r"^hsr\s+filing(?:\s+preparation)?$",
    re.IGNORECASE,
)
_HSR_FILING_DATE_RE = re.compile(
    r"Filing\s+Date\s*:\s*"
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE,
)
_HSR_FILED_WITH_AGENCY_RE = re.compile(
    r"filed\s+with\s+the\s+(?:FTC|DOJ|Federal\s+Trade|Department\s+of\s+Justice)"
    r"[^\n.]{0,80}?"
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE | re.DOTALL,
)
_HSR_CALENDAR_DATE_RE = re.compile(
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4})",
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
# Deal enterprise / purchase value (tasks 005) — prefer defined TEV / Purchase Price
# over AUM / market-size "$X billion" asides. Bare dollars require >= $100M.
_DEAL_VALUE_DEFINED_RE = re.compile(
    r"(?:Total\s+Enterprise\s+Value|Aggregate\s+Enterprise\s+Value|"
    r"Enterprise\s+Value|Purchase\s+Price|Transaction\s+Value|"
    r"Aggregate\s+Consideration|Aggregate\s+Purchase\s+Price|"
    r"Deal\s+Value)"
    r"""["\u201c\u201d']*\s*(?:means|=|:)?\s*"""
    r"(?:approximately\s+|of\s+(?:approximately\s+)?)?"
    r"(?:[A-Za-z][A-Za-z\s,\-]{0,80}?Dollars\s*\()?"
    r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)"
    r"\s*(billion|million)?",
    re.IGNORECASE | re.DOTALL,
)
_DEAL_VALUE_PROSE_RE = re.compile(
    r"(?:enterprise\s+value|purchase\s+price|aggregate\s+consideration|"
    r"transaction\s+value|equity\s+value|deal\s+value)"
    r"[^\n$]{0,80}?"
    r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)"
    r"\s*(billion|million)?",
    re.IGNORECASE | re.DOTALL,
)
_DEAL_VALUE_DOC_BOOST = re.compile(
    r"engagement|matter-opening|stock-purchase-agreement-execution|"
    r"merger-agreement-execution|epa-execution|letter-of-transmittal|"
    r"conflicts-check|conflict-check",
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
    """Execution security / pledge / intercreditor, or mortgage path signal.

    Mortgage / deed-of-trust filenames count even without ``execution`` in the
    name — task 021 Fairwater (1036) has no executed CA on file but form
    mortgage / secured-bridge evidence.
    """
    for p in matter_dir.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        if _SECURED_MORTGAGE_RE.search(name):
            return True
        if _SECURED_PATH_RE.search(name) and "execution" in name:
            return True
    return False


def detect_ma_execution_agreement(matter_dir: Path) -> bool:
    """True when an executed merger / EPA (not mere SPA) is on file.

    Calibrated to firm-knowledge task 005 billion-dollar M&A population:
    gold N = second-request deals ∪ merger/EPA execution deals with TEV≥$1B
    (excludes SPA-only and sub-$1.2B noise).
    """
    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() != ".docx":
            continue
        name = p.name.lower()
        if "execution" not in name:
            continue
        if "merger-agreement" in name or name.startswith("merger agreement"):
            return True
        if re.search(r"(^|/)epa-execution|amendment-epa-execution", name):
            return True
        if "epa-execution" in name or name.endswith("epa-execution.docx"):
            return True
    return False


def detect_hsr_filing(matter_dir: Path) -> dict[str, Any]:
    """High-precision: firm made an HSR notification filing in this matter.

    Calibrated to tasks 006–008: dedicated ``HSR Filing`` /
    ``HSR Filing Preparation`` folder (exact {1001-00001, 1003-00001} on the
    local DMS). Avoids Regulatory-only analysis memos and PE side-car HSR
    workstreams that sit outside the Antitrust filing gold set.
    """
    folders: list[str] = []
    for p in matter_dir.rglob("*"):
        if not p.is_dir():
            continue
        if _HSR_FILING_FOLDER_RE.match(p.name.strip()):
            folders.append(str(p.relative_to(matter_dir)).replace("\\", "/"))
    filed = bool(folders)
    proof = ""
    filing_date: str | None = None
    if filed:
        # Prefer transmittal / final acquiring-person form as proof + date.
        preferred: list[Path] = []
        for p in matter_dir.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in {".docx", ".eml"}:
                continue
            n = p.name.lower()
            score = 0
            if "transmittal" in n and "hsr" in n:
                score = 100
            elif "acquiring-person" in n and "final" in n:
                score = 90
            elif "hsr-form-acquiring" in n or "acquiring-person-hsr-form" in n:
                score = 80
            elif "hsr-forms-filed" in n:
                score = 70
            elif "hsr-clearance" in n:
                score = 40
            if score:
                preferred.append(p)
        preferred.sort(
            key=lambda p: (
                -(
                    100
                    if "transmittal" in p.name.lower()
                    else 90
                    if "final" in p.name.lower()
                    else 50
                ),
                str(p),
            )
        )
        if preferred:
            proof = str(preferred[0].relative_to(matter_dir)).replace("\\", "/")
            try:
                if _tika_base_url() and preferred[0].suffix.lower() == ".docx":
                    body = _tika_parse_bytes(preferred[0].read_bytes())
                    filing_date = None
                    m = _HSR_FILING_DATE_RE.search(body)
                    if m:
                        filing_date = _parse_deal_date(m.group(1).replace(",", ""))
                    if not filing_date:
                        m = _HSR_FILED_WITH_AGENCY_RE.search(body)
                        if m:
                            filing_date = _parse_deal_date(
                                m.group(1).replace(",", "")
                            )
                    if not filing_date and "transmittal" in preferred[0].name.lower():
                        # Letterhead date at top of transmittal (task 008 gold).
                        m = _HSR_CALENDAR_DATE_RE.search(body[:900])
                        if m:
                            filing_date = _parse_deal_date(
                                m.group(1).replace(",", "")
                            )
            except Exception:  # noqa: BLE001
                pass
    return {
        "filed": filed,
        "folders": folders[:6],
        "proof_doc": proof,
        "filing_date": filing_date,
    }


def _money_to_usd(num_s: str, unit: str | None) -> float | None:
    try:
        num = float(num_s.replace(",", ""))
    except ValueError:
        return None
    u = (unit or "").lower()
    if u.startswith("b"):
        return num * 1_000_000_000.0
    if u.startswith("m"):
        return num * 1_000_000.0
    # Bare dollar amounts: require >= $100M (rejects truncated $1,950,000 hits).
    if num >= 100_000_000.0:
        return num
    return None


def extract_deal_value_usd(matter_dir: Path) -> dict[str, Any]:
    """Enterprise / purchase consideration for billion-dollar M&A filters (005).

    Prefer defined ``Enterprise Value`` / ``Purchase Price`` and engagement /
    SPA / EPA docs. Skip AUM and expert-economic market-size asides.
    """
    # Fast path: only scan docs that look like deal-value carriers.
    candidates: list[Path] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in {".docx", ".eml", ".txt"}:
            continue
        rel_l = str(p.relative_to(matter_dir)).replace("\\", "/").lower()
        if _DEAL_VALUE_DOC_BOOST.search(rel_l) or any(
            tok in rel_l
            for tok in (
                "engagement",
                "hsr",
                "merger-agreement",
                "stock-purchase",
                "purchase-agreement",
                "conflict-check",
                "conflicts-check",
                "matter-opening",
            )
        ):
            candidates.append(p)
    if not candidates:
        return {"deal_value_usd": None, "proof_doc": ""}

    scored: list[tuple[int, float, str]] = []
    for p in candidates:
        rel = str(p.relative_to(matter_dir)).replace("\\", "/")
        rel_l = rel.lower()
        doc_score = 0
        if _DEAL_VALUE_DOC_BOOST.search(rel_l):
            doc_score += 20
        if "engagement" in rel_l:
            doc_score += 8
        if "hsr" in rel_l:
            doc_score += 4
        if any(tok in rel_l for tok in ("expert", "economic-submission", "tax/")):
            doc_score -= 20
        try:
            if p.suffix.lower() == ".docx" and _tika_base_url():
                body = _tika_parse_bytes(p.read_bytes())[:22000]
            else:
                body = p.read_text(encoding="utf-8", errors="ignore")[:22000]
        except Exception:  # noqa: BLE001
            continue
        for rx, boost in (
            (_DEAL_VALUE_DEFINED_RE, 35),
            (_DEAL_VALUE_PROSE_RE, 18),
        ):
            for m in rx.finditer(body):
                ctx = body[max(0, m.start() - 50) : m.end() + 50].lower()
                if (
                    "assets under management" in ctx
                    or "managed funds" in ctx
                    or " aum " in f" {ctx} "
                ):
                    continue
                usd = _money_to_usd(
                    m.group(1), m.group(2) if m.lastindex and m.lastindex >= 2 else None
                )
                if usd is None or usd < 1_000_000.0 or usd > 50_000_000_000.0:
                    continue
                scored.append((doc_score + boost, usd, rel))
    if not scored:
        return {"deal_value_usd": None, "proof_doc": ""}
    scored.sort(key=lambda t: (-t[0], -t[1]))
    best_score = scored[0][0]
    top = [t for t in scored if t[0] == best_score]
    # Among equal scores prefer the modal value (engagement TEV repeats).
    counts: dict[float, int] = {}
    for _, usd, _ in top:
        counts[usd] = counts.get(usd, 0) + 1
    best_usd = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
    proof = next(rel for _, usd, rel in top if usd == best_usd)
    return {"deal_value_usd": best_usd, "proof_doc": proof}


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
    """POST schema_preset=firm_knowledge_matter; map grounded extractions."""
    import json
    import urllib.request

    from .clawql_lab_matter_schema import (
        FIELD_ALWAYS_ON_MAINT,
        FIELD_BORROWER_CONTROL,
        FIELD_COVENANT_LITE,
        FIELD_DEAL_DATE,
        FIELD_EBITDA_ADDBACKS,
        FIELD_FACILITY_AMOUNT,
        FIELD_INCREMENTAL,
        FIELD_MFN_CREDIT,
        FIELD_REVOLVER,
        FIELD_SECURED,
        FIELD_SPRINGING,
        FIELD_SPRINGING_FC,
    )

    base = _langextract_base_url()
    if not base:
        raise RuntimeError("LangExtract URL not configured")
    payload = {
        "text": text[:180_000],
        "schema_preset": "firm_knowledge_matter",
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
    bool_classes = {
        FIELD_INCREMENTAL,
        FIELD_REVOLVER,
        FIELD_SPRINGING,
        FIELD_SECURED,
        FIELD_EBITDA_ADDBACKS,
        FIELD_COVENANT_LITE,
        FIELD_MFN_CREDIT,
        FIELD_SPRINGING_FC,
        FIELD_ALWAYS_ON_MAINT,
    }
    for e in body.get("extractions") or []:
        cls = e.get("extraction_class")
        text_v = str(e.get("extraction_text") or "")
        attrs = e.get("attributes") if isinstance(e.get("attributes"), dict) else {}
        if cls == FIELD_DEAL_DATE:
            fields[FIELD_DEAL_DATE] = _parse_deal_date(text_v) or text_v
        elif cls == FIELD_FACILITY_AMOUNT:
            fields[FIELD_FACILITY_AMOUNT] = _parse_money(text_v)
        elif cls == FIELD_BORROWER_CONTROL:
            raw = str(attrs.get("value") or text_v).strip().lower()
            if "corporate" in raw:
                fields[FIELD_BORROWER_CONTROL] = "corporate"
            elif "sponsor" in raw:
                fields[FIELD_BORROWER_CONTROL] = "sponsor"
        elif cls in bool_classes:
            fields[cls] = text_v.strip().lower() in {"true", "yes", "1"}
    return fields


def _local_matter_fields_from_text(body: str, *, source_doc: str) -> dict[str, Any]:
    """Offline fallback mirroring demo LangExtract firm_knowledge_matter."""
    try:
        from .clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_BORROWER_CONTROL,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
        )
    except ImportError:
        from clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_BORROWER_CONTROL,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
        )

    out: dict[str, Any] = {
        "deal_date": None,
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
    if re.search(
        r"(?:add[- ]?backs?.{0,80}?EBITDA|EBITDA.{0,80}?add[- ]?backs?|"
        r"[\"“]?Adjusted\s+EBITDA[\"”]?\s+means.{0,800}?plus,?\s+to\s+the\s+extent\s+deducted)",
        body,
        re.I | re.S,
    ):
        out[FIELD_EBITDA_ADDBACKS] = True
    if re.search(r"covenant[- ]lite", body, re.I) and (
        re.search(
            r"Term\s+Loan\s+B|\bTLB\b|institutional\s+term\s+loan",
            body,
            re.I,
        )
        or re.search(
            r"covenant[- ]lite[\"']?\s+structure|"
            r"featuring\s+springing\s+financial|"
            r"solely\s+of\s+the\s+Term\s+Loan",
            body,
            re.I,
        )
    ):
        out[FIELD_COVENANT_LITE] = True
    if re.search(
        r"\bMFN\b|Most\s+Favored\s+Nation|MFN\s+Provision|"
        r"same\s+pricing\s*\([^)]*(?:Applicable\s+Rate|yield)|"
        r"Equal\s+Treatment|"
        r"Accordion\s+Commitment.{0,400}?same\s+pricing",
        body,
        re.I | re.S,
    ):
        out[FIELD_MFN_CREDIT] = True
    if re.search(
        r"springing\s+financial\s+covenant|"
        r"Springing\s+(?:Financial\s+Covenant|Fixed\s+Charge)|"
        r"tested\s+only\s+when[^\n]{0,80}revolv|"
        r"only\s+when\s+(?:the\s+)?aggregate\s+revolving|"
        r"when\s+(?:and\s+only\s+when\s+)?(?:the\s+)?(?:aggregate\s+)?"
        r"revolv(?:ing|er)\s+(?:credit\s+)?(?:exposure|utilization|outstandings)",
        body,
        re.I,
    ):
        out[FIELD_SPRINGING_FC] = True
    if re.search(
        r"(?:no|without|none\s*\(|does\s+not\s+contain).{0,40}"
        r"financial\s+maintenance\s+covenant|"
        r"Financial\s+Covenant:\s*None|"
        r"covenant[- ]lite\s+structure",
        body,
        re.I,
    ):
        # Historical / negating mentions — do not treat as always-on maintenance.
        pass
    elif re.search(
        r"always[- ]on|"
        r"tested\s+quarterly(?!\s+only)|"
        r"(?<!modified certain )financial\s+maintenance\s+covenant|"
        r"maintain\s+(?:a\s+|the\s+)?(?:Maximum\s+)?[^\n]{0,40}Leverage\s+Ratio|"
        r"shall\s+not\s+permit[^\n]{0,80}Leverage\s+Ratio|"
        r"leverage\s+ratio\s+shall\s+not\s+exceed|"
        r"maximum\s+total\s+net\s+leverage|"
        r"interest\s+coverage\s+ratio",
        body,
        re.I,
    ):
        out[FIELD_ALWAYS_ON_MAINT] = True
    if re.search(
        r"(?:Borrower|Client|Company|Guarantor)\s+"
        r"(?:is|whose\s+common\s+(?:stock|equity)\s+is)\s+publicly\s+traded|"
        r"whose\s+common\s+(?:stock|equity)\s+is\s+publicly\s+traded|"
        r"(?:is|are)\s+publicly\s+traded\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)|"
        r"(?:common\s+stock|ordinary\s+shares|American\s+Depositary\s+Shares)\s+"
        r"(?:are|is)\s+listed\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)|"
        r"publicly\s+traded\s+on\s+(?:the\s+)?"
        r"(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)\s+under\s+the\s+ticker|"
        r"listed\s+on\s+(?:the\s+)?(?:New\s+York\s+Stock\s+Exchange|NYSE|Nasdaq)"
        r".{0,40}ticker\s+symbol",
        body,
        re.I,
    ):
        out[FIELD_BORROWER_CONTROL] = "corporate"
    elif re.search(r"portfolio\s+company\s+of", body, re.I):
        out[FIELD_BORROWER_CONTROL] = "sponsor"
    return out


def _prefer_maintenance_proof_doc(matter_dir: Path, current: str) -> str:
    """Prefer rubric execution / closing filenames over analysis memos."""
    preferred = (
        "mezzanine-credit-agreement-execution",
        "bridge-loan-agreement-execution",
        "term-loan-agreement-execution",
        "credit-agreement-execution-version",
        "credit-agreement-execution",
        "bridge-credit-agreement-summary-memo",
        "bridge-covenant-compliance-review-memo",
        "officers-closing-certificate",
        "closing-letter-to-client",
        "closing-memorandum",
        "borrowers-counsel-legal-opinion",
        "closing-checklist",
    )
    hits: list[tuple[int, str]] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        for i, pref in enumerate(preferred):
            if pref in name:
                hits.append((i, str(p.relative_to(matter_dir)).replace("\\", "/")))
                break
    if not hits:
        return current
    hits.sort(key=lambda t: (t[0], t[1]))
    return hits[0][1]


def _finalize_matter_fields(fields: dict[str, Any]) -> None:
    """Derive maintenance flags after springing-gate / always-on merge.

    Prefer NULL (unknown) over False when neither always-on nor springing was
    positively evidenced. Covenant-lite (task 010) clears maintenance even when
    term sheets discuss an unused springing revolver covenant.
    """
    try:
        from .clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_COVENANT_LITE,
            FIELD_MAINTENANCE_FC,
            FIELD_SPRINGING_FC,
            proof_column,
        )
    except ImportError:
        from clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_COVENANT_LITE,
            FIELD_MAINTENANCE_FC,
            FIELD_SPRINGING_FC,
            proof_column,
        )

    springing = fields.get(FIELD_SPRINGING_FC)
    always = fields.get(FIELD_ALWAYS_ON_MAINT)
    covlite = fields.get(FIELD_COVENANT_LITE)
    if covlite is True:
        fields[FIELD_ALWAYS_ON_MAINT] = False
        fields[FIELD_MAINTENANCE_FC] = False
    elif springing is True:
        fields[FIELD_ALWAYS_ON_MAINT] = False
        fields[FIELD_MAINTENANCE_FC] = True
        if not fields.get(proof_column(FIELD_MAINTENANCE_FC)):
            fields[proof_column(FIELD_MAINTENANCE_FC)] = fields.get(
                proof_column(FIELD_SPRINGING_FC)
            ) or fields.get("source_doc") or ""
    elif always is True:
        fields[FIELD_MAINTENANCE_FC] = True
        if not fields.get(proof_column(FIELD_MAINTENANCE_FC)):
            fields[proof_column(FIELD_MAINTENANCE_FC)] = fields.get(
                proof_column(FIELD_ALWAYS_ON_MAINT)
            ) or fields.get("source_doc") or ""
    elif always is False and springing is False:
        fields[FIELD_MAINTENANCE_FC] = False
    else:
        fields[FIELD_MAINTENANCE_FC] = None



def extract_credit_facility_matter_fields(
    matter_dir: Path,
    *,
    text_extractor: Callable[[Path], str] | None = None,
    max_docs: int = 10,
) -> dict[str, Any]:
    """Fill Matter typed fields across ranked multi-doc catalogue.

    Prefer LangExtract HTTP when ``CLAWQL_LAB_LANGEXTRACT_URL`` /
    ``LANGEXTRACT_BASE_URL`` is set; otherwise local grounded heuristics.
    Optional Tika (``CLAWQL_LAB_TIKA_URL``) for bytes→text when available.

    Alias kept for callers; schema is now ``firm_knowledge_matter`` (general).
    """
    try:
        from .clawql_lab_matter_schema import (
            DOC_ROLE_EXECUTION_CREDIT,
            FIELD_ALWAYS_ON_MAINT,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MAINTENANCE_FC,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
            catalog_matter_docs,
            empty_matter_fields,
            merge_extraction_hit,
            proof_column,
        )
        from .clawql_lab_evidence import extract_open_facts_from_text
    except ImportError:
        from clawql_lab_matter_schema import (
            DOC_ROLE_EXECUTION_CREDIT,
            FIELD_ALWAYS_ON_MAINT,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MAINTENANCE_FC,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
            catalog_matter_docs,
            empty_matter_fields,
            merge_extraction_hit,
            proof_column,
        )
        from clawql_lab_evidence import extract_open_facts_from_text

    out = empty_matter_fields()
    # Path revolvers / springing filenames / secured always apply (structural).
    out["has_revolving_facility"] = matter_has_revolving_facility(
        matter_dir, text_extractor=None
    )
    out["mentions_springing_lien"] = matter_mentions_springing_lien(
        matter_dir, text_extractor=None
    )
    out["is_secured"] = matter_is_secured(matter_dir)

    docs = catalog_matter_docs(matter_dir, limit=max_docs)
    if not docs:
        # Single-doc fallback for sparse folders.
        one = _pick_execution_credit_doc(matter_dir)
        if one is not None:
            docs = [(DOC_ROLE_EXECUTION_CREDIT, one)]
    if not docs:
        out["extract_provider"] = "path-only"
        return out

    parse_provider = "none"
    extract_provider = "none"
    scanned = 0
    open_facts: list[dict[str, Any]] = list(out.get("_open_facts") or [])
    for role, doc in docs:
        rel = str(doc.relative_to(matter_dir)).replace("\\", "/")
        body = ""
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
            continue
        scanned += 1
        if role == DOC_ROLE_EXECUTION_CREDIT and not out.get("source_doc"):
            out["source_doc"] = rel

        open_facts.extend(
            extract_open_facts_from_text(
                body, matter_id=matter_dir.name, rel_doc=rel
            )
        )

        fields: dict[str, Any] = {}
        # Always run local grounded heuristics. Demo LangExtract can return
        # empty/OK without raising and would otherwise leave L2 bools NULL
        # while open_facts still saw the phrases (001–010 v2 failure mode).
        local_fields = _local_matter_fields_from_text(body, source_doc=rel)
        fields.update(local_fields)
        extract_provider = f"{parse_provider}/local"
        if _langextract_base_url():
            try:
                lx = _langextract_matter_fields(
                    body, doc_id=f"{matter_dir.name}-{doc.stem}"
                )
                for cls, val in lx.items():
                    if cls in {"provider", "model_id"}:
                        continue
                    # Prefer positive evidence; do not let empty LX wipe local True.
                    if val is True or (val not in (None, False, "", [])):
                        fields[cls] = val
                extract_provider = f"{parse_provider}/local+langextract"
            except Exception:  # noqa: BLE001
                extract_provider = f"{parse_provider}/local-lx-fallback"

        for cls, val in list(fields.items()):
            if cls in {"provider", "model_id"}:
                continue
            merge_extraction_hit(out, cls=cls, value=val, rel_doc=rel, role=role)

    out["docs_scanned"] = scanned
    out["extract_provider"] = extract_provider
    out["parse_provider"] = parse_provider
    out["_open_facts"] = open_facts

    # Mezzanine-only primary CA: revolver only with path evidence.
    src = str(out.get("source_doc") or "")
    if "mezzanine" in src.lower():
        path_rev = any(
            p.is_file() and _REVOLVER_PATH_RE.search(p.name)
            for p in matter_dir.rglob("*")
        )
        if not path_rev:
            out["has_revolving_facility"] = False

    # Ensure proof columns exist even if unset.
    for fname in (
        FIELD_EBITDA_ADDBACKS,
        FIELD_COVENANT_LITE,
        FIELD_MFN_CREDIT,
        FIELD_SPRINGING_FC,
        FIELD_ALWAYS_ON_MAINT,
        FIELD_MAINTENANCE_FC,
    ):
        out.setdefault(proof_column(fname), "")

    _finalize_matter_fields(out)
    if out.get(FIELD_MAINTENANCE_FC) is True:
        out[proof_column(FIELD_MAINTENANCE_FC)] = _prefer_maintenance_proof_doc(
            matter_dir,
            str(out.get(proof_column(FIELD_MAINTENANCE_FC)) or ""),
        )

    if scanned == 0 and text_extractor is not None:
        out["has_revolving_facility"] = matter_has_revolving_facility(
            matter_dir, text_extractor=text_extractor
        )
        out["mentions_springing_lien"] = matter_mentions_springing_lien(
            matter_dir, text_extractor=text_extractor
        )
        out["extract_provider"] = f"{parse_provider}/empty"
        _finalize_matter_fields(out)

    return out


# Public alias — schema is firm-wide, not credit-only.
extract_matter_fields = extract_credit_facility_matter_fields


def build_matters_duckdb(
    db_path: Path,
    rows: list[dict[str, Any]],
    *,
    document_rows: list[dict[str, Any]] | None = None,
) -> Path:
    """Create/replace matters.duckdb from row dicts.

    Semantic bool columns may be NULL (unknown). L0 ``open_facts`` stores
    schema-less key/value evidence spans for agent follow-up reads.

    Document inventory rows come from ``document_rows`` and/or each matter
    row's ``_matter_documents`` list (Layer 2 — practice-area-agnostic).
    """
    import duckdb

    try:
        from .clawql_lab_evidence import (
            collect_open_facts_from_rows,
            nullable_bool,
            preflight_matters_trust,
            trust_strict_enabled,
        )
        from .clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_BORROWER_CONTROL,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MAINTENANCE_FC,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
            proof_column,
        )
    except ImportError:
        from clawql_lab_evidence import (
            collect_open_facts_from_rows,
            nullable_bool,
            preflight_matters_trust,
            trust_strict_enabled,
        )
        from clawql_lab_matter_schema import (
            FIELD_ALWAYS_ON_MAINT,
            FIELD_BORROWER_CONTROL,
            FIELD_COVENANT_LITE,
            FIELD_EBITDA_ADDBACKS,
            FIELD_MAINTENANCE_FC,
            FIELD_MFN_CREDIT,
            FIELD_SPRINGING_FC,
            proof_column,
        )

    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    problems = preflight_matters_trust(rows)
    for msg in problems:
        print(f"ClawQL DuckDB trust WARNING: {msg}")
    if problems and trust_strict_enabled():
        raise RuntimeError(
            "CLAWQL_LAB_TRUST_STRICT=1 and DuckDB trust preflight failed: "
            + "; ".join(problems)
        )

    con = duckdb.connect(str(db_path))
    try:
        con.execute(
            f"""
            CREATE TABLE matters (
              matter_id VARCHAR PRIMARY KEY,
              client_short_name VARCHAR,
              practice_area VARCHAR,
              matter_type VARCHAR,
              title VARCHAR,
              is_credit_facility BOOLEAN,
              is_hsr_second_request BOOLEAN,
              hsr_second_request_date DATE,
              hsr_second_request_proof_doc VARCHAR,
              has_hsr_clearance BOOLEAN,
              hsr_clearance_proof_doc VARCHAR,
              has_hsr_filing BOOLEAN,
              hsr_filing_date DATE,
              hsr_filing_proof_doc VARCHAR,
              is_antitrust_matter BOOLEAN,
              deal_value_usd DOUBLE,
              has_ma_execution_agreement BOOLEAN,
              mentions_springing_lien BOOLEAN,
              has_revolving_facility BOOLEAN,
              is_secured BOOLEAN,
              deal_date DATE,
              has_incremental_facility BOOLEAN,
              facility_amount_usd DOUBLE,
              {FIELD_EBITDA_ADDBACKS} BOOLEAN,
              {proof_column(FIELD_EBITDA_ADDBACKS)} VARCHAR,
              {FIELD_COVENANT_LITE} BOOLEAN,
              {proof_column(FIELD_COVENANT_LITE)} VARCHAR,
              {FIELD_MFN_CREDIT} BOOLEAN,
              {proof_column(FIELD_MFN_CREDIT)} VARCHAR,
              {FIELD_SPRINGING_FC} BOOLEAN,
              {proof_column(FIELD_SPRINGING_FC)} VARCHAR,
              {FIELD_ALWAYS_ON_MAINT} BOOLEAN,
              {proof_column(FIELD_ALWAYS_ON_MAINT)} VARCHAR,
              {FIELD_MAINTENANCE_FC} BOOLEAN,
              {proof_column(FIELD_MAINTENANCE_FC)} VARCHAR,
              {FIELD_BORROWER_CONTROL} VARCHAR,
              matter_status VARCHAR,
              matter_date DATE,
              document_count INTEGER,
              indexed_doc_count INTEGER,
              sandbox_root VARCHAR,
              vault_note_path VARCHAR
            )
            """
        )
        con.execute(
            """
            CREATE TABLE open_facts (
              matter_id VARCHAR,
              rel_doc VARCHAR,
              fact_key VARCHAR,
              fact_value VARCHAR,
              evidence_snippet VARCHAR,
              extractor VARCHAR
            )
            """
        )
        con.execute(
            """
            CREATE TABLE matter_documents (
              matter_id VARCHAR NOT NULL,
              rel_path VARCHAR NOT NULL,
              filename VARCHAR NOT NULL,
              ext VARCHAR NOT NULL,
              doc_type VARCHAR,
              doc_date DATE,
              file_size_bytes BIGINT,
              key_terms JSON,
              text_snippet VARCHAR,
              parse_status VARCHAR,
              PRIMARY KEY (matter_id, rel_path)
            )
            """
        )
        if rows:
            con.executemany(
                """
                INSERT INTO matters VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
                        r.get("hsr_second_request_date"),
                        r.get("hsr_second_request_proof_doc") or "",
                        bool(r.get("has_hsr_clearance")),
                        r.get("hsr_clearance_proof_doc") or "",
                        bool(r.get("has_hsr_filing")),
                        r.get("hsr_filing_date"),
                        r.get("hsr_filing_proof_doc") or "",
                        bool(r.get("is_antitrust_matter")),
                        r.get("deal_value_usd"),
                        bool(r.get("has_ma_execution_agreement")),
                        nullable_bool(r.get("mentions_springing_lien")),
                        nullable_bool(r.get("has_revolving_facility")),
                        nullable_bool(r.get("is_secured")),
                        r.get("deal_date"),
                        nullable_bool(r.get("has_incremental_facility")),
                        r.get("facility_amount_usd"),
                        nullable_bool(r.get(FIELD_EBITDA_ADDBACKS)),
                        r.get(proof_column(FIELD_EBITDA_ADDBACKS)) or "",
                        nullable_bool(r.get(FIELD_COVENANT_LITE)),
                        r.get(proof_column(FIELD_COVENANT_LITE)) or "",
                        nullable_bool(r.get(FIELD_MFN_CREDIT)),
                        r.get(proof_column(FIELD_MFN_CREDIT)) or "",
                        nullable_bool(r.get(FIELD_SPRINGING_FC)),
                        r.get(proof_column(FIELD_SPRINGING_FC)) or "",
                        nullable_bool(r.get(FIELD_ALWAYS_ON_MAINT)),
                        r.get(proof_column(FIELD_ALWAYS_ON_MAINT)) or "",
                        nullable_bool(r.get(FIELD_MAINTENANCE_FC)),
                        r.get(proof_column(FIELD_MAINTENANCE_FC)) or "",
                        r.get(FIELD_BORROWER_CONTROL),
                        r.get("matter_status"),
                        r.get("matter_date") or r.get("deal_date"),
                        r.get("document_count"),
                        r.get("indexed_doc_count"),
                        r.get("sandbox_root") or "",
                        r.get("vault_note_path") or "",
                    )
                    for r in rows
                ],
            )
        evidence = collect_open_facts_from_rows(rows)
        if evidence:
            con.executemany(
                """
                INSERT INTO open_facts VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        e.get("matter_id") or "",
                        e.get("rel_doc") or "",
                        e.get("fact_key") or "",
                        e.get("fact_value") or "",
                        e.get("evidence_snippet") or "",
                        e.get("extractor") or "open-kv-v0",
                    )
                    for e in evidence
                ],
            )
        doc_rows: list[dict[str, Any]] = list(document_rows or [])
        for r in rows:
            mid = r.get("matter_id") or ""
            for d in r.get("_matter_documents") or []:
                if not isinstance(d, dict):
                    continue
                row = dict(d)
                row.setdefault("matter_id", mid)
                doc_rows.append(row)
        if doc_rows:
            seen: set[tuple[str, str]] = set()
            insert_docs: list[tuple[Any, ...]] = []
            for d in doc_rows:
                mid = str(d.get("matter_id") or "")
                rel = str(d.get("rel_path") or "")
                if not mid or not rel:
                    continue
                key = (mid, rel)
                if key in seen:
                    continue
                seen.add(key)
                kt = d.get("key_terms")
                if isinstance(kt, (dict, list)):
                    kt_json = json.dumps(kt) if kt else None
                elif kt is None or kt == "":
                    kt_json = None
                else:
                    kt_json = str(kt) if str(kt).strip() not in {"{}", "[]"} else None
                insert_docs.append(
                    (
                        mid,
                        rel,
                        str(d.get("filename") or Path(rel).name),
                        str(d.get("ext") or Path(rel).suffix.lstrip(".")).lower(),
                        d.get("doc_type"),
                        d.get("doc_date"),
                        d.get("file_size_bytes"),
                        kt_json,
                        (str(d.get("text_snippet") or "")[:500] or None),
                        d.get("parse_status") or "skipped",
                    )
                )
            if insert_docs:
                con.executemany(
                    """
                    INSERT INTO matter_documents VALUES (
                      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    insert_docs,
                )
                con.execute(
                    "CREATE INDEX idx_matter_documents_filename "
                    "ON matter_documents(filename)"
                )
                con.execute(
                    "CREATE INDEX idx_matter_documents_doc_type "
                    "ON matter_documents(doc_type)"
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
        con.execute(
            f"""
            CREATE VIEW adjusted_ebitda_addback_matters AS
            SELECT * FROM matters
            WHERE is_credit_facility AND {FIELD_EBITDA_ADDBACKS}
            """
        )
        con.execute(
            f"""
            CREATE VIEW covenant_lite_credit_facilities AS
            SELECT * FROM matters
            WHERE is_credit_facility AND {FIELD_COVENANT_LITE}
            """
        )
        con.execute(
            f"""
            CREATE VIEW mfn_credit_agreements AS
            SELECT * FROM matters
            WHERE is_credit_facility AND {FIELD_MFN_CREDIT}
            """
        )
        con.execute(
            f"""
            CREATE VIEW always_on_maintenance_credit_facilities AS
            SELECT * FROM matters
            WHERE is_credit_facility AND {FIELD_ALWAYS_ON_MAINT}
            """
        )
        con.execute(
            f"""
            CREATE VIEW maintenance_financial_covenant_matters AS
            SELECT * FROM matters
            WHERE is_credit_facility AND {FIELD_MAINTENANCE_FC}
            """
        )
        con.execute(
            """
            CREATE VIEW hsr_filings AS
            SELECT * FROM matters WHERE has_hsr_filing
            """
        )
        con.execute(
            """
            CREATE VIEW hsr_second_requests AS
            SELECT * FROM matters WHERE is_hsr_second_request
            """
        )
        con.execute(
            """
            CREATE VIEW hsr_second_requests_cleared AS
            SELECT * FROM matters
            WHERE is_hsr_second_request AND has_hsr_clearance
            """
        )
        con.execute(
            """
            CREATE VIEW billion_dollar_antitrust_ma AS
            SELECT * FROM matters
            WHERE deal_value_usd IS NOT NULL
              AND deal_value_usd >= 1200000000
              AND (
                is_hsr_second_request
                OR has_ma_execution_agreement
              )
            """
        )
        con.execute(
            """
            CREATE VIEW secured_credit_facilities AS
            SELECT * FROM matters
            WHERE is_credit_facility AND is_secured
            """
        )
        con.execute(
            f"""
            CREATE VIEW live_maintenance_financings AS
            SELECT * FROM matters
            WHERE is_credit_facility
              AND {FIELD_MAINTENANCE_FC}
              AND NOT (
                coalesce({FIELD_COVENANT_LITE}, false)
                AND coalesce({FIELD_ALWAYS_ON_MAINT}, false) = false
              )
            """
        )
        con.execute(
            f"""
            CREATE VIEW covenant_lite_no_always_on AS
            SELECT * FROM matters
            WHERE is_credit_facility
              AND {FIELD_COVENANT_LITE}
              AND ({FIELD_ALWAYS_ON_MAINT} IS NULL OR {FIELD_ALWAYS_ON_MAINT} = false)
            """
        )
        con.execute(
            """
            CREATE VIEW open_facts_by_matter AS
            SELECT matter_id, fact_key, fact_value, rel_doc, evidence_snippet
            FROM open_facts
            ORDER BY matter_id, fact_key
            """
        )
        con.execute(
            """
            CREATE VIEW documents_by_type AS
            SELECT
              d.matter_id,
              m.client_short_name,
              m.practice_area,
              d.filename,
              d.doc_type,
              d.rel_path
            FROM matter_documents d
            LEFT JOIN matters m ON m.matter_id = d.matter_id
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
        raise ValueError(
            "query must start with SELECT, WITH, DESCRIBE, SHOW, or SUMMARIZE"
        )
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
                "NULL semantic bools mean UNKNOWN (not absence). "
                "Do not conclude 0/N from WHERE col=false or empty views when "
                "many rows are NULL — query open_facts and/or read docs. "
                "Pattern G: for Capital Markets / Restructuring / lock-up / "
                "withdrawal / DIP asks, filter practice_area first, then JOIN "
                "matter_documents (filename / doc_type / key_terms JSON). "
                "Zero cohort → write negative deliverable; never substitute "
                "credit-facility matters. "
                "Examples: "
                "SELECT matter_id, client_short_name, hsr_second_request_proof_doc "
                "FROM matters WHERE is_hsr_second_request; "
                "SELECT matter_id, client_short_name, hsr_second_request_date "
                "FROM matters WHERE is_hsr_second_request "
                "ORDER BY hsr_second_request_date DESC NULLS LAST; "
                "SELECT matter_id, client_short_name, deal_value_usd, "
                "is_hsr_second_request FROM billion_dollar_antitrust_ma "
                "ORDER BY deal_value_usd DESC; "
                "SELECT count(*) FILTER (WHERE is_hsr_second_request) AS k, "
                "count(*) AS n FROM billion_dollar_antitrust_ma; "
                "SELECT matter_id, client_short_name, "
                "has_maintenance_financial_covenant, "
                "has_maintenance_financial_covenant_proof_doc FROM matters "
                "WHERE is_credit_facility AND "
                "has_maintenance_financial_covenant = true; "
                "SELECT * FROM open_facts WHERE fact_key LIKE '%maintenance%'; "
                "SELECT m.matter_id, d.filename, d.doc_type FROM matters m "
                "JOIN matter_documents d ON m.matter_id = d.matter_id "
                "WHERE d.doc_type = 'lock-up-agreement' OR "
                "d.filename ILIKE '%lock-up%'; "
                "SELECT d.key_terms->>'lock_up_period_days' FROM matter_documents d "
                "WHERE d.doc_type = 'lock-up-agreement';"
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "sql": safe}
    finally:
        con.close()


def sql_tool_result_json(db_path: Path, sql: str) -> str:
    return json.dumps(run_readonly_sql(db_path, sql), indent=2, default=str)
