"""Schema-guided mapping from IDP-extracted text/JSON → ExtractBench JSON Schema."""

from __future__ import annotations

import json
import re
from typing import Any


SCHEMA_MAP_SYSTEM_PROMPT = (
    "You are extracting structured data from already-parsed document content "
    "(markdown and/or layout JSON) according to the provided JSON schema. "
    "Return only JSON that matches the schema. Use null for fields not present "
    "in the document — never invent values for blank, unchecked, or missing "
    "fields. When the schema includes a list/array field, populate EVERY "
    "relevant row visible in the content; do not truncate long lists."
)


def promote_repeated_structure(schema: dict[str, Any]) -> dict[str, Any]:
    """Promote LlamaExtract-style ``repeated_structure`` into ``properties``."""
    if not isinstance(schema, dict):
        return schema
    repeated = schema.get("repeated_structure")
    if not isinstance(repeated, dict) or not repeated:
        return schema
    out = dict(schema)
    properties = dict(out.get("properties") or {})
    for name, definition in repeated.items():
        if isinstance(definition, dict) and name not in properties:
            properties[name] = definition
    out["properties"] = properties
    out.pop("repeated_structure", None)
    return out


def add_additional_properties_false(schema: dict[str, Any]) -> dict[str, Any]:
    """Close every object with ``additionalProperties: false`` (deep copy)."""
    import copy

    out = copy.deepcopy(schema)

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                node["additionalProperties"] = False
                for value in (node.get("properties") or {}).values():
                    walk(value)
            if "items" in node:
                walk(node["items"])
            for key in ("anyOf", "oneOf", "allOf"):
                for branch in node.get(key, []) or []:
                    walk(branch)

    walk(out)
    return out


def prepare_schema(schema: dict[str, Any], *, close_objects: bool = True) -> dict[str, Any]:
    prepared = promote_repeated_structure(schema)
    if close_objects:
        prepared = add_additional_properties_false(prepared)
    return prepared


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _repair_truncated_json(text: str) -> dict[str, Any] | list[Any]:
    """Best-effort close of truncated LLM JSON (common under max_tokens caps)."""
    start_obj = text.find("{")
    start_arr = text.find("[")
    if start_obj < 0 and start_arr < 0:
        raise ValueError("no JSON structure found")
    if start_obj < 0:
        start = start_arr
    elif start_arr < 0:
        start = start_obj
    else:
        start = min(start_obj, start_arr)
    s = text[start:]

    def _try_load(frag: str) -> dict[str, Any] | list[Any] | None:
        frag = frag.rstrip()
        while frag and frag[-1] in ",:":
            frag = frag[:-1].rstrip()
        in_str = False
        esc = False
        stack: list[str] = []
        for ch in frag:
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
                continue
            if ch == "{":
                stack.append("}")
            elif ch == "[":
                stack.append("]")
            elif ch in "}]":
                if not stack or stack[-1] != ch:
                    return None
                stack.pop()
        if in_str:
            frag += '"'
        frag += "".join(reversed(stack))
        try:
            parsed = json.loads(frag)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, (dict, list)):
            return parsed
        return None

    # Try closing at structural boundaries (not every char — O(n) parses).
    cut_points = [i + 1 for i, ch in enumerate(s) if ch in ',}]"']
    cut_points.append(len(s))
    for end in reversed(cut_points):
        parsed = _try_load(s[:end])
        if parsed is not None:
            return parsed
    raise ValueError("could not repair truncated JSON")


def parse_json_object(text: str) -> dict[str, Any] | list[Any]:
    """Parse a model response that may be fenced, padded, or truncated."""
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty JSON response")
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, (dict, list)):
            return parsed
    except json.JSONDecodeError:
        pass
    fence = _JSON_FENCE_RE.search(raw)
    if fence:
        try:
            parsed = json.loads(fence.group(1).strip())
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            raw = fence.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(raw[start : end + 1])
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            pass
    start = raw.find("[")
    end = raw.rfind("]")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(raw[start : end + 1])
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            pass
    try:
        return _repair_truncated_json(raw)
    except Exception as exc:  # noqa: BLE001 — surface original parse failure
        raise ValueError(
            f"could not parse JSON from model output ({len(raw)} chars)"
        ) from exc


def null_template_from_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Build a null-filled object matching top-level schema properties."""
    props = schema.get("properties") if isinstance(schema, dict) else None
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    for name, defn in props.items():
        if not isinstance(defn, dict):
            out[name] = None
            continue
        typ = defn.get("type")
        if typ == "array" or "items" in defn:
            out[name] = []
        elif typ == "object" or "properties" in defn:
            out[name] = null_template_from_schema(defn)
        elif typ == "boolean":
            out[name] = None
        elif typ in ("integer", "number"):
            out[name] = None
        else:
            out[name] = None
    return out


def structural_map_from_content(
    *,
    markdown: str,
    layout_json: dict[str, Any] | list[Any] | None,
    schema: dict[str, Any],
) -> dict[str, Any]:
    """Best-effort deterministic mapping without an LLM (Arm B baseline).

    Fills a null template and, when the Docling JSON exposes tables whose
    header row roughly matches array-item property names, appends row dicts.
    This is intentionally conservative — missing fields stay null.
    """
    prepared = prepare_schema(schema, close_objects=False)
    result = null_template_from_schema(prepared)
    tables = _collect_tables(layout_json)
    props = prepared.get("properties") if isinstance(prepared, dict) else {}
    if not isinstance(props, dict):
        return result

    for field_name, defn in props.items():
        if not isinstance(defn, dict):
            continue
        if defn.get("type") != "array" and "items" not in defn:
            continue
        items = defn.get("items") if isinstance(defn.get("items"), dict) else {}
        item_props = items.get("properties") if isinstance(items, dict) else None
        if not isinstance(item_props, dict) or not item_props:
            continue
        headers = [str(h).strip().lower() for h in item_props.keys()]
        best_rows: list[dict[str, Any]] = []
        best_score = 0.0
        for table in tables:
            mapped, score = _map_table_to_items(table, item_props)
            if score > best_score and mapped:
                best_score = score
                best_rows = mapped
        # Require at least half of the schema columns to match headers.
        if best_score >= 0.5 and best_rows:
            result[field_name] = best_rows

    # Lightweight scalar fill: exact label: value lines in markdown.
    if markdown:
        for field_name, defn in props.items():
            if result.get(field_name) not in (None, {}, []):
                continue
            if not isinstance(defn, dict):
                continue
            if defn.get("type") == "array" or "items" in defn:
                continue
            if defn.get("type") == "object" or "properties" in defn:
                continue
            hit = _label_value_from_markdown(markdown, field_name)
            if hit is not None:
                result[field_name] = hit
    return result


def _collect_tables(layout_json: dict[str, Any] | list[Any] | None) -> list[list[list[str]]]:
    """Return tables as list of row-lists of cell strings."""
    if layout_json is None:
        return []
    found: list[list[list[str]]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            # Docling-like: {"data": [[...], ...]} or {"grid": ...}
            for key in ("data", "grid", "table_cells", "cells"):
                if key in node and isinstance(node[key], list):
                    grid = _normalize_grid(node[key])
                    if grid and len(grid) >= 2:
                        found.append(grid)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(layout_json)
    return found


def _normalize_grid(raw: list[Any]) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in raw:
        if isinstance(row, list):
            cells: list[str] = []
            for cell in row:
                if isinstance(cell, dict):
                    text = cell.get("text") or cell.get("value") or cell.get("content") or ""
                    cells.append(str(text).strip())
                else:
                    cells.append(str(cell).strip())
            if any(cells):
                rows.append(cells)
        elif isinstance(row, dict) and "cells" in row and isinstance(row["cells"], list):
            cells = []
            for cell in row["cells"]:
                if isinstance(cell, dict):
                    cells.append(str(cell.get("text") or "").strip())
                else:
                    cells.append(str(cell).strip())
            if any(cells):
                rows.append(cells)
    return rows


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _map_table_to_items(
    table: list[list[str]],
    item_props: dict[str, Any],
) -> tuple[list[dict[str, Any]], float]:
    if not table:
        return [], 0.0
    header = [_normalize_header(c) for c in table[0]]
    prop_names = list(item_props.keys())
    prop_norms = {_normalize_header(p): p for p in prop_names}
    col_map: dict[int, str] = {}
    for idx, h in enumerate(header):
        if h in prop_norms:
            col_map[idx] = prop_norms[h]
            continue
        # Soft match: header contained in property or vice versa.
        for nh, original in prop_norms.items():
            if nh and (nh in h or h in nh):
                col_map[idx] = original
                break
    if not col_map:
        return [], 0.0
    score = len(col_map) / max(len(prop_names), 1)
    rows: list[dict[str, Any]] = []
    for raw_row in table[1:]:
        item = {name: None for name in prop_names}
        nonempty = False
        for idx, prop in col_map.items():
            if idx >= len(raw_row):
                continue
            val = raw_row[idx].strip()
            if val == "":
                item[prop] = None
            else:
                item[prop] = val
                nonempty = True
        if nonempty:
            rows.append(item)
    return rows, score


def _label_value_from_markdown(markdown: str, field_name: str) -> str | None:
    variants = {
        field_name,
        field_name.replace("_", " "),
        field_name.replace("_", "-"),
    }
    for label in variants:
        pattern = re.compile(
            rf"(?im)^\s*{re.escape(label)}\s*[:\-]\s*(.+?)\s*$"
        )
        match = pattern.search(markdown)
        if match:
            value = match.group(1).strip()
            if value and value.lower() not in {"n/a", "na", "none", "-", "—"}:
                return value
    return None


def chunk_text_for_mapping(text: str, *, max_chars: int = 120_000) -> list[str]:
    """Split long extracted content into overlapping chunks for schema mapping.

    Long-list completeness (ExtractBench T1) fails when the mapper only sees
    the first N pages. Overlap preserves table/header context across boundaries.
    """
    if max_chars <= 0 or len(text) <= max_chars:
        return [text]
    overlap = min(8_000, max_chars // 10)
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def merge_extraction_chunks(
    base: dict[str, Any],
    pieces: list[dict[str, Any]],
    schema: dict[str, Any],
) -> dict[str, Any]:
    """Merge chunked extractionsictions, concatenating array fields without truncation."""
    prepared = prepare_schema(schema, close_objects=False)
    props = prepared.get("properties") if isinstance(prepared, dict) else {}
    if not isinstance(props, dict):
        return base
    out = dict(base)
    for piece in pieces:
        if not isinstance(piece, dict):
            continue
        for key, value in piece.items():
            defn = props.get(key) if isinstance(props.get(key), dict) else {}
            is_array = isinstance(defn, dict) and (
                defn.get("type") == "array" or "items" in defn
            )
            if is_array and isinstance(value, list):
                existing = out.get(key)
                if not isinstance(existing, list):
                    existing = []
                # Dedup by JSON serialization while preserving order.
                seen = {json.dumps(row, sort_keys=True, default=str) for row in existing}
                for row in value:
                    marker = json.dumps(row, sort_keys=True, default=str)
                    if marker not in seen:
                        existing.append(row)
                        seen.add(marker)
                out[key] = existing
            elif key not in out or out[key] in (None, "", [], {}):
                out[key] = value
    return out
