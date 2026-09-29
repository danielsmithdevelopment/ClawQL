#!/usr/bin/env python3
"""Flag keys whose gold section title is a TOC/list artifact.

Uses the same rules as build_hard_candidate.is_artifact_heading_title /
product isArtifactHeadingTitle. Run on every section map before H-idf
re-runs so baselines exclude wrong-reason passes.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_hard_candidate import is_artifact_heading_title  # noqa: E402


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
    args = p.parse_args()

    if not args.maps.is_dir() or not args.keys.is_file():
        print(json.dumps({"ok": False, "error": "maps or keys missing"}), file=sys.stderr)
        return 2

    maps = load_maps(args.maps)
    # Also flag map entries that are artifacts (even if no key pins them)
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

    with args.keys.open(encoding="utf-8") as f:
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
                flagged.append(
                    {
                        "id": qid,
                        "document_id": doc,
                        "question_type": row.get("question_type"),
                        "question": row.get("question"),
                        "reason": "gold_is_artifact",
                        "hits": bad_hits,
                    }
                )
            else:
                clean += 1

    summary = {
        "ok": True,
        "keys_path": str(args.keys),
        "maps_path": str(args.maps),
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
    payload = {
        "summary": summary,
        "flagged_keys": flagged,
        "map_artifact_sections": map_artifacts,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["keys_flagged_defective"] >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
