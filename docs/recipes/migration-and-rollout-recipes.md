# Migration and Rollout Recipes

## 1) Documentation Reorg Rollout

### Use case

Large docs move/rename with minimal broken links.

### Steps

1. Move files into target folder structure.
2. Run repo-wide reference search.
3. Patch all internal links.
4. Update docs index pages.
5. Validate with lint/check pass.

---

## 2) Provider Scope Migration

### Use case

Move from one provider to merged multi-provider setup.

### Steps

1. Verify current single-provider workflows.
2. Add merged provider config.
3. Re-run `search` discovery for all key intents.
4. Update operation maps/runbooks.
5. Capture migration diffs with `memory_ingest`.

---

## 3) Environment Flag Rollout

### Use case

Enable optional tools safely in stages.

### Steps

1. Enable one optional flag at a time.
2. Validate tool appears and behaves as expected.
3. Run smoke recipe for that tool.
4. Roll to next environment tier.

---

## 4) Workflow Artifact Path Migration

### Use case

Move generated workflow outputs to new folder paths.

### Steps

1. Move artifacts.
2. Update script output paths.
3. Update benchmark/docs references.
4. Validate generated outputs still land correctly.

---

## 5) Recipe-Driven Rollout

### Use case

Standardize operational behavior across team.

### Steps

1. Pick canonical recipes per workflow type.
2. Add links in runbooks/docs index.
3. Train contributors on shared patterns.
4. Review outcomes and refine recipes quarterly.
