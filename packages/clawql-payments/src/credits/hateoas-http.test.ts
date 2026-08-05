import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachCreditsHateoasRoutes } from "./hateoas-http.js";
import { claimDirectory, resetDirectoryForTests } from "./directory.js";
import { createMoneyRequest, resetMoneyRequestsForTests } from "./requests.js";

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/credits", express.urlencoded({ extended: false }));
  attachCreditsHateoasRoutes(app);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe("credits hateoas http", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-credits-hateoas-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "http://127.0.0.1:9";
    await resetDirectoryForTests(process.env);
    await resetMoneyRequestsForTests(process.env);
  });

  afterEach(async () => {
    delete process.env.CLAWQL_CREDITS_HATEOAS_BASE;
    await rm(home, { recursive: true, force: true });
  });

  it("GET /credits mini home and pay landing", async () => {
    await withApp(async (base) => {
      const home = await fetch(`${base}/credits`);
      expect(home.status).toBe(200);
      const homeBody = await home.text();
      expect(homeBody).toContain("Claw");
      expect(homeBody).toContain("Fraunces");
      expect(homeBody).toContain('action="/credits/pay"');

      const html = await fetch(`${base}/credits/pay?to=%40bob&amount=10`, {
        headers: { Accept: "text/html" },
      });
      expect(html.status).toBe(200);
      const body = await html.text();
      expect(body).toContain("Claw");
      expect(body).toContain("@bob");
      expect(body).toContain("$10.00");
      expect(body).toContain("htmx.org");
      expect(body).toContain("Payment QR");

      const json = await fetch(`${base}/credits/pay?to=%40bob&amount=10`, {
        headers: { Accept: "application/json" },
      });
      expect(json.status).toBe(200);
      const envelope = (await json.json()) as { kind: string; links: { clawql: string } };
      expect(envelope.kind).toBe("credits.pay");
      expect(envelope.links.clawql).toContain("clawql://pay?");
    });
  });

  it("GET /credits/qr.svg returns SVG", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/credits/qr.svg?to=bob%40acme.com&amount=5`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/svg/);
      const svg = await res.text();
      expect(svg).toContain("<svg");
    });
  });

  it("invite page + claim via HTMX form post", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });
    const { request, inviteToken } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "newbie@acme.com",
      amountCents: 2500,
    });
    expect(inviteToken).toBeTruthy();

    await withApp(async (base) => {
      const page = await fetch(
        `${base}/credits/request/invite?request_id=${request.requestId}&token=${inviteToken}`
      );
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Claim invite");

      const claim = await fetch(`${base}/credits/request/invite/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: inviteToken!,
          requestId: request.requestId,
          tenantId: "newbie",
          handle: "newb",
        }).toString(),
      });
      expect(claim.status).toBe(200);
      const claimBody = await claim.text();
      expect(claimBody).toContain("Claimed");
      expect(claimBody).toContain("newbie");

      const reqPage = await fetch(`${base}/credits/request/${request.requestId}`, {
        headers: { Accept: "application/json" },
      });
      expect(reqPage.status).toBe(200);
      const data = (await reqPage.json()) as { data: { payerTenantId: string } };
      expect(data.data.payerTenantId).toBe("newbie");
    });
  });
});
