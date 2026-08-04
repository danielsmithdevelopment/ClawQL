import { describe, expect, it } from "vitest";
import {
  buildHttpDiscoverResponse,
  isDiscoverJsonRpc,
  shouldUseStatelessHttpTransport,
  resolveHttpMcpProtocolVersion,
  MCP_PROTOCOL_VERSION_2026_07_28,
} from "./mcp-http-protocol.js";

describe("mcp-http-protocol", () => {
  it("defaults to sessionful SDK latest; opts into 2026-07-28 via header/env", () => {
    expect(resolveHttpMcpProtocolVersion(undefined)).not.toBe(MCP_PROTOCOL_VERSION_2026_07_28);
    expect(resolveHttpMcpProtocolVersion("2026-07-28")).toBe(MCP_PROTOCOL_VERSION_2026_07_28);
    expect(
      resolveHttpMcpProtocolVersion(undefined, { CLAWQL_MCP_PROTOCOL_VERSION: "2026-07-28" })
    ).toBe(MCP_PROTOCOL_VERSION_2026_07_28);
    expect(shouldUseStatelessHttpTransport("2026-07-28")).toBe(true);
    expect(shouldUseStatelessHttpTransport("2025-11-25")).toBe(false);
    expect(shouldUseStatelessHttpTransport("2025-11-25", { CLAWQL_MCP_STATELESS: "1" })).toBe(true);
  });

  it("detects discover methods and builds response", () => {
    expect(isDiscoverJsonRpc({ jsonrpc: "2.0", method: "server/discover" })).toBe(true);
    const r = buildHttpDiscoverResponse({
      protocolVersion: MCP_PROTOCOL_VERSION_2026_07_28,
      clientInfo: { name: "edge", version: "7.1.0" },
    });
    expect(r.stateless).toBe(true);
    expect((r.capabilities as { mrtr: boolean }).mrtr).toBe(true);
  });
});
