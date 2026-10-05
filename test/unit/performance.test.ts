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

// Consumers parse files being edited, so recovering from many errors must stay linear: ten times the lines take about
// ten times as long, against a hundred times for quadratic recovery. The ratio catches a cost that grows faster than
// the input even on a slow CI runner; it would pass a parser that is uniformly slower, so the larger parse also has a
// generous ceiling, about 25 times the 0.2 s of CPU time it takes here. The parses are timed in the CPU time of the
// thread that runs them: wall-clock time is inflated unevenly by the test files running alongside, and the process's
// CPU time also counts the engine's background threads, which compile the Wasm build and collect garbage during the
// parses. 5,000 and 50,000 lines measured after warm-up parses and in alternation, each keeping its fastest run, give
// 10.8 to 12.3 in full local test runs; 18 leaves a margin over that and fails for growth faster than about n^1.25.
test('recovers from an error on each line in linear time', { timeout: 60_000 }, () => {
  const small = '$ a\n'.repeat(5000);
  const large = '$ a\n'.repeat(50_000);
  parseCpuTime(large);
  parseCpuTime(large);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 5; run++) {
    smallFastest = Math.min(smallFastest, parseCpuTime(small));
    largeFastest = Math.min(largeFastest, parseCpuTime(large));
  }
  expect(largeFastest / smallFastest).toBeLessThan(18);
  // process.threadCpuUsage reports microseconds.
  expect(largeFastest).toBeLessThan(5_000_000);
});

test.each(['@ ) ', '@ #:x/*c*/ '])(
  'recovers from a long malformed line containing %s in linear time',
  { timeout: 60_000 },
  (fragment) => {
    const small = 'class C { ' + fragment.repeat(1000) + '}';
    const large = 'class C { ' + fragment.repeat(10_000) + '}';
    parseCpuTime(large);
    parseCpuTime(large);
    let smallFastest = Infinity;
    let largeFastest = Infinity;
    for (let run = 0; run < 5; run++) {
      smallFastest = Math.min(smallFastest, parseCpuTime(small));
      largeFastest = Math.min(largeFastest, parseCpuTime(large));
    }
    expect(largeFastest / smallFastest).toBeLessThan(18);
    expect(largeFastest).toBeLessThan(5_000_000);
  }
);

function parseCpuTime(source: string): number {
  const start = process.threadCpuUsage();
  const tree = parser.parse(source);
  const { system, user } = process.threadCpuUsage(start);
  if (!tree) throw new Error('The parser returned no tree');
  const { hasError } = tree.rootNode;
  tree.delete();
  expect(hasError).toBe(true);
  return system + user;
}
