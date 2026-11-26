#!/usr/bin/env python3
"""Flag keys whose gold section title is a TOC/list artifact.

Uses the same rules as build_hard_candidate.is_artifact_heading_title /
product isArtifactHeadingTitle. Run on every section map before H-idf
re-runs so baselines exclude wrong-reason passes.

Also supports --vault to scan ingested Markdown for artifact ATX headings
(wrong-reason risk in real recall), independent of eval keys.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_hard_candidate import is_artifact_heading_title  # noqa: E402

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def load_maps(maps_dir: Path) -> dict[str, dict[str, str]]:
    """doc_id -> {section_id: title}"""
    out: dict[str, dict[str, str]] = {}
    for p in sorted(maps_dir.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        doc = data.get("document_id") or p.stem
        by = {}
        for s in data.get("sections") or []:
            sid = s.get("id")
            if sid:
                by[sid] = s.get("title") or ""
        out[doc] = by
    return out


def scan_vault(vault: Path) -> dict:
    """Walk vault Markdown; count ATX titles that fail the artifact filter."""
    files: list[dict] = []
    total_headings = 0
    total_artifacts = 0
    for p in sorted(vault.rglob("*.md")):
        if any(part in {".git", "node_modules"} for part in p.parts):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        hits: list[dict] = []
        file_heads = 0
        for i, line in enumerate(text.splitlines(), 1):
            m = HEADING_RE.match(line)
            if not m:
                continue
            file_heads += 1
            title = m.group(2).strip()
            if is_artifact_heading_title(title):
                hits.append({"line": i, "level": len(m.group(1)), "title": title})
        total_headings += file_heads
        if not hits:
            continue
        total_artifacts += len(hits)
        files.append(
            {
                "path": str(p.relative_to(vault)),
                "heading_count": file_heads,
                "artifact_count": len(hits),
                "samples": hits[:8],
            }
        )
    rate = (total_artifacts / total_headings) if total_headings else 0.0
    return {
        "ok": True,
        "mode": "vault",
        "vault": str(vault),
        "files_scanned": sum(1 for _ in vault.rglob("*.md")),
        "files_with_artifacts": len(files),
        "total_atx_headings": total_headings,
        "artifact_heading_count": total_artifacts,
        "artifact_heading_rate": round(rate, 4),
        "files": files,
        "note": (
            "Artifact ATX headings in source Markdown mint bogus sec-* IDs for any "
            "tool that does not use the 8.0 splitMarkdownSections filter. "
            "Product read_around skips them; optional demote via "
            "scripts/dev/vault-resection-artifact-headings.mjs --write."
        ),
    }


def flag_keys(maps_dir: Path, keys_path: Path) -> dict:
    maps = load_maps(maps_dir)
    map_artifacts: list[dict] = []
    for doc, by in maps.items():
        for sid, title in by.items():
            if is_artifact_heading_title(title):
                map_artifacts.append({"document_id": doc, "section_id": sid, "title": title})

    flagged: list[dict] = []
    clean = 0
    no_gold = 0
    missing_gold = 0
    no_map = 0

    with keys_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            qid = row.get("id")
            golds = row.get("gold_sections") or []
            if not golds:
                no_gold += 1
                continue
            doc = row.get("document_id")
            if doc not in maps:
                no_map += 1
                flagged.append(
                    {
                        "id": qid,
                        "document_id": doc,
                        "reason": "no_map",
                        "gold_sections": golds,
                    }
                )
                continue
            by = maps[doc]
            bad_hits = []
            for gid in golds:
                title = by.get(gid)
                if title is None:
                    missing_gold += 1
                    bad_hits.append({"section_id": gid, "reason": "gold_id_absent", "title": None})
                elif is_artifact_heading_title(title):
                    bad_hits.append(
                        {"section_id": gid, "reason": "artifact_title", "title": title}
                    )
            if bad_hits:
                if any(h["reason"] == "artifact_title" for h in bad_hits):
                    reason = "gold_is_artifact"
                else:
                    reason = "gold_id_absent"
                flagged.append(
                    {
                        "id": qid,
                        "document_id": doc,
                        "question_type": row.get("question_type"),
                        "question": row.get("question"),
                        "reason": reason,
                        "hits": bad_hits,
                    }
                )
            else:
                clean += 1

    summary = {
        "ok": True,
        "mode": "keys",
        "keys_path": str(keys_path),
        "maps_path": str(maps_dir),
        "keys_with_gold_clean": clean,
        "keys_flagged_defective": len([x for x in flagged if x.get("reason") == "gold_is_artifact"]),
        "keys_no_gold_sections": no_gold,
        "keys_gold_id_absent_rows": missing_gold,
        "keys_no_map": no_map,
        "map_artifact_section_count": len(map_artifacts),
        "flagged_key_ids": [x["id"] for x in flagged if x.get("reason") == "gold_is_artifact"],
        "note": (
            "Any key whose gold section title fails is_artifact_heading_title is "
            "defective (wrong-reason pass risk). Exclude from H-idf baselines."
        ),
    }
    return {
        "summary": summary,
        "flagged_keys": flagged,
        "map_artifact_sections": map_artifacts,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--maps",
        type=Path,
        default=ROOT / "corpus" / "hard-candidate" / "section-maps",
    )
    p.add_argument(
        "--keys",
        type=Path,
        default=ROOT / "corpus" / "hard-candidate" / "keys.jsonl",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=ROOT / "design" / "artifact-gold-flags.json",
    )
    p.add_argument(
        "--vault",
        type=Path,
        default=None,
        help="Scan vault Markdown for artifact ATX headings (skip keys/maps mode).",
    )
    args = p.parse_args()

    if args.vault is not None:
        vault = args.vault.expanduser().resolve()
        if not vault.is_dir():
            print(json.dumps({"ok": False, "error": f"vault not a directory: {vault}"}), file=sys.stderr)
            return 2
        payload = scan_vault(vault)
        out = args.out
        if out == ROOT / "design" / "artifact-gold-flags.json":
            out = ROOT / "design" / "vault-artifact-headings.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(
            json.dumps(
                {k: payload[k] for k in payload if k != "files"},
                indent=2,
            )
        )
        return 0

    if not args.maps.is_dir() or not args.keys.is_file():
        print(json.dumps({"ok": False, "error": "maps or keys missing"}), file=sys.stderr)
        return 2

    payload = flag_keys(args.maps, args.keys)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
