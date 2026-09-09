import { test, expect } from "@playwright/test";
import { money } from "../lib/format.js";

// The one thing that must always hold: the figure on screen is the figure the
// API serves, formatted the same way. Analytics tile 1 is the year estimate;
// Products tile 4 for China is that partner's estimate.

const USER = process.env.PORTAL_USER || "jamarik";
const PASS = process.env.PORTAL_PASSWORD || "change-me-in-vercel";

async function login(page) {
  await page.goto("/login");
  await page.fill("#username", USER);
  await page.fill("#password", PASS);
  // The cookie is set by the POST; on a cold dev server the client-side
  // redirect can stall while "/" compiles, so navigate directly once the login
  // response has arrived rather than waiting on the router.
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60_000 }),
    page.click("button[type=submit]"),
  ]);
  expect(res.ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("table.dt tbody tr").first().waitFor({ timeout: 120_000 });
}

const tileValue = async (page, index) => {
  const text = await page.locator("div.rounded-lg.border-l-\\[3px\\]").nth(index).innerText();
  return text.split("\n").map((s) => s.trim()).filter(Boolean)[1];
};

test("screen figures equal the API estimate", async ({ page }) => {
  await login(page);

  // Products, China, 2024 → tile 4 is the partner estimate.
  await page.click('[role=tab]:has-text("Products")');
  await page.locator('select[aria-label="Year"]').waitFor({ timeout: 60_000 });
  await page.selectOption('select[aria-label="Year"]', "2024");
  await page.selectOption('select[aria-label="Partner"]', "156");
  await expect(page.locator("p").filter({ hasText: /an estimated/ }).first()).toBeVisible({ timeout: 30_000 });
  const chinaTile = await tileValue(page, 3);
  const china = await (await page.request.get("/api/mirror?year=2024&partner=156")).json();
  expect(chinaTile).toBe(money(china.estimate.central));

  // Analytics, 2024 → tile 1 is the year estimate, the sum over partners.
  await page.click('[role=tab]:has-text("Corridors")');
  await expect(page.getByText("Revenue at stake (estimate)", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  const yearTile = await tileValue(page, 0);
  const all = await (await page.request.get("/api/mirror?year=2024&partner=all")).json();
  expect(yearTile).toBe(money(all.estimate.central));
});
