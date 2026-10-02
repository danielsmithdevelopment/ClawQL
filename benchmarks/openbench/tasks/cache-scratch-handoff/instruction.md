# Cache scratch handoff

Use the OpenCode tool named **clawql_cache** (not cache) to assemble a token.

## Steps

1. read sealed/part_a.txt and sealed/part_b.txt
2. Call tool clawql_cache with operation set, key ob.part.a, value from part_a
3. Call tool clawql_cache with operation set, key ob.part.b, value from part_b
4. Call tool clawql_cache with operation get for key ob.part.a
5. Call tool clawql_cache with operation get for key ob.part.b
6. write file answer.json in the workspace (relative path answer.json)

answer.json must look like:
token = part_a + "-" + part_b
source = cache

## Rules

- Ignore decoy/
- You must call clawql_cache (set and get). Reading sealed files alone fails.
- Stop after writing answer.json
