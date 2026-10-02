import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpApiAdapterApp } from "./server.js";
import type { ListedMcpTool, ToolCatalog } from "./types.js";

const catalogTools: ListedMcpTool[] = [
  {
    name: "search",
    description: "Search ops",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "run_idp_pipeline",
    description: "IDP",
    inputSchema: {
      type: "object",
      properties: {
        pdf_base64: { type: "string", description: "Optional seed PDF (base64)" },
        dry_run: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "memory_recall",
    description: "Recall",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "cf_reveal_challenge",
    description: "Reveal Cloudflare-style challenge coupon",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cf_claim_coupon",
    description: "Claim the challenge coupon",
    inputSchema: { type: "object", properties: {} },
  },
];

function catalog(): ToolCatalog {
  return {
    tools: catalogTools,
    fetchedAt: new Date().toISOString(),
    upstream: "test",
    upstreamKind: "http",
    surfaces: ["openapi", "mcp-ui"],
    mcpUiPath: "/mcp-ui",
  };
}

function multipartBody(
  boundary: string,
  parts: Array<{ name: string; filename?: string; contentType?: string; body: string | Buffer }>
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`
        )
      );
    } else {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`)
      );
    }
    chunks.push(typeof part.body === "string" ? Buffer.from(part.body) : part.body);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe("mcp-ui batches 2-4 e2e", () => {
  const secret = "test-mcp-ui-batches-hs256-secret-32ch!!";
  const issuer = "https://auth.clawql.test";
  let closeServer: (() => Promise<void>) | undefined;
  let lastArgs: Record<string, unknown> | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
    lastArgs = undefined;
  });

  async function mintJwt(atr: Record<string, unknown>): Promise<string> {
    return new SignJWT({ atr })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(atr.sub ?? "user"))
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));
  }

  async function startApp(): Promise<string> {
    const app = createMcpApiAdapterApp({
      getCatalog: catalog,
      callTool: async (_tool, args) => {
        lastArgs = args;
        // Simulate a slightly slow IDP call
        await new Promise((r) => setTimeout(r, 30));
        return { text: JSON.stringify({ ok: true, dry_run: args.dry_run }), content: [], isError: false };
      },
      jwtAuth: { hs256Secret: secret, issuer },
      mcpUiPath: "/mcp-ui",
      mcpUiAtrScoped: true,
    });
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    closeServer = () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    return `http://127.0.0.1:${addr.port}`;
  }

  it("multipart upload maps to pdf_base64 when ATR allows documents", async () => {
    const base = await startApp();
    const token = await mintJwt({ sub: "ops", role: "operator", scope: ["documents"] });
    const boundary = "----clawqlboundary";
    const body = multipartBody(boundary, [
      { name: "dry_run", body: "true" },
      {
        name: "pdf_base64",
        filename: "sample.pdf",
        contentType: "application/pdf",
        body: Buffer.from("%PDF-demo"),
      },
    ]);
    const res = await fetch(`${base}/mcp-ui/execute/run_idp_pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    // long-running → SSE shell
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("EventSource");
    expect(html).toContain("/mcp-ui/progress/");
    const jobMatch = html.match(/\/mcp-ui\/progress\/([a-f0-9-]+)/i);
    expect(jobMatch?.[1]).toBeTruthy();

    // Wait for background job to finish and args to be captured
    for (let i = 0; i < 40 && !lastArgs; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(lastArgs?.pdf_base64).toBe(Buffer.from("%PDF-demo").toString("base64"));
    expect(lastArgs?.dry_run).toBe(true);

    const sse = await fetch(`${base}/mcp-ui/progress/${jobMatch![1]}`);
    expect(sse.status).toBe(200);
    expect(sse.headers.get("content-type")).toMatch(/text\/event-stream/);
    const sseText = await sse.text();
    expect(sseText).toMatch(/event: (progress|complete)/);
  });

  it("denies multipart upload without document-processing ATR", async () => {
    const base = await startApp();
    const boundary = "----denyboundary";
    const body = multipartBody(boundary, [
      { name: "query", body: "hello" },
      {
        name: "upload",
        filename: "x.bin",
        contentType: "application/octet-stream",
        body: Buffer.from("secret"),
      },
    ]);

    const deniedTool = await fetch(`${base}/mcp-ui/execute/run_idp_pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await mintJwt({ sub: "m", scope: ["memory"] })}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "dry_run=true",
    });
    expect(deniedTool.status).toBe(403);

    const memoryOnly = await mintJwt({ sub: "m2", scope: ["memory", "search"] });
    const deniedUpload = await fetch(`${base}/mcp-ui/execute/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memoryOnly}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(deniedUpload.status).toBe(403);
    expect(await deniedUpload.text()).toMatch(/document\/file processing/i);
  });

  it("GET /mcp-ui/presets/agent-lab scaffolds Act-2 landing and start redirects", async () => {
    const base = await startApp();
    const token = await mintJwt({ sub: "ops", scope: ["search", "memory"] });
    const landing = await fetch(`${base}/mcp-ui/presets/agent-lab`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(landing.status).toBe(200);
    const landingHtml = await landing.text();
    expect(landingHtml).toMatch(/Agent Lab/i);
    expect(landingHtml).toContain("/mcp-ui/presets/agent-lab/start");
    expect(landingHtml).toMatch(/search|memory_recall/);

    const started = await fetch(`${base}/mcp-ui/presets/agent-lab/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    expect(started.status).toBe(303);
    const location = started.headers.get("location") ?? "";
    expect(location).toContain("/mcp-ui/custom/agent-lab");

    const page = await fetch(`${base}${location.startsWith("http") ? new URL(location).pathname : location}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(/Step 1 of/i);
    expect(html).toContain('hx-post="/mcp-ui/custom/agent-lab/step"');
  });

  it("POST /mcp-ui/generate with preset agent-lab creates the custom workflow", async () => {
    const base = await startApp();
    const token = await mintJwt({ sub: "ops", scope: ["search", "memory"] });
    const created = await fetch(`${base}/mcp-ui/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preset: "agent-lab" }),
    });
    expect(created.status).toBe(201);
    const json = (await created.json()) as {
      slug: string;
      url: string;
      steps: unknown[];
    };
    expect(json.slug).toBe("agent-lab");
    expect(json.url).toContain("/mcp-ui/custom/agent-lab");
    expect(json.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /mcp-ui/presets/cloudflare-claim scaffolds click-to-claim and start redirects", async () => {
    const base = await startApp();
    const token = await mintJwt({
      sub: "ops",
      role: "admin",
      scope: ["*"],
    });
    const landing = await fetch(`${base}/mcp-ui/presets/cloudflare-claim`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(landing.status).toBe(200);
    const landingHtml = await landing.text();
    expect(landingHtml).toMatch(/click-to-claim|Click to claim/i);
    expect(landingHtml).toContain("/mcp-ui/presets/cloudflare-claim/start");
    expect(landingHtml).toContain("cf_reveal_challenge");
    expect(landingHtml).toContain("cf_claim_coupon");

    const started = await fetch(`${base}/mcp-ui/presets/cloudflare-claim/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    expect(started.status).toBe(303);
    const location = started.headers.get("location") ?? "";
    expect(location).toContain("/mcp-ui/custom/cloudflare-claim");

    const page = await fetch(
      `${base}${location.startsWith("http") ? new URL(location).pathname : location}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(/Step 1 of/i);
    expect(html).toContain('hx-post="/mcp-ui/custom/cloudflare-claim/step"');
  });

  it("POST /mcp-ui/generate with preset cloudflare-claim creates claim workflow", async () => {
    const base = await startApp();
    const token = await mintJwt({
      sub: "ops",
      role: "admin",
      scope: ["*"],
    });
    const created = await fetch(`${base}/mcp-ui/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preset: "cloudflare-claim" }),
    });
    expect(created.status).toBe(201);
    const json = (await created.json()) as {
      slug: string;
      url: string;
      steps: Array<{ tool: string }>;
    };
    expect(json.slug).toBe("cloudflare-claim");
    expect(json.url).toContain("/mcp-ui/custom/cloudflare-claim");
    expect(json.steps.map((s) => s.tool)).toEqual([
      "cf_reveal_challenge",
      "cf_claim_coupon",
    ]);
  });

  it("POST /mcp-ui/generate creates a custom multi-step form", async () => {
    const base = await startApp();
    const token = await mintJwt({ sub: "ops", scope: ["search", "memory"] });
    const created = await fetch(`${base}/mcp-ui/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Search then recall",
        steps: [{ tool: "search" }, { tool: "memory_recall" }],
      }),
    });
    expect(created.status).toBe(201);
    const json = (await created.json()) as { slug: string; url: string };
    expect(json.url).toContain(`/mcp-ui/custom/${json.slug}`);

    const page = await fetch(`${base}/mcp-ui/custom/${json.slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Search then recall");
    expect(html).toContain("Step 1 of 2");
    expect(html).toContain(`hx-post="/mcp-ui/custom/${json.slug}/step"`);

    const step = await fetch(`${base}/mcp-ui/custom/${json.slug}/step`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "query=repos",
    });
    expect(step.status).toBe(200);
    expect(await step.text()).toMatch(/search|Next/i);
  });
});
