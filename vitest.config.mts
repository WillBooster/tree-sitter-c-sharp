import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/unit/browser.test.ts'];
const PerformanceTests = ['test/unit/performance.test.ts'];

export default defineConfig({
  test: {
    // tsconfig.json declares the `vitest/globals` types, so the runner must provide those globals.
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/unit/**/*.test.ts'],
          exclude: [...BrowserTests, ...PerformanceTests],
          globalSetup: ['test/unit/globalSetup.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: BrowserTests,
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
        },
      },
      {
        test: {
          name: 'performance',
          include: PerformanceTests,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
