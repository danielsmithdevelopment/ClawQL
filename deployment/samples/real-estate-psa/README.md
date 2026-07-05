# Real estate PSA (purchase agreement) reference pack

End-to-end **intelligent document processing** sample for residential transactions: ingest a purchase and sale agreement, parse with Docling, extract grounded contract fields (purchase price, earnest money, closing date, parties), route low-confidence reads to **human-in-the-loop** review, then persist to vault memory linked to the deal.

Pairs with the [title commitment pack](../real-estate-title/README.md) — coordinators typically process PSA first, then title commitment, cross-checking purchase price vs policy amount.

**Synthetic data only.**

## Contents

| File | Purpose |
| ---- | ------- |
| [`workflow-template.yaml`](workflow-template.yaml) | Argo `WorkflowTemplate` — classify → suspend → finalize |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio UI for PSA field confirmation |
| [`openclaw-prompt.md`](openclaw-prompt.md) | OpenClaw system prompt addendum |
| [`fixtures/synthetic-psa.txt`](fixtures/synthetic-psa.txt) | Demo purchase agreement |

## Apply and submit

```bash
kubectl apply -f deployment/samples/real-estate-psa/workflow-template.yaml -n clawql
```

```json
{
  "operation": "submit",
  "namespace": "clawql",
  "template_ref": {
    "kind": "WorkflowTemplate",
    "name": "clawql-realestate-psa-ingest",
    "namespace": "clawql"
  },
  "parameters": {
    "document_path": "fixtures/synthetic-psa.txt",
    "confidence_threshold": "0.88",
    "deal_id": "demo-deal-123-main"
  },
  "correlation_id": "realestate-psa-demo-001"
}
```

## Extract grounded fields

```json
{
  "tool": "extract_document",
  "arguments": {
    "text": "<docling markdown>",
    "schema_preset": "purchase_agreement",
    "doc_id": "demo-deal-123-main-psa"
  }
}
```

Expected extraction classes: `purchase_price`, `earnest_money`, `closing_date`, `buyer_name`, `seller_name`, `property_address`.

## Deal threading

After PSA and title workflows complete, vault notes should wikilink:

- `[[Deal demo-deal-123-main]]`
- `[[PSA — demo-deal-123-main]]`
- `[[Title — demo-deal-123-main]]`

Agents use **`memory_recall`** query: "purchase price and title policy amount for 123 Main Street" to verify alignment before closing.

## Related

- [Title commitment pack](../real-estate-title/README.md)
- [Lending W-2 pack](../lending-w2/README.md)
