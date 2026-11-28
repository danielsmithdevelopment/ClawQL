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
  connectRemoteRequestSink,
  createObjectLockBucket,
  createPlainBucket,
  isWireRemote,
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
  toolResultText,
  mcpInitialize,
  type MintedOidc,
  type RemoteRequestSink,
  type RequestSink,
  type S3Endpoints,
  type SpawnedServer,
} from "./regulated-wire-harness.js";

const remote = isWireRemote();
const s3Ep = s3FromEnv();
const remoteBaseUrl = process.env.CLAWQL_WIRE_BASE_URL?.trim() || "";
const remoteAuditUrl = process.env.CLAWQL_WIRE_AUDIT_URL?.trim() || "";
const remoteAuditKey = process.env.CLAWQL_WIRE_AUDIT_API_KEY?.trim() || "";
const remoteSinkUrl = process.env.CLAWQL_WIRE_SINK_URL?.trim() || "";
const remoteKeyPath = process.env.CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH?.trim() || "";

if (process.env.CLAWQL_WIRE_REQUIRED?.trim() === "1") {
  if (remote) {
    if (!remoteBaseUrl) {
      throw new Error("CLAWQL_WIRE_REQUIRED=1 + remote requires CLAWQL_WIRE_BASE_URL");
    }
    if (!remoteKeyPath || !existsSync(remoteKeyPath)) {
      throw new Error(
        "CLAWQL_WIRE_REQUIRED=1 + remote requires CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH"
      );
    }
  } else {
    if (!existsSync(SERVER_HTTP_JS)) {
      throw new Error(
        "CLAWQL_WIRE_REQUIRED=1 but dist/server-http.js is missing — run npm run build"
      );
    }
    if (!s3Ep) {
      throw new Error(
        "CLAWQL_WIRE_REQUIRED=1 but CLAWQL_WORM_S3_ENDPOINT (or IT endpoint) is unset"
      );
    }
  }
}
const describeWire = remote
  ? remoteBaseUrl
    ? describe
    : describe.skip
  : existsSync(SERVER_HTTP_JS) && s3Ep
    ? describe
    : describe.skip;
const describeBootOnly = remote || !existsSync(SERVER_HTTP_JS) ? describe.skip : describe;

describeBootOnly("regulated wire — boot refusals (no S3 required)", () => {
  it("1) CLAWQL_WORM_ENABLED=0 → non-zero exit; port never opens", async () => {
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
  }, 30_000);

  it("1b) CLAWQL_SOURCES_ALLOW_HTTP=1 → non-zero exit; port never opens", async () => {
    const home = await makeWorkDir("clawql-wire-allow-http-");
    const port = await pickFreePort();
    const srv = await spawnServer({
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CLAWQL_HOME: home,
      CLAWQL_TIER: "regulated",
      CLAWQL_WORM_ENABLED: "1",
      CLAWQL_WORM_REQUIRED: "1",
      CLAWQL_SOURCES_ALLOW_HTTP: "1",
      CLAWQL_AUTH_MODE: "apiKey",
      CLAWQL_API_KEY: "wire-test-key-not-secret",
      PORT: String(port),
      MCP_HOST: "127.0.0.1",
    });
    try {
      const code = await srv.waitExit(25_000);
      expect(code).not.toBe(0);
      expect(srv.stderr).toMatch(/SOURCES_ALLOW_HTTP/i);
      await assertPortClosed(port);
    } finally {
      await srv.kill();
    }
  }, 30_000);
});

describeWire("regulated wire — full HTTP matrix (Object Lock S3)", () => {
  let s3: S3Endpoints | null;
  let oidc: MintedOidc;
  let home: string;
  let lockBucket: string;
  let apiSink: RequestSink | RemoteRequestSink;
  let inferenceSink: RequestSink | null;
  let srv: SpawnedServer | null;
  let wormHttpPort: number;
  let auditApiKey: string;
  let auditBaseUrl: string;
  let specPath: string;
  let baseUrl: string;
  let agentToken: string;

  beforeAll(async () => {
    home = await makeWorkDir("clawql-wire-home-");
    if (remote) {
      console.log(
        "CLAWQL_WIRE_TARGET=remote — spawn-only rows 1/1b/2/3/4/8/10/13 skipped by design; " +
          "row 8 runs via kubectl exec in the kind driver"
      );
      oidc = await mintOidcMaterial(home, {
        privateKeyPemPath: remoteKeyPath,
        alg: "ES256",
        kid: process.env.CLAWQL_WIRE_OIDC_KID?.trim() || "kind-wire",
        issuer:
          process.env.CLAWQL_WIRE_OIDC_ISSUER?.trim() ||
          "http://clawql-jwks.clawql.svc.cluster.local",
        audience: process.env.CLAWQL_WIRE_OIDC_AUDIENCE?.trim() || "clawql-mcp",
      });
      baseUrl = remoteBaseUrl.replace(/\/$/, "");
      if (!remoteSinkUrl) {
        throw new Error("remote mode requires CLAWQL_WIRE_SINK_URL");
      }
      apiSink = await connectRemoteRequestSink(remoteSinkUrl);
      inferenceSink = null;
      srv = null;
      s3 = null;
      lockBucket = "";
      specPath = "";
      wormHttpPort = 0;
      auditApiKey = remoteAuditKey || "kind-wire-audit-key";
      auditBaseUrl = (remoteAuditUrl || "").replace(/\/$/, "");
      agentToken = await oidc.mint({
        scope: ["execute", "search", "memory", "sources_propose", "patchItem", "resume", "core"],
      });
      // Positive control: valid token must get tools/list 200 before negatives.
      const { rpc } = await mcpInitialize(baseUrl, agentToken);
      const listed = await rpc({
        jsonrpc: "2.0",
        id: 99,
        method: "tools/list",
        params: {},
      });
      expect(listed.status, "remote positive control tools/list").toBe(200);
      return;
    }

    s3 = s3Ep!;
    oidc = await mintOidcMaterial(home);
    apiSink = await startRequestSink();
    inferenceSink = await startRequestSink();
    specPath = await writePatchPetstore(home, apiSink.baseUrl);
    lockBucket = newBucketName("clawql-wire-lock");
    await createObjectLockBucket(s3Client(s3), lockBucket, "COMPLIANCE");
    wormHttpPort = await pickFreePort();
    auditApiKey = `wire-audit-${Date.now()}`;
    auditBaseUrl = `http://127.0.0.1:${wormHttpPort}`;
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
      },
    });
    delete (env as { CLAWQL_HITL_WEBHOOK_TOKEN?: string }).CLAWQL_HITL_WEBHOOK_TOKEN;
    srv = await spawnServer(env);
    await srv.waitListening(90_000);
    baseUrl = `http://127.0.0.1:${srv.port}`;
    // Capability lifecycle (default-on) resolves execute → inner operationId
    // (patchItem) and checks session_catalog∩ATR. Seed both the OpenAPI op and
    // resume/core so park + MCP resume are reachable; refusals under test are
    // channel/regulated gates, not the three-bucket catalog.
    agentToken = await oidc.mint({
      scope: ["execute", "search", "memory", "sources_propose", "patchItem", "resume", "core"],
    });
  }, 120_000);

  afterAll(async () => {
    await srv?.kill();
    await apiSink?.close();
    await inferenceSink?.close();
  });

  it("remote skip inventory (visible by design)", () => {
    if (!remote) return;
    const skipped = [
      "1/1b/2/3/4 spawn-only boot refusals (K1 + Helm render)",
      "8 CLI approve (kind driver kubectl exec)",
      "9 wrong-token sibling spawn (process-level + no-token 503 still runs)",
      "10 inference server (values-regulated inference.enabled=false)",
      "13 in-process x402 (process-level only)",
    ];
    for (const line of skipped) {
      console.log(`SKIP by design (remote): ${line}`);
    }
    expect(skipped.length).toBeGreaterThan(0);
  });

  it.skipIf(remote)(
    "3) noAuth with ALLOW_UNAUTHENTICATED on loopback and 0.0.0.0 → exit",
    async () => {
      for (const host of ["127.0.0.1", "0.0.0.0"] as const) {
        const h = await makeWorkDir(`clawql-wire-noauth-${host.replace(/\./g, "")}-`);
        const o = await mintOidcMaterial(h);
        const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
        const bucket = newBucketName("clawql-wire-noauth");
        await createObjectLockBucket(s3Client(s3!), bucket);
        const port = await pickFreePort();
        const bad = await spawnServer({
          ...regulatedBaseEnv({ home: h, oidc: o, s3: s3!, bucket, specPath: sp }),
          CLAWQL_AUTH_MODE: "noAuth",
          CLAWQL_ALLOW_UNAUTHENTICATED: "1",
          PORT: String(port),
          MCP_HOST: host,
        });
        const code = await bad.waitExit(60_000);
        expect(code).not.toBe(0);
        expect(bad.stderr).toMatch(/regulated.*noAuth/i);
        await assertPortClosed(port);
        await bad.kill();
      }
    },
    180_000
  );

  it.skipIf(remote)(
    "4) CLAWQL_HTTP_GRAPHQL=1 → exit non-zero; port never opens",
    async () => {
      const h = await makeWorkDir("clawql-wire-gql-");
      const o = await mintOidcMaterial(h);
      const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
      const bucket = newBucketName("clawql-wire-gql");
      await createObjectLockBucket(s3Client(s3!), bucket);
      const port = await pickFreePort();
      const env = regulatedBaseEnv({ home: h, oidc: o, s3: s3!, bucket, specPath: sp });
      delete env.CLAWQL_HTTP_SKIP_GRAPHQL;
      env.CLAWQL_HTTP_GRAPHQL = "1";
      env.PORT = String(port);
      const bad = await spawnServer(env);
      const code = await bad.waitExit(60_000);
      expect(code).not.toBe(0);
      expect(bad.stderr).toMatch(/CLAWQL_HTTP_GRAPHQL.*regulated/i);
      await assertPortClosed(port);
      await bad.kill();
    },
    90_000
  );

  it.skipIf(remote)(
    "2) bucket without Object Lock → boot refused; port never opens",
    async () => {
      const plain = newBucketName("clawql-wire-nolock");
      await createPlainBucket(s3Client(s3!), plain);
      const h = await makeWorkDir("clawql-wire-nolock-home-");
      const o = await mintOidcMaterial(h);
      const sp = await writePatchPetstore(h, "http://127.0.0.1:9");
      const port = await pickFreePort();
      const bad = await spawnServer({
        ...regulatedBaseEnv({
          home: h,
          oidc: o,
          s3: s3!,
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
    },
    90_000
  );

  it("5) MCP auth: no bearer / wrong aud / wrong iss / expired / bad sig → 401", async () => {
    const { SignJWT } = await import("jose");
    const hdr: { alg: "RS256" | "ES256"; kid?: string } = { alg: oidc.alg };
    if (oidc.kid) hdr.kid = oidc.kid;
    const cases: { name: string; token?: string }[] = [
      { name: "no bearer" },
      {
        name: "wrong aud",
        token: await new SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader(hdr)
          .setIssuer(oidc.issuer)
          .setAudience("wrong-audience")
          .setSubject("x")
          .setExpirationTime("1h")
          .sign(oidc.privateKey),
      },
      {
        name: "wrong iss",
        token: await new SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader(hdr)
          .setIssuer("https://evil.example")
          .setAudience(oidc.audience)
          .setSubject("x")
          .setExpirationTime("1h")
          .sign(oidc.privateKey),
      },
      {
        name: "expired",
        token: await new SignJWT({ atr: { scope: ["execute"] } })
          .setProtectedHeader(hdr)
          .setIssuer(oidc.issuer)
          .setAudience(oidc.audience)
          .setSubject("x")
          .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
          .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
          .sign(oidc.privateKey),
      },
    ];
    // bad signature: mint with a different key (same alg)
    const other = await mintOidcMaterial(await makeWorkDir("clawql-wire-badkey-"), {
      alg: oidc.alg,
      issuer: oidc.issuer,
      audience: oidc.audience,
    });
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
    const { rpc } = await mcpInitialize(baseUrl, token);
    if ("refresh" in apiSink) await apiSink.refresh();
    const before = apiSink.requests.length;
    const result = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "execute", arguments: { operationId: "patchItem", args: { id: "1" } } },
    });
    expect(result.status).toBe(200);
    expect(toolResultText(result.body)).toMatch(
      /outside session ATR scope|empty ATR scope|refused/i
    );
    if ("refresh" in apiSink) await apiSink.refresh();
    expect(apiSink.requests.length).toBe(before);
  }, 60_000);

  it("7) resume approve via MCP refused; still pending; no HUMAN_APPROVAL", async () => {
    const { rpc } = await mcpInitialize(baseUrl, agentToken);
    const park = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: { operationId: "patchItem", args: { id: "park-7" } },
      },
    });
    const parkText = toolResultText(park.body);
    expect(parkText, `park response: ${parkText}`).not.toMatch(/CAPABILITY_WRITE_INTERCEPTED/i);
    const parkJson = JSON.parse(parkText) as {
      status?: string;
      executionId?: string;
      ok?: boolean;
    };
    expect(parkJson.status).toBe("mandate_required");
    const executionId = parkJson.executionId;
    expect(executionId).toMatch(/^pex_/);

    const resume = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "resume",
        arguments: { executionId, decision: "approve" },
      },
    });
    const resumeText = toolResultText(resume.body);
    expect(resumeText, `resume response: ${resumeText}`).not.toMatch(
      /CAPABILITY_WRITE_INTERCEPTED/i
    );
    const resumeJson = JSON.parse(resumeText) as {
      ok?: boolean;
      error?: string;
    };
    expect(resumeJson.ok).toBe(false);
    expect(resumeJson.error).toMatch(/decline-only|cannot self-approve/i);

    if (remote) {
      // Shared CLAWQL_HOME is on the MCP pod; prove still-pending by a second
      // decline-capable resume after the refused approve (execution must remain open).
      const stillOpen = await rpc({
        jsonrpc: "2.0",
        id: 41,
        method: "tools/call",
        params: {
          name: "resume",
          arguments: { executionId, decision: "approve" },
        },
      });
      const stillText = toolResultText(stillOpen.body);
      expect(stillText).toMatch(/decline-only|cannot self-approve/i);
    } else {
      const { loadPendingExecution } = await import("clawql-api");
      const still = await loadPendingExecution(executionId!, home);
      expect(still?.status).toBe("pending");
    }

    expect(auditBaseUrl, "auditBaseUrl for /entries").toBeTruthy();
    const chain = await fetch(`${auditBaseUrl}/entries`, {
      headers: { authorization: `ApiKey ${auditApiKey}` },
    });
    const entries = await chain.json();
    const flat = Array.isArray(entries)
      ? entries
      : ((entries as { entries?: { type?: string }[] }).entries ?? []);
    expect(flat.length, "WORM /entries must be non-empty after park+resume").toBeGreaterThan(0);
    expect(flat.some((e: { type?: string }) => e.type === "HUMAN_APPROVAL")).toBe(false);
  }, 90_000);

  it("7b) resume decline succeeds; never run", async () => {
    const { rpc } = await mcpInitialize(baseUrl, agentToken);
    if ("refresh" in apiSink) await apiSink.refresh();
    const before = apiSink.requests.length;
    const park = await rpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: { operationId: "patchItem", args: { id: "park-7b" } },
      },
    });
    const park7b = toolResultText(park.body);
    expect(park7b, `park response: ${park7b}`).not.toMatch(/CAPABILITY_WRITE_INTERCEPTED/i);
    const park7bJson = JSON.parse(park7b) as { status?: string; executionId?: string };
    expect(park7bJson.status).toBe("mandate_required");
    const executionId = park7bJson.executionId;
    expect(executionId).toMatch(/^pex_/);

    const resume = await rpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "resume",
        arguments: { executionId, decision: "decline" },
      },
    });
    const resumeJson = JSON.parse(toolResultText(resume.body)) as {
      ok?: boolean;
      status?: string;
    };
    expect(resumeJson.ok).toBe(true);
    expect(resumeJson.status).toBe("declined");
    if ("refresh" in apiSink) await apiSink.refresh();
    expect(apiSink.requests.length).toBe(before);

    if (!remote) {
      const { loadPendingExecution } = await import("clawql-api");
      const rec = await loadPendingExecution(executionId!, home);
      expect(rec?.status).toBe("declined");
    }
  }, 90_000);

  it.skipIf(remote)(
    "8) operator channel via CLI — approve under regulated refused; still pending",
    async () => {
      // F5: spawn `clawql resume` against the same CLAWQL_HOME (not in-process Effect).
      const { rpc } = await mcpInitialize(baseUrl, agentToken);
      const park = await rpc({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "execute",
          arguments: { operationId: "patchItem", args: { id: "park-8" } },
        },
      });
      const parkText = toolResultText(park.body);
      expect(parkText, `park response: ${parkText}`).not.toMatch(/CAPABILITY_WRITE_INTERCEPTED/i);
      const executionId = (JSON.parse(parkText) as { executionId?: string }).executionId!;
      expect(executionId).toBeTruthy();

      const clawqlBin = join(process.cwd(), "bin/clawql.mjs");
      expect(existsSync(clawqlBin), "bin/clawql.mjs").toBe(true);
      const { stdout, stderr, code } = await new Promise<{
        stdout: string;
        stderr: string;
        code: number | null;
      }>((resolve, reject) => {
        const child = spawn(process.execPath, [clawqlBin, "resume", executionId], {
          env: {
            ...process.env,
            CLAWQL_HOME: home,
            CLAWQL_TIER: "regulated",
          },
          cwd: process.cwd(),
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ stdout, stderr, code }));
      });
      expect(code, `cli stdout=${stdout} stderr=${stderr}`).not.toBe(0);
      // L3: match the regulated CLI refuse, not a bare "console" (harness refusals also mention it).
      expect(`${stdout}\n${stderr}`).toMatch(
        /CLAWQL_TIER=regulated refuses CLI approve|regulated refuses CLI approve.*console/i
      );

      const { loadPendingExecution } = await import("clawql-api");
      expect((await loadPendingExecution(executionId, home))?.status).toBe("pending");
    },
    90_000
  );

  it("9) webhook POST no token → 503; wrong token → reject; no side effects", async () => {
    const noTok = await fetch(`${baseUrl}/hitl/label-studio/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "annotation.created" }),
    });
    expect(noTok.status).toBe(503);

    if (remote) {
      console.log(
        "SKIP by design (remote): row 9 wrong-token sibling spawn — covered by process-level suite"
      );
      return;
    }

    // Spawn sibling with token configured to assert wrong-token 401
    const h = await makeWorkDir("clawql-wire-wh-");
    const o = await mintOidcMaterial(h);
    const sp = await writePatchPetstore(h, apiSink.baseUrl);
    const bucket = newBucketName("clawql-wire-wh");
    await createObjectLockBucket(s3Client(s3!), bucket);
    const whSrv = await spawnServer(
      regulatedBaseEnv({
        home: h,
        oidc: o,
        s3: s3!,
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

  it.skipIf(remote)(
    "10) inference remote model refused; sink receives nothing",
    async () => {
      // F1: gateway reads CLAWQL_OPENAI_BASE_URL (not OPENAI_BASE_URL). Require a live
      // inference process and an HTTP refusal — a crash must not count as pass.
      // Regulated requires virtual-key enforcement (audit 6.03).
      expect(existsSync(INFERENCE_BIN), "packages/clawql-inference/bin/clawql-inference.mjs").toBe(
        true
      );
      const before = inferenceSink!.requests.length;
      const infHome = await makeWorkDir("clawql-wire-inf-");
      const infBucket = newBucketName("clawql-wire-inf");
      await createObjectLockBucket(s3Client(s3!), infBucket, "COMPLIANCE");
      const { createVirtualKey } =
        await import("../../packages/clawql-inference/src/keys/store.js");
      const vk = await createVirtualKey(
        { team: "wire" },
        { CLAWQL_HOME: infHome, CLAWQL_INFERENCE_KEYS_ENABLED: "1" }
      );
      const port = await pickFreePort();
      const child = spawn(process.execPath, [INFERENCE_BIN], {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CLAWQL_HOME: infHome,
          CLAWQL_TIER: "regulated",
          CLAWQL_INFERENCE_LOCAL_ONLY: "1",
          CLAWQL_INFERENCE_KEYS_ENABLED: "1",
          CLAWQL_INFERENCE_PORT: String(port),
          CLAWQL_INFERENCE_HOST: "127.0.0.1",
          // Regulated inference requires a ready process WORM trail before gates run.
          CLAWQL_WORM_ENABLED: "1",
          CLAWQL_WORM_REQUIRED: "1",
          CLAWQL_WORM_LOCAL: "sqlite",
          CLAWQL_WORM_REMOTE: "s3",
          CLAWQL_WORM_S3_ENDPOINT: s3!.endpoint,
          CLAWQL_WORM_S3_BUCKET: infBucket,
          CLAWQL_WORM_S3_ACCESS_KEY_ID: s3!.accessKeyId,
          CLAWQL_WORM_S3_SECRET_ACCESS_KEY: s3!.secretAccessKey,
          CLAWQL_WORM_S3_FORCE_PATH_STYLE: "1",
          CLAWQL_WORM_S3_REGION: "us-east-1",
          CLAWQL_WORM_S3_OBJECT_LOCK: "compliance",
          CLAWQL_WORM_S3_OBJECT_LOCK_DAYS: "1",
          CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK: "1",
          // Provider base the gateway actually reads — sink must stay untouched.
          CLAWQL_OPENAI_BASE_URL: `${inferenceSink!.baseUrl}/v1`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
      const deadline = Date.now() + 30_000;
      let listening = false;
      while (Date.now() < deadline) {
        try {
          const h = await fetch(`http://127.0.0.1:${port}/healthz`, {
            signal: AbortSignal.timeout(400),
          });
          if (h.ok) {
            listening = true;
            break;
          }
        } catch {
          /* wait */
        }
        if (child.exitCode !== null) {
          throw new Error(
            `inference exited before listen (code=${child.exitCode}): ${stderr.slice(-800)}`
          );
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(listening, `inference never listened: ${stderr.slice(-800)}`).toBe(true);
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${vk.secret}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      const body = await res.text();
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(body + stderr).toMatch(/local-only/i);
      expect(inferenceSink!.requests.length).toBe(before);
      child.kill("SIGTERM");
    },
    60_000
  );

  it("11) SSRF: sources_propose to link-local / loopback refused; sink untouched", async () => {
    const { rpc } = await mcpInitialize(baseUrl, agentToken);
    if ("refresh" in apiSink) await apiSink.refresh();
    const before = apiSink.requests.length;
    // https:// targets — regulated refuses CLAWQL_SOURCES_ALLOW_HTTP at boot (row 1b).
    for (const url of [
      "https://169.254.169.254/latest/meta-data/",
      "https://127.0.0.1/",
      "https://localhost/",
    ]) {
      const result = await rpc({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "sources_propose",
          arguments: { url, name: "ssrf-probe", dryRun: true },
        },
      });
      const text = toolResultText(result.body);
      expect(text, `ssrf response for ${url}: ${text}`).not.toMatch(/HTTPS required/i);
      // clawql-core egress messages vary: "must not target private…", "host is not allowed"
      expect(text, `ssrf response for ${url}: ${text}`).toMatch(
        /private|loopback|link-local|must not target|host is not allowed/i
      );
    }
    if ("refresh" in apiSink) await apiSink.refresh();
    expect(apiSink.requests.length).toBe(before);
  }, 60_000);

  it("12) GET /chain/verify succeeds after refusals", async () => {
    expect(auditBaseUrl, "CLAWQL_WIRE_AUDIT_URL / worm HTTP").toBeTruthy();
    const res = await fetch(`${auditBaseUrl}/chain/verify`, {
      headers: { authorization: `ApiKey ${auditApiKey}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid?: boolean; entriesChecked?: number };
    expect(body.valid).toBe(true);
    expect((body.entriesChecked ?? 0) >= 0).toBe(true);
  }, 30_000);

  it.skipIf(remote)(
    "13) x402 concurrent same-proof → at most one allow (facilitator settle-once)",
    async () => {
      // Process-level harness (wire MCP payments path is opt-in); mirrors D4 residual.
      const { createX402Gate, enforceX402Gate } = await import("clawql-payments/x402");
      const { createX402ReplayCache } =
        await import("../../packages/clawql-payments/src/x402/replay-cache.js");
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
      const allows = [ra, rb].filter((r) => r.action === "allow");
      const denies = [ra, rb].filter((r) => r.action !== "allow");
      // Facilitator settle-once: exactly one allow; the second reaches settle and is denied.
      expect(allows.length).toBe(1);
      expect(settleCount).toBe(2);
      expect(denies.length).toBe(1);
      const denyText = JSON.stringify(denies[0]);
      // Match the facilitator already-settled reason only (not the action:"deny" field).
      expect(denyText).toMatch(/already settled|authorization already settled/i);
    },
    60_000
  );
});
