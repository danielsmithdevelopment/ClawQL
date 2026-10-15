/**
 * App Store / Play submission posture for PhoneApprove v1.
 *
 * Decisions (2026-10-15):
 * - Sell nothing in the app: plan is read-only; billing stays on the web.
 * - Fixture / sample data only in explicit demo modes, never as silent production fallback.
 * - Gateway / Automations / Settings ship read-only in v1.
 *
 * @see docs/specs/mobile/app-review-v1-safety.md
 */
import { Effect } from "effect";

import type { MobileSession } from "../domain/schemas";
import { loadMobileConfigEffect, type MobileConfig } from "./config";

/** True in Maestro / EXPO_PUBLIC_CLAWQL_FIXTURE=1 / baked fixture extra. */
export function isFixtureBuild(config: MobileConfig): boolean {
  return config.fixtureMode;
}

/**
 * In-app commerce (IAP subscribe, Stripe portal CTAs) is demo-only for v1.
 * Production store builds show plan status read-only — org billing on the web.
 */
export function allowsInAppCommerce(config: MobileConfig): boolean {
  return isFixtureBuild(config);
}

/**
 * Sample / fixture payloads may render only when the build is fixture-mode
 * or the signed-in session is an explicit reviewer demo (must be labeled in UI).
 */
export function allowsDemoData(
  session: MobileSession | null | undefined,
  config: MobileConfig
): boolean {
  if (isFixtureBuild(config)) return true;
  if (session?.reviewerDemo === true) return true;
  if (session?.accessToken?.startsWith("fixture-")) return true;
  return false;
}

/** Surfaces kept browse-only in the first store release. */
export const V1_READ_ONLY_SURFACES = ["gateway", "automations", "settings"] as const;
export type V1ReadOnlySurface = (typeof V1_READ_ONLY_SURFACES)[number];

export function isV1ReadOnlySurface(surface: string): surface is V1ReadOnlySurface {
  return (V1_READ_ONLY_SURFACES as readonly string[]).includes(surface);
}

export function loadReleasePolicyEffect(): Effect.Effect<{
  readonly config: MobileConfig;
  readonly allowsInAppCommerce: boolean;
  readonly isFixtureBuild: boolean;
}> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    return {
      config,
      allowsInAppCommerce: allowsInAppCommerce(config),
      isFixtureBuild: isFixtureBuild(config),
    };
  });
}
