import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  consumeOutboundOperatorApproval,
  recordOutboundOperatorApproval,
} from "./operator-approval.js";

describe("outbound operator approval (audit 6.02)", () => {
  let home = "";

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true });
  });

  it("records and consumes a one-shot approval", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
    const a = await recordOutboundOperatorApproval({
      home,
      quoteDigest: "digest-1",
      principal: "ops@example.com",
      tenantId: "t1",
    });
    expect(a.id.startsWith("x402apr_")).toBe(true);

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

  it("refuses digest or tenant mismatch", async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-apr-"));
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
