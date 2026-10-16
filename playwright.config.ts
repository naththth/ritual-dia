import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174/ritual-dia/',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    acceptDownloads: true
  },
  webServer: { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174/ritual-dia/', reuseExistingServer: true }
});
