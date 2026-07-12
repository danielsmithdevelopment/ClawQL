import { describe, expect, it } from "vitest";
import { __testUtils } from "./postgres-pool.js";

describe("resolvePaymentsPoolConfig", () => {
  it("prefers CLAWQL_PAYMENTS_DATABASE_URL", () => {
    expect(
      __testUtils.resolvePaymentsPoolConfig({
        CLAWQL_PAYMENTS_DATABASE_URL: "postgres://payments/db",
        CLAWQL_INFERENCE_DATABASE_URL: "postgres://inference/db",
      })
    ).toBe("postgres://payments/db");
  });

  it("falls back to CLAWQL_INFERENCE_DATABASE_URL", () => {
    expect(
      __testUtils.resolvePaymentsPoolConfig({
        CLAWQL_INFERENCE_DATABASE_URL: "postgres://shared/db",
      })
    ).toBe("postgres://shared/db");
  });

  it("builds config from component vars", () => {
    expect(
      __testUtils.resolvePaymentsPoolConfig({
        CLAWQL_PAYMENTS_DB_HOST: "db.local",
        CLAWQL_PAYMENTS_DB_USER: "clawql",
        CLAWQL_PAYMENTS_DB_PASSWORD: "secret",
        CLAWQL_PAYMENTS_DB_NAME: "payments",
        CLAWQL_PAYMENTS_DB_PORT: "5433",
      })
    ).toEqual({
      host: "db.local",
      user: "clawql",
      password: "secret",
      database: "payments",
      port: 5433,
      max: 4,
    });
  });
});
