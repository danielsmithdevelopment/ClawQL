import type { ModelEscalationDecision, RoutingFailureSignal } from "../routing/types.js";

export type AgentCoordinationMode = "disabled" | "stub" | "hermes";

export type AgentCoordinationResult = {
  triggered: boolean;
  mode: AgentCoordinationMode;
  message: string;
  responseText?: string;
};

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/** Invoke Hermes MoA when configured; otherwise audit-only stub (#562). */
export async function invokeAgentCoordination(input: {
  decision: ModelEscalationDecision;
  signals: RoutingFailureSignal[];
  env?: NodeJS.ProcessEnv;
}): Promise<AgentCoordinationResult> {
  const env = input.env ?? process.env;
  if (!parseTruthy(env.CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED)) {
    return {
      triggered: false,
      mode: "disabled",
      message: "agent coordination disabled",
    };
  }

  const baseUrl = env.HERMES_BASE_URL?.trim();
  if (!baseUrl) {
    return {
      triggered: true,
      mode: "stub",
      message: `coordination stub at ${input.decision.tier}/${input.decision.modelId}`,
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/coordinate`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: input.decision.tier,
        modelId: input.decision.modelId,
        signals: input.signals,
      }),
      signal: AbortSignal.timeout(
        Number.parseInt(env.HERMES_TIMEOUT_MS?.trim() || "15000", 10)
      ),
    });
    if (!res.ok) {
      const detail = await res.text();
      return {
        triggered: true,
        mode: "hermes",
        message: `Hermes coordination failed HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }
    const body = (await res.json()) as { message?: string; content?: string };
    return {
      triggered: true,
      mode: "hermes",
      message: body.message ?? "Hermes coordination completed",
      responseText: body.content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      triggered: true,
      mode: "hermes",
      message: `Hermes coordination error: ${message}`,
    };
  }
}
