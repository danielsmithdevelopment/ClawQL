#!/usr/bin/env python3
"""Regenerate the B-7.1 mini-firm vault seed (nested, large enough that bare
linear `read` cannot exhaust the corpus inside the OpenBench turn budget).

Keeps the same five ground-truth matches as the 30-note fixture.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = ROOT / "workspace" / ".openbench" / "memory-seed"
MANIFEST = ROOT / "ground_truth.json"

# Escrow ≥ 10 AND noncompete > 18 — unchanged from prior cells.
MATCHES = [
    ("MAT-2388", "Cedar Peak minority", "Cedar Peak Capital", 10, 24, "pe-minority"),
    ("MAT-2401", "Northwind software carve-out", "Northwind Holdings", 12, 24, "pe-software"),
    ("MAT-2415", "Blue Harbor add-on", "Blue Harbor Partners", 15, 36, "add-on"),
    ("MAT-2450", "Riverton SaaS bolt-on", "Riverton Equity", 20, 30, "saas-bolt"),
    ("MAT-2462", "Lakeview growth equity", "Lakeview Growth", 11, 19, "growth"),
]

# Near-miss / decoy templates (escrow, nc) — None means field omitted.
NEAR_MISS_SPECS = [
    (9, 24),
    (12, 18),
    (10, 18),
    (25, 12),
    (10, 6),
    (5, 36),
    (None, 24),
    (14, 12),
    (8, 30),
    (22, 18),
    (5, 6),
    (0, 48),
    (11, 15),
    (13, 18),
    (None, 36),
    (10, 9),
    (7, 24),
    (16, 17),
    (12, 18),
    (30, None),
    (4, 12),
    (9, 19),
    (18, 18),
    (10, 18),
    (6, 40),
    (15, 12),
    (9, 36),
    (20, 18),
    (3, 60),
    (11, 18),
]

CLIENT_SLUGS = [
    "alpha-ridge",
    "brine-harbor",
    "copper-fen",
    "drift-hollow",
    "ember-quay",
    "flint-meadow",
    "granite-spur",
    "heather-ford",
    "iron-basin",
    "jasper-cove",
    "kelp-strand",
    "lumen-falls",
    "marble-glen",
    "nimbus-reach",
    "onyx-creek",
    "pine-saddle",
    "quarry-bend",
    "reed-marsh",
    "slate-point",
    "timber-bay",
    "umbra-ridge",
    "violet-ford",
    "willow-crag",
    "xenon-docks",
]


def note_body(
    *,
    title: str,
    matter_id: str,
    client: str,
    escrow: int | None,
    nc: int | None,
    deal: str,
    blurb: str,
) -> str:
    lines = [
        f"# {title}",
        "",
        blurb,
        "",
        f"CLAWQL_MATTER_ID={matter_id}",
        f"CLAWQL_CLIENT={client}",
    ]
    if escrow is not None:
        lines.append(f"CLAWQL_ESCROW_PCT={escrow}")
    if nc is not None:
        lines.append(f"CLAWQL_NONCOMPETE_MONTHS={nc}")
    lines.append(f"CLAWQL_DEAL_TYPE={deal}")
    lines.append("")
    lines.append(
        "Closing / diligence excerpt. Feature fields above are authoritative; "
        "prose may paraphrase but must not invent alternate IDs."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if SEED.exists():
        shutil.rmtree(SEED)
    SEED.mkdir(parents=True)

    all_ids: list[str] = []
    files: list[str] = []

    # Place matches deep under opaque client folders (not in filenames/titles as shortcuts).
    for i, (mid, title, client, escrow, nc, deal) in enumerate(MATCHES):
        slug = CLIENT_SLUGS[i % len(CLIENT_SLUGS)]
        folder = SEED / "clients" / slug / "matters"
        folder.mkdir(parents=True, exist_ok=True)
        # Opaque file name — ID only inside body.
        path = folder / f"closing-memo-{i + 1:02d}.md"
        path.write_text(
            note_body(
                title=title,
                matter_id=mid,
                client=client,
                escrow=escrow,
                nc=nc,
                deal=deal,
                blurb=f"PE / software matter excerpt for {client} ({deal}).",
            ),
            encoding="utf-8",
        )
        all_ids.append(mid)
        files.append(str(path.relative_to(SEED)))

    # Fill to 120 notes with near-misses + low-signal padding.
    target_n = 120
    idx = 0
    while len(all_ids) < target_n:
        spec = NEAR_MISS_SPECS[idx % len(NEAR_MISS_SPECS)]
        escrow, nc = spec
        n = 2600 + idx
        mid = f"MAT-{n}"
        while mid in all_ids or mid in {m[0] for m in MATCHES}:
            n += 1
            mid = f"MAT-{n}"
        slug = CLIENT_SLUGS[(idx + 5) % len(CLIENT_SLUGS)]
        folder = SEED / "clients" / slug / "matters"
        folder.mkdir(parents=True, exist_ok=True)
        title = f"Archive matter {n}"
        client = f"Client {slug.replace('-', ' ').title()}"
        path = folder / f"archive-{n}.md"
        path.write_text(
            note_body(
                title=title,
                matter_id=mid,
                client=client,
                escrow=escrow,
                nc=nc,
                deal="archive",
                blurb="Secondary archive note — check numeric fields carefully before including.",
            ),
            encoding="utf-8",
        )
        all_ids.append(mid)
        files.append(str(path.relative_to(SEED)))
        idx += 1

    expected = [m[0] for m in MATCHES]
    manifest = {
        "expected_matters": expected,
        "criteria": {"escrow_pct_min": 10, "noncompete_months_gt": 18},
        "note_count": len(all_ids),
        "all_matter_ids": sorted(all_ids),
        "layout": "nested clients/*/matters/*.md — IDs only in note bodies",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(all_ids)} notes under {SEED}")
    print(f"Expected matches: {expected}")
    print(f"Manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
