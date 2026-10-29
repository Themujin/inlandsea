import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// E2E runs against the static export in out/ (run `npm run build` first).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx serve out -l ${PORT} --no-clipboard`,
    url: `http://localhost:${PORT}/en/`,
    reuseExistingServer: !process.env.CI,
  },
});
