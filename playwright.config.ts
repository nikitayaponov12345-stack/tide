import { defineConfig, devices } from '@playwright/test';

// Смоук-проверка собранной игры: `npm run e2e` (сначала `npm run build`).
// PW_CHROMIUM — путь к своему Chromium, если браузер Playwright не скачан (на ноутбуке не нужен).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, browserName: 'chromium' },
    },
  ],
});
