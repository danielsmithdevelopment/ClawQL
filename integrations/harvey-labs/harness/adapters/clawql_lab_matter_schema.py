"""Generalized Matter field registry for Harvey LAB IDP → DuckDB.

Declares *what* to extract (field classes + preferred doc roles) and *how*
to merge multi-doc grounded fills. Demo LangExtract uses the same
``extraction_class`` names; live mode can swap without changing SQL.

This is the generalization of the credit-facility-only spike: tasks like
011 / 013–015 need memos and semantic MFN, not a single execution CA.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

# Doc roles used to prioritize Tika/LangExtract work.
DOC_ROLE_EXECUTION_CREDIT = "execution_credit"
DOC_ROLE_TERM_SHEET = "term_sheet"
DOC_ROLE_MEMO = "memo"
DOC_ROLE_SAFE = "safe"
DOC_ROLE_OTHER = "other"

# Matter / fact classes (LangExtract extraction_class names).
FIELD_DEAL_DATE = "deal_date"
FIELD_FACILITY_AMOUNT = "facility_amount_usd"
FIELD_INCREMENTAL = "has_incremental_facility"
FIELD_REVOLVER = "has_revolving_facility"
FIELD_SPRINGING = "mentions_springing_lien"
FIELD_SECURED = "is_secured"
FIELD_EBITDA_ADDBACKS = "has_adjusted_ebitda_addbacks"
FIELD_COVENANT_LITE = "is_covenant_lite"
FIELD_MFN_CREDIT = "has_mfn_in_credit_agreement"
FIELD_SPRINGING_FC = "has_springing_financial_covenant"
FIELD_ALWAYS_ON_MAINT = "has_always_on_maintenance_covenant"
FIELD_MAINTENANCE_FC = "has_maintenance_financial_covenant"
FIELD_BORROWER_CONTROL = "borrower_control"  # sponsor | corporate


@dataclass(frozen=True)
class MatterFieldSpec:
    """One typed Matter fact the pipeline knows how to fill."""

    name: str
    kind: str  # bool | date | number | string
    doc_roles: tuple[str, ...]
    stores_proof_doc: bool = False
    description: str = ""


# Registry — extend here as new SQL-shaped LAB tasks need columns.
MATTER_FIELD_REGISTRY: tuple[MatterFieldSpec, ...] = (
    MatterFieldSpec(
        FIELD_DEAL_DATE,
        "date",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET),
        description="Dated-as-of on executed credit/loan agreement (memo fallback)",
    ),
    MatterFieldSpec(
        FIELD_FACILITY_AMOUNT,
        "number",
        (DOC_ROLE_EXECUTION_CREDIT,),
        description="Aggregate facility principal USD",
    ),
    MatterFieldSpec(
        FIELD_INCREMENTAL,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT,),
    ),
    MatterFieldSpec(
        FIELD_REVOLVER,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT,),  # path signals separate; avoid memo FP (024)
    ),
    MatterFieldSpec(
        FIELD_SPRINGING,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET, DOC_ROLE_OTHER),
    ),
    MatterFieldSpec(
        FIELD_SECURED,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT,),
    ),
    MatterFieldSpec(
        FIELD_EBITDA_ADDBACKS,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET),
        stores_proof_doc=True,
        description="Negotiated / defined Adjusted-EBITDA add-backs (011)",
    ),
    MatterFieldSpec(
        FIELD_COVENANT_LITE,
        "bool",
        (DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET, DOC_ROLE_EXECUTION_CREDIT),
        stores_proof_doc=True,
        description="Covenant-lite institutional TLB (014)",
    ),
    MatterFieldSpec(
        FIELD_MFN_CREDIT,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT,),  # never SAFE — 013 trap
        stores_proof_doc=True,
        description="MFN in executed credit agreement, literal or accordion (013/015)",
    ),
    MatterFieldSpec(
        FIELD_SPRINGING_FC,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET),
        stores_proof_doc=True,
        description="Springing-gated financial covenant (016 springing-only bucket)",
    ),
    MatterFieldSpec(
        FIELD_ALWAYS_ON_MAINT,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET),
        stores_proof_doc=True,
        description="Always-on maintenance (016); excludes springing-gated-only",
    ),
    MatterFieldSpec(
        FIELD_MAINTENANCE_FC,
        "bool",
        (DOC_ROLE_EXECUTION_CREDIT, DOC_ROLE_MEMO, DOC_ROLE_TERM_SHEET),
        stores_proof_doc=True,
        description="Any maintenance FC incl. springing (019 vs incurrence-only)",
    ),
    MatterFieldSpec(
        FIELD_BORROWER_CONTROL,
        "string",
        (
            DOC_ROLE_EXECUTION_CREDIT,
            DOC_ROLE_MEMO,
            DOC_ROLE_TERM_SHEET,
        ),
        description="sponsor (PE portco) vs corporate (public borrower) — 017",
    ),
)


def classify_doc_role(rel: str, name: str) -> str:
    n = name.lower()
    r = rel.replace("\\", "/").lower()
    if "safe" in n or "simple-agreement" in n or "/safe" in f"/{r}":
        return DOC_ROLE_SAFE
    if "execution" in n and any(
        k in n
        for k in (
            "credit-agreement",
            "loan-agreement",
            "bridge",
            "term-loan",
            "mezzanine",
        )
    ):
        return DOC_ROLE_EXECUTION_CREDIT
    if "term-sheet" in n or "term_sheet" in n:
        return DOC_ROLE_TERM_SHEET
    if any(
        k in n
        for k in (
            "memo",
            "memorandum",
            "issues-list",
            "covenant",
            "defined-term",
            "deal-summary",
            "pro-forma",
            "proforma",
            "compliance-certificate",
            "closing-memorandum",
        )
    ):
        return DOC_ROLE_MEMO
    return DOC_ROLE_OTHER


def _doc_score(role: str, name: str) -> int:
    base = {
        DOC_ROLE_EXECUTION_CREDIT: 100,
        DOC_ROLE_TERM_SHEET: 70,
        DOC_ROLE_MEMO: 60,
        DOC_ROLE_OTHER: 20,
        DOC_ROLE_SAFE: 5,
    }.get(role, 10)
    nl = name.lower()
    if any(
        k in nl
        for k in (
            "ebitda",
            "add-back",
            "addback",
            "covenant",
            "mfn",
            "credit",
            "loan",
            "facility",
            "defined-term",
        )
    ):
        base += 15
    if any(k in nl for k in ("draft", "redline", "wg-", "near-final")):
        base -= 25
    return base


def catalog_matter_docs(matter_dir: Path, *, limit: int = 12) -> list[tuple[str, Path]]:
    """Rank .docx for IDP fill: execution CAs first, then memos/term sheets."""
    scored: list[tuple[int, str, Path]] = []
    for p in matter_dir.rglob("*.docx"):
        if not p.is_file():
            continue
        rel = str(p.relative_to(matter_dir)).replace("\\", "/")
        role = classify_doc_role(rel, p.name)
        scored.append((_doc_score(role, p.name), role, p))
    scored.sort(key=lambda x: (-x[0], str(x[2])))
    out: list[tuple[str, Path]] = []
    for _score, role, path in scored:
        if len(out) >= limit:
            break
        out.append((role, path))
    return out


def proof_column(field_name: str) -> str:
    return f"{field_name}_proof_doc"


# Semantic booleans: default NULL (unknown). Path/structural detectors may still
# set True/False explicitly. Never treat NULL as absence in SQL agents.
SEMANTIC_BOOL_FIELDS: frozenset[str] = frozenset(
    {
        FIELD_EBITDA_ADDBACKS,
        FIELD_COVENANT_LITE,
        FIELD_MFN_CREDIT,
        FIELD_SPRINGING_FC,
        FIELD_ALWAYS_ON_MAINT,
        FIELD_MAINTENANCE_FC,
        FIELD_INCREMENTAL,
        FIELD_SPRINGING,
        FIELD_REVOLVER,
        FIELD_SECURED,
    }
)


def empty_matter_fields() -> dict[str, Any]:
    out: dict[str, Any] = {
        "source_doc": "",
        "docs_scanned": 0,
        "extract_provider": "none",
        "parse_provider": "none",
        "_open_facts": [],
    }
    for spec in MATTER_FIELD_REGISTRY:
        # Unknown until positively evidenced (True) or explicitly ruled out (False).
        out[spec.name] = None
        if spec.stores_proof_doc:
            out[proof_column(spec.name)] = ""
    return out


def merge_extraction_hit(
    fields: dict[str, Any],
    *,
    cls: str,
    value: Any,
    rel_doc: str,
    role: str,
) -> None:
    """Merge one grounded extraction into the Matter field bag."""
    spec = next((s for s in MATTER_FIELD_REGISTRY if s.name == cls), None)
    if spec is None:
        return
    # Honor preferred doc roles for every field (MFN must never come from SAFE).
    if spec.doc_roles and role not in spec.doc_roles:
        return
    if spec.kind == "bool":
        truthy = value is True or str(value).strip().lower() in {"true", "yes", "1"}
        if truthy and fields.get(cls) is not True:
            fields[cls] = True
            if spec.stores_proof_doc and not fields.get(proof_column(cls)):
                fields[proof_column(cls)] = rel_doc
    elif spec.kind == "date":
        if value and not fields.get(cls):
            fields[cls] = value
            if not fields.get("source_doc") and role == DOC_ROLE_EXECUTION_CREDIT:
                fields["source_doc"] = rel_doc
    elif spec.kind == "number":
        if value is not None and fields.get(cls) is None:
            fields[cls] = value
    elif spec.kind == "string" and value:
        val = str(value).strip().lower()
        if cls == FIELD_BORROWER_CONTROL:
            if val not in {"sponsor", "corporate"}:
                return
            cur = fields.get(cls)
            if not cur:
                fields[cls] = val
            elif cur == "sponsor" and val == "corporate":
                # Public borrower beats portco co-mention when both seen
                fields[cls] = "corporate"
        elif not fields.get(cls):
            fields[cls] = value
    elif value and not fields.get(cls):
        fields[cls] = value


def iter_field_names() -> Iterable[str]:
    for spec in MATTER_FIELD_REGISTRY:
        yield spec.name
        if spec.stores_proof_doc:
            yield proof_column(spec.name)


# --- Layer 2 document inventory (practice-area-agnostic) ---

# Filename/path → doc_type hints (not graded booleans).
_DOC_TYPE_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("lock-up", "lockup", "lock_up"), "lock-up-agreement"),
    (("withdraw", "withdrawal", "notice-of-withdrawal"), "withdrawal-notice"),
    (
        ("offering-memorandum", "prospectus", "424b", "s-1", "f-1"),
        "offering-document",
    ),
    (
        (
            "underwriting-agreement",
            "private-placement",
            "warrant-agreement",
        ),
        "offering-document",
    ),
    (("dip", "debtor-in-possession", "debtor_in_possession"), "dip-financing"),
    (
        ("credit-agreement", "loan-agreement", "bridge", "term-loan"),
        "credit-agreement",
    ),
    (("hsr", "second-request", "second_request"), "hsr-filing"),
    (("form-of-", "form_of_"), "form-document"),
)

_DOC_TYPE_PARSE_PRIORITY: dict[str, int] = {
    "lock-up-agreement": 100,
    "withdrawal-notice": 95,
    "dip-financing": 90,
    "offering-document": 85,
    "credit-agreement": 80,
    "hsr-filing": 70,
    "form-document": 60,
    "other": 10,
}

_LOCK_UP_DAYS_RE = re.compile(
    r"(?:lock[- ]?up\s+(?:period|restriction)?\s*(?:of|for|:)?\s*)?"
    r"(\d{1,3})\s*-?\s*(?:calendar\s+)?days?"
    r"(?:\s+(?:lock[- ]?up|following|after))?",
    re.IGNORECASE,
)
_LOCK_UP_DAYS_ALT_RE = re.compile(
    r"lock[- ]?up[^\n.]{0,80}?(\d{1,3})\s*-?\s*(?:calendar\s+)?days?",
    re.IGNORECASE,
)
_LOCK_UP_DAYS_PREFIX_RE = re.compile(
    r"(\d{1,3})\s*-?\s*(?:calendar\s+)?days?\s+lock[- ]?up",
    re.IGNORECASE,
)
_WITHDRAWAL_DATE_RE = re.compile(
    r"(?:withdraw(?:al|n)|notice\s+of\s+withdrawal)[^\n.]{0,60}?"
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4}"
    r"|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)
_OFFERING_WITHDRAWN_RE = re.compile(
    r"(?:offering (?:was|has been) withdrawn|"
    r"(?:company|issuer) (?:has )?withdrawn the offering|"
    r"withdrawal of the (?:offering|registration statement)|"
    r"offering was pulled(?: at launch)?)",
    re.IGNORECASE,
)
_OFFERING_PULLED_DATE_RE = re.compile(
    r"offering was pulled(?: at launch)? on "
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)
_DIP_AMOUNT_RE = re.compile(
    r"(?:DIP|debtor[- ]in[- ]possession)[^\n$]{0,80}?"
    r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)"
    r"\s*(billion|million)?",
    re.IGNORECASE | re.DOTALL,
)
_PARTY_RE = re.compile(
    r"(?:between|among)\s+([A-Z][A-Za-z0-9&.,' \-]{2,60}?)"
    r"\s+and\s+([A-Z][A-Za-z0-9&.,' \-]{2,60}?)(?:\s*[,.(]|$)",
)


def infer_doc_type(rel: str, name: str) -> str:
    """Filename/path heuristics → inventory doc_type hint."""
    blob = f"{rel.replace(chr(92), '/').lower()} {name.lower()}"
    # HSR withdrawal letters are not Capital Markets offering withdrawals.
    if "hsr" in blob and "withdraw" in blob:
        return "hsr-filing"
    for signals, doc_type in _DOC_TYPE_RULES:
        if any(sig in blob for sig in signals):
            return doc_type
    return "other"


def doc_type_parse_priority(doc_type: str | None) -> int:
    return _DOC_TYPE_PARSE_PRIORITY.get(doc_type or "other", 10)


def catalog_all_matter_files(
    matter_dir: Path,
    *,
    skip_ext: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Walk all files under a matter folder for SQL inventory rows.

    Every file gets a row. ``skip_ext`` only affects callers that choose to
    skip parsing later — inventory always includes the path.
    """
    matter_dir = Path(matter_dir)
    skip = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in (skip_ext or set())}
    out: list[dict[str, Any]] = []
    for p in sorted(matter_dir.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(matter_dir)).replace("\\", "/")
        ext = p.suffix.lower().lstrip(".")
        name = p.name
        try:
            size = p.stat().st_size
        except OSError:
            size = None
        row: dict[str, Any] = {
            "rel_path": rel,
            "filename": name,
            "ext": ext,
            "doc_type": infer_doc_type(rel, name),
            "file_size_bytes": size,
            "doc_date": None,
            "key_terms": None,
            "text_snippet": "",
            "parse_status": "skipped",
        }
        if skip and f".{ext}" in skip:
            row["parse_status"] = "skipped"
        out.append(row)
    return out


def _normalize_withdrawal_date(raw: str) -> str | None:
    """Parse withdrawal/pull dates; reject implausible future years."""
    raw = raw.replace(",", "").strip()
    iso = raw
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        from datetime import datetime

        parsed = None
        for fmt in ("%B %d %Y", "%b %d %Y"):
            try:
                parsed = datetime.strptime(raw, fmt).date()
                break
            except ValueError:
                continue
        if parsed is None:
            return None
        iso = parsed.isoformat()
    try:
        year = int(iso[:4])
    except ValueError:
        return None
    if year < 1990 or year > 2027:
        return None
    return iso


def extract_key_terms_from_text(
    text: str,
    *,
    doc_type: str | None = None,
    filename: str = "",
) -> dict[str, Any]:
    """Lightweight regex extractors for inventory key_terms (best-effort)."""
    if not text:
        return {}
    terms: dict[str, Any] = {"source": "local_heuristic"}
    dt = (doc_type or "").lower()
    fn = filename.lower()
    text_l = text.lower()
    want_lock = (
        dt in {"lock-up-agreement", "form-document", ""}
        or any(t in fn for t in ("lock-up", "lockup", "lock_up"))
        or "lock-up" in text_l
        or "lockup" in text_l
        or "lock up" in text_l
    )
    want_withdraw = (
        dt == "withdrawal-notice"
        or "withdraw" in fn
        or _OFFERING_WITHDRAWN_RE.search(text) is not None
        or _OFFERING_PULLED_DATE_RE.search(text) is not None
    )
    want_dip = (
        dt == "dip-financing"
        or "dip" in fn
        or "debtor-in-possession" in fn
        or "debtor-in-possession" in text_l
        or "debtor in possession" in text_l
    )

    if want_lock:
        m = (
            _LOCK_UP_DAYS_PREFIX_RE.search(text)
            or _LOCK_UP_DAYS_ALT_RE.search(text)
            or _LOCK_UP_DAYS_RE.search(text)
        )
        if m:
            try:
                days = int(m.group(1))
                if 1 <= days <= 730:
                    terms["lock_up_period_days"] = days
                    terms["lock_up_period"] = f"{days} days"
            except ValueError:
                pass

    if want_withdraw:
        if _OFFERING_WITHDRAWN_RE.search(text) or _OFFERING_PULLED_DATE_RE.search(text):
            terms["offering_status"] = "withdrawn"
        m = _OFFERING_PULLED_DATE_RE.search(text) or _WITHDRAWAL_DATE_RE.search(text)
        if m:
            raw = m.group(1).replace(",", "").strip()
            iso = _normalize_withdrawal_date(raw)
            if iso:
                terms["withdrawal_date"] = iso
                terms["offering_status"] = "withdrawn"

    if want_dip:
        m = _DIP_AMOUNT_RE.search(text)
        if m:
            try:
                num = float(m.group(1).replace(",", ""))
                unit = (m.group(2) or "").lower()
                if unit.startswith("b"):
                    num *= 1_000_000_000.0
                elif unit.startswith("m"):
                    num *= 1_000_000.0
                terms["dip_amount_usd"] = num
            except ValueError:
                pass

    parties: list[str] = []
    for m in _PARTY_RE.finditer(text[:8000]):
        for g in m.groups():
            party = re.sub(r"\s+", " ", g).strip(" ,.")
            if len(party) >= 3 and party not in parties:
                parties.append(party)
            if len(parties) >= 4:
                break
        if len(parties) >= 4:
            break
    if parties:
        terms["parties"] = parties

    # Drop source-only empty bags.
    if set(terms.keys()) <= {"source"}:
        return {}
    return terms
