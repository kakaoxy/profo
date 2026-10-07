import { defineConfig, devices } from "@playwright/test";
import fs from "fs";

// 加载 frontend/.env.local（E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 等测试凭据，严禁硬编码）。
// pnpm 严格隔离下 @next/env（仅 next 的传递依赖）不可从包根 resolve，
// 借 next 包真实路径（.pnpm store 内）动态定位，版本升级自动跟随，无硬编码版本号。
/* eslint-disable @typescript-eslint/no-require-imports */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { loadEnvConfig } = require(
  require.resolve("@next/env", {
    paths: [fs.realpathSync(require.resolve("next"))],
  }),
) as {
  loadEnvConfig: (
    dir: string,
    env: string,
    silent: {
      info: (msg: string) => void;
      error: (msg: string) => void;
      warn: (msg: string) => void;
    },
  ) => void;
};
loadEnvConfig(__dirname, process.env.NODE_ENV ?? "development", {
  info: () => {},
  error: console.error,
  warn: () => {},
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
