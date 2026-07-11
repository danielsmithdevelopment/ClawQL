import { describe, expect, it } from "vitest";
import { dedicatedStackName } from "./automation.js";

describe("dedicatedStackName", () => {
  it("lowercases and sanitizes tenant id", () => {
    expect(dedicatedStackName("Acme Corp")).toBe("dedicated-acme-corp");
    expect(dedicatedStackName("tenant_01")).toBe("dedicated-tenant-01");
  });
});
