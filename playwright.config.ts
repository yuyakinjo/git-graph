import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

/**
 * E2E テスト。
 *
 * Tauri の WebView は Playwright から操作できないので、フロントは vite の dev server を
 * Chromium で開き、`invoke` を Rust のブリッジ (src-tauri/src/bin/e2e-bridge.rs) へ転送する。
 * git 操作はアプリと同じ Rust のコードが、テストごとに用意した実リポジトリに対して行う。
 * 仕組みは e2e/fixtures.ts を参照。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1480, height: 920 } },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
