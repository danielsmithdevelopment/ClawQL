import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  consumeOutboundOperatorApproval,
  parkOutboundPendingQuote,
  recordOutboundOperatorApproval,
} from "./operator-approval.js";

async function park(home: string, digest: string, tenantId = "t1"): Promise<void> {
  await parkOutboundPendingQuote({
    home,
    quoteDigest: digest,
    amount: "1.00",
    asset: "USDC",
    payee: "0xabc",
    resourceUrl: "https://pay.example/resource",
    network: "base",
    tenantId,
  });
}

describe("outbound operator approval (audit 6.02 / Y3)", () => {
  let home = "";

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("records and consumes a one-shot approval bound to a parked quote", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
    await park(home, "digest-1");
    const a = await recordOutboundOperatorApproval({
      home,
      quoteDigest: "digest-1",
      principal: "ops@example.com",
      tenantId: "t1",
    });
    expect(a.id.startsWith("x402apr_")).toBe(true);
    expect(a.quote.amount).toBe("1.00");
    expect(a.quote.payee).toBe("0xabc");

    const first = await consumeOutboundOperatorApproval({
      home,
      approvalId: a.id,
      quoteDigest: "digest-1",
      tenantId: "t1",
    });
    expect(first?.principal).toBe("ops@example.com");
    expect(first?.consumedAt).toBeTruthy();

    const second = await consumeOutboundOperatorApproval({
      home,
      approvalId: a.id,
      quoteDigest: "digest-1",
      tenantId: "t1",
    });
    expect(second).toBeNull();
  });

  it("refuses approve without a parked quote (Y3)", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
    await expect(
      recordOutboundOperatorApproval({
        home,
        quoteDigest: "missing",
        principal: "ops@example.com",
        tenantId: "t1",
      })
    ).rejects.toThrow(/parked quote/);
  });

  it("refuses digest or tenant mismatch", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
    await park(home, "digest-1");
    const a = await recordOutboundOperatorApproval({
      home,
      quoteDigest: "digest-1",
      principal: "ops@example.com",
      tenantId: "t1",
    });
    expect(
      await consumeOutboundOperatorApproval({
        home,
        approvalId: a.id,
        quoteDigest: "wrong",
        tenantId: "t1",
      })
    ).toBeNull();
    expect(
      await consumeOutboundOperatorApproval({
        home,
        approvalId: a.id,
        quoteDigest: "digest-1",
        tenantId: "other",
      })
    ).toBeNull();
  });

  it("refuses expired approvals", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
    await park(home, "digest-exp");
    const a = await recordOutboundOperatorApproval({
      home,
      quoteDigest: "digest-exp",
      principal: "ops@example.com",
      tenantId: "t1",
      env: { CLAWQL_OUTBOUND_APPROVAL_TTL_SEC: "60" },
    });
    const past = Date.parse(a.expiresAt) + 1_000;
    expect(
      await consumeOutboundOperatorApproval({
        home,
        approvalId: a.id,
        quoteDigest: "digest-exp",
        tenantId: "t1",
        nowMs: past,
      })
    ).toBeNull();
  });
});
