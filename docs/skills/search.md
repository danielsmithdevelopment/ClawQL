# Skill: `search`

Use `search` to discover the right API operation before calling `execute`.

## When to Use

- You know intent, not operationId.
- You need parameter hints before execution.
- You are working across merged providers.

## Common Workflow

1. Start with a natural-language query.
2. Inspect top 3-5 results.
3. Pick one operationId.
4. Confirm required params.
5. Hand off to `execute`.

## Patterns

### Pattern A: Resource listing

- Query: "list kubernetes clusters in project"
- Goal: find list operation + required parent/project fields.

### Pattern B: Change operation

- Query: "update DNS record cloudflare"
- Goal: locate mutation endpoint + argument names.

### Pattern C: Troubleshooting

- Query: "get service details latest revision"
- Goal: discover read operation for diagnostics before edits.

## Tips

- Use specific verbs: `list`, `create`, `update`, `delete`, `get`.
- Include provider/domain nouns: `jira`, `cloudflare`, `github`, `gke`.
- If results are broad, refine query rather than guessing operationId.

## Composed Workflow

- For safe first-pass discovery, run `search`-only across all steps before any `execute`.
- Then execute only the selected high-confidence operationIds.
