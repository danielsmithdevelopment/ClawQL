#!/usr/bin/env bash
# Promote a BYO classifier image tag after eval gates pass.
# Usage:
#   ./promote.sh --metrics fixtures/metrics.example.json --tag v1.2.0
#   ./promote.sh --metrics /path/metrics.json --tag v1.2.0 --helm-print
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRICS=""
TAG=""
HELM_PRINT=0
MACRO_F1_MIN="${CLASSIFIER_PROMOTE_MACRO_F1:-0.92}"
W2_RECALL_MIN="${CLASSIFIER_PROMOTE_W2_RECALL:-0.98}"
UNKNOWN_FPR_MAX="${CLASSIFIER_PROMOTE_UNKNOWN_FPR:-0.02}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --metrics) METRICS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --helm-print) HELM_PRINT=1; shift ;;
    -h|--help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$METRICS" || -z "$TAG" ]]; then
  echo "Usage: $0 --metrics <metrics.json> --tag <image-tag> [--helm-print]" >&2
  exit 2
fi
if [[ ! -f "$METRICS" ]]; then
  echo "metrics file not found: $METRICS" >&2
  exit 1
fi

python3 - "$METRICS" "$MACRO_F1_MIN" "$W2_RECALL_MIN" "$UNKNOWN_FPR_MAX" <<'PY'
import json, sys
path, f1_min, w2_min, fpr_max = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
m = json.load(open(path, encoding="utf-8"))
macro = float(m.get("macro_f1", 0))
w2_recall = float(((m.get("per_class") or {}).get("w2") or {}).get("recall", 0))
fpr = float(m.get("false_positive_rate_unknown", 1))
errors = []
if macro < f1_min:
    errors.append(f"macro_f1 {macro} < {f1_min}")
if w2_recall < w2_min:
    errors.append(f"w2 recall {w2_recall} < {w2_min}")
if fpr > fpr_max:
    errors.append(f"unknown FPR {fpr} > {fpr_max}")
if errors:
    print("PROMOTE BLOCKED:", "; ".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"OK gates: macro_f1={macro} w2_recall={w2_recall} unknown_fpr={fpr}")
PY

echo "Promote tag: ${TAG}"
echo "Pin contract: documentPipeline.classifier.image.tag=${TAG} (+ MODEL_VERSION env)"
if [[ "$HELM_PRINT" -eq 1 ]]; then
  cat <<EOF
helm upgrade --install clawql charts/clawql-mcp \\
  --set enableIdpClassifier=true \\
  --set documentPipeline.classifier.enabled=true \\
  --set documentPipeline.classifier.image.tag=${TAG} \\
  --set documentPipeline.classifier.env.modelVersion=${TAG} \\
  --set documentPipeline.classifier.env.minConfidence=0.85
EOF
fi
echo "Rollback: revert image.tag / modelVersion to previous promote."
echo "Audit: memory_ingest title='Classifier promote ${TAG}' with metrics.json snapshot."
