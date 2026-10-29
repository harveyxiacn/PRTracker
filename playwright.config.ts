// Visual QA: renders every screen with the in-memory demo data (?demo=1) in several
// languages and saves screenshots for review. Run `npm run build` first, then
// `npm run test:visual` (the preview server is started automatically).
import { defineConfig, devices } from '@playwright/test';

// PW_PORT lets a second checkout run while another preview server holds the default port.
// PW_BASE_URL points at a preview server that is already running (started by the caller).
const port = Number(process.env.PW_PORT) || 4173;
const external = process.env.PW_BASE_URL;

export default defineConfig({
  testDir: './tests/visual',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: external ? undefined : {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
