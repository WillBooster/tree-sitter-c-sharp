import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/unit/browser.test.ts'];
// Times a parse, so it runs alone before the other tests, which compile the parser and start browsers and Workers.
const PerformanceTests = ['test/unit/performance.test.ts'];

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'performance', include: PerformanceTests, sequence: { groupOrder: 0 } } },
      {
        test: {
          name: 'node',
          include: ['test/unit/**/*.test.ts'],
          exclude: [...BrowserTests, ...PerformanceTests],
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: 'browser',
          include: BrowserTests,
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
