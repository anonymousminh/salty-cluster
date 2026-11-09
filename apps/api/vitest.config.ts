import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['test/**/*.test.ts'], env: { OTEL_SDK_DISABLED: 'true' } } });
