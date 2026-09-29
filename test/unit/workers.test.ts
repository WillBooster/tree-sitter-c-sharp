import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestHarness, type TestHarness } from 'wrangler';

// The same Worker with and without Node.js compatibility, since the package must run in both.
const Configs = {
  'tree-sitter-c-sharp-test': 'wrangler.jsonc',
  'tree-sitter-c-sharp-test-no-nodejs-compat': 'wrangler.no-nodejs-compat.jsonc',
};

let server: TestHarness | undefined;

beforeAll(async () => {
  server = createTestHarness({
    workers: Object.values(Configs).map((config) => ({
      configPath: path.join(import.meta.dirname, '../fixtures/workers', config),
    })),
  });
  await server.listen();
}, 120_000);

afterAll(async () => {
  await server?.close();
});

test.each(Object.keys(Configs))('parses C# in Cloudflare Workers with the imported Wasm modules (%s)', async (name) => {
  const response = await server!
    .getWorker(name)
    .fetch('http://localhost/', { method: 'POST', body: 'class Program {}' });
  expect(await response.text()).toBe(
    '(compilation_unit (class_declaration name: (identifier) body: (declaration_list)))'
  );
});
