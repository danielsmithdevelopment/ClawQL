/**
 * CI-friendly PhoneApprove e2e on fixture web export (iPhone viewport).
 * Mirrors Maestro MOB-20…23 without requiring a simulator.
 */
import { expect, test, type Page } from "@playwright/test";

async function signInFixture(page: Page) {
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.getByTestId("sign-in-fixture").click();
  await page.getByTestId("home-screen").waitFor({ state: "visible", timeout: 20_000 });
}

test.describe("PhoneApprove store_iap + Face ID (fixture web)", () => {
  test("MOB-20 subscribe Pro sandbox upgrades plan", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-plan-billing").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("profile-subscribe-pro")).toBeVisible();
    await page.getByTestId("profile-subscribe-pro").click();
    await page.getByTestId("profile-note").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.getByTestId("profile-plan-label")).toContainText(/Pro/i);
    await expect(page.getByTestId("profile-plan-mode")).toContainText(/store_iap/i);
    await expect(page.getByTestId("profile-bio-capability")).toBeVisible();
  });

  test("MOB-21 restore + manage subscriptions affordance", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-plan-billing").scrollIntoViewIfNeeded();
    await page.getByTestId("profile-subscribe-pro").click();
    await page.getByTestId("profile-note").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("profile-restore-purchases").click();
    await page.getByTestId("profile-note").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.getByTestId("profile-manage-subscriptions")).toBeVisible();
    await expect(page.getByTestId("profile-plan-label")).toContainText(/Pro/i);
  });

  test("MOB-22 Face ID App Lock lock and unlock", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await expect(page.getByTestId("profile-bio-capability")).toContainText(/Face ID|Touch ID|Face unlock/i);
    const appLockRow = page.getByTestId("pref-app-lock");
    await appLockRow.scrollIntoViewIfNeeded();
    await appLockRow.getByText("App Lock", { exact: true }).click({ force: true });
    await page.getByTestId("profile-lock-now").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("profile-lock-now").click();
    await expect(page.getByTestId("app-lock-screen")).toBeVisible();
    await expect(page.getByTestId("app-lock-unlock")).toContainText(/Face ID|Touch ID|Face unlock|Unlock/i);
    await page.getByTestId("app-lock-unlock").click();
    await expect(page.getByTestId("profile-screen")).toBeVisible({ timeout: 15_000 });
  });

  test("MOB-24 Voice assistant lists pending", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-voice").filter({ visible: true }).first().click();
    await expect(page.getByTestId("voice-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("voice-dictate-fixture").filter({ visible: true }).first().click();
    await expect(page.getByTestId("voice-spoken").filter({ visible: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("voice-pending-count").filter({ visible: true }).first()
    ).toContainText(/Pending/i);
  });

  test("MOB-26 Memory explorer search and detail", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-memory").filter({ visible: true }).first().click();
    await expect(page.getByTestId("memory-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("memory-query").filter({ visible: true }).first().fill("Northwind");
    await page.getByTestId("memory-run-search").filter({ visible: true }).first().click();
    await expect(
      page.getByTestId("memory-row-ct_4471").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("memory-open-ct_4471").filter({ visible: true }).first().click();
    await expect(
      page.getByTestId("memory-detail-screen").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("memory-fields").filter({ visible: true }).first()).toBeVisible();
  });

  test("MOB-28 Sessions timeline", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-sessions").filter({ visible: true }).first().click();
    await expect(page.getByTestId("sessions-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("session-row-sess_7f2a91c4").filter({ visible: true }).first()
    ).toBeVisible();
  });

  test("MOB-29 Skills proposed and active", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-skills").filter({ visible: true }).first().click();
    await expect(page.getByTestId("skills-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("skill-proposed-contract-redline-check").filter({ visible: true }).first()
    ).toBeVisible();
    await expect(page.getByTestId("skills-active").filter({ visible: true }).first()).toBeVisible();
  });

  test("MOB-30 Connections and Settings network", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-connections").filter({ visible: true }).first().click();
    await expect(
      page.getByTestId("connections-screen").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("connection-account-gh_work").filter({ visible: true }).first()
    ).toBeVisible();
    await page.goto("/settings", { waitUntil: "networkidle" });
    await expect(page.getByTestId("settings-network").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("settings-privacy").filter({ visible: true }).first()).toBeVisible();
  });

  test("MOB-27 API keys issue and secret", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-keys").filter({ visible: true }).first().click();
    await expect(page.getByTestId("keys-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("keys-issue").filter({ visible: true }).first().click();
    await expect(page.getByTestId("keys-secret").filter({ visible: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("keys-secret-value").filter({ visible: true }).first()
    ).toContainText(/cqk_fixture_/);
  });

  test("MOB-25 Voice start workflow + Shortcuts donation", async ({ page }) => {
    await signInFixture(page);
    await page.getByTestId("tab-profile").first().click();
    await page.getByTestId("profile-open-voice").filter({ visible: true }).first().click();
    await expect(page.getByTestId("voice-screen").filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByTestId("voice-suggest-start-standup-digest")
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByTestId("workflows-screen").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("workflows-runs").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("workflows-open-voice").filter({ visible: true }).first().click();
    await page.getByTestId("voice-shortcut-list_pending").filter({ visible: true }).first().click();
    await expect(
      page.getByTestId("voice-shortcut-note").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("MOB-23 Spend upgrade CTA opens Profile billing", async ({ page }) => {
    await signInFixture(page);
    await page.goto("/spend", { waitUntil: "networkidle" });
    // Expo static export can leave a hidden duplicate host — prefer the visible one.
    const spend = page.getByTestId("spend-screen").filter({ visible: true }).first();
    await expect(spend).toBeVisible({ timeout: 15_000 });
    await expect(spend.getByTestId("spend-plan-label")).toContainText(/Free/i);
    await expect(spend.getByTestId("spend-upgrade-cta")).toBeVisible();
    await spend.getByTestId("spend-open-plan-billing").click();
    await expect(
      page.getByTestId("profile-plan-billing").filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("profile-subscribe-pro").filter({ visible: true }).first()
    ).toBeVisible();
  });
});
