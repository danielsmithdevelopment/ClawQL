# x402 unlock → private Artifacts delivery

**Priority:** only after live Artifacts forks work (Oct 12 gate). Optional 30–45s closing beat.

## Design

1. **Arweave holds ciphertext** — permanent, public, verifiable. Manifest publishes `plaintextSha256` + cipher meta, never the key.
2. **Worker sells access over x402** — `GET /unlock` → HTTP 402 + `PAYMENT-REQUIRED`. Buyer pays USDC (demo: Base Sepolia), retries with `PAYMENT-SIGNATURE`.
3. **After payment, private Artifacts repo** — Worker decrypts with the held key, stamps a **buyer-named manifest + fingerprint**, creates a private Artifacts repo + scoped token for that buyer.

## What cannot be done

Once a buyer has plaintext, they can leak it. Lit does not change that. Arweave makes a leaked re-upload permanent too.

**Mitigations (deterrence, not DRM):**

- Per-buyer Artifacts copy + `buyer-manifest.json` naming them  
- Fingerprint markers in text/code files (`BUYER.txt` + comment stamps)  
- License terms for traced leaks  
- For secrets that must not leak: sell **use**, not plaintext (out of scope for this beat)

## Lit vs Worker key

Contest demo: **Worker-held key** (Cloudflare-native, fewer moving parts). Lit threshold decryption is a later upgrade if buyers need trust-minimized custody.

## Local dry-run

```bash
npm run demo:unlock-dry
# writes .local/unlock/{ciphertext.*,buyer-copy/}
```

## Live (after CF + Base Sepolia)

1. Set `UNLOCK_PAY_TO`, `UNLOCK_CONTENT_KEY_HEX`, `X402_FACILITATOR_URL` (Coinbase / x402.org).  
2. Deploy `workers/unlock`.  
3. On camera: pay $0.01 testnet → show buyer Artifacts repo. Label **Base Sepolia**.

Package: `@artifacts-attempts/unlock` · Worker: `workers/unlock`.
