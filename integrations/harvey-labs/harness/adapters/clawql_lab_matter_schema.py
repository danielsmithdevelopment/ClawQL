"""Generalized Matter field registry for Harvey LAB IDP → DuckDB.

Declares *what* to extract (field classes + preferred doc roles) and *how*
to merge multi-doc grounded fills. Demo LangExtract uses the same
``extraction_class`` names; live mode can swap without changing SQL.

This is the generalization of the credit-facility-only spike: tasks like
011 / 013–015 need memos and semantic MFN, not a single execution CA.
"""

from __future__ import annotations

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
        (DOC_ROLE_EXECUTION_CREDIT,),
        description="Dated-as-of on executed credit/loan agreement",
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


def empty_matter_fields() -> dict[str, Any]:
    out: dict[str, Any] = {
        "source_doc": "",
        "docs_scanned": 0,
        "extract_provider": "none",
        "parse_provider": "none",
    }
    for spec in MATTER_FIELD_REGISTRY:
        if spec.kind == "bool":
            out[spec.name] = False
        else:
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
        if truthy and not fields.get(cls):
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
    elif value and not fields.get(cls):
        fields[cls] = value


def iter_field_names() -> Iterable[str]:
    for spec in MATTER_FIELD_REGISTRY:
        yield spec.name
        if spec.stores_proof_doc:
            yield proof_column(spec.name)
