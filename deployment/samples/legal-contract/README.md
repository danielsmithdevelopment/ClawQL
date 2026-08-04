# Legal IDP sample pack ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251), [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247))

Synthetic **contract clause / privilege review** pack for local Compose. **Not legal advice.**

## Contents

| File | Purpose |
| ---- | ------- |
| [`label-studio-config.xml`](label-studio-config.xml) | Label Studio labeling UI |
| [`sample-tasks.json`](sample-tasks.json) | Example enqueue body with **predictions** |
| [`fixtures/synthetic-nda-excerpt.txt`](fixtures/synthetic-nda-excerpt.txt) | Demo NDA excerpt |

## Compose

[`docker/compose/legal.compose.yml`](../../../docker/compose/legal.compose.yml)

## Pre-annotation path (#247)

Model/classifier output → `tasks[].predictions` → `hitl_enqueue_label_studio` → Label Studio suggestions → webhook.
