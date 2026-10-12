import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop packaging metadata", () => {
  it("declares Win / Mac / Linux electron-builder targets", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const b = pkg.build;
    assert.equal(b.appId, "com.clawql.desktop");
    assert.ok(b.mac?.target?.includes("dmg") || b.mac?.target?.some((t) => t === "dmg" || t?.target === "dmg"));
    assert.ok(b.win?.target?.includes("nsis"));
    assert.ok(b.linux?.target?.includes("AppImage"));
    assert.ok(b.linux?.target?.includes("deb"));
    assert.ok(
      (b.protocols ?? []).some(
        (p) => Array.isArray(p.schemes) && p.schemes.includes("clawql"),
      ),
      "build.protocols must include clawql for PhoneApprove deep links",
    );
    for (const script of ["dist:mac", "dist:win", "dist:linux", "dist:all", "dev:managed", "local:ready"]) {
      assert.ok(pkg.scripts[script], `missing script ${script}`);
    }
  });

  it("ships a build icon for all platforms", () => {
    assert.ok(existsSync(join(root, "build", "icon.png")), "build/icon.png required");
  });
});
