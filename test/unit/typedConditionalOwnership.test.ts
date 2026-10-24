import { Language, type Node, Parser, Query } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { ownershipSamples } from '../fixtures/typedConditionalOwnership';
import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

interface AllocationSample {
  source: string;
  type: string;
  rank: string;
  header: boolean;
}

interface LambdaFields {
  type: string;
  parameters: string;
  body: string;
  bodyType: string;
}

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test(
  'preserves typed conditional fields, ranges and captures across local edits',
  // Every fixture sample is parsed fresh and incrementally in both orders, which exceeds five seconds on the Intel CI runner.
  { timeout: 30_000 },
  () => {
    const parser = new Parser().setLanguage(language);
    const query = new Query(
      language,
      '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
    );
    const fields = ['condition', 'consequence', 'alternative'];
    let previous = 'var r = 0;';
    let tree = parser.parse(previous)!;
    try {
      for (const sample of [...ownershipSamples, ...ownershipSamples.toReversed()]) {
        const fresh = parser.parse(sample.source)!;
        editTree(tree, previous, sample.source);
        const incremental = parser.parse(sample.source, tree)!;
        try {
          expect(fresh.rootNode.hasError, sample.source).toBe(false);
          expect(
            fresh.rootNode.descendantsOfType('conditional_expression').map((node) =>
              fields.map((field) => {
                const child = node.childForFieldName(field)!;
                return [child.startIndex, child.endIndex];
              })
            ),
            sample.source
          ).toEqual(sample.ranges);
          const expected = sample.ranges
            .flatMap((ranges) => ranges.map(([start, end], index) => `${fields[index]}:${start}:${end}`))
            .toSorted();
          expect(ownershipCaptures(query, fresh.rootNode), sample.source).toEqual(expected);
          expect(ownershipCaptures(query, incremental.rootNode), sample.source).toEqual(expected);
          expect(syntaxSnapshot(incremental.rootNode), sample.source).toEqual(syntaxSnapshot(fresh.rootNode));
        } finally {
          fresh.delete();
          tree.delete();
          tree = incremental;
          previous = sample.source;
        }
      }
    } finally {
      tree.delete();
      query.delete();
      parser.delete();
    }
  }
);

test('retains explicit nullable ref lambda return types and their complete bodies', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const qualifier of ['ref', 'ref readonly']) {
      for (const returnType of ['T?', 'int?', 'G<A>?']) {
        const source = `var r = f(${qualifier} ${returnType} (k) => a ? [1] : c, y);`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          const lambdas = tree.rootNode.descendantsOfType('lambda_expression');
          expect(lambdas, source).toHaveLength(1);
          const lambda = lambdas[0]!;
          const type = lambda.childForFieldName('type')!;
          expect(type.type, source).toBe('ref_type');
          expect(type.text, source).toBe(`${qualifier} ${returnType}`);
          const inner = type.childForFieldName('type')!;
          expect(inner.type, source).toBe('nullable_type');
          expect(inner.text, source).toBe(returnType);
          expect(lambda.childForFieldName('parameters')?.text, source).toBe('(k)');
          const body = lambda.childForFieldName('body')!;
          expect(body.type, source).toBe('conditional_expression');
          expect(
            ['condition', 'consequence', 'alternative'].map((field) => body.childForFieldName(field)?.text),
            source
          ).toEqual(['a', '[1]', 'c']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable creation types around parenthesized arguments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?', 'int[]?', 'G<int>?', '(int, int)?']) {
      for (const argument of ['', 'f(a ? 1 : 2)', '(a ? 1 : 2)', 'a?[b ? 0 : 1]']) {
        const source = `var r = new ${type}(${argument});`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
            source
          ).toEqual([type]);
          expect(
            tree.rootNode
              .descendantsOfType('conditional_expression')
              .map((node) => node.childForFieldName('condition')?.text),
            source
          ).toEqual(argument.includes('a ?') ? ['a'] : argument.includes('b ?') ? ['b'] : []);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable stack allocation ranks inside conditional alternatives', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of [
      'var r = (flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end);',
      '$"{(flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end)}";',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const allocations = tree.rootNode.descendantsOfType('stackalloc_expression');
        expect(allocations, source).toHaveLength(1);
        const type = allocations[0]!.childForFieldName('type')!;
        expect(type.type, source).toBe('array_type');
        expect(type.text, source).toBe('int?[2]');
        expect(type.childForFieldName('rank')?.text, source).toBe('[2]');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('invalidates incomplete enclosing-rank context after tail edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
  );
  const prefix = 'var r = f(' + 'a ? '.repeat(3) + 'g(x is T?[] ? [1] : c) ? '.repeat(3) + 'z';
  const malformed = prefix + '); class Following {}';
  const corrected = prefix + ' : 0'.repeat(6) + '); class Following {}';
  let previous = corrected;
  let tree = parser.parse(previous)!;
  try {
    for (const source of [malformed, corrected, malformed, corrected]) {
      const fresh = parser.parse(source)!;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(source === malformed);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(
          ownershipCaptures(query, fresh.rootNode)
        );
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex, node.hasError]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length, false]]);
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('invalidates invocation ownership proof after future argument and enclosing edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
  );
  const target = 'a is T[]?[] ? [1] : c';
  const base = `var r = flag ? x is T?[,] ? f(${target}, ${target}, ${target}) : a?[0] : end; class Following {}`;
  const changed = [
    base.replace(`${target})`, 'y=>y)'),
    base.replace(': a?[0] : end', ': a : end'),
    base.replace('x is T?[,] ?', 'x ?'),
    base.replace(`${target})`, 'from y in ys orderby y, y.Q select y)'),
  ];
  let previous = base;
  let tree = parser.parse(previous)!;
  try {
    for (const source of changed.flatMap((source) => [source, base])) {
      const fresh = parser.parse(source)!;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(
          ownershipCaptures(query, fresh.rootNode)
        );
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length]]);
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('preserves conditional ownership across distant alternative edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
  );
  const part = 'x ? a?[0] : G<B,C> ? a : d ? [b] : ';
  const base = '/*🙂*/ var r = ' + part.repeat(67) + 'c; class Following {}';
  const middle = base.indexOf(part, '/*🙂*/ var r = '.length + 33 * part.length);
  const last = base.lastIndexOf('d ? [b] :');
  const changed = [
    base.slice(0, middle) + part.replace('d ? [b] :', 'd ? b :') + base.slice(middle + part.length),
    base.slice(0, last) + base.slice(last).replace('d ? [b] :', 'd ? b :'),
    base.replace('c; class Following', 'c : z; class Following'),
    base.replace('c; class Following', 'from q in xs select q; class Following'),
  ];
  let previous = base;
  let tree = parser.parse(previous)!;
  try {
    for (const source of changed.flatMap((source) => [source, base])) {
      const fresh = parser.parse(source)!;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(
          ownershipCaptures(query, fresh.rootNode)
        );
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length]]);
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('preserves complete stack allocation types and nullable lambda headers through edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(lambda_expression type: (_) @return) (stackalloc_expression type: (_) @allocation)'
  );
  const deepType = 'G<T?>?[]?[a?[0]]';
  const samples = [
    typedAllocationSample('int?*[a?[0]][b]', '[b]'),
    typedAllocationSample('G<T?>?[]?[a?[0]]', '[a?[0]]'),
    typedAllocationSample('G<T?[a?[0]]>[b?[0]]', '[b?[0]]'),
    typedAllocationSample('G<T[a?[0] + b?[0]]>?[z]', '[z]'),
    typedAllocationSample('G<T[a?[b?[0]]]>?[z]', '[z]'),
    {
      source: 'class C { void M() { switch (v) { case 1 when a ? stackalloc int?[2]?*[1] ? [1] : c : b: break; } } }',
      type: 'int?[2]?*[1] ? [1]',
      rank: '[1]',
      header: false,
    },
    {
      source: `var r = flag ? ${'f('.repeat(506)}f(T? (k) => f(x is A, stackalloc ${deepType}))${')'.repeat(506)} : end;`,
      type: deepType,
      rank: '[a?[0]]',
      header: true,
    },
  ];
  const following = 'class Following { int Value => 1; }';
  let previous = 'var r = 0;';
  let tree = parser.parse(previous)!;
  try {
    for (const sample of [...samples, ...samples.toReversed()]) {
      const source = `/* 日本語? */ ${sample.source} ${following}`;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        const expected = expectAllocationFields(fresh.rootNode, source, sample.type, sample.rank, sample.header);
        expect(ownershipCaptures(query, fresh.rootNode), source).toEqual(expected);
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(expected);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const declaration = fresh.rootNode
          .descendantsOfType('class_declaration')
          .find((node) => node.text === following)!;
        expect(declaration.parent?.type, source).toBe('compilation_unit');
        expect([declaration.startIndex, declaration.endIndex], source).toEqual([
          source.lastIndexOf(following),
          source.length,
        ]);
      } finally {
        tree.delete();
        tree = incremental;
        fresh.delete();
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('preserves nested and block lambda return fields through edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(lambda_expression type: (_) @return parameters: (_) @parameters body: (_) @body)'
  );
  const samples = [
    {
      source: 'var r = list.Select(Foo? (Foo x) => x.Items.Select(Bar? (Bar y) => y.Next));',
      fields: [
        {
          type: 'Foo?',
          parameters: '(Foo x)',
          body: 'x.Items.Select(Bar? (Bar y) => y.Next)',
          bodyType: 'invocation_expression',
        },
        { type: 'Bar?', parameters: '(Bar y)', body: 'y.Next', bodyType: 'member_access_expression' },
      ],
    },
    {
      source: 'var r = g(Foo? (k) => { return a?[0] is Foo? ? x : a?[0]; });',
      fields: [{ type: 'Foo?', parameters: '(k)', body: '{ return a?[0] is Foo? ? x : a?[0]; }', bodyType: 'block' }],
    },
  ];
  const following = 'class Following { int Value => 1; }';
  let previous = 'var r = 0;';
  let tree = parser.parse(previous)!;
  try {
    for (const sample of [...samples, ...samples.toReversed()]) {
      const source = `/* 日本語? */ ${sample.source} ${following}`;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      const fresh = parser.parse(source)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(false);
        const expected = expectLambdaFields(fresh.rootNode, source, sample.fields);
        expect(ownershipCaptures(query, fresh.rootNode), source).toEqual(expected);
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(expected);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        const declaration = fresh.rootNode
          .descendantsOfType('class_declaration')
          .find((node) => node.text === following)!;
        expect(declaration.parent?.type, source).toBe('compilation_unit');
        expect(declaration.startIndex, source).toBe(source.lastIndexOf(following));
      } finally {
        tree.delete();
        tree = incremental;
        fresh.delete();
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

function expectLambdaFields(root: Node, source: string, expected: readonly LambdaFields[]): string[] {
  const lambdas = root.descendantsOfType('lambda_expression');
  expect(lambdas, source).toHaveLength(expected.length);
  const captures: string[] = [];
  for (const [index, fields] of expected.entries()) {
    const lambda = lambdas[index]!;
    expect(lambda.childForFieldName('type')?.type, source).toBe('nullable_type');
    expect(lambda.childForFieldName('parameters')?.type, source).toBe('parameter_list');
    expect(lambda.childForFieldName('body')?.type, source).toBe(fields.bodyType);
    for (const field of ['type', 'parameters', 'body'] as const) {
      const node = lambda.childForFieldName(field)!;
      const text = fields[field];
      const start = source.indexOf(text, lambda.startIndex);
      expect([node.text, node.startIndex, node.endIndex], source).toEqual([text, start, start + text.length]);
      captures.push(`${field === 'type' ? 'return' : field}:${start}:${start + text.length}`);
    }
  }
  return captures.toSorted();
}

function typedAllocationSample(type: string, rank: string): AllocationSample {
  return { source: `var r = f(T? (k) => f(x is A, stackalloc ${type}));`, type, rank, header: true };
}

function expectAllocationFields(root: Node, source: string, type: string, rank: string, header: boolean): string[] {
  const allocations = root.descendantsOfType('stackalloc_expression');
  expect(allocations, source).toHaveLength(1);
  const allocation = allocations[0]!;
  const start = source.indexOf(`stackalloc ${type}`);
  expect([allocation.text, allocation.startIndex, allocation.endIndex], source).toEqual([
    `stackalloc ${type}`,
    start,
    start + 'stackalloc '.length + type.length,
  ]);
  const field = allocation.childForFieldName('type')!;
  expect([field.type, field.text, field.childForFieldName('rank')?.text], source).toEqual(['array_type', type, rank]);
  expect(field.childForFieldName('type')?.text, source).toBe(type.slice(0, -rank.length).trimEnd());
  const expected = [`allocation:${start + 'stackalloc '.length}:${start + 'stackalloc '.length + type.length}`];
  const lambdas = root.descendantsOfType('lambda_expression');
  expect(lambdas, source).toHaveLength(header ? 1 : 0);
  if (header) {
    const lambda = lambdas[0]!;
    expect([lambda.childForFieldName('type')?.type, lambda.childForFieldName('type')?.text], source).toEqual([
      'nullable_type',
      'T?',
    ]);
    expect(lambda.childForFieldName('parameters')?.text, source).toBe('(k)');
    expect(lambda.childForFieldName('body')?.type, source).toBe('invocation_expression');
    const position = source.indexOf('T? (k)');
    expected.push(`return:${position}:${position + 2}`);
  }
  return expected.toSorted();
}

function ownershipCaptures(query: Query, node: Node): string[] {
  return query
    .captures(node)
    .map(({ name, node: captured }) => `${name}:${captured.startIndex}:${captured.endIndex}`)
    .toSorted();
}
