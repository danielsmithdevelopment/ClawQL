import { Effect } from "effect";
import type { OpenAppaGateVerdict } from "./types.js";

/** Layer attribution for audit / investigator trails. */
export type GateLayerId =
  "panguard_layer4" | "openappa_layer5" | "session_ifc" | "park_destructive_write" | "composed";

export type LayerDecision = {
  readonly layer: GateLayerId;
  readonly status: "allow" | "blocked" | "mandate_required";
  readonly reason: string;
  readonly executionId?: string;
  readonly offerIds?: readonly string[];
  readonly class?: string;
};

export type ComposedGateResult =
  | { readonly allow: true; readonly layers: readonly LayerDecision[] }
  | {
      readonly allow: false;
      readonly status: "blocked" | "mandate_required";
      readonly reason: string;
      readonly layers: readonly LayerDecision[];
      readonly mechanism:
        | "openappa_layer5"
        | "session_ifc"
        | "park_destructive_write"
        | "composed_mandate"
        | "composed_block";
      readonly executionId?: string;
      readonly openappaOfferIds?: readonly string[];
    };

function severity(status: LayerDecision["status"]): number {
  if (status === "blocked") return 2;
  if (status === "mandate_required") return 1;
  return 0;
}

export function openAppaVerdictToLayerDecision(verdict: OpenAppaGateVerdict): LayerDecision {
  if (verdict.allow) {
    return {
      layer: "openappa_layer5",
      status: "allow",
      reason: `OpenAPPA ${verdict.decision.decision}`,
      ...(verdict.decision.class ? { class: verdict.decision.class } : {}),
    };
  }
  return {
    layer: "openappa_layer5",
    status: verdict.status,
    reason: verdict.reason,
    ...(verdict.offerIds?.length ? { offerIds: verdict.offerIds } : {}),
    ...(verdict.decision.class ? { class: verdict.decision.class } : {}),
  };
}

export type NativeLayerInput = {
  readonly status: "blocked" | "mandate_required";
  readonly reason: string;
  readonly mechanism: "untrusted_read_taint" | "data_flow" | "park_destructive_write";
  readonly executionId?: string;
};

export function nativeBlockToLayerDecision(native: NativeLayerInput): LayerDecision {
  const layer: GateLayerId =
    native.mechanism === "park_destructive_write" ? "park_destructive_write" : "session_ifc";
  return {
    layer,
    status: native.status,
    reason: native.reason,
    ...(native.executionId ? { executionId: native.executionId } : {}),
  };
}

/**
 * Most restrictive wins across OpenAPPA (Layer 5) and session IFC / park.
 * OpenAPPA `allow_call` never overrides a later block or park.
 * When both require approval → one `mandate_required` with both reasons.
 */
export function composeMostRestrictiveEffect(
  openappa: OpenAppaGateVerdict | null,
  native: NativeLayerInput | null
): Effect.Effect<ComposedGateResult> {
  return Effect.sync(() => {
    const layers: LayerDecision[] = [];
    if (openappa) layers.push(openAppaVerdictToLayerDecision(openappa));
    if (native) layers.push(nativeBlockToLayerDecision(native));

    if (layers.length === 0) {
      return { allow: true, layers: [] };
    }

    let best = layers[0]!;
    for (const d of layers.slice(1)) {
      if (severity(d.status) > severity(best.status)) best = d;
    }

    if (best.status === "allow") {
      return { allow: true, layers };
    }

    const mandates = layers.filter((l) => l.status === "mandate_required");
    const blocks = layers.filter((l) => l.status === "blocked");

    if (best.status === "blocked") {
      const primary = blocks[0] ?? best;
      return {
        allow: false,
        status: "blocked",
        reason: primary.reason,
        layers,
        mechanism:
          blocks.length > 1
            ? "composed_block"
            : primary.layer === "openappa_layer5"
              ? "openappa_layer5"
              : primary.layer === "park_destructive_write"
                ? "park_destructive_write"
                : "session_ifc",
        ...(primary.offerIds?.length ? { openappaOfferIds: primary.offerIds } : {}),
      };
    }

    // mandate_required — coalesce when both layers park/approve
    if (mandates.length >= 2) {
      const reasons = mandates.map((m) => `[${m.layer}] ${m.reason}`).join(" | ");
      const executionId = mandates.find((m) => m.executionId)?.executionId;
      const offerIds = mandates.flatMap((m) => m.offerIds ?? []);
      return {
        allow: false,
        status: "mandate_required",
        reason: `Multiple layers require approval: ${reasons}`,
        layers,
        mechanism: "composed_mandate",
        ...(executionId ? { executionId } : {}),
        ...(offerIds.length ? { openappaOfferIds: offerIds } : {}),
      };
    }

    const only = mandates[0] ?? best;
    return {
      allow: false,
      status: "mandate_required",
      reason: only.reason,
      layers,
      mechanism:
        only.layer === "openappa_layer5"
          ? "openappa_layer5"
          : only.layer === "park_destructive_write"
            ? "park_destructive_write"
            : "session_ifc",
      ...(only.executionId ? { executionId: only.executionId } : {}),
      ...(only.offerIds?.length ? { openappaOfferIds: only.offerIds } : {}),
    };
  });
}

export function composeMostRestrictive(
  openappa: OpenAppaGateVerdict | null,
  native: NativeLayerInput | null
): ComposedGateResult {
  return Effect.runSync(composeMostRestrictiveEffect(openappa, native));
}

/** MCP error body for a composed deny / mandate. */
export function composedGateToMcpResult(result: Extract<ComposedGateResult, { allow: false }>): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  const body = {
    ok: false,
    status: result.status,
    reason: result.reason,
    mechanism: result.mechanism,
    layers: result.layers.map((l) => ({
      layer: l.layer,
      status: l.status,
      reason: l.reason,
      ...(l.executionId ? { executionId: l.executionId } : {}),
      ...(l.class ? { class: l.class } : {}),
    })),
    ...(result.executionId ? { executionId: result.executionId } : {}),
    ...(result.openappaOfferIds?.length ? { openappaOfferIds: result.openappaOfferIds } : {}),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    isError: true,
  };
}
