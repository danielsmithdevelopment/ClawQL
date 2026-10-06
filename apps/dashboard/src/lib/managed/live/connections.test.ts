import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { listManagedConnectionsEffect, mapCustomSourceToConnection } from "./connections";

describe("managed connections live layer", () => {
  it("maps custom sources into connection rows", () => {
    const row = mapCustomSourceToConnection({
      id: "github",
      name: "GitHub",
      kind: "openapi",
      addedAt: new Date().toISOString(),
      url: "https://api.github.com/openapi.json",
      trusted: true,
    });
    expect(row).toMatchObject({
      id: "github",
      name: "GitHub",
      status: "connected",
      statusLabel: "Connected",
    });
    expect(row.summary).toContain("openapi");
    expect(row.ops.readsAllowed).toBeGreaterThan(0);
  });

  it("lists live connections from a temp sources.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawql-managed-conn-"));
    writeFileSync(
      join(dir, "sources.json"),
      `${JSON.stringify(
        {
          version: 1,
          sources: [
            {
              id: "acme-crm",
              name: "Acme CRM",
              kind: "openapi",
              addedAt: "2026-10-01T00:00:00.000Z",
              url: "https://crm.example/openapi.json",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const listed = await Effect.runPromise(
      listManagedConnectionsEffect({
        CLAWQL_MANAGED_DATA_SOURCE: "live",
        CLAWQL_HOME: dir,
      }),
    );
    expect(listed.source).toBe("live");
    expect(listed.connections.map((c) => c.id)).toContain("acme-crm");
  });
});
