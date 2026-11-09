import { defineConfig } from '@playwright/test';

/**
 * End-to-end: the console against the real API code (in-memory store, dev only), so scoring,
 * the circle and check-ins are exercised for real. Serial: the tests share one game.
 */
const API_PORT = 8091;
export const ORGANIZER_TOKEN = 'e2e-organizer';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://localhost:4174', trace: 'off' },
  webServer: [
    {
      command: 'pnpm --filter @meetspace/api exec tsx src/dev/memory-server.ts',
      url: `http://localhost:${API_PORT}/healthz`,
      env: { PORT: String(API_PORT), OTEL_SDK_DISABLED: 'true', ORGANIZER_TOKEN, LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --port 4174 --strictPort',
      url: 'http://localhost:4174/console/',
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
