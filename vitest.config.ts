import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/unit/browser.test.ts'];

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['test/unit/**/*.test.ts'], exclude: BrowserTests } },
      {
        test: {
          name: 'browser',
          include: BrowserTests,
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
