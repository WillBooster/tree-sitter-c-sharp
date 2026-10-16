import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { generationInputMtime } from '../helpers/generationInputs.js';

import { Language, Parser } from '@willbooster/web-tree-sitter';

const Root = path.join(import.meta.dirname, '../..');
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
  expect(
    Math.max(generationInputMtime(Root), mtime('grammar.js')) > mtime('src/parser.c'),
    'generation inputs changed after src/parser.c was generated; run `bun run build/ci`'
  ).toBe(false);
  expect(
    Math.max(
      mtime('src/parser.c'),
      mtime('src/scanner.c'),
      mtime('src/questionContext.h'),
      mtime('src/questionLiterals.h'),
      mtime('src/nullableRank.h'),
      mtime('src/nullableTypes.h'),
      mtime('src/identifierCharacters.h'),
      mtime('src/tree_sitter/parser.h')
    ) > fs.statSync(WasmPath).mtimeMs,
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

const expressionContexts = [
  { name: 'top level', wrap: (expression: string): string => `var x = ${expression};` },
  {
    name: 'method initializer',
    wrap: (expression: string): string => `class C { void M() { var x = ${expression}; } }`,
  },
  {
    name: 'return statement',
    wrap: (expression: string): string => `class C { object M() { return ${expression}; } }`,
  },
  { name: 'field initializer', wrap: (expression: string): string => `class C { object x = ${expression}; }` },
];

const expressionSources = [
  { name: 'identifier ternaries', expression: (count: number): string => 'a ? a : '.repeat(count) + 'a' },
  { name: 'type-test ternaries', expression: (count: number): string => 'a is T ? a : '.repeat(count) + 'a' },
  { name: 'array-type-test ternaries', expression: (count: number): string => 'a is T[] ? a : '.repeat(count) + 'a' },
  { name: 'element-access ternary arms', expression: (count: number): string => 'a ? b?[0] : '.repeat(count) + 'a' },
  { name: 'as-expression ternaries', expression: (count: number): string => '(a as T) ? a : '.repeat(count) + 'a' },
  { name: 'nullable-type-test ternaries', expression: (count: number): string => 'a is T? ? a : '.repeat(count) + 'a' },
  {
    name: 'nullable-array-type-test ternaries',
    expression: (count: number): string => 'a is T?[] ? 1 : '.repeat(count) + '0',
  },
];

const questionSources = [
  ...['T?', 'int?[]', 'int?[,]', 'System.Int32?[]', 'G<int>?[]'].map((type) => ({
    name: `nullable ${type} properties`,
    source: (count: number): string =>
      'class C {' +
      Array.from({ length: count }, (_, index) => `public ${type} P${index} { get; set; }`).join(' ') +
      '}',
    node: 'nullable_type',
  })),
  {
    name: 'nullable array methods',
    source: (count: number): string =>
      'class C {' + Array.from({ length: count }, (_, index) => `int?[] M${index}() { return null; }`).join(' ') + '}',
    node: 'nullable_type',
  },
  {
    name: 'numeric ternaries',
    source: (count: number): string =>
      'class C { void M() { var x = ' +
      Array.from({ length: count }, (_, index) => `c${index} ? 1 : `).join('') +
      '0; } }',
    node: 'conditional_expression',
  },
  ...expressionSources.flatMap(({ name, expression }) =>
    expressionContexts.map((context) => ({
      name: `${name} at ${context.name}`,
      source: (count: number): string => context.wrap(expression(count)),
      node: 'conditional_expression',
    }))
  ),
  {
    name: 'collection ternaries',
    source: (count: number): string => 'class C { void M() { var x = ' + 'c ? [1] : '.repeat(count) + '[0]; } }',
    node: 'conditional_expression',
  },
  {
    name: 'nullable type tests and ternaries',
    source: (count: number): string => 'class C { void M() { var x = ' + 'a is T? ? 1 : '.repeat(count) + '0; } }',
    node: 'nullable_type',
  },
];

test.each(questionSources)('parses repeated $name in linear time', { timeout: 60_000 }, ({ source, node }) => {
  const small = source(200);
  const large = source(2000);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType(node)).toHaveLength(2000);
  } finally {
    tree.delete();
  }
  parseCpuTime(large, false);
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  for (let run = 0; run < 3; run++) {
    smallFastest = Math.min(smallFastest, parseCpuTime(small, false));
    largeFastest = Math.min(largeFastest, parseCpuTime(large, false));
  }
  expect(largeFastest / smallFastest).toBeLessThan(18);
  expect(largeFastest).toBeLessThan(5_000_000);
});

function parseCpuTime(source: string, expectedErrors = true): number {
  const start = process.threadCpuUsage();
  let samples = 0;
  let elapsed = 0;
  let allMatchErrors = true;
  // Short parses can take less than one CPU timer tick on Linux ARM. Measure a batch before averaging.
  do {
    const tree = parser.parse(source);
    if (!tree) throw new Error('The parser returned no tree');
    allMatchErrors &&= tree.rootNode.hasError === expectedErrors;
    tree.delete();
    samples++;
    const { system, user } = process.threadCpuUsage(start);
    elapsed = system + user;
  } while (elapsed < 50_000);
  expect(allMatchErrors).toBe(true);
  return elapsed / samples;
}

test.each([
  { name: 'regular', open: '$"{', close: '}"' },
  { name: 'verbatim', open: '$@"{', close: '}"' },
  { name: 'raw', open: '$$"""{{', close: '}}"""' },
])('returns a tree for deeply nested $name interpolation after a question', ({ open, close }) => {
  const nested = open.repeat(5000) + '1' + close.repeat(5000);
  for (const prefix of ['a ? 1 : ', 'x is T?[] ? [a] : ']) {
    const source = `class C { void M() { var result = ${prefix}${nested}; } }`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.endIndex).toBe(source.length);
    } finally {
      tree.delete();
    }
    const subsequent = parser.parse('var result = a?[0];')!;
    try {
      expect(subsequent.rootNode.hasError).toBe(false);
      expect(subsequent.rootNode.descendantsOfType('conditional_access_expression')[0]?.text).toBe('a?[0]');
    } finally {
      subsequent.delete();
    }
  }
});
