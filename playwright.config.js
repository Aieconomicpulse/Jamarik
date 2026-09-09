// Smoke test against a running portal. Credentials come from the environment;
// .env.local is read here so the same values the app uses log the test in.
const fs = require("node:fs");
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: process.env.BASE_URL || "http://localhost:3000", viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
