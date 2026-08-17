"""L0 open-fact / evidence layer for Harvey LAB DuckDB.

Schema-less key/value spans extracted from document text *without* requiring
a typed Matter field. Typed L2 columns (``has_maintenance_financial_covenant``,
etc.) should only be True/False when proven; otherwise NULL. Agents must treat
NULL as \"unknown — read the doc\", never as absence.
"""

from __future__ import annotations

import os
import re
from typing import Any

# Surface patterns: generic \"Key: value\" / \"Key = value\" lines.
_KV_LINE_RE = re.compile(
    r"(?m)^[\s>*-]*([A-Za-z][A-Za-z0-9][A-Za-z0-9 /_-]{0,48}?)\s*[:=]\s+"
    r"([^\n]{1,160})$"
)

# Domain-agnostic legal/finance phrase hits → open facts (key = phrase class).
_PHRASE_FACTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "surface.financial_maintenance_covenant",
        re.compile(r"financial\s+maintenance\s+covenant", re.I),
    ),
    (
        "surface.leverage_ratio_covenant",
        re.compile(
            r"(?:maintain|shall\s+not\s+permit|leverage\s+ratio\s+shall\s+not)",
            re.I,
        ),
    ),
    (
        "surface.springing_financial_covenant",
        re.compile(r"springing\s+financial\s+covenant", re.I),
    ),
    (
        "surface.covenant_lite",
        re.compile(r"covenant[- ]lite", re.I),
    ),
    (
        "surface.mfn",
        re.compile(r"\bMFN\b|Most\s+Favored\s+Nation", re.I),
    ),
    (
        "surface.hsr_second_request",
        re.compile(r"second\s+request", re.I),
    ),
    (
        "surface.sku",
        re.compile(r"\bSKU\b\s*[:=]?\s*([A-Za-z0-9][\w.-]{1,32})", re.I),
    ),
)


def nullable_bool(value: Any) -> bool | None:
    """Coerce to True/False/None without treating None as False."""
    if value is True or value is False:
        return value
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip().lower()
        if s in {"true", "yes", "1"}:
            return True
        if s in {"false", "no", "0"}:
            return False
        return None
    return bool(value)


def extract_open_facts_from_text(
    body: str,
    *,
    matter_id: str,
    rel_doc: str,
    max_facts: int = 40,
) -> list[dict[str, Any]]:
    """Emit L0 open facts (key/value + evidence snippet) from raw text."""
    if not body or not body.strip():
        return []
    facts: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def _add(key: str, value: str, snippet: str) -> None:
        key = key.strip()[:120]
        value = " ".join(str(value).split())[:240]
        snippet = " ".join(str(snippet).split())[:280]
        sig = (key.lower(), value.lower(), rel_doc)
        if not key or sig in seen:
            return
        seen.add(sig)
        facts.append(
            {
                "matter_id": matter_id,
                "rel_doc": rel_doc,
                "fact_key": key,
                "fact_value": value,
                "evidence_snippet": snippet,
                "extractor": "open-kv-v0",
            }
        )

    for key, pattern in _PHRASE_FACTS:
        if len(facts) >= max_facts:
            break
        m = pattern.search(body)
        if not m:
            continue
        val = m.group(1) if m.lastindex else m.group(0)
        start = max(0, m.start() - 40)
        end = min(len(body), m.end() + 80)
        _add(key, val, body[start:end])

    for m in _KV_LINE_RE.finditer(body[:80_000]):
        if len(facts) >= max_facts:
            break
        _add(f"kv.{m.group(1).strip()}", m.group(2).strip(), m.group(0)[:280])

    return facts


def collect_open_facts_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows:
        extra = r.get("_open_facts") or r.get("open_facts") or []
        if isinstance(extra, list):
            out.extend(x for x in extra if isinstance(x, dict))
    return out


def preflight_matters_trust(rows: list[dict[str, Any]]) -> list[str]:
    """Return human-readable trust problems (empty = ok).

    Hard problems (returned as errors when CLAWQL_LAB_TRUST_STRICT=1):
    - credit cohort has every semantic flag forced False (the 009 failure mode)
    Soft problems are always printed by the caller as WARNING.
    """
    problems: list[str] = []
    credits = [r for r in rows if r.get("is_credit_facility")]
    if not credits:
        return problems

    semantic_cols = (
        "has_maintenance_financial_covenant",
        "has_always_on_maintenance_covenant",
        "has_springing_financial_covenant",
        "is_covenant_lite",
        "has_mfn_in_credit_agreement",
        "has_adjusted_ebitda_addbacks",
    )
    for col in semantic_cols:
        vals = [r.get(col) for r in credits]
        if vals and all(v is False for v in vals):
            problems.append(
                f"all {len(credits)} credit facilities have {col}=false "
                "(treat as untrusted absence; prefer NULL until proven, or verify via open_facts / doc read)"
            )
        proof_col = f"{col}_proof_doc"
        if any(proof_col in r for r in credits):
            missing = [
                str(r.get("matter_id"))
                for r in credits
                if r.get(col) is True and not str(r.get(proof_col) or "").strip()
            ]
            if missing:
                problems.append(
                    f"{col}=true without {proof_col} for matters {missing[:8]}"
                )
    return problems


def trust_strict_enabled() -> bool:
    return os.environ.get("CLAWQL_LAB_TRUST_STRICT", "0").strip() == "1"
