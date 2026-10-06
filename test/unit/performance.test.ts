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

// Thread CPU time excludes competing test files and background compilation. The growth limit permits roughly n^1.25
// scaling across a tenfold input increase; the absolute limit also catches a uniformly slow parser.
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

test.each(['@ ) ', '@ # ', '@ #:x/*c*/ '])(
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

test.each(['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029'])(
  'recovers from malformed directive tails across %j line endings in linear time',
  { timeout: 60_000 },
  (newline) => {
    const line = '#pragma warning disable X #:x' + newline;
    const small = line.repeat(500) + 'class C {}';
    const large = line.repeat(5000) + 'class C {}';
    parseCpuTime(large);
    let smallFastest = Infinity;
    let largeFastest = Infinity;
    for (let run = 0; run < 3; run++) {
      smallFastest = Math.min(smallFastest, parseCpuTime(small));
      largeFastest = Math.min(largeFastest, parseCpuTime(large));
    }
    expect(largeFastest / smallFastest).toBeLessThan(18);
    expect(largeFastest).toBeLessThan(5_000_000);
  }
);

function parseCpuTime(source: string): number {
  const start = process.threadCpuUsage();
  let samples = 0;
  let elapsed = 0;
  let allHaveErrors = true;
  // Short parses can take less than one CPU timer tick on Linux ARM. Measure a batch before averaging.
  do {
    const tree = parser.parse(source);
    if (!tree) throw new Error('The parser returned no tree');
    allHaveErrors &&= tree.rootNode.hasError;
    tree.delete();
    samples++;
    const { system, user } = process.threadCpuUsage(start);
    elapsed = system + user;
  } while (elapsed < 50_000);
  expect(allHaveErrors).toBe(true);
  return elapsed / samples;
}
