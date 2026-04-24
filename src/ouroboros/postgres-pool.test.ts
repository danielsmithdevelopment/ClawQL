import { describe, expect, it } from "vitest";
import { __testUtils } from "./postgres-pool.js";

describe("resolveOuroborosPoolConfig", () => {
  it("prefers CLAWQL_OUROBOROS_DATABASE_URL when present", () => {
    const out = __testUtils.resolveOuroborosPoolConfig({
      CLAWQL_OUROBOROS_DATABASE_URL: "postgres://u:p@db:5432/app",
      CLAWQL_OUROBOROS_DB_HOST: "ignored",
      CLAWQL_OUROBOROS_DB_USER: "ignored",
      CLAWQL_OUROBOROS_DB_NAME: "ignored",
    } as NodeJS.ProcessEnv);
    expect(out).toBe("postgres://u:p@db:5432/app");
  });

  it("builds config from split CLAWQL_OUROBOROS_DB_* env vars", () => {
    const out = __testUtils.resolveOuroborosPoolConfig({
      CLAWQL_OUROBOROS_DB_HOST: "clawql-postgres",
      CLAWQL_OUROBOROS_DB_PORT: "5432",
      CLAWQL_OUROBOROS_DB_USER: "clawql",
      CLAWQL_OUROBOROS_DB_PASSWORD: "secret",
      CLAWQL_OUROBOROS_DB_NAME: "clawql_ouroboros",
    } as NodeJS.ProcessEnv);
    expect(out).toEqual({
      host: "clawql-postgres",
      port: 5432,
      user: "clawql",
      password: "secret",
      database: "clawql_ouroboros",
      max: 4,
    });
  });

  it("returns null when required split env vars are missing", () => {
    const out = __testUtils.resolveOuroborosPoolConfig({
      CLAWQL_OUROBOROS_DB_HOST: "clawql-postgres",
      CLAWQL_OUROBOROS_DB_NAME: "clawql_ouroboros",
    } as NodeJS.ProcessEnv);
    expect(out).toBeNull();
  });
});
