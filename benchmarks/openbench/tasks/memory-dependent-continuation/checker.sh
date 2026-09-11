#!/usr/bin/env bash
# Grades memory-dependent continuation: argon2id + 900s TTL.
set -euo pipefail

pass=0
total=3

if [ ! -f src/auth.py ]; then
  echo "FAIL: src/auth.py missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

# 1) Module imports
if python3 -c "import src.auth" 2>/dev/null; then
  pass=$((pass + 1))
else
  echo "FAIL: cannot import src.auth" >&2
fi

# 2) Hash algorithm is argon2id (not bcrypt)
if python3 - <<'PY'
import src.auth as a
h = a.hash_password("secret")
algo = getattr(a, "HASH_ALGO", "")
ok = (algo == "argon2id") or str(h).startswith("argon2id:")
raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: expected argon2id hashing" >&2
fi

# 3) Reset TTL is 900 seconds (keep create_reset_token callable with no args)
if python3 - <<'PY'
import inspect
import src.auth as a

ttl = getattr(a, "RESET_TTL_SECONDS", None)
ok = ttl == 900

expires = None
try:
    sig = inspect.signature(a.create_reset_token)
    required = [
        p
        for p in sig.parameters.values()
        if p.default is inspect.Parameter.empty
        and p.kind
        in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    if not required:
        payload = a.create_reset_token()
        if isinstance(payload, dict):
            expires = payload.get("expires_in")
except Exception as exc:  # noqa: BLE001 — surface in FAIL path via ok=False
    print(f"create_reset_token error: {exc}", flush=True)
    ok = False

if expires is not None:
    ok = ok and expires == 900

# verify_reset_token should accept within window and reject after
try:
    ok = ok and a.verify_reset_token({"issued_at": 0, "expires_in": 900}, 899)
    ok = ok and (not a.verify_reset_token({"issued_at": 0, "expires_in": 900}, 901))
except Exception as exc:  # noqa: BLE001
    print(f"verify_reset_token error: {exc}", flush=True)
    ok = False

raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: expected 900s reset TTL behavior" >&2
fi

python3 -c "print(f'SCORE: {$pass/$total}')"
if [ "$pass" -eq "$total" ]; then
  exit 0
fi
exit 1
