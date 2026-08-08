#!/usr/bin/env python3
"""Regenerate the B-7.1 mini-firm vault seed.

Workspace notes are **prose-only** (no CLAWQL_* machine tags) so bare `grep`
cannot trivially filter escrow/NC. Structured fields live in
`structured_fields.json` and are injected into the vault at seed time
(`seed_and_remove_memory` enrichment) for the clawql-on arm.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = ROOT / "workspace" / ".openbench" / "memory-seed"
MANIFEST = ROOT / "ground_truth.json"
STRUCTURED = ROOT / "structured_fields.json"

# Escrow ≥ 10 AND noncompete > 18 — unchanged.
MATCHES = [
    ("MAT-2388", "Cedar Peak minority", "Cedar Peak Capital", 10, 24, "pe-minority"),
    ("MAT-2401", "Northwind software carve-out", "Northwind Holdings", 12, 24, "pe-software"),
    ("MAT-2415", "Blue Harbor add-on", "Blue Harbor Partners", 15, 36, "add-on"),
    ("MAT-2450", "Riverton SaaS bolt-on", "Riverton Equity", 20, 30, "saas-bolt"),
    ("MAT-2462", "Lakeview growth equity", "Lakeview Growth", 11, 19, "growth"),
]

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

ONES = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
]
TENS = {
    20: "twenty",
    30: "thirty",
    40: "forty",
    50: "fifty",
    60: "sixty",
}


def num_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n in TENS:
        return TENS[n]
    tens, ones = divmod(n, 10)
    base = TENS.get(tens * 10)
    if base and ones:
        return f"{base}-{ONES[ones]}"
    if base:
        return base
    return str(n)


def prose_note(
    *,
    title: str,
    matter_id: str,
    client: str,
    escrow: int | None,
    nc: int | None,
    deal: str,
) -> str:
    """Human-readable note without CLAWQL_* tags (off-arm / workspace)."""
    lines = [
        f"# {title}",
        "",
        f"Client file for {client} ({deal.replace('-', ' ')}).",
        f"Internal matter reference appears in the closing set as {matter_id}.",
        "",
    ]
    if escrow is None:
        lines.append(
            "Purchase-price holdback / escrow percentage was never recorded in the "
            "executed closing binder excerpt on file."
        )
    else:
        lines.append(
            f"The escrow holdback sat at {num_words(escrow)} percent of purchase price "
            f"({escrow} pct in the funds-flow schedule)."
        )
    if nc is None:
        lines.append("No non-compete term is stated in this excerpt.")
    else:
        lines.append(
            f"Key-employee non-compete ran {num_words(nc)} months "
            f"({nc} months post-close) under the restrictive-covenant schedule."
        )
    lines.append("")
    lines.append(
        "Associate note: prefer firm memory tools when available; filenames and "
        "folder slugs do not encode numeric deal terms."
    )
    lines.append("")
    return "\n".join(lines)


def structured_block(
    matter_id: str,
    client: str,
    escrow: int | None,
    nc: int | None,
    deal: str,
) -> str:
    lines = [
        "",
        "<!-- clawql-structured (vault-only enrichment) -->",
        f"CLAWQL_MATTER_ID={matter_id}",
        f"CLAWQL_CLIENT={client}",
    ]
    if escrow is not None:
        lines.append(f"CLAWQL_ESCROW_PCT={escrow}")
    if nc is not None:
        lines.append(f"CLAWQL_NONCOMPETE_MONTHS={nc}")
    lines.append(f"CLAWQL_DEAL_TYPE={deal}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if SEED.exists():
        shutil.rmtree(SEED)
    SEED.mkdir(parents=True)

    all_ids: list[str] = []
    files: list[str] = []
    structured: dict[str, dict] = {}

    for i, (mid, title, client, escrow, nc, deal) in enumerate(MATCHES):
        slug = CLIENT_SLUGS[i % len(CLIENT_SLUGS)]
        folder = SEED / "clients" / slug / "matters"
        folder.mkdir(parents=True, exist_ok=True)
        rel = f"clients/{slug}/matters/closing-memo-{i + 1:02d}.md"
        path = SEED / rel
        path.write_text(
            prose_note(
                title=title,
                matter_id=mid,
                client=client,
                escrow=escrow,
                nc=nc,
                deal=deal,
            ),
            encoding="utf-8",
        )
        structured[rel.replace("\\", "/")] = {
            "matter_id": mid,
            "client": client,
            "escrow_pct": escrow,
            "noncompete_months": nc,
            "deal_type": deal,
            "vault_appendix": structured_block(mid, client, escrow, nc, deal),
        }
        all_ids.append(mid)
        files.append(rel)

    target_n = 120
    idx = 0
    while len(all_ids) < target_n:
        escrow, nc = NEAR_MISS_SPECS[idx % len(NEAR_MISS_SPECS)]
        n = 2600 + idx
        mid = f"MAT-{n}"
        while mid in all_ids or mid in {m[0] for m in MATCHES}:
            n += 1
            mid = f"MAT-{n}"
        slug = CLIENT_SLUGS[(idx + 5) % len(CLIENT_SLUGS)]
        folder = SEED / "clients" / slug / "matters"
        folder.mkdir(parents=True, exist_ok=True)
        rel = f"clients/{slug}/matters/archive-{n}.md"
        path = SEED / rel
        client = f"Client {slug.replace('-', ' ').title()}"
        path.write_text(
            prose_note(
                title=f"Archive matter {n}",
                matter_id=mid,
                client=client,
                escrow=escrow,
                nc=nc,
                deal="archive",
            ),
            encoding="utf-8",
        )
        structured[rel] = {
            "matter_id": mid,
            "client": client,
            "escrow_pct": escrow,
            "noncompete_months": nc,
            "deal_type": "archive",
            "vault_appendix": structured_block(mid, client, escrow, nc, "archive"),
        }
        all_ids.append(mid)
        files.append(rel)
        idx += 1

    expected = [m[0] for m in MATCHES]
    MANIFEST.write_text(
        json.dumps(
            {
                "expected_matters": expected,
                "criteria": {"escrow_pct_min": 10, "noncompete_months_gt": 18},
                "note_count": len(all_ids),
                "all_matter_ids": sorted(all_ids),
                "layout": "prose-only workspace notes; CLAWQL_* injected into vault only",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    STRUCTURED.write_text(json.dumps(structured, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(all_ids)} prose notes under {SEED}")
    print(f"Structured fields: {STRUCTURED} ({len(structured)} entries)")
    print(f"Expected matches: {expected}")


if __name__ == "__main__":
    main()
