import { describe, expect, it } from "vitest";

import { isManagedNavActive, MANAGED_PRIMARY_NAV, MANAGED_SECONDARY_NAV } from "./nav";

describe("managed nav", () => {
  it("includes Home, Connections, and Usage as implemented", () => {
    const all = [...MANAGED_PRIMARY_NAV, ...MANAGED_SECONDARY_NAV];
    expect(all.find((i) => i.href === "/")?.implemented).toBe(true);
    expect(all.find((i) => i.href === "/connections")?.implemented).toBe(true);
    expect(all.find((i) => i.href === "/usage")?.implemented).toBe(true);
  });

  it("matches active routes", () => {
    expect(isManagedNavActive("/", "/")).toBe(true);
    expect(isManagedNavActive("/connections", "/")).toBe(false);
    expect(isManagedNavActive("/connections", "/connections")).toBe(true);
    expect(isManagedNavActive("/usage", "/usage")).toBe(true);
  });
});
