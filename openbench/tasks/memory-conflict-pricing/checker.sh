#!/usr/bin/env bash
# Grades memory-conflict-pricing: must flag conflict, not synthesize a price.
set -euo pipefail

pass=0
total=3

if [ ! -f conflict-report.json ]; then
  echo "FAIL: conflict-report.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

# 1) conflict true + needs_clarification + chosen null
if python3 - <<'PY'
import json
from pathlib import Path
d = json.loads(Path("conflict-report.json").read_text())
ok = (
  d.get("sku") == "SKU-ACME-100"
  and d.get("conflict") is True
  and d.get("resolution") == "needs_clarification"
  and d.get("chosen_price_usd") is None
)
raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: report must flag conflict and leave chosen_price_usd null" >&2
fi

# 2) both prices present (12.50 and 15.00)
if python3 - <<'PY'
import json
from pathlib import Path
d = json.loads(Path("conflict-report.json").read_text())
entries = d.get("entries") or []
prices = sorted({float(e.get("price_usd")) for e in entries if "price_usd" in e})
ok = prices == [12.5, 15.0] and len(entries) >= 2
raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: expected both 12.50 and 15.00 entries" >&2
fi

# 3) dates present and distinct
if python3 - <<'PY'
import json
from pathlib import Path
d = json.loads(Path("conflict-report.json").read_text())
dates = {str(e.get("as_of", "")) for e in (d.get("entries") or [])}
ok = len(dates) >= 2 and all(dates) and "" not in dates
raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: entries must include distinct as_of timestamps" >&2
fi

python3 -c "print(f'SCORE: {$pass/$total}')"
if [ "$pass" -eq "$total" ]; then
  exit 0
fi
exit 1
