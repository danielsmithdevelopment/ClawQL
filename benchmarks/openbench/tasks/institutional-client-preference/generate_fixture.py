#!/usr/bin/env python3
"""Regenerate the B-7.2 Meridian preference fixture.

Prose-only workspace notes. Preference signal lives in institutional prose
(risk profile / prior outcomes), never as a sortable preferred= field.
CLAWQL_* enrichment (client_id links) is vault-only via structured_fields.json.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = ROOT / "workspace" / ".openbench" / "memory-seed"
MANIFEST = ROOT / "ground_truth.json"
STRUCTURED = ROOT / "structured_fields.json"
DOCS_GT = (
    ROOT.parents[2]
    / "docs"
    / "benchmarks"
    / "b7-ground-truth"
    / "b7-2-meridian-preference.md"
)

CLIENT_ID = "CLT-0017"
CLIENT_NAME = "Meridian Capital"
ACTIVE = "MAT-2801"
TOP1 = "MAT-2801-A"
RANKING = ["MAT-2801-A", "MAT-2801-C", "MAT-2801-B"]

DISTRACTOR_CLIENTS = [
    ("CLT-0042", "Apex Harbor Partners", "apex-harbor"),
    ("CLT-0055", "Silverpine Equity", "silverpine"),
    ("CLT-0068", "Northfork Ventures", "northfork"),
    ("CLT-0071", "Cedarline Capital", "cedarline"),
    ("CLT-0080", "Ironbark Partners", "ironbark"),
    ("CLT-0083", "Quarry Peak Holdings", "quarry-peak"),
    ("CLT-0088", "Westfen Capital", "westfen"),
    ("CLT-0091", "Amberly Growth", "amberly"),
    ("CLT-0094", "Stoneharbor Equity", "stoneharbor"),
    ("CLT-0097", "Bluefinch Ventures", "bluefinch"),
    ("CLT-0102", "Redwood Bridge Cap", "redwood-bridge"),
    ("CLT-0105", "Palisade Markets", "palisade"),
]
ARCHIVES_PER_DISTRACTOR = 8


def vault_matter(matter_id: str, client_id: str, title: str | None = None) -> str:
    lines = [
        "",
        "<!-- clawql-structured (vault-only enrichment) -->",
        f"CLAWQL_MATTER_ID={matter_id}",
        f"CLAWQL_CLIENT_ID={client_id}",
        "CLAWQL_STATUS=Active",
    ]
    if title:
        lines.append(f"CLAWQL_TITLE={title}")
    return "\n".join(lines) + "\n"


def put(
    structured: dict,
    rel: str,
    body: str,
    *,
    matter_id: str | None = None,
    client_id: str | None = None,
    option_id: str | None = None,
    title: str | None = None,
) -> None:
    path = SEED / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.rstrip() + "\n", encoding="utf-8")
    key = rel.replace("\\", "/")
    entry: dict = {}
    if matter_id:
        entry["matter_id"] = matter_id
    if client_id:
        entry["client_id"] = client_id
    if option_id:
        entry["option_id"] = option_id
    if matter_id and client_id:
        entry["vault_appendix"] = vault_matter(matter_id, client_id, title=title)
    elif client_id and not matter_id:
        entry["vault_appendix"] = (
            "\n<!-- clawql-structured (vault-only enrichment) -->\n"
            f"CLAWQL_CLIENT_ID={client_id}\n"
            f"CLAWQL_CLIENT_NAME={CLIENT_NAME if client_id == CLIENT_ID else 'distractor'}\n"
        )
    if entry:
        structured[key] = entry


def main() -> None:
    if SEED.exists():
        shutil.rmtree(SEED)
    SEED.mkdir(parents=True)
    structured: dict = {}

    put(
        structured,
        "clients/meridian-capital/client.md",
        f"""# Client {CLIENT_ID} — {CLIENT_NAME}

## Risk profile

{CLIENT_NAME} has historically prioritized deal certainty over valuation upside.
Headline purchase price is explicitly **not** the ranking key for this client.
In the 2022 Apex divestiture, they accepted a 3% haircut on deal value to
eliminate a MAC clause the counterparty had insisted on. Senior partner
notes from that matter: "client will walk before accepting open-ended
indemnity exposure."

Standing instruction from Marcus Webb: reject any package that retains an
earn-out or an open-ended buyer MAC, even when that package posts the highest
headline price. Other clients maximize price; Meridian does not.

## Relationship notes

Preferred relationship partner: Sarah Chen (ATY-0041). Client contact
Marcus Webb has consistently flagged post-closing liability as the primary
concern across all three prior matters.

## Prior matter outcomes

MAT-2244 (2021): chose lower bid from buyer with stronger balance sheet.
MAT-2312 (2023): rejected deal with favorable price due to earn-out structure.
MAT-2720 (2022 Apex): accepted lower price to remove open-ended MAC risk.

## Decision screen for live options

When ranking term sheets for Meridian, apply this screen in order:
1. Drop any option with earn-out or open-ended MAC (fails Helios / Apex tests).
2. Among survivors, prefer deleted MAC + lowest indemnity basket + no earn-out.
3. Do not re-rank survivors by purchase price.
""",
        client_id=CLIENT_ID,
    )
    # Fix client name in appendix
    structured["clients/meridian-capital/client.md"]["vault_appendix"] = (
        "\n<!-- clawql-structured (vault-only enrichment) -->\n"
        f"CLAWQL_CLIENT_ID={CLIENT_ID}\n"
        f"CLAWQL_CLIENT_NAME={CLIENT_NAME}\n"
    )

    put(
        structured,
        "clients/meridian-capital/matters/mat-2244-balance-sheet.md",
        """# MAT-2244 — Rivergate bolt-on (2021)

Client file for Meridian Capital. Internal matter reference MAT-2244.

The winning path was not the highest headline price. Meridian selected the
buyer with the stronger balance sheet even though the bid sat roughly four
percent below the lead offer. Partner memo: "certainty of close and survivor
strength outweighed the last turn of value."

Indemnity negotiation stayed inside a closed basket; no earn-out was used.
""",
        matter_id="MAT-2244",
        client_id=CLIENT_ID,
    )

    put(
        structured,
        "clients/meridian-capital/matters/mat-2312-earnout-reject.md",
        """# MAT-2312 — Helios carve-out (2023)

Client file for Meridian Capital. Internal matter reference MAT-2312.

Counterparty tabled a higher purchase price contingent on a multi-year
earn-out tied to product milestones. Meridian rejected the package despite
favorable headline economics. Relationship note: "earn-outs recreate the
open-ended exposure Marcus refuses to carry."

They later closed a cleaner structure at a lower price with capped indemnity.
""",
        matter_id="MAT-2312",
        client_id=CLIENT_ID,
    )

    put(
        structured,
        "clients/meridian-capital/matters/mat-2720-apex-mac.md",
        """# MAT-2720 — Apex divestiture (2022)

Client file for Meridian Capital. Internal matter reference MAT-2720.

Meridian accepted approximately a three percent haircut on deal value to
delete an open-ended MAC clause the buyer had insisted on. Senior partner
notes: "client will walk before accepting open-ended indemnity exposure."

Post-closing liability remained the gating issue for Marcus Webb.
""",
        matter_id="MAT-2720",
        client_id=CLIENT_ID,
    )

    put(
        structured,
        "clients/meridian-capital/matters/mat-2801-active.md",
        f"""# {ACTIVE} — Northline software add-on (active)

Client file for Meridian Capital. Internal matter reference {ACTIVE}.

Three term sheets are on the table for the same target. Evaluate them against
Meridian's institutional preferences from prior matters — not against a single
numeric field (especially not headline purchase price). Annex files in this folder:

- term-sheet-a.md
- term-sheet-b.md
- term-sheet-c.md

Apply the Meridian decision screen: drop earn-out / open-MAC packages first,
then prefer deleted MAC + lowest indemnity among survivors. Do not invent a
fourth option. Ranking must be grounded in Meridian history.
""",
        matter_id=ACTIVE,
        client_id=CLIENT_ID,
    )

    # Term sheets: surface attributes only — never "preferred".
    # Price sort would pick B > C > A; Meridian prefers A > C > B.
    put(
        structured,
        "clients/meridian-capital/matters/term-sheet-a.md",
        f"""# Term sheet A — Northline option A

Option identifier: {TOP1}
Annex to active matter: {ACTIVE}.

- Headline purchase price: USD 48,000,000
- Indemnity cap: 8% of purchase price (closed basket)
- MAC clause: none (deleted in current mark)
- Earn-out: none
- Reps and warranties: clean, with standard knowledge qualifiers only
- Closing certainty notes: escrow at 10%; no contingent purchase-price adjustment

Buyer balance sheet described as investment-grade affiliate support.
Pattern note: deleted MAC, closed low indemnity basket, no earn-out — matches
the certainty screen Meridian applied in Apex and Helios.
""",
        matter_id=ACTIVE,
        client_id=CLIENT_ID,
        option_id=TOP1,
        title="term-sheet-A",
    )

    put(
        structured,
        "clients/meridian-capital/matters/term-sheet-b.md",
        f"""# Term sheet B — Northline option B

Option identifier: MAT-2801-B
Annex to active matter: {ACTIVE}.

- Headline purchase price: USD 56,500,000 (highest of the three)
- Indemnity cap: 20% of purchase price with survival beyond escrow
- MAC clause: open-ended buyer MAC retained
- Earn-out: USD 6,000,000 over 36 months tied to ARR milestones
- Reps and warranties: expansive, including growth representations
- Closing certainty notes: several conditions precedent remain open

This package maximizes headline value and contingent upside.
Pattern note: earn-out + open MAC matches the Helios / Apex packages Meridian
rejected historically — high price does not compensate for that exposure.
""",
        matter_id=ACTIVE,
        client_id=CLIENT_ID,
        option_id="MAT-2801-B",
        title="term-sheet-B",
    )

    put(
        structured,
        "clients/meridian-capital/matters/term-sheet-c.md",
        f"""# Term sheet C — Northline option C

Option identifier: MAT-2801-C
Annex to active matter: {ACTIVE}.

- Headline purchase price: USD 52,000,000
- Indemnity cap: 12% of purchase price (standard basket)
- MAC clause: standard MAE definition (not open-ended)
- Earn-out: none
- Reps and warranties: market for software add-ons
- Closing certainty notes: escrow at 12%; limited conditionality

Higher price than A; more liability surface than A; cleaner than B.
No earn-out, but standard MAC remains — acceptable middle path for Meridian
only after earn-out / open-MAC packages are discarded.
""",
        matter_id=ACTIVE,
        client_id=CLIENT_ID,
        option_id="MAT-2801-C",
        title="term-sheet-C",
    )

    for i, (cid, name, slug) in enumerate(DISTRACTOR_CLIENTS):
        put(
            structured,
            f"clients/{slug}/client.md",
            f"""# Client {cid} — {name}

## Risk profile

{name} historically maximizes headline purchase price and is comfortable with
earn-outs when they increase expected value. Partner notes emphasize valuation
upside over indemnity caps.

## Prior matter outcomes

They have closed deals with open MAC language when price compensated.
""",
            client_id=cid,
        )
        structured[f"clients/{slug}/client.md"]["vault_appendix"] = (
            "\n<!-- clawql-structured (vault-only enrichment) -->\n"
            f"CLAWQL_CLIENT_ID={cid}\n"
            f"CLAWQL_CLIENT_NAME={name}\n"
        )
        mid = f"MAT-{2900 + i}"
        put(
            structured,
            f"clients/{slug}/matters/active-{mid}.md",
            f"""# {mid} — distractor active matter

Client file for {name}. Internal matter reference {mid}.

Term sheet summary favors the highest price package with earn-out upside.
This client's preference pattern is the opposite of Meridian Capital's.
""",
            matter_id=mid,
            client_id=cid,
        )
        for j in range(ARCHIVES_PER_DISTRACTOR):
            aid = f"MAT-{3000 + i * 20 + j}"
            put(
                structured,
                f"clients/{slug}/matters/archive-{aid}.md",
                f"""# {aid} — archive note

Client file for {name}. Historical matter {aid} with routine closing terms.
Deal value discussed in the mid tens of millions. Preference pattern for this
client is price-maximizing with earn-out comfort — opposite of Meridian Capital.
Partner notes mention indemnity as secondary to headline value.
""",
                matter_id=aid,
                client_id=cid,
            )

    note_count = sum(1 for _ in SEED.rglob("*.md"))
    manifest = {
        "task": "institutional-client-preference",
        "client_id": CLIENT_ID,
        "client_name": CLIENT_NAME,
        "active_matter": ACTIVE,
        "top1": TOP1,
        "top1_aliases": [
            TOP1,
            "A",
            "OPTION A",
            "TERM SHEET A",
            "SHEET A",
            "NORTHLINE OPTION A",
        ],
        "ranking": RANKING,
        "note_count": note_count,
        "layout": "prose preference signal; no preferred= field; CLAWQL_* vault-only",
        "anti_patterns": [
            "field sort on deal value must NOT yield top1",
            "answer IDs not in task prompt",
            "ground-truth rationale lives in docs/ only",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    STRUCTURED.write_text(json.dumps(structured, indent=2) + "\n", encoding="utf-8")

    DOCS_GT.parent.mkdir(parents=True, exist_ok=True)
    DOCS_GT.write_text(
        f"""# B-7.2 Ground Truth — Client {CLIENT_ID} Preference Ranking

> **Not in the vault.** Agents must not read this file during the task.

Task: {CLIENT_ID} ({CLIENT_NAME}) is evaluating three term sheets for {ACTIVE}.
Rank from most to least preferred given institutional context.

Ground truth ranking: `{RANKING}`

Rationale:

- **A ({TOP1}):** lowest indemnity cap, clean R&W, no earn-out, MAC deleted → fits Meridian risk profile (Apex haircut for certainty; walk before open-ended indemnity).
- **C (MAT-2801-C):** higher price but standard MAC, no earn-out → acceptable middle path.
- **B (MAT-2801-B):** highest price, earn-out + open MAC → Meridian rejected this pattern in MAT-2312 / MAT-2720.

Top-1 answer for grader: `{TOP1}`

Anti-pattern checks:

1. Field sort by purchase price would rank B > C > A — **not** the ground truth.
2. Corpus support: client.md + MAT-2244 / MAT-2312 / MAT-2720 prose cite the signal.
3. Answer option IDs appear only in term-sheet annex prose and this docs file — not in the task prompt.
""",
        encoding="utf-8",
    )

    print(f"wrote {note_count} notes → {SEED}")
    print(f"top1={TOP1} ranking={RANKING}")


if __name__ == "__main__":
    main()
