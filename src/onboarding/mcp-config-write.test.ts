import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  backupOnceEffect,
  parseMcpConfigJson,
  stripJsoncComments,
  writeFileAtomicEffect,
} from "./mcp-config-write.js";
import { resolvePinnedClawqlMcpLaunch } from "./mcp-config.js";
import { NPM_PACKAGE_VERSION } from "../host/npm-version.js";

describe("mcp-config-write (2.14)", () => {
  it("strips JSONC comments before parse", () => {
    const raw = `{
  // cursor comment
  "mcpServers": {
    /* block */
    "clawql": { "command": "node" }
  }
}`;
    expect(parseMcpConfigJson(raw)).toEqual({
      mcpServers: { clawql: { command: "node" } },
    });
    expect(stripJsoncComments(`"http://x"`)).toBe(`"http://x"`);
  });

  it("writes via temp+rename and preserves mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-mcp-atomic-"));
    const path = join(dir, "mcp.json");
    await writeFile(path, '{"a":1}\n', { mode: 0o640 });
    await Effect.runPromise(writeFileAtomicEffect(path, '{"b":2}\n'));
    expect(await readFile(path, "utf8")).toBe('{"b":2}\n');
    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o640);
  });

  it("backs up once to a stable .bak", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-mcp-bak-"));
    const path = join(dir, "mcp.json");
    await writeFile(path, '{"v":1}\n', "utf8");
    const first = await Effect.runPromise(backupOnceEffect(path));
    expect(first).toBe(`${path}.bak`);
    expect(await readFile(`${path}.bak`, "utf8")).toBe('{"v":1}\n');
    const second = await Effect.runPromise(backupOnceEffect(path));
    expect(second).toBeUndefined();
  });

  it("pins npx fallback to the running CLI version", () => {
    const launch = resolvePinnedClawqlMcpLaunch("/no/such/clawql.mjs", undefined);
    if (launch.command === "npx") {
      expect(launch.args).toEqual(["-y", `clawql-mcp@${NPM_PACKAGE_VERSION}`]);
    } else {
      expect(launch.command).toBe("node");
      expect(launch.args[0]).toMatch(/clawql-mcp\.mjs$/);
    }
  });
});
