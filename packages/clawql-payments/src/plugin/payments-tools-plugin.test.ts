import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type { ClawQLPluginRegistrationApi } from "clawql-core";
import { createPaymentsToolsPlugin, paymentsMcpToolsEnabled } from "./payments-tools-plugin.js";

describe("payments tools MCP plugin", () => {
  it("omits P2P and compensation tools by default (compliance perimeter)", () => {
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
      "payments_credits_directory_claim",
      "payments_credits_directory_resolve",
      "payments_credits_directory_list",
      "payments_credits_contacts_add",
      "payments_credits_contacts_list",
      "payments_credits_contacts_remove",
      "payments_credits_contacts_resolve",
      "payments_credits_activity",
      "payments_credits_link",
      "payments_credits_request_create",
      "payments_credits_request_send_invite",
      "payments_credits_request_list",
      "payments_credits_request_claim_invite",
    ]);
    expect(names).not.toContain("payments_credits_transfer_stage");
    expect(names).not.toContain("agent_compensation_deposit_stage");
  });

  it("registers P2P and compensation tools when explicitly enabled on self-hosted", () => {
    const names: string[] = [];
    const descriptions = new Map<string, string | undefined>();
    const api: ClawQLPluginRegistrationApi = {
      registerMcpTool: (tool) =>
        Effect.sync(() => {
          names.push(tool.name);
          descriptions.set(tool.name, tool.description);
        }),
    };
    const plugin = createPaymentsToolsPlugin({
      CLAWQL_PAYMENTS_MCP_TOOLS: "1",
      CLAWQL_CREDITS_P2P_ENABLED: "1",
      CLAWQL_COMPENSATION_ENABLED: "1",
    });
    Effect.runSync(plugin.onRegister!(api));
    expect(names).toContain("payments_credits_request_accept");
    expect(names).toContain("payments_credits_transfer_stage");
    expect(names).toContain("payments_credits_transfer_confirm");
    expect(names).toContain("agent_compensation_deposit_stage");
    expect(names).toContain("agent_compensation_cashout_confirm");
    expect(descriptions.get("payments_credits_transfer_stage")).toMatch(/Safe entry point/i);
    expect(descriptions.get("agent_compensation_deposit_stage")).toMatch(/Self-hosted/i);
  });

  it("never registers P2P on managed hosting even if flags are set", () => {
    const names: string[] = [];
    const api: ClawQLPluginRegistrationApi = {
      registerMcpTool: (tool) => Effect.sync(() => names.push(tool.name)),
    };
    const plugin = createPaymentsToolsPlugin({
      CLAWQL_PAYMENTS_MCP_TOOLS: "1",
      CLAWQL_MANAGED_HOSTING: "1",
      CLAWQL_CREDITS_P2P_ENABLED: "1",
      CLAWQL_COMPENSATION_ENABLED: "1",
    });
    Effect.runSync(plugin.onRegister!(api));
    expect(names).not.toContain("payments_credits_transfer_stage");
    expect(names).not.toContain("agent_compensation_deposit_stage");
  });

  it("gates registration via env flag", () => {
    expect(paymentsMcpToolsEnabled({})).toBe(false);
    expect(paymentsMcpToolsEnabled({ CLAWQL_PAYMENTS_MCP_TOOLS: "1" })).toBe(true);
  });
});
