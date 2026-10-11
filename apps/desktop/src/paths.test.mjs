import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  BRIDGE_PORT,
  DASHBOARD_PORT,
  clawqlHome,
  desktopServiceEnv,
  desktopRootFromMain,
  repoRootFromMain,
} from "./paths.mjs";

describe("desktop paths", () => {
  it("exposes stable local ports", () => {
    assert.equal(DASHBOARD_PORT, 3040);
    assert.equal(BRIDGE_PORT, 8787);
  });

  it("defaults vault home under ~/.ClawQL", () => {
    const prev = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    try {
      assert.equal(clawqlHome(), join(homedir(), ".ClawQL"));
    } finally {
      if (prev !== undefined) process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prev;
    }
  });

  it("desktopServiceEnv forces localhost desktop mode", () => {
    const env = desktopServiceEnv("/tmp/clawql-home-test");
    assert.equal(env.CLAWQL_DESKTOP_MODE, "1");
    assert.equal(env.HOSTNAME, "127.0.0.1");
    assert.equal(env.PORT, "3040");
    assert.equal(env.CLAWQL_DASHBOARD_ALLOW_K8S_SYNC, "0");
    assert.match(env.CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL, /127\.0\.0\.1:8787/);
  });

  it("resolves repo + desktop roots from main module URL", () => {
    const mainUrl = pathToFileURL(join(process.cwd(), "src", "main.mjs")).href;
    const desktop = desktopRootFromMain(mainUrl);
    const repo = repoRootFromMain(mainUrl);
    assert.match(desktop.replace(/\\/g, "/"), /apps\/desktop$/);
    assert.equal(join(repo, "apps", "desktop"), desktop);
  });
});
