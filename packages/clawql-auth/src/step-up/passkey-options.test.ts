import { describe, expect, it } from "vitest";

import {
  buildPasskeyAuthenticatorSelection,
  PASSKEY_AUTHENTICATOR_CATALOG,
  resolveAuthenticatorAttachment,
} from "./passkey-options.js";

describe("passkey authenticator selection", () => {
  it("defaults to offering both biometrics and hardware keys", () => {
    expect(resolveAuthenticatorAttachment()).toBeUndefined();
    expect(resolveAuthenticatorAttachment(undefined)).toBeUndefined();
    expect(buildPasskeyAuthenticatorSelection()).toEqual({
      residentKey: "required",
      userVerification: "required",
    });
  });

  it("maps hardware-only → cross-platform (YubiKey / Titan)", () => {
    expect(resolveAuthenticatorAttachment("hardware-only")).toBe("cross-platform");
    expect(buildPasskeyAuthenticatorSelection({ requirement: "hardware-only" })).toEqual({
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "cross-platform",
    });
  });

  it("maps biometric-only → platform (Face ID / Touch ID / Windows Hello)", () => {
    expect(resolveAuthenticatorAttachment("biometric-only")).toBe("platform");
    expect(buildPasskeyAuthenticatorSelection({ requirement: "biometric-only" })).toEqual({
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "platform",
    });
  });

  it("documents both platform and roaming authenticators", () => {
    expect(PASSKEY_AUTHENTICATOR_CATALOG.platform.some((s) => s.includes("Face ID"))).toBe(
      true
    );
    expect(PASSKEY_AUTHENTICATOR_CATALOG.platform.some((s) => s.includes("Touch ID"))).toBe(
      true
    );
    expect(PASSKEY_AUTHENTICATOR_CATALOG.roaming.some((s) => s.includes("YubiKey"))).toBe(true);
  });
});
