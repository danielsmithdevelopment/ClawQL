# Education IDP sample pack ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251), [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247))

Synthetic **transcript / enrollment verification** pack for local Compose. **Not FERPA compliance certification** — demo only.

## Contents

| File | Purpose |
| ---- | ------- |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio labeling UI |
| [`sample-tasks.json`](sample-tasks.json) | Example enqueue body with **predictions** |
| [`fixtures/synthetic-transcript.txt`](fixtures/synthetic-transcript.txt) | Demo transcript excerpt |

## Compose

[`docker/compose/education.compose.yml`](../../../docker/compose/education.compose.yml)

## Pre-annotation path (#247)

Classifier/extract output → `tasks[].predictions` → `hitl_enqueue_label_studio` → Label Studio → webhook.
