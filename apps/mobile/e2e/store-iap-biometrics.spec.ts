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
