import { describe, expect, it } from "vitest";
import { checkTrialTrace, checkTrialTraces } from "./trace-conformance.js";
import type { TrialTraceEvent } from "./types.js";

describe("trace-conformance (WriteProtocol bridge)", () => {
  it("passes race-safe unknown: early not_found without safe_resend", () => {
    const events: TrialTraceEvent[] = [
      { t: "t0", kind: "request_sent", reference: "r1" },
      { t: "t1", kind: "request_paused", reference: "r1" },
      { t: "t2", kind: "crashed" },
      { t: "t3", kind: "resumed" },
      { t: "t4", kind: "lookup", reference: "r1", found: false, definitive: false },
      { t: "t5", kind: "outcome_unknown" },
      { t: "t6", kind: "request_released", reference: "r1" },
      { t: "t7", kind: "request_applied", reference: "r1", detail: "once:1" },
    ];
    const r = checkTrialTrace({
      events,
      apiCapability: "lookup_race",
      structuralGate: true,
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("counterexample: safe_resend without named ServerGuarantee (WeakEarlyNotFound)", () => {
    const events: TrialTraceEvent[] = [
      { t: "t0", kind: "request_sent", reference: "r1" },
      { t: "t1", kind: "lookup", reference: "r1", found: false, definitive: false },
      { t: "t2", kind: "safe_resend", reference: "r1" },
      { t: "t3", kind: "request_applied", reference: "r1", detail: "once:1" },
      { t: "t4", kind: "request_applied", reference: "r1", detail: "once:2" },
    ];
    const r = checkTrialTrace({ events, apiCapability: "lookup_by_reference" });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "NoUnsafeRetry")).toBe(true);
    expect(r.violations.some((v) => v.rule === "NoDuplicateEffect")).toBe(true);
  });

  it("counterexample: definitive without named reason (GuaranteeNamed)", () => {
    const events: TrialTraceEvent[] = [
      {
        t: "t0",
        kind: "lookup",
        reference: "r1",
        found: false,
        definitive: true,
        detail: "client_timeout",
      },
      { t: "t1", kind: "safe_resend", reference: "r1" },
    ];
    const r = checkTrialTrace({ events, apiCapability: "lookup_by_reference" });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "GuaranteeNamed")).toBe(true);
  });

  it("passes safe_resend after named lookup_covers_prior_accepts", () => {
    const events: TrialTraceEvent[] = [
      { t: "t0", kind: "request_sent", reference: "r1" },
      { t: "t1", kind: "crashed" },
      { t: "t2", kind: "resumed" },
      {
        t: "t3",
        kind: "lookup",
        reference: "r1",
        found: false,
        definitive: true,
        detail: "lookup_covers_prior_accepts",
      },
      { t: "t4", kind: "safe_resend", reference: "r1" },
      { t: "t5", kind: "request_applied", reference: "r1", detail: "once:1" },
      { t: "t6", kind: "reconciled", reference: "r1" },
    ];
    const r = checkTrialTrace({
      events,
      apiCapability: "lookup_by_reference",
      structuralGate: true,
    });
    expect(r.ok).toBe(true);
  });

  it("counterexample: structuralGate rejects agent_retry", () => {
    const events: TrialTraceEvent[] = [
      { t: "t0", kind: "outcome_unknown" },
      { t: "t1", kind: "agent_retry", reference: "r1" },
      { t: "t2", kind: "request_applied", reference: "r1" },
    ];
    const r = checkTrialTrace({
      events,
      apiCapability: "neither",
      structuralGate: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "StructuralNoBlindRetry")).toBe(true);
  });

  it("checkTrialTraces skips empty event lists", () => {
    const r = checkTrialTraces([{ detail: "no-trace" }, { events: [], detail: "empty" }], {
      apiCapability: "neither",
    });
    expect(r.ok).toBe(true);
    expect(r.eventsChecked).toBe(0);
  });
});
