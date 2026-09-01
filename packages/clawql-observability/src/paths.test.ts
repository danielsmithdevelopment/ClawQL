import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { packagePaths } from "./paths.js";

describe("observability packagePaths Phase 4b/5 assets", () => {
  it("resolves Alloy config + security sensors River fragments", () => {
    expect(existsSync(packagePaths.alloyConfig)).toBe(true);
    expect(existsSync(packagePaths.alloySecuritySensors)).toBe(true);
    const sensors = readFileSync(packagePaths.alloySecuritySensors, "utf8");
    expect(sensors).toContain('service_name = "clawql-falco"');
    expect(sensors).toContain('service_name = "clawql-tetragon"');
    expect(sensors).toContain('service_name = "clawql-wazuh"');
  });

  it("resolves correlation dashboard + alert catalog with shared labels", () => {
    expect(existsSync(packagePaths.dashboardsCorrelation)).toBe(true);
    expect(existsSync(packagePaths.alerts)).toBe(true);
    const dashboard = JSON.parse(readFileSync(packagePaths.dashboardsCorrelation, "utf8")) as {
      uid: string;
    };
    expect(dashboard.uid).toBe("clawql-langfuse-panguard");
    const alerts = readFileSync(packagePaths.alerts, "utf8");
    expect(alerts).toContain('service_name="clawql-panguard"');
    expect(alerts).toContain('service_name="clawql-falco"');
    expect(alerts).toContain('service_name="clawql-tetragon"');
  });

  it("resolves security compose + helm overlay", () => {
    expect(existsSync(packagePaths.dockerComposeSecurity)).toBe(true);
    expect(existsSync(packagePaths.helmSecurityOverlay)).toBe(true);
    const compose = readFileSync(packagePaths.dockerComposeSecurity, "utf8");
    expect(compose).toContain("security-sensors");
    expect(compose).toContain('profiles: ["security"]');
  });
});
