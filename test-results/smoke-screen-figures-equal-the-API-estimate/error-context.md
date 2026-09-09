# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.js >> screen figures equal the API estimate
- Location: e2e/smoke.spec.js:25:5

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e9]:
        - generic [ref=e10]: Jamarik
        - generic [ref=e11]: Lebanon · Customs Intelligence
      - paragraph [ref=e12]: Trade-mirror forensics for Lebanese customs. Restricted access — sign in with the credentials issued to you.
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Username
        - textbox "Username" [ref=e16]: jamarik
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - textbox "Password" [ref=e19]: localdev
      - button "Signing in…" [disabled] [ref=e20]
    - paragraph [ref=e21]: Sessions last 12 hours. Restricted distribution — the figures inside are risk indicators for investigation, not findings.
  - button "Open Next.js Dev Tools" [ref=e27] [cursor=pointer]
  - alert [ref=e31]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { money } from "../lib/format.js";
  3  | 
  4  | // The one thing that must always hold: the figure on screen is the figure the
  5  | // API serves, formatted the same way. Analytics tile 1 is the year estimate;
  6  | // Products tile 4 for China is that partner's estimate.
  7  | 
  8  | const USER = process.env.PORTAL_USER || "jamarik";
  9  | const PASS = process.env.PORTAL_PASSWORD || "change-me-in-vercel";
  10 | 
  11 | async function login(page) {
  12 |   await page.goto("/login");
  13 |   await page.fill("#username", USER);
  14 |   await page.fill("#password", PASS);
  15 |   await page.click("button[type=submit]");
> 16 |   await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  17 |   await page.locator("table.dt tbody tr").first().waitFor({ timeout: 90_000 });
  18 | }
  19 | 
  20 | const tileValue = async (page, index) => {
  21 |   const text = await page.locator("div.rounded-lg.border-l-\\[3px\\]").nth(index).innerText();
  22 |   return text.split("\n").map((s) => s.trim()).filter(Boolean)[1];
  23 | };
  24 | 
  25 | test("screen figures equal the API estimate", async ({ page }) => {
  26 |   await login(page);
  27 | 
  28 |   // Products, China, 2024 → tile 4 is the partner estimate.
  29 |   await page.selectOption('select[aria-label="Year"]', "2024");
  30 |   await page.selectOption('select[aria-label="Partner"]', "156");
  31 |   await expect(page.locator("p").filter({ hasText: /an estimated/ }).first()).toBeVisible({ timeout: 30_000 });
  32 |   const chinaTile = await tileValue(page, 3);
  33 |   const china = await (await page.request.get("/api/mirror?year=2024&partner=156")).json();
  34 |   expect(chinaTile).toBe(money(china.estimate.central));
  35 | 
  36 |   // Analytics, 2024 → tile 1 is the year estimate, the sum over partners.
  37 |   await page.click('[role=tab]:has-text("Analytics")');
  38 |   await expect(page.getByText("Revenue at stake (estimate)", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  39 |   const yearTile = await tileValue(page, 0);
  40 |   const all = await (await page.request.get("/api/mirror?year=2024&partner=all")).json();
  41 |   expect(yearTile).toBe(money(all.estimate.central));
  42 | });
  43 | 
```