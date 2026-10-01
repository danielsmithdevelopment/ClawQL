import { createHash } from "node:crypto";

export type MandateChange = {
  readonly toolName: string;
  readonly riskLevel: "MEDIUM" | "HIGH" | "CRITICAL";
  readonly summary: string;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
};

export type MandateDecision = "granted" | "declined" | "timeout" | "void";

export type MandateRecord = {
  readonly mandateId: string;
  readonly changeHash: string;
  readonly decision: MandateDecision;
  readonly wormEvent: "MANDATE_GRANTED" | "MANDATE_DECLINED" | "MANDATE_VOID";
  readonly createdAt: string;
};

/**
 * Hash of the exact change — mandate is void if the change differs after approval.
 */
export function hashMandateChange(change: MandateChange): string {
  const canonical = JSON.stringify({
    toolName: change.toolName,
    riskLevel: change.riskLevel,
    summary: change.summary,
    currentValue: change.currentValue,
    proposedValue: change.proposedValue,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Only MEDIUM risk gets a ChatGPT form; HIGH/CRITICAL never elicit. */
export function canElicitMandateForm(change: MandateChange): boolean {
  return change.riskLevel === "MEDIUM";
}

/** OpenAI form schema for MEDIUM-risk mandate approval. */
export function buildMandateApprovalForm(change: MandateChange): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["accept", "decline"],
        title: "Decision",
        description: change.summary,
      },
      reason: {
        type: "string",
        title: "Reason",
        enum: ["Looks correct", "Need more context", "Wrong value", "Other"],
      },
      reasonNotes: {
        type: "string",
        title: "Notes",
      },
    },
    required: ["decision"],
    "x-clawql": {
      riskLevel: change.riskLevel,
      currentValue: change.currentValue,
      proposedValue: change.proposedValue,
      changeHash: hashMandateChange(change),
    },
  };
}

export function resolveMandateDecision(input: {
  readonly change: MandateChange;
  readonly approvedChangeHash: string;
  readonly formResult: { readonly action?: string; readonly content?: Record<string, unknown> };
}): MandateRecord {
  const changeHash = hashMandateChange(input.change);
  const now = new Date().toISOString();
  const mandateId = `mnd_${changeHash.slice(0, 16)}`;

  if (!canElicitMandateForm(input.change)) {
    return {
      mandateId,
      changeHash,
      decision: "void",
      wormEvent: "MANDATE_VOID",
      createdAt: now,
    };
  }

  if (changeHash !== input.approvedChangeHash) {
    return {
      mandateId,
      changeHash,
      decision: "void",
      wormEvent: "MANDATE_VOID",
      createdAt: now,
    };
  }

  const action = input.formResult.action?.toLowerCase();
  const decisionField = String(input.formResult.content?.decision ?? "").toLowerCase();
  if (action === "accept" || decisionField === "accept") {
    return {
      mandateId,
      changeHash,
      decision: "granted",
      wormEvent: "MANDATE_GRANTED",
      createdAt: now,
    };
  }
  if (action === "cancel" || action === "timeout" || decisionField === "") {
    return {
      mandateId,
      changeHash,
      decision: action === "timeout" ? "timeout" : "declined",
      wormEvent: "MANDATE_DECLINED",
      createdAt: now,
    };
  }
  return {
    mandateId,
    changeHash,
    decision: "declined",
    wormEvent: "MANDATE_DECLINED",
    createdAt: now,
  };
}
