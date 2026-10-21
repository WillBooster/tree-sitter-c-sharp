import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const BrowserTests = ['test/unit/browser.test.ts'];
const PerformanceTests = ['test/unit/performance.test.ts'];
const CliTests = [
  'test/unit/corpus.test.ts',
  'test/unit/examples.test.ts',
  'test/unit/incremental.test.ts',
  'test/unit/wasm.test.ts',
];

export default defineConfig({
  test: {
    // tsconfig.json declares the `vitest/globals` types, so the runner must provide those globals.
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/unit/**/*.test.ts'],
          exclude: [...BrowserTests, ...PerformanceTests, ...CliTests],
        },
      },
      {
        test: {
          name: 'cli',
          include: CliTests,
          // Cold builds share a parser cache and can exceed the CLI loader's 30-second lock wait.
          fileParallelism: false,
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
          // Keep compiler tier changes and lazy compilation outside the CPU samples.
          execArgv: ['--no-liftoff', '--no-wasm-lazy-compilation'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
