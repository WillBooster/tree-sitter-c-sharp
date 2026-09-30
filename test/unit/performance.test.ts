import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';

const Root = path.join(import.meta.dirname, '../..');
// The Wasm build is the one the package ships.
const WasmPath = path.join(Root, 'tree-sitter-c_sharp.wasm');
await Parser.init();
const parser = new Parser();
parser.setLanguage(await Language.load(WasmPath));

function mtime(name: string): number {
  return fs.statSync(path.join(Root, name)).mtimeMs;
}

// `bun run test` does not rebuild the Wasm build, so a local run would time a stale one after a source edit that
// brings the slowdown back. CI runs `bun run build/ci` first.
test('uses a Wasm build built from the current parser', () => {
  // `tree-sitter build --wasm` (`bun run build-wasm`, `bun start`) compiles src/parser.c without regenerating it
  // from grammar.js, so a fresh Wasm build alone does not prove it reflects the grammar.
  expect(
    mtime('grammar.js') > mtime('src/parser.c'),
    'grammar.js changed after src/parser.c was generated; run `bun run build/ci`'
  ).toBe(false);
  expect(
    Math.max(mtime('src/parser.c'), mtime('src/scanner.c')) > fs.statSync(WasmPath).mtimeMs,
    'src/ changed after the Wasm build was built; run `bun run build/ci`'
  ).toBe(false);
});

// Consumers parse files being edited, so recovering from many errors must stay linear. Linear recovery
// takes about 0.07 s here. The timeout leaves the limit to the assertion, which reports the elapsed time, instead of
// Vitest's default 5 s timeout.
test('recovers from an error on each of 10,000 lines in linear time', { timeout: 60_000 }, () => {
  const start = performance.now();
  const tree = parser.parse('$ a\n'.repeat(10_000));
  const elapsed = performance.now() - start;
  if (!tree) throw new Error('The parser returned no tree');
  const { hasError } = tree.rootNode;
  tree.delete();
  expect(hasError).toBe(true);
  expect(elapsed).toBeLessThan(3000);
});
