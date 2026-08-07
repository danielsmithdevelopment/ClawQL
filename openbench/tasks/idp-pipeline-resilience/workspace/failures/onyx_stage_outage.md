# Onyx cite stage outage

The enterprise Onyx index endpoint for this OpenBench run is **unavailable**.

Do not call `clawql_knowledge_search_onyx` — it will not return a trustworthy cite.

Recovery policy (for evolutionary remediation):

1. Treat `onyx_cite` as a failed stage.
2. Crystallize a **fallback cite code** from the seed / prior decision appendix
   (ouroboros-on only).
3. Continue the pipeline with `recovered=true` and `failure_stage=onyx_cite`.
4. Finish notify + memory_ingest + `pipeline.json`.

Decoy notes under `decoy/` list incorrect cite codes — ignore them.
