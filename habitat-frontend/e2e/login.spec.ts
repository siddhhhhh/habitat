import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e@test.com";
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? "password123";

test.describe("Login flow", () => {
  test("unauthenticated user is redirected from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login form rejects empty submission", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: /sign in|log ?in/i });
    await submit.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid credentials reach the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in|log ?in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
