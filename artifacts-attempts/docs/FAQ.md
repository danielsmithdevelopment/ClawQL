# FAQ — judges & operators

## Do I need Cloudflare to run the demo?

No. `npm run demo:judge-smoke` uses real git notes, real vitest, and a dry-run Arweave directory. Live Artifacts / Turbo / gradual deploy need Workers Paid credentials (`ATTEMPTS_E2E=1`).

## Are the replay patches “mocks”?

No. Replay means the **agent edit** is a recorded patch (`agent.client: "replay"`). Forks, tokens, notes, tests, policy, merge, Merkle verify, and canary status are live local witnesses.

## When does auto-merge happen?

Only when `/v1/decisions` (or the local calibrated stub) returns `calibrated: true`, confidence ≥ 0.9, winner tests clean, and policy clean. Otherwise the approval page is required. See board `trustReason`.

## Where is canary %?

- File: `.local/.../canary/status.json`
- Board panel after `board:hydrate` / `board:hydrate-from`
- Verify: `node cli/verify/dist/cli.js --canary <status.json>`
- Live request body (no network until creds): `buildGradualDeployRequest` in `@artifacts-attempts/pipeline`

## How do I film?

1. `npm run demo:film-preflight`
2. `npm run demo:record-prep` → **GATE PASS**
3. Follow [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md)

## How do I publish a public repo?

Agents cannot create the GitHub repository. Follow [`STANDALONE.md`](./STANDALONE.md) after a human creates it.
