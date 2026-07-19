import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type { ClawQLPluginRegistrationApi } from "clawql-core";
import { createPaymentsToolsPlugin, paymentsMcpToolsEnabled } from "./payments-tools-plugin.js";

describe("payments tools MCP plugin", () => {
  it("registers payout, ramp, and offramp tools", () => {
    const names: string[] = [];
    const api: ClawQLPluginRegistrationApi = {
      registerMcpTool: (tool) =>
        Effect.sync(() => {
          names.push(tool.name);
        }),
    };
    const plugin = createPaymentsToolsPlugin({ CLAWQL_PAYMENTS_MCP_TOOLS: "1" });
    Effect.runSync(plugin.onRegister!(api));
    expect(names).toEqual([
      "payments_payout_create",
      "payments_ramp_agent_card_issue",
      "payments_offramp_session_create",
      "payments_offramp_webhook_process",
      "agent_compensation_deposit_stage",
      "agent_compensation_deposit_confirm",
      "agent_compensation_cashout_stage",
      "agent_compensation_cashout_confirm",
    ]);
  });

  it("gates registration via env flag", () => {
    expect(paymentsMcpToolsEnabled({})).toBe(false);
    expect(paymentsMcpToolsEnabled({ CLAWQL_PAYMENTS_MCP_TOOLS: "1" })).toBe(true);
  });
});
