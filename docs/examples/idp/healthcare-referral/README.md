# Healthcare IDP sample pack ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251), [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247))

Synthetic **clinical intake / referral** review pack for local Compose. **Not medical advice.** Fixtures contain no real PHI.

## Contents

| File | Purpose |
| ---- | ------- |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio labeling UI |
| [`sample-tasks.json`](sample-tasks.json) | Example `hitl_enqueue_label_studio` body with **predictions** |
| [`fixtures/synthetic-referral.txt`](fixtures/synthetic-referral.txt) | Demo referral text |

## Compose

[`docker/compose/healthcare.compose.yml`](../../../docker/compose/healthcare.compose.yml)

## Pre-annotation path (#247)

1. Parse / classify the fixture with Docling + `classify_document`.
2. Call **`hitl_enqueue_label_studio`** with `tasks[].predictions` aligned to this XML (`from_name` / `to_name`).
3. Reviewer sees suggestions in Label Studio → webhook → vault.

Example payload: [`sample-tasks.json`](sample-tasks.json).
