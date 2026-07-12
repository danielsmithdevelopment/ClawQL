import { describe, expect, it } from "vitest";
import { createPaymentAuditStore } from "./factory.js";

describe("createPaymentAuditStore postgres mode", () => {
  it("throws when postgres mode is selected without database config", () => {
    expect(() =>
      createPaymentAuditStore({
        CLAWQL_PAYMENTS_AUDIT_STORE: "postgres",
        NODE_ENV: "production",
      })
    ).toThrow(/CLAWQL_PAYMENTS_DATABASE_URL/);
  });
});
