import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { generationInputMtime } from '../helpers/generationInputs.js';

type ErrorExpectation = boolean | 'unchecked';

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
    Math.max(generationInputMtime(Root), mtime('grammar.js'), mtime('script/generateIdentifierCharacters.mjs')) >
      mtime('src/parser.c'),
    'generation inputs changed after src/parser.c was generated; run `bun run build/ci`'
  ).toBe(false);
  const sourceInputMtimes = fs
    .readdirSync(path.join(Root, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(?:c|h|cc|cpp|cxx|hh|hpp|hxx)$/.test(file))
    .map((file) => mtime(path.join('src', file)));
  expect(
    Math.max(...sourceInputMtimes) > fs.statSync(WasmPath).mtimeMs,
    'src/ changed after the Wasm build was built; run `bun run build/ci`'
  ).toBe(false);
});

test('ships Wasm within raw and compressed size budgets', () => {
  const wasm = fs.readFileSync(WasmPath);
  expect(wasm.byteLength).toBeLessThanOrEqual(12.125 * 1024 * 1024);
  expect(gzipSync(wasm).byteLength).toBeLessThanOrEqual(1.375 * 1024 * 1024);
});

test('recovers from an error on each line in linear time', { timeout: 60_000 }, () => {
  expectBoundedGrowth('$ a\n'.repeat(5000), '$ a\n'.repeat(50_000));
});

test.each(['@ ) ', '@ # ', '@ #:x/*c*/ '])(
  'recovers from a long malformed line containing %s in linear time',
  { timeout: 60_000 },
  (fragment) => {
    expectBoundedGrowth('class C { ' + fragment.repeat(1000) + '}', 'class C { ' + fragment.repeat(10_000) + '}');
  }
);

test.each(['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029'])(
  'recovers from malformed directive tails across %j line endings in linear time',
  { timeout: 60_000 },
  (newline) => {
    const line = '#pragma warning disable X #:x' + newline;
    expectBoundedGrowth(line.repeat(500) + 'class C {}', line.repeat(5000) + 'class C {}');
  }
);

test.each([
  { name: 'lambda arguments', source: failedGenericLambdaSource },
  { name: 'following arguments', source: failedGenericSiblingSource },
])('bounds failed generic lookahead in $name', { timeout: 60_000 }, ({ source }) => {
  expectBoundedGrowth(source(100), source(1000), false);
});

function failedGenericLambdaSource(count: number): string {
  return 'var r = flag ? x is T?[,] ? f(x => ' + 'a < '.repeat(count) + 'a, g(a is T[]?[] ? [1] : c)) : a?[0] : end;';
}

function failedGenericSiblingSource(count: number): string {
  return (
    'var r = flag ? x is T?[,] ? f(a is T[]?[] ? [1] : c, ' +
    'a < '.repeat(count) +
    'a, g(a is T[]?[] ? [1] : c)) : a?[0] : end;'
  );
}

test.each([{ name: 'generic alternatives', source: repeatedGenericConditionalSource }])(
  'bounds ordinary suffix lookahead in $name',
  { timeout: 60_000 },
  ({ source }) => {
    expectBoundedGrowth(source(100), source(1000), false);
  }
);

function repeatedGenericConditionalSource(count: number): string {
  return 'var r = ' + 'x ? a?[0] : G<B,C> ? a : d ? [b] : '.repeat(count) + 'c;';
}

test.each(['a ? b : ', 'a is T z ? b : ', 'a is T[] z ? [1] : ', 'a is T?[] z ? [1] : ', 'a is (T,U)[] z ? [1] : '])(
  'bounds conditional chain proofs in case guards: %s',
  { timeout: 60_000 },
  (link) => {
    const source = (count: number): string => `switch (x) { case y when ${link.repeat(count)}b: break; }`;
    const large = source(1000);
    expectBoundedGrowth(source(100), large, false);
    const tree = parser.parse(large)!;
    try {
      expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(1000);
      expect(tree.rootNode.descendantsOfType('when_clause')[0]!.text).toBe(`when ${link.repeat(1000)}b`);
    } finally {
      tree.delete();
    }
  }
);

test('bounds ordinary bracket decisions in case guards', { timeout: 60_000 }, () => {
  expectBoundedGrowth(ordinaryGuardBrackets(100), ordinaryGuardBrackets(1000), false);
});

function ordinaryGuardBrackets(count: number): string {
  return `class C{void M(){switch(x){case y when b is not T?[]? == b ? ${'b?[0] : '.repeat(count)}f(a): L: break;}}}`;
}

test('bounds nested collection guards with typed alternatives', { timeout: 60_000 }, () => {
  const large = nestedCollectionGuardAlternative(1000);
  expectBoundedGrowth(nestedCollectionGuardAlternative(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(3);
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1003);
  } finally {
    tree.delete();
  }
});

function nestedCollectionGuardAlternative(count: number): string {
  return `class C { void M() { switch (x) { case y when a as T?[]? ? f ? [1] : x : a is T${'?[]'.repeat(count)}? ? 1 : x: break; } } }`;
}

test('bounds collection choices in typed guard alternatives', { timeout: 60_000 }, () => {
  const large = typedGuardAlternativeForest(1000);
  expectBoundedGrowth(typedGuardAlternativeForest(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(1002);
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(4);
  } finally {
    tree.delete();
  }
});

function typedGuardAlternativeForest(count: number): string {
  return `class C { void M() { switch(x){case y when a is T?[]? ? 1 : ${'c ? [1] : '.repeat(count)}d is T?[]? ? b : d: break;} } }`;
}

test('bounds collection choices before later AS guard alternatives', { timeout: 60_000 }, () => {
  const large = laterAsGuardAlternative(1000);
  expectBoundedGrowth(laterAsGuardAlternative(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(4);
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1003);
  } finally {
    tree.delete();
  }
});

function laterAsGuardAlternative(count: number): string {
  return `class C { void M() { switch(x){case y when a as T?[]? ? f ? [1] : x : f is T${'?[]'.repeat(count)}? ? c : d as U ? b : e: break;} } }`;
}

test('bounds nullable logical types before interpolation formats', { timeout: 60_000 }, () => {
  const large = logicalInterpolationTypes(1000);
  expectBoundedGrowth(logicalInterpolationTypes(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(0);
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1002);
    expect(tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual([': d:x']);
  } finally {
    tree.delete();
  }
});

function logicalInterpolationTypes(count: number): string {
  return `class C { string M() { return $"{a is T?[]?${' or T[]?[]'.repeat(count)}: d:x}"; } }`;
}

test('bounds binary conditions in typed guard alternatives', { timeout: 60_000 }, () => {
  const large = binaryGuardAlternativeForest(1000);
  expectBoundedGrowth(binaryGuardAlternativeForest(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(1002);
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(4);
  } finally {
    tree.delete();
  }
});

function binaryGuardAlternativeForest(count: number): string {
  return `class C { void M() { switch(x){case y when a is T?[]? ? 1 : ${'c == d ? [1] : '.repeat(count)}d is T?[]? ? b : d: break;} } }`;
}

test('bounds question-free stacked case guard prefixes', { timeout: 60_000 }, () => {
  const large = stackedCaseGuards(1000);
  expectBoundedGrowth(stackedCaseGuards(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('when_clause')).toHaveLength(1000);
  } finally {
    tree.delete();
  }
});

function stackedCaseGuards(count: number): string {
  return (
    'switch (x) { ' + Array.from({ length: count }, (_, index) => `case ${index} when ready: `).join('') + 'break; }'
  );
}

test('bounds repeated nullable type-pattern suffix proofs', { timeout: 60_000 }, () => {
  const large = nullablePatternSuffixes(1000);
  expectBoundedGrowth(nullablePatternSuffixes(100), large, false);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(1001);
    expect(tree.rootNode.descendantsOfType('array_type')).toHaveLength(1000);
  } finally {
    tree.delete();
  }
});

function nullablePatternSuffixes(count: number): string {
  return 'switch(x) { case y when a ? [1] : b is T?' + '[]?'.repeat(count) + ' and not null: break; }';
}

test('bounds alternating definite and conditional guard types', { timeout: 60_000 }, () => {
  expectBoundedGrowth(mixedDefiniteGuardSource(100), mixedDefiniteGuardSource(1000), false);
});

function mixedDefiniteGuardSource(count: number): string {
  return `class C{void M(){switch(x){case y when a is not T?[] && ${'a is T?[,] && a is T?[] && '.repeat(count)}b ? [1].Length : [2]${Array.from({ length: count + 1 }, (_, index) => ` : [${index + 3}]`).join('')}: break;}}}`;
}

test('bounds negated nullable-rank successors in case guards', { timeout: 60_000 }, () => {
  expectBoundedGrowth(negatedNullableRankSuccessors(100), negatedNullableRankSuccessors(1000));
});

function negatedNullableRankSuccessors(count: number): string {
  return `class C { void M() { switch (y) { case int when a is not T?${'[]?'.repeat(count)}[] is T?[]? : return; } } }`;
}

test('bounds repeated nullable-rank successors in a malformed case guard', { timeout: 60_000 }, () => {
  expectBoundedGrowth(repeatedRankSuccessors(100), repeatedRankSuccessors(1000), 'unchecked');
});

function repeatedRankSuccessors(count: number): string {
  return `switch(x){case y when ${'a is T?[] is U && a is T?[] ? [1] : b && '.repeat(count)}a ? [1] : b: break;}`;
}

test('bounds nullable relational suffix lookahead', { timeout: 60_000 }, () => {
  expectBoundedGrowth(nullableRelationalSource(100), nullableRelationalSource(1000), false);
});

function nullableRelationalSource(count: number): string {
  return `var result = x is T?[] ? [0] : ${'a as int? > '.repeat(count)}b ? [1] : [2];`;
}

test('bounds repeated collection arithmetic consequences after nullable types', { timeout: 60_000 }, () => {
  expectBoundedGrowth(collectionArithmeticConsequences(100), collectionArithmeticConsequences(1000), false);
});

function collectionArithmeticConsequences(count: number): string {
  return `var r = ${'value is T?[] ? [] + x : '.repeat(count)}fallback;`;
}

test('bounds incomplete nullable logical guard chains', { timeout: 60_000 }, () => {
  expectBoundedGrowth(incompleteLogicalGuard(100), incompleteLogicalGuard(1000), true);
});

function incompleteLogicalGuard(count: number): string {
  return `class C{void M(){switch(x){case y when a is T?[] && ${'b is U?[] && '.repeat(count - 1)}c is V?[]: L: break;}}}`;
}

test('bounds invalid nullable guard alternative chains', { timeout: 60_000 }, () => {
  expectBoundedGrowth(incompleteNullableGuardAlternatives(100), incompleteNullableGuardAlternatives(1000), true);
});

function incompleteNullableGuardAlternatives(count: number): string {
  return `class C { void M(object a, bool x) { switch(a) { case int when ${'a is int?[] ? x : '.repeat(count)}x: break; } } }`;
}

test('bounds repeated nullable ranks in ordinary type-test chains', { timeout: 60_000 }, () => {
  expectBoundedGrowth(ordinaryNullableChain(1000), ordinaryNullableChain(10_000), false);
});

function ordinaryNullableChain(count: number): string {
  return `var r = f(a is T?[] / a is T?${'[]?'.repeat(count)} is U ? [1] : b: L);`;
}

test('bounds nullable rank chains before conditional colons', { timeout: 60_000 }, () => {
  expectBoundedGrowth(nullableChainBeforeColon(1000), nullableChainBeforeColon(10_000), false);
});

function nullableChainBeforeColon(count: number): string {
  return `var r = x is T?[]?[] ? d : x ? [] || 1 is T?${'[]?'.repeat(count)} : e;`;
}

test('bounds nested nullable chains before binary conditional followers', { timeout: 60_000 }, () => {
  expectBoundedGrowth(nestedNullableBinaryFollower(1000), nestedNullableBinaryFollower(10_000), false);
});

function nestedNullableBinaryFollower(count: number): string {
  return `var r = x is T?[]?[] ? d : x ? [] || 1 is T?${'[]?'.repeat(count)} == y : e;`;
}

test('bounds repeated omitted stack allocation ranks', { timeout: 60_000 }, () => {
  expectBoundedGrowth(omittedStackAllocationRanks(100), omittedStackAllocationRanks(1000), false);
});

function omittedStackAllocationRanks(count: number): string {
  return `var r = stackalloc int?${'[]'.repeat(count)}[size];`;
}

test('bounds repeated nullable-rank arguments', { timeout: 60_000 }, () => {
  expectBoundedGrowth(repeatedSiblingRankSource(100), repeatedSiblingRankSource(1000), false);
});

function repeatedSiblingRankSource(count: number): string {
  const argumentsList = Array.from({ length: count }, () => 'a is T[]?[] ? [1] : c').join(', ');
  return `var r = flag ? x is T?[,] ? f(${argumentsList}) : a?[0] : end;`;
}

test('bounds enclosing rank retries behind unmatched parent ternaries', { timeout: 60_000 }, () => {
  expectBoundedGrowth(unmatchedParentRankSource(100), unmatchedParentRankSource(1000));
});

function unmatchedParentRankSource(count: number): string {
  return 'var r = f(' + 'a ? '.repeat(count) + 'g(x is T?[] ? [1] : c) ? '.repeat(count) + 'z);';
}

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
  ...[' ', '/* type */', '\n', '// type\n'].map((trivia) => ({
    name: `nullable-array-type-test ternaries with ${JSON.stringify(trivia)} before the question`,
    expression: (count: number): string => `a is T${trivia}?[] ? 1 : `.repeat(count) + '0',
  })),
];

const questionSources = [
  ...['@i', '"x"', "'x'", '@"x"', '$"x"', '$"{k}"'].map((index) => ({
    name: `literal and verbatim index ${index} access chains`,
    source: (count: number): string => `var x = a${`?[${index}]`.repeat(count)};`,
    node: 'conditional_access_expression',
  })),
  {
    name: 'null-forgiving invocation index access chains',
    source: (count: number): string => `var x = a${'?[f!()]'.repeat(count)};`,
    node: 'conditional_access_expression',
  },
  ...['$"x"', '$"{k}"', '$"{k::?x}"', '$"{(global::N.F()):?x}"'].map((index) => ({
    name: `question-free interpolated index ${index} inside an interpolation hole`,
    source: (count: number): string => `var x = $"{a${`?[${index}]`.repeat(count)}:X}";`,
    node: 'conditional_access_expression',
  })),
  ...['a is T?', 'a as T?', 'new T?[1]'].map((arm) => ({
    name: `nullable true arm ${arm}`,
    source: (count: number): string => `class C { void M() { var x = ${`c ? ${arm} : `.repeat(count)}0; } }`,
    node: 'nullable_type',
  })),
  ...[
    { name: 'call', arm: 'f(a ? 1 : 2)', node: 'invocation_expression' },
    { name: 'parenthesized', arm: '(a ? 1 : 2)', node: 'parenthesized_expression' },
    { name: 'index', arm: 'a[b ? 1 : 2]', node: 'element_access_expression' },
  ].map(({ name, arm, node }) => ({
    name: `${name} nested ternary arms`,
    source: (count: number): string => `class C { void M() { var x = ${`c ? ${arm} : `.repeat(count)}0; } }`,
    node,
  })),
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
    name: 'access chains after nullable interpolation holes',
    source: (count: number): string =>
      `var r = $"{(f(a?[0], x is null) ? f($"{x as int?:?foo}")${'?[0]'.repeat(count - 1)} : b):X}";`,
    node: 'conditional_access_expression',
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
  const large = source(2000);
  const tree = parser.parse(large)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType(node)).toHaveLength(2000);
  } finally {
    tree.delete();
  }
  expectBoundedGrowth(source(200), large, false);
});

interface ParseCpuSample {
  cpuMicroseconds: number;
  elapsedCpuMicroseconds: number;
  wallMilliseconds: number;
  iterations: number;
}

const MaxGrowth = 18;
// process.threadCpuUsage reports microseconds.
const MaxLargeMicroseconds = 5_000_000;

// Thread CPU time excludes competing test files and background compilation. The growth limit permits roughly n^1.25
// scaling across a tenfold input increase; the absolute limit also catches a uniformly slow parser.
function expectBoundedGrowth(small: string, large: string, expectedErrors: ErrorExpectation = true): void {
  const warmup = parseCpuTime(large, expectedErrors);
  const smallSamples: ParseCpuSample[] = [];
  const largeSamples: ParseCpuSample[] = [];
  let smallFastest = Infinity;
  let largeFastest = Infinity;
  // On macos-15-intel runners, the thread CPU time of an identical parse rises up to tenfold for seconds at a time.
  // Such noise only adds time, so further rounds bring the fastest samples closer to the real cost, while super-linear
  // growth slows every large sample and still fails after the last round.
  for (let round = 1; round <= 10; round++) {
    const smallSample = parseCpuTime(small, expectedErrors);
    const largeSample = parseCpuTime(large, expectedErrors);
    smallSamples.push(smallSample);
    largeSamples.push(largeSample);
    smallFastest = Math.min(smallFastest, smallSample.cpuMicroseconds);
    largeFastest = Math.min(largeFastest, largeSample.cpuMicroseconds);
    if (round >= 3 && largeFastest / smallFastest < MaxGrowth && largeFastest < MaxLargeMicroseconds) return;
  }
  const samples = JSON.stringify({ warmup, smallSamples, largeSamples });
  expect(largeFastest / smallFastest, samples).toBeLessThan(MaxGrowth);
  expect(largeFastest, samples).toBeLessThan(MaxLargeMicroseconds);
}

function parseCpuTime(source: string, expectedErrors: ErrorExpectation = true): ParseCpuSample {
  const wallStart = performance.now();
  const start = process.threadCpuUsage();
  let samples = 0;
  let elapsed = 0;
  let allMatchErrors = true;
  // Short parses can take less than one CPU timer tick on Linux ARM. Measure a batch before averaging.
  do {
    const tree = parser.parse(source);
    if (!tree) throw new Error('The parser returned no tree');
    allMatchErrors &&= expectedErrors === 'unchecked' || tree.rootNode.hasError === expectedErrors;
    tree.delete();
    samples++;
    const { system, user } = process.threadCpuUsage(start);
    elapsed = system + user;
  } while (elapsed < 50_000);
  const wallMilliseconds = performance.now() - wallStart;
  expect(allMatchErrors).toBe(true);
  return {
    cpuMicroseconds: elapsed / samples,
    elapsedCpuMicroseconds: elapsed,
    wallMilliseconds,
    iterations: samples,
  };
}

test.each(
  [
    { name: 'regular', open: '$"{', close: '}"' },
    { name: 'verbatim', open: '$@"{', close: '}"' },
    { name: 'raw', open: '$$"""{{', close: '}}"""' },
  ].flatMap((interpolation) =>
    [100, 5000].flatMap((depth) =>
      ['a ? 1 : ', 'x is T?[] ? [a] : '].map((prefix) => ({ ...interpolation, depth, prefix }))
    )
  )
)(
  'preserves supported $name nesting at depth $depth after $prefix and recovers after scanner-depth stress',
  ({ open, close, depth, prefix }) => {
    const nested = open.repeat(depth) + '1' + close.repeat(depth);
    assertDeepParsingKeepsRuntimeUsable(`${prefix}${nested}`, 'interpolated_string_expression', depth, depth === 100);
  }
);

test.each([
  { name: 'generic', open: 'L<', close: '>', node: 'generic_name', clean: true },
  { name: 'tuple', open: '(', close: ', int)', node: 'tuple_type', clean: true },
  { name: 'function pointer', open: 'delegate*<', close: ', void>', node: 'function_pointer_type', clean: false },
])('preserves deeply nested $name types in question-role lookahead', ({ open, close, node, clean }) => {
  const type = open.repeat(5000) + 'int' + close.repeat(5000);
  const isType = node === 'tuple_type' ? `${type}[]` : type;
  for (const expression of [`a is ${isType}? ? 1 : 2`, `x is T?[] ? [1] : a as ${type}? ? [1] : b`]) {
    assertDeepParsingKeepsRuntimeUsable(expression, node, 5000, clean);
  }
});

function assertDeepParsingKeepsRuntimeUsable(expression: string, node: string, depth: number, clean: boolean): void {
  const source = `class C { void M() { var result = ${expression}; } }`;
  const tree = parser.parse(source)!;
  try {
    const nestedNodes = tree.rootNode.descendantsOfType(node);
    if (node === 'interpolated_string_expression' && !clean) {
      // Serialized interpolation state cannot represent 5000 levels; recovery must retain substantial nested syntax.
      expect(nestedNodes.length).toBeGreaterThanOrEqual(100);
    } else {
      expect(nestedNodes).toHaveLength(depth);
    }
    if (clean) expect(tree.rootNode.hasError).toBe(false);
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

test('releases long nullable-array conditional chains without poisoning the runtime', () => {
  const count = 5000;
  const statement = `var result = ${'a is T?[] ? 1 : '.repeat(count)}0;`;
  for (const source of [statement, `class C { void M() { ${statement} } }`]) {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(count);
    } finally {
      tree.delete();
    }
  }
  const subsequent = parser.parse('var result = a?[0];')!;
  try {
    expect(subsequent.rootNode.hasError).toBe(false);
    expect(subsequent.rootNode.descendantsOfType('conditional_access_expression')[0]?.text).toBe('a?[0]');
  } finally {
    subsequent.delete();
  }
});

test('preserves deeply nested conditional operands without exhausting the scanner stack', () => {
  const depth = 5000;
  for (const [prefix, alternatives, count] of [
    ['a ? ', ': d', depth + 1],
    ['a as T? b ? ', ': d : d', depth * 2 + 1],
  ] as const) {
    const expression = `x is T?[] ? [1] : ${prefix.repeat(depth)}c${alternatives.repeat(depth)}`;
    assertDeepParsingKeepsRuntimeUsable(expression, 'conditional_expression', count, true);
  }
});

test('recovers from deeply incomplete conditional operands without poisoning the runtime', () => {
  const tree = parser.parse(`var result = flag ? x is T?[]?[0] : ${'a ? b ? '.repeat(20_000)}c : d;`)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
  } finally {
    tree.delete();
  }
  const subsequent = parser.parse('var result = a?[0];')!;
  try {
    expect(subsequent.rootNode.hasError).toBe(false);
    expect(subsequent.rootNode.descendantsOfType('conditional_access_expression')[0]!.text).toBe('a?[0]');
  } finally {
    subsequent.delete();
  }
});

test.each([
  { operator: '&&', completeGuard: false },
  { operator: '||', completeGuard: false },
  { operator: '&&', completeGuard: true },
  { operator: '||', completeGuard: true },
])(
  'bounds repeated type-operator guards $operator / $completeGuard',
  { timeout: 60_000 },
  ({ operator, completeGuard }) => {
    const source = (count: number): string =>
      `switch (x) { case y when ${`a is T?[] is T ${operator} `.repeat(count)}a ? [1] : b:${completeGuard ? Array.from({ length: count }, (_, index) => ` L${index}:`).join('') : ''} break; }`;
    expectBoundedGrowth(source(100), source(1000), completeGuard ? false : 'unchecked');
    if (!completeGuard) return;
    const text = source(1000);
    const tree = parser.parse(text)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('nullable_type')).toHaveLength(0);
      expect(tree.rootNode.descendantsOfType('is_pattern_expression')).toHaveLength(2000);
      expect(tree.rootNode.descendantsOfType('labeled_statement')).toHaveLength(0);
      const conditionals = tree.rootNode.descendantsOfType('conditional_expression');
      expect(conditionals).toHaveLength(1001);
      const outer = conditionals[0]!;
      expect(outer.childForFieldName('condition')!.endIndex).toBe(text.indexOf('?[]'));
      expect(outer.childForFieldName('consequence')!.startIndex).toBe(text.indexOf('?[]') + 1);
      expect(outer.childForFieldName('alternative')!.text).toBe('L999');
      expect(conditionals.at(-1)!.childForFieldName('condition')!.text).toBe(`[] is T ${operator} a`);
      expect(conditionals.at(-1)!.childForFieldName('consequence')!.text).toBe('[1]');
      expect(conditionals.at(-1)!.childForFieldName('alternative')!.text).toBe('b');
    } finally {
      tree.delete();
    }
  }
);

test('bounds repeated added nullable suffixes before later type operators', { timeout: 60_000 }, () => {
  expectBoundedGrowth(addedSuffixGuardSource(100), addedSuffixGuardSource(1000), false);
  const tree = parser.parse(addedSuffixGuardSource(1000))!;
  try {
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(2);
    expect(tree.rootNode.descendantsOfType('labeled_statement')).toHaveLength(0);
    expect(tree.rootNode.lastNamedChild?.text).toBe('var following = a?[0];');
    expect(tree.rootNode.lastNamedChild?.hasError).toBe(false);
  } finally {
    tree.delete();
  }
});

function addedSuffixGuardSource(count: number): string {
  return `switch(x){case y when ${'a is T?[]? is U && '.repeat(count)}a ? [1] : b is V?[]: L: break;} var following = a?[0];`;
}

test.each([
  { name: 'AS then nullable IS then AS', term: 'a as T?[] is T?[] as U && ', errors: 'unchecked' as const },
  {
    name: 'scalar logical patterns',
    term: 'a is T?[] as U || a is T? and not null || ',
    errors: 'unchecked' as const,
  },
  {
    name: 'array logical patterns',
    term: 'a is T?[] as U || a is T?[] and not null || ',
    errors: 'unchecked' as const,
  },
  {
    name: 'coalescing IS/AS operands',
    term: 'a as T ?? ',
    prefix: 'z is T?[] ?? ',
    suffix: 'a is T?[] ?? ',
    labels: ': L0: L1',
    conditionals: 3,
  },
])(
  'bounds mixed nullable operands with $name',
  { timeout: 60_000 },
  ({ term, prefix = '', suffix = '', labels = '', conditionals, errors = false }) => {
    const source = (count: number): string =>
      `switch(x){case y when ${prefix}${term.repeat(count)}${suffix}a ? [1] : b${labels}: break;} var following = a?[0];`;
    expectBoundedGrowth(source(100), source(1000), errors);
    if (errors === 'unchecked') return;
    const tree = parser.parse(source(1000))!;
    try {
      if (conditionals !== undefined) {
        expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(conditionals);
        expect(tree.rootNode.descendantsOfType('labeled_statement')).toHaveLength(0);
      }
      expect(tree.rootNode.descendantsOfType('break_statement').map((node) => node.text)).toEqual(['break;']);
      expect(tree.rootNode.lastNamedChild?.text).toBe('var following = a?[0];');
      expect(tree.rootNode.lastNamedChild?.hasError).toBe(false);
    } finally {
      tree.delete();
    }
  }
);

test.each([
  { name: 'member access', term: 'a is T?[] is U && a?.b && ', labels: false, body: 'break;', conditionals: 1 },
  {
    name: 'nested conditionals',
    term: 'a is T?[] is U && (c ? d : e) && ',
    labels: false,
    body: 'break;',
    conditionals: 1001,
  },
  { name: 'as operators and labels', term: 'a is T?[] as U && ', labels: true, body: 'break;', conditionals: 1001 },
  {
    name: 'declaration after guard',
    term: 'a is T?[] is U && a?.b && ',
    labels: false,
    body: 'var r=a ? b : c; break;',
    conditionals: 2,
  },
  { name: 'partial obligations', term: 'a is T?[] is U && ', labels: 'half', body: 'break;', conditionals: 501 },
])('bounds mixed type-operator guards: $name', { timeout: 60_000 }, ({ term, labels, body, conditionals }) => {
  const source = (count: number): string =>
    `switch(x){case y when ${term.repeat(count)}a ? [1] : b:${labels ? Array.from({ length: labels === 'half' ? Math.floor(count / 2) : count }, (_, index) => ` L${index}:`).join('') : ''} ${body}}`;
  expectBoundedGrowth(source(100), source(1000), labels === true ? false : 'unchecked');
  if (labels !== true) return;
  const tree = parser.parse(source(1000))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('is_pattern_expression')).toHaveLength(term.includes(' is U') ? 2000 : 1000);
    expect(tree.rootNode.descendantsOfType('as_expression')).toHaveLength(term.includes(' as U') ? 1000 : 0);
    expect(tree.rootNode.descendantsOfType('break_statement')).toHaveLength(1);
    expect(tree.rootNode.descendantsOfType('conditional_expression')).toHaveLength(conditionals);
    expect(tree.rootNode.descendantsOfType('labeled_statement')).toHaveLength(0);
  } finally {
    tree.delete();
  }
});

test.each(['call', 'array', 'collection'])(
  'parses long %s lists of relational comparisons in linear time',
  { timeout: 60_000 },
  (context) => {
    const source = (count: number): string => {
      const comparisons = Array.from({ length: count }, (_, index) => `a${index} < b${index}`).join(', ');
      const expression =
        context === 'call' ? `N(${comparisons})` : context === 'array' ? `new[] {${comparisons}}` : `[${comparisons}]`;
      return `class C { void M() { var result = ${expression}; } }`;
    };
    const large = source(2000);
    expectBoundedGrowth(source(200), large, false);
    const tree = parser.parse(large)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.descendantsOfType('binary_expression')).toHaveLength(2000);
      expect(tree.rootNode.descendantsOfType('cast_expression')).toHaveLength(0);
    } finally {
      tree.delete();
    }
  }
);

test.each([254, 255])('retains %i nested interpolation states and parser reuse', (depth) => {
  assertDeepParsingKeepsRuntimeUsable(
    '$"{'.repeat(depth) + 'a' + '}"'.repeat(depth),
    'interpolated_string_expression',
    depth,
    true
  );
});

test.each(['var r = $"{(a, f(b, (c +\n', 'var r = $"{(a?[0], f(b, $"{(c\n'])(
  'recovers from repeated unterminated interpolation holes %j in linear time',
  { timeout: 60_000 },
  (line) => {
    expectBoundedGrowth(
      `class C { void M() {\n${line.repeat(500)}} }`,
      `class C { void M() {\n${line.repeat(5000)}} }`
    );
  }
);
