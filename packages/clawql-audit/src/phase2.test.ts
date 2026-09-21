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

describe("WORMAuditTrail Merkle batch sealing", () => {
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

describe("Audit HTTP ApiKey routes (handleAuditHttpRequest)", () => {
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

  it("listens and serves /chain/verify when httpPort + apiKey are set", async () => {
    const { createServer } = await import("node:net");
    const port = await new Promise<number>((resolve, reject) => {
      const s = createServer();
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        const p = typeof addr === "object" && addr ? addr.port : 0;
        s.close((err) => (err ? reject(err) : resolve(p)));
      });
      s.once("error", reject);
    });

    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
      httpPort: port,
      apiKey: "live-key",
    });
    try {
      await worm.append({
        type: "SESSION_START",
        timestamp: "2026-08-01T12:00:00.000Z",
        sessionId: "live_http",
      });
      const res = await fetch(`http://127.0.0.1:${port}/chain/verify`, {
        headers: { authorization: "ApiKey live-key" },
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { valid: boolean }).valid).toBe(true);
    } finally {
      await worm.stop();
    }
  });

  it("fails create when httpPort is set without apiKey", async () => {
    const prev = process.env.CLAWQL_AUDIT_API_KEY;
    delete process.env.CLAWQL_AUDIT_API_KEY;
    try {
      await expect(
        WORMAuditTrail.create({
          local: new MemoryBackend(),
          remote: new MemoryBackend(),
          ...trailDefaults,
          httpPort: 19_111,
        })
      ).rejects.toThrow(/apiKey|unauthenticated/i);
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_AUDIT_API_KEY;
      else process.env.CLAWQL_AUDIT_API_KEY = prev;
    }
  });
});

describe("QR export (exportToQR + HTTP /export/qr)", () => {
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
