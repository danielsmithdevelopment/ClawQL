import { describe, expect, it } from "vitest";
import { pendingStoreBackend, requiresSharedPendingPostgres } from "./pending-store-backend.js";

describe("pendingStoreBackend", () => {
  it("defaults to sqlite for single-node self-host", () => {
    expect(pendingStoreBackend({})).toBe("sqlite");
  });

  it("selects postgres when URL is set", () => {
    expect(
      pendingStoreBackend({ CLAWQL_PENDING_DATABASE_URL: "postgres://localhost/clawql_pending" })
    ).toBe("postgres");
  });

  it("requires postgres for managed multi-node signals", () => {
    expect(requiresSharedPendingPostgres({ CLAWQL_MANAGED_GATEWAY: "1" })).toBe(true);
    expect(requiresSharedPendingPostgres({ CLAWQL_GATEWAY_REPLICAS: "2" })).toBe(true);
    expect(requiresSharedPendingPostgres({ CLAWQL_CONSOLE_SURFACE: "cloud" })).toBe(true);
    expect(pendingStoreBackend({ CLAWQL_MANAGED_GATEWAY: "1" })).toBe("postgres");
  });

  it("honors explicit file/sqlite overrides", () => {
    expect(pendingStoreBackend({ CLAWQL_PENDING_STORE: "file" })).toBe("file");
    expect(
      pendingStoreBackend({
        CLAWQL_PENDING_STORE: "sqlite",
        CLAWQL_PENDING_DATABASE_URL: "postgres://x",
      })
    ).toBe("sqlite");
  });
});
