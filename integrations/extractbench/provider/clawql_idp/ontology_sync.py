"""Bridge ExtractBench schema-map output into ClawQL meta-ontology (Layer 2/3).

Calls ``integrations/extractbench/scripts/run-ontology-pipeline.mjs`` which
wraps ``runExtractBenchOntologyPipeline`` (scaffold → populate → ontology.db → recall).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "document"


def derive_document_type(schema: dict[str, Any], example_id: str | None = None) -> str:
    """Stable document type id for ontology scaffold."""
    for key in ("title", "name", "$id"):
        raw = schema.get(key)
        if isinstance(raw, str) and raw.strip():
            return _slugify(raw)
    if example_id and example_id.strip():
        return _slugify(example_id.split("/")[-1])
    return "extractbench_document"


def clawql_repo_root() -> Path:
    env = os.environ.get("CLAWQL_REPO_ROOT", "").strip()
    if env:
        return Path(env).resolve()
    # integrations/extractbench/provider/clawql_idp/ontology_sync.py → repo root
    return Path(__file__).resolve().parents[4]


def ontology_pipeline_script() -> Path:
    return clawql_repo_root() / "integrations/extractbench/scripts/run-ontology-pipeline.mjs"


def ontology_sync_enabled(config: dict[str, Any] | None = None) -> bool:
    if config and "ontology_sync" in config:
        return bool(config.get("ontology_sync"))
    return os.environ.get("CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def run_ontology_pipeline(
    *,
    json_schema: dict[str, Any],
    extracted: dict[str, Any],
    document_type: str | None = None,
    document_id: str,
    vault_root: str | None = None,
    limit: int = 10_000,
    node_bin: str | None = None,
    timeout_s: float = 300.0,
) -> dict[str, Any]:
    """Run meta-ontology pipeline; return summary JSON (recall + row counts)."""
    script = ontology_pipeline_script()
    if not script.is_file():
        raise FileNotFoundError(f"ontology pipeline script not found: {script}")

    vault = (vault_root or os.environ.get("CLAWQL_OBSIDIAN_VAULT_PATH") or "").strip()
    if not vault:
        raise ValueError(
            "CLAWQL_OBSIDIAN_VAULT_PATH or vault_root is required for ontology sync"
        )

    doc_type = document_type or derive_document_type(json_schema, document_id)
    payload = {
        "jsonSchema": json_schema,
        "documentType": doc_type,
        "documentId": document_id,
        "extracted": extracted,
        "vaultRoot": vault,
        "limit": limit,
    }

    node = node_bin or os.environ.get("CLAWQL_NODE_BIN", "node")
    env = os.environ.copy()
    env["CLAWQL_OBSIDIAN_VAULT_PATH"] = vault
    proc = subprocess.run(
        [node, str(script)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=timeout_s,
        check=False,
        cwd=str(clawql_repo_root()),
        env=env,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"ontology pipeline failed (exit {proc.returncode}): {stderr[:2000]}"
        )
    line = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else ""
    if not line:
        raise RuntimeError("ontology pipeline returned empty stdout")
    result = json.loads(line)
    if not isinstance(result, dict):
        raise RuntimeError("ontology pipeline returned non-object JSON")
    result["documentType"] = doc_type
    result["documentId"] = document_id
    return result


def t1_completeness_metrics(
    result: dict[str, Any],
    schema: dict[str, Any],
) -> dict[str, Any]:
    """Compare recalled row counts vs extracted array lengths (T1 completeness)."""
    rows_populated: dict[str, int] = dict(result.get("rowsPopulated") or {})
    repeated = schema.get("repeated_structure")
    array_fields: list[str] = []
    if isinstance(repeated, dict):
        array_fields = [k for k, v in repeated.items() if isinstance(v, dict)]
    props = schema.get("properties")
    if isinstance(props, dict):
        for key, spec in props.items():
            if isinstance(spec, dict) and spec.get("type") == "array":
                if key not in array_fields:
                    array_fields.append(key)

    metrics: dict[str, Any] = {"arrays": {}, "complete": True}
    recall = result.get("recall") or {}
    hits = recall.get("hits") if isinstance(recall, dict) else None
    first_hit = hits[0] if isinstance(hits, list) and hits else None
    fields = (first_hit or {}).get("fields") if isinstance(first_hit, dict) else None

    for field in array_fields:
        expected = rows_populated.get(field)
        recalled_len: int | None = None
        if isinstance(fields, dict) and isinstance(fields.get(field), list):
            recalled_len = len(fields[field])
        metrics["arrays"][field] = {
            "rowsPopulated": expected,
            "recalled": recalled_len,
            "match": expected is not None and recalled_len == expected,
        }
        if expected is not None and recalled_len != expected:
            metrics["complete"] = False

    metrics["recallOk"] = bool(recall.get("ok")) if isinstance(recall, dict) else False
    return metrics
