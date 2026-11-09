import { defineConfig } from '@playwright/test';

/** The 3D game against the real API code (in-memory store, dev only). WebGL runs on SwiftShader. */
const API_PORT = 8092;
export const ORGANIZER_TOKEN = 'e2e-organizer';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    {
      command: 'pnpm --filter @meetspace/api exec tsx src/dev/memory-server.ts',
      url: `http://localhost:${API_PORT}/healthz`,
      env: { PORT: String(API_PORT), OTEL_SDK_DISABLED: 'true', ORGANIZER_TOKEN, LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --port 4173 --strictPort',
      url: 'http://localhost:4173',
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
