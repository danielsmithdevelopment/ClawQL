import { describe, expect, it, vi } from "vitest";

import {
  ID_JAG_ISSUER_SHARED_KEY_WARNING,
  MCP_OAUTH_AUDIT_DISABLED_WARNING,
  MCP_OAUTH_HS256_ONLY_WARNING,
  warnIfIdJagIssuerSharesMcpOAuthKey,
  warnIfMcpOAuthAuditDisabled,
  warnIfMcpOAuthHs256Only,
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

describe("warnIfMcpOAuthHs256Only", () => {
  it("warns when MCP OAuth is enabled with HS256 secret and no RS256 key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthHs256Only({
      CLAWQL_MCP_OAUTH_ENABLED: "1",
      CLAWQL_MCP_OAUTH_SIGNING_SECRET: "test-mcp-oauth-signing-secret-32b!!",
    });
    expect(warn).toHaveBeenCalledWith(MCP_OAUTH_HS256_ONLY_WARNING);
    warn.mockRestore();
  });

  it("does not warn when RS256 private key path is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthHs256Only({
      CLAWQL_MCP_OAUTH_ENABLED: "1",
      CLAWQL_MCP_OAUTH_SIGNING_SECRET: "test-mcp-oauth-signing-secret-32b!!",
      CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH: "/keys/as.pem",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns when signing secret alone enables MCP OAuth (implicit enable)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthHs256Only({
      CLAWQL_MCP_OAUTH_SIGNING_SECRET: "test-mcp-oauth-signing-secret-32b!!",
    });
    expect(warn).toHaveBeenCalledWith(MCP_OAUTH_HS256_ONLY_WARNING);
    warn.mockRestore();
  });

  it("does not warn when only RS256 is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthHs256Only({
      CLAWQL_MCP_OAUTH_ENABLED: "1",
      CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH: "/keys/as.pem",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn when MCP OAuth is fully disabled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfMcpOAuthHs256Only({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("warnIfIdJagIssuerSharesMcpOAuthKey", () => {
  it("warns when issuer falls back to MCP OAuth signing material", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfIdJagIssuerSharesMcpOAuthKey({
      CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH: "/keys/as.pem",
    });
    expect(warn).toHaveBeenCalledWith(ID_JAG_ISSUER_SHARED_KEY_WARNING);
    warn.mockRestore();
  });

  it("does not warn when dedicated issuer key is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfIdJagIssuerSharesMcpOAuthKey({
      CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH: "/keys/issuer.pem",
      CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH: "/keys/as.pem",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
