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
});
