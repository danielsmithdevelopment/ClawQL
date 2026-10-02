import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  evaluateOutboundPayment,
  hostMatchesAllowlist,
  loadOutboundPaymentPolicy,
  type OutboundPaymentAction,
  type OutboundPaymentPolicy,
} from "./outbound-policy.js";

const basePolicy = {
  hostsAllowlist: ["api.example.com", "*.trusted.example"],
  payToAllowlist: ["0xPayee"],
  networksAllowlist: ["eip155:8453"],
  assetsAllowlist: ["0xUsdc"],
  maxUsdcPerCall: "0.05",
  maxUsdcPerDay: "1",
  maxUsdcPerSession: "0.5",
  humanApprovalAboveUsdc: "0.01",
  requireDocumentedJustification: true as const,
  documentedJustificationId: "ticket-42",
};

function action(
  overrides: Partial<Omit<OutboundPaymentAction, "quote">> & {
    quote?: Partial<OutboundPaymentAction["quote"]>;
  } = {}
): OutboundPaymentAction {
  const { quote: quoteOverride, ...rest } = overrides;
  return {
    kind: "outbound_payment",
    resourceUrl: "https://api.example.com/resource",
    method: "GET",
    quote: {
      payTo: "0xPayee",
      network: "eip155:8453",
      asset: "0xUsdc",
      amountUsdc: "0.005",
      digest: "digest-a",
      ...quoteOverride,
    },
    outboundPaymentEverEnabled: true,
    dayTotalUsdc: "0",
    sessionTotalUsdc: "0",
    ...rest,
  };
}

describe("loadOutboundPaymentPolicy", () => {
  it("rejects requireDocumentedJustification !== true", async () => {
    const bad = { ...basePolicy, requireDocumentedJustification: false };
    const result = await Effect.runPromise(Effect.either(loadOutboundPaymentPolicy(bad)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toMatchObject({
        reason: expect.stringContaining("requireDocumentedJustification"),
      });
    }
  });

  it("rejects omit of requireDocumentedJustification", async () => {
    const { requireDocumentedJustification: _, ...rest } = basePolicy;
    const result = await Effect.runPromise(Effect.either(loadOutboundPaymentPolicy(rest)));
    expect(result._tag).toBe("Left");
  });

  it("rejects blank documentedJustificationId", async () => {
    const bad = { ...basePolicy, documentedJustificationId: "  " };
    const result = await Effect.runPromise(Effect.either(loadOutboundPaymentPolicy(bad)));
    expect(result._tag).toBe("Left");
  });

  it("accepts a valid policy and returns versionId", async () => {
    const accepted = await Effect.runPromise(loadOutboundPaymentPolicy(basePolicy));
    expect(accepted.policy.requireDocumentedJustification).toBe(true);
    expect(accepted.versionId).toMatch(/^[a-f0-9]{16}$/);
  });

  it("rejects allowlist widen vs previous", async () => {
    const previous = (await Effect.runPromise(loadOutboundPaymentPolicy(basePolicy))).policy;
    const widened = {
      ...basePolicy,
      hostsAllowlist: [...basePolicy.hostsAllowlist, "evil.example"],
    };
    const result = await Effect.runPromise(
      Effect.either(loadOutboundPaymentPolicy(widened, previous))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toMatchObject({
        reason: expect.stringContaining("hostsAllowlist_widen"),
      });
    }
  });

  it("rejects raising maxUsdcPerCall vs previous", async () => {
    const previous = (await Effect.runPromise(loadOutboundPaymentPolicy(basePolicy))).policy;
    const raised = { ...basePolicy, maxUsdcPerCall: "1" };
    const result = await Effect.runPromise(
      Effect.either(loadOutboundPaymentPolicy(raised, previous))
    );
    expect(result._tag).toBe("Left");
  });

  it("allows narrowing hosts and lowering caps", async () => {
    const previous = (await Effect.runPromise(loadOutboundPaymentPolicy(basePolicy))).policy;
    const narrowed = {
      ...basePolicy,
      hostsAllowlist: ["api.example.com"],
      maxUsdcPerCall: "0.01",
      humanApprovalAboveUsdc: "0.02",
    };
    const accepted = await Effect.runPromise(loadOutboundPaymentPolicy(narrowed, previous));
    expect(accepted.policy.hostsAllowlist).toEqual(["api.example.com"]);
  });
});

describe("hostMatchesAllowlist", () => {
  it("matches exact and *.suffix", () => {
    expect(hostMatchesAllowlist("api.example.com", ["api.example.com"])).toBe(true);
    expect(hostMatchesAllowlist("a.trusted.example", ["*.trusted.example"])).toBe(true);
    expect(hostMatchesAllowlist("trusted.example", ["*.trusted.example"])).toBe(false);
    expect(hostMatchesAllowlist("other.com", ["api.example.com"])).toBe(false);
    expect(hostMatchesAllowlist("api.example.com", [])).toBe(false);
  });
});

describe("evaluateOutboundPayment", () => {
  const policy: OutboundPaymentPolicy = basePolicy;

  it("denies by default when host not allowlisted", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(policy, action({ resourceUrl: "https://evil.example/x" }))
    );
    expect(d).toEqual({ decision: "deny", reason: "host_not_allowlisted" });
  });

  it("denies payTo miss", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(policy, action({ quote: { payTo: "0xOther" } }))
    );
    expect(d).toEqual({ decision: "deny", reason: "payTo_not_allowlisted" });
  });

  it("denies per-call cap breach", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(policy, action({ quote: { amountUsdc: "0.06" } }))
    );
    expect(d).toEqual({ decision: "deny", reason: "max_usdc_per_call_exceeded" });
  });

  it("requires HITL on first enablement regardless of amount", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(
        policy,
        action({ outboundPaymentEverEnabled: false, quote: { amountUsdc: "0.001" } })
      )
    );
    expect(d.decision).toBe("hitl");
    expect(d.reason).toBe("first_outbound_enablement_requires_hitl");
  });

  it("allows first enablement when HITL bound to quote digest", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(
        policy,
        action({
          outboundPaymentEverEnabled: false,
          hitlApproval: { quoteDigest: "digest-a", approvedAt: new Date().toISOString() },
        })
      )
    );
    expect(d.decision).toBe("allow");
  });

  it("denies HITL approval bound to a different quote digest", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(
        policy,
        action({
          quote: { amountUsdc: "0.02", digest: "digest-b" },
          hitlApproval: { quoteDigest: "digest-a", approvedAt: new Date().toISOString() },
        })
      )
    );
    expect(d).toEqual({ decision: "deny", reason: "hitl_quote_digest_mismatch" });
  });

  it("allows under-threshold amount without HITL when already enabled", async () => {
    const d = await Effect.runPromise(
      evaluateOutboundPayment(policy, action({ quote: { amountUsdc: "0.005" } }))
    );
    expect(d.decision).toBe("allow");
  });
});
