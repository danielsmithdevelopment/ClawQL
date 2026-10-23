# Verus toolchain pin (ADR 0016 Phase C)

| Item | Pin |
| --- | --- |
| Verus release | `0.2026.10.18.7d82994` ([GitHub release](https://github.com/verus-lang/verus/releases/tag/release/0.2026.10.18.7d82994)) |
| Rust toolchain | `1.99.1-x86_64-unknown-linux-gnu` (required by that Verus build) |
| `vstd` crate | `=0.0.0-2026-10-18-0147` (matches release) |
| Proved crate | [`approval-policy/`](./approval-policy/) |

## Install (Linux x86_64)

```bash
curl -sL -o /tmp/verus.zip \
  https://github.com/verus-lang/verus/releases/download/release/0.2026.10.18.7d82994/verus-0.2026.10.18.7d82994-x86-linux.zip
unzip -qo /tmp/verus.zip -d "$HOME/verus"
export PATH="$HOME/verus/verus-x86-linux:$PATH"
rustup install 1.99.1-x86_64-unknown-linux-gnu
```

## Verify

```bash
./scripts/formal/verify-approval-policy-verus.sh
```

## Honesty

- Person ids in the proved kernel are abstract `u64`. String trim / empty-filter remain in TypeScript and `clawql-dataplane` `policy.rs` (differential-tested, not Verus-proved).
- Do not claim “mathematically proven policy” for the whole gateway until this kernel is the sole production evaluator (ADR 0016).
