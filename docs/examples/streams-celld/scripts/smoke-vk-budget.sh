#!/usr/bin/env bash
# Local proof: bind-on-create budget ceiling (402) + expire-on-destroy (401).
# No provider keys; uses inference-health-stub only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${VK_BUDGET_STUB_PORT:-9873}"
LOG="$(mktemp "${TMPDIR:-/tmp}/vk-budget-stub.XXXXXX.log")"

cleanup() {
  local ec=$?
  [[ -n "${PID:-}" ]] && kill "$PID" 2>/dev/null || true
  sleep 0.2
  [[ -n "${PID:-}" ]] && kill -9 "$PID" 2>/dev/null || true
  exit "$ec"
}
trap cleanup EXIT

INFERENCE_STUB_BUDGET_USD=0.015 INFERENCE_STUB_COST_PER_TURN_USD=0.01 \
  node "$ROOT/scripts/inference-health-stub.mjs" "$PORT" >"$LOG" 2>&1 &
PID=$!

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null

python3 - "$PORT" <<'PY'
import json, sys, urllib.request

port = sys.argv[1]
base = f"http://127.0.0.1:{port}"

def post(path, body, headers=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"content-type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

vk = "vk_lab_budget01"
st, bind = post("/v1/keys/bind", {"virtualKeyId": vk, "budgetUsd": 0.015})
assert st == 200 and bind.get("virtualKeyBound") is True, bind

h = {"authorization": f"Bearer {vk}", "x-clawql-virtual-key": vk}
st1, t1 = post("/v1/messages", {"prompt": "t1", "turn": 1, "virtualKeyId": vk}, h)
assert st1 == 200 and t1.get("ok") is True, (st1, t1)

st2, t2 = post("/v1/messages", {"prompt": "t2", "turn": 2, "virtualKeyId": vk}, h)
assert st2 == 402 and t2.get("error") == "insufficient_quota", (st2, t2)

st3, exp = post("/v1/keys/expire", {"virtualKeyId": vk}, h)
assert st3 == 200 and exp.get("ok") is True, (st3, exp)

st4, t4 = post("/v1/messages", {"prompt": "after-expire", "turn": 3, "virtualKeyId": vk}, h)
assert st4 == 401 and t4.get("error") == "virtual_key_expired", (st4, t4)

print("smoke-vk-budget: PASS")
print(json.dumps({"bind": True, "turn1": 200, "ceiling": 402, "expire": 200, "postExpire": 401}))
PY
