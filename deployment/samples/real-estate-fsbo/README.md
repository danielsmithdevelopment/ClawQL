# Real estate FSBO (buyer offer) reference pack

Reference workflow for **For Sale By Owner** sellers who receive multiple buyer offers and title documents but lack a transaction coordinator. ClawQL classifies offers, extracts price and contingency fields with citations, and supports side-by-side comparison — without replacing Houzeo, Beycome, or MLS listing tools.

Pairs with the [title commitment](../real-estate-title/README.md) and [PSA](../real-estate-psa/README.md) packs. FSBO sellers use the same `extract_document` engine with the **`buyer_offer`** schema preset (PSA fields plus contingencies).

**Synthetic data only.**

## Contents

| File | Purpose |
| ---- | ------- |
| [`openclaw-prompt.md`](openclaw-prompt.md) | OpenClaw addendum — offer intake and comparison |
| [`fixtures/synthetic-buyer-offer.txt`](fixtures/synthetic-buyer-offer.txt) | Primary demo offer (financed, sale-of-home contingency) |
| [`fixtures/synthetic-buyer-offer-alt.txt`](fixtures/synthetic-buyer-offer-alt.txt) | Second offer for comparison (cash, higher price) |

## Extract grounded fields

```json
{
  "tool": "extract_document",
  "arguments": {
    "text": "<docling markdown>",
    "schema_preset": "buyer_offer",
    "doc_id": "fsbo-oak-lane-offer-1"
  }
}
```

Expected extraction classes: `purchase_price`, `earnest_money`, `closing_date`, `buyer_name`, `seller_name`, `financing_contingency`, `inspection_contingency`, `appraisal_contingency`, `sale_of_home_contingency`.

## Compare two offers (agent workflow)

1. Parse both fixtures with Docling.
2. Classify as `buyer_offer` (or `purchase_agreement` when offer language is generic).
3. Extract each with `schema_preset: "buyer_offer"`.
4. `memory_ingest` notes `[[FSBO — 456 Oak Lane]]`, `[[Offer 1 — Casey Prospect]]`, `[[Offer 2 — Riley Backup]]`.
5. Ask: "Which offer has fewer contingencies and closes sooner?" — agent answers from grounded extractions, not re-reads.

## Positioning

| System | Role |
| ------ | ---- |
| Houzeo / Beycome / flat-fee MLS | Listing, forms, optional coordination |
| Title / escrow | Commitment, closing |
| ClawQL | Understand offers and title PDFs; compare contingencies; vault recall |

ClawQL does **not** replace MLS listing platforms or e-sign. Per-transaction or low-volume pricing fits FSBO better than a $299/mo coordinator seat.

## Related

- [Real estate vertical overview](../real-estate/README.md)
- [Title commitment pack](../real-estate-title/README.md)
- [PSA pack](../real-estate-psa/README.md)
