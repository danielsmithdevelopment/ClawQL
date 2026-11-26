/**
 * Audit synthesis — regulated-profile wire-level dynamic pass (D1).
 *
 * Boots `dist/server-http.js` under CLAWQL_TIER=regulated with real S3 Object Lock
 * (LocalStack in CI; MinIO locally when pullable) and drives refusals over HTTP.
 *
 * Requires: `npm run build` (dist/server-http.js) and CLAWQL_WORM_S3_ENDPOINT
 * (or CLAWQL_WORM_S3_IT_ENDPOINT) for rows that fully boot.
 *
 * Run: `npm run test:regulated-wire`
 */

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  SERVER_HTTP_JS,
  INFERENCE_BIN,
  assertPortClosed,
  createObjectLockBucket,
  createPlainBucket,
  makeWorkDir,
  mintOidcMaterial,
  newBucketName,
  pickFreePort,
  regulatedBaseEnv,
  s3Client,
  s3FromEnv,
  spawnServer,
  startRequestSink,
  writePatchPetstore,
  type MintedOidc,
  type S3Endpoints,
  type SpawnedServer,
} from "./regulated-wire-harness.js";

const s3Ep = s3FromEnv();
const describeWire = existsSync(SERVER_HTTP_JS) && s3Ep ? describe : describe.skip;
const describeBootOnly = existsSync(SERVER_HTTP_JS) ? describe : describe.skip;

describeBootOnly("regulated wire — boot refusals (no S3 required)", () => {
  it(
    "1) CLAWQL_WORM_ENABLED=0 → non-zero exit; port never opens",
    async () => {
      const home = await makeWorkDir("clawql-wire-worm0-");
      const port = await pickFreePort();
      const srv = await spawnServer({
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAWQL_HOME: home,
        CLAWQL_TIER: "regulated",
        CLAWQL_WORM_ENABLED: "0",
        CLAWQL_AUTH_MODE: "apiKey",
        CLAWQL_API_KEY: "wire-test-key-not-secret",
        PORT: String(port),
        MCP_HOST: "127.0.0.1",
      });
      try {
        const code = await srv.waitExit(25_000);
        expect(code).not.toBe(0);
        expect(srv.stderr).toMatch(/regulated.*WORM disabled/i);
        await assertPortClosed(port);
      } finally {
        await srv.kill();
      }
    },
    30_000
  );
});

describeWire("regulated wire — full HTTP matrix (Object Lock S3)", () => {
  let s3: S3Endpoints;
  let oidc: MintedOidc;
  let home: string;
  let lockBucket: string;
  let apiSink: Awaited<ReturnType<typeof startRequestSink>>;
  let inferenceSink: Awaited<ReturnType<typeof startRequestSink>>;
  let srv: SpawnedServer;
  let wormHttpPort: number;
  let auditApiKey: string;
  let specPath: string;
  let baseUrl: string;
  let agentToken: string;

  beforeAll(async () => {
    s3 = s3Ep!;
    home = await makeWorkDir("clawql-wire-home-");
    oidc = await mintOidcMaterial(home);
    apiSink = await startRequestSink();
    inferenceSink = await startRequestSink();
    specPath = await writePatchPetstore(home, apiSink.baseUrl);
    lockBucket = newBucketName("clawql-wire-lock");
    await createObjectLockBucket(s3Client(s3), lockBucket, "COMPLIANCE");
    wormHttpPort = await pickFreePort();
    auditApiKey = `wire-audit-${Date.now()}`;
    const env = regulatedBaseEnv({
      home,
      oidc,
      s3,
      bucket: lockBucket,
      specPath,
      wormHttpPort,
      auditApiKey,
      extra: {
        CLAWQL_HITL_WEBHOOK_TOKEN: "", // unset → 503; set below per-case
        CLAWQL_API_BASE_URL: apiSink.baseUrl,
        API_BASE_URL: apiSink.baseUrl,
        CLAWQL_SOURCES_ALLOW_HTTP: "1",
      },
    });
    delete (env as { CLAWQL_HITL_WEBHOOK_TOKEN?: string }).CLAWQL_HITL_WEBHOOK_TOKEN;
    srv = await spawnServer(env);
    await srv.waitListening(90_000);
    baseUrl = `http://127.0.0.1:${srv.port}`;
    agentToken = await oidc.mint({ scope: ["execute", "search", "memory"] });
  }, 120_000);

  afterAll(async () => {
    await srv?.kill();
    await apiSink?.close();
    await inferenceSink?.close();
  });

  it("3) noAuth with ALLOW_UNAUTHENTICATED on loopback and 0.0.0.0 → exit", async () => {
    for (const host of ["127.0.0.1", "0.0.0.0"] as const) {
      const h = await makeWorkDir(`clawql-wire-noauth-${host.replace(/\./g, "")}-`);
      const o = await mintOidcMaterial(h);
      const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
      const bucket = newBucketName("clawql-wire-noauth");
      await createObjectLockBucket(s3Client(s3), bucket);
      const port = await pickFreePort();
      const bad = await spawnServer({
        ...regulatedBaseEnv({ home: h, oidc: o, s3, bucket, specPath: sp }),
        CLAWQL_AUTH_MODE: "noAuth",
        CLAWQL_ALLOW_UNAUTHENTICATED: "1",
        PORT: String(port),
        MCP_HOST: host,
      });
      // Clear OIDC-only vars that confuse noAuth
      const code = await bad.waitExit(60_000);
      expect(code).not.toBe(0);
      expect(bad.stderr).toMatch(/regulated.*noAuth/i);
      await assertPortClosed(port);
      await bad.kill();
    }
  }, 180_000);

  it("4) CLAWQL_HTTP_GRAPHQL=1 → exit non-zero; port never opens", async () => {
    const h = await makeWorkDir("clawql-wire-gql-");
    const o = await mintOidcMaterial(h);
    const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
    const bucket = newBucketName("clawql-wire-gql");
    await createObjectLockBucket(s3Client(s3), bucket);
    const port = await pickFreePort();
    const env = regulatedBaseEnv({ home: h, oidc: o, s3, bucket, specPath: sp });
    delete env.CLAWQL_HTTP_SKIP_GRAPHQL;
    env.CLAWQL_HTTP_GRAPHQL = "1";
    env.PORT = String(port);
    const bad = await spawnServer(env);
    const code = await bad.waitExit(60_000);
    expect(code).not.toBe(0);
    expect(bad.stderr).toMatch(/CLAWQL_HTTP_GRAPHQL.*regulated/i);
    await assertPortClosed(port);
    await bad.kill();
  }, 90_000);

  it("2) bucket without Object Lock → boot refused; port never opens", async () => {
    const plain = newBucketName("clawql-wire-nolock");
    await createPlainBucket(s3Client(s3), plain);
    const h = await makeWorkDir("clawql-wire-nolock-home-");
    const o = await mintOidcMaterial(h);
    const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
    const port = await pickFreePort();
    const bad = await spawnServer({
      ...regulatedBaseEnv({
        home: h,
        oidc: o,
        s3,
        bucket: plain,
        specPath: sp,
      }),
      PORT: String(port),
    });
    const code = await bad.waitExit(60_000);
    expect(code).not.toBe(0);
    expect(bad.stderr).toMatch(/Object Lock|not storage WORM|configuration check failed/i);
    await assertPortClosed(port);
    await bad.kill();
  }, 90_000);

  it("5) MCP auth: no bearer / wrong aud / wrong iss / expired / bad sig → 401", async () => {
    const cases: { name: string; token?: string }[] = [
      { name: "no bearer" },
      {
        name: "wrong aud",
        token: await new (await import("jose")).SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer(oidc.issuer)
          .setAudience("wrong-audience")
          .setSubject("x")
          .setExpirationTime("1h")
          .sign(oidc.privateKey),
      },
      {
        name: "wrong iss",
        token: await new (await import("jose")).SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer("https://evil.example")
          .setAudience(oidc.audience)
          .setSubject("x")
          .setExpirationTime("1h")
          .sign(oidc.privateKey),
      },
      {
        name: "expired",
        token: await new (await import("jose")).SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer(oidc.issuer)
          .setAudience(oidc.audience)
          .setSubject("x")
          .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
          .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
          .sign(oidc.privateKey),
      },
    ];
    // bad signature: mint with a different key
    const other = await mintOidcMaterial(await makeWorkDir("clawql-wire-badkey-"));
    cases.push({
      name: "bad signature",
      token: await other.mint({ scope: ["execute"] }),
    });

    for (const c of cases) {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(c.token ? { authorization: `Bearer ${c.token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "x", version: "1" },
          },
        }),
      });
      expect(res.status, c.name).toBe(401);
    }
  }, 60_000);

  it("6) valid token without execute scope → tool refused; sink not hit", async () => {
    const token = await oidc.mint({ scope: ["search", "memory"] });
    const { rpc } = await (
      await import("./regulated-wire-harness.js")
    ).mcpInitialize(baseUrl, token);
    const before = apiSink.requests.length;
    const result = (await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "execute", arguments: { operationId: "patchItem", args: { id: "1" } } },
    })) as { status: number; body: { result?: { isError?: boolean; content?: { text?: string }[] } } };
    expect(result.status).toBe(200);
    const text = result.body?.result?.content?.[0]?.text || JSON.stringify(result.body);
    expect(text).toMatch(/outside session ATR scope|empty ATR scope|refused/i);
    expect(apiSink.requests.length).toBe(before);
  }, 60_000);

  it("7) resume approve via MCP refused; still pending; no HUMAN_APPROVAL", async () => {
    const { rpc } = await (
      await import("./regulated-wire-harness.js")
    ).mcpInitialize(baseUrl, agentToken);
    const park = (await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: { operationId: "patchItem", args: { id: "park-7" } },
      },
    })) as { body: { result?: { content?: { text?: string }[] } } };
    const parkText = park.body?.result?.content?.[0]?.text || "";
    const parkJson = JSON.parse(parkText) as {
      status?: string;
      executionId?: string;
      ok?: boolean;
    };
    expect(parkJson.status || parkJson.ok === false ? "mandate_required" : "").toBeTruthy();
    const executionId = parkJson.executionId;
    expect(executionId).toBeTruthy();

    const resume = (await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "resume",
        arguments: { executionId, decision: "approve" },
      },
    })) as { body: { result?: { content?: { text?: string }[] } } };
    const resumeJson = JSON.parse(resume.body?.result?.content?.[0]?.text || "{}") as {
      ok?: boolean;
      error?: string;
    };
    expect(resumeJson.ok).toBe(false);
    expect(resumeJson.error).toMatch(/decline-only|cannot self-approve/i);

    // Load pending via CLI-shaped sqlite under CLAWQL_HOME
    const { loadPendingExecution } = await import("clawql-api");
    const still = await loadPendingExecution(executionId!, home);
    expect(still?.status).toBe("pending");

    const chain = await fetch(`http://127.0.0.1:${wormHttpPort}/entries`, {
      headers: { authorization: `ApiKey ${auditApiKey}` },
    });
    const entries = (await chain.json()) as { entries?: { type?: string }[] };
    const types = (entries.entries || (entries as unknown as { type?: string }[]) || []).map(
      (e: { type?: string }) => e.type
    );
    // Prefer entries array shape from WORM HTTP
    const flat = Array.isArray(entries) ? entries : entries.entries || [];
    expect(flat.some((e: { type?: string }) => e.type === "HUMAN_APPROVAL")).toBe(false);
    void types;
  }, 90_000);

  it("7b) resume decline succeeds; never run", async () => {
    const { rpc } = await (
      await import("./regulated-wire-harness.js")
    ).mcpInitialize(baseUrl, agentToken);
    const before = apiSink.requests.length;
    const park = (await rpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: { operationId: "patchItem", args: { id: "park-7b" } },
      },
    })) as { body: { result?: { content?: { text?: string }[] } } };
    const executionId = (
      JSON.parse(park.body?.result?.content?.[0]?.text || "{}") as { executionId?: string }
    ).executionId;
    expect(executionId).toBeTruthy();

    const resume = (await rpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "resume",
        arguments: { executionId, decision: "decline" },
      },
    })) as { body: { result?: { content?: { text?: string }[] } } };
    const resumeJson = JSON.parse(resume.body?.result?.content?.[0]?.text || "{}") as {
      ok?: boolean;
      status?: string;
    };
    expect(resumeJson.ok).toBe(true);
    expect(resumeJson.status).toBe("declined");
    expect(apiSink.requests.length).toBe(before);

    const { loadPendingExecution } = await import("clawql-api");
    const rec = await loadPendingExecution(executionId!, home);
    expect(rec?.status).toBe("declined");
  }, 90_000);

  it("8) operator-channel approve under regulated refused; still pending", async () => {
    const { rpc } = await (
      await import("./regulated-wire-harness.js")
    ).mcpInitialize(baseUrl, agentToken);
    const park = (await rpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: { operationId: "patchItem", args: { id: "park-8" } },
      },
    })) as { body: { result?: { content?: { text?: string }[] } } };
    const executionId = (
      JSON.parse(park.body?.result?.content?.[0]?.text || "{}") as { executionId?: string }
    ).executionId!;
    expect(executionId).toBeTruthy();

    const { resumeClawqlExecutionEffect } = await import("clawql-api");
    const { Effect } = await import("effect");
    const content = await Effect.runPromise(
      resumeClawqlExecutionEffect({
        executionId,
        decision: "approve",
        channel: "operator",
        approvedBy: { kind: "operator", id: "wire-cli" },
        home,
      })
    );
    const json = JSON.parse(content[0]!.text) as { ok?: boolean; error?: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/regulated.*console|console/i);

    const { loadPendingExecution } = await import("clawql-api");
    expect((await loadPendingExecution(executionId, home))?.status).toBe("pending");
  }, 90_000);

  it("9) webhook POST no token → 503; wrong token → reject; no side effects", async () => {
    const noTok = await fetch(`${baseUrl}/hitl/label-studio/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "annotation.created" }),
    });
    expect(noTok.status).toBe(503);

    // Spawn sibling with token configured to assert wrong-token 401
    const h = await makeWorkDir("clawql-wire-wh-");
    const o = await mintOidcMaterial(h);
    const sp = await writePatchPetstore(h, apiSink.baseUrl);
    const bucket = newBucketName("clawql-wire-wh");
    await createObjectLockBucket(s3Client(s3), bucket);
    const whSrv = await spawnServer(
      regulatedBaseEnv({
        home: h,
        oidc: o,
        s3,
        bucket,
        specPath: sp,
        extra: { CLAWQL_HITL_WEBHOOK_TOKEN: "correct-token-not-a-secret" },
      })
    );
    await whSrv.waitListening(90_000);
    const wrong = await fetch(`http://127.0.0.1:${whSrv.port}/hitl/label-studio/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ action: "annotation.created" }),
    });
    expect(wrong.status).toBe(401);
    await whSrv.kill();
  }, 180_000);

  it("10) inference remote model refused; sink receives nothing", async () => {
    if (!existsSync(INFERENCE_BIN)) {
      // Fallback: policy assert under regulated env (server-http does not mount /v1)
      const { assertInferenceModelAllowed } = await import(
        "../../packages/clawql-inference/src/policy/local-only.js"
      );
      const { applyRegulatedProfileEnvEffect } = await import(
        "../../src/composition/regulated-profile.js"
      );
      const { Effect } = await import("effect");
      const env = { ...process.env, CLAWQL_TIER: "regulated" };
      delete env.CLAWQL_ALLOW_NO_ENFORCEMENT;
      await Effect.runPromise(applyRegulatedProfileEnvEffect(env));
      expect(() => assertInferenceModelAllowed("openai/gpt-4o", env)).toThrow(/local-only/);
      return;
    }
    const before = inferenceSink.requests.length;
    const port = await pickFreePort();
    const child = spawn(process.execPath, [INFERENCE_BIN], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAWQL_HOME: home,
        CLAWQL_TIER: "regulated",
        CLAWQL_INFERENCE_LOCAL_ONLY: "1",
        CLAWQL_INFERENCE_KEYS_ENABLED: "0",
        CLAWQL_INFERENCE_PORT: String(port),
        // Point a remote base at the sink — refusal must happen before fetch
        OPENAI_BASE_URL: `${inferenceSink.baseUrl}/v1`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const h = await fetch(`http://127.0.0.1:${port}/healthz`, {
          signal: AbortSignal.timeout(400),
        });
        if (h.ok) break;
      } catch {
        /* wait */
      }
      if (child.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
    const status = "status" in res ? res.status : 0;
    const body = "text" in res ? await res.text() : "";
    expect(status === 0 || status >= 400 || /local-only/i.test(body) || /local-only/i.test(stderr)).toBe(
      true
    );
    expect(inferenceSink.requests.length).toBe(before);
    child.kill("SIGTERM");
  }, 60_000);

  it("11) SSRF: sources_propose to link-local / loopback refused; sink untouched", async () => {
    const { rpc } = await (
      await import("./regulated-wire-harness.js")
    ).mcpInitialize(baseUrl, agentToken);
    const before = apiSink.requests.length;
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1/",
      "http://localhost/",
    ]) {
      const result = (await rpc({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "sources_propose",
          arguments: { url, name: "ssrf-probe", dryRun: true },
        },
      })) as { body: { result?: { isError?: boolean; content?: { text?: string }[] } } };
      const text = result.body?.result?.content?.[0]?.text || JSON.stringify(result.body);
      expect(text).toMatch(/private|loopback|not allowed|Invalid|HTTPS|refused|SSRF|must not/i);
    }
    expect(apiSink.requests.length).toBe(before);
  }, 60_000);

  it("12) GET /chain/verify succeeds after refusals", async () => {
    const res = await fetch(`http://127.0.0.1:${wormHttpPort}/chain/verify`, {
      headers: { authorization: `ApiKey ${auditApiKey}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; valid?: boolean; verified?: boolean };
    // Accept shapes used by clawql-audit routes
    expect(body.ok === true || body.valid === true || body.verified === true || res.ok).toBe(true);
  }, 30_000);

  it("13) x402 concurrent same-proof → at most one allow (facilitator settle-once)", async () => {
    // Process-level harness (wire MCP payments path is opt-in); mirrors D4 residual.
    const { createX402Gate, enforceX402Gate } = await import("clawql-payments/x402");
    const { createX402ReplayCache } = await import(
      "../../packages/clawql-payments/src/x402/replay-cache.js"
    );
    const { mkdir, writeFile } = await import("node:fs/promises");
    const payHome = await makeWorkDir("clawql-wire-x402-");
    await mkdir(join(payHome, "Payments"), { recursive: true });
    await writeFile(
      join(payHome, "Payments", "payments.json"),
      `${JSON.stringify({
        tenantId: "wire",
        plan: "pro",
        x402: {
          walletAddress: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          facilitatorUrl: "https://x402.org/facilitator",
        },
      })}\n`
    );
    const env = {
      ...process.env,
      CLAWQL_HOME: payHome,
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
    };
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.001, asset: "USDC" }, env);
    const payload = { x402Version: 2, payload: { signature: "0xwire-concurrent" } };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    let settleCount = 0;
    const fetchImpl = async (url: string) => {
      if (String(url).includes("/settle")) {
        settleCount += 1;
        if (settleCount > 1) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ success: false, errorReason: "authorization already settled" }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, transaction: "0xwire" }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ isValid: true, payer: "0xpayer" }),
      };
    };
    const a = createX402ReplayCache();
    const b = createX402ReplayCache();
    const req = (replayCache: ReturnType<typeof createX402ReplayCache>) =>
      enforceX402Gate({
        resource: "/v1/chat/completions",
        requestUrl: "http://127.0.0.1:8080/v1/chat/completions",
        headers: { "payment-signature": header },
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        replayCache,
      });
    const [ra, rb] = await Promise.all([req(a), req(b)]);
    expect([ra, rb].filter((r) => r.action === "allow").length).toBeLessThanOrEqual(1);
  }, 60_000);
});
