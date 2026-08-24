import { describe, expect, it, vi } from "vitest";

import {
  MCP_OAUTH_AUDIT_DISABLED_WARNING,
  warnIfMcpOAuthAuditDisabled,
} from "./mcp-oauth-startup-warnings.js";

describe("warnIfMcpOAuthAuditDisabled", () => {
  it("warns loudly when MCP OAuth is enabled and audit store is off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthAuditDisabled({
      CLAWQL_MCP_OAUTH_ENABLED: "1",
      CLAWQL_AUTH_AUDIT_STORE: "off",
    });
    expect(warn).toHaveBeenCalledWith(MCP_OAUTH_AUDIT_DISABLED_WARNING);
    warn.mockRestore();
  });

  it("does not warn when audit store is sqlite", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthAuditDisabled({
      CLAWQL_MCP_OAUTH_ENABLED: "1",
      CLAWQL_AUTH_AUDIT_STORE: "sqlite",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn when MCP OAuth is disabled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthAuditDisabled({
      CLAWQL_AUTH_AUDIT_STORE: "off",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
