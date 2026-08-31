import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  MemoryBackend,
  WORMAuditTrail,
  exportToQR,
  handleAuditHttpRequest,
  createWORMAuditTrailEffect,
} from "./index.js";

const trailDefaults = {
  retryMaxAttempts: 2,
  retryBackoffMs: 1,
  reconcileIntervalMs: 0,
  merkleBatchSize: 0,
} as const;

const qrKeys = {
  encryptionKeyHex: "11".repeat(32),
  hmacKeyHex: "22".repeat(32),
};

describe("Phase 2 — Merkle root persistence", () => {
  it("auto-seals roots every N appends and lists them", async () => {
    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
      merkleBatchSize: 2,
    });
    await worm.append({
      type: "SESSION_START",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "sess_m",
    });
    expect(await worm.listMerkleRoots()).toHaveLength(0);
    await worm.append({
      type: "TOOL_CALL_ATTEMPT",
      timestamp: "2026-08-01T12:00:01.000Z",
      sessionId: "sess_m",
    });
    const roots = await worm.listMerkleRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]!.entryCount).toBe(2);
    await worm.stop();
  });
});

describe("Phase 2 — HTTP ApiKey routes", () => {
  it("rejects missing key and serves append/query/verify", async () => {
    const service = await Effect.runPromise(
      createWORMAuditTrailEffect({
        local: new MemoryBackend(),
        remote: new MemoryBackend(),
        ...trailDefaults,
      })
    );

    const unauthorized = await Effect.runPromise(
      handleAuditHttpRequest(
        { method: "GET", url: "/entries", headers: {} },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(unauthorized.status).toBe(401);

    const created = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: "POST",
          url: "/entries",
          headers: { authorization: "ApiKey secret" },
          body: {
            type: "SESSION_START",
            timestamp: "2026-08-01T12:00:00.000Z",
            sessionId: "http_sess",
          },
        },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(created.status).toBe(201);

    const listed = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: "GET",
          url: "/entries?sessionId=http_sess",
          headers: { authorization: "ApiKey secret" },
        },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(listed.status).toBe(200);
    expect((listed.body as { total: number }).total).toBe(1);

    const verified = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: "GET",
          url: "/chain/verify",
          headers: { authorization: "ApiKey secret" },
        },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(verified.status).toBe(200);
    expect((verified.body as { valid: boolean }).valid).toBe(true);

    await Effect.runPromise(service.stop());
  });

  it("starts HTTP when httpPort is set", async () => {
    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
      httpPort: 0,
      apiKey: "live-key",
    });
    await worm.append({
      type: "SESSION_START",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "live_http",
    });
    await worm.stop();
  });
});

describe("Phase 2 — QR export", () => {
  it("exports CBOR/RaptorQ/ChaCha20/HMAC QR chunks when keys are set", async () => {
    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
    });
    await worm.append({
      type: "SESSION_START",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "sess_qr",
    });
    const entries = await worm.query({});
    const result = await Effect.runPromise(
      exportToQR(entries, {
        ...qrKeys,
        chunkSizeBytes: 256,
        redundancy: 1.5,
        // Let qrcode pick version; encrypted fountain packets exceed V10 capacity.
      })
    );
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.qrCodes[0]).toMatch(/^data:image\/png;base64,/);
    expect(result.chainRoot).toBe(entries[entries.length - 1]!.hash);
    await worm.stop();
  }, 30_000);

  it("HTTP /export/qr returns 503 without env keys and rejects body keys", async () => {
    const service = await Effect.runPromise(
      createWORMAuditTrailEffect({
        local: new MemoryBackend(),
        remote: new MemoryBackend(),
        ...trailDefaults,
      })
    );
    const prevEnc = process.env.CLAWQL_AUDIT_QR_ENCRYPTION_KEY;
    const prevHmac = process.env.CLAWQL_AUDIT_QR_HMAC_KEY;
    delete process.env.CLAWQL_AUDIT_QR_ENCRYPTION_KEY;
    delete process.env.CLAWQL_AUDIT_QR_HMAC_KEY;

    const missing = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: "POST",
          url: "/export/qr",
          headers: { authorization: "ApiKey secret" },
          body: { filter: {} },
        },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(missing.status).toBe(503);

    const badBody = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: "POST",
          url: "/export/qr",
          headers: { authorization: "ApiKey secret" },
          body: { encryptionKey: "nope" },
        },
        { trail: service, apiKey: "secret" }
      )
    );
    expect(badBody.status).toBe(400);

    if (prevEnc !== undefined) process.env.CLAWQL_AUDIT_QR_ENCRYPTION_KEY = prevEnc;
    else delete process.env.CLAWQL_AUDIT_QR_ENCRYPTION_KEY;
    if (prevHmac !== undefined) process.env.CLAWQL_AUDIT_QR_HMAC_KEY = prevHmac;
    else delete process.env.CLAWQL_AUDIT_QR_HMAC_KEY;
    await Effect.runPromise(service.stop());
  });
});
