import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type { ClawQLPluginRegistrationApi } from "clawql-core";
import { createPaymentsToolsPlugin, paymentsMcpToolsEnabled } from "./payments-tools-plugin.js";

describe("payments tools MCP plugin", () => {
  it("registers payout, ramp, and offramp tools", () => {
    const names: string[] = [];
    const descriptions = new Map<string, string | undefined>();
    const api: ClawQLPluginRegistrationApi = {
      registerMcpTool: (tool) =>
        Effect.sync(() => {
          names.push(tool.name);
          descriptions.set(tool.name, tool.description);
        }),
    };
    const plugin = createPaymentsToolsPlugin({ CLAWQL_PAYMENTS_MCP_TOOLS: "1" });
    Effect.runSync(plugin.onRegister!(api));
    expect(names).toEqual([
      "payments_payout_create",
      "payments_ramp_agent_card_issue",
      "payments_offramp_session_create",
      "payments_offramp_webhook_process",
      "payments_credits_directory_claim",
      "payments_credits_directory_resolve",
      "payments_credits_directory_list",
      "payments_credits_request_create",
      "payments_credits_request_list",
      "payments_credits_request_claim_invite",
      "payments_credits_request_accept",
      "payments_credits_transfer_stage",
      "payments_credits_transfer_confirm",
      "agent_compensation_deposit_stage",
      "agent_compensation_deposit_confirm",
      "agent_compensation_cashout_stage",
      "agent_compensation_cashout_confirm",
    ]);
    expect(descriptions.get("payments_credits_transfer_stage")).toMatch(/Safe entry point/i);
    expect(descriptions.get("payments_credits_request_create")).toMatch(/invoice|request|invite/i);

    expect(descriptions.get("payments_credits_transfer_confirm")).toMatch(/High-impact/i);
    expect(descriptions.get("agent_compensation_deposit_stage")).toMatch(/Safe entry point/i);
    expect(descriptions.get("agent_compensation_deposit_confirm")).toMatch(/High-impact/i);
    expect(descriptions.get("agent_compensation_cashout_stage")).toMatch(/Safe entry point/i);
    expect(descriptions.get("agent_compensation_cashout_confirm")).toMatch(/High-impact/i);
  });

  it("gates registration via env flag", () => {
    expect(paymentsMcpToolsEnabled({})).toBe(false);
    expect(paymentsMcpToolsEnabled({ CLAWQL_PAYMENTS_MCP_TOOLS: "1" })).toBe(true);
  });
});
