import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { slugifySourceId } from "./custom-sources-types.js";
import {
  readCustomSourcesFile,
  upsertCustomSource,
  writeCustomSourcesFile,
} from "./custom-sources-store.js";

describe("custom-sources-store", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const h of homes) {
      process.env.CLAWQL_HOME = h;
    }
  });

  it("slugifySourceId normalizes labels", () => {
    expect(slugifySourceId("My Cool API!")).toBe("my-cool-api");
  });

  it("writes and reads sources.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-sources-"));
    homes.push(home);
    await writeCustomSourcesFile(
      {
        version: 1,
        sources: [
          {
            id: "demo",
            name: "Demo",
            kind: "openapi",
            addedAt: "2026-01-01T00:00:00.000Z",
            url: "https://example.com/o.json",
          },
        ],
      },
      home
    );
    const file = await readCustomSourcesFile(home);
    expect(file.sources).toHaveLength(1);
    const raw = await readFile(join(home, "sources.json"), "utf8");
    expect(raw).toContain('"demo"');
  });

  it("upserts by id", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-sources-"));
    homes.push(home);
    await upsertCustomSource(
      {
        id: "a",
        name: "A",
        kind: "mcp",
        addedAt: "2026-01-01T00:00:00.000Z",
        mcpUrl: "http://127.0.0.1/mcp",
      },
      home
    );
    await upsertCustomSource(
      {
        id: "a",
        name: "A2",
        kind: "mcp",
        addedAt: "2026-01-02T00:00:00.000Z",
        mcpUrl: "http://127.0.0.1/mcp",
      },
      home
    );
    const file = await readCustomSourcesFile(home);
    expect(file.sources).toHaveLength(1);
    expect(file.sources[0]?.name).toBe("A2");
  });
});
