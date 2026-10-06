import { describe, expect, it } from "vitest";

import { isManagedNavActive, MANAGED_PRIMARY_NAV, MANAGED_SECONDARY_NAV } from "./nav";

describe("managed nav", () => {
  it("marks every primary and secondary nav item as implemented", () => {
    const all = [...MANAGED_PRIMARY_NAV, ...MANAGED_SECONDARY_NAV];
    expect(all.every((i) => i.implemented)).toBe(true);
    expect(all.find((i) => i.href === "/review")?.badge).toBe(4);
  });

  it("matches active routes", () => {
    expect(isManagedNavActive("/", "/")).toBe(true);
    expect(isManagedNavActive("/connections", "/")).toBe(false);
    expect(isManagedNavActive("/connections", "/connections")).toBe(true);
    expect(isManagedNavActive("/usage", "/usage")).toBe(true);
  });
});
