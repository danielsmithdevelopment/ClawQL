import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { packagePaths } from "./paths.js";

describe("observability packagePaths Phase 4/5 assets", () => {
  it("resolves Alloy config and LGTM compose/helm paths", () => {
    expect(existsSync(packagePaths.alloyConfig)).toBe(true);
    expect(existsSync(packagePaths.dockerCompose)).toBe(true);
    expect(existsSync(packagePaths.helmValues)).toBe(true);
    expect(readFileSync(packagePaths.alloyConfig, "utf8")).toContain("otelcol.receiver.otlp");
  });

  it("resolves default dashboard + alert catalog", () => {
    expect(existsSync(packagePaths.dashboards)).toBe(true);
    expect(existsSync(packagePaths.alerts)).toBe(true);
    const dashboard = JSON.parse(readFileSync(packagePaths.dashboards, "utf8")) as {
      uid?: string;
      title?: string;
    };
    expect(dashboard.uid || dashboard.title).toBeTruthy();
    const alerts = readFileSync(packagePaths.alerts, "utf8");
    expect(alerts).toContain("UnexpectedAgentToolUse");
  });

  it("resolves security compose stub + helm overlay", () => {
    expect(existsSync(packagePaths.dockerComposeSecurity)).toBe(true);
    expect(existsSync(packagePaths.helmSecurityOverlay)).toBe(true);
    const compose = readFileSync(packagePaths.dockerComposeSecurity, "utf8");
    expect(compose).toMatch(/Falco|Tetragon|Wazuh|security/i);
  });
});
