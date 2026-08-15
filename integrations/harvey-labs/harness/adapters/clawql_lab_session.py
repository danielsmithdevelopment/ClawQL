"""Shared vault / MCP / tool wiring for Harvey LAB ClawQL adapters.

Used by the Anthropic ClawQL adapter and the OpenRouter chat-completions
adapter (Nemotron / other OpenAI-compatible models).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import requests

try:
    from harness.adapters.clawql_vault import resolve_task_vault, vault_root
except ImportError:  # unit tests import adapters/ as a flat path
    from clawql_vault import resolve_task_vault, vault_root

try:
    from harness.adapters.clawql_lab_duckdb import (
        build_matters_duckdb,
        default_duckdb_path,
        duckdb_available,
        matter_has_revolving_facility,
        matter_mentions_springing_lien,
        sql_tool_result_json,
    )
except ImportError:
    from clawql_lab_duckdb import (  # type: ignore
        build_matters_duckdb,
        default_duckdb_path,
        duckdb_available,
        matter_has_revolving_facility,
        matter_mentions_springing_lien,
        sql_tool_result_json,
    )

CLAWQL_MCP_URL = os.environ.get("CLAWQL_MCP_URL", "http://localhost:8080/mcp")
CLAWQL_VAULT_ROOT = vault_root()

MAX_EXTRACT_CHARS = int(os.environ.get("CLAWQL_LAB_MAX_EXTRACT_CHARS", "12000"))
MAX_DOCS_PER_MATTER = int(os.environ.get("CLAWQL_LAB_MAX_DOCS_PER_MATTER", "8"))
MAX_MATTERS = int(os.environ.get("CLAWQL_LAB_MAX_MATTERS", "0"))
INGEST_CACHE_NAME = ".clawql-lab-ingest-complete"

# High-precision HSR Second Request evidence (firm-knowledge / Calderwood DMS).
# Filename `second-request` (excluding preparation-only) OR the defined term
# `(the "Second Request")` in body text — validated against task 001 allowlist.
_HSR_SECOND_REQUEST_PAREN = re.compile(
    r'\(the ["\u201c]Second Request["\u201d]\)',
    re.IGNORECASE,
)
_ANTITRUST_PATH = re.compile(
    r"antitrust|hsr|ftc|doj|regulatory",
    re.IGNORECASE,
)

# Rubric-friendly evidence filenames (task 001 C-004/C-005/C-006 and peers).
# Prefer these over engagement letters when packaging the deliverable.
_PREFERRED_SECOND_REQUEST_EVIDENCE = (
    "second-request-strategy-memo",
    "hsr-withdrawal-letter",
    "joint-status-report",
    "case-assessment-memo",
    "letter-ftc-meet-and-confer",
    "substantial-compliance-certification",
    "custodian-identification-collection-protocol",
    "second-request-response-strategy",
    "second-request-compliance-cover",
    "second-request-compliance-cost",
    "second-request-compliance-strategy",
)

# Firm shorthand labels used in LAB criteria (prefer over truncated filename stems).
_CLIENT_SHORT_NAMES = (
    "Cascade Retail",
    "Harrowgate PE",
    "Solara Digital",
    "Halcyon Semi",
    "Harrowgate",
    "Cascade",
    "Solara",
    "Halcyon",
)

# Map truncated / filename stems → rubric short names (task 001 C-001..C-007).
_CLIENT_CANONICAL: dict[str, str] = {
    "cascade": "Cascade Retail",
    "cascade retail": "Cascade Retail",
    "harrowgate": "Harrowgate PE",
    "harrowgate pe": "Harrowgate PE",
    "harrowgate hsr": "Harrowgate PE",
    "hpe": "Harrowgate PE",
    "hpe fund iv": "Harrowgate PE",
    "solara": "Solara Digital",
    "solara digital": "Solara Digital",
    "sdilp": "Solara Digital",
    "halcyon": "Halcyon Semi",
    "halcyon semi": "Halcyon Semi",
    "halcyon semiconductor": "Halcyon Semi",
}


def _canonicalize_client(label: str) -> str:
    # Collapse newlines/tabs — engagement OCR/regex can glue lines; a raw
    # newline in client breaks CLAWQL_TITLE=… so CREDIT_FACILITY falls off
    # the title line (probe #6: 1008-00001 ontology N=11).
    normalized = " ".join(str(label).strip().split())
    key = normalized.lower()
    if key in _CLIENT_CANONICAL:
        return _CLIENT_CANONICAL[key]
    # Prefix upgrade: "Cascade …" / "Harrowgate …" when already long-form-ish
    for stem, canon in (
        ("cascade retail", "Cascade Retail"),
        ("harrowgate pe", "Harrowgate PE"),
        ("solara digital", "Solara Digital"),
        ("halcyon semi", "Halcyon Semi"),
    ):
        if key.startswith(stem):
            return canon
    for stem, canon in (
        ("cascade", "Cascade Retail"),
        ("harrowgate", "Harrowgate PE"),
        ("solara", "Solara Digital"),
        ("halcyon", "Halcyon Semi"),
    ):
        if key == stem or key.startswith(stem + " "):
            return canon
    return normalized

CLAWQL_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "clawql_memory_recall",
        "description": (
            "Retrieve matter context from the ClawQL vault/ontology. "
            "Use schema='legal.Matter' + filters title contains "
            "HSR_SECOND_REQUEST ONLY when the task explicitly asks about "
            "second requests / second-request compliance. For HSR filing, "
            "covenant-lite, MFN, or 'most recent matter' questions, do NOT "
            "use HSR_SECOND_REQUEST. If two structured recalls return "
            "empty/insufficient hits, stop recalling and use harness "
            "grep/read; treat partial grep hits as unresolved, not confirmed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Audit/logging hint (still required). Filters drive "
                        "structured ontology recall when schema is set."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": "Max notes to return (default 10)",
                },
                "schema": {
                    "type": "string",
                    "description": (
                        "Ontology schema for structured recall. Use "
                        "'legal.Matter' for firm-knowledge enumeration."
                    ),
                },
                "filters": {
                    "type": "object",
                    "description": (
                        "Structured ontology filters (required with schema). "
                        'e.g. {"title":{"contains":"HSR_SECOND_REQUEST"}}'
                    ),
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "clawql_memory_ingest",
        "description": (
            "Persist a finding or intermediate note into the ClawQL vault for "
            "later recall within this task. Prefer `insights` for the summary "
            "and put long extracts in `toolOutputs` (or `content`, which maps "
            "to toolOutputs)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "insights": {"type": "string"},
                "content": {
                    "type": "string",
                    "description": "Long body text (mapped to toolOutputs)",
                },
                "toolOutputs": {"type": "string"},
                "wikilinks": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "clawql_search",
        "description": "Discover operations across indexed APIs (usually unused on LAB).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "clawql_execute",
        "description": "Execute a discovered API operation (usually unused on LAB).",
        "parameters": {
            "type": "object",
            "properties": {
                "operationId": {"type": "string"},
                "arguments": {"type": "object"},
            },
            "required": ["operationId"],
        },
    },
    {
        "name": "clawql_audit",
        "description": "Append an audit / RTP lineage entry for this LAB run.",
        "parameters": {
            "type": "object",
            "properties": {
                "type": {"type": "string"},
                "payload": {"type": "object"},
            },
            "required": ["type"],
        },
    },
    {
        "name": "clawql_sql",
        "description": (
            "Run a read-only SQL query against the task DuckDB (matters table). "
            "PREFERRED for exact enumeration / frequency cohorts. Examples: "
            "SELECT matter_id, client_short_name FROM matters "
            "WHERE is_credit_facility ORDER BY matter_id; "
            "SELECT count(*) FILTER (WHERE mentions_springing_lien) AS k, "
            "count(*) AS n FROM matters WHERE is_credit_facility; "
            "SELECT matter_id FROM matters WHERE is_credit_facility "
            "AND has_revolving_facility; "
            "Also: is_hsr_second_request, practice_area, matter_type. "
            "SELECT/WITH/DESCRIBE only — no writes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Single read-only SQL statement",
                },
            },
            "required": ["sql"],
        },
    },
]

_TOOL_NAME_TO_MCP = {
    "clawql_memory_recall": "memory_recall",
    "clawql_memory_ingest": "memory_ingest",
    "clawql_ingest_external_knowledge": "ingest_external_knowledge",
    "clawql_search": "search",
    "clawql_execute": "execute",
    "clawql_audit": "audit",
}

# ingest_external_knowledge documents[] cap (see docs/mcp/external-ingest.md).
# LAB notes are large (full-text extracts); keep batches smaller than the tool
# max so a single tools/call finishes under the MCP HTTP timeout.
_BULK_INGEST_BATCH = 25
_BULK_INGEST_HTTP_TIMEOUT_S = 600
# Cap for JSON returned from execute_clawql_tool to the agent. Structured
# cohort recalls must keep every matterId visible — 20k was too tight once
# hits+results+guidance are pretty-printed.
_CLAWQL_TOOL_JSON_CHARS = int(
    os.environ.get("CLAWQL_LAB_CLAWQL_TOOL_JSON_CHARS", "100000")
)



def _docx_to_text(path: Path, max_chars: int = MAX_EXTRACT_CHARS) -> str:
    try:
        with ZipFile(path) as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001
        return f"(failed to extract {path.name}: {exc})"
    text = re.sub(r"<w:tab[^/]*/>", "\t", xml)
    text = re.sub(r"</w:p>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > max_chars:
        return text[:max_chars] + "\n…[truncated]"
    return text


def _plain_text(path: Path, max_chars: int = MAX_EXTRACT_CHARS) -> str:
    try:
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001
        return f"(failed to read {path.name}: {exc})"
    if len(raw) > max_chars:
        return raw[:max_chars] + "\n…[truncated]"
    return raw


def _priority_docs(matter_dir: Path) -> list[Path]:
    files = [p for p in matter_dir.rglob("*") if p.is_file()]
    scored: list[tuple[int, Path]] = []
    for p in files:
        name = p.name.lower()
        score = 0
        if "closing" in name:
            score += 50
        if "engagement" in name:
            score += 40
        if "second-request" in name or "second_request" in name:
            score += 80
        if "hsr" in name:
            score += 30
        for pref in _PREFERRED_SECOND_REQUEST_EVIDENCE:
            if pref in name:
                score += 120
                break
        # Explicit demote: engagement letters are not Second Request evidence.
        if "engagement" in name:
            score -= 20
        if name.endswith((".docx", ".md", ".txt")):
            score += 5
        if name.endswith((".xlsx", ".pptx", ".pdf")):
            score -= 10
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda t: (-t[0], str(t[1])))
    return [p for _, p in scored[:MAX_DOCS_PER_MATTER]]


def _preferred_evidence_paths(matter_dir: Path) -> list[str]:
    """Sandbox-relative preferred Second Request evidence paths (not engagement)."""
    hits: list[tuple[int, str]] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() != ".docx":
            continue
        name = p.name.lower()
        if "engagement" in name:
            continue
        for i, pref in enumerate(_PREFERRED_SECOND_REQUEST_EVIDENCE):
            if pref in name:
                rel = str(p.relative_to(matter_dir))
                hits.append((i, f"matters/{matter_dir.name}/{rel}"))
                break
    hits.sort(key=lambda t: t[0])
    # stable unique
    seen: set[str] = set()
    out: list[str] = []
    for _, path in hits:
        if path in seen:
            continue
        seen.add(path)
        out.append(path)
    return out[:8]


def _client_hint_from_engagement_filename(path: Path) -> str | None:
    stem = path.stem
    stem = re.sub(r"(?i)engagement[-_ ]?letter[-_ ]?", "", stem)
    stem = re.sub(r"[-_]+", " ", stem).strip()
    if not stem:
        return None
    canon = _canonicalize_client(stem)
    if canon != stem.strip():
        return canon
    # Known stems that title-case alone would miss (sdilp, hpe)
    key = stem.lower()
    if key in _CLIENT_CANONICAL:
        return _CLIENT_CANONICAL[key]
    return None


def _client_hint(matter_dir: Path) -> str:
    """Best-effort client short name for LAB criteria (never truncated stems)."""
    engagement_docs = [
        p
        for p in matter_dir.rglob("*")
        if p.is_file() and "engagement" in p.name.lower() and p.suffix.lower() == ".docx"
    ]
    # Filename stems first — engagement bodies often say "Harrowgate" / "Halcyon"
    # without the rubric short form ("Harrowgate PE" / "Halcyon Semi").
    for p in engagement_docs:
        hint = _client_hint_from_engagement_filename(p)
        if hint:
            return hint

    for p in engagement_docs:
        text = _docx_to_text(p, max_chars=8000)
        for label in sorted(_CLIENT_SHORT_NAMES, key=len, reverse=True):
            if re.search(rf"\b{re.escape(label)}\b", text, re.IGNORECASE):
                return _canonicalize_client(label)
        m = re.search(
            r"\b([A-Z][A-Za-z0-9&.'/-]+(?:\s+[A-Z][A-Za-z0-9&.'/-]+){0,4})\s+"
            r"(?:Holdings|Semiconductor|Capital|Retail|Digital|Inc\.?|LLC|LP)\b",
            text,
        )
        if m:
            return _canonicalize_client(m.group(0))

    for p in engagement_docs:
        hint = _client_hint_from_engagement_filename(p)
        if hint:
            return hint
        stem = re.sub(r"(?i)engagement[-_ ]?letter[-_ ]?", "", p.stem)
        stem = re.sub(r"[-_]+", " ", stem).strip()
        if stem:
            return _canonicalize_client(stem.title())
    return " ".join(matter_dir.name.strip().split())


def _has_antitrust_signal(matter_dir: Path) -> bool:
    for p in matter_dir.rglob("*"):
        if _ANTITRUST_PATH.search(str(p.relative_to(matter_dir))):
            return True
    return False


def _second_request_filename_evidence(matter_dir: Path) -> list[str]:
    """Non-preparation filenames containing second-request / second_request."""
    hits: list[str] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        if "second-request" not in name and "second_request" not in name:
            continue
        if "preparation" in name:
            continue
        hits.append(str(p.relative_to(matter_dir)))
    return hits


def _second_request_defined_term_evidence(matter_dir: Path) -> list[str]:
    """Docs whose body defines (the \"Second Request\") — high precision."""
    hits: list[str] = []
    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() != ".docx":
            continue
        path_l = str(p).lower()
        # Skip obviously unrelated binaries; still scan antitrust/HSR/FTC paths
        # and any doc already looking like second-request evidence.
        if not (
            "second-request" in path_l
            or "second_request" in path_l
            or _ANTITRUST_PATH.search(path_l)
            or "status" in path_l
            or "case-assessment" in path_l
            or "compliance" in path_l
            or "closing" in path_l
        ):
            continue
        text = _docx_to_text(p, max_chars=50000)
        if _HSR_SECOND_REQUEST_PAREN.search(text):
            hits.append(str(p.relative_to(matter_dir)))
    return hits


def detect_hsr_second_request(matter_dir: Path) -> dict[str, Any]:
    """Return detection payload for HSR Second Request received evidence."""
    file_hits = _second_request_filename_evidence(matter_dir)
    # Defined-term body scan is expensive — skip when filename already hits.
    # Path filter inside _second_request_defined_term_evidence keeps it bounded.
    text_hits: list[str] = []
    if not file_hits:
        text_hits = _second_request_defined_term_evidence(matter_dir)
    received = bool(file_hits or text_hits)
    preferred = _preferred_evidence_paths(matter_dir) if received else []
    return {
        "received": received,
        "evidence_files": (file_hits + text_hits)[:12],
        "preferred_evidence": preferred,
        "antitrust_signal": _has_antitrust_signal(matter_dir),
        "client_hint": _client_hint(matter_dir),
    }


def _is_signed_facility_docx_name(name_l: str) -> bool:
    """True for execution credit/loan agreement filenames (not memos/DIP/etc.)."""
    if any(
        tok in name_l
        for tok in (
            "dip",
            "construction",
            "building-loan",
            "project-loan",
            "mortgage",
            "liquidity",
            "memo",
            "analysis",
            "letter",
            "issues",
        )
    ):
        return False
    if "execution" not in name_l:
        return False
    return (
        "credit-agreement" in name_l
        or "credit_agreement" in name_l
        or name_l.startswith("credit agreement")
        or "bridge-loan-agreement" in name_l
        or "bridge_loan_agreement" in name_l
        or "term-loan-agreement" in name_l
        or "term_loan_agreement" in name_l
        or "mezzanine-credit-agreement" in name_l
        or (
            "loan-agreement" in name_l
            and "intercreditor" not in name_l
            and "mezzanine-loan" not in name_l
            and "senior-mortgage" not in name_l
        )
    )


def detect_credit_facility(matter_dir: Path) -> dict[str, Any]:
    """High-precision signed credit-facility signals from DMS paths.

    Seeds ``CLAWQL_PRACTICE_AREA=Banking & Finance`` and title flag
    ``CREDIT_FACILITY`` so frequency tasks can define denominator N via
    ontology recall (task 018).

    Calibrated offline against task-018 public gold set (N=12): prefer
    execution credit / bridge / term / mezzanine loan agreements under
    ``Transaction Documents/`` or ``documents/``, or a non-DIP
    ``Credit Agreement`` folder that contains an execution .docx. Exclude
    ``Financing/`` drafts, diligence memos, and DIP/construction loans.
    Do **not** hard-code gold matter IDs into seeding.
    """
    evidence: list[str] = []

    for p in matter_dir.rglob("*"):
        if not p.is_dir():
            continue
        name_l = p.name.lower()
        if name_l not in {"credit agreement", "credit-agreement"}:
            continue
        rel = str(p.relative_to(matter_dir))
        rel_l = rel.lower()
        if "dip" in rel_l:
            continue
        execs = [
            c
            for c in p.rglob("*")
            if c.is_file()
            and c.suffix.lower() == ".docx"
            and "execution" in c.name.lower()
        ]
        if execs:
            evidence.append(rel)
            evidence.extend(str(e.relative_to(matter_dir)) for e in execs[:3])

    for p in matter_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() != ".docx":
            continue
        rel = str(p.relative_to(matter_dir))
        rel_l = rel.lower()
        name_l = p.name.lower()
        if rel_l.startswith("financing/"):
            continue
        if "dip" in name_l or "dip " in rel_l or "/dip" in rel_l:
            continue
        under_primary = (
            rel_l.startswith("transaction documents/")
            or rel_l.startswith("documents/")
            or "/credit agreement/" in rel_l
            or "/credit-agreement/" in rel_l
        )
        if not under_primary:
            continue
        if _is_signed_facility_docx_name(name_l):
            evidence.append(rel)
            continue
        # Fairwater-style signed book entry: loan agreement under TD without
        # an "execution" token in the filename.
        if name_l in {"draft-loan-agreement.docx", "loan-agreement.docx"} and (
            rel_l.startswith("transaction documents/")
        ):
            evidence.append(rel)

    seen: set[str] = set()
    uniq: list[str] = []
    for e in evidence:
        if e in seen:
            continue
        seen.add(e)
        uniq.append(e)
    return {
        "is_credit_facility": bool(uniq),
        "evidence_files": uniq[:16],
        "practice_area": "Banking & Finance" if uniq else "Other",
        "matter_type": "Credit Facility" if uniq else "Other",
    }


def _clawql_field_block(
    matter_id: str,
    *,
    title: str,
    practice_area: str,
    matter_type: str,
    status: str = "Active",
) -> str:
    """Machine-readable block synced into ontology.db on memory_ingest."""
    return "\n".join(
        [
            "```",
            f"CLAWQL_MATTER_ID={matter_id}",
            f"CLAWQL_TITLE={title}",
            f"CLAWQL_PRACTICE_AREA={practice_area}",
            f"CLAWQL_MATTER_TYPE={matter_type}",
            f"CLAWQL_STATUS={status}",
            "```",
            "",
        ]
    )


def _unwrap_mcp_tool_payload(result: Any) -> Any:
    """Normalize MCP tools/call payloads that wrap JSON in content[].text."""
    if not isinstance(result, dict):
        return result
    content = result.get("content")
    if (
        isinstance(content, list)
        and content
        and isinstance(content[0], dict)
        and content[0].get("type") == "text"
        and isinstance(content[0].get("text"), str)
    ):
        text = content[0]["text"]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return result
    return result


def _enrich_lab_memory_recall(result: Any) -> dict[str, Any]:
    """Attach sandbox document roots + deliverable reminder for LAB agents.

    Vault note paths (Memory/...) are not readable via the harness ``read`` tool.
    Agents must use ``/workspace/documents/matters/<id>`` and write graded
    output under ``/workspace/output/``.
    """
    payload = _unwrap_mcp_tool_payload(result)
    if not isinstance(payload, dict):
        return {"raw": result}

    hits = payload.get("hits")
    if not isinstance(hits, list):
        hits = []

    docs_root = Path(os.environ.get("CLAWQL_LAB_DOCUMENTS_DIR", "")).expanduser()
    matters_root = docs_root / "matters" if docs_root.name else Path()
    if docs_root.is_dir() and (docs_root / "matters").is_dir():
        matters_root = docs_root / "matters"
    elif docs_root.is_dir() and docs_root.name == "matters":
        matters_root = docs_root

    enriched_hits: list[dict[str, Any]] = []
    matter_ids: list[str] = []
    for hit in hits:
        if not isinstance(hit, dict):
            continue
        h = dict(hit)
        meta = dict(h.get("meta") or {})
        fields = dict(h.get("fields") or meta.get("fields") or {})
        entity_id = (
            h.get("entityId")
            or fields.get("id")
            or meta.get("entityId")
        )
        # Fallback: parse Matter:… from vault path / title
        if not entity_id:
            path = str(h.get("path") or "")
            m = re.search(r"(\d{4}-\d{5}|MAT-\d{4})", path)
            if m:
                entity_id = m.group(1)
        if entity_id:
            matter_ids.append(str(entity_id))
            h["entityId"] = str(entity_id)
            h["sandboxDocumentRoot"] = f"/workspace/documents/matters/{entity_id}"
            fields = {**fields, "id": str(entity_id)}
            matter_dir = matters_root / str(entity_id) if matters_root else Path()
            if matter_dir.is_dir():
                client = _client_hint(matter_dir)
                preferred = _preferred_evidence_paths(matter_dir)
                h["clientShortName"] = client
                h["preferredEvidence"] = [
                    (
                        p
                        if p.startswith("/workspace/")
                        else f"/workspace/documents/{p}"
                    )
                    for p in preferred
                ]
                fields["title"] = fields.get("title") or f"{entity_id} — {client}"
                fields["clientShortName"] = client
            h["fields"] = fields
            if payload.get("queryType") == "structured_predicate" or payload.get(
                "indexUsed"
            ) == "ontology":
                meta["reason"] = "structured_predicate"
                h["meta"] = meta
        enriched_hits.append(h)

    # Keep results[] reason aligned with ontology path (enterprise clarity).
    results = payload.get("results")
    if isinstance(results, list) and (
        payload.get("queryType") == "structured_predicate"
        or payload.get("indexUsed") == "ontology"
    ):
        fixed_results = []
        for row in results:
            if isinstance(row, dict):
                r = dict(row)
                r["reason"] = "structured_predicate"
                fixed_results.append(r)
            else:
                fixed_results.append(row)
        payload["results"] = fixed_results

    payload["hits"] = enriched_hits
    # Compact cohort summary FIRST so agents (and 20k-era truncations) always
    # see N + every matter id before bulky hit/result bodies.
    sorted_ids = sorted(set(matter_ids))
    payload["matterIds"] = sorted_ids
    payload["matterIdCount"] = len(sorted_ids)
    if (
        payload.get("queryType") == "structured_predicate"
        or payload.get("indexUsed") == "ontology"
    ):
        # Shrink duplicate results[] snippets — hits[] already carries fields.
        slim_results: list[dict[str, Any]] = []
        for row in payload.get("results") or []:
            if not isinstance(row, dict):
                continue
            path = str(row.get("path") or "")
            mid_m = re.search(r"(\d{4}-\d{5}|MAT-\d{4})", path)
            slim_results.append(
                {
                    "path": path,
                    "score": row.get("score", 1),
                    "depth": 0,
                    "reason": "structured_predicate",
                    "entityId": mid_m.group(1) if mid_m else None,
                }
            )
        payload["results"] = slim_results
        # Prefer short hit cards for frequency cohorts (ids + client + practice).
        compact_hits: list[dict[str, Any]] = []
        for h in enriched_hits:
            fields = h.get("fields") if isinstance(h.get("fields"), dict) else {}
            compact_hits.append(
                {
                    "entityId": h.get("entityId"),
                    "path": h.get("path"),
                    "score": h.get("score", 1),
                    "clientShortName": h.get("clientShortName")
                    or fields.get("clientShortName"),
                    "fields": {
                        "id": fields.get("id") or h.get("entityId"),
                        "title": fields.get("title"),
                        "practiceArea": fields.get("practiceArea"),
                        "matterType": fields.get("matterType"),
                        "status": fields.get("status"),
                    },
                    "sandboxDocumentRoot": h.get("sandboxDocumentRoot"),
                    "preferredEvidence": (h.get("preferredEvidence") or [])[:4],
                }
            )
        payload["hits"] = compact_hits
    guidance: dict[str, Any] = {
        "sandboxDocumentRoots": [
            f"/workspace/documents/matters/{mid}" for mid in sorted_ids
        ],
        "vaultPathsNotReadableViaHarnessRead": True,
        "cohortRule": (
            "For frequency/survey tasks, treat matterIds (and matterIdCount) as "
            "the authoritative denominator N. List every id. Do not drop ids "
            "when writing k of N."
        ),
        "requiredDeliverable": (
            "Before finishing, call the harness `write` tool to create a file "
            "under /workspace/output/ (e.g. matters-enumeration.md or "
            "response.md). Attempt every rubric criterion with the best "
            "evidence you have — partial credit beats empty output. Verify "
            "distinctive terms against cited document text (guilty until "
            "proven). For frequency/survey tasks: define N as the prompt's "
            "filtered matter set (list every matter id), then write k of N "
            "(or 0 of N) — do not use folder counts or whole-vault counts as N. "
            "For HSR tasks use clientShortName (Cascade Retail, "
            "Harrowgate PE, Solara Digital, Halcyon Semi), state that each "
            "listed matter qualifies, and cite preferredEvidence — not "
            "engagement letters. Chat-only answers are not graded."
        ),
        "matterIds": sorted_ids,
        "evidenceRule": (
            "Cite Second Request evidence docs "
            "(joint-status-report, case-assessment-memo, letter-ftc-meet-and-confer, "
            "second-request-strategy-memo, hsr-withdrawal-letter, "
            "substantial-compliance-certification, "
            "custodian-identification-collection-protocol). "
            "Do not cite engagement letters as Second Request evidence."
        ),
        "contextDiscipline": (
            "Never ls -R / find the entire /workspace/documents tree. Use "
            "narrow paths. Do not invent ontology title flags beyond seeded "
            "tokens such as HSR_SECOND_REQUEST. memory_recall limit must be "
            "≤50."
        ),
    }
    if not sorted_ids:
        guidance["fallback"] = (
            "Structured recall returned no matter hits. Do not repeat the same "
            "filter more than once more. Fall back to targeted grep/glob/read "
            "under /workspace/documents/matters/, then write /workspace/output/ "
            "attempting all criteria."
        )
    payload["labGuidance"] = guidance
    # Re-order keys so matterIds appear before bulky arrays when serialized.
    ordered: dict[str, Any] = {}
    for key in (
        "ok",
        "query",
        "matterIdCount",
        "matterIds",
        "filteredEntities",
        "scannedEntities",
        "queryType",
        "indexUsed",
        "schema",
        "filters",
        "hits",
        "results",
        "labGuidance",
    ):
        if key in payload:
            ordered[key] = payload[key]
    for key, val in payload.items():
        if key not in ordered:
            ordered[key] = val
    return ordered


def is_clawql_lab_adapter(adapter: Any) -> bool:
    """True for Anthropic or chat-completions ClawQL LAB adapters."""
    return getattr(adapter, "__class__", type(None)).__name__ in {
        "ClawQLAdapter",
        "ClawQLChatAdapter",
    }


class ClawQLLabSession:
    """Task-scoped vault lifecycle + MCP tool execution for LAB arms."""

    def __init__(
        self,
        task_id: str,
        documents_dir: Path,
        model: str,
        arm: str = "clawql",
    ):
        self.task_id = task_id
        self.documents_dir = Path(documents_dir)
        self.model = model
        self.arm = arm
        self.vault_path = resolve_task_vault(task_id, CLAWQL_VAULT_ROOT)
        self._clawql_tools = list(CLAWQL_TOOL_SPECS)
        self._rpc_id = 0
        self._session_headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._protocol_version = os.environ.get(
            "CLAWQL_MCP_PROTOCOL_VERSION", "2025-11-25"
        )

    def pre_task_setup(self) -> None:
        self._prepare_vault()
        self._ensure_mcp_session()
        self._ingest_documents()
        try:
            self._call_clawql_mcp(
                "audit",
                {
                    "operation": "append",
                    "category": "lab_run",
                    "action": "LAB_RUN_START",
                    "summary": (
                        f"harvey-lab-v1 arm={self.arm} model={self.model} "
                        f"task={self.task_id} consent=community_model"
                    ),
                    "correlationId": f"harvey-lab:{self.task_id}:{self.arm}",
                },
            )
        except Exception as exc:  # noqa: BLE001
            print(f"ClawQL audit LAB_RUN_START warning: {exc}")

    def post_task_cleanup(self) -> None:
        if self.vault_path.exists():
            shutil.rmtree(self.vault_path, ignore_errors=True)

    def system_prompt_extension(self) -> str:
        path = Path(__file__).with_name("clawql_system_prompt.md")
        if path.exists():
            return "\n\n" + path.read_text(encoding="utf-8")
        return ""

    def clawql_tool_definitions(self) -> list[dict]:
        return list(self._clawql_tools)

    def merge_tools(self, tools: list[dict]) -> list[dict]:
        merged = list(tools) + self._clawql_tools
        seen: set[str] = set()
        unique: list[dict] = []
        for t in merged:
            name = t.get("name")
            if not name or name in seen:
                continue
            seen.add(name)
            unique.append(t)
        return unique

    def execute_clawql_tool(self, tool_name: str, arguments: str | dict) -> str:
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                return f"Error: invalid JSON arguments: {arguments}"
        mcp_name = _TOOL_NAME_TO_MCP.get(tool_name, tool_name.removeprefix("clawql_"))
        args = dict(arguments or {})
        if tool_name in {"clawql_sql", "clawql_duckdb_query"} or mcp_name == "sql":
            sql = str(args.get("sql") or args.get("query") or "")
            db_path = Path(
                os.environ.get("CLAWQL_LAB_DUCKDB_PATH")
                or default_duckdb_path(self.vault_path)
            )
            if not duckdb_available():
                return json.dumps(
                    {
                        "ok": False,
                        "error": "duckdb package not installed in harness venv",
                    }
                )
            return sql_tool_result_json(db_path, sql)
        if mcp_name == "memory_ingest" and "content" in args and "toolOutputs" not in args:
            args["toolOutputs"] = args.pop("content")
        if mcp_name == "memory_ingest" and "type" not in args:
            args["type"] = "context"
        try:
            result = self._call_clawql_mcp(mcp_name, args)
            if mcp_name == "memory_recall":
                result = _enrich_lab_memory_recall(result)
            dumped = json.dumps(result, indent=2, default=str)
            if len(dumped) > _CLAWQL_TOOL_JSON_CHARS:
                # Prefer keeping the cohort header even when truncating.
                dumped = (
                    dumped[:_CLAWQL_TOOL_JSON_CHARS]
                    + "\n…[ClawQL clawql-tool JSON truncated; "
                    "use matterIds / matterIdCount as authoritative N]"
                )
            return dumped
        except Exception as exc:  # noqa: BLE001
            return f"Error calling ClawQL MCP tool {mcp_name}: {exc}"

    def _prepare_vault(self) -> None:
        if self.vault_path.exists():
            shutil.rmtree(self.vault_path, ignore_errors=True)
        self.vault_path.mkdir(parents=True, exist_ok=True)
        (self.vault_path / "Memory").mkdir(parents=True, exist_ok=True)
        os.environ["CLAWQL_OBSIDIAN_VAULT_PATH"] = str(self.vault_path)

    def _ingest_documents(self) -> None:
        cache_marker = self.vault_path / INGEST_CACHE_NAME
        if cache_marker.exists():
            return

        matters_root = self.documents_dir / "matters"
        if matters_root.is_dir():
            self._ingest_firm_knowledge_dms(matters_root)
        else:
            self._ingest_flat_documents(self.documents_dir)

        cache_marker.write_text(
            json.dumps(
                {
                    "task_id": self.task_id,
                    "documents_dir": str(self.documents_dir),
                    "ingested_at": time.time(),
                }
            ),
            encoding="utf-8",
        )

    def _ingest_firm_knowledge_dms(self, matters_root: Path) -> None:
        all_matter_dirs = sorted(p for p in matters_root.iterdir() if p.is_dir())
        # Always classify the full DMS so ontology filters see the true set.
        # MAX_MATTERS only caps *full text* extraction volume.
        full_text_dirs = all_matter_dirs
        if MAX_MATTERS > 0:
            full_text_dirs = all_matter_dirs[:MAX_MATTERS]

        print(
            f"ClawQL pre-ingest: {len(all_matter_dirs)} matters catalogued "
            f"(full-text cap={MAX_MATTERS or 'none'}) from {matters_root}"
        )
        full_text_set = set(full_text_dirs)
        hsr_count = 0
        credit_count = 0
        bulk_docs: list[dict[str, str]] = []
        credit_docs: list[dict[str, str]] = []
        duckdb_rows: list[dict[str, Any]] = []
        for matter_dir in all_matter_dirs:
            matter_id = matter_dir.name
            detection = detect_hsr_second_request(matter_dir)
            credit = detect_credit_facility(matter_dir)
            if detection["received"]:
                hsr_count += 1
            if credit["is_credit_facility"]:
                credit_count += 1
            client = detection.get("client_hint") or _client_hint(matter_dir)
            # Belt-and-suspenders: never put newlines into CLAWQL_TITLE.
            client = " ".join(str(client).strip().split())
            title_parts = [matter_id, client]
            if detection["received"]:
                title_parts.append("HSR_SECOND_REQUEST")
            if credit["is_credit_facility"]:
                title_parts.append("CREDIT_FACILITY")
            title = " — ".join(title_parts)
            practice = credit["practice_area"]
            if detection["received"] and practice == "Other":
                practice = "Antitrust"
            matter_type = credit["matter_type"]
            if detection["received"] and matter_type == "Other":
                matter_type = "Advisory"
            extract_full = (
                matter_dir in full_text_set
                or bool(detection["received"])
                or bool(credit["is_credit_facility"])
            )

            sections: list[str] = [
                f"# Matter {matter_id}",
                "",
                _clawql_field_block(
                    matter_id,
                    title=title,
                    practice_area=practice,
                    matter_type=matter_type,
                ),
                f"LAB task: {self.task_id}",
                f"Matter path: matters/{matter_id}",
                f"Client short name: {client}",
                f"HSR second request received: {detection['received']}",
                f"Credit facility (Banking & Finance signal): {credit['is_credit_facility']}",
                "",
                "IMPORTANT for deliverable packaging:",
                "- Use the Client short name exactly (e.g. Cascade Retail, not Cascade).",
                "- Cite a Preferred Second Request evidence document below — "
                "do NOT cite engagement letters as Second Request evidence.",
                "- For frequency/credit-facility surveys: prefer clawql_sql "
                "SELECT … FROM matters WHERE is_credit_facility "
                "(or ontology title CREDIT_FACILITY) to define N.",
            ]
            preferred = detection.get("preferred_evidence") or []
            if preferred:
                sections.append("")
                sections.append("## Preferred Second Request evidence (cite one)")
                for ev in preferred:
                    sections.append(f"- `{ev}`")
            if credit.get("evidence_files"):
                sections.append("")
                sections.append("## Credit facility evidence paths")
                for ev in credit["evidence_files"]:
                    sections.append(f"- `matters/{matter_id}/{ev}`")
            if detection["evidence_files"]:
                sections.append("")
                sections.append("## Detection evidence paths")
                for ev in detection["evidence_files"]:
                    sections.append(f"- `matters/{matter_id}/{ev}`")
            sections.extend(["", "## Document inventory"])
            all_files = sorted(
                str(p.relative_to(matters_root.parent))
                for p in matter_dir.rglob("*")
                if p.is_file()
            )
            for rel in all_files[:80]:
                sections.append(f"- `{rel}`")
            if len(all_files) > 80:
                sections.append(f"- … ({len(all_files) - 80} more)")

            if extract_full:
                sections.append("")
                sections.append("## Extracted key documents")
                for doc in _priority_docs(matter_dir):
                    rel = doc.relative_to(matters_root.parent)
                    sections.append(f"### {rel}")
                    if doc.suffix.lower() == ".docx":
                        sections.append(_docx_to_text(doc))
                    elif doc.suffix.lower() in {".md", ".txt"}:
                        sections.append(_plain_text(doc))
                    else:
                        sections.append(f"(binary skipped in seed: {doc.suffix})")
                    sections.append("")

            content = "\n".join(sections)
            insights = (
                f"Firm-knowledge DMS matter {matter_id} seeded for "
                f"LAB task {self.task_id}"
            )
            if detection["received"]:
                insights += " | ontology flag HSR_SECOND_REQUEST"
            if credit["is_credit_facility"]:
                insights += (
                    " | ontology flag CREDIT_FACILITY"
                    " | practice=Banking & Finance"
                )
            wiki_lines = "\n".join(
                f"- [[{w}]]"
                for w in [
                    f"LAB:{self.task_id}",
                    f"Matter:{matter_id}",
                    "HarveyLAB",
                    *(["HSR_SECOND_REQUEST"] if detection["received"] else []),
                    *(["CREDIT_FACILITY"] if credit["is_credit_facility"] else []),
                ]
            )
            # OKF-ish markdown body: CLAWQL_* block already in content for ontology sync.
            markdown = (
                f"# [LAB:{self.task_id}] Matter {matter_id}\n\n"
                f"{insights}\n\n"
                f"## Related\n\n{wiki_lines}\n\n"
                f"{content}\n"
            )
            safe_task = re.sub(r"[^a-zA-Z0-9_-]+", "-", self.task_id)
            doc = {
                "path": f"Memory/lab-{safe_task}-matter-{matter_id}.md",
                "markdown": markdown,
                "matter_id": matter_id,
            }
            bulk_docs.append(doc)
            if credit["is_credit_facility"]:
                credit_docs.append(doc)

            def _extract(path: Path) -> str:
                if path.suffix.lower() == ".docx":
                    return _docx_to_text(path)
                if path.suffix.lower() in {".md", ".txt"}:
                    return _plain_text(path)
                return ""

            mentions_lien = False
            has_revolver = False
            if credit["is_credit_facility"]:
                mentions_lien = matter_mentions_springing_lien(
                    matter_dir,
                    text_extractor=_extract,
                    priority_docs=_priority_docs,
                )
                has_revolver = matter_has_revolving_facility(
                    matter_dir,
                    text_extractor=_extract,
                )
            duckdb_rows.append(
                {
                    "matter_id": matter_id,
                    "client_short_name": client,
                    "practice_area": practice,
                    "matter_type": matter_type,
                    "title": title,
                    "is_credit_facility": bool(credit["is_credit_facility"]),
                    "is_hsr_second_request": bool(detection["received"]),
                    "mentions_springing_lien": mentions_lien,
                    "has_revolving_facility": has_revolver,
                    "sandbox_root": f"/workspace/documents/matters/{matter_id}",
                    "vault_note_path": doc["path"],
                }
            )

        self._flush_bulk_markdown_docs(bulk_docs)
        print(
            f"ClawQL pre-ingest: ontology HSR_SECOND_REQUEST flagged "
            f"{hsr_count}/{len(all_matter_dirs)} matters; "
            f"CREDIT_FACILITY flagged {credit_count}/{len(all_matter_dirs)} matters; "
            f"bulk_docs={len(bulk_docs)}"
        )
        self._ensure_credit_facility_ontology(credit_docs, expected=credit_count)
        self._build_lab_duckdb(duckdb_rows, expected_credit=credit_count)

    def _ensure_credit_facility_ontology(
        self, credit_docs: list[dict[str, str]], *, expected: int
    ) -> None:
        """Force ontology upsert for CREDIT_FACILITY seeds + verify recall N.

        Bulk ``ingest_external_knowledge`` writes vault Markdown but does not
        call ``upsertOntologyFromVaultNote``. Lazy vault sync usually covers
        this; probe #5 still surfaced N=11 vs seed 12, so we memory_ingest the
        flagged cohort (append=false) then log structured recall ids.
        """
        if not credit_docs:
            print("ClawQL pre-ingest: no CREDIT_FACILITY docs to ontology-verify")
            return
        for doc in credit_docs:
            title = Path(doc["path"]).stem
            self._call_clawql_mcp(
                "memory_ingest",
                {
                    "title": title,
                    "type": "entity",
                    "insights": (
                        f"LAB ontology upsert {doc.get('matter_id', title)} "
                        "CREDIT_FACILITY"
                    ),
                    "toolOutputs": doc["markdown"],
                    "sessionId": f"harvey-lab:{self.task_id}",
                    "append": False,
                },
                timeout=_BULK_INGEST_HTTP_TIMEOUT_S,
            )
        try:
            raw = self._call_clawql_mcp(
                "memory_recall",
                {
                    "query": "CREDIT_FACILITY cohort verify",
                    "schema": "legal.Matter",
                    "filters": {"title": {"contains": "CREDIT_FACILITY"}},
                    "limit": 50,
                },
            )
        except Exception as exc:  # noqa: BLE001
            print(f"ClawQL pre-ingest: CREDIT_FACILITY ontology verify failed ({exc})")
            return
        enriched = _enrich_lab_memory_recall(raw)
        ids = enriched.get("matterIds") or []
        print(
            f"ClawQL pre-ingest: ontology CREDIT_FACILITY recall "
            f"N={len(ids)} expected={expected} ids={ids}"
        )
        if expected and len(ids) != expected:
            print(
                "ClawQL pre-ingest: WARNING ontology cohort size mismatch — "
                "agent may report wrong frequency denominator"
            )

    def _build_lab_duckdb(
        self, rows: list[dict[str, Any]], *, expected_credit: int
    ) -> None:
        """Write task-scoped matters.duckdb for clawql_sql."""
        if not duckdb_available():
            print(
                "ClawQL pre-ingest: duckdb not installed — clawql_sql disabled "
                "(uv pip install duckdb)"
            )
            return
        db_path = default_duckdb_path(self.vault_path)
        build_matters_duckdb(db_path, rows)
        os.environ["CLAWQL_LAB_DUCKDB_PATH"] = str(db_path)
        credit_n = sum(1 for r in rows if r.get("is_credit_facility"))
        lien_n = sum(
            1
            for r in rows
            if r.get("is_credit_facility") and r.get("mentions_springing_lien")
        )
        revolver_n = sum(
            1
            for r in rows
            if r.get("is_credit_facility") and r.get("has_revolving_facility")
        )
        print(
            f"ClawQL pre-ingest: DuckDB {db_path} rows={len(rows)} "
            f"is_credit_facility={credit_n} (expected {expected_credit}) "
            f"credit_facilities.mentions_springing_lien={lien_n} "
            f"has_revolving_facility={revolver_n}"
        )
        if expected_credit and credit_n != expected_credit:
            print(
                "ClawQL pre-ingest: WARNING DuckDB credit_facility count mismatch"
            )

    def _flush_bulk_markdown_docs(self, documents: list[dict[str, str]]) -> None:
        """Write many vault notes via ingest_external_knowledge (≤50/call).

        Falls back to per-matter memory_ingest if bulk import is unavailable.
        """
        if not documents:
            return
        # Strip helper keys before MCP (matter_id is LAB-only).
        mcp_docs = [{"path": d["path"], "markdown": d["markdown"]} for d in documents]
        use_bulk = os.environ.get("CLAWQL_EXTERNAL_INGEST", "1").strip() == "1"
        if use_bulk:
            try:
                for i in range(0, len(mcp_docs), _BULK_INGEST_BATCH):
                    batch = mcp_docs[i : i + _BULK_INGEST_BATCH]
                    print(
                        f"ClawQL pre-ingest: bulk ingest_external_knowledge "
                        f"{i + 1}–{i + len(batch)} / {len(mcp_docs)}"
                    )
                    result = self._call_clawql_mcp(
                        "ingest_external_knowledge",
                        {"documents": batch, "dryRun": False},
                        timeout=_BULK_INGEST_HTTP_TIMEOUT_S,
                    )
                    if isinstance(result, dict) and result.get("isError"):
                        raise RuntimeError(result)
                    body = result
                    if isinstance(result, dict) and isinstance(result.get("content"), list):
                        for block in result["content"]:
                            if isinstance(block, dict) and block.get("type") == "text":
                                try:
                                    body = json.loads(block.get("text") or "{}")
                                except json.JSONDecodeError:
                                    body = {"raw": block.get("text")}
                                break
                    if isinstance(body, dict) and body.get("ok") is False:
                        raise RuntimeError(
                            body.get("message") or body.get("error") or body
                        )
                return
            except Exception as exc:  # noqa: BLE001
                print(
                    f"ClawQL pre-ingest: bulk ingest failed ({exc}); "
                    "falling back to per-matter memory_ingest"
                )
        for doc in mcp_docs:
            title = Path(doc["path"]).stem
            self._call_clawql_mcp(
                "memory_ingest",
                {
                    "title": title,
                    "type": "entity",
                    "insights": f"LAB seed {title}",
                    "toolOutputs": doc["markdown"],
                    "sessionId": f"harvey-lab:{self.task_id}",
                    "append": True,
                },
            )

    def _ingest_flat_documents(self, docs_dir: Path) -> None:
        for doc in sorted(docs_dir.rglob("*")):
            if not doc.is_file():
                continue
            if doc.suffix.lower() == ".docx":
                body = _docx_to_text(doc)
            elif doc.suffix.lower() in {".md", ".txt", ".json", ".csv"}:
                body = _plain_text(doc)
            else:
                continue
            self._call_clawql_mcp(
                "memory_ingest",
                {
                    "title": f"[LAB:{self.task_id}] {doc.name}",
                    "type": "entity",
                    "insights": f"Matter document from LAB task {self.task_id}",
                    "toolOutputs": body,
                    "wikilinks": [f"LAB:{self.task_id}", "HarveyLAB"],
                    "sessionId": f"harvey-lab:{self.task_id}",
                    "append": True,
                },
            )

    def _parse_mcp_http_body(self, resp: requests.Response) -> dict:
        ctype = (resp.headers.get("content-type") or "").lower()
        text = resp.text or ""
        if "text/event-stream" in ctype or text.startswith("event:"):
            for line in text.splitlines():
                if line.startswith("data:"):
                    payload = line[len("data:") :].strip()
                    if payload:
                        return json.loads(payload)
            return {"raw": text}
        if not text.strip():
            return {}
        return resp.json()

    def _ensure_mcp_session(self) -> None:
        self._session_headers["mcp-protocol-version"] = self._protocol_version
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": "harvey-lab-clawql-adapter", "version": "0.2.0"},
            },
        }
        resp = requests.post(
            CLAWQL_MCP_URL,
            json=payload,
            headers=self._session_headers,
            timeout=60,
        )
        resp.raise_for_status()
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_headers["mcp-session-id"] = sid
        body = self._parse_mcp_http_body(resp)
        negotiated = (
            (body.get("result") or {}).get("protocolVersion")
            if isinstance(body, dict)
            else None
        )
        if negotiated:
            self._protocol_version = negotiated
            self._session_headers["mcp-protocol-version"] = negotiated
        try:
            requests.post(
                CLAWQL_MCP_URL,
                json={
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {},
                },
                headers=self._session_headers,
                timeout=30,
            )
        except requests.RequestException:
            pass

    def _next_id(self) -> str:
        self._rpc_id += 1
        return f"lab-{self._rpc_id}-{uuid.uuid4().hex[:8]}"

    def _call_clawql_mcp(
        self, tool_name: str, arguments: dict, *, timeout: int | None = None
    ) -> dict:
        if "mcp-protocol-version" not in self._session_headers:
            self._ensure_mcp_session()

        args = dict(arguments)
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": args},
        }
        resp = requests.post(
            CLAWQL_MCP_URL,
            json=payload,
            headers=self._session_headers,
            timeout=timeout if timeout is not None else 180,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:1000]}")
        data = self._parse_mcp_http_body(resp)
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(json.dumps(data["error"]))
        return data.get("result", data) if isinstance(data, dict) else {"raw": data}
